import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { polis, targetSales, users } from "@/db/schema";
import { sudahLunas } from "@/lib/laporan";
import { hitungGaji, pencapaianPersen } from "@/lib/domain/gaji";
import { akhirDariBulan, awalBulan, geserBulan, rasio } from "@/lib/domain/periode";

export type Realisasi = { salesId: string; polis: number; premi: number; komisi: number };

/**
 * Realisasi semua sales (polis lunas & premi, menurut tanggal lunas) dalam rentang — dipakai untuk peringkat & target.
 * Hasilnya tidak pernah dikirim utuh ke sales; halaman sales hanya menampilkan baris & peringkatnya sendiri.
 */
export async function realisasiSemua(dari: string, sampai: string): Promise<Map<string, Realisasi>> {
  const rows = await db
    .select({
      salesId: polis.salesId,
      polis: sql<number>`count(*)`.mapWith(Number),
      premi: sql<number>`coalesce(sum(${polis.premiBruto}), 0)`.mapWith(Number),
      komisi: sql<number>`coalesce(sum(${polis.komisiSalesRp}), 0)`.mapWith(Number),
    })
    .from(polis)
    .where(and(sudahLunas, sql`${polis.tglBayar} between ${dari} and ${sampai}`))
    .groupBy(polis.salesId);
  return new Map(rows.map((r) => [r.salesId, r]));
}

/** Realisasi satu sales per bulan (YYYY-MM-01 → angka). */
export async function realisasiBulanan(salesId: string, dariBulan: string, sampaiBulan: string) {
  const bulanSql = sql<string>`to_char(${polis.tglBayar}, 'YYYY-MM') || '-01'`;
  const rows = await db
    .select({
      bulan: bulanSql,
      polis: sql<number>`count(*)`.mapWith(Number),
      premi: sql<number>`coalesce(sum(${polis.premiBruto}), 0)`.mapWith(Number),
      komisi: sql<number>`coalesce(sum(${polis.komisiSalesRp}), 0)`.mapWith(Number),
    })
    .from(polis)
    .where(
      and(
        eq(polis.salesId, salesId),
        sudahLunas,
        sql`${polis.tglBayar} between ${dariBulan} and ${akhirDariBulan(sampaiBulan)}`,
      ),
    )
    .groupBy(bulanSql);
  return new Map(rows.map((r) => [r.bulan, r]));
}

export type Target = typeof targetSales.$inferSelect;

/** Target dalam rentang bulan (dijumlahkan; target utama mengikuti bulan terakhir). */
export async function targetRentang(dari: string, sampai: string) {
  const rows = await db
    .select()
    .from(targetSales)
    .where(and(gte(targetSales.bulan, awalBulan(dari)), lte(targetSales.bulan, sampai)))
    .orderBy(asc(targetSales.bulan));
  const m = new Map<string, { targetCase: number; targetRevenue: number; utama: "case" | "revenue" }>();
  for (const t of rows) {
    const x = m.get(t.salesId) ?? { targetCase: 0, targetRevenue: 0, utama: t.targetUtama };
    x.targetCase += t.targetCase;
    x.targetRevenue += t.targetRevenue;
    x.utama = t.targetUtama;
    m.set(t.salesId, x);
  }
  return m;
}

/** Pencapaian target utama (%) dari realisasi. */
export function capaian(t: { targetCase: number; targetRevenue: number; utama: "case" | "revenue" } | undefined, r: { polis: number; premi: number }) {
  if (!t) return null;
  const pCase = pencapaianPersen(r.polis, t.targetCase);
  const pRev = pencapaianPersen(r.premi, t.targetRevenue);
  return { pCase, pRev, utama: t.utama, pUtama: t.utama === "case" ? pCase : pRev };
}

/** Peringkat berdasarkan revenue (premi), lalu jumlah polis. */
export function peringkat(semua: Map<string, Realisasi>, salesIds: string[]) {
  return salesIds
    .map((id) => semua.get(id) ?? { salesId: id, polis: 0, premi: 0, komisi: 0 })
    .sort((a, b) => b.premi - a.premi || b.polis - a.polis)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Data halaman detail sales: progres bulan berjalan, estimasi gaji, riwayat 12 bulan. */
export async function detailPerforma(salesId: string, hariIni: string) {
  const [s] = await db.select().from(users).where(eq(users.id, salesId));
  if (!s) return null;
  const bulanIni = awalBulan(hariIni);
  const dari = geserBulan(bulanIni, -11);
  const [real, targets] = await Promise.all([
    realisasiBulanan(salesId, dari, bulanIni),
    db
      .select()
      .from(targetSales)
      .where(and(eq(targetSales.salesId, salesId), gte(targetSales.bulan, dari), lte(targetSales.bulan, bulanIni))),
  ]);
  const tMap = new Map(targets.map((t) => [t.bulan, t]));
  const riwayat = Array.from({ length: 12 }, (_, i) => geserBulan(bulanIni, -i)).map((bulan) => {
    const r = real.get(bulan) ?? { polis: 0, premi: 0, komisi: 0 };
    const t = tMap.get(bulan);
    const c = t ? capaian({ targetCase: t.targetCase, targetRevenue: t.targetRevenue, utama: t.targetUtama }, r) : null;
    return { bulan, ...r, target: t ?? null, capaian: c, ditutup: !!t?.ditutup, tercapai: t?.ditutup ? t.tercapai : null };
  });
  const sekarang = riwayat[0];
  const gajiPokok = sekarang.target?.gajiPokokBulan ?? s.gajiPokok ?? 0;
  const estimasiGaji =
    s.tipeSales === "fulltime" && sekarang.capaian && gajiPokok > 0 ? hitungGaji(gajiPokok, sekarang.capaian.pUtama) : null;
  const ditutup = riwayat.filter((r) => r.ditutup);
  return {
    sales: s,
    sekarang,
    estimasiGaji,
    gajiPokok,
    riwayat,
    achieve: ditutup.filter((r) => r.tercapai).length,
    tidakAchieve: ditutup.filter((r) => r.tercapai === false).length,
    rasioAchieve: rasio(ditutup.filter((r) => r.tercapai).length, ditutup.length),
  };
}
