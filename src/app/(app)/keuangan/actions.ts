"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dokumen, kasKantor } from "@/db/schema";
import { perluVerifikasiUlang, wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { KATEGORI_KAS, posisiKas, type KategoriKas } from "@/lib/keuangan";
import { FileTidakValid, simpanFile } from "@/lib/storage";
import { parseRupiah, rupiah } from "@/lib/format";
import type { StateForm } from "@/components/form-aksi";

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function simpanBukti(f: FormData, userId: string) {
  const file = f.get("bukti");
  if (!(file instanceof File) || file.size === 0) return null;
  const key = await simpanFile(file, "kas");
  const [d] = await db
    .insert(dokumen)
    .values({ pemilikTipe: "kas", pemilikId: "kas", jenis: "bukti_penarikan", fileKey: key, namaFile: file.name.slice(0, 120), diuploadOleh: userId })
    .returning({ id: dokumen.id });
  return d.id;
}

/** Entri manual: saldo awal, biaya operasional, lain-lain. */
export async function entriManual(_: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const kategori = teks(f, "kategori") as KategoriKas;
  const k = KATEGORI_KAS[kategori];
  if (!k || k.otomatis || kategori === "penarikan") return { error: "Pilih kategori" };
  const nominal = parseRupiah(teks(f, "nominal"));
  const tanggal = teks(f, "tanggal");
  if (!tanggal) return { error: "Isi tanggal" };
  if (Number.isNaN(nominal) || nominal <= 0) return { error: "Isi nominal" };
  const keterangan = teks(f, "keterangan");
  if (keterangan.length < 3) return { error: "Isi keterangan" };
  try {
    const bukti = await simpanBukti(f, user.id);
    const [e] = await db
      .insert(kasKantor)
      .values({ tanggal, arah: k.arah, kategori, nominal, keterangan, buktiDokumenId: bukti, sumber: "manual", dibuatOleh: user.id })
      .returning({ id: kasKantor.id });
    if (bukti) await db.update(dokumen).set({ pemilikId: e.id, jenis: "bukti_penarikan" }).where(eq(dokumen.id, bukti));
    await catatAudit({ userId: user.id, aksi: "tambah", tabel: "kas_kantor", recordId: e.id, detail: { kategori, nominal } });
  } catch (e) {
    if (e instanceof FileTidakValid) return { error: e.message };
    throw e;
  }
  revalidatePath("/keuangan");
  return { ok: `${k.label} ${rupiah(nominal)} dicatat` };
}

/** Penarikan kantor: wajib OTP ulang (> 12 jam), bukti, dan tidak melebihi saldo bisa ditarik. */
export async function tarikDana(_: StateForm, f: FormData): Promise<StateForm> {
  const sesi = await wajibLogin("admin");
  if (perluVerifikasiUlang(sesi)) return { error: "Verifikasi OTP ulang dulu sebelum penarikan (terakhir lebih dari 12 jam)." };
  const nominal = parseRupiah(teks(f, "nominal"));
  const tanggal = teks(f, "tanggal");
  const keterangan = teks(f, "keterangan");
  if (!tanggal) return { error: "Isi tanggal" };
  if (Number.isNaN(nominal) || nominal <= 0) return { error: "Isi nominal penarikan" };
  if (keterangan.length < 3) return { error: "Isi keperluan penarikan" };
  const file = f.get("bukti");
  if (!(file instanceof File) || file.size === 0) return { error: "Upload bukti penarikan" };
  const pos = await posisiKas();
  if (nominal > pos.bisaDitarik)
    return { error: `Ditolak: melebihi saldo bisa ditarik ${rupiah(pos.bisaDitarik)} (saldo ${rupiah(pos.saldo)} − dana titipan ${rupiah(pos.titipan.total)}).` };
  try {
    const bukti = await simpanBukti(f, sesi.user.id);
    const [e] = await db
      .insert(kasKantor)
      .values({ tanggal, arah: "keluar", kategori: "penarikan", nominal, keterangan, buktiDokumenId: bukti, sumber: "manual", dibuatOleh: sesi.user.id })
      .returning({ id: kasKantor.id });
    if (bukti) await db.update(dokumen).set({ pemilikId: e.id }).where(eq(dokumen.id, bukti));
    await catatAudit({ userId: sesi.user.id, aksi: "penarikan", tabel: "kas_kantor", recordId: e.id, detail: { nominal } });
  } catch (e) {
    if (e instanceof FileTidakValid) return { error: e.message };
    throw e;
  }
  revalidatePath("/keuangan");
  return { ok: `Penarikan ${rupiah(nominal)} dicatat` };
}

/** Hapus entri manual yang salah input (entri otomatis tidak bisa dihapus). */
export async function hapusEntri(id: string) {
  const { user } = await wajibLogin("admin");
  const [e] = await db.delete(kasKantor).where(and(eq(kasKantor.id, id), eq(kasKantor.sumber, "manual"))).returning();
  if (e) await catatAudit({ userId: user.id, aksi: "hapus", tabel: "kas_kantor", recordId: id, detail: { kategori: e.kategori, nominal: e.nominal } });
  revalidatePath("/keuangan");
}
