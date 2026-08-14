import * as THREE from "three";
import { N, CELL, inLight } from "../sim/engine.js";
import { pixelRatioFor, resolveQuality, backingLabel, isSoftwareGL, glRendererName } from "../perf.js";
import { cachedImage } from "../cache/assets.js";

const MAP = N * CELL;
THREE.Cache.enabled = true;
const loader = new THREE.TextureLoader();

function pix(url, repeat = 0) {
  const img = cachedImage(url);
  const t = img ? new THREE.Texture(img) : loader.load(url);
  if (img) {
    t.needsUpdate = !!img.complete;
    if (!img.complete) {
      img.addEventListener("load", () => {
        t.needsUpdate = true;
      }, { once: true });
    }
  }
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.anisotropy = 1;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z, oct = 5) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += noise(x * f, z * f) * amp;
    f *= 2.05;
    amp *= 0.5;
  }
  return sum;
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function landH(x, z) {
  const nx = Math.min(x, MAP - x);
  const nz = Math.min(z, MAP - z);
  const rim = Math.min(nx, nz);
  const wx = x + fbm(x * 0.04, z * 0.04, 3) * 5;
  const wz = z + fbm(x * 0.04 + 19, z * 0.04 - 11, 3) * 5;
  let h = 1.9 * smoothstep(2.4, 10, rim);
  h += (fbm(wx * 0.055, wz * 0.055, 4) - 0.42) * 0.4;
  if (rim > 11) {
    const crater = Math.hypot(x / MAP - 0.48, z / MAP - 0.44);
    h -= Math.max(0, 0.16 - crater * 6.5) * 0.55;
  }
  return Math.max(0, h);
}

const HS = 160;
let heightLUT = null;
function buildHeightLut() {
  heightLUT = new Float32Array((HS + 1) * (HS + 1));
  const stride = HS + 1;
  for (let z = 0; z <= HS; z++) {
    for (let x = 0; x <= HS; x++) {
      heightLUT[z * stride + x] = landH((x / HS) * MAP, (z / HS) * MAP);
    }
  }
}

