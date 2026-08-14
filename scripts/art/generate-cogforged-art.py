#!/usr/bin/env python3
"""Generate Cogforged Assembly art roster — issue #28.

Brass automatons with gear silhouettes, Foundry Core town center, grid pylons,
locked cogforged palette, full animation sheet layout, buildings, portraits,
banner, and command icons. No Gravemark tints.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "media" / "sprites"
TEX = ROOT / "media" / "textures"
CELL = 128
SHEET = 1024

# Locked Cogforged palette (matches assets/palettes/cogforged.v1.json)
P = {
    "brass": (201, 136, 90),     # #C9885A primary brass
    "copper": (184, 115, 51),    # #B87333 relay copper
    "steel": (107, 114, 128),    # #6B7280 plate steel
    "glow": (255, 208, 128),     # #FFD080 arc glow
    "iron": (58, 58, 72),        # #3A3A48 dark iron
    "void": (21, 24, 32),        # #151820 outlines
}


def nearest(c: tuple[int, int, int]) -> tuple[int, int, int]:
    best, bd = P["brass"], 1e9
    for v in P.values():
        d = (c[0] - v[0]) ** 2 + (c[1] - v[1]) ** 2 + (c[2] - v[2]) ** 2
        if d < bd:
            bd, best = d, v
    return best


def lock_palette(img: Image.Image) -> Image.Image:
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 16:
                px[x, y] = (0, 0, 0, 0)
            else:
                c = nearest((r, g, b))
                px[x, y] = (*c, 255)
    return img


def save(img: Image.Image, name: str, *, max_w: int | None = None) -> None:
    out = img.convert("RGBA")
    if max_w and out.width > max_w:
        ratio = max_w / out.width
        out = out.resize((max_w, max(1, int(out.height * ratio))), Image.Resampling.LANCZOS)
    out = lock_palette(out)
    if name.endswith(".jpg"):
        path = TEX / name
        path.parent.mkdir(parents=True, exist_ok=True)
        out.convert("RGB").save(path, optimize=True, quality=85)
    else:
        path = SPR / name
        path.parent.mkdir(parents=True, exist_ok=True)
        out.save(path, optimize=True, compress_level=9)
    print(f"  {name} ({path.stat().st_size // 1024}KB)")


def px(draw: ImageDraw.ImageDraw, x: int, y: int, c: tuple[int, int, int], s: int = 1) -> None:
    draw.rectangle([x, y, x + s - 1, y + s - 1], fill=(*c, 255))


def poly(draw: ImageDraw.ImageDraw, pts: list[tuple[int, int]], fill, outline=None) -> None:
    draw.polygon(pts, fill=(*fill, 255), outline=(*outline, 255) if outline else None)


def gear_core(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int = 10, teeth: int = 8) -> None:
    """Circular gear chest plate — distinct Cogforged silhouette."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*P["copper"], 255), outline=(*P["void"], 255))
    for i in range(teeth):
        a = math.radians(360 * i / teeth)
        tx = cx + int(math.cos(a) * (r + 3))
        ty = cy + int(math.sin(a) * (r + 3))
        px(draw, tx - 1, ty - 1, P["steel"], 3)
    draw.ellipse([cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 2], fill=(*P["glow"], 255))


def draw_rivet_helmet(draw: ImageDraw.ImageDraw, cx: int, cy: int, lean: int = 0) -> None:
    """Domed rivet helmet with optic slit — not hood/crypt/vent."""
    draw.ellipse([cx - 12 + lean, cy - 32, cx + 12 + lean, cy - 10], fill=(*P["steel"], 255), outline=(*P["void"], 255))
    for i in range(3):
        px(draw, cx - 8 + lean + i * 5, cy - 28, P["brass"], 2)
    draw.rectangle([cx - 8 + lean, cy - 18, cx + 8 + lean, cy - 12], fill=(*P["glow"], 255))


def draw_wrench(draw: ImageDraw.ImageDraw, x: int, y: int, *, flip: bool = False) -> None:
    sign = -1 if flip else 1
    draw.line([(x, y), (x + sign * 16, y - 24)], fill=(*P["steel"], 255), width=3)
    draw.arc([x + sign * 10, y - 32, x + sign * 22, y - 20], 180 if sign > 0 else 0, 360 if sign > 0 else 180, fill=(*P["copper"], 255))


