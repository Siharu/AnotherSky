# Another Sky — Module Migration Map

Phase 2 of the six-phase roadmap. This is the plan for splitting
`anothersky-horror.html` (~8,300 lines, one `<script>` block) into real
ES modules under `src/`, loaded via native `<script type="module">` -
no bundler yet (Vite comes in Phase 6 if/when it's actually needed;
adding a build step now is one more thing that can break on top of
everything still getting shaken out).

## Why this order

Extraction happens in three waves, safest first, so a bug after any
given step is obviously that step's fault rather than lost in a mass
rewrite:

1. **Done in this pass** - zero-dependency data/utils/audio (below).
2. **Next pass** - rendering/world-gen systems that read shared state
   but don't own it (sky, weather, props, safehouse).
3. **Last pass** - the systems everything else depends on: `state`
   itself, `player`, `ghuuls`, `director`, `save`. These are the ones
   worth moving only once 1 and 2 are confirmed live and stable,
   because a mistake here breaks everything downstream at once.

Until a system is actually moved and verified, it stays in the
monolith - ~~the monolith remains the deployed, authoritative build
throughout this migration. Nothing here replaces it yet.~~

**Update: migration is complete.** All three waves below are done and
confirmed real (see each wave's own heading). `index.html`/`src/` is
now the deployed build; `anothersky-horror.html` is archived to
`old/anothersky-horror.html` with a header comment marking it
legacy/reference-only. The paragraph above describes the migration's
original safety plan and is kept for history, not as current status.

## Wave 1 — done, real working modules

| New file | Was (monolith lines) | Notes |
|---|---|---|
| `src/data/lore.js` | 1597-1610 | `LORE[]`, verbatim |
| `src/data/dialogue.js` | 5502-6952 (scattered) | all 17 whisper/radio/player voice-line arrays |
| `src/utils/dom.js` | 1567, 6098-6104 | `$()`, `corruptPress()` |
| `src/utils/math.js` | scattered | `pickFrom()`, `clamp()`, `lerp()` (thin wrappers, `THREE.MathUtils` still used directly elsewhere) |
| `src/audio/sfx.js` | 5160(partial)/6141/6502/6605 | `playMenuTone`, `playWakeFallSound`, `playSpaceBreakdownSound`, `distortionCurve` - rewritten to own its own `audioCtx`/volume/mute instead of reaching into shared `state` |

**Audio note (updated):** `initAudio()`'s ambient rain/noise engine has
since moved to `src/systems/audio.js` (264 lines, real code) and is
imported cleanly into `main.js` - the "not yet extracted" line below is
stale, kept only for the historical why-it-was-hard context.

~~Not yet extracted from audio~~: `initAudio()`'s ambient rain/noise
engine (`masterGain` + procedural rain buffers, ~lines 5160-5300+). It's
tightly coupled to the main loop's per-frame rain-intensity control -
moving it needs `systems/weather.js` to exist first so they can share
gain-node references cleanly, rather than reaching back into a module
that isn't there yet.

## Wave 2 — done, real working modules

All rows below are pulled and live (see per-row footnotes for the couple
that needed scope corrections during extraction).

| File | Target content |
|---|---|
| `src/sky/sky.js` | sky dome/stars/black hole/monolith — creation only (see footnote¹) |
| `src/sky/weather.js` | rain, dust, clouds — pulled, see footnote² |
| `src/world/terrain.js` | **pulled** — `terrainHeight()`/`groundHeightAt()` only (see footnote³); the detailed ground mesh + skirt plane are still in `main.js` |
| `src/world/streaming.js` | **pulled** — chunk load/unload, `UNLOAD_RADIUS_CHUNKS`, `isOnExitRoad()` |
| `src/world/buildings.js` | **pulled** — facade grid, relay office variant, `addBuilding()` |
| `src/world/props.js` | **pulled** — rubble/puddle instancing, streets, lamps, `addRuin()`. Trees (`scatterForest()`/`treeTrunkMesh`/`treeFoliageMesh`) are a separate, not-yet-traced system and are still in `main.js` — this row's original scope note was wrong to lump them in here |
| `src/world/safehouse.js` | **pulled** — `buildSafehouse()`, `buildSafehouseExterior()`, `updateSafehouseTransition()`, `updateSafehouseInterior()`, plus `NOTEBOOK_POS`/`LOCKED_DOOR_POS`/`BED_TABLE_POS`/`SAFEHOUSE_DOOR_YAW`. Last Wave 2 file — Wave 2 is now fully cleared |
| `src/render/renderer.js` | THREE renderer/camera setup, resolution setting |
| `src/render/postprocessing.js` | `makeCanvas`/`patchFogToDistance` pulled early (see footnote²); full PS2 pipeline (dithering, scanlines, chromatic aberration, dread vignette) still pending |

¹ **Sky.js scope note, added when this was actually pulled (see
`docs/HANDOFF.md`):** this row originally read `updateSky()`, sky
dome/breach/monolith, wrongness ramp (~7876-8060)`. Tracing
`updateSky()` before extraction found it's a cross-cutting
god-function that also drives weather uniforms, lightning, the
watching-eye system, and tower windows — none of which have modules
yet. Pulling it into `sky.js` now would've meant a circular import
(`sky.js` reaching back into `main.js` for those, while `main.js`
imports `updateSky` from `sky.js`). **What's actually in `sky.js`
today:** the color-lerp helpers (`skyColorsAt` & co.), the dome, the
star field, the black hole, and the monolith — the four leaf objects
with zero cross-system coupling. `updateSky()` itself and the sky
breach (`skyShapes`/`triggerSkyBreach`) are still in `main.js`,
importing those four from `sky.js`. Revisit pulling `updateSky()` once
`weather.js` (next row) and some home for the eye/lightning code exist
to receive their share of it.

³ **Terrain.js scope note, added when this was actually pulled (see
`docs/HANDOFF.md`):** same story as sky.js — the ground mesh itself
calls `groundTexture()` and reads `toonRamp`, neither of which has a
module home yet, so pulling the mesh now would create the same
circular-import trap `weather.js` hit. Only the two pure,
zero-dependency height functions moved; the mesh stays in `main.js`
until a materials/texture module exists for it to import from.

## Wave 3 — done, real working modules

Confirmed via grep: `main.js` no longer defines any of these systems'
function bodies directly (only `restoreFromSave()`, `manualSave()`,
`tryLockedDoor()`, `checkBedTable()` remain there on purpose - genuine
cross-cutting glue, not missed extractions; see save.js's own header
comment for why).

| File | Target content |
|---|---|
| `src/core/state.js` | the shared `state` object + constants (see shape below) |
| `src/core/scene.js` | scene/camera bootstrap that everything else attaches to |
| `src/entities/player.js` | `updatePlayer()`, input reading, collision resolution |
| `src/entities/ghuuls.js` | ghuul AI state machine (PATROL/ALERT/HUNT/SEARCH/RETREAT) |
| `src/entities/director.js` | AI Director (`evaluateDirector`, `directorInputs`) |
| `src/systems/sanity.js` | `updateSanity()`, `updateSanityVisual()`, radio-glitch (already documented in-file) |
| `src/systems/dread.js` | `updateDread()` |
| `src/systems/radio.js` | `updateRadio()`, `broadcastRadio()`, radio log |
| `src/systems/collision.js` | `resolveCollisions()` |
| `src/systems/doors.js` | **added in Phase 3** (not part of the original monolith split) - generalized teleport-door-pair engine (`registerDoorPair()`/`updateDoorTransitions()`), generalized from the safehouse's one-off `updateSafehouseTransition()`; see `docs/HANDOFF.md` |
| `src/systems/save.js` | `writeSave()`, `deleteSave()`, `restoreFromSave()` |
| `src/systems/settings.js` | sensitivity/volume/brightness/resolution persistence |
| `src/ui/menu.js` | pause/hub open-close (no longer touches `state.started` - see recent fix) |
| `src/ui/memories.js`, `radiolog.js`, `inventory.js`, `help.js` | hub sub-panels |
| `src/ui/hud.js` | icon buttons, minimap, autosave indicator |
| `src/ui/titleScreen.js` | wake sequence, menu idle-breakdown |
| `src/ui/bigmap.js`, `credits.js` | as named |

### Shared state shape (for when state.js is actually pulled)

The whole game currently hangs off one `state` object and a handful of
module-level THREE objects (`scene`, `camera`, `renderer`, `clock`).
The cleanest boundary is: `core/state.js` exports the mutable `state`
object and constants; every other module imports `{ state }` and reads/
writes it directly (matches current single-scope behavior, so behavior
doesn't change during the move - only where the code physically lives).
Not attempting a bigger architectural change (event bus, reducers, etc.)
in this pass; that's a separate, much larger decision.

## How to verify each future extraction

1. Pull the function(s) + their direct dependencies into the target file.
2. `node --input-type=module --check < file.js`
3. Wire the import in the monolith (temporarily) or in a test
   `index.html`, and load it in an actual browser.
4. Play the specific system it touches (e.g. pull `sanity.js` → open
   the hub, check the radio icon still corrupts correctly).
5. Only then move to the next file.

Do not pull more than one Wave-3 file in a single sitting without a live
check in between - these are the ones with the most fan-out.

## Development

What's needed *inside the code itself* (as opposed to external CI/CD
infrastructure - see `docs/HANDOFF.md`'s standing note on that) to
support ongoing maintenance and a real update schedule. Full detail on
each item, including exact file/function names, lives in
`docs/HANDOFF.md`'s own Development section (kept in sync with this
one) - this is the short reference version.

**Shipped:**
1. ~~Save-data versioning + migration~~ - `systems/save.js`
   (`CURRENT_SAVE_VERSION`, `migrateSave()`).
2. ~~A visible build/version stamp~~ - `GAME_VERSION` in `core/
   state.js`, logged on load, shown in the credits overlay.
3. ~~Cache-busting for updates~~ - version query string on `index.html`'s
   module script tag.
4. ~~A debug/dev mode toggle~~ - `?debug=1`, currently an FPS counter.
5. ~~Graceful WebGL-failure handling~~ - `core/scene.js` now shows a
   real on-screen message instead of silently killing all of
   `main.js`'s setup on a failed context.

**Still open:**
6. A player-facing changelog - content/writing habit, not a code fix;
   deliberately not stubbed with empty UI.

Already in place, for reference: the on-screen debug overlay
(`index.html`, inline script, catches runtime errors/warnings/
unhandled rejections and displays them on any device without
devtools) and `docs/smoketest.js` (syntax + broken-relative-import
check across all of `src/`, run manually via `node docs/smoketest.js`
- not wired into any CI yet, see `docs/HANDOFF.md`'s CI/CD discussion).