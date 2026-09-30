import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { A4_MM, CARD_MM, cardPdf, countOnSheet, mm } from '@/lib/card-pdf';

/**
 * The print masters, measured.
 *
 * The expectations are the paper and card standards themselves — ISO 216 for A4, ISO/IEC 7810
 * ID-1 for the card — not numbers read back out of our own layout code, so a regression in the
 * geometry fails here rather than matching whatever the code now produces.
 */
const card = {
  pin: '123 456',
  url: 'https://noka.care/c/HXK4M2QW7T9B3NR5VC8Y6DPLZA',
  languages: ['en', 'es', 'fr', 'ru', 'zh'],
};

const load = async (layout: 'card' | 'a4' | 'sheet') => PDFDocument.load(await cardPdf(card, layout));

describe('the print masters', () => {
  it('makes a page exactly the size of a bank card', async () => {
    const pdf = await load('card');
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(mm(CARD_MM.width), 2);
    expect(height).toBeCloseTo(mm(CARD_MM.height), 2);
    // ID-1 in points, to the millimetre: 53.98 × 85.60 mm is 153.01 × 242.65 pt.
    expect(width).toBeCloseTo(153.01, 1);
    expect(height).toBeCloseTo(242.65, 1);
  });

  it('puts one card on a sheet of A4', async () => {
    const pdf = await load('a4');
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(mm(A4_MM.width), 2);
    expect(height).toBeCloseTo(mm(A4_MM.height), 2);
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  it('fills an A4 sheet with as many cards as fit decently', async () => {
    const pdf = await load('sheet');
    expect(pdf.getPageCount()).toBe(1);
    const page = pdf.getPage(0);
    expect(page.getSize().width).toBeCloseTo(mm(A4_MM.width), 2);

    // He asked for ten to twelve; the grid is two across and five down, rotated.
    expect(countOnSheet()).toBeGreaterThanOrEqual(10);
    expect(countOnSheet()).toBeLessThanOrEqual(12);

    // Every card is on the page, and none of them hangs off an edge: a card that does not fit is
    // worse than one card fewer, because it wastes paper and scissors.
    const margin = mm(8);
    const box = page.getSize();
    expect(box.width - 2 * margin).toBeGreaterThanOrEqual(mm(CARD_MM.height) * 2);
    expect(box.height - 2 * margin).toBeGreaterThanOrEqual(mm(CARD_MM.width) * 5);
  });

  it('embeds the artwork once, however many times it is drawn', async () => {
    const single = (await cardPdf(card, 'a4')).length;
    const sheet = (await cardPdf(card, 'sheet')).length;
    // Ten draws of one image, not ten images: the sheet is not ten times the size of the single.
    expect(sheet).toBeLessThan(single * 3);
  });
});
