import { defineMiddleware } from 'astro:middleware';

/**
 * Security headers of §5. Applied centrally so a new route cannot forget them.
 *
 * The responder plane (`/c/*`) additionally gets the strict set: no external
 * anything, no indexing, no referrer, no back/forward-cache copy of the
 * contacts.
 */
const BASELINE: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const RESPONDER_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(BASELINE)) headers.set(name, value);

  if (context.url.pathname.startsWith('/c/')) {
    headers.set('Content-Security-Policy', RESPONDER_CSP);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('Vary', 'Accept-Language, Cookie');
  } else {
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'DENY');
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
