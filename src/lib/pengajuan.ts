import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { db as Db } from "@/db";
import { db } from "@/db";
import {
  dokumen,
  kendaraan,
  nasabah,
  notifikasi,
  perusahaanAsuransi,
  polis,
  rekening,
  statusHistory,
  trackerLink,
  users,
  type StatusPengajuan,
} from "@/db/schema";
import { labelStatus, samarkanPlat, transisiSah } from "@/lib/domain/journey";
import { isiTemplate, kirimPesan } from "@/lib/pesan";
import { rupiah } from "@/lib/format";
import { tokenPendek } from "@/lib/id";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];
export type Polis = typeof polis.$inferSelect;

export class TransisiTidakSah extends Error {}

/** Jumlah foto kendaraan minimal agar data dianggap lengkap (4 sisi). */
export const MIN_FOTO_KENDARAAN = 4;

export async function kodeBaru(tx: Tx): Promise<string> {
  const [{ n }] = await tx.execute<{ n: string }>(sql`select nextval('polis_kode_seq') as n`);
  return `PJ-${String(n).padStart(4, "0")}`;
}

/**
 * Pindahkan status pengajuan (dengan validasi alur) dan catat riwayatnya.
 * `patch` ikut diset pada baris polis dalam transaksi yang sama.
 */
export async function ubahStatus(
  tx: Tx,
  p: { polisId: string; ke: StatusPengajuan; oleh: string | null; catatan?: string | null; patch?: Partial<Polis> },
): Promise<Polis> {
  const [lama] = await tx.select().from(polis).where(eq(polis.id, p.polisId)).for("update");
  if (!lama) throw new TransisiTidakSah("Pengajuan tidak ditemukan");
  if (!transisiSah(lama.statusPengajuan, p.ke)) {
    throw new TransisiTidakSah(`Tidak bisa pindah dari "${labelStatus(lama.statusPengajuan)}" ke "${labelStatus(p.ke)}"`);
  }
  const [baru] = await tx
    .update(polis)
    .set({ ...p.patch, statusPengajuan: p.ke })
    .where(eq(polis.id, p.polisId))
    .returning();
  await tx.insert(statusHistory).values({ polisId: p.polisId, status: p.ke, oleh: p.oleh, catatan: p.catatan ?? null });
  return baru;
}

/** Status yang menunggu tindakan sales → sales diberi notifikasi "giliran Anda". */
const GILIRAN_SALES: StatusPengajuan[] = ["perlu_revisi", "penawaran_masuk", "polis_terbit"];

/** Efek samping setelah transaksi status selesai: notifikasi in-app + WhatsApp ke sales. */
export async function setelahStatus(polisId: string, oleh: string | null) {
  const [baris] = await db
    .select({ p: polis, n: nasabah, k: kendaraan, s: users })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(users, eq(users.id, polis.salesId))
    .where(eq(polis.id, polisId));
  if (!baris || !GILIRAN_SALES.includes(baris.p.statusPengajuan) || oleh === baris.s.id) return;
  const status = labelStatus(baris.p.statusPengajuan);
  const link = `${process.env.APP_URL ?? ""}/pengajuan/${polisId}`;
  await db.insert(notifikasi).values({
    userId: baris.s.id,
    jenis: "giliran_sales",
    judul: `${baris.p.kode} · ${status}`,
    isi: `${baris.n.nama} (${baris.k.noPolisi}) menunggu tindakan Anda.`,
    link: `/pengajuan/${polisId}`,
  });
  try {
    const isi = await isiTemplate("giliran_sales", {
      kode: baris.p.kode,
      nama: baris.n.nama,
      no_polisi: baris.k.noPolisi,
      status,
      link,
    });
    await kirimPesan({ ke: baris.s.noWa, isi, jenis: "notifikasi", polisId, userId: baris.s.id });
  } catch (e) {
    console.error("[notifikasi sales]", e);
  }
}

