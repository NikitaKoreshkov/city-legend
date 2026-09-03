import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { smtpGetSocket } from '@/lib/smtpProxy';

const FROM_NAME = process.env.SMTP_FROM_NAME || process.env.NEXT_PUBLIC_SITE_BRAND_NAME || 'City Legend';

async function getSmtpTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false';

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in environment');
  }

  const cleanPass = pass.replace(/\s/g, '');

  // Подключение по hostname (SNI). Прямой connect на IPv4 из DNS часто таймаутит до Gmail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: Record<string, unknown> = {
    host,
    port,
    secure,
    auth: { user, pass: cleanPass },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 25000,
  };
  // Всегда через smtpGetSocket: принудительный IPv4 (+ опционально HTTPS-прокси).
  // Без этого Node часто идёт на IPv6 Gmail → ENETUNREACH / таймаут с RU VPS.
  base.getSocket = smtpGetSocket;
  base.tls = { servername: host };
  return nodemailer.createTransport(base as any);
}

function resendFromAddress(): string {
  const explicit = process.env.RESEND_FROM?.trim();
  if (explicit) return explicit.includes('<') ? explicit : `${FROM_NAME} <${explicit}>`;
  throw new Error('RESEND_FROM is not set');
}

/** Resend без верифицированного домена (onboarding@resend.dev) шлёт только на email владельца аккаунта. */
function resendReady(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) return false;
  if (/onboarding@resend\.dev/i.test(from)) return false;
  return true;
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: resendFromAddress(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: process.env.SMTP_USER?.trim() || undefined,
  });

  if (error) {
    const msg = error.message || 'Resend send failed';
    if (msg.includes('verify a domain') || msg.includes('only send testing emails')) {
      throw new Error('RESEND_RECIPIENT_NOT_ALLOWED');
    }
    throw new Error(msg);
  }
}

/** Сообщение для пользователя, если sendMail упал. */
export function userFacingMailError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    msg === 'RESEND_RECIPIENT_NOT_ALLOWED' ||
    msg === 'RESEND_DOMAIN_NOT_VERIFIED' ||
    msg === 'SMTP_BLOCKED_NO_PROXY' ||
    msg.includes('only send testing emails') ||
    msg.includes('domain is not verified')
  ) {
    return 'Письмо пока не отправляется — идёт настройка почты для сайта. Напишите нам в Telegram или на contact@citylegend.art.';
  }
  if (/ETIMEDOUT|ENETUNREACH|ECONN|SMTP/i.test(msg)) {
    return 'Не удалось отправить письмо. Попробуйте через несколько минут.';
  }
  return 'Не удалось отправить письмо. Попробуйте позже или напишите на contact@citylegend.art.';
}

