#!/usr/bin/env bash
# ============================================================
#  deploy.sh — full deployment to citylegend.art
#  Server : $SERVER_IP
#  Domain : citylegend.art
# ============================================================
set -euo pipefail

# ── Config ───────────────────────────────────────────────────
SERVER_IP="${SERVER_IP:?set SERVER_IP to the citylegend.art host}"
DOMAIN="citylegend.art"
APP_DIR="/var/www/citylegend"
SSH_KEY="$HOME/.ssh/kamni_deploy_rsa"
SSH_USER="root"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"
DB_NAME="citylegend"
DB_USER="citylegend"
DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
# AUTH_SECRET задаём после проверки SSH: иначе при каждом full deploy вылетали все сессии (кабинет, админка).
AUTH_SECRET=""
NODE_VERSION="20"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }

ssh_run() { ssh $SSH_OPTS "$SSH_USER@$SERVER_IP" "$@"; }

# ── Step 0: Prerequisites ─────────────────────────────────────
info "Checking SSH key..."
[ -f "$SSH_KEY" ] || die "SSH key not found: $SSH_KEY"
chmod 600 "$SSH_KEY"

info "Testing SSH connection..."
ssh_run "echo 'SSH OK'" || die "Cannot connect to $SERVER_IP"
success "SSH connection established."

# ── AUTH_SECRET: локальный .env → сервер → новый (без сброса сессий на каждом деплое) ──
_RESOLVE_ENV="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$_RESOLVE_ENV/.env" ]; then
  _AS=$(grep -E '^AUTH_SECRET=' "$_RESOLVE_ENV/.env" | cut -d= -f2- | tr -d '"' || true)
  if [ -n "$_AS" ]; then
    AUTH_SECRET="$_AS"
    info "AUTH_SECRET: из локального .env"
  fi
fi
if [ -z "${AUTH_SECRET:-}" ] && [ -f "$_RESOLVE_ENV/.env.local" ]; then
  _AS=$(grep -E '^AUTH_SECRET=' "$_RESOLVE_ENV/.env.local" | cut -d= -f2- | tr -d '"' || true)
  if [ -n "$_AS" ]; then
    AUTH_SECRET="$_AS"
    info "AUTH_SECRET: из .env.local"
  fi
fi
if [ -z "${AUTH_SECRET:-}" ]; then
  if _EXISTING=$(ssh_run "test -f $APP_DIR/.env && grep -E '^AUTH_SECRET=' $APP_DIR/.env | head -1 | cut -d= -f2-" 2>/dev/null | tr -d '"'); [ -n "$_EXISTING" ]; then
    AUTH_SECRET="$_EXISTING"
    info "AUTH_SECRET: сохранён с сервера (сессии не сбрасываются)"
  else
    AUTH_SECRET="$(openssl rand -base64 48 | head -c 48)"
    info "AUTH_SECRET: сгенерирован новый (первый деплой / не было на сервере)"
  fi
fi

# ── Step 1: Export local database ────────────────────────────
info "Exporting local PostgreSQL database..."
DUMP_FILE="/tmp/citylegend_db_$(date +%Y%m%d_%H%M%S).sql"

# Detect local DB URL
LOCAL_DB_URL="${DATABASE_URL:-}"
if [ -z "$LOCAL_DB_URL" ] && [ -f "$(dirname "$0")/.env" ]; then
  # grep без совпадений → exit 1; с set -e убили бы весь deploy, если в .env нет DATABASE_URL
  LOCAL_DB_URL=$(grep -E '^DATABASE_URL=' "$(dirname "$0")/.env" | cut -d= -f2- | tr -d '"' || true)
fi

if [ -n "$LOCAL_DB_URL" ]; then
  pg_dump "$LOCAL_DB_URL" \
    --no-owner --no-acl \
    --format=plain \
    --file="$DUMP_FILE" 2>/dev/null \
    && success "Database exported to $DUMP_FILE" \
    || warn "pg_dump failed — skipping DB export (tables will be created by initDatabase on first run)"
else
  warn "DATABASE_URL not set — skipping DB export. App will create empty tables on first run."
  DUMP_FILE=""
fi

# ── Step 2: Server provisioning ───────────────────────────────
info "Provisioning server (Node.js $NODE_VERSION, PostgreSQL, Nginx, PM2, Certbot)..."
ssh_run bash <<REMOTE
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# System update
apt-get update -qq
apt-get upgrade -y -qq

