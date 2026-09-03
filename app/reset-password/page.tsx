'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Step = 'loading' | 'invalid' | 'form' | 'success';

function EyeIcon({ open }: { open: boolean }) {
  if (open)
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [step, setStep] = useState<Step>('loading');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || '';
    setToken(t);
    if (!t) { setStep('invalid'); return; }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(t)}`)
      .then(r => r.json())
      .then((d: { valid: boolean }) => setStep(d.valid ? 'form' : 'invalid'))
      .catch(() => setStep('invalid'));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== passwordConfirm) { setError('Пароли не совпадают'); return; }
    setPending(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, passwordConfirm }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setError(data.error || 'Ошибка'); return; }
      setStep('success');
    } catch {
      setError('Нет соединения с сервером');
    } finally {
      setPending(false);
    }
  };

  const inputBase = 'w-full py-3.5 px-0 text-sm bg-transparent border-0 border-b border-gray-300/90 focus:outline-none focus:border-[#0b2a24] transition-colors duration-300 placeholder:text-gray-400/80';
  const pwRow = 'relative flex items-stretch border-b border-gray-300/90 focus-within:border-[#0b2a24] transition-colors duration-300';

  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center px-4 py-16">
      <div
        className="w-full max-w-[420px] px-10 py-12 bg-white/70 backdrop-blur-[2px] border border-gray-200/60"
        style={{ boxShadow: '0 24px 48px -24px rgba(11,42,36,0.12)', fontFamily: 'var(--font-open-sans)' }}
      >
        {step === 'loading' && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {step === 'invalid' && (
          <div className="text-center space-y-5">
            <p className="text-[10px] uppercase tracking-[.2em] text-gray-400">Сброс пароля</p>
            <h2 className="text-2xl font-normal italic text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              Ссылка недействительна
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Ссылка для сброса пароля устарела или уже была использована. Запросите новую.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 text-[11px] uppercase tracking-[.18em] py-4 px-8 bg-[#0b2a24] text-white hover:bg-[#0d332c] transition-colors"
            >
              На главную
            </Link>
          </div>
        )}

        {step === 'form' && (
          <>
            <div className="text-center mb-9">
              <p className="text-[10px] uppercase tracking-[.2em] mb-4 text-gray-400">Личный кабинет</p>
              <h2 className="text-[1.65rem] font-normal italic text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)', letterSpacing: '.02em' }}>
                Новый пароль
              </h2>
            </div>
            <form onSubmit={submit} className="space-y-7">
              <div>
                <label className="block text-[10px] uppercase tracking-[.14em] mb-2.5 text-gray-400">
                  Новый пароль
                </label>
                <div className={pwRow}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={10}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="flex-1 min-w-0 py-3.5 pr-2 text-sm bg-transparent border-0 focus:outline-none"
                    style={{ color: 'var(--color-classic-black)', letterSpacing: '.03em' }}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="shrink-0 flex items-center px-2 py-2 text-gray-400 hover:text-[#0b2a24] transition-colors">
                    <EyeIcon open={!showPw} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Не менее 10 символов, буква и цифра.</p>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[.14em] mb-2.5 text-gray-400">
                  Повторите пароль
                </label>
                <div className={pwRow}>
                  <input
                    type={showPw2 ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={10}
                    value={passwordConfirm}
                    onChange={e => setPasswordConfirm(e.target.value)}
                    className="flex-1 min-w-0 py-3.5 pr-2 text-sm bg-transparent border-0 focus:outline-none"
                    style={{ color: 'var(--color-classic-black)', letterSpacing: '.03em' }}
                  />
                  <button type="button" onClick={() => setShowPw2(v => !v)}
                    className="shrink-0 flex items-center px-2 py-2 text-gray-400 hover:text-[#0b2a24] transition-colors">
                    <EyeIcon open={!showPw2} />
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-xs text-red-900/90 bg-red-50/90 border border-red-100/80 px-4 py-3.5 leading-relaxed">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="w-full py-4 text-[11px] uppercase tracking-[.18em] bg-[#0b2a24] text-white hover:bg-[#0d332c] disabled:opacity-55 transition-colors"
                style={{ cursor: pending ? 'wait' : 'pointer' }}
              >
                {pending ? 'Подождите…' : 'Сохранить пароль'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <div className="text-center space-y-5">
            <p className="text-[10px] uppercase tracking-[.2em] text-gray-400">Готово</p>
            <h2 className="text-2xl font-normal italic text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              Пароль изменён
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Теперь вы можете войти с новым паролем.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 text-[11px] uppercase tracking-[.18em] py-4 px-8 bg-[#0b2a24] text-white hover:bg-[#0d332c] transition-colors"
            >
              Войти в аккаунт
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
