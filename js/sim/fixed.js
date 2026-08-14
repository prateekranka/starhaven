/** Q10 fixed-point helpers for movement, pathing, and vision. */

export const Q10 = 1_024;
export const Q15 = 32_768;

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

export const q10FromWorld = (world) => Math.round(world * Q10);
export const worldFromQ10 = (value) => value / Q10;
export const absInt = (value) => (value < 0 ? -value : value);
export const square = (value) => value * value;
export const distanceSquared = (a, b) => square(a.x - b.x) + square(a.y - b.y);

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

export function octantToFacing(octant) {
  const d = OCTANT_Q15[octant] ?? OCTANT_Q15[0];
  return Math.atan2(d.x, d.y);
}

export function accumulateMoveBudget(entity, speedWorldPerSec, multiplier, dt) {
  const perSec = q10FromWorld(speedWorldPerSec * multiplier);
  entity._moveBudget = (entity._moveBudget || 0) + perSec * dt;
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
