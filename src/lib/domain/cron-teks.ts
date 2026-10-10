const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Jadwal cron (5 kolom) → kalimat Indonesia untuk pola umum; selebihnya ditampilkan apa adanya. */
export function cronKeTeks(expr: string): string {
  if (expr.startsWith("event:")) return "Saat kejadian, bukan terjadwal";
  const k = expr.trim().split(/\s+/);
  if (k.length !== 5) return expr;
  const [m, h, d, mo, w] = k;
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h)) return m === "*" && h === "*" ? "Setiap menit" : expr;
  const jam = `${h.padStart(2, "0")}.${m.padStart(2, "0")} WIB`;
  if (d === "*" && mo === "*" && w === "*") return `Setiap hari ${jam}`;
  if (d === "*" && mo === "*" && /^\d$/.test(w)) return `Setiap ${HARI[Number(w)]} ${jam}`;
  if (d === "*" && mo === "*" && w === "1-5") return `Senin–Jumat ${jam}`;
  if (/^\d+$/.test(d) && mo === "*" && w === "*") return `Tanggal ${d} setiap bulan, ${jam}`;
  return expr;
}

/** Validasi sederhana 5 kolom cron (angka, *, -, /, koma). */
export const cronSah = (expr: string) => /^(\S+\s+){4}\S+$/.test(expr.trim()) && expr.trim().split(/\s+/).every((x) => /^[\d*,/-]+$/.test(x));
