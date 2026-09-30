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

    // First run: the contact form is open with the note inside it, so that one card is where
    // both live — and the note heading sits inside it, a step down, because it is a field of
    // the same form rather than a section of its own.
    await expect(page.locator('section h1')).toHaveText(['Emergency contacts']);
    await expect(page.locator('section h2')).toHaveText(['Add a contact']);
    await expect(page.locator('form[action="/dashboard/start"] h3')).toHaveText([
      'Notes for a responder',
    ]);

    // Once there is a contact, the three sections are the page, in his order.
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    // The contacts heading is the page's h1; the sections below it are these two.
    await expect(page.locator('section h1')).toHaveText(['Emergency contacts']);
    await expect(page.locator('section h2')).toHaveText([
      'Notes for a responder',
      'Your card',
    ]);
  });

  test('a new contact defaults to partner, and edit lives in the kebab', async ({ page }) => {
    await signUp(page);

    // Partner is the most common answer, and it is what the picker shows first. On a first
    // run that picker is in the first-run form, which posts to /dashboard/start.
    const firstForm = page.locator('form[action="/dashboard/start"], form[action="/dashboard/contacts/new"]');
    await expect(firstForm.locator('select[name="relation"]')).toHaveValue('partner');

    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    const row = page.locator('.contacts > li').first();

    // No loose edit control in the row: the kebab holds the row's actions, delete included.
    await expect(row.locator('button[data-edit-trigger]:visible')).toHaveCount(0);
    await row.locator('.kebab > summary').click();
    await expect(row.locator('button[data-edit-trigger]')).toHaveText('Edit contact');
    await expect(row.locator('.panel .danger')).toContainText('Delete contact');
  });

  test('the first save makes the card, so there is no second step', async ({ page }) => {
    await signUp(page);

    // Nothing to make yet, and nothing on the page asking to be made: a card with nobody
    // behind it is not a state the product has.
    await expect(page.locator('#card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Make my card' })).toHaveCount(0);

    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });

    // The card came with the contact: a PIN and a link, live, without another press.
    await expect(page.locator('#card .pin')).toBeVisible();
    await expect(page.locator('#card .url')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make my card' })).toHaveCount(0);
  });

  test('opens the add form for the first contact and folds it away afterwards', async ({ page }) => {
    await signUp(page);

    // First contact: one form, open, with the note in it and one save button for both.
    const first = page.locator('form[action="/dashboard/start"]');
    await expect(first).toBeVisible();
    await expect(first.locator('#notes')).toBeVisible();
    await expect(first.locator('button[type="submit"]')).toHaveCount(1);

    // An empty form cannot be submitted: the one button is dead until there is a name and a
    // number, which is what the server would refuse anyway.
    const save = first.locator('button[type="submit"]');
    await expect(save).toBeDisabled();
    await first.locator('input[name="name"]').fill('Maria Silva');
    await expect(save).toBeDisabled();
    await first.locator('input[name="phone"]').fill('812 345 678');
    await expect(save).toBeEnabled();
    await first.locator('input[name="phone"]').fill('');
    await expect(save).toBeDisabled();
    await expect(page.locator('#notes-section')).toHaveCount(0);
    await expect(page.locator('.add-more')).toHaveCount(0);

    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });

    // Afterwards it folds away behind a button, so the list owns the space.
    const disclosure = page.locator('#contacts .add-more');
    await expect(disclosure).toHaveCount(1);
    const open = await disclosure.evaluate((element) => (element as HTMLDetailsElement).open);
    expect(open).toBe(false);
    await expect(disclosure.locator('> summary')).toHaveText('Add another contact');

    // With a contact saved, the note moves to its own card — rendered, with the note behind
    // the kebab rather than sitting open in a second form.
    await expect(page.locator('#notes-section')).toHaveCount(1);
    await expect(page.locator('form[action="/dashboard/start"]')).toHaveCount(0);
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
    await expect(contact.locator('.relation').first()).toHaveText('Spouse');
    // Country picker + national part become one E.164 number, shown grouped.
    await expect(contact.locator('.phone')).toHaveText('+66 812 345 678');
    await expect(contact.locator('.phone')).toHaveAttribute('href', 'tel:+66812345678');
    // Services and spoken languages are separate labelled rows.
    await expect(contact.locator('dt')).toHaveText(['Services', 'Spoken']);
    await expect(contact.locator('.tags .tag')).toHaveText(['Call', 'WhatsApp', 'Signal']);
    await expect(contact.locator('.speaks .tag')).toHaveText(['🇬🇧English', '🇹🇭Thai']);
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
    const form = page
      .locator('form[action="/dashboard/start"], form[action="/dashboard/contacts/new"]')
      .last();
    await form.locator('input[name="name"]').fill('Direct');
    await form.locator('select[name="country"]').selectOption('TH');
    await form.locator('input[name="phone"]').fill('+36 30 123 4567');
    // The input mask must not eat the plus that says "this is already international".
    await expect(form.locator('input[name="phone"]')).toHaveValue('+363 012 345 67');
    // By position, not by label: the first-run button saves the note as well, so its label
    // is different from the one on the add form.
    await form.locator('button[type="submit"]').click();

    await expect(page.locator('.contacts > li').first().locator('.phone')).toHaveText('+36 301 234 567');
  });

  test('the phone field cannot be filled with a number the server would refuse', async ({ page }) => {
    await signUp(page);
    const form = page.locator('form[action="/dashboard/start"]');
    const country = form.locator('select[name="country"]');
    const phone = form.locator('input[name="phone"]');

    // E.164 allows 15 digits including the country code, so the country code is what is left
    // over for the national part. Typing past it does nothing: a limit the form accepts and the
    // server refuses is not a limit, and the message it produced explained the form's mistake.
    for (const [code, national] of [
      ['TH', 13],
      ['US', 14],
    ] as const) {
      await country.selectOption(code);
      await phone.fill('');
      await phone.pressSequentially('1234567890123456789');
      const digits = (await phone.inputValue()).replace(/\D/g, '');
      expect(digits, `${code}: national digits`).toHaveLength(national);
    }

    // A pasted international number carries its own country code, so it gets all 15.
    await phone.fill('');
    await phone.pressSequentially('+1234567890123456789');
    expect((await phone.inputValue()).replace(/\D/g, '')).toHaveLength(15);
  });

  test('edits from the kebab, with the form opening in the page', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });

    const row = page.locator('.contacts > li').first();
    await row.locator('.kebab > summary').click();
    await row.locator('button[data-edit-trigger]').click();

    const form = row.locator('details.edit-form form[action$="/edit"]');
    await expect(form).toBeVisible();
    // The form is in the page, not inside the panel that launched it — and the panel is shut.
    expect(await form.evaluate((element) => Boolean(element.closest('.panel, .kebab')))).toBe(false);
    await expect(row.locator('.panel')).toBeHidden();

    await form.locator('input[name="name"]').fill('Joao Silva');
    await form.locator('input[name="phone"]').fill('912345678');
    await form.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/notice=contact-updated$/);
    await expect(row.locator('.name')).toHaveText('Joao Silva');
    await expect(row.locator('.phone')).toHaveText('+66 912 345 678');

    // Editing prefills the picker from the stored number instead of doubling it.
    await row.locator('.kebab > summary').click();
    await row.locator('button[data-edit-trigger]').click();
    const reopened = row.locator('details.edit-form form[action$="/edit"]');
    await expect(reopened.locator('select[name="country"]')).toHaveValue('TH');
    await expect(reopened.locator('input[name="phone"]')).toHaveValue('912 345 678');
  });

  test('marks a contact who cannot speak or hear, and offers text for them', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Ana Hadi', phone: '30 123 4567', channels: ['telegram'], textOnly: true });

    const row = page.locator('.contacts > li').first();
    await expect(row.locator('.text-only')).toHaveText('🔇 Text only');
    await expect(row.locator('.tags .tag')).toHaveText(['🔇 Text only', 'Call', 'Telegram']);
  });

  test('saves notes for a responder', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });

    // No note yet: adding one is a disclosure, the same as adding a contact.
    await expect(page.locator('#notes-section .notes')).toHaveCount(0);
    await page.locator('#notes-section .add-more > summary').click();

    // Nothing to save until something changed.
    const save = page.locator('#notes-section form[action="/dashboard/notes"] button[type="submit"]');
    await expect(save).toBeDisabled();
    await page.fill('#notes', 'x');
    await expect(save).toBeEnabled();
    await page.fill('#notes', '');

    await saveNotes(page, 'Type 1 diabetic. Allergic to penicillin.');
    await page.reload();

    // Saved: the note is rendered, not a filled-in form.
    await expect(page.locator('#notes-section .notes')).toHaveText('Type 1 diabetic. Allergic to penicillin.');
    // The edit form is behind the kebab and closed, so nothing is asking to be typed into.
    await expect(page.locator('#notes-section #notes')).toBeHidden();
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
    await expect(page.locator('#card')).toHaveCount(0);
    await expect(page.locator('form[action="/dashboard/start"]')).toBeVisible();
  });

  test('a note survives the last contact, and the card says what it is waiting for', async ({
    page,
  }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await saveNotes(page, 'Type 1 diabetic. Allergic to penicillin.');

    await kebab(page, '.contacts > li').click();
    await page.getByRole('button', { name: 'Delete contact' }).click();
    await confirmModal(page);
    await expect(page).toHaveURL(/notice=contact-and-card-deleted$/);

    // The note is the owner's, not the contact's: it stays, with its own card and kebab.
    await expect(page.locator('#notes-section .notes')).toHaveText(
      'Type 1 diabetic. Allergic to penicillin.',
    );

    // The card keeps its place on the page, empty, saying what it needs — the note below still
    // goes to the card page, so losing the whole block would lose the context with it.
    await expect(page.locator('#card')).toContainText('Your card appears here');
    await expect(page.locator('#card')).toContainText('needs at least one contact');
    await expect(page.locator('#card .pin')).toHaveCount(0);

    // And the contact form no longer asks for a note it already has.
    const form = page.locator('form[action="/dashboard/start"]');
    await expect(form).toBeVisible();
    await expect(form.locator('#notes')).toHaveCount(0);
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

  test('menus close when you click away or press Escape', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await addContact(page, { name: 'Ana Hadi', phone: '912 345 678' });

    const account = page.locator('header .menu');
    const first = page.locator('.contacts > li').first().locator('.kebab');
    const second = page.locator('.contacts > li').nth(1).locator('.kebab');
    const isOpen = (locator: ReturnType<typeof page.locator>) =>
      locator.evaluate((element) => (element as HTMLDetailsElement).open);

    // The account menu closes on a click anywhere else. (A raw click at the top-left
    // corner: the open panel overlaps the heading, and clicking *through* it is
    // exactly what a dropdown must not allow.)
    await account.locator('> summary').click();
    expect(await isOpen(account)).toBe(true);
    await page.mouse.click(5, 5);
    expect(await isOpen(account)).toBe(false);

    // A click inside the menu keeps it open — the links have to be clickable.
    await account.locator('> summary').click();
    await account.locator('.panel').click({ position: { x: 5, y: 5 } });
    expect(await isOpen(account)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await isOpen(account)).toBe(false);

    // Opening one kebab closes the other, exactly as a menu should behave.
    await first.locator('> summary').click();
    expect(await isOpen(first)).toBe(true);
    await second.locator('> summary').click();
    expect(await isOpen(first)).toBe(false);
    expect(await isOpen(second)).toBe(true);

    // The kebab holds actions, not the edit form: editing happens in the row.
    await expect(second.locator('form[action$="/edit"]')).toHaveCount(0);
    await page.mouse.click(5, 5);
    expect(await isOpen(second)).toBe(false);

    // Escape from the keyboard closes it too.
    await page.keyboard.press('Escape');
    expect(await isOpen(second)).toBe(false);
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

  test('cancel closes the add form and drops what was typed', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });

    await page.locator('#contacts .add-more > summary').click();
    const form = page.locator('form[action="/dashboard/contacts/new"]');
    await form.locator('input[name="name"]').fill('Discarded');
    await form.locator('a[data-cancel]').click();

    await expect(page.locator('#contacts .add-more')).not.toHaveAttribute('open', '');
    await page.locator('#contacts .add-more > summary').click();
    await expect(page.locator('form[action="/dashboard/contacts/new"] input[name="name"]')).toHaveValue('');
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
    // Compare the rendered background with the token itself, so a palette change does
    // not break the test — and so it proves the token is what reaches the page.
    const [background, token] = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--noka-bg)';
      document.body.append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(document.body).backgroundColor, resolved];
    });
    expect(background).toBe(token);
  });

  test('downloads the data, and deletes the account without emailing anyone', async ({ page }) => {
    const email = await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await saveNotes(page, 'Type 1 diabetic.');

    await page.goto('/dashboard/settings');
    const download = await page.request.get('/dashboard/settings/export');
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toMatch(/attachment; filename="noka-export-\d{4}-\d{2}-\d{2}\.json"/);
    // It carries the PIN and the decrypted contacts, so it must never be cached.
    expect(download.headers()['cache-control']).toContain('no-store');

    const exported = await download.json();
    expect(exported.account.email).toBe(email);
    expect(exported.contacts[0].name).toBe('Maria Silva');
    expect(exported.contacts[0].phone).toBe('+66812345678');
    expect(exported.notes).toBe('Type 1 diabetic.');

    // Deleting asks first, then leaves nothing: the session goes with the account.
    await page.getByRole('button', { name: 'Delete account' }).click();
    const warning = await confirmModal(page);
    expect(warning).toContain('permanently');
    await expect(page).toHaveURL(/\?deleted=1$/);
    await expect(page.locator('body')).toContainText('has been deleted');

    // The account is gone: signing in with the same credentials fails.
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', 'correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.error')).toBeVisible();
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
