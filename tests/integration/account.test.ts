import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getAuth } from '@/lib/auth';
import { sessions, users } from '@/db/auth-schema';
import { closeDb, getDb } from '@/db/client';
import { cards, contacts, ownerNotes, scanAttempts } from '@/db/schema';
import { deleteOwnerAccount, EXPORT_FORMAT, exportOwnerData } from '@/lib/account';
import { createCardForOwner } from '@/lib/cards';
import { createContact, listContacts, setNotes } from '@/lib/contacts';

/**
 * Self-service portability and erasure (Art. 20 and 17), against the real database.
 *
 * These are the two promises a privacy page makes that a person can actually check, so they
 * are asserted rather than assumed: the export contains their data decrypted, and deleting
 * the account leaves nothing behind — not a contact, not a note, not a session.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('self-service export and deletion', () => {
  const db = getDb();
  const createdUserIds: string[] = [];

  async function freshOwner(): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({ name: 'Krisztian', email: `account-${randomUUID()}@noka.test` })
      .returning();
    createdUserIds.push(user!.id);
    return user!.id;
  }

  afterAll(async () => {
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  it('exports the account, the people, the notes and the card', async () => {
    const owner = await freshOwner();
    const created = await createContact(owner, {
      name: 'Maria Silva',
      relation: 'spouse',
      phone: '+66812345678',
      spokenLanguages: ['th', 'en'],
      channels: ['call', 'whatsapp'],
      textOnly: true,
    });
    expect(created.ok).toBe(true);
    await setNotes(owner, 'Type 1 diabetic.');
    const card = await createCardForOwner(owner);
    expect(card.ok).toBe(true);

    const data = await exportOwnerData(owner);
    expect(data).not.toBeNull();
    expect(data?.format).toBe(EXPORT_FORMAT);
    expect(data?.account.email).toMatch(/@noka\.test$/);
    expect(data?.notes).toBe('Type 1 diabetic.');
    expect(data?.contacts).toHaveLength(1);
    expect(data?.contacts[0]).toMatchObject({
      name: 'Maria Silva',
      phone: '+66812345678',
      services: ['call', 'whatsapp'],
      textOnly: true,
      spokenLanguages: ['th', 'en'],
    });
    // The card travels with its PIN: an export that cannot reproduce the card is not an
    // export of the card.
    expect(data?.card?.pin).toMatch(/^\d{3} \d{3}$/);
    expect(data?.card?.url).toContain('/c/');
    expect(data?.card?.scans).toEqual({ total: 0, failed: 0, lastAt: null });
  });

  it('exports an account that has nothing yet without inventing anything', async () => {
    const owner = await freshOwner();
    const data = await exportOwnerData(owner);
    expect(data?.card).toBeNull();
    expect(data?.contacts).toEqual([]);
    expect(data?.notes).toBeNull();
  });

  it('erases everything hanging off the account, down to the audit rows', async () => {
    const owner = await freshOwner();
    await createContact(owner, {
      name: 'Maria Silva',
      relation: 'partner',
      phone: '+66812345678',
      spokenLanguages: [],
      channels: ['call'],
    });
    await setNotes(owner, 'Something private.');
    const card = await createCardForOwner(owner);
    if (!card.ok) throw new Error('expected a card');
    await db
      .insert(scanAttempts)
      .values({ cardId: card.card.id, kind: 'pin_fail', success: false, ipPrefixHash: 'deadbeef' });

    await deleteOwnerAccount(owner);

    const [remainingUser] = await db.select().from(users).where(eq(users.id, owner));
    expect(remainingUser).toBeUndefined();
    expect(await listContacts(owner)).toEqual([]);
    expect(await db.select().from(cards).where(eq(cards.userId, owner))).toEqual([]);
    expect(await db.select().from(contacts).where(eq(contacts.userId, owner))).toEqual([]);
    expect(await db.select().from(ownerNotes).where(eq(ownerNotes.userId, owner))).toEqual([]);
    expect(await db.select().from(scanAttempts).where(eq(scanAttempts.cardId, card.card.id))).toEqual([]);

    // The export has nothing left to say, either.
    expect(await exportOwnerData(owner)).toBeNull();
  });

  it('takes the live sessions with the account', async () => {
    // Erasure that leaves a signed-in cookie behind is not erasure, so a real sign-up goes
    // through better-auth and then gets deleted.
    const email = `session-${randomUUID()}@noka.test`;
    await getAuth().api.signUpEmail({
      body: { email, password: 'correct-horse-battery', name: 'Session owner' },
    });
    const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(account, 'sign-up created the account').toBeDefined();
    expect(await db.select().from(sessions).where(eq(sessions.userId, account!.id))).not.toEqual([]);

    await deleteOwnerAccount(account!.id);
    expect(await db.select().from(sessions).where(eq(sessions.userId, account!.id))).toEqual([]);
    expect(await exportOwnerData(account!.id)).toBeNull();
  });
});
