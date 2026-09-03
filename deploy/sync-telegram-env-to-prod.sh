#!/usr/bin/env bash
# Подмешивает в /var/www/citylegend/.env только переменные Telegram из локального репозитория.
# TBANK / DATABASE_URL и остальное на сервере не трогает.
#
# TELEGRAM_HTTPS_PROXY: если в локальном .env пусто — строка на сервере не меняется.
# Если задано — перезаписывается. Пример:
#   TELEGRAM_HTTPS_PROXY=http://user:pass@proxy.example.com:8123
#
# Использование:
#   bash deploy/sync-telegram-env-to-prod.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/kamni_deploy_rsa}"
SSH_USER="${SSH_USER:-root}"
SERVER_IP="${SERVER_IP:?set SERVER_IP to the citylegend.art host}"
APP_DIR="${APP_DIR:-/var/www/citylegend}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

[[ -f "$SSH_KEY" ]] || { echo "SSH key not found: $SSH_KEY"; exit 1; }

pick_local() {
  local key="$1"
  local f
  for f in "$SCRIPT_DIR/.env.local" "$SCRIPT_DIR/.env"; do
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

TOKEN="$(pick_local TELEGRAM_BOT_TOKEN || true)"
SECRET="$(pick_local TELEGRAM_WEBHOOK_SECRET || true)"
PROXY="$(pick_local TELEGRAM_HTTPS_PROXY || true)"

if [[ -z "$TOKEN" ]] || [[ -z "$SECRET" ]]; then
  echo "В локальном .env или .env.local не найдены TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET"
  exit 1
fi

if [[ -z "$PROXY" ]]; then
  echo "[WARN] TELEGRAM_HTTPS_PROXY в локальном .env пуст — на сервере существующее значение прокси не перезаписывается."
fi

PATCH_JSON="$(python3 -c '
import json, os
patch = {"TELEGRAM_BOT_TOKEN": os.environ["T"], "TELEGRAM_WEBHOOK_SECRET": os.environ["S"]}
p = os.environ.get("P", "").strip()
if p:
    patch["TELEGRAM_HTTPS_PROXY"] = p
print(json.dumps(patch))
')" 2>/dev/null || PATCH_JSON=""
export T="$TOKEN" S="$SECRET" P="$PROXY"
PATCH_JSON="$(T="$TOKEN" S="$SECRET" P="$PROXY" python3 <<'PY'
import json, os
patch = {"TELEGRAM_BOT_TOKEN": os.environ["T"], "TELEGRAM_WEBHOOK_SECRET": os.environ["S"]}
p = os.environ.get("P", "").strip()
if p:
    patch["TELEGRAM_HTTPS_PROXY"] = p
print(json.dumps(patch))
PY
)"

B64_PATCH="$(printf '%s' "$PATCH_JSON" | base64 | tr -d '\n')"

ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SERVER_IP}" bash -s <<REMOTE
set -euo pipefail
PATCH_JSON="\$(echo "$B64_PATCH" | base64 -d)"
export PATCH_JSON
python3 <<'PYCODE'
from __future__ import annotations

import json, os, pathlib, re

patch = json.loads(os.environ["PATCH_JSON"])
env_path = pathlib.Path("$APP_DIR/.env")
if not env_path.is_file():
    raise SystemExit(f"Missing {env_path}")

raw = env_path.read_text(encoding="utf-8")
lines = raw.splitlines(keepends=True)


def quoted_line(key: str, val: str) -> str:
    esc = val.replace("\\\\", "\\\\").replace('"', '\\"')
    nl = "\\n" if not lines or lines[-1].endswith("\\n") else ""
    return f'{key}="{esc}"\\n'


def strip_key_assign(line: str) -> str | None:
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", line.rstrip("\\n"))
    return m.group(1) if m else None


keys_in_patch = set(patch.keys())
done = set()
out: list[str] = []

for line in lines:
    k = strip_key_assign(line)
    if k and k in keys_in_patch:
        if k == "TELEGRAM_HTTPS_PROXY" and k not in patch:
            out.append(line)
            continue
        v = patch.get(k)
        if v is None or v == "":
            out.append(line)
            continue
        out.append(quoted_line(k, str(v)))
        done.add(k)
    else:
        out.append(line)

for k, v in patch.items():
    if k not in done and str(v).strip() != "":
        if not raw.endswith("\\n"):
            out.append("\\n")
        out.append(quoted_line(k, str(v)))

env_path.write_text("".join(out), encoding="utf-8")
os.chmod(env_path, 0o600)
print("Merged Telegram keys:", ", ".join(sorted(patch.keys())))
PYCODE
cd "$APP_DIR"
pm2 reload ecosystem.config.js --update-env
pm2 save
echo "PM2 reloaded with updated .env"
REMOTE

echo "Готово. Проверка: ssh ... 'pm2 env 1 | grep TELEGRAM_HTTPS' (id tg-polling может быть другим)"
