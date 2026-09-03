import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import pool, { ensureDatabase } from '@/lib/db';
import { registerBotUser } from '@/lib/bots/register';
import { generateCouponQR } from '@/lib/bots/qr';
import { telegramApiFetch } from '@/lib/bots/tgRelay';
import { FormData as TgFormData } from 'undici';
import bcrypt from 'bcryptjs';
import {
  fetchConciergeCustomerInfo,
  notifyStaffNewConciergeTicket,
} from '@/lib/conciergeNotifyStaff';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://citylegend.art';
const TG_API = 'https://api.telegram.org';

// ─── Outgoing API ─────────────────────────────────────────────────────────────

function getToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? '';
}

async function tgCall(
  method: string,
  body: Record<string, unknown>
): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const res = await telegramApiFetch(`${TG_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error(`[TG] API error in ${method}:`, data.description ?? data);
    }
  } catch (e) {
    console.error(`[TG] fetch error in ${method}:`, e);
  }
}

async function send(
  chatId: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<void> {
  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

/** Upload photo buffer directly — avoids "wrong content type" errors from URL-based sending */
async function sendPhotoBuffer(
  chatId: number,
  buffer: Buffer,
  caption: string
): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const form = new TgFormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    form.append('photo', new Blob([arrayBuf], { type: 'image/png' }), 'qr.png');

    const res = await telegramApiFetch(`${TG_API}/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error('[TG] sendPhotoBuffer error:', data.description ?? data);
    }
  } catch (e) {
    console.error('[TG] sendPhotoBuffer fetch error:', e);
  }
}

async function typing(chatId: number): Promise<void> {
  await tgCall('sendChatAction', { chat_id: chatId, action: 'typing' });
}

async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  await tgCall('answerCallbackQuery', { callback_query_id: callbackQueryId });
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

// ─── Keyboards ────────────────────────────────────────────────────────────────

const AUTH_KB = {
  keyboard: [
    [{ text: '📝 Регистрация' }, { text: '🔑 Войти в аккаунт' }],
  ],
  resize_keyboard: true,
};

const MAIN_KB = {
  keyboard: [
    [{ text: '🛍 Каталог' }, { text: '🛒 Корзина' }],
    [{ text: '❤️ Избранное' }, { text: '📦 Мои заказы' }],
    [{ text: '🎁 Мой купон' }, { text: '👤 Профиль' }],
    [{ text: '💬 Менеджер' }, { text: '🚪 Выйти' }],
  ],
  resize_keyboard: true,
};

