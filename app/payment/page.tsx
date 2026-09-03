import type { Metadata } from 'next';
import Footer from '../components/Footer';
import { PaymentFlow } from '../components/PaymentFlow';

export const metadata: Metadata = {
  title: 'Оплата заказа',
  description:
    'Безопасное оформление оплаты: защищённая ссылка, шифрование TLS, обработка карт на стороне сертифицированного провайдера.',
};

export default function PaymentPage() {
  return (
    <>
      <div className="min-h-screen bg-[#faf9f7] pt-32 sm:pt-36 md:pt-40">
        <PaymentFlow />
      </div>
      <Footer />
    </>
  );
}
