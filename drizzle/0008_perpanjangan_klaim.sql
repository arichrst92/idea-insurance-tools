CREATE TYPE "public"."status_klaim" AS ENUM('diproses', 'selesai', 'ditolak');--> statement-breakpoint
CREATE TABLE "remind_perpanjangan" (
	"id" text PRIMARY KEY NOT NULL,
	"polis_id" text NOT NULL,
	"tahap" integer,
	"wa_log_id" text,
	"kanal" text NOT NULL,
	"oleh" text,
	"dibuat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "klaim" ADD COLUMN "status" "status_klaim" DEFAULT 'diproses' NOT NULL;--> statement-breakpoint
ALTER TABLE "klaim" ADD COLUMN "dicatat_oleh" text;--> statement-breakpoint
ALTER TABLE "klaim" ADD COLUMN "diubah" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "polis" ADD COLUMN "nasabah_setuju_perpanjangan" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "remind_perpanjangan" ADD CONSTRAINT "remind_perpanjangan_polis_id_polis_id_fk" FOREIGN KEY ("polis_id") REFERENCES "public"."polis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remind_perpanjangan" ADD CONSTRAINT "remind_perpanjangan_wa_log_id_wa_log_id_fk" FOREIGN KEY ("wa_log_id") REFERENCES "public"."wa_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remind_perpanjangan" ADD CONSTRAINT "remind_perpanjangan_oleh_users_id_fk" FOREIGN KEY ("oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "remind_perpanjangan_polis_id_index" ON "remind_perpanjangan" USING btree ("polis_id");--> statement-breakpoint
ALTER TABLE "klaim" ADD CONSTRAINT "klaim_dicatat_oleh_users_id_fk" FOREIGN KEY ("dicatat_oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;