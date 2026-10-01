import { getConfig } from '@/config';

/**
 * Small HTTP helpers for the server-rendered forms. No client JavaScript is
 * involved anywhere in the owner plane either (§3, D6).
 */

/**
 * Origin check on every state-changing POST (§15). `SameSite=Lax` already
 * stops a cross-site POST from carrying the session cookie; this is the
 * second lock on the same door.
 */
export function isSameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  const allowed = new Set([getConfig().PUBLIC_CARD_ORIGIN, getConfig().BETTER_AUTH_URL, url.origin]);

  const origin = request.headers.get('origin');
  if (origin) return [...allowed].some((value) => value !== undefined && value === origin);

  // No Origin header: some clients (a plain form post from a proxy, an older browser, a fetch
  // with `referrerPolicy: no-referrer` on the request but not the document) omit it, and every
  // dashboard POST then failed with a 403 through no fault of theirs. Referer says the same
  // thing; when both are missing the request is refused, which is the whole point of the check.
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    return [...allowed].some((value) => value !== undefined && new URL(referer).origin === value);
  } catch {
    return false;
  }
}

export function forbidden(): Response {
  return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
}

/** 303 with the Set-Cookie headers of an upstream response (better-auth) carried over. */
export function redirectWithCookies(location: string, upstream?: Response): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  if (upstream) {
    for (const cookie of upstream.headers.getSetCookie()) headers.append('set-cookie', cookie);
  }
  return new Response(null, { status: 303, headers });
}

/** Reads a field from a form body as a trimmed string. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Form parsing that cannot throw. `request.formData()` raises a TypeError when
 * a POST arrives with no body or a content type it does not understand — a bot,
 * a scanner, or a stale form. The responder plane must answer with its normal
 * page, not a 500, so every caller goes through here.
 */
export async function readForm(request: Request): Promise<FormData | null> {
  const contentType = request.headers.get('content-type') ?? '';
  const acceptable =
    contentType.startsWith('application/x-www-form-urlencoded') || contentType.startsWith('multipart/form-data');
  if (!acceptable) return null;

  try {
    return await request.formData();
  } catch {
    return null;
  }
}

/** Pulls the human-readable message out of a better-auth JSON error response. */
export async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.clone().json()) as { message?: string };
    return body.message?.trim() || fallback;
  } catch {
    return fallback;
  }
}
