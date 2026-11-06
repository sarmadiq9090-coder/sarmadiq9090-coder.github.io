"""FastKiwi brand v2: PNG, ICO and MSIX exports, and the preview sheet.

Usage:  python3 export.py <fonts-dir> <brand-dir> <work-dir> [<owner-kit-dir>]

Run gen.py first. Needs fonttools, uharfbuzz, cairosvg and Pillow. <work-dir> is scratch space
(one converted font file). <owner-kit-dir> is the owner's AI-generated reference kit; it is only
used for the comparison strip in preview.png and is never copied into brand/.
"""
import io
import re
import os
import struct
import sys

import cairosvg
from PIL import Image, ImageChops, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen  # noqa: E402

FONTS, OUT, WORK = sys.argv[1], sys.argv[2], sys.argv[3]
KIT = sys.argv[4] if len(sys.argv) > 4 else None
gen.FONTS["_dir"] = FONTS
os.makedirs(WORK, exist_ok=True)

PNG_SIZES = (16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512)
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 96, 128, 256)
SCALES = (100, 125, 150, 200, 400)
TARGET_SIZES = (16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256)


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def raster(svg_text, w, h=None):
    data = cairosvg.svg2png(bytestring=svg_text.encode("utf-8"), output_width=w, output_height=h or w)
    return Image.open(io.BytesIO(data)).convert("RGBA")


def raster_file(path, w=None, h=None):
    kw = {}
    if w:
        kw["output_width"] = w
    if h:
        kw["output_height"] = h
    return Image.open(io.BytesIO(cairosvg.svg2png(url=path, **kw))).convert("RGBA")


def icon(app, size, edge=True):
    return raster(gen.icon_svg(app, size, edge=edge), size)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


# ---------------------------------------------------------------- ICO
def bmp_entry(img):
    """32-bit BGRA DIB with an AND mask: readable by every Windows version and resource tool."""
    w, h = img.size
    px = img.tobytes("raw", "BGRA")
    rows = [px[y * w * 4:(y + 1) * w * 4] for y in range(h)][::-1]
    mask_stride = ((w + 31) // 32) * 4
    alpha = img.getchannel("A").tobytes()
    mask = b""
    for y in range(h - 1, -1, -1):
        bits = bytearray(mask_stride)
        for x in range(w):
            if alpha[y * w + x] == 0:
                bits[x // 8] |= 0x80 >> (x % 8)
        mask += bytes(bits)
    hdr = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(px) + len(mask), 0, 0, 0, 0)
    return hdr + b"".join(rows) + mask


def write_ico(app, path):
    entries = []
    for s in ICO_SIZES:
        img = icon(app, s)
        if s >= 256:
            b = io.BytesIO()
            img.save(b, "PNG", optimize=True)
            data = b.getvalue()
        else:
            data = bmp_entry(img)
        entries.append((s, data))
    out = struct.pack("<HHH", 0, 1, len(entries))
    off = 6 + 16 * len(entries)
    blobs = b""
    for s, data in entries:
        out += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), off + len(blobs))
        blobs += data
    with open(path, "wb") as fh:
        fh.write(out + blobs)


