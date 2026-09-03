'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminProtected, useAdminContext } from '@/app/components/admin/AdminContext';
import { StaffRolePicker } from '@/app/components/admin/StaffRolePicker';
import {
  ADMIN_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AdminRole,
} from '@/lib/admin/roles';

type StaffRow = {
  id: number;
  username: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

const fieldClass =
  'w-full rounded-md border border-[#0b2a24]/20 bg-white px-3 py-2.5 text-sm text-[#0a1210] shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-[#0b2a24]/45 focus:ring-1 focus:ring-[#0b2a24]/20';
const labelClass =
  'mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500';

function StaffPageInner() {
  const { user: me } = useAdminContext();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('manager');
  const [createLoading, setCreateLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch('/api/admin/staff');
    if (!r.ok) {
      setError('Не удалось загрузить список');
      return;
    }
    const data = (await r.json()) as { staff: StaffRow[] };
    setStaff(data.staff);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function patchStaff(id: number, body: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const r = await fetch(`/api/admin/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Ошибка сохранения');
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function deleteStaff(id: number) {
    setDeleteLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Не удалось удалить');
        return;
      }
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName || undefined,
          role: newRole,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Не удалось создать');
        return;
      }
      setCreateOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('manager');
      await load();
    } finally {
      setCreateLoading(false);
    }
  }

  const canDeleteRow = (s: StaffRow) => {
    if (!me) return false;
    if (s.id === me.id) return false;
    return true;
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className="mb-2 text-[10px] uppercase tracking-[0.28em] text-[#0b2a24]/50"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            Администрирование
          </p>
          <h1
            className="text-3xl text-[#0a1210] md:text-[2rem]"
            style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}
          >
            Команда и доступы
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-600">
            Добавляйте сотрудников и роли. Удаление убирает учётную запись из системы (не только «отключить»).
            Пароли хранятся в виде хеша.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="shrink-0 rounded-md bg-[#0b2a24] px-6 py-3 text-xs uppercase tracking-[0.14em] text-white shadow-md transition hover:bg-[#0a1f1c]"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          Новый сотрудник
        </button>
      </div>

      {error && (
        <div
          className="mb-6 rounded-md border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-900"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          {error}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1210]/55 p-4 backdrop-blur-[2px]">
          <div
            className="w-full max-w-md overflow-hidden rounded-lg border border-[#0b2a24]/15 shadow-2xl"
            style={{ background: 'linear-gradient(180deg, #fbfaf8 0%, #f4f1ec 100%)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-create-title"
          >
            <div className="border-b border-[#0b2a24]/10 px-6 py-5 md:px-8">
              <h2
                id="staff-create-title"
                className="text-xl text-[#0a1210]"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                Новая учётная запись
              </h2>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 px-6 py-6 md:px-8 md:pb-8">
              <div>
                <label className={labelClass} htmlFor="staff-email">
                  Email (логин)
                </label>
                <input
                  id="staff-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className={fieldClass}
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="staff-name">
                  Отображаемое имя
                </label>
                <input
                  id="staff-name"
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className={fieldClass}
                  placeholder="Необязательно"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="staff-pw">
                  Пароль (от 10 символов, буквы и цифры)
                </label>
                <input
                  id="staff-pw"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={fieldClass}
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                />
              </div>
              <div>
                <span className={labelClass}>Роль</span>
                <StaffRolePicker
                  value={newRole}
                  onChange={setNewRole}
                  disabled={createLoading}
                />
                <p
                  className="mt-2 text-xs leading-relaxed text-neutral-600"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {ROLE_DESCRIPTIONS[newRole]}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="flex-1 rounded-md border border-[#0b2a24]/25 py-3 text-xs uppercase tracking-[0.12em] text-[#0a1210] transition hover:bg-white"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 rounded-md bg-[#0b2a24] py-3 text-xs uppercase tracking-[0.12em] text-white transition hover:bg-[#0a1f1c] disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {createLoading ? 'Создание…' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1210]/55 p-4 backdrop-blur-[2px]">
          <div
            className="w-full max-w-md rounded-lg border border-red-200/60 bg-white p-6 shadow-2xl md:p-8"
            role="dialog"
            aria-modal="true"
          >
            <h3
              className="text-lg text-[#0a1210]"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Удалить учётную запись?
            </h3>
            <p className="mt-2 text-sm text-neutral-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Будет удалён пользователь{' '}
              <strong className="text-neutral-900">
                {deleteTarget.display_name || deleteTarget.username}
              </strong>{' '}
              ({deleteTarget.username}). Восстановить данные будет нельзя.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                className="flex-1 rounded-md border border-neutral-300 py-2.5 text-xs uppercase tracking-wider text-neutral-800 hover:bg-neutral-50"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => deleteStaff(deleteTarget.id)}
                disabled={deleteLoading}
                className="flex-1 rounded-md bg-red-700 py-2.5 text-xs uppercase tracking-wider text-white hover:bg-red-800 disabled:opacity-50"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {deleteLoading ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div
          className="flex min-h-[200px] items-center justify-center rounded-lg border border-[#0b2a24]/10 bg-white/80"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          <p className="text-sm tracking-wide text-neutral-500">Загрузка…</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#0b2a24]/12 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr
                  className="border-b border-[#0b2a24]/10"
                  style={{ background: 'linear-gradient(180deg, #f7f5f2 0%, #efede8 100%)' }}
                >
                  <th
                    className="px-4 py-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b2a24]/70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Сотрудник
                  </th>
                  <th
                    className="hidden px-4 py-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b2a24]/70 md:table-cell"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Роль
                  </th>
                  <th
                    className="px-4 py-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b2a24]/70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Статус
                  </th>
                  <th
                    className="hidden px-4 py-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b2a24]/70 lg:table-cell"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Дата
                  </th>
                  <th
                    className="px-4 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b2a24]/70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-neutral-100 last:border-0 transition-colors hover:bg-[#faf9f7]/90"
                  >
                    <td className="align-top px-4 py-4">
                      <p
                        className="font-medium text-[#0a1210]"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {s.display_name || '—'}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">{s.username}</p>
                      <div className="mt-3 md:hidden">
                        <StaffRolePicker
                          value={s.role}
                          disabled={savingId === s.id}
                          size="sm"
                          onChange={(r) => patchStaff(s.id, { role: r })}
                        />
                      </div>
                    </td>
                    <td className="hidden align-top px-4 py-4 md:table-cell">
                      <StaffRolePicker
                        value={s.role}
                        disabled={savingId === s.id}
                        onChange={(r) => patchStaff(s.id, { role: r })}
                      />
                    </td>
                    <td className="align-top px-4 py-4">
                      <button
                        type="button"
                        disabled={savingId === s.id || s.id === me?.id}
                        onClick={() => patchStaff(s.id, { is_active: !s.is_active })}
                        className={`rounded border px-2.5 py-1 text-[10px] uppercase tracking-wider transition ${
                          s.is_active
                            ? 'border-emerald-800/25 bg-emerald-50/90 text-emerald-950'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-500'
                        } ${s.id === me?.id ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                        title={s.id === me?.id ? 'Нельзя отключить себя' : undefined}
                      >
                        {s.is_active ? 'Активен' : 'Отключён'}
                      </button>
                    </td>
                    <td
                      className="hidden align-top px-4 py-4 text-xs text-neutral-500 lg:table-cell"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {new Date(s.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="align-top px-4 py-4 text-right">
                      {canDeleteRow(s) ? (
                        <button
                          type="button"
                          disabled={savingId === s.id}
                          onClick={() => setDeleteTarget(s)}
                          className="text-xs uppercase tracking-[0.12em] text-red-700 underline-offset-2 transition hover:text-red-900 hover:underline disabled:opacity-50"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Удалить
                        </button>
                      ) : (
                        <span
                          className="text-[11px] text-neutral-400"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                          title="Свою учётную запись можно только выйти из профиля"
                        >
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div
        className="mt-10 rounded-lg border border-[#0b2a24]/10 bg-white p-6 md:p-8"
        style={{ boxShadow: '0 12px 40px -24px rgba(11, 42, 36, 0.35)' }}
      >
        <h3
          className="mb-4 text-[11px] uppercase tracking-[0.2em] text-[#0b2a24]/55"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          Справка по ролям
        </h3>
        <ul className="space-y-3 text-sm text-neutral-700" style={{ fontFamily: 'var(--font-open-sans)' }}>
          {ADMIN_ROLES.map((r) => (
            <li key={r} className="leading-relaxed">
              <span className="font-medium text-[#0a1210]">{ROLE_LABELS[r]}</span>
              <span className="text-neutral-500"> — </span>
              {ROLE_DESCRIPTIONS[r]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function StaffPage() {
  return (
    <AdminProtected permission="staff.manage">
      <StaffPageInner />
    </AdminProtected>
  );
}
