#!/usr/bin/env bash
# Bangun paket rilis untuk VPS (Linux x64): server Next mandiri + aset + migrasi + seed.
# Jalankan di Linux x64 (GitHub Actions "Rilis" atau mesin Linux), bukan di Mac — paket berisi node_modules.
# Hasil: rilis/insurance-<versi>.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."
VERSI="${1:-$(git describe --tags --always --dirty 2>/dev/null || date +%Y%m%d%H%M)}"
OUT="rilis/insurance-$VERSI"
rm -rf "$OUT" && mkdir -p "$OUT"

npm run build
cp -r .next/standalone/. "$OUT/"
mkdir -p "$OUT/.next" && cp -r .next/static "$OUT/.next/static"
[ -d public ] && cp -r public "$OUT/public"
cp -r drizzle "$OUT/drizzle"

# Skrip migrasi & seed dibundel jadi satu file (tidak butuh tsx/drizzle-kit di server)
npx esbuild scripts/migrate.ts --bundle --platform=node --format=esm --target=node20 --outfile="$OUT/migrate.mjs" \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"
npx esbuild scripts/seed.ts --bundle --platform=node --format=esm --target=node20 --outfile="$OUT/seed.mjs" \
  --alias:@=./src --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"
echo "$VERSI" > "$OUT/VERSI"
rm -f "$OUT/.env" "$OUT/.env.local"

tar -C rilis -czf "rilis/insurance-$VERSI.tar.gz" "insurance-$VERSI"
rm -rf "$OUT"
echo "Paket: rilis/insurance-$VERSI.tar.gz ($(du -h "rilis/insurance-$VERSI.tar.gz" | cut -f1))"
