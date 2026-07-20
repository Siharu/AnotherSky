import { state, GAME_VERSION, EYE_HEIGHT, PLAYER_RADIUS, WORLD_RADIUS, SPEED, LOOK_SENS_TOUCH } from './core/state.js';
import { canvas, renderer, baseDPR, scene, FOG_COLOR, camera, clock } from './core/scene.js';
import {
  skyGradientColors, skyGradientColorsCalm, SKY_CALM, SKY_WRONG, skyColorsAt,
  domeMat, domeMesh,
  starPoints, starMat,
  holeUniforms, holeMaterial, holeMesh, createHoleMaterial,
  MONOLITH_BEARING, MONOLITH_DIST, monolithMat, monolithMesh,
  monolithGlowMat, monolithGlowMesh,
  monolithSwarm, updateMonolithSwarm
} from './sky/sky.js';
import {
  cloudLayer, cloudLayer2, cloudMat, cloudMat2, dripLayer, dripMat,
  updateRain, updateDust
} from './sky/weather.js';
import { makeCanvas, patchFogToDistance } from './render/postprocessing.js';
import { terrainHeight, groundHeightAt } from './world/terrain.js';
import { initGrass, updateGrass } from './world/grass.js';
import { groundTexture, toonGradientMap, toonRamp } from './world/materials.js';
import {
  minimapBuildings, minimapChunkBuildingMap, downtownStreetRibbons, activeMinimapBuildings,
  rebuildActiveMinimapBuildings, registerChunkMinimapBuildings, unregisterChunkMinimapBuildings,
  lamps,
  EXIT_ROAD_ANGLE, EXIT_ROAD_HALFWIDTH, EXIT_ROAD_START, EXIT_ROAD_END,
  exitRoadDirX, exitRoadDirZ, exitRoadPerpX, exitRoadPerpZ
} from './world/worldData.js';
import { resolveCollisions } from './systems/collision.js';
import { renderHelp } from './ui/help.js';
import { renderMemories } from './ui/memories.js';
import { renderRadioLog } from './ui/radiolog.js';
import { renderInventory } from './ui/inventory.js';
import { LORE, LORE_CLUSTER_A, LORE_CLUSTER_B, LORE_CLUSTER_C, LORE_CENTERPIECE } from './data/lore.js';
import { pickNextNotebookEntry, NOTEBOOK_NOTHING_NEW } from './data/notebook.js';
import { answeringMachineLines } from './data/dialogue.js';
import { relayActivationLine, relayReturnCueLine, doorApproachLine, doorOpenPlayerLine, doorOpenRadioLine } from './data/dialogue.js';
import { startGlitchScramble, stopGlitchScramble } from './ui/credits.js';
import { flashAutosaveIndicator, minimapCanvas, minimapCtx, radioBtn, radioTicker, updateMinimap } from './ui/hud.js';
import { bigmapCanvas, bigmapCtx, BIG_MAP_WORLD, worldToBig, updateFowAt, drawBigMap } from './ui/bigmap.js';
import { showWhisper, updateWhisper, updateWhisperCooldown, pickAmbientWhisper, pickWhisperOnCollect } from './ui/whisper.js';
import {
  ghuulList, ghuulSpawnThresholds, createGhuul, maybeSpawnGhuul,
  ghuulVisionRange, ghuulHearingRadius, ghuulFacingPlayer,
  ghuulMoveToward, ghuulMoveAway, ghuulPatrolStep, alertGhuulToward,
  updateGhuul
} from './entities/ghuuls.js';
import {
  getAudioCtx, ensureAudioCtx, getMasterGain, getWindGain, getInteriorGain,
  initAudio, tickHeartbeat,
  playStinger, playThunder, playFakeFootstep, playWetFootstep,
  playAnimalCall, playBreath
} from './systems/audio.js';
import { SAVE_KEY, hasSave, writeSave, deleteSave, updateRegainAvailability, tickAutosave, migrateSave } from './systems/save.js';
import {
  userVolume, settingsSensMult, settingsBrightness, settingsResScale,
  settingsInvertY, settingsVibration,
  applyResolution, settingsOverlay, settingsOpenedFromHub,
  setSettingsOpenedFromHub, closeSettingsOverlay, saveSettings
} from './systems/settings.js';
// Themed dropdown for the Resolution setting (visual-only, drives the
// hidden native <select> above). Must import after settings.js so the
// hidden select already reflects the persisted value when this runs.
import './ui/res-select.js';
import {
  hubOverlay, isGameplayActive, hubOpen,
  openHub, closeHub, showHubFlavor
} from './ui/menu.js';
import { setTitleScreenActive, tickMenuIdle, registerMainRefs } from './ui/titleScreen.js';
import { updateDread } from './systems/dread.js';
import { updatePlayer, registerPlayerRefs } from './entities/player.js';
import { pickFrom } from './utils/math.js';
import {
  bearingToCompassAngle, pickSituationalRadioLine, broadcastRadio,
  updateRadio, resetRadioTimer,
} from './systems/radio.js';
import { updateSanity, updateSanityVisual } from './systems/sanity.js';
import { directorInputs, evaluateDirector, runDirectorAction, flickerRandomLamp } from './entities/director.js';
import { addGlow, meltUniform, patchFogAndMelt } from './render/postprocessing.js';
import { stoneTex, buildingDarkMat } from './world/materials.js';
import { obstacles, CHUNK_SIZE, DOWNTOWN_EDGE, downtownWindowSpots } from './world/worldData.js';
import {
  addBuilding, updateFacadePoolCounts, updateRelayBeacons,
  activeWindowSpots, rebuildActiveWindowSpots, unitBoxGeo
} from './world/buildings.js';
import { addLamp, addStreetRibbon, addRuin, scatterClutter, rubbleGeo, puddleGeo, RUBBLE_COUNT, PUDDLE_COUNT } from './world/props.js';
import { updateWorldStream, UNLOAD_RADIUS_CHUNKS, mulberry32 } from './world/streaming.js';

// SAFEHOUSE_CENTER/SAFEHOUSE_HALF_W/SAFEHOUSE_HALF_D used to be declared
// here and exported for sky/weather.js and world/safehouse.js to import
// back - based on a mistaken assumption that placing this import *after*
// that export in main.js's own source order would make the export
// available in time. It doesn't: ES module imports are hoisted and
// resolved as a dependency graph before any importing module's own
// top-level code runs, regardless of where the import statement sits in
// the file. Since main.js's own import of safehouse.js still had to be
// resolved before main.js's top-level code (including this declaration)
// ever ran, safehouse.js's own top-level code that read SAFEHOUSE_CENTER
// (to compute EXTERIOR_CENTER/INT_DOOR_TRIGGER/INT_DOOR_LANDING) was
// reading it before main.js had ever assigned it - a real
// "Cannot access before initialization" TDZ crash on load, caught during
// a full audit, not by any of the earlier per-round verification passes
// (which checked module linking, not evaluation-order correctness).
// Fixed by moving true ownership to world/safehouse.js, which only needs
// `state` (already imports it) to compute these - no circular import
// needed for them at all anymore. sky/weather.js and systems/dread.js
// now import them from world/safehouse.js instead of main.js.
import {
  buildSafehouse, buildSafehouseExterior,
  updateDoorFlash, updateSafehouseInterior,
  NOTEBOOK_POS, LOCKED_DOOR_POS, BED_TABLE_POS, SAFEHOUSE_DOOR_YAW,
  SAFEHOUSE_CENTER,
} from './world/safehouse.js';
import { updateDoorTransitions } from './systems/doors.js';

/* ============================================================
   ANOTHER SKY — atmospheric walking horror
   Single-file Three.js build. Mobile-first controls.
   ============================================================ */

console.log(`Another Sky — v${GAME_VERSION}`); // ties a bug report to an exact code version instead of a guess
{ const vEl = document.getElementById('credits-version'); if(vEl) vEl.textContent = `v${GAME_VERSION}`; }

// ---------- DEBUG MODE ----------
// ?debug=1 in the URL, or localStorage.anothersky_debug==='1' (so it can
// be left on across reloads without retyping the URL param - useful for
// a multi-reload testing session). Currently just an FPS counter; this
// is the extension point for future diagnostics (noclip, teleport,
// forced weather states, etc.) without needing a separate debug build.
// Pairs with the on-screen error/warning overlay in index.html's
// <head> - that one is passive (catches things going wrong on its own),
// this is for deliberately-requested diagnostics.
const DEBUG_MODE = new URLSearchParams(location.search).has('debug') || localStorage.getItem('anothersky_debug')==='1';
let fpsEl = null;
if(DEBUG_MODE){
  fpsEl = document.createElement('div');
  fpsEl.id = 'debug-fps';
  fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99998;'
    +'font:11px monospace;color:#8fd18f;background:rgba(0,0,0,0.5);padding:3px 6px;border-radius:3px;pointer-events:none;';
  document.body.appendChild(fpsEl);
}
let fpsFrames = 0, fpsAccum = 0;

/* ---------- LORE DATA ----------
   Moved to src/data/lore.js (Wave 1) and imported at true module top
   level above - this was a leftover byte-identical duplicate of that
   file's export, still referenced locally for orb placement further
   down. Removed to restore one source of truth. */

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);

const titleScreen = $('title-screen');
const titleFrame = $('title-frame');
const titleGrain = $('title-grain');
const rotateOverlay = $('rotate-overlay');
const hud = $('hud');
const interactPrompt = $('interact-prompt');
const interactBtn = $('interact-btn');
// vignetteEl/dreadTintEl/rOffsetEl/bOffsetEl/turbNoiseEl/tearDisplaceEl and
// the glitch/filter-cache vars now live in systems/dread.js (Wave 3 - see
// docs/HANDOFF.md), resolved locally there since they were never used
// anywhere outside updateDread() in the first place.
// radioBtn/radioTicker now live in ui/hud.js — imported above.
const compassStrip = $('compass-strip');
const joyZone = $('joystick-zone');
const joyBase = $('joy-base');
const joyKnob = $('joy-knob');
const lookZone = $('look-zone');

/* Reference width the sensitivity above was tuned for. clientX/clientY from
   touch events are already CSS pixels (devicePixelRatio doesn't inflate
   them), but a narrow phone screen still has a shorter look-zone in CSS
   pixels than a tablet/desktop, so the same finger swipe covers a bigger
   fraction of the zone and reads as a bigger, twitchier turn. Scale
   sensitivity relative to viewport width so the same physical swipe
   produces roughly the same angular turn on any screen. */
const LOOK_REF_WIDTH = 420;
function touchLookSens(){
  const w = Math.max(280, window.innerWidth || LOOK_REF_WIDTH);
  return LOOK_SENS_TOUCH * (LOOK_REF_WIDTH / w);
}
/* Smoothing state for touch look: raw per-event deltas are noisy (a single
   laggy touch sample can report a big jump), so we keep a running smoothed
   delta and also clamp any single-frame delta so one bad sample can't fling
   the camera. */
let lookSmoothX=0, lookSmoothY=0;
const LOOK_SMOOTH = 0.35;      // 0..1, higher = more responsive/less smooth
const LOOK_MAX_DELTA = 60;     // CSS px per touchmove event, clamps spikes
const LOOK_SENS_MOUSE = 0.0036;

