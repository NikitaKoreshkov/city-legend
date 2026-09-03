'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import Link from 'next/link';
import { useAdminContext } from '@/app/components/admin/AdminContext';
import { ADMIN_NAV_GROUPS, ADMIN_QUICK_TASKS, filterNavGroups } from '@/lib/admin/navCatalog';
import type { AdminPermission } from '@/lib/admin/roles';

const FAQ: { q: string; a: string; href?: string; hrefLabel?: string }[] = [
  {
    q: 'Где создать купон и скачать QR?',
    a: 'Раздел «Купоны и акции» → вкладка «Купоны» → кнопка QR у нужного кода.',
    href: '/admin/edit/promotions',
    hrefLabel: 'Открыть купоны',
  },
  {
    q: 'Как отправить рассылку в Telegram / Max?',
    a: '«Боты: рассылки и QR» → блок «Массовая рассылка» → текст → галочка купона при необходимости.',
    href: '/admin/bots',
    hrefLabel: 'Открыть боты',
  },
  {
    q: 'Как отправить купон одному человеку?',
    a: 'Вариант 1: Боты → таблица подписчиков → «Купон». Вариант 2: CRM → профиль клиента → блок «Боты и персональный купон».',
    href: '/admin/bots',
    hrefLabel: 'Боты',
  },
  {
    q: 'Где изменить «Резерв лота» и другие темы обращений?',
    a: '«Темы обращений» — там названия пунктов в выпадающем списке. Это НЕ «Тексты личного кабинета».',
    href: '/admin/concierge/topics',
    hrefLabel: 'Темы обращений',
  },
  {
    q: 'Как назначить менеджера на заказ?',
    a: 'CRM → вкладка «Заказы» → «Изменить» у заказа → поле «Исполнитель (админ)». Фильтр «Только мои задачи» — в шапке панели.',
    href: '/admin/crm',
    hrefLabel: 'Открыть CRM',
  },
  {
    q: 'Где ответить клиенту из поддержки?',
    a: '«Тикеты клиентов» — список обращений, ответ уходит в бот клиента если он писал оттуда.',
    href: '/admin/concierge',
    hrefLabel: 'Тикеты',
  },
];

function GuideContent() {
  const { user } = useAdminContext();
  const permSet = new Set(user?.permissions ?? []);
  const can = (p: AdminPermission | null) => !p || permSet.has(p);
  const groups = filterNavGroups(can).filter((g) => g.id !== 'overview');
  const quickTasks = ADMIN_QUICK_TASKS.filter((t) => can(t.permission));

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <Link href="/admin" className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-[#0b2a24]">
          ← Главная
        </Link>
        <h1
          className="text-2xl md:text-3xl text-[#0b2a24] mt-3 mb-2"
          style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}
        >
          Где что находится
        </h1>
        <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">
          Полная карта админ-панели. Каждый раздел — с пояснением, зачем он нужен. Слева в меню те же названия и подсказки.
        </p>
      </div>

      {/* FAQ */}
      <section className="bg-white border border-[#ebe8e0] p-6 md:p-8">
        <h2 className="text-sm uppercase tracking-[0.18em] text-gray-500 mb-5">Частые вопросы</h2>
        <div className="space-y-5">
          {FAQ.map((item) => (
            <div key={item.q} className="border-b border-gray-100 pb-5 last:border-0 last:pb-0">
              <p className="text-sm font-medium text-[#0b2a24] mb-1">{item.q}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
              {item.href && can(null) && (
                <Link href={item.href} className="inline-block mt-2 text-xs text-[#0b2a24] underline underline-offset-2">
                  {item.hrefLabel ?? 'Перейти'} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Quick tasks */}
      <section>
        <h2 className="text-sm uppercase tracking-[0.18em] text-gray-500 mb-4">Быстрые переходы</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {quickTasks.map((t) => (
            <Link
              key={t.title}
              href={t.href}
              className="flex items-center gap-2 bg-white border border-[#ebe8e0] px-4 py-3 hover:border-[#0b2a24] text-sm transition-colors"
            >
              <span>{t.emoji}</span>
              <span>{t.title}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Full catalog */}
      <section>
        <h2 className="text-sm uppercase tracking-[0.18em] text-gray-500 mb-4">Все разделы</h2>
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.id}>
              <h3 className="text-xs uppercase tracking-widest text-[#0b2a24]/60 mb-3 font-medium">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block bg-white border border-[#ebe8e0] p-4 hover:border-[#0b2a24]/40 transition-colors group"
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-[#0b2a24] group-hover:underline">{item.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.hint}</p>
                        <p className="text-xs text-gray-400 mt-2 leading-relaxed">{item.description}</p>
                        <p className="text-[11px] text-gray-400 mt-2">
                          <span className="text-gray-500">Здесь можно:</span>{' '}
                          {item.tasks.join(' · ')}
                        </p>
                      </div>
                      <span className="text-gray-300 group-hover:text-[#0b2a24] shrink-0">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Roles note */}
      <section className="border-t border-[#ebe8e0] pt-8 text-sm text-gray-600 space-y-2">
        <h2 className="text-sm uppercase tracking-[0.18em] text-gray-500 mb-3">Роли и доступ</h2>
        <p>Менеджер видит заказы, CRM, поддержку, боты. Контент-редактор — страницы сайта и купоны. Консультант — только тикеты и заявки.</p>
        <p>Сотрудников добавляет только главный администратор: «Сотрудники и роли».</p>
      </section>
    </div>
  );
}

export default function AdminGuidePage() {
  return (
    <AdminProtected permission={null}>
      <GuideContent />
    </AdminProtected>
  );
}
