import type { StatusPengajuan } from "@/db/schema";

export const LANGKAH: { status: StatusPengajuan; label: string; oleh: string }[] = [
  { status: "draft_prospek", label: "Draft prospek", oleh: "Sales" },
  { status: "data_lengkap", label: "Data lengkap", oleh: "Sistem" },
  { status: "dikirim_ke_asuransi", label: "Dikirim ke asuransi", oleh: "Admin" },
  { status: "survei_kendaraan", label: "Survei kendaraan", oleh: "Asuransi" },
  { status: "penawaran_masuk", label: "Penawaran masuk", oleh: "Admin" },
  { status: "disetujui_nasabah", label: "Disetujui nasabah", oleh: "Sales" },
  { status: "polis_terbit", label: "Polis terbit", oleh: "Admin" },
  { status: "menunggu_bayar", label: "Menunggu bayar", oleh: "Sales" },
  { status: "lunas", label: "Lunas", oleh: "Sales/Admin" },
  { status: "premi_disetor", label: "Premi disetor", oleh: "Admin" },
  { status: "cashback_cair", label: "Cashback cair", oleh: "Admin" },
  { status: "selesai", label: "Selesai", oleh: "Admin" },
];

export const LABEL_CABANG: Partial<Record<StatusPengajuan, string>> = {
  perlu_revisi: "Perlu revisi",
  ditolak_asuransi: "Ditolak asuransi",
  batal_nasabah: "Batal nasabah",
};

/** Nomor langkah 1–12, atau null untuk status cabang. */
export function nomorLangkah(status: StatusPengajuan): number | null {
  const i = LANGKAH.findIndex((l) => l.status === status);
  return i === -1 ? null : i + 1;
}

export function labelStatus(status: StatusPengajuan): string {
  return LANGKAH.find((l) => l.status === status)?.label ?? LABEL_CABANG[status] ?? status;
}

/** Status berikutnya yang sah dari status sekarang (maju 1 langkah, survei opsional, cabang). */
export function transisiSah(dari: StatusPengajuan, ke: StatusPengajuan): boolean {
  if (dari === "selesai" || dari === "ditolak_asuransi" || dari === "batal_nasabah") return false;
  if (ke === "batal_nasabah" || ke === "ditolak_asuransi") return true;
  if (ke === "perlu_revisi") return dari !== "draft_prospek" && dari !== "perlu_revisi";
  if (dari === "perlu_revisi") return ke === "draft_prospek";
  const a = nomorLangkah(dari)!;
  const b = nomorLangkah(ke);
  if (b === null) return false;
  if (b === a + 1) return true;
  // Survei kendaraan opsional: boleh langsung dari "Dikirim" ke "Penawaran masuk".
  return dari === "dikirim_ke_asuransi" && ke === "penawaran_masuk";
}

// ─── Journey versi nasabah (7 langkah) untuk link tracker ───

export const LANGKAH_NASABAH = [
  "Data diterima",
  "Diajukan ke asuransi",
  "Penawaran disetujui",
  "Polis terbit",
  "Pembayaran",
  "Cashback dikirim",
  "Selesai",
] as const;

/**
 * Langkah nasabah yang sedang berjalan (1–7). Langkah internal kantor
 * (premi disetor, cashback cair) tidak terlihat oleh nasabah.
 */
export function langkahNasabah(p: {
  status: StatusPengajuan;
  tglTransferNasabah: string | null;
}): number {
  // Bagi nasabah perjalanan selesai begitu cashback-nya ditransfer.
  if (p.tglTransferNasabah || p.status === "selesai") return 7;
  const n = nomorLangkah(p.status);
  if (n === null) return 1; // cabang: tampilkan dari awal dengan keterangan
  if (n <= 2) return 1;
  if (n <= 4) return 2;
  if (n <= 6) return 3;
  if (n === 7) return 4;
  if (n === 8) return 5;
  return 6; // lunas, menunggu cashback dikirim
}

/** Plat disamarkan untuk halaman publik: "D 1234 ABC" → "D 12** ABC". */
export function samarkanPlat(plat: string): string {
  const m = plat.trim().toUpperCase().match(/^([A-Z]{1,2})\s*(\d{1,4})\s*([A-Z]{0,3})$/);
  if (!m) return plat.slice(0, 2) + "***";
  const [, depan, angka, belakang] = m;
  const tampil = angka.slice(0, 2) + "*".repeat(Math.max(0, angka.length - 2));
  return [depan, tampil, belakang].filter(Boolean).join(" ");
}
