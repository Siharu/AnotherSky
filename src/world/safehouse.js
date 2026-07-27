/* ============================================================
   world/safehouse.js — REBUILT from scratch against the
   "Opening Quest Checklist" + "Safehouse Room Layout Checklist" docs.
   Previous room layout (six-room CAD sketch: locked void / radio /
   kitchen / living / vestibule / storage) is gone. New layout follows
   the checklist's expected flow exactly:

     Wake-up room -> central hallway/common area -> TV/clue room
     -> radio/utility room -> storage/clutter room -> exit door

   Story wiring is unchanged (this file only owns geometry/props):
   the player still spawns locked in, still finds the radio, still
   reads a sticky note near the TV, still unlocks a door once
   state.relayActive/doorUnlocked flip, and the same exported
   interaction points (NOTEBOOK_POS, LOCKED_DOOR_POS, BED_TABLE_POS,
   CALENDAR_POS, STORAGE_DRAWER_POS, TV_POS/TV_YAW) still resolve to
   real props main.js's facingTarget() checks can find - just
   relocated to fit the new rooms:
     - Wake-up room IS the locked room (checklist #1: "player starts
       in a locked or unfamiliar room"). Its only door is the existing
       quest-gated door (LOCKED_DOOR_POS), unchanged mechanic.
     - Notebook (manual save) lives in the central hallway - always
       reachable, no quest gate, matches the hallway's "hub" role.
     - Calendar + storage drawer both live in the storage/clutter room
       (checklist #6: old papers, forgotten supplies, lore scraps).
     - TV + sticky note live in the TV/clue room.
     - Bed table (the "search for key" nightstand) sits beside the cot
       in the wake-up room.
   SAFEHOUSE_CENTER/HALF_W/HALF_D stay owned here (not main.js) for the
   same ES-module evaluation-order reason as before: this file reads
   them at its own top level, so they have to be assigned before any
   import of this file runs its top-level code.
   ============================================================ */
import { state } from '../core/state.js';
import { scene } from '../core/scene.js';
import { toonRamp, corkboardTex, metalTex, tileTex, woodPlankTex, fabricTex, plasterTex } from './materials.js';
import { groundHeightAt } from './terrain.js';
import { obstacles } from './worldData.js';
import { addGlow, patchFogToDistance } from '../render/postprocessing.js';
import { registerDoorPair } from '../systems/doors.js';

export const SAFEHOUSE_CENTER = { x: state.playerX, z: state.playerZ };
export const SAFEHOUSE_HALF_W = 9.0, SAFEHOUSE_HALF_D = 7.0;

const vignetteEl = document.getElementById('vignette');

/* ---------- ROOM LAYOUT ----------
   Grid: a central north-south hallway (COL_W..COL_E) spanning the full
   depth of the building, with four rooms in the corners. North/south
   split at ROW_DIV; the hallway itself has no north/south wall, so
   it reads as one continuous spine, not two halves.

     NW: wake-up room (locked, spawn)      NE: TV / clue room
                    \\        HALLWAY        /
     SW: storage / clutter room       SE: radio / utility room
                          |
                     exit door (south wall, teleport seam to exterior)

   Local coordinate notes: +x is "east", +z is "north". */
const SAFEHOUSE_WALL_H = 3.1, SAFEHOUSE_WALL_T = 0.3;
export const COL_W = -1.9, COL_E = 1.9;      // hallway's west/east walls
export const ROW_DIV = 0.0;                   // north rooms <-> south rooms

const WAKE_DOOR_Z = 2.6, WAKE_DOOR_HALF = 0.7;      // wake-up room <-> hallway (sealed, quest-gated)
const TV_DOOR_Z = 2.6, TV_DOOR_HALF = 0.85;          // TV room <-> hallway (open)
const STORAGE_DOOR_Z = -2.6, STORAGE_DOOR_HALF = 0.85; // storage <-> hallway (open)
const RADIO_DOOR_Z = -2.6, RADIO_DOOR_HALF = 0.85;   // radio room <-> hallway (open)
const MAIN_DOOR_X = 0.0; // exit door, centered on the hallway's south wall
const SAFEHOUSE_DOOR_HALF = 0.95;
const SAFEHOUSE_DOOR_YAW = -Math.PI/2; // forward=(-sin(yaw),-cos(yaw)) -> faces +X; kept for main.js's initial-facing use

let safehouseLampPivot = null, safehouseDoorPivot = null, lockedDoorPivot = null;
let interiorDoorPivots = []; // { pivot, x, z, radius, openAngle } - swing-open-on-approach interior doors
let glitchDoorMesh = null, glitchDoorWhisper = null; // radio-room anomaly panel + its faint proximity hum

const NOTEBOOK_POS = {
  // central hallway - always reachable, no quest gate, matches the
  // hallway's "hub" role in the checklist.
  x: SAFEHOUSE_CENTER.x + 0.0,
  z: SAFEHOUSE_CENTER.z + 0.4,
};
const LOCKED_DOOR_POS = {
  // the wake-up room's own door out into the hallway - this IS the
  // "outside door" the checklist's room-layout doc means (locked at
  // first, unlocks on progression); the player never sees a truly
  // exterior door until after this one opens.
  x: SAFEHOUSE_CENTER.x + (COL_W - SAFEHOUSE_WALL_T/2 - 0.02),
  z: SAFEHOUSE_CENTER.z + WAKE_DOOR_Z,
};
export const HALLWAY_SPAWN_POS = {
  // Just inside the hallway, east of the wake-up room's (locked) door -
  // NOT inside the wake-up room itself. The wake-up room is sealed/
  // quest-gated (see LOCKED_DOOR_POS above), so spawning inside it read
  // as "trapped in a room I can't leave"; the hallway is the actual hub
  // and is always open. Same z as the locked door (WAKE_DOOR_Z) so the
  // player starts facing straight at it, offset east into open hallway
  // floor clear of both the door swing and the hallway's own walls
  // (hallway spans COL_W..COL_E).
  x: SAFEHOUSE_CENTER.x + (COL_W + 1.0),
  z: SAFEHOUSE_CENTER.z + WAKE_DOOR_Z,
};
const BED_TABLE_POS = {
  // beside the cot's headboard, wake-up room
  x: SAFEHOUSE_CENTER.x + (-SAFEHOUSE_HALF_W + 2.6),
  z: SAFEHOUSE_CENTER.z + (SAFEHOUSE_HALF_D - 1.1),
};
const CALENDAR_POS = {
  // storage/clutter room - an old paper clue among the forgotten supplies
  x: SAFEHOUSE_CENTER.x + (-SAFEHOUSE_HALF_W + 1.3),
  z: SAFEHOUSE_CENTER.z + (-SAFEHOUSE_HALF_D + 1.4),
};
const STORAGE_DRAWER_POS = {
  // same room, east wall of the storage room (against the hallway divider)
  x: SAFEHOUSE_CENTER.x + (COL_W - 1.4),
  z: SAFEHOUSE_CENTER.z + (-SAFEHOUSE_HALF_D + 1.6),
};
const TV_POS = {
  // TV/clue room, against its north wall, facing back into the room
  x: SAFEHOUSE_CENTER.x + (SAFEHOUSE_HALF_W - 2.2),
  z: SAFEHOUSE_CENTER.z + (SAFEHOUSE_HALF_D - 0.6),
};
const TV_YAW = Math.PI; // faces -Z (south), back into the TV room
const CALENDAR_LAST_DAY = 23;
const GLITCH_DOOR_POS = {
  // radio/utility room, south wall, tucked behind the tool rack - stays
  // inert clutter until the player powers the console once (see
  // state.glitchDoorRevealed in updateSafehouseInterior), then reads as
  // a seam in the wall rather than a prop. Unlock condition is
  // state.hqTowerUnlocked - deliberately reusing the existing
  // relay-tower chain instead of a second counter.
  x: SAFEHOUSE_CENTER.x + (SAFEHOUSE_HALF_W - 2.6),
  z: SAFEHOUSE_CENTER.z + (-SAFEHOUSE_HALF_D + 0.16),
};

