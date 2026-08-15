#!/usr/bin/env python3
"""Raise Cogforged / Ashvein / Stormveil source sheets for the look bar.

Fixes (source sheets, then pack_true_cycles atlases):
  1. Ashvein walk odd columns were empty (X.X.X.X.) — copy-shift inbetweens.
  2. Storm/Cog walk rows were all right-facing — remap front/back and flop W/NW/SW.
  3. Storm wagon building was a 2KB toy — knockout the painted unit still onto the building slot.
  4. Opaque studio plates on guard/action sheets (gray ~42 or black) punched to real alpha.
"""
from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / "assets" / "sheets"
SPR = ROOT / "media" / "sprites"
PROV = ROOT / "assets" / "provenance" / "units"
CELL = 128
DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"]


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True, compress_level=9)


def is_studio(
    r: int,
    g: int,
    b: int,
    a: int,
    *,
    gray_max: int,
    chroma: int,
    white_min: int | None = None,
) -> bool:
    if a < 8:
        return True
    mx, mn = max(r, g, b), min(r, g, b)
    if mx < 14:
        return True
    if mx <= gray_max and (mx - mn) <= chroma:
        return True
    if white_min is not None and mx >= white_min and (mx - mn) <= 18:
        return True
    return False


def knockout_studio(
    img: Image.Image,
    *,
    gray_max: int = 56,
    chroma: int = 10,
    white_min: int | None = None,
) -> Image.Image:
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
        if not is_studio(r, g, b, a, gray_max=gray_max, chroma=chroma, white_min=white_min):
            continue
        px[x, y] = (0, 0, 0, 0)
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)
    return rgba


