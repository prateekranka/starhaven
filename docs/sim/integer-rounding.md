# Integer sim rounding deltas (issue #16)

After migrating combat, economy, and victory to integer ticks at 60 Hz, these rounding choices affect balance. All deltas target imperceptible gameplay drift versus the prior float-second model.

## Timers

- Catalog seconds convert with `secToTicks = round(seconds × 60)` (e.g. 1.15 s attack cooldown → 69 ticks = 1.150 s).
- Sub-16 ms remainders are absorbed by tick quantization; cooldowns and build/train queues may complete up to ±½ tick early/late.

## Combat damage

- Base catalog damage is integer; faction buffs use permille (1100 = +10%).
- Final damage: `trunc(trunc(base × dmgPermille / 1000) × armorPermille / 1000)`.
- Typical melee swing differs by 0–1 HP per hit versus float multiply; time-to-kill shifts by at most one attack cycle on high-HP targets.

## Gather / carry

- Per-tick gather uses Q10 remainder accumulation (`gatherRemainder`); deposited amounts are whole resources.
- Age-II gather bonus uses 1120/1000 permille before tick division.
- Long-run gather rates match float within ±1 resource per trip due to remainder carry.

## Build / repair HP

- Construction advances one tick per builder tick; HP gain is `max(1, trunc(maxHp / buildTotalTicks))` so partial buildings reach full HP when complete.

## Bright line (day/night)

- Replaced `sin(t/38)` with a triangle wave over 38 s (2280 ticks) for deterministic integer phase. Faction light/dark boundaries shift slightly versus smooth sine; sunwoven/gravemark buff windows differ by ≤1 tick at edges.

## Harness checksum

- Baseline at `fc68c35` with seed `0x4d455249`, 240 ticks: `058b43ea`.
- Integer migration changes the checksum to `46decdf6` (stable across repeated harness runs).