function maskEmailForLog(to: string): string {
  const at = to.indexOf('@');
  if (at < 1) return '***';
  const local = to.slice(0, at);
  const domain = to.slice(at + 1);
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? local.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

async function sendViaSmtp(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  bcc?: string;
}): Promise<void> {
  const user = process.env.SMTP_USER?.trim();
  if (!user) throw new Error('SMTP_USER is not set');

  const transport = await getSmtpTransport();
  const bcc =
    opts.bcc?.trim() ||
    (opts.to.trim().toLowerCase() !== user.toLowerCase() ? user : undefined);

  const info = await transport.sendMail({
    from: `"${FROM_NAME}" <${user}>`,
    to: opts.to,
    bcc,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: user,
  });
  console.info(
    `[mailer] SMTP sent to ${maskEmailForLog(opts.to)} messageId=${info.messageId ?? 'n/a'}`
  );
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();

  if (smtpUser && smtpPass) {
    await sendViaSmtp(opts);
    return;
  }

  // Resend — только если SMTP не настроен (на проде используем Gmail).
  if (resendReady()) {
    await sendViaResend(opts);
    return;
  }

  if (process.env.RESEND_API_KEY?.trim()) {
    throw new Error('RESEND_DOMAIN_NOT_VERIFIED');
  }

  throw new Error('SMTP_USER and SMTP_PASS must be set in environment');
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: `Код подтверждения: ${code}`,
    text: `Ваш код подтверждения: ${code}\n\nКод действует 15 минут.`,
    html: `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:'Open Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border:1px solid #ebe8e0;">
    <div style="padding:32px 40px 24px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9b9491;">
        Личный кабинет
      </p>
      <h1 style="margin:0 0 24px;font-size:26px;font-weight:400;color:#0b2a24;font-style:italic;letter-spacing:.02em;">
        Подтверждение email
      </h1>
      <p style="margin:0 0 24px;font-size:13px;color:#555;line-height:1.6;">
        Введите этот код на странице регистрации. Код действует <strong>15 минут</strong>.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <div style="display:inline-block;background:#0b2a24;color:#fff;font-size:32px;font-weight:700;letter-spacing:.35em;padding:18px 36px;">
          ${code}
        </div>
      </div>
      <p style="margin:0;font-size:11px;color:#aaa;line-height:1.5;">
        Если вы не регистрировались на сайте — просто проигнорируйте это письмо.
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: 'Сброс пароля',
    text: `Ссылка для сброса пароля:\n${resetUrl}\n\nСсылка действует 1 час.`,
    html: `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:'Open Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border:1px solid #ebe8e0;">
    <div style="padding:32px 40px 24px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9b9491;">
        Личный кабинет
      </p>
      <h1 style="margin:0 0 24px;font-size:26px;font-weight:400;color:#0b2a24;font-style:italic;letter-spacing:.02em;">
        Сброс пароля
      </h1>
      <p style="margin:0 0 28px;font-size:13px;color:#555;line-height:1.6;">
        Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует <strong>1 час</strong>.
      </p>
      <div style="text-align:center;margin:0 0 32px;">
        <a href="${resetUrl}"
           style="display:inline-block;background:#0b2a24;color:#fff;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;text-decoration:none;padding:15px 32px;">
          Сбросить пароль
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:12px;color:#888;line-height:1.5;">
        Или скопируйте ссылку вручную:
      </p>
      <p style="margin:0;font-size:11px;color:#aaa;word-break:break-all;line-height:1.5;">
        <a href="${resetUrl}" style="color:#0b2a24;">${resetUrl}</a>
      </p>
      <p style="margin:24px 0 0;font-size:11px;color:#aaa;line-height:1.5;">
        Если вы не запрашивали сброс пароля — проигнорируйте это письмо.
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendOrderPaidEmail(opts: {
  to: string;
  customerName: string;
  reference: string;
  totalDisplay: string;
  summaryLine: string;
}): Promise<void> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://citylegend.art').replace(/\/$/, '');
  const name = escapeHtmlText(opts.customerName.trim() || 'Покупатель');
  const reference = escapeHtmlText(opts.reference);
  const total = escapeHtmlText(opts.totalDisplay);
  const summary = escapeHtmlText(opts.summaryLine);
  const cabinetUrl = `${siteUrl}/?cabinet=1`;

  await sendMail({
    to: opts.to,
    subject: `Заказ ${opts.reference} оплачен`,
    text:
      `Здравствуйте, ${opts.customerName.trim() || 'Покупатель'}!\n\n` +
      `Ваш заказ оплачен.\n\n` +
      `Номер: ${opts.reference}\n` +
      `Сумма: ${opts.totalDisplay}\n` +
      `${opts.summaryLine}\n\n` +
      `Статус заказа: ${siteUrl} (личный кабинет → Заказы)\n\n` +
      `Спасибо за покупку!\nCity Legend`,
    html: `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:'Open Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border:1px solid #ebe8e0;">
    <div style="padding:32px 40px 24px;">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9b9491;">
        City Legend
      </p>
      <h1 style="margin:0 0 24px;font-size:26px;font-weight:400;color:#0b2a24;font-style:italic;letter-spacing:.02em;">
        Заказ оплачен
      </h1>
      <p style="margin:0 0 24px;font-size:13px;color:#555;line-height:1.6;">
        Здравствуйте, ${name}! Спасибо за покупку. Мы получили оплату и начали обработку заказа.
      </p>
      <div style="background:#faf9f7;border:1px solid #ebe8e0;padding:20px 24px;margin:0 0 28px;">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9b9491;">Номер заказа</p>
        <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0b2a24;letter-spacing:.04em;">${reference}</p>
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9b9491;">Сумма</p>
        <p style="margin:0 0 16px;font-size:16px;color:#0b2a24;">${total}</p>
        <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">${summary}</p>
      </div>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${cabinetUrl}"
           style="display:inline-block;background:#0b2a24;color:#fff;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;text-decoration:none;padding:15px 32px;">
          Статус в личном кабинете
        </a>
      </div>
      <p style="margin:0;font-size:11px;color:#aaa;line-height:1.5;">
        Если у вас есть вопросы — напишите в поддержку на сайте или на contact@citylegend.art
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}
