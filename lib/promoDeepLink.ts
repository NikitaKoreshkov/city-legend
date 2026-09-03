/** sessionStorage: купон после /promo?code= или deep-link ?coupon= */
export const PROMO_COUPON_STORAGE_KEY = 'citylegend_prefill_coupon';

/** sessionStorage: вкладка кабинета до монтирования CabinetDashboard */
export const CABINET_PENDING_VIEW_KEY = 'cl_cabinet_pending_view';

/** sessionStorage: один раз открыть кабинет на корзине после /promo (без ?cabinet= в URL) */
export const CABINET_AUTO_OPEN_KEY = 'cl_cabinet_auto_open';

/** sessionStorage: уже обработанный deep-link / SSO (не повторять после refresh) */
export const CABINET_DEEPLINK_DONE_KEY = 'cl_cabinet_deeplink_done';

/** sessionStorage: кабинет был открыт — восстановить после refresh */
export const CABINET_RESTORE_OPEN_KEY = 'cl_cabinet_restore_open';

/** sessionStorage: активная вкладка кабинета — восстановить после refresh */
export const CABINET_RESTORE_VIEW_KEY = 'cl_cabinet_restore_view';

export function markCabinetRestoreOpen(): void {
  try {
    sessionStorage.setItem(CABINET_RESTORE_OPEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function persistCabinetRestoreView(viewId: string): void {
  try {
    sessionStorage.setItem(CABINET_RESTORE_VIEW_KEY, viewId);
  } catch {
    /* ignore */
  }
}

export function readCabinetRestoreOpen(): boolean {
  try {
    return sessionStorage.getItem(CABINET_RESTORE_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function readCabinetRestoreView(): string | null {
  try {
    return sessionStorage.getItem(CABINET_RESTORE_VIEW_KEY);
  } catch {
    return null;
  }
}

export function clearCabinetRestoreState(): void {
  try {
    sessionStorage.removeItem(CABINET_RESTORE_OPEN_KEY);
    sessionStorage.removeItem(CABINET_RESTORE_VIEW_KEY);
  } catch {
    /* ignore */
  }
}

/** Legacy deep-link с ?cabinet=1 — для старых ссылок из ботов. */
export function buildCabinetCartDeepLink(couponCode?: string): string {
  const params = new URLSearchParams({ cabinet: '1', view: 'cart' });
  const code = couponCode?.trim().toUpperCase();
  if (code) params.set('coupon', code);
  return `/?${params.toString()}`;
}

export function persistPromoCouponForCabinet(couponCode: string): void {
  const code = couponCode.trim().toUpperCase();
  if (!code) return;
  try {
    sessionStorage.setItem(PROMO_COUPON_STORAGE_KEY, code);
    sessionStorage.setItem(CABINET_PENDING_VIEW_KEY, 'cabinet-cart');
    sessionStorage.setItem(CABINET_AUTO_OPEN_KEY, '1');
  } catch {
    /* private mode / SSR */
  }
}

/** После /promo без кода — только открыть корзину на главной. */
export function markCabinetAutoOpenCart(): void {
  try {
    sessionStorage.setItem(CABINET_PENDING_VIEW_KEY, 'cabinet-cart');
    sessionStorage.setItem(CABINET_AUTO_OPEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeCabinetAutoOpen(): boolean {
  try {
    if (sessionStorage.getItem(CABINET_AUTO_OPEN_KEY) !== '1') return false;
    sessionStorage.removeItem(CABINET_AUTO_OPEN_KEY);
    return true;
  } catch {
    return false;
  }
}

export function cancelCabinetAutoOpen(): void {
  try {
    sessionStorage.removeItem(CABINET_AUTO_OPEN_KEY);
  } catch {
    /* ignore */
  }
}

export function readPromoCouponFromStorage(): string | null {
  try {
    const raw = sessionStorage.getItem(PROMO_COUPON_STORAGE_KEY);
    return raw?.trim().toUpperCase() || null;
  } catch {
    return null;
  }
}
