'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type CmsItem = { key: string; value: string; updated_at: string };

// Human-readable group labels and key descriptions
const KEY_META: Record<string, { label: string; hint?: string; multiline?: boolean }> = {
  header_eyebrow: { label: 'Надпись над именем (личный кабинет)' },
  header_guest_name: { label: 'Имя гостя по умолчанию' },
  header_logout: { label: 'Кнопка выхода' },
  loading_cabinet: { label: 'Сообщение загрузки кабинета' },
  error_retry: { label: 'Кнопка повтора при ошибке' },
  nav_news: { label: 'Навигация: Блог' },
  nav_promo: { label: 'Навигация: Акции' },
  nav_orders: { label: 'Навигация: Заказы' },
  nav_cart: { label: 'Навигация: Корзина' },
  nav_reviews: { label: 'Навигация: Отзывы' },
  nav_favorites: { label: 'Навигация: Избранное' },
  nav_concierge: { label: 'Навигация: Поддержка' },
  nav_settings: { label: 'Навигация: Настройки' },
  section_news_eyebrow: { label: 'Блог — надпись над заголовком' },
  section_news_title: { label: 'Блог — заголовок раздела' },
  section_promo_eyebrow: { label: 'Акции — надпись над заголовком' },
  section_promo_title: { label: 'Акции — заголовок раздела' },
  section_orders_eyebrow: { label: 'Заказы — надпись над заголовком' },
  section_orders_title: { label: 'Заказы — заголовок раздела' },
  section_cart_eyebrow: { label: 'Корзина — надпись над заголовком' },
  section_cart_title: { label: 'Корзина — заголовок раздела' },
  section_reviews_eyebrow: { label: 'Отзывы — надпись над заголовком' },
  section_reviews_title: { label: 'Отзывы — заголовок раздела' },
  section_favorites_eyebrow: { label: 'Избранное — надпись над заголовком' },
  section_favorites_title: { label: 'Избранное — заголовок раздела' },
  favorites_body: { label: 'Избранное — описание функции', multiline: true },
  favorites_empty: { label: 'Избранное — пустое состояние' },
  favorites_remove: { label: 'Избранное — кнопка убрать' },
  favorites_add_to_cart: { label: 'Избранное — кнопка «В корзину»' },
  favorites_qty_label: { label: 'Избранное — метка количества' },
  favorites_adding: { label: 'Избранное — статус «Добавляем»' },
  favorites_added_ok: { label: 'Избранное — успешное добавление' },
  favorites_added_detail_tpl: { label: 'Избранное — шаблон деталей (+{added} шт.)', hint: 'Переменные: {added}, {total}' },
  section_concierge_eyebrow: { label: 'Поддержка — надпись над заголовком' },
  section_concierge_title: { label: 'Поддержка — заголовок раздела' },
  concierge_body: { label: 'Поддержка — описание', multiline: true },
  concierge_cta: { label: 'Поддержка — кнопка связи' },
  section_settings_eyebrow: { label: 'Настройки — надпись над заголовком' },
  section_settings_title: { label: 'Настройки — заголовок раздела' },
  settings_name_label: { label: 'Настройки — поле «Имя»' },
  settings_email_label: { label: 'Настройки — поле «Email»' },
  settings_birth_label: { label: 'Настройки — поле «День рождения»' },
  settings_save: { label: 'Настройки — кнопка сохранения' },
  settings_bots_label: { label: 'Настройки — подпись блока ботов' },
  loyalty_headline: { label: 'Лояльность — заголовок блока' },
  loyalty_spent_hint_no_orders: { label: 'Лояльность — подсказка без заказов', multiline: true },
  loyalty_spent_hint_has_orders: { label: 'Лояльность — подсказка с заказами', multiline: true },
  loyalty_row_left_tpl: { label: 'Лояльность — левая ячейка таблицы', hint: 'Переменная: {label}' },
  loyalty_row_right_tpl: { label: 'Лояльность — правая ячейка таблицы', hint: 'Переменная: {percent}' },
  empty_orders: { label: 'Пустые заказы — сообщение' },
  empty_cart: { label: 'Пустая корзина — сообщение' },
  empty_reviews: { label: 'Пустые отзывы — сообщение', multiline: true },
  empty_news: { label: 'Пустой блог — сообщение' },
  empty_promo: { label: 'Нет акций — сообщение' },
  cart_total_label: { label: 'Корзина — метка итого' },
  cart_total_partial_note: { label: 'Корзина — примечание о частичной цене', multiline: true },
  cart_total_unavailable: { label: 'Корзина — недоступная сумма' },
  cart_remove: { label: 'Корзина — кнопка убрать' },
  cart_checkout: { label: 'Корзина — кнопка оформить' },
  cart_price_qty_tpl: { label: 'Корзина — шаблон цена × кол-во', hint: 'Переменные: {price}, {qty}' },
  link_catalog: { label: 'Ссылка на каталог' },
  promo_fallback_discount: { label: 'Акции — запасной текст скидки' },
  promo_code_label_tpl: { label: 'Акции — шаблон кода', hint: 'Переменная: {code}' },
  promo_copied: { label: 'Акции — «Скопировано»' },
  promo_no_code: { label: 'Акции — «Без кода»' },
  promo_valid_until_tpl: { label: 'Акции — шаблон срока', hint: 'Переменная: {date}' },
  reviews_likes: { label: 'Отзывы — метка лайков' },
  reviews_dislikes: { label: 'Отзывы — метка дизлайков' },
  reviews_reply_heading: { label: 'Отзывы — заголовок ответа бутика' },
  orders_ref_prefix: { label: 'Заказы — префикс номера' },
};

