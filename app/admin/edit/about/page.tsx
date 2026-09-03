'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface HeroSection {
  image: string;
  subtitle: string;
  title: string;
  description: string;
}

interface PhilosophySection {
  title: string;
  quote: string;
  author: string;
}

interface ValuesSection {
  title: string;
  subtitle: string;
  image: string;
  values: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
}

export default function EditAbout() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Hero Section
  const [hero, setHero] = useState<HeroSection>({
    image: '/1.jpg',
    subtitle: 'Est. 2018',
    title: 'Искусство\nэксклюзивных\nколлекций',
    description: 'Hwang\'s — первый в России аукционный дом, чья экспертиза определяет вершину частных коллекций и активов. Мы создаем пространство, где встречаются истинные ценители прекрасного и уникальные произведения искусства.',
  });

  // Philosophy
  const [philosophy, setPhilosophy] = useState<PhilosophySection>({
    title: 'Наша философия',
    quote: '«Мы не просто продаем предметы роскоши.\nМы создаем наследие и сохраняем культурную ценность\nдля будущих поколений коллекционеров»',
    author: 'Основатель Hwang\'s',
  });

  // Values
  const [values, setValues] = useState<ValuesSection>({
    title: 'Наши ценности',
    subtitle: 'Принципы,\nкоторыми мы живем',
    image: '/2.jpg',
    values: [
      {
        icon: '✦',
        title: 'Эксклюзивность',
        description: 'Каждый лот в нашей коллекции — уникальное произведение искусства или предмет роскоши, тщательно отобранный нашими экспертами.',
      },
      {
        icon: '◆',
        title: 'Конфиденциальность',
        description: 'Мы гарантируем полную анонимность наших клиентов и сохранность информации о всех сделках.',
      },
      {
        icon: '✧',
        title: 'Экспертиза',
        description: 'Многоуровневая аутентификация и оценка каждого лота ведущими специалистами мирового уровня.',
      },
      {
        icon: '◈',
        title: 'Наследие',
        description: 'Мы работаем с объектами, которые не подвластны времени, обеспечивая их переход от поколения к поколению.',
      },
    ],
  });

  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetch('/api/admin/about');
        if (response.ok) {
          const data = await response.json();
          
          if (data.hero) setHero(data.hero);
          if (data.philosophy) setPhilosophy(data.philosophy);
          if (data.values) setValues(data.values);
        } else if (response.status === 401) {
          router.push('/admin/login');
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
    });

    if (!response.ok) {
      throw new Error('Ошибка загрузки файла');
    }

    const data = await response.json();
    return data.url;
  };

  const saveSection = async (section: string, data: any) => {
    const response = await fetch('/api/admin/about', {
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
      await Promise.all([
        saveSection('hero', hero),
        saveSection('philosophy', philosophy),
        saveSection('values', values),
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
              Редактирование страницы О нас
            </h1>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="px-6 py-2 bg-black text-white hover:bg-gray-800 disabled:bg-gray-400"
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
          
          {/* 1. Hero Section */}
          <section className="border border-gray-200 p-6">
            <h2
              className="text-xl mb-6"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              1. Главное фото и текст
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Главное фото
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    if (e.target.files?.[0]) {
                      const url = await handleFileUpload(e.target.files[0]);
                      setHero({ ...hero, image: url });
                    }
                  }}
                  className="mb-2"
                />
                <img src={hero.image} alt="" className="w-32 h-32 object-cover" />
              </div>

              <div>
                <label className="block text-sm mb-2">Подзаголовок (Est. 2018)</label>
                <input
                  type="text"
                  value={hero.subtitle}
                  onChange={(e) => setHero({ ...hero, subtitle: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Заголовок (можно с \n для переносов)</label>
                <textarea
                  value={hero.title}
                  onChange={(e) => setHero({ ...hero, title: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Описание</label>
                <textarea
                  value={hero.description}
                  onChange={(e) => setHero({ ...hero, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border"
                />
              </div>
            </div>
          </section>

          {/* 2. Philosophy */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              2. Наша философия
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Заголовок секции</label>
                <input
                  type="text"
                  value={philosophy.title}
                  onChange={(e) => setPhilosophy({ ...philosophy, title: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Цитата</label>
                <textarea
                  value={philosophy.quote}
                  onChange={(e) => setPhilosophy({ ...philosophy, quote: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Автор</label>
                <input
                  type="text"
                  value={philosophy.author}
                  onChange={(e) => setPhilosophy({ ...philosophy, author: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>
            </div>
          </section>

          {/* 3. Values */}
          <section className="border border-gray-200 p-6">
            <h2 className="text-xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              3. Наши ценности
            </h2>
            
            <div className="space-y-6 mb-6">
              <div>
                <label className="block text-sm mb-2">Фото</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    if (e.target.files?.[0]) {
                      const url = await handleFileUpload(e.target.files[0]);
                      setValues({ ...values, image: url });
                    }
                  }}
                  className="mb-2"
                />
                <img src={values.image} alt="" className="w-32 h-32 object-cover" />
              </div>

              <div>
                <label className="block text-sm mb-2">Заголовок секции</label>
                <input
                  type="text"
                  value={values.title}
                  onChange={(e) => setValues({ ...values, title: e.target.value })}
                  className="w-full px-4 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Подзаголовок</label>
                <textarea
                  value={values.subtitle}
                  onChange={(e) => setValues({ ...values, subtitle: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border"
                />
              </div>
            </div>

            <h3 className="font-bold mb-4">Ценности</h3>
            {values.values.map((value, index) => (
              <div key={index} className="mb-6 pb-6 border-b last:border-b-0">
                <h4 className="font-bold mb-3">Ценность {index + 1}</h4>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Иконка</label>
                    <input
                      type="text"
                      value={value.icon}
                      onChange={(e) => {
                        const newValues = [...values.values];
                        newValues[index].icon = e.target.value;
                        setValues({ ...values, values: newValues });
                      }}
                      className="w-full px-4 py-2 border"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1">Название</label>
                    <input
                      type="text"
                      value={value.title}
                      onChange={(e) => {
                        const newValues = [...values.values];
                        newValues[index].title = e.target.value;
                        setValues({ ...values, values: newValues });
                      }}
                      className="w-full px-4 py-2 border"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1">Описание</label>
                    <textarea
                      value={value.description}
                      onChange={(e) => {
                        const newValues = [...values.values];
                        newValues[index].description = e.target.value;
                        setValues({ ...values, values: newValues });
                      }}
                      rows={3}
                      className="w-full px-4 py-2 border"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const newValues = values.values.filter((_, i) => i !== index);
                      setValues({ ...values, values: newValues });
                    }}
                    className="px-4 py-2 text-sm border border-red-500 text-red-500 hover:bg-red-50"
                  >
                    Удалить ценность
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                setValues({
                  ...values,
                  values: [...values.values, { icon: '✦', title: '', description: '' }]
                });
              }}
              className="px-4 py-2 border border-black hover:bg-black hover:text-white"
            >
              + Добавить ценность
            </button>
          </section>

        </div>
      </div>
    </div>
  );
}

