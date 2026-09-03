'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { SITE_BRAND } from '@/lib/legalPublic';
import { AdminProvider, useAdminContext } from './AdminContext';
import type { AdminPermission } from '@/lib/admin/roles';
import {
  filterNavGroups,
  findNavGroup,
  findNavItem,
  ADMIN_NAV_GROUPS,
} from '@/lib/admin/navCatalog';

function ShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, myTasksOnly, setMyTasksOnly, canUseMyTasksFilter } = useAdminContext();

  const can = useMemo(() => {
    return (p: AdminPermission | null) =>
      !p || (user?.permissions?.includes(p) ?? false);
  }, [user]);

  const nav = useMemo(() => filterNavGroups(can), [can]);
  const flatNav = useMemo(() => nav.flatMap((g) => g.items), [nav]);
  const currentItem = useMemo(() => findNavItem(pathname), [pathname]);
  const currentGroup = useMemo(() => findNavGroup(pathname), [pathname]);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  return (
    <div className="flex min-h-screen bg-[#eceae6]">
      <aside
        className="hidden lg:flex w-[292px] shrink-0 flex-col border-r border-white/10 text-white"
        style={{
          background: 'linear-gradient(165deg, #0a1210 0%, #0b2a24 42%, #0a1513 100%)',
        }}
      >
        <div className="p-6 pb-5 border-b border-white/10">
          <Link href="/admin" className="block group">
            <p
              className="text-lg tracking-[0.06em] text-white/95 group-hover:text-amber-100/90 transition-colors"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              {SITE_BRAND}
            </p>
            <p
              className="text-[10px] uppercase tracking-[0.28em] text-emerald-100/45 mt-2"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Админ-панель
            </p>
          </Link>
          <Link
            href="/admin/guide"
            className="mt-4 block text-[11px] text-amber-100/70 hover:text-amber-50 border border-white/10 rounded px-3 py-2 text-center transition-colors"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            📍 Где что находится — инструкция
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-7">
          {nav.map((group) => (
            <div key={group.id}>
              <p
                className="px-3 mb-2 text-[10px] uppercase tracking-[0.18em] text-emerald-100/40 font-medium"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {group.title}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active =
                    item.href === '/admin'
                      ? pathname === '/admin' || pathname === '/admin/'
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded-md px-3 py-2 transition-all border
                          ${
                            active
                              ? 'bg-white/10 text-amber-50 border-white/15 shadow-inner'
                              : 'text-emerald-50/85 hover:bg-white/5 hover:text-white border-transparent'
                          }`}
                      >
                        <span
                          className="block text-[13px] leading-snug"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          {item.label}
                        </span>
                        {item.href !== '/admin' && (
                          <span
                            className={`block text-[10px] mt-0.5 leading-tight ${
                              active ? 'text-emerald-100/55' : 'text-emerald-100/35'
                            }`}
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            {item.hint}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 text-[10px] text-emerald-100/35 leading-relaxed px-5 pb-5">
          Не нашли раздел? Откройте «Главная» — там поиск по всей панели.
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-black/5 bg-[#f7f5f2]/95 backdrop-blur-md">
          <div className="flex flex-col gap-2 px-5 py-3 md:px-10 md:py-4">
            {/* Breadcrumb + title */}
            {currentItem && pathname !== '/admin' && pathname !== '/admin/login' && (
              <div className="hidden lg:block">
                <p
                  className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-0.5"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {currentGroup?.title ?? 'Раздел'}
                  {' · '}
                  <Link href="/admin" className="hover:text-neutral-600">
                    Главная
                  </Link>
                </p>
                <p
                  className="text-base text-neutral-900"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  {currentItem.label}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {currentItem.hint}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex lg:hidden flex-col gap-2 min-w-0 flex-1">
                <p
                  className="text-sm tracking-wide text-neutral-800 truncate"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  {currentItem?.label ?? SITE_BRAND}
                </p>
                <label className="sr-only" htmlFor="admin-mobile-nav">
                  Раздел админки
                </label>
                <select
                  id="admin-mobile-nav"
                  className="w-full text-xs border border-neutral-300 bg-white py-2 px-2 rounded-sm"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                  value={flatNav.some((i) => i.href === pathname) ? pathname : '/admin'}
                  onChange={(e) => router.push(e.target.value)}
                >
                  {nav.map((group) => (
                    <optgroup key={group.id} label={group.title}>
                      {group.items.map((item) => (
                        <option key={item.href} value={item.href}>
                          {item.label} — {item.hint}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="flex-1 hidden lg:block" />
              <div className="flex items-center gap-3 shrink-0">
                {!loading && canUseMyTasksFilter && (
                  <label
                    className="flex items-center gap-2 cursor-pointer select-none border border-neutral-300/80 bg-white/80 px-3 py-2 rounded-sm"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                    title="Только заказы, тикеты и заявки, где вы назначены исполнителем"
                  >
                    <input
                      type="checkbox"
                      checked={myTasksOnly}
                      onChange={(e) => setMyTasksOnly(e.target.checked)}
                      className="accent-[#0b2a24]"
                    />
                    <span className="text-[11px] uppercase tracking-[0.1em] text-neutral-700 hidden md:inline">
                      Только мои задачи
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.1em] text-neutral-700 md:hidden">
                      Мои
                    </span>
                  </label>
                )}
                {!loading && user && (
                  <div className="text-right hidden sm:block">
                    <p className="text-sm text-neutral-800" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      {user.displayName || user.username}
                    </p>
                    <p className="text-[11px] text-neutral-500">{user.roleLabel}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 text-xs uppercase tracking-[0.12em] border border-neutral-900/80 text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Выйти
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/admin/login';

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <AdminProvider>
      <ShellChrome>{children}</ShellChrome>
    </AdminProvider>
  );
}

// re-export for guide page
export { ADMIN_NAV_GROUPS };
