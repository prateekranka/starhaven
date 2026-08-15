/** Match snapshot persistence and bridge payloads for native resume. */

import { checksumWorld } from "./checksum.js";
import { ReplayRecorder, REPLAY_FORMAT, replayToWorld, assertReplayCompatible } from "./replay.js";
import { parseSeed } from "./seed.js";

export const MATCH_SNAPSHOT_KEY = "starhaven.match.snapshot.v1";
export const MATCH_SNAPSHOT_FORMAT = "starhaven-match-snapshot-v2";

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

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function validSnapshotRecord(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (data.format !== MATCH_SNAPSHOT_FORMAT) return false;
  if (!Number.isInteger(data.seed) || data.seed < 0) return false;
  if (!Number.isInteger(data.tick) || data.tick < 0) return false;
  if (typeof data.checksum !== "string" || !data.checksum) return false;
  if (typeof data.paused !== "boolean") return false;
  if (!data.matchOpts || typeof data.matchOpts !== "object" || Array.isArray(data.matchOpts)) return false;
  if (!Array.isArray(data.commands)) return false;
  try {
    assertReplayCompatible({ format: REPLAY_FORMAT, seed: data.seed, commands: data.commands, checksums: [] });
  } catch {
    return false;
  }
  return true;
}

/** Classify the raw record without loading a map or allocating simulation state. */
export function classifyPersistedMatchSnapshot() {
  const store = storage();
  if (!store) return { status: "missing", raw: null, data: null };
  let raw;
  try {
    raw = store.getItem(MATCH_SNAPSHOT_KEY);
  } catch {
    return { status: "incompatible-version", raw: null, data: null };
  }
  if (raw == null) return { status: "missing", raw: null, data: null };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: "incompatible-version", raw, data: null };
  }
  return validSnapshotRecord(data)
    ? { status: "valid", raw, data }
    : { status: "incompatible-version", raw, data: null };
}

export function beginMatchSnapshot(opts) {
  matchOpts = serializableMatchOpts(opts);
  recorder = new ReplayRecorder(parseSeed(opts.seed));
}

export function resumeMatchSnapshot(opts, commands = []) {
  matchOpts = serializableMatchOpts(opts);
  recorder = new ReplayRecorder(parseSeed(opts?.seed));
  for (const command of commands) recorder.recordCommand(command);
}

export function recordMatchCommand(command) {
  if (!recorder) return;
  recorder.recordCommand({ ...command, tick: command.tick | 0 });
}

export function buildBridgeSnapshot(world, paused) {
  if (!world || !recorder) return null;
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
  const store = storage();
  if (!store || !recorder || !world) return;
  store.setItem(
    MATCH_SNAPSHOT_KEY,
    JSON.stringify({
      format: MATCH_SNAPSHOT_FORMAT,
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
  const result = classifyPersistedMatchSnapshot();
  return result.status === "valid" ? result.data : null;
}

export function clearMatchSnapshot() {
  recorder = null;
  matchOpts = null;
  const store = storage();
  try {
    store?.removeItem(MATCH_SNAPSHOT_KEY);
  } catch {
    // Storage can be unavailable in a private or test context.
  }
}

export function restoreFromSnapshotRequest(request, extraOpts = {}) {
  const supplied = extraOpts.persistedRecord;
  if (supplied && !validSnapshotRecord(supplied)) throw new Error("incompatible-version");
  const classification = supplied
    ? { status: "valid", data: supplied }
    : classifyPersistedMatchSnapshot();
  if (classification.status === "missing") throw new Error("No persisted match snapshot");
  if (classification.status !== "valid") throw new Error("incompatible-version");
  const persisted = classification.data;
  const seed = parseSeed(request.seed ?? persisted.seed);
  if ((persisted.seed >>> 0) !== (seed >>> 0)) throw new Error("Snapshot seed mismatch");
  const targetTick = request.tick ?? persisted.tick;
  if (!Number.isInteger(targetTick) || targetTick < 0) throw new Error("incompatible-version");
  const replayOpts = { ...(persisted.matchOpts || {}), ...extraOpts };
  delete replayOpts.persistedRecord;
  const world = replayToWorld(
    { format: REPLAY_FORMAT, seed: persisted.seed, commands: persisted.commands, checksums: [] },
    targetTick,
    replayOpts
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
