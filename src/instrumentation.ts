export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.PENJADWAL !== "0") {
    const { mulaiPenjadwal } = await import("./lib/penjadwal");
    mulaiPenjadwal();
  }
}
