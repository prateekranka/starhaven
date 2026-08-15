/** Replay codec, recorder, and deterministic replay runner. */

import { createMatch, updateWorld, commandGround, queueUnit, tryAgeUp, tryPlace } from "./engine.js";
import { checksumSnapshot, checksumWorld, snapshotWorld } from "./checksum.js";

export { checksumSnapshot };

const DT = 1 / 60;
export const REPLAY_FORMAT = "starhaven-replay-v2";

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validOwner(value) {
  return value == null || value === "player" || value === "enemy";
}

function assertReplayCommand(command) {
  if (
    !isPlainRecord(command) ||
    !Number.isInteger(command.tick) ||
    command.tick < 0 ||
    ["move", "train", "place", "ageUp"].indexOf(command.type) < 0
  ) {
    throw new Error("incompatible-version");
  }
  if (command.type === "move") {
    if (
      !Array.isArray(command.unitIds) ||
      command.unitIds.some((id) => !Number.isInteger(id) || id < 0) ||
      !Number.isFinite(command.x) ||
      !Number.isFinite(command.z) ||
      (command.attackMove != null && typeof command.attackMove !== "boolean")
    ) throw new Error("incompatible-version");
  } else if (command.type === "train") {
    if (!Number.isInteger(command.buildingId) || command.buildingId < 0 || typeof command.unitType !== "string" || !command.unitType) {
      throw new Error("incompatible-version");
    }
  } else if (command.type === "place") {
    if (typeof command.buildingType !== "string" || !command.buildingType || !Number.isFinite(command.x) || !Number.isFinite(command.z) || !validOwner(command.owner)) {
      throw new Error("incompatible-version");
    }
  } else if (!validOwner(command.owner)) {
    throw new Error("incompatible-version");
  }
}

function assertReplayChecksums(checksums) {
  for (const entry of checksums) {
    if (!isPlainRecord(entry) || !Number.isInteger(entry.tick) || entry.tick < 0 || typeof entry.checksum !== "string" || !entry.checksum) {
      throw new Error("incompatible-version");
    }
  }
}

/** Validate a replay record before any simulation state is allocated. */
export function assertReplayCompatible(replay) {
  if (
    !replay ||
    replay.format !== REPLAY_FORMAT ||
    !Number.isInteger(replay.seed) ||
    replay.seed < 0 ||
    replay.seed > 0xffffffff ||
    !Array.isArray(replay.commands) ||
    !Array.isArray(replay.checksums)
  ) {
    throw new Error("incompatible-version");
  }
  for (const command of replay.commands) {
    assertReplayCommand(command);
  }
  assertReplayChecksums(replay.checksums);
  return replay;
}

export function encodeReplay(replay) {
  assertReplayCompatible(replay);
  return `${JSON.stringify(replay)}\n`;
}

export function decodeReplay(encoded) {
  let replay;
  try {
    replay = JSON.parse(encoded);
  } catch {
    throw new Error("incompatible-version");
  }
  return assertReplayCompatible(replay);
}

export class ReplayRecorder {
  constructor(seed) {
    this.data = { format: REPLAY_FORMAT, seed: seed >>> 0, commands: [], checksums: [] };
  }

  recordCommand(command) {
    assertReplayCommand(command);
    this.data.commands.push({ ...command });
  }

  recordWorld(world) {
    const snapshot = snapshotWorld(world);
    this.data.checksums.push({ tick: snapshot.t, checksum: checksumSnapshot(snapshot) });
  }

  toJSON() {
    return JSON.stringify(this.data);
  }
}

function applyReplayCommand(world, command) {
  switch (command.type) {
    case "move":
      if (Array.isArray(command.unitIds)) world.selection = command.unitIds.slice();
      commandGround(world, command.x, command.z, !!command.attackMove);
      break;
    case "train":
      if (command.buildingId != null && command.unitType) {
        const b = world.buildings.find((x) => x.id === command.buildingId);
        if (b) queueUnit(world, b, command.unitType);
      }
      break;
    case "place":
      if (command.buildingType) {
        tryPlace(world, command.owner || "player", command.buildingType, command.x, command.z);
      }
      break;
    case "ageUp":
      tryAgeUp(world, command.owner || "player");
      break;
    default:
      break;
  }
}

/** Replay a recorded match and return periodic checksums (deterministic proof). */
export function replayToChecksums(replay, maxTicks, interval = 60) {
  assertReplayCompatible(replay);
  if (!Number.isInteger(maxTicks) || maxTicks < 0 || !Number.isInteger(interval) || interval <= 0) throw new Error("incompatible-version");
  const world = createMatch({ seed: replay.seed });
  const checksums = [];
  let cmdIdx = 0;
  for (let tick = 0; tick < maxTicks; tick += 1) {
    while (cmdIdx < replay.commands.length && replay.commands[cmdIdx].tick === tick) {
      applyReplayCommand(world, replay.commands[cmdIdx]);
      cmdIdx += 1;
    }
    updateWorld(world, DT);
    if ((tick + 1) % interval === 0 || tick + 1 === maxTicks) {
      checksums.push({ tick: world.t, checksum: checksumWorld(world) });
    }
  }
  return checksums;
}

/** Replay commands up to targetTick and return the restored world. */
export function replayToWorld(replay, targetTick, matchOpts = {}) {
  assertReplayCompatible(replay);
  if (!Number.isInteger(targetTick) || targetTick < 0) throw new Error("incompatible-version");
  const world = createMatch({ ...matchOpts, seed: replay.seed });
  let cmdIdx = 0;
  for (let tick = 0; tick < targetTick; tick += 1) {
    while (cmdIdx < replay.commands.length && replay.commands[cmdIdx].tick === tick) {
      applyReplayCommand(world, replay.commands[cmdIdx]);
      cmdIdx += 1;
    }
    updateWorld(world, DT);
  }
  return world;
}

/** Record a harness match with periodic checksum snapshots. */
export function recordHarnessMatch(opts = {}) {
  const seed = opts.seed ?? 0x4d455249;
  const ticks = opts.ticks ?? 240;
  const interval = opts.interval ?? 60;
  const recorder = new ReplayRecorder(seed);
  const world = createMatch({ seed, playerFaction: "sunwoven", difficulty: "chieftain" });
  for (let i = 0; i < ticks; i += 1) {
    updateWorld(world, DT);
    if ((i + 1) % interval === 0 || i + 1 === ticks) recorder.recordWorld(world);
  }
  return { recorder, world, finalChecksum: checksumWorld(world) };
}
