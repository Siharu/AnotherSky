/* ============================================================
   world/safehouse.js — pulled from the monolith this round
   (Wave 2, last file in that wave: interior build + exterior shell +
   the teleport-pair transition + the locked-door glitch treatment).

   Owns: buildSafehouse() (the full 6-room interior — locked void room,
   radio room, living area/hub, kitchen, vestibule, storage),
   buildSafehouseExterior() (the small street-facing shell 26/-20 units
   away from SAFEHOUSE_CENTER), updateSafehouseTransition() (the
   teleport-pair door logic between the two, with a cooldown and a
   vignette hue-rotate flash to sell it as a glitch), and
   updateSafehouseInterior() (per-frame lamp swing + the locked door's
   constant jitter/hue-cycle).

   SAFEHOUSE_CENTER/SAFEHOUSE_HALF_W/SAFEHOUSE_HALF_D are now declared
   and exported HERE, not imported back from main.js. They used to live
   in main.js on the theory that placing this file's import of them
   after their declaration (in main.js's own source order) would make
   them available in time - that's not how ES module evaluation order
   works (imports are resolved as a dependency graph before any
   importing module's own top-level code runs, regardless of where the
   import statement sits in the file), and it caused a real
   "Cannot access before initialization" crash on load: this file reads
   SAFEHOUSE_CENTER at its own top level (EXTERIOR_CENTER/
   INT_DOOR_TRIGGER/INT_DOOR_LANDING below), which ran before main.js's
   top-level code had ever assigned it. Found via a full audit, fixed by
   moving true ownership here - this file only needs `state` (already
   imported below) to compute these, so there's no circular import
   needed for them at all now. sky/weather.js and systems/dread.js
   import them from here instead of from main.js.

   skyClock is main.js's per-frame clock, still local to its own IIFE
   scope (not exported) — updateSafehouseInterior() takes it as a
   parameter now instead of closing over it, same dependency-injection
   shape as updateGhuul(dt, stinger)/evaluateDirector(dt,
   triggerLightning) elsewhere in this migration. main.js's call site
   just needs updating to updateSafehouseInterior(skyClock).

   NOTEBOOK_POS/LOCKED_DOOR_POS/BED_TABLE_POS/SAFEHOUSE_DOOR_YAW are
   real cross-system dependencies (proximity checks in main.js's
   interact system, and the wake sequence's initial facing) so they're
   exported here rather than kept private.
   ============================================================ */
import { state } from '../core/state.js';
import { scene } from '../core/scene.js';
import { toonRamp, corkboardTex, metalTex, tileTex, woodPlankTex, fabricTex, plasterTex } from './materials.js';
import { groundHeightAt } from './terrain.js';
import { obstacles } from './worldData.js';
import { addGlow, patchFogToDistance } from '../render/postprocessing.js';
import { registerDoorPair } from '../systems/doors.js';

// nothing before this point ever mutates state.playerX/playerZ, so this
// still reads the correct initial spawn position - see the note above
// for why this moved here rather than staying in main.js.
export const SAFEHOUSE_CENTER = { x: state.playerX, z: state.playerZ };
export const SAFEHOUSE_HALF_W = 11.0, SAFEHOUSE_HALF_D = 8.0; // was 6.0/5.0 - full 6-room CAD floor plan, deliberately much bigger than the small exterior shell (see buildSafehouseExterior()) implies; sky/weather.js's insideSafehouse AABB check just needs these bumped to match, no other change needed there

const vignetteEl = document.getElementById('vignette');

/* ---------- SAFEHOUSE INTERIOR ----------
   Rebuilt from the user's second CAD sketch (six rooms, not the earlier
   four-zone layout): kitchen, living area (the hub), locked glitchy room,
   radio room, vestibule, storage. Player still spawns here exactly as
   before - SAFEHOUSE_CENTER === state.playerX/Z's initial value (see
   core/state.js), and this interior is still built at that real location,
   nothing about spawn changed.

   What DID change: this interior is now deliberately much bigger
   (SAFEHOUSE_HALF_W/D = 11/8, was 6/5) than the small station shell you'd
   see walking up to this building from outside (buildSafehouseExterior(),
   below - a separate, modest, ordinary-sized building placed a short
   distance away). The two are connected by teleport, not literal geometry
   - see updateSafehouseTransition() near the render loop. Walking out the
   vestibule's south door doesn't lead outside directly; it teleports the
   player to just outside the small exterior shell, and vice versa. This
   is the "small outside, much bigger inside" effect - deliberately
   unsettling, on purpose, per the reference sketch.

   Local coordinate notes: +x is "east", +z is "north", matching the
   sketch with north at the top. Room layout (local offsets from
   SAFEHOUSE_CENTER), north to south:
     North half (z > DIV_Z):
       - Locked glitchy room: x in [-HALF_W, LR_DIV_X] - sealed void,
         quest-gated door (existing tryLockedDoor() flow, untouched).
       - Radio room: x in [LR_DIV_X, HALF_W] - cot + nightstand (NW,
         against the locked-room wall), the X-arranged table+4-chairs
         cluster at room center, small radio-desk dressing (NE corner).
     South half (z < DIV_Z):
       - Kitchen (SW), Living area (hub, center - this is where
         SAFEHOUSE_CENTER/spawn actually lands), Vestibule, Storage (SE).
   Doors: locked room <-> living area (sealed, quest door); living area
   <-> kitchen; living area <-> vestibule; vestibule <-> storage; radio
   room <-> vestibule (small open doorway, no leaf, per sketch); vestibule
   south wall -> teleport seam to the exterior shell. */
const SAFEHOUSE_WALL_H = 3.1, SAFEHOUSE_WALL_T = 0.3;
const SAFEHOUSE_DOOR_HALF = 1.0; // vestibule's main (teleport) door gap half-width
const SAFEHOUSE_DOOR_YAW = -Math.PI/2; // forward=(-sin(yaw),-cos(yaw)) -> yaw=-PI/2 faces +X, toward the vestibule/exit

const DIV_Z = 0.4; // horizontal wall splitting north rooms (locked/radio) from south rooms
const LR_DIV_X = -2.2; // vertical wall splitting locked room (west) from radio room (east), north half only
const KITCHEN_DIV_X = -5.0; // kitchen <-> living area, south half
const VEST_DIV_X = 3.2; // living area <-> vestibule, south half
const STORAGE_DIV_X = 8.0; // vestibule <-> storage, south half

const LOCKED_DOOR_X = -3.3, LOCKED_DOOR_HALF = 0.75; // locked room's sealed door, on the DIV_Z wall
const KITCHEN_DOOR_Z = -3.2, KITCHEN_DOOR_HALF = 0.85; // living area <-> kitchen, on the KITCHEN_DIV_X wall
const VEST_DOOR_Z = -2.0, VEST_DOOR_HALF = 0.85; // living area <-> vestibule, on the VEST_DIV_X wall
const STORAGE_DOOR_Z = -3.0, STORAGE_DOOR_HALF = 0.7; // vestibule <-> storage, on the STORAGE_DIV_X wall
const RADIO_VEST_GAP_HALF = 1.3; // radio room <-> vestibule, open gap in the DIV_Z wall (no leaf, per sketch)
const MAIN_DOOR_X = 5.4; // vestibule's south (teleport) door - roughly centered in the vestibule span

