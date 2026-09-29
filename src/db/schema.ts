import { sql } from 'drizzle-orm';
import { bigserial, boolean, customType, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth-schema';

/**
 * Schema of §10.
 *
 * Encrypted columns are `bytea` and are written by src/lib/crypto.ts — the DB
 * never holds the key. `rate_limits` is owned by rate-limiter-flexible and is
 * therefore not declared here.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 16 random bytes, uppercase Crockford base32 (D13). */
    slug: text('slug').notNull().unique(),
    pinHash: text('pin_hash').notNull(),
    /** The PIN, encrypted, so the owner can view and reprint while active (D9). */
    pinEncrypted: bytea('pin_encrypted').notNull(),
    pinVersion: integer('pin_version').notNull().default(1),
    pinRotatedAt: timestamp('pin_rotated_at', { withTimezone: true }),
    /** Ordered; [0] is the responder fallback; drives print and web alike (D15, D19). */
    languages: text('languages').array().notNull().default(sql`'{en,es,fr,zh,ru}'`),
    active: boolean('active').notNull().default(false),
    /** Successful PIN unlocks only (D25). */
    scanCount: integer('scan_count').notNull().default(0),
    /** Display only — the limiter store owns the real backoff state. */
    lastFailedAt: timestamp('last_failed_at', { withTimezone: true }),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('cards_one_active_per_user').on(table.userId).where(sql`${table.active}`)],
);

/**
 * Contacts belong to the **owner**, not to a card: the owner adds people first and
 * makes a card afterwards (his onboarding order, 2026-09-29). The responder page
 * reaches them through the card's `user_id`.
 */
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** AES-256-GCM of the schema-3 payload (src/lib/contact-payload.ts). */
    payloadEncrypted: bytea('payload_encrypted').notNull(),
    keyVersion: smallint('key_version').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('contacts_user_sort_idx').on(table.userId, table.sortOrder)],
);

/**
 * Free-text notes belong to the owner as well: they are written before any card
 * exists (contacts → notes → card), and the responder page reads them through the
 * card's owner.
 */
export const ownerNotes = pgTable('owner_notes', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  notesEncrypted: bytea('notes_encrypted'),
  keyVersion: smallint('key_version'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scanAttempts = pgTable(
  'scan_attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }),
    /** pin_fail | pin_success — page loads are not audited (D25). */
    kind: text('kind').notNull(),
    success: boolean('success').notNull(),
    /** HMAC of the IPv6 /64 or the full IPv4; never a raw address (D26). */
    ipPrefixHash: text('ip_prefix_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('scan_attempts_card_idx').on(table.cardId, table.createdAt.desc()),
    index('scan_attempts_ip_idx').on(table.ipPrefixHash, table.createdAt.desc()),
  ],
);
