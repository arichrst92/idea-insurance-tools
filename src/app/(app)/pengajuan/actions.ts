"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  dokumen,
  eventBagiHasil,
  kategoriPolis,
  kendaraan,
  penawaran,
  perusahaanAsuransi,
  polis,
  rekening,
  statusHistory,
  trackerLink,
  users,
  type StatusPengajuan,
} from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { nasabahMilik, polisMilik } from "@/lib/akses";
import { catatAudit } from "@/lib/audit";
import { FileTidakValid, simpanFile } from "@/lib/storage";
import { bagiHasilBerlaku, hitungKomisi, KomisiError } from "@/lib/domain/komisi";
import { labelStatus } from "@/lib/domain/journey";
import { parsePersen, parseRupiah, rupiah } from "@/lib/format";
import { isiTemplate, kirimPesan } from "@/lib/pesan";
import { buatLinkUnduh } from "@/lib/unduh";
import { kasOtomatis, transferPolis } from "@/lib/keuangan";
import { kirimDataKeAsuransi, kirimOtomatisBawaan } from "@/lib/kirim-asuransi";
import { linkWaMe } from "@/lib/wa";
import {
  TransisiTidakSah,
  cekKelengkapan,
  kodeBaru,
  pastikanTracker,
  setelahStatus,
  trackerAktif,
  ubahStatus,
  urlTracker,
  varsPesanNasabah,
} from "@/lib/pengajuan";
import type { StateForm } from "@/components/form-aksi";

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opsional = (f: FormData, k: string) => teks(f, k) || null;
const segarkan = (id: string) => {
  revalidatePath(`/pengajuan/${id}`);
  revalidatePath("/pengajuan");
};

/** Jalankan aksi status; ubah TransisiTidakSah/KomisiError/FileTidakValid menjadi pesan form. */
async function jalankan(fn: () => Promise<StateForm>): Promise<StateForm> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TransisiTidakSah || e instanceof KomisiError || e instanceof FileTidakValid) return { error: e.message };
    throw e;
  }
}

async function simpanDokumenPolis(
  f: FormData,
  field: string,
  polisId: string,
  jenis: "penawaran" | "polis" | "bukti_bayar_nasabah" | "bukti_cair_asuransi" | "bukti_transfer_cashback_nasabah" | "bukti_transfer_komisi",
  userId: string,
): Promise<string | null> {
  const file = f.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  const key = await simpanFile(file, "polis");
  const [d] = await db
    .insert(dokumen)
    .values({ pemilikTipe: "polis", pemilikId: polisId, jenis, fileKey: key, namaFile: file.name.slice(0, 120), diuploadOleh: userId })
    .returning({ id: dokumen.id });
  return d.id;
}

// ─── 1. Buat pengajuan (draft prospek) ───

export async function buatPengajuan(_: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const n = await nasabahMilik(user, teks(f, "nasabahId"));
  const [k] = await db
    .select()
    .from(kendaraan)
    .where(and(eq(kendaraan.id, teks(f, "kendaraanId")), eq(kendaraan.nasabahId, n.id)));
  if (!k) return { error: "Pilih kendaraan" };
  if (k.status !== "aktif") return { error: "Kendaraan sudah dijual / tidak dipakai" };
  const [salesAktif] = await db.select({ aktif: users.aktif }).from(users).where(eq(users.id, n.salesId));
  if (!salesAktif?.aktif) return { error: "Sales pemilik nasabah tidak aktif; pindahkan nasabah dulu" };

  const id = await db.transaction(async (tx) => {
    const kode = await kodeBaru(tx);
    const [p] = await tx
      .insert(polis)
      .values({
        kode,
        nasabahId: n.id,
        kendaraanId: k.id,
        salesId: n.salesId,
      })
      .returning({ id: polis.id });
    await tx.insert(statusHistory).values({ polisId: p.id, status: "draft_prospek", oleh: user.id, catatan: "Pengajuan dibuat" });
    return p.id;
  });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "polis", recordId: id });
  revalidatePath("/pengajuan");
  redirect(`/pengajuan/${id}`);
}

