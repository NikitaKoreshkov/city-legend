/** Подстановка переменных в текст рассылки: {имя}, {купон}, {код}, {телефон} */
export function applyBroadcastTemplate(
  text: string,
  vars: {
    firstName?: string;
    couponCode?: string;
    discountPercent?: number;
    phone?: string;
  }
): string {
  const name = vars.firstName?.trim() || 'друг';
  const code = vars.couponCode?.trim().toUpperCase() || '';
  const discount = vars.discountPercent != null ? String(vars.discountPercent) : '';
  return text
    .replace(/\{имя\}/gi, name)
    .replace(/\{name\}/gi, name)
    .replace(/\{код\}/gi, code)
    .replace(/\{code\}/gi, code)
    .replace(/\{купон\}/gi, discount)
    .replace(/\{coupon\}/gi, discount)
    .replace(/\{телефон\}/gi, vars.phone?.trim() || '')
    .replace(/\{phone\}/gi, vars.phone?.trim() || '');
}
