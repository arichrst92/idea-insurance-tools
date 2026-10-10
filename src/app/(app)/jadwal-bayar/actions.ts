"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dokumen } from "@/db/schema";
import { perluVerifikasiUlang, wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { batalkanBatch, buatBatch, tandaiBatchDibayar } from "@/lib/jadwal-bayar";
import { FileTidakValid, simpanFile } from "@/lib/storage";
import type { StateForm } from "@/components/form-aksi";

const segarkan = () => {
  revalidatePath("/jadwal-bayar");
  revalidatePath("/keuangan");
  revalidatePath("/pencairan");
};

export async function buatFileTransfer(_: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const ids = f.getAll("jadwalId").map(String);
  if (ids.length === 0) return { error: "Centang pembayaran yang akan diekspor" };
  const h = await buatBatch(ids, user.id);
  await catatAudit({ userId: user.id, aksi: "buat_batch", tabel: "batch_transfer", recordId: h.dibuat.join(","), detail: { jumlah: ids.length } });
  segarkan();
  const lewat = [...h.tanpaRek.map((n) => `${n} (rekening belum diisi)`), ...h.antarTanpaKode.map((n) => `${n} (kode bank kosong)`)];
  if (!h.dibuat.length) return { error: `Tidak ada yang bisa diekspor. ${lewat.join(", ")}` };
  return { ok: `${h.dibuat.length} file transfer dibuat — unduh di daftar batch.${lewat.length ? ` Dilewati: ${lewat.join(", ")}.` : ""}` };
}

/** Tandai batch dibayar: wajib OTP ulang (> 12 jam) karena mencatat transfer komisi. */
export async function tandaiDibayar(batchId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const sesi = await wajibLogin("admin");
  if (perluVerifikasiUlang(sesi)) return { error: "Verifikasi OTP ulang dulu (terakhir lebih dari 12 jam)." };
  const tgl = String(f.get("tgl") ?? "");
  if (!tgl) return { error: "Isi tanggal transfer" };
  let buktiId: string | null = null;
  const file = f.get("bukti");
  try {
    if (file instanceof File && file.size > 0) {
      const key = await simpanFile(file, "kas");
      [{ id: buktiId }] = await db
        .insert(dokumen)
        .values({ pemilikTipe: "kas", pemilikId: batchId, jenis: "bukti_transfer_komisi", fileKey: key, namaFile: file.name.slice(0, 120), diuploadOleh: sesi.user.id })
        .returning({ id: dokumen.id });
    }
  } catch (e) {
    if (e instanceof FileTidakValid) return { error: e.message };
    throw e;
  }
  const n = await tandaiBatchDibayar(batchId, { tgl, oleh: sesi.user.id, buktiDokumenId: buktiId });
  await catatAudit({ userId: sesi.user.id, aksi: "batch_dibayar", tabel: "batch_transfer", recordId: batchId, detail: { jumlah: n } });
  segarkan();
  return { ok: `${n} pembayaran ditandai dibayar; buku kas & status diperbarui, penerima dikabari WhatsApp` };
}

export async function batalBatch(batchId: string) {
  const { user } = await wajibLogin("admin");
  if (await batalkanBatch(batchId)) await catatAudit({ userId: user.id, aksi: "batal_batch", tabel: "batch_transfer", recordId: batchId });
  segarkan();
}
