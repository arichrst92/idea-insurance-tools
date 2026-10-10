import "server-only";
import { and, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dokumen, nasabah, notifikasi, polis, statusHistory, waLog, waOptout } from "@/db/schema";
import { maksudBalasan } from "@/lib/domain/perpanjangan";
import { buatDraftPerpanjangan, GagalPerpanjangan } from "@/lib/perpanjangan";
import { kabariSales, varsPesanNasabah } from "@/lib/pengajuan";
import { isiTemplate, kirimPesan } from "@/lib/pesan";
import { simpanFile, TIPE_DIIZINKAN } from "@/lib/storage";
import { normalisasiNoWa } from "@/lib/wa";

export type PesanMasuk = { sender: string; message: string; url?: string | null; filename?: string | null; name?: string | null };

const MAKS_BUKTI = 5;
const urutanStatus = ["antre", "terkirim", "diterima", "dibaca"] as const;

/** Webhook status Fonnte → perbarui wa_log (tidak pernah turun, mis. dibaca → diterima). */
export async function perbaruiStatusWa(fonnteId: string, statusFonnte: string) {
  const s = statusFonnte.toLowerCase();
  const baru =
    s === "read" ? "dibaca" : s === "delivered" || s === "received" ? "diterima" : s === "sent" ? "terkirim" : /fail|invalid|expired|reject/.test(s) ? "gagal" : null;
  if (!baru) return false;
  const [log] = await db.select({ id: waLog.id, status: waLog.status }).from(waLog).where(eq(waLog.fonnteId, fonnteId)).limit(1);
  if (!log) return false;
  const naik = baru === "gagal" ? log.status !== "dibaca" && log.status !== "diterima" : urutanStatus.indexOf(baru) > urutanStatus.indexOf(log.status as (typeof urutanStatus)[number]);
  if (naik) await db.update(waLog).set({ status: baru }).where(eq(waLog.id, log.id));
  return naik;
}

/** Polis yang terakhir diberi remind perpanjangan ke nomor ini (60 hari terakhir). */
async function polisRemindTerakhir(nomor: string) {
  const [r] = await db
    .select({ polisId: waLog.polisId })
    .from(waLog)
    .where(
      and(
        eq(waLog.nomorTujuan, nomor),
        eq(waLog.jenis, "remind"),
        eq(waLog.arah, "keluar"),
        gte(waLog.waktu, new Date(Date.now() - 60 * 86_400_000)),
      ),
    )
    .orderBy(desc(waLog.waktu))
    .limit(1);
  return r?.polisId ?? null;
}

async function balas(polisId: string, kode: string) {
  try {
    const { baris, vars } = await varsPesanNasabah(polisId);
    await kirimPesan({ ke: baris.n.noWa, isi: await isiTemplate(kode, vars), jenis: "balasan", polisId });
  } catch (e) {
    console.error("[wa masuk] balasan", e);
  }
}

/** Unduh lampiran dari Fonnte dan simpan sebagai bukti bayar nasabah. */
async function simpanLampiran(url: string, filename: string | null | undefined): Promise<{ key: string; nama: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const tipe = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!TIPE_DIIZINKAN[tipe]) return null;
    const blob = await res.blob();
    const nama = (filename || `bukti-wa.${TIPE_DIIZINKAN[tipe]}`).slice(0, 120);
    const key = await simpanFile(new File([blob], nama, { type: tipe }), "polis");
    return { key, nama };
  } catch (e) {
    console.error("[wa masuk] lampiran", e);
    return null;
  }
}

/**
 * Pesan WhatsApp masuk ke nomor kantor:
 * - "YA" setelah remind perpanjangan → draft perpanjangan ditandai "nasabah setuju" + kabari sales
 * - "BERHENTI" → nasabah tidak dikirimi remind lagi
 * - foto/PDF dari nasabah yang polisnya menunggu bayar → kandidat bukti transfer
 * - pesan lain → diteruskan sebagai notifikasi ke sales pemilik nasabah
 */
