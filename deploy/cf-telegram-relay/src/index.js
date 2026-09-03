/**
 * Релей Telegram Bot API через Cloudflare (запросы к api.telegram.org идут извне РФ).
 * Сервер в РФ шлёт сюда JSON или multipart на /v1 и Bearer RELAY_SECRET.
 */
export default {
  /**
   * @param {Request} request
   * @param {{ BOT_TOKEN: string; RELAY_SECRET: string }} env
   */
  async fetch(request, env) {
    const okAuth =
      request.headers.get('Authorization') === `Bearer ${env.RELAY_SECRET || ''}`;
    if (!okAuth || !env.BOT_TOKEN || !env.RELAY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/v1') {
      return new Response('Not Found', { status: 404 });
    }

    const contentType = request.headers.get('Content-Type') || '';

    /** Multipart: sendPhoto и т.п. — путь только имя метода (без query) */
    if (contentType.includes('multipart/form-data')) {
      const methodPath = request.headers.get('X-Telegram-Path') || '';
      if (!/^[a-zA-Z]+$/.test(methodPath)) {
        return new Response('Bad X-Telegram-Path', { status: 400 });
      }
      const target = `https://api.telegram.org/bot${env.BOT_TOKEN}/${methodPath}`;
      const buf = await request.arrayBuffer();
      const r = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: buf,
      });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: {
          'Content-Type': r.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response('Bad JSON', { status: 400 });
    }

    const apiPath = payload.path;
    const httpMethod = (payload.method || 'GET').toUpperCase();
    if (
      !apiPath ||
      typeof apiPath !== 'string' ||
      apiPath.includes('..') ||
      apiPath.length > 8192
    ) {
      return new Response('Bad path', { status: 400 });
    }
    const clean = apiPath.startsWith('/') ? apiPath.slice(1) : apiPath;
    const methodOnly = (clean.split(/[/?]/)[0] ?? '').replace(/[^a-zA-Z]/g, '') || clean;

    /** JSON + base64 files → multipart on Cloudflare (надёжная отправка фото с RU VPS) */
    if (payload.files && typeof payload.files === 'object' && payload.fields) {
      if (!/^[a-zA-Z]+$/.test(methodOnly)) {
        return new Response('Bad path for files upload', { status: 400 });
      }
      const form = new FormData();
      for (const [key, val] of Object.entries(payload.fields)) {
        if (val !== undefined && val !== null) form.append(key, String(val));
      }
      for (const [key, fileSpec] of Object.entries(payload.files)) {
        if (!fileSpec || typeof fileSpec !== 'object' || !fileSpec.base64) continue;
        const bytes = Uint8Array.from(atob(fileSpec.base64), (c) => c.charCodeAt(0));
        form.append(
          key,
          new Blob([bytes], { type: fileSpec.mime || 'application/octet-stream' }),
          fileSpec.filename || 'file'
        );
      }
      const target = `https://api.telegram.org/bot${env.BOT_TOKEN}/${methodOnly}`;
      const r = await fetch(target, { method: 'POST', body: form });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: {
          'Content-Type': r.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    const target = `https://api.telegram.org/bot${env.BOT_TOKEN}/${clean}`;
    const init = { method: httpMethod };
    if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
      if (payload.json !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(payload.json);
      }
    }
    const r = await fetch(target, init);
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: {
        'Content-Type': r.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  },
};
