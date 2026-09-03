'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSiteLegal } from '@/lib/useSiteLegal';
import { useSiteShell } from '@/lib/useSiteShell';
import { DEFAULT_LOGO_URL } from '@/lib/siteShellDefaults';

export default function Footer() {
  const legal = useSiteLegal();
  const { footer, branding } = useSiteShell();
  const [email, setEmail] = useState('');
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [openFooterSections, setOpenFooterSections] = useState<Record<string, boolean>>({});

  const toggleFooterSection = (section: string) => {
    setOpenFooterSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSubscribe = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || isSubscribing) return;
    setIsSubscribing(true);
    setSubscriptionMessage(null);
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (response.ok) {
        setSubscriptionMessage(data.message);
        if (!data.alreadySubscribed) setEmail('');
      } else {
        setSubscriptionMessage(data.error || 'Произошла ошибка');
      }
    } catch {
      setSubscriptionMessage('Произошла ошибка при отправке запроса');
    } finally {
      setIsSubscribing(false);
    }
  };

  const logoSrc = branding.logoUrl?.trim() || DEFAULT_LOGO_URL;
  const legalEntityName = legal.entityName.trim();
  const legalInn = legal.inn.trim();
  const legalAddress = legal.legalAddress.trim();
  const hasLegalRequisites = Boolean(legalEntityName || legalInn || legalAddress);

  return (
    <footer className="w-full flex flex-col items-center">
      <div
        className="w-full md:w-[80%] py-10 sm:py-12 md:py-14"
        style={{ backgroundColor: footer.backgroundColor }}
      >
        <div className="container mx-auto px-0 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8 sm:gap-10 md:gap-12">
              <div className="md:col-span-2 px-4 md:px-0">
                <h3
                  className="text-xs sm:text-sm mb-3 sm:mb-4 text-white"
                  style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 400, letterSpacing: '0.05em' }}
                >
                  {footer.newsletterTitle}
                </h3>
                <p
                  className="text-xs mb-6 sm:mb-8 leading-relaxed text-white/80"
                  style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 400, letterSpacing: '0.02em', lineHeight: '1.6' }}
                >
                  {footer.newsletterDescription}
                </p>
                <form onSubmit={handleSubscribe} className="mb-4">
                  <div className="flex items-center gap-2 border-b border-white/30 pb-2">
                    <input
                      type="email"
                      placeholder={footer.newsletterPlaceholder}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isSubscribing}
                      className="flex-1 bg-transparent text-white placeholder:text-white/60 focus:outline-none text-xs"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                      required
                    />
                    <button
                      type="submit"
                      disabled={isSubscribing || !email.trim()}
                      className="text-white text-xs cursor-pointer hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ fontFamily: 'var(--font-open-sans)', background: 'none', border: 'none', padding: 0 }}
                    >
                      →
                    </button>
                  </div>
                </form>
                {subscriptionMessage && (
                  <p
                    className="text-xs mb-4 text-white/90"
                    style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em', lineHeight: '1.4' }}
                  >
                    {subscriptionMessage}
                  </p>
                )}
                <p
                  className="text-xs text-white/70"
                  style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em', lineHeight: '1.4' }}
                >
                  {footer.newsletterDisclaimer}
                </p>
              </div>
              <div className="px-4 md:px-0">
                <button
                  onClick={() => toggleFooterSection('contact')}
                  className="md:pointer-events-none w-full flex items-center justify-between py-3 md:py-0 border-b border-white/20 md:border-0 mb-4 sm:mb-5"
                >
                  <h4
                    className="text-xs uppercase tracking-wider text-white"
                    style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 400, letterSpacing: '0.1em' }}
                  >
                    {footer.contactColumnTitle}
                  </h4>
                  <span
                    className="md:hidden text-white/80 transition-transform duration-300 ease-in-out"
                    style={{ transform: openFooterSections['contact'] ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  >
                    ›
                  </span>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-500 ease-in-out ${openFooterSections['contact'] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 md:max-h-96 md:opacity-100'}`}
                >
                  <ul className="space-y-2 sm:space-y-3">
                    <li>
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
                        className="text-xs text-white/80 relative inline-block group"
                        style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        {footer.contactButtonLabel}
                        <span className="absolute bottom-0 left-0 right-0 h-px bg-white origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></span>
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="px-4 md:px-0">
                <button
                  onClick={() => toggleFooterSection('social')}
                  className="md:pointer-events-none w-full flex items-center justify-between py-3 md:py-0 border-b border-white/20 md:border-0 mb-4 sm:mb-5"
                >
                  <h4
                    className="text-xs uppercase tracking-wider text-white"
                    style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 400, letterSpacing: '0.1em' }}
                  >
                    {footer.socialColumnTitle}
                  </h4>
                  <span
                    className="md:hidden text-white/80 transition-transform duration-300 ease-in-out"
                    style={{ transform: openFooterSections['social'] ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  >
                    ›
                  </span>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-500 ease-in-out ${openFooterSections['social'] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 md:max-h-96 md:opacity-100'}`}
                >
                  <ul className="space-y-2 sm:space-y-3">
                    {footer.socialLinks.map((social) => (
                      <li key={social.name + social.url}>
                        <a
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-white/80 relative inline-block group"
                          style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                        >
                          {social.name}
                          <span className="absolute bottom-0 left-0 right-0 h-px bg-white origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="px-4 md:px-0">
                <button
                  onClick={() => toggleFooterSection('legal')}
                  className="md:pointer-events-none w-full flex items-center justify-between py-3 md:py-0 border-b border-white/20 md:border-0 mb-4 sm:mb-5"
                >
                  <h4
                    className="text-xs uppercase tracking-wider text-white"
                    style={{ fontFamily: 'var(--font-open-sans)', fontWeight: 400, letterSpacing: '0.1em' }}
                  >
                    {footer.legalColumnTitle}
                  </h4>
                  <span
                    className="md:hidden text-white/80 transition-transform duration-300 ease-in-out"
                    style={{ transform: openFooterSections['legal'] ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  >
                    ›
                  </span>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-500 ease-in-out ${openFooterSections['legal'] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 md:max-h-96 md:opacity-100'}`}
                >
                  <ul className="space-y-2 sm:space-y-3">
                    {footer.legalLinks.map((item) => (
                      <li key={item.href + item.label}>
                        <Link
                          href={item.href}
                          className="text-xs text-white/80 relative inline-block group"
                          style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                        >
                          {item.label}
                          <span className="absolute bottom-0 left-0 right-0 h-px bg-white origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className="w-full md:w-[80%] py-6 sm:py-8 flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: 'transparent' }}
      >
        <Link href="/" className="mb-3">
          <img src={logoSrc} alt="Логотип" className="h-12 sm:h-14 md:h-16 w-auto" />
        </Link>
        {footer.showLegalRequisites && hasLegalRequisites ? (
          <div
            className="max-w-2xl text-center text-[11px] sm:text-xs text-gray-500 leading-relaxed mb-3"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            {legalEntityName ? <p className="font-medium text-gray-600">{legalEntityName}</p> : null}
            {legalInn ? <p>ИНН {legalInn}</p> : null}
            {legalAddress ? <p>Юридический адрес: {legalAddress}</p> : null}
          </div>
        ) : null}
        <p className="text-xs text-gray-500" style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}>
          {footer.copyrightText}
        </p>
      </div>
    </footer>
  );
}
