import { BALANCE_V1 } from "../content/balance.v1";
import type { Faction } from "../content/schema";

export type ObjectiveKind = "outpostNorth" | "outpostSouth" | "engine";

export interface CaptureContributor {
  entityId: number;
  faction: Faction;
  individualMultiplierNumerator?: number;
  individualMultiplierDenominator?: number;
}

export interface CaptureObjectiveState {
  kind: ObjectiveKind;
  owner: Faction | null;
  progressMicro: Record<Faction, number>;
  neutralized: boolean;
}

export interface CaptureTickResult {
  state: CaptureObjectiveState;
  contested: boolean;
  gainedMicro: number;
  event: "none" | "neutralized" | "claimed";
}

export function createCaptureObjective(kind: ObjectiveKind): CaptureObjectiveState {
  return { kind, owner: null, progressMicro: { sunwoven: 0, gravemark: 0 }, neutralized: false };
}

export function sortedCaptureContributors(contributors: readonly CaptureContributor[]): CaptureContributor[] {
  return [...contributors].sort((left, right) => {
    const leftNumerator = left.individualMultiplierNumerator ?? 1;
    const leftDenominator = left.individualMultiplierDenominator ?? 1;
    const rightNumerator = right.individualMultiplierNumerator ?? 1;
    const rightDenominator = right.individualMultiplierDenominator ?? 1;
    return rightNumerator * leftDenominator - leftNumerator * rightDenominator || left.entityId - right.entityId;
  });
}

export function captureContributionMicro(contributors: readonly CaptureContributor[], fieldCount: number, suddenDeath: boolean): number {
  const sorted = sortedCaptureContributors(contributors).slice(0, BALANCE_V1.capture.slotValues.length);
  if (sorted.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const contributor = sorted[index];
    if (!contributor) continue;
    const slot = BALANCE_V1.capture.slotValues[index] ?? 0;
    const numerator = contributor.individualMultiplierNumerator ?? 1;
    const denominator = contributor.individualMultiplierDenominator ?? 1;
    sum += Math.trunc(slot * numerator / denominator);
  }
  if (fieldCount > 0) sum = Math.trunc(sum * BALANCE_V1.capture.latticeMultiplierNumerator / BALANCE_V1.capture.latticeMultiplierDenominator);
  if (suddenDeath) sum = Math.trunc(sum * BALANCE_V1.capture.suddenDeathMultiplierNumerator / BALANCE_V1.capture.suddenDeathMultiplierDenominator);
  return sum;
}

export function captureThreshold(objective: ObjectiveKind, owner: Faction | null): number {
  if (objective === "engine") return owner === null ? BALANCE_V1.capture.neutralEngine : BALANCE_V1.capture.enemyEngineNeutralization;
  return owner === null ? BALANCE_V1.capture.neutralOutpost : BALANCE_V1.capture.enemyOutpostNeutralization;
}

export function resolveCaptureTick(
  input: CaptureObjectiveState,
  contributors: readonly CaptureContributor[],
  ownedOutpost: boolean | Record<Faction, boolean>,
  fieldCount: number,
  suddenDeath: boolean,
): CaptureTickResult {
  const state: CaptureObjectiveState = { ...input, progressMicro: { ...input.progressMicro } };
  const factionContributors = {
    sunwoven: contributors.filter((contributor) => contributor.faction === "sunwoven"),
    gravemark: contributors.filter((contributor) => contributor.faction === "gravemark"),
  };
  const isSupplied = (faction: Faction): boolean => typeof ownedOutpost === "boolean" ? ownedOutpost : ownedOutpost[faction];
  if (state.kind === "engine") {
    for (const faction of ["sunwoven", "gravemark"] as const) if (!isSupplied(faction)) factionContributors[faction].splice(0, factionContributors[faction].length);
  }
  const activeFactions = (Object.keys(factionContributors) as Faction[]).filter((faction) => factionContributors[faction].length > 0);
  if (activeFactions.length !== 1) return { state, contested: activeFactions.length > 1, gainedMicro: 0, event: "none" };
  const faction = activeFactions[0];
  if (!faction) return { state, contested: false, gainedMicro: 0, event: "none" };
  const gainedMicro = captureContributionMicro(factionContributors[faction], fieldCount, suddenDeath);
  state.progressMicro[faction] += gainedMicro;
  const opposingFaction: Faction = faction === "sunwoven" ? "gravemark" : "sunwoven";
  const required = captureThreshold(state.kind, state.owner);
  if (state.owner !== null && faction !== state.owner && state.progressMicro[faction] >= required) {
    state.owner = null;
    state.neutralized = true;
    state.progressMicro.sunwoven = 0;
    state.progressMicro.gravemark = 0;
    return { state, contested: false, gainedMicro, event: "neutralized" };
  }
  if (state.owner === null && state.progressMicro[faction] >= required) {
    state.owner = faction;
    state.neutralized = false;
    state.progressMicro.sunwoven = 0;
    state.progressMicro.gravemark = 0;
    return { state, contested: false, gainedMicro, event: "claimed" };
  }
  if (state.owner !== null && faction === state.owner) state.progressMicro[opposingFaction] = 0;
  return { state, contested: false, gainedMicro, event: "none" };
}
