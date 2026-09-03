export const WILDBERRIES_URL = 'https://www.wildberries.ru/seller/479435';
export const OZON_URL = 'https://www.ozon.ru/seller/city-legend/';
export const YANDEX_MARKET_URL =
  'https://market.yandex.ru/search?generalContext=t%3Dmerchant%3Bi%3D1%3Bmrch%3D42926159%3B&rs=eJwzUn_ByPiJUZGDUWDhIVYJBo179xYpaEx-dVteY-G50_Ia11vOAIlld-QBL6MQxQ%2C%2C&merchant-filter=42926159';

export const MARKETPLACE_SOCIAL_LINKS = [
  { name: 'Wildberries', url: WILDBERRIES_URL },
  { name: 'Ozon', url: OZON_URL },
  { name: 'Яндекс Маркет', url: YANDEX_MARKET_URL },
] as const;

export const HOW_TO_ORDER_TAB_YM = {
  title: 'Покупка на Яндекс Маркете',
  intro: 'Оформление и доставка проходят по правилам Яндекс Маркета.',
  steps: [
    'Перейдите в наш магазин на Яндекс Маркете.',
    'Выберите изделие и оформите заказ в приложении или на сайте.',
    'Отслеживайте статус доставки в личном кабинете покупателя.',
  ],
  link: YANDEX_MARKET_URL,
} as const;
