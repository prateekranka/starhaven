#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent

# --- engine.js ---
p = ROOT / "js/sim/engine.js"
s = p.read_text()
assert "stormveil" not in s.lower() and "ashvein" not in s.lower()
# [same patches as before - abbreviated in script file already written earlier]
replacements = [
('import "../data/civs.js";\nimport { astar }',
 'import "../data/civs.js";\nimport {\n  civMechanics,\n  resolveAgeCost,\n  resolveBuildingCost,\n  resolveUnitCost,\n} from "./civs/index.js";\nimport { astar }'),
('function pay(stock, cost) {\n  for (const [k, v] of Object.entries(cost || {})) stock[k] -= v;\n}',
 'function pay(stock, cost) {\n  for (const [k, v] of Object.entries(cost || {})) stock[k] -= v;\n}\n\nexport function canPayStock(stock, cost) {\n  return canPay(stock, cost);\n}\n\nexport function payStock(stock, cost) {\n  pay(stock, cost);\n}\n\nfunction effectiveBuff(world, unit) {\n  const mech = civMechanics(unit.faction);\n  if (mech.brightLineImmune) return { speed: 1000, dmg: 1000, armor: 1000 };\n  return civBuff(unit.faction, inLight(world, unit.xQ10));\n}'),
('const enemyFaction = opponentCivId(playerFaction);', 'const enemyFaction = opts.enemyFaction || opponentCivId(playerFaction);'),
('tip: tutorial ? "Select your weavers, then tap the glowing fruit." : "Scout early. Food first, then timber, then a barracks.",',
 'tip: tutorial\n      ? "Select your weavers, then tap the glowing fruit."\n      : playerFaction === "cogforged"\n        ? "Link buildings to your Foundry Core. Assemble units on-site — no food economy."\n        : "Scout early. Food first, then timber, then a barracks.",'),
('    events: [],\n    _tickAcc: 0,', '    events: [],\n    assemblies: [],\n    _tickAcc: 0,'),
('  return {\n    id: idKey,\n    faction,', '  const player = {\n    id: idKey,\n    faction,'),
('    attackWaveAtTick: secToTicks(90),\n  };\n}', '    attackWaveAtTick: secToTicks(90),\n  };\n  civMechanics(faction).adjustStartingStock(player.stock);\n  return player;\n}'),
('    wonderTicks: 0,\n  };', '    wonderTicks: 0,\n    powered: type === "towncenter",\n  };'),
('    build: null,\n    attackCdTicks: 0,', '    build: null,\n    assemble: null,\n    attackCdTicks: 0,'),
]
for a,b in replacements: s = s.replace(a,b)
insert = '''function tickCivMechanics(world) {
  for (const owner of ["player", "enemy"]) {
    const mech = civMechanics(world.players[owner].faction);
    if (mech.usesPowerGrid) mech.tick(world, owner);
    mech.tickAssemblies(world);
  }
}

function finishAssemblies(world) {
  if (!world.assemblies?.length) return;
  const keep = [];
  for (const site of world.assemblies) {
    if (site.buildTicks < site.buildTotalTicks) {
      keep.push(site);
      continue;
    }
    const b = world.buildings.find((x) => x.id === site.buildingId);
    const u = spawnUnit(world, site.owner, site.type, site.xQ10, site.zQ10);
    if (b) issueMove(world, u, b.rally.xQ10, b.rally.zQ10);
    for (const worker of world.units) {
      if (worker.assemble === site.id) {
        worker.assemble = null;
        worker.state = "idle";
      }
    }
  }
  world.assemblies = keep;
}

'''
s = s.replace('function tickAging(world) {', insert + 'function tickAging(world) {')
s = s.replace('  tickAging(world);\n  tickBuildings(world);', '  tickAging(world);\n  tickCivMechanics(world);\n  tickBuildings(world);')
s = s.replace('  tickWonders(world);\n  separate(world);', '  tickWonders(world);\n  finishAssemblies(world);\n  separate(world);')
s = s.replace('function popOf(world, owner) {\n  let used = 0;\n  let cap = 0;\n  for (const u of world.units) if (u.owner === owner) used += UNITS[u.type].pop || 0;',
              'function popOf(world, owner) {\n  let used = 0;\n  let cap = 0;\n  const faction = world.players[owner].faction;\n  for (const u of world.units) if (u.owner === owner) used += UNITS[u.type].pop || 0;')
s = s.replace('  for (const b of world.buildings) {\n    if (b.owner !== owner) continue;\n    for (const q of b.queue) used += UNITS[q.type]?.pop || 0;\n  }\n  cap = Math.min(50, cap);',
              '  for (const b of world.buildings) {\n    if (b.owner !== owner) continue;\n    for (const q of b.queue) used += UNITS[q.type]?.pop || 0;\n  }\n  used += civMechanics(faction).assemblyPop(world, owner);\n  cap = Math.min(50, cap);')