/** Kelengkapan dokumen untuk status "Data lengkap": KTP, STNK, dan foto kendaraan 4 sisi. */
export async function cekKelengkapan(p: { nasabahId: string; kendaraanId: string }) {
  const rows = await db
    .select({ jenis: dokumen.jenis, n: sql<number>`count(*)`.mapWith(Number) })
    .from(dokumen)
    .where(
      sql`(${dokumen.pemilikTipe} = 'nasabah' and ${dokumen.pemilikId} = ${p.nasabahId})
       or (${dokumen.pemilikTipe} = 'kendaraan' and ${dokumen.pemilikId} = ${p.kendaraanId})`,
    )
    .groupBy(dokumen.jenis);
  const jml = (j: string) => rows.find((r) => r.jenis === j)?.n ?? 0;
  const kurang: string[] = [];
  if (jml("ktp") < 1) kurang.push("KTP");
  if (jml("stnk") < 1) kurang.push("STNK");
  if (jml("foto_kendaraan") < MIN_FOTO_KENDARAAN)
    kurang.push(`foto kendaraan ${MIN_FOTO_KENDARAAN} sisi (baru ${jml("foto_kendaraan")})`);
  return { lengkap: kurang.length === 0, kurang };
}

// ─── Link tracker ───

export const UMUR_TRACKER_HARI = 90;

export async function trackerAktif(polisId: string) {
  const [t] = await db
    .select()
    .from(trackerLink)
    .where(and(eq(trackerLink.polisId, polisId), sql`${trackerLink.dicabut} is null`))
    .orderBy(sql`${trackerLink.dibuat} desc`)
    .limit(1);
  return t ?? null;
}

/** Ambil link tracker aktif atau buat baru. Kedaluwarsa dihitung 90 hari setelah Selesai. */
export async function pastikanTracker(polisId: string, oleh: string | null) {
  const ada = await trackerAktif(polisId);
  if (ada) return ada;
  const [baru] = await db.insert(trackerLink).values({ polisId, token: tokenPendek(8), dibuatOleh: oleh }).returning();
  return baru;
}

export const urlTracker = (token: string) => `${process.env.APP_URL ?? "http://localhost:3000"}/t/${token}`;

// ─── Variabel pesan nasabah ───

export async function varsPesanNasabah(polisId: string) {
  const [b] = await db
    .select({ p: polis, n: nasabah, k: kendaraan, s: users, a: perusahaanAsuransi, r: rekening })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(users, eq(users.id, polis.salesId))
    .leftJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .leftJoin(rekening, eq(rekening.id, polis.rekeningPembayaranId))
    .where(eq(polis.id, polisId));
  if (!b) throw new Error("Pengajuan tidak ditemukan");
  const tracker = await pastikanTracker(polisId, null);
  const tgl = (d: string | null) =>
    d ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T00:00:00")) : "";
  return {
    baris: b,
    vars: {
      sapaan: b.n.tipe === "badan" ? "" : "Bapak/Ibu",
      nama: b.n.nama,
      kendaraan: `${b.k.merek} ${b.k.model}`,
      no_polisi: b.k.noPolisi,
      no_polisi_samar: samarkanPlat(b.k.noPolisi),
      asuransi: b.a?.nama ?? "",
      periode: b.p.tglMulai && b.p.tglAkhir ? `${tgl(b.p.tglMulai)} – ${tgl(b.p.tglAkhir)}` : "",
      premi: rupiah(b.p.premiBruto),
      bank: b.r?.namaBank ?? "",
      no_rekening: b.r?.noRekening ?? "",
      atas_nama: b.r?.atasNama ?? "",
      batas_bayar: tgl(b.p.batasBayar),
      cashback: rupiah(b.p.cashbackNasabahRp),
      link_tracker: urlTracker(tracker.token),
      nama_sales: b.s.nama,
      kode: b.p.kode,
    },
  };
}


/** Kabari sales pemilik pengajuan: notifikasi in-app + WhatsApp (mis. ada aksi nasabah di tracker). */
export async function kabariSales(polisId: string, judul: string, isi: string) {
  const [b] = await db
    .select({ p: polis, s: users })
    .from(polis)
    .innerJoin(users, eq(users.id, polis.salesId))
    .where(eq(polis.id, polisId));
  if (!b) return;
  await db.insert(notifikasi).values({ userId: b.s.id, jenis: "aksi_nasabah", judul: `${b.p.kode} · ${judul}`, isi, link: `/pengajuan/${polisId}` });
  try {
    const link = `${process.env.APP_URL ?? ""}/pengajuan/${polisId}`;
    await kirimPesan({ ke: b.s.noWa, isi: `${b.p.kode}: ${judul}\n${isi}\n${link}`, jenis: "notifikasi", polisId, userId: b.s.id });
  } catch (e) {
    console.error("[kabari sales]", e);
  }
}
