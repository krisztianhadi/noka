import { getConfig } from '@/config';

/**
 * Who this copy of noka belongs to (2026-10-05), mirroring the sibling project.
 *
 * Three questions, answered in one place so the header, the footer and the legal pages cannot
 * disagree with each other:
 *
 * - **Is this a self-hosted copy?** `SELF_HOSTED=true`, set by whoever runs their own. It does not
 *   change any behaviour — it changes what the instance *says about itself*, which is the honest
 *   place for the distinction. (ghosted derives this from `SHOW_LANDING`; keeping the two apart
 *   means a self-hoster can run the landing page and still get the DIY mark and their own
 *   imprint.)
 * - **What mark does it carry?** `BRAND_TAG`, defaulting to `DIY` on a self-hosted copy and to
 *   nothing on this one. `BRAND_TAG=none` removes it.
 * - **Who operates it?** `OPERATOR_*`. Left empty on a self-hosted copy, the footer and the
 *   imprint say "a self-hosted copy of noka" instead of naming an operator they do not have.
 */
export interface SiteIdentity {
  selfHosted: boolean;
  /** The superscript after the wordmark, or null for none. */
  brandTag: string | null;
  /** The operator, when this instance knows one. */
  operator: { name: string; email: string | null; url: string | null } | null;
}

/** The instance this project runs, so its own copy stays explicit rather than implied. */
const HOSTED_OPERATOR = {
  name: 'No More Names Studio',
  email: 'hey@lostsignals.studio',
  url: 'https://nomorenames.studio',
};

export function siteIdentity(): SiteIdentity {
  const config = getConfig();
  const selfHosted = config.SELF_HOSTED;

  const stated = config.BRAND_TAG?.trim();
  const brandTag =
    stated === undefined || stated === ''
      ? selfHosted
        ? 'DIY'
        : null
      : stated.toLowerCase() === 'none'
        ? null
        : stated;

  const operatorName = config.OPERATOR_NAME?.trim();
  const operator = operatorName
    ? {
        name: operatorName,
        email: config.OPERATOR_EMAIL?.trim() || null,
        url: config.OPERATOR_URL?.trim() || null,
      }
    : selfHosted
      ? null
      : HOSTED_OPERATOR;

  return { selfHosted, brandTag, operator };
}

/** The footer's "made by" line: an operator, or the honest admission that there is not one. */
export function operatorLine(identity: SiteIdentity): { name: string; url: string | null } {
  if (identity.operator) return { name: identity.operator.name, url: identity.operator.url };
  return { name: 'a self-hosted copy of noka', url: null };
}