const PHONE_KB = {
  keyboard: [
    [{ text: '📱 Поделиться номером', request_contact: true }],
    [{ text: '⬅️ Отмена' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
};

const BACK_KB = {
  keyboard: [[{ text: '⬅️ Отмена' }]],
  resize_keyboard: true,
};

const REMOVE_KB = { remove_keyboard: true };

// ─── Session FSM ──────────────────────────────────────────────────────────────

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
  /** true после «🛍 Каталог» — тогда текст воспринимается как название категории */
  catalogOpen?: boolean;
  /** true после «💬 Менеджер» — следующий текст создаёт тикет */
  conciergeOpen?: boolean;
  /** ID активного открытого тикета (продолжение диалога) */
  activeTicketId?: number;
  /** temp during registration */
  regName?: string;
  regPhone?: string;
  regEmail?: string;
  /** temp during login */
  loginEmail?: string;
}

const sessions = new Map<number, Session>();

function getSession(userId: number): Session {
  return sessions.get(userId) ?? { step: 'AUTH_CHOICE' };
}

// ─── QR helper ────────────────────────────────────────────────────────────────

async function saveQrToPublic(couponCode: string, qrBuffer: Buffer): Promise<string> {
  const uploadsBase = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'public');
  const uploadsDir = path.join(uploadsBase, 'uploads', 'qr');
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, `${couponCode}.png`), qrBuffer);
  return `${SITE_URL}/uploads/qr/${couponCode}.png`;
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const userId = message.from?.id ?? chatId;
  const text = (message.text ?? '').trim();
  const contact = message.contact;
  const tgFirstName = message.from?.first_name ?? '';

  // ── Global commands ──────────────────────────────────────────────────────────
  if (text === '/start' || text.startsWith('/start ')) {
    await handleStart(chatId, userId, tgFirstName);
    return;
  }

  if (text === '/menu') {
    const sess = getSession(userId);
    if (sess.step === 'MAIN') {
      await send(chatId, `🏠 Главное меню:`, { reply_markup: MAIN_KB });
    } else {
      await handleStart(chatId, userId, tgFirstName);
    }
    return;
  }

  if (text === '/help') {
    await send(chatId,
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
      const ok = await unsubscribeBotUser('telegram', String(userId));
      await send(
        chatId,
        ok
          ? '✅ Вы отписаны от рассылок City Legend. Чтобы снова получать сообщения — напишите /start'
          : 'Вы уже отписаны от рассылок. /start — вернуться в меню'
      );
      return;
    }
  }

  if (text === '/coupon') {
    const sess = getSession(userId);
    if (sess.step === 'MAIN') {
      await handleCoupon(chatId, userId, sess);
    } else {
      await handleStart(chatId, userId, tgFirstName);
    }
    return;
  }

  const session = getSession(userId);

  // ── Global cancel/back handler ───────────────────────────────────────────────
  if (text === '⬅️ Отмена' && session.step !== 'MAIN') {
    sessions.set(userId, { step: 'AUTH_CHOICE' });
    await send(chatId, `Выберите действие:`, { reply_markup: AUTH_KB });
    return;
  }

  // ── AUTH_CHOICE ──────────────────────────────────────────────────────────────
  if (session.step === 'AUTH_CHOICE') {
    if (text === '📝 Регистрация') {
      sessions.set(userId, { step: 'REG_NAME' });
      await send(chatId,
        `📝 <b>Регистрация</b>\n\nКак вас зовут? Введите имя:`,
        { reply_markup: BACK_KB }
      );
      return;
    }
    if (text === '🔑 Войти в аккаунт') {
      sessions.set(userId, { step: 'LOGIN_EMAIL' });
      await send(chatId,
        `🔑 <b>Вход в аккаунт</b>\n\nВведите ваш email:`,
        { reply_markup: BACK_KB }
      );
      return;
    }
    await send(chatId, `Выберите действие:`, { reply_markup: AUTH_KB });
    return;
  }

  // ── REGISTRATION ─────────────────────────────────────────────────────────────
  if (session.step === 'REG_NAME') {
    if (!text) {
      await send(chatId, `Введите ваше имя:`, { reply_markup: BACK_KB });
      return;
    }
    const name = text.normalize('NFC').trim();
    if (name.length < 2) {
      await send(chatId,
        `Имя слишком короткое. Напишите, как к вам обращаться (минимум 2 буквы):`,
        { reply_markup: BACK_KB }
      );
      return;
    }
    sessions.set(userId, { ...session, step: 'REG_PHONE', regName: name });
    await send(chatId,
      `Приятно познакомиться, <b>${name}</b>! 😊\n\nТеперь поделитесь номером телефона — нажмите кнопку или введите вручную:`,
      { reply_markup: PHONE_KB }
    );
    return;
  }

  if (session.step === 'REG_PHONE') {
    const phone = contact?.phone_number ?? text;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{7,15}$/.test(cleaned)) {
      await send(chatId,
        `Пожалуйста, введите корректный номер (например: +79001234567):`,
        { reply_markup: PHONE_KB }
      );
      return;
    }

    sessions.set(userId, { ...session, step: 'REG_EMAIL', regPhone: cleaned });
    await send(chatId,
      `📧 Отлично! Теперь введите ваш <b>email</b> — он нужен для входа на сайте citylegend.art:`,
      { reply_markup: BACK_KB }
    );
    return;
  }

  if (session.step === 'REG_EMAIL') {
    const email = text.toLowerCase().trim();
    if (!email.includes('@') || !email.includes('.') || email.length < 5) {
      await send(chatId, `Введите корректный email (например: ivan@mail.ru):`, { reply_markup: BACK_KB });
      return;
    }
    sessions.set(userId, { ...session, step: 'REG_PASSWORD', regEmail: email });
    await send(chatId,
      `🔐 Придумайте <b>пароль</b> для входа на сайт citylegend.art (не меньше 8 символов):`,
      { reply_markup: BACK_KB }
    );
    return;
  }

  if (session.step === 'REG_PASSWORD') {
    const email = session.regEmail;
    if (!email) {
      sessions.set(userId, { step: 'REG_EMAIL' });
      await send(chatId, `Сначала введите email:`, { reply_markup: BACK_KB });
      return;
    }
    if (text.length < 8) {
      await send(chatId, `Пароль слишком короткий. Нужно не меньше <b>8 символов</b>.`, { reply_markup: BACK_KB });
      return;
    }

    const firstName = session.regName ?? tgFirstName;
    await typing(chatId);
    await send(chatId, `⏳ Создаю ваш аккаунт...`, { reply_markup: REMOVE_KB });

    try {
      await ensureDatabase();
      const result = await registerBotUser({
        platform: 'telegram',
        platformUserId: String(userId),
        firstName,
        phone: session.regPhone ?? '',
        email,
        passwordPlain: text,
      });

      sessions.set(userId, {
        step: 'MAIN',
        subscriberId: result.subscriberId,
        cabinetUserId: result.cabinetUserId,
        firstName: result.firstName,
        couponCode: result.couponCode,
      });

      if (result.isNew) {
        await send(chatId,
          `🎉 <b>${result.firstName}</b>, вы зарегистрированы!\n\n` +
          `🎁 Ваш купон на скидку <b>10%</b>:\n<code>${result.couponCode}</code>\n\n` +
          `Ниже — QR-код. Код можно также ввести на сайте при оплате.\n\n` +
          `🔐 Вход на сайт: <code>${email}</code> и ваш пароль.`
        );
        try {
          const { deliverRegistrationCouponQr } = await import('@/lib/bots/couponDeliver');
          await deliverRegistrationCouponQr({
            platform: 'telegram',
            platformUserId: String(userId),
            subscriberId: result.subscriberId,
            couponCode: result.couponCode,
            firstName: result.firstName,
            qrBuffer: result.qrBuffer,
            discountPercent: 10,
          });
        } catch (qrErr) {
          console.error('[TG] Registration QR error:', qrErr);
        }
      } else {
        await send(chatId,
          `✅ <b>${result.firstName}</b>, данные сохранены.\n\n` +
          `По этому Telegram аккаунт в боте уже был — код купона тот же:\n<code>${result.couponCode}</code>\n\n` +
          `🔐 Вход на сайт: <code>${email}</code> и пароль, который вы только что задали.`
        );
      }

      await send(chatId, `🏠 Чем могу помочь?`, { reply_markup: MAIN_KB });
    } catch (err) {
      const msg =
        err instanceof Error && err.message === 'EMAIL_TAKEN'
          ? `Этот email уже занят. Нажмите «🔑 Войти в аккаунт» или укажите другой email.`
          : err instanceof Error && err.message === 'PHONE_TAKEN'
            ? `Этот номер телефона уже привязан к другому аккаунту. Войдите в тот аккаунт или используйте другой номер.`
            : err instanceof Error && err.message === 'PHONE_INVALID'
              ? `Некорректный номер телефона.`
              : `⚠️ Ошибка при регистрации. Попробуйте позже или напишите /start.`;
      console.error('[TG] Registration error:', err);
      sessions.set(userId, { step: 'AUTH_CHOICE' });
      await send(chatId, msg, { reply_markup: AUTH_KB });
    }
    return;
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────────
  if (session.step === 'LOGIN_EMAIL') {
    const email = text.toLowerCase();
    if (!email.includes('@') || !email.includes('.')) {
      await send(chatId, `Введите корректный email:`, { reply_markup: BACK_KB });
      return;
    }
    sessions.set(userId, { ...session, step: 'LOGIN_PASSWORD', loginEmail: email });
    await send(chatId, `🔐 Введите пароль от аккаунта на сайте:`, { reply_markup: BACK_KB });
    return;
  }

  if (session.step === 'LOGIN_PASSWORD') {
    if (!session.loginEmail || !text) return;

    if (looksLikePhone(text)) {
      await send(chatId,
        `Это похоже на <b>номер телефона</b>. Нужен <b>пароль</b> от аккаунта на сайте (тот, что вы задавали при регистрации).`,
        { reply_markup: BACK_KB }
      );
      return;
    }

    await typing(chatId);

    try {
      await ensureDatabase();

      const userRow = await pool.query<{
        id: number;
        display_name: string;
        password_hash: string;
      }>(
        `SELECT id, display_name, password_hash FROM cabinet_users WHERE email = $1`,
        [session.loginEmail]
      );

      if (userRow.rows.length === 0) {
        sessions.set(userId, { step: 'AUTH_CHOICE' });
        await send(chatId,
          `❌ Аккаунт с таким email не найден.\n\nПопробуйте ещё раз:`,
          { reply_markup: AUTH_KB }
        );
        return;
      }

      const user = userRow.rows[0];
      const valid = await bcrypt.compare(text, user.password_hash);

      if (!valid) {
        await send(chatId,
          `❌ Неверный пароль. Введите ещё раз или нажмите ⬅️ Отмена.`,
          { reply_markup: BACK_KB }
        );
        return;
      }

      const displayName = user.display_name?.trim() || session.loginEmail!.split('@')[0];

      // Upsert bot subscriber linked to cabinet account
      const subRes = await pool.query<{ id: number }>(
        `INSERT INTO bot_subscribers (platform, platform_user_id, first_name, phone, cabinet_user_id)
         VALUES ('telegram', $1, $2, '', $3)
         ON CONFLICT (platform, platform_user_id) DO UPDATE
           SET cabinet_user_id = EXCLUDED.cabinet_user_id,
               first_name = EXCLUDED.first_name
         RETURNING id`,
        [String(userId), displayName, user.id]
      );
      const subscriberId = subRes.rows[0].id;

      const couponRow = await pool.query<{ coupon_code: string }>(
        `SELECT coupon_code FROM bot_coupon_sends
         WHERE subscriber_id = $1
         ORDER BY sent_at DESC LIMIT 1`,
        [subscriberId]
      );

      sessions.set(userId, {
        step: 'MAIN',
        subscriberId,
        cabinetUserId: user.id,
        firstName: displayName,
        couponCode: couponRow.rows[0]?.coupon_code,
      });

      await send(chatId,
        `✅ <b>${displayName}</b>, вы успешно вошли!\n\nДобро пожаловать 👋`,
        { reply_markup: MAIN_KB }
      );
    } catch (err) {
      console.error('[TG] Login error:', err);
      await send(chatId, `⚠️ Ошибка при входе. Попробуйте позже.`);
    }
    return;
  }

  // ── MAIN MENU ─────────────────────────────────────────────────────────────────
  if (session.step === 'MAIN') {
    switch (text) {
      case '🛍 Каталог':
        await handleCatalog(chatId, userId, session);
        break;
      case '🛒 Корзина':
        sessions.set(userId, { ...session, catalogOpen: false });
        await handleCart(chatId, { ...session, catalogOpen: false });
        break;
      case '❤️ Избранное':
        sessions.set(userId, { ...session, catalogOpen: false });
        await handleFavorites(chatId, { ...session, catalogOpen: false });
        break;
      case '📦 Мои заказы':
        sessions.set(userId, { ...session, catalogOpen: false });
        await handleOrders(chatId, { ...session, catalogOpen: false });
        break;
      case '🎁 Мой купон':
        sessions.set(userId, { ...session, catalogOpen: false });
        await handleCoupon(chatId, userId, { ...session, catalogOpen: false });
        break;
      case '👤 Профиль':
        sessions.set(userId, { ...session, catalogOpen: false });
        await handleProfile(chatId, { ...session, catalogOpen: false });
        break;
      case '💬 Менеджер':
        if (session.activeTicketId) {
          // Уже есть открытый тикет — продолжаем диалог
          sessions.set(userId, { ...session, catalogOpen: false, conciergeOpen: true });
          await send(chatId,
            `💬 У вас открытое обращение <b>#${session.activeTicketId}</b>.\n\nПросто напишите следующее сообщение — оно добавится в тот же чат.`,
            { reply_markup: MAIN_KB }
          );
        } else {
          sessions.set(userId, { ...session, catalogOpen: false, conciergeOpen: true });
          await handleConcierge(chatId, session.cabinetUserId);
        }
        break;
      case '⬅️ Назад':
      case '🏠 Меню':
        sessions.set(userId, { ...session, catalogOpen: false });
        await send(chatId, `🏠 Главное меню:`, { reply_markup: MAIN_KB });
        break;
      case '🚪 Выйти':
        sessions.delete(userId);
        await send(chatId,
          `👋 Вы вышли из аккаунта.\n\nДо встречи! Напишите /start чтобы войти снова.`,
          { reply_markup: AUTH_KB }
        );
        break;
      default:
        if (session.conciergeOpen) {
          const msg = text.trim();
          if (!session.cabinetUserId) {
            sessions.set(userId, { ...session, conciergeOpen: false });
            await send(chatId,
              `Чтобы написать менеджеру, сначала войдите в аккаунт на сайте.\n\nНажмите /start → <b>«Войти в аккаунт»</b>.`,
              { reply_markup: AUTH_KB }
            );
            return;
          }
          if (msg.length < 2) {
            await send(chatId, `Сообщение слишком короткое. Напишите подробнее 🙂`, { reply_markup: MAIN_KB });
            return;
          }
          try {
            await typing(chatId);
            // Если есть активный тикет — добавляем в него
            if (session.activeTicketId) {
              const result = await addMessageToExistingTicket(session.activeTicketId, msg);
              if (result === 'added') {
                await send(chatId, `✉️ Сообщение добавлено в обращение <b>#${session.activeTicketId}</b>.`, { reply_markup: MAIN_KB });
                return;
              }
              // Тикет закрыт — создаём новый
              sessions.set(userId, { ...session, activeTicketId: undefined });
            }
            const { ticketId } = await createConciergeTicketFromBot({
              cabinetUserId: session.cabinetUserId,
              message: msg,
              platform: 'telegram',
              botChatId: chatId,
            });
            sessions.set(userId, { ...session, conciergeOpen: false, activeTicketId: ticketId });
            await send(chatId,
              `✅ Сообщение отправлено менеджеру.\n\nНомер обращения: <b>#${ticketId}</b>\nМы скоро ответим.\n\nМожете писать сюда — я передам ответы менеджеру.`,
              { reply_markup: MAIN_KB }
            );
          } catch (e) {
            console.error('[TG] Concierge create error:', e);
            await send(chatId, `⚠️ Не удалось отправить сообщение. Попробуйте чуть позже.`, { reply_markup: MAIN_KB });
          }
          return;
        }
        // Продолжение активного диалога с менеджером (без нажатия кнопки)
        if (session.activeTicketId && session.cabinetUserId) {
          const msg = text.trim();
          if (msg.length >= 2) {
            try {
              await typing(chatId);
              const result = await addMessageToExistingTicket(session.activeTicketId, msg);
              if (result === 'added') {
                await send(chatId, `✉️ Сообщение добавлено в обращение <b>#${session.activeTicketId}</b>.`, { reply_markup: MAIN_KB });
                return;
              }
              // Тикет закрыт
              sessions.set(userId, { ...session, activeTicketId: undefined });
              await send(chatId, `Обращение <b>#${session.activeTicketId}</b> закрыто менеджером.\n\nЧтобы написать снова — нажмите <b>💬 Менеджер</b>.`, { reply_markup: MAIN_KB });
              return;
            } catch (e) {
              console.error('[TG] addMessage error:', e);
            }
          }
        }
        if (session.catalogOpen) {
          await handleCategorySelect(chatId, userId, session, text);
        } else {
          await send(chatId,
            `Я отвечаю на кнопки меню ниже 👇\n\n` +
            `Написать менеджеру удобнее на сайте: там же чат — ` +
            `<a href="${SITE_URL}">citylegend.art</a>\n\n` +
            `Каталог: нажмите <b>🛍 Каталог</b>, затем выберите категорию под сообщением.`,
            { reply_markup: MAIN_KB }
          );
        }
    }
    return;
  }

  // Unknown state
  sessions.set(userId, { step: 'AUTH_CHOICE' });
  await send(chatId,
    `Введите /start чтобы начать.`,
    { reply_markup: AUTH_KB }
  );
}