function safehouseMat(color, emissive, map){
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: toonRamp,
    emissive: new THREE.Color(emissive!=null ? emissive : color).multiplyScalar(0.16)
  });
  if(map) m.map = map;
  patchFogToDistance(m);
  return m;
}

// pivot: THREE.Group already positioned so its ORIGIN sits at the hinge
//   edge (three.js convention used by this file already for the main
//   exit door - pivot.position is the hinge line, and the leaf itself
//   is offset away from it, not centered on it, so rotating pivot.
//   rotation.y swings around a real hinge instead of the door's middle).
// leafDir: +1 or -1, which way the leaf extends away from that hinge
//   edge along the pivot's local X axis.
// parentGroup: the static building group the pivot was added to -
//   hinge barrels are visual-only and mount here, not on the pivot,
//   same as real hinges stay on the frame rather than the door itself.
function buildDetailedDoor({ pivot, parentGroup, doorW, doorH, baseColor, leafDir = 1 }){
  const doorMatL = safehouseMat(baseColor);
  const panelMat = safehouseMat(new THREE.Color(baseColor).offsetHSL(0, 0, 0.06).getHex());
  const barMat = safehouseMat(new THREE.Color(baseColor).offsetHSL(0, 0, -0.08).getHex());
  const backPanelMat = safehouseMat(new THREE.Color(baseColor).offsetHSL(0, 0, -0.04).getHex());
  const backTrimMat = safehouseMat(new THREE.Color(baseColor).offsetHSL(0, 0, -0.14).getHex());
  const knobMat = safehouseMat(0xbdb7ab, 0x2a2824);

  const centerX = leafDir * doorW/2; // leaf's own center, offset away from the hinge at x=0

  // main slab
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), doorMatL);
  doorMesh.position.set(centerX, 0, 0);
  pivot.add(doorMesh);

  // three raised front panels (top/mid/bottom) + two vertical stiles,
  // same layout family as a standard 6-panel door, scaled to doorW/doorH
  const pw = doorW*0.78, ph1 = doorH*0.26, ph2 = doorH*0.23;
  const panelYs = [doorH*0.32, 0, -doorH*0.32];
  const panelHs = [ph1, ph2, ph1];
  for(let i=0;i<3;i++){
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw, panelHs[i], 0.03), panelMat);
    p.position.set(centerX, panelYs[i], 0.056);
    pivot.add(p);
  }
  const stileW = doorW*0.09;
  for(const sx of [-1,1]){
    const bar = new THREE.Mesh(new THREE.BoxGeometry(stileW, doorH*0.9, 0.025), barMat);
    bar.position.set(centerX + sx*doorW*0.36, 0, 0.062);
    pivot.add(bar);
  }

  // back-face detail so the reverse side doesn't read as a bare slab
  // once the door is open and the player sees the inside
  for(let i=0;i<3;i++){
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw*0.96, panelHs[i]*0.95, 0.02), backPanelMat);
    p.position.set(centerX, panelYs[i], -0.056);
    pivot.add(p);
  }
  const backStile = new THREE.Mesh(new THREE.BoxGeometry(doorW*0.05, doorH*0.86, 0.012), backTrimMat);
  backStile.position.set(centerX, 0, -0.066);
  pivot.add(backStile);

  // knob - mounted near the edge opposite the hinge (far end of the leaf)
  const knobX = leafDir * (doorW - doorW*0.12);
  const knobY = -(doorH*0.5 - doorH*0.32); // roughly waist height regardless of door scale
  const knobGroup = new THREE.Group();
  knobGroup.position.set(knobX, knobY, 0.07);
  pivot.add(knobGroup);
  const backplate = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.02,16), knobMat);
  backplate.rotation.x = Math.PI/2;
  knobGroup.add(backplate);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06,12,12), knobMat);
  knob.position.set(0.08*leafDir, 0, 0.02);
  knobGroup.add(knob);
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.02,0.02), knobMat);
  latch.position.set(-0.015*leafDir, 0, 0.02);
  knobGroup.add(latch);

  // hinge barrels, static on the frame side at the pivot's own hinge
  // line (local x=0) - three spaced along the door's height
  const hingeMat = safehouseMat(0xaea597, 0x2a2824);
  for(const t of [0.22, 0.5, 0.78]){
    const hy = doorH*(0.5-t);
    const g = new THREE.Group();
    g.position.set(pivot.position.x, pivot.position.y + hy, pivot.position.z);
    g.rotation.y = pivot.rotation.y;
    parentGroup.add(g);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, doorH*0.09, 0.1), hingeMat);
    g.add(plate);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018, doorH*0.11, 10), hingeMat);
    pin.rotation.x = Math.PI/2;
    g.add(pin);
  }
  return doorMesh;
}

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

// featureless near-black void material for the wake-up room's locked
// door glitch treatment reference (the room itself is normal now - only
// the door face reads as "wrong" - see wrongSeamMesh below).
function voidMat(){
  return new THREE.MeshBasicMaterial({ color: 0x030204, fog:false });
}

// --- CRT screen: animated canvas texture ---
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
  let staticAmt = 0.035 + Math.random()*0.05;
  if(crtCutTimer > crtNextChannelCut){
    staticAmt = 0.5 + Math.random()*0.4;
    if(crtCutTimer > crtNextChannelCut + 0.25){
      crtCutTimer = 0;
      crtNextChannelCut = 4 + Math.random()*6;
      crtHueSeed = Math.random()*1000;
      crtSceneSeed = Math.random()*1000;
    }
  }
  if(skyClock < crtNextRedraw) return;
  crtNextRedraw = skyClock + 0.09;
  drawCRTFrame(skyClock, staticAmt);
}

