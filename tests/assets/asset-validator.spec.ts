import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

describe("runtime art contract", () => {
  it("keeps source count, atlas dimensions, pivots, and public bytes aligned", async () => {
    const provenance = JSON.parse(readFileSync(resolve(root, "assets/provenance/assets.json"), "utf8")) as { sourceCount: number; sources: Array<{ pivot?: { x: number; y: number } }> };
    const manifest = JSON.parse(readFileSync(resolve(root, "assets/runtime/runtime-manifest.json"), "utf8")) as { sourceCount: number; atlases: Array<{ id: string; width: number; height: number; frames: Array<{ pivot: { x: number; y: number } }> }> };
    expect(provenance.sourceCount).toBe(330);
    expect(provenance.sources).toHaveLength(330);
    expect(manifest.sourceCount).toBe(330);
    expect(manifest.atlases).toHaveLength(6);
    expect(provenance.sources.filter((source) => source.pivot).every((source) => source.pivot?.x === 64 && source.pivot.y === 112)).toBe(true);
    for (const atlas of manifest.atlases) {
      expect(atlas.width).toBe(2048);
      expect([1280, 1536]).toContain(atlas.height);
      expect(atlas.frames.every((frame) => frame.pivot.x === 64 && frame.pivot.y === 112)).toBe(true);
      const metadata = await sharp(resolve(root, "assets/runtime/sprites", `${atlas.id}.atlas.png`)).metadata();
      expect(metadata.width).toBe(atlas.width);
      expect(metadata.height).toBe(atlas.height);
      expect(readFileSync(resolve(root, "assets/runtime/sprites", `${atlas.id}.atlas.png`)).equals(readFileSync(resolve(root, "public/game-assets/sprites", `${atlas.id}.atlas.png`)))).toBe(true);
    }
  });
});
