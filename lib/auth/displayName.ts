export function validateDisplayName(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.length < 2) {
    return 'Имя — не менее 2 символов';
  }
  if (t.length > 120) {
    return 'Имя слишком длинное';
  }
  if (!/^[a-zA-Zа-яА-ЯёЁ\s\-'.]+$/u.test(t)) {
    return 'Имя: только буквы, пробел, дефис или точка';
  }
  return null;
}

export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
