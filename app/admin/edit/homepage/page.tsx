'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { AdminSelect } from '@/app/components/admin/AdminSelect';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HOMEPAGE_COLLECTION_SLOTS } from '@/lib/defaultAuctionCategories';
import {
  DEFAULT_BRANDING,
  DEFAULT_LOGO_URL,
  DEFAULT_SITE_FOOTER,
  mergeBranding,
  mergeSiteFooter,
  type SiteBranding,
  type SiteFooterConfig,
} from '@/lib/siteShellDefaults';
import { DEFAULT_HERO, DEFAULT_CURATED, DEFAULT_PANELS, DEFAULT_TEXT_IMAGE, DEFAULT_IMPERIAL } from '@/lib/homepageMerge';
import {
  DEFAULT_CATALOG_LABELS,
  type CatalogLabels,
} from '@/lib/catalogLabels';

interface HeroSection {
  videoUrl: string;
  /** Лёгкий mp4 для телефона (опционально). */
  videoUrlMobile?: string;
  /** Отдельное фото/постер для узкой ширины; без него берётся десктопный постер. */
  imageUrlMobile?: string;
  isVideo: boolean;
  imageUrl: string;
  line1: string;
  line2: string;
  line3: string;
}

interface DescriptionSection {
  text: string;
}

interface Panel {
  image: string;
  subtitle: string;
  title: string;
  quote: string;
}

interface HomepageCollectionCard {
  season: string;
  title: string;
  image: string;
  collection_id?: number;
  slug?: string;
}

interface AuctionCollection {
  id: number;
  name: string;
  slug: string;
}

interface TextImageSection {
  smallImage: string;
  bigImage: string;
  title: string;
  text: string;
}

interface ImperialSection {
  title: string;
  text: string;
  image: string;
}

