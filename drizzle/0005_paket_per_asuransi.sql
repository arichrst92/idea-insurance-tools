-- Paket coverage kini milik masing-masing perusahaan asuransi.
-- Data lama (paket global) disalin ke setiap asuransi, lalu penawaran & polis
-- diarahkan ke salinan milik asuransinya. Paket global lama dihapus.
ALTER TABLE "kategori_polis" ADD COLUMN "perusahaan_id" text;--> statement-breakpoint
CREATE TEMP TABLE "paket_lama" AS SELECT * FROM "kategori_polis" WHERE "perusahaan_id" IS NULL;--> statement-breakpoint
INSERT INTO "kategori_polis" ("id", "perusahaan_id", "nama", "cakupan", "urutan", "aktif")
  SELECT substr(md5(k."id" || ':' || p."id"), 1, 20), p."id", k."nama", k."cakupan", k."urutan", k."aktif"
  FROM "paket_lama" k CROSS JOIN "perusahaan_asuransi" p;--> statement-breakpoint
UPDATE "penawaran" pw SET "kategori_id" = substr(md5(pw."kategori_id" || ':' || pw."perusahaan_id"), 1, 20)
  WHERE pw."kategori_id" IN (SELECT "id" FROM "paket_lama");--> statement-breakpoint
UPDATE "polis" p SET "kategori_id" = CASE
    WHEN p."perusahaan_id" IS NULL THEN NULL
    ELSE substr(md5(p."kategori_id" || ':' || p."perusahaan_id"), 1, 20) END
  WHERE p."kategori_id" IN (SELECT "id" FROM "paket_lama");--> statement-breakpoint
DELETE FROM "asuransi_bawaan_kategori" WHERE "kategori_id" IN (SELECT "id" FROM "paket_lama");--> statement-breakpoint
DELETE FROM "kategori_polis" WHERE "id" IN (SELECT "id" FROM "paket_lama");--> statement-breakpoint
DROP TABLE "paket_lama";--> statement-breakpoint
ALTER TABLE "kategori_polis" ALTER COLUMN "perusahaan_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kategori_polis" ADD CONSTRAINT "kategori_polis_perusahaan_id_perusahaan_asuransi_id_fk" FOREIGN KEY ("perusahaan_id") REFERENCES "public"."perusahaan_asuransi"("id") ON DELETE cascade ON UPDATE no action;