function buildSafehouse(){
  interiorDoorPivots = [];
  const { x: cx, z: cz } = SAFEHOUSE_CENTER;
  const y = groundHeightAt(cx, cz);
  const group = new THREE.Group();
  group.position.set(cx, y, cz);
  scene.add(group);

  const wallMat = safehouseMat(0x716a5e, null, plasterTex);
  const frameMat = safehouseMat(0x14100c);
  const woodMat = safehouseMat(0x241a10, 0x1a1209, woodPlankTex);
  const tabletopMat = safehouseMat(0x513c26, 0x33210f, woodPlankTex);
  const braceMat = safehouseMat(0x1c150e, 0x0e0a06);
  const doorMat = safehouseMat(0x4a3f34);

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
  // south wall - split around the exit door (checklist #7: visible early, locked feedback lives in main.js/doors state)
  addWallGapX(-SAFEHOUSE_HALF_D, -SAFEHOUSE_HALF_W-SAFEHOUSE_WALL_T, SAFEHOUSE_HALF_W+SAFEHOUSE_WALL_T, MAIN_DOOR_X, SAFEHOUSE_DOOR_HALF);

  // ---- hallway west wall: wake-up room (sealed door) / storage room (open) ----
  addWallGapZ(COL_W, ROW_DIV, SAFEHOUSE_HALF_D, WAKE_DOOR_Z, WAKE_DOOR_HALF);
  addWallGapZ(COL_W, -SAFEHOUSE_HALF_D, ROW_DIV, -STORAGE_DOOR_Z, STORAGE_DOOR_HALF);

  // ---- hallway east wall: TV room (open) / radio room (open) ----
  addWallGapZ(COL_E, ROW_DIV, SAFEHOUSE_HALF_D, TV_DOOR_Z, TV_DOOR_HALF);
  addWallGapZ(COL_E, -SAFEHOUSE_HALF_D, ROW_DIV, -RADIO_DOOR_Z, RADIO_DOOR_HALF);

  // ---- north/south room divider walls (outside the hallway span only) ----
  addWallSeg(-(SAFEHOUSE_HALF_W+COL_W)/2, ROW_DIV, (COL_W-(-SAFEHOUSE_HALF_W)), SAFEHOUSE_WALL_T); // wake-up <-> storage divider
  addWallSeg((SAFEHOUSE_HALF_W+COL_E)/2, ROW_DIV, (SAFEHOUSE_HALF_W-COL_E), SAFEHOUSE_WALL_T); // TV <-> radio divider

  // door frame trim for the exit
  const jambH = SAFEHOUSE_WALL_H, jambW = 0.16;
  for(const side of [-1,1]){
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(jambW, jambH, SAFEHOUSE_WALL_T+0.1), frameMat);
    jamb.position.set(MAIN_DOOR_X + side*(SAFEHOUSE_DOOR_HALF-jambW/2), jambH/2, -SAFEHOUSE_HALF_D);
    group.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(SAFEHOUSE_DOOR_HALF*2+0.3, 0.3, SAFEHOUSE_WALL_T+0.15), frameMat);
  lintel.position.set(MAIN_DOOR_X, SAFEHOUSE_WALL_H-0.15, -SAFEHOUSE_HALF_D);
  group.add(lintel);

  const doorW = SAFEHOUSE_DOOR_HALF*2 - 0.12, doorH = SAFEHOUSE_WALL_H - 0.35;
  safehouseDoorPivot = new THREE.Group();
  safehouseDoorPivot.position.set(MAIN_DOOR_X-(SAFEHOUSE_DOOR_HALF-jambW), doorH/2, -SAFEHOUSE_HALF_D);
  safehouseDoorPivot.rotation.y = 0.62;
  group.add(safehouseDoorPivot);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), doorMat);
  doorMesh.position.set(doorW/2, 0, 0);
  safehouseDoorPivot.add(doorMesh);

  // ---- wake-up room's sealed door (checklist #1/#8: locked at start,
  // unlock is a real progression reward). Kept as a hinge pivot with the
  // same chromatic-glitch treatment as before (see updateSafehouseInterior)
  // so the player reads "something is wrong here" before ever trying it.
  const lockedDoorW = WAKE_DOOR_HALF*2-0.1, lockedDoorH = SAFEHOUSE_WALL_H-0.3;
  // doorframe - jambs + lintel, static (mounted to the wall, not the
  // swinging pivot) - same pattern as the main exit door frame above
  const knobMat = safehouseMat(0x2a2a2c, 0x0a0a0a);
  for(const side of [-1,1]){
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, SAFEHOUSE_WALL_H, SAFEHOUSE_WALL_T+0.08), frameMat);
    jamb.position.set(COL_W, SAFEHOUSE_WALL_H/2, WAKE_DOOR_Z + side*(lockedDoorW/2+0.07));
    group.add(jamb);
  }
  const lockedLintel = new THREE.Mesh(new THREE.BoxGeometry(SAFEHOUSE_WALL_T+0.12, lockedDoorW+0.28, SAFEHOUSE_WALL_H-lockedDoorH+0.06), frameMat);
  // note: lintel spans the Z axis here since this doorway is cut into an
  // X-facing wall (COL_W), not a Z-facing one like the main exit
  lockedLintel.position.set(COL_W, SAFEHOUSE_WALL_H - (SAFEHOUSE_WALL_H-lockedDoorH)/2 + 0.02, WAKE_DOOR_Z);
  group.add(lockedLintel);

  lockedDoorPivot = new THREE.Group();
  lockedDoorPivot.position.set(COL_W, lockedDoorH/2, WAKE_DOOR_Z);
  group.add(lockedDoorPivot);
  // child[0] is what updateSafehouseInterior flashes/shakes for the
  // glitch effect - kept small (a single warped seam down the door)
  // instead of covering the whole face, so the "wrongness" reads as one
  // unsettling detail rather than the entire door strobing color.
  const wrongSeamMat = new THREE.MeshBasicMaterial({ color:0x8a5ac0, fog:false });
  const wrongSeamMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, lockedDoorH*0.82, 0.03), wrongSeamMat);
  wrongSeamMesh.position.set(lockedDoorW*0.14, 0, 0.075);
  lockedDoorPivot.add(wrongSeamMesh);
  // the actual door face - plain static wood, always visible
  const lockedDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(lockedDoorW, lockedDoorH, 0.08), doorMat);
  lockedDoorPivot.add(lockedDoorMesh);
  // doorknob, mounted on the leaf so it swings with the door once unlocked
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), knobMat);
  knob.position.set(lockedDoorW/2 - 0.15, -(lockedDoorH*0.5 - 0.9), 0.07);
  lockedDoorPivot.add(knob);
  const knobPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.02,8), knobMat);
  knobPlate.rotation.x = Math.PI/2;
  knobPlate.position.copy(knob.position); knobPlate.position.z -= 0.02;
  lockedDoorPivot.add(knobPlate);
  // recessed panel frame - two stacked rectangular outlines (top/bottom
  // panel), the classic 2-panel door silhouette, sitting just proud of
  // the slab face
  const panelInset = 0.09, panelGapY = 0.14, panelStripW = 0.05;
  function addPanelOutline(cyTop, cyBot){
    const w = lockedDoorW - panelInset*2, h = cyTop - cyBot;
    // four strips forming a rectangle border
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, panelStripW, 0.025), braceMat);
    top.position.set(0, cyTop, 0.055);
    lockedDoorPivot.add(top);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(w, panelStripW, 0.025), braceMat);
    bot.position.set(0, cyBot, 0.055);
    lockedDoorPivot.add(bot);
    const left = new THREE.Mesh(new THREE.BoxGeometry(panelStripW, h, 0.025), braceMat);
    left.position.set(-w/2, (cyTop+cyBot)/2, 0.055);
    lockedDoorPivot.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(panelStripW, h, 0.025), braceMat);
    right.position.set(w/2, (cyTop+cyBot)/2, 0.055);
    lockedDoorPivot.add(right);
  }
  const midY = 0, topPanelBot = panelGapY/2, botPanelTop = -panelGapY/2;
  addPanelOutline(lockedDoorH/2 - panelInset, topPanelBot);
  addPanelOutline(botPanelTop, -lockedDoorH/2 + panelInset);
  // crossed boarding planks - thickened from a thin rod to an actual
  // plank profile (wider + shallower) so they read as two distinct
  // crossed boards from more viewing angles instead of collapsing into
  // one line at grazing angles
  for(const [rot, z] of [[0.55, 0.09], [-0.55, 0.105]]){
    const brace = new THREE.Mesh(new THREE.BoxGeometry(lockedDoorW*1.08, 0.16, 0.05), braceMat);
    brace.position.set(0, 0, z);
    brace.rotation.z = rot;
    lockedDoorPivot.add(brace);
  }
  // a couple of crude nail heads on the planks - small detail that sells
  // "boarded shut" rather than "decorative X"
  const nailMat = safehouseMat(0x3a3128, 0x0a0806);
  for(const nx of [-lockedDoorW*0.32, lockedDoorW*0.32]){
    for(const ny of [lockedDoorH*0.22, -lockedDoorH*0.22]){
      const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.03,6), nailMat);
      nail.rotation.x = Math.PI/2;
      nail.position.set(nx, ny, 0.095);
      lockedDoorPivot.add(nail);
    }
  }
  const lockedBoardLintel = new THREE.Mesh(new THREE.BoxGeometry(lockedDoorW+0.14, SAFEHOUSE_WALL_H-lockedDoorH+0.06, 0.1), braceMat);
  lockedBoardLintel.position.set(COL_W, SAFEHOUSE_WALL_H - (SAFEHOUSE_WALL_H-lockedDoorH)/2 + 0.02, WAKE_DOOR_Z);
  group.add(lockedBoardLintel);
  obstacles.push({ x: cx+COL_W, z: cz+WAKE_DOOR_Z, type:'rect', hw: lockedDoorW/2, hd: 0.1, radius: lockedDoorW/2 });

  // ---- open interior swing doors: TV room, storage room, radio room ----
  function addInteriorSwingDoor(wallX, gapCenterZ, gapHalf, swingSign){
    const leafH = SAFEHOUSE_WALL_H-0.32, leafLen = gapHalf*2-0.08;
    const hingeZ = gapCenterZ - swingSign*(gapHalf-0.04);
    const pivot = new THREE.Group();
    pivot.position.set(wallX, leafH/2, hingeZ);
    group.add(pivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, leafH, leafLen), doorMat);
    leaf.position.set(0, 0, swingSign*leafLen/2);
    pivot.add(leaf);
    const doorLintel = new THREE.Mesh(new THREE.BoxGeometry(0.1, SAFEHOUSE_WALL_H-leafH+0.06, gapHalf*2+0.14), braceMat);
    doorLintel.position.set(wallX, SAFEHOUSE_WALL_H-(SAFEHOUSE_WALL_H-leafH)/2+0.02, gapCenterZ);
    group.add(doorLintel);
    interiorDoorPivots.push({ pivot, x: wallX, z: gapCenterZ, swingSign, radius: 1.5, openAngle: swingSign*1.35 });
  }
  addInteriorSwingDoor(COL_E, TV_DOOR_Z, TV_DOOR_HALF, 1);
  addInteriorSwingDoor(COL_W, -STORAGE_DOOR_Z, STORAGE_DOOR_HALF, -1);
  addInteriorSwingDoor(COL_E, -RADIO_DOOR_Z, RADIO_DOOR_HALF, 1);

  // window - radio room east wall, cosmetic
  {
    const winW = 1.0, winH = 1.1, lx = SAFEHOUSE_HALF_W-0.02, lz = -SAFEHOUSE_HALF_D+2.0;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, winH+0.14, winW+0.14), frameMat);
    frame.position.set(lx, 1.55, lz);
    group.add(frame);
    const paneMat = new THREE.MeshBasicMaterial({ color:0x8fa8b5, transparent:true, opacity:0.22, side:THREE.DoubleSide, fog:false, depthWrite:false });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), paneMat);
    pane.rotation.y = Math.PI/2;
    pane.position.set(lx+0.05, 1.55, lz);
    group.add(pane);
  }

  // floor - grey fluffy carpet everywhere except the wake-up room, which
  // gets a slightly darker, featureless floor to read as unlit/uneasy
  // relative to the rest of the house (checklist #2: "cramped and
  // unfamiliar", without going full void the old locked-room did).
  const carpetTex = makeCarpetTexture();
  carpetTex.repeat.set(SAFEHOUSE_HALF_W*1.1, SAFEHOUSE_HALF_D*1.1);
  const floorMat = safehouseMat(0x8a8a8e);
  floorMat.map = carpetTex;
  floorMat.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SAFEHOUSE_HALF_W*2+0.4, SAFEHOUSE_HALF_D*2+0.4), floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.02;
  group.add(floor);
  {
    const wrW = (COL_W - (-SAFEHOUSE_HALF_W)), wrD = (SAFEHOUSE_HALF_D - ROW_DIV);
    const wrCX = -SAFEHOUSE_HALF_W + wrW/2, wrCZ = ROW_DIV + wrD/2;
    const dimFloor = new THREE.Mesh(new THREE.PlaneGeometry(wrW+0.1, wrD+0.1), voidMat());
    dimFloor.rotation.x = -Math.PI/2;
    dimFloor.position.set(wrCX, 0.021, wrCZ);
    group.add(dimFloor);
  }

  // roof - closes the whole footprint off from above
  {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(SAFEHOUSE_HALF_W*2+0.5, 0.25, SAFEHOUSE_HALF_D*2+0.5), frameMat);
    roof.position.set(0, SAFEHOUSE_WALL_H+0.12, 0);
    group.add(roof);
  }

  /* ---------- WAKE-UP ROOM (NW) ----------
     checklist #2: spawn point, bed/cot, sparse furniture, dusty, worn,
     minimal clutter, clear path out (toward the sealed door). */
  {
    const rx = (-SAFEHOUSE_HALF_W + COL_W)/2, rz = (ROW_DIV + SAFEHOUSE_HALF_D)/2;
    const mattressMat = safehouseMat(0xa89e88, 0x4a4432, fabricTex);
    const blanketMat = safehouseMat(0x7a2222, 0x3a0f0f, fabricTex);
    const pillowMat = safehouseMat(0xe0d8c8, 0x5c563e, fabricTex);

    const cotX = rx-0.3, cotZ = SAFEHOUSE_HALF_D-1.5;
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

    // bedside table - BED_TABLE_POS
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

    // one sparse chair, kept minimal per checklist ("should not contain
    // too many distractions")
    {
      const chX = rx+0.9, chZ = ROW_DIV+1.3, seatH=0.46, seatSize=0.4;
      for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, seatH, 0.05), woodMat);
        leg.position.set(chX+dx*(seatSize/2-0.05), seatH/2, chZ+dz*(seatSize/2-0.05));
        group.add(leg);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(seatSize, 0.05, seatSize), woodMat);
      seat.position.set(chX, seatH, chZ);
      group.add(seat);
    }

    const bedLamp = new THREE.PointLight(0xcf9a6a, 0.5, 8, 0);
    bedLamp.position.set(cotX, 1.1, cotZ-0.3);
    bedLamp.castShadow = true;
    bedLamp.shadow.mapSize.set(512, 512);
    group.add(bedLamp);

    // environmental storytelling: a tally scratched into the headboard,
    // counting days that stops well short of any round number - ties to
    // lore #12/#19 ("The Fourth Year"/"Four Years, Give or Take") without
    // needing the player to have found either page yet. Not interactable
    // - it reads from a glance, the way a real headboard scratch would.
    {
      const tallyMat = safehouseMat(0x2a2418, 0x0e0c08);
      for(let i=0;i<11;i++){
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.01), tallyMat);
        mark.position.set(cotX-cotW/2+0.18+i*0.045, cotLegH+0.09+0.3+0.45, cotZ-cotD/2+0.036);
        mark.rotation.z = (Math.random()-0.5)*0.08;
        group.add(mark);
      }
      // the twelfth stroke, crossed through diagonally - the count that
      // never got finished
      const strike = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.01), tallyMat);
      strike.position.set(cotX-cotW/2+0.18+5*0.045, cotLegH+0.09+0.3+0.45, cotZ-cotD/2+0.038);
      strike.rotation.z = 0.6;
      group.add(strike);
    }
    // face-down photograph on the bedside table, beside the drawer knob
    // - deliberately face-down and non-interactable, same "unreadable on
    // purpose" treatment as the radio room's ID badge; it's there to be
    // noticed, not solved
    {
      const photoMat = safehouseMat(0x2c2822, 0x0c0a08);
      const photo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.006, 0.08), photoMat);
      photo.position.set(BED_TABLE_POS.x-cx+0.12, 0.5+0.055+0.003, BED_TABLE_POS.z-cz-0.08);
      photo.rotation.y = 0.5;
      group.add(photo);
    }
  }

  /* ---------- CENTRAL HALLWAY (spine) ----------
     checklist #3: connector, clear sightlines, one or two environmental
     details, orientation hub. Holds the notebook (save point) - always
     reachable, matches the hallway's hub role. */
  {
    const tableX = NOTEBOOK_POS.x - cx, tableZ = NOTEBOOK_POS.z - cz - 0.05;
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

    const notebookMat = safehouseMat(0x6a4a35, 0x3a2818);
    const notebook = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.26), notebookMat);
    notebook.position.set(tableX-0.1, tableSurfaceY+0.03, tableZ+0.05);
    notebook.rotation.y = 0.3;
    group.add(notebook);
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.32,6), safehouseMat(0xb8956a, 0x4a3a20));
    pencil.rotation.z = Math.PI/2 - 0.35;
    pencil.position.set(tableX+0.14, tableSurfaceY+0.045, tableZ-0.02);
    group.add(pencil);

    // worn doormat in front of the exit
    const doormat = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), safehouseMat(0x2e2a22, 0x141210));
    doormat.rotation.x = -Math.PI/2;
    doormat.position.set(MAIN_DOOR_X, 0.015, -SAFEHOUSE_HALF_D+0.55);
    group.add(doormat);

    // hallway lamp - the room's main light source, swings gently
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

    const vestLight = new THREE.PointLight(0xc9c2b0, 0.5, 10, 0);
    vestLight.position.set(MAIN_DOOR_X, 1.8, -SAFEHOUSE_HALF_D+2.2);
    group.add(vestLight);

    // environmental storytelling: one coat on a row of hooks meant for
    // more than one person - the hub is the room that most needs to
    // feel like a former household, not just a corridor
    {
      const hookWallX = COL_W+0.03, hookZ = ROW_DIV-0.9;
      const hookMat = safehouseMat(0x2c2824, 0x0e0c0a);
      for(let i=0;i<3;i++){
        const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.06,6), hookMat);
        hook.rotation.z = Math.PI/2;
        hook.position.set(hookWallX+0.03, 1.6, hookZ+i*0.35);
        group.add(hook);
      }
      const coatMat = safehouseMat(0x3c3428, 0x151007, fabricTex);
      const coat = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.34), coatMat);
      coat.position.set(hookWallX+0.06, 1.32, hookZ);
      group.add(coat);
      // the other two hooks stay bare
    }
    // pencil height-marks on the hallway's own door frame near the wake-up
    // room threshold - small, easy to miss, reads as "someone measured a
    // child growing up in this house" without a single line of dialogue
    {
      const markMat = safehouseMat(0x241f18, 0x0a0806);
      const frameX = COL_W-0.02, frameZ = WAKE_DOOR_Z+WAKE_DOOR_HALF+0.15;
      for(const [my, mlen] of [[0.9,0.05],[1.05,0.06],[1.22,0.055],[1.35,0.05]]){
        const tick = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, mlen), markMat);
        tick.position.set(frameX, my, frameZ);
        group.add(tick);
      }
    }
  }

  /* ---------- TV / CLUE ROOM (NE) ----------
     checklist #4: interactable TV, sticky note nearby, static effects,
     old furniture, later becomes the memory-reveal location. */
  {
    const screenMat = makeCRTScreen();
    const beigeMat = safehouseMat(0xc9c2a8, 0x4c4838);
    const plasticMat = safehouseMat(0x18181a, 0x050505);
    const bezelMat = safehouseMat(0x2e2e32, 0x0c0c0e);

    const tvX = TV_POS.x - cx, tvZ = TV_POS.z - cz;
    const tv = new THREE.Group();
    tv.position.set(tvX, 0, tvZ);
    tv.rotation.y = TV_YAW;

    const standH = 0.42;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, standH, 0.42), beigeMat);
    stand.position.y = standH/2;
    tv.add(stand);
    const bodyW = 0.62, bodyH = 0.52, bodyD = 0.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW*0.72, bodyH*0.86, bodyD), plasticMat);
    body.position.set(0, standH + bodyH/2 - 0.02, -0.02);
    tv.add(body);
    const front = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, 0.1), bezelMat);
    front.position.set(0, standH + bodyH/2, bodyD/2 - 0.02);
    tv.add(front);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(bodyW*0.72, bodyH*0.68), screenMat);
    screen.position.set(0, standH + bodyH/2 + 0.01, bodyD/2 + 0.031);
    tv.add(screen);
    const bevel = new THREE.Mesh(new THREE.RingGeometry(bodyW*0.36, bodyW*0.4, 4, 1), safehouseMat(0x9a988e, 0x2c2b26));
    bevel.position.set(0, standH + bodyH/2 + 0.01, bodyD/2 + 0.028);
    tv.add(bevel);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.03, bodyH*0.7, bodyD*0.55), plasticMat);
    grille.position.set(-bodyW*0.5+0.015, standH + bodyH/2, -0.05);
    tv.add(grille);
    for(let i=0;i<5;i++){
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.02), safehouseMat(0x3c3c40, 0x101012));
      btn.position.set(-bodyW*0.28 + i*0.07, standH + bodyH*0.14, bodyD/2 + 0.06);
      tv.add(btn);
    }
    group.add(tv);
    crtLight = new THREE.PointLight(0x6ec48a, 0.4, 3, 2);
    crtLight.position.set(tvX, standH+bodyH/2, tvZ - Math.sin(TV_YAW)*0.4);
    group.add(crtLight);

    // sticky note + corkboard mounted beside the TV - checklist's clue
    // prop; hints at relay towers and a disconnected signal
    const corkMat = new THREE.MeshToonMaterial({ map:corkboardTex, color:0xffffff, gradientMap:toonRamp });
    patchFogToDistance(corkMat);
    const boardX = tvX+1.1, boardZ = SAFEHOUSE_HALF_D-SAFEHOUSE_WALL_T-0.02;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), corkMat);
    board.position.set(boardX, 1.7, boardZ);
    board.rotation.y = Math.PI;
    group.add(board);
    const noteMat = safehouseMat(0xd8c878, 0x3c360f);
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.14), noteMat);
    note.position.set(boardX-0.05, 1.72, boardZ+0.01);
    note.rotation.y = Math.PI;
    note.rotation.z = -0.08;
    group.add(note);

    // sparse old armchair facing the set
    {
      const chX = tvX-1.4, chZ = tvZ+0.3;
      const armMat = safehouseMat(0x4a3a2c, 0x201810, fabricTex);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), armMat);
      seat.position.set(chX, 0.2, chZ);
      group.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.12), armMat);
      back.position.set(chX, 0.55, chZ+0.2);
      group.add(back);
    }

    const tvLight = new THREE.PointLight(0xa89a80, 0.5, 8, 0);
    tvLight.position.set(tvX-0.8, 1.9, tvZ);
    group.add(tvLight);
  }

  /* ---------- RADIO / UTILITY ROOM (SE) ----------
     checklist #5: radio-related props, cables/tools/signal gear,
     reinforces the relay-restoration theme. */
  {
    const deskX = SAFEHOUSE_HALF_W-1.3, deskZ = -SAFEHOUSE_HALF_D+1.2;
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

    // coiled cable spools + spare relay parts on the floor - "the house
    // once handled signal work"
    const cableMat = safehouseMat(0x2a2825, 0x141310);
    for(const [ox,oz] of [[-1.6,0.8],[-1.2,1.3],[0.8,1.6]]){
      const spool = new THREE.Mesh(new THREE.TorusGeometry(0.14,0.05,6,12), cableMat);
      spool.rotation.x = Math.PI/2;
      spool.position.set(SAFEHOUSE_HALF_W-2.4+ox, 0.06, -SAFEHOUSE_HALF_D+2.0+oz);
      group.add(spool);
    }
    // tool rack against the south wall - GLITCH_DOOR_POS sits on the
    // wall directly behind it, so the rack itself reads as the cover
    // story ("just tools") until the panel behind it starts misbehaving
    {
      const rackX = SAFEHOUSE_HALF_W-2.6, rackZ = -SAFEHOUSE_HALF_D+0.35;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.04), woodMat);
      board.position.set(rackX, 1.4, rackZ);
      group.add(board);
      for(let i=0;i<3;i++){
        const tool = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), cableMat);
        tool.position.set(rackX-0.35+i*0.35, 1.4, rackZ+0.05);
        group.add(tool);
      }
    }

    // glitch door panel - GLITCH_DOOR_POS. Plain seam in the wall until
    // state.glitchDoorRevealed (see updateSafehouseInterior), then
    // chromatic-jitters the same way the wake-up room's locked door did
    // pre-relayActive; calms and lightens once state.hqTowerUnlocked.
    {
      const gdX = GLITCH_DOOR_POS.x - cx, gdZ = GLITCH_DOOR_POS.z - cz;
      const gdW = 0.9, gdH = 2.1;
      const gdMat = safehouseMat(0x2c2925, 0x121110);
      glitchDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(gdW, gdH, 0.05), gdMat);
      glitchDoorMesh.position.set(gdX, gdH/2, gdZ+0.03);
      glitchDoorMesh.userData.baseColor = { h:0.05, s:0.1, l:0.08 };
      group.add(glitchDoorMesh);
      // a hairline seam outline - reads as "not quite part of the wall"
      // even before it starts actively glitching
      const seamMat = safehouseMat(0x0a0a0a, 0x000000);
      for(const [w,h,ox,oy] of [[gdW+0.04,0.02,0,gdH/2],[gdW+0.04,0.02,0,-gdH/2],[0.02,gdH+0.04,gdW/2,0],[0.02,gdH+0.04,-gdW/2,0]]){
        const seam = new THREE.Mesh(new THREE.BoxGeometry(w,h,0.01), seamMat);
        seam.position.set(gdX+ox, gdH/2+oy, gdZ+0.058);
        group.add(seam);
      }
    }

    // corkboard w/ pinned paperwork above the desk - environmental
    // storytelling: a hand-drawn relay map with towers crossed off one
    // by one, and an operator ID badge clipped to the desk edge, tying
    // the room to lore #13/#17 ("Relay Seven", "Address Book") without
    // needing the player to have found those pages yet.
    {
      const corkMat2 = new THREE.MeshToonMaterial({ map:corkboardTex, color:0xffffff, gradientMap:toonRamp });
      patchFogToDistance(corkMat2);
      const boardCB = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), corkMat2);
      boardCB.position.set(deskX-0.3, 1.9, -SAFEHOUSE_HALF_D+SAFEHOUSE_WALL_T+0.02);
      group.add(boardCB);
      const mapPaperMat = safehouseMat(0xc9bfa0, 0x3c3628);
      const towerMap = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.32), mapPaperMat);
      towerMap.position.set(deskX-0.3, 1.95, -SAFEHOUSE_HALF_D+SAFEHOUSE_WALL_T+0.035);
      towerMap.rotation.z = 0.05;
      group.add(towerMap);
      // a few red string pins - hand-count of towers, one still unpinned
      const stringMat = safehouseMat(0x6a1818, 0x1a0505);
      for(const [sx,sy] of [[-0.14,0.08],[-0.02,0.03],[0.1,-0.02],[0.02,-0.09]]){
        const pin = new THREE.Mesh(new THREE.SphereGeometry(0.008,6,6), stringMat);
        pin.position.set(deskX-0.3+sx, 1.95+sy, -SAFEHOUSE_HALF_D+SAFEHOUSE_WALL_T+0.045);
        group.add(pin);
      }
      // operator ID badge, clipped face-down on the desk edge - the
      // player can't read who it belonged to without turning it over,
      // which the interaction system doesn't currently support; left
      // deliberately unreadable rather than half-implemented
      const badgeMat = safehouseMat(0xb8b2a0, 0x2c2a24);
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.09), badgeMat);
      badge.position.set(deskX+0.45, deskLegH+deskTopH+0.006, deskZ-0.15);
      badge.rotation.y = 0.4;
      group.add(badge);
    }

    const radioDeskLight = new THREE.PointLight(0xd9c9b8, 0.55, 9, 0);
    radioDeskLight.position.set(deskX, 1.9, deskZ);
    radioDeskLight.castShadow = true;
    radioDeskLight.shadow.mapSize.set(512, 512);
    group.add(radioDeskLight);
  }

  /* ---------- STORAGE / CLUTTER ROOM (SW) ----------
     checklist #6: boxes, old papers, dusty objects, forgotten supplies,
     lore scraps - optional exploration, not required for progression.
     Holds CALENDAR_POS and STORAGE_DRAWER_POS. */
  {
    const crateMat = safehouseMat(0x3a2d1c, 0x1e160c);
    const stX = -SAFEHOUSE_HALF_W+2.4, stZ = -SAFEHOUSE_HALF_D+2.6;
    for(const [dx,dz,dy] of [[-0.5,-0.4,0],[0.5,-0.3,0],[0,0.5,0],[-0.3,-0.1,0.55]]){
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.5,0.55), crateMat);
      crate.position.set(stX+dx, 0.25+dy, stZ+dz);
      crate.rotation.y = (Math.random()-0.5)*0.3;
      group.add(crate);
    }

    // shelving unit with jugs/cans/tools
    const shelfX = -SAFEHOUSE_HALF_W+2.0, shelfZ = -SAFEHOUSE_HALF_D+0.5;
    const shelfW = 1.4, shelfDp = 0.45;
    const uprightMat = safehouseMat(0x1c1a18, 0x0e0c0a);
    for(const dx of [-shelfW/2+0.05, shelfW/2-0.05]){
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.06), uprightMat);
      upright.position.set(shelfX+dx, 1.0, shelfZ);
      group.add(upright);
    }
    const boardMat = safehouseMat(0x352616, 0x1c1409);
    for(const sy of [0.5, 1.05, 1.6]){
      const board = new THREE.Mesh(new THREE.BoxGeometry(shelfW, 0.05, shelfDp), boardMat);
      board.position.set(shelfX, sy, shelfZ);
      group.add(board);
    }
    const jugMat = safehouseMat(0x3a4a3c, 0x172018);
    const canMat = safehouseMat(0x6a5a3a, 0x2e2617);
    for(const [sy,off,kind] of [[0.5,0,'jug'],[0.5,0.35,'jug'],[0.5,0.7,'can'],[1.05,0.05,'can'],[1.05,0.3,'can'],[1.6,0.1,'jug']]){
      const jx = shelfX - shelfW/2 + 0.22 + off, jz = shelfZ;
      if(kind==='jug'){
        const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.1,0.28,8), jugMat);
        jug.position.set(jx, sy+0.03+0.14, jz);
        group.add(jug);
      } else {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,8), canMat);
        can.position.set(jx, sy+0.03+0.06, jz);
        group.add(can);
      }
    }

    // scattered old papers / lore scraps on a low crate
    const paperMat = safehouseMat(0xc9bfa0, 0x3c3628);
    for(let i=0;i<4;i++){
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.19), paperMat);
      paper.rotation.x = -Math.PI/2;
      paper.rotation.z = (Math.random()-0.5)*0.6;
      paper.position.set(stX-0.9+Math.random()*0.5, 0.02, stZ-1.0+Math.random()*0.6);
      group.add(paper);
    }

    // calendar - CALENDAR_POS, mounted on the west wall
    {
      const calX = CALENDAR_POS.x - cx, calZ = CALENDAR_POS.z - cz;
      const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), paperMat);
      cal.rotation.y = Math.PI/2;
      cal.position.set(calX, 1.5, calZ);
      group.add(cal);
    }

    // storage drawer - STORAGE_DRAWER_POS, against the hallway divider wall
    {
      const drX = STORAGE_DRAWER_POS.x - cx, drZ = STORAGE_DRAWER_POS.z - cz;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.66, 0.42), safehouseMat(0xb0a888, 0x3c3828));
      cab.position.set(drX, 0.33, drZ);
      group.add(cab);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), safehouseMat(0x2c2a26, 0x151310));
      handle.position.set(drX, 0.5, drZ+0.22);
      group.add(handle);
    }

    const storageLight = new THREE.PointLight(0xa89a80, 0.45, 8, 0);
    storageLight.position.set(stX, 1.8, stZ);
    group.add(storageLight);

    // environmental storytelling: one crate stenciled with a relay
    // designation (ties directly to lore #13 "Relay Seven" without
    // requiring the page to have been found) and a folded operator
    // jacket on top of it, left behind rather than packed
    {
      const stencilMat = safehouseMat(0x8a7a52, 0x2c2410);
      const stencilBoxX = stX-0.5, stencilBoxZ = stZ-0.4;
      for(let i=0;i<3;i++){
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18-i*0.02, 0.03, 0.02), stencilMat);
        bar.position.set(stencilBoxX, 0.52+i*0.001, stencilBoxZ+0.28+0.001);
        bar.rotation.x = -Math.PI/2;
        group.add(bar);
      }
      const jacketMat = safehouseMat(0x35342e, 0x121210, fabricTex);
      const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.32), jacketMat);
      jacket.position.set(stencilBoxX, 0.505, stencilBoxZ);
      jacket.rotation.y = 0.15;
      group.add(jacket);
      // a WNCORE patch, barely visible, still stitched to the sleeve
      const patchMat = safehouseMat(0x6a1818, 0x1a0505);
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.03), patchMat);
      patch.rotation.x = -Math.PI/2;
      patch.position.set(stencilBoxX-0.13, 0.532, stencilBoxZ+0.05);
      group.add(patch);
    }
  }

  // Fixed enclosed interior - affordable to fully traverse for shadow flags.
  group.traverse(o=>{
    if(o.isMesh && o.material){
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      o.castShadow = !mat.transparent;
      o.receiveShadow = true;
    }
  });

  return group;
}

