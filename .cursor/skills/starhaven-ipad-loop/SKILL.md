---
name: starhaven-ipad-loop
description: Apply Starhaven playtest feedback from the Cursor iOS app on iPad, then ship a Cloudflare gameplay pack or a Sqim/TestFlight device build. Use when the user reports bugs, balance, art, controls, or host issues from an iPad, asks to push a squim/sqim/TestFlight build, or is iterating away from a Mac.
---

# Starhaven iPad playtest loop

Read `AGENTS.md` first.

## After implementing a fix

1. Classify: web (`src/`, `public/`) vs native (`ios/`).
2. Commit with a message that names the feedback.
3. Push to `prateekranka/starhaven` (`origin` on cloud clones; remote `starhaven` on the workstation). Default playtest branch is **`dev`**. Push **`main`** only for production.
4. Web: deploy Cloudflare (`npm run deploy:cloudflare:dev` or `npm run deploy:cloudflare` if `CLOUDFLARE_API_TOKEN` exists; otherwise wait for the **Cloudflare Pages** GitHub Action). Reply with the commit SHA, the environment URL, and "title screen → Dev or Production → Reload pack".
5. Native: `gh workflow run testflight.yml --repo prateekranka/starhaven --ref <branch>` and wait for the **TestFlight** action. Do not claim a build shipped unless the run succeeded. Sqim remains Mac-only (`./scripts/ship-ipad.sh sqim`).
6. `CLOUDFLARE_API_TOKEN` cannot produce TestFlight builds.

Sqim device builds need a logged-in `sqim` CLI (`sqim login` if the token expired). `sqim remote-build` is simulator-only and is useless for iPad playtest.
