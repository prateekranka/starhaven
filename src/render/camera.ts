import * as THREE from "three";

export const DIMETRIC_PITCH_DEGREES = 26.565;
export const DIMETRIC_PITCH_RADIANS = 0.463647609;
export const DIMETRIC_YAW_DEGREES = 0;
export const ZOOM_LEVELS = [32, 64, 128] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export class DimetricCamera {
  readonly camera: THREE.OrthographicCamera;
  private zoomLevel: ZoomLevel = 64;
  private viewportWidth = 1;
  private viewportHeight = 1;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    this.camera.position.set(0, -80, 40);
    this.camera.rotation.order = "YXZ";
    // Three.js measures X rotation from the camera's vertical view axis.
    this.camera.rotation.x = Math.PI / 2 - DIMETRIC_PITCH_RADIANS;
    this.camera.rotation.y = 0;
    this.camera.rotation.z = 0;
    this.updateProjection();
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.updateProjection();
  }

  setZoom(level: ZoomLevel): void {
    this.zoomLevel = level;
    this.updateProjection();
  }

  zoom(): ZoomLevel {
    return this.zoomLevel;
  }

  pan(worldX: number, worldY: number): void {
    this.camera.position.x += worldX;
    this.camera.position.y += worldY;
  }

  private updateProjection(): void {
    const halfWidth = this.viewportWidth / this.zoomLevel / 2;
    const halfHeight = this.viewportHeight / this.zoomLevel / 2;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }
}
