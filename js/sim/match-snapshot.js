/** Match snapshot persistence and bridge payloads for native resume. */

import { isNativeHost } from "../bridge.js";
import { checksumWorld } from "./checksum.js";
import { ReplayRecorder, replayToWorld } from "./replay.js";
import { parseSeed } from "./seed.js";

export const MATCH_SNAPSHOT_KEY = "starhaven.match.snapshot.v1";

let recorder = null;
let matchOpts = null;

function serializableMatchOpts(opts = {}) {
  return {
    seed: opts.seed,
    playerFaction: opts.playerFaction,
    enemyFaction: opts.enemyFaction,
    difficulty: opts.difficulty,
    mapId: opts.mapId,
    tutorial: !!opts.tutorial,
    campaign: !!opts.campaign,
  };
}

export function beginMatchSnapshot(opts) {
  if (!isNativeHost()) return;
  matchOpts = serializableMatchOpts(opts);
  recorder = new ReplayRecorder(parseSeed(opts.seed));
}

export function resumeMatchSnapshot(opts, commands = []) {
  if (!isNativeHost()) return;
  matchOpts = serializableMatchOpts(opts);
  recorder = new ReplayRecorder(parseSeed(opts?.seed));
  for (const command of commands) recorder.recordCommand(command);
}

export function recordMatchCommand(command) {
  if (!recorder || !isNativeHost()) return;
  recorder.recordCommand({ ...command, tick: command.tick | 0 });
}

export function buildBridgeSnapshot(world, paused) {
  if (!isNativeHost() || !world || !recorder) return null;
  const payload = {
    tick: world.t | 0,
    checksum: checksumWorld(world),
    seed: world.seed >>> 0,
    paused: !!paused,
  };
  persistMatchSnapshot(world, paused);
  return payload;
}

export function persistMatchSnapshot(world, paused) {
  if (!isNativeHost() || !recorder || !world) return;
  localStorage.setItem(
    MATCH_SNAPSHOT_KEY,
    JSON.stringify({
      format: "starhaven-match-snapshot-v1",
      seed: world.seed >>> 0,
      tick: world.t | 0,
      checksum: checksumWorld(world),
      paused: !!paused,
      matchOpts,
      commands: recorder.data.commands,
    })
  );
}

export function loadPersistedMatchSnapshot() {
  if (!isNativeHost()) return null;
  try {
    const data = JSON.parse(localStorage.getItem(MATCH_SNAPSHOT_KEY) || "null");
    if (!data || data.format !== "starhaven-match-snapshot-v1" || !Array.isArray(data.commands)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearMatchSnapshot() {
  recorder = null;
  matchOpts = null;
  if (isNativeHost()) localStorage.removeItem(MATCH_SNAPSHOT_KEY);
}

export function restoreFromSnapshotRequest(request, extraOpts = {}) {
  if (!isNativeHost()) return null;
  const persisted = loadPersistedMatchSnapshot();
  if (!persisted) throw new Error("No persisted match snapshot");
  const seed = parseSeed(request.seed ?? persisted.seed);
  if ((persisted.seed >>> 0) !== (seed >>> 0)) throw new Error("Snapshot seed mismatch");
  const targetTick = request.tick | 0;
  const world = replayToWorld(
    { format: "starhaven-replay-v1", seed: persisted.seed, commands: persisted.commands, checksums: [] },
    targetTick,
    { ...(persisted.matchOpts || {}), ...extraOpts }
  );
  const checksum = checksumWorld(world);
  if (request.checksum && checksum !== request.checksum) {
    throw new Error(`Checksum mismatch: expected ${request.checksum}, got ${checksum}`);
  }
  return {
    world,
    matchOpts: { ...(persisted.matchOpts || {}), ...extraOpts },
    paused: request.paused ?? persisted.paused ?? false,
    tick: targetTick,
    checksum,
    commands: persisted.commands,
  };
}
