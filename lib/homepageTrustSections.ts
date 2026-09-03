export const HOMEPAGE_LOGO_SLOTS_MAX = 15;

export type TrustLogoEntry = {
  name: string;
  image: string;
  /** Опциональная ссылка при клике на логотип */
  url?: string;
};

export type TrustLogosSection = {
  enabled: boolean;
  eyebrow: string;
  title: string;
  subtitle?: string;
  logos: TrustLogoEntry[];
  /** Только для блока «Клиенты»: кнопка «Смотреть всех» (опционально) */
  showAllLink?: boolean;
  showAllLabel?: string;
  showAllHref?: string;
};

export const DEFAULT_CLIENTS_SECTION: TrustLogosSection = {
  enabled: true,
  eyebrow: 'КЛИЕНТЫ',
  title: 'Нам доверяют',
  subtitle: '',
  logos: [],
  showAllLink: false,
  showAllLabel: 'Смотреть всех клиентов',
  showAllHref: '',
};

export const DEFAULT_PARTNERS_SECTION: TrustLogosSection = {
  enabled: true,
  eyebrow: 'ПАРТНЁРЫ',
  title: 'Наши партнёры',
  subtitle: 'Поставщики материалов, которые мы используем в производстве',
  logos: [],
};

function normalizeLogos(raw: unknown): TrustLogoEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, HOMEPAGE_LOGO_SLOTS_MAX)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? '').trim();
      const image = String(row.image ?? '').trim();
      const url = String(row.url ?? '').trim();
      if (!name && !image) return null;
      return { name: name || 'Логотип', image, ...(url ? { url } : {}) };
    })
    .filter((x): x is TrustLogoEntry => x !== null);
}

function mergeTrustSection(
  raw: unknown,
  defaults: TrustLogosSection
): TrustLogosSection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...defaults, logos: [...defaults.logos] };
  }
  const row = raw as Record<string, unknown>;
  return {
    ...defaults,
    enabled: typeof row.enabled === 'boolean' ? row.enabled : defaults.enabled,
    eyebrow: String(row.eyebrow ?? defaults.eyebrow).trim() || defaults.eyebrow,
    title: String(row.title ?? defaults.title).trim() || defaults.title,
    subtitle: String(row.subtitle ?? defaults.subtitle ?? '').trim(),
    logos: normalizeLogos(row.logos),
    showAllLink:
      typeof row.showAllLink === 'boolean' ? row.showAllLink : defaults.showAllLink,
    showAllLabel: String(row.showAllLabel ?? defaults.showAllLabel ?? '').trim(),
    showAllHref: String(row.showAllHref ?? defaults.showAllHref ?? '').trim(),
  };
}

export function mergeClientsSection(ic: Record<string, unknown>): TrustLogosSection {
  return mergeTrustSection(ic.clients, DEFAULT_CLIENTS_SECTION);
}

export function mergePartnersSection(ic: Record<string, unknown>): TrustLogosSection {
  return mergeTrustSection(ic.partners, DEFAULT_PARTNERS_SECTION);
}