export function sampleH(x, z) {
  if (!heightLUT) buildHeightLut();
  const u = Math.max(0, Math.min(HS, (x / MAP) * HS));
  const v = Math.max(0, Math.min(HS, (z / MAP) * HS));
  const x0 = u | 0;
  const z0 = v | 0;
  const x1 = Math.min(HS, x0 + 1);
  const z1 = Math.min(HS, z0 + 1);
  const tx = u - x0;
  const tz = v - z0;
  const stride = HS + 1;
  const a = heightLUT[z0 * stride + x0];
  const b = heightLUT[z0 * stride + x1];
  const c = heightLUT[z1 * stride + x0];
  const d = heightLUT[z1 * stride + x1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

const WALK_STATES = new Set(["walk", "gatherwalk", "return", "buildwalk", "attackmove"]);
const ATLAS_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const SHEET_ROW_TO_FACING = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"];
const SUN_GUARD_ATLAS_META = {
  id: "sun-guard",
  cols: 16,
  rows: 6,
  clips: [
    { id: "walk", frames: 4, durationMs: 110, loop: true },
    { id: "attack", frames: 4, durationMs: 100, loop: false },
    { id: "death", frames: 4, durationMs: 100, loop: false },
  ],
};

let sunGuardAtlas = SUN_GUARD_ATLAS_META;
fetch("media/sprites/sun-guard.atlas.json", { cache: "no-cache" })
  .then((res) => (res.ok ? res.json() : null))
  .then((json) => {
    if (json?.id === "sun-guard") sunGuardAtlas = json;
  })
  .catch(() => {});

function dirRow(facing, southFirst = false) {
  const two = Math.PI * 2;
  let a = facing % two;
  if (a < 0) a += two;
  const oct = Math.round(a / (Math.PI / 4)) % 8;
  let row = [4, 3, 2, 1, 0, 7, 6, 5][oct];
  if (southFirst) row = (row + 4) % 8;
  return row;
}

function setFrame(tex, col, row, cols = 8, rows = 8) {
  const w = tex.image?.width || cols * 128;
  const pad = 0.5 / w;
  tex.repeat.set(1 / cols - pad * 2, 1 / rows - pad * 2);
  tex.offset.set(col / cols + pad, 1 - (row + 1) / rows + pad);
  if (tex.matrixAutoUpdate) tex.updateMatrix();
}

function atlasCell(meta, action, sheetRow, frameIdx) {
  const facing = SHEET_ROW_TO_FACING[sheetRow] || "S";
  const directionIndex = ATLAS_DIRECTIONS.indexOf(facing);
  const actionIndex = meta.clips.findIndex((c) => c.id === action);
  return {
    col: directionIndex * 2 + (frameIdx % 2),
    row: actionIndex * 2 + Math.floor(frameIdx / 2),
  };
}

function pipelineAction(u, moving, dying) {
  if (dying) return "death";
  if (u.state === "attack") return "attack";
  if (moving || WALK_STATES.has(u.state)) return "walk";
  return "walk";
}

function cloneSheet(base) {
  const t = base.clone();
  t.needsUpdate = true;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.userData.cloned = true;
  setFrame(t, 0, 4);
  return t;
}

function spriteMat(map, { additive = false } = {}) {
  return new THREE.SpriteMaterial({
    map,
    transparent: true,
    alphaTest: 0.22,
    depthWrite: !additive,
    depthTest: true,
    sizeAttenuation: true,
    toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function fitWhenReady(sprite, map, height) {
  const apply = () => {
    const img = map.image;
    if (!img?.width) return false;
    const a = img.width / Math.max(1, img.height);
    sprite.userData.baseScale = height;
    sprite.userData.aspect = a;
    sprite.scale.set(height * a, height, 1);
    return true;
  };
  if (apply()) return;
  const id = setInterval(() => {
    if (apply()) clearInterval(id);
  }, 40);
  setTimeout(() => clearInterval(id), 5000);
}

export function createRenderer(container, quality = "ultra", opts = {}) {
  if (!heightLUT) buildHeightLut();
  let q = resolveQuality(quality);
  const reduceMotion = !!(opts.reduceMotion || (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#5aa0d8");
  scene.fog = new THREE.Fog("#7eb6e8", 110, 240);

  const aspect = container.clientWidth / Math.max(1, container.clientHeight);
  const frustum = 22;
  const FRUSTUM_MIN = 14;
  const FRUSTUM_MAX = 48;
  const camera = new THREE.OrthographicCamera(
    (-frustum * aspect) / 2,
    (frustum * aspect) / 2,
    frustum / 2,
    -frustum / 2,
    0.1,
    400
  );
  camera.up.set(0, 1, 0);
  const camTarget = new THREE.Vector3(MAP * 0.2, 0, MAP * 0.78);
  const camDesired = camTarget.clone();
  const camOffset = new THREE.Vector3(-28, 36, 28);
  camera.position.copy(camTarget).add(camOffset);
  camera.lookAt(camTarget);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
  });
  const software = isSoftwareGL(renderer);
  const gpuName = glRendererName(renderer);
  let adaptiveScale = software ? 0.55 : 1;
  let appliedRatio = 0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = software ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = software ? 1 : 1.04;
  renderer.sortObjects = true;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.imageRendering = "auto";
  renderer.domElement.style.touchAction = "none";

  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x6a4a28, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d0, 1.05);
  sun.position.set(40, 55, 10);
  scene.add(sun);

  const sandMap = pix("media/textures/pixel-mesa.png", 16);
  const waterMap = pix("media/textures/pixel-water.png", 18);
  const sheets = {
    sunWalk: pix("media/sprites/sheet-sunwoven-walk.png"),
    graveWalk: pix("media/sprites/sheet-gravemark-walk.png"),
    sunGuard: pix("media/sprites/sheet-sun-guard.png"),
    sunGuardAtlas: pix("media/sprites/sun-guard.atlas.png"),
    graveGuard: pix("media/sprites/sheet-grave-guard.png"),
  };
  const stills = {
    sunStrider: pix("media/sprites/unit-sun-strider.png"),
    graveStrider: pix("media/sprites/unit-grave-strider.png"),
    sunSiege: pix("media/sprites/unit-sun-siege.png"),
    graveSiege: pix("media/sprites/unit-grave-siege.png"),
  };
  const bldg = {
    sun: {
      towncenter: pix("media/sprites/bldg-sun-tc.png"),
      house: pix("media/sprites/bldg-sun-house.png"),
      barracks: pix("media/sprites/bldg-sun-rax.png"),
      mill: pix("media/sprites/bldg-sun-mill.png"),
      lumber: pix("media/sprites/bldg-sun-mill.png"),
      mine: pix("media/sprites/bldg-sun-mill.png"),
      spire: pix("media/sprites/bldg-sun-rax.png"),
      den: pix("media/sprites/bldg-sun-rax.png"),
      workshop: pix("media/sprites/bldg-sun-rax.png"),
      wonder: pix("media/sprites/bldg-sun-wonder.png"),
    },
    grave: {
      towncenter: pix("media/sprites/bldg-grave-tc.png"),
      house: pix("media/sprites/bldg-grave-house.png"),
      barracks: pix("media/sprites/bldg-grave-rax.png"),
      mill: pix("media/sprites/bldg-grave-mill.png"),
      lumber: pix("media/sprites/bldg-grave-mill.png"),
      mine: pix("media/sprites/bldg-grave-mill.png"),
      spire: pix("media/sprites/bldg-grave-rax.png"),
      den: pix("media/sprites/bldg-grave-rax.png"),
      workshop: pix("media/sprites/bldg-grave-rax.png"),
      wonder: pix("media/sprites/bldg-grave-wonder.png"),
    },
  };
  const nodes = {
    food: pix("media/sprites/node-food.png"),
    wood: pix("media/sprites/node-trees.png"),
    crystal: pix("media/sprites/node-crystal.png"),
    ore: pix("media/sprites/node-ore.png"),
    void: pix("media/sprites/node-void.png"),
  };

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP * 2.4, MAP * 2.4, 1, 1),
    new THREE.MeshBasicMaterial({ map: waterMap, color: 0xffffff, toneMapped: false })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(MAP / 2, -0.28, MAP / 2);
  scene.add(water);

  const terrain = buildMesa(sandMap, q.terrain, true);
  scene.add(terrain);

  addSky(scene, true);
  addPlanet(scene, q.terrain >= 72);

  const fogCanvas = document.createElement("canvas");
  fogCanvas.width = N;
  fogCanvas.height = N;
  const fogCtx = fogCanvas.getContext("2d", { willReadFrequently: true });
  const fogImg = fogCtx.createImageData(N, N);
  const fogTex = new THREE.CanvasTexture(fogCanvas);
  fogTex.magFilter = THREE.LinearFilter;
  fogTex.minFilter = THREE.LinearFilter;
  fogTex.generateMipmaps = false;
  const fogPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP, MAP),
    new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, opacity: 0.88, depthWrite: false, toneMapped: false })
  );
  fogPlane.rotation.x = -Math.PI / 2;
  fogPlane.position.set(MAP / 2, 2.6, MAP / 2);
  scene.add(fogPlane);

  const lineGeo = new THREE.PlaneGeometry(2.8, MAP * 1.2);
  const lineMat = new THREE.MeshBasicMaterial({
    color: 0x9af6ff,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const brightLine = new THREE.Mesh(lineGeo, lineMat);
  brightLine.rotation.x = -Math.PI / 2;
  brightLine.position.y = 1.15;
  scene.add(brightLine);

  const meshes = new Map();
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide, transparent: true, opacity: 0.95, toneMapped: false });
  const ringGeo = new THREE.RingGeometry(0.5, 0.72, 32);
  const rings = Array.from({ length: 24 }, () => {
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.rotation.x = -Math.PI / 2;
    r.visible = false;
    scene.add(r);
    return r;
  });
  const shadowGeo = new THREE.CircleGeometry(0.62, 22);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x120c08, transparent: true, opacity: 0.52, depthWrite: false, toneMapped: false });
  const corpses = new Map();

  const ghost = new THREE.Sprite(spriteMat(bldg.sun.house));
  ghost.center.set(0.5, 0.12);
  ghost.visible = false;
  ghost.material.opacity = 0.45;
  ghost.material.alphaTest = 0.05;
  fitWhenReady(ghost, bldg.sun.house, 4.2);
  scene.add(ghost);

  const vfx = makeVfx(scene, q.vfx);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let frustumLive = frustum;
  let frustumDesired = frustum;

  function applyBacking(force = false) {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
        const ratio = pixelRatioFor(w, h, software ? "medium" : quality, adaptiveScale);
    if (!force && Math.abs(ratio - appliedRatio) < 0.035) {
      const a = w / h;
      camera.left = (-frustumLive * a) / 2;
      camera.right = (frustumLive * a) / 2;
      camera.top = frustumLive / 2;
      camera.bottom = -frustumLive / 2;
      camera.updateProjectionMatrix();
      return;
    }
    appliedRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    renderer.domElement.style.imageRendering = ratio < 1.15 ? "pixelated" : "auto";
    const a = w / h;
    camera.left = (-frustumLive * a) / 2;
    camera.right = (frustumLive * a) / 2;
    camera.top = frustumLive / 2;
    camera.bottom = -frustumLive / 2;
    camera.updateProjectionMatrix();
  }

  function resize() {
    applyBacking(true);
  }
  window.addEventListener("resize", resize);
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  applyBacking(true);

  function settleCam(immediate) {
    if (immediate || reduceMotion) camTarget.copy(camDesired);
    camera.position.copy(camTarget).add(camOffset);
    camera.lookAt(camTarget);
  }

  function pan(dx, dz) {
    camDesired.x = THREE.MathUtils.clamp(camDesired.x + dx, 8, MAP - 8);
    camDesired.z = THREE.MathUtils.clamp(camDesired.z + dz, 8, MAP - 8);
    camDesired.y = sampleH(camDesired.x, camDesired.z);
    if (reduceMotion) settleCam(true);
  }

  function setZoom(delta) {
    frustumDesired = THREE.MathUtils.clamp(frustumDesired + delta, FRUSTUM_MIN, FRUSTUM_MAX);
    if (reduceMotion) {
      frustumLive = frustumDesired;
      resize();
    }
  }

  function lookAt(x, z, immediate) {
    camDesired.set(x, sampleH(x, z), z);
    if (immediate || reduceMotion) settleCam(true);
  }

  function groundPick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(terrain)[0] || raycaster.intersectObject(water)[0];
    if (!hit) return null;
    return { x: hit.point.x, z: hit.point.z, sx: clientX - rect.left, sy: clientY - rect.top };
  }

  function sync(world, dt = 0.016) {
    const keep = new Set();
    const selSet = world._selSet || (world._selSet = new Set());
    selSet.clear();
    for (const id of world.selection) selSet.add(id);

    const camK = reduceMotion ? 1 : 1 - Math.pow(0.0008, Math.max(0.001, dt));
    camTarget.lerp(camDesired, camK);
    if (Math.abs(frustumLive - frustumDesired) > 0.01) {
      frustumLive += (frustumDesired - frustumLive) * Math.min(1, dt * 8);
      applyBacking(false);
    }
    settleCam(false);

    waterMap.offset.x = (world.t * 0.018) % 1;
    waterMap.offset.y = (world.t * 0.011) % 1;

    for (const r of world.resources) {
      if (r.kind === "rockblock") continue;
      keep.add("r" + r.id);
      let m = meshes.get("r" + r.id);
      if (!m) {
        m = makeNode(r, nodes);
        meshes.set("r" + r.id, m);
        scene.add(m);
      }
      const y = sampleH(r.x, r.z);
      m.position.set(r.x, y, r.z);
      m.visible = r.amount > 0 && seen(world, r.x, r.z);
      const s = m.userData.baseScale || (r.kind === "wood" ? 4.2 : 3.4);
      const a = m.userData.aspect || 1;
      m.scale.set(s * a, s, 1);
    }
    for (const b of world.buildings) {
      keep.add("b" + b.id);
      let m = meshes.get("b" + b.id);
      if (!m) {
        m = makeBuildingSprite(b, bldg);
        meshes.set("b" + b.id, m);
        scene.add(m);
      }
      const y = sampleH(b.x, b.z);
      m.position.set(b.x, y, b.z);
      const base = (m.userData.baseScale || buildingScale(b.type)) * (0.55 + 0.45 * b.built);
      const a = m.userData.aspect || 1;
      m.scale.set(base * a, base, 1);
      m.material.opacity = 0.55 + 0.45 * b.built;
      m.visible = seen(world, b.x, b.z) || b.owner === "player";
    }
    for (const u of world.units) {
      keep.add("u" + u.id);
      let m = meshes.get("u" + u.id);
      if (!m) {
        m = makeUnitSprite(u, sheets, stills);
        meshes.set("u" + u.id, m);
        scene.add(m);
      }
      const y = sampleH(u.x, u.z);
      m.position.set(u.x, y, u.z);
      animateUnit(m, u, world, dt);
      m.userData.lastFacing = u.facing || 0;
      m.visible = u.owner === "player" || vis(world, u.x, u.z);
      keep.add("sh" + u.id);
      let sh = meshes.get("sh" + u.id);
      if (!sh) {
        sh = new THREE.Mesh(shadowGeo, shadowMat);
        sh.rotation.x = -Math.PI / 2;
        meshes.set("sh" + u.id, sh);
        scene.add(sh);
      }
      sh.position.set(u.x, y + 0.04, u.z);
      sh.visible = m.visible;
    }
    for (const [id, corpse] of corpses) {
      corpse.t += dt;
      if (corpse.t > 0.42) {
        const k = "u" + id;
        const m = meshes.get(k);
        if (m) {
          scene.remove(m);
          disposeSprite(m);
          meshes.delete(k);
        }
        const sh = meshes.get("sh" + id);
        if (sh) {
          scene.remove(sh);
          meshes.delete("sh" + id);
        }
        corpses.delete(id);
        continue;
      }
      keep.add("u" + id);
      keep.add("sh" + id);
      const m = meshes.get("u" + id);
      if (!m) continue;
      animateUnit(m, { facing: corpse.facing, state: "idle" }, world, dt, { dying: true });
      m.visible = true;
      const sh = meshes.get("sh" + id);
      if (sh) {
        sh.position.set(m.position.x, m.position.y + 0.04, m.position.z);
        sh.visible = true;
      }
    }
    for (const p of world.projectiles) {
      keep.add("p" + p.id);
      let m = meshes.get("p" + p.id);
      if (!m) {
        m = new THREE.Sprite(
          new THREE.SpriteMaterial({
            color: 0x9af6ff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          })
        );
        m.scale.set(0.55, 0.55, 1);
        meshes.set("p" + p.id, m);
        scene.add(m);
      }
      m.position.set(p.x, sampleH(p.x, p.z) + 1.15, p.z);
    }
    for (const relic of world.relics || []) {
      keep.add("relic" + relic.id);
      let m = meshes.get("relic" + relic.id);
      if (!m) {
        m = new THREE.Sprite(spriteMat(nodes.void, { additive: false }));
        m.center.set(0.5, 0.12);
        m.scale.set(4.2, 4.2, 1);
        meshes.set("relic" + relic.id, m);
        scene.add(m);
      }
      m.position.set(relic.x, sampleH(relic.x, relic.z), relic.z);
      m.visible = seen(world, relic.x, relic.z);
    }
    for (const [k, m] of meshes) {
      if (!keep.has(k)) {
        if (k.startsWith("u") && !k.startsWith("ush") && m.userData.pipelineAtlas && !corpses.has(k.slice(1))) {
          corpses.set(k.slice(1), { t: 0, facing: m.userData.lastFacing || 0 });
          keep.add(k);
          keep.add("sh" + k.slice(1));
          continue;
        }
        scene.remove(m);
        disposeSprite(m);
        meshes.delete(k);
      }
    }

    const selected = [
      ...world.units.filter((u) => selSet.has(u.id)),
      ...world.buildings.filter((b) => selSet.has(b.id)),
    ];
    const pulse = 0.82 + Math.sin(world.t * 6) * 0.12;
    rings.forEach((ring, i) => {
      const sel = selected[i];
      if (!sel) {
        ring.visible = false;
        return;
      }
      ring.visible = true;
      const s = sel.kind === "building" ? (sel.size || 2) * 0.75 : 0.95;
      ring.scale.set(s, s, s);
      ring.material.opacity = pulse;
      ring.position.set(sel.x, sampleH(sel.x, sel.z) + 0.08, sel.z);
    });

    const lx = 4 + world.bright * (MAP - 8);
    brightLine.position.set(lx, 1.1, MAP / 2);
    brightLine.material.opacity = 0.22 + Math.sin(world.t * 2.2) * 0.08;
    sun.position.set(20 + world.bright * 50, 50, 20);
    sun.color.set(inLight(world, camTarget.x) ? 0xfff3d0 : 0xb8c8ff);
    hemi.color.set(inLight(world, camTarget.x) ? 0xd8ecff : 0x9aa8d8);
    scene.background.set(inLight(world, camTarget.x) ? "#6eb4e8" : "#3a4a78");
    paintFog(fogCtx, fogTex, fogImg, world);
    vfx.tick(world);

    if (world.placing) {
      ghost.visible = true;
      const fac = world.players.player.faction === "gravemark" ? "grave" : "sun";
      const map = bldg[fac][world.placing] || bldg[fac].house;
      if (ghost.material.map !== map) ghost.material.map = map;
      fitWhenReady(ghost, map, buildingScale(world.placing));
      const gx = world.placeX || camTarget.x;
      const gz = world.placeZ || camTarget.z;
      ghost.position.set(gx, sampleH(gx, gz), gz);
    } else ghost.visible = false;

    renderer.render(scene, camera);
  }

  function cameraInfo() {
    return {
      x: camTarget.x,
      z: camTarget.z,
      frustum: frustumLive,
      frustumDesired,
      min: FRUSTUM_MIN,
      max: FRUSTUM_MAX,
    };
  }

  return {
    renderer,
    camera,
    scene,
    ground: terrain,
    pan,
    zoom: setZoom,
    lookAt,
    groundPick,
    sync,
    resize,
    cameraInfo,
    project(x, z) {
      const v = new THREE.Vector3(x, sampleH(x, z) + 0.8, z).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
      };
    },
    dispose() {
      ro.disconnect();
      window.removeEventListener("resize", resize);
      renderer.dispose();
      renderer.domElement.remove();
    },
    setGhost(x, z, ok) {
      ghost.position.set(x, sampleH(x, z), z);
      ghost.material.color.set(ok ? 0xffffff : 0xff6688);
    },
    setAdaptiveScale(scale) {
      adaptiveScale = scale;
      applyBacking(false);
    },
    stats() {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      const backing = backingLabel(w, h, appliedRatio || pixelRatioFor(w, h, software ? "medium" : quality, adaptiveScale));
      return {
        pixelRatio: appliedRatio,
        ...backing,
        quality,
        software,
        gpu: gpuName,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
  };
}

