'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AuctionCard from '../components/AuctionCard';
import Footer from '../components/Footer';
import { catalogAvailabilityLine } from '@/lib/stockDisplay';
import { listingPriceFromAuction } from '@/lib/productVariants';

export const dynamic = 'force-dynamic';

interface Auction {
  id: number;
  name: string;
  additional_info?: string;
  starting_price: string;
  compare_at_price?: string | null;
  auction_dates?: string; // Срок проведения аукциона
  images: string[];
  filter_values?: { [key: string]: any };
  /** Средний рейтинг отзывов (1–5), с API каталога */
  review_avg?: number | null;
  /** Число отзывов с привязкой к лоту */
  review_count?: number | null;
  inventory_qty?: number | null;
  reserved_qty?: number | null;
  product_variants?: unknown;
}

interface Filter {
  id: number;
  name: string;
  type: 'checkbox' | 'range' | 'text';
  options?: Array<{ id: number; value: string }>;
}

function AuctionsPageContent() {
  const searchParams = useSearchParams();
  const category = searchParams.get('category');
  
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isFiltersAnimating, setIsFiltersAnimating] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isSortAnimating, setIsSortAnimating] = useState(false);
  const [expandedFilters, setExpandedFilters] = useState<Set<string>>(new Set());
  const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(new Set());
  const [availableSubcategories, setAvailableSubcategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('relevance');
  const ITEMS_PER_PAGE = 22;
  
  // Новая система фильтров
  const [availableFilters, setAvailableFilters] = useState<Filter[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<{ [key: number]: any }>({});
  
  // Состояние для категорий из БД
  const [categories, setCategories] = useState<Array<{ id: number; name: string; slug: string; image_url: string | null; sort_order: number }>>([]);

  const [cabinetLoggedIn, setCabinetLoggedIn] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        const me = await meRes.json();
        if (cancelled) return;
        if (!me?.user) {
          setCabinetLoggedIn(false);
          setFavoriteIds(new Set());
          return;
        }
        setCabinetLoggedIn(true);
        const favRes = await fetch('/api/cabinet/favorites', { credentials: 'include' });
        if (cancelled || favRes.status !== 200) return;
        const fav = await favRes.json();
        setFavoriteIds(new Set(Array.isArray(fav.ids) ? fav.ids : []));
      } catch {
        if (!cancelled) {
          setCabinetLoggedIn(false);
          setFavoriteIds(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = useCallback(async (auctionId: number) => {
    if (!cabinetLoggedIn) {
      window.dispatchEvent(new CustomEvent('openCabinetPanel'));
      return;
    }
    let was = false;
    setFavoriteIds((prev) => {
      was = prev.has(auctionId);
      const n = new Set(prev);
      if (was) n.delete(auctionId);
      else n.add(auctionId);
      return n;
    });
    try {
      const res = await fetch('/api/cabinet/favorites', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId }),
      });
      const j = await res.json();
      if (res.ok && typeof j.favored === 'boolean') {
        setFavoriteIds((prev) => {
          const n = new Set(prev);
          if (j.favored) n.add(auctionId);
          else n.delete(auctionId);
          return n;
        });
      } else {
        setFavoriteIds((prev) => {
          const n = new Set(prev);
          if (was) n.add(auctionId);
          else n.delete(auctionId);
          return n;
        });
      }
    } catch {
      setFavoriteIds((prev) => {
        const n = new Set(prev);
        if (was) n.add(auctionId);
        else n.delete(auctionId);
        return n;
      });
    }
  }, [cabinetLoggedIn]);

  // Загружаем категории из БД
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        if (data.categories) {
          setCategories(data.categories);
        }
      } catch (error) {
        console.error('Ошибка при загрузке категорий:', error);
      }
    };
    fetchCategories();
  }, []);

  const fetchAuctions = async (offset = 0, categoryParam: string | null = null) => {
    try {
      const url = categoryParam 
        ? `/api/auctions?offset=${offset}&limit=${ITEMS_PER_PAGE}&category=${encodeURIComponent(categoryParam)}`
        : `/api/auctions?offset=${offset}&limit=${ITEMS_PER_PAGE}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (offset === 0) {
        setAuctions(data.auctions || []);
        setTotalCount(data.total || 0);
        // Сохраняем подкатегории для фильтров
        if (data.subcategories) {
          setAvailableSubcategories(data.subcategories);
        } else {
          setAvailableSubcategories([]);
        }
      } else {
        setAuctions(prev => [...prev, ...(data.auctions || [])]);
      }
      
      setHasMore(data.hasMore || false);
    } catch (error) {
      console.error('Ошибка при загрузке аукционов:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Функция для парсинга цены из строки
  const parsePrice = (priceString: string): number => {
    // Удаляем все нецифровые символы и преобразуем в число
    const numbers = priceString.replace(/[^0-9]/g, '');
    return parseInt(numbers, 10) || 0;
  };

  // Функция проверки соответствия лота фильтрам
  const matchesFilters = (auction: Auction): boolean => {
    // Если нет выбранных фильтров, показываем все
    if (Object.keys(selectedFilters).length === 0) {
      return true;
    }

    console.log('🔍 Проверка лота:', auction.name, {
      selectedFilters,
      auctionFilterValues: auction.filter_values,
    });

    // Проверяем каждый выбранный фильтр
    for (const [filterIdStr, filterValue] of Object.entries(selectedFilters)) {
      const filterId = parseInt(filterIdStr);
      const filter = availableFilters.find(f => f.id === filterId);
      
      if (!filter) continue;

      const auctionValue = auction.filter_values?.[filterId];

      // Чекбоксы - хотя бы одно значение должно совпадать
      if (filter.type === 'checkbox') {
        if (!filterValue || filterValue.length === 0) continue;
        
        if (!auctionValue || !Array.isArray(auctionValue)) {
          console.log('❌ У лота нет значений для фильтра:', filter.name);
          return false; // У лота нет значений этого фильтра
        }

        // Проверяем, есть ли пересечение выбранных значений с значениями лота
        const hasMatch = filterValue.some((selectedVal: string) => 
          auctionValue.includes(selectedVal)
        );
        
        if (!hasMatch) {
          console.log('❌ Не прошел чекбокс фильтр:', filter.name);
          return false;
        }
      }

      // Диапазон - проверяем min/max
      if (filter.type === 'range') {
        const min = filterValue?.min ? parseFloat(filterValue.min) : null;
        const max = filterValue?.max ? parseFloat(filterValue.max) : null;

        if (min === null && max === null) continue;

        const auctionMin = auctionValue?.min ? parseFloat(auctionValue.min) : null;
        const auctionMax = auctionValue?.max ? parseFloat(auctionValue.max) : null;

        // Если у лота нет значений, пропускаем
        if (auctionMin === null && auctionMax === null) {
          return false;
        }

        // Проверяем пересечение диапазонов
        if (min !== null && auctionMax !== null && auctionMax < min) {
          return false;
        }
        if (max !== null && auctionMin !== null && auctionMin > max) {
          return false;
        }
      }

      // Текст - поиск подстроки (регистронезависимый)
      if (filter.type === 'text') {
        if (!filterValue || filterValue.trim() === '') continue;

        if (!auctionValue || typeof auctionValue !== 'string') {
          return false;
        }

        const searchLower = filterValue.toLowerCase();
        const valueLower = auctionValue.toLowerCase();
        
        if (!valueLower.includes(searchLower)) {
          return false;
        }
      }
    }

    console.log('✅ Лот прошел все фильтры');
    return true;
  };

  // Сортировка аукционов на клиенте
  const sortedAuctions = [...auctions]
    .filter(matchesFilters) // Сначала фильтруем
    .sort((a, b) => {
      if (sortBy === 'price-low') {
        return parsePrice(a.starting_price) - parsePrice(b.starting_price);
      } else if (sortBy === 'price-high') {
        return parsePrice(b.starting_price) - parsePrice(a.starting_price);
      } else {
        // Релевантность: лучшие по средней оценке, затем по числу отзывов
        const av = Number(a.review_avg ?? 0);
        const bv = Number(b.review_avg ?? 0);
        const ac = Number(a.review_count ?? 0);
        const bc = Number(b.review_count ?? 0);
        if (bv !== av) return bv - av;
        if (bc !== ac) return bc - ac;
        return a.id - b.id;
      }
    });

  // Логируем результат фильтрации
  console.log('📦 Всего лотов:', auctions.length, '→ После фильтрации:', sortedAuctions.length);

  // Загрузка фильтров для категории
  const fetchFilters = async (categoryParam: string | null) => {
    if (!categoryParam) {
      setAvailableFilters([]);
      return;
    }

    try {
      const response = await fetch(`/api/filters?category=${encodeURIComponent(categoryParam)}`);
      const data = await response.json();
      setAvailableFilters(data.filters || []);
    } catch (error) {
      console.error('Ошибка при загрузке фильтров:', error);
      setAvailableFilters([]);
    }
  };

  useEffect(() => {
    // Загружаем аукционы при изменении категории
    setLoading(true);
    fetchAuctions(0, category); // Всегда загружаем с relevance, сортировка будет на клиенте
    fetchFilters(category); // Загружаем фильтры
  }, [category]);

  // Логирование при изменении выбранных фильтров
  useEffect(() => {
    console.log('🎯 Выбранные фильтры изменились:', selectedFilters);
  }, [selectedFilters]);

  // Закрытие панели сортировки при клике вне её
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isSortOpen && !target.closest('.sort-panel-container')) {
        setIsSortOpen(false);
      }
    };

    if (isSortOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSortOpen]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchAuctions(auctions.length, category);
    // После загрузки новые элементы автоматически отсортируются через sortedAuctions
  };

  // Функция для определения размера карточки на основе индекса
  const getCardSize = (index: number): 'normal' | 'large' => {
    // Паттерн: 6 обычных, 2 больших, повторяется
    const patternIndex = index % 8; // 6 + 2 = 8
    
    if (patternIndex < 6) {
      // Первые 6 - обычные
      return 'normal';
    } else {
      // Следующие 2 - большие
      return 'large';
    }
  };

  // Функция для группировки аукционов по паттерну
  const groupAuctions = () => {
    const groups: { items: Auction[]; layout: 'grid' | 'two-large' }[] = [];
    
    if (sortedAuctions.length === 0) return groups;

    let i = 0;
    while (i < sortedAuctions.length) {
      const patternIndex = i % 8;
      
      if (patternIndex < 6) {
        // Первые 6 - обычная сетка
        const endIndex = Math.min(i + (6 - patternIndex), sortedAuctions.length);
        groups.push({
          items: sortedAuctions.slice(i, endIndex),
          layout: 'grid'
        });
        i = endIndex;
      } else {
        // Следующие 2 - большие
        const endIndex = Math.min(i + (8 - patternIndex), sortedAuctions.length);
        groups.push({
          items: sortedAuctions.slice(i, endIndex),
          layout: 'two-large'
        });
        i = endIndex;
      }
    }

    return groups;
  };

  // Получаем название категории из БД
  const getCategoryName = () => {
    if (!category) return 'Каталог';
    const foundCategory = categories.find(cat => cat.slug === category);
    return foundCategory ? foundCategory.name : 'Каталог';
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

  const auctionGroups = groupAuctions();

  return (
    <div className="w-full bg-white">
      {/* Аккуратный текст по центру - как на главной странице */}
      <section className="w-full bg-white pt-32 sm:pt-32 md:pt-40 pb-12 sm:pb-16 md:pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <p 
              className="text-sm sm:text-base md:text-lg leading-relaxed text-center"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: 'var(--color-classic-black)',
                fontWeight: 400,
                letterSpacing: '0.05em',
                lineHeight: '1.6',
              }}
            >
              {getCategoryName()}
            </p>
          </div>
        </div>
      </section>

      {/* Блок с текстом и панелькой в стиле Loro Piana */}
      <section className="w-full bg-white py-8 sm:py-10 md:py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            {/* Текст описания */}
            <div className="text-center mb-6">
              <p
                className="text-sm sm:text-base leading-relaxed"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#0b2a24',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  lineHeight: '1.6',
                }}
              >
                Подборка украшений и аксессуаров City Legend — серьги, браслеты, колье, кольца и другие аксессуары.{'\n\n'}Оформление заказа онлайн. По вопросам размера, наличия и доставки свяжитесь с нами — поможем с выбором и сопровождением заказа.
              </p>
            </div>

            {/* Горизонтальная линия */}
            <div className="border-b border-gray-200 mb-6"></div>

            {/* Панелька с информацией */}
            <div className="flex items-center justify-between text-sm">
              {/* Слева - количество проектов */}
              <div
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#0b2a24',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                }}
              >
                Изделия ({sortedAuctions.length})
              </div>

              {/* По центру - Фильтры */}
              <button
                onClick={() => {
                  if (!isFiltersOpen) {
                    setIsFiltersOpen(true);
                    // Небольшая задержка для применения начального состояния перед анимацией
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        setIsFiltersAnimating(true);
                      });
                    });
                  } else {
                    setIsFiltersAnimating(false);
                    setTimeout(() => setIsFiltersOpen(false), 400);
                  }
                }}
                className="flex items-center gap-2 cursor-pointer filter-button"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#0b2a24',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="4" y1="6" x2="20" y2="6"></line>
                  <line x1="4" y1="12" x2="20" y2="12"></line>
                  <line x1="4" y1="18" x2="20" y2="18"></line>
                  <circle cx="8" cy="6" r="1.5" fill="currentColor"></circle>
                  <circle cx="16" cy="12" r="1.5" fill="currentColor"></circle>
                  <circle cx="12" cy="18" r="1.5" fill="currentColor"></circle>
                </svg>
                <span>Фильтры</span>
              </button>

              {/* Справа - Сортировка */}
              <div className="relative sort-panel-container">
                <button
                onClick={() => {
                  if (!isSortOpen) {
                    setIsSortOpen(true);
                    // Небольшая задержка для применения начального состояния перед анимацией
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        setIsSortAnimating(true);
                      });
                    });
                  } else {
                    setIsSortAnimating(false);
                    setTimeout(() => setIsSortOpen(false), 300);
                  }
                }}
                  className="flex items-center gap-2 cursor-pointer filter-button"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#0b2a24',
                    fontWeight: 400,
                    letterSpacing: '0.02em',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  <span>Сортировать</span>
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    style={{ 
                      transform: isSortOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
                      transition: 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' 
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                {/* Панель сортировки */}
                {isSortOpen && (
                  <div 
                    className={`absolute right-0 top-full mt-2 bg-white border border-gray-200 shadow-lg z-50 sort-panel ${isSortAnimating ? 'sort-panel-enter' : ''}`}
                    style={{ minWidth: '200px' }}
                  >
                    {[
                      { value: 'relevance', label: 'Релевантность' },
                      { value: 'price-low', label: 'Цена - от низкой к высокой' },
                      { value: 'price-high', label: 'Цена - от высокой к низкой' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSortBy(option.value);
                          setIsSortAnimating(false);
                          setTimeout(() => setIsSortOpen(false), 300);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between transition-all duration-200"
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          color: sortBy === option.value ? '#0b2a24' : '#000000',
                          fontSize: '14px',
                          letterSpacing: '0.02em',
                          background: 'none',
                          border: 'none',
                          transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                        }}
                      >
                        <span>{option.label}</span>
                        {sortBy === option.value && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b2a24" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Горизонтальная линия */}
            <div className="border-b border-gray-200 mt-6"></div>
          </div>
        </div>
      </section>

      {/* Боковая панель фильтров */}
      {isFiltersOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Затемнение */}
          <div 
            className={`flex-1 bg-black/20 filters-panel-overlay ${isFiltersAnimating ? 'filters-panel-overlay-enter' : ''}`}
            onClick={() => {
              if (isFiltersAnimating) {
                setIsFiltersAnimating(false);
                setTimeout(() => setIsFiltersOpen(false), 400);
              }
            }}
          ></div>
          
          {/* Панель фильтров */}
          <div 
            className={`w-full max-w-md bg-white overflow-y-auto filters-panel ${isFiltersAnimating ? 'filters-panel-enter' : ''}`}
            style={{ maxHeight: '100vh' }}
          >
            <div className="p-6">
              {/* Заголовок */}
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-2xl"
                  style={{
                    fontFamily: 'var(--font-playfair-display)',
                    color: '#000000',
                    fontWeight: 400,
                  }}
                >
                  Фильтр
                </h2>
                <button
                  onClick={() => {
                    if (isFiltersAnimating) {
                      setIsFiltersAnimating(false);
                      setTimeout(() => setIsFiltersOpen(false), 400);
                    }
                  }}
                  className="w-8 h-8 rounded-full bg-gray-300 hover:bg-gray-400 flex items-center justify-center transition-all duration-300 hover:scale-110"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              {/* Количество проектов и Reset */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                <p
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#000000',
                    fontWeight: 400,
                  }}
                >
                  {sortedAuctions.length} изделий в каталоге
                </p>
                <button
                  onClick={() => {
                    setSelectedSubcategories(new Set());
                    setSelectedFilters({});
                    setExpandedFilters(new Set());
                  }}
                  className="text-sm transition-all duration-200 hover:opacity-70"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#000000',
                    fontWeight: 400,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  Сбросить
                </button>
              </div>

              {/* Категория - Подкатегории */}
              {availableSubcategories.length > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => {
                      const newExpanded = new Set(expandedFilters);
                      if (newExpanded.has('subcategory')) {
                        newExpanded.delete('subcategory');
                      } else {
                        newExpanded.add('subcategory');
                      }
                      setExpandedFilters(newExpanded);
                    }}
                    className="w-full flex items-center justify-between py-3 border-b border-gray-200 filter-button"
                    style={{
                      fontFamily: 'var(--font-playfair-display)',
                      color: '#000000',
                      fontWeight: 400,
                      fontSize: '16px',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid #e5e7eb',
                      paddingBottom: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Подкатегория</span>
                    <span 
                      className="filter-expand-icon"
                      style={{ 
                        fontSize: '20px', 
                        color: '#0b2a24',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        width: '20px',
                        height: '20px',
                        lineHeight: '1',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          display: 'inline-block',
                          opacity: expandedFilters.has('subcategory') ? 0 : 1,
                          transform: expandedFilters.has('subcategory') ? 'rotate(-90deg) scale(0)' : 'rotate(0deg) scale(1)',
                          transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                          pointerEvents: expandedFilters.has('subcategory') ? 'none' : 'auto',
                        }}
                      >
                        +
                      </span>
                      <span
                        style={{
                          position: 'absolute',
                          display: 'inline-block',
                          opacity: expandedFilters.has('subcategory') ? 1 : 0,
                          transform: expandedFilters.has('subcategory') ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0)',
                          transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                          pointerEvents: expandedFilters.has('subcategory') ? 'auto' : 'none',
                        }}
                      >
                        −
                      </span>
                    </span>
                  </button>

                  <div 
                    className="subcategories-list"
                    style={{
                      maxHeight: expandedFilters.has('subcategory') ? '1000px' : '0',
                      opacity: expandedFilters.has('subcategory') ? 1 : 0,
                      paddingTop: expandedFilters.has('subcategory') ? '1rem' : '0',
                      paddingBottom: expandedFilters.has('subcategory') ? '0' : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), padding 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    }}
                  >
                    <div className="space-y-2">
                      {availableSubcategories.map((subcat) => (
                        <label
                          key={subcat}
                          className="flex items-center gap-3 py-2 cursor-pointer filter-checkbox-label"
                          style={{
                            opacity: expandedFilters.has('subcategory') ? 1 : 0,
                            transform: expandedFilters.has('subcategory') ? 'translateY(0)' : 'translateY(-10px)',
                            transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.1s, transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.1s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSubcategories.has(subcat)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedSubcategories);
                              if (e.target.checked) {
                                newSelected.add(subcat);
                              } else {
                                newSelected.delete(subcat);
                              }
                              setSelectedSubcategories(newSelected);
                            }}
                            className="w-4 h-4 border-[#0b2a24] text-[#0b2a24] focus:ring-[#0b2a24]"
                            style={{ accentColor: '#0b2a24' }}
                          />
                          <span
                            className="text-sm transition-colors duration-200"
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              color: '#000000',
                              fontWeight: 400,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#0b2a24';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#000000';
                            }}
                          >
                            {subcat}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Новые фильтры */}
              {availableFilters.map((filter) => (
                <div key={filter.id} className="mb-6">
                  <button
                    onClick={() => {
                      const newExpanded = new Set(expandedFilters);
                      if (newExpanded.has(`filter-${filter.id}`)) {
                        newExpanded.delete(`filter-${filter.id}`);
                      } else {
                        newExpanded.add(`filter-${filter.id}`);
                      }
                      setExpandedFilters(newExpanded);
                    }}
                    className="w-full flex items-center justify-between py-3 border-b border-gray-200 filter-button"
                    style={{
                      fontFamily: 'var(--font-playfair-display)',
                      color: '#000000',
                      fontWeight: 400,
                      fontSize: '16px',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid #e5e7eb',
                      paddingBottom: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{filter.name}</span>
                    <span 
                      className="filter-expand-icon"
                      style={{ 
                        fontSize: '20px', 
                        color: '#0b2a24',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        width: '20px',
                        height: '20px',
                        lineHeight: '1',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          display: 'inline-block',
                          opacity: expandedFilters.has(`filter-${filter.id}`) ? 0 : 1,
                          transform: expandedFilters.has(`filter-${filter.id}`) ? 'rotate(-90deg) scale(0)' : 'rotate(0deg) scale(1)',
                          transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                          pointerEvents: expandedFilters.has(`filter-${filter.id}`) ? 'none' : 'auto',
                        }}
                      >
                        +
                      </span>
                      <span
                        style={{
                          position: 'absolute',
                          display: 'inline-block',
                          opacity: expandedFilters.has(`filter-${filter.id}`) ? 1 : 0,
                          transform: expandedFilters.has(`filter-${filter.id}`) ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0)',
                          transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                          pointerEvents: expandedFilters.has(`filter-${filter.id}`) ? 'auto' : 'none',
                        }}
                      >
                        −
                      </span>
                    </span>
                  </button>

                  <div 
                    className="filter-content"
                    style={{
                      maxHeight: expandedFilters.has(`filter-${filter.id}`) ? '1000px' : '0',
                      opacity: expandedFilters.has(`filter-${filter.id}`) ? 1 : 0,
                      paddingTop: expandedFilters.has(`filter-${filter.id}`) ? '1rem' : '0',
                      paddingBottom: expandedFilters.has(`filter-${filter.id}`) ? '0' : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), padding 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    }}
                  >
                    {/* Чекбоксы */}
                    {filter.type === 'checkbox' && filter.options && (
                      <div className="space-y-2">
                        {filter.options.map((option) => (
                          <label
                            key={option.id}
                            className="flex items-center gap-3 py-2 cursor-pointer filter-checkbox-label"
                            style={{
                              opacity: expandedFilters.has(`filter-${filter.id}`) ? 1 : 0,
                              transform: expandedFilters.has(`filter-${filter.id}`) ? 'translateY(0)' : 'translateY(-10px)',
                              transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.1s, transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.1s',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedFilters[filter.id]?.includes(option.value) || false}
                              onChange={(e) => {
                                const currentValues = selectedFilters[filter.id] || [];
                                const newValues = e.target.checked
                                  ? [...currentValues, option.value]
                                  : currentValues.filter((v: string) => v !== option.value);
                                setSelectedFilters({
                                  ...selectedFilters,
                                  [filter.id]: newValues,
                                });
                              }}
                              className="w-4 h-4 border-[#0b2a24] text-[#0b2a24] focus:ring-[#0b2a24]"
                              style={{ accentColor: '#0b2a24' }}
                            />
                            <span
                              className="text-sm transition-colors duration-200"
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                color: '#000000',
                                fontWeight: 400,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#0b2a24';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#000000';
                              }}
                            >
                              {option.value}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Диапазон */}
                    {filter.type === 'range' && (
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          placeholder="От"
                          value={selectedFilters[filter.id]?.min || ''}
                          onChange={(e) => {
                            const currentValues = selectedFilters[filter.id] || {};
                            setSelectedFilters({
                              ...selectedFilters,
                              [filter.id]: {
                                ...currentValues,
                                min: e.target.value,
                              },
                            });
                          }}
                          className="w-24 px-2 py-1 border text-sm"
                        />
                        <span className="text-sm">—</span>
                        <input
                          type="number"
                          placeholder="До"
                          value={selectedFilters[filter.id]?.max || ''}
                          onChange={(e) => {
                            const currentValues = selectedFilters[filter.id] || {};
                            setSelectedFilters({
                              ...selectedFilters,
                              [filter.id]: {
                                ...currentValues,
                                max: e.target.value,
                              },
                            });
                          }}
                          className="w-24 px-2 py-1 border text-sm"
                        />
                      </div>
                    )}

                    {/* Текст */}
                    {filter.type === 'text' && (
                      <input
                        type="text"
                        placeholder="Введите значение"
                        value={selectedFilters[filter.id] || ''}
                        onChange={(e) => {
                          setSelectedFilters({
                            ...selectedFilters,
                            [filter.id]: e.target.value,
                          });
                        }}
                        className="w-full px-3 py-2 border text-sm"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Кнопка внизу */}
            <div className="sticky bottom-0 p-6 bg-white border-t border-gray-200">
              <button
                onClick={() => {
                  if (isFiltersAnimating) {
                    setIsFiltersAnimating(false);
                    setTimeout(() => setIsFiltersOpen(false), 400);
                  }
                  // Здесь можно применить фильтры
                }}
                className="w-full py-4 text-center show-products-button"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#ffffff',
                  backgroundColor: '#0b2a24',
                  fontWeight: 400,
                  fontSize: '14px',
                  letterSpacing: '0.02em',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Показать {sortedAuctions.length} изделий
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Сетка аукционов */}
      <section className="w-full bg-white pb-12 sm:pb-16 md:pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1600px] mx-auto space-y-8 sm:space-y-10 md:space-y-12">
            {auctionGroups.map((group, groupIndex) => {
              if (group.layout === 'grid') {
                // Сетка из обычных карточек (по 3 в ряд, всего 6 карточек = 2 ряда)
                return (
                  <div
                    key={`grid-${groupIndex}`}
                    className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 md:gap-10"
                  >
                    {group.items.map((auction) => {
                      const lp = listingPriceFromAuction(auction);
                      return (
                      <AuctionCard
                        key={auction.id}
                        id={auction.id.toString()}
                        name={auction.name}
                        additionalInfo={auction.additional_info || undefined}
                        startingPrice={
                          lp.pricePrefix ? `${lp.pricePrefix}${lp.startingPrice}` : lp.startingPrice
                        }
                        compareAtPrice={lp.compareAtPrice}
                        availabilityLine={catalogAvailabilityLine(
                          auction.auction_dates,
                          auction.inventory_qty,
                          auction.reserved_qty
                        )}
                        images={auction.images || []}
                        showFavorite
                        favorited={favoriteIds.has(auction.id)}
                        onFavoriteClick={() => toggleFavorite(auction.id)}
                      />
                    );
                    })}
                  </div>
                );
              } else if (group.layout === 'two-large') {
                // Две большие карточки - каждая занимает половину ширины
                return (
                  <div
                    key={`two-large-${groupIndex}`}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 md:gap-10"
                  >
                    {group.items.map((auction) => {
                      const lp = listingPriceFromAuction(auction);
                      return (
                      <div key={auction.id} className="col-span-1">
                        <AuctionCard
                          id={auction.id.toString()}
                          name={auction.name}
                          additionalInfo={auction.additional_info || undefined}
                          startingPrice={
                            lp.pricePrefix ? `${lp.pricePrefix}${lp.startingPrice}` : lp.startingPrice
                          }
                          compareAtPrice={lp.compareAtPrice}
                          availabilityLine={catalogAvailabilityLine(
                            auction.auction_dates,
                            auction.inventory_qty,
                            auction.reserved_qty
                          )}
                          images={auction.images || []}
                          showFavorite
                          favorited={favoriteIds.has(auction.id)}
                          onFavoriteClick={() => toggleFavorite(auction.id)}
                        />
                      </div>
                    );
                    })}
                  </div>
                );
              }
              return null;
            })}
          </div>

          {/* Кнопка "Посмотреть еще" */}
          {hasMore && (
            <div className="flex justify-center mt-12 sm:mt-16 md:mt-20">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-sm sm:text-base relative inline-block cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  fontFamily: 'var(--font-playfair-display)',
                  color: '#000000',
                  fontWeight: 400,
                  letterSpacing: '0.01em',
                }}
              >
                {/* Дефисы по бокам - уменьшаются, край у текста остается на месте */}
                <span className="inline-block origin-right scale-x-100 group-hover:scale-x-0 transition-transform duration-700 ease-in-out">– </span>
                <span>
                  {loadingMore 
                    ? 'Загрузка...' 
                    : `Посмотреть еще (${totalCount - auctions.length})`
                  }
                </span>
                <span className="inline-block origin-left scale-x-100 group-hover:scale-x-0 transition-transform duration-700 ease-in-out"> –</span>
                
                {/* Линия под текстом - появляется при наведении на текст */}
                <span 
                  className="absolute bottom-0 left-0 right-0 h-px bg-black origin-center scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-in-out"
                />
              </button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default function AuctionsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Загрузка...</div>}>
      <AuctionsPageContent />
    </Suspense>
  );
}

