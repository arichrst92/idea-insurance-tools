/** "d1234abc" / "D 1234  ABC" → "D 1234 ABC". Null bila format plat Indonesia tidak dikenali. */
export function normalisasiPlat(input: string): string | null {
  const m = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
  if (!m) return null;
  return [m[1], m[2], m[3]].filter(Boolean).join(" ");
}

export const LABEL_STATUS_KENDARAAN = {
  aktif: "Aktif",
  dijual: "Dijual",
  tidak_dipakai: "Tidak dipakai",
} as const;
