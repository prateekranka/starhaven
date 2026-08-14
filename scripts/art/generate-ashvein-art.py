#!/usr/bin/env python3
"""Generate Ashvein Depths art roster — issue #30.

Distinct volcanic silhouettes (hex magma cores, pickaxes, vent slits, tunnel arches),
locked ashvein palette, full animation sheet layout, buildings including tunnel mouths
and lava vents, portraits, banner, and command icons. No Gravemark tints.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "media" / "sprites"
TEX = ROOT / "media" / "textures"
SHEETS = ROOT / "assets" / "sheets"
CELL = 128
SHEET = 1024

# Locked Ashvein palette (matches assets/palettes/ashvein.v1.json)
P = {
    "ember": (232, 90, 40),      # #E85A28 primary magma
    "magma": (196, 56, 24),      # #C43818 deep lava
    "ash": (139, 107, 90),       # #8B6B5A cooled stone
    "glow": (255, 208, 128),     # #FFD080 hot core
    "obsidian": (42, 26, 36),    # #2A1A24 volcanic rock
    "void": (26, 14, 18),        # #1A0E12 outlines
}


def nearest(c: tuple[int, int, int]) -> tuple[int, int, int]:
    best, bd = P["ember"], 1e9
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
    sheet = name.startswith("sheet-")
    if not sheet:
        out = lock_palette(out)
    if name.endswith(".jpg"):
        path = TEX / name
        path.parent.mkdir(parents=True, exist_ok=True)
        out.convert("RGB").save(path, optimize=True, quality=85)
    else:
        path = (SHEETS if sheet else SPR) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        out.save(path, optimize=True, compress_level=9)
    print(f"  {name} ({path.stat().st_size // 1024}KB)")


def px(draw: ImageDraw.ImageDraw, x: int, y: int, c: tuple[int, int, int], s: int = 1) -> None:
    draw.rectangle([x, y, x + s - 1, y + s - 1], fill=(*c, 255))


def poly(draw: ImageDraw.ImageDraw, pts: list[tuple[int, int]], fill, outline=None) -> None:
    draw.polygon(pts, fill=(*fill, 255), outline=(*outline, 255) if outline else None)


def hex_core(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int = 10) -> None:
    """Hexagonal magma chest plate — distinct Ashvein silhouette."""
    pts = []
    for i in range(6):
        a = math.radians(60 * i - 30)
        pts.append((cx + int(math.cos(a) * r), cy + int(math.sin(a) * r)))
    poly(draw, pts, P["magma"], P["void"])
    for i in range(6):
        a = math.radians(60 * i - 30)
        px(draw, cx + int(math.cos(a) * (r - 4)) - 1, cy + int(math.sin(a) * (r - 4)) - 1, P["glow"], 2)


def draw_pickaxe(draw: ImageDraw.ImageDraw, x: int, y: int, *, flip: bool = False) -> None:
    sign = -1 if flip else 1
    draw.line([(x, y), (x + sign * 18, y - 28)], fill=(*P["ash"], 255), width=3)
    poly(draw, [(x + sign * 14, y - 32), (x + sign * 26, y - 24), (x + sign * 14, y - 16)], P["obsidian"])


def draw_vent_helmet(draw: ImageDraw.ImageDraw, cx: int, cy: int, lean: int = 0) -> None:
    """Slit visor with ember glow — not hood/crypt/sun diamond."""
    draw.rectangle([cx - 10 + lean, cy - 28, cx + 10 + lean, cy - 12], fill=(*P["obsidian"], 255))
    for i in range(3):
        px(draw, cx - 6 + lean + i * 4, cy - 22, P["glow"], 2)
    draw.polygon(
        [(cx - 12 + lean, cy - 12), (cx + lean, cy - 34), (cx + 12 + lean, cy - 12)],
        P["ash"],
        P["void"],
    )


def draw_delver(draw: ImageDraw.ImageDraw, cx: int, cy: int, direction: int, frame: int, *, guard: bool = False) -> None:
    bob = [0, -2, 0, 2, 0, -1, 0, 1][frame % 8]
    cy += bob
    lean = direction - 4
    draw_vent_helmet(draw, cx, cy, lean)
    # Trapezoid heat pauldrons with vent slits (not grave cloak / storm canvas)
    body_top = cy - 10
    body_bot = cy + 16
    w = 14 + abs(lean)
    poly(
        draw,
        [
            (cx - 8 + lean, body_top),
            (cx + 8 + lean, body_top),
            (cx + w + lean, body_bot),
            (cx - w + lean, body_bot),
        ],
        P["ash"],
        P["void"],
    )
    hex_core(draw, cx + lean, cy + 2, 11)
    for i in range(3):
        px(draw, cx - w + lean + 2, body_top + 4 + i * 5, P["magma"], 2)
        px(draw, cx + w + lean - 4, body_top + 4 + i * 5, P["magma"], 2)
    step = (frame % 4) - 1.5
    px(draw, cx - 6 + int(step), cy + 20, P["obsidian"], 4)
    px(draw, cx + 2 - int(step), cy + 20, P["obsidian"], 4)
    if guard:
        draw.rectangle([cx - 24 + lean, cy - 8, cx - 10 + lean, cy + 14], fill=(*P["obsidian"], 255), outline=(*P["magma"], 255))
        for i in range(4):
            draw.line([(cx - 22 + lean, cy - 4 + i * 4), (cx - 12 + lean, cy - 2 + i * 4)], fill=(*P["ember"], 255), width=1)
        draw.line([(cx + 8 + lean, cy - 6), (cx + 22 + lean, cy + 10)], fill=(*P["ash"], 255), width=3)
        px(draw, cx + 20 + lean, cy + 8, P["glow"], 4)
    else:
        draw_pickaxe(draw, cx + w + lean + 2, cy - 8, flip=(direction in (5, 6, 7)))


def unit_cell(direction: int, frame: int, *, guard: bool = False) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    dir_map = [0, 1, 2, 3, 4, 3, 2, 1]
    d = dir_map[direction]
    flip = direction in (5, 6, 7)
    draw_delver(draw, 64 + (8 if d == 2 else -8 if d == 6 else 0), 72, d, frame, guard=guard)
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


def draw_tunnel_arch(draw: ImageDraw.ImageDraw, cx: int, base: int, w: int, h: int) -> None:
    left, right = cx - w // 2, cx + w // 2
    draw.arc([left, base - h, right, base + 20], 180, 0, fill=(*P["obsidian"], 255), width=6)
    draw.pieslice([left + 8, base - h + 8, right - 8, base - 8], 180, 0, fill=(*P["void"], 255))
    for x in range(left, right, 12):
        px(draw, x, base - h + 4, P["ember"], 3)
    draw.line([(left, base), (right, base)], fill=(*P["ash"], 255), width=3)


def draw_lava_vent_crater(draw: ImageDraw.ImageDraw, cx: int, base: int, r: int = 50) -> None:
    draw.ellipse([cx - r, base - r // 2, cx + r, base + r // 3], fill=(*P["obsidian"], 255), outline=(*P["ash"], 255))
    draw.ellipse([cx - r // 2, base - r // 3, cx + r // 2, base], fill=(*P["magma"], 255))
    for i in range(5):
        ang = math.radians(30 + i * 28)
        px(draw, cx + int(math.cos(ang) * (r // 3)), base - int(math.sin(ang) * (r // 4)), P["glow"], 3)


def draw_building(kind: str) -> Image.Image:
    w, h = 640, 720
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, base = w // 2, h - 40

    if kind == "tc":
        draw.rectangle([cx - 130, base - 100, cx + 130, base], fill=(*P["obsidian"], 255), outline=(*P["ash"], 255))
        draw_tunnel_arch(draw, cx, base - 100, 160, 90)
        poly(draw, [(cx - 80, base - 200), (cx, base - 260), (cx + 80, base - 200)], P["magma"])
        hex_core(draw, cx, base - 220, 16)
    elif kind == "house":
        draw.ellipse([cx - 70, base - 80, cx + 70, base], fill=(*P["ash"], 255), outline=(*P["obsidian"], 255))
        draw.rectangle([cx - 8, base - 110, cx + 8, base - 80], fill=(*P["obsidian"], 255))
        px(draw, cx - 2, base - 112, P["glow"], 4)
    elif kind == "mill":
        draw.rectangle([cx - 90, base - 50, cx + 90, base], fill=(*P["obsidian"], 255))
        draw.ellipse([cx - 40, base - 90, cx + 40, base - 10], outline=(*P["ash"], 255), width=4)
        draw.line([(cx - 40, base - 50), (cx + 40, base - 50)], fill=(*P["magma"], 255), width=3)
        draw_lava_vent_crater(draw, cx + 70, base - 20, 24)
    elif kind == "lumber":
        draw.rectangle([cx - 100, base - 70, cx + 100, base], fill=(*P["ash"], 255))
        for i in range(4):
            draw.line([(cx - 80 + i * 20, base - 70), (cx - 80 + i * 20, base - 120)], fill=(*P["obsidian"], 255), width=3)
        draw.rectangle([cx - 60, base - 130, cx + 60, base - 120], fill=(*P["obsidian"], 255))
    elif kind == "mine":
        draw_lava_vent_crater(draw, cx, base - 10, 70)
        draw.rectangle([cx - 50, base - 30, cx + 50, base], fill=(*P["obsidian"], 255))
    elif kind == "rax":
        draw_tunnel_arch(draw, cx - 60, base, 100, 80)
        draw_tunnel_arch(draw, cx + 60, base, 100, 80)
        draw.line([(cx - 110, base - 70), (cx + 110, base - 70)], fill=(*P["magma"], 255), width=4)
    elif kind == "spire":
        draw.rectangle([cx - 12, base - 240, cx + 12, base], fill=(*P["obsidian"], 255))
        draw.rectangle([cx - 20, base - 260, cx + 20, base - 240], fill=(*P["magma"], 255))
        for y in range(base - 230, base - 40, 30):
            px(draw, cx - 16, y, P["glow"], 4)
            px(draw, cx + 12, y, P["glow"], 4)
    elif kind == "den":
        draw_tunnel_arch(draw, cx, base, 160, 70)
        draw.ellipse([cx - 30, base - 20, cx + 30, base + 10], fill=(*P["void"], 255))
    elif kind == "workshop":
        draw.rectangle([cx - 110, base - 60, cx + 110, base], fill=(*P["obsidian"], 255))
        draw_lava_vent_crater(draw, cx - 60, base - 30, 28)
        draw_lava_vent_crater(draw, cx + 60, base - 30, 28)
        draw.rectangle([cx - 30, base - 90, cx + 30, base - 60], fill=(*P["ash"], 255))
    elif kind == "wonder":
        draw_tunnel_arch(draw, cx - 100, base - 20, 120, 100)
        draw_tunnel_arch(draw, cx + 100, base - 20, 120, 100)
        poly(draw, [(cx - 180, base - 160), (cx, base - 300), (cx + 180, base - 160)], P["magma"])
        hex_core(draw, cx, base - 240, 28)
        draw.line([(cx - 180, base - 160), (cx + 180, base - 160)], fill=(*P["glow"], 255), width=3)
    elif kind == "tunnel-mouth":
        draw_tunnel_arch(draw, cx, base, 200, 120)
        draw.rectangle([cx - 100, base - 140, cx + 100, base - 120], fill=(*P["ash"], 255))
        for i in range(5):
            px(draw, cx - 80 + i * 20, base - 135, P["ember"], 3)
    elif kind == "lava-vent":
        draw_lava_vent_crater(draw, cx, base, 90)
        for i in range(6):
            ang = math.radians(i * 60)
            ex = cx + int(math.cos(ang) * 100)
            ey = base - 20 + int(math.sin(ang) * 30)
            draw.line([(cx, base - 30), (ex, ey)], fill=(*P["magma"], 180), width=2)
    else:
        draw_tunnel_arch(draw, cx, base, 120, 80)

    return img.filter(ImageFilter.SHARPEN)


def draw_still(kind: str) -> Image.Image:
    w, h = 512, 640
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, base = w // 2, h - 30
    if kind == "strider":
        draw.ellipse([cx - 55, base - 35, cx + 55, base], fill=(*P["obsidian"], 255))
        draw.ellipse([cx - 35, base - 90, cx + 35, base - 35], fill=(*P["ash"], 255))
        hex_core(draw, cx, base - 60, 14)
        draw.line([(cx - 50, base - 25), (cx - 75, base)], fill=(*P["magma"], 255), width=5)
        draw.line([(cx + 50, base - 25), (cx + 75, base)], fill=(*P["magma"], 255), width=5)
        draw_tunnel_arch(draw, cx, base - 95, 50, 30)
    elif kind == "siege":
        draw.rectangle([cx - 90, base - 50, cx + 90, base], fill=(*P["obsidian"], 255))
        draw_lava_vent_crater(draw, cx - 50, base - 20, 22)
        draw_lava_vent_crater(draw, cx + 50, base - 20, 22)
        draw.rectangle([cx - 12, base - 90, cx + 12, base - 50], fill=(*P["ash"], 255))
        draw.line([(cx, base - 90), (cx + 110, base - 110)], fill=(*P["magma"], 255), width=5)
        poly(draw, [(cx + 100, base - 120), (cx + 125, base - 100), (cx + 100, base - 80)], P["glow"])
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
    for x in range(0, 1024, 32):
        draw.line([(x, 256), (x + 16, 0)], fill=(*P["magma"], 60), width=2)
    draw_tunnel_arch(draw, 512, 220, 280, 130)
    draw_lava_vent_crater(draw, 180, 210, 40)
    draw_lava_vent_crater(draw, 844, 210, 40)
    hex_core(draw, 512, 60, 22)
    return img.convert("RGB")


def sheets() -> None:
    print("Unit sheets…")
    save(build_sheet(guard=False), "sheet-ashvein-walk.png")
    save(build_sheet(guard=True), "sheet-ash-guard.png")


def buildings() -> None:
    print("Buildings…")
    kinds = [
        "tc", "house", "mill", "lumber", "mine", "rax", "spire", "den", "workshop", "wonder",
        "tunnel-mouth", "lava-vent",
    ]
    for k in kinds:
        save(draw_building(k), f"bldg-ash-{k}.png", max_w=560)


def stills() -> None:
    print("Still units…")
    for k in ("strider", "siege"):
        save(draw_still(k), f"unit-ash-{k}.png", max_w=480)


def portraits() -> None:
    print("Portraits…")
    walk = build_sheet(guard=False)
    guard = build_sheet(guard=True)
    strider = draw_still("strider")
    siege = draw_still("siege")
    mapping = {
        "portrait-ashvein.png": walk,
        "portrait-ash-villager.png": walk,
        "portrait-ash-scout.png": walk,
        "portrait-ash-guard.png": guard,
        "portrait-ash-archer.png": guard,
        "portrait-ash-strider.png": strider,
        "portrait-ash-siege.png": siege,
        "portrait-ash-titan.png": strider,
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
        ("tunnel-mouth", "tunnel-mouth"),
        ("lava-vent", "lava-vent"),
    ]
    for btype, key in builds:
        src = Image.open(SPR / f"bldg-ash-{key}.png")
        save(icon_from(src), f"icon-build-ash-{btype}.png")

    trains = [
        ("villager", "sheet-ashvein-walk.png"),
        ("scout", "sheet-ashvein-walk.png"),
        ("guard", "sheet-ash-guard.png"),
        ("archer", "sheet-ash-guard.png"),
        ("strider", "unit-ash-strider.png"),
        ("siege", "unit-ash-siege.png"),
    ]
    for unit, src_name in trains:
        src = Image.open((SHEETS if src_name.startswith("sheet-") else SPR) / src_name)
        save(icon_from(src), f"icon-train-ash-{unit}.png")

    save(icon_from(Image.open(SPR / "bldg-ash-tc.png")), "icon-age-ash.png")


def main() -> None:
    palette_path = ROOT / "assets" / "palettes" / "ashvein.v1.json"
    assert palette_path.exists(), "ashvein palette missing"
    sheets()
    buildings()
    stills()
    portraits()
    save(banner(), "ashvein-banner.jpg", max_w=1024)
    command_icons()
    print("Ashvein art roster complete.")


if __name__ == "__main__":
    main()