export async function prosesPesanMasuk(m: PesanMasuk) {
  const nomor = normalisasiNoWa(m.sender);
  if (!nomor) return { aksi: "abaikan" as const };
  const pemilik = await db.select().from(nasabah).where(eq(nasabah.noWa, nomor));
  const polisRemind = await polisRemindTerakhir(nomor);

  await db.insert(waLog).values({
    polisId: polisRemind,
    nomorTujuan: nomor,
    arah: "masuk",
    jenis: "balasan",
    status: "diterima",
    lampiran: m.url ?? null,
    isi: m.message || (m.url ? "[lampiran]" : ""),
  });
  if (pemilik.length === 0) return { aksi: "tidak_dikenal" as const };

  const maksud = maksudBalasan(m.message ?? "");

  if (maksud === "setuju" && polisRemind) {
    try {
      const d = await buatDraftPerpanjangan(polisRemind, null, "Nasabah membalas YA");
      await db.update(polis).set({ nasabahSetujuPerpanjangan: new Date() }).where(and(eq(polis.id, d.id), isNull(polis.nasabahSetujuPerpanjangan)));
      const [p] = await db.select({ status: polis.statusPengajuan }).from(polis).where(eq(polis.id, d.id));
      await db.insert(statusHistory).values({ polisId: d.id, status: p.status, catatan: "Nasabah setuju perpanjangan (balas YA di WhatsApp)" });
      await kabariSales(d.id, "Nasabah setuju perpanjangan", `${pemilik[0].nama} membalas YA pada remind perpanjangan. Siapkan penawarannya.`);
      await balas(polisRemind, "konfirmasi_perpanjangan");
      return { aksi: "setuju" as const, polisId: d.id };
    } catch (e) {
      if (!(e instanceof GagalPerpanjangan)) throw e;
      // mis. kendaraan sudah dijual → teruskan ke sales sebagai pesan biasa
    }
  }

  if (maksud === "berhenti") {
    await db.insert(waOptout).values({ nomor, jenisPesan: "remind" }).onConflictDoNothing();
    if (polisRemind) await balas(polisRemind, "konfirmasi_berhenti");
    return { aksi: "berhenti" as const };
  }

  if (m.url) {
    const tagihan = await db
      .select({ id: polis.id })
      .from(polis)
      .where(
        and(
          inArray(polis.nasabahId, pemilik.map((n) => n.id)),
          inArray(polis.statusPengajuan, ["polis_terbit", "menunggu_bayar"]),
          eq(polis.statusBayar, "belum_dibayar"),
        ),
      )
      .orderBy(desc(polis.diubah))
      .limit(1);
    if (tagihan[0]) {
      const polisId = tagihan[0].id;
      const [{ n }] = await db
        .select({ n: count() })
        .from(dokumen)
        .where(and(eq(dokumen.pemilikTipe, "polis"), eq(dokumen.pemilikId, polisId), eq(dokumen.jenis, "bukti_bayar_nasabah"), isNull(dokumen.diuploadOleh)));
      if (n < MAKS_BUKTI) {
        const f = await simpanLampiran(m.url, m.filename);
        if (f) {
          await db.insert(dokumen).values({ pemilikTipe: "polis", pemilikId: polisId, jenis: "bukti_bayar_nasabah", fileKey: f.key, namaFile: f.nama });
          await kabariSales(polisId, "Bukti transfer via WhatsApp", `${pemilik[0].nama} mengirim bukti transfer ke WhatsApp kantor. Periksa lalu tandai lunas.`);
          return { aksi: "bukti" as const, polisId };
        }
      }
    }
  }

  // Pesan lain → notifikasi ke sales pemilik.
  for (const n of pemilik) {
    await db.insert(notifikasi).values({
      userId: n.salesId,
      jenis: "pesan_nasabah",
      judul: `Pesan WhatsApp dari ${n.nama}`,
      isi: (m.message || "[lampiran]").slice(0, 500),
      link: polisRemind ? `/pengajuan/${polisRemind}` : `/nasabah/${n.id}`,
    });
  }
  return { aksi: "diteruskan" as const };
}