function cloudCrackTexture(){
  const w=1024,h=512,c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  ctx.fillStyle='rgba(0,0,0,0)'; ctx.fillRect(0,0,w,h);
  // soft, murky storm clouds only - the wound itself is the real 3D black hole mesh now
  for(let i=0;i<70;i++){
    const x=Math.random()*w, y=Math.random()*h*0.85, r=40+Math.random()*140;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(38,42,34,0.4)');
    g.addColorStop(1,'rgba(38,42,34,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}


/* glowSprite()/addGlow() moved to render/postprocessing.js this round -
   imported at true module top-level above (see import block). */

/* film grain for the title screen - same canvas-texture approach as every
   other procedural texture in this file, just read out as a data URL for a
   plain CSS background instead of a THREE.CanvasTexture. */
function grainDataURL(){
  const size=140, c=makeCanvas(size), ctx=c.getContext('2d');
  const img = ctx.createImageData(size,size);
  for(let i=0;i<img.data.length;i+=4){
    const v = Math.random()*255;
    img.data[i]=v; img.data[i+1]=v; img.data[i+2]=v; img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  return c.toDataURL();
}
if(titleGrain) titleGrain.style.backgroundImage = `url(${grainDataURL()})`;
const titleVoidGrain = $('title-void-grain');
if(titleVoidGrain) titleVoidGrain.style.backgroundImage = `url(${grainDataURL()})`;

/* ---------- TERRAIN HEIGHT ----------
   Moved to src/world/terrain.js (Wave 2) — imported at true module
   top-level, see the import block above the IIFE. */

/* ---------- THREE SETUP ----------
   renderer/scene/camera/baseDPR/FOG_COLOR now come from
   core/scene.js (real module extraction - see docs/HANDOFF.md).
   settingsResScale/applyResolution now live in systems/settings.js
   (Wave 3 - see docs/HANDOFF.md), imported at top-level with the other
   settings bindings below. */

/* lights */
const ambient = new THREE.AmbientLight(0x3a2244, 0.4); // was 0.55 - extreme atmosphere pass: darker baseline
scene.add(ambient);
const skyLight = new THREE.HemisphereLight(0x5a2a4a, 0x0a0a0d, 0.28); // was 0.4 - extreme atmosphere pass
scene.add(skyLight);
const moonLight = new THREE.DirectionalLight(0x8fa8c8, 0.9);
moonLight.position.set(-60, 140, -40);
scene.add(moonLight);

/* meltUniform/patchFogAndMelt moved to render/postprocessing.js this
   round; addLamp() moved to world/props.js - both imported at true
   module top-level above. */

/* ---------- GROUND ---------- */
const groundSize = 600, groundSeg = 180;
const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, groundSeg, groundSeg);
{
  const pos = groundGeo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x = pos.getX(i), yLocal = pos.getY(i);
    const worldZ = -yLocal;
    pos.setZ(i, groundHeightAt(x, worldZ));
  }
  groundGeo.computeVertexNormals();
  groundGeo.rotateX(-Math.PI/2);
}
const groundMat = new THREE.MeshToonMaterial({
  map: groundTexture(), color:0x8a8a94, gradientMap:toonRamp
});
patchFogToDistance(groundMat);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.position.y = 0;
scene.add(ground);

// far skirt: a second, larger dark plane beyond the detailed ground so the
// WORLD_RADIUS boundary never shows as a visible edge — it just fogs out.
const skirtGeo = new THREE.PlaneGeometry(2600, 2600);
const skirtMat = new THREE.MeshBasicMaterial({ color:0x08070a, fog:true });
patchFogToDistance(skirtMat);
const skirt = new THREE.Mesh(skirtGeo, skirtMat);
skirt.rotation.x = -Math.PI/2;
skirt.position.y = -0.15;
scene.add(skirt);

// player-relative sliding-window grass patch - see world/grass.js
initGrass();


/* ---------- LIGHTNING ---------- */
const lightningEl = document.getElementById('lightning-flash');
let lightningTimer = 6;
function triggerLightning(){
  const strength = 0.55 + Math.random()*0.4;
  lightningEl.style.transition = 'none';
  lightningEl.style.opacity = strength;
  requestAnimationFrame(()=>{
    lightningEl.style.transition = 'opacity 0.35s ease';
    lightningEl.style.opacity = 0;
  });
  const oldAmb = ambient.intensity, oldHemi = skyLight.intensity;
  ambient.intensity = 2.4; skyLight.intensity = 2.0;
  setTimeout(()=>{ ambient.intensity = oldAmb; skyLight.intensity = oldHemi; }, 350); // was 140ms vs the screen flash's 350ms fade - light snapped back while the screen still visibly read as flashed
  playThunder();
}

/* ---------- CITY SKYLINE ---------- */
// This was a city. A ring of broken silhouettes at the edge of the fog
// says so without a single word of dialogue - scale and implication.
function skylineTexture(){
  const w=2048, h=560;
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,w,h);
  const buildingCount = 110;
  for(let i=0;i<buildingCount;i++){
    const bw = 14+Math.random()*50;
    const bx = Math.random()*w;
    const bh = 70+Math.random()*(h*0.75);
    const by = h-bh;
    const shade = 4+Math.random()*10;
    ctx.fillStyle = `rgb(${shade},${shade+1},${shade+3})`;
    ctx.beginPath();
    ctx.moveTo(bx, h);
    ctx.lineTo(bx, by+Math.random()*16);
    if(Math.random()<0.45){
      ctx.lineTo(bx+bw*0.35, by-14-Math.random()*26);
      ctx.lineTo(bx+bw*0.65, by+Math.random()*20);
    }
    ctx.lineTo(bx+bw, by+Math.random()*16);
    ctx.lineTo(bx+bw, h);
    ctx.closePath();
    ctx.fill();
    if(Math.random()<0.22){
      const wx = bx+bw*0.15+Math.random()*bw*0.7;
      const wy = by+bh*0.1+Math.random()*bh*0.7;
      ctx.fillStyle = Math.random()<0.5 ? 'rgba(220,150,90,0.85)' : 'rgba(190,110,170,0.75)';
      ctx.fillRect(wx,wy,2.5,4.5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
{
  const geo = new THREE.CylinderGeometry(330, 330, 280, 56, 1, true);
  const mat = new THREE.MeshBasicMaterial({ map:skylineTexture(), transparent:true, side:THREE.DoubleSide, depthWrite:false, opacity:0.92, fog:true });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.y = 95;
  scene.add(ring);
}

const towerMat = new THREE.MeshToonMaterial({ color:0x08080a, gradientMap:toonRamp });
patchFogToDistance(towerMat);
const towerWindows = [];
function addTower(x,z,h,w){
  const y = groundHeightAt(x,z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,w), towerMat);
  mesh.position.set(x, y+h/2, z);
  mesh.rotation.y = Math.random()*Math.PI;
  if(Math.random()<0.3) mesh.rotation.z = (Math.random()-0.5)*0.05;
  scene.add(mesh);
  const winCount = 1+Math.floor(Math.random()*3);
  for(let i=0;i<winCount;i++){
    const warm = Math.random()<0.5;
    const wm = new THREE.MeshBasicMaterial({ color: warm?0xe0a060:0xb478c0, transparent:true });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7,1.0), wm);
    win.position.set((Math.random()-0.5)*w*0.7, Math.random()*h*0.7+2, w/2+0.03);
    mesh.add(win);
    towerWindows.push({ mat:wm, phase:Math.random()*20 });
  }
}
{
  const towerCount = 20;
  for(let i=0;i<towerCount;i++){
    const ang = (i/towerCount)*Math.PI*2 + Math.random()*0.25;
    const r = 240+Math.random()*130;
    const h = 26+Math.random()*74;
    addTower(Math.cos(ang)*r, Math.sin(ang)*r, h, 8+Math.random()*10);
  }
}


/* ---------- SOMETHING MOVING IN THE CLOUDS ---------- */
function shapeTexture(){
  const w=512,h=256, c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(w/2,h/2,10,w/2,h/2,w/2);
  g.addColorStop(0,'rgba(0,0,0,0.8)');
  g.addColorStop(0.6,'rgba(0,0,0,0.3)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(w/2,h/2,w*0.46,h*0.3,0,0,Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(c);
}
const skyShapes = [];
{
  const tex = shapeTexture();
  for(let i=0;i<2;i++){
    const mat = new THREE.MeshBasicMaterial({ map:tex, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide, fog:false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(95,48), mat);
    scene.add(mesh);
    skyShapes.push({
      mesh, ang:Math.random()*Math.PI*2, speed:0.006+Math.random()*0.006, radius:120+Math.random()*20, height:60+Math.random()*35, phase:Math.random()*40,
      // breach state - normally 0 (just an ordinary drifting silhouette).
      // triggerSkyBreach() below ramps this 0->1->0 to make one of these
      // things shove up against the underside of the cloud deck, huge and
      // close, before sinking back to a shape you can talk yourself out of.
      breach:0, breaching:false
    });
  }
}
let breachTimer = 26 + Math.random()*20; // first breach only once the sky's already turning
function triggerSkyBreach(){
  const s = skyShapes[Math.floor(Math.random()*skyShapes.length)];
  if(s.breaching) return;
  s.breaching = true;
  s.breach = 0;
  s.breachAng = state.yaw + (Math.random()-0.5)*2.4; // roughly ahead of the player, not always dead-on
  playThunder && playThunder();
}
/* ---------- THE WATCHING EYE ----------
   Something behind the cloud dome. It doesn't move like the drifting shapes
   above - it holds still and looks back. Almost never open at low dread;
   as dread rises it blinks more often, opens wider, and lingers longer,
   so a player who's been staring at the sky for a while starts to notice
   it's staring back. */
function eyeTexture(){
  const w=512,h=512,c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  const cx=w/2, cy=h/2;
  // sclera - sickly, jaundiced, not clean white
  const sc=ctx.createRadialGradient(cx,cy,10,cx,cy,w*0.5);
  sc.addColorStop(0,'rgba(198,182,150,0.95)');
  sc.addColorStop(0.65,'rgba(150,116,96,0.92)');
  sc.addColorStop(1,'rgba(90,60,60,0)');
  ctx.fillStyle=sc;
  ctx.beginPath(); ctx.ellipse(cx,cy,w*0.48,h*0.30,0,0,Math.PI*2); ctx.fill();
  // grimy mottling so the sclera doesn't read as clean/organic
  for(let i=0;i<50;i++){
    const x=cx+(Math.random()-0.5)*w*0.85, y=cy+(Math.random()-0.5)*h*0.5, r=4+Math.random()*14;
    ctx.fillStyle=`rgba(70,45,40,${0.08+Math.random()*0.1})`;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  // bloodshot vessels radiating from the outer edge toward the iris - denser
  // and darker than before, more of them reaching all the way to the iris ring
  ctx.strokeStyle='rgba(160,8,12,0.65)';
  ctx.lineWidth=1.6;
  for(let i=0;i<150;i++){
    const a=Math.random()*Math.PI*2;
    const r0=w*0.47*Math.random(), r1=r0-40-Math.random()*95;
    const x0=cx+Math.cos(a)*r0*0.98, y0=cy+Math.sin(a)*r0*0.30/0.48;
    const x1=cx+Math.cos(a)*Math.max(r1,30)*0.9, y1=cy+Math.sin(a)*Math.max(r1,30)*0.30/0.48;
    ctx.beginPath(); ctx.moveTo(x0,y0);
    ctx.quadraticCurveTo(cx+Math.cos(a+0.2)*r0*0.6, cy+Math.sin(a+0.2)*r0*0.2, x1,y1);
    ctx.stroke();
  }
  // iris - deep arterial red, not a natural eye color
  const ir=ctx.createRadialGradient(cx,cy,4,cx,cy,118);
  ir.addColorStop(0,'#330405'); ir.addColorStop(0.55,'#6b0b0b'); ir.addColorStop(1,'#160203');
  ctx.fillStyle=ir; ctx.beginPath(); ctx.arc(cx,cy,118,0,Math.PI*2); ctx.fill();
  // fine iris fibers, denser near the pupil for a more clenched, hungry look
  ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1;
  for(let i=0;i<90;i++){
    const a=Math.random()*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*18, cy+Math.sin(a)*18);
    ctx.lineTo(cx+Math.cos(a)*112, cy+Math.sin(a)*112); ctx.stroke();
  }
  // a thin, harsh ring right at the iris edge - reads as unnatural / lidless
  ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(cx,cy,118,0,Math.PI*2); ctx.stroke();
  // pupil - wide vertical slit, dilated further than a natural eye would go
  ctx.fillStyle='#000000';
  ctx.beginPath(); ctx.ellipse(cx,cy,20,68,0,0,Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(c);
}
// soft radial glow used behind the eye - reads as a dim red glare in the
// clouds around it right before/while it's open, so it doesn't just pop
// into existence with nothing announcing it
function eyeGlowTexture(){
  const w=256,h=256,c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
  g.addColorStop(0,'rgba(200,20,20,0.85)');
  g.addColorStop(0.4,'rgba(140,10,15,0.35)');
  g.addColorStop(1,'rgba(140,10,15,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  return new THREE.CanvasTexture(c);
}
const eyeMaterial = new THREE.ShaderMaterial({
  uniforms:{ uMap:{value:eyeTexture()}, uOpacity:{value:0}, uTime:{value:0} },
  transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false,
  vertexShader:`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader:`
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uMap;
    uniform float uOpacity;
    uniform float uTime;
    void main(){
      vec4 tex = texture2D(uMap, vUv);
      // slow wet glisten sliding across the sclera, barely-there
      float glint = smoothstep(0.15,0.0, abs(fract((vUv.x+vUv.y*0.3) - uTime*0.03) - 0.5));
      vec3 col = tex.rgb + glint*0.06;
      gl_FragColor = vec4(col, tex.a*uOpacity);
    }
  `
});
const eyeMesh = new THREE.Mesh(new THREE.PlaneGeometry(34,34), eyeMaterial);
eyeMesh.scale.y = 0.04; // starts shut - a closed lid, effectively invisible
scene.add(eyeMesh);
const eyeGlowMaterial = new THREE.MeshBasicMaterial({
  map: eyeGlowTexture(), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, opacity:0
});
const eyeGlowMesh = new THREE.Mesh(new THREE.PlaneGeometry(70,70), eyeGlowMaterial);
scene.add(eyeGlowMesh);
// it doesn't drift on a slow orbit - it's somewhere else every time it
// blinks, so the sky never feels safe to stare at in any one direction
function rollEyeSpot(){
  return {
    ang: Math.random()*Math.PI*2,
    radius: 90 + Math.random()*90,
    height: 45 + Math.random()*70
  };
}
const eyeState = Object.assign({
  open: 0,            // current openness 0 (shut) -> 1 (fully open)
  target: 0,
  timer: 6 + Math.random()*10
}, rollEyeSpot());

/* ---------- THE EYE STORM ----------
   A one-time event, five minutes in: every eye that's been quietly blinking
   at the edge of vision suddenly opens at once, ringed all around the
   player, and then each one tears open into an active, violently churning
   black hole. Reuses the eye texture/material and the hole shader, just
   spawns many of each and drives them through a shared sequence:
     eyes (all snap open together) -> tear (eyes dissolve, holes erupt)
     -> rage (holes churn violently, pinned at max dread) -> settle (fade
     back to the ambient single-hole sky, leaving stormDreadBoost decaying) */
const EYE_STORM_COUNT = 10;
const EYE_STORM_TRIGGER_TIME = 300; // 5 minutes
let eyeStormFired = false;
let stormPhase = 'idle';   // idle -> eyes -> tear -> rage -> settle -> idle
let stormT = 0;
const stormEntities = [];

function buildStormEntities(){
  stormEntities.length = 0;
  for(let i=0;i<EYE_STORM_COUNT;i++){
    const ang = (i/EYE_STORM_COUNT)*Math.PI*2 + (Math.random()-0.5)*0.35;
    const radius = 100 + Math.random()*70;
    const height = 40 + Math.random()*90;

    const eMat = new THREE.ShaderMaterial({
      uniforms:{ uMap:{value:eyeMaterial.uniforms.uMap.value}, uOpacity:{value:0}, uTime:{value:0} },
      transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false,
      vertexShader: eyeMaterial.vertexShader, fragmentShader: eyeMaterial.fragmentShader
    });
    const eMesh = new THREE.Mesh(new THREE.PlaneGeometry(30,30), eMat);
    eMesh.scale.y = 0.04;
    scene.add(eMesh);

    const gMat = new THREE.MeshBasicMaterial({ map:eyeGlowMaterial.map, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, opacity:0 });
    const gMesh = new THREE.Mesh(new THREE.PlaneGeometry(62,62), gMat);
    scene.add(gMesh);

    const hUniforms = { uTime:{value:Math.random()*20}, uDread:{value:1}, uWrongness:{value:1} };
    const hMat = createHoleMaterial(hUniforms);
    const hMesh = new THREE.Mesh(new THREE.PlaneGeometry(60,60), hMat);
    hMesh.scale.setScalar(0.001);
    scene.add(hMesh);

    stormEntities.push({
      ang, radius, height, phase:Math.random()*10,
      timeMult: 1.6 + Math.random()*1.4,
      eMesh, eMat, gMesh, gMat, hUniforms, hMat, hMesh
    });
  }
}

function startEyeStorm(){
  buildStormEntities();
  stormPhase = 'eyes';
  stormT = 0;
  state.stormDreadBoost = 1;
  // a hard startle - same ambient light punch used for lightning
  const oldAmb = ambient.intensity, oldHemi = skyLight.intensity;
  ambient.intensity = 3.2; skyLight.intensity = 2.6;
  setTimeout(()=>{ ambient.intensity = oldAmb; skyLight.intensity = oldHemi; }, 180);
}

function updateEyeStorm(dt){
  if(!eyeStormFired && state.elapsed >= EYE_STORM_TRIGGER_TIME){
    eyeStormFired = true;
    startEyeStorm();
  }
  if(stormPhase==='idle') return;
  stormT += dt;

  for(const s of stormEntities){
    s.eMesh.position.set(state.playerX + Math.cos(s.ang)*s.radius, s.height, state.playerZ + Math.sin(s.ang)*s.radius);
    s.eMesh.lookAt(camera.position);
    s.gMesh.position.copy(s.eMesh.position);
    s.gMesh.lookAt(camera.position);
    s.hMesh.position.copy(s.eMesh.position);
    s.hMesh.quaternion.copy(camera.quaternion);
    s.hUniforms.uTime.value = stormT * s.timeMult;
  }

  if(stormPhase==='eyes'){
    // every eye snaps open together, fast and synchronized - this is the
    // "all at once" beat, distinct from the ambient eye's staggered blinks
    const open = Math.min(1, stormT/0.5);
    for(const s of stormEntities){
      s.eMesh.scale.y = 0.04 + open*0.96;
      s.eMat.uniforms.uOpacity.value = open;
      s.eMat.uniforms.uTime.value = stormT;
      s.gMat.opacity = open*0.7;
    }
    if(stormT > 1.6){ stormPhase='tear'; stormT=0; }

  } else if(stormPhase==='tear'){
    // each eye dissolves as its own hole erupts from the same spot - a
    // violent overshoot-then-settle scale on the hole so it reads as
    // tearing open rather than smoothly growing in
    const p = Math.min(1, stormT/1.1);
    const eyeFade = 1-p;
    const holeGrow = p<1 ? 1 - Math.pow(1-p, 3.0) : 1;
    const overshoot = 1 + Math.sin(p*Math.PI) * 0.35 * (1-p);
    for(const s of stormEntities){
      s.eMat.uniforms.uOpacity.value = eyeFade;
      s.gMat.opacity = eyeFade*0.7;
      s.hMesh.scale.setScalar(Math.max(0.001, holeGrow*overshoot));
    }
    if(stormT > 1.1){
      for(const s of stormEntities){ s.eMesh.visible=false; s.gMesh.visible=false; }
      stormPhase='rage'; stormT=0;
    }

  } else if(stormPhase==='rage'){
    // fully-formed, churning violently (uTime runs fast per-entity above,
    // uDread pinned at 1) and pulsing irregularly in scale/position
    for(const s of stormEntities){
      const jitter = 1 + Math.sin(stormT*9.0+s.phase)*0.06 + Math.sin(stormT*23.0+s.phase*2.0)*0.03;
      s.hMesh.scale.setScalar(jitter);
    }
    if(stormT > 6.0){ stormPhase='settle'; stormT=0; }

  } else if(stormPhase==='settle'){
    // they collapse back out of existence, dread boost decaying alongside
    // them so the sky eases back down rather than cutting off
    const p = Math.min(1, stormT/2.5);
    const shrink = Math.pow(1-p, 2.0);
    for(const s of stormEntities){
      s.hMesh.scale.setScalar(Math.max(0.001, shrink));
    }
    state.stormDreadBoost = Math.max(0, 1 - p);
    if(stormT > 2.5){
      for(const s of stormEntities){
        scene.remove(s.eMesh); scene.remove(s.gMesh); scene.remove(s.hMesh);
        s.eMat.dispose(); s.gMat.dispose(); s.hMat.dispose();
      }
      stormEntities.length = 0;
      stormPhase='idle'; stormT=0;
      state.stormDreadBoost = 0;
    }
  }
}

/* obstacles/CHUNK_SIZE/DOWNTOWN_EDGE/downtownWindowSpots now live in
   world/worldData.js; stoneTex/buildingWallMat/buildingDarkMat/
   BUILDING_PALETTES/pickBuildingPalette now live in world/materials.js -
   all imported at true module top-level above. */

/* ---------- REAL BUILDINGS (walkable district, not painted backdrop) ----------
   relaySignTexture()/addRelayDressing()/relayBeacons/updateRelayBeacons(),
   the whole modular facade-grid system, and addBuilding() itself all moved
   to world/buildings.js this round - imported at true module top-level
   above. Old comment below kept for context on what generateDistrict()
   (still here, unmoved) is calling into. */

/* SAFEHOUSE INTERIOR/EXTERIOR/TRANSITION — moved to world/safehouse.js this
   round (buildSafehouse, buildSafehouseExterior, updateSafehouseInterior,
   plus NOTEBOOK_POS/LOCKED_DOOR_POS/BED_TABLE_POS/SAFEHOUSE_DOOR_YAW) —
   imported at true module top level above. The teleport-pair transition
   itself has since moved on again, to the generic systems/doors.js engine
   (Phase 3) - see that file's header. */


/* streetTex/streetMat/addStreetRibbon() and the rubble/puddle clutter
   system (RUBBLE_COUNT/placeRubble/placePuddle/scatterClutter/
   scatterChunkClutter) moved to world/props.js this round - imported at
   true module top-level above. downtownWindowSpots moved to
   world/worldData.js for the same reason. */

const downtownBuildings = []; // {group,x,z} - toggled invisible past DOWNTOWN_CULL_DIST each frame

/* ---------- MINIMAP LAYOUT DATA ----------
   minimapBuildings/minimapChunkBuildingMap/downtownStreetRibbons/
   activeMinimapBuildings and the three functions that only touch them
   now live in world/worldData.js — imported above. */

function generateDistrict(){
  // was 7 streets / one row of buildings hugging each one - the wide wedges
  // of totally empty ground between radial streets (worse the further out
  // you go, since the streets are only radiating from one center) were the
  // main source of "vast open space". More streets narrows those wedges,
  // and a second back-row of buildings per street position fills what's
  // left of them instead of leaving bare ground behind the first row.
  const streetCount = 9;
  // Keep a clear ring around the player's spawn point - this scatter uses
  // plain (unseeded) Math.random(), so without this check a building could
  // occasionally land right on top of the spawn and trap the player inside
  // its collision box the moment the game starts.
  const SPAWN_CLEAR_RADIUS = 10;
  function tooCloseToSpawn(x,z,halfW,halfD){
    const margin = Math.max(halfW,halfD) + SPAWN_CLEAR_RADIUS;
    return Math.hypot(x-state.playerX, z-state.playerZ) < margin;
  }
  // buildings on different radial streets were never checked against each
  // other - near the shared center, adjacent streets are angularly close
  // (streetCount=9 means ~40deg apart) and their near-center buildings
  // could land right on top of one another with nothing preventing it.
  // minimapBuildings is the running list this function already appends
  // every placed building to, so checking against it before each new one
  // naturally covers buildings from streets already processed this call too.
  function overlapsExisting(x,z,halfW,halfD){
    const hw = halfW+1.2, hd = halfD+1.2;
    return minimapBuildings.some(f => Math.abs(x-f.x) < hw+f.hw && Math.abs(z-f.z) < hd+f.hd);
  }
  for(let s=0; s<streetCount; s++){
    const ang = (s/streetCount)*Math.PI*2 + Math.random()*0.25;
    downtownStreetRibbons.push({ ang, r0:10, r1:182, hw:6.2 });
    const dirX = Math.cos(ang), dirZ = Math.sin(ang);
    const perpX = -dirZ, perpZ = dirX;
    addStreetRibbon(ang, 10, 182, 6.2);
    let dist = 12;
    while(dist < 178){
      const gap = 6.5 + Math.random()*5.5;
      dist += gap;
      const jitter = (Math.random()-0.5)*6;
      const cx = dirX*dist + perpX*jitter;
      const cz = dirZ*dist + perpZ*jitter;
      const side = 3.5 + Math.random()*2.5;
      for(const s2 of [-1,1]){
        if(Math.random()<0.15) continue;
        const w = 6+Math.random()*7, d = 6+Math.random()*7;
        const h = 5+Math.random()*22;
        const bx = cx + perpX*side*s2*2.1 + dirX*(Math.random()-0.5)*2;
        const bz = cz + perpZ*side*s2*2.1 + dirZ*(Math.random()-0.5)*2;
        if(tooCloseToSpawn(bx,bz,w/2,d/2)) continue;
        if(overlapsExisting(bx,bz,w/2,d/2)) continue;
        const h1 = addBuilding(bx, bz, w, d, h, { spots: downtownWindowSpots });
        downtownBuildings.push({ group:h1.group, x:bx, z:bz });
        minimapBuildings.push({ x:bx, z:bz, hw:w/2, hd:d/2, h, type: h1.isRelay ? 'relay' : 'building' });

        if(Math.random()<0.4){
          const backSide = side + 5 + Math.random()*4;
          const w2 = 6+Math.random()*7, d2 = 6+Math.random()*7, h2 = 4+Math.random()*16;
          const bx2 = cx + perpX*backSide*s2*2.1 + dirX*(Math.random()-0.5)*4;
          const bz2 = cz + perpZ*backSide*s2*2.1 + dirZ*(Math.random()-0.5)*4;
          if(tooCloseToSpawn(bx2,bz2,w2/2,d2/2)) continue;
          if(overlapsExisting(bx2,bz2,w2/2,d2/2)) continue;
          const h2handle = addBuilding(bx2, bz2, w2, d2, h2, { spots: downtownWindowSpots });
          downtownBuildings.push({ group:h2handle.group, x:bx2, z:bz2 });
          minimapBuildings.push({ x:bx2, z:bz2, hw:w2/2, hd:d2/2, h:h2, type: h2handle.isRelay ? 'relay' : 'building' });
        }
      }
    }
  }
}
generateDistrict();
buildSafehouse();
buildSafehouseExterior();
rebuildActiveWindowSpots();
// downtown buildings are permanent, non-instanced (each is ~10 separate
// meshes - walls, base, door, pilasters, cornice, roof detail - with its
// own cloned+patched material) and were being drawn every single frame
// regardless of how far the player had wandered. Past ~240 units the fog
// (density 0.0095) already hides them almost completely, so hiding the
// whole group past that distance costs nothing visible and skips a large
// chunk of draw calls whenever you're elsewhere in downtown or out in the
// chunk-streamed area / forest. Only re-evaluated when the player has
// moved far enough to matter, not every single frame.
const DOWNTOWN_CULL_DIST = 240;
let lastCullX = Infinity, lastCullZ = Infinity;
function updateDowntownVisibility(){
  const dx = state.playerX-lastCullX, dz = state.playerZ-lastCullZ;
  if(dx*dx+dz*dz < 400) return; // only recheck once the player has moved >20 units
  lastCullX = state.playerX; lastCullZ = state.playerZ;
  for(const b of downtownBuildings){
    const ddx = b.x-state.playerX, ddz = b.z-state.playerZ;
    b.group.visible = (ddx*ddx+ddz*ddz) < DOWNTOWN_CULL_DIST*DOWNTOWN_CULL_DIST;
  }
}
// permanent downtown clutter scatter - wider inner radius (4, was 10) so
// debris/puddles reach right up near spawn instead of leaving a clean ring
// around the player before anything starts appearing.
scatterClutter(RUBBLE_COUNT, false, 4, 205);
scatterClutter(PUDDLE_COUNT, true, 4, 205);
updateFacadePoolCounts();

/* ---------- THE WINDOW FIGURE ----------
   Forty seconds in, something starts using the lit windows. A glitched,
   humanoid shape stands in one, facing out. Get close enough and it hums -
   a low, wrong, mechanical tone that gets louder as you approach - and if
   you get right up on it, it erupts into violent static, shoves you back,
   and is simply gone. It'll be standing in a different window somewhere
   else a while later. One figure "exists" at a time; it just isn't ever
   where you last saw it. */
const FIGURE_START_TIME = 40;
const FIGURE_HUM_RANGE = 15;
const FIGURE_PUSH_RANGE = 3.2;

function figureTexture(){
  const w=256,h=384,c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  // a plain, faceless humanoid silhouette - broad enough to read instantly
  // against a lit window from across a street
  ctx.fillStyle='#050405';
  ctx.beginPath();
  ctx.ellipse(w/2, h*0.16, w*0.13, h*0.11, 0, 0, Math.PI*2); // head
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.32, h*0.28);
  ctx.quadraticCurveTo(w*0.5, h*0.24, w*0.68, h*0.28); // shoulders
  ctx.lineTo(w*0.62, h*0.78);
  ctx.quadraticCurveTo(w*0.5, h*0.82, w*0.38, h*0.78);
  ctx.closePath();
  ctx.fill();
  // legs
  ctx.fillRect(w*0.40, h*0.76, w*0.09, h*0.2);
  ctx.fillRect(w*0.51, h*0.76, w*0.09, h*0.2);
  // corrupted scanline slices cut out of the silhouette so it reads as
  // glitched even in a single static frame, before any shader animation
  ctx.globalCompositeOperation='destination-out';
  for(let i=0;i<14;i++){
    const y = Math.random()*h, sliceH = 1+Math.random()*5, xOff=(Math.random()-0.5)*30;
    ctx.fillRect(xOff, y, w, sliceH);
  }
  return new THREE.CanvasTexture(c);
}
const figureMaterial = new THREE.ShaderMaterial({
  uniforms:{ uMap:{value:figureTexture()}, uOpacity:{value:0}, uTime:{value:0}, uGlitch:{value:0.15} },
  transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false,
  vertexShader:`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader:`
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uMap;
    uniform float uOpacity;
    uniform float uTime;
    uniform float uGlitch;
    float hash(float n){ return fract(sin(n*127.1)*43758.5453); }
    void main(){
      // per-row horizontal tear - each scanline samples from a slightly
      // (or, with uGlitch, wildly) offset x, the classic corrupted-signal look
      float row = floor(vUv.y*90.0);
      float tear = (hash(row + floor(uTime*9.0)) - 0.5) * uGlitch * 0.5;
      vec2 uv = vec2(clamp(vUv.x + tear, 0.0, 1.0), vUv.y);

      // RGB channel split, widening with uGlitch
      float split = 0.006 + uGlitch*0.02;
      float r = texture2D(uMap, uv + vec2(split,0.0)).a;
      float g = texture2D(uMap, uv).a;
      float b = texture2D(uMap, uv - vec2(split,0.0)).a;
      vec3 col = vec3(r*0.9, g*0.95, b);

      // flicker - alpha itself stutters, more so with uGlitch
      float flicker = 0.75 + 0.25*sin(uTime*40.0) * step(0.5, hash(floor(uTime*14.0)));
      float a = max(r,max(g,b)) * uOpacity * mix(1.0, flicker, uGlitch);
      gl_FragColor = vec4(col, a);
    }
  `
});
const figureMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.5), figureMaterial);
figureMesh.visible = false;
scene.add(figureMesh);

const figureState = {
  phase: 'hidden',   // hidden -> idle -> humming -> burst -> vanish -> (cooldown, back to hidden)
  spot: null,
  timer: 4 + Math.random()*10,   // time until first possible spawn after FIGURE_START_TIME
  humGain: null, humOsc: null, humFilt: null,
  wasNear: false
};

function ensureHumNodes(){
  const audioCtx = getAudioCtx(), masterGain = getMasterGain();
  if(figureState.humGain || !audioCtx) return;
  const osc = audioCtx.createOscillator(); osc.type='sawtooth'; osc.frequency.value=64;
  const osc2 = audioCtx.createOscillator(); osc2.type='sine'; osc2.frequency.value=64.6; // slow beat against osc for a "wrong machine" hum
  const filt = audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=220;
  const g = audioCtx.createGain(); g.gain.value=0;
  osc.connect(filt); osc2.connect(filt); filt.connect(g); g.connect(masterGain);
  osc.start(); osc2.start();
  figureState.humOsc = osc; figureState.humOsc2 = osc2; figureState.humFilt = filt; figureState.humGain = g;
}
function setHumVolume(v){
  const audioCtx = getAudioCtx();
  if(!figureState.humGain || !audioCtx) return;
  figureState.humGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.08);
}
function playFigureStatic(){
  const audioCtx = getAudioCtx(), masterGain = getMasterGain();
  if(!audioCtx) return;
  const t = audioCtx.currentTime, dur = 0.6;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate*dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const filt = audioCtx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value=1800; filt.Q.value=0.5;
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(0.55, t+0.02);
  g.gain.setValueAtTime(0.55, t+0.35);
  g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  src.connect(filt); filt.connect(g); g.connect(masterGain);
  src.start(t); src.stop(t+dur+0.05);
  // a hard low thud under the static sells the "shove"
  const thump = audioCtx.createOscillator(); thump.type='square'; thump.frequency.value=48;
  const thumpGain = audioCtx.createGain(); thumpGain.gain.setValueAtTime(0.35,t);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, t+0.22);
  thump.connect(thumpGain); thumpGain.connect(masterGain);
  thump.start(t); thump.stop(t+0.25);
}

function updateWindowFigure(dt){
  if(state.elapsed < FIGURE_START_TIME) return;
  const fp = figureState;

  if(fp.phase==='hidden'){
    fp.timer -= dt;
    if(fp.timer<=0 && activeWindowSpots.length){
      fp.spot = activeWindowSpots[Math.floor(Math.random()*activeWindowSpots.length)];
      figureMesh.position.set(fp.spot.x, fp.spot.y - 0.5, fp.spot.z);
      const ang = Math.atan2(fp.spot.nx, fp.spot.nz);
      figureMesh.rotation.set(0, ang, 0);
      figureMesh.visible = true;
      figureMaterial.uniforms.uOpacity.value = 0;
      fp.phase = 'idle';
      fp.wasNear = false;
    }
    return;
  }
  if(!fp.spot) return;

  const dist = Math.hypot(state.playerX-fp.spot.x, state.playerZ-fp.spot.z);
  figureMaterial.uniforms.uTime.value = skyClock;

  if(fp.phase==='idle' || fp.phase==='humming'){
    // fades in over its first second rather than popping fully solid
    figureMaterial.uniforms.uOpacity.value = Math.min(1, figureMaterial.uniforms.uOpacity.value + dt*1.5);
    const near = dist < FIGURE_HUM_RANGE;
    if(near){
      ensureHumNodes();
      const proximity = 1 - THREE.MathUtils.clamp(dist/FIGURE_HUM_RANGE, 0, 1);
      setHumVolume(proximity*0.22);
      figureMaterial.uniforms.uGlitch.value = 0.15 + proximity*0.55;
      fp.phase = 'humming';
      if(dist < FIGURE_PUSH_RANGE){
        // it noticed you - violent burst, shove, gone
        fp.phase = 'burst';
        fp.timer = 0;
        playFigureStatic();
        setHumVolume(0);
        const pdx = state.playerX-fp.spot.x, pdz = state.playerZ-fp.spot.z;
        const pd = Math.max(0.001, Math.hypot(pdx,pdz));
        const PUSH_FORCE = 14;
        state.knockback.x += (pdx/pd)*PUSH_FORCE;
        state.knockback.z += (pdz/pd)*PUSH_FORCE;
        state.stormDreadBoost = Math.max(state.stormDreadBoost, 0.5); // a jolt of dread, decays same as the eye-storm boost
      }
    } else if(fp.phase==='humming'){
      setHumVolume(0);
      figureMaterial.uniforms.uGlitch.value = 0.15;
      fp.phase = 'idle';
    }
  } else if(fp.phase==='burst'){
    // hard glitch-out flash for a few frames, then vanish
    fp.timer += dt;
    figureMaterial.uniforms.uGlitch.value = 1.0;
    figureMaterial.uniforms.uOpacity.value = Math.random()<0.5 ? 1 : 0.2;
    if(fp.timer > 0.35){
      fp.phase = 'hidden';
      figureMesh.visible = false;
      fp.spot = null;
      setHumVolume(0);
      figureMaterial.uniforms.uGlitch.value = 0.15;
      // reappears somewhere else after a stretch, not immediately
      fp.timer = 12 + Math.random()*20;
    }
  }
}

{
  const ruinCount = 85;
  for(let i=0;i<ruinCount;i++){
    const ang = Math.random()*Math.PI*2, r = 8+Math.random()*205;
    const x=Math.cos(ang)*r, z=Math.sin(ang)*r;
    addRuin(x,z, Math.floor(Math.random()*3));
  }
  const lampCount = 38;
  for(let i=0;i<lampCount;i++){
    const ang = (i/lampCount)*Math.PI*2 + Math.random()*0.4;
    const r = 8+Math.random()*195;
    addLamp(Math.cos(ang)*r, Math.sin(ang)*r);
  }
}

/* ---------- INFINITE CHUNK STREAMING ----------
   The hand-authored downtown above only covers a ~200-unit-radius disc
   around the origin. Beyond that, the world now streams procedurally in a
   grid of chunks around the player forever: new chunks generate as you
   approach, distant ones unload (and hand their facade/instance slots back
   to the shared pools' free-lists so the pools never actually run out no
   matter how far you walk). Ground and sky already recenter on the player
   (see the skirt/cloud recenter above), so there's no visible edge either.

   CHUNK_SIZE/DOWNTOWN_EDGE now live in world/worldData.js (imported at
   true module top-level above, since main.js's exit-road code just below
   still needs DOWNTOWN_EDGE directly). LOAD_RADIUS_CHUNKS/
   UNLOAD_RADIUS_CHUNKS/activeChunks/mulberry32()/chunkKey()/
   isOnExitRoad()/loadChunk()/unloadChunk()/updateWorldStream() all moved
   to world/streaming.js this round — imported at true module top-level
   above (UNLOAD_RADIUS_CHUNKS is still read directly below, for the
   facade-culling-sphere radius calc). */

/* ---------- THE EXIT ROAD ----------
   One deliberate paved road, wider than the ordinary downtown streets, that
   runs straight out from the middle of the city, through downtown, past its
   edge, and into a forest beyond. Real curbs along both edges, a couple of
   street lamps for continuity, and two working traffic lights (colors
   actually cycle) - one at a downtown crossing, one marking the edge of the
   city right before the trees start. */
/* EXIT_ROAD_ANGLE/HALFWIDTH/START/END and exitRoadDirX/Z, exitRoadPerpX/Z
   now live in world/worldData.js — imported above. */

addStreetRibbon(EXIT_ROAD_ANGLE, EXIT_ROAD_START, EXIT_ROAD_END, EXIT_ROAD_HALFWIDTH);

// raised curb strips along both edges, following the same straight line -
// what actually sells "paved road" versus "another gray ribbon"
{
  const curbMat = buildingDarkMat;
  const curbLen = EXIT_ROAD_END - EXIT_ROAD_START;
  const curbMidDist = EXIT_ROAD_START + curbLen/2;
  for(const side of [-1,1]){
    const cx = exitRoadDirX*curbMidDist + exitRoadPerpX*EXIT_ROAD_HALFWIDTH*side;
    const cz = exitRoadDirZ*curbMidDist + exitRoadPerpZ*EXIT_ROAD_HALFWIDTH*side;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, curbLen), curbMat);
    curb.position.set(cx, groundHeightAt(cx,cz)+0.11, cz);
    curb.rotation.y = -EXIT_ROAD_ANGLE;
    scene.add(curb);
  }
}