// ─── /start — check registration and route ────────────────────────────────────

async function handleStart(
  chatId: number,
  userId: number,
  tgFirstName: string
): Promise<void> {
  sessions.set(userId, { step: 'AUTH_CHOICE' });

  try {
    await ensureDatabase();

    const existing = await pool.query<{
      first_name: string | null;
    }>(
      `SELECT bs.first_name
       FROM bot_subscribers bs
       WHERE bs.platform = 'telegram' AND bs.platform_user_id = $1`,
      [String(userId)]
    );

    if (existing.rows.length > 0) {
      const name = existing.rows[0].first_name || tgFirstName;
      await send(chatId,
        `✨ <b>City Legend</b>\n\n` +
        `Вы уже есть в базе бота как <b>${name}</b>.\n\n` +
        `Чтобы открыть каталог, корзину и купоны — нажмите <b>«🔑 Войти в аккаунт»</b> и введите email и пароль от сайта.\n\n` +
        `Новый аккаунт — кнопка <b>«📝 Регистрация»</b>.`,
        { reply_markup: AUTH_KB }
      );
      return;
    }
  } catch (err) {
    console.error('[TG] handleStart DB error:', err);
  }

  await send(chatId,
    `✨ Добро пожаловать в <b>City Legend</b>!\n\n` +
    `Мы создаём украшения с душой — для тех, кто ценит красоту в деталях.\n\n` +
    `Зарегистрируйтесь и получите персональный купон на скидку <b>10%</b> — или войдите, если уже с нами:`,
    { reply_markup: AUTH_KB }
  );
}

