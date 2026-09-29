import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getConfig } from '@/config';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { contacts } from '@/db/schema';
import {
  cardUrl,
  createCardForOwner,
  getCardForOwner,
  regenerateSlug,
  revealPin,
  rotatePin,
  setCardActive,
  type Card,
} from '@/lib/cards';
import { decryptJson, encryptJson, keyring } from '@/lib/crypto';
import { formatPin, verifyPin } from '@/lib/pin';
import { isSlug } from '@/lib/slug';

/**
 * Card lifecycle against the real database (Phase 3, D7/D9/D13).
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

  afterAll(async () => {
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  it('creates exactly one card per account, idempotently', async () => {
    const owner = await insertOwner();
    const first = await createCardForOwner(owner);
    const second = await createCardForOwner(owner);
    expect(second.id).toBe(first.id);
    expect(isSlug(first.slug)).toBe(true);
  });

  it('starts inactive with the five shipped languages', async () => {
    const card = await createCardForOwner(await insertOwner());
    expect(card.active).toBe(false);
    expect(card.languages).toEqual(['en', 'es', 'fr', 'zh', 'ru']);
    expect(card.pinVersion).toBe(1);
    expect(card.scanCount).toBe(0);
  });

  it('stores a six-digit PIN hashed and encrypted, and shows it formatted', async () => {
    const card = await createCardForOwner(await insertOwner());
    const pin = rawPin(card);

    expect(pin).toMatch(/^\d{6}$/);
    expect(revealPin(card)).toBe(formatPin(pin));
    expect(card.pinHash).toMatch(/^\$argon2id\$/);
    expect(card.pinHash).not.toContain(pin);
    await expect(verifyPin(card.pinHash, pin)).resolves.toBe(true);
  });

  it('rotates the PIN: new hash, bumped version, old PIN dead', async () => {
    const owner = await insertOwner();
    const card = await createCardForOwner(owner);
    const oldPin = rawPin(card);

    const result = await rotatePin(owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.card.pinVersion).toBe(card.pinVersion + 1);
    expect(result.card.pinHash).not.toBe(card.pinHash);
    expect(result.card.slug).toBe(card.slug);
    expect(result.card.pinRotatedAt).not.toBeNull();

    // The version bump is what kills live view cookies; the hash swap is what
    // makes the old PIN useless.
    await expect(verifyPin(result.card.pinHash, oldPin)).resolves.toBe(false);
    await expect(verifyPin(result.card.pinHash, rawPin(result.card))).resolves.toBe(true);
  });

  it('regenerates the slug without touching the PIN or the state', async () => {
    const owner = await insertOwner();
    const card = await createCardForOwner(owner);

    const result = await regenerateSlug(owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.card.slug).not.toBe(card.slug);
    expect(isSlug(result.card.slug)).toBe(true);
    expect(rawPin(result.card)).toBe(rawPin(card));
    expect(result.card.active).toBe(card.active);

    const reread = await getCardForOwner(owner);
    expect(reread?.slug).toBe(result.card.slug);
  });

  it('refuses to activate a card with no contacts (D28)', async () => {
    const owner = await insertOwner();
    const card = await createCardForOwner(owner);

    const refused = await setCardActive(owner, true);
    expect(refused).toEqual({ ok: false, reason: 'no-contacts' });
    expect((await getCardForOwner(owner))?.active).toBe(false);

    // One contact is enough.
    await db.insert(contacts).values({
      cardId: card.id,
      payloadEncrypted: encryptJson(
        {
          schema: 2,
          name: 'Maria Silva',
          relation: 'spouse',
          phone_e164: '+66812345678',
          phone_display: '+66 81 234 5678',
          spoken_languages: ['en'],
        },
        ring,
      ),
      keyVersion: 1,
    });

    const activated = await setCardActive(owner, true);
    expect(activated.ok).toBe(true);
    expect((await getCardForOwner(owner))?.active).toBe(true);

    const again = await setCardActive(owner, true);
    expect(again).toEqual({ ok: false, reason: 'already-active' });

    const off = await setCardActive(owner, false);
    expect(off.ok).toBe(true);
    expect((await getCardForOwner(owner))?.active).toBe(false);
  });

  it('reports a missing card instead of throwing', async () => {
    const owner = await insertOwner();
    await expect(rotatePin(owner)).resolves.toEqual({ ok: false, reason: 'no-card' });
    await expect(regenerateSlug(owner)).resolves.toEqual({ ok: false, reason: 'no-card' });
    await expect(setCardActive(owner, true)).resolves.toEqual({ ok: false, reason: 'no-card' });
  });

  it('builds the responder URL from the card origin', async () => {
    const card = await createCardForOwner(await insertOwner());
    expect(cardUrl(card)).toBe(`${getConfig().PUBLIC_CARD_ORIGIN}/c/${card.slug}`);
  });
});
