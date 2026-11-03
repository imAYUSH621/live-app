"""Procedural luxury sprites (Pillow): glows, light rays, rings, sparkles, dust, streaks, banners."""
import io
import math
import random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

FLUENT = '/home/claude/fx/fluentui-emoji/assets'

THEMES = {
    'gold':     dict(main=(246, 215, 120), deep=(196, 140, 40), light=(255, 246, 214), accent=(255, 200, 90)),
    'rose':     dict(main=(255, 120, 170), deep=(200, 40, 110), light=(255, 225, 238), accent=(255, 190, 120)),
    'royal':    dict(main=(170, 120, 255), deep=(90, 40, 200), light=(236, 225, 255), accent=(246, 215, 120)),
    'sapphire': dict(main=(110, 180, 255), deep=(30, 90, 210), light=(225, 242, 255), accent=(246, 215, 120)),
    'emerald':  dict(main=(90, 230, 170), deep=(20, 140, 100), light=(220, 255, 240), accent=(246, 215, 120)),
    'ruby':     dict(main=(255, 90, 90), deep=(170, 20, 40), light=(255, 225, 220), accent=(255, 200, 90)),
    'fire':     dict(main=(255, 150, 60), deep=(220, 60, 20), light=(255, 240, 200), accent=(255, 220, 120)),
}


def png(img, colors=None):
    b = io.BytesIO()
    if colors:  # palette-quantize big soft images to keep files small
        img = img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE).convert('RGBA')
    img.save(b, 'PNG', optimize=True)
    return b.getvalue()


def _radial(size, fn):
    im = Image.new('L', (size, size), 0)
    px = im.load()
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            r = math.hypot(x - c, y - c) / c
            px[x, y] = max(0, min(255, int(255 * fn(r))))
    return im


def tint(alpha, color):
    im = Image.new('RGBA', alpha.size, color + (0,))
    im.putalpha(alpha)
    return im


def glow(color, size=128, power=2.2, core=0.0):
    a = _radial(size, lambda r: (max(0.0, 1 - r) ** power) + (core * max(0.0, 1 - r * 4)))
    return tint(a, color)


def rays(color, size=384, n=16, width=0.09, soft=6):
    a = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(a)
    c = size / 2
    for i in range(n):
        ang = 2 * math.pi * i / n
        w = width * (1.0 if i % 2 == 0 else 0.55)
        pts = [(c, c)]
        for s in (-w, w):
            pts.append((c + math.cos(ang + s) * c, c + math.sin(ang + s) * c))
        d.polygon(pts, fill=255 if i % 2 == 0 else 150)
    from PIL import ImageChops
    fall = _radial(size, lambda r: max(0.0, 1 - r) ** 1.4)
    a = a.filter(ImageFilter.GaussianBlur(soft))
    a = ImageChops.multiply(a, fall)
    return tint(a, color)


def ring(color, size=256, width=6, blur=6):
    a = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(a)
    m = blur * 2 + width
    d.ellipse([m, m, size - m, size - m], outline=255, width=width)
    soft = a.filter(ImageFilter.GaussianBlur(blur))
    from PIL import ImageChops
    a = ImageChops.lighter(a, Image.eval(soft, lambda v: min(255, v * 2)))
    return tint(a, color)


def sparkle(color, size=96, points=4):
    a = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(a)
    c = size / 2
    for k in range(points):
        ang = math.pi / 2 * k if points == 4 else math.pi / 3 * k
        L = c * (0.98 if k % 2 == 0 else 0.62)
        w = c * 0.07
        dx, dy = math.cos(ang), math.sin(ang)
        px, py = -dy, dx
        d.polygon([(c - dx * L, c - dy * L), (c + px * w, c + py * w), (c + dx * L, c + dy * L), (c - px * w, c - py * w)], fill=255)
    a = a.filter(ImageFilter.GaussianBlur(0.8))
    from PIL import ImageChops
    g = _radial(size, lambda r: max(0.0, 1 - r * 2.2) ** 1.6)
    a = ImageChops.lighter(a, g)
    halo = _radial(size, lambda r: 0.35 * max(0.0, 1 - r) ** 3)
    a = ImageChops.lighter(a, halo)
    im = tint(a, color)
    # white-hot core
    core = tint(_radial(size, lambda r: max(0.0, 1 - r * 5)), (255, 255, 255))
    im.alpha_composite(core)
    return im


