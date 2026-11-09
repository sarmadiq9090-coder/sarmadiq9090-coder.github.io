"""FastKiwi brand v2: vector masters (hand-built geometry, flat fills).

Usage:  python3 gen.py <fonts-dir> <brand-dir>

<fonts-dir> must hold IBMPlexSans-SemiBold.woff and IBMPlexSansArabic-SemiBold.woff
(IBM Plex 1.1.0, SIL OFL 1.1). Text is shaped with HarfBuzz and
outlined with fontTools, so no SVG needs a font. export.py imports this module for the
per-size icon drawings. InstaWords and InstaConvert are drawn by insta.py instead (InstaFind
style, owner decision D-049, 2026-11-09).
"""
import io
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import insta  # noqa: E402  InstaWords and InstaConvert (owner decision D-049)

# ---------------------------------------------------------------- palette
FOREST = "#123B2A"
LIME = "#B9F34A"
WHITE = "#F7FAF2"     # warm white
LEAF = "#3F8A1C"      # lime-on-light text (FastKiwi family green)
EDGE = "#2F6249"      # 1 px lighter tile edge (2.30:1 against a #202020 taskbar)
SKY = "#78CFFF"       # InstaFind
LAVENDER = "#C5B3FF"  # Remember Me
YELLOW = "#FFD85A"    # Lemon

APPS = {  # file id: (name, accent)
    "fastkiwi": ("FastKiwi", LIME),
    "instafind": ("InstaFind", SKY),
    "remember-me": ("Remember Me", LAVENDER),
    "lemon": ("Lemon", YELLOW),
    "instawords": ("InstaWords", insta.APPS["instawords"]["c1"]),      # D-049: insta.py
    "instaconvert": ("InstaConvert", insta.APPS["instaconvert"]["c1"]),  # D-049: insta.py
}


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def pol(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def poly(pts):
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"


def nuqta(cx, cy, length, width, ang):
    """Calligraphic nuqta: a rhombus with its long axis along `ang` degrees."""
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a)
    vx, vy = -uy, ux
    return poly([(cx + ux * length / 2, cy + uy * length / 2), (cx + vx * width / 2, cy + vy * width / 2),
                 (cx - ux * length / 2, cy - uy * length / 2), (cx - vx * width / 2, cy - vy * width / 2)])


def circle(cx, cy, r):
    return (f"M{f(cx - r)} {f(cy)}A{f(r)} {f(r)} 0 1 0 {f(cx + r)} {f(cy)}"
            f"A{f(r)} {f(r)} 0 1 0 {f(cx - r)} {f(cy)}Z")


def ellipse(cx, cy, rx, ry):
    return (f"M{f(cx - rx)} {f(cy)}A{f(rx)} {f(ry)} 0 1 0 {f(cx + rx)} {f(cy)}"
            f"A{f(rx)} {f(ry)} 0 1 0 {f(cx - rx)} {f(cy)}Z")


def rrect(x0, y0, x1, y1, r):
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    if r <= 0:
        return f"M{f(x0)} {f(y0)}H{f(x1)}V{f(y1)}H{f(x0)}Z"
    return (f"M{f(x0 + r)} {f(y0)}H{f(x1 - r)}A{f(r)} {f(r)} 0 0 1 {f(x1)} {f(y0 + r)}"
            f"V{f(y1 - r)}A{f(r)} {f(r)} 0 0 1 {f(x1 - r)} {f(y1)}H{f(x0 + r)}"
            f"A{f(r)} {f(r)} 0 0 1 {f(x0)} {f(y1 - r)}V{f(y0 + r)}A{f(r)} {f(r)} 0 0 1 {f(x0 + r)} {f(y0)}Z")


def bar(x0, x1, y, h):
    """Horizontal bar with round ends."""
    return rrect(x0, y - h / 2, x1, y + h / 2, h / 2)


def seg(x0, y0, x1, y1, w):
    """A straight stroke with round caps, as a filled outline."""
    a = math.atan2(y1 - y0, x1 - x0)
    nx, ny = -math.sin(a) * w / 2, math.cos(a) * w / 2
    r = w / 2
    return (f"M{f(x0 + nx)} {f(y0 + ny)}L{f(x1 + nx)} {f(y1 + ny)}"
            f"A{f(r)} {f(r)} 0 0 0 {f(x1 - nx)} {f(y1 - ny)}L{f(x0 - nx)} {f(y0 - ny)}"
            f"A{f(r)} {f(r)} 0 0 0 {f(x0 + nx)} {f(y0 + ny)}Z")


