/** Parse YYYY-MM-DD or empty → ISO date string or null */
export function parseBirthDate(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(`${y}-${mo}-${d}T12:00:00Z`);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== Number(y) ||
    dt.getUTCMonth() + 1 !== Number(mo) ||
    dt.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

export function validateBirthDate(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const parsed = parseBirthDate(t);
  if (!parsed) return 'Укажите дату рождения в формате ГГГГ-ММ-ДД';
  const birth = new Date(`${parsed}T12:00:00Z`);
  const now = new Date();
  if (birth > now) return 'Дата рождения не может быть в будущем';
  const ageMs = now.getTime() - birth.getTime();
  const ageYears = ageMs / (365.25 * 24 * 3600_000);
  if (ageYears < 14) return 'Регистрация доступна с 14 лет';
  if (ageYears > 120) return 'Проверьте дату рождения';
  return null;
}

export function formatBirthDateForInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = String(iso).slice(0, 10).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}
