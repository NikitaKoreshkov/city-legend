'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageToolbar } from '@/app/components/admin/AdminPageToolbar';
import { AdminModal } from '@/app/components/admin/AdminModal';
import { AdminSelect } from '@/app/components/admin/AdminSelect';
import { SendCouponForm, type SendCouponFormValues } from '@/app/components/admin/SendCouponForm';
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminCard,
  adminInputStyle,
  adminSectionLabel,
} from '@/app/components/admin/adminUi';

type Tab = 'subscribers' | 'broadcast' | 'templates' | 'triggers' | 'scheduled';
type Platform = 'telegram' | 'max';
type BroadcastSegment = 'all' | 'no_purchase' | 'no_coupon_30d' | 'qr_no_order' | 'vip';

interface Subscriber {
  id: number;
  platform: Platform;
  platform_user_id: string;
  first_name: string;
  phone: string;
  phone_key: string | null;
  cabinet_user_id: number | null;
  is_active: boolean;
  is_vip: boolean;
  manager_notes: string;
  registered_at: string;
  last_coupon: string | null;
  coupon_status: string | null;
  cabinet_email: string | null;
  sibling_ids: number[];
}

interface CouponHistoryItem {
  id: number;
  coupon_code: string;
  sent_at: string;
  qr_scanned_at: string | null;
  order_id: number | null;
  order_status: string | null;
}

interface SubscriberDetail extends Subscriber {
  cabinet_display_name: string | null;
  coupons: CouponHistoryItem[];
  siblings: Array<{ id: number; platform: Platform; platform_user_id: string; is_active: boolean }>;
}

interface BotsStats {
  activeSubscribers: number;
  telegramActive: number;
  maxActive: number;
  newLast7Days: number;
  couponsIssued30d: number;
  couponsUsed30d: number;
  qrScans30d: number;
  qrToOrderConversionPct: number;
  dualPlatformGroups: number;
}

interface CouponOption {
  code: string;
  title: string;
  discount_percent: number;
}

interface Template {
  id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface TriggerSettings {
  abandoned_cart_enabled: boolean;
  abandoned_cart_hours: number;
  abandoned_cart_text: string | null;
  post_purchase_enabled: boolean;
  post_purchase_days: number;
  post_purchase_text: string | null;
  birthday_enabled: boolean;
  birthday_text: string | null;
}

interface ScheduledItem {
  id: number;
  status: string;
  scheduled_at: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  run_id: number | null;
}

interface BroadcastResult {
  ok: boolean;
  runId?: number;
  sent: number;
  failed: number;
  total: number;
  scheduledId?: number;
  scheduledAt?: string;
  failures?: Array<{
    subscriberId: number;
    platform: string;
    firstName: string;
    error: string;
  }>;
}

interface PhoneGroup {
  phoneKey: string;
  phone: string;
  members: Subscriber[];
  dualPlatform: boolean;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  telegram: 'Telegram',
  max: 'Max',
};

const SEGMENT_OPTIONS: { value: BroadcastSegment; label: string }[] = [
  { value: 'all', label: 'Все подписчики' },
  { value: 'no_purchase', label: 'Без покупок' },
  { value: 'no_coupon_30d', label: 'Без купона 30 дней' },
  { value: 'qr_no_order', label: 'QR без заказа' },
  { value: 'vip', label: 'VIP' },
];

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: 'subscribers', label: 'Подписчики' },
  { id: 'broadcast', label: 'Рассылка' },
  { id: 'templates', label: 'Шаблоны' },
  { id: 'triggers', label: 'Триггеры' },
  { id: 'scheduled', label: 'Отложенные' },
];

