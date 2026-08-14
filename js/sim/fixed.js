/** Q10 fixed-point helpers (side-by-side; movement/combat still use floats). */

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

export function encodeFixed(value) {
  return String(value | 0);
}
