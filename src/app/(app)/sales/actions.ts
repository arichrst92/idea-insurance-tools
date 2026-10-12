"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, like, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rekening, targetSales, users } from "@/db/schema";
import { kabariOwner } from "@/lib/notifikasi";
import { adalahOwner } from "@/lib/peran";
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
    role: z.enum(["admin", "sales", "owner"]),
    jugaSales: z.boolean(),
    /** false = editor admin: kebijakan (bagi hasil, gaji, target) tidak divalidasi/diubah */
    kebijakan: z.boolean(),
    tipeSales: z.enum(["fulltime", "freelance"]).nullable(),
    bagiHasilKantorPersen: z.number({ invalid_type_error: "Bagi hasil kantor wajib angka" }).min(0).max(100, "Bagi hasil maks 100%"),
    maksCashbackNasabahPersen: z.number({ invalid_type_error: "Maks cashback wajib angka" }).min(0).max(100, "Maks cashback maks 100%"),
    gajiPokok: z.number().min(0).nullable(),
    targetCase: z.number().int().min(0).nullable(),
    targetRevenue: z.number().min(0).nullable(),
    targetUtama: z.enum(["case", "revenue"]),
  })
  .superRefine((d, ctx) => {
    const penjual = d.role === "sales" || (d.role === "owner" && d.jugaSales);
    if (penjual && !d.tipeSales) ctx.addIssue({ code: "custom", message: "Pilih tipe sales" });
    if (d.tipeSales === "fulltime" && d.kebijakan) {
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
  const owner = adalahOwner(sesi.user);
  if (id && perluVerifikasiUlang(sesi)) {
    return { error: "Mengubah bagi hasil, target, gaji, atau rekening butuh verifikasi OTP ulang. Klik 'Verifikasi sekarang' di atas form." };
  }
  const [lama] = id ? await db.select().from(users).where(eq(users.id, id)) : [];
  if (id && !lama) return { error: "Pengguna tidak ditemukan" };
  // Admin hanya mengelola akun sales; akun admin/owner & kebijakan komisi hanya oleh owner.
  if (!owner && lama && lama.role !== "sales") return { error: "Hanya owner yang bisa mengubah akun admin/owner" };

  const r0 = teks(form, "role");
  const role = owner && (r0 === "admin" || r0 === "owner") ? r0 : "sales";
  const jugaSales = role === "owner" && form.get("jugaSales") === "on";
  const penjual = role === "sales" || jugaSales;
  if (lama?.role === "owner" && role !== "owner") {
    const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.role, "owner"), eq(users.aktif, true)));
    if (n <= 1) return { error: "Harus ada minimal satu owner aktif" };
  }
  const tipe = teks(form, "tipeSales");
  const p = skema.safeParse({
    nama: teks(form, "nama"),
    noWa: normalisasiNoWa(teks(form, "noWa")),
    email: teks(form, "email") || null,
    role,
    jugaSales,
    kebijakan: owner,
    tipeSales: penjual && (tipe === "fulltime" || tipe === "freelance") ? tipe : null,
    bagiHasilKantorPersen: owner ? parsePersen(teks(form, "bagiHasilKantorPersen")) : (lama?.bagiHasilKantorPersen ?? 30),
    maksCashbackNasabahPersen: owner ? parsePersen(teks(form, "maksCashbackNasabahPersen")) : (lama?.maksCashbackNasabahPersen ?? 20),
    gajiPokok: !owner ? (lama?.gajiPokok ?? null) : tipe === "fulltime" ? angkaAtauNull(teks(form, "gajiPokok"), parseRupiah) : null,
    targetCase: owner && tipe === "fulltime" ? angkaAtauNull(teks(form, "targetCase"), Number) : null,
    targetRevenue: owner && tipe === "fulltime" ? angkaAtauNull(teks(form, "targetRevenue"), parseRupiah) : null,
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
    jugaSales: d.jugaSales,
    tipeSales: d.tipeSales,
    gajiPokok: d.gajiPokok,
    bagiHasilKantorPersen: d.bagiHasilKantorPersen,
    maksCashbackNasabahPersen: d.maksCashbackNasabahPersen,
  };

  let userId = id;
  try {
    await db.transaction(async (tx) => {
      const kodeSales = penjual && !lama?.kodeSales ? await kodeSalesBaru() : undefined;
      if (id) {
        await tx.update(users).set({ ...dataUser, ...(kodeSales ? { kodeSales } : {}) }).where(eq(users.id, id));
      } else {
        [{ id: userId }] = await tx.insert(users).values({ ...dataUser, kodeSales: kodeSales ?? null }).returning({ id: users.id });
      }

      if (owner && d.tipeSales === "fulltime" && d.targetCase && d.targetRevenue) {
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
  // Sales baru dari admin: kebijakan komisi (dan target/gaji bila fulltime) masih perlu diatur owner.
  if (!owner && !id)
    await kabariOwner({
      jenis: "sales_baru",
      judul: `Sales baru: ${d.nama}`,
      isi: `Ditambahkan oleh ${sesi.user.nama}. Cek bagi hasil kantor & maks cashback${d.tipeSales === "fulltime" ? ", target, dan gaji pokok" : ""}.`,
      link: `/sales/${userId}`,
    });
  revalidatePath("/sales");
  if (!id) redirect(`/sales/${userId}?baru=1`);
  return { ok: "Tersimpan" };
}
