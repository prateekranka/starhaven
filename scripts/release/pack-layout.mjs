/*
 * Single source of truth for the pixel-mesa pack layout (dev branch).
 * Shared by pack-manifests.mjs (writes dist-hashes.json) and
 * check-pack-budget.mjs (policing the GameCache download budget).
 */
import { readdirSync } from "node:fs";
import { join, sep } from "node:path";

export const PACK_ROOT_FILES = ["404.html", "cache-manifest.json", "index.html", "sw.js"];
export const PACK_DIRS = ["css", "js", "maps", "media", "vendor"];

/** Strict walk of the pack payload: posix-relative paths, sorted, throws on symlink/unsupported entries. */
export function listPackFiles(repoRoot) {
  const paths = [...PACK_ROOT_FILES];
  const walk = (dir) => {
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`pack contains a symbolic link: ${rel}`);
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile()) paths.push(rel.split(sep).join("/"));
      else throw new Error(`pack contains an unsupported entry: ${rel}`);
    }
  };
  for (const dir of PACK_DIRS) walk(dir);
  return paths.sort((a, b) => a.localeCompare(b));
}

export function isPackPath(path) {
  return PACK_ROOT_FILES.includes(path) || PACK_DIRS.some((dir) => path.startsWith(`${dir}/`));
}
