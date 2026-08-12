import { BALANCE_V1 } from "../content/balance.v1";
import type { Faction, UnitKind } from "../content/schema";
import { canStartStoneguardLunge, resolveAttackTick, startAttack, type AttackState, type CombatUnit, startStoneguardLunge, advanceStoneguardLunge, type DamageEvent, type LungeState } from "./combat";
import { createCaptureObjective, resolveCaptureTick, type CaptureContributor, type CaptureObjectiveState, type ObjectiveKind } from "./capture";
import { distanceSquared, fixedMovementStep, clampToTarget, Q10, q10FromWorld, type MovementRemainder } from "./fixed";
import { MatchPrng, type PrngStreamsSnapshot } from "./prng";
import { advanceConstruction, cancelConstruction, destroyStructure, startConstruction, structureIsActive, type StructureKind, type StructureState } from "./structures";
import { resolveMatchEnd, type MatchEndResult, type VictoryFactionStats } from "./victory";

export type SkirmishDifficulty = "explorer" | "standard" | "vanguard";

export interface MatchConfig {
  seed: number;
  playerFaction: Faction;
  difficulty: SkirmishDifficulty;
  buildIdentity?: string;
}

export interface SkirmishUnit extends CombatUnit {
  targetXQ10: number;
  targetYQ10: number;
  remainderX: number;
  remainderY: number;
  selected: boolean;
  busyBuilding: boolean;
  slowUntilTick: number;
}

export interface HeadquartersState {
  faction: Faction;
  health: number;
  maxHealth: number;
  xQ10: number;
  yQ10: number;
}

export interface ProductionItem {
  kind: UnitKind;
  readyTick: number;
}

export interface FactionRuntimeState {
  faction: Faction;
  fluxMilli: number;
  population: number;
  production: ProductionItem[];
  headquarters: HeadquartersState;
  resonanceMilli: number;
  calibrationTicks: number;
}

export interface MatchCommandRecord {
  id: number;
  tick: number;
  type: "move" | "attack" | "build" | "produce" | "lunge";
  faction: Faction;
  entityIds: number[];
  targetXQ10?: number;
  targetYQ10?: number;
  targetEntityId?: number;
  structureKind?: StructureKind;
  unitKind?: UnitKind;
}

export interface MatchEvent {
  tick: number;
  type: "fractureTelegraph" | "fractureOpened" | "capture" | "production" | "construction" | "damage" | "suddenDeath" | "matchEnded";
  faction?: Faction;
  objective?: ObjectiveKind;
  detail?: string;
  damage?: DamageEvent;
  result?: MatchEndResult;
}

export interface SkirmishSnapshot {
  contentVersion: "arena.v1";
  simulationVersion: "sim.v1";
  balanceVersion: 1;
  seed: number;
  tick: number;
  checksum: string;
  fractureWarningTick: number;
  fractureCollapseTick: number;
  fractureOpen: boolean;
  suddenDeath: boolean;
  surgedOutpost: "northOutpost" | "southOutpost";
  units: SkirmishUnit[];
  structures: StructureState[];
  factions: Record<Faction, FactionRuntimeState>;
  outposts: Record<"northOutpost" | "southOutpost", CaptureObjectiveState>;
  engine: CaptureObjectiveState;
  prng: PrngStreamsSnapshot;
  commandHistoryBoundary: number;
}

interface InternalState extends SkirmishSnapshot {
  nextEntityId: number;
  nextStructureId: number;
  nextCommandId: number;
  attacks: AttackState[];
  lunges: LungeState[];
  pendingCommands: MatchCommandRecord[];
  commandHistory: MatchCommandRecord[];
  ended: MatchEndResult | null;
  lastEngineOwner: Faction | null;
  eventHistory: MatchEvent[];
}

const OBJECTIVE_POSITIONS: Record<ObjectiveKind, { xQ10: number; yQ10: number }> = {
  outpostNorth: { xQ10: q10FromWorld(22), yQ10: q10FromWorld(8) },
  outpostSouth: { xQ10: q10FromWorld(22), yQ10: q10FromWorld(24) },
  engine: { xQ10: q10FromWorld(24), yQ10: q10FromWorld(16) },
};
const CAPTURE_RADIUS_Q10 = q10FromWorld(3.5);
const FRACTURE_SAFE_NODES = [
  { xQ10: q10FromWorld(15), yQ10: q10FromWorld(16) },
  { xQ10: q10FromWorld(33), yQ10: q10FromWorld(16) },
  { xQ10: q10FromWorld(22), yQ10: q10FromWorld(8) },
  { xQ10: q10FromWorld(22), yQ10: q10FromWorld(24) },
] as const;

