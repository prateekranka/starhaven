# Sprite pipeline v1

Repeatable art path for pixel-mesa unit atlases on the `dev` pack branch.

## Spec files (committed)

| File | Purpose |
|------|---------|
| `assets/pipeline/sheet-spec.v1.json` | Frame size (128×128), 8 directions, clip frame counts |
| `assets/pipeline/inbetweening.v1.json` | Deterministic A/B pose patterns per clip |
| `assets/palettes/<faction>.v1.json` | Locked sRGB hex colors, no dither |
| `assets/provenance/units/<unit>.json` | Last atlas sha256 + source count |

## Pack budget

| Bucket | Limit |
|--------|-------|
| Total pack (`media/` + `js/` + …) | ≤ 120 MB |
| Per-civ art (`media/sprites/*sun*`, `*grave*`, etc.) | ≤ 15 MB |
| Audio (`media/audio/`) | ≤ 20 MB |

Run `node scripts/release/check-pack-budget.mjs` after adding art. Exits non-zero above hard limits; prints warnings at 90% of each threshold.

## Regenerate one unit

```bash
node scripts/art/pipeline/run-unit.mjs \
  --unit sun-guard \
  --faction sunwoven \
  --clips walk,attack,death
```

Outputs:

- `assets/source/units/<faction>/<unit>/…` — keyed pose PNGs
- `media/sprites/<unit>.atlas.png` — packed atlas (2048×768 for walk+attack+death)
- `media/sprites/<unit>.atlas.json` — frame grid + sha256

Then refresh pack manifests:

```bash
node scripts/release/pack-manifests.mjs
```

## Hash stability

Re-running with the same spec, palette, libvips **8.17.1**, and sharp **0.34.3** reproduces byte-identical atlases.

## Tracer bullet

**Lumen Guard** (`sun-guard`) uses `media/sprites/sun-guard.atlas.png` + `.json` in `js/game/render.js`. Other units still use legacy single-action sheets.

## Verification

```bash
node tests/browser/sprite-pipeline-smoke.mjs
node scripts/release/check-pack-budget.mjs
```
