/**
 * City Legend — полная логика бота в MAX (паритет с Telegram webhook).
 */
import path from 'path';
import fs from 'fs/promises';
import pool, { ensureDatabase } from '@/lib/db';
import { registerBotUser } from '@/lib/bots/register';
import { generateCouponQR } from '@/lib/bots/qr';
import bcrypt from 'bcryptjs';
import {
  maxSendHtml,
  maxSendTyping,
  maxAnswerCallback,
  maxSendPhotoHtmlFromUrl,
  maxCouponClipboardAttachment,
  type MaxMessageTarget,
} from '@/lib/bots/max';
import { buildBotSiteCartUrl } from '@/lib/botSiteSso';
import {
  fetchConciergeCustomerInfo,
  notifyStaffNewConciergeTicket,
} from '@/lib/conciergeNotifyStaff';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://citylegend.art';

export interface MaxCtx {
  chatId: string | null;
  userId: string;
}

function targetOf(ctx: MaxCtx): MaxMessageTarget {
  if (ctx.chatId) return { chatId: ctx.chatId, userId: ctx.userId };
  return { userId: ctx.userId };
}

// ─── Inline keyboards (type "message" = как reply-keyboard в TG) ─────────────

function attInlineKeyboard(
  rows: Array<Array<Record<string, unknown>>>
): unknown[] {
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

const ATT_AUTH = attInlineKeyboard([
  [
    { type: 'message', text: '📝 Регистрация' },
    { type: 'message', text: '🔑 Войти в аккаунт' },
  ],
]);

const ATT_MAIN = attInlineKeyboard([
  [{ type: 'message', text: '🛍 Каталог' }, { type: 'message', text: '🛒 Корзина' }],
  [{ type: 'message', text: '❤️ Избранное' }, { type: 'message', text: '📦 Мои заказы' }],
  [{ type: 'message', text: '🎁 Мой купон' }, { type: 'message', text: '👤 Профиль' }],
  [{ type: 'message', text: '💬 Менеджер' }, { type: 'message', text: '🚪 Выйти' }],
]);

function attMainWithCouponCopy(couponCode: string): unknown[] {
  const code = couponCode.trim().toUpperCase();
  return [
    {
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [{ type: 'clipboard', text: '📋 Скопировать код', payload: code }],
          [{ type: 'message', text: '🛍 Каталог' }, { type: 'message', text: '🛒 Корзина' }],
          [{ type: 'message', text: '❤️ Избранное' }, { type: 'message', text: '📦 Мои заказы' }],
          [{ type: 'message', text: '🎁 Мой купон' }, { type: 'message', text: '👤 Профиль' }],
          [{ type: 'message', text: '💬 Менеджер' }, { type: 'message', text: '🚪 Выйти' }],
        ],
      },
    },
  ];
}

const ATT_PHONE = attInlineKeyboard([
  [{ type: 'request_contact', text: '📱 Поделиться номером' }],
  [{ type: 'message', text: '⬅️ Отмена' }],
]);

const ATT_BACK = attInlineKeyboard([[{ type: 'message', text: '⬅️ Отмена' }]]);

type Step =
  | 'AUTH_CHOICE'
  | 'REG_NAME'
  | 'REG_PHONE'
  | 'REG_EMAIL'
  | 'REG_PASSWORD'
  | 'LOGIN_EMAIL'
  | 'LOGIN_PASSWORD'
  | 'MAIN';

interface Session {
  step: Step;
  subscriberId?: number;
  cabinetUserId?: number;
  firstName?: string;
  couponCode?: string;
  catalogOpen?: boolean;
  regName?: string;
  regPhone?: string;
  regEmail?: string;
  loginEmail?: string;
}

const sessions = new Map<string, Session>();

function sessKey(userId: string): string {
  return userId;
}

function getSession(userId: string): Session {
  return sessions.get(sessKey(userId)) ?? { step: 'AUTH_CHOICE' };
}

async function send(
  ctx: MaxCtx,
  html: string,
  attachments?: unknown[]
): Promise<void> {
  await maxSendHtml(targetOf(ctx), html, {
    ...(attachments?.length ? { attachments } : {}),
    disableLinkPreview: true,
  });
}

async function typing(ctx: MaxCtx): Promise<void> {
  if (ctx.chatId) await maxSendTyping(ctx.chatId);
}

function looksLikePhone(s: string): boolean {
  const d = s.replace(/[\s\-()]/g, '');
  return /^\+?\d{10,15}$/.test(d);
}

function msUntilNextQr(lastSent: Date): { ok: boolean; ms: number } {
  const dayMs = 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - lastSent.getTime();
  if (elapsed >= dayMs) return { ok: true, ms: 0 };
  return { ok: false, ms: dayMs - elapsed };
}

function formatWaitRu(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  if (h > 0) return `~${h} ч ${m} мин`;
  return `~${m} мин`;
}

