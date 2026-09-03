'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface CareContent {
  hero: { eyebrow: string; title: string; subtitle: string; video_url: string };
  intro: { text: string };
  section1: { number: string; title: string; text1: string; text2: string; media_url: string; media_type: 'video' | 'image' };
  section2: { number: string; title: string; text1: string; text2: string; media_url: string; media_type: 'video' | 'image' };
  section3: { number: string; title: string; text1: string; text2: string; media_url: string; media_type: 'video' | 'image' };
  closing: { text: string };
  cta: { question: string; text: string; button_label: string };
}

const DEFAULTS: CareContent = {
  hero: { eyebrow: 'Рекомендации', title: 'Уход и хранение', subtitle: 'Чтобы аксессуары долго сохраняли вид, достаточно нескольких простых правил.', video_url: '/Bulgari.mp4' },
  intro: { text: 'Натуральные камни и гипоаллергенная фурнитура требуют бережного обращения. Следуя этим советам, вы сохраните блеск и целостность каждой вещи.' },
  section1: { number: 'I', title: 'Хранение', text1: '', text2: '', media_url: '/COLLECTION.mp4', media_type: 'video' },
  section2: { number: 'II', title: 'Ношение', text1: '', text2: '', media_url: '/4.avif', media_type: 'image' },
  section3: { number: 'III', title: 'Чистка', text1: '', text2: '', media_url: '/Luxury.mp4', media_type: 'video' },
  closing: { text: 'Небольшая забота продлевает жизнь вещам и сохраняет их ценность — и эмоциональную, и материальную.' },
  cta: { question: 'Вопросы по уходу?', text: 'Напишите нам — подскажем для конкретного изделия.', button_label: 'Связаться' },
};

type SectionKey = keyof CareContent;

