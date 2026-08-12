import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "../..");
const sourceRoot = join(root, "assets", "source");
const runtimeRoot = join(root, "assets", "runtime");
const publicRoot = join(root, "public", "game-assets");
const generatedAt = "2026-08-12T00:00:00Z";
const sourceHashAlgorithm = "sha256";
const palettes = {
  sunwoven: ["#F8D66D", "#E9825B", "#43C6B8", "#FFF0B5", "#3A3150", "#15182A"],
  gravemark: ["#778197", "#3E465A", "#C24B8E", "#B7C0D0", "#25283A", "#15182A"],
  meridian: ["#55E6F2", "#8C63FF"],
};
const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const sourceDirections = ["N", "NE", "E", "SE", "S"];
const mirrorSource = { SW: "SE", W: "E", NW: "NE" };
const actions = ["idle", "move", "attack", "hit", "death"];
const builderActions = [...actions, "build"];
const units = [
  { faction: "sunwoven", id: "gleamrunner", builder: false },
  { faction: "sunwoven", id: "loomkeeper", builder: true },
  { faction: "sunwoven", id: "prism-lancer", builder: false },
  { faction: "gravemark", id: "stoneguard", builder: false },
  { faction: "gravemark", id: "prospector", builder: true },
  { faction: "gravemark", id: "rift-cannon", builder: false },
];
const durations = { idle: 220, move: 110, attack: 100, hit: 50, death: 100, build: 140 };
const sourceRecords = [];
const outputRecords = [];

await main();

async function main() {
  if (sharp.versions.vips !== "8.17.1") throw new Error(`Expected libvips 8.17.1, found ${sharp.versions.vips}`);
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(runtimeRoot, { recursive: true });
  mkdirSync(publicRoot, { recursive: true });
  await generateUnitSources();
  await generateEnvironmentSources();
  const atlases = [];
  for (const unit of units) atlases.push(await generateAtlas(unit));
  const manifest = { version: "runtime-manifest.v1", generatedAt, sourceCount: sourceRecords.length, maxTextureSize: 2_048, atlases };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(runtimeRoot, "runtime-manifest.json"), manifestText);
  writeFileSync(join(publicRoot, "runtime-manifest.json"), manifestText);
  const provenance = {
    version: "provenance.v1",
    generatedAt,
    generator: "starhaven-authored-pixel-pipeline-v1",
    sourceHashAlgorithm,
    sharp: "0.34.3",
    libvips: sharp.versions.libvips,
    transformation: "inbetweening.v1 + Offset-Cosine-32 v1",
    review: { status: "provisional", humanApprovalRequired: true, conceptSheetsShipped: false },
    sourceCount: sourceRecords.length,
    sources: sourceRecords,
    runtimeOutputs: outputRecords,
  };
  const provenancePath = join(root, "assets", "provenance", "assets.json");
  mkdirSync(dirname(provenancePath), { recursive: true });
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(JSON.stringify({ sourceCount: sourceRecords.length, atlasCount: atlases.length, libvips: sharp.versions.vips }));
}

async function generateUnitSources() {
  for (const unit of units) {
    const unitActions = unit.builder ? builderActions : actions;
    for (const action of unitActions) {
      for (const direction of sourceDirections) {
        for (const pose of ["A", "B"]) {
          const file = join(sourceRoot, "units", unit.faction, unit.id, action, direction, `${pose}.png`);
          mkdirSync(dirname(file), { recursive: true });
          const svg = unitSvg(unit, action, direction, pose);
          await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toFile(file);
          sourceRecords.push(await record(file, { type: "unit-source", unit: unit.id, faction: unit.faction, action, direction, pose, pivot: { x: 64, y: 112 }, prompt: `Bilateral symmetric pixel-like ${unit.id} ${direction} ${action} key pose ${pose}; centered faction token; no text.` }));
        }
      }
    }
  }
}

async function generateEnvironmentSources() {
  const environment = [
    ["title/title-art.png", titleSvg()],
    ["textures/terrain-grass.png", textureSvg("#233b45", "#2d5260")],
    ["textures/terrain-rock.png", textureSvg("#34394d", "#4a5068")],
    ["textures/terrain-crystal.png", textureSvg("#17384b", "#276d7b")],
    ["textures/luminous-bridge.png", textureSvg("#302050", "#55E6F2")],
    ["decals/sunwoven-emblem.png", emblemSvg("#F8D66D", "#43C6B8", "sun")],
    ["decals/gravemark-emblem.png", emblemSvg("#C24B8E", "#778197", "grave")],
    ["decals/meridian-core.png", emblemSvg("#55E6F2", "#8C63FF", "core")],
    ["decals/sunwoven-token.png", emblemSvg("#F8D66D", "#E9825B", "sun")],
    ["decals/gravemark-token.png", emblemSvg("#C24B8E", "#B7C0D0", "grave")],
  ];
  for (const [name, svg] of environment) {
    const file = join(sourceRoot, name);
    mkdirSync(dirname(file), { recursive: true });
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toFile(file);
    const runtimeFile = join(runtimeRoot, name);
    const publicFile = join(publicRoot, name);
    mkdirSync(dirname(runtimeFile), { recursive: true });
    mkdirSync(dirname(publicFile), { recursive: true });
    copyFileSync(file, runtimeFile);
    copyFileSync(file, publicFile);
    outputRecords.push(await record(runtimeFile, { type: "runtime-environment", publicPath: `game-assets/${name}` }));
    sourceRecords.push(await record(file, { type: "environment-source", prompt: "Clean low-poly oblique frontier art, no text, no logos, no photorealism." }));
  }
}

