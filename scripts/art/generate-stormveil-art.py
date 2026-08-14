#!/usr/bin/env python3
"""Generate Stormveil Nomads art roster — issue #29.

Distinct nomadic silhouettes (canvas tents, wagon wheels, hooded cloaks),
locked stormveil palette, full animation sheet layout, buildings, portraits,
banner, and command icons. No Gravemark/Sunwoven tints.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "media" / "sprites"
TEX = ROOT / "media" / "textures"
CELL = 128
SHEET = 1024

# Locked Stormveil palette (matches assets/palettes/stormveil.v1.json)
P = {
    "storm": (123, 167, 201),    # #7BA7C9 primary cloth
    "canvas": (201, 165, 108),   # #C9A56C wagon wood
    "veil": (107, 91, 149),      # #6B5B95 magic accent
    "light": (232, 220, 200),    # #E8DCC8 highlights
    "shadow": (46, 64, 83),      # #2E4053 metal/shade
    "night": (15, 21, 32),       # #0F1520 outlines
}


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def nearest(c: tuple[int, int, int]) -> tuple[int, int, int]:
    best, bd = P["storm"], 1e9
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


def draw_wagon_wheel(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int = 10) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(*P["shadow"], 255), width=2)
    draw.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=(*P["canvas"], 255))
    for a in range(0, 360, 45):
        rad = math.radians(a)
        px(draw, cx + int(math.cos(rad) * (r - 2)) - 1, cy + int(math.sin(rad) * (r - 2)) - 1, P["shadow"], 2)


def draw_canvas_tent(draw: ImageDraw.ImageDraw, cx: int, base: int, w: int, h: int) -> None:
    left, right = cx - w // 2, cx + w // 2
    poly(draw, [(left, base), (cx, base - h), (right, base)], P["storm"])
    poly(draw, [(left + 4, base), (cx, base - h + 8), (right - 4, base)], P["light"])
    draw.line([(cx, base - h), (cx, base)], fill=(*P["canvas"], 255), width=2)
    draw.line([(left, base), (right, base)], fill=(*P["shadow"], 255), width=2)


def draw_nomads(draw: ImageDraw.ImageDraw, cx: int, cy: int, direction: int, frame: int, *, guard: bool = False) -> None:
    """Draw hooded nomad. direction 0=S..7=SW; frame 0-7 walk cycle."""
    bob = [0, -2, 0, 2, 0, -1, 0, 1][frame % 8]
    cy += bob
    lean = direction - 4
    cloak_w = 22 + abs(lean) * 2
    # Pointed hood — distinct Stormveil silhouette
    hood_h = 18 if guard else 16
    hood_tip = cy - 38
    hood_l = cx - 8 + lean
    hood_r = cx + 8 + lean
    poly(draw, [(hood_l, cy - 22), (cx + lean, hood_tip), (hood_r, cy - 22)], P["storm"])
    poly(draw, [(hood_l + 2, cy - 20), (cx + lean, hood_tip + 4), (hood_r - 2, cy - 20)], P["veil"])
    # Flowing trapezoid cloak (not sun diamond / grave hex)
    body_top = cy - 20
    body_bot = cy + 18
    poly(
        draw,
        [
            (cx - 6 + lean, body_top),
            (cx + 6 + lean, body_top),
            (cx + cloak_w + lean, body_bot),
            (cx - cloak_w + lean, body_bot),
        ],
        P["storm"],
        P["night"],
    )
    # Wind streamer scarf
    stream_len = 8 + frame % 4
    sx = cx + cloak_w + lean
    sy = cy - 8
    for i in range(stream_len):
        px(draw, sx + i, sy + (i % 2), P["light"], 2)
    # Legs
    step = (frame % 4) - 1.5
    px(draw, cx - 6 + int(step), cy + 20, P["shadow"], 4)
    px(draw, cx + 2 - int(step), cy + 20, P["shadow"], 4)
    if guard:
        # Round shield + curved scimitar
        draw.ellipse([cx - 22 + lean, cy - 10, cx - 8 + lean, cy + 8], fill=(*P["canvas"], 255), outline=(*P["shadow"], 255))
        draw.arc([cx + 4 + lean, cy - 14, cx + 18 + lean, cy + 6], 270, 90, fill=(*P["shadow"], 255), width=2)
    else:
        # Travel staff
        draw.line([(cx + cloak_w + lean + 4, cy - 28), (cx + cloak_w + lean + 4, cy + 16)], fill=(*P["canvas"], 255), width=2)
        px(draw, cx + cloak_w + lean + 2, cy - 30, P["veil"], 4)


def unit_cell(direction: int, frame: int, *, guard: bool = False) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Mirror W/NW/SW from E/NE/SE
    dir_map = [0, 1, 2, 3, 4, 3, 2, 1]
    d = dir_map[direction]
    flip = direction in (5, 6, 7)
    draw_nomads(draw, 64 + (8 if d == 2 else -8 if d == 6 else 0), 72, d, frame, guard=guard)
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


def draw_building(kind: str) -> Image.Image:
    w, h = 640, 720
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, base = w // 2, h - 40

    if kind == "tc":
        draw_wagon_wheel(draw, cx - 80, base - 10, 14)
        draw_wagon_wheel(draw, cx + 80, base - 10, 14)
        draw.rectangle([cx - 120, base - 80, cx + 120, base], fill=(*P["canvas"], 255), outline=(*P["shadow"], 255))
        draw_canvas_tent(draw, cx, base - 80, 200, 120)
        poly(draw, [(cx - 30, base - 200), (cx, base - 240), (cx + 30, base - 200)], P["veil"])
    elif kind == "house":
        draw_canvas_tent(draw, cx, base, 140, 100)
        draw_wagon_wheel(draw, cx - 50, base - 5, 8)
        draw_wagon_wheel(draw, cx + 50, base - 5, 8)
    elif kind == "mill":
        draw.rectangle([cx - 8, base - 160, cx + 8, base], fill=(*P["canvas"], 255))
        for a in range(0, 360, 90):
            rad = math.radians(a - 20)
            ex = cx + int(math.cos(rad) * 70)
            ey = base - 120 + int(math.sin(rad) * 70)
            draw.line([(cx, base - 120), (ex, ey)], fill=(*P["storm"], 255), width=6)
        draw.polygon([(ex, ey) for ex, ey in [(cx, base - 190), (cx + 50, base - 150), (cx, base - 110), (cx - 50, base - 150)]], fill=(*P["light"], 255))
    elif kind == "lumber":
        draw.rectangle([cx - 90, base - 50, cx + 90, base], fill=(*P["canvas"], 255), outline=(*P["shadow"], 255))
        draw_wagon_wheel(draw, cx - 70, base - 5, 12)
        draw_wagon_wheel(draw, cx + 70, base - 5, 12)
        for i in range(5):
            draw.rectangle([cx - 60 + i * 14, base - 90, cx - 50 + i * 14, base - 50], fill=(*P["shadow"], 255))
    elif kind == "mine":
        draw_canvas_tent(draw, cx, base - 30, 160, 70)
        draw.polygon([(cx - 40, base - 30), (cx, base - 10), (cx + 40, base - 30)], fill=(*P["veil"], 255))
        draw.rectangle([cx - 50, base - 30, cx + 50, base], fill=(*P["shadow"], 255))
    elif kind == "rax":
        draw_canvas_tent(draw, cx - 60, base, 100, 80)
        draw_canvas_tent(draw, cx + 60, base, 100, 80)
        draw.line([(cx - 110, base - 60), (cx + 110, base - 60)], fill=(*P["veil"], 255), width=3)
    elif kind == "spire":
        draw.line([(cx, base), (cx, base - 220)], fill=(*P["canvas"], 255), width=4)
        poly(draw, [(cx - 60, base - 180), (cx, base - 240), (cx + 60, base - 180)], P["storm"])
        draw.line([(cx - 40, base - 200), (cx + 40, base - 160)], fill=(*P["veil"], 255), width=2)
    elif kind == "den":
        draw.arc([cx - 80, base - 60, cx + 80, base + 20], 180, 0, fill=(*P["storm"], 255))
        draw.rectangle([cx - 80, base - 30, cx + 80, base], fill=(*P["canvas"], 255))
        draw.ellipse([cx - 20, base - 40, cx + 20, base], fill=(*P["shadow"], 255))
    elif kind == "workshop":
        draw.rectangle([cx - 100, base - 60, cx + 100, base], fill=(*P["canvas"], 255))
        draw_wagon_wheel(draw, cx - 60, base - 5, 10)
        draw_wagon_wheel(draw, cx + 60, base - 5, 10)
        draw.rectangle([cx - 20, base - 100, cx + 20, base - 60], fill=(*P["shadow"], 255))
    elif kind == "wonder":
        for ox in (-100, 0, 100):
            draw_wagon_wheel(draw, cx + ox - 40, base - 10, 16)
            draw_wagon_wheel(draw, cx + ox + 40, base - 10, 16)
            draw_canvas_tent(draw, cx + ox, base - 50, 120, 90)
        poly(draw, [(cx - 160, base - 140), (cx, base - 280), (cx + 160, base - 140)], P["veil"])
    elif kind == "wagon":
        draw.rectangle([cx - 100, base - 70, cx + 100, base - 20], fill=(*P["storm"], 255), outline=(*P["night"], 255))
        draw.rectangle([cx - 90, base - 65, cx + 90, base - 25], fill=(*P["light"], 255))
        draw_wagon_wheel(draw, cx - 70, base - 10, 14)
        draw_wagon_wheel(draw, cx + 70, base - 10, 14)
        for i in range(3):
            draw.line([(cx - 80 + i * 30, base - 70), (cx - 80 + i * 30, base - 90)], fill=(*P["canvas"], 255), width=2)
    else:
        draw_canvas_tent(draw, cx, base, 120, 80)

    return img.filter(ImageFilter.SHARPEN)


def draw_still(kind: str) -> Image.Image:
    w, h = 512, 640
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, base = w // 2, h - 30
    if kind == "strider":
        draw.ellipse([cx - 50, base - 30, cx + 50, base], fill=(*P["shadow"], 255))
        draw.ellipse([cx - 30, base - 80, cx + 30, base - 30], fill=(*P["storm"], 255))
        poly(draw, [(cx - 20, base - 100), (cx, base - 140), (cx + 20, base - 100)], P["veil"])
        draw.line([(cx - 40, base - 20), (cx - 60, base)], fill=(*P["canvas"], 255), width=4)
        draw.line([(cx + 40, base - 20), (cx + 60, base)], fill=(*P["canvas"], 255), width=4)
    elif kind == "siege":
        draw.rectangle([cx - 80, base - 40, cx + 80, base], fill=(*P["canvas"], 255))
        draw_wagon_wheel(draw, cx - 60, base - 5, 12)
        draw_wagon_wheel(draw, cx + 60, base - 5, 12)
        draw.rectangle([cx - 10, base - 80, cx + 10, base - 40], fill=(*P["shadow"], 255))
        draw.line([(cx, base - 80), (cx + 100, base - 100)], fill=(*P["storm"], 255), width=4)
        poly(draw, [(cx + 90, base - 110), (cx + 110, base - 95), (cx + 90, base - 80)], P["veil"])
    elif kind == "wagon":
        draw_building("wagon")
        return img  # reuse building wagon on smaller canvas
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
    img = Image.new("RGBA", (1024, 256), (*P["night"], 255))
    draw = ImageDraw.Draw(img)
    for x in range(0, 1024, 40):
        draw.line([(x, 0), (x + 20, 256)], fill=(*P["storm"], 80), width=2)
    draw_canvas_tent(draw, 512, 220, 300, 140)
    draw_wagon_wheel(draw, 200, 200, 20)
    draw_wagon_wheel(draw, 824, 200, 20)
    poly(draw, [(400, 80), (512, 20), (624, 80)], P["veil"])
    return img.convert("RGB")


def sheets() -> None:
    print("Unit sheets…")
    save(build_sheet(guard=False), "sheet-stormveil-walk.png")
    save(build_sheet(guard=True), "sheet-storm-guard.png")


def buildings() -> None:
    print("Buildings…")
    kinds = ["tc", "house", "mill", "lumber", "mine", "rax", "spire", "den", "workshop", "wonder", "wagon"]
    for k in kinds:
        save(draw_building(k), f"bldg-storm-{k}.png", max_w=560)


def stills() -> None:
    print("Still units…")
    for k in ("strider", "siege", "wagon"):
        img = draw_still(k)
        if k == "wagon":
            img = draw_building("wagon").resize((512, 640), Image.Resampling.LANCZOS)
        save(img, f"unit-storm-{k}.png", max_w=480)


def portraits() -> None:
    print("Portraits…")
    walk = build_sheet(guard=False)
    guard = build_sheet(guard=True)
    strider = draw_still("strider")
    siege = draw_still("siege")
    wagon = draw_building("wagon").resize((512, 640), Image.Resampling.LANCZOS)
    mapping = {
        "portrait-stormveil.png": walk,
        "portrait-storm-villager.png": walk,
        "portrait-storm-scout.png": walk,
        "portrait-storm-guard.png": guard,
        "portrait-storm-archer.png": guard,
        "portrait-storm-strider.png": strider,
        "portrait-storm-siege.png": siege,
        "portrait-storm-wagon.png": wagon,
        "portrait-storm-titan.png": strider,
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
        ("wagon", "wagon"),
    ]
    for btype, key in builds:
        src = Image.open(SPR / f"bldg-storm-{key}.png")
        save(icon_from(src), f"icon-build-storm-{btype}.png")

    trains = [
        ("villager", "sheet-stormveil-walk.png"),
        ("scout", "sheet-stormveil-walk.png"),
        ("guard", "sheet-storm-guard.png"),
        ("archer", "sheet-storm-guard.png"),
        ("strider", "unit-storm-strider.png"),
        ("siege", "unit-storm-siege.png"),
        ("wagon", "unit-storm-wagon.png"),
    ]
    for unit, src_name in trains:
        src = Image.open(SPR / src_name)
        save(icon_from(src), f"icon-train-storm-{unit}.png")

    save(icon_from(Image.open(SPR / "bldg-storm-tc.png")), "icon-age-storm.png")


def main() -> None:
    palette_path = ROOT / "assets" / "palettes" / "stormveil.v1.json"
    assert palette_path.exists(), "stormveil palette missing"
    sheets()
    buildings()
    stills()
    portraits()
    save(banner(), "stormveil-banner.jpg", max_w=1024)
    command_icons()
    print("Stormveil art roster complete.")


if __name__ == "__main__":
    main()
