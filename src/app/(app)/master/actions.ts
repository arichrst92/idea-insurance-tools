"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bengkel, kategoriPolis, kontakAsuransi, perusahaanAsuransi, rekening } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { normalisasiNoWa } from "@/lib/wa";
import { parsePersen } from "@/lib/format";
import { pelanggaranUnik } from "@/db/errors";
import type { StateForm } from "@/components/form-aksi";

const teks = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const opsional = (form: FormData, k: string) => teks(form, k) || null;
const pesanZod = (e: z.ZodError) => e.issues[0]?.message ?? "Data tidak valid";


// ─── Perusahaan asuransi ───

const skemaAsuransi = z.object({
  nama: z.string().min(2, "Nama asuransi wajib diisi"),
  kode: z
    .string()
    .min(2, "Kode minimal 2 huruf")
    .max(10)
    .transform((s) => s.toUpperCase()),
  alamat: z.string().nullable(),
  terminCashbackHari: z.coerce.number().int().min(0).max(365),
});

export async function simpanAsuransi(id: string | null, _: StateForm, form: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = skemaAsuransi.safeParse({
    nama: teks(form, "nama"),
    kode: teks(form, "kode"),
    alamat: opsional(form, "alamat"),
    terminCashbackHari: teks(form, "terminCashbackHari") || 30,
  });
  if (!p.success) return { error: pesanZod(p.error) };

  let recordId = id;
  try {
    if (id) {
      await db
        .update(perusahaanAsuransi)
        .set({ ...p.data, aktif: form.get("aktif") === "on" })
        .where(eq(perusahaanAsuransi.id, id));
    } else {
      [{ id: recordId }] = await db.insert(perusahaanAsuransi).values(p.data).returning({ id: perusahaanAsuransi.id });
    }
  } catch (e) {
    if (pelanggaranUnik(e)) return { error: `Kode ${p.data.kode} sudah dipakai asuransi lain` };
    throw e;
  }
  await catatAudit({ userId: user.id, aksi: id ? "ubah" : "tambah", tabel: "perusahaan_asuransi", recordId, detail: p.data });
  revalidatePath("/master/asuransi");
  if (!id) redirect(`/master/asuransi/${recordId}`);
  return { ok: "Tersimpan" };
}

const skemaKontak = z
  .object({
    namaPic: z.string().min(2, "Nama PIC wajib diisi"),
    jabatan: z.string().nullable(),
    email: z.string().email("Email tidak valid").nullable(),
    noWaMentah: z.string().nullable(),
    utama: z.boolean(),
  })
  .refine((k) => k.email || k.noWaMentah, { message: "Isi minimal email atau nomor WhatsApp" });

export async function tambahKontak(perusahaanId: string, _: StateForm, form: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = skemaKontak.safeParse({
    namaPic: teks(form, "namaPic"),
    jabatan: opsional(form, "jabatan"),
    email: opsional(form, "email"),
    noWaMentah: opsional(form, "noWa"),
    utama: form.get("utama") === "on",
  });
  if (!p.success) return { error: pesanZod(p.error) };
  const noWa = p.data.noWaMentah ? normalisasiNoWa(p.data.noWaMentah) : null;
  if (p.data.noWaMentah && !noWa) return { error: "Nomor WhatsApp tidak valid" };

  await db.transaction(async (tx) => {
    const [k] = await tx
      .insert(kontakAsuransi)
      .values({ perusahaanId, namaPic: p.data.namaPic, jabatan: p.data.jabatan, email: p.data.email, noWa, utama: p.data.utama })
      .returning({ id: kontakAsuransi.id });
    if (p.data.utama) {
      await tx
        .update(kontakAsuransi)
        .set({ utama: false })
        .where(and(eq(kontakAsuransi.perusahaanId, perusahaanId), ne(kontakAsuransi.id, k.id)));
    }
  });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "kontak_asuransi", recordId: perusahaanId, detail: p.data });
  revalidatePath(`/master/asuransi/${perusahaanId}`);
  return { ok: "Kontak ditambahkan" };
}

export async function jadikanUtama(perusahaanId: string, kontakId: string) {
  await wajibLogin("admin");
  await db.transaction(async (tx) => {
    await tx.update(kontakAsuransi).set({ utama: false }).where(eq(kontakAsuransi.perusahaanId, perusahaanId));
    await tx.update(kontakAsuransi).set({ utama: true }).where(eq(kontakAsuransi.id, kontakId));
  });
  revalidatePath(`/master/asuransi/${perusahaanId}`);
}

