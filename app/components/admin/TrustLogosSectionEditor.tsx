'use client';

import {
  HOMEPAGE_LOGO_SLOTS_MAX,
  type TrustLogosSection,
} from '@/lib/homepageTrustSections';

type Props = {
  title: string;
  description: string;
  section: TrustLogosSection;
  onChange: (next: TrustLogosSection) => void;
  onUpload: (file: File) => Promise<string>;
  /** Показать настройки кнопки «Смотреть всех» (только клиенты) */
  showAllControls?: boolean;
};

export function TrustLogosSectionEditor({
  title,
  description,
  section,
  onChange,
  onUpload,
  showAllControls = false,
}: Props) {
  const addLogo = () => {
    if (section.logos.length >= HOMEPAGE_LOGO_SLOTS_MAX) return;
    onChange({
      ...section,
      logos: [...section.logos, { name: '', image: '' }],
    });
  };

  const updateLogo = (index: number, patch: Partial<TrustLogosSection['logos'][number]>) => {
    const logos = section.logos.map((logo, i) => (i === index ? { ...logo, ...patch } : logo));
    onChange({ ...section, logos });
  };

  const removeLogo = (index: number) => {
    onChange({ ...section, logos: section.logos.filter((_, i) => i !== index) });
  };

  return (
    <section className="border border-gray-200 p-6">
      <h2 className="text-xl mb-2" style={{ fontFamily: 'var(--font-playfair-display)' }}>
        {title}
      </h2>
      <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
        {description}
      </p>

      <div className="space-y-4 max-w-2xl">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={section.enabled}
            onChange={(e) => onChange({ ...section, enabled: e.target.checked })}
          />
          Показывать блок на главной
        </label>

        <div>
          <label className="block text-sm mb-2">Подпись сверху (eyebrow)</label>
          <input
            type="text"
            value={section.eyebrow}
            onChange={(e) => onChange({ ...section, eyebrow: e.target.value })}
            className="w-full px-4 py-2 border"
            placeholder="КЛИЕНТЫ"
          />
        </div>

        <div>
          <label className="block text-sm mb-2">Заголовок</label>
          <input
            type="text"
            value={section.title}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
            className="w-full px-4 py-2 border"
          />
        </div>

        <div>
          <label className="block text-sm mb-2">Подзаголовок (необязательно)</label>
          <textarea
            value={section.subtitle ?? ''}
            onChange={(e) => onChange({ ...section, subtitle: e.target.value })}
            className="w-full px-4 py-2 border min-h-[72px]"
          />
        </div>

        {showAllControls ? (
          <div className="rounded border border-gray-100 bg-gray-50 p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!section.showAllLink}
                onChange={(e) => onChange({ ...section, showAllLink: e.target.checked })}
              />
              Показать кнопку «Смотреть всех»
            </label>
            {section.showAllLink ? (
              <>
                <input
                  type="text"
                  value={section.showAllLabel ?? ''}
                  onChange={(e) => onChange({ ...section, showAllLabel: e.target.value })}
                  className="w-full px-4 py-2 border bg-white"
                  placeholder="Смотреть всех клиентов"
                />
                <input
                  type="text"
                  value={section.showAllHref ?? ''}
                  onChange={(e) => onChange({ ...section, showAllHref: e.target.value })}
                  className="w-full px-4 py-2 border bg-white"
                  placeholder="/about"
                />
              </>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Логотипы ({section.logos.length}/{HOMEPAGE_LOGO_SLOTS_MAX})
            </p>
            <button
              type="button"
              onClick={addLogo}
              disabled={section.logos.length >= HOMEPAGE_LOGO_SLOTS_MAX}
              className="px-3 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
            >
              + Добавить
            </button>
          </div>

          {section.logos.map((logo, index) => (
            <div key={index} className="border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Логотип {index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeLogo(index)}
                  className="text-sm text-red-700 hover:underline"
                >
                  Удалить
                </button>
              </div>
              <input
                type="text"
                value={logo.name}
                onChange={(e) => updateLogo(index, { name: e.target.value })}
                className="w-full px-4 py-2 border"
                placeholder="Название компании"
              />
              <input
                type="text"
                value={logo.url ?? ''}
                onChange={(e) => updateLogo(index, { url: e.target.value })}
                className="w-full px-4 py-2 border"
                placeholder="Ссылка (необязательно)"
              />
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const url = await onUpload(f);
                    updateLogo(index, { image: url });
                  } catch {
                    alert('Ошибка загрузки');
                  }
                }}
              />
              {logo.image?.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.image} alt="" className="h-12 w-auto max-w-[160px] object-contain" />
              ) : (
                <div className="text-xs text-gray-400">Файл не загружен</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