export class SkirmishMatch {
  private state: InternalState;
  private readonly config: MatchConfig;
  private finalPriority: number | null = null;

  constructor(config: MatchConfig) {
    this.config = { ...config, seed: config.seed >>> 0 };
    const seed = config.seed >>> 0;
    const prng = new MatchPrng(seed);
    const fractureSeconds = BALANCE_V1.fracture.earliestSeconds + prng.event.nextInt(0, BALANCE_V1.fracture.randomSeconds);
    const surgedOutpost = prng.event.nextInt(0, 1) === 0 ? "northOutpost" : "southOutpost";
    this.state = {
      contentVersion: "arena.v1",
      simulationVersion: "sim.v1",
      balanceVersion: 1,
      seed,
      tick: 0,
      checksum: "00000000",
      fractureWarningTick: fractureSeconds * BALANCE_V1.tickHz,
      fractureCollapseTick: fractureSeconds * BALANCE_V1.tickHz + BALANCE_V1.fracture.telegraphTicks,
      fractureOpen: false,
      suddenDeath: false,
      surgedOutpost,
      units: [],
      structures: [],
      factions: {
        sunwoven: factionRuntime("sunwoven"),
        gravemark: factionRuntime("gravemark"),
      },
      outposts: {
        northOutpost: createCaptureObjective("outpostNorth"),
        southOutpost: createCaptureObjective("outpostSouth"),
      },
      engine: createCaptureObjective("engine"),
      prng: prng.snapshot(),
      commandHistoryBoundary: 0,
      nextEntityId: 1,
      nextStructureId: 1,
      nextCommandId: 1,
      attacks: [],
      lunges: [],
      pendingCommands: [],
      commandHistory: [],
      ended: null,
      lastEngineOwner: null,
      eventHistory: [],
    };
    this.spawnStarter("sunwoven");
    this.spawnStarter("gravemark");
    this.updateChecksum();
  }

  get tick(): number { return this.state.tick; }
  get seed(): number { return this.state.seed; }
  get ended(): MatchEndResult | null { return this.state.ended; }
  get configSnapshot(): MatchConfig { return { ...this.config, seed: this.state.seed }; }

  snapshot(): SkirmishSnapshot {
    const snapshot = cloneSnapshot(this.state);
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    if (bytes >= 64 * 1024) throw new Error("Skirmish snapshot exceeds 64 KiB");
    return snapshot;
  }

  checksum(): string { return this.state.checksum; }
  events(): MatchEvent[] { return this.state.eventHistory.map((event) => ({ ...event, damage: event.damage ? { ...event.damage, splashTargetIds: [...event.damage.splashTargetIds] } : undefined })); }
  commands(): MatchCommandRecord[] { return this.state.commandHistory.map((command) => ({ ...command, entityIds: [...command.entityIds] })); }

  queueMove(faction: Faction, entityIds: number[], targetXQ10: number, targetYQ10: number): MatchCommandRecord {
    return this.queueCommand({ type: "move", faction, entityIds, targetXQ10, targetYQ10 });
  }

  queueAttack(faction: Faction, entityIds: number[], targetEntityId: number): MatchCommandRecord {
    return this.queueCommand({ type: "attack", faction, entityIds, targetEntityId });
  }

  queueBuild(faction: Faction, entityIds: number[], structureKind: StructureKind, targetXQ10: number, targetYQ10: number): MatchCommandRecord {
    return this.queueCommand({ type: "build", faction, entityIds, structureKind, targetXQ10, targetYQ10 });
  }

  queueProduction(faction: Faction, unitKind: UnitKind): MatchCommandRecord {
    return this.queueCommand({ type: "produce", faction, entityIds: [], unitKind });
  }

  queueLunge(faction: Faction, entityIds: number[], targetEntityId: number): MatchCommandRecord {
    return this.queueCommand({ type: "lunge", faction, entityIds, targetEntityId });
  }

  canQueueLunge(faction: Faction, entityId: number, targetEntityId: number): boolean {
    const attacker = this.state.units.find((unit) => unit.id === entityId && unit.faction === faction && unit.health > 0);
    const target = this.state.units.find((unit) => unit.id === targetEntityId && unit.health > 0);
    if (!attacker || !target || attacker.busyBuilding || target.faction === faction) return false;
    const cooldownReadyTick = this.state.lunges.find((lunge) => lunge.attackerId === attacker.id)?.cooldownReadyTick ?? 0;
    return canStartStoneguardLunge(attacker, target, this.state.tick + 1, cooldownReadyTick);
  }

