"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { panduanBagian, users } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { LANGKAH_ONBOARDING, PANDUAN_BAWAAN, uraiPanduan } from "@/lib/domain/panduan";
import type { StateForm } from "@/components/form-aksi";

function segarkan() {
  revalidatePath("/panduan");
  revalidatePath("/");
}

/** Sales mencentang langkah onboarding yang dikerjakan manual (baca cara dibayar / journey). */
export async function centangOnboarding(kode: string) {
  const { user } = await wajibLogin("sales");
  if (!LANGKAH_ONBOARDING.some((l) => l.kode === kode && l.manual)) return;
  await db
    .update(users)
    .set({ onboardingCentang: sql`array_append(array_remove(${users.onboardingCentang}, ${kode}), ${kode})` })
    .where(eq(users.id, user.id));
  segarkan();
}

/** Sembunyikan checklist dari dashboard (tetap ada di halaman Panduan). */
export async function tutupOnboarding() {
  const { user } = await wajibLogin("sales");
  await db.update(users).set({ onboardingDitutup: new Date() }).where(eq(users.id, user.id));
  segarkan();
}

function bacaBagian(f: FormData) {
  const judul = String(f.get("judul") ?? "").trim();
  const isi = String(f.get("isi") ?? "").replace(/\r\n/g, "\n").trim();
  const urutan = Number(String(f.get("urutan") ?? "0").replace(/\D/g, "") || 0);
  if (judul.length < 3) return { error: "Judul terlalu pendek" } as const;
  if (judul.length > 80) return { error: "Judul maksimal 80 karakter" } as const;
  if (isi.length < 10) return { error: "Isi terlalu pendek" } as const;
  if (isi.length > 20000) return { error: "Isi terlalu panjang (maks 20.000 karakter)" } as const;
  if (uraiPanduan(isi).length === 0) return { error: "Isi kosong" } as const;
  return { data: { judul, isi, urutan: Math.min(urutan, 9999), aktif: f.get("aktif") === "on" } } as const;
}

export async function simpanBagian(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const b = bacaBagian(f);
  if ("error" in b) return { error: b.error };
  const [ada] = await db.update(panduanBagian).set({ ...b.data, diubahOleh: user.id }).where(eq(panduanBagian.id, id)).returning();
  if (!ada) return { error: "Bagian tidak ditemukan" };
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "panduan_bagian", recordId: ada.kode });
  segarkan();
  return { ok: "Bagian disimpan" };
}

export async function tambahBagian(_: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const b = bacaBagian(f);
  if ("error" in b) return { error: b.error };
  const kode = `b_${Date.now().toString(36)}`;
  await db.insert(panduanBagian).values({ ...b.data, kode, diubahOleh: user.id });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "panduan_bagian", recordId: kode });
  segarkan();
  return { ok: "Bagian ditambahkan" };
}

/** Kembalikan bagian bawaan ke isi awal. */
export async function pulihkanBagian(id: string): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const [b] = await db.select().from(panduanBagian).where(eq(panduanBagian.id, id));
  const awal = b && PANDUAN_BAWAAN.find((x) => x.kode === b.kode);
  if (!awal) return { error: "Bagian ini bukan bawaan" };
  await db.update(panduanBagian).set({ judul: awal.judul, isi: awal.isi, urutan: awal.urutan, aktif: true, diubahOleh: user.id }).where(eq(panduanBagian.id, id));
  await catatAudit({ userId: user.id, aksi: "pulihkan", tabel: "panduan_bagian", recordId: b.kode });
  segarkan();
  return { ok: "Isi bawaan dikembalikan" };
}