/** Langkah 3: nilai pertanggungan (TSI) dicatat admin dari hasil taksiran asuransi. */
export async function simpanNilaiPertanggungan(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  if (!["dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk", "disetujui_nasabah"].includes(p.statusPengajuan))
    return { error: "Nilai pertanggungan dicatat setelah data dikirim ke asuransi" };
  const nilai = parseRupiah(teks(f, "nilaiPertanggungan"));
  if (Number.isNaN(nilai) || nilai <= 0) return { error: "Isi nilai pertanggungan dari asuransi" };
  await db
    .update(polis)
    .set({ nilaiPertanggungan: nilai })
    .where(eq(polis.id, id));
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "polis", recordId: id, detail: { nilaiPertanggungan: nilai } });
  segarkan(id);
  return { ok: "Nilai pertanggungan tersimpan" };
}

// ─── 2. Ajukan (draft → data lengkap) ───

export async function ajukan(id: string): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p = await polisMilik(user, id);
  const cek = await cekKelengkapan(p);
  if (!cek.lengkap) return { error: `Belum lengkap: ${cek.kurang.join(", ")}. Upload di halaman nasabah.` };
  return jalankan(async () => {
    await db.transaction(async (tx) => {
      if (p.statusPengajuan === "perlu_revisi")
        await ubahStatus(tx, { polisId: id, ke: "draft_prospek", oleh: user.id, catatan: "Data diperbaiki" });
      await ubahStatus(tx, { polisId: id, ke: "data_lengkap", oleh: null, catatan: "Dokumen lengkap, siap dikirim ke asuransi" });
    });
    const otomatis = await kirimOtomatisBawaan(id).catch((e) => {
      console.error("[kirim otomatis]", e);
      return null;
    });
    segarkan(id);
    if (otomatis?.adaTerkirim) return { ok: `Data lengkap dan langsung dikirim ke asuransi bawaan: ${otomatis.hasilKirim.join(" · ")}` };
    return { ok: "Pengajuan siap dikirim admin ke asuransi" };
  });
}

// ─── 3. Kirim data ke asuransi (email / WhatsApp) ───

export async function kirimKeAsuransi(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  if (!["data_lengkap", "dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"].includes(p.statusPengajuan))
    return { error: "Pengajuan belum berstatus Data lengkap" };
  const perusahaanIds = f.getAll("perusahaanId").map(String);
  const kanal = f.getAll("kanal").map(String) as ("email" | "wa")[];
  if (perusahaanIds.length === 0) return { error: "Pilih minimal satu asuransi" };
  if (kanal.length === 0) return { error: "Pilih kanal: email dan/atau WhatsApp" };

  const { adaTerkirim, hasilKirim, bukaUrl } = await kirimDataKeAsuransi(id, { perusahaanIds, kanal, pengirim: { id: user.id, nama: user.nama, email: user.email } });
  segarkan(id);
  return adaTerkirim
    ? { ok: hasilKirim.join(" · "), bukaUrl }
    : { error: hasilKirim.join(" · ") || "Tidak ada yang terkirim" };
}

// ─── 4. Survei kendaraan (opsional) ───

export async function catatSurvei(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  await polisMilik(user, id);
  const tgl = teks(f, "tglSurvei");
  if (!tgl) return { error: "Isi tanggal survei" };
  return jalankan(async () => {
    await db.transaction((tx) =>
      ubahStatus(tx, { polisId: id, ke: "survei_kendaraan", oleh: user.id, catatan: `Survei ${tgl}${teks(f, "hasil") ? ` — ${teks(f, "hasil")}` : ""}` }),
    );
    segarkan(id);
    return { ok: "Survei dicatat" };
  });
}

// ─── 5. Penawaran dari asuransi ───

