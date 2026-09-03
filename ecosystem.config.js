const fs = require('fs');
const path = require('path');

/** Подмешиваем /var/www/citylegend/.env в env процесса (TBANK_*, DATABASE_URL, UPLOADS_DIR и т.д.). */
function parseEnvFile(filePath) {
  const out = {};
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return out;
  }
  for (let line of raw.split(/\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const dotenv = parseEnvFile(path.join(__dirname, '.env'));

const apps = [
  {
    name: 'citylegend',
    script: '.next/standalone/server.js',
    cwd: '/var/www/citylegend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOSTNAME: '127.0.0.1',
      ...dotenv,
    },
    error_file: '/var/log/pm2/citylegend-error.log',
    out_file: '/var/log/pm2/citylegend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  },
];

// Telegram-бот: запускаем long-polling процессом, только если задан токен.
// Российские IP не получают webhook-и от Telegram, поэтому используем polling-прокси.
if (dotenv.TELEGRAM_BOT_TOKEN) {
  apps.push({
    name: 'tg-polling',
    script: 'deploy/tg-polling.js',
    cwd: '/var/www/citylegend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      ...dotenv,
    },
    error_file: '/var/log/pm2/tg-polling-error.log',
    out_file: '/var/log/pm2/tg-polling-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  });
}

if (dotenv.BOT_CRON_SECRET) {
  apps.push({
    name: 'bots-cron',
    script: 'deploy/bots-cron.js',
    cwd: '/var/www/citylegend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '128M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      ...dotenv,
    },
    error_file: '/var/log/pm2/bots-cron-error.log',
    out_file: '/var/log/pm2/bots-cron-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  });
}

module.exports = { apps };
