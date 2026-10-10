import { sesiSekarang } from "@/lib/auth/session";
import { csvBatch } from "@/lib/jadwal-bayar";

// Unduh CSV transfer massal satu batch (admin).
export async function GET(_: Request, { params }: { params: Promise<{ batch: string }> }) {
  const s = await sesiSekarang();
  if (s?.user.role !== "admin") return new Response("Tidak diizinkan", { status: 403 });
  const { batch } = await params;
  const h = await csvBatch(batch);
  if (!h) return new Response("Tidak ditemukan", { status: 404 });
  const tgl = h.batch.dibuat.toISOString().slice(0, 10);
  return new Response(h.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transfer-${h.batch.jenisFile === "sesama_bca" ? "sesama-bca" : "antarbank"}-${tgl}-${batch.slice(0, 6)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