function buildingScale(type) {
  if (type === "towncenter" || type === "wonder") return 9.4;
  if (type === "barracks" || type === "spire" || type === "den" || type === "workshop") return 6.6;
  return 5.2;
}

function makeBuildingSprite(b, bldg) {
  const fac = b.faction === "gravemark" ? "grave" : "sun";
  const map = bldg[fac][b.type] || bldg[fac].house;
  const s = new THREE.Sprite(spriteMat(map));
  s.center.set(0.5, 0.07);
  fitWhenReady(s, map, buildingScale(b.type));
  return s;
}

function makeNode(r, nodes) {
  const map = nodes[r.kind] || nodes.crystal;
  const s = new THREE.Sprite(spriteMat(map));
  s.center.set(0.5, 0.02);
  fitWhenReady(s, map, r.kind === "wood" ? 5.1 : r.kind === "food" ? 4.4 : r.kind === "ore" ? 4.3 : 4.0);
  return s;
}

function unitSheet(u, sheets, stills) {
  const grave = u.faction === "gravemark";
  if (u.type === "strider") return { map: grave ? stills.graveStrider : stills.sunStrider, sheet: false, scale: 5.0 };
  if (u.type === "siege") return { map: grave ? stills.graveSiege : stills.sunSiege, sheet: false, scale: 5.2 };
  if (u.type === "titan") return { map: stills.graveStrider, sheet: false, scale: 7.0 };
  if (u.type === "guard" || u.type === "archer") {
    if (!grave && u.type === "guard") {
      return {
        map: sheets.sunGuardAtlas,
        sheet: true,
        scale: 4.15,
        southFirst: false,
        pipelineAtlas: sunGuardAtlas,
      };
    }
    return { map: grave ? sheets.graveGuard : sheets.sunGuard, sheet: true, scale: 4.15, southFirst: false };
  }
  return { map: grave ? sheets.graveWalk : sheets.sunWalk, sheet: true, scale: 4.05, southFirst: grave };
}

