# Seamless surface textures for the corporate office: the floor plate's polished concrete
# and the rooms' carpet tiles. Written as PNGs the scene tiles across its floors.
#
#   make models    writes frontend/public/scenes/corporate-office/{concrete,carpet}.png
#
# Runs in Blender's Python for numpy; nothing here needs Blender itself.

import os
import struct
import zlib

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "frontend", "public", "scenes", "corporate-office"))
rng = np.random.default_rng(7)


def blur(a, r):
    """A box blur that wraps at the edges, so the texture stays seamless."""
    for axis in (0, 1):
        acc = np.zeros_like(a)
        for k in range(-r, r + 1):
            acc += np.roll(a, k, axis=axis)
        a = acc / (2 * r + 1)
    return a


def noise(size, r):
    n = blur(rng.standard_normal((size, size)), r)
    return n / (np.abs(n).max() + 1e-9)


def png(path, rgb):
    h, w, _ = rgb.shape
    data = np.clip(rgb * 255, 0, 255).astype(np.uint8)
    raw = b"".join(b"\x00" + data[y].tobytes() for y in range(h))

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def concrete(size=512):
    """Polished concrete: soft clouding, fine aggregate, and a saw-cut joint round the tile."""
    base = np.array([0.80, 0.78, 0.74])
    cloud = noise(size, 40) * 0.05 + noise(size, 12) * 0.025
    grain = rng.standard_normal((size, size)) * 0.012
    speck = (rng.random((size, size)) > 0.996) * -0.12
    shade = 1 + cloud + grain + speck
    edge = np.zeros((size, size))
    edge[:2, :] = edge[:, :2] = -0.12
    shade = shade + edge
    return base[None, None, :] * shade[:, :, None]


def carpet(size=512):
    """Carpet tiles, four to a texture, each laid at right angles to the next."""
    tile = size // 2
    rows = np.broadcast_to(np.arange(size)[:, None] % 6 < 3, (size, size))
    cols = np.broadcast_to(np.arange(size)[None, :] % 6 < 3, (size, size))
    pile = rng.standard_normal((size, size)) * 0.06 + noise(size, 3) * 0.08
    shade = np.ones((size, size)) + pile
    for ty in range(2):
        for tx in range(2):
            ys, xs = slice(ty * tile, (ty + 1) * tile), slice(tx * tile, (tx + 1) * tile)
            stripes = rows if (tx + ty) % 2 == 0 else cols
            shade[ys, xs] += np.where(stripes[ys, xs], 0.035, -0.035)
    shade[::tile, :] -= 0.18
    shade[:, ::tile] -= 0.18
    # Grey, so the scene can tint it with each department's colour.
    return np.repeat(np.clip(shade * 0.62, 0, 1)[:, :, None], 3, axis=2)


def ceiling(size=512):
    """Acoustic ceiling tiles, 600 mm, two by two, in a white grid with a faint fissured face."""
    tile = size // 2
    face = 0.9 + noise(size, 2) * 0.04 + (rng.random((size, size)) > 0.985) * -0.06
    shade = np.repeat(face[:, :, None], 3, axis=2) * np.array([0.98, 0.97, 0.95])
    grid = np.zeros((size, size), bool)
    for k in (0, tile):
        grid[k : k + 5, :] = grid[:, k : k + 5] = True
    shade[grid] = np.array([0.99, 0.99, 0.98])
    # A thin shadow line where each tile sits in the grid.
    for k in (5, tile + 5):
        shade[k : k + 2, :] *= 0.86
        shade[:, k : k + 2] *= 0.86
    return np.clip(shade, 0, 1)


os.makedirs(OUT, exist_ok=True)
png(os.path.join(OUT, "concrete.png"), concrete())
png(os.path.join(OUT, "carpet.png"), carpet())
png(os.path.join(OUT, "ceiling.png"), ceiling())
print(f"surfaces: concrete.png, carpet.png, ceiling.png -> {OUT}")
