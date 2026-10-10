"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dokumen, kendaraan, nasabah, polis, rekening, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { kendaraanMilik, nasabahMilik } from "@/lib/akses";
import { catatAudit } from "@/lib/audit";
import { normalisasiNoWa } from "@/lib/wa";
import { FileTidakValid, simpanFile } from "@/lib/storage";
import { alihkanNasabah } from "@/lib/pengalihan";
import { normalisasiPlat } from "@/lib/domain/kendaraan";
import type { StateForm } from "@/components/form-aksi";

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opsional = (f: FormData, k: string) => teks(f, k) || null;
const pesan = (e: z.ZodError) => e.issues[0]?.message ?? "Data tidak valid";
const tahunIni = new Date().getFullYear();

// ─── Nasabah ───

const skemaNasabah = z.object({
  tipe: z.enum(["perorangan", "badan"]),
  nama: z.string().min(2, "Nama nasabah wajib diisi"),
  nik: z
    .string()
    .regex(/^\d{16}$/, "NIK harus 16 digit")
    .nullable(),
  noWa: z.string({ invalid_type_error: "Nomor WhatsApp tidak valid" }),
  email: z.string().email("Email tidak valid").nullable(),
  alamat: z.string().nullable(),
  tglLahir: z.string().date("Tanggal lahir tidak valid").nullable(),
});

const skemaKendaraan = z.object({
  noPolisi: z.string({ invalid_type_error: "Nomor polisi tidak valid, contoh D 1234 ABC" }),
  merek: z.string().min(2, "Merek wajib diisi"),
  model: z.string().min(1, "Model wajib diisi"),
  tahun: z.number({ invalid_type_error: "Tahun wajib diisi" }).int().min(1980, "Tahun tidak valid").max(tahunIni + 1, "Tahun tidak valid"),
  warna: z.string().nullable(),
  noRangka: z.string().nullable(),
  noMesin: z.string().nullable(),
});

function bacaNasabah(f: FormData) {
  return skemaNasabah.safeParse({
    tipe: teks(f, "tipe") === "badan" ? "badan" : "perorangan",
    nama: teks(f, "nama"),
    nik: opsional(f, "nik")?.replace(/\D/g, "") ?? null,
    noWa: normalisasiNoWa(teks(f, "noWa")),
    email: opsional(f, "email"),
    alamat: opsional(f, "alamat"),
    tglLahir: opsional(f, "tglLahir"),
  });
}

function bacaKendaraan(f: FormData) {
  return skemaKendaraan.safeParse({
    noPolisi: normalisasiPlat(teks(f, "noPolisi")),
    merek: teks(f, "merek"),
    model: teks(f, "model"),
    tahun: teks(f, "tahun") ? Number(teks(f, "tahun")) : undefined,
    warna: opsional(f, "warna"),
    noRangka: opsional(f, "noRangka")?.toUpperCase() ?? null,
    noMesin: opsional(f, "noMesin")?.toUpperCase() ?? null,
  });
}

/** Sales pemilik: sales sendiri, atau pilihan admin (harus sales aktif). */
async function tentukanSales(user: { id: string; role: string }, f: FormData): Promise<string | { error: string }> {
  if (user.role !== "admin") return user.id;
  const id = teks(f, "salesId");
  if (!id) return { error: "Pilih sales pemilik nasabah" };
  const [s] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, "sales"), eq(users.aktif, true)));
  return s ? s.id : { error: "Sales tidak ditemukan atau tidak aktif" };
}

export async function buatNasabah(_: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const n = bacaNasabah(f);
  if (!n.success) return { error: pesan(n.error) };
  const salesId = await tentukanSales(user, f);
  if (typeof salesId !== "string") return salesId;

  const adaKendaraan = teks(f, "noPolisi") !== "";
  const k = adaKendaraan ? bacaKendaraan(f) : null;
  if (k && !k.success) return { error: pesan(k.error) };

  const id = await db.transaction(async (tx) => {
    const [baru] = await tx
      .insert(nasabah)
      .values({ ...n.data, salesId })
      .returning({ id: nasabah.id });
    if (k?.success) await tx.insert(kendaraan).values({ ...k.data, nasabahId: baru.id });
    return baru.id;
  });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "nasabah", recordId: id });
  revalidatePath("/nasabah");
  redirect(`/nasabah/${id}`);
}

