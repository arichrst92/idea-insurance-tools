import "server-only";
import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { kategoriPolis, kendaraan, klaim, nasabah, perusahaanAsuransi, polis, users, type User } from "@/db/schema";
import { STATUS_TERBIT } from "@/lib/perpanjangan";
import { rasio } from "@/lib/domain/periode";

/**
 * Definisi laporan:
 * - Penjualan dihitung pada tanggal POLIS TERBIT (WIB), premi = premi bruto.
 *   Pengajuan batal/ditolak/salah input tidak pernah terbit sehingga tidak terhitung.
 * - Komisi & cashback mengikuti angka yang disalin ke polis saat disetujui.
 * - Renewal rate: polis yang jatuh tempo di periode (kendaraan masih dipakai) → berapa yang sudah diperpanjang.
 * - Sales hanya melihat polisnya sendiri dan tidak pernah menerima cashback asuransi / bagian kantor.
 */

export const tglTerbitSql = sql<string>`(select to_char(min(sh.waktu) at time zone 'Asia/Jakarta', 'YYYY-MM-DD') from status_history sh where sh.polis_id = ${polis.id} and sh.status = 'polis_terbit')`;

export type FilterLaporan = {
  dari: string;
  sampai: string;
  salesId?: string;
  perusahaanId?: string;
  kategoriId?: string;
};

export type BarisPolis = {
  id: string;
  kode: string;
  noPolis: string | null;
  tglTerbit: string;
  nasabah: string;
  plat: string;
  salesId: string;
  sales: string;
  asuransi: string;
  paket: string;
  perpanjangan: boolean;
  premi: number;
  cashbackNasabah: number;
  komisi: number;
  komisiEvent: number;
  lunas: boolean;
  /** Hanya admin */
  cashbackTotal?: number;
  bagianKantor?: number;
};

export type Agregat = {
  kunci: string;
  label: string;
  polis: number;
  premi: number;
  cashbackNasabah: number;
  komisi: number;
  komisiEvent: number;
  cashbackTotal?: number;
  bagianKantor?: number;
};

function lingkup(user: User, f: FilterLaporan): SQL | undefined {
  return and(
    user.role === "admin" ? (f.salesId ? eq(polis.salesId, f.salesId) : undefined) : eq(polis.salesId, user.id),
    f.perusahaanId ? eq(polis.perusahaanId, f.perusahaanId) : undefined,
    f.kategoriId ? eq(polis.kategoriId, f.kategoriId) : undefined,
  );
}

