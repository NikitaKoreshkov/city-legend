'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Topic = {
  topicKey: string;
  label: string;
  slaMinutes: number;
  sortOrder: number;
};

function ConciergeTopicsPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const loadTopics = useCallback(async () => {
    const r = await fetch('/api/admin/concierge/topics');
    if (r.status === 401) {
      router.push('/admin/login');
      return;
    }
    const d = await r.json();
    setTopics(d.topics ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const updateTopic = (index: number, patch: Partial<Topic>) => {
    setTopics((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/concierge/topics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Ошибка сохранения');
      }
      showToast('Типы обращений сохранены');
      await loadTopics();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      {toast && (
        <div
          className="fixed top-5 right-5 z-50 bg-[#0b2a24] text-white text-sm px-5 py-3 shadow-xl"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          {toast}
        </div>
      )}

      <header className="border-b border-[#ebe8e0] bg-white sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center gap-5">
          <Link
            href="/admin/concierge"
            className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-[#0b2a24] transition-colors"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            ← Поддержка
          </Link>
          <div>
            <h1
              className="text-xl text-[#0b2a24]"
              style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}
            >
              Типы обращений
            </h1>
            <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Пункты выпадающего меню «Тема обращения» в личном кабинете
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="ml-auto bg-[#0b2a24] text-white text-[10px] uppercase tracking-widest px-5 py-2.5 hover:bg-[#0b2a24]/90 transition-colors disabled:opacity-50"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 mb-4" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Здесь редактируются названия и SLA (в минутах). Ключи типов фиксированы — менять их не нужно.
              Тексты раздела «Поддержка» редактируются отдельно в{' '}
              <Link href="/admin/edit/cms-copy" className="text-[#0b2a24] underline">
                Тексты кабинета
              </Link>
              .
            </p>
            {topics.map((t, i) => (
              <div key={t.topicKey} className="border border-[#ebe8e0] bg-white p-4 grid gap-3 sm:grid-cols-[1fr_120px_80px] sm:items-end">
                <div>
                  <label
                    className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Название · {t.topicKey}
                  </label>
                  <input
                    type="text"
                    value={t.label}
                    onChange={(e) => updateTopic(i, { label: e.target.value })}
                    className="w-full border border-[#ebe8e0] px-3 py-2 text-sm outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                </div>
                <div>
                  <label
                    className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    SLA, мин
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={t.slaMinutes}
                    onChange={(e) => updateTopic(i, { slaMinutes: Number(e.target.value) })}
                    className="w-full border border-[#ebe8e0] px-3 py-2 text-sm outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                </div>
                <div>
                  <label
                    className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Порядок
                  </label>
                  <input
                    type="number"
                    value={t.sortOrder}
                    onChange={(e) => updateTopic(i, { sortOrder: Number(e.target.value) })}
                    className="w-full border border-[#ebe8e0] px-3 py-2 text-sm outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConciergeTopicsPageGuarded() {
  return (
    <AdminProtected permission="support.tickets">
      <ConciergeTopicsPage />
    </AdminProtected>
  );
}
