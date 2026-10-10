#!/usr/bin/env bash
# Backup Rekap Asuransi: dump Postgres + arsip file upload.
# Dipanggil insurance-backup.timer (02:30 WIB) atau manual: backup.sh [label]
# Simpan 14 hari di /var/backups/insurance; salin ke luar VPS (lihat docs/DEPLOY-VPS.md §8).
set -euo pipefail
TUJUAN=/var/backups/insurance
LABEL="${1:-harian}"
STEMPEL=$(date +%Y%m%d-%H%M)
set -a; . /var/www/insurance/shared/.env; set +a
mkdir -p "$TUJUAN"
umask 077

pg_dump --format=custom --no-owner "$DATABASE_URL" > "$TUJUAN/db-$STEMPEL-$LABEL.dump"
# File upload: arsip penuh tiap Minggu & tiap pra-rilis; hari lain hanya file 2 hari terakhir.
if [ "$(date +%u)" = 7 ] || [ "$LABEL" != harian ]; then
  tar -C /var/www -czf "$TUJUAN/uploads-$STEMPEL-penuh.tar.gz" insurance-uploads
else
  (cd /var/www && find insurance-uploads -type f -mtime -2 -print0 | tar --null -czf "$TUJUAN/uploads-$STEMPEL-baru.tar.gz" -T -)
fi

find "$TUJUAN" -type f -mtime +14 -delete
echo "Backup $STEMPEL ($LABEL) selesai: $(du -sh "$TUJUAN" | cut -f1) total"
