import crypto from 'crypto';

/**
 * Подпись запроса/уведомления по правилам T-Bank / Tinkoff Acquiring.
 * Password добавляется как ключ и участвует в алфавитной сортировке
 * (не дописывается в конец) — иначе Init отдаёт «Неверный токен».
 * @see https://developer.tinkoff.ru/eacq/intro/developer/token
 */
export function tbankSignToken(
  params: Record<string, unknown>,
  password: string
): string {
  const parts: Record<string, string> = {};
  for (const [key, raw] of Object.entries(params)) {
    if (key === 'Token' || key === 'Receipt' || key === 'DATA' || key === 'Password') continue;
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw === 'object') continue;
    parts[key] = typeof raw === 'boolean' ? (raw ? 'true' : 'false') : String(raw);
  }
  parts.Password = password;
  const keys = Object.keys(parts).sort();
  const concatenated = keys.map((k) => parts[k]).join('');
  return crypto.createHash('sha256').update(concatenated, 'utf8').digest('hex');
}

export function tbankVerifyToken(
  params: Record<string, unknown>,
  password: string,
  token: string | undefined
): boolean {
  if (!token || typeof token !== 'string') return false;
  const expected = tbankSignToken(params, password);
  return expected.toLowerCase() === token.toLowerCase();
}

export function getTbankApiBaseUrl(): string {
  const fromEnv = process.env.TBANK_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // По умолчанию боевой хост v2 API; публичный DEMO-терминал оттуда же отдаёт тестовые платежи.
  // rest-api-test.tinkoff.ru в доках встречается часто, но с части сетей даёт 403 HTML вместо JSON.
  return 'https://securepay.tinkoff.ru';
}

async function readTbankJsonResponse(res: Response): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string; errorCode?: string }
> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) {
    return {
      ok: false,
      message: `Ответ банка не JSON (HTTP ${res.status}). Проверьте TBANK_API_URL или доступность API с вашей сети.`,
    };
  }
  try {
    return { ok: true, data: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { ok: false, message: 'Не удалось разобрать JSON ответа банка' };
  }
}

export type TbankInitResult =
  | { ok: true; paymentId: string; paymentUrl: string; orderId: string }
  | { ok: false; message: string; errorCode?: string };

/** Налоговая система ИП/ООО для чеков ОФД. */
export type TbankTaxation =
  | 'osn'
  | 'usn_income'
  | 'usn_income_outcome'
  | 'envd'
  | 'esn'
  | 'patent';

/** Ставка НДС в позиции чека. */
export type TbankVat =
  | 'none'
  | 'vat0'
  | 'vat10'
  | 'vat20'
  | 'vat110'
  | 'vat120'
  | 'vat105'
  | 'vat107';

export type TbankReceiptItem = {
  Name: string;
  Price: number; // в копейках за единицу
  Quantity: number; // штуки (целое или десятичное «шт»)
  Amount: number; // в копейках = Price × Quantity
  Tax: TbankVat;
  PaymentMethod?:
    | 'full_prepayment'
    | 'prepayment'
    | 'advance'
    | 'full_payment'
    | 'partial_payment'
    | 'credit'
    | 'credit_payment';
  PaymentObject?:
    | 'commodity'
    | 'excise'
    | 'job'
    | 'service'
    | 'gambling_bet'
    | 'gambling_prize'
    | 'lottery'
    | 'lottery_prize'
    | 'intellectual_activity'
    | 'payment'
    | 'agent_commission'
    | 'composite'
    | 'another';
};

export type TbankReceipt = {
  Email?: string;
  Phone?: string;
  Taxation: TbankTaxation;
  Items: TbankReceiptItem[];
};