// a handful of lamps down the road so it reads as a maintained route, not
// just a strip of asphalt dropped into the terrain
for(let d = 20; d < EXIT_ROAD_END; d += 26 + Math.random()*10){
  const side = Math.random()<0.5 ? -1 : 1;
  const lx = exitRoadDirX*d + exitRoadPerpX*(EXIT_ROAD_HALFWIDTH+1.4)*side;
  const lz = exitRoadDirZ*d + exitRoadPerpZ*(EXIT_ROAD_HALFWIDTH+1.4)*side;
  addLamp(lx, lz);
}

/* ---------- TRAFFIC LIGHTS (functioning - colors actually cycle) ---------- */
const trafficLights = [];
function addTrafficLight(dist, faceBackToCity){
  const x = exitRoadDirX*dist + exitRoadPerpX*(EXIT_ROAD_HALFWIDTH+0.6);
  const z = exitRoadDirZ*dist + exitRoadPerpZ*(EXIT_ROAD_HALFWIDTH+0.6);
  const y = groundHeightAt(x,z);
  const group = new THREE.Group();
  group.position.set(x,y,z);
  group.rotation.y = EXIT_ROAD_ANGLE + (faceBackToCity ? Math.PI : 0);
  scene.add(group);

  const poleMat = buildingDarkMat;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.15,4.6,8), poleMat);
  pole.position.y = 2.3;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.12,0.12), poleMat);
  arm.position.set(-1.1, 4.5, 0);
  group.add(arm);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5,1.3,0.5), poleMat);
  housing.position.set(-2.15, 4.05, 0);
  group.add(housing);

  const dim = { r:0x400a0a, y:0x3a3308, g:0x0a3016 };
  const bright = { r:0xff2a2a, y:0xf5c526, g:0x2dff70 };
  const redMat = new THREE.MeshBasicMaterial({ color:dim.r, fog:false });
  const yelMat = new THREE.MeshBasicMaterial({ color:dim.y, fog:false });
  const grnMat = new THREE.MeshBasicMaterial({ color:dim.g, fog:false });
  const bulbGeo = new THREE.CircleGeometry(0.16, 12);
  const redBulb = new THREE.Mesh(bulbGeo, redMat); redBulb.position.set(-2.15,4.45,0.26); group.add(redBulb);
  const yelBulb = new THREE.Mesh(bulbGeo, yelMat); yelBulb.position.set(-2.15,4.05,0.26); group.add(yelBulb);
  const grnBulb = new THREE.Mesh(bulbGeo, grnMat); grnBulb.position.set(-2.15,3.65,0.26); group.add(grnBulb);

  trafficLights.push({ redMat, yelMat, grnMat, dim, bright, state:0, timer: Math.random()*3 });
}
// one where it crosses a downtown intersection, one marking the edge of
// the city right before the road runs on into the trees
addTrafficLight(58, true);
addTrafficLight(DOWNTOWN_EDGE - 3, true);

function updateTrafficLights(dt){
  const HOLD = [4.0, 3.0, 1.0]; // seconds to hold: red, green, yellow
  for(const tl of trafficLights){
    tl.timer -= dt;
    if(tl.timer<=0){
      tl.state = (tl.state+1)%3;
      tl.timer = HOLD[tl.state];
    }
    tl.redMat.color.setHex(tl.state===0 ? tl.bright.r : tl.dim.r);
    tl.grnMat.color.setHex(tl.state===1 ? tl.bright.g : tl.dim.g);
    tl.yelMat.color.setHex(tl.state===2 ? tl.bright.y : tl.dim.y);
  }
}

/* ---------- THE FOREST ----------
   Where the exit road runs out past the city, instanced trees (cheap - two
   draw calls for the whole forest) fill in a band flanking the road, left
   clear right along the asphalt so the road stays walkable. */
const FOREST_COUNT = 420;
const treeTrunkGeo = new THREE.CylinderGeometry(0.16,0.26,3.0,6);
const treeTrunkMat = new THREE.MeshToonMaterial({ color:0x171009, gradientMap:toonRamp });
patchFogToDistance(treeTrunkMat);
const treeTrunkMesh = new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, FOREST_COUNT);
treeTrunkGeo.computeBoundingSphere();
scene.add(treeTrunkMesh);

const treeFoliageGeo = new THREE.ConeGeometry(1.5,3.4,7);
const treeFoliageMat = new THREE.MeshToonMaterial({ color:0x0a140c, gradientMap:toonRamp });
patchFogToDistance(treeFoliageMat);
const treeFoliageMesh = new THREE.InstancedMesh(treeFoliageGeo, treeFoliageMat, FOREST_COUNT);
treeFoliageGeo.computeBoundingSphere();
scene.add(treeFoliageMesh);

let forestPlaced = 0;
function scatterForest(){
  const dummy = new THREE.Object3D();
  let placed = 0, attempts = 0;
  while(placed < FOREST_COUNT && attempts < FOREST_COUNT*5){
    attempts++;
    const dist = DOWNTOWN_EDGE + 15 + Math.random()*(EXIT_ROAD_END - DOWNTOWN_EDGE - 25);
    const across = (Math.random()-0.5)*170; // forest band either side of the road
    if(Math.abs(across) < EXIT_ROAD_HALFWIDTH + 2.5) continue; // keep the road clear
    const x = exitRoadDirX*dist + exitRoadPerpX*across;
    const z = exitRoadDirZ*dist + exitRoadPerpZ*across;
    const y = groundHeightAt(x,z);
    const s = 0.8 + Math.random()*1.1;
    dummy.position.set(x,y,z);
    dummy.scale.set(s, s*(0.8+Math.random()*0.6), s);
    dummy.rotation.y = Math.random()*Math.PI*2;
    dummy.updateMatrix();
    treeTrunkMesh.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + 2.35*dummy.scale.y;
    dummy.updateMatrix();
    treeFoliageMesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  treeTrunkMesh.count = placed; treeFoliageMesh.count = placed;
  treeTrunkMesh.instanceMatrix.needsUpdate = true;
  treeFoliageMesh.instanceMatrix.needsUpdate = true;
  forestPlaced = placed;
}
scatterForest();

/* ---------- DISTANT LANDMARK: the Spire ---------- */
// A vast broken tower far beyond the walkable radius, piercing toward the
// crack in the sky. Visible from almost anywhere as a wayfinding anchor
// and a sense that the world is much bigger than what's fenced off.
let spireBeacon;
{
  const ang = Math.PI*0.62;
  const dist = 340;
  const sx = Math.cos(ang)*dist, sz = Math.sin(ang)*dist;
  const sy = groundHeightAt(sx,sz);
  const group = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ map:stoneTex, color:0x76727e, gradientMap:toonRamp });
  patchFogToDistance(mat);
  const segments = 6;
  let h = 0;
  for(let i=0;i<segments;i++){
    const segH = 22 - i*1.6;
    const rad = 7 - i*0.85;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rad*0.82, rad, segH, 8), mat);
    seg.position.y = h + segH/2;
    seg.rotation.y = i*0.4;
    group.add(seg);
    h += segH;
  }
  const beaconMat = new THREE.MeshBasicMaterial({ color:0xcf6f9e, transparent:true, opacity:0.85 });
  spireBeacon = new THREE.Mesh(new THREE.SphereGeometry(1.6,10,10), beaconMat);
  spireBeacon.position.y = h + 3;
  group.add(spireBeacon);
  const beaconLight = new THREE.PointLight(0xcf6f9e, 3, 60, 2);
  beaconLight.position.y = h + 3;
  group.add(beaconLight);
  const beaconGlow = addGlow(group, 0xcf6f9e, 9, 0.75);
  beaconGlow.position.y = h + 3;
  group.position.set(sx, sy, sz);
  scene.add(group);
  spireBeacon.userData.glow = beaconGlow;
}

/* ---------- RADIO TOWER (landmark + minimap unlock) ----------
   A single, unmissable structure planted dead center of the map: a tall
   lattice mast with cross-braces, a blinking warning light on top, and a
   PA-horn cluster partway up. Walking within range unlocks the minimap
   permanently - the character getting their bearings for the first time
   since waking up. */
export const RADIO_TOWER_POS = { x:0, z:0 };
const RADIO_TOWER_UNLOCK_RADIUS = 16;
let radioTowerBeaconMesh, radioTowerHeight;
{
  const tx = RADIO_TOWER_POS.x, tz = RADIO_TOWER_POS.z;
  const ty = groundHeightAt(tx, tz);
  const group = new THREE.Group();
  const steelMat = new THREE.MeshToonMaterial({ color:0x1c1c20, gradientMap:toonRamp });
  patchFogToDistance(steelMat);

  radioTowerHeight = 58;
  const legRadius = 3.4;
  const legGeo = new THREE.CylinderGeometry(0.22, 0.32, radioTowerHeight, 6);
  // four corner legs, tapering inward slightly toward the top like a real mast
  for(let i=0;i<4;i++){
    const ang = (Math.PI/2)*i + Math.PI/4;
    const leg = new THREE.Mesh(legGeo, steelMat);
    leg.position.set(Math.cos(ang)*legRadius*0.5, radioTowerHeight/2, Math.sin(ang)*legRadius*0.5);
    leg.rotation.z = Math.cos(ang)*0.05;
    leg.rotation.x = -Math.sin(ang)*0.05;
    group.add(leg);
  }
  // cross-brace rings at intervals - reads as a lattice tower from a distance
  const ringCount = 9;
  for(let i=0;i<ringCount;i++){
    const t = i/(ringCount-1);
    const y = t*radioTowerHeight;
    const r = legRadius*0.5*(1-t*0.55) + 0.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 4, 8), steelMat);
    ring.rotation.x = Math.PI/2;
    ring.position.y = y;
    group.add(ring);
  }
  // PA-horn cluster partway up - dark cones, part of the WNCORE relay dressing
  const hornMat = new THREE.MeshToonMaterial({ color:0x0c0c0e, gradientMap:toonRamp });
  patchFogToDistance(hornMat);
  for(let i=0;i<3;i++){
    const ang = (Math.PI*2/3)*i;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 8), hornMat);
    horn.position.set(Math.cos(ang)*1.6, radioTowerHeight*0.62, Math.sin(ang)*1.6);
    horn.rotation.z = Math.PI/2;
    horn.rotation.y = ang;
    group.add(horn);
  }
  // narrow mast above the lattice, topped with the beacon
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.2,10,6), steelMat);
  mast.position.y = radioTowerHeight + 5;
  group.add(mast);
  const beaconMat = new THREE.MeshBasicMaterial({ color:0xff3b3b, transparent:true, opacity:0.95 });
  radioTowerBeaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.55,10,10), beaconMat);
  radioTowerBeaconMesh.position.y = radioTowerHeight + 10.2;
  group.add(radioTowerBeaconMesh);
  const beaconLight = new THREE.PointLight(0xff3b3b, 2.4, 46, 2);
  beaconLight.position.y = radioTowerHeight + 10.2;
  group.add(beaconLight);
  const towerGlow = addGlow(group, 0xff3b3b, 5, 0.7);
  towerGlow.position.y = radioTowerHeight + 10.2;
  radioTowerBeaconMesh.userData.glow = towerGlow;

  group.position.set(tx, ty, tz);
  scene.add(group);
}
function updateRadioTowerBeacon(){
  if(!radioTowerBeaconMesh) return;
  const pulse = 0.55 + Math.sin(performance.now()*0.0022)*0.45;
  radioTowerBeaconMesh.material.opacity = 0.5 + pulse*0.5;
  if(radioTowerBeaconMesh.userData.glow) radioTowerBeaconMesh.userData.glow.material.opacity = 0.35 + pulse*0.4;
}
export function updateRadioTower(dt){
  updateRadioTowerBeacon();
  if(state.minimapUnlocked) return;
  const d = Math.hypot(state.playerX - RADIO_TOWER_POS.x, state.playerZ - RADIO_TOWER_POS.z);
  if(d < RADIO_TOWER_UNLOCK_RADIUS){
    if(!state.radioCollected){
      // close enough to the tower, but nothing to receive its fix with -
      // only nudge this once per approach rather than spamming it every frame
      if(!state._towerNoRadioNudged){
        state._towerNoRadioNudged = true;
        showLineBox("...this mast's still transmitting. i've got nothing to hear it with.", { hold:2000 });
      }
      return;
    }
    state.minimapUnlocked = true;
    const mm = $('minimap');
    if(mm) mm.classList.add('visible');
    showLineBox('...i can see the whole area now. small mercy.', { hold:1900 });
    // Locked-door payoff (map1 story direction, Beat 8): the door back at
    // the safehouse isn't key-locked, it's wired to Relay Seven's power
    // loop. Reaching the tower with the radio in hand is what actually
    // unlocks it - this line undersells itself on purpose (no sting, no
    // UI flourish) so it reads as easy to miss now and obvious in
    // hindsight once the door gives later.
    state.relayActive = true;
    if(!state.relayLineShown){
      state.relayLineShown = true;
      setTimeout(()=> showLineBox(relayActivationLine, { hold: 3600 }), 3400);
    }
    writeSave('checkpoint');
  } else {
    state._towerNoRadioNudged = false;
  }
}