/* ---------- SAFEHOUSE EXTERIOR ----------
   Small street-facing shell, teleport-linked (not literal geometry) to
   the interior above - unchanged in spirit from before: this is the
   true "outside", a short distance from SAFEHOUSE_CENTER. */
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
  const segAw = (0-EXT_DOOR_HALF) - (-EXT_HALF_W-EXT_WALL_T);
  addWallSeg(-EXT_HALF_W-EXT_WALL_T+segAw/2, -EXT_HALF_D, segAw, EXT_WALL_T);
  const segBw = (EXT_HALF_W+EXT_WALL_T) - (0+EXT_DOOR_HALF);
  addWallSeg(EXT_HALF_W+EXT_WALL_T-segBw/2, -EXT_HALF_D, segBw, EXT_WALL_T);
  addWallSeg(0, EXT_HALF_D, EXT_HALF_W*2+EXT_WALL_T*2, EXT_WALL_T);
  addWallSeg(-EXT_HALF_W, 0, EXT_WALL_T, EXT_HALF_D*2);
  addWallSeg(EXT_HALF_W, 0, EXT_WALL_T, EXT_HALF_D*2);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(EXT_HALF_W*2+0.4, 0.22, EXT_HALF_D*2+0.4), frameMat);
  roof.position.y = EXT_WALL_H + 0.11;
  group.add(roof);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(EXT_HALF_W*2+0.2, EXT_HALF_D*2+0.2), safehouseMat(0x3a362f));
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.02;
  group.add(floor);

  const mastMat = safehouseMat(0x18161a, 0x0c0a0e);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.08,1.8,6), mastMat);
  mast.position.set(0, EXT_WALL_H+0.9, 0);
  group.add(mast);

  const doorW = EXT_DOOR_HALF*2-0.1, doorH = EXT_WALL_H-0.3;
  exteriorDoorPivot = new THREE.Group();
  exteriorDoorPivot.position.set(-EXT_DOOR_HALF+0.14, doorH/2, -EXT_HALF_D);
  exteriorDoorPivot.rotation.y = 0.5;
  group.add(exteriorDoorPivot);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), safehouseMat(0x4a3f34));
  doorMesh.position.set(doorW/2, 0, 0);
  exteriorDoorPivot.add(doorMesh);

  const doorLight = new THREE.PointLight(0xffaa66, 0.9, 8, 0);
  doorLight.position.set(0, 1.6, -EXT_HALF_D+0.3);
  group.add(doorLight);
  addGlow(group, 0xffb877, 1.2, 0.55).position.copy(doorLight.position);

  group.traverse(o=>{
    if(o.isMesh && o.material){
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      o.castShadow = !mat.transparent;
      o.receiveShadow = true;
    }
  });

  return group;
}

