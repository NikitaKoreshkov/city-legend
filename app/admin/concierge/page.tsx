'use client';

import { AdminProtected, useAdminContext } from '@/app/components/admin/AdminContext';
import { AdminSelect } from '@/app/components/admin/AdminSelect';
import { matchesMyTasksFilter } from '@/lib/admin/myTasksFilter';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';

type Ticket = {
  id: number;
  userId: number;
  userEmail: string;
  topicKey: string;
  topicLabel: string;
  status: TicketStatus;
  priority: string | null;
  subject: string | null;
  orderId: number | null;
  relatedReviewId: number | null;
  assignedManagerName: string | null;
  assigneeAdminId: number | null;
  assigneeLabel: string | null;
  responseSlaMinutes: number;
  firstResponseDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  lastMessage: string | null;
  lastSenderType: 'user' | 'manager' | null;
  lastMessageAt: string | null;
};

type TicketMessage = {
  id: number;
  sender_type: 'user' | 'manager';
  message: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт',
  in_progress: 'В работе',
  waiting_customer: 'Ждём клиента',
  resolved: 'Решён',
  closed: 'Закрыт',
};

const STATUS_COLOR: Record<string, string> = {
  open: '#3b82f6',
  in_progress: '#f59e0b',
  waiting_customer: '#8b5cf6',
  resolved: '#10b981',
  closed: '#9ca3af',
};

const STATUS_OPTIONS: TicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const STATUS_SELECT_OPTIONS = [
  { value: '', label: 'Все статусы' },
  ...STATUS_OPTIONS.map(s => ({ value: s, label: STATUS_LABEL[s], color: STATUS_COLOR[s] })),
];
const STATUS_EDIT_OPTIONS = STATUS_OPTIONS.map(s => ({ value: s, label: STATUS_LABEL[s], color: STATUS_COLOR[s] }));