def dot(color, size=24):
    return glow(color, size, power=1.6, core=0.6)


def bokeh(color, size=64):
    a = _radial(size, lambda r: (0.35 + 0.65 * (r ** 6)) * (1 if r < 0.95 else max(0.0, (1 - r) / 0.05)))
    return tint(a.filter(ImageFilter.GaussianBlur(1.2)), color)


def confetti(color, w=18, h=30):
    im = Image.new('RGBA', (w + 4, h + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    dark = tuple(int(v * 0.65) for v in color)
    d.rectangle([2, 2, w + 1, h + 1], fill=color + (255,))
    d.rectangle([2, 2 + h // 2, w + 1, h + 1], fill=dark + (255,))
    d.line([2, 3, w + 1, 3], fill=(255, 255, 255, 180), width=2)
    return im


def streak(color, w=512, h=24):
    a = Image.new('L', (w, h), 0)
    px = a.load()
    for x in range(w):
        fx = math.sin(math.pi * x / (w - 1)) ** 2
        for y in range(h):
            fy = max(0.0, 1 - abs(y - (h - 1) / 2) / ((h - 1) / 2)) ** 2
            px[x, y] = int(255 * fx * fy)
    return tint(a, color)


def flare(color, size=256):
    im = glow(color, size, power=3.0, core=1.0)
    s = streak((255, 255, 255), size, size // 12)
    im.alpha_composite(s, (0, size // 2 - s.height // 2))
    return im


def hero(name, size=384, file=None):
    folder = f'{FLUENT}/{name}/3D'
    import os
    f = file or sorted(os.listdir(folder))[0]
    im = Image.open(f'{folder}/{f}').convert('RGBA')
    im = im.resize((size, size), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    im = ImageEnhance.Color(im).enhance(1.12)
    return im


def hero_glow(hero_img, color, blur=22):
    a = hero_img.getchannel('A').filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(blur))
    pad = blur * 2
    big = Image.new('L', (a.width + pad * 2, a.height + pad * 2), 0)
    big.paste(a, (pad, pad))
    big = big.filter(ImageFilter.GaussianBlur(blur))
    return tint(Image.eval(big, lambda v: min(255, int(v * 1.4))), color)


def small(name, size=96):
    return hero(name, size)


def banner(theme, w=640, h=128):
    """Glass plate with a gold gradient frame, for entry effects."""
    t = THEMES[theme]
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    r = h // 2
    # body: dark glass with theme tint, fading to the right
    body = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bp = body.load()
    for x in range(w):
        f = x / (w - 1)
        col = tuple(int(c * (0.35 - 0.2 * f) + 18 * (1 - f)) for c in t['deep'])
        for y in range(h):
            bp[x, y] = col + (int(225 - 120 * f),)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([2, 2, w - 3, h - 3], radius=r, fill=255)
    im.paste(body, (0, 0), mask)
    # gold frame
    frame = Image.new('L', (w, h), 0)
    ImageDraw.Draw(frame).rounded_rectangle([2, 2, w - 3, h - 3], radius=r, outline=255, width=4)
    grad = Image.new('RGBA', (w, h))
    gp = grad.load()
    g1, g2 = (255, 240, 190), (190, 135, 40)
    for x in range(w):
        f = (math.sin(x / w * math.pi * 3) + 1) / 2
        col = tuple(int(a * f + b * (1 - f)) for a, b in zip(g1, g2))
        for y in range(h):
            gp[x, y] = col + (255,)
    im.paste(grad, (0, 0), frame)
    # top gloss
    gloss = Image.new('L', (w, h), 0)
    ImageDraw.Draw(gloss).rounded_rectangle([10, 6, w - 11, h // 2 - 2], radius=r - 8, fill=40)
    im.alpha_composite(tint(gloss.filter(ImageFilter.GaussianBlur(3)), (255, 255, 255)))
    return im


def blank(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))
