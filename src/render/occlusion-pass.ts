import * as THREE from "three";
import { BALANCE_V1 } from "../game/content/balance.v1";
import type { Faction } from "../game/content/schema";
import { distanceSquared, q10FromWorld, worldFromQ10 } from "../game/sim/fixed";
import type { SkirmishSnapshot } from "../game/sim/match";

const WORLD_OFFSET_X = 24;
const WORLD_OFFSET_Y = 16;
const MAX_SILHOUETTES = 36;

export class OcclusionSilhouettePass {
  readonly group = new THREE.Group();
  private readonly markers: THREE.Mesh[] = [];
  private readonly geometry = new THREE.RingGeometry(0.52, 0.62, 8);

  constructor() {
    this.group.renderOrder = 30;
    for (let index = 0; index < MAX_SILHOUETTES; index += 1) {
      const marker = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: 0xf8d66d, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
      marker.visible = false;
      marker.renderOrder = 30;
      this.markers.push(marker);
      this.group.add(marker);
    }
  }

  update(snapshot: SkirmishSnapshot, faction: Faction, selectedIds: ReadonlySet<number>): void {
    const visible = new Map<number, { xQ10: number; yQ10: number; color: number; scale: number }>();
    const ownCombat = snapshot.units.filter((unit) => unit.faction === faction && unit.health > 0 && unit.kind !== "loomkeeper" && unit.kind !== "prospector");
    for (const unit of snapshot.units) {
      if (unit.health <= 0) continue;
      if (unit.faction === faction && (unit.selected || selectedIds.has(unit.id))) visible.set(unit.id, { xQ10: unit.xQ10, yQ10: unit.yQ10, color: 0xf8d66d, scale: 1.15 });
      if (unit.faction !== faction && ownCombat.some((own) => {
        const rangeQ10 = BALANCE_V1.units[own.kind].rangeQ10 + q10FromWorld(0.5);
        return distanceSquared({ x: own.xQ10, y: own.yQ10 }, { x: unit.xQ10, y: unit.yQ10 }) <= rangeQ10 * rangeQ10;
      })) {
        visible.set(10_000 + unit.id, { xQ10: unit.xQ10, yQ10: unit.yQ10, color: unit.health * 4 < unit.maxHealth ? 0xff7b6b : 0xc24b8e, scale: 1.04 });
      }
      if (unit.faction === faction && (unit.targetXQ10 !== unit.xQ10 || unit.targetYQ10 !== unit.yQ10)) {
        visible.set(20_000 + unit.id, { xQ10: unit.targetXQ10, yQ10: unit.targetYQ10, color: 0x55e6f2, scale: 0.7 });
      }
    }
    [...visible.values()].slice(0, MAX_SILHOUETTES).forEach((value, index) => {
      const marker = this.markers[index];
      if (!marker) return;
      marker.visible = true;
      marker.position.set(worldFromQ10(value.xQ10) - WORLD_OFFSET_X, worldFromQ10(value.yQ10) - WORLD_OFFSET_Y, 1.1);
      marker.scale.setScalar(value.scale);
      (marker.material as THREE.MeshBasicMaterial).color.set(value.color);
    });
    for (let index = visible.size; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      if (marker) marker.visible = false;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.markers.forEach((marker) => {
      if (Array.isArray(marker.material)) marker.material.forEach((material) => material.dispose());
      else marker.material.dispose();
    });
  }
}