export async function hapusKontak(perusahaanId: string, kontakId: string) {
  const { user } = await wajibLogin("admin");
  await db.delete(kontakAsuransi).where(and(eq(kontakAsuransi.id, kontakId), eq(kontakAsuransi.perusahaanId, perusahaanId)));
  await catatAudit({ userId: user.id, aksi: "hapus", tabel: "kontak_asuransi", recordId: kontakId });
  revalidatePath(`/master/asuransi/${perusahaanId}`);
}

// ─── Kategori polis ───

export async function tambahKategori(_: StateForm, form: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = z
    .object({
      perusahaanId: z.string().min(1, "Pilih asuransi"),
      namaProduk: z.string().min(2, "Nama produk wajib diisi"),
      jenis: z.enum(["All Risk", "TLO"]),
      rateDasarPersen: z.number().min(0).max(100).nullable(),
      perluasanTersedia: z.array(z.string()),
    })
    .safeParse({
      perusahaanId: teks(form, "perusahaanId"),
      namaProduk: teks(form, "namaProduk"),
      jenis: teks(form, "jenis"),
      rateDasarPersen: teks(form, "rateDasarPersen") ? parsePersen(teks(form, "rateDasarPersen")) : null,
      perluasanTersedia: teks(form, "perluasan")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  if (!p.success) return { error: pesanZod(p.error) };
  const [k] = await db.insert(kategoriPolis).values(p.data).returning({ id: kategoriPolis.id });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "kategori_polis", recordId: k.id, detail: p.data });
  revalidatePath("/master/kategori");
  return { ok: "Kategori ditambahkan" };
}

export async function ubahAktifKategori(id: string, aktif: boolean) {
  await wajibLogin("admin");
  await db.update(kategoriPolis).set({ aktif }).where(eq(kategoriPolis.id, id));
  revalidatePath("/master/kategori");
}

// ─── Bengkel ───

export async function tambahBengkel(_: StateForm, form: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const nama = teks(form, "nama");
  if (nama.length < 2) return { error: "Nama bengkel wajib diisi" };
  const [b] = await db
    .insert(bengkel)
    .values({ nama, kota: opsional(form, "kota"), noTelp: opsional(form, "noTelp") })
    .returning({ id: bengkel.id });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "bengkel", recordId: b.id });
  revalidatePath("/master/bengkel");
  return { ok: "Bengkel ditambahkan" };
}

export async function ubahAktifBengkel(id: string, aktif: boolean) {
  await wajibLogin("admin");
  await db.update(bengkel).set({ aktif }).where(eq(bengkel.id, id));
  revalidatePath("/master/bengkel");
}

// ─── Rekening pembayaran & kantor ───

export async function tambahRekeningKantor(_: StateForm, form: FormData): Promise<StateForm> {
  const { user } = await wajibLogin("admin");
  const p = z
    .object({
      pemilikTipe: z.enum(["pembayaran", "kantor"]),
      namaBank: z.string().min(2, "Nama bank wajib diisi"),
      kodeBank: z.string().regex(/^\d{3}$/, "Kode bank 3 digit, mis. 014 untuk BCA").nullable(),
      noRekening: z.string().regex(/^[\d-]{5,25}$/, "Nomor rekening tidak valid"),
      atasNama: z.string().min(2, "Atas nama wajib diisi"),
      utama: z.boolean(),
    })
    .safeParse({
      pemilikTipe: teks(form, "pemilikTipe"),
      namaBank: teks(form, "namaBank"),
      kodeBank: opsional(form, "kodeBank"),
      noRekening: teks(form, "noRekening").replace(/\s/g, ""),
      atasNama: teks(form, "atasNama"),
      utama: form.get("utama") === "on",
    });
  if (!p.success) return { error: pesanZod(p.error) };
  const [r] = await db.insert(rekening).values(p.data).returning({ id: rekening.id });
  await catatAudit({ userId: user.id, aksi: "tambah", tabel: "rekening", recordId: r.id, detail: p.data });
  revalidatePath("/master/rekening");
  return { ok: "Rekening ditambahkan" };
}

export async function ubahAktifRekening(id: string, aktif: boolean) {
  const { user } = await wajibLogin("admin");
  await db.update(rekening).set({ aktif }).where(eq(rekening.id, id));
  await catatAudit({ userId: user.id, aksi: aktif ? "aktifkan" : "nonaktifkan", tabel: "rekening", recordId: id });
  revalidatePath("/master/rekening");
}
