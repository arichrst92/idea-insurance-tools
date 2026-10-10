// Panduan sales: isi bawaan, keterangan journey, langkah onboarding, dan pengurai teks ringan.
// Murni (tanpa DB) supaya bisa dipakai seed, halaman, dan unit test.

import type { StatusPengajuan } from "@/db/schema";

// ───────────────────────── Teks ringan ─────────────────────────
// Format isi panduan yang diketik admin:
//   ## Sub judul          - poin          1. langkah bernomor
//   ?? Pertanyaan FAQ     (baris berikutnya = jawabannya, sampai ?? / ## berikutnya)
//   **tebal**  [teks](/pengajuan) atau [teks](https://…)   baris kosong = paragraf baru

export type Inline = { t: "teks"; v: string } | { t: "tebal"; v: string } | { t: "tautan"; v: string; href: string };
export type Blok =
  | { t: "judul"; isi: Inline[] }
  | { t: "paragraf"; isi: Inline[] }
  | { t: "poin"; item: Inline[][] }
  | { t: "nomor"; item: Inline[][] }
  | { t: "tanya"; tanya: Inline[]; jawab: Blok[] };

const POLA_INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g;

export function uraiInline(s: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  for (const m of s.matchAll(POLA_INLINE)) {
    if (m.index! > i) out.push({ t: "teks", v: s.slice(i, m.index) });
    if (m[1] !== undefined) out.push({ t: "tebal", v: m[1] });
    else out.push({ t: "tautan", v: m[2], href: m[3] });
    i = m.index! + m[0].length;
  }
  if (i < s.length) out.push({ t: "teks", v: s.slice(i) });
  return out;
}

export function uraiPanduan(teks: string): Blok[] {
  const hasil: Blok[] = [];
  let tujuan = hasil; // blok biasa masuk ke sini; di dalam FAQ masuk ke jawaban
  let paragraf: string[] = [];
  const tutupParagraf = () => {
    if (paragraf.length) tujuan.push({ t: "paragraf", isi: uraiInline(paragraf.join(" ")) });
    paragraf = [];
  };
  for (const mentah of teks.replace(/\r\n/g, "\n").split("\n")) {
    const baris = mentah.trim();
    if (!baris) {
      tutupParagraf();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = baris.match(/^#{2,3}\s+(.*)$/))) {
      tutupParagraf();
      tujuan = hasil;
      hasil.push({ t: "judul", isi: uraiInline(m[1]) });
    } else if ((m = baris.match(/^\?\?\s*(.*)$/))) {
      tutupParagraf();
      const b: Blok = { t: "tanya", tanya: uraiInline(m[1]), jawab: [] };
      hasil.push(b);
      tujuan = b.jawab;
    } else if ((m = baris.match(/^[-•*]\s+(.*)$/)) || (m = baris.match(/^\d+[.)]\s+(.*)$/))) {
      tutupParagraf();
      const jenis = /^\d/.test(baris) ? "nomor" : "poin";
      const akhir = tujuan[tujuan.length - 1];
      if (akhir && akhir.t === jenis) akhir.item.push(uraiInline(m[1]));
      else tujuan.push({ t: jenis, item: [uraiInline(m[1])] });
    } else paragraf.push(baris);
  }
  tutupParagraf();
  return hasil;
}

// ───────────────────────── Journey 12 langkah (versi sales) ─────────────────────────

export const KETERANGAN_LANGKAH: Partial<Record<StatusPengajuan, string>> = {
  draft_prospek: "Isi data nasabah & kendaraan, pilih asuransi dan paket, unggah KTP, STNK, dan foto kendaraan.",
  data_lengkap: "Otomatis begitu data & dokumen wajib lengkap. Pengajuan masuk antrean admin.",
  dikirim_ke_asuransi: "Admin mengirim data ke asuransi dan mengisi nilai pertanggungan.",
  survei_kendaraan: "Bila asuransi meminta survei. Langkah ini bisa dilewati.",
  penawaran_masuk: "Admin memasukkan penawaran premi. Anda mendapat notifikasi.",
  disetujui_nasabah: "Tawarkan ke nasabah dan pilih cashback nasabah. Tabel di layar menunjukkan Komisi Anda untuk tiap pilihan.",
  polis_terbit: "Admin mengunggah PDF polis.",
  menunggu_bayar: "Kirim instruksi bayar ke nasabah lewat tombol WhatsApp di pengajuan.",
  lunas: "Unggah bukti transfer nasabah. Mulai saat ini polis dihitung ke target dan laporan Anda.",
  premi_disetor: "Kantor menyetor premi ke asuransi.",
  cashback_cair: "Dana asuransi cair ke kantor. Komisi Anda masuk jadwal bayar Jumat berikutnya.",
  selesai: "Cashback nasabah dan komisi Anda sudah ditransfer.",
};

