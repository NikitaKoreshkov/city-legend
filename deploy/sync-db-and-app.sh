#!/usr/bin/env bash
# Полный деплой: дамп локальной PostgreSQL → прод, rsync кода, сборка, PM2.
# НЕ трогает /var/www/citylegend/.env (TBANK, пароли БД, AUTH_SECRET остаются).
# public/uploads на сервере не синхронизируется и не удаляется.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_IP="${SERVER_IP:?set SERVER_IP to the citylegend.art host}"
DOMAIN="citylegend.art"
APP_DIR="/var/www/citylegend"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/kamni_deploy_rsa}"
SSH_USER="root"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"

LOCAL_ENV="$SCRIPT_DIR/.env"
DUMP="/tmp/citylegend_sync_$(date +%Y%m%d_%H%M%S).sql"

[[ -f "$SSH_KEY" ]] || { echo "SSH key not found: $SSH_KEY"; exit 1; }

LOCAL_DB_URL="${DATABASE_URL:-}"
if [[ -z "$LOCAL_DB_URL" && -f "$LOCAL_ENV" ]]; then
  LOCAL_DB_URL=$(grep -E '^DATABASE_URL=' "$LOCAL_ENV" | cut -d= -f2- | tr -d '"' || true)
fi
[[ -n "$LOCAL_DB_URL" ]] || { echo "Задайте DATABASE_URL в окружении или в .env"; exit 1; }
# pg_dump не принимает ?schema=public в URI
LOCAL_DB_URL="${LOCAL_DB_URL%%\?*}"

echo "[1/5] pg_dump (локальная БД)..."
pg_dump "$LOCAL_DB_URL" --no-owner --no-acl --format=plain --file="$DUMP"

echo "[2/5] Загрузка дампа на сервер..."
scp $SSH_OPTS "$DUMP" "$SSH_USER@$SERVER_IP:/tmp/citylegend_sync_import.sql"
rm -f "$DUMP"

ssh $SSH_OPTS "$SSH_USER@$SERVER_IP" bash -s <<REMOTE
set -euo pipefail
pm2 stop citylegend || true
DB_NAME="citylegend"
DB_USER="citylegend"
sudo -u postgres psql -tc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\$DB_NAME' AND pid <> pg_backend_pid();" || true
sudo -u postgres dropdb "\$DB_NAME" 2>/dev/null || sudo -u postgres psql -c "DROP DATABASE IF EXISTS \$DB_NAME WITH (FORCE);"
sudo -u postgres createdb -O "\$DB_USER" "\$DB_NAME"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE \$DB_NAME TO \$DB_USER;"
set -a
source $APP_DIR/.env
set +a
DB_URL="\${DATABASE_URL%%\\?*}"
psql "\$DB_URL" -v ON_ERROR_STOP=1 -f /tmp/citylegend_sync_import.sql
rm -f /tmp/citylegend_sync_import.sql
echo "Импорт БД завершён."
REMOTE

echo "[3/5] rsync кода..."
rsync -az --delete \
  -e "ssh $SSH_OPTS" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env*' \
  --exclude='deploy.sh' \
  --exclude='*.sql' \
  --exclude='public/uploads' \
  "$SCRIPT_DIR/" \
  "$SSH_USER@$SERVER_IP:$APP_DIR/"

echo "[4/5] nginx + сборка..."
scp $SSH_OPTS "$SCRIPT_DIR/deploy/nginx.conf" "$SSH_USER@$SERVER_IP:/etc/nginx/sites-available/$DOMAIN"
scp $SSH_OPTS "$SCRIPT_DIR/ecosystem.config.js" "$SSH_USER@$SERVER_IP:$APP_DIR/ecosystem.config.js"

ssh $SSH_OPTS "$SSH_USER@$SERVER_IP" bash -s <<REMOTE
set -euo pipefail
nginx -t && systemctl reload nginx
cd $APP_DIR
npm ci --include=dev --prefer-offline --quiet
set -a; source .env; set +a
npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/static
rm -rf .next/standalone/public/uploads
ln -sfn $APP_DIR/public/uploads .next/standalone/public/uploads
pm2 start $APP_DIR/ecosystem.config.js 2>/dev/null || pm2 reload ecosystem.config.js --update-env
pm2 save
pm2 status citylegend
REMOTE

echo "[5/5] Готово: https://$DOMAIN"