export async function ubahNasabah(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  await nasabahMilik(user, id);
  const n = bacaNasabah(f);
  if (!n.success) return { error: pesan(n.error) };
  await db.update(nasabah).set(n.data).where(eq(nasabah.id, id));
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "nasabah", recordId: id });
  revalidatePath(`/nasabah/${id}`);
  return { ok: "Data nasabah tersimpan" };
}

// ─── Kendaraan ───

export async function tambahKendaraan(nasabahId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  await nasabahMilik(user, nasabahId);
  const k = bacaKendaraan(f);
  if (!k.success) return { error: pesan(k.error) };
  const [baru] = await db
    .insert(kendaraan)
    .values({ ...k.data, nasabahId })
    .returning({ id: kendaraan.id });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "kendaraan", recordId: baru.id });
  revalidatePath(`/nasabah/${nasabahId}`);
  return { ok: `Kendaraan ${k.data.noPolisi} ditambahkan` };
}

export async function ubahKendaraan(kendaraanId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const { n } = await kendaraanMilik(user, kendaraanId);
  const k = bacaKendaraan(f);
  if (!k.success) return { error: pesan(k.error) };
  await db.update(kendaraan).set(k.data).where(eq(kendaraan.id, kendaraanId));
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "kendaraan", recordId: kendaraanId });
  revalidatePath(`/nasabah/${n.id}`);
  return { ok: "Kendaraan tersimpan" };
}

/**
 * Tandai kendaraan dijual / tidak dipakai, atau aktifkan kembali.
 * Polis kendaraan itu yang masih berjalan ditandai "Kendaraan dijual" (tidak diperpanjang, remind berhenti).
 */
export async function ubahStatusKendaraan(kendaraanId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const { n } = await kendaraanMilik(user, kendaraanId);
  const status = teks(f, "status");
  if (status !== "aktif" && status !== "dijual" && status !== "tidak_dipakai") return { error: "Status tidak valid" };
  const tgl = opsional(f, "tglStatus");
  const catatan = opsional(f, "catatanStatus");
  if (status !== "aktif" && !tgl) return { error: "Isi tanggal" };
  if (status === "tidak_dipakai" && !catatan) return { error: "Isi alasan kendaraan tidak dipakai" };

  await db.transaction(async (tx) => {
    await tx
      .update(kendaraan)
      .set({ status, tglStatus: status === "aktif" ? null : tgl, catatanStatus: status === "aktif" ? null : catatan })
      .where(eq(kendaraan.id, kendaraanId));
    if (status === "aktif") {
      await tx
        .update(polis)
        .set({ statusMasa: "aktif" })
        .where(and(eq(polis.kendaraanId, kendaraanId), eq(polis.statusMasa, "kendaraan_dijual")));
    } else {
      await tx
        .update(polis)
        .set({ statusMasa: "kendaraan_dijual" })
        .where(and(eq(polis.kendaraanId, kendaraanId), inArray(polis.statusMasa, ["aktif", "akan_habis"])));
    }
  });
  await catatAudit({ userId: user.id, aksi: `status_${status}`, tabel: "kendaraan", recordId: kendaraanId, detail: { tgl, catatan } });
  revalidatePath(`/nasabah/${n.id}`);
  revalidatePath("/nasabah");
  return { ok: status === "aktif" ? "Kendaraan diaktifkan kembali" : "Status kendaraan diperbarui" };
}

// ─── Rekening nasabah (tujuan transfer cashback) ───

export async function simpanRekeningNasabah(nasabahId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  await nasabahMilik(user, nasabahId);
  const r = z
    .object({
      namaBank: z.string().min(2, "Nama bank wajib diisi"),
      kodeBank: z.string().regex(/^\d{3}$/, "Kode bank 3 digit, mis. 014 untuk BCA").nullable(),
      noRekening: z.string().regex(/^[\d-]{5,25}$/, "Nomor rekening tidak valid"),
      atasNama: z.string().min(2, "Atas nama wajib diisi"),
    })
    .safeParse({
      namaBank: teks(f, "namaBank"),
      kodeBank: opsional(f, "kodeBank"),
      noRekening: teks(f, "noRekening").replace(/\s/g, ""),
      atasNama: teks(f, "atasNama"),
    });
  if (!r.success) return { error: pesan(r.error) };

  await db.transaction(async (tx) => {
    const [lama] = await tx
      .select({ id: rekening.id })
      .from(rekening)
      .where(and(eq(rekening.pemilikTipe, "nasabah"), eq(rekening.pemilikId, nasabahId), eq(rekening.utama, true)));
    if (lama) await tx.update(rekening).set(r.data).where(eq(rekening.id, lama.id));
    else await tx.insert(rekening).values({ ...r.data, pemilikTipe: "nasabah", pemilikId: nasabahId, utama: true });
  });
  await catatAudit({ userId: user.id, aksi: "ubah_rekening", tabel: "nasabah", recordId: nasabahId });
  revalidatePath(`/nasabah/${nasabahId}`);
  return { ok: "Rekening tersimpan" };
}

