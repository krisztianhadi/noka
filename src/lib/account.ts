import { and, count, eq, max } from 'drizzle-orm';
import { users } from '@/db/auth-schema';
import { getDb } from '@/db/client';
import { scanAttempts } from '@/db/schema';
import { cardUrl, getCardForOwner, revealPin } from '@/lib/cards';
import { getNotes, listContacts } from '@/lib/contacts';

/**
 * The account's own data, as a file the owner can keep (GDPR portability, Art. 20).
 *
 * Everything here is theirs: contacts decrypted, notes, the card. Nothing is added that
 * they never gave us, and nothing they cannot already read on their own dashboard.
 *
 * Scan attempts are summarised, not dumped. The rows hold an HMAC'd address prefix that
 * means nothing to the owner — the fact worth exporting is how often the card was tried.
 * A list of opaque hashes is not portability, it is noise that looks like data.
 */
export interface ExportScanSummary {
  total: number;
  failed: number;
  lastAt: string | null;
}

export interface OwnerExport {
  exportedAt: string;
  format: number;
  account: { id: string; name: string; email: string; createdAt: string };
  card: {
    url: string;
    /** The owner's own PIN: without it the export cannot reproduce the card. */
    pin: string;
    languages: string[];
    createdAt: string;
    scans: ExportScanSummary;
  } | null;
  contacts: Array<{
    name: string;
    relation: string;
    phone: string;
    services: string[];
    textOnly: boolean;
    spokenLanguages: string[];
  }>;
  notes: string | null;
}

export const EXPORT_FORMAT = 1;

async function scanSummary(cardId: string): Promise<ExportScanSummary> {
  const db = getDb();
  const [totals] = await db
    .select({ total: count(), lastAt: max(scanAttempts.createdAt) })
    .from(scanAttempts)
    .where(eq(scanAttempts.cardId, cardId));
  const [failures] = await db
    .select({ failed: count() })
    .from(scanAttempts)
    .where(and(eq(scanAttempts.cardId, cardId), eq(scanAttempts.success, false)));

  return {
    total: totals?.total ?? 0,
    failed: failures?.failed ?? 0,
    lastAt: totals?.lastAt ? new Date(totals.lastAt).toISOString() : null,
  };
}

export async function exportOwnerData(userId: string): Promise<OwnerExport | null> {
  const [account] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) return null;

  const [card, people, notes] = await Promise.all([
    getCardForOwner(userId),
    listContacts(userId),
    getNotes(userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    format: EXPORT_FORMAT,
    account: {
      id: account.id,
      name: account.name ?? '',
      email: account.email,
      createdAt: new Date(account.createdAt).toISOString(),
    },
    card: card
      ? {
          url: cardUrl(card),
          pin: revealPin(card),
          languages: card.languages,
          createdAt: new Date(card.createdAt).toISOString(),
          scans: await scanSummary(card.id),
        }
      : null,
    contacts: people.map((contact) => ({
      name: contact.name,
      relation: contact.relation,
      phone: contact.phoneE164,
      services: contact.channels,
      textOnly: contact.textOnly,
      spokenLanguages: contact.spokenLanguages,
    })),
    notes: notes.length > 0 ? notes : null,
  };
}

/**
 * Erase the account and everything hanging off it (GDPR erasure, Art. 17).
 *
 * One delete: every table referencing `users` cascades — cards, contacts, notes, sessions,
 * and the audit rows that belong to a card. No soft-delete and no grace period, which is
 * the honest reading of "delete my account": a copy left in a backup is invisible to the
 * person who asked, and an account that still exists after being "deleted" is a lie.
 */
export async function deleteOwnerAccount(userId: string): Promise<void> {
  await getDb().delete(users).where(eq(users.id, userId));
}
