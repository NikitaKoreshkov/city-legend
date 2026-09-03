#!/usr/bin/env bash
# Проверка https://citylegend.art/api/health + алерт в Telegram при падении.
# Установка cron (на сервере):
#   */5 * * * * /var/www/citylegend/deploy/health-watch.sh >> /var/log/citylegend-health.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/citylegend}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
HEALTH_URL="${HEALTH_URL:-https://citylegend.art/api/health}"
STATE_FILE="${STATE_FILE:-/tmp/citylegend-health-state}"
TIMEOUT_SEC="${TIMEOUT_SEC:-15}"

_read_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

TG_TOKEN="$(_read_env TELEGRAM_BOT_TOKEN)"
CHAT_IDS_RAW="$(_read_env ORDER_NOTIFY_TELEGRAM_CHAT_IDS)"
if [[ -z "$CHAT_IDS_RAW" ]]; then
  CHAT_IDS_RAW="$(_read_env CONCIERGE_NOTIFY_TELEGRAM_CHAT_IDS)"
fi

notify_tg() {
  local text="$1"
  [[ -n "$TG_TOKEN" && -n "$CHAT_IDS_RAW" ]] || return 0
  IFS=',' read -ra IDS <<< "$CHAT_IDS_RAW"
  for id in "${IDS[@]}"; do
    id="$(echo "$id" | tr -d '[:space:]')"
    [[ -n "$id" ]] || continue
    curl -fsS -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
      -d "chat_id=${id}" \
      --data-urlencode "text=${text}" \
      -d "disable_web_page_preview=true" >/dev/null 2>&1 || true
  done
}

http_code="$(curl -sS -o /tmp/citylegend-health-body -w '%{http_code}' --max-time "$TIMEOUT_SEC" "$HEALTH_URL" || echo '000')"
body="$(cat /tmp/citylegend-health-body 2>/dev/null || true)"
prev="$(cat "$STATE_FILE" 2>/dev/null || echo 'unknown')"

if [[ "$http_code" == "200" ]] && echo "$body" | grep -q '"ok":true'; then
  echo "ok" > "$STATE_FILE"
  if [[ "$prev" == "fail" ]]; then
    notify_tg "✅ citylegend.art /api/health recovered ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  fi
  exit 0
fi

echo "fail" > "$STATE_FILE"
echo "[health-watch] FAIL http=${http_code} body=${body:0:200}" >&2
if [[ "$prev" != "fail" ]]; then
  notify_tg "🚨 citylegend.art /api/health FAILED (HTTP ${http_code}) at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
exit 1
