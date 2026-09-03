'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_LOGO_URL } from '@/lib/siteShellDefaults';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/admin');
      } else {
        setError(data.error || 'Ошибка входа');
      }
    } catch (err) {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md px-8">
        {/* Логотип */}
        <div className="text-center mb-12">
          <Image
            src={DEFAULT_LOGO_URL}
            alt="City Legend"
            width={200}
            height={56}
            className="h-12 w-auto mx-auto"
            priority
          />
          <p
            className="text-sm mt-4"
            style={{
              fontFamily: 'var(--font-open-sans)',
              color: '#666666',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Панель администратора
          </p>
        </div>

        {/* Форма входа */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="username"
              className="block text-sm mb-2"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#333333',
                letterSpacing: '0.02em',
              }}
            >
              Логин
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 focus:border-black focus:outline-none transition-colors"
              style={{
                fontFamily: 'var(--font-open-sans)',
              }}
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm mb-2"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#333333',
                letterSpacing: '0.02em',
              }}
            >
              Пароль
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 focus:border-black focus:outline-none transition-colors"
              style={{
                fontFamily: 'var(--font-open-sans)',
              }}
              required
            />
          </div>

          {error && (
            <p
              className="text-sm text-red-600"
              style={{
                fontFamily: 'var(--font-open-sans)',
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-black text-white hover:bg-gray-800 transition-colors disabled:bg-gray-400"
            style={{
              fontFamily: 'var(--font-open-sans)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontSize: '14px',
            }}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}