// ─── Dokumen ───

const JENIS_NASABAH = ["ktp"] as const;
const JENIS_KENDARAAN = ["stnk", "foto_kendaraan"] as const;

export async function uploadDokumen(
  pemilik: { tipe: "nasabah" | "kendaraan"; id: string },
  _: StateForm,
  f: FormData,
): Promise<StateForm> {
  const { user } = await wajibLogin();
  const jenis = teks(f, "jenis");
  let nasabahId: string;
  if (pemilik.tipe === "nasabah") {
    if (!(JENIS_NASABAH as readonly string[]).includes(jenis)) return { error: "Jenis dokumen tidak valid" };
    nasabahId = (await nasabahMilik(user, pemilik.id)).id;
  } else {
    if (!(JENIS_KENDARAAN as readonly string[]).includes(jenis)) return { error: "Jenis dokumen tidak valid" };
    nasabahId = (await kendaraanMilik(user, pemilik.id)).n.id;
  }

  const files = f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length === 0) return { error: "Pilih file dulu" };
  if (files.length > 8) return { error: "Maksimal 8 file sekali upload" };

  try {
    for (const file of files) {
      const key = await simpanFile(file, pemilik.tipe);
      await db.insert(dokumen).values({
        pemilikTipe: pemilik.tipe,
        pemilikId: pemilik.id,
        jenis: jenis as (typeof JENIS_NASABAH)[number] | (typeof JENIS_KENDARAAN)[number],
        fileKey: key,
        namaFile: file.name.slice(0, 120),
        diuploadOleh: user.id,
      });
    }
  } catch (e) {
    if (e instanceof FileTidakValid) return { error: e.message };
    throw e;
  }
  await catatAudit({ userId: user.id, aksi: "upload", tabel: "dokumen", recordId: pemilik.id, detail: { jenis, jumlah: files.length } });
  revalidatePath(`/nasabah/${nasabahId}`);
  return { ok: `${files.length} file terupload` };
}

export async function hapusDokumen(dokumenId: string) {
  const { user } = await wajibLogin();
  const [d] = await db.select().from(dokumen).where(eq(dokumen.id, dokumenId));
  if (!d || (d.pemilikTipe !== "nasabah" && d.pemilikTipe !== "kendaraan")) return;
  const nasabahId =
    d.pemilikTipe === "nasabah" ? (await nasabahMilik(user, d.pemilikId)).id : (await kendaraanMilik(user, d.pemilikId)).n.id;
  // Metadata dihapus; file fisik tetap tersimpan sebagai arsip (audit).
  await db.delete(dokumen).where(eq(dokumen.id, dokumenId));
  await catatAudit({ userId: user.id, aksi: "hapus", tabel: "dokumen", recordId: dokumenId, detail: { fileKey: d.fileKey } });
  revalidatePath(`/nasabah/${nasabahId}`);
}

// ─── Pindah kepemilikan (admin) ───

export async function pindahKepemilikan(nasabahId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const n = await nasabahMilik(user, nasabahId);
  const keSalesId = teks(f, "keSalesId");
  if (!keSalesId || keSalesId === n.salesId) return { error: "Pilih sales tujuan yang berbeda" };
  const [ke] = await db
    .select({ id: users.id, nama: users.nama })
    .from(users)
    .where(and(eq(users.id, keSalesId), eq(users.role, "sales"), eq(users.aktif, true)));
  if (!ke) return { error: "Sales tujuan tidak aktif" };

  const { polisDipindah } = await db.transaction((tx) =>
    alihkanNasabah(tx, {
      nasabahId,
      dariSalesId: n.salesId,
      keSalesId,
      komisiIkut: f.get("komisiIkut") === "on",
      oleh: user.id,
    }),
  );
  await catatAudit({ userId: user.id, aksi: "pindah_sales", tabel: "nasabah", recordId: nasabahId, detail: { dari: n.salesId, ke: keSalesId } });
  revalidatePath(`/nasabah/${nasabahId}`);
  return { ok: `Nasabah dipindah ke ${ke.nama}; ${polisDipindah} pengajuan/polis ikut pindah` };
}
