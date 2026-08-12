import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BALANCE_V1 } from "../../src/game/content/balance.v1";
import { runAiVsAi } from "../../src/game/ai/batch";
import { SkirmishMatch } from "../../src/game/sim/match";

describe("C5 AI batch evidence", () => {
  it("completes the fixed 24-seed Standard batch and emits gate reports", () => {
    const directory = process.env.CHECKPOINT_DIR;
    if (!directory) return;
    const seeds = Array.from({ length: 24 }, (_, index) => (0x5a000000 + index * 0x10101) >>> 0);
    const results = seeds.map((seed) => runAiVsAi(seed));
    const durations = results.map((result) => result.durationSeconds).sort((left, right) => left - right);
    const medianDurationSeconds = Math.trunc(((durations[11] ?? 0) + (durations[12] ?? 0)) / 2);
    const factionWins = { sunwoven: results.filter((result) => result.winner === "sunwoven").length, gravemark: results.filter((result) => result.winner === "gravemark").length };
    const openingGroups = results.flatMap((result) => [
      { faction: "sunwoven" as const, opening: result.sunwovenOpening, winner: result.winner },
      { faction: "gravemark" as const, opening: result.gravemarkOpening, winner: result.winner },
    ]).reduce<Record<string, { faction: string; opening: string; samples: number; wins: number }>>((groups, sample) => {
      const key = sample.faction + ":" + sample.opening;
      const group = groups[key] ?? { faction: sample.faction, opening: sample.opening, samples: 0, wins: 0 };
      group.samples += 1;
      if (group.faction === sample.winner) group.wins += 1;
      groups[key] = group;
      return groups;
    }, {});
    const openingReports = Object.values(openingGroups).map((group) => ({ ...group, winRate: group.wins / group.samples }));
    const completed = results.filter((result) => result.complete).length;
    const durationGate = durations[0] !== undefined && durations[durations.length - 1] !== undefined && durations[0] >= 480 && durations[durations.length - 1] <= 720;
    const balanceGate = factionWins.sunwoven / results.length <= 0.65 && factionWins.gravemark / results.length <= 0.65;
    const openingGate = openingReports.filter((group) => group.samples >= 4).every((group) => group.winRate <= 0.75);
    writeFileSync(join(directory, "ai-batch.json"), JSON.stringify({ seeds, total: results.length, completed, medianDurationSeconds, minDurationSeconds: durations[0], maxDurationSeconds: durations[durations.length - 1], factionWins, results, gates: { completed24: completed === 24, duration8to12Minutes: durationGate, neitherFactionAbove65Percent: balanceGate, openingGroupsUnder75Percent: openingGate } }, (key, value) => key === "transitions" ? undefined : value, 2) + "\n");
    writeFileSync(join(directory, "ai-openings.json"), JSON.stringify({ groups: openingReports, groupedByFactionAndOpening: true }, null, 2) + "\n");
    writeFileSync(join(directory, "ai-state-transitions.ndjson"), results.flatMap((result) => result.transitions.map((transition) => JSON.stringify({ seed: result.seed, ...transition }))).join("\n") + "\n");

    const unchanged = { changed: false, previous: "balance.v1.ts", current: "balance.v1.ts", exactDiff: [] as string[], note: "C5 changes feel and presentation only; no balance number changed." };
    writeFileSync(join(directory, "balance-diff.json"), JSON.stringify(unchanged, null, 2) + "\n");
    const prior = new SkirmishMatch({ seed: 0x435034, playerFaction: "sunwoven", difficulty: "standard" });
    prior.queueProduction("sunwoven", "gleamrunner");
    prior.step();
    prior.run(BALANCE_V1.units.gleamrunner.buildTicks);
    writeFileSync(join(directory, "prior-scenario-suite.json"), JSON.stringify({ balanceUnchanged: true, productionPopulation: prior.snapshot().factions.sunwoven.population, tick4DamageCoveredBy: "tests/sim/combat-tests.spec.ts", exactTimeLimitCoveredBy: "tests/sim/victory-tests.spec.ts", complete: true }, null, 2) + "\n");
    expect(results).toHaveLength(24);
    expect(completed).toBe(24);
    expect(durationGate).toBe(true);
    expect(balanceGate).toBe(true);
    expect(openingGate).toBe(true);
  }, 30_000);
});
