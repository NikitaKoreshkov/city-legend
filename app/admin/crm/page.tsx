'use client';

import { AdminProtected, useAdminContext } from '@/app/components/admin/AdminContext';
import { AdminSelect } from '@/app/components/admin/AdminSelect';
import { AdminDrawer } from '@/app/components/admin/AdminDrawer';
import { AdminModal } from '@/app/components/admin/AdminModal';
import { SendCouponForm, type SendCouponFormValues } from '@/app/components/admin/SendCouponForm';
import { matchesMyTasksFilter } from '@/lib/admin/myTasksFilter';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend,
  LineChart, Line, ComposedChart,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 7 | 30 | 90 | 365;
type Tab = 'overview' | 'orders' | 'customers' | 'products' | 'finance';

type Kpi = {
  revenue_all: number; revenue_period: number; revenue_prev: number; revenue_delta: number;
  orders_all: number; orders_period: number; orders_prev: number; orders_delta: number;
  avg_order: number; avg_order_period: number; avg_order_prev: number; avg_order_delta: number;
  coupon_discounts_total: number; loyalty_discounts_total: number;
  coupon_discounts_period: number; loyalty_discounts_period: number;
  customers_total: number; customers_new_period: number;
};
type ChartPoint = { date: string; revenue: number; orders: number };
type StatusRow = { status: string; count: number };
type Product = { auction_id: number | null; product_name: string; units_sold: number; revenue: number };
type Customer = {
  id: number; email: string; display_name: string | null; registered_at: string;
  orders_count: string; total_spent: string; avg_order: string;
  last_order_date: string | null; segment: 'new' | 'active' | 'vip';
  rfm_r: number; rfm_f: number; rfm_m: number; rfm: number;
};
type Coupon = { coupon_code: string; usage_count: number; total_discount: number };
type OrderItem = {
  auction_id: number; product_name: string | null; quantity: number;
  unit_price_display: string | null; variant_summary: string | null;
};
type Order = {
  id: number; status: string; reference_code: string | null;
  total_display: string | null; summary_line: string | null; created_at: string;
  tracking_number: string | null; eta_days: number | null; progress_percent: number | null;
  coupon_code: string | null; discount_rub: number | null; subtotal_rub: number | null;
  loyalty_percent: number | null; loyalty_discount_rub: number | null;
  customer_name: string | null; customer_phone: string | null;
  customer_email: string | null; user_email: string | null;
  delivery_city: string | null; delivery_street: string | null;
  delivery_house: string | null; delivery_apartment: string | null;
  delivery_postal_code: string | null; customer_comment: string | null;
  delivery_rub: number | string | null;
  delivery_tariff_rub: number | string | null;
  delivery_mode: string | null;
  cdek_pvz_code: string | null;
  cdek_order_uuid: string | null;
  cdek_error: string | null;
  cdek_last_status_code: string | null;
  cdek_last_status_at: string | null;
  crm_assignee_admin_id: number | null;
  crm_assignee_label: string | null;
  crm_due_at: string | null;
  crm_priority: string | null;
  crm_internal_notes: string | null;
  items: OrderItem[];
};
type MonthPoint = { month: string; revenue: number; orders_count: number };
type NewCustPoint = { date: string; new_customers: number };
type CrmData = {
  period: number; kpi: Kpi; chart: ChartPoint[]; statuses: StatusRow[];
  products: Product[]; customers: Customer[]; segments: Record<string, number>;
  coupons: Coupon[]; recent_orders: Order[]; orders: Order[];
  monthly: MonthPoint[]; new_customers_chart: NewCustPoint[];
  assignees: { id: number; label: string }[];
};
type CustomerProfile = {
  user: { id: number; email: string; display_name: string | null; created_at: string };
  orders: (Order & { items: OrderItem[] })[];
  stats: { orders_all: number; orders_confirmed: number; total_spent: number; avg_order: number };
  bot_subscribers?: {
    id: number;
    platform: string;
    first_name: string;
    phone: string;
    is_active: boolean;
    is_vip?: boolean;
    manager_notes?: string;
    registered_at: string;
  }[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const F = (n: number, suffix = ' ₽') =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} млн${suffix}`
    : n >= 1_000 ? `${(n / 1_000).toFixed(0)} тыс${suffix}`
      : `${n.toLocaleString('ru-RU')}${suffix}`;

const fmtRub = (n: number) => n.toLocaleString('ru-RU') + ' ₽';
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
const fmtDateTime = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtMonth = (s: string) => {
  const [y, m] = s.split('-');
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${months[parseInt(m) - 1]} ${y}`;
};

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CRM_PRIORITY_LABEL: Record<string, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочно',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает', confirmed: 'Подтверждён', processing: 'В обработке',
  shipped: 'Отправлен', delivered: 'Доставлен', cancelled: 'Отменён', refunded: 'Возврат',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b', confirmed: '#3b82f6', processing: '#6366f1',
  shipped: '#8b5cf6', delivered: '#10b981', cancelled: '#ef4444', refunded: '#9ca3af',
};
const STATUS_OPTIONS = Object.entries(STATUS_LABEL);
const STATUS_SELECT_OPTIONS = [
  { value: '', label: 'Все статусы' },
  ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l, color: STATUS_COLOR[v] })),
];
const STATUS_EDIT_OPTIONS = Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l, color: STATUS_COLOR[v] }));
const PIE_COLORS = ['#0b2a24', '#1d6a56', '#2e9e80', '#5bcaaa', '#a3e8d8', '#d1f5ed', '#9ca3af'];
const SEGMENT_LABELS: Record<string, string> = { new: 'Новые', active: 'Активные', vip: 'VIP' };
const SEGMENT_COLOR: Record<string, string> = { new: '#6366f1', active: '#0b2a24', vip: '#f59e0b' };