function EditCare() {
  const [content, setContent] = useState<CareContent>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch('/api/admin/page-content?page=care')
      .then(r => r.json())
      .then(d => {
        if (d.content) {
          setContent(prev => ({ ...prev, ...d.content }));
        }
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
      body: JSON.stringify({ page: 'care', section, data: content[section] }),
    });
    if (res.ok) showMsg('Сохранено');
    else showMsg('Ошибка сохранения');
    setSaving(null);
  };

  const handleUpload = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) throw new Error('Ошибка загрузки');
    const d = await res.json();
    return d.url;
  };

  const updateSection = <K extends SectionKey>(section: K, patch: Partial<CareContent[K]>) => {
    setContent(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Загрузка...</p></div>;
  }

  const SaveBtn = ({ section }: { section: SectionKey }) => (
    <button
      onClick={() => saveSection(section)}
      disabled={saving === section}
      className="px-6 py-2 bg-black text-white hover:bg-gray-800 disabled:bg-gray-400 text-sm mt-4"
    >
      {saving === section ? 'Сохранение...' : 'Сохранить раздел'}
    </button>
  );

  const MediaField = ({
    label, value, typeValue, section,
    onUrlChange, onTypeChange, onFileUpload,
  }: {
    label: string;
    value: string;
    typeValue: 'video' | 'image';
    section: SectionKey;
    onUrlChange: (v: string) => void;
    onTypeChange: (v: 'video' | 'image') => void;
    onFileUpload: (url: string) => void;
  }) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={typeValue === 'video'} onChange={() => onTypeChange('video')} />
          Видео
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={typeValue === 'image'} onChange={() => onTypeChange('image')} />
          Изображение
        </label>
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onUrlChange(e.target.value)}
        className="w-full px-3 py-2 border text-sm"
        placeholder={typeValue === 'video' ? '/hero-main.mp4' : '/image.jpg'}
      />
      <div>
        <label className="text-xs text-gray-500 block mb-1">Или загрузить файл</label>
        <input
          type="file"
          accept={typeValue === 'video' ? 'video/*' : 'image/*'}
          disabled={uploading}
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try { onFileUpload(await handleUpload(file)); }
            catch { showMsg('Ошибка загрузки'); }
            setUploading(false);
          }}
          className="text-sm"
        />
        {uploading && <p className="text-xs text-gray-500 mt-1">Загрузка...</p>}
      </div>
      {value && (
        <div className="mt-2 border border-gray-200 p-2 bg-gray-50 rounded">
          {typeValue === 'video' ? (
            <video src={value} className="h-20 w-auto" muted />
          ) : (
            <img src={value} alt="" className="h-20 w-auto object-cover" />
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 py-4 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm hover:underline">← Назад</Link>
            <h1 className="text-xl" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              Уход и хранение
            </h1>
          </div>
          <a href="/care" target="_blank" className="text-sm text-gray-500 hover:underline">
            Просмотр страницы →
          </a>
        </div>
      </header>

      {message && (
        <div className={`py-3 px-6 text-center text-sm ${message.includes('Ошибка') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      <div className="container mx-auto px-6 py-8 max-w-4xl space-y-8">
        {/* Hero */}
        <section className="border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-playfair-display)' }}>Герой (верхний экран)</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Надпись над заголовком (eyebrow)</label>
              <input type="text" value={content.hero.eyebrow}
                onChange={e => updateSection('hero', { eyebrow: e.target.value })}
                className="w-full px-3 py-2 border text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Заголовок</label>
              <input type="text" value={content.hero.title}
                onChange={e => updateSection('hero', { title: e.target.value })}
                className="w-full px-3 py-2 border text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Подзаголовок</label>
              <textarea value={content.hero.subtitle}
                onChange={e => updateSection('hero', { subtitle: e.target.value })}
                rows={2} className="w-full px-3 py-2 border text-sm" />
            </div>
            <MediaField
              label="Фоновое видео"
              value={content.hero.video_url}
              typeValue="video"
              section="hero"
              onUrlChange={v => updateSection('hero', { video_url: v })}
              onTypeChange={() => {}}
              onFileUpload={url => updateSection('hero', { video_url: url })}
            />
          </div>
          <SaveBtn section="hero" />
        </section>

        {/* Intro */}
        <section className="border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-playfair-display)' }}>Вводный текст</h2>
          <textarea value={content.intro.text}
            onChange={e => updateSection('intro', { text: e.target.value })}
            rows={3} className="w-full px-3 py-2 border text-sm" />
          <SaveBtn section="intro" />
        </section>

        {/* Sections 1-3 */}
        {(['section1', 'section2', 'section3'] as const).map((sk, i) => {
          const sec = content[sk];
          return (
            <section key={sk} className="border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                Раздел {i + 1}: {sec.title}
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Номер (отображается на странице)</label>
                    <input type="text" value={sec.number}
                      onChange={e => updateSection(sk, { number: e.target.value } as any)}
                      className="w-full px-3 py-2 border text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Заголовок</label>
                    <input type="text" value={sec.title}
                      onChange={e => updateSection(sk, { title: e.target.value } as any)}
                      className="w-full px-3 py-2 border text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Текст 1</label>
                    <textarea value={sec.text1}
                      onChange={e => updateSection(sk, { text1: e.target.value } as any)}
                      rows={3} className="w-full px-3 py-2 border text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Текст 2</label>
                    <textarea value={sec.text2}
                      onChange={e => updateSection(sk, { text2: e.target.value } as any)}
                      rows={3} className="w-full px-3 py-2 border text-sm" />
                  </div>
                </div>
                <div>
                  <MediaField
                    label="Медиа (фото или видео)"
                    value={sec.media_url}
                    typeValue={sec.media_type}
                    section={sk}
                    onUrlChange={v => updateSection(sk, { media_url: v } as any)}
                    onTypeChange={v => updateSection(sk, { media_type: v } as any)}
                    onFileUpload={url => updateSection(sk, { media_url: url } as any)}
                  />
                </div>
              </div>
              <SaveBtn section={sk} />
            </section>
          );
        })}

        {/* Closing */}
        <section className="border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-playfair-display)' }}>Завершающая цитата</h2>
          <textarea value={content.closing.text}
            onChange={e => updateSection('closing', { text: e.target.value })}
            rows={2} className="w-full px-3 py-2 border text-sm" />
          <SaveBtn section="closing" />
        </section>

        {/* CTA */}
        <section className="border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-playfair-display)' }}>Блок призыва к действию</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Вопрос</label>
              <input type="text" value={content.cta.question}
                onChange={e => updateSection('cta', { question: e.target.value })}
                className="w-full px-3 py-2 border text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Текст</label>
              <input type="text" value={content.cta.text}
                onChange={e => updateSection('cta', { text: e.target.value })}
                className="w-full px-3 py-2 border text-sm" />
            </div>
            <div>
              <label className="block text-sm mb-1">Текст кнопки</label>
              <input type="text" value={content.cta.button_label}
                onChange={e => updateSection('cta', { button_label: e.target.value })}
                className="w-full px-3 py-2 border text-sm" />
            </div>
          </div>
          <SaveBtn section="cta" />
        </section>
      </div>
    </div>
  );
}

export default function EditCarePage() {
  return (
    <AdminProtected permission="content.edit">
      <EditCare />
    </AdminProtected>
  );
}
