import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The card journey (Phase 3): create it, read the PIN the owner would print,
 * rotate it, reissue the QR. Plain form POSTs, no client JavaScript.
 */
const PASSWORD = 'correct-horse-battery';

async function signUp(page: Page): Promise<string> {
  const email = `card-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@noka.test`;
  await page.goto('/signup');
  await page.fill('#name', 'Krisztian');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

test.describe('card', () => {
  test('creates one card, shows a printable PIN and reissues the QR', async ({ page }) => {
    await signUp(page);

    await page.getByRole('link', { name: /Create your card/ }).click();
    await page.getByRole('button', { name: 'Create my card' }).click();
    await expect(page).toHaveURL(/\/dashboard\/card\?notice=created$/);

    // The PIN the owner would print: six digits, grouped.
    const pin = page.locator('.pin');
    await expect(pin).toHaveText(/^\d{3} \d{3}$/);
    const firstPin = (await pin.textContent())?.trim();

    // Nothing to reach yet, so it cannot be switched on (D28).
    await expect(page.getByRole('button', { name: 'Switch on' })).toBeDisabled();

    await page.getByRole('button', { name: 'New PIN' }).click();
    await expect(page).toHaveURL(/notice=pin-rotated$/);
    await expect(page.getByRole('status')).toContainText('New PIN');
    await expect(pin).toHaveText(/^\d{3} \d{3}$/);
    expect((await pin.textContent())?.trim()).not.toBe(firstPin);

    const url = page.locator('.url');
    const firstUrl = (await url.textContent())?.trim();
    await page.getByRole('button', { name: 'New QR code' }).click();
    await expect(page).toHaveURL(/notice=slug-regenerated$/);
    await expect(page.getByRole('status')).toContainText('New QR code');
    expect((await url.textContent())?.trim()).not.toBe(firstUrl);

    // Creating again is a no-op: still exactly one card.
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /Manage the card/ })).toBeVisible();
  });

  test('signing out and back in shows the same card', async ({ page }) => {
    const email = await signUp(page);
    await page.goto('/dashboard/card');
    await page.getByRole('button', { name: 'Create my card' }).click();
    const pin = (await page.locator('.pin').textContent())?.trim();

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.goto('/dashboard/card');
    // Same PIN: the card is reprintable, which is the whole point of D9.
    await expect(page.locator('.pin')).toHaveText(pin!);
  });

  test('the card page is accessible', async ({ page }) => {
    await signUp(page);
    await page.goto('/dashboard/card');
    await page.getByRole('button', { name: 'Create my card' }).click();
    await expect(page).toHaveURL(/notice=created$/);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
