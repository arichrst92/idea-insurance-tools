// Gaji sales fulltime: gaji pokok × min(100%, pencapaian target utama × 2).
// Pencapaian ≥ 50% → gaji penuh; di bawahnya prorata.

export type HasilGaji = {
  pencapaianPersen: number;
  persenGaji: number;
  gajiDibayar: number;
  tercapai: boolean;
};

export function pencapaianPersen(realisasi: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((realisasi / target) * 10000) / 100; // 2 desimal
}

export function hitungGaji(gajiPokok: number, pencapaian: number): HasilGaji {
  const p = Math.max(0, pencapaian);
  const persenGaji = Math.min(100, p * 2);
  return {
    pencapaianPersen: p,
    persenGaji,
    gajiDibayar: Math.round((gajiPokok * persenGaji) / 100),
    tercapai: p >= 100,
  };
}
