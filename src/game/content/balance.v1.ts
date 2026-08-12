import type { Faction, UnitKind } from "./schema";

export interface BalanceUnit {
  kind: UnitKind;
  costMilliFlux: number;
  buildTicks: number;
  population: number;
  maxHealth: number;
  damage: number;
  cadenceTicks: number;
  rangeQ10: number;
  speedQ10PerTick: number;
  splashRadiusQ10?: number;
  slowPercent?: number;
  slowTicks?: number;
}

export interface BalanceStructure {
  kind: "latticeField" | "extractionBulwark";
  costMilliFlux: number;
  buildTicks: number;
  maxHealth: number;
  lifeTicks?: number;
  maxCount: number;
  auraRadiusQ10?: number;
  movementPercent?: number;
  capturePercent?: number;
  damage?: number;
  cadenceTicks?: number;
  rangeQ10?: number;
  incomeMilliPerTick?: number;
  slowPercent?: number;
  slowTicks?: number;
  refundMilliFlux: number;
}

export const BALANCE_V1 = {
  balanceVersion: 1 as const,
  tickHz: 20,
  tickMs: 50,
  arena: { width: 48, height: 32 },
  startingFluxMilli: 260_000,
  startingPopulation: 3,
  populationCap: 18,
  baseIncomeMilliPerTick: 125,
  outpostIncomeMilliPerTick: 175,
  surgedOutpostIncomeMilliPerTick: 275,
  units: {
    gleamrunner: { kind: "gleamrunner", costMilliFlux: 70_000, buildTicks: 150, population: 1, maxHealth: 125, damage: 11, cadenceTicks: 13, rangeQ10: 3_482, speedQ10PerTick: 171 },
    loomkeeper: { kind: "loomkeeper", costMilliFlux: 95_000, buildTicks: 180, population: 1, maxHealth: 155, damage: 7, cadenceTicks: 20, rangeQ10: 3_072, speedQ10PerTick: 143 },
    prismLancer: { kind: "prismLancer", costMilliFlux: 145_000, buildTicks: 260, population: 2, maxHealth: 220, damage: 28, cadenceTicks: 24, rangeQ10: 5_530, speedQ10PerTick: 120 },
    stoneguard: { kind: "stoneguard", costMilliFlux: 75_000, buildTicks: 160, population: 1, maxHealth: 180, damage: 15, cadenceTicks: 16, rangeQ10: 1_331, speedQ10PerTick: 125 },
    prospector: { kind: "prospector", costMilliFlux: 95_000, buildTicks: 180, population: 1, maxHealth: 175, damage: 8, cadenceTicks: 20, rangeQ10: 3_072, speedQ10PerTick: 120 },
    riftCannon: { kind: "riftCannon", costMilliFlux: 150_000, buildTicks: 280, population: 2, maxHealth: 235, damage: 34, cadenceTicks: 31, rangeQ10: 6_042, speedQ10PerTick: 95, splashRadiusQ10: 1_126, slowPercent: 20, slowTicks: 30 },
  } satisfies Record<UnitKind, BalanceUnit>,
  headquarters: {
    sunwoven: { maxHealth: 2_000, damage: 12, cadenceTicks: 16, rangeQ10: 5_120 },
    gravemark: { maxHealth: 2_200, damage: 14, cadenceTicks: 20, rangeQ10: 5_120 },
  } satisfies Record<Faction, { maxHealth: number; damage: number; cadenceTicks: number; rangeQ10: number }>,
  structures: {
    latticeField: { kind: "latticeField", costMilliFlux: 85_000, buildTicks: 120, maxHealth: 260, lifeTicks: 1_500, maxCount: 2, auraRadiusQ10: 4_608, movementPercent: 18, capturePercent: 20, refundMilliFlux: 42_500 },
    extractionBulwark: { kind: "extractionBulwark", costMilliFlux: 105_000, buildTicks: 160, maxHealth: 420, maxCount: 2, auraRadiusQ10: 4_608, damage: 9, cadenceTicks: 18, rangeQ10: 5_120, incomeMilliPerTick: 40, slowPercent: 20, slowTicks: 30, refundMilliFlux: 52_500 },
  } satisfies Record<"latticeField" | "extractionBulwark", BalanceStructure>,
  capture: {
    neutralOutpost: 14_000_000,
    enemyOutpostNeutralization: 10_000_000,
    neutralEngine: 20_000_000,
    enemyEngineNeutralization: 12_000_000,
    slotValues: [50_000, 17_500, 10_000] as const,
    loomkeeperMultiplierNumerator: 5,
    loomkeeperMultiplierDenominator: 4,
    latticeMultiplierNumerator: 6,
    latticeMultiplierDenominator: 5,
    suddenDeathMultiplierNumerator: 5,
    suddenDeathMultiplierDenominator: 4,
  },
  fracture: {
    earliestSeconds: 255,
    randomSeconds: 30,
    telegraphTicks: 80,
  },
  resonance: {
    victoryMilli: 275_000,
    calibrationTicks: 600,
    normalOneOutpostMilliPerTick: 50,
    normalTwoOutpostMilliPerTick: 75,
    suddenDeathTick: 12_600,
    suddenDeathOneOutpostMilliPerTick: 100,
    suddenDeathTwoOutpostMilliPerTick: 150,
  },
  match: { suddenDeathTick: 12_600, finalTick: 14_400 },
  attack: { damageTickOffset: 4, attackFrameDurationsMs: [100, 100, 100, 300] as const },
} as const;

export type BalanceV1 = typeof BALANCE_V1;
