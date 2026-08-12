import { BALANCE_V1 } from "../content/balance.v1";
import type { UnitKind } from "../content/schema";
import { distanceSquared, type FixedPoint2 } from "./fixed";

export interface CombatUnit {
  id: number;
  kind: UnitKind;
  health: number;
  maxHealth: number;
  xQ10: number;
  yQ10: number;
  faction: "sunwoven" | "gravemark";
}

export interface AttackState {
  attackerId: number;
  targetId: number;
  startedTick: number;
  lastDamageTick: number;
  active: boolean;
}

export interface DamageEvent {
  attackerId: number;
  targetId: number;
  damage: number;
  tick: number;
  attackFrame: 3;
  splashTargetIds: number[];
}

export interface LungeState {
  attackerId: number;
  targetId: number;
  active: boolean;
  startedTick: number;
  chargeTicks: number;
  directionXQ15: number;
  directionYQ15: number;
  cooldownReadyTick: number;
}

export function startAttack(attacker: CombatUnit, target: CombatUnit, currentTick: number): AttackState {
  if (attacker.faction === target.faction) throw new Error("Friendly units cannot be attack targets");
  return { attackerId: attacker.id, targetId: target.id, startedTick: currentTick, lastDamageTick: -1, active: true };
}

export function resolveAttackTick(attack: AttackState, attacker: CombatUnit | undefined, units: readonly CombatUnit[], currentTick: number): DamageEvent | null {
  if (!attack.active || !attacker || attacker.health <= 0) return null;
  const target = units.find((unit) => unit.id === attack.targetId);
  if (!target || target.health <= 0 || target.faction === attacker.faction) return null;
  const definition = BALANCE_V1.units[attacker.kind];
  const elapsed = currentTick - attack.startedTick;
  const firstHit = elapsed === BALANCE_V1.attack.damageTickOffset;
  const repeatHit = elapsed > BALANCE_V1.attack.damageTickOffset && attack.lastDamageTick >= 0 && currentTick - attack.lastDamageTick >= definition.cadenceTicks;
  if (!firstHit && !repeatHit) return null;
  attack.lastDamageTick = currentTick;
  const splashTargetIds: number[] = [];
  target.health = Math.max(0, target.health - definition.damage);
  if (attacker.kind === "riftCannon") {
    const splashRadiusQ10 = BALANCE_V1.units.riftCannon.splashRadiusQ10;
    for (const nearby of units) {
      if (nearby.id === target.id || nearby.faction === attacker.faction || nearby.health <= 0) continue;
      if (distanceSquared({ x: nearby.xQ10, y: nearby.yQ10 }, { x: target.xQ10, y: target.yQ10 }) <= splashRadiusQ10 * splashRadiusQ10) {
        nearby.health = Math.max(0, nearby.health - Math.trunc(definition.damage / 2));
        splashTargetIds.push(nearby.id);
      }
    }
  }
  return { attackerId: attacker.id, targetId: target.id, damage: definition.damage, tick: currentTick, attackFrame: 3, splashTargetIds };
}

export function canStartStoneguardLunge(attacker: CombatUnit, target: CombatUnit, currentTick: number, cooldownReadyTick: number): boolean {
  if (attacker.kind !== "stoneguard" || attacker.faction === target.faction || currentTick < cooldownReadyTick) return false;
  const distance = distanceSquared({ x: attacker.xQ10, y: attacker.yQ10 }, { x: target.xQ10, y: target.yQ10 });
  return distance >= 1_331 * 1_331 && distance <= 4_301 * 4_301;
}

export function startStoneguardLunge(attacker: CombatUnit, target: CombatUnit, currentTick: number, cooldownReadyTick: number): LungeState {
  if (!canStartStoneguardLunge(attacker, target, currentTick, cooldownReadyTick)) throw new Error("Stoneguard Lunge is not valid");
  const deltaX = target.xQ10 - attacker.xQ10;
  const deltaY = target.yQ10 - attacker.yQ10;
  const directionXQ15 = deltaX === 0 ? 0 : deltaX > 0 ? 32_768 : -32_768;
  const directionYQ15 = deltaY === 0 ? 0 : deltaY > 0 ? 32_768 : -32_768;
  return { attackerId: attacker.id, targetId: target.id, active: true, startedTick: currentTick, chargeTicks: 0, directionXQ15, directionYQ15, cooldownReadyTick: currentTick + 160 };
}

export function advanceStoneguardLunge(lunge: LungeState, attacker: CombatUnit | undefined, target: CombatUnit | undefined, currentTick: number): boolean {
  if (!lunge.active || !attacker || !target || attacker.health <= 0 || target.health <= 0) return false;
  lunge.chargeTicks += 1;
  const stepQ10 = 251;
  attacker.xQ10 += Math.trunc(lunge.directionXQ15 * stepQ10 / 32_768);
  attacker.yQ10 += Math.trunc(lunge.directionYQ15 * stepQ10 / 32_768);
  const reached = distanceSquared({ x: attacker.xQ10, y: attacker.yQ10 }, { x: target.xQ10, y: target.yQ10 }) <= 1_331 * 1_331;
  if (reached || lunge.chargeTicks >= 12 || currentTick - lunge.startedTick >= 12) lunge.active = false;
  return !lunge.active;
}

export function combatPosition(unit: CombatUnit): FixedPoint2 {
  return { x: unit.xQ10, y: unit.yQ10 };
}
