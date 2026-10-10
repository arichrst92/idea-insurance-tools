import "server-only";
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { kendaraan, nasabah, notifikasi, polis, remindPerpanjangan, statusHistory, users, waLog } from "@/db/schema";
import { BATAS_AKAN_HABIS, TAHAP_REMIND, sisaHari, tahapRemind, tambahHari, waktuWib } from "@/lib/domain/perpanjangan";
import { isiTemplate, kirimPesan, type HasilPesan } from "@/lib/pesan";
import { kodeBaru, varsPesanNasabah } from "@/lib/pengajuan";

/** Status pengajuan yang berarti polisnya sudah terbit. */
export const STATUS_TERBIT = ["polis_terbit", "menunggu_bayar", "lunas", "premi_disetor", "cashback_cair", "selesai"] as const;
/** Status masa yang masih perlu diurus perpanjangannya. */
export const MASA_PERLU_DIURUS = ["aktif", "akan_habis", "expired"] as const;
/** Draft perpanjangan yang sudah lewat tahap ini dianggap "sedang diproses" → remind otomatis berhenti. */
const STATUS_DRAFT = ["draft_prospek", "data_lengkap", "perlu_revisi"] as const;
const STATUS_GAGAL = ["batal_nasabah", "ditolak_asuransi", "batal_salah_input"] as const;

/** Polis lewat masa lebih dari ini tidak lagi ditawari perpanjangan otomatis. */
export const LEWAT_MAKS_HARI = 30;

export class GagalPerpanjangan extends Error {}

/** Perbarui status masa: aktif → akan habis (≤ 30 hari) → expired (lewat tanggal akhir). */
export async function perbaruiStatusMasa(hariIni = waktuWib().tanggal) {
  const expired = await db
    .update(polis)
    .set({ statusMasa: "expired" })
    .where(and(inArray(polis.statusMasa, ["aktif", "akan_habis"]), sql`${polis.tglAkhir} < ${hariIni}`))
    .returning({ id: polis.id });
  const akanHabis = await db
    .update(polis)
    .set({ statusMasa: "akan_habis" })
    .where(
      and(
        eq(polis.statusMasa, "aktif"),
        sql`${polis.tglAkhir} >= ${hariIni}`,
        lte(polis.tglAkhir, tambahHari(hariIni, BATAS_AKAN_HABIS)),
      ),
    )
    .returning({ id: polis.id });
  return { expired: expired.length, akanHabis: akanHabis.length };
}

/** Pengajuan perpanjangan untuk polis lama (unik per polis lama), bila ada. */
export async function perpanjanganDari(polisLamaId: string) {
  const [p] = await db.select().from(polis).where(eq(polis.polisSebelumnyaId, polisLamaId)).limit(1);
  return p ?? null;
}

/**
 * Buat draft pengajuan perpanjangan dari polis lama: nasabah, kendaraan, dan paket disalin;
 * dokumen KTP/STNK/foto ikut terpakai karena melekat pada nasabah & kendaraan.
 * Sales = pemilik nasabah saat ini (bisa berbeda dari sales polis lama bila nasabah dialihkan).
 * Bila draft sudah ada, kembalikan yang ada.
 */
export async function buatDraftPerpanjangan(polisLamaId: string, oleh: string | null, catatan = "Draft perpanjangan") {
  const ada = await perpanjanganDari(polisLamaId);
  if (ada) return { id: ada.id, kode: ada.kode, baru: false };

  const [b] = await db
    .select({ p: polis, k: kendaraan, n: nasabah, s: users })
    .from(polis)
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(users, eq(users.id, nasabah.salesId))
    .where(eq(polis.id, polisLamaId));
  if (!b) throw new GagalPerpanjangan("Polis tidak ditemukan");
  if (!(STATUS_TERBIT as readonly string[]).includes(b.p.statusPengajuan)) throw new GagalPerpanjangan("Polis belum terbit");
  if (b.k.status !== "aktif") throw new GagalPerpanjangan("Kendaraan sudah dijual / tidak dipakai");
  if (b.p.statusMasa === "diperpanjang") throw new GagalPerpanjangan("Polis sudah diperpanjang");
  if (!b.s.aktif) throw new GagalPerpanjangan("Sales pemilik nasabah tidak aktif; pindahkan nasabah dulu");

  try {
    return await db.transaction(async (tx) => {
      const kode = await kodeBaru(tx);
      const [baru] = await tx
        .insert(polis)
        .values({
          kode,
          nasabahId: b.n.id,
          kendaraanId: b.k.id,
          salesId: b.n.salesId,
          kategoriId: b.p.kategoriId,
          polisSebelumnyaId: b.p.id,
        })
        .returning({ id: polis.id, kode: polis.kode });
      await tx.insert(statusHistory).values({
        polisId: baru.id,
        status: "draft_prospek",
        oleh,
        catatan: `${catatan} dari polis ${b.p.noPolis ?? b.p.kode}`,
      });
      return { id: baru.id, kode: baru.kode, baru: true };
    });
  } catch (e) {
    // Dua proses membuat draft bersamaan → kolom polis_sebelumnya_id unik menolak yang kedua.
    const lagi = await perpanjanganDari(polisLamaId);
    if (lagi) return { id: lagi.id, kode: lagi.kode, baru: false };
    throw e;
  }
}

/** Kirim remind perpanjangan ke nasabah (template remind_perpanjangan) dan catat tahapnya. */
export async function kirimRemindPerpanjangan(polisId: string, p: { tahap: number | null; oleh: string | null }): Promise<HasilPesan> {
  const { baris, vars } = await varsPesanNasabah(polisId);
  const isi = await isiTemplate("remind_perpanjangan", vars);
  const hasil = await kirimPesan({
    ke: baris.n.noWa,
    isi,
    jenis: "remind",
    polisId,
    userId: p.oleh,
    optoutKode: "remind",
  });
  await db.insert(remindPerpanjangan).values({
    polisId,
    tahap: p.tahap,
    kanal: hasil.kanal,
    waLogId: hasil.kanal === "optout" ? null : hasil.logId,
    oleh: p.oleh,
  });
  return hasil;
}