  step(): MatchEvent[] {
    if (this.state.ended) return [];
    const nextTick = this.state.tick + 1;
    const events: MatchEvent[] = [];
    while (this.state.pendingCommands.length > 0 && this.state.pendingCommands[0]?.tick === nextTick) {
      const command = this.state.pendingCommands.shift();
      if (command) events.push(...this.applyCommand(command, nextTick));
    }
    this.advanceStructures(nextTick, events);
    this.advanceProduction(nextTick, events);
    this.advanceLunges(nextTick, events);
    this.advanceAttacks(nextTick, events);
    this.moveUnits(nextTick);
    this.awardIncome(nextTick);
    this.resolveObjectives(nextTick, events);
    this.resolveFracture(nextTick, events);
    this.resolveResonance(nextTick);
    if (nextTick === BALANCE_V1.resonance.suddenDeathTick) {
      this.state.suddenDeath = true;
      events.push({ tick: nextTick, type: "suddenDeath", detail: "The Meridian enters sudden death." });
    }
    this.state.tick = nextTick;
    if (nextTick >= BALANCE_V1.match.finalTick && this.finalPriority === null) this.finalPriority = this.consumeFinalPriority();
    this.updateChecksum();
    const result = this.resolveVictory();
    if (result) {
      this.state.ended = result;
      events.push({ tick: nextTick, type: "matchEnded", result });
    }
    this.state.eventHistory.push(...events);
    return events;
  }

  run(ticks: number): MatchEvent[] {
    const events: MatchEvent[] = [];
    for (let index = 0; index < ticks && !this.state.ended; index += 1) events.push(...this.step());
    return events;
  }

  forceFracture(): void {
    this.state.fractureWarningTick = this.state.tick + 1;
    this.state.fractureCollapseTick = this.state.tick + 1 + BALANCE_V1.fracture.telegraphTicks;
  }

  setObjectiveOwner(objective: ObjectiveKind, faction: Faction | null): void {
    if (objective === "engine") this.state.engine.owner = faction;
    else this.state.outposts[this.outpostKey(objective)].owner = faction;
  }

  setResonance(faction: Faction, resonanceMilli: number): void { this.state.factions[faction].resonanceMilli = resonanceMilli; }
  setHeadquartersHealth(faction: Faction, health: number): void { this.state.factions[faction].headquarters.health = Math.max(0, health); }
  setCalibration(faction: Faction, ticks: number): void { this.state.factions[faction].calibrationTicks = ticks; }
  ownedOutposts(faction: Faction): number { return [this.state.outposts.northOutpost, this.state.outposts.southOutpost].filter((objective) => objective.owner === faction).length; }

  cancelStructure(structureId: number): number {
    const structure = this.state.structures.find((candidate) => candidate.id === structureId);
    if (!structure || structure.completed) return 0;
    const refund = cancelConstruction(structure);
    this.state.factions[structure.faction].fluxMilli += refund.refundMilliFlux;
    this.state.structures = this.state.structures.filter((candidate) => candidate.id !== structureId);
    for (const unit of this.state.units) if (unit.faction === structure.faction && unit.busyBuilding) unit.busyBuilding = false;
    this.updateChecksum();
    return refund.refundMilliFlux;
  }

  destroyStructureById(structureId: number): number {
    const structure = this.state.structures.find((candidate) => candidate.id === structureId);
    if (!structure) return 0;
    const refund = destroyStructure(structure);
    this.state.factions[structure.faction].fluxMilli += refund.refundMilliFlux;
    this.state.structures = this.state.structures.filter((candidate) => candidate.id !== structureId);
    for (const unit of this.state.units) if (unit.faction === structure.faction && unit.busyBuilding) unit.busyBuilding = false;
    this.updateChecksum();
    return refund.refundMilliFlux;
  }

  damageHeadquarters(faction: Faction, damage: number): void {
    this.state.factions[faction].headquarters.health = Math.max(0, this.state.factions[faction].headquarters.health - damage);
    this.updateChecksum();
  }

