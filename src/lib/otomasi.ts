import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { otomasiLog, otomasiSetting } from "@/db/schema";
import { cocokCron, waktuWib } from "@/lib/domain/perpanjangan";
import { jobDraftPerpanjangan, jobRemindPerpanjangan } from "@/lib/perpanjangan";
import { jobAlertMandek, jobRekapKomisi, jobTagihCashback, jobTutupBukuTarget } from "@/lib/otomasi-jobs";

type Hasil = { jumlah: number; ringkasan: string };
type Job = (param: Record<string, unknown>) => Promise<Hasil>;

/** Otomasi yang sudah dibangun. Laporan berkala & kirim otomatis ke asuransi menyusul di Sprint 6. */
export const JOB: Record<string, Job> = {
  draft_perpanjangan: (p) => jobDraftPerpanjangan(p as { hariSebelum?: number }),
  remind_perpanjangan: (p) => jobRemindPerpanjangan(p as { hari?: number[] }),
  alert_mandek: (p) => jobAlertMandek(p as { hari?: number; hariCepat?: number; eskalasiAdmin?: number }),
  tagih_cashback: (p) => jobTagihCashback(p as { jedaHari?: number }),
  rekap_komisi: () => jobRekapKomisi(),
  tutup_buku_target: () => jobTutupBukuTarget(),
};

/** Jalankan satu otomasi dan catat hasilnya di otomasi_log. */
export async function jalankanOtomasi(kode: string, opsi: { paksa?: boolean } = {}) {
  const job = JOB[kode];
  if (!job) return { ok: false as const, pesan: `Otomasi "${kode}" belum tersedia` };
  const [s] = await db.select().from(otomasiSetting).where(eq(otomasiSetting.kode, kode));
  if (!s) return { ok: false as const, pesan: `Pengaturan otomasi "${kode}" belum ada (jalankan db:seed)` };
  if (!s.aktif && !opsi.paksa) return { ok: false as const, pesan: `Otomasi "${s.nama}" nonaktif` };

  const [log] = await db.insert(otomasiLog).values({ kode }).returning({ id: otomasiLog.id });
  try {
    const h = await job((s.parameter as Record<string, unknown>) ?? {});
    await db
      .update(otomasiLog)
      .set({ selesai: new Date(), status: "sukses", jumlahDiproses: h.jumlah, ringkasan: h.ringkasan })
      .where(eq(otomasiLog.id, log.id));
    return { ok: true as const, ...h };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    await db.update(otomasiLog).set({ selesai: new Date(), status: "gagal", error: pesan }).where(eq(otomasiLog.id, log.id));
    console.error(`[otomasi:${kode}]`, e);
    return { ok: false as const, pesan };
  }
}

/** Satu detak penjadwal: jalankan otomasi aktif yang jadwal cron-nya cocok dengan menit ini (WIB). */
export async function detakPenjadwal(sekarang = new Date()) {
  const w = waktuWib(sekarang);
  const daftar = await db.select().from(otomasiSetting).where(eq(otomasiSetting.aktif, true));
  for (const s of daftar) {
    if (!JOB[s.kode] || s.jadwalCron.startsWith("event:") || !cocokCron(s.jadwalCron, w)) continue;
    // Cegah jalan dua kali pada menit yang sama (mis. server restart di menit itu).
    const awalMenit = new Date(Math.floor(sekarang.getTime() / 60_000) * 60_000);
    const [sudah] = await db
      .select({ id: otomasiLog.id })
      .from(otomasiLog)
      .where(and(eq(otomasiLog.kode, s.kode), gte(otomasiLog.mulai, awalMenit)))
      .limit(1);
    if (sudah) continue;
    await jalankanOtomasi(s.kode);
  }
}
