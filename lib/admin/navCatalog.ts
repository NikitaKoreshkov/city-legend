import type { AdminPermission } from '@/lib/admin/roles';

export type AdminNavItem = {
  href: string;
  label: string;
  /** Короткая подпись в боковом меню (1 строка) */
  hint: string;
  /** Описание на главной и в справочнике */
  description: string;
  permission: AdminPermission | null;
  /** Для поиска на главной */
  keywords: string[];
  /** Типовые задачи — «зачем сюда идти» */
  tasks: string[];
};

export type AdminNavGroup = {
  id: string;
  title: string;
  items: AdminNavItem[];
};

/** Единый источник: меню, главная, хлебные крошки, инструкция */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'overview',
    title: 'Старт',
    items: [
      {
        href: '/admin',
        label: 'Главная',
        hint: 'Карта всех разделов',
        description: 'Рабочий стол: быстрые ссылки и поиск по админке',
        permission: null,
        keywords: ['главная', 'домой', 'карта', 'меню'],
        tasks: ['Найти нужный раздел', 'Поиск по админке'],
      },
      {
        href: '/admin/guide',
        label: 'Инструкция',
        hint: 'Как пользоваться панелью',
        description: 'Правила работы, роли, где что лежит',
        permission: null,
        keywords: ['инструкция', 'справка', 'help', 'где что'],
        tasks: ['Прочитать карту разделов', 'Узнать про роли'],
      },
    ],
  },
  {
    id: 'team',
    title: 'Команда',
    items: [
      {
        href: '/admin/staff',
        label: 'Сотрудники и роли',
        hint: 'Кто имеет доступ к чему',
        description: 'Учётные записи сотрудников, роли, права доступа',
        permission: 'staff.manage',
        keywords: ['сотрудники', 'роли', 'доступ', 'логин', 'пароль'],
        tasks: ['Добавить менеджера', 'Изменить роль', 'Отключить доступ'],
      },
    ],
  },
  {
    id: 'content',
    title: 'Страницы сайта',
    items: [
      {
        href: '/admin/edit/homepage',
        label: 'Главная страница',
        hint: 'Видео, баннер, тексты героя',
        description: 'Первый экран сайта: видео, заголовки, кнопки',
        permission: 'content.edit',
        keywords: ['главная', 'hero', 'видео', 'баннер'],
        tasks: ['Сменить видео на главной', 'Изменить тексты'],
      },
      {
        href: '/admin/edit/about',
        label: 'О нас',
        hint: 'История бренда, команда',
        description: 'Страница «О нас»',
        permission: 'content.edit',
        keywords: ['о нас', 'about', 'история'],
        tasks: ['Обновить текст о бренде'],
      },
      {
        href: '/admin/edit/care',
        label: 'Уход и хранение',
        hint: 'Советы по уходу за украшениями',
        description: 'Страница ухода за изделиями',
        permission: 'content.edit',
        keywords: ['уход', 'care', 'хранение'],
        tasks: ['Изменить советы по уходу'],
      },
      {
        href: '/admin/edit/how-to-order',
        label: 'Как заказать',
        hint: 'Шаги оформления заказа',
        description: 'Страница «Как оформить заказ»',
        permission: 'content.edit',
        keywords: ['заказ', 'оформление', 'доставка'],
        tasks: ['Обновить шаги заказа'],
      },
      {
        href: '/admin/edit/site-legal',
        label: 'Реквизиты в подвале',
        hint: 'ИНН, ОГРН, юр. адрес',
        description: 'Юридические реквизиты в футере сайта',
        permission: 'content.edit',
        keywords: ['реквизиты', 'инн', 'огрн', 'юридический', 'подвал'],
        tasks: ['Изменить реквизиты компании'],
      },
    ],
  },
  {
    id: 'catalog',
    title: 'Каталог',
    items: [
      {
        href: '/admin/edit/catalog',
        label: 'Товары',
        hint: 'Фото, цены, остатки',
        description: 'Каталог изделий: добавление, цены, фото, варианты',
        permission: 'catalog.edit',
        keywords: ['товары', 'лоты', 'каталог', 'цена', 'фото'],
        tasks: ['Добавить товар', 'Изменить цену', 'Загрузить фото'],
      },
      {
        href: '/admin/edit/filters',
        label: 'Фильтры каталога',
        hint: 'Камень, металл, категории',
        description: 'Фильтры и параметры поиска в каталоге',
        permission: 'catalog.edit',
        keywords: ['фильтры', 'категории', 'подбор'],
        tasks: ['Настроить фильтры', 'Добавить категорию'],
      },
    ],
  },
  {
    id: 'marketing',
    title: 'Скидки и кабинет',
    items: [
      {
        href: '/admin/edit/promotions',
        label: 'Купоны и акции',
        hint: 'Создать код, скачать QR',
        description: 'Промокоды для сайта, акции на витрине, QR-код купона',
        permission: 'marketing.edit',
        keywords: ['купон', 'промокод', 'скидка', 'qr', 'акция', 'promo'],
        tasks: [
          'Создать купон для сайта',
          'Скачать QR-код купона',
          'Скопировать ссылку promo?code=',
        ],
      },
      {
        href: '/admin/edit/loyalty',
        label: 'Программа лояльности',
        hint: 'Уровни и % скидки',
        description: 'Уровни лояльности в личном кабинете',
        permission: 'marketing.edit',
        keywords: ['лояльность', 'уровни', 'vip'],
        tasks: ['Изменить пороги лояльности'],
      },
      {
        href: '/admin/edit/blog',
        label: 'Блог / новости',
        hint: 'Статьи на сайте',
        description: 'Публикации блога бутика',
        permission: 'marketing.edit',
        keywords: ['блог', 'новости', 'статьи'],
        tasks: ['Опубликовать новость'],
      },
      {
        href: '/admin/edit/cms-copy',
        label: 'Тексты личного кабинета',
        hint: 'Подписи кнопок и экранов',
        description: 'Надписи интерфейса кабинета (не типы обращений!)',
        permission: 'content.edit',
        keywords: ['тексты', 'кабинет', 'cms', 'подписи'],
        tasks: ['Изменить тексты в кабинете клиента'],
      },
    ],
  },
  {
    id: 'sales',
    title: 'Заказы и клиенты',
    items: [
      {
        href: '/admin/orders',
        label: 'Список заказов',
        hint: 'Все заказы, статусы',
        description: 'Таблица заказов со статусами и доставкой',
        permission: 'orders.view',
        keywords: ['заказы', 'orders', 'статус', 'доставка'],
        tasks: ['Посмотреть новый заказ', 'Проверить статус'],
      },
      {
        href: '/admin/crm',
        label: 'CRM',
        hint: 'Клиенты, графики, правка заказа',
        description: 'Аналитика, профиль клиента, редактирование заказа, назначение менеджера',
        permission: 'crm.view',
        keywords: ['crm', 'клиент', 'аналитика', 'выручка', 'менеджер', 'исполнитель'],
        tasks: [
          'Открыть карточку клиента',
          'Назначить менеджера на заказ',
          'Отправить купон клиенту в бот',
          'Смотреть выручку',
        ],
      },
      {
        href: '/admin/reviews',
        label: 'Отзывы',
        hint: 'Модерация отзывов',
        description: 'Отзывы на сайте; негатив → тикет поддержки',
        permission: 'orders.view',
        keywords: ['отзывы', 'рейтинг', 'модерация'],
        tasks: ['Скрыть отзыв', 'Обработать негатив'],
      },
    ],
  },
  {
    id: 'support',
    title: 'Поддержка',
    items: [
      {
        href: '/admin/concierge',
        label: 'Тикеты клиентов',
        hint: 'Чат, ответы, исполнитель',
        description: 'Обращения из личного кабинета и ботов',
        permission: 'support.tickets',
        keywords: ['тикет', 'поддержка', 'чат', 'sla'],
        tasks: ['Ответить клиенту', 'Назначить исполнителя', 'Закрыть тикет'],
      },
      {
        href: '/admin/concierge/topics',
        label: 'Темы обращений',
        hint: '«Резерв лота», «Подбор»…',
        description: 'Названия пунктов в форме обращения (не тексты экрана!)',
        permission: 'support.tickets',
        keywords: ['темы', 'типы', 'резерв лота', 'подбор', 'topic'],
        tasks: ['Переименовать «Резерв лота»', 'Изменить SLA темы'],
      },
      {
        href: '/admin/contact-requests',
        label: 'Заявки с сайта',
        hint: 'Форма «Связаться с нами»',
        description: 'Заявки с контактной формы на сайте',
        permission: 'support.forms',
        keywords: ['заявки', 'контакт', 'форма', 'обратная связь'],
        tasks: ['Обработать заявку', 'Назначить менеджера'],
      },
    ],
  },
  {
    id: 'bots',
    title: 'Telegram и Max',
    items: [
      {
        href: '/admin/bots',
        label: 'Боты: рассылки и QR',
        hint: 'Подписчики, купон одному, массовая рассылка',
        description: 'Подписчики Telegram/Max, персональные купоны, массовые рассылки с QR',
        permission: 'bots.manage',
        keywords: [
          'бот', 'telegram', 'max', 'рассылка', 'qr', 'подписчик',
          'купон', 'promo', 'отправить',
        ],
        tasks: [
          'Отправить рассылку всем',
          'Отправить купон одному подписчику',
          'Заблокировать подписчика',
          'Настроить % скидки в рассылке',
        ],
      },
    ],
  },
];

