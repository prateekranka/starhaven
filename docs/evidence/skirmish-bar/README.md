# Starhaven AoE2 1v1 + look bar

Orchestrator live page: open `docs/evidence/skirmish-bar/index.html`.

## Frozen north star (do not replace)

- Boom: `refs/aoe2-boom.mp4`
- Choke fight: `refs/aoe2-choke-fight.mp4`
- Provenance: `refs/SOURCE.json`

AoE2 is a **play-shape** north star, not a visual one. Pixel-mesa stays.

## Gameplay bar

Headless: `node scripts/sim-shape-batch.mjs`

Pairings only: Cogforged vs Ashvein, Cogforged vs Stormveil, Ashvein vs Stormveil on Highland Chokes. Multiple seeds.

A game has the shape iff:

1. Open — both TCs stand, both have villagers gathering
2. Mid — both produce military or age up
3. Real fight — both lose military units (not a 30s steamroll, not two idling towns)
4. A winner — `world.winner` from play. Stalemate resolver does **not** count.

Pass at ≥90%.

## Look bar

Candidate: WebGL canvas stills in `stills/` from the running pack.

Reference (generated images, not in-game Sunwoven/Gravemark):

- `assets/sheets/sheet-sunwoven-walk.png`
- `assets/sheets/sheet-sun-guard.png`
- `assets/sheets/sheet-gravemark-walk.png`
- `assets/sheets/sheet-grave-guard.png`
- `media/sprites/bldg-sun-tc.png`, `bldg-sun-house.png`, `bldg-sun-wonder.png`
- `media/sprites/bldg-grave-tc.png`, `bldg-grave-house.png`, `bldg-grave-wonder.png`
- `media/sprites/portrait-sunwoven.png`, `portrait-gravemark.png`

Blind A/B. If a painted civ in the still loses, name the single biggest painted-civ-in-frame gap. Until the floor is met, that gap may not be “mesa vs Arabia.”

## Pieces

| id | piece | judged by |
|----|--------|-----------|
| G1 | Opening gather + both TCs | shape-batch `open` |
| G2 | Mid production / age | shape-batch `mid` |
| G3 | Real fight (mutual military losses, no steamroll) | shape-batch `fight` + recording vs choke clip |
| G4 | Winner from play | shape-batch `winnerFromPlay` |
| L1 | Cogforged in-frame | stills vs generated refs |
| L2 | Ashvein in-frame | stills vs generated refs |
| L3 | Stormveil in-frame | stills vs generated refs |

## Status

See `STATUS.json`. `done=true` only when both bars pass and live `build-info.json` `displaySha` matches the shipped commit.
