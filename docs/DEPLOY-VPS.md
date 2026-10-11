# Deploy ke VPS `72.60.74.202` (berbagi dengan IDEA Company Profile)

VPS ini sudah menjalankan **ide.asia** (production): Node 20 + Express + MongoDB, PM2 cluster `idea-website` di port
**3000**, Nginx + certbot. Rekap Asuransi menumpang sebagai tenant dan **wajib** mengikuti *VPS Tenant Brief*
(PIC VPS: Ari Christian · arichrst@ide.asia · WA +62 818-0580-7807).

> Karena itu deploy produksi **tidak memakai Docker** (Docker mengubah aturan firewall/iptables yang dimiliki PIC VPS)
> dan **tidak memakai port 3000**. `docker-compose.yml` tetap dipakai untuk development lokal saja.

## 1. Aturan yang dipegang (ringkas dari brief)

| Jangan | Yang kita lakukan |
|---|---|
| `systemctl restart nginx` | `sudo nginx -t && sudo systemctl reload nginx` |
| Edit `/etc/nginx/nginx.conf` | File sendiri `sites-available/insurance.ide.asia` + symlink |
| Port 3000 | App di **127.0.0.1:3100** (minta approval PIC) |
| `certbot --standalone` | `certbot --nginx -d insurance.ide.asia` |
| Sentuh PM2 `idea-website`, `/var/www/idea-website/`, MongoDB | Tidak pakai PM2 sama sekali; systemd service sendiri |
| `sudo rm -rf` / `chmod -R` di luar folder sendiri | Semua file di `/var/www/insurance*`, `/var/log/insurance`, `/var/backups/insurance` |

## 2. Susunan di VPS

| Resource | Nilai |
|---|---|
| Domain | `insurance.ide.asia` → A record `72.60.74.202` |
| User sistem | `insurance-deploy` (sudo terbatas: hanya `systemctl … insurance-app`, lihat `deploy/sudoers-insurance-deploy`) |
| App | `/var/www/insurance/` → `releases/<versi>/`, `current` (symlink), `shared/.env`, `bin/`, `browsers/` |
| Upload | `/var/www/insurance-uploads/` (`STORAGE_DIR`) |
| Service | `insurance-app.service` (Node, 1 proses, port 3100, `MemoryMax=1200M`, `CPUQuota=80%`) |
| Backup | `insurance-backup.timer` 02:30 WIB → `/var/backups/insurance/` (14 hari) |
| Log | `/var/log/insurance/{out,err,backup}.log` (logrotate mingguan) |
| Database | PostgreSQL (localhost:5432), DB `insurance_prod`, role `insurance_app` |
| Redis | **Tidak dipasang.** Ekspor PDF otomatis diproses langsung di proses app; otomasi memakai penjadwal internal |
| Chromium (PDF) | Playwright Chromium di `/var/www/insurance/browsers/` (bukan paket sistem) |

Satu proses saja (bukan cluster/`instances: max`): penjadwal otomasi berjalan di dalam proses app, jadi dua proses
akan mengirim WhatsApp dua kali.

## 3. Estimasi resource (form §5 brief)

Diukur dari build produksi (`server.js` idle ≈ 200 MB RSS).

| Metric | Estimasi |
|---|---|
| RAM steady state | ± 250 MB app + ± 100 MB PostgreSQL |
| RAM peak (ekspor PDF / otomasi pagi) | ± 700 MB (Chromium sesaat), dibatasi keras `MemoryMax=1200M` |
| Build | **Tidak build di VPS** — paket dibuat di GitHub Actions |
| Disk app code | ± 110 MB per rilis × 3 rilis + Chromium ± 350 MB ≈ 700 MB |
| Disk persistent 1 tahun | upload ± 3–5 GB (foto dikompres di browser) + DB < 1 GB + backup 14 hari ± 2 GB |
| CPU rata-rata | < 5% dari 1 vCPU (lonjakan singkat saat PDF/Excel) |
| Traffic peak | < 30 req/menit (tim internal ± 10 orang + link tracker nasabah) |

## 4. Sign-off checklist (draf untuk dikirim ke PIC)

