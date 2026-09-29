import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { addContact, confirmModal, externalResources, kebab, makeCard, saveNotes, signUp, unexpectedNavigations } from './helpers';

/**
 * The whole point of the product (§3, §9): a stranger with the card and the PIN
 * reaches the contacts in the card's own language, on a page with no JavaScript
 * and no third-party request — and gets nothing without the PIN.
 */

async function owner(page: import('@playwright/test').Page): Promise<{ slug: string; pin: string }> {
  await signUp(page);
  await addContact(page, {
    name: 'Maria Silva',
    country: 'TH',
    phone: '812 345 678',
    channels: ['whatsapp', 'signal'],
    spoken: ['th', 'en'],
  });
  await addContact(page, {
    name: 'Ana Hadi',
    country: 'HU',
    phone: '30 123 4567',
    channels: ['telegram'],
    // Cannot speak or hear: the page says so, and a call is not offered.
    textOnly: true,
  });
  await saveNotes(page, 'Type 1 diabetic. Allergic to penicillin.');
  return makeCard(page);
}

test.describe('the responder page', () => {
  test('every channel is a tappable button, and text-only means no call', async ({ browser, page }) => {
    const { slug, pin } = await owner(page);
    const guest = await browser.newContext();
    const stranger = await guest.newPage();
    await stranger.goto(`/c/${slug}`);
    await stranger.fill('input[name="pin"]', pin);
    await stranger.getByRole('button').first().click();
    await stranger.waitForLoadState('networkidle');

    // A stylesheet that loses the .actions rules leaves these as bare links — which
    // pass axe and look broken, so measure them as controls.
    const buttons = await stranger.evaluate(() =>
      Array.from(document.querySelectorAll('.actions a')).map((element) => {
        const style = getComputedStyle(element);
        return {
          label: element.textContent.trim(),
          height: Math.round(element.getBoundingClientRect().height),
          border: parseFloat(style.borderTopWidth),
        };
      }),
    );
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.height, `${button.label} height`).toBeGreaterThanOrEqual(44);
      expect(button.border, `${button.label} border`).toBeGreaterThanOrEqual(2);
    }

    // Maria can speak: she gets a call. Ana cannot: she gets the alert and no call.
    const maria = stranger.locator('.contact', { hasText: 'Maria Silva' });
    const ana = stranger.locator('.contact', { hasText: 'Ana Hadi' });
    await expect(maria.locator('a.call')).toHaveCount(1);
    await expect(maria.locator('.alert')).toHaveCount(0);

    await expect(ana.locator('.alert')).toContainText('cannot speak or hear');
    await expect(ana.locator('a.call'), 'a call is useless to her').toHaveCount(0);
    // The number itself must not be a dialler either: the earlier version of this test
    // checked only the button row and let a tappable tel: link ship under the alert.
    await expect(ana.locator('.phone a'), 'no dialler hidden in the number').toHaveCount(0);
    await expect(ana.locator('.phone')).toHaveText('+36 301 234 567');
    // Text first, so the responder reaches for the thing that works.
    await expect(ana.locator('.actions a').first()).toHaveText(/Text message/);
    await expect(ana.locator('a.sms')).toHaveAttribute('href', 'sms:+36301234567');

    await guest.close();
  });

  test('both responder pages offer the same language switcher', async ({ browser, page }) => {
    const { slug, pin } = await owner(page);
    const guest = await browser.newContext();
    const stranger = await guest.newPage();

    await stranger.goto(`/c/${slug}`);
    const locked = await stranger.locator('.langs button').allTextContents();
    // Folded by default on both pages: the device language is already applied.
    await expect(stranger.locator('.langs')).not.toHaveAttribute('open', '');

    await stranger.fill('input[name="pin"]', pin);
    await stranger.getByRole('button').first().click();
    await stranger.waitForLoadState('networkidle');
    const unlocked = await stranger.locator('.langs button').allTextContents();

    // The same plane must not look like two products depending on whether the PIN has
    // been entered — it did: flags in one place, bare names in the other.
    expect(locked.length).toBeGreaterThan(1);
    expect(unlocked).toEqual(locked);
    for (const label of locked) expect(label, 'flag beside the name').toMatch(/\p{Regional_Indicator}/u);

    await guest.close();
  });

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
    expect(formHtml).not.toContain('Ana');
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
    const maria = guest.locator('.contact').first();
    await expect(maria.locator('.name')).toHaveText('Maria Silva');
    await expect(maria.locator('.relation')).toContainText('Spouse');
    await expect(maria.locator('.speaks')).toContainText('Thai');
    await expect(maria.locator('a.call')).toHaveAttribute('href', 'tel:+66812345678');
    await expect(maria.locator('a.whatsapp')).toHaveAttribute('href', 'https://wa.me/66812345678');
    // Every channel is a button, and the number itself is on the page.
    await expect(maria.locator('a.signal')).toContainText('Signal');
    await expect(maria.locator('.phone')).toHaveText('+66 812 345 678');

    // The unlocked page is the one with brand marks and service links on it, so this
    // is where "the responder page fetches nothing" has to be proven.
    const unlocked = await guest.content();
    expect(externalResources(unlocked), 'unlocked page fetches nothing').toEqual([]);
    expect(unexpectedNavigations(unlocked), 'navigations stay inside the allowlist').toEqual([]);
    await expect(maria.locator('.phone a')).toHaveAttribute('href', 'tel:+66812345678');
    await expect(guest.locator('.notes')).toContainText('Allergic to penicillin.');

    // Still zero JavaScript, still one request.
    const viewHtml = await guest.request.get(`/c/${slug}/view`).then((response) => response.text());
    expect(viewHtml).not.toMatch(/<script/i);
    expect(viewHtml).not.toMatch(/<link[^>]+rel="stylesheet"/i);

    // 4. The responder can switch the page into their own language. The switcher is
    //    folded away (the page already opens in the device's language), so open it first.
    await expect(guest.locator('.langs')).not.toHaveAttribute('open', '');
    await guest.locator('.langs > summary').click();
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

  test('a new card closes the door on a live guest cookie', async ({ browser, page }) => {
    const { slug, pin } = await owner(page);

    const stranger = await browser.newContext();
    const guest = await stranger.newPage();
    await guest.goto(`/c/${slug}`);
    await guest.fill('#pin', pin);
    await guest.getByRole('button', { name: 'Open' }).click();
    await expect(guest).toHaveURL(new RegExp(`/c/${slug}/view$`));

    await kebab(page, '#card').click();
    await page.getByRole('button', { name: 'New card' }).click();
    await confirmModal(page);
    await expect(page).toHaveURL(/notice=card-renewed$/);

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
