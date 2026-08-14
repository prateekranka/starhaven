/** Stable world snapshots and FNV-1a checksums for harness/replay. */

function round4(value) {
  return Math.round(value * 10_000) / 10_000;
}

export function checksumSnapshot(snapshot) {
  let hash = 0x811c9dc5;
  const source = JSON.stringify(snapshot);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function unitSnap(u) {
  return {
    id: u.id,
    type: u.type,
    owner: u.owner,
    x: round4(u.x),
    z: round4(u.z),
    hp: round4(u.hp),
    state: u.state,
    carry: round4(u.carry || 0),
    carryKind: u.carryKind || null,
  };
}

function buildingSnap(b) {
  return {
    id: b.id,
    type: b.type,
    owner: b.owner,
    cx: b.cx,
    cz: b.cz,
    x: round4(b.x),
    z: round4(b.z),
    hp: round4(b.hp),
    built: round4(b.built),
    queueLen: b.queue.length,
  };
}

function resourceSnap(r) {
  return {
    id: r.id,
    kind: r.kind,
    x: round4(r.x),
    z: round4(r.z),
    amount: r.amount | 0,
    cx: r.cx ?? null,
    cz: r.cz ?? null,
  };
}

function playerSnap(p) {
  return {
    id: p.id,
    faction: p.faction,
    alive: p.alive,
    age: p.age,
    aging: round4(p.aging),
    stock: {
      food: p.stock.food | 0,
      wood: p.stock.wood | 0,
      crystal: p.stock.crystal | 0,
      ore: p.stock.ore | 0,
    },
    pop: p.pop | 0,
    popCap: p.popCap | 0,
  };
}

export function snapshotWorld(world) {
  return {
    simulationVersion: "pixel-sim.v1",
    seed: world.seed >>> 0,
    t: round4(world.t),
    winner: world.winner,
    titanAwake: !!world.titanAwake,
    players: {
      player: playerSnap(world.players.player),
      enemy: playerSnap(world.players.enemy),
    },
    units: world.units.map(unitSnap).sort((a, b) => a.id - b.id),
    buildings: world.buildings.map(buildingSnap).sort((a, b) => a.id - b.id),
    resources: world.resources.map(resourceSnap).sort((a, b) => a.id - b.id),
    projectiles: world.projectiles.length,
    prng: world.prng?.snapshot?.() ?? null,
  };
}

export function checksumWorld(world) {
  return checksumSnapshot(snapshotWorld(world));
}

export function mapLayoutFingerprint(world) {
  return checksumSnapshot({
    seed: world.seed >>> 0,
    resources: world.resources
      .filter((r) => r.kind !== "rockblock")
      .map((r) => ({ kind: r.kind, cx: r.cx, cz: r.cz, amount: r.amount | 0 }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.cx - b.cx || a.cz - b.cz || a.amount - b.amount),
  });
}