let safehouseLampPivot = null, safehouseDoorPivot = null, lockedDoorPivot = null;
const NOTEBOOK_POS = {
  x: SAFEHOUSE_CENTER.x + (KITCHEN_DIV_X + 1.6),
  z: SAFEHOUSE_CENTER.z + (-2.4)
}; // living area, against the kitchen-side wall - always reachable, no quest gate
const LOCKED_DOOR_POS = {
  x: SAFEHOUSE_CENTER.x + LOCKED_DOOR_X,
  z: SAFEHOUSE_CENTER.z + DIV_Z
};
const BED_TABLE_POS = {
  x: SAFEHOUSE_CENTER.x + (LR_DIV_X + 1.35),
  z: SAFEHOUSE_CENTER.z + (SAFEHOUSE_HALF_D - 1.7)
}; // radio room, beside the cot's headboard end

// Ground-up rebuild, ported from the previous single-box safehouse. Every
// interior material still carries its own baked-in `emissive` floor - a
// genuine minimum brightness that doesn't depend on scene lighting, fog,
// vignette, or anything else ever being correct.
function safehouseMat(color, emissive, map){
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: toonRamp,
    emissive: new THREE.Color(emissive!=null ? emissive : color).multiplyScalar(0.16)
  });
  if(map) m.map = map;
  patchFogToDistance(m);
  return m;
}

