"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  dokumen,
  eventBagiHasil,
  kategoriPolis,
  kendaraan,
  kirimAsuransiLog,
  kontakAsuransi,
  nasabah,
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
import { FileTidakValid, bacaFile, simpanFile, tipeKonten } from "@/lib/storage";
import { bagiHasilBerlaku, hitungKomisi, KomisiError } from "@/lib/domain/komisi";
import { labelStatus } from "@/lib/domain/journey";
import { parsePersen, parseRupiah, rupiah } from "@/lib/format";
import { escapeHtml, kirimEmail, type Lampiran } from "@/lib/email";
import { isiTemplate, kirimPesan } from "@/lib/pesan";
import { buatLinkUnduh } from "@/lib/unduh";
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

  const nilai = teks(f, "nilaiPertanggungan") ? parseRupiah(teks(f, "nilaiPertanggungan")) : null;
  if (nilai !== null && (Number.isNaN(nilai) || nilai <= 0)) return { error: "Nilai pertanggungan tidak valid" };
  const kategoriId = opsional(f, "kategoriId");
  const perluasan = f.getAll("perluasanDiminta").map(String).filter(Boolean);

  const id = await db.transaction(async (tx) => {
    const kode = await kodeBaru(tx);
    const [p] = await tx
      .insert(polis)
      .values({
        kode,
        nasabahId: n.id,
        kendaraanId: k.id,
        salesId: n.salesId,
        kategoriId,
        nilaiPertanggungan: nilai,
        perluasanDiminta: perluasan,
        polisSebelumnyaId: opsional(f, "polisSebelumnyaId"),
      })
      .returning({ id: polis.id });
    await tx.insert(statusHistory).values({ polisId: p.id, status: "draft_prospek", oleh: user.id, catatan: "Pengajuan dibuat" });
    return p.id;
  });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "polis", recordId: id });
  revalidatePath("/pengajuan");
  redirect(`/pengajuan/${id}`);
}

export async function ubahDataPengajuan(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p = await polisMilik(user, id);
  if (!["draft_prospek", "perlu_revisi", "data_lengkap"].includes(p.statusPengajuan))
    return { error: "Data hanya bisa diubah sebelum dikirim ke asuransi" };
  const nilai = teks(f, "nilaiPertanggungan") ? parseRupiah(teks(f, "nilaiPertanggungan")) : null;
  if (nilai !== null && (Number.isNaN(nilai) || nilai <= 0)) return { error: "Nilai pertanggungan tidak valid" };
  await db
    .update(polis)
    .set({ nilaiPertanggungan: nilai, kategoriId: opsional(f, "kategoriId"), perluasanDiminta: f.getAll("perluasanDiminta").map(String) })
    .where(eq(polis.id, id));
  segarkan(id);
  return { ok: "Tersimpan" };
}

// ─── 2. Ajukan (draft → data lengkap) ───

