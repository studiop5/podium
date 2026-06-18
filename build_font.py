#!/usr/bin/env python3
"""Build Podium's embedded Bravura font from the pristine upstream original.

Everything that turns the one tracked font binary (lib/BravuraText.otf, the
unmodified upstream BravuraText) into the glyph set Podium ships lives here:

  pristine lib/BravuraText.otf
    -> subset to the glyphs the symbol palette exposes (src/smufl.js; layout
       features dropped, so only directly-addressed codepoints are reachable)
    -> give the time-sig DIGITS (E080-E089) real ink-width advances, so they flow
       as inline text (page numbers) instead of stacking at one x (the zero-advance
       default, which renders blank/overlapping on iOS)
    -> merge the 24 composed key/time-signature glyphs (build_composites), which
       are stacked from pristine components and don't exist upstream
    => build/BravuraText.otf  (transient; build.py --font base64-embeds it in font.js)

The pristine original is the only tracked font binary; the subset, the
composites, and the embedded font are all derived here into build/.

build.py --font calls build_bravura(); there is no manual step.
"""
import os
import sys

PRISTINE = 'lib/BravuraText.otf'
SMUFL_JS = 'src/smufl.js'   # the symbol palette; defines what glyphs the app can show


def curated_codepoints():
    """The glyphs to embed = every SMuFL codepoint the symbol palette exposes.

    Podium can only display a glyph the palette (smuflTable in src/smufl.js)
    offers — nothing in the app addresses other codepoints, and we drop the
    OpenType features that would reach the font's optional/alternate glyphs.
    So we subset to exactly the palette's codepoints, read straight from it:
    the embedded font stays in lockstep with what the app can show, with no
    hand-maintained list to drift. (Codepoints the palette names but pristine
    lacks are harmlessly ignored by the subsetter.)
    """
    text = open(SMUFL_JS, encoding='utf-8').read()
    return sorted({ord(c) for c in text if 0xE000 <= ord(c) <= 0xF8FF})


# --- composed key/time-signature glyphs ----------------------------------
# These do NOT exist in pristine BravuraText. They are stacked from glyphs that
# do: the 14 key sigs from accidentalSharp/accidentalFlat at the standard staff
# positions, the 10 combined time sigs from the time-sig digits. Each is assigned
# a Podium-private PUA codepoint that the app references directly.
#
# To add a signature, add one row to COMPOSITES:
#   * key sig : (codepoint, name, 'sharp'|'flat', count)   count 1-7 only
#   * time sig: (codepoint, name, 'time', (numerator_str, denominator_str))
#     e.g. 13/16 -> (0xE1xx, 'timeSigCombined1316', 'time', ('13', '16'))
# Do NOT renumber existing codepoints: the app references them directly.
COMPOSITES = [
    (0xE00E, 'keySigSharp1', 'sharp', 1),
    (0xE00F, 'keySigSharp2', 'sharp', 2),
    (0xE025, 'keySigSharp3', 'sharp', 3),
    (0xE026, 'keySigSharp4', 'sharp', 4),
    (0xE027, 'keySigSharp5', 'sharp', 5),
    (0xE028, 'keySigSharp6', 'sharp', 6),
    (0xE029, 'keySigSharp7', 'sharp', 7),
    (0xE02A, 'keySigFlat1', 'flat', 1),
    (0xE02B, 'keySigFlat2', 'flat', 2),
    (0xE02C, 'keySigFlat3', 'flat', 3),
    (0xE02D, 'keySigFlat4', 'flat', 4),
    (0xE02E, 'keySigFlat5', 'flat', 5),
    (0xE02F, 'keySigFlat6', 'flat', 6),
    (0xE03A, 'keySigFlat7', 'flat', 7),
    (0xE03B, 'timeSigCombined44', 'time', ('4', '4')),
    (0xE03C, 'timeSigCombined34', 'time', ('3', '4')),
    (0xE03D, 'timeSigCombined24', 'time', ('2', '4')),
    (0xE03E, 'timeSigCombined68', 'time', ('6', '8')),
    (0xE03F, 'timeSigCombined22', 'time', ('2', '2')),
    (0xE04E, 'timeSigCombined38', 'time', ('3', '8')),
    (0xE04F, 'timeSigCombined98', 'time', ('9', '8')),
    (0xE0FD, 'timeSigCombined54', 'time', ('5', '4')),
    (0xE0FE, 'timeSigCombined78', 'time', ('7', '8')),
    (0xE0FF, 'timeSigCombined128', 'time', ('12', '8')),
]

