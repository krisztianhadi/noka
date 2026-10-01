import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX, cardSvg } from '@/lib/card-artwork';
import { CARD_PHRASES, CARD_PHRASE_ORDER } from '@/i18n/card-copy';

/**
 * Every language has to fit on the printed card.
 *
 * The artwork places text at fixed pixel sizes with no measurement, so a longer translation — or a
 * new language — overlapped its slot or ran off the card instead of failing anywhere a human would
 * notice before paper did. This renders the card once per language and measures where the ink
 * actually lands, which is the only check that can see a clipped line.
 *
 * The assertion is deliberately loose: it asks for clear paper inside the edge, not for the design
 * team's margins. Its job is to fail loudly on an overflow, and the card is the one artefact that
 * cannot be fixed after it is printed.
 */
const MIN_MARGIN_PX = 30; // ≈2.5 mm at 300 dpi

async function inkBox(svg: string): Promise<{ left: number; right: number; top: number; bottom: number }> {
  const { data, info } = await sharp(Buffer.from(svg))
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x]! < 200) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { left, right, top, bottom };
}

const card = (languages: string[]) =>
  cardSvg({
    pin: '123 456',
    url: 'https://noka.care/c/HXK4M2QW7T9B3NR5VC8Y6DPLZA',
    languages,
  });

describe('the printed card', () => {
  for (const language of CARD_PHRASE_ORDER) {
    it(`keeps ${language} inside the paper`, async () => {
      const box = await inkBox(await card([language]));
      expect(box.right, `${language}: right edge (${CARD_PHRASES[language].title})`).toBeLessThanOrEqual(
        CARD_WIDTH_PX - MIN_MARGIN_PX,
      );
      expect(box.left, `${language}: left edge`).toBeGreaterThanOrEqual(MIN_MARGIN_PX);
      expect(box.bottom, `${language}: bottom edge`).toBeLessThanOrEqual(CARD_HEIGHT_PX - MIN_MARGIN_PX);
      expect(box.top, `${language}: top edge`).toBeGreaterThanOrEqual(MIN_MARGIN_PX);
    });
  }

  it('keeps all five languages inside the paper together', async () => {
    // The shipped card, which is where the five headings compete for vertical room as well.
    const box = await inkBox(await card([...CARD_PHRASE_ORDER]));
    expect(box.right).toBeLessThanOrEqual(CARD_WIDTH_PX - MIN_MARGIN_PX);
    expect(box.left).toBeGreaterThanOrEqual(MIN_MARGIN_PX);
    expect(box.bottom).toBeLessThanOrEqual(CARD_HEIGHT_PX - MIN_MARGIN_PX);
    expect(box.top).toBeGreaterThanOrEqual(MIN_MARGIN_PX);
  });

  it('measures ink rather than trusting the file, so a clipped line is visible here', async () => {
    // A control: the same phrase at a size that cannot fit must fail the property above. Without
    // this, a measurement that always returned the full canvas would look like a passing test.
    const oversized = await cardSvg({
      pin: '123 456',
      url: 'https://noka.care/c/HXK4M2QW7T9B3NR5VC8Y6DPLZA',
      languages: ['ru'],
    });
    const wide = oversized.replace('font-size="34"', 'font-size="120"');
    expect(wide).not.toBe(oversized);

    const box = await inkBox(wide);
    expect(box.left < MIN_MARGIN_PX || box.right > CARD_WIDTH_PX - MIN_MARGIN_PX).toBe(true);
  });
});
