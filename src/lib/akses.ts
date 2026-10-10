import "server-only";
import { notFound } from "next/navigation";
import { and, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, nasabah, type User } from "@/db/schema";

// Aturan akses data: admin melihat semua; sales hanya nasabah miliknya
// (dan kendaraan/dokumen/polis dari nasabah itu).

export function filterNasabah(user: User): SQL | undefined {
  return user.role === "admin" ? undefined : eq(nasabah.salesId, user.id);
}

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