async function generateAtlas(unit) {
  const unitActions = unit.builder ? builderActions : actions;
  const width = 2_048;
  const height = unitActions.length * 2 * 128;
  const composites = [];
  const frames = [];
  for (let actionIndex = 0; actionIndex < unitActions.length; actionIndex += 1) {
    const action = unitActions[actionIndex];
    for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
      const direction = directions[directionIndex];
      for (let frame = 0; frame < 4; frame += 1) {
        const sourceDirection = mirrorSource[direction] ?? direction;
        const pose = frame < 2 ? "A" : "B";
        const source = join(sourceRoot, "units", unit.faction, unit.id, action, sourceDirection, `${pose}.png`);
        let image = sharp(source).resize(128, 128, { fit: "fill", kernel: sharp.kernel.nearest });
        if (mirrorSource[direction]) image = image.flop();
        composites.push({ input: await image.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer(), left: (directionIndex * 2 + frame % 2) * 128, top: (actionIndex * 2 + Math.floor(frame / 2)) * 128 });
        frames.push({ id: `${unit.id}.${action}.${direction}.${frame}`, action, facing: direction, frame, durationMs: durations[action], pivot: { x: 64, y: 112 }, mirrored: Boolean(mirrorSource[direction]) });
      }
    }
  }
  const fullPath = join(runtimeRoot, "sprites", `${unit.id}.atlas.png`);
  const halfPath = join(runtimeRoot, "sprites", `${unit.id}.atlas.half.png`);
  mkdirSync(dirname(fullPath), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toFile(fullPath);
  await sharp(fullPath).resize(width / 2, height / 2, { kernel: sharp.kernel.nearest }).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toFile(halfPath);
  const publicDir = join(publicRoot, "sprites");
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(fullPath, join(publicDir, `${unit.id}.atlas.png`));
  copyFileSync(halfPath, join(publicDir, `${unit.id}.atlas.half.png`));
  outputRecords.push(await record(fullPath, { type: "runtime-atlas", unit: unit.id, width, height, maxTextureSize: 2_048 }));
  outputRecords.push(await record(halfPath, { type: "runtime-half-atlas", unit: unit.id, width: width / 2, height: height / 2, maxTextureSize: 2_048 }));
  return { id: unit.id, faction: unit.faction, full: `game-assets/sprites/${unit.id}.atlas.png`, half: `game-assets/sprites/${unit.id}.atlas.half.png`, width, height, frames };
}

async function record(file, metadata) {
  const bytes = readFileSync(file);
  return { path: relative(root, file), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), generatedAt, ...metadata };
}

function unitSvg(unit, action, direction, pose) {
  const palette = palettes[unit.faction];
  const body = unit.id.includes("cannon") || unit.id.includes("stoneguard") ? 30 : 24;
  const lift = pose === "B" ? (action === "attack" ? -6 : -2) : 0;
  const accent = palette[action === "attack" ? 1 : 0];
  const token = unit.faction === "sunwoven" ? "M64 26 L73 35 L64 44 L55 35 Z" : "M52 27 L64 38 L76 27 L76 41 L64 51 L52 41 Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" shape-rendering="crispEdges"><g transform="translate(0 ${lift})"><path fill="${palette[5]}" d="M64 ${17 + body / 3} L${64 - body} 61 L${64 - body + 7} 101 L64 112 L${64 + body - 7} 101 L${64 + body} 61 Z"/><path fill="${palette[0]}" d="M64 37 L${64 - body + 6} 62 L${64 - body + 10} 95 L64 104 L${64 + body - 10} 95 L${64 + body - 6} 62 Z"/><path fill="${accent}" d="${token}"/><path fill="${palette[3]}" d="M53 61 H75 V75 H53 Z"/><path fill="${palette[4]}" d="M47 101 H58 V111 H47 Z M70 101 H81 V111 H70 Z"/><path fill="${palette[2]}" d="M59 76 H69 V95 H59 Z"/></g></svg>`;
}

function titleSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512"><rect width="1024" height="512" fill="#0C1023"/><path fill="#172B44" d="M0 386 L130 272 L270 350 L430 220 L580 344 L750 200 L1024 330 V512 H0 Z"/><path fill="#213956" d="M0 421 L170 330 L315 410 L510 282 L650 394 L830 292 L1024 390 V512 H0 Z"/><circle cx="535" cy="190" r="82" fill="#55E6F2" opacity=".14"/><path fill="none" stroke="#55E6F2" stroke-width="4" d="M535 125 L600 190 L535 255 L470 190 Z"/><path fill="#8C63FF" d="M529 183 L543 183 L543 197 L529 197 Z"/><path fill="#F8D66D" d="M244 383 L260 399 L244 415 L228 399 Z"/><path fill="#C24B8E" d="M810 350 L826 366 L810 382 L794 366 Z"/></svg>`;
}

function textureSvg(first, second) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${first}"/><path fill="${second}" opacity=".4" d="M0 120 H1024 V160 H0 Z M0 520 H1024 V558 H0 Z M120 0 H160 V1024 H120 Z M760 0 H800 V1024 H760 Z"/><path fill="${second}" opacity=".32" d="M256 256 H384 V384 H256 Z M640 640 H768 V768 H640 Z"/></svg>`;
}

function emblemSvg(first, second, kind) {
  const shape = kind === "core" ? "M128 32 L224 128 L128 224 L32 128 Z" : kind === "sun" ? "M128 24 L147 102 L224 128 L147 154 L128 232 L109 154 L32 128 L109 102 Z" : "M52 42 L128 98 L204 42 L204 142 L128 214 L52 142 Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"/><path fill="${first}" d="${shape}"/><path fill="${second}" d="M116 84 H140 V172 H116 Z M84 116 H172 V140 H84 Z"/></svg>`;
}