# ---------------------------------------------------------------- MSIX
def canvas(app, w, h, icon_px, dy=0):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ic = icon(app, icon_px)
    img.alpha_composite(ic, ((w - icon_px) // 2, (h - icon_px) // 2 - dy))
    return img


# ---------------------------------------------------------------- unplated (taskbar) glyphs
# The taskbar shows the symbol alone, without the tile (Windows 11 unplated style). Forest details
# inside a glyph (seeds, lemon lines, cheque bars, table gaps) become real holes. On a light
# taskbar the pastel accents are too faint (1.3-1.8:1), so altform-lightunplated uses ink tones.
INK = {gen.LIME: gen.LEAF, gen.SKY: "#0073B3", gen.LAVENDER: "#754AFF", gen.YELLOW: "#8A6A00",
       gen.CORAL: "#D03400", gen.MINT: "#167D5B"}
CROP = 200.0  # full glyphs: the middle 200 of the 256 grid fills the canvas


def glyph(app, size, light=False):
    if size <= 40:
        grid = 16 if size <= 17 else 20 if size <= 21 else 24 if size <= 27 else 32
        els, vb = gen.SMALL[app](grid), f"0 0 {grid} {grid}"
    else:
        o = (gen.TILE - CROP) / 2
        els, vb = gen.GLYPHS[app](), f"{gen.f(o)} {gen.f(o)} {gen.f(CROP)} {gen.f(CROP)}"
    body = "\n".join(els)
    if light:
        for a, ink in INK.items():
            body = body.replace(f'"{a}"', f'"{ink}"')
    mask = re.sub(r'"#[0-9A-Fa-f]{6}"', lambda m: '"#000000"' if m.group(0) == f'"{gen.FOREST}"' else '"#FFFFFF"', body)
    color = raster(gen.svg(size, size, [body], gen.APPS[app][0], vb=vb), size)
    alpha = raster(gen.svg(size, size, [f'<rect x="-999" y="-999" width="3000" height="3000" fill="#000000"/>', mask],
                           "mask", vb=vb), size).convert("L")
    out = color.copy()
    out.putalpha(ImageChops.multiply(color.getchannel("A"), alpha))
    return out


def msix(app, d):
    n = 0
    for s in SCALES:
        k = s / 100
        save(icon(app, round(44 * k)), os.path.join(d, f"Square44x44Logo.scale-{s}.png"))
        t = round(150 * k)
        save(canvas(app, t, t, round(t * 0.5), dy=round(t * 0.05)), os.path.join(d, f"Square150x150Logo.scale-{s}.png"))
        w, h = round(310 * k), round(150 * k)
        save(canvas(app, w, h, round(h * 0.5), dy=round(h * 0.05)), os.path.join(d, f"Wide310x150Logo.scale-{s}.png"))
        save(icon(app, round(50 * k)), os.path.join(d, f"StoreLogo.scale-{s}.png"))
        n += 4
    for ts in TARGET_SIZES:
        # plated (Start, app list): the tile; unplated (taskbar): the symbol alone, ink tones on light
        save(icon(app, ts), os.path.join(d, f"Square44x44Logo.targetsize-{ts}.png"))
        save(glyph(app, ts), os.path.join(d, f"Square44x44Logo.targetsize-{ts}_altform-unplated.png"))
        save(glyph(app, ts, light=True), os.path.join(d, f"Square44x44Logo.targetsize-{ts}_altform-lightunplated.png"))
        n += 3
    return n


# ---------------------------------------------------------------- exports
def exports():
    total = 0
    for app in gen.APPS:
        d = os.path.join(OUT, "icons", app)
        for s in PNG_SIZES:
            save(icon(app, s), os.path.join(d, "png", f"{app}-{s}.png"))
            total += 1
        write_ico(app, os.path.join(d, f"{app}.ico"))
        total += 1 + msix(app, os.path.join(d, "msix"))
    lg = os.path.join(OUT, "logo")
    for name in sorted(os.listdir(lg)):
        if not name.endswith(".svg"):
            continue
        p = os.path.join(lg, name)
        stem = name[:-4]
        if stem.startswith("mark"):
            for s in (64, 512):
                save(raster_file(p, h=s), os.path.join(lg, "png", f"{stem}-{s}.png"))
                total += 1
        else:
            save(raster_file(p, w=1600), os.path.join(lg, "png", f"{stem}-1600.png"))
            total += 1
    print("exported", total, "files")


# ---------------------------------------------------------------- preview
def ttf(name):
    from fontTools.ttLib import TTFont
    p = os.path.join(WORK, name.replace(".woff", ".ttf"))
    if not os.path.exists(p):
        t = TTFont(os.path.join(FONTS, name))
        t.flavor = None
        t.save(p)
    return p


FONT = None


def font(px):
    return ImageFont.truetype(FONT, px)


DARK = rgb("#202020")
LIGHT = rgb("#F3F3F3")
WARM = rgb(gen.WHITE)
FOREST = rgb(gen.FOREST)
MUTED_D = (0xA8, 0xB0, 0xAA)
MUTED_L = (0x4A, 0x5A, 0x4F)


def preview():
    global FONT
    FONT = ttf("IBMPlexSansArabic-SemiBold.woff")
    W, M = 2400, 60
    sheet = Image.new("RGB", (W, 6000), WARM)
    dr = ImageDraw.Draw(sheet)

    def text(s, x, y, px=24, fill=FOREST, rtl=False, anchor="la"):
        kw = {"direction": "rtl", "language": "ar"} if rtl else {}
        dr.text((x, y), s, font=font(px), fill=fill, anchor=anchor, **kw)

    def fit(img, box):
        x0, y0, x1, y1 = box
        im = img.copy()
        im.thumbnail((x1 - x0, y1 - y0), Image.LANCZOS)
        sheet.paste(im, (x0 + (x1 - x0 - im.width) // 2, y0 + (y1 - y0 - im.height) // 2), im)

    y = M
    text("FastKiwi brand v2  -  vector masters", M, y, 46)
    text("Small apps. A smoother workday.   /   Nothing slips silently.", M, y + 66, 26, rgb(gen.LEAF))
    text("برامج صغيرة، يوم عمل أسهل.   /   لا شيء يضيع بصمت.", W - M, y + 66, 26, rgb(gen.LEAF), rtl=True, anchor="ra")
    y += 140

    # 1. lockups on light and on forest
    lg = os.path.join(OUT, "logo")
    half = (W - 3 * M) // 2
    fit(raster_file(os.path.join(lg, "fastkiwi-latin.svg"), w=1100), (M, y, M + half, y + 260))
    fit(raster_file(os.path.join(lg, "fastkiwi-arabic.svg"), w=1100), (2 * M + half, y, W - M, y + 260))
    y += 280
    fit(raster_file(os.path.join(lg, "fastkiwi-latin-on-forest.svg"), w=1100), (M, y, M + half, y + 260))
    fit(raster_file(os.path.join(lg, "fastkiwi-arabic-on-forest.svg"), w=1100), (2 * M + half, y, W - M, y + 260))
    y += 290
    # one-colour row: forest on light, white on dark
    dr.rectangle((W // 2, y - 10, W, y + 240), fill=DARK)
    fit(raster_file(os.path.join(lg, "fastkiwi-latin-mono-forest.svg"), w=800), (M, y, M + 560, y + 200))
    fit(raster_file(os.path.join(lg, "mark-mono-forest.svg"), h=200), (M + 600, y + 20, M + 800, y + 180))
    fit(raster_file(os.path.join(lg, "mark.svg"), h=200), (M + 850, y + 20, M + 1050, y + 180))
    fit(raster_file(os.path.join(lg, "fastkiwi-arabic-mono-white.svg"), w=800), (W // 2 + 40, y, W // 2 + 640, y + 200))
    fit(raster_file(os.path.join(lg, "mark-mono-white.svg"), h=200), (W // 2 + 680, y + 20, W // 2 + 880, y + 180))
    fit(raster_file(os.path.join(lg, "mark.svg"), h=200), (W // 2 + 930, y + 20, W // 2 + 1130, y + 180))
    text("one-colour forest  /  colour mark on light", M, y + 200, 18, MUTED_L)
    text("one-colour white  /  colour mark on dark", W // 2 + 40, y + 200, 18, MUTED_D)
    y += 260

    # 2. icons at 16/24/32/48/256 on dark (#202020) and light (#F3F3F3)
    sizes = (16, 24, 32, 48, 256)
    for bg, fg, label in ((DARK, MUTED_D, "Windows dark  #202020"), (LIGHT, MUTED_L, "Windows light  #F3F3F3")):
        top = y
        block_h = 90 + 2 * 300
        dr.rectangle((0, top, W, top + block_h), fill=bg)
        text(label + "   (actual size; underneath: 16 / 24 / 32 shown 4x)", M, top + 14, 22, fg)
        for i, app in enumerate(gen.APPS):
            col_x = M + (i % 3) * ((W - 2 * M) // 3)
            row_y = top + 90 + (i // 3) * 300
            xx = col_x
            for s in sizes:
                im = icon(app, s)
                if s == 256:
                    im = im.resize((128, 128), Image.LANCZOS)
                    sheet.paste(im, (xx, row_y), im)
                    xx += 128 + 18
                else:
                    sheet.paste(im, (xx, row_y + 128 - s), im)
                    if i == 0:
                        text(str(s), xx + s // 2, row_y + 128 - s - 26, 16, fg, anchor="ma")
                    xx += s + 18
            if i == 0:
                text("256 (shown at 128)", xx - 146 + 64, row_y - 24, 16, fg, anchor="ma")
            # zoomed small sizes underneath
            zx = col_x
            for s in (16, 24, 32):
                z = icon(app, s).resize((s * 4, s * 4), Image.NEAREST)
                sheet.paste(z, (zx, row_y + 150), z)
                zx += s * 4 + 16
            text(gen.APPS[app][0], col_x + 380, row_y + 255, 20, fg)
        y = top + block_h

    # 3. taskbar (unplated: the symbol alone) at 16/24/32/48, and 24 px at 4x, on dark and light
    for bg, fg, light in ((DARK, MUTED_D, False), (LIGHT, MUTED_L, True)):
        dr.rectangle((0, y, W, y + 200), fill=bg)
        text("Taskbar, unplated (symbol alone" + (", ink tones)" if light else ")") +
             "   16 / 24 / 32 / 48, then 24 at 4x", M, y + 12, 20, fg)
        x = M
        for app in gen.APPS:
            for s in (16, 24, 32, 48):
                im = glyph(app, s, light)
                sheet.paste(im, (x, y + 100 - s // 2), im)
                x += s + 10
            z = glyph(app, 24, light).resize((96, 96), Image.NEAREST)
            sheet.paste(z, (x + 4, y + 52), z)
            x += 96 + 34
        y += 200
    y += 40

    # 4. comparison with the owner's AI-generated kit (reference only, never shipped)
    if KIT and os.path.isdir(KIT):
        text("Owner's AI kit (raster reference)  ->  brand v2 (hand-built vectors)", M, y, 26)
        y += 50
        kit_files = ["logos/fastkiwi-symbol-transparent.png", "app-icons/fastkiwi.png", "app-icons/instafind.png",
                     "app-icons/remember-me.png", "app-icons/lemon.png", "app-icons/instawords.png", None]
        ours = [("logo", "mark.svg"), "fastkiwi", "instafind", "remember-me", "lemon", "instawords", "instaconvert"]
        cw = (W - 2 * M) // 7
        for row, src in enumerate(("kit", "v2")):
            for i in range(7):
                bx = M + i * cw
                by = y + row * 250
                if src == "kit":
                    if kit_files[i]:
                        fit(Image.open(os.path.join(KIT, kit_files[i])).convert("RGBA"), (bx + 10, by, bx + cw - 10, by + 200))
                    else:
                        text("(no InstaConvert)", bx + 30, by + 90, 20, MUTED_L)
                else:
                    o = ours[i]
                    im = raster_file(os.path.join(OUT, *o), h=400) if isinstance(o, tuple) else icon(o, 256)
                    fit(im, (bx + 10, by + 16, bx + cw - 10, by + 184))
            text("kit" if src == "kit" else "v2", M - 50, y + row * 250 + 90, 22, MUTED_L)
        y += 500
        # kit at 16 px vs v2 at 16 px (the size where the kit broke down)
        dr.rectangle((0, y, W, y + 190), fill=DARK)
        text("16 px on #202020, shown 4x:", M, y + 60, 20, MUTED_D)
        text("kit (top)  /  v2 (bottom)", M, y + 100, 20, MUTED_D)
        x = M + 560
        for i in range(7):
            if kit_files[i] and kit_files[i].startswith("app-icons"):
                k = Image.open(os.path.join(KIT, kit_files[i])).convert("RGBA").resize((16, 16), Image.LANCZOS)
                k = k.resize((64, 64), Image.NEAREST)
                sheet.paste(k, (x, y + 40), k)
            o = ours[i]
            if not isinstance(o, tuple):
                v = icon(o, 16).resize((64, 64), Image.NEAREST)
                sheet.paste(v, (x, y + 116), v)
            x += 100
        y += 190

    sheet = sheet.crop((0, 0, W, y + 20))
    sheet.save(os.path.join(OUT, "preview.png"), optimize=True)
    print("preview", sheet.size)


if __name__ == "__main__":
    exports()
    preview()
