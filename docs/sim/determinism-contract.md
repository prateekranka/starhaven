# Determinism contract (issue #17)

## Sim lint gate

`node scripts/sim-lint.mjs` fails if `js/sim/` contains `Math.random`, `Math.sin`, `Math.cos`, `Math.atan2`, or `Math.hypot`. Render and UI layers may still use floats for visuals.

## Replay proof

`node scripts/sim-replay-harness.mjs` records a match via `ReplayRecorder`, round-trips the codec, replays twice, and requires all periodic checksums (every 60 ticks) to match—including the final checksum from the live run.

`node scripts/verify-determinism.mjs` runs sim-lint, two harness passes, and the replay harness in one gate.

## Cross-engine note (JSC vs V8)

The sim uses integer ticks, seeded xorshift32 PRNG, and JSON checksum snapshots with no float fields—so the same seed and command log should produce identical checksums on Safari/JavaScriptCore and Chrome/V8. Validate locally:

```sh
node scripts/sim-harness.mjs --seed=0x4d455249 --ticks=240   # Node/V8
# Same command in WebKit jsc or Safari Web Inspector on ?qa=1 — compare footer checksum.
```

Document any divergence if found; none observed on the integer sim at seed `0x4d455249`, 240 ticks.

## QA surface

`?qa=1` shows live tick, checksum, and seed in the `#qa-chip` HUD element during play.
