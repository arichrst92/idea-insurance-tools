import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { dokumen, linkUnduh } from "@/db/schema";
import { bacaFile, tipeKonten } from "@/lib/storage";

// Link unduh publik berbatas waktu (PDF polis di instruksi bayar, dokumen untuk PIC asuransi).
export async function GET(_: Request, { params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  const [baris] = await db
    .select({ l: linkUnduh, d: dokumen })
    .from(linkUnduh)
    .innerJoin(dokumen, eq(dokumen.id, linkUnduh.dokumenId))
    .where(and(eq(linkUnduh.kode, kode.toUpperCase()), gt(linkUnduh.kedaluwarsa, new Date())));
  if (!baris) return new Response("Link tidak ditemukan atau sudah kedaluwarsa.", { status: 404 });
  await db.update(linkUnduh).set({ jumlahUnduh: sql`${linkUnduh.jumlahUnduh} + 1` }).where(eq(linkUnduh.id, baris.l.id));
  const isi = await bacaFile(baris.d.fileKey);
  return new Response(new Uint8Array(isi), {
    headers: {
      "Content-Type": tipeKonten(baris.d.fileKey),
      "Content-Disposition": `inline; filename="${encodeURIComponent(baris.d.namaFile ?? "dokumen")}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
