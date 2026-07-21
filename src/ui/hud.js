// ---------- HUD: autosave indicator + minimap/radio DOM refs ----------
// Scoped down from the ARCHITECTURE.md table, same pattern as
// sky.js/terrain.js: the table lists this file as owning "icon buttons,
// minimap draw, autosave indicator". updateMinimap() itself is still a
// chokepoint (reads ghuulList - now importable, but not yet pulled into
// this file). radioBtn/radioTicker added this round: confirmed via grep
// they're plain $()/getElementById refs, nothing else - the actual
// leaf that was blocking systems/radio.js and systems/sanity.js from
// having a home, now that audio (their other blocker) has one
// (systems/audio.js, see docs/HANDOFF.md).
//
// What's actually here: `flashAutosaveIndicator()`, the minimap canvas/
// context refs (`minimapCanvas`/`minimapCtx`), `radioBtn`/`radioTicker`,
// and now `updateMinimap()` itself - its last two blockers
// (`ghuulList`, DOM refs) are both cleared, so it's a real function here
// now. `radioPickupMesh`/`orbMeshes`/`RADIO_PICKUP_POS`/`RADIO_TOWER_POS`
// still have no module home (main.js-local), so they're passed in as
// params - same decoupling shape as updateGhuul()'s `stinger` param.
// main.js imports all of these back, same as every other DOM ref pulled
// so far.

import { state } from '../core/state.js';
import {
  downtownStreetRibbons, activeMinimapBuildings,
  EXIT_ROAD_HALFWIDTH, EXIT_ROAD_START, EXIT_ROAD_END,
  exitRoadDirX, exitRoadDirZ,
} from '../world/worldData.js';
import { ghuulList } from '../entities/ghuuls.js';
import { getNearbySquallCount } from '../sky/weather.js';
import { getActiveQuests } from '../systems/quests.js';
//
// Still owed: updateMinimap() itself, and the icon-button click-handler
// wiring (radio/pause/interact - currently still in main.js, tangled
// with toggleRadio()/corruptPress()/collectRadio()).
const AUTOSAVE_HINT_KEY = 'anothersky_autosave_hint_seen_v1';
let autosaveIndicatorTimer = null;

export function flashAutosaveIndicator(label){
  const el = document.getElementById('autosave-indicator');
  if(!el) return;
  const labelEl = el.querySelector('span');
  if(labelEl) labelEl.textContent = label || 'saving';
  el.classList.add('show');
  let hintSeen = true;
  try{ hintSeen = !!localStorage.getItem(AUTOSAVE_HINT_KEY); }catch(e){}
  if(!hintSeen){
    el.classList.add('show-hint');
    try{ localStorage.setItem(AUTOSAVE_HINT_KEY, '1'); }catch(e){}
  }
  if(autosaveIndicatorTimer) clearTimeout(autosaveIndicatorTimer);
  const hideDelay = el.classList.contains('show-hint') ? 5200 : 2200;
  autosaveIndicatorTimer = setTimeout(()=>{
    el.classList.remove('show');
    el.classList.remove('show-hint');
  }, hideDelay);
}

export const minimapCanvas = document.getElementById('minimap-canvas');
export const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

/* ---------- WEATHER LABEL ----------
   Reads getNearbySquallCount() (see sky/weather.js) rather than any
   authored weather-state - a fuzzy read of what's actually rendering
   near the player, not a designed intensity level (see docs/HANDOFF.md).
   0 cells nearby -> LIGHT, 1-2 -> RAIN, 3+ -> HEAVY (RAIN_CELL_COUNT is
   6 total, so 3+ nearby is already a real cluster). Only re-touches the
   DOM on a tier change, same "skip unchanged writes" caution as
   updateDread()'s filter attributes. */
const weatherLabelEl = document.getElementById('weather-label');
const weatherLabelCondEl = document.getElementById('weather-label-cond');
let lastWeatherTier = null;
export function updateWeatherLabel(){
  if(!weatherLabelEl || !weatherLabelCondEl) return;
  const n = getNearbySquallCount();
  const tier = n<=0 ? 'light' : (n<=2 ? 'rain' : 'heavy');
  if(tier===lastWeatherTier) return;
  lastWeatherTier = tier;
  weatherLabelCondEl.textContent = tier==='light' ? 'CLEAR' : (tier==='rain' ? 'RAIN' : 'HEAVY RAIN');
  weatherLabelEl.classList.remove('tier-light','tier-rain','tier-heavy');
  weatherLabelEl.classList.add('tier-'+tier);
  weatherLabelEl.classList.add('visible');
}

export const radioBtn = document.getElementById('radio-btn');
export const radioTicker = document.getElementById('radio-ticker');