def ring(cx, cy, r_out, r_in):
    """Annulus (use with fill-rule evenodd, or as its own path: inner circle drawn reversed)."""
    return (circle(cx, cy, r_out) +
            f"M{f(cx - r_in)} {f(cy)}A{f(r_in)} {f(r_in)} 0 1 1 {f(cx + r_in)} {f(cy)}"
            f"A{f(r_in)} {f(r_in)} 0 1 1 {f(cx - r_in)} {f(cy)}Z")


def el(d, fill, extra=""):
    return f'<path fill="{fill}"{extra} d="{d}"/>'


# ---------------------------------------------------------------- the kiwi mark
# A kiwi slice whose rim runs out to one forward point on the right. The point is part of the
# mark: it is never mirrored, also not in Arabic layouts. Seeds are Arabic nuqta (rhombi).
TIP = 1.27          # distance of the point from the centre, in radii (tip angle about 100 degrees)


def kiwi_outline(cx, cy, r, tip=TIP):
    d = r * tip
    th = math.acos(1 / tip)
    tx, ty = cx + d, cy
    ax, ay = cx + r * math.cos(th), cy - r * math.sin(th)
    bx, by = cx + r * math.cos(th), cy + r * math.sin(th)
    return f"M{f(tx)} {f(ty)}L{f(ax)} {f(ay)}A{f(r)} {f(r)} 0 1 0 {f(bx)} {f(by)}Z"


def kiwi_inset(cx, cy, r, w, tip=TIP):
    """The outline moved inwards by w (same point angle)."""
    return kiwi_outline(cx, cy, r - w, tip)


KIWI_FULL = dict(rim=0.075, core=(0.25, 0.155), seed_r=0.585, seed=(0.29, 0.22),
                 seeds=(30, 90, 150, 210, 270, 330))
KIWI_SMALL = dict(rim=0.09, core=(0.27, 0.17), seed_r=0.60, seed=(0.40, 0.29),
                  seeds=(45, 135, 225, 315))


def kiwi(cx, cy, r, spec=KIWI_FULL, scheme="color", ink=FOREST, rim=True):
    """Kiwi mark elements. scheme 'color' = lime flesh, forest rim and seeds, warm-white core;
    'mono' = one ink with the seeds and the core cut out (fill-rule evenodd)."""
    core = ellipse(cx, cy, r * spec["core"][0], r * spec["core"][1])
    seeds = "".join(nuqta(*pol(cx, cy, r * spec["seed_r"], a), r * spec["seed"][0], r * spec["seed"][1], a)
                    for a in spec["seeds"])
    if scheme == "mono":
        return [el(kiwi_outline(cx, cy, r) + core + seeds, ink, ' fill-rule="evenodd"')]
    out = []
    if rim:
        out.append(el(kiwi_outline(cx, cy, r), FOREST))
        out.append(el(kiwi_inset(cx, cy, r, r * spec["rim"]), LIME))
    else:
        out.append(el(kiwi_outline(cx, cy, r), LIME))
    out.append(el(core, WHITE))
    out.append(el(seeds, FOREST))
    return out


# ---------------------------------------------------------------- text to paths
class Face:
    def __init__(self, path):
        import uharfbuzz as hb
        from fontTools.ttLib import TTFont
        self.hb = hb
        self.tt = TTFont(path)
        self.tt.flavor = None
        buf = io.BytesIO()
        self.tt.save(buf)
        self.font = hb.Font(hb.Face(hb.Blob(buf.getvalue())))
        self.upem = self.tt["head"].unitsPerEm
        self.gs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()

    def shape(self, text, size, direction=None):
        hb = self.hb
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        if direction:
            buf.direction = direction
        hb.shape(self.font, buf, {"kern": True, "liga": True})
        s = size / self.upem
        x, glyphs = 0.0, []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            glyphs.append((self.order[info.codepoint], x + pos.x_offset * s, pos.y_offset * s))
            x += pos.x_advance * s
        return glyphs, s, x

    def path(self, text, size, x0, baseline, direction=None):
        from fontTools.pens.boundsPen import BoundsPen
        from fontTools.pens.svgPathPen import SVGPathPen
        from fontTools.pens.transformPen import TransformPen
        glyphs, s, width = self.shape(text, size, direction)
        pen = SVGPathPen(self.gs, ntos=f)
        bpen = BoundsPen(self.gs)
        for name, gx, gy in glyphs:
            t = (s, 0, 0, -s, x0 + gx, baseline - gy)
            self.gs[name].draw(TransformPen(pen, t))
            self.gs[name].draw(TransformPen(bpen, t))
        return pen.getCommands(), width, bpen.bounds

    def fit(self, text, size, cx, cy, direction=None):
        """Path of `text` with its ink box centred on (cx, cy). Returns (d, bounds)."""
        _, _, b = self.path(text, size, 0, 0, direction)
        x0 = cx - (b[0] + b[2]) / 2
        base = cy - (b[1] + b[3]) / 2
        d, _, b2 = self.path(text, size, x0, base, direction)
        return d, b2