const EXT_DOOR_TRIGGER = { x: EXTERIOR_CENTER.x, z: EXTERIOR_CENTER.z - EXT_HALF_D - 0.6 };
const EXT_DOOR_LANDING = { x: EXTERIOR_CENTER.x, z: EXTERIOR_CENTER.z - EXT_HALF_D - 1.6, yaw: 0 };
const INT_DOOR_TRIGGER = { x: SAFEHOUSE_CENTER.x + MAIN_DOOR_X, z: SAFEHOUSE_CENTER.z - SAFEHOUSE_HALF_D - 0.6 };
const INT_DOOR_LANDING = { x: SAFEHOUSE_CENTER.x + MAIN_DOOR_X, z: SAFEHOUSE_CENTER.z - SAFEHOUSE_HALF_D + 1.6, yaw: Math.PI };

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
  // wake-up room's sealed door - permanent chromatic-glitch jitter until
  // relayActive, then calms to plain wood; swings open once doorUnlocked.
  if(lockedDoorPivot){
    if(state.relayActive){
      lockedDoorPivot.position.x += (COL_W - lockedDoorPivot.position.x)*0.08;
      lockedDoorPivot.rotation.z *= 0.9;
      const mesh = lockedDoorPivot.children[0];
      if(mesh && !mesh.userData.calmed){
        mesh.userData.calmed = true;
        mesh.material.color.setHSL(0.08, 0.15, 0.12);
      }
      if(state.doorUnlocked){
        const targetY = 0.9;
        lockedDoorPivot.rotation.y += (targetY - lockedDoorPivot.rotation.y)*0.04;
      }
    } else {
      const g = skyClock*13.0;
      lockedDoorPivot.position.x = COL_W + (Math.random()-0.5)*0.02;
      lockedDoorPivot.rotation.z = Math.sin(g)*0.015;
      const mesh = lockedDoorPivot.children[0];
      if(mesh){
        const ud = mesh.userData;
        if(ud.flashTimer === undefined) ud.flashTimer = 0;
        ud.flashTimer -= dt||0.016;
        if(ud.flashTimer <= 0){
          if(Math.random() < 0.015){
            mesh.material.color.setHSL(Math.random(), 0.9, 0.55);
            ud.flashTimer = 0.06 + Math.random()*0.1;
          } else {
            mesh.material.color.setHSL(0.78, 0.35, 0.13);
          }
        }
      }
    }
  }

  for(const d of interiorDoorPivots){
    const dx = state.playerX - (SAFEHOUSE_CENTER.x + d.x), dz = state.playerZ - (SAFEHOUSE_CENTER.z + d.z);
    const near = (dx*dx + dz*dz) < d.radius*d.radius;
    const target = near ? d.openAngle : 0;
    d.pivot.rotation.y += (target - d.pivot.rotation.y)*0.08;
  }

  // glitch door (radio room) - reveal is a one-shot flip on first radio
  // power-up, not its own quest step; unlock reuses the existing
  // relay-tower chain (state.hqTowerUnlocked) rather than a parallel
  // memory-note counter. See core/state.js for the flag comments.
  if(!state.glitchDoorRevealed && state.radioOn){
    state.glitchDoorRevealed = true;
  }
  if(state.glitchDoorRevealed && state.hqTowerUnlocked){
    state.glitchDoorUnlocked = true;
  }
  if(glitchDoorMesh){
    const gdx = state.playerX - GLITCH_DOOR_POS.x, gdz = state.playerZ - GLITCH_DOOR_POS.z;
    state.nearGlitchDoor = (gdx*gdx + gdz*gdz) < 2.25;
    if(!state.glitchDoorRevealed){
      // inert - plain dark wall panel, no jitter, nothing to notice yet
      glitchDoorMesh.material.color.setHSL(0.05, 0.1, 0.08);
    } else if(!state.glitchDoorUnlocked){
      const g = skyClock*11.0;
      glitchDoorMesh.position.x = (GLITCH_DOOR_POS.x - SAFEHOUSE_CENTER.x) + (Math.random()-0.5)*0.015;
      if(Math.random() < 0.02){
        glitchDoorMesh.material.color.setHSL(Math.random(), 0.85, 0.5);
      } else {
        glitchDoorMesh.material.color.setHSL(0.6, 0.4, 0.1 + Math.sin(g)*0.02);
      }
    } else {
      // stabilized - clean metal, glitch effect stops for good
      glitchDoorMesh.position.x = (GLITCH_DOOR_POS.x - SAFEHOUSE_CENTER.x);
      glitchDoorMesh.material.color.setHSL(0.58, 0.08, 0.55);
    }
  }
}

export {
  buildSafehouse, buildSafehouseExterior,
  updateDoorFlash, updateSafehouseInterior,
  NOTEBOOK_POS, LOCKED_DOOR_POS, BED_TABLE_POS, SAFEHOUSE_DOOR_YAW,
  CALENDAR_POS, STORAGE_DRAWER_POS, CALENDAR_LAST_DAY, TV_POS, TV_YAW,
  GLITCH_DOOR_POS, EXTERIOR_CENTER, HALLWAY_SPAWN_POS,
};