export const KETERANGAN_CABANG: { label: string; isi: string }[] = [
  { label: "Perlu revisi", isi: "Admin/asuransi meminta perbaikan data. Perbaiki lalu kirim ulang." },
  { label: "Dibatalkan (salah input)", isi: "Anda sendiri bisa membatalkan pengajuan yang salah input selama polis belum terbit." },
  { label: "Batal nasabah / Ditolak asuransi", isi: "Pengajuan ditutup dan tidak dihitung ke target." },
];

// ───────────────────────── Onboarding 5 langkah ─────────────────────────

export type KodeOnboarding = "cara_dibayar" | "journey" | "rekening" | "nasabah_pertama" | "pengajuan_pertama";

export const LANGKAH_ONBOARDING: { kode: KodeOnboarding; judul: string; ket: string; manual: boolean; href: string }[] = [
  { kode: "cara_dibayar", judul: "Pahami cara Anda dibayar", ket: "Komisi, bonus event, dan kapan ditransfer.", manual: true, href: "/panduan#cara_dibayar" },
  { kode: "journey", judul: "Kenali 12 langkah pengajuan", ket: "Siapa mengerjakan apa, dari prospek sampai selesai.", manual: true, href: "/panduan#journey" },
  { kode: "rekening", judul: "Cek rekening komisi Anda", ket: "Komisi ditransfer ke rekening ini. Salah? Hubungi admin.", manual: false, href: "/panduan#rekening" },
  { kode: "nasabah_pertama", judul: "Tambah nasabah pertama", ket: "Simpan data nasabah dan kendaraannya.", manual: false, href: "/nasabah/baru" },
  { kode: "pengajuan_pertama", judul: "Kirim pengajuan pertama", ket: "Lengkapi data sampai status Data lengkap.", manual: false, href: "/pengajuan" },
];

export function progresOnboarding(centang: string[], otomatis: Partial<Record<KodeOnboarding, boolean>>) {
  const langkah = LANGKAH_ONBOARDING.map((l) => ({ ...l, selesai: l.manual ? centang.includes(l.kode) : !!otomatis[l.kode] }));
  const selesai = langkah.filter((l) => l.selesai).length;
  return { langkah, selesai, total: langkah.length, beres: selesai === langkah.length };
}

// ───────────────────────── Isi bawaan (bisa diubah admin) ─────────────────────────
// Urutan: bagian buatan sistem disisipkan di URUTAN_JOURNEY dan URUTAN_KONTAK.

export const URUTAN_JOURNEY = 25;
export const URUTAN_KONTAK = 1000;

