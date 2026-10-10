"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { otomasiSetting } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { jalankanOtomasi } from "@/lib/otomasi";
import { cronSah } from "@/lib/domain/cron-teks";
import type { StateForm } from "@/components/form-aksi";

/**
 * Simpan pengaturan otomasi. Parameter dibaca mengikuti tipe nilai lama:
 * angka → angka, boolean → centang, daftar angka → "30,14,7", daftar teks → centang ganda.
 */
export async function simpanOtomasi(kode: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const [s] = await db.select().from(otomasiSetting).where(eq(otomasiSetting.kode, kode));
  if (!s) return { error: "Otomasi tidak ditemukan" };
  const jadwalCron = s.jadwalCron.startsWith("event:") ? s.jadwalCron : String(f.get("jadwalCron") ?? "").trim();
  if (!s.jadwalCron.startsWith("event:") && !cronSah(jadwalCron)) return { error: "Format jadwal harus 5 kolom cron, mis. 0 9 * * *" };
  const lama = (s.parameter ?? {}) as Record<string, unknown>;
  const parameter: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(lama)) {
    const isian = f.get(`p_${k}`);
    if (typeof v === "boolean") parameter[k] = isian === "on";
    else if (typeof v === "number") {
      const n = Number(String(isian ?? "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return { error: `Nilai ${k} tidak valid` };
      parameter[k] = n;
    } else if (Array.isArray(v) && (v.length === 0 ? f.has(`p_${k}_teks`) : typeof v[0] === "string")) parameter[k] = f.getAll(`p_${k}`).map(String);
    else if (Array.isArray(v)) {
      const arr = String(isian ?? "")
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (arr.some((x) => !Number.isFinite(x) || x < 0)) return { error: `Daftar ${k} tidak valid` };
      parameter[k] = [...new Set(arr)].sort((a, b) => b - a);
    } else parameter[k] = v;
  }
  const penerima = f.has("penerima")
    ? String(f.get("penerima"))
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
    : s.penerima;
  if (penerima.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { error: "Email penerima tidak valid" };
  await db
    .update(otomasiSetting)
    .set({ aktif: f.get("aktif") === "on", jadwalCron, parameter, penerima, diubahOleh: user.id })
    .where(eq(otomasiSetting.kode, kode));
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "otomasi_setting", recordId: kode, detail: { jadwalCron, parameter, penerima } });
  revalidatePath("/otomasi");
  return { ok: "Pengaturan disimpan" };
}

export async function jalankanSekarang(kode: string): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const h = await jalankanOtomasi(kode, { paksa: true });
  await catatAudit({ userId: user.id, aksi: "jalankan_otomasi", tabel: "otomasi_setting", recordId: kode });
  revalidatePath("/otomasi");
  return h.ok ? { ok: h.ringkasan } : { error: h.pesan };
}
