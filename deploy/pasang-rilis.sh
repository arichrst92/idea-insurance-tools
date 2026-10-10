#!/usr/bin/env bash
# Pasang paket rilis di VPS (dijalankan sebagai insurance-deploy):
#   ./pasang-rilis.sh /tmp/insurance-v1.0.0.tar.gz
# Ekstrak ke releases/<versi> → backup → migrasi DB → arahkan symlink current → restart insurance-app → cek sehat.
# Gagal cek sehat = otomatis kembali ke rilis sebelumnya. Rollback manual: ./pasang-rilis.sh --rollback
set -euo pipefail
APP=/var/www/insurance
SERVICE=insurance-app
PORT=3100
cd "$APP"

restart() { sudo /usr/bin/systemctl restart "$SERVICE"; }
sehat() {
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/sehat" && return 0
    sleep 1
  done
  return 1
}

if [ "${1:-}" = "--rollback" ]; then
  kini=$(readlink -f current)
  sebelum=$(ls -1dt "$APP"/releases/*/ | sed 's:/$::' | grep -vx "$kini" | head -1)
  [ -n "$sebelum" ] || { echo "Tidak ada rilis sebelumnya"; exit 1; }
  ln -sfn "$sebelum" current.tmp && mv -T current.tmp current
  restart && sehat && echo "Rollback ke $sebelum OK"
  exit 0
fi

PAKET="${1:?pakai: pasang-rilis.sh <paket.tar.gz>}"
NAMA=$(basename "$PAKET" .tar.gz)
[ -e "releases/$NAMA" ] && { echo "releases/$NAMA sudah ada"; exit 1; }
mkdir -p releases
tar -C releases -xzf "$PAKET"

echo "→ Backup DB sebelum migrasi"
"$APP/bin/backup.sh" pra-rilis

echo "→ Migrasi"
( cd "releases/$NAMA" && set -a && . "$APP/shared/.env" && set +a && node migrate.mjs )

LAMA=$(readlink -f current 2>/dev/null || true)
ln -sfn "$APP/releases/$NAMA" current.tmp && mv -T current.tmp current
echo "→ Restart $SERVICE"
restart
if sehat; then
  echo "✓ $NAMA aktif di 127.0.0.1:$PORT"
  # Simpan 3 rilis terakhir
  ls -1dt releases/*/ | tail -n +4 | xargs -r rm -rf
else
  echo "✗ Cek sehat gagal — kembali ke $LAMA (migrasi DB tetap; migrasi selalu bersifat menambah)"
  [ -n "$LAMA" ] && ln -sfn "$LAMA" current.tmp && mv -T current.tmp current && restart
  exit 1
fi
