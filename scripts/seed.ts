// Data awal: admin pertama, template WhatsApp, dan pengaturan otomasi.
// Jalankan: ADMIN_NAMA="Ari Christian" ADMIN_NO_WA=0812xxxx npm run db:seed
// Aman dijalankan berulang (tidak menimpa data yang sudah ada).

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { normalisasiNoWa } from "../src/lib/wa";

const client = postgres(process.env.DATABASE_URL ?? "postgresql://insurance:insurance@localhost:5432/insurance", { max: 1 });
const db = drizzle(client, { schema, casing: "snake_case" });

const TEMPLATE_WA = [
  {
    kode: "instruksi_bayar",
    nama: "Instruksi pembayaran",
    isi: "Halo {sapaan} {nama}, berikut instruksi pembayaran polis asuransi mobil {kendaraan} {no_polisi} ({asuransi}, {periode}). Total pembayaran {premi}, transfer ke {bank} {no_rekening} a.n. {atas_nama} paling lambat {batas_bayar}. Mohon kirim bukti transfer di chat ini; cashback {cashback} akan kami transfer ke rekening {sapaan} setelah pembayaran diterima. Pantau status: {link_tracker}\n— {nama_sales}",
    lampiranDefault: "polis",
  },
  {
    kode: "pengingat_bayar",
    nama: "Pengingat batas bayar (H-1)",
    isi: "Halo {sapaan} {nama}, pengingat: batas pembayaran polis {no_polisi} adalah besok, {batas_bayar}. Total {premi} ke {bank} {no_rekening} a.n. {atas_nama}. Abaikan pesan ini bila sudah transfer.",
  },
  {
    kode: "pembayaran_diterima",
    nama: "Pembayaran diterima",
    isi: "Terima kasih {sapaan} {nama}, pembayaran polis {no_polisi} sebesar {premi} sudah kami terima. Cashback {cashback} akan kami transfer ke rekening {sapaan}. Status: {link_tracker}",
  },
  {
    kode: "cashback_ditransfer",
    nama: "Cashback ditransfer",
    isi: "Halo {sapaan} {nama}, cashback polis {no_polisi} sebesar {cashback} sudah kami transfer ke {rekening_nasabah}. Bukti transfer terlampir. Terima kasih!",
    lampiranDefault: "bukti_transfer_cashback_nasabah",
  },
  {
    kode: "remind_perpanjangan",
    nama: "Remind perpanjangan",
    isi: "Halo {sapaan} {nama}, polis asuransi mobil {kendaraan} {no_polisi} akan berakhir {tgl_akhir} ({sisa_hari} hari lagi). Balas *YA* bila ingin kami siapkan perpanjangannya. Balas BERHENTI untuk tidak menerima pengingat ini.\n— {nama_sales}",
  },
  {
    kode: "tracker",
    nama: "Link tracker pengajuan",
    isi: "Halo {sapaan} {nama}, status pengajuan asuransi mobil {kendaraan} {no_polisi} bisa {sapaan} pantau kapan saja di link berikut: {link_tracker}\nLink ini khusus untuk {sapaan}, mohon tidak dibagikan.\n— {nama_sales}",
  },
  {
    kode: "giliran_sales",
    nama: "Giliran Anda (sales)",
    isi: "Pengajuan {kode} ({nama}, {no_polisi}) sekarang di status *{status}* dan menunggu tindakan Anda. {link}",
    cadanganEmail: false,
  },
  {
    kode: "komisi_ditransfer",
    nama: "Komisi ditransfer (sales)",
    isi: "Komisi {periode} sebesar {nominal} untuk {jumlah_polis} polis sudah ditransfer ke {rekening}. Bukti terlampir.",
    lampiranDefault: "bukti_transfer_komisi",
  },
];

// Paket coverage bawaan (bisa diubah di Master data → Paket coverage).
const DASAR = "Tabrakan, benturan, terperosok, tergelincir, kehilangan, kebakaran, pencurian";
const PAKET = [
  { nama: "Biasa", urutan: 1, cakupan: [DASAR, "Tuntutan pihak ke-3"] },
  {
    nama: "Plus",
    urutan: 2,
    cakupan: [DASAR, "Banjir, badai, angin topan, hujan es, tanah longsor", "Kerusuhan, huru-hara", "Tuntutan pihak ke-3"],
  },
  {
    nama: "Complete",
    urutan: 3,
    cakupan: [
      DASAR,
      "Banjir, badai, angin topan, hujan es, tanah longsor",
      "Gempa bumi, tsunami, letusan gunung berapi",
      "Kerusuhan, huru-hara",
      "Terorisme, sabotase",
      "Tuntutan pihak ke-3",
      "Personal accident sopir & 4 penumpang",
    ],
  },
];

const OTOMASI = [
  { kode: "draft_perpanjangan", nama: "Draft perpanjangan", jadwalCron: "0 6 * * *", parameter: { hariSebelum: 45 } },
  { kode: "alert_mandek", nama: "Alert pengajuan mandek", jadwalCron: "0 8 * * *", parameter: { hari: 3, hariCepat: 2, eskalasiAdmin: 7 } },
  { kode: "tagih_cashback", nama: "Pengingat penagihan cashback", jadwalCron: "0 9 * * *", parameter: { jedaHari: 7 } },
  { kode: "rekap_komisi", nama: "Rekap komisi siap bayar", jadwalCron: "0 10 * * 5", parameter: {} },
  { kode: "laporan_berkala", nama: "Laporan berkala", jadwalCron: "0 7 * * 1", parameter: { bulanan: true } },
  { kode: "tutup_buku_target", nama: "Tutup buku target", jadwalCron: "30 0 1 * *", parameter: {} },
  { kode: "kirim_otomatis_asuransi", nama: "Kirim otomatis ke asuransi", jadwalCron: "event:data_lengkap", parameter: {}, aktif: false },
];

async function main() {
  const noWa = process.env.ADMIN_NO_WA ? normalisasiNoWa(process.env.ADMIN_NO_WA) : null;
  if (noWa) {
    await db
      .insert(schema.users)
      .values({ nama: process.env.ADMIN_NAMA ?? "Admin", noWa, role: "admin" })
      .onConflictDoNothing({ target: schema.users.noWa });
    console.log(`✓ admin ${noWa}`);
  } else {
    console.log("• ADMIN_NO_WA tidak diisi — admin pertama dilewati");
  }

  for (const t of TEMPLATE_WA) await db.insert(schema.waTemplate).values(t).onConflictDoNothing();
  console.log(`✓ ${TEMPLATE_WA.length} template WhatsApp`);

  const adaPaket = await db.select({ nama: schema.kategoriPolis.nama }).from(schema.kategoriPolis);
  const baru = PAKET.filter((p) => !adaPaket.some((a) => a.nama.toLowerCase() === p.nama.toLowerCase()));
  if (baru.length) await db.insert(schema.kategoriPolis).values(baru);
  console.log(`✓ paket coverage (${baru.length} baru)`);

  for (const o of OTOMASI) await db.insert(schema.otomasiSetting).values(o).onConflictDoNothing();
  console.log(`✓ ${OTOMASI.length} pengaturan otomasi`);
}

main()
  .then(() => client.end())
  .catch(async (e) => {
    console.error(e);
    await client.end();
    process.exit(1);
  });
