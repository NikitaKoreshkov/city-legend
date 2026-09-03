#!/usr/bin/env node
/**
 * Проверка Gmail SMTP на сервере: node scripts/probe-smtp.mjs [email]
 * Без аргумента — только verify(); с email — тестовое письмо.
 */
import fs from 'fs';
import dns from 'dns';
import net from 'net';
import nodemailer from 'nodemailer';

const envPath = process.argv.includes('--env')
  ? process.argv[process.argv.indexOf('--env') + 1]
  : new URL('../.env', import.meta.url).pathname;

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  process.env[m[1]] = v;
}

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = parseInt(process.env.SMTP_PORT || '465', 10);
const user = process.env.SMTP_USER;
const pass = (process.env.SMTP_PASS || '').replace(/\s/g, '');

function smtpGetSocket(options, callback) {
  const targetHost = (options.host || host).replace(/^\[/, '').replace(/\]$/, '').trim();
  const p = options.port || port;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(targetHost)) {
    const s = net.connect({ host: targetHost, port: p, family: 4 });
    s.once('error', callback);
    s.once('connect', () => callback(null, s));
    return;
  }
  dns.resolve4(targetHost, (err, addrs) => {
    if (err || !addrs?.length) return callback(err ?? new Error(`No IPv4 for ${targetHost}`));
    const s = net.connect({ host: addrs[0], port: p, family: 4 });
    s.once('error', callback);
    s.once('connect', () => callback(null, s));
  });
}

const transport = nodemailer.createTransport({
  host,
  port,
  secure: process.env.SMTP_SECURE !== 'false',
  auth: { user, pass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
  getSocket: smtpGetSocket,
  tls: { servername: host },
});

const to = process.argv.find((a) => a.includes('@'));

const start = Date.now();
await transport.verify();
console.log('VERIFY_OK', `${Date.now() - start}ms`);

if (to) {
  const info = await transport.sendMail({
    from: `"City Legend probe" <${user}>`,
    to,
    subject: `SMTP probe ${new Date().toISOString()}`,
    text: 'Тестовое письмо с сервера citylegend.art',
  });
  console.log('SEND_OK', info.messageId ?? 'no-id');
}
