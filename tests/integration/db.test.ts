import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getConfig } from '@/config';
import { closeDb, getDb } from '@/db/client';
import { users } from '@/db/auth-schema';
import { cards, contacts, ownerNotes, scanAttempts } from '@/db/schema';
import { decryptJson, encryptJson, keyring } from '@/lib/crypto';
import { generateSlug } from '@/lib/slug';

/**
 * Runs against the real local Postgres (5433). Skipped when DATABASE_URL is
 * absent, so a unit-only environment still goes green.
 */
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const SECRET_NAME = 'ZZTOPSECRETZZ';
const SECRET_PHONE = '+66899999999';

function payload() {
  return {
    schema: 2,
    name: SECRET_NAME,
    relation: 'spouse',
    phone_e164: SECRET_PHONE,
    phone_display: '+66 89 999 9999',
    spoken_languages: ['en'],
  };
}

describeDb('database', () => {
  const db = getDb();
  const ring = keyring({ 1: getConfig().CONTACT_ENCRYPTION_KEY });
  const createdCardIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdCardIds) await db.delete(cards).where(eq(cards.id, id));
    for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  /** cards.user_id is a real FK now (ADR-008 resolved), so make the owner first. */
  async function insertUser() {
    const [user] = await db
      .insert(users)
      .values({ name: 'Test Owner', email: `owner-${randomUUID()}@noka.test` })
      .returning();
    if (!user) throw new Error('user insert returned no row');
    createdUserIds.push(user.id);
    return user;
  }

  async function insertCard(userId: string, active = true) {
    const [card] = await db
      .insert(cards)
      .values({
        userId,
        slug: generateSlug(),
        pinHash: '$argon2id$placeholder',
        pinEncrypted: encryptJson({ pin: '123456' }, ring),
        active,
      })
      .returning();
    if (!card) throw new Error('insert returned no row');
    createdCardIds.push(card.id);
    return card;
  }

  it('refuses a card whose owner does not exist', async () => {
    await expect(insertCard(randomUUID())).rejects.toThrow();
  });

  it('stores an encrypted contact and reads back no plaintext', async () => {
    const card = await insertCard((await insertUser()).id);
    await db.insert(contacts).values({
      userId: card.userId,
      payloadEncrypted: encryptJson(payload(), ring),
      keyVersion: 1,
      sortOrder: 0,
    });

    // Raw, uninterpreted view of the table: the escape encoding leaves
    // printable ASCII intact, so an unencrypted column would show the name.
    const raw = await db.execute(
      sql`select encode(payload_encrypted, 'escape') as encoded, key_version from contacts where user_id = ${card.userId}`,
    );
    const row = raw[0] as unknown as { encoded: string; key_version: number };
    expect(row.key_version).toBe(1);
    expect(row.encoded).not.toContain('ZZTOPSECRET');
    expect(row.encoded).not.toContain('66899999999');

    const stored = await db.select().from(contacts).where(eq(contacts.userId, card.userId));
    const decrypted = decryptJson<ReturnType<typeof payload>>(stored[0]!.payloadEncrypted, ring);
    expect(decrypted.value).toEqual(payload());
    expect(decrypted.keyVersion).toBe(1);
  });

  it('keeps the notes encrypted too', async () => {
    const card = await insertCard((await insertUser()).id);
    await db
      .insert(ownerNotes)
      .values({ userId: card.userId, notesEncrypted: encryptJson({ notes: SECRET_NAME }, ring), keyVersion: 1 });

    const raw = await db.execute(
      sql`select encode(notes_encrypted, 'escape') as encoded from owner_notes where user_id = ${card.userId}`,
    );
    expect((raw[0] as unknown as { encoded: string }).encoded).not.toContain('ZZTOPSECRET');

    const [notes] = await db.select().from(ownerNotes).where(eq(ownerNotes.userId, card.userId));
    expect(decryptJson<{ notes: string }>(notes!.notesEncrypted!, ring).value.notes).toBe(SECRET_NAME);
  });

  it('keeps the owner’s contacts and notes when a card is deleted, and takes the attempts', async () => {
    const card = await insertCard((await insertUser()).id);
    await db.insert(contacts).values({ userId: card.userId, payloadEncrypted: encryptJson(payload(), ring), keyVersion: 1 });
    await db.insert(ownerNotes).values({ userId: card.userId, notesEncrypted: encryptJson({ notes: 'x' }, ring), keyVersion: 1 });
    await db.insert(scanAttempts).values({ cardId: card.id, kind: 'pin_fail', success: false, ipPrefixHash: 'deadbeef' });

    await db.delete(cards).where(eq(cards.id, card.id));

    // Contacts and notes belong to the owner, so reissuing or deleting a card
    // never touches the people or the notes…
    expect(await db.select().from(contacts).where(eq(contacts.userId, card.userId))).toHaveLength(1);
    expect(await db.select().from(ownerNotes).where(eq(ownerNotes.userId, card.userId))).toHaveLength(1);
    // …while the audit rows for that card go with it.
    expect(await db.select().from(scanAttempts).where(eq(scanAttempts.cardId, card.id))).toHaveLength(0);
  });

  it('allows only one active card per owner, but any number of inactive ones', async () => {
    const userId = (await insertUser()).id;
    await insertCard(userId, true);
    await expect(insertCard(userId, true)).rejects.toThrow();
    await expect(insertCard(userId, false)).resolves.toBeTruthy();
  });

  it('defaults the card language set to the five shipped languages', async () => {
    const card = await insertCard((await insertUser()).id);
    expect(card.languages).toEqual(['en', 'es', 'fr', 'zh', 'ru']);
    expect(card.scanCount).toBe(0);
    expect(card.pinVersion).toBe(1);
    expect(card.active).toBe(true);
  });

  it('answers the healthcheck ping', async () => {
    const result = await db.execute(sql`select 1 as ok`);
    expect((result[0] as unknown as { ok: number }).ok).toBe(1);
  });
});