export async function ajukan(id: string): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p = await polisMilik(user, id);
  if (!p.nilaiPertanggungan) return { error: "Isi nilai pertanggungan dulu" };
  const cek = await cekKelengkapan(p);
  if (!cek.lengkap) return { error: `Belum lengkap: ${cek.kurang.join(", ")}. Upload di halaman nasabah.` };
  return jalankan(async () => {
    await db.transaction(async (tx) => {
      if (p.statusPengajuan === "perlu_revisi")
        await ubahStatus(tx, { polisId: id, ke: "draft_prospek", oleh: user.id, catatan: "Data diperbaiki" });
      await ubahStatus(tx, { polisId: id, ke: "data_lengkap", oleh: null, catatan: "Dokumen lengkap, siap dikirim ke asuransi" });
    });
    segarkan(id);
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

  const [b] = await db
    .select({ n: nasabah, k: kendaraan, kat: kategoriPolis })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .leftJoin(kategoriPolis, eq(kategoriPolis.id, polis.kategoriId))
    .where(eq(polis.id, id));
  const docs = await db
    .select()
    .from(dokumen)
    .where(
      sql`(${dokumen.pemilikTipe} = 'nasabah' and ${dokumen.pemilikId} = ${p.nasabahId})
       or (${dokumen.pemilikTipe} = 'kendaraan' and ${dokumen.pemilikId} = ${p.kendaraanId})`,
    );

  const baris: [string, string][] = [
    ["Nama tertanggung", b.n.nama],
    ["NIK", b.n.nik ?? "-"],
    ["Alamat", b.n.alamat ?? "-"],
    ["Kendaraan", `${b.k.merek} ${b.k.model} (${b.k.tahun})`],
    ["No. polisi", b.k.noPolisi],
    ["Warna", b.k.warna ?? "-"],
    ["No. rangka", b.k.noRangka ?? "-"],
    ["No. mesin", b.k.noMesin ?? "-"],
    ["Nilai pertanggungan", rupiah(p.nilaiPertanggungan)],
    ["Produk diminta", b.kat ? `${b.kat.namaProduk} (${b.kat.jenis})` : "-"],
    ["Perluasan diminta", p.perluasanDiminta.join(", ") || "-"],
  ];
  const teksData = baris.map(([k, v]) => `${k}: ${v}`).join("\n");
  const htmlData = `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${baris
    .map(([k, v]) => `<tr><td style="color:#6b7280">${escapeHtml(k)}</td><td><b>${escapeHtml(v)}</b></td></tr>`)
    .join("")}</table>`;

  let lampiranEmail: Lampiran[] | null = null;
  const lampiranNama = docs.map((d) => d.namaFile ?? d.jenis);
  const hasilKirim: string[] = [];
  let adaTerkirim = false;
  // wa.me cadangan hanya bisa membuka satu chat; sisanya tercatat di riwayat kirim.
  let bukaUrl: string | undefined;

  for (const pid of perusahaanIds) {
    const [a] = await db.select().from(perusahaanAsuransi).where(eq(perusahaanAsuransi.id, pid));
    if (!a) continue;
    const kontak = await db
      .select()
      .from(kontakAsuransi)
      .where(eq(kontakAsuransi.perusahaanId, pid))
      .orderBy(desc(kontakAsuransi.utama));
    const subjek = `Permohonan penawaran asuransi mobil ${b.k.noPolisi} — ${p.kode}`;

    if (kanal.includes("email")) {
      const k = kontak.find((x) => x.email);
      if (!k) hasilKirim.push(`${a.nama}: email PIC belum ada`);
      else {
        lampiranEmail ??= await Promise.all(
          docs.map(async (d) => ({ namaFile: d.namaFile ?? `${d.jenis}.${d.fileKey.split(".").pop()}`, tipe: tipeKonten(d.fileKey), isi: await bacaFile(d.fileKey) })),
        );
        const r = await kirimEmail({
          ke: k.email!,
          subjek,
          balasKe: user.email ?? undefined,
          teks: `Yth. ${k.namaPic},\n\nMohon penawaran asuransi mobil dengan data berikut:\n\n${teksData}\n\nTerlampir KTP, STNK, dan foto kendaraan.\n\nTerima kasih,\n${user.nama}`,
          html: `<p>Yth. ${escapeHtml(k.namaPic)},</p><p>Mohon penawaran asuransi mobil dengan data berikut:</p>${htmlData}<p>Terlampir KTP, STNK, dan foto kendaraan.</p><p>Terima kasih,<br>${escapeHtml(user.nama)}</p>`,
          lampiran: lampiranEmail,
        });
        await db.insert(kirimAsuransiLog).values({
          polisId: id,
          perusahaanId: pid,
          kontakId: k.id,
          kanal: "email",
          tujuan: k.email!,
          lampiran: lampiranNama,
          hasil: r.ok ? "terkirim" : "gagal",
          oleh: user.id,
        });
        hasilKirim.push(`${a.nama} email: ${r.ok ? "terkirim" : `gagal (${r.alasan})`}`);
        adaTerkirim ||= r.ok;
      }
    }

    if (kanal.includes("wa")) {
      const k = kontak.find((x) => x.noWa);
      if (!k) hasilKirim.push(`${a.nama}: WhatsApp PIC belum ada`);
      else {
        const links = await Promise.all(docs.map(async (d) => `- ${d.jenis.replace("_", " ")}: ${await buatLinkUnduh(d.id, 30)}`));
        const isi = `Yth. ${k.namaPic} (${a.nama}),\nMohon penawaran asuransi mobil — ${p.kode}\n\n${teksData}\n\nDokumen:\n${links.join("\n")}\n\nTerima kasih,\n${user.nama}`;
        const r = await kirimPesan({ ke: k.noWa!, isi, jenis: "kirim_asuransi", polisId: id, userId: user.id });
        await db.insert(kirimAsuransiLog).values({
          polisId: id,
          perusahaanId: pid,
          kontakId: k.id,
          kanal: "wa",
          tujuan: k.noWa!,
          lampiran: lampiranNama,
          hasil: r.kanal === "fonnte" ? "terkirim" : "dibuka_wa",
          oleh: user.id,
        });
        hasilKirim.push(`${a.nama} WhatsApp: ${r.kanal === "fonnte" ? "terkirim" : "buka WhatsApp untuk mengirim"}`);
        adaTerkirim = true;
        if (r.kanal === "wame") bukaUrl ??= r.url;
      }
    }
  }

  if (adaTerkirim && p.statusPengajuan === "data_lengkap") {
    await db.transaction((tx) =>
      ubahStatus(tx, { polisId: id, ke: "dikirim_ke_asuransi", oleh: user.id, catatan: hasilKirim.join("; ") }),
    );
  }
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
      premi: z.number({ invalid_type_error: "Isi premi" }).positive("Premi harus lebih dari 0"),
      ratePersen: z.number().min(0).max(100).nullable(),
      cashbackTotalPersen: z.number({ invalid_type_error: "Isi cashback total %" }).min(0).max(100, "Cashback maks 100%"),
      catatan: z.string().nullable(),
    })
    .safeParse({
      perusahaanId: teks(f, "perusahaanId"),
      premi: teks(f, "premi") ? parseRupiah(teks(f, "premi")) : undefined,
      ratePersen: teks(f, "ratePersen") ? parsePersen(teks(f, "ratePersen")) : null,
      cashbackTotalPersen: teks(f, "cashbackTotalPersen") ? parsePersen(teks(f, "cashbackTotalPersen")) : undefined,
      catatan: opsional(f, "catatan"),
    });
  if (!d.success) return { error: d.error.issues[0]?.message };

  return jalankan(async () => {
    const dokumenId = await simpanDokumenPolis(f, "file", id, "penawaran", user.id);
    await db.insert(penawaran).values({ ...d.data, polisId: id, dokumenId });
    if (p.statusPengajuan !== "penawaran_masuk") {
      await db.transaction((tx) => ubahStatus(tx, { polisId: id, ke: "penawaran_masuk", oleh: user.id }));
      await setelahStatus(id, user.id);
    }
    segarkan(id);
    return { ok: "Penawaran dicatat" };
  });
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
    });
    await db.transaction(async (tx) => {
      await tx.update(penawaran).set({ dipilih: false }).where(eq(penawaran.polisId, id));
      await tx.update(penawaran).set({ dipilih: true }).where(eq(penawaran.id, pw.id));
      const [a] = await tx.select({ nama: perusahaanAsuransi.nama }).from(perusahaanAsuransi).where(eq(perusahaanAsuransi.id, pw.perusahaanId));
      await ubahStatus(tx, {
        polisId: id,
        ke: "disetujui_nasabah",
        oleh: user.id,
        catatan: `${a?.nama} ${rupiah(pw.premi)}, cashback nasabah ${cbNasabah}%`,
        patch: {
          perusahaanId: pw.perusahaanId,
          premiBruto: pw.premi,
          cashbackTotalPersen: pw.cashbackTotalPersen,
          cashbackTotalRp: k.cashbackTotalRp,
          cashbackNasabahPersen: cbNasabah,
          cashbackNasabahRp: k.cashbackNasabahRp,
          eventId: bh.eventId,
          bagiHasilKantorPersen: bh.persen,
          bagianKantorRp: k.bagianKantorRp,
          komisiSalesRp: k.komisiSalesRp,
        },
      });
    });
    segarkan(id);
    return { ok: `Disetujui. Komisi sales ${rupiah(k.komisiSalesRp)}` };
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
    await db.transaction((tx) =>
      ubahStatus(tx, {
        polisId: id,
        ke: "polis_terbit",
        oleh: user.id,
        catatan: `No. polis ${noPolis}`,
        patch: { noPolis, tglMulai, tglAkhir, batasBayar, rekeningPembayaranId: r.id },
      }),
    );
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
  if (!(bukti instanceof File) || bukti.size === 0) return { error: "Upload bukti transfer nasabah" };

  return jalankan(async () => {
    await simpanDokumenPolis(f, "bukti", id, "bukti_bayar_nasabah", user.id);
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
  await polisMilik(user, id);
  const tgl = teks(f, "tglSetor");
  if (!tgl) return { error: "Isi tanggal setor" };
  return jalankan(async () => {
    await db.transaction((tx) =>
      ubahStatus(tx, { polisId: id, ke: "premi_disetor", oleh: user.id, catatan: `Disetor ${tgl}`, patch: { tglSetorAsuransi: tgl } }),
    );
    segarkan(id);
    return { ok: "Setoran premi dicatat" };
  });
}

export async function catatCair(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  await polisMilik(user, id);
  const tgl = teks(f, "tglCair");
  const nominal = parseRupiah(teks(f, "nominal"));
  if (!tgl) return { error: "Isi tanggal cair" };
  if (Number.isNaN(nominal) || nominal <= 0) return { error: "Isi nominal cashback yang cair" };
  return jalankan(async () => {
    await simpanDokumenPolis(f, "bukti", id, "bukti_cair_asuransi", user.id);
    await db.transaction((tx) =>
      ubahStatus(tx, {
        polisId: id,
        ke: "cashback_cair",
        oleh: user.id,
        catatan: `Cair ${tgl} ${rupiah(nominal)}`,
        patch: { tglCairAsuransi: tgl, nominalCairAsuransi: nominal },
      }),
    );
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
    return { error: jenis === "nasabah" ? "Cashback nasabah ditransfer setelah premi lunas" : "Komisi ditransfer setelah cashback cair" };

  return jalankan(async () => {
    const buktiId = await simpanDokumenPolis(f, "bukti", id, jenis === "nasabah" ? "bukti_transfer_cashback_nasabah" : "bukti_transfer_komisi", user.id);
    const patch = jenis === "nasabah" ? { tglTransferNasabah: tgl } : { tglTransferSales: tgl };
    const [baru] = await db.update(polis).set(patch).where(eq(polis.id, id)).returning();
    await db.insert(statusHistory).values({
      polisId: id,
      status: baru.statusPengajuan,
      oleh: user.id,
      catatan: jenis === "nasabah" ? `Cashback nasabah ditransfer ${tgl}` : `Komisi sales ditransfer ${tgl}`,
    });
    if (baru.statusPengajuan === "cashback_cair" && baru.tglTransferNasabah && baru.tglTransferSales) {
      await db.transaction((tx) => ubahStatus(tx, { polisId: id, ke: "selesai", oleh: user.id, catatan: "Cashback nasabah & komisi sales sudah ditransfer" }));
    }
    if (jenis === "nasabah") {
      try {
        const { baris, vars } = await varsPesanNasabah(id);
        const [r] = await db
          .select()
          .from(rekening)
          .where(and(eq(rekening.pemilikTipe, "nasabah"), eq(rekening.pemilikId, baris.n.id), eq(rekening.utama, true)));
        let isi = await isiTemplate("cashback_ditransfer", { ...vars, rekening_nasabah: r ? `${r.namaBank} ${r.noRekening}` : "rekening Bapak/Ibu" });
        // Template menyebut bukti terlampir; tanpa bukti, kalimat itu dihapus.
        if (!buktiId) isi = isi.replace(/\s*Bukti transfer terlampir\.?/i, "");
        await kirimPesan({
          ke: baris.n.noWa,
          isi,
          jenis: "notifikasi",
          polisId: id,
          userId: user.id,
          ...(buktiId ? { lampiranUrl: await buatLinkUnduh(buktiId, 30), namaLampiran: "Bukti transfer cashback" } : {}),
        });
      } catch (e) {
        console.error("[pesan cashback]", e);
      }
    }
    segarkan(id);
    return { ok: "Transfer dicatat" };
  });
}

// ─── Cabang: perlu revisi, ditolak, batal ───

export async function ubahCabang(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  await polisMilik(user, id);
  const ke = teks(f, "ke") as StatusPengajuan;
  if (!["perlu_revisi", "ditolak_asuransi", "batal_nasabah"].includes(ke)) return { error: "Status tidak valid" };
  if (user.role !== "admin" && ke !== "batal_nasabah") return { error: "Hanya admin" };
  const catatan = teks(f, "catatan");
  if (catatan.length < 3) return { error: "Isi alasan / catatan" };
  return jalankan(async () => {
    await db.transaction((tx) => ubahStatus(tx, { polisId: id, ke, oleh: user.id, catatan }));
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
