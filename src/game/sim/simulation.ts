import type { Faction } from "../content/schema";
import { fixedMovementStep, clampToTarget, distanceSquared, square, type FixedPoint2 } from "./fixed";
import { compareCommands, type MatchCommand } from "./commands";
import { snapshotState, restoreState, createInitialState, type MatchSnapshot, type MatchState, type UnitState } from "./state";

export interface SimulationEvent {
  type: "commandApplied" | "fractureOpened";
  tick: number;
  commandId?: number;
}

export interface SimulationOptions {
  seed: number;
  snapshotLimitBytes?: number;
}

export class Simulation {
  private state: MatchState;
  private readonly pendingCommands: MatchCommand[] = [];
  private readonly snapshotLimitBytes: number;

  constructor(options: SimulationOptions) {
    this.state = createInitialState(options.seed);
    this.snapshotLimitBytes = options.snapshotLimitBytes ?? 64 * 1024;
    this.updateChecksum();
  }

  get tick(): number {
    return this.state.tick;
  }

  get seed(): number {
    return this.state.seed;
  }

  snapshot(): MatchSnapshot {
    const snapshot = snapshotState(this.state);
    const byteCount = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    if (byteCount >= this.snapshotLimitBytes) throw new Error(`Snapshot exceeds ${this.snapshotLimitBytes} bytes`);
    return snapshot;
  }

  checksum(): string {
    return this.state.checksum;
  }

  readState(): MatchSnapshot {
    return this.snapshot();
  }

  queueCommand(input: Omit<MatchCommand, "id" | "tick"> & Partial<Pick<MatchCommand, "tick">>): MatchCommand {
    const command: MatchCommand = {
      ...input,
      id: this.state.nextCommandId,
      tick: input.tick ?? this.state.tick + 1,
      entityIds: [...input.entityIds].sort((left, right) => left - right),
    };
    if (command.tick <= this.state.tick) throw new Error("Commands must target a future tick");
    this.state.nextCommandId += 1;
    this.pendingCommands.push(command);
    this.pendingCommands.sort(compareCommands);
    return { ...command, entityIds: [...command.entityIds] };
  }

  step(): SimulationEvent[] {
    const nextTick = this.state.tick + 1;
    const events: SimulationEvent[] = [];
    while (this.pendingCommands.length > 0 && this.pendingCommands[0]?.tick === nextTick) {
      const command = this.pendingCommands.shift();
      if (!command) break;
      this.applyCommand(command);
      events.push({ type: "commandApplied", tick: nextTick, commandId: command.id });
    }
    this.moveUnits();
    this.state.tick = nextTick;
    this.updateChecksum();
    return events;
  }

  run(ticks: number): void {
    for (let index = 0; index < ticks; index += 1) this.step();
  }

  openFracture(): SimulationEvent {
    this.state.fractureOpen = true;
    this.updateChecksum();
    return { type: "fractureOpened", tick: this.state.tick };
  }

  restore(snapshot: MatchSnapshot): void {
    this.state = restoreState(snapshot);
    this.pendingCommands.length = 0;
    this.updateChecksum();
  }

  exportPendingCommands(): MatchCommand[] {
    return this.pendingCommands.map((command) => ({ ...command, entityIds: [...command.entityIds] }));
  }

  private applyCommand(command: MatchCommand): void {
    const units = command.entityIds.map((id) => this.state.units.find((unit) => unit.id === id)).filter((unit): unit is UnitState => unit !== undefined && unit.faction === command.issuer);
    if (command.type === "select") {
      for (const unit of this.state.units) unit.selected = false;
      for (const unit of units) unit.selected = true;
      return;
    }
    if (command.type === "move" && command.targetXQ10 !== undefined && command.targetYQ10 !== undefined) {
      for (const unit of units) {
        unit.targetXQ10 = command.targetXQ10;
        unit.targetYQ10 = command.targetYQ10;
      }
    }
  }

  private moveUnits(): void {
    for (const unit of this.state.units) {
      const target: FixedPoint2 = { x: unit.targetXQ10, y: unit.targetYQ10 };
      const position: FixedPoint2 = { x: unit.xQ10, y: unit.yQ10 };
      const deltaX = target.x - position.x;
      const deltaY = target.y - position.y;
      if (deltaX === 0 && deltaY === 0) continue;
      const remainder = { x: unit.remainderX, y: unit.remainderY };
      const step = fixedMovementStep(deltaX, deltaY, unit.faction === "sunwoven" ? 143 : 125, remainder);
      const applied = clampToTarget(position, target, step);
      if (distanceSquared(applied, target) <= square(2)) {
        unit.xQ10 = target.x;
        unit.yQ10 = target.y;
        unit.remainderX = 0;
        unit.remainderY = 0;
      } else {
        unit.xQ10 = applied.x;
        unit.yQ10 = applied.y;
        unit.remainderX = remainder.x;
        unit.remainderY = remainder.y;
      }
    }
  }

  private updateChecksum(): void {
    let hash = 0x811c9dc5;
    const append = (value: string | number | boolean): void => {
      const text = String(value);
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      hash ^= 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    };
    append(this.state.seed);
    append(this.state.tick);
    append(this.state.fractureOpen);
    for (const unit of [...this.state.units].sort((left, right) => left.id - right.id)) {
      append(unit.id); append(unit.faction); append(unit.kind); append(unit.xQ10); append(unit.yQ10); append(unit.targetXQ10); append(unit.targetYQ10); append(unit.health); append(unit.selected);
    }
    const prng = this.state.prng.snapshot();
    for (const stream of [prng.event, prng.ai, prng.finalPriority]) { append(stream.algorithm); append(stream.seed); append(stream.state); append(stream.cursor); }
    this.state.checksum = (hash >>> 0).toString(16).padStart(8, "0");
  }
}

export function createFoundationSimulation(seed = 0x4d455249): Simulation {
  return new Simulation({ seed });
}

export function factionUnits(snapshot: MatchSnapshot, faction: Faction): MatchSnapshot["units"] {
  return snapshot.units.filter((unit) => unit.faction === faction);
}
