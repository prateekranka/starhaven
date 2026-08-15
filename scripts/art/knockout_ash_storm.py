#!/usr/bin/env python3
"""Knock studio plates out of Stormveil buildings and Ashvein walk atlas.

Stormveil TCs/buildings shipped fully opaque (A=255) with ~50–80% near-black
fill — same class of bug as pre-knockout Cogforged. The lit billboard shader
discards only tex.a < 0.22, so that fill draws as a black rectangle.

Ashvein walk cells already have real alpha, but a gray/near-black halo clings
to the silhouette (and lower atlas rows are still opaque studio/grid). Flood
from existing transparent pixels so the halo goes away without eating magma
or enclosed obsidian.
"""
from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "media" / "sprites"
CUT = ROOT / "ash-gatherer-preview" / "walk-8dir"
CELL = 128

DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"]
CYCLE = ["A", "C", "B", "D"]
PACK_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def is_magma(r: int, g: int, b: int) -> bool:
    return r >= 70 and r > g + 12 and r > b


def is_studio_black(r: int, g: int, b: int) -> bool:
    return max(r, g, b) < 14


def is_gray_halo(r: int, g: int, b: int, *, ceiling: int = 52) -> bool:
    mx, mn = max(r, g, b), min(r, g, b)
    return (mx - mn) <= 10 and mx < ceiling and not is_magma(r, g, b)


def knockout_from_edges(
    img: Image.Image, *, ash: bool = False, studio_gray: bool = False
) -> Image.Image:
    """Flood from the border (and existing holes). Spread through void; stop at figure."""
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
    if ash:
        for y in range(h):
            for x in range(w):
                if px[x, y][3] < 8:
                    push(x, y)

    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        ceiling = 96 if studio_gray else 52
        void = a < 8 or is_studio_black(r, g, b) or (
            ash and is_gray_halo(r, g, b, ceiling=ceiling)
        )
        if not void:
            continue
        if a >= 8:
            px[x, y] = (0, 0, 0, 0)
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)

    if not ash:
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a >= 8 and is_studio_black(r, g, b):
                    px[x, y] = (0, 0, 0, 0)
    return rgba


def punch_dark_fringe(img: Image.Image) -> Image.Image:
    """Drop LANCZOS near-black semi-pixels that read as a dirty halo on the mesa."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a >= 200:
                continue
            if is_magma(r, g, b):
                continue
            if max(r, g, b) < 72:
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


def fit_cell(src: Image.Image, cell: int = CELL) -> Image.Image:
    img = knockout_from_edges(src, ash=True)
    bbox = img.split()[-1].getbbox()
    if bbox:
        l, t, r, b = bbox
        img = img.crop((max(0, l - 4), max(0, t - 4), min(img.width, r + 4), min(img.height, b + 4)))
    tw, th = img.size
    scale = min((cell - 8) / max(tw, 1), (cell - 8) / max(th, 1))
    nw, nh = max(1, int(tw * scale)), max(1, int(th * scale))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    resized = knockout_from_edges(resized, ash=True)
    resized = punch_dark_fringe(resized)
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    out.paste(resized, ((cell - nw) // 2, cell - nh - 4), resized)
    return punch_dark_fringe(knockout_from_edges(out, ash=True))


def knockout_atlas_cells(img: Image.Image, *, ash: bool) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cols, rows = w // CELL, h // CELL
    for row in range(rows):
        for col in range(cols):
            box = (col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL)
            # Walk occupies rows 0–1. Lower rows are old studio portraits/grid.
            tile = knockout_from_edges(rgba.crop(box), ash=ash, studio_gray=ash and row >= 2)
            out.paste(tile, box[:2], tile)
    return out


def save_png(img: Image.Image, path: Path) -> None:
    img.save(path, optimize=True, compress_level=9)


def update_atlas_json(png: Path) -> None:
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


def load_frame(d: str, fr: str) -> Image.Image:
    path = CUT / f"walk-{d}-{fr}.png"
    if not path.exists() and fr == "A":
        path = CUT / f"walk-{d}.png"
    if not path.exists():
        raise SystemExit(f"missing {path}")
    return Image.open(path)


def clear_cell(atlas: Image.Image, col: int, row: int) -> None:
    empty = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    atlas.paste(empty, (col * CELL, row * CELL))


def pack_ash_walk(atlas: Image.Image) -> Image.Image:
    if not CUT.exists():
        return knockout_atlas_cells(atlas, ash=True)
    for direction_index, direction in enumerate(PACK_DIRS):
        for frame in range(4):
            src = load_frame(direction, CYCLE[frame])
            tile = fit_cell(src)
            col = direction_index * 2 + (frame % 2)
            row = frame // 2
            clear_cell(atlas, col, row)
            atlas.paste(tile, (col * CELL, row * CELL), tile)
    return knockout_atlas_cells(atlas, ash=True)


def main() -> None:
    print("Stormveil buildings…")
    for path in sorted(SPR.glob("bldg-storm-*.png")):
        img = Image.open(path)
        a = img.split()[-1] if img.mode == "RGBA" else None
        zeros = 0
        if a is not None:
            zeros = sum(1 for v in a.getdata() if v == 0)
        if zeros / max(1, img.width * img.height) > 0.9:
            print(f"  skip {path.name} (already empty)")
            continue
        out = knockout_from_edges(img, ash=False)
        out = trim_alpha(out, pad=12)
        save_png(out, path)
        print(f"  {path.name:28} {stats(out)} {path.stat().st_size // 1024}KB")

    atlas_path = SPR / "ash-walk.atlas.png"
    print("Ashvein walk atlas…")
    atlas = Image.open(atlas_path).convert("RGBA")
    atlas = pack_ash_walk(atlas)
    save_png(atlas, atlas_path)
    update_atlas_json(atlas_path)
    print(f"  {atlas_path.name:28} {stats(atlas)} {atlas_path.stat().st_size // 1024}KB")

    print("Unit atlas sheets…")
    for sheet in [
        "cog-guard.atlas.png",
        "cog-walk.atlas.png",
        "ash-guard.atlas.png",
        "ash-walk.atlas.png",
        "storm-guard.atlas.png",
        "storm-walk.atlas.png",
    ]:
        path = SPR / sheet
        img = Image.open(path).convert("RGBA")
        out = knockout_atlas_cells(img, ash="ash-" in sheet)
        save_png(out, path)
        update_atlas_json(path)
        print(f"  {sheet:28} {stats(out)} {path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
