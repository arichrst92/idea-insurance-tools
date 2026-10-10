import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes, users, waLog } from "@/db/schema";
import { kirimWa } from "@/lib/fonnte";
import { hash, kodeOtp, samaAman } from "./crypto";

// OTP 6 digit, berlaku 5 menit, maks 5 percobaan.
// Batas kirim: 1x per 60 detik dan 5x per jam per nomor.

const UMUR_OTP_MS = 5 * 60 * 1000;
const MAKS_PERCOBAAN = 5;
const JEDA_KIRIM_MS = 60 * 1000;
const MAKS_PER_JAM = 5;

export type HasilMintaOtp =
  | { ok: true }
  | { ok: false; alasan: "tidak_terdaftar" | "terlalu_sering" | "gagal_kirim"; pesan: string };

export async function mintaOtp(noWa: string): Promise<HasilMintaOtp> {
  const [user] = await db.select().from(users).where(eq(users.noWa, noWa)).limit(1);
  if (!user || !user.aktif) {
    return { ok: false, alasan: "tidak_terdaftar", pesan: "Nomor ini belum terdaftar atau tidak aktif. Hubungi admin." };
  }

  const sejamLalu = new Date(Date.now() - 60 * 60 * 1000);
  const terakhir = await db
    .select({ dibuat: otpCodes.dibuat })
    .from(otpCodes)
    .where(and(eq(otpCodes.noWa, noWa), gt(otpCodes.dibuat, sejamLalu)))
    .orderBy(desc(otpCodes.dibuat));
  if (terakhir.length >= MAKS_PER_JAM) {
    return { ok: false, alasan: "terlalu_sering", pesan: "Terlalu banyak permintaan kode. Coba lagi dalam 1 jam." };
  }
  if (terakhir[0] && Date.now() - terakhir[0].dibuat.getTime() < JEDA_KIRIM_MS) {
    return { ok: false, alasan: "terlalu_sering", pesan: "Tunggu 1 menit sebelum meminta kode baru." };
  }

  const kode = kodeOtp();
  await db.insert(otpCodes).values({
    noWa,
    kodeHash: hash(`${noWa}:${kode}`),
    kedaluwarsa: new Date(Date.now() + UMUR_OTP_MS),
  });

  const isi = `Kode login Rekap Asuransi: *${kode}*\nBerlaku 5 menit. Jangan berikan kode ini kepada siapa pun, termasuk staf kantor.`;
  const hasil = await kirimWa({ target: noWa, message: isi });
  await db.insert(waLog).values({
    userId: user.id,
    nomorTujuan: noWa,
    jenis: "otp",
    kanal: "fonnte",
    fonnteId: hasil.ok ? hasil.id : null,
    status: hasil.ok ? "terkirim" : "gagal",
    isi: "Kode login (disembunyikan)",
  });
  if (!hasil.ok) {
    return { ok: false, alasan: "gagal_kirim", pesan: "Kode gagal dikirim ke WhatsApp. Coba lagi sebentar." };
  }
  return { ok: true };
}

export type HasilVerifikasi =
  | { ok: true; userId: string }
  | { ok: false; pesan: string };

export async function verifikasiOtp(noWa: string, kode: string): Promise<HasilVerifikasi> {
  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.noWa, noWa), eq(otpCodes.dipakai, false), gt(otpCodes.kedaluwarsa, new Date())))
    .orderBy(desc(otpCodes.dibuat))
    .limit(1);
  if (!otp) return { ok: false, pesan: "Kode sudah kedaluwarsa. Minta kode baru." };
  if (otp.percobaan >= MAKS_PERCOBAAN) {
    return { ok: false, pesan: "Terlalu banyak percobaan salah. Minta kode baru." };
  }

  if (!samaAman(otp.kodeHash, hash(`${noWa}:${kode}`))) {
    await db.update(otpCodes).set({ percobaan: otp.percobaan + 1 }).where(eq(otpCodes.id, otp.id));
    const sisa = MAKS_PERCOBAAN - otp.percobaan - 1;
    return { ok: false, pesan: sisa > 0 ? `Kode salah. Sisa ${sisa} percobaan.` : "Kode salah. Minta kode baru." };
  }

  await db.update(otpCodes).set({ dipakai: true }).where(eq(otpCodes.id, otp.id));
  const [user] = await db.select({ id: users.id, aktif: users.aktif }).from(users).where(eq(users.noWa, noWa)).limit(1);
  if (!user?.aktif) return { ok: false, pesan: "Akun tidak aktif. Hubungi admin." };
  return { ok: true, userId: user.id };
}
