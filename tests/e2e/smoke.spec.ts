import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { externalResources, signUp, trackExternalRequests, unexpectedNavigations } from './helpers';

/**
 * Phase 1 smoke suite. The assertions that matter here are the ones PLAN §12
 * makes contractual: the responder plane carries no scripts and no external
 * requests, and the §5 headers are present on every /c/* response.
 */
const SLUG = 'A'.repeat(26);

test.describe('landing', () => {
  test('renders the product name and loads no third-party request', async ({ page }) => {
    const external = trackExternalRequests(page);

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    // The wordmark is a link home, inlined so it can follow the theme; the h1 is the
    // page's message, which is what a heading is for.
    await expect(page.getByRole('link', { name: 'noka' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('people you trust');
    expect(external).toEqual([]);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('the demo', () => {
  test('runs the whole flow: PIN, contacts, exit', async ({ page }) => {
    // The landing shows a card with a QR code. Someone will scan it, and what they meet has to
    // be the real sequence — a picture of a contact list answers the wrong question.
    await page.goto('/demo');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Emergency contacts');
    await expect(page.getByRole('note')).toContainText('Example card');

    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/demo\/view$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sample Card');
    await expect(page.locator('.contact')).toHaveCount(2);
    await expect(page.locator('.notes')).toContainText('Blood type O+');

    await page.getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.locator('.contact')).toHaveCount(0);
  });

  test('keeps the contacts behind the PIN', async ({ page }) => {
    await page.goto('/demo/view');
    await expect(page).toHaveURL(/\/demo$/);
  });
});

test.describe('the footer belongs to the owner surfaces only', () => {
  test('every owner page carries it, and the card page never does', async ({ page, request }) => {
    for (const path of ['/', '/login', '/signup', '/privacy', '/terms', '/imprint']) {
      await page.goto(path);
      await expect(page.locator('footer'), `${path} footer`).toContainText('No More Names Studio');
      await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
    }

    // The responder plane is a stranger's emergency page: it shows the people to call and
    // nothing else — no maker, no legal nav, no link away from the card (ADR-026).
    const responder = await request.get(`/c/${SLUG}`);
    const html = await responder.text();
    expect(html).not.toContain('No More Names');
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

/**
 * D18 / PLAN §18. A sponsor buys a mark on the landing and auth pages: never `/c/*`,
 * never `/dashboard`, never a third-party request, never a counter. The strip renders
 * nothing while `src/config/sponsors.ts` is empty, so these guard the shape of the rule
 * rather than the presence of a logo — which is what has to hold the day one is added.
 */
test.describe('sponsor policy', () => {
  test('never reaches the responder plane', async ({ request }) => {
    for (const path of [`/c/${SLUG}`, '/demo']) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toContain('/sponsors/');
      expect(html, path).not.toContain('rel="sponsored');
    }
  });

  test('never reaches the dashboard', async ({ page }) => {
    await signUp(page);
    const html = await page.content();
    expect(html).not.toContain('/sponsors/');
    expect(html).not.toContain('rel="sponsored');
  });

  test('the pages that may carry one fetch nothing off-origin', async ({ page }) => {
    // The landing page's own version of this lives in the landing suite above.
    for (const path of ['/login', '/signup']) {
      const external = trackExternalRequests(page);
      await page.goto(path);
      expect(external, path).toEqual([]);
    }
  });
});
