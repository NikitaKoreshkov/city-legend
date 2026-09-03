'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface FilterOption {
  id: number;
  filter_id: number;
  value: string;
  sort_order: number;
}

interface Filter {
  id: number;
  category_id: number;
  name: string;
  type: 'checkbox' | 'range' | 'text';
  sort_order: number;
  options: FilterOption[];
}

export default function EditFilters() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [editingFilter, setEditingFilter] = useState<Filter | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategoryId) {
      loadFilters();
    } else {
      setFilters([]);
    }
  }, [selectedCategoryId]);

  const loadCategories = async () => {
    try {
      const response = await fetch('/api/admin/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFilters = async () => {
    if (!selectedCategoryId) return;
    
    try {
      const response = await fetch(`/api/admin/filters?category_id=${selectedCategoryId}`);
      if (response.ok) {
        const data = await response.json();
        setFilters(data.filters || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки фильтров:', error);
    }
  };

  const handleSaveFilter = async (filter: Partial<Filter>) => {
    try {
      const method = filter.id ? 'PUT' : 'POST';
      const response = await fetch('/api/admin/filters', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filter, category_id: selectedCategoryId }),
      });

      if (response.ok) {
        setMessage('Фильтр сохранен');
        setShowFilterForm(false);
        setEditingFilter(null);
        loadFilters();
      } else {
        setMessage('Ошибка сохранения фильтра');
      }
    } catch (error) {
      setMessage('Ошибка сохранения фильтра');
    }
  };

  const handleDeleteFilter = async (id: number) => {
    if (!confirm('Удалить фильтр?')) return;

    try {
      const response = await fetch(`/api/admin/filters?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        setMessage('Фильтр удален');
        loadFilters();
      }
    } catch (error) {
      setMessage('Ошибка удаления');
    }
  };

  const handleSaveOption = async (filterId: number, option: Partial<FilterOption>) => {
    try {
      const method = option.id ? 'PUT' : 'POST';
      const response = await fetch('/api/admin/filter-options', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...option, filter_id: filterId }),
      });

      if (response.ok) {
        setMessage('Опция сохранена');
        loadFilters();
      } else {
        setMessage('Ошибка сохранения опции');
      }
    } catch (error) {
      setMessage('Ошибка сохранения опции');
    }
  };

  const handleDeleteOption = async (optionId: number) => {
    if (!confirm('Удалить опцию?')) return;

    try {
      const response = await fetch(`/api/admin/filter-options?id=${optionId}`, { method: 'DELETE' });
      if (response.ok) {
        setMessage('Опция удалена');
        loadFilters();
      }
    } catch (error) {
      setMessage('Ошибка удаления');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Загрузка...
        </p>
      </div>
    );
  }

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 py-6">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              Управление фильтрами
            </h1>
            <Link href="/admin" className="px-4 py-2 border border-gray-300 hover:bg-gray-100">
              ← Назад
            </Link>
          </div>

          {message && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 text-sm">
              {message}
            </div>
          )}
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Выбор категории */}
        <div className="max-w-md mb-8">
          <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Выберите категорию:
          </label>
          <select
            value={selectedCategoryId || ''}
            onChange={(e) => setSelectedCategoryId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full px-4 py-2 border border-gray-300 focus:outline-none focus:border-black"
          >
            <option value="">-- Выберите категорию --</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Список фильтров */}
        {selectedCategoryId && (
          <div className="max-w-4xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                Фильтры для "{selectedCategory?.name}" ({filters.length})
              </h2>
              <button
                onClick={() => {
                  setEditingFilter(null);
                  setShowFilterForm(true);
                }}
                className="px-4 py-2 bg-black text-white hover:bg-gray-800"
              >
                + Добавить фильтр
              </button>
            </div>

            {filters.length === 0 ? (
              <p className="text-gray-500 text-sm">Нет фильтров для этой категории</p>
            ) : (
              <div className="space-y-6">
                {filters.map((filter) => (
                  <div key={filter.id} className="border border-gray-200 p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold">{filter.name}</h3>
                        <p className="text-sm text-gray-500">
                          Тип: {filter.type === 'checkbox' ? 'Чекбоксы' : filter.type === 'range' ? 'Диапазон' : 'Текст'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingFilter(filter);
                            setShowFilterForm(true);
                          }}
                          className="px-3 py-1 text-sm border border-black hover:bg-black hover:text-white"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDeleteFilter(filter.id)}
                          className="px-3 py-1 text-sm border border-red-500 text-red-500 hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>

                    {/* Опции для чекбоксов */}
                    {filter.type === 'checkbox' && (
                      <div className="mt-4 pl-6 border-l-2 border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-bold text-sm">Опции ({filter.options.length})</h4>
                          <button
                            onClick={() => {
                              const value = prompt('Введите значение опции:');
                              if (value) {
                                handleSaveOption(filter.id, { value, sort_order: 0 });
                              }
                            }}
                            className="px-3 py-1 text-xs border border-gray-400 hover:bg-gray-100"
                          >
                            + Добавить опцию
                          </button>
                        </div>
                        
                        {filter.options.length === 0 ? (
                          <p className="text-sm text-gray-500">Нет опций</p>
                        ) : (
                          <div className="space-y-2">
                            {filter.options.map((option) => (
                              <div key={option.id} className="flex justify-between items-center text-sm bg-gray-50 p-2">
                                <span>{option.value}</span>
                                <button
                                  onClick={() => handleDeleteOption(option.id)}
                                  className="text-red-600 hover:underline"
                                >
                                  Удалить
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно фильтра */}
      {showFilterForm && (
        <FilterFormModal
          show={showFilterForm}
          filter={editingFilter}
          onSave={handleSaveFilter}
          onClose={() => {
            setShowFilterForm(false);
            setEditingFilter(null);
          }}
        />
      )}
    </div>
  );
}

// Модальное окно фильтра
function FilterFormModal({
  show,
  filter,
  onSave,
  onClose,
}: {
  show: boolean;
  filter: Filter | null;
  onSave: (filter: Partial<Filter>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: filter?.name || '',
    type: filter?.type || 'checkbox' as 'checkbox' | 'range' | 'text',
    sort_order: filter?.sort_order || 0,
  });

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 max-w-lg w-full">
        <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
          {filter ? 'Редактировать фильтр' : 'Добавить фильтр'}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Название фильтра *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 border"
              placeholder="Например: Цвет"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Тип фильтра *</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              className="w-full px-4 py-2 border"
            >
              <option value="checkbox">Чекбоксы (несколько значений)</option>
              <option value="range">Диапазон (мин/макс)</option>
              <option value="text">Текстовый ввод</option>
            </select>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              onClick={() => onSave({ ...form, id: filter?.id })}
              className="flex-1 py-3 bg-black text-white hover:bg-gray-800"
            >
              Сохранить
            </button>
            <button
              onClick={onClose}
              className="px-8 py-3 border border-gray-300 hover:bg-gray-100"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

