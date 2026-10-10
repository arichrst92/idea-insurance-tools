import { hitungKomisi } from "@/lib/domain/komisi";

/** Langkah cashback ke nasabah di form persetujuan (%). */
export const LANGKAH_CB = 0.5;

/** Satu titik simulasi: komisi bila cashback ke nasabah = cb%. Dihitung di server. */
export type TitikKomisi = {
  cb: number;
  nasabahRp: number;
  komisi: number;
  event: number;
  /** Hanya untuk admin */
  totalRp?: number;
  kantorRp?: number;
};

export type OpsiPenawaran = {
  id: string;
  asuransi: string;
  paket: string | null;
  cakupan: string[];
  premi: number;
  /** Batas cashback ke nasabah untuk penawaran ini */
  batas: number;
  tabel: TitikKomisi[];
  /** Hanya untuk admin */
  cashbackTotalPersen?: number;
};

/**
 * Siapkan opsi penawaran untuk dikirim ke browser. Untuk sales, cashback total dari asuransi dan
 * bagian kantor TIDAK ikut dikirim — hanya komisi per pilihan cashback nasabah.
 */
export function siapkanOpsi(
  daftar: { id: string; asuransi: string; paket: string | null; cakupan: string[]; premi: number; cashbackTotalPersen: number }[],
  p: { admin: boolean; maksCashback: number; kantorBerlaku: number; kantorNormal: number },
): OpsiPenawaran[] {
  return daftar.map((x) => {
    const batas = Math.floor(Math.min(p.maksCashback, x.cashbackTotalPersen) / LANGKAH_CB) * LANGKAH_CB;
    const tabel: TitikKomisi[] = [];
    for (let cb = 0; cb <= batas + 1e-9; cb += LANGKAH_CB) {
      const k = hitungKomisi({
        premiBruto: x.premi,
        cashbackTotalPersen: x.cashbackTotalPersen,
        cashbackNasabahPersen: cb,
        maksCashbackNasabahPersen: p.maksCashback,
        bagiHasilKantorPersen: p.kantorBerlaku,
        bagiHasilKantorNormalPersen: p.kantorNormal,
      });
      tabel.push({
        cb,
        nasabahRp: k.cashbackNasabahRp,
        komisi: k.komisiSalesRp,
        event: k.komisiEventRp,
        ...(p.admin ? { totalRp: k.cashbackTotalRp, kantorRp: k.bagianKantorRp } : {}),
      });
    }
    return {
      id: x.id,
      asuransi: x.asuransi,
      paket: x.paket,
      cakupan: x.cakupan,
      premi: x.premi,
      batas,
      tabel,
      ...(p.admin ? { cashbackTotalPersen: x.cashbackTotalPersen } : {}),
    };
  });
}
