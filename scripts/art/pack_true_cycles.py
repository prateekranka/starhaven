#!/usr/bin/env python3
"""Pack 8-direction unique-dir atlases from walk/attack/gather/build/death sheets. No mirroring."""
from __future__ import annotations

import hashlib
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "media" / "sprites"
TEX = ROOT / "media" / "textures"
SHEETS = ROOT / "assets" / "sheets"
SRC = SHEETS

DIRECTION_ROWS = {"S": 0, "SE": 1, "E": 2, "NE": 3, "N": 4, "NW": 5, "W": 6, "SW": 7}
DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
CLIPS = ["walk", "attack", "gather", "build", "death"]
# Four distinct gait/combat frames from an 8-col sheet (skip inbetween fakes).
FRAME_COLS = {
    "walk": [0, 2, 4, 6],
    "attack": [0, 2, 4, 6],
    "gather": [0, 2, 4, 6],
    "build": [0, 2, 4, 6],
    "death": [0, 2, 4, 6],
}

UNITS = [
    {
        "id": "cog-walk",
        "faction": "cogforged",
        "walk": "sheet-cogforged-walk.png",
        "attack": "sheet-cogforged-attack.png",
        "gather": "sheet-cogforged-gather.png",
        "build": "sheet-cogforged-build.png",
        "death": "sheet-cogforged-death.png",
    },
    {
        "id": "cog-guard",
        "faction": "cogforged",
        "walk": "sheet-cog-guard.png",
        "attack": "sheet-cog-guard-attack.png",
        "gather": "sheet-cog-guard-gather.png",
        "build": "sheet-cog-guard-build.png",
        "death": "sheet-cog-guard-death.png",
    },
    {
        "id": "ash-walk",
        "faction": "ashvein",
        "walk": "sheet-ashvein-walk.png",
        "attack": "sheet-ashvein-attack.png",
        "gather": "sheet-ashvein-gather.png",
        "build": "sheet-ashvein-build.png",
        "death": "sheet-ashvein-death.png",
    },
    {
        "id": "ash-guard",
        "faction": "ashvein",
        "walk": "sheet-ash-guard.png",
        "attack": "sheet-ash-guard-attack.png",
        "gather": "sheet-ash-guard-gather.png",
        "build": "sheet-ash-guard-build.png",
        "death": "sheet-ash-guard-death.png",
    },
    {
        "id": "storm-walk",
        "faction": "stormveil",
        "walk": "sheet-stormveil-walk.png",
        "attack": "sheet-stormveil-attack.png",
        "gather": "sheet-stormveil-gather.png",
        "build": "sheet-stormveil-build.png",
        "death": "sheet-stormveil-death.png",
    },
    {
        "id": "storm-guard",
        "faction": "stormveil",
        "walk": "sheet-storm-guard.png",
        "attack": "sheet-storm-guard-attack.png",
        "gather": "sheet-storm-guard-gather.png",
        "build": "sheet-storm-guard-build.png",
        "death": "sheet-storm-guard-death.png",
    },
]


def is_void(r: int, g: int, b: int) -> bool:
    # Studio void / gray plate only — keep painted dark stone / armor / cloth.
    mx, mn = max(r, g, b), min(r, g, b)
    if mx < 12:
        return True
    if mx < 110 and (mx - mn) <= 8:
        return True
    return False


def knockout_void(img: Image.Image) -> Image.Image:
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
    return rgba


def is_sand(r: int, g: int, b: int) -> bool:
    """Mesa disc: tan/sand, not canvas-blue or magma-orange."""
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if lum < 35 or lum > 210:
        return False
    if b > r + 8 and b > g:
        return False  # sky/cloth blue
    if r > 200 and g < 90:
        return False  # hot magma
    return r >= g - 8 and g >= b - 4 and (r - b) >= 12


def knockout_ground_disc(img: Image.Image) -> Image.Image:
    rgba = knockout_void(img)
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
    # also seed from lower third interior where discs sit
    for x in range(0, w, 8):
        for y in range(int(h * 0.62), h):
            r, g, b, a = px[x, y]
            if a >= 16 and is_sand(r, g, b):
                push(x, y)
    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        if a < 8:
            continue
        if not (is_void(r, g, b) or is_sand(r, g, b)):
            continue
        px[x, y] = (0, 0, 0, 0)
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)
    bbox = rgba.split()[-1].getbbox()
    if bbox:
        pad = 8
        l, t, r, b = bbox
        rgba = rgba.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))
    return rgba


