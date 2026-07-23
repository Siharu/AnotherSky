/* ============================================================
   world/streaming.js — pulled from the monolith this round (world-gen
   mesh builders: buildings/props/streaming, ranked round). Pulled last
   of the three since loadChunk()/unloadChunk() are the top of the
   dependency chain - they call straight into addBuilding()/addRuin()/
   addLamp() (world/buildings.js, world/props.js) and the minimap/
   window-spot registries (world/worldData.js), so buildings.js and
   props.js had to be real modules first.

   The hand-authored downtown (main.js's still-unmoved generateDistrict())
   only covers a ~200-unit-radius disc around the origin. Beyond that, the
   world streams procedurally in a grid of chunks around the player
   forever: new chunks generate as you approach, distant ones unload (and
   hand their facade/instance slots back to the shared pools' free-lists
   so the pools never actually run out no matter how far you walk).

   isOnExitRoad() moved in alongside loadChunk() since it's only ever
   called from there (keeps a streamed building from landing on the exit
   road) — the exit road's own construction (curbs, traffic lights,
   forest scatter) stays in main.js, unmoved this round, and imports
   CHUNK_SIZE/DOWNTOWN_EDGE back from world/worldData.js where needed. */

import { state } from '../core/state.js';
import { scene } from '../core/scene.js';
import {
  obstacles, lamps, CHUNK_SIZE, DOWNTOWN_EDGE,
  registerChunkMinimapBuildings, unregisterChunkMinimapBuildings, activeMinimapBuildings,
  EXIT_ROAD_END, EXIT_ROAD_HALFWIDTH, exitRoadDirX, exitRoadDirZ, exitRoadPerpX, exitRoadPerpZ
} from './worldData.js';
import { addBuilding, updateFacadePoolCounts, freeFacadeTrack, registerChunkWindowSpots, unregisterChunkWindowSpots } from './buildings.js';
import { addRuin, addLamp, addBridge, scatterChunkClutter } from './props.js';

const LOAD_RADIUS_CHUNKS = 2;   // ~140 units out - generates ahead of the player
const UNLOAD_RADIUS_CHUNKS = 4; // ~280 units - hysteresis so edge chunks don't thrash
const activeChunks = new Map();

// used by the chunk streamer so it doesn't drop a building on top of the
// road once it runs past downtown
function isOnExitRoad(x,z){
  const along = x*exitRoadDirX + z*exitRoadDirZ;
  if(along < 0 || along > EXIT_ROAD_END) return false;
  const across = x*exitRoadPerpX + z*exitRoadPerpZ;
  return Math.abs(across) < EXIT_ROAD_HALFWIDTH + 3;
}

// deterministic PRNG seeded per-chunk, so a chunk always generates the same
// content if it's ever reloaded - not strictly needed this session, but
// means nothing "shuffles" if load/unload timing changes near a boundary
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function chunkKey(cx,cz){ return cx+'_'+cz; }