/** Polis terbit yang masanya habis dalam `hari` ke depan (atau lewat ≤ 30 hari), kendaraan masih aktif. */
async function polisJatuhTempo(hariIni: string, hari: number) {
  return db
    .select({ p: polis, s: users })
    .from(polis)
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(users, eq(users.id, nasabah.salesId))
    .where(
      and(
        inArray(polis.statusPengajuan, [...STATUS_TERBIT]),
        inArray(polis.statusMasa, [...MASA_PERLU_DIURUS]),
        eq(kendaraan.status, "aktif"),
        isNotNull(polis.tglAkhir),
        lte(polis.tglAkhir, tambahHari(hariIni, hari)),
        sql`${polis.tglAkhir} >= ${tambahHari(hariIni, -LEWAT_MAKS_HARI)}`,
      ),
    );
}

/** Otomasi harian: draft perpanjangan H-45 untuk sales pemilik + notifikasi. */
export async function jobDraftPerpanjangan(param: { hariSebelum?: number } = {}) {
  const hariIni = waktuWib().tanggal;
  await perbaruiStatusMasa(hariIni);
  const daftar = await polisJatuhTempo(hariIni, param.hariSebelum ?? 45);
  const dibuat: string[] = [];
  const gagal: string[] = [];
  for (const { p } of daftar) {
    if (await perpanjanganDari(p.id)) continue;
    try {
      const d = await buatDraftPerpanjangan(p.id, null, "Draft otomatis");
      if (!d.baru) continue;
      const [baru] = await db.select({ salesId: polis.salesId }).from(polis).where(eq(polis.id, d.id));
      await db.insert(notifikasi).values({
        userId: baru.salesId,
        jenis: "draft_perpanjangan",
        judul: `${d.kode} · Draft perpanjangan`,
        isi: `Polis ${p.noPolis} berakhir ${p.tglAkhir} (${sisaHari(p.tglAkhir!, hariIni)} hari lagi). Draft perpanjangan sudah disiapkan.`,
        link: `/pengajuan/${d.id}`,
      });
      dibuat.push(d.kode);
    } catch (e) {
      gagal.push(`${p.noPolis ?? p.kode}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return {
    jumlah: dibuat.length,
    ringkasan: `${dibuat.length} draft dibuat${dibuat.length ? ` (${dibuat.join(", ")})` : ""}${gagal.length ? `; dilewati: ${gagal.join("; ")}` : ""}`,
  };
}

/** Otomasi harian: remind WhatsApp ke nasabah pada H-30/H-14/H-7. */
export async function jobRemindPerpanjangan(param: { hari?: number[] } = {}) {
  const hariIni = waktuWib().tanggal;
  await perbaruiStatusMasa(hariIni);
  const tahap = param.hari?.length ? param.hari : TAHAP_REMIND;
  const daftar = await polisJatuhTempo(hariIni, Math.max(...tahap));
  let terkirim = 0;
  const catatan: string[] = [];
  for (const { p } of daftar) {
    const sisa = sisaHari(p.tglAkhir!, hariIni);
    // Berhenti bila perpanjangan sudah disetujui nasabah atau sudah diproses lebih lanjut.
    const lanjut = await perpanjanganDari(p.id);
    if (lanjut && (lanjut.nasabahSetujuPerpanjangan || !([...STATUS_DRAFT, ...STATUS_GAGAL] as string[]).includes(lanjut.statusPengajuan))) continue;
    const sudah = await db
      .select({ tahap: remindPerpanjangan.tahap })
      .from(remindPerpanjangan)
      .where(and(eq(remindPerpanjangan.polisId, p.id), isNotNull(remindPerpanjangan.tahap)));
    const t = tahapRemind(sisa, tahap, sudah.map((x) => x.tahap!));
    if (t === null) continue;
    try {
      const h = await kirimRemindPerpanjangan(p.id, { tahap: t, oleh: null });
      if (h.kanal === "fonnte") terkirim++;
      else catatan.push(`${p.noPolis}: ${h.kanal === "optout" ? "nasabah berhenti berlangganan" : `gagal kirim (${h.alasan})`}`);
    } catch (e) {
      catatan.push(`${p.noPolis}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { jumlah: terkirim, ringkasan: `${terkirim} remind terkirim${catatan.length ? `; ${catatan.join("; ")}` : ""}` };
}

/** Remind terakhir per polis + status pesannya (untuk daftar perpanjangan). */
export async function remindTerakhir(polisIds: string[]) {
  if (polisIds.length === 0) return new Map<string, { waktu: Date; tahap: number | null; kanal: string; status: string | null; jumlah: number }>();
  const rows = await db
    .select({ r: remindPerpanjangan, status: waLog.status })
    .from(remindPerpanjangan)
    .leftJoin(waLog, eq(waLog.id, remindPerpanjangan.waLogId))
    .where(inArray(remindPerpanjangan.polisId, polisIds))
    .orderBy(sql`${remindPerpanjangan.dibuat} desc`);
  const m = new Map<string, { waktu: Date; tahap: number | null; kanal: string; status: string | null; jumlah: number }>();
  for (const { r, status } of rows) {
    const ada = m.get(r.polisId);
    if (ada) ada.jumlah++;
    else m.set(r.polisId, { waktu: r.dibuat, tahap: r.tahap, kanal: r.kanal, status, jumlah: 1 });
  }
  return m;
}
