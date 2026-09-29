import { count, eq } from 'drizzle-orm';
import { getConfig } from '@/config';
import { getDb } from '@/db/client';
import { cards, contacts } from '@/db/schema';
import { activeKeyVersion, decryptJson, encryptJson } from '@/lib/crypto';
import { contactKeyring } from '@/lib/keys';
import { generatePin, formatPin, hashPin } from '@/lib/pin';
import { DEFAULT_CARD_LANGUAGES, sanitizeLanguageSet } from '@/i18n/languages';
import { generateSlug } from '@/lib/slug';

/**
 * Card lifecycle (D7, D9, D13, D27): exactly one card per account, a
 * reprintable PIN, and a state machine the dashboard drives.
 *
 * The PIN is stored twice on purpose: `pin_hash` for verification and
 * `pin_encrypted` so the owner can read, download and reprint their own card
 * for as long as it is active. Losing the encryption key therefore loses the
 * ability to *reprint*, not the ability to verify.
 */
export type Card = typeof cards.$inferSelect;

export type CardResult =
  | { ok: true; card: Card }
  | { ok: false; reason: 'no-card' | 'no-contacts' | 'already-active' | 'already-inactive' };

function keyringFromConfig() {
  return contactKeyring();
}

/** The owner's card, active or not. One row per account at the application level. */
export async function getCardForOwner(userId: string): Promise<Card | null> {
  const [card] = await getDb().select().from(cards).where(eq(cards.userId, userId)).limit(1);
  return card ?? null;
}

export async function contactCount(cardId: string): Promise<number> {
  const [row] = await getDb().select({ value: count() }).from(contacts).where(eq(contacts.cardId, cardId));
  return row?.value ?? 0;
}

/**
 * Onboarding is idempotent: calling it twice never mints a second card, and
 * the language set is the card's own ordered list (D15) — first entry is the
 * responder fallback.
 */
export async function createCardForOwner(userId: string, languages = [...DEFAULT_CARD_LANGUAGES]): Promise<Card> {
  const existing = await getCardForOwner(userId);
  if (existing) return existing;

  const db = getDb();
  const pin = generatePin();
  const [card] = await db
    .insert(cards)
    .values({
      userId,
      slug: generateSlug(),
      pinHash: await hashPin(pin),
      pinEncrypted: encryptJson({ pin }, keyringFromConfig(), activeKeyVersion(keyringFromConfig())),
      languages: sanitizeLanguageSet(languages),
      // Inactive until it has somewhere to send a responder (D28, Phase 4).
      active: false,
    })
    .returning();

  if (!card) throw new Error('Card insert returned no row');
  return card;
}

/** The owner's own PIN, decrypted for display and reprinting (D9). */
export function revealPin(card: Card): string {
  const { value } = decryptJson<{ pin: string }>(card.pinEncrypted, keyringFromConfig());
  return formatPin(value.pin);
}

/** New PIN, new hash, new ciphertext, and `pin_version` bumped so every live view cookie dies. */
export async function rotatePin(userId: string): Promise<CardResult> {
  const card = await getCardForOwner(userId);
  if (!card) return { ok: false, reason: 'no-card' };

  const ring = keyringFromConfig();
  const pin = generatePin();
  const [updated] = await getDb()
    .update(cards)
    .set({
      pinHash: await hashPin(pin),
      pinEncrypted: encryptJson({ pin }, ring, activeKeyVersion(ring)),
      pinVersion: card.pinVersion + 1,
      pinRotatedAt: new Date(),
    })
    .where(eq(cards.id, card.id))
    .returning();

  return updated ? { ok: true, card: updated } : { ok: false, reason: 'no-card' };
}

/** New QR: the old printed card stops working permanently (§15). */
export async function regenerateSlug(userId: string): Promise<CardResult> {
  const card = await getCardForOwner(userId);
  if (!card) return { ok: false, reason: 'no-card' };

  const [updated] = await getDb()
    .update(cards)
    .set({ slug: generateSlug() })
    .where(eq(cards.id, card.id))
    .returning();

  return updated ? { ok: true, card: updated } : { ok: false, reason: 'no-card' };
}

/**
 * Activation is gated on having at least one contact: an active card with
 * nothing behind it is worse than an inactive one (D28, §15).
 */
export async function setCardActive(userId: string, active: boolean): Promise<CardResult> {
  const card = await getCardForOwner(userId);
  if (!card) return { ok: false, reason: 'no-card' };
  if (card.active === active) return { ok: false, reason: active ? 'already-active' : 'already-inactive' };
  if (active && (await contactCount(card.id)) === 0) return { ok: false, reason: 'no-contacts' };

  const [updated] = await getDb().update(cards).set({ active }).where(eq(cards.id, card.id)).returning();
  return updated ? { ok: true, card: updated } : { ok: false, reason: 'no-card' };
}

/** The URL a responder's QR points at. */
export function cardUrl(card: Card, origin = getConfig().PUBLIC_CARD_ORIGIN): string {
  return `${origin.replace(/\/$/, '')}/c/${card.slug}`;
}
