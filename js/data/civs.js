/**
 * Playable civilization definitions. Issue #23 adds qa-stub behind ?qa=1.
 */

import { AGES, UNITS, BUILDINGS, VILLAGER_BUILD_LIST } from "./catalog.js";
import { registerCiv } from "./civ-schema.js";
import { COGFORGED_AI } from "../sim/civs/cogforged.js";
import "../sim/civs/cogforged.js";

export const SHARED_AI = {
  villagers: { settler: 8, chieftain: 11, emperor: 14 },
  waveTickSec: { settler: 140, chieftain: 95, emperor: 70 },
  emperorExtraStock: 80,
  buildPriority: ["house", "barracks", "spire", "mill", "workshop"],
};

function sharedRoster() {
  return {
    units: Object.keys(UNITS),
    buildings: Object.keys(BUILDINGS),
    villagerBuild: [...VILLAGER_BUILD_LIST],
  };
}

function sharedTechs() {
  return { ages: AGES };
}

/** @typedef {typeof import("./civs.js").SUNWOVEN} CivDefinition */

const SUNWOVEN_BUILDINGS = {
  towncenter: "media/sprites/bldg-sun-tc.png",
  house: "media/sprites/bldg-sun-house.png",
  barracks: "media/sprites/bldg-sun-rax.png",
  mill: "media/sprites/bldg-sun-mill.png",
  lumber: "media/sprites/bldg-sun-mill.png",
  mine: "media/sprites/bldg-sun-mill.png",
  spire: "media/sprites/bldg-sun-rax.png",
  den: "media/sprites/bldg-sun-rax.png",
  workshop: "media/sprites/bldg-sun-rax.png",
  wonder: "media/sprites/bldg-sun-wonder.png",
};

const COGFORGED_BUILDINGS = {
  towncenter: "media/sprites/bldg-cog-tc.png",
  house: "media/sprites/bldg-cog-house.png",
  barracks: "media/sprites/bldg-cog-rax.png",
  mill: "media/sprites/bldg-cog-mill.png",
  lumber: "media/sprites/bldg-cog-lumber.png",
  mine: "media/sprites/bldg-cog-mine.png",
  spire: "media/sprites/bldg-cog-spire.png",
  den: "media/sprites/bldg-cog-den.png",
  workshop: "media/sprites/bldg-cog-workshop.png",
  wonder: "media/sprites/bldg-cog-wonder.png",
};

const GRAVEMARK_BUILDINGS = {
  towncenter: "media/sprites/bldg-grave-tc.png",
  house: "media/sprites/bldg-grave-house.png",
  barracks: "media/sprites/bldg-grave-rax.png",
  mill: "media/sprites/bldg-grave-mill.png",
  lumber: "media/sprites/bldg-grave-mill.png",
  mine: "media/sprites/bldg-grave-mill.png",
  spire: "media/sprites/bldg-grave-rax.png",
  den: "media/sprites/bldg-grave-rax.png",
  workshop: "media/sprites/bldg-grave-rax.png",
  wonder: "media/sprites/bldg-grave-wonder.png",
};

const walkUnit = (scale, southFirst = false) => ({ kind: "walkSheet", sheet: true, scale, southFirst });
const guardUnit = () => ({ kind: "guardSheet", sheet: true, scale: 4.15, southFirst: false });
const stillUnit = (kind, scale) => ({ kind, sheet: false, scale, southFirst: false });