function makeUnitSprite(u, sheets, stills) {
  const spec = unitSheet(u, sheets, stills);
  const map = spec.sheet ? cloneSheet(spec.map) : spec.map;
  const s = new THREE.Sprite(spriteMat(map));
  s.center.set(0.5, 0.05);
  s.userData.sheet = spec.sheet;
  s.userData.southFirst = !!spec.southFirst;
  s.userData.pipelineAtlas = spec.pipelineAtlas || null;
  s.userData.baseScale = spec.scale;
  s.userData.aspect = spec.sheet ? 1 : 1;
  s.userData.walkT = 0;
  if (!spec.sheet) fitWhenReady(s, map, spec.scale);
  else {
    const startRow = spec.southFirst ? 0 : 4;
    if (spec.pipelineAtlas) setFrame(map, 0, startRow, spec.pipelineAtlas.cols, spec.pipelineAtlas.rows);
    else setFrame(map, 0, startRow);
    s.scale.set(spec.scale, spec.scale, 1);
  }
  return s;
}

function animateUnit(sprite, u, world, dt = 0.016, opts = {}) {
  const onPath = WALK_STATES.has(u.state) && Array.isArray(u.path) && u.path.length > 0;
  const dx = u.x - (sprite.userData.px ?? u.x);
  const dz = u.z - (sprite.userData.pz ?? u.z);
  if (u.x != null) sprite.userData.px = u.x;
  if (u.z != null) sprite.userData.pz = u.z;
  const moving = onPath || Math.hypot(dx, dz) > 0.0008;
  if (sprite.userData.sheet && sprite.material.map) {
    const meta = sprite.userData.pipelineAtlas;
    if (meta) {
      const action = pipelineAction(u, moving, !!opts.dying);
      const clip = meta.clips.find((c) => c.id === action) || meta.clips[0];
      if (moving && action === "walk") sprite.userData.walkT = (sprite.userData.walkT || 0) + dt;
      else if (action === "attack" || action === "death") sprite.userData.walkT = (sprite.userData.walkT || 0) + dt;
      else sprite.userData.walkT = 0;
      const frameDur = (clip?.durationMs || 110) / 1000;
      let frameIdx = Math.floor((sprite.userData.walkT || 0) / frameDur);
      if (!clip?.loop) frameIdx = Math.min(frameIdx, (clip?.frames || 4) - 1);
      else frameIdx %= clip?.frames || 4;
      const row = dirRow(u.facing || sprite.userData.lastFacing || 0, sprite.userData.southFirst);
      const cell = atlasCell(meta, action, row, frameIdx);
      if (sprite.userData.col !== cell.col || sprite.userData.row !== cell.row || sprite.userData.action !== action) {
        sprite.userData.col = cell.col;
        sprite.userData.row = cell.row;
        sprite.userData.action = action;
        setFrame(sprite.material.map, cell.col, cell.row, meta.cols, meta.rows);
      }
    } else {
      if (moving) sprite.userData.walkT = (sprite.userData.walkT || 0) + dt;
      else sprite.userData.walkT = 0;
      const col = moving ? Math.floor(sprite.userData.walkT * 12) % 8 : 0;
      const row = dirRow(u.facing || 0, sprite.userData.southFirst);
      if (sprite.userData.col !== col || sprite.userData.row !== row) {
        sprite.userData.col = col;
        sprite.userData.row = row;
        setFrame(sprite.material.map, col, row);
      }
    }
  }
  const bob = moving ? 1 + Math.sin((sprite.userData.walkT || 0) * 14) * 0.03 : 1;
  const s = (sprite.userData.baseScale || 2.4) * bob;
  const a = sprite.userData.aspect || 1;
  sprite.scale.set(s * a, s, 1);
}

