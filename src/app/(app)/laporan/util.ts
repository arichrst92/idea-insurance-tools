import { periode } from "@/lib/domain/periode";
import { waktuWib } from "@/lib/domain/perpanjangan";
import type { FilterLaporan } from "@/lib/laporan";

export { rasio } from "@/lib/domain/periode";

export type SP = { periode?: string; dari?: string; sampai?: string; sales?: string; asuransi?: string; paket?: string };

/** Ubah query string laporan menjadi periode + filter (sales diabaikan untuk akun sales di lapisan data). */
export function filterDari(sp: SP) {
  const p = periode(sp.periode, waktuWib().tanggal, sp.dari, sp.sampai);
  const f: FilterLaporan = {
    dari: p.dari,
    sampai: p.sampai,
    salesId: sp.sales || undefined,
    perusahaanId: sp.asuransi || undefined,
    kategoriId: sp.paket || undefined,
  };
  return { p, f };
}
