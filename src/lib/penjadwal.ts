// Penjadwal otomasi di dalam proses Next.js (satu container app).
// Berdetak tiap awal menit; jadwal dibaca dari tabel otomasi_setting (cron, zona WIB).
// Matikan dengan PENJADWAL=0 bila otomasi dipicu dari cron luar lewat POST /api/cron/<kode>.

const KUNCI = Symbol.for("rekap-asuransi.penjadwal");

export function mulaiPenjadwal() {
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[KUNCI]) return;
  g[KUNCI] = true;

  const detak = async () => {
    try {
      const { detakPenjadwal } = await import("./otomasi");
      await detakPenjadwal();
    } catch (e) {
      console.error("[penjadwal]", e);
    }
  };
  const jadwalkan = () => setTimeout(async () => {
    await detak();
    jadwalkan();
  }, 60_000 - (Date.now() % 60_000) + 500);
  jadwalkan();
  console.info("[penjadwal] aktif — otomasi dijalankan sesuai jadwal di tabel otomasi_setting (WIB)");
}
