"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { waOptout, waTemplate } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { VARIABEL_TEMPLATE, variabelDipakai } from "@/lib/domain/variabel-wa";
import type { StateForm } from "@/components/form-aksi";

export async function simpanTemplate(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const [t] = await db.select().from(waTemplate).where(eq(waTemplate.id, id));
  if (!t) return { error: "Template tidak ditemukan" };
  const isi = String(f.get("isi") ?? "").trim();
  if (isi.length < 10) return { error: "Isi pesan terlalu pendek" };
  const boleh = VARIABEL_TEMPLATE[t.kode];
  const asing = boleh ? variabelDipakai(isi).filter((v) => !boleh.includes(v)) : [];
  if (asing.length) return { error: `Variabel tidak dikenal: ${asing.map((v) => `{${v}}`).join(", ")}` };
  await db.update(waTemplate).set({ isi, aktif: f.get("aktif") === "on" }).where(eq(waTemplate.id, id));
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "wa_template", recordId: t.kode });
  revalidatePath("/whatsapp");
  return { ok: "Template disimpan" };
}

export async function hapusOptout(id: string) {
  const { user } = await wajibLogin("admin");
  await db.delete(waOptout).where(eq(waOptout.id, id));
  await catatAudit({ userId: user.id, aksi: "hapus", tabel: "wa_optout", recordId: id });
  revalidatePath("/whatsapp");
}
