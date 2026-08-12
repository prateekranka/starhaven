import * as THREE from "three";

export interface AtlasFrame {
  id: string;
  action: string;
  facing: string;
  frame: number;
  durationMs: number;
  pivot: { x: 64; y: 112 };
  mirrored: boolean;
}

export interface RuntimeAtlasEntry {
  id: string;
  faction: "sunwoven" | "gravemark";
  full: string;
  half: string;
  width: 2048;
  height: 1280 | 1536;
  frames: AtlasFrame[];
}

export interface RuntimeManifest {
  version: "runtime-manifest.v1";
  sourceCount: 330;
  maxTextureSize: 2048;
  atlases: RuntimeAtlasEntry[];
}

export function prepareAtlasTexture(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function assertAtlasCapacity(renderer: THREE.WebGLRenderer): void {
  if (!renderer.capabilities.isWebGL2 || renderer.capabilities.maxTextureSize < 2_048) throw new Error("The target does not meet the Starhaven atlas floor");
}

export function atlasPath(entry: RuntimeAtlasEntry, zoom: 32 | 64 | 128): string {
  return zoom === 32 ? entry.half : entry.full;
}