export async function tambahPenawaran(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  if (!["dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"].includes(p.statusPengajuan))
    return { error: "Penawaran dicatat setelah data dikirim ke asuransi" };
  const d = z
    .object({
      perusahaanId: z.string().min(1, "Pilih asuransi"),
      cashbackTotalPersen: z.number({ invalid_type_error: "Isi cashback total %" }).min(0).max(100, "Cashback maks 100%"),
      catatan: z.string().nullable(),
    })
    .safeParse({
      perusahaanId: teks(f, "perusahaanId"),
      cashbackTotalPersen: teks(f, "cashbackTotalPersen") ? parsePersen(teks(f, "cashbackTotalPersen")) : undefined,
      catatan: opsional(f, "catatan"),
    });
  if (!d.success) return { error: d.error.issues[0]?.message };

  // Premi per paket (Biasa/Plus/Complete) sesuai angka dari asuransi; boleh sebagian.
  const paket = await db
    .select({ id: kategoriPolis.id, nama: kategoriPolis.nama })
    .from(kategoriPolis)
    .where(and(eq(kategoriPolis.perusahaanId, d.data.perusahaanId), eq(kategoriPolis.aktif, true)));
  if (paket.length === 0) return { error: "Asuransi ini belum punya paket coverage. Tambahkan di Master data → Asuransi." };
  const baris: { kategoriId: string; premi: number }[] = [];
  for (const k of paket) {
    const v = teks(f, `premi_${k.id}`);
    if (!v) continue;
    const premi = parseRupiah(v);
    if (Number.isNaN(premi) || premi <= 0) return { error: `Premi paket ${k.nama} tidak valid` };
    baris.push({ kategoriId: k.id, premi });
  }
  if (baris.length === 0) return { error: "Isi premi minimal satu paket" };

  return jalankan(async () => {
    const dokumenId = await simpanDokumenPolis(f, "file", id, "penawaran", user.id);
    await db.insert(penawaran).values(baris.map((r) => ({ ...d.data, ...r, polisId: id, dokumenId })));
    if (p.statusPengajuan !== "penawaran_masuk") {
      await db.transaction((tx) => ubahStatus(tx, { polisId: id, ke: "penawaran_masuk", oleh: user.id }));
      await setelahStatus(id, user.id);
    }
    segarkan(id);
    return { ok: `${baris.length} pilihan paket dicatat` };
  });
}

/** Penawaran hanya boleh diubah/dihapus sebelum nasabah menyetujui salah satunya. */
const BOLEH_UBAH_PENAWARAN = ["dikirim_ke_asuransi", "survei_kendaraan", "penawaran_masuk"];

async function penawaranMilik(polisId: string, penawaranId: string) {
  const [pw] = await db
    .select()
    .from(penawaran)
    .where(and(eq(penawaran.id, penawaranId), eq(penawaran.polisId, polisId)));
  return pw ?? null;
}

export async function ubahPenawaran(id: string, penawaranId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  if (!BOLEH_UBAH_PENAWARAN.includes(p.statusPengajuan))
    return { error: "Penawaran sudah disetujui. Batalkan persetujuan dulu untuk mengubahnya." };
  const pw = await penawaranMilik(id, penawaranId);
  if (!pw) return { error: "Penawaran tidak ditemukan" };
  const premi = parseRupiah(teks(f, "premi"));
  const cb = parsePersen(teks(f, "cashbackTotalPersen"));
  if (Number.isNaN(premi) || premi <= 0) return { error: "Premi tidak valid" };
  if (Number.isNaN(cb) || cb < 0 || cb > 100) return { error: "Cashback total harus 0–100%" };
  const kategoriId = teks(f, "kategoriId") || null;
  if (kategoriId) {
    const [k] = await db
      .select({ id: kategoriPolis.id })
      .from(kategoriPolis)
      .where(and(eq(kategoriPolis.id, kategoriId), eq(kategoriPolis.perusahaanId, pw.perusahaanId)));
    if (!k) return { error: "Paket tidak sesuai dengan asuransinya" };
  }
  await db
    .update(penawaran)
    .set({ premi, cashbackTotalPersen: cb, kategoriId, catatan: opsional(f, "catatan") })
    .where(eq(penawaran.id, penawaranId));
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "penawaran", recordId: penawaranId, detail: { premi, cb, kategoriId } });
  segarkan(id);
  return { ok: "Penawaran diperbarui" };
}