/* ---------- LORE ITEMS ----------
   Actual objects instead of floating balls of light - a torn photograph
   pinned to a small stand, faintly lit from within rather than glowing like
   a pickup icon. Texture is procedural (a vague, degraded portrait, burned
   and torn at the edges) so it reads as "found evidence", not a game orb. */
function radioBodyTexture(){
  const size=256, c=makeCanvas(size), ctx=c.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,size,size);
  grad.addColorStop(0,'#8f7a5c');
  grad.addColorStop(0.55,'#6b5a44');
  grad.addColorStop(1,'#453a2c');
  ctx.fillStyle=grad; ctx.fillRect(0,0,size,size);
  // fine grain
  for(let i=0;i<900;i++){
    const x=Math.random()*size,y=Math.random()*size;
    ctx.fillStyle=`rgba(20,16,12,${0.04+Math.random()*0.08})`;
    ctx.fillRect(x,y,1,1);
  }
  // scuffs and edge wear
  for(let i=0;i<70;i++){
    const x=Math.random()*size,y=Math.random()*size;
    ctx.strokeStyle=`rgba(18,14,10,${0.1+Math.random()*0.2})`;
    ctx.lineWidth=0.6+Math.random()*1.4;
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x+(Math.random()-0.5)*36, y+(Math.random()-0.5)*36);
    ctx.stroke();
  }
  // corner/edge darkening - reads as handled, carried, not brand new
  const vign = ctx.createRadialGradient(size/2,size/2,size*0.25,size/2,size/2,size*0.72);
  vign.addColorStop(0,'rgba(0,0,0,0)');
  vign.addColorStop(1,'rgba(0,0,0,0.35)');
  ctx.fillStyle=vign; ctx.fillRect(0,0,size,size);
  // faint worn serial/callsign, deliberately half-illegible
  ctx.font='italic 15px monospace';
  ctx.fillStyle='rgba(18,14,10,0.4)';
  ctx.save(); ctx.translate(size*0.08,size*0.88); ctx.rotate(-0.02);
  ctx.fillText('WNC · R7', 0, 0);
  ctx.restore();
  return new THREE.CanvasTexture(c);
}
function radioGrilleTexture(){
  const size=128, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#0b0a09'; ctx.fillRect(0,0,size,size);
  for(let y=6;y<size;y+=7){
    for(let x=6;x<size;x+=7){
      const jx=(Math.random()-0.5)*1.5, jy=(Math.random()-0.5)*1.5;
      ctx.beginPath();
      ctx.arc(x+jx,y+jy,1.5+Math.random()*0.4,0,Math.PI*2);
      ctx.fillStyle=`rgba(${34+Math.random()*14},${30+Math.random()*12},${26+Math.random()*10},0.95)`;
      ctx.fill();
    }
  }
  return new THREE.CanvasTexture(c);
}
function tornPhotoTexture(seed){
  const w=128,h=160, c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  const r = mulberry32(seed*7919+13);
  // aged paper base
  ctx.fillStyle = `rgb(${28+r()*10|0},${24+r()*8|0},${22+r()*8|0})`;
  ctx.fillRect(0,0,w,h);
  // vague silhouette/figure smear - never a clear face, just a suggestion of one
  const cx=w*0.5, cy=h*0.42;
  const g = ctx.createRadialGradient(cx,cy,4,cx,cy,w*0.42);
  g.addColorStop(0,'rgba(70,58,52,0.9)');
  g.addColorStop(0.55,'rgba(30,24,22,0.7)');
  g.addColorStop(1,'rgba(10,8,8,0)');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(cx,cy,w*0.3,h*0.32,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx,cy+h*0.32,w*0.4,h*0.28,0,0,Math.PI*2); ctx.fill();
  // scratches/emulsion damage
  ctx.strokeStyle='rgba(0,0,0,0.35)';
  for(let i=0;i<14;i++){
    ctx.lineWidth = 0.5+r()*1.2;
    ctx.beginPath();
    const sx=r()*w, sy=r()*h;
    ctx.moveTo(sx,sy); ctx.lineTo(sx+(r()-0.5)*30, sy+(r()-0.5)*40);
    ctx.stroke();
  }
  // burned/torn dark border
  ctx.strokeStyle='rgba(5,3,3,0.9)'; ctx.lineWidth=6;
  ctx.strokeRect(3,3,w-6,h-6);
  return new THREE.CanvasTexture(c);
}
// ---------- LORE ORB PLACEMENT (MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md §1/§2) ----------
// Fragment placement is no longer a uniform random ring - it follows the
// three-cluster beat structure: A near the safehouse (early downtown,
// neutral-to-old staging), B mid-downtown en route to the tower (peak
// "occupied days ago" staging density, #13/#14 lead), C in the outer
// streamed chunks (cosmic/identity scope, dread-gated per §3 - these are
// the parts of the map outside the relay's dampening radius). #18 is the
// gated centerpiece, invisible/uncollectable until #11 is already found.
function loreOrbTargetPos(id){
  const towerX = RADIO_TOWER_POS.x, towerZ = RADIO_TOWER_POS.z;
  const sx = SAFEHOUSE_CENTER.x, sz = SAFEHOUSE_CENTER.z;
  if(LORE_CLUSTER_A.includes(id)){
    // Near the safehouse - a scattered ring 15-45 units out, not pointed
    // toward any one direction (this zone is a buffer, not a reveal).
    const ang = Math.random()*Math.PI*2;
    const r = 15 + Math.random()*30;
    return { x: sx + Math.cos(ang)*r, z: sz + Math.sin(ang)*r };
  }
  if(LORE_CLUSTER_B.includes(id)){
    // Mid-downtown, en route to the tower: interpolate along the
    // safehouse->tower line at 30-75% of the way, with lateral scatter so
    // it doesn't read as a single obvious corridor.
    const t = 0.3 + Math.random()*0.45;
    const bx = sx + (towerX-sx)*t, bz = sz + (towerZ-sz)*t;
    const dirX = towerX-sx, dirZ = towerZ-sz;
    const len = Math.hypot(dirX,dirZ) || 1;
    const perpX = -dirZ/len, perpZ = dirX/len;
    const lateral = (Math.random()-0.5)*40;
    return { x: bx + perpX*lateral, z: bz + perpZ*lateral };
  }
  // Cluster C / centerpiece - outer streamed chunks, past the hand-authored
  // downtown/relay-dampening radius. Full ring around the tower, well
  // beyond DOWNTOWN_EDGE, so it reads as the map's legible edge rather
  // than colliding with downtown proper.
  const ang = Math.random()*Math.PI*2;
  const r = 220 + Math.random()*160;
  return { x: towerX + Math.cos(ang)*r, z: towerZ + Math.sin(ang)*r };
}
export const orbMeshes = [];
{
  const cardGeo = new THREE.PlaneGeometry(0.42, 0.52);
  for(let i=0;i<LORE.length;i++){
    const { x, z } = loreOrbTargetPos(i);
    const y = groundHeightAt(x,z) + 0.55;
    const group = new THREE.Group();
    group.position.set(x,y,z);
    group.rotation.y = Math.random()*Math.PI*2;
    group.rotation.z = (Math.random()-0.5)*0.25;

    const tex = tornPhotoTexture(i+1);
    const cardMat = new THREE.MeshStandardMaterial({ map:tex, roughness:0.9, metalness:0, transparent:true, side:THREE.DoubleSide, emissive:0x2a1a1e, emissiveIntensity:0.35 });
    const card = new THREE.Mesh(cardGeo, cardMat);
    card.position.y = 0.02;
    group.add(card);

    // small stand it's propped against so it reads as sitting in the world
    const standMat = new THREE.MeshToonMaterial({ color:0x14100f, gradientMap:toonRamp });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.04,0.12), standMat);
    stand.position.y = -0.24;
    group.add(stand);

    const glow = new THREE.PointLight(0xcf6f9e, 0.55, 3.2, 2);
    glow.position.y = 0.05;
    group.add(glow);
    const glowSpr = addGlow(group, 0xcf6f9e, 0.9, 0.55);
    glowSpr.position.y = 0.05;
    scene.add(group);
    // Cluster C fragments and the #18 centerpiece are gated (dread-
    // threshold / #11-already-found respectively, per §1 Beat 7/Beat 5
    // guardrails) - start hidden, updateOrbs() below reveals them once
    // their condition is met. Cluster A/B are ungated, visible from spawn.
    const gated = LORE_CLUSTER_C.includes(i) || i === LORE_CENTERPIECE;
    if(gated) group.visible = false;
    orbMeshes.push({ id:i, mesh:group, glowSpr, baseY:y, collected:false, gated, revealed:!gated });
  }
}

/* ---------- ANSWERING MACHINE ----------
   MAP1_TONE_INFLUENCES.md's 999 device: diegetic, audio-only-styled found
   evidence sitting physically close to fragment #14 ("The Choir") so the
   player connects the two without being told to (§1 Beat 5). A small
   desk unit with a slow-blinking message light; interacting cycles
   through answeringMachineLines in order, ending on the choir-bleed line
   and then looping back to silence rather than repeating the mundane
   messages once they've been heard. */
const ANSWERING_MACHINE_POS = (() => {
  const frag14 = orbMeshes.find(o => o.id === 14);
  const base = frag14 ? frag14.mesh.position : { x: 0, z: 0 };
  return { x: base.x + 2.2, z: base.z + 1.4 };
})();
let answeringMachineMesh = null;
{
  const amx = ANSWERING_MACHINE_POS.x, amz = ANSWERING_MACHINE_POS.z;
  const amy = groundHeightAt(amx, amz);
  const group = new THREE.Group();
  group.position.set(amx, amy, amz);
  const bodyMat = new THREE.MeshToonMaterial({ color:0x2b2620, gradientMap:toonRamp });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.24), bodyMat);
  body.position.y = 0.7;
  group.add(body);
  const lightMat = new THREE.MeshStandardMaterial({ color:0x1a0505, emissive:0x8a1414, emissiveIntensity:0.6 });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), lightMat);
  light.position.set(0.12, 0.765, 0.09);
  group.add(light);
  scene.add(group);
  answeringMachineMesh = { group, lightMesh: light, lightMat };
}
let answeringMachineIndex = 0;
function playAnsweringMachine(){
  const line = answeringMachineLines[Math.min(answeringMachineIndex, answeringMachineLines.length-1)];
  playFigureStatic(); // reuse the existing "wrong signal" static texture
  showLineBox(line, { hold: 3600 });
  if(answeringMachineIndex < answeringMachineLines.length-1) answeringMachineIndex++;
}

/* ---------- RADIO PICKUP ----------
   The player wakes up with nothing - no way to hear the WNCORE broadcasts,
   no way to unlock the minimap once they reach the tower. This sits a few
   meters from the spawn point so it's the very first thing worth noticing,
   but it's still a choice: walk past it and the world gets worse faster,
   and the tower alone won't be enough. */
export let radioPickupMesh, radioPickupLight;
// mutable, not baked in at parse time - repositioned right in front of the
// player at wake-up (see state.started=true below), because state.yaw
// isn't set to the actual look direction until then. A radio spawned at a
// parse-time-only angle could easily land behind the player and never be
// seen.
export const RADIO_PICKUP_POS = { x: state.playerX + 4, z: state.playerZ };
// floats at roughly eye/chest height - sidesteps ground-anchoring entirely
// (no more risk of the body sinking into local terrain noise) and doubles
// as a small diegetic hook: the player can react to it hanging there
// instead of it just being an inert prop.
export const RADIO_FLOAT_HEIGHT = 1.25;
{
  const S = 1.15; // smaller than the last pass - it read as oversized up close
  const group = new THREE.Group();
  // lighter, warmer body than the near-black ground clutter around it -
  // it needs to read as a found object, not a shadow. Emissive (not just
  // lit by scene lights) because ambient is intentionally very low this
  // early in the game - a non-emissive object here can be nearly invisible
  // regardless of its base color.
  const bodyMat = new THREE.MeshToonMaterial({ color:0xffffff, map:radioBodyTexture(), gradientMap:toonRamp, emissive:0x2a1e10, emissiveIntensity:0.35 });
  const trimMat = new THREE.MeshToonMaterial({ color:0x8f8578, gradientMap:toonRamp, emissive:0x4a4038, emissiveIntensity:0.5 });
  const darkMat = new THREE.MeshToonMaterial({ color:0xffffff, map:radioGrilleTexture(), gradientMap:toonRamp });
  const bodyH = 0.22*S;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34*S,bodyH,0.12*S), bodyMat);
  group.add(body);
  // thin raised trim strip along the top edge - breaks up the flat box
  // silhouette and gives it an actual seam, like a lid or a handle mount
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.34*S*1.01,0.012*S,0.12*S*1.01), trimMat);
  seam.position.y = bodyH*0.5;
  group.add(seam);
  // small carry handle - loops over the top, unused right now (the thing
  // is floating, not hanging from it), which is exactly the detail meant
  // to make it feel wrong rather than just decorative
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09*S, 0.012*S, 6, 12, Math.PI), trimMat);
  handle.rotation.z = Math.PI;
  handle.position.set(0, bodyH*0.5 + 0.07*S, 0);
  group.add(handle);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.045*S,0.045*S,0.03*S,10), trimMat);
  dial.rotation.x = Math.PI/2;
  dial.position.set(0.09*S, -bodyH*0.1, 0.075*S);
  group.add(dial);
  // second, smaller knob - one dial reads as a placeholder, two reads as
  // a tuning dial + volume knob, an actual control layout
  const knob2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025*S,0.025*S,0.03*S,10), trimMat);
  knob2.rotation.x = Math.PI/2;
  knob2.position.set(0.155*S, -bodyH*0.1, 0.075*S);
  group.add(knob2);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.16*S,0.14*S,0.01*S), darkMat);
  grille.position.set(-0.06*S, 0.02*S, 0.065*S);
  group.add(grille);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008*S,0.012*S,0.42*S,6), trimMat);
  antenna.position.set(0.13*S, bodyH*0.5 + 0.21*S*0.85, 0);
  antenna.rotation.z = -0.18;
  group.add(antenna);
  const lightMat = new THREE.MeshBasicMaterial({ color:0xff5a3b });
  radioPickupLight = new THREE.Mesh(new THREE.SphereGeometry(0.03*S,8,8), lightMat);
  radioPickupLight.position.set(0.12*S, bodyH*0.25, 0.075*S);
  group.add(radioPickupLight);
  // small, tight, warm - a light actually coming off a little indicator
  // bulb, not a giant diffuse orange dome swallowing the surrounding ground
  const glow = new THREE.PointLight(0xff6a45, 0.9, 2.6, 2.2);
  glow.position.copy(radioPickupLight.position);
  group.add(glow);
  addGlow(group, 0xffab7a, 0.5, 0.6).position.set(0, 0, 0);
  group.rotation.y = Math.random()*Math.PI*2;
  group.position.set(RADIO_PICKUP_POS.x, groundHeightAt(RADIO_PICKUP_POS.x, RADIO_PICKUP_POS.z) + RADIO_FLOAT_HEIGHT, RADIO_PICKUP_POS.z);
  scene.add(group);
  radioPickupMesh = group;
}
// Hands these into titleScreen.js explicitly instead of it statically
// importing them back from here - see HOTFIX #5 in titleScreen.js's file
// header for why the old circular import was the actual cause of the
// severe frame-rate-killing lag (a permanent TDZ under dev-server module
// handling, not just a rare race under plain static hosting).
// getRadioPickupMesh is a function, not the value itself, because
// radioPickupMesh is reassigned repeatedly below (collectRadio() etc.) -
// titleScreen.js needs the current value whenever it's actually read
// (at wake-up), not a stale snapshot from this line.
registerMainRefs({
  getRadioPickupMesh: () => radioPickupMesh,
  RADIO_PICKUP_POS,
  RADIO_FLOAT_HEIGHT,
  playWakeDialogue,
  stopMenuAmbience
});
let radioFloatCommented = false;
let radioFloatCooldown = 0;
function updateRadioPickup(dt){
  if(!radioPickupMesh) return;
  const t = performance.now();
  radioPickupMesh.position.y = groundHeightAt(RADIO_PICKUP_POS.x, RADIO_PICKUP_POS.z) + RADIO_FLOAT_HEIGHT + Math.sin(t*0.0013)*0.08;
  radioPickupMesh.rotation.y += dt*0.35; // slow, lazy spin - reads as "wrong" without being frantic about it
  if(radioPickupLight) radioPickupLight.material.color.setHex(Math.sin(t*0.006)>0 ? 0xff5a3b : 0x5a1a10);
  const d = Math.hypot(RADIO_PICKUP_POS.x-state.playerX, RADIO_PICKUP_POS.z-state.playerZ);
  state.nearRadio = d < 2.6;
  // the player should get to notice the wrongness once, unprompted, rather
  // than the game just expecting them not to ask. showLineBox can decline
  // (dialogue box busy, e.g. wake dialogue still running) - only latch
  // "commented" once it actually plays, and retry on a cooldown until then,
  // rather than marking it said and silently losing the line forever.
  if(!radioFloatCommented && d < 7){
    radioFloatCooldown -= dt;
    if(radioFloatCooldown <= 0){
      radioFloatCooldown = 1.5;
      showLineBox("...why is that just... hanging there.", { hold:1900 }).then(ok=>{
        if(ok) radioFloatCommented = true;
      });
    }
  }
}
function collectRadio(){
  if(state.radioCollected || !radioPickupMesh) return;
  state.radioCollected = true;
  scene.remove(radioPickupMesh);
  radioPickupMesh = null;
  radioBtn.classList.remove('locked');
  state.radioOn = true; // switches itself on - one less thing to figure out mid-panic
  radioBtn.classList.add('toggled');
  resetRadioTimer(3);
  showLineBox('...a radio. still has weight to it. still might work.', { hold:1900 });
  writeSave('checkpoint');
}
/* ---------- GHUULS (the watchers) ----------
   ghuulList/createGhuul()/maybeSpawnGhuul()/updateGhuul() and the
   vision/hearing/movement helpers now live in entities/ghuuls.js —
   imported above. */

/* ---------- AUDIO ----------
   audioCtx/masterGain/heartGain/windGain/breathGain/interiorGain and
   initAudio()/playHeartbeat()/playStinger()/playThunder()/
   playFakeFootstep()/playWetFootstep()/playAnimalCall() now live in
   systems/audio.js — imported above. lastStepPhase now lives in
   entities/player.js (Wave 3 - see docs/HANDOFF.md), the only place
   that ever read or wrote it. */

/* ---------- INPUT ---------- */
let joyTouchId=null, joyStartX=0, joyStartY=0;
let lookTouchId=null, lookLastX=0, lookLastY=0;
let mouseDown=false, mouseLastX=0, mouseLastY=0, mouseSmoothX=0, mouseSmoothY=0;

function setYawPitch(dx,dy,sens){
  const s = sens * settingsSensMult; // settingsSensMult is user-adjustable (Settings panel), 1 = default
  state.yaw -= dx*s;
  state.pitch -= dy*s * (settingsInvertY ? -1 : 1); // Invert Look (Y-Axis) setting - only the vertical axis flips, matching what "invert Y" conventionally means in every other first-person game
  state.pitch = Math.max(-1.15, Math.min(1.15, state.pitch));
}

joyZone.addEventListener('touchstart', e=>{
  if(joyTouchId!==null) return;
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  joyStartX = t.clientX; joyStartY = t.clientY;
  joyBase.style.display='block';
  joyBase.style.left = (t.clientX-48)+'px';
  joyBase.style.top = (t.clientY-48)+'px';
  joyKnob.style.left='27px'; joyKnob.style.top='27px';
  e.preventDefault();
}, {passive:false});

