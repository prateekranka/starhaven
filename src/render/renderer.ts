import * as THREE from "three";
import { isNativeRuntimeOrigin, pixelRatioForQuality, type RenderQuality } from "./performance-budget";

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  quality?: RenderQuality;
}

export class StarhavenRenderer {
  readonly renderer: THREE.WebGLRenderer;

  constructor(options: RendererOptions) {
    const quality = options.quality ?? "high";
    const nativeOrigin = isNativeRuntimeOrigin();
    const pixelRatio = pixelRatioForQuality(globalThis.devicePixelRatio || 1, quality, nativeOrigin);
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: options.antialias ?? (!nativeOrigin && pixelRatio < 2),
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!this.renderer.capabilities.isWebGL2) throw new Error("Starhaven requires WebGL2");
    if (this.renderer.capabilities.maxTextureSize < 2_048) throw new Error("Starhaven requires MAX_TEXTURE_SIZE >= 2048");
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  setQuality(quality: RenderQuality): void {
    this.renderer.setPixelRatio(pixelRatioForQuality(globalThis.devicePixelRatio || 1, quality, isNativeRuntimeOrigin()));
  }

  pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
