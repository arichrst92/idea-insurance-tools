ALTER TYPE "public"."role" ADD VALUE 'owner';--> statement-breakpoint
ALTER TABLE "batch_transfer" ADD COLUMN "disetujui" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batch_transfer" ADD COLUMN "disetujui_oleh" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "juga_sales" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_transfer" ADD CONSTRAINT "batch_transfer_disetujui_oleh_users_id_fk" FOREIGN KEY ("disetujui_oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Batch transfer lama dianggap sudah disetujui (sebelum ada persetujuan owner)
UPDATE "batch_transfer" SET "disetujui" = "dibuat" WHERE "disetujui" IS NULL;