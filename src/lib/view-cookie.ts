import { createHmac, timingSafeEqual } from 'node:crypto';
import { getConfig } from '@/config';

/**
 * The guest's view cookie (§3, D14): `{slug, pin_version, exp}`, signed with
 * its own secret (D22), absolute 15 minutes with no sliding renewal.
 *
 * Validating the signature here is only half the job — the caller must still
 * check `slug`, `pinVersion` and `active` against the database on every view,
 * because that is what makes a rotated PIN or a deactivated card take effect
 * immediately.
 */
export const VIEW_COOKIE = 'noka_view';
export const LANG_COOKIE = 'noka_lang';
export const VIEW_TTL_SECONDS = 15 * 60;

export interface ViewClaims {
  slug: string;
  pinVersion: number;
  /** Unix seconds. */
  exp: number;
}

function secret(): string {
  return getConfig().VIEW_COOKIE_SECRET;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueViewToken(
  claims: { slug: string; pinVersion: number },
  ttlSeconds = VIEW_TTL_SECONDS,
  nowMs = Date.now(),
): string {
  const full: ViewClaims = {
    slug: claims.slug,
    pinVersion: claims.pinVersion,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/** Null for anything unsigned, tampered, malformed or expired. */
export function readViewToken(value: string | undefined | null, nowMs = Date.now()): ViewClaims | null {
  if (!value) return null;
  const [body, mac, ...rest] = value.split('.');
  if (!body || !mac || rest.length > 0) return null;
  if (!safeEqual(mac, sign(body))) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<ViewClaims>;
    if (typeof claims.slug !== 'string' || claims.slug.length === 0) return null;
    if (typeof claims.pinVersion !== 'number' || !Number.isInteger(claims.pinVersion)) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return null;
    return { slug: claims.slug, pinVersion: claims.pinVersion, exp: claims.exp };
  } catch {
    return null;
  }
}

function secureOnly(): boolean {
  return getConfig().PUBLIC_CARD_ORIGIN.startsWith('https://');
}

interface CookieOptions {
  path: string;
  maxAge?: number;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${value}`, `Path=${options.path}`, 'SameSite=Lax', 'HttpOnly'];
  if (secureOnly()) parts.push('Secure');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

/** `Path=/c/{slug}` is what stops one card's cookie from touching another (D19). */
export function cardCookiePath(slug: string): string {
  return `/c/${slug}`;
}

export function clearCookie(name: string, path: string): string {
  return serializeCookie(name, '', { path, maxAge: 0 });
}
