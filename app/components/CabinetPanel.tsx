'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearCabinetRestoreState, readPromoCouponFromStorage } from '@/lib/promoDeepLink';
import CabinetDashboard from './CabinetDashboard';

type CabinetUser = { id: number; email: string; name: string; birthDate?: string | null };
type PanelMode = 'login' | 'register' | 'verify' | 'forgot' | 'forgot-sent';

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

// ─── OTP Code Input ────────────────────────────────────────────────────────────

function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  const focusIndex = (i: number) => {
    const el = inputsRef.current[Math.max(0, Math.min(5, i))];
    el?.focus();
    el?.select();
  };

  const handleChange = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-1);
    const next = digits.map((v, idx) => (idx === i ? d : v)).join('').slice(0, 6);
    onChange(next);
    if (d && i < 5) setTimeout(() => focusIndex(i + 1), 0);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = digits.map((v, idx) => (idx === i ? '' : v)).join('');
        onChange(next);
      } else if (i > 0) {
        focusIndex(i - 1);
        const next = digits.map((v, idx) => (idx === i - 1 ? '' : v)).join('');
        onChange(next);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      focusIndex(i - 1); e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      focusIndex(i + 1); e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    onChange(pasted);
    setTimeout(() => focusIndex(Math.min(pasted.length, 5)), 0);
  };

  return (
    <div
      className="grid grid-cols-6 gap-1.5 sm:gap-2 w-full max-w-[min(100%,18.5rem)] mx-auto"
      onPaste={handlePaste}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          className={[
            'w-full min-w-0 h-11 sm:h-12 md:h-14 text-center text-lg sm:text-xl font-semibold border-b-2 bg-transparent',
            'focus:outline-none transition-colors duration-200',
            d ? 'border-[#0b2a24] text-[#0b2a24]' : 'border-gray-300',
            'focus:border-[#0b2a24]',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
          ].join(' ')}
          style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: 0 }}
          aria-label={`Цифра ${i + 1}`}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
        />
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CabinetPanel() {
  const [user, setUser] = useState<CabinetUser | null | undefined>(undefined);
  const [mode, setMode] = useState<PanelMode>('login');

  // Auth fields
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // Verification
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');

  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [pendingPromoCode, setPendingPromoCode] = useState<string | null>(null);

  useEffect(() => {
    setPendingPromoCode(readPromoCouponFromStorage());
  }, [user, mode]);

  const loadMe = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      const u = data.user;
      if (u && typeof u.id === 'number' && typeof u.email === 'string') {
        setUser({
          id: u.id,
          email: u.email,
          name: typeof u.name === 'string' ? u.name : '',
          birthDate: typeof u.birthDate === 'string' ? u.birthDate : null,
        });
        return true;
      }
      setUser(null);
      return false;
    } catch {
      setUser(null);
      return false;
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  useEffect(() => {
    const onSessionChanged = () => {
      void loadMe();
    };
    window.addEventListener('cabinetSessionChanged', onSessionChanged);
    return () => window.removeEventListener('cabinetSessionChanged', onSessionChanged);
  }, [loadMe]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(v => v - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const resetFields = () => {
    setDisplayName(''); setEmail(''); setPassword(''); setPasswordConfirm(''); setBirthDate('');
    setShowPassword(false); setShowPasswordConfirm(false);
    setOtpCode(''); setForgotEmail(''); setError('');
  };

  const switchMode = (next: PanelMode) => {
    resetFields();
    setMode(next);
  };

  // ─── Login / Register submit ─────────────────────────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== passwordConfirm) {
      setError('Пароли не совпадают'); return;
    }
    setPending(true);
    const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = mode === 'login'
      ? { email, password }
      : { name: displayName, email, password, passwordConfirm, birthDate: birthDate.trim() || undefined };
    try {
      const res = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      setPending(false);

      if (!res.ok) {
        // Email не подтверждён — просто показываем ошибку (не экран кода)
        if (data.error === 'EMAIL_NOT_VERIFIED') {
          setError('Сначала подтвердите email. Проверьте почту — код был отправлен при регистрации.');
          return;
        }
        setError(typeof data.error === 'string' ? data.error : 'Что-то пошло не так');
        return;
      }

      // Register returns pendingVerification
      if (data.pendingVerification && typeof data.email === 'string') {
        setVerifyEmail(data.email);
        setOtpCode('');
        setError('');
        setMode('verify');
        setResendCooldown(60);
        return;
      }

      // Login returns user directly
      if (data.user && typeof (data.user as Record<string, unknown>).id === 'number') {
        const sessionOk = await loadMe();
        if (!sessionOk) {
          setError('Вход выполнен, но сессия не сохранилась. Попробуйте обновить страницу или войти снова.');
          return;
        }
        window.dispatchEvent(new CustomEvent('cabinetSessionChanged'));
        resetFields();
      }
    } catch {
      setPending(false);
      setError('Нет соединения с сервером');
    }
  };

  // ─── OTP verify submit ────────────────────────────────────────────────────────
  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length < 6) { setError('Введите все 6 цифр'); return; }
    setError(''); setPending(true);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ email: verifyEmail, code: otpCode }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      setPending(false);
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Ошибка'); return; }
      const sessionOk = await loadMe();
      if (!sessionOk) {
        setError('Код принят, но сессия не сохранилась. Попробуйте войти по паролю.');
        return;
      }
      window.dispatchEvent(new CustomEvent('cabinetSessionChanged'));
      resetFields();
    } catch {
      setPending(false);
      setError('Нет соединения с сервером');
    }
  };

  // ─── Resend code ──────────────────────────────────────────────────────────────
  const onResend = async () => {
    if (resendCooldown > 0) return;
    setError(''); setResendCooldown(60);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setResendCooldown(0);
        setError(typeof data.error === 'string' ? data.error : 'Не удалось отправить код');
      }
    } catch {
      setResendCooldown(0);
      setError('Нет соединения с сервером');
    }
  };

  // ─── Forgot password submit ───────────────────────────────────────────────────
  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setPending(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Не удалось отправить письмо');
        return;
      }
      setMode('forgot-sent');
    } catch {
      setError('Нет соединения с сервером');
    } finally {
      setPending(false);
    }
  };

  const logout = async () => {
    setPending(true);
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); }
    finally {
      clearCabinetRestoreState();
      setPending(false);
      setUser(null);
      resetFields();
    }
  };

  const inputBase = 'w-full py-3.5 px-0 text-sm bg-transparent border-0 border-b border-gray-300/90 focus:outline-none focus:border-[#0b2a24] transition-colors duration-300 placeholder:text-gray-400/80';
  const passwordRowClass = 'relative flex items-stretch border-b border-gray-300/90 focus-within:border-[#0b2a24] transition-colors duration-300';
  const linkBtn = 'text-[#0b2a24] relative inline-block group border-0 bg-transparent cursor-pointer p-0';

  // ─── Screens ──────────────────────────────────────────────────────────────────

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] py-20 px-4" style={{ fontFamily: 'var(--font-open-sans)' }}>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400">Загрузка</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex flex-col flex-1 min-h-0 w-full md:overflow-hidden">
        <CabinetDashboard user={user} onLogout={logout} />
      </div>
    );
  }

  const card = (
    <div
      className="w-full max-w-[420px] box-border px-5 py-8 sm:px-8 sm:py-10 md:px-12 md:py-14 bg-white/70 backdrop-blur-[2px] border border-gray-200/60"
      style={{ boxShadow: '0 24px 48px -24px rgba(11, 42, 36, 0.12)' }}
    >

      {/* ── Email verification screen ── */}
      {mode === 'verify' && (
        <>
          <div className="text-center mb-8" style={{ fontFamily: 'var(--font-playfair-display)', color: 'var(--color-classic-black)' }}>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-4" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>
              Подтверждение
            </p>
            <h2 className="text-[1.65rem] md:text-3xl font-normal italic leading-tight" style={{ letterSpacing: '0.02em' }}>
              Введите код
            </h2>
          </div>
          <p className="text-[12px] text-gray-500 text-center mb-6 leading-relaxed px-0.5" style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}>
            Мы отправили 6-значный код на{' '}
            <span className="block sm:inline mt-1 sm:mt-0 text-[#0b2a24] font-medium break-all">{verifyEmail}</span>
          </p>
          <form onSubmit={onVerify} className="space-y-5 sm:space-y-6">
            <OtpInput value={otpCode} onChange={setOtpCode} disabled={pending} />
            <p className="text-[10px] text-gray-400 text-center leading-relaxed px-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Код можно скопировать из письма и вставить — он подставится автоматически.
            </p>
            {error && (
              <p className="text-xs text-red-900/90 bg-red-50/90 border border-red-100/80 px-3 py-3 sm:px-4 sm:py-3.5 leading-relaxed text-left sm:text-center break-words" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending || otpCode.length < 6}
              className="w-full py-4 text-[11px] uppercase tracking-[0.18em] bg-[#0b2a24] text-white hover:bg-[#0d332c] disabled:opacity-55 transition-colors"
              style={{ fontFamily: 'var(--font-open-sans)', cursor: (pending || otpCode.length < 6) ? 'wait' : 'pointer' }}
            >
              {pending ? 'Проверка…' : 'Подтвердить'}
            </button>
          </form>
          <div className="mt-6 sm:mt-8 pt-6 sm:pt-7 border-t border-gray-200/70 text-center space-y-3 px-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Не пришло письмо?{' '}
              <button
                type="button"
                onClick={onResend}
                disabled={resendCooldown > 0}
                className={resendCooldown > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-[#0b2a24] underline underline-offset-2 hover:no-underline cursor-pointer'}
                style={{ background: 'none', border: 'none', padding: 0 }}
              >
                {resendCooldown > 0 ? `Отправить снова (${resendCooldown}с)` : 'Отправить снова'}
              </button>
            </p>
            <p className="text-[11px] text-gray-500">
              <button type="button" onClick={() => switchMode('login')} className={linkBtn} style={{ letterSpacing: '0.04em' }}>
                <span className="text-gray-400 hover:text-[#0b2a24] transition-colors">← Назад</span>
              </button>
            </p>
          </div>
        </>
      )}

      {/* ── Forgot password screen ── */}
      {mode === 'forgot' && (
        <>
          <div className="text-center mb-8" style={{ fontFamily: 'var(--font-playfair-display)', color: 'var(--color-classic-black)' }}>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-4" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>
              Восстановление
            </p>
            <h2 className="text-[1.65rem] md:text-3xl font-normal italic leading-tight" style={{ letterSpacing: '0.02em' }}>
              Забыли пароль?
            </h2>
          </div>
          <p className="text-[12px] text-gray-500 mb-7 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Введите email — мы пришлём ссылку для сброса пароля.
          </p>
          <form onSubmit={onForgot} className="space-y-7">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.14em] mb-2.5" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>Email</label>
              <input
                type="email" autoComplete="email" required
                value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                placeholder="name@example.com"
                className={inputBase}
                style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-classic-black)', letterSpacing: '0.03em' }}
              />
            </div>
            {error && (
              <p className="text-xs text-red-900/90 bg-red-50/90 border border-red-100/80 px-4 py-3.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {error}
              </p>
            )}
            <button
              type="submit" disabled={pending}
              className="w-full py-4 text-[11px] uppercase tracking-[0.18em] bg-[#0b2a24] text-white hover:bg-[#0d332c] disabled:opacity-55 transition-colors"
              style={{ fontFamily: 'var(--font-open-sans)', cursor: pending ? 'wait' : 'pointer' }}
            >
              {pending ? 'Подождите…' : 'Отправить ссылку'}
            </button>
          </form>
          <div className="mt-8 pt-7 border-t border-gray-200/70 text-center" style={{ fontFamily: 'var(--font-open-sans)' }}>
            <p className="text-[11px] text-gray-500">
              <button type="button" onClick={() => switchMode('login')} className={linkBtn} style={{ letterSpacing: '0.04em' }}>
                <span className="text-gray-400 hover:text-[#0b2a24] transition-colors">← Назад ко входу</span>
              </button>
            </p>
          </div>
        </>
      )}

      {/* ── Forgot password sent ── */}
      {mode === 'forgot-sent' && (
        <div className="text-center space-y-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>Проверьте почту</p>
          <h2 className="text-[1.65rem] font-normal italic text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)', letterSpacing: '0.02em' }}>
            Ссылка отправлена
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Если аккаунт{' '}
            <span className="font-medium text-[#0b2a24] break-all">{forgotEmail}</span>{' '}
            зарегистрирован, письмо отправлено с{' '}
            <span className="break-all">citylegendcult@gmail.com</span>.<br />
            Проверьте «Спам» и «Промоакции», поиск: «Сброс пароля».
          </p>
          <button type="button" onClick={() => switchMode('login')}
            className="mt-2 text-[11px] uppercase tracking-[0.18em] py-4 px-8 bg-[#0b2a24] text-white hover:bg-[#0d332c] transition-colors"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            Назад ко входу
          </button>
        </div>
      )}

      {/* ── Login / Register ── */}
      {(mode === 'login' || mode === 'register') && (
        <>
          <div className="text-center mb-9" style={{ fontFamily: 'var(--font-playfair-display)', color: 'var(--color-classic-black)' }}>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-4" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>
              {mode === 'login' ? 'С возвращением' : 'Новый аккаунт'}
            </p>
            <h2 className="text-[1.65rem] md:text-3xl mb-2 font-normal italic leading-tight" style={{ letterSpacing: '0.02em' }}>
              {mode === 'login' ? 'Вход' : 'Регистрация'}
            </h2>
            <div className="flex items-center justify-center gap-4 my-6">
              <div className="h-px bg-gradient-to-r from-transparent to-gray-300 flex-1 max-w-[48px]" />
              <span className="text-[9px] uppercase tracking-[0.22em]" style={{ fontFamily: 'var(--font-open-sans)', color: '#0b2a24', opacity: 0.85 }}>Личный кабинет</span>
              <div className="h-px bg-gradient-to-l from-transparent to-gray-300 flex-1 max-w-[48px]" />
            </div>
            <p className="text-[11px] text-gray-500 font-light leading-relaxed max-w-xs mx-auto" style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.04em' }}>
              Защищённое соединение. Данные надёжно хранятся.
            </p>
          </div>

          {pendingPromoCode && (mode === 'login' || mode === 'register') ? (
            <div
              className="mb-6 p-4 border border-emerald-200 bg-emerald-50/90 text-center"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-800 mb-1">
                Купон из QR
              </p>
              <p className="text-sm text-emerald-950">
                После входа код{' '}
                <code className="text-[13px] bg-white/80 px-1.5 py-0.5">{pendingPromoCode}</code>{' '}
                автоматически активируется в корзине.
              </p>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-7">
            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="cabinet-name" className="block text-[10px] uppercase tracking-[0.14em] mb-2.5" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>Имя</label>
                  <input id="cabinet-name" name="name" type="text" autoComplete="name" required
                    value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="Как к вам обращаться"
                    className={inputBase}
                    style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-classic-black)', letterSpacing: '0.03em' }}
                  />
                </div>
                <div>
                  <label htmlFor="cabinet-birth" className="block text-[10px] uppercase tracking-[0.14em] mb-2.5" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>День рождения <span className="normal-case tracking-normal text-gray-400">(необязательно)</span></label>
                  <input id="cabinet-birth" name="birthDate" type="date"
                    value={birthDate} onChange={e => setBirthDate(e.target.value)}
                    className={inputBase}
                    style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-classic-black)', letterSpacing: '0.03em' }}
                  />
                  <p className="text-[10px] text-gray-400 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>Для персональных поздравлений и привилегий</p>
                </div>
              </>
            )}
            <div>
              <label htmlFor="cabinet-email" className="block text-[10px] uppercase tracking-[0.14em] mb-2.5" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>Email</label>
              <input id="cabinet-email" name="email" type="email" autoComplete="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={inputBase}
                style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-classic-black)', letterSpacing: '0.03em' }}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label htmlFor="cabinet-password" className="text-[10px] uppercase tracking-[0.14em]" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>Пароль</label>
                {mode === 'login' && (
                  <button type="button" onClick={() => { setForgotEmail(email); switchMode('forgot'); }}
                    className="text-[10px] text-gray-400 hover:text-[#0b2a24] transition-colors tracking-wide"
                    style={{ fontFamily: 'var(--font-open-sans)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    Забыли пароль?
                  </button>
                )}
              </div>
              <div className={passwordRowClass}>
                <input id="cabinet-password" name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required value={password} onChange={e => setPassword(e.target.value)}
                  minLength={mode === 'register' ? 10 : 1}
                  className="flex-1 min-w-0 py-3.5 pr-2 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
                  style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-classic-black)', letterSpacing: '0.03em' }}
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="shrink-0 flex items-center justify-center px-2 py-2 text-gray-500 hover:text-[#0b2a24] transition-colors"
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPassword}>
                  <EyeIcon open={!showPassword} />
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-[10px] text-gray-500 mt-3 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.03em' }}>
                  Не менее 10 символов, буква и цифра.
                </p>
              )}
            </div>
            {mode === 'register' && (
              <div>
                <label htmlFor="cabinet-password2" className="block text-[10px] uppercase tracking-[0.14em] mb-2.5" style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-marble-grey-regular)' }}>Повторите пароль</label>
                <div className={passwordRowClass}>
                  <input id="cabinet-password2" name="passwordConfirm"
                    type={showPasswordConfirm ? 'text' : 'password'} autoComplete="new-password"
                    required value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} minLength={10}
                    className="flex-1 min-w-0 py-3.5 pr-2 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
                    style={{ fontFamily: 'var(--font-open-sans)', color: 'var(--color-classic-black)', letterSpacing: '0.03em' }}
                  />
                  <button type="button" onClick={() => setShowPasswordConfirm(v => !v)}
                    className="shrink-0 flex items-center justify-center px-2 py-2 text-gray-500 hover:text-[#0b2a24] transition-colors"
                    aria-label={showPasswordConfirm ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPasswordConfirm}>
                    <EyeIcon open={!showPasswordConfirm} />
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-900/90 bg-red-50/90 border border-red-100/80 px-3 py-3 sm:px-4 sm:py-3.5 leading-relaxed break-words" style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}>
                {error}
              </p>
            )}
            <button type="submit" disabled={pending}
              className="w-full py-4 mt-2 text-[11px] uppercase tracking-[0.18em] transition-all duration-500 bg-[#0b2a24] text-white border border-[#0b2a24] hover:bg-[#0d332c] disabled:opacity-55"
              style={{ fontFamily: 'var(--font-open-sans)', cursor: pending ? 'wait' : 'pointer' }}
            >
              {pending ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-gray-200/70 text-center" style={{ fontFamily: 'var(--font-open-sans)' }}>
            {mode === 'login' ? (
              <p className="text-[11px] text-gray-500 tracking-wide">
                Нет аккаунта?{' '}
                <button type="button" onClick={() => switchMode('register')} className={linkBtn} style={{ letterSpacing: '0.06em' }}>
                  <span className="font-normal">Создать аккаунт</span>
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-[#0b2a24] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                </button>
              </p>
            ) : (
              <p className="text-[11px] text-gray-500 tracking-wide">
                Уже есть аккаунт?{' '}
                <button type="button" onClick={() => switchMode('login')} className={linkBtn} style={{ letterSpacing: '0.06em' }}>
                  <span className="font-normal">Войти</span>
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-[#0b2a24] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                </button>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex items-start md:items-center justify-center min-h-[calc(100vh-200px)] pt-4 pb-8 px-2 sm:px-4 sm:pt-8 sm:pb-14 w-full max-w-full overflow-x-hidden">
      {card}
    </div>
  );
}
