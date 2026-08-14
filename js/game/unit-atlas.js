/** Pipeline atlas registry — unit type + faction → packed sprite atlas. */

export const ATLAS_IDS = [
  "sun-guard",
  "grave-guard",
  "sun-walk",
  "grave-walk",
  "sun-strider",
  "grave-strider",
  "sun-siege",
  "grave-siege",
  "storm-guard",
  "storm-walk",
  "storm-strider",
  "storm-siege",
  "storm-wagon",
  "ash-guard",
  "ash-walk",
  "ash-strider",
  "ash-siege",
  "cog-guard",
  "cog-walk",
  "cog-strider",
  "cog-siege",
];

export const DEFAULT_ATLAS_META = {
  cols: 16,
  rows: 10,
  clips: [
    { id: "walk", frames: 4, durationMs: 110, loop: true },
    { id: "attack", frames: 4, durationMs: 100, loop: false },
    { id: "gather", frames: 4, durationMs: 140, loop: true },
    { id: "build", frames: 4, durationMs: 140, loop: true },
    { id: "death", frames: 4, durationMs: 100, loop: false },
  ],
};

const atlasMeta = new Map(ATLAS_IDS.map((id) => [id, { id, ...DEFAULT_ATLAS_META }]));

export function atlasMetaFor(id) {
  return atlasMeta.get(id) || { id, ...DEFAULT_ATLAS_META };
}

export function loadAtlasManifests() {
  return Promise.all(
    ATLAS_IDS.map((id) =>
      fetch(`media/sprites/${id}.atlas.json`, { cache: "no-cache" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.id === id) atlasMeta.set(id, json);
        })
        .catch(() => {})
    )
  );
}

/** Maps sim unit to committed atlas id (shared atlases OK). */
export function unitAtlasId(u) {
  const prefix = {
    gravemark: "grave",
    stormveil: "storm",
    ashvein: "ash",
    cogforged: "cog",
  }[u.faction] || "sun";
  switch (u.type) {
    case "guard":
    case "archer":
      return `${prefix}-guard`;
    case "strider":
      return `${prefix}-strider`;
    case "siege":
      return `${prefix}-siege`;
    case "wagon":
      return prefix === "storm" ? "storm-wagon" : `${prefix}-strider`;
    case "titan":
      return "grave-strider";
    default:
      return `${prefix}-walk`;
  }
}

export function unitDisplayScale(type) {
  if (type === "titan") return 7.0;
  if (type === "siege") return 5.2;
  if (type === "strider") return 5.0;
  if (type === "guard" || type === "archer") return 4.15;
  return 4.05;
}

export function unitSouthFirst(u) {
  return u.faction === "gravemark" && u.type !== "guard" && u.type !== "archer";
}

const WALK_STATES = new Set(["walk", "gatherwalk", "return", "buildwalk", "attackmove", "assemblewalk"]);

/** Sim-driven clip selection: idle | walk | attack | gather | build | death */
export function pipelineAction(u, moving, dying) {
  if (dying) return "death";
  if (u.state === "attack") return "attack";
  if (u.state === "gather") return "gather";
  if (u.state === "build") return "build";
  if (moving || WALK_STATES.has(u.state)) return "walk";
  return "idle";
}

export function atlasClipId(action) {
  return action === "idle" ? "walk" : action;
}

export { WALK_STATES };

export const CORPSE_DEATH_S = 0.42;
export const CORPSE_FADE_S = 0.38;
