// Perhitungan cashback & komisi per polis.
//
// Nasabah membayar premi bruto penuh. Cashback dari asuransi dibagi:
//   cashback total   = premi × % cashback total
//   cashback nasabah = premi × % cashback nasabah   (≤ maks milik sales)
//   cashback sales   = cashback total − cashback nasabah
//   bagian kantor    = cashback sales × % bagi hasil kantor (atau % event)
//   komisi sales     = cashback sales − bagian kantor
// Semua nominal dibulatkan ke rupiah terdekat.

export type InputKomisi = {
  premiBruto: number;
  cashbackTotalPersen: number;
  cashbackNasabahPersen: number;
  maksCashbackNasabahPersen: number;
  bagiHasilKantorPersen: number;
};

export type HasilKomisi = {
  cashbackTotalRp: number;
  cashbackNasabahRp: number;
  cashbackSalesRp: number;
  bagianKantorRp: number;
  komisiSalesRp: number;
};

export class KomisiError extends Error {}

const bulat = (n: number) => Math.round(n);

export function hitungKomisi(i: InputKomisi): HasilKomisi {
  if (i.premiBruto < 0) throw new KomisiError("Premi bruto tidak boleh negatif");
  for (const [k, v] of Object.entries({
    cashbackTotalPersen: i.cashbackTotalPersen,
    cashbackNasabahPersen: i.cashbackNasabahPersen,
    bagiHasilKantorPersen: i.bagiHasilKantorPersen,
  })) {
    if (v < 0 || v > 100) throw new KomisiError(`${k} harus 0–100%`);
  }
  if (i.cashbackNasabahPersen > i.maksCashbackNasabahPersen) {
    throw new KomisiError(
      `Cashback ke nasabah ${i.cashbackNasabahPersen}% melebihi batas sales ${i.maksCashbackNasabahPersen}%`,
    );
  }
  if (i.cashbackNasabahPersen > i.cashbackTotalPersen) {
    throw new KomisiError("Cashback ke nasabah tidak boleh melebihi cashback total");
  }

  const cashbackTotalRp = bulat((i.premiBruto * i.cashbackTotalPersen) / 100);
  const cashbackNasabahRp = bulat((i.premiBruto * i.cashbackNasabahPersen) / 100);
  const cashbackSalesRp = cashbackTotalRp - cashbackNasabahRp;
  const bagianKantorRp = bulat((cashbackSalesRp * i.bagiHasilKantorPersen) / 100);
  const komisiSalesRp = cashbackSalesRp - bagianKantorRp;

  return { cashbackTotalRp, cashbackNasabahRp, cashbackSalesRp, bagianKantorRp, komisiSalesRp };
}

export type EventAktif = {
  id: string;
  tglMulai: string; // YYYY-MM-DD
  tglSelesai: string;
  /** Tambahan porsi sales, relatif terhadap porsi normalnya (mis. 15 → porsi sales × 1,15). */
  tambahanKomisiPersen: number;
  berlakuUntuk: "semua" | "fulltime" | "freelance" | "pilihan";
  salesIds: string[];
  aktif: boolean;
};

/**
 * Porsi kantor setelah event. Event bersifat tambahan untuk sales:
 *   porsi sales  = (100 − % kantor normal) × (1 + tambahan/100), maks 100
 *   porsi kantor = 100 − porsi sales
 * Contoh: kantor 60 / sales 40, event +15% → sales 46, kantor 54.
 */
export function porsiKantorDenganEvent(kantorNormal: number, tambahanPersen: number): number {
  const sales = Math.min(100, (100 - kantorNormal) * (1 + tambahanPersen / 100));
  return Math.round((100 - sales) * 100) / 100;
}

/**
 * % bagi hasil kantor yang berlaku untuk polis yang diinput pada `tanggal`.
 * Bila beberapa event berlaku bersamaan, dipakai tambahan terbesar (tidak dijumlahkan).
 */
export function bagiHasilBerlaku(
  sales: { id: string; tipeSales: "fulltime" | "freelance" | null; bagiHasilKantorPersen: number },
  tanggal: string,
  events: EventAktif[],
): { persen: number; eventId: string | null; tambahan: number } {
  const cocok = events.filter(
    (e) =>
      e.aktif &&
      e.tglMulai <= tanggal &&
      tanggal <= e.tglSelesai &&
      (e.berlakuUntuk === "semua" ||
        (e.berlakuUntuk === "pilihan" && e.salesIds.includes(sales.id)) ||
        (sales.tipeSales !== null && e.berlakuUntuk === sales.tipeSales)),
  );
  if (cocok.length === 0) return { persen: sales.bagiHasilKantorPersen, eventId: null, tambahan: 0 };
  const terbesar = cocok.reduce((a, b) => (b.tambahanKomisiPersen > a.tambahanKomisiPersen ? b : a));
  return {
    persen: porsiKantorDenganEvent(sales.bagiHasilKantorPersen, terbesar.tambahanKomisiPersen),
    eventId: terbesar.id,
    tambahan: terbesar.tambahanKomisiPersen,
  };
}
