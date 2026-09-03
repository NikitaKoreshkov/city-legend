'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface LoyaltyTier {
  id: number;
  sort_order: number;
  from_rub: number;
  label: string;
  percent: number;
}

function EditLoyalty() {
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LoyaltyTier | null>(null);
  const [form, setForm] = useState({ from_rub: 0, label: '', percent: 0, sort_order: 0 });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/loyalty');
    if (res.ok) {
      const d = await res.json();
      setTiers(d.tiers || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ from_rub: 0, label: '', percent: 0, sort_order: (tiers.length + 1) * 10 });
    setShowForm(true);
  };

  const openEdit = (t: LoyaltyTier) => {
    setEditing(t);
    setForm({ from_rub: t.from_rub, label: t.label, percent: t.percent, sort_order: t.sort_order });
    setShowForm(true);
  };

  const handleSave = async () => {
    const method = editing ? 'PUT' : 'POST';
    const body = editing ? { ...form, id: editing.id } : form;
    const res = await fetch('/api/admin/loyalty', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setMessage(editing ? 'Уровень обновлён' : 'Уровень добавлен');
      setShowForm(false);
      load();
    } else {
      const d = await res.json();
      setMessage(d.error || 'Ошибка');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить уровень лояльности?')) return;
    await fetch(`/api/admin/loyalty?id=${id}`, { method: 'DELETE' });
    setMessage('Удалено');
    load();
    setTimeout(() => setMessage(''), 3000);
  };

  const formatRub = (n: number) => n.toLocaleString('ru-RU') + ' ₽';

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 py-4 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm hover:underline" style={{ fontFamily: 'var(--font-open-sans)' }}>
              ← Назад
            </Link>
            <h1 className="text-xl" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              Программа лояльности
            </h1>
          </div>
          <button
            onClick={openCreate}
            className="px-6 py-2 bg-black text-white hover:bg-gray-800 text-sm"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            + Добавить уровень
          </button>
        </div>
      </header>

      {message && (
        <div className={`py-3 px-6 text-center text-sm ${message.includes('Ошибка') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="border border-amber-200 bg-amber-50 p-4 mb-6 text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
          <strong>Как работает программа:</strong> клиент накапливает сумму подтверждённых заказов. Когда сумма достигает
          порога уровня, к следующим заказам применяется скидка в % от указанного уровня.
          Уровни читаются динамически — изменения применяются сразу для новых заказов.
        </div>

        {loading ? (
          <p className="text-center text-gray-400">Загрузка...</p>
        ) : (
          <div className="space-y-3">
            {tiers.map(tier => (
              <div key={tier.id} className="border border-gray-200 p-5 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-4">
                    <span
                      className="inline-block px-3 py-1 bg-black text-white text-sm font-medium"
                      style={{ fontFamily: 'var(--font-playfair-display)' }}
                    >
                      до {tier.percent}%
                    </span>
                    <h3 className="text-lg" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                      {tier.label}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Накоплено от: <strong>{formatRub(tier.from_rub)}</strong> · Скидка: <strong>{tier.percent}%</strong>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(tier)}
                    className="px-3 py-1.5 text-sm border border-black hover:bg-black hover:text-white"
                  >
                    Изменить
                  </button>
                  <button
                    onClick={() => handleDelete(tier.id)}
                    className="px-3 py-1.5 text-sm border border-red-500 text-red-500 hover:bg-red-50"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            {tiers.length === 0 && (
              <p className="text-center text-gray-400 py-12">Нет уровней лояльности</p>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md p-6">
            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              {editing ? 'Изменить уровень' : 'Новый уровень'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Сумма накоплений от (₽) *</label>
                <input
                  type="number"
                  value={form.from_rub}
                  onChange={e => setForm({ ...form, from_rub: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border"
                  placeholder="5000"
                />
                <p className="text-xs text-gray-500 mt-1">Например: 5000 — скидка начнёт действовать после накопления 5 000 ₽</p>
              </div>
              <div>
                <label className="block text-sm mb-1">Название уровня *</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })}
                  className="w-full px-3 py-2 border"
                  placeholder="от 5 000 ₽"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Скидка (%) *</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={form.percent}
                  onChange={e => setForm({ ...form, percent: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border"
                  placeholder="3"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Порядок сортировки</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border"
                />
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <button onClick={handleSave} className="flex-1 py-3 bg-black text-white hover:bg-gray-800">
                  Сохранить
                </button>
                <button onClick={() => setShowForm(false)} className="px-8 py-3 border border-gray-300 hover:bg-gray-50">
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditLoyaltyPage() {
  return (
    <AdminProtected permission="marketing.edit">
      <EditLoyalty />
    </AdminProtected>
  );
}
