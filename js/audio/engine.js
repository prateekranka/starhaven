import { loadSave } from "../boot.js";

export const AUDIO_FILES = {
  ui: "media/audio/ui.wav",
  select: "media/audio/select.wav",
  move: "media/audio/move.wav",
  attack: "media/audio/attack.wav",
  train: "media/audio/train.wav",
  train_fail: "media/audio/train_fail.wav",
  build: "media/audio/build.wav",
  build_fail: "media/audio/build_fail.wav",
  gather: "media/audio/gather.wav",
  hit: "media/audio/hit.wav",
  hit_heavy: "media/audio/hit_heavy.wav",
  death_unit: "media/audio/death_unit.wav",
  death_building: "media/audio/death_building.wav",
  victory: "media/audio/victory.wav",
  defeat: "media/audio/defeat.wav",
  age_up: "media/audio/age_up.wav",
  music_title: "media/audio/music_title.wav",
  music_day: "media/audio/music_day.wav",
  music_night: "media/audio/music_night.wav",
  music_combat: "media/audio/music_combat.wav",
  music_victory: "media/audio/music_victory.wav",
  music_defeat: "media/audio/music_defeat.wav",
};

const BUS_OF = {
  ui: "ui", select: "sfx", move: "sfx", attack: "sfx", train: "sfx", train_fail: "sfx",
  build: "sfx", build_fail: "sfx", gather: "sfx", hit: "sfx", hit_heavy: "sfx",
  death_unit: "sfx", death_building: "sfx", victory: "sfx", defeat: "sfx", age_up: "sfx",
};

const THROTTLE_MS = {
  ui: 35, select: 45, move: 70, attack: 70, train: 110, train_fail: 110,
  build: 90, build_fail: 90, gather: 180, hit: 55, hit_heavy: 75,
  death_unit: 160, death_building: 260, victory: 0, defeat: 0, age_up: 0,
};

const COMBAT_BURST_MS = 48;
const COMBAT_BURST_MAX = 5;
const MAP_HALF = 48;

class StarhavenAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buses = { ui: null, sfx: null, music: null };
    this.buffers = new Map();
    this.lastPlay = new Map();
    this.combatWindowStart = 0;
    this.combatWindowCount = 0;
    this.cameraX = MAP_HALF;
    this.cameraZ = MAP_HALF;
    this.musicLayers = new Map();
    this.ready = false;
    this.loadPromise = null;
    this.unlocked = false;
    this.onUnlock = null;
  }

  volumes() {
    const s = loadSave().settings;
    return { music: s.music ?? 0.35, sfx: s.sfx ?? 0.7 };
  }

  applyVolumes() {
    const v = this.volumes();
    if (!this.buses.ui) return;
    this.buses.ui.gain.value = v.sfx;
    this.buses.sfx.gain.value = v.sfx;
    this.buses.music.gain.value = v.music;
  }

  setCamera(x, z) {
    if (Number.isFinite(x)) this.cameraX = x;
    if (Number.isFinite(z)) this.cameraZ = z;
  }

  panFor(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    return Math.max(-1, Math.min(1, ((x - this.cameraX) / MAP_HALF) * 0.85));
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    for (const name of ["ui", "sfx", "music"]) {
      const g = this.ctx.createGain();
      g.connect(this.master);
      this.buses[name] = g;
    }
    this.applyVolumes();
    return this.ctx;
  }

  async unlock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    this.unlocked = true;
    this.onUnlock?.();
  }

  async preload(onProgress) {
    if (this.ready) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const entries = Object.entries(AUDIO_FILES);
      let done = 0;
      await Promise.all(entries.map(async ([key, url]) => {
        try {
          const res = await fetch(url, { cache: "force-cache" });
          if (!res.ok) throw new Error(`audio missing: ${url}`);
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          if (ct.includes("text/html")) throw new Error(`audio html fallback: ${url}`);
          this.buffers.set(key, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch (err) {
          console.warn("audio skip", url, err);
        }
        done += 1;
        onProgress?.(done, entries.length, url);
      }));
      this.ready = true;
    })();
    return this.loadPromise;
  }

  _throttled(id, ms, combat) {
    const now = performance.now();
    if (ms > 0) {
      const last = this.lastPlay.get(id) || 0;
      if (now - last < ms) return true;
      this.lastPlay.set(id, now);
    }
    if (combat) {
      if (now - this.combatWindowStart > COMBAT_BURST_MS) {
        this.combatWindowStart = now;
        this.combatWindowCount = 0;
      }
      if (this.combatWindowCount >= COMBAT_BURST_MAX) return true;
      this.combatWindowCount += 1;
    }
    return false;
  }

  play(id, opts = {}) {
    const save = loadSave();
    const busName = BUS_OF[id] || "sfx";
    if (busName !== "music" && !save.settings.sfx) return;
    if (!this.ready) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.unlocked) return;

    const combat = id === "hit" || id === "hit_heavy" || id.startsWith("death");
    if (this._throttled(id, opts.throttleMs ?? THROTTLE_MS[id] ?? 0, combat)) return;

    const buffer = this.buffers.get(id);
    const bus = this.buses[busName];
    if (!buffer || !bus) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    const pan = opts.pan ?? this.panFor(opts.x, opts.z);
    if (Math.abs(pan) > 0.02 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(gain).connect(panner).connect(bus);
    } else {
      src.connect(gain).connect(bus);
    }
    src.start(0);
    src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch { /* ignore */ } };
  }

  playUi() { this.play("ui"); }

  _ensureLayer(id) {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    let layer = this.musicLayers.get(id);
    if (!layer) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.buses.music);
      layer = { gain, src: null, track: null };
      this.musicLayers.set(id, layer);
    }
    return layer;
  }

  setLayerGain(id, value, rampSec = 1.4) {
    const layer = this._ensureLayer(id);
    if (!layer || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = layer.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(Math.max(0, value), t + rampSec);
  }

  startLayer(id, track, { loop = true } = {}) {
    if (!loadSave().settings.music || !this.ready) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.unlocked) return;
    const layer = this._ensureLayer(id);
    if (!layer) return;
    if (layer.track === track && layer.src) return;

    if (layer.src) {
      try { layer.src.stop(); layer.src.disconnect(); } catch { /* ignore */ }
      layer.src = null;
    }

    const buffer = this.buffers.get(track);
    if (!buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.connect(layer.gain);
    src.start(0);
    layer.src = src;
    layer.track = track;
    src.onended = () => {
      if (layer.src === src) {
        layer.src = null;
        layer.track = null;
      }
    };
  }

  stopLayer(id, fadeSec = 0.35) {
    const layer = this.musicLayers.get(id);
    if (!layer?.src || !this.ctx) return;
    const src = layer.src;
    layer.src = null;
    layer.track = null;
    const t = this.ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(t);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, t);
    layer.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
    try { src.stop(t + fadeSec + 0.02); } catch { /* ignore */ }
  }

  stopAllLayers(fadeSec = 0.35) {
    for (const id of [...this.musicLayers.keys()]) this.stopLayer(id, fadeSec);
  }

  /** @deprecated use score director layers */
  startMusic(track = "music_day") {
    this.stopAllLayers(false);
    this.startLayer("legacy", track);
    this.setLayerGain("legacy", 1, 0.05);
  }

  /** @deprecated use score director */
  stopMusic(fade = true) {
    this.stopAllLayers(fade ? 0.35 : 0.01);
  }

  dispose() {
    this.stopAllLayers(false);
    this.musicLayers.clear();
    this.ready = false;
    this.loadPromise = null;
    this.buffers.clear();
    this.lastPlay.clear();
  }
}

export const audio = new StarhavenAudio();

if (typeof window !== "undefined") {
  const unlock = () => {
    audio.unlock();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}
