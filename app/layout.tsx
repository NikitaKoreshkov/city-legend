import type { Metadata, Viewport } from "next";
import { Playfair_Display, Open_Sans } from "next/font/google";
import "./globals.css";
import ConditionalHeader from "./components/ConditionalHeader";
import Analytics, { GtmBodyNoscript } from "./components/Analytics";
import { CONTACT_PHONE_E164 } from "@/lib/legalPublic";
import { getResolvedLegal } from "@/lib/siteLegal";
import { getSiteShell, absoluteLogoUrl } from "@/lib/siteShell";
import { buildRootLayoutMetadata, resolveLogoAbs } from "@/lib/seo/rootMetadata";
import { buildOrganizationAndWebSiteJsonLd } from "@/lib/seo/jsonLd";
import { DEFAULT_LOGO_URL } from "@/lib/siteShellDefaults";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin", "cyrillic"],
  // Medium (500) не используем в вёрстке — один woff2 меньше на критическом пути.
  weight: ["400", "700"],
  display: "swap",
  adjustFontFallback: true,
  // Не конкурирует с Open Sans и LCP-постером на критическом пути; подгружается при первом использовании.
  preload: false,
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600"], // Regular, Semibold
  display: "swap",
  adjustFontFallback: true,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf9f7",
};

export async function generateMetadata(): Promise<Metadata> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  let logoPath = DEFAULT_LOGO_URL;
  try {
    const { branding } = await getSiteShell();
    if (branding?.logoUrl?.trim()) logoPath = branding.logoUrl.trim();
  } catch {
    /* fallback */
  }
  const logoAbs = resolveLogoAbs(base, logoPath);
  return buildRootLayoutMetadata(logoAbs);
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const legal = await getResolvedLegal();
  let logoForSchema = `${baseUrl}${DEFAULT_LOGO_URL}`;
  try {
    const { branding } = await getSiteShell();
    if (branding?.logoUrl?.trim()) {
      logoForSchema = absoluteLogoUrl(branding.logoUrl.trim(), baseUrl);
    }
  } catch {
    /* */
  }
  const structuredData = buildOrganizationAndWebSiteJsonLd({
    baseUrl,
    logoUrl: logoForSchema,
    legalName: legal.entityName,
    legalAddress: legal.legalAddress,
    phoneE164: CONTACT_PHONE_E164,
    description:
      "City Legend — тщательно отобранная коллекция украшений и аксессуаров для тех, кто ценит изящество в каждой детали. Curated jewelry & accessories — earrings, bracelets, necklaces, rings.",
  });

  const siteOrigin = baseUrl.replace(/\/$/, "");
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const ymIdRaw = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();
  const ymEnabled = Boolean(ymIdRaw && /^\d+$/.test(ymIdRaw));
  const analyticsPreconnect = Boolean(gtmId || gaId || ymEnabled);

  return (
    <html lang="ru">
      <head>
        {/* Ранний коннект к origin: статика /_next (woff2, css) с того же хоста. */}
        <link rel="preconnect" href={siteOrigin} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={siteOrigin} />
        {analyticsPreconnect ? (
          <>
            <link rel="preconnect" href="https://www.googletagmanager.com" />
            <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
            {gaId && !gtmId ? (
              <link rel="dns-prefetch" href="https://www.google-analytics.com" />
            ) : null}
          </>
        ) : null}
        {ymEnabled ? (
          <link rel="preconnect" href="https://mc.yandex.ru" />
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body
        className={`${playfairDisplay.variable} ${openSans.variable} antialiased`}
      >
        <GtmBodyNoscript />
        <Analytics />
        <ConditionalHeader />
        {children}
      </body>
    </html>
  );
}
