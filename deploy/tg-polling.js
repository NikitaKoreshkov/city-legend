/**
 * Telegram Long-Polling Proxy
 *
 * Since the server's Russian IP can't receive incoming connections from Telegram,
 * we pull updates ourselves and forward them to the local Next.js webhook handler.
 *
 * ВАЖНО: allowed_updates должен включать callback_query — иначе inline-кнопки (каталог) не работают.
 */

const https = require('https');
const http = require('http');
const dns = require('dns').promises;
const { URL } = require('url');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
const LOCAL_PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_URL = `http://127.0.0.1:${LOCAL_PORT}/api/bots/telegram/webhook`;
const TG_API = 'https://api.telegram.org';
const POLL_TIMEOUT = 25;
// Опциональный HTTPS-прокси для api.telegram.org (если сервер в РФ — Telegram заблокирован).
// Пример значения: http://user:pass@proxy.example.com:8080
const PROXY_URL =
  process.env.TELEGRAM_HTTPS_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  '';
const RELAY_URL = (process.env.TELEGRAM_API_RELAY_URL || '').trim().replace(/\/$/, '');
const RELAY_SECRET = (process.env.TELEGRAM_API_RELAY_SECRET || '').trim();

/** Сообщения + нажатия на inline-кнопки (каталог и т.д.) */
const ALLOWED_UPDATES = encodeURIComponent(JSON.stringify(['message', 'callback_query']));

if (!BOT_TOKEN) {
  console.error('[TG-Poll] TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

let offset = 0;
let isRunning = true;

/**
 * GET через HTTPS-прокси (CONNECT-туннель). Используем когда задана PROXY_URL —
 * на серверах в РФ это единственный способ дойти до api.telegram.org.
 */
function httpsGetViaProxy(targetUrl) {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const proxy = new URL(PROXY_URL);
    const auth = proxy.username
      ? 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`).toString('base64')
      : null;

    const connectReq = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 8080,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
      headers: auth ? { 'Proxy-Authorization': auth } : {},
      timeout: 15000,
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed: HTTP ${res.statusCode}`));
        return;
      }
      const tunnelReq = https.request(
        {
          host: target.hostname,
          port: Number(target.port) || 443,
          method: 'GET',
          path: target.pathname + target.search,
          socket,
          agent: false,
        },
        (resp) => {
          let data = '';
          resp.on('data', (d) => { data += d; });
          resp.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON: ' + data.slice(0, 200)));
            }
          });
        }
      );
      tunnelReq.on('error', reject);
      tunnelReq.setTimeout(35000, () => {
        tunnelReq.destroy(new Error('Tunnel request timeout'));
      });
      tunnelReq.end();
    });

    connectReq.on('error', reject);
    connectReq.on('timeout', () => {
      connectReq.destroy(new Error('Proxy CONNECT timeout'));
    });
    connectReq.end();
  });
}

function directHttpsGetJson(urlString) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlString, (res) => {
      let data = '';
      res.on('data', (d) => {
        data += d;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(35000, () => {
      req.destroy(new Error('Request timeout'));
    });
  });
}

