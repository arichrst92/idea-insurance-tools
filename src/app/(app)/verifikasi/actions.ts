"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { mintaOtp, verifikasiOtp } from "@/lib/auth/otp";
import { wajibLogin } from "@/lib/auth/session";

export type StateVerifikasi = { terkirim?: boolean; error?: string };

/** Verifikasi OTP ulang untuk tindakan sensitif; memperbarui verifikasi_otp_terakhir sesi ini. */
export async function aksiVerifikasi(lanjut: string, prev: StateVerifikasi, form: FormData): Promise<StateVerifikasi> {
  const { user, sesi } = await wajibLogin();
  if (form.get("aksi") === "kirim") {
    const h = await mintaOtp(user.noWa);
    return h.ok ? { terkirim: true } : { error: h.pesan };
  }
  const kode = String(form.get("kode") ?? "").replace(/\D/g, "");
  const h = await verifikasiOtp(user.noWa, kode);
  if (!h.ok || h.userId !== user.id) return { terkirim: true, error: h.ok ? "Kode tidak cocok" : h.pesan };
  await db.update(sessions).set({ verifikasiOtpTerakhir: new Date() }).where(eq(sessions.id, sesi.id));
  redirect(lanjut.startsWith("/") && !lanjut.startsWith("//") ? lanjut : "/");
}
