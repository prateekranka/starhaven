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

function qCoord(v) {
  return Math.round(Number(v) * 1024);
}

function unitSnap(u) {
  return {
    id: u.id,
    type: u.type,
    owner: u.owner,
    x: qCoord(u.x),
    z: qCoord(u.z),
    hp: u.hp | 0,
    state: u.state,
    carry: u.carry | 0,
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
    x: qCoord(b.x),
    z: qCoord(b.z),
    hp: b.hp | 0,
    built: Math.round(Number(b.built) * 1024),
    queueLen: b.queue.length,
  };
}

function resourceSnap(r) {
  return {
    id: r.id,
    kind: r.kind,
    x: qCoord(r.x),
    z: qCoord(r.z),
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
    aging: Math.round(Number(p.aging) * 1024),
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
    simulationVersion: "pixel-sim.v2-float",
    seed: world.seed >>> 0,
    t: world.simTick | 0,
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
