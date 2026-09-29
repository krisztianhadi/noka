import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { contacts, ownerNotes } from '@/db/schema';
import { sanitizeChannels, type Channel } from '@/lib/channels';
import { CONTACT_PAYLOAD_SCHEMA, type ContactPayload } from '@/lib/contact-payload';
import { activeKeyVersion, decryptJson, encryptJson } from '@/lib/crypto';
import { contactKeyring } from '@/lib/keys';
import { normalizePhone, type PhoneResult } from '@/lib/phone';
import { isRelation, type Relation } from '@/lib/relations';
import { sanitizeSpokenLanguages } from '@/lib/spoken-languages';

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
  sortOrder: number;
}

export interface ContactInput {
  name: string;
  relation: string;
  phone: string;
  spokenLanguages: readonly string[];
  channels: readonly string[];
}

export type PhoneError = Extract<PhoneResult, { ok: false }>['reason'];

export type ContactError = 'name-required' | 'relation-invalid' | 'not-found' | PhoneError;

export type ContactResult = { ok: true; contact: ContactView } | { ok: false; error: ContactError };
export type DeleteResult = { ok: true } | { ok: false; error: 'not-found' | 'last-contact-while-card-exists' };

type ContactRow = typeof contacts.$inferSelect;

function decode(row: ContactRow): ContactView {
  const { value } = decryptJson<ContactPayload>(row.payloadEncrypted, contactKeyring());
  return {
    id: row.id,
    name: value.name,
    relation: value.relation,
    phoneE164: value.phone_e164,
    phoneDisplay: value.phone_display,
    spokenLanguages: value.spoken_languages,
    channels: sanitizeChannels(value.channels ?? ['call']),
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

export async function listContacts(userId: string): Promise<ContactView[]> {
  const rows = await getDb()
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

  const existing = await listContacts(userId);
  const ring = contactKeyring();

  const [row] = await getDb()
    .insert(contacts)
    .values({
      userId,
      payloadEncrypted: encryptJson(encode(input, checked.phone), ring, activeKeyVersion(ring)),
      keyVersion: activeKeyVersion(ring),
      sortOrder: existing.length,
    })
    .returning();

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
 * A card with nobody behind it is worse than no card, so the last contact cannot
 * be deleted while a card exists. There is no switch-off any more: the way out is
 * to edit the contact, or to add someone else first.
 */
export async function deleteContact(
  userId: string,
  id: string,
  options: { hasCard: boolean },
): Promise<DeleteResult> {
  const existing = await listContacts(userId);
  if (!existing.some((contact) => contact.id === id)) return { ok: false, error: 'not-found' };
  if (options.hasCard && existing.length <= 1) return { ok: false, error: 'last-contact-while-card-exists' };

  await getDb().delete(contacts).where(and(eq(contacts.userId, userId), eq(contacts.id, id)));
  return { ok: true };
}

export async function reorderContacts(userId: string, orderedIds: readonly string[]): Promise<void> {
  const db = getDb();
  let position = 0;
  for (const id of orderedIds) {
    await db
      .update(contacts)
      .set({ sortOrder: position, updatedAt: new Date() })
      .where(and(eq(contacts.userId, userId), eq(contacts.id, id)));
    position += 1;
  }
}

export async function getNotes(userId: string): Promise<string> {
  const [row] = await getDb().select().from(ownerNotes).where(eq(ownerNotes.userId, userId)).limit(1);
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