def draw_assembler(draw: ImageDraw.ImageDraw, cx: int, cy: int, direction: int, frame: int, *, guard: bool = False) -> None:
    bob = [0, -2, 0, 2, 0, -1, 0, 1][frame % 8]
    cy += bob
    lean = direction - 4
    draw_rivet_helmet(draw, cx, cy, lean)
    body_top = cy - 10
    body_bot = cy + 16
    w = 13 + abs(lean)
    draw.rectangle([cx - w + lean, body_top, cx + w + lean, body_bot], fill=(*P["brass"], 255), outline=(*P["void"], 255))
    gear_core(draw, cx + lean, cy + 2, 10)
    for i in range(4):
        px(draw, cx - w + lean + 2, body_top + 3 + i * 4, P["steel"], 2)
        px(draw, cx + w + lean - 4, body_top + 3 + i * 4, P["steel"], 2)
    step = (frame % 4) - 1.5
    px(draw, cx - 6 + int(step), cy + 20, P["iron"], 4)
    px(draw, cx + 2 - int(step), cy + 20, P["iron"], 4)
    if guard:
        draw.rectangle([cx - 26 + lean, cy - 10, cx - 8 + lean, cy + 16], fill=(*P["iron"], 255), outline=(*P["copper"], 255))
        for i in range(5):
            px(draw, cx - 24 + lean, cy - 6 + i * 4, P["brass"], 2)
        draw.line([(cx + 10 + lean, cy - 8), (cx + 24 + lean, cy + 12)], fill=(*P["steel"], 255), width=4)
        px(draw, cx + 22 + lean, cy + 10, P["glow"], 4)
    else:
        draw_wrench(draw, cx + w + lean + 2, cy - 6, flip=(direction in (5, 6, 7)))


def unit_cell(direction: int, frame: int, *, guard: bool = False) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    dir_map = [0, 1, 2, 3, 4, 3, 2, 1]
    d = dir_map[direction]
    flip = direction in (5, 6, 7)
    draw_assembler(draw, 64 + (8 if d == 2 else -8 if d == 6 else 0), 72, d, frame, guard=guard)
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    return img


def build_sheet(*, guard: bool = False) -> Image.Image:
    sheet = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))
    for row in range(8):
        for col in range(8):
            cell = unit_cell(row, col, guard=guard)
            sheet.paste(cell, (col * CELL, row * CELL))
    return sheet


def draw_coil_ring(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(*P["copper"], 255), width=4)
    for i in range(6):
        a = math.radians(i * 60)
        px(draw, cx + int(math.cos(a) * r) - 1, cy + int(math.sin(a) * r) - 1, P["glow"], 3)


def draw_grid_pylon(draw: ImageDraw.ImageDraw, cx: int, base: int, h: int = 200) -> None:
    """Tall lattice relay pylon — mechanic-specific Cogforged structure."""
    draw.line([(cx, base), (cx, base - h)], fill=(*P["steel"], 255), width=5)
    for y in range(base - h, base - 20, 28):
        draw.line([(cx - 40, y + 10), (cx + 40, y + 10)], fill=(*P["iron"], 255), width=3)
        draw.line([(cx - 40, y + 10), (cx, y - 8)], fill=(*P["steel"], 255), width=2)
        draw.line([(cx + 40, y + 10), (cx, y - 8)], fill=(*P["steel"], 255), width=2)
    draw.ellipse([cx - 14, base - h - 18, cx + 14, base - h + 10], fill=(*P["copper"], 255), outline=(*P["glow"], 255))
    px(draw, cx - 4, base - h - 6, P["glow"], 8)


def draw_foundry_core(draw: ImageDraw.ImageDraw, cx: int, base: int) -> None:
    draw.rectangle([cx - 120, base - 80, cx + 120, base], fill=(*P["iron"], 255), outline=(*P["steel"], 255))
    gear_core(draw, cx, base - 130, 36, teeth=12)
    draw_coil_ring(draw, cx, base - 130, 52)
    draw.rectangle([cx - 16, base - 210, cx + 16, base - 170], fill=(*P["steel"], 255))
    px(draw, cx - 6, base - 205, P["glow"], 4)
    draw.line([(cx + 80, base - 60), (cx + 80, base - 180)], fill=(*P["copper"], 255), width=4)


