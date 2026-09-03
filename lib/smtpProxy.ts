import net from 'net';
import dns from 'dns';
import { URL } from 'url';

/** Прокси для SMTP: SMTP_HTTPS_PROXY или тот же TELEGRAM_HTTPS_PROXY. */
export function smtpProxyUrl(): string | undefined {
  return (
    process.env.SMTP_HTTPS_PROXY?.trim() ||
    process.env.TELEGRAM_HTTPS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    undefined
  );
}

function connectViaHttpConnect(
  targetHost: string,
  targetPort: number,
  proxyUrl: string,
  callback: (err: Error | null, socket?: net.Socket) => void
) {
  let proxy: URL;
  try {
    proxy = new URL(proxyUrl);
  } catch {
    callback(new Error('Invalid SMTP proxy URL'));
    return;
  }

  const proxyPort = parseInt(proxy.port || '8080', 10);
  const socket = net.connect({ host: proxy.hostname, port: proxyPort, family: 4 });

  socket.setTimeout(15000, () => {
    socket.destroy();
    callback(new Error('SMTP proxy connection timeout'));
  });

  socket.once('error', (err) => callback(err));

  socket.once('connect', () => {
    const target = `${targetHost}:${targetPort}`;
    let headers =
      `CONNECT ${target} HTTP/1.1\r\n` +
      `Host: ${target}\r\n` +
      'Proxy-Connection: keep-alive\r\n';

    if (proxy.username) {
      const user = decodeURIComponent(proxy.username);
      const pass = decodeURIComponent(proxy.password || '');
      const token = Buffer.from(`${user}:${pass}`).toString('base64');
      headers += `Proxy-Authorization: Basic ${token}\r\n`;
    }
    headers += '\r\n';
    socket.write(headers);
  });

  let buf = '';
  const onData = (chunk: Buffer) => {
    buf += chunk.toString('latin1');
    if (!buf.includes('\r\n\r\n')) return;
    socket.off('data', onData);
    socket.setTimeout(0);

    const statusLine = buf.split('\r\n')[0] || '';
    if (!/^HTTP\/1\.[01] 200/.test(statusLine)) {
      socket.destroy();
      callback(new Error(`SMTP proxy CONNECT failed: ${statusLine}`));
      return;
    }

    const headerEnd = buf.indexOf('\r\n\r\n') + 4;
    const extra = buf.slice(headerEnd);
    if (extra.length > 0) {
      const existing = socket.read();
      if (existing === null) {
        socket.unshift(Buffer.from(extra, 'latin1'));
      }
    }
    callback(null, socket);
  };
  socket.on('data', onData);
}

/** IPv4 literal — connect directly, без DNS lookup. */
function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** Nodemailer getSocket — туннель до smtp.gmail.com через HTTPS-прокси. */
export function smtpGetSocket(
  options: { port?: number; host?: string },
  callback: (err: Error | null, socket?: net.Socket) => void
) {
  const proxy = smtpProxyUrl();
  const host = options.host || 'smtp.gmail.com';
  const port = options.port || 465;
  const targetHost = host.replace(/^\[/, '').replace(/\]$/, '').trim();

  if (proxy) {
    connectViaHttpConnect(targetHost, port, proxy, callback);
    return;
  }

  if (isIpv4(targetHost)) {
    const socket = net.connect({ host: targetHost, port, family: 4 });
    socket.once('error', callback);
    socket.once('connect', () => callback(null, socket));
    return;
  }

  dns.resolve4(targetHost, (err, addrs) => {
    if (err || !addrs?.length) {
      callback(err ?? new Error(`No IPv4 for ${targetHost}`));
      return;
    }
    const socket = net.connect({ host: addrs[0], port, family: 4 });
    socket.once('error', callback);
    socket.once('connect', () => callback(null, socket));
  });
}