  private queueCommand(input: Omit<MatchCommandRecord, "id" | "tick">): MatchCommandRecord {
    const command: MatchCommandRecord = { ...input, id: this.state.nextCommandId, tick: this.state.tick + 1, entityIds: [...input.entityIds].sort((left, right) => left - right) };
    this.state.nextCommandId += 1;
    this.state.pendingCommands.push(command);
    this.state.commandHistory.push(command);
    this.state.pendingCommands.sort((left, right) => left.tick - right.tick || left.id - right.id);
    this.state.commandHistoryBoundary = command.id;
    return { ...command, entityIds: [...command.entityIds] };
  }

  private applyCommand(command: MatchCommandRecord, tick: number): MatchEvent[] {
    const events: MatchEvent[] = [];
    if (command.type === "move" && command.targetXQ10 !== undefined && command.targetYQ10 !== undefined) {
      for (const unit of this.ownedUnits(command.faction, command.entityIds)) {
        if (!unit.busyBuilding) { unit.targetXQ10 = command.targetXQ10; unit.targetYQ10 = command.targetYQ10; }
      }
    } else if (command.type === "attack" && command.targetEntityId !== undefined) {
      const target = this.state.units.find((unit) => unit.id === command.targetEntityId);
      if (target) {
        for (const unit of this.ownedUnits(command.faction, command.entityIds)) {
          const rangeQ10 = BALANCE_V1.units[unit.kind].rangeQ10;
          if (!unit.busyBuilding && target.faction !== unit.faction && distanceSquared({ x: unit.xQ10, y: unit.yQ10 }, { x: target.xQ10, y: target.yQ10 }) <= rangeQ10 * rangeQ10) this.state.attacks.push(startAttack(unit, target, tick));
        }
      }
    } else if (command.type === "lunge" && command.targetEntityId !== undefined) {
      const target = this.state.units.find((unit) => unit.id === command.targetEntityId);
      if (target) for (const unit of this.ownedUnits(command.faction, command.entityIds)) {
        const ready = this.state.lunges.find((lunge) => lunge.attackerId === unit.id)?.cooldownReadyTick ?? 0;
        if (!unit.busyBuilding && target.faction !== unit.faction && unit.kind === "stoneguard" && canStartStoneguardLunge(unit, target, tick, ready)) this.state.lunges.push(startStoneguardLunge(unit, target, tick, ready));
      }
    } else if (command.type === "produce" && command.unitKind !== undefined) {
      const faction = this.state.factions[command.faction];
      const definition = BALANCE_V1.units[command.unitKind];
      const queuedPopulation = faction.production.reduce((population, item) => population + BALANCE_V1.units[item.kind].population, 0);
      if (faction.production.length < 5 && faction.population + queuedPopulation + definition.population <= BALANCE_V1.populationCap && faction.fluxMilli >= definition.costMilliFlux) {
        faction.fluxMilli -= definition.costMilliFlux;
        faction.production.push({ kind: command.unitKind, readyTick: tick + definition.buildTicks });
        events.push({ tick, type: "production", faction: command.faction, detail: `${command.unitKind} queued` });
      }
    } else if (command.type === "build" && command.structureKind !== undefined && command.targetXQ10 !== undefined && command.targetYQ10 !== undefined) {
      const builder = this.ownedUnits(command.faction, command.entityIds).find((unit) => unit.kind === "loomkeeper" || unit.kind === "prospector");
      const definition = BALANCE_V1.structures[command.structureKind];
      const count = this.state.structures.filter((structure) => structure.faction === command.faction && structure.kind === command.structureKind && structureIsActive(structure, tick)).length;
      if (builder && !builder.busyBuilding && count < definition.maxCount && this.state.factions[command.faction].fluxMilli >= definition.costMilliFlux) {
        this.state.factions[command.faction].fluxMilli -= definition.costMilliFlux;
        const structure = startConstruction(this.state.nextStructureId, command.faction, command.structureKind, command.targetXQ10, command.targetYQ10, tick);
        this.state.nextStructureId += 1;
        this.state.structures.push(structure);
        builder.busyBuilding = true;
        events.push({ tick, type: "construction", faction: command.faction, detail: `${command.structureKind} started` });
      }
    }
    return events;
  }

  private advanceStructures(tick: number, events: MatchEvent[]): void {
    for (const structure of this.state.structures) {
      const wasCompleted = structure.completed;
      if (advanceConstruction(structure, tick) && !wasCompleted) {
        const builder = this.state.units.find((unit) => unit.faction === structure.faction && unit.busyBuilding && distanceSquared({ x: unit.xQ10, y: unit.yQ10 }, { x: structure.xQ10, y: structure.yQ10 }) <= q10FromWorld(2) * q10FromWorld(2));
        if (builder) builder.busyBuilding = false;
        events.push({ tick, type: "construction", faction: structure.faction, detail: `${structure.kind} completed` });
      }
    }
    this.state.structures = this.state.structures.filter((structure) => structure.health > 0 && (structure.expiresTick === null || tick < structure.expiresTick));
  }