async function saveQrToPublic(couponCode: string, qrBuffer: Buffer): Promise<string> {
  const uploadsBase = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'public');
  const uploadsDir = path.join(uploadsBase, 'uploads', 'qr');
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, `${couponCode}.png`), qrBuffer);
  return `${SITE_URL}/uploads/qr/${couponCode}.png`;
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function extractContactPhone(body: Record<string, unknown> | undefined): string | undefined {
  if (!body) return undefined;
  const raw = body.attachments;
  if (!Array.isArray(raw)) return undefined;
  for (const a of raw) {
    const att = a as Record<string, unknown>;
    if (att.type !== 'contact') continue;
    const p = att.payload as Record<string, unknown> | undefined;
    if (!p) continue;
    if (typeof p.vcf_phone === 'string' && p.vcf_phone.trim()) return p.vcf_phone.trim();
    const vcf = typeof p.vcf_info === 'string' ? p.vcf_info : '';
    const m = /TEL[^:]*:([+\d\s\-]+)/i.exec(vcf);
    if (m) return m[1].replace(/\s/g, '');
  }
  return undefined;
}

// ═══ Парсинг входящих webhooks ═══════════════════════════════════════════════

export type ParsedMaxEvent =
  | {
      kind: 'bot_started';
      ctx: MaxCtx;
      userName: string;
    }
  | {
      kind: 'message';
      ctx: MaxCtx;
      text: string;
      contactPhone?: string;
      userName: string;
    }
  | {
      kind: 'callback';
      ctx: MaxCtx;
      callbackId: string;
      payload: string;
      userName: string;
    };

export function parseMaxWebhook(raw: Record<string, unknown>): ParsedMaxEvent | null {
  const t = raw.update_type as string;

  if (t === 'bot_started') {
    const chatId = raw.chat_id != null ? String(raw.chat_id) : null;
    const user = raw.user as { user_id?: number; name?: string } | undefined;
    if (!user?.user_id) return null;
    const uid = String(user.user_id);
    return {
      kind: 'bot_started',
      ctx: { chatId, userId: uid },
      userName: user.name ?? 'Клиент',
    };
  }

  if (t === 'message_callback') {
    const cb = raw.callback as
      | { callback_id?: string; payload?: string; user?: { user_id?: number; name?: string } }
      | undefined;
    const msg = raw.message as { recipient?: { chat_id?: number } } | undefined;
    let chatId: string | null =
      msg?.recipient?.chat_id != null ? String(msg.recipient.chat_id) : null;
    if (!chatId && raw.chat_id != null) chatId = String(raw.chat_id);
    if (!cb?.callback_id || !cb.user?.user_id) return null;
    return {
      kind: 'callback',
      ctx: { chatId, userId: String(cb.user.user_id) },
      callbackId: cb.callback_id,
      payload: cb.payload ?? '',
      userName: cb.user.name ?? 'Клиент',
    };
  }

  if (t === 'message_created') {
    const msg = raw.message as Record<string, unknown> | undefined;
    if (!msg) return null;
    const sender = msg.sender as { user_id?: number; name?: string; is_bot?: boolean } | undefined;
    const recipient = msg.recipient as { chat_id?: number } | undefined;
    if (!sender?.user_id || sender.is_bot) return null;
    let chatId: string | null =
      recipient?.chat_id != null ? String(recipient.chat_id) : null;
    if (!chatId && raw.chat_id != null) chatId = String(raw.chat_id);
    const body = msg.body as Record<string, unknown> | undefined;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const contactPhone = extractContactPhone(body);
    return {
      kind: 'message',
      ctx: { chatId, userId: String(sender.user_id) },
      text,
      contactPhone,
      userName: sender.name ?? 'Клиент',
    };
  }

  return null;
}

// ═══ /start flow ════════════════════════════════════════════════════════════

async function handleStart(ctx: MaxCtx, platformUserId: string, tgFirstName: string): Promise<void> {
  sessions.set(sessKey(platformUserId), { step: 'AUTH_CHOICE' });

  try {
    await ensureDatabase();
    const existing = await pool.query<{ first_name: string | null }>(
      `SELECT bs.first_name
       FROM bot_subscribers bs
       WHERE bs.platform = 'max' AND bs.platform_user_id = $1`,
      [platformUserId]
    );

    if (existing.rows.length > 0) {
      const name = existing.rows[0].first_name || tgFirstName;
      await send(
        ctx,
        `✨ <b>City Legend</b>\n\n` +
          `Вы уже есть в базе бота как <b>${name}</b>.\n\n` +
          `Чтобы открыть каталог, корзину и купоны — нажмите <b>«🔑 Войти в аккаунт»</b> и введите email и пароль от сайта.\n\n` +
          `Новый аккаунт — кнопка <b>«📝 Регистрация»</b>.`,
        ATT_AUTH
      );
      return;
    }
  } catch (err) {
    console.error('[Max] handleStart DB error:', err);
  }

  await send(
    ctx,
    `✨ Добро пожаловать в <b>City Legend</b>!\n\n` +
      `Мы создаём украшения с душой — для тех, кто ценит красоту в деталях.\n\n` +
      `Зарегистрируйтесь и получите персональный купон на скидку <b>10%</b> — или войдите, если уже с нами:`,
    ATT_AUTH
  );
}

