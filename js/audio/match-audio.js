import { audio } from "./engine.js";
import { score } from "./score.js";

export function createMatchAudio() {
  const hp = new Map();
  let gathered = { food: 0, wood: 0, crystal: 0, ore: 0 };
  let winner = null;

  function snapshot(world) {
    for (const e of [...world.units, ...world.buildings]) hp.set(e.id, e.hp);
    if (world.players?.player?.gathered) gathered = { ...world.players.player.gathered };
    winner = world.winner;
  }

  return {
    reset(world) {
      hp.clear();
      gathered = { food: 0, wood: 0, crystal: 0, ore: 0 };
      winner = null;
      if (world) snapshot(world);
    },
    tick(world, view) {
      if (!world || !view) return;
      const cam = view.cameraInfo?.() || { x: 48, z: 48 };
      audio.setCamera(cam.x, cam.z);

      const seen = new Set();
      for (const e of [...world.units, ...world.buildings]) {
        seen.add(e.id);
        const prev = hp.get(e.id);
        if (prev != null && e.hp > 0 && e.hp < prev - 0.05) {
          audio.play(prev - e.hp > 18 || e.kind === "building" ? "hit_heavy" : "hit", { x: e.x, z: e.z });
          score.noteCombat(prev - e.hp > 18 ? 0.32 : 0.18);
        }
        if (prev != null && prev > 0 && e.hp <= 0) {
          audio.play(e.kind === "building" ? "death_building" : "death_unit", { x: e.x, z: e.z });
          score.noteCombat(e.kind === "building" ? 0.45 : 0.28);
        }
        hp.set(e.id, e.hp);
      }
      for (const id of hp.keys()) if (!seen.has(id)) hp.delete(id);

      const pg = world.players?.player?.gathered;
      if (pg) {
        for (const k of ["food", "wood", "crystal", "ore"]) {
          if (pg[k] > gathered[k] + 0.5) audio.play("gather", { volume: 0.75 });
        }
        gathered = { ...pg };
      }

      if (world.winner && world.winner !== winner) {
        audio.play(world.winner === "player" ? "victory" : "defeat");
        score.playEnd(world.winner === "player");
      }
      winner = world.winner;

      score.tick(world, view);
    },
  };
}
