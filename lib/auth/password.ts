import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export function validatePassword(password: string): string | null {
  if (password.length < 10) {
    return 'Пароль не короче 10 символов';
  }
  if (password.length > 128) {
    return 'Пароль слишком длинный';
  }
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(password)) {
    return 'Пароль должен содержать хотя бы одну букву';
  }
  if (!/[0-9]/.test(password)) {
    return 'Пароль должен содержать хотя бы одну цифру';
  }
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const e = normalizeEmail(email);
  if (e.length < 5 || e.length > 255) {
    return 'Некорректный email';
  }
  // Практичная проверка без полного RFC
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return 'Некорректный email';
  }
  return null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
