# Starhaven audio provenance

All shipped audio in `media/audio/` is **original work** generated procedurally in this repository. No commercial recordings, sampled third-party loops, or unlicensed assets are included.

## Generation

| Asset | Source | License |
| --- | --- | --- |
| `ui.wav`, `select.wav`, `move.wav`, … (SFX) | `scripts/generate-audio.mjs` | Proprietary — Prateek Ranka / Starhaven project |
| `music_title.wav` | `scripts/generate-audio.mjs` (`musicTitle`) | Proprietary — Prateek Ranka / Starhaven project |
| `music_day.wav` | `scripts/generate-audio.mjs` (`musicDay`) | Proprietary — Prateek Ranka / Starhaven project |
| `music_night.wav` | `scripts/generate-audio.mjs` (`musicNight`) | Proprietary — Prateek Ranka / Starhaven project |
| `music_combat.wav` | `scripts/generate-audio.mjs` (`musicCombat`) | Proprietary — Prateek Ranka / Starhaven project |
| `music_victory.wav` | `scripts/generate-audio.mjs` (`musicVictory`) | Proprietary — Prateek Ranka / Starhaven project |
| `music_defeat.wav` | `scripts/generate-audio.mjs` (`musicDefeat`) | Proprietary — Prateek Ranka / Starhaven project |

Regenerate the pack:

```sh
node scripts/generate-audio.mjs
```

Output format: mono 16-bit PCM WAV at 22050 Hz.

## App Store / attribution

- **Third-party attribution:** not required — no CC-BY or external music libraries are bundled.
- **In-game notice:** Settings screen links here for reviewer transparency (`index.html`).
- **Ownership:** copyright and distribution rights rest with the Starhaven project author; suitable for App Store submission as first-party assets.

## Size budget (issue #33)

Total audio (SFX + music) must remain **≤ 20 MB**. After regeneration, run:

```sh
du -ch media/audio/*.wav | tail -1
```

## Replaced assets

- `music_mesa.wav` — removed in T32 score integration; superseded by `music_day.wav` / `music_night.wav` with Bright-Line crossfades.
