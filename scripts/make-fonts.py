#!/usr/bin/env python3
"""Generate the card's static Noto instances from the system variable fonts.

The card needs exactly two weights of two text faces plus the handful of Chinese
characters it prints, and none of them can depend on what the host happens to have
installed (the Alpine image has no fonts at all). Run from the repository root:

    python3 scripts/make-fonts.py

Requires fontTools (`pip install fonttools`) and the Noto variable fonts that ship
with most Linux distributions. Noto is licensed under the SIL Open Font License.
"""

import pathlib
import sys

from fontTools.ttLib import TTFont, TTCollection
from fontTools.varLib import instancer
from fontTools import subset

SANS = '/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf'
MONO = '/usr/share/fonts/google-noto-vf/NotoSansMono[wght].ttf'
CJK = '/usr/share/fonts/google-noto-sans-cjk-vf-fonts/NotoSansCJK-VF.ttc'
# The Simplified Chinese face in the collection, by name rather than by index.
CJK_FAMILY = 'Noto Sans CJK SC'
# Every hanzi the card prints: 紧急联系人 (emergency contact) and 扫描 (scan).
CARD_HANZI = '紧急联系人扫描'

OUT = pathlib.Path('assets/fonts')


def instance(source: str, weight: int, destination: pathlib.Path, number: int | None = None) -> None:
    font = TTFont(source, fontNumber=number)
    static = instancer.instantiateVariableFont(font, {'wght': weight}, inplace=False, updateFontNames=True)
    static.save(destination)
    print(f'{destination.name:28} {destination.stat().st_size // 1024:>5} KB')


def cjk_index(path: str, family: str) -> int:
    collection = TTCollection(path)
    for index, font in enumerate(collection.fonts):
        if (font['name'].getDebugName(1) or '') == family:
            return index
    raise SystemExit(f'{family} not found in {path}')


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source in (SANS, MONO, CJK):
        if not pathlib.Path(source).exists():
            raise SystemExit(f'missing font: {source}')

    instance(SANS, 400, OUT / 'NotoSans-Regular.ttf')
    instance(SANS, 700, OUT / 'NotoSans-Bold.ttf')
    instance(MONO, 400, OUT / 'NotoSansMono-Regular.ttf')
    instance(MONO, 700, OUT / 'NotoSansMono-Bold.ttf')

    full = OUT.parent / 'NotoSansSC-static.otf'
    instance(CJK, 400, full, number=cjk_index(CJK, CJK_FAMILY))

    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    font = subset.load_font(str(full), options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=CARD_HANZI)
    subsetter.subset(font)
    destination = OUT / 'NotoSansSC-Card.otf'
    subset.save_font(font, str(destination), options)
    full.unlink()
    print(f'{destination.name:28} {destination.stat().st_size // 1024:>5} KB for {CARD_HANZI}')


if __name__ == '__main__':
    sys.exit(main())
