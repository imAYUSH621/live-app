"""Builds the premium SVGA library: 40 gift animations + 10 entry/mount effects, plus 3D gift icons."""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
from svga import Movie  # noqa: E402
import art  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/fx/out'
os.makedirs(f'{OUT}/svga', exist_ok=True)
os.makedirs(f'{OUT}/icons', exist_ok=True)

W, H = 750, 1334
CX, CY = 375, 620
FPS = 24


# ---------- easing ----------
def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def seg(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else (1.0 if t >= b else 0.0)


def out_cubic(x):
    return 1 - (1 - x) ** 3


def in_cubic(x):
    return x ** 3


def in_out(x):
    return 3 * x * x - 2 * x * x * x


def out_back(x, s=1.9):
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def fade(t, a, b, c, d):
    return min(seg(t, a, b), 1 - seg(t, c, d))


class Kit:
    """Adds shared sprite images to a movie once, by key."""

    def __init__(self, movie, theme):
        self.m, self.t = movie, art.THEMES[theme]
        self.cache = {}

    def img(self, key, make, colors=None):
        if key not in self.cache:
            im = make()
            self.m.image(key, art.png(im, colors), im.width, im.height)
            self.cache[key] = im
        return key


# ---------- shared layers ----------
def layer_backdrop(k, end=0.88):
    t = k.t
    g = k.img('bg', lambda: art.glow(t['deep'], 128, power=1.4))
    k.m.sprite(g, lambda i, x: dict(x=CX, y=CY, scale=7.5, alpha=0.75 * fade(x, 0, 0.08, end, 1)))
    g2 = k.img('bg2', lambda: art.glow(t['main'], 128, power=2.4))
    k.m.sprite(g2, lambda i, x: dict(x=CX, y=CY, scale=4.2 + 0.3 * math.sin(x * 12), alpha=0.55 * fade(x, 0.04, 0.16, end, 1)))


def layer_rays(k, start=0.06, end=0.9, scale=3.4, speed=40):
    t = k.t
    r1 = k.img('rays', lambda: art.rays(t['light'], 384, n=18), colors=None)
    r2 = k.img('rays2', lambda: art.rays(t['accent'], 384, n=12, width=0.05))
    k.m.sprite(r1, lambda i, x: dict(x=CX, y=CY, rot=speed * x, scale=scale * out_back(seg(x, start, start + 0.18), 1.2), alpha=0.85 * fade(x, start, start + 0.1, end - 0.08, end)))
    k.m.sprite(r2, lambda i, x: dict(x=CX, y=CY, rot=-speed * 0.7 * x + 9, scale=scale * 0.85 * out_cubic(seg(x, start + 0.04, start + 0.22)), alpha=0.6 * fade(x, start + 0.04, start + 0.16, end - 0.1, end)))


def layer_rings(k, at=(0.12, 0.2, 0.28), y=CY, maxs=3.6, color=None):
    c = color or k.t['light']
    rk = k.img(f'ring{c}', lambda: art.ring(c, 512, width=7, blur=11))
    for s0 in at:
        k.m.sprite(rk, lambda i, x, s0=s0: (None if x < s0 else dict(x=CX, y=y, scale=(0.2 + maxs * out_cubic(seg(x, s0, s0 + 0.3))) / 2, alpha=1 - seg(x, s0 + 0.05, s0 + 0.3))))


def layer_sparkles(k, n=16, rmin=150, rmax=330, cy=CY, start=0.15, end=0.9, seed=1):
    rnd = random.Random(seed)
    s1 = k.img('spk', lambda: art.sparkle(k.t['light'], 96))
    s2 = k.img('spk6', lambda: art.sparkle(k.t['accent'], 96, points=6))
    for j in range(n):
        ang = rnd.uniform(0, 2 * math.pi)
        rad = rnd.uniform(rmin, rmax)
        px, py = CX + math.cos(ang) * rad, cy + math.sin(ang) * rad * 1.15
        period = rnd.uniform(0.22, 0.34)
        off = rnd.uniform(0, period)
        size = rnd.uniform(0.35, 0.9)
        key = s1 if j % 3 else s2

        def fn(i, x, px=px, py=py, period=period, off=off, size=size):
            if x < start or x > end:
                return None
            ph = ((x - start + off) % period) / period
            a = math.sin(math.pi * ph)
            return dict(x=px, y=py, scale=size * a, rot=90 * ph, alpha=a * fade(x, start, start + 0.05, end - 0.05, end))
        k.m.sprite(key, fn)


def layer_dust(k, n=26, start=0.05, end=0.95, up=True, seed=2, color=None):
    rnd = random.Random(seed)
    d = k.img(f'dust{color}', lambda: art.dot(color or k.t['accent'], 24))
    for _ in range(n):
        x0, y0 = rnd.uniform(60, W - 60), rnd.uniform(250, 1100)
        drift = rnd.uniform(-60, 60)
        rise = rnd.uniform(120, 360) * (-1 if up else 1)
        sc = rnd.uniform(0.4, 1.3)
        fl = rnd.uniform(6, 14)

        def fn(i, x, x0=x0, y0=y0, drift=drift, rise=rise, sc=sc, fl=fl):
            if x < start or x > end:
                return None
            p = seg(x, start, end)
            return dict(x=x0 + drift * p, y=y0 + rise * p, scale=sc, alpha=(0.55 + 0.45 * math.sin(x * fl * math.pi)) * fade(x, start, start + 0.1, end - 0.12, end))
        k.m.sprite(d, fn)


def layer_confetti(k, n=34, at=0.18, seed=3):
    rnd = random.Random(seed)
    cols = [(246, 215, 120), (255, 246, 214), k.t['main'], (196, 140, 40)]
    keys = [k.img(f'conf{j}', lambda c=c: art.confetti(c)) for j, c in enumerate(cols)]
    for j in range(n):
        ang = rnd.uniform(-math.pi * 0.95, -math.pi * 0.05)
        v = rnd.uniform(600, 1200)
        spin = rnd.uniform(-900, 900)
        flip = rnd.uniform(6, 14)

        def fn(i, x, ang=ang, v=v, spin=spin, flip=flip):
            if x < at:
                return None
            tt = (x - at) * 3.5
            px = CX + math.cos(ang) * v * tt * 0.6
            py = CY + math.sin(ang) * v * tt + 900 * tt * tt
            return dict(x=px, y=py, rot=spin * tt, sx=math.cos(flip * tt), sy=1, alpha=1 - seg(x, 0.82, 0.98))
        k.m.sprite(keys[j % len(keys)], fn)


def layer_hero(k, name, size=384, scale=1.0, y=CY, enter=0.06, exit_=0.86, glow=True, float_amp=14, file=None):
    hk = k.img('hero', lambda: art.hero(name, size, file))
    if glow:
        gk = k.img('herog', lambda: art.hero_glow(k.cache['hero'], k.t['main']))
        k.m.sprite(gk, lambda i, x: dict(x=CX, y=y + float_amp * math.sin(x * 9), scale=scale * out_back(seg(x, enter, enter + 0.16)) * (1 + 0.04 * math.sin(x * 20)), alpha=0.9 * fade(x, enter, enter + 0.08, exit_, exit_ + 0.08)))

    def fn(i, x):
        if x < enter:
            return None
        s = scale * out_back(seg(x, enter, enter + 0.16), 2.2)
        if x > exit_:
            s *= 1 + 0.25 * seg(x, exit_, 1)
        return dict(x=CX, y=y + float_amp * math.sin(x * 9), scale=s, rot=3 * math.sin(x * 7), alpha=1 - seg(x, exit_, exit_ + 0.1))
    k.m.sprite(hk, fn)


def layer_flare(k, at=0.32, y=CY):
    f = k.img('flare', lambda: art.flare(k.t['light'], 256))
    k.m.sprite(f, lambda i, x: (None if not (at <= x <= at + 0.2) else dict(x=CX - 300 + 600 * in_out(seg(x, at, at + 0.2)), y=y - 60, scale=1.4, alpha=math.sin(math.pi * seg(x, at, at + 0.2)))))


# ---------- templates ----------
def t_royal(k, g):
    layer_backdrop(k)
    layer_rays(k)
    layer_rings(k)
    layer_hero(k, g['asset'], scale=g.get('scale', 1.0))
    layer_flare(k)
    layer_sparkles(k, n=18, seed=g['id'])
    layer_dust(k, seed=g['id'] + 7)
    if g.get('confetti'):
        layer_confetti(k, seed=g['id'])


def t_party(k, g):
    layer_backdrop(k)
    layer_rays(k, scale=3.0)
    layer_hero(k, g['asset'], scale=g.get('scale', 0.95))
    layer_confetti(k, n=44, at=0.14, seed=g['id'])
    layer_rings(k, at=(0.14, 0.24))
    layer_sparkles(k, n=12, seed=g['id'])


def t_treasure(k, g):
    layer_backdrop(k)
    layer_rays(k)
    layer_rings(k, at=(0.16, 0.24))
    rnd = random.Random(g['id'])
    piece = k.img('piece', lambda: art.small(g.get('piece', 'Coin'), 88))
    for _ in range(26):
        ang = rnd.uniform(-math.pi * 0.92, -math.pi * 0.08)
        v = rnd.uniform(700, 1150)
        spin = rnd.uniform(-540, 540)
        sc = rnd.uniform(0.55, 1.05)
        st = rnd.uniform(0.2, 0.32)

        def fn(i, x, ang=ang, v=v, spin=spin, sc=sc, st=st):
            if x < st:
                return None
            tt = (x - st) * 2.6
            return dict(x=CX + math.cos(ang) * v * tt * 0.55, y=CY + math.sin(ang) * v * tt + 1100 * tt * tt, rot=spin * tt, scale=sc, alpha=1 - seg(x, 0.85, 0.98))
        k.m.sprite(piece, fn)
    layer_hero(k, g['asset'], scale=g.get('scale', 1.0))
    layer_flare(k, at=0.4)
    layer_sparkles(k, n=16, seed=g['id'])


def t_heart(k, g):
    layer_backdrop(k)
    rnd = random.Random(g['id'])
    small_key = k.img('mini', lambda: art.small(g.get('piece', 'Sparkling heart'), 80))
    for _ in range(22):
        x0 = rnd.uniform(60, W - 60)
        st = rnd.uniform(0.08, 0.6)
        dur = rnd.uniform(0.3, 0.45)
        sw = rnd.uniform(20, 60)
        sc = rnd.uniform(0.45, 1.0)

        def fn(i, x, x0=x0, st=st, dur=dur, sw=sw, sc=sc):
            p = seg(x, st, st + dur)
            if x < st or p >= 1:
                return None
            return dict(x=x0 + sw * math.sin(p * 7), y=1250 - 1000 * p, scale=sc * (0.6 + 0.4 * p), rot=12 * math.sin(p * 5), alpha=math.sin(math.pi * p) ** 0.6)
        k.m.sprite(small_key, fn)
    layer_rings(k, at=(0.18, 0.4, 0.62), maxs=2.6, color=k.t['main'])
    hk = k.img('hero', lambda: art.hero(g['asset'], 384))
    gk = k.img('herog', lambda: art.hero_glow(k.cache['hero'], k.t['main']))

    def beat(x):
        ph = (x * 4.2) % 1
        return 1 + 0.12 * math.exp(-((ph - 0.1) ** 2) / 0.004) + 0.07 * math.exp(-((ph - 0.3) ** 2) / 0.004)
    for key, a in ((gk, 0.95), (hk, 1.0)):
        k.m.sprite(key, lambda i, x, a=a: (None if x < 0.06 else dict(x=CX, y=CY, scale=g.get('scale', 1.0) * out_back(seg(x, 0.06, 0.2)) * beat(x), alpha=a * (1 - seg(x, 0.86, 0.96)))))
    layer_sparkles(k, n=14, seed=g['id'])


def t_rain(k, g):
    layer_backdrop(k)
    rnd = random.Random(g['id'])
    small_key = k.img('mini', lambda: art.small(g.get('piece', g['asset']), 96))
    for _ in range(30):
        x0 = rnd.uniform(30, W - 30)
        st = rnd.uniform(0.02, 0.62)
        dur = rnd.uniform(0.32, 0.5)
        spin = rnd.uniform(-220, 220)
        sc = rnd.uniform(0.4, 0.95)
        sw = rnd.uniform(20, 70)

        def fn(i, x, x0=x0, st=st, dur=dur, spin=spin, sc=sc, sw=sw):
            p = seg(x, st, st + dur)
            if x < st or p >= 1:
                return None
            return dict(x=x0 + sw * math.sin(p * 6), y=-80 + 1450 * p, rot=spin * p, scale=sc, alpha=1 - seg(p, 0.8, 1))
        k.m.sprite(small_key, fn)
    layer_hero(k, g['asset'], scale=g.get('scale', 1.0))
    layer_sparkles(k, n=12, seed=g['id'])


def t_orbit(k, g):
    layer_backdrop(k)
    layer_rays(k, speed=25)
    rk = k.img('oring', lambda: art.ring(k.t['light'], 512, width=6, blur=9))
    for tilt, sp, s in ((18, 1.0, 1.4), (-24, -0.7, 1.65)):
        k.m.sprite(rk, lambda i, x, tilt=tilt, sp=sp, s=s: (None if x < 0.1 else dict(x=CX, y=CY, sx=s * out_cubic(seg(x, 0.1, 0.3)), sy=s * 0.3 * out_cubic(seg(x, 0.1, 0.3)), rot=tilt + 6 * math.sin(x * 6 * sp), alpha=0.9 * fade(x, 0.1, 0.2, 0.84, 0.94))))
    layer_hero(k, g['asset'], scale=g.get('scale', 1.0), float_amp=8)
    sp = k.img('spk', lambda: art.sparkle(k.t['light'], 96))
    for j in range(10):
        ph0 = j / 10

        def fn(i, x, ph0=ph0):
            if x < 0.2 or x > 0.9:
                return None
            a = 2 * math.pi * (ph0 + x * 1.4)
            depth = math.sin(a)
            return dict(x=CX + math.cos(a) * 330, y=CY + depth * 100, scale=0.45 + 0.25 * depth, alpha=(0.6 + 0.4 * depth) * fade(x, 0.2, 0.28, 0.82, 0.9))
        k.m.sprite(sp, fn)
    layer_dust(k, seed=g['id'])


def t_fly(k, g):
    """Vehicles: enter from one side, pose with glow, leave the other side."""
    diag = g.get('diag', False)
    layer_backdrop(k)
    t = k.t
    ground = k.img('ground', lambda: art.glow(t['main'], 128, power=2.0))
    k.m.sprite(ground, lambda i, x: dict(x=CX, y=CY + 170, sx=4.2, sy=0.7, alpha=0.8 * fade(x, 0.25, 0.35, 0.68, 0.78)))
    layer_rays(k, start=0.3, end=0.78, scale=2.8)
    st = k.img('streak', lambda: art.streak(t['light'], 512, 22))

    def pos(x):
        if x < 0.3:
            p = out_cubic(seg(x, 0.04, 0.3))
            return -320 + (CX + 320) * p, (CY + 260 - 260 * p) if diag else CY, p < 1
        if x < 0.7:
            return CX, CY + 10 * math.sin(x * 18), False
        p = in_cubic(seg(x, 0.7, 0.92))
        return CX + (W + 360 - CX) * p, (CY - 320 * p) if diag else CY, p > 0
    rnd = random.Random(g['id'])
    for j in range(7):
        dy = rnd.uniform(-90, 90)
        lag = rnd.uniform(120, 260)

        def fn(i, x, dy=dy, lag=lag):
            px, py, moving = pos(x)
            if not moving or x > 0.94:
                return None
            return dict(x=px - lag, y=py + dy, sx=1.1, sy=0.5, rot=-25 if diag else 0, alpha=0.75)
        k.m.sprite(st, fn)
    hk = k.img('hero', lambda: art.hero(g['asset'], 384))
    gk = k.img('herog', lambda: art.hero_glow(k.cache['hero'], t['main']))
    flip = g.get('flip', False)
    for key in (gk, hk):
        k.m.sprite(key, lambda i, x, key=key: (lambda p: None if x < 0.04 or x > 0.95 else dict(x=p[0], y=p[1], sx=(-1 if flip else 1) * g.get('scale', 1.35), sy=g.get('scale', 1.35), rot=-14 if diag and p[2] else 0, alpha=0.9 if key == gk else 1))(pos(x)))
    layer_flare(k, at=0.42)
    layer_sparkles(k, n=12, start=0.3, end=0.72, seed=g['id'])
    layer_dust(k, start=0.25, end=0.8, seed=g['id'])


def t_rise(k, g):
    """Rocket/fireworks: climbs from the bottom with a trail, then bursts."""
    layer_backdrop(k)
    t = k.t
    trail = k.img('trail', lambda: art.glow((255, 190, 90), 64, power=1.5, core=0.8))
    apex = 0.42

    def ypos(x):
        return 1400 - (1400 - 470) * out_cubic(seg(x, 0.04, apex))
    rnd = random.Random(g['id'])
    for j in range(16):
        lag = j * 0.012
        jitter = rnd.uniform(-18, 18)
        k.m.sprite(trail, lambda i, x, lag=lag, jitter=jitter: (None if x < 0.04 + lag or x > apex + 0.05 else dict(x=CX + jitter, y=ypos(x - lag) + 160, scale=1.6 - j * 0.07, alpha=0.9 - j * 0.045)))
    hk = k.img('hero', lambda: art.hero(g['asset'], 360))
    k.m.sprite(hk, lambda i, x: (None if x < 0.04 or x > apex + 0.06 else dict(x=CX, y=ypos(x), scale=g.get('scale', 0.9), rot=g.get('tilt', -45) if g.get('tilt') is not None else 0, alpha=1 - seg(x, apex, apex + 0.05))))
    layer_rings(k, at=(apex, apex + 0.04, apex + 0.08), y=470, maxs=4.2)
    bk = [k.img(f'bk{j}', lambda c=c: art.dot(c, 32)) for j, c in enumerate([t['light'], t['main'], (255, 215, 120), (255, 255, 255)])]
    for burst, (bx, by, delay) in enumerate([(CX, 470, 0), (200, 360, 0.12), (560, 380, 0.2), (CX, 260, 0.28)]):
        for j in range(26 if burst == 0 else 18):
            ang = 2 * math.pi * j / (26 if burst == 0 else 18) + rnd.uniform(-0.08, 0.08)
            v = rnd.uniform(260, 420) * (1 if burst == 0 else 0.7)
            st = apex + delay

            def fn(i, x, ang=ang, v=v, st=st, bx=bx, by=by):
                if x < st or x > st + 0.4:
                    return None
                p = (x - st) / 0.4
                r = v * out_cubic(p)
                return dict(x=bx + math.cos(ang) * r, y=by + math.sin(ang) * r + 140 * p * p, scale=1.4 * (1 - p * 0.6), alpha=1 - p ** 1.5)
            k.m.sprite(bk[(j + burst) % 4], fn)
    layer_rays(k, start=apex, end=0.92, scale=3.2)
    layer_sparkles(k, n=14, cy=430, start=apex, seed=g['id'])
    layer_dust(k, start=apex, seed=g['id'], up=False)


def t_roar(k, g):
    """Majestic creature: zooms in with an impact shake and shockwaves."""
    layer_backdrop(k)
    layer_rays(k, start=0.2, scale=3.8, speed=30)
    impact = 0.2

    def shake(x):
        d = seg(x, impact, impact + 0.12)
        return (1 - d) * 18 * math.sin(x * 260) if impact <= x <= impact + 0.12 else 0
    layer_rings(k, at=(impact, impact + 0.05, impact + 0.1, impact + 0.3), maxs=4.4)
    hk = k.img('hero', lambda: art.hero(g['asset'], 420))
    gk = k.img('herog', lambda: art.hero_glow(k.cache['hero'], k.t['main'], blur=26))

    def sc(x):
        if x < impact:
            return 0.25 + 0.95 * in_cubic(seg(x, 0.03, impact))
        return 1.2 - 0.12 * out_cubic(seg(x, impact, impact + 0.15))
    for key, al in ((gk, 0.95), (hk, 1)):
        k.m.sprite(key, lambda i, x, key=key, al=al: (None if x < 0.03 else dict(x=CX + shake(x), y=CY + 8 * math.sin(x * 8), scale=g.get('scale', 1.0) * sc(x) * (1 + 0.25 * seg(x, 0.86, 1)), alpha=al * (1 - seg(x, 0.86, 0.96)))))
    layer_flare(k, at=0.45)
    layer_sparkles(k, n=16, seed=g['id'])
    layer_dust(k, n=32, start=impact, seed=g['id'], color=(255, 170, 80))


TEMPLATES = dict(royal=t_royal, party=t_party, treasure=t_treasure, heart=t_heart, rain=t_rain, orbit=t_orbit, fly=t_fly, rise=t_rise, roar=t_roar)


# ---------- entry / mount effect (banner across the room) ----------
def t_entry(m, e):
    k = Kit(m, e['theme'])
    EW, EH = m.w, m.h
    cy = EH / 2
    bn = k.img('plate', lambda: art.banner(e['theme'], 640, 128))

    def bx(x):
        if x < 0.18:
            return EW + 340 - (EW + 340 - EW / 2) * out_cubic(seg(x, 0, 0.18))
        if x < 0.82:
            return EW / 2 - 12 * seg(x, 0.18, 0.82)
        return EW / 2 - 12 - (EW / 2 + 360) * in_cubic(seg(x, 0.82, 1))
    gl = k.img('g', lambda: art.glow(k.t['main'], 128, power=2))
    m.sprite(gl, lambda i, x: dict(x=bx(x), y=cy, sx=5.6, sy=1.6, alpha=0.65))
    m.sprite(bn, lambda i, x: dict(x=bx(x), y=cy, alpha=1))
    # dynamic name text slot (app fills it with "<name> joined")
    nk = k.img('name', lambda: art.blank(380, 56))
    m.sprite(nk, lambda i, x: dict(x=bx(x) + 70, y=cy, alpha=1))
    st = k.img('streak', lambda: art.streak(k.t['light'], 512, 20))
    rnd = random.Random(e['id'])
    for j in range(6):
        dy = rnd.uniform(-50, 50)
        lag = rnd.uniform(330, 470)
        m.sprite(st, lambda i, x, dy=dy, lag=lag: (None if not (x < 0.2 or x > 0.8) else dict(x=bx(x) + (lag if x < 0.5 else -lag), y=cy + dy, sx=0.9, sy=0.5, alpha=0.7)))
    fl = k.img('flare', lambda: art.flare(k.t['light'], 192))
    m.sprite(fl, lambda i, x: (None if not (0.25 < x < 0.55) else dict(x=bx(x) - 300 + 600 * seg(x, 0.25, 0.55), y=cy - 50, scale=1.0, alpha=math.sin(math.pi * seg(x, 0.25, 0.55)))))
    hk = k.img('hero', lambda: art.hero(e['asset'], 220))
    gk = k.img('herog', lambda: art.hero_glow(k.cache['hero'], k.t['main'], blur=14))
    for key in (gk, hk):
        m.sprite(key, lambda i, x: dict(x=bx(x) - 250, y=cy - 18 + 8 * math.sin(x * 24), sx=-1 if e.get('flip') else 1, sy=1, rot=-4 * math.sin(x * 12)))
    sp = k.img('spk', lambda: art.sparkle(k.t['light'], 72))
    for j in range(12):
        ox, oy = rnd.uniform(-300, 300), rnd.uniform(-70, 70)
        period, off = rnd.uniform(0.18, 0.3), rnd.uniform(0, 0.3)
        m.sprite(sp, lambda i, x, ox=ox, oy=oy, period=period, off=off: (lambda ph: dict(x=bx(x) + ox, y=cy + oy, scale=0.7 * math.sin(math.pi * ph), rot=90 * ph, alpha=math.sin(math.pi * ph)))(((x + off) % period) / period))


# ---------- catalog ----------
G = [
    # name, asset, price, theme, template, extra
    ('Sparkling Heart', 'Sparkling heart', 499, 'rose', 'heart', {}),
    ('Love Letter', 'Love letter', 520, 'rose', 'heart', {'piece': 'Red heart'}),
    ('Heart Ribbon', 'Heart with ribbon', 599, 'rose', 'heart', {}),
    ('Royal Bouquet', 'Bouquet', 699, 'rose', 'rain', {'piece': 'Rose'}),
    ('Golden Diya', 'Diya lamp', 501, 'gold', 'royal', {}),
    ('Magic Wand', 'Magic wand', 799, 'royal', 'royal', {}),
    ('Butterfly Dream', 'Butterfly', 777, 'sapphire', 'rain', {}),
    ('Cherry Blossom', 'Cherry blossom', 888, 'rose', 'rain', {}),
    ('Birthday Cake', 'Birthday cake', 888, 'gold', 'party', {}),
    ('Gold Medal', '1st place medal', 999, 'gold', 'royal', {}),
    ('Rose Rain', 'Rose', 999, 'ruby', 'rain', {}),
    ('Teddy Love', 'Teddy bear', 1099, 'rose', 'heart', {}),
    ('Mirror Ball', 'Mirror ball', 1199, 'royal', 'orbit', {}),
    ('Champagne', 'Bottle with popping cork', 1299, 'gold', 'party', {}),
    ('Crystal Ball', 'Crystal ball', 1314, 'royal', 'orbit', {}),
    ('Champion Trophy', 'Trophy', 1499, 'gold', 'royal', {'confetti': True}),
    ('Rainbow', 'Rainbow', 1888, 'sapphire', 'royal', {}),
    ('Royal Crown', 'Crown', 1999, 'gold', 'royal', {}),
    ('Shooting Star', 'Shooting star', 2222, 'sapphire', 'fly', {'diag': True}),
    ('Fireworks', 'Glowing star', 2500, 'royal', 'rise', {'tilt': None}),
    ('Superbike', 'Motorcycle', 2999, 'ruby', 'fly', {}),
    ('Royal Diamond', 'Gem stone', 3333, 'sapphire', 'treasure', {'piece': 'Gem stone'}),
    ('Money Rain', 'Money bag', 3999, 'gold', 'treasure', {'piece': 'Coin'}),
    ('Golden Moon', 'Crescent moon', 4444, 'royal', 'orbit', {}),
    ('Sports Car', 'Racing car', 4999, 'ruby', 'fly', {}),
    ('Eternal Ring', 'Ring', 5200, 'gold', 'royal', {'confetti': True}),
    ('Royal Swan', 'Swan', 6666, 'sapphire', 'heart', {'piece': 'Sparkles'}),
    ('Luxury Yacht', 'Speedboat', 6999, 'sapphire', 'fly', {}),
    ('Helicopter', 'Helicopter', 7999, 'emerald', 'fly', {}),
    ('Ferris Wheel', 'Ferris wheel', 8888, 'royal', 'orbit', {}),
    ('Private Jet', 'Airplane', 9999, 'sapphire', 'fly', {'diag': True}),
    ('Royal Peacock', 'Peacock', 11111, 'emerald', 'royal', {}),
    ('Golden Eagle', 'Eagle', 12999, 'gold', 'roar', {}),
    ('Space Rocket', 'Rocket', 14999, 'fire', 'rise', {'tilt': -45}),
    ('Unicorn', 'Unicorn', 17777, 'royal', 'roar', {}),
    ('Saturn', 'Ringed planet', 19999, 'royal', 'orbit', {}),
    ('Royal Castle', 'Castle', 29999, 'gold', 'royal', {'confetti': True, 'scale': 1.05}),
    ('Tiger King', 'Tiger', 39999, 'fire', 'roar', {}),
    ('Lion King', 'Lion', 59999, 'gold', 'roar', {}),
    ('Fire Dragon', 'Dragon', 99999, 'fire', 'roar', {'scale': 1.1}),
]

E = [
    ('Royal Arrival', 'Crown', 'gold', 3000, {}),
    ('Sports Car Entry', 'Racing car', 'ruby', 8000, {}),
    ('Superbike Entry', 'Motorcycle', 'fire', 6000, {}),
    ('Yacht Entry', 'Speedboat', 'sapphire', 12000, {}),
    ('Private Jet Entry', 'Airplane', 'sapphire', 20000, {}),
    ('Helicopter Entry', 'Helicopter', 'emerald', 15000, {}),
    ('Unicorn Ride', 'Unicorn', 'royal', 25000, {}),
    ('Lion Ride', 'Lion', 'gold', 30000, {}),
    ('Dragon Ride', 'Dragon', 'fire', 50000, {}),
    ('Rocket Entry', 'Rocket', 'fire', 40000, {}),
]

SMALL = [
    ('Rose', 'Rose', 1), ('Heart', 'Red heart', 5), ('Kiss', 'Kiss mark', 10), ('Chai', 'Hot beverage', 10),
    ('Lollipop', 'Lollipop', 15), ('Candy', 'Candy', 19), ('Ice Cream', 'Ice cream', 29), ('Doughnut', 'Doughnut', 39),
    ('Chocolate', 'Chocolate bar', 49), ('Balloon', 'Balloon', 66), ('Cupcake', 'Shortcake', 79), ('Tulip', 'Tulip', 99),
    ('Cocktail', 'Cocktail glass', 129), ('Cheers', 'Clinking glasses', 149), ('Melody', 'Musical notes', 199), ('Mic', 'Microphone', 249),
    ('Guitar', 'Guitar', 299), ('Lipstick', 'Lipstick', 349), ('Heels', 'High-heeled shoe', 399), ('Gift Box', 'Wrapped gift', 449),
]


def slug(s):
    return ''.join(c.lower() if c.isalnum() else '-' for c in s).strip('-').replace('--', '-')


def save_icon(asset, name):
    im = art.hero(asset, 160)
    p = f'{OUT}/icons/{name}.webp'
    im.save(p, 'WEBP', quality=86, method=6)
    return p


def main(only=None):
    manifest = dict(gifts=[], entries=[], small=[])
    for idx, (name, asset, price, theme, tpl, extra) in enumerate(G):
        sl = slug(name)
        if only and sl not in only:
            continue
        m = Movie(W, H, FPS, 84)
        k = Kit(m, theme)
        g = dict(id=idx + 1, asset=asset, **extra)
        TEMPLATES[tpl](k, g)
        data = m.encode()
        open(f'{OUT}/svga/gift-{sl}.svga', 'wb').write(data)
        save_icon(asset, sl)
        manifest['gifts'].append(dict(name=name, slug=sl, price=price, theme=theme, template=tpl, svga=f'gift-{sl}.svga', icon=f'{sl}.webp', bytes=len(data)))
        print(f'gift {sl:18s} {tpl:9s} {len(data)//1024:4d} KB  sprites={len(m.sprites)}')
    for idx, (name, asset, theme, price, extra) in enumerate(E):
        sl = slug(name)
        if only and sl not in only:
            continue
        m = Movie(750, 300, FPS, 72)
        t_entry(m, dict(id=100 + idx, asset=asset, theme=theme, **extra))
        data = m.encode()
        open(f'{OUT}/svga/entry-{sl}.svga', 'wb').write(data)
        save_icon(asset, 'entry-' + sl)
        manifest['entries'].append(dict(name=name, slug=sl, price=price, theme=theme, svga=f'entry-{sl}.svga', icon=f'entry-{sl}.webp', bytes=len(data)))
        print(f'entry {sl:18s} {len(data)//1024:4d} KB')
    for name, asset, price in SMALL:
        sl = slug(name)
        if only and sl not in only:
            continue
        save_icon(asset, sl)
        manifest['small'].append(dict(name=name, slug=sl, price=price, icon=f'{sl}.webp'))
    if not only:
        json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=1)
        tot = sum(x['bytes'] for x in manifest['gifts'] + manifest['entries'])
        print('TOTAL svga', len(manifest['gifts']) + len(manifest['entries']), 'files', tot // 1024, 'KB')


if __name__ == '__main__':
    main(set(sys.argv[2:]) or None)
