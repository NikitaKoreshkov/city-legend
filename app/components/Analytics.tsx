import Script from 'next/script';

const GTM_ID_RAW = process.env.NEXT_PUBLIC_GTM_ID?.trim();
/** GTM-XXXXXXXX */
const GTM_ID =
  GTM_ID_RAW && /^GTM-[A-Z0-9]+$/i.test(GTM_ID_RAW) ? GTM_ID_RAW.toUpperCase() : null;

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
const YM_ID_RAW = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();
const YM_ID = YM_ID_RAW && /^\d+$/.test(YM_ID_RAW) ? YM_ID_RAW : null;

/**
 * GTM noscript — сразу после открывающего <body> (требование Google).
 * @see app/layout.tsx
 */
export function GtmBodyNoscript() {
  if (!GTM_ID) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(GTM_ID)}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}

/**
 * Аналитика из .env:
 * - NEXT_PUBLIC_GTM_ID — Google Tag Manager (GTM-XXXX)
 * - NEXT_PUBLIC_YANDEX_METRIKA_ID — числовой id Метрики
 * - NEXT_PUBLIC_GA_MEASUREMENT_ID — опционально GA4 (G-…), если GTM не используется
 */
export default function Analytics() {
  const needsDataLayer = Boolean(GTM_ID || YM_ID);

  return (
    <>
      {needsDataLayer ? (
        <Script id="data-layer-init" strategy="beforeInteractive">
          {'window.dataLayer = window.dataLayer || [];'}
        </Script>
      ) : null}

      {GTM_ID ? (
        <Script id="gtm-loader" strategy="afterInteractive">
          {`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer',${JSON.stringify(GTM_ID)});
          `.trim()}
        </Script>
      ) : null}

      {!GTM_ID && GA_ID ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-config" strategy="afterInteractive">
            {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(GA_ID)}, { anonymize_ip: true });
            `.trim()}
          </Script>
        </>
      ) : null}

      {YM_ID ? (
        <>
          <Script id="ym-config" strategy="afterInteractive">
            {`
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window, document, 'script', ${JSON.stringify(`https://mc.yandex.ru/metrika/tag.js?id=${YM_ID}`)}, 'ym');
ym(${JSON.stringify(YM_ID)}, 'init', {
  ssr: true,
  webvisor: true,
  clickmap: true,
  ecommerce: 'dataLayer',
  referrer: document.referrer,
  url: location.href,
  accurateTrackBounce: true,
  trackLinks: true
});
            `.trim()}
          </Script>
          <noscript>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://mc.yandex.ru/watch/${YM_ID}`}
                style={{ position: 'absolute', left: '-9999px' }}
                alt=""
              />
            </div>
          </noscript>
        </>
      ) : null}
    </>
  );
}
