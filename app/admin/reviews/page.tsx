'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  id: number;
  user_id: number;
  user_email: string | null;
  order_id: number | null;
  lot_title: string;
  review_text: string;
  rating: number | null;
  likes_count: number;
  dislikes_count: number;
  created_at: string | null;
  admin_hidden_at: string | null;
  admin_hidden_reason: string | null;
};

export default function AdminReviewsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/reviews');
    if (r.status === 401) {
      router.push('/admin/login');
      return;
    }
    const d = await r.json();
    setRows(d.reviews ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const toast = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 2600);
  };

  const hide = async (id: number, hidden: boolean) => {
    const r = await fetch('/api/admin/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, hidden }),
    });
    if (r.ok) {
      toast(hidden ? 'Отзыв скрыт с сайта' : 'Отзыв снова на сайте');
      await load();
    } else toast('Ошибка');
  };

  const purge = async (id: number) => {
    if (!confirm('Удалить отзыв навсегда? Ответы бутика тоже удалятся.')) return;
    const r = await fetch(`/api/admin/reviews?id=${id}`, { method: 'DELETE' });
    if (r.ok) {
      toast('Удалено');
      await load();
    } else toast('Ошибка');
  };

  return (
    <AdminProtected permission="orders.view">
      <div className="max-w-5xl mx-auto space-y-6">
        {msg && (
          <div className="fixed top-5 right-5 z-50 bg-[#0b2a24] text-white text-sm px-5 py-3 shadow-xl">{msg}</div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin" className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-[#0b2a24]">
            ← Панель
          </Link>
          <h1 className="text-xl text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}>
            Отзывы клиентов
          </h1>
          <Link
            href="/admin/concierge"
            className="text-[10px] uppercase tracking-widest border border-[#ebe8e0] px-3 py-1.5 text-gray-600 hover:border-[#0b2a24]"
          >
            Поддержка (негативные → тикеты)
          </Link>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Оценки 1–2 звезды автоматически создают тикет «Негативный отзыв»: клиент получает сообщение в боте (если ЛК
          привязан к боту), диалог — в разделе Поддержка.
        </p>
        {loading ? (
          <p className="text-sm text-gray-400">Загрузка…</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((r) => (
              <li key={r.id} className="border border-[#ebe8e0] bg-white p-4">
                <div className="flex flex-wrap gap-2 items-start justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-400">
                      #{r.id} ·{' '}
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
                        : ''}
                    </p>
                    <p className="text-sm font-medium text-[#0b2a24] mt-1">{r.lot_title}</p>
                    <p className="text-xs text-gray-500">{r.user_email ?? `user #${r.user_id}`}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.rating != null ? (
                      <span className="text-xs px-2 py-1 bg-gray-100">
                        {r.rating}/5{r.rating <= 2 ? ' · негативный' : ''}
                      </span>
                    ) : null}
                    {r.admin_hidden_at ? (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200">
                        скрыт
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-gray-800 mt-3 whitespace-pre-wrap" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {r.review_text}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => void hide(r.id, !r.admin_hidden_at)}
                    className="text-[10px] uppercase tracking-widest border px-3 py-1.5 hover:bg-[#0b2a24] hover:text-white transition-colors"
                  >
                    {r.admin_hidden_at ? 'Показать на сайте' : 'Скрыть с сайта'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void purge(r.id)}
                    className="text-[10px] uppercase tracking-widest border border-red-200 text-red-700 px-3 py-1.5 hover:bg-red-50"
                  >
                    Удалить навсегда
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminProtected>
  );
}