# Node.js $NODE_VERSION
if ! node --version 2>/dev/null | grep -q "^v$NODE_VERSION"; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
echo "Node: \$(node --version)  npm: \$(npm --version)"

# PM2
npm install -g pm2 --quiet 2>/dev/null || true
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# PostgreSQL
if ! dpkg -l postgresql 2>/dev/null | grep -q '^ii'; then
  apt-get install -y -qq postgresql postgresql-contrib
fi
systemctl enable --now postgresql

# Nginx
if ! dpkg -l nginx 2>/dev/null | grep -q '^ii'; then
  apt-get install -y -qq nginx
fi
systemctl enable --now nginx

# Certbot
if ! command -v certbot &>/dev/null; then
  apt-get install -y -qq certbot python3-certbot-nginx
fi

# Directories
mkdir -p $APP_DIR /var/log/pm2 /var/www/certbot
echo "Provisioning done"
REMOTE
success "Server provisioned."

# ── Step 3: Create DB user & database ────────────────────────
info "Setting up PostgreSQL on server..."
ssh_run bash <<REMOTE
set -euo pipefail
# Create role if not exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"

# On every full deploy a new DB_PASS is written to .env; the role may already
# exist from a previous run (CREATE is skipped) — then Postgres still has the
# old password. Always sync the role password so DATABASE_URL matches.
sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"

# Create database if not exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
echo "PostgreSQL setup done"
REMOTE
success "PostgreSQL configured: db=$DB_NAME user=$DB_USER"

# ── Step 4: Import database dump ─────────────────────────────
if [ -n "$DUMP_FILE" ] && [ -f "$DUMP_FILE" ]; then
  info "Uploading and importing database dump..."
  scp $SSH_OPTS "$DUMP_FILE" "$SSH_USER@$SERVER_IP:/tmp/db_import.sql"
  ssh_run bash <<REMOTE
set -euo pipefail
# Drop and recreate to get clean import
sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME}_old;" 2>/dev/null || true
PGPASSWORD='$DB_PASS' psql -U "$DB_USER" -h localhost -d "$DB_NAME" -f /tmp/db_import.sql 2>/dev/null \
  && echo "DB imported" \
  || echo "DB import had warnings (might be harmless)"
rm -f /tmp/db_import.sql
REMOTE
  success "Database imported."
  rm -f "$DUMP_FILE"
fi

# ── Step 5: Write .env on server ─────────────────────────────
info "Writing production .env..."