  private advanceProduction(tick: number, events: MatchEvent[]): void {
    for (const faction of ["sunwoven", "gravemark"] as const) {
      const runtime = this.state.factions[faction];
      const completed = runtime.production.filter((item) => item.readyTick <= tick);
      runtime.production = runtime.production.filter((item) => item.readyTick > tick);
      for (const item of completed) {
        const headquarters = runtime.headquarters;
        const direction = faction === "sunwoven" ? 1 : -1;
        this.spawnUnit(faction, item.kind, headquarters.xQ10 + direction * q10FromWorld(1.5), headquarters.yQ10, BALANCE_V1.units[item.kind].maxHealth);
        events.push({ tick, type: "production", faction, detail: `${item.kind} completed` });
      }
    }
  }

  private advanceAttacks(tick: number, events: MatchEvent[]): void {
    const units = this.state.units;
    for (const attack of this.state.attacks) {
      const attacker = units.find((unit) => unit.id === attack.attackerId);
      const damage = resolveAttackTick(attack, attacker, units, tick);
      if (damage) events.push({ tick, type: "damage", damage });
    }
    this.state.attacks = this.state.attacks.filter((attack) => attack.active && units.some((unit) => unit.id === attack.attackerId && unit.health > 0) && units.some((unit) => unit.id === attack.targetId && unit.health > 0));
    for (const unit of units) if (unit.health <= 0) unit.targetXQ10 = unit.xQ10;
  }

  private advanceLunges(tick: number, events: MatchEvent[]): void {
    for (const lunge of this.state.lunges) {
      const attacker = this.state.units.find((unit) => unit.id === lunge.attackerId);
      const target = this.state.units.find((unit) => unit.id === lunge.targetId);
      if (advanceStoneguardLunge(lunge, attacker, target, tick)) {
        if (attacker) { attacker.targetXQ10 = attacker.xQ10; attacker.targetYQ10 = attacker.yQ10; attacker.remainderX = 0; attacker.remainderY = 0; }
        if (lunge.contacted && attacker && target && target.health > 0) {
          target.health = Math.max(0, target.health - BALANCE_V1.units.stoneguard.damage);
          target.slowUntilTick = Math.max(target.slowUntilTick, tick + 30);
          events.push({ tick, type: "damage", detail: "Stoneguard Gravimetric Lunge contact" });
        }
      }
    }
    this.state.lunges = this.state.lunges.filter((lunge) => lunge.active || tick < lunge.cooldownReadyTick);
  }

  private moveUnits(tick: number): void {
    for (const unit of this.state.units) {
      if (unit.health <= 0 || unit.busyBuilding) continue;
      const remainder: MovementRemainder = { x: unit.remainderX, y: unit.remainderY };
      if (unit.targetXQ10 === unit.xQ10 && unit.targetYQ10 === unit.yQ10) continue;
      const baseSpeed = BALANCE_V1.units[unit.kind].speedQ10PerTick;
      const speed = unit.slowUntilTick > tick ? Math.trunc(baseSpeed * 65 / 100) : baseSpeed;
      const step = fixedMovementStep(unit.targetXQ10 - unit.xQ10, unit.targetYQ10 - unit.yQ10, speed, remainder);
      const next = clampToTarget({ x: unit.xQ10, y: unit.yQ10 }, { x: unit.targetXQ10, y: unit.targetYQ10 }, step);
      unit.xQ10 = next.x;
      unit.yQ10 = next.y;
      unit.remainderX = remainder.x;
      unit.remainderY = remainder.y;
    }
  }

  private awardIncome(tick: number): void {
    for (const faction of ["sunwoven", "gravemark"] as const) {
      const ownedOutposts = this.ownedOutposts(faction);
      let income = BALANCE_V1.baseIncomeMilliPerTick + ownedOutposts * BALANCE_V1.outpostIncomeMilliPerTick;
      if (this.state.outposts[this.state.surgedOutpost].owner === faction) income += BALANCE_V1.surgedOutpostIncomeMilliPerTick - BALANCE_V1.outpostIncomeMilliPerTick;
      for (const structure of this.state.structures) {
        if (structure.faction === faction && structure.kind === "extractionBulwark" && structure.completed && structureIsActive(structure, tick) && ownedOutposts > 0 && this.nearOwnedOutpost(structure, faction)) income += BALANCE_V1.structures.extractionBulwark.incomeMilliPerTick ?? 0;
      }
      this.state.factions[faction].fluxMilli += income;
    }
  }

