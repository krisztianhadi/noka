import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { cardNotes, contacts } from '@/db/schema';
import { CONTACT_PAYLOAD_SCHEMA, type ContactPayload } from '@/lib/contact-payload';
import { activeKeyVersion, decryptJson, encryptJson } from '@/lib/crypto';
import { contactKeyring } from '@/lib/keys';
import { normalizePhone, type PhoneResult } from '@/lib/phone';
import { isRelation, type Relation } from '@/lib/relations';
import { sanitizeSpokenLanguages } from '@/lib/spoken-languages';

/**
 * Contacts and notes: every value is encrypted before it touches the database
 * (§4, D10) and decrypted only in memory, per read, never cached.
 *
 * `relation` and the spoken languages are stored as vocabulary codes inside the
 * encrypted payload, so the responder page can translate them (D19, D31).
 */
export interface ContactView {
  id: string;
  name: string;
  relation: Relation;
  phoneE164: string;
  phoneDisplay: string;
  spokenLanguages: string[];
  sortOrder: number;
}

export interface ContactInput {
  name: string;
  relation: string;
  phone: string;
  spokenLanguages: readonly string[];
}

export type PhoneError = Extract<PhoneResult, { ok: false }>['reason'];

export type ContactError = 'name-required' | 'relation-invalid' | 'not-found' | PhoneError;

export type ContactResult = { ok: true; contact: ContactView } | { ok: false; error: ContactError };
export type DeleteResult = { ok: true } | { ok: false; error: 'not-found' | 'last-contact-while-active' };

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
  };
}

function validate(input: ContactInput): { ok: false; error: ContactError } | { ok: true; phone: { e164: string; display: string } } {
  if (input.name.trim().length === 0) return { ok: false, error: 'name-required' };
  if (!isRelation(input.relation)) return { ok: false, error: 'relation-invalid' };

  const phone = normalizePhone(input.phone);
  if (!phone.ok) return { ok: false, error: phone.reason };
  return { ok: true, phone: { e164: phone.e164, display: phone.display } };
}

export async function listContacts(cardId: string): Promise<ContactView[]> {
  const rows = await getDb()
    .select()
    .from(contacts)
    .where(eq(contacts.cardId, cardId))
    .orderBy(asc(contacts.sortOrder), asc(contacts.createdAt));
  return rows.map(decode);
}

export async function getContact(cardId: string, id: string): Promise<ContactView | null> {
  const [row] = await getDb()
    .select()
    .from(contacts)
    .where(and(eq(contacts.cardId, cardId), eq(contacts.id, id)))
    .limit(1);
  return row ? decode(row) : null;
}

export async function createContact(cardId: string, input: ContactInput): Promise<ContactResult> {
  const checked = validate(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  const db = getDb();
  const existing = await listContacts(cardId);
  const ring = contactKeyring();

  const [row] = await db
    .insert(contacts)
    .values({
      cardId,
      payloadEncrypted: encryptJson(encode(input, checked.phone), ring, activeKeyVersion(ring)),
      keyVersion: activeKeyVersion(ring),
      sortOrder: existing.length,
    })
    .returning();

  if (!row) throw new Error('Contact insert returned no row');
  return { ok: true, contact: decode(row) };
}

export async function updateContact(cardId: string, id: string, input: ContactInput): Promise<ContactResult> {
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
    .where(and(eq(contacts.cardId, cardId), eq(contacts.id, id)))
    .returning();

  if (!row) return { ok: false, error: 'not-found' };
  return { ok: true, contact: decode(row) };
}

/**
 * D28: an active card must not be left with nothing behind it. The owner
 * switches the card off first, deliberately.
 */
export async function deleteContact(
  cardId: string,
  id: string,
  options: { cardActive: boolean },
): Promise<DeleteResult> {
  const remaining = await listContacts(cardId);
  if (!remaining.some((contact) => contact.id === id)) return { ok: false, error: 'not-found' };
  if (options.cardActive && remaining.length <= 1) return { ok: false, error: 'last-contact-while-active' };

  await getDb().delete(contacts).where(and(eq(contacts.cardId, cardId), eq(contacts.id, id)));
  return { ok: true };
}

/** Reorders by rewriting sort_order in the given order (drag-free: up/down forms). */
export async function reorderContacts(cardId: string, orderedIds: readonly string[]): Promise<void> {
  const db = getDb();
  let position = 0;
  for (const id of orderedIds) {
    await db
      .update(contacts)
      .set({ sortOrder: position, updatedAt: new Date() })
      .where(and(eq(contacts.cardId, cardId), eq(contacts.id, id)));
    position += 1;
  }
}

export async function getNotes(cardId: string): Promise<string> {
  const [row] = await getDb().select().from(cardNotes).where(eq(cardNotes.cardId, cardId)).limit(1);
  if (!row?.notesEncrypted) return '';
  return decryptJson<{ notes: string }>(row.notesEncrypted, contactKeyring()).value.notes;
}

export async function setNotes(cardId: string, notes: string): Promise<void> {
  const trimmed = notes.trim();
  const ring = contactKeyring();
  const db = getDb();

  if (trimmed.length === 0) {
    await db.delete(cardNotes).where(eq(cardNotes.cardId, cardId));
    return;
  }

  const payload = encryptJson({ notes: trimmed }, ring, activeKeyVersion(ring));
  await db
    .insert(cardNotes)
    .values({ cardId, notesEncrypted: payload, keyVersion: activeKeyVersion(ring) })
    .onConflictDoUpdate({
      target: cardNotes.cardId,
      set: { notesEncrypted: payload, keyVersion: activeKeyVersion(ring), updatedAt: new Date() },
    });
}