// Generator version of loadChunk: same generation logic and same
// deterministic per-chunk PRNG/output as before, but yields after each
// individual object placement instead of building the whole chunk in
// one synchronous call. updateWorldStream() below steps this a small,
// fixed number of times per frame (STEPS_PER_FRAME) regardless of chunk
// boundaries - this is what actually fixes the "random stutter while
// walking, unrelated to resolution" symptom: the old CHUNKS_PER_FRAME=2
// budget could still burst up to ~20 buildings+extras worth of full
// mesh/material construction into a single frame if two adjacent chunks
// both needed loading; per-object budgeting makes worst-case per-frame
// cost constant no matter how much a given chunk needs.
function* loadChunkSteps(cx,cz){
  const key = chunkKey(cx,cz);
  if(activeChunks.has(key)) return;
  const centerX = (cx+0.5)*CHUNK_SIZE, centerZ = (cz+0.5)*CHUNK_SIZE;
  const entry = { handles: [] };
  activeChunks.set(key, entry);
  const half = CHUNK_SIZE*0.5;
  const farCornerDist = Math.hypot(Math.abs(centerX)+half, Math.abs(centerZ)+half);
  if(farCornerDist < DOWNTOWN_EDGE) return;

  const rand = mulberry32((cx*73856093) ^ (cz*19349663) ^ 0x9e3779b9);
  const track = [];
  const spots = [];
  const footprints = [];

  const buildingCount = 6 + Math.floor(rand()*4);
  for(let i=0;i<buildingCount;i++){
    let lx, lz, w, d, h, tries = 0, overlaps = true;
    do {
      lx = centerX + (rand()-0.5)*CHUNK_SIZE*0.95;
      lz = centerZ + (rand()-0.5)*CHUNK_SIZE*0.95;
      w = 6+rand()*7; d = 6+rand()*7; h = 5+rand()*20;
      tries++;
      if(Math.hypot(lx,lz) < DOWNTOWN_EDGE || isOnExitRoad(lx,lz)){ overlaps = true; continue; }
      const hw = w/2+1.2, hd = d/2+1.2;
      overlaps = footprints.some(f =>
        Math.abs(lx-f.x) < hw+f.hw && Math.abs(lz-f.z) < hd+f.hd
      ) || activeMinimapBuildings.some(f =>
        Math.abs(lx-f.x) < hw+f.hw && Math.abs(lz-f.z) < hd+f.hd
      );
    } while(overlaps && tries < 10);
    if(overlaps) continue;
    const handle = addBuilding(lx, lz, w, d, h, { track, spots });
    entry.handles.push({ type:'building', handle });
    footprints.push({ x:lx, z:lz, hw:w/2, hd:d/2, h, type: handle.isRelay ? 'relay' : 'building' });
    yield;
  }
  if(rand() < 0.95){
    const lx = centerX + (rand()-0.5)*CHUNK_SIZE, lz = centerZ + (rand()-0.5)*CHUNK_SIZE;
    const handle = addRuin(lx, lz, Math.floor(rand()*3));
    entry.handles.push({ type:'ruin', handle });
    footprints.push({ x:lx, z:lz, hw:2.5, hd:2.5, h:3.2, type:'ruin' });
    yield;
  }
  if(rand() < 0.4){
    const lx2 = centerX + (rand()-0.5)*CHUNK_SIZE, lz2 = centerZ + (rand()-0.5)*CHUNK_SIZE;
    const handle2 = addRuin(lx2, lz2, Math.floor(rand()*3));
    entry.handles.push({ type:'ruin', handle:handle2 });
    footprints.push({ x:lx2, z:lz2, hw:2.5, hd:2.5, h:3.2, type:'ruin' });
    yield;
  }
  if(rand() < 0.7){
    const lx = centerX + (rand()-0.5)*CHUNK_SIZE, lz = centerZ + (rand()-0.5)*CHUNK_SIZE;
    // buildings/ruins above all check footprints before placing - this
    // didn't, so a lamp pole could land inside a building/ruin that had
    // just been placed in this same chunk a moment earlier.
    const overlapsFootprint = footprints.some(f =>
      Math.abs(lx-f.x) < f.hw+0.6 && Math.abs(lz-f.z) < f.hd+0.6
    );
    if(!overlapsFootprint){
      const handle = addLamp(lx, lz);
      entry.handles.push({ type:'lamp', handle });
      yield;
    }
  }
  if(rand() < 0.12){
    const lx = centerX + (rand()-0.5)*CHUNK_SIZE, lz = centerZ + (rand()-0.5)*CHUNK_SIZE;
    const bridgeAng = rand()*Math.PI*2;
    const handle = addBridge(lx, lz, bridgeAng);
    entry.handles.push({ type:'ruin', handle });
    footprints.push({ x:lx, z:lz, hw:4.5, hd:1.5, h:1.8, type:'ruin' });
    yield;
  }
  registerChunkMinimapBuildings(key, footprints);
  scatterChunkClutter(centerX, centerZ, track);
  entry.track = track;
  entry.windowSpots = spots;
  updateFacadePoolCounts();
  registerChunkWindowSpots(key, spots);
}

function loadChunk(cx,cz){
  // Kept as a synchronous wrapper (drains the generator in one go) - used
  // by anything that still needs a whole chunk built immediately (there's
  // no such caller today, but this keeps the function's old contract
  // intact rather than deleting it outright, since it's exported).
  for(const _ of loadChunkSteps(cx,cz)){ /* drain */ }
}

function unloadChunk(key){
  const entry = activeChunks.get(key);
  if(!entry) return;
  for(const h of entry.handles){
    if(h.type==='building' || h.type==='ruin'){
      scene.remove(h.handle.group);
      const oi = obstacles.indexOf(h.handle.obstacleEntry);
      if(oi>=0) obstacles.splice(oi,1);
    } else if(h.type==='lamp'){
      scene.remove(h.handle.group);
      const li = lamps.indexOf(h.handle.lampEntry);
      if(li>=0) lamps.splice(li,1);
    }
  }
  if(entry.track && entry.track.length) freeFacadeTrack(entry.track);
  unregisterChunkWindowSpots(key);
  unregisterChunkMinimapBuildings(key);
  activeChunks.delete(key);
}