async function handleCallbackQuery(
  ctx: MaxCtx,
  userId: string,
  data: string,
  callbackId: string
): Promise<void> {
  await maxAnswerCallback(callbackId);

  if (data === 'c|__back__') {
    const sess = getSession(userId);
    sessions.set(sessKey(userId), { ...sess, catalogOpen: false });
    await send(ctx, `🏠 Главное меню:`, ATT_MAIN);
    return;
  }

  if (data.startsWith('c|')) {
    const slug = data.slice(2);
    if (!slug || slug === '__back__') return;
    const sess = getSession(userId);
    if (sess.step !== 'MAIN') {
      await send(
        ctx,
        `Сначала войдите: нажмите /start → «Войти в аккаунт».`,
        ATT_AUTH
      );
      return;
    }
    await handleCategoryBySlug(ctx, userId, slug);
  }
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

async function handleCatalog(ctx: MaxCtx, userId: string, session: Session): Promise<void> {
  await typing(ctx);

  try {
    await ensureDatabase();
    const cats = await pool.query<{ name: string; slug: string }>(
      `SELECT name, slug FROM auction_categories ORDER BY sort_order, name LIMIT 16`
    );

    if (cats.rows.length === 0) {
      sessions.set(sessKey(userId), { ...session, catalogOpen: false });
      await send(
        ctx,
        `😕 Каталог пока пуст. Загляните на сайт:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
        ATT_MAIN
      );
      return;
    }

    sessions.set(sessKey(userId), { ...session, step: 'MAIN', catalogOpen: true });

    const rows: Record<string, unknown>[][] = [];
    for (let i = 0; i < cats.rows.length; i += 2) {
      const a = cats.rows[i];
      const row: Record<string, unknown>[] = [
        {
          type: 'callback',
          text: a.name.slice(0, 64),
          payload: `c|${a.slug}`.slice(0, 512),
        },
      ];
      if (cats.rows[i + 1]) {
        const b = cats.rows[i + 1];
        row.push({
          type: 'callback',
          text: b.name.slice(0, 64),
          payload: `c|${b.slug}`.slice(0, 512),
        });
      }
      rows.push(row);
    }
    rows.push([
      { type: 'callback', text: '⬅️ Главное меню', payload: 'c|__back__' },
    ]);

    await send(ctx, `🛍 <b>Каталог City Legend</b>\n\nНажмите категорию ниже:`, [
      { type: 'inline_keyboard', payload: { buttons: rows } },
    ]);
  } catch (err) {
    console.error('[Max] Catalog error:', err);
    await send(ctx, `⚠️ Не удалось загрузить каталог. Попробуйте позже.`, ATT_MAIN);
  }
}

async function handleCategoryBySlug(ctx: MaxCtx, userId: string, slug: string): Promise<void> {
  await typing(ctx);

  try {
    await ensureDatabase();

    const catRow = await pool.query<{ slug: string; name: string }>(
      `SELECT slug, name FROM auction_categories WHERE slug = $1 LIMIT 1`,
      [slug]
    );

    if (!catRow.rows.length) {
      await send(ctx, `Категория не найдена.`, ATT_MAIN);
      return;
    }

    const { name } = catRow.rows[0];

    await send(ctx, `🔍 Ищу товары в категории <b>${name}</b>...`);
    await typing(ctx);

    const items = await pool.query<{
      id: number;
      name: string;
      starting_price: string;
      compare_at_price: string | null;
    }>(
      `SELECT a.id, a.name, a.starting_price, a.compare_at_price
       FROM auctions a
       JOIN auction_categories ac ON ac.id = a.category_id
       WHERE ac.slug = $1
       ORDER BY a.id DESC
       LIMIT 10`,
      [slug]
    );

    if (items.rows.length === 0) {
      await send(
        ctx,
        `😕 В категории «${name}» пока нет товаров.\n\n` +
          `Смотрите весь каталог на сайте:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
        ATT_MAIN
      );
      return;
    }

    const lines = items.rows.map(item => {
      const priceStr = item.compare_at_price?.trim()
        ? `<s>${item.compare_at_price}</s>  →  <b>${item.starting_price}</b>`
        : `<b>${item.starting_price}</b>`;
      return (
        `💎 <b>${item.name}</b>\n💰 ${priceStr}\n🔗 <a href="${SITE_URL}/collection/${item.id}">Открыть на сайте</a>`
      );
    });

    await send(
      ctx,
      `🛍 <b>${name}</b> — ${items.rows.length} товаров:\n\n` +
        lines.join('\n\n───────────────\n\n') +
        `\n\n🔗 <a href="${SITE_URL}/collection?category=${encodeURIComponent(slug)}">Все товары категории →</a>`,
      ATT_MAIN
    );
  } catch (err) {
    console.error('[Max] Category items error:', err);
    await send(ctx, `⚠️ Не удалось загрузить товары.`, ATT_MAIN);
  } finally {
    const s = getSession(userId);
    sessions.set(sessKey(userId), { ...s, catalogOpen: false });
  }
}

async function handleCategorySelect(
  ctx: MaxCtx,
  userId: string,
  _session: Session,
  text: string
): Promise<void> {
  const norm = text.normalize('NFC').trim();
  await typing(ctx);

  try {
    await ensureDatabase();

    let catRow = await pool.query<{ slug: string; name: string }>(
      `SELECT slug, name FROM auction_categories WHERE TRIM(name) = $1 LIMIT 1`,
      [norm]
    );
    if (!catRow.rows.length) {
      catRow = await pool.query<{ slug: string; name: string }>(
        `SELECT slug, name FROM auction_categories
         WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1`,
        [norm]
      );
    }
    if (!catRow.rows.length) {
      await send(
        ctx,
        `Не нашёл категорию «${norm}». Проверьте написание или нажмите кнопку с категорией под сообщением с каталогом.`,
        ATT_MAIN
      );
      return;
    }

    await handleCategoryBySlug(ctx, userId, catRow.rows[0].slug);
  } catch (err) {
    console.error('[Max] Category select error:', err);
    await send(ctx, `⚠️ Ошибка каталога.`, ATT_MAIN);
  }
}

// ─── Cart / Favorites / Orders / Coupon / Profile / Concierge ─────────────

async function handleCart(ctx: MaxCtx, session: Session): Promise<void> {
  if (!session.cabinetUserId) {
    await send(
      ctx,
      `🛒 <b>Корзина</b>\n\n` +
        `Чтобы видеть корзину, войдите в аккаунт сайта.\n` +
        `Нажмите /start и выберите <b>«Войти в аккаунт»</b>.\n\n` +
        `Или добавляйте товары напрямую на сайте:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
      ATT_MAIN
    );
    return;
  }

  await typing(ctx);
  await send(ctx, `🛒 Загружаю вашу корзину...`);
  await typing(ctx);

  try {
    const items = await pool.query<{
      auction_id: number;
      name: string;
      starting_price: string;
      quantity: number;
    }>(
      `SELECT ci.auction_id, a.name, a.starting_price, ci.quantity
       FROM cabinet_cart_items ci
       JOIN auctions a ON a.id = ci.auction_id
       WHERE ci.user_id = $1
       ORDER BY ci.updated_at DESC`,
      [session.cabinetUserId]
    );

    if (items.rows.length === 0) {
      await send(
        ctx,
        `🛒 Ваша корзина пуста.\n\nПерейдите в 🛍 Каталог, чтобы выбрать украшение.`,
        ATT_MAIN
      );
      return;
    }

    const total = items.rows.length;
    const lines = items.rows.map(
      i =>
        `• <b>${i.name}</b> × ${i.quantity}\n  💰 ${i.starting_price}\n  🔗 <a href="${SITE_URL}/collection/${i.auction_id}">Открыть</a>`
    );

    await send(
      ctx,
      `🛒 <b>Ваша корзина</b> — ${total} ${pluralize(total, 'товар', 'товара', 'товаров')}:\n\n` +
        lines.join('\n\n') +
        `\n\n🔗 <a href="${await buildBotSiteCartUrl({ cabinetUserId: session.cabinetUserId })}">Оформить заказ на сайте →</a>`,
      ATT_MAIN
    );
  } catch (err) {
    console.error('[Max] Cart error:', err);
    await send(ctx, `⚠️ Не удалось загрузить корзину.`, ATT_MAIN);
  }
}

async function handleFavorites(ctx: MaxCtx, session: Session): Promise<void> {
  if (!session.cabinetUserId) {
    await send(
      ctx,
      `❤️ <b>Избранное</b>\n\n` +
        `Войдите в аккаунт сайта, чтобы видеть избранные украшения.\n` +
        `Нажмите /start → <b>«Войти в аккаунт»</b>.`,
      ATT_MAIN
    );
    return;
  }

  await typing(ctx);
  await send(ctx, `❤️ Ищу ваши любимые украшения...`);
  await typing(ctx);

  try {
    const items = await pool.query<{
      auction_id: number;
      name: string;
      starting_price: string;
    }>(
      `SELECT f.auction_id, a.name, a.starting_price
       FROM cabinet_favorites f
       JOIN auctions a ON a.id = f.auction_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC
       LIMIT 10`,
      [session.cabinetUserId]
    );

    if (items.rows.length === 0) {
      await send(
        ctx,
        `❤️ В избранном пока ничего нет.\n\nДобавляйте понравившиеся украшения на сайте:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
        ATT_MAIN
      );
      return;
    }

    const lines = items.rows.map(
      i =>
        `❤️ <b>${i.name}</b>\n  💰 ${i.starting_price}\n  🔗 <a href="${SITE_URL}/collection/${i.auction_id}">Открыть</a>`
    );

    await send(
      ctx,
      `❤️ <b>Ваше избранное</b> — ${items.rows.length} украшений:\n\n` + lines.join('\n\n'),
      ATT_MAIN
    );
  } catch (err) {
    console.error('[Max] Favorites error:', err);
    await send(ctx, `⚠️ Не удалось загрузить избранное.`, ATT_MAIN);
  }
}