FONTS = {}


def font(name):
    if name not in FONTS:
        FONTS[name] = Face(os.path.join(FONTS["_dir"], name))
    return FONTS[name]


# ---------------------------------------------------------------- app tile
TILE = 256.0
RADIUS = 0.22 * TILE        # corner radius, 22 % of the tile
SEED_C = 0.833 * TILE       # seed signature centre (x = y)
SEED = (44, 30, -45)        # nuqta length, width, angle (long axis up-right)


def tile(n, edge_px=1.0, edge=True):
    """Forest tile filling the whole n x n canvas; optional lighter edge, edge_px wide."""
    r = 0.22 * n
    if not edge:
        return [el(rrect(0, 0, n, n, r), FOREST)]
    e = edge_px
    return [el(rrect(0, 0, n, n, r), EDGE), el(rrect(e, e, n - e, n - e, r - e), FOREST)]


def seed_signature():
    return [el(nuqta(SEED_C, SEED_C, *SEED), LIME)]


# ---- full glyphs (256 grid, used from 41 px up)
def g_instafind(baa=True):
    cx, cy, ro, ri = 110.0, 110.0, 54.0, 35.0
    a = math.radians(45)
    hx0, hy0 = cx + (ro - 4) * math.cos(a), cy + (ro - 4) * math.sin(a)
    out = [el(ring(cx, cy, ro, ri), SKY), el(seg(hx0, hy0, 174, 174, 28), SKY)]
    if baa:
        # «ب» drawn by hand: a shallow bowl with the short tooth on the right, nuqta below
        bowl = (f"M{f(cx + 25)} {f(cy - 15)}V{f(cy - 3)}Q{f(cx + 25)} {f(cy + 8)} {f(cx + 14)} {f(cy + 8)}"
                f"H{f(cx - 13)}Q{f(cx - 26)} {f(cy + 8)} {f(cx - 26)} {f(cy - 6)}")
        out.append(f'<path fill="none" stroke="{SKY}" stroke-width="11" stroke-linecap="round" '
                   f'stroke-linejoin="round" d="{bowl}"/>')
        out.append(el(nuqta(cx, cy + 23, 15, 15, 90), SKY))
    return out


def bell_body(cx, top, waist_y, lip_y, half_top, half_lip):
    """Bell silhouette: dome, straight waist, flared lip (symmetric about cx)."""
    l, r = cx - half_top, cx + half_top
    L, R = cx - half_lip, cx + half_lip
    return (f"M{f(cx)} {f(top)}"
            f"C{f(cx + half_top * 0.56)} {f(top)} {f(r)} {f(top + (waist_y - top) * 0.42)} {f(r)} {f(waist_y)}"
            f"C{f(r)} {f(lip_y - (lip_y - waist_y) * 0.25)} {f(R - (R - r) * 0.1)} {f(lip_y - 2)} {f(R)} {f(lip_y)}"
            f"H{f(L)}"
            f"C{f(L + (l - L) * 0.1)} {f(lip_y - 2)} {f(l)} {f(lip_y - (lip_y - waist_y) * 0.25)} {f(l)} {f(waist_y)}"
            f"C{f(l)} {f(top + (waist_y - top) * 0.42)} {f(cx - half_top * 0.56)} {f(top)} {f(cx)} {f(top)}Z")


def g_remember():
    cx = 124.0
    body = bell_body(cx, 66, 124, 160, 44, 64)
    lip = bar(cx - 68, cx + 68, 163, 20)
    knob = circle(cx, 61, 11)
    clap = f"M{f(cx - 17)} 181A17 17 0 0 0 {f(cx + 17)} 181Z"
    return [el(body + lip + knob + clap, LAVENDER)]


