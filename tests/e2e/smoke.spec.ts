import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { externalResources, unexpectedNavigations } from './helpers';

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
    // The heading is the wordmark, inlined so it can follow the theme; its accessible
    // name comes from the SVG's own role and label.
    await expect(page.getByRole('heading', { name: 'noka' })).toBeVisible();
    expect(external).toEqual([]);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('the footer belongs to the owner surfaces only', () => {
  test('every owner page carries it, and the card page never does', async ({ page, request }) => {
    for (const path of ['/', '/login', '/signup', '/privacy', '/terms', '/imprint']) {
      await page.goto(path);
      await expect(page.locator('footer'), `${path} footer`).toContainText('Lost Signals Studio');
      await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
    }

    // The responder plane is a stranger's emergency page: it shows the people to call and
    // nothing else — no maker, no legal nav, no link away from the card (ADR-026).
    const responder = await request.get(`/c/${SLUG}`);
    const html = await responder.text();
    expect(html).not.toContain('Lost Signals');
    expect(html).not.toContain('<footer');
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

    // Nothing is fetched from anywhere, and every navigation goes where a card page
    // may go (§5).
    expect(externalResources(html)).toEqual([]);
    expect(unexpectedNavigations(html)).toEqual([]);
  });
});
