'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { useEffect, useState } from 'react';

interface Promo {
  id: number;
  title: string;
  subtitle: string | null;
  promo_code: string | null;
  discount_label: string | null;
  active: boolean;
  valid_until: string | null;
  sort_order: number;
  details_url: string | null;
}

interface Coupon {
  id: number;
  code: string;
  title: string;
  discount_percent: number;
  min_total_rub: number;
  expires_at: string | null;
  active: boolean;
}

const EMPTY_PROMO: Omit<Promo, 'id'> = {
  title: '', subtitle: null, promo_code: null, discount_label: null,
  active: true, valid_until: null, sort_order: 0, details_url: null,
};

const EMPTY_COUPON: Omit<Coupon, 'id'> = {
  code: '', title: '', discount_percent: 10, min_total_rub: 0,
  expires_at: null, active: true,
};

function EditPromotions() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'promos' | 'coupons'>('promos');

  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoForm, setPromoForm] = useState({ ...EMPTY_PROMO });

  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [couponForm, setCouponForm] = useState({ ...EMPTY_COUPON });
  const [qrCoupon, setQrCoupon] = useState<Coupon | null>(null);
  const [qrData, setQrData] = useState<{
    promoUrl: string;
    qrUrl: string;
  } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/promotions');
    if (res.ok) {
      const d = await res.json();
      setPromos(d.promotions || []);
      setCoupons(d.coupons || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  // Promos
  const savePromo = async () => {
    const method = editingPromo ? 'PUT' : 'POST';
    const body = editingPromo ? { ...promoForm, id: editingPromo.id } : promoForm;
    const res = await fetch('/api/admin/promotions/promo', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) { showMsg('Акция сохранена'); setShowPromoForm(false); load(); }
    else { const d = await res.json(); showMsg(d.error || 'Ошибка'); }
  };

  const deletePromo = async (id: number) => {
    if (!confirm('Удалить акцию?')) return;
    await fetch(`/api/admin/promotions/promo?id=${id}`, { method: 'DELETE' });
    showMsg('Удалено'); load();
  };

  // Coupons
  const saveCoupon = async () => {
    const method = editingCoupon ? 'PUT' : 'POST';
    const body = editingCoupon ? { ...couponForm, id: editingCoupon.id } : couponForm;
    const res = await fetch('/api/admin/promotions/coupon', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) { showMsg('Купон сохранён'); setShowCouponForm(false); load(); }
    else { const d = await res.json(); showMsg(d.error || 'Ошибка'); }
  };

  const deleteCoupon = async (id: number) => {
    if (!confirm('Удалить купон?')) return;
    await fetch(`/api/admin/promotions/coupon?id=${id}`, { method: 'DELETE' });
    showMsg('Удалено'); load();
  };

  const openQr = async (coupon: Coupon) => {
    setQrCoupon(coupon);
    setQrData(null);
    setQrLoading(true);
    try {
      const res = await fetch(`/api/admin/promotions/coupon/qr?code=${encodeURIComponent(coupon.code)}`);
      const d = await res.json();
      if (res.ok) {
        setQrData({ promoUrl: d.promoUrl, qrUrl: d.qrUrl });
      } else {
        showMsg(d.error || 'Ошибка QR');
        setQrCoupon(null);
      }
    } catch {
      showMsg('Ошибка генерации QR');
      setQrCoupon(null);
    } finally {
      setQrLoading(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showMsg(`${label} скопирован`);
    } catch {
      showMsg('Не удалось скопировать');
    }
  };

  return (
    <div className="max-w-5xl">
      <header className="mb-8 pb-6 border-b border-neutral-200/80 flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Маркетинг</p>
          <h1 className="text-2xl text-neutral-900" style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}>
            Купоны и акции
          </h1>
          <p className="text-sm text-neutral-500 mt-1 max-w-xl">
            Коды для сайта, QR для печати и рассылки. Акции — карточки на витрине.
          </p>
        </div>
        <button
          onClick={() => {
            if (activeTab === 'promos') {
              setEditingPromo(null);
              setPromoForm({ ...EMPTY_PROMO });
              setShowPromoForm(true);
            } else {
              setEditingCoupon(null);
              setCouponForm({ ...EMPTY_COUPON });
              setShowCouponForm(true);
            }
          }}
          className="px-6 py-2.5 bg-[#0b2a24] text-white hover:bg-[#0a201c] text-sm shrink-0"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          {activeTab === 'promos' ? '+ Добавить акцию' : '+ Добавить купон'}
        </button>
      </header>

      <div className="flex gap-6 border-b border-neutral-200 mb-8">
            {(['promos', 'coupons'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 text-sm ${activeTab === tab ? 'border-b-2 border-black font-medium' : 'text-gray-500 hover:text-black'}`}
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {tab === 'promos' ? `Акции (${promos.length})` : `Купоны (${coupons.length})`}
              </button>
            ))}
          </div>

      {message && (
        <div className={`py-3 px-6 text-center text-sm ${message.includes('Ошибка') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      <div className="py-2">
        {loading ? (
          <p className="text-center text-gray-400">Загрузка...</p>
        ) : activeTab === 'promos' ? (
          <div className="space-y-3">
            {promos.map(p => (
              <div key={p.id} className="border border-gray-200 p-5 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {p.discount_label && (
                      <span className="px-2 py-0.5 bg-black text-white text-xs font-medium">{p.discount_label}</span>
                    )}
                    <h3 className="text-lg" style={{ fontFamily: 'var(--font-playfair-display)' }}>{p.title}</h3>
                    {!p.active && <span className="text-xs text-gray-400 border border-gray-300 px-2 py-0.5">Неактивна</span>}
                  </div>
                  {p.subtitle && <p className="text-sm text-gray-600 mt-1">{p.subtitle}</p>}
                  {p.promo_code && (
                    <p className="text-sm mt-1">
                      Код: <code className="bg-gray-100 px-2 py-0.5 text-xs">{p.promo_code}</code>
                    </p>
                  )}
                  {p.valid_until && (
                    <p className="text-xs text-gray-500 mt-1">
                      До: {new Date(p.valid_until).toLocaleDateString('ru-RU')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEditingPromo(p);
                      setPromoForm({
                        title: p.title, subtitle: p.subtitle, promo_code: p.promo_code,
                        discount_label: p.discount_label, active: p.active, valid_until: p.valid_until,
                        sort_order: p.sort_order, details_url: p.details_url,
                      });
                      setShowPromoForm(true);
                    }}
                    className="px-3 py-1.5 text-sm border border-black hover:bg-black hover:text-white"
                  >
                    Изменить
                  </button>
                  <button onClick={() => deletePromo(p.id)} className="px-3 py-1.5 text-sm border border-red-500 text-red-500 hover:bg-red-50">
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            {promos.length === 0 && <p className="text-center text-gray-400 py-12">Нет акций</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {coupons.map(c => (
              <div key={c.id} className="border border-gray-200 p-5 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <code className="bg-black text-white px-3 py-1 text-sm font-bold tracking-wider">{c.code}</code>
                    <span className="text-sm font-medium">−{c.discount_percent}%</span>
                    {!c.active && <span className="text-xs text-gray-400 border border-gray-300 px-2 py-0.5">Неактивен</span>}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{c.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Мин. сумма: {Number(c.min_total_rub).toLocaleString('ru-RU')} ₽
                    {c.expires_at && ` · До: ${new Date(c.expires_at).toLocaleDateString('ru-RU')}`}
                  </p>
                </div>
                <div className="flex gap-2 ml-4 flex-shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => openQr(c)}
                    className="px-3 py-1.5 text-sm border border-[#0b2a24]/40 text-[#0b2a24] hover:bg-[#0b2a24]/5 font-medium"
                  >
                    QR
                  </button>
                  <button
                    onClick={() => {
                      setEditingCoupon(c);
                      setCouponForm({
                        code: c.code, title: c.title, discount_percent: c.discount_percent,
                        min_total_rub: c.min_total_rub, expires_at: c.expires_at, active: c.active,
                      });
                      setShowCouponForm(true);
                    }}
                    className="px-3 py-1.5 text-sm border border-black hover:bg-black hover:text-white"
                  >
                    Изменить
                  </button>
                  <button onClick={() => deleteCoupon(c.id)} className="px-3 py-1.5 text-sm border border-red-500 text-red-500 hover:bg-red-50">
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            {coupons.length === 0 && <p className="text-center text-gray-400 py-12">Нет купонов</p>}
          </div>
        )}
      </div>

      {/* Promo form */}
      {showPromoForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              {editingPromo ? 'Редактировать акцию' : 'Новая акция'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Название *</label>
                <input type="text" value={promoForm.title}
                  onChange={e => setPromoForm({ ...promoForm, title: e.target.value })}
                  className="w-full px-3 py-2 border" placeholder="Приветственная программа" />
              </div>
              <div>
                <label className="block text-sm mb-1">Подзаголовок</label>
                <input type="text" value={promoForm.subtitle || ''}
                  onChange={e => setPromoForm({ ...promoForm, subtitle: e.target.value || null })}
                  className="w-full px-3 py-2 border" placeholder="На первый заказ от 300 000 ₽" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Ярлык скидки</label>
                  <input type="text" value={promoForm.discount_label || ''}
                    onChange={e => setPromoForm({ ...promoForm, discount_label: e.target.value || null })}
                    className="w-full px-3 py-2 border" placeholder="−10% / VIP / до 7%" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Промокод</label>
                  <input type="text" value={promoForm.promo_code || ''}
                    onChange={e => setPromoForm({ ...promoForm, promo_code: e.target.value || null })}
                    className="w-full px-3 py-2 border" placeholder="WELCOME10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Действует до (опционально)</label>
                  <input type="date" value={promoForm.valid_until || ''}
                    onChange={e => setPromoForm({ ...promoForm, valid_until: e.target.value || null })}
                    className="w-full px-3 py-2 border" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Порядок сортировки</label>
                  <input type="number" value={promoForm.sort_order}
                    onChange={e => setPromoForm({ ...promoForm, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border" />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Ссылка «Подробнее» (опционально)</label>
                <input type="text" value={promoForm.details_url || ''}
                  onChange={e => setPromoForm({ ...promoForm, details_url: e.target.value || null })}
                  className="w-full px-3 py-2 border" placeholder="https://..." />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={promoForm.active}
                  onChange={e => setPromoForm({ ...promoForm, active: e.target.checked })} />
                Активна
              </label>
              <div className="flex gap-2 pt-2 border-t">
                <button onClick={savePromo} className="flex-1 py-3 bg-black text-white hover:bg-gray-800">Сохранить</button>
                <button onClick={() => setShowPromoForm(false)} className="px-8 py-3 border border-gray-300 hover:bg-gray-50">Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coupon form */}
      {showCouponForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              {editingCoupon ? 'Редактировать купон' : 'Новый купон'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Код купона *</label>
                  <input type="text" value={couponForm.code}
                    onChange={e => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border font-mono" placeholder="WELCOME10" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Скидка (%) *</label>
                  <input type="number" min={1} max={100} value={couponForm.discount_percent}
                    onChange={e => setCouponForm({ ...couponForm, discount_percent: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border" />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Название купона *</label>
                <input type="text" value={couponForm.title}
                  onChange={e => setCouponForm({ ...couponForm, title: e.target.value })}
                  className="w-full px-3 py-2 border" placeholder="Приветственный купон" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Мин. сумма заказа (₽)</label>
                  <input type="number" min={0} value={couponForm.min_total_rub}
                    onChange={e => setCouponForm({ ...couponForm, min_total_rub: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Действует до</label>
                  <input type="datetime-local" value={couponForm.expires_at ? couponForm.expires_at.slice(0, 16) : ''}
                    onChange={e => setCouponForm({ ...couponForm, expires_at: e.target.value ? e.target.value + ':00Z' : null })}
                    className="w-full px-3 py-2 border" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={couponForm.active}
                  onChange={e => setCouponForm({ ...couponForm, active: e.target.checked })} />
                Активен
              </label>
              <div className="flex gap-2 pt-2 border-t">
                <button onClick={saveCoupon} className="flex-1 py-3 bg-black text-white hover:bg-gray-800">Сохранить</button>
                <button onClick={() => setShowCouponForm(false)} className="px-8 py-3 border border-gray-300 hover:bg-gray-50">Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR modal */}
      {qrCoupon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md p-6">
            <h2 className="text-xl mb-2" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              QR-код купона
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              <code className="bg-gray-100 px-2 py-0.5 font-bold">{qrCoupon.code}</code>
              {' '}· −{qrCoupon.discount_percent}%
            </p>
            {qrLoading ? (
              <p className="text-center text-gray-400 py-12">Генерация QR…</p>
            ) : qrData ? (
              <div className="space-y-4">
                <div className="flex justify-center border border-gray-100 p-4 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrData.qrUrl} alt={`QR ${qrCoupon.code}`} className="w-48 h-48" />
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Ссылка для сайта</p>
                    <div className="flex gap-2">
                      <input readOnly value={qrData.promoUrl} className="flex-1 px-2 py-1.5 border text-xs font-mono bg-gray-50" />
                      <button
                        type="button"
                        onClick={() => copyText(qrData.promoUrl, 'Ссылка')}
                        className="px-3 py-1.5 border text-xs hover:bg-gray-50 shrink-0"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Код для ввода в корзине</p>
                    <div className="flex gap-2">
                      <input readOnly value={qrCoupon.code} className="flex-1 px-2 py-1.5 border text-xs font-mono bg-gray-50 font-bold" />
                      <button
                        type="button"
                        onClick={() => copyText(qrCoupon.code, 'Код')}
                        className="px-3 py-1.5 border text-xs hover:bg-gray-50 shrink-0"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <a
                    href={`/api/admin/promotions/coupon/qr?code=${encodeURIComponent(qrCoupon.code)}&download=1`}
                    className="flex-1 py-2.5 text-center bg-black text-white text-sm hover:bg-gray-800"
                  >
                    Скачать PNG
                  </a>
                  <button
                    type="button"
                    onClick={() => { setQrCoupon(null); setQrData(null); }}
                    className="px-6 py-2.5 border border-gray-300 hover:bg-gray-50 text-sm"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditPromotionsPage() {
  return (
    <AdminProtected permission="marketing.edit">
      <EditPromotions />
    </AdminProtected>
  );
}
