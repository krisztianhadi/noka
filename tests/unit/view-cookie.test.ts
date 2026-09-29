import { describe, expect, it } from 'vitest';
import {
  LANG_COOKIE,
  VIEW_COOKIE,
  VIEW_TTL_SECONDS,
  cardCookiePath,
  clearCookie,
  issueViewToken,
  readViewToken,
  serializeCookie,
} from '@/lib/view-cookie';

const claims = { slug: 'A'.repeat(26), pinVersion: 3 };

describe('view token', () => {
  it('round-trips the claims it was given', () => {
    const token = issueViewToken(claims);
    expect(readViewToken(token)).toMatchObject({ slug: claims.slug, pinVersion: 3 });
  });

  it('expires after exactly the configured window, and not before', () => {
    const now = 1_800_000_000_000;
    const token = issueViewToken(claims, VIEW_TTL_SECONDS, now);
    expect(VIEW_TTL_SECONDS).toBe(900);

    expect(readViewToken(token, now + 899_000)).not.toBeNull();
    expect(readViewToken(token, now + 901_000)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = issueViewToken(claims);
    const [body, mac] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...claims, pinVersion: 99 }), 'utf8').toString('base64url');
    expect(readViewToken(`${forgedBody}.${mac}`)).toBeNull();
    expect(readViewToken(`${body}.${'x'.repeat(mac!.length)}`)).toBeNull();
  });

  it('rejects anything malformed', () => {
    for (const value of ['', '.', 'abc', 'abc.', '.abc', 'a.b.c', 'not-base64.not-a-mac']) {
      expect(readViewToken(value)).toBeNull();
    }
    expect(readViewToken(undefined)).toBeNull();
    expect(readViewToken(null)).toBeNull();
  });

  it('rejects claims with the wrong shape', () => {
    const body = Buffer.from(JSON.stringify({ slug: 12, pinVersion: '3', exp: 9_999_999_999 }), 'utf8').toString(
      'base64url',
    );
    const mac = (issueViewToken(claims).split('.')[1] ?? '').length;
    expect(readViewToken(`${body}.${'0'.repeat(mac)}`)).toBeNull();
  });
});

describe('cookies', () => {
  it('scopes the view cookie per card, and makes it hard to read', () => {
    const cookie = serializeCookie(VIEW_COOKIE, 'value', { path: cardCookiePath(claims.slug), maxAge: 900 });
    expect(cookie).toContain(`Path=/c/${claims.slug}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=900');
    // Local development is http, so no Secure flag here; production is https
    // and gets it (src/lib/view-cookie.ts).
    expect(cookie).not.toContain('Secure');
  });

  it('leaves the language cookie a session cookie', () => {
    const cookie = serializeCookie(LANG_COOKIE, 'ru', { path: cardCookiePath(claims.slug) });
    expect(cookie).toContain('noka_lang=ru');
    expect(cookie).not.toContain('Max-Age');
  });

  it('clears a cookie by emptying it with Max-Age=0', () => {
    const cookie = clearCookie(VIEW_COOKIE, '/c/abc');
    expect(cookie).toContain('noka_view=;');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/c/abc');
  });
});