joyZone.addEventListener('touchmove', e=>{
  for(const t of e.changedTouches){
    if(t.identifier===joyTouchId){
      let dx=t.clientX-joyStartX, dy=t.clientY-joyStartY;
      const max=48, d=Math.hypot(dx,dy);
      if(d>max){ dx=dx/d*max; dy=dy/d*max; }
      joyKnob.style.left=(27+dx)+'px'; joyKnob.style.top=(27+dy)+'px';
      state.moveJoystick.x = dx/max;
      state.moveJoystick.y = -dy/max;
    }
  }
  e.preventDefault();
}, {passive:false});

function endJoy(e){
  for(const t of e.changedTouches){
    if(t.identifier===joyTouchId){
      joyTouchId=null; joyBase.style.display='none';
      state.moveJoystick.x=0; state.moveJoystick.y=0;
    }
  }
}
joyZone.addEventListener('touchend', endJoy);
joyZone.addEventListener('touchcancel', endJoy);

lookZone.addEventListener('touchstart', e=>{
  if(lookTouchId!==null) return;
  const t = e.changedTouches[0];
  lookTouchId=t.identifier; lookLastX=t.clientX; lookLastY=t.clientY;
  lookSmoothX=0; lookSmoothY=0;
  e.preventDefault();
}, {passive:false});
lookZone.addEventListener('touchmove', e=>{
  for(const t of e.changedTouches){
    if(t.identifier===lookTouchId){
      let dx=t.clientX-lookLastX, dy=t.clientY-lookLastY;
      lookLastX=t.clientX; lookLastY=t.clientY;
      // clamp a single-sample spike (e.g. a laggy/coalesced touch event)
      dx = Math.max(-LOOK_MAX_DELTA, Math.min(LOOK_MAX_DELTA, dx));
      dy = Math.max(-LOOK_MAX_DELTA, Math.min(LOOK_MAX_DELTA, dy));
      // exponential smoothing so the camera eases rather than snaps
      lookSmoothX += (dx - lookSmoothX) * LOOK_SMOOTH;
      lookSmoothY += (dy - lookSmoothY) * LOOK_SMOOTH;
      setYawPitch(lookSmoothX, lookSmoothY, touchLookSens());
    }
  }
  e.preventDefault();
}, {passive:false});
function endLook(e){
  for(const t of e.changedTouches){ if(t.identifier===lookTouchId) lookTouchId=null; }
}
lookZone.addEventListener('touchend', endLook);
lookZone.addEventListener('touchcancel', endLook);

// tap-to-interact on look zone (short tap, minimal movement)
let lookTapStart=0, lookTapMoved=0;
lookZone.addEventListener('touchstart', e=>{ lookTapStart=Date.now(); lookTapMoved=0; }, {passive:true});
lookZone.addEventListener('touchmove', e=>{ lookTapMoved++; }, {passive:true});
lookZone.addEventListener('touchend', e=>{
  if(Date.now()-lookTapStart<220 && lookTapMoved<3) tryInteract();
}, {passive:true});

// joystick-zone/look-zone are touch-only controls, but they sit on top of
// the canvas (pointer-events:auto, covering the left/right ~half of the
// screen) so on a mouse/desktop session they were silently eating every
// mousedown that started in their area before it could ever reach the
// canvas's own mousedown listener below - drag-to-look "worked" only in
// the thin strip they didn't cover. Turn them off whenever there's no
// touch input; touch devices are unaffected since 'ontouchstart' exists.
if(!('ontouchstart' in window)){
  joyZone.style.pointerEvents = 'none';
  lookZone.style.pointerEvents = 'none';
}

// desktop mouse drag-to-look
canvas.addEventListener('mousedown', e=>{ mouseDown=true; mouseLastX=e.clientX; mouseLastY=e.clientY; mouseSmoothX=0; mouseSmoothY=0; });
window.addEventListener('mousemove', e=>{
  if(!mouseDown) return;
  let dx=e.clientX-mouseLastX, dy=e.clientY-mouseLastY;
  mouseLastX=e.clientX; mouseLastY=e.clientY;
  // same spike-clamp + exponential smoothing the touch look already had -
  // desktop mouse was applying raw, unclamped per-event deltas straight to
  // yaw/pitch, so a fast flick or a laggy/coalesced mousemove event could
  // snap the camera instantly instead of easing, which read as "horrendous"
  dx = Math.max(-LOOK_MAX_DELTA, Math.min(LOOK_MAX_DELTA, dx));
  dy = Math.max(-LOOK_MAX_DELTA, Math.min(LOOK_MAX_DELTA, dy));
  mouseSmoothX += (dx - mouseSmoothX) * LOOK_SMOOTH;
  mouseSmoothY += (dy - mouseSmoothY) * LOOK_SMOOTH;
  setYawPitch(mouseSmoothX,mouseSmoothY,LOOK_SENS_MOUSE);
});
window.addEventListener('mouseup', ()=>{ mouseDown=false; });

// keyboard
export const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='KeyE') tryInteract();
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });

interactBtn.addEventListener('touchstart', e=>{ e.preventDefault(); e.stopPropagation(); corruptPress(interactBtn); tryInteract(); }, {passive:false});
interactBtn.addEventListener('click', ()=>{ corruptPress(interactBtn); tryInteract(); });

/* ---------- LORE / UI LOGIC ---------- */
function tryInteract(){
  if(state.nearRadio && !state.radioCollected){ collectRadio(); return; }
  if(state.nearNotebook){ manualSave(); return; }
  if(state.nearLockedDoor){ tryLockedDoor(); return; }
  if(state.nearBedTable){ checkBedTable(); return; }
  if(state.nearAnsweringMachine){ playAnsweringMachine(); return; }
  if(state.nearOrbId<0) return;
  const orbData = orbMeshes.find(o=>o.id===state.nearOrbId);
  if(!orbData || orbData.collected) return;
  orbData.collected = true;
  state.collected.add(orbData.id);
  scene.remove(orbData.mesh);
  state.forgetting = Math.max(0, state.forgetting - 0.4);
  state.dread = Math.min(1, state.dread + 0.16);
  showWhisper(pickWhisperOnCollect());
  // the lore panel is gone - the memory's actual text now surfaces through
  // the same fractured dialogue voice the wake-up sequence uses, a beat
  // after the whisper so they don't collide
  const l = LORE[orbData.id];
  if(l) setTimeout(()=> showLineBox(`${l.title} — ${l.text}`, { hold: 4200 }), 1200);
  interactBtn.classList.remove('active');
  interactPrompt.classList.remove('show');
  state.nearOrbId=-1;
  maybeSpawnGhuul();
  if(state.collected.size === LORE.length) setTimeout(triggerEnding, 1600);
  writeSave();
}

function triggerMap1Closer(){
  // Not one of the four bad endings - the save/collected progress stays
  // intact. This is the door's natural resting point: the world went
  // quiet, something's on the other side, and there's nowhere further to
  // walk in THIS build. Real Map 2 content should key off
  // state.enteredMap2 rather than anything time-based, so this beat only
  // ever needs to fire once no matter how the eventual next area hooks in.
  if(state.enteredMap2) return;
  state.enteredMap2 = true;
  writeSave('checkpoint');
  const el = document.getElementById('ending-screen');
  const textEl = document.getElementById('ending-text');
  const smallEl = el ? el.querySelector('.small') : null;
  const smallOriginal = smallEl ? smallEl.textContent : null;
  if(textEl) textEl.textContent = "The door's open. Whatever's on the other side isn't part of this map yet.";
  if(smallEl) smallEl.textContent = 'end of chapter — tap to close your eyes again';
  if(el){
    el.classList.add('show');
    el.addEventListener('click', function onClose(){
      el.classList.remove('show');
      el.removeEventListener('click', onClose);
      if(smallEl && smallOriginal!==null) smallEl.textContent = smallOriginal; // this screen is shared with the real bad-ending beat - don't leave it mutated
    }, {once:true});
  }
}

function triggerEnding(){
  state.started = false;
  deleteSave();
  triggerLightning();
  setTimeout(triggerLightning, 350);
  setTimeout(()=>{
    const el = document.getElementById('ending-screen');
    document.getElementById('ending-text').textContent =
      "Every fragment was a door. You opened all of them. Something up there just finished reading you back — and it liked what it found. Welcome to the skin, S.";
    el.classList.add('show');
    el.addEventListener('click', ()=> location.reload(), {once:true});
  }, 900);
}

// collectWhispers/pickWhisperOnCollect() now live in ui/whisper.js —
// imported above.

/* ---------- LOCKED ROOM / KEY QUEST ----------
   Boarded-over door in the safehouse's locked room. Reuses
   playFigureStatic() (the window-figure's static-burst SFX) rather than
   a second noise generator - same "wrong signal" texture fits a locked
   door refusing to budge just as well as a glitching figure. First
   attempt gets the full beat (static + line + notebook update to
   "searching"); repeat attempts just re-fire the static so trying again
   doesn't feel broken, but don't re-show the line or re-flag the quest. */
function tryLockedDoor(){
  // Locked-door payoff (map1 story direction, Beats 11-12): the door was
  // never key-locked, it's wired to Relay Seven's power loop (see
  // updateRadioTower()). Once relayActive is true this branch takes over
  // permanently - deliberately no playFigureStatic() here, since silence
  // is the tell that something's different this time, without needing a
  // new sound asset. Quotes the original "you'd need a key" line back at
  // the player before giving, then closes on a radio line that inverts
  // the existing keystone ambiguity line ("...it's not us...") rather
  // than resolving it.
  if(state.relayActive){
    if(!state.doorUnlocked){
      state.doorUnlocked = true;
      showLineBox(doorApproachLine, { hold: 2600 });
      setTimeout(()=> showLineBox(doorOpenPlayerLine, { hold: 3400 }), 2800);
      setTimeout(()=> showLineBox(doorOpenRadioLine, { hold: 4200 }), 6400);
      setTimeout(()=> triggerMap1Closer(), 11200);
      writeSave('checkpoint');
    }
    return;
  }
  playFigureStatic();
  if(!state.triedLockedDoor){
    state.triedLockedDoor = true;
    state.doorKeyStatus = 'searching';
    setTimeout(()=> showLineBox("...that's not right. locked - you'd need a key for this.", { hold: 3600 }), 200);
    writeSave();
  }
}
// checking the bedside table - first real lead on the key. Only has
// something to say once the quest's actually started (i.e. after the
// door's been tried); wandering up to the nightstand before that just
// does nothing, no prompt fires at all (see the nearBedTable gating in
// updateOrbs()).
function checkBedTable(){
  if(state.doorKeyStatus === 'searching'){
    state.doorKeyStatus = 'notHere';
    showLineBox("nothing in the drawer. key's not here.", { hold: 3200 });
    writeSave();
  }
}

// radioAmbientLines/etc., bearingToCompassAngle(), pickSituationalRadioLine(),
// broadcastRadio(), updateRadio() now live in systems/radio.js — imported
// above. toggleRadio() (below) calls resetRadioTimer() instead of writing
// radioTimer directly.

// updateSanity()/updateSanityVisual() now live in systems/sanity.js —
// imported above.

// directorInputs()/evaluateDirector()/runDirectorAction()/
// flickerRandomLamp() now live in entities/director.js — imported
// above. evaluateDirector(dt, triggerLightning) takes the local
// triggerLightning() as a param since sky/weather's lighting objects
// aren't extracted yet.

// showWhisper()/whisperTimer/whisperCooldown now live in ui/whisper.js —
// imported above.

/* lore panel toggle */


/* radio toggle */
function toggleRadio(){
  if(!state.radioCollected) return; // nothing to switch on - it's still lying in the grass somewhere
  state.radioOn = !state.radioOn;
  radioBtn.classList.toggle('toggled', state.radioOn);
  if(state.radioOn){ resetRadioTimer(2); } else { radioTicker.classList.remove('show'); }
}
radioBtn.addEventListener('click', ()=>{ corruptPress(radioBtn); toggleRadio(); });
radioBtn.addEventListener('touchstart', e=>{ e.preventDefault(); e.stopPropagation(); corruptPress(radioBtn); toggleRadio(); }, {passive:false});

/* Volume now lives entirely in the Settings panel (systems/settings.js,
   Wave 3 - see docs/HANDOFF.md) - the old in-game HUD mute button/popup
   was redundant once that existed and has been removed. userVolume is
   imported above since save/load and audio init here read it. */

/* ---------- SAVE / LOAD (Regain) ----------
   A single localStorage slot, not a full save-file system - one playthrough
   at a time, matching "Regain" being a single continue button rather than
   a save list. Sensitivity/volume are a *separate* localStorage key
   (anothersky_settings, systems/settings.js) since those should survive
   "Delete Memories" - erasing your progress shouldn't also reset how
   you've tuned the controls. */
// notebook on the table - manual save, always available regardless of the
// periodic/pickup autosave triggers. Same writeSave() underneath (one save
// slot, not a separate manual-save file), just a different indicator label
// and a line in the player's own voice so it's clear something happened.
function manualSave(){
  writeSave('written');
  // Progressive story notebook (MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md §1) -
  // picks the next unlockable, not-yet-shown numbered entry each time the
  // notebook's actually used. Falls back to a "nothing new yet" line once
  // everything currently unlockable has already been written, rather than
  // repeating old text or the old always-identical placeholder line.
  const entry = pickNextNotebookEntry(state);
  if(entry){
    state.notebookEntriesShown.push(entry.id);
    showLineBox(entry.text, { hold: 4400 });
  } else {
    showLineBox(NOTEBOOK_NOTHING_NEW, { hold: 2000 });
  }
}
// restores saved progress directly into a running scene - skips the
// eyelid/wake theatrics entirely, since "regaining" isn't waking up for
// the first time
function restoreFromSave(save){
  save = migrateSave(save);
  state.playerX = save.playerX; state.playerZ = save.playerZ; state.yaw = save.yaw;
  state.dread = save.dread||0; state.sanity = save.sanity!=null?save.sanity:1;
  state.forgetting = save.forgetting||0; state.elapsed = save.elapsed||0;
  state.skyWrongness = save.skyWrongness||0;
  state.skyEventTriggered = !!save.skyEventTriggered;
  state.skyEventClock = save.skyEventClock||0;
  state.radioLog = save.radioLog||[];
  state.notebookEntriesShown = save.notebookEntriesShown||[];
  state.triedLockedDoor = !!save.triedLockedDoor;
  state.doorKeyStatus = save.doorKeyStatus||'none';
  state.relayActive = !!save.relayActive;
  state.relayLineShown = !!save.relayLineShown;
  state.returnCueShown = !!save.returnCueShown;
  state.doorUnlocked = !!save.doorUnlocked;
  state.enteredMap2 = !!save.enteredMap2;
  state.collected = new Set(save.collected||[]);
  for(const o of orbMeshes){
    if(state.collected.has(o.id) && !o.collected){ o.collected = true; scene.remove(o.mesh); }
  }
  if(save.radioCollected){
    state.radioCollected = true;
    if(radioPickupMesh){ scene.remove(radioPickupMesh); radioPickupMesh = null; }
    radioBtn.classList.remove('locked');
  }
  if(save.minimapUnlocked){
    state.minimapUnlocked = true;
    const mm = $('minimap'); if(mm) mm.classList.add('visible');
  }
  initAudio(userVolume);
  { const ac = getAudioCtx(); if(ac && ac.state==='suspended') ac.resume(); }
  // the eyelid overlay is closed by default and only opens via the
  // begin-btn anime timeline (title-screen "wake" sequence) - regaining
  // skips that timeline entirely, which left the eyelids sitting shut over
  // the whole screen forever. Same end-state the wake timeline lands on.
  const eyelidsEl = document.getElementById('eyelids');
  if(eyelidsEl) eyelidsEl.style.display = 'none';
  titleScreen.style.transition = 'opacity .4s ease';
  titleScreen.style.opacity = '0';
  setTimeout(()=>{ titleScreen.style.display='none'; }, 420);
  hud.classList.add('visible');
  state.started = true;
  setTitleScreenActive(false);
  clock.getDelta();
}

/* ---------- CREDITS ---------- */
const creditsOverlay = $('credits-overlay');
const creditsCrawlEl = $('credits-crawl');
$('menu-credits').addEventListener('click', ()=>{
  creditsOverlay.classList.add('open');
  // force the crawl to restart from the bottom every time, not just the
  // first time - removing the animating class, forcing a reflow, then
  // re-adding it is the standard way to restart a CSS animation that
  // might already be mid-run from a previous open/close cycle
  creditsCrawlEl.classList.remove('rolling');
  void creditsCrawlEl.offsetWidth;
  creditsCrawlEl.classList.add('rolling');
  startGlitchScramble();
});
$('credits-close').addEventListener('click', ()=>{
  creditsOverlay.classList.remove('open');
  creditsCrawlEl.classList.remove('rolling'); // stop consuming a frame budget while hidden
  stopGlitchScramble();
});

