export const Q10 = 1_024;
export const Q15 = 32_768;

export interface FixedPoint2 {
  x: number;
  y: number;
}

export interface MovementRemainder {
  x: number;
  y: number;
}

const OCTANT_Q15: readonly FixedPoint2[] = [
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

export const q10FromWorld = (world: number): number => Math.round(world * Q10);
export const worldFromQ10 = (value: number): number => value / Q10;
export const absInt = (value: number): number => (value < 0 ? -value : value);
export const square = (value: number): number => value * value;
export const distanceSquared = (a: FixedPoint2, b: FixedPoint2): number => square(a.x - b.x) + square(a.y - b.y);

export function octantFor(deltaX: number, deltaY: number): number {
  const absX = absInt(deltaX);
  const absY = absInt(deltaY);
  if (absX === 0 && absY === 0) return 0;
  if (absX >= absY * 3) return deltaX >= 0 ? 0 : 8;
  if (absY >= absX * 3) return deltaY >= 0 ? 4 : 12;
  if (absX >= absY) {
    if (deltaX >= 0) return deltaY >= 0 ? 1 : 15;
    return deltaY >= 0 ? 7 : 9;
  }
  if (deltaY >= 0) return deltaX >= 0 ? 3 : 5;
  return deltaX >= 0 ? 13 : 11;
}

export function fixedMovementStep(deltaX: number, deltaY: number, speedQ10PerTick: number, remainder: MovementRemainder): FixedPoint2 {
  const direction = OCTANT_Q15[octantFor(deltaX, deltaY)] ?? OCTANT_Q15[0];
  const numeratorX = direction.x * speedQ10PerTick + remainder.x;
  const numeratorY = direction.y * speedQ10PerTick + remainder.y;
  const stepX = Math.trunc(numeratorX / Q15);
  const stepY = Math.trunc(numeratorY / Q15);
  remainder.x = numeratorX - stepX * Q15;
  remainder.y = numeratorY - stepY * Q15;
  return { x: stepX, y: stepY };
}

export function clampToTarget(position: FixedPoint2, target: FixedPoint2, step: FixedPoint2): FixedPoint2 {
  const next = { x: position.x + step.x, y: position.y + step.y };
  const before = distanceSquared(position, target);
  const after = distanceSquared(next, target);
  return after > before ? { ...target } : next;
}

export function encodeFixed(value: number): string {
  return String(value | 0);
}
