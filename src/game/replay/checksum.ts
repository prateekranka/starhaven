import type { MatchSnapshot } from "../sim/state";

export function checksumSnapshot(snapshot: MatchSnapshot): string {
  let hash = 0x811c9dc5;
  const source = JSON.stringify(snapshot);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
