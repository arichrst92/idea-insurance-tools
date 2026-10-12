"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nasabah, users } from "@/db/schema";
import { cabutSemuaSesi, wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { alihkanNasabah } from "@/lib/pengalihan";
import type { StateForm } from "@/components/form-aksi";
import { penjualSql } from "@/lib/peran";

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Nonaktifkan sales: wajib alasan & tanggal, semua nasabahnya dialihkan
 * (default ke satu sales, bisa per nasabah), lalu semua sesi login dicabut.
 */
export async function nonaktifkanSales(salesId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("owner");
  if (salesId === user.id) return { error: "Tidak bisa menonaktifkan akun sendiri" };
  const [s] = await db.select().from(users).where(eq(users.id, salesId));
  if (!s || !s.aktif) return { error: "Sales tidak ditemukan atau sudah nonaktif" };

  const tgl = teks(f, "tglNonaktif");
  const alasan = teks(f, "alasan");
  if (!tgl) return { error: "Isi tanggal nonaktif" };
  if (alasan.length < 3) return { error: "Isi alasan nonaktif" };
  const komisiIkut = f.get("komisiIkut") === "on";
  const bawaan = teks(f, "keSalesId");

  const milik = await db.select({ id: nasabah.id }).from(nasabah).where(eq(nasabah.salesId, salesId));
  const tujuan = new Map<string, string>();
  for (const n of milik) {
    const ke = teks(f, `ke_${n.id}`) || bawaan;
    if (!ke) return { error: "Semua nasabah harus dialihkan ke sales lain sebelum menyimpan" };
    tujuan.set(n.id, ke);
  }

  const tujuanUnik = [...new Set(tujuan.values())];
  if (tujuanUnik.includes(salesId)) return { error: "Tujuan pengalihan tidak boleh sales yang sama" };
  for (const ke of tujuanUnik) {
    const [ok] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, ke), penjualSql(), eq(users.aktif, true)));
    if (!ok) return { error: "Sales tujuan tidak aktif" };
  }

  let totalPolis = 0;
  await db.transaction(async (tx) => {
    for (const [nasabahId, keSalesId] of tujuan) {
      const { polisDipindah } = await alihkanNasabah(tx, { nasabahId, dariSalesId: salesId, keSalesId, komisiIkut, oleh: user.id });
      totalPolis += polisDipindah;
    }
    await tx.update(users).set({ aktif: false, tglNonaktif: tgl, alasanNonaktif: alasan }).where(eq(users.id, salesId));
  });
  await cabutSemuaSesi(salesId);
  await catatAudit({
    userId: user.id,
    aksi: "nonaktifkan",
    tabel: "users",
    recordId: salesId,
    detail: { tgl, alasan, nasabah: tujuan.size, polis: totalPolis, komisiIkut },
  });
  revalidatePath("/sales");
  redirect(`/sales/${salesId}?nonaktif=${tujuan.size}`);
}

export async function aktifkanSales(salesId: string) {
  const { user } = await wajibLogin("owner");
  await db.update(users).set({ aktif: true, tglNonaktif: null, alasanNonaktif: null }).where(eq(users.id, salesId));
  await catatAudit({ userId: user.id, aksi: "aktifkan", tabel: "users", recordId: salesId });
  revalidatePath("/sales");
  revalidatePath(`/sales/${salesId}`);
}
