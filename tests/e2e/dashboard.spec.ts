import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  addContact,
  cancelModal,
  confirmModal,
  kebab,
  makeCard,
  openAddForm,
  readCard,
  saveNotes,
  signUp,
} from './helpers';

/**
 * The owner plane as he asked for it on 2026-09-29: **one page**, contacts first,
 * then notes, then the card — with the account menu at the top, a kebab beside
 * whatever it acts on, and a confirmation in front of anything destructive.
 */
test.describe('the dashboard', () => {
  test('reads contacts → notes → card, in that order', async ({ page }) => {
    await signUp(page);

    // With no contacts the add form is open, so its heading is the first h2.
    await expect(page.locator('section h1')).toHaveText(['Emergency contacts']);
    await expect(page.locator('section h2')).toHaveText([
      'Add a contact',
      'Notes for a responder',
      'Your card',
    ]);
  });

  test('cannot make a card before there is a contact', async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole('button', { name: 'Make my card' })).toBeDisabled();
    await expect(page.locator('#card')).toContainText('at least one contact');
  });

  test('opens the add form for the first contact and folds it away afterwards', async ({ page }) => {
    await signUp(page);

    // First contact: the form is simply there.
    await expect(page.locator('form[action="/dashboard/contacts/new"]')).toBeVisible();
    await expect(page.locator('.add-more')).toHaveCount(0);

    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });

    // Afterwards it folds away behind a button, so the list owns the space.
    const disclosure = page.locator('.add-more');
    await expect(disclosure).toHaveCount(1);
    const open = await disclosure.evaluate((element) => (element as HTMLDetailsElement).open);
    expect(open).toBe(false);
    await expect(disclosure.locator('> summary')).toHaveText('Add another contact');
  });

  test('adds a contact with a country code, channels and languages', async ({ page }) => {
    await signUp(page);
    await addContact(page, {
      name: 'Maria Silva',
      country: 'TH',
      phone: '812 345 678',
      channels: ['whatsapp', 'signal'],
      spoken: ['th', 'en'],
    });

    const contact = page.locator('.contacts > li').first();
    await expect(contact.locator('.name')).toHaveText('Maria Silva');
    await expect(contact.locator('.meta').first()).toHaveText('Spouse');
    // Country picker + national part become one E.164 number, shown grouped.
    await expect(contact.locator('.phone')).toHaveText('+66 812 345 678');
    await expect(contact.locator('.phone')).toHaveAttribute('href', 'tel:+66812345678');
    // Call first, then the rest in the vocabulary's order.
    await expect(contact.locator('.tag')).toHaveText(['Call', 'WhatsApp', 'Signal', 'English', 'Thai']);
  });

  test('drops the trunk zero of a national number', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Bangkok landline', country: 'TH', phone: '021234567' });

    // 021234567 -> +6621234567: the trunk zero goes, and the grouping is by length.
    await expect(page.locator('.contacts > li').first().locator('.phone')).toHaveText('+66 2123 4567');
  });

  test('takes a full international number as typed', async ({ page }) => {
    await signUp(page);
    await openAddForm(page);
    const form = page.locator('form[action="/dashboard/contacts/new"]').last();
    await form.locator('input[name="name"]').fill('Direct');
    await form.locator('select[name="country"]').selectOption('TH');
    await form.locator('input[name="phone"]').fill('+36 30 123 4567');
    // The input mask must not eat the plus that says "this is already international".
    await expect(form.locator('input[name="phone"]')).toHaveValue('+363 012 345 67');
    await form.getByRole('button', { name: 'Add contact' }).click();

    await expect(page.locator('.contacts > li').first().locator('.phone')).toHaveText('+36 301 234 567');
  });

  test('edits a contact from its kebab menu', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });

    await kebab(page, '.contacts > li').click();
    await page.getByText('Edit contact').click();
    const form = page.locator('form[action$="/edit"]');
    await form.locator('input[name="name"]').fill('Joao Silva');
    await form.locator('input[name="phone"]').fill('912345678');
    await form.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/notice=contact-updated$/);
    const contact = page.locator('.contacts > li').first();
    await expect(contact.locator('.name')).toHaveText('Joao Silva');
    await expect(contact.locator('.phone')).toHaveText('+66 912 345 678');

    // Editing prefills the picker from the stored number instead of doubling it.
    await kebab(page, '.contacts > li').click();
    await page.getByText('Edit contact').click();
    const editForm = page.locator('form[action$="/edit"]');
    await expect(editForm.locator('select[name="country"]')).toHaveValue('TH');
    await expect(editForm.locator('input[name="phone"]')).toHaveValue('912 345 678');
    // A number typed with + keeps the plus through the input mask.
  });

  test('saves notes for a responder', async ({ page }) => {
    await signUp(page);
    await saveNotes(page, 'Type 1 diabetic. Allergic to penicillin.');
    await page.reload();
    await expect(page.locator('#notes')).toHaveValue('Type 1 diabetic. Allergic to penicillin.');
  });

  test('deleting the last contact deletes the card too, after saying so', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await makeCard(page);

    await kebab(page, '.contacts > li').click();
    await page.getByRole('button', { name: 'Delete contact' }).click();

    // The modal names the consequence before anything happens.
    const message = await confirmModal(page);
    expect(message).toContain('delete your card');
    await expect(page).toHaveURL(/notice=contact-and-card-deleted$/);
    await expect(page.locator('.contacts > li')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Make my card' })).toBeDisabled();
  });

  test('cancelling the confirmation keeps contact and card', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await makeCard(page);

    await kebab(page, '.contacts > li').click();
    await page.getByRole('button', { name: 'Delete contact' }).click();
    await cancelModal(page);

    await expect(page.locator('.contacts > li')).toHaveCount(1);
    await expect(page.locator('.pin')).toBeVisible();
  });

  test('the confirmation is a real modal, not a native dialog', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await makeCard(page);

    await kebab(page, '.contacts > li').click();
    await page.getByRole('button', { name: 'Delete contact' }).click();

    const dialog = page.locator('#confirm-dialog');
    await expect(dialog).toBeVisible();
    // Opened with showModal(): it is the top layer, so the page behind is inert.
    await expect(dialog).toHaveAttribute('open', '');
    expect(await dialog.evaluate((element) => (element as HTMLDialogElement).matches(':modal'))).toBe(true);

    // Escape closes it without acting.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.contacts > li')).toHaveCount(1);

    // …and the modal itself passes an accessibility check. (The kebab is still open,
    // so the delete item is one click away; clicking the summary would close it.)
    await page.getByRole('button', { name: 'Delete contact' }).click();
    await expect(dialog).toBeVisible();
    const results = await new AxeBuilder({ page }).include('#confirm-dialog').analyze();
    expect(results.violations).toEqual([]);
  });

  test('the dashboard is accessible', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678', channels: ['whatsapp'] });
    await makeCard(page);
    await saveNotes(page, 'Notes for whoever finds the card.');

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('the card', () => {
  test('is live as soon as it is made, and shows a printable image', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await makeCard(page);

    await expect(page.locator('.pin')).toHaveText(/^\d{3} \d{3}$/);
    await expect(page.locator('.url a')).toHaveAttribute('href', /\/c\/[A-Z0-9]{26}$/);

    await expect(page.locator('img.preview')).toBeVisible();
    const image = await page.request.get('/dashboard/card/card.jpg');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/jpeg');
    expect(image.headers()['cache-control']).toContain('no-store');
    expect((await image.body()).length).toBeGreaterThan(2000);
  });

  test('“new card” and “delete card” live in the card kebab, and ask first', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    const first = await makeCard(page);

    await kebab(page, '#card').click();
    await page.getByRole('button', { name: 'New card' }).click();

    const message = await confirmModal(page);
    expect(message).toContain('new link and a new PIN');
    await expect(page).toHaveURL(/notice=card-renewed$/);
    const second = await readCard(page);
    expect(second.slug).not.toBe(first.slug);
    expect(second.pin).not.toBe(first.pin);
  });

  test('the deleted card leaves the contacts and notes alone', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await makeCard(page);
    await saveNotes(page, 'Type 1 diabetic.');

    await kebab(page, '#card').click();
    await page.getByRole('button', { name: 'Delete card' }).click();

    const message = await confirmModal(page);
    expect(message).toContain('contacts and notes are kept');
    await expect(page).toHaveURL(/notice=card-deleted$/);
    await expect(page.locator('.contacts > li')).toHaveCount(1);
    await expect(page.locator('#notes')).toHaveValue('Type 1 diabetic.');
    await expect(page.getByRole('button', { name: 'Make my card' })).toBeEnabled();
  });

  test('signing out and back in keeps the same card', async ({ page }) => {
    const email = await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    const { pin } = await makeCard(page);

    await page.locator('header .menu > summary').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.fill('#email', email);
    await page.fill('#password', 'correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('.pin')).toHaveText(pin);
  });
});

