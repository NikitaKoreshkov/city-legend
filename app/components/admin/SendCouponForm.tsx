'use client';

import { useState } from 'react';
import { AdminSelect } from '@/app/components/admin/AdminSelect';

export type SendCouponFormValues = {
  text: string;
  mode: 'create' | 'existing';
  couponCode: string;
  discountPercent: number;
  expiryDays: number;
  minTotalRub: number;
  title: string;
  codePrefix: string;
};

const DEFAULT_VALUES: SendCouponFormValues = {
  text: '🎁 Персональный купон от City Legend',
  mode: 'create',
  couponCode: '',
  discountPercent: 10,
  expiryDays: 30,
  minTotalRub: 0,
  title: 'Персональный купон',
  codePrefix: 'VIP',
};

type Props = {
  couponOptions?: { code: string; label: string }[];
  submitLabel?: string;
  loading?: boolean;
  onSubmit: (values: SendCouponFormValues) => void | Promise<void>;
  initialValues?: Partial<SendCouponFormValues>;
};

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

export function SendCouponForm({
  couponOptions = [],
  submitLabel = 'Отправить купон + QR',
  loading = false,
  onSubmit,
  initialValues,
}: Props) {
  const [form, setForm] = useState<SendCouponFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });

  const set = <K extends keyof SendCouponFormValues>(key: K, value: SendCouponFormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Текст сообщения
        </label>
        <textarea
          rows={3}
          value={form.text}
          onChange={(e) => set('text', e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Тип купона
        </label>
        <AdminSelect
          value={form.mode}
          onChange={(v) => set('mode', v as 'create' | 'existing')}
          options={[
            { value: 'create', label: 'Создать новый персональный' },
            { value: 'existing', label: 'Использовать существующий из админки' },
          ]}
          fullWidth
        />
      </div>

      {form.mode === 'existing' ? (
        <div>
          <label className="block text-xs text-gray-500 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Код купона
          </label>
          {couponOptions.length > 0 ? (
            <AdminSelect
              value={form.couponCode || couponOptions[0]?.code}
              onChange={(v) => set('couponCode', v)}
              options={couponOptions.map((c) => ({ value: c.code, label: c.label }))}
              fullWidth
            />
          ) : (
            <input
              type="text"
              value={form.couponCode}
              onChange={(e) => set('couponCode', e.target.value.toUpperCase())}
              placeholder="VIP15"
              className="font-mono"
              style={inputStyle}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Скидка (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.discountPercent}
              onChange={(e) => set('discountPercent', parseInt(e.target.value, 10) || 10)}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Срок (дней)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={form.expiryDays}
              onChange={(e) => set('expiryDays', parseInt(e.target.value, 10) || 30)}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Префикс кода</label>
            <input
              type="text"
              value={form.codePrefix}
              onChange={(e) => set('codePrefix', e.target.value.toUpperCase())}
              placeholder="VIP"
              className="font-mono"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Мин. сумма (₽)</label>
            <input
              type="number"
              min={0}
              value={form.minTotalRub}
              onChange={(e) => set('minTotalRub', parseInt(e.target.value, 10) || 0)}
              style={inputStyle}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1.5">Название купона</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={() => void onSubmit(form)}
        className="w-full py-2.5 bg-black text-white text-sm hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.05em' }}
      >
        {loading ? 'Отправка…' : submitLabel}
      </button>
    </div>
  );
}
