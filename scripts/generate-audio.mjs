#!/usr/bin/env node
/** Regenerate media/audio/*.wav — run: node scripts/generate-audio.mjs */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SR = 22050;
const OUT = resolve(import.meta.dirname, "../media/audio");

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 0x7fff) | 0, 44 + i * 2);
  }
  writeFileSync(join(OUT, name), buf);
}

function env(t, a, d, s = 0.0001, r = 0.04) {
  if (t < a) return t / a;
  if (t < a + s) return 1;
  if (t < a + s + d) return 1 - (t - a - s) / d;
  if (t < a + s + d + r) return Math.max(0, 1 - (t - a - s - d) / r);
  return 0;
}

function tone(len, fn) {
  const n = (len * SR) | 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

function mix(...parts) {
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

function norm(samples, peak = 0.92) {
  let m = 0;
  for (const v of samples) m = Math.max(m, Math.abs(v));
  if (m < 1e-6) return samples;
  return samples.map((v) => v * (peak / m));
}

function noise(len, fn) {
  const n = (len * SR) | 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, Math.random() * 2 - 1);
  return out;
}

const defs = {
  ui: () => tone(0.07, (t) => Math.sin(2 * Math.PI * (880 - t * 2200) * t) * env(t, 0.002, 0.04) * 0.35),
  select: () => tone(0.09, (t) => Math.sin(2 * Math.PI * 620 * t) * env(t, 0.004, 0.05) * 0.28 + Math.sin(2 * Math.PI * 930 * t) * env(t, 0.004, 0.04) * 0.12),
  move: () => tone(0.11, (t) => Math.sin(2 * Math.PI * (180 + t * 40) * t) * env(t, 0.01, 0.06) * 0.22),
  attack: () => mix(tone(0.14, (t) => Math.sin(2 * Math.PI * 140 * t) * env(t, 0.002, 0.08) * 0.35), noise(0.14, (t, r) => r * env(t, 0.001, 0.06) * 0.18)),
  train: () => tone(0.22, (t) => Math.sin(2 * Math.PI * (320 + Math.floor(t * 12) * 40) * t) * env(t, 0.01, 0.12) * 0.24),
  train_fail: () => tone(0.16, (t) => Math.sin(2 * Math.PI * (120 - t * 80) * t) * env(t, 0.005, 0.1) * 0.3),
  build: () => mix(tone(0.18, (t) => Math.sin(2 * Math.PI * 90 * t) * env(t, 0.002, 0.1) * 0.45), tone(0.18, (t) => Math.sin(2 * Math.PI * 520 * t) * env(t, 0.04, 0.08) * 0.15)),
  build_fail: () => tone(0.12, (t) => Math.sin(2 * Math.PI * 70 * t) * env(t, 0.003, 0.08) * 0.35),
  gather: () => tone(0.13, (t) => Math.sin(2 * Math.PI * (880 + (t * 600) % 400) * t) * env(t, 0.003, 0.07) * 0.22),
  hit: () => noise(0.08, (t, r) => r * Math.max(0, 1 - t * 8) * env(t, 0.001, 0.05) * 0.55),
  hit_heavy: () => mix(noise(0.12, (t, r) => r * env(t, 0.001, 0.08) * 0.5), tone(0.12, (t) => Math.sin(2 * Math.PI * 55 * t) * env(t, 0.002, 0.09) * 0.35)),
  death_unit: () => tone(0.35, (t) => Math.sin(2 * Math.PI * (420 - t * 900) * t) * env(t, 0.005, 0.25) * 0.28),
  death_building: () => mix(noise(0.45, (t, r) => r * env(t, 0.01, 0.3) * 0.35), tone(0.45, (t) => Math.sin(2 * Math.PI * (80 - t * 60) * t) * env(t, 0.01, 0.32) * 0.4)),
  victory: () => tone(0.9, (t) => { const seq = [392, 494, 587, 784]; const i = Math.min(3, (t / 0.18) | 0); return Math.sin(2 * Math.PI * seq[i] * t) * env(t - i * 0.18, 0.01, 0.14) * 0.22; }),
  defeat: () => tone(0.8, (t) => Math.sin(2 * Math.PI * (330 - t * 220) * t) * env(t, 0.02, 0.55) * 0.25),
  age_up: () => mix(tone(0.55, (t) => Math.sin(2 * Math.PI * (220 + t * 180) * t) * env(t, 0.04, 0.35) * 0.2), tone(0.55, (t) => Math.sin(2 * Math.PI * (440 + t * 260) * t) * env(t, 0.06, 0.35) * 0.12)),
  music_mesa: () => {
    const len = 16;
    const n = (len * SR) | 0;
    const out = new Float32Array(n);
    const roots = [110, 146.83, 164.81, 196];
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      for (let k = 0; k < roots.length; k++) {
        const f = roots[k] * (1 + 0.002 * Math.sin(t * 0.17 + k));
        s += Math.sin(2 * Math.PI * f * t + k) * 0.07;
        s += Math.sin(2 * Math.PI * f * 2 * t + k * 0.5) * 0.035;
      }
      out[i] = s * (0.55 + 0.45 * Math.sin(t * 0.39)) * 0.55;
    }
    return out;
  },
};

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, fn] of Object.entries(defs)) {
  const samples = norm(fn());
  writeWav(`${name}.wav`, samples);
  total += 44 + samples.length * 2;
}
console.log(`total ${total} bytes (${(total / 1024 / 1024).toFixed(2)} MB)`);
