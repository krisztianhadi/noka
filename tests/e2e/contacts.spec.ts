import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Contacts, notes and the activation gate (Phase 4). Everything is a plain
 * form POST; no client JavaScript is involved.
 */
const PASSWORD = 'correct-horse-battery';

async function signUp(page: Page): Promise<string> {
  const email = `contacts-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@noka.test`;
  await page.goto('/signup');
  await page.fill('#name', 'Krisztian');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function createCard(page: Page): Promise<void> {
  await page.goto('/dashboard/card');
  await page.getByRole('button', { name: 'Create my card' }).click();
  await expect(page).toHaveURL(/notice=created$/);
}

async function addContact(page: Page, name: string, phone: string, spoken: string[] = []): Promise<void> {
  await page.goto('/dashboard/contacts/new');
  await page.fill('#name', name);
  await page.selectOption('#relation', 'spouse');
  await page.fill('#phone', phone);
  for (const code of spoken) await page.locator(`input[name="spoken"][value="${code}"]`).check();
  await page.getByRole('button', { name: 'Add contact' }).click();
  await expect(page).toHaveURL(/notice=created$/);
}

test.describe('contacts', () => {
  test('adds a contact, switches the card on, and keeps it reachable', async ({ page }) => {
    await signUp(page);
    await createCard(page);

    // Nothing to reach yet: the card cannot be switched on.
    await expect(page.getByRole('button', { name: 'Switch on' })).toBeDisabled();

    await addContact(page, 'Maria Silva', '+66 812 345 678', ['th', 'en']);
    await expect(page.locator('.contacts')).toContainText('Maria Silva');
    await expect(page.locator('.contacts')).toContainText('Spouse');
    // Tags render in the vocabulary's order, which is the order the form posts.
    await expect(page.locator('.contacts .tag')).toHaveText(['English', 'Thai']);
    await expect(page.locator('.contacts a[href="tel:+66812345678"]')).toBeVisible();
    await expect(page.locator('.contacts a[href="https://wa.me/66812345678"]')).toBeVisible();

    // Now it can be switched on, and the contacts page says so.
    await page.goto('/dashboard/card');
    const switchOn = page.getByRole('button', { name: 'Switch on' });
    await expect(switchOn).toBeEnabled();
    await switchOn.click();
    await expect(page).toHaveURL(/notice=activated$/);

    await page.goto('/dashboard/contacts');
    await expect(page.locator('.status')).toContainText('The card is on');

    // The last contact on an active card cannot be deleted (D28)...
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/error=last-contact-while-active/);
    await expect(page.locator('.error')).toContainText('Switch the card off');
    await expect(page.locator('.contacts')).toContainText('Maria Silva');

    // ...but after switching off, it can.
    await page.goto('/dashboard/card');
    await page.getByRole('button', { name: 'Switch off' }).click();
    await expect(page).toHaveURL(/notice=deactivated$/);
    await page.goto('/dashboard/contacts');
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/notice=deleted$/);
    await expect(page.locator('.contacts')).toHaveCount(0);
  });

  test('edits a contact and rejects a badly formatted number', async ({ page }) => {
    await signUp(page);
    await createCard(page);
    await addContact(page, 'João Silva', '+66812345678');

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.locator('h1')).toContainText('João Silva');

    // No country code: refused with the reason, nothing stored.
    await page.fill('#phone', '0812345678');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.error')).toContainText('country code');

    await page.fill('#name', 'Joao Silva');
    await page.fill('#phone', '+351912345678');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/notice=updated$/);
    await expect(page.locator('.contacts')).toContainText('Joao Silva');
    await expect(page.locator('.contacts')).toContainText('+351912345678');
  });

  test('saves notes for a responder', async ({ page }) => {
    await signUp(page);
    await createCard(page);

    await page.goto('/dashboard/notes');
    await page.fill('#notes', 'Type 1 diabetic. Allergic to penicillin.');
    await page.getByRole('button', { name: 'Save notes' }).click();
    await expect(page).toHaveURL(/notice=saved$/);

    await page.reload();
    await expect(page.locator('#notes')).toHaveValue('Type 1 diabetic. Allergic to penicillin.');
  });

  test('the contacts pages are accessible', async ({ page }) => {
    await signUp(page);
    await createCard(page);
    await addContact(page, 'Maria Silva', '+66812345678');

    for (const path of ['/dashboard/contacts', '/dashboard/contacts/new', '/dashboard/notes']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `${path} violations`).toEqual([]);
    }
  });
});
