/**
 * Дефолты логотипа и футера (без импорта БД — можно на клиенте).
 */

export const DEFAULT_LOGO_URL = '/logo.png';

export interface SiteBranding {
  logoUrl: string;
}

export const DEFAULT_BRANDING: SiteBranding = {
  logoUrl: DEFAULT_LOGO_URL,
};

export interface SiteFooterConfig {
  backgroundColor: string;
  newsletterTitle: string;
  newsletterDescription: string;
  newsletterPlaceholder: string;
  newsletterDisclaimer: string;
  contactColumnTitle: string;
  contactButtonLabel: string;
  socialColumnTitle: string;
  legalColumnTitle: string;
  socialLinks: { name: string; url: string }[];
  legalLinks: { label: string; href: string }[];
  copyrightText: string;
  /** Показывать блок ООО / ИНН / адрес из БД site_legal */
  showLegalRequisites: boolean;
}

const defaultTg = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'city_legend_officalbot'}`;

export const DEFAULT_SITE_FOOTER: SiteFooterConfig = {
  backgroundColor: '#0b2a24',
  newsletterTitle: 'Подпишитесь на нашу рассылку',
  newsletterDescription: 'Получайте рассылку и узнавайте о новинках и коллекциях.',
  newsletterPlaceholder: 'Ваш email адрес',
  newsletterDisclaimer:
    'Я подтверждаю, что мой email адрес будет обработан в соответствии с положениями Политики конфиденциальности.',
  contactColumnTitle: 'СВЯЖИТЕСЬ С НАМИ',
  contactButtonLabel: 'Контакты',
  socialColumnTitle: 'СОЦИАЛЬНЫЕ СЕТИ',
  legalColumnTitle: 'ПРАВОВАЯ ИНФОРМАЦИЯ',
  socialLinks: [
    { name: 'Telegram — бот', url: defaultTg },
    { name: 'WhatsApp', url: 'https://wa.me/79652316018' },
    { name: 'Wildberries', url: 'https://www.wildberries.ru/seller/479435' },
    { name: 'Ozon', url: 'https://www.ozon.ru/seller/city-legend/' },
  ],
  legalLinks: [
    { label: 'Политика конфиденциальности', href: '/privacy-policy' },
    { label: 'Условия использования', href: '/terms-of-use' },
    { label: 'Cookies', href: '/cookies' },
  ],
  copyrightText: `© ${new Date().getFullYear()}`,
  showLegalRequisites: true,
};

export function mergeBranding(
  raw: Partial<SiteBranding> | null | undefined
): SiteBranding {
  const logoUrl = (raw?.logoUrl && String(raw.logoUrl).trim()) || DEFAULT_BRANDING.logoUrl;
  return { logoUrl: logoUrl || DEFAULT_LOGO_URL };
}

export function mergeSiteFooter(
  raw: Partial<SiteFooterConfig> | null | undefined
): SiteFooterConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SITE_FOOTER };
  return {
    ...DEFAULT_SITE_FOOTER,
    ...raw,
    backgroundColor: raw.backgroundColor || DEFAULT_SITE_FOOTER.backgroundColor,
    socialLinks: Array.isArray(raw.socialLinks) ? raw.socialLinks : DEFAULT_SITE_FOOTER.socialLinks,
    legalLinks: Array.isArray(raw.legalLinks) ? raw.legalLinks : DEFAULT_SITE_FOOTER.legalLinks,
    showLegalRequisites:
      typeof raw.showLegalRequisites === 'boolean'
        ? raw.showLegalRequisites
        : DEFAULT_SITE_FOOTER.showLegalRequisites,
  };
}
