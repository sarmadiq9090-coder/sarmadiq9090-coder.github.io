"""InstaWords and InstaConvert app icons in InstaFind's style (owner decision D-049, 2026-11-09).

A diagonal gradient rounded square, a soft top highlight, a soft glyph shadow and one large white
glyph with a translucent fill. The 1024 masters are the owner-approved drawings, tidied only: the
redundant stroke="inherit" in the shadow is gone and the glyph is centred on the tile. Up to 40 px
the drawing is simplified on its own grid: no shadow, a full-bleed tile and thicker strokes.

Used by gen.py (SVG) and export.py (PNG, ICO, MSIX); the other apps keep the brand v2 drawings.
"""

APPS = {  # id: aria label, gradient start, gradient end, shadow colour, ink for a light taskbar
    "instawords": dict(label="InstaWords — تفقيط", c1="#7c3aed", c2="#db2777", shadow="#2e0a4a", ink="#7c3aed"),
    "instaconvert": dict(label="InstaConvert", c1="#4f46e5", c2="#9333ea", shadow="#1a0a4a", ink="#4f46e5"),
}
# glyph-box centring: the approved drawings sat off centre by these amounts (1024 grid)
CENTRE = {"instawords": (-44, 44.5), "instaconvert": (-9, -9)}
SMALL_SIZES = (16, 20, 24, 32)
WHITE = "#fff"


def _hx(c):
    return [int(c[i:i + 2], 16) for i in (1, 3, 5)]


def _mix(a, b):
    A, B = _hx(a), _hx(b)
    return ["#%02x%02x%02x" % tuple(round(A[k] + (B[k] - A[k]) * t / 5) for k in range(3)) for t in range(6)]


def _defs(app, blur=True, inset=True):
    a = APPS[app]
    stops = "".join(f'<stop offset="{i / 5:.2f}" stop-color="{c}"/>' for i, c in enumerate(_mix(a["c1"], a["c2"])))
    clip = ('<rect x="30.72" y="30.72" width="961.56" height="961.56" rx="225.28"/>' if inset
            else '<rect width="1024" height="1024" rx="225.28"/>')
    return "\n".join([
        "<defs>",
        f'<linearGradient id="ig" x1="0" y1="0" x2="1" y2="1">{stops}</linearGradient>',
        '<radialGradient id="ih" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/>'
        '<stop offset="0.6" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>'
        "</radialGradient>",
    ] + (['<filter id="is" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="25.6"/></filter>']
         if blur else []) + [f'<clipPath id="ic">{clip}</clipPath>', "</defs>"])


# ---------------------------------------------------------------- glyphs (1024 grid)
# Each glyph takes `ink` (None = inherit the shadow group's colour) and stroke widths, so the
# masters and the small sizes share one drawing.
NIB = "M512 800 L372 540 Q352 470 404 400 L620 400 Q672 470 652 540 Z"


def words(ink, fill=True, nib=64, slit=44, cap=64, hole=40):
    """Pen nib, rotated 45 degrees: outline + translucent fill, slit and breather hole."""
    s = f' stroke="{ink}"' if ink else ""
    f = f' fill="{ink}"' if ink else ""
    g = '<g transform="translate(512 512) scale(1.08) rotate(45) translate(-512 -530)">'
    if fill and ink:
        g += f'<path d="{NIB}" fill="{ink}" fill-opacity="0.157"/>'
    g += f'<g{s} stroke-linejoin="round" stroke-linecap="round" fill="none">'
    g += f'<path d="{NIB}" stroke-width="{nib}"/>'
    if slit:
        g += f'<line x1="512" y1="790" x2="512" y2="600" stroke-width="{slit}"/>'
    g += f'<rect x="402" y="236" width="220" height="96" rx="30" stroke-width="{cap}"/></g>'
    if hole:
        g += f'<circle cx="512" cy="560" r="{hole}"{f}/>'
    return g + "</g>"


