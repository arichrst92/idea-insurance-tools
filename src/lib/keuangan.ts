import "server-only";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { kasKantor, polis, rekening, statusHistory } from "@/db/schema";
import { ubahStatus, varsPesanNasabah } from "@/lib/pengajuan";
import { isiTemplate, kirimPesan } from "@/lib/pesan";
import { buatLinkUnduh } from "@/lib/unduh";

/** Kategori buku kas. Otomatis = dari alur pengajuan/jadwal bayar; manual = diinput admin. */
export const KATEGORI_KAS = {
  premi_masuk: { label: "Premi dari nasabah", arah: "masuk", otomatis: true },
  dana_asuransi: { label: "Cashback cair dari asuransi", arah: "masuk", otomatis: true },
  setor_premi: { label: "Setor premi ke asuransi", arah: "keluar", otomatis: true },
  cashback_nasabah: { label: "Cashback ke nasabah", arah: "keluar", otomatis: true },
  komisi_sales: { label: "Komisi ke sales", arah: "keluar", otomatis: true },
  gaji_sales: { label: "Gaji sales fulltime", arah: "keluar", otomatis: true },
  penarikan: { label: "Penarikan kantor", arah: "keluar", otomatis: false },
  operasional: { label: "Biaya operasional", arah: "keluar", otomatis: false },
  saldo_awal: { label: "Saldo awal", arah: "masuk", otomatis: false },
  lain_masuk: { label: "Lain-lain (masuk)", arah: "masuk", otomatis: false },
  lain_keluar: { label: "Lain-lain (keluar)", arah: "keluar", otomatis: false },
} as const;
export type KategoriKas = keyof typeof KATEGORI_KAS;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Entri kas otomatis untuk satu polis; aman diulang (unik per polis + kategori). */
export async function kasOtomatis(
  x: Tx | typeof db,
  p: { polisId: string; kategori: KategoriKas; nominal: number | null; tanggal: string; rekeningId?: string | null; keterangan: string; oleh: string | null; buktiDokumenId?: string | null },
) {
  if (!p.nominal || p.nominal <= 0) return;
  await x
    .insert(kasKantor)
    .values({
      tanggal: p.tanggal,
      arah: KATEGORI_KAS[p.kategori].arah,
      kategori: p.kategori,
      nominal: p.nominal,
      polisId: p.polisId,
      rekeningId: p.rekeningId ?? null,
      keterangan: p.keterangan,
      buktiDokumenId: p.buktiDokumenId ?? null,
      sumber: "otomatis",
      dibuatOleh: p.oleh,
    })
    .onConflictDoNothing();
}

/** Saldo kas (semua entri sampai tanggal). */
export async function saldoKas(sampai?: string) {
  const [r] = await db
    .select({
      masuk: sql<number>`coalesce(sum(case when ${kasKantor.arah} = 'masuk' then ${kasKantor.nominal} end), 0)`.mapWith(Number),
      keluar: sql<number>`coalesce(sum(case when ${kasKantor.arah} = 'keluar' then ${kasKantor.nominal} end), 0)`.mapWith(Number),
    })
    .from(kasKantor)
    .where(sampai ? lte(kasKantor.tanggal, sampai) : undefined);
  return { masuk: r.masuk, keluar: r.keluar, saldo: r.masuk - r.keluar };
}

/**
 * Dana titipan = premi yang belum disetor ke asuransi + cashback nasabah & komisi sales
 * yang dananya sudah cair tetapi belum ditransfer. Uang ini bukan milik kantor.
 */
export async function danaTitipan() {
  const [r] = await db
    .select({
      premi: sql<number>`coalesce(sum(case when ${polis.statusPengajuan} = 'lunas' then ${polis.premiBruto} end), 0)`.mapWith(Number),
      cashback: sql<number>`coalesce(sum(case when ${polis.statusPengajuan} = 'cashback_cair' and ${polis.tglTransferNasabah} is null then ${polis.cashbackNasabahRp} end), 0)`.mapWith(Number),
      komisi: sql<number>`coalesce(sum(case when ${polis.statusPengajuan} = 'cashback_cair' and ${polis.tglTransferSales} is null then ${polis.komisiSalesRp} end), 0)`.mapWith(Number),
    })
    .from(polis)
    .where(inArray(polis.statusPengajuan, ["lunas", "cashback_cair"]));
  return { ...r, total: r.premi + r.cashback + r.komisi };
}

