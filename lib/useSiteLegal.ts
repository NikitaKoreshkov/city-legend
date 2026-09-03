'use client';

import { useEffect, useState } from 'react';
import type { SiteLegalResolved } from '@/lib/siteLegalPublic';

const EMPTY_LEGAL: SiteLegalResolved = {
  entityName: '',
  inn: '',
  ogrn: '',
  legalAddress: '',
};

/** Клиент: первый кадр — пусто, затем данные из БД по /api/site-legal (без env-дефолтов в футере). */
export function useSiteLegal(): SiteLegalResolved {
  const [legal, setLegal] = useState<SiteLegalResolved>(() => EMPTY_LEGAL);
  useEffect(() => {
    fetch('/api/site-legal')
      .then((r) => {
        if (!r.ok) return;
        return r.json() as Promise<SiteLegalResolved>;
      })
      .then((data) => {
        if (
          data &&
          typeof data.entityName === 'string' &&
          typeof data.inn === 'string' &&
          typeof data.legalAddress === 'string'
        ) {
          setLegal(data);
        }
      })
      .catch(() => {});
  }, []);
  return legal;
}
