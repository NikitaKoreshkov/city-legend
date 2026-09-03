/**
 * Runs once when the Node.js server process starts (next start / standalone).
 * Warms up PostgreSQL + initDatabase() so the first webhook request is not blocked.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  // Skip during `next build` — DB may be unavailable and we must not fail the build
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  try {
    const { installMaxTlsTrust } = await import('@/lib/bots/maxTls');
    installMaxTlsTrust();
  } catch (err) {
    console.error('[instrumentation] MAX TLS trust install failed:', err);
  }

  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    const { ensureDatabase } = await import('@/lib/db');
    await ensureDatabase();
    if (process.env.NODE_ENV === 'production') {
      console.log('[instrumentation] Database warmup complete');
    }
  } catch (err) {
    console.error('[instrumentation] Database warmup failed:', err);
  }

  // Автоматически регистрируем вебхук СДЭК при каждом старте сервера.
  // Если вебхук уже есть — СДЭК просто вернёт существующий, дубли не создаются.
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
    const cdekId = process.env.CDEK_CLIENT_ID?.trim();
    const cdekSecret = process.env.CDEK_CLIENT_SECRET?.trim();
    if (siteUrl && cdekId && cdekSecret && process.env.NODE_ENV === 'production') {
      const webhookUrl = `${siteUrl}/api/webhooks/cdek`;
      const { cdekRegisterWebhook } = await import('@/lib/cdekClient');
      const r = await cdekRegisterWebhook(webhookUrl);
      console.log(`[instrumentation] CDEK webhook: ${r.ok ? 'OK' : 'WARN'} — ${r.message} (${webhookUrl})`);
    }
  } catch (err) {
    console.error('[instrumentation] CDEK webhook registration failed:', err);
  }
}
