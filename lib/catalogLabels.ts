/** Публичные подписи каталога — редактируются в админке главной (секция catalog_labels). */

export type CatalogLabels = {
  /** Заголовок блока коллекций на главной */
  categoriesTitle: string;
  /** Кнопка / вкладка на карточке товара */
  certificateLabel: string;
  /** Заголовок модального окна сертификата */
  certificateModalTitle: string;
  /** Текст, если файлов нет */
  certificateMissing: string;
  /** Заголовок блока в админке товара */
  certificateAdminSection: string;
  /** Плейсхолдер поиска в шапке */
  searchPlaceholder: string;
  /** Ссылка «весь каталог» в поиске */
  allArticlesLink: string;
  /** 404 карточки товара — заголовок */
  notFoundTitle: string;
  /** 404 карточки товара — текст */
  notFoundBody: string;
};

export const DEFAULT_CATALOG_LABELS: CatalogLabels = {
  categoriesTitle: 'Коллекции',
  certificateLabel: 'Сертификат подлинности',
  certificateModalTitle: 'Сертификат подлинности',
  certificateMissing: 'Сертификат подлинности отсутствует',
  certificateAdminSection: 'Сертификаты подлинности',
  searchPlaceholder: 'Поиск по названию...',
  allArticlesLink: 'Весь каталог',
  notFoundTitle: 'Такой позиции нет в каталоге',
  notFoundBody:
    'Возможно, ссылка устарела, товар снят с публикации или не существует. Загляните в каталог или на главную.',
};

export function mergeCatalogLabels(ic: Record<string, unknown>): CatalogLabels {
  const raw = ic.catalog_labels;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_CATALOG_LABELS, ...(raw as Partial<CatalogLabels>) };
  }
  return { ...DEFAULT_CATALOG_LABELS };
}
