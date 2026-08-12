# Starhaven build strategy: Three.js gameplay with Swift menus

**Scope.** This is a greenfield plan for a stylized, iPad-first strategy game. The supplied images define a fixed oblique camera, 3D terrain and buildings, directional pixel-art units, touch controls, asymmetric factions, and native-quality menus. Sources were checked on 2026-08-12. No existing implementation is assumed.

## 1. Final architecture decision

Build the complete match runtime in **TypeScript and Three.js**. Embed that runtime in one `WKWebView` inside a SwiftUI app. Build the main menu, match setup, tutorial selection, faction encyclopedia, settings, pause menu, save browser, and results screen in SwiftUI.

There is no game-engine iOS export. Xcode packages two parts:

1. The Swift app shell.
2. A locally built web bundle containing the Three.js game and its assets.

Keep the in-match HUD, minimap, selection indicators, tooltips, and command panel in the web runtime. These elements read changing match state every frame. Moving them to Swift would create a high-frequency bridge and duplicate layout logic.

| Layer | Owns | Does not own |
|---|---|---|
| SwiftUI shell | Menus, app navigation, settings, save files, pause/results, haptics, Game Center, StoreKit if added later | Units, map state, combat, pathfinding, camera, in-match HUD |
| WebKit host | Local asset loading, lifecycle forwarding, Swift–JavaScript messages, navigation restrictions | Game rules |
| TypeScript simulation | Units, buildings, resources, orders, fog, AI, victory, replay, save snapshot | Swift view state |
| Three.js presentation | Terrain, buildings, sprites, VFX, camera, picking, animation, minimap render | Authoritative rules |
| HTML/CSS match UI | In-match HUD and touch command controls | App-level navigation |

