import pool, { ensureDatabase } from '@/lib/db';
import {
  DEFAULT_BRANDING,
  DEFAULT_SITE_FOOTER,
  mergeBranding,
  mergeSiteFooter,
  type SiteBranding,
  type SiteFooterConfig,
} from '@/lib/siteShellDefaults';

export type SiteShell = { branding: SiteBranding; footer: SiteFooterConfig };

export async function getSiteShell(): Promise<SiteShell> {
  await ensureDatabase();
  let branding = DEFAULT_BRANDING;
  let footer = DEFAULT_SITE_FOOTER;
  try {
    const r = await pool.query<{ section: string; data: unknown }>(
      `SELECT section, data FROM homepage_content WHERE section IN ('branding', 'site_footer')`
    );
    for (const row of r.rows) {
      if (row.section === 'branding') {
        branding = mergeBranding(row.data as Partial<SiteBranding>);
      }
      if (row.section === 'site_footer') {
        footer = mergeSiteFooter(row.data as Partial<SiteFooterConfig>);
      }
    }
  } catch {
    // таблица / соединение
  }
  return { branding, footer };
}

/** Абсолютный URL логотипа для schema.org и meta (путь вида /uploads/... или /logo.png). */
export function absoluteLogoUrl(logoPath: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const p = logoPath.startsWith('/') ? logoPath : `/${logoPath}`;
  if (/^https?:\/\//i.test(logoPath)) return logoPath;
  return `${base}${p}`;
}
