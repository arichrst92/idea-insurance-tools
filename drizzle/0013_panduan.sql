CREATE TABLE "panduan_bagian" (
	"id" text PRIMARY KEY NOT NULL,
	"kode" text NOT NULL,
	"judul" text NOT NULL,
	"isi" text NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"diubah" timestamp with time zone DEFAULT now() NOT NULL,
	"diubah_oleh" text,
	CONSTRAINT "panduan_bagian_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "panduan_dibuka" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_centang" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_ditutup" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "panduan_bagian" ADD CONSTRAINT "panduan_bagian_diubah_oleh_users_id_fk" FOREIGN KEY ("diubah_oleh") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;