#!/usr/bin/env bash
# Один скрипт: деплой Cloudflare Worker → секреты → TELEGRAM_API_RELAY_* в локальный .env → sync на VPS.
#
# Из этой машины автоматическая часть возможна только с учётными данными Cloudflare:
#   Способ A (удобнее): один раз выполните в терминале:  npx wrangler login
#   Способ B: API-токен (Workers Scripts: Edit):  export CLOUDFLARE_API_TOKEN="..."
#
# Запуск из корня репозитория:
#   bash deploy/bootstrap-telegram-relay.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF_DIR="$ROOT/deploy/cf-telegram-relay"
WRANGLER=(npx --yes wrangler@3)

if ! "${WRANGLER[@]}" whoami 2>/dev/null | grep -q .; then
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    echo "Не залогинены в Cloudflare:"
    echo "  • либо: npx wrangler login   (откроется браузер)"
    echo "  • либо: export CLOUDFLARE_API_TOKEN=...   (токен с правами Workers Scripts: Edit)"
    exit 1
  fi
fi

PICK() {
  local key="$1"
  local f line val
  for f in "$ROOT/.env.local" "$ROOT/.env"; do
    [[ -f "$f" ]] || continue
    line="$(grep -E "^${key}=" "$f" 2>/dev/null | head -n1)" || line=""
    [[ -z "$line" ]] && continue
    val="${line#*=}"
    val="${val#\"}"
    val="${val%\"}"
    val="${val#\'}"
    val="${val%\'}"
    printf '%s' "$val"
    return 0
  done
  return 1
}

BOT_TOKEN="$(PICK TELEGRAM_BOT_TOKEN || true)"
if [[ -z "$BOT_TOKEN" ]]; then
  echo "Не найден TELEGRAM_BOT_TOKEN в .env / .env.local"
  exit 1
fi

RELAY_SECRET="$(openssl rand -hex 32)"

echo "[1/5] wrangler deploy …"
DEPLOY_OUT="$("${WRANGLER[@]}" --config "$CF_DIR/wrangler.toml" deploy "$CF_DIR" 2>&1)" || {
  echo "$DEPLOY_OUT"
  exit 1
}
echo "$DEPLOY_OUT"

WORKER_URL="$(echo "$DEPLOY_OUT" | grep -Eo 'https://[a-zA-Z0-9_.-]+\.workers\.dev' | head -1 || true)"
if [[ -z "$WORKER_URL" ]]; then
  NAME="$(grep -E '^name\s*=' "$CF_DIR/wrangler.toml" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"
  SUB="$("${WRANGLER[@]}" whoami 2>/dev/null | grep -i 'workers.dev' | head -1 | sed -n 's/.*@[^[:space:]]*\.\([^[:space:]]*\)\.workers\.dev.*/\1/p' || true)"
  if [[ -n "$NAME" ]] && [[ -n "$SUB" ]]; then
    WORKER_URL="https://${NAME}.${SUB}.workers.dev"
  fi
fi
if [[ -z "$WORKER_URL" ]]; then
  echo "Не удалось распарсить URL воркера из вывода wrangler. Укажите вручную TELEGRAM_API_RELAY_URL в .env"
  exit 1
fi

echo "[2/5] secret BOT_TOKEN"
printf '%s' "$BOT_TOKEN" | "${WRANGLER[@]}" --config "$CF_DIR/wrangler.toml" secret put BOT_TOKEN

echo "[3/5] secret RELAY_SECRET"
printf '%s' "$RELAY_SECRET" | "${WRANGLER[@]}" --config "$CF_DIR/wrangler.toml" secret put RELAY_SECRET

echo "[4/5] обновляю $ROOT/.env (TELEGRAM_API_RELAY_*)"
python3 - "$ROOT/.env" "$WORKER_URL" "$RELAY_SECRET" <<'PY'
import re, pathlib, sys
path = pathlib.Path(sys.argv[1])
url = sys.argv[2]
secret = sys.argv[3]
if not path.is_file():
    print(f"нет файла {path}", file=sys.stderr)
    sys.exit(1)
raw = path.read_text(encoding="utf-8")

def strip_key(text: str, keys: tuple[str, ...]) -> str:
    out = []
    for line in text.splitlines(True):
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", line)
        if m and m.group(1) in keys:
            continue
        out.append(line)
    return "".join(out)

raw = strip_key(raw, ("TELEGRAM_API_RELAY_URL", "TELEGRAM_API_RELAY_SECRET"))
if raw and not raw.endswith("\n"):
    raw += "\n"
raw += f'TELEGRAM_API_RELAY_URL="{url}"\nTELEGRAM_API_RELAY_SECRET="{secret}"\n'
path.write_text(raw, encoding="utf-8")
print("локальный .env обновлён")
PY

echo "[5/5] sync на прод + pm2 reload"
bash "$ROOT/deploy/sync-telegram-env-to-prod.sh"

echo ""
echo "Готово. Релей: $WORKER_URL"
echo "Токен бота заново не печатаю — он в Cloudflare Secrets и на VPS в TELEGRAM_BOT_TOKEN."