export async function hapusPenawaran(id: string, penawaranId: string) {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  if (!BOLEH_UBAH_PENAWARAN.includes(p.statusPengajuan)) return;
  const pw = await penawaranMilik(id, penawaranId);
  if (!pw) return;
  await db.transaction(async (tx) => {
    await tx.delete(penawaran).where(eq(penawaran.id, penawaranId));
    const [{ sisa }] = await tx
      .select({ sisa: sql<number>`count(*)`.mapWith(Number) })
      .from(penawaran)
      .where(eq(penawaran.polisId, id));
    // Penawaran terakhir dihapus → kembali menunggu penawaran (status sebelum "Penawaran masuk").
    if (sisa === 0 && p.statusPengajuan === "penawaran_masuk") {
      const [sebelum] = await tx
        .select({ status: statusHistory.status })
        .from(statusHistory)
        .where(and(eq(statusHistory.polisId, id), inArray(statusHistory.status, ["dikirim_ke_asuransi", "survei_kendaraan"])))
        .orderBy(desc(statusHistory.waktu))
        .limit(1);
      const ke = sebelum?.status ?? "dikirim_ke_asuransi";
      await tx.update(polis).set({ statusPengajuan: ke }).where(eq(polis.id, id));
      await tx.insert(statusHistory).values({ polisId: id, status: ke, oleh: user.id, catatan: "Semua penawaran dihapus" });
    }
  });
  await catatAudit({ userId: user.id, aksi: "hapus", tabel: "penawaran", recordId: penawaranId, detail: pw });
  segarkan(id);
}

/** Batalkan persetujuan nasabah (mis. salah pilih paket): kembali ke "Penawaran masuk", komisi dihapus. */
export async function batalkanPersetujuan(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p = await polisMilik(user, id);
  if (p.statusPengajuan !== "disetujui_nasabah") return { error: "Hanya bisa sebelum polis terbit" };
  const alasan = teks(f, "alasan");
  if (alasan.length < 3) return { error: "Isi alasan pembatalan" };
  await db.transaction(async (tx) => {
    await tx.update(penawaran).set({ dipilih: false }).where(eq(penawaran.polisId, id));
    await tx
      .update(polis)
      .set({
        statusPengajuan: "penawaran_masuk",
        perusahaanId: null,
        kategoriId: null,
        premiBruto: null,
        cashbackTotalPersen: null,
        cashbackTotalRp: null,
        cashbackNasabahPersen: null,
        cashbackNasabahRp: null,
        eventId: null,
        bagiHasilKantorPersen: null,
        bagianKantorRp: null,
        komisiSalesRp: null,
        bagiHasilKantorNormalPersen: null,
        komisiEventRp: null,
      })
      .where(eq(polis.id, id));
    await tx.insert(statusHistory).values({ polisId: id, status: "penawaran_masuk", oleh: user.id, catatan: `Persetujuan dibatalkan: ${alasan}` });
  });
  await catatAudit({ userId: user.id, aksi: "batal_setuju", tabel: "polis", recordId: id, detail: { alasan } });
  segarkan(id);
  return { ok: "Persetujuan dibatalkan; pilih ulang penawaran" };
}

// ─── 6. Disetujui nasabah: pilih penawaran + cashback nasabah → hitung komisi ───

