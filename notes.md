# Starhaven build notes

**`dev` is the pixel-mesa pack** (static `index.html` / `js/` / `media/`). Checkpoint notes below are historical Vite greybox work that now lives on **`main`**.

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

## 2026-08-12 — Checkpoint C03 — generated art and atlas integration

- Scope: shipped locked Sunwoven, Gravemark, Meridian, and world palettes; deterministic 330-source unit/environment art generation; bilateral five-direction sources with mirrored directions; two-pose/four-frame inbetween metadata; full and half nearest-filter atlases; runtime/public byte bindings; provenance; source/runtime validators; and 32/64/128 motion proof inputs.
- Acceptance: pinned Sharp `0.34.3` with libvips `8.17.1`, source count `330`, six atlases, full atlas width `2048`, half atlases, pivot tolerance, no-dither palette checks, seam RMS `0`, public/runtime byte equality, typecheck, lint, asset tests, browser smoke, production build, offline scan, no-runtime-integration scan, and evidence validation passed.
- Evidence: `/Users/prateekranka/.codex/evidence/starhaven-c03/20260812T160212Z.ncqFIt`; the committed index is `evidence/checkpoints/C03.json`. The external evidence index records absolute paths, byte sizes, and SHA-256 hashes.
- Available hashes: asset validator `7ac585c83b3af9c3c7bc4ab571c3d1d592595b1c22642fb982412bc2366ec027`; motion video `2424390b777c8264d9053365d2cb560108f4ae0d12a9b51765322a9f8ddb458f`; build info `dba34a3e8c8e09028d36d66d9863d3af0a988ce2abf2287397846e9306b09aac`.
- Balance changes: none. The balance version remains `0` until C4.
- Limitation: art is deterministic provisional pixel-like art. It is not final human-approved production art. Full runtime use and physical-device motion proof remain incomplete.

## 2026-08-12 — Checkpoint C04 — gameplay vertical slice

- Scope: shipped `balance.v1`, milli-Flux economy, five-slot production, construction and refunds, fixed-point combat and tick-4 damage, capture micro-points, supplied Engine gating, fracture telegraph/opening, Resonance calibration, sudden death, baseline AI decisions, playable setup, pause, results, victory, and immediate rematch.
- Acceptance: typecheck, ESLint, 19 simulation/AI/bridge/asset test files with 34 tests, production build, 5 headed browser checks, exact 12:00 resolution, equal replay checksums, asset validation, offline scan, and no-OpenAI scan passed.
- Observed production preview: `vertical-slice-observation.json` records a Sunwoven Resonance victory at 10:30 after fracture and sudden death, with balance v1, build identity, seed, checksum, and a different rematch seed. `before-fracture.png`, `after-fracture.png`, `vertical-slice.mp4`, and `results-rematch.mp4` are indexed externally.
- Evidence: `/Users/prateekranka/.codex/evidence/starhaven-c04/20260812T162251Z.KjGP5s`; the committed index is `evidence/checkpoints/C04.json`. The external evidence index records absolute paths, byte sizes, and SHA-256 hashes.
- Limitation: the C4 results surface reports balance v1. The C1-owned release metadata script still emits `balanceVersion: 0` until the later build-label ownership checkpoint. SwiftUI/WKWebView, JavaScriptCore comparison, device proof, deployment, and final production art remain incomplete.

## 2026-08-12 — Checkpoint C05 — AI, feel, and polish

- Scope: shipped faction-aware seeded openings and all nine AI states, standard AI-vs-AI batch reporting, valid Stoneguard Lunge checks, local audio and haptic feedback, occlusion selection silhouettes, reduced-motion/audio/haptics/quality settings, 44 px controls, WebGL2 quality scaling, and unit/projectile performance caps.
- Acceptance: fixed 24-seed Standard batch completed 24/24; duration range `609.75–655.05` seconds with median `643` seconds; wins Sunwoven `9`, Gravemark `15`; no opening group with at least four samples exceeded `75%`. Full simulation tests recorded `20` files and `37` tests. Production-preview browser proof recorded `6` passing checks, including `feedback.haptic`, touch targets, settings, native-message order feedback, and same-origin requests.
- Evidence: `/Users/prateekranka/.codex/evidence/starhaven-c05/20260812T173952Z.QW1jq4`; the committed index is `evidence/checkpoints/C05.json`. Required C5 files include `ai-batch.json`, `ai-openings.json`, `ai-state-transitions.ndjson`, `balance-diff.json`, `prior-scenario-suite.json`, `standard-match.mp4`, `occlusion-selection.png`, `performance-browser.json`, and `input-accessibility-checklist.json`.
- Balance changes: none. `balance.v1.ts` remains unchanged. The C5 AI changes only select faction-specific opening rosters and command behavior.
- Limitation: browser style assertions use the production preview. The existing development CSP blocks Vite's inline development style injection, so the dev server does not render the CSS used by the production proof. Vite configuration remains in the later artifact-workflow ownership checkpoint.

