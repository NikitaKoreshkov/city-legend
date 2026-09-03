'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_CATALOG_LABELS,
  mergeCatalogLabels,
  type CatalogLabels,
} from '@/lib/catalogLabels';

export function useCatalogLabels(initial?: CatalogLabels): CatalogLabels {
  const [labels, setLabels] = useState<CatalogLabels>(initial ?? DEFAULT_CATALOG_LABELS);

  useEffect(() => {
    if (initial) {
      setLabels(initial);
      return;
    }
    let cancelled = false;
    fetch('/api/content/homepage')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, unknown>) => {
        if (!cancelled) setLabels(mergeCatalogLabels(data));
      })
      .catch(() => {
        /* defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [initial]);

  return labels;
}