export async function setujuiPenawaran(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p = await polisMilik(user, id);
  if (p.statusPengajuan !== "penawaran_masuk") return { error: "Belum ada penawaran untuk disetujui" };
  const [pw] = await db
    .select()
    .from(penawaran)
    .where(and(eq(penawaran.id, teks(f, "penawaranId")), eq(penawaran.polisId, id)));
  if (!pw) return { error: "Pilih penawaran" };
  const cbNasabah = parsePersen(teks(f, "cashbackNasabahPersen") || "0");
  if (Number.isNaN(cbNasabah)) return { error: "Cashback ke nasabah tidak valid" };

  const [s] = await db.select().from(users).where(eq(users.id, p.salesId));
  const events = await db.select().from(eventBagiHasil).where(eq(eventBagiHasil.aktif, true));
  const tglInput = p.tglInput.toISOString().slice(0, 10);
  const bh = bagiHasilBerlaku(s, tglInput, events);

  return jalankan(async () => {
    const k = hitungKomisi({
      premiBruto: pw.premi,
      cashbackTotalPersen: pw.cashbackTotalPersen,
      cashbackNasabahPersen: cbNasabah,
      maksCashbackNasabahPersen: s.maksCashbackNasabahPersen,
      bagiHasilKantorPersen: bh.persen,
      bagiHasilKantorNormalPersen: s.bagiHasilKantorPersen,
    });
    await db.transaction(async (tx) => {
      await tx.update(penawaran).set({ dipilih: false }).where(eq(penawaran.polisId, id));
      await tx.update(penawaran).set({ dipilih: true }).where(eq(penawaran.id, pw.id));
      const [a] = await tx.select({ nama: perusahaanAsuransi.nama }).from(perusahaanAsuransi).where(eq(perusahaanAsuransi.id, pw.perusahaanId));
      const [kat] = pw.kategoriId
        ? await tx.select({ nama: kategoriPolis.nama }).from(kategoriPolis).where(eq(kategoriPolis.id, pw.kategoriId))
        : [];
      await ubahStatus(tx, {
        polisId: id,
        ke: "disetujui_nasabah",
        oleh: user.id,
        catatan: `${a?.nama}${kat ? ` ${kat.nama}` : ""} ${rupiah(pw.premi)}, cashback nasabah ${cbNasabah}%`,
        patch: {
          perusahaanId: pw.perusahaanId,
          kategoriId: pw.kategoriId ?? p.kategoriId,
          premiBruto: pw.premi,
          cashbackTotalPersen: pw.cashbackTotalPersen,
          cashbackTotalRp: k.cashbackTotalRp,
          cashbackNasabahPersen: cbNasabah,
          cashbackNasabahRp: k.cashbackNasabahRp,
          eventId: bh.eventId,
          bagiHasilKantorPersen: bh.persen,
          bagianKantorRp: k.bagianKantorRp,
          komisiSalesRp: k.komisiSalesRp,
          bagiHasilKantorNormalPersen: s.bagiHasilKantorPersen,
          komisiEventRp: k.komisiEventRp,
        },
      });
    });
    segarkan(id);
    return {
      ok:
        user.role === "admin"
          ? `Disetujui. Komisi sales ${rupiah(k.komisiSalesRp)}${k.komisiEventRp > 0 ? ` (dasar ${rupiah(k.komisiDasarRp)} + event ${rupiah(k.komisiEventRp)})` : ""}`
          : `Disetujui. Komisi Anda ${rupiah(k.komisiSalesRp)}${k.komisiEventRp > 0 ? ` (reguler ${rupiah(k.komisiDasarRp)} + bonus event ${rupiah(k.komisiEventRp)})` : ""}`,
    };
  });
}

// ─── 7. Polis terbit ───

export async function terbitkanPolis(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  if (p.statusPengajuan !== "disetujui_nasabah") return { error: "Polis diterbitkan setelah penawaran disetujui nasabah" };
  const noPolis = teks(f, "noPolis");
  const tglMulai = teks(f, "tglMulai");
  const tglAkhir = teks(f, "tglAkhir");
  const batasBayar = teks(f, "batasBayar");
  const rekeningId = teks(f, "rekeningPembayaranId");
  if (!noPolis) return { error: "Isi nomor polis" };
  if (!p.nilaiPertanggungan) return { error: "Isi nilai pertanggungan dari asuransi dulu (langkah 3)" };
  if (!tglMulai || !tglAkhir || tglAkhir <= tglMulai) return { error: "Periode polis tidak valid" };
  if (!batasBayar) return { error: "Isi batas bayar" };
  const [r] = await db
    .select({ id: rekening.id })
    .from(rekening)
    .where(and(eq(rekening.id, rekeningId), eq(rekening.pemilikTipe, "pembayaran"), eq(rekening.aktif, true)));
  if (!r) return { error: "Pilih rekening pembayaran" };
  const file = f.get("filePolis");
  if (!(file instanceof File) || file.size === 0) return { error: "Upload PDF polis dari asuransi" };

  return jalankan(async () => {
    await simpanDokumenPolis(f, "filePolis", id, "polis", user.id);
    await db.transaction(async (tx) => {
      await ubahStatus(tx, {
        polisId: id,
        ke: "polis_terbit",
        oleh: user.id,
        catatan: `No. polis ${noPolis}`,
        patch: { noPolis, tglMulai, tglAkhir, batasBayar, rekeningPembayaranId: r.id },
      });
      // Perpanjangan terbit → polis lama selesai diurus.
      if (p.polisSebelumnyaId) await tx.update(polis).set({ statusMasa: "diperpanjang" }).where(eq(polis.id, p.polisSebelumnyaId));
    });
    if (f.get("kirimOtomatis") === "on") {
      const h = await prosesInstruksi(id, user.id);
      segarkan(id);
      return h.kanal === "wame"
        ? { ok: "Polis terbit. Fonnte tidak tersedia — kirim instruksi dari WhatsApp yang terbuka.", bukaUrl: h.url }
        : { ok: "Polis terbit dan instruksi pembayaran terkirim ke nasabah" };
    }
    await setelahStatus(id, user.id);
    segarkan(id);
    return { ok: "Polis terbit" };
  });
}

