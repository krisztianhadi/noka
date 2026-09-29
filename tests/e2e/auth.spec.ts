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

  test('signup and login are accessible', async ({ page }) => {
    for (const path of ['/signup', '/login']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `${path} violations`).toEqual([]);
    }
  });
});
