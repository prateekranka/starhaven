export interface PrngSnapshot {
  algorithm: "xorshift32-v1";
  seed: number;
  state: number;
  cursor: number;
}

export class DeterministicPrng {
  readonly algorithm = "xorshift32-v1" as const;
  readonly seed: number;
  private state: number;
  private cursor: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = (this.seed || 0x9e3779b9) >>> 0;
    this.cursor = 0;
  }

  nextUint(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    this.cursor += 1;
    return this.state;
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive < minInclusive) throw new Error("Invalid PRNG range");
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + (this.nextUint() % span);
  }

  snapshot(): PrngSnapshot {
    return { algorithm: this.algorithm, seed: this.seed, state: this.state, cursor: this.cursor };
  }

  restore(snapshot: PrngSnapshot): void {
    if (snapshot.algorithm !== this.algorithm || snapshot.seed !== this.seed) throw new Error("PRNG snapshot identity mismatch");
    this.state = snapshot.state >>> 0;
    this.cursor = snapshot.cursor;
  }
}

export interface PrngStreamsSnapshot {
  event: PrngSnapshot;
  ai: PrngSnapshot;
  finalPriority: PrngSnapshot;
}

export class MatchPrng {
  readonly event: DeterministicPrng;
  readonly ai: DeterministicPrng;
  readonly finalPriority: DeterministicPrng;

  constructor(seed: number) {
    this.event = new DeterministicPrng(seed ^ 0x45564e54);
    this.ai = new DeterministicPrng(seed ^ 0x41490001);
    this.finalPriority = new DeterministicPrng(seed ^ 0x46494e4c);
  }

  snapshot(): PrngStreamsSnapshot {
    return { event: this.event.snapshot(), ai: this.ai.snapshot(), finalPriority: this.finalPriority.snapshot() };
  }

  restore(snapshot: PrngStreamsSnapshot): void {
    this.event.restore(snapshot.event);
    this.ai.restore(snapshot.ai);
    this.finalPriority.restore(snapshot.finalPriority);
  }
}
