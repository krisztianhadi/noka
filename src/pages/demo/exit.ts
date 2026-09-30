import type { APIRoute } from 'astro';
import { forbidden, isSameOrigin } from '@/lib/http';

/** Step four: the way out, which a real card has too. Clears the demo cookie. */
export const POST: APIRoute = ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request)) return forbidden();
  cookies.delete('noka_demo', { path: '/demo' });
  return redirect('/demo', 303);
};
