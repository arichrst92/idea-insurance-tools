// Aturan perpanjangan polis & penjadwalan (fungsi murni, diuji di domain.test.ts).

const HARI_MS = 86_400_000;

/** Selisih hari kalender dari `hariIni` ke `tglAkhir` (YYYY-MM-DD). Negatif = sudah lewat. */
export function sisaHari(tglAkhir: string, hariIni: string): number {
  return Math.round((Date.parse(tglAkhir + "T00:00:00Z") - Date.parse(hariIni + "T00:00:00Z")) / HARI_MS);
}

export function tambahHari(tgl: string, n: number): string {
  return new Date(Date.parse(tgl + "T00:00:00Z") + n * HARI_MS).toISOString().slice(0, 10);
}

/** Batas "akan habis" (hari sebelum tanggal akhir). */
export const BATAS_AKAN_HABIS = 30;

/** Tahap remind otomatis bawaan, bisa diubah di pengaturan otomasi. */
export const TAHAP_REMIND = [30, 14, 7];

/**
 * Tahap remind yang jatuh tempo untuk polis dengan `sisa` hari, atau null.
 * Dipakai tahap terkecil yang ≥ sisa, sehingga bila penjadwal sempat mati
 * (mis. H-14 terlewat lalu dijalankan di H-12) nasabah tetap diingatkan sekali,
 * tanpa menyusulkan tahap-tahap sebelumnya.
 */
export function tahapRemind(sisa: number, tahap: number[], sudahTerkirim: number[]): number | null {
  if (sisa < 0) return null;
  const cocok = [...tahap].sort((a, b) => a - b).find((t) => t >= sisa);
  if (cocok === undefined || sudahTerkirim.includes(cocok)) return null;
  return cocok;
}

// ─── Cron sederhana (5 kolom: menit jam tanggal bulan hari-minggu), zona Asia/Jakarta ───

function cocokKolom(kolom: string, nilai: number, min: number, max: number): boolean {
  return kolom.split(",").some((bagian) => {
    const [rentang, langkahStr] = bagian.split("/");
    const langkah = langkahStr ? Number(langkahStr) : 1;
    let [dari, ke] = [min, max];
    if (rentang !== "*") {
      const [a, b] = rentang.split("-").map(Number);
      dari = a;
      ke = b ?? (langkahStr ? max : a);
    }
    return nilai >= dari && nilai <= ke && (nilai - dari) % langkah === 0;
  });
}

export type WaktuLokal = { tanggal: string; jam: number; menit: number; hariMinggu: number; tgl: number; bulan: number };

/** Waktu dinding di Asia/Jakarta (WIB, UTC+7, tanpa DST). */
export function waktuWib(d = new Date()): WaktuLokal {
  const w = new Date(d.getTime() + 7 * 3_600_000);
  return {
    tanggal: w.toISOString().slice(0, 10),
    jam: w.getUTCHours(),
    menit: w.getUTCMinutes(),
    hariMinggu: w.getUTCDay(),
    tgl: w.getUTCDate(),
    bulan: w.getUTCMonth() + 1,
  };
}

export function cocokCron(expr: string, w: WaktuLokal): boolean {
  const k = expr.trim().split(/\s+/);
  if (k.length !== 5) return false;
  return (
    cocokKolom(k[0], w.menit, 0, 59) &&
    cocokKolom(k[1], w.jam, 0, 23) &&
    cocokKolom(k[2], w.tgl, 1, 31) &&
    cocokKolom(k[3], w.bulan, 1, 12) &&
    cocokKolom(k[4], w.hariMinggu, 0, 6)
  );
}

/** Teks balasan WhatsApp nasabah → maksud. */
export function maksudBalasan(pesan: string): "setuju" | "berhenti" | null {
  const t = pesan.trim().toLowerCase().replace(/[.!*]+$/g, "").replace(/^\*+/, "");
  if (["ya", "iya", "y", "yes", "ok ya", "ya perpanjang", "ya, perpanjang"].includes(t)) return "setuju";
  if (["berhenti", "stop", "unsubscribe"].includes(t)) return "berhenti";
  return null;
}