s = s.replace('  return { used, cap };\n}\n\nexport function updateWorld', '  return { used, cap };\n}\n\nexport function popHeadroom(world, owner) {\n  const pop = popOf(world, owner);\n  return pop.cap - pop.used;\n}\n\nexport function updateWorld')
s = s.replace('function tickBuildings(world) {\n  for (const b of world.buildings) {\n    if (!isBuilt(b)) continue;\n    const spec = BUILDINGS[b.type];',
              'function tickBuildings(world) {\n  for (const b of world.buildings) {\n    if (!isBuilt(b)) continue;\n    if (!civMechanics(b.faction).isBuildingActive(world, b)) continue;\n    const spec = BUILDINGS[b.type];')
s = s.replace('    const spec = UNITS[u.type];\n    const buff = civBuff(u.faction, inLight(world, u.xQ10));\n    if (u.attackCdTicks > 0) u.attackCdTicks -= 1;\n    if (u.state === "walk" || u.state === "return" || u.state === "gatherwalk" || u.state === "buildwalk" || u.state === "attackmove") {\n      followPath(world, u, spec.speed, buff.speed);\n    }\n    if (u.state === "gather") gatherTick(world, u, spec);\n    if (u.state === "build") buildTick(world, u);',
              '    const spec = UNITS[u.type];\n    const buff = effectiveBuff(world, u);\n    civMechanics(u.faction).tickUnit(world, u);\n    if (u.attackCdTicks > 0) u.attackCdTicks -= 1;\n    if (u.state === "walk" || u.state === "return" || u.state === "gatherwalk" || u.state === "buildwalk" || u.state === "attackmove" || u.state === "assemblewalk") {\n      followPath(world, u, spec.speed, buff.speed);\n    }\n    if (u.state === "gather") gatherTick(world, u, spec);\n    if (u.state === "build") buildTick(world, u);\n    if (u.state === "assemble" || u.state === "assemblewalk") assembleWalkTick(world, u);')
s = s.replace('  const buff = t.kind === "unit" ? civBuff(t.faction, inLight(world, t.xQ10)) : { armor: 1000 };',
              '  const buff = t.kind === "unit" ? effectiveBuff(world, t) : { armor: 1000 };')
s = s.replace('    else if (u.state === "buildwalk") u.state = "build";\n    else if (u.state === "attackmove") u.state = "attack";',
              '    else if (u.state === "buildwalk") u.state = "build";\n    else if (u.state === "assemblewalk") u.state = "assemble";\n    else if (u.state === "attackmove") u.state = "attack";')
assemble_fn = '''function assembleWalkTick(world, u) {
  const site = world.assemblies?.find((s) => s.id === u.assemble);
  if (!site) {
    u.state = "idle";
    u.assemble = null;
    return;
  }
  if (distanceSquaredQ10(u, site) <= q10RangeSq(2.4)) {
    u.state = "assemble";
    u.path = [];
    return;
  }
  if (u.repathTicks > 0) u.repathTicks -= 1;
  if (u.repathTicks <= 0) {
    setPath(world, u, site.xQ10, site.zQ10);
    u.repathTicks = REPATH_BUILD_TICKS;
  }
}

'''
s = s.replace('function buildTick(world, u) {', assemble_fn + 'function buildTick(world, u) {')
s = s.replace('export function issueGather(world, u, res) {\n  if (u.type !== "villager") return;\n  u.resource = res.id;\n  u.build = null;\n  u.state = "gatherwalk";',
              'export function issueGather(world, u, res) {\n  if (u.type !== "villager") return;\n  const kind = civMechanics(u.faction).filterGatherKind(u.owner, res.kind);\n  if (!kind) return;\n  u.resource = res.id;\n  u.build = null;\n  u.assemble = null;\n  u.state = "gatherwalk";')
s = s.replace('export function issueBuild(world, u, building) {\n  if (u.type !== "villager") return;\n  u.build = building.id;\n  u.resource = null;\n  u.state = "buildwalk";\n  setPath(world, u, building.xQ10, building.zQ10);\n}',
              'export function issueBuild(world, u, building) {\n  if (u.type !== "villager") return;\n  u.build = building.id;\n  u.resource = null;\n  u.assemble = null;\n  u.state = "buildwalk";\n  setPath(world, u, building.xQ10, building.zQ10);\n}\n\nexport function issueAssemble(world, u, site) {\n  if (u.type !== "villager") return;\n  u.assemble = site.id;\n  u.build = null;\n  u.resource = null;\n  u.state = "assemblewalk";\n  setPath(world, u, site.xQ10, site.zQ10);\n}')
