import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { batchTransfer, jadwalBayar, kasKantor, nasabah, otomasiSetting, perusahaanAsuransi, polis, rekening, targetSales, users } from "@/db/schema";
import { csvTransfer, hariBayarBerikutnya, sesamaBca, tambahHariKerja, tanggalGajian, type BarisTransfer } from "@/lib/domain/jadwal";
import { awalBulan, namaBulanId } from "@/lib/domain/periode";
import { tambahHari, waktuWib } from "@/lib/domain/perpanjangan";
import { hitungGaji } from "@/lib/domain/gaji";
import { capaian, realisasiBulanan } from "@/lib/performa";
import { transferPolis } from "@/lib/keuangan";
import { kirimPesan, isiTemplate } from "@/lib/pesan";
import { rupiah } from "@/lib/format";

export type Pengaturan = { hariKerjaCashback: number; hariBayarKomisi: number; tglGajian: number };
const BAWAAN: Pengaturan = { hariKerjaCashback: 3, hariBayarKomisi: 5, tglGajian: 1 };

export async function pengaturanJadwal(): Promise<Pengaturan> {
  const [s] = await db.select().from(otomasiSetting).where(eq(otomasiSetting.kode, "jadwal_bayar"));
  return { ...BAWAAN, ...((s?.parameter as Partial<Pengaturan>) ?? {}) };
}

type Rencana = {
  jenis: "cashback_nasabah" | "komisi" | "gaji";
  polisId?: string;
  targetSalesId?: string;
  penerima: string;
  rekeningId: string | null;
  nominal: number;
  tglJadwal: string;
  status: "terjadwal" | "menunggu" | "siap" | "dibayar";
  estimasi?: boolean;
  dibayar?: string | null;
};

/**
 * Bentuk ulang jadwal bayar dari data terbaru (aman dijalankan kapan saja):
 * - cashback nasabah: tanggal lunas + N hari kerja; siap begitu lunas
 * - komisi sales: hari bayar (Jumat) setelah dana asuransi cair; sebelum cair = menunggu (estimasi tanggal dari termin)
 * - gaji fulltime: tanggal gajian setelah tutup buku; sebelum tutup buku = estimasi bulan berjalan
 * Baris yang sudah diekspor/dibayar tidak diubah.
 */
