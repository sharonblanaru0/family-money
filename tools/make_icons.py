"""Draws the app icons: a silver guilloche rosette on navy. Run: python tools/make_icons.py"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
NAVY = (20, 33, 61)
SILVER = (205, 214, 228)
BLUE = (110, 160, 230)


def ring(c, R, A, B, n, m, ph, steps=720):
    pts = []
    for i in range(steps + 1):
        t = i / steps * math.tau
        r = R + A * math.sin(n * t + ph) + B * math.sin(m * t - ph * 1.7)
        pts.append((c + r * math.cos(t), c + r * math.sin(t)))
    return pts


def rosette_paths(c, scale):
    paths = []
    for k in range(16):
        paths.append((ring(c, 74 * scale, 13 * scale, 4 * scale, 12, 24, k * math.tau / 16), BLUE))
    for k in range(10):
        paths.append((ring(c, 40 * scale, 7 * scale, 2.5 * scale, 8, 16, k * math.tau / 10), SILVER))
    return paths


def png(size, name):
    ss = 4
    big = size * ss
    img = Image.new("RGB", (big, big), NAVY)
    d = ImageDraw.Draw(img)
    scale = big / 200 * 0.78          # keeps the rosette inside the maskable safe zone
    for pts, col in rosette_paths(big / 2, scale):
        d.line(pts, fill=col, width=max(2, round(big / 300)), joint="curve")
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)


def svg():
    parts = []
    for pts, col in rosette_paths(100, 0.78):
        dpath = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts[::4]) + "Z"
        parts.append(f'<path d="{dpath}" stroke="rgb{col}"/>')
    (OUT / "icon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">'
        '<rect width="200" height="200" rx="44" fill="rgb(20,33,61)"/>'
        f'<g fill="none" stroke-width="1.1">{"".join(parts)}</g></svg>', encoding="utf-8")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    png(192, "icon-192.png")
    png(512, "icon-512.png")
    png(180, "apple-touch-icon.png")
    svg()
    print("icons written to", OUT)
