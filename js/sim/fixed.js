/** Q10 fixed-point helpers for movement, pathing, vision, and integer sim ticks. */

export const Q10 = 1_024;
export const Q15 = 32_768;
export const TICKS_PER_SEC = 60;
export const PERMILLE = 1_000;

const OCTANT_Q15 = [
  { x: Q15, y: 0 },
  { x: 30_273, y: 12_539 },
  { x: 23_170, y: 23_170 },
  { x: 12_539, y: 30_273 },
  { x: 0, y: Q15 },
  { x: -12_539, y: 30_273 },
  { x: -23_170, y: 23_170 },
  { x: -30_273, y: 12_539 },
  { x: -Q15, y: 0 },
  { x: -30_273, y: -12_539 },
  { x: -23_170, y: -23_170 },
  { x: -12_539, y: -30_273 },
  { x: 0, y: -Q15 },
  { x: 12_539, y: -30_273 },
  { x: 23_170, y: -23_170 },
  { x: 30_273, y: -12_539 },
];

/** Facing angles for render (milliradians); render-only, not used in sim logic. */
export const FACING_MILLIRAD = [
  0, 402, 785, 1152, 1571, 1995, 2410, 2827, 3142, 3559, 3974, 4398, 4712, 5129, 5544, 5968,
];

const BRIGHT_PERIOD = 38 * TICKS_PER_SEC;

export const secToTicks = (seconds) => Math.round(seconds * TICKS_PER_SEC);
export const ticksToSec = (ticks) => ticks / TICKS_PER_SEC;
export const q10FromWorld = (world) => Math.round(world * Q10);
export const worldFromQ10 = (value) => value / Q10;
export const absInt = (value) => (value < 0 ? -value : value);
export const square = (value) => value * value;
export const distanceSquared = (a, b) => square(a.x - b.x) + square(a.y - b.y);

export function permilleMul(value, permille) {
  return Math.trunc((value * permille) / PERMILLE);
}

/** Integer square root. JS `>>` coerces to int32, so Q10 distance-squared
 *  values past ~45 world units overflowed and returned 0 — town centers and
 *  scouts then treated the far base as point-blank. */