- [x] Sudah membaca semua section brief
- [x] Setuju tidak melanggar HARD RULES
- [x] Setuju pakai konvensi §3 (nama `insurance`)
- [x] Resource estimate diisi (§3 dokumen ini)
- [ ] Internal port: **`3100`** — cek dulu `sudo ss -tlnp | grep 3100` lalu minta approval
- [ ] Window deploy awal: **Sabtu 02:00–06:00 WIB** (install PostgreSQL = operasi berisiko → notif PIC H-1)
- [ ] PIC tim: Ari Christian · +62 818-0580-7807
- [ ] Email alert: arichrst@ide.asia
- Domain: `insurance.ide.asia` · estimasi tanggal: setelah UAT selesai

## 5. Setup pertama (sekali, di maintenance window, PIC standby)

0. Jalankan `vps-audit.sh` dari PIC; catat versi OS, Node (`/usr/bin/node -v`, harus ≥ 20), apakah PostgreSQL
   sudah ada, dan `sudo ss -tlnp`. Snapshot bersama PIC ke `/var/backups/insurance-preinstall/`.
1. **User & folder**
   ```bash
   sudo useradd --system --create-home --home-dir /var/www/insurance --shell /bin/bash insurance-deploy
   sudo install -d -o insurance-deploy -g insurance-deploy -m 750 \
     /var/www/insurance/{releases,shared,bin,browsers} /var/www/insurance-uploads /var/log/insurance /var/backups/insurance
   sudo -u insurance-deploy mkdir -p /var/www/insurance/.ssh   # + authorized_keys tim
   ```
2. **PostgreSQL** (bila belum ada — operasi berisiko, wajib window): `sudo apt install -y postgresql`
   (listen localhost saja, bawaan). Lalu:
   ```bash
   sudo -u postgres psql -c "CREATE ROLE insurance_app LOGIN PASSWORD '<acak>';"
   sudo -u postgres psql -c "CREATE DATABASE insurance_prod OWNER insurance_app;"
   ```
   Jika PostgreSQL sudah dipakai pihak lain: jangan restart; cukup buat role & DB di atas.
3. **Chromium untuk PDF** (di folder sendiri):
   ```bash
   sudo npx -y playwright@1.56.1 install-deps chromium      # pustaka sistem + font (apt), sekali
   sudo -u insurance-deploy env PLAYWRIGHT_BROWSERS_PATH=/var/www/insurance/browsers npx -y playwright@1.56.1 install chromium
   ls /var/www/insurance/browsers/chromium-*/chrome-linux/chrome   # → PDF_CHROMIUM_PATH
   ```
4. **`.env`** di `/var/www/insurance/shared/.env` (chmod 600, pemilik insurance-deploy), dari `.env.example`:
   ```
   DATABASE_URL=postgresql://insurance_app:<acak>@127.0.0.1:5432/insurance_prod
   AUTH_SECRET=<openssl rand -base64 32>
   APP_URL=https://insurance.ide.asia
   INTERNAL_URL=http://127.0.0.1:3100
   OTP_BYPASS=0
   FONNTE_TOKEN=…   FONNTE_WEBHOOK_SECRET=<acak>   CRON_SECRET=<acak>
   SENDGRID_API_KEY=…   EMAIL_FROM=asuransi@ide.asia
   REDIS_URL=
   PDF_CHROMIUM_PATH=/var/www/insurance/browsers/chromium-XXXX/chrome-linux/chrome
   STORAGE_DIR=/var/www/insurance-uploads
   PENJADWAL=1
   TZ=Asia/Jakarta
   ```
5. **File deploy** dari repo (`deploy/`):
   ```bash
   sudo install -m 755 -o insurance-deploy deploy/pasang-rilis.sh deploy/backup.sh /var/www/insurance/bin/
   sudo cp deploy/insurance-app.service deploy/insurance-backup.{service,timer} /etc/systemd/system/
   sudo visudo -cf deploy/sudoers-insurance-deploy && sudo install -m 440 deploy/sudoers-insurance-deploy /etc/sudoers.d/insurance-deploy
   sudo cp deploy/logrotate-insurance /etc/logrotate.d/insurance
   sudo systemctl daemon-reload && sudo systemctl enable insurance-app insurance-backup.timer
   ```