// ─── CSV Export ───────────────────────────────────────────────────────────────

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function AnimatedNum({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const prog = Math.min((ts - startRef.current) / 900, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      setDisplay(Math.round(fromRef.current + (value - fromRef.current) * ease));
      if (prog < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span>{prefix}{display.toLocaleString('ru-RU')}{suffix}</span>;
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 font-medium ${
        up ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
      }`}
      style={{ fontFamily: 'var(--font-open-sans)' }}
    >
      {up ? '↑' : '↓'} {Math.abs(delta)}%
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, prefix = '', suffix = '', delta, accent,
}: {
  label: string; value: number; sub?: string;
  prefix?: string; suffix?: string; delta?: number; accent?: boolean;
}) {
  return (
    <div className={`border p-5 flex flex-col gap-1.5 transition-all duration-300 ${
      accent ? 'border-[#0b2a24] bg-[#0b2a24] text-white' : 'border-[#ebe8e0] bg-white hover:shadow-sm hover:border-[#0b2a24]/30'
    }`}>
      <p className={`text-[9px] uppercase tracking-[0.18em] ${accent ? 'text-white/50' : 'text-gray-400'}`}
        style={{ fontFamily: 'var(--font-open-sans)' }}>
        {label}
      </p>
      <p className={`text-2xl font-light leading-none ${accent ? 'text-white' : 'text-[#0b2a24]'}`}
        style={{ fontFamily: 'var(--font-playfair-display)' }}>
        <AnimatedNum value={value} prefix={prefix} suffix={suffix} />
      </p>
      <div className="flex items-center gap-2">
        {delta !== undefined && <DeltaBadge delta={delta} />}
        {sub && <p className={`text-[11px] ${accent ? 'text-white/50' : 'text-gray-400'}`}
          style={{ fontFamily: 'var(--font-open-sans)' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Custom tooltips ─────────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#ebe8e0] px-4 py-3 shadow-lg text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
      <p className="text-gray-400 text-[10px] mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-[#0b2a24] text-xs">
          {p.name === 'revenue' ? fmtRub(p.value) : p.name === 'orders' ? `${p.value} заказов` : `${p.value} новых`}
        </p>
      ))}
    </div>
  );
}

// ─── Sort table hook ─────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';
function useTableSort<T extends Record<string, unknown>>(data: T[], def: keyof T) {
  const [key, setKey] = useState<keyof T>(def);
  const [dir, setDir] = useState<SortDir>('desc');
  const toggle = (k: keyof T) => {
    if (k === key) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setKey(k); setDir('desc'); }
  };
  const sorted = [...data].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null) return 1; if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
  return { sorted, key, dir, toggle };
}

// ─── Customer Profile Modal ───────────────────────────────────────────────────

function CustomerModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { user } = useAdminContext();
  const canSendBotCoupon = user?.permissions.includes('bots.manage') ?? false;
  const [data, setData] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [couponCatalog, setCouponCatalog] = useState<{ code: string; discount_percent: number }[]>([]);
  const [couponPlatform, setCouponPlatform] = useState<'all' | 'telegram' | 'max'>('all');
  const [couponSending, setCouponSending] = useState(false);
  const [couponResult, setCouponResult] = useState('');

  useEffect(() => {
    fetch(`/api/admin/crm/customer?id=${id}`)
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false));
    fetch('/api/admin/promotions')
      .then(r => r.ok ? r.json() : { coupons: [] })
      .then(d => setCouponCatalog((d.coupons ?? []).filter((c: { active: boolean }) => c.active)));
  }, [id]);

  const seg = data
    ? (Number(data.stats.orders_confirmed) >= 5 || data.stats.total_spent >= 50000 ? 'vip'
      : Number(data.stats.orders_confirmed) >= 1 ? 'active' : 'new')
    : 'new';

  const botSubs = data?.bot_subscribers?.filter((s) => s.is_active) ?? [];
  const couponOptions = couponCatalog.map((c) => ({
    code: c.code,
    label: `${c.code} (−${c.discount_percent}%)`,
  }));

  const handleCrmSendCoupon = async (values: SendCouponFormValues) => {
    setCouponSending(true);
    setCouponResult('');
    try {
      const res = await fetch('/api/admin/crm/customer/send-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cabinetUserId: id,
          platform: couponPlatform,
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
      const d = await res.json();
      if (res.ok && d.sent > 0) {
        setCouponResult(`Отправлено в ${d.sent} бот(ов)${d.results?.[0]?.couponCode ? `: ${d.results[0].couponCode}` : ''}`);
      } else {
        setCouponResult(d.error || d.results?.[0]?.error || 'Ошибка отправки');
      }
    } catch {
      setCouponResult('Ошибка сети');
    } finally {
      setCouponSending(false);
    }
  };

  return (
    <AdminDrawer
      open
      onClose={onClose}
      subtitle="Профиль клиента"
      title={loading || !data ? 'Загрузка…' : (data.user.display_name ?? data.user.email)}
    >
        {loading || !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
            <div className="space-y-6">
              {/* User info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-[#ebe8e0] p-4">
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>Email</p>
                  <p className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>{data.user.email}</p>
                </div>
                <div className="border border-[#ebe8e0] p-4">
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>Зарегистрирован</p>
                  <p className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>{fmtDateTime(data.user.created_at)}</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Заказов', value: String(data.stats.orders_confirmed) },
                  { label: 'Потрачено', value: fmtRub(data.stats.total_spent) },
                  { label: 'Средний чек', value: data.stats.avg_order > 0 ? fmtRub(data.stats.avg_order) : '—' },
                ].map(s => (
                  <div key={s.label} className="border border-[#ebe8e0] p-4 text-center">
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>{s.label}</p>
                    <p className="text-base text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Segment */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] uppercase tracking-wider px-3 py-1 border"
                  style={{
                    color: SEGMENT_COLOR[seg], borderColor: SEGMENT_COLOR[seg] + '40',
                    backgroundColor: SEGMENT_COLOR[seg] + '12', fontFamily: 'var(--font-open-sans)',
                  }}
                >
                  {SEGMENT_LABELS[seg]}
                </span>
              </div>

              {/* Bot subscriptions + send coupon */}
              <div className="border border-[#ebe8e0] p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Боты и персональный купон
                </p>
                {botSubs.length === 0 ? (
                  <p className="text-sm text-gray-400">Клиент не подписан на Telegram/Max бота.</p>
                ) : !canSendBotCoupon ? (
                  <p className="text-sm text-gray-500">
                    Клиент в боте, но отправка купона доступна в разделе{' '}
                    <Link href="/admin/bots" className="underline text-[#0b2a24]">«Боты: рассылки и QR»</Link>{' '}
                    (нужно право «Боты»).
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {botSubs.map((s) => (
                        <span
                          key={s.id}
                          className="text-xs px-2 py-1 border border-[#ebe8e0] bg-gray-50"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          {s.platform === 'telegram' ? 'Telegram' : 'Max'}
                          {s.is_vip ? ' · VIP' : ''}
                          {s.phone ? ` · ${s.phone}` : ''}
                        </span>
                      ))}
                    </div>
                    {botSubs.some((s) => s.manager_notes?.trim()) ? (
                      <p className="text-xs text-gray-600 whitespace-pre-wrap border-l-2 border-amber-300 pl-3">
                        {botSubs.map((s) => s.manager_notes?.trim()).filter(Boolean).join('\n')}
                      </p>
                    ) : null}
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1.5">Куда отправить</label>
                      <AdminSelect
                        value={couponPlatform}
                        onChange={(v) => setCouponPlatform(v as 'all' | 'telegram' | 'max')}
                        options={[
                          { value: 'all', label: 'Все боты клиента' },
                          ...botSubs.map((s) => ({
                            value: s.platform,
                            label: s.platform === 'telegram' ? 'Telegram' : 'Max',
                          })).filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i),
                        ]}
                        fullWidth
                      />
                    </div>
                    <SendCouponForm
                      couponOptions={couponOptions}
                      loading={couponSending}
                      onSubmit={handleCrmSendCoupon}
                      initialValues={{ codePrefix: 'CRM', title: 'Персональный купон CRM' }}
                    />
                    {couponResult && (
                      <p className={`text-sm ${couponResult.startsWith('Отправлено') ? 'text-green-700' : 'text-red-600'}`}>
                        {couponResult}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Orders list */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  История заказов ({data.orders.length})
                </p>
                <div className="space-y-3">
                  {data.orders.length === 0 && (
                    <p className="text-sm text-gray-300 text-center py-6">Заказов нет</p>
                  )}
                  {data.orders.map(o => (
                    <div key={o.id} className="border border-[#ebe8e0] bg-gray-50/40 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400">#{o.id}</span>
                          <span className="text-xs font-medium text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            {o.reference_code ?? `ORD-${o.id}`}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 border"
                            style={{
                              color: STATUS_COLOR[o.status] ?? '#9ca3af',
                              borderColor: (STATUS_COLOR[o.status] ?? '#9ca3af') + '40',
                              backgroundColor: (STATUS_COLOR[o.status] ?? '#9ca3af') + '12',
                              fontFamily: 'var(--font-open-sans)',
                            }}>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {o.total_display ?? '—'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        {fmtDateTime(o.created_at)}
                        {o.delivery_city && ` · ${o.delivery_city}`}
                      </p>
                      {o.tracking_number ? (
                        <p className="text-[10px] font-mono text-gray-500 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          Трек СДЭК: {o.tracking_number}
                        </p>
                      ) : null}
                      {o.cdek_last_status_code ? (
                        <p className="text-[10px] text-gray-500 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          СДЭК: {o.cdek_last_status_code}
                        </p>
                      ) : null}
                      {(o.items as OrderItem[]).length > 0 && (
                        <ul className="space-y-0.5">
                          {(o.items as OrderItem[]).map((item, i) => (
                            <li key={i} className="text-xs flex gap-2 text-gray-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
                              <span className="text-gray-400">{item.quantity}×</span>
                              <span className="flex-1 truncate">{item.product_name ?? `#${item.auction_id}`}</span>
                              <span className="shrink-0 text-gray-400">{item.unit_price_display ?? '—'}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
        )}
    </AdminDrawer>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function OrdersTab({
  orders,
  assignees,
  onSave,
  myTasksOnly,
  adminUserId,
}: {
  orders: Order[];
  assignees: { id: number; label: string }[];
  onSave: (id: number, d: Record<string, unknown>) => Promise<void>;
  myTasksOnly: boolean;
  adminUserId: number | null;
}) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    status: '',
    tracking_number: '',
    eta_days: '',
    progress_percent: '',
    crm_assignee_admin_id: '',
    crm_due_at: '',
    crm_priority: 'normal',
    crm_internal_notes: '',
  });
  const [saving, setSaving] = useState(false);

  const assigneeSelectOptions = [
    { value: '', label: 'Не назначен' },
    ...assignees.map((a) => ({ value: String(a.id), label: a.label })),
  ];

  const crmPrioritySelectOptions = (['low', 'normal', 'high', 'urgent'] as const).map((v) => ({
    value: v,
    label: CRM_PRIORITY_LABEL[v] ?? v,
  }));

  function crmDueOverdue(dueAt: string | null): boolean {
    if (!dueAt) return false;
    return new Date(dueAt).getTime() < Date.now();
  }

  const filtered = orders.filter((o) => {
    if (myTasksOnly && adminUserId != null && !matchesMyTasksFilter(o.crm_assignee_admin_id, adminUserId, true)) {
      return false;
    }
    if (filterStatus && o.status !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(o.id).includes(q) ||
      (o.reference_code ?? '').toLowerCase().includes(q) ||
      (o.customer_name ?? '').toLowerCase().includes(q) ||
      (o.customer_email ?? '').toLowerCase().includes(q) ||
      (o.user_email ?? '').toLowerCase().includes(q) ||
      (o.customer_phone ?? '').includes(q) ||
      (o.tracking_number ?? '').toLowerCase().includes(q) ||
      (o.cdek_order_uuid ?? '').toLowerCase().includes(q) ||
      (o.cdek_last_status_code ?? '').toLowerCase().includes(q) ||
      (o.crm_assignee_label ?? '').toLowerCase().includes(q) ||
      (o.crm_internal_notes ?? '').toLowerCase().includes(q)
    );
  });

  const openEdit = (o: Order) => {
    setEditingId(o.id);
    setEditForm({
      status: o.status ?? 'processing',
      tracking_number: o.tracking_number ?? '',
      eta_days: o.eta_days != null ? String(o.eta_days) : '',
      progress_percent: o.progress_percent != null ? String(o.progress_percent) : '',
      crm_assignee_admin_id: o.crm_assignee_admin_id != null ? String(o.crm_assignee_admin_id) : '',
      crm_due_at: isoToDatetimeLocal(o.crm_due_at),
      crm_priority:
        o.crm_priority && CRM_PRIORITY_LABEL[o.crm_priority] ? o.crm_priority : 'normal',
      crm_internal_notes: o.crm_internal_notes ?? '',
    });
  };

  const exportCsv = () => {
    const rows = [
      [
        'ID',
        'Код',
        'Статус',
        'Клиент',
        'Email',
        'Телефон',
        'Город',
        'Сумма',
        'Дата',
        'Трек СДЭК',
        'Доставка клиент ₽',
        'Тариф СДЭК ₽',
        'Исполнитель CRM',
        'Дедлайн CRM',
        'Приоритет CRM',
        'СДЭК UUID',
        'Посл. статус СДЭК',
      ],
      ...filtered.map((o) => [
        o.id,
        o.reference_code ?? '',
        STATUS_LABEL[o.status] ?? o.status,
        o.customer_name ?? '',
        o.customer_email ?? o.user_email ?? '',
        o.customer_phone ?? '',
        o.delivery_city ?? '',
        o.subtotal_rub ? fmtRub(o.subtotal_rub) : (o.total_display ?? ''),
        fmtDateTime(o.created_at),
        o.tracking_number ?? '',
        o.delivery_rub != null ? String(o.delivery_rub) : '',
        o.delivery_tariff_rub != null ? String(o.delivery_tariff_rub) : '',
        o.crm_assignee_label ?? '',
        o.crm_due_at ? fmtDateTime(o.crm_due_at) : '',
        CRM_PRIORITY_LABEL[o.crm_priority ?? ''] ?? (o.crm_priority ?? ''),
        o.cdek_order_uuid ?? '',
        o.cdek_last_status_code ?? '',
      ]),
    ];
    downloadCsv(rows as string[][], `orders_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Поиск: ID, код, имя, email, исполнитель..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-[#ebe8e0] text-sm outline-none focus:border-[#0b2a24] w-64 bg-white"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        />
        <AdminSelect value={filterStatus} onChange={setFilterStatus} options={STATUS_SELECT_OPTIONS} size="md" />
        <button
          onClick={exportCsv}
          className="ml-auto px-4 py-2 border border-[#ebe8e0] text-xs uppercase tracking-widest text-gray-500 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          ↓ Экспорт CSV
        </button>
        <span className="self-center text-xs text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
          {filtered.length} / {orders.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">
            {myTasksOnly && orders.length > 0
              ? 'Нет заказов, назначенных на вас. Снимите фильтр «Только мои задачи» в шапке.'
              : 'Заказов не найдено'}
          </p>
        )}
        {filtered.map((order) => (
          <div key={order.id} className="border border-[#ebe8e0] bg-white overflow-hidden transition-all">
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/60 transition-colors"
              onClick={() => setExpandedId((p) => (p === order.id ? null : order.id))}
            >
              <span className="text-[10px] text-gray-300 font-mono w-8">#{order.id}</span>
              <span className="text-sm font-medium text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {order.reference_code ?? `ORD-${order.id}`}
              </span>
              <span
                className="text-[9px] uppercase tracking-wider px-2 py-0.5 border"
                style={{
                  color: STATUS_COLOR[order.status] ?? '#9ca3af',
                  borderColor: (STATUS_COLOR[order.status] ?? '#9ca3af') + '40',
                  backgroundColor: (STATUS_COLOR[order.status] ?? '#9ca3af') + '12',
                  fontFamily: 'var(--font-open-sans)',
                }}
              >
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
              {order.crm_due_at &&
              crmDueOverdue(order.crm_due_at) &&
              !['cancelled', 'refunded', 'delivered'].includes(order.status) ? (
                <span
                  className="text-[9px] px-2 py-0.5 bg-red-50 text-red-700 border border-red-200"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  CRM просрочен
                </span>
              ) : null}
              {order.progress_percent != null && (
                <div className="hidden md:block w-20 h-1 bg-gray-100">
                  <div className="h-full bg-[#0b2a24]/50 transition-all" style={{ width: `${order.progress_percent}%` }} />
                </div>
              )}
              <span className="text-sm text-gray-700 flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {order.customer_name ?? order.user_email ?? '—'}
              </span>
              {order.crm_assignee_label ? (
                <span
                  className="text-[9px] text-gray-500 truncate max-w-[120px] hidden sm:inline"
                  title={order.crm_assignee_label}
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {order.crm_assignee_label}
                </span>
              ) : null}
              <span className="text-sm font-semibold text-[#0b2a24] hidden sm:block" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {order.total_display ?? '—'}
              </span>
              <span className="text-[10px] text-gray-400 hidden lg:block" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {fmtDateTime(order.created_at)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(order);
                }}
                className="text-[9px] uppercase tracking-widest border border-[#0b2a24]/20 text-[#0b2a24] px-2.5 py-1 hover:bg-[#0b2a24] hover:text-white transition-colors"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Изменить
              </button>
            </div>

            {expandedId === order.id && (
              <div className="border-t border-[#ebe8e0] animate-fade-in">
                <div className="px-4 py-4 grid grid-cols-2 lg:grid-cols-5 gap-4 bg-[#faf9f7]">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Покупатель
                    </p>
                    <p className="text-xs text-[#0b2a24]">{order.customer_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{order.customer_phone ?? '—'}</p>
                    <p className="text-xs text-gray-500 truncate">{order.customer_email ?? order.user_email ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Адрес
                    </p>
                    <p className="text-xs text-[#0b2a24]">
                      {[order.delivery_city, order.delivery_street, order.delivery_house].filter(Boolean).join(', ') || '—'}
                    </p>
                    {order.customer_comment && (
                      <p className="text-xs text-gray-400 italic mt-1">«{order.customer_comment}»</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Скидки & трекинг
                    </p>
                    {order.coupon_code && (
                      <p className="text-xs text-[#0b2a24]">
                        Купон {order.coupon_code}: −{fmtRub(order.discount_rub ?? 0)}
                      </p>
                    )}
                    {(order.loyalty_percent ?? 0) > 0 && (
                      <p className="text-xs text-[#0b2a24]">
                        Лояльность {order.loyalty_percent}%: −{fmtRub(order.loyalty_discount_rub ?? 0)}
                      </p>
                    )}
                    {order.tracking_number && (
                      <p className="text-xs font-mono text-gray-500 mt-1">{order.tracking_number}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      СДЭК
                    </p>
                    {order.delivery_rub != null && Number(order.delivery_rub) > 0 ? (
                      <p className="text-xs text-[#0b2a24]">
                        Клиент оплатил доставку: {fmtRub(Number(order.delivery_rub))}
                        {order.delivery_mode ? ` · ${order.delivery_mode === 'pvz' ? 'ПВЗ' : 'курьер'}` : ''}
                        {order.cdek_pvz_code ? ` · ${order.cdek_pvz_code}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">—</p>
                    )}
                    {order.delivery_tariff_rub != null && Number(order.delivery_tariff_rub) > 0 ? (
                      <p className="text-[10px] text-gray-600 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Расчётный тариф СДЭК (учёт): {fmtRub(Number(order.delivery_tariff_rub))}
                      </p>
                    ) : null}
                    {order.tracking_number && (
                      <p className="text-[10px] mt-1">
                        <a
                          href={`https://www.cdek.ru/tracking?order_id=${encodeURIComponent(order.tracking_number)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0b2a24] underline underline-offset-2"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Отследить на cdek.ru
                        </a>
                      </p>
                    )}
                    {order.cdek_order_uuid && (
                      <p className="text-[10px] font-mono text-gray-500 break-all mt-1" title="UUID заказа в СДЭК">
                        {order.cdek_order_uuid}
                      </p>
                    )}
                    {order.cdek_last_status_code && (
                      <p className="text-[10px] text-gray-600 mt-1">
                        Статус API: <span className="font-mono">{order.cdek_last_status_code}</span>
                        {order.cdek_last_status_at
                          ? ` · ${new Date(order.cdek_last_status_at).toLocaleString('ru-RU')}`
                          : ''}
                      </p>
                    )}
                    {order.cdek_error && (
                      <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200/80 px-2 py-1 mt-1">
                        Ошибка создания: {order.cdek_error}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Товары
                    </p>
                    <ul className="space-y-0.5">
                      {order.items.map((it, i) => (
                        <li key={i} className="text-xs flex gap-1.5 text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          <span className="text-gray-400">{it.quantity}×</span>
                          <span className="truncate flex-1">{it.product_name ?? `#${it.auction_id}`}</span>
                          <span className="shrink-0 text-gray-400">{it.unit_price_display ?? '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="col-span-full border-t border-[#ebe8e0] px-4 py-3 bg-white">
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Внутренняя CRM (не видит клиент)
                  </p>
                  <div
                    className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    <span>
                      Исполнитель: <strong>{order.crm_assignee_label ?? '—'}</strong>
                    </span>
                    <span>
                      Дедлайн: <strong>{order.crm_due_at ? fmtDateTime(order.crm_due_at) : '—'}</strong>
                      {order.crm_due_at && crmDueOverdue(order.crm_due_at) ? (
                        <span className="text-red-600 ml-1">просрочено</span>
                      ) : null}
                    </span>
                    <span>
                      Приоритет:{' '}
                      <strong>{CRM_PRIORITY_LABEL[order.crm_priority ?? 'normal'] ?? order.crm_priority ?? '—'}</strong>
                    </span>
                  </div>
                  {order.crm_internal_notes ? (
                    <p
                      className="text-[11px] text-gray-600 mt-2 whitespace-pre-wrap border-l-2 border-[#0b2a24]/20 pl-3"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {order.crm_internal_notes}
                    </p>
                  ) : (
                    <p className="text-[10px] text-gray-400 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Заметок нет — добавьте через «Изменить»
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <AdminModal
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title={editingId != null ? `Заказ #${editingId}` : 'Заказ'}
        footer={
          <div className="flex gap-3">
            <button
              onClick={async () => {
                if (editingId == null) return;
                setSaving(true);
                const dueIso =
                  editForm.crm_due_at.trim() === ''
                    ? null
                    : new Date(editForm.crm_due_at).toISOString();
                await onSave(editingId, {
                  status: editForm.status,
                  tracking_number: editForm.tracking_number || null,
                  eta_days: editForm.eta_days !== '' ? Number(editForm.eta_days) : null,
                  progress_percent: editForm.progress_percent !== '' ? Number(editForm.progress_percent) : null,
                  crm_assignee_admin_id: editForm.crm_assignee_admin_id === '' ? null : Number(editForm.crm_assignee_admin_id),
                  crm_due_at: dueIso,
                  crm_priority: editForm.crm_priority,
                  crm_internal_notes: editForm.crm_internal_notes.trim() === '' ? null : editForm.crm_internal_notes.trim(),
                });
                setSaving(false);
                setEditingId(null);
              }}
              disabled={saving}
              className="flex-1 bg-[#0b2a24] text-white text-[10px] uppercase tracking-widest py-3 hover:bg-[#0b2a24]/90 transition-colors disabled:opacity-50"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="px-5 border border-[#ebe8e0] text-sm hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
          </div>
        }
      >
              <p className="text-[9px] uppercase tracking-widest text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Логистика
              </p>
              <div className="space-y-4">
              <div>
                <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Статус
                </label>
                <AdminSelect
                  value={editForm.status}
                  onChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                  options={STATUS_EDIT_OPTIONS}
                  fullWidth
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Трек-номер
                </label>
                <input
                  type="text"
                  value={editForm.tracking_number}
                  onChange={(e) => setEditForm((f) => ({ ...f, tracking_number: e.target.value }))}
                  className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24]"
                  placeholder="RU123456789CN"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Дней доставки
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.eta_days}
                    onChange={(e) => setEditForm((f) => ({ ...f, eta_days: e.target.value }))}
                    className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24]"
                    placeholder="7"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Прогресс (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.progress_percent}
                    onChange={(e) => setEditForm((f) => ({ ...f, progress_percent: e.target.value }))}
                    className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24]"
                    placeholder="75"
                  />
                </div>
              </div>

              <p className="text-[9px] uppercase tracking-widest text-gray-400 pt-2 border-t border-[#ebe8e0]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Назначение и контроль сроков
              </p>
              <div>
                <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Исполнитель (админ)
                </label>
                <AdminSelect
                  value={editForm.crm_assignee_admin_id}
                  onChange={(v) => setEditForm((f) => ({ ...f, crm_assignee_admin_id: v }))}
                  options={assigneeSelectOptions}
                  fullWidth
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Сделать до
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.crm_due_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, crm_due_at: e.target.value }))}
                    className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Приоритет
                  </label>
                  <AdminSelect
                    value={editForm.crm_priority}
                    onChange={(v) => setEditForm((f) => ({ ...f, crm_priority: v }))}
                    options={crmPrioritySelectOptions}
                    fullWidth
                  />
                </div>
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Внутренние заметки (передача смене, уточнения по клиенту)
                </label>
                <textarea
                  value={editForm.crm_internal_notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, crm_internal_notes: e.target.value }))}
                  rows={4}
                  className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24] resize-none"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                  placeholder="Например: позвонить по размеру · согласовать замену камня..."
                />
              </div>
              </div>
      </AdminModal>
    </div>
  );
}

