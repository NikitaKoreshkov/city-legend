'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminPermission } from '@/lib/admin/roles';
import {
  readMyTasksOnlyFromStorage,
  writeMyTasksOnlyToStorage,
} from '@/lib/admin/myTasksFilter';

export type AdminMeUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  roleLabel: string;
  roleDescription: string;
  permissions: AdminPermission[];
};

type AdminContextValue = {
  user: AdminMeUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Фильтр «только мои задачи» — заказы, тикеты, заявки с сайта */
  myTasksOnly: boolean;
  setMyTasksOnly: (value: boolean) => void;
  canUseMyTasksFilter: boolean;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AdminMeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [myTasksOnly, setMyTasksOnlyState] = useState(false);

  useEffect(() => {
    setMyTasksOnlyState(readMyTasksOnlyFromStorage());
  }, []);

  const setMyTasksOnly = useCallback((value: boolean) => {
    setMyTasksOnlyState(value);
    writeMyTasksOnlyToStorage(value);
  }, []);

  const canUseMyTasksFilter = Boolean(
    user &&
      (user.permissions.includes('crm.view') ||
        user.permissions.includes('support.tickets') ||
        user.permissions.includes('support.forms')),
  );

  const refresh = useCallback(async () => {
    const r = await fetch('/api/admin/me');
    if (!r.ok) {
      setUser(null);
      return;
    }
    const data = (await r.json()) as { user: AdminMeUser };
    setUser(data.user);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/me');
        if (cancelled) return;
        if (!r.ok) {
          router.replace('/admin/login');
          return;
        }
        const data = (await r.json()) as { user: AdminMeUser };
        setUser(data.user);
      } catch {
        router.replace('/admin/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AdminContext.Provider
      value={{ user, loading, refresh, myTasksOnly, setMyTasksOnly, canUseMyTasksFilter }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminContext() {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdminContext только внутри панели администратора');
  }
  return ctx;
}

/** Ограничение доступа к разделу по праву (клиентская часть; API всё равно проверяет). */
export function AdminProtected({
  permission,
  children,
}: {
  permission: AdminPermission | null;
  children: ReactNode;
}) {
  const { user, loading } = useAdminContext();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !user) return;
    if (permission && !user.permissions.includes(permission)) {
      router.replace('/admin');
    }
  }, [loading, user, permission, router, pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p
          className="text-sm tracking-wide text-neutral-500"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          Загрузка…
        </p>
      </div>
    );
  }

  if (permission && !user.permissions.includes(permission)) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-sm text-neutral-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Перенаправление…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