test.describe('the account menu', () => {
  test('switches to dark mode and remembers it', async ({ page }) => {
    await signUp(page);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

    await page.locator('header .menu > summary').click();
    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Server-rendered from the cookie, so a reload is already dark.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(20, 22, 26)');
  });

  test('changes the email and the password from settings', async ({ page }) => {
    await signUp(page);
    const newEmail = `changed-${Date.now()}@noka.test`;

    await page.locator('header .menu > summary').click();
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);

    await page.fill('#email', newEmail);
    await page.getByRole('button', { name: 'Update email' }).click();
    // A settings result keeps you on settings, with the form still in front of you.
    await expect(page).toHaveURL(/\/dashboard\/settings\?notice=email-changed$/);
    await expect(page.locator('#email')).toHaveValue(newEmail);

    // A wrong current password is refused...
    await page.fill('#current_password', 'not-the-password');
    await page.fill('#new_password', 'a-brand-new-password');
    await page.fill('#new_password_confirm', 'a-brand-new-password');
    await page.getByRole('button', { name: 'Update password' }).click();
    await confirmModal(page);
    await expect(page).toHaveURL(/error=password-wrong$/);

    // ...the right one is applied, and the new password signs in.
    await page.fill('#current_password', 'correct-horse-battery');
    await page.fill('#new_password', 'a-brand-new-password');
    await page.fill('#new_password_confirm', 'a-brand-new-password');
    await page.getByRole('button', { name: 'Update password' }).click();
    // The modal warns first: changing the password ends every session.
    const warning = await confirmModal(page);
    expect(warning).toContain('signs you out of every device');
    // …and it lands on the sign-in page.
    await expect(page).toHaveURL(/\/login\?notice=password-changed$/);
    await expect(page.locator('.notice')).toContainText('signed out');

    await page.fill('#email', newEmail);
    await page.fill('#password', 'a-brand-new-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
