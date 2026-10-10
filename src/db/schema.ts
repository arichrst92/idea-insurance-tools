// Skema database Sistem Rekap Asuransi Mobil (insurance.ide.asia).
// Nama kolom ditulis camelCase di sini dan otomatis menjadi snake_case di
// PostgreSQL (opsi `casing: "snake_case"` di db client & drizzle.config).
// Rupiah: numeric(15,0) (rupiah bulat). Persen: numeric(5,2).

import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  pgSequence,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createId } from "../lib/id";

const id = () => text().primaryKey().$defaultFn(createId);
const rupiah = () => numeric({ precision: 15, scale: 0, mode: "number" });
const persen = () => numeric({ precision: 5, scale: 2, mode: "number" });
const waktu = () => timestamp({ withTimezone: true, mode: "date" });
const tanggal = () => date({ mode: "string" });
const dibuat = () => waktu().notNull().defaultNow();

// ───────────────────────── Enum ─────────────────────────

export const roleEnum = pgEnum("role", ["admin", "sales"]);
export const tipeSalesEnum = pgEnum("tipe_sales", ["fulltime", "freelance"]);
export const targetUtamaEnum = pgEnum("target_utama", ["case", "revenue"]);
export const berlakuEventEnum = pgEnum("berlaku_event", ["semua", "fulltime", "freelance", "pilihan"]);
export const tipeNasabahEnum = pgEnum("tipe_nasabah", ["perorangan", "badan"]);
export const statusKendaraanEnum = pgEnum("status_kendaraan", ["aktif", "dijual", "tidak_dipakai"]);
export const pemilikRekeningEnum = pgEnum("pemilik_rekening", ["sales", "nasabah", "pembayaran", "kantor"]);

/** 12 langkah journey (urutan = urutan langkah) + 3 cabang. */
export const STATUS_PENGAJUAN = [
  "draft_prospek",
  "data_lengkap",
  "dikirim_ke_asuransi",
  "survei_kendaraan",
  "penawaran_masuk",
  "disetujui_nasabah",
  "polis_terbit",
  "menunggu_bayar",
  "lunas",
  "premi_disetor",
  "cashback_cair",
  "selesai",
  "perlu_revisi",
  "ditolak_asuransi",
  "batal_nasabah",
] as const;
export const statusPengajuanEnum = pgEnum("status_pengajuan", STATUS_PENGAJUAN);

export const statusMasaEnum = pgEnum("status_masa", [
  "aktif",
  "akan_habis",
  "expired",
  "diperpanjang",
  "kendaraan_dijual",
  "batal",
]);
export const statusBayarEnum = pgEnum("status_bayar", ["belum_dibayar", "lunas"]);
export const kanalKirimEnum = pgEnum("kanal_kirim", ["email", "wa"]);
export const hasilKirimEnum = pgEnum("hasil_kirim", ["terkirim", "gagal", "dibuka_wa"]);
export const arahKasEnum = pgEnum("arah_kas", ["masuk", "keluar"]);
export const sumberKasEnum = pgEnum("sumber_kas", ["otomatis", "manual"]);
export const pemilikDokumenEnum = pgEnum("pemilik_dokumen", ["nasabah", "kendaraan", "polis", "klaim", "kas"]);
export const jenisDokumenEnum = pgEnum("jenis_dokumen", [
  "ktp",
  "stnk",
  "foto_kendaraan",
  "hasil_survei",
  "penawaran",
  "polis",
  "bukti_bayar_nasabah",
  "bukti_cair_asuransi",
  "bukti_transfer_cashback_nasabah",
  "bukti_transfer_komisi",
  "bukti_penarikan",
  "foto_klaim",
]);
export const arahWaEnum = pgEnum("arah_wa", ["keluar", "masuk"]);
export const jenisWaEnum = pgEnum("jenis_wa", [
  "otp",
  "instruksi_bayar",
  "remind",
  "notifikasi",
  "kirim_asuransi",
  "balasan",
  "tracker",
]);
export const kanalWaEnum = pgEnum("kanal_wa", ["fonnte", "wame"]);
export const statusWaEnum = pgEnum("status_wa", ["antre", "terkirim", "diterima", "dibaca", "gagal"]);
export const formatEksporEnum = pgEnum("format_ekspor", ["pdf", "excel"]);
export const statusJobEnum = pgEnum("status_job", ["antre", "proses", "selesai", "gagal"]);
export const statusOtomasiEnum = pgEnum("status_otomasi", ["sukses", "gagal"]);
export const jenisJadwalBayarEnum = pgEnum("jenis_jadwal_bayar", ["cashback_nasabah", "komisi", "gaji"]);
export const statusJadwalBayarEnum = pgEnum("status_jadwal_bayar", [
  "terjadwal",
  "menunggu",
  "siap",
  "diekspor",
  "dibayar",
]);
export const jenisFileBatchEnum = pgEnum("jenis_file_batch", ["sesama_bca", "antarbank"]);