function EditHomepage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Hero Section
  const [hero, setHero] = useState<HeroSection>(() => ({
    ...(DEFAULT_HERO as HeroSection),
  }));

  // Description
  const [description, setDescription] = useState<DescriptionSection>({
    text: 'City Legend — тщательно отобранная коллекция украшений и аксессуаров\nдля тех, кто ценит изящество в каждой детали.',
  });

  // Panels
  const [panels, setPanels] = useState<Panel[]>(() => [...DEFAULT_PANELS]);

  const emptyCollectionCard = (): HomepageCollectionCard => ({
    season: 'COLLECTION 2025',
    title: '',
    image: '',
  });

  // Коллекции на главной
  const [homepageCollections, setHomepageCollections] = useState<HomepageCollectionCard[]>(() =>
    Array.from({ length: HOMEPAGE_COLLECTION_SLOTS }, emptyCollectionCard)
  );
  const [availableCollections, setAvailableCollections] = useState<AuctionCollection[]>([]);

  // Text & Image Section
  const [textImage, setTextImage] = useState<TextImageSection>(() => ({ ...DEFAULT_TEXT_IMAGE }));

  // Imperial Section
  const [imperial, setImperial] = useState<ImperialSection>(() => ({ ...DEFAULT_IMPERIAL }));

  const [curated, setCurated] = useState(() => ({ ...DEFAULT_CURATED }));
  const [catalogLabels, setCatalogLabels] = useState<CatalogLabels>(() => ({
    ...DEFAULT_CATALOG_LABELS,
  }));

  const [branding, setBranding] = useState<SiteBranding>(DEFAULT_BRANDING);
  const [siteFooter, setSiteFooter] = useState<SiteFooterConfig>(DEFAULT_SITE_FOOTER);

  useEffect(() => {
    const loadContent = async () => {
      try {
        // Загружаем содержимое главной страницы
        const response = await fetch('/api/admin/homepage');
        if (response.ok) {
          const data = await response.json();
          
          // Загружаем данные если они есть в БД
          if (data.hero && typeof data.hero === 'object') {
            setHero({ ...(DEFAULT_HERO as HeroSection), ...(data.hero as Partial<HeroSection>) });
          }
          if (data.description) setDescription(data.description);
          if (data.panels) setPanels(data.panels);
          const rawCollections = data.collections ?? data.categories;
          if (Array.isArray(rawCollections)) {
            const cards: HomepageCollectionCard[] = rawCollections.slice(0, HOMEPAGE_COLLECTION_SLOTS).map((item: HomepageCollectionCard) => ({
              season: item.season ?? 'COLLECTION 2025',
              title: item.title ?? '',
              image: item.image ?? '',
              collection_id: item.collection_id,
              slug: item.slug,
            }));
            while (cards.length < HOMEPAGE_COLLECTION_SLOTS) {
              cards.push(emptyCollectionCard());
            }
            setHomepageCollections(cards);
          }
          if (data.textImage) setTextImage(data.textImage);
          if (data.imperial) setImperial(data.imperial);
          if (data.curated && typeof data.curated === 'object') {
            setCurated({ ...DEFAULT_CURATED, ...(data.curated as typeof DEFAULT_CURATED) });
          }
          if (data.catalog_labels && typeof data.catalog_labels === 'object') {
            setCatalogLabels({ ...DEFAULT_CATALOG_LABELS, ...(data.catalog_labels as CatalogLabels) });
          }
          if (data.branding) setBranding(mergeBranding(data.branding));
          if (data.site_footer) setSiteFooter(mergeSiteFooter(data.site_footer));
        } else if (response.status === 401) {
          router.push('/admin/login');
        }

        const collectionsResponse = await fetch('/api/admin/collections');
        if (collectionsResponse.ok) {
          const collectionsData = await collectionsResponse.json();
          setAvailableCollections(collectionsData.collections || []);
        }
      } catch (error) {
        console.error('Ошибка загрузки:', error);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [router]);

  const handleFileUpload = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/admin/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Ошибка загрузки файла');
    }

    const data = await response.json();
    return data.url;
  };

  const saveSection = async (section: string, data: any) => {
    const response = await fetch('/api/admin/homepage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, data }),
    });

    if (!response.ok) {
      throw new Error('Ошибка сохранения');
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage('');

    try {
      const collectionsToSave = homepageCollections.slice(0, HOMEPAGE_COLLECTION_SLOTS);
      await Promise.all([
        saveSection('branding', branding),
        saveSection('site_footer', siteFooter),
        saveSection('hero', hero),
        saveSection('description', description),
        saveSection('panels', panels),
        saveSection('collections', collectionsToSave),
        saveSection('textImage', textImage),
        saveSection('imperial', imperial),
        saveSection('curated', curated),
        saveSection('catalog_labels', catalogLabels),
      ]);

      setMessage('Все изменения сохранены успешно!');
    } catch (error) {
      setMessage('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p style={{ fontFamily: 'var(--font-open-sans)' }}>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Шапка */}
      <header className="border-b border-gray-200 py-4 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-sm hover:underline"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              ← Назад
            </Link>
            <h1
              className="text-xl"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Редактирование основной страницы
            </h1>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="px-6 py-2 bg-black text-white hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              letterSpacing: '0.05em',
            }}
          >
            {saving ? 'Сохранение...' : 'Сохранить все'}
          </button>
        </div>
      </header>

      {message && (
        <div className={`py-3 px-6 text-center ${message.includes('Ошибка') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      {/* Контент */}
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-12">
          
          {/* 0. Логотип (сайт, шапка, подвал, метаданные) */}
          <section className="border border-gray-200 p-6 bg-gray-50/80">
            <h2
              className="text-xl mb-2"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Логотип сайта
            </h2>
            <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Один файл для шапки, подвала, страницы wish, иконок вкладки и соц. превью. Загрузите PNG/SVG/WebP или верните стандартный файл.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Файл логотипа
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const url = await handleFileUpload(f);
                      setBranding({ ...branding, logoUrl: url });
                    } catch (err) {
                      console.error(err);
                      alert('Ошибка загрузки');
                    }
                  }}
                  className="mb-2"
                />
                {branding.logoUrl?.trim() ? (
                  <img
                    src={branding.logoUrl}
                    alt="Превью"
                    className="w-40 h-auto object-contain border border-gray-200 bg-white p-2"
                  />
                ) : (
                  <div className="text-xs text-gray-500">Нет файла</div>
                )}
                <p className="text-xs text-gray-500 mt-2">Текущий URL: {branding.logoUrl || '—'}</p>
              </div>
              <button
                type="button"
                onClick={() => setBranding({ logoUrl: DEFAULT_LOGO_URL })}
                className="px-4 py-2 border border-gray-400 text-sm hover:bg-gray-100"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Сбросить на {DEFAULT_LOGO_URL} (файл из public)
              </button>
            </div>
          </section>

          {/* 0b. Подвал */}
          <section className="border border-gray-200 p-6">
            <h2
              className="text-xl mb-2"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Подвал сайта (футер)
            </h2>
            <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Тексты, цвет фона, соцсети и правовые ссылки. Реквизиты ООО при включённом переключателе подтягиваются из раздела реквизитов (БД).
            </p>
            <div className="space-y-6">
              <div>
                <label className="block text-sm mb-1">Цвет фона верхней части подвала</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={siteFooter.backgroundColor}
                    onChange={(e) => setSiteFooter({ ...siteFooter, backgroundColor: e.target.value })}
                    className="h-10 w-14 border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={siteFooter.backgroundColor}
                    onChange={(e) => setSiteFooter({ ...siteFooter, backgroundColor: e.target.value })}
                    className="flex-1 px-3 py-2 border font-mono text-sm"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Заголовок рассылки</label>
                  <input
                    type="text"
                    value={siteFooter.newsletterTitle}
                    onChange={(e) => setSiteFooter({ ...siteFooter, newsletterTitle: e.target.value })}
                    className="w-full px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Плейсхолдер email</label>
                  <input
                    type="text"
                    value={siteFooter.newsletterPlaceholder}
                    onChange={(e) => setSiteFooter({ ...siteFooter, newsletterPlaceholder: e.target.value })}
                    className="w-full px-3 py-2 border"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1">Текст под заголовком рассылки</label>
                <textarea
                  value={siteFooter.newsletterDescription}
                  onChange={(e) => setSiteFooter({ ...siteFooter, newsletterDescription: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Дисклеймер под формой</label>
                <textarea
                  value={siteFooter.newsletterDisclaimer}
                  onChange={(e) => setSiteFooter({ ...siteFooter, newsletterDisclaimer: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border text-sm"
                />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm mb-1">Колонка «связь»</label>
                  <input
                    type="text"
                    value={siteFooter.contactColumnTitle}
                    onChange={(e) => setSiteFooter({ ...siteFooter, contactColumnTitle: e.target.value })}
                    className="w-full px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Кнопка контактов</label>
                  <input
                    type="text"
                    value={siteFooter.contactButtonLabel}
                    onChange={(e) => setSiteFooter({ ...siteFooter, contactButtonLabel: e.target.value })}
                    className="w-full px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Копирайт (нижняя строка)</label>
                  <input
                    type="text"
                    value={siteFooter.copyrightText}
                    onChange={(e) => setSiteFooter({ ...siteFooter, copyrightText: e.target.value })}
                    className="w-full px-3 py-2 border"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Заголовок «соцсети»</label>
                  <input
                    type="text"
                    value={siteFooter.socialColumnTitle}
                    onChange={(e) => setSiteFooter({ ...siteFooter, socialColumnTitle: e.target.value })}
                    className="w-full px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Заголовок «правовая информация»</label>
                  <input
                    type="text"
                    value={siteFooter.legalColumnTitle}
                    onChange={(e) => setSiteFooter({ ...siteFooter, legalColumnTitle: e.target.value })}
                    className="w-full px-3 py-2 border"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={siteFooter.showLegalRequisites}
                  onChange={(e) => setSiteFooter({ ...siteFooter, showLegalRequisites: e.target.checked })}
                />
                <span className="text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Показывать реквизиты (ООО, ИНН, адрес) над копирайтом
                </span>
              </label>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Ссылки в соцсетях</label>
                  <button
                    type="button"
                    className="text-sm text-blue-700 underline"
                    onClick={() =>
                      setSiteFooter({
                        ...siteFooter,
                        socialLinks: [...siteFooter.socialLinks, { name: 'Новая ссылка', url: 'https://' }],
                      })
                    }
                  >
                    + Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {siteFooter.socialLinks.map((row, i) => (
                    <div key={`soc-${i}`} className="flex flex-wrap gap-2 items-center">
                      <input
                        placeholder="Название"
                        value={row.name}
                        onChange={(e) => {
                          const next = [...siteFooter.socialLinks];
                          next[i] = { ...next[i], name: e.target.value };
                          setSiteFooter({ ...siteFooter, socialLinks: next });
                        }}
                        className="flex-1 min-w-[120px] px-2 py-1 border text-sm"
                      />
                      <input
                        placeholder="URL"
                        value={row.url}
                        onChange={(e) => {
                          const next = [...siteFooter.socialLinks];
                          next[i] = { ...next[i], url: e.target.value };
                          setSiteFooter({ ...siteFooter, socialLinks: next });
                        }}
                        className="flex-[2] min-w-[180px] px-2 py-1 border text-sm"
                      />
                      <button
                        type="button"
                        className="text-red-600 text-sm px-2"
                        onClick={() => {
                          const next = siteFooter.socialLinks.filter((_, j) => j !== i);
                          setSiteFooter({ ...siteFooter, socialLinks: next.length ? next : [{ name: '', url: '' }] });
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Правовые ссылки</label>
                  <button
                    type="button"
                    className="text-sm text-blue-700 underline"
                    onClick={() =>
                      setSiteFooter({
                        ...siteFooter,
                        legalLinks: [...siteFooter.legalLinks, { label: 'Страница', href: '/' }],
                      })
                    }
                  >
                    + Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {siteFooter.legalLinks.map((row, i) => (
                    <div key={`leg-${i}`} className="flex flex-wrap gap-2 items-center">
                      <input
                        placeholder="Текст"
                        value={row.label}
                        onChange={(e) => {
                          const next = [...siteFooter.legalLinks];
                          next[i] = { ...next[i], label: e.target.value };
                          setSiteFooter({ ...siteFooter, legalLinks: next });
                        }}
                        className="flex-1 min-w-[120px] px-2 py-1 border text-sm"
                      />
                      <input
                        placeholder="Путь / URL"
                        value={row.href}
                        onChange={(e) => {
                          const next = [...siteFooter.legalLinks];
                          next[i] = { ...next[i], href: e.target.value };
                          setSiteFooter({ ...siteFooter, legalLinks: next });
                        }}
                        className="flex-[2] min-w-[180px] px-2 py-1 border text-sm"
                      />
                      <button
                        type="button"
                        className="text-red-600 text-sm px-2"
                        onClick={() => {
                          const next = siteFooter.legalLinks.filter((_, j) => j !== i);
                          setSiteFooter({ ...siteFooter, legalLinks: next.length ? next : [{ label: '', href: '/' }] });
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 1. Hero Section */}
          <section className="border border-gray-200 p-6">
            <h2
              className="text-xl mb-6"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              1. Hero блок (видео/фото и текст)
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={hero.isVideo}
                    onChange={(e) => setHero({ ...hero, isVideo: e.target.checked })}
                  />
                  <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px' }}>
                    Использовать видео (иначе фото)
                  </span>
                </label>
              </div>

              {hero.isVideo ? (
                <div className="space-y-6">
                  <div>
                    <label
                      className="block text-sm mb-2"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      Видео (десктоп, без изменений)
                    </label>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={async (e) => {
                        if (e.target.files?.[0]) {
                          try {
                            const url = await handleFileUpload(e.target.files[0]);
                            const updatedHero = { ...hero, videoUrl: url };
                            setHero(updatedHero);
                            await saveSection('hero', updatedHero);
                          } catch (error) {
                            console.error('Ошибка загрузки видео:', error);
                            alert('Ошибка загрузки видео. Попробуйте снова.');
                          }
                        }
                      }}
                      className="mb-2"
                    />
                    <p className="text-xs text-gray-500">Текущее: {hero.videoUrl}</p>
                  </div>

                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 space-y-4">
                    <p
                      className="text-sm font-medium text-gray-800"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      Телефон (до 768px): фото или лёгкое видео
                    </p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      На мобильных десктопное видео не показывается. Загрузите здесь JPG/WebP постер и при
                      желании отдельный mp4 (~до 2 МБ). Если задан только постер без видео — на телефоне будет
                      только картинка.
                    </p>

                    <div>
                      <label
                        className="block text-sm mb-2"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        Фото / постер для телефона
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const url = await handleFileUpload(f);
                            const updatedHero = { ...hero, imageUrlMobile: url };
                            setHero(updatedHero);
                            await saveSection('hero', updatedHero);
                          } catch (error) {
                            console.error('Ошибка загрузки:', error);
                            alert('Ошибка загрузки. Попробуйте снова.');
                          }
                        }}
                        className="mb-2"
                      />
                      <p className="text-xs text-gray-500 break-all">
                        URL: {hero.imageUrlMobile?.trim() || '— не задано'}
                      </p>
                      {hero.imageUrlMobile?.trim() ? (
                        <img
                          src={hero.imageUrlMobile}
                          alt=""
                          className="mt-2 h-24 w-auto max-w-full rounded border object-cover"
                        />
                      ) : null}
                    </div>

                    <div>
                      <label
                        className="block text-sm mb-2"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        Видео для телефона (необязательно, короткий mp4)
                      </label>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={async (e) => {
                          if (e.target.files?.[0]) {
                            try {
                              const url = await handleFileUpload(e.target.files[0]);
                              const updatedHero = { ...hero, videoUrlMobile: url };
                              setHero(updatedHero);
                              await saveSection('hero', updatedHero);
                            } catch (error) {
                              console.error('Ошибка загрузки мобильного видео:', error);
                              alert('Ошибка загрузки. Попробуйте снова.');
                            }
                          }
                        }}
                        className="mb-2"
                      />
                      <p className="text-xs text-gray-500 break-all">
                        URL: {hero.videoUrlMobile?.trim() || '— не задано'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label
                      className="block text-sm mb-2"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      Фото (десктоп)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        if (e.target.files?.[0]) {
                          const url = await handleFileUpload(e.target.files[0]);
                          setHero({ ...hero, imageUrl: url });
                        }
                      }}
                      className="mb-2"
                    />
                    {hero.imageUrl ? (
                      <img src={hero.imageUrl} alt="" className="mt-2 h-32 w-32 rounded border object-cover" />
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                    <label
                      className="block text-sm mb-2"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      Фото для телефона (опционально)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = await handleFileUpload(f);
                        setHero({ ...hero, imageUrlMobile: url });
                      }}
                      className="mb-2"
                    />
                    <p className="text-xs text-gray-500 mb-2 break-all">
                      URL: {hero.imageUrlMobile?.trim() || '— как на десктопе'}
                    </p>
                    {hero.imageUrlMobile?.trim() ? (
                      <img src={hero.imageUrlMobile} alt="" className="h-24 w-auto max-w-full rounded border object-cover" />
                    ) : null}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Строка 1 (маленькая)
                </label>
                <input
                  type="text"
                  value={hero.line1}
                  onChange={(e) => setHero({ ...hero, line1: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                />
              </div>

              <div>
                <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Строка 2 (заголовок)
                </label>
                <input
                  type="text"
                  value={hero.line2}
                  onChange={(e) => setHero({ ...hero, line2: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                />
              </div>

              <div>
                <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Строка 3 (описание)
                </label>
                <input
                  type="text"
                  value={hero.line3}
                  onChange={(e) => setHero({ ...hero, line3: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                />
              </div>
            </div>
          </section>

          {/* 2. Description */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              2. Описание
            </h2>
            <textarea
              value={description.text}
              onChange={(e) => setDescription({ text: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            />
          </section>

          {/* 3. Panels */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              3. Три панели с текстом и фото
            </h2>
            
            {panels.map((panel, index) => (
              <div key={index} className="mb-8 pb-8 border-b last:border-b-0">
                <h3 className="font-bold mb-4">Панель {index + 1}</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm mb-2">Фото</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        if (e.target.files?.[0]) {
                          const url = await handleFileUpload(e.target.files[0]);
                          const newPanels = [...panels];
                          newPanels[index].image = url;
                          setPanels(newPanels);
                        }
                      }}
                      className="mb-2"
                    />
                    {panel.image?.trim() ? (
                      <img src={panel.image} alt="" className="w-32 h-32 object-cover" />
                    ) : (
                      <div className="flex h-32 w-32 items-center justify-center border border-dashed border-gray-300 bg-gray-50 text-center text-xs text-gray-400">
                        Нет фото
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm mb-2">Подзаголовок</label>
                    <input
                      type="text"
                      value={panel.subtitle}
                      onChange={(e) => {
                        const newPanels = [...panels];
                        newPanels[index].subtitle = e.target.value;
                        setPanels(newPanels);
                      }}
                      className="w-full px-4 py-2 border"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2">Заголовок</label>
                    <textarea
                      value={panel.title}
                      onChange={(e) => {
                        const newPanels = [...panels];
                        newPanels[index].title = e.target.value;
                        setPanels(newPanels);
                      }}
                      rows={2}
                      className="w-full px-4 py-2 border"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2">Цитата</label>
                    <textarea
                      value={panel.quote}
                      onChange={(e) => {
                        const newPanels = [...panels];
                        newPanels[index].quote = e.target.value;
                        setPanels(newPanels);
                      }}
                      rows={3}
                      className="w-full px-4 py-2 border"
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* 4. Коллекции */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-2" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              4. Коллекции (3 карточки на главной)
            </h2>
            <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Коллекция объединяет товары разных типов в одном стиле. Создайте коллекции в{' '}
              <Link href="/admin/edit/catalog" className="underline">
                каталоге → «Коллекции»
              </Link>
              , привяжите товары, затем выберите здесь для витрины.
            </p>

            {homepageCollections.slice(0, HOMEPAGE_COLLECTION_SLOTS).map((card, index) => (
              <div key={index} className="mb-6 pb-6 border-b last:border-b-0">
                <h3 className="font-bold mb-4">Коллекция {index + 1}</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm mb-2">Фото для главной</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        if (e.target.files?.[0]) {
                          const url = await handleFileUpload(e.target.files[0]);
                          const next = [...homepageCollections];
                          next[index].image = url;
                          setHomepageCollections(next);
                        }
                      }}
                      className="mb-2"
                    />
                    {card.image?.trim() ? (
                      <img src={card.image} alt="" className="w-32 h-32 object-cover" />
                    ) : (
                      <div className="flex h-32 w-32 items-center justify-center border border-dashed border-gray-300 bg-gray-50 text-center text-xs text-gray-400">
                        Нет фото
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm mb-2">Подпись сверху (например COLLECTION 2025)</label>
                    <input
                      type="text"
                      value={card.season}
                      onChange={(e) => {
                        const next = [...homepageCollections];
                        next[index].season = e.target.value;
                        setHomepageCollections(next);
                      }}
                      className="w-full px-4 py-2 border"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2">Коллекция из каталога</label>
                    <AdminSelect
                      value={card.collection_id ? String(card.collection_id) : ''}
                      onChange={(v) => {
                        const next = [...homepageCollections];
                        const selectedId = v ? parseInt(v, 10) : 0;
                        const selected = availableCollections.find((c) => c.id === selectedId);
                        next[index].collection_id = selectedId || undefined;
                        next[index].title = selected?.name || '';
                        next[index].slug = selected?.slug || '';
                        setHomepageCollections(next);
                      }}
                      options={[
                        { value: '', label: 'Выберите коллекцию' },
                        ...availableCollections.map((c) => ({
                          value: String(c.id),
                          label: `${c.name} (${c.slug})`,
                        })),
                      ]}
                      fullWidth
                    />
                    {card.title ? (
                      <p className="text-sm text-gray-600 mt-2">
                        На сайте: {card.title} → /collection?collection={card.slug}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* 5. Text & Image */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              5. Блок с малым и большим фото
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Малое фото</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    if (e.target.files?.[0]) {
                      const url = await handleFileUpload(e.target.files[0]);
                      setTextImage({ ...textImage, smallImage: url });
                    }
                  }}
                  className="mb-2"
                />
                {textImage.smallImage?.trim() ? (
                  <img src={textImage.smallImage} alt="" className="w-32 h-32 object-cover" />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center border border-dashed border-gray-300 bg-gray-50 text-center text-xs text-gray-400">
                    Нет фото
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm mb-2">Большое фото</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    if (e.target.files?.[0]) {
                      const url = await handleFileUpload(e.target.files[0]);
                      setTextImage({ ...textImage, bigImage: url });
                    }
                  }}
                  className="mb-2"
                />
                {textImage.bigImage?.trim() ? (
                  <img src={textImage.bigImage} alt="" className="w-32 h-32 object-cover" />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center border border-dashed border-gray-300 bg-gray-50 text-center text-xs text-gray-400">
                    Нет фото
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm mb-2">Заголовок</label>
                <textarea
                  value={textImage.title}
                  onChange={(e) => setTextImage({ ...textImage, title: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Текст</label>
                <textarea
                  value={textImage.text}
                  onChange={(e) => setTextImage({ ...textImage, text: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border"
                />
              </div>
            </div>
          </section>

          {/* 6. Imperial Collection */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              6. Знаковая коллекция
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Заголовок</label>
                <input
                  type="text"
                  value={imperial.title}
                  onChange={(e) => setImperial({ ...imperial, title: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Текст</label>
                <textarea
                  value={imperial.text}
                  onChange={(e) => setImperial({ ...imperial, text: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Фото</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    if (e.target.files?.[0]) {
                      const url = await handleFileUpload(e.target.files[0]);
                      setImperial({ ...imperial, image: url });
                    }
                  }}
                  className="mb-2"
                />
                {imperial.image?.trim() ? (
                  <img src={imperial.image} alt="" className="w-32 h-32 object-cover" />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center border border-dashed border-gray-300 bg-gray-50 text-center text-xs text-gray-400">
                    Нет фото
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 7. Кураторская подборка */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-2" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              7. Кураторская подборка
            </h2>
            <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Заголовок блока с 4 карточками на главной. Сами карточки выбираются в{' '}
              <Link href="/admin/edit/catalog" className="underline text-[#0b2a24]">
                каталоге товаров
              </Link>{' '}
              — галочка «Показывать на главной (макс. 4)».
            </p>
            <div>
              <label className="block text-sm mb-2">Заголовок секции</label>
              <input
                type="text"
                value={curated.title}
                onChange={(e) => setCurated({ ...curated, title: e.target.value })}
                className="w-full px-4 py-2 border"
                placeholder="Кураторская подборка"
              />
            </div>
          </section>

          {/* 8. Подписи каталога */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-2" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              8. Подписи каталога
            </h2>
            <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Названия полей и кнопок на сайте: сертификат, категории, поиск. Можно переименовать «Сертификат подлинности» на
              любую формулировку.
            </p>
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm mb-2">Заголовок блока коллекций на главной</label>
                <input
                  type="text"
                  value={catalogLabels.categoriesTitle}
                  onChange={(e) => setCatalogLabels({ ...catalogLabels, categoriesTitle: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Кнопка на карточке товара (сертификат)</label>
                <input
                  type="text"
                  value={catalogLabels.certificateLabel}
                  onChange={(e) => setCatalogLabels({ ...catalogLabels, certificateLabel: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Заголовок окна сертификата</label>
                <input
                  type="text"
                  value={catalogLabels.certificateModalTitle}
                  onChange={(e) =>
                    setCatalogLabels({ ...catalogLabels, certificateModalTitle: e.target.value })
                  }
                  className="w-full px-4 py-2 border"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Если сертификата нет</label>
                <input
                  type="text"
                  value={catalogLabels.certificateMissing}
                  onChange={(e) => setCatalogLabels({ ...catalogLabels, certificateMissing: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Блок в админке товара (заголовок)</label>
                <input
                  type="text"
                  value={catalogLabels.certificateAdminSection}
                  onChange={(e) =>
                    setCatalogLabels({ ...catalogLabels, certificateAdminSection: e.target.value })
                  }
                  className="w-full px-4 py-2 border"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Плейсхолдер поиска в шапке</label>
                <input
                  type="text"
                  value={catalogLabels.searchPlaceholder}
                  onChange={(e) => setCatalogLabels({ ...catalogLabels, searchPlaceholder: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Ссылка «весь каталог» в поиске</label>
                <input
                  type="text"
                  value={catalogLabels.allArticlesLink}
                  onChange={(e) => setCatalogLabels({ ...catalogLabels, allArticlesLink: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

export default function EditHomepagePage() {
  return (
    <AdminProtected permission="content.edit">
      <EditHomepage />
    </AdminProtected>
  );
}