function slaLabel(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.round(minutes / 60)} ч`;
}

function slaColor(dueAt: string | null, status: TicketStatus): string {
  if (status === 'resolved' || status === 'closed') return 'text-gray-400';
  if (!dueAt) return 'text-gray-400';
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) return 'text-red-600';
  if (diff < 15 * 60 * 1000) return 'text-orange-500';
  return 'text-emerald-600';
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDue(dueAt: string | null): string {
  if (!dueAt) return '—';
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) {
    const mins = Math.round(Math.abs(diff) / 60000);
    return `просрочено на ${mins < 60 ? `${mins} мин` : `${Math.round(mins / 60)} ч`}`;
  }
  const mins = Math.round(diff / 60000);
  return `через ${mins < 60 ? `${mins} мин` : `${Math.round(mins / 60)} ч`}`;
}

function AdminConciergePage() {
  const router = useRouter();
  const { user, myTasksOnly } = useAdminContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [assignees, setAssignees] = useState<{ id: number; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [newStatus, setNewStatus] = useState<TicketStatus>('open');
  const [assigneeAdminId, setAssigneeAdminId] = useState('');
  const [managerName, setManagerName] = useState('Поддержка City Legend');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const loadTickets = useCallback(async () => {
    const r = await fetch('/api/admin/concierge/tickets');
    if (r.status === 401) { router.push('/admin/login'); return; }
    const d = await r.json();
    setTickets(d.tickets ?? []);
    setAssignees(d.assignees ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(loadTickets, 30000);
    return () => clearInterval(t);
  }, [loadTickets]);

  const loadMessages = async (ticketId: number) => {
    setMsgLoading(true);
    const r = await fetch(`/api/admin/concierge/tickets/messages?ticketId=${ticketId}`);
    if (r.ok) {
      const d = await r.json();
      setMessages(d.messages ?? []);
    }
    setMsgLoading(false);
  };

  const openTicket = (t: Ticket) => {
    setActiveId(t.id);
    setNewStatus(t.status);
    setAssigneeAdminId(t.assigneeAdminId != null ? String(t.assigneeAdminId) : '');
    setManagerName(t.assignedManagerName ?? 'Поддержка City Legend');
    setReply('');
    loadMessages(t.id);
  };

  const handleSubmit = async () => {
    if (!activeId) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/admin/concierge/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: activeId,
          status: newStatus,
          message: reply.trim() || undefined,
          managerName,
          assigneeAdminId: assigneeAdminId === '' ? null : Number(assigneeAdminId),
        }),
      });
      if (!r.ok) throw new Error();
      showToast(reply.trim() ? 'Ответ отправлен' : 'Статус обновлён');
      setReply('');
      await loadTickets();
      await loadMessages(activeId);
    } catch {
      showToast('Ошибка отправки');
    } finally {
      setSubmitting(false);
    }
  };

  const activeTicket = tickets.find(t => t.id === activeId) ?? null;

  const filtered = tickets.filter((t) => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (myTasksOnly && user && !matchesMyTasksFilter(t.assigneeAdminId, user.id, true)) return false;
    return true;
  });
  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-[#0b2a24] text-white text-sm px-5 py-3 shadow-xl"
          style={{ fontFamily: 'var(--font-open-sans)' }}>
          {toast}
        </div>
      )}

      <header className="border-b border-[#ebe8e0] bg-white sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-4 flex items-center gap-5">
          <Link href="/admin"
            className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-[#0b2a24] transition-colors"
            style={{ fontFamily: 'var(--font-open-sans)' }}>
            ← Панель
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}>
              Тикеты поддержки
            </h1>
            {openCount > 0 && (
              <span className="text-[10px] bg-[#0b2a24] text-white px-2 py-0.5 tabular-nums"
                style={{ fontFamily: 'var(--font-open-sans)' }}>
                {openCount} активных
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/admin/concierge/topics"
              className="text-xs border border-[#ebe8e0] px-3 py-1.5 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Типы обращений
            </Link>
            <AdminSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={STATUS_SELECT_OPTIONS}
              size="sm"
            />
            <button onClick={loadTickets}
              className="text-xs border border-[#ebe8e0] px-3 py-1.5 hover:border-[#0b2a24] transition-colors"
              style={{ fontFamily: 'var(--font-open-sans)' }}>
              ↺ Обновить
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-6 flex gap-5 h-[calc(100vh-73px)]">
        {/* ── Ticket list ─────────────────────────────────────────────── */}
        <div className={`flex flex-col gap-2 overflow-y-auto shrink-0 ${activeId ? 'hidden md:flex md:w-80 lg:w-96' : 'w-full'}`}>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-7 h-7 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-sm text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {myTasksOnly && tickets.length > 0
                  ? 'Нет тикетов, назначенных на вас. Снимите фильтр «Только мои задачи» в шапке.'
                  : 'Нет тикетов'}
              </p>
            </div>
          ) : (
            filtered.map(t => {
              const isActive = t.id === activeId;
              const overdue = t.firstResponseDueAt && new Date(t.firstResponseDueAt).getTime() < Date.now()
                && t.status !== 'resolved' && t.status !== 'closed';
              return (
                <button
                  key={t.id}
                  onClick={() => openTicket(t)}
                  className={`text-left border p-4 transition-all ${
                    isActive
                      ? 'border-[#0b2a24] bg-[#0b2a24] text-white'
                      : overdue
                        ? 'border-red-200 bg-white hover:border-red-400'
                        : 'border-[#ebe8e0] bg-white hover:border-[#0b2a24]/40 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 border ${isActive ? 'border-white/30 text-white/80' : ''}`}
                        style={!isActive ? {
                          color: STATUS_COLOR[t.status],
                          borderColor: STATUS_COLOR[t.status] + '40',
                          backgroundColor: STATUS_COLOR[t.status] + '12',
                          fontFamily: 'var(--font-open-sans)',
                        } : { fontFamily: 'var(--font-open-sans)' }}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                      {t.topicKey === 'review_negative' && (
                        <span
                          className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 ${isActive ? 'bg-white/15 text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Негатив · отзыв
                        </span>
                      )}
                      <span className={`text-[9px] ${isActive ? 'text-white/60' : 'text-gray-400'}`}
                        style={{ fontFamily: 'var(--font-open-sans)' }}>
                        #{t.id}
                      </span>
                    </div>
                    <span className={`text-[9px] tabular-nums shrink-0 ${isActive ? 'text-white/60' : slaColor(t.firstResponseDueAt, t.status)}`}
                      style={{ fontFamily: 'var(--font-open-sans)' }}>
                      {t.status !== 'resolved' && t.status !== 'closed' ? fmtDue(t.firstResponseDueAt) : '—'}
                    </span>
                  </div>

                  <p className={`text-xs font-medium truncate ${isActive ? 'text-white' : 'text-[#0b2a24]'}`}
                    style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {t.userEmail}
                  </p>
                  <p className={`text-[10px] truncate mt-0.5 ${isActive ? 'text-white/70' : 'text-gray-500'}`}
                    style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {t.topicLabel}{t.subject ? ` · ${t.subject}` : ''}
                    {t.assigneeLabel ? ` · ${t.assigneeLabel}` : ''}
                  </p>

                  {t.lastMessage && (
                    <p className={`text-[10px] mt-2 truncate ${isActive ? 'text-white/60' : 'text-gray-400'}`}
                      style={{ fontFamily: 'var(--font-open-sans)', fontStyle: 'italic' }}>
                      {t.lastSenderType === 'manager' ? 'Менеджер: ' : ''}{t.lastMessage}
                    </p>
                  )}

                  <p className={`text-[9px] mt-2 ${isActive ? 'text-white/40' : 'text-gray-300'}`}
                    style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {fmtDateTime(t.createdAt)}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {/* ── Ticket detail ────────────────────────────────────────────── */}
        {activeId && activeTicket ? (
          <div className="flex-1 min-w-0 flex flex-col border border-[#ebe8e0] bg-white overflow-hidden">
            {/* Header */}
            <div className="border-b border-[#ebe8e0] px-5 py-4 flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <button onClick={() => setActiveId(null)}
                    className="md:hidden text-gray-400 hover:text-[#0b2a24] mr-1 text-sm">←</button>
                  <span className="text-[10px] uppercase tracking-widest text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Тикет #{activeTicket.id}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 border"
                    style={{
                      color: STATUS_COLOR[activeTicket.status],
                      borderColor: STATUS_COLOR[activeTicket.status] + '40',
                      backgroundColor: STATUS_COLOR[activeTicket.status] + '12',
                      fontFamily: 'var(--font-open-sans)',
                    }}>
                    {STATUS_LABEL[activeTicket.status]}
                  </span>
                </div>
                <p className="text-base text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}>
                  {activeTicket.userEmail}
                </p>
                <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {activeTicket.topicLabel}
                  {activeTicket.subject && <> · <span className="italic">{activeTicket.subject}</span></>}
                  {' · '}SLA: {slaLabel(activeTicket.responseSlaMinutes)} ответа
                  {activeTicket.orderId && <> · Заказ #{activeTicket.orderId}</>}
                  {activeTicket.relatedReviewId != null && <> · Отзыв #{activeTicket.relatedReviewId}</>}
                </p>
                {activeTicket.topicKey === 'review_negative' && (
                  <p className="text-[11px] text-red-800 bg-red-50 border border-red-200/80 px-3 py-2 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Негативный отзыв клиента — ответ уходит в бот. При необходимости удалите или скройте отзыв в разделе{' '}
                    <Link href="/admin/reviews" className="underline font-medium text-[#0b2a24]">
                      Отзывы
                    </Link>
                    .
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-xs font-medium ${slaColor(activeTicket.firstResponseDueAt, activeTicket.status)}`}
                  style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {activeTicket.status !== 'resolved' && activeTicket.status !== 'closed'
                    ? fmtDue(activeTicket.firstResponseDueAt)
                    : activeTicket.closedAt ? `Закрыт ${fmtDateTime(activeTicket.closedAt)}` : 'Закрыт'}
                </p>
                <p className="text-[10px] text-gray-400 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {fmtDateTime(activeTicket.createdAt)}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Нет сообщений
                </p>
              ) : (
                messages.map(m => {
                  const isManager = m.sender_type === 'manager';
                  return (
                    <div key={m.id} className={`flex ${isManager ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-3 ${
                        isManager ? 'bg-[#0b2a24] text-white' : 'bg-gray-100 text-[#0b2a24]'
                      }`}>
                        <p className={`text-xs leading-relaxed whitespace-pre-wrap ${isManager ? 'text-white' : 'text-[#0b2a24]'}`}
                          style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {m.message}
                        </p>
                        <p className={`text-[9px] mt-1.5 ${isManager ? 'text-white/50' : 'text-gray-400'}`}
                          style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {isManager ? (activeTicket.assignedManagerName ?? 'Менеджер') : activeTicket.userEmail}
                          {' · '}{fmtDateTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply form */}
            <div className="border-t border-[#ebe8e0] px-5 py-4 shrink-0 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5"
                    style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Статус
                  </label>
                  <AdminSelect
                    value={newStatus}
                    onChange={v => setNewStatus(v as TicketStatus)}
                    options={STATUS_EDIT_OPTIONS}
                    fullWidth
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5"
                    style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Исполнитель
                  </label>
                  <AdminSelect
                    value={assigneeAdminId}
                    onChange={(v) => {
                      setAssigneeAdminId(v);
                      const picked = assignees.find((a) => String(a.id) === v);
                      if (picked) setManagerName(picked.label);
                    }}
                    options={[
                      { value: '', label: 'Не назначен' },
                      ...assignees.map((a) => ({ value: String(a.id), label: a.label })),
                    ]}
                    fullWidth
                  />
                </div>
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-widest text-gray-400 mb-1.5"
                  style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Имя менеджера (видит клиент)
                </label>
                <input type="text" value={managerName} onChange={e => setManagerName(e.target.value)}
                  className="w-full border border-[#ebe8e0] px-3 py-2 text-xs outline-none focus:border-[#0b2a24]"
                  style={{ fontFamily: 'var(--font-open-sans)' }} />
              </div>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Ответ клиенту (необязательно — можно просто сменить статус)"
                rows={3}
                className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24] resize-none"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              />
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-[#0b2a24] text-white text-[10px] uppercase tracking-widest py-3 hover:bg-[#0b2a24]/90 transition-colors disabled:opacity-50"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {submitting ? 'Отправка...' : reply.trim() ? 'Отправить ответ и обновить статус' : 'Обновить статус'}
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-sm text-gray-300 border border-dashed border-[#ebe8e0]"
            style={{ fontFamily: 'var(--font-open-sans)' }}>
            Выберите тикет
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminConciergePageGuarded() {
  return (
    <AdminProtected permission="support.tickets">
      <AdminConciergePage />
    </AdminProtected>
  );
}
