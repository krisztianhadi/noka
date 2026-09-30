import type { APIRoute } from 'astro';
import { DEMO_PIN } from '@/lib/demo';
import { forbidden, isSameOrigin } from '@/lib/http';
import { normalizePinInput } from '@/lib/pin';

/**
 * Step two: the PIN check.
 *
 * The real endpoint hashes, audits and rate-limits a secret the owner keeps. There is nothing to
 * protect here — the PIN is printed on the page — so this compares a constant and sets a cookie
 * for the demo's lifetime. Deliberately not reusing the real responder code: a demo path that
 * touched the same table would be a liability for no gain.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request)) return forbidden();

  const form = await request.formData();
  const entered = normalizePinInput(String(form.get('pin') ?? ''));

  if (entered !== DEMO_PIN) return redirect('/demo?error=1', 303);

  cookies.set('noka_demo', 'ok', {
    path: '/demo',
    maxAge: 60 * 60,
    httpOnly: true,
    sameSite: 'lax',
  });
  return redirect('/demo/view', 303);
};