/** Быстрые задачи на главной — «Хочу сделать…» */
export const ADMIN_QUICK_TASKS: {
  title: string;
  href: string;
  permission: AdminPermission | null;
  emoji: string;
}[] = [
  { title: 'Создать купон и QR', href: '/admin/edit/promotions', permission: 'marketing.edit', emoji: '🎫' },
  { title: 'Рассылка в Telegram / Max', href: '/admin/bots', permission: 'bots.manage', emoji: '📣' },
  { title: 'Купон одному клиенту', href: '/admin/bots', permission: 'bots.manage', emoji: '🎁' },
  { title: 'Купон из CRM клиенту', href: '/admin/crm', permission: 'crm.view', emoji: '👤' },
  { title: 'Назначить менеджера на заказ', href: '/admin/crm', permission: 'crm.view', emoji: '📋' },
  { title: 'Ответить в поддержке', href: '/admin/concierge', permission: 'support.tickets', emoji: '💬' },
  { title: 'Изменить «Резерв лота» и темы', href: '/admin/concierge/topics', permission: 'support.tickets', emoji: '🏷️' },
  { title: 'Добавить / изменить товар', href: '/admin/edit/catalog', permission: 'catalog.edit', emoji: '💎' },
  { title: 'Новый заказ — проверить', href: '/admin/orders', permission: 'orders.view', emoji: '📦' },
  { title: 'Главная страница сайта', href: '/admin/edit/homepage', permission: 'content.edit', emoji: '🏠' },
];

