import type { ReplayData } from "./replay";

export function encodeReplay(replay: ReplayData): string {
  return `${JSON.stringify(replay)}\n`;
}

export function decodeReplay(encoded: string): ReplayData {
  const replay = JSON.parse(encoded) as ReplayData;
  if (replay.format !== "starhaven-replay-v1" || !Array.isArray(replay.commands) || !Array.isArray(replay.checksums)) throw new Error("Invalid replay format");
  return replay;
}
