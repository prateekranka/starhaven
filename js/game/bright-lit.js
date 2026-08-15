import * as THREE from "three";
import { TICKS_PER_SEC } from "../sim/fixed.js";
import { lineX } from "../sim/engine.js";

const BILLBOARD_GEO = new THREE.PlaneGeometry(1, 1);

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform vec2 uScale;
uniform float uPivotY;
uniform vec2 uMapRepeat;
uniform vec2 uMapOffset;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv * uMapRepeat + uMapOffset;
  vec4 worldCenter = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vWorldPos = worldCenter.xyz;

  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 p = position.xy;
  p.y += 0.5 - uPivotY;
  vec3 offset = camRight * (p.x * uScale.x) + camUp * (p.y * uScale.y);
  vec4 mvPos = viewMatrix * worldCenter + vec4((viewMatrix * vec4(offset, 0.0)).xyz, 0.0);
  vec4 mvPosition = mvPos;
  gl_Position = projectionMatrix * mvPos;

  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D map;
uniform float uLineX;
uniform float uBlend;
uniform float uOpacity;
uniform float uGlow;
uniform float uTime;
uniform vec3 uTint;
uniform float uLift;
uniform vec3 uGlowColor;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vec4 tex = texture2D(map, vUv);
  if (tex.a < 0.22) discard;

  float day = 1.0 - smoothstep(uLineX - uBlend, uLineX + uBlend, vWorldPos.x);
  vec3 dayLight = vec3(1.12, 1.04, 0.9);
  vec3 nightLight = vec3(0.5, 0.57, 0.76);
  vec3 lit = mix(nightLight, dayLight, day) * tex.rgb * uTint;
  lit += uLift * tex.rgb * uTint;

  float night = 1.0 - day;
  if (uGlow > 0.01) {
    float pulse = 0.82 + 0.18 * sin(uTime * 2.4 + vWorldPos.x * 0.08 + vWorldPos.z * 0.06);
    lit += uGlowColor * night * uGlow * pulse * 0.72;
  }

  gl_FragColor = vec4(lit, tex.a * uOpacity);
  #include <fog_fragment>
}
`;

const template = new THREE.ShaderMaterial({
  uniforms: {
    map: { value: null },
    uMapRepeat: { value: new THREE.Vector2(1, 1) },
    uMapOffset: { value: new THREE.Vector2(0, 0) },
    uLineX: { value: 0 },
    uBlend: { value: 4.2 },
    uOpacity: { value: 1 },
    uGlow: { value: 0 },
    uTime: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: 0.1 },
    uGlowColor: { value: new THREE.Vector3(1, 0.82, 0.38) },
    uScale: { value: new THREE.Vector2(1, 1) },
    uPivotY: { value: 0.1 },
    fogColor: { value: new THREE.Color() },
    fogNear: { value: 1 },
    fogFar: { value: 2000 },
  },
  vertexShader: VERT,
  fragmentShader: FRAG,
  transparent: true,
  depthWrite: true,
  depthTest: true,
  fog: true,
});

export function brightLineX(world, mapSpan) {
  if (typeof world.brightQ10 === "number") return lineX(world);
  return 4 + (world.bright || 0) * (mapSpan - 8);
}

function cloneLitMaterial(map) {
  const mat = template.clone();
  mat.uniforms.map.value = map;
  return mat;
}

export function syncLitMapUv(mesh) {
  const mat = mesh?.material;
  const tex = mat?.uniforms?.map?.value;
  if (!mat?.uniforms?.uMapRepeat || !tex?.repeat || !tex?.offset) return;
  mat.uniforms.uMapRepeat.value.copy(tex.repeat);
  mat.uniforms.uMapOffset.value.copy(tex.offset);
}

export function createLitBillboard(map, { glow = 0, pivotY = 0.1, opacity = 1, glowColor = [1, 0.82, 0.38], lift = 0.1 } = {}) {
  const mat = cloneLitMaterial(map);
  mat.uniforms.uLift.value = lift;
  mat.uniforms.uGlow.value = glow;
  mat.uniforms.uOpacity.value = opacity;
  mat.uniforms.uPivotY.value = pivotY;
  mat.uniforms.uGlowColor.value.set(glowColor[0], glowColor[1], glowColor[2]);
  if (map?.repeat && map?.offset) {
    mat.uniforms.uMapRepeat.value.copy(map.repeat);
    mat.uniforms.uMapOffset.value.copy(map.offset);
  }

  const mesh = new THREE.Mesh(BILLBOARD_GEO, mat);
  mesh.userData.lit = true;
  mesh.userData.lift = lift;
  mesh.userData.pivotY = pivotY;
  mesh.userData.glow = glow;
  mesh.userData.opacity = opacity;
  mesh.frustumCulled = false;

  mesh.onBeforeRender = () => {
    mat.uniforms.uLift.value = mesh.userData.lift ?? lift;
    mat.uniforms.uScale.value.set(mesh.scale.x, mesh.scale.y);
    mat.uniforms.uPivotY.value = mesh.userData.pivotY ?? pivotY;
    mat.uniforms.uGlow.value = mesh.userData.glow ?? glow;
    mat.uniforms.uOpacity.value = mesh.userData.opacity ?? opacity;
    syncLitMapUv(mesh);
  };
  return mesh;
}

export function syncBrightLineUniforms(scene, world, mapSpan) {
  const lx = brightLineX(world, mapSpan);
  const t = typeof world.brightQ10 === "number" ? world.t / TICKS_PER_SEC : world.t;
  scene.traverse((obj) => {
    const mat = obj.material;
    if (!mat?.uniforms?.uLineX) return;
    mat.uniforms.uLineX.value = lx;
    mat.uniforms.uTime.value = t;
  });
}

export function setLitTint(mesh, r, g, b) {
  const u = mesh.material?.uniforms?.uTint;
  if (u) u.value.set(r, g, b);
}

export function disposeLitBillboard(mesh) {
  if (mesh.material?.uniforms?.map?.value?.userData?.cloned) {
    mesh.material.uniforms.map.value.dispose();
  }
  mesh.material?.dispose?.();
}

export function litMap(mesh) {
  return mesh.material?.uniforms?.map?.value ?? null;
}

export function setLitMap(mesh, map) {
  const u = mesh.material?.uniforms?.map;
  if (u) u.value = map;
}
