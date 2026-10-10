ALTER TABLE "jadwal_bayar" ADD COLUMN "estimasi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jadwal_bayar" ADD COLUMN "dibayar" date;--> statement-breakpoint
ALTER TABLE "jadwal_bayar" ADD COLUMN "diubah" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "kas_kantor" ADD COLUMN "target_sales_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "jadwal_polis_unik" ON "jadwal_bayar" USING btree ("jenis","polis_id") WHERE "jadwal_bayar"."polis_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "jadwal_target_unik" ON "jadwal_bayar" USING btree ("jenis","target_sales_id") WHERE "jadwal_bayar"."target_sales_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "kas_polis_kategori_unik" ON "kas_kantor" USING btree ("polis_id","kategori") WHERE "kas_kantor"."polis_id" is not null;