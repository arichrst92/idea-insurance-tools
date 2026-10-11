import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifikasi } from "@/db/schema";
import { sesiSekarang } from "@/lib/auth/session";

// Buka notifikasi: tandai dibaca lalu arahkan ke tautannya (hanya tautan internal).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesiSekarang();
  // Location relatif (lihat middleware): req.url di belakang proxy berisi host internal.
  const alihkan = (ke: string) => new NextResponse(null, { status: 307, headers: { Location: ke } });
  if (!s) return alihkan("/login");
  const { id } = await params;
  const [n] = await db
    .update(notifikasi)
    .set({ dibaca: true })
    .where(and(eq(notifikasi.id, id), eq(notifikasi.userId, s.user.id)))
    .returning({ link: notifikasi.link });
  const tujuan = n?.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifikasi";
  return alihkan(tujuan);
}
