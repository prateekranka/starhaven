---
name: starhaven-ipad-loop
description: Apply Starhaven playtest feedback from the Cursor iOS app on iPad, then ship a Cloudflare gameplay pack or a Sqim/TestFlight device build. Use when the user reports bugs, balance, art, controls, or host issues from an iPad, asks to push a squim/sqim/TestFlight build, or is iterating away from a Mac.
---

# Starhaven iPad playtest loop

Read `AGENTS.md` first.

`dev` is the pixel-mesa static pack. `main` is the Vite greybox.

## After implementing a fix

1. Classify: web on `dev` (`js/`, `css/`, `index.html`, `media/`) vs native (`ios/`). Do not treat `src/`/`public/` as the playtest game on this branch.
2. Commit with a message that names the feedback.
3. Push to `prateekranka/starhaven` (`origin` on cloud clones; remote `starhaven` on the workstation). Default playtest branch is **`dev`**. Push **`main`** only for production greybox.
4. Web on `dev`: wait for GitHub Action **Cloudflare Pages** (static deploy to `starhaven-dev`) or wrangler-deploy the pack files. Do **not** `npm run build` on `dev`. Reply with the commit SHA, https://dev.starhaven.contenthelper.in/, and "title screen → Dev → Reload pack".
5. **Checkpoint gate:** not done until a blind cold-player critique — honest title CTA, BUILD sha matches live pack, settings readable, maps JSON loads, no campaign lie. Hotfix same checkpoint if anything fails.
6. Native: `gh workflow run testflight.yml --repo prateekranka/starhaven --ref main`. Do not claim a build shipped unless the run succeeded. Sqim remains Mac-only from a `main` checkout (`./scripts/ship-ipad.sh sqim`).
7. `CLOUDFLARE_API_TOKEN` cannot produce TestFlight builds.

Sqim device builds need a logged-in `sqim` CLI (`sqim login` if the token expired). `sqim remote-build` is simulator-only and is useless for iPad playtest.
