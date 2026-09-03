const DRAFT_KEY = 'citylegend_checkout_customer';

export type CheckoutCustomerDraft = {
  fullName: string;
  phone: string;
  email: string;
  city: string;
  street: string;
  house: string;
  comment: string;
};

export function readCheckoutCustomerDraft(userId: number): CheckoutCustomerDraft | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY}_${userId}`);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<CheckoutCustomerDraft>;
    if (!d || typeof d !== 'object') return null;
    return {
      fullName: String(d.fullName || '').trim(),
      phone: String(d.phone || '').trim(),
      email: String(d.email || '').trim(),
      city: String(d.city || '').trim(),
      street: String(d.street || '').trim(),
      house: String(d.house || '').trim(),
      comment: String(d.comment || '').trim(),
    };
  } catch {
    return null;
  }
}

export function writeCheckoutCustomerDraft(userId: number, draft: CheckoutCustomerDraft): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(`${DRAFT_KEY}_${userId}`, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}
