import { describe, expect, it } from "vitest";
import { DeterministicPrng, MatchPrng } from "../../src/game/sim/prng";

describe("stored deterministic PRNG state", () => {
  it("restores each stream cursor and sequence", () => {
    const streams = new MatchPrng(0x4d455249);
    streams.event.nextUint();
    streams.ai.nextInt(0, 30);
    const snapshot = streams.snapshot();
    const next = [streams.event.nextUint(), streams.ai.nextUint(), streams.finalPriority.nextUint()];
    streams.restore(snapshot);
    expect([streams.event.nextUint(), streams.ai.nextUint(), streams.finalPriority.nextUint()]).toEqual(next);
    expect(snapshot.event.cursor).toBe(1);
    expect(snapshot.ai.cursor).toBe(1);
  });

  it("does not use a global random source", () => {
    const random = new DeterministicPrng(1);
    expect([random.nextUint(), random.nextUint()]).toEqual([270369, 67634689]);
  });
});
