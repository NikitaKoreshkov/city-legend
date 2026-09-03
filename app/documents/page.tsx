'use client';

import { useEffect, useState } from 'react';

interface Document {
  id: number;
  title: string;
  file_url: string;
  file_size: string;
  file_type: string;
  document_date: string;
  created_at: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [headerHeight, setHeaderHeight] = useState(120);

  // Получение высоты хедера
  useEffect(() => {
    const updateHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) {
        setHeaderHeight(header.offsetHeight);
      }
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    setTimeout(updateHeaderHeight, 100);

    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  // Загрузка документов с debounce для поиска
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (searchQuery) params.append('search', searchQuery);
        if (sortOrder) params.append('sort', sortOrder);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const response = await fetch(`/api/documents?${params.toString()}`);
        const data = await response.json();
        
        if (response.ok) {
          setDocuments(data.documents || []);
        } else {
          console.error('Ошибка загрузки документов:', data.error);
        }
      } catch (error) {
        console.error('Ошибка при загрузке документов:', error);
      } finally {
        setLoading(false);
      }
    };

    const delaySearch = setTimeout(() => {
      fetchDocuments();
    }, 300); // Задержка 300мс после окончания ввода

    return () => clearTimeout(delaySearch);
  }, [searchQuery, sortOrder, startDate, endDate]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleDownload = (fileUrl: string, fileName: string) => {
    // Создаем временную ссылку для скачивания
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName; // Это заставит браузер скачать файл вместо открытия
    link.target = '_blank';
    
    // Добавляем ссылку в DOM, кликаем и удаляем
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setSortOrder('desc');
  };

  return (
    <div className="w-full bg-white min-h-screen">
      {/* Hero секция */}
      <section 
        className="w-full bg-white pt-12 sm:pt-16 md:pt-20 pb-8 sm:pb-10 md:pb-12"
        style={{ marginTop: `${headerHeight}px` }}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1600px] mx-auto">
            {/* Breadcrumb */}
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <a 
                  href="/"
                  className="hover:opacity-70 transition-opacity"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#666666',
                    letterSpacing: '0.02em'
                  }}
                >
                  Главная
                </a>
                <span style={{ color: '#666666' }}>/</span>
                <span 
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#000000',
                    letterSpacing: '0.02em'
                  }}
                >
                  Документы
                </span>
              </div>
            </div>

            {/* Заголовок */}
            <div className="mb-8 sm:mb-10">
              <h1
                className="text-3xl sm:text-4xl md:text-5xl mb-4"
                style={{
                  fontFamily: 'var(--font-playfair-display)',
                  color: '#000000',
                  fontWeight: 400,
                  letterSpacing: '0.01em',
                  lineHeight: '1.2',
                }}
              >
                Документы
              </h1>
            </div>

            {/* Фильтры и поиск */}
            <div className="mb-8 sm:mb-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
                {/* Поиск */}
                <div className="lg:col-span-5">
                  <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Поиск документов"
                        className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-gray-500 transition-colors"
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          letterSpacing: '0.02em',
                        }}
                      />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg 
                        width="20" 
                        height="20" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="1.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        style={{ color: '#5c1a1a', opacity: 0.5 }}
                      >
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Период */}
                <div className="lg:col-span-5">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="px-4 py-3 border border-gray-300 focus:outline-none focus:border-gray-500 transition-colors"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '14px',
                        letterSpacing: '0.02em',
                      }}
                    />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="px-4 py-3 border border-gray-300 focus:outline-none focus:border-gray-500 transition-colors"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '14px',
                        letterSpacing: '0.02em',
                      }}
                    />
                  </div>
                </div>

                {/* Сортировка */}
                <div className="lg:col-span-2">
                  <button
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    className="w-full px-4 py-3 border border-gray-300 hover:border-gray-500 transition-colors flex items-center justify-center gap-2"
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      letterSpacing: '0.02em',
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transform: sortOrder === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s ease',
                      }}
                    >
                      <path d="M12 5v14M19 12l-7 7-7-7"/>
                    </svg>
                    {sortOrder === 'desc' ? 'Новые' : 'Старые'}
                  </button>
                </div>
              </div>

              {/* Очистить фильтры */}
              {(searchQuery || startDate || endDate || sortOrder !== 'desc') && (
                <div className="mt-4">
                  <button
                    onClick={clearFilters}
                    className="text-sm hover:opacity-70 transition-opacity"
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      color: '#666666',
                      letterSpacing: '0.02em',
                    }}
                  >
                    Очистить фильтры
                  </button>
                </div>
              )}
            </div>

            {/* Счетчик документов */}
            <div className="mb-6">
              <p
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#666666',
                  letterSpacing: '0.05em',
                }}
              >
                Всего <span style={{ color: '#5c1a1a', fontWeight: 600 }}>{documents.length}</span>
              </p>
            </div>

            {/* Список документов */}
            {loading ? (
              <div className="py-12 text-center">
                <p
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#666666',
                    letterSpacing: '0.02em',
                  }}
                >
                  Загрузка...
                </p>
              </div>
            ) : documents.length === 0 ? (
              <div className="py-12 text-center">
                <p
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#666666',
                    letterSpacing: '0.02em',
                  }}
                >
                  Документы не найдены
                </p>
              </div>
            ) : (
              <div className="space-y-0 border-t border-gray-200">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleDownload(doc.file_url, doc.title)}
                    className="w-full group border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                    style={{
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid #e5e5e5',
                      padding: 0,
                    }}
                  >
                    <div className="py-6 px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                      {/* Иконка файла */}
                      <div className="sm:col-span-1 flex items-center">
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ color: '#5c1a1a' }}
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                      </div>

                      {/* Название */}
                      <div className="sm:col-span-7">
                        <h3
                          className="text-base sm:text-lg mb-1 group-hover:opacity-70 transition-opacity"
                          style={{
                            fontFamily: 'var(--font-playfair-display)',
                            color: '#000000',
                            fontWeight: 400,
                            letterSpacing: '0.01em',
                            lineHeight: '1.4',
                          }}
                        >
                          {doc.title}
                        </h3>
                      </div>

                      {/* Дата */}
                      <div className="sm:col-span-2 text-left sm:text-right">
                        <p
                          className="text-sm"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: '#666666',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {formatDate(doc.document_date)}
                        </p>
                      </div>

                      {/* Размер и тип */}
                      <div className="sm:col-span-2 text-left sm:text-right">
                        <p
                          className="text-xs uppercase"
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            color: '#5c1a1a',
                            letterSpacing: '0.1em',
                            fontWeight: 600,
                          }}
                        >
                          {doc.file_type} {doc.file_size}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

