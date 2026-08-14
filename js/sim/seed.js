/** Parse seeds from setup fields, URLs, and harness CLI. */

export const DEFAULT_SEED = 0x4d455249;

export function parseSeed(value) {
  if (value == null || value === "") return DEFAULT_SEED;
  if (typeof value === "number" && Number.isFinite(value)) return value >>> 0;
  const s = String(value).trim();
  if (!s) return DEFAULT_SEED;
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16) >>> 0;
  const n = Number(s);
  if (Number.isFinite(n)) return n >>> 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function resolveSeed(opts = {}) {
  if (opts.seed != null && opts.seed !== "") return parseSeed(opts.seed);
  if (typeof location !== "undefined") {
    const fromUrl = new URLSearchParams(location.search).get("seed");
    if (fromUrl != null && fromUrl !== "") return parseSeed(fromUrl);
  }
  return DEFAULT_SEED;
}
