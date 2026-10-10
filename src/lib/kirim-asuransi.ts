import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dokumen, kendaraan, kirimAsuransiLog, kontakAsuransi, nasabah, otomasiLog, otomasiSetting, perusahaanAsuransi, polis } from "@/db/schema";
import { escapeHtml, kirimEmail, type Lampiran } from "@/lib/email";
import { kirimPesan } from "@/lib/pesan";
import { bacaFile, tipeKonten } from "@/lib/storage";
import { buatLinkUnduh } from "@/lib/unduh";
import { ubahStatus } from "@/lib/pengajuan";

export type Pengirim = { id: string | null; nama: string; email: string | null };

/**
 * Kirim data pengajuan + dokumen (KTP, STNK, foto) ke PIC asuransi via email (lampiran) dan/atau
 * WhatsApp (link unduh). Status pindah ke "Dikirim ke asuransi" bila ada yang terkirim.
 */
export async function kirimDataKeAsuransi(
  polisId: string,
  o: { perusahaanIds: string[]; kanal: ("email" | "wa")[]; pengirim: Pengirim },
): Promise<{ adaTerkirim: boolean; hasilKirim: string[]; bukaUrl?: string }> {
  const { perusahaanIds, kanal, pengirim } = o;
  const [p] = await db.select().from(polis).where(eq(polis.id, polisId));
  if (!p) return { adaTerkirim: false, hasilKirim: ["Pengajuan tidak ditemukan"] };
  const [b] = await db
    .select({ n: nasabah, k: kendaraan })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .where(eq(polis.id, polisId));
  const docs = await db
    .select()
    .from(dokumen)
    .where(
      sql`(${dokumen.pemilikTipe} = 'nasabah' and ${dokumen.pemilikId} = ${p.nasabahId})
       or (${dokumen.pemilikTipe} = 'kendaraan' and ${dokumen.pemilikId} = ${p.kendaraanId})`,
    );

  const baris: [string, string][] = [
    ["Nama tertanggung", b.n.nama],
    ["NIK", b.n.nik ?? "-"],
    ["Alamat", b.n.alamat ?? "-"],
    ["Kendaraan", `${b.k.merek} ${b.k.model} (${b.k.tahun})`],
    ["No. polisi", b.k.noPolisi],
    ["Warna", b.k.warna ?? "-"],
    ["No. rangka", b.k.noRangka ?? "-"],
    ["No. mesin", b.k.noMesin ?? "-"],
    ["Permintaan", "Mohon taksiran nilai pertanggungan (TSI) dan penawaran untuk semua paket yang tersedia (mis. Biasa, Plus, Complete)"],
  ];
  const teksData = baris.map(([k, v]) => `${k}: ${v}`).join("\n");
  const htmlData = `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${baris
    .map(([k, v]) => `<tr><td style="color:#6b7280">${escapeHtml(k)}</td><td><b>${escapeHtml(v)}</b></td></tr>`)
    .join("")}</table>`;

  let lampiranEmail: Lampiran[] | null = null;
  const lampiranNama = docs.map((d) => d.namaFile ?? d.jenis);
  const hasilKirim: string[] = [];
  let adaTerkirim = false;
  // wa.me cadangan hanya bisa membuka satu chat; sisanya tercatat di riwayat kirim.
  let bukaUrl: string | undefined;

  for (const pid of perusahaanIds) {
    const [a] = await db.select().from(perusahaanAsuransi).where(eq(perusahaanAsuransi.id, pid));
    if (!a) continue;
    const kontak = await db
      .select()
      .from(kontakAsuransi)
      .where(eq(kontakAsuransi.perusahaanId, pid))
      .orderBy(desc(kontakAsuransi.utama));
    const subjek = `Permohonan penawaran asuransi mobil ${b.k.noPolisi} — ${p.kode}`;

    if (kanal.includes("email")) {
      const k = kontak.find((x) => x.email);
      if (!k) hasilKirim.push(`${a.nama}: email PIC belum ada`);
      else {
        lampiranEmail ??= await Promise.all(
          docs.map(async (d) => ({ namaFile: d.namaFile ?? `${d.jenis}.${d.fileKey.split(".").pop()}`, tipe: tipeKonten(d.fileKey), isi: await bacaFile(d.fileKey) })),
        );
        const r = await kirimEmail({
          ke: k.email!,
          subjek,
          balasKe: pengirim.email ?? undefined,
          teks: `Yth. ${k.namaPic},\n\nMohon penawaran asuransi mobil dengan data berikut:\n\n${teksData}\n\nTerlampir KTP, STNK, dan foto kendaraan.\n\nTerima kasih,\n${pengirim.nama}`,
          html: `<p>Yth. ${escapeHtml(k.namaPic)},</p><p>Mohon penawaran asuransi mobil dengan data berikut:</p>${htmlData}<p>Terlampir KTP, STNK, dan foto kendaraan.</p><p>Terima kasih,<br>${escapeHtml(pengirim.nama)}</p>`,
          lampiran: lampiranEmail,
        });
        await db.insert(kirimAsuransiLog).values({
          polisId,
          perusahaanId: pid,
          kontakId: k.id,
          kanal: "email",
          tujuan: k.email!,
          lampiran: lampiranNama,
          hasil: r.ok ? "terkirim" : "gagal",
          oleh: pengirim.id,
        });
        hasilKirim.push(`${a.nama} email: ${r.ok ? "terkirim" : `gagal (${r.alasan})`}`);
        adaTerkirim ||= r.ok;
      }
    }

    if (kanal.includes("wa")) {
      const k = kontak.find((x) => x.noWa);
      if (!k) hasilKirim.push(`${a.nama}: WhatsApp PIC belum ada`);
      else {
        const links = await Promise.all(docs.map(async (d) => `- ${d.jenis.replace("_", " ")}: ${await buatLinkUnduh(d.id, 30)}`));
        const isi = `Yth. ${k.namaPic} (${a.nama}),\nMohon penawaran asuransi mobil — ${p.kode}\n\n${teksData}\n\nDokumen:\n${links.join("\n")}\n\nTerima kasih,\n${pengirim.nama}`;
        const r = await kirimPesan({ ke: k.noWa!, isi, jenis: "kirim_asuransi", polisId, userId: pengirim.id });
        await db.insert(kirimAsuransiLog).values({
          polisId,
          perusahaanId: pid,
          kontakId: k.id,
          kanal: "wa",
          tujuan: k.noWa!,
          lampiran: lampiranNama,
          hasil: r.kanal === "fonnte" ? "terkirim" : "dibuka_wa",
          oleh: pengirim.id,
        });
        hasilKirim.push(`${a.nama} WhatsApp: ${r.kanal === "fonnte" ? "terkirim" : "buka WhatsApp untuk mengirim"}`);
        adaTerkirim = true;
        if (r.kanal === "wame") bukaUrl ??= r.url;
      }
    }
  }

  if (adaTerkirim && p.statusPengajuan === "data_lengkap") {
    await db.transaction((tx) =>
      ubahStatus(tx, { polisId, ke: "dikirim_ke_asuransi", oleh: pengirim.id, catatan: hasilKirim.join("; ") }),
    );
  }
  return { adaTerkirim, hasilKirim, bukaUrl };
}

