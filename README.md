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

Tanpa `FONNTE_TOKEN`, kode OTP dicetak di terminal `npm run dev`, jadi login bisa dicoba tanpa WhatsApp.

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
      verifikasi/     OTP ulang untuk tindakan sensitif (> 12 jam)
  db/schema.ts        Seluruh tabel (33 tabel sesuai dokumen)
  lib/domain/         Rumus bisnis murni + test: komisi, event bagi hasil, gaji, journey
  lib/auth/           OTP, sesi, hash
  lib/fonnte.ts       Klien WhatsApp Fonnte
  middleware.ts       Arahkan tamu ke /login, perpanjang cookie "ingat perangkat"
```

## Status sprint

- [x] **Sprint 1 — Fondasi & login**: repo, skema database lengkap, Docker, CI, login OTP + sesi persisten, role admin/sales, dock & breadcrumb, master asuransi (+ kontak email & WA PIC), kategori polis, bengkel, rekening kantor, form sales (fulltime/freelance, target bulanan, gaji pokok, bagi hasil, maks cashback, rekening)
- [ ] Sprint 2 — Nasabah & kendaraan
- [ ] Sprint 3 — Polis & cashback (termasuk link tracker nasabah)
- [ ] Sprint 4 — Perpanjangan & klaim
- [ ] Sprint 5 — Laporan & pencairan
- [ ] Sprint 6 — Keuangan & ekspor PDF
- [ ] Sprint 7 — UAT & go-live
