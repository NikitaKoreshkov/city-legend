'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HOW_TO_ORDER_TAB_YM } from '@/lib/marketplaceLinks';

interface HeroData {
  eyebrow: string;
  title: string;
  description: string;
  options_eyebrow: string;
  options_title: string;
}
interface TabData { title: string; intro?: string; steps: string[]; link?: string }
interface InfoCard { title: string; kicker: string; items: string[] }
interface InfoCardsData { cards: InfoCard[] }
interface NoteData { eyebrow: string; text: string }

interface HowToOrderContent {
  hero: HeroData;
  tab_site: TabData;
  tab_wb: TabData;
  tab_ozon: TabData;
  tab_ym: TabData;
  tab_whatsapp: TabData;
  info_cards: InfoCardsData;
  note: NoteData;
}

type SectionKey = keyof HowToOrderContent;

const DEFAULTS: HowToOrderContent = {
  hero: { eyebrow: 'Покупка и доставка', title: 'Оформление заказа', description: '', options_eyebrow: 'Выберите удобный способ', options_title: '5 вариантов покупки' },
  tab_site: { title: 'Покупка на сайте', steps: ['', '', '', ''] },
  tab_wb: { title: 'Покупка на Wildberries', intro: '', steps: ['', '', ''], link: '' },
  tab_ozon: { title: 'Покупка на Ozon', intro: '', steps: ['', '', ''], link: '' },
  tab_ym: { ...HOW_TO_ORDER_TAB_YM, steps: [...HOW_TO_ORDER_TAB_YM.steps] },
  tab_whatsapp: { title: 'Заказ через WhatsApp', intro: '', steps: ['', '', ''], link: '' },
  info_cards: { cards: [
    { title: 'Оплата', kicker: 'Коротко о способах', items: [''] },
    { title: 'Доставка', kicker: 'Сроки и отслеживание', items: [''] },
    { title: 'Возврат и обмен', kicker: 'Если что-то не подошло', items: [''] },
  ]},
  note: { eyebrow: 'Важно', text: '' },
};