s = s.replace('  if (!canPay(p.stock, spec.cost)) return { ok: false, why: "Not enough resources." };', '  const cost = resolveBuildingCost(p.faction, type, spec.cost);\n  if (!canPay(p.stock, cost)) return { ok: false, why: "Not enough resources." };', 1)
s = s.replace('  pay(p.stock, spec.cost);', '  pay(p.stock, cost);', 1)
old_qu = '''export function queueUnit(world, building, type) {
  const spec = UNITS[type];
  if (!spec || spec.from !== building.type) return { ok: false, why: "Wrong building." };
  const p = world.players[building.owner];
  if (p.age < spec.age) return { ok: false, why: "Need a later age." };
  const pop = popOf(world, building.owner);
  if (pop.used + spec.pop > pop.cap) return { ok: false, why: "Build more houses." };
  if (!canPay(p.stock, spec.cost)) return { ok: false, why: "Not enough resources." };
  pay(p.stock, spec.cost);
  building.queue.push({ type, leftTicks: secToTicks(spec.time) });
  return { ok: true };
}'''
new_qu = '''export function queueUnit(world, building, type) {
  const mech = civMechanics(world.players[building.owner].faction);
  if (!mech.usesTrainingQueue) return queueAssembly(world, building, type);
  const spec = UNITS[type];
  if (!spec || spec.from !== building.type) return { ok: false, why: "Wrong building." };
  const p = world.players[building.owner];
  if (p.age < spec.age) return { ok: false, why: "Need a later age." };
  if (!mech.isBuildingActive(world, building)) return { ok: false, why: "Building unpowered." };
  const pop = popOf(world, building.owner);
  if (pop.used + spec.pop > pop.cap) return { ok: false, why: "Build more houses." };
  const cost = resolveUnitCost(p.faction, type, spec.cost);
  if (!canPay(p.stock, cost)) return { ok: false, why: "Not enough resources." };
  pay(p.stock, cost);
  building.queue.push({ type, leftTicks: secToTicks(spec.time) });
  return { ok: true };
}

export function queueAssembly(world, building, type) {
  const spec = UNITS[type];
  if (!spec || spec.from !== building.type) return { ok: false, why: "Wrong building." };
  const p = world.players[building.owner];
  const mech = civMechanics(p.faction);
  if (!mech.isBuildingActive(world, building)) return { ok: false, why: "Building unpowered." };
  if (p.age < spec.age) return { ok: false, why: "Need a later age." };
  const pop = popOf(world, building.owner);
  if (pop.used + spec.pop > pop.cap) return { ok: false, why: "Build more houses." };
  const cost = resolveUnitCost(p.faction, type, spec.cost);
  if (!canPay(p.stock, cost)) return { ok: false, why: "Not enough resources." };
  pay(p.stock, cost);
  const site = {
    id: id(),
    owner: building.owner,
    type,
    buildingId: building.id,
    xQ10: building.rally.xQ10,
    zQ10: building.rally.zQ10,
    buildTicks: 0,
    buildTotalTicks: secToTicks(spec.time),
  };
  world.assemblies.push(site);
  const idle = world.units.filter((u) => u.owner === building.owner && u.type === "villager" && u.state === "idle");
  for (const v of idle.slice(0, 2)) issueAssemble(world, v, site);
  return { ok: true, site };
}'''
s = s.replace(old_qu, new_qu)
s = s.replace('  const next = AGES[p.age];\n  const cost = { food: next.food, crystal: next.crystal, ore: next.ore };',
              '  const next = AGES[p.age];\n  const cost = resolveAgeCost(p.faction, next, { food: next.food, crystal: next.crystal, ore: next.ore });')
s = s.replace('export function villagerBuildOptions(world) {\n  const age = world.players.player.age;\n  return VILLAGER_BUILD_LIST.filter((t) => BUILDINGS[t].age <= age);\n}',
              'export function villagerBuildOptions(world) {\n  const age = world.players.player.age;\n  const base = VILLAGER_BUILD_LIST.filter((t) => BUILDINGS[t].age <= age);\n  return civMechanics(world.players.player.faction).villagerBuildList(base);\n}')
assert "stormveil" not in s.lower() and "ashvein" not in s.lower()
p.write_text(s)

# civ-schema
cs = ROOT / "js/data/civ-schema.js"
text = cs.read_text()
if "civUsesFood" not in text:
    text += '''
export function civUsesFood(civId) {
  const civ = getCiv(civId);
  if (civ?.economy?.usesFood === false) return false;
  return true;
}
'''
    cs.write_text(text)

