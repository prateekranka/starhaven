#!/usr/bin/env python3
"""Generate distinct building sprites, unit portraits, and command icons (issue #13)."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "media" / "sprites"


def load(name: str) -> Image.Image:
    return Image.open(SPR / name).convert("RGBA")


def save(img: Image.Image, name: str) -> None:
    out = SPR / name
    if name.startswith("bldg-"):
        w, h = img.size
        if w > 600:
            img = img.resize((max(512, w // 2), max(480, h // 2)), Image.Resampling.LANCZOS)
    img.save(out, optimize=True, compress_level=9)
    print(f"  wrote {name} ({out.stat().st_size // 1024}KB)")


def tint(img: Image.Image, rgb: tuple[int, int, int], amount: float = 0.35) -> Image.Image:
    overlay = Image.new("RGBA", img.size, (*rgb, 0))
    base = img.copy()
    colored = ImageEnhance.Color(base).enhance(1 + amount)
    return Image.blend(base, Image.alpha_composite(base, overlay), amount * 0.5)


def composite_top(base: Image.Image, overlay: Image.Image, y_frac: float = 0.08, scale: float = 0.28) -> Image.Image:
    w, h = base.size
    ow = int(w * scale)
    oh = int(overlay.height * (ow / overlay.width))
    stamp = overlay.resize((ow, oh), Image.Resampling.NEAREST)
    out = base.copy()
    out.alpha_composite(stamp, ((w - ow) // 2, int(h * y_frac)))
    return out


def atlas_frame(src_name: str, facing: str = "S", frame: int = 0, action: str = "walk") -> Image.Image:
    meta_path = SPR / src_name.replace(".atlas.png", ".atlas.json")
    meta = json.loads(meta_path.read_text())
    cell = int(meta.get("cell") or 128)
    match = next(
        (
            f
            for f in meta["frames"]
            if f.get("action") == action and f.get("facing") == facing and int(f.get("frame") or 0) == frame
        ),
        None,
    )
    if match is None:
        raise SystemExit(f"no {action}.{facing}.{frame} in {meta_path.name}")
    src = load(src_name)
    x = int(match["col"]) * cell
    y = int(match["row"]) * cell
    return src.crop((x, y, x + cell, y + cell))


def crop_portrait(src: Image.Image, size: int = 256) -> Image.Image:
    w, h = src.size
    if w <= 256 and h <= 256:
        return src.resize((size, size), Image.Resampling.NEAREST) if (w, h) != (size, size) else src
    side = min(w, h, int(min(w, h) * 0.72))
    left = (w - side) // 2
    top = max(0, h - side - int(h * 0.06))
    crop = src.crop((left, top, left + side, top + side))
    return crop.resize((size, size), Image.Resampling.NEAREST)


def icon_from(img: Image.Image, size: int = 128, x_bias: float = 0.0) -> Image.Image:
    w, h = img.size
    if w <= 256 and h <= 256:
        return img.resize((size, size), Image.Resampling.NEAREST) if (w, h) != (size, size) else img
    side = min(w, h, int(min(w, h) * 0.72))
    left = (w - side) // 2 + int(side * x_bias)
    left = max(0, min(w - side, left))
    top = max(0, h - side - int(h * 0.06))
    crop = img.crop((left, top, left + side, top + side))
    return crop.resize((size, size), Image.Resampling.NEAREST)


def sun_buildings() -> None:
    mill = load("bldg-sun-mill.png")
    rax = load("bldg-sun-rax.png")
    trees = load("node-trees.png")
    crystal = load("node-crystal.png")

    lumber = composite_top(tint(mill, (60, 140, 70), 0.25), trees, y_frac=0.02, scale=0.34)
    save(lumber, "bldg-sun-lumber.png")

    mine = composite_top(tint(mill, (120, 80, 200), 0.3), crystal, y_frac=0.0, scale=0.32)
    save(mine, "bldg-sun-mine.png")

    spire = composite_top(rax.copy(), crystal, y_frac=-0.02, scale=0.38)
    spire = spire.filter(ImageFilter.SHARPEN)
    save(spire, "bldg-sun-spire.png")

    den = composite_top(tint(rax, (180, 120, 60), 0.2), load("unit-sun-strider.png"), y_frac=0.04, scale=0.22)
    save(den, "bldg-sun-den.png")

    workshop = composite_top(tint(rax, (140, 140, 160), 0.15), load("unit-sun-siege.png"), y_frac=0.06, scale=0.24)
    save(workshop, "bldg-sun-workshop.png")


def grave_buildings() -> None:
    mill = load("bldg-grave-mill.png")
    rax = load("bldg-grave-rax.png")
    ore = load("node-ore.png")
    void = load("node-void.png")

    lumber = composite_top(tint(mill, (90, 110, 90), 0.2), ore, y_frac=0.02, scale=0.34)
    save(lumber, "bldg-grave-lumber.png")

    mine = composite_top(tint(mill, (80, 60, 120), 0.35), void, y_frac=0.0, scale=0.32)
    save(mine, "bldg-grave-mine.png")

    spire = composite_top(rax.copy(), void, y_frac=-0.02, scale=0.36)
    save(spire, "bldg-grave-spire.png")

    den = composite_top(tint(rax, (100, 70, 90), 0.25), load("unit-grave-strider.png"), y_frac=0.04, scale=0.22)
    save(den, "bldg-grave-den.png")

    workshop = composite_top(tint(rax, (110, 100, 120), 0.2), load("unit-grave-siege.png"), y_frac=0.06, scale=0.24)
    save(workshop, "bldg-grave-workshop.png")


def portraits() -> None:
    mapping = {
        "portrait-sun-villager.png": ("sun-walk.atlas.png", "S"),
        "portrait-sun-scout.png": ("sun-walk.atlas.png", "SE"),
        "portrait-sun-guard.png": ("sun-guard.atlas.png", "S"),
        "portrait-sun-archer.png": ("sun-guard.atlas.png", "SE"),
        "portrait-sun-strider.png": ("unit-sun-strider.png", None),
        "portrait-sun-siege.png": ("unit-sun-siege.png", None),
        "portrait-grave-villager.png": ("grave-walk.atlas.png", "S"),
        "portrait-grave-scout.png": ("grave-walk.atlas.png", "SE"),
        "portrait-grave-guard.png": ("grave-guard.atlas.png", "S"),
        "portrait-grave-archer.png": ("grave-guard.atlas.png", "SE"),
        "portrait-grave-strider.png": ("unit-grave-strider.png", None),
        "portrait-grave-siege.png": ("unit-grave-siege.png", None),
        "portrait-grave-titan.png": ("unit-grave-strider.png", None),
    }
    for out_name, (src_name, facing) in mapping.items():
        src = atlas_frame(src_name, facing=facing) if facing else load(src_name)
        save(crop_portrait(src, 256), out_name)


def command_icons() -> None:
    builds = [
        ("house", "house"),
        ("mill", "mill"),
        ("lumber", "lumber"),
        ("mine", "mine"),
        ("barracks", "rax"),
        ("spire", "spire"),
        ("den", "den"),
        ("workshop", "workshop"),
        ("wonder", "wonder"),
    ]
    for fac in ("sun", "grave"):
        for btype, key in builds:
            src = load(f"bldg-{fac}-{key}.png")
            save(icon_from(src), f"icon-build-{fac}-{btype}.png")

    trains = [
        ("villager", "walk", "S"),
        ("scout", "walk", "SE"),
        ("guard", "guard", "S"),
        ("archer", "guard", "SE"),
        ("strider", "strider", None),
        ("siege", "siege", None),
    ]
    for fac in ("sun", "grave"):
        for unit, atlas_key, facing in trains:
            if atlas_key in ("strider", "siege"):
                src = load(f"unit-{fac}-{atlas_key}.png")
            else:
                src = atlas_frame(f"{fac}-{atlas_key}.atlas.png", facing=facing)
            save(icon_from(src), f"icon-train-{fac}-{unit}.png")

    save(icon_from(load("bldg-sun-tc.png")), "icon-age-sun.png")
    save(icon_from(load("bldg-grave-tc.png")), "icon-age-grave.png")


def main() -> None:
    print("Buildings…")
    sun_buildings()
    grave_buildings()
    print("Portraits…")
    portraits()
    print("Command icons…")
    command_icons()
    print("Done.")


if __name__ == "__main__":
    main()