// ───────────────────────── Pengguna & sesi ─────────────────────────

export const users = pgTable("users", {
  id: id(),
  nama: text().notNull(),
  /** Format 62xxxxxxxxxx */
  noWa: text().notNull().unique(),
  email: text(),
  role: roleEnum().notNull().default("sales"),
  kodeSales: text().unique(),
  tipeSales: tipeSalesEnum(),
  gajiPokok: rupiah(),
  bagiHasilKantorPersen: persen().notNull().default(30),
  maksCashbackNasabahPersen: persen().notNull().default(20),
  aktif: boolean().notNull().default(true),
  tglNonaktif: tanggal(),
  alasanNonaktif: text(),
  dibuat: dibuat(),
  diubah: dibuat().$onUpdate(() => new Date()),
});

export const targetSales = pgTable(
  "target_sales",
  {
    id: id(),
    salesId: text().notNull().references(() => users.id),
    /** Hari pertama bulan target, YYYY-MM-01 */
    bulan: tanggal().notNull(),
    targetCase: integer().notNull(),
    targetRevenue: rupiah().notNull(),
    targetUtama: targetUtamaEnum().notNull().default("revenue"),
    // Diisi saat tutup buku tanggal 1
    tercapai: boolean(),
    pencapaianPersen: numeric({ precision: 6, scale: 2, mode: "number" }),
    gajiPokokBulan: rupiah(),
    persenGaji: persen(),
    gajiDibayar: rupiah(),
    ditutup: waktu(),
  },
  (t) => [uniqueIndex().on(t.salesId, t.bulan)],
);

export const eventBagiHasil = pgTable("event_bagi_hasil", {
  id: id(),
  nama: text().notNull(),
  tglMulai: tanggal().notNull(),
  tglSelesai: tanggal().notNull(),
  /** Tambahan porsi komisi sales (% dari porsi normalnya); porsi kantor berkurang sebesar itu */
  tambahanKomisiPersen: persen().notNull(),
  berlakuUntuk: berlakuEventEnum().notNull().default("semua"),
  salesIds: text().array().notNull().default(sql`'{}'`),
  aktif: boolean().notNull().default(true),
  dibuat: dibuat(),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    noWa: text().notNull(),
    kodeHash: text().notNull(),
    kedaluwarsa: waktu().notNull(),
    percobaan: integer().notNull().default(0),
    dipakai: boolean().notNull().default(false),
    dibuat: dibuat(),
  },
  (t) => [index().on(t.noWa, t.dibuat)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: text().notNull().references(() => users.id),
    tokenHash: text().notNull().unique(),
    perangkat: text(),
    ip: text(),
    ingatPerangkat: boolean().notNull().default(true),
    dibuat: dibuat(),
    terakhirAktif: dibuat(),
    kedaluwarsa: waktu().notNull(),
    verifikasiOtpTerakhir: dibuat(),
    dicabut: waktu(),
  },
  (t) => [index().on(t.userId)],
);

// ───────────────────────── Master data ─────────────────────────

export const perusahaanAsuransi = pgTable("perusahaan_asuransi", {
  id: id(),
  nama: text().notNull(),
  kode: text().notNull().unique(),
  alamat: text(),
  /** Termin cashback dalam hari setelah premi disetor */
  terminCashbackHari: integer().notNull().default(30),
  aktif: boolean().notNull().default(true),
  dibuat: dibuat(),
});

export const kontakAsuransi = pgTable("kontak_asuransi", {
  id: id(),
  perusahaanId: text()
    .notNull()
    .references(() => perusahaanAsuransi.id, { onDelete: "cascade" }),
  namaPic: text().notNull(),
  jabatan: text(),
  email: text(),
  noWa: text(),
  utama: boolean().notNull().default(false),
});

export const kategoriPolis = pgTable("kategori_polis", {
  id: id(),
  perusahaanId: text()
    .notNull()
    .references(() => perusahaanAsuransi.id),
  namaProduk: text().notNull(),
  /** "All Risk" | "TLO" */
  jenis: text().notNull(),
  rateDasarPersen: numeric({ precision: 6, scale: 3, mode: "number" }),
  perluasanTersedia: text().array().notNull().default(sql`'{}'`),
  aktif: boolean().notNull().default(true),
});

