#!/usr/bin/env node
/**
 * Периодически вызывает /api/admin/bots/cron (отложенные рассылки + триггеры).
 * PM2: добавьте в ecosystem.config.js или crontab: */15 * * * *
 */
const http = require('http');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.BOT_CRON_SECRET || '';
const INTERVAL_MS = Number(process.env.BOT_CRON_INTERVAL_MS || 15 * 60 * 1000);

if (!SECRET) {
  console.error('[bots-cron] BOT_CRON_SECRET is not set');
  process.exit(1);
}

function tick() {
  const opts = {
    hostname: '127.0.0.1',
    port: PORT,
    path: `/api/admin/bots/cron?secret=${encodeURIComponent(SECRET)}`,
    method: 'POST',
    timeout: 120000,
  };
  const req = http.request(opts, (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      console.log(`[bots-cron] ${new Date().toISOString()} status=${res.statusCode} ${data.slice(0, 200)}`);
    });
  });
  req.on('error', (e) => console.error('[bots-cron]', e.message));
  req.end();
}

console.log(`[bots-cron] every ${INTERVAL_MS / 1000}s → localhost:${PORT}`);
tick();
setInterval(tick, INTERVAL_MS);
