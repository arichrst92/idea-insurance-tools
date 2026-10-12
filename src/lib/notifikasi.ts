import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifikasi, users } from "@/db/schema";

/** Notifikasi in-app ke semua owner aktif (kecuali pelaku). */
export async function kabariOwner(p: { jenis: string; judul: string; isi?: string; link?: string; kecuali?: string }) {
  const owners = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "owner"), eq(users.aktif, true)));
  const tujuan = owners.filter((o) => o.id !== p.kecuali);
  if (tujuan.length)
    await db.insert(notifikasi).values(tujuan.map((o) => ({ userId: o.id, jenis: p.jenis, judul: p.judul, isi: p.isi ?? null, link: p.link ?? null })));
  return tujuan.length;
}