export const SUNWOVEN = {
  id: "sunwoven",
  identity: {
    name: "Sunwoven",
    tagline: "Solar sails, beam infantry, faster in daylight",
    portrait: "media/sprites/portrait-sunwoven.png",
    banner: "media/textures/sunwoven-banner.jpg",
    lore: {
      blurb:
        "Weavers of light who stitch cities from brass, calcite, and solar crystal. Villagers unfold golden arms to raise palaces. In the Bright Line's day-side their skiffs and lumen guards surge.",
      ages: [
        "Age I — Weaver, Pathfinder, Lumen Guard, Solar Strider",
        "Age II — Threadwright backpacks, Sunrunners, Radiant Phalanx",
        "Age III — Helio Manta gunships, Dawn Ark wonder",
      ],
    },
  },
  roster: sharedRoster(),
  statOverrides: {},
  techs: sharedTechs(),
  buffs: {
    inLight: { speed: 1140, dmg: 1100, armor: 1000 },
    inDark: { speed: 1000, dmg: 1000, armor: 1000 },
  },
  names: {
    units: {
      villager: "Weaver",
      scout: "Pathfinder",
      guard: "Lumen Guard",
      archer: "Sunbow",
      strider: "Solar Strider",
      siege: "Dawn Projector",
      titan: "Mesa Titan",
    },
    buildings: {
      towncenter: "Town Center",
      house: "House",
      mill: "Lumen Mill",
      lumber: "Timber Camp",
      mine: "Solarite Camp",
      barracks: "Barracks",
      spire: "Lumen Spire",
      den: "Strider Den",
      workshop: "Siege Yard",
      wonder: "Dawn Ark",
    },
  },
  sprites: {
    walkSheet: "media/sprites/sheet-sunwoven-walk.png",
    guardSheet: "media/sprites/sheet-sun-guard.png",
    strider: "media/sprites/unit-sun-strider.png",
    siege: "media/sprites/unit-sun-siege.png",
    portrait: "media/sprites/portrait-sunwoven.png",
    buildings: SUNWOVEN_BUILDINGS,
    units: {
      default: walkUnit(4.05, false),
      villager: walkUnit(4.05, false),
      scout: walkUnit(4.05, false),
      guard: guardUnit(),
      archer: guardUnit(),
      strider: stillUnit("strider", 5.0),
      siege: stillUnit("siege", 5.2),
      titan: stillUnit("strider", 7.0),
    },
  },
  ai: SHARED_AI,
};

export const GRAVEMARK = {
  id: "gravemark",
  identity: {
    name: "Gravemark",
    tagline: "Stonebound walkers, tougher in shadow",
    portrait: "media/sprites/portrait-gravemark.png",
    banner: "media/textures/gravemark-banner.jpg",
    lore: {
      blurb:
        "Necrolith masons who bind basalt to void crystal. Their gravesmiths raise crypt-fortresses. Night on the Bright Line hardens their phalanxes and wakes rift-cutter barges.",
      ages: [
        "Age I — Stonemason, Faultseer, Basalt Guard, Tomb Strider",
        "Age II — Gravesmith rigs, Dustrunners, Crypt Phalanx",
        "Age III — Obsidian Ray, Mausoleum Engine wonder",
      ],
    },
  },
  roster: sharedRoster(),
  statOverrides: {},
  techs: sharedTechs(),
  buffs: {
    inLight: { speed: 1000, dmg: 1000, armor: 1000 },
    inDark: { speed: 1060, dmg: 1080, armor: 820 },
  },
  names: {
    units: {
      villager: "Stonemason",
      scout: "Faultseer",
      guard: "Basalt Guard",
      archer: "Shade Bow",
      strider: "Tomb Strider",
      siege: "Grave Lobber",
      titan: "Mesa Titan",
    },
    buildings: {
      towncenter: "Cryptkeep",
      house: "Ossuary",
      mill: "Grave Mill",
      lumber: "Quarry Camp",
      mine: "Void Pit",
      barracks: "Phalanx Hall",
      spire: "Rift Spire",
      den: "Beast Crypt",
      workshop: "Mausoleum Yard",
      wonder: "Mausoleum Engine",
    },
  },
  sprites: {
    walkSheet: "media/sprites/sheet-gravemark-walk.png",
    guardSheet: "media/sprites/sheet-grave-guard.png",
    strider: "media/sprites/unit-grave-strider.png",
    siege: "media/sprites/unit-grave-siege.png",
    portrait: "media/sprites/portrait-gravemark.png",
    buildings: GRAVEMARK_BUILDINGS,
    units: {
      default: walkUnit(4.05, true),
      villager: walkUnit(4.05, true),
      scout: walkUnit(4.05, true),
      guard: guardUnit(),
      archer: guardUnit(),
      strider: stillUnit("strider", 5.0),
      siege: stillUnit("siege", 5.2),
      titan: stillUnit("strider", 7.0),
    },
  },
  ai: SHARED_AI,
};

