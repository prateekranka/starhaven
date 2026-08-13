# Starhaven — agent notes

Offline WebGL2 skirmish with an iPad WKWebView host. Playtesters give feedback from the Cursor iOS app; cloud agents apply the fix and ship something the iPad can load.

Do not use Flowdeck.

## Live surfaces

- Production gameplay pack: https://starhaven.contenthelper.in/ (branch `main`, Pages project `starhaven`)
- Dev gameplay pack: https://dev.starhaven.contenthelper.in/ (branch `dev`, Pages project `starhaven-dev`)
- GitHub (push here): `prateekranka/starhaven`
- Cloudflare account: `920d78e6c05a8e15380d6205aa3f38b4`
- TestFlight app: Starhaven Bright Frontier, App Store id `6800975731`, bundle `com.prateekranka.starhaven`, team `4JRB53LG5C`
- iOS host: `ios/Starhaven/`, XcodeGen `ios/project.yml`, scheme `Starhaven`

`CLOUDFLARE_API_TOKEN` deploys web packs only. It cannot archive, sign, or upload a TestFlight or Sqim IPA. Those need macOS, Xcode, and Apple signing (`./scripts/ship-ipad.sh`).

## Classify the feedback

- **Web / sim / art / UI in `src/` or `public/`:** ship a Cloudflare pack. Default playtest target is **dev**. The TestFlight shell fetches `build-info.json` on launch (and on title foreground / Reload pack in newer shells). Native 4+ can switch Production/Dev on the title screen. No new IPA for web-only fixes.
- **Swift / Info.plist / WKWebView / `GameCache`:** needs a new device IPA (Sqim install link or TestFlight). Linux cloud VMs cannot sign iOS apps.

Never put `https://starhaven.contenthelper.in` or `https://dev.starhaven.contenthelper.in` in web `src/` (`verify:offline` forbids it). Keep origins in Swift only.

## Ship a web pack (default for gameplay feedback)

1. Implement the change.
2. `npm run typecheck` and `npm test` when the change is in TS.
3. Commit. Push to **`prateekranka/starhaven`**:
   - Playtest / iteration: push **`dev`**
   - Production: push **`main`** only when asked to ship prod
   - Cloud clone: `git push origin HEAD:dev` (or `main`)
   - This workstation also has remote `starhaven`: `git push starhaven HEAD:dev`
   - Do not force-push. Do not commit `.asc/`, `dist/`, secrets, or `.p8` keys.
4. Deploy the pack:
   - Prefer waiting for GitHub Action **Cloudflare Pages**.
   - If `CLOUDFLARE_API_TOKEN` is in the environment:
     - Dev: `npm run build && npm run deploy:cloudflare:dev`
     - Prod: `npm run build && npm run deploy:cloudflare`
   - Do not claim the live pack updated unless the deploy step succeeded.
5. Tell the tester: title screen → **Dev** (or Production) → Reload pack (or force-quit and reopen). Confirm the BUILD sha in the footer.

## Ship a native IPA (Swift / host)

Only on macOS with Xcode and signing:

```sh
./scripts/ship-ipad.sh sqim
./scripts/ship-ipad.sh testflight
```

- **Sqim** (`squim`/`sqim`): development-signed HTTPS install link. Refresh `sqim login` if `sqim status --json` shows an expired token. Never invent a Sqim URL.
- **TestFlight**: bump `CFBundleVersion` in `ios/Starhaven/Resources/Info.plist` before uploading. Internal testers: App Store Connect app `6800975731`.

If you are on Linux, commit and push the native fix, then say a Mac must run `./scripts/ship-ipad.sh`. Do not pretend TestFlight or Sqim shipped.

## Constraints

- Node ≥ 22.13. `npm ci` then `npm run build`.
- iOS staging (`scripts/release/stage-ios-dist.mjs`) requires a clean git tree and clean `build-info.json`.
- Match renderer lives in `src/render/`. Native cache: `ios/Starhaven/Bridge/GameCache.swift`.
