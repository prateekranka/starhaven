/** Stable world snapshots and FNV-1a checksums for harness/replay. */

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
    xQ10: u.xQ10,
    zQ10: u.zQ10,
    hp: u.hp | 0,
    state: u.state,
    carry: u.carry | 0,
    carryKind: u.carryKind || null,
    facingOctant: u.facingOctant ?? 0,
  };
}

function buildingSnap(b) {
  return {
    id: b.id,
    type: b.type,
    owner: b.owner,
    cx: b.cx,
    cz: b.cz,
    xQ10: b.xQ10,
    zQ10: b.zQ10,
    hp: b.hp | 0,
    buildTicks: b.buildTicks | 0,
    buildTotalTicks: b.buildTotalTicks | 0,
    queueLen: b.queue.length,
  };
}

function resourceSnap(r) {
  return {
    id: r.id,
    kind: r.kind,
    xQ10: r.xQ10,
    zQ10: r.zQ10,
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
    agingTicks: p.agingTicks | 0,
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
    simulationVersion: "pixel-sim.v3-int",
    seed: world.seed >>> 0,
    t: world.t | 0,
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