/* ---------- TITLE / MENU AMBIENCE ---------- */
// Calm-but-wrong bed under the main menu, plus a soft piano-ish cue when
// hovering/clicking the four menu buttons. Deliberately its own small node
// graph - not initAudio() - so it can start on the menu's own first user
// gesture (browsers won't let audio play with zero prior interaction) and
// gets torn down cleanly the moment the player actually starts or regains
// a game, instead of colliding with the real ambient mix that takes over
// from there.
// single high, tight "wrong" sting on first boot - fires once, right
// before the ambience starts fading in, so the menu doesn't just quietly
// appear but announces itself for a fraction of a second first.
function playBootSting(){
  const audioCtx = getAudioCtx();
  if(!audioCtx || state.muted) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(); osc.type='sine'; osc.frequency.setValueAtTime(1800,t);
  osc.frequency.exponentialRampToValueAtTime(2400, t+0.05);
  osc.frequency.exponentialRampToValueAtTime(1200, t+0.4);
  const detune = audioCtx.createOscillator(); detune.type='sine'; detune.frequency.value=1812;
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(userVolume*0.16, t+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.55);
  const dg = audioCtx.createGain(); dg.gain.value=0.4;
  osc.connect(g); detune.connect(dg); dg.connect(g); g.connect(audioCtx.destination);
  osc.start(t); detune.start(t); osc.stop(t+0.6); detune.stop(t+0.6);
}
let menuAmbNodes = null;
function startMenuAmbience(){
  if(menuAmbNodes || state.muted) return;
  try{
    const audioCtx = ensureAudioCtx();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    playBootSting();
    const out = audioCtx.createGain(); out.gain.value = 0;
    out.connect(audioCtx.destination);
    out.gain.linearRampToValueAtTime(userVolume*0.5, audioCtx.currentTime+2.5); // slow fade-in, not a snap-on

    // low, slow-beating drone - calm register, quieter/higher-filtered than
    // the in-game dread hum so it doesn't read as the same threat
    const d1 = audioCtx.createOscillator(); d1.type='sine'; d1.frequency.value=68;
    const d2 = audioCtx.createOscillator(); d2.type='sine'; d2.frequency.value=68.4; // slight detune -> slow beat
    const droneFilt = audioCtx.createBiquadFilter(); droneFilt.type='lowpass'; droneFilt.frequency.value=300;
    const droneGain = audioCtx.createGain(); droneGain.gain.value=0.5;
    d1.connect(droneFilt); d2.connect(droneFilt); droneFilt.connect(droneGain); droneGain.connect(out);
    d1.start(); d2.start();

    // faint filtered noise wash underneath - "room tone", not weather
    const sr = audioCtx.sampleRate, len = sr*2;
    const buf = audioCtx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for(let i=0;i<len;i++) data[i] = (Math.random()*2-1)*0.5;
    const washSrc = audioCtx.createBufferSource(); washSrc.buffer=buf; washSrc.loop=true;
    const washFilt = audioCtx.createBiquadFilter(); washFilt.type='lowpass'; washFilt.frequency.value=500;
    const washGain = audioCtx.createGain(); washGain.gain.value=0.06;
    washSrc.connect(washFilt); washFilt.connect(washGain); washGain.connect(out);
    washSrc.start();

    // rare, distant "wrong" swell - the one thing that keeps this bed from
    // reading as purely relaxing. Quiet, low, on a random interval.
    let swellTimer = null;
    function scheduleSwell(){
      swellTimer = setTimeout(()=>{
        if(!menuAmbNodes) return;
        const t = audioCtx.currentTime, dur = 3+Math.random()*2;
        const osc = audioCtx.createOscillator(); osc.type='sawtooth'; osc.frequency.value=40+Math.random()*15;
        const filt = audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=180;
        const g = audioCtx.createGain(); g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(0.09, t+dur*0.4);
        g.gain.linearRampToValueAtTime(0, t+dur);
        osc.connect(filt); filt.connect(g); g.connect(out);
        osc.start(t); osc.stop(t+dur+0.1);
        scheduleSwell();
      }, (14+Math.random()*18)*1000);
    }
    scheduleSwell();

    // sparse, slow piano motif over the drone - actual background music
    // for the menu, distinct from the one-shot hover/click tones below.
    // Long soft attack/release so notes drift in like ambient pad tones
    // rather than reading as a melody being performed at the player.
    let musicTimer = null;
    function scheduleMusicNote(){
      musicTimer = setTimeout(()=>{
        if(!menuAmbNodes) return;
        const freq = MENU_NOTES[Math.floor(Math.random()*MENU_NOTES.length)] * 0.5;
        const t = audioCtx.currentTime, dur = 3.5+Math.random()*2;
        const g = audioCtx.createGain(); g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(userVolume*0.09, t+dur*0.35);
        g.gain.linearRampToValueAtTime(0, t+dur);
        const sine = audioCtx.createOscillator(); sine.type='sine'; sine.frequency.value=freq;
        const tri = audioCtx.createOscillator(); tri.type='triangle'; tri.frequency.value=freq*2;
        const triGain = audioCtx.createGain(); triGain.gain.value=0.2;
        sine.connect(g); tri.connect(triGain); triGain.connect(g); g.connect(out);
        sine.start(t); tri.start(t); sine.stop(t+dur+0.2); tri.stop(t+dur+0.2);
        scheduleMusicNote();
      }, (4+Math.random()*5)*1000);
    }
    scheduleMusicNote();

    menuAmbNodes = { out, d1, d2, washSrc, stopSwell: ()=> clearTimeout(swellTimer), stopMusic: ()=> clearTimeout(musicTimer) };
  }catch(e){ /* audio unavailable - menu just plays silent, not fatal */ }
}
export function stopMenuAmbience(){
  const audioCtx = getAudioCtx();
  if(!menuAmbNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const nodes = menuAmbNodes;
  try{
    nodes.out.gain.cancelScheduledValues(t);
    nodes.out.gain.setValueAtTime(nodes.out.gain.value, t);
    nodes.out.gain.linearRampToValueAtTime(0, t+0.6);
    nodes.stopSwell();
    nodes.stopMusic();
    setTimeout(()=>{ try{ nodes.d1.stop(); nodes.d2.stop(); nodes.washSrc.stop(); }catch(e){} }, 650);
  }catch(e){}
  menuAmbNodes = null;
}
// soft piano-ish tone on hover/click - sine fundamental + a quieter
// triangle overtone with a gentle attack/long exponential decay, rather
// than a hard synth blip. Notes come from a narrow scale (one flatted
// step for an "off" color) so brushing across all four buttons still
// sounds intentional, not like random beeps.
const MENU_NOTES = [220.00, 246.94, 261.63, 293.66, 311.13, 349.23]; // A3,B3,C4,D4,Eb4,F4
let lastMenuNote = -1;
function playMenuTone(isClick){
  const audioCtx = getAudioCtx();
  if(!audioCtx || state.muted) return;
  if(audioCtx.state === 'suspended') audioCtx.resume();
  let idx = Math.floor(Math.random()*MENU_NOTES.length);
  if(idx === lastMenuNote) idx = (idx+1)%MENU_NOTES.length;
  lastMenuNote = idx;
  const freq = MENU_NOTES[idx] * (isClick ? 0.5 : 1); // click drops an octave - "confirmed" vs. "brushed past"
  const t = audioCtx.currentTime;
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(userVolume*(isClick?0.22:0.14), t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t+(isClick?1.6:1.1));
  g.connect(audioCtx.destination);
  const sine = audioCtx.createOscillator(); sine.type='sine'; sine.frequency.value=freq;
  const tri = audioCtx.createOscillator(); tri.type='triangle'; tri.frequency.value=freq*2;
  const triGain = audioCtx.createGain(); triGain.gain.value=0.25;
  sine.connect(g); tri.connect(triGain); triGain.connect(g);
  sine.start(t); tri.start(t);
  sine.stop(t+2); tri.stop(t+2);
}
/* ---------- PRESS FEEDBACK (visual + haptic, not audio-only) ----------
   A physical dip on press (handled in CSS via :active) plus a brief
   chromatic stutter class so a click *reads* as a press, not just a
   sound cue with no visual confirmation. Also fires a light haptic pulse
   on devices that support it - feature-detected, silently skipped
   elsewhere. */
function corruptPress(el){
  if(!el) return;
  el.classList.remove('btn-corrupt'); void el.offsetWidth;
  el.classList.add('btn-corrupt');
  setTimeout(()=> el.classList.remove('btn-corrupt'), 240);
  if(settingsVibration && navigator.vibrate){ try{ navigator.vibrate(8); }catch(e){} }
}
document.querySelectorAll('.menu-btn').forEach(el=>{
  el.addEventListener('pointerenter', ()=> playMenuTone(false));
  el.addEventListener('focus', ()=> playMenuTone(false)); // keyboard users get the same hover cue
  el.addEventListener('click', ()=>{ playMenuTone(true); corruptPress(el); });
});
['settings-close','credits-close','settings-delete-save'].forEach(id=>{
  const el = $(id);
  if(el) el.addEventListener('click', ()=> corruptPress(el));
});
$('begin-btn').addEventListener('click', ()=> corruptPress($('begin-btn')));
// audio can't start with zero prior user interaction - kick off the menu
// bed on the very first pointer/key press anywhere on the title screen,
// whichever comes first (doesn't have to be a menu button specifically).
titleScreen.addEventListener('pointerdown', startMenuAmbience, {once:true});
titleScreen.addEventListener('keydown', startMenuAmbience, {once:true});

/* ---------- IN-GAME MENU HUB (custom SVG) ----------
   Player-facing entry point into Settings and Load Game while actually
   playing. Previously neither was reachable once the title screen was
   behind you - which is the actual reason settings changes looked like
   they weren't doing anything in-game: there was no way to even open
   Settings mid-run to see them take effect. Reuses the existing,
   already-fully-wired Settings overlay rather than duplicating it.

   Gated on isGameplayActive() rather than state.started: state.started
   is also written by the bigmap, the ending sequence, and save-regain,
   so it's the wrong "can I open" signal. isGameplayActive() also isn't
   reusing state.started as a workaround - it reads hud.classList.
   contains('visible') directly off the DOM at click time, rather than a
   separately hand-set boolean (an earlier gameHasBegun flag needed
   three call sites to stay in sync and was the actual cause of a
   "menu button does nothing" bug - see menu.js's header comment).
   hubOverlay/hubOpen/openHub/closeHub/showHubFlavor/
   isGameplayActive now live in ui/menu.js (Wave 3 - see
   docs/HANDOFF.md), imported at top-level. The button wiring below
   stays here since it reaches into settings/save/memories/radiolog/
   inventory/help/bigmap/credits all at once - see menu.js's own header
   comment. */
$('hub-resume').addEventListener('click', ()=>{ corruptPress($('hub-resume')); closeHub(); });
$('hub-settings').addEventListener('click', ()=>{
  corruptPress($('hub-settings'));
  setSettingsOpenedFromHub(true);
  hubOverlay.classList.remove('open'); // hide hub underneath so it doesn't stack with settings
  settingsOverlay.classList.add('open');
});
$('hub-load').addEventListener('click', ()=>{
  corruptPress($('hub-load'));
  if(!hasSave()){ showHubFlavor('there is nothing here to return to.'); return; }
  if(!confirm('Load your last save? Any progress since then will be lost.')) return;
  const raw = (()=>{ try{ return localStorage.getItem(SAVE_KEY); }catch(e){ return null; } })();
  if(!raw) return;
  try{
    closeHub();
    restoreFromSave(JSON.parse(raw));
  }catch(e){ console.error('save data corrupt, ignoring', e); }
});
$('hub-quit').addEventListener('click', ()=>{
  corruptPress($('hub-quit'));
  if(!confirm('Quit to the title screen? Make sure anything you want kept has been saved.')) return;
  location.reload();
});

/* ---------- MEMORIES PANEL ----------
   Replaces the old #lore-panel, which had full CSS but was never wired to
   any HTML or JS - lore text only ever surfaced once, for 4.2s, via
   showLineBox() on pickup, then was gone for good if you missed it or
   were too tense to read mid-collection. This actually persists it. */
$('hub-memories').addEventListener('click', ()=>{
  corruptPress($('hub-memories'));
  hubOverlay.classList.remove('open');
  $('memories-overlay').classList.add('open');
  try{ renderMemories(); startGlitchScramble(); }
  catch(err){ console.error('renderMemories failed:', err); }
});
$('memories-close').addEventListener('click', ()=>{
  $('memories-overlay').classList.remove('open');
  hubOverlay.classList.add('open');
  if(!creditsOverlay.classList.contains('open')) stopGlitchScramble();
});

/* ---------- RADIO LOG ----------
   Replaces the ephemeral ticker-only broadcastRadio() behaviour (5.2s
   then gone forever) with an actual persisted history, same idea as
   Memories. state.radioLog is pushed to inside broadcastRadio() itself. */
$('hub-radiolog').addEventListener('click', ()=>{
  corruptPress($('hub-radiolog'));
  hubOverlay.classList.remove('open');
  $('radiolog-overlay').classList.add('open');
  try{ renderRadioLog(); }
  catch(err){ console.error('renderRadioLog failed:', err); }
});
$('radiolog-close').addEventListener('click', ()=>{
  $('radiolog-overlay').classList.remove('open');
  hubOverlay.classList.add('open');
});

/* ---------- INVENTORY ----------
   Real bag now (Phase 3) - a grid of item slot tiles you click through
   to inspect, plus objectives underneath. See ui/inventory.js/
   systems/inventory.js/data/items.js. */
$('hub-inventory').addEventListener('click', ()=>{
  corruptPress($('hub-inventory'));
  hubOverlay.classList.remove('open');
  $('inventory-overlay').classList.add('open');
  try{ renderInventory(); }
  catch(err){ console.error('renderInventory failed:', err); }
});
$('inventory-close').addEventListener('click', ()=>{
  $('inventory-overlay').classList.remove('open');
  hubOverlay.classList.add('open');
});

/* ---------- HELP ----------
   Controls reference - there was previously no explanation of controls
   anywhere in the game (not on the title screen, not in-game). Adapted to
   touch vs. desktop at render time rather than guessing once, since a
   player can plausibly switch device between sessions. */
$('hub-help').addEventListener('click', ()=>{
  corruptPress($('hub-help'));
  hubOverlay.classList.remove('open');
  $('help-overlay').classList.add('open');
  try{ renderHelp(); }
  catch(err){ console.error('renderHelp failed:', err); }
});
$('help-close').addEventListener('click', ()=>{
  $('help-overlay').classList.remove('open');
  hubOverlay.classList.add('open');
});

document.querySelectorAll('.svg-menu-btn, .svg-footer-link').forEach(el=>{
  el.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' || e.key===' '){ e.preventDefault(); el.dispatchEvent(new Event('click')); }
  });
});
const hubBtn = $('hub-btn');
if(!hubBtn) console.error('[hub-btn] element not found in DOM - id mismatch or markup got removed');
hubBtn.addEventListener('click', ()=>{
  console.warn('[hub-btn] click received, HUD visible:', hud.classList.contains('visible'));
  corruptPress(hubBtn);
  openHub();
});
hubBtn.addEventListener('touchstart', e=>{
  e.preventDefault(); e.stopPropagation();
  console.warn('[hub-btn] touchstart received, HUD visible:', hud.classList.contains('visible'));
  corruptPress(hubBtn);
  openHub();
}, {passive:false});

/* ---------- KEYBOARD NAVIGATION PASS ----------
   Escape closes whichever overlay is open (settings/credits/bigmap/hub),
   in priority order, or opens the menu hub if nothing else is open and
   the player is actually in-game - there was no other way to back out via
   keyboard once Tab had moved focus inside one of them, and no keyboard
   path into the menu hub at all before this. */
document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  if(settingsOverlay.classList.contains('open')) closeSettingsOverlay();
  else if(creditsOverlay.classList.contains('open')){
    creditsOverlay.classList.remove('open');
    creditsCrawlEl.classList.remove('rolling');
    stopGlitchScramble();
  }
  else if($('memories-overlay').classList.contains('open')){
    $('memories-overlay').classList.remove('open');
    hubOverlay.classList.add('open');
    stopGlitchScramble();
  }
  else if($('radiolog-overlay').classList.contains('open')){ $('radiolog-overlay').classList.remove('open'); hubOverlay.classList.add('open'); }
  else if($('inventory-overlay').classList.contains('open')){ $('inventory-overlay').classList.remove('open'); hubOverlay.classList.add('open'); }
  else if($('help-overlay').classList.contains('open')){ $('help-overlay').classList.remove('open'); hubOverlay.classList.add('open'); }
  else if(bigmapOverlay.classList.contains('open')){ bigmapOverlay.classList.remove('open'); state.started = true; }
  else if(hubOverlay.classList.contains('open')) closeHub();
  else if(isGameplayActive()) openHub();
});

/* ---------- MENU FLAVOR TEXT ----------
   A single ephemeral line under the menu, in-voice rather than clinical
   UI copy - e.g. clicking a disabled Regain doesn't just do nothing, it
   admits there's nothing to return to. */
let menuFlavorTimer = null;
function showMenuFlavor(text, hold){
  const el = $('menu-flavor');
  if(!el) return;
  el.textContent = text;
  el.classList.add('show');
  if(menuFlavorTimer) clearTimeout(menuFlavorTimer);
  menuFlavorTimer = setTimeout(()=> el.classList.remove('show'), hold||3400);
}
const REGAIN_EMPTY_LINES = [
  'there is nothing here to return to.',
  'you haven\u2019t remembered anything yet.',
  'no thread back. not this time.'
];

/* ---------- MAIN MENU BUTTONS ---------- */
updateRegainAvailability();
$('menu-settings').addEventListener('click', ()=> settingsOverlay.classList.add('open'));
$('menu-regain').addEventListener('click', ()=>{
  if(!hasSave()){
    corruptPress($('menu-regain'));
    showMenuFlavor(REGAIN_EMPTY_LINES[Math.floor(Math.random()*REGAIN_EMPTY_LINES.length)]);
    return;
  }
  const raw = (()=>{ try{ return localStorage.getItem(SAVE_KEY); }catch(e){ return null; } })();
  if(!raw) return;
  stopMenuAmbience();
  try{ restoreFromSave(JSON.parse(raw)); }
  catch(e){ console.error('save data corrupt, ignoring', e); }
});
$('menu-remember').addEventListener('click', ()=>{
  titleScreen.classList.remove('show-menu');
  titleScreen.classList.add('show-setup');
  setTimeout(()=> titleScreen.classList.add('show-btn'), 3900);
});

/* ---------- RANSOM NOTE TEXT ----------
   Splits text into words, wraps each in its own span with a random
   typeface / rotation / baseline offset pulled from the font pool, so a
   sentence looks pasted together from mismatched sources. */
const RANSOM_FONTS = ['rn-f0','rn-f1','rn-f2','rn-f3','rn-f4','rn-f5','rn-f6'];
function ransomize(el, opts){
  opts = opts || {};
  const chip = !!opts.chip;
  const words = el.textContent.split(/(\s+)/); // keep whitespace tokens
  el.innerHTML = '';
  words.forEach(tok=>{
    if(tok.trim()===''){ el.appendChild(document.createTextNode(tok)); return; }
    const span = document.createElement('span');
    span.className = 'rn-word ' + RANSOM_FONTS[Math.floor(Math.random()*RANSOM_FONTS.length)];
    if(chip && Math.random()<0.5) span.className += ' rn-chip';
    span.textContent = tok;
    const rot = (Math.random()*10-5).toFixed(1);
    const ty = (Math.random()*6-3).toFixed(1);
    // was transform:scale(...) - scaling already-rasterized text blurs it,
    // especially shrinking below 1x. A real font-size change re-renders
    // the glyphs at their target size instead, so words stay crisp.
    const sizePct = (90+Math.random()*24).toFixed(0);
    span.style.fontSize = sizePct + '%';
    span.style.transform = `rotate(${rot}deg) translateY(${ty}px)`;
    el.appendChild(span);
  });
}

/* Same ransom-note idea, but walks text nodes in place instead of
   flattening innerHTML, so existing markup (<em> emphasis, nested spans)
   survives. Used on the synopsis, which has <em> tags we want to keep.
   Pass a skipClass to leave certain child elements (like the field-log
   tag line) untouched. */
function ransomizeRich(el, opts){
  opts = opts || {};
  const skipClass = opts.skipClass || null;
  const chip = !!opts.chip;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  while(walker.nextNode()){
    const node = walker.currentNode;
    if(skipClass && node.parentElement && node.parentElement.closest('.'+skipClass)) continue;
    if(node.textContent.trim()==='') continue;
    textNodes.push(node);
  }
  textNodes.forEach(node=>{
    const words = node.textContent.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    words.forEach(tok=>{
      if(tok.trim()===''){ frag.appendChild(document.createTextNode(tok)); return; }
      const span = document.createElement('span');
      span.className = 'rn-word ' + RANSOM_FONTS[Math.floor(Math.random()*RANSOM_FONTS.length)];
      if(chip && Math.random()<0.5) span.className += ' rn-chip';
      span.textContent = tok;
      const rot = (Math.random()*7-3.5).toFixed(1);
      const ty = (Math.random()*5-2.5).toFixed(1);
      const sizePct = (94+Math.random()*16).toFixed(0);
      span.style.fontSize = sizePct + '%';
      span.style.transform = `rotate(${rot}deg) translateY(${ty}px)`;
      frag.appendChild(span);
    });
    node.parentNode.replaceChild(frag, node);
  });
}

/* ---------- WAKE DIALOGUE ----------
   Autoplays right after the eyes open: three broken half-thoughts, each
   typed out then re-set with mismatched ransom-note fonts, with a short
   chromatic glitch burst on the box itself between lines. */
function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

async function typeLine(el, text, opts){
  opts = opts || {};
  const baseDelay = opts.delay!==undefined ? opts.delay : 55;
  el.textContent = '';
  const cursor = document.createElement('span');
  cursor.id = 'wake-dialogue-cursor';
  for(let i=0;i<text.length;i++){
    el.textContent = text.slice(0, i+1);
    el.appendChild(cursor);
    const ch = text[i];
    // ellipses and the stammered cut-offs get a longer, uneven hold -
    // this is where the stutter reads as a stutter instead of just typing
    let delay = baseDelay + Math.random()*35;
    if(ch==='.') delay += 90 + Math.random()*140;
    if(ch===' ') delay += 40;
    await sleep(delay);
  }
  cursor.remove();
}

export async function playWakeDialogue(){
  const box = $('wake-dialogue');
  const textEl = $('wake-dialogue-text');
  if(!box || !textEl) return;
  if(dialogueBoxBusy) return; // shouldn't happen this early, but never barge over another line
  dialogueBoxBusy = true;
  const lines = [
    { text:'...okay. okay. eyes open. that\'s step one.', hold:1500 },
    { text:'don\'t know this place. don\'t know my own name, either — one thing at a time.', hold:1700 },
    { text:'whatever happened here, it\'s still happening. move.', hold:1900 }
  ];
  await sleep(900); // let the scene breathe before the first thought arrives
  box.classList.add('visible');
  for(let i=0;i<lines.length;i++){
    await typeLine(textEl, lines[i].text);
    ransomize(textEl); // words snap into mismatched fonts once the line lands
    box.classList.add('glitch-burst');
    setTimeout(()=>box.classList.remove('glitch-burst'), 220);
    await sleep(lines[i].hold);
    if(i < lines.length-1){
      // a quick glitch-out before the next fractured thought
      box.classList.add('glitch-burst');
      await sleep(140);
      box.classList.remove('glitch-burst');
      textEl.textContent = '';
      await sleep(220);
    }
  }
  box.classList.add('glitch-burst');
  await sleep(200);
  box.classList.remove('visible');
  box.classList.remove('glitch-burst');
  textEl.textContent = '';
  dialogueBoxBusy = false;
}

/* ---------- SHARED LINE BOX ----------
   Same box the wake-up dialogue uses, reused for the player calling out
   and for anything else that needs to speak in that voice. A busy flag
   keeps lines from overlapping - if the box is already talking, later
   calls are just skipped rather than queued, so it never backs up. */
let dialogueBoxBusy = false;
async function showLineBox(text, opts){
  opts = opts || {};
  if(dialogueBoxBusy) return false;
  const box = $('wake-dialogue');
  const textEl = $('wake-dialogue-text');
  if(!box || !textEl) return false;
  dialogueBoxBusy = true;
  box.classList.add('visible');
  await typeLine(textEl, text, { delay: opts.delay });
  if(opts.ransom) ransomize(textEl);
  box.classList.add('glitch-burst');
  setTimeout(()=>box.classList.remove('glitch-burst'), 220);
  await sleep(opts.hold!==undefined ? opts.hold : 1700);
  box.classList.add('glitch-burst');
  await sleep(160);
  box.classList.remove('glitch-burst');
  box.classList.remove('visible');
  textEl.textContent = '';
  dialogueBoxBusy = false;
  return true;
}

/* ---------- PLAYER VOICE ----------
   The player speaks based on situation, not on a fixed script: a first
   call-out once they've been wandering alone for a while, then further
   lines gated by cooldown and colored by what's actually happening
   (something hunting them, low sanity, near/at the tower, etc). */