/** Otomasi "kirim otomatis ke asuransi bawaan" saat pengajuan berstatus Data lengkap. */
export async function kirimOtomatisBawaan(polisId: string) {
  const [s] = await db.select().from(otomasiSetting).where(eq(otomasiSetting.kode, "kirim_otomatis_asuransi"));
  const param = (s?.parameter ?? {}) as { perusahaanIds?: string[]; kanal?: ("email" | "wa")[] };
  if (!s?.aktif || !param.perusahaanIds?.length) return null;
  const [log] = await db.insert(otomasiLog).values({ kode: s.kode }).returning({ id: otomasiLog.id });
  try {
    const h = await kirimDataKeAsuransi(polisId, {
      perusahaanIds: param.perusahaanIds,
      kanal: param.kanal?.length ? param.kanal : ["email", "wa"],
      pengirim: { id: null, nama: "Admin Rekap Asuransi", email: null },
    });
    await db
      .update(otomasiLog)
      .set({ selesai: new Date(), status: h.adaTerkirim ? "sukses" : "gagal", jumlahDiproses: h.adaTerkirim ? 1 : 0, ringkasan: h.hasilKirim.join("; ") })
      .where(eq(otomasiLog.id, log.id));
    return h;
  } catch (e) {
    await db.update(otomasiLog).set({ selesai: new Date(), status: "gagal", error: e instanceof Error ? e.message : String(e) }).where(eq(otomasiLog.id, log.id));
    throw e;
  }
}
