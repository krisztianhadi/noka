import { defineMiddleware } from 'astro:middleware';
import { getConfig } from '@/config';
import { getAuth } from '@/lib/auth';
import { resolveOwnerLocale, LOCALE_COOKIE } from '@/lib/locale';
import { readTheme, THEME_COOKIE } from '@/lib/theme';

/**
 * Security headers of §5, applied centrally so a new route cannot forget them,
 * plus the owner-plane guard: `/dashboard/*` is unreachable without a session.
 *
 * The responder plane (`/c/*`) additionally gets the strict set: no external
 * anything, no indexing, no referrer, no back/forward-cache copy of the
 * contacts.
 */
const BASELINE: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // Nothing in this product asks for a camera, a microphone, a location, a payment
  // sheet or a USB device. One header says so for every page, so a dependency cannot
  // start asking without someone noticing the response changed.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

const RESPONDER_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The owner plane's CSP — a hardening addition from the Phase 9 header review (PLAN §5
 * only ever specified the responder plane's).
 *
 * `script-src` has to allow inline scripts, because Astro inlines the small ones: the
 * landing page's reveal-on-scroll ships verbatim inside the HTML. A nonce would need
 * plumbing through the bundler and would break the first time a page inlined something
 * new, so this is the strictest shape that ships as-is. What it buys is the half that
 * matters here — no origin but this one may be loaded, framed, connected to, styled
 * from or posted to — which closes the exfiltration and third-party channels even
 * though a future inline script would still run.
 *
 * The responder plane is stricter and stays that way: `default-src 'none'`, no scripts
 * at all, asserted per response in the e2e suite.
 */
const OWNER_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const config = getConfig();

  // The shape of a self-hosted instance (2026-10-05), decided before anything renders:
  // a solo deployment does not want a marketing page in front of its login screen, and closing
  // registration has to close the API too — hiding the form is a user-interface decision, not a
  // security one.
  if (!config.SHOW_LANDING && path === '/') {
    return new Response(null, { status: 303, headers: { location: '/login', 'cache-control': 'no-store' } });
  }
  if (!config.ALLOW_REGISTRATION && path.startsWith('/api/auth/sign-up')) {
    return new Response('Registration is closed on this instance.', { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  if (!config.ALLOW_REGISTRATION && (path === '/signup' || path === '/signup/')) {
    return new Response(null, { status: 303, headers: { location: '/login', 'cache-control': 'no-store' } });
  }

  // Read before anything renders: the theme must be right in the first paint.
  context.locals.theme = readTheme(context.cookies.get(THEME_COOKIE)?.value);
  // Same for the language: a page that renders English first and Spanish a moment later
  // is worse than either.
  context.locals.locale = resolveOwnerLocale(
    context.cookies.get(LOCALE_COOKIE)?.value,
    context.request.headers.get('accept-language'),
  );

  if (path.startsWith('/dashboard')) {
    const session = await getAuth().api.getSession({ headers: context.request.headers });
    if (!session) {
      return new Response(null, { status: 303, headers: { location: '/login', 'cache-control': 'no-store' } });
    }
    context.locals.owner = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    };
  }

  const response = await next();
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(BASELINE)) headers.set(name, value);

  if (path.startsWith('/c/')) {
    headers.set('Content-Security-Policy', RESPONDER_CSP);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('Vary', 'Accept-Language, Cookie');
  } else {
    headers.set('Content-Security-Policy', OWNER_CSP);
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'DENY');
    if (path.startsWith('/dashboard')) headers.set('Cache-Control', 'no-store');
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
