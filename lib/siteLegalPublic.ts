import {
  operatorEntityName,
  operatorInn,
  operatorOgrn,
  operatorLegalAddress,
} from '@/lib/legalPublic';

export type SiteLegalResolved = {
  entityName: string;
  inn: string;
  ogrn: string;
  legalAddress: string;
};

/** Fallback без БД (env + дефолты). Без импорта pool — безопасно для клиента. */
export function legalFromEnv(): SiteLegalResolved {
  return {
    entityName: operatorEntityName(),
    inn: operatorInn(),
    ogrn: operatorOgrn(),
    legalAddress: operatorLegalAddress(),
  };
}
