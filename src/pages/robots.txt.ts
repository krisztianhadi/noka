import type { APIRoute } from 'astro';

/** §5: the responder plane must never be indexed. */
export const GET: APIRoute = () =>
  new Response(['User-agent: *', 'Disallow: /c/', 'Disallow: /dashboard/', ''].join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
