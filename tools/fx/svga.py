"""Minimal SVGA 2.x writer (protobuf MovieEntity, zlib-deflated).

Schema (svga.proto):
  MovieParams  { float viewBoxWidth=1; float viewBoxHeight=2; int32 fps=3; int32 frames=4; }
  Layout       { float x=1; float y=2; float width=3; float height=4; }
  Transform    { float a=1; float b=2; float c=3; float d=4; float tx=5; float ty=6; }
  FrameEntity  { float alpha=1; Layout layout=2; Transform transform=3; string clipPath=4; repeated ShapeEntity shapes=5; }
  SpriteEntity { string imageKey=1; repeated FrameEntity frames=2; string matteKey=3; }
  MovieEntity  { string version=1; MovieParams params=2; map<string,bytes> images=3; repeated SpriteEntity sprites=4; }
"""
import math
import struct
import zlib


def _varint(n):
    out = bytearray()
    n &= (1 << 64) - 1
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _key(field, wire):
    return _varint((field << 3) | wire)


def _f32(field, v):
    if v == 0:
        return b''  # proto3 default, omitted
    return _key(field, 5) + struct.pack('<f', float(v))


def _i32(field, v):
    return _key(field, 0) + _varint(int(v)) if v else b''


def _bytes(field, b):
    return _key(field, 2) + _varint(len(b)) + b


def _str(field, s):
    return _bytes(field, s.encode('utf-8'))


def affine(cx, cy, w, h, scale=1.0, rot=0.0, sx=None, sy=None):
    """Matrix that draws a w×h image centred at (cx, cy) with scale and rotation (degrees)."""
    sx = scale if sx is None else sx
    sy = scale if sy is None else sy
    r = math.radians(rot)
    cos, sin = math.cos(r), math.sin(r)
    a, b = sx * cos, sx * sin
    c, d = -sy * sin, sy * cos
    tx = cx - (a * w / 2 + c * h / 2)
    ty = cy - (b * w / 2 + d * h / 2)
    return a, b, c, d, tx, ty


def frame(alpha, w, h, matrix):
    if alpha <= 0.002:
        return b''  # empty frame = hidden
    lay = _f32(1, 0) + _f32(2, 0) + _f32(3, w) + _f32(4, h)
    a, b, c, d, tx, ty = matrix
    tr = _f32(1, round(a, 4)) + _f32(2, round(b, 4)) + _f32(3, round(c, 4)) + _f32(4, round(d, 4)) + _f32(5, round(tx, 2)) + _f32(6, round(ty, 2))
    return _f32(1, round(min(alpha, 1.0), 3)) + _bytes(2, lay) + _bytes(3, tr)


class Movie:
    def __init__(self, width, height, fps, frames):
        self.w, self.h, self.fps, self.frames = width, height, fps, frames
        self.images = {}  # key -> (png bytes, w, h)
        self.sprites = []

    def image(self, key, png_bytes, w, h):
        self.images[key] = (png_bytes, w, h)
        return key

    def sprite(self, key, fn):
        """fn(i, t) -> None | dict(x, y, scale=1, rot=0, alpha=1, sx=None, sy=None)"""
        _, w, h = self.images[key]
        frames = []
        for i in range(self.frames):
            st = fn(i, i / (self.frames - 1))
            if not st or st.get('alpha', 1) <= 0.002:
                frames.append(b'')
                continue
            m = affine(st['x'], st['y'], w, h, st.get('scale', 1), st.get('rot', 0), st.get('sx'), st.get('sy'))
            frames.append(frame(st.get('alpha', 1), w, h, m))
        self.sprites.append((key, frames))

    def encode(self):
        params = _f32(1, self.w) + _f32(2, self.h) + _i32(3, self.fps) + _i32(4, self.frames)
        body = _str(1, '2.0.0') + _bytes(2, params)
        for k, (png, _w, _h) in self.images.items():
            body += _bytes(3, _str(1, k) + _bytes(2, png))
        for key, frames in self.sprites:
            sp = _str(1, key)
            for f in frames:
                sp += _bytes(2, f)
            body += _bytes(4, sp)
        return zlib.compress(body, 9)
