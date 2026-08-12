import * as THREE from "three";

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
}

export class StarhavenRenderer {
  readonly renderer: THREE.WebGLRenderer;

  constructor(options: RendererOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: options.antialias ?? true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!this.renderer.capabilities.isWebGL2) throw new Error("Starhaven requires WebGL2");
    if (this.renderer.capabilities.maxTextureSize < 2_048) throw new Error("Starhaven requires MAX_TEXTURE_SIZE >= 2048");
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