export const COGFORGED = {
  id: "cogforged",
  identity: {
    name: "Cogforged Assembly",
    tagline: "Grid power, on-site assembly, no harvest rations",
    portrait: "media/sprites/portrait-cogforged.png",
    banner: "media/textures/cogforged-banner.jpg",
    lore: {
      blurb:
        "Brass automatons who weld legions in the field and feed cities through copper relay grids. They ignore the Bright Line entirely — neither boosted nor blunted — and never ration lumenfruit.",
      ages: [
        "Age I — Assembler, Surveyor, Plate Guard, Gear Strider",
        "Age II — Relay rigs, Cogrunners, Assembly Phalanx",
        "Age III — Siege Calibrator, Foundry Engine wonder",
      ],
    },
  },
  economy: { usesFood: false },
  roster: {
    units: Object.keys(UNITS),
    buildings: Object.keys(BUILDINGS).filter((t) => t !== "mill"),
    villagerBuild: VILLAGER_BUILD_LIST.filter((t) => t !== "mill"),
  },
  statOverrides: {},
  techs: sharedTechs(),
  buffs: {
    brightLineImmune: true,
    inLight: { speed: 1000, dmg: 1000, armor: 1000 },
    inDark: { speed: 1000, dmg: 1000, armor: 1000 },
  },
  names: {
    units: {
      villager: "Assembler",
      scout: "Surveyor",
      guard: "Plate Guard",
      archer: "Rivet Bow",
      strider: "Gear Strider",
      siege: "Calibrator",
      titan: "Mesa Titan",
    },
    buildings: {
      towncenter: "Foundry Core",
      house: "Capacitor Hut",
      mill: "Flux Mill",
      lumber: "Timber Relay",
      mine: "Ore Relay",
      barracks: "Assembly Hall",
      spire: "Optic Spire",
      den: "Strider Bay",
      workshop: "Siege Foundry",
      wonder: "Foundry Engine",
    },
  },
  sprites: {
    walkSheet: "media/sprites/sheet-cogforged-walk.png",
    guardSheet: "media/sprites/sheet-cog-guard.png",
    strider: "media/sprites/unit-cog-strider.png",
    siege: "media/sprites/unit-cog-siege.png",
    portrait: "media/sprites/portrait-cogforged.png",
    gridPylon: "media/sprites/bldg-cog-grid-pylon.png",
    buildings: COGFORGED_BUILDINGS,
    units: {
      default: walkUnit(4.05, false),
      villager: walkUnit(4.05, false),
      scout: walkUnit(4.05, false),
      guard: guardUnit(),
      archer: guardUnit(),
      strider: stillUnit("strider", 5.0),
      siege: stillUnit("siege", 5.2),
      titan: stillUnit("strider", 7.0),
    },
  },
  ai: COGFORGED_AI,
};

const ASHVEIN_BUILDINGS = {
  towncenter: "media/sprites/bldg-ash-tc.png",
  house: "media/sprites/bldg-ash-house.png",
  barracks: "media/sprites/bldg-ash-rax.png",
  mill: "media/sprites/bldg-ash-mill.png",
  lumber: "media/sprites/bldg-ash-lumber.png",
  mine: "media/sprites/bldg-ash-mine.png",
  spire: "media/sprites/bldg-ash-spire.png",
  den: "media/sprites/bldg-ash-den.png",
  workshop: "media/sprites/bldg-ash-workshop.png",
  wonder: "media/sprites/bldg-ash-wonder.png",
};

