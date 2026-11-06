"""
The InstaWords icon (the pen nib writing a stroke), rasterized from windows/branding/instawords.svg
with Pillow alone, so the output is the same on every machine (no SVG renderer or native library).
Used by make-icons.py (the .ico and the in-app logo) and ../packaging/msix/make-assets.py.

instawords.svg is the master (64 x 64 viewBox) and the same file as site/icon.svg, the web app
icon. Edit it here, copy it to site/icon.svg, and run both scripts again.

Three looks:
  plated         the SVG as drawn: the green gradient tile, the white nib, the lime stroke;
  unplated       the taskbar glyph for a dark taskbar (Windows 11 style, no tile): the nib and the
                 stroke alone, framed on their own bounds; the nib's slit and hole (drawn in the
                 tile colour) become real holes. White nib, lime stroke;
  lightunplated  the same for a light taskbar: teal nib #0F766E, green stroke #3F8A1C.

Only the SVG features the master uses are supported: <rect rx>, <circle>, <path d> (M L H V C S Q Z
and their relative forms), <g transform="rotate(a cx cy)">, fill colours and one objectBoundingBox
<linearGradient>, and strokes with round caps (round joins between segments).
"""
import io
import math
import os
import re
import struct
import xml.etree.ElementTree as ET

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(HERE, "instawords.svg")
NS = "{http://www.w3.org/2000/svg}"

HOLE = "hole"
LOOKS = {
    # colour in the SVG -> colour in this look (HOLE: cut out of what is under it)
    "unplated": {"#ffffff": "#ffffff", "#d9f99d": "#d9f99d", "#0f766e": HOLE},
    "lightunplated": {"#ffffff": "#0f766e", "#d9f99d": "#3f8a1c", "#0f766e": HOLE},
}
UNPLATED_FILL = 0.92  # the glyph's longer side, as a share of the canvas
WRITING = "#d9f99d"   # the written stroke: kept at least MIN_WRITING_PX wide at small sizes
MIN_WRITING_PX = 1.2  # (3.6 units is 0.9 px at 16 px; only 16-20 px plated and 16 px unplated change)
HINT_UP_TO = 32       # sizes up to this are pixel-aligned (see hint)


# ---------------------------------------------------------------- SVG geometry
def _tokens(d):
    for m in re.finditer(r"([A-Za-z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)", d):
        yield m.group(1) or float(m.group(2))


def _cubic(p0, p1, p2, p3, steps=48):
    out = []
    for k in range(1, steps + 1):
        t = k / steps
        u = 1 - t
        out.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return out


def flatten(d):
    """An SVG path as [(points, closed)] subpaths, in user units."""
    toks = list(_tokens(d))
    i, cmd, prev = 0, None, None
    subs, cur, closed = [], [], False
    x = y = sx = sy = 0.0
    c2 = None  # the last cubic control point, for S

    def take(n):
        nonlocal i
        v = toks[i:i + n]
        if len(v) != n or any(isinstance(t, str) for t in v):
            raise ValueError(f"bad path data near token {i}: {d!r}")
        i += n
        return v

    while i < len(toks):
        if isinstance(toks[i], str):
            cmd = toks[i]
            i += 1
        rel = cmd.islower()
        c = cmd.upper()
        ox, oy = (x, y) if rel else (0.0, 0.0)
        if c == "M":
            if len(cur) > 1:
                subs.append((cur, closed))
            px, py = take(2)
            x, y = ox + px, oy + py
            sx, sy, cur, closed = x, y, [(x, y)], False
            cmd = "l" if rel else "L"
        elif c == "L":
            px, py = take(2)
            x, y = ox + px, oy + py
            cur.append((x, y))
        elif c == "H":
            (px,) = take(1)
            x = ox + px
            cur.append((x, y))
        elif c == "V":
            (py,) = take(1)
            y = oy + py
            cur.append((x, y))
        elif c in "CS":
            if c == "C":
                ax, ay, bx, by, ex, ey = take(6)
                a = (ox + ax, oy + ay)
            else:
                bx, by, ex, ey = take(4)
                a = (2 * x - c2[0], 2 * y - c2[1]) if prev in ("C", "S") else (x, y)
            b = (ox + bx, oy + by)
            e = (ox + ex, oy + ey)
            cur += _cubic((x, y), a, b, e)
            c2, (x, y) = b, e
        elif c == "Q":
            qx, qy, ex, ey = take(4)
            q, e = (ox + qx, oy + qy), (ox + ex, oy + ey)
            cur += _cubic((x, y), (x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y)),
                          (e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1])), e)
            x, y = e
        elif c == "Z":
            if len(cur) > 1:
                subs.append((cur, True))
            cur, closed = [(sx, sy)], False
            x, y = sx, sy
        else:
            raise ValueError(f"unsupported SVG path command {cmd!r}")
        prev = c
    if len(cur) > 1:
        subs.append((cur, closed))
    return subs


