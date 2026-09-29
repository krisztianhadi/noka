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

    // And it is the card, not the body, that carries the surface colour.
    const card = page.locator('#card > div').first();
    expect(await card.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(surface);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg);
  });

  test('the wordmark is legible in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await page.goto('/');
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);

      const heading = page.getByRole('heading', { name: 'noka' });
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

      const form = page.locator('form[action="/dashboard/contacts/new"]');
      const country = form.locator('select[name="country"]');
      const number = form.locator('input[name="phone"]');
      const [countryBox, numberBox] = await Promise.all([country.boundingBox(), number.boundingBox()]);
      const row = await country.evaluate((element) => {
        const box = element.parentElement!.getBoundingClientRect();
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
        // Side by side: the country stays a fixed, narrow control.
        expect(countryBox!.width, `${width}px: country select`).toBeLessThan(row.width * 0.4);
        expect(numberBox!.x, `${width}px: input starts after the select`).toBeGreaterThanOrEqual(
          right(countryBox!),
        );
      }
    }
  });

  test('the interactive surfaces keep their size and one shadow', async ({ page }) => {
    await signUp(page);
    await addContact(page, { name: 'Maria Silva', phone: '812 345 678' });

    // Buttons and inputs agree on a height; that was the "sizes are off" report.
    const heights = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, input, select'))
        // Checkboxes are not controls in this sense: they are 16px by definition.
        .filter((element) => !['checkbox', 'radio'].includes((element as HTMLInputElement).type))
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .map((element) => Math.round(element.getBoundingClientRect().height)),
    );
    for (const height of heights) expect([32, 36, 40, 44, 76]).toContain(height);

    // Nothing floats at rest: a closed dialog is still in the DOM, so only *visible*
    // elements count.
    const shadows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .filter((element) => (element as HTMLElement).checkVisibility({ checkVisibilityCSS: true }))
        .filter((element) => getComputedStyle(element).boxShadow !== 'none')
        .map((element) => `${element.tagName}.${element.className}`),
    );
    expect(shadows).toEqual([]);

    await kebab(page, '.contacts > li').click();
    const opened = await page.evaluate(
      () => getComputedStyle(document.querySelector('.panel')!).boxShadow,
    );
    expect(opened).not.toBe('none');
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
