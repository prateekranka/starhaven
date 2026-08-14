#!/usr/bin/env python3
"""Cut studio-black backdrops out of Cogforged building and atlas sprites.

Painted cog PNGs shipped fully opaque (A=255) with ~50% near-black fill.
The lit billboard shader discards only tex.a < 0.22, so that fill draws as
black rectangles around the Foundry Core and Assemblers.
"""
from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "media" / "sprites"
CELL = 128


def is_void(r: int, g: int, b: int) -> bool:
    # Studio black / (1,2,1) fringe. Keep dark brass (max typically > 40).
    return max(r, g, b) < 14


def knockout_from_edges(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not seen[y * w + x]:
            q.append((x, y))
            seen[y * w + x] = 1

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        if a < 8 or not is_void(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)
    # Punch leftover enclosed studio (walled-off cells / pockets).
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= 8 and is_void(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    return rgba


def trim_alpha(img: Image.Image, pad: int = 10) -> Image.Image:
    bbox = img.split()[-1].getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    return img.crop(
        (max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad))
    )


def knockout_atlas_cells(img: Image.Image, cell: int = CELL) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cols, rows = w // cell, h // cell
    for row in range(rows):
        for col in range(cols):
            box = (col * cell, row * cell, (col + 1) * cell, (row + 1) * cell)
            tile = knockout_from_edges(rgba.crop(box))
            out.paste(tile, box[:2], tile)
    return out


def save_png(img: Image.Image, path: Path) -> None:
    img.save(path, optimize=True, compress_level=9)


def update_atlas_json(png: Path) -> None:
    meta = png.with_suffix(".atlas.json") if png.name.endswith(".atlas.png") else png.with_name(png.name.replace(".atlas.png", ".atlas.json"))
    # cog-walk.atlas.png -> cog-walk.atlas.json
    meta = Path(str(png).replace(".atlas.png", ".atlas.json"))
    if not meta.exists():
        return
    data = png.read_bytes()
    payload = json.loads(meta.read_text())
    payload["sha256"] = hashlib.sha256(data).hexdigest()
    payload["bytes"] = len(data)
    payload["width"] = Image.open(png).size[0]
    payload["height"] = Image.open(png).size[1]
    meta.write_text(json.dumps(payload, indent=2) + "\n")


def stats(img: Image.Image) -> str:
    a = list(img.split()[-1].getdata())
    z = sum(1 for v in a if v == 0)
    return f"{img.size[0]}x{img.size[1]} alpha0={100 * z / len(a):.1f}%"


def main() -> None:
    buildings = sorted(SPR.glob("bldg-cog-*.png"))
    print("Buildings…")
    for path in buildings:
        img = knockout_from_edges(Image.open(path))
        img = trim_alpha(img, pad=12)
        save_png(img, path)
        print(f"  {path.name:28} {stats(img)} {path.stat().st_size // 1024}KB")

    stills = [SPR / "icon-age-cog.png", SPR / "unit-cog-strider.png", SPR / "unit-cog-siege.png"]
    print("Stills…")
    for path in stills:
        if not path.exists():
            print(f"  skip {path.name}")
            continue
        img = knockout_from_edges(Image.open(path))
        img = trim_alpha(img, pad=8)
        save_png(img, path)
        print(f"  {path.name:28} {stats(img)} {path.stat().st_size // 1024}KB")

    print("Atlases…")
    for path in sorted(SPR.glob("cog-*.atlas.png")):
        img = knockout_atlas_cells(Image.open(path))
        save_png(img, path)
        update_atlas_json(path)
        print(f"  {path.name:28} {stats(img)} {path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
