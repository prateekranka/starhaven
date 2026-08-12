import * as THREE from "three";
import { worldFromQ10 } from "../game/sim/fixed";
import { PERFORMANCE_BUDGET } from "./performance-budget";

export interface UnitSpriteSnapshot {
  units: ReadonlyArray<{
    id: number;
    faction: "sunwoven" | "gravemark";
    xQ10: number;
    yQ10: number;
    selected: boolean;
  }>;
}

export class UnitSpriteBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly dummy = new THREE.Object3D();
  private readonly maxInstances: number;

  constructor(maxInstances = PERFORMANCE_BUDGET.maxCombinedUnits) {
    this.maxInstances = Math.min(maxInstances, PERFORMANCE_BUDGET.maxCombinedUnits);
    const geometry = new THREE.PlaneGeometry(0.9, 1.2);
    const material = new THREE.MeshBasicMaterial({ color: 0xf8d66d, vertexColors: false, alphaTest: 0.5, depthTest: true, depthWrite: true, transparent: false });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxInstances);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  update(snapshot: UnitSpriteSnapshot, camera: THREE.Camera): void {
    const units = [...snapshot.units].sort((left, right) => left.id - right.id).slice(0, this.maxInstances);
    this.mesh.count = units.length;
    units.forEach((unit, index) => {
      this.dummy.position.set(worldFromQ10(unit.xQ10) - 24, worldFromQ10(unit.yQ10) - 16, 0.72);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.scale.setScalar(unit.selected ? 1.12 : 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
      this.mesh.setColorAt(index, unit.faction === "sunwoven" ? new THREE.Color(0xf8d66d) : new THREE.Color(0xc24b8e));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
