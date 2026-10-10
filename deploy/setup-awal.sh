#!/usr/bin/env bash
# Setup pertama Rekap Asuransi di VPS bersama ide.asia (72.60.74.202).
# Jalankan SEKALI sebagai user ber-sudo (bukan root langsung juga boleh):
#   sudo bash setup-awal.sh /tmp/insurance-<versi>.tar.gz
# Aman diulang: langkah yang sudah beres dilewati. Mengikuti VPS Tenant Brief:
#   - tidak menyentuh port 3000, PM2 idea-website, /var/www/idea-website, MongoDB, nginx.conf utama
#   - nginx hanya `nginx -t && systemctl reload nginx`, certbot hanya --nginx
set -euo pipefail

PAKET="${1:?pakai: sudo bash setup-awal.sh /tmp/insurance-<versi>.tar.gz}"
PAKET=$(readlink -f "$PAKET")
APP=insurance
DIR=/var/www/$APP
UP=/var/www/$APP-uploads
LOG=/var/log/$APP
BAK=/var/backups/$APP
USR=$APP-deploy
PORT=3100
DOMAIN=insurance.ide.asia
EMAIL=arichrst@ide.asia
VPS_IP=72.60.74.202
PW_VER=1.56.1
SINI=$(cd "$(dirname "$0")" && pwd)

hijau() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
kuning() { printf '\033[33m! %s\033[0m\n' "$*"; }
merah() { printf '\033[31m✗ %s\033[0m\n' "$*"; }
judul() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
tanya() { local j; read -r -p "$1 [y/N] " j; [[ "$j" =~ ^[yY] ]]; }
ide_asia() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://ide.asia || echo 000; }

[ "$(id -u)" = 0 ] || { merah "Jalankan dengan sudo"; exit 1; }
[ -f "$PAKET" ] || { merah "Paket tidak ditemukan: $PAKET"; exit 1; }

