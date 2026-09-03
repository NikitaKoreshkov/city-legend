'use client';

import { useState } from 'react';
import LegalRequisitesBlock from '../components/LegalRequisitesBlock';
import { SITE_BRAND, siteUrlDisplay } from '@/lib/legalPublic';

const sections = [
  { id: 'introduction', title: 'Введение и правовая основа' },
  { id: 'what-are', title: 'Что такое файлы cookie' },
  { id: 'types', title: 'Какие файлы cookie мы используем' },
  { id: 'duration', title: 'Срок действия' },
  { id: 'third-party', title: 'Файлы cookie третьих сторон' },
  { id: 'management', title: 'Как управлять файлами cookie' },
  { id: 'similar', title: 'Аналогичные технологии' },
  { id: 'changes', title: 'Изменения в Политике' },
  { id: 'contacts', title: 'Контактная информация' },
];

export default function Cookies() {
  const [selectedSection, setSelectedSection] = useState('introduction');
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  const renderContent = () => {
    switch (selectedSection) {
      case 'introduction':
        return (
          <div className="space-y-4">
            <p>
              Настоящая Политика использования файлов cookie и аналогичных технологий (далее — «Политика») применяется к интернет-ресурсу <strong>«{SITE_BRAND}»</strong> (далее — «Сайт»)
              {siteUrlDisplay() ? (
                <>
                  , доступному по адресу <strong>{siteUrlDisplay()}</strong>
                </>
              ) : null}
              , и разъясняет, какие технологии мы применяем, в каких целях и как вы можете ими управлять.
            </p>
            <p>
              Сведения, собираемые с помощью cookie и аналогичных средств, могут подпадать под определение персональных данных по Федеральному закону от 27.07.2006 № 152-ФЗ «О персональных данных», если позволяют идентифицировать пользователя. Общие принципы обработки персональных данных изложены в Политике в отношении обработки персональных данных на Сайте.
            </p>
            <p>
              Для <strong>технически необходимых</strong> cookie, без которых невозможно предоставить доступ к Сайту и его базовым функциям (например, сессия, безопасность, корзина), отдельное согласие не требуется. Для <strong>иных</strong> категорий (аналитика, функциональные предпочтения не первостепенного характера, маркетинг при наличии) Оператор действует с учётом требований законодательства РФ, в том числе части 5 статьи 18.1 № 152-ФЗ — и запрашивает согласие через баннер, настройки Сайта или иной понятный способ, если применимо.
            </p>
            <p>
              Продолжая пользоваться Сайтом после отображения уведомления о cookie (если оно используется), либо не отключая необязательные категории в настройках, вы подтверждаете согласие с соответствующей обработкой в объёме, указанном в настоящей Политике. Вы вправе в любой момент изменить настройки браузера или (при наличии) панели управления cookie на Сайте.
            </p>
          </div>
        );
      case 'what-are':
        return (
          <div className="space-y-4">
            <p>
              Файлы cookie — это небольшие текстовые файлы, которые веб-сайт сохраняет на устройстве пользователя (компьютере, планшете, смартфоне) при посещении сайта. Файлы cookie позволяют веб-сайту запоминать информацию о действиях и предпочтениях пользователя, что делает использование сайта более удобным и персонализированным.
            </p>
            <p>
              Файлы cookie обычно содержат:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Название веб-сайта, который их создал;</li>
              <li>Срок действия файла cookie;</li>
              <li>Уникальный идентификатор (обычно случайное число или строка);</li>
              <li>Значение (информацию, которую веб-сайт хочет сохранить).</li>
            </ul>
            <p>
              Файлы cookie не могут содержать вирусы или вредоносное программное обеспечение и не могут получить доступ к информации, хранящейся на вашем устройстве, за исключением той информации, которую вы сами предоставляете веб-сайту.
            </p>
          </div>
        );
      case 'types':
        return (
          <div className="space-y-4">
            <div>
              <p><strong>Строго необходимые файлы cookie</strong></p>
              <p className="ml-4">Обеспечивают работу Сайта: сессия, защита от злоупотреблений, элементы оформления заказа и входа в учётную запись. Без них отдельные разделы Сайта могут быть недоступны. В соответствии с подходом уполномоченных органов и практикой применения 152-ФЗ такие cookie обычно не требуют отдельного согласия; отключение возможно через браузер, но может сделать невозможным использование Сайта.</p>
            </div>
            <div>
              <p><strong>Функциональные файлы cookie</strong></p>
              <p className="ml-4">Эти файлы cookie позволяют Сайту запоминать выборы и предпочтения пользователя, что делает использование Сайта более удобным и персонализированным. Они используются для запоминания предпочтений пользователя (например, размер шрифта, цветовая схема), сохранения информации о ранее просмотренных страницах, запоминания выбранных фильтров при просмотре каталога лотов, сохранения состояния форм при заполнении.</p>
            </div>
            <div>
              <p><strong>Аналитические файлы cookie</strong></p>
              <p className="ml-4">Эти файлы cookie помогают нам понять, как пользователи взаимодействуют с Сайтом, собирая анонимную статистику о посещениях, просмотренных страницах, времени, проведенном на Сайте, и источниках перехода на Сайт. Собранная информация используется исключительно в агрегированном и анонимном виде для улучшения работы Сайта и пользовательского опыта.</p>
            </div>
            <div>
              <p><strong>Рекламные и сторонние маркетинговые cookie</strong></p>
              <p className="ml-4">При отсутствии на Сайте рекламных сетей и пикселей ретаргетинга такие файлы не используются. Если Продавец подключит соответствующие инструменты, настоящая Политика будет обновлена, будет обеспечено получение согласия в требуемой форме и указаны контрагенты.</p>
            </div>
          </div>
        );
      case 'duration':
        return (
          <div className="space-y-4">
            <p>Мы используем два типа файлов cookie по сроку действия:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Сессионные файлы cookie:</strong> временные файлы cookie, которые удаляются автоматически при закрытии браузера. Они необходимы для обеспечения работы Сайта во время вашего посещения.
              </li>
              <li>
                <strong>Постоянные файлы cookie:</strong> остаются на вашем устройстве в течение определенного периода времени (обычно от нескольких дней до нескольких лет) или до тех пор, пока вы их не удалите вручную. Они позволяют Сайту запоминать ваши предпочтения при последующих посещениях.
              </li>
            </ul>
            <p>Срок действия постоянных файлов cookie устанавливается в зависимости от их назначения и обычно не превышает 12 (двенадцати) месяцев.</p>
          </div>
        );
      case 'third-party':
        return (
          <div className="space-y-4">
            <p>Если на Сайте подключены счётчики веб-аналитики, виджеты платёжных систем, картографические сервисы доставки или иные внешние скрипты, такие поставщики могут устанавливать собственные cookie в соответствии со своими документами. Продавец стремится заключать с ними соглашения с учётом требований 152-ФЗ и (при трансграничной обработке) статьи 12 152-ФЗ.</p>
            <p>Актуальный перечень подключённых сервисов и ссылки на их политики конфиденциальности могут быть указаны в настоящем разделе по мере их использования. Примеры документов крупных операторов (если соответствующие сервисы задействованы):</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Google: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">https://policies.google.com/privacy</a></li>
              <li>Яндекс: <a href="https://yandex.ru/legal/confidential" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">https://yandex.ru/legal/confidential</a></li>
            </ul>
          </div>
        );
      case 'management':
        return (
          <div className="space-y-4">
            <p>Вы можете управлять файлами cookie и контролировать их использование следующими способами:</p>
            <div>
              <p><strong>Настройки браузера</strong></p>
              <p className="ml-4">Большинство браузеров позволяют управлять файлами cookie через настройки. Вы можете блокировать все файлы cookie, разрешать только файлы cookie с определенных сайтов, удалять все или выборочно удалять файлы cookie, настроить автоматическое удаление файлов cookie при закрытии браузера, получать уведомления перед сохранением файлов cookie.</p>
              <p className="ml-4 mt-2">Инструкции по настройке файлов cookie для популярных браузеров:</p>
              <ul className="list-disc pl-10 space-y-1">
                <li>Google Chrome: Настройки → Конфиденциальность и безопасность → Файлы cookie и другие данные сайтов</li>
                <li>Mozilla Firefox: Настройки → Приватность и защита → Файлы cookie и данные сайтов</li>
                <li>Safari: Настройки → Конфиденциальность → Управление данными веб-сайтов</li>
                <li>Microsoft Edge: Настройки → Файлы cookie и разрешения сайтов → Файлы cookie и данные сайтов</li>
                <li>Opera: Настройки → Конфиденциальность и безопасность → Файлы cookie и другие данные сайтов</li>
              </ul>
            </div>
            <div>
              <p><strong>Важные замечания</strong></p>
              <p className="ml-4">Обратите внимание, что блокировка или удаление файлов cookie может повлиять на функциональность Сайта: некоторые функции Сайта могут быть недоступны, вам может потребоваться повторно вводить информацию при каждом посещении, ваши предпочтения и настройки могут не сохраняться, некоторые страницы могут загружаться медленнее или работать некорректно.</p>
            </div>
          </div>
        );
      case 'similar':
        return (
          <div className="space-y-4">
            <p>Помимо файлов cookie, мы можем использовать аналогичные технологии для сбора информации о вашем использовании Сайта:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Локальное хранилище (Local Storage):</strong> технология, позволяющая сохранять данные в браузере на более длительный срок, чем файлы cookie;
              </li>
              <li>
                <strong>Сессионное хранилище (Session Storage):</strong> технология, позволяющая сохранять данные только на время сессии браузера;
              </li>
              <li>
                <strong>Пиксельные теги (Pixel Tags):</strong> небольшие невидимые изображения, используемые для отслеживания активности пользователей;
              </li>
              <li>
                <strong>Веб-маяки (Web Beacons):</strong> небольшие фрагменты кода, используемые для сбора информации о посещениях страниц.
              </li>
            </ul>
            <p>Положения настоящей Политики распространяются на все аналогичные технологии, используемые на Сайте.</p>
          </div>
        );
      case 'changes':
        return (
          <div className="space-y-4">
            <p>Продавец вправе обновлять настоящую Политику с учётом изменений законодательства РФ и состава используемых технологий. Новая редакция вступает в силу с даты публикации на Сайте, если не указано иное.</p>
            <p>При существенных изменениях (например, подключение новых категорий отслеживания) может потребоваться повторное уведомление и (или) запрос согласия — в порядке, предусмотренном законом.</p>
          </div>
        );
      case 'contacts':
        return (
          <div className="space-y-4">
            <p>По вопросам обработки данных, связанных с cookie и аналогичными технологиями, вы можете обратиться к Оператору Сайта:</p>
            <LegalRequisitesBlock />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full bg-white min-h-screen pt-48 pb-20" style={{ backgroundColor: '#faf9f7' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Заголовок */}
        <div className="text-center mb-16">
          <h1
            className="text-lg sm:text-xl mb-2"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              color: 'var(--color-classic-black)',
              fontWeight: 400,
              letterSpacing: '0.01em',
              fontStyle: 'italic',
            }}
          >
            Политика использования файлов Cookie
          </h1>
          <p
            className="text-xs text-gray-600"
            style={{
              fontFamily: 'var(--font-open-sans)',
              letterSpacing: '0.02em',
            }}
          >
            Выберите раздел для просмотра информации
          </p>
        </div>

        {/* Разделительная линия */}
        <div className="border-t border-gray-200 mb-16"></div>

        {/* Основной контент - две колонки */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 max-w-6xl mx-auto">
          {/* Левая колонка - навигация */}
          <div className="lg:col-span-2">
            <nav className="space-y-1">
              {sections.map((section) => {
                const isActive = selectedSection === section.id;
                const isHovered = hoveredSection === section.id;
                const shouldHighlight = isActive || isHovered;
                
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    onMouseEnter={() => setHoveredSection(section.id)}
                    onMouseLeave={() => setHoveredSection(null)}
                    className="w-full text-left py-3 group relative"
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '15px',
                      letterSpacing: '0.02em',
                      color: shouldHighlight ? '#8B4513' : 'var(--color-classic-black)',
                      transition: 'color 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="relative">
                      {section.title}
                      <span
                        className="absolute bottom-0 left-0 right-0 h-px bg-current origin-left"
                        style={{
                          transform: shouldHighlight ? 'scaleX(1)' : 'scaleX(0)',
                          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Правая колонка - контент */}
          <div className="lg:col-span-3">
            <div
              key={selectedSection}
              className="space-y-4"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: 'var(--color-classic-black)',
                lineHeight: '1.9',
                fontSize: '16px',
                opacity: 1,
                transition: 'opacity 0.3s ease-in-out',
              }}
            >
              <h2
                className="mb-6"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  fontSize: '14px',
                }}
              >
                {sections.find(s => s.id === selectedSection)?.title}
              </h2>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
