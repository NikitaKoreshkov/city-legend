import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  operatorEntityName,
  operatorInn,
  operatorOgrn,
  operatorLegalAddress,
} from '@/lib/legalPublic';

export default function LegalRequisitesBlock() {
  const name = operatorEntityName();
  const inn = operatorInn();
  const ogrn = operatorOgrn();
  const address = operatorLegalAddress();

  return (
    <div className="bg-gray-50 p-6 my-4 rounded">
      {name ? (
        <p>
          <strong>{name}</strong>
        </p>
      ) : (
        <p>
          <strong>Оператор Сайта</strong> — юридическое лицо или индивидуальный предприниматель, зарегистрированные в Российской Федерации. Для соответствия требованиям законодательства о персональных данных и информации о продавце полное наименование (или ФИО ИП), ИНН и ОГРН (ОГРНИП) должны быть указаны владельцем Сайта в этой карточке до публичного размещения (например, через параметры развёртывания приложения).
        </p>
      )}
      {inn ? <p>ИНН: {inn}</p> : null}
      {ogrn ? <p>ОГРН / ОГРНИП: {ogrn}</p> : null}
      <p>Юридический адрес: {address}</p>
      <p>
        Email:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 underline">
          {CONTACT_EMAIL}
        </a>
      </p>
      <p>Телефон: {CONTACT_PHONE}</p>
    </div>
  );
}
