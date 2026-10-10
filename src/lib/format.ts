const rp = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export const rupiah = (n: number | null | undefined) => (n == null ? "–" : `Rp ${rp.format(n)}`);
export const angka = (n: number | null | undefined) => (n == null ? "–" : rp.format(n));
export const persen = (n: number | null | undefined) =>
  n == null ? "–" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)}%`;

/** "1.500.000" / "1500000" / "Rp 1.500.000" → 1500000 */
export function parseRupiah(s: string): number {
  const d = s.replace(/[^\d]/g, "");
  return d ? Number(d) : NaN;
}

/** Format ketikan nominal dengan titik ribuan: "1500000" / "1.500.000" → "1.500.000". */
export function formatRibuan(s: string): string {
  const d = s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Posisi kursor baru setelah diformat: tetap di belakang digit ke-n yang sama. */
export function posisiKursor(terformat: string, digitSebelumKursor: number): number {
  if (digitSebelumKursor <= 0) return 0;
  let n = 0;
  for (let i = 0; i < terformat.length; i++) {
    if (/\d/.test(terformat[i]) && ++n === digitSebelumKursor) return i + 1;
  }
  return terformat.length;
}

/** "12,5" / "12.5" → 12.5 */
export function parsePersen(s: string): number {
  return Number(s.replace(",", ".").replace(/[^\d.]/g, ""));
}

export function bulanIni(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export const namaBulan = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(iso + "T00:00:00"));
