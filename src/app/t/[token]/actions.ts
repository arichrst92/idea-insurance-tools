"use server";

import { redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { dokumen, nasabah, polis, trackerLink } from "@/db/schema";
import { buatLinkUnduh } from "@/lib/unduh";

export type StateUnduh = { error?: string };

const MAKS_PERCOBAAN = 5;

/** Unduh PDF polis dari halaman tracker: wajib 4 digit terakhir nomor WhatsApp nasabah. */
export async function unduhPolis(token: string, _: StateUnduh, f: FormData): Promise<StateUnduh> {
  const [b] = await db
    .select({ p: polis, noWa: nasabah.noWa, t: trackerLink })
    .from(trackerLink)
    .innerJoin(polis, eq(polis.id, trackerLink.polisId))
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .where(and(eq(trackerLink.token, token), isNull(trackerLink.dicabut)));
  if (!b) return { error: "Link tidak berlaku" };
  if (b.t.gagalUnduh >= MAKS_PERCOBAAN) return { error: "Terlalu banyak percobaan. Hubungi sales Anda untuk link baru." };

  const digit = String(f.get("digit") ?? "").replace(/\D/g, "");
  if (digit.length !== 4 || digit !== b.noWa.slice(-4)) {
    await db.update(trackerLink).set({ gagalUnduh: sql`${trackerLink.gagalUnduh} + 1` }).where(eq(trackerLink.id, b.t.id));
    const sisa = MAKS_PERCOBAAN - b.t.gagalUnduh - 1;
    return { error: sisa > 0 ? `4 digit tidak cocok. Sisa ${sisa} percobaan.` : "Terlalu banyak percobaan. Hubungi sales Anda untuk link baru." };
  }
  await db.update(trackerLink).set({ gagalUnduh: 0 }).where(eq(trackerLink.id, b.t.id));
  const [pdf] = await db
    .select({ id: dokumen.id })
    .from(dokumen)
    .where(and(eq(dokumen.pemilikTipe, "polis"), eq(dokumen.pemilikId, b.p.id), eq(dokumen.jenis, "polis")))
    .orderBy(desc(dokumen.dibuat))
    .limit(1);
  if (!pdf) return { error: "PDF polis belum tersedia" };
  const url = await buatLinkUnduh(pdf.id, 1);
  redirect(new URL(url).pathname);
}