/** Polis terbit dalam periode (detail per baris). */
export async function polisTerbit(user: User, f: FilterLaporan): Promise<BarisPolis[]> {
  const admin = user.role === "admin";
  const rows = await db
    .select({
      p: polis,
      tglTerbit: tglTerbitSql,
      nasabah: nasabah.nama,
      plat: kendaraan.noPolisi,
      sales: users.nama,
      asuransi: perusahaanAsuransi.nama,
      paket: kategoriPolis.nama,
    })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(users, eq(users.id, polis.salesId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .leftJoin(kategoriPolis, eq(kategoriPolis.id, polis.kategoriId))
    .where(
      and(
        inArray(polis.statusPengajuan, [...STATUS_TERBIT]),
        lingkup(user, f),
        sql`${tglTerbitSql} between ${f.dari} and ${f.sampai}`,
      ),
    )
    .orderBy(tglTerbitSql, polis.kode);
  return rows.map((r) => ({
    id: r.p.id,
    kode: r.p.kode,
    noPolis: r.p.noPolis,
    tglTerbit: r.tglTerbit,
    nasabah: r.nasabah,
    plat: r.plat,
    salesId: r.p.salesId,
    sales: r.sales,
    asuransi: r.asuransi ?? "-",
    paket: r.paket ?? "-",
    perpanjangan: !!r.p.polisSebelumnyaId,
    premi: r.p.premiBruto ?? 0,
    cashbackNasabah: r.p.cashbackNasabahRp ?? 0,
    komisi: r.p.komisiSalesRp ?? 0,
    komisiEvent: r.p.komisiEventRp ?? 0,
    lunas: r.p.statusBayar === "lunas",
    ...(admin ? { cashbackTotal: r.p.cashbackTotalRp ?? 0, bagianKantor: r.p.bagianKantorRp ?? 0 } : {}),
  }));
}

export function agregasi(rows: BarisPolis[], kunci: (r: BarisPolis) => [string, string], admin: boolean): Agregat[] {
  const m = new Map<string, Agregat>();
  for (const r of rows) {
    const [k, label] = kunci(r);
    const a =
      m.get(k) ??
      ({ kunci: k, label, polis: 0, premi: 0, cashbackNasabah: 0, komisi: 0, komisiEvent: 0, ...(admin ? { cashbackTotal: 0, bagianKantor: 0 } : {}) } as Agregat);
    a.polis++;
    a.premi += r.premi;
    a.cashbackNasabah += r.cashbackNasabah;
    a.komisi += r.komisi;
    a.komisiEvent += r.komisiEvent;
    if (admin) {
      a.cashbackTotal! += r.cashbackTotal ?? 0;
      a.bagianKantor! += r.bagianKantor ?? 0;
    }
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.premi - a.premi || a.label.localeCompare(b.label));
}

export const total = (rows: BarisPolis[], admin: boolean) => agregasi(rows, () => ["total", "Total"], admin)[0] ?? null;

/** Renewal rate: polis yang jatuh tempo di periode → sudah diperpanjang / sedang diproses / belum. */
export async function renewal(user: User, f: FilterLaporan) {
  const rows = await db
    .select({
      salesId: polis.salesId,
      sales: users.nama,
      statusMasa: polis.statusMasa,
      lanjut: sql<string | null>`(select l.status_pengajuan::text from polis l where l.polis_sebelumnya_id = ${polis.id})`,
    })
    .from(polis)
    .innerJoin(users, eq(users.id, polis.salesId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .where(
      and(
        inArray(polis.statusPengajuan, [...STATUS_TERBIT]),
        lingkup(user, f),
        gte(polis.tglAkhir, f.dari),
        lte(polis.tglAkhir, f.sampai),
        sql`coalesce(${polis.statusMasa}::text, '') not in ('kendaraan_dijual', 'batal')`,
      ),
    );
  const ditutup = ["batal_nasabah", "ditolak_asuransi", "batal_salah_input"];
  const hitung = (rs: typeof rows) => {
    const diperpanjang = rs.filter((r) => r.statusMasa === "diperpanjang").length;
    const proses = rs.filter((r) => r.statusMasa !== "diperpanjang" && r.lanjut && !ditutup.includes(r.lanjut)).length;
    return { jatuhTempo: rs.length, diperpanjang, proses, belum: rs.length - diperpanjang - proses, rate: rasio(diperpanjang, rs.length) };
  };
  const perSales = new Map<string, { sales: string; rows: typeof rows }>();
  for (const r of rows) {
    const x = perSales.get(r.salesId) ?? { sales: r.sales, rows: [] };
    x.rows.push(r);
    perSales.set(r.salesId, x);
  }
  return {
    ...hitung(rows),
    perSales: [...perSales.entries()].map(([id, x]) => ({ salesId: id, sales: x.sales, ...hitung(x.rows) })),
  };
}

/** Klaim dengan tanggal kejadian di periode. */
export async function ringkasKlaim(user: User, f: FilterLaporan) {
  const rows = await db
    .select({ status: klaim.status, asuransi: perusahaanAsuransi.nama })
    .from(klaim)
    .innerJoin(polis, eq(polis.id, klaim.polisId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .where(and(lingkup(user, f), gte(klaim.tglKlaim, f.dari), lte(klaim.tglKlaim, f.sampai)));
  const perAsuransi = new Map<string, { diproses: number; selesai: number; ditolak: number }>();
  for (const r of rows) {
    const k = r.asuransi ?? "-";
    const x = perAsuransi.get(k) ?? { diproses: 0, selesai: 0, ditolak: 0 };
    x[r.status]++;
    perAsuransi.set(k, x);
  }
  return {
    total: rows.length,
    diproses: rows.filter((r) => r.status === "diproses").length,
    selesai: rows.filter((r) => r.status === "selesai").length,
    ditolak: rows.filter((r) => r.status === "ditolak").length,
    perAsuransi: [...perAsuransi.entries()].map(([asuransi, x]) => ({ asuransi, ...x })),
  };
}

/** Pilihan filter (sales, asuransi, paket). */
export async function pilihanFilter(admin: boolean) {
  const [sales, asuransi, paket] = await Promise.all([
    admin ? db.select({ id: users.id, nama: users.nama }).from(users).where(eq(users.role, "sales")).orderBy(users.nama) : Promise.resolve([]),
    db.select({ id: perusahaanAsuransi.id, nama: perusahaanAsuransi.nama }).from(perusahaanAsuransi).orderBy(perusahaanAsuransi.nama),
    db
      .select({ id: kategoriPolis.id, nama: kategoriPolis.nama, asuransi: perusahaanAsuransi.nama })
      .from(kategoriPolis)
      .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, kategoriPolis.perusahaanId))
      .orderBy(perusahaanAsuransi.nama, kategoriPolis.urutan),
  ]);
  return { sales, asuransi, paket };
}
