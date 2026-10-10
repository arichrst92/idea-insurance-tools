import { timingSafeEqual } from "node:crypto";
import { sesiSekarang } from "@/lib/auth/session";
import { jalankanOtomasi } from "@/lib/otomasi";

// Picu otomasi dari cron luar: POST /api/cron/<kode> dengan header
// "Authorization: Bearer <CRON_SECRET>". Admin yang sedang login juga boleh.
function rahasiaCocok(req: Request) {
  const rahasia = process.env.CRON_SECRET;
  const h = req.headers.get("authorization") ?? "";
  if (!rahasia || !h.startsWith("Bearer ")) return false;
  const a = Buffer.from(h.slice(7));
  const b = Buffer.from(rahasia);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request, { params }: { params: Promise<{ kode: string }> }) {
  if (!rahasiaCocok(req)) {
    const s = await sesiSekarang();
    if (s?.user.role !== "admin") return Response.json({ ok: false, pesan: "Tidak diizinkan" }, { status: 401 });
  }
  const { kode } = await params;
  const h = await jalankanOtomasi(kode, { paksa: new URL(req.url).searchParams.get("paksa") === "1" });
  return Response.json(h, { status: h.ok ? 200 : 400 });
}