async function handleOrders(ctx: MaxCtx, session: Session): Promise<void> {
  if (!session.cabinetUserId) {
    await send(
      ctx,
      `📦 <b>Заказы</b>\n\n` +
        `Войдите в аккаунт сайта, чтобы видеть историю заказов.\n` +
        `Нажмите /start → <b>«Войти в аккаунт»</b>.`,
      ATT_MAIN
    );
    return;
  }

  await typing(ctx);
  await send(ctx, `📦 Загружаю историю ваших заказов...`);
  await typing(ctx);

  try {
    const orders = await pool.query<{
      id: number;
      status: string;
      reference_code: string | null;
      total_display: string;
      summary_line: string | null;
      created_at: Date;
    }>(
      `SELECT id, status, reference_code, total_display, summary_line, created_at
       FROM cabinet_orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [session.cabinetUserId]
    );

    if (orders.rows.length === 0) {
      await send(
        ctx,
        `📦 У вас пока нет заказов.\n\nПерейдите в каталог и выберите украшение:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
        ATT_MAIN
      );
      return;
    }

    const statusLabel: Record<string, string> = {
      pending: '⏳ Ожидает оплаты',
      paid: '✅ Оплачен',
      processing: '🔄 В обработке',
      shipped: '🚚 Отправлен',
      delivered: '🎁 Доставлен',
      cancelled: '❌ Отменён',
      refunded: '💸 Возврат',
    };

    const lines = orders.rows.map(o => {
      const date = new Date(o.created_at).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const ref = o.reference_code ? ` #${o.reference_code}` : '';
      const status = statusLabel[o.status] ?? o.status;
      const summary = o.summary_line ? `\n  📋 ${o.summary_line}` : '';
      return `📦 <b>Заказ от ${date}${ref}</b>\n  ${status}\n  💰 ${o.total_display}${summary}`;
    });

    await send(
      ctx,
      `📦 <b>Ваши заказы</b>:\n\n` +
        lines.join('\n\n───────────────\n\n') +
        `\n\n🔗 <a href="${SITE_URL}">Личный кабинет на сайте →</a>`,
      ATT_MAIN
    );
  } catch (err) {
    console.error('[Max] Orders error:', err);
    await send(ctx, `⚠️ Не удалось загрузить заказы.`, ATT_MAIN);
  }
}

