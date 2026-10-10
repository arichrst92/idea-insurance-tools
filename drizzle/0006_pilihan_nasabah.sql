ALTER TABLE "polis" ADD COLUMN "pilihan_nasabah_id" text;--> statement-breakpoint
ALTER TABLE "polis" ADD COLUMN "pilihan_nasabah_waktu" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "polis" ADD CONSTRAINT "polis_pilihan_nasabah_id_penawaran_id_fk" FOREIGN KEY ("pilihan_nasabah_id") REFERENCES "public"."penawaran"("id") ON DELETE set null ON UPDATE no action;