// grey fluffy carpet texture - small canvas of speckled fiber noise over a
// grey base, tiled across the floor.
function makeCarpetTexture(){
  const size = 128;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#8a8a8e';
  ctx.fillRect(0,0,size,size);
  for(let i=0;i<2800;i++){
    const x = Math.random()*size, y = Math.random()*size;
    const v = 0.55 + Math.random()*0.5;
    const g = Math.floor(120*v + 20);
    ctx.fillStyle = `rgba(${g},${g},${g+3},${0.35+Math.random()*0.3})`;
    ctx.fillRect(x, y, 1, 1+Math.random());
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// featureless near-black void material for the locked room - no carpet
// texture, no baked emissive floor (unlike safehouseMat), so it genuinely
// reads as "nothing is in here" rather than just a dim normal room.
function voidMat(){
  const m = new THREE.MeshBasicMaterial({ color: 0x030204, fog:false });
  return m;
}

// --- CRT screen: animated canvas texture, not a static color ---
// Low-res canvas (chunky pixels read as period-correct rather than a
// mistake), redrawn on a throttled interval rather than every frame -
// a real CRT/broadcast image doesn't need 60fps redraw work for a
// background prop, and the throttle also gives the static bursts a
// visible held-frame feel instead of smoothing into video noise.
const CRT_W = 48, CRT_H = 36;
let crtCanvas = null, crtCtx = null, crtTexture = null, crtLight = null;
let crtNextRedraw = 0, crtHueSeed = Math.random()*1000, crtSceneSeed = Math.random()*1000;
let crtNextChannelCut = 4 + Math.random()*5, crtCutTimer = 0;

function makeCRTScreen(){
  crtCanvas = document.createElement('canvas');
  crtCanvas.width = CRT_W; crtCanvas.height = CRT_H;
  crtCtx = crtCanvas.getContext('2d', { willReadFrequently: true });
  crtTexture = new THREE.CanvasTexture(crtCanvas);
  crtTexture.magFilter = THREE.NearestFilter;
  crtTexture.minFilter = THREE.NearestFilter;
  crtTexture.generateMipmaps = false;
  const screenMat = new THREE.MeshBasicMaterial({ map:crtTexture, fog:true });
  patchFogToDistance(screenMat);
  return screenMat;
}

// draws one "frame" - a few soft moving color blobs standing in for an
// actual broadcast image (never anything legible/representational, just
// enough shifting color+motion to read as "something is playing"),
// scanlines, then a static-noise pass laid on top. staticAmt controls how
// much of the frame gets clobbered by noise per draw - low most of the
// time, briefly high during a "channel cut" so it periodically looks
// like the signal drops out and comes back on a different "channel".
function drawCRTFrame(t, staticAmt){
  const w=CRT_W, h=CRT_H;
  crtCtx.fillStyle = '#050705';
  crtCtx.fillRect(0,0,w,h);
  const hue = (crtHueSeed*41 + t*5) % 360;
  for(let i=0;i<3;i++){
    const bx = w*0.5 + Math.sin(t*0.55+i*2.1+crtSceneSeed)*w*0.3;
    const by = h*0.5 + Math.cos(t*0.4+i*1.7+crtSceneSeed)*h*0.26;
    const r = 7+Math.sin(t*0.8+i)*2+9;
    const g = crtCtx.createRadialGradient(bx,by,0,bx,by,r);
    g.addColorStop(0, `hsla(${(hue+i*67)%360},48%,52%,0.85)`);
    g.addColorStop(1, `hsla(${(hue+i*67)%360},48%,18%,0)`);
    crtCtx.fillStyle = g;
    crtCtx.fillRect(0,0,w,h);
  }
  crtCtx.fillStyle = 'rgba(0,0,0,0.22)';
  for(let y=0;y<h;y+=2) crtCtx.fillRect(0,y,w,1);
  const id = crtCtx.getImageData(0,0,w,h);
  const d = id.data;
  for(let i=0;i<d.length;i+=4){
    if(Math.random() < staticAmt){
      const v = Math.random()*255;
      d[i]=v; d[i+1]=v; d[i+2]=v;
    }
  }
  crtCtx.putImageData(id,0,0);
  crtTexture.needsUpdate = true;
  if(crtLight) crtLight.intensity = 0.35 + Math.random()*0.15 + (staticAmt>0.3 ? Math.random()*0.4 : 0);
}

function updateCRTScreen(skyClock, dt){
  if(!crtCanvas) return;
  crtCutTimer += dt;
  let staticAmt = 0.035 + Math.random()*0.05; // light persistent noise, always-on CRT grain
  if(crtCutTimer > crtNextChannelCut){
    // brief heavy-static "channel cut", then reseed the scene so the
    // simulated show visibly changes to something new
    staticAmt = 0.5 + Math.random()*0.4;
    if(crtCutTimer > crtNextChannelCut + 0.25){
      crtCutTimer = 0;
      crtNextChannelCut = 4 + Math.random()*6;
      crtHueSeed = Math.random()*1000;
      crtSceneSeed = Math.random()*1000;
    }
  }
  if(skyClock < crtNextRedraw) return;
  crtNextRedraw = skyClock + 0.09; // ~11fps redraw - deliberate, not a performance shortcut
  drawCRTFrame(skyClock, staticAmt);
}

function buildSafehouse(){
  const { x: cx, z: cz } = SAFEHOUSE_CENTER;
  const y = groundHeightAt(cx, cz);
  const group = new THREE.Group();
  group.position.set(cx, y, cz);
  scene.add(group);

  const wallMat = safehouseMat(0x716a5e, null, plasterTex);
  const frameMat = safehouseMat(0x14100c);

  function addWallSeg(lx, lz, w, d){
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, SAFEHOUSE_WALL_H, d), wallMat);
    mesh.position.set(lx, SAFEHOUSE_WALL_H/2, lz);
    group.add(mesh);
    obstacles.push({ x: cx+lx, z: cz+lz, type:'rect', hw: w/2, hd: d/2, radius: Math.hypot(w/2,d/2) });
  }
  function addWallGapX(lz, x1, x2, gapCenterX, gapHalf){
    const segAw = (gapCenterX-gapHalf) - x1;
    if(segAw > 0.01) addWallSeg(x1 + segAw/2, lz, segAw, SAFEHOUSE_WALL_T);
    const segBw = x2 - (gapCenterX+gapHalf);
    if(segBw > 0.01) addWallSeg(gapCenterX+gapHalf + segBw/2, lz, segBw, SAFEHOUSE_WALL_T);
  }
  function addWallGapZ(lx, z1, z2, gapCenterZ, gapHalf){
    const segAd = (gapCenterZ-gapHalf) - z1;
    if(segAd > 0.01) addWallSeg(lx, z1 + segAd/2, SAFEHOUSE_WALL_T, segAd);
    const segBd = z2 - (gapCenterZ+gapHalf);
    if(segBd > 0.01) addWallSeg(lx, gapCenterZ+gapHalf + segBd/2, SAFEHOUSE_WALL_T, segBd);
  }

  // ---- outer perimeter ----
  addWallSeg(0, SAFEHOUSE_HALF_D, SAFEHOUSE_HALF_W*2 + SAFEHOUSE_WALL_T*2, SAFEHOUSE_WALL_T); // north
  addWallSeg(-SAFEHOUSE_HALF_W, 0, SAFEHOUSE_WALL_T, SAFEHOUSE_HALF_D*2); // west
  addWallSeg(SAFEHOUSE_HALF_W, 0, SAFEHOUSE_WALL_T, SAFEHOUSE_HALF_D*2); // east
  // south wall - split around the vestibule's main (teleport) door
  addWallGapX(-SAFEHOUSE_HALF_D, -SAFEHOUSE_HALF_W-SAFEHOUSE_WALL_T, SAFEHOUSE_HALF_W+SAFEHOUSE_WALL_T, MAIN_DOOR_X, SAFEHOUSE_DOOR_HALF);

  // ---- DIV_Z: north rooms (locked/radio) <-> south rooms ----
  // three separate spans so we can cut the radio<->vestibule gap without
  // touching the locked-room door or the solid stretch over the kitchen
  addWallGapX(DIV_Z, -SAFEHOUSE_HALF_W, LR_DIV_X, LOCKED_DOOR_X, LOCKED_DOOR_HALF); // over locked room: sealed quest door only
  addWallGapX(DIV_Z, LR_DIV_X, VEST_DIV_X, (LR_DIV_X+VEST_DIV_X)/2, 0); // over radio room's western half, down to living area: solid
  addWallGapX(DIV_Z, VEST_DIV_X, SAFEHOUSE_HALF_W, (VEST_DIV_X+SAFEHOUSE_HALF_W)/2, RADIO_VEST_GAP_HALF); // radio room <-> vestibule: open gap

  // ---- locked room <-> radio room divider (north half only) ----
  addWallSeg(LR_DIV_X, (DIV_Z+SAFEHOUSE_HALF_D)/2, SAFEHOUSE_WALL_T, SAFEHOUSE_HALF_D-DIV_Z);

  // ---- south-half internal dividers ----
  addWallGapZ(KITCHEN_DIV_X, -SAFEHOUSE_HALF_D, DIV_Z, KITCHEN_DOOR_Z, KITCHEN_DOOR_HALF); // kitchen <-> living area
  addWallGapZ(VEST_DIV_X, -SAFEHOUSE_HALF_D, DIV_Z, VEST_DOOR_Z, VEST_DOOR_HALF); // living area <-> vestibule
  addWallGapZ(STORAGE_DIV_X, -SAFEHOUSE_HALF_D, DIV_Z, STORAGE_DOOR_Z, STORAGE_DOOR_HALF); // vestibule <-> storage

  // door frame trim for the main (teleport) entrance
  const jambH = SAFEHOUSE_WALL_H, jambW = 0.16;
  for(const side of [-1,1]){
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(jambW, jambH, SAFEHOUSE_WALL_T+0.1), frameMat);
    jamb.position.set(MAIN_DOOR_X + side*(SAFEHOUSE_DOOR_HALF-jambW/2), jambH/2, -SAFEHOUSE_HALF_D);
    group.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(SAFEHOUSE_DOOR_HALF*2+0.3, 0.3, SAFEHOUSE_WALL_T+0.15), frameMat);
  lintel.position.set(MAIN_DOOR_X, SAFEHOUSE_WALL_H-0.15, -SAFEHOUSE_HALF_D);
  group.add(lintel);

  // main door leaf - swings on a hinge pivot, same sway treatment as
  // before (updateSafehouseInterior). This is the teleport seam: stepping
  // through/near it is what updateSafehouseTransition() checks for.
  const doorW = SAFEHOUSE_DOOR_HALF*2 - 0.12, doorH = SAFEHOUSE_WALL_H - 0.35;
  safehouseDoorPivot = new THREE.Group();
  safehouseDoorPivot.position.set(MAIN_DOOR_X-(SAFEHOUSE_DOOR_HALF-jambW), doorH/2, -SAFEHOUSE_HALF_D);
  safehouseDoorPivot.rotation.y = 0.62;
  group.add(safehouseDoorPivot);
  const doorMat = safehouseMat(0x4a3f34);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), doorMat);
  doorMesh.position.set(doorW/2, 0, 0);
  safehouseDoorPivot.add(doorMesh);

  // the locked room door - sealed, void behind it. Unlike the old version
  // this one is never meant to look like ordinary boarded-up wood; it gets
  // a constant chromatic-glitch treatment in updateSafehouseInterior() (a
  // hinge pivot so the same sway/jitter code can drive it, plus per-frame
  // color/position jitter there) so the door itself telegraphs "something
  // is wrong here" even before the player tries it and gets the locked
  // response (tryLockedDoor(), unchanged).
  const lockedDoorW = LOCKED_DOOR_HALF*2-0.1, lockedDoorH = SAFEHOUSE_WALL_H-0.3;
  lockedDoorPivot = new THREE.Group();
  lockedDoorPivot.position.set(LOCKED_DOOR_X, lockedDoorH/2, DIV_Z);
  group.add(lockedDoorPivot);
  const lockedDoorMat = new THREE.MeshBasicMaterial({ color:0x8a5ac0, fog:false });
  const lockedDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(lockedDoorW, lockedDoorH, 0.08), lockedDoorMat);
  lockedDoorPivot.add(lockedDoorMesh);
  const braceMat = safehouseMat(0x1c150e, 0x0e0a06);
  for(const rot of [0.55, -0.55]){
    const brace = new THREE.Mesh(new THREE.BoxGeometry(lockedDoorW*1.05, 0.1, 0.1), braceMat);
    brace.position.set(0, 0, 0.05);
    brace.rotation.z = rot;
    lockedDoorPivot.add(brace);
  }
  obstacles.push({ x: cx+LOCKED_DOOR_X, z: cz+DIV_Z, type:'rect', hw: lockedDoorW/2, hd: 0.1, radius: lockedDoorW/2 });

  // windows - west wall (locked room, cosmetic only - nothing to see
  // beyond it since that room is a sealed void) and east wall (radio room)
  function addWindow(lx, lz, facingX){
    const winW = 1.0, winH = 1.1;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(facingX?0.08:winW+0.14, winH+0.14, facingX?winW+0.14:0.08), frameMat);
    frame.position.set(lx, 1.55, lz);
    group.add(frame);
    const paneMat = new THREE.MeshBasicMaterial({
      color:0x8fa8b5, transparent:true, opacity:0.22, side:THREE.DoubleSide, fog:false, depthWrite:false
    });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), paneMat);
    pane.position.set(lx + (facingX?facingX*0.05:0), 1.55, lz + (facingX?0:0.05));
    if(facingX) pane.rotation.y = Math.PI/2;
    group.add(pane);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(facingX?0.03:0.04, winH, facingX?0.04:0.03), frameMat);
    barV.position.copy(pane.position);
    group.add(barV);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(facingX?0.03:winW, 0.04, facingX?winW:0.03), frameMat);
    barH.position.copy(pane.position);
    group.add(barH);
  }
  addWindow(SAFEHOUSE_HALF_W-0.02, SAFEHOUSE_HALF_D-2.2, 1); // east wall, radio room

  // floor - grey fluffy carpet across every room EXCEPT the locked room,
  // which gets its own void floor (see below) instead
  const carpetTex = makeCarpetTexture();
  carpetTex.repeat.set(SAFEHOUSE_HALF_W*1.1, SAFEHOUSE_HALF_D*1.1);
  const floorMat = safehouseMat(0x8a8a8e);
  floorMat.map = carpetTex;
  floorMat.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SAFEHOUSE_HALF_W*2+0.4, SAFEHOUSE_HALF_D*2+0.4), floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.02;
  group.add(floor);

  // locked room void floor - overlays the carpet in that room's footprint
  // with the same featureless near-black material as the walls would use
  // if we bothered lighting them (we don't - see below), so the room reads
  // as an absence rather than a normal dim room.
  {
    const lrW = (LR_DIV_X - (-SAFEHOUSE_HALF_W)), lrD = (SAFEHOUSE_HALF_D - DIV_Z);
    const lrCX = -SAFEHOUSE_HALF_W + lrW/2, lrCZ = DIV_Z + lrD/2;
    const voidFloor = new THREE.Mesh(new THREE.PlaneGeometry(lrW+0.1, lrD+0.1), voidMat());
    voidFloor.rotation.x = -Math.PI/2;
    voidFloor.position.set(lrCX, 0.03, lrCZ);
    group.add(voidFloor);
    // no roof, no lights, nothing else placed in this footprint on purpose
  }

  // roof - closes every room off visually from above except the locked
  // room, which is left open/dark on purpose (nothing to see up there
  // either - nothing is rendered as "sky" through it since there's no
  // real opening, just an absence of a roof plane, matching the void floor)
  {
    const roofW = SAFEHOUSE_HALF_W*2+0.5;
    const roofFullD = SAFEHOUSE_HALF_D - DIV_Z + 0.5; // south half, full width
    const roofSouth = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.25, roofFullD), frameMat);
    roofSouth.position.set(0, SAFEHOUSE_WALL_H+0.12, (-SAFEHOUSE_HALF_D + DIV_Z)/2);
    group.add(roofSouth);
    const radioRoofW = SAFEHOUSE_HALF_W - LR_DIV_X + 0.3;
    const radioRoofD = SAFEHOUSE_HALF_D - DIV_Z + 0.5;
    const roofRadio = new THREE.Mesh(new THREE.BoxGeometry(radioRoofW, 0.25, radioRoofD), frameMat);
    roofRadio.position.set(LR_DIV_X + radioRoofW/2, SAFEHOUSE_WALL_H+0.12, DIV_Z + radioRoofD/2 - 0.25);
    group.add(roofRadio);
  }

  // furniture materials - woodMat/tabletopMat now carry the same
  // woodPlankTex used for the bridge deck (this round's fix for the
  // "living area is still all flat color" item - these two materials
  // are shared across every room's wood furniture, not just the living
  // area, so this one change also texturizes the radio room's tables/
  // desk, the kitchen's cabinet doors, and the nightstand/shelf)
  const woodMat = safehouseMat(0x241a10, 0x1a1209, woodPlankTex);
  const mattressMat = safehouseMat(0xa89e88, 0x4a4432, fabricTex);
  const blanketMat = safehouseMat(0x7a2222, 0x3a0f0f, fabricTex);
  const pillowMat = safehouseMat(0xe0d8c8, 0x5c563e, fabricTex);
  const tabletopMat = safehouseMat(0x513c26, 0x33210f, woodPlankTex);

  // --- cot: headboard + frame + four legs + mattress + blanket + pillow ---
  // now in the radio room, NW corner, against the locked-room wall (per sketch)
  const cotX = LR_DIV_X+1.35, cotZ = SAFEHOUSE_HALF_D-1.4;
  const cotW = 2.0, cotD = 1.0, cotLegH = 0.34;
  for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, cotLegH, 0.08), woodMat);
    leg.position.set(cotX+dx*(cotW/2-0.09), cotLegH/2, cotZ+dz*(cotD/2-0.09));
    group.add(leg);
  }
  const cotFrame = new THREE.Mesh(new THREE.BoxGeometry(cotW, 0.09, cotD), woodMat);
  cotFrame.position.set(cotX, cotLegH+0.045, cotZ);
  group.add(cotFrame);
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(cotW, 0.6, 0.07), woodMat);
  headboard.position.set(cotX, cotLegH+0.09+0.3, cotZ-cotD/2+0.03);
  group.add(headboard);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(cotW-0.1, 0.18, cotD-0.1), mattressMat);
  mattress.position.set(cotX, cotLegH+0.09+0.09, cotZ);
  group.add(mattress);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(cotW-0.14, 0.11, cotD-0.16), blanketMat);
  blanket.position.set(cotX+0.06, cotLegH+0.09+0.18+0.055, cotZ+0.04);
  group.add(blanket);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(cotW*0.28, 0.15, cotD*0.42), pillowMat);
  pillow.position.set(cotX-cotW/2+cotW*0.19, cotLegH+0.09+0.18+0.075, cotZ-cotD/2+cotD*0.24);
  pillow.rotation.y = 0.12;
  group.add(pillow);

  // --- bedside table (nightstand) - the "check the bed table" interactable ---
  {
    const ntX = BED_TABLE_POS.x - cx, ntZ = BED_TABLE_POS.z - cz;
    const ntW = 0.5, ntD = 0.4, ntLegH = 0.5, ntTopH = 0.05;
    for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, ntLegH, 0.05), woodMat);
      leg.position.set(ntX+dx*(ntW/2-0.05), ntLegH/2, ntZ+dz*(ntD/2-0.05));
      group.add(leg);
    }
    const ntTop = new THREE.Mesh(new THREE.BoxGeometry(ntW, ntTopH, ntD), tabletopMat);
    ntTop.position.set(ntX, ntLegH+ntTopH/2, ntZ);
    group.add(ntTop);
    const drawerFace = new THREE.Mesh(new THREE.BoxGeometry(ntW-0.06, 0.16, 0.03), woodMat);
    drawerFace.position.set(ntX, ntLegH-0.12, ntZ+ntD/2-0.015);
    group.add(drawerFace);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), safehouseMat(0x8a7a5a, 0x2a2010));
    knob.position.set(ntX, ntLegH-0.12, ntZ+ntD/2);
    group.add(knob);
  }

  // --- radio room centerpiece: X-arranged table modules + 4 chairs ---
  // per the sketch (small diamond of tables with a chair on each outer
  // point), built as one small table+chair module repeated at 90-degree
  // rotations around a shared center point.
  {
    const centerX = (LR_DIV_X+SAFEHOUSE_HALF_W)/2 + 1.5, centerZ = DIV_Z + (SAFEHOUSE_HALF_D-DIV_Z)/2;
    function xTableModule(angle){
      const mod = new THREE.Group();
      mod.position.set(centerX, 0, centerZ);
      mod.rotation.y = angle;
      const tW = 0.55, tD = 0.4, legH = 0.48, topH = 0.05, reach = 0.65;
      for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, legH, 0.05), woodMat);
        leg.position.set(dx*(tW/2-0.05), legH/2, reach+dz*(tD/2-0.05));
        mod.add(leg);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(tW, topH, tD), tabletopMat);
      top.position.set(0, legH+topH/2, reach);
      mod.add(top);
      // chair, one step further out along the same radial spoke
      const seatH = 0.46, seatSize = 0.36, chairReach = reach+0.55;
      for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, seatH, 0.045), woodMat);
        leg.position.set(dx*(seatSize/2-0.045), seatH/2, chairReach+dz*(seatSize/2-0.045));
        mod.add(leg);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(seatSize, 0.05, seatSize), woodMat);
      seat.position.set(0, seatH, chairReach);
      mod.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(seatSize, 0.4, 0.05), woodMat);
      back.position.set(0, seatH+0.22, chairReach+seatSize/2-0.03);
      mod.add(back);
      group.add(mod);
    }
    for(const angle of [Math.PI/4, Math.PI*0.75, Math.PI*1.25, Math.PI*1.75]) xTableModule(angle);
  }

  // --- radio room dressing: small desk + boxy radio set + antenna, NE
  // corner, purely decorative (the actual interactive radio pickup lives
  // elsewhere - see systems/radio.js - this is just set-dressing so the
  // room reads as a station office) ---
  {
    const deskX = SAFEHOUSE_HALF_W-1.3, deskZ = SAFEHOUSE_HALF_D-1.2;
    const deskW = 1.3, deskD = 0.55, deskLegH = 0.46, deskTopH = 0.05;
    for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, deskLegH, 0.06), woodMat);
      leg.position.set(deskX+dx*(deskW/2-0.06), deskLegH/2, deskZ+dz*(deskD/2-0.06));
      group.add(leg);
    }
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(deskW, deskTopH, deskD), tabletopMat);
    deskTop.position.set(deskX, deskLegH+deskTopH/2, deskZ);
    group.add(deskTop);
    const setMat = safehouseMat(0x2c2a26, 0x18160f);
    const radioSet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.3), setMat);
    radioSet.position.set(deskX-0.35, deskLegH+deskTopH+0.13, deskZ);
    group.add(radioSet);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.02,10), safehouseMat(0xc9a35a, 0x4a3a10));
    dial.rotation.x = Math.PI/2;
    dial.position.set(deskX-0.35, deskLegH+deskTopH+0.27, deskZ+0.12);
    group.add(dial);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.012,0.6,6), setMat);
    antenna.position.set(deskX-0.5, deskLegH+deskTopH+0.26+0.3, deskZ-0.08);
    group.add(antenna);

    // --- 90's office pass: the radio room reads as a monitoring
    // station now, not just another wood-furnished room. CRT monitor +
    // keyboard on the same desk, a beige filing cabinet against the
    // nearby wall, and a corkboard with pinned paperwork above the desk. ---
    const beigeMat = safehouseMat(0xc9c2a8, 0x4c4838);
    const crtMat = safehouseMat(0xd8d4c4, 0x504c3c);
    const screenMat = makeCRTScreen(); // animated static + simulated "show" - see updateCRTScreen()

    // CRT monitor, boxy deep-bodied shape typical of the era
    const crtX = deskX+0.15, crtZ = deskZ-0.05;
    const crtBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), crtMat);
    crtBody.position.set(crtX, deskLegH+deskTopH+0.15, crtZ);
    group.add(crtBody);
    const crtScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.2), screenMat);
    crtScreen.position.set(crtX, deskLegH+deskTopH+0.16, crtZ+0.171);
    group.add(crtScreen);
    // faint colored glow thrown from the screen onto the desk/room - most
    // of its visible flicker comes from updateCRTScreen() varying its
    // intensity each redraw, not from anything animated here
    crtLight = new THREE.PointLight(0x6ec48a, 0.4, 2.2, 2);
    crtLight.position.set(crtX, deskLegH+deskTopH+0.16, crtZ+0.3);
    group.add(crtLight);
    const crtBase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.2), beigeMat);
    crtBase.position.set(crtX, deskLegH+deskTopH+0.015, crtZ);
    group.add(crtBase);

    // low-profile keyboard, angled toward the chair side
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.12), beigeMat);
    kb.position.set(crtX, deskLegH+deskTopH+0.015, crtZ+0.28);
    group.add(kb);

    // filing cabinet - two-drawer, against the east wall near the desk
    {
      const fcX = SAFEHOUSE_HALF_W-0.32, fcZ = deskZ-1.1;
      const fcW = 0.42, fcD = 0.42, fcH = 0.66;
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(fcW, fcH, fcD), beigeMat);
      cabinet.position.set(fcX, fcH/2, fcZ);
      group.add(cabinet);
      const drawerMat = safehouseMat(0xb0a888, 0x3c3828);
      for(const [i, dy] of [[0, fcH*0.72],[1, fcH*0.28]]){
        const drawer = new THREE.Mesh(new THREE.BoxGeometry(fcW-0.05, fcH*0.4, 0.02), drawerMat);
        drawer.position.set(fcX, dy, fcZ+fcD/2-0.005);
        group.add(drawer);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), safehouseMat(0x2c2a26, 0x151310));
        handle.position.set(fcX, dy, fcZ+fcD/2+0.01);
        group.add(handle);
      }
    }

    // corkboard mounted on the wall above/behind the desk
    {
      const cbW = 0.7, cbH = 0.5;
      const corkMat = new THREE.MeshToonMaterial({ map:corkboardTex, color:0xffffff, gradientMap:toonRamp });
      patchFogToDistance(corkMat);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(cbW, cbH), corkMat);
      board.position.set(deskX-0.3, 1.9, SAFEHOUSE_HALF_D-SAFEHOUSE_WALL_T-0.02);
      board.rotation.y = Math.PI;
      group.add(board);
    }
  }

  // --- living area: notebook table + shelf (relocated from the old
  // closet/nook layout - both now live in the hub room, always reachable) ---
  const tableX = KITCHEN_DIV_X+1.6, tableZ = -2.4;
  const tableW = 0.9, tableD = 0.6, tableLegH = 0.5, tableTopH = 0.06;
  for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, tableLegH, 0.06), woodMat);
    leg.position.set(tableX+dx*(tableW/2-0.06), tableLegH/2, tableZ+dz*(tableD/2-0.06));
    group.add(leg);
  }
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(tableW, tableTopH, tableD), tabletopMat);
  tableTop.position.set(tableX, tableLegH+tableTopH/2, tableZ);
  group.add(tableTop);
  const tableSurfaceY = tableLegH + tableTopH;

  const chairX = tableX, chairZ = tableZ+0.55;
  const seatH = 0.46, seatSize = 0.4;
  for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, seatH, 0.05), woodMat);
    leg.position.set(chairX+dx*(seatSize/2-0.05), seatH/2, chairZ+dz*(seatSize/2-0.05));
    group.add(leg);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatSize, 0.05, seatSize), woodMat);
  seat.position.set(chairX, seatH, chairZ);
  group.add(seat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(seatSize, 0.42, 0.05), woodMat);
  chairBack.position.set(chairX, seatH+0.24, chairZ-seatSize/2+0.03);
  group.add(chairBack);

  const shelfX = KITCHEN_DIV_X+0.18, shelfZ = tableZ-1.3, shelfY = 1.9;
  const shelfLen = 1.4, shelfDepth = 0.28;
  const shelfTop = new THREE.Mesh(new THREE.BoxGeometry(shelfDepth, 0.05, shelfLen), tabletopMat);
  shelfTop.position.set(shelfX, shelfY, shelfZ);
  group.add(shelfTop);
  for(const s of [-1,1]){
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(shelfDepth*0.8, 0.05, 0.05), woodMat);
    bracket.rotation.z = Math.PI/4;
    bracket.position.set(shelfX+0.02, shelfY-0.12, shelfZ+s*(shelfLen/2-0.1));
    group.add(bracket);
  }
  for(let i=0;i<4;i++){
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22+Math.random()*0.06, 0.05+Math.random()*0.03),
      safehouseMat(new THREE.Color().setHSL(0.06+Math.random()*0.05, 0.3, 0.28+Math.random()*0.1).getHex()));
    book.position.set(shelfX+0.02, shelfY+0.14, shelfZ-0.5+i*0.16);
    book.rotation.y = (Math.random()-0.5)*0.15;
    group.add(book);
  }

  // the notebook - manual save, on the living-area table
  const notebookMat = safehouseMat(0x6a4a35, 0x3a2818);
  const notebook = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.26), notebookMat);
  notebook.position.set(tableX-0.1, tableSurfaceY+0.03, tableZ+0.05);
  notebook.rotation.y = 0.3;
  group.add(notebook);
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.32,6), safehouseMat(0xb8956a, 0x4a3a20));
  pencil.rotation.z = Math.PI/2 - 0.35;
  pencil.position.set(tableX+0.14, tableSurfaceY+0.045, tableZ-0.02);
  group.add(pencil);

  // --- kitchen: real appliances now, not just a box counter. Textured
  // tile counter/backsplash, cabinet doors with handles, a sink with a
  // faucet, a stove with burner coils + oven window + control knobs, a
  // worn-metal fridge, and its own light so it isn't just lit by spill
  // from the living area anymore. ---
  {
    const kX = -SAFEHOUSE_HALF_W+2.0, kZ = -SAFEHOUSE_HALF_D+1.4;
    const tileMat = new THREE.MeshToonMaterial({ map:tileTex, color:0xffffff, gradientMap:toonRamp });
    patchFogToDistance(tileMat);
    const applianceMat = safehouseMat(0xc4c4c8, 0x3c3c40, metalTex); // enamel white-ish, worn metal texture underneath
    const applianceMat2 = new THREE.MeshToonMaterial({ map:metalTex, color:0xb8b8bc, gradientMap:toonRamp });
    patchFogToDistance(applianceMat2);
    const darkTrimMat = safehouseMat(0x1c1a18, 0x0e0c0a);

    // cabinet base + tiled countertop
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 0.6), woodMat);
    counter.position.set(kX, 0.45, kZ);
    group.add(counter);
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.66), tileMat);
    counterTop.position.set(kX, 0.93, kZ);
    group.add(counterTop);
    // two cabinet doors on the counter face, with handles
    for(const dx of [-0.48, 0.48]){
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.7, 0.02), woodMat);
      door.position.set(kX+dx, 0.42, kZ+0.31);
      group.add(door);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), darkTrimMat);
      handle.position.set(kX+dx+(dx<0?0.32:-0.32), 0.42, kZ+0.33);
      group.add(handle);
    }
    // tile backsplash along the wall behind the counter
    const backsplash = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 0.04), tileMat);
    backsplash.position.set(kX, 0.93+0.3, kZ-0.31);
    group.add(backsplash);

    // sink - recessed basin (dark interior box) + rim + gooseneck faucet
    const sinkX = kX-0.55;
    const basin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.4), darkTrimMat);
    basin.position.set(sinkX, 0.93-0.05, kZ);
    group.add(basin);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.46), applianceMat2);
    rim.position.set(sinkX, 0.955, kZ);
    group.add(rim);
    const faucetBase = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.22,6), applianceMat2);
    faucetBase.position.set(sinkX, 0.95+0.11, kZ-0.16);
    group.add(faucetBase);
    const faucetArc = new THREE.Mesh(new THREE.TorusGeometry(0.09,0.015,6,10,Math.PI), applianceMat2);
    faucetArc.rotation.z = Math.PI/2;
    faucetArc.position.set(sinkX, 0.95+0.22, kZ-0.07);
    group.add(faucetArc);

    // stove - separate unit to the right of the sink: cooktop w/ 4 burner
    // coils, an oven door with a dark window, and a control-knob row
    const stoveX = kX+0.62;
    const stoveBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.58), applianceMat);
    stoveBody.position.set(stoveX, 0.45, kZ);
    group.add(stoveBody);
    for(const [bx,bz] of [[-0.11,-0.13],[0.11,-0.13],[-0.11,0.13],[0.11,0.13]]){
      const burner = new THREE.Mesh(new THREE.TorusGeometry(0.055,0.012,6,10), darkTrimMat);
      burner.rotation.x = Math.PI/2;
      burner.position.set(stoveX+bx, 0.935, kZ+bz);
      group.add(burner);
    }
    const ovenDoor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.03), applianceMat);
    ovenDoor.position.set(stoveX, 0.35, kZ+0.29);
    group.add(ovenDoor);
    const ovenWindow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.01), darkTrimMat);
    ovenWindow.position.set(stoveX, 0.46, kZ+0.31);
    group.add(ovenWindow);
    for(let i=0;i<4;i++){
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.03,8), darkTrimMat);
      knob.rotation.x = Math.PI/2;
      knob.position.set(stoveX-0.17+i*0.11, 0.62, kZ+0.3);
      group.add(knob);
    }

    // fridge - tall worn-metal cabinet where the old wardrobe stood,
    // door + a horizontal handle bar
    const fridgeX = kX-1.8, fridgeZ = kZ+1.7;
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.5), applianceMat2);
    fridge.position.set(fridgeX, 0.95, fridgeZ);
    group.add(fridge);
    const fridgeSeam = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.02, 0.02), darkTrimMat);
    fridgeSeam.position.set(fridgeX, 1.55, fridgeZ+0.26);
    group.add(fridgeSeam);
    const fridgeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), darkTrimMat);
    fridgeHandle.position.set(fridgeX+0.3, 1.1, fridgeZ+0.26);
    group.add(fridgeHandle);

    // small overhead light so the kitchen isn't just lit by living-area
    // spill anymore - lower intensity/range than the main hanging lamp,
    // just enough to fill this one corner
    const kitchenLight = new THREE.PointLight(0xd9c9b8, 0.9, 8, 0);
    kitchenLight.position.set(kX-0.3, SAFEHOUSE_WALL_H-0.3, kZ+0.6);
    group.add(kitchenLight);
  }

  // --- storage: shelving unit with varied supplies + the original crate
  // stack, instead of just crates alone. Same corner/anchor as before. ---
  {
    const crateMat = safehouseMat(0x3a2d1c, 0x1e160c);
    const stX = STORAGE_DIV_X+1.5, stZ = -SAFEHOUSE_HALF_D+1.6;
    for(const [dx,dz,dy] of [[-0.5,-0.4,0],[0.5,-0.3,0],[0,0.5,0],[-0.3,-0.1,0.55]]){
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.5,0.55), crateMat);
      crate.position.set(stX+dx, 0.25+dy, stZ+dz);
      crate.rotation.y = (Math.random()-0.5)*0.3;
      group.add(crate);
    }

    // heavy-duty shelving unit against the far wall - two uprights,
    // three shelf boards, and a scatter of jugs/cans/tools so the room
    // reads as an actual supply store instead of four boxes in a corner
    const shelfX = STORAGE_DIV_X+2.0, shelfZ = -SAFEHOUSE_HALF_D+0.4;
    const shelfW = 1.4, shelfDp = 0.45;
    const uprightMat = safehouseMat(0x1c1a18, 0x0e0c0a);
    for(const dx of [-shelfW/2+0.05, shelfW/2-0.05]){
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.06), uprightMat);
      upright.position.set(shelfX+dx, 1.0, shelfZ);
      group.add(upright);
    }
    const boardMat = safehouseMat(0x352616, 0x1c1409);
    const shelfHeights = [0.5, 1.05, 1.6];
    for(const sy of shelfHeights){
      const board = new THREE.Mesh(new THREE.BoxGeometry(shelfW, 0.05, shelfDp), boardMat);
      board.position.set(shelfX, sy, shelfZ);
      group.add(board);
    }
    // jugs (cylinders), cans (short cylinders), and a wrapped tool bundle,
    // scattered across the three shelves with a little jitter so it
    // doesn't read as a repeated prop grid
    const jugMat = safehouseMat(0x3a4a3c, 0x172018);
    const canMat = safehouseMat(0x6a5a3a, 0x2e2617);
    const toolMat = safehouseMat(0x2a2825, 0x141310);
    let itemSeed = 0;
    function shelfItem(sy, offset, kind){
      itemSeed++;
      const jx = shelfX - shelfW/2 + 0.22 + offset + (Math.sin(itemSeed*3.1)*0.03);
      const jz = shelfZ + (Math.cos(itemSeed*2.3)*0.06);
      if(kind==='jug'){
        const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.1,0.28,8), jugMat);
        jug.position.set(jx, sy+0.03+0.14, jz);
        group.add(jug);
      } else if(kind==='can'){
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,8), canMat);
        can.position.set(jx, sy+0.03+0.06, jz);
        group.add(can);
      } else {
        const tool = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.06,0.1), toolMat);
        tool.position.set(jx, sy+0.03+0.03, jz);
        tool.rotation.y = (Math.random()-0.5)*0.4;
        group.add(tool);
      }
    }
    shelfItem(0.5, 0.0, 'jug'); shelfItem(0.5, 0.35, 'jug'); shelfItem(0.5, 0.7, 'can');
    shelfItem(1.05, 0.05, 'can'); shelfItem(1.05, 0.3, 'can'); shelfItem(1.05, 0.55, 'tool');
    shelfItem(1.6, 0.1, 'jug'); shelfItem(1.6, 0.5, 'can');
  }

  // --- vestibule: coat rack + doormat - was completely bare before this
  // round (had its own light, `vestLight` below, but nothing to light).
  // Kept minimal since this room's real job is the teleport-pair door
  // transition, not a lived-in space. ---
  {
    const rackX = VEST_DIV_X+0.6, rackZ = -1.0;
    const rackMat = safehouseMat(0x1c1a18, 0x0e0c0a);
    const rackPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.7,8), rackMat);
    rackPole.position.set(rackX, 0.85, rackZ);
    group.add(rackPole);
    const rackBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.18,0.04,10), rackMat);
    rackBase.position.set(rackX, 0.02, rackZ);
    group.add(rackBase);
    for(const ang of [0, Math.PI*0.66, Math.PI*1.33]){
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05,0.012,5,8,Math.PI*1.3), rackMat);
      hook.position.set(rackX+Math.sin(ang)*0.03, 1.55, rackZ+Math.cos(ang)*0.03);
      hook.rotation.y = ang;
      hook.rotation.z = Math.PI*0.15;
      group.add(hook);
    }
    // one coat left hanging on a hook, reads as recently used
    const coatMat = safehouseMat(0x3a3228, 0x1c180f);
    const coat = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8, 1, true), coatMat);
    coat.position.set(rackX+0.02, 1.28, rackZ+0.02);
    group.add(coat);

    // worn doormat in front of the south (teleport) door
    const matMat = safehouseMat(0x2e2a22, 0x141210);
    const doormat = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), matMat);
    doormat.rotation.x = -Math.PI/2;
    doormat.position.set(MAIN_DOOR_X, 0.015, -SAFEHOUSE_HALF_D+0.55);
    group.add(doormat);
  }

  // lighting - one light per room roughly big enough to reach its corners,
  // all decay:0 (flat falloff, small enclosed spaces). The locked room
  // deliberately gets NONE - it's meant to read as unlit void.
  safehouseLampPivot = new THREE.Group();
  safehouseLampPivot.position.set(tableX, SAFEHOUSE_WALL_H-0.05, tableZ-0.6);
  group.add(safehouseLampPivot);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.55,5), safehouseMat(0x1c1a18, 0x100e0c));
  cord.position.y = -0.275;
  safehouseLampPivot.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.32, 10, 1, true), safehouseMat(0x3a2f22, 0x2a2010));
  shade.position.y = -0.58;
  safehouseLampPivot.add(shade);
  const lamp = new THREE.PointLight(0xffaa66, 1.8, 14, 0);
  lamp.position.y = -0.65;
  safehouseLampPivot.add(lamp);
  const glow = addGlow(group, 0xffb877, 1.6, 0.7);
  glow.position.set(safehouseLampPivot.position.x, safehouseLampPivot.position.y-0.65, safehouseLampPivot.position.z);

  const livingFill = new THREE.PointLight(0xd9c9b8, 0.7, 14, 0);
  livingFill.position.set(tableX-1, 1.9, tableZ+1);
  group.add(livingFill);

  const vestLight = new THREE.PointLight(0xc9c2b0, 0.5, 9, 0);
  vestLight.position.set(MAIN_DOOR_X, 1.8, VEST_DOOR_Z-1.5);
  group.add(vestLight);

  const storageLight = new THREE.PointLight(0xa89a80, 0.45, 7, 0);
  storageLight.position.set(STORAGE_DIV_X+1.5, 1.8, -SAFEHOUSE_HALF_D+2.0);
  group.add(storageLight);

  const bedLamp = new THREE.PointLight(0xcf9a6a, 0.5, 8, 0);
  bedLamp.position.set(cotX, 1.1, cotZ-0.3);
  group.add(bedLamp);

  const radioDeskLight = new THREE.PointLight(0xd9c9b8, 0.55, 9, 0);
  radioDeskLight.position.set(SAFEHOUSE_HALF_W-1.5, 1.9, SAFEHOUSE_HALF_D-1.5);
  group.add(radioDeskLight);

  return group;
}

