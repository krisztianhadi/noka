import type { APIRoute } from 'astro';
import { getAuth } from '@/lib/auth';
import { forbidden, isSameOrigin, redirectWithCookies } from '@/lib/http';

/**
 * "Sign in with Google" (2026-10-05), as a plain form POST.
 *
 * better-auth would normally do this from the client, and this project has no client script on the
 * auth pages (the responder plane's constraint reaches further than it strictly has to, but an auth
 * page that works without JavaScript is one less thing to fail on a bad connection). So the button
 * posts here, the library builds the provider URL, and the browser is sent on.
 *
 * `asResponse` keeps better-auth's own cookies — the OAuth state cookie, without which the callback
 * cannot be trusted — and they ride along on our redirect. The provider is hard-coded because a
 * route that takes a provider from a form field is a way to be redirected anywhere.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!isSameOrigin(request)) return forbidden();

  const response = await getAuth().api.signInSocial({
    body: { provider: 'google', callbackURL: '/dashboard', errorCallbackURL: '/login?error=oauth-failed' },
    asResponse: true,
  });

  if (!response.ok) return redirectWithCookies('/login?error=oauth-failed', response);

  const body = (await response.json()) as { url?: string };
  if (!body.url) return redirectWithCookies('/login?error=oauth-failed', response);

  return redirectWithCookies(body.url, response);
};
