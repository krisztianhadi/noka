import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The owner journey as it exists today: create an account, land on the
 * dashboard, sign out, sign back in. Plain form POSTs — no client JavaScript
 * is involved on either side (D6).
 */
import { PASSWORD } from './helpers';

test.describe('owner plane', () => {
  test('signs up, guards the dashboard, signs out and back in', async ({ page }) => {
    const email = `e2e-${Date.now()}@noka.test`;

    await page.goto('/signup');
    await page.fill('#name', 'Krisztian');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.fill('#password_confirm', PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('h1')).toHaveText('Emergency contacts');
    // The account lives in the top menu now.
    await page.locator('header .menu > summary').click();
    await expect(page.locator('header .panel')).toContainText('Krisztian');
    await expect(page.locator('header .panel')).toContainText(email);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The session is gone server-side, so the guard bounces us back.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);

    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('needs the password twice, and refuses a mismatch', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('#name', 'Krisztian');
    await page.fill('#email', `mismatch-${Date.now()}@noka.test`);
    await page.fill('#password', PASSWORD);
    await page.fill('#password_confirm', `${PASSWORD}-typo`);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('.error')).toContainText('do not match');
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('reports a wrong password without saying whether the account exists', async ({ page }) => {
    const email = `e2e-unknown-${Date.now()}@noka.test`;
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', 'definitely-not-it');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('.error')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the owner plane speaks the device language, and remembers a choice', async ({ browser }) => {
    // A Spanish phone: no cookie, nothing chosen — the page should already be Spanish.
    const spanish = await browser.newContext({ locale: 'es-ES' });
    const page = await spanish.newPage();
    await page.goto('/signup');
    await expect(page.getByRole('heading')).toHaveText('Crea tu cuenta');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    // The responder catalogue and the owner plane share one set of languages: the switcher
    // offers exactly what the card pages offer.
    await expect(page.locator('footer .languages summary')).toContainText('Español');

    // A language the app does not have falls back to English, not to the first entry.
    const thai = await browser.newContext({ locale: 'th-TH' });
    const other = await thai.newPage();
    await other.goto('/signup');
    await expect(other.getByRole('heading')).toHaveText('Create your account');

    // Choosing overrides the device from then on, including after a sign-in redirect.
    await page.locator('footer .languages summary').click();
    await page.locator('footer .languages button[value="fr"]').click();
    await expect(page.getByRole('heading')).toHaveText('Créez votre compte');
    await page.goto('/login');
    await expect(page.getByRole('heading')).toHaveText('Se connecter');

    await spanish.close();
    await thai.close();
  });

  test('signup, login, the legal pages and the demo are accessible', async ({ page }) => {
    for (const path of ['/signup', '/login', '/privacy', '/terms', '/imprint', '/demo']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `${path} violations`).toEqual([]);
    }
  });
});

/**
 * The reset flow's pages (2026-10-05), and the Google button that must not exist without a client.
 *
 * What the browser can prove here is the shape: the request page answers the same way for any
 * address (no account oracle), the reset page refuses a link with no token instead of offering a
 * form that cannot work, and no OAuth button appears on an instance with no Google credentials —
 * which is every instance until someone sets them. The token round-trip itself is covered where it
 * can be real: `tests/integration/password-reset.test.ts`.
 */
test.describe('password reset', () => {
  test('asks for an address, answers the same either way, and refuses a dead link', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible();
    // No Google client is configured in this environment, so no OAuth button may be offered.
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL(/\/forgot$/);
    await page.fill('#email', 'nobody-has-this-address@noka.test');
    await page.getByRole('button', { name: 'Send the link' }).click();

    // The same sentence an existing account would get: nothing here confirms an address.
    await expect(page.locator('body')).toContainText('Check that inbox');
    await expect(page.locator('body')).not.toContainText('no account');

    // A reset link that arrives without a token is a dead end, and says so with a way out.
    await page.goto('/reset');
    await expect(page.locator('body')).toContainText('expired or was already used');
    await expect(page.getByRole('link', { name: 'Send a new link' })).toBeVisible();
    await expect(page.locator('#password')).toHaveCount(0);

    // With a token the form appears, and the two passwords must match before anything is sent.
    await page.goto('/reset?token=not-a-real-token');
    await page.fill('#password', 'a-long-enough-password');
    await page.fill('#password_confirm', 'a-different-password');
    await page.getByRole('button', { name: 'Save and sign in' }).click();
    await expect(page.locator('.error')).toContainText('do not match');
  });
});
