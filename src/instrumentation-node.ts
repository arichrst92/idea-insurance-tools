// Dijalankan sekali saat server Node.js start: penjadwal otomasi + worker ekspor PDF.
export async function mulai() {
  if (process.env.PENJADWAL !== "0") {
    const { mulaiPenjadwal } = await import("./lib/penjadwal");
    mulaiPenjadwal();
  }
  if (process.env.EKSPOR_WORKER !== "0") {
    const { mulaiWorkerEkspor } = await import("./lib/ekspor/antrian");
    mulaiWorkerEkspor().catch((e) => console.error("[ekspor worker]", e));
  }
}
