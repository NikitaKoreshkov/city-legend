import type { Metadata } from 'next';
import { buildNoindexMetadata, buildPageMetadata } from '@/lib/seo/buildMetadata';
import type { BuildPageMetadataInput } from '@/lib/seo/buildMetadata';

const HOME: BuildPageMetadataInput = {
  path: '/',
  titleAbsolute: true,
  title:
    'City Legend — бижутерия и аксессуары премиум-класса | Jewelry & Accessories',
  description:
    'City Legend — кураторский каталог украшений: серьги, браслеты, колье, кольца. Онлайн-магазин jewelry & accessories с доставкой по России. Buy earrings, bracelets, necklaces online.',
  keywords: [
    'магазин украшений',
    'бижутерия онлайн',
    'премиум аксессуары',
    'designer jewelry',
    'fine jewelry boutique',
  ],
};

const COLLECTION: BuildPageMetadataInput = {
  path: '/collection',
  title: 'Каталог украшений и аксессуаров',
  description:
    'Каталог City Legend: серьги, браслеты, колье, кольца и аксессуары. Фильтры по категориям, сравнение моделей, покупка онлайн. Jewelry catalog — shop earrings, bracelets, necklaces.',
  keywords: [
    'каталог украшений',
    'купить серьги',
    'купить браслет',
    'jewelry catalog',
    'shop accessories',
  ],
};

const COLLECTION_COMPARE: BuildPageMetadataInput = {
  path: '/collection/compare',
  title: 'Сравнение украшений',
  description:
    'Сравните до нескольких изделий City Legend: цена, материал, размер, фото. Compare jewelry pieces side by side before you buy.',
  keywords: ['сравнение украшений', 'compare jewelry', 'jewelry comparison'],
};

const ABOUT: BuildPageMetadataInput = {
  path: '/about',
  title: 'О бренде',
  description:
    'Философия City Legend: кураторский отбор украшений и аксессуаров, эстетика деталей, история бренда. About City Legend — jewelry & accessories house.',
  keywords: ['о бренде', 'about city legend', 'jewelry brand story'],
};

const CARE: BuildPageMetadataInput = {
  path: '/care',
  title: 'Уход за украшениями',
  description:
    'Как ухаживать за украшениями City Legend: хранение, чистка металла и камней, рекомендации мастеров. Jewelry care guide — cleaning & storage tips.',
  keywords: ['уход за украшениями', 'jewelry care', 'cleaning jewelry'],
};

const HOW_TO_ORDER: BuildPageMetadataInput = {
  path: '/how-to-order',
  title: 'Как оформить заказ',
  description:
    'Пошаговое оформление заказа на citylegend.art: выбор изделия, доставка СДЭК, оплата картой, личный кабинет. How to order jewelry online at City Legend.',
  keywords: ['как заказать', 'доставка украшений', 'how to order', 'jewelry delivery'],
};

const DOCUMENTS: BuildPageMetadataInput = {
  path: '/documents',
  title: 'Документы и сертификаты',
  description:
    'Документы City Legend: сертификаты, гарантии, реквизиты. Legal documents and certificates for jewelry purchases.',
  keywords: ['документы', 'сертификаты', 'documents', 'certificates'],
};

const PRIVACY: BuildPageMetadataInput = {
  path: '/privacy-policy',
  title: 'Политика конфиденциальности',
  description:
    'Политика обработки персональных данных City Legend (citylegend.art). Privacy policy — data protection for customers in Russia.',
  keywords: ['политика конфиденциальности', 'privacy policy', 'personal data'],
};

const TERMS: BuildPageMetadataInput = {
  path: '/terms-of-use',
  title: 'Пользовательское соглашение',
  description:
    'Условия использования сайта и сервисов City Legend. Terms of use — online jewelry store rules and customer rights.',
  keywords: ['пользовательское соглашение', 'terms of use', 'условия использования'],
};

const COOKIES: BuildPageMetadataInput = {
  path: '/cookies',
  title: 'Политика cookie',
  description:
    'Информация о файлах cookie на citylegend.art: аналитика, настройки, отказ. Cookie policy for City Legend website.',
  keywords: ['cookie', 'файлы cookie', 'cookie policy'],
};

const PROMO: BuildPageMetadataInput = {
  path: '/promo',
  title: 'Промокод и акции',
  description:
    'Активация промокода City Legend в корзине личного кабинета. Promo code, discounts and special offers on jewelry.',
  keywords: ['промокод', 'скидка', 'promo code', 'jewelry discount'],
};

const PAYMENT: BuildPageMetadataInput = {
  path: '/payment',
  title: 'Оплата заказа',
  description:
    'Безопасная оплата заказа City Legend: защищённое соединение, сертифицированный платёжный провайдер. Secure payment for your jewelry order.',
  noindex: true,
  titleAbsolute: true,
};

const PAYMENT_FLOW: BuildPageMetadataInput = {
  path: '/payment/flow',
  title: 'Оплата',
  description: 'Оформление оплаты заказа City Legend. Secure checkout.',
  noindex: true,
  titleAbsolute: true,
};

const RESET_PASSWORD: BuildPageMetadataInput = {
  path: '/reset-password',
  title: 'Сброс пароля',
  description: 'Восстановление доступа к личному кабинету City Legend.',
  noindex: true,
  titleAbsolute: true,
};

const STATIC_BY_PATH: Record<string, BuildPageMetadataInput> = {
  '/': HOME,
  '/collection': COLLECTION,
  '/collection/compare': COLLECTION_COMPARE,
  '/about': ABOUT,
  '/care': CARE,
  '/how-to-order': HOW_TO_ORDER,
  '/documents': DOCUMENTS,
  '/privacy-policy': PRIVACY,
  '/terms-of-use': TERMS,
  '/cookies': COOKIES,
  '/promo': PROMO,
  '/payment': PAYMENT,
  '/payment/flow': PAYMENT_FLOW,
  '/reset-password': RESET_PASSWORD,
};

export function metadataForPath(path: string): Metadata {
  const cfg = STATIC_BY_PATH[path];
  if (!cfg) {
    return buildPageMetadata({
      path,
      title: 'City Legend',
      description:
        'City Legend — jewelry and accessories. Бижутерия и аксессуары премиум-класса.',
    });
  }
  return buildPageMetadata(cfg);
}

export function homePageMetadata(): Metadata {
  return metadataForPath('/');
}
