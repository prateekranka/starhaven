# Look builder notes (Cog / Ash / Storm source sheets)

Pixel-mesa pack, `dev`. Sheets + atlases only. No sim/AI. Not shipped.

## What was wrong (verified on disk)

1. `assets/sheets/sheet-ashvein-walk.png` occupancy was `X.X.X.X.` on every row (32/64 cells). Pipeline `ash-walk.sources.v1.json` sampled col 0 and col 4 only; `pack_true_cycles.py` sampled even cols `[0,2,4,6]`. Odd columns were empty.
2. Stormveil and Cogforged walk sheets were 8×8 with unique *pixels*, but every row was right-weighted (Storm walk R/L all ≥ 2.1; Cog walk R/L all ≥ 7). No west/left camera. Sunwoven walk mixes left and right mass.
3. `media/sprites/bldg-storm-wagon.png` was 2591 bytes, ~2.5% opaque — toy wagon on empty canvas. Storm packing stills use `unit-storm-wagon.png`, which was a dense paint trapped on an opaque studio plate (a=255).
4. Guard/action sheets named `sheet-cog-guard.png`, `sheet-ash-guard.png`, `sheet-storm-guard.png` (not `sheet-cogforged-guard.png`). Several were 100% opaque: Storm-guard studio gray ~42 (shader `tex.a < 0.22` cannot discard that), Ash-guard true black, plus opaque gather/build/death plates.

## What changed

### Ashvein walk — dense 8-frame rows

Copy-shift inbetweens filled cols 1,3,5,7 from even keyframes (wrap 6→0). Occupancy is now `XXXXXXXX` / 64 unique cells, a0 ~59% (Sunwoven walk a0 ~67%).

`assets/provenance/units/ash-walk.sources.v1.json` still uses pipeline poses A=col0, B=col4; documents C=2, D=6 and atlas sample cols `[0,2,4,6]`.

### Storm / Cog — 8 distinct yaw rows

For sheets whose col-0 silhouettes were all right-facing, rows were remapped S→N along front/back mass, then W/NW/SW were `FLIP_LEFT_RIGHT` of E/NE/SE. Output row order matches provenance `S,SE,E,NE,N,NW,W,SW`.

Storm walk col-0 R/L is now ~`[3.4, 3.1, 2.2, 2.1, 2.3, 0.48, 0.45, 0.33]` (three left cameras). Cog walk similar. Storm-guard already had a left row after knockout; it was not flopped.

### Storm wagon-keep

Knocked the painted `unit-storm-wagon.png` studio plate to real alpha, trimmed, and wrote that keep to:

- `media/sprites/bldg-storm-wagon.png` (was 2591 B → ~749 KB, 1024×956, a0 ~74%)
- `media/sprites/unit-storm-wagon.png` (still billboard Storm packing uses)
- `portrait-storm-wagon.png`, `icon-build-storm-wagon.png`, `icon-train-storm-wagon.png`

Density target was `bldg-storm-tc.png` (indigo canopy, gold sigil, purple lanterns, wheeled chassis) — not the PIL toy.

### Studio knockout + repack

Edge-flood studio gray/black on opaque painted sheets, then `python3 scripts/art/pack_true_cycles.py --units-only` (4 gait frames from even columns, 8 unique directions, no mirror flag). Storm-wagon atlas is a fitted still stamp of the knockout keep.

`scripts/art/pack_true_cycles.py` `is_void` now treats low-chroma gray plates (`max < 110`, chroma ≤ 8) as studio so Storm-guard gray ~42 cannot land in the atlas. Generator: `scripts/art/look_builder_raise_painted.py`.

## Files

**Sheets** `assets/sheets/`: `sheet-ashvein-walk.png` plus Ash attack/gather/build/death; all `sheet-ash-guard*.png`; `sheet-stormveil-walk.png`, `-build.png`, `-gather.png`; all `sheet-storm-guard*.png`; `sheet-cogforged-walk.png` plus Cog attack/build/death/gather; `sheet-cog-guard-attack/gather/build/death.png`.

**Atlases** `media/sprites/`: `ash-walk`, `ash-guard`, `cog-walk`, `cog-guard`, `storm-walk`, `storm-guard`, `storm-wagon` (`.atlas.png` + `.atlas.json`).

**Wagon stills:** `bldg-storm-wagon.png`, `unit-storm-wagon.png`, `portrait-storm-wagon.png`, `icon-build-storm-wagon.png`, `icon-train-storm-wagon.png`.

**Provenance / packer:** `assets/provenance/units/ash-walk.sources.v1.json`, `scripts/art/pack_true_cycles.py`, `scripts/art/look_builder_raise_painted.py`.

## Single biggest remaining source-sheet gap

Stormveil and Cogforged still have **no authored dorsal / true-profile cameras**. N is a 3/4-right paint, and W/NW/SW are horizontal flips of E/NE/SE — not Sunwoven-style unique back-of-cloak / backpack / left-hand staff rows. Ashvein walk odd columns are copy-shift inbetweens of the four even keyframes, not unique painted mid-stride poses. A later WebGL critic should capture in-frame stills; this note is about the PNG sheets only.
