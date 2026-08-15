#!/usr/bin/env node
/**
 * Highland Chokes AI-vs-AI shape batch for the AoE2 1v1 bar.
 *
 * A game passes only if all four are true:
 *   1. Open  — both TCs stand and both have villagers gathering
 *   2. Mid   — both produce military or age up
 *   3. Fight — both lose military units (not a 30s steamroll, not idle towns)
 *   4. Winner from play (world.winner). The sim-civ-batch stalemate resolver
 *      is never applied.
 *
 * Pairings: Cogforged vs Ashvein, Cogforged vs Stormveil, Ashvein vs Stormveil.
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMatch, updateWorld } from "../js/sim/engine.js";
import { parseSeed } from "../js/sim/seed.js";
import { TICKS_PER_SEC, ticksToSec } from "../js/sim/fixed.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAP_ID = "highland-chokes";
const PAIRS = [
  ["cogforged", "ashvein"],
  ["cogforged", "stormveil"],
  ["ashvein", "stormveil"],
];
const SEEDS = [
  0x4d455249, 0x51504944, 0x42414c31, 0x42414c32,
  0x53454544, 0xdeadbeef, 0xcafebabe, 0x12345678,
];

const dt = 1 / 60;
const maxTicks = Number(process.env.SIM_TICKS || 36000);
const difficulty = process.env.SIM_DIFFICULTY || "chieftain";
const seedLimit = Number(process.env.SIM_SEED_LIMIT || SEEDS.length);
const bothDirections = process.env.SIM_ONE_SIDE !== "1";
const outDir = process.env.SIM_SHAPE_OUT || join(root, "docs/evidence/skirmish-bar");

const MILITARY = new Set(["guard", "archer", "strider", "siege", "titan"]);
const GATHER_STATES = new Set(["gather", "gatherwalk", "return"]);

function loadMap() {
  return JSON.parse(readFileSync(join(root, `maps/${MAP_ID}.json`), "utf8"));
}

function count(world, owner, pred) {
  let n = 0;
  for (const u of world.units) {
    if (u.owner === owner && u.hp > 0 && pred(u)) n += 1;
  }
  return n;
}

function hasTc(world, owner) {
  return world.buildings.some((b) => b.owner === owner && b.type === "towncenter" && b.hp > 0);
}

function snapshot(world) {
  const side = (owner) => ({
    age: world.players[owner].age,
    tc: hasTc(world, owner),
    vills: count(world, owner, (u) => u.type === "villager"),
    gathering: count(world, owner, (u) => u.type === "villager" && GATHER_STATES.has(u.state)),
    military: count(world, owner, (u) => MILITARY.has(u.type)),
    trained: world.players[owner].stats.unitsTrained,
    lost: world.players[owner].stats.unitsLost,
    stock: { ...world.players[owner].stock },
  });
  return { t: world.t, sec: ticksToSec(world.t), player: side("player"), enemy: side("enemy"), winner: world.winner };
}

function runMatch({ playerFaction, enemyFaction, seed }) {
  const map = loadMap();
  const world = createMatch({
    seed: parseSeed(seed),
    playerFaction,
    enemyFaction,
    map,
    mapId: MAP_ID,
    difficulty,
    aiVsAi: true,
    batchSim: true,
  });

  const militaryIds = { player: new Set(), enemy: new Set() };
  const militaryDeaths = { player: 0, enemy: 0 };
  let openGather = { player: false, enemy: false };
  let midMilitary = { player: false, enemy: false };
  let midAge = { player: false, enemy: false };
  let firstMilitaryDeathSec = { player: null, enemy: null };
  let bothTcAt30 = false;
  const samples = [];

  const noteMilitary = () => {
    for (const owner of ["player", "enemy"]) {
      const live = new Set();
      for (const u of world.units) {
        if (u.owner !== owner || u.hp <= 0) continue;
        if (!MILITARY.has(u.type)) continue;
        live.add(u.id);
        militaryIds[owner].add(u.id);
      }
      for (const id of militaryIds[owner]) {
        if (live.has(id)) continue;
        militaryIds[owner].delete(id);
        militaryDeaths[owner] += 1;
        if (firstMilitaryDeathSec[owner] == null) firstMilitaryDeathSec[owner] = ticksToSec(world.t);
      }
    }
  };

  for (let i = 0; i < maxTicks && !world.winner; i += 1) {
    updateWorld(world, dt);
    noteMilitary();
    const sec = ticksToSec(world.t);
    for (const owner of ["player", "enemy"]) {
      if (count(world, owner, (u) => u.type === "villager" && GATHER_STATES.has(u.state)) > 0) {
        openGather[owner] = true;
      }
      if (count(world, owner, (u) => MILITARY.has(u.type)) > 0) {
        midMilitary[owner] = true;
      }
      if (world.players[owner].age >= 2) midAge[owner] = true;
    }
    if (sec >= 30 && sec < 30 + dt * 2) {
      bothTcAt30 = hasTc(world, "player") && hasTc(world, "enemy");
    }
    if (world.t % (5 * TICKS_PER_SEC) === 0) samples.push(snapshot(world));
  }

  if (!bothTcAt30) bothTcAt30 = hasTc(world, "player") && hasTc(world, "enemy") && ticksToSec(world.t) >= 30;

  const durationSec = ticksToSec(world.t);
  const open = bothTcAt30 && openGather.player && openGather.enemy;
  const mid = (midMilitary.player || midAge.player) && (midMilitary.enemy || midAge.enemy);
  const bothLostMilitary = militaryDeaths.player > 0 && militaryDeaths.enemy > 0;
  const steamroll = Boolean(world.winner) && durationSec < 90;
  const fight = bothLostMilitary && !steamroll;
  const winnerFromPlay = Boolean(world.winner);
  const shape = open && mid && fight && winnerFromPlay;

  return {
    playerFaction,
    enemyFaction,
    seed: parseSeed(seed) >>> 0,
    durationSec: Number(durationSec.toFixed(2)),
    ticks: world.t,
    winner: world.winner,
    winnerFromPlay,
    open,
    mid,
    fight,
    shape,
    reasons: {
      bothTcAt30,
      gather: openGather,
      producedMilitary: midMilitary,
      agedUp: midAge,
      militaryDeaths,
      firstMilitaryDeathSec,
      steamroll,
    },
    final: snapshot(world),
    samples,
  };
}

const activeSeeds = SEEDS.slice(0, seedLimit);
const scenarios = [];
for (const [a, b] of PAIRS) {
  for (const seed of activeSeeds) {
    scenarios.push({ playerFaction: a, enemyFaction: b, seed });
    if (bothDirections) scenarios.push({ playerFaction: b, enemyFaction: a, seed });
  }
}

const started = Date.now();
const results = scenarios.map((s, i) => {
  const r = runMatch(s);
  if (process.stdout.isTTY) {
    const mark = r.shape ? "PASS" : "FAIL";
    process.stderr.write(`[${i + 1}/${scenarios.length}] ${mark} ${r.playerFaction} vs ${r.enemyFaction} seed=${r.seed.toString(16)} t=${r.durationSec}s winner=${r.winner || "none"}\n`);
  }
  return r;
});

const passed = results.filter((r) => r.shape).length;
const rate = results.length ? passed / results.length : 0;
const byPair = {};
for (const r of results) {
  const key = [r.playerFaction, r.enemyFaction].sort().join(" vs ");
  if (!byPair[key]) byPair[key] = { samples: 0, passed: 0, open: 0, mid: 0, fight: 0, winnerFromPlay: 0 };
  const row = byPair[key];
  row.samples += 1;
  if (r.shape) row.passed += 1;
  if (r.open) row.open += 1;
  if (r.mid) row.mid += 1;
  if (r.fight) row.fight += 1;
  if (r.winnerFromPlay) row.winnerFromPlay += 1;
}

const report = {
  schema: 1,
  bar: "aoe2-1v1-shape",
  mapId: MAP_ID,
  difficulty,
  maxTicks,
  maxSec: ticksToSec(maxTicks),
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  games: results.length,
  passed,
  rate,
  passBar: 0.9,
  meetsRate: rate >= 0.9,
  byPair,
  results: results.map(({ samples, ...rest }) => rest),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "shape-batch.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDir, "shape-batch.summary.json"), `${JSON.stringify({
  games: report.games,
  passed: report.passed,
  rate: report.rate,
  meetsRate: report.meetsRate,
  byPair: report.byPair,
  elapsedMs: report.elapsedMs,
}, null, 2)}\n`);

console.log(JSON.stringify({
  games: report.games,
  passed: report.passed,
  rate: Number(rate.toFixed(4)),
  meetsRate: report.meetsRate,
  byPair,
  out: join(outDir, "shape-batch.json"),
}, null, 2));

process.exitCode = report.meetsRate ? 0 : 2;