def _circle(cx, cy, r, steps=None):
    steps = steps or max(24, min(96, int(r * 12)))
    return [(cx + r * math.cos(2 * math.pi * k / steps), cy + r * math.sin(2 * math.pi * k / steps))
            for k in range(steps)]


def _area(poly):
    return sum(ax * by - bx * ay for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1])) / 2


def _oriented(poly):
    """The polygon wound one fixed way, so that nonzero filling of several is their union."""
    return poly if _area(poly) > 0 else poly[::-1]


def _rrect(x, y, w, h, r, steps=24):
    pts = []
    for cx, cy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for k in range(steps + 1):
            a = math.radians(a0 + 90 * k / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def stroke_polys(subs, width, cap, join):
    """A stroke as polygons whose nonzero union is the stroked area (round caps and joins)."""
    if cap != "round" or (join != "round" and any(len(pts) > 2 or closed for pts, closed in subs)):
        raise ValueError("only strokes with round caps, and round joins between segments, are supported")
    r = width / 2
    polys = []
    for pts, closed in subs:
        seq = pts + pts[:1] if closed else pts
        for (ax, ay), (bx, by) in zip(seq, seq[1:]):
            L = math.hypot(bx - ax, by - ay)
            if L == 0:
                continue
            nx, ny = -(by - ay) / L * r, (bx - ax) / L * r
            polys.append(_oriented([(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]))
        for px, py in seq:
            polys.append(_oriented(_circle(px, py, r)))
    return polys


def _rotate(polys, a, cx, cy):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    return [[(cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c) for px, py in poly]
            for poly in polys]


def _transform(tf):
    m = re.fullmatch(r"\s*rotate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+)[\s,]+([-\d.]+))?\s*\)\s*", tf or "")
    if not m:
        raise ValueError(f"unsupported transform {tf!r}")
    return float(m.group(1)), float(m.group(2) or 0), float(m.group(3) or 0)


def load(path=MASTER, min_writing=0.0):
    """The master as (viewBox size, gradients, shapes). A shape: dict(kind, paint, polys, bbox).
    min_writing: the least width of the written stroke, in user units."""
    root = ET.parse(path).getroot()
    vb = [float(v) for v in root.get("viewBox").split()]
    assert vb[:2] == [0, 0] and vb[2] == vb[3], "square viewBox from 0 0 expected"
    grads = {}
    for g in root.iter(NS + "linearGradient"):
        stops = [(float(s.get("offset")), s.get("stop-color").lower()) for s in g.findall(NS + "stop")]
        grads[g.get("id")] = tuple(float(g.get(k, d)) for k, d in (("x1", 0), ("y1", 0), ("x2", 1), ("y2", 0))), stops
    shapes = []

    def walk(el, rot):
        for ch in el:
            tag = ch.tag[len(NS):]
            if tag == "defs":
                continue
            if tag == "g":
                walk(ch, rot + [_transform(ch.get("transform"))] if ch.get("transform") else rot)
                continue
            fill, stroke = (ch.get(k, d) for k, d in (("fill", "#000000"), ("stroke", "none")))
            fill, stroke = (v if v.startswith("url(") else v.lower() for v in (fill, stroke))
            if tag == "rect":
                x, y = float(ch.get("x", 0)), float(ch.get("y", 0))
                w, h, r = float(ch.get("width")), float(ch.get("height")), float(ch.get("rx", 0))
                fills = [[(x, y), (x + w, y), (x + w, y + h), (x, y + h)] if r == 0 else _rrect(x, y, w, h, r)]
                bbox = (x, y, w, h)
            elif tag == "circle":
                fills = [_circle(float(ch.get("cx")), float(ch.get("cy")), float(ch.get("r")))]
                bbox = None
            elif tag == "path":
                subs = flatten(ch.get("d"))
                fills = [pts for pts, _ in subs if len(pts) > 2]
                bbox = None
            else:
                raise ValueError(f"unsupported SVG element <{tag}>")
            out = []
            if fill != "none" and fills:  # an open line ("M38 27 V42") has no area to fill
                out.append(dict(kind=tag, paint=fill, polys=fills, bbox=bbox))
            if stroke != "none":
                subs = flatten(ch.get("d")) if tag == "path" else [(fills[0], True)]
                width = float(ch.get("stroke-width", 1))
                if stroke == WRITING:
                    width = max(width, min_writing)
                out.append(dict(kind="stroke", paint=stroke, bbox=None, polys=stroke_polys(
                    subs, width, ch.get("stroke-linecap", "butt"),
                    ch.get("stroke-linejoin", "miter"))))
            for s in out:
                for a, cx, cy in reversed(rot):
                    s["polys"] = _rotate(s["polys"], a, cx, cy)
                shapes.append(s)

    walk(root, [])
    return vb[2], grads, shapes


# ---------------------------------------------------------------- rasterizer
def coverage(polys, size, origin, span, ss):
    """The polygons' nonzero coverage as a size x size "L" mask, ss x ss samples per pixel."""
    n = size * ss
    k = n / span
    edges = []  # (y0, y1, x at y0, dx/dy, winding)
    for poly in polys:
        pts = [((px - origin[0]) * k, (py - origin[1]) * k) for px, py in poly]
        for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
            if ay == by:
                continue
            w = 1 if by > ay else -1
            if ay > by:
                ax, ay, bx, by = bx, by, ax, ay
            edges.append((ay, by, ax, (bx - ax) / (by - ay), w))
    buf = bytearray(n * n)
    edges.sort()
    active, nxt = [], 0
    for row in range(n):
        yc = row + 0.5
        while nxt < len(edges) and edges[nxt][0] <= yc:
            active.append(edges[nxt])
            nxt += 1
        active = [e for e in active if e[1] > yc]
        if not active:
            if nxt >= len(edges):
                break
            continue
        xs = sorted((e[2] + (yc - e[0]) * e[3], e[4]) for e in active if e[0] <= yc)
        wind, start, base = 0, 0.0, row * n
        for xv, w in xs:
            was = wind != 0
            wind += w
            if not was and wind != 0:
                start = xv
            elif was and wind == 0:
                x0, x1 = max(0, math.ceil(start - 0.5)), min(n, math.ceil(xv - 0.5))
                if x1 > x0:
                    buf[base + x0:base + x1] = b"\xff" * (x1 - x0)
    return Image.frombytes("L", (n, n), bytes(buf)).reduce(ss)


def f(v):
    """A number for SVG or XAML markup: at most two decimals, no trailing zeros."""
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def _gradient(spec, bbox, size, origin, span):
    """An objectBoundingBox linear gradient over the whole canvas (two stops)."""
    (x1, y1, x2, y2), stops = spec
    assert len(stops) == 2 and stops[0][0] == 0 and stops[1][0] == 1, "two stops at 0 and 1 expected"
    a, b = rgb(stops[0][1]), rgb(stops[1][1])
    bx, by, bw, bh = bbox
    dx, dy = x2 - x1, y2 - y1
    dd = dx * dx + dy * dy
    img = Image.new("RGB", (size, size))
    px = img.load()
    for j in range(size):
        v = ((origin[1] + (j + 0.5) * span / size) - by) / bh
        for i in range(size):
            u = ((origin[0] + (i + 0.5) * span / size) - bx) / bw
            t = min(1.0, max(0.0, ((u - x1) * dx + (v - y1) * dy) / dd))
            px[i, j] = tuple(round(a[c] + (b[c] - a[c]) * t) for c in range(3))
    return img


def bounds(shapes):
    xs = [p[0] for s in shapes for poly in s["polys"] for p in poly]
    ys = [p[1] for s in shapes for poly in s["polys"] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def _blur(mask):
    """How much of a coverage mask is partly covered (0 when every pixel is fully in or out)."""
    return sum(v * (255 - v) for v in mask.tobytes())


def hint(shapes, size, origin, span):
    """Pixel alignment for small sizes: the glyph's offset, within half a pixel either way, in
    eighths of a pixel, that leaves the fewest blurred edge pixels. The glyph (nib and stroke)
    moves as one, so its drawing is unchanged; the tile never moves."""
    if size > HINT_UP_TO:
        return 0.0, 0.0
    k = span / size
    best = None
    for j in range(-4, 5):
        for i in range(-4, 5):
            o = (origin[0] - i / 8 * k, origin[1] - j / 8 * k)
            score = sum(_blur(coverage(s["polys"], size, o, span, 8)) for s in shapes)
            key = (score, abs(i) + abs(j), j, i)  # ties: the smallest move, then a fixed order
            if best is None or key < best[0]:
                best = (key, (i / 8 * k, j / 8 * k))
    return best[1]


def render(size, look="plated", master=MASTER):
    """The icon as a size x size RGBA image."""
    vb, grads, shapes = load(master)
    ss = max(4, min(16, 2048 // size))
    plate = look == "plated"
    if plate:
        origin, span = (0.0, 0.0), vb
    else:
        # Framed on the glyph's own bounds as drawn in the master, so the frame is the same at every size.
        cmap = LOOKS[look]
        x0, y0, x1, y1 = bounds([s for s in shapes if cmap.get(s["paint"]) not in (None, HOLE)])
        span = max(x1 - x0, y1 - y0) / UNPLATED_FILL
        origin = ((x0 + x1 - span) / 2, (y0 + y1 - span) / 2)
    _, _, shapes = load(master, MIN_WRITING_PX * span / size)
    tile = [s for s in shapes if s["paint"].startswith("url(")]
    glyph = [s for s in shapes if not s["paint"].startswith("url(")]
    if not plate:  # no tile; the nib's details in the tile colour become holes
        tile, glyph = [], [dict(s, paint=cmap[s["paint"]]) for s in glyph]
    dx, dy = hint(glyph, size, origin, span)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for s in tile + glyph:
        o = origin if s in tile else (origin[0] - dx, origin[1] - dy)
        cov = coverage(s["polys"], size, o, span, ss)
        if s["paint"] == HOLE:
            img.putalpha(Image.composite(Image.new("L", img.size, 0), img.getchannel("A"), cov))
            continue
        m = re.fullmatch(r"url\(#(.+)\)", s["paint"])
        layer = (_gradient(grads[m.group(1)], s["bbox"], size, o, span) if m
                 else Image.new("RGB", (size, size), rgb(s["paint"]))).convert("RGBA")
        layer.putalpha(cov)
        img = Image.alpha_composite(img, layer)
    return img


# ---------------------------------------------------------------- ICO
def _bmp_entry(img):
    """32-bit BGRA DIB with an AND mask: readable by every Windows version and resource tool."""
    w, h = img.size
    px = img.tobytes("raw", "BGRA")
    rows = [px[y * w * 4:(y + 1) * w * 4] for y in range(h)][::-1]
    stride = ((w + 31) // 32) * 4
    alpha = img.getchannel("A").tobytes()
    mask = b""
    for y in range(h - 1, -1, -1):
        bits = bytearray(stride)
        for x in range(w):
            if alpha[y * w + x] == 0:
                bits[x // 8] |= 0x80 >> (x % 8)
        mask += bytes(bits)
    hdr = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(px) + len(mask), 0, 0, 0, 0)
    return hdr + b"".join(rows) + mask


def ico_bytes(images):
    """A .ico from square RGBA images: BMP frames below 256 px, PNG at 256."""
    entries = []
    for img in images:
        s = img.width
        if s >= 256:
            b = io.BytesIO()
            img.save(b, "PNG", optimize=True)
            data = b.getvalue()
        else:
            data = _bmp_entry(img)
        entries.append((s, data))
    out = struct.pack("<HHH", 0, 1, len(entries))
    off = 6 + 16 * len(entries)
    blobs = b""
    for s, data in entries:
        out += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), off + len(blobs))
        blobs += data
    return out + blobs