// ─── Callback (inline catalog buttons) ────────────────────────────────────────

interface TelegramCallbackQuery {
  id: string;
  from: { id: number };
  message?: { chat: { id: number } };
  data?: string;
}

async function handleCallbackQuery(q: TelegramCallbackQuery): Promise<void> {
  const data = q.data ?? '';
  const chatId = q.message?.chat.id;
  const userId = q.from.id;
  if (!chatId) return;

  await answerCallbackQuery(q.id);

  if (data === 'c|__back__') {
    const sess = getSession(userId);
    sessions.set(userId, { ...sess, catalogOpen: false });
    await send(chatId, `🏠 Главное меню:`, { reply_markup: MAIN_KB });
    return;
  }

  if (data.startsWith('c|')) {
    const slug = data.slice(2);
    if (!slug || slug === '__back__') return;
    const sess = getSession(userId);
    if (sess.step !== 'MAIN') {
      await send(chatId, `Сначала войдите: /start → «Войти в аккаунт».`, { reply_markup: AUTH_KB });
      return;
    }
    await handleCategoryBySlug(chatId, userId, slug);
  }
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

async function handleCatalog(
  chatId: number,
  _userId: number,
  session: Session
): Promise<void> {
  await typing(chatId);

  try {
    await ensureDatabase();
    const cats = await pool.query<{ name: string; slug: string }>(
      `SELECT name, slug FROM auction_categories ORDER BY sort_order, name LIMIT 16`
    );

    if (cats.rows.length === 0) {
      sessions.set(_userId, { ...session, catalogOpen: false });
      await send(chatId,
        `😕 Каталог пока пуст. Загляните на сайт:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
        { reply_markup: MAIN_KB }
      );
      return;
    }

    sessions.set(_userId, { ...session, step: 'MAIN', catalogOpen: true });

    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < cats.rows.length; i += 2) {
      const a = cats.rows[i];
      const row: { text: string; callback_data: string }[] = [
        { text: a.name.slice(0, 64), callback_data: `c|${a.slug}`.slice(0, 64) },
      ];
      if (cats.rows[i + 1]) {
        const b = cats.rows[i + 1];
        row.push({ text: b.name.slice(0, 64), callback_data: `c|${b.slug}`.slice(0, 64) });
      }
      rows.push(row);
    }
    rows.push([{ text: '⬅️ Главное меню', callback_data: 'c|__back__' }]);

    await send(chatId,
      `🛍 <b>Каталог City Legend</b>\n\nНажмите категорию ниже:`,
      { reply_markup: { inline_keyboard: rows } }
    );
  } catch (err) {
    console.error('[TG] Catalog error:', err);
    await send(chatId, `⚠️ Не удалось загрузить каталог. Попробуйте позже.`, { reply_markup: MAIN_KB });
  }
}

async function handleCategoryBySlug(chatId: number, userId: number, slug: string): Promise<void> {
  await typing(chatId);

  try {
    await ensureDatabase();

    const catRow = await pool.query<{ slug: string; name: string }>(
      `SELECT slug, name FROM auction_categories WHERE slug = $1 LIMIT 1`,
      [slug]
    );

    if (!catRow.rows.length) {
      await send(chatId, `Категория не найдена.`, { reply_markup: MAIN_KB });
      return;
    }

    const { name } = catRow.rows[0];

    await send(chatId, `🔍 Ищу товары в категории <b>${name}</b>...`);
    await typing(chatId);

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
      await send(chatId,
        `😕 В категории «${name}» пока нет товаров.\n\n` +
        `Смотрите весь каталог на сайте:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
        { reply_markup: MAIN_KB }
      );
      return;
    }

    const lines = items.rows.map(item => {
      const priceStr = item.compare_at_price?.trim()
        ? `<s>${item.compare_at_price}</s>  →  <b>${item.starting_price}</b>`
        : `<b>${item.starting_price}</b>`;
      return `💎 <b>${item.name}</b>\n💰 ${priceStr}\n🔗 <a href="${SITE_URL}/collection/${item.id}">Открыть на сайте</a>`;
    });

    await send(chatId,
      `🛍 <b>${name}</b> — ${items.rows.length} товаров:\n\n` +
      lines.join('\n\n───────────────\n\n') +
      `\n\n🔗 <a href="${SITE_URL}/collection?category=${encodeURIComponent(slug)}">Все товары категории →</a>`,
      { reply_markup: MAIN_KB }
    );
  } catch (err) {
    console.error('[TG] Category items error:', err);
    await send(chatId, `⚠️ Не удалось загрузить товары.`, { reply_markup: MAIN_KB });
  } finally {
    const s = getSession(userId);
    sessions.set(userId, { ...s, catalogOpen: false });
  }
}

/** Fallback: пользователь ввёл название вручную */
async function handleCategorySelect(
  chatId: number,
  _userId: number,
  _session: Session,
  text: string
): Promise<void> {
  const norm = text.normalize('NFC').trim();
  await typing(chatId);

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
      await send(chatId,
        `Не нашёл категорию «${norm}». Проверьте написание или нажмите кнопку с категорией под сообщением с каталогом.`,
        { reply_markup: MAIN_KB }
      );
      return;
    }

    await handleCategoryBySlug(chatId, _userId, catRow.rows[0].slug);
  } catch (err) {
    console.error('[TG] Category select error:', err);
    await send(chatId, `⚠️ Ошибка каталога.`, { reply_markup: MAIN_KB });
  }
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

