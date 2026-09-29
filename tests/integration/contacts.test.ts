import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { cards } from '@/db/schema';
import { createCardForOwner } from '@/lib/cards';
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
    ...overrides,
  };
}

describeDb('contacts and notes', () => {
  const db = getDb();
  const createdUserIds: string[] = [];

  async function freshCard() {
    const [user] = await db
      .insert(users)
      .values({ name: 'Owner', email: `contacts-${randomUUID()}@noka.test` })
      .returning();
    createdUserIds.push(user!.id);
    return createCardForOwner(user!.id);
  }

  afterAll(async () => {
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  it('stores a contact encrypted and reads it back intact', async () => {
    const card = await freshCard();
    const created = await createContact(card.id, input());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.contact).toMatchObject({
      name: SECRET_NAME,
      relation: 'spouse',
      phoneE164: SECRET_PHONE,
      phoneDisplay: SECRET_PHONE,
      spokenLanguages: ['en', 'th'],
      sortOrder: 0,
    });

    const listed = await listContacts(card.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe(SECRET_NAME);

    // Raw view: the escape encoding keeps printable ASCII, so an unencrypted
    // column would show the name and the number.
    const raw = await db.execute(
      sql`select encode(payload_encrypted, 'escape') as encoded from contacts where card_id = ${card.id}`,
    );
    const encoded = (raw[0] as unknown as { encoded: string }).encoded;
    expect(encoded).not.toContain('ZZCONTACTSECRET');
    expect(encoded).not.toContain('66899999999');
  });

  it('validates instead of storing garbage', async () => {
    const card = await freshCard();

    await expect(createContact(card.id, input({ name: '   ' }))).resolves.toEqual({
      ok: false,
      error: 'name-required',
    });
    await expect(createContact(card.id, input({ relation: 'uncle' }))).resolves.toEqual({
      ok: false,
      error: 'relation-invalid',
    });
    await expect(createContact(card.id, input({ phone: '0812345678' }))).resolves.toEqual({
      ok: false,
      error: 'missing-country-code',
    });
    expect(await listContacts(card.id)).toHaveLength(0);
  });

  it('drops unknown spoken languages on write', async () => {
    const card = await freshCard();
    const created = await createContact(card.id, input({ spokenLanguages: ['th', 'xx', 'th', 'en'] }));
    expect(created.ok && created.contact.spokenLanguages).toEqual(['th', 'en']);
  });

  it('updates in place and keeps the row count', async () => {
    const card = await freshCard();
    const created = await createContact(card.id, input());
    if (!created.ok) return;

    const updated = await updateContact(card.id, created.contact.id, input({ name: 'Maria Silva', relation: 'sibling' }));
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    expect(updated.contact.id).toBe(created.contact.id);
    expect(updated.contact.name).toBe('Maria Silva');
    expect(updated.contact.relation).toBe('sibling');
    expect(await listContacts(card.id)).toHaveLength(1);
  });

  it('reports a missing contact rather than throwing', async () => {
    const card = await freshCard();
    await expect(updateContact(card.id, randomUUID(), input())).resolves.toEqual({ ok: false, error: 'not-found' });
    expect(await getContact(card.id, randomUUID())).toBeNull();
  });

  it('scopes every read to its own card', async () => {
    const first = await freshCard();
    const second = await freshCard();
    const created = await createContact(first.id, input());
    if (!created.ok) return;

    expect(await getContact(second.id, created.contact.id)).toBeNull();
    expect(await listContacts(second.id)).toHaveLength(0);
    await expect(
      deleteContact(second.id, created.contact.id, { cardActive: false }),
    ).resolves.toEqual({ ok: false, error: 'not-found' });
    expect(await listContacts(first.id)).toHaveLength(1);
  });

  it('numbers contacts in creation order and reorders on request', async () => {
    const card = await freshCard();
    const first = await createContact(card.id, input({ name: 'First' }));
    const second = await createContact(card.id, input({ name: 'Second' }));
    const third = await createContact(card.id, input({ name: 'Third' }));
    if (!first.ok || !second.ok || !third.ok) return;

    expect((await listContacts(card.id)).map((contact) => contact.name)).toEqual(['First', 'Second', 'Third']);

    await reorderContacts(card.id, [third.contact.id, first.contact.id, second.contact.id]);
    expect((await listContacts(card.id)).map((contact) => contact.name)).toEqual(['Third', 'First', 'Second']);
  });

  it('refuses to delete the last contact while the card is active (D28)', async () => {
    const card = await freshCard();
    const solo = await createContact(card.id, input());
    if (!solo.ok) return;

    // Inactive card: deleting the last one is allowed.
    await expect(deleteContact(card.id, solo.contact.id, { cardActive: true })).resolves.toEqual({
      ok: false,
      error: 'last-contact-while-active',
    });
    await expect(deleteContact(card.id, solo.contact.id, { cardActive: false })).resolves.toEqual({ ok: true });

    // Active card with two contacts: deleting one is fine.
    const a = await createContact(card.id, input({ name: 'A' }));
    const b = await createContact(card.id, input({ name: 'B' }));
    if (!a.ok || !b.ok) return;
    await expect(deleteContact(card.id, a.contact.id, { cardActive: true })).resolves.toEqual({ ok: true });
    await expect(deleteContact(card.id, b.contact.id, { cardActive: true })).resolves.toEqual({
      ok: false,
      error: 'last-contact-while-active',
    });
  });

  it('round-trips the notes and stores them encrypted', async () => {
    const card = await freshCard();
    expect(await getNotes(card.id)).toBe('');

    await setNotes(card.id, `Type 1 diabetic. ${SECRET_NAME}`);
    expect(await getNotes(card.id)).toBe(`Type 1 diabetic. ${SECRET_NAME}`);

    const raw = await db.execute(
      sql`select encode(notes_encrypted, 'escape') as encoded from card_notes where card_id = ${card.id}`,
    );
    expect((raw[0] as unknown as { encoded: string }).encoded).not.toContain('ZZCONTACTSECRET');

    // Saving the same card twice updates instead of duplicating.
    await setNotes(card.id, 'Allergic to penicillin.');
    expect(await getNotes(card.id)).toBe('Allergic to penicillin.');

    // Blank notes delete the row.
    await setNotes(card.id, '   ');
    expect(await getNotes(card.id)).toBe('');
    expect(await db.select().from(cards).where(eq(cards.id, card.id))).toHaveLength(1);
    const noteRows = await db.execute(sql`select count(*)::int as value from card_notes where card_id = ${card.id}`);
    expect((noteRows[0] as unknown as { value: number }).value).toBe(0);
  });
});
