---
name: starhaven-ipad-loop
description: Apply Starhaven playtest feedback from the Cursor iOS app on iPad, then ship a Cloudflare gameplay pack or a Sqim/TestFlight device build. Use when the user reports bugs, balance, art, controls, or host issues from an iPad, asks to push a squim/sqim/TestFlight build, or is iterating away from a Mac.
---

# Starhaven iPad playtest loop

Read `AGENTS.md` first.

## After implementing a fix

1. Classify: web (`src/`, `public/`) vs native (`ios/`).
2. Commit with a message that names the feedback.
3. Push to `prateekranka/starhaven` (`origin` on cloud clones; remote `starhaven` on the workstation).
4. Web: deploy Cloudflare (`npm run build` then `npx wrangler pages deploy dist --project-name starhaven --branch main` if `CLOUDFLARE_API_TOKEN` exists; otherwise wait for the **Cloudflare Pages** GitHub Action). Reply with the commit SHA and "return to the title screen and tap Reload pack, or force-quit and reopen".
5. Native on macOS: `./scripts/ship-ipad.sh sqim` (default) or `./scripts/ship-ipad.sh testflight`. Paste only a URL the command actually printed.
6. Native on Linux: do not run Sqim or xcodebuild. Tell the user a Mac must ship the IPA.

Sqim device builds need a logged-in `sqim` CLI (`sqim login` if the token expired). `sqim remote-build` is simulator-only and is useless for iPad playtest.
