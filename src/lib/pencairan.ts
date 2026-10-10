import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, nasabah, perusahaanAsuransi, polis, rekening, users, type User } from "@/db/schema";
import { sisaHari } from "@/lib/domain/perpanjangan";

/**
 * Tahap pencairan setelah nasabah lunas:
 *  setor   — premi belum disetor ke asuransi (status Lunas)
 *  cair    — premi disetor, dana (cashback) asuransi belum cair; "lewat termin" bila melewati termin master asuransi
 *  nasabah — cashback nasabah belum ditransfer (sejak lunas)
 *  komisi  — dana asuransi cair, komisi sales belum ditransfer
 */
export type Tahap = "setor" | "cair" | "nasabah" | "komisi";

export const LABEL_TAHAP: Record<Tahap, string> = {
  setor: "Setor premi",
  cair: "Menunggu dana asuransi",
  nasabah: "Transfer cashback nasabah",
  komisi: "Transfer komisi",
};

export type BarisCair = {
  id: string;
  kode: string;
  noPolis: string | null;
  nasabah: string;
  plat: string;
  salesId: string;
  sales: string;
  asuransi: string;
  /** tanggal acuan umur tahap */
  sejak: string | null;
  umur: number;
  lewatTermin: boolean;
  terminHari: number;
  premi: number;
  cashbackNasabah: number;
  komisi: number;
  /** Hanya admin */
  cashbackTotal?: number;
  tglBayar: string | null;
  tglSetor: string | null;
  tglCair: string | null;
  tglTransferNasabah: string | null;
  tglTransferSales: string | null;
};

const sesudahLunas = ["lunas", "premi_disetor", "cashback_cair", "selesai"] as const;

export async function dataPencairan(user: User, hariIni: string) {
  const admin = user.role === "admin";
  const rows = await db
    .select({ p: polis, nasabah: nasabah.nama, plat: kendaraan.noPolisi, sales: users.nama, asuransi: perusahaanAsuransi.nama, termin: perusahaanAsuransi.terminCashbackHari })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(users, eq(users.id, polis.salesId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .where(and(inArray(polis.statusPengajuan, [...sesudahLunas]), admin ? undefined : eq(polis.salesId, user.id)));

  const umur = (t: string | null) => (t ? -sisaHari(t, hariIni) : 0);
  const baris = (r: (typeof rows)[number], sejak: string | null): BarisCair => ({
    id: r.p.id,
    kode: r.p.kode,
    noPolis: r.p.noPolis,
    nasabah: r.nasabah,
    plat: r.plat,
    salesId: r.p.salesId,
    sales: r.sales,
    asuransi: r.asuransi ?? "-",
    sejak,
    umur: umur(sejak),
    lewatTermin: false,
    terminHari: r.termin ?? 30,
    premi: r.p.premiBruto ?? 0,
    cashbackNasabah: r.p.cashbackNasabahRp ?? 0,
    komisi: r.p.komisiSalesRp ?? 0,
    ...(admin ? { cashbackTotal: r.p.cashbackTotalRp ?? 0 } : {}),
    tglBayar: r.p.tglBayar,
    tglSetor: r.p.tglSetorAsuransi,
    tglCair: r.p.tglCairAsuransi,
    tglTransferNasabah: r.p.tglTransferNasabah,
    tglTransferSales: r.p.tglTransferSales,
  });

  const tahap: Record<Tahap, BarisCair[]> = { setor: [], cair: [], nasabah: [], komisi: [] };
  for (const r of rows) {
    const s = r.p.statusPengajuan;
    if (s === "lunas") tahap.setor.push(baris(r, r.p.tglBayar));
    if (s === "premi_disetor") {
      const b = baris(r, r.p.tglSetorAsuransi);
      b.lewatTermin = b.umur > b.terminHari;
      tahap.cair.push(b);
    }
    if (s !== "selesai" && !r.p.tglTransferNasabah) tahap.nasabah.push(baris(r, r.p.tglBayar));
    if (s === "cashback_cair" && !r.p.tglTransferSales) tahap.komisi.push(baris(r, r.p.tglCairAsuransi));
  }
  for (const k of Object.keys(tahap) as Tahap[]) tahap[k].sort((a, b) => b.umur - a.umur);
  const selesai = rows
    .filter((r) => r.p.statusPengajuan === "selesai")
    .map((r) => baris(r, r.p.tglTransferSales))
    .sort((a, b) => (b.sejak ?? "").localeCompare(a.sejak ?? ""))
    .slice(0, 50);
  return { tahap, selesai };
}

/** Rekap komisi siap bayar per sales (dana asuransi cair, komisi belum ditransfer) + rekening utama sales. */
export async function rekapKomisiSiapBayar() {
  const rows = await db
    .select({
      salesId: polis.salesId,
      sales: users.nama,
      polis: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(${polis.komisiSalesRp}), 0)`.mapWith(Number),
      bank: rekening.namaBank,
      kodeBank: rekening.kodeBank,
      noRekening: rekening.noRekening,
      atasNama: rekening.atasNama,
    })
    .from(polis)
    .innerJoin(users, eq(users.id, polis.salesId))
    .leftJoin(rekening, and(eq(rekening.pemilikTipe, "sales"), eq(rekening.pemilikId, polis.salesId), eq(rekening.utama, true), eq(rekening.aktif, true)))
    .where(and(eq(polis.statusPengajuan, "cashback_cair"), isNull(polis.tglTransferSales)))
    .groupBy(polis.salesId, users.nama, rekening.namaBank, rekening.kodeBank, rekening.noRekening, rekening.atasNama)
    .orderBy(users.nama);
  return rows;
}