/* ---------- SAFEHOUSE EXTERIOR ----------
   The small, ordinary-looking street-facing shell - a modest single-room
   radio-station building, about the size any of the streamed district's
   smaller buildings would be. This is deliberately NOT connected to the
   interior above by real geometry; its door is a teleport seam (see
   updateSafehouseTransition()). Placed a short distance from
   SAFEHOUSE_CENTER, clear of the interior's own (much bigger) footprint. */
const EXTERIOR_CENTER = { x: SAFEHOUSE_CENTER.x + 26, z: SAFEHOUSE_CENTER.z - 20 };
const EXT_HALF_W = 3.2, EXT_HALF_D = 2.6, EXT_WALL_H = 3.0, EXT_WALL_T = 0.28;
const EXT_DOOR_HALF = 0.9;
let exteriorDoorPivot = null;

function buildSafehouseExterior(){
  const { x: cx, z: cz } = EXTERIOR_CENTER;
  const y = groundHeightAt(cx, cz);
  const group = new THREE.Group();
  group.position.set(cx, y, cz);
  scene.add(group);

  const wallMat = safehouseMat(0x55504a);
  const frameMat = safehouseMat(0x14100c);
  function addWallSeg(lx, lz, w, d){
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, EXT_WALL_H, d), wallMat);
    mesh.position.set(lx, EXT_WALL_H/2, lz);
    group.add(mesh);
    obstacles.push({ x: cx+lx, z: cz+lz, type:'rect', hw: w/2, hd: d/2, radius: Math.hypot(w/2,d/2) });
  }
  // south wall, split around the door
  const segAw = (0-EXT_DOOR_HALF) - (-EXT_HALF_W-EXT_WALL_T);
  addWallSeg(-EXT_HALF_W-EXT_WALL_T+segAw/2, -EXT_HALF_D, segAw, EXT_WALL_T);
  const segBw = (EXT_HALF_W+EXT_WALL_T) - (0+EXT_DOOR_HALF);
  addWallSeg(EXT_HALF_W+EXT_WALL_T-segBw/2, -EXT_HALF_D, segBw, EXT_WALL_T);
  addWallSeg(0, EXT_HALF_D, EXT_HALF_W*2+EXT_WALL_T*2, EXT_WALL_T); // north
  addWallSeg(-EXT_HALF_W, 0, EXT_WALL_T, EXT_HALF_D*2); // west
  addWallSeg(EXT_HALF_W, 0, EXT_WALL_T, EXT_HALF_D*2); // east

  const roof = new THREE.Mesh(new THREE.BoxGeometry(EXT_HALF_W*2+0.4, 0.22, EXT_HALF_D*2+0.4), frameMat);
  roof.position.y = EXT_WALL_H + 0.11;
  group.add(roof);
  const floorMat = safehouseMat(0x3a362f);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(EXT_HALF_W*2+0.2, EXT_HALF_D*2+0.2), floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.02;
  group.add(floor);

  // small roof antenna - modest, echoes the relay-office dressing seen on
  // the rare streamed building variant, ties this back into the same
  // network without competing with the radio tower landmark
  const mastMat = safehouseMat(0x18161a, 0x0c0a0e);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.08,1.8,6), mastMat);
  mast.position.set(0, EXT_WALL_H+0.9, 0);
  group.add(mast);

  // door - swings ajar like the interior's, sways in updateSafehouseInterior
  const doorW = EXT_DOOR_HALF*2-0.1, doorH = EXT_WALL_H-0.3;
  exteriorDoorPivot = new THREE.Group();
  exteriorDoorPivot.position.set(-EXT_DOOR_HALF+0.14, doorH/2, -EXT_HALF_D);
  exteriorDoorPivot.rotation.y = 0.5;
  group.add(exteriorDoorPivot);
  const doorMat = safehouseMat(0x4a3f34);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), doorMat);
  doorMesh.position.set(doorW/2, 0, 0);
  exteriorDoorPivot.add(doorMesh);

  const doorLight = new THREE.PointLight(0xffaa66, 0.9, 8, 0);
  doorLight.position.set(0, 1.6, -EXT_HALF_D+0.3);
  group.add(doorLight);
  addGlow(group, 0xffb877, 1.2, 0.55).position.copy(doorLight.position);

  return group;
}

