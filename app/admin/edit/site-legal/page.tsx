'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type LegalDraft = {
  entityName: string;
  inn: string;
  ogrn: string;
  legalAddress: string;
};

const EMPTY: LegalDraft = { entityName: '', inn: '', ogrn: '', legalAddress: '' };

function SiteLegalPage() {
  const [draft, setDraft] = useState<LegalDraft>(EMPTY);
  const [original, setOriginal] = useState<LegalDraft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/site-legal');
      if (!r.ok) throw new Error();
      const d = await r.json() as LegalDraft;
      setDraft(d);
      setOriginal(d);
    } catch {
      showToast('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDirty =
    draft.entityName !== original.entityName ||
    draft.inn !== original.inn ||
    draft.ogrn !== original.ogrn ||
    draft.legalAddress !== original.legalAddress;

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/site-legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error();
      showToast('Сохранено');
      setOriginal(draft);
    } catch {
      showToast('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof LegalDraft,
    label: string,
    hint?: string,
    multiline?: boolean
  ) => (
    <div className="px-5 py-4 border-b border-[#ebe8e0] last:border-0">
      <div className="mb-2">
        <label className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
          {label}
        </label>
        {hint && (
          <p className="text-[10px] text-gray-400 mt-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
            {hint}
          </p>
        )}
      </div>
      {multiline ? (
        <textarea
          value={draft[key]}
          onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
          rows={3}
          className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24] resize-none"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        />
      ) : (
        <input
          type="text"
          value={draft[key]}
          onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
          className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24]"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        />
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
        <div className="w-7 h-7 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        <div className="max-w-2xl mx-auto px-5 sm:px-8 py-4 flex items-center gap-5">
          <Link
            href="/admin"
            className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-[#0b2a24] transition-colors"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            ← Панель
          </Link>
          <div>
            <h1
              className="text-xl text-[#0b2a24]"
              style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}
            >
              Юридические реквизиты
            </h1>
            <p className="text-[10px] text-gray-400 mt-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Отображаются под логотипом в подвале сайта
            </p>
          </div>
          {isDirty && (
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="bg-[#0b2a24] text-white text-[10px] uppercase tracking-widest px-5 py-2.5 hover:bg-[#0b2a24]/90 transition-colors disabled:opacity-50"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        <div className="bg-white border border-[#ebe8e0]">
          <div className="px-5 py-3.5 border-b border-[#ebe8e0]">
            <h2
              className="text-[10px] uppercase tracking-widest text-gray-500"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Данные юридического лица
            </h2>
          </div>
          {field('entityName', 'Полное наименование', 'Например: ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ААРОН СТУДИО"')}
          {field('inn', 'ИНН', 'Например: 5262257450')}
          {field('ogrn', 'ОГРН', 'Необязательно')}
          {field('legalAddress', 'Юридический адрес', 'Полный адрес с индексом', true)}
        </div>

        <div className="bg-[#fdf8f2] border border-[#ebe8e0] px-5 py-4">
          <p className="text-[11px] text-gray-500 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Предпросмотр (футер сайта):
          </p>
          <div className="mt-3 text-center text-[11px] text-gray-500 leading-relaxed">
            <p className="font-medium text-gray-600">{draft.entityName || '—'}</p>
            {draft.inn && <p>ИНН {draft.inn}</p>}
            {draft.ogrn && <p>ОГРН {draft.ogrn}</p>}
            {draft.legalAddress && <p>Юридический адрес: {draft.legalAddress}</p>}
          </div>
        </div>

        {isDirty && (
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="bg-[#0b2a24] text-white text-[10px] uppercase tracking-widest px-8 py-3.5 shadow-lg hover:bg-[#0b2a24]/90 transition-colors disabled:opacity-50"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SiteLegalPageGuarded() {
  return (
    <AdminProtected permission="content.edit">
      <SiteLegalPage />
    </AdminProtected>
  );
}
