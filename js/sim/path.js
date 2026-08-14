/** Grid A* for the mesa. Buildings block; units do not. Integer costs. */

const STRAIGHT = 1_000;
const DIAG = 1_414;

export function idx(x, z, n) {
  return z * n + x;
}

function heuristic(x, z, gx, gz) {
  const dx = abs(x - gx);
  const dz = abs(z - gz);
  return STRAIGHT * (dx + dz) + (DIAG - 2 * STRAIGHT) * min(dx, dz);
}

function abs(v) {
  return v < 0 ? -v : v;
}

function min(a, b) {
  return a < b ? a : b;
}

export function astar(walk, n, sx, sz, gx, gz) {
  sx = clamp(sx | 0, 0, n - 1);
  sz = clamp(sz | 0, 0, n - 1);
  gx = clamp(gx | 0, 0, n - 1);
  gz = clamp(gz | 0, 0, n - 1);
  if (!walk[idx(gx, gz, n)]) {
    const ncell = nearestWalkable(walk, n, gx, gz);
    if (!ncell) return [];
    gx = ncell[0];
    gz = ncell[1];
  }
  if (!walk[idx(sx, sz, n)]) {
    const ncell = nearestWalkable(walk, n, sx, sz);
    if (!ncell) return [];
    sx = ncell[0];
    sz = ncell[1];
  }
  const open = [[sx, sz]];
  const came = new Int32Array(n * n).fill(-1);
  const gScore = new Int32Array(n * n).fill(0x7fffffff);
  const start = idx(sx, sz, n);
  gScore[start] = 0;
  const closed = new Uint8Array(n * n);
  let guard = 0;
  while (open.length && guard++ < 8000) {
    let bi = 0;
    let best = 0x7fffffff;
    for (let i = 0; i < open.length; i++) {
      const [x, z] = open[i];
      const f = gScore[idx(x, z, n)] + heuristic(x, z, gx, gz);
      if (f < best) {
        best = f;
        bi = i;
      }
    }
    const [x, z] = open.splice(bi, 1)[0];
    if (x === gx && z === gz) return reconstruct(came, n, gx, gz, sx, sz);
    const ci = idx(x, z, n);
    if (closed[ci]) continue;
    closed[ci] = 1;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        if (!walk[idx(nx, nz, n)]) continue;
        if (dx && dz && (!walk[idx(x + dx, z, n)] || !walk[idx(x, z + dz, n)])) continue;
        const ni = idx(nx, nz, n);
        const step = dx && dz ? DIAG : STRAIGHT;
        const ng = gScore[ci] + step;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = ci;
          open.push([nx, nz]);
        }
      }
    }
  }
  return [];
}

function reconstruct(came, n, gx, gz, sx, sz) {
  const path = [];
  let i = idx(gx, gz, n);
  const start = idx(sx, sz, n);
  let hops = 0;
  while (i !== start && hops++ < 4000) {
    path.push([i % n, (i / n) | 0]);
    i = came[i];
    if (i < 0) break;
  }
  path.reverse();
  return path;
}

export function nearestWalkable(walk, n, x, z) {
  for (let r = 0; r < 12; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        if (walk[idx(nx, nz, n)]) return [nx, nz];
      }
    }
  }
  return null;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