export const asuransiBawaanKategori = pgTable(
  "asuransi_bawaan_kategori",
  {
    id: id(),
    kategoriId: text()
      .notNull()
      .references(() => kategoriPolis.id),
    perusahaanId: text()
      .notNull()
      .references(() => perusahaanAsuransi.id),
  },
  (t) => [uniqueIndex().on(t.kategoriId, t.perusahaanId)],
);

export const bengkel = pgTable("bengkel", {
  id: id(),
  nama: text().notNull(),
  kota: text(),
  noTelp: text(),
  aktif: boolean().notNull().default(true),
});

export const rekening = pgTable(
  "rekening",
  {
    id: id(),
    pemilikTipe: pemilikRekeningEnum().notNull(),
    /** users.id (sales), nasabah.id (nasabah), null untuk pembayaran/kantor */
    pemilikId: text(),
    namaBank: text().notNull(),
    /** Kode bank untuk transfer antarbank, mis. 014 = BCA */
    kodeBank: text(),
    noRekening: text().notNull(),
    atasNama: text().notNull(),
    utama: boolean().notNull().default(false),
    aktif: boolean().notNull().default(true),
  },
  (t) => [index().on(t.pemilikTipe, t.pemilikId)],
);

// ───────────────────────── Nasabah & kendaraan ─────────────────────────

export const nasabah = pgTable(
  "nasabah",
  {
    id: id(),
    salesId: text()
      .notNull()
      .references(() => users.id),
    tipe: tipeNasabahEnum().notNull().default("perorangan"),
    nama: text().notNull(),
    nik: text(),
    noWa: text().notNull(),
    email: text(),
    alamat: text(),
    tglLahir: tanggal(),
    dibuat: dibuat(),
    diubah: dibuat().$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.salesId)],
);

export const kendaraan = pgTable(
  "kendaraan",
  {
    id: id(),
    nasabahId: text()
      .notNull()
      .references(() => nasabah.id),
    noPolisi: text().notNull(),
    merek: text().notNull(),
    model: text().notNull(),
    tahun: integer().notNull(),
    warna: text(),
    noRangka: text(),
    noMesin: text(),
    status: statusKendaraanEnum().notNull().default("aktif"),
    tglStatus: tanggal(),
    catatanStatus: text(),
    dibuat: dibuat(),
  },
  (t) => [index().on(t.nasabahId)],
);

// ───────────────────────── Polis / pengajuan ─────────────────────────

/** Nomor urut kode pengajuan PJ-0001, PJ-0002, … */
export const polisKodeSeq = pgSequence("polis_kode_seq", { startWith: 1 });

export const polis = pgTable(
  "polis",
  {
    id: id(),
    /** Kode pengajuan, mis. PJ-0398 */
    kode: text().notNull().unique(),
    noPolis: text(),
    nasabahId: text()
      .notNull()
      .references(() => nasabah.id),
    kendaraanId: text()
      .notNull()
      .references(() => kendaraan.id),
    kategoriId: text().references(() => kategoriPolis.id),
    /** Asuransi penerbit (dari penawaran yang dipilih) */
    perusahaanId: text().references(() => perusahaanAsuransi.id),
    salesId: text()
      .notNull()
      .references(() => users.id),
    polisSebelumnyaId: text()
      .unique()
      .references((): AnyPgColumn => polis.id),

    statusPengajuan: statusPengajuanEnum().notNull().default("draft_prospek"),
    statusMasa: statusMasaEnum(),
    tglInput: dibuat(),
    tglMulai: tanggal(),
    tglAkhir: tanggal(),

    nilaiPertanggungan: rupiah(),
    perluasanDiminta: text().array().notNull().default(sql`'{}'`),
    perluasan: text().array().notNull().default(sql`'{}'`),
    premiBruto: rupiah(),

    cashbackTotalPersen: persen(),
    cashbackTotalRp: rupiah(),
    cashbackNasabahPersen: persen(),
    cashbackNasabahRp: rupiah(),
    eventId: text().references(() => eventBagiHasil.id),
    /** Salinan saat polis dibuat (sudah termasuk event) */
    bagiHasilKantorPersen: persen(),
    bagianKantorRp: rupiah(),
    komisiSalesRp: rupiah(),

    rekeningPembayaranId: text().references(() => rekening.id),
    batasBayar: tanggal(),
    statusBayar: statusBayarEnum().notNull().default("belum_dibayar"),
    tglBayar: tanggal(),
    tglSetorAsuransi: tanggal(),
    tglCairAsuransi: tanggal(),
    nominalCairAsuransi: rupiah(),
    tglTransferNasabah: tanggal(),
    tglTransferSales: tanggal(),

    dibuat: dibuat(),
    diubah: dibuat().$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.salesId, t.statusPengajuan), index().on(t.tglAkhir)],
);