/* ---------- OBJECTIVE PANEL ----------
   Reads getActiveQuests(state) (systems/quests.js) - already gated to
   return [] until the radio's been picked up, so this panel just stays
   empty/hidden until then, same as the source data. Update cadence:
   called every frame from animate() like updateWeatherLabel(), but
   builds a cheap signature string (id:have per quest) and skips all DOM
   work when nothing's actually changed - objective state only moves on
   real game events (pickup, door unlock, etc), not per-frame, so
   re-writing innerHTML 60x/sec would be pure waste. Matches the
   reference mockup's structure: an "OBJECTIVE" section label, the
   current (first not-yet-complete) objective as a dash-prefixed
   rust-red line, and just the next upcoming one dimmed underneath -
   completed objectives and the per-item status word ("Found"/
   "Searching", still available via q.label for anything else that
   wants it) are dropped rather than kept as a growing on-screen
   history, to match the reference's plain current/next read. Once
   every objective is complete, the last one stays shown as current
   rather than the panel going dark. */
const objectivePanelEl = document.getElementById('objective-panel');
let lastObjectiveSig = null;
export function updateObjectivePanel(){
  if(!objectivePanelEl) return;
  const quests = getActiveQuests(state);
  if(!quests.length){
    if(lastObjectiveSig !== ''){
      lastObjectiveSig = '';
      objectivePanelEl.innerHTML = '';
      objectivePanelEl.classList.remove('visible');
    }
    return;
  }
  const sig = quests.map(q => `${q.id}:${q.have}`).join('|');
  if(sig === lastObjectiveSig) return;
  lastObjectiveSig = sig;
  const currentIdx = quests.findIndex(q => !q.have);
  const activeIdx = currentIdx===-1 ? quests.length-1 : currentIdx;
  const current = quests[activeIdx];
  const next = quests[activeIdx+1];
  objectivePanelEl.innerHTML = `
    <div class="obj-section-label">OBJECTIVE</div>
    <div class="obj-row current">${current.name}</div>
    ${next ? `<div class="obj-row next">${next.name}</div>` : ''}
  `;
  objectivePanelEl.classList.add('visible');
}

/* ---------- SYSTEM CLOCK ----------
   Real-world wall clock (not game time - state.elapsed is a separate
   thing), 12-hour with AM/PM per the mockup ("03:17 AM"). Ticks itself
   via its own setInterval rather than being driven from animate()'s
   per-frame loop - a minute-resolution display has no business being
   recomputed 60x/sec, and this way it keeps ticking even while paused/
   on menus. Self-starting at module load, aligned to the next real
   minute boundary so it doesn't drift. */
