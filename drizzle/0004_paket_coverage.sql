-- Paket coverage (Biasa/Plus/Complete) global; premi dicatat per paket di penawaran.
-- Rate, perluasan, dan kategori per asuransi tidak lagi dipakai.
ALTER TABLE "kategori_polis" RENAME COLUMN "nama_produk" TO "nama";
--> statement-breakpoint
ALTER TABLE "kategori_polis" DROP CONSTRAINT "kategori_polis_perusahaan_id_perusahaan_asuransi_id_fk";
--> statement-breakpoint
ALTER TABLE "kategori_polis" DROP COLUMN "perusahaan_id";--> statement-breakpoint
ALTER TABLE "kategori_polis" DROP COLUMN "jenis";--> statement-breakpoint
ALTER TABLE "kategori_polis" DROP COLUMN "rate_dasar_persen";--> statement-breakpoint
ALTER TABLE "kategori_polis" DROP COLUMN "perluasan_tersedia";--> statement-breakpoint
ALTER TABLE "penawaran" DROP COLUMN "rate_persen";--> statement-breakpoint
ALTER TABLE "polis" DROP COLUMN "perluasan_diminta";--> statement-breakpoint
ALTER TABLE "polis" DROP COLUMN "perluasan";
--> statement-breakpoint
ALTER TABLE "kategori_polis" ADD COLUMN "cakupan" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "kategori_polis" ADD COLUMN "urutan" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "penawaran" ADD COLUMN "kategori_id" text;--> statement-breakpoint
ALTER TABLE "penawaran" ADD CONSTRAINT "penawaran_kategori_id_kategori_polis_id_fk" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_polis"("id") ON DELETE no action ON UPDATE no action;
