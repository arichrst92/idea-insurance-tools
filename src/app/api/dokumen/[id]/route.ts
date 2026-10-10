import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dokumen, kendaraan, klaim, nasabah, polis } from "@/db/schema";
import { sesiSekarang } from "@/lib/auth/session";
import { bacaFile, tipeKonten } from "@/lib/storage";

// Unduh/lihat dokumen privat. Admin: semua. Sales: hanya dokumen nasabah miliknya
// (dokumen polis & klaim: polis yang dipegang sales itu).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesiSekarang();
  if (!s) return new Response("Harus login", { status: 401 });
  const { id } = await params;

  const [d] = await db.select().from(dokumen).where(eq(dokumen.id, id)).limit(1);
  if (!d) return new Response("Tidak ditemukan", { status: 404 });

  if (s.user.role !== "admin") {
    let nasabahId: string | null = null;
    if (d.pemilikTipe === "nasabah") nasabahId = d.pemilikId;
    if (d.pemilikTipe === "kendaraan") {
      const [k] = await db.select({ n: kendaraan.nasabahId }).from(kendaraan).where(eq(kendaraan.id, d.pemilikId));
      nasabahId = k?.n ?? null;
    }
    if (d.pemilikTipe === "polis" || d.pemilikTipe === "klaim") {
      const polisId =
        d.pemilikTipe === "polis"
          ? d.pemilikId
          : (await db.select({ p: klaim.polisId }).from(klaim).where(eq(klaim.id, d.pemilikId)))[0]?.p;
      const [p] = polisId ? await db.select({ n: polis.nasabahId, s: polis.salesId }).from(polis).where(eq(polis.id, polisId)) : [];
      if (!p || p.s !== s.user.id) return new Response("Tidak ditemukan", { status: 404 });
      nasabahId = p.n;
    }
    const lewatPolis = d.pemilikTipe === "polis" || d.pemilikTipe === "klaim";
    const [milik] = nasabahId && !lewatPolis
      ? await db
          .select({ id: nasabah.id })
          .from(nasabah)
          .where(and(eq(nasabah.id, nasabahId), eq(nasabah.salesId, s.user.id)))
      : [];
    if (!milik && !lewatPolis) return new Response("Tidak ditemukan", { status: 404 });
  }

  const isi = await bacaFile(d.fileKey);
  return new Response(new Uint8Array(isi), {
    headers: {
      "Content-Type": tipeKonten(d.fileKey),
      "Content-Disposition": `inline; filename="${encodeURIComponent(d.namaFile ?? d.fileKey.split("/").pop()!)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
