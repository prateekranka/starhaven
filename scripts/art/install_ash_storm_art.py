#!/usr/bin/env python3
"""Install Grok-painted Ashvein/Stormveil art: knockout, icons, atlas pack. No palette lock."""
from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "media" / "sprites"
TEX = ROOT / "media" / "textures"
SHEETS = ROOT / "assets" / "sheets"
SRC = Path(
    "/Users/prateekranka/.cursor/projects/Users-prateekranka-Cowork-sunfold-cursor-good-version/assets"
)

DIRECTION_ROWS = {"S": 0, "SE": 1, "E": 2, "NE": 3, "N": 4, "NW": 5, "W": 6, "SW": 7}
DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
MIRROR_SOURCE = {"SW": "SE", "W": "E", "NW": "NE"}
CLIPS = ["walk", "attack", "gather", "build", "death"]
CLIP_COLS = {
    "walk": {"A": 0, "B": 4},
    "attack": {"A": 2, "B": 6},
    "gather": {"A": 1, "B": 5},
    "build": {"A": 3, "B": 7},
    "death": {"A": 0, "B": 3},
}
PATTERNS = {
    "walk": ["A", "A", "B", "B"],
    "attack": ["A", "A", "B", "B"],
    "gather": ["A", "A", "B", "B"],
    "build": ["A", "A", "B", "B"],
    "death": ["A", "A", "B", "B"],
}

COPY_SPRITES = [
    "portrait-ashvein.png",
    "portrait-stormveil.png",
    "bldg-ash-tc.png",
    "bldg-ash-house.png",
    "bldg-ash-rax.png",
    "bldg-ash-mill.png",
    "bldg-ash-wonder.png",
    "bldg-ash-lumber.png",
    "bldg-ash-mine.png",
    "bldg-ash-spire.png",
    "bldg-ash-den.png",
    "bldg-ash-workshop.png",
    "bldg-ash-tunnel-mouth.png",
    "bldg-ash-lava-vent.png",
    "bldg-storm-tc.png",
    "bldg-storm-house.png",
    "bldg-storm-rax.png",
    "bldg-storm-mill.png",
    "bldg-storm-wonder.png",
    "bldg-storm-lumber.png",
    "bldg-storm-mine.png",
    "bldg-storm-spire.png",
    "bldg-storm-den.png",
    "bldg-storm-workshop.png",
    "unit-ash-strider.png",
    "unit-ash-siege.png",
    "unit-storm-strider.png",
    "unit-storm-siege.png",
    "unit-storm-wagon.png",
    "icon-age-ash.png",
    "icon-age-storm.png",
]

KNOCKOUT = [n for n in COPY_SPRITES if not n.startswith("portrait-")]


def is_bg(r: int, g: int, b: int) -> bool:
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / max(mx, 1)
    return lum < 26 and sat < 0.22


def knockout_clean(img: Image.Image) -> Image.Image:
    """Edge flood-fill only; do not smooth (SMOOTH would blur pixels)."""
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
        if a < 8 or not is_bg(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)
    return rgba


def trim_alpha(img: Image.Image, pad: int = 8) -> Image.Image:
    bbox = img.split()[-1].getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(img.width, r + pad)
    b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


def fit_cell(src: Image.Image, cell: int = 128) -> Image.Image:
    trimmed = trim_alpha(src, pad=4)
    tw, th = trimmed.size
    scale = min((cell - 8) / max(tw, 1), (cell - 8) / max(th, 1))
    nw, nh = max(1, int(tw * scale)), max(1, int(th * scale))
    resized = trimmed.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    out.paste(resized, ((cell - nw) // 2, cell - nh - 4), resized)
    return out


def crop_icon(src: Image.Image, size: int = 128) -> Image.Image:
    trimmed = trim_alpha(src, pad=2)
    side = min(trimmed.width, trimmed.height)
    left = (trimmed.width - side) // 2
    top = max(0, trimmed.height - side)
    square = trimmed.crop((left, top, left + side, top + side))
    return square.resize((size, size), Image.Resampling.LANCZOS)


def cell_from_sheet(sheet: Image.Image, col: int, row: int, cell: int = 128) -> Image.Image:
    return sheet.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))


