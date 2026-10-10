import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export async function catatAudit(p: {
  userId: string;
  aksi: string;
  tabel: string;
  recordId?: string | null;
  detail?: unknown;
}) {
  await db.insert(auditLog).values({
    userId: p.userId,
    aksi: p.aksi,
    tabel: p.tabel,
    recordId: p.recordId ?? null,
    detail: p.detail ?? null,
  });
}