const GROUPS: { title: string; keys: string[] }[] = [
  {
    title: 'Заголовок и общее',
    keys: ['header_eyebrow', 'header_guest_name', 'header_logout', 'loading_cabinet', 'error_retry', 'link_catalog'],
  },
  {
    title: 'Навигация',
    keys: ['nav_news', 'nav_promo', 'nav_orders', 'nav_cart', 'nav_reviews', 'nav_favorites', 'nav_concierge', 'nav_settings'],
  },
  {
    title: 'Блог',
    keys: ['section_news_eyebrow', 'section_news_title', 'empty_news'],
  },
  {
    title: 'Акции',
    keys: ['section_promo_eyebrow', 'section_promo_title', 'empty_promo', 'promo_fallback_discount', 'promo_code_label_tpl', 'promo_copied', 'promo_no_code', 'promo_valid_until_tpl'],
  },
  {
    title: 'Заказы',
    keys: ['section_orders_eyebrow', 'section_orders_title', 'empty_orders', 'orders_ref_prefix'],
  },
  {
    title: 'Корзина',
    keys: ['section_cart_eyebrow', 'section_cart_title', 'empty_cart', 'cart_total_label', 'cart_total_partial_note', 'cart_total_unavailable', 'cart_remove', 'cart_checkout', 'cart_price_qty_tpl'],
  },
  {
    title: 'Избранное',
    keys: ['section_favorites_eyebrow', 'section_favorites_title', 'favorites_body', 'favorites_empty', 'favorites_remove', 'favorites_add_to_cart', 'favorites_qty_label', 'favorites_adding', 'favorites_added_ok', 'favorites_added_detail_tpl'],
  },
  {
    title: 'Отзывы',
    keys: ['section_reviews_eyebrow', 'section_reviews_title', 'empty_reviews', 'reviews_likes', 'reviews_dislikes', 'reviews_reply_heading'],
  },
  {
    title: 'Поддержка',
    keys: ['section_concierge_eyebrow', 'section_concierge_title', 'concierge_body', 'concierge_cta'],
  },
  {
    title: 'Настройки',
    keys: [
      'section_settings_eyebrow',
      'section_settings_title',
      'settings_name_label',
      'settings_email_label',
      'settings_birth_label',
      'settings_save',
      'settings_bots_label',
    ],
  },
  {
    title: 'Программа лояльности',
    keys: ['loyalty_headline', 'loyalty_spent_hint_no_orders', 'loyalty_spent_hint_has_orders', 'loyalty_row_left_tpl', 'loyalty_row_right_tpl'],
  },
];

