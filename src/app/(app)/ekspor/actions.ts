"use server";

import { revalidatePath } from "next/cache";
import { wajibLogin } from "@/lib/auth/session";
import { antrekanEkspor, JENIS_EKSPOR, type JenisEkspor } from "@/lib/ekspor/antrian";
import type { StateForm } from "@/components/form-aksi";
import { adalahOwner } from "@/lib/peran";

/** Minta PDF: dibuat di background, pengguna dikabari lewat notifikasi saat siap. */
export async function mintaPdf(jenis: JenisEkspor, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  if (!(jenis in JENIS_EKSPOR)) return { error: "Jenis ekspor tidak dikenal" };
  if (jenis === "keuangan" && !adalahOwner(user)) return { error: "Hanya owner" };
  const filter = Object.fromEntries([...f.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string" && v).map(([k, v]) => [k, String(v)]));
  await antrekanEkspor({ userId: user.id, jenis, filter });
  revalidatePath("/ekspor");
  return { ok: "PDF sedang dibuat — Anda akan mendapat notifikasi saat siap (lihat Riwayat ekspor)." };
}