const hudClockEl = document.getElementById('hud-clock');
function formatClock(d){
  let h = d.getHours();
  const ampm = h>=12 ? 'PM' : 'AM';
  h = h % 12; if(h===0) h = 12;
  const hh = String(h).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${hh}:${mm} ${ampm}`;
}
function tickClock(){
  if(hudClockEl) hudClockEl.textContent = formatClock(new Date());
}
if(hudClockEl){
  tickClock();
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(()=>{
    tickClock();
    setInterval(tickClock, 60000);
  }, msToNextMinute);
}

/* ---------- MINIMAP ----------
   Draws a ~30m-radius radar view once unlocked at the radio tower:
   downtown streets + the exit road as paved ribbons, nearby building/ruin
   footprints as blocks, player as a facing triangle at center, nearby
   ghuuls as red blips, nearby lore orbs as faint bone-colored blips, and a
   marker toward the tower itself if it's outside the visible radius.
   radioPickupMesh/orbMeshes/RADIO_PICKUP_POS/RADIO_TOWER_POS aren't
   module-scoped anywhere yet (still main.js-local `let`/`const`s created
   after gameplay starts), so - same pattern as updateGhuul()'s `stinger`
   param - they're passed in rather than imported. */
const MINIMAP_RADIUS_M = 30;
export function updateMinimap(radioPickupMesh, orbMeshes, RADIO_PICKUP_POS, RADIO_TOWER_POS){
  if(!state.minimapUnlocked || !minimapCtx) return;
  const cx = minimapCanvas.width/2, cy = minimapCanvas.height/2;
  const pxPerM = (minimapCanvas.width*0.46) / MINIMAP_RADIUS_M;
  const px = state.playerX, pz = state.playerZ;
  const ctx = minimapCtx;
  ctx.clearRect(0,0,minimapCanvas.width,minimapCanvas.height);
  ctx.strokeStyle = 'rgba(201,194,182,0.14)';
  ctx.lineWidth = 1;
  [0.33,0.66,1].forEach(f=>{
    ctx.beginPath();
    ctx.arc(cx, cy, minimapCanvas.width*0.46*f, 0, Math.PI*2);
    ctx.stroke();
  });
  const cosY = Math.cos(state.yaw), sinY = Math.sin(state.yaw);
  function worldToMap(wx, wz){
    const dx = wx - px, dz = wz - pz;
    const rx = dx*cosY - dz*sinY;
    const rz = dx*sinY + dz*cosY;
    return { x: cx + rx*pxPerM, y: cy + rz*pxPerM };
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, minimapCanvas.width*0.46, 0, Math.PI*2);
  ctx.clip();
  function drawRoad(x0,z0,x1,z1, halfWidthM, alpha){
    const p0 = worldToMap(x0,z0), p1 = worldToMap(x1,z1);
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(60,57,52,${alpha})`;
    ctx.lineWidth = Math.max(1, halfWidthM*2*pxPerM);
    ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
    ctx.strokeStyle = `rgba(212,199,174,${alpha*0.5})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4,5]);
    ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
    ctx.setLineDash([]);
  }
  for(const r of downtownStreetRibbons){
    const d = Math.hypot(px,pz);
    if(d > r.r1 + MINIMAP_RADIUS_M) continue;
    const dx = Math.cos(r.ang), dz = Math.sin(r.ang);
    drawRoad(dx*r.r0, dz*r.r0, dx*r.r1, dz*r.r1, r.hw, 0.6);
  }
  drawRoad(exitRoadDirX*EXIT_ROAD_START, exitRoadDirZ*EXIT_ROAD_START, exitRoadDirX*EXIT_ROAD_END, exitRoadDirZ*EXIT_ROAD_END, EXIT_ROAD_HALFWIDTH, 0.65);
  const ISO_PX_PER_M_HEIGHT = 0.85;
  const ISO_MAX_RISE = 22;
  for(const b of activeMinimapBuildings){
    const ddx = b.x-px, ddz = b.z-pz;
    const reach = MINIMAP_RADIUS_M + Math.max(b.hw,b.hd);
    const distSq = ddx*ddx+ddz*ddz;
    if(distSq > reach*reach) continue;
    const fade = Math.max(0.25, 1 - Math.sqrt(distSq)/reach);
    const isRuin = b.type === 'ruin';
    const isRelay = b.type === 'relay';
    const rise = -Math.min(ISO_MAX_RISE, (b.h||6) * ISO_PX_PER_M_HEIGHT) * (isRuin ? 0.4 : 1);
    const c = isRuin ? [255,140,90] : isRelay ? [255,80,80] : [130,225,255];
    const corners = [
      worldToMap(b.x-b.hw, b.z-b.hd),
      worldToMap(b.x+b.hw, b.z-b.hd),
      worldToMap(b.x+b.hw, b.z+b.hd),
      worldToMap(b.x-b.hw, b.z+b.hd),
    ];
    const apex = corners.map(p=>({ x:p.x, y:p.y+rise }));
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.22*fade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.35*fade})`;
    for(let i=0;i<4;i++){
      ctx.beginPath();
      ctx.moveTo(corners[i].x, corners[i].y);
      ctx.lineTo(apex[i].x, apex[i].y);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.14*fade})`;
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.85*fade})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    apex.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  if(!state.radioCollected && radioPickupMesh){
    const d = Math.hypot(RADIO_PICKUP_POS.x-px, RADIO_PICKUP_POS.z-pz);
    if(d <= MINIMAP_RADIUS_M){
      const p = worldToMap(RADIO_PICKUP_POS.x, RADIO_PICKUP_POS.z);
      const pulse = 0.55 + Math.sin(performance.now()*0.006)*0.25;
      ctx.fillStyle = `rgba(255,214,120,${pulse})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI*2); ctx.fill();
    }
  }
  if(typeof orbMeshes!=='undefined'){
    for(const o of orbMeshes){
      if(o.collected) continue;
      const d = Math.hypot(o.mesh.position.x-px, o.mesh.position.z-pz);
      if(d>MINIMAP_RADIUS_M) continue;
      const p = worldToMap(o.mesh.position.x, o.mesh.position.z);
      ctx.fillStyle = 'rgba(201,194,182,0.75)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
    }
  }
  if(typeof ghuulList!=='undefined'){
    for(const g of ghuulList){
      const d = Math.hypot(g.x-px, g.z-pz);
      if(d>MINIMAP_RADIUS_M) continue;
      const p = worldToMap(g.x, g.z);
      ctx.fillStyle = g.aiState==='HUNT' ? '#ff3b3b' : 'rgba(122,31,31,0.7)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI*2); ctx.fill();
    }
  }
  {
    const dTower = Math.hypot(RADIO_TOWER_POS.x-px, RADIO_TOWER_POS.z-pz);
    if(dTower <= MINIMAP_RADIUS_M){
      const p = worldToMap(RADIO_TOWER_POS.x, RADIO_TOWER_POS.z);
      ctx.fillStyle = '#ff9f5a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
    } else {
      const p = worldToMap(RADIO_TOWER_POS.x, RADIO_TOWER_POS.z);
      const ang = Math.atan2(p.y-cy, p.x-cx);
      const ex = cx + Math.cos(ang)*minimapCanvas.width*0.44;
      const ey = cy + Math.sin(ang)*minimapCanvas.width*0.44;
      ctx.fillStyle = 'rgba(255,159,90,0.8)';
      ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#e7e0d2';
  ctx.beginPath();
  ctx.moveTo(0,-5); ctx.lineTo(3.5,4); ctx.lineTo(-3.5,4); ctx.closePath();
  ctx.fill();
  ctx.restore();
}