// the two teleport-seam trigger points, in world space. EXT_DOOR_TRIGGER is
// a couple steps south of the exterior door (where the player lands after
// exiting the interior); INT_DOOR_TRIGGER is a couple steps into the
// vestibule from the interior's main door (where the player lands after
// entering from outside). Registered below through the generic
// systems/doors.js engine (Phase 3) instead of the old bespoke
// updateSafehouseTransition() - see that file's header for why.
const EXT_DOOR_TRIGGER = { x: EXTERIOR_CENTER.x, z: EXTERIOR_CENTER.z - EXT_HALF_D - 0.6 };
const EXT_DOOR_LANDING = { x: EXTERIOR_CENTER.x, z: EXTERIOR_CENTER.z - EXT_HALF_D - 1.6, yaw: 0 }; // facing south, away from the station
const INT_DOOR_TRIGGER = { x: SAFEHOUSE_CENTER.x + MAIN_DOOR_X, z: SAFEHOUSE_CENTER.z - SAFEHOUSE_HALF_D - 0.6 };
const INT_DOOR_LANDING = { x: SAFEHOUSE_CENTER.x + MAIN_DOOR_X, z: SAFEHOUSE_CENTER.z - SAFEHOUSE_HALF_D + 1.6, yaw: Math.PI }; // facing north, into the vestibule

