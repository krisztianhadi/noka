import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPONSORS, SPONSOR_LOGO_DIR, usableSponsors, type Sponsor } from '@/config/sponsors';

/**
 * The sponsor policy of D18 / PLAN §18, enforced where it can be broken: an entry that
 * arrives from outside this project may not cost the page a third-party request, and may
 * not send a visitor somewhere that is not a real address.
 *
 * These are the cases a careless paste produces. The strip on the page renders
 * `usableSponsors()`, so anything refused here cannot reach the HTML.
 */
const usable: Sponsor = {
  name: 'Example Co',
  href: 'https://example.com/',
  logo: `${SPONSOR_LOGO_DIR}example.svg`,
  width: 120,
  height: 32,
};

describe('sponsor entries', () => {
  it('keeps an entry that costs the page nothing', () => {
    expect(usableSponsors([usable])).toEqual([usable]);
  });

  it('keeps a link back into this site', () => {
    expect(usableSponsors([{ ...usable, href: '/privacy' }])).toEqual([{ ...usable, href: '/privacy' }]);
  });

  it('drops a logo this origin does not serve', () => {
    const offenders = [
      'https://cdn.example.com/logo.svg',
      'http://cdn.example.com/logo.svg',
      '//cdn.example.com/logo.svg',
      'sponsors/example.svg',
      '/images/example.svg',
      '/sponsors/../../etc/passwd',
      '/sponsors/',
      '',
    ];
    for (const logo of offenders) {
      expect(usableSponsors([{ ...usable, logo }]), logo).toEqual([]);
    }
  });

  it('drops a link that is not a destination', () => {
    const offenders = [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://example.com/',
      '//example.com/',
      'example.com',
      '',
    ];
    for (const href of offenders) {
      expect(usableSponsors([{ ...usable, href }]), href).toEqual([]);
    }
  });

  it('drops an entry whose size cannot hold the layout still', () => {
    const offenders = [
      { width: 0 },
      { height: 0 },
      { width: 120.5 },
      { height: -32 },
      { width: Number.NaN },
    ];
    for (const size of offenders) {
      expect(usableSponsors([{ ...usable, ...size }]), JSON.stringify(size)).toEqual([]);
    }
  });

  it('drops an entry with no name to read out', () => {
    expect(usableSponsors([{ ...usable, name: '   ' }])).toEqual([]);
  });

  it('keeps the good entries when a bad one sits beside them', () => {
    expect(usableSponsors([{ ...usable, logo: 'https://elsewhere/x.svg' }, usable])).toEqual([usable]);
  });

  it('has a logo file on disk for every configured sponsor', () => {
    // Vacuous while the list is empty — which it is until there is a sponsor to name. It
    // fails the moment one is configured and its file was not committed, because that is a
    // broken image on the landing page rather than a build error.
    for (const sponsor of usableSponsors(SPONSORS)) {
      expect(existsSync(`public${sponsor.logo}`), sponsor.logo).toBe(true);
    }
  });
});
