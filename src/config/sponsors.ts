/**
 * Sponsors (D18, PLAN §18).
 *
 * The rule, in one sentence: a sponsor buys a **mark on a page**, not a row in a
 * database and not a view of anyone's scan.
 *
 * - Landing page and the auth pages only. Never `/c/*`, never `/dashboard`.
 * - The logo is a file in this repository, served from this origin. Never a third-party
 *   request, so the page keeps its CSP and the visitor is not announced to anyone.
 * - No script, no pixel, no impression counter, no data. There is nothing here to count.
 * - Links out carry `rel="sponsored noopener"` and open in a new tab.
 *
 * Adding one: put the SVG in `public/sponsors/`, then add an entry below with the logo's
 * real pixel width and height — both, so the strip cannot move while it loads.
 *
 * The list is **empty on purpose** until there is a sponsor to name. Nothing is invented
 * here: a strip with no sponsors renders nothing at all, which is the honest state.
 */

export interface Sponsor {
  /** Read by screen readers and shown as the image's alternative text. */
  name: string;
  /** An absolute `https://` address, or a path on this site. Anything else is dropped. */
  href: string;
  /** A path under `SPONSOR_LOGO_DIR`, served from this origin. */
  logo: string;
  width: number;
  height: number;
}

/** Where the mark files live. One place, so the resolver and the test agree. */
export const SPONSOR_LOGO_DIR = '/sponsors/';

export const SPONSORS: Sponsor[] = [];

/**
 * Keep only what the policy allows.
 *
 * A sponsor entry is content that arrived from outside this project, so it is filtered
 * rather than trusted: a typo or a careless paste must not be able to turn the landing
 * page into a third-party request or a tracker. Malformed entries are dropped silently —
 * a sponsor strip is not worth a 500 on the front page — and the caller can rely on the
 * result being renderable as-is.
 */
export function usableSponsors(sponsors: readonly Sponsor[] = SPONSORS): Sponsor[] {
  return sponsors.filter(isUsableSponsor);
}

function isUsableSponsor(sponsor: Sponsor): boolean {
  const { name, href, logo, width, height } = sponsor;
  if (typeof name !== 'string' || name.trim().length === 0) return false;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (width <= 0 || height <= 0) return false;
  return isSameOriginLogo(logo) && isAllowedLink(href);
}

/**
 * The logo must be a path this site serves. A scheme (`https:`), a protocol-relative
 * address (`//host`) and a relative path that climbs out of the directory are all
 * refusals, because each one ends in a request to somebody else's server.
 */
function isSameOriginLogo(logo: unknown): logo is string {
  if (typeof logo !== 'string') return false;
  if (!logo.startsWith(SPONSOR_LOGO_DIR)) return false;
  if (logo.includes('..') || logo.includes('\\')) return false;
  return /^\/sponsors\/[A-Za-z0-9._/-]+$/.test(logo);
}

/**
 * The link may leave the site — that is the point of a sponsor — but only to `https`,
 * and only as a well-formed address. A `javascript:` or `data:` URL, a bare `http:`
 * downgrade, or a protocol-relative address is dropped.
 */
function isAllowedLink(href: unknown): href is string {
  if (typeof href !== 'string' || href.trim().length === 0) return false;
  if (href.startsWith('//')) return false;
  if (href.startsWith('/')) return !href.includes('\\');
  try {
    return new URL(href).protocol === 'https:';
  } catch {
    return false;
  }
}