async function handleCart(chatId: number, session: Session): Promise<void> {
  if (!session.cabinetUserId) {
    await send(chatId,
      `🛒 <b>Корзина</b>\n\n` +
      `Чтобы видеть корзину, войдите в аккаунт сайта.\n` +
      `Нажмите /start и выберите <b>«Войти в аккаунт»</b>.\n\n` +
      `Или добавляйте товары напрямую на сайте:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
      { reply_markup: MAIN_KB }
    );
    return;
  }

  await typing(chatId);
  await send(chatId, `🛒 Загружаю вашу корзину...`);
  await typing(chatId);

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
      await send(chatId,
        `🛒 Ваша корзина пуста.\n\nПерейдите в 🛍 Каталог, чтобы выбрать украшение.`,
        { reply_markup: MAIN_KB }
      );
      return;
    }

    const total = items.rows.length;
    const lines = items.rows.map(i =>
      `• <b>${i.name}</b> × ${i.quantity}\n  💰 ${i.starting_price}\n  🔗 <a href="${SITE_URL}/collection/${i.auction_id}">Открыть</a>`
    );

    await send(chatId,
      `🛒 <b>Ваша корзина</b> — ${total} ${pluralize(total, 'товар', 'товара', 'товаров')}:\n\n` +
      lines.join('\n\n') +
      `\n\n🔗 <a href="${SITE_URL}">Оформить заказ на сайте →</a>`,
      { reply_markup: MAIN_KB }
    );
  } catch (err) {
    console.error('[TG] Cart error:', err);
    await send(chatId, `⚠️ Не удалось загрузить корзину.`, { reply_markup: MAIN_KB });
  }
}

// ─── Favorites ────────────────────────────────────────────────────────────────

async function handleFavorites(chatId: number, session: Session): Promise<void> {
  if (!session.cabinetUserId) {
    await send(chatId,
      `❤️ <b>Избранное</b>\n\n` +
      `Войдите в аккаунт сайта, чтобы видеть избранные украшения.\n` +
      `Нажмите /start → <b>«Войти в аккаунт»</b>.`,
      { reply_markup: MAIN_KB }
    );
    return;
  }

  await typing(chatId);
  await send(chatId, `❤️ Ищу ваши любимые украшения...`);
  await typing(chatId);

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
      await send(chatId,
        `❤️ В избранном пока ничего нет.\n\nДобавляйте понравившиеся украшения на сайте:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
        { reply_markup: MAIN_KB }
      );
      return;
    }

    const lines = items.rows.map(i =>
      `❤️ <b>${i.name}</b>\n  💰 ${i.starting_price}\n  🔗 <a href="${SITE_URL}/collection/${i.auction_id}">Открыть</a>`
    );

    await send(chatId,
      `❤️ <b>Ваше избранное</b> — ${items.rows.length} украшений:\n\n` +
      lines.join('\n\n'),
      { reply_markup: MAIN_KB }
    );
  } catch (err) {
    console.error('[TG] Favorites error:', err);
    await send(chatId, `⚠️ Не удалось загрузить избранное.`, { reply_markup: MAIN_KB });
  }
}

