/**
 * Outbound Telegram Bot API:
 * 1) Cloudflare Worker relay (RU-friendly, see deploy/cf-telegram-relay)
 * 2) HTTPS proxy TELEGRAM_HTTPS_PROXY / HTTPS_PROXY (undici)
 * 3) Direct fetch (undici)
 */
import { fetch as undiciFetch, ProxyAgent } from 'undici';

const TG_ORIGIN = 'https://api.telegram.org';

export function resolveTelegramRelay(): { url: string; secret: string } | undefined {
  const url = process.env.TELEGRAM_API_RELAY_URL?.trim().replace(/\/$/, '');
  const secret = process.env.TELEGRAM_API_RELAY_SECRET?.trim() ?? '';
  if (url && secret) return { url, secret };
  return undefined;
}

async function formBodyToMultipart(
  body: FormData
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const req = new Request('http://telegram-relay.local/', { method: 'POST', body });
  const contentType = req.headers.get('content-type') ?? '';
  const buffer = await req.arrayBuffer();
  return { buffer, contentType };
}

function isFormDataBody(body: unknown): body is FormData {
  return (
    body != null &&
    typeof body === 'object' &&
    typeof (body as FormData).append === 'function'
  );
}

/** Send photo bytes via relay JSON+base64 (works from RU VPS). */
export async function telegramRelaySendPhotoBuffer(
  platformUserId: string,
  buffer: Buffer,
  caption: string
): Promise<{ ok: boolean; description?: string; status: number; raw: string }> {
  const relay = resolveTelegramRelay();
  if (!relay) throw new Error('Telegram relay not configured');

  const r = await fetch(`${relay.url}/v1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${relay.secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: 'sendPhoto',
      method: 'POST',
      fields: {
        chat_id: platformUserId,
        caption,
        parse_mode: 'HTML',
      },
      files: {
        photo: {
          base64: buffer.toString('base64'),
          filename: 'qr.png',
          mime: 'image/png',
        },
      },
    }),
  });

  const raw = await r.text();
  let ok = r.ok;
  let description: string | undefined;
  try {
    const data = JSON.parse(raw) as { ok?: boolean; description?: string };
    if (data.ok === false) {
      ok = false;
      description = data.description;
    } else if (data.ok === true) {
      ok = true;
    }
  } catch {
    /* non-json */
  }
  return { ok, description, status: r.status, raw };
}

function resolveProxyUri(): string | undefined {
  const fromTg =
    process.env.TELEGRAM_HTTPS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.https_proxy?.trim();
  return fromTg || undefined;
}

let proxyCache: { agent: ProxyAgent } | { none: true } | null = null;

function telegramDispatcher(): ProxyAgent | undefined {
  if (proxyCache) {
    return 'none' in proxyCache ? undefined : proxyCache.agent;
  }
  const uri = resolveProxyUri();
  if (!uri) {
    proxyCache = { none: true };
    return undefined;
  }
  proxyCache = { agent: new ProxyAgent(uri) };
  return proxyCache.agent;
}

/** api.telegram.org/bot.../suffix */
function parseTelegramUrl(urlStr: string): { suffix: string } | undefined {
  const m = /^https:\/\/api\.telegram\.org\/bot[^/]+\/(.+)$/.exec(urlStr);
  return m ? { suffix: m[1] } : undefined;
}

export async function telegramApiFetch(
  url: string,
  init?: import('undici').RequestInit
): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  const parsed = parseTelegramUrl(url);
  const relay = resolveTelegramRelay();

  if (relay && parsed) {
    const method = (init?.method || 'GET').toUpperCase();
    const hdrs = new Headers(
      init?.headers as HeadersInit | undefined
    );
    let ct = hdrs.get('Content-Type') || '';

    /** Multipart: sendPhoto — undici FormData has no Content-Type until serialized */
    if (init?.body != null && isFormDataBody(init.body)) {
      const methodOnly =
        (parsed.suffix.split(/[/?]/)[0] ?? '').replace(/[^a-zA-Z]/g, '') ||
        parsed.suffix;
      if (/^[a-zA-Z]+$/.test(methodOnly)) {
        const { buffer, contentType } = await formBodyToMultipart(init.body);
        ct = contentType || ct;
        const r = await fetch(`${relay.url}/v1`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${relay.secret}`,
            'Content-Type': ct,
            'X-Telegram-Path': methodOnly,
          },
          body: buffer,
        });
        return r as unknown as Awaited<ReturnType<typeof undiciFetch>>;
      }
    }

    if (ct.includes('multipart/form-data') && init?.body != null) {
      const methodOnly =
        (parsed.suffix.split(/[/?]/)[0] ?? '').replace(/[^a-zA-Z]/g, '') ||
        parsed.suffix;
      if (/^[a-zA-Z]+$/.test(methodOnly)) {
        const buf = await new Response(init.body as BodyInit).arrayBuffer();
        const r = await fetch(`${relay.url}/v1`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${relay.secret}`,
            'Content-Type': ct,
            'X-Telegram-Path': methodOnly,
          },
          body: buf,
        });
        return r as unknown as Awaited<ReturnType<typeof undiciFetch>>;
      }
    }

    let jsonInner: Record<string, unknown> | undefined;
    if (method !== 'GET' && method !== 'HEAD' && ct.includes('application/json')) {
      const b = init?.body;
      if (typeof b === 'string') jsonInner = JSON.parse(b) as Record<string, unknown>;
    }

    const r = await fetch(`${relay.url}/v1`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${relay.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: parsed.suffix,
        method,
        ...(jsonInner !== undefined ? { json: jsonInner } : {}),
      }),
    });

    const text = await r.text();
    return (
      new Response(text, {
        status: r.status,
        headers: {
          'Content-Type': r.headers.get('Content-Type') || 'application/json',
        },
      }) as unknown as Awaited<ReturnType<typeof undiciFetch>>
    );
  }

  const dispatcher = telegramDispatcher();
  return undiciFetch(url, {
    ...init,
    ...(dispatcher ? { dispatcher } : {}),
  });
}

