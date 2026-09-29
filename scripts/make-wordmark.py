#!/usr/bin/env python3
"""Generate assets/brand/noka-wordmark.svg from Noto Sans Mono Bold outlines.

Text as paths: the logo must render identically on a card, on the landing page and
in a PDF, with no font installed and nothing to load. Replace the generated file
with the real logo when it exists — the card inlines whatever `viewBox` and `<g>`
it finds there.

    python3 scripts/make-wordmark.py
"""

import pathlib
import sys

from fontTools.ttLib import TTFont
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = 'assets/fonts/NotoSansMono-Bold.ttf'
WORD = 'noka'
DEST = pathlib.Path('assets/brand/noka-wordmark.svg')


def main() -> None:
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    upem = font['head'].unitsPerEm
    cmap = font.getBestCmap()

    paths: list[str] = []
    boxes: list[tuple[float, float, float, float]] = []
    pen_x = 0

    for character in WORD:
        name = cmap[ord(character)]
        # SVGPathPen emits font units with y up; the transform lands the glyph in
        # SVG space (y down) at its advance offset.
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, Transform(1, 0, 0, -1, pen_x, 0)))
        commands = pen.getCommands()
        if commands:
            paths.append(commands)

        bounds = BoundsPen(glyphs)
        glyphs[name].draw(bounds)
        if bounds.bounds:
            x_min, y_min, x_max, y_max = bounds.bounds
            boxes.append((x_min + pen_x, -y_max, x_max + pen_x, -y_min))
        pen_x += font['hmtx'][name][0]

    x_min = min(box[0] for box in boxes)
    y_min = min(box[1] for box in boxes)
    x_max = max(box[2] for box in boxes)
    y_max = max(box[3] for box in boxes)

    pad = upem * 0.05
    view_box = f'{x_min - pad:.0f} {y_min - pad:.0f} {(x_max - x_min) + pad * 2:.0f} {(y_max - y_min) + pad * 2:.0f}'

    body = '\n'.join(f'    <path d="{d}"/>' for d in paths)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" role="img" aria-label="noka">
  <title>noka</title>
  <!-- Generated from Noto Sans Mono Bold by scripts/make-wordmark.py.
       Replace this file with the real logo when it exists: the card inlines it. -->
  <g fill="currentColor">
{body}
  </g>
</svg>
'''
    )
    print(f'{DEST} viewBox {view_box}')


if __name__ == '__main__':
    sys.exit(main())
