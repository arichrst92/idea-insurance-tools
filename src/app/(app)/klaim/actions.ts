"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { bengkel, dokumen, klaim, nasabah, polis, type User } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { FileTidakValid, simpanFile } from "@/lib/storage";
import { waktuWib } from "@/lib/domain/perpanjangan";
import { STATUS_TERBIT } from "@/lib/perpanjangan";
import type { StateForm } from "@/components/form-aksi";
import { adalahStaf } from "@/lib/peran";

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const MAKS_FOTO = 20;

/** Polis yang boleh dicatat klaimnya: admin semua; sales bila ia sales polis atau pemilik nasabahnya. */
export async function polisUntukKlaim(user: User, polisId: string) {
  const [b] = await db
    .select({ p: polis })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .where(
      and(eq(polis.id, polisId), adalahStaf(user) ? undefined : or(eq(polis.salesId, user.id), eq(nasabah.salesId, user.id))),
    );
  return b?.p ?? null;
}

export async function klaimMilik(user: User, id: string) {
  const [k] = await db.select().from(klaim).where(eq(klaim.id, id));
  if (!k) return null;
  return (await polisUntukKlaim(user, k.polisId)) ? k : null;
}

async function simpanFoto(f: FormData, klaimId: string, userId: string, sudah = 0) {
  const files = f.getAll("foto").filter((x): x is File => x instanceof File && x.size > 0);
  if (sudah + files.length > MAKS_FOTO) throw new FileTidakValid(`Maksimal ${MAKS_FOTO} foto per klaim`);
  for (const file of files) {
    const key = await simpanFile(file, "klaim");
    await db.insert(dokumen).values({ pemilikTipe: "klaim", pemilikId: klaimId, jenis: "foto_klaim", fileKey: key, namaFile: file.name.slice(0, 120), diuploadOleh: userId });
  }
  return files.length;
}

async function bengkelSah(f: FormData) {
  const id = teks(f, "bengkelId");
  if (!id) return null;
  const [b] = await db.select({ id: bengkel.id }).from(bengkel).where(eq(bengkel.id, id));
  return b ? b.id : undefined;
}

export async function catatKlaim(polisId: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const p = await polisUntukKlaim(user, polisId);
  if (!p) return { error: "Polis tidak ditemukan" };
  if (!(STATUS_TERBIT as readonly string[]).includes(p.statusPengajuan)) return { error: "Klaim hanya untuk polis yang sudah terbit" };

  const tglKlaim = teks(f, "tglKlaim");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tglKlaim)) return { error: "Isi tanggal kejadian" };
  if (tglKlaim > waktuWib().tanggal) return { error: "Tanggal kejadian tidak boleh di masa depan" };
  if (p.tglMulai && p.tglAkhir && (tglKlaim < p.tglMulai || tglKlaim > p.tglAkhir))
    return { error: `Tanggal kejadian di luar masa polis (${p.tglMulai} s/d ${p.tglAkhir})` };
  const bengkelId = await bengkelSah(f);
  if (bengkelId === undefined) return { error: "Bengkel tidak valid" };

  const [k] = await db
    .insert(klaim)
    .values({ polisId, tglKlaim, bengkelId, catatan: teks(f, "catatan") || null, dicatatOleh: user.id })
    .returning({ id: klaim.id });
  try {
    await simpanFoto(f, k.id, user.id);
  } catch (e) {
    if (e instanceof FileTidakValid) {
      await db.delete(klaim).where(eq(klaim.id, k.id));
      return { error: e.message };
    }
    throw e;
  }
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "klaim", recordId: k.id, detail: { polisId, tglKlaim } });
  revalidatePath("/klaim");
  revalidatePath(`/pengajuan/${polisId}`);
  redirect(`/klaim/${k.id}`);
}

export async function ubahKlaim(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const k = await klaimMilik(user, id);
  if (!k) return { error: "Klaim tidak ditemukan" };
  const status = teks(f, "status");
  if (!["diproses", "selesai", "ditolak"].includes(status)) return { error: "Status tidak valid" };
  const bengkelId = await bengkelSah(f);
  if (bengkelId === undefined) return { error: "Bengkel tidak valid" };
  await db
    .update(klaim)
    .set({ status: status as "diproses" | "selesai" | "ditolak", bengkelId, catatan: teks(f, "catatan") || null })
    .where(eq(klaim.id, id));
  await catatAudit({ userId: user.id, aksi: "ubah", tabel: "klaim", recordId: id, detail: { status } });
  revalidatePath(`/klaim/${id}`);
  revalidatePath("/klaim");
  revalidatePath(`/pengajuan/${k.polisId}`);
  return { ok: "Klaim diperbarui" };
}

export async function tambahFotoKlaim(id: string, _: StateForm, f: FormData): Promise<StateForm> {
  const { user } = await wajibLogin();
  const k = await klaimMilik(user, id);
  if (!k) return { error: "Klaim tidak ditemukan" };
  const [{ n }] = await db
    .select({ n: count() })
    .from(dokumen)
    .where(and(eq(dokumen.pemilikTipe, "klaim"), eq(dokumen.pemilikId, id)));
  try {
    const jml = await simpanFoto(f, id, user.id, n);
    if (jml === 0) return { error: "Pilih foto dulu" };
    revalidatePath(`/klaim/${id}`);
    return { ok: `${jml} foto ditambahkan` };
  } catch (e) {
    if (e instanceof FileTidakValid) return { error: e.message };
    throw e;
  }
}
