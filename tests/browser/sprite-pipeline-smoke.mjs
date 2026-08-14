#!/usr/bin/env node
/** Headless smoke for pipeline atlases + cache manifest. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const atlasIds = ["sun-guard", "grave-guard", "sun-walk", "grave-walk", "sun-strider", "grave-strider", "sun-siege", "grave-siege"];

function sha(path) {
  return createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
}

const expected = Object.fromEntries(
  atlasIds.map((id) => {
    const json = JSON.parse(readFileSync(resolve(root, `media/sprites/${id}.atlas.json`), "utf8"));
    return [id, { frames: json.frames.length, sha256: json.sha256 }];
  })
);

const baseUrl = process.env.SMOKE_BASE || "http://127.0.0.1:8765";
const res = await fetch(`${baseUrl}/cache-manifest.json`).catch(() => null);
if (!res?.ok) {
  console.log(JSON.stringify({ ok: true, offline: true, atlasCount: atlasIds.length, expected }, null, 2));
  process.exit(0);
}

const manifest = await res.json();
const checks = {};
for (const id of atlasIds) {
  const jsonPath = `media/sprites/${id}.atlas.json`;
  const pngPath = `media/sprites/${id}.atlas.png`;
  const atlas = await (await fetch(`${baseUrl}/${jsonPath}`)).json();
  const listed = manifest.match?.includes(pngPath);
  checks[id] = {
    frames: atlas.frames.length,
    frameOk: atlas.frames.length === expected[id].frames,
    cacheListed: listed,
    shaMatch: atlas.sha256 === expected[id].sha256,
  };
}

const ok = atlasIds.every((id) => checks[id].frameOk && checks[id].cacheListed && checks[id].shaMatch);
console.log(JSON.stringify({ ok, checks }, null, 2));
process.exit(ok ? 0 : 1);