function CmsCopyPage() {
  const [items, setItems] = useState<CmsItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/cms-copy');
    if (!r.ok) return;
    const d = await r.json();
    const map: Record<string, string> = {};
    for (const item of d.items as CmsItem[]) map[item.key] = item.value;
    setItems(d.items ?? []);
    setDraft(map);
    setDirty(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key: string, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setDirty(prev => new Set([...prev, key]));
  };

  const saveAll = async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      dirty.forEach(k => { updates[k] = draft[k] ?? ''; });
      const r = await fetch('/api/admin/cms-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!r.ok) throw new Error();
      showToast(`Сохранено ${dirty.size} ${dirty.size === 1 ? 'поле' : 'полей'}`);
      await load();
    } catch {
      showToast('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  // Keys not in any group
  const groupedKeys = new Set(GROUPS.flatMap(g => g.keys));
  const ungroupedItems = items.filter(i => !groupedKeys.has(i.key));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
        <div className="w-7 h-7 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-[#0b2a24] text-white text-sm px-5 py-3 shadow-xl"
          style={{ fontFamily: 'var(--font-open-sans)' }}>
          {toast}
        </div>
      )}

      <header className="border-b border-[#ebe8e0] bg-white sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-4 flex items-center gap-5">
          <Link href="/admin"
            className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-[#0b2a24] transition-colors"
            style={{ fontFamily: 'var(--font-open-sans)' }}>
            ← Панель
          </Link>
          <div>
            <h1 className="text-xl text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}>
              Текст кабинета
            </h1>
            <p className="text-[10px] text-gray-400 mt-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Все надписи в личном кабинете пользователя
            </p>
          </div>
          {dirty.size > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-amber-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {dirty.size} несохранённых
              </span>
              <button
                onClick={saveAll}
                disabled={saving}
                className="bg-[#0b2a24] text-white text-[10px] uppercase tracking-widest px-5 py-2.5 hover:bg-[#0b2a24]/90 transition-colors disabled:opacity-50"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {saving ? 'Сохранение...' : 'Сохранить всё'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-8">
        {GROUPS.map(group => {
          const groupItems = group.keys
            .map(k => ({ key: k, value: draft[k] ?? '', meta: KEY_META[k] }))
            .filter(i => i.value !== undefined || draft[i.key] !== undefined);
          if (groupItems.length === 0) return null;
          return (
            <div key={group.title} className="bg-white border border-[#ebe8e0]">
              <div className="px-5 py-3.5 border-b border-[#ebe8e0]">
                <h2 className="text-[10px] uppercase tracking-widest text-gray-500"
                  style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {group.title}
                </h2>
                {group.title === 'Поддержка' && (
                  <p className="text-xs text-gray-500 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Пункты выпадающего меню «Тема обращения» (Резерв лота и др.) редактируются в{' '}
                    <Link href="/admin/concierge/topics" className="text-[#0b2a24] underline">
                      Поддержка → Типы обращений
                    </Link>
                    .
                  </p>
                )}
              </div>
              <div className="divide-y divide-[#ebe8e0]">
                {group.keys.map(key => {
                  if (!(key in draft)) return null;
                  const meta = KEY_META[key];
                  const isDirty = dirty.has(key);
                  return (
                    <div key={key} className={`px-5 py-4 transition-colors ${isDirty ? 'bg-amber-50/40' : ''}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <label className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            {meta?.label ?? key}
                          </label>
                          {meta?.hint && (
                            <p className="text-[10px] text-gray-400 mt-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                              {meta.hint}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isDirty && (
                            <span className="text-[9px] text-amber-600 uppercase tracking-widest"
                              style={{ fontFamily: 'var(--font-open-sans)' }}>
                              изменено
                            </span>
                          )}
                          <code className="text-[9px] text-gray-300 bg-gray-50 px-1.5 py-0.5"
                            style={{ fontFamily: 'monospace' }}>
                            {key}
                          </code>
                        </div>
                      </div>
                      {meta?.multiline ? (
                        <textarea
                          value={draft[key] ?? ''}
                          onChange={e => handleChange(key, e.target.value)}
                          rows={3}
                          className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24] resize-none"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={draft[key] ?? ''}
                          onChange={e => handleChange(key, e.target.value)}
                          className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24]"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Ungrouped keys */}
        {ungroupedItems.length > 0 && (
          <div className="bg-white border border-[#ebe8e0]">
            <div className="px-5 py-3.5 border-b border-[#ebe8e0]">
              <h2 className="text-[10px] uppercase tracking-widest text-gray-500"
                style={{ fontFamily: 'var(--font-open-sans)' }}>
                Прочее
              </h2>
            </div>
            <div className="divide-y divide-[#ebe8e0]">
              {ungroupedItems.map(item => {
                const isDirty = dirty.has(item.key);
                return (
                  <div key={item.key} className={`px-5 py-4 ${isDirty ? 'bg-amber-50/40' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        {KEY_META[item.key]?.label ?? item.key}
                      </label>
                      <code className="text-[9px] text-gray-300 bg-gray-50 px-1.5 py-0.5"
                        style={{ fontFamily: 'monospace' }}>
                        {item.key}
                      </code>
                    </div>
                    <input
                      type="text"
                      value={draft[item.key] ?? ''}
                      onChange={e => handleChange(item.key, e.target.value)}
                      className="w-full border border-[#ebe8e0] px-3 py-2.5 text-sm outline-none focus:border-[#0b2a24]"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {dirty.size > 0 && (
          <div className="sticky bottom-6 flex justify-end">
            <button
              onClick={saveAll}
              disabled={saving}
              className="bg-[#0b2a24] text-white text-[10px] uppercase tracking-widest px-8 py-3.5 shadow-lg hover:bg-[#0b2a24]/90 transition-colors disabled:opacity-50"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {saving ? 'Сохранение...' : `Сохранить ${dirty.size} изменения`}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CmsCopyPageGuarded() {
  return (
    <AdminProtected permission="content.edit">
      <CmsCopyPage />
    </AdminProtected>
  );
}
