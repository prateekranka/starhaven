import * as THREE from "three";
import { ARENA_V1 } from "../game/content/arena.v1";

export function createTerrain(): THREE.Group {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(48, 32), new THREE.MeshBasicMaterial({ color: 0x17233a }));
  group.add(ground);
  const laneMaterial = new THREE.MeshBasicMaterial({ color: 0x263c54, transparent: true, opacity: 0.72 });
  for (const [index, cell] of ARENA_V1.cells.entries()) {
    if (cell.terrain !== "lane") continue;
    const x = index % ARENA_V1.width - ARENA_V1.width / 2 + 0.5;
    const y = Math.floor(index / ARENA_V1.width) - ARENA_V1.height / 2 + 0.5;
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), laneMaterial);
    tile.position.set(x, y, 0.02);
    group.add(tile);
  }
  return group;
}