function buildFilterParams(filters: {
  q: string;
  platform: 'all' | Platform;
  hasCabinet: '' | '1' | '0';
  vipOnly: boolean;
  noCouponDays: string;
  registeredFrom: string;
  registeredTo: string;
  segment: BroadcastSegment;
  includeInactive: boolean;
  groupByPhone: boolean;
}): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.q.trim()) sp.set('q', filters.q.trim());
  if (filters.platform !== 'all') sp.set('platform', filters.platform);
  if (filters.hasCabinet === '1') sp.set('hasCabinet', '1');
  if (filters.hasCabinet === '0') sp.set('hasCabinet', '0');
  if (filters.vipOnly) sp.set('vipOnly', '1');
  if (filters.noCouponDays) sp.set('noCouponDays', filters.noCouponDays);
  if (filters.registeredFrom) sp.set('registeredFrom', filters.registeredFrom);
  if (filters.registeredTo) sp.set('registeredTo', filters.registeredTo);
  if (filters.segment && filters.segment !== 'all') sp.set('segment', filters.segment);
  if (filters.includeInactive) sp.set('includeInactive', '1');
  if (filters.groupByPhone) sp.set('groupByPhone', '1');
  return sp;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function AdminBotsWorkspace() {
  const router = useRouter();
  const inputStyle = adminInputStyle;

  const [tab, setTab] = useState<Tab>('subscribers');
  const [stats, setStats] = useState<BotsStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Subscriber filters
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState<'all' | Platform>('all');
  const [hasCabinet, setHasCabinet] = useState<'' | '1' | '0'>('');
  const [vipOnly, setVipOnly] = useState(false);
  const [noCouponDays, setNoCouponDays] = useState('');
  const [registeredFrom, setRegisteredFrom] = useState('');
  const [registeredTo, setRegisteredTo] = useState('');
  const [segment, setSegment] = useState<BroadcastSegment>('all');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [groupByPhone, setGroupByPhone] = useState(false);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [groups, setGroups] = useState<PhoneGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [couponCatalog, setCouponCatalog] = useState<CouponOption[]>([]);

  // Detail modal
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SubscriberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailNotes, setDetailNotes] = useState('');
  const [detailVip, setDetailVip] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [detailSaveMsg, setDetailSaveMsg] = useState('');

  // Coupon modal
  const [couponTarget, setCouponTarget] = useState<Subscriber | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponResult, setCouponResult] = useState('');
  const [couponBothMode, setCouponBothMode] = useState(false);

  // Text modal
  const [textTarget, setTextTarget] = useState<Subscriber | null>(null);
  const [textBody, setTextBody] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [textResult, setTextResult] = useState('');

  const [actionBusyId, setActionBusyId] = useState<number | null>(null);

  // Broadcast
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastPlatform, setBroadcastPlatform] = useState<'all' | Platform>('all');
  const [broadcastSegment, setBroadcastSegment] = useState<BroadcastSegment>('all');
  const [broadcastVipOnly, setBroadcastVipOnly] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [sendCoupon, setSendCoupon] = useState(false);
  const [broadcastCouponMode, setBroadcastCouponMode] = useState<'create' | 'existing'>('create');
  const [broadcastCouponCode, setBroadcastCouponCode] = useState('');
  const [broadcastDiscount, setBroadcastDiscount] = useState(10);
  const [broadcastExpiryDays, setBroadcastExpiryDays] = useState(30);
  const [broadcastPrefix, setBroadcastPrefix] = useState('PROMO');
  const [sending, setSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [broadcastError, setBroadcastError] = useState('');
  const [failuresExpanded, setFailuresExpanded] = useState(false);
  const [runFailures, setRunFailures] = useState<BroadcastResult['failures']>([]);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editTemplateTitle, setEditTemplateTitle] = useState('');
  const [editTemplateBody, setEditTemplateBody] = useState('');

  // Triggers
  const [triggers, setTriggers] = useState<TriggerSettings | null>(null);
  const [triggersSaving, setTriggersSaving] = useState(false);
  const [triggersMsg, setTriggersMsg] = useState('');

  // Scheduled
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);

  const filterParams = useMemo(
    () =>
      buildFilterParams({
        q,
        platform,
        hasCabinet,
        vipOnly,
        noCouponDays,
        registeredFrom,
        registeredTo,
        segment,
        includeInactive,
        groupByPhone,
      }),
    [q, platform, hasCabinet, vipOnly, noCouponDays, registeredFrom, registeredTo, segment, includeInactive, groupByPhone]
  );

  const couponSelectOptions = couponCatalog.map((c) => ({
    code: c.code,
    label: `${c.code} (−${c.discount_percent}%)`,
  }));

  const checkAuth = useCallback(
    (res: Response) => {
      if (res.status === 401) {
        router.push('/admin/login');
        return true;
      }
      return false;
    },
    [router]
  );

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/admin/bots?stats=1');
      if (checkAuth(res)) return;
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats ?? null);
      }
    } finally {
      setStatsLoading(false);
    }
  }, [checkAuth]);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterParams.toString();
      const res = await fetch(`/api/admin/bots${qs ? `?${qs}` : ''}`);
      if (checkAuth(res)) return;
      const data = await res.json();
      setSubscribers(data.subscribers ?? []);
      setGroups(data.groups ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterParams, checkAuth]);

  const loadCoupons = useCallback(async () => {
    const res = await fetch('/api/admin/promotions');
    if (res.ok) {
      const d = await res.json();
      const active = (d.coupons ?? []).filter((c: CouponOption & { active: boolean }) => c.active);
      setCouponCatalog(active);
      if (active.length > 0) setBroadcastCouponCode((prev) => prev || active[0].code);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/admin/bots/templates');
      if (checkAuth(res)) return;
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } finally {
      setTemplatesLoading(false);
    }
  }, [checkAuth]);

  const fetchTriggers = useCallback(async () => {
    const res = await fetch('/api/admin/bots/triggers');
    if (checkAuth(res)) return;
    if (res.ok) {
      const data = await res.json();
      setTriggers(data.settings ?? null);
    }
  }, [checkAuth]);

  const fetchScheduled = useCallback(async () => {
    setScheduledLoading(true);
    try {
      const res = await fetch('/api/admin/bots/scheduled');
      if (checkAuth(res)) return;
      if (res.ok) {
        const data = await res.json();
        setScheduled(data.scheduled ?? []);
      }
    } finally {
      setScheduledLoading(false);
    }
  }, [checkAuth]);

  const fetchDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true);
      setDetailSaveMsg('');
      try {
        const res = await fetch(`/api/admin/bots/subscribers/${id}`);
        if (checkAuth(res)) return;
        if (res.ok) {
          const data = await res.json();
          const sub: SubscriberDetail = data.subscriber;
          setDetail(sub);
          setDetailNotes(sub.manager_notes ?? '');
          setDetailVip(sub.is_vip);
          setLinkEmail(sub.cabinet_email ?? '');
        } else {
          setDetail(null);
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [checkAuth]
  );

  const refreshAll = useCallback(() => {
    fetchStats();
    fetchSubscribers();
    if (tab === 'templates') fetchTemplates();
    if (tab === 'triggers') fetchTriggers();
    if (tab === 'scheduled') fetchScheduled();
  }, [fetchStats, fetchSubscribers, fetchTemplates, fetchTriggers, fetchScheduled, tab]);

  useEffect(() => {
    fetchStats();
    loadCoupons();
  }, [fetchStats, loadCoupons]);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  useEffect(() => {
    if (tab === 'templates') fetchTemplates();
    if (tab === 'triggers') fetchTriggers();
    if (tab === 'scheduled') fetchScheduled();
  }, [tab, fetchTemplates, fetchTriggers, fetchScheduled]);

  useEffect(() => {
    if (detailId != null) fetchDetail(detailId);
    else setDetail(null);
  }, [detailId, fetchDetail]);

  const exportCsv = () => {
    const sp = buildFilterParams({
      q,
      platform,
      hasCabinet,
      vipOnly,
      noCouponDays,
      registeredFrom,
      registeredTo,
      segment,
      includeInactive,
      groupByPhone: false,
    });
    sp.set('export', 'csv');
    window.open(`/api/admin/bots?${sp.toString()}`, '_blank');
  };

  const openDetail = (sub: Subscriber) => {
    setDetailId(sub.id);
  };

  const toggleBlock = async (sub: Subscriber, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionBusyId(sub.id);
    try {
      const res = await fetch(`/api/admin/bots/subscribers/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !sub.is_active }),
      });
      if (res.ok) {
        fetchSubscribers();
        if (detailId === sub.id) fetchDetail(sub.id);
      }
    } finally {
      setActionBusyId(null);
    }
  };

  const deleteSubscriber = async (sub: Subscriber, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Удалить подписчика ${sub.first_name || sub.platform_user_id}?`)) return;
    setActionBusyId(sub.id);
    try {
      const res = await fetch(`/api/admin/bots/subscribers/${sub.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (detailId === sub.id) setDetailId(null);
        fetchSubscribers();
        fetchStats();
      }
    } finally {
      setActionBusyId(null);
    }
  };

  const handlePersonalSend = async (values: SendCouponFormValues) => {
    if (!couponTarget) return;
    setCouponLoading(true);
    setCouponResult('');
    const url = couponBothMode
      ? `/api/admin/bots/subscribers/${couponTarget.id}/send-coupon-both`
      : `/api/admin/bots/subscribers/${couponTarget.id}/send-coupon`;
    try {
      const res = await fetch(url, {
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
        setCouponResult(`Отправлено: ${data.couponCode ?? 'OK'}`);
        fetchSubscribers();
        if (detailId === couponTarget.id) fetchDetail(couponTarget.id);
      } else {
        setCouponResult(data.error || 'Ошибка');
      }
    } catch {
      setCouponResult('Ошибка сети');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleSendText = async () => {
    if (!textTarget || !textBody.trim()) return;
    setTextLoading(true);
    setTextResult('');
    try {
      const res = await fetch(`/api/admin/bots/subscribers/${textTarget.id}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textBody }),
      });
      const data = await res.json();
      setTextResult(res.ok ? 'Сообщение отправлено' : data.error || 'Ошибка');
    } catch {
      setTextResult('Ошибка сети');
    } finally {
      setTextLoading(false);
    }
  };

  const handleSendWelcome = async (sub: Subscriber) => {
    setActionBusyId(sub.id);
    try {
      const res = await fetch(`/api/admin/bots/subscribers/${sub.id}/send-welcome`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`Welcome-купон отправлен: ${data.couponCode}`);
        fetchSubscribers();
        if (detailId === sub.id) fetchDetail(sub.id);
      } else {
        alert(data.error || 'Ошибка');
      }
    } finally {
      setActionBusyId(null);
    }
  };

  const saveDetail = async () => {
    if (!detail) return;
    setDetailSaveMsg('');
    const body: Record<string, unknown> = {
      manager_notes: detailNotes,
      is_vip: detailVip,
    };
    if (linkEmail.trim() && linkEmail !== detail.cabinet_email) {
      body.link_cabinet_email = linkEmail.trim();
    }
    const res = await fetch(`/api/admin/bots/subscribers/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setDetail(data.subscriber);
      setDetailSaveMsg('Сохранено');
      fetchSubscribers();
    } else {
      setDetailSaveMsg(data.error || 'Ошибка');
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setSending(true);
    setBroadcastResult(null);
    setBroadcastError('');
    setRunFailures([]);
    setFailuresExpanded(false);
    try {
      const filters: Record<string, unknown> = {};
      if (q.trim()) filters.q = q.trim();
      if (hasCabinet === '1') filters.hasCabinet = true;
      if (hasCabinet === '0') filters.hasCabinet = false;
      if (noCouponDays) filters.noCouponDays = Number(noCouponDays);
      if (registeredFrom) filters.registeredFrom = registeredFrom;
      if (registeredTo) filters.registeredTo = registeredTo;

      const body: Record<string, unknown> = {
        text: broadcastText,
        platform: broadcastPlatform,
        segment: broadcastSegment,
        vipOnly: broadcastVipOnly,
        sendCoupon,
        couponMode: broadcastCouponMode,
        couponCode: broadcastCouponMode === 'existing' ? broadcastCouponCode : undefined,
        couponDiscountPercent: broadcastDiscount,
        couponExpiryDays: broadcastExpiryDays,
        couponPrefix: broadcastPrefix,
        filters,
      };
      if (scheduleAt) body.scheduleAt = new Date(scheduleAt).toISOString();

      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setBroadcastError(data.error || 'Ошибка рассылки');
        return;
      }
      setBroadcastResult(data as BroadcastResult);
      if (data.failures?.length) setRunFailures(data.failures);
      fetchSubscribers();
      fetchStats();
      if (scheduleAt) fetchScheduled();
    } catch {
      setBroadcastError('Ошибка отправки. Проверьте токены ботов в .env');
    } finally {
      setSending(false);
    }
  };

  const loadRunFailures = async (runId: number) => {
    const res = await fetch(`/api/admin/bots/broadcasts/${runId}`);
    if (res.ok) {
      const data = await res.json();
      const failures = (data.items ?? [])
        .filter((i: { success: boolean }) => !i.success)
        .map((i: { subscriber_id: number; platform: string; first_name: string; error: string }) => ({
          subscriberId: i.subscriber_id,
          platform: i.platform,
          firstName: i.first_name,
          error: i.error,
        }));
      setRunFailures(failures);
      setFailuresExpanded(true);
    }
  };

  const saveAsTemplate = async () => {
    const title = prompt('Название шаблона');
    if (!title?.trim() || !broadcastText.trim()) return;
    const res = await fetch('/api/admin/bots/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), body: broadcastText.trim() }),
    });
    if (res.ok) {
      fetchTemplates();
      alert('Шаблон сохранён');
    }
  };

  const saveTemplateEdit = async () => {
    if (!editingTemplate) return;
    const res = await fetch('/api/admin/bots/templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingTemplate.id, title: editTemplateTitle, body: editTemplateBody }),
    });
    if (res.ok) {
      setEditingTemplate(null);
      fetchTemplates();
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm('Удалить шаблон?')) return;
    await fetch(`/api/admin/bots/templates?id=${id}`, { method: 'DELETE' });
    fetchTemplates();
  };

  const saveTriggers = async () => {
    if (!triggers) return;
    setTriggersSaving(true);
    setTriggersMsg('');
    try {
      const res = await fetch('/api/admin/bots/triggers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(triggers),
      });
      const data = await res.json();
      if (res.ok) {
        setTriggers(data.settings);
        setTriggersMsg('Сохранено');
      } else {
        setTriggersMsg('Ошибка сохранения');
      }
    } finally {
      setTriggersSaving(false);
    }
  };

  const cancelScheduled = async (id: number) => {
    if (!confirm('Отменить отложенную рассылку?')) return;
    await fetch(`/api/admin/bots/scheduled?id=${id}`, { method: 'DELETE' });
    fetchScheduled();
  };

  const renderSubscriberRow = (sub: Subscriber) => (
    <tr
      key={sub.id}
      onClick={() => openDetail(sub)}
      className={`border-b border-gray-50 cursor-pointer hover:bg-neutral-50/80 ${!sub.is_active ? 'opacity-50' : ''}`}
    >
      <td className="py-2.5 pr-3">
        <span className={`inline-block px-2 py-0.5 text-xs ${sub.platform === 'telegram' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
          {PLATFORM_LABEL[sub.platform]}
        </span>
        {sub.sibling_ids.length > 0 && (
          <span className="ml-1 inline-block px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-800 border border-amber-200">
            TG+Max
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-gray-800">{sub.first_name || '—'}</td>
      <td className="py-2.5 pr-3 text-gray-600">{sub.phone || '—'}</td>
      <td className="py-2.5 pr-3">
        {sub.last_coupon ? <code className="text-xs bg-gray-100 px-1.5 py-0.5">{sub.last_coupon}</code> : '—'}
      </td>
      <td className="py-2.5 pr-3 text-xs text-gray-600">{sub.coupon_status ?? '—'}</td>
      <td className="py-2.5 pr-3 text-xs">{sub.is_vip ? <span className="text-amber-700">VIP</span> : '—'}</td>
      <td className="py-2.5 pr-3 text-xs">
        {sub.is_active ? <span className="text-green-700">Активен</span> : <span className="text-red-600">Заблокирован</span>}
      </td>
      <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={!sub.is_active || actionBusyId === sub.id}
            onClick={() => { setCouponBothMode(false); setCouponTarget(sub); setCouponResult(''); }}
            className="px-2.5 py-1 text-xs border border-[#0b2a24]/30 text-[#0b2a24] hover:bg-[#0b2a24]/5 disabled:opacity-40"
          >
            Купон+QR
          </button>
          <button
            type="button"
            disabled={!sub.is_active || actionBusyId === sub.id}
            onClick={() => { setTextTarget(sub); setTextBody(''); setTextResult(''); }}
            className="px-2 py-1 text-xs border hover:bg-gray-50 disabled:opacity-40"
          >
            Текст
          </button>
          <button
            type="button"
            disabled={actionBusyId === sub.id}
            onClick={(e) => toggleBlock(sub, e)}
            className="px-2 py-1 text-xs border hover:bg-gray-50"
          >
            {sub.is_active ? 'Блок' : 'Разблок'}
          </button>
          <button
            type="button"
            disabled={actionBusyId === sub.id}
            onClick={(e) => deleteSubscriber(sub, e)}
            className="px-2 py-1 text-xs border border-red-200 text-red-600 hover:bg-red-50"
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="max-w-6xl">
      <AdminPageToolbar onRefresh={refreshAll}>
        <p className="text-sm text-neutral-600 max-w-2xl leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Массовые рассылки, сегменты и персональные купоны с QR в Telegram и Max.
          Ручные купоны — в{' '}
          <Link href="/admin/edit/promotions" className="text-[#0b2a24] underline underline-offset-2">
            «Купоны и акции»
          </Link>.
        </p>
      </AdminPageToolbar>

      {/* Stats dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Активных', value: stats?.activeSubscribers },
          { label: 'Новых за 7 дн.', value: stats?.newLast7Days },
          { label: 'Купонов 30 дн.', value: stats?.couponsIssued30d },
          { label: 'Использовано 30 дн.', value: stats?.couponsUsed30d },
          { label: 'QR→заказ %', value: stats != null ? `${stats.qrToOrderConversionPct}%` : undefined },
          { label: 'TG+Max пар', value: stats?.dualPlatformGroups },
        ].map((s) => (
          <div key={s.label} className={`${adminCard} p-4 text-center`}>
            <div className="text-2xl font-light mb-0.5 text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              {statsLoading ? '…' : (s.value ?? '—')}
            </div>
            <div className={adminSectionLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-neutral-200 mb-6">
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === t.id ? 'border-b-2 border-[#0b2a24] text-[#0b2a24] font-medium' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Subscribers tab */}
      {tab === 'subscribers' && (
        <div className={`${adminCard} p-6`}>
          <div className="flex flex-wrap items-end gap-3 mb-5 pb-4 border-b border-neutral-100">
            <div className="flex-1 min-w-[140px]">
              <label className={`${adminSectionLabel} block mb-1`}>Поиск</label>
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, телефон…" style={inputStyle} />
            </div>
            <div className="min-w-[120px]">
              <label className={`${adminSectionLabel} block mb-1`}>Платформа</label>
              <AdminSelect
                value={platform}
                onChange={(v) => setPlatform(v as typeof platform)}
                options={[
                  { value: 'all', label: 'Все' },
                  { value: 'telegram', label: 'Telegram' },
                  { value: 'max', label: 'Max' },
                ]}
                fullWidth
              />
            </div>
            <div className="min-w-[140px]">
              <label className={`${adminSectionLabel} block mb-1`}>Сегмент</label>
              <AdminSelect
                value={segment}
                onChange={(v) => setSegment(v as BroadcastSegment)}
                options={SEGMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                fullWidth
              />
            </div>
            <div className="min-w-[100px]">
              <label className={`${adminSectionLabel} block mb-1`}>Без купона (дн.)</label>
              <input type="number" min={0} value={noCouponDays} onChange={(e) => setNoCouponDays(e.target.value)} style={inputStyle} />
            </div>
            <div className="min-w-[130px]">
              <label className={`${adminSectionLabel} block mb-1`}>Рег. с</label>
              <input type="date" value={registeredFrom} onChange={(e) => setRegisteredFrom(e.target.value)} style={inputStyle} />
            </div>
            <div className="min-w-[130px]">
              <label className={`${adminSectionLabel} block mb-1`}>Рег. по</label>
              <input type="date" value={registeredTo} onChange={(e) => setRegisteredTo(e.target.value)} style={inputStyle} />
            </div>
            <div className="flex flex-col gap-2 text-xs text-gray-600 pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasCabinet === '1'} onChange={(e) => setHasCabinet(e.target.checked ? '1' : '')} />
                Есть кабинет
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={vipOnly} onChange={(e) => setVipOnly(e.target.checked)} />
                Только VIP
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
                Заблокированные
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={groupByPhone} onChange={(e) => setGroupByPhone(e.target.checked)} />
                Группировать по тел.
              </label>
            </div>
            <button type="button" onClick={exportCsv} className={adminBtnSecondary}>
              Экспорт CSV
            </button>
          </div>

          <h2 className={`${adminSectionLabel} mb-4`}>Подписчики ({subscribers.length})</h2>

          {loading ? (
            <p className="text-sm text-gray-400">Загрузка…</p>
          ) : subscribers.length === 0 ? (
            <p className="text-sm text-gray-400">Нет подписчиков по выбранным фильтрам.</p>
          ) : groupByPhone && groups.length > 0 ? (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.phoneKey}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-800">{g.phone || g.phoneKey}</span>
                    {g.dualPlatform && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-800 border border-amber-200">TG+Max</span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      <thead>
                        <tr className="border-b border-gray-100">
                          {['Платформа', 'Имя', 'Телефон', 'Купон', 'Статус купона', 'VIP', 'Статус', 'Действия'].map((h) => (
                            <th key={h} className="pb-2 pr-3 text-left text-xs text-gray-400 uppercase tracking-wide font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>{g.members.map(renderSubscriberRow)}</tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Платформа', 'Имя', 'Телефон', 'Купон', 'Статус купона', 'VIP', 'Статус', 'Действия'].map((h) => (
                      <th key={h} className="pb-2 pr-3 text-left text-xs text-gray-400 uppercase tracking-wide font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{subscribers.map(renderSubscriberRow)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Broadcast tab */}
      {tab === 'broadcast' && (
        <div className={`${adminCard} p-6 max-w-xl space-y-4`}>
          <h2 className={`${adminSectionLabel} pb-3 border-b border-neutral-100`}>Массовая рассылка</h2>

          <AdminSelect
            value={broadcastPlatform}
            onChange={(v) => setBroadcastPlatform(v as typeof broadcastPlatform)}
            options={[
              { value: 'all', label: `Все активные (${stats?.activeSubscribers ?? '…'})` },
              { value: 'telegram', label: `Telegram (${stats?.telegramActive ?? '…'})` },
              { value: 'max', label: `Max (${stats?.maxActive ?? '…'})` },
            ]}
            fullWidth
          />

          <AdminSelect
            value={broadcastSegment}
            onChange={(v) => setBroadcastSegment(v as BroadcastSegment)}
            options={SEGMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            fullWidth
          />

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={broadcastVipOnly} onChange={(e) => setBroadcastVipOnly(e.target.checked)} className="w-4 h-4" />
            Только VIP
          </label>

          <div>
            <label className={`${adminSectionLabel} block mb-1`}>Шаблон</label>
            <AdminSelect
              value={selectedTemplateId}
              onChange={(v) => {
                setSelectedTemplateId(v);
                const tpl = templates.find((t) => String(t.id) === v);
                if (tpl) setBroadcastText(tpl.body);
              }}
              options={[
                { value: '', label: '— выберите шаблон —' },
                ...templates.map((t) => ({ value: String(t.id), label: t.title })),
              ]}
              fullWidth
            />
          </div>

          <textarea
            rows={5}
            placeholder="Текст рассылки… Поддерживаются {имя}, {купон}, {скидка}"
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical' }}
          />

          <div className="flex gap-2">
            <button type="button" onClick={saveAsTemplate} className={adminBtnSecondary}>
              Сохранить как шаблон
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={sendCoupon} onChange={(e) => setSendCoupon(e.target.checked)} className="w-4 h-4" />
            Приложить купон (QR + код текстом)
          </label>

          {sendCoupon && (
            <div className="space-y-3 p-4 bg-neutral-50/80 border border-neutral-100">
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

          <div>
            <label className={`${adminSectionLabel} block mb-1`}>Отложить отправку</label>
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} style={inputStyle} />
          </div>

          <button
            onClick={handleBroadcast}
            disabled={sending || !broadcastText.trim()}
            className={adminBtnPrimary}
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            {sending ? 'Отправка…' : scheduleAt ? 'Запланировать рассылку' : 'Отправить рассылку'}
          </button>

          {broadcastResult && (
            <div className="border border-green-200 bg-green-50 p-3 text-sm text-green-800 space-y-2">
              {broadcastResult.scheduledId ? (
                <p>
                  Запланировано #{broadcastResult.scheduledId} на {broadcastResult.scheduledAt ? formatDate(broadcastResult.scheduledAt) : '—'}
                </p>
              ) : (
                <>
                  <p>
                    Отправлено: <b>{broadcastResult.sent}</b> / {broadcastResult.total}
                    {broadcastResult.failed > 0 && <span className="text-red-600"> · Ошибок: {broadcastResult.failed}</span>}
                    {broadcastResult.runId != null && (
                      <span className="ml-2">
                        · Запуск #{broadcastResult.runId}
                      </span>
                    )}
                  </p>
                  {(runFailures?.length ?? 0) > 0 && (
                    <div>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => setFailuresExpanded((v) => !v)}
                      >
                        {failuresExpanded ? 'Скрыть ошибки' : `Показать ошибки (${runFailures!.length})`}
                      </button>
                      {failuresExpanded && (
                        <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-red-700 space-y-1">
                          {runFailures!.map((f) => (
                            <li key={f.subscriberId}>
                              #{f.subscriberId} {f.firstName} ({f.platform}): {f.error}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {broadcastResult.runId != null && (runFailures?.length ?? 0) === 0 && broadcastResult.failed > 0 && (
                    <button type="button" className="text-xs underline" onClick={() => loadRunFailures(broadcastResult.runId!)}>
                      Загрузить список ошибок
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {broadcastError && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{broadcastError}</div>}
        </div>
      )}

      {/* Templates tab */}
      {tab === 'templates' && (
        <div className={`${adminCard} p-6`}>
          <h2 className={`${adminSectionLabel} mb-4`}>Шаблоны рассылок</h2>
          {templatesLoading ? (
            <p className="text-sm text-gray-400">Загрузка…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-400">Нет шаблонов. Сохраните текст из вкладки «Рассылка».</p>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <div key={t.id} className="border border-neutral-100 p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">{t.title}</div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{formatDate(t.updated_at)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      className={adminBtnSecondary}
                      onClick={() => {
                        setEditingTemplate(t);
                        setEditTemplateTitle(t.title);
                        setEditTemplateBody(t.body);
                      }}
                    >
                      Изменить
                    </button>
                    <button type="button" className="px-3 py-2 text-xs border border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteTemplate(t.id)}>
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Triggers tab */}
      {tab === 'triggers' && triggers && (
        <div className={`${adminCard} p-6 space-y-6 max-w-xl`}>
          <h2 className={`${adminSectionLabel} pb-3 border-b border-neutral-100`}>Автоматические триггеры</h2>

          {([
            {
              key: 'abandoned_cart' as const,
              label: 'Брошенная корзина',
              enabledKey: 'abandoned_cart_enabled' as const,
              hoursKey: 'abandoned_cart_hours' as const,
              textKey: 'abandoned_cart_text' as const,
              paramLabel: 'Часов без активности',
            },
            {
              key: 'post_purchase' as const,
              label: 'После покупки',
              enabledKey: 'post_purchase_enabled' as const,
              hoursKey: 'post_purchase_days' as const,
              textKey: 'post_purchase_text' as const,
              paramLabel: 'Дней после заказа',
            },
            {
              key: 'birthday' as const,
              label: 'День рождения',
              enabledKey: 'birthday_enabled' as const,
              textKey: 'birthday_text' as const,
            },
          ] as const).map((cfg) => (
            <div key={cfg.key} className="border border-neutral-100 p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={triggers[cfg.enabledKey]}
                  onChange={(e) => setTriggers({ ...triggers, [cfg.enabledKey]: e.target.checked })}
                />
                {cfg.label}
              </label>
              {'hoursKey' in cfg && cfg.hoursKey && (
                <div>
                  <label className="text-xs text-gray-500">{cfg.paramLabel}</label>
                  <input
                    type="number"
                    min={1}
                    value={triggers[cfg.hoursKey] as number}
                    onChange={(e) => setTriggers({ ...triggers, [cfg.hoursKey!]: parseInt(e.target.value, 10) || 1 })}
                    style={inputStyle}
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500">Текст ({'{имя}'})</label>
                <textarea
                  rows={3}
                  value={(triggers[cfg.textKey] as string | null) ?? ''}
                  onChange={(e) => setTriggers({ ...triggers, [cfg.textKey]: e.target.value || null })}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            </div>
          ))}

          <button type="button" onClick={saveTriggers} disabled={triggersSaving} className={adminBtnPrimary}>
            {triggersSaving ? 'Сохранение…' : 'Сохранить триггеры'}
          </button>
          {triggersMsg && <p className="text-sm text-green-700">{triggersMsg}</p>}
        </div>
      )}

      {/* Scheduled tab */}
      {tab === 'scheduled' && (
        <div className={`${adminCard} p-6`}>
          <h2 className={`${adminSectionLabel} mb-4`}>Отложенные рассылки</h2>
          {scheduledLoading ? (
            <p className="text-sm text-gray-400">Загрузка…</p>
          ) : scheduled.length === 0 ? (
            <p className="text-sm text-gray-400">Нет отложенных рассылок.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
                <thead>
                  <tr className="border-b border-gray-100">
                    {['ID', 'Статус', 'Когда', 'Текст', 'Автор', 'Действия'].map((h) => (
                      <th key={h} className="pb-2 pr-3 text-left text-xs text-gray-400 uppercase tracking-wide font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduled.map((s) => {
                    const payload = s.payload as { text?: string };
                    return (
                      <tr key={s.id} className="border-b border-gray-50">
                        <td className="py-2.5 pr-3">#{s.id}</td>
                        <td className="py-2.5 pr-3 text-xs">
                          <span className={s.status === 'pending' ? 'text-amber-700' : s.status === 'done' ? 'text-green-700' : 'text-gray-500'}>
                            {s.status}
                          </span>
                          {s.run_id != null && <span className="ml-1 text-gray-400">→ #{s.run_id}</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-xs">{formatDate(s.scheduled_at)}</td>
                        <td className="py-2.5 pr-3 text-xs max-w-xs truncate">{payload.text ?? '—'}</td>
                        <td className="py-2.5 pr-3 text-xs text-gray-500">{s.created_by ?? '—'}</td>
                        <td className="py-2.5">
                          {s.status === 'pending' && (
                            <button type="button" className="text-xs text-red-600 underline" onClick={() => cancelScheduled(s.id)}>
                              Отменить
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      <AdminModal
        open={detailId != null}
        onClose={() => setDetailId(null)}
        title={detail ? `${detail.first_name || 'Подписчик'} · ${PLATFORM_LABEL[detail.platform]}` : 'Подписчик'}
        widthClass="max-w-2xl"
      >
        {detailLoading ? (
          <p className="text-sm text-gray-400">Загрузка…</p>
        ) : detail ? (
          <div className="space-y-4 text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-400">ID платформы:</span> {detail.platform_user_id}</div>
              <div><span className="text-gray-400">Телефон:</span> {detail.phone || '—'}</div>
              <div><span className="text-gray-400">Регистрация:</span> {formatDate(detail.registered_at)}</div>
              <div><span className="text-gray-400">Статус:</span> {detail.is_active ? 'Активен' : 'Заблокирован'}</div>
              <div><span className="text-gray-400">Последний купон:</span> {detail.last_coupon ?? '—'}</div>
              <div><span className="text-gray-400">Статус купона:</span> {detail.coupon_status ?? '—'}</div>
              {detail.cabinet_email && (
                <div className="col-span-2">
                  <span className="text-gray-400">Кабинет:</span> {detail.cabinet_display_name ?? detail.cabinet_email}
                </div>
              )}
            </div>

            {detail.siblings.length > 0 && (
              <div className="border border-amber-100 bg-amber-50/50 p-3 space-y-2">
                <p className={`${adminSectionLabel}`}>Другие платформы (тот же телефон)</p>
                <ul className="text-xs space-y-1">
                  {detail.siblings.map((s) => (
                    <li key={s.id}>
                      {PLATFORM_LABEL[s.platform]} · {s.platform_user_id}
                      {!s.is_active && ' (заблок.)'}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={adminBtnSecondary}
                  onClick={() => { setCouponBothMode(true); setCouponTarget(detail); setCouponResult(''); }}
                >
                  Отправить купон в оба
                </button>
              </div>
            )}

            <div>
              <p className={`${adminSectionLabel} mb-2`}>История купонов</p>
              {detail.coupons.length === 0 ? (
                <p className="text-xs text-gray-400">Нет отправленных купонов</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Код', 'Отправлен', 'QR', 'Заказ'].map((h) => (
                          <th key={h} className="pb-1 pr-2 text-left text-gray-400 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.coupons.map((c) => (
                        <tr key={c.id} className="border-b border-gray-50">
                          <td className="py-1.5 pr-2 font-mono">{c.coupon_code}</td>
                          <td className="py-1.5 pr-2">{formatDate(c.sent_at)}</td>
                          <td className="py-1.5 pr-2">{c.qr_scanned_at ? formatDate(c.qr_scanned_at) : '—'}</td>
                          <td className="py-1.5 pr-2">
                            {c.order_id ? `#${c.order_id} (${c.order_status ?? '—'})` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <label className={`${adminSectionLabel} block mb-1`}>Заметки менеджера</label>
              <textarea rows={3} value={detailNotes} onChange={(e) => setDetailNotes(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={detailVip} onChange={(e) => setDetailVip(e.target.checked)} />
              VIP-подписчик
            </label>

            <div>
              <label className={`${adminSectionLabel} block mb-1`}>Привязать кабинет (email)</label>
              <div className="flex gap-2">
                <input type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="client@example.com" style={inputStyle} />
              </div>
            </div>

            <button type="button" onClick={saveDetail} className={adminBtnPrimary}>
              Сохранить
            </button>
            {detailSaveMsg && <p className={`text-xs ${detailSaveMsg === 'Сохранено' ? 'text-green-700' : 'text-red-600'}`}>{detailSaveMsg}</p>}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                className={adminBtnSecondary}
                onClick={() => { setTextTarget(detail); setTextBody(''); setTextResult(''); }}
              >
                Написать
              </button>
              <button
                type="button"
                className={adminBtnSecondary}
                onClick={() => { setCouponBothMode(false); setCouponTarget(detail); setCouponResult(''); }}
              >
                Купон+QR
              </button>
              <button type="button" className={adminBtnSecondary} onClick={() => handleSendWelcome(detail)}>
                Welcome QR
              </button>
              {detail.cabinet_user_id != null && (
                <Link href="/admin/crm" className={adminBtnSecondary} title={`Найдите клиента: ${detail.cabinet_email ?? detail.cabinet_user_id}`}>
                  CRM
                </Link>
              )}
            </div>
            {detail.cabinet_user_id != null && (
              <p className="text-xs text-gray-500">
                Откройте CRM → вкладка «Клиенты» → найдите по email: <strong>{detail.cabinet_email}</strong>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-red-600">Подписчик не найден</p>
        )}
      </AdminModal>

      {/* Coupon modal */}
      <AdminModal
        open={!!couponTarget}
        onClose={() => { setCouponTarget(null); setCouponBothMode(false); }}
        title={couponTarget ? `${couponBothMode ? 'Купон в оба → ' : 'Купон → '}${couponTarget.first_name || PLATFORM_LABEL[couponTarget.platform]}` : ''}
        widthClass="max-w-md"
      >
        {couponTarget && (
          <>
            <p className="text-xs text-gray-500 mb-4">
              {PLATFORM_LABEL[couponTarget.platform]} · {couponTarget.phone || couponTarget.platform_user_id}
            </p>
            <SendCouponForm couponOptions={couponSelectOptions} loading={couponLoading} onSubmit={handlePersonalSend} />
            {couponResult && (
              <p className={`mt-3 text-sm ${couponResult.startsWith('Отправлено') ? 'text-green-700' : 'text-red-600'}`}>
                {couponResult}
              </p>
            )}
          </>
        )}
      </AdminModal>

      {/* Text modal */}
      <AdminModal
        open={!!textTarget}
        onClose={() => setTextTarget(null)}
        title={textTarget ? `Сообщение → ${textTarget.first_name || PLATFORM_LABEL[textTarget.platform]}` : ''}
        widthClass="max-w-md"
      >
        {textTarget && (
          <div className="space-y-4">
            <textarea
              rows={5}
              placeholder="Текст сообщения…"
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <button type="button" disabled={textLoading || !textBody.trim()} onClick={handleSendText} className={adminBtnPrimary}>
              {textLoading ? 'Отправка…' : 'Отправить'}
            </button>
            {textResult && (
              <p className={`text-sm ${textResult === 'Сообщение отправлено' ? 'text-green-700' : 'text-red-600'}`}>{textResult}</p>
            )}
          </div>
        )}
      </AdminModal>

      {/* Template edit modal */}
      <AdminModal
        open={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        title="Редактировать шаблон"
        widthClass="max-w-md"
      >
        <div className="space-y-4">
          <input type="text" value={editTemplateTitle} onChange={(e) => setEditTemplateTitle(e.target.value)} placeholder="Название" style={inputStyle} />
          <textarea rows={6} value={editTemplateBody} onChange={(e) => setEditTemplateBody(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
          <button type="button" onClick={saveTemplateEdit} className={adminBtnPrimary}>Сохранить</button>
        </div>
      </AdminModal>

      <div className={`mt-8 ${adminCard} p-6 bg-[#0b2a24]/[0.03] border-[#0b2a24]/10`}>
        <h2 className={`${adminSectionLabel} mb-4`}>Подсказки</h2>
        <ul className="text-sm text-neutral-600 space-y-2 list-disc pl-5" style={{ fontFamily: 'var(--font-open-sans)' }}>
          <li>QR для ручных купонов — «Купоны и акции» → кнопка <strong>QR</strong>.</li>
          <li>Персональный купон — кнопка «Купон+QR» или CRM → профиль клиента.</li>
          <li>Сегмент «QR без заказа» — сканировали QR, но не оформили заказ.</li>
          <li>Отложенные рассылки выполняются cron-задачей на сервере.</li>
        </ul>
      </div>
    </div>
  );
}
