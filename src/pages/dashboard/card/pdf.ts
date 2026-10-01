import type { APIRoute } from 'astro';
import { cardPdf, isLayout } from '@/lib/card-pdf';
import { cardUrl, getCardForOwner, revealPin } from '@/lib/cards';
import { cardOrigin } from '@/lib/card-origin';

/**
 * The card as a print master: the exact card, one on A4, or a sheet of ten (Phase 7).
 *
 * Never cached, for the same reason the JPEG is not: it carries the current PIN, and a rotated
 * PIN must not survive in a browser cache.
 */
export const GET: APIRoute = async ({ locals, request, url }) => {
  const owner = locals.owner;
  if (!owner) return new Response('Not signed in', { status: 401 });

  const card = await getCardForOwner(owner.id);
  if (!card) return new Response('No card', { status: 404 });

  const requested = url.searchParams.get('layout');
  const layout = isLayout(requested) ? requested : 'a4';

  const pdf = await cardPdf(
    { pin: revealPin(card), url: cardUrl(card, cardOrigin(request)), languages: card.languages },
    layout,
  );

  const name = layout === 'card' ? 'noka-card' : layout === 'a4' ? 'noka-card-a4' : 'noka-cards-a4-sheet';
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'content-disposition': `inline; filename="${name}-${card.slug}.pdf"`,
    },
  });
};