  private resolveObjectives(tick: number, events: MatchEvent[]): void {
    for (const key of ["northOutpost", "southOutpost"] as const) this.resolveObjective(key, this.state.outposts[key], tick, events);
    this.resolveObjective("engine", this.state.engine, tick, events);
  }

  private resolveObjective(label: "northOutpost" | "southOutpost" | "engine", objective: CaptureObjectiveState, tick: number, events: MatchEvent[]): void {
    const objectiveKind: ObjectiveKind = objective.kind;
    if (objectiveKind === "engine" && !this.state.fractureOpen) return;
    const position = OBJECTIVE_POSITIONS[objectiveKind];
    const objectivePosition = { x: position.xQ10, y: position.yQ10 };
    const contributors = this.state.units.filter((unit) => unit.health > 0 && distanceSquared({ x: unit.xQ10, y: unit.yQ10 }, objectivePosition) <= CAPTURE_RADIUS_Q10 * CAPTURE_RADIUS_Q10).map((unit) => ({ entityId: unit.id, faction: unit.faction, individualMultiplierNumerator: unit.kind === "loomkeeper" ? 5 : 1, individualMultiplierDenominator: unit.kind === "loomkeeper" ? 4 : 1 } satisfies CaptureContributor));
    const fieldRadius = BALANCE_V1.structures.latticeField.auraRadiusQ10 ?? 0;
    const fieldCount = this.state.structures.some((structure) => structure.completed && structure.faction === (contributors[0]?.faction ?? "sunwoven") && structure.kind === "latticeField" && distanceSquared({ x: structure.xQ10, y: structure.yQ10 }, objectivePosition) <= fieldRadius * fieldRadius) ? 1 : 0;
    const result = resolveCaptureTick(objective, contributors, { sunwoven: this.ownedOutposts("sunwoven") > 0, gravemark: this.ownedOutposts("gravemark") > 0 }, fieldCount, this.state.suddenDeath);
    if (objectiveKind === "engine") this.state.engine = result.state;
    else if (label === "northOutpost") this.state.outposts.northOutpost = result.state;
    else this.state.outposts.southOutpost = result.state;
    if (result.event !== "none") events.push({ tick, type: "capture", objective: objectiveKind, faction: result.state.owner ?? undefined, detail: result.event });
  }

  private resolveFracture(tick: number, events: MatchEvent[]): void {
    if (tick === this.state.fractureWarningTick) events.push({ tick, type: "fractureTelegraph", detail: "The central route is destabilizing." });
    if (tick >= this.state.fractureCollapseTick && !this.state.fractureOpen) {
      this.state.fractureOpen = true;
      const fractureRadius = q10FromWorld(6);
      for (const unit of this.state.units) {
        const unitPosition = { x: unit.xQ10, y: unit.yQ10 };
        const enginePosition = { x: OBJECTIVE_POSITIONS.engine.xQ10, y: OBJECTIVE_POSITIONS.engine.yQ10 };
        if (distanceSquared(unitPosition, enginePosition) > fractureRadius * fractureRadius) continue;
        const safeNode = FRACTURE_SAFE_NODES.reduce((nearest, candidate) => {
          const nearestDistance = distanceSquared(unitPosition, { x: nearest.xQ10, y: nearest.yQ10 });
          const candidateDistance = distanceSquared(unitPosition, { x: candidate.xQ10, y: candidate.yQ10 });
          return candidateDistance < nearestDistance ? candidate : nearest;
        });
        unit.targetXQ10 = safeNode.xQ10;
        unit.targetYQ10 = safeNode.yQ10;
        unit.remainderX = 0;
        unit.remainderY = 0;
      }
      events.push({ tick, type: "fractureOpened", detail: `Luminous bridges open toward ${this.state.surgedOutpost}.` });
    }
  }

