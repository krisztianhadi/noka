import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Phase 1 smoke suite. The assertions that matter here are the ones PLAN §12
 * makes contractual: the responder plane carries no scripts and no external
 * requests, and the §5 headers are present on every /c/* response.
 */
const SLUG = 'A'.repeat(26);

test.describe('landing', () => {
  test('renders the product name and loads no third-party request', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') external.push(request.url());
    });

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('noka');
    expect(external).toEqual([]);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('operational endpoints', () => {
  test('/healthz reports the database as up', async ({ request }) => {
    const response = await request.get('/healthz');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { status: string; database: string };
    expect(body.status).toBe('ok');
    expect(body.database).toBe('up');
  });

  test('/robots.txt disallows the responder and dashboard planes', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /c/');
    expect(body).toContain('Disallow: /dashboard/');
  });
});

test.describe('responder plane', () => {
  test('serves no JavaScript and carries every §5 header', async ({ request }) => {
    const response = await request.get(`/c/${SLUG}`);
    const headers = response.headers();

    expect(headers['content-security-policy']).toContain("default-src 'none'");
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['vary']).toContain('Accept-Language');
    expect(headers['x-content-type-options']).toBe('nosniff');

    const html = await response.text();
    expect(html).not.toMatch(/<script/i);

    // No resource may be fetched from anywhere (§5): only same-origin paths,
    // data URIs, in-page anchors, tel:/mailto: links and the wa.me navigation
    // target are allowed. XML namespaces (xmlns=) are not resource loads.
    const resourceRefs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
      .map((match) => match[1] ?? '')
      .filter(
        (value) =>
          !value.startsWith('data:') &&
          !value.startsWith('#') &&
          !value.startsWith('/') &&
          !/^(tel:|mailto:)/i.test(value) &&
          !/^https:\/\/wa\.me\//i.test(value),
      );
    expect(resourceRefs, `external resource references: ${resourceRefs.join(', ')}`).toEqual([]);
  });
});
