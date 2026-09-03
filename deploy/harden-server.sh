#!/usr/bin/env bash
# Server hardening for citylegend.art — run on the VPS as root.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/citylegend}"

echo "=== admin cleanup ==="
set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env"
set +a
cd "$APP_DIR"
node deploy/cleanup-admin-users.js

echo "=== pm2-logrotate ==="
pm2 install pm2-logrotate || true
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

echo "=== health cron ==="
chmod +x "$APP_DIR/deploy/health-watch.sh"
(crontab -l 2>/dev/null | grep -v health-watch.sh || true; echo "*/5 * * * * $APP_DIR/deploy/health-watch.sh >> /var/log/citylegend-health.log 2>&1") | crontab -
crontab -l | grep health || true
"$APP_DIR/deploy/health-watch.sh" && echo health-watch-ok || echo health-watch-fail

echo "=== SSH harden ==="
if [[ ! -s /root/.ssh/authorized_keys ]]; then
  echo "FATAL: /root/.ssh/authorized_keys empty — abort SSH harden"
  exit 1
fi
cp -a /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-citylegend-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
EOF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo "=== UFW ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

echo "=== listen check ==="
ss -lntp | grep -E ':3000|:80|:443' || true

echo "=== apt upgradable ==="
apt-get update -qq
echo "upgradable_lines=$(apt list --upgradable 2>/dev/null | wc -l)"

echo "=== DONE ==="