def lemon_pts(cx, cy, a, b, tipk, ang, n=240):
    """Lemon outline: an ellipse with a soft nub at each end of its long axis, rotated by ang."""
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c = math.cos(t)
        x = a * c * (1 + tipk * c ** 16)
        y = b * math.sin(t) * (1 - 0.06 * c ** 2)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return pts


def g_lemon(cx=126.0, cy=116.0, a=70.0, b=50.0, tail=True, lines=2, sc=1.0):
    body = poly(lemon_pts(cx, cy, a, b, 0.21, -20))
    out = [el(body, YELLOW)]
    if tail:
        tl = (f"M{f(cx - 34 * sc)} {f(cy + 30 * sc)}C{f(cx - 34 * sc)} {f(cy + 50 * sc)} {f(cx - 44 * sc)} {f(cy + 62 * sc)} "
              f"{f(cx - 58 * sc)} {f(cy + 72 * sc)}C{f(cx - 30 * sc)} {f(cy + 70 * sc)} {f(cx - 10 * sc)} {f(cy + 58 * sc)} "
              f"{f(cx + 2 * sc)} {f(cy + 40 * sc)}Z")
        out.append(el(tl, YELLOW))
    return out


def g_lemon_full():
    out = g_lemon()
    # two message lines, right-aligned (Arabic-first), forest on yellow
    out.append(el(bar(90, 160, 104, 14) + bar(112, 160, 130, 14), FOREST))
    return out


def g_fastkiwi():
    return kiwi(116, 128, 76, rim=False)


GLYPHS = {"fastkiwi": g_fastkiwi, "instafind": g_instafind, "remember-me": g_remember,
          "lemon": g_lemon_full}


# ---- hand-tuned small glyphs, drawn on the real pixel grid (n = 16, 20, 24, 32)
def s_instafind(n):
    p = {16: (6.5, 6.5, 4.6, 2.6, 13.0, 2.6), 20: (8, 8, 5.6, 3.3, 16.0, 3.0),
         24: (9.5, 9.5, 6.6, 3.9, 19.0, 3.6), 32: (13, 13, 8.8, 5.4, 25.5, 4.6)}[n]
    cx, cy, ro, ri, he, hw = p
    a = math.radians(45)
    hx, hy = cx + (ro - 0.6) * math.cos(a), cy + (ro - 0.6) * math.sin(a)
    return [el(ring(cx, cy, ro, ri), SKY), el(seg(hx, hy, he, he, hw), SKY)]


def s_remember(n):
    k = n / 16
    cx = n / 2
    p = {16: (3.6, 8.0, 10.6, 2.8, 5.0, 11.8, 1.7, 1.2, 13.0, 1.9),
         20: (4.2, 10.0, 13.4, 3.6, 6.4, 14.6, 2.0, 1.4, 16.2, 2.4),
         24: (5.0, 12.0, 16.0, 4.4, 7.6, 17.6, 2.4, 1.6, 19.4, 2.8),
         32: (6.2, 15.6, 21.6, 5.8, 10.2, 23.6, 3.0, 2.0, 25.8, 3.6)}[n]
    top, waist, lip, ht, hl, lipy, liph, knr, clapy, clr = p
    body = bell_body(cx, top, waist, lip, ht, hl)
    lipb = bar(cx - hl - 0.4 * k, cx + hl + 0.4 * k, lipy, liph)
    knob = circle(cx, top - knr * 0.2, knr)
    clap = f"M{f(cx - clr)} {f(clapy)}A{f(clr)} {f(clr)} 0 0 0 {f(cx + clr)} {f(clapy)}Z"
    return [el(body + lipb + knob + clap, LAVENDER)]


def s_lemon(n):
    s = n / 256
    p = {16: (8.2, 7.2, 5.6, 4.1, 0.05), 20: (10.2, 9.0, 7.0, 5.1, 0.06),
         24: (12.3, 10.8, 8.4, 6.1, 0.065), 32: (16.4, 14.3, 11.2, 8.2, 0.07)}[n]
    cx, cy, a, b, _ = p
    out = g_lemon(cx, cy, a, b, tail=True, sc=a / 70.0)
    if n >= 24:
        w = 1.9 if n == 24 else 2.4
        out.append(el(bar(cx - a * 0.45, cx + a * 0.5, cy - b * 0.24, w) +
                      bar(cx - a * 0.1, cx + a * 0.5, cy + b * 0.32, w), FOREST))
    elif n == 20:
        out.append(el(bar(cx - 3.0, cx + 3.6, cy, 1.6), FOREST))
    return out


