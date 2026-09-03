#!/usr/bin/env bash
# Деплой кода на прод без смены БД и без перезаписи .env.
# Требуется SSH-ключ по умолчанию: ~/.ssh/kamni_deploy_rsa (или SSH_KEY в окружении).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_IP="${SERVER_IP:?set SERVER_IP to the citylegend.art host}"
DOMAIN="citylegend.art"
APP_DIR="/var/www/citylegend"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/kamni_deploy_rsa}"
SSH_USER="root"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

[[ -f "$SSH_KEY" ]] || { echo "SSH key not found: $SSH_KEY"; exit 1; }

echo "[1/3] rsync..."
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env*' \
  --exclude='deploy.sh' \
  --exclude='*.sql' \
  --exclude='public/uploads' \
  "$SCRIPT_DIR/" \
  "$SSH_USER@$SERVER_IP:$APP_DIR/"

echo "[2/3] nginx + сборка + pm2..."
scp "${SSH_OPTS[@]}" "$SCRIPT_DIR/deploy/nginx.conf" "$SSH_USER@$SERVER_IP:/etc/nginx/sites-available/$DOMAIN"
scp "${SSH_OPTS[@]}" "$SCRIPT_DIR/ecosystem.config.js" "$SSH_USER@$SERVER_IP:$APP_DIR/ecosystem.config.js"

# Patch SMTP vars in server .env if present locally but missing on server
_read_env() { grep -E "^${1}=" "$2" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true; }
_LOCAL_ENV="$SCRIPT_DIR/.env"
if [[ -f "$_LOCAL_ENV" ]]; then
  for _KEY in NEXT_PUBLIC_GTM_ID NEXT_PUBLIC_YANDEX_METRIKA_ID NEXT_PUBLIC_GA_MEASUREMENT_ID SMTP_USER SMTP_PASS SMTP_HOST SMTP_PORT RESEND_API_KEY RESEND_FROM NEXT_PUBLIC_MAX_BOT_LINK NEXT_PUBLIC_TELEGRAM_BOT_USERNAME \
    ORDER_NOTIFY_TELEGRAM_CHAT_IDS ORDER_NOTIFY_MAX_CHAT_IDS CONCIERGE_NOTIFY_TELEGRAM_CHAT_IDS CONCIERGE_NOTIFY_MAX_CHAT_IDS TELEGRAM_API_RELAY_URL TELEGRAM_API_RELAY_SECRET \
    BOT_CRON_SECRET CDEK_CLIENT_ID CDEK_CLIENT_SECRET CDEK_SENDER_CITY_CODE CDEK_SENDER_CITY CDEK_SENDER_NAME CDEK_SENDER_PHONE CDEK_SENDER_ADDRESS CDEK_FIXED_DELIVERY_RUB \
    MAX_API_BASE_URL NODE_EXTRA_CA_CERTS; do
    _VAL="$(_read_env "$_KEY" "$_LOCAL_ENV")"
    if [[ -n "$_VAL" ]]; then
      ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" \
        "grep -q '^${_KEY}=' $APP_DIR/.env 2>/dev/null && sed -i 's|^${_KEY}=.*|${_KEY}=\"${_VAL}\"|' $APP_DIR/.env || echo '${_KEY}=\"${_VAL}\"' >> $APP_DIR/.env"
    fi
  done
fi

ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" bash -s <<REMOTE
set -euo pipefail
nginx -t && systemctl reload nginx || true
cd $APP_DIR
chmod +x deploy/install-max-ca-cert.sh deploy/health-watch.sh
APP_DIR=$APP_DIR bash deploy/install-max-ca-cert.sh
npm ci --include=dev --prefer-offline --quiet
set -a; source .env; set +a
npm run build
# Snapshot для отката (без полного git на сервере)
RELEASES_DIR=$APP_DIR/releases
mkdir -p "\$RELEASES_DIR"
STAMP=\$(date +%Y%m%d-%H%M%S)
if [[ -d .next/standalone ]]; then
  mkdir -p "\$RELEASES_DIR/\$STAMP"
  cp -a .next/standalone "\$RELEASES_DIR/\$STAMP/standalone" 2>/dev/null || true
  ln -sfn "\$RELEASES_DIR/\$STAMP" "\$RELEASES_DIR/current"
  ls -1dt "\$RELEASES_DIR"/20* 2>/dev/null | tail -n +4 | xargs -r rm -rf
fi
cp -r public .next/standalone/
bash deploy/sync-next-static.sh "$APP_DIR"
rm -rf .next/standalone/public/uploads
ln -sfn $APP_DIR/public/uploads .next/standalone/public/uploads
# Убрать PSD с публичной раздачи, если остались
find $APP_DIR/public -type f -iname '*.psd' -delete 2>/dev/null || true
pm2 delete citylegend 2>/dev/null || true
pm2 delete tg-polling 2>/dev/null || true
pm2 delete bots-cron 2>/dev/null || true
# Ensure cron secret exists for scheduled broadcasts + triggers
if ! grep -q '^BOT_CRON_SECRET=' .env 2>/dev/null || grep -q '^BOT_CRON_SECRET=$' .env 2>/dev/null || grep -q '^BOT_CRON_SECRET=""' .env 2>/dev/null; then
  _CRON_SECRET=\$(openssl rand -hex 24)
  grep -q '^BOT_CRON_SECRET=' .env 2>/dev/null && sed -i "s|^BOT_CRON_SECRET=.*|BOT_CRON_SECRET=\"\${_CRON_SECRET}\"|" .env || echo "BOT_CRON_SECRET=\"\${_CRON_SECRET}\"" >> .env
  echo "[deploy] BOT_CRON_SECRET generated on server"
fi
pm2 start $APP_DIR/ecosystem.config.js --update-env
pm2 save
pm2 status citylegend
REMOTE

echo "[3/3] Готово: https://$DOMAIN"
