#!/usr/bin/env node
/** Five-civ AI-vs-AI balance batch with win-rate matrix (#31). */

import { readFileSync } from "node:fs";
import { createMatch, updateWorld } from "../js/sim/engine.js";
import { UNITS } from "../js/data/catalog.js";
import { generateSkirmishMap } from "../js/sim/procgen.js";
import { parseSeed } from "../js/sim/seed.js";

const PLAYABLE = ["sunwoven", "gravemark", "cogforged", "stormveil", "ashvein"];
const SHOWPIECE = ["bright-mesa", "crystal-basin", "ashvein-caldera"];
const SEEDS = [
  0x4d455249, 0x51504944, 0x42414c31, 0x42414c32,
  0x53454544, 0xdeadbeef, 0xcafebabe, 0x12345678,
];
const WIN_BAND = { min: 0.4, max: 0.6 };

const dt = 1 / 60;
const maxTicks = Number(process.env.SIM_TICKS || 45000);
const difficulty = process.env.SIM_DIFFICULTY || "chieftain";
const procgenSeeds = Number(process.env.SIM_PROCgen_SEEDS || 2);
const seedLimit = Number(process.env.SIM_SEED_LIMIT || SEEDS.length);

function loadMap(mapId, seed) {
  if (mapId === "procgen") return generateSkirmishMap(parseSeed(seed), 96, 2);
  const raw = readFileSync(`maps/${mapId}.json`, "utf8");
  return JSON.parse(raw);
}

function armyScore(world, owner) {
  let score = 0;
  for (const u of world.units) {
    if (u.owner !== owner || u.type === "villager") continue;
    score += UNITS[u.type]?.hp || 40;
  }
  const tc = world.buildings.find((b) => b.owner === owner && b.type === "towncenter");
  score += tc?.hp || 0;
  score += (world.players[owner].age || 1) * 120;
  const stock = world.players[owner].stock;
  score += (stock.food || 0) + (stock.wood || 0) + (stock.crystal || 0) + (stock.ore || 0);
  return score;
}

function resolveStalemate(world) {
  const ps = armyScore(world, "player");
  const es = armyScore(world, "enemy");
  if (ps !== es) return ps > es ? "player" : "enemy";
  return ((world.seed >>> 0) & 1) === 0 ? "player" : "enemy";
}

function runMatch({ playerFaction, enemyFaction, mapId, seed }) {
  const map = loadMap(mapId, seed);
  const world = createMatch({
    seed: parseSeed(seed),
    playerFaction,
    enemyFaction,
    map,
    mapId: map.id || mapId,
    difficulty,
    aiVsAi: true,
    batchSim: true,
  });
  for (let i = 0; i < maxTicks && !world.winner; i += 1) updateWorld(world, dt);
  if (!world.winner) world.winner = resolveStalemate(world);
  return {
    winner: world.winner,
    t: world.t,
    playerFaction,
    enemyFaction,
    mapId,
    seed: parseSeed(seed) >>> 0,
    playerScore: armyScore(world, "player"),
    enemyScore: armyScore(world, "enemy"),
  };
}

function summarize(results) {
  const byPair = {};
  for (const r of results) {
    const pair = [r.playerFaction, r.enemyFaction].sort().join(":");
    if (!byPair[pair]) byPair[pair] = { a: r.playerFaction < r.enemyFaction ? r.playerFaction : r.enemyFaction, b: r.playerFaction < r.enemyFaction ? r.enemyFaction : r.playerFaction, winsA: 0, samples: 0 };
    byPair[pair].samples += 1;
    const winnerFaction = r.winner === "player" ? r.playerFaction : r.enemyFaction;
    if (winnerFaction === byPair[pair].a) byPair[pair].winsA += 1;
  }
  return Object.values(byPair).map((row) => {
    const winRate = row.samples ? row.winsA / row.samples : 0;
    return {
      pair: `${row.a} vs ${row.b}`,
      leader: row.a,
      trailer: row.b,
      leaderWinRate: winRate,
      trailerWinRate: 1 - winRate,
      samples: row.samples,
      inBand: winRate >= WIN_BAND.min && winRate <= WIN_BAND.max,
    };
  });
}

const activeSeeds = SEEDS.slice(0, seedLimit);
const scenarios = [];
for (let i = 0; i < PLAYABLE.length; i += 1) {
  for (let j = i + 1; j < PLAYABLE.length; j += 1) {
    const a = PLAYABLE[i];
    const b = PLAYABLE[j];
    for (const mapId of SHOWPIECE) {
      for (const seed of activeSeeds) {
        scenarios.push({ playerFaction: a, enemyFaction: b, mapId, seed });
        scenarios.push({ playerFaction: b, enemyFaction: a, mapId, seed });
      }
    }
    for (let k = 0; k < procgenSeeds; k += 1) {
      const seed = activeSeeds[k] ^ (a.length * 0x1000) ^ (b.length * 0x10000);
      scenarios.push({ playerFaction: a, enemyFaction: b, mapId: "procgen", seed });
      scenarios.push({ playerFaction: b, enemyFaction: a, mapId: "procgen", seed: seed ^ 0x9e3779b9 });
    }
  }
}

const results = scenarios.map((s) => runMatch(s));
const matchups = summarize(results).sort((a, b) => a.pair.localeCompare(b.pair));
const allInBand = matchups.every((r) => r.inBand);
const everyCivWins = PLAYABLE.every((civ) => matchups.some((r) => (r.leader === civ && r.leaderWinRate > 0.35) || (r.trailer === civ && r.trailerWinRate > 0.35)));

let emperorStronger = null;
if (process.env.SIM_EMPEROR_CHECK === "1") {
  const std = runMatch({ playerFaction: "sunwoven", enemyFaction: "gravemark", mapId: "bright-mesa", seed: activeSeeds[0] });
  const empMap = loadMap("bright-mesa", activeSeeds[0]);
  const empWorld = createMatch({
    seed: parseSeed(activeSeeds[0]),
    playerFaction: "sunwoven",
    enemyFaction: "gravemark",
    map: empMap,
    mapId: "bright-mesa",
    difficulty: "emperor",
    aiVsAi: true,
    batchSim: true,
  });
  for (let i = 0; i < maxTicks && !empWorld.winner; i += 1) updateWorld(empWorld, dt);
  if (!empWorld.winner) empWorld.winner = resolveStalemate(empWorld);
  emperorStronger = {
    chieftainTicks: std.t,
    emperorTicks: empWorld.t,
    chieftainWinner: std.winner,
    emperorWinner: empWorld.winner,
    emperorArmyScore: armyScore(empWorld, "enemy"),
    chieftainArmyScore: std.enemyScore,
  };
}

const report = {
  engine: "sim-civ-batch",
  difficulty,
  maxTicks,
  seedList: activeSeeds.map((s) => s >>> 0),
  showpieceMaps: SHOWPIECE,
  procgenSeeds,
  total: results.length,
  completed: results.length,
  matchups,
  gates: { allMatchupsInBand: allInBand, everyCivCanWin: everyCivWins, winBand: WIN_BAND },
  emperorStronger,
  ok: allInBand && everyCivWins,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
