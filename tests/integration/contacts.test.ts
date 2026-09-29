import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/db/client';
import { createCardForOwner, getCardForOwner } from '@/lib/cards';
import { users } from '@/db/auth-schema';
import {
  createContact,
  deleteContact,
  getContact,
  getNotes,
  listContacts,
  reorderContacts,
  setNotes,
  updateContact,
  type ContactInput,
} from '@/lib/contacts';

/**
 * Contacts and notes against the real database (Phase 4, §4).
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const SECRET_NAME = 'ZZCONTACTSECRETZZ';
const SECRET_PHONE = '+66899999999';

function input(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    name: SECRET_NAME,
    relation: 'spouse',
    phone: SECRET_PHONE,
    spokenLanguages: ['en', 'th'],
    channels: ['call', 'whatsapp'],
    ...overrides,
  };
}

describeDb('contacts and notes', () => {
  const db = getDb();
  const createdUserIds: string[] = [];

  /** Contacts belong to the owner now, so tests deal in owners. */
  async function freshOwner(): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({ name: 'Owner', email: `contacts-${randomUUID()}@noka.test` })
      .returning();
    createdUserIds.push(user!.id);
    return user!.id;
  }

  afterAll(async () => {
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  it('stores a contact encrypted and reads it back intact', async () => {
    const owner = await freshOwner();
    const created = await createContact(owner, input());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.contact).toMatchObject({
      name: SECRET_NAME,
      relation: 'spouse',
      phoneE164: SECRET_PHONE,
      phoneDisplay: '+66 899 999 999',
      spokenLanguages: ['en', 'th'],
      channels: ['call', 'whatsapp'],
      sortOrder: 0,
    });

    const listed = await listContacts(owner);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe(SECRET_NAME);

    // Raw view: the escape encoding keeps printable ASCII, so an unencrypted
    // column would show the name and the number.
    const raw = await db.execute(
      sql`select encode(payload_encrypted, 'escape') as encoded from contacts where user_id = ${owner}`,
    );
    const encoded = (raw[0] as unknown as { encoded: string }).encoded;
    expect(encoded).not.toContain('ZZCONTACTSECRET');
    expect(encoded).not.toContain('66899999999');
  });

  it('validates instead of storing garbage', async () => {
    const owner = await freshOwner();

    await expect(createContact(owner, input({ name: '   ' }))).resolves.toEqual({
      ok: false,
      error: 'name-required',
    });
    await expect(createContact(owner, input({ relation: 'uncle' }))).resolves.toEqual({
      ok: false,
      error: 'relation-invalid',
    });
    await expect(createContact(owner, input({ phone: '0812345678' }))).resolves.toEqual({
      ok: false,
      error: 'missing-country-code',
    });
    expect(await listContacts(owner)).toHaveLength(0);
  });

  it('keeps only the channels it knows, and defaults to a phone call', async () => {
    const owner = await freshOwner();

    const explicit = await createContact(owner, input({ channels: ['whatsapp', 'nonsense', 'sms'] }));
    expect(explicit.ok && explicit.contact.channels).toEqual(['sms', 'whatsapp']);

    const none = await createContact(owner, input({ channels: [] }));
    expect(none.ok && none.contact.channels).toEqual(['call']);
  });

  it('drops unknown spoken languages on write', async () => {
    const owner = await freshOwner();
    const created = await createContact(owner, input({ spokenLanguages: ['th', 'xx', 'th', 'en'] }));
    expect(created.ok && created.contact.spokenLanguages).toEqual(['th', 'en']);
  });

  it('updates in place and keeps the row count', async () => {
    const owner = await freshOwner();
    const created = await createContact(owner, input());
    if (!created.ok) return;

    const updated = await updateContact(owner, created.contact.id, input({ name: 'Maria Silva', relation: 'sibling' }));
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    expect(updated.contact.id).toBe(created.contact.id);
    expect(updated.contact.name).toBe('Maria Silva');
    expect(updated.contact.relation).toBe('sibling');
    expect(await listContacts(owner)).toHaveLength(1);
  });

  it('reports a missing contact rather than throwing', async () => {
    const owner = await freshOwner();
    await expect(updateContact(owner, randomUUID(), input())).resolves.toEqual({ ok: false, error: 'not-found' });
    expect(await getContact(owner, randomUUID())).toBeNull();
  });

  it('scopes every read to its own owner', async () => {
    const first = await freshOwner();
    const second = await freshOwner();
    const created = await createContact(first, input());
    if (!created.ok) return;

    expect(await getContact(second, created.contact.id)).toBeNull();
    expect(await listContacts(second)).toHaveLength(0);
    await expect(deleteContact(second, created.contact.id)).resolves.toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(await listContacts(first)).toHaveLength(1);
  });

  it('numbers contacts in creation order and reorders on request', async () => {
    const owner = await freshOwner();
    const first = await createContact(owner, input({ name: 'First' }));
    const second = await createContact(owner, input({ name: 'Second' }));
    const third = await createContact(owner, input({ name: 'Third' }));
    if (!first.ok || !second.ok || !third.ok) return;

    expect((await listContacts(owner)).map((contact) => contact.name)).toEqual(['First', 'Second', 'Third']);

    await reorderContacts(owner, [third.contact.id, first.contact.id, second.contact.id]);
    expect((await listContacts(owner)).map((contact) => contact.name)).toEqual(['Third', 'First', 'Second']);
  });

  it('deletes the card along with the last contact', async () => {
    const owner = await freshOwner();
    const solo = await createContact(owner, input());
    if (!solo.ok) return;

    // No card yet: nothing else to remove.
    await expect(deleteContact(owner, solo.contact.id)).resolves.toEqual({ ok: true, cardDeleted: false });

    // With a card, deleting the last contact takes the card with it — a printed
    // card behind an empty page is worse than no card (his call, 2026-09-29).
    const first = await createContact(owner, input({ name: 'A' }));
    const second = await createContact(owner, input({ name: 'B' }));
    if (!first.ok || !second.ok) return;

    const card = await createCardForOwner(owner);
    expect(card.ok).toBe(true);

    await expect(deleteContact(owner, first.contact.id)).resolves.toEqual({ ok: true, cardDeleted: false });
    expect(await getCardForOwner(owner)).not.toBeNull();

    await expect(deleteContact(owner, second.contact.id)).resolves.toEqual({ ok: true, cardDeleted: true });
    expect(await getCardForOwner(owner)).toBeNull();
    expect(await listContacts(owner)).toHaveLength(0);
  });

  it('round-trips the notes and stores them encrypted', async () => {
    const owner = await freshOwner();
    expect(await getNotes(owner)).toBe('');

    await setNotes(owner, `Type 1 diabetic. ${SECRET_NAME}`);
    expect(await getNotes(owner)).toBe(`Type 1 diabetic. ${SECRET_NAME}`);

    const raw = await db.execute(
      sql`select encode(notes_encrypted, 'escape') as encoded from owner_notes where user_id = ${owner}`,
    );
    expect((raw[0] as unknown as { encoded: string }).encoded).not.toContain('ZZCONTACTSECRET');

    // Saving twice updates instead of duplicating.
    await setNotes(owner, 'Allergic to penicillin.');
    expect(await getNotes(owner)).toBe('Allergic to penicillin.');

    // Blank notes delete the row.
    await setNotes(owner, '   ');
    expect(await getNotes(owner)).toBe('');
    const noteRows = await db.execute(sql`select count(*)::int as value from owner_notes where user_id = ${owner}`);
    expect((noteRows[0] as unknown as { value: number }).value).toBe(0);
  });
});