export async function sinkronJadwal() {
  const cfg = await pengaturanJadwal();
  const hariIni = waktuWib().tanggal;
  const rencana: Rencana[] = [];

  const rekUtama = (tipe: "nasabah" | "sales", id: string) =>
    sql<string | null>`(select r.id from rekening r where r.pemilik_tipe = ${tipe} and r.pemilik_id = ${id} and r.utama and r.aktif limit 1)`;
  const rows = await db
    .select({ p: polis, nasabah: nasabah.nama, sales: users.nama, termin: perusahaanAsuransi.terminCashbackHari, rekN: rekUtama("nasabah", sql`${polis.nasabahId}` as never), rekS: rekUtama("sales", sql`${polis.salesId}` as never) })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(users, eq(users.id, polis.salesId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .where(inArray(polis.statusPengajuan, ["lunas", "premi_disetor", "cashback_cair", "selesai"]));
  for (const { p, nasabah: nm, sales, termin, rekN, rekS } of rows) {
    if ((p.cashbackNasabahRp ?? 0) > 0 && p.tglBayar)
      rencana.push({
        jenis: "cashback_nasabah",
        polisId: p.id,
        penerima: nm,
        rekeningId: rekN,
        nominal: p.cashbackNasabahRp!,
        tglJadwal: tambahHariKerja(p.tglBayar, cfg.hariKerjaCashback),
        status: p.tglTransferNasabah ? "dibayar" : "siap",
        dibayar: p.tglTransferNasabah,
      });
    if ((p.komisiSalesRp ?? 0) > 0) {
      const cair = p.tglCairAsuransi;
      const perkiraanCair = tambahHari(p.tglSetorAsuransi ?? p.tglBayar ?? hariIni, termin ?? 30);
      rencana.push({
        jenis: "komisi",
        polisId: p.id,
        penerima: sales,
        rekeningId: rekS,
        nominal: p.komisiSalesRp!,
        tglJadwal: hariBayarBerikutnya(cair ?? (perkiraanCair < hariIni ? hariIni : perkiraanCair), cfg.hariBayarKomisi),
        status: p.tglTransferSales ? "dibayar" : cair ? "siap" : "menunggu",
        dibayar: p.tglTransferSales,
      });
    }
  }

  // Gaji fulltime
  const bulanIni = awalBulan(hariIni);
  const targets = await db
    .select({ t: targetSales, s: users, rek: rekUtama("sales", sql`${targetSales.salesId}` as never) })
    .from(targetSales)
    .innerJoin(users, eq(users.id, targetSales.salesId))
    .where(and(eq(users.tipeSales, "fulltime"), sql`${targetSales.bulan} >= ${bulanIni}::date - interval '3 months'`));
  const gajiDibayar = new Set(
    (await db.select({ id: kasKantor.targetSalesId }).from(kasKantor).where(and(eq(kasKantor.kategori, "gaji_sales")))).map((x) => x.id),
  );
  for (const { t, s, rek } of targets) {
    if (t.ditutup) {
      if (!t.gajiDibayar) continue;
      rencana.push({
        jenis: "gaji",
        targetSalesId: t.id,
        penerima: s.nama,
        rekeningId: rek,
        nominal: t.gajiDibayar,
        tglJadwal: tanggalGajian(t.bulan, cfg.tglGajian),
        status: gajiDibayar.has(t.id) ? "dibayar" : "siap",
      });
    } else if (t.bulan === bulanIni) {
      const gp = t.gajiPokokBulan ?? s.gajiPokok ?? 0;
      if (gp <= 0) continue;
      const r = (await realisasiBulanan(s.id, bulanIni, bulanIni)).get(bulanIni) ?? { polis: 0, premi: 0 };
      const c = capaian({ targetCase: t.targetCase, targetRevenue: t.targetRevenue, utama: t.targetUtama }, r)!;
      rencana.push({
        jenis: "gaji",
        targetSalesId: t.id,
        penerima: s.nama,
        rekeningId: rek,
        nominal: hitungGaji(gp, c.pUtama).gajiDibayar,
        tglJadwal: tanggalGajian(t.bulan, cfg.tglGajian),
        status: "menunggu",
        estimasi: true,
      });
    }
  }

  const ada = await db.select().from(jadwalBayar);
  const kunci = (j: { jenis: string; polisId?: string | null; targetSalesId?: string | null }) => `${j.jenis}:${j.polisId ?? ""}:${j.targetSalesId ?? ""}`;
  const peta = new Map(ada.map((j) => [kunci(j), j]));
  const dipakai = new Set<string>();
  for (const r of rencana) {
    const k = kunci(r);
    dipakai.add(k);
    const lama = peta.get(k);
    if (!lama) {
      await db.insert(jadwalBayar).values({ ...r, estimasi: r.estimasi ?? false, dibayar: r.dibayar ?? null }).onConflictDoNothing();
    } else if (lama.status === "dibayar") {
      continue;
    } else if (r.status === "dibayar") {
      await db.update(jadwalBayar).set({ status: "dibayar", dibayar: r.dibayar ?? hariIni }).where(eq(jadwalBayar.id, lama.id));
    } else if (lama.status !== "diekspor") {
      await db
        .update(jadwalBayar)
        .set({ penerima: r.penerima, rekeningId: r.rekeningId, nominal: r.nominal, tglJadwal: r.tglJadwal, status: r.status, estimasi: r.estimasi ?? false })
        .where(eq(jadwalBayar.id, lama.id));
    }
  }
  // Baris yang tidak lagi berlaku (mis. pengajuan dibatalkan) dan belum diproses → hapus.
  const basi = ada.filter((j) => !dipakai.has(kunci(j)) && !["diekspor", "dibayar"].includes(j.status)).map((j) => j.id);
  if (basi.length) await db.delete(jadwalBayar).where(inArray(jadwalBayar.id, basi));
}

export const LABEL_JENIS = { cashback_nasabah: "Cashback nasabah", komisi: "Komisi sales", gaji: "Gaji sales" } as const;

/**
 * Buat file transfer dari baris siap bayar; dipisah sesama BCA & antarbank.
 * Buatan owner langsung disetujui; buatan admin menunggu persetujuan owner.
 */
export async function buatBatch(ids: string[], oleh: string, olehOwner = false) {
  const rows = await db
    .select({ j: jadwalBayar, r: rekening })
    .from(jadwalBayar)
    .leftJoin(rekening, eq(rekening.id, jadwalBayar.rekeningId))
    .where(and(inArray(jadwalBayar.id, ids), eq(jadwalBayar.status, "siap"), isNull(jadwalBayar.batchId)));
  const tanpaRek = rows.filter((x) => !x.r).map((x) => x.j.penerima);
  const antarTanpaKode = rows.filter((x) => x.r && !sesamaBca(x.r) && !x.r.kodeBank).map((x) => x.j.penerima);
  const valid = rows.filter((x) => x.r && (sesamaBca(x.r) || x.r.kodeBank));
  const kelompok = { sesama_bca: valid.filter((x) => sesamaBca(x.r!)), antarbank: valid.filter((x) => !sesamaBca(x.r!)) };
  const dibuat: string[] = [];
  for (const jenisFile of ["sesama_bca", "antarbank"] as const) {
    const g = kelompok[jenisFile];
    if (!g.length) continue;
    await db.transaction(async (tx) => {
      const [b] = await tx
        .insert(batchTransfer)
        .values({
          jenisFile,
          template: "standar-v1",
          jumlah: g.length,
          total: g.reduce((a, x) => a + x.j.nominal, 0),
          dibuatOleh: oleh,
          ...(olehOwner ? { disetujui: new Date(), disetujuiOleh: oleh } : {}),
        })
        .returning({ id: batchTransfer.id });
      await tx.update(jadwalBayar).set({ status: "diekspor", batchId: b.id }).where(inArray(jadwalBayar.id, g.map((x) => x.j.id)));
      dibuat.push(b.id);
    });
  }
  return { dibuat, tanpaRek, antarTanpaKode };
}

/** Owner menyetujui batch buatan admin. */
export async function setujuiBatch(batchId: string, oleh: string) {
  const [b] = await db
    .update(batchTransfer)
    .set({ disetujui: new Date(), disetujuiOleh: oleh })
    .where(and(eq(batchTransfer.id, batchId), isNull(batchTransfer.disetujui), isNull(batchTransfer.dibayar)))
    .returning();
  return b ?? null;
}

/** Isi CSV batch (dibuat ulang dari baris jadwal agar selalu sesuai data). Hanya batch yang sudah disetujui. */
export async function csvBatch(batchId: string) {
  const [b] = await db.select().from(batchTransfer).where(eq(batchTransfer.id, batchId));
  if (!b || !b.disetujui) return null;
  const rows = await db
    .select({ j: jadwalBayar, r: rekening, kode: polis.kode, noPolis: polis.noPolis, bulan: targetSales.bulan })
    .from(jadwalBayar)
    .innerJoin(rekening, eq(rekening.id, jadwalBayar.rekeningId))
    .leftJoin(polis, eq(polis.id, jadwalBayar.polisId))
    .leftJoin(targetSales, eq(targetSales.id, jadwalBayar.targetSalesId))
    .where(eq(jadwalBayar.batchId, batchId))
    .orderBy(jadwalBayar.penerima);
  const baris: BarisTransfer[] = rows.map((x) => ({
    noRekening: x.r.noRekening,
    atasNama: x.r.atasNama,
    kodeBank: x.r.kodeBank,
    nominal: x.j.nominal,
    berita:
      x.j.jenis === "gaji" ? `Gaji ${namaBulanId(x.bulan!)}` : `${x.j.jenis === "komisi" ? "Komisi" : "Cashback"} ${x.noPolis ?? x.kode}`,
  }));
  await db.update(batchTransfer).set({ diekspor: new Date() }).where(and(eq(batchTransfer.id, batchId), isNull(batchTransfer.diekspor)));
  return { batch: b, csv: csvTransfer(b.jenisFile, baris) };
}

/**
 * Tandai satu batch sudah dibayar (setelah diotorisasi di KlikBCA Bisnis):
 * catat transfer per polis (kas + status + WA nasabah), gaji ke buku kas, lalu WA ringkasan ke tiap sales.
 */
export async function tandaiBatchDibayar(batchId: string, p: { tgl: string; oleh: string; buktiDokumenId: string | null }) {
  const [bt] = await db.select({ disetujui: batchTransfer.disetujui }).from(batchTransfer).where(eq(batchTransfer.id, batchId));
  if (!bt?.disetujui) throw new Error("Batch belum disetujui owner");
  const rows = await db.select().from(jadwalBayar).where(and(eq(jadwalBayar.batchId, batchId), eq(jadwalBayar.status, "diekspor")));
  const komisiPerSales = new Map<string, { nominal: number; polis: number }>();
  for (const j of rows) {
    if (j.jenis === "cashback_nasabah" && j.polisId) await transferPolis(j.polisId, "nasabah", { tgl: p.tgl, oleh: p.oleh, buktiDokumenId: p.buktiDokumenId });
    if (j.jenis === "komisi" && j.polisId) {
      const b = await transferPolis(j.polisId, "sales", { tgl: p.tgl, oleh: p.oleh, buktiDokumenId: p.buktiDokumenId });
      const x = komisiPerSales.get(b.salesId) ?? { nominal: 0, polis: 0 };
      komisiPerSales.set(b.salesId, { nominal: x.nominal + j.nominal, polis: x.polis + 1 });
    }
    if (j.jenis === "gaji" && j.targetSalesId) {
      const [t] = await db.select({ t: targetSales, s: users }).from(targetSales).innerJoin(users, eq(users.id, targetSales.salesId)).where(eq(targetSales.id, j.targetSalesId));
      const [sudah] = await db.select({ id: kasKantor.id }).from(kasKantor).where(and(eq(kasKantor.kategori, "gaji_sales"), eq(kasKantor.targetSalesId, j.targetSalesId)));
      if (!sudah)
        await db.insert(kasKantor).values({
          tanggal: p.tgl,
          arah: "keluar",
          kategori: "gaji_sales",
          nominal: j.nominal,
          targetSalesId: j.targetSalesId,
          keterangan: `Gaji ${t.s.nama} ${namaBulanId(t.t.bulan)}`,
          buktiDokumenId: p.buktiDokumenId,
          sumber: "otomatis",
          dibuatOleh: p.oleh,
        });
      await kirimPesan({ ke: t.s.noWa, isi: `Gaji ${namaBulanId(t.t.bulan)} sebesar ${rupiah(j.nominal)} sudah ditransfer. Terima kasih.`, jenis: "notifikasi", userId: t.s.id }).catch(() => null);
    }
    await db.update(jadwalBayar).set({ status: "dibayar", dibayar: p.tgl }).where(eq(jadwalBayar.id, j.id));
  }
  for (const [salesId, x] of komisiPerSales) {
    try {
      const [s] = await db.select().from(users).where(eq(users.id, salesId));
      const [r] = await db.select().from(rekening).where(and(eq(rekening.pemilikTipe, "sales"), eq(rekening.pemilikId, salesId), eq(rekening.utama, true)));
      const isi = await isiTemplate("komisi_ditransfer", {
        periode: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(p.tgl + "T00:00:00Z")),
        nominal: rupiah(x.nominal),
        jumlah_polis: x.polis,
        rekening: r ? `${r.namaBank} ${r.noRekening}` : "rekening Anda",
      });
      await kirimPesan({ ke: s.noWa, isi: p.buktiDokumenId ? isi : isi.replace(/\s*Bukti terlampir\.?/i, ""), jenis: "notifikasi", userId: salesId });
    } catch (e) {
      console.error("[pesan komisi]", e);
    }
  }
  await db.update(batchTransfer).set({ dibayar: new Date(), buktiDokumenId: p.buktiDokumenId }).where(eq(batchTransfer.id, batchId));
  return rows.length;
}

/** Batalkan batch yang belum dibayar: baris kembali ke "siap". */
export async function batalkanBatch(batchId: string) {
  const [b] = await db.select().from(batchTransfer).where(eq(batchTransfer.id, batchId));
  if (!b || b.dibayar) return false;
  await db.update(jadwalBayar).set({ status: "siap", batchId: null }).where(eq(jadwalBayar.batchId, batchId));
  await db.delete(batchTransfer).where(eq(batchTransfer.id, batchId));
  return true;
}
