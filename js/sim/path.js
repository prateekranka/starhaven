/** Grid A* for the mesa. Buildings block; units do not. Integer costs + binary heap open set. */

const STRAIGHT = 1_000;
const DIAG = 1_414;
const MAX_GRID = 96;

const heap = new Int32Array(MAX_GRID * MAX_GRID);
const fScore = new Int32Array(MAX_GRID * MAX_GRID);
let heapLen = 0;

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

function max(a, b) {
  return a > b ? a : b;
}

function heapPush(cell) {
  let i = heapLen++;
  heap[i] = cell;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (fScore[heap[parent]] <= fScore[cell]) break;
    heap[i] = heap[parent];
    i = parent;
  }
  heap[i] = cell;
}

function heapPop() {
  const top = heap[0];
  const cell = heap[--heapLen];
  if (heapLen === 0) return top;
  let i = 0;
  while (true) {
    let best = i;
    const left = i * 2 + 1;
    const right = left + 1;
    if (left < heapLen && fScore[heap[left]] < fScore[heap[best]]) best = left;
    if (right < heapLen && fScore[heap[right]] < fScore[heap[best]]) best = right;
    if (best === i) break;
    const tmp = heap[i];
    heap[i] = heap[best];
    heap[best] = tmp;
    i = best;
  }
  heap[i] = cell;
  return top;
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

  const cells = n * n;
  const came = new Int32Array(cells).fill(-1);
  const gScore = new Int32Array(cells).fill(0x7fffffff);
  const closed = new Uint8Array(cells);
  const start = idx(sx, sz, n);
  gScore[start] = 0;
  heapLen = 0;
  fScore[start] = heuristic(sx, sz, gx, gz);
  heapPush(start);

  const maxIter = cells * 2;
  let guard = 0;
  while (heapLen && guard++ < maxIter) {
    const ci = heapPop();
    const x = ci % n;
    const z = (ci / n) | 0;
    if (x === gx && z === gz) return reconstruct(came, n, gx, gz, sx, sz, cells);
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
          fScore[ni] = ng + heuristic(nx, nz, gx, gz);
          heapPush(ni);
        }
      }
    }
  }
  return [];
}

function reconstruct(came, n, gx, gz, sx, sz, maxCells) {
  const path = [];
  let i = idx(gx, gz, n);
  const start = idx(sx, sz, n);
  let hops = 0;
  while (i !== start && hops++ < maxCells) {
    path.push([i % n, (i / n) | 0]);
    i = came[i];
    if (i < 0) break;
  }
  path.reverse();
  return path;
}

export function nearestWalkable(walk, n, x, z) {
  const maxR = min(24, max(12, (n / 4) | 0));
  for (let r = 0; r < maxR; r++) {
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
