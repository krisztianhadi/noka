import { randomUUID } from 'node:crypto';
import type { getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { cards } from '@/db/schema';

/**
 * An owner and a card, for tests that need something for rows to hang off and nothing more.
 *
 * The card is never rendered, so its PIN hash is a placeholder string and the encrypted PIN
 * is three bytes of nonsense — both are only there to satisfy `not null`. Tests that care
 * about a real card go through the services instead.
 *
 * Deleting the owner cascades to the card and to anything hanging off it, so callers clean up
 * with one `delete from users`.
 */
export async function insertOwnerWithCard(
  db: ReturnType<typeof getDb>,
): Promise<{ userId: string; cardId: string }> {
  const [user] = await db
    .insert(users)
    .values({ name: 'Owner', email: `fixture-${randomUUID()}@noka.test` })
    .returning();
  const [card] = await db
    .insert(cards)
    .values({
      userId: user!.id,
      slug: randomUUID().replace(/-/g, '').slice(0, 26).toUpperCase(),
      pinHash: '$argon2id$v=19$m=19456,t=2,p=1$placeholder',
      pinEncrypted: Buffer.from([1, 2, 3]),
      active: true,
    })
    .returning();
  return { userId: user!.id, cardId: card!.id };
}
