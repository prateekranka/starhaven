/** Ranked formation slots for group move / attack-move orders. */

export const FORMATION_SPACING = 2.05;
const MAX_COLS = 6;
const MAP = 96;

function clampPos(v) {
  return Math.max(1.2, Math.min(MAP - 1.2, v));
}

export function computeFormationSlots(units, targetX, targetZ) {
  if (!units.length) return [];
  targetX = clampPos(targetX);
  targetZ = clampPos(targetZ);
  if (units.length === 1) {
    const u = units[0];
    const facing = Math.atan2(targetX - u.x, targetZ - u.z);
    return [{ unit: u, x: targetX, z: targetZ, facing }];
  }

  let cx = 0;
  let cz = 0;
  for (const u of units) {
    cx += u.x;
    cz += u.z;
  }
  cx /= units.length;
  cz /= units.length;

  const dx = targetX - cx;
  const dz = targetZ - cz;
  const span = Math.hypot(dx, dz);
  const fx = span > 0.05 ? dx / span : 0;
  const fz = span > 0.05 ? dz / span : 1;
  const facing = Math.atan2(fx, fz);
  const rx = fz;
  const rz = -fx;

  const ranked = [...units].sort((a, b) => {
    const ar = (a.x - cx) * rx + (a.z - cz) * rz;
    const br = (b.x - cx) * rx + (b.z - cz) * rz;
    if (Math.abs(ar - br) > 0.01) return ar - br;
    const af = (a.x - cx) * fx + (a.z - cz) * fz;
    const bf = (b.x - cx) * fx + (b.z - cz) * fz;
    return bf - af;
  });

  const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(Math.sqrt(ranked.length * 1.2))));
  const slots = [];
  for (let i = 0; i < ranked.length; i++) {
    const col = i % cols;
    const row = (i / cols) | 0;
    const lateral = (col - (cols - 1) / 2) * FORMATION_SPACING;
    const depth = -row * FORMATION_SPACING;
    slots.push({
      unit: ranked[i],
      x: clampPos(targetX + lateral * rx + depth * fx),
      z: clampPos(targetZ + lateral * rz + depth * fz),
      facing,
    });
  }
  return slots;
}
