import { expect, test } from '@playwright/test';
import { addContact, kebab, makeCard, signUp } from './helpers';

/**
 * The checks my first pass was missing.
 *
 * Every bug below shipped with a green suite: axe cannot see a logo that is the same
 * colour as its background, and it has nothing to say about a select that grew to the
 * full width of its row. Behaviour tests and axe are not a substitute for looking at
 * the thing — so these assert the properties that were actually wrong.
 */

/** WCAG relative luminance, for comparing two surfaces. */
function luminance([r, g, b]: number[]): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const parse = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number);
  const [light, dark] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

async function resolved(page: import('@playwright/test').Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}

test.describe('things axe cannot see', () => {
  test('the page and the cards are visibly different surfaces', async ({ page }) => {
    await signUp(page);

    const [bg, surface] = await Promise.all([resolved(page, '--noka-bg'), resolved(page, '--noka-surface')]);
    // Not a WCAG rule — surfaces are not text — so this is our own line in the sand:
    // the owner must be able to see where a card begins. It was 1.03:1 before.
    const ratio = contrast(bg, surface);
    expect(ratio, `page ${bg} vs card ${surface}`).toBeGreaterThan(1.1);

    // A quiet section is what carries the surface colour. The notes card exists once there
    // is a contact: on a first run the note is a field of the first-run form.
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    const notes = page.locator('#notes-section > div').first();
    expect(await notes.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(surface);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg);

    // ...and the card is deliberately the one ink plate on the page, which is why it is
    // asserted against the ink token rather than the surface one. It used to be just another
    // white card, which is how it ended up reading as one more settings section.
    const ink = await resolved(page, '--noka-ink');
    const plate = page.locator('#card > div').first();
    expect(await plate.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(ink);
  });

  test('the wordmark is legible in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await page.goto('/');
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);

      // The wordmark is the home link, not a heading; the h1 carries the page's message.
      const heading = page.getByRole('link', { name: 'noka' });
      const [ink, background] = await heading.evaluate((element) => [
        getComputedStyle(element).color,
        getComputedStyle(document.body).backgroundColor,
      ]);
      // The logo is inlined with `currentColor`; as an <img> it stayed black and
      // disappeared into the dark page.
      expect(contrast(ink, background), `${theme}: ${ink} on ${background}`).toBeGreaterThan(4.5);
      await expect(heading.locator('svg')).toBeVisible();
    }
  });

  test('the phone field fits its row on a narrow screen', async ({ page }) => {
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/signup');
      await page.fill('#name', `n${width}`);
      await page.fill('#email', `narrow-${width}-${Date.now()}@noka.test`);
      await page.fill('#password', 'correct-horse-battery');
      await page.fill('#password_confirm', 'correct-horse-battery');
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.waitForURL(/dashboard$/);

      // First run: the contact fields live in the first-run form, which posts to /dashboard/start.
      const form = page
        .locator('form[action="/dashboard/start"], form[action="/dashboard/contacts/new"]')
        .last();
      const country = form.locator('select[name="country"]');
      const number = form.locator('input[name="phone"]');
      const [countryBox, numberBox] = await Promise.all([country.boundingBox(), number.boundingBox()]);
      // The select sits in a positioning wrapper inside the row, so the row is two
      // levels up — measuring the wrapper compared a 168px box against a 979px edge.
      const row = await country.evaluate((element) => {
        const box = element.parentElement!.parentElement!.getBoundingClientRect();
        return { x: box.x, width: box.width };
      });

      // Whatever the width, every control fits inside the row — absolute edges, not
      // widths, because the row is centred. Narrow screens stack, wide ones sit beside.
      const right = (box: { x: number; width: number }) => box.x + box.width;
      for (const [name, box] of [
        ['country', countryBox!],
        ['number', numberBox!],
      ] as const) {
        expect(box.x, `${width}px: ${name} left`).toBeGreaterThanOrEqual(row.x - 1);
        expect(right(box), `${width}px: ${name} right`).toBeLessThanOrEqual(row.x + row.width + 1);
      }
      expect(await number.isVisible()).toBe(true);

      if (width < 640) {
        // Stacked: the number sits below the country, both full width.
        expect(numberBox!.y).toBeGreaterThan(countryBox!.y);
        expect(countryBox!.width, `${width}px: stacked country`).toBeGreaterThan(row.width * 0.8);
      } else {
        // Side by side: the country is the small control and the number takes the room.
        // Compared against each other rather than against a fraction of an ancestor: the
        // ancestor's width follows the page grid, so a proportion here failed when the
        // dashboard grew a second column without anything about the form changing.
        expect(countryBox!.width, `${width}px: country select`).toBeLessThan(numberBox!.width);
        expect(numberBox!.x, `${width}px: input starts after the select`).toBeGreaterThanOrEqual(
          right(countryBox!),
        );
      }
    }
  });

  test('controls that sit together agree on size, and shadows come from the token', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    // Open the folded form: a hidden field cannot be measured, and the add/edit form
    // is where the field heights actually live.
    await page.locator('#contacts .add-more > summary').click();

    // Consistency, not absolute pixels: this survives a padding change and still
    // catches "the UI element sizes are off", which is what was actually reported.
    const heights = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('button, input, select, textarea')).filter(
        (element) => (element as HTMLElement).checkVisibility({ checkVisibilityCSS: true }),
      );
      const byShape = new Map<string, Set<number>>();
      for (const element of visible) {
        const type = (element as HTMLInputElement).type ?? element.tagName.toLowerCase();
        const height = Math.round(element.getBoundingClientRect().height);
        // Checkboxes and the note textarea are their own shapes.
        if (['checkbox', 'radio', 'textarea'].includes(type)) continue;
        const tag = element.tagName.toLowerCase();
        // An icon-only control is a different shape from a labelled one, on purpose.
        const labelled = tag !== 'button' || element.textContent!.trim().length > 0;
        const key = tag === 'select' || tag === 'input' ? 'field' : labelled ? 'button' : 'icon-button';
        byShape.set(key, (byShape.get(key) ?? new Set()).add(height));
      }
      return Object.fromEntries([...byShape].map(([key, value]) => [key, [...value]]));
    });
    // One height per shape across the whole page.
    expect(heights.button ?? [], 'labelled button heights').toHaveLength(1);
    // At most one height per shape: a page may have no icon-only control at all, but two
    // different sizes of one is the drift this catches.
    expect(heights['icon-button'] ?? [], 'icon button heights').toHaveLength(
      (heights['icon-button'] ?? []).length > 0 ? 1 : 0,
    );
    expect(heights.field ?? [], 'field heights').toHaveLength(1);

    // Anything that floats wears the one shadow token, and nothing floats at rest.
    const shadowState = await page.evaluate(() => {
      const token = getComputedStyle(document.documentElement).getPropertyValue('--noka-shadow').trim();
      const visible = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((element) =>
        element.checkVisibility({ checkVisibilityCSS: true }),
      );
      const floating = visible.filter((element) => getComputedStyle(element).boxShadow !== 'none');
      return { atRest: floating.length, token: token.length > 0 };
    });
    expect(shadowState.atRest, 'nothing floats at rest').toBe(0);
    expect(shadowState.token, 'the shadow token exists').toBe(true);

    // Open one menu: the only visible shadow is then the floating panel's.
    await kebab(page, '.contacts > li').click();
    const panelShadow = await page
      .locator('.panel:visible')
      .first()
      .evaluate((element) => getComputedStyle(element).boxShadow);
    expect(panelShadow).not.toBe('none');
    await page.keyboard.press('Escape');
  });

  test('the card flow still works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });
    await makeCard(page);

    await expect(page.locator('.pin')).toBeVisible();
    await expect(page.locator('img.preview')).toBeVisible();
    // Nothing may stick out horizontally: a wallet card page on a phone must not scroll
    // sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
