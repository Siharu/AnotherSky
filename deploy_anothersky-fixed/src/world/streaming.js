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

function loadChunk(cx,cz){
  const key = chunkKey(cx,cz);
  if(activeChunks.has(key)) return;
  const centerX = (cx+0.5)*CHUNK_SIZE, centerZ = (cz+0.5)*CHUNK_SIZE;
  const entry = { handles: [] };
  activeChunks.set(key, entry);
  // Only skip generation if the WHOLE chunk sits inside the hand-authored
  // downtown - checked via the farthest corner, not just the center. Using
  // just the center meant a whole ring of chunks straddling the downtown
  // boundary could come back completely empty even though most of their
  // area was outside downtown - exactly the "sparse near downtown, dense
  // further out" unevenness.
  const half = CHUNK_SIZE*0.5;
  const farCornerDist = Math.hypot(Math.abs(centerX)+half, Math.abs(centerZ)+half);
  if(farCornerDist < DOWNTOWN_EDGE) return;

  const rand = mulberry32((cx*73856093) ^ (cz*19349663) ^ 0x9e3779b9);
  const track = []; // shared facade-instance track for every building this chunk places
  const spots = []; // lit-window world spots this chunk's buildings expose, for the window-figure system
  const footprints = []; // {x,z,hw,hd} for every building/ruin this chunk places, for the minimap

  const buildingCount = 6 + Math.floor(rand()*4); // was 3-5 - that plus only a 0.85/0.35 chance of one ruin/lamp per 70x70 chunk read as a mostly-empty plain; denser packing plus the clutter scatter below fills the ground instead of just the skyline
  for(let i=0;i<buildingCount;i++){
    // resample instead of silently dropping the candidate when it lands
    // inside downtown - previously a dropped candidate just meant one fewer
    // building for that chunk, thinning density unevenly near the boundary.
    // Also resample on overlap with any building already placed this chunk -
    // this loop previously only ever checked downtown/exit-road exclusion,
    // never checked candidates against each other, so buildings could (and
    // did) land directly on top of one another with zero rejection. w/d
    // aren't known until inside the loop, so the overlap check samples w/d
    // first, then retries position+size together against the existing
    // footprints (a fixed footprint sampled before checking would keep
    // colliding with the same spot every retry for oddly-shaped candidates).
    let lx, lz, w, d, h, tries = 0, overlaps = true;
    do {
      lx = centerX + (rand()-0.5)*CHUNK_SIZE*0.95;
      lz = centerZ + (rand()-0.5)*CHUNK_SIZE*0.95;
      w = 6+rand()*7; d = 6+rand()*7; h = 5+rand()*20;
      tries++;
      if(Math.hypot(lx,lz) < DOWNTOWN_EDGE || isOnExitRoad(lx,lz)){ overlaps = true; continue; }
      // AABB overlap test against every footprint placed so far this chunk,
      // with a small gap margin so buildings don't end up wall-to-wall
      // either - reads as an actual street grid instead of a jammed cluster
      const hw = w/2+1.2, hd = d/2+1.2;
      overlaps = footprints.some(f =>
        Math.abs(lx-f.x) < hw+f.hw && Math.abs(lz-f.z) < hd+f.hd
      ) || activeMinimapBuildings.some(f =>
        Math.abs(lx-f.x) < hw+f.hw && Math.abs(lz-f.z) < hd+f.hd
      );
    } while(overlaps && tries < 10);
    if(overlaps) continue; // give up only after retries - rare, and just means a slightly emptier lot rather than a stacked building
    const handle = addBuilding(lx, lz, w, d, h, { track, spots });
    entry.handles.push({ type:'building', handle });
    footprints.push({ x:lx, z:lz, hw:w/2, hd:d/2, h, type: handle.isRelay ? 'relay' : 'building' });
  }
  if(rand() < 0.95){
    const lx = centerX + (rand()-0.5)*CHUNK_SIZE, lz = centerZ + (rand()-0.5)*CHUNK_SIZE;
    const handle = addRuin(lx, lz, Math.floor(rand()*3));
    entry.handles.push({ type:'ruin', handle });
    footprints.push({ x:lx, z:lz, hw:2.5, hd:2.5, h:3.2, type:'ruin' });
  }
  if(rand() < 0.4){
    const lx2 = centerX + (rand()-0.5)*CHUNK_SIZE, lz2 = centerZ + (rand()-0.5)*CHUNK_SIZE;
    const handle2 = addRuin(lx2, lz2, Math.floor(rand()*3));
    entry.handles.push({ type:'ruin', handle:handle2 });
    footprints.push({ x:lx2, z:lz2, hw:2.5, hd:2.5, h:3.2, type:'ruin' });
  }
  if(rand() < 0.7){
    const lx = centerX + (rand()-0.5)*CHUNK_SIZE, lz = centerZ + (rand()-0.5)*CHUNK_SIZE;
    const handle = addLamp(lx, lz);
    entry.handles.push({ type:'lamp', handle });
  }
  // rare landmark structure, deliberately much less common than ruins/lamps
  // so it reads as a notable sight rather than routine clutter
  if(rand() < 0.12){
    const lx = centerX + (rand()-0.5)*CHUNK_SIZE, lz = centerZ + (rand()-0.5)*CHUNK_SIZE;
    const bridgeAng = rand()*Math.PI*2;
    const handle = addBridge(lx, lz, bridgeAng);
    entry.handles.push({ type:'ruin', handle }); // reuses the ruin/building disposal branch below - same group+obstacleEntry shape
    footprints.push({ x:lx, z:lz, hw:4.5, hd:1.5, h:1.8, type:'ruin' });
  }
  registerChunkMinimapBuildings(key, footprints);
  scatterChunkClutter(centerX, centerZ, track);
  entry.track = track;
  entry.windowSpots = spots;
  updateFacadePoolCounts();
  registerChunkWindowSpots(key, spots);
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
// Chunk loading was the real cause of the load-time and mid-walk stutter:
// this used to call loadChunk() synchronously for every chunk in the full
// LOAD_RADIUS_CHUNKS disc (up to 25 chunks) the instant the player crossed
// into a new chunk - each loadChunk() builds real geometry (buildings,
// props, minimap registration), so that was a single-frame burst of up to
// 25 chunks' worth of mesh construction. Now it just enqueues whichever
// chunks are missing (nearest first) into pendingLoads, and a small,
// fixed number actually get built per frame via the loop in
// updateWorldStream() below - so a chunk-boundary crossing costs a few
// frames of small work instead of one frame of a lot of work.
const CHUNKS_PER_FRAME = 2;
let pendingLoads = [];
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

    for(const key of Array.from(activeChunks.keys())){
      const [kx,kz] = key.split('_').map(Number);
      const ddx = kx-cx, ddz = kz-cz;
      if(ddx*ddx+ddz*ddz > UNLOAD_RADIUS_CHUNKS*UNLOAD_RADIUS_CHUNKS) unloadChunk(key);
    }
  }
  // process a small, fixed budget of the queue every frame regardless of
  // whether the player just crossed a boundary - this is what actually
  // spreads the cost out instead of front-loading it
  for(let i=0; i<CHUNKS_PER_FRAME && pendingLoads.length; i++){
    const next = pendingLoads.shift();
    if(!activeChunks.has(`${next.cx}_${next.cz}`)) loadChunk(next.cx, next.cz);
  }
}

export { activeChunks, loadChunk, unloadChunk, updateWorldStream, isOnExitRoad, UNLOAD_RADIUS_CHUNKS, mulberry32 };
