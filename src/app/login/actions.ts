"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { otpDibypass } from "@/lib/auth/bypass";
import { normalisasiNoWa } from "@/lib/wa";
import { mintaOtp, verifikasiOtp } from "@/lib/auth/otp";
import { buatSesi, cabutSemuaSesi, cabutSesiIni, wajibLogin } from "@/lib/auth/session";

export type StateLogin = {
  langkah: "nomor" | "kode";
  noWa?: string;
  pesan?: string;
  error?: string;
};

export async function aksiLogin(prev: StateLogin, form: FormData): Promise<StateLogin> {
  const aksi = String(form.get("aksi") ?? "");

  if (aksi === "minta" || aksi === "kirim-ulang") {
    const noWa = normalisasiNoWa(String(form.get("noWa") ?? prev.noWa ?? ""));
    if (!noWa) return { langkah: "nomor", error: "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890" };

    if (otpDibypass()) {
      const [user] = await db.select().from(users).where(eq(users.noWa, noWa)).limit(1);
      if (!user?.aktif) return { langkah: "nomor", error: "Nomor ini belum terdaftar atau tidak aktif." };
      await buatSesi(user.id, true);
      redirect("/");
    }

    const hasil = await mintaOtp(noWa);
    if (!hasil.ok) return { langkah: aksi === "kirim-ulang" ? "kode" : "nomor", noWa, error: hasil.pesan };
    return { langkah: "kode", noWa, pesan: "Kode 6 digit sudah dikirim ke WhatsApp Anda." };
  }

  if (aksi === "verifikasi") {
    const noWa = prev.noWa;
    if (!noWa) return { langkah: "nomor" };
    const kode = String(form.get("kode") ?? "").replace(/\D/g, "");
    if (kode.length !== 6) return { langkah: "kode", noWa, error: "Masukkan 6 digit kode." };
    const hasil = await verifikasiOtp(noWa, kode);
    if (!hasil.ok) return { langkah: "kode", noWa, error: hasil.pesan };
    await buatSesi(hasil.userId, form.get("ingat") === "on");
    redirect("/");
  }

  if (aksi === "ganti-nomor") return { langkah: "nomor" };
  return prev;
}

export async function aksiLogout() {
  await cabutSesiIni();
  redirect("/login");
}

export async function aksiKeluarSemua() {
  const { user } = await wajibLogin();
  await cabutSemuaSesi(user.id);
  await cabutSesiIni();
  redirect("/login");
}
