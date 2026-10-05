#!/usr/bin/env node
/**
 * Restore drill (PLAN §11, Phase 9): prove that a backup of this database can be brought
 * back **and read**, which is the half a restore usually forgets. A dump that restores
 * cleanly but whose contacts cannot be decrypted is not a backup — it is a pile of
 * authenticated ciphertext, and the only way to know which one you have is to try it.
 *
 * What it does, in order:
 *
 *   1. fingerprints every contact in the live database: decrypt with the current keyring,
 *      hash `id | name | phone | channels | spoken languages` per row, hash the sorted list;
 *   2. `pg_dump`s the database (custom format) into `.tmp/restore-drill/`;
 *   3. drops and recreates a scratch database, restores the dump into it;
 *   4. fingerprints the restored rows the same way and compares — a mismatch is a failure,
 *      and so is any row that will not decrypt;
 *   5. reads the restored rows with a **wrong keyring** and asserts every one of them
 *      refuses: the drill is worthless if a wrong key silently produces garbage.
 *
 * It prints no plaintext: the evidence is the two fingerprints and the row counts. Run it
 * with the same environment as the app (`.env`); it never writes to the source database.
 *
 *   node --import ./scripts/register-alias.mjs --env-file-if-exists=.env scripts/restore-drill.mjs
 *   pnpm drill:restore            # same thing, with the container's pg_dump
 *   pnpm drill:restore --keep     # leave the scratch database behind for inspection
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { decryptJson, keyring } from '@/lib/crypto';
import { readContactPayload } from '@/lib/contact-payload';
import { contactKeyring } from '@/lib/keys';

const CONTAINER = process.env.RESTORE_DRILL_CONTAINER ?? 'noka-db';
const PG_USER = process.env.RESTORE_DRILL_PG_USER ?? 'noka';
const SCRATCH_DB = process.env.RESTORE_DRILL_DB ?? 'noka_restore_drill';
const SOURCE_URL = process.env.DATABASE_URL;
const KEEP = process.argv.includes('--keep');
const DUMP_DIR = '.tmp/restore-drill';

if (!SOURCE_URL) {
  console.error('DATABASE_URL is not set. Run with --env-file-if-exists=.env.');
  process.exit(2);
}

const source = new URL(SOURCE_URL);
const scratchUrl = new URL(SOURCE_URL);
scratchUrl.pathname = `/${SCRATCH_DB}`;

function psql(database, sql) {
  return execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', PG_USER, '-d', database, '-tAc', sql], {
    encoding: 'utf8',
  }).trim();
}

/** Decrypt every contact and reduce it to one hash, so the comparison is over content. */
async function fingerprint(connectionString, ring) {
  const sql = postgres(connectionString, { max: 2, prepare: false });
  try {
    const rows = await sql`select id, payload_encrypted from contacts`;
    const lines = [];
    let decrypted = 0;
    let refused = 0;
    for (const row of rows) {
      try {
        const payload = readContactPayload(decryptJson(row.payload_encrypted, ring).value);
        decrypted += 1;
        lines.push(
          [
            row.id,
            payload.name,
            payload.phone_e164,
            payload.channels.join(','),
            payload.spoken_languages.join(','),
            payload.text_only ? 'text-only' : 'voice',
          ].join('|'),
        );
      } catch {
        refused += 1;
        lines.push(`${row.id}|<undecryptable>`);
      }
    }
    lines.sort();
    return {
      rows: rows.length,
      decrypted,
      refused,
      digest: createHash('sha256').update(lines.join('\n')).digest('hex'),
    };
  } finally {
    await sql.end();
  }
}

const same = (a, b) => a.rows === b.rows && a.decrypted === b.decrypted && a.refused === b.refused && a.digest === b.digest;
const short = (digest) => digest.slice(0, 16);

async function main() {
  console.log(`restore drill — source ${source.hostname}:${source.port || 5432}${source.pathname}`);
  const ring = contactKeyring();

  const before = await fingerprint(SOURCE_URL, ring);
  console.log(`  source      contacts=${before.rows} decrypted=${before.decrypted} undecryptable=${before.refused}`);
  console.log(`  source      fingerprint ${short(before.digest)}`);
  if (before.refused > 0) console.log(`  note        ${before.refused} row(s) in the live database do not decrypt with the current keyring`);

  mkdirSync(DUMP_DIR, { recursive: true });
  const dumpPath = join(DUMP_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
  const dump = execFileSync('docker', ['exec', CONTAINER, 'pg_dump', '-U', PG_USER, '-Fc', source.pathname.slice(1)], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  writeFileSync(dumpPath, dump);
  console.log(`  dump        ${dumpPath} (${(statSync(dumpPath).size / 1024 / 1024).toFixed(1)} MB)`);

  psql('postgres', `drop database if exists ${SCRATCH_DB} with (force)`);
  psql('postgres', `create database ${SCRATCH_DB}`);
  execFileSync('docker', ['exec', '-i', CONTAINER, 'pg_restore', '-U', PG_USER, '-d', SCRATCH_DB, '--no-owner', '--no-privileges'], {
    input: dump,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  console.log(`  restored    into ${SCRATCH_DB}`);

  const after = await fingerprint(scratchUrl.toString(), ring);
  console.log(`  restored    contacts=${after.rows} decrypted=${after.decrypted} undecryptable=${after.refused}`);
  console.log(`  restored    fingerprint ${short(after.digest)}`);

  const wrong = await fingerprint(scratchUrl.toString(), keyring({ 1: randomBytes(32).toString('base64') }));
  console.log(`  wrong key   decrypted=${wrong.decrypted} refused=${wrong.refused} (all must refuse)`);

  const failures = [];
  if (!same(before, after)) failures.push('the restored contacts do not match the source');
  if (after.refused > 0) failures.push(`${after.refused} restored row(s) did not decrypt with the current keyring`);
  if (wrong.decrypted > 0) failures.push(`${wrong.decrypted} row(s) decrypted with a wrong key`);

  // A row count is not a restore: the tables the product actually reads must be there.
  const counts = ['users', 'cards', 'contacts', 'scan_attempts', 'sessions'];
  const tableCounts = counts.map((table) => `${table}=${psql(SCRATCH_DB, `select count(*) from ${table}`)}`).join(' ');
  console.log(`  tables      ${tableCounts}`);

  if (!KEEP) {
    psql('postgres', `drop database if exists ${SCRATCH_DB} with (force)`);
    console.log(`  cleanup     dropped ${SCRATCH_DB} (--keep to inspect it)`);
  }

  if (failures.length > 0) {
    console.error(`\nDRILL FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('\nDRILL PASSED: the dump restored, the keyring matches, and a wrong key opens nothing.');
}

await main();