export async function posisiKas() {
  const [s, t] = await Promise.all([saldoKas(), danaTitipan()]);
  return { ...s, titipan: t, bisaDitarik: Math.max(0, s.saldo - t.total) };
}

/** Mutasi kas per bulan (untuk grafik arus kas). */
export async function arusKasBulanan(dari: string, sampai: string) {
  const bulan = sql<string>`to_char(${kasKantor.tanggal}, 'YYYY-MM')`;
  return db
    .select({
      bulan,
      masuk: sql<number>`coalesce(sum(case when ${kasKantor.arah} = 'masuk' then ${kasKantor.nominal} end), 0)`.mapWith(Number),
      keluar: sql<number>`coalesce(sum(case when ${kasKantor.arah} = 'keluar' then ${kasKantor.nominal} end), 0)`.mapWith(Number),
    })
    .from(kasKantor)
    .where(and(gte(kasKantor.tanggal, dari), lte(kasKantor.tanggal, sampai)))
    .groupBy(bulan)
    .orderBy(bulan);
}

/**
 * Catat transfer cashback ke nasabah atau komisi ke sales untuk satu polis:
 * tanggal transfer, riwayat, entri kas, status Selesai bila keduanya beres, dan WhatsApp ke nasabah.
 * Dipakai halaman pengajuan (satu per satu) dan Jadwal bayar (per batch).
 */
export async function transferPolis(
  polisId: string,
  jenis: "nasabah" | "sales",
  p: { tgl: string; oleh: string; buktiDokumenId?: string | null; kabariNasabah?: boolean },
) {
  const [lama] = await db.select().from(polis).where(eq(polis.id, polisId));
  if (!lama) throw new Error("Polis tidak ditemukan");
  if (jenis === "nasabah" ? lama.tglTransferNasabah : lama.tglTransferSales) return lama; // sudah dicatat
  const baru = await db.transaction(async (tx) => {
    const [b] = await tx
      .update(polis)
      .set(jenis === "nasabah" ? { tglTransferNasabah: p.tgl } : { tglTransferSales: p.tgl })
      .where(and(eq(polis.id, polisId), jenis === "nasabah" ? isNull(polis.tglTransferNasabah) : isNull(polis.tglTransferSales)))
      .returning();
    if (!b) return lama;
    await tx.insert(statusHistory).values({
      polisId,
      status: b.statusPengajuan,
      oleh: p.oleh,
      catatan: jenis === "nasabah" ? `Cashback nasabah ditransfer ${p.tgl}` : `Komisi sales ditransfer ${p.tgl}`,
    });
    await kasOtomatis(tx, {
      polisId,
      kategori: jenis === "nasabah" ? "cashback_nasabah" : "komisi_sales",
      nominal: jenis === "nasabah" ? b.cashbackNasabahRp : b.komisiSalesRp,
      tanggal: p.tgl,
      keterangan: `${jenis === "nasabah" ? "Cashback nasabah" : "Komisi sales"} ${b.noPolis ?? b.kode}`,
      oleh: p.oleh,
      buktiDokumenId: p.buktiDokumenId,
    });
    if (b.statusPengajuan === "cashback_cair" && b.tglTransferNasabah && b.tglTransferSales)
      await ubahStatus(tx, { polisId, ke: "selesai", oleh: p.oleh, catatan: "Cashback nasabah & komisi sales sudah ditransfer" });
    return b;
  });

  if (jenis === "nasabah" && p.kabariNasabah !== false) {
    try {
      const { baris, vars } = await varsPesanNasabah(polisId);
      const [r] = await db
        .select()
        .from(rekening)
        .where(and(eq(rekening.pemilikTipe, "nasabah"), eq(rekening.pemilikId, baris.n.id), eq(rekening.utama, true)));
      let isi = await isiTemplate("cashback_ditransfer", { ...vars, rekening_nasabah: r ? `${r.namaBank} ${r.noRekening}` : "rekening Bapak/Ibu" });
      if (!p.buktiDokumenId) isi = isi.replace(/\s*Bukti transfer terlampir\.?/i, "");
      await kirimPesan({
        ke: baris.n.noWa,
        isi,
        jenis: "notifikasi",
        polisId,
        userId: p.oleh,
        ...(p.buktiDokumenId ? { lampiranUrl: await buatLinkUnduh(p.buktiDokumenId, 30), namaLampiran: "Bukti transfer cashback" } : {}),
      });
    } catch (e) {
      console.error("[pesan cashback]", e);
    }
  }
  return baru;
}
