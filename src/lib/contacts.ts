import { and, asc, count, eq, sql } from 'drizzle-orm';
import { getDb, type Executor } from '@/db/client';
import { cards, contacts, ownerNotes } from '@/db/schema';
import { sanitizeChannels, type Channel } from '@/lib/channels';
import { CONTACT_PAYLOAD_SCHEMA, readContactPayload, type ContactPayload } from '@/lib/contact-payload';
import { activeKeyVersion, decryptJson, encryptJson } from '@/lib/crypto';
import { contactKeyring } from '@/lib/keys';
import { normalizePhone, type PhoneResult } from '@/lib/phone';
import { isRelation, type Relation } from '@/lib/relations';
import { sanitizeSpokenLanguages } from '@/lib/spoken-languages';

/**
 * The advisory lock namespace for one owner's contacts. Any two mutations of the same owner's
 * contact list take this lock, so the list can be counted and changed without another request
 * changing it in between. The second key is the owner's id hashed to an int4, which is what
 * `pg_advisory_xact_lock` takes.
 */
const CONTACT_LOCK = 0x6e6f6b61;

export async function deleteContact(userId: string, id: string): Promise<DeleteResult> {
  return getDb().transaction(async (tx) => {
    // Serialise against another deletion of the same owner's contacts. Without this, two tabs
    // deleting the last two contacts each saw one left, both returned "not the last one", and the
    // card survived pointing at nobody.
    await tx.execute(sql`select pg_advisory_xact_lock(${CONTACT_LOCK}, hashtext(${userId}))`);

    const deleted = await tx
      .delete(contacts)
      .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
      .returning({ id: contacts.id });
    if (deleted.length === 0) return { ok: false, error: 'not-found' };

    const [remaining] = await tx
      .select({ total: count() })
      .from(contacts)
      .where(eq(contacts.userId, userId));
    if ((remaining?.total ?? 0) > 0) return { ok: true, cardDeleted: false };

    const [card] = await tx
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.userId, userId))
      .limit(1);
    if (!card) return { ok: true, cardDeleted: false };
    await tx.delete(cards).where(eq(cards.id, card.id));
    return { ok: true, cardDeleted: true };
  });
}

/**
 * Contacts and notes belong to the **owner**, not to a card (2026-09-29): he adds
 * people first and makes a card afterwards. A card is only the thing a QR points
 * at; reissuing one never touches the people.
 *
 * Every value is encrypted before it touches the database and decrypted per read,
 * never cached (§4, D10).
 */
export interface ContactView {
  id: string;
  name: string;
  relation: Relation;
  phoneE164: string;
  phoneDisplay: string;
  spokenLanguages: string[];
  /** How this number can be reached; `call` unless the owner changed it. */
  channels: Channel[];
  /** Cannot speak or hear: text is the only way in, and the page says so. */
  textOnly: boolean;
  sortOrder: number;
}

export interface ContactInput {
  name: string;
  relation: string;
  phone: string;
  spokenLanguages: readonly string[];
  channels: readonly string[];
  /** From the "cannot speak or hear" checkbox. */
  textOnly?: boolean;
}

export type PhoneError = Extract<PhoneResult, { ok: false }>['reason'];

export type ContactError = 'name-required' | 'relation-invalid' | 'not-found' | PhoneError;

export type ContactResult = { ok: true; contact: ContactView } | { ok: false; error: ContactError };
export type DeleteResult =
  | { ok: true; cardDeleted: boolean }
  | { ok: false; error: 'not-found' };

type ContactRow = typeof contacts.$inferSelect;

function decode(row: ContactRow): ContactView {
  // Validated, not cast: a row written by an older schema — or a corrupted one —
  // must fail here rather than render `undefined` onto the emergency page.
  const { value } = decryptJson<ContactPayload>(row.payloadEncrypted, contactKeyring());
  readContactPayload(value);
  return {
    id: row.id,
    name: value.name,
    relation: value.relation,
    phoneE164: value.phone_e164,
    phoneDisplay: value.phone_display,
    spokenLanguages: value.spoken_languages,
    channels: sanitizeChannels(value.channels ?? ['call']),
    textOnly: value.text_only ?? false,
    sortOrder: row.sortOrder,
  };
}

