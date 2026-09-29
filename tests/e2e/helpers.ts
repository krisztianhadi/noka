import { expect, type Page } from '@playwright/test';

/**
 * Shared setup for the browser tests. The owner plane is one page now, so these
 * helpers read as the flow an owner actually performs: sign up, add people, make
 * a card.
 */
export const PASSWORD = 'correct-horse-battery';

export async function signUp(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@noka.test`;
  await page.goto('/signup');
  await page.fill('#name', 'Krisztian');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.fill('#password_confirm', PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

export interface ContactSpec {
  name: string;
  relation?: string;
  phone: string;
  channels?: string[];
  spoken?: string[];
}

export async function addContact(page: Page, spec: ContactSpec): Promise<void> {
  // The add form is the last one inside the contacts section.
  const form = page.locator('#contacts form').last();
  await form.locator('input[name="name"]').fill(spec.name);
  await form.locator('select[name="relation"]').selectOption(spec.relation ?? 'spouse');
  await form.locator('input[name="phone"]').fill(spec.phone);
  for (const channel of spec.channels ?? []) {
    await form.locator(`input[name="channels"][value="${channel}"]`).check();
  }
  // The spoken languages live behind a disclosure: open it like a person would,
  // rather than reaching into a hidden control.
  if ((spec.spoken ?? []).length > 0) await form.locator('summary').first().click();
  for (const code of spec.spoken ?? []) {
    await form.locator(`input[name="spoken"][value="${code}"]`).check();
  }
  await form.getByRole('button', { name: 'Add contact' }).click();
  await expect(page).toHaveURL(/notice=contact-added$/);
}

export async function makeCard(page: Page): Promise<{ slug: string; pin: string }> {
  await page.getByRole('button', { name: 'Make my card' }).click();
  await expect(page).toHaveURL(/notice=card-made$/);
  return readCard(page);
}

export async function readCard(page: Page): Promise<{ slug: string; pin: string }> {
  const pin = ((await page.locator('.pin').textContent()) ?? '').trim();
  const url = ((await page.locator('.url').textContent()) ?? '').trim();
  return { slug: url.split('/').pop() ?? '', pin };
}

export async function saveNotes(page: Page, text: string): Promise<void> {
  await page.fill('#notes', text);
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page).toHaveURL(/notice=notes-saved$/);
}