  private resolveResonance(tick: number): void {
    const owner = this.state.engine.owner;
    if (owner !== this.state.lastEngineOwner) {
      this.state.lastEngineOwner = owner;
      if (owner !== null) this.state.factions[owner].calibrationTicks = 0;
    }
    if (owner === null) return;
    const supply = this.ownedOutposts(owner) > 0;
    const position = OBJECTIVE_POSITIONS.engine;
    const contested = this.state.units.some((unit) => unit.health > 0 && unit.faction !== owner && distanceSquared({ x: unit.xQ10, y: unit.yQ10 }, { x: position.xQ10, y: position.yQ10 }) <= CAPTURE_RADIUS_Q10 * CAPTURE_RADIUS_Q10);
    if (!supply || contested) return;
    const runtime = this.state.factions[owner];
    if (this.state.suddenDeath) runtime.calibrationTicks = BALANCE_V1.resonance.calibrationTicks;
    else if (runtime.calibrationTicks < BALANCE_V1.resonance.calibrationTicks) runtime.calibrationTicks += 1;
    if (runtime.calibrationTicks < BALANCE_V1.resonance.calibrationTicks) return;
    const outposts = this.ownedOutposts(owner);
    runtime.resonanceMilli += this.state.suddenDeath ? (outposts >= 2 ? BALANCE_V1.resonance.suddenDeathTwoOutpostMilliPerTick : BALANCE_V1.resonance.suddenDeathOneOutpostMilliPerTick) : (outposts >= 2 ? BALANCE_V1.resonance.normalTwoOutpostMilliPerTick : BALANCE_V1.resonance.normalOneOutpostMilliPerTick);
    if (tick >= BALANCE_V1.resonance.suddenDeathTick) runtime.calibrationTicks = BALANCE_V1.resonance.calibrationTicks;
  }

  private resolveVictory(): MatchEndResult | null {
    const finalPriority = this.finalPriority ?? 0;
    const stats = (["sunwoven", "gravemark"] as const).map((faction) => {
      const runtime = this.state.factions[faction];
      return { faction, resonanceMilli: runtime.resonanceMilli, ownedOutposts: this.ownedOutposts(faction), headquartersHealth: runtime.headquarters.health, headquartersMaxHealth: runtime.headquarters.maxHealth, survivingUnitHealth: this.state.units.filter((unit) => unit.faction === faction && unit.health > 0).reduce((sum, unit) => sum + unit.health, 0), finalPriority: faction === "sunwoven" ? finalPriority : 1 - finalPriority } satisfies VictoryFactionStats;
    });
    return resolveMatchEnd(stats[0], stats[1], this.state.tick, this.state.checksum, this.state.seed, this.destroyedHeadquarters(), this.config.buildIdentity ?? "runtime");
  }

  private destroyedHeadquarters(): Faction | null {
    if (this.state.factions.sunwoven.headquarters.health <= 0) return "gravemark";
    if (this.state.factions.gravemark.headquarters.health <= 0) return "sunwoven";
    return null;
  }

  private ownedUnits(faction: Faction, ids: readonly number[]): SkirmishUnit[] { return this.state.units.filter((unit) => unit.faction === faction && ids.includes(unit.id)); }
  private nearOwnedOutpost(structure: StructureState, faction: Faction): boolean { const radius = q10FromWorld(4.5); return (["northOutpost", "southOutpost"] as const).some((key) => { const objectiveKind = key === "northOutpost" ? "outpostNorth" : "outpostSouth"; const objective = this.state.outposts[key]; const position = OBJECTIVE_POSITIONS[objectiveKind]; return objective.owner === faction && distanceSquared({ x: structure.xQ10, y: structure.yQ10 }, { x: position.xQ10, y: position.yQ10 }) <= radius * radius; }); }

  private outpostKey(kind: "outpostNorth" | "outpostSouth"): "northOutpost" | "southOutpost" { return kind === "outpostNorth" ? "northOutpost" : "southOutpost"; }

  private consumeFinalPriority(): number {
    const prng = new MatchPrng(this.state.seed);
    prng.restore(this.state.prng);
    const priority = prng.finalPriority.nextInt(0, 1);
    this.state.prng = prng.snapshot();
    return priority;
  }

  private spawnStarter(faction: Faction): void {
    const x = faction === "sunwoven" ? q10FromWorld(5) : q10FromWorld(43);
    const direction = faction === "sunwoven" ? 1 : -1;
    const roster: Array<[UnitKind, number, number]> = faction === "sunwoven" ? [["gleamrunner", -2, 125], ["loomkeeper", 2, 155], ["prospector", 0, 175]] : [["stoneguard", -2, 180], ["prospector", 2, 175], ["loomkeeper", 0, 155]];
    for (const [kind, offset, health] of roster) this.spawnUnit(faction, kind, x + direction * (offset === 0 ? Q10 : 0), q10FromWorld(16 + offset), health);
  }

