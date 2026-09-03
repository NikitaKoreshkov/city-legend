#!/usr/bin/env bash
# Синхронизация .next/static для nginx и standalone (один источник правды).
set -euo pipefail

APP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

if [[ ! -d .next/static ]]; then
  echo "sync-next-static: .next/static not found — run npm run build first" >&2
  exit 1
fi

mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
ln -sfn ../../static .next/standalone/.next/static

CHUNK_COUNT="$(find .next/static/chunks -maxdepth 1 -name '*.js' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${CHUNK_COUNT:-0}" -eq 0 ]]; then
  echo "sync-next-static: no JS chunks in .next/static/chunks" >&2
  exit 1
fi

echo "sync-next-static: OK ($CHUNK_COUNT chunks, standalone -> .next/static symlink)"
