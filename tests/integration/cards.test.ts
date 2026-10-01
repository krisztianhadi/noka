import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getConfig } from '@/config';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { cards } from '@/db/schema';
import {
  cardUrl,
  countContacts,
  createCardForOwner,
  getCardForOwner,
  newCardForOwner,
  revealPin,
  type Card,
} from '@/lib/cards';
import { createContact } from '@/lib/contacts';
import { decryptJson, keyring } from '@/lib/crypto';
import { formatPin, verifyPin } from '@/lib/pin';

/**
 * Card lifecycle against the real database, as simplified on 2026-09-29:
 *
 *   a card needs a contact, and it is live the moment it exists
 *   "new card" changes the slug and the PIN together
 *
 * There is no activate/deactivate and no separate PIN/QR rotation to test.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const ring = keyring({ 1: getConfig().CONTACT_ENCRYPTION_KEY });

function rawPin(card: Card): string {
  return decryptJson<{ pin: string }>(card.pinEncrypted, ring).value.pin;
}

describeDb('card lifecycle', () => {
  const db = getDb();
  const createdUserIds: string[] = [];

  async function insertOwner(): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({ name: 'Owner', email: `card-${randomUUID()}@noka.test` })
      .returning();
    createdUserIds.push(user!.id);
    return user!.id;
  }

  async function addContact(userId: string, name = 'Maria Silva') {
    return createContact(userId, {
      name,
      relation: 'spouse',
      phone: '+66812345678',
      spokenLanguages: ['en'],
      channels: ['call', 'whatsapp'],
    });
  }

  afterAll(async () => {
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  it('refuses to make a card with nobody to reach', async () => {
    const owner = await insertOwner();
    await expect(createCardForOwner(owner)).resolves.toEqual({ ok: false, reason: 'no-contacts' });
    expect(await getCardForOwner(owner)).toBeNull();
  });

  it('makes a card that is live immediately, with the five shipped languages', async () => {
    const owner = await insertOwner();
    await addContact(owner);

    const result = await createCardForOwner(owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.card.active).toBe(true);
    expect(result.card.languages).toEqual(['en', 'es', 'fr', 'zh', 'ru']);
    expect(result.card.pinVersion).toBe(1);
    expect(await countContacts(owner)).toBe(1);
  });

  it('is idempotent: asking twice returns the same card', async () => {
    const owner = await insertOwner();
    await addContact(owner);

    const first = await createCardForOwner(owner);
    const second = await createCardForOwner(owner);
    if (!first.ok || !second.ok) throw new Error('expected cards');

    expect(second.card.id).toBe(first.card.id);
    expect(second.card.slug).toBe(first.card.slug);
  });

  /**
   * The reviews' second finding: two requests both passed the existence check, one then hit the
   * unique index and returned a 500 after two Argon2 hashes. Racing for real — `Promise.all`, not
   * two sequential calls — is what makes this test able to fail on the old code.
   */
  it('survives two creation requests arriving at once', async () => {
    const owner = await insertOwner();
    await addContact(owner);

    const [first, second] = await Promise.all([
      createCardForOwner(owner),
      createCardForOwner(owner),
    ]);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // Both callers get a usable card, and it is the same card: one per owner, not one per click.
    expect(second.card.id).toBe(first.card.id);
    const [{ total }] = await getDb()
      .select({ total: count() })
      .from(cards)
      .where(eq(cards.userId, owner));
    expect(total).toBe(1);
  });

  it('stores the PIN hashed and encrypted, and shows it formatted', async () => {
    const owner = await insertOwner();
    await addContact(owner);
    const result = await createCardForOwner(owner);
    if (!result.ok) return;

    const pin = rawPin(result.card);
    expect(pin).toMatch(/^\d{6}$/);
    expect(revealPin(result.card)).toBe(formatPin(pin));
    expect(result.card.pinHash).toMatch(/^\$argon2id\$/);
    expect(result.card.pinHash).not.toContain(pin);
    await expect(verifyPin(result.card.pinHash, pin)).resolves.toBe(true);
  });

  it('“new card” changes the slug and the PIN together, killing the old card', async () => {
    const owner = await insertOwner();
    await addContact(owner);
    const created = await createCardForOwner(owner);
    if (!created.ok) return;

    const oldSlug = created.card.slug;
    const oldPin = rawPin(created.card);

    const renewed = await newCardForOwner(owner);
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;

    expect(renewed.card.id).toBe(created.card.id);
    expect(renewed.card.slug).not.toBe(oldSlug);
    expect(renewed.card.pinVersion).toBe(created.card.pinVersion + 1);
    expect(renewed.card.active).toBe(true);
    expect(revealPin(renewed.card)).not.toBe(formatPin(oldPin));
    await expect(verifyPin(renewed.card.pinHash, oldPin)).resolves.toBe(false);
    await expect(verifyPin(renewed.card.pinHash, rawPin(renewed.card))).resolves.toBe(true);
  });

  it('keeps the contacts across a new card', async () => {
    const owner = await insertOwner();
    await addContact(owner, 'First');
    await addContact(owner, 'Second');
    const created = await createCardForOwner(owner);
    if (!created.ok) return;

    await newCardForOwner(owner);
    expect(await countContacts(owner)).toBe(2);
    expect((await getCardForOwner(owner))?.id).toBe(created.card.id);
  });

  it('reports a missing card instead of throwing', async () => {
    const owner = await insertOwner();
    await addContact(owner);
    await expect(newCardForOwner(owner)).resolves.toEqual({ ok: false, reason: 'no-card' });
  });

  it('builds the responder URL from the card origin', async () => {
    const owner = await insertOwner();
    await addContact(owner);
    const result = await createCardForOwner(owner);
    if (!result.ok) return;

    expect(cardUrl(result.card)).toBe(`${getConfig().PUBLIC_CARD_ORIGIN}/c/${result.card.slug}`);
  });
});
