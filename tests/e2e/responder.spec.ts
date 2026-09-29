import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The whole point of the product (§3, §9): a stranger with the card and the PIN
 * reaches the contacts in the card's own language, on a page with no JavaScript
 * and no third-party request — and gets nothing without the PIN.
 */
const PASSWORD = 'correct-horse-battery';

async function owner(page: Page): Promise<{ slug: string; pin: string }> {
  const email = `responder-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@noka.test`;
  await page.goto('/signup');
  await page.fill('#name', 'Krisztian');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.goto('/dashboard/card');
  await page.getByRole('button', { name: 'Create my card' }).click();
  await expect(page).toHaveURL(/notice=created$/);
  const pin = ((await page.locator('.pin').textContent()) ?? '').trim();
  const slug = ((await page.locator('.url').textContent()) ?? '').trim().split('/').pop() ?? '';

  await page.goto('/dashboard/contacts/new');
  await page.fill('#name', 'Maria Silva');
  await page.selectOption('#relation', 'spouse');
  await page.fill('#phone', '+66 812 345 678');
  await page.locator('input[name="spoken"][value="th"]').check();
  await page.locator('input[name="spoken"][value="en"]').check();
  await page.getByRole('button', { name: 'Add contact' }).click();

  await page.goto('/dashboard/notes');
  await page.fill('#notes', 'Type 1 diabetic. Allergic to penicillin.');
  await page.getByRole('button', { name: 'Save notes' }).click();

  await page.goto('/dashboard/card');
  await page.getByRole('button', { name: 'Switch on' }).click();
  await expect(page).toHaveURL(/notice=activated$/);

  return { slug, pin };
}

test.describe('the responder page', () => {
  test('a stranger needs the PIN, then reads the contacts and can hide them', async ({ browser, page }) => {
    const { slug, pin } = await owner(page);

    // A separate context: no owner session, no cookies — a stranger's phone.
    const stranger = await browser.newContext();
    const guest = await stranger.newPage();

    // 1. The PIN page carries no contact data and no JavaScript.
    const formResponse = await guest.goto(`/c/${slug}`);
    expect(formResponse?.status()).toBe(200);
    const formHtml = await guest.request.get(`/c/${slug}`).then((response) => response.text());
    expect(formHtml).not.toMatch(/<script/i);
    expect(formHtml).not.toMatch(/<link[^>]+rel="stylesheet"/i);
    expect(formHtml).not.toContain('Maria');
    expect(formHtml).not.toContain('penicillin');
    await expect(guest.getByRole('heading')).toContainText('Emergency contacts');

    // 2. The wrong PIN says nothing useful.
    await guest.fill('#pin', '000000');
    await guest.getByRole('button', { name: 'Open' }).click();
    await expect(guest.locator('.error')).toContainText('not correct');
    await expect(guest.locator('body')).not.toContainText('Maria');

    // 3. The right PIN opens the view.
    await guest.fill('#pin', pin);
    await guest.getByRole('button', { name: 'Open' }).click();
    await expect(guest).toHaveURL(new RegExp(`/c/${slug}/view$`));
    await expect(guest.locator('.name')).toHaveText('Maria Silva');
    await expect(guest.locator('.contact .relation')).toContainText('Spouse');
    await expect(guest.locator('.speaks')).toContainText('Thai');
    await expect(guest.locator('a.call')).toHaveAttribute('href', 'tel:+66812345678');
    await expect(guest.locator('a.whatsapp')).toHaveAttribute('href', 'https://wa.me/66812345678');
    await expect(guest.locator('.notes')).toContainText('Allergic to penicillin.');

    // Still zero JavaScript, still one request.
    const viewHtml = await guest.request.get(`/c/${slug}/view`).then((response) => response.text());
    expect(viewHtml).not.toMatch(/<script/i);
    expect(viewHtml).not.toMatch(/<link[^>]+rel="stylesheet"/i);

    // 4. The responder can switch the page into their own language.
    await guest.getByRole('button', { name: 'Русский' }).click();
    await expect(guest).toHaveURL(new RegExp(`/c/${slug}/view$`));
    await expect(guest.locator('a.call')).toContainText('Позвонить');
    await expect(guest.locator('body')).toContainText('Говорит на');

    // 5. "Hide now" clears both cookies and the view is unreachable again.
    await guest.getByRole('button', { name: 'Скрыть сейчас' }).click();
    await expect(guest).toHaveURL(new RegExp(`/c/${slug}$`));
    await guest.goto(`/c/${slug}/view`);
    await expect(guest).toHaveURL(new RegExp(`/c/${slug}$`));

    await stranger.close();
  });

  test('an unknown slug looks exactly like a locked card', async ({ request }) => {
    const unknown = 'Z'.repeat(26);
    const response = await request.get(`/c/${unknown}`);
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain('Emergency contacts');
    // The same language switcher, so the page shape does not differ.
    expect(body).toContain('Русский');
    // And posting to it is the same generic refusal.
    const posted = await request.post(`/c/${unknown}`, { form: { pin: '000000' } });
    expect(posted.status()).toBe(200);
    expect(await posted.text()).toContain('That PIN is not correct.');
  });

  test('switching the card off closes the door on a live guest cookie', async ({ browser, page }) => {
    const { slug, pin } = await owner(page);

    const stranger = await browser.newContext();
    const guest = await stranger.newPage();
    await guest.goto(`/c/${slug}`);
    await guest.fill('#pin', pin);
    await guest.getByRole('button', { name: 'Open' }).click();
    await expect(guest).toHaveURL(new RegExp(`/c/${slug}/view$`));

    await page.goto('/dashboard/card');
    await page.getByRole('button', { name: 'Switch off' }).click();
    await expect(page).toHaveURL(/notice=deactivated$/);

    await guest.goto(`/c/${slug}/view`);
    await expect(guest).toHaveURL(new RegExp(`/c/${slug}$`));
    await stranger.close();
  });

  test('the responder pages are accessible', async ({ browser, page }) => {
    const { slug, pin } = await owner(page);
    const stranger = await browser.newContext();
    const guest = await stranger.newPage();

    await guest.goto(`/c/${slug}`);
    const pinPage = await new AxeBuilder({ page: guest }).analyze();
    expect(pinPage.violations, 'PIN page').toEqual([]);

    await guest.fill('#pin', pin);
    await guest.getByRole('button', { name: 'Open' }).click();
    await expect(guest).toHaveURL(new RegExp(`/c/${slug}/view$`));
    const viewPage = await new AxeBuilder({ page: guest }).analyze();
    expect(viewPage.violations, 'view page').toEqual([]);

    await stranger.close();
  });
});