async function handleCoupon(ctx: MaxCtx, platformUserId: string, session: Session): Promise<void> {
  if (!session.couponCode) {
    await send(
      ctx,
      `🎁 <b>Персональный купон</b>\n\n` +
        `У вас ещё нет купона. Зарегистрируйтесь, чтобы получить скидку <b>10%</b>:\n\n` +
        `Нажмите /start → <b>«Регистрация»</b>`,
      ATT_MAIN
    );
    return;
  }

  if (!session.subscriberId) {
    await send(
      ctx,
      `Не удалось определить подписку. Нажмите /start и войдите снова.`,
      ATT_MAIN
    );
    return;
  }

  await typing(ctx);

  try {
    await ensureDatabase();
    const subRes = await pool.query<{ last_qr_sent_at: Date | null }>(
      `SELECT last_qr_sent_at FROM bot_subscribers WHERE id = $1`,
      [session.subscriberId]
    );
    const last = subRes.rows[0]?.last_qr_sent_at;
    if (last) {
      const w = msUntilNextQr(new Date(last));
      if (!w.ok) {
        await send(
          ctx,
          `📅 QR-код можно получить <b>раз в сутки</b>.\n\n` +
            `Следующая отправка через <b>${formatWaitRu(w.ms)}</b>.\n\n` +
            `Код купона (без QR): <code>${session.couponCode}</code>`,
          [maxCouponClipboardAttachment(session.couponCode)]
        );
        await send(ctx, `🏠 Что-то ещё?`, ATT_MAIN);
        return;
      }
    }

    const qrBuffer = await generateCouponQR(session.couponCode);
    const qrUrl = await saveQrToPublic(session.couponCode, qrBuffer);

    await pool.query(`UPDATE bot_subscribers SET last_qr_sent_at = NOW() WHERE id = $1`, [
      session.subscriberId,
    ]);

    await maxSendPhotoHtmlFromUrl(
      targetOf(ctx),
      qrUrl,
      `🎁 <b>Ваш персональный купон</b>\n\n` +
        `Код: <code>${session.couponCode}</code>\n\n` +
        `Скидка: <b>10%</b> на заказ\n\n` +
        `Скан QR откроет страницу сайта — после входа купон подставится в корзину.\n\n` +
        `🔗 <a href="${await buildBotSiteCartUrl({ cabinetUserId: session.cabinetUserId, couponCode: session.couponCode })}">Активировать купон на сайте</a>`,
      { extraAttachments: [maxCouponClipboardAttachment(session.couponCode)] }
    );
    await send(ctx, `🏠 Что-то ещё?`, ATT_MAIN);
  } catch (err) {
    console.error('[Max] Coupon QR error:', err);
    await send(
      ctx,
      `🎁 <b>Ваш купон</b>: <code>${session.couponCode}</code>\n\nВведите при оформлении заказа на сайте.`,
      [maxCouponClipboardAttachment(session.couponCode)]
    );
    await send(ctx, `🏠 Что-то ещё?`, ATT_MAIN);
  }
}

async function handleProfile(ctx: MaxCtx, session: Session): Promise<void> {
  await typing(ctx);

  const name = session.firstName ?? '—';
  let text = `👤 <b>Ваш профиль</b>\n\n📛 Имя: <b>${name}</b>`;

  if (session.cabinetUserId) {
    try {
      const userRow = await pool.query<{
        email: string;
        display_name: string;
        created_at: Date;
      }>(`SELECT email, display_name, created_at FROM cabinet_users WHERE id = $1`, [
        session.cabinetUserId,
      ]);
      if (userRow.rows.length > 0) {
        const u = userRow.rows[0];
        const since = new Date(u.created_at).toLocaleDateString('ru-RU', {
          month: 'long',
          year: 'numeric',
        });
        text += `\n✉️ Email: <b>${u.email}</b>`;
        text += `\n🗓 Клиент с: <b>${since}</b>`;
      }
    } catch {
      /* ignore */
    }
  }

  if (session.couponCode) {
    text += `\n\n🎁 Купон: <code>${session.couponCode}</code>`;
  }

  text += `\n\n🔗 <a href="${await buildBotSiteCartUrl({ cabinetUserId: session.cabinetUserId, couponCode: session.couponCode })}">Открыть корзину на сайте →</a>`;

  await send(
    ctx,
    text,
    session.couponCode ? attMainWithCouponCopy(session.couponCode) : ATT_MAIN
  );
}