function disposeSprite(m) {
  if (m.material?.map?.userData?.cloned) m.material.map.dispose();
  m.material?.dispose?.();
}

function vis(world, x, z) {
  const cx = Math.max(0, Math.min(N - 1, (x / CELL) | 0));
  const cz = Math.max(0, Math.min(N - 1, (z / CELL) | 0));
  return world.visible.player[cz * N + cx];
}

function seen(world, x, z) {
  const cx = Math.max(0, Math.min(N - 1, (x / CELL) | 0));
  const cz = Math.max(0, Math.min(N - 1, (z / CELL) | 0));
  return world.explored.player[cz * N + cx];
}

function paintFog(ctx, tex, img, world) {
  if (!world.fogDirty && world._fogPainted) return;
  const data = img.data;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = (z * N + x) * 4;
      const vis = world.visible.player[z * N + x];
      const exp = world.explored.player[z * N + x];
      data[i] = 6;
      data[i + 1] = 10;
      data[i + 2] = 18;
      data[i + 3] = vis ? 0 : exp ? 70 : 165;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.needsUpdate = true;
  world.fogDirty = false;
  world._fogPainted = true;
}

function buildMesa(sandMap, seg = 64, lit = true) {
  const geo = new THREE.PlaneGeometry(MAP, MAP, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color("#f3d7a0");
  const dirt = new THREE.Color("#d4a45c");
  const grass = new THREE.Color("#7a9a4a");
  const rock = new THREE.Color("#a56a42");
  const cliff = new THREE.Color("#6a4030");
  const wet = new THREE.Color("#c4b07a");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + MAP / 2;
    const z = pos.getZ(i) + MAP / 2;
    let y = landH(x, z);
    const rim = Math.min(Math.min(x, MAP - x), Math.min(z, MAP - z));
    if (rim < 1.8) y = -2.2;
    else if (rim < 8.5) y = THREE.MathUtils.lerp(-1.55, Math.max(0.35, y), smoothstep(1.8, 8.5, rim));
    pos.setY(i, y);
    const moist = fbm(x * 0.05, z * 0.05, 3);
    const c = sand.clone();
    if (y < 0.05) c.copy(cliff);
    else if (rim < 6.2) c.copy(wet);
    else if (rim < 10.5) c.copy(rock).lerp(sand, 0.35);
    else if (moist > 0.74) c.lerp(grass, 0.16);
    else c.lerp(dirt, 0.18);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = lit
    ? new THREE.MeshLambertMaterial({ map: sandMap, vertexColors: true, color: 0xffffff })
    : new THREE.MeshBasicMaterial({ map: sandMap, vertexColors: true, color: 0xffffff, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(MAP / 2, 0, MAP / 2);
  return mesh;
}

function addSky(scene, enabled = true) {
  if (!enabled) return;
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 1024;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, "#1a2a5a");
  g.addColorStop(0.28, "#3a6aaa");
  g.addColorStop(0.52, "#7eb6e8");
  g.addColorStop(0.72, "#c8e4ff");
  g.addColorStop(0.88, "#e8f4ff");
  g.addColorStop(1, "#b8d4c8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 20),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })
  );
  scene.add(sky);
}

function addPlanet(scene, hi = false) {
  const segs = hi ? 28 : 16;
  const p = new THREE.Mesh(
    new THREE.SphereGeometry(8, segs, Math.max(12, (segs * 0.7) | 0)),
    new THREE.MeshLambertMaterial({ color: 0xc4a882, emissive: 0x332211, emissiveIntensity: 0.25 })
  );
  p.position.set(62, 42, -28);
  scene.add(p);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.32, 8, hi ? 48 : 36),
    new THREE.MeshBasicMaterial({ color: 0xd8c48a, toneMapped: false })
  );
  ring.position.copy(p.position);
  ring.rotation.x = Math.PI / 2.5;
  scene.add(ring);
}

function makeVfx(scene, n = 80) {
  if (!n) {
    return { tick() {} };
  }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x66e0ff,
    size: 0.28,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const cloud = new THREE.Points(geo, mat);
  cloud.frustumCulled = false;
  scene.add(cloud);
  return {
    tick(world) {
      let i = 0;
      for (const r of world.resources) {
        if (r.kind !== "crystal" && r.kind !== "void") continue;
        if (i >= n) break;
        const t = world.t;
        pos[i * 3] = r.x + Math.sin(t * 2 + r.id) * 0.35;
        pos[i * 3 + 1] = sampleH(r.x, r.z) + 1.2 + Math.abs(Math.sin(t * 3 + r.id));
        pos[i * 3 + 2] = r.z + Math.cos(t * 2 + r.id) * 0.35;
        i++;
      }
      for (const p of world.projectiles) {
        if (i >= n) break;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = sampleH(p.x, p.z) + 1.2;
        pos[i * 3 + 2] = p.z;
        i++;
      }
      geo.setDrawRange(0, i);
      geo.attributes.position.needsUpdate = true;
    },
  };
}