def draw_building(kind: str) -> Image.Image:
    w, h = 640, 720
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, base = w // 2, h - 40

    if kind == "tc":
        draw_foundry_core(draw, cx, base)
    elif kind == "house":
        draw.ellipse([cx - 65, base - 70, cx + 65, base], fill=(*P["brass"], 255), outline=(*P["void"], 255))
        for i in range(5):
            draw.line([(cx - 50 + i * 20, base - 70), (cx - 50 + i * 20, base - 100)], fill=(*P["copper"], 255), width=3)
        gear_core(draw, cx, base - 45, 8)
    elif kind == "mill":
        draw.rectangle([cx - 80, base - 50, cx + 80, base], fill=(*P["iron"], 255))
        gear_core(draw, cx - 40, base - 70, 14)
        gear_core(draw, cx + 40, base - 70, 14)
        draw_coil_ring(draw, cx, base - 75, 30)
    elif kind == "lumber":
        draw.rectangle([cx - 90, base - 60, cx + 90, base], fill=(*P["steel"], 255))
        draw.polygon([(cx - 30, base - 60), (cx, base - 110), (cx + 30, base - 60)], P["copper"])
        draw_grid_pylon(draw, cx + 70, base, 90)
    elif kind == "mine":
        draw.rectangle([cx - 100, base - 40, cx + 100, base], fill=(*P["iron"], 255))
        for i in range(4):
            draw.line([(cx - 80 + i * 18, base - 40), (cx - 80 + i * 18, base - 80)], fill=(*P["steel"], 255), width=3)
        gear_core(draw, cx, base - 95, 12)
    elif kind == "rax":
        draw.rectangle([cx - 110, base - 90, cx + 110, base], fill=(*P["iron"], 255), outline=(*P["void"], 255))
        draw.line([(cx - 100, base - 90), (cx - 60, base - 140)], fill=(*P["steel"], 255), width=5)
        draw.line([(cx + 100, base - 90), (cx + 60, base - 140)], fill=(*P["steel"], 255), width=5)
        draw.line([(cx - 60, base - 140), (cx + 60, base - 140)], fill=(*P["copper"], 255), width=4)
        gear_core(draw, cx, base - 50, 16)
    elif kind == "spire":
        draw.rectangle([cx - 10, base - 250, cx + 10, base], fill=(*P["steel"], 255))
        draw.ellipse([cx - 22, base - 270, cx + 22, base - 230], fill=(*P["copper"], 255), outline=(*P["glow"], 255))
        draw.line([(cx - 30, base - 200), (cx + 30, base - 200)], fill=(*P["glow"], 255), width=2)
        draw.line([(cx, base - 250), (cx, base - 230)], fill=(*P["glow"], 255), width=2)
    elif kind == "den":
        draw.rectangle([cx - 100, base - 50, cx + 100, base], fill=(*P["iron"], 255))
        draw.rectangle([cx - 70, base - 80, cx + 70, base - 50], fill=(*P["steel"], 255))
        for x in range(cx - 60, cx + 50, 20):
            gear_core(draw, x, base - 65, 6, teeth=6)
    elif kind == "workshop":
        draw.rectangle([cx - 110, base - 70, cx + 110, base], fill=(*P["iron"], 255))
        draw.line([(cx - 80, base - 70), (cx - 80, base - 120)], fill=(*P["steel"], 255), width=6)
        draw.line([(cx + 80, base - 70), (cx + 80, base - 120)], fill=(*P["steel"], 255), width=6)
        draw.line([(cx - 80, base - 120), (cx + 80, base - 120)], fill=(*P["copper"], 255), width=4)
        gear_core(draw, cx, base - 95, 18)
    elif kind == "wonder":
        draw_foundry_core(draw, cx - 100, base)
        draw_foundry_core(draw, cx + 100, base)
        gear_core(draw, cx, base - 180, 48, teeth=16)
        draw_coil_ring(draw, cx, base - 180, 70)
        draw.line([(cx - 100, base - 130), (cx + 100, base - 130)], fill=(*P["glow"], 255), width=4)
    elif kind == "grid-pylon":
        draw_grid_pylon(draw, cx, base, 220)
        draw_coil_ring(draw, cx, base - 60, 35)
    else:
        draw.rectangle([cx - 80, base - 60, cx + 80, base], fill=(*P["steel"], 255))

    return img.filter(ImageFilter.SHARPEN)


