import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '@/app/components/Footer';

export const metadata: Metadata = {
  title: 'Как проходит оплата и доставка',
  description:
    'Как купить украшение в City Legend: от добавления в корзину до получения посылки. Способы оплаты, доставка СДЭК, отслеживание заказа, возврат средств.',
};

export default function PaymentFlowGuidePage() {
  return (
    <>
      <div className="min-h-screen bg-[#faf9f7] pt-28 sm:pt-32 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <p
            className="text-[10px] uppercase tracking-[0.22em] mb-3 text-gray-500"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            CITY LEGEND · ИНФОРМАЦИЯ
          </p>
          <h1
            className="text-2xl sm:text-4xl font-normal italic text-[#0b2a24] mb-5"
            style={{ fontFamily: 'var(--font-playfair-display)' }}
          >
            Как проходит оплата и доставка
          </h1>
          <p
            className="text-sm sm:text-base text-gray-600 mb-12 leading-relaxed"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            Покупка украшения в нашем бутике занимает 2–3 минуты. Ниже — спокойное пошаговое описание того, что
            произойдёт после нажатия «Перейти к оплате».
          </p>

          {/* ── 5 шагов ─────────────────────────────────────────────────── */}
          <ol className="space-y-8">
            {/* 1 */}
            <li className="flex gap-5 sm:gap-6">
              <div
                className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0b2a24] text-white flex items-center justify-center text-sm"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                1
              </div>
              <div className="flex-1 pt-1.5">
                <h2
                  className="text-lg sm:text-xl text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Корзина и оформление
                </h2>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Вы выбираете лот в каталоге, добавляете в корзину и нажимаете «Перейти к оплате». На странице оплаты
                  заполняете контактные данные и адрес. Стоимость доставки —{' '}
                  <strong>300 ₽ по всей России</strong> — добавится к итоговой сумме автоматически.
                </p>
              </div>
            </li>

            {/* 2 */}
            <li className="flex gap-5 sm:gap-6">
              <div
                className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0b2a24] text-white flex items-center justify-center text-sm"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                2
              </div>
              <div className="flex-1 pt-1.5">
                <h2
                  className="text-lg sm:text-xl text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Оплата картой
                </h2>
                <p
                  className="text-sm text-gray-700 leading-relaxed mb-3"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Браузер откроет защищённую страницу банка-эквайера. Вы вводите данные карты — Visa, Mastercard, МИР
                  принимаются. После подтверждения (3-D Secure / SMS-код) банк списывает сумму и автоматически
                  возвращает вас обратно на сайт.
                </p>
                <p
                  className="text-xs text-gray-500 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Данные карты не сохраняются на наших серверах — обработка идёт у сертифицированного банка по стандарту
                  PCI DSS.
                </p>
              </div>
            </li>

            {/* 3 */}
            <li className="flex gap-5 sm:gap-6">
              <div
                className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0b2a24] text-white flex items-center justify-center text-sm"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                3
              </div>
              <div className="flex-1 pt-1.5">
                <h2
                  className="text-lg sm:text-xl text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Подтверждение заказа
                </h2>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Сразу после успешной оплаты вы видите экран с номером заказа (например,{' '}
                  <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded-sm">
                    CL-00000001
                  </span>
                  ) и можете перейти в раздел «Мои заказы». Заказ сразу попадает к нам в обработку — собирать его никто
                  не начинает раньше, чем оплата подтверждена.
                </p>
              </div>
            </li>

            {/* 4 */}
            <li className="flex gap-5 sm:gap-6">
              <div
                className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0b2a24] text-white flex items-center justify-center text-sm"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                4
              </div>
              <div className="flex-1 pt-1.5">
                <h2
                  className="text-lg sm:text-xl text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Передача в СДЭК
                </h2>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Мы упаковываем украшение и оформляем отправку через службу СДЭК. В вашем заказе появляется{' '}
                  <strong>трек-номер</strong> — обычно в течение нескольких минут после оплаты. По нему вы сможете
                  отслеживать посылку на сайте СДЭК или прямо в личном кабинете City Legend.
                </p>
              </div>
            </li>

            {/* 5 */}
            <li className="flex gap-5 sm:gap-6">
              <div
                className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0b2a24] text-white flex items-center justify-center text-sm"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                5
              </div>
              <div className="flex-1 pt-1.5">
                <h2
                  className="text-lg sm:text-xl text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Получение посылки
                </h2>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Курьер СДЭК доставит заказ по адресу, который вы указали при оформлении. По мере движения посылки
                  статус заказа в личном кабинете обновляется автоматически: «В обработке» → «Отправлен» → «Доставлен».
                </p>
              </div>
            </li>
          </ol>

          {/* ── FAQ ─────────────────────────────────────────────────────── */}
          <section className="mt-16">
            <h2
              className="text-2xl sm:text-3xl font-normal italic text-[#0b2a24] mb-8"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Частые вопросы
            </h2>

            <div className="space-y-7">
              <div>
                <h3
                  className="text-base text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Сколько занимает оплата?
                </h3>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Сама оплата на странице банка — около минуты. Иногда банк отвечает с небольшой задержкой; в этом
                  случае на нашей странице будет крутиться индикатор «Уточняем статус оплаты у банка» — это нормально,
                  достаточно подождать 1–2 минуты, не закрывая вкладку.
                </p>
              </div>

              <div>
                <h3
                  className="text-base text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Деньги списали, но заказ не появился. Что делать?
                </h3>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Подождите несколько минут — иногда уведомление от банка приходит чуть позже. Заказ автоматически
                  появится в разделе «Мои заказы». Если в течение 15 минут так и не появился — напишите нам через
                  «Поддержку» в кабинете, мы быстро разберёмся.
                </p>
              </div>

              <div>
                <h3
                  className="text-base text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Как отменить заказ?
                </h3>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  В личном кабинете рядом с заказом есть кнопка «Отменить» — она доступна, пока украшение не передано
                  курьеру. Деньги вернутся на ту же карту, с которой была оплата (обычно 1–3 банковских дня). Заявку в
                  СДЭК мы тоже отменим автоматически.
                </p>
              </div>

              <div>
                <h3
                  className="text-base text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Можно вернуть украшение после получения?
                </h3>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Да, в течение 14 дней с момента получения, если изделие сохранило товарный вид (без следов носки, в
                  оригинальной упаковке). Оформить заявку на возврат можно в кабинете кнопкой «Оформить возврат»,
                  подробности — на странице{' '}
                  <Link href="/care" className="text-[#0b2a24] underline underline-offset-2">
                    «Уход и хранение»
                  </Link>
                  .
                </p>
              </div>

              <div>
                <h3
                  className="text-base text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Какие способы оплаты принимаются?
                </h3>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Банковские карты Visa, Mastercard и МИР российских и зарубежных банков, а также СБП (Система быстрых
                  платежей) — на странице банка достаточно отсканировать QR-код приложением вашего банка.
                </p>
              </div>

              <div>
                <h3
                  className="text-base text-[#0b2a24] mb-2"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Сколько стоит и как долго идёт доставка?
                </h3>
                <p
                  className="text-sm text-gray-700 leading-relaxed"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Доставка по всей России — фиксированно <strong>300 ₽</strong>, срок 2–7 рабочих дней в зависимости от
                  региона. Точный срок СДЭК показывает после ввода адреса.
                </p>
              </div>
            </div>
          </section>

          {/* ── Помощь ──────────────────────────────────────────────────── */}
          <section className="mt-14 border border-[#0b2a24]/15 bg-white p-6 sm:p-8">
            <h2
              className="text-[11px] uppercase tracking-[0.18em] text-[#0b2a24] mb-3"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Нужна помощь?
            </h2>
            <p
              className="text-sm text-gray-700 leading-relaxed mb-4"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Если что-то пошло не так с оплатой или вы хотите уточнить детали заказа — напишите нашему менеджеру через
              личный кабинет, мы отвечаем в течение нескольких часов в рабочее время.
            </p>
            <div className="flex flex-wrap gap-3 sm:gap-4">
              <Link
                href="/payment"
                className="inline-flex items-center px-5 py-2.5 bg-[#0b2a24] text-white text-[10px] uppercase tracking-[0.16em] hover:bg-[#0b2a24]/90 transition-colors"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Перейти к оплате
              </Link>
              <Link
                href="/collection"
                className="inline-flex items-center px-5 py-2.5 border border-[#0b2a24] text-[#0b2a24] text-[10px] uppercase tracking-[0.16em] hover:bg-[#0b2a24] hover:text-white transition-colors"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Каталог украшений
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}