async function handleConcierge(ctx: MaxCtx): Promise<void> {
  await send(
    ctx,
    `💬 <b>Менеджер City Legend</b>\n\n` +
      `Наши специалисты помогут с выбором украшения, оформлением подарка и любыми вопросами.\n\n` +
      `✉️ <a href="mailto:contact@citylegend.art">contact@citylegend.art</a>\n` +
      `🌐 <a href="${SITE_URL}">citylegend.art</a>\n\n` +
      `Напишите нам прямо в чат на сайте — мы отвечаем быстро 🤍`,
    ATT_MAIN
  );
}

// ═══ Главный обработчик текстовых сообщений (как в Telegram) ═══════════════

async function dispatchMessage(
  ctx: MaxCtx,
  userId: string,
  text: string,
  contactPhone: string | undefined,
  platformFirstName: string
): Promise<void> {
  const message = { text, contact: contactPhone ? { phone_number: contactPhone } : undefined };

  // Эмуляция TG: команды и текст кнопок
  if (text === '/start' || text.startsWith('/start ')) {
    await handleStart(ctx, userId, platformFirstName);
    return;
  }

  if (text === '/menu') {
    const sess = getSession(userId);
    if (sess.step === 'MAIN') {
      await send(ctx, `🏠 Главное меню:`, ATT_MAIN);
    } else {
      await handleStart(ctx, userId, platformFirstName);
    }
    return;
  }

  if (text === '/help') {
    await send(
      ctx,
      `ℹ️ <b>City Legend — помощь</b>\n\n` +
        `/start — начать или перезапустить\n` +
        `/menu — главное меню\n` +
        `/coupon — мой купон на скидку\n` +
        `/help — эта справка\n\n` +
        `🌐 <a href="${SITE_URL}">Открыть сайт</a>`
    );
    return;
  }

  {
    const { isUnsubscribeMessage, unsubscribeBotUser } = await import('@/lib/bots/unsubscribe');
    if (isUnsubscribeMessage(text)) {
      const ok = await unsubscribeBotUser('max', String(userId));
      await send(
        ctx,
        ok
          ? '✅ Вы отписаны от рассылок City Legend. /start — вернуться в меню'
          : 'Вы уже отписаны от рассылок.'
      );
      return;
    }
  }

  if (text === '/coupon') {
    const sess = getSession(userId);
    if (sess.step === 'MAIN') {
      await handleCoupon(ctx, userId, sess);
    } else {
      await handleStart(ctx, userId, platformFirstName);
    }
    return;
  }

  const session = getSession(userId);
  const contact = message.contact;

  if (text === '⬅️ Отмена' && session.step !== 'MAIN') {
    sessions.set(sessKey(userId), { step: 'AUTH_CHOICE' });
    await send(ctx, `Выберите действие:`, ATT_AUTH);
    return;
  }

  if (session.step === 'AUTH_CHOICE') {
    if (text === '📝 Регистрация') {
      sessions.set(sessKey(userId), { step: 'REG_NAME' });
      await send(
        ctx,
        `📝 <b>Регистрация</b>\n\nКак вас зовут? Введите имя:`,
        ATT_BACK
      );
      return;
    }
    if (text === '🔑 Войти в аккаунт') {
      sessions.set(sessKey(userId), { step: 'LOGIN_EMAIL' });
      await send(ctx, `🔑 <b>Вход в аккаунт</b>\n\nВведите ваш email:`, ATT_BACK);
      return;
    }
    await send(ctx, `Выберите действие:`, ATT_AUTH);
    return;
  }

  if (session.step === 'REG_NAME') {
    if (!text) {
      await send(ctx, `Введите ваше имя:`, ATT_BACK);
      return;
    }
    const name = text.normalize('NFC').trim();
    if (name.length < 2) {
      await send(
        ctx,
        `Имя слишком короткое. Напишите, как к вам обращаться (минимум 2 буквы):`,
        ATT_BACK
      );
      return;
    }
    sessions.set(sessKey(userId), { ...session, step: 'REG_PHONE', regName: name });
    await send(
      ctx,
      `Приятно познакомиться, <b>${name}</b>! 😊\n\n` +
        `Теперь поделитесь номером телефона — нажмите кнопку или введите вручную:`,
      ATT_PHONE
    );
    return;
  }

  if (session.step === 'REG_PHONE') {
    const phone = contact?.phone_number ?? text;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{7,15}$/.test(cleaned)) {
      await send(
        ctx,
        `Пожалуйста, введите корректный номер (например: +79001234567):`,
        ATT_PHONE
      );
      return;
    }

    sessions.set(sessKey(userId), { ...session, step: 'REG_EMAIL', regPhone: cleaned });
    await send(
      ctx,
      `📧 Отлично! Теперь введите ваш <b>email</b> — он нужен для входа на сайте citylegend.art:`,
      ATT_BACK
    );
    return;
  }

  if (session.step === 'REG_EMAIL') {
    const email = text.toLowerCase().trim();
    if (!email.includes('@') || !email.includes('.') || email.length < 5) {
      await send(ctx, `Введите корректный email (например: ivan@mail.ru):`, ATT_BACK);
      return;
    }
    sessions.set(sessKey(userId), { ...session, step: 'REG_PASSWORD', regEmail: email });
    await send(
      ctx,
      `🔐 Придумайте <b>пароль</b> для входа на сайт citylegend.art (не меньше 8 символов):`,
      ATT_BACK
    );
    return;
  }

  if (session.step === 'REG_PASSWORD') {
    const email = session.regEmail;
    if (!email) {
      sessions.set(sessKey(userId), { step: 'REG_EMAIL' });
      await send(ctx, `Сначала введите email:`, ATT_BACK);
      return;
    }
    if (text.length < 8) {
      await send(
        ctx,
        `Пароль слишком короткий. Нужно не меньше <b>8 символов</b>.`,
        ATT_BACK
      );
      return;
    }

    const firstName = session.regName ?? platformFirstName;
    await typing(ctx);
    await send(ctx, `⏳ Создаю ваш аккаунт...`);

    try {
      await ensureDatabase();
      const result = await registerBotUser({
        platform: 'max',
        platformUserId: userId,
        firstName,
        phone: session.regPhone ?? '',
        email,
        passwordPlain: text,
      });

      sessions.set(sessKey(userId), {
        step: 'MAIN',
        subscriberId: result.subscriberId,
        cabinetUserId: result.cabinetUserId,
        firstName: result.firstName,
        couponCode: result.couponCode,
      });

      if (result.isNew) {
        await send(
          ctx,
          `🎉 <b>${result.firstName}</b>, вы зарегистрированы!\n\n` +
            `🎁 Ваш купон на скидку <b>10%</b>:\n<code>${result.couponCode}</code>\n\n` +
            `Ниже — QR-код. Код можно также ввести на сайте при оплате.\n\n` +
            `🔐 Вход на сайт: <code>${email}</code> и ваш пароль.`,
          [maxCouponClipboardAttachment(result.couponCode)]
        );
        try {
          const { deliverRegistrationCouponQr } = await import('@/lib/bots/couponDeliver');
          await deliverRegistrationCouponQr({
            platform: 'max',
            platformUserId: userId,
            subscriberId: result.subscriberId,
            couponCode: result.couponCode,
            firstName: result.firstName,
            qrBuffer: result.qrBuffer,
            discountPercent: 10,
          });
        } catch (qrErr) {
          console.error('[Max] Registration QR error:', qrErr);
        }
      } else {
        await send(
          ctx,
          `✅ <b>${result.firstName}</b>, данные сохранены.\n\n` +
            `По этому аккаунту в боте уже был — код купона тот же:\n<code>${result.couponCode}</code>\n\n` +
            `🔐 Вход на сайт: <code>${email}</code> и пароль, который вы только что задали.`,
          [maxCouponClipboardAttachment(result.couponCode)]
        );
      }

      await send(ctx, `🏠 Чем могу помочь?`, ATT_MAIN);
    } catch (err) {
      const msg =
        err instanceof Error && err.message === 'EMAIL_TAKEN'
          ? `Этот email уже занят. Нажмите «🔑 Войти в аккаунт» или укажите другой email.`
          : err instanceof Error && err.message === 'PHONE_TAKEN'
            ? `Этот номер телефона уже привязан к другому аккаунту. Войдите в тот аккаунт или используйте другой номер.`
            : err instanceof Error && err.message === 'PHONE_INVALID'
              ? `Некорректный номер телефона.`
              : `⚠️ Ошибка при регистрации. Попробуйте позже или напишите /start.`;
      console.error('[Max] Registration error:', err);
      sessions.set(sessKey(userId), { step: 'AUTH_CHOICE' });
      await send(ctx, msg, ATT_AUTH);
    }
    return;
  }

  if (session.step === 'LOGIN_EMAIL') {
    const email = text.toLowerCase();
    if (!email.includes('@') || !email.includes('.')) {
      await send(ctx, `Введите корректный email:`, ATT_BACK);
      return;
    }
    sessions.set(sessKey(userId), { ...session, step: 'LOGIN_PASSWORD', loginEmail: email });
    await send(ctx, `🔐 Введите пароль от аккаунта на сайте:`, ATT_BACK);
    return;
  }

  if (session.step === 'LOGIN_PASSWORD') {
    if (!session.loginEmail || !text) return;

    if (looksLikePhone(text)) {
      await send(
        ctx,
        `Это похоже на <b>номер телефона</b>. Нужен <b>пароль</b> от аккаунта на сайте (тот, что вы задавали при регистрации).`,
        ATT_BACK
      );
      return;
    }

    await typing(ctx);

    try {
      await ensureDatabase();

      const userRow = await pool.query<{
        id: number;
        display_name: string;
        password_hash: string;
      }>(`SELECT id, display_name, password_hash FROM cabinet_users WHERE email = $1`, [
        session.loginEmail,
      ]);

      if (userRow.rows.length === 0) {
        sessions.set(sessKey(userId), { step: 'AUTH_CHOICE' });
        await send(
          ctx,
          `❌ Аккаунт с таким email не найден.\n\nПопробуйте ещё раз:`,
          ATT_AUTH
        );
        return;
      }

      const user = userRow.rows[0];
      const valid = await bcrypt.compare(text, user.password_hash);

      if (!valid) {
        await send(
          ctx,
          `❌ Неверный пароль. Введите ещё раз или нажмите ⬅️ Отмена.`,
          ATT_BACK
        );
        return;
      }

      const displayName = user.display_name?.trim() || session.loginEmail!.split('@')[0];

      const subRes = await pool.query<{ id: number }>(
        `INSERT INTO bot_subscribers (platform, platform_user_id, first_name, phone, cabinet_user_id)
         VALUES ('max', $1, $2, '', $3)
         ON CONFLICT (platform, platform_user_id) DO UPDATE
           SET cabinet_user_id = EXCLUDED.cabinet_user_id,
               first_name = EXCLUDED.first_name
         RETURNING id`,
        [userId, displayName, user.id]
      );
      const subscriberId = subRes.rows[0].id;

      const couponRow = await pool.query<{ coupon_code: string }>(
        `SELECT coupon_code FROM bot_coupon_sends
         WHERE subscriber_id = $1
         ORDER BY sent_at DESC LIMIT 1`,
        [subscriberId]
      );

      sessions.set(sessKey(userId), {
        step: 'MAIN',
        subscriberId,
        cabinetUserId: user.id,
        firstName: displayName,
        couponCode: couponRow.rows[0]?.coupon_code,
      });

      await send(
        ctx,
        `✅ <b>${displayName}</b>, вы успешно вошли!\n\nДобро пожаловать 👋`,
        ATT_MAIN
      );
    } catch (err) {
      console.error('[Max] Login error:', err);
      await send(ctx, `⚠️ Ошибка при входе. Попробуйте позже.`);
    }
    return;
  }

  if (session.step === 'MAIN') {
    switch (text) {
      case '🛍 Каталог':
        await handleCatalog(ctx, userId, session);
        break;
      case '🛒 Корзина':
        sessions.set(sessKey(userId), { ...session, catalogOpen: false });
        await handleCart(ctx, { ...session, catalogOpen: false });
        break;
      case '❤️ Избранное':
        sessions.set(sessKey(userId), { ...session, catalogOpen: false });
        await handleFavorites(ctx, { ...session, catalogOpen: false });
        break;
      case '📦 Мои заказы':
        sessions.set(sessKey(userId), { ...session, catalogOpen: false });
        await handleOrders(ctx, { ...session, catalogOpen: false });
        break;
      case '🎁 Мой купон':
        sessions.set(sessKey(userId), { ...session, catalogOpen: false });
        await handleCoupon(ctx, userId, { ...session, catalogOpen: false });
        break;
      case '👤 Профиль':
        sessions.set(sessKey(userId), { ...session, catalogOpen: false });
        await handleProfile(ctx, { ...session, catalogOpen: false });
        break;
      case '💬 Менеджер':
        sessions.set(sessKey(userId), { ...session, catalogOpen: false });
        await handleConcierge(ctx);
        break;
      case '⬅️ Назад':
      case '🏠 Меню':
        sessions.set(sessKey(userId), { ...session, catalogOpen: false });
        await send(ctx, `🏠 Главное меню:`, ATT_MAIN);
        break;
      case '🚪 Выйти':
        sessions.delete(sessKey(userId));
        await send(
          ctx,
          `👋 Вы вышли из аккаунта.\n\nДо встречи! Напишите /start чтобы войти снова.`,
          ATT_AUTH
        );
        break;
      default:
        if (session.catalogOpen) {
          await handleCategorySelect(ctx, userId, session, text);
        } else {
          await send(
            ctx,
            `Я отвечаю на кнопки меню ниже 👇\n\n` +
              `Написать менеджеру удобнее на сайте: там же чат — ` +
              `<a href="${SITE_URL}">citylegend.art</a>\n\n` +
              `Каталог: нажмите <b>🛍 Каталог</b>, затем выберите категорию под сообщением.`,
            ATT_MAIN
          );
        }
    }
    return;
  }

  sessions.set(sessKey(userId), { step: 'AUTH_CHOICE' });
  await send(ctx, `Введите /start чтобы начать.`, ATT_AUTH);
}

/** Точка входа для Max webhook (после проверки секрета). */
export async function handleMaxBotEvent(raw: Record<string, unknown>): Promise<void> {
  const ev = parseMaxWebhook(raw);
  if (!ev) return;

  if (ev.kind === 'bot_started') {
    await handleStart(ev.ctx, ev.ctx.userId, ev.userName);
    return;
  }

  if (ev.kind === 'callback') {
    await handleCallbackQuery(ev.ctx, ev.ctx.userId, ev.payload, ev.callbackId);
    return;
  }

  await dispatchMessage(
    ev.ctx,
    ev.ctx.userId,
    ev.text,
    ev.contactPhone,
    ev.userName
  );
}