# Read bot tokens and T‑Bank keys from local .env (приоритет) или .env.local
LOCAL_ENV_FILE="$(dirname "$0")/.env"
LOCAL_ENV_LOCAL="$(dirname "$0")/.env.local"
TG_BOT_TOKEN=""
TG_WEBHOOK_SECRET=""
MAX_BOT_TOKEN=""
MAX_WEBHOOK_SECRET=""
TBANK_TERMINAL_KEY=""
TBANK_PASSWORD=""
TBANK_TAXATION="usn_income"
TBANK_VAT="none"
CDEK_CLIENT_ID=""
CDEK_CLIENT_SECRET=""
CDEK_SENDER_CITY_CODE="414"
CDEK_SENDER_CITY="Нижний Новгород"
CDEK_SENDER_NAME=""
CDEK_SENDER_PHONE=""
CDEK_SENDER_ADDRESS=""
CDEK_FIXED_DELIVERY_RUB="300"
CDEK_DELIVERY_DISABLED=""
TELEGRAM_HTTPS_PROXY=""
SMTP_USER=""
SMTP_PASS=""
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
NEXT_PUBLIC_MAX_BOT_LINK=""
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=""
ORDER_NOTIFY_TELEGRAM_CHAT_IDS=""
ORDER_NOTIFY_MAX_CHAT_IDS=""
TELEGRAM_API_RELAY_URL=""
TELEGRAM_API_RELAY_SECRET=""
read_local_env() {
  local key="$1"; local file="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"' || true
}
if [ -f "$LOCAL_ENV_FILE" ]; then
  TG_BOT_TOKEN=$(read_local_env TELEGRAM_BOT_TOKEN "$LOCAL_ENV_FILE")
  TG_WEBHOOK_SECRET=$(read_local_env TELEGRAM_WEBHOOK_SECRET "$LOCAL_ENV_FILE")
  MAX_BOT_TOKEN=$(read_local_env MAX_BOT_TOKEN "$LOCAL_ENV_FILE")
  MAX_WEBHOOK_SECRET=$(read_local_env MAX_WEBHOOK_SECRET "$LOCAL_ENV_FILE")
  TBANK_TERMINAL_KEY=$(read_local_env TBANK_TERMINAL_KEY "$LOCAL_ENV_FILE")
  TBANK_PASSWORD=$(read_local_env TBANK_PASSWORD "$LOCAL_ENV_FILE")
  v=$(read_local_env TBANK_TAXATION "$LOCAL_ENV_FILE"); [ -n "$v" ] && TBANK_TAXATION="$v"
  v=$(read_local_env TBANK_VAT "$LOCAL_ENV_FILE"); [ -n "$v" ] && TBANK_VAT="$v"
  v=$(read_local_env CDEK_CLIENT_ID "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_CLIENT_ID="$v"
  v=$(read_local_env CDEK_CLIENT_SECRET "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_CLIENT_SECRET="$v"
  v=$(read_local_env CDEK_SENDER_CITY_CODE "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_SENDER_CITY_CODE="$v"
  v=$(read_local_env CDEK_SENDER_CITY "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_SENDER_CITY="$v"
  v=$(read_local_env CDEK_SENDER_NAME "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_SENDER_NAME="$v"
  v=$(read_local_env CDEK_SENDER_PHONE "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_SENDER_PHONE="$v"
  v=$(read_local_env CDEK_SENDER_ADDRESS "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_SENDER_ADDRESS="$v"
  v=$(read_local_env CDEK_FIXED_DELIVERY_RUB "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_FIXED_DELIVERY_RUB="$v"
  v=$(read_local_env CDEK_DELIVERY_DISABLED "$LOCAL_ENV_FILE"); [ -n "$v" ] && CDEK_DELIVERY_DISABLED="$v"
  v=$(read_local_env TELEGRAM_HTTPS_PROXY "$LOCAL_ENV_FILE"); [ -n "$v" ] && TELEGRAM_HTTPS_PROXY="$v"
  v=$(read_local_env SMTP_USER "$LOCAL_ENV_FILE"); [ -n "$v" ] && SMTP_USER="$v"
  v=$(read_local_env SMTP_PASS "$LOCAL_ENV_FILE"); [ -n "$v" ] && SMTP_PASS="$v"
  v=$(read_local_env SMTP_HOST "$LOCAL_ENV_FILE"); [ -n "$v" ] && SMTP_HOST="$v"
  v=$(read_local_env SMTP_PORT "$LOCAL_ENV_FILE"); [ -n "$v" ] && SMTP_PORT="$v"
  v=$(read_local_env NEXT_PUBLIC_MAX_BOT_LINK "$LOCAL_ENV_FILE"); [ -n "$v" ] && NEXT_PUBLIC_MAX_BOT_LINK="$v"
  v=$(read_local_env NEXT_PUBLIC_TELEGRAM_BOT_USERNAME "$LOCAL_ENV_FILE"); [ -n "$v" ] && NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="$v"
  v=$(read_local_env ORDER_NOTIFY_TELEGRAM_CHAT_IDS "$LOCAL_ENV_FILE"); [ -n "$v" ] && ORDER_NOTIFY_TELEGRAM_CHAT_IDS="$v"
  v=$(read_local_env ORDER_NOTIFY_MAX_CHAT_IDS "$LOCAL_ENV_FILE"); [ -n "$v" ] && ORDER_NOTIFY_MAX_CHAT_IDS="$v"
  v=$(read_local_env TELEGRAM_API_RELAY_URL "$LOCAL_ENV_FILE"); [ -n "$v" ] && TELEGRAM_API_RELAY_URL="$v"
  v=$(read_local_env TELEGRAM_API_RELAY_SECRET "$LOCAL_ENV_FILE"); [ -n "$v" ] && TELEGRAM_API_RELAY_SECRET="$v"
fi
if [ -z "$TBANK_TERMINAL_KEY" ] && [ -f "$LOCAL_ENV_LOCAL" ]; then
  TBANK_TERMINAL_KEY=$(read_local_env TBANK_TERMINAL_KEY "$LOCAL_ENV_LOCAL")
  TBANK_PASSWORD=$(read_local_env TBANK_PASSWORD "$LOCAL_ENV_LOCAL")
fi
if [ -f "$LOCAL_ENV_LOCAL" ]; then
  [ -z "$CDEK_CLIENT_ID" ] && CDEK_CLIENT_ID=$(read_local_env CDEK_CLIENT_ID "$LOCAL_ENV_LOCAL")
  [ -z "$CDEK_CLIENT_SECRET" ] && CDEK_CLIENT_SECRET=$(read_local_env CDEK_CLIENT_SECRET "$LOCAL_ENV_LOCAL")
  if [ -z "$CDEK_SENDER_NAME" ]; then
    v=$(read_local_env CDEK_SENDER_NAME "$LOCAL_ENV_LOCAL"); [ -n "$v" ] && CDEK_SENDER_NAME="$v"
  fi
  if [ -z "$CDEK_SENDER_PHONE" ]; then
    v=$(read_local_env CDEK_SENDER_PHONE "$LOCAL_ENV_LOCAL"); [ -n "$v" ] && CDEK_SENDER_PHONE="$v"
  fi
  if [ -z "$CDEK_SENDER_ADDRESS" ]; then
    v=$(read_local_env CDEK_SENDER_ADDRESS "$LOCAL_ENV_LOCAL"); [ -n "$v" ] && CDEK_SENDER_ADDRESS="$v"
  fi
  [ -z "$ORDER_NOTIFY_TELEGRAM_CHAT_IDS" ] && { v=$(read_local_env ORDER_NOTIFY_TELEGRAM_CHAT_IDS "$LOCAL_ENV_LOCAL"); [ -n "$v" ] && ORDER_NOTIFY_TELEGRAM_CHAT_IDS="$v"; }
  [ -z "$ORDER_NOTIFY_MAX_CHAT_IDS" ] && { v=$(read_local_env ORDER_NOTIFY_MAX_CHAT_IDS "$LOCAL_ENV_LOCAL"); [ -n "$v" ] && ORDER_NOTIFY_MAX_CHAT_IDS="$v"; }
  [ -z "$TELEGRAM_API_RELAY_URL" ] && { v=$(read_local_env TELEGRAM_API_RELAY_URL "$LOCAL_ENV_LOCAL"); [ -n "$v" ] && TELEGRAM_API_RELAY_URL="$v"; }
  [ -z "$TELEGRAM_API_RELAY_SECRET" ] && { v=$(read_local_env TELEGRAM_API_RELAY_SECRET "$LOCAL_ENV_LOCAL"); [ -n "$v" ] && TELEGRAM_API_RELAY_SECRET="$v"; }
fi

ssh_run bash <<REMOTE
set -euo pipefail
cat > $APP_DIR/.env <<'ENV'
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
NEXT_PUBLIC_SITE_URL="https://$DOMAIN"
NEXT_PUBLIC_SITE_BRAND_NAME="City Legend"
NEXT_PUBLIC_CONTACT_EMAIL="contact@$DOMAIN"
NEXT_PUBLIC_LEGAL_ENTITY_NAME=""
NEXT_PUBLIC_LEGAL_INN=""
NEXT_PUBLIC_LEGAL_OGRN=""
NEXT_PUBLIC_LEGAL_ADDRESS=""
AUTH_SECRET="$AUTH_SECRET"
NODE_ENV="production"
AUCTIONS_SEED_SECRET="$(openssl rand -hex 16)"
CATALOG_RESTORE_SECRET="$(openssl rand -hex 16)"
TELEGRAM_BOT_TOKEN="$TG_BOT_TOKEN"
TELEGRAM_WEBHOOK_SECRET="$TG_WEBHOOK_SECRET"
MAX_BOT_TOKEN="$MAX_BOT_TOKEN"
MAX_WEBHOOK_SECRET="$MAX_WEBHOOK_SECRET"
MAX_API_BASE_URL="https://platform-api2.max.ru"
NODE_EXTRA_CA_CERTS="/etc/ssl/certs/russian_trusted_ca_bundle.pem"
TBANK_TERMINAL_KEY="$TBANK_TERMINAL_KEY"
TBANK_PASSWORD="$TBANK_PASSWORD"
TBANK_TAXATION="$TBANK_TAXATION"
TBANK_VAT="$TBANK_VAT"
CDEK_CLIENT_ID="$CDEK_CLIENT_ID"
CDEK_CLIENT_SECRET="$CDEK_CLIENT_SECRET"
CDEK_SENDER_CITY_CODE="$CDEK_SENDER_CITY_CODE"
CDEK_SENDER_CITY="$CDEK_SENDER_CITY"
CDEK_SENDER_NAME="$CDEK_SENDER_NAME"
CDEK_SENDER_PHONE="$CDEK_SENDER_PHONE"
CDEK_SENDER_ADDRESS="$CDEK_SENDER_ADDRESS"
CDEK_FIXED_DELIVERY_RUB="$CDEK_FIXED_DELIVERY_RUB"
CDEK_DELIVERY_DISABLED="$CDEK_DELIVERY_DISABLED"
TELEGRAM_HTTPS_PROXY="$TELEGRAM_HTTPS_PROXY"
SMTP_USER="$SMTP_USER"
SMTP_PASS="$SMTP_PASS"
SMTP_HOST="$SMTP_HOST"
SMTP_PORT="$SMTP_PORT"
NEXT_PUBLIC_MAX_BOT_LINK="$NEXT_PUBLIC_MAX_BOT_LINK"
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME"
ORDER_NOTIFY_TELEGRAM_CHAT_IDS="$ORDER_NOTIFY_TELEGRAM_CHAT_IDS"
ORDER_NOTIFY_MAX_CHAT_IDS="$ORDER_NOTIFY_MAX_CHAT_IDS"
TELEGRAM_API_RELAY_URL="$TELEGRAM_API_RELAY_URL"
TELEGRAM_API_RELAY_SECRET="$TELEGRAM_API_RELAY_SECRET"
ENV
chmod 600 $APP_DIR/.env
echo ".env written"
REMOTE
success ".env created on server."
if [ -z "$CDEK_CLIENT_ID" ] || [ -z "$CDEK_CLIENT_SECRET" ]; then
  warn " CDEK API ключи не заданы — поиск ПВЗ и автосоздание заказов СДЭК отключены. Доставка работает по фикс‑тарифу ${CDEK_FIXED_DELIVERY_RUB} ₽ с ручным вводом адреса."
fi
if [ -z "$TBANK_TERMINAL_KEY" ]; then
  warn " TBANK_* не заданы в локальном .env / .env.local — на сервере оплата через банк не включена (или вручную добавьте TBANK_TERMINAL_KEY и TBANK_PASSWORD в $APP_DIR/.env)."
else
  if [[ "$TBANK_TERMINAL_KEY" == *DEMO* ]]; then
    warn " TBANK_TERMINAL_KEY содержит DEMO — это тестовый терминал. Для боевой оплаты укажите в .env пару без DEMO из ЛК T‑Bank и задеплойте снова."
  else
    success " T‑Bank: подключён БОЕВОЙ терминал ($TBANK_TERMINAL_KEY) — реальные платежи активны."
  fi
fi
if [ -n "$TG_BOT_TOKEN" ]; then
  if [ -z "$TELEGRAM_HTTPS_PROXY" ]; then
    warn " Telegram‑бот: TELEGRAM_BOT_TOKEN задан, но TELEGRAM_HTTPS_PROXY пуст. На сервере с российским IP Роскомнадзор блокирует api.telegram.org — бот не сможет получать сообщения. Задайте в .env (формат: http://user:pass@host:port) и задеплойте снова."
  else
    success " Telegram‑бот: используется HTTPS‑прокси для api.telegram.org."
  fi
fi

# ── Step 6: Rsync project files ───────────────────────────────
info "Syncing project files to server (this may take a while)..."
rsync -az --delete \
  -e "ssh $SSH_OPTS" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env*' \
  --exclude='deploy.sh' \
  --exclude='*.sql' \
  --exclude='public/uploads' \
  "$(dirname "$0")/" \
  "$SSH_USER@$SERVER_IP:$APP_DIR/"
success "Files synced."

# ── Step 7: Install deps & build ─────────────────────────────
info "Installing npm dependencies and building Next.js..."
ssh_run bash <<REMOTE
set -euo pipefail
cd $APP_DIR

# Load env for build
set -a; source .env; set +a

npm ci --include=dev --prefer-offline --quiet
npm run build

# Standalone: public + единый каталог static (symlink, см. deploy/sync-next-static.sh)
cp -r public .next/standalone/
bash deploy/sync-next-static.sh "$APP_DIR"

# Replace uploads directory in standalone with a symlink to the real public/uploads
# This ensures uploaded files (images/videos) are always served by Nginx correctly
# even though Next.js standalone changes process.cwd() to .next/standalone/
rm -rf .next/standalone/public/uploads
ln -s /var/www/citylegend/public/uploads .next/standalone/public/uploads
echo "Symlink: .next/standalone/public/uploads -> public/uploads"

echo "Build done"
REMOTE
success "Build completed."

# ── Step 8: Configure Nginx ───────────────────────────────────
info "Configuring Nginx..."
scp $SSH_OPTS \
  "$(dirname "$0")/deploy/nginx.conf" \
  "$SSH_USER@$SERVER_IP:/etc/nginx/sites-available/$DOMAIN"

ssh_run bash <<REMOTE
set -euo pipefail
rm -f /etc/nginx/sites-enabled/default

NEED_CERT=0
[ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ] && NEED_CERT=1
[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]     && NEED_CERT=1

if [ "\$NEED_CERT" = "1" ]; then
  # Ещё нет сертификата — активируем только HTTP-временный конфиг для ACME challenge
  rm -f /etc/nginx/sites-enabled/$DOMAIN
  cat > /etc/nginx/sites-available/${DOMAIN}_tmp <<'TMPCONF'
server {
    listen 80;
    server_name citylegend.art www.citylegend.art;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
TMPCONF
  ln -sf /etc/nginx/sites-available/${DOMAIN}_tmp /etc/nginx/sites-enabled/${DOMAIN}_tmp
  nginx -t && systemctl reload nginx
  echo "Nginx HTTP-only (pre-cert)"
else
  # Сертификат есть — включаем полный HTTPS конфиг
  ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
  rm -f /etc/nginx/sites-enabled/${DOMAIN}_tmp
  nginx -t && systemctl reload nginx
  echo "Nginx HTTPS active"
fi
REMOTE
success "Nginx configured."

# ── Step 9: SSL certificate ───────────────────────────────────
info "Obtaining Let's Encrypt SSL certificate..."
ssh_run bash <<REMOTE
set -euo pipefail
NEED_CERT=0
[ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ] && NEED_CERT=1
[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]     && NEED_CERT=1

if [ "\$NEED_CERT" = "1" ]; then
  certbot certonly \
    --webroot -w /var/www/certbot \
    -d $DOMAIN -d www.$DOMAIN \
    --non-interactive \
    --agree-tos \
    --email contact@$DOMAIN \
    --no-eff-email
  echo "Certificate obtained"
else
  echo "Certificate already exists, renewing if needed..."
  certbot renew --quiet 2>/dev/null || true
fi
REMOTE
success "SSL certificate ready."

# ── Step 10: Enable HTTPS Nginx config ───────────────────────
ssh_run bash <<REMOTE
set -euo pipefail
rm -f /etc/nginx/sites-enabled/${DOMAIN}_tmp
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
nginx -t && systemctl reload nginx
echo "HTTPS Nginx active"
REMOTE

# ── Step 11: Start app with PM2 ──────────────────────────────
info "Starting application with PM2..."
# Copy ecosystem config
scp $SSH_OPTS "$(dirname "$0")/ecosystem.config.js" "$SSH_USER@$SERVER_IP:$APP_DIR/"

ssh_run bash <<REMOTE
set -euo pipefail
cd $APP_DIR

chmod +x deploy/install-max-ca-cert.sh
APP_DIR=$APP_DIR bash deploy/install-max-ca-cert.sh

# Load env vars for PM2 (after cert script may patch .env)
set -a; source .env; set +a

# Stop old instances if any (приложение + tg-polling) — чистый рестарт, без stale workers
pm2 delete citylegend 2>/dev/null || true
pm2 delete tg-polling 2>/dev/null || true

# Start fresh с обновлёнными env
pm2 start ecosystem.config.js --update-env
pm2 save
systemctl enable pm2-root 2>/dev/null || true

sleep 3
pm2 status
echo "App started"
REMOTE
success "Application running with PM2."

# ── Step 12: Certbot auto-renewal cron ────────────────────────
info "Setting up certificate auto-renewal..."
ssh_run bash <<REMOTE
(crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -
echo "Cron renewal set"
REMOTE

# ── Done ──────────────────────────────────────────────────────
echo ""
success "════════════════════════════════════════════════════════"
success " Deployment complete!"
success " Site    : https://$DOMAIN"
success " Admin   : https://$DOMAIN/admin"
success " DB      : $DB_NAME @ localhost"
success " PM2 app : citylegend"
success ""
warn  " SAVE THESE CREDENTIALS:"
warn  "   DB_USER : $DB_USER"
warn  "   DB_PASS : $DB_PASS"
warn  "   AUTH_SECRET is written in $APP_DIR/.env on server"
success "════════════════════════════════════════════════════════"
