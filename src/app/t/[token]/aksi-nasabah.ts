"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dokumen, kategoriPolis, perusahaanAsuransi, penawaran, polis, trackerLink } from "@/db/schema";
import { FileTidakValid, simpanFile } from "@/lib/storage";
import { kabariSales } from "@/lib/pengajuan";
import { rupiah } from "@/lib/format";
import type { StateForm } from "@/components/form-aksi";

// Aksi publik dari halaman tracker nasabah. Akses hanya lewat token link yang aktif.

const MAKS_BUKTI = 5;

async function polisDariToken(token: string) {
  const [b] = await db
    .select({ p: polis })
    .from(trackerLink)
    .innerJoin(polis, eq(polis.id, trackerLink.polisId))
    .where(and(eq(trackerLink.token, token.toUpperCase()), isNull(trackerLink.dicabut)));
  return b?.p ?? null;
}

/** Nasabah memilih paket dari penawaran asuransi; sales lalu mengonfirmasi (persetujuan + cashback). */
export async function pilihPaketNasabah(token: string, _: StateForm, f: FormData): Promise<StateForm> {
  const p = await polisDariToken(token);
  if (!p) return { error: "Link tidak berlaku" };
  if (p.statusPengajuan !== "penawaran_masuk") return { error: "Pilihan paket sudah ditutup. Hubungi sales Anda." };
  const [pw] = await db
    .select({ id: penawaran.id, premi: penawaran.premi, paket: kategoriPolis.nama, asuransi: perusahaanAsuransi.nama })
    .from(penawaran)
    .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, penawaran.perusahaanId))
    .leftJoin(kategoriPolis, eq(kategoriPolis.id, penawaran.kategoriId))
    .where(and(eq(penawaran.id, String(f.get("penawaranId") ?? "")), eq(penawaran.polisId, p.id)));
  if (!pw) return { error: "Pilih salah satu paket" };
  if (pw.id === p.pilihanNasabahId) return { ok: "Pilihan Anda sudah tercatat" };

  await db.update(polis).set({ pilihanNasabahId: pw.id, pilihanNasabahWaktu: new Date() }).where(eq(polis.id, p.id));
  const nama = `${pw.asuransi}${pw.paket ? ` ${pw.paket}` : ""}`;
  await kabariSales(p.id, "Nasabah memilih paket", `${nama} — premi ${rupiah(pw.premi)}. Konfirmasi persetujuan di aplikasi.`);
  revalidatePath(`/t/${token}`);
  revalidatePath(`/pengajuan/${p.id}`);
  return { ok: `Pilihan ${nama} terkirim ke sales Anda` };
}

/** Nasabah mengupload bukti transfer premi; sales/admin memeriksa lalu menandai lunas. */
export async function uploadBuktiNasabah(token: string, _: StateForm, f: FormData): Promise<StateForm> {
  const p = await polisDariToken(token);
  if (!p) return { error: "Link tidak berlaku" };
  if (!["polis_terbit", "menunggu_bayar"].includes(p.statusPengajuan) || p.statusBayar === "lunas")
    return { error: "Pembayaran tidak sedang ditunggu" };
  const file = f.get("bukti");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih foto atau PDF bukti transfer" };

  const [{ n }] = await db
    .select({ n: count() })
    .from(dokumen)
    .where(and(eq(dokumen.pemilikTipe, "polis"), eq(dokumen.pemilikId, p.id), eq(dokumen.jenis, "bukti_bayar_nasabah"), isNull(dokumen.diuploadOleh)));
  if (n >= MAKS_BUKTI) return { error: "Batas upload tercapai. Kirim bukti lewat WhatsApp ke sales Anda." };

  try {
    const key = await simpanFile(file, "polis");
    // diuploadOleh kosong = diupload nasabah dari link tracker
    await db.insert(dokumen).values({
      pemilikTipe: "polis",
      pemilikId: p.id,
      jenis: "bukti_bayar_nasabah",
      fileKey: key,
      namaFile: file.name.slice(0, 120),
      diuploadOleh: null,
    });
  } catch (e) {
    if (e instanceof FileTidakValid) return { error: e.message };
    throw e;
  }
  await kabariSales(p.id, "Bukti transfer dari nasabah", "Nasabah mengupload bukti transfer lewat link tracker. Periksa lalu tandai lunas.");
  revalidatePath(`/t/${token}`);
  revalidatePath(`/pengajuan/${p.id}`);
  return { ok: "Terima kasih, bukti transfer terkirim. Kami akan mengonfirmasi pembayaran Anda." };
}
