/** Seeded xorshift32 PRNG streams with cursor snapshots. */

export class DeterministicPrng {
  constructor(seed) {
    this.algorithm = "xorshift32-v1";
    this.seed = seed >>> 0;
    this.state = (this.seed || 0x9e3779b9) >>> 0;
    this.cursor = 0;
  }

  nextUint() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    this.cursor += 1;
    return this.state;
  }

  nextInt(minInclusive, maxInclusive) {
    if (maxInclusive < minInclusive) throw new Error("Invalid PRNG range");
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + (this.nextUint() % span);
  }

  nextFloat() {
    return this.nextUint() / 4294967296;
  }

  snapshot() {
    return { algorithm: this.algorithm, seed: this.seed, state: this.state, cursor: this.cursor };
  }

  restore(snapshot) {
    if (snapshot.algorithm !== this.algorithm || snapshot.seed !== this.seed) {
      throw new Error("PRNG snapshot identity mismatch");
    }
    this.state = snapshot.state >>> 0;
    this.cursor = snapshot.cursor;
  }
}

export class MatchPrng {
  constructor(seed) {
    this.event = new DeterministicPrng(seed ^ 0x45564e54);
    this.ai = new DeterministicPrng(seed ^ 0x41490001);
    this.finalPriority = new DeterministicPrng(seed ^ 0x46494e4c);
  }

  snapshot() {
    return {
      event: this.event.snapshot(),
      ai: this.ai.snapshot(),
      finalPriority: this.finalPriority.snapshot(),
    };
  }

  restore(snapshot) {
    this.event.restore(snapshot.event);
    this.ai.restore(snapshot.ai);
    this.finalPriority.restore(snapshot.finalPriority);
  }
}
