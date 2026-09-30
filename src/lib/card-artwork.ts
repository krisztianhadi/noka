import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureFonts, HEADING_FONT, MONO_FONT } from '@/lib/fonts';
import { cardPhrasesFor } from '@/i18n/card-copy';
import QRCode from 'qrcode';
import sharp from 'sharp';

/**
 * The card artwork: portrait ISO ID-1 (53.98 × 85.60 mm) at 300 dpi, drawn to his
 * mockup (2026-09-29) and re-set in Noto (2026-09-29, second pass).
 *
 * Top to bottom: the heading in every language the card carries (Noto Sans), a rule,
 * the SCAN line in the same languages, the QR with room around it, a rule, the PIN in
 * Noto Sans Mono, and the wordmark as vector paths. No owner name: a card lying in a
 * wallet should not announce whose it is, and the page behind the QR says it anyway.
 *
 * The deterministic, exact-size PDF and the A4 sheet are Phase 7; this is the image
 * the dashboard shows and the owner can already print.
 */
const DPI = 300;
const MM = DPI / 25.4;
export const CARD_WIDTH_PX = Math.round(53.98 * MM); // 638
export const CARD_HEIGHT_PX = Math.round(85.6 * MM); // 1011

const INK = '#111111';
const SOFT = '#555555';
const LINE = '#d8d8d8';
const LOGO_INK = '#c9c9c9';
const WORDMARK = 'assets/brand/noka-wordmark.svg';

export interface CardArtworkInput {
  pin: string;
  url: string;
  languages: string[];
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ?? character,
  );
}

async function qrSvg(url: string, size: number): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    width: size,
  });
  return svg.replace(/<\?xml.*?\?>/, '').trim();
}

function centeredText(
  value: string,
  y: number,
  size: number,
  options: { font?: string; weight?: string; fill?: string; tracking?: number; scale?: number } = {},
): string {
  const { font = HEADING_FONT, weight = 'normal', fill = INK, tracking = 0, scale = 1 } = options;
  const sizeAttr = scale === 1 ? `font-size="${size}"` : `font-size="${Math.round(size * scale)}"`;
  return `<text x="${CARD_WIDTH_PX / 2}" y="${y}" text-anchor="middle" font-family="${font}" ${sizeAttr} font-weight="${weight}" letter-spacing="${tracking}" fill="${fill}">${escapeXml(value)}</text>`;
}

/**
 * The wordmark, inlined from the SVG asset so the card does not depend on a font for
 * it. Returns nothing if the file is missing: a card without a logo still prints.
 */
function wordmarkSvg(x: number, y: number, height: number): string {
  try {
    const source = readFileSync(join(process.cwd(), WORDMARK), 'utf8');
    const viewBox = source.match(/viewBox="([^"]+)"/)?.[1];
    // Comments are stripped first: an SVG that mentions a tag inside a comment used to make
    // this match start at the comment and produce an unbalanced fragment, which sharp then
    // rejected as corrupt XML.
    const markup = source.replace(/<!--[\s\S]*?-->/g, '');
    const inner = markup.match(/<g[\s\S]*?<\/g>/)?.[0];
    if (!viewBox || !inner) return '';
    const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);
    const width = ((vw ?? 1) / (vh ?? 1)) * height;
    const drawn = inner.replace('currentColor', LOGO_INK);
    return `<svg x="${x - width / 2}" y="${y}" width="${width}" height="${height}" viewBox="${vx} ${vy} ${vw} ${vh}">${drawn}</svg>`;
  } catch {
    return '';
  }
}

export async function cardSvg(input: CardArtworkInput): Promise<string> {
  ensureFonts();
  const phrases = cardPhrasesFor(input.languages);

  // Heading: every language, stacked, CJK a touch larger to hold the same weight. Bigger than
  // it was — it is what a stranger reads first from arm's length — which costs 31px of the
  // fixed 1011px card, paid for below by a slightly smaller QR and PIN.
  const heading: string[] = [];
  let y = 76;
  for (const phrase of phrases) {
    heading.push(centeredText(phrase.title, y, 34, { weight: 'bold', scale: phrase.scale ?? 1 }));
    y += Math.round(44 * (phrase.scale ?? 1));
  }

  const ruleY = y + 6;
  const scanWords = phrases.map((phrase) => phrase.scan.toUpperCase());
  const firstLine = scanWords.slice(0, 3).join('  ·  ');
  const secondLine = scanWords.slice(3).join('  ·  ');

  const scanLineHeight = 26;
  const scanTop = ruleY + 34;
  const scanBottom = secondLine ? scanTop + scanLineHeight : scanTop;

  // Room to breathe: the QR sits well clear of the text above and the PIN below.
  const qrSize = 320;
  const qrX = Math.round((CARD_WIDTH_PX - qrSize) / 2);
  const qrY = scanBottom + 46;
  const qr = await qrSvg(input.url, qrSize);

  const pinRuleY = qrY + qrSize + 54;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH_PX}" height="${CARD_HEIGHT_PX}" viewBox="0 0 ${CARD_WIDTH_PX} ${CARD_HEIGHT_PX}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${heading.join('\n  ')}
  <line x1="${CARD_WIDTH_PX / 2 - 46}" y1="${ruleY}" x2="${CARD_WIDTH_PX / 2 + 46}" y2="${ruleY}" stroke="${LINE}" stroke-width="3"/>
  ${centeredText(firstLine, scanTop, 18, { font: MONO_FONT, fill: SOFT, tracking: 1 })}
  ${secondLine ? centeredText(secondLine, scanTop + scanLineHeight, 18, { font: MONO_FONT, fill: SOFT, tracking: 1 }) : ''}
  <g transform="translate(${qrX}, ${qrY})">${qr}</g>
  <line x1="${CARD_WIDTH_PX / 2 - 46}" y1="${pinRuleY}" x2="${CARD_WIDTH_PX / 2 + 46}" y2="${pinRuleY}" stroke="${LINE}" stroke-width="3"/>
  ${centeredText('PIN', pinRuleY + 42, 17, { font: MONO_FONT, fill: SOFT, tracking: 6 })}
  ${centeredText(input.pin, pinRuleY + 100, 54, { font: MONO_FONT, weight: 'bold', tracking: 9 })}
  ${wordmarkSvg(CARD_WIDTH_PX / 2, CARD_HEIGHT_PX - 56, 30)}
</svg>`;
}

/** The same artwork as a JPEG, which is what the dashboard displays. */
export async function cardJpeg(input: CardArtworkInput): Promise<Buffer> {
  const svg = await cardSvg(input);
  return sharp(Buffer.from(svg)).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
}
