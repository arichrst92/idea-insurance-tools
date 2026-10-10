# Rekap Asuransi — insurance.ide.asia

Sistem rekap nasabah, polis, cashback, dan komisi untuk agen asuransi mobil multi-asuransi.
Dokumen perencanaan (sprint, model komisi, struktur data) ada di Claude Docs: *Sprint Plan — Sistem Rekap Asuransi Mobil*.

## Stack

| Lapisan | Pilihan |
| --- | --- |
| App & API | Next.js 15 (App Router, Server Actions), TypeScript |
| UI | Tailwind CSS v4, ikon lucide, font Inter (self-hosted) |
| Database | PostgreSQL 16 + Drizzle ORM (migrasi SQL di `drizzle/`) |
| Login | OTP WhatsApp via Fonnte, sesi 30 hari (sliding) di tabel `sessions` |
| Infra | Docker Compose (Postgres, Redis, MinIO), Nginx di host |

## Menjalankan di lokal

```bash
cp .env.example .env.local          # isi AUTH_SECRET
docker compose up -d db redis minio
npm install
npm run db:migrate
ADMIN_NAMA="Nama Anda" ADMIN_NO_WA=0812xxxxxxx npm run db:seed
npm run dev                          # http://localhost:3000
```

Dengan `OTP_BYPASS=1` (bawaan `.env.example`) login cukup dengan nomor terdaftar, tanpa kode. Set `OTP_BYPASS=0` untuk menguji OTP: tanpa `FONNTE_TOKEN` kodenya dicetak di terminal `npm run dev`. Bypass selalu mati di production.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server development |
| `npm test` | Unit test (rumus komisi, gaji prorata, journey, nomor WA) |
| `npm run typecheck` / `npm run lint` | Pemeriksaan kode |
| `npm run db:generate` | Buat file migrasi setelah mengubah `src/db/schema.ts` |
| `npm run db:migrate` | Terapkan migrasi |
| `npm run db:seed` | Admin pertama, template WA, pengaturan otomasi (aman diulang) |
| `npm run db:studio` | Lihat isi database di browser |

## Deploy ke VPS

```bash
cp .env.example .env    # isi AUTH_SECRET, FONNTE_TOKEN, POSTGRES_PASSWORD, dst.
docker compose --profile prod up -d --build
docker compose --profile prod run --rm migrate npx tsx scripts/seed.ts   # sekali, untuk admin pertama
```

Aplikasi listen di `127.0.0.1:3000`; Nginx di host meneruskan `insurance.ide.asia` ke sana dengan SSL (Certbot).

## Struktur

```
src/
  app/
    login/            Login OTP WhatsApp
    (app)/            Halaman setelah login (dock menu bawah)
      master/         Asuransi + kontak PIC, kategori polis, bengkel, rekening kantor
      sales/          Pengguna & sales (fulltime/freelance, target, gaji, bagi hasil, rekening)
      nasabah/        Nasabah, kendaraan, dokumen, rekening cashback
      pengajuan/      Journey 12 langkah, kirim ke asuransi, penawaran, polis, pembayaran
      polis/, event/  Daftar polis terbit, event bagi hasil
      verifikasi/     OTP ulang untuk tindakan sensitif (> 12 jam)
    t/[token]/        Halaman tracker publik untuk nasabah
    p/[kode]/         Link unduh berbatas waktu (PDF polis, dokumen untuk PIC)
  db/schema.ts        Seluruh tabel (33 tabel sesuai dokumen)
  lib/domain/         Rumus bisnis murni + test: komisi, event bagi hasil, gaji, journey
  lib/auth/           OTP, sesi, hash
  lib/fonnte.ts       Klien WhatsApp Fonnte
  middleware.ts       Arahkan tamu ke /login, perpanjang cookie "ingat perangkat"
```

## Status sprint

- [x] **Sprint 1 — Fondasi & login**: repo, skema database lengkap, Docker, CI, login OTP + sesi persisten, role admin/sales, dock & breadcrumb, master asuransi (+ kontak email & WA PIC), kategori polis, bengkel, rekening kantor, form sales (fulltime/freelance, target bulanan, gaji pokok, bagi hasil, maks cashback, rekening)
- [x] **Sprint 2 — Nasabah & kendaraan**: daftar + cari (nama, no. WA, plat) + filter, tambah/ubah nasabah & kendaraan, data dibatasi per sales, upload KTP/STNK/foto (privat, lewat /api/dokumen), rekening cashback nasabah, tandai kendaraan dijual/tidak dipakai, pindah kepemilikan, nonaktifkan/aktifkan sales + pengalihan nasabah
- [x] **Sprint 3 — Pengajuan, polis & cashback**: journey 12 status + riwayat, cek kelengkapan dokumen, kirim data ke asuransi (email SendGrid + WhatsApp Fonnte ke PIC master), penawaran, persetujuan nasabah + hitung komisi (event otomatis), polis terbit + PDF, instruksi bayar dengan PDF terlampir (cadangan wa.me), lunas + bukti, setor/cair/transfer → selesai, revisi/tolak/batal, notifikasi giliran sales, event bagi hasil, daftar polis, link tracker nasabah publik (/t) + unduh PDF dengan 4 digit WA
- [ ] Sprint 4 — Perpanjangan & klaim
- [ ] Sprint 5 — Laporan & pencairan
- [ ] Sprint 6 — Keuangan & ekspor PDF
- [ ] Sprint 7 — UAT & go-live
