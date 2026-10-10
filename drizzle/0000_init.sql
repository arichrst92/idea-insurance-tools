CREATE TYPE "public"."arah_kas" AS ENUM('masuk', 'keluar');--> statement-breakpoint
CREATE TYPE "public"."arah_wa" AS ENUM('keluar', 'masuk');--> statement-breakpoint
CREATE TYPE "public"."berlaku_event" AS ENUM('semua', 'fulltime', 'freelance', 'pilihan');--> statement-breakpoint
CREATE TYPE "public"."format_ekspor" AS ENUM('pdf', 'excel');--> statement-breakpoint
CREATE TYPE "public"."hasil_kirim" AS ENUM('terkirim', 'gagal', 'dibuka_wa');--> statement-breakpoint
CREATE TYPE "public"."jenis_dokumen" AS ENUM('ktp', 'stnk', 'foto_kendaraan', 'hasil_survei', 'penawaran', 'polis', 'bukti_bayar_nasabah', 'bukti_cair_asuransi', 'bukti_transfer_cashback_nasabah', 'bukti_transfer_komisi', 'bukti_penarikan', 'foto_klaim');--> statement-breakpoint
CREATE TYPE "public"."jenis_file_batch" AS ENUM('sesama_bca', 'antarbank');--> statement-breakpoint
CREATE TYPE "public"."jenis_jadwal_bayar" AS ENUM('cashback_nasabah', 'komisi', 'gaji');--> statement-breakpoint
CREATE TYPE "public"."jenis_wa" AS ENUM('otp', 'instruksi_bayar', 'remind', 'notifikasi', 'kirim_asuransi', 'balasan', 'tracker');--> statement-breakpoint
CREATE TYPE "public"."kanal_kirim" AS ENUM('email', 'wa');--> statement-breakpoint
CREATE TYPE "public"."kanal_wa" AS ENUM('fonnte', 'wame');--> statement-breakpoint
CREATE TYPE "public"."pemilik_dokumen" AS ENUM('nasabah', 'kendaraan', 'polis', 'klaim', 'kas');--> statement-breakpoint
CREATE TYPE "public"."pemilik_rekening" AS ENUM('sales', 'nasabah', 'pembayaran', 'kantor');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'sales');--> statement-breakpoint
CREATE TYPE "public"."status_bayar" AS ENUM('belum_dibayar', 'lunas');--> statement-breakpoint
CREATE TYPE "public"."status_jadwal_bayar" AS ENUM('terjadwal', 'menunggu', 'siap', 'diekspor', 'dibayar');--> statement-breakpoint
CREATE TYPE "public"."status_job" AS ENUM('antre', 'proses', 'selesai', 'gagal');--> statement-breakpoint
CREATE TYPE "public"."status_kendaraan" AS ENUM('aktif', 'dijual', 'tidak_dipakai');--> statement-breakpoint
CREATE TYPE "public"."status_masa" AS ENUM('aktif', 'akan_habis', 'expired', 'diperpanjang', 'kendaraan_dijual', 'batal');--> statement-breakpoint
CREATE TYPE "public"."status_otomasi" AS ENUM('sukses', 'gagal');--> statement-breakpoint
CREATE TYPE "public"."status_pengajuan" AS ENUM('draft_prospek', 'data_lengkap', 'dikirim_ke_asuransi', 'survei_kendaraan', 'penawaran_masuk', 'disetujui_nasabah', 'polis_terbit', 'menunggu_bayar', 'lunas', 'premi_disetor', 'cashback_cair', 'selesai', 'perlu_revisi', 'ditolak_asuransi', 'batal_nasabah');--> statement-breakpoint
CREATE TYPE "public"."status_wa" AS ENUM('antre', 'terkirim', 'diterima', 'dibaca', 'gagal');--> statement-breakpoint
CREATE TYPE "public"."sumber_kas" AS ENUM('otomatis', 'manual');--> statement-breakpoint
CREATE TYPE "public"."target_utama" AS ENUM('case', 'revenue');--> statement-breakpoint
CREATE TYPE "public"."tipe_nasabah" AS ENUM('perorangan', 'badan');--> statement-breakpoint
CREATE TYPE "public"."tipe_sales" AS ENUM('fulltime', 'freelance');--> statement-breakpoint
CREATE TABLE "asuransi_bawaan_kategori" (
	"id" text PRIMARY KEY NOT NULL,
	"kategori_id" text NOT NULL,
	"perusahaan_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"aksi" text NOT NULL,
	"tabel" text NOT NULL,
	"record_id" text,
	"detail" jsonb,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_transfer" (
	"id" text PRIMARY KEY NOT NULL,
	"jenis_file" "jenis_file_batch" NOT NULL,
	"template" text NOT NULL,
	"jumlah" integer NOT NULL,
	"total" numeric(15, 0) NOT NULL,
	"file_key" text,
	"dibuat_oleh" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	"diekspor" timestamp with time zone,
	"dibayar" timestamp with time zone,
	"bukti_dokumen_id" text
);
--> statement-breakpoint
CREATE TABLE "bengkel" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"kota" text,
	"no_telp" text,
	"aktif" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dokumen" (
	"id" text PRIMARY KEY NOT NULL,
	"pemilik_tipe" "pemilik_dokumen" NOT NULL,
	"pemilik_id" text NOT NULL,
	"jenis" "jenis_dokumen" NOT NULL,
	"file_key" text NOT NULL,
	"nama_file" text,
	"diupload_oleh" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_bagi_hasil" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"tgl_mulai" date NOT NULL,
	"tgl_selesai" date NOT NULL,
	"bagi_hasil_kantor_persen" numeric(5, 2) NOT NULL,
	"berlaku_untuk" "berlaku_event" DEFAULT 'semua' NOT NULL,
	"sales_ids" text[] DEFAULT '{}' NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"jenis_laporan" text NOT NULL,
	"filter" jsonb,
	"format" "format_ekspor" NOT NULL,
	"status" "status_job" DEFAULT 'antre' NOT NULL,
	"file_key" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jadwal_bayar" (
	"id" text PRIMARY KEY NOT NULL,
	"jenis" "jenis_jadwal_bayar" NOT NULL,
	"polis_id" text,
	"target_sales_id" text,
	"penerima" text NOT NULL,
	"rekening_id" text,
	"nominal" numeric(15, 0) NOT NULL,
	"tgl_jadwal" date NOT NULL,
	"status" "status_jadwal_bayar" DEFAULT 'terjadwal' NOT NULL,
	"batch_id" text
);
--> statement-breakpoint
CREATE TABLE "kas_kantor" (
	"id" text PRIMARY KEY NOT NULL,
	"tanggal" date NOT NULL,
	"arah" "arah_kas" NOT NULL,
	"kategori" text NOT NULL,
	"nominal" numeric(15, 0) NOT NULL,
	"polis_id" text,
	"rekening_id" text,
	"keterangan" text,
	"bukti_dokumen_id" text,
	"sumber" "sumber_kas" DEFAULT 'manual' NOT NULL,
	"dibuat_oleh" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kategori_polis" (
	"id" text PRIMARY KEY NOT NULL,
	"perusahaan_id" text NOT NULL,
	"nama_produk" text NOT NULL,
	"jenis" text NOT NULL,
	"rate_dasar_persen" numeric(6, 3),
	"perluasan_tersedia" text[] DEFAULT '{}' NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kendaraan" (
	"id" text PRIMARY KEY NOT NULL,
	"nasabah_id" text NOT NULL,
	"no_polisi" text NOT NULL,
	"merek" text NOT NULL,
	"model" text NOT NULL,
	"tahun" integer NOT NULL,
	"warna" text,
	"no_rangka" text,
	"no_mesin" text,
	"status" "status_kendaraan" DEFAULT 'aktif' NOT NULL,
	"tgl_status" date,
	"catatan_status" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kirim_asuransi_log" (
	"id" text PRIMARY KEY NOT NULL,
	"polis_id" text NOT NULL,
	"perusahaan_id" text NOT NULL,
	"kontak_id" text,
	"kanal" "kanal_kirim" NOT NULL,
	"tujuan" text NOT NULL,
	"lampiran" text[] DEFAULT '{}' NOT NULL,
	"hasil" "hasil_kirim" NOT NULL,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL,
	"oleh" text
);
--> statement-breakpoint
CREATE TABLE "klaim" (
	"id" text PRIMARY KEY NOT NULL,
	"polis_id" text NOT NULL,
	"tgl_klaim" date NOT NULL,
	"bengkel_id" text,
	"catatan" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kontak_asuransi" (
	"id" text PRIMARY KEY NOT NULL,
	"perusahaan_id" text NOT NULL,
	"nama_pic" text NOT NULL,
	"jabatan" text,
	"email" text,
	"no_wa" text,
	"utama" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_unduh" (
	"id" text PRIMARY KEY NOT NULL,
	"dokumen_id" text NOT NULL,
	"kode" text NOT NULL,
	"kedaluwarsa" timestamp with time zone NOT NULL,
	"jumlah_unduh" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "link_unduh_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "nasabah" (
	"id" text PRIMARY KEY NOT NULL,
	"sales_id" text NOT NULL,
	"tipe" "tipe_nasabah" DEFAULT 'perorangan' NOT NULL,
	"nama" text NOT NULL,
	"nik" text,
	"no_wa" text NOT NULL,
	"email" text,
	"alamat" text,
	"tgl_lahir" date,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	"diubah" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifikasi" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"jenis" text NOT NULL,
	"judul" text NOT NULL,
	"isi" text,
	"link" text,
	"dibaca" boolean DEFAULT false NOT NULL,
	"dikirim_email" boolean DEFAULT false NOT NULL,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otomasi_log" (
	"id" text PRIMARY KEY NOT NULL,
	"kode" text NOT NULL,
	"mulai" timestamp with time zone DEFAULT now() NOT NULL,
	"selesai" timestamp with time zone,
	"status" "status_otomasi",
	"jumlah_diproses" integer DEFAULT 0 NOT NULL,
	"ringkasan" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "otomasi_setting" (
	"kode" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"jadwal_cron" text NOT NULL,
	"parameter" jsonb,
	"penerima" text[] DEFAULT '{}' NOT NULL,
	"diubah_oleh" text,
	"diubah" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"no_wa" text NOT NULL,
	"kode_hash" text NOT NULL,
	"kedaluwarsa" timestamp with time zone NOT NULL,
	"percobaan" integer DEFAULT 0 NOT NULL,
	"dipakai" boolean DEFAULT false NOT NULL,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penawaran" (
	"id" text PRIMARY KEY NOT NULL,
	"polis_id" text NOT NULL,
	"perusahaan_id" text NOT NULL,
	"premi" numeric(15, 0) NOT NULL,
	"rate_persen" numeric(6, 3),
	"cashback_total_persen" numeric(5, 2) NOT NULL,
	"catatan" text,
	"dokumen_id" text,
	"dipilih" boolean DEFAULT false NOT NULL,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pengalihan_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"dari_sales_id" text NOT NULL,
	"ke_sales_id" text NOT NULL,
	"nasabah_id" text,
	"polis_id" text,
	"komisi_ikut" boolean DEFAULT false NOT NULL,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL,
	"oleh" text
);
--> statement-breakpoint
CREATE TABLE "perusahaan_asuransi" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"kode" text NOT NULL,
	"alamat" text,
	"termin_cashback_hari" integer DEFAULT 30 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perusahaan_asuransi_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "polis" (
	"id" text PRIMARY KEY NOT NULL,
	"kode" text NOT NULL,
	"no_polis" text,
	"nasabah_id" text NOT NULL,
	"kendaraan_id" text NOT NULL,
	"kategori_id" text,
	"sales_id" text NOT NULL,
	"polis_sebelumnya_id" text,
	"status_pengajuan" "status_pengajuan" DEFAULT 'draft_prospek' NOT NULL,
	"status_masa" "status_masa",
	"tgl_input" timestamp with time zone DEFAULT now() NOT NULL,
	"tgl_mulai" date,
	"tgl_akhir" date,
	"nilai_pertanggungan" numeric(15, 0),
	"perluasan_diminta" text[] DEFAULT '{}' NOT NULL,
	"perluasan" text[] DEFAULT '{}' NOT NULL,
	"premi_bruto" numeric(15, 0),
	"cashback_total_persen" numeric(5, 2),
	"cashback_total_rp" numeric(15, 0),
	"cashback_nasabah_persen" numeric(5, 2),
	"cashback_nasabah_rp" numeric(15, 0),
	"event_id" text,
	"bagi_hasil_kantor_persen" numeric(5, 2),
	"bagian_kantor_rp" numeric(15, 0),
	"komisi_sales_rp" numeric(15, 0),
	"rekening_pembayaran_id" text,
	"batas_bayar" date,
	"status_bayar" "status_bayar" DEFAULT 'belum_dibayar' NOT NULL,
	"tgl_bayar" date,
	"tgl_setor_asuransi" date,
	"tgl_cair_asuransi" date,
	"nominal_cair_asuransi" numeric(15, 0),
	"tgl_transfer_nasabah" date,
	"tgl_transfer_sales" date,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	"diubah" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "polis_kode_unique" UNIQUE("kode"),
	CONSTRAINT "polis_polisSebelumnyaId_unique" UNIQUE("polis_sebelumnya_id")
);
--> statement-breakpoint
CREATE TABLE "rekening" (
	"id" text PRIMARY KEY NOT NULL,
	"pemilik_tipe" "pemilik_rekening" NOT NULL,
	"pemilik_id" text,
	"nama_bank" text NOT NULL,
	"kode_bank" text,
	"no_rekening" text NOT NULL,
	"atas_nama" text NOT NULL,
	"utama" boolean DEFAULT false NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"perangkat" text,
	"ip" text,
	"ingat_perangkat" boolean DEFAULT true NOT NULL,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	"terakhir_aktif" timestamp with time zone DEFAULT now() NOT NULL,
	"kedaluwarsa" timestamp with time zone NOT NULL,
	"verifikasi_otp_terakhir" timestamp with time zone DEFAULT now() NOT NULL,
	"dicabut" timestamp with time zone,
	CONSTRAINT "sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"polis_id" text NOT NULL,
	"status" "status_pengajuan" NOT NULL,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL,
	"oleh" text,
	"catatan" text
);
--> statement-breakpoint
CREATE TABLE "target_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"sales_id" text NOT NULL,
	"bulan" date NOT NULL,
	"target_case" integer NOT NULL,
	"target_revenue" numeric(15, 0) NOT NULL,
	"target_utama" "target_utama" DEFAULT 'revenue' NOT NULL,
	"tercapai" boolean,
	"pencapaian_persen" numeric(6, 2),
	"gaji_pokok_bulan" numeric(15, 0),
	"persen_gaji" numeric(5, 2),
	"gaji_dibayar" numeric(15, 0),
	"ditutup" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tracker_link" (
	"id" text PRIMARY KEY NOT NULL,
	"polis_id" text NOT NULL,
	"token" text NOT NULL,
	"dibuat_oleh" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	"kedaluwarsa" timestamp with time zone,
	"dicabut" timestamp with time zone,
	"jumlah_dilihat" integer DEFAULT 0 NOT NULL,
	"terakhir_dilihat" timestamp with time zone,
	CONSTRAINT "tracker_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"no_wa" text NOT NULL,
	"email" text,
	"role" "role" DEFAULT 'sales' NOT NULL,
	"kode_sales" text,
	"tipe_sales" "tipe_sales",
	"gaji_pokok" numeric(15, 0),
	"bagi_hasil_kantor_persen" numeric(5, 2) DEFAULT 30 NOT NULL,
	"maks_cashback_nasabah_persen" numeric(5, 2) DEFAULT 20 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"tgl_nonaktif" date,
	"alasan_nonaktif" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL,
	"diubah" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_noWa_unique" UNIQUE("no_wa"),
	CONSTRAINT "users_kodeSales_unique" UNIQUE("kode_sales")
);
--> statement-breakpoint
CREATE TABLE "wa_log" (
	"id" text PRIMARY KEY NOT NULL,
	"polis_id" text,
	"user_id" text,
	"nomor_tujuan" text NOT NULL,
	"arah" "arah_wa" DEFAULT 'keluar' NOT NULL,
	"jenis" "jenis_wa" NOT NULL,
	"kanal" "kanal_wa" DEFAULT 'fonnte' NOT NULL,
	"fonnte_id" text,
	"status" "status_wa" DEFAULT 'antre' NOT NULL,
	"lampiran" text,
	"isi" text NOT NULL,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_optout" (
	"id" text PRIMARY KEY NOT NULL,
	"nomor" text NOT NULL,
	"jenis_pesan" text NOT NULL,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_template" (
	"id" text PRIMARY KEY NOT NULL,
	"kode" text NOT NULL,
	"nama" text NOT NULL,
	"isi" text NOT NULL,
	"lampiran_default" text,
	"aktif" boolean DEFAULT true NOT NULL,
	"cadangan_email" boolean DEFAULT true NOT NULL,
	CONSTRAINT "wa_template_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
ALTER TABLE "asuransi_bawaan_kategori" ADD CONSTRAINT "asuransi_bawaan_kategori_kategori_id_kategori_polis_id_fk" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asuransi_bawaan_kategori" ADD CONSTRAINT "asuransi_bawaan_kategori_perusahaan_id_perusahaan_asuransi_id_fk" FOREIGN KEY ("perusahaan_id") REFERENCES "public"."perusahaan_asuransi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transfer" ADD CONSTRAINT "batch_transfer_dibuat_oleh_users_id_fk" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumen" ADD CONSTRAINT "dokumen_diupload_oleh_users_id_fk" FOREIGN KEY ("diupload_oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jadwal_bayar" ADD CONSTRAINT "jadwal_bayar_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jadwal_bayar" ADD CONSTRAINT "jadwal_bayar_target_sales_id_target_sales_id_fk" FOREIGN KEY ("target_sales_id") REFERENCES "public"."target_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jadwal_bayar" ADD CONSTRAINT "jadwal_bayar_rekening_id_rekening_id_fk" FOREIGN KEY ("rekening_id") REFERENCES "public"."rekening"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jadwal_bayar" ADD CONSTRAINT "jadwal_bayar_batch_id_batch_transfer_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch_transfer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kas_kantor" ADD CONSTRAINT "kas_kantor_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kas_kantor" ADD CONSTRAINT "kas_kantor_rekening_id_rekening_id_fk" FOREIGN KEY ("rekening_id") REFERENCES "public"."rekening"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kas_kantor" ADD CONSTRAINT "kas_kantor_dibuat_oleh_users_id_fk" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kategori_polis" ADD CONSTRAINT "kategori_polis_perusahaan_id_perusahaan_asuransi_id_fk" FOREIGN KEY ("perusahaan_id") REFERENCES "public"."perusahaan_asuransi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kendaraan" ADD CONSTRAINT "kendaraan_nasabah_id_nasabah_id_fk" FOREIGN KEY ("nasabah_id") REFERENCES "public"."nasabah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kirim_asuransi_log" ADD CONSTRAINT "kirim_asuransi_log_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kirim_asuransi_log" ADD CONSTRAINT "kirim_asuransi_log_perusahaan_id_perusahaan_asuransi_id_fk" FOREIGN KEY ("perusahaan_id") REFERENCES "public"."perusahaan_asuransi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kirim_asuransi_log" ADD CONSTRAINT "kirim_asuransi_log_kontak_id_kontak_asuransi_id_fk" FOREIGN KEY ("kontak_id") REFERENCES "public"."kontak_asuransi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kirim_asuransi_log" ADD CONSTRAINT "kirim_asuransi_log_oleh_users_id_fk" FOREIGN KEY ("oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "klaim" ADD CONSTRAINT "klaim_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "klaim" ADD CONSTRAINT "klaim_bengkel_id_bengkel_id_fk" FOREIGN KEY ("bengkel_id") REFERENCES "public"."bengkel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kontak_asuransi" ADD CONSTRAINT "kontak_asuransi_perusahaan_id_perusahaan_asuransi_id_fk" FOREIGN KEY ("perusahaan_id") REFERENCES "public"."perusahaan_asuransi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_unduh" ADD CONSTRAINT "link_unduh_dokumen_id_dokumen_id_fk" FOREIGN KEY ("dokumen_id") REFERENCES "public"."dokumen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nasabah" ADD CONSTRAINT "nasabah_sales_id_users_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifikasi" ADD CONSTRAINT "notifikasi_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otomasi_setting" ADD CONSTRAINT "otomasi_setting_diubah_oleh_users_id_fk" FOREIGN KEY ("diubah_oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penawaran" ADD CONSTRAINT "penawaran_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penawaran" ADD CONSTRAINT "penawaran_perusahaan_id_perusahaan_asuransi_id_fk" FOREIGN KEY ("perusahaan_id") REFERENCES "public"."perusahaan_asuransi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengalihan_sales" ADD CONSTRAINT "pengalihan_sales_dari_sales_id_users_id_fk" FOREIGN KEY ("dari_sales_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengalihan_sales" ADD CONSTRAINT "pengalihan_sales_ke_sales_id_users_id_fk" FOREIGN KEY ("ke_sales_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengalihan_sales" ADD CONSTRAINT "pengalihan_sales_nasabah_id_nasabah_id_fk" FOREIGN KEY ("nasabah_id") REFERENCES "public"."nasabah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengalihan_sales" ADD CONSTRAINT "pengalihan_sales_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengalihan_sales" ADD CONSTRAINT "pengalihan_sales_oleh_users_id_fk" FOREIGN KEY ("oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polis" ADD CONSTRAINT "polis_nasabah_id_nasabah_id_fk" FOREIGN KEY ("nasabah_id") REFERENCES "public"."nasabah"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polis" ADD CONSTRAINT "polis_kendaraan_id_kendaraan_id_fk" FOREIGN KEY ("kendaraan_id") REFERENCES "public"."kendaraan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polis" ADD CONSTRAINT "polis_kategori_id_kategori_polis_id_fk" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polis" ADD CONSTRAINT "polis_sales_id_users_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polis" ADD CONSTRAINT "polis_polis_sebelumnya_id_polis_id_fk" FOREIGN KEY ("polis_sebelumnya_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polis" ADD CONSTRAINT "polis_event_id_event_bagi_hasil_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event_bagi_hasil"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polis" ADD CONSTRAINT "polis_rekening_pembayaran_id_rekening_id_fk" FOREIGN KEY ("rekening_pembayaran_id") REFERENCES "public"."rekening"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_oleh_users_id_fk" FOREIGN KEY ("oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_sales" ADD CONSTRAINT "target_sales_sales_id_users_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_link" ADD CONSTRAINT "tracker_link_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_link" ADD CONSTRAINT "tracker_link_dibuat_oleh_users_id_fk" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_log" ADD CONSTRAINT "wa_log_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_log" ADD CONSTRAINT "wa_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asuransi_bawaan_kategori_kategori_id_perusahaan_id_index" ON "asuransi_bawaan_kategori" USING btree ("kategori_id","perusahaan_id");--> statement-breakpoint
CREATE INDEX "audit_log_tabel_record_id_index" ON "audit_log" USING btree ("tabel","record_id");--> statement-breakpoint
CREATE INDEX "dokumen_pemilik_tipe_pemilik_id_index" ON "dokumen" USING btree ("pemilik_tipe","pemilik_id");--> statement-breakpoint
CREATE INDEX "jadwal_bayar_tgl_jadwal_index" ON "jadwal_bayar" USING btree ("tgl_jadwal");--> statement-breakpoint
CREATE INDEX "kas_kantor_tanggal_index" ON "kas_kantor" USING btree ("tanggal");--> statement-breakpoint
CREATE INDEX "kendaraan_nasabah_id_index" ON "kendaraan" USING btree ("nasabah_id");--> statement-breakpoint
CREATE INDEX "nasabah_sales_id_index" ON "nasabah" USING btree ("sales_id");--> statement-breakpoint
CREATE INDEX "notifikasi_user_id_dibaca_index" ON "notifikasi" USING btree ("user_id","dibaca");--> statement-breakpoint
CREATE INDEX "otomasi_log_kode_mulai_index" ON "otomasi_log" USING btree ("kode","mulai");--> statement-breakpoint
CREATE INDEX "otp_codes_no_wa_dibuat_index" ON "otp_codes" USING btree ("no_wa","dibuat");--> statement-breakpoint
CREATE INDEX "polis_sales_id_status_pengajuan_index" ON "polis" USING btree ("sales_id","status_pengajuan");--> statement-breakpoint
CREATE INDEX "polis_tgl_akhir_index" ON "polis" USING btree ("tgl_akhir");--> statement-breakpoint
CREATE INDEX "rekening_pemilik_tipe_pemilik_id_index" ON "rekening" USING btree ("pemilik_tipe","pemilik_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_history_polis_id_waktu_index" ON "status_history" USING btree ("polis_id","waktu");--> statement-breakpoint
CREATE UNIQUE INDEX "target_sales_sales_id_bulan_index" ON "target_sales" USING btree ("sales_id","bulan");--> statement-breakpoint
CREATE INDEX "wa_log_fonnte_id_index" ON "wa_log" USING btree ("fonnte_id");--> statement-breakpoint
CREATE INDEX "wa_log_nomor_tujuan_index" ON "wa_log" USING btree ("nomor_tujuan");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_optout_nomor_jenis_pesan_index" ON "wa_optout" USING btree ("nomor","jenis_pesan");