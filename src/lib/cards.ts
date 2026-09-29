import { count, eq } from 'drizzle-orm';
import { getConfig } from '@/config';
import { getDb } from '@/db/client';
import { cards, contacts } from '@/db/schema';
import { activeKeyVersion, decryptJson, encryptJson } from '@/lib/crypto';
import { contactKeyring } from '@/lib/keys';
import { DEFAULT_CARD_LANGUAGES, sanitizeLanguageSet } from '@/i18n/languages';
import { formatPin, generatePin, hashPin } from '@/lib/pin';
import { generateSlug } from '@/lib/slug';

/**
 * Card lifecycle (D9, D13 — simplified 2026-09-29 after his test pass).
 *
 * A card exists because there are contacts to reach, and it is **live the moment
 * it exists**. The switch-on/switch-off pair and the separate "new PIN" / "new QR"
 * actions are gone; there are two things an owner can do:
 *
 *   make a card      — needs at least one contact; it is active immediately
 *   make a new card  — new slug and new PIN in one action, which kills the
 *                      printed card outright
 *
 * The PIN is still stored twice (a hash to verify, a ciphertext to reprint), and
 * `pin_version` still exists so rotation invalidates live view cookies.
 */
export type Card = typeof cards.$inferSelect;

export type CardResult = { ok: true; card: Card } | { ok: false; reason: 'no-card' | 'no-contacts' };

export async function getCardForOwner(userId: string): Promise<Card | null> {
  const [card] = await getDb().select().from(cards).where(eq(cards.userId, userId)).limit(1);
  return card ?? null;
}

/** How many people the owner has added, card or no card. */
export async function countContacts(userId: string): Promise<number> {
  const [row] = await getDb().select({ value: count() }).from(contacts).where(eq(contacts.userId, userId));
  return row?.value ?? 0;
}

/** A card needs somewhere to send a responder: no contacts, no card. */
export async function createCardForOwner(
  userId: string,
  languages = [...DEFAULT_CARD_LANGUAGES],
): Promise<CardResult> {
  const existing = await getCardForOwner(userId);
  if (existing) return { ok: true, card: existing };
  if ((await countContacts(userId)) === 0) return { ok: false, reason: 'no-contacts' };

  const ring = contactKeyring();
  const pin = generatePin();
  const [card] = await getDb()
    .insert(cards)
    .values({
      userId,
      slug: generateSlug(),
      pinHash: await hashPin(pin),
      pinEncrypted: encryptJson({ pin }, ring, activeKeyVersion(ring)),
      languages: sanitizeLanguageSet(languages),
      active: true,
    })
    .returning();

  if (!card) throw new Error('Card insert returned no row');
  return { ok: true, card };
}

/**
 * "New card": a new slug and a new PIN in one action. The previous printed card
 * stops resolving immediately — that is the point, and the reason it is one
 * button rather than two.
 */
export async function newCardForOwner(userId: string): Promise<CardResult> {
  const card = await getCardForOwner(userId);
  if (!card) return { ok: false, reason: 'no-card' };
  if ((await countContacts(userId)) === 0) return { ok: false, reason: 'no-contacts' };

  const ring = contactKeyring();
  const pin = generatePin();
  const [updated] = await getDb()
    .update(cards)
    .set({
      slug: generateSlug(),
      pinHash: await hashPin(pin),
      pinEncrypted: encryptJson({ pin }, ring, activeKeyVersion(ring)),
      pinVersion: card.pinVersion + 1,
      pinRotatedAt: new Date(),
      active: true,
    })
    .where(eq(cards.id, card.id))
    .returning();

  return updated ? { ok: true, card: updated } : { ok: false, reason: 'no-card' };
}

/** The owner's own PIN, decrypted for display and reprinting (D9). */
export function revealPin(card: Card): string {
  const { value } = decryptJson<{ pin: string }>(card.pinEncrypted, contactKeyring());
  return formatPin(value.pin);
}

/** The URL a responder's QR points at. */
export function cardUrl(card: Card, origin = getConfig().PUBLIC_CARD_ORIGIN): string {
  return `${origin.replace(/\/$/, '')}/c/${card.slug}`;
}