function EditHowToOrder() {
  const [content, setContent] = useState<HowToOrderContent>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [openSection, setOpenSection] = useState<SectionKey | null>('hero');

  useEffect(() => {
    fetch('/api/admin/page-content?page=how-to-order')
      .then(r => r.json())
      .then(d => {
        if (d.content) setContent(prev => ({ ...prev, ...d.content }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const saveSection = async (section: SectionKey) => {
    setSaving(section);
    const res = await fetch('/api/admin/page-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'how-to-order', section, data: content[section] }),
    });
    if (res.ok) showMsg('Сохранено');
    else showMsg('Ошибка сохранения');
    setSaving(null);
  };

  const updateHero = (patch: Partial<HeroData>) => setContent(p => ({ ...p, hero: { ...p.hero, ...patch } }));
  const updateNote = (patch: Partial<NoteData>) => setContent(p => ({ ...p, note: { ...p.note, ...patch } }));

  const updateTab = (tab: 'tab_site' | 'tab_wb' | 'tab_ozon' | 'tab_ym' | 'tab_whatsapp', patch: Partial<TabData>) => {
    setContent(p => ({ ...p, [tab]: { ...p[tab], ...patch } }));
  };

  const updateTabStep = (tab: 'tab_site' | 'tab_wb' | 'tab_ozon' | 'tab_ym' | 'tab_whatsapp', idx: number, val: string) => {
    setContent(p => {
      const steps = [...p[tab].steps];
      steps[idx] = val;
      return { ...p, [tab]: { ...p[tab], steps } };
    });
  };

  const addTabStep = (tab: 'tab_site' | 'tab_wb' | 'tab_ozon' | 'tab_ym' | 'tab_whatsapp') =>
    setContent(p => ({ ...p, [tab]: { ...p[tab], steps: [...p[tab].steps, ''] } }));

  const removeTabStep = (tab: 'tab_site' | 'tab_wb' | 'tab_ozon' | 'tab_ym' | 'tab_whatsapp', idx: number) =>
    setContent(p => ({ ...p, [tab]: { ...p[tab], steps: p[tab].steps.filter((_, i) => i !== idx) } }));

  const updateCardItem = (cardIdx: number, itemIdx: number, val: string) => {
    setContent(p => {
      const cards = p.info_cards.cards.map((c, ci) => {
        if (ci !== cardIdx) return c;
        const items = [...c.items];
        items[itemIdx] = val;
        return { ...c, items };
      });
      return { ...p, info_cards: { cards } };
    });
  };

  const addCardItem = (cardIdx: number) => {
    setContent(p => {
      const cards = p.info_cards.cards.map((c, ci) =>
        ci === cardIdx ? { ...c, items: [...c.items, ''] } : c
      );
      return { ...p, info_cards: { cards } };
    });
  };

  const removeCardItem = (cardIdx: number, itemIdx: number) => {
    setContent(p => {
      const cards = p.info_cards.cards.map((c, ci) =>
        ci === cardIdx ? { ...c, items: c.items.filter((_, ii) => ii !== itemIdx) } : c
      );
      return { ...p, info_cards: { cards } };
    });
  };

  const SaveBtn = ({ section }: { section: SectionKey }) => (
    <button
      onClick={() => saveSection(section)}
      disabled={saving === section}
      className="px-6 py-2 bg-black text-white hover:bg-gray-800 disabled:bg-gray-400 text-sm mt-4"
    >
      {saving === section ? 'Сохранение...' : 'Сохранить раздел'}
    </button>
  );

  const SectionAccordion = ({ id, title, children }: { id: SectionKey; title: string; children: React.ReactNode }) => (
    <section className="border border-gray-200">
      <button
        className="w-full px-6 py-4 flex justify-between items-center text-left hover:bg-gray-50"
        onClick={() => setOpenSection(openSection === id ? null : id)}
      >
        <h2 className="text-lg" style={{ fontFamily: 'var(--font-playfair-display)' }}>{title}</h2>
        <span className="text-gray-400 text-xl">{openSection === id ? '−' : '+'}</span>
      </button>
      {openSection === id && <div className="px-6 pb-6">{children}</div>}
    </section>
  );

  const TabEditor = ({ tab }: { tab: 'tab_site' | 'tab_wb' | 'tab_ozon' | 'tab_ym' | 'tab_whatsapp' }) => {
    const data = content[tab];
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Заголовок вкладки</label>
          <input type="text" value={data.title}
            onChange={e => updateTab(tab, { title: e.target.value })}
            className="w-full px-3 py-2 border text-sm" />
        </div>
        {tab !== 'tab_site' && (
          <>
            <div>
              <label className="block text-sm mb-1">Вводный текст</label>
              <textarea value={data.intro || ''}
                onChange={e => updateTab(tab, { intro: e.target.value })}
                rows={2} className="w-full px-3 py-2 border text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Ссылка (кнопка «Открыть …»)</label>
              <input type="text" value={data.link || ''}
                onChange={e => updateTab(tab, { link: e.target.value })}
                className="w-full px-3 py-2 border text-sm" placeholder="https://..." />
            </div>
          </>
        )}
        <div>
          <label className="block text-sm mb-2">Шаги</label>
          <div className="space-y-2">
            {data.steps.map((step, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="mt-2 text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}.</span>
                <input type="text" value={step}
                  onChange={e => updateTabStep(tab, i, e.target.value)}
                  className="flex-1 px-3 py-2 border text-sm" />
                <button onClick={() => removeTabStep(tab, i)}
                  className="icon-btn-interactive mt-1 text-red-500 hover:text-red-700 hover:bg-red-50 text-xl px-2 flex-shrink-0 rounded">×</button>
              </div>
            ))}
          </div>
          <button onClick={() => addTabStep(tab)}
            className="mt-2 text-sm text-gray-600 border border-dashed border-gray-300 px-3 py-1 hover:bg-gray-50">
            + Добавить шаг
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Загрузка...</p></div>;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 py-4 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm hover:underline">← Назад</Link>
            <h1 className="text-xl" style={{ fontFamily: 'var(--font-playfair-display)' }}>Оформление заказа</h1>
          </div>
          <a href="/how-to-order" target="_blank" className="text-sm text-gray-500 hover:underline">Просмотр →</a>
        </div>
      </header>

      {message && (
        <div className={`py-3 px-6 text-center text-sm ${message.includes('Ошибка') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      <div className="container mx-auto px-6 py-8 max-w-4xl space-y-4">
        <SectionAccordion id="hero" title="Герой / заголовок страницы">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Eyebrow (малый текст)</label>
                <input type="text" value={content.hero.eyebrow}
                  onChange={e => updateHero({ eyebrow: e.target.value })}
                  className="w-full px-3 py-2 border text-sm" />
              </div>
              <div>
                <label className="block text-sm mb-1">Заголовок страницы</label>
                <input type="text" value={content.hero.title}
                  onChange={e => updateHero({ title: e.target.value })}
                  className="w-full px-3 py-2 border text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1">Описание</label>
              <textarea value={content.hero.description}
                onChange={e => updateHero({ description: e.target.value })}
                rows={2} className="w-full px-3 py-2 border text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Надпись над вариантами</label>
                <input type="text" value={content.hero.options_eyebrow}
                  onChange={e => updateHero({ options_eyebrow: e.target.value })}
                  className="w-full px-3 py-2 border text-sm" />
              </div>
              <div>
                <label className="block text-sm mb-1">Заголовок вариантов</label>
                <input type="text" value={content.hero.options_title}
                  onChange={e => updateHero({ options_title: e.target.value })}
                  className="w-full px-3 py-2 border text-sm" />
              </div>
            </div>
          </div>
          <SaveBtn section="hero" />
        </SectionAccordion>

        <SectionAccordion id="tab_site" title="Вкладка: На сайте">
          <TabEditor tab="tab_site" />
          <SaveBtn section="tab_site" />
        </SectionAccordion>

        <SectionAccordion id="tab_wb" title="Вкладка: Wildberries">
          <TabEditor tab="tab_wb" />
          <SaveBtn section="tab_wb" />
        </SectionAccordion>

        <SectionAccordion id="tab_ozon" title="Вкладка: Ozon">
          <TabEditor tab="tab_ozon" />
          <SaveBtn section="tab_ozon" />
        </SectionAccordion>

        <SectionAccordion id="tab_ym" title="Вкладка: Яндекс Маркет">
          <TabEditor tab="tab_ym" />
          <SaveBtn section="tab_ym" />
        </SectionAccordion>

        <SectionAccordion id="tab_whatsapp" title="Вкладка: WhatsApp">
          <TabEditor tab="tab_whatsapp" />
          <SaveBtn section="tab_whatsapp" />
        </SectionAccordion>

        <SectionAccordion id="info_cards" title="Блок: Оплата / Доставка / Возврат">
          <div className="space-y-6">
            {content.info_cards.cards.map((card, ci) => (
              <div key={ci} className="border border-gray-100 p-4 rounded">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Заголовок карточки</label>
                    <input type="text" value={card.title}
                      onChange={e => {
                        const cards = content.info_cards.cards.map((c, i) => i === ci ? { ...c, title: e.target.value } : c);
                        setContent(p => ({ ...p, info_cards: { cards } }));
                      }}
                      className="w-full px-2 py-1.5 border text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Kicker</label>
                    <input type="text" value={card.kicker}
                      onChange={e => {
                        const cards = content.info_cards.cards.map((c, i) => i === ci ? { ...c, kicker: e.target.value } : c);
                        setContent(p => ({ ...p, info_cards: { cards } }));
                      }}
                      className="w-full px-2 py-1.5 border text-sm" />
                  </div>
                </div>
                <label className="block text-xs text-gray-500 mb-1">Пункты</label>
                {card.items.map((item, ii) => (
                  <div key={ii} className="flex gap-2 items-start mb-2">
                    <span className="mt-2 text-xs text-gray-400 w-4">•</span>
                    <input type="text" value={item}
                      onChange={e => updateCardItem(ci, ii, e.target.value)}
                      className="flex-1 px-2 py-1.5 border text-sm" />
                    <button onClick={() => removeCardItem(ci, ii)} className="icon-btn-interactive mt-1 text-red-500 hover:text-red-700 hover:bg-red-50 text-xl px-1 rounded">×</button>
                  </div>
                ))}
                <button onClick={() => addCardItem(ci)}
                  className="text-xs text-gray-500 border border-dashed border-gray-300 px-2 py-1 hover:bg-gray-50">
                  + пункт
                </button>
              </div>
            ))}
          </div>
          <SaveBtn section="info_cards" />
        </SectionAccordion>

        <SectionAccordion id="note" title="Блок «Важно»">
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Eyebrow</label>
              <input type="text" value={content.note.eyebrow}
                onChange={e => updateNote({ eyebrow: e.target.value })}
                className="w-full px-3 py-2 border text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Текст</label>
              <textarea value={content.note.text}
                onChange={e => updateNote({ text: e.target.value })}
                rows={3} className="w-full px-3 py-2 border text-sm" />
            </div>
          </div>
          <SaveBtn section="note" />
        </SectionAccordion>
      </div>
    </div>
  );
}

export default function EditHowToOrderPage() {
  return (
    <AdminProtected permission="content.edit">
      <EditHowToOrder />
    </AdminProtected>
  );
}
