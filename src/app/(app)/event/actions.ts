"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { eventBagiHasil, polis } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { parsePersen } from "@/lib/format";
import type { StateForm } from "@/components/form-aksi";

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function bacaEvent(f: FormData) {
  return z
    .object({
      nama: z.string().min(3, "Nama event wajib diisi"),
      tglMulai: z.string().date("Isi tanggal mulai"),
      tglSelesai: z.string().date("Isi tanggal selesai"),
      tambahanKomisiPersen: z
        .number({ invalid_type_error: "Isi % tambahan komisi sales" })
        .gt(0, "Tambahan komisi harus lebih dari 0%")
        .max(200, "Tambahan komisi maks 200%"),
      berlakuUntuk: z.enum(["semua", "fulltime", "freelance", "pilihan"]),
      salesIds: z.array(z.string()),
    })
    .refine((x) => x.tglSelesai >= x.tglMulai, { message: "Tanggal selesai harus setelah tanggal mulai" })
    .refine((x) => x.berlakuUntuk !== "pilihan" || x.salesIds.length > 0, { message: "Pilih minimal satu sales" })
    .transform((x) => ({ ...x, salesIds: x.berlakuUntuk === "pilihan" ? x.salesIds : [] }))
    .safeParse({
      nama: teks(f, "nama"),
      tglMulai: teks(f, "tglMulai"),
      tglSelesai: teks(f, "tglSelesai"),
      tambahanKomisiPersen: teks(f, "tambahanKomisiPersen") ? parsePersen(teks(f, "tambahanKomisiPersen")) : undefined,
      berlakuUntuk: teks(f, "berlakuUntuk") || "semua",
      salesIds: f.getAll("salesIds").map(String),
    });
}

export async function buatEvent(_: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("owner");
  const d = bacaEvent(f);
  if (!d.success) return { error: d.error.issues[0]?.message };
  const [e] = await db.insert(eventBagiHasil).values(d.data).returning({ id: eventBagiHasil.id });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "event_bagi_hasil", recordId: e.id, detail: d.data });
  revalidatePath("/event");
  return { ok: "Event dibuat" };
}

/**
 * Ubah event. Polis yang sudah disetujui tidak berubah (% kantor & komisinya sudah
 * disalin ke polis); perubahan berlaku untuk persetujuan berikutnya.
 */
export async function ubahEvent(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("owner");
  const d = bacaEvent(f);
  if (!d.success) return { error: d.error.issues[0]?.message };
  await db.update(eventBagiHasil).set(d.data).where(eq(eventBagiHasil.id, id));
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "event_bagi_hasil", recordId: id, detail: d.data });
  revalidatePath("/event");
  return { ok: "Event diperbarui. Polis yang sudah disetujui tetap memakai angka lamanya." };
}

/** Hapus event yang belum dipakai polis; yang sudah dipakai hanya bisa dinonaktifkan. */
export async function hapusEvent(id: string): Promise<StateForm> {
  const { user } = await wajibLogin("owner");
  const [{ n }] = await db.select({ n: count() }).from(polis).where(eq(polis.eventId, id));
  if (n > 0) return { error: `Event sudah dipakai ${n} polis, tidak bisa dihapus. Nonaktifkan saja agar tidak berlaku lagi.` };
  await db.delete(eventBagiHasil).where(eq(eventBagiHasil.id, id));
  await catatAudit({ userId: user.id, aksi: "hapus", tabel: "event_bagi_hasil", recordId: id });
  revalidatePath("/event");
  return { ok: "Event dihapus" };
}

export async function ubahAktifEvent(id: string, aktif: boolean) {
  const { user } = await wajibLogin("owner");
  await db.update(eventBagiHasil).set({ aktif }).where(eq(eventBagiHasil.id, id));
  await catatAudit({ userId: user.id, aksi: aktif ? "aktifkan" : "nonaktifkan", tabel: "event_bagi_hasil", recordId: id });
  revalidatePath("/event");
}