# civs.js
cv = ROOT / "js/data/civs.js"
c = cv.read_text()
if "COGFORGED" not in c:
    c = c.replace('import { registerCiv } from "./civ-schema.js";',
                  'import { registerCiv } from "./civ-schema.js";\nimport { COGFORGED_AI } from "../sim/civs/cogforged.js";\nimport "../sim/civs/cogforged.js";')
    c = c.replace('const GRAVEMARK_BUILDINGS = {',
                  'const COGFORGED_BUILDINGS = {\n  towncenter: "media/sprites/bldg-grave-tc.png",\n  house: "media/sprites/bldg-grave-house.png",\n  barracks: "media/sprites/bldg-grave-rax.png",\n  mill: "media/sprites/bldg-grave-mill.png",\n  lumber: "media/sprites/bldg-grave-mill.png",\n  mine: "media/sprites/bldg-grave-mill.png",\n  spire: "media/sprites/bldg-grave-rax.png",\n  den: "media/sprites/bldg-grave-rax.png",\n  workshop: "media/sprites/bldg-grave-rax.png",\n  wonder: "media/sprites/bldg-grave-wonder.png",\n};\n\nconst GRAVEMARK_BUILDINGS = {')
    block = open(ROOT / "js/data/cogforged-snippet.js").read() if (ROOT / "js/data/cogforged-snippet.js").exists() else ""
    if not block:
        block = open(__file__).read().split("COGFORGED_SNIPPET = '''",1)[1].split("'''",1)[0]
    c = c.replace('/** QA-only stub civ', block + '/** QA-only stub civ')
    c = c.replace('registerCiv(GRAVEMARK);\nregisterCiv(QA_STUB);', 'registerCiv(GRAVEMARK);\nregisterCiv(COGFORGED);\nregisterCiv(QA_STUB);')
    cv.write_text(c)

print("patched all")

COGFORGED_SNIPPET = '''
export const COGFORGED = {
  id: "cogforged",
  identity: {
    name: "Cogforged Assembly",
    tagline: "Grid power, on-site assembly, no harvest rations",
    portrait: "media/sprites/portrait-gravemark.png",
    banner: "media/textures/gravemark-banner.jpg",
    lore: {
      blurb:
        "Brass automatons who weld legions in the field and feed cities through copper relay grids. They ignore the Bright Line entirely — neither boosted nor blunted — and never ration lumenfruit.",
      ages: [
        "Age I — Assembler, Surveyor, Plate Guard, Gear Strider",
        "Age II — Relay rigs, Cogrunners, Assembly Phalanx",
        "Age III — Siege Calibrator, Foundry Engine wonder",
      ],
    },
  },
  economy: { usesFood: false },
  roster: {
    units: Object.keys(UNITS),
    buildings: Object.keys(BUILDINGS).filter((t) => t !== "mill"),
    villagerBuild: VILLAGER_BUILD_LIST.filter((t) => t !== "mill"),
  },
  statOverrides: {},
  techs: sharedTechs(),
  buffs: {
    brightLineImmune: true,
    inLight: { speed: 1000, dmg: 1000, armor: 1000 },
    inDark: { speed: 1000, dmg: 1000, armor: 1000 },
  },
  names: {
    units: {
      villager: "Assembler",
      scout: "Surveyor",
      guard: "Plate Guard",
      archer: "Rivet Bow",
      strider: "Gear Strider",
      siege: "Calibrator",
      titan: "Mesa Titan",
    },
    buildings: {
      towncenter: "Foundry Core",
      house: "Capacitor Hut",
      mill: "Flux Mill",
      lumber: "Timber Relay",
      mine: "Ore Relay",
      barracks: "Assembly Hall",
      spire: "Optic Spire",
      den: "Strider Bay",
      workshop: "Siege Foundry",
      wonder: "Foundry Engine",
    },
  },
  sprites: {
    walkSheet: "media/sprites/sheet-gravemark-walk.png",
    guardSheet: "media/sprites/sheet-grave-guard.png",
    strider: "media/sprites/unit-grave-strider.png",
    siege: "media/sprites/unit-grave-siege.png",
    portrait: "media/sprites/portrait-gravemark.png",
    buildings: COGFORGED_BUILDINGS,
    units: {
      default: walkUnit(4.05, false),
      villager: walkUnit(4.05, false),
      scout: walkUnit(4.05, false),
      guard: guardUnit(),
      archer: guardUnit(),
      strider: stillUnit("strider", 5.0),
      siege: stillUnit("siege", 5.2),
      titan: stillUnit("strider", 7.0),
    },
  },
  ai: COGFORGED_AI,
};

'''
