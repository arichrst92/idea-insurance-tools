import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exportJobs } from "@/db/schema";
import { sesiSekarang } from "@/lib/auth/session";
import { bacaFile } from "@/lib/storage";

const UMUR_UNDUH_HARI = 7;

// Unduh hasil ekspor: pembuatnya (atau admin), berlaku 7 hari.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesiSekarang();
  if (!s) return new Response("Harus login", { status: 401 });
  const { id } = await params;
  const [j] = await db.select().from(exportJobs).where(eq(exportJobs.id, id));
  if (!j || (j.userId !== s.user.id && s.user.role !== "admin") || j.status !== "selesai" || !j.fileKey) return new Response("Tidak ditemukan", { status: 404 });
  if (Date.now() - j.dibuat.getTime() > UMUR_UNDUH_HARI * 86_400_000) return new Response("Link unduh sudah kedaluwarsa (7 hari). Ekspor ulang dari halamannya.", { status: 410 });
  const isi = await bacaFile(j.fileKey);
  const ext = j.format === "pdf" ? "pdf" : "xlsx";
  return new Response(new Uint8Array(isi), {
    headers: {
      "Content-Type": j.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${j.jenisLaporan}-${j.dibuat.toISOString().slice(0, 10)}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