export function isqrt(n) {
  n = Math.trunc(n);
  if (n <= 0) return 0;
  let x = n;
  let y = Math.trunc((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.trunc((x + Math.trunc(n / x)) / 2);
  }
  return x;
}

export function distanceQ10FromSq(distSq) {
  return isqrt(distSq);
}

export function brightQ10(tick) {
  const t = tick % BRIGHT_PERIOD;
  const half = BRIGHT_PERIOD >> 1;
  if (t < half) return Math.trunc((t * Q10) / half);
  return Math.trunc(((BRIGHT_PERIOD - t) * Q10) / half);
}

export function terrainHashPermille(x, z) {
  let h = (x * 374761393 + z * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return h % PERMILLE;
}

export function distanceSquaredQ10(a, b) {
  return square(a.xQ10 - b.xQ10) + square(a.zQ10 - b.zQ10);
}

export function cellOfQ10(xQ10, zQ10, cell) {
  const scale = cell * Q10;
  return [(xQ10 / scale) | 0, (zQ10 / scale) | 0];
}

export function worldOfCellQ10(cx, cz, cell) {
  return [q10FromWorld((cx + 0.5) * cell), q10FromWorld((cz + 0.5) * cell)];
}

export function octantFor(deltaX, deltaY) {
  const absX = absInt(deltaX);
  const absY = absInt(deltaY);
  if (absX === 0 && absY === 0) return 0;
  if (absX >= absY * 3) return deltaX >= 0 ? 0 : 8;
  if (absY >= absX * 3) return deltaY >= 0 ? 4 : 12;
  if (absX === absY) {
    if (deltaX >= 0 && deltaY >= 0) return 2;
    if (deltaX < 0 && deltaY >= 0) return 6;
    if (deltaX < 0 && deltaY < 0) return 10;
    return 14;
  }
  if (absX >= absY) {
    if (deltaX >= 0) return deltaY >= 0 ? 1 : 15;
    return deltaY >= 0 ? 7 : 9;
  }
  if (deltaY >= 0) return deltaX >= 0 ? 3 : 5;
  return deltaX >= 0 ? 13 : 11;
}

export function fixedDirectionQ15(deltaX, deltaY) {
  return { ...(OCTANT_Q15[octantFor(deltaX, deltaY)] ?? OCTANT_Q15[0]) };
}

export function fixedMovementStep(deltaX, deltaY, speedQ10PerTick, remainder) {
  const direction = fixedDirectionQ15(deltaX, deltaY);
  const numeratorX = direction.x * speedQ10PerTick + remainder.x;
  const numeratorY = direction.y * speedQ10PerTick + remainder.y;
  const stepX = Math.trunc(numeratorX / Q15);
  const stepY = Math.trunc(numeratorY / Q15);
  remainder.x = numeratorX - stepX * Q15;
  remainder.y = numeratorY - stepY * Q15;
  return { x: stepX, y: stepY };
}

export function clampToTarget(position, target, step) {
  const next = { x: position.x + step.x, y: position.y + step.y };
  const before = distanceSquared(position, target);
  const after = distanceSquared(next, target);
  return after > before ? { ...target } : next;
}

export function accumulateMoveBudget(entity, speedWorldPerSec, multiplierPermille, ticks = 1) {
  const perTick = Math.trunc((q10FromWorld(speedWorldPerSec) * multiplierPermille) / (TICKS_PER_SEC * PERMILLE));
  entity._moveBudget = (entity._moveBudget || 0) + perTick * ticks;
  const budget = Math.trunc(entity._moveBudget);
  if (budget > 0) entity._moveBudget -= budget;
  return budget;
}

export function q10RangeSq(worldRadius) {
  const r = q10FromWorld(worldRadius);
  return r * r;
}

export function encodeFixed(value) {
  return String(value | 0);
}

export function isBuilt(building) {
  return building.buildTicks >= building.buildTotalTicks;
}

export function buildRatio(building) {
  if (!building.buildTotalTicks) return 1;
  return building.buildTicks / building.buildTotalTicks;
}

export function assertSimPositionsInteger(world) {
  const check = (label, xQ10, zQ10) => {
    if (!Number.isInteger(xQ10) || !Number.isInteger(zQ10)) {
      throw new Error(`${label} has non-integer Q10 position`);
    }
  };
  for (const u of world.units) check(`unit ${u.id}`, u.xQ10, u.zQ10);
  for (const b of world.buildings) check(`building ${b.id}`, b.xQ10, b.zQ10);
  for (const r of world.resources) check(`resource ${r.id}`, r.xQ10, r.zQ10);
  for (const p of world.projectiles) check(`projectile ${p.id}`, p.xQ10, p.zQ10);
  for (const r of world.relics) check(`relic ${r.id}`, r.xQ10, r.zQ10);
}

export function assertSimIntegerInvariant(world) {
  const requireInt = (label, value) => {
    if (!Number.isInteger(value)) throw new Error(`${label} is not an integer: ${value}`);
  };
  requireInt("world.t", world.t);
  requireInt("world.brightQ10", world.brightQ10);
  for (const p of Object.values(world.players)) {
    requireInt(`player ${p.id} agingTicks`, p.agingTicks);
    requireInt(`player ${p.id} attackWaveAtTick`, p.attackWaveAtTick);
    for (const k of ["food", "wood", "crystal", "ore"]) {
      requireInt(`player ${p.id} stock.${k}`, p.stock[k]);
      requireInt(`player ${p.id} gathered.${k}`, p.gathered[k]);
      requireInt(`player ${p.id} rates.${k}`, p.rates[k]);
    }
  }
  for (const u of world.units) {
    requireInt(`unit ${u.id} hp`, u.hp);
    requireInt(`unit ${u.id} carry`, u.carry || 0);
    requireInt(`unit ${u.id} attackCdTicks`, u.attackCdTicks || 0);
    requireInt(`unit ${u.id} repathTicks`, u.repathTicks || 0);
    requireInt(`unit ${u.id} gatherRemainder`, u.gatherRemainder || 0);
  }
  for (const b of world.buildings) {
    requireInt(`building ${b.id} hp`, b.hp);
    requireInt(`building ${b.id} buildTicks`, b.buildTicks);
    requireInt(`building ${b.id} buildTotalTicks`, b.buildTotalTicks);
    requireInt(`building ${b.id} attackCdTicks`, b.attackCdTicks || 0);
    requireInt(`building ${b.id} wonderTicks`, b.wonderTicks || 0);
    for (const q of b.queue) requireInt(`building ${b.id} queue.leftTicks`, q.leftTicks);
  }
  for (const r of world.resources) requireInt(`resource ${r.id} amount`, r.amount);
  for (const p of world.projectiles) {
    requireInt(`projectile ${p.id} dmg`, p.dmg);
    requireInt(`projectile ${p.id} speedQ10PerTick`, p.speedQ10PerTick);
  }
}