// ─── 8. Instruksi pembayaran ───

async function prosesInstruksi(id: string, userId: string) {
  const [pdf] = await db
    .select()
    .from(dokumen)
    .where(and(eq(dokumen.pemilikTipe, "polis"), eq(dokumen.pemilikId, id), eq(dokumen.jenis, "polis")))
    .orderBy(desc(dokumen.dibuat))
    .limit(1);
  if (!pdf) throw new TransisiTidakSah("PDF polis belum diupload");
  const { baris, vars } = await varsPesanNasabah(id);
  if (!baris.r) throw new TransisiTidakSah("Rekening pembayaran belum dipilih");
  const isi = await isiTemplate("instruksi_bayar", vars);
  const url = await buatLinkUnduh(pdf.id, 14);
  const h = await kirimPesan({
    ke: baris.n.noWa,
    isi,
    jenis: "instruksi_bayar",
    polisId: id,
    userId,
    lampiranUrl: url,
    namaLampiran: `Polis ${baris.p.noPolis ?? baris.p.kode}.pdf`,
  });
  if (baris.p.statusPengajuan === "polis_terbit") {
    await db.transaction((tx) =>
      ubahStatus(tx, { polisId: id, ke: "menunggu_bayar", oleh: userId, catatan: `Instruksi bayar dikirim (${h.kanal === "fonnte" ? "WhatsApp kantor" : "wa.me"})` }),
    );
  }
  return h;
}

export async function kirimInstruksi(id: string): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p = await polisMilik(user, id);
  if (!["polis_terbit", "menunggu_bayar"].includes(p.statusPengajuan)) return { error: "Instruksi dikirim setelah polis terbit" };
  return jalankan(async () => {
    const h = await prosesInstruksi(id, user.id);
    segarkan(id);
    if (h.kanal === "optout") return { error: "Nasabah memilih berhenti menerima pesan" };
    if (h.kanal === "wame") return { ok: "Fonnte tidak tersedia — kirim dari WhatsApp yang terbuka", bukaUrl: h.url };
    return { ok: "Instruksi pembayaran + PDF polis terkirim dari WhatsApp kantor" };
  });
}

// ─── 9. Lunas ───

