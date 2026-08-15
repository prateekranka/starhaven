# Integer sim rounding deltas (issue #16)

After migrating combat, economy, and victory to integer ticks at 60 Hz, these rounding choices affect balance. All deltas target imperceptible gameplay drift versus the prior float-second model.

## Timers

- Catalog seconds convert with `secToTicks = round(seconds × 60)` (e.g. 1.15 s attack cooldown → 69 ticks = 1.150 s).
- Sub-16 ms remainders are absorbed by tick quantization; cooldowns and build/train queues may complete up to ±½ tick early/late.

## Combat damage

- Base catalog damage and armor are integer values.
- Every playable civilization uses fixed neutral multipliers: speed, damage, and armor are `1000` (1.0×) at every position.
- Final damage keeps the integer path: `trunc(trunc(base × dmgPermille / 1000) × armorPermille / 1000)`.
- Typical melee swing differs by 0–1 HP per hit versus float multiply; time-to-kill shifts by at most one attack cycle on high-HP targets.

## Gather / carry

- Per-tick gather uses Q10 remainder accumulation (`gatherRemainder`); deposited amounts are whole resources.
- Gather rates use the same integer remainder path at every age and position.
- Long-run gather rates match float within ±1 resource per trip due to remainder carry.

## Build / repair HP

- Construction advances one tick per builder tick; HP gain is `max(1, trunc(maxHp / buildTotalTicks))` so partial buildings reach full HP when complete.

## Fixed daylight

- The simulation stays in one daylight state for every tick. It has no moving boundary, phase switch, positional modifier, or temporary shadow effect.
- Fixed neutral multipliers keep speed, damage, and armor at `1000` for every playable civilization.

## Harness checksum

- Record the checksum from the current deterministic harness for each fixed-day fixture.
- The checksum must remain stable across repeated runs with the same seed and tick count. Retired float-era checksums are not compatibility targets.
