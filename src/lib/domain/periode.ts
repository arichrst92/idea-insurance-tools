// Periode laporan (tanggal kalender WIB, YYYY-MM-DD, inklusif).

export type KodePeriode = "bulan_ini" | "bulan_lalu" | "kuartal_ini" | "tahun_ini" | "kustom";
export type Periode = { kode: KodePeriode; dari: string; sampai: string; label: string };

export const LABEL_PERIODE: Record<KodePeriode, string> = {
  bulan_ini: "Bulan ini",
  bulan_lalu: "Bulan lalu",
  kuartal_ini: "Kuartal ini",
  tahun_ini: "Tahun ini",
  kustom: "Pilih tanggal",
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const akhirBulan = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function namaBulanId(bulanIso: string): string {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(bulanIso.slice(0, 7) + "-01T00:00:00Z"));
}

/** Rentang tanggal untuk kode periode, relatif terhadap `hariIni` (WIB). */
export function periode(kode: string | undefined, hariIni: string, dari?: string, sampai?: string): Periode {
  const [y, m] = hariIni.split("-").map(Number);
  switch (kode) {
    case "bulan_lalu": {
      const [yy, mm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { kode: "bulan_lalu", dari: iso(yy, mm, 1), sampai: iso(yy, mm, akhirBulan(yy, mm)), label: namaBulanId(iso(yy, mm, 1)) };
    }
    case "kuartal_ini": {
      const q = Math.floor((m - 1) / 3);
      const m0 = q * 3 + 1;
      return { kode: "kuartal_ini", dari: iso(y, m0, 1), sampai: iso(y, m0 + 2, akhirBulan(y, m0 + 2)), label: `Kuartal ${q + 1} ${y}` };
    }
    case "tahun_ini":
      return { kode: "tahun_ini", dari: iso(y, 1, 1), sampai: iso(y, 12, 31), label: `Tahun ${y}` };
    case "kustom":
      if (valid(dari) && valid(sampai) && dari! <= sampai!) return { kode: "kustom", dari: dari!, sampai: sampai!, label: `${dari} s/d ${sampai}` };
    // fallthrough: tanggal tidak valid → bulan ini
    default:
      return { kode: "bulan_ini", dari: iso(y, m, 1), sampai: iso(y, m, akhirBulan(y, m)), label: namaBulanId(iso(y, m, 1)) };
  }
}

/** Hari pertama bulan (YYYY-MM-01) untuk tanggal apa pun. */
export const awalBulan = (tgl: string) => tgl.slice(0, 7) + "-01";

/** Hari pertama bulan sebelumnya / berikutnya. */
export function geserBulan(bulan: string, n: number): string {
  const [y, m] = bulan.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return iso(Math.floor(t / 12), (t % 12) + 1, 1);
}

export function akhirDariBulan(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  return iso(y, m, akhirBulan(y, m));
}

/** Persentase aman (0 bila penyebut 0), 1 desimal. */
export const rasio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
