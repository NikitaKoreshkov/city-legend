'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { AdminSelect } from '@/app/components/admin/AdminSelect';
import { AdminModal } from '@/app/components/admin/AdminModal';
import { SendCouponForm, type SendCouponFormValues } from '@/app/components/admin/SendCouponForm';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Subscriber {
  id: number;
  platform: 'telegram' | 'max';
  platform_user_id: string;
  first_name: string;
  phone: string;
  registered_at: string;
  last_coupon: string | null;
  is_active: boolean;
  cabinet_user_id: number | null;
}

interface CouponOption {
  code: string;
  title: string;
  discount_percent: number;
}

interface BroadcastResult {
  ok: boolean;
  sent: number;
  failed: number;
  total: number;
}

const PLATFORM_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  max: 'Max',
};

function AdminBotsPage() {
  const router = useRouter();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [couponCatalog, setCouponCatalog] = useState<CouponOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastPlatform, setBroadcastPlatform] = useState<'all' | 'telegram' | 'max'>('all');
  const [sendCoupon, setSendCoupon] = useState(false);
  const [broadcastCouponMode, setBroadcastCouponMode] = useState<'create' | 'existing'>('create');
  const [broadcastCouponCode, setBroadcastCouponCode] = useState('');
  const [broadcastDiscount, setBroadcastDiscount] = useState(10);
  const [broadcastExpiryDays, setBroadcastExpiryDays] = useState(30);
  const [broadcastPrefix, setBroadcastPrefix] = useState('PROMO');
  const [sending, setSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [broadcastError, setBroadcastError] = useState('');

  const [sendTarget, setSendTarget] = useState<Subscriber | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);

  const couponSelectOptions = couponCatalog.map((c) => ({
    code: c.code,
    label: `${c.code} (−${c.discount_percent}%)`,
  }));

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const q = includeInactive ? '?includeInactive=1' : '';
      const res = await fetch(`/api/admin/bots${q}`);
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      setSubscribers(data.subscribers ?? []);
    } finally {
      setLoading(false);
    }
  }, [router, includeInactive]);

  const loadCoupons = useCallback(async () => {
    const res = await fetch('/api/admin/promotions');
    if (res.ok) {
      const d = await res.json();
      const active = (d.coupons ?? []).filter((c: CouponOption & { active: boolean }) => c.active);
      setCouponCatalog(active);
      if (active.length > 0 && !broadcastCouponCode) {
        setBroadcastCouponCode(active[0].code);
      }
    }
  }, [broadcastCouponCode]);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setSending(true);
    setBroadcastResult(null);
    setBroadcastError('');
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: broadcastText,
          platform: broadcastPlatform,
          sendCoupon,
          couponMode: broadcastCouponMode,
          couponCode: broadcastCouponMode === 'existing' ? broadcastCouponCode : undefined,
          couponDiscountPercent: broadcastDiscount,
          couponExpiryDays: broadcastExpiryDays,
          couponPrefix: broadcastPrefix,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBroadcastError(data.error || 'Ошибка рассылки');
        return;
      }
      setBroadcastResult(data as BroadcastResult);
      fetchSubscribers();
    } catch {
      setBroadcastError('Ошибка отправки. Проверьте токены ботов в .env');
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = async (sub: Subscriber) => {
    setActionBusyId(sub.id);
    try {
      const res = await fetch(`/api/admin/bots/subscribers/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !sub.is_active }),
      });
      if (res.ok) fetchSubscribers();
    } finally {
      setActionBusyId(null);
    }
  };

  const deleteSubscriber = async (sub: Subscriber) => {
    if (!confirm(`Удалить подписчика ${sub.first_name || sub.platform_user_id}?`)) return;
    setActionBusyId(sub.id);
    try {
      const res = await fetch(`/api/admin/bots/subscribers/${sub.id}`, { method: 'DELETE' });
      if (res.ok) fetchSubscribers();
    } finally {
      setActionBusyId(null);
    }
  };

  const handlePersonalSend = async (values: SendCouponFormValues) => {
    if (!sendTarget) return;
    setSendLoading(true);
    setSendResult('');
    try {
      const res = await fetch(`/api/admin/bots/subscribers/${sendTarget.id}/send-coupon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: values.text,
          mode: values.mode,
          couponCode: values.mode === 'existing' ? values.couponCode : undefined,
          title: values.title,
          discountPercent: values.discountPercent,
          expiryDays: values.expiryDays,
          minTotalRub: values.minTotalRub,
          codePrefix: values.codePrefix,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult(`Отправлено: ${data.couponCode}`);
        fetchSubscribers();
      } else {
        setSendResult(data.error || 'Ошибка');
      }
    } catch {
      setSendResult('Ошибка сети');
    } finally {
      setSendLoading(false);
    }
  };

  const activeCount = subscribers.filter((s) => s.is_active).length;
  const tgCount = subscribers.filter((s) => s.platform === 'telegram' && s.is_active).length;
  const maxCount = subscribers.filter((s) => s.platform === 'max' && s.is_active).length;

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--font-open-sans)',
    fontSize: '13px',
    border: '1px solid #e5e7eb',
    outline: 'none',
    padding: '8px 12px',
    width: '100%',
    background: '#fff',
    color: '#111',
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="border-b border-gray-200 py-5 bg-white">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-gray-400 hover:text-black transition-colors" style={{ fontFamily: 'var(--font-open-sans)' }}>
              ← Назад
            </Link>
            <div>
              <h1 className="text-xl" style={{ fontFamily: 'var(--font-playfair-display)', color: '#000', letterSpacing: '0.02em' }}>
                Боты: Telegram & Max
              </h1>
              <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-open-sans)', color: '#999', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Подписчики, рассылки, персональные купоны
              </p>
            </div>
          </div>
          <button onClick={fetchSubscribers} className="px-4 py-2 border border-gray-300 hover:border-black text-sm transition-colors" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Обновить
          </button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-10 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-3 grid grid-cols-3 gap-4">
            {[
              { label: 'Активных подписчиков', value: activeCount },
              { label: 'Telegram', value: tgCount },
              { label: 'Max', value: maxCount },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-gray-200 p-5 text-center">
                <div className="text-3xl font-light mb-1" style={{ fontFamily: 'var(--font-playfair-display)', color: '#000' }}>{s.value}</div>
                <div className="text-xs text-gray-400" style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1 bg-white border border-gray-200 p-6 self-start space-y-4">
            <h2 className="text-xs pb-3 border-b border-gray-100" style={{ fontFamily: 'var(--font-open-sans)', color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Массовая рассылка
            </h2>

            <AdminSelect
              value={broadcastPlatform}
              onChange={(v) => setBroadcastPlatform(v as 'all' | 'telegram' | 'max')}
              options={[
                { value: 'all', label: `Все активные (${activeCount})` },
                { value: 'telegram', label: `Telegram (${tgCount})` },
                { value: 'max', label: `Max (${maxCount})` },
              ]}
              fullWidth
            />

            <textarea
              rows={4}
              placeholder="Текст рассылки…"
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
            />

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sendCoupon} onChange={(e) => setSendCoupon(e.target.checked)} className="w-4 h-4" />
              Приложить купон (QR + код текстом)
            </label>

            {sendCoupon && (
              <div className="space-y-3 pl-1 border-l-2 border-gray-100 ml-1">
                <AdminSelect
                  value={broadcastCouponMode}
                  onChange={(v) => setBroadcastCouponMode(v as 'create' | 'existing')}
                  options={[
                    { value: 'create', label: 'Новый код каждому (PROMO-…)' },
                    { value: 'existing', label: 'Один код из админки всем' },
                  ]}
                  fullWidth
                />
                {broadcastCouponMode === 'existing' ? (
                  couponSelectOptions.length > 0 ? (
                    <AdminSelect
                      value={broadcastCouponCode}
                      onChange={setBroadcastCouponCode}
                      options={couponSelectOptions.map((c) => ({ value: c.code, label: c.label }))}
                      fullWidth
                    />
                  ) : (
                    <input
                      type="text"
                      value={broadcastCouponCode}
                      onChange={(e) => setBroadcastCouponCode(e.target.value.toUpperCase())}
                      placeholder="Код купона"
                      style={inputStyle}
                      className="font-mono"
                    />
                  )
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Скидка %</label>
                      <input type="number" min={1} max={100} value={broadcastDiscount} onChange={(e) => setBroadcastDiscount(parseInt(e.target.value, 10) || 10)} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Дней</label>
                      <input type="number" min={1} max={365} value={broadcastExpiryDays} onChange={(e) => setBroadcastExpiryDays(parseInt(e.target.value, 10) || 30)} style={inputStyle} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400">Префикс</label>
                      <input type="text" value={broadcastPrefix} onChange={(e) => setBroadcastPrefix(e.target.value.toUpperCase())} style={inputStyle} className="font-mono" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleBroadcast}
              disabled={sending || !broadcastText.trim()}
              className="w-full py-2.5 bg-black text-white text-sm hover:bg-gray-800 disabled:bg-gray-300"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {sending ? 'Отправка…' : 'Отправить рассылку'}
            </button>

            {broadcastResult && (
              <div className="border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Отправлено: <b>{broadcastResult.sent}</b> / {broadcastResult.total}
                {broadcastResult.failed > 0 && <span className="text-red-600"> · Ошибок: {broadcastResult.failed}</span>}
              </div>
            )}
            {broadcastError && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{broadcastError}</div>}
          </div>

          <div className="lg:col-span-2 bg-white border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">
              <h2 className="text-xs" style={{ fontFamily: 'var(--font-open-sans)', color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Подписчики ({subscribers.length})
              </h2>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
                Показать заблокированных
              </label>
            </div>

            {loading ? (
              <p className="text-sm text-gray-400">Загрузка…</p>
            ) : subscribers.length === 0 ? (
              <p className="text-sm text-gray-400">Пока нет зарегистрированных пользователей.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Платформа', 'Имя', 'Телефон', 'Купон', 'Статус', 'Действия'].map((h) => (
                        <th key={h} className="pb-2 pr-3 text-left text-xs text-gray-400 uppercase tracking-wide font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((sub) => (
                      <tr key={sub.id} className={`border-b border-gray-50 ${!sub.is_active ? 'opacity-50' : ''}`}>
                        <td className="py-2.5 pr-3">
                          <span className={`inline-block px-2 py-0.5 text-xs ${sub.platform === 'telegram' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                            {PLATFORM_LABEL[sub.platform]}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-800">{sub.first_name || '—'}</td>
                        <td className="py-2.5 pr-3 text-gray-600">{sub.phone || '—'}</td>
                        <td className="py-2.5 pr-3">
                          {sub.last_coupon ? <code className="text-xs bg-gray-100 px-1.5 py-0.5">{sub.last_coupon}</code> : '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-xs">
                          {sub.is_active ? <span className="text-green-700">Активен</span> : <span className="text-red-600">Заблокирован</span>}
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={!sub.is_active || actionBusyId === sub.id}
                              onClick={() => { setSendTarget(sub); setSendResult(''); }}
                              className="px-2 py-1 text-xs border hover:bg-gray-50 disabled:opacity-40"
                            >
                              Купон
                            </button>
                            <button
                              type="button"
                              disabled={actionBusyId === sub.id}
                              onClick={() => toggleBlock(sub)}
                              className="px-2 py-1 text-xs border hover:bg-gray-50"
                            >
                              {sub.is_active ? 'Блок' : 'Разблок'}
                            </button>
                            <button
                              type="button"
                              disabled={actionBusyId === sub.id}
                              onClick={() => deleteSubscriber(sub)}
                              className="px-2 py-1 text-xs border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-white border border-gray-200 p-6">
          <h2 className="text-xs mb-4 pb-3 border-b border-gray-100 uppercase tracking-widest text-gray-500">Подсказки</h2>
          <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5" style={{ fontFamily: 'var(--font-open-sans)' }}>
            <li>QR и код для ручных купонов — в разделе «Скидки, акции и купоны» → кнопка QR.</li>
            <li>Персональный купон одному клиенту — кнопка «Купон» в строке подписчика или из CRM.</li>
            <li>Исходящие рассылки не требуют webhook; нужны токены ботов на сервере.</li>
          </ul>
        </div>
      </div>

      <AdminModal
        open={!!sendTarget}
        onClose={() => setSendTarget(null)}
        title={sendTarget ? `Купон → ${sendTarget.first_name || PLATFORM_LABEL[sendTarget.platform]}` : ''}
        widthClass="max-w-md"
      >
        {sendTarget && (
          <>
            <p className="text-xs text-gray-500 mb-4">
              {PLATFORM_LABEL[sendTarget.platform]} · {sendTarget.phone || sendTarget.platform_user_id}
            </p>
            <SendCouponForm
              couponOptions={couponSelectOptions}
              loading={sendLoading}
              onSubmit={handlePersonalSend}
            />
            {sendResult && (
              <p className={`mt-3 text-sm ${sendResult.startsWith('Отправлено') ? 'text-green-700' : 'text-red-600'}`}>
                {sendResult}
              </p>
            )}
          </>
        )}
      </AdminModal>
    </div>
  );
}

export default function AdminBotsPageGuarded() {
  return (
    <AdminProtected permission="bots.manage">
      <AdminBotsPage />
    </AdminProtected>
  );
}
