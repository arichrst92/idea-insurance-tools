import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { hash, tokenSesi } from "./crypto";

// Sesi persisten 30 hari, diperpanjang otomatis setiap dipakai (sliding).
// Token mentah hanya ada di cookie; database menyimpan hash-nya, sehingga
// sesi bisa dicabut (logout, keluar semua perangkat, sales dinonaktifkan).
//
// Format cookie: "r.<token>" (ingat perangkat, cookie 30 hari) atau
// "s.<token>" (cookie sesi browser). Middleware memakai prefiks ini untuk
// memperpanjang umur cookie tanpa perlu akses database.

export const NAMA_COOKIE = "ria_sid";
export const UMUR_SESI_MS = 30 * 24 * 60 * 60 * 1000;
const PERBARUI_SETELAH_MS = 60 * 60 * 1000; // tulis ke DB paling sering 1x/jam
const VERIFIKASI_ULANG_MS = 12 * 60 * 60 * 1000;

export type SesiAktif = { sesi: typeof sessions.$inferSelect; user: User };

export async function buatSesi(userId: string, ingatPerangkat: boolean): Promise<void> {
  const token = `${ingatPerangkat ? "r" : "s"}.${tokenSesi()}`;
  const h = await headers();
  const sekarang = new Date();
  await db.insert(sessions).values({
    userId,
    tokenHash: hash(token),
    ingatPerangkat,
    perangkat: h.get("user-agent")?.slice(0, 200) ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    kedaluwarsa: new Date(sekarang.getTime() + UMUR_SESI_MS),
  });
  (await cookies()).set(NAMA_COOKIE, token, opsiCookie(ingatPerangkat));
}

export function opsiCookie(ingatPerangkat: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(ingatPerangkat ? { maxAge: UMUR_SESI_MS / 1000 } : {}),
  };
}

/** Sesi untuk request ini (di-cache per request). Null bila tidak login. */
export const sesiSekarang = cache(async (): Promise<SesiAktif | null> => {
  const token = (await cookies()).get(NAMA_COOKIE)?.value;
  if (!token) return null;

  const [baris] = await db
    .select({ sesi: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hash(token)), isNull(sessions.dicabut)))
    .limit(1);
  if (!baris) return null;

  const sekarang = Date.now();
  if (baris.sesi.kedaluwarsa.getTime() <= sekarang || !baris.user.aktif) return null;

  if (sekarang - baris.sesi.terakhirAktif.getTime() > PERBARUI_SETELAH_MS) {
    await db
      .update(sessions)
      .set({ terakhirAktif: new Date(sekarang), kedaluwarsa: new Date(sekarang + UMUR_SESI_MS) })
      .where(eq(sessions.id, baris.sesi.id));
  }
  return baris;
});

/** Wajib login (opsional: wajib role tertentu). Redirect ke /login bila tidak. */
export async function wajibLogin(role?: User["role"]): Promise<SesiAktif> {
  const s = await sesiSekarang();
  if (!s) redirect("/login");
  if (role && s.user.role !== role) redirect("/");
  return s;
}

/** Tindakan sensitif (penarikan, transfer komisi, ubah rekening/bagi hasil) butuh OTP ulang bila > 12 jam. */
export function perluVerifikasiUlang(s: SesiAktif): boolean {
  return Date.now() - s.sesi.verifikasiOtpTerakhir.getTime() > VERIFIKASI_ULANG_MS;
}

export async function cabutSesiIni(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NAMA_COOKIE)?.value;
  if (token) {
    await db.update(sessions).set({ dicabut: new Date() }).where(eq(sessions.tokenHash, hash(token)));
  }
  jar.delete(NAMA_COOKIE);
}

/** Dipakai untuk "keluar dari semua perangkat" dan saat sales dinonaktifkan. */
export async function cabutSemuaSesi(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ dicabut: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.dicabut)));
}
