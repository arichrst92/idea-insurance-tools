// Variabel yang tersedia per template WhatsApp + contoh nilai untuk pratinjau.

const NASABAH = ["sapaan", "nama", "kendaraan", "no_polisi", "asuransi", "periode", "premi", "bank", "no_rekening", "atas_nama", "batas_bayar", "cashback", "link_tracker", "nama_sales", "kode", "tgl_akhir", "sisa_hari"];

export const VARIABEL_TEMPLATE: Record<string, string[]> = {
  instruksi_bayar: NASABAH,
  pengingat_bayar: NASABAH,
  pembayaran_diterima: NASABAH,
  cashback_ditransfer: [...NASABAH, "rekening_nasabah"],
  remind_perpanjangan: NASABAH,
  konfirmasi_perpanjangan: NASABAH,
  konfirmasi_berhenti: NASABAH,
  tracker: NASABAH,
  giliran_sales: ["kode", "nama", "no_polisi", "status", "link"],
  komisi_ditransfer: ["periode", "nominal", "jumlah_polis", "rekening"],
};

export const CONTOH: Record<string, string> = {
  sapaan: "Bapak/Ibu",
  nama: "Budi Hartono",
  kendaraan: "Toyota Avanza",
  no_polisi: "D 1234 ABC",
  asuransi: "Sinar Mas",
  periode: "14 Okt 2026 – 14 Okt 2027",
  premi: "Rp 6.000.000",
  bank: "BCA",
  no_rekening: "1234567890",
  atas_nama: "PT Solusi Inovasi Bangsa",
  batas_bayar: "17 Okt 2026",
  cashback: "Rp 900.000",
  link_tracker: "https://insurance.ide.asia/t/7KQ2M8XA",
  nama_sales: "Rina",
  kode: "PJ-0398",
  tgl_akhir: "14 Okt 2027",
  sisa_hari: "30",
  rekening_nasabah: "Mandiri 1300011112222",
  status: "Penawaran masuk",
  link: "https://insurance.ide.asia/pengajuan/…",
  nominal: "Rp 2.156.000",
  jumlah_polis: "3",
  rekening: "BCA 5550001111",
};

/** Variabel {x} yang dipakai di isi template. */
export const variabelDipakai = (isi: string) => [...new Set([...isi.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];