export async function tandaiLunas(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p = await polisMilik(user, id);
  if (!["polis_terbit", "menunggu_bayar"].includes(p.statusPengajuan)) return { error: "Status belum menunggu pembayaran" };
  const tgl = teks(f, "tglBayar");
  if (!tgl) return { error: "Isi tanggal bayar" };
  const bukti = f.get("bukti");
  const adaFile = bukti instanceof File && bukti.size > 0;
  if (!adaFile) {
    // Boleh tanpa upload bila nasabah sudah mengirim bukti lewat link tracker.
    const [dariNasabah] = await db
      .select({ id: dokumen.id })
      .from(dokumen)
      .where(and(eq(dokumen.pemilikTipe, "polis"), eq(dokumen.pemilikId, id), eq(dokumen.jenis, "bukti_bayar_nasabah")))
      .limit(1);
    if (!dariNasabah) return { error: "Upload bukti transfer nasabah" };
  }

  return jalankan(async () => {
    const buktiId = await simpanDokumenPolis(f, "bukti", id, "bukti_bayar_nasabah", user.id);
    await db.transaction(async (tx) => {
      if (p.statusPengajuan === "polis_terbit")
        await ubahStatus(tx, { polisId: id, ke: "menunggu_bayar", oleh: user.id, catatan: "Dibayar sebelum instruksi dikirim" });
      await ubahStatus(tx, {
        polisId: id,
        ke: "lunas",
        oleh: user.id,
        catatan: `Dibayar ${tgl}`,
        patch: { statusBayar: "lunas", tglBayar: tgl, statusMasa: "aktif" },
      });
      await kasOtomatis(tx, {
        polisId: id,
        kategori: "premi_masuk",
        nominal: p.premiBruto,
        tanggal: tgl,
        rekeningId: p.rekeningPembayaranId,
        keterangan: `Premi ${p.noPolis ?? p.kode}`,
        oleh: user.id,
        buktiDokumenId: buktiId,
      });
    });
    try {
      const { baris, vars } = await varsPesanNasabah(id);
      await kirimPesan({ ke: baris.n.noWa, isi: await isiTemplate("pembayaran_diterima", vars), jenis: "notifikasi", polisId: id, userId: user.id });
    } catch (e) {
      console.error("[pesan lunas]", e);
    }
    segarkan(id);
    return { ok: "Ditandai lunas; nasabah mendapat konfirmasi" };
  });
}

// ─── 10–12. Setor premi, cashback cair, transfer (admin) ───

export async function catatSetor(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  const tgl = teks(f, "tglSetor");
  if (!tgl) return { error: "Isi tanggal setor" };
  return jalankan(async () => {
    await db.transaction(async (tx) => {
      await ubahStatus(tx, { polisId: id, ke: "premi_disetor", oleh: user.id, catatan: `Disetor ${tgl}`, patch: { tglSetorAsuransi: tgl } });
      await kasOtomatis(tx, { polisId: id, kategori: "setor_premi", nominal: p.premiBruto, tanggal: tgl, keterangan: `Setor premi ${p.noPolis ?? p.kode}`, oleh: user.id });
    });
    segarkan(id);
    return { ok: "Setoran premi dicatat" };
  });
}

export async function catatCair(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  const tgl = teks(f, "tglCair");
  const nominal = parseRupiah(teks(f, "nominal"));
  if (!tgl) return { error: "Isi tanggal cair" };
  if (Number.isNaN(nominal) || nominal <= 0) return { error: "Isi nominal cashback yang cair" };
  return jalankan(async () => {
    const buktiId = await simpanDokumenPolis(f, "bukti", id, "bukti_cair_asuransi", user.id);
    await db.transaction(async (tx) => {
      await ubahStatus(tx, {
        polisId: id,
        ke: "cashback_cair",
        oleh: user.id,
        catatan: `Dana asuransi cair ${tgl}`,
        patch: { tglCairAsuransi: tgl, nominalCairAsuransi: nominal },
      });
      await kasOtomatis(tx, { polisId: id, kategori: "dana_asuransi", nominal, tanggal: tgl, keterangan: `Cashback cair ${p.noPolis ?? p.kode}`, oleh: user.id, buktiDokumenId: buktiId });
    });
    segarkan(id);
    return { ok: "Pencairan dicatat" };
  });
}

export async function catatTransfer(id: string, jenis: "nasabah" | "sales", _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = await polisMilik(user, id);
  const tgl = teks(f, "tgl");
  if (!tgl) return { error: "Isi tanggal transfer" };
  const boleh: StatusPengajuan[] =
    jenis === "nasabah" ? ["lunas", "premi_disetor", "cashback_cair"] : ["cashback_cair"];
  if (!boleh.includes(p.statusPengajuan))
    return { error: jenis === "nasabah" ? "Cashback nasabah ditransfer setelah premi lunas" : "Komisi ditransfer setelah dana asuransi cair" };

  return jalankan(async () => {
    const buktiId = await simpanDokumenPolis(f, "bukti", id, jenis === "nasabah" ? "bukti_transfer_cashback_nasabah" : "bukti_transfer_komisi", user.id);
    await transferPolis(id, jenis, { tgl, oleh: user.id, buktiDokumenId: buktiId });
    segarkan(id);
    return { ok: "Transfer dicatat" };
  });
}