// brief chromatic flash on the vignette overlay to sell the transition -
// reuses the existing #vignette element (see vignetteEl/updateDread) rather
// than adding new DOM; just nudges its opacity for a few frames. Kept local
// to this file (not part of systems/doors.js) since it's presentation, not
// mechanics - the generic engine only knows to call onTeleport().
let teleportFlash = 0;
registerDoorPair({
  id: 'safehouseMain',
  aTrigger: EXT_DOOR_TRIGGER, aLanding: EXT_DOOR_LANDING,
  bTrigger: INT_DOOR_TRIGGER, bLanding: INT_DOOR_LANDING,
  radius: 1.0, cooldown: 1.2,
  onTeleport(){ teleportFlash = 1; },
});
function updateDoorFlash(dt){
  if(teleportFlash > 0){
    teleportFlash = Math.max(0, teleportFlash - dt*2.2);
    vignetteEl.style.filter = `hue-rotate(${teleportFlash*180}deg) saturate(${1+teleportFlash*2})`;
  } else if(vignetteEl.style.filter){
    vignetteEl.style.filter = '';
  }
}


// lamp swings on two overlaid slow sine waves (not a single clean pendulum -
// reads as disturbed air rather than a metronome); door has its own slower,
// smaller sway around its resting ajar angle, like it's not quite latched
function updateSafehouseInterior(skyClock, dt){
  updateCRTScreen(skyClock, dt||0.016);
  updateDoorFlash(dt||0.016);
  if(safehouseLampPivot){
    safehouseLampPivot.rotation.z = Math.sin(skyClock*0.9)*0.07 + Math.sin(skyClock*0.37)*0.03;
    safehouseLampPivot.rotation.x = Math.sin(skyClock*0.63)*0.025;
  }
  if(safehouseDoorPivot){
    safehouseDoorPivot.rotation.y = 0.62 + Math.sin(skyClock*0.22)*0.045;
  }
  if(exteriorDoorPivot){
    exteriorDoorPivot.rotation.y = 0.5 + Math.sin(skyClock*0.19)*0.04;
  }
  // locked room door - permanent, deliberately ugly chromatic-glitch
  // jitter (fast, small position stutter + a hue-cycling emissive-ish
  // color swap via material.color) so it reads as visibly wrong from
  // across the living area, not just "an old door", well before the
  // player ever gets close enough to try it.
  if(lockedDoorPivot){
    if(state.relayActive){
      // Relay's active (or the door's already been opened) - the jitter
      // was always meant to read as "this is being held shut by
      // something," so it has no reason to keep going once that
      // something's let go. Ease back to a resting, undisturbed door
      // instead of just freezing mid-glitch.
      lockedDoorPivot.position.x += (LOCKED_DOOR_X - lockedDoorPivot.position.x)*0.08;
      lockedDoorPivot.rotation.z *= 0.9;
      const mesh = lockedDoorPivot.children[0];
      if(mesh && !mesh.userData.calmed){
        mesh.userData.calmed = true;
        mesh.material.color.setHSL(0.08, 0.15, 0.12); // plain dark wood, glitch treatment retired for good
      }
      if(state.doorUnlocked){
        // Actually swings open now, same resting-ajar language the main
        // safehouse/exterior doors already use.
        const targetY = 0.9;
        lockedDoorPivot.rotation.y += (targetY - lockedDoorPivot.rotation.y)*0.04;
      }
    } else {
      const g = skyClock*13.0;
      lockedDoorPivot.position.x = LOCKED_DOOR_X + (Math.random()-0.5)*0.02;
      lockedDoorPivot.rotation.z = Math.sin(g)*0.015;
      const mesh = lockedDoorPivot.children[0];
      if(mesh && Math.random() < 0.4){
        mesh.material.color.setHSL((skyClock*0.4)%1, 0.85, 0.5+Math.sin(g*2)*0.15);
      }
    }
  }
}


export {
  buildSafehouse, buildSafehouseExterior,
  updateDoorFlash, updateSafehouseInterior,
  NOTEBOOK_POS, LOCKED_DOOR_POS, BED_TABLE_POS, SAFEHOUSE_DOOR_YAW,
  EXTERIOR_CENTER,
};
