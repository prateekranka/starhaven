#!/usr/bin/env python3
"""Fit painted Ashvein full-body walk gait into ash-walk.atlas.png walk clip slots."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve()
SUNFOLD = HERE.parents[2]
CKPT = Path("/Users/prateekranka/Cowork/starhaven-checkpoint-3c")
ROOT = CKPT if (CKPT / "media" / "sprites" / "ash-walk.atlas.png").exists() else SUNFOLD
CUT = SUNFOLD / "ash-gatherer-preview" / "walk-8dir"
SPR = ROOT / "media" / "sprites"
SHEETS = ROOT / "assets" / "sheets"

DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"]
CYCLE = ["A", "C", "B", "D"]  # stride, pass, opposite, pass2
PACK_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
CELL = 128


def fit_cell(src: Image.Image, cell: int = CELL) -> Image.Image:
    img = src.convert("RGBA")
    bbox = img.split()[-1].getbbox()
    if bbox:
        l, t, r, b = bbox
        img = img.crop((max(0, l - 4), max(0, t - 4), min(img.width, r + 4), min(img.height, b + 4)))
    tw, th = img.size
    scale = min((cell - 8) / max(tw, 1), (cell - 8) / max(th, 1))
    nw, nh = max(1, int(tw * scale)), max(1, int(th * scale))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    out.paste(resized, ((cell - nw) // 2, cell - nh - 4), resized)
    return out


def load_frame(d: str, fr: str) -> Image.Image:
    path = CUT / f"walk-{d}-{fr}.png"
    if not path.exists() and fr == "A":
        path = CUT / f"walk-{d}.png"
    if not path.exists():
        raise SystemExit(f"missing {path}")
    return Image.open(path)


def main() -> None:
    atlas_path = SPR / "ash-walk.atlas.png"
    meta_path = SPR / "ash-walk.atlas.json"
    if not atlas_path.exists():
        raise SystemExit(f"missing {atlas_path}")
    atlas = Image.open(atlas_path).convert("RGBA")

    tiles = {}
    for d in DIRS:
        for i, fr in enumerate(CYCLE):
            tiles[(d, i)] = fit_cell(load_frame(d, fr))

    # Walk clip occupies action_index 0: rows 0-1, cols per DIRECTIONS
    for direction_index, direction in enumerate(PACK_DIRS):
        for frame in range(4):
            col = direction_index * 2 + (frame % 2)
            row = 0 * 2 + (frame // 2)
            tile = tiles[(direction, frame)]
            atlas.paste(tile, (col * CELL, row * CELL), tile)

    SHEETS.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    row_of = {d: i for i, d in enumerate(DIRS)}
    for d in DIRS:
        for frame, src_col in enumerate((0, 2, 4, 6)):
            sheet.paste(tiles[(d, frame)], (src_col * CELL, row_of[d] * CELL), tiles[(d, frame)])
    sheet_path = SHEETS / "sheet-ashvein-walk.png"
    sheet.save(sheet_path, optimize=True, compress_level=9)

    atlas.save(atlas_path, optimize=True, compress_level=9)
    data = atlas_path.read_bytes()
    meta = json.loads(meta_path.read_text())
    meta["sha256"] = hashlib.sha256(data).hexdigest()
    meta["bytes"] = len(data)
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    print(f"packed walk into {atlas_path} {len(data)//1024}KB root={ROOT}")
    print(f"wrote {sheet_path} {sheet_path.stat().st_size//1024}KB")


if __name__ == "__main__":
    main()