export const ASHVEIN = {
  id: "ashvein",
  identity: {
    name: "Ashvein Depths",
    tagline: "Tunnel networks, lava bridges, unseen flanks",
    portrait: "media/sprites/portrait-ashvein.png",
    banner: "media/textures/ashvein-banner.jpg",
    lore: {
      blurb:
        "Magma masons who hollow the mesa into hidden arteries. Their delvers slip beneath rival scouts, while vent-calls pour molten rivers that cool into stone spans — reshaping the battlefield mid-siege.",
      ages: [
        "Age I — Delver, Ventseer, Ember Guard, Tunnel Strider",
        "Age II — Magmacore rigs, Ashrunners, Basalt Phalanx",
        "Age III — Rift Furnace, Caldera Gate wonder",
      ],
    },
  },
  roster: sharedRoster(),
  statOverrides: {},
  techs: sharedTechs(),
  buffs: {
    inLight: { speed: 980, dmg: 1020, armor: 1000 },
    inDark: { speed: 1040, dmg: 1060, armor: 940 },
  },
  names: {
    units: {
      villager: "Delver",
      scout: "Ventseer",
      guard: "Ember Guard",
      archer: "Cinder Bow",
      strider: "Tunnel Strider",
      siege: "Magma Lobber",
      titan: "Caldera Titan",
    },
    buildings: {
      towncenter: "Vent Keep",
      house: "Ash Hut",
      mill: "Ember Mill",
      lumber: "Quarry Camp",
      mine: "Magma Pit",
      barracks: "Basalt Hall",
      spire: "Vent Spire",
      den: "Tunnel Den",
      workshop: "Caldera Yard",
      wonder: "Caldera Gate",
    },
  },
  sprites: {
    walkSheet: "media/sprites/sheet-ashvein-walk.png",
    guardSheet: "media/sprites/sheet-ash-guard.png",
    strider: "media/sprites/unit-ash-strider.png",
    siege: "media/sprites/unit-ash-siege.png",
    portrait: "media/sprites/portrait-ashvein.png",
    tunnelMouth: "media/sprites/bldg-ash-tunnel-mouth.png",
    lavaVent: "media/sprites/bldg-ash-lava-vent.png",
    buildings: ASHVEIN_BUILDINGS,
    units: {
      default: walkUnit(4.05, true),
      villager: walkUnit(4.05, true),
      scout: walkUnit(4.05, true),
      guard: guardUnit(),
      archer: guardUnit(),
      strider: stillUnit("strider", 5.0),
      siege: stillUnit("siege", 5.2),
      titan: stillUnit("strider", 7.0),
    },
  },
  ai: { ...SHARED_AI, useTunnelFlank: true },
};

/** QA-only stub civ: data + placeholder art, no bespoke sim branches. */
export const QA_STUB = {
  id: "qa-stub",
  qaOnly: true,
  identity: {
    name: "QA Stub",
    tagline: "Placeholder civ for data-only boot tests",
    portrait: "media/sprites/portrait-sunwoven.png",
    banner: "media/textures/sunwoven-banner.jpg",
    lore: {
      blurb: "Synthetic civilization registered from data. Uses placeholder sprites and neutral buffs to prove new civs need no code forks.",
      ages: ["Age I — Stub Mason, Stub Scout", "Age II — Placeholder rigs", "Age III — Test Engine wonder"],
    },
  },
  roster: sharedRoster(),
  statOverrides: {},
  techs: sharedTechs(),
  buffs: {
    inLight: { speed: 1000, dmg: 1000, armor: 1000 },
    inDark: { speed: 1000, dmg: 1000, armor: 1000 },
  },
  names: {
    units: {
      villager: "Stub Mason",
      scout: "Stub Scout",
      guard: "Stub Guard",
      archer: "Stub Bow",
      strider: "Stub Strider",
      siege: "Stub Siege",
      titan: "Stub Titan",
    },
    buildings: {
      towncenter: "Stub Keep",
      house: "Stub Hut",
      mill: "Stub Mill",
      lumber: "Stub Camp",
      mine: "Stub Pit",
      barracks: "Stub Hall",
      spire: "Stub Spire",
      den: "Stub Den",
      workshop: "Stub Yard",
      wonder: "Stub Engine",
    },
  },
  sprites: {
    walkSheet: "media/sprites/sheet-sunwoven-walk.png",
    guardSheet: "media/sprites/sheet-sun-guard.png",
    strider: "media/sprites/unit-sun-strider.png",
    siege: "media/sprites/unit-sun-siege.png",
    portrait: "media/sprites/portrait-sunwoven.png",
    buildings: SUNWOVEN_BUILDINGS,
    units: {
      default: walkUnit(4.05, false),
      villager: walkUnit(4.05, false),
      scout: walkUnit(4.05, false),
      guard: guardUnit(),
      archer: guardUnit(),
      strider: stillUnit("strider", 5.0),
      siege: stillUnit("siege", 5.2),
      titan: stillUnit("strider", 7.0),
    },
  },
  ai: SHARED_AI,
};

registerCiv(SUNWOVEN);
registerCiv(GRAVEMARK);
registerCiv(COGFORGED);
registerCiv(ASHVEIN);
registerCiv(QA_STUB);