def pack_sheet_atlas(sheet: Image.Image, out_png: Path, out_json: Path, unit_id: str, faction: str) -> None:
    cell = 128
    atlas = Image.new("RGBA", (16 * cell, 10 * cell), (0, 0, 0, 0))
    frames = []
    for action_index, action in enumerate(CLIPS):
        pattern = PATTERNS[action]
        for direction_index, direction in enumerate(DIRECTIONS):
            source_dir = MIRROR_SOURCE.get(direction, direction)
            mirror = direction in MIRROR_SOURCE
            src_row = DIRECTION_ROWS[source_dir]
            for frame in range(4):
                pose = pattern[frame]
                src_col = CLIP_COLS[action][pose]
                tile = cell_from_sheet(sheet, src_col, src_row, cell).convert("RGBA")
                if mirror:
                    tile = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                col = direction_index * 2 + (frame % 2)
                row = action_index * 2 + (frame // 2)
                atlas.paste(tile, (col * cell, row * cell), tile)
                frames.append(
                    {
                        "id": f"{unit_id}.{action}.{direction}.{frame}",
                        "action": action,
                        "facing": direction,
                        "frame": frame,
                        "durationMs": 110 if action == "walk" else 100,
                        "pivot": {"x": 64, "y": 112},
                        "mirrored": mirror,
                        "col": col,
                        "row": row,
                    }
                )
    atlas.save(out_png, optimize=True, compress_level=9)
    write_atlas_json(out_png, out_json, unit_id, faction, frames)


def pack_still_atlas(still: Image.Image, out_png: Path, out_json: Path, unit_id: str, faction: str) -> None:
    cell = 128
    tile = fit_cell(still, cell)
    atlas = Image.new("RGBA", (16 * cell, 10 * cell), (0, 0, 0, 0))
    frames = []
    for action_index, action in enumerate(CLIPS):
        for direction_index, direction in enumerate(DIRECTIONS):
            mirror = direction in MIRROR_SOURCE
            stamp = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if mirror else tile
            for frame in range(4):
                col = direction_index * 2 + (frame % 2)
                row = action_index * 2 + (frame // 2)
                atlas.paste(stamp, (col * cell, row * cell), stamp)
                frames.append(
                    {
                        "id": f"{unit_id}.{action}.{direction}.{frame}",
                        "action": action,
                        "facing": direction,
                        "frame": frame,
                        "durationMs": 110,
                        "pivot": {"x": 64, "y": 112},
                        "mirrored": mirror,
                        "col": col,
                        "row": row,
                    }
                )
    atlas.save(out_png, optimize=True, compress_level=9)
    write_atlas_json(out_png, out_json, unit_id, faction, frames)


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


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True, compress_level=9)
    print(f"  {path.name} {img.size} {path.stat().st_size // 1024}KB")


def main() -> None:
    missing = [n for n in COPY_SPRITES if not (SRC / n).exists()]
    if missing:
        raise SystemExit(f"missing generated files: {missing}")

    print("Copy + knockout…")
    for name in COPY_SPRITES:
        img = Image.open(SRC / name)
        if name in KNOCKOUT:
            img = knockout_clean(img)
            if name.startswith("bldg-") or name.startswith("unit-"):
                img = trim_alpha(img, pad=12)
        else:
            img = img.convert("RGBA")
        save_png(img, SPR / name)

    for banner in ("ashvein-banner.jpg", "stormveil-banner.jpg"):
        src = SRC / banner
        if src.exists():
            Image.open(src).convert("RGB").save(TEX / banner, quality=88, optimize=True)
            print(f"  {banner} { (TEX / banner).stat().st_size // 1024}KB")

    print("Icons + unit portraits…")
    ash_builds = [
        ("house", "house"),
        ("mill", "mill"),
        ("lumber", "lumber"),
        ("mine", "mine"),
        ("barracks", "rax"),
        ("spire", "spire"),
        ("den", "den"),
        ("workshop", "workshop"),
        ("wonder", "wonder"),
        ("tunnel-mouth", "tunnel-mouth"),
        ("lava-vent", "lava-vent"),
    ]
    for btype, key in ash_builds:
        src = Image.open(SPR / f"bldg-ash-{key}.png")
        save_png(crop_icon(src), SPR / f"icon-build-ash-{btype}.png")

    storm_builds = [
        ("house", "house"),
        ("mill", "mill"),
        ("lumber", "lumber"),
        ("mine", "mine"),
        ("barracks", "rax"),
        ("spire", "spire"),
        ("den", "den"),
        ("workshop", "workshop"),
        ("wonder", "wonder"),
        ("wagon", "tc"),
    ]
    for btype, key in storm_builds:
        src = Image.open(SPR / f"bldg-storm-{key}.png")
        save_png(crop_icon(src), SPR / f"icon-build-storm-{btype}.png")

    save_png(crop_icon(Image.open(SPR / "icon-age-ash.png")), SPR / "icon-age-ash.png")
    save_png(crop_icon(Image.open(SPR / "icon-age-storm.png")), SPR / "icon-age-storm.png")

    ash_walk = Image.open(SHEETS / "sheet-ashvein-walk.png")
    ash_guard = Image.open(SHEETS / "sheet-ash-guard.png")
    storm_walk = Image.open(SHEETS / "sheet-stormveil-walk.png")
    storm_guard = Image.open(SHEETS / "sheet-storm-guard.png")

    save_png(crop_icon(ash_walk, 256), SPR / "portrait-ash-villager.png")
    save_png(crop_icon(ash_walk, 256), SPR / "portrait-ash-scout.png")
    save_png(crop_icon(ash_guard, 256), SPR / "portrait-ash-guard.png")
    save_png(crop_icon(ash_guard, 256), SPR / "portrait-ash-archer.png")
    save_png(crop_icon(Image.open(SPR / "unit-ash-strider.png"), 256), SPR / "portrait-ash-strider.png")
    save_png(crop_icon(Image.open(SPR / "unit-ash-siege.png"), 256), SPR / "portrait-ash-siege.png")
    save_png(crop_icon(Image.open(SPR / "unit-ash-strider.png"), 256), SPR / "portrait-ash-titan.png")

    save_png(crop_icon(storm_walk, 256), SPR / "portrait-storm-villager.png")
    save_png(crop_icon(storm_walk, 256), SPR / "portrait-storm-scout.png")
    save_png(crop_icon(storm_guard, 256), SPR / "portrait-storm-guard.png")
    save_png(crop_icon(storm_guard, 256), SPR / "portrait-storm-archer.png")
    save_png(crop_icon(Image.open(SPR / "unit-storm-strider.png"), 256), SPR / "portrait-storm-strider.png")
    save_png(crop_icon(Image.open(SPR / "unit-storm-siege.png"), 256), SPR / "portrait-storm-siege.png")
    save_png(crop_icon(Image.open(SPR / "unit-storm-wagon.png"), 256), SPR / "portrait-storm-titan.png")

    for unit, src in [
        ("villager", ash_walk),
        ("scout", ash_walk),
        ("guard", ash_guard),
        ("archer", ash_guard),
        ("strider", Image.open(SPR / "unit-ash-strider.png")),
        ("siege", Image.open(SPR / "unit-ash-siege.png")),
    ]:
        save_png(crop_icon(src), SPR / f"icon-train-ash-{unit}.png")

    for unit, src in [
        ("villager", storm_walk),
        ("scout", storm_walk),
        ("guard", storm_guard),
        ("archer", storm_guard),
        ("strider", Image.open(SPR / "unit-storm-strider.png")),
        ("siege", Image.open(SPR / "unit-storm-siege.png")),
        ("wagon", Image.open(SPR / "unit-storm-wagon.png")),
    ]:
        save_png(crop_icon(src), SPR / f"icon-train-storm-{unit}.png")

    print("Pack atlases…")
    pack_sheet_atlas(ash_walk, SPR / "ash-walk.atlas.png", SPR / "ash-walk.atlas.json", "ash-walk", "ashvein")
    pack_sheet_atlas(ash_guard, SPR / "ash-guard.atlas.png", SPR / "ash-guard.atlas.json", "ash-guard", "ashvein")
    pack_still_atlas(Image.open(SPR / "unit-ash-strider.png"), SPR / "ash-strider.atlas.png", SPR / "ash-strider.atlas.json", "ash-strider", "ashvein")
    pack_still_atlas(Image.open(SPR / "unit-ash-siege.png"), SPR / "ash-siege.atlas.png", SPR / "ash-siege.atlas.json", "ash-siege", "ashvein")
    pack_sheet_atlas(storm_walk, SPR / "storm-walk.atlas.png", SPR / "storm-walk.atlas.json", "storm-walk", "stormveil")
    pack_sheet_atlas(storm_guard, SPR / "storm-guard.atlas.png", SPR / "storm-guard.atlas.json", "storm-guard", "stormveil")
    pack_still_atlas(Image.open(SPR / "unit-storm-strider.png"), SPR / "storm-strider.atlas.png", SPR / "storm-strider.atlas.json", "storm-strider", "stormveil")
    pack_still_atlas(Image.open(SPR / "unit-storm-siege.png"), SPR / "storm-siege.atlas.png", SPR / "storm-siege.atlas.json", "storm-siege", "stormveil")
    pack_still_atlas(Image.open(SPR / "unit-storm-wagon.png"), SPR / "storm-wagon.atlas.png", SPR / "storm-wagon.atlas.json", "storm-wagon", "stormveil")
    print("done")


if __name__ == "__main__":
    main()
