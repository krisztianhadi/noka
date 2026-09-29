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
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([getConfig().PUBLIC_CARD_ORIGIN, getConfig().BETTER_AUTH_URL, new URL(request.url).origin]);
  return [...allowed].some((value) => value !== undefined && value === origin);
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

/** Pulls the human-readable message out of a better-auth JSON error response. */
export async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.clone().json()) as { message?: string };
    return body.message?.trim() || fallback;
  } catch {
    return fallback;
  }
}