// ─── Customers Tab ────────────────────────────────────────────────────────────

function CustomersTab({ customers, segments }: { customers: Customer[]; segments: Record<string, number> }) {
  const [search, setSearch] = useState('');
  const [filterSeg, setFilterSeg] = useState('');
  const [profileId, setProfileId] = useState<number | null>(null);
  const { sorted, key, dir, toggle } = useTableSort<Record<string, unknown>>(
    customers as unknown as Record<string, unknown>[], 'total_spent'
  );

  const filtered = (sorted as unknown as Customer[]).filter(c => {
    if (filterSeg && c.segment !== filterSeg) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.email ?? '').toLowerCase().includes(q) || (c.display_name ?? '').toLowerCase().includes(q);
  });

  const exportCsv = () => {
    const rows = [
      ['ID', 'Email', 'Имя', 'Сегмент', 'RFM', 'Заказов', 'Потрачено', 'Средний чек', 'Последний заказ', 'Зарегистрирован'],
      ...filtered.map(c => [
        c.id, c.email, c.display_name ?? '',
        SEGMENT_LABELS[c.segment] ?? c.segment, c.rfm,
        c.orders_count, fmtRub(Number(c.total_spent)),
        Number(c.avg_order) > 0 ? fmtRub(Math.round(Number(c.avg_order))) : '',
        c.last_order_date ? fmtDateTime(c.last_order_date) : '',
        fmtDateTime(c.registered_at),
      ]),
    ];
    downloadCsv(rows as string[][], `customers_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th className="text-left text-[9px] uppercase tracking-widest text-gray-400 py-3 pr-4 font-normal cursor-pointer hover:text-[#0b2a24] select-none whitespace-nowrap"
      style={{ fontFamily: 'var(--font-open-sans)' }}
      onClick={() => toggle(col as keyof Customer)}>
      {label} {key === col ? (dir === 'desc' ? '↓' : '↑') : <span className="opacity-30">↕</span>}
    </th>
  );

  return (
    <div>
      {profileId !== null && <CustomerModal id={profileId} onClose={() => setProfileId(null)} />}

      {/* Segment cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {['new', 'active', 'vip'].map(seg => (
          <button key={seg} onClick={() => setFilterSeg(f => f === seg ? '' : seg)}
            className={`border p-4 text-left transition-all ${filterSeg === seg ? 'border-[#0b2a24] bg-[#0b2a24] text-white' : 'border-[#ebe8e0] bg-white hover:border-[#0b2a24]/30 hover:shadow-sm'}`}>
            <p className={`text-[9px] uppercase tracking-widest mb-1 ${filterSeg === seg ? 'text-white/50' : 'text-gray-400'}`}
              style={{ fontFamily: 'var(--font-open-sans)' }}>
              {SEGMENT_LABELS[seg]}
            </p>
            <p className={`text-3xl font-light ${filterSeg === seg ? 'text-white' : 'text-[#0b2a24]'}`}
              style={{ fontFamily: 'var(--font-playfair-display)' }}>
              {segments[seg] ?? 0}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input type="text" placeholder="Email или имя..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-[#ebe8e0] text-sm outline-none focus:border-[#0b2a24] w-64 bg-white"
          style={{ fontFamily: 'var(--font-open-sans)' }} />
        <button onClick={exportCsv}
          className="ml-auto px-4 py-2 border border-[#ebe8e0] text-xs uppercase tracking-widest text-gray-500 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
          style={{ fontFamily: 'var(--font-open-sans)' }}>
          ↓ Экспорт CSV
        </button>
        <span className="self-center text-xs text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
          {filtered.length} клиентов
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#ebe8e0]">
              <Th col="email" label="Клиент" />
              <Th col="orders_count" label="Заказов" />
              <Th col="total_spent" label="Потрачено" />
              <Th col="avg_order" label="Ср. чек" />
              <Th col="rfm" label="RFM" />
              <Th col="last_order_date" label="Последний заказ" />
              <Th col="segment" label="Сегмент" />
              <th className="text-left text-[9px] uppercase tracking-widest text-gray-400 py-3 pr-4 font-normal" style={{ fontFamily: 'var(--font-open-sans)' }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const totalRevenue = customers.reduce((s, x) => s + Number(x.total_spent), 0);
              const share = totalRevenue > 0 ? (Number(c.total_spent) / totalRevenue) * 100 : 0;
              return (
                <tr key={c.id}
                  className="border-b border-[#ebe8e0]/60 hover:bg-gray-50/40 cursor-pointer transition-colors"
                  onClick={() => setProfileId(c.id)}>
                  <td className="py-3 pr-4">
                    <p className="text-xs text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>{c.email}</p>
                    {c.display_name && <p className="text-[10px] text-gray-400">{c.display_name}</p>}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700 tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {c.orders_count}
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-xs text-[#0b2a24] font-medium tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      {fmtRub(Number(c.total_spent))}
                    </p>
                    <div className="mt-1 h-0.5 bg-gray-100 w-20">
                      <div className="h-full bg-[#0b2a24]/50" style={{ width: `${Math.min(share * 4, 100)}%` }} />
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700 tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {Number(c.avg_order) > 0 ? fmtRub(Math.round(Number(c.avg_order))) : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex gap-0.5">
                      {[c.rfm_r, c.rfm_f, c.rfm_m].map((v, i) => (
                        <div key={i} className="flex flex-col items-center">
                          <div className="w-5 h-5 text-[8px] flex items-center justify-center font-medium"
                            style={{
                              background: `rgba(11,42,36,${v * 0.18})`,
                              color: v >= 3 ? '#0b2a24' : '#9ca3af',
                              fontFamily: 'var(--font-open-sans)',
                            }}>
                            {v}
                          </div>
                          <span className="text-[7px] text-gray-300" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            {['R', 'F', 'M'][i]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {c.last_order_date ? fmtDateTime(c.last_order_date) : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 border"
                      style={{
                        color: SEGMENT_COLOR[c.segment], borderColor: SEGMENT_COLOR[c.segment] + '40',
                        backgroundColor: SEGMENT_COLOR[c.segment] + '12', fontFamily: 'var(--font-open-sans)',
                      }}>
                      {SEGMENT_LABELS[c.segment]}
                    </span>
                  </td>
                  <td className="py-3 text-gray-300 hover:text-[#0b2a24] transition-colors text-xs">→</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({ products, coupons }: { products: Product[]; coupons: Coupon[] }) {
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalUnits = products.reduce((s, p) => s + p.units_sold, 0);
  return (
    <div className="space-y-8">
      <div className="bg-white border border-[#ebe8e0] p-5">
        <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-4" style={{ fontFamily: 'var(--font-open-sans)' }}>Топ товаров по продажам</p>
        {products.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-8">Нет данных</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={products.slice(0, 10)} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebe8e0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="product_name" width={170}
                tick={{ fontSize: 10, fontFamily: 'var(--font-open-sans)', fill: '#0b2a24' }}
                tickLine={false} axisLine={false}
                tickFormatter={v => String(v).length > 24 ? String(v).slice(0, 24) + '…' : String(v)} />
              <Tooltip contentStyle={{ border: '1px solid #ebe8e0', borderRadius: 0, fontSize: 11, fontFamily: 'var(--font-open-sans)' }}
                formatter={(v) => [`${v} шт.`, 'Продано']} />
              <Bar dataKey="units_sold" fill="#0b2a24" radius={0} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div>
        <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Детализация — {totalUnits} единиц продано
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ebe8e0]">
                {['#', 'Товар', 'Продано', 'Выручка', 'Доля'].map(h => (
                  <th key={h} className="text-left text-[9px] uppercase tracking-widest text-gray-400 py-3 pr-5 font-normal"
                    style={{ fontFamily: 'var(--font-open-sans)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const share = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
                return (
                  <tr key={i} className="border-b border-[#ebe8e0]/60 hover:bg-gray-50/40 transition-colors">
                    <td className="py-3 pr-5 text-xs text-gray-300 tabular-nums w-8">{i + 1}</td>
                    <td className="py-3 pr-5">
                      <p className="text-xs text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>{p.product_name}</p>
                      {p.auction_id && <p className="text-[10px] text-gray-400">#{p.auction_id}</p>}
                    </td>
                    <td className="py-3 pr-5 text-xs text-gray-700 tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>{p.units_sold} шт.</td>
                    <td className="py-3 pr-5 text-xs text-[#0b2a24] font-medium tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      {p.revenue > 0 ? fmtRub(p.revenue) : '—'}
                    </td>
                    <td className="py-3 pr-5">
                      <div className="flex items-center gap-2">
                        <div className="h-1 bg-gray-100 w-24 shrink-0">
                          <div className="h-full bg-[#0b2a24] transition-all" style={{ width: `${share}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {share.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {coupons.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>Использование купонов</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {coupons.map(c => (
              <div key={c.coupon_code} className="border border-[#ebe8e0] bg-white p-4">
                <p className="text-xs font-mono tracking-wider text-[#0b2a24] mb-2">{c.coupon_code}</p>
                <p className="text-2xl font-light text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>{c.usage_count}×</p>
                <p className="text-[10px] text-gray-400 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>−{fmtRub(c.total_discount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Finance Tab ──────────────────────────────────────────────────────────────

function FinanceTab({ data }: { data: CrmData }) {
  const { kpi, monthly, new_customers_chart, statuses } = data;
  const totalDiscount = kpi.coupon_discounts_total + kpi.loyalty_discounts_total;
  const discountRate = kpi.revenue_all > 0 ? (totalDiscount / kpi.revenue_all) * 100 : 0;
  const confirmedOrders = statuses.filter(s => !['cancelled', 'refunded'].includes(s.status)).reduce((s, r) => s + r.count, 0);
  const cancelRate = data.orders.length > 0
    ? (data.orders.filter(o => o.status === 'cancelled' || o.status === 'refunded').length / data.orders.length) * 100
    : 0;

  return (
    <div className="space-y-8">
      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Выручка всего', value: fmtRub(kpi.revenue_all) },
          { label: 'Скидок выдано', value: fmtRub(totalDiscount), sub: `${discountRate.toFixed(1)}% от выручки` },
          { label: 'Подтверждённых заказов', value: confirmedOrders.toLocaleString('ru-RU') },
          { label: 'Отмена / возврат', value: `${cancelRate.toFixed(1)}%`, sub: `${data.orders.filter(o => o.status === 'cancelled').length} отмен` },
        ].map(s => (
          <div key={s.label} className="border border-[#ebe8e0] bg-white p-5">
            <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>{s.label}</p>
            <p className="text-xl font-light text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>{s.value}</p>
            {s.sub && <p className="text-[10px] text-gray-400 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Monthly revenue */}
      <div className="bg-white border border-[#ebe8e0] p-5">
        <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-5" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Выручка по месяцам (12 мес.)
        </p>
        {monthly.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-12">Нет данных</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebe8e0" vertical={false} />
              <XAxis dataKey="month" tickFormatter={fmtMonth}
                tick={{ fontSize: 10, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                tickLine={false} axisLine={false}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : String(v)} />
              <Tooltip contentStyle={{ border: '1px solid #ebe8e0', borderRadius: 0, fontSize: 11, fontFamily: 'var(--font-open-sans)' }}
                formatter={(v) => [fmtRub(Number(v)), 'Выручка']}
                labelFormatter={(s) => fmtMonth(String(s))} />
              <Bar dataKey="revenue" fill="#0b2a24" radius={0} animationDuration={1000} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Revenue vs new customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#ebe8e0] p-5">
          <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-4" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Новые клиенты за период
          </p>
          {new_customers_chart.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-10">Нет данных</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={new_customers_chart} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ebe8e0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDate}
                  tick={{ fontSize: 9, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                  tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<RevenueTooltip />} />
                <Line type="monotone" dataKey="new_customers" stroke="#6366f1" strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }} animationDuration={1000} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Discount breakdown */}
        <div className="bg-white border border-[#ebe8e0] p-5">
          <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-4" style={{ fontFamily: 'var(--font-open-sans)' }}>Структура скидок</p>
          <div className="space-y-4 mt-2">
            {[
              { label: 'Купонные скидки', value: kpi.coupon_discounts_total, color: '#0b2a24' },
              { label: 'Скидки лояльности', value: kpi.loyalty_discounts_total, color: '#6366f1' },
            ].map(row => {
              const pct = totalDiscount > 0 ? (row.value / totalDiscount) * 100 : 0;
              return (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span style={{ color: row.color, fontFamily: 'var(--font-open-sans)' }}>{row.label}</span>
                    <span className="text-gray-500 tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      {fmtRub(row.value)} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100">
                    <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: row.color }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-3 border-t border-[#ebe8e0]">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>Итого скидок</span>
                <span className="font-medium text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>{fmtRub(totalDiscount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue + orders combined */}
      <div className="bg-white border border-[#ebe8e0] p-5">
        <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-5" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Выручка и заказы за период (двойная ось)
        </p>
        {data.chart.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-10">Нет данных</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data.chart} margin={{ left: -10, right: 20, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebe8e0" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate}
                tick={{ fontSize: 9, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="rev" tick={{ fontSize: 9, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                tickLine={false} axisLine={false}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : String(v)} />
              <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 9, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<RevenueTooltip />} />
              <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#0b2a24" strokeWidth={2}
                fill="rgba(11,42,36,0.07)" dot={false} activeDot={{ r: 3 }} animationDuration={1200} />
              <Line yAxisId="ord" type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={2}
                dot={false} activeDot={{ r: 3 }} animationDuration={1200} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Main CRM Page ────────────────────────────────────────────────────────────

function CrmPage() {
  const router = useRouter();
  const { user, myTasksOnly } = useAdminContext();
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>(30);
  const [data, setData] = useState<CrmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const loadData = useCallback(async (p: Period, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await fetch(`/api/admin/crm?period=${p}`);
      const d = await r.json();
      setData(d);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(period); }, [loadData, period]);

  // Auto-refresh every 5 min
  useEffect(() => {
    const t = setInterval(() => loadData(period, true), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [loadData, period]);

  const handleSaveOrder = async (id: number, body: Record<string, unknown>) => {
    const r = await fetch('/api/admin/crm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    if (r.ok) { showToast('Заказ обновлён'); await loadData(period, true); }
    else showToast('Ошибка сохранения');
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'orders', label: `Заказы${data ? ` (${data.orders.length})` : ''}` },
    { id: 'customers', label: `Клиенты${data ? ` (${data.kpi.customers_total})` : ''}` },
    { id: 'products', label: 'Товары' },
    { id: 'finance', label: 'Финансы' },
  ];

  const PERIODS: { value: Period; label: string }[] = [
    { value: 7, label: '7 дн' },
    { value: 30, label: '30 дн' },
    { value: 90, label: '90 дн' },
    { value: 365, label: 'Год' },
  ];

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      {toast && (
        <div className="fixed top-5 right-5 z-[60] bg-[#0b2a24] text-white text-sm px-5 py-3 shadow-xl animate-fade-in"
          style={{ fontFamily: 'var(--font-open-sans)' }}>
          {toast}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-[#ebe8e0] bg-white sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
          <div className="flex items-center gap-4 py-3.5">
            <Link href="/admin"
              className="text-[9px] uppercase tracking-widest text-gray-400 hover:text-[#0b2a24] transition-colors shrink-0 hidden sm:block"
              style={{ fontFamily: 'var(--font-open-sans)' }}>
              ← Панель
            </Link>

            <div className="flex items-center gap-2">
              <h1 className="text-lg text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}>
                CRM
              </h1>
              {refreshing && <div className="w-3.5 h-3.5 border border-[#0b2a24] border-t-transparent rounded-full animate-spin" />}
            </div>

            {/* Tabs */}
            <nav className="hidden md:flex items-center ml-4 border border-[#ebe8e0]">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-[10px] uppercase tracking-widest transition-colors whitespace-nowrap ${
                    tab === t.id ? 'bg-[#0b2a24] text-white' : 'text-gray-400 hover:text-[#0b2a24] hover:bg-gray-50'
                  }`}
                  style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {t.label}
                </button>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              {lastUpdated && (
                <span className="text-[9px] text-gray-300 hidden lg:block" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {/* Period picker */}
              <div className="hidden sm:flex border border-[#ebe8e0]">
                {PERIODS.map(p => (
                  <button key={p.value} onClick={() => setPeriod(p.value)}
                    className={`px-3 py-1.5 text-[9px] uppercase tracking-widest transition-colors ${
                      period === p.value ? 'bg-[#0b2a24] text-white' : 'text-gray-400 hover:text-[#0b2a24]'
                    }`}
                    style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button onClick={() => loadData(period, true)}
                className="text-[9px] uppercase tracking-widest text-gray-400 hover:text-[#0b2a24] transition-colors border border-[#ebe8e0] px-3 py-1.5"
                style={{ fontFamily: 'var(--font-open-sans)' }}>
                ↺
              </button>
            </div>
          </div>

          {/* Mobile tabs */}
          <div className="md:hidden flex border-t border-[#ebe8e0] overflow-x-auto scrollbar-none">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-[10px] uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id ? 'border-[#0b2a24] text-[#0b2a24]' : 'border-transparent text-gray-400'
                }`}
                style={{ fontFamily: 'var(--font-open-sans)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-7">
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center h-72 gap-4">
            <div className="w-10 h-10 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>Загрузка данных CRM...</p>
          </div>
        ) : !data ? null : (
          <>
            {/* ── OVERVIEW ──────────────────────────────────────────── */}
            {tab === 'overview' && (
              <div className="space-y-7 animate-fade-in">
                {/* Mobile period */}
                <div className="flex sm:hidden gap-1.5">
                  {PERIODS.map(p => (
                    <button key={p.value} onClick={() => setPeriod(p.value)}
                      className={`px-3 py-1.5 text-[9px] uppercase tracking-widest border transition-colors ${
                        period === p.value ? 'bg-[#0b2a24] text-white border-[#0b2a24]' : 'border-[#ebe8e0] text-gray-400'
                      }`}
                      style={{ fontFamily: 'var(--font-open-sans)' }}>
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  <KpiCard label={`Выручка ${period}д`} value={data.kpi.revenue_period} suffix=" ₽"
                    delta={data.kpi.revenue_delta} sub={`Всего: ${F(data.kpi.revenue_all)}`} accent />
                  <KpiCard label={`Заказов ${period}д`} value={data.kpi.orders_period}
                    delta={data.kpi.orders_delta} sub={`Всего: ${data.kpi.orders_all}`} />
                  <KpiCard label="Средний чек" value={data.kpi.avg_order_period} suffix=" ₽"
                    delta={data.kpi.avg_order_delta} sub="подтверждённые" />
                  <KpiCard label="Клиентов" value={data.kpi.customers_total}
                    sub={`+${data.kpi.customers_new_period} за период`} />
                  <KpiCard label={`Купоны ${period}д`} value={data.kpi.coupon_discounts_period} suffix=" ₽"
                    sub={`Всего: ${F(data.kpi.coupon_discounts_total)}`} />
                  <KpiCard label={`Лояльность ${period}д`} value={data.kpi.loyalty_discounts_period} suffix=" ₽"
                    sub={`Всего: ${F(data.kpi.loyalty_discounts_total)}`} />
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                  {/* Revenue area */}
                  <div className="xl:col-span-2 border border-[#ebe8e0] bg-white p-5">
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-4" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Выручка по дням
                    </p>
                    {data.chart.length === 0 ? (
                      <div className="h-52 flex items-center justify-center text-sm text-gray-300">Нет данных</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={data.chart} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                          <defs>
                            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0b2a24" stopOpacity={0.12} />
                              <stop offset="95%" stopColor="#0b2a24" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ebe8e0" vertical={false} />
                          <XAxis dataKey="date" tickFormatter={fmtDate}
                            tick={{ fontSize: 9, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                            tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9, fontFamily: 'var(--font-open-sans)', fill: '#9ca3af' }}
                            tickLine={false} axisLine={false}
                            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : String(v)} />
                          <Tooltip content={<RevenueTooltip />} />
                          <Area type="monotone" dataKey="revenue" stroke="#0b2a24" strokeWidth={2}
                            fill="url(#grad)" dot={false} activeDot={{ r: 4, fill: '#0b2a24', strokeWidth: 0 }} animationDuration={1200} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Status donut */}
                  <div className="border border-[#ebe8e0] bg-white p-5">
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-4" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Статусы заказов
                    </p>
                    {data.statuses.length === 0 ? (
                      <div className="h-52 flex items-center justify-center text-sm text-gray-300">Нет данных</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={data.statuses} cx="50%" cy="44%" innerRadius={52} outerRadius={78}
                            dataKey="count" nameKey="status" paddingAngle={2} animationDuration={900}>
                            {data.statuses.map((e, i) => (
                              <Cell key={e.status} fill={STATUS_COLOR[e.status] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ border: '1px solid #ebe8e0', borderRadius: 0, fontSize: 11, fontFamily: 'var(--font-open-sans)' }}
                            formatter={(v, name) => [v, STATUS_LABEL[String(name)] ?? name]} />
                          <Legend iconType="circle" iconSize={6}
                            formatter={(v: string) => (
                              <span style={{ fontSize: 9, fontFamily: 'var(--font-open-sans)', color: '#6b7280' }}>
                                {STATUS_LABEL[v] ?? v}
                              </span>
                            )} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Bottom row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Recent orders */}
                  <div className="border border-[#ebe8e0] bg-white p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>Последние заказы</p>
                      <button onClick={() => setTab('orders')}
                        className="text-[9px] text-[#0b2a24] hover:underline" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Все →
                      </button>
                    </div>
                    <div className="space-y-2.5">
                      {data.recent_orders.map(o => (
                        <div key={o.id} className="flex items-center gap-2 py-1.5 border-b border-[#ebe8e0]/60 last:border-0">
                          <span className="text-[9px] text-gray-300 font-mono w-7">#{o.id}</span>
                          <span className="text-[9px] px-1.5 py-0.5 border shrink-0"
                            style={{
                              color: STATUS_COLOR[(o as Order).status] ?? '#9ca3af',
                              borderColor: (STATUS_COLOR[(o as Order).status] ?? '#9ca3af') + '40',
                              backgroundColor: (STATUS_COLOR[(o as Order).status] ?? '#9ca3af') + '12',
                              fontFamily: 'var(--font-open-sans)',
                            }}>
                            {STATUS_LABEL[(o as Order).status] ?? (o as Order).status}
                          </span>
                          <span className="text-xs text-[#0b2a24] flex-1 truncate min-w-0"
                            style={{ fontFamily: 'var(--font-open-sans)' }}>
                            {(o as Order).customer_name ?? (o as Order).user_email ?? '—'}
                          </span>
                          <span className="text-xs font-medium text-[#0b2a24] shrink-0"
                            style={{ fontFamily: 'var(--font-open-sans)' }}>
                            {(o as Order).total_display ?? '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top products */}
                  <div className="border border-[#ebe8e0] bg-white p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>Топ товаров</p>
                      <button onClick={() => setTab('products')}
                        className="text-[9px] text-[#0b2a24] hover:underline" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Все →
                      </button>
                    </div>
                    <div className="space-y-3">
                      {data.products.slice(0, 6).map((p, i) => {
                        const max = data.products[0]?.units_sold ?? 1;
                        return (
                          <div key={i} className="flex items-center gap-2.5">
                            <span className="text-[9px] text-gray-200 w-3 tabular-nums text-right">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-[#0b2a24] truncate" style={{ fontFamily: 'var(--font-open-sans)' }}>{p.product_name}</p>
                              <div className="mt-1 h-0.5 bg-gray-100">
                                <div className="h-full bg-[#0b2a24] transition-all duration-700"
                                  style={{ width: `${(p.units_sold / max) * 100}%` }} />
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-400 tabular-nums shrink-0 w-10 text-right"
                              style={{ fontFamily: 'var(--font-open-sans)' }}>
                              {p.units_sold} шт
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Discount summary */}
                  <div className="border border-[#ebe8e0] bg-white p-5">
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-4" style={{ fontFamily: 'var(--font-open-sans)' }}>Скидки всего</p>
                    {[
                      { label: 'По купонам', value: data.kpi.coupon_discounts_total, color: '#0b2a24' },
                      { label: 'По лояльности', value: data.kpi.loyalty_discounts_total, color: '#6366f1' },
                    ].map(row => {
                      const total = data.kpi.coupon_discounts_total + data.kpi.loyalty_discounts_total;
                      const pct = total > 0 ? (row.value / total) * 100 : 0;
                      return (
                        <div key={row.label} className="mb-4">
                          <div className="flex justify-between text-xs mb-1.5">
                            <span style={{ color: row.color, fontFamily: 'var(--font-open-sans)' }}>{row.label}</span>
                            <span className="text-gray-400 tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>
                              {fmtRub(row.value)}
                            </span>
                          </div>
                          <div className="h-1 bg-gray-100">
                            <div className="h-full" style={{ width: `${pct}%`, background: row.color }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="border-t border-[#ebe8e0] pt-3 mt-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>Итого</span>
                        <span className="font-medium text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {fmtRub(data.kpi.coupon_discounts_total + data.kpi.loyalty_discounts_total)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>% от выручки</span>
                        <span className="text-gray-600 tabular-nums" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {data.kpi.revenue_all > 0
                            ? `${(((data.kpi.coupon_discounts_total + data.kpi.loyalty_discounts_total) / data.kpi.revenue_all) * 100).toFixed(1)}%`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'orders' && (
              <div className="animate-fade-in">
                <OrdersTab
                  orders={data.orders}
                  assignees={data.assignees ?? []}
                  onSave={handleSaveOrder}
                  myTasksOnly={myTasksOnly}
                  adminUserId={user?.id ?? null}
                />
              </div>
            )}
            {tab === 'customers' && <div className="animate-fade-in"><CustomersTab customers={data.customers} segments={data.segments} /></div>}
            {tab === 'products' && <div className="animate-fade-in"><ProductsTab products={data.products} coupons={data.coupons} /></div>}
            {tab === 'finance' && <div className="animate-fade-in"><FinanceTab data={data} /></div>}
          </>
        )}
      </main>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.3s ease both; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

export default function CrmPageGuarded() {
  return (
    <AdminProtected permission="crm.view">
      <CrmPage />
    </AdminProtected>
  );
}
