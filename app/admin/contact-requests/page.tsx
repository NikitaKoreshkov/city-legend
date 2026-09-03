'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ContactRequest {
  id: number;
  name: string;
  email: string;
  phone?: string;
  message: string;
  auction_id?: number;
  auction_name?: string;
  created_at: string;
}

export default function ContactRequests() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadRequests();
    
    // Обновляем каждые 30 секунд
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadRequests = async () => {
    try {
      const response = await fetch('/api/admin/contact-requests');
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      } else if (response.status === 401) {
        router.push('/admin/login');
      }
    } catch (error) {
      console.error('Ошибка загрузки:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить заявку?')) return;

    try {
      const response = await fetch(`/api/admin/contact-requests?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setMessage('Заявка удалена');
        loadRequests();
      } else {
        setMessage('Ошибка удаления');
      }
    } catch (error) {
      setMessage('Ошибка удаления');
    }
  };

  const getTimeRemaining = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const expiresAt = new Date(created.getTime() + 24 * 60 * 60 * 1000);
    const remaining = expiresAt.getTime() - now.getTime();

    if (remaining <= 0) return 'Истекла';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}ч ${minutes}м`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p style={{ fontFamily: 'var(--font-open-sans)' }}>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Шапка */}
      <header className="border-b border-gray-200 py-4 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-sm hover:underline"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              ← Назад
            </Link>
            <div>
              <h1
                className="text-xl"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                Обратная связь
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Заявки удаляются автоматически через 24 часа
              </p>
            </div>
          </div>
          <button
            onClick={loadRequests}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-100 text-sm"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            ↻ Обновить
          </button>
        </div>
      </header>

      {message && (
        <div className={`py-3 px-6 text-center ${message.includes('Ошибка') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      {/* Контент */}
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-5xl mx-auto">
          
          <div className="mb-6">
            <h2
              className="text-2xl"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Заявки ({requests.length})
            </h2>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500 text-lg">Нет активных заявок</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="border border-gray-200 p-6 hover:border-gray-400 transition-colors"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <h3
                          className="text-lg font-bold"
                          style={{ fontFamily: 'var(--font-playfair-display)' }}
                        >
                          {req.name}
                        </h3>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          Удалится через: {getTimeRemaining(req.created_at)}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-600 space-y-1 mb-3">
                        <p>
                          <strong>Email:</strong>{' '}
                          <a
                            href={`mailto:${req.email}`}
                            className="text-blue-600 hover:underline"
                          >
                            {req.email}
                          </a>
                        </p>
                        {req.phone && (
                          <p>
                            <strong>Телефон:</strong>{' '}
                            <a
                              href={`tel:${req.phone}`}
                              className="text-blue-600 hover:underline"
                            >
                              {req.phone}
                            </a>
                          </p>
                        )}
                        {req.auction_name && (
                          <p>
                            <strong>Интересует товар:</strong> {req.auction_name}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          Создана: {new Date(req.created_at).toLocaleString('ru-RU')}
                        </p>
                      </div>

                      <div className="bg-gray-50 p-4 rounded">
                        <p className="text-sm font-semibold mb-2">Сообщение:</p>
                        <p className="text-sm whitespace-pre-wrap">{req.message}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(req.id)}
                      className="ml-4 px-4 py-2 text-sm border border-red-500 text-red-500 hover:bg-red-50"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

