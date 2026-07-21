// ---------- BIG MAP ----------
import { state } from '../core/state.js';
import {
  downtownStreetRibbons, activeMinimapBuildings,
  exitRoadDirX, exitRoadDirZ, EXIT_ROAD_START, EXIT_ROAD_END, EXIT_ROAD_HALFWIDTH
} from '../world/worldData.js';
import { ghuulList } from '../entities/ghuuls.js';
// Scoped down the same way as ui/hud.js's minimap piece was until this
// round: drawBigMap()'s two blockers (ghuulList, DOM refs) are both
// cleared now (entities/ghuuls.js exists; canvas refs are right here),
// so it's a real function in this module now, along with updateFowAt()
// (pure fog-of-war grid state, only ever used by/for the big map).
// orbMeshes/RADIO_TOWER_POS still have no module home (main.js-local),
// passed in as params - same shape as updateMinimap()'s equivalent params.
//
// Still owed: the overlay open/close click-handler wiring (still in
// main.js, tangled with state.started pause/resume).
//
// PLAYER-RELATIVE REDESIGN (this round): the previous version was
// origin-centered - a bigger and bigger fixed window (500 -> 1000 world
// units) but still finite, so a long enough walk in any direction would
// eventually run the player off the edge, same failure mode as before
// just delayed. Chunk streaming (world/streaming.js) has no outer radius
// cap at all, so no fixed window can ever truly match it.
//
// worldToBig() now takes the player's own world position as the origin
// every frame instead of world-origin (0,0). The player marker is drawn
// fixed at canvas center; everything else (roads, buildings, orbs,
// ghuuls, landmarks, fog) is positioned relative to *them*. BIG_MAP_VIEW
// is a viewport size now, not a map extent - it's how much world is
// visible around the player at once, and it stays constant forever, so
// coverage is genuinely unbounded to match streaming. Same 1000-unit/
// 640px = 0.64px/m scale as the last round's window, kept for visual
// continuity rather than re-tuning legibility again this pass.
export const BIG_MAP_VIEW = 1000;
// Back-compat alias - main.js imports this name; both point at the same
// constant, kept as two exports rather than a rename-everywhere pass.
export const BIG_MAP_WORLD = BIG_MAP_VIEW;

export const bigmapCanvas = document.getElementById('bigmap-canvas');
export const bigmapCtx = bigmapCanvas ? bigmapCanvas.getContext('2d') : null;

export function worldToBig(wx, wz){
  const S = bigmapCanvas.width / BIG_MAP_VIEW;
  return {
    x: (wx - state.playerX + BIG_MAP_VIEW/2) * S,
    y: (wz - state.playerZ + BIG_MAP_VIEW/2) * S
  };
}

/* ---------- FOG OF WAR ----------
   A coarse grid (each cell = 12×12 world units) is toggled visited as the
   player moves. The big map draws cells that haven't been visited as opaque
   black, and cells that have been visited as transparent - the classic
   "fog of war" reveal pattern. The minimap doesn't use this - it always
   shows what's within 30m no matter what - the fog is a big-map-only
   readability feature.

   Storage is now a sparse Set of "gx,gz" keys instead of a fixed
   Uint8Array over a [-FOW_HALF..FOW_HALF] window - a fixed array needed
   a bound on how far the player could ever wander, which is exactly the
   thing this round removes. A Set only grows with ground actually
   walked, same "only what you've explored" property the fog is supposed
   to represent, and only cells inside the current view window ever get
   drawn (see drawBigMap below), so an unbounded Set never costs an
   unbounded draw. */
const FOW_CELL = 12;          // world units per fog cell
const FOW_REVEAL_R = 2; // cells cleared around the player each step (radius in cells)
const fowVisited = new Set(); // holds "gx,gz" keys - unseen cells simply aren't in the set
function fowKey(gx, gz){ return gx + ',' + gz; }
export function updateFowAt(wx, wz){
  const gx = Math.floor(wx/FOW_CELL);
  const gz = Math.floor(wz/FOW_CELL);
  for(let dx=-FOW_REVEAL_R; dx<=FOW_REVEAL_R; dx++){
    for(let dz=-FOW_REVEAL_R; dz<=FOW_REVEAL_R; dz++){
      fowVisited.add(fowKey(gx+dx, gz+dz));
    }
  }
}

/* ---------- BIG MAP DRAW ----------
   North-up, player-relative: a 1000-world-unit viewport (see
   BIG_MAP_VIEW above) that pans to keep the player at canvas center,
   drawn into a 640px canvas at 0.64px/m. Draws: panning background grid
   → roads → buildings → orbs → ghuuls → player (fixed at center) →
   named landmarks (with off-screen edge arrows) → fog of war overlay →
   scale bar.

   Anything with a world position now gets a cheap view-distance cull
   before it's drawn (half-diagonal of the viewport plus a margin) -
   harmless before (everything was inside the fixed window by
   definition), but necessary now that buildings/orbs/ghuuls arbitrarily
   far from the player may exist in loaded state. */