export const statusHistory = pgTable(
  "status_history",
  {
    id: id(),
    polisId: text()
      .notNull()
      .references(() => polis.id),
    status: statusPengajuanEnum().notNull(),
    waktu: dibuat(),
    oleh: text().references(() => users.id),
    catatan: text(),
  },
  (t) => [index().on(t.polisId, t.waktu)],
);

export const kirimAsuransiLog = pgTable("kirim_asuransi_log", {
  id: id(),
  polisId: text()
    .notNull()
    .references(() => polis.id),
  perusahaanId: text()
    .notNull()
    .references(() => perusahaanAsuransi.id),
  kontakId: text().references(() => kontakAsuransi.id),
  kanal: kanalKirimEnum().notNull(),
  tujuan: text().notNull(),
  lampiran: text().array().notNull().default(sql`'{}'`),
  hasil: hasilKirimEnum().notNull(),
  waktu: dibuat(),
  oleh: text().references(() => users.id),
});

export const penawaran = pgTable("penawaran", {
  id: id(),
  polisId: text()
    .notNull()
    .references(() => polis.id),
  perusahaanId: text()
    .notNull()
    .references(() => perusahaanAsuransi.id),
  premi: rupiah().notNull(),
  ratePersen: numeric({ precision: 6, scale: 3, mode: "number" }),
  cashbackTotalPersen: persen().notNull(),
  catatan: text(),
  dokumenId: text(),
  dipilih: boolean().notNull().default(false),
  dibuat: dibuat(),
});

// ───────────────────────── Keuangan ─────────────────────────

export const kasKantor = pgTable(
  "kas_kantor",
  {
    id: id(),
    tanggal: tanggal().notNull(),
    arah: arahKasEnum().notNull(),
    kategori: text().notNull(),
    nominal: rupiah().notNull(),
    polisId: text().references(() => polis.id),
    rekeningId: text().references(() => rekening.id),
    keterangan: text(),
    buktiDokumenId: text(),
    sumber: sumberKasEnum().notNull().default("manual"),
    dibuatOleh: text().references(() => users.id),
    dibuat: dibuat(),
  },
  (t) => [index().on(t.tanggal)],
);

export const batchTransfer = pgTable("batch_transfer", {
  id: id(),
  jenisFile: jenisFileBatchEnum().notNull(),
  template: text().notNull(),
  jumlah: integer().notNull(),
  total: rupiah().notNull(),
  fileKey: text(),
  dibuatOleh: text().references(() => users.id),
  dibuat: dibuat(),
  diekspor: waktu(),
  dibayar: waktu(),
  buktiDokumenId: text(),
});

export const jadwalBayar = pgTable(
  "jadwal_bayar",
  {
    id: id(),
    jenis: jenisJadwalBayarEnum().notNull(),
    polisId: text().references(() => polis.id),
    targetSalesId: text().references(() => targetSales.id),
    penerima: text().notNull(),
    rekeningId: text().references(() => rekening.id),
    nominal: rupiah().notNull(),
    tglJadwal: tanggal().notNull(),
    status: statusJadwalBayarEnum().notNull().default("terjadwal"),
    batchId: text().references(() => batchTransfer.id),
  },
  (t) => [index().on(t.tglJadwal)],
);

// ───────────────────────── Klaim & dokumen ─────────────────────────

export const klaim = pgTable("klaim", {
  id: id(),
  polisId: text()
    .notNull()
    .references(() => polis.id),
  tglKlaim: tanggal().notNull(),
  bengkelId: text().references(() => bengkel.id),
  catatan: text(),
  dibuat: dibuat(),
});

export const dokumen = pgTable(
  "dokumen",
  {
    id: id(),
    pemilikTipe: pemilikDokumenEnum().notNull(),
    pemilikId: text().notNull(),
    jenis: jenisDokumenEnum().notNull(),
    fileKey: text().notNull(),
    namaFile: text(),
    diuploadOleh: text().references(() => users.id),
    dibuat: dibuat(),
  },
  (t) => [index().on(t.pemilikTipe, t.pemilikId)],
);

export const linkUnduh = pgTable("link_unduh", {
  id: id(),
  dokumenId: text()
    .notNull()
    .references(() => dokumen.id),
  kode: text().notNull().unique(),
  kedaluwarsa: waktu().notNull(),
  jumlahUnduh: integer().notNull().default(0),
});

