import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getConfig } from '@/config';
import { closeDb, getDb } from '@/db/client';
import { encryptJson, keyring } from '@/lib/crypto';
import { createCardForOwner, getCardForOwner } from '@/lib/cards';
import { users } from '@/db/auth-schema';
import { contacts } from '@/db/schema';
import {
  createContact,
  deleteContact,
  getContact,
  getNotes,
  listContacts,
  setNotes,
  updateContact,
  type ContactInput,
} from '@/lib/contacts';

/**
 * Contacts and notes against the real database (Phase 4, §4).
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const ring = keyring({ 1: getConfig().CONTACT_ENCRYPTION_KEY });
const SECRET_NAME = 'ZZCONTACTSECRETZZ';
const SECRET_PHONE = '+66899999999';

function input(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    name: SECRET_NAME,
    relation: 'spouse',
    phone: SECRET_PHONE,
    spokenLanguages: ['en', 'th'],
    channels: ['call', 'whatsapp'],
    textOnly: false,
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

  /**
   * The reviews' first finding, as a test.
   *
   * Two deletions racing used to each see one contact left, both report "not the last one", and
   * leave a live card pointing at nobody. The window is real but narrow, so this runs the race
   * across a dozen owners at once: many transactions in flight is what makes the interleaving
   * happen rather than being hoped for. Run against the code before the transaction, some owner
   * is left with no contacts and a card.
   */
  it('deletes the card when deletions race for each owner\'s last contacts', async () => {
    const owners = await Promise.all(
      Array.from({ length: 12 }, async () => {
        const owner = await freshOwner();
        const first = await createContact(owner, input({ name: 'First' }));
        const second = await createContact(owner, input({ name: 'Second' }));
        if (!first.ok || !second.ok) throw new Error('expected two contacts');
        await createCardForOwner(owner);
        return { owner, ids: [first.contact.id, second.contact.id] as const };
      }),
    );

    await Promise.all(owners.flatMap(({ owner, ids }) => ids.map((id) => deleteContact(owner, id))));

    for (const { owner } of owners) {
      expect(await listContacts(owner), 'contacts left').toHaveLength(0);
      // The invariant: no contacts, no card. One of the two deletions has to have removed it.
      expect(await getCardForOwner(owner), 'card left behind').toBeNull();
    }
  });

  it('gives racing adds distinct positions', async () => {
    const owner = await freshOwner();
    await Promise.all([
      createContact(owner, input({ name: 'One' })),
      createContact(owner, input({ name: 'Two' })),
      createContact(owner, input({ name: 'Three' })),
    ]);

    const rows = await db
      .select({ sortOrder: contacts.sortOrder })
      .from(contacts)
      .where(eq(contacts.userId, owner));
    const orders = rows.map((row) => row.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual([0, 1, 2]);
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
      textOnly: false,
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

  it('refuses to render a row it cannot validate, instead of showing half a contact', async () => {
    const owner = await freshOwner();
    const created = await createContact(owner, input());
    if (!created.ok) return;

    // A row from a future schema, or a corrupted one. The read path must reject it:
    // rendering `undefined` onto an emergency page is worse than a hard failure.
    await db
      .update(contacts)
      .set({ payloadEncrypted: encryptJson({ schema: 99, name: 'Ghost' }, ring), keyVersion: 1 })
      .where(eq(contacts.id, created.contact.id));

    await expect(listContacts(owner)).rejects.toThrow(/Unsupported contact payload schema/);
    await db.delete(contacts).where(eq(contacts.id, created.contact.id));
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

  it('remembers that a contact cannot speak or hear', async () => {
    const owner = await freshOwner();
    const created = await createContact(owner, input({ textOnly: true }));
    expect(created.ok && created.contact.textOnly).toBe(true);
    // Only text is offered for that person, and it survives a read.
    expect((await listContacts(owner))[0]?.textOnly).toBe(true);

    const updated = await updateContact(owner, (created as { contact: { id: string } }).contact.id, input({ textOnly: false }));
    expect(updated.ok && updated.contact.textOnly).toBe(false);
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

  it('numbers contacts in creation order', async () => {
    const owner = await freshOwner();
    const first = await createContact(owner, input({ name: 'First' }));
    const second = await createContact(owner, input({ name: 'Second' }));
    const third = await createContact(owner, input({ name: 'Third' }));
    if (!first.ok || !second.ok || !third.ok) return;

    // sortOrder is the rendering order the responder page uses. Nothing reorders
    // contacts yet, so creation order is the contract.
    expect((await listContacts(owner)).map((contact) => contact.name)).toEqual(['First', 'Second', 'Third']);
    expect((await listContacts(owner)).map((contact) => contact.sortOrder)).toEqual([0, 1, 2]);
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