// ─── Orders ───────────────────────────────────────────────────────────────────

async function handleOrders(chatId: number, session: Session): Promise<void> {
  if (!session.cabinetUserId) {
    await send(chatId,
      `📦 <b>Заказы</b>\n\n` +
      `Войдите в аккаунт сайта, чтобы видеть историю заказов.\n` +
      `Нажмите /start → <b>«Войти в аккаунт»</b>.`,
      { reply_markup: MAIN_KB }
    );
    return;
  }

  await typing(chatId);
  await send(chatId, `📦 Загружаю историю ваших заказов...`);
  await typing(chatId);

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
      await send(chatId,
        `📦 У вас пока нет заказов.\n\nПерейдите в каталог и выберите украшение:\n🔗 <a href="${SITE_URL}/collection">City Legend</a>`,
        { reply_markup: MAIN_KB }
      );
      return;
    }

    const statusLabel: Record<string, string> = {
      pending:    '⏳ Ожидает оплаты',
      paid:       '✅ Оплачен',
      processing: '🔄 В обработке',
      shipped:    '🚚 Отправлен',
      delivered:  '🎁 Доставлен',
      cancelled:  '❌ Отменён',
      refunded:   '💸 Возврат',
    };

    const lines = orders.rows.map(o => {
      const date = new Date(o.created_at).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      const ref = o.reference_code ? ` #${o.reference_code}` : '';
      const status = statusLabel[o.status] ?? o.status;
      const summary = o.summary_line ? `\n  📋 ${o.summary_line}` : '';
      return `📦 <b>Заказ от ${date}${ref}</b>\n  ${status}\n  💰 ${o.total_display}${summary}`;
    });

    await send(chatId,
      `📦 <b>Ваши заказы</b>:\n\n` +
      lines.join('\n\n───────────────\n\n') +
      `\n\n🔗 <a href="${SITE_URL}">Личный кабинет на сайте →</a>`,
      { reply_markup: MAIN_KB }
    );
  } catch (err) {
    console.error('[TG] Orders error:', err);
    await send(chatId, `⚠️ Не удалось загрузить заказы.`, { reply_markup: MAIN_KB });
  }
}