def convert(ink, fill=True, frame=64, grid=44, rows=(380, 518), col=392, arrow=96, head=36,
            tip=(820, 650, 820, 820, 650, 820)):
    """Table sheet with a header rule, two rows and one column, and a convert arrow."""
    s = f' stroke="{ink}"' if ink else ""
    f = f' fill="{ink}"' if ink else ""
    g = ""
    if fill and ink:
        g += f'<rect x="236" y="236" width="420" height="420" rx="72" fill="{ink}" fill-opacity="0.157"/>'
    g += f'<g{s} fill="none" stroke-linecap="round" stroke-linejoin="round">'
    g += f'<rect x="236" y="236" width="420" height="420" rx="72" stroke-width="{frame}"/>'
    for y in rows:
        g += f'<line x1="236" y1="{y}" x2="656" y2="{y}" stroke-width="{grid}"/>'
    if col:
        g += f'<line x1="{col}" y1="{rows[0]}" x2="{col}" y2="656" stroke-width="{grid}"/>'
    g += f'<line x1="640" y1="640" x2="770" y2="770" stroke-width="{arrow}"/></g>'
    x1, y1, x2, y2, x3, y3 = tip
    g += f'<path d="M{x1} {y1} L{x2} {y2} L{x3} {y3} Z"{f}{s} stroke-linejoin="round" stroke-width="{head}"/>'
    return g


DRAW = {"instawords": words, "instaconvert": convert}

# simplified glyphs for the small grids: thicker strokes, fewer inner lines
SMALL = {
    "instawords": {
        16: dict(nib=120, slit=0, cap=110, hole=0),
        20: dict(nib=104, slit=0, cap=96, hole=52),
        24: dict(nib=92, slit=60, cap=88, hole=48),
        32: dict(nib=84, slit=56, cap=80, hole=46),
    },
    "instaconvert": {
        16: dict(frame=110, grid=84, rows=(436,), col=0, arrow=150, head=60),
        20: dict(frame=100, grid=76, rows=(420,), col=0, arrow=140, head=56),
        24: dict(frame=92, grid=68, rows=(400,), col=420, arrow=128, head=50),
        32: dict(frame=84, grid=60, rows=(380, 518), col=400, arrow=120, head=46),
    },
}


def _centre(app, body):
    dx, dy = CENTRE[app]
    return f'<g transform="translate({dx} {dy})">{body}</g>'


def _svg(app, size, body):
    label = APPS[app]["label"]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="{size}" height="{size}" '
            f'role="img" aria-label="{label}"><title>{label}</title>' + body + "\n</svg>\n")


def master_svg(app, size=1024):
    """The approved 1024 master (tidied)."""
    a, draw = APPS[app], DRAW[app]
    shadow = (f'<g transform="translate(12.3 25.6)" stroke="{a["shadow"]}" fill="{a["shadow"]}" opacity="0.45" '
              f'filter="url(#is)">{_centre(app, draw(None))}</g>')
    return _svg(app, size, "\n".join([
        _defs(app),
        '<g clip-path="url(#ic)">',
        '<rect width="1024" height="1024" fill="url(#ig)"/>',
        '<ellipse cx="512.0" cy="-281.6" rx="972.8" ry="768.0" fill="url(#ih)"/>',
        shadow,
        "</g>",
        _centre(app, draw(WHITE)),
    ]))


def small_svg(app, n, size=None):
    """Simplified drawing for the n px grid (16, 20, 24, 32): full-bleed tile, no shadow."""
    return _svg(app, size or n, "\n".join([
        _defs(app, blur=False, inset=False),
        '<g clip-path="url(#ic)">',
        '<rect width="1024" height="1024" fill="url(#ig)"/>',
        '<ellipse cx="512.0" cy="-281.6" rx="972.8" ry="768.0" fill="url(#ih)"/>',
        "</g>",
        _centre(app, DRAW[app](WHITE, **SMALL[app][n])),
    ]))


def grid_for(size):
    return 16 if size <= 17 else 20 if size <= 21 else 24 if size <= 27 else 32


def icon_svg(app, size):
    """The icon as drawn for `size` px: simplified grid up to 40 px, the master above."""
    return small_svg(app, grid_for(size), size) if size <= 40 else master_svg(app, size)


def glyph_svg(app, size, ink):
    """The glyph alone (taskbar, unplated), cropped to the middle 760 of the 1024 grid."""
    params = SMALL[app][grid_for(size)] if size <= 40 else {}
    body = _centre(app, DRAW[app](ink, **params))
    label = APPS[app]["label"]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="132 132 760 760" width="{size}" height="{size}" '
            f'role="img" aria-label="{label}"><title>{label}</title>{body}</svg>\n')
