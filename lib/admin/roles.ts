/**
 * Роли и права админ-панели.
 * Права проверяются на сервере в каждом API; интерфейс только скрывает недоступное.
 */

export const ADMIN_PERMISSIONS = [
  'staff.manage',
  'content.edit',
  'catalog.edit',
  'marketing.edit',
  'orders.view',
  'crm.view',
  'support.tickets',
  'support.forms',
  'bots.manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLES = [
  'super_admin',
  'admin',
  'manager',
  'consultant',
  'content',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Главный администратор',
  admin: 'Администратор',
  manager: 'Менеджер',
  consultant: 'Консультант',
  content: 'Контент / маркетинг',
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin:
    'Полный доступ, в том числе управление сотрудниками и ролями. Только эта роль может добавлять и менять учётные записи.',
  admin:
    'Полный доступ к сайту, каталогу, заказам и CRM без раздела «Команда».',
  manager:
    'Заказы, CRM, поддержка, заявки, боты — операционная работа без правок контента сайта.',
  consultant:
    'Тикеты поддержки и контактные заявки — работа с обращениями клиентов.',
  content:
    'Страницы сайта, каталог, блог, лояльность и акции — без доступа к заказам и CRM.',
};

/** Роль → набор прав (источник истины на сервере) */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: [
    'staff.manage',
    'content.edit',
    'catalog.edit',
    'marketing.edit',
    'orders.view',
    'crm.view',
    'support.tickets',
    'support.forms',
    'bots.manage',
  ],
  admin: [
    'content.edit',
    'catalog.edit',
    'marketing.edit',
    'orders.view',
    'crm.view',
    'support.tickets',
    'support.forms',
    'bots.manage',
  ],
  manager: ['orders.view', 'crm.view', 'support.tickets', 'support.forms', 'bots.manage'],
  consultant: ['support.tickets', 'support.forms'],
  content: ['content.edit', 'catalog.edit', 'marketing.edit'],
};

const PERMISSION_SET: Record<AdminRole, Set<AdminPermission>> = {
  super_admin: new Set(ROLE_PERMISSIONS.super_admin),
  admin: new Set(ROLE_PERMISSIONS.admin),
  manager: new Set(ROLE_PERMISSIONS.manager),
  consultant: new Set(ROLE_PERMISSIONS.consultant),
  content: new Set(ROLE_PERMISSIONS.content),
};

export function permissionsForRole(role: AdminRole): AdminPermission[] {
  return [...PERMISSION_SET[role]];
}

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return PERMISSION_SET[role].has(permission);
}

export function hasAnyPermission(
  role: AdminRole,
  permissions: readonly AdminPermission[]
): boolean {
  const set = PERMISSION_SET[role];
  return permissions.some((p) => set.has(p));
}

export function parseAdminRole(raw: unknown): AdminRole | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return ADMIN_ROLES.includes(v as AdminRole) ? (v as AdminRole) : null;
}
