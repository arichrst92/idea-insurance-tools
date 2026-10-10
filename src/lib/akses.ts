import "server-only";
import { notFound } from "next/navigation";
import { and, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, nasabah, polis, type User } from "@/db/schema";

// Aturan akses data: admin melihat semua; sales hanya nasabah miliknya
// (dan kendaraan/dokumen/polis dari nasabah itu).

export function filterNasabah(user: User): SQL | undefined {
  return user.role === "admin" ? undefined : eq(nasabah.salesId, user.id);
}

/** Dokumen polis yang memuat angka dari asuransi (cashback/komisi agen): hanya admin. */
export const DOK_KHUSUS_ADMIN: string[] = ["penawaran", "bukti_cair_asuransi"];

/** Ambil nasabah bila boleh diakses user; 404 bila tidak ada / bukan miliknya. */
export async function nasabahMilik(user: User, id: string) {
  const [n] = await db
    .select()
    .from(nasabah)
    .where(and(eq(nasabah.id, id), filterNasabah(user)))
    .limit(1);
  if (!n) notFound();
  return n;
}

export async function kendaraanMilik(user: User, id: string) {
  const [baris] = await db
    .select({ k: kendaraan, n: nasabah })
    .from(kendaraan)
    .innerJoin(nasabah, eq(nasabah.id, kendaraan.nasabahId))
    .where(and(eq(kendaraan.id, id), filterNasabah(user)))
    .limit(1);
  if (!baris) notFound();
  return baris;
}

/** Ambil pengajuan/polis bila boleh diakses user (sales: milik sendiri); 404 bila tidak. */
export async function polisMilik(user: User, id: string) {
  const [p] = await db
    .select()
    .from(polis)
    .where(and(eq(polis.id, id), user.role === "admin" ? undefined : eq(polis.salesId, user.id)))
    .limit(1);
  if (!p) notFound();
  return p;
}
