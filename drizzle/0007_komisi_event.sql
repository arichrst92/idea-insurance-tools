ALTER TABLE "polis" ADD COLUMN "bagi_hasil_kantor_normal_persen" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "polis" ADD COLUMN "komisi_event_rp" numeric(15, 0);--> statement-breakpoint
-- Isi data lama: % kantor normal dihitung balik dari % berlaku dan tambahan event.
UPDATE "polis" p SET "bagi_hasil_kantor_normal_persen" = CASE
    WHEN p."event_id" IS NULL THEN p."bagi_hasil_kantor_persen"
    ELSE round(100 - (100 - p."bagi_hasil_kantor_persen") / (1 + e."tambahan_komisi_persen" / 100), 2)
  END
FROM (SELECT p2."id", e2."tambahan_komisi_persen" FROM "polis" p2 LEFT JOIN "event_bagi_hasil" e2 ON e2."id" = p2."event_id") e
WHERE e."id" = p."id" AND p."komisi_sales_rp" IS NOT NULL;
--> statement-breakpoint
UPDATE "polis" SET "komisi_event_rp" = "komisi_sales_rp" - least(
    "komisi_sales_rp",
    ("cashback_total_rp" - "cashback_nasabah_rp") - round(("cashback_total_rp" - "cashback_nasabah_rp") * "bagi_hasil_kantor_normal_persen" / 100)
  )
WHERE "komisi_sales_rp" IS NOT NULL;
