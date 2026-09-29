import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { getConfig } from '@/config';

/**
 * IP handling of §6 and D26: never store a raw address, and key IPv4 on the
 * full address while collapsing IPv6 to its /64 — one host has 2^64 addresses,
 * and a plain SHA-256 of a small IPv4 space is reversible by brute force, hence
 * the HMAC.
 */

/** The real client IP, preferring the platform's forwarded header. */
export function clientIp(request: Request, clientAddress?: string): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded && isIP(forwarded) ? forwarded : clientAddress;
  return candidate && isIP(candidate) ? candidate : null;
}

/** IPv4 stays whole; IPv6 collapses to /64. */
export function ipPrefix(ip: string): string {
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return ip;

  // Expand the compressed form so the first four groups are always the /64.
  const [head = '', tail = ''] = ip.split('::');
  const left = head.split(':').filter(Boolean);
  const right = tail.split(':').filter(Boolean);
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array.from({ length: Math.max(missing, 0) }, () => '0'), ...right];
  return `${groups.slice(0, 4).join(':')}::/64`;
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac('sha256', getConfig().IP_HASH_KEY).update(ipPrefix(ip)).digest('hex');
}