export const trackerLink = pgTable("tracker_link", {
  id: id(),
  polisId: text()
    .notNull()
    .references(() => polis.id),
  token: text().notNull().unique(),
  dibuatOleh: text().references(() => users.id),
  dibuat: dibuat(),
  kedaluwarsa: waktu(),
  dicabut: waktu(),
  jumlahDilihat: integer().notNull().default(0),
  terakhirDilihat: waktu(),
  /** Salah memasukkan 4 digit WA saat unduh polis; diblokir setelah 5x */
  gagalUnduh: integer().notNull().default(0),
});

// ───────────────────────── WhatsApp ─────────────────────────

export const waLog = pgTable(
  "wa_log",
  {
    id: id(),
    polisId: text().references(() => polis.id),
    userId: text().references(() => users.id),
    nomorTujuan: text().notNull(),
    arah: arahWaEnum().notNull().default("keluar"),
    jenis: jenisWaEnum().notNull(),
    kanal: kanalWaEnum().notNull().default("fonnte"),
    fonnteId: text(),
    status: statusWaEnum().notNull().default("antre"),
    lampiran: text(),
    isi: text().notNull(),
    waktu: dibuat(),
  },
  (t) => [index().on(t.fonnteId), index().on(t.nomorTujuan)],
);

export const waTemplate = pgTable("wa_template", {
  id: id(),
  kode: text().notNull().unique(),
  nama: text().notNull(),
  isi: text().notNull(),
  lampiranDefault: text(),
  aktif: boolean().notNull().default(true),
  cadanganEmail: boolean().notNull().default(true),
});

export const waOptout = pgTable(
  "wa_optout",
  {
    id: id(),
    nomor: text().notNull(),
    jenisPesan: text().notNull(),
    waktu: dibuat(),
  },
  (t) => [uniqueIndex().on(t.nomor, t.jenisPesan)],
);

// ───────────────────────── Sistem ─────────────────────────

export const exportJobs = pgTable("export_jobs", {
  id: id(),
  userId: text()
    .notNull()
    .references(() => users.id),
  jenisLaporan: text().notNull(),
  filter: jsonb(),
  format: formatEksporEnum().notNull(),
  status: statusJobEnum().notNull().default("antre"),
  fileKey: text(),
  dibuat: dibuat(),
  selesai: waktu(),
});

export const otomasiSetting = pgTable("otomasi_setting", {
  kode: text().primaryKey(),
  nama: text().notNull(),
  aktif: boolean().notNull().default(true),
  jadwalCron: text().notNull(),
  parameter: jsonb(),
  penerima: text().array().notNull().default(sql`'{}'`),
  diubahOleh: text().references(() => users.id),
  diubah: dibuat().$onUpdate(() => new Date()),
});

export const otomasiLog = pgTable(
  "otomasi_log",
  {
    id: id(),
    kode: text().notNull(),
    mulai: dibuat(),
    selesai: waktu(),
    status: statusOtomasiEnum(),
    jumlahDiproses: integer().notNull().default(0),
    ringkasan: text(),
    error: text(),
  },
  (t) => [index().on(t.kode, t.mulai)],
);

export const notifikasi = pgTable(
  "notifikasi",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => users.id),
    jenis: text().notNull(),
    judul: text().notNull(),
    isi: text(),
    link: text(),
    dibaca: boolean().notNull().default(false),
    dikirimEmail: boolean().notNull().default(false),
    dibuat: dibuat(),
  },
  (t) => [index().on(t.userId, t.dibaca)],
);

export const pengalihanSales = pgTable("pengalihan_sales", {
  id: id(),
  dariSalesId: text()
    .notNull()
    .references(() => users.id),
  keSalesId: text()
    .notNull()
    .references(() => users.id),
  nasabahId: text().references(() => nasabah.id),
  polisId: text().references(() => polis.id),
  komisiIkut: boolean().notNull().default(false),
  waktu: dibuat(),
  oleh: text().references(() => users.id),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: text().references(() => users.id),
    aksi: text().notNull(),
    tabel: text().notNull(),
    recordId: text(),
    detail: jsonb(),
    waktu: dibuat(),
  },
  (t) => [index().on(t.tabel, t.recordId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type PerusahaanAsuransi = typeof perusahaanAsuransi.$inferSelect;
export type KontakAsuransi = typeof kontakAsuransi.$inferSelect;
export type StatusPengajuan = (typeof STATUS_PENGAJUAN)[number];
