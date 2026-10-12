// Data awal form tim. Modul biasa (bukan "use client") supaya bisa dipakai halaman server:
// konstanta yang diekspor dari modul client hanya menjadi referensi di server.

export type DataFormSales = {
  nama: string;
  noWa: string;
  email: string;
  role: "admin" | "sales" | "owner";
  /** Owner yang juga berjualan */
  jugaSales: boolean;
  tipeSales: "fulltime" | "freelance" | "";
  bagiHasilKantorPersen: number;
  maksCashbackNasabahPersen: number;
  gajiPokok: string;
  targetCase: string;
  targetRevenue: string;
  targetUtama: "case" | "revenue";
  namaBank: string;
  kodeBank: string;
  noRekening: string;
  atasNama: string;
};

export const FORM_KOSONG: DataFormSales = {
  nama: "",
  noWa: "",
  email: "",
  role: "sales",
  jugaSales: false,
  tipeSales: "fulltime",
  bagiHasilKantorPersen: 30,
  maksCashbackNasabahPersen: 20,
  gajiPokok: "",
  targetCase: "",
  targetRevenue: "",
  targetUtama: "revenue",
  namaBank: "BCA",
  kodeBank: "014",
  noRekening: "",
  atasNama: "",
};
