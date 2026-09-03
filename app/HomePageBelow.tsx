'use client';

import Link from 'next/link';
import AuctionCard from './components/AuctionCard';
import Footer from './components/Footer';
import { catalogAvailabilityLine } from '@/lib/stockDisplay';
import { listingPriceFromAuction } from '@/lib/productVariants';
import {
  mergeCurated,
  mergeDescription,
  mergePanels,
  mergeHomepageCollections,
  mergeTextImage,
  mergeImperial,
} from '@/lib/homepageMerge';
import { mergeCatalogLabels } from '@/lib/catalogLabels';
import { OptimizedCoverImage } from '@/app/components/home/OptimizedCoverImage';
import { useEffect, useState, useRef } from 'react';

function hasImageSrc(src?: string | null): boolean {
  return Boolean(String(src ?? '').trim());
}

interface Auction {
  id: number;
  name: string;
  additional_info?: string;
  starting_price: string;
  compare_at_price?: string | null;
  auction_dates?: string;
  images: string[];
  inventory_qty?: number | null;
  reserved_qty?: number | null;
  product_variants?: unknown;
}

export default function HomePageBelow({
  initialContent,
  initialFeaturedAuctions,
}: {
  initialContent: Record<string, unknown>;
  initialFeaturedAuctions?: Auction[];
}) {
  const stickyTop = 'var(--cl-header-offset, 120px)';
  const redContainerRef = useRef<HTMLDivElement>(null);
  const panel1Ref = useRef<HTMLDivElement>(null);
  const panel2Ref = useRef<HTMLDivElement>(null);
  const panel3Ref = useRef<HTMLDivElement>(null);
  
  // Состояния для аукционов из БД
  const serverHasFeatured = initialFeaturedAuctions !== undefined;
  const [currentAuctions, setCurrentAuctions] = useState<Auction[]>(
    () => initialFeaturedAuctions ?? []
  );
  const [auctionsLoading, setAuctionsLoading] = useState(() => !serverHasFeatured);
  
  const [curated] = useState(() => mergeCurated(initialContent));
  const [catalogLabels] = useState(() => mergeCatalogLabels(initialContent));
  const [description] = useState(() => mergeDescription(initialContent));
  const [panels] = useState(() => mergePanels(initialContent));
  const [collections] = useState(() => mergeHomepageCollections(initialContent));
  const [textImage] = useState(() => mergeTextImage(initialContent));
  const [imperial] = useState(() => mergeImperial(initialContent));

  // Загрузка featured только если нет SSR-данных (обратная совместимость / старый кэш)
  useEffect(() => {
    if (serverHasFeatured) {
      setAuctionsLoading(false);
      return;
    }
    const fetchAuctions = async () => {
      try {
        const response = await fetch('/api/collection?featured=true&limit=4');
        const data = await response.json();
        setCurrentAuctions(data.auctions || []);
      } catch (error) {
        console.error('Ошибка загрузки аукционов:', error);
      } finally {
        setAuctionsLoading(false);
      }
    };
    void fetchAuctions();
  }, [serverHasFeatured]);

  // Исправление overflow на родительских элементах для работы sticky
  useEffect(() => {
    if (redContainerRef.current) {
      // Проверка и исправление overflow на родительских элементах
      let parent = redContainerRef.current.parentElement;
      let level = 0;
      while (parent && level < 5) {
        const parentStyle = window.getComputedStyle(parent);
        
        // Исправляем overflow, который блокирует sticky
        if (parentStyle.overflow !== 'visible' && parentStyle.overflowY !== 'visible') {
          (parent as HTMLElement).style.overflowY = 'visible';
          (parent as HTMLElement).style.overflow = 'visible';
        }
        
        parent = parent.parentElement;
        level++;
      }
      
      // Устанавливаем minHeight для мобильных устройств
      const updateMinHeight = () => {
        if (redContainerRef.current) {
          if (window.innerWidth < 768) {
            // На мобильных: минимальная высота, чтобы убрать пустое пространство
            // Высота панелей: 200vh + 200vh + 150vh = 550vh, но с отрицательными margin'ами
            // Устанавливаем примерно высоту для скролла панелей без лишнего пространства
            redContainerRef.current.style.minHeight = '350vh';
          } else {
            // На десктопе: стандартная высота
            redContainerRef.current.style.minHeight = '250vh';
          }
        }
      };
      
      updateMinHeight();
      window.addEventListener('resize', updateMinHeight);
      
      return () => {
        window.removeEventListener('resize', updateMinHeight);
      };
    }
  }, []);

  return (
    <div className="relative w-full overflow-x-hidden" style={{ overflowY: 'visible' }}>
      {/* Премиальный текстовый блок */}
      <section className="w-full bg-white pt-16 pb-8 sm:py-10 md:py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <p 
              className="text-sm sm:text-base md:text-lg leading-relaxed text-center whitespace-pre-line"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: 'var(--color-classic-black)',
                fontWeight: 400,
                letterSpacing: '0.05em',
                lineHeight: '1.6',
              }}
            >
              {description.text}
            </p>
          </div>
        </div>
      </section>

      {/* Секция с sticky stacking панелями */}
      <section className="w-full bg-white py-0 sm:py-4 md:py-8 lg:py-10" style={{ overflow: 'visible' }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Большой контейнер с красными границами - НЕ sticky, просто контейнер */}
          <div 
            ref={redContainerRef}
            className="max-w-[1600px] mx-auto bg-white"
            style={{
              paddingTop: '0px',
              paddingBottom: '0px',
              position: 'relative',
              minHeight: '450vh',
              overflow: 'visible',
            }}
          >
          {/* Первая панель - останавливается и больше не двигается */}
          <div style={{ height: '200vh', position: 'relative', overflow: 'visible' }}>
            <div
              ref={panel1Ref}
              className="sticky w-full aspect-[3/4] md:aspect-[16/9]"
              style={{
                top: stickyTop,
                zIndex: 1,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div className="relative w-full h-full overflow-hidden">
                {/* Фоновое изображение */}
                <OptimizedCoverImage
                  src={panels[0]?.image}
                  alt=""
                  sizes="100vw"
                  priority
                />
                
                {/* Градиентный overlay для читаемости */}
                <div 
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.4) 100%)',
                  }}
                />
                
                {/* Дополнительное затемнение на мобильных */}
                <div 
                  className="absolute inset-0 bg-black/40 md:bg-transparent"
                />
                
                {/* Контент */}
                <div className="relative w-full h-full flex items-center justify-center md:justify-start p-6 sm:p-12 md:p-16 lg:p-20 xl:p-24">
                  <div className="max-w-2xl text-center md:text-left w-full px-4 md:px-0 md:ml-[8%]">
                    {/* Подзаголовок - мелко, вразрядку */}
                    <p
                      className="text-[10px] sm:text-xs md:text-sm mb-6 sm:mb-8 text-white/90"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontWeight: 300,
                        letterSpacing: '0.3em',
                        textTransform: 'uppercase',
                        lineHeight: '1.2',
                      }}
                    >
                      {panels[0]?.subtitle || 'ИСКУССТВО ДЕТАЛИ'}
                    </p>
                    
                    {/* Заголовок - крупно, антиква */}
                    <h3 
                      className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl mb-8 sm:mb-10 md:mb-12 text-white leading-[1.1] whitespace-pre-line"
                      style={{
                        fontFamily: 'var(--font-playfair-display)',
                        fontWeight: 400,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {panels[0]?.title || 'ИЗЯЩЕСТВО\nВ КАЖДОЙ ВЕЩИ'}
                    </h3>
                    
                    {/* Текст в кавычках */}
                    <div className="relative">
                      <p 
                        className="text-sm sm:text-base md:text-lg lg:text-xl text-white/95 leading-relaxed md:pl-6 pl-0 md:border-l border-l-0"
                        style={{
                          fontFamily: 'var(--font-playfair-display)',
                          fontWeight: 300,
                          letterSpacing: '0.01em',
                          lineHeight: '1.7',
                          fontStyle: 'italic',
                          borderColor: 'rgba(255,255,255,0.3)',
                        }}
                      >
                        {panels[0]?.quote || '«Мы верим, что аксессуар — это не просто украшение. Это знак внимания к себе и к моменту».'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Вторая панель - поднимается и накладывается на первую */}
          <div style={{ height: '200vh', position: 'relative', overflow: 'visible' }} className="-mt-[250%] md:-mt-[56.25%]">
            <div
              ref={panel2Ref}
              className="sticky w-full aspect-[3/4] md:aspect-[16/9]"
              style={{
                top: stickyTop,
                zIndex: 2,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div className="relative w-full h-full overflow-hidden">
                {/* Фоновое изображение */}
                <OptimizedCoverImage
                  src={panels[1]?.image}
                  alt=""
                  sizes="100vw"
                />
                
                {/* Градиентный overlay для читаемости */}
                <div 
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(225deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.3) 100%)',
                  }}
                />
                
                {/* Дополнительное затемнение на мобильных */}
                <div 
                  className="absolute inset-0 bg-black/40 md:bg-transparent"
                />
                
                {/* Контент - справа */}
                <div className="relative w-full h-full flex items-center justify-center md:justify-end p-6 sm:p-12 md:p-16 lg:p-20 xl:p-24">
                  <div className="max-w-2xl w-auto md:w-full px-4 md:px-0 mx-auto md:mx-0 md:mr-[8%]">
                    {/* Подзаголовок - мелко, вразрядку */}
                    <p
                      className="text-[10px] sm:text-xs md:text-sm mb-6 sm:mb-8 text-white/90 text-center md:text-right"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontWeight: 300,
                        letterSpacing: '0.3em',
                        textTransform: 'uppercase',
                        lineHeight: '1.2',
                      }}
                    >
                      {panels[1]?.subtitle || 'КУРАТОРСКИЙ ВЫБОР'}
                    </p>
                    
                    {/* Заголовок - крупно, антиква */}
                    <h3 
                      className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl mb-8 sm:mb-10 md:mb-12 text-white leading-[1.1] whitespace-pre-line text-center md:text-right"
                      style={{
                        fontFamily: 'var(--font-playfair-display)',
                        fontWeight: 400,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {panels[1]?.title || 'КОЛЛЕКЦИЯ\nС ХАРАКТЕРОМ'}
                    </h3>
                    
                    {/* Текст в кавычках */}
                    <div className="relative">
                      <p 
                        className="text-sm sm:text-base md:text-lg lg:text-xl text-white/95 leading-relaxed text-center md:text-right md:pr-6 pr-0 md:border-r border-r-0"
                        style={{
                          fontFamily: 'var(--font-playfair-display)',
                          fontWeight: 300,
                          letterSpacing: '0.01em',
                          lineHeight: '1.7',
                          fontStyle: 'italic',
                          borderColor: 'rgba(255,255,255,0.3)',
                        }}
                      >
                        {panels[1]?.quote || '«Каждая вещь в нашей коллекции отобрана за безупречный вкус и умение говорить без слов».'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Третья панель - поднимается и накладывается на вторую */}
          <div style={{ height: '150vh', position: 'relative', overflow: 'visible' }} className="-mt-[250%] md:-mt-[56.25%]">
            <div
              ref={panel3Ref}
              className="sticky w-full aspect-[3/4] md:aspect-[16/9]"
              style={{
                top: stickyTop,
                zIndex: 3,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div className="relative w-full h-full overflow-hidden">
                {/* Фоновое изображение */}
                <OptimizedCoverImage
                  src={panels[2]?.image}
                  alt=""
                  sizes="100vw"
                />
                
                {/* Градиентный overlay для читаемости */}
                <div 
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.35) 100%)',
                  }}
                />
                
                {/* Дополнительное затемнение на мобильных */}
                <div 
                  className="absolute inset-0 bg-black/40 md:bg-transparent"
                />
                
                {/* Контент - по центру, но с премиальной типографикой */}
                <div className="relative w-full h-full flex items-center justify-center p-12 sm:p-16 md:p-20 lg:p-24">
                  <div className="max-w-3xl text-center">
                    {/* Подзаголовок - мелко, вразрядку */}
                    <p
                      className="text-[10px] sm:text-xs md:text-sm mb-6 sm:mb-8 text-white/90"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontWeight: 300,
                        letterSpacing: '0.3em',
                        textTransform: 'uppercase',
                        lineHeight: '1.2',
                      }}
                    >
                      {panels[2]?.subtitle || 'ДЛЯ ВАС'}
                    </p>
                    
                    {/* Заголовок - крупно, антиква */}
                    <h3 
                      className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl mb-8 sm:mb-10 md:mb-12 text-white leading-[1.1] whitespace-pre-line"
                      style={{
                        fontFamily: 'var(--font-playfair-display)',
                        fontWeight: 400,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {panels[2]?.title || 'ИНДИВИДУАЛЬНОСТЬ\nИ СТИЛЬ'}
                    </h3>
                    
                    {/* Текст в кавычках */}
                    <div className="relative max-w-2xl mx-auto">
                      <p 
                        className="text-sm sm:text-base md:text-lg lg:text-xl text-white/95 leading-relaxed"
                        style={{
                          fontFamily: 'var(--font-playfair-display)',
                          fontWeight: 300,
                          letterSpacing: '0.01em',
                          lineHeight: '1.7',
                          fontStyle: 'italic',
                          paddingLeft: '1.5rem',
                          paddingRight: '1.5rem',
                          borderLeft: '1px solid rgba(255,255,255,0.3)',
                          borderRight: '1px solid rgba(255,255,255,0.3)',
                        }}
                      >
                        {panels[2]?.quote || '«Для тех, кто ценит изящество в мелочах и не боится подчёркивать свою индивидуальность».'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* Кураторская подборка — на мобильных меньше зазор до заголовка; sticky-панели не трогаем */}
      <section className="w-full bg-white py-12 sm:py-16 md:py-20 md:!mt-0 md:!pt-20 max-md:-mt-12 max-md:!pt-2">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Заголовок секции - маленький, аккуратный */}
          <div className="text-center mb-8 sm:mb-10">
            <h2 
              className="text-lg sm:text-xl md:text-2xl"
              style={{
                fontFamily: 'var(--font-playfair-display)',
                color: '#000000',
                fontWeight: 400,
                letterSpacing: '0.01em',
                lineHeight: '1.3',
              }}
            >
              {curated.title || 'Кураторская подборка'}
            </h2>
          </div>

          {/* Сетка карточек - премиум стиль, 2 колонки на мобильных, 4 колонки на больших экранах */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 md:gap-10 max-w-[1600px] mx-auto">
            {auctionsLoading ? (
              // Показываем плейсхолдеры во время загрузки
              Array(4).fill(0).map((_, index) => (
                <div key={index} className="aspect-[3/4] bg-gray-100 animate-pulse"></div>
              ))
            ) : (
              currentAuctions.map((auction) => {
                const lp = listingPriceFromAuction(auction);
                return (
                <AuctionCard
                  key={auction.id}
                  id={auction.id.toString()}
                  name={auction.name}
                  additionalInfo={auction.additional_info}
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
                />
              );
              })
            )}
          </div>
        </div>
      </section>

      {/* Коллекции */}
      <section className="w-full bg-white py-12 sm:py-16 md:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1600px] mx-auto">
            {/* Заголовок секции - маленький, аккуратный */}
            <div className="text-center mb-8 sm:mb-10">
              <h2 
                className="text-lg sm:text-xl md:text-2xl"
                style={{
                  fontFamily: 'var(--font-playfair-display)',
                  color: '#000000',
                  fontWeight: 400,
                  letterSpacing: '0.01em',
                  lineHeight: '1.3',
                }}
              >
                {catalogLabels.categoriesTitle || 'Коллекции'}
              </h2>
            </div>

            {/* Сетка коллекций */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 md:gap-10">
              {collections.map((item, index) => (
                <Link
                  key={item.collection_id || item.slug || index}
                  href={item.href}
                  className="group block"
                >
                  {/* Изображение */}
                  {hasImageSrc(item.image) ? (
                    <div className="w-full aspect-[4/5] mb-4 overflow-hidden relative">
                      <OptimizedCoverImage
                        src={item.image}
                        alt={item.title}
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    </div>
                  ) : null}

                  {/* Текст */}
                  <div className="text-center">
                    <p
                      className="text-[10px] sm:text-xs mb-2 uppercase tracking-widest"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#666666',
                        letterSpacing: '0.2em',
                      }}
                    >
                      {item.season}
                    </p>
                    <h3
                      className="text-base sm:text-lg md:text-xl relative inline-block cursor-pointer group"
                      style={{
                        fontFamily: 'var(--font-playfair-display)',
                        color: '#000000',
                        fontWeight: 400,
                        letterSpacing: '0.01em',
                      }}
                    >
                      <span className="inline-block origin-right scale-x-100 group-hover:scale-x-0 transition-transform duration-700 ease-in-out">– </span>
                      <span>{item.title}</span>
                      <span className="inline-block origin-left scale-x-100 group-hover:scale-x-0 transition-transform duration-700 ease-in-out"> –</span>
                      <span 
                        className="absolute bottom-0 left-0 right-0 h-px bg-black origin-center scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-in-out"
                      />
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Блок с текстом и изображениями - Премиум стиль */}
      <section className="w-full bg-white py-16 sm:py-20 md:py-24 lg:py-32">
        {/* Большое изображение на мобильных - на всю ширину экрана */}
        {hasImageSrc(textImage.bigImage) ? (
          <Link href="/collection" className="lg:hidden w-full aspect-[3/4] overflow-hidden block mb-6 relative">
            <OptimizedCoverImage src={textImage.bigImage} alt={textImage.title} sizes="100vw" />
          </Link>
        ) : null}

        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1600px] mx-auto">
            {/* На мобильных: flex column, на десктопе: grid */}
            <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-0">
            {/* Большое изображение для десктопа - на десктопе вторым */}
            {hasImageSrc(textImage.bigImage) ? (
              <Link href="/collection" className="hidden lg:block w-full aspect-[3/4] lg:max-h-[80vh] lg:aspect-[3/4] overflow-hidden order-2 relative">
                <OptimizedCoverImage
                  src={textImage.bigImage}
                  alt={textImage.title}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </Link>
            ) : null}

            {/* На мобильных: маленькое фото отдельно */}
            {hasImageSrc(textImage.smallImage) ? (
              <div className="lg:hidden order-2 mb-6 flex justify-center">
                <div className="w-full max-w-[200px] aspect-[3/4] overflow-hidden relative">
                  <OptimizedCoverImage
                    src={textImage.smallImage}
                    alt={textImage.title}
                    sizes="200px"
                  />
                </div>
              </div>
            ) : null}

            {/* На мобильных: текст отдельно */}
            <div className="lg:hidden order-3 text-center mb-6">
              <h2
                className="text-base sm:text-lg mb-4 whitespace-pre-line"
                style={{
                  fontFamily: 'var(--font-playfair-display)',
                  color: '#000000',
                  fontWeight: 400,
                  letterSpacing: '0.01em',
                  lineHeight: '1.3',
                }}
              >
                {textImage.title}
              </h2>
              <p
                className="text-xs sm:text-sm mb-6 leading-relaxed max-w-md mx-auto"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#666666',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  lineHeight: '1.6',
                }}
              >
                {textImage.text}
              </p>
            </div>

            {/* Левая часть для десктопа - общая панель с бежевым фоном */}
            <Link href="/collection" className="hidden lg:flex flex-col items-center justify-center py-8 sm:py-10 md:py-12 pr-8 sm:pr-12 md:pr-16 order-1" style={{ backgroundColor: 'transparent' }}>
              {/* Маленькое изображение */}
              {hasImageSrc(textImage.smallImage) ? (
                <div className="w-full max-w-[200px] mx-auto aspect-[3/4] mb-6 sm:mb-8 overflow-hidden relative">
                  <OptimizedCoverImage
                    src={textImage.smallImage}
                    alt={textImage.title}
                    sizes="200px"
                  />
                </div>
              ) : null}
              
              {/* Текст */}
              <div className="text-center">
                <h2
                  className="text-base sm:text-lg md:text-xl mb-4 sm:mb-5 whitespace-pre-line"
                  style={{
                    fontFamily: 'var(--font-playfair-display)',
                    color: '#000000',
                    fontWeight: 400,
                    letterSpacing: '0.01em',
                    lineHeight: '1.3',
                  }}
                >
                  {textImage.title}
                </h2>
                <p
                  className="text-xs sm:text-sm mb-6 sm:mb-8 leading-relaxed max-w-md mx-auto"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    color: '#666666',
                    fontWeight: 400,
                    letterSpacing: '0.02em',
                    lineHeight: '1.6',
                  }}
                >
                  {textImage.text}
                </p>
                  
                  {/* Кнопка "Посмотреть" */}
                  <div className="text-sm sm:text-base relative inline-block cursor-pointer group"
                    style={{
                      fontFamily: 'var(--font-playfair-display)',
                      color: '#000000',
                      fontWeight: 400,
                      letterSpacing: '0.01em',
                    }}
                  >
                    {/* Дефисы по бокам - уменьшаются, край у текста остается на месте */}
                    <span className="inline-block origin-right scale-x-100 group-hover:scale-x-0 transition-transform duration-700 ease-in-out">– </span>
                    <span>Посмотреть</span>
                    <span className="inline-block origin-left scale-x-100 group-hover:scale-x-0 transition-transform duration-700 ease-in-out"> –</span>
                    
                    {/* Линия под текстом - появляется при наведении на текст */}
                    <span 
                      className="absolute bottom-0 left-0 right-0 h-px bg-black origin-center scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-in-out"
                    />
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Блок с текстом сверху и большим изображением - Премиум стиль */}
      <section className="w-full bg-white py-12 sm:py-16 md:py-20">
        {/* Изображение на мобильных - на всю ширину экрана */}
        {hasImageSrc(imperial.image) ? (
          <div className="lg:hidden w-full aspect-[16/9] overflow-hidden mb-6 bg-[#faf9f7] relative">
            <OptimizedCoverImage
              src={imperial.image}
              alt={imperial.title}
              sizes="100vw"
              imageClassName="object-contain"
            />
          </div>
        ) : null}

        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1600px] mx-auto">
            {/* Текст - на мобильных под изображением, на десктопе сверху */}
            <div className="text-center mb-8 sm:mb-10 max-w-4xl mx-auto">
              <h2
                className="text-lg sm:text-xl md:text-2xl mb-4 sm:mb-5"
                style={{
                  fontFamily: 'var(--font-playfair-display)',
                  color: '#000000',
                  fontWeight: 400,
                  letterSpacing: '0.01em',
                  lineHeight: '1.3',
                }}
              >
                {imperial.title}
              </h2>
              <p
                className="text-xs sm:text-sm leading-relaxed"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#666666',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  lineHeight: '1.6',
                }}
              >
                {imperial.text}
              </p>
            </div>

            {/* Изображение для десктопа */}
            {hasImageSrc(imperial.image) ? (
              <div className="hidden lg:block w-full max-w-4xl mx-auto pb-6 sm:pb-8 md:pb-10">
                <div className="relative w-full aspect-[16/9] max-h-[80vh] overflow-hidden bg-[#faf9f7]">
                  <OptimizedCoverImage
                    src={imperial.image}
                    alt={imperial.title}
                    sizes="(max-width: 1024px) 100vw, 896px"
                    imageClassName="object-contain"
                  />
                
                {/* Белая панель с кнопкой - наполовину на изображении */}
                <div className="absolute -bottom-6 sm:-bottom-8 md:-bottom-10 left-1/2 transform -translate-x-1/2 bg-white px-8 sm:px-10 md:px-12 pt-2 sm:pt-3 md:pt-4 pb-8 sm:pb-10 md:pb-12 z-10 flex justify-center items-start" style={{ minHeight: '80px' }}>
                <Link
                  href="/collection"
                  className="text-sm sm:text-base relative inline-block cursor-pointer group"
                  style={{
                    fontFamily: 'var(--font-playfair-display)',
                    color: '#000000',
                    fontWeight: 400,
                    letterSpacing: '0.01em',
                  }}
                >
                  {/* Дефисы по бокам - уменьшаются, край у текста остается на месте */}
                  <span className="inline-block origin-right scale-x-100 group-hover:scale-x-0 transition-transform duration-700 ease-in-out">– </span>
                  <span>Посмотреть</span>
                  <span className="inline-block origin-left scale-x-100 group-hover:scale-x-0 transition-transform duration-700 ease-in-out"> –</span>
                  
                  {/* Линия под текстом - появляется при наведении на текст */}
                  <span 
                    className="absolute bottom-0 left-0 right-0 h-px bg-black origin-center scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-in-out"
                  />
                </Link>
              </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

