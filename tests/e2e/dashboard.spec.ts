import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { addContact, makeCard, readCard, saveNotes, signUp } from './helpers';

/**
 * The owner plane as he asked for it on 2026-09-29: **one page**, contacts first,
 * then notes, then the card. No sub-pages, no switch-on, no separate PIN/QR
 * actions.
 */
test.describe('the dashboard', () => {
  test('reads contacts → notes → card, in that order', async ({ page }) => {
    await signUp(page);

    const sections = page.locator('section h2');
    await expect(sections).toHaveText(['Emergency contacts', 'Notes for a responder', 'Your card']);
  });

  test('cannot make a card before there is a contact', async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole('button', { name: 'Make my card' })).toBeDisabled();
    await expect(page.locator('#card')).toContainText('at least one contact');
  });

  test('adds a contact with its channels, edits it, and shows it back', async ({ page }) => {
    await signUp(page);
    await addContact(page, {
      name: 'Maria Silva',
      phone: '+66 812 345 678',
      channels: ['whatsapp', 'signal'],
      spoken: ['th', 'en'],
    });

    const contact = page.locator('.contacts > li').first();
    await expect(contact).toContainText('Maria Silva');
    await expect(contact).toContainText('Spouse');
    await expect(contact).toContainText('+66 812 345 678');
    // Phone call is on by default, and the tags render in the vocabulary's order
    // rather than the click order.
    await expect(contact.locator('.tag')).toHaveText(['Call', 'WhatsApp', 'Signal', 'English', 'Thai']);
    await expect(contact.locator('a[href="tel:+66812345678"]')).toBeVisible();
    await expect(contact.locator('a[href="https://wa.me/66812345678"]')).toBeVisible();

    await contact.getByText('Edit Maria Silva').click();
    await contact.locator('input[name="name"]').fill('Joao Silva');
    await contact.locator('input[name="phone"]').fill('+351912345678');
    await contact.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/notice=contact-updated$/);
    await expect(page.locator('.contacts > li').first()).toContainText('Joao Silva');
  });

  test('rejects a national number without a country code', async ({ page }) => {
    await signUp(page);
    const form = page.locator('#contacts form').last();
    await form.locator('input[name="name"]').fill('No Country');
    await form.locator('input[name="phone"]').fill('0812345678');
    await form.getByRole('button', { name: 'Add contact' }).click();

    await expect(page.locator('.error')).toContainText('country code');
    await expect(page.locator('.contacts > li')).toHaveCount(0);
  });

  test('saves notes for a responder', async ({ page }) => {
    await signUp(page);
    await saveNotes(page, 'Type 1 diabetic. Allergic to penicillin.');
    await page.reload();
    await expect(page.locator('#notes')).toHaveValue('Type 1 diabetic. Allergic to penicillin.');
  });

  test('refuses to delete the last contact while a card exists', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '+66812345678' });
    await makeCard(page);

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.error')).toContainText('last contact');
    await expect(page.locator('.contacts > li')).toHaveCount(1);
  });

  test('the dashboard is accessible', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '+66812345678', channels: ['whatsapp'] });
    await makeCard(page);
    await saveNotes(page, 'Notes for whoever finds the card.');

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('the card', () => {
  test('is live as soon as it is made, and shows a printable image', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '+66812345678' });
    const { pin } = await makeCard(page);

    await expect(page.locator('.pin')).toHaveText(/^\d{3} \d{3}$/);
    await expect(page.locator('.url')).toContainText('/c/');

    // The JPEG is generated server-side and is not cached.
    const preview = page.locator('img.preview');
    await expect(preview).toBeVisible();
    const image = await page.request.get('/dashboard/card/card.jpg');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/jpeg');
    expect(image.headers()['cache-control']).toContain('no-store');
    expect((await image.body()).length).toBeGreaterThan(2000);

    const shown = (await page.locator('.pin').textContent())?.replace(/\s/g, '');
    expect(pin.replace(/\s/g, '')).toBe(shown);
  });

  test('“new card” changes the link and the PIN, and the old link dies', async ({ page, context }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '+66812345678' });
    const first = await makeCard(page);

    await page.getByRole('button', { name: 'New card' }).click();
    await expect(page).toHaveURL(/notice=card-renewed$/);
    const second = await readCard(page);

    expect(second.slug).not.toBe(first.slug);
    expect(second.pin).not.toBe(first.pin);

    // The retired card's URL still answers, but with the PIN form — never data.
    const guest = await context.browser()?.newContext();
    const stranger = await guest!.newPage();
    await stranger.goto(`/c/${first.slug}`);
    await expect(stranger.getByRole('heading')).toContainText('Emergency contacts');
    await expect(stranger.locator('body')).not.toContainText('Maria');
    await guest!.close();
  });

  test('signing out and back in keeps the same card', async ({ page }) => {
    const email = await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '+66812345678' });
    const { pin } = await makeCard(page);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.fill('#email', email);
    await page.fill('#password', 'correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('.pin')).toHaveText(pin);
  });
});