# ───────────────────────── 0. Pemeriksaan ─────────────────────────
judul "0. Pemeriksaan awal"
[ "$(uname -m)" = x86_64 ] || { merah "Paket dibuat untuk x86_64, VPS ini $(uname -m)"; exit 1; }
NODE=$(command -v node || true)
[ -n "$NODE" ] || { merah "Node.js tidak ada di PATH. Jangan pasang/upgrade Node tanpa koordinasi (dipakai ide.asia)."; exit 1; }
NODE_MAJOR=$("$NODE" -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { merah "Node $("$NODE" -v) terlalu lama (butuh ≥ 20)"; exit 1; }
hijau "Node $("$NODE" -v) di $NODE"
if ss -tlnH "sport = :$PORT" | grep -q .; then
  if systemctl is-active -q $APP-app 2>/dev/null; then hijau "Port $PORT dipakai $APP-app (setup ulang)"; else merah "Port $PORT sudah dipakai proses lain:"; ss -tlnp "sport = :$PORT"; exit 1; fi
else hijau "Port $PORT kosong"; fi
command -v nginx >/dev/null || { merah "Nginx tidak ada"; exit 1; }
STATUS_IDE=$(ide_asia)
hijau "ide.asia saat ini: HTTP $STATUS_IDE"
echo "Waktu sekarang: $(TZ=Asia/Jakarta date '+%A %H:%M WIB')"
kuning "Window paling aman: Sabtu–Minggu 02.00–06.00 WIB (install PostgreSQL termasuk operasi berisiko)."
tanya "Lanjutkan setup sekarang?" || exit 0

# ───────────────────────── 1. Catatan kondisi sebelum install ─────────────────────────
judul "1. Catatan kondisi VPS sebelum install"
PRE=/var/backups/$APP-preinstall
if [ ! -d "$PRE" ]; then
  mkdir -p "$PRE"
  {
    date; uname -a; free -m; df -h /
    echo "--- port"; ss -tlnp
    echo "--- nginx sites-enabled"; ls -la /etc/nginx/sites-enabled/
    echo "--- service"; systemctl list-units --type=service --state=running --no-pager
  } > "$PRE/kondisi.txt" 2>&1
  cp -a /etc/nginx/sites-available "$PRE/nginx-sites-available"
  cp -a /etc/nginx/sites-enabled "$PRE/nginx-sites-enabled"
  hijau "Tersimpan di $PRE"
else hijau "Sudah ada: $PRE"; fi

# ───────────────────────── 2. User & folder ─────────────────────────
judul "2. User $USR & folder"
id "$USR" >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --shell /bin/bash "$USR"
install -d -o "$USR" -g "$USR" -m 750 "$DIR" "$DIR/releases" "$DIR/shared" "$DIR/bin" "$DIR/browsers" "$UP" "$LOG" "$BAK"
hijau "$DIR, $UP, $LOG, $BAK"

# ───────────────────────── 3. PostgreSQL ─────────────────────────
judul "3. PostgreSQL"
if ! command -v psql >/dev/null || ! systemctl list-unit-files | grep -q '^postgresql'; then
  kuning "PostgreSQL belum terpasang. Install = apt-get (listen localhost:5432 saja)."
  tanya "Install PostgreSQL sekarang?" || { merah "Butuh PostgreSQL. Berhenti."; exit 1; }
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib >/dev/null
  systemctl enable --now postgresql
fi
hijau "PostgreSQL $(sudo -u postgres psql -tAc 'show server_version')"
ENVF=$DIR/shared/.env
if [ -f "$ENVF" ]; then
  hijau ".env sudah ada — kredensial database dipakai ulang"
else
  DBPASS=$(openssl rand -hex 24)
  if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='${APP}_app'" | grep -q 1; then
    sudo -u postgres psql -qc "alter role ${APP}_app with login password '$DBPASS'"
  else
    sudo -u postgres psql -qc "create role ${APP}_app login password '$DBPASS'"
  fi
  sudo -u postgres psql -tAc "select 1 from pg_database where datname='${APP}_prod'" | grep -q 1 ||
    sudo -u postgres psql -qc "create database ${APP}_prod owner ${APP}_app"
  hijau "Database ${APP}_prod, role ${APP}_app"
fi

# ───────────────────────── 4. Chromium untuk PDF ─────────────────────────
judul "4. Chromium (ekspor PDF)"
CHROME=$(find "$DIR/browsers" -path '*chrome-linux*/chrome' -type f 2>/dev/null | head -1)
if [ -z "$CHROME" ]; then
  kuning "Memasang pustaka sistem Chromium (apt) + Chromium Playwright $PW_VER ke $DIR/browsers"
  if tanya "Lanjut pasang Chromium?"; then
    npx -y "playwright@$PW_VER" install-deps chromium >/dev/null || kuning "install-deps gagal (distro?) — lanjut, cek ekspor PDF nanti"
    sudo -u "$USR" env HOME="$DIR" PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers" npx -y "playwright@$PW_VER" install chromium >/dev/null
    CHROME=$(find "$DIR/browsers" -path '*chrome-linux*/chrome' -type f | head -1)
  else kuning "Dilewati — ekspor PDF tidak akan jalan sampai Chromium dipasang"; fi
fi
[ -n "$CHROME" ] && hijau "Chromium: $CHROME"

# ───────────────────────── 5. .env ─────────────────────────
judul "5. Konfigurasi (.env)"
if [ ! -f "$ENVF" ]; then
  read -r -p "FONNTE_TOKEN (kosongkan dulu bila belum ada — OTP lalu dicetak di $LOG/out.log): " FT
  read -r -p "SENDGRID_API_KEY (boleh kosong): " SG
  cat > "$ENVF" <<EOF
DATABASE_URL='postgresql://${APP}_app:${DBPASS}@127.0.0.1:5432/${APP}_prod'
AUTH_SECRET='$(openssl rand -base64 32)'
APP_URL='https://$DOMAIN'
INTERNAL_URL='http://127.0.0.1:$PORT'
OTP_BYPASS='0'
FONNTE_TOKEN='$FT'
FONNTE_DRY_RUN='0'
FONNTE_WEBHOOK_SECRET='$(openssl rand -hex 16)'
PENJADWAL='1'
CRON_SECRET='$(openssl rand -hex 24)'
SENDGRID_API_KEY='$SG'
EMAIL_FROM='asuransi@ide.asia'
EMAIL_DRY_RUN='$([ -n "$SG" ] && echo 0 || echo 1)'
REDIS_URL=''
PDF_CHROMIUM_PATH='$CHROME'
EKSPOR_WORKER='1'
STORAGE_DIR='$UP'
TZ='Asia/Jakarta'
EOF
  chown "$USR:$USR" "$ENVF"; chmod 600 "$ENVF"
  hijau "Dibuat $ENVF (rahasia diacak otomatis)"
else
  [ -n "$CHROME" ] && ! grep -q "^PDF_CHROMIUM_PATH='$CHROME'" "$ENVF" && sed -i "s#^PDF_CHROMIUM_PATH=.*#PDF_CHROMIUM_PATH='$CHROME'#" "$ENVF"
  hijau "Memakai $ENVF yang ada"
fi

# ───────────────────────── 6. Service, backup, sudoers, logrotate ─────────────────────────
judul "6. systemd, backup harian, sudoers, logrotate"
install -m 755 -o "$USR" -g "$USR" "$SINI/pasang-rilis.sh" "$SINI/backup.sh" "$DIR/bin/"
install -m 644 "$SINI/$APP-app.service" "$SINI/$APP-backup.service" "$SINI/$APP-backup.timer" /etc/systemd/system/
# Pakai Node yang sudah ada di VPS (tidak memasang/mengubah Node milik ide.asia)
sed -i "s#^ExecStart=.*#ExecStart=$NODE server.js#" /etc/systemd/system/$APP-app.service
sudo -u "$USR" "$NODE" -v >/dev/null || { merah "User $USR tidak bisa menjalankan $NODE (Node dipasang per-user?). Hubungi PIC."; exit 1; }
visudo -cqf "$SINI/sudoers-$USR" && install -m 440 "$SINI/sudoers-$USR" "/etc/sudoers.d/$USR"
install -m 644 "$SINI/logrotate-$APP" "/etc/logrotate.d/$APP"
systemctl daemon-reload
systemctl enable -q $APP-app $APP-backup.timer
systemctl start $APP-backup.timer
hijau "$APP-app.service & $APP-backup.timer (02.30 WIB)"

# ───────────────────────── 7. Rilis ─────────────────────────
judul "7. Pasang rilis $(basename "$PAKET" .tar.gz)"
cp "$PAKET" /tmp/ 2>/dev/null || true
chmod 644 "/tmp/$(basename "$PAKET")"
if [ -e "$DIR/releases/$(basename "$PAKET" .tar.gz)" ] && [ "$(readlink -f $DIR/current)" = "$DIR/releases/$(basename "$PAKET" .tar.gz)" ]; then
  hijau "Rilis ini sudah aktif"
  systemctl is-active -q $APP-app || systemctl start $APP-app
else
  sudo -u "$USR" -H env PATH="$(dirname "$NODE"):/usr/bin:/bin" bash -c "cd $DIR && $DIR/bin/pasang-rilis.sh /tmp/$(basename "$PAKET")"
fi

# ───────────────────────── 8. Admin pertama ─────────────────────────
judul "8. Admin pertama"
JML_ADMIN=$(sudo -u postgres psql -d ${APP}_prod -tAc "select count(*) from users where role='admin'" 2>/dev/null || echo 0)
if [ "$JML_ADMIN" = 0 ]; then
  read -r -p "Nama admin: " AN
  read -r -p "No WhatsApp admin (08…): " AW
  sudo -u "$USR" -H env PATH="$(dirname "$NODE"):/usr/bin:/bin" bash -c "cd $DIR/current && set -a && . $ENVF && set +a && ADMIN_NAMA='$AN' ADMIN_NO_WA='$AW' node seed.mjs"
else
  sudo -u "$USR" -H env PATH="$(dirname "$NODE"):/usr/bin:/bin" bash -c "cd $DIR/current && set -a && . $ENVF && set +a && node seed.mjs" >/dev/null
  hijau "Sudah ada $JML_ADMIN admin (template, otomasi & panduan dipastikan ada)"
fi

# ───────────────────────── 9. Nginx ─────────────────────────
judul "9. Nginx site $DOMAIN (reload, bukan restart)"
SITE=/etc/nginx/sites-available/$DOMAIN
if [ ! -f "$SITE" ]; then
  install -m 644 "$SINI/$DOMAIN.nginx" "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/
fi
if nginx -t 2>/tmp/nginx-uji.txt; then
  systemctl reload nginx
  hijau "nginx -t OK, di-reload"
else
  merah "nginx -t GAGAL — site $DOMAIN dilepas lagi, nginx tidak di-reload"
  cat /tmp/nginx-uji.txt
  rm -f "/etc/nginx/sites-enabled/$DOMAIN"
  exit 1
fi

# ───────────────────────── 10. SSL ─────────────────────────
judul "10. SSL (certbot --nginx)"
IP_DNS=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  hijau "Sertifikat sudah ada"
elif [ "$IP_DNS" = "$VPS_IP" ]; then
  certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --redirect --no-eff-email -n
  hijau "HTTPS aktif"
else
  kuning "DNS $DOMAIN belum mengarah ke $VPS_IP (sekarang: ${IP_DNS:-tidak ada})."
  kuning "Tambahkan A record  insurance → $VPS_IP  lalu jalankan ulang script ini (aman diulang)."
  kuning "Sebelum HTTPS aktif, login tidak bisa (cookie sesi wajib HTTPS)."
fi

# ───────────────────────── 11. Smoke test ─────────────────────────
judul "11. Cek akhir"
curl -fsS "http://127.0.0.1:$PORT/api/sehat" && echo && hijau "Aplikasi sehat di 127.0.0.1:$PORT"
STATUS_IDE2=$(ide_asia)
if [ "$STATUS_IDE2" = "$STATUS_IDE" ]; then hijau "ide.asia tetap HTTP $STATUS_IDE2"; else merah "ide.asia berubah: $STATUS_IDE → $STATUS_IDE2 — cek segera!"; fi
echo
echo "Log aplikasi : tail -f $LOG/out.log $LOG/err.log"
echo "Rilis berikut: sudo -u $USR -H $DIR/bin/pasang-rilis.sh /tmp/insurance-<versi>.tar.gz"
echo "Webhook Fonnte: https://$DOMAIN/api/webhook/fonnte?k=\$(grep FONNTE_WEBHOOK_SECRET $ENVF)"