def cell(sheet: Image.Image, col: int, row: int, size: int = 128) -> Image.Image:
    return sheet.crop((col * size, row * size, (col + 1) * size, (row + 1) * size)).convert("RGBA")


def write_atlas_json(png: Path, meta: Path, unit_id: str, faction: str, frames: list) -> None:
    data = png.read_bytes()
    payload = {
        "version": "unit-atlas.v1",
        "id": unit_id,
        "faction": faction,
        "path": f"media/sprites/{png.name}",
        "width": 2048,
        "height": 1280,
        "cell": 128,
        "cols": 16,
        "rows": 10,
        "uniqueDirections": 8,
        "mirrored": False,
        "clips": [
            {"id": "walk", "frames": 4, "durationMs": 110, "loop": True},
            {"id": "attack", "frames": 4, "durationMs": 100, "loop": False},
            {"id": "gather", "frames": 4, "durationMs": 140, "loop": True},
            {"id": "build", "frames": 4, "durationMs": 140, "loop": True},
            {"id": "death", "frames": 4, "durationMs": 100, "loop": False},
        ],
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "frames": frames,
    }
    meta.write_text(json.dumps(payload, indent=2) + "\n")


def pack_unit(spec: dict) -> None:
    sheets = {}
    for kind in ("walk", "attack", "gather", "build", "death"):
        name = spec[kind]
        src = SRC / name
        if not src.exists():
            raise SystemExit(f"missing {src}")
        img = knockout_void(Image.open(src))
        sheets[kind] = img
        uniq = set()
        for r in range(8):
            for c in range(8):
                uniq.add(hashlib.md5(cell(img, c, r).tobytes()).hexdigest())
        print(f"  {name:32} unique_cells={len(uniq)}/64")

    atlas = Image.new("RGBA", (2048, 1280), (0, 0, 0, 0))
    frames = []
    for action_index, action in enumerate(CLIPS):
        src = sheets[action]
        cols = FRAME_COLS[action]
        for direction_index, direction in enumerate(DIRECTIONS):
            src_row = DIRECTION_ROWS[direction]
            for frame, src_col in enumerate(cols):
                tile = cell(src, src_col, src_row)
                col = direction_index * 2 + (frame % 2)
                row = action_index * 2 + (frame // 2)
                atlas.paste(tile, (col * 128, row * 128), tile)
                frames.append(
                    {
                        "id": f"{spec['id']}.{action}.{direction}.{frame}",
                        "action": action,
                        "facing": direction,
                        "frame": frame,
                        "durationMs": {"walk": 110, "gather": 140, "build": 140}.get(action, 100),
                        "pivot": {"x": 64, "y": 112},
                        "mirrored": False,
                        "col": col,
                        "row": row,
                        "sourceCol": src_col,
                        "sourceRow": src_row,
                    }
                )
    out_png = SPR / f"{spec['id']}.atlas.png"
    out_json = SPR / f"{spec['id']}.atlas.json"
    atlas.save(out_png, optimize=True, compress_level=9)
    write_atlas_json(out_png, out_json, spec["id"], spec["faction"], frames)
    print(f"  packed {out_png.name} {out_png.stat().st_size//1024}KB")


def main() -> None:
    units_only = "--units-only" in sys.argv
    only = None
    for arg in sys.argv[1:]:
        if arg.startswith("--only="):
            only = arg.split("=", 1)[1]
    if not units_only:
        print("Banners…")
        for banner in ("ashvein-banner.jpg", "stormveil-banner.jpg"):
            src = SRC / banner
            Image.open(src).convert("RGB").save(TEX / banner, quality=88, optimize=True)
            print(f"  {banner} {(TEX/banner).stat().st_size//1024}KB")

        print("Storm mill/mine (drop ground disc)…")
        for name in ("bldg-storm-mill.png", "bldg-storm-mine.png"):
            img = knockout_ground_disc(Image.open(SRC / name))
            img.save(SPR / name, optimize=True, compress_level=9)
            a = list(img.split()[-1].getdata())
            z = sum(1 for v in a if v < 16)
            print(f"  {name} {img.size} alpha0={100*z/len(a):.1f}% { (SPR/name).stat().st_size//1024}KB")

    print("Pack 8-dir atlases…")
    for spec in UNITS:
        if only and spec["faction"] != only and spec["id"] != only:
            continue
        pack_unit(spec)
    print("done")


if __name__ == "__main__":
    main()
