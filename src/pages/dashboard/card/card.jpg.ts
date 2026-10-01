import type { APIRoute } from 'astro';
import { cardJpeg } from '@/lib/card-artwork';
import { cardUrl, getCardForOwner, revealPin } from '@/lib/cards';
import { cardOrigin } from '@/lib/card-origin';

/**
 * The card as a JPEG, generated on request — enough to look at and print while
 * the exact-size PDF pipeline waits for Phase 7.
 *
 * Never cached: it shows the current PIN, and a rotated PIN must not survive in a
 * browser cache.
 */
export const GET: APIRoute = async ({ locals, request }) => {
  const owner = locals.owner;
  if (!owner) return new Response('Not signed in', { status: 401 });

  const card = await getCardForOwner(owner.id);
  if (!card) return new Response('No card', { status: 404 });

  const jpeg = await cardJpeg({
    pin: revealPin(card),
    url: cardUrl(card, cardOrigin(request)),
    languages: card.languages,
  });

  return new Response(new Uint8Array(jpeg), {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'content-disposition': `inline; filename="noka-card-${card.slug}.jpg"`,
    },
  });
};
