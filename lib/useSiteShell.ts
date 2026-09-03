'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_BRANDING,
  DEFAULT_SITE_FOOTER,
  mergeBranding,
  mergeSiteFooter,
  type SiteBranding,
  type SiteFooterConfig,
} from '@/lib/siteShellDefaults';

export type SiteShell = { branding: SiteBranding; footer: SiteFooterConfig };

export function useSiteShell(): SiteShell {
  const [shell, setShell] = useState<SiteShell>(() => ({
    branding: DEFAULT_BRANDING,
    footer: DEFAULT_SITE_FOOTER,
  }));

  useEffect(() => {
    fetch('/api/content/site-shell')
      .then((r) => {
        if (!r.ok) return;
        return r.json() as Promise<Partial<SiteShell> & { branding?: Partial<SiteBranding>; footer?: Partial<SiteFooterConfig> }>;
      })
      .then((data) => {
        if (!data) return;
        setShell({
          branding: mergeBranding(data.branding),
          footer: mergeSiteFooter(data.footer),
        });
      })
      .catch(() => {});
  }, []);

  return shell;
}
