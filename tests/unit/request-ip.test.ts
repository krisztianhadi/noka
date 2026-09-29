import { describe, expect, it } from 'vitest';
import { clientIp, hashIp, ipPrefix } from '@/lib/request-ip';

describe('clientIp', () => {
  it('prefers the first hop of X-Forwarded-For', () => {
    const request = new Request('https://noka.test/c/x', {
      headers: { 'x-forwarded-for': '203.0.113.9, 70.41.3.18, 150.172.238.178' },
    });
    expect(clientIp(request, '10.0.0.1')).toBe('203.0.113.9');
  });

  it('falls back to the socket address when there is no header', () => {
    expect(clientIp(new Request('https://noka.test/c/x'), '198.51.100.7')).toBe('198.51.100.7');
  });

  it('ignores a header that is not an address at all', () => {
    const request = new Request('https://noka.test/c/x', { headers: { 'x-forwarded-for': 'unknown' } });
    expect(clientIp(request, '198.51.100.7')).toBe('198.51.100.7');
    expect(clientIp(request)).toBeNull();
  });

  it('accepts an IPv6 client', () => {
    const request = new Request('https://noka.test/c/x', { headers: { 'x-forwarded-for': '2001:db8::1' } });
    expect(clientIp(request)).toBe('2001:db8::1');
  });
});

describe('ipPrefix', () => {
  it('keeps the whole IPv4 address (D26)', () => {
    expect(ipPrefix('203.0.113.9')).toBe('203.0.113.9');
  });

  it('collapses IPv6 to its /64, compressed or not', () => {
    expect(ipPrefix('2001:db8:1234:5678:9abc:def0:1234:5678')).toBe('2001:db8:1234:5678::/64');
    expect(ipPrefix('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipPrefix('::1')).toBe('0:0:0:0::/64');
  });

  it('leaves something that is not an address alone', () => {
    expect(ipPrefix('not-an-ip')).toBe('not-an-ip');
  });
});

describe('hashIp', () => {
  it('is keyed, stable and not the raw address', () => {
    const hash = hashIp('203.0.113.9');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashIp('203.0.113.9'));
    expect(hash).not.toContain('203.0.113.9');
    expect(hash).not.toBe(hashIp('203.0.113.10'));
  });

  it('hashes the prefix, so two addresses in one IPv6 /64 collide by design', () => {
    expect(hashIp('2001:db8::1')).toBe(hashIp('2001:db8::ffff'));
  });

  it('returns null when there is no address to hash', () => {
    expect(hashIp(null)).toBeNull();
  });
});