export function allNavItems(): AdminNavItem[] {
  return ADMIN_NAV_GROUPS.flatMap((g) => g.items);
}

export function findNavItem(pathname: string): AdminNavItem | null {
  const path = pathname.replace(/\/$/, '') || '/admin';
  const items = allNavItems();
  const exact = items.find((i) => i.href.replace(/\/$/, '') === path);
  if (exact) return exact;
  const sorted = [...items].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((i) => i.href !== '/admin' && path.startsWith(i.href)) ?? null;
}

export function findNavGroup(pathname: string): AdminNavGroup | null {
  const item = findNavItem(pathname);
  if (!item) return null;
  return ADMIN_NAV_GROUPS.find((g) => g.items.some((i) => i.href === item.href)) ?? null;
}

export function searchNavItems(query: string, can: (p: AdminPermission | null) => boolean): AdminNavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return allNavItems().filter((item) => {
    if (!can(item.permission)) return false;
    const hay = [
      item.label,
      item.hint,
      item.description,
      ...item.keywords,
      ...item.tasks,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q) || q.split(/\s+/).every((w) => hay.includes(w));
  });
}

export function filterNavGroups(can: (p: AdminPermission | null) => boolean): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => can(i.permission)),
  })).filter((g) => g.items.length > 0);
}