// ─── Coupon ───────────────────────────────────────────────────────────────────

async function handleCoupon(chatId: number, _subscriberTgUserId: number, session: Session): Promise<void> {
  if (!session.couponCode) {
    await send(chatId,
      `🎁 <b>Персональный купон</b>\n\n` +
      `У вас ещё нет купона. Зарегистрируйтесь, чтобы получить скидку <b>10%</b>:\n\n` +
      `Нажмите /start → <b>«Регистрация»</b>`,
      { reply_markup: MAIN_KB }
    );
    return;
  }

  if (!session.subscriberId) {
    await send(chatId, `Не удалось определить подписку. Напишите /start и войдите снова.`, { reply_markup: MAIN_KB });
    return;
  }

  await typing(chatId);

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
        await send(chatId,
          `📅 QR-код можно получить <b>раз в сутки</b>.\n\n` +
          `Следующая отправка через <b>${formatWaitRu(w.ms)}</b>.\n\n` +
          `Код купона (без QR): <code>${session.couponCode}</code>`,
          { reply_markup: MAIN_KB }
        );
        return;
      }
    }

    const qrBuffer = await generateCouponQR(session.couponCode);
    await saveQrToPublic(session.couponCode, qrBuffer);

    await pool.query(
      `UPDATE bot_subscribers SET last_qr_sent_at = NOW() WHERE id = $1`,
      [session.subscriberId]
    );

    await sendPhotoBuffer(chatId, qrBuffer,
      `🎁 <b>Ваш персональный купон</b>\n\n` +
      `Код: <code>${session.couponCode}</code>\n\n` +
      `Скидка: <b>10%</b> на заказ\n\n` +
      `Скан QR откроет страницу сайта — после входа купон подставится в корзину.\n\n` +
      `🔗 <a href="${SITE_URL}/collection">Каталог</a>`
    );
    await send(chatId, `🏠 Что-то ещё?`, { reply_markup: MAIN_KB });
  } catch (err) {
    console.error('[TG] Coupon QR error:', err);
    await send(chatId,
      `🎁 <b>Ваш купон</b>: <code>${session.couponCode}</code>\n\nВведите при оформлении заказа на сайте.`,
      { reply_markup: MAIN_KB }
    );
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

async function handleProfile(chatId: number, session: Session): Promise<void> {
  await typing(chatId);

  const name = session.firstName ?? '—';
  let text = `👤 <b>Ваш профиль</b>\n\n📛 Имя: <b>${name}</b>`;

  if (session.cabinetUserId) {
    try {
      const userRow = await pool.query<{
        email: string;
        display_name: string;
        created_at: Date;
      }>(
        `SELECT email, display_name, created_at FROM cabinet_users WHERE id = $1`,
        [session.cabinetUserId]
      );
      if (userRow.rows.length > 0) {
        const u = userRow.rows[0];
        const since = new Date(u.created_at).toLocaleDateString('ru-RU', {
          month: 'long', year: 'numeric',
        });
        text += `\n✉️ Email: <b>${u.email}</b>`;
        text += `\n🗓 Клиент с: <b>${since}</b>`;
      }
    } catch { /* ignore */ }
  }

  if (session.couponCode) {
    text += `\n\n🎁 Купон: <code>${session.couponCode}</code>`;
  }

  text += `\n\n🔗 <a href="${SITE_URL}">Открыть личный кабинет →</a>`;

  await send(chatId, text, { reply_markup: MAIN_KB });
}

// ─── Concierge ────────────────────────────────────────────────────────────────

async function handleConcierge(chatId: number, cabinetUserId?: number): Promise<void> {
  const contactInfo =
    `✉️ <a href="mailto:contact@citylegend.art">contact@citylegend.art</a>\n` +
    `🌐 <a href="${SITE_URL}">citylegend.art</a>`;

  if (!cabinetUserId) {
    await send(chatId,
      `💬 <b>Менеджер City Legend</b>\n\n` +
      `Наши специалисты помогут с выбором украшения, оформлением подарка и любыми вопросами.\n\n` +
      contactInfo + `\n\n` +
      `Для быстрой связи через бота — войдите в аккаунт: /start → <b>«Войти в аккаунт»</b>.\n\n` +
      `Напишите ваше сообщение прямо здесь — я передам его команде 🤍`,
      { reply_markup: MAIN_KB }
    );
    return;
  }

  await send(chatId,
    `💬 <b>Менеджер City Legend</b>\n\n` +
    `Наши специалисты помогут с выбором украшения, оформлением подарка и любыми вопросами.\n\n` +
    contactInfo + `\n\n` +
    `Напишите ваше сообщение прямо здесь — я передам его команде, и мы скоро ответим 🤍`,
    { reply_markup: MAIN_KB }
  );
}

async function addMessageToExistingTicket(
  ticketId: number,
  message: string
): Promise<'added' | 'closed' | 'not_found'> {
  await ensureDatabase();
  const res = await pool.query<{ status: string }>(
    `SELECT status FROM cabinet_concierge_tickets WHERE id = $1 LIMIT 1`,
    [ticketId]
  );
  if (!res.rows.length) return 'not_found';
  const { status } = res.rows[0];
  if (status === 'resolved' || status === 'closed') return 'closed';
  await pool.query(
    `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message) VALUES ($1, 'customer', $2)`,
    [ticketId, message.trim()]
  );
  await pool.query(
    `UPDATE cabinet_concierge_tickets
     SET updated_at = NOW(),
         last_customer_message_at = NOW(),
         status = CASE WHEN status = 'waiting_customer' THEN 'in_progress' ELSE status END
     WHERE id = $1`,
    [ticketId]
  );
  return 'added';
}

async function createConciergeTicketFromBot(params: {
  cabinetUserId: number;
  message: string;
  platform: 'telegram' | 'max';
  botChatId: number | string;
}): Promise<{ ticketId: number }> {
  await ensureDatabase();
  const client = await pool.connect();
  try {
    const message = params.message.trim();
    if (message.length < 2) throw new Error('MESSAGE_TOO_SHORT');

    // Ensure bot columns exist
    await client.query(`
      ALTER TABLE cabinet_concierge_tickets
        ADD COLUMN IF NOT EXISTS bot_platform TEXT,
        ADD COLUMN IF NOT EXISTS bot_chat_id TEXT
    `);

    let topic = await client.query<{ topic_key: string; sla_minutes: number; label: string }>(
      `SELECT topic_key, sla_minutes, label
       FROM cabinet_concierge_topics
       WHERE topic_key = 'product_selection'
       LIMIT 1`
    );
    if (topic.rows.length === 0) {
      topic = await client.query<{ topic_key: string; sla_minutes: number; label: string }>(
        `SELECT topic_key, sla_minutes, label
         FROM cabinet_concierge_topics
         ORDER BY sort_order, topic_key
         LIMIT 1`
      );
    }
    if (topic.rows.length === 0) throw new Error('NO_TOPICS');

    const t = topic.rows[0];
    const subject = params.platform === 'telegram'
      ? 'Сообщение из Telegram-бота'
      : 'Сообщение из Max-бота';

    await client.query('BEGIN');
    const ticketRes = await client.query<{ id: number }>(
      `INSERT INTO cabinet_concierge_tickets
         (user_id, topic_key, status, priority, subject, order_id, assigned_manager_name,
          response_sla_minutes, first_response_due_at, last_customer_message_at,
          bot_platform, bot_chat_id)
       VALUES ($1, $2, 'open', 'normal', $3, NULL, 'Premium Concierge', $4,
               CURRENT_TIMESTAMP + ($4::int * INTERVAL '1 minute'), CURRENT_TIMESTAMP,
               $5, $6)
       RETURNING id`,
      [params.cabinetUserId, t.topic_key, subject, Number(t.sla_minutes || 30),
       params.platform, String(params.botChatId)]
    );
    const ticketId = ticketRes.rows[0].id;

    await client.query(
      `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message)
       VALUES ($1, 'customer', $2)`,
      [ticketId, message]
    );
    await client.query(
      `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message)
       VALUES ($1, 'system', $2)`,
      [ticketId, `Спасибо, обращение принято. Тема: ${t.label}. Мы ответим в пределах SLA.`]
    );

    await client.query('COMMIT');

    const customer = await fetchConciergeCustomerInfo(params.cabinetUserId);
    notifyStaffNewConciergeTicket({
      ticketId,
      topicLabel: t.label,
      subject,
      customerName: customer.name,
      customerEmail: customer.email,
      messagePreview: message,
      source: params.platform,
    }).catch((e) => console.error('[createConciergeTicketFromBot notify]', e));

    return { ticketId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ─── Telegram types ───────────────────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string };
  chat: { id: number };
  text?: string;
  contact?: { phone_number: string };
}

// ─── Webhook entry point ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')?.trim() ?? '';
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  if (expectedSecret && secret !== expectedSecret) {
    console.error('[TG Webhook] Secret mismatch (check TELEGRAM_WEBHOOK_SECRET vs setWebhook secret_token)');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!getToken()) {
    console.error('[TG Webhook] TELEGRAM_BOT_TOKEN is missing — updates are ignored');
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Process fully before responding — Telegram allows up to 30s
  // On VPS (non-serverless) this is safe and keeps things simple
  try {
    await handleUpdate(update);
  } catch (err) {
    console.error('[TG Webhook] Unhandled error:', err);
  }

  return NextResponse.json({ ok: true });
}