## 2026-08-12 — Checkpoint C06 — artifact workflow, Pages, and staging

- Scope: shipped the exact-SHA Pages workflow, `.nojekyll`, deterministic `dist-hashes.json`, anchored `build-info.json`, build-label integration, downloadable artifact, 90-day artifact retention, release metadata, staging and decoded-byte verification, evidence-presence validation, offline/no-model scans, and five-check Pages propagation verification.
- Acceptance: product source SHA `7fbb1131bde9bea2f4e5fd47d3b0cdbda56e8ce1`; Actions run `31628206152` passed; downloadable artifact ID `9153972660` and Pages deployment ID `5875106757` are numeric; Pages and artifact decoded bytes match for all `29` files; all five propagation checks returned HTTP 200 and matching SHA-256; staging rejected dirty, wrong-SHA, and hash-mismatched inputs; release tests passed `4/4`; browser tests passed `6/6`; offline and no-runtime-model scans passed.
- Evidence: `/Users/prateekranka/.codex/evidence/starhaven-c06/20260812T181201Z.cYBo8G`; the committed index is `evidence/checkpoints/C06.json`. The external evidence index records absolute paths, byte sizes, and SHA-256 hashes.
- Artifact attestation:

Artifact-Source-SHA: 7fbb1131bde9bea2f4e5fd47d3b0cdbda56e8ce1
Dist-Manifest-SHA256: 1096313c88d7be3957ea8d3cbea79a27add2ca09486e0d2e4d0c4b2acfca8c49
Build-Info-SHA256: 4804a75aa9ec31b6313fce2db0e2a510e78365b23998b4bb42738a44ed51c236
GitHub-Run-ID: 31628206152
GitHub-Artifact-ID: 9153972660
GitHub-Deployment-ID: 5875106757

- Limitation: hosted gameplay and exact simulator/native proof remain C7/C8 work. GitHub Pages emitted the expected Node 20 deprecation annotation for third-party actions; it did not fail the run.

## 2026-08-12 — Checkpoint C07 — SwiftUI shell and native bridge

- Scope: shipped the iPad-first SwiftUI title/setup/settings/pause/results shell, one retained WKWebView host, private `starhaven://app/` scheme handler, generated Swift/TypeScript bridge protocol, safe-area forwarding, audio and reduced-motion settings, snapshot lifecycle, termination recovery contract, XcodeGen project, ignored `GameDist` folder reference, sandboxed Xcode verification phase, and byte-checked staged game artifact.
- Acceptance: read-only Xcode capability preflight passed; `xcodebuild build-for-testing` passed with `ENABLE_USER_SCRIPT_SANDBOXING=YES` on Xcode 26.6; web typecheck, lint, tests, offline scan, and no-runtime-model scan passed; native bridge/scheme/navigation smoke checks passed; staged and app-bundled bytes matched all 29 files; the input file list matched all 33 declared inputs and the build stamp recorded the source SHA.
- Artifact attestation:

Artifact-Source-SHA: df12691b6e0d270124e78a40014463246d7ea359
Dist-Manifest-SHA256: 4866e72c7790b4c14197ed8936622b2c5f12ea7f5257a56e9adcda58af21e095
Evidence: /Users/prateekranka/.codex/evidence/starhaven-c07/20260812T190557Z.lYjSeN; the committed index is `evidence/checkpoints/C07.json`.

- Limitation: the required iPad Pro 13-inch (M4) simulator was not installed, and no simulator was booted. Simulator flow, process restore, safe-area image, and JavaScriptCore equality proof remain unavailable. The evidence index records these limitations and separates portable contract checks from live simulator proof.

## 2026-08-12 — Checkpoint C08 — final proof and audit

- Scope: shipped the final evidence collector, one-window local-to-Pages browser proof, four-way artifact hash audit, final completion audit, and fresh review for source SHA `df12691b6e0d270124e78a40014463246d7ea359`.
- Acceptance: local and Pages matches completed with results and different-seed rematches; both build-info responses reported balance v1 and the exact source SHA; Pages, staged, and app-bundled bytes were checked against the release manifest; no page errors or cross-origin requests were observed.
- Evidence: `/Users/prateekranka/.codex/evidence/starhaven-c08/20260812T193808Z.ONRSC0`; the committed index is `evidence/checkpoints/C08.json`.
- Limitation: the exact iPad Pro 13-inch (M4) simulator was unavailable. The final audit therefore remains conditional for exact native flow, JavaScriptCore replay equality, safe-area images, process-restore recording, and full simulation-state restoration.