export async function tbankInitPayment(opts: {
  terminalKey: string;
  password: string;
  amountKopecks: number;
  orderId: string;
  description: string;
  successUrl: string;
  failUrl: string;
  notificationUrl: string;
  receipt?: TbankReceipt;
}): Promise<TbankInitResult> {
  const base = getTbankApiBaseUrl();
  const body: Record<string, unknown> = {
    TerminalKey: opts.terminalKey,
    Amount: opts.amountKopecks,
    OrderId: opts.orderId,
    Description: opts.description.slice(0, 140),
    SuccessURL: opts.successUrl,
    FailURL: opts.failUrl,
    NotificationURL: opts.notificationUrl,
    PayType: 'O',
  };
  body.Token = tbankSignToken(body, opts.password);
  if (opts.receipt) {
    // Receipt передаётся отдельно от подписи — он исключён из расчёта Token.
    body.Receipt = opts.receipt;
  }

  const res = await fetch(`${base}/v2/Init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CityLegend/1.0 (+https://github.com/)',
    },
    body: JSON.stringify(body),
  });
  const parsed = await readTbankJsonResponse(res);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, errorCode: parsed.errorCode };
  }
  const data = parsed.data as {
    Success?: boolean;
    ErrorCode?: string;
    Message?: string;
    PaymentId?: number | string;
    PaymentURL?: string;
    OrderId?: string;
  };

  if (!data.Success || !data.PaymentURL || data.PaymentId == null) {
    const details = (parsed.data as { Details?: string }).Details;
    const baseMsg = (typeof data.Message === 'string' && data.Message) || 'Init отклонён';
    const message =
      typeof details === 'string' && details.trim() ? `${baseMsg} ${details.trim()}` : baseMsg;
    return {
      ok: false,
      message,
      errorCode: typeof data.ErrorCode === 'string' ? data.ErrorCode : undefined,
    };
  }

  return {
    ok: true,
    paymentId: String(data.PaymentId),
    paymentUrl: String(data.PaymentURL),
    orderId: String(data.OrderId ?? opts.orderId),
  };
}

export type TbankGetStateResult =
  | { ok: true; status: string; amountKopecks: number }
  | { ok: false; message: string };

/** Синхронизация статуса с банком (если вебхук задержался). */
export async function tbankGetState(opts: {
  terminalKey: string;
  password: string;
  paymentId: string;
}): Promise<TbankGetStateResult> {
  const base = getTbankApiBaseUrl();
  const pid = Number(opts.paymentId);
  const body: Record<string, unknown> = {
    TerminalKey: opts.terminalKey,
    PaymentId: Number.isFinite(pid) ? pid : opts.paymentId,
  };
  body.Token = tbankSignToken(body, opts.password);

  const res = await fetch(`${base}/v2/GetState`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CityLegend/1.0 (+https://github.com/)',
    },
    body: JSON.stringify(body),
  });
  const parsed = await readTbankJsonResponse(res);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  const data = parsed.data as {
    Success?: boolean;
    ErrorCode?: string;
    Message?: string;
    Status?: string;
    Amount?: number;
  };

  if (!data.Success || !data.Status) {
    return {
      ok: false,
      message: (typeof data.Message === 'string' && data.Message) || 'GetState недоступен',
    };
  }

  return {
    ok: true,
    status: String(data.Status),
    amountKopecks: Number(data.Amount ?? 0),
  };
}

export type TbankCancelResult =
  | { ok: true; status: string }
  | { ok: false; message: string; errorCode?: string };

/** Отмена/возврат платежа (Cancel) с чеком возврата. */
export async function tbankCancelPayment(opts: {
  terminalKey: string;
  password: string;
  paymentId: string;
  receipt?: TbankReceipt;
}): Promise<TbankCancelResult> {
  const base = getTbankApiBaseUrl();
  const pid = Number(opts.paymentId);
  const body: Record<string, unknown> = {
    TerminalKey: opts.terminalKey,
    PaymentId: Number.isFinite(pid) ? pid : opts.paymentId,
  };
  body.Token = tbankSignToken(body, opts.password);
  if (opts.receipt) {
    body.Receipt = opts.receipt;
  }

  const res = await fetch(`${base}/v2/Cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CityLegend/1.0 (+https://github.com/)',
    },
    body: JSON.stringify(body),
  });
  const parsed = await readTbankJsonResponse(res);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, errorCode: parsed.errorCode };
  }
  const data = parsed.data as {
    Success?: boolean;
    ErrorCode?: string;
    Message?: string;
    Status?: string;
  };

  if (!data.Success) {
    return {
      ok: false,
      message: (typeof data.Message === 'string' && data.Message) || 'Cancel отклонён',
      errorCode: typeof data.ErrorCode === 'string' ? data.ErrorCode : undefined,
    };
  }

  return {
    ok: true,
    status: String(data.Status ?? 'REFUNDED'),
  };
}
