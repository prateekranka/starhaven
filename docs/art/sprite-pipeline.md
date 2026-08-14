# Sprite pipeline v1

Repeatable art path for pixel-mesa unit atlases on the `dev` pack branch.

## Spec files (committed)

| File | Purpose |
|------|---------|
| `assets/pipeline/sheet-spec.v1.json` | Frame size (128×128), 8 directions, clip frame counts |
| `assets/pipeline/inbetweening.v1.json` | Deterministic A/B pose patterns per clip |
| `assets/palettes/<faction>.v1.json` | Locked sRGB hex colors, no dither |
| `assets/provenance/units/<unit>.json` | Last atlas sha256 + source count |
| `assets/provenance/units/<unit>.sources.v1.json` | Legacy sheet extraction map (cols/rows per clip + pose) |
| `assets/provenance/units/_shared.guard-clips.json` | Guard-sheet clip column map |
| `assets/provenance/units/_shared.walk-clips.json` | Walk-sheet clip column map (attack/gather/build temporary) |

## Pack budget

| Bucket | Limit |
|--------|-------|
| Total pack (`media/` + `js/` + …) | ≤ 120 MB |
| Per-civ art in the pack (atlases, buildings, portraits, icons) | ≤ 15 MB |
| Audio (`media/audio/`) | ≤ 20 MB |

Source 8×8 cycle sheets live in `assets/sheets/` and are **not** part of the download pack. The match renderer uses packed `*.atlas.png` only.

Run `node scripts/release/check-pack-budget.mjs` after adding art. Exits non-zero above hard limits; prints warnings at 90% of each threshold. The checker counts Sunwoven, Gravemark, Cogforged, Ashvein, and Stormveil.

## Regenerate all units (issue #12 rollout)

```bash
cd scripts/art/pipeline && npm install sharp@0.34.3
node run-all-units.mjs
node ../../../scripts/release/pack-manifests.mjs
```

Single unit:

```bash
node scripts/art/pipeline/run-unit.mjs \
  --unit sun-guard \
  --faction sunwoven \
  --clips walk,attack,gather,build,death
```

Outputs:

- `assets/sheets/` — 8×8 cycle source sheets (not shipped in the pack)
- `assets/source/units/<faction>/<unit>/…` — keyed pose PNGs extracted from those sheets
- `media/sprites/<unit>.atlas.png` — packed atlas (2048×1280 for five clips)
- `media/sprites/<unit>.atlas.json` — frame grid + sha256

Source frames are **sampled** from `assets/sheets/` using the unit's `.sources.v1.json` map. Sunwoven/Gravemark poses are palette-cleaned. Cogforged/Ashvein/Stormveil painted cycles are **not** palette-locked. Units without dedicated attack sheets reuse walk/guard columns — see `_shared.walk-clips.json` (temporary).

Still-based units (`sun-strider`, `sun-siege`, …) set `"mode": "still"` in their sources file; the extractor crops the committed unit PNG.

## Renderer

`js/game/unit-atlas.js` maps sim unit type + faction → atlas id. `js/game/render.js` drives idle/walk/attack/gather/build/death from sim state; death plays once then corpse fade (no scale-bob).

| Atlas | Units |
|-------|-------|
| `sun-guard` / `grave-guard` | guard, archer |
| `sun-walk` / `grave-walk` | villager, scout |
| `sun-strider` / `grave-strider` | strider, titan (grave) |
| `sun-siege` / `grave-siege` | siege |

## Verification

```bash
node tests/browser/sprite-pipeline-smoke.mjs
node scripts/release/check-pack-budget.mjs
```