def draw_still(kind: str) -> Image.Image:
    w, h = 512, 640
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, base = w // 2, h - 30
    if kind == "strider":
        draw.ellipse([cx - 60, base - 30, cx + 60, base], fill=(*P["iron"], 255))
        draw.rectangle([cx - 40, base - 80, cx + 40, base - 30], fill=(*P["steel"], 255), outline=(*P["void"], 255))
        gear_core(draw, cx, base - 55, 16)
        for leg_x in (cx - 45, cx - 15, cx + 15, cx + 45):
            draw.line([(leg_x, base - 30), (leg_x, base)], fill=(*P["brass"], 255), width=5)
            gear_core(draw, leg_x, base - 20, 5, teeth=6)
    elif kind == "siege":
        draw.rectangle([cx - 95, base - 45, cx + 95, base], fill=(*P["iron"], 255))
        gear_core(draw, cx - 50, base - 65, 12)
        gear_core(draw, cx + 50, base - 65, 12)
        draw.line([(cx, base - 45), (cx + 120, base - 70)], fill=(*P["steel"], 255), width=6)
        draw_coil_ring(draw, cx + 110, base - 75, 18)
        draw.line([(cx + 120, base - 70), (cx + 140, base - 65)], fill=(*P["glow"], 255), width=4)
    return img.filter(ImageFilter.SHARPEN)


def crop_portrait(src: Image.Image, size: int = 256) -> Image.Image:
    w, h = src.size
    side = min(w, h, int(min(w, h) * 0.72))
    left = (w - side) // 2
    top = max(0, h - side - int(h * 0.06))
    return src.crop((left, top, left + side, top + side)).resize((size, size), Image.Resampling.NEAREST)


def icon_from(img: Image.Image, size: int = 128) -> Image.Image:
    return crop_portrait(img, size)


def banner() -> Image.Image:
    img = Image.new("RGBA", (1024, 256), (*P["void"], 255))
    draw = ImageDraw.Draw(img)
    for x in range(0, 1024, 40):
        draw.line([(x, 256), (x + 20, 0)], fill=(*P["iron"], 80), width=2)
    draw_foundry_core(draw, 512, 230)
    draw_grid_pylon(draw, 160, 240, 160)
    draw_grid_pylon(draw, 864, 240, 160)
    gear_core(draw, 512, 50, 24, teeth=12)
    return img.convert("RGB")


def sheets() -> None:
    print("Unit sheets…")
    save(build_sheet(guard=False), "sheet-cogforged-walk.png")
    save(build_sheet(guard=True), "sheet-cog-guard.png")


def buildings() -> None:
    print("Buildings…")
    kinds = [
        "tc", "house", "mill", "lumber", "mine", "rax", "spire", "den", "workshop", "wonder",
        "grid-pylon",
    ]
    for k in kinds:
        save(draw_building(k), f"bldg-cog-{k}.png", max_w=560)


def stills() -> None:
    print("Still units…")
    for k in ("strider", "siege"):
        save(draw_still(k), f"unit-cog-{k}.png", max_w=480)


def portraits() -> None:
    print("Portraits…")
    walk = build_sheet(guard=False)
    guard = build_sheet(guard=True)
    strider = draw_still("strider")
    siege = draw_still("siege")
    mapping = {
        "portrait-cogforged.png": walk,
        "portrait-cog-villager.png": walk,
        "portrait-cog-scout.png": walk,
        "portrait-cog-guard.png": guard,
        "portrait-cog-archer.png": guard,
        "portrait-cog-strider.png": strider,
        "portrait-cog-siege.png": siege,
        "portrait-cog-titan.png": strider,
    }
    for name, src in mapping.items():
        save(crop_portrait(src, 256), name)


def command_icons() -> None:
    print("Command icons…")
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
        ("grid-pylon", "grid-pylon"),
    ]
    for btype, key in builds:
        src = Image.open(SPR / f"bldg-cog-{key}.png")
        save(icon_from(src), f"icon-build-cog-{btype}.png")

    trains = [
        ("villager", "sheet-cogforged-walk.png"),
        ("scout", "sheet-cogforged-walk.png"),
        ("guard", "sheet-cog-guard.png"),
        ("archer", "sheet-cog-guard.png"),
        ("strider", "unit-cog-strider.png"),
        ("siege", "unit-cog-siege.png"),
    ]
    for unit, src_name in trains:
        src = Image.open(SPR / src_name)
        save(icon_from(src), f"icon-train-cog-{unit}.png")

    save(icon_from(Image.open(SPR / "bldg-cog-tc.png")), "icon-age-cog.png")


def main() -> None:
    palette_path = ROOT / "assets" / "palettes" / "cogforged.v1.json"
    assert palette_path.exists(), "cogforged palette missing"
    sheets()
    buildings()
    stills()
    portraits()
    save(banner(), "cogforged-banner.jpg", max_w=1024)
    command_icons()
    print("Cogforged art roster complete.")


if __name__ == "__main__":
    main()