export function drawBigMap(orbMeshes, RADIO_TOWER_POS){
  if(!bigmapCtx || !bigmapCanvas) return;
  const W = bigmapCanvas.width, H = bigmapCanvas.height;
  const S = W / BIG_MAP_VIEW;
  const ctx = bigmapCtx;
  const px0 = state.playerX, pz0 = state.playerZ;
  const CULL_R = BIG_MAP_VIEW*0.75; // a bit past the viewport edge, generous on purpose
  const inView = (wx,wz)=> Math.abs(wx-px0) <= CULL_R && Math.abs(wz-pz0) <= CULL_R;

  ctx.clearRect(0,0,W,H);

  ctx.fillStyle = '#08070a';
  ctx.fillRect(0,0,W,H);

  // Background grid now pans with the player instead of being drawn at
  // fixed canvas positions - lines are anchored to world coordinates
  // that are multiples of 50, so they visibly scroll as the player
  // walks rather than sitting static under a moving player dot.
  ctx.strokeStyle = 'rgba(201,194,182,0.05)';
  ctx.lineWidth = 1;
  const gridStartX = Math.floor((px0 - BIG_MAP_VIEW/2)/50)*50;
  const gridEndX = px0 + BIG_MAP_VIEW/2;
  for(let gx=gridStartX; gx<=gridEndX; gx+=50){
    const p = worldToBig(gx, 0).x;
    ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,H); ctx.stroke();
  }
  const gridStartZ = Math.floor((pz0 - BIG_MAP_VIEW/2)/50)*50;
  const gridEndZ = pz0 + BIG_MAP_VIEW/2;
  for(let gz=gridStartZ; gz<=gridEndZ; gz+=50){
    const p = worldToBig(0, gz).y;
    ctx.beginPath(); ctx.moveTo(0,p); ctx.lineTo(W,p); ctx.stroke();
  }

  for(const r of downtownStreetRibbons){
    const dx=Math.cos(r.ang), dz=Math.sin(r.ang);
    const p0=worldToBig(dx*r.r0, dz*r.r0), p1=worldToBig(dx*r.r1, dz*r.r1);
    ctx.strokeStyle='rgba(110,104,94,0.6)';
    ctx.lineWidth = Math.max(1, r.hw*2*S);
    ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
  }
  {
    const p0=worldToBig(exitRoadDirX*EXIT_ROAD_START, exitRoadDirZ*EXIT_ROAD_START);
    const p1=worldToBig(exitRoadDirX*EXIT_ROAD_END, exitRoadDirZ*EXIT_ROAD_END);
    ctx.strokeStyle='rgba(130,120,100,0.65)';
    ctx.lineWidth=Math.max(2, EXIT_ROAD_HALFWIDTH*2*S);
    ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
  }

  {
    const BIG_ISO_PX_PER_M_HEIGHT = 0.9, BIG_ISO_MAX_RISE = 26;
    for(const b of activeMinimapBuildings){
      if(!inView(b.x, b.z)) continue;
      const isRuin = b.type === 'ruin';
      const isRelay = b.type === 'relay';
      const rise = -Math.min(BIG_ISO_MAX_RISE, (b.h||6) * BIG_ISO_PX_PER_M_HEIGHT) * (isRuin ? 0.4 : 1);
      const c = isRuin ? [255,140,90] : isRelay ? [255,80,80] : [130,225,255];
      const corners = [
        worldToBig(b.x-b.hw, b.z-b.hd),
        worldToBig(b.x+b.hw, b.z-b.hd),
        worldToBig(b.x+b.hw, b.z+b.hd),
        worldToBig(b.x-b.hw, b.z+b.hd),
      ];
      const apex = corners.map(p=>({ x:p.x, y:p.y+rise }));
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.22)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      corners.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.35)`;
      for(let i=0;i<4;i++){
        ctx.beginPath();
        ctx.moveTo(corners[i].x, corners[i].y);
        ctx.lineTo(apex[i].x, apex[i].y);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.14)`;
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.85)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      apex.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  if(orbMeshes){
    for(const o of orbMeshes){
      if(o.collected) continue;
      if(!inView(o.mesh.position.x, o.mesh.position.z)) continue;
      const p=worldToBig(o.mesh.position.x, o.mesh.position.z);
      ctx.fillStyle='rgba(207,111,158,0.9)';
      ctx.beginPath(); ctx.arc(p.x,p.y,3.5,0,Math.PI*2); ctx.fill();
    }
  }

  for(const g of ghuulList){
    if(!inView(g.x, g.z)) continue;
    const p=worldToBig(g.x,g.z);
    ctx.fillStyle= g.aiState==='HUNT' ? '#ff3b3b' : 'rgba(160,40,40,0.75)';
    ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill();
  }

  {
    const p=worldToBig(state.playerX, state.playerZ);
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.rotate(state.yaw); // yaw=0 faces +X on screen (east in north-up), correct
    ctx.fillStyle='#e7e0d2';
    ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(5,6); ctx.lineTo(-5,6); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle='rgba(231,224,210,0.15)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,28,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // Landmarks are all fixed world positions, so a long enough walk now
  // routinely pushes them outside the (still-finite) viewport, unlike
  // the old origin-centered map where they were always somewhere on the
  // canvas. Off-screen ones get clamped to the edge with a small arrow
  // pointing back out toward their real direction, instead of just
  // vanishing - same "waypoint arrow" pattern most open-world maps use.
  const landmarks = [
    { label:'Radio Tower', x:RADIO_TOWER_POS.x, z:RADIO_TOWER_POS.z, col:'#ff9f5a', r:5 },
    { label:'The Spire', x:Math.cos(Math.PI*0.62)*340, z:Math.sin(Math.PI*0.62)*340, col:'#9f7fcf', r:4 },
    { label:'Downtown', x:0, z:-60, col:'rgba(201,194,182,0.55)', r:0 },
    { label:'Exit Road', x:exitRoadDirX*200, z:exitRoadDirZ*200, col:'rgba(201,194,182,0.4)', r:0 },
  ];
  ctx.font = `${Math.round(W*0.019)}px monospace`;
  ctx.textAlign='center';
  const EDGE_MARGIN = 22; // keep clamped markers/arrows off the canvas edge, room for the arrow + label
  for(const lm of landmarks){
    const p=worldToBig(lm.x, lm.z);
    const offLeft = p.x < EDGE_MARGIN, offRight = p.x > W-EDGE_MARGIN;
    const offTop = p.y < EDGE_MARGIN, offBottom = p.y > H-EDGE_MARGIN;
    const offscreen = offLeft||offRight||offTop||offBottom;
    if(!offscreen){
      if(lm.r>0){
        ctx.fillStyle=lm.col;
        ctx.beginPath(); ctx.arc(p.x,p.y,lm.r,0,Math.PI*2); ctx.fill();
      }
      ctx.fillStyle=lm.col;
      ctx.fillText(lm.label, p.x, p.y - lm.r - 5);
      continue;
    }
    // Clamp to the viewport edge along the line from center to the
    // landmark, then draw a small arrow pointing further outward.
    const cx=W/2, cy=H/2;
    const dx=p.x-cx, dy=p.y-cy;
    const scale = Math.min(
      (W/2-EDGE_MARGIN)/Math.max(Math.abs(dx),0.0001),
      (H/2-EDGE_MARGIN)/Math.max(Math.abs(dy),0.0001)
    );
    const ex = cx+dx*scale, ey = cy+dy*scale;
    const ang = Math.atan2(dy,dx);
    ctx.save();
    ctx.translate(ex,ey);
    ctx.rotate(ang);
    ctx.fillStyle=lm.col;
    ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(-4,5); ctx.lineTo(-4,-5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle=lm.col;
    ctx.fillText(lm.label, ex - Math.cos(ang)*16, ey - Math.sin(ang)*16 + 4);
  }

  // Fog of war: only the cells inside the current viewport (plus a
  // one-cell margin) ever need drawing, computed each frame from the
  // player's world position - the sparse fowVisited Set can hold far
  // more explored ground than any single frame ever renders.
  const cs = FOW_CELL*S; // cell size in canvas pixels
  const fowMinGx = Math.floor((px0-BIG_MAP_VIEW/2)/FOW_CELL)-1;
  const fowMaxGx = Math.floor((px0+BIG_MAP_VIEW/2)/FOW_CELL)+1;
  const fowMinGz = Math.floor((pz0-BIG_MAP_VIEW/2)/FOW_CELL)-1;
  const fowMaxGz = Math.floor((pz0+BIG_MAP_VIEW/2)/FOW_CELL)+1;
  ctx.fillStyle='rgba(4,3,6,0.88)';
  for(let gz=fowMinGz; gz<=fowMaxGz; gz++){
    for(let gx=fowMinGx; gx<=fowMaxGx; gx++){
      if(fowVisited.has(fowKey(gx,gz))) continue;
      const wx = gx*FOW_CELL, wz = gz*FOW_CELL;
      const p=worldToBig(wx+FOW_CELL/2, wz+FOW_CELL/2);
      ctx.fillRect(p.x-cs/2-0.5, p.y-cs/2-0.5, cs+1, cs+1);
    }
  }

  {
    const mx=W*0.08, my=H*0.07;
    ctx.fillStyle='rgba(201,194,182,0.6)';
    ctx.font=`bold ${Math.round(W*0.024)}px monospace`;
    ctx.textAlign='center';
    ctx.fillText('N', mx, my-10);
    ctx.strokeStyle='rgba(201,194,182,0.6)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(mx,my); ctx.lineTo(mx, my+12); ctx.stroke();
    const barW=100*S;
    const bx=W*0.86, by=H*0.94;
    ctx.strokeStyle='rgba(201,194,182,0.5)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(bx-barW/2,by); ctx.lineTo(bx+barW/2,by); ctx.stroke();
    ctx.font=`${Math.round(W*0.016)}px monospace`;
    ctx.fillStyle='rgba(201,194,182,0.5)';
    ctx.fillText('100m', bx, by-5);
  }
}