/**
 * TLS trust for platform-api2.max.ru (сертификаты НУЦ Минцифры).
 * Next/undici иногда игнорирует NODE_EXTRA_CA_CERTS → UNABLE_TO_GET_ISSUER_CERT_LOCALLY
 * при ответе бота из webhook. Явно подмешиваем CA в Agent.
 */
import fs from 'fs';
import tls from 'tls';
import { Agent, fetch as undiciFetch, setGlobalDispatcher, type RequestInit } from 'undici';

let agent: Agent | null = null;
let installed = false;

function buildCaBundle(): (string | Buffer)[] | undefined {
  const caPath = process.env.NODE_EXTRA_CA_CERTS?.trim();
  if (!caPath) return undefined;
  try {
    const extra = fs.readFileSync(caPath);
    return [...tls.rootCertificates, extra];
  } catch (err) {
    console.error('[max-tls] cannot read NODE_EXTRA_CA_CERTS:', caPath, err);
    return undefined;
  }
}

export function getMaxTlsAgent(): Agent | undefined {
  if (agent) return agent;
  const ca = buildCaBundle();
  if (!ca) return undefined;
  agent = new Agent({
    connect: {
      ca,
      rejectUnauthorized: true,
    },
  });
  return agent;
}

/** Вызвать при старте Node-процесса (instrumentation). */
export function installMaxTlsTrust(): void {
  if (installed) return;
  installed = true;
  const a = getMaxTlsAgent();
  if (!a) {
    if (process.env.NODE_ENV === 'production' && process.env.MAX_BOT_TOKEN?.trim()) {
      console.warn(
        '[max-tls] NODE_EXTRA_CA_CERTS not set — Max API TLS may fail (UNABLE_TO_GET_ISSUER_CERT_LOCALLY)'
      );
    }
    return;
  }
  setGlobalDispatcher(a);
  console.log('[max-tls] undici Agent with Russian Trusted CA installed');
}

/** fetch к Max API с явным CA (не зависит от global dispatcher). */
export function maxApiFetch(url: string, init?: RequestInit) {
  const dispatcher = getMaxTlsAgent();
  return undiciFetch(url, dispatcher ? { ...init, dispatcher } : init);
}