def s_fastkiwi(n):
    p = {16: (7.4, 8.0, 5.6), 20: (9.2, 10.0, 7.0), 24: (11.1, 12.0, 8.4), 32: (14.8, 16.0, 11.2)}[n]
    cx, cy, r = p
    spec = dict(KIWI_SMALL)
    if n == 16:
        spec = dict(core=(0.30, 0.20), seed_r=0.60, seed=(0.46, 0.36), seeds=(60, 180, 300), rim=0)
    elif n == 20:
        spec = dict(core=(0.28, 0.18), seed_r=0.60, seed=(0.42, 0.31), seeds=(45, 135, 225, 315), rim=0)
    return kiwi(cx, cy, r, spec, rim=False)


SMALL = {"fastkiwi": s_fastkiwi, "instafind": s_instafind, "remember-me": s_remember,
         "lemon": s_lemon}
SMALL_SIZES = (16, 20, 24, 32)


# ---------------------------------------------------------------- SVG documents
def svg(w, h, body, title, vb=None):
    vb = vb or f"0 0 {f(w)} {f(h)}"
    return "\n".join([f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{f(w)}" height="{f(h)}" '
                      f'role="img" aria-label="{title}">', f"<title>{title}</title>"] + body + ["</svg>"]) + "\n"


def icon_svg(app, size=256, edge=True):
    """The icon as drawn for `size` px: hand-tuned grid up to 40 px, full master above."""
    if app in insta.APPS:  # InstaWords, InstaConvert: InstaFind-style icons (D-049)
        return insta.icon_svg(app, size)
    if size <= 40:
        grid = 16 if size <= 17 else 20 if size <= 21 else 24 if size <= 27 else 32
        els = tile(grid, edge_px=grid / size, edge=edge) + SMALL[app](grid)
    else:
        grid = TILE
        els = tile(TILE, edge_px=TILE / size, edge=edge) + GLYPHS[app]()
        if app != "fastkiwi":
            els += seed_signature()
    return svg(size, size, els, APPS[app][0], vb=f"0 0 {f(grid)} {f(grid)}")


# ---------------------------------------------------------------- lockups
R = 100.0                 # kiwi radius in lockup units
D = 2 * R                 # mark height
CLEAR = D / 4             # clear space: a quarter of the mark height
CAP_H = 0.5 * D           # Latin cap height = half the mark height
GAP = 0.30 * D            # point of the kiwi to the wordmark


def lockup_latin(scheme="color", reversed_=False):
    """'FastKiwi': mark left, wordmark right. scheme: color | mono-forest | mono-white."""
    plex = font("IBMPlexSans-SemiBold.woff")
    size = CAP_H / 0.698
    cx, cy = R, R
    x_text = cx + R * TIP + GAP
    base = cy + CAP_H / 2
    d1, w1, b1 = plex.path("Fast", size, x_text, base)
    d2, w2, b2 = plex.path("Kiwi", size, x_text + w1, base)
    if scheme == "color":
        c1, c2 = (WHITE, LIME) if reversed_ else (FOREST, LEAF)
        mark = kiwi(cx, cy, R)
    else:
        ink = FOREST if scheme == "mono-forest" else WHITE
        c1 = c2 = ink
        mark = kiwi(cx, cy, R, scheme="mono", ink=ink)
    x1 = max(b2[2], b1[2])
    vx0, vy0, vx1, vy1 = -CLEAR, -CLEAR, x1 + CLEAR, D + CLEAR
    bg = [el(rrect(vx0, vy0, vx1, vy1, 0), FOREST)] if reversed_ else []
    body = bg + mark + [el(d1, c1), el(d2, c2)]
    return svg(vx1 - vx0, vy1 - vy0, body, "FastKiwi", vb=f"{f(vx0)} {f(vy0)} {f(vx1 - vx0)} {f(vy1 - vy0)}")