const playerCallOutLines = [
  "anyone left out here? say something.",
  "i know how this sounds. i'm asking anyway.",
  "...if you can hear me, i'm not going to hurt you.",
  "nobody. of course."
];
const playerFearLines = [
  "keep moving. don't need to know what that is to know i don't want it closer.",
  "stop trying to name it. just move.",
  "whatever that is, it's not confused about what it's doing. i need to be less confused about what i'm doing.",
  "i don't have to understand it to know it's wrong. go.",
  "don't run in a straight line. don't run in a straight line—",
  "it's not that it's fast. it's that it doesn't stop."
];
const playerLowSanityLines = [
  "i had this figured. i had a plan. where did the plan go.",
  "that's the third door i've counted twice. or the first door three times. i can't tell anymore.",
  "focus. if i stop making sense of this, it wins.",
  "i'm not losing my mind. i'm losing the parts of it i was using to survive.",
  "i keep filling in the gaps myself. that's the part that scares me — how easy it is.",
  "i said that already. didn't i say that already."
];
const playerTowerFarLines = [
  "a relay tower. if anything on this continent still talks, it talks through one of those.",
  "if there's a signal anywhere, it starts there.",
  "i need eyes on this place. that tower's the closest thing to eyes i've got."
];
const playerTowerNearLines = [
  "please still be standing. please still be more than rust.",
  "okay. okay, i'm close.",
  "come on. give me something. anything."
];
const playerTowerUnlockedLines = [
  "now i can see the shape of this place. doesn't make it kinder. just makes it mine to navigate.",
  "signal's weak but it's something. it's something.",
  "at least i'm not guessing blind anymore. i'll take it."
];
// new: fires once dread crosses the same 0.65 threshold the sky/audio
// systems already escalate at - the player's voice should break down in
// step with everything else, not stay calm while the sky bleeds. Kept aimed
// at the world being wrong, not at a specific thing chasing him - the
// horror here is the place, not a monster.
const playerDreadHighLines = [
  "the sky isn't supposed to look like that. i don't need a word for wrong to know this is wrong.",
  "it's not hunting me. that's almost worse. this is just what's here now.",
  "i keep waiting for someone to tell me this isn't normal. there's no one left to tell me anything.",
  "i don't remember my own name, but i remember skies didn't used to do that. i think. i think i remember that."
];
// new: a short reaction the first time the eye-storm event fires - the
// game had a whole audiovisual set-piece for this with zero player voice
// acknowledging it, which was part of the dialogue/intensity mismatch
const playerEyeStormLines = [
  "that's not stars. those are— okay. okay, don't count them. just move.",
  "it's not chasing. it's just watching. all of it, at once.",
  "i don't need to understand this right now. i need to not be under it."
];
// pickFrom() now imported from utils/math.js above.
function pickSituationalPlayerLine(){
  const anyHunting = ghuulList.some(g=>g.aiState==='HUNT');
  if(anyHunting) return { text: pickFrom(playerFearLines), hold:1600, ransom:true };
  if(typeof eyeStormFired!=='undefined' && eyeStormFired && state.elapsed - EYE_STORM_TRIGGER_TIME < 45)
    return { text: pickFrom(playerEyeStormLines), hold:1900, ransom:true };
  if(state.dread > 0.65) return { text: pickFrom(playerDreadHighLines), hold:1900, ransom:true };
  if(state.sanity < 0.32) return { text: pickFrom(playerLowSanityLines), hold:1700, ransom:true };
  const distToTower = Math.hypot(state.playerX - RADIO_TOWER_POS.x, state.playerZ - RADIO_TOWER_POS.z);
  if(!state.minimapUnlocked){
    if(distToTower < 40) return { text: pickFrom(playerTowerNearLines), hold:1500 };
    if(Math.random()<0.5) return { text: pickFrom(playerTowerFarLines), hold:1700 };
  } else if(Math.random()<0.35){
    return { text: pickFrom(playerTowerUnlockedLines), hold:1700 };
  }
  return { text: pickFrom(playerCallOutLines), hold:1500 };
}
export function updatePlayerVoice(dt){
  if(!state.started) return;
  state.playElapsed = (state.playElapsed||0) + dt;
  if(state.lastPlayerLineAt===undefined) state.lastPlayerLineAt = -999;
  // first call-out once they've been wandering alone ~30s
  if(state.playerLineStage===undefined) state.playerLineStage = 0;
  if(state.playerLineStage===0 && state.playElapsed>30){
    state.playerLineStage = 1;
    state.lastPlayerLineAt = state.playElapsed;
    showLineBox(pickFrom(playerCallOutLines), { hold:1600 });
    return;
  }
  if(state.playerLineStage>=1 && state.playElapsed - state.lastPlayerLineAt > (38+Math.random()*28)){
    state.lastPlayerLineAt = state.playElapsed;
    const pick = pickSituationalPlayerLine();
    showLineBox(pick.text, { hold:pick.hold, ransom:pick.ransom });
  }
}

/* ---------- COLLISION / MOVEMENT HELPERS ---------- */
export const _tmpForward = new THREE.Vector3();
export const _tmpRight = new THREE.Vector3();
export const Y_AXIS = new THREE.Vector3(0,1,0);

// See player.js's file header for why this replaced a static circular
// import: this is the last of the two live main.js<->module cycles found
// in a full-codebase sweep (the other was titleScreen.js, HOTFIX #5) -
// closing it here since updatePlayer() is the single hottest per-frame
// path in the game and the same persistent-TDZ risk applies.
registerPlayerRefs({
  keys, _tmpForward, _tmpRight, Y_AXIS, orbMeshes, RADIO_TOWER_POS,
  RADIO_PICKUP_POS, getRadioPickupMesh: () => radioPickupMesh,
  updateCompass, updatePlayerVoice, updateRadioTower
});

/* ---------- MAIN LOOP ----------
   clock now comes from core/scene.js (real module extraction). */

function updateRotateOverlay(){
  // portrait is now a supported layout - nothing to block
  // adjust camera FOV to compensate for the narrower horizontal field
  // in portrait: a taller frustum means we can see more vertically but
  // need a wider-than-default FOV to keep the scene from feeling like
  // a letterboxed slot. Three.js FOV is vertical, so in portrait the
  // horizontal FOV actually narrows dramatically at the default 65° vertical.
  // Widening to ~85° in portrait keeps the world feeling open.
  const isPortrait = window.innerHeight > window.innerWidth;
  camera.fov = isPortrait ? 85 : 65;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  state.portraitBlocked = false;
}
// renderer.setSize reallocates the WebGL framebuffer (and every
// post-processing render target) from scratch - fine once, but the browser
// fires 'resize' repeatedly while a window is actively being dragged, or
// even just from devtools opening/closing, so this was doing that full
// reallocation many times in a burst instead of once. Debounce so only the
// last resize in a burst actually touches the renderer, AND skip the work
// entirely if the dimensions didn't actually change - a resize event can
// fire (e.g. from a devtools panel or live-reload overlay toggling) with
// identical window.innerWidth/innerHeight, which would otherwise still pay
// the full reallocation cost for genuinely nothing.
let resizeDebounceId = null;
let lastResizeW = window.innerWidth, lastResizeH = window.innerHeight;
window.addEventListener('resize', ()=>{
  clearTimeout(resizeDebounceId);
  resizeDebounceId = setTimeout(()=>{
    if(window.innerWidth === lastResizeW && window.innerHeight === lastResizeH) return;
    lastResizeW = window.innerWidth; lastResizeH = window.innerHeight;
    renderer.setPixelRatio(baseDPR * settingsResScale);
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateRotateOverlay();
  }, 120);
});
window.addEventListener('orientationchange', updateRotateOverlay);
updateRotateOverlay();

let titleCamYaw = Math.PI * 0.15;
// state.started goes false for three different reasons now (title screen
// not begun yet, bigmap open/paused, ending fired) but only the first one
// should ever snap the 3D camera into the idle title-screen orbit. Without
// this separate flag, opening the bigmap or reaching the ending both fell
// into the same `if(!state.started) updateTitleCam(dt)` branch and the
// camera silently drifted to the orbit shot behind the overlay - so
// closing the bigmap (or, worse, the ending sequence) left the camera
// somewhere the player never pointed it.
// state.titleScreenActive lives in core/state.js (moved off a bare `let`
// export in ui/titleScreen.js - see the comment there for why).
function updateTitleCam(dt){
  titleCamYaw += dt*0.025;
  const orbitR = 2.2;
  const cx = Math.sin(titleCamYaw*0.3)*orbitR, cz = Math.cos(titleCamYaw*0.3)*orbitR;
  const y = terrainHeight(cx, cz);
  camera.position.set(cx, y + EYE_HEIGHT + 1.1, cz);
  camera.rotation.set(-0.07, titleCamYaw, 0);
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if(fpsEl){
    fpsFrames++; fpsAccum += dt;
    if(fpsAccum >= 0.25){ fpsEl.textContent = Math.round(fpsFrames/fpsAccum) + ' fps'; fpsFrames = 0; fpsAccum = 0; }
  }

  // keep the instance pools' bounding spheres centered on the player so
  // frustum culling actually does something - radius covers the full loaded
  // radius (see UNLOAD_RADIUS_CHUNKS) with margin, so nothing pops.
  const cullR = UNLOAD_RADIUS_CHUNKS*CHUNK_SIZE*1.3;
  unitBoxGeo.boundingSphere.center.set(state.playerX, 20, state.playerZ);
  unitBoxGeo.boundingSphere.radius = cullR;
  rubbleGeo.boundingSphere.center.set(state.playerX, 0, state.playerZ);
  rubbleGeo.boundingSphere.radius = cullR;
  puddleGeo.boundingSphere.center.set(state.playerX, 0, state.playerZ);
  puddleGeo.boundingSphere.radius = cullR;
  treeTrunkGeo.boundingSphere.center.set(state.playerX, 0, state.playerZ);
  treeTrunkGeo.boundingSphere.radius = cullR;
  treeFoliageGeo.boundingSphere.center.set(state.playerX, 0, state.playerZ);
  treeFoliageGeo.boundingSphere.radius = cullR;
  updateTrafficLights(dt);
  updateDowntownVisibility();
  updateRelayBeacons(dt);
  updateGrass(dt);

  if(state.started){
    state.elapsed += dt;
    updatePlayer(dt);
    updateGhuul(dt, playStinger);
    updateOrbs(dt);
    updateRain(dt);
    updateDust(dt);
    updateLamps(dt);
    updateDread(dt);
    updateWhisper(dt);
    updateSky(dt);
    updateSanity(dt);
    updateRadio(dt);
    evaluateDirector(dt, triggerLightning);
    tickAutosave(dt);
  } else {
    updateSky(dt*0.3);
    updateDust(dt);
    updateRain(dt);
    updateLamps(dt);
    if(state.titleScreenActive) updateTitleCam(dt);
    tickMenuIdle();
  }

  renderer.render(scene, camera);
}


/* ---------- COMPASS (Stage 10: lies at low sanity) ---------- */
const compassDirs = ['N','NE','E','SE','S','SW','W','NW'];
export function updateCompass(){
  if(state.sanity>0.28 || Math.random()>0.4){
    const idx = Math.round(((-state.yaw)/(Math.PI*2))*8 + 8) % 8;
    compassStrip.textContent = compassDirs[(idx+8)%8];
    compassStrip.classList.remove('lying');
  } else {
    const idx2 = Math.floor(Math.random()*8);
    compassStrip.textContent = compassDirs[idx2];
    compassStrip.classList.add('lying');
  }
}

// updateMinimap() now lives in ui/hud.js — imported above. Called with
// (radioPickupMesh, orbMeshes, RADIO_PICKUP_POS, RADIO_TOWER_POS) since
// none of those four have a module home yet.
const minimapEl = $('minimap');

// bigmapCanvas/bigmapCtx/BIG_MAP_WORLD/worldToBig()/updateFowAt()/
// drawBigMap() now all live in ui/bigmap.js — imported above.
// drawBigMap(orbMeshes, RADIO_TOWER_POS) takes params for the two things
// that still have no module home, same shape as updateMinimap().
const bigmapOverlay = $('bigmap-overlay');
const bigmapClose = $('bigmap-close');

// tap minimap → open big map
minimapEl.addEventListener('click', ()=>{
  if(!state.minimapUnlocked) return;
  updateFowAt(state.playerX, state.playerZ); // stamp current pos in case they haven't moved since last tick
  drawBigMap(orbMeshes, RADIO_TOWER_POS);
  bigmapOverlay.classList.add('open');
  state.started = false; // pause movement while map is open
});
bigmapClose.addEventListener('click', ()=>{
  bigmapOverlay.classList.remove('open');
  state.started = true;
});
bigmapOverlay.addEventListener('click', e=>{
  if(e.target===bigmapOverlay){ bigmapOverlay.classList.remove('open'); state.started=true; }
});

// updateGhuul() now lives in entities/ghuuls.js — imported above.
// (dropped `const _toG = new THREE.Vector3();` here too — grepped and
// confirmed it was never referenced anywhere, including inside the
// function that used to follow it.)

// shared by the notebook/locked-door/bed-table proximity checks in
// updateOrbs() - gates on both distance and a ~70-degree forward cone
// (dot product of look direction vs. direction-to-target > 0.3) so a
// prompt can't fire while the player's facing away from the thing in a
// room small enough that distance alone isn't a useful filter. Hoisted to
// module scope rather than declared inside updateOrbs(), which runs every
// frame.
function facingTarget(tx, tz, maxDist){
  const d = Math.hypot(tx-state.playerX, tz-state.playerZ);
  if(d >= maxDist || d <= 0.0001) return false;
  const fwdX = -Math.sin(state.yaw), fwdZ = -Math.cos(state.yaw);
  const toX = (tx-state.playerX)/d, toZ = (tz-state.playerZ)/d;
  return (fwdX*toX + fwdZ*toZ) > 0.3;
}
function updateOrbs(dt){
  updateRadioPickup(dt);
  // Locked-door payoff (map1 story direction, Beat 10): once the relay's
  // active, nudge the player back toward the safehouse the first time
  // they've drifted back into range of it - reads as the world quietly
  // keeping a promise rather than a scripted cutscene announcing itself.
  if(state.relayActive && !state.returnCueShown){
    const dDoor = Math.hypot(state.playerX-LOCKED_DOOR_POS.x, state.playerZ-LOCKED_DOOR_POS.z);
    if(dDoor < 22){
      state.returnCueShown = true;
      showLineBox(relayReturnCueLine, { hold: 3800 });
      writeSave();
    }
  }
  if(state.nearRadio && !state.radioCollected){
    interactPrompt.textContent = ('ontouchstart' in window) ? 'touch to take the radio' : '[E] take the radio';
    interactPrompt.classList.add('show');
    interactBtn.classList.add('active');
    state.nearOrbId = -1;
    return;
  }
  // distance alone used to be enough to trigger the notebook prompt - in a
  // room this small that meant it could fire while facing the opposite
  // wall, nowhere near actually looking at the table. facingTarget()
  // (module scope, above) gates on a ~70-degree forward cone as well as
  // distance; the locked door and bed table below need the identical
  // check, hence the shared helper instead of three copies.
  state.nearNotebook = facingTarget(NOTEBOOK_POS.x, NOTEBOOK_POS.z, 1.8);
  if(state.nearNotebook){
    interactPrompt.textContent = ('ontouchstart' in window) ? 'touch to write in the notebook' : '[E] write in the notebook';
    interactPrompt.classList.add('show');
    interactBtn.classList.add('active');
    state.nearOrbId = -1;
    return;
  }
  // locked room door - always shows a prompt when faced (the "wrong door"
  // beat works the same whether this is the first try or the fifth)
  state.nearLockedDoor = facingTarget(LOCKED_DOOR_POS.x, LOCKED_DOOR_POS.z, 1.9);
  if(state.nearLockedDoor){
    interactPrompt.textContent = ('ontouchstart' in window) ? 'touch to try the door' : '[E] try the door';
    interactPrompt.classList.add('show');
    interactBtn.classList.add('active');
    state.nearOrbId = -1;
    return;
  }
  // bedside table - only worth a prompt once the key quest has actually
  // started (state.doorKeyStatus set by tryLockedDoor()); before that,
  // and after "notHere" is already known, this stays silent rather than
  // offering an interaction with nothing left to say
  state.nearBedTable = state.doorKeyStatus==='searching' && facingTarget(BED_TABLE_POS.x, BED_TABLE_POS.z, 1.6);
  if(state.nearBedTable){
    interactPrompt.textContent = ('ontouchstart' in window) ? 'touch to check the table' : '[E] check the table';
    interactPrompt.classList.add('show');
    interactBtn.classList.add('active');
    state.nearOrbId = -1;
    return;
  }
  state.nearAnsweringMachine = facingTarget(ANSWERING_MACHINE_POS.x, ANSWERING_MACHINE_POS.z, 1.8);
  if(answeringMachineMesh){
    // slow, irregular blink - reads as "still holding messages" rather
    // than a steady beacon, same "broken signal" register as the rest of
    // the wrongness in this district
    const blink = 0.3 + 0.5*Math.max(0, Math.sin(performance.now()*0.0021));
    answeringMachineMesh.lightMat.emissiveIntensity = blink;
  }
  if(state.nearAnsweringMachine){
    interactPrompt.textContent = ('ontouchstart' in window) ? 'touch to play messages' : '[E] play messages';
    interactPrompt.classList.add('show');
    interactBtn.classList.add('active');
    state.nearOrbId = -1;
    return;
  }
  let nearest=-1, nearestDist=3.2;
  for(const o of orbMeshes){
    if(o.collected) continue;
    // Gating: Cluster C loosely behind a dread threshold (§1 Beat 7 -
    // "gated loosely behind dread/sanity thresholds"), the #18 centerpiece
    // strictly behind #11 already found (§1 Beat 7 guardrail - once
    // revealed it stays revealed, no need to re-hide it).
    if(o.gated && !o.revealed){
      const unlockable = (o.id === LORE_CENTERPIECE)
        ? state.collected.has(11)
        : state.dread > 0.35;
      if(unlockable){ o.revealed = true; o.mesh.visible = true; }
      else continue;
    }
    o.mesh.position.y = o.baseY + Math.sin(performance.now()*0.0015 + o.id*10)*0.12;
    o.mesh.rotation.y += dt*0.6;
    if(o.glowSpr) o.glowSpr.material.opacity = 0.55 + Math.sin(performance.now()*0.0015 + o.id*10)*0.15;
    const d = Math.hypot(o.mesh.position.x-state.playerX, o.mesh.position.z-state.playerZ);
    if(d<nearestDist){ nearestDist=d; nearest=o.id; }
  }
  state.nearOrbId = nearest;
  if(nearest>=0){
    interactPrompt.textContent = ('ontouchstart' in window) ? 'touch to remember' : '[E] remember';
    interactPrompt.classList.add('show');
    interactBtn.classList.add('active');
  } else {
    interactPrompt.classList.remove('show');
    interactBtn.classList.remove('active');
  }
}


function updateLamps(dt){
  const t = performance.now()*0.001;
  for(const l of lamps){
    const flick = 0.75 + Math.sin(t*3+l.phase)*0.15 + (Math.random()<0.02? -0.4:0);
    l.light.intensity = l.base * flick;
    if(l.glow){
      l.glow.material.opacity = THREE.MathUtils.clamp(0.85*flick, 0, 1);
      l.glow.scale.setScalar(2.6 * (0.85+flick*0.2));
    }
  }
}