// ─── Cabang: perlu revisi, ditolak, batal ───

export async function ubahCabang(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p0 = await polisMilik(user, id);
  const ke = teks(f, "ke") as StatusPengajuan;
  if (!["perlu_revisi", "ditolak_asuransi", "batal_nasabah", "batal_salah_input"].includes(ke)) return { error: "Status tidak valid" };
  if (user.role !== "admin" && ke !== "batal_nasabah" && ke !== "batal_salah_input") return { error: "Hanya admin" };
  const catatan = teks(f, "catatan");
  if (catatan.length < 3) return { error: "Isi alasan / catatan" };
  return jalankan(async () => {
    await db.transaction(async (tx) => {
      await ubahStatus(tx, {
        polisId: id,
        ke,
        oleh: user.id,
        catatan: ke === "batal_salah_input" && p0.polisSebelumnyaId ? `${catatan} (tautan perpanjangan ke polis lama dilepas)` : catatan,
        // Salah input: data komisi dikosongkan, dan tautan ke polis lama dilepas supaya
        // perpanjangan yang benar bisa dibuat ulang dari polis yang sama.
        patch:
          ke === "batal_salah_input"
            ? { polisSebelumnyaId: null, eventId: null, bagiHasilKantorPersen: null, bagiHasilKantorNormalPersen: null, bagianKantorRp: null, komisiSalesRp: null, komisiEventRp: null }
            : undefined,
      });
      if (ke === "batal_salah_input") {
        await tx.update(trackerLink).set({ dicabut: new Date() }).where(and(eq(trackerLink.polisId, id), sql`${trackerLink.dicabut} is null`));
      }
    });
    await setelahStatus(id, user.id);
    segarkan(id);
    return { ok: `Status: ${labelStatus(ke)}` };
  });
}

// ─── Link tracker nasabah ───

export async function bagikanTracker(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  await polisMilik(user, id);
  const t = await pastikanTracker(id, user.id);
  const { baris, vars } = await varsPesanNasabah(id);
  const isi = await isiTemplate("tracker", { ...vars, link_tracker: urlTracker(t.token) });
  if (teks(f, "kanal") === "wame") {
    return { ok: "WhatsApp dibuka", bukaUrl: linkWaMe(baris.n.noWa, isi) };
  }
  const h = await kirimPesan({ ke: baris.n.noWa, isi, jenis: "tracker", polisId: id, userId: user.id });
  segarkan(id);
  if (h.kanal === "wame") return { ok: "Fonnte tidak tersedia — kirim dari WhatsApp yang terbuka", bukaUrl: h.url };
  if (h.kanal === "optout") return { error: "Nasabah memilih berhenti menerima pesan" };
  return { ok: "Link tracker terkirim ke WhatsApp nasabah" };
}

export async function buatUlangTracker(id: string) {
  const { user } = await wajibLogin();
  await polisMilik(user, id);
  const t = await trackerAktif(id);
  if (t) await db.update(trackerLink).set({ dicabut: new Date() }).where(eq(trackerLink.id, t.id));
  await pastikanTracker(id, user.id);
  await catatAudit({ userId: user.id, aksi: "tracker_baru", tabel: "polis", recordId: id });
  segarkan(id);
}

export async function cabutTracker(id: string) {
  const { user } = await wajibLogin();
  await polisMilik(user, id);
  await db
    .update(trackerLink)
    .set({ dicabut: new Date() })
    .where(and(eq(trackerLink.polisId, id), sql`${trackerLink.dicabut} is null`));
  await catatAudit({ userId: user.id, aksi: "tracker_cabut", tabel: "polis", recordId: id });
  segarkan(id);
}
