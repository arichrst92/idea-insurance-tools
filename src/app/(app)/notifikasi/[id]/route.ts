import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifikasi } from "@/db/schema";
import { sesiSekarang } from "@/lib/auth/session";

// Buka notifikasi: tandai dibaca lalu arahkan ke tautannya (hanya tautan internal).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesiSekarang();
  const asal = new URL(req.url);
  if (!s) return NextResponse.redirect(new URL("/login", asal));
  const { id } = await params;
  const [n] = await db
    .update(notifikasi)
    .set({ dibaca: true })
    .where(and(eq(notifikasi.id, id), eq(notifikasi.userId, s.user.id)))
    .returning({ link: notifikasi.link });
  const tujuan = n?.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/notifikasi";
  return NextResponse.redirect(new URL(tujuan, asal));
}
