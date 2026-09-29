import { expect, type Page } from '@playwright/test';

/**
 * Shared setup for the browser tests. The owner plane is one page, so these read
 * as the flow an owner performs: sign up, add people, make a card.
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

/**
 * Destructive actions open a real `<dialog>` (not a native confirm). Confirm it and
 * hand back the sentence the owner was shown, so a test can assert on the promise
 * the UI made before it acted.
 */
export async function confirmModal(page: Page): Promise<string> {
  const dialog = page.locator('#confirm-dialog');
  await expect(dialog).toBeVisible();
  const message = ((await dialog.locator('[data-confirm-message]').textContent()) ?? '').trim();
  await dialog.locator('[data-confirm-ok]').click();
  await expect(dialog).not.toBeVisible();
  return message;
}

export async function cancelModal(page: Page): Promise<void> {
  const dialog = page.locator('#confirm-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-confirm-cancel]').click();
  await expect(dialog).not.toBeVisible();
}

export interface ContactSpec {
  name: string;
  relation?: string;
  /** ISO code, as the picker shows it. */
  country?: string;
  /** The national part only. */
  phone: string;
  /** Services only: call, WhatsApp, Signal, Telegram, Viber. */
  channels?: string[];
  /** "Cannot speak or hear": text is the only way in. */
  textOnly?: boolean;
  spoken?: string[];
}

/** The add form: open for the first contact, folded behind a button afterwards. */
export async function openAddForm(page: Page): Promise<void> {
  const disclosure = page.locator('.add-more');
  if (await disclosure.count()) {
    const open = await disclosure.evaluate((element) => (element as HTMLDetailsElement).open);
    if (!open) await disclosure.locator('> summary').click();
  }
}

export async function addContact(page: Page, spec: ContactSpec): Promise<void> {
  await openAddForm(page);
  const form = page.locator('form[action="/dashboard/contacts/new"]').last();
  await form.locator('input[name="name"]').fill(spec.name);
  await form.locator('select[name="relation"]').selectOption(spec.relation ?? 'spouse');
  await form.locator('select[name="country"]').selectOption(spec.country ?? 'TH');
  await form.locator('input[name="phone"]').fill(spec.phone);
  for (const channel of spec.channels ?? []) {
    await form.locator(`input[name="channels"][value="${channel}"]`).check();
  }
  if (spec.textOnly) await form.locator('input[name="text_only"]').check();
  for (const code of spec.spoken ?? []) {
    await form.locator(`input[name="spoken"][value="${code}"]`).check();
  }
  await form.getByRole('button', { name: 'Add contact' }).click();
  await expect(page).toHaveURL(/notice=contact-added$/);
}

/** The kebab beside a contact, or the one in the card section. */
export function kebab(page: Page, scope = 'body') {
  return page.locator(`${scope} .kebab > summary`).first();
}

export async function makeCard(page: Page): Promise<{ slug: string; pin: string }> {
  await page.getByRole('button', { name: 'Make my card' }).click();
  await expect(page).toHaveURL(/notice=card-made$/);
  return readCard(page);
}

export async function readCard(page: Page): Promise<{ slug: string; pin: string }> {
  const pin = ((await page.locator('.pin').textContent()) ?? '').trim();
  const url = ((await page.locator('.url a').textContent()) ?? '').trim();
  return { slug: url.split('/').pop() ?? '', pin };
}

/**
 * The responder plane's oldest promise (§5, D6): it fetches nothing from anywhere.
 *
 * Two different things live in `href` and they must not be conflated. A **resource**
 * is a `src` attribute, or an `href` on `<link>` — those must be same-origin or a data
 * URI. A **navigation** is an `href` on `<a>`: tel:, sms:, mailto:, same-origin, or a
 * service the button dials (wa.me, t.me, signal.me, viber://). Conflating them is how
 * the old check passed while never looking at the unlocked page.
 */
export function externalResources(html: string): string[] {
  const offenders: string[] = [];
  for (const [, tag, attrs] of html.matchAll(/<([a-z0-9-]+)\b([^>]*)>/gi)) {
    const name = String(tag).toLowerCase();
    const urls = [...String(attrs).matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? '');
    if (name === 'link') {
      urls.push(...[...String(attrs).matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? ''));
    }
    for (const url of urls) {
      if (!url.startsWith('data:') && !url.startsWith('/')) offenders.push(`${name} → ${url}`);
    }
  }
  return offenders;
}

const ALLOWED_NAVIGATION = [
  /^#[^\s]*$/,
  /^\/[^\s]*$/,
  /^tel:/i,
  /^sms:/i,
  /^mailto:/i,
  /^https:\/\/wa\.me\//i,
  /^https:\/\/t\.me\//i,
  /^https:\/\/signal\.me\//i,
  /^viber:\/\//i,
];

export function unexpectedNavigations(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1] ?? '')
    .filter((url) => !ALLOWED_NAVIGATION.some((allowed) => allowed.test(url)));
}

export async function saveNotes(page: Page, text: string): Promise<void> {
  await page.fill('#notes', text);
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page).toHaveURL(/notice=notes-saved$/);
}
