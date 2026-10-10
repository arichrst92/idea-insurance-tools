// Aturan tanggal jadwal bayar & file transfer massal (fungsi murni).

const hari = (t: string) => new Date(t + "T00:00:00Z").getUTCDay(); // 0 = Minggu
const geser = (t: string, n: number) => new Date(Date.parse(t + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const akhirPekan = (t: string) => hari(t) === 0 || hari(t) === 6;

/** Tanggal + n hari kerja (Senin–Jumat; libur nasional belum diperhitungkan). */
export function tambahHariKerja(t: string, n: number): string {
  let x = t;
  let sisa = n;
  while (sisa > 0) {
    x = geser(x, 1);
    if (!akhirPekan(x)) sisa--;
  }
  return x;
}

/** Hari bayar komisi: hari tertentu (bawaan Jumat = 5) pada/setelah tanggal acuan. */
export function hariBayarBerikutnya(t: string, hariBayar = 5): string {
  return geser(t, (hariBayar - hari(t) + 7) % 7);
}

/** Tanggal gajian untuk target bulan `bulan` (YYYY-MM-01): tanggal 1 bulan berikutnya, mundur ke hari kerja. */
export function tanggalGajian(bulan: string, tglGajian = 1): string {
  const [y, m] = bulan.split("-").map(Number);
  const [yy, mm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  let x = `${yy}-${String(mm).padStart(2, "0")}-${String(tglGajian).padStart(2, "0")}`;
  while (akhirPekan(x)) x = geser(x, -1);
  return x;
}

/** Rekening tujuan di BCA? (kode bank 014 atau nama bank BCA) */
export function sesamaBca(r: { kodeBank: string | null; namaBank: string }): boolean {
  return r.kodeBank === "014" || /^\s*(bank\s+)?bca\b|central asia/i.test(r.namaBank);
}

export type BarisTransfer = { noRekening: string; atasNama: string; nominal: number; berita: string; kodeBank?: string | null };

/**
 * CSV transfer massal KlikBCA Bisnis. Kolom default (template "standar-v1"):
 *  sesama BCA : No Rekening Tujuan, Nama Penerima, Nominal, Berita
 *  antarbank  : No Rekening Tujuan, Nama Penerima, Kode Bank, Nominal, Berita
 * Template final dicocokkan dengan file contoh dari akun KlikBCA Bisnis kantor.
 */
export function csvTransfer(jenis: "sesama_bca" | "antarbank", rows: BarisTransfer[]): string {
  const sel = (v: string | number) => {
    const s = String(v).replace(/[\r\n]+/g, " ");
    return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rapi = (s: string) => s.replace(/\D/g, "");
  const berita = (s: string) => s.replace(/[^A-Za-z0-9 .\-/]/g, "").slice(0, 36);
  const head = jenis === "sesama_bca" ? ["No Rekening Tujuan", "Nama Penerima", "Nominal", "Berita"] : ["No Rekening Tujuan", "Nama Penerima", "Kode Bank", "Nominal", "Berita"];
  const body = rows.map((r) =>
    (jenis === "sesama_bca"
      ? [rapi(r.noRekening), r.atasNama.slice(0, 40), r.nominal, berita(r.berita)]
      : [rapi(r.noRekening), r.atasNama.slice(0, 40), rapi(r.kodeBank ?? ""), r.nominal, berita(r.berita)]
    )
      .map(sel)
      .join(","),
  );
  return [head.join(","), ...body].join("\r\n") + "\r\n";
}
