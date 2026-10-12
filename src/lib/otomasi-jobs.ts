import "server-only";
import { and, eq, gte, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { exportJobs, kendaraan, kirimAsuransiLog, kontakAsuransi, nasabah, notifikasi, perusahaanAsuransi, polis, targetSales, users, type StatusPengajuan } from "@/db/schema";
import { simpanFile } from "@/lib/storage";
import { STATUS_DITUTUP, labelStatus } from "@/lib/domain/journey";
import { sisaHari, waktuWib } from "@/lib/domain/perpanjangan";
import { awalBulan, geserBulan, namaBulanId } from "@/lib/domain/periode";
import { hitungGaji } from "@/lib/domain/gaji";
import { capaian, realisasiBulanan } from "@/lib/performa";
import { rekapKomisiSiapBayar } from "@/lib/pencairan";
import { escapeHtml, kirimEmail } from "@/lib/email";
import { rupiah } from "@/lib/format";
import { stafSql } from "@/lib/peran";

/** Status yang menunggu tindakan sales; selebihnya menunggu admin. */
const MENUNGGU_SALES: StatusPengajuan[] = ["draft_prospek", "perlu_revisi", "penawaran_masuk", "polis_terbit", "menunggu_bayar"];
/** Status yang perlu cepat ditindaklanjuti (ambang "hariCepat"). */
const STATUS_CEPAT: StatusPengajuan[] = ["penawaran_masuk", "menunggu_bayar"];

async function adminAktif() {
  return db.select({ id: users.id }).from(users).where(and(stafSql(), eq(users.aktif, true)));
}

/** Notifikasi in-app, tidak dobel untuk user + link + jenis yang sama dalam 20 jam. */
async function notif(userId: string, jenis: string, judul: string, isi: string, link: string) {
  const [ada] = await db
    .select({ id: notifikasi.id })
    .from(notifikasi)
    .where(and(eq(notifikasi.userId, userId), eq(notifikasi.jenis, jenis), eq(notifikasi.link, link), gte(notifikasi.dibuat, new Date(Date.now() - 20 * 3_600_000))))
    .limit(1);
  if (ada) return false;
  await db.insert(notifikasi).values({ userId, jenis, judul, isi, link });
  return true;
}

/** Harian 08.00: pengajuan diam di satu status terlalu lama → kabari pihak yang ditunggu; > 7 hari juga admin. */
export async function jobAlertMandek(param: { hari?: number; hariCepat?: number; eskalasiAdmin?: number } = {}) {
  const hari = param.hari ?? 3;
  const hariCepat = param.hariCepat ?? 2;
  const eskalasi = param.eskalasiAdmin ?? 7;
  const terakhir = sql<Date>`(select max(sh.waktu) from status_history sh where sh.polis_id = ${polis.id})`.mapWith((v: string) => new Date(v));
  const rows = await db
    .select({ p: polis, terakhir, nasabah: nasabah.nama, plat: kendaraan.noPolisi })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .where(notInArray(polis.statusPengajuan, STATUS_DITUTUP));
  const admins = await adminAktif();
  let jumlah = 0;
  for (const r of rows) {
    const s = r.p.statusPengajuan;
    const umur = Math.floor((Date.now() - r.terakhir.getTime()) / 86_400_000);
    const ambang = STATUS_CEPAT.includes(s) ? hariCepat : hari;
    if (umur <= ambang) continue;
    const link = `/pengajuan/${r.p.id}`;
    const judul = `${r.p.kode} mandek ${umur} hari`;
    const isi = `${r.nasabah} (${r.plat}) masih di status "${labelStatus(s)}" sejak ${umur} hari lalu.`;
    const penerima = new Set<string>(MENUNGGU_SALES.includes(s) ? [r.p.salesId] : admins.map((a) => a.id));
    if (umur > eskalasi) admins.forEach((a) => penerima.add(a.id));
    for (const u of penerima) if (await notif(u, "mandek", judul, isi, link)) jumlah++;
  }
  return { jumlah, ringkasan: `${jumlah} notifikasi pengajuan mandek` };
}

/** Harian 09.00: dana asuransi belum cair melewati termin → email pengingat ke PIC (maks 1x per 7 hari per polis). */
export async function jobTagihCashback(param: { jedaHari?: number } = {}) {
  const jeda = param.jedaHari ?? 7;
  const hariIni = waktuWib().tanggal;
  const rows = await db
    .select({ p: polis, nasabah: nasabah.nama, plat: kendaraan.noPolisi, a: perusahaanAsuransi })
    .from(polis)
    .innerJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .innerJoin(kendaraan, eq(kendaraan.id, polis.kendaraanId))
    .innerJoin(perusahaanAsuransi, eq(perusahaanAsuransi.id, polis.perusahaanId))
    .where(and(eq(polis.statusPengajuan, "premi_disetor"), isNotNull(polis.tglSetorAsuransi)));
  const lewat = rows.filter((r) => -sisaHari(r.p.tglSetorAsuransi!, hariIni) > r.a.terminCashbackHari);
  if (lewat.length === 0) return { jumlah: 0, ringkasan: "Tidak ada dana asuransi yang lewat termin" };

  const baruDitagih = await db
    .select({ polisId: kirimAsuransiLog.polisId })
    .from(kirimAsuransiLog)
    .where(and(eq(kirimAsuransiLog.jenis, "tagih_cashback"), eq(kirimAsuransiLog.hasil, "terkirim"), gte(kirimAsuransiLog.waktu, new Date(Date.now() - jeda * 86_400_000))));
  const sudah = new Set(baruDitagih.map((x) => x.polisId));
  const perAsuransi = new Map<string, typeof lewat>();
  for (const r of lewat) {
    if (sudah.has(r.p.id)) continue;
    perAsuransi.set(r.a.id, [...(perAsuransi.get(r.a.id) ?? []), r]);
  }

  let jumlah = 0;
  const catatan: string[] = [];
  for (const [asuransiId, daftar] of perAsuransi) {
    const a = daftar[0].a;
    const kontak = await db
      .select()
      .from(kontakAsuransi)
      .where(and(eq(kontakAsuransi.perusahaanId, asuransiId), isNotNull(kontakAsuransi.email)));
    if (kontak.length === 0) {
      catatan.push(`${a.nama}: belum ada email PIC`);
      continue;
    }
    const baris = daftar.map((r) => ({
      noPolis: r.p.noPolis ?? r.p.kode,
      nasabah: r.nasabah,
      plat: r.plat,
      premi: rupiah(r.p.premiBruto),
      setor: r.p.tglSetorAsuransi!,
      umur: -sisaHari(r.p.tglSetorAsuransi!, hariIni),
    }));
    const subjek = `Pengingat pencairan cashback — ${daftar.length} polis lewat termin ${a.terminCashbackHari} hari`;
    const teks = `Yth. Tim ${a.nama},\n\nBerikut polis yang premi-nya sudah kami setor namun cashback-nya belum kami terima melewati termin ${a.terminCashbackHari} hari:\n\n${baris
      .map((b) => `- ${b.noPolis} · ${b.nasabah} (${b.plat}) · premi ${b.premi} · disetor ${b.setor} (${b.umur} hari)`)
      .join("\n")}\n\nMohon bantuannya untuk diproses. Terima kasih.`;
    const html = `<p>Yth. Tim ${escapeHtml(a.nama)},</p><p>Berikut polis yang premi-nya sudah kami setor namun cashback-nya belum kami terima melewati termin ${a.terminCashbackHari} hari:</p><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px"><tr style="background:#eef2ff"><th align="left">No. polis</th><th align="left">Nasabah</th><th align="left">Plat</th><th align="right">Premi</th><th align="left">Disetor</th><th align="right">Hari</th></tr>${baris
      .map((b) => `<tr><td>${escapeHtml(b.noPolis)}</td><td>${escapeHtml(b.nasabah)}</td><td>${escapeHtml(b.plat)}</td><td align="right">${escapeHtml(b.premi)}</td><td>${b.setor}</td><td align="right">${b.umur}</td></tr>`)
      .join("")}</table><p>Mohon bantuannya untuk diproses. Terima kasih.</p>`;
    for (const k of kontak) {
      const h = await kirimEmail({ ke: k.email!, subjek, teks, html });
      for (const r of daftar)
        await db.insert(kirimAsuransiLog).values({
          polisId: r.p.id,
          perusahaanId: asuransiId,
          kontakId: k.id,
          kanal: "email",
          jenis: "tagih_cashback",
          tujuan: k.email!,
          hasil: h.ok ? "terkirim" : "gagal",
        });
      if (h.ok) jumlah += daftar.length;
      else catatan.push(`${a.nama} → ${k.email}: ${h.alasan}`);
    }
  }
  return { jumlah, ringkasan: `${jumlah} penagihan terkirim${catatan.length ? `; ${catatan.join("; ")}` : ""}` };
}

/** Jumat 10.00: rekap komisi siap bayar → notifikasi admin (+ tiap sales untuk komisinya sendiri). */
export async function jobRekapKomisi() {
  const rekap = await rekapKomisiSiapBayar();
  if (rekap.length === 0) return { jumlah: 0, ringkasan: "Tidak ada komisi siap bayar" };
  const total = rekap.reduce((a, r) => a + r.total, 0);
  const tanpaRek = rekap.filter((r) => !r.noRekening).map((r) => r.sales);
  for (const a of await adminAktif())
    await notif(
      a.id,
      "rekap_komisi",
      `Rekap komisi siap bayar · ${rupiah(total)}`,
      `${rekap.length} sales, ${rekap.reduce((x, r) => x + r.polis, 0)} polis.${tanpaRek.length ? ` Rekening belum diisi: ${tanpaRek.join(", ")}.` : ""} Unduh CSV transfer di Pencairan.`,
      "/pencairan?tab=komisi",
    );
  for (const r of rekap)
    await notif(r.salesId, "komisi_siap", `Komisi Anda siap ditransfer · ${rupiah(r.total)}`, `${r.polis} polis sudah cair dari asuransi dan masuk antrean transfer.`, "/pencairan?tab=komisi");
  return { jumlah: rekap.length, ringkasan: `${rekap.length} sales, total ${rupiah(total)}` };
}

/**
 * Tanggal 1, 00.30: tutup buku target bulan lalu — kunci status achieve, hitung gaji prorata (fulltime),
 * dan salin target ke bulan baru bila belum diisi.
 */
export async function jobTutupBukuTarget() {
  const bulanIni = awalBulan(waktuWib().tanggal);
  const bulanLalu = geserBulan(bulanIni, -1);
  const daftar = await db
    .select({ t: targetSales, s: users })
    .from(targetSales)
    .innerJoin(users, eq(users.id, targetSales.salesId))
    .where(and(eq(targetSales.bulan, bulanLalu), isNull(targetSales.ditutup)));
  const hasil: string[] = [];
  for (const { t, s } of daftar) {
    const r = (await realisasiBulanan(s.id, bulanLalu, bulanLalu)).get(bulanLalu) ?? { polis: 0, premi: 0, komisi: 0 };
    const c = capaian({ targetCase: t.targetCase, targetRevenue: t.targetRevenue, utama: t.targetUtama }, r)!;
    const gajiPokok = t.gajiPokokBulan ?? s.gajiPokok ?? 0;
    const g = s.tipeSales === "fulltime" && gajiPokok > 0 ? hitungGaji(gajiPokok, c.pUtama) : null;
    await db
      .update(targetSales)
      .set({
        tercapai: c.pUtama >= 100,
        pencapaianPersen: c.pUtama,
        gajiPokokBulan: g ? gajiPokok : t.gajiPokokBulan,
        persenGaji: g?.persenGaji ?? null,
        gajiDibayar: g?.gajiDibayar ?? null,
        ditutup: new Date(),
      })
      .where(eq(targetSales.id, t.id));
    await db.insert(notifikasi).values({
      userId: s.id,
      jenis: "tutup_buku",
      judul: `Tutup buku ${namaBulanId(bulanLalu)}: ${c.pUtama >= 100 ? "ACHIEVE" : "belum achieve"}`,
      isi: `Pencapaian target ${c.utama} ${c.pUtama}% (${r.polis} polis, ${rupiah(r.premi)}).${g ? ` Gaji dibayar ${rupiah(g.gajiDibayar)} (${g.persenGaji}%).` : ""}`,
      link: `/performa/${s.id}`,
    });
    hasil.push(`${s.nama} ${c.pUtama}%${g ? ` gaji ${rupiah(g.gajiDibayar)}` : ""}`);
    // Salin target ke bulan baru untuk sales fulltime aktif yang belum punya target.
    if (s.aktif && s.tipeSales === "fulltime")
      await db
        .insert(targetSales)
        .values({ salesId: s.id, bulan: bulanIni, targetCase: t.targetCase, targetRevenue: t.targetRevenue, targetUtama: t.targetUtama, gajiPokokBulan: s.gajiPokok ?? t.gajiPokokBulan })
        .onConflictDoNothing();
  }
  if (daftar.length)
    for (const a of await adminAktif())
      await db.insert(notifikasi).values({ userId: a.id, jenis: "tutup_buku", judul: `Tutup buku target ${namaBulanId(bulanLalu)}`, isi: hasil.join("; "), link: "/performa?periode=bulan_lalu" });
  return { jumlah: daftar.length, ringkasan: daftar.length ? hasil.join("; ") : `Tidak ada target ${namaBulanId(bulanLalu)} yang perlu ditutup` };
}

/**
 * Harian 07.00, berjalan pada hari Senin (laporan minggu lalu) dan tanggal 1 (laporan bulan lalu):
 * PDF laporan penjualan & keuangan dikirim via email ke penerima yang diatur admin.
 */
export async function jobLaporanBerkala(param: { mingguan?: boolean; bulanan?: boolean }, opsi: { paksa?: boolean; penerima?: string[] } = {}) {
  const w = waktuWib();
  const periodeList: { nama: string; dari: string; sampai: string }[] = [];
  if ((w.hariMinggu === 1 && param.mingguan !== false) || opsi.paksa) {
    const senin = tambahHariTgl(w.tanggal, -7);
    periodeList.push({ nama: "Mingguan", dari: senin, sampai: tambahHariTgl(senin, 6) });
  }
  if (w.tgl === 1 && param.bulanan !== false) {
    const bulanLalu = geserBulan(awalBulan(w.tanggal), -1);
    periodeList.push({ nama: `Bulanan ${namaBulanId(bulanLalu)}`, dari: bulanLalu, sampai: tambahHariTgl(awalBulan(w.tanggal), -1) });
  }
  if (periodeList.length === 0) return { jumlah: 0, ringkasan: "Hari ini bukan jadwal laporan (Senin / tanggal 1)" };

  // Laporan keuangan memuat bagian kantor & saldo: dibuat atas nama owner, dikirim ke email owner.
  const [admin] = await db.select().from(users).where(and(eq(users.role, "owner"), eq(users.aktif, true))).limit(1);
  if (!admin) return { jumlah: 0, ringkasan: "Tidak ada owner aktif" };
  const penerima = opsi.penerima?.length
    ? opsi.penerima
    : (await db.select({ e: users.email }).from(users).where(and(eq(users.role, "owner"), eq(users.aktif, true)))).map((x) => x.e).filter((x): x is string => !!x);
  if (penerima.length === 0) return { jumlah: 0, ringkasan: "Penerima laporan belum diatur (isi di halaman Otomasi atau email owner)" };

  const { renderPdf } = await import("@/lib/ekspor/antrian");
  let jumlah = 0;
  for (const p of periodeList) {
    const lampiran = [];
    for (const jenis of ["laporan", "keuangan"] as const) {
      const [job] = await db
        .insert(exportJobs)
        .values({ userId: admin.id, jenisLaporan: jenis, filter: { periode: "kustom", dari: p.dari, sampai: p.sampai }, format: "pdf", status: "proses" })
        .returning({ id: exportJobs.id });
      const pdf = await renderPdf(job.id, jenis);
      const key = await simpanFile(new File([new Uint8Array(pdf)], `${jenis}.pdf`, { type: "application/pdf" }), "ekspor");
      await db.update(exportJobs).set({ status: "selesai", fileKey: key, selesai: new Date() }).where(eq(exportJobs.id, job.id));
      lampiran.push({ namaFile: `${jenis === "laporan" ? "laporan-penjualan" : "laporan-keuangan"}_${p.dari}_${p.sampai}.pdf`, tipe: "application/pdf", isi: pdf });
    }
    const subjek = `Laporan ${p.nama} Rekap Asuransi (${p.dari} s/d ${p.sampai})`;
    for (const ke of penerima) {
      const h = await kirimEmail({
        ke,
        subjek,
        teks: `Terlampir laporan penjualan dan keuangan periode ${p.dari} s/d ${p.sampai}.`,
        html: `<p>Terlampir laporan penjualan dan keuangan periode <b>${p.dari} s/d ${p.sampai}</b>.</p>`,
        lampiran,
      });
      if (h.ok) jumlah++;
    }
  }
  return { jumlah, ringkasan: `${periodeList.map((p) => p.nama).join(" + ")} terkirim ke ${penerima.join(", ")}` };
}

const tambahHariTgl = (t: string, n: number) => new Date(Date.parse(t + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
