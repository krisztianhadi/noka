import { describe, expect, it } from 'vitest';
import { isSameOrigin } from '@/lib/http';

/**
 * The second lock on the CSRF door (§15).
 *
 * `SameSite=Lax` already keeps a cross-site POST from carrying the session cookie; this is the
 * check that refuses it anyway if the cookie ever arrives. Both halves matter: a request from
 * somewhere else must be refused, and a request from the site itself must be allowed even when the
 * client omits `Origin`, because every dashboard POST failing with a 403 is also a bug.
 */
const ORIGIN = 'https://noka.test';

function request(headers: Record<string, string>, url = `${ORIGIN}/dashboard/notes`): Request {
  return new Request(url, { method: 'POST', headers });
}

describe('isSameOrigin', () => {
  it('accepts the request when Origin names this site', () => {
    expect(isSameOrigin(request({ origin: ORIGIN }))).toBe(true);
  });

  it('refuses a request from another origin', () => {
    expect(isSameOrigin(request({ origin: 'https://evil.test' }))).toBe(false);
    // A prefix or suffix that merely looks like the site is still another origin.
    expect(isSameOrigin(request({ origin: 'https://noka.test.evil.test' }))).toBe(false);
    expect(isSameOrigin(request({ origin: 'http://noka.test' }))).toBe(false);
  });

  it('falls back to Referer when there is no Origin', () => {
    expect(isSameOrigin(request({ referer: `${ORIGIN}/dashboard` }))).toBe(true);
    expect(isSameOrigin(request({ referer: 'https://evil.test/page' }))).toBe(false);
  });

  it('refuses when neither header is present, or the referer is not a URL', () => {
    expect(isSameOrigin(request({}))).toBe(false);
    expect(isSameOrigin(request({ referer: 'not a url' }))).toBe(false);
  });

  it('accepts the configured card origin, which is not the request origin behind a proxy', () => {
    // The app sits behind a proxy: the browser sends the public origin, and the request arrives on
    // an internal one. The configured origin is what has to match.
    const configured = new URL(process.env.PUBLIC_CARD_ORIGIN ?? 'http://localhost:3200').origin;
    expect(isSameOrigin(request({ origin: configured }, 'http://127.0.0.1:3200/dashboard/notes'))).toBe(true);
  });
});
