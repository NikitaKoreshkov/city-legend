#!/usr/bin/env bash
# Устанавливает корневые сертификаты НУЦ Минцифры для TLS к platform-api2.max.ru.
# Использование на сервере:
#   APP_DIR=/var/www/citylegend bash deploy/install-max-ca-cert.sh
set -euo pipefail

CERT_DIR="${CERT_DIR:-/etc/ssl/certs}"
BUNDLE="$CERT_DIR/russian_trusted_ca_bundle.pem"
ROOT_URL="https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt"
SUB_URL="https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt"
APP_DIR="${APP_DIR:-}"

echo "[max-ca] Downloading Russian Trusted CA certificates..."
TMP_ROOT="$(mktemp)"
TMP_SUB="$(mktemp)"
trap 'rm -f "$TMP_ROOT" "$TMP_SUB"' EXIT

curl -fsSL "$ROOT_URL" | sed 's/\r$//' > "$TMP_ROOT"
curl -fsSL "$SUB_URL" | sed 's/\r$//' > "$TMP_SUB"

# Node expects LF-only PEM; ensure newline between certs in the bundle.
{
  cat "$TMP_ROOT"
  echo
  cat "$TMP_SUB"
  echo
} > "$BUNDLE"
chmod 644 "$BUNDLE"
echo "[max-ca] Bundle written: $BUNDLE"

if command -v update-ca-certificates >/dev/null 2>&1; then
  SYS_DIR="/usr/local/share/ca-certificates/russian-trusted"
  mkdir -p "$SYS_DIR"
  sed 's/\r$//' "$TMP_ROOT" > "$SYS_DIR/russian_trusted_root_ca.crt"
  sed 's/\r$//' "$TMP_SUB" > "$SYS_DIR/russian_trusted_sub_ca.crt"
  update-ca-certificates
  echo "[max-ca] System trust store updated (update-ca-certificates)."
fi

set_env_var() {
  local file="$1" key="$2" val="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=\"${val}\"|" "$file"
  else
    echo "${key}=\"${val}\"" >> "$file"
  fi
}

if [[ -n "$APP_DIR" && -f "$APP_DIR/.env" ]]; then
  set_env_var "$APP_DIR/.env" "NODE_EXTRA_CA_CERTS" "$BUNDLE"
  set_env_var "$APP_DIR/.env" "MAX_API_BASE_URL" "https://platform-api2.max.ru"
  echo "[max-ca] Updated $APP_DIR/.env (NODE_EXTRA_CA_CERTS, MAX_API_BASE_URL)."
fi

echo "[max-ca] Verifying TLS to platform-api2.max.ru..."
HTTP_CODE="$(curl -sS --max-time 15 -o /dev/null -w "%{http_code}" -H "Authorization: test" "https://platform-api2.max.ru/me" || true)"
if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "200" ]]; then
  echo "[max-ca] TLS OK (HTTP $HTTP_CODE)."
else
  echo "[max-ca] ERROR: unexpected HTTP $HTTP_CODE — TLS or network problem" >&2
  exit 1
fi
