-- Custom SQL migration file, put your code below! ---- Laporan berkala dicek harian (Senin = mingguan, tanggal 1 = bulanan)
UPDATE "otomasi_setting" SET "jadwal_cron" = '0 7 * * *', "parameter" = '{"mingguan": true, "bulanan": true}' WHERE "kode" = 'laporan_berkala' AND "jadwal_cron" = '0 7 * * 1';
--> statement-breakpoint
UPDATE "otomasi_setting" SET "parameter" = '{"perusahaanIds": [], "kanal": ["email", "wa"]}' WHERE "kode" = 'kirim_otomatis_asuransi' AND ("parameter" IS NULL OR "parameter" = '{}'::jsonb);