let lastStreamCx = null, lastStreamCz = null;
// Chunk loading was the real cause of the load-time and mid-walk stutter,
// twice over:
// 1. Originally called loadChunk() synchronously for every chunk in the
//    full LOAD_RADIUS_CHUNKS disc (up to 25 chunks) the instant the player
//    crossed into a new chunk - a single-frame burst of up to 25 chunks'
//    worth of mesh construction.
// 2. Fixed to CHUNKS_PER_FRAME=2 whole chunks/frame - better, but each
//    chunk can still place up to ~9 buildings plus ruins/lamp/bridge/
//    clutter (all real geometry+material construction) in one call, so
//    two adjacent chunks needing load on the same frame could still burst
//    ~20 objects' worth of mesh building into a single frame. This is what
//    "random stutter while walking, same at any resolution" actually was -
//    pure CPU work from mesh construction, triggered by crossing a chunk
//    boundary rather than any fixed timer, so it reads as unpredictable
//    even though it's fully deterministic given player position.
//
// Now: loadChunkSteps() is a generator that yields after each individual
// object placement (see streaming.js's loadChunkSteps above), and this
// function steps a small, fixed number of those placements per frame
// (STEPS_PER_FRAME) regardless of chunk boundaries or how many chunks are
// queued - so worst-case per-frame world-gen cost is now constant instead
// of scaling with "how much did the chunk(s) that just came into range
// happen to need".
const STEPS_PER_FRAME = 3;
let pendingLoads = [];
let currentGen = null; // in-progress loadChunkSteps() generator, if any
function updateWorldStream(){
  const cx = Math.floor(state.playerX/CHUNK_SIZE), cz = Math.floor(state.playerZ/CHUNK_SIZE);
  if(cx!==lastStreamCx || cz!==lastStreamCz){
    lastStreamCx = cx; lastStreamCz = cz;

    const needed = [];
    for(let dx=-LOAD_RADIUS_CHUNKS; dx<=LOAD_RADIUS_CHUNKS; dx++){
      for(let dz=-LOAD_RADIUS_CHUNKS; dz<=LOAD_RADIUS_CHUNKS; dz++){
        if(dx*dx+dz*dz <= LOAD_RADIUS_CHUNKS*LOAD_RADIUS_CHUNKS){
          const ncx = cx+dx, ncz = cz+dz;
          if(!activeChunks.has(`${ncx}_${ncz}`)) needed.push({cx:ncx, cz:ncz, d:dx*dx+dz*dz});
        }
      }
    }
    needed.sort((a,b)=>a.d-b.d); // nearest chunks first, so the player never sees a gap close by while a far one loads first
    // drop any still-pending chunks the player has since walked away from
    // (re-evaluated below anyway) and replace with the fresh needed list
    pendingLoads = needed;
    // NOTE: currentGen (if any) is deliberately left running rather than
    // abandoned here, even if its chunk fell out of range - loadChunkSteps()
    // already added a (possibly partial) entry to activeChunks the moment
    // it started, and only calls registerChunkMinimapBuildings/
    // scatterChunkClutter/registerChunkWindowSpots at the very end. Nulling
    // currentGen mid-run would leave that chunk stuck forever as a partially-
    // built, never-registered, never-unloaded ghost entry. Letting it finish
    // (a handful of frames at most, given STEPS_PER_FRAME) is simpler and
    // correct; if the player has genuinely moved out of its unload radius by
    // the time it completes, the next boundary crossing's unload check
    // below will clean it up normally like any other stale chunk.

    for(const key of Array.from(activeChunks.keys())){
      const [kx,kz] = key.split('_').map(Number);
      const ddx = kx-cx, ddz = kz-cz;
      if(ddx*ddx+ddz*ddz > UNLOAD_RADIUS_CHUNKS*UNLOAD_RADIUS_CHUNKS) unloadChunk(key);
    }
  }
  // process a small, fixed budget of individual object placements every
  // frame - this is what actually spreads the cost out instead of
  // front-loading it, at chunk-boundary granularity or finer.
  let steps = STEPS_PER_FRAME;
  while(steps > 0){
    if(!currentGen){
      if(!pendingLoads.length) break;
      const next = pendingLoads.shift();
      if(activeChunks.has(`${next.cx}_${next.cz}`)) continue;
      currentGen = loadChunkSteps(next.cx, next.cz);
    }
    const { done } = currentGen.next();
    steps--;
    if(done) currentGen = null;
  }
}

export { activeChunks, loadChunk, unloadChunk, updateWorldStream, isOnExitRoad, UNLOAD_RADIUS_CHUNKS, mulberry32 };
