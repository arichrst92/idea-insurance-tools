import "server-only";
import { db } from "@/db";
import { exportJobs } from "@/db/schema";
import { simpanFile } from "@/lib/storage";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Simpan hasil ekspor Excel (dibuat langsung) ke riwayat ekspor. */
export async function catatEksporExcel(p: { userId: string; jenis: string; filter: Record<string, string>; isi: ArrayBuffer | Uint8Array; nama: string }) {
  try {
    const key = await simpanFile(new File([new Uint8Array(p.isi as ArrayBuffer)], p.nama, { type: XLSX }), "ekspor");
    await db.insert(exportJobs).values({ userId: p.userId, jenisLaporan: p.jenis, filter: p.filter, format: "excel", status: "selesai", fileKey: key, selesai: new Date() });
  } catch (e) {
    console.error("[ekspor excel] gagal mencatat riwayat", e);
  }
}
