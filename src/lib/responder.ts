import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { cards, scanAttempts } from '@/db/schema';
import { users } from '@/db/auth-schema';
import { negotiateLanguage } from '@/i18n/negotiate';
import { DEFAULT_CARD_LANGUAGES, primarySubtag, sanitizeLanguageSet, type CardLanguage } from '@/i18n/languages';
import { getNotes, listContacts, type ContactView } from '@/lib/contacts';
import { decoyVerify, verifyPin } from '@/lib/pin';
import { hashIp } from '@/lib/request-ip';
import { normalizeSlug } from '@/lib/slug';
import type { Card } from '@/lib/cards';

/**
 * The guest plane's behaviour, in one place so the PIN page, the view, the
 * language switch and the hide link cannot disagree about it (§3, D19).
 */

/** Layer 0 of §6: every response takes at least this long. */
export const RESPONSE_FLOOR_MS = 350;

export async function padTo(startedAtMs: number, floorMs = RESPONSE_FLOOR_MS): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < floorMs) await new Promise((resolve) => setTimeout(resolve, floorMs - elapsed));
}

/** A syntactically valid slug that no card can have — a safe redirect target. */
const PLACEHOLDER_SLUG = '0'.repeat(26);

/**
 * Normalise whatever arrived in the URL. Anything with characters that do not
 * belong in a slug becomes the placeholder, so a hostile path can never reach a
 * `Location` header or a cookie `Path` unchanged.
 */
export function canonicalSlug(raw: string): string {
  const normalised = normalizeSlug(raw);
  if (normalised) return normalised;
  const trimmed = raw.trim();
  return /^[0-9A-Za-z_-]{1,64}$/.test(trimmed) ? trimmed.toUpperCase() : PLACEHOLDER_SLUG;
}

/** Normalised lookup. An unknown, revoked or deactivated slug is just `null`. */
export async function findCardBySlug(rawSlug: string): Promise<Card | null> {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return null;
  const [card] = await getDb().select().from(cards).where(eq(cards.slug, slug)).limit(1);
  return card ?? null;
}

export function cardLanguages(card: Card): CardLanguage[] {
  return sanitizeLanguageSet(card.languages ?? DEFAULT_CARD_LANGUAGES);
}

/**
 * Language precedence (D19): the responder's own choice, then `Accept-Language`
 * ∩ the card's set, then the card's first language. A stale or foreign cookie
 * falls through instead of erroring.
 */
export function resolveLanguage(
  card: Card | null,
  cookieValue: string | undefined | null,
  acceptLanguage: string | undefined | null,
): CardLanguage {
  const allowed = card ? cardLanguages(card) : [...DEFAULT_CARD_LANGUAGES];

  const cookie = cookieValue ? primarySubtag(cookieValue) : '';
  if (cookie && allowed.includes(cookie as CardLanguage)) return cookie as CardLanguage;

  // The real negotiator, not a hand-rolled split: it orders by q-value and treats
  // `q=0` as a refusal. The live path and the unit tests are the same code now.
  return negotiateLanguage(acceptLanguage, allowed);
}

export function isLanguageOffered(card: Card, code: string): boolean {
  return cardLanguages(card).includes(code as CardLanguage);
}

/**
 * Verify, or burn the same work for an unknown card. The caller must not branch
 * on "card exists" in anything the responder can observe.
 */
export async function verifyPinAgainst(card: Card | null, pin: string): Promise<boolean> {
  if (!card || !card.active) {
    await decoyVerify(pin);
    return false;
  }
  return verifyPin(card.pinHash, pin);
}

/**
 * Audit and counters (D25): `scan_count` is successful unlocks; failures only
 * touch `last_failed_at`. The rate limiter's own state lives elsewhere (§6).
 */
export async function recordPinAttempt(options: {
  cardId: string | null;
  success: boolean;
  ip: string | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(scanAttempts).values({
    cardId: options.cardId,
    kind: options.success ? 'pin_success' : 'pin_fail',
    success: options.success,
    ipPrefixHash: hashIp(options.ip),
  });

  if (!options.cardId) return;
  if (options.success) {
    await db
      .update(cards)
      .set({ scanCount: sql`${cards.scanCount} + 1`, lastViewedAt: new Date() })
      .where(eq(cards.id, options.cardId));
  } else {
    await db.update(cards).set({ lastFailedAt: new Date() }).where(eq(cards.id, options.cardId));
  }
}

export interface ResponderView {
  ownerName: string;
  contacts: ContactView[];
  notes: string;
}

/** Decrypt in memory, render, discard (§4). Nothing here is cached. */
export async function loadResponderView(card: Card): Promise<ResponderView> {
  const [owner] = await getDb()
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, card.userId))
    .limit(1);

  return {
    ownerName: owner?.name ?? '',
    // Contacts and notes belong to the owner; the card only points at them.
    contacts: await listContacts(card.userId),
    notes: await getNotes(card.userId),
  };
}

/** True when the cookie may show this card's data right now. */
export function viewCookieStillValid(
  claims: { slug: string; pinVersion: number } | null,
  card: Card | null,
): boolean {
  if (!claims || !card) return false;
  return card.active && claims.slug === card.slug && claims.pinVersion === card.pinVersion;
}
