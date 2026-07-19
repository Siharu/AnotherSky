/* ---------- WORLD-GEN DATA ----------
   Pulled from main.js (Wave 3 — world-gen chokepoint #1, part 2, see
   docs/HANDOFF.md). This is the remaining data half of the chokepoint
   the materials.js pull didn't cover: minimap layout registries, the
   lamp registry, and the exit-road direction constants.

   Scope, same pattern as core/state.js: this module owns the shared
   mutable arrays/Maps/constants and the handful of pure functions that
   only touch them. The functions that actually BUILD world geometry
   (generateDistrict(), addLamp(), addStreetRibbon(), etc.) stay in
   main.js — they're tangled with scene/state/addBuilding and other
   systems that don't have module homes yet — but they now import these
   registries back and push into them, instead of owning them. */

/* ---------- minimap layout data ----------
   Building footprints and street geometry, so the minimap/bigmap can
   draw an actual layout (buildings + roads), not just blips. */
const minimapBuildings = []; // permanent downtown footprints: {x,z,hw,hd,h,type}
const minimapChunkBuildingMap = new Map(); // chunkKey -> footprints, mirrors chunkWindowSpotMap
const downtownStreetRibbons = []; // {ang, r0, r1, hw} captured during district generation
let activeMinimapBuildings = [];

function rebuildActiveMinimapBuildings(){
  activeMinimapBuildings.length = 0;
  for(const b of minimapBuildings) activeMinimapBuildings.push(b);
  for(const arr of minimapChunkBuildingMap.values()) for(const b of arr) activeMinimapBuildings.push(b);
}
function registerChunkMinimapBuildings(key, footprints){
  if(footprints && footprints.length){ minimapChunkBuildingMap.set(key, footprints); rebuildActiveMinimapBuildings(); }
}
function unregisterChunkMinimapBuildings(key){
  if(minimapChunkBuildingMap.delete(key)) rebuildActiveMinimapBuildings();
}

/* ---------- lamp registry ----------
   addLamp() (still in main.js — builds real THREE geometry/lights tied
   to scene/groundHeightAt/toonRamp/addGlow) pushes entries here. */
const lamps = [];

/* ---------- exit road geometry ----------
   Pure trig constants, zero dependencies - the "through the middle of
   the city" exit road direction/perpendicular vectors and its extent. */
const EXIT_ROAD_ANGLE = 0;          // straight out along +X
const EXIT_ROAD_HALFWIDTH = 9;      // wider than the 6.2 halfwidth downtown streets use
const EXIT_ROAD_START = 2;
const EXIT_ROAD_END = 430;          // well past DOWNTOWN_EDGE, deep into the forest
const exitRoadDirX = Math.cos(EXIT_ROAD_ANGLE), exitRoadDirZ = Math.sin(EXIT_ROAD_ANGLE);
const exitRoadPerpX = -exitRoadDirZ, exitRoadPerpZ = exitRoadDirX;

/* ---------- ADDED THIS ROUND (world/buildings.js + world/props.js +
   world/streaming.js pull) ---------- */

// Collision obstacle list. Was main.js-owned (`const obstacles = []` right
// before buildingWallMat) — moved here since it's pushed into by
// addBuilding()/addRuin() (now buildings.js/props.js), buildSafehouse()
// (still main.js, unmoved this round), and unloadChunk() (streaming.js),
// and read by resolveCollisions() (systems/collision.js, already takes it
// as a plain param — no import needed there) and main.js's per-frame
// collision call site, which now imports it from here instead of owning it.
const obstacles = [];

// Chunk-streaming constants shared between world/props.js
// (scatterChunkClutter uses CHUNK_SIZE) and world/streaming.js (both
// constants) and main.js (DOWNTOWN_EDGE also gates traffic-light/forest
// placement in the still-unmoved exit-road code) — same "shared constant,
// multiple real consumers" shape as EXIT_ROAD_* above.
const CHUNK_SIZE = 70;
const DOWNTOWN_EDGE = 195; // stay clear of the hand-placed district

// Permanent (never-unloading) lit-window spots exposed by the hand-authored
// downtown's buildings. world/buildings.js's rebuildActiveWindowSpots()
// reads this; main.js's generateDistrict() (still unmoved) pushes into it
// via addBuilding()'s opts.spots.
const downtownWindowSpots = [];

/* ---------- shared instance-pool primitives ----------
   The facade-grid pools (world/buildings.js) and the rubble/puddle pools
   (world/props.js) are two independent instance families that share one
   counter object and one allocator function — `_counters` holds keys from
   both (frame/warm/cool/dark/warmGlow/coolGlow plus rubble/puddle), and
   `updateFacadePoolCounts()` (buildings.js, importing props.js's
   rubbleMesh/puddleMesh) flushes both families' counts in one pass. Kept
   here rather than duplicated in each, and rather than picking one of the
   two modules to own something the other also needs. */
const _counters = { frame:0, warm:0, cool:0, dark:0, warmGlow:0, coolGlow:0, rubble:0, puddle:0 };
function _alloc(freeList, counterName, mesh, max){
  if(freeList.length) return freeList.pop();
  if(_counters[counterName] < max){ return _counters[counterName]++; }
  return -1;
}
const _hideDummy = new THREE.Object3D(); _hideDummy.scale.set(0,0,0); _hideDummy.updateMatrix();

export {
  minimapBuildings, minimapChunkBuildingMap, downtownStreetRibbons, activeMinimapBuildings,
  rebuildActiveMinimapBuildings, registerChunkMinimapBuildings, unregisterChunkMinimapBuildings,
  lamps,
  EXIT_ROAD_ANGLE, EXIT_ROAD_HALFWIDTH, EXIT_ROAD_START, EXIT_ROAD_END,
  exitRoadDirX, exitRoadDirZ, exitRoadPerpX, exitRoadPerpZ,
  obstacles, CHUNK_SIZE, DOWNTOWN_EDGE, downtownWindowSpots,
  _counters, _alloc, _hideDummy
};
