"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nasabah, polis } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { buatDraftPerpanjangan, GagalPerpanjangan, kirimRemindPerpanjangan } from "@/lib/perpanjangan";
import type { StateForm } from "@/components/form-aksi";

/** Polis lama boleh diurus perpanjangannya oleh admin atau sales pemilik nasabah saat ini. */
async function polisLamaMilik(userId: string, admin: boolean, polisId: string) {
  const [b] = await db
    .select({ id: polis.id })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .where(and(eq(polis.id, polisId), admin ? undefined : eq(nasabah.salesId, userId)));
  return b ?? null;
}

export async function remindManual(polisId: string): Promise<StateForm> {
  const { user } = await wajibLogin();
  if (!(await polisLamaMilik(user.id, user.role === "admin", polisId))) return { error: "Polis tidak ditemukan" };
  const h = await kirimRemindPerpanjangan(polisId, { tahap: null, oleh: user.id });
  await catatAudit({ userId: user.id, aksi: "remind_perpanjangan", tabel: "polis", recordId: polisId });
  revalidatePath("/perpanjangan");
  revalidatePath(`/pengajuan/${polisId}`);
  if (h.kanal === "optout") return { error: "Nasabah sudah membalas BERHENTI; hubungi langsung bila perlu." };
  if (h.kanal === "wame") return { ok: "Fonnte tidak tersedia — kirim remind dari WhatsApp yang terbuka.", bukaUrl: h.url };
  return { ok: "Remind terkirim ke WhatsApp nasabah" };
}

export async function perpanjang(polisId: string): Promise<StateForm> {
  const { user } = await wajibLogin();
  if (!(await polisLamaMilik(user.id, user.role === "admin", polisId))) return { error: "Polis tidak ditemukan" };
  let id: string;
  try {
    const d = await buatDraftPerpanjangan(polisId, user.id);
    id = d.id;
    if (d.baru) await catatAudit({ userId: user.id, aksi: "perpanjang", tabel: "polis", recordId: d.id, detail: { dari: polisId } });
  } catch (e) {
    if (e instanceof GagalPerpanjangan) return { error: e.message };
    throw e;
  }
  revalidatePath("/perpanjangan");
  revalidatePath("/pengajuan");
  redirect(`/pengajuan/${id}`);
}