def lockup_arabic(scheme="color", reversed_=False):
    """«فاست كيوي»: mark on the right (where Arabic reading starts), wordmark to its left.
    The kiwi's point still faces right: the mark is never mirrored."""
    ar = font("IBMPlexSansArabic-SemiBold.woff")
    size = CAP_H / 0.698 * 1.02
    cx, cy = 0.0, R
    x_right = cx - R - GAP * 0.8
    _, w_a, _ = ar.path("فاست", size, 0, 0, "rtl")
    _, w_sp, _ = ar.path(" ", size, 0, 0, "rtl")
    _, w_b, _ = ar.path("كيوي", size, 0, 0, "rtl")
    xa = x_right - w_a
    xb = xa - w_sp - w_b
    d_a, _, b_a = ar.path("فاست", size, xa, 0, "rtl")
    d_b, _, b_b = ar.path("كيوي", size, xb, 0, "rtl")
    # put the ink on the optical centre line of the mark (letter bodies, not the descenders)
    top, bot = min(b_a[1], b_b[1]), max(b_a[3], b_b[3])
    base = cy + (-(top + bot) / 2) + 0.06 * D
    d_a, _, b_a = ar.path("فاست", size, xa, base, "rtl")
    d_b, _, b_b = ar.path("كيوي", size, xb, base, "rtl")
    if scheme == "color":
        c1, c2 = (WHITE, LIME) if reversed_ else (FOREST, LEAF)
        mark = kiwi(cx, cy, R)
    else:
        ink = FOREST if scheme == "mono-forest" else WHITE
        c1 = c2 = ink
        mark = kiwi(cx, cy, R, scheme="mono", ink=ink)
    vx0 = min(b_a[0], b_b[0]) - CLEAR
    vx1 = cx + R * TIP + CLEAR
    vy0 = min(-CLEAR, min(b_a[1], b_b[1]) - CLEAR * 0.5)
    vy1 = max(D + CLEAR, max(b_a[3], b_b[3]) + CLEAR * 0.5)
    bg = [el(rrect(vx0, vy0, vx1, vy1, 0), FOREST)] if reversed_ else []
    body = bg + mark + [el(d_a, c1), el(d_b, c2)]
    return svg(vx1 - vx0, vy1 - vy0, body, "فاست كيوي", vb=f"{f(vx0)} {f(vy0)} {f(vx1 - vx0)} {f(vy1 - vy0)}")


def mark_svg(scheme="color", small=False):
    spec = KIWI_SMALL if small else KIWI_FULL
    pad = 0.06 * R
    x0, y0 = -R - pad, -R - pad
    w = R + R * TIP + 2 * pad
    h = 2 * R + 2 * pad
    if scheme == "color":
        els = kiwi(0, 0, R, spec)
    else:
        els = kiwi(0, 0, R, spec, scheme="mono", ink=FOREST if scheme == "mono-forest" else WHITE)
    return svg(w, h, els, "FastKiwi", vb=f"{f(x0)} {f(y0)} {f(w)} {f(h)}")


# ---------------------------------------------------------------- write everything
def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def main(fonts_dir, out):
    FONTS["_dir"] = fonts_dir
    lg = os.path.join(out, "logo")
    write(os.path.join(lg, "mark.svg"), mark_svg())
    write(os.path.join(lg, "mark-small.svg"), mark_svg(small=True))
    write(os.path.join(lg, "mark-mono-forest.svg"), mark_svg("mono-forest"))
    write(os.path.join(lg, "mark-mono-white.svg"), mark_svg("mono-white"))
    for name, fn in (("latin", lockup_latin), ("arabic", lockup_arabic)):
        write(os.path.join(lg, f"fastkiwi-{name}.svg"), fn())
        write(os.path.join(lg, f"fastkiwi-{name}-on-forest.svg"), fn(reversed_=True))
        write(os.path.join(lg, f"fastkiwi-{name}-mono-forest.svg"), fn("mono-forest"))
        write(os.path.join(lg, f"fastkiwi-{name}-mono-white.svg"), fn("mono-white"))
    for app in APPS:
        d = os.path.join(out, "icons", app)
        # D-049 apps: <app>.svg is the approved 1024 master (insta.py)
        write(os.path.join(d, f"{app}.svg"), insta.master_svg(app) if app in insta.APPS else icon_svg(app, 256))
        for n in SMALL_SIZES:
            write(os.path.join(d, f"{app}-{n}.svg"), icon_svg(app, n))
    print("svg ok")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
