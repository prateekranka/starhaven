# Starhaven build notes

This file records each pushed build checkpoint.

## 2026-08-12 — Source baseline

- Added the primary-source architecture and production findings.
- Confirmed the required planner, implementer, and reviewer CLI routes in read-only mode.
- Defined the measurable delivery goal before implementation.
- Preserved the supplied visual references as design inputs. They are not runtime-ready assets.

## 2026-08-12 — Checkpoint C01 — polished root title

- Scope: shipped the Vite root entry, responsive Starhaven title, faction identity cards, setup placeholder, bounded staging placeholder, native loading surface, release CSP, dirty build label, and offline/no-network validators.
- Acceptance: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, browser title/setup smoke, offline scan, no-runtime-integration scan, and evidence validation passed.
- Evidence: `/Users/prateekranka/.codex/evidence/starhaven-c01/20260812T153915Z.6oafMi`; the committed index is `evidence/checkpoints/C01.json`. The external evidence index records absolute paths, byte sizes, and SHA-256 hashes.
- Available hashes: title still `d9076b63e2a5ccc3dfcb8cfa879d719005ab9a39fbc3e4bc0327d57fb65695f0`; motion capture `40e8fe83e6b402c43ed400e7ef8d40b3e4875eaf11d317d1a13a231d4174a0d9`; build info `68c811711e153068abe8d7dba9f572e52723485b7144a38af4ef6c75a421c26a`.
- Balance changes: none. The balance version remains `0` until the gameplay foundation checkpoint.
- Limitation: the repository-root `PLAN.md` requested by the handoff was absent and is not in baseline history. Execution follows the canonical handoff order. Gameplay, AI, SwiftUI, deployment, and physical-device proof remain incomplete by design.

## 2026-08-12 — Checkpoint C02 — runtime foundation

- Scope: shipped the 20 Hz fixed-step simulation, Q10 integer movement with stored remainders, seeded PRNG streams and cursors, symmetric faction starts, authored fracture navigation graph, replay codec, versioned bridge schema and idempotent generator, fixed 2:1 dimetric camera, WebGL2 renderer, instanced unit quads, pointer mode state, safe-area HUD, and foundation match route.
- Acceptance: typecheck, ESLint restricted simulation-math rules, simulation/replay/bridge tests, browser title and foundation smoke, production build, offline scan, no-runtime-integration scan, and evidence validation passed.
- Evidence: `/Users/prateekranka/.codex/evidence/starhaven-c02/20260812T155144Z.R7MmUc`; the committed index is `evidence/checkpoints/C02.json`. The external evidence index records absolute paths, byte sizes, and SHA-256 hashes.
- Available hashes: determinism and PRNG reports, bridge generation, simulation lint, foundation motion, safe-area capture, gesture trace, build output, and push visibility are indexed externally.
- Balance changes: none. The gameplay balance version remains `0`; C4 owns the first versioned match balance.
- Limitation: the foundation route is a greybox proof. Generated art, complete match rules, AI, native shell, Pages deployment, and physical-device performance proof remain incomplete.