/** Обход когда маршрут до hostname «глушится», но отдельные A/AAAA доступны по SNI Host */
async function tgGetHttpsSniFallback(pathPart) {
  const fullPath = `/bot${BOT_TOKEN}${pathPart}`;
  /** @type {string[]} */
  let ips = [];
  try {
    ips = ips.concat(await dns.resolve4('api.telegram.org'));
  } catch {
    /* ignore */
  }
  try {
    ips = ips.concat(await dns.resolve6('api.telegram.org'));
  } catch {
    /* ignore */
  }
  if (ips.length === 0) {
    throw new Error('No DNS records for api.telegram.org');
  }
  let lastErr;
  for (const ip of ips) {
    try {
      const data = await new Promise((resolve, reject) => {
        const req = https.get(
          {
            hostname: ip,
            port: 443,
            servername: 'api.telegram.org',
            path: fullPath,
            headers: { Host: 'api.telegram.org' },
          },
          (res) => {
            let d = '';
            res.on('data', (c) => {
              d += c;
            });
            res.on('end', () => {
              try {
                resolve(JSON.parse(d));
              } catch (e) {
                reject(e);
              }
            });
          }
        );
        req.on('error', reject);
        req.setTimeout(28000, () => {
          req.destroy(new Error('SNI IP timeout'));
        });
      });
      return data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function tgGet(path) {
  const url = `${TG_API}/bot${BOT_TOKEN}${path}`;

  if (RELAY_URL && RELAY_SECRET) {
    try {
      const pathClean = path.replace(/^\//, '');
      const res = await fetch(`${RELAY_URL}/v1`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RELAY_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: pathClean, method: 'GET' }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Relay HTTP ${res.status}: ${text.slice(0, 180)}`);
      }
      return JSON.parse(text);
    } catch (e) {
      const d =
        e && typeof e === 'object'
          ? [e.code, e.message].filter(Boolean).join(' ')
          : String(e);
      console.warn('[TG-Poll] Relay failed:', d, '— trying fallbacks');
    }
  }

  if (PROXY_URL) {
    return httpsGetViaProxy(url);
  }

  try {
    return await directHttpsGetJson(url);
  } catch (e1) {
    const d1 =
      e1 && typeof e1 === 'object'
        ? [e1.code, e1.message].filter(Boolean).join(' ')
        : String(e1);
    console.warn('[TG-Poll] Direct Telegram failed:', d1, '— try SNI per-IP');
    return tgGetHttpsSniFallback(path);
  }
}

function forwardUpdate(update) {
  return new Promise((resolve) => {
    const body = JSON.stringify(update);
    const opts = {
      hostname: '127.0.0.1',
      port: LOCAL_PORT,
      path: '/api/bots/telegram/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(SECRET ? { 'x-telegram-bot-api-secret-token': SECRET } : {}),
      },
    };

    const req = http.request(opts, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', (err) => {
      console.error('[TG-Poll] Forward error:', err.message);
      resolve();
    });
    req.setTimeout(30000, () => {
      req.destroy();
      resolve();
    });
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function deleteWebhook() {
  try {
    const res = await tgGet('/deleteWebhook?drop_pending_updates=false');
    console.log('[TG-Poll] Webhook deleted:', res.description);
  } catch (e) {
    const detail =
      e && typeof e === 'object'
        ? [e.code, e.message, e.syscall].filter(Boolean).join(' ') || String(e)
        : String(e);
    console.warn('[TG-Poll] Could not delete webhook:', detail || '(unknown)');
  }
}

function logUpdate(update) {
  const id = update.update_id;
  if (update.message?.text) {
    console.log(`[TG-Poll] Processing update ${id} "${update.message.text.slice(0, 80)}"`);
  } else if (update.callback_query?.data) {
    console.log(`[TG-Poll] Processing update ${id} callback:${update.callback_query.data}`);
  } else {
    console.log(`[TG-Poll] Processing update ${id}`);
  }
}

async function poll() {
  console.log('[TG-Poll] Starting long-poll loop (offset=' + offset + ')');

  while (isRunning) {
    try {
      const data = await tgGet(
        `/getUpdates?timeout=${POLL_TIMEOUT}&offset=${offset}&allowed_updates=${ALLOWED_UPDATES}`
      );

      if (!data.ok) {
        console.warn('[TG-Poll] getUpdates not ok:', JSON.stringify(data));
        await sleep(5000);
        continue;
      }

      const updates = data.result || [];
      if (updates.length > 0) {
        console.log(`[TG-Poll] Got ${updates.length} update(s)`);
      }

      for (const update of updates) {
        logUpdate(update);
        await forwardUpdate(update);
        offset = update.update_id + 1;
      }
    } catch (err) {
      if (!isRunning) break;
      const detail =
        err && typeof err === 'object'
          ? [err.code, err.message, err.syscall].filter(Boolean).join(' ') ||
            String(err)
          : String(err);
      console.error('[TG-Poll] Error:', detail || '(unknown)');
      await sleep(5000);
    }
  }

  console.log('[TG-Poll] Stopped.');
}

process.on('SIGTERM', () => {
  isRunning = false;
});
process.on('SIGINT', () => {
  isRunning = false;
});

(async () => {
  console.log('[TG-Poll] Bot polling proxy started');
  console.log('[TG-Poll] Forwarding to:', WEBHOOK_URL);
  if (RELAY_URL && RELAY_SECRET) {
    console.log('[TG-Poll] Using Cloudflare API relay:', RELAY_URL);
  } else if (PROXY_URL) {
    console.log('[TG-Poll] Using HTTPS proxy:', PROXY_URL.replace(/(\/\/)([^@]+)@/, '$1***@'));
  } else {
    console.log(
      '[TG-Poll] No relay/proxy. Options: TELEGRAM_API_RELAY_URL+SECRET (cf-telegram-relay), or TELEGRAM_HTTPS_PROXY; else direct+SNI fallback.'
    );
  }

  await deleteWebhook();
  await sleep(1000);
  await poll();
})();
