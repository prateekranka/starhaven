# Starhaven — agent notes

Offline WebGL2 skirmish with an iPad WKWebView host. Playtesters give feedback from the Cursor iOS app; cloud agents apply the fix and ship something the iPad can load.

Do not use Flowdeck.

## Branches

- **`dev` (this branch) is the pixel-mesa pack.** A clone of `dev` is the live playtest game: `index.html`, `js/`, `css/`, `media/`, `vendor/`, `sw.js`, `_headers`, `build-info.json`, `dist-hashes.json`. There is no Vite `package.json` build on `dev`. Do not run `npm ci` / `npm run build` here — that would rebuild the greybox.
- **`main` is the Vite greybox** (`src/`, `public/`, `npm run build` → `dist/`). Production Cloudflare still deploys that tree. Do not merge `dev` into `main` unless asked.

## Live surfaces

- Production gameplay pack: https://starhaven.contenthelper.in/ (branch `main`, Pages project `starhaven`, Vite greybox)
- Dev gameplay pack: https://dev.starhaven.contenthelper.in/ (branch `dev`, Pages project `starhaven-dev`, pixel-mesa static pack)
- GitHub (push here): `prateekranka/starhaven`
- Cloudflare account: `920d78e6c05a8e15380d6205aa3f38b4`
- TestFlight app: Starhaven Bright Frontier, App Store id `6800975731`, bundle `com.prateekranka.starhaven`, team `4JRB53LG5C`
- iOS host: `ios/Starhaven/`, XcodeGen `ios/project.yml`, scheme `Starhaven`

`CLOUDFLARE_API_TOKEN` deploys web packs only. TestFlight from a cloud agent uses GitHub Action **TestFlight** (`macos-15`) with Apple secrets, not the Cloudflare token.

## Classify the feedback

- **Web / sim / art / UI on `dev`:** edit `js/`, `css/`, `index.html`, `media/`. Ship a Cloudflare pack (static deploy). Default playtest target is **dev**. The TestFlight shell fetches `build-info.json` on launch (and on title foreground / Reload pack in newer shells). Native 4+ can switch Production/Dev on the title screen. No new IPA for web-only fixes.
- **Web on `main` (greybox):** `src/` or `public/`, then `npm run build`. Only when asked to change production greybox.
- **Swift / Info.plist / WKWebView / `GameCache`:** needs a new TestFlight or Sqim IPA. Cloud Linux cannot sign locally; trigger GitHub Action **TestFlight** after push (`gh workflow run testflight.yml --ref main`). Native ships from **`main`** (Vite + iOS). Do not run the TestFlight workflow against `dev` — this branch has no `npm` build.

Never put `https://starhaven.contenthelper.in` or `https://dev.starhaven.contenthelper.in` in pack JS/HTML. Keep origins in Swift only.

## Ship a web pack (default for gameplay feedback)

On **`dev`** (pixel pack):

1. Implement the change in the static tree (`js/`, `css/`, `index.html`, `media/`).
2. Commit. Push to **`prateekranka/starhaven`**:
   - Playtest / iteration: push **`dev`**
   - Production greybox: push **`main`** only when asked to ship prod
   - Cloud clone: `git push origin HEAD:dev` (or `main`)
   - This workstation also has remote `starhaven`: `git push starhaven HEAD:dev`
   - Do not force-push. Do not commit `.asc/`, `dist/`, `node_modules/`, secrets, or `.p8` keys. **Do** commit `media/` and `vendor/` — they are the product.
3. Deploy the pack:
   - Prefer waiting for GitHub Action **Cloudflare Pages**. On `dev` it deploys the static tree as-is to `starhaven-dev` (no `npm run build`).
   - If `CLOUDFLARE_API_TOKEN` is in the environment, you can wrangler-deploy the pack directory (repo root pack files, not `dist/`).
   - Do not claim the live pack updated unless the deploy step succeeded.
4. Tell the tester: title screen → **Dev** (or Production) → Reload pack (or force-quit and reopen). Confirm the BUILD sha in the footer.

**Checkpoint gate:** a checkpoint is not done until a blind cold-player critique passes — title CTA honest (no fake campaign), BUILD `displaySha` matches live `build-info.json`, settings readable, maps load, no broken start path. Fail a lie or broken flow → hotfix on the same checkpoint before calling it shipped.

On **`main`** (greybox only): `npm run typecheck` and `npm test` when the change is in TS, then `npm run build` and the Vite Cloudflare path (`npm run deploy:cloudflare`).

## Ship a native IPA (Swift / host)

Prefer GitHub Action **TestFlight** so a cloud agent can ship without this Mac. Use **`main`**:

```sh
gh workflow run testflight.yml --repo prateekranka/starhaven --ref main
gh run watch --repo prateekranka/starhaven
```

Required GitHub secrets (not `CLOUDFLARE_API_TOKEN`):

- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY` (`.p8` body)
- `BUILD_CERTIFICATE_BASE64` (Apple Distribution `.p12`, base64)
- `P12_PASSWORD`

The workflow archives on `macos-15`, uploads 0.1 (`4.<run_number>`), and waits for processing. Internal testers: App Store Connect app `6800975731`.

On a Mac, Sqim/TestFlight can still be local from a **`main`** checkout:

```sh
./scripts/ship-ipad.sh sqim
./scripts/ship-ipad.sh testflight
```

- **Sqim** (`squim`/`sqim`): development-signed HTTPS install link. Refresh `sqim login` if the token expired. Never invent a Sqim URL.

## Constraints

- **`dev`:** static pixel pack. Cloudflare Pages copies `index.html` / `js/` / `css/` / `media/` / `vendor/` — no Node build.
- **`main`:** Node ≥ 22.13. `npm ci` then `npm run build`.
- iOS staging (`scripts/release/stage-ios-dist.mjs`) is a **`main`** Vite path.
- Pixel renderer/sim lives in `js/`. Native cache: `ios/Starhaven/Bridge/GameCache.swift`.