# Component glyphs in pristine BravuraText.
SHARP = 0xE262
FLAT  = 0xE260
DIGIT = {str(d): 0xE080 + d for d in range(10)}

# Key signature geometry (font units). The dy lists are the standard staff
# positions for successive sharps / flats; accidentals step right by *_DX_STEP.
# There is no standard position past the 7th accidental, so 7 is the maximum.
SHARP_DY      = [599, 224, 724, 349, -26, 474, 99]
FLAT_DY       = [100, 475, -25, 350, -150, 225, -275]
SHARP_DX_STEP = 220
FLAT_DX_STEP  = 200
KEYSIG_RPAD   = 40     # right sidebearing past the last accidental's ink

# Time signature geometry (font units).
TS_NUM_DY    = 750     # numerator vertical position
TS_DEN_DY    = 250     # denominator vertical position
TS_DIGIT_GAP = 5       # ink gap between digits within a multi-digit row
TS_RPAD      = 29      # right sidebearing past the widest row's ink


def build_composites(pristine_path=PRISTINE,
                     out_path='build/bravura-composites.otf'):
    """Compose the key/time-sig glyphs from pristine and write a CFF OTF to merge."""
    try:
        from fontTools.ttLib import TTFont
        from fontTools.fontBuilder import FontBuilder
        from fontTools.pens.t2CharStringPen import T2CharStringPen
        from fontTools.pens.transformPen import TransformPen
        from fontTools.pens.boundsPen import BoundsPen
    except ImportError:
        sys.exit("build --font needs fontTools:  pip install fonttools")

    pr = TTFont(pristine_path)
    upm = pr['head'].unitsPerEm
    gs = pr.getGlyphSet()
    cmap = pr.getBestCmap()

    def ink(cp):
        p = BoundsPen(gs); gs[cmap[cp]].draw(p)
        b = p.bounds or (0, 0, 0, 0)
        return b[0], b[2]   # xMin, xMax

    def compose(name, comps):
        """comps = [(component_cp, dx, dy)]; returns (charstring, advance, lsb)."""
        right = max(ink(cp)[1] + dx for cp, dx, dy in comps)
        left = min(ink(cp)[0] + dx for cp, dx, dy in comps)
        pad = KEYSIG_RPAD if name.startswith('keySig') else TS_RPAD
        advance = round(right + pad)
        pen = T2CharStringPen(advance, gs)
        for cp, dx, dy in comps:
            gs[cmap[cp]].draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
        return pen.getCharString(), advance, round(left)

    def layout_row(digits):
        """Pack digits left-to-right by ink width; return [(cp, dx)], inkL, inkR."""
        placed, x = [], 0
        for ch in digits:
            cp = DIGIT[ch]
            placed.append((cp, x))
            xmin, xmax = ink(cp)
            x += (xmax - xmin) + TS_DIGIT_GAP
        left = min(ink(cp)[0] + dx for cp, dx in placed)
        right = max(ink(cp)[1] + dx for cp, dx in placed)
        return placed, left, right

    glyph_order = ['.notdef']
    charstrings = {'.notdef': T2CharStringPen(0, gs).getCharString()}
    metrics = {'.notdef': (round(upm * 0.5), 0)}
    cmap_out = {}

    for cp, name, kind, spec in COMPOSITES:
        if kind in ('sharp', 'flat'):
            dys = SHARP_DY if kind == 'sharp' else FLAT_DY
            if not 1 <= spec <= len(dys):
                sys.exit(f"{name}: {kind} count must be 1..{len(dys)} — there is "
                         f"no standard staff position for accidental #{spec}")
            comp_cp = SHARP if kind == 'sharp' else FLAT
            step = SHARP_DX_STEP if kind == 'sharp' else FLAT_DX_STEP
            comps = [(comp_cp, i * step, dys[i]) for i in range(spec)]
        else:
            num, den = spec
            np, nl, nr = layout_row(num)
            dp, dl, dr = layout_row(den)
            # Rows are left-aligned at the origin; only when the digit counts
            # differ is the shorter row centred under the longer (e.g. the "8"
            # under the "12" in 12/8). Equal counts stay left-aligned.
            nshift = dshift = 0
            if len(num) > len(den):
                dshift = round((nl + nr) / 2 - (dl + dr) / 2)
            elif len(den) > len(num):
                nshift = round((dl + dr) / 2 - (nl + nr) / 2)
            comps = ([(c, dx + nshift, TS_NUM_DY) for c, dx in np] +
                     [(c, dx + dshift, TS_DEN_DY) for c, dx in dp])

        cs, advance, lsb = compose(name, comps)
        charstrings[name] = cs
        metrics[name] = (advance, lsb)
        glyph_order.append(name)
        cmap_out[cp] = name

    # Copy vertical metrics from pristine so the merge stays consistent.
    hhea, os2 = pr['hhea'], pr['OS/2']
    fb = FontBuilder(upm, isTTF=False)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap_out)
    fb.setupCFF('PodiumComposites', {'FullName': 'Podium Composites'}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    # Pin lsb explicitly (FontBuilder derives lsb=0 for CFF) so it matches each
    # glyph's true ink left edge.
    for name, mtx in metrics.items():
        fb.font['hmtx'].metrics[name] = mtx
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent)
    fb.setupNameTable({'familyName': 'Podium Composites', 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender,
                usWinAscent=os2.usWinAscent, usWinDescent=os2.usWinDescent)
    fb.setupPost()
    fb.font.recalcBBoxes = False   # keep the lsb we pinned above
    fb.save(out_path)
    print(f"  built {out_path}: {len(glyph_order)} glyphs")


def build_bravura(out_path='build/BravuraText.otf'):
    """Subset pristine, fix time-sig digit advances, merge composites -> out_path."""
    try:
        from fontTools.ttLib import TTFont
        from fontTools.subset import Subsetter, Options
        from fontTools.merge import Merger
        from fontTools.pens.boundsPen import BoundsPen
    except ImportError:
        sys.exit("build --font needs fontTools:  pip install fonttools")

    os.makedirs('build', exist_ok=True)
    pr = TTFont(PRISTINE)
    o = Options()
    o.glyph_names = True; o.notdef_outline = True; o.recalc_bounds = True
    o.layout_features = []; o.layout_scripts = []; o.hinting = False; o.desubroutinize = True
    o.drop_tables += ['MATH']
    ss = Subsetter(options=o); ss.populate(unicodes=curated_codepoints()); ss.subset(pr)
    # ink-width advances for the time-sig digits (tight; digits abut at their ink edges)
    cmap = pr.getBestCmap(); gs = pr.getGlyphSet(); hmtx = pr['hmtx']
    for d in range(10):
        gn = cmap.get(0xE080 + d)
        pen = BoundsPen(gs); gs[gn].draw(pen); b = pen.bounds
        _, lsb = hmtx[gn]; hmtx[gn] = (round(b[2] - b[0]), lsb)
    tmp = 'build/_bravura_main.otf'; pr.save(tmp)
    composites = 'build/bravura-composites.otf'
    build_composites(PRISTINE, composites)
    merged = Merger().merge([tmp, composites])
    merged.save(out_path); os.remove(tmp)
    print(f"  built {out_path}: {len(merged.getGlyphOrder())} glyphs")


if __name__ == '__main__':
    build_bravura(*sys.argv[1:])