function encode(input: ContactInput, phone: { e164: string; display: string }): ContactPayload {
  return {
    schema: CONTACT_PAYLOAD_SCHEMA,
    name: input.name.trim(),
    relation: input.relation as Relation,
    phone_e164: phone.e164,
    phone_display: phone.display,
    spoken_languages: sanitizeSpokenLanguages(input.spokenLanguages),
    // An empty selection means "just call": a contact with no channel at all
    // would be invisible on the page a responder depends on.
    channels: sanitizeChannels(input.channels.length > 0 ? input.channels : ['call']),
    text_only: input.textOnly ?? false,
  };
}

function validate(
  input: ContactInput,
): { ok: false; error: ContactError } | { ok: true; phone: { e164: string; display: string } } {
  if (input.name.trim().length === 0) return { ok: false, error: 'name-required' };
  if (!isRelation(input.relation)) return { ok: false, error: 'relation-invalid' };

  const phone = normalizePhone(input.phone);
  if (!phone.ok) return { ok: false, error: phone.reason };
  return { ok: true, phone: { e164: phone.e164, display: phone.display } };
}

export async function listContacts(userId: string, handle: Executor = getDb()): Promise<ContactView[]> {
  const rows = await handle
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(asc(contacts.sortOrder), asc(contacts.createdAt));
  return rows.map(decode);
}

export async function getContact(userId: string, id: string): Promise<ContactView | null> {
  const [row] = await getDb()
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
    .limit(1);
  return row ? decode(row) : null;
}

export async function createContact(userId: string, input: ContactInput): Promise<ContactResult> {
  const checked = validate(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  const ring = contactKeyring();
  const payload = encryptJson(encode(input, checked.phone), ring, activeKeyVersion(ring));

  const row = await getDb().transaction(async (tx) => {
    // One lock per owner for everything that appends or removes a contact. Two adds racing would
    // otherwise both read the same maximum and claim the same position; the lock is cheap and
    // the alternative is an ordering that depends on who arrived first.
    await tx.execute(sql`select pg_advisory_xact_lock(${CONTACT_LOCK}, hashtext(${userId}))`);

    // The next position comes from the database in the same statement, so the insert no longer
    // decrypts every existing contact to count them.
    const [inserted] = await tx
      .insert(contacts)
      .values({
        userId,
        payloadEncrypted: payload,
        keyVersion: activeKeyVersion(ring),
        sortOrder: sql`coalesce((select max(${contacts.sortOrder}) from ${contacts} where ${contacts.userId} = ${userId}), -1) + 1`,
      })
      .returning();

    return inserted;
  });

  if (!row) throw new Error('Contact insert returned no row');
  return { ok: true, contact: decode(row) };
}

export async function updateContact(userId: string, id: string, input: ContactInput): Promise<ContactResult> {
  const checked = validate(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  const ring = contactKeyring();
  const [row] = await getDb()
    .update(contacts)
    .set({
      payloadEncrypted: encryptJson(encode(input, checked.phone), ring, activeKeyVersion(ring)),
      keyVersion: activeKeyVersion(ring),
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
    .returning();

  if (!row) return { ok: false, error: 'not-found' };
  return { ok: true, contact: decode(row) };
}

/**
 * Delete a contact. If it was the last one, the card goes with it (his call,
 * 2026-09-29): a printed card behind an empty page is worse than no card, so the
 * two disappear together — and the UI says so before it happens.
 *
 * The owner is never left in a half state: with no contacts there is no card, and
 * making one again needs a new contact first.
 */
export async function getNotes(userId: string, handle: Executor = getDb()): Promise<string> {
  const [row] = await handle.select().from(ownerNotes).where(eq(ownerNotes.userId, userId)).limit(1);
  if (!row?.notesEncrypted) return '';
  return decryptJson<{ notes: string }>(row.notesEncrypted, contactKeyring()).value.notes;
}

export async function setNotes(userId: string, notes: string): Promise<void> {
  const trimmed = notes.trim();
  const ring = contactKeyring();
  const db = getDb();

  if (trimmed.length === 0) {
    await db.delete(ownerNotes).where(eq(ownerNotes.userId, userId));
    return;
  }

  const payload = encryptJson({ notes: trimmed }, ring, activeKeyVersion(ring));
  await db
    .insert(ownerNotes)
    .values({ userId, notesEncrypted: payload, keyVersion: activeKeyVersion(ring) })
    .onConflictDoUpdate({
      target: ownerNotes.userId,
      set: { notesEncrypted: payload, keyVersion: activeKeyVersion(ring), updatedAt: new Date() },
    });
}