  private spawnUnit(faction: Faction, kind: UnitKind, xQ10: number, yQ10: number, health: number): SkirmishUnit {
    const unit: SkirmishUnit = { id: this.state.nextEntityId, faction, kind, xQ10, yQ10, targetXQ10: xQ10, targetYQ10: yQ10, remainderX: 0, remainderY: 0, health, maxHealth: health, selected: false, busyBuilding: false, slowUntilTick: 0 };
    this.state.nextEntityId += 1;
    this.state.units.push(unit);
    this.state.factions[faction].population += BALANCE_V1.units[kind].population;
    return unit;
  }

  private updateChecksum(): void {
    let hash = 0x811c9dc5;
    const append = (value: string | number | boolean | null): void => { const text = String(value); for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } hash ^= 0xff; hash = Math.imul(hash, 0x01000193) >>> 0; };
    append(this.state.seed); append(this.state.tick); append(this.state.fractureOpen); append(this.state.suddenDeath); append(this.state.surgedOutpost); append(this.state.commandHistoryBoundary);
    for (const unit of [...this.state.units].sort((left, right) => left.id - right.id)) { append(unit.id); append(unit.faction); append(unit.kind); append(unit.xQ10); append(unit.yQ10); append(unit.targetXQ10); append(unit.targetYQ10); append(unit.health); append(unit.busyBuilding); append(unit.slowUntilTick); }
    for (const faction of ["sunwoven", "gravemark"] as const) { const runtime = this.state.factions[faction]; append(faction); append(runtime.fluxMilli); append(runtime.population); append(runtime.resonanceMilli); append(runtime.calibrationTicks); append(runtime.headquarters.health); for (const item of runtime.production) { append(item.kind); append(item.readyTick); } }
    for (const objective of [this.state.outposts.northOutpost, this.state.outposts.southOutpost, this.state.engine]) { append(objective.kind); append(objective.owner); append(objective.progressMicro.sunwoven); append(objective.progressMicro.gravemark); }
    const prng = new MatchPrng(this.state.seed); prng.restore(this.state.prng); for (const stream of [prng.snapshot().event, prng.snapshot().ai, prng.snapshot().finalPriority]) { append(stream.algorithm); append(stream.seed); append(stream.state); append(stream.cursor); }
    this.state.checksum = (hash >>> 0).toString(16).padStart(8, "0");
  }
}

function factionRuntime(faction: Faction): FactionRuntimeState {
  return { faction, fluxMilli: BALANCE_V1.startingFluxMilli, population: 0, production: [], headquarters: { faction, health: BALANCE_V1.headquarters[faction].maxHealth, maxHealth: BALANCE_V1.headquarters[faction].maxHealth, xQ10: faction === "sunwoven" ? q10FromWorld(5) : q10FromWorld(43), yQ10: q10FromWorld(16) }, resonanceMilli: 0, calibrationTicks: 0 };
}

function cloneSnapshot(state: InternalState): SkirmishSnapshot {
  return {
    contentVersion: state.contentVersion,
    simulationVersion: state.simulationVersion,
    balanceVersion: state.balanceVersion,
    seed: state.seed,
    tick: state.tick,
    checksum: state.checksum,
    fractureWarningTick: state.fractureWarningTick,
    fractureCollapseTick: state.fractureCollapseTick,
    fractureOpen: state.fractureOpen,
    suddenDeath: state.suddenDeath,
    surgedOutpost: state.surgedOutpost,
    units: state.units.map((unit) => ({ ...unit })),
    structures: state.structures.map((structure) => ({ ...structure })),
    factions: {
      sunwoven: { ...state.factions.sunwoven, production: state.factions.sunwoven.production.map((item) => ({ ...item })), headquarters: { ...state.factions.sunwoven.headquarters } },
      gravemark: { ...state.factions.gravemark, production: state.factions.gravemark.production.map((item) => ({ ...item })), headquarters: { ...state.factions.gravemark.headquarters } },
    },
    outposts: {
      northOutpost: { ...state.outposts.northOutpost, progressMicro: { ...state.outposts.northOutpost.progressMicro } },
      southOutpost: { ...state.outposts.southOutpost, progressMicro: { ...state.outposts.southOutpost.progressMicro } },
    },
    engine: { ...state.engine, progressMicro: { ...state.engine.progressMicro } },
    prng: {
      event: { ...state.prng.event },
      ai: { ...state.prng.ai },
      finalPriority: { ...state.prng.finalPriority },
    },
    commandHistoryBoundary: state.commandHistoryBoundary,
  };
}
