import "server-only";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";
import type { Browser } from "playwright-core";
import { db } from "@/db";
import { exportJobs, notifikasi } from "@/db/schema";
import { simpanFile } from "@/lib/storage";
import { tokenCetak } from "./token";

/**
 * Ekspor PDF di background: export_jobs (DB) + antrian BullMQ (Redis) + worker Playwright yang
 * merender halaman cetak /cetak/<jenis> menjadi PDF A4. Bila Redis tidak tersedia, job diproses
 * langsung di proses yang sama agar ekspor tetap jalan.
 */
export const JENIS_EKSPOR = {
  laporan: "Laporan penjualan",
  keuangan: "Laporan keuangan",
  pengajuan: "Daftar pengajuan",
} as const;
export type JenisEkspor = keyof typeof JENIS_EKSPOR;

const NAMA_ANTRIAN = "ekspor";
const g = globalThis as unknown as { __eksporQueue?: Queue | null; __eksporBrowser?: Promise<Browser> | null; __eksporWorker?: Worker | null };

function koneksi() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  // BullMQ mensyaratkan maxRetriesPerRequest = null.
  return new IORedis(url, { maxRetriesPerRequest: null, connectTimeout: 2000 });
}

async function redisSiap(): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) return false;
  const c = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000, retryStrategy: () => null });
  c.on("error", () => {});
  try {
    await c.connect();
    return (await c.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    c.disconnect();
  }
}

/** Catat job ekspor lalu masukkan ke antrian (atau proses langsung bila Redis mati). */
export async function antrekanEkspor(p: { userId: string; jenis: JenisEkspor; filter: Record<string, string> }) {
  const [job] = await db
    .insert(exportJobs)
    .values({ userId: p.userId, jenisLaporan: p.jenis, filter: p.filter, format: "pdf" })
    .returning({ id: exportJobs.id });
  try {
    if (g.__eksporQueue === undefined) g.__eksporQueue = (await redisSiap()) ? new Queue(NAMA_ANTRIAN, { connection: koneksi()! }) : null;
    if (!g.__eksporQueue) throw new Error("Redis tidak tersedia");
    await g.__eksporQueue.add("pdf", { jobId: job.id }, { removeOnComplete: 100, removeOnFail: 100, attempts: 2 });
  } catch (e) {
    g.__eksporQueue = undefined;
    console.warn("[ekspor] antrian tidak tersedia, proses langsung:", e instanceof Error ? e.message : e);
    void prosesEkspor(job.id);
  }
  return job.id;
}

async function browser(): Promise<Browser> {
  g.__eksporBrowser ??= (async () => {
    const { chromium } = await import("playwright-core");
    return chromium.launch({
      executablePath: process.env.PDF_CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  })().catch((e) => {
    g.__eksporBrowser = null;
    throw e;
  });
  return g.__eksporBrowser;
}

const urlInternal = () => process.env.INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

/** Render halaman cetak menjadi PDF (Buffer). */
export async function renderPdf(jobId: string, jenis: string): Promise<Buffer> {
  const b = await browser();
  const ctx = await b.newContext();
  try {
    const page = await ctx.newPage();
    const res = await page.goto(`${urlInternal()}/cetak/${jenis}?job=${jobId}&t=${encodeURIComponent(tokenCetak(jobId))}`, { waitUntil: "networkidle", timeout: 60_000 });
    if (!res || res.status() >= 400) throw new Error(`Halaman cetak gagal (${res?.status()})`);
    const waktu = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date());
    return await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:8px;color:#6b7280;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>Rekap Asuransi · dicetak ${waktu} WIB</span><span>Halaman <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: "12mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
  } finally {
    await ctx.close();
  }
}

/** Proses satu job: render, simpan ke storage, kabari pembuatnya. */
export async function prosesEkspor(jobId: string) {
  const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId));
  if (!job || job.status === "selesai") return;
  await db.update(exportJobs).set({ status: "proses" }).where(eq(exportJobs.id, jobId));
  const nama = JENIS_EKSPOR[job.jenisLaporan as JenisEkspor] ?? job.jenisLaporan;
  try {
    const pdf = await renderPdf(jobId, job.jenisLaporan);
    const key = await simpanFile(new File([new Uint8Array(pdf)], `${job.jenisLaporan}.pdf`, { type: "application/pdf" }), "ekspor");
    await db.update(exportJobs).set({ status: "selesai", fileKey: key, selesai: new Date() }).where(eq(exportJobs.id, jobId));
    await db.insert(notifikasi).values({ userId: job.userId, jenis: "ekspor", judul: `PDF siap: ${nama}`, isi: "Unduh dalam 7 hari dari Riwayat ekspor.", link: "/ekspor" });
  } catch (e) {
    console.error("[ekspor]", e);
    await db.update(exportJobs).set({ status: "gagal", selesai: new Date() }).where(eq(exportJobs.id, jobId));
    await db.insert(notifikasi).values({ userId: job.userId, jenis: "ekspor", judul: `Ekspor gagal: ${nama}`, isi: e instanceof Error ? e.message : String(e), link: "/ekspor" });
    throw e;
  }
}

/** Worker BullMQ (dipanggil dari instrumentation). Tidak berjalan bila Redis tidak tersedia. */
export async function mulaiWorkerEkspor() {
  if (g.__eksporWorker !== undefined) return;
  g.__eksporWorker = null;
  if (!(await redisSiap())) {
    console.info("[ekspor] Redis tidak tersedia — ekspor PDF diproses langsung tanpa antrian");
    return;
  }
  g.__eksporWorker = new Worker(NAMA_ANTRIAN, async (j) => prosesEkspor(j.data.jobId), { connection: koneksi()!, concurrency: 1 });
  g.__eksporWorker.on("error", (e) => console.error("[ekspor worker]", e.message));
  console.info("[ekspor] worker PDF aktif");
}