def knockout_atlas_cells(
    img: Image.Image,
    *,
    gray_max: int = 32,
    chroma: int = 10,
    cell: int = CELL,
) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for row in range(h // cell):
        for col in range(w // cell):
            box = (col * cell, row * cell, (col + 1) * cell, (row + 1) * cell)
            tile = knockout_studio(rgba.crop(box), gray_max=gray_max, chroma=chroma)
            out.paste(tile, box[:2], tile)
    return out


def knockout_ash_buildings() -> dict[str, str]:
    """Punch studio plates on Ashvein building stills (opaque gray or white)."""
    report: dict[str, str] = {}
    for path in sorted(SPR.glob("bldg-ash-*.png")):
        img = Image.open(path).convert("RGBA")
        a0 = float((np.asarray(img.split()[-1]) == 0).mean())
        if "spire" in path.name:
            out = knockout_studio(img, gray_max=16, chroma=8, white_min=240)
        else:
            out = knockout_studio(img, gray_max=56, chroma=10)
        # Isolated studio-black dither that the edge flood cannot reach.
        px = out.load()
        w, h = out.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a >= 8 and max(r, g, b) < 14:
                    px[x, y] = (0, 0, 0, 0)
        save_png(out, path)
        a1 = float((np.asarray(out.split()[-1]) == 0).mean())
        report[path.name] = f"a0 {100 * a0:.1f}% → {100 * a1:.1f}%"
    return report


def knockout_painted_atlases() -> dict[str, str]:
    """Punch leftover studio black around Cog/Storm/Ash unit cells."""
    report: dict[str, str] = {}
    paths = (
        list(SPR.glob("cog-*.atlas.png"))
        + list(SPR.glob("storm-walk.atlas.png"))
        + list(SPR.glob("storm-guard.atlas.png"))
        + list(SPR.glob("storm-wagon.atlas.png"))
        + list(SPR.glob("ash-walk.atlas.png"))
        + list(SPR.glob("ash-guard.atlas.png"))
    )
    for path in sorted(paths):
        img = Image.open(path).convert("RGBA")
        a0 = float((np.asarray(img.split()[-1]) == 0).mean())
        # Storm/Ash cloaks are dark; only punch true studio black. Cog brass can take a higher gray.
        gray = 32 if path.name.startswith("cog-") else 14
        out = knockout_atlas_cells(img, gray_max=gray, chroma=10)
        save_png(out, path)
        a1 = float((np.asarray(out.split()[-1]) == 0).mean())
        meta = Path(str(path).replace(".atlas.png", ".atlas.json"))
        if meta.exists():
            payload = json.loads(meta.read_text())
            data = path.read_bytes()
            payload["sha256"] = hashlib.sha256(data).hexdigest()
            payload["bytes"] = len(data)
            meta.write_text(json.dumps(payload, indent=2) + "\n")
        report[path.name] = f"a0 {100 * a0:.1f}% → {100 * a1:.1f}%"
    return report


def cell(img: Image.Image, c: int, r: int) -> Image.Image:
    return img.crop((c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL)).convert("RGBA")


def occupancy_row(img: Image.Image, r: int) -> str:
    marks = []
    for c in range(8):
        a = np.asarray(cell(img, c, r).split()[-1])
        marks.append("X" if int(a.max()) >= 16 and int((a >= 16).sum()) > 80 else ".")
    return "".join(marks)


def row_metrics(img: Image.Image, r: int) -> tuple[float, float]:
    """Return (right/left mass, bottom/top mass) of non-studio figure in col 0."""
    arr = np.asarray(cell(img, 0, r))
    a = arr[..., 3]
    rgb = arr[..., :3]
    mx = rgb.max(axis=2)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    studio = (a < 16) | ((mx < 56) & (chroma <= 10))
    fig = ~studio
    if int(fig.sum()) < 80:
        fig = a >= 16
    left = int(fig[:, : CELL // 2].sum())
    right = int(fig[:, CELL // 2 :].sum())
    top = int(fig[: CELL // 2].sum())
    bot = int(fig[CELL // 2 :].sum())
    return right / max(left, 1), bot / max(top, 1)


def copy_shift_inbetween(a: Image.Image, b: Image.Image) -> Image.Image:
    """Odd-column gait: copy-shift A toward B, fill holes from B. No ghost blend."""
    aa = np.asarray(a.convert("RGBA"))
    bb = np.asarray(b.convert("RGBA"))

    def centroid(im: np.ndarray) -> tuple[float, float]:
        m = im[..., 3] >= 16
        ys, xs = np.where(m)
        if len(xs) == 0:
            return 64.0, 64.0
        return float(xs.mean()), float(ys.mean())

    cax, cay = centroid(aa)
    cbx, cby = centroid(bb)
    dx = int(round((cbx - cax) * 0.5))
    dy = int(round((cby - cay) * 0.5))
    if dx == 0 and dy == 0:
        dy = -1  # walk bob when keyframes share a centroid

    shifted = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    shifted.paste(a, (dx, dy), a)
    sa = np.asarray(shifted)
    out = sa.copy()
    hole = sa[..., 3] < 16
    take = hole & (bb[..., 3] >= 16)
    out[take] = bb[take]
    return Image.fromarray(out, "RGBA")


def fill_ash_walk_odds(path: Path) -> dict:
    img = Image.open(path).convert("RGBA")
    before = [occupancy_row(img, r) for r in range(8)]
    if all(row == "XXXXXXXX" for row in before):
        return {"path": str(path.relative_to(ROOT)), "before": before[0], "after": before[0], "rows": before, "skipped": True}
    out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    for r in range(8):
        evens = [cell(img, c, r) for c in range(0, 8, 2)]
        for i, src in enumerate(evens):
            out.paste(src, ((i * 2) * CELL, r * CELL), src)
        # odd cols 1,3,5,7 inbetween even neighbors (wrap 6→0)
        for i, col in enumerate((1, 3, 5, 7)):
            a = evens[i]
            b = evens[(i + 1) % 4]
            mid = copy_shift_inbetween(a, b)
            out.paste(mid, (col * CELL, r * CELL), mid)
    save_png(out, path)
    after = [occupancy_row(out, r) for r in range(8)]
    return {"path": str(path.relative_to(ROOT)), "before": before[0], "after": after[0], "rows": after}


def uniquify_eight_dirs(path: Path) -> dict | None:
    img = Image.open(path).convert("RGBA")
    rl_bt = [row_metrics(img, r) for r in range(8)]
    rls = [m[0] for m in rl_bt]
    bts = [m[1] for m in rl_bt]
    if min(rls) <= 1.2:
        return None  # already has a left-facing row
    ordered = sorted(range(8), key=lambda r: -bts[r])  # front → back
    s_src, n_src = ordered[0], ordered[-1]
    rest = [r for r in ordered if r not in (s_src, n_src)]
    se_src = rest[0]
    e_src = rest[len(rest) // 2]
    ne_src = rest[-1]
    mapping = {
        "S": (s_src, False),
        "SE": (se_src, False),
        "E": (e_src, False),
        "NE": (ne_src, False),
        "N": (n_src, False),
        "NW": (ne_src, True),
        "W": (e_src, True),
        "SW": (se_src, True),
    }
    out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    for dest_row, d in enumerate(DIRS):
        src_row, flop = mapping[d]
        for c in range(8):
            tile = cell(img, c, src_row)
            if flop:
                tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
            out.paste(tile, (c * CELL, dest_row * CELL), tile)
    save_png(out, path)
    after = [row_metrics(out, r)[0] for r in range(8)]
    return {
        "path": str(path.relative_to(ROOT)),
        "src": {d: mapping[d][0] for d in DIRS},
        "flop": [d for d in DIRS if mapping[d][1]],
        "rl_before": [round(x, 2) for x in rls],
        "rl_after": [round(x, 2) for x in after],
    }


def knockout_if_opaque(path: Path, *, gray_max: int, chroma: int) -> str | None:
    img = Image.open(path).convert("RGBA")
    a = np.asarray(img.split()[-1])
    if float((a == 0).mean()) >= 0.12:
        return None
    out = knockout_studio(img, gray_max=gray_max, chroma=chroma)
    save_png(out, path)
    a2 = np.asarray(out.split()[-1])
    return f"a0 {100 * (a == 0).mean():.1f}% → {100 * (a2 == 0).mean():.1f}%"


def paint_storm_wagon() -> dict:
    src = SPR / "unit-storm-wagon.png"
    raw = Image.open(src).convert("RGBA")
    knocked = knockout_studio(raw, gray_max=48, chroma=14)
    bbox = knocked.split()[-1].getbbox()
    if not bbox:
        raise SystemExit("wagon knockout produced empty image")
    pad = 16
    l, t, r, b = bbox
    trimmed = knocked.crop((max(0, l - pad), max(0, t - pad), min(knocked.width, r + pad), min(knocked.height, b + pad)))
    # Soft contact shadow so the keep sits on the mesa like Sunwoven units.
    shadow = Image.new("RGBA", trimmed.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    cx, cy = trimmed.width // 2, trimmed.height - 18
    draw.ellipse([cx - trimmed.width // 5, cy - 10, cx + trimmed.width // 5, cy + 12], fill=(18, 12, 22, 110))
    composed = Image.alpha_composite(shadow, trimmed)

    save_png(composed, src)
    save_png(composed, SPR / "bldg-storm-wagon.png")

    # Portrait: upper-middle crop of the canopy keep.
    side = min(composed.width, composed.height, int(min(composed.width, composed.height) * 0.72))
    left = (composed.width - side) // 2
    top = max(0, int(composed.height * 0.08))
    portrait = composed.crop((left, top, left + side, top + side)).resize((256, 256), Image.Resampling.LANCZOS)
    save_png(portrait, SPR / "portrait-storm-wagon.png")

    icon = composed.copy()
    icon.thumbnail((128, 128), Image.Resampling.LANCZOS)
    pad_icon = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    pad_icon.paste(icon, ((128 - icon.width) // 2, 128 - icon.height), icon)
    save_png(pad_icon, SPR / "icon-build-storm-wagon.png")
    save_png(pad_icon, SPR / "icon-train-storm-wagon.png")

    a = np.asarray(composed.split()[-1])
    return {
        "unit": f"{src.stat().st_size}B {composed.size} a0={100 * (a == 0).mean():.1f}%",
        "building": f"{(SPR / 'bldg-storm-wagon.png').stat().st_size}B",
        "portrait": f"{(SPR / 'portrait-storm-wagon.png').stat().st_size}B",
    }


def pack_still_atlas(unit_id: str, faction: str, still: Image.Image) -> None:
    """Fit the full still into every 128px atlas cell (walk/attack/gather/build/death × 8 dir × 4)."""
    bbox = still.split()[-1].getbbox()
    img = still.crop(bbox) if bbox else still
    scale = min((CELL - 8) / max(img.width, 1), (CELL - 8) / max(img.height, 1))
    nw, nh = max(1, int(img.width * scale)), max(1, int(img.height * scale))
    fitted = img.resize((nw, nh), Image.Resampling.LANCZOS)
    tile = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    tile.paste(fitted, ((CELL - nw) // 2, CELL - nh - 4), fitted)

    atlas = Image.new("RGBA", (2048, 1280), (0, 0, 0, 0))
    frames = []
    clips = ["walk", "attack", "gather", "build", "death"]
    durs = {"walk": 110, "attack": 100, "gather": 140, "build": 140, "death": 100}
    pack_dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    for action_index, action in enumerate(clips):
        for direction_index, direction in enumerate(pack_dirs):
            for frame in range(4):
                col = direction_index * 2 + (frame % 2)
                row = action_index * 2 + (frame // 2)
                atlas.paste(tile, (col * CELL, row * CELL), tile)
                frames.append(
                    {
                        "id": f"{unit_id}.{action}.{direction}.{frame}",
                        "action": action,
                        "facing": direction,
                        "frame": frame,
                        "durationMs": durs[action],
                        "pivot": {"x": 64, "y": 112},
                        "mirrored": False,
                        "col": col,
                        "row": row,
                    }
                )
    png = SPR / f"{unit_id}.atlas.png"
    save_png(atlas, png)
    data = png.read_bytes()
    meta = {
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
    (SPR / f"{unit_id}.atlas.json").write_text(json.dumps(meta, indent=2) + "\n")


def patch_ash_walk_sources() -> None:
    path = PROV / "ash-walk.sources.v1.json"
    data = json.loads(path.read_text())
    data["occupancy"] = "8x8-dense"
    data["atlasSampleCols"] = [0, 2, 4, 6]
    data["inbetweenCols"] = [1, 3, 5, 7]
    data["clips"]["walk"]["poses"] = {
        "A": {"col": 0},
        "B": {"col": 4},
        "C": {"col": 2},
        "D": {"col": 6},
    }
    data["clips"]["walk"]["note"] = "8-col gait; pipeline A/B keyframes at 0/4; atlas samples 0,2,4,6"
    path.write_text(json.dumps(data, indent=2) + "\n")


def main() -> None:
    report: dict = {"knockout": {}, "uniquify": [], "ashWalk": None, "wagon": None, "ashBuildings": {}, "atlases": {}}

    print("Knock out Ashvein building plates…")
    report["ashBuildings"] = knockout_ash_buildings()
    for name, msg in report["ashBuildings"].items():
        print(f"  {name:36} {msg}")

    print("Knock out painted unit atlas plates…")
    report["atlases"] = knockout_painted_atlases()
    for name, msg in report["atlases"].items():
        print(f"  {name:36} {msg}")

    print("Knock out studio plates…")
    ash_sheets = list(SHEETS.glob("sheet-ash*.png"))
    storm_sheets = list(SHEETS.glob("sheet-storm*.png"))
    cog_sheets = list(SHEETS.glob("sheet-cog*.png"))
    for path in ash_sheets:
        msg = knockout_if_opaque(path, gray_max=110, chroma=12)
        if msg:
            report["knockout"][path.name] = msg
            print(f"  {path.name:36} {msg}")
    for path in storm_sheets:
        msg = knockout_if_opaque(path, gray_max=56, chroma=10)
        if msg:
            report["knockout"][path.name] = msg
            print(f"  {path.name:36} {msg}")
    for path in cog_sheets:
        msg = knockout_if_opaque(path, gray_max=110, chroma=12)
        if msg:
            report["knockout"][path.name] = msg
            print(f"  {path.name:36} {msg}")

    print("Fill Ashvein walk odd columns…")
    report["ashWalk"] = fill_ash_walk_odds(SHEETS / "sheet-ashvein-walk.png")
    print(f"  occupancy {report['ashWalk']['before']} → {report['ashWalk']['after']}")

    print("Uniquify all-right-facing Storm/Cog sheets…")
    for path in sorted(storm_sheets + cog_sheets):
        info = uniquify_eight_dirs(path)
        if info:
            report["uniquify"].append(info)
            print(f"  {path.name:36} flop {info['flop']} rl={info['rl_after']}")

    print("Paint Storm wagon-keep…")
    report["wagon"] = paint_storm_wagon()
    print(f"  {report['wagon']}")

    print("Pack 8-dir atlases (pack_true_cycles --units-only)…")
    import subprocess
    import sys

    res = subprocess.run(
        [sys.executable, str(ROOT / "scripts/art/pack_true_cycles.py"), "--units-only"],
        cwd=ROOT,
    )
    if res.returncode != 0:
        raise SystemExit(res.returncode)

    print("Pack storm-wagon still atlas…")
    pack_still_atlas("storm-wagon", "stormveil", Image.open(SPR / "unit-storm-wagon.png").convert("RGBA"))
    print(f"  storm-wagon.atlas.png {(SPR / 'storm-wagon.atlas.png').stat().st_size // 1024}KB")

    patch_ash_walk_sources()
    print("done")


if __name__ == "__main__":
    main()