Apple describes `WKWebView` as a native view that presents HTML, CSS, and JavaScript beside native UI. It supports local content, navigation control, script execution, and custom resource schemes ([WKWebView](https://developer.apple.com/documentation/webkit/wkwebview/)). Three.js `WebGLRenderer` uses WebGL 2, while WebKit uses a Metal-backed WebGL implementation on Apple platforms ([Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [WebKit WebGL 2](https://webkit.org/blog/11989/new-webkit-features-in-safari-15/)).

Use **WebGL 2 as the production graphics baseline**. Do not make WebGPU a release requirement. WebGPU availability has differed between Safari and embedded `WKWebView`, so it is not a safe baseline for the first version ([WebKit WebGPU testing](https://webkit.org/blog/14879/webgpu-now-available-for-testing-in-safari-technology-preview/), [WebKit issue 284621](https://bugs.webkit.org/show_bug.cgi?id=284621)).

## 2. Production stack

| Area | Selected tool | Reason |
|---|---|---|
| Native shell | SwiftUI + WebKit | Native menus and Apple services with one embedded gameplay view |
| Web build | TypeScript in strict mode + Vite | Fast reload, small production bundle, standard asset pipeline |
| Renderer | Three.js `WebGLRenderer` | Direct fit for the supplied Three.js references and hybrid 3D/2D art |
| 3D loading | `GLTFLoader` + `KTX2Loader` + Meshopt decoder | Standard GLB loading, compressed textures, and optimized geometry |
| Repeated geometry | `InstancedMesh` | Fewer draw calls for props and repeated buildings |
| Unit rendering | Instanced camera-facing quads with atlas metadata | Efficient directional sprite animation at RTS scale |
| Simulation | Plain TypeScript data with a fixed step | Testable rules that do not depend on scene objects |
| Navigation | Logical grid, A*, cached flow fields, reservation/local steering | Better control than physics for mass RTS movement |
| Optional navmesh | `recast-navigation-js` | Only for terrain that cannot use the logical grid |
| Optional physics | Rapier JS/WASM | Projectiles or special collisions only |
| 3D authoring | Blender | Stable source files, rigging, animation, modular environment work |
| Exchange format | glTF 2.0 binary (`.glb`) | Open runtime delivery format with broad tool support |
| 3D texture format | KTX2/Basis Universal | Smaller GPU-ready material textures |
| Sprite format | Lossless PNG atlases plus JSON manifests | Preserves crisp pixel edges and exact frame data |

Three.js officially supports glTF extensions for Basis textures, texture transforms, Meshopt compression, quantization, and GPU instancing through `GLTFLoader` ([GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)). `KTX2Loader` transcodes Basis textures into a format supported by the device GPU ([KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)). `InstancedMesh` reduces draw calls when many objects share geometry and material ([InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)).

## 3. Swift and Three.js integration

### Local runtime packaging

Build the game with Vite and set its asset base to a relative path. Copy the resulting `dist` directory into the app bundle during a controlled build step. The first version must not require a network connection to load code, shaders, maps, or core assets.

Serve the bundle through a private URL such as `starhaven-game://bundle/index.html`. Implement this with `WKURLSchemeHandler`. Apple provides this protocol for resources that use a custom scheme and registers it through `WKWebViewConfiguration` ([WKURLSchemeHandler](https://developer.apple.com/documentation/webkit/wkurlschemehandler), [`setURLSchemeHandler`](https://developer.apple.com/documentation/webkit/wkwebviewconfiguration/seturlschemehandler(_:forurlscheme:))). This approach gives Swift explicit control over MIME types, missing files, cache policy, and path traversal.

The scheme handler must:

- Serve files only from the bundled game directory.
- Normalize each requested path and reject traversal outside that directory.
- Return correct MIME types for JavaScript, CSS, JSON, GLB, KTX2, PNG, audio, and WASM.
- Reject unknown methods and external navigation.
- Report missing assets as structured load failures.

Apple also supports loading a local file directly. Keep `loadFileURL` as a diagnostic fallback, not the selected production path ([WKWebView local loading](https://developer.apple.com/documentation/webkit/wkwebview/)).

### Bridge contract

Use one versioned message protocol. Do not expose arbitrary JavaScript evaluation to game data.

JavaScript sends coarse events to Swift through a named script message handler:

```ts
type GameToNativeMessage = {
  protocolVersion: 1;
  requestID?: string;
  type:
    | "runtimeReady"
    | "loadProgress"
    | "saveRequested"
    | "matchPaused"
    | "matchEnded"
    | "hapticRequested"
    | "fatalError"
    | "metricBatch";
  payload: unknown;
};
```

Swift sends commands through `callAsyncJavaScript`, which Apple documents as an asynchronous JavaScript call with explicit arguments ([WKWebView script execution](https://developer.apple.com/documentation/webkit/wkwebview/)):

```ts
type NativeToGameCommand = {
  protocolVersion: 1;
  requestID: string;
  type:
    | "startMatch"
    | "importSave"
    | "exportSave"
    | "pause"
    | "resume"
    | "setAudio"
    | "setSafeArea"
    | "appDidEnterBackground"
    | "appWillEnterForeground"
    | "quitMatch";
  payload: unknown;
};
```

Bridge rules:

- Validate the protocol version, message type, and payload on both sides.
- Keep unit positions, animation frames, path state, and resource ticks inside TypeScript.
- Never send one message per frame or per unit.
- Batch diagnostics at a low rate.
- Use request IDs for save, load, and start-match responses.
- Keep secrets, receipts, and private platform credentials out of JavaScript.
- Treat IndexedDB as a cache. Keep durable save files in Swift-owned app storage.

The runtime exports a versioned save snapshot only at checkpoints, autosave points, background transitions, and explicit save commands. Each snapshot includes the content version, simulation version, seed, tick, command history boundary, and checksum. Swift writes that snapshot atomically and owns migration between released save formats.

### App navigation

Use this native flow:

```text
Launch
  -> Main Menu
      -> Continue -> Load Save -> Gameplay
      -> Skirmish -> Match Setup -> Gameplay
      -> Tutorial -> Lesson Setup -> Gameplay
      -> Factions
      -> Settings

Gameplay
  -> Native Pause Menu -> Resume / Restart / Save / Quit
  -> Native Results Screen -> Rematch / Main Menu
```

Create the `WKWebView` only when gameplay starts. Keep it alive during pause. Destroy it after a completed quit or result transition, after Swift receives the final snapshot. This limits retained GPU memory while preserving a fast pause/resume path.

## 4. Three.js runtime design

### Simulation

Use one authoritative simulation service. Scene objects must never be authoritative game state.

- Run the simulation at a fixed 20 or 30 ticks per second.
- Render with `requestAnimationFrame`.
- Interpolate visual transforms between completed simulation states.
- Clamp long frame gaps before processing accumulated steps.
- Give every entity a stable integer ID.
- Process entities and commands in a stable order.
- Use a seeded random generator for gameplay.
- Prefer integer grid positions and integer resource values.
- Record player and AI commands for replay.
- Generate a periodic state hash for regression checks.

JavaScript floating-point behavior does not guarantee bit-identical results across every engine and architecture. The first goal is repeatable play in the supported WebKit device matrix. Multiplayer lockstep is not a first-version goal.

Use plain data structures and typed arrays for hot unit state. Avoid a complex entity-component framework until profiling proves that it reduces cost. Keep the renderer behind read-only presentation adapters so Node-based tests can run the full simulation without WebGL.

### Map and navigation

Use a chunked logical grid as the source of truth. Each cell stores terrain class, height band, movement cost, build permission, occupancy, resource type, and visibility.

1. Use A* for a small number of individual routes.
2. Use cached flow fields for many units moving toward the same goal.
3. Use a reservation grid and short-range steering to prevent unit overlap.
4. Recalculate only dirty map regions after construction or destruction.
5. Keep decorative meshes outside navigation data.

Use `recast-navigation-js` only when a map requires free movement over irregular geometry. Its TypeScript/WASM package supports navmesh generation, queries, crowd simulation, and GLTF navmesh export under MIT ([recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)). A logical grid remains simpler for building footprints, fog, resource placement, and group orders.

Do not use rigid-body physics for normal unit movement. Rapier is a credible optional WebAssembly dependency for projectiles or special collisions, and it documents deterministic support under defined conditions ([Rapier JS](https://github.com/dimforge/rapier.js/), [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/)).

### Camera and input

Lock the first gameplay camera to one orthographic bearing and elevation. Permit pan and zoom. Do not permit free rotation in the first version. A fixed camera reduces sprite directions, hidden geometry, input ambiguity, map-art requirements, and test combinations.

Use Pointer Events inside the web view:

- One tap selects a unit or building.
- A drag creates a selection box.
- A tap on terrain issues the current command.
- One-finger drag pans when selection drag is not active.
- A two-pointer gesture zooms.
- A long press opens contextual information.
- A visible cancel action exits build or target mode.

Disable browser scrolling, selection, link previews, overscroll, and navigation gestures in the gameplay view. Forward safe-area values from Swift. Test Apple Pencil, trackpad, and keyboard only after touch controls pass.

### Rendering

Use one Three.js scene and one renderer. Start with a fixed orthographic camera.

- Build terrain as cullable chunks.
- Use GLB meshes for buildings and large landmarks.
- Use `InstancedMesh` for rocks, plants, crystals, and repeated static modules.
- Keep interactive buildings as separate logical entities, but batch their non-changing visual parts.
- Cap device pixel ratio. Add measured dynamic resolution before lowering art quality.
- Dispose geometries, materials, textures, and render targets when leaving a map.
- Prewarm important shaders during a loading screen.
- Load the first playable view before optional distant content.

Render standard units as instanced camera-facing quads. Group instances by atlas and material. Store world transform, atlas frame, faction tint, selection state, and damage flash in instance attributes. Prefer alpha-tested sprite edges to large blended layers. Keep translucent VFX in separate bounded batches.

Do not create one `THREE.Sprite`, material, or texture per unit. That design increases object management and draw calls. A custom instanced sprite batch requires more initial code, but it is the durable production design for large formations.

The match HUD should use HTML and CSS over the canvas. It can read the same TypeScript state without crossing into Swift. Use DOM updates only when displayed values change.

### Performance gates

Profile the exact `WKWebView` build on physical iPads. Desktop Safari and the simulator are useful development surfaces, but they are not release proof. Apple recommends device graphics traces and stable performance settings ([Apple graphics analysis](https://developer.apple.com/documentation/xcode/analyzing-the-performance-of-your-metal-app/)).

Proposed gates:

- Target 60 frames per second during ordinary play.
- Permit a measured 30 frames per second fallback on the oldest supported iPad.
- Keep the 95th percentile render frame below 16.67 ms at the 60 fps setting.
- Keep the simulation step below its 33.3 ms budget at 30 ticks per second.
- Test 50, 100, 250, and 500 active units. Stop scaling at the first failed tier.
- Run a 10-minute match with both factions, VFX, camera sweeps, zoom changes, and repeated selection.
- Record JavaScript heap, GPU memory indicators, draw calls, triangles, texture count, shader stalls, touch latency, and thermal behavior.
- Force background/foreground transitions, memory pressure, renderer recreation, and WebGL context loss.

Three.js exposes renderer counters through `renderer.info`. Use those counters for continuous budgets, then use Safari Web Inspector and Xcode device tools for actual diagnosis ([WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [inspectable web content](https://developer.apple.com/documentation/safari-developer-tools/enabling-inspecting-content-in-your-apps)).

## 5. Asset pipeline

### Art bible

Before production generation, lock these rules:

- Camera bearing, elevation, orthographic size, and unit screen height.
- Pixel grid, outline width, contrast, shadow direction, and faction color keys.
- World scale, tile size, footprint sizes, pivots, and contact points.
- Eight direction names and their exact clockwise order.
- Animation names, frame timing, event markers, and transition rules.
- Atlas page size, padding, filtering, alpha, and metadata schema.
- LOD names, distances, material limits, and texture budgets.

The images establish two strong visual systems. Sunwoven uses ivory, teal, turquoise, and gold. Gravemark uses basalt, charcoal, bronze, and blue or violet emissive details. Preserve these as faction-level tokens rather than hand-tuning each asset.

### Terrain and buildings

Use Blender for modular terrain, buildings, props, unit masters, rigs, and animation. Export visible runtime assets as GLB. Blender's glTF exporter supports meshes, materials, textures, skinning, and animation ([Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)). Blender's license does not apply to artwork created with Blender ([Blender license guidance](https://docs.blender.org/manual/en/latest/getting_started/about/license.html)).

Run this automated path:

```text
.blend source
  -> GLB export
  -> glTF-Transform inspect/optimize
  -> KTX2 texture encoding where suitable
  -> Khronos glTF Validator
  -> runtime load test
  -> physical-iPad screenshot and metric capture
```

glTF is a royalty-free runtime asset format maintained by Khronos ([glTF registry](https://registry.khronos.org/glTF/)). glTF-Transform can inspect and optimize geometry, textures, and draw-call structure ([glTF-Transform CLI](https://gltf-transform.dev/cli)). The Khronos validator checks GLB structure, buffers, images, and animation data and returns machine-readable reports ([glTF Validator](https://github.com/KhronosGroup/glTF-Validator)).

Use KTX2/Basis for 3D color, normal, and material textures. Keep a PNG fallback until the target device matrix passes. Do not block-compress crisp pixel sprite atlases without a visual comparison. The KHR_texture_basisu extension defines KTX2 delivery and portable GPU transcoding ([KHR_texture_basisu](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md)).

### Directional units

Treat the supplied character sheets as concept and silhouette references. They are not import-ready atlases because frame boxes, baselines, pivots, direction order, animation timing, and equipment placement vary.

Use a rigged 3D master as the source for any unit that needs several directions, actions, ages, or equipment variations:

1. Approve a front, back, side, and three-quarter turnaround.
2. Model, retopologize, rig, and animate the unit in Blender.
3. Render it through the locked orthographic camera.
4. Produce eight directions first.
5. Quantize and clean the rendered frames to the approved pixel palette.
6. Pack lossless atlases with padding.
7. Emit a manifest with frame, duration, pivot, facing, action, event marker, and source hash.
8. Load the atlas into the instanced Three.js sprite batch.

Start with these provisional frame counts:

| Action | Frames | Playback |
|---|---:|---:|
| Idle | 4–6 | 8–10 fps |
| Walk | 8 | 10–12 fps |
| Gather/build | 8–12 | 10–12 fps |
| Attack/cast | 8–12 | 12–15 fps |
| Hit | 3–6 | 12–15 fps |
| Death | 8–12 | 10–12 fps |

These are production starting points, not standards. Add 16 directions only for heroes, large units, or weapons that fail a 360-degree turning test. Never mirror asymmetric weapons, shields, backpacks, or insignia.

Spriterrific documents an eight-direction RTS-oblique workflow, but its package labels itself alpha and keeps human approval steps. Use it for draft sheets or frame-selection experiments, not unattended final production ([Spriterrific](https://pypi.org/project/spriterrific/)).

### VFX

Use small shader and particle families for crystals, fire, energy, projectile trails, selection rings, and impacts. The supplied Three.js VFX and fire references are useful test cases. Reimplement only the required technique after checking its source license.

- Batch particles by material.
- Set hard per-effect and per-scene limits.
- Seed gameplay-relevant effects.
- Keep cosmetic particles outside simulation state.
- Bake complex art-directed effects into flipbooks.
- Test overdraw at the closest and widest zoom.

## 6. How to use the supplied references

| Reference group | Decision | Production use |
|---|---|---|
| Three.js Elemental Sandbox, fire simulation, Towers, terrain experiments | Study and reproduce in isolated test scenes | Shaders, particles, instancing, terrain, weather, camera, and touch techniques |
| Widelands | Study only | Economy, campaigns, data-driven content, and mature RTS behavior |
| Spriterrific and character-sheet prompts | Pilot | Turnarounds, directional sheet drafts, and identity checks |
| Tripo, Shapeshift workflow, and Modly | Pilot before Blender cleanup | Blockouts, rig starts, motion extraction, and rough prop generation |
| Polyfork and suburban asset packs | Buy selectively | Background props after asset-level license, scale, topology, texture, and LOD checks |
| forge3d | Offline tool or reference | Terrain visualization and cartographic checks, not runtime rendering |
| WorldClaw and editable-world generation | Research only | Future editor and procedural-layout ideas |
| Progressive realism workflow | Use as an asset review sequence | Blockout, topology, materials, rig, light, environment, then device proof |
| GameMaker 3D demo | Skip | It does not improve the selected runtime |
| MuJoCo inverse kinematics | Skip | Robotics IK does not solve RTS movement or sprite production |
| Street Fighter animation | Visual timing reference only | Attack anticipation, impact, and recovery timing |
| Edge-case specification method | Use during feature definition | Turn each rule into explicit invariants and failure cases |
| Watermark-removal tools | Do not use in the asset pipeline | Preserve originals, generator metadata, rights records, and manual edits |

Widelands is GPL v2+ and its assets use varied Creative Commons terms. Read its architecture, but do not copy its code or art into a proprietary game ([Widelands repository](https://github.com/widelands/widelands)).

Three.js Towers documents useful procedural and performance methods, but its repository does not grant general reuse rights for its code or artwork. Study its results and implement the required methods independently ([Towers repository](https://github.com/MengTo/towers)).

WorldClaw is currently a research project with a paper and project repository, not a documented production SDK with a reusable implementation license. Treat it as future world-authoring research ([paper](https://arxiv.org/abs/2608.05248), [repository](https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw)).

Tripo provides image, text, multiview, low-poly, rigging, retargeting, and export APIs. Its service terms distinguish free and paid output rights and disclaim guaranteed output quality. Use a paid commercial plan only after recording the exact terms and keep human review mandatory ([Tripo API](https://developers.tripo3d.com/), [Tripo terms](https://www.tripo3d.ai/terms)).

Modly is a local, MIT-licensed image-to-3D application with GLB export. It is suitable for rough meshes, but each model extension can have separate terms ([Modly repository](https://github.com/lightningpixel/modly)).

## 7. Efficient delivery sequence

### Gate A — shell and runtime proof

Build one SwiftUI main menu with a Start Skirmish action. Launch a local Three.js scene in `WKWebView`. Load one GLB, one KTX2 texture, one sprite atlas, and one WASM dependency if selected. Prove Swift-to-JavaScript and JavaScript-to-Swift messages. Pass only on a physical iPad.

### Gate B — camera and scale proof

Create a 64×64 greybox map. Add pan, zoom, tap selection, drag selection, and command targeting. Render 250 animated unit quads and repeated props. Measure frame time, draw calls, memory, touch latency, backgrounding, and context recovery. This gate decides the supported iPad floor.

### Gate C — one-minute game

Implement one resource, one worker action, one building, one combat unit per faction, one AI opponent, and one win condition. Use a fixed simulation step and a command log. Pass when a new player can complete the loop without developer controls.

### Gate D — repeatable art

Create one terrain biome, three modular buildings, one rigged unit master, one eight-direction unit per faction, and one VFX family. Rebuild all runtime files from source. Pass only when the export preserves scale, pivot, frame order, animation names, atlas metadata, and visual quality.

### Gate E — production scale

Test 50, 100, 250, and 500 active units. Profile simulation, pathfinding, animation updates, draw calls, texture memory, and overdraw separately. Do not add campaign systems until the chosen scale tier passes a 10-minute device run.

### Gate F — native product shell

Complete Continue, Skirmish, Tutorial, Factions, Settings, Pause, and Results in SwiftUI. Add save migration, error recovery, accessibility labels, and platform services only after the game loop is stable.

## 8. Suggested project layout

```text
Starhaven/
  AppleApp/
    App/
    Menus/
    GameplayHost/
      GameWebView.swift
      GameSchemeHandler.swift
      GameBridge.swift
    Saves/
    PlatformServices/
  GameRuntime/
    package.json
    vite.config.ts
    src/
      app/
      bridge/
      simulation/
      navigation/
      ai/
      rendering/
      input/
      match-ui/
      data/
    public/
      assets/
        glb/
        textures/
        sprites/
        audio/
        maps/
    tests/
      simulation/
      replay/
      asset-manifests/
  ArtSource/
    blender/
    sprite-masters/
    prompts-and-provenance/
  Tools/
    build-web.sh
    validate-assets.sh
    profile-scenarios/
```

Use one host interface in TypeScript. Provide `WKWebViewHost` for the app and `BrowserHost` for desktop development. The browser host makes iteration fast without changing the production ownership boundary.

## 9. Risks and non-goals

### Main risks

- `WKWebView` memory, thermal behavior, and context recovery must pass on physical devices.
- Transparent sprite layers can create sorting and overdraw problems. Use bounded batches and alpha-tested edges.
- Large JavaScript object graphs can create garbage-collection stalls. Use stable pools and typed arrays in hot paths.
- A busy native bridge can cause latency and state bugs. Keep all fast state inside TypeScript.
- Generated assets can have inconsistent topology, animation, identity, or rights. Keep a provenance ledger and human approval.
- A free-rotation camera can multiply art and test costs. Keep the first camera fixed.
- Multiplayer can change simulation and save architecture. It is outside the first production slice.

### First-version non-goals

- No Godot, Unity, Unreal, SceneKit, SpriteKit, or direct Metal game runtime.
- No remote executable game code.
- No WebGPU-only feature.
- No physics-driven ordinary unit movement.
- No runtime AI asset generation.
- No copied Widelands, Towers, X-post, or asset-pack code without an explicit compatible license.
- No free camera rotation.
- No multiplayer before deterministic replay and save migration are stable.
- No campaign framework before the offline skirmish meets the scale gate.

## 10. Bottom line

The efficient production path is:

**SwiftUI menus and platform services → one local `WKWebView` → TypeScript simulation → Three.js WebGL2 rendering → Blender/GLB and directional sprite atlases.**

Start with the shell/runtime proof. Then prove 250 animated units, touch input, local asset loading, save exchange, and lifecycle recovery on one physical iPad. Build the one-minute skirmish next. Add content only after that vertical slice meets its frame, memory, and repeatability gates.