let skyClock = 0;
// The curdle only starts once the player actually reaches the relay tower
// (state.minimapUnlocked - a real story beat), never before. There used to
// be an idle-timeout fallback (sit still for 2.5 min and it fires anyway)
// so players who never found the tower would still see the story move -
// but that meant the world could start turning wrong before the one event
// that's supposed to cause it had happened at all, which read as broken
// rather than atmospheric. Removed - the tower is the only trigger now.
const SKY_EVENT_RAMP = 240;   // full curdle takes 4 minutes once triggered - was 150s (2.5min), which read as too fast
const BLEED_DELAY = 15;        // drips start growing this many seconds into the curdle...
const BLEED_RAMP = 60;         // ...and reach full length over the following minute - was a flat +5min-from-boot offset, totally decoupled from the curdle it's supposed to be part of
function updateSky(dt){
  skyClock += dt;
  updateEyeStorm(dt);
  updateWindowFigure(dt);

  if(!state.skyEventTriggered && state.started && state.minimapUnlocked){
    state.skyEventTriggered = true;
    state.skyEventClock = 0;
  }
  if(state.skyEventTriggered) state.skyEventClock += dt;
  state.skyWrongness = state.skyEventTriggered
    ? THREE.MathUtils.clamp(state.skyEventClock/SKY_EVENT_RAMP, 0, 1)
    : 0;
  if(domeMat){
    const { top, mid, horizon } = skyColorsAt(state.skyWrongness);
    domeMat.uniforms.uTop.value.copy(top);
    domeMat.uniforms.uMid.value.copy(mid);
    domeMat.uniforms.uHorizon.value.copy(horizon);
    domeMat.uniforms.uTime.value = skyClock;
    domeMat.uniforms.uWrongness.value = state.skyWrongness;
  }
  holeUniforms.uWrongness.value = state.skyWrongness;
  cloudMat.uniforms.uWrongness.value = state.skyWrongness;
  cloudMat2.uniforms.uWrongness.value = state.skyWrongness;
  // the light itself sours along with the sky - neutral overcast hemisphere
  // light curdling toward the same violet-red the dome turns
  // Previously lerped all the way to a near-black violet, which crushed
  // buildings into flat unlit cutouts at full wrongness - looked "broken"
  // rather than "wrong". Lifted the target floor so geometry stays readable
  // (wrong-colored, but not void-black) and let the melt uniform below
  // carry the "the world is coming apart" read instead.
  // Floor raised from a near-black lerp target - local light sources (the
  // safehouse lamp, tower beacon, etc.) don't get dimmed by this at all,
  // they're untouched point lights, but a too-dark ambient/hemisphere still
  // crushes everything uniformly including areas those lamps are lighting,
  // which reads as "the light itself went dark" even though technically it
  // didn't. Keeping the ambient floor brighter means lit areas keep looking
  // lit - their own point light glow - while the *unlit* open world still
  // reads as wrong and dim by comparison.
  skyLight.color.setHex(0x9a9aa8).lerp(new THREE.Color(0xa8506e), state.skyWrongness);
  ambient.color.setHex(0x6a6a78).lerp(new THREE.Color(0x6e3f60), state.skyWrongness);

  // fog was a flat static density/color set once at scene creation and
  // never touched again - everything else here (sky, light, rain, dust)
  // reacts to dread/wrongness, so the fog sitting inert made the world
  // feel like it stopped closing in the moment it should be tightening
  // the most. Ties into the same wrongness read as rain (dread/forgetting)
  // plus a slice of skyWrongness, and adds a slow non-physical pulse so
  // it breathes rather than reads as a static backdrop.
  const fogPull = Math.max(state.dread, state.forgetting, state.skyWrongness*0.6);
  const fogPulse = 1 + Math.sin(skyClock*0.15)*0.04 + Math.sin(skyClock*0.037)*0.025;
  scene.fog.density = (0.0135 + fogPull*0.01) * fogPulse;
  scene.fog.color.setHex(FOG_COLOR).lerp(new THREE.Color(0x050308), fogPull*0.6);
  renderer.setClearColor(scene.fog.color);
  // buildings visibly sag/wobble as the sky corrupts - eases in past ~40%
  // wrongness so it's not noticeable until the world is genuinely turning.
  meltUniform.value = Math.max(0, state.skyWrongness - 0.4) / 0.6;

  // something enormous, mostly hidden - can shove up against the cloud
  // deck at any moment once the sky's started turning. Rare early, more
  // frequent as dread climbs.
  if(state.started && state.skyWrongness > 0.25){
    breachTimer -= dt;
    if(breachTimer <= 0){
      triggerSkyBreach();
      breachTimer = THREE.MathUtils.lerp(50, 16, state.dread) + Math.random()*20;
    }
  }
  if(starMat) starMat.uniforms.uTime.value = skyClock;
  if(starPoints){ starPoints.position.x = state.playerX; starPoints.position.z = state.playerZ; }
  // the monolith - always the same fixed bearing/distance from the player,
  // by design (see comment at its creation). Faces the camera like the
  // black hole does. Nearly invisible at low dread/wrongness (a shape you
  // could talk yourself out of having seen), climbs toward fully visible
  // as the world curdles - and gets a slow, wrong, non-physical sway that
  // has nothing to do with wind.
  if(monolithMesh){
    monolithMesh.position.x = state.playerX + Math.cos(MONOLITH_BEARING)*MONOLITH_DIST;
    monolithMesh.position.z = state.playerZ + Math.sin(MONOLITH_BEARING)*MONOLITH_DIST;
    monolithMesh.quaternion.copy(camera.quaternion);
    monolithMesh.rotation.z = Math.sin(skyClock*0.04) * 0.015;
    const visibility = THREE.MathUtils.clamp(state.dread*0.6 + state.skyWrongness*0.7, 0, 1);

    // the utility-fog swarm runs its own independent scripted cycle
    // (see sky.js's header comment) regardless of dread - it's a
    // background spectacle, not a reactive system. Its formedFactor
    // gates how much of the static crystal texture shows through, so
    // "a solid structure" and "a loose dispersing swarm" never
    // contradict each other on screen at once.
    if(monolithSwarm){
      updateMonolithSwarm(dt, visibility);
      monolithSwarm.points.position.x = monolithMesh.position.x;
      monolithSwarm.points.position.z = monolithMesh.position.z;
      monolithSwarm.points.quaternion.copy(monolithMesh.quaternion);
    }
    const formedFactor = monolithSwarm ? monolithSwarm.formedFactor : 1;
    monolithMat.opacity = (0.06 + visibility*0.5) * formedFactor;

    if(monolithGlowMesh){
      // the glow ramps up faster/earlier than the silhouette itself -
      // "you notice the light before you can convince yourself you see
      // a shape" is a stronger first read than the silhouette and glow
      // arriving together. Also flickers rather than sitting at a flat
      // value, consistent with the living/corrupted-signal feel used
      // for the ghuul and window-apparition elsewhere in this game.
      // Gated by the same formedFactor as the silhouette - during
      // 'dispersed'/'assembling', the swarm particles' own additive glow
      // (see monolithSwarm's material) already carries the "something
      // glowing over there" read, so this plane doesn't need a separate
      // floor value of its own.
      monolithGlowMesh.position.copy(monolithMesh.position);
      monolithGlowMesh.quaternion.copy(monolithMesh.quaternion);
      const glowVisibility = THREE.MathUtils.clamp(visibility*1.4, 0, 1);
      const flicker = 0.85 + 0.15*Math.sin(skyClock*3.1) * (0.5+Math.random()*0.5);
      monolithGlowMat.opacity = glowVisibility * 0.85 * flicker * formedFactor;
    }
  }
  updateSafehouseInterior(skyClock, dt);
  // clouds are only radius 150/170 spheres - smaller than WORLD_RADIUS (230),
  // so without this the player walks straight through the shell near the map
  // edge and sees its back-face rim as a hard circle against the dome behind
  // it (exactly the "visible outer circle" bug). Recenter on the player every
  // frame, same fix already applied to the stars, so the shell always
  // surrounds the camera regardless of geometry radius.
  if(cloudLayer){ cloudLayer.position.x = state.playerX; cloudLayer.position.z = state.playerZ; }
  if(cloudLayer2){ cloudLayer2.position.x = state.playerX; cloudLayer2.position.z = state.playerZ; }
  if(dripLayer){ dripLayer.position.x = state.playerX; dripLayer.position.z = state.playerZ; }
  // the far skirt is a single flat unlit color with no texture, so recentering
  // it on the player every frame is completely seamless (nothing to reveal
  // the recenter, unlike the detailed ground) - this is what makes the world
  // genuinely walkable forever instead of running out of ground at ±1300.
  if(skirt){ skirt.position.x = state.playerX; skirt.position.z = state.playerZ; }
  // the sky dome is a fixed radius-400 sphere - every other sky layer
  // (stars, clouds, skirt, black hole) recenters on the player every frame
  // for exactly this reason, but the dome was left at world origin. Once
  // the player walked far enough from spawn (easily possible - chunk
  // streaming/exit road go far past 400 units), the camera exited the
  // sphere entirely and its silhouette edge sliced across the screen as a
  // hard seam: dome-colored on one side, raw clear color on the other.
  if(domeMesh){ domeMesh.position.x = state.playerX; domeMesh.position.z = state.playerZ; }
  // drifting storm clouds, two layers at different speed/direction - now
  // continuous 3D noise, so drift is a moving offset, not UV scroll (no seam possible)
  cloudMat.uniforms.uTime.value = skyClock;
  cloudMat2.uniforms.uTime.value = skyClock;
  cloudMat.uniforms.uOffset.value.x += dt*0.02;
  cloudMat.uniforms.uOffset.value.y += dt*0.008;
  cloudMat2.uniforms.uOffset.value.x -= dt*0.035;
  cloudMat2.uniforms.uOffset.value.z += dt*0.012;
  if(dripMat){ dripMat.uniforms.uOffset.value.copy(cloudMat.uniforms.uOffset.value); }

  // the wound breathes - pulsing glow tied to dread, plus slow ambient pulse
  const pulse = 0.55 + Math.sin(skyClock*0.5)*0.25 + state.dread*0.5;
  cloudMat.uniforms.uOpacity.value = THREE.MathUtils.clamp(0.5 + pulse*0.3, 0.25, 1.0);
  cloudMat2.uniforms.uOpacity.value = THREE.MathUtils.clamp(0.22 + state.dread*0.3, 0.15, 0.7);
  // blood-vein cracks in the dome are near-invisible at low dread and
  // become an unmistakable pulsing web as dread climbs
  cloudMat.uniforms.uDread.value = state.dread;
  cloudMat2.uniforms.uDread.value = state.dread;
  // drips start partway into the curdle (BLEED_DELAY) and reach full length
  // over BLEED_RAMP after that - both relative to skyEventClock now, so they
  // land inside the same event as the color/melt changes instead of showing
  // up minutes after the sky's already gone flat and dark.
  const bleedAmt = state.skyEventTriggered
    ? THREE.MathUtils.clamp((state.skyEventClock - BLEED_DELAY)/BLEED_RAMP, 0, 1)
    : 0;
  cloudMat.uniforms.uBleed.value = bleedAmt;
  cloudMat2.uniforms.uBleed.value = bleedAmt;
  if(dripMat){ dripMat.uniforms.uBleed.value = bleedAmt; dripMat.uniforms.uWrongness.value = state.skyWrongness; dripMat.uniforms.uTime.value = skyClock; }

  if(spireBeacon){
    const bp = 0.6 + Math.sin(skyClock*1.4)*0.4;
    spireBeacon.material.opacity = 0.6 + bp*0.4;
    spireBeacon.scale.setScalar(1 + bp*0.25);
    const bg = spireBeacon.userData.glow;
    if(bg){
      bg.material.opacity = 0.55 + bp*0.35;
      bg.scale.setScalar(9 * (0.85 + bp*0.3));
    }
  }

  lightningTimer -= dt;
  if(lightningTimer<=0 && state.started){
    lightningTimer = 5 + Math.random()*(state.dread>0.5 ? 6 : 16);
    triggerLightning();
  }

  // the black hole overhead follows the player and reacts to dread
  if(holeMesh){
    holeMesh.position.x = state.playerX;
    holeMesh.position.z = state.playerZ;
    holeMesh.quaternion.copy(camera.quaternion);
    holeUniforms.uTime.value = skyClock;
    holeUniforms.uDread.value = state.dread;
  }

  // something enormous, mostly hidden, drifting through the storm
  let activeBreach = null;
  for(const s of skyShapes){
    s.ang += dt*s.speed;
    if(s.breaching){
      // breach curve: fast surge in, hold at the peak straining against the
      // clouds, then sink back - not a linear in/out, so the "hold" reads
      // as the thing actually pressing there rather than just passing through.
      const rate = s.breach < 0.85 ? 1.6 : 0.7;
      s.breach = Math.min(1, s.breach + dt*rate);
      if(s.breach >= 1 && s.breachSettleT === undefined) s.breachSettleT = 0.6 + Math.random()*0.5;
      if(s.breachSettleT !== undefined){
        s.breachSettleT -= dt;
        if(s.breachSettleT <= 0){ s.breach = Math.max(0, s.breach - dt*0.5); if(s.breach<=0){ s.breaching=false; s.breachSettleT=undefined; } }
      }
      const surge = Math.sin(s.breach*Math.PI*0.5); // eases the close-in/pull-back
      const closeRadius = THREE.MathUtils.lerp(s.radius, 22, surge);
      const bigHeight = THREE.MathUtils.lerp(s.height, 34, surge);
      s.mesh.position.set(
        state.playerX + Math.cos(s.breachAng)*closeRadius,
        bigHeight,
        state.playerZ + Math.sin(s.breachAng)*closeRadius
      );
      s.mesh.lookAt(camera.position);
      const scale = THREE.MathUtils.lerp(1, 5.5, surge);
      s.mesh.scale.set(scale, scale, 1);
      s.mesh.material.opacity = 0.15 + surge*0.55;
      activeBreach = { dir: s.mesh.position.clone().sub(camera.position).normalize(), amt: surge };
    } else {
      s.mesh.scale.set(1,1,1);
      s.mesh.position.set(
        state.playerX + Math.cos(s.ang)*s.radius,
        s.height,
        state.playerZ + Math.sin(s.ang)*s.radius
      );
      s.mesh.lookAt(camera.position);
      const cycle = Math.sin((skyClock+s.phase)*0.09);
      s.mesh.material.opacity = Math.max(0, cycle*0.4 - 0.08) * (0.3 + state.skyWrongness*0.7);
    }
  }
  const breachAmt = activeBreach ? activeBreach.amt : 0;
  cloudMat.uniforms.uBreachAmt.value = breachAmt;
  cloudMat2.uniforms.uBreachAmt.value = breachAmt;
  if(activeBreach){
    cloudMat.uniforms.uBreachDir.value.copy(activeBreach.dir);
    cloudMat2.uniforms.uBreachDir.value.copy(activeBreach.dir);
  }
  state.breachShake = breachAmt;

  // the watching eye - never orbits into view predictably. Every time it's
  // about to blink open it picks a brand new spot in the dome, so it can be
  // anywhere: behind you, close and huge, or half-lost in a cloud bank.
  // Rarely open at low dread; as dread rises it blinks more often, opens
  // wider, and lingers longer.
  {
    eyeState.timer -= dt;
    if(eyeState.timer<=0){
      const boldness = state.dread; // 0..1
      const opening = !(eyeState.target>0.5);
      eyeState.target = opening ? THREE.MathUtils.lerp(0.35, 1.0, boldness) : 0;
      if(opening){
        // relocate before it opens - it was never "there" a moment ago
        Object.assign(eyeState, rollEyeSpot());
        // the bolder the dread, the more likely it dares to appear close
        if(Math.random() < boldness*0.35) eyeState.radius *= 0.45;
      }
      eyeState.timer = opening
        ? THREE.MathUtils.lerp(0.5, 2.2, boldness) + Math.random()*0.6   // held open
        : THREE.MathUtils.lerp(9, 2, boldness) + Math.random()*6;        // held shut, shorter waits as dread rises
    }
    // snaps open fast (a shock), snaps shut even faster (it noticed you)
    const rate = eyeState.target>eyeState.open ? 6.0 : 11.0;
    eyeState.open = THREE.MathUtils.lerp(eyeState.open, eyeState.target, Math.min(1, dt*rate));
    eyeMesh.position.set(
      state.playerX + Math.cos(eyeState.ang)*eyeState.radius,
      eyeState.height,
      state.playerZ + Math.sin(eyeState.ang)*eyeState.radius
    );
    // a small twitch on the open axis while it's open - unsteady, not serene
    const twitch = eyeState.open>0.05 ? Math.sin(skyClock*13.0)*0.015*eyeState.open : 0;
    eyeMesh.lookAt(camera.position);
    eyeMesh.scale.set(1 + twitch, 0.04 + eyeState.open*0.96, 1);
    eyeMaterial.uniforms.uTime.value = skyClock;
    eyeMaterial.uniforms.uOpacity.value = eyeState.open * (0.55 + state.dread*0.45);

    eyeGlowMesh.position.copy(eyeMesh.position);
    eyeGlowMesh.lookAt(camera.position);
    const glowPulse = 0.7 + Math.sin(skyClock*3.0)*0.3;
    eyeGlowMaterial.opacity = eyeState.open * glowPulse * (0.35 + state.dread*0.4);
  }

  // distant windows flicker like something is still moving behind them
  for(const w of towerWindows){
    w.mat.opacity = Math.max(0, 0.5 + Math.sin(skyClock*0.8+w.phase)*0.3 + (Math.random()<0.01 ? -0.5:0));
  }
}

// ambientWhispers/pickAmbientWhisper()/updateWhisper() now live in
// ui/whisper.js — imported above.

requestAnimationFrame(()=>requestAnimationFrame(()=>titleScreen.classList.add('ready')));
// sleeper-state wake: the void behind the logo only shows for this build,
// where the character has been under for four years rather than four months
titleScreen.classList.add('void-active');

/* Rotating pool of WNCORE field-log fragments. Each load pulls a random
   one so returning players don't always see the same synopsis - they
   read like scraps pulled from different points in the log rather than
   one fixed intro, and lean on the wider Cygnus Signal Series canon
   (Nepal patient zero, WNCORE, KAGE, the Blood Pact, Husks/Ghuuls, the
   black-hole sky, Obsedia rain) without over-explaining any of it. */
const SYNOPSIS_ENTRIES = [
  { tag:'entry 0', body:
    `It's been <em>four years</em> since the sky broke open over Kathmandu
    and the rain came down wrong. Not weather. A <em>wound</em>.
    <br><br>
    You've been asleep since then — or something like asleep.
    Nine people you knew are gone from every record that should hold them.
    You don't remember their names. You <em>should</em> remember their names.
    <br><br>
    Somewhere out there, a relay tower is still broadcasting.
    Find the signal. Find the photographs. Find what was taken from you.
    <br><br>
    <em>Don't look at what's in the rain.</em>` },
  { tag:'entry 4', body:
    `Nepal reported it first. Patient zero, before anyone called it that.
    By the time WNCORE had a name for the wrongness, it already had
    a <em>shape</em>.
    <br><br>
    The tower still keeps time the old way — sign-on, sign-off, dead air
    in between. If you can find it, you can find where you were standing
    when this started.
    <br><br>
    <em>The Husks were people once. Some of them still answer to their names.</em>` },
  { tag:'entry 7', body:
    `KAGE doesn't broadcast. KAGE listens. If you're hearing this back,
    something already went through the relay before you did.
    <br><br>
    The Blood Pact kept their own dead close instead of burying them.
    You understand that better now than you did four years ago.
    <br><br>
    <em>Nine names. You had nine names once. Where did they go.</em>` },
  { tag:'entry 12', body:
    `The sky over the town isn't a sky anymore — call it a hole, call it
    a mouth, it doesn't much matter what you call it. It's been open
    long enough that the black rain stopped being news.
    <br><br>
    Logbook Drifters mark routes in chalk that washes out by morning
    and draw them again the next day anyway.
    <br><br>
    <em>A Ghuul isn't made. It's what's left after something is forgiven.</em>` },
  { tag:'entry 19', body:
    `Moon's still up there, wrong phase for the date, every single night.
    Nobody's fixed that. Nobody's tried very hard.
    <br><br>
    You woke up in this town with nine gaps where nine people used to be.
    The relay tower is the only thing here still doing its job.
    <br><br>
    <em>Whatever you forget out there, it doesn't forget you back.</em>` },
];
const setupEl = $('title-setup');
if(setupEl){
  try{
    const entry = SYNOPSIS_ENTRIES[Math.floor(Math.random()*SYNOPSIS_ENTRIES.length)];
    setupEl.innerHTML = `<span class="setup-tag">// WNCORE field log — ${entry.tag}</span>${entry.body}`;
    ransomizeRich(setupEl, {skipClass:'setup-tag'});
  }catch(err){
    console.error('synopsis setup failed, falling back to plain text', err);
  }
}

// Staged title sequence: ANOTHER SKY appears alone in the middle of the
// screen and holds there for a beat before anything else happens. Then it
// tears itself apart in a one-shot glitch burst, eases upward, and the
// four-option menu fades in below it. The synopsis wipe + begin button
// (the old automatic sequence) now only happens once the player picks
// Remember - see the menu-remember handler below.
setTimeout(()=> titleScreen.classList.add('glitch-burst'), 3000);
setTimeout(()=> titleScreen.classList.add('show-menu'), 3700);
// subtitle reads like it was assembled from cut-up fragments rather than
// typeset clean - same effect as the wake dialogue, applied once on load
const titleSubEl = $('title-sub');
if(titleSubEl) ransomize(titleSubEl);

// Same cut-up look extended across the rest of the title flow so the
// clean ANOTHER SKY logo is the only thing on screen that reads as
// "typeset" - every button, label, and panel around it should look
// pasted together from mismatched sources instead. Run once at load
// since none of this text changes at runtime (the settings value spans
// are marked .live-val and skipped so slider drags don't fight it).
document.querySelectorAll('.menu-btn').forEach(el=> ransomizeRich(el));
const beginBtnEl = $('begin-btn');
if(beginBtnEl) ransomize(beginBtnEl);
document.querySelectorAll('#settings-overlay .panel-title, #credits-overlay .credits-logo, #credits-overlay .credits-heading').forEach(el=> ransomize(el));
document.querySelectorAll('.panel-row label').forEach(el=> ransomizeRich(el, {skipClass:'live-val'}));
document.querySelectorAll('.danger-btn, .panel-close').forEach(el=> ransomize(el));
document.querySelectorAll('.credit-role').forEach(el=> ransomize(el));

animate();