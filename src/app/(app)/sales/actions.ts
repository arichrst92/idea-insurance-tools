"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, like, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rekening, targetSales, users } from "@/db/schema";
import { perluVerifikasiUlang, wajibLogin } from "@/lib/auth/session";
import { catatAudit } from "@/lib/audit";
import { normalisasiNoWa } from "@/lib/wa";
import { bulanIni, parsePersen, parseRupiah } from "@/lib/format";
import { pelanggaranUnik } from "@/db/errors";
import type { StateForm } from "@/components/form-aksi";

const teks = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

const skema = z
  .object({
    nama: z.string().min(2, "Nama wajib diisi"),
    noWa: z.string({ invalid_type_error: "Nomor WhatsApp tidak valid" }).min(1, "Nomor WhatsApp tidak valid"),
    email: z.string().email("Email tidak valid").nullable(),
    role: z.enum(["admin", "sales"]),
    tipeSales: z.enum(["fulltime", "freelance"]).nullable(),
    bagiHasilKantorPersen: z.number({ invalid_type_error: "Bagi hasil kantor wajib angka" }).min(0).max(100, "Bagi hasil maks 100%"),
    maksCashbackNasabahPersen: z.number({ invalid_type_error: "Maks cashback wajib angka" }).min(0).max(100, "Maks cashback maks 100%"),
    gajiPokok: z.number().min(0).nullable(),
    targetCase: z.number().int().min(0).nullable(),
    targetRevenue: z.number().min(0).nullable(),
    targetUtama: z.enum(["case", "revenue"]),
  })
  .superRefine((d, ctx) => {
    if (d.role === "sales" && !d.tipeSales) ctx.addIssue({ code: "custom", message: "Pilih tipe sales" });
    if (d.tipeSales === "fulltime") {
      if (!d.targetCase || !d.targetRevenue)
        ctx.addIssue({ code: "custom", message: "Sales fulltime wajib punya target case dan revenue bulanan" });
      if (d.gajiPokok == null) ctx.addIssue({ code: "custom", message: "Sales fulltime wajib punya gaji pokok" });
    }
  });

const skemaRekening = z.object({
  namaBank: z.string().min(2),
  kodeBank: z.string().regex(/^\d{3}$/, "Kode bank 3 digit").nullable(),
  noRekening: z.string().regex(/^[\d-]{5,25}$/, "Nomor rekening tidak valid"),
  atasNama: z.string().min(2, "Atas nama rekening wajib diisi"),
});

function angkaAtauNull(s: string, parse: (s: string) => number) {
  if (!s) return null;
  const n = parse(s);
  return Number.isNaN(n) ? NaN : n;
}

async function kodeSalesBaru(): Promise<string> {
  const [akhir] = await db
    .select({ kode: users.kodeSales })
    .from(users)
    .where(like(users.kodeSales, "S-%"))
    .orderBy(desc(users.kodeSales))
    .limit(1);
  const n = akhir?.kode ? Number(akhir.kode.slice(2)) + 1 : 1;
  return `S-${String(n).padStart(3, "0")}`;
}

export async function simpanSales(id: string | null, _: StateForm, form: FormData): Promise<StateForm> {
  const sesi = await wajibLogin("admin");
  if (id && perluVerifikasiUlang(sesi)) {
    return { error: "Mengubah bagi hasil, target, gaji, atau rekening butuh verifikasi OTP ulang. Klik 'Verifikasi sekarang' di atas form." };
  }

  const role = teks(form, "role") === "admin" ? "admin" : "sales";
  const tipe = teks(form, "tipeSales");
  const p = skema.safeParse({
    nama: teks(form, "nama"),
    noWa: normalisasiNoWa(teks(form, "noWa")),
    email: teks(form, "email") || null,
    role,
    tipeSales: role === "sales" && (tipe === "fulltime" || tipe === "freelance") ? tipe : null,
    bagiHasilKantorPersen: parsePersen(teks(form, "bagiHasilKantorPersen")),
    maksCashbackNasabahPersen: parsePersen(teks(form, "maksCashbackNasabahPersen")),
    gajiPokok: tipe === "fulltime" ? angkaAtauNull(teks(form, "gajiPokok"), parseRupiah) : null,
    targetCase: tipe === "fulltime" ? angkaAtauNull(teks(form, "targetCase"), Number) : null,
    targetRevenue: tipe === "fulltime" ? angkaAtauNull(teks(form, "targetRevenue"), parseRupiah) : null,
    targetUtama: teks(form, "targetUtama") === "case" ? "case" : "revenue",
  });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Data tidak valid" };
  const d = p.data;

  const adaRekening = teks(form, "noRekening");
  const r = adaRekening
    ? skemaRekening.safeParse({
        namaBank: teks(form, "namaBank"),
        kodeBank: teks(form, "kodeBank") || null,
        noRekening: teks(form, "noRekening").replace(/\s/g, ""),
        atasNama: teks(form, "atasNama") || teks(form, "nama"),
      })
    : null;
  if (r && !r.success) return { error: r.error.issues[0]?.message ?? "Rekening tidak valid" };

  const dataUser = {
    nama: d.nama,
    noWa: d.noWa,
    email: d.email,
    role: d.role,
    tipeSales: d.tipeSales,
    gajiPokok: d.gajiPokok,
    bagiHasilKantorPersen: d.bagiHasilKantorPersen,
    maksCashbackNasabahPersen: d.maksCashbackNasabahPersen,
  };

  let userId = id;
  try {
    await db.transaction(async (tx) => {
      if (id) {
        await tx.update(users).set(dataUser).where(eq(users.id, id));
      } else {
        const kodeSales = d.role === "sales" ? await kodeSalesBaru() : null;
        [{ id: userId }] = await tx.insert(users).values({ ...dataUser, kodeSales }).returning({ id: users.id });
      }

      if (d.tipeSales === "fulltime" && d.targetCase && d.targetRevenue) {
        const bulan = bulanIni();
        await tx
          .insert(targetSales)
          .values({
            salesId: userId!,
            bulan,
            targetCase: d.targetCase,
            targetRevenue: d.targetRevenue,
            targetUtama: d.targetUtama,
            gajiPokokBulan: d.gajiPokok,
          })
          .onConflictDoUpdate({
            target: [targetSales.salesId, targetSales.bulan],
            set: { targetCase: d.targetCase, targetRevenue: d.targetRevenue, targetUtama: d.targetUtama, gajiPokokBulan: d.gajiPokok },
          });
      }

      if (r?.success) {
        const [lama] = await tx
          .select()
          .from(rekening)
          .where(and(eq(rekening.pemilikTipe, "sales"), eq(rekening.pemilikId, userId!), eq(rekening.utama, true)))
          .limit(1);
        if (lama) await tx.update(rekening).set(r.data).where(eq(rekening.id, lama.id));
        else await tx.insert(rekening).values({ ...r.data, pemilikTipe: "sales", pemilikId: userId!, utama: true });
      }
    });
  } catch (e) {
    if (pelanggaranUnik(e)) return { error: "Nomor WhatsApp sudah terdaftar untuk pengguna lain" };
    throw e;
  }

  await catatAudit({ userId: sesi.user.id, aksi: id ? "ubah" : "tambah", tabel: "users", recordId: userId, detail: dataUser });
  revalidatePath("/sales");
  if (!id) redirect(`/sales/${userId}?baru=1`);
  return { ok: "Tersimpan" };
}