export const PANDUAN_BAWAAN: { kode: string; judul: string; urutan: number; isi: string }[] = [
  {
    kode: "mulai",
    judul: "Selamat datang",
    urutan: 10,
    isi: `Aplikasi ini mencatat semua pekerjaan Anda: nasabah, pengajuan polis, perpanjangan, klaim, sampai komisi. Semua pesan ke nasabah dikirim dari nomor WhatsApp kantor.

Selesaikan **5 langkah awal** di atas. Langkah yang sudah Anda kerjakan tercentang otomatis.`,
  },
  {
    kode: "cara_dibayar",
    judul: "Cara Anda dibayar",
    urutan: 20,
    isi: `## Komisi Anda
- Setiap pengajuan menampilkan **Komisi Anda** setelah penawaran masuk. Besarnya tergantung cashback yang Anda berikan ke nasabah: makin besar cashback nasabah, makin kecil komisi.
- Komisi terdiri dari **Komisi reguler** dan, bila sedang ada event, **Bonus event**. Keduanya tampil terpisah.
- Batas cashback nasabah ditentukan kantor. Pilihan di layar sudah mengikuti batas itu.

## Kapan ditransfer
1. Nasabah membayar lunas. Cashback nasabah ditransfer kantor sekitar 3 hari kerja setelah lunas.
2. Kantor menyetor premi ke asuransi, lalu menunggu **dana asuransi cair**.
3. Setelah dana cair, komisi Anda ditransfer pada **hari Jumat** berikutnya ke rekening komisi Anda.

Pantau semuanya di menu [Pencairan](/pencairan).

## Sales fulltime
- Gaji pokok dibayar setiap tanggal 1 (mundur ke hari kerja bila libur).
- Target dihitung dari polis yang sudah **lunas** pada bulan itu, menurut tanggal lunas. Polis terbit yang belum dibayar belum dihitung.
- Pencapaian 50% ke atas = gaji pokok penuh. Di bawah 50%, gaji dibayar sebanding (pencapaian × 2).
- Progres bulan berjalan ada di menu [Performa](/performa).`,
  },
  {
    kode: "fitur",
    judul: "Cara pakai fitur",
    urutan: 30,
    isi: `## Sehari-hari
- **Dashboard**: pekerjaan yang menunggu Anda, penjualan bulan ini, dan polis yang segera habis.
- **Pengajuan**: buat dan pantau pengajuan. Tab *Giliran saya* berisi yang perlu Anda kerjakan.
- **Nasabah** & **Polis**: data nasabah, kendaraan, dan polis aktif milik Anda.

## Perpanjangan & klaim
- **Perpanjangan**: draft perpanjangan dibuat otomatis 45 hari sebelum polis habis. Hubungi nasabah, lalu lanjutkan pengajuannya.
- **Klaim**: catat klaim nasabah dan pantau sampai selesai.

## Uang & target
- **Pencairan**: komisi Anda per polis dan kapan ditransfer.
- **Laporan** & **Performa**: penjualan, renewal rate, peringkat, dan target Anda.
- **Event**: event yang sedang berjalan beserta bonusnya.

## Nasabah ikut memantau
Setiap pengajuan punya **link tracker** yang bisa dikirim ke nasabah. Nasabah melihat status tanpa perlu login.`,
  },
  {
    kode: "aturan",
    judul: "Aturan",
    urutan: 40,
    isi: `- Data dan dokumen harus asli dari nasabah (KTP, STNK, foto kendaraan). Jangan mengisi data karangan.
- Jangan menjanjikan cashback di luar pilihan yang tampil di aplikasi.
- Salah input? Batalkan sendiri dengan alasan *salah input* selama polis belum terbit, lalu buat pengajuan baru.
- Nasabah yang Anda daftarkan menjadi nasabah Anda, termasuk perpanjangannya. Pemindahan nasabah hanya oleh admin.
- Bukti transfer nasabah diunggah apa adanya. Jangan mengubah nominal.
- Data nasabah bersifat rahasia. Jangan dibagikan di luar urusan polisnya.`,
  },
  {
    kode: "faq",
    judul: "FAQ",
    urutan: 50,
    isi: `?? Kenapa komisi saya belum masuk?
Komisi ditransfer pada Jumat setelah dana asuransi cair. Cek status polisnya di menu Pencairan. Selama status belum *Dana asuransi cair*, komisi masih menunggu.

?? Polis sudah terbit, kenapa belum masuk target?
Target dan laporan menghitung polis yang sudah lunas. Kirim instruksi bayar dan unggah bukti transfer nasabah.

?? Nasabah minta cashback lebih besar dari pilihan?
Pilihan cashback sudah mengikuti batas kantor. Bicarakan dengan admin sebelum menjanjikan apa pun ke nasabah.

?? Saya salah memilih paket atau mengisi data.
Bila polis belum terbit, batalkan pengajuan dengan alasan salah input lalu buat ulang. Bila sudah terbit, hubungi admin.

?? Nasabah sudah menjual mobilnya, bagaimana perpanjangannya?
Buka data nasabahnya di menu Nasabah, lalu ubah status kendaraan menjadi *dijual*. Polisnya tidak masuk daftar perpanjangan dan pengingat berhenti.

?? Saya tidak menerima kode OTP.
Pastikan nomor WhatsApp Anda aktif, lalu tekan *Kirim ulang*. Masih gagal? Hubungi admin.`,
  },
];
