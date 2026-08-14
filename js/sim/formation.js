/** Ranked formation slots for group move / attack-move orders (Q10). */

import { Q10, octantFor, q10FromWorld, worldFromQ10 } from "./fixed.js";

export const FORMATION_SPACING_Q10 = q10FromWorld(2.05);
const MAX_COLS = 6;

function clampPosQ10(vQ10, mapQ10) {
  const min = q10FromWorld(1.2);
  const max = mapQ10 - min;
  return Math.max(min, Math.min(max, vQ10));
}

export function computeFormationSlots(units, targetXQ10, targetZQ10, mapWorld = 96) {
  if (!units.length) return [];
  const mapQ10 = q10FromWorld(mapWorld);
  targetXQ10 = clampPosQ10(targetXQ10, mapQ10);
  targetZQ10 = clampPosQ10(targetZQ10, mapQ10);
  if (units.length === 1) {
    const u = units[0];
    const facingOctant = octantFor(targetXQ10 - u.xQ10, targetZQ10 - u.zQ10);
    return [{ unit: u, xQ10: targetXQ10, zQ10: targetZQ10, facingOctant }];
  }

  let cx = 0;
  let cz = 0;
  for (const u of units) {
    cx += u.xQ10;
    cz += u.zQ10;
  }
  cx = (cx / units.length) | 0;
  cz = (cz / units.length) | 0;

  const dx = targetXQ10 - cx;
  const dz = targetZQ10 - cz;
  const spanSq = dx * dx + dz * dz;
  const span = spanSq > 0 ? Math.round(Math.sqrt(spanSq)) : 0;
  const fx = span > q10FromWorld(0.05) ? Math.trunc((dx * Q10) / span) : 0;
  const fz = span > q10FromWorld(0.05) ? Math.trunc((dz * Q10) / span) : Q10;
  const facingOctant = octantFor(dx, dz);
  const rx = fz;
  const rz = -fx;

  const ranked = [...units].sort((a, b) => {
    const ar = ((a.xQ10 - cx) * rx + (a.zQ10 - cz) * rz) / Q10;
    const br = ((b.xQ10 - cx) * rx + (b.zQ10 - cz) * rz) / Q10;
    if (ar !== br) return ar - br;
    const af = ((a.xQ10 - cx) * fx + (a.zQ10 - cz) * fz) / Q10;
    const bf = ((b.xQ10 - cx) * fx + (b.zQ10 - cz) * fz) / Q10;
    return bf - af;
  });

  const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(Math.sqrt(ranked.length * 1.2))));
  const slots = [];
  for (let i = 0; i < ranked.length; i++) {
    const col = i % cols;
    const row = (i / cols) | 0;
    const lateral = Math.round((col - (cols - 1) / 2) * FORMATION_SPACING_Q10);
    const depth = Math.round(-row * FORMATION_SPACING_Q10);
    const slotX = targetXQ10 + Math.trunc((lateral * rx + depth * fx) / Q10);
    const slotZ = targetZQ10 + Math.trunc((lateral * rz + depth * fz) / Q10);
    slots.push({
      unit: ranked[i],
      xQ10: clampPosQ10(slotX, mapQ10),
      zQ10: clampPosQ10(slotZ, mapQ10),
      facingOctant,
    });
  }
  return slots;
}

export function slotWorld(slot) {
  return { x: worldFromQ10(slot.xQ10), z: worldFromQ10(slot.zQ10) };
}
