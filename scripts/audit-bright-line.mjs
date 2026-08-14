#!/usr/bin/env node
/** Bright Line interaction audit across all five playable civs (#31). */

import { civBuff } from "../js/data/civ-schema.js";
import "../js/data/civs.js";
import { civMechanics } from "../js/sim/civs/index.js";
import "../js/sim/civs/cogforged.js";
import "../js/sim/civs/stormveil.js";
import "../js/sim/civs/ashvein.js";

const civs = ["sunwoven", "gravemark", "cogforged", "stormveil", "ashvein"];

const rows = civs.map((id) => {
  const immune = Boolean(civMechanics(id).brightLineImmune);
  const light = civBuff(id, true);
  const dark = civBuff(id, false);
  return {
    civ: id,
    brightLineImmune: immune,
    inLight: light,
    inDark: dark,
    lightEdgePermille: { speed: light.speed - 1000, dmg: light.dmg - 1000, armor: light.armor - 1000 },
    darkEdgePermille: { speed: dark.speed - 1000, dmg: dark.dmg - 1000, armor: dark.armor - 1000 },
    favorsLight: light.speed > dark.speed || light.dmg > dark.dmg,
    favorsDark: dark.speed > light.speed || dark.dmg > dark.dmg,
    neutral: !immune && light.speed === 1000 && dark.speed === 1000 && light.dmg === 1000 && dark.dmg === 1000,
  };
});

console.log(JSON.stringify({ engine: "bright-line-audit", rows }, null, 2));