6. **Rilis pertama** (lihat §6), lalu seed admin pertama sekali:
   ```bash
   cd /var/www/insurance/current && set -a && . ../../shared/.env && set +a && \
     ADMIN_NAMA="Ari Christian" ADMIN_NO_WA=0818xxxxxxx node seed.mjs
   ```
7. **Nginx + SSL** (setelah `dig +short insurance.ide.asia` = 72.60.74.202):
   ```bash
   sudo cp deploy/insurance.ide.asia.nginx /etc/nginx/sites-available/insurance.ide.asia
   sudo ln -sf /etc/nginx/sites-available/insurance.ide.asia /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d insurance.ide.asia -m arichrst@ide.asia --agree-tos --redirect --no-eff-email
   ```
8. **Fonnte**: atur webhook pesan masuk & status ke `https://insurance.ide.asia/api/webhook/fonnte?k=…` dan
   `…/fonnte-status?k=…`.
9. **Smoke test**: `curl -s https://insurance.ide.asia/api/sehat` → `{"ok":true,…}`; login OTP; ekspor 1 PDF;
   **dan** `curl -sI https://ide.asia` tetap 200, `pm2 status idea-website` (read-only) tetap online.

## 6. Rilis rutin

1. Di Mac: `git tag v1.0.0 && git push --tags` → GitHub Actions **Rilis** membangun `insurance-v1.0.0.tar.gz`
   (Linux x64, Node 20; berisi server Next mandiri, migrasi, `migrate.mjs`, `seed.mjs`). Bisa juga *Run workflow* manual.
2. Unduh artifact, `scp insurance-v1.0.0.tar.gz root@72.60.74.202:/tmp/`.
3. Di VPS (`ssh root@72.60.74.202`; window Senin–Kamis 22:00–01:00 atau akhir pekan dini hari):
   `sudo -u insurance-deploy -H /var/www/insurance/bin/pasang-rilis.sh /tmp/insurance-v1.0.0.tar.gz`
   → backup DB pra-rilis → migrasi → ganti symlink `current` → restart `insurance-app` → cek `/api/sehat`
   (gagal = otomatis kembali ke rilis sebelumnya). Rollback manual: `pasang-rilis.sh --rollback`.

Restart `insurance-app` hanya memengaruhi aplikasi ini; Nginx tidak perlu reload untuk rilis biasa.

## 7. Monitoring

- `GET /api/sehat` (publik, tanpa data bisnis): cek database + folder upload, versi rilis, uptime. 503 bila bermasalah.
- Pantau dari luar (mis. UptimeRobot/Better Stack, gratis) tiap 5 menit → alert email arichrst@ide.asia + WhatsApp.
- Kegagalan otomasi sudah dinotifikasi ke admin di aplikasi (menu Otomasi → log).
- `systemctl status insurance-app`, `tail -f /var/log/insurance/err.log`.

## 8. Backup

- Harian 02:30 WIB: `pg_dump` (format custom) + file upload (penuh tiap Minggu, harian hanya file 2 hari terakhir),
  disimpan 14 hari di `/var/backups/insurance/`. Juga otomatis sebelum setiap rilis.
- Salin ke luar VPS (wajib, VPS bisa hilang): mis. `rclone` ke Google Drive kantor dari Mac/NAS tiap minggu, atau
  tarik dengan `rsync -a root@72.60.74.202:/var/backups/insurance/ ~/Backup/insurance/`.
- Uji restore tiap bulan: `pg_restore --clean --no-owner -d <db_uji> db-….dump`.

## 9. Darurat

Jika ide.asia terganggu karena aplikasi ini: **jangan improvisasi** — WA PIC +62 818-0580-7807. Bila tidak ada
balasan 15 menit dan kritis: `sudo systemctl stop insurance-app`, hapus symlink
`/etc/nginx/sites-enabled/insurance.ide.asia`, lalu `sudo nginx -t && sudo systemctl reload nginx`. Catat kejadian
untuk post-mortem.
