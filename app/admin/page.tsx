'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAdminContext } from '@/app/components/admin/AdminContext';
import { SITE_BRAND } from '@/lib/legalPublic';
import type { AdminPermission } from '@/lib/admin/roles';
import {
  ADMIN_QUICK_TASKS,
  filterNavGroups,
  searchNavItems,
} from '@/lib/admin/navCatalog';

function canSee(p: AdminPermission | null, perms: Set<string>) {
  return !p || perms.has(p);
}

export default function AdminDashboard() {
  const { user, loading } = useAdminContext();
  const [search, setSearch] = useState('');

  const permSet = useMemo(
    () => new Set(user?.permissions ?? []),
    [user?.permissions]
  );

  const can = (p: AdminPermission | null) => canSee(p, permSet);

  const sections = useMemo(
    () => filterNavGroups(can).filter((g) => g.id !== 'overview'),
    [permSet]
  );

  const quickTasks = useMemo(
    () => ADMIN_QUICK_TASKS.filter((t) => can(t.permission)),
    [permSet]
  );

  const searchResults = useMemo(
    () => searchNavItems(search, can).filter((i) => i.href !== '/admin'),
    [search, permSet]
  );

  if (loading || !user) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-sm text-neutral-500">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.28em] text-neutral-500 mb-3">
          Рабочий стол
        </p>
        <h1
          className="text-3xl md:text-4xl text-neutral-900 mb-2"
          style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}
        >
          {SITE_BRAND}
        </h1>
        <p className="text-sm text-neutral-600 max-w-2xl leading-relaxed">
          Здравствуйте, <strong>{user.displayName || user.username}</strong> ({user.roleLabel}).
          Ниже — быстрые действия и полная карта разделов. Не знаете куда идти — введите запрос в поиск.
        </p>
      </div>

      {/* Search */}
      <div className="mb-10 bg-white border border-neutral-200 p-5 md:p-6 shadow-sm">
        <label htmlFor="admin-search" className="block text-sm font-medium text-neutral-800 mb-2">
          🔍 Найти раздел
        </label>
        <input
          id="admin-search"
          type="search"
          placeholder="Например: купон, qr, рассылка, резерв лота, заказ, менеджер…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-900"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        />
        {search.trim() && (
          <ul className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
            {searchResults.length === 0 ? (
              <li className="text-sm text-neutral-400">Ничего не найдено. Попробуйте «купон», «бот», «crm».</li>
            ) : (
              searchResults.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex justify-between items-start gap-4 p-3 border border-neutral-100 hover:border-neutral-900 hover:bg-neutral-50 transition-colors group"
                  >
                    <div>
                      <span className="block text-sm font-medium text-neutral-900 group-hover:text-black">
                        {item.label}
                      </span>
                      <span className="block text-xs text-neutral-500 mt-0.5">{item.hint}</span>
                      <span className="block text-[11px] text-neutral-400 mt-1">
                        Можно: {item.tasks.slice(0, 2).join(' · ')}
                      </span>
                    </div>
                    <span className="text-neutral-300 group-hover:text-neutral-900 shrink-0">→</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Quick tasks */}
      {!search.trim() && quickTasks.length > 0 && (
        <div className="mb-10">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-neutral-500 mb-4">
            Частые задачи — нажмите и попадёте куда нужно
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {quickTasks.map((task) => (
              <Link
                key={task.title}
                href={task.href}
                className="flex items-center gap-3 bg-white border border-neutral-200 px-4 py-3.5 hover:border-neutral-900 hover:shadow-sm transition-all group"
              >
                <span className="text-xl shrink-0" aria-hidden>{task.emoji}</span>
                <span className="text-sm text-neutral-800 group-hover:text-black" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {task.title}
                </span>
                <span className="ml-auto text-neutral-300 group-hover:text-neutral-800">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Full map */}
      {!search.trim() && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
              Все разделы по категориям
            </h2>
            <Link
              href="/admin/guide"
              className="text-xs text-neutral-500 hover:text-neutral-900 underline underline-offset-2"
            >
              Подробная инструкция →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.map((section) => (
              <div
                key={section.id}
                className="bg-white border border-neutral-200/80 shadow-[0_1px_0_rgba(0,0,0,0.04)] p-6"
              >
                <h3 className="text-[11px] mb-4 pb-3 border-b border-neutral-100 uppercase tracking-[0.14em] text-neutral-500 font-medium">
                  {section.title}
                </h3>
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block py-2.5 px-3 border border-neutral-100 hover:border-neutral-900 hover:bg-neutral-50/80 transition-all group"
                      >
                        <span className="block text-sm font-medium text-neutral-900">{item.label}</span>
                        <span className="block text-xs text-neutral-500 mt-0.5">{item.hint}</span>
                        <span className="block text-[10px] text-neutral-400 mt-1 leading-snug">
                          {item.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-10 p-5 bg-amber-50/80 border border-amber-200/60 text-sm text-amber-950/90 leading-relaxed">
        <p className="font-medium mb-1">💡 Путаница бывает у всех — шпаргалка:</p>
        <ul className="list-disc pl-5 space-y-1 text-[13px]">
          <li><strong>Купон + QR для сайта</strong> → «Купоны и акции»</li>
          <li><strong>Рассылка / купон в Telegram или Max</strong> → «Боты: рассылки и QR»</li>
          <li><strong>Купон конкретному клиенту</strong> → CRM (профиль) или Боты (строка подписчика)</li>
          <li><strong>«Резерв лота» в форме</strong> → «Темы обращений» (не «Тексты кабинета»!)</li>
          <li><strong>Назначить менеджера</strong> → CRM → заказ → «Исполнитель»</li>
        </ul>
      </div>
    </div>
  );
}
