import QRCode from 'qrcode';
import sharp from 'sharp';
import { cardPhrasesFor } from '@/i18n/card-copy';

/**
 * The card artwork: portrait ISO ID-1 (53.98 × 85.60 mm) at 300 dpi, drawn to his
 * mockup (2026-09-29).
 *
 * Top to bottom: the heading in every language the card carries, a rule, the SCAN
 * line in the same languages, the QR, a rule, the PIN, and the wordmark. No owner
 * name — a card lying in a wallet should not announce whose it is, and the page
 * behind the QR says it anyway.
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
const FONT = 'Helvetica, Arial, "Noto Sans", sans-serif';

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
  options: { weight?: string; fill?: string; tracking?: number } = {},
): string {
  const { weight = 'normal', fill = INK, tracking = 0 } = options;
  return `<text x="${CARD_WIDTH_PX / 2}" y="${y}" text-anchor="middle" font-family='${FONT}' font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}" fill="${fill}">${escapeXml(value)}</text>`;
}

export async function cardSvg(input: CardArtworkInput): Promise<string> {
  const phrases = cardPhrasesFor(input.languages);

  // Heading: every language, stacked, with CJK a touch larger to hold the same weight.
  const heading: string[] = [];
  let y = 74;
  for (const phrase of phrases) {
    const size = Math.round(26 * (phrase.scale ?? 1));
    heading.push(centeredText(phrase.title, y, size, { weight: 'bold' }));
    y += Math.round(38 * (phrase.scale ?? 1));
  }

  const ruleY = y + 4;
  // The SCAN line wraps after the third language, as in the mockup.
  const scanWords = phrases.map((phrase) => phrase.scan.toUpperCase());
  const firstLine = scanWords.slice(0, 3).join('  ·  ');
  const secondLine = scanWords.slice(3).join('  ·  ');

  const qrSize = 360;
  const qr = await qrSvg(input.url, qrSize);
  const qrX = Math.round((CARD_WIDTH_PX - qrSize) / 2);
  const qrY = ruleY + (secondLine ? 66 : 42);

  const pinRuleY = qrY + qrSize + 44;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH_PX}" height="${CARD_HEIGHT_PX}" viewBox="0 0 ${CARD_WIDTH_PX} ${CARD_HEIGHT_PX}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${heading.join('\n  ')}
  <line x1="${CARD_WIDTH_PX / 2 - 44}" y1="${ruleY}" x2="${CARD_WIDTH_PX / 2 + 44}" y2="${ruleY}" stroke="${LINE}" stroke-width="3"/>
  ${centeredText(firstLine, ruleY + 32, 19, { fill: SOFT, tracking: 1 })}
  ${secondLine ? centeredText(secondLine, ruleY + 58, 19, { fill: SOFT, tracking: 1 }) : ''}
  <g transform="translate(${qrX}, ${qrY})">${qr}</g>
  <line x1="${CARD_WIDTH_PX / 2 - 44}" y1="${pinRuleY}" x2="${CARD_WIDTH_PX / 2 + 44}" y2="${pinRuleY}" stroke="${LINE}" stroke-width="3"/>
  ${centeredText('PIN', pinRuleY + 40, 20, { fill: SOFT, tracking: 6 })}
  ${centeredText(input.pin, pinRuleY + 116, 72, { weight: 'bold', tracking: 14 })}
  ${centeredText('noka', CARD_HEIGHT_PX - 34, 24, { fill: '#b9b9b9', tracking: 4 })}
</svg>`;
}

/** The same artwork as a JPEG, which is what the dashboard displays. */
export async function cardJpeg(input: CardArtworkInput): Promise<Buffer> {
  const svg = await cardSvg(input);
  return sharp(Buffer.from(svg)).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
}
