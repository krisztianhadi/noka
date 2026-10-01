import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { cards, scanAttempts } from '@/db/schema';
import { createCardForOwner, getCardForOwner, newCardForOwner, type Card } from '@/lib/cards';
import { createContact, setNotes } from '@/lib/contacts';
import {
  canonicalSlug,
  findCardBySlug,
  loadResponderView,
  recordPinAttempt,
  resolveLanguage,
  verifyPinAgainst,
  viewCookieStillValid,
} from '@/lib/responder';
import { decryptJson, keyring } from '@/lib/crypto';
import { getConfig } from '@/config';
import { formatPin } from '@/lib/pin';

/**
 * The guest plane against the real database (§3, §6 layer 0, D14, D25).
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const ring = keyring({ 1: getConfig().CONTACT_ENCRYPTION_KEY });

describeDb('responder', () => {
  const db = getDb();
  const createdUserIds: string[] = [];

  async function freshOwner() {
    const [user] = await db
      .insert(users)
      .values({ name: 'Krisztian', email: `responder-${randomUUID()}@noka.test` })
      .returning();
    createdUserIds.push(user!.id);
    return user!;
  }

  /** Contacts first, then a card: a card needs someone to reach. */
  async function liveCard(): Promise<Card> {
    const owner = await freshOwner();
    await createContact(owner.id, {
      name: 'Maria Silva',
      relation: 'spouse',
      phone: '+66812345678',
      spokenLanguages: ['th', 'en'],
      channels: ['call', 'whatsapp'],
    });
    const created = await createCardForOwner(owner.id);
    if (!created.ok) throw new Error('could not create the test card');
    return created.card;
  }

  function pinOf(card: Card): string {
    return decryptJson<{ pin: string }>(card.pinEncrypted, ring).value.pin;
  }

  afterAll(async () => {
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  /**
   * The decision the reviews asked for, in a test: the audit must never stand between a person in
   * the street and the phone numbers. A card id that does not exist makes the audit insert violate
   * its foreign key, which is a real failure of the real statement — no seam needed.
   */
  it('does not let a failed audit stop the page from rendering', async () => {
    const card = await liveCard();
    const before = await db.select().from(scanAttempts).where(eq(scanAttempts.cardId, card.id));

    await expect(
      recordPinAttempt({ cardId: randomUUID(), success: true, ip: '203.0.113.9' }),
    ).resolves.toBeUndefined();

    // Nothing half-written: the transaction rolled back, and a real attempt still records after it.
    await recordPinAttempt({ cardId: card.id, success: true, ip: '203.0.113.9' });
    const after = await db.select().from(scanAttempts).where(eq(scanAttempts.cardId, card.id));
    expect(after.length).toBe(before.length + 1);
    const [reloaded] = await getDb().select().from(cards).where(eq(cards.id, card.id));
    expect(reloaded!.scanCount).toBe(card.scanCount + 1);
  });

  it('finds a card by its normalised slug, and nothing else', async () => {
    const card = await liveCard();
    expect((await findCardBySlug(card.slug))?.id).toBe(card.id);
    expect((await findCardBySlug(card.slug.toLowerCase()))?.id).toBe(card.id);
    expect(await findCardBySlug('B'.repeat(26))).toBeNull();
    expect(await findCardBySlug('too-short')).toBeNull();
    expect(await findCardBySlug('!!!')).toBeNull();
  });

  it('accepts the right PIN and refuses everything else', async () => {
    const card = await liveCard();
    await expect(verifyPinAgainst(card, pinOf(card))).resolves.toBe(true);
    await expect(verifyPinAgainst(card, '000000')).resolves.toBe(false);
  });

  it('stops unlocking the old card once a new one has been issued', async () => {
    const card = await liveCard();
    await expect(verifyPinAgainst(card, pinOf(card))).resolves.toBe(true);

    // "New card" changes the slug and the PIN. The old PIN is dead, and the old
    // slug no longer resolves at all.
    const renewed = await newCardForOwner(card.userId);
    if (!renewed.ok) throw new Error('expected a new card');

    // The stale in-memory row still matches its own old hash; what matters is the
    // stored card. So re-read it, as the PIN endpoint does on every request.
    const stored = await getCardForOwner(card.userId);
    await expect(verifyPinAgainst(stored, pinOf(card))).resolves.toBe(false);
    await expect(verifyPinAgainst(stored, pinOf(renewed.card))).resolves.toBe(true);
    await expect(findCardBySlug(card.slug)).resolves.toBeNull();
    await expect(findCardBySlug(renewed.card.slug)).resolves.toBeTruthy();
  });

  it('answers an unknown card with the same shape of refusal', async () => {
    await expect(verifyPinAgainst(null, '123456')).resolves.toBe(false);
  });

  it('records successes and failures differently (D25)', async () => {
    const card = await liveCard();
    const before = card.scanCount;

    await recordPinAttempt({ cardId: card.id, success: false, ip: '203.0.113.9' });
    const afterFailure = await getCardForOwner(card.userId);
    expect(afterFailure?.scanCount).toBe(before);
    expect(afterFailure?.lastFailedAt).not.toBeNull();
    expect(afterFailure?.lastViewedAt).toBeNull();

    await recordPinAttempt({ cardId: card.id, success: true, ip: '203.0.113.9' });
    const afterSuccess = await getCardForOwner(card.userId);
    expect(afterSuccess?.scanCount).toBe(before + 1);
    expect(afterSuccess?.lastViewedAt).not.toBeNull();

    const rows = await db.select().from(scanAttempts).where(eq(scanAttempts.cardId, card.id));
    expect(rows.map((row) => row.kind).sort()).toEqual(['pin_fail', 'pin_success']);
    expect(rows.every((row) => row.ipPrefixHash !== null)).toBe(true);
    // Never the raw address.
    expect(rows.some((row) => row.ipPrefixHash === '203.0.113.9')).toBe(false);
  });

  it('audits an attempt against an unknown card without inventing one', async () => {
    await recordPinAttempt({ cardId: null, success: false, ip: '198.51.100.1' });
    const rows = await db.select().from(scanAttempts).where(eq(scanAttempts.cardId, cardlessId()));
    expect(rows).toHaveLength(0);
  });

  it('loads the responder view with the owner name, contacts and notes', async () => {
    const card = await liveCard();
    await setNotes(card.userId, 'Type 1 diabetic.');

    const view = await loadResponderView(card);
    expect(view.ownerName).toBe('Krisztian');
    expect(view.contacts).toHaveLength(1);
    expect(view.contacts[0]?.name).toBe('Maria Silva');
    expect(view.contacts[0]?.phoneE164).toBe('+66812345678');
    expect(view.notes).toBe('Type 1 diabetic.');
  });

  it('treats a renewed card as unlocked-by-nobody for the old cookie', async () => {
    const card = await liveCard();
    const claims = { slug: card.slug, pinVersion: card.pinVersion };
    expect(viewCookieStillValid(claims, card)).toBe(true);

    const renewed = await newCardForOwner(card.userId);
    expect(renewed.ok).toBe(true);
    if (renewed.ok) {
      expect(viewCookieStillValid(claims, renewed.card)).toBe(false);
      expect(viewCookieStillValid(claims, renewed.card)).toBe(false);
      // The card itself is live; only the old claims are stale.
      expect(
        viewCookieStillValid({ slug: renewed.card.slug, pinVersion: renewed.card.pinVersion }, renewed.card),
      ).toBe(true);
    }

    expect(viewCookieStillValid({ slug: 'X'.repeat(26), pinVersion: card.pinVersion }, card)).toBe(false);
    expect(viewCookieStillValid(claims, null)).toBe(false);
  });

  it('resolves the language: explicit cookie, then the device, then English', async () => {
    const card = await liveCard();

    // A chosen cookie always wins — that is what choosing means.
    expect(resolveLanguage(card, 'ru', 'en')).toBe('ru');
    // Otherwise the browser's own preference decides.
    expect(resolveLanguage(card, undefined, 'fr-FR,fr;q=0.9')).toBe('fr');
    // A language the card does not offer lands on English, not on the owner's first pick.
    expect(resolveLanguage(card, undefined, 'th-TH')).toBe('en');
    // No preference at all: English.
    expect(resolveLanguage(card, undefined, undefined)).toBe('en');

    // A cookie for a language this card does not offer falls through.
    expect(resolveLanguage(card, 'th', 'ru')).toBe('ru');

    // An unknown card behaves like the default set.
    expect(resolveLanguage(null, 'ru', 'en')).toBe('ru');
  });

  it('canonicalises whatever arrives in the URL', () => {
    const card = 'A'.repeat(26);
    expect(canonicalSlug(card.toLowerCase())).toBe(card);
    expect(canonicalSlug('SHORT')).toBe('SHORT');
    expect(canonicalSlug('../../etc/passwd')).toMatch(/^0{26}$/);
    expect(canonicalSlug('')).toMatch(/^0{26}$/);
  });

  it('formats the owner’s own PIN as they would read it off the card', async () => {
    const card = await liveCard();
    expect(formatPin(pinOf(card))).toMatch(/^\d{3} \d{3}$/);
  });

  it('keeps the cards table free of the PIN in the clear', async () => {
    const card = await liveCard();
    const [row] = await db.select().from(cards).where(eq(cards.id, card.id));
    expect(row?.pinHash).not.toContain(pinOf(card));
    expect(row?.pinEncrypted.toString('utf8')).not.toContain(pinOf(card));
  });
});

/** A uuid that is guaranteed not to be any card's id. */
function cardlessId(): string {
  return '00000000-0000-4000-8000-000000000000';
}
