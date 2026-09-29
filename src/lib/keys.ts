import { getConfig } from '@/config';
import { keyring, type Keyring } from '@/lib/crypto';

/**
 * One place that turns configuration into a keyring, so `cards.ts` and
 * `contacts.ts` cannot drift apart on the key version they write with.
 */
let cached: Keyring | undefined;
let cachedSecret: string | undefined;

export function contactKeyring(): Keyring {
  const secret = getConfig().CONTACT_ENCRYPTION_KEY;
  if (!cached || cachedSecret !== secret) {
    cached = keyring({ 1: secret });
    cachedSecret = secret;
  }
  return cached;
}
