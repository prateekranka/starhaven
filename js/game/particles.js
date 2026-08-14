import * as THREE from "three";
import { worldFromQ10 } from "../sim/fixed.js";

const ADD_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (220.0 / max(8.0, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const ADD_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = dot(c, c);
  if (d > 0.25) discard;
  float soft = 1.0 - smoothstep(0.12, 0.25, d);
  gl_FragColor = vec4(vColor, vAlpha * soft);
}
`;

const ALPHA_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = dot(c, c);
  if (d > 0.25) discard;
  float soft = 1.0 - smoothstep(0.14, 0.25, d);
  gl_FragColor = vec4(vColor, vAlpha * soft * 0.85);
}
`;

function makePointsLayer(max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const sizes = new Float32Array(max);
  const colors = new Float32Array(max * 3);
  const alphas = new Float32Array(max);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  geo.setDrawRange(0, 0);

  const mat = new THREE.ShaderMaterial({
    vertexShader: ADD_VERT,
    fragmentShader: additive ? ADD_FRAG : ALPHA_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, pos, sizes, colors, alphas, geo };
}

const GATHER_COLORS = {
  food: [1, 0.82, 0.28],
  wood: [0.72, 0.52, 0.28],
  crystal: [0.45, 0.92, 1],
  ore: [0.82, 0.78, 0.72],
};

/**
 * Pooled GPU particles: gather sparks, combat hits, construction dust, ambient motes.
 * Two Points batches (additive + alpha) => 2 draw calls regardless of particle count.
 */
export function createParticleSystem(scene, sampleH, maxParticles = 512, mapSpan = 96) {
  const maxAdd = Math.ceil(maxParticles * 0.62);
  const maxAlpha = maxParticles - maxAdd;
  const addLayer = makePointsLayer(maxAdd, true);
  const alphaLayer = makePointsLayer(maxAlpha, false);
  scene.add(addLayer.points);
  scene.add(alphaLayer.points);

  const pool = [];
  for (let i = 0; i < maxParticles; i++) {
    pool.push({
      active: false,
      additive: true,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
      size: 0.2,
      r: 1,
      g: 1,
      b: 1,
      alpha: 1,
      drag: 0.92,
      gravity: 0,
    });
  }
  let addUsed = 0;
  let alphaUsed = 0;
  let ambientAcc = 0;

  function layerUsed(additive) {
    let n = 0;
    for (const p of pool) {
      if (p.active && p.additive === additive) n++;
    }
    return n;
  }

  function spawn(p) {
    const additive = p.additive !== false;
    if (layerUsed(additive) >= (additive ? maxAdd : maxAlpha)) return null;
    const free = pool.find((q) => !q.active);
    if (!free) return null;
    Object.assign(free, p, { active: true, additive });
    return free;
  }

  function emitGather(x, z, kind) {
    const col = GATHER_COLORS[kind] || GATHER_COLORS.food;
    const y = sampleH(x, z) + 0.6;
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      spawn({
        additive: true,
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + Math.random() * 0.4,
        z: z + (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 1.2 + Math.random() * 1.6,
        vz: (Math.random() - 0.5) * 1.4,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 0.22 + Math.random() * 0.14,
        r: col[0],
        g: col[1],
        b: col[2],
        alpha: 0.9,
        drag: 0.9,
        gravity: -1.8,
      });
    }
  }

  function emitHit(x, z, dmg = 10) {
    const y = sampleH(x, z) + 0.85;
    const n = 5 + Math.min(8, (dmg / 4) | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.8;
      spawn({
        additive: true,
        x,
        y: y + Math.random() * 0.35,
        z,
        vx: Math.cos(a) * sp,
        vy: 0.6 + Math.random() * 1.8,
        vz: Math.sin(a) * sp,
        life: 0.18 + Math.random() * 0.22,
        maxLife: 0.4,
        size: 0.18 + Math.random() * 0.16,
        r: 1,
        g: 0.45 + Math.random() * 0.25,
        b: 0.18,
        alpha: 0.95,
        drag: 0.86,
        gravity: -3.2,
      });
    }
  }

  function emitBuild(x, z) {
    const y = sampleH(x, z) + 0.25;
    const n = 4 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      spawn({
        additive: false,
        x: x + (Math.random() - 0.5) * 1.2,
        y: y + Math.random() * 0.2,
        z: z + (Math.random() - 0.5) * 1.2,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.4 + Math.random() * 0.9,
        vz: (Math.random() - 0.5) * 0.8,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        size: 0.28 + Math.random() * 0.18,
        r: 0.62 + Math.random() * 0.12,
        g: 0.5 + Math.random() * 0.1,
        b: 0.34,
        alpha: 0.55,
        drag: 0.94,
        gravity: -0.6,
      });
    }
  }

  function emitAmbient(world) {
    if (addUsed >= maxAdd - 4 && alphaUsed >= maxAlpha - 4) return;
    const t = world.t;
    let x;
    let z;
    if (Math.random() < 0.35) {
      const nodes = world.resources.filter((r) => r.kind === "crystal" || r.kind === "void");
      if (!nodes.length) return;
      const r = nodes[(Math.random() * nodes.length) | 0];
      x = worldFromQ10(r.xQ10) + (Math.random() - 0.5) * 1.5;
      z = worldFromQ10(r.zQ10) + (Math.random() - 0.5) * 1.5;
    } else {
      x = 8 + Math.random() * (mapSpan - 16);
      z = 8 + Math.random() * (mapSpan - 16);
    }
    const y = sampleH(x, z) + 0.5 + Math.random() * 1.8;
    const crystal = Math.random() < 0.45;
    spawn({
      additive: crystal,
      x,
      y,
      z,
      vx: Math.sin(t + x) * 0.08,
      vy: 0.12 + Math.random() * 0.18,
      vz: Math.cos(t + z) * 0.08,
      life: 2.5 + Math.random() * 3.5,
      maxLife: 6,
      size: crystal ? 0.14 + Math.random() * 0.1 : 0.18 + Math.random() * 0.12,
      r: crystal ? 0.45 : 0.95,
      g: crystal ? 0.88 : 0.82,
      b: crystal ? 1 : 0.45,
      alpha: crystal ? 0.45 : 0.32,
      drag: 0.995,
      gravity: 0.05,
    });
  }

  function flushLayer(layer, max, additive) {
    const { pos, sizes, colors, alphas, geo } = layer;
    let i = 0;
    for (const p of pool) {
      if (!p.active || p.additive !== additive) continue;
      if (i >= max) break;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      sizes[i] = p.size;
      colors[i * 3] = p.r;
      colors[i * 3 + 1] = p.g;
      colors[i * 3 + 2] = p.b;
      alphas[i] = p.alpha * Math.max(0, p.life / p.maxLife);
      i++;
    }
    geo.setDrawRange(0, i);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    return i;
  }

  return {
    tick(world, dt = 0.016) {
      for (const ev of world.vfxEvents || []) {
        if (ev.kind === "gather") emitGather(ev.x, ev.z, ev.sub || ev.kind);
        else if (ev.kind === "hit") emitHit(ev.x, ev.z, ev.dmg || 10);
        else if (ev.kind === "build") emitBuild(ev.x, ev.z);
      }
      if (world.vfxEvents?.length) world.vfxEvents.length = 0;

      ambientAcc += dt;
      const ambientRate = 0.14;
      while (ambientAcc >= ambientRate) {
        ambientAcc -= ambientRate;
        emitAmbient(world);
      }

      for (const p of pool) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.vy += p.gravity * dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vz *= p.drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }

      addUsed = flushLayer(addLayer, maxAdd, true);
      alphaUsed = flushLayer(alphaLayer, maxAlpha, false);
    },
    stats() {
      return { active: addUsed + alphaUsed, add: addUsed, alpha: alphaUsed, drawCalls: 2 };
    },
    dispose() {
      scene.remove(addLayer.points);
      scene.remove(alphaLayer.points);
      addLayer.geo.dispose();
      alphaLayer.geo.dispose();
      addLayer.points.material.dispose();
      alphaLayer.points.material.dispose();
    },
  };
}
