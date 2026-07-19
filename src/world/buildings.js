/* ============================================================
   world/buildings.js — pulled from the monolith this round
   (world-gen mesh builders: buildings/props/streaming, ranked round).

   Owns: the modular instanced facade-grid system (mullions, spandrel
   bands, lit/dark window panels + their glow layer), the network-relay
   office building variant, addBuilding() itself, and the chunk-facing
   window-spot registry that the window-figure system in main.js reads.

   Consumers: main.js's still-unmoved generateDistrict() (hand-authored
   downtown) and world/streaming.js's loadChunk() both call addBuilding();
   both also indirectly drive registerChunkWindowSpots/unregisterChunkWindowSpots
   via addBuilding's opts.spots / streaming's chunk lifecycle.

   Shared mutable state that used to live inline here (obstacles,
   downtownWindowSpots, the _counters/_alloc pool primitives) now lives in
   world/worldData.js — see that file's "ADDED THIS ROUND" section — since
   main.js and world/props.js both need pieces of it too. buildingWallMat/
   buildingDarkMat/BUILDING_PALETTES/pickBuildingPalette/stoneTex moved to
   world/materials.js for the same reason (main.js's still-unmoved
   exit-road curb/traffic-light code also reads buildingDarkMat directly).

   updateFacadePoolCounts() lives here (not worldData.js) since it flushes
   InstancedMesh.count for six buildings-owned pools; it also flushes
   world/props.js's rubbleMesh/puddleMesh counts in the same pass, so it
   imports those two from props.js — the only cross-import between the two
   siblings, one direction, no cycle (props.js does not import buildings.js).
   ============================================================ */

import { scene } from '../core/scene.js';
import { groundHeightAt } from './terrain.js';
import { makeCanvas, patchFogToDistance, patchFogAndMelt } from '../render/postprocessing.js';
import { toonRamp, buildingWallMat, buildingDarkMat, pickBuildingPalette } from './materials.js';
// door frame was previously reusing buildingDarkMat - the exact same
// material as the base plinth it sits on, so there was zero visual
// contrast between "door" and "wall" (the recess itself was only barely
// darker still). Windows read instantly because they're lit; doors need
// their own distinct, lighter trim tone to read as an actual opening
// rather than camouflaging into the base.
const doorFrameMat = new THREE.MeshToonMaterial({ color:0x5a4636, gradientMap:toonRamp });
import { obstacles, downtownWindowSpots, _counters, _alloc, _hideDummy } from './worldData.js';
import { rubbleMesh, puddleMesh } from './props.js';

// ---------- NETWORK RELAY OFFICE (rare building variant) ----------
function relaySignTexture(){
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0908'; ctx.fillRect(0,0,256,256);
  ctx.strokeStyle = 'rgba(201,194,182,0.35)'; ctx.lineWidth = 6;
  ctx.strokeRect(6,6,244,244);
  ctx.fillStyle = 'rgba(122,31,31,0.85)';
  ctx.font = 'bold 46px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('WNCORE', 128, 96);
  ctx.fillStyle = 'rgba(201,194,182,0.55)';
  ctx.font = '20px monospace';
  ctx.fillText('RELAY OFFICE', 128, 150);
  ctx.font = '16px monospace';
  ctx.fillStyle = 'rgba(201,194,182,0.35)';
  ctx.fillText('88.7', 128, 190);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
let relaySignTex = null;
function addRelayDressing(group, w, h, d, doorX){
  const mastMat = new THREE.MeshToonMaterial({ color:0x18161a, gradientMap:toonRamp });
  patchFogToDistance(mastMat);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.09,2.4,6), mastMat);
  mast.position.set(0, h+1.2, 0);
  group.add(mast);
  const beaconMat = new THREE.MeshBasicMaterial({ color:0xff3b3b, transparent:true, opacity:0.9 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16,8,8), beaconMat);
  beacon.position.set(0, h+2.5, 0);
  group.add(beacon);
  const beaconLight = new THREE.PointLight(0xff3b3b, 1.1, 18, 2);
  beaconLight.position.copy(beacon.position);
  group.add(beaconLight);
  relayBeacons.push(beacon);

  if(!relaySignTex) relaySignTex = relaySignTexture();
  const signMat = new THREE.MeshBasicMaterial({ map: relaySignTex });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.1), signMat);
  sign.position.set(doorX + 1.3, 2.1, d/2+0.03);
  group.add(sign);
}
const relayBeacons = [];
let relayBeaconPulse = 0;
function updateRelayBeacons(dt){
  if(!relayBeacons.length) return;
  relayBeaconPulse += dt;
  const p = 0.5 + Math.sin(relayBeaconPulse*1.4)*0.5;
  for(const b of relayBeacons) b.material.opacity = 0.4 + p*0.55;
}

/* ---------- MODULAR FACADE GRID ---------- */
const BAY_W = 2.4;
const GRID_FLOOR_H = 2.9;
const MAX_FRAME = 13000, MAX_WARM = 3400, MAX_COOL = 3400, MAX_DARK = 13000;
const unitBoxGeo = new THREE.BoxGeometry(1,1,1);
const windowWarmMat = new THREE.MeshBasicMaterial({ color:0xffc077, fog:true });
const windowCoolMat = new THREE.MeshBasicMaterial({ color:0xd28cff, fog:true });
const windowDarkMat = new THREE.MeshBasicMaterial({ color:0x0a090c, fog:true });
patchFogToDistance(windowWarmMat); patchFogToDistance(windowCoolMat); patchFogToDistance(windowDarkMat);

const MAX_WARM_GLOW = MAX_WARM, MAX_COOL_GLOW = MAX_COOL;
const windowWarmGlowMat = new THREE.MeshBasicMaterial({ color:0xffb060, transparent:true, opacity:0.35, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
const windowCoolGlowMat = new THREE.MeshBasicMaterial({ color:0xc878ff, transparent:true, opacity:0.3, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });

const gridFrameMesh = new THREE.InstancedMesh(unitBoxGeo, buildingDarkMat, MAX_FRAME);
const windowWarmMesh = new THREE.InstancedMesh(unitBoxGeo, windowWarmMat, MAX_WARM);
const windowCoolMesh = new THREE.InstancedMesh(unitBoxGeo, windowCoolMat, MAX_COOL);
const windowDarkMesh = new THREE.InstancedMesh(unitBoxGeo, windowDarkMat, MAX_DARK);
const windowWarmGlowMesh = new THREE.InstancedMesh(unitBoxGeo, windowWarmGlowMat, MAX_WARM_GLOW);
const windowCoolGlowMesh = new THREE.InstancedMesh(unitBoxGeo, windowCoolGlowMat, MAX_COOL_GLOW);
for(const m of [gridFrameMesh, windowWarmMesh, windowCoolMesh, windowDarkMesh, windowWarmGlowMesh, windowCoolGlowMesh]){
  m.count = 0;
  scene.add(m);
}
unitBoxGeo.computeBoundingSphere();
const freeFrame = [], freeWarm = [], freeCool = [], freeDark = [], freeWarmGlow = [], freeCoolGlow = [];
const _dummy = new THREE.Object3D();
const _glowDummy = new THREE.Object3D();
function placeFrame(wx,wy,wz, sx,sy,sz, track){
  const idx = _alloc(freeFrame,'frame',gridFrameMesh,MAX_FRAME);
  if(idx<0) return;
  _dummy.position.set(wx,wy,wz);
  _dummy.scale.set(sx,sy,sz);
  _dummy.updateMatrix();
  gridFrameMesh.setMatrixAt(idx, _dummy.matrix);
  if(track) track.push({mesh:gridFrameMesh, list:freeFrame, idx});
}
function placePanel(lit, warm, wx,wy,wz, sx,sy,sz, track, nx,nz, spots){
  _dummy.position.set(wx,wy,wz);
  _dummy.scale.set(sx,sy,sz);
  _dummy.updateMatrix();
  if(!lit){
    const idx = _alloc(freeDark,'dark',windowDarkMesh,MAX_DARK);
    if(idx>=0){ windowDarkMesh.setMatrixAt(idx, _dummy.matrix); if(track) track.push({mesh:windowDarkMesh, list:freeDark, idx}); }
    return;
  }
  if(warm){
    const idx = _alloc(freeWarm,'warm',windowWarmMesh,MAX_WARM);
    if(idx>=0){ windowWarmMesh.setMatrixAt(idx, _dummy.matrix); if(track) track.push({mesh:windowWarmMesh, list:freeWarm, idx}); }
  } else {
    const idx = _alloc(freeCool,'cool',windowCoolMesh,MAX_COOL);
    if(idx>=0){ windowCoolMesh.setMatrixAt(idx, _dummy.matrix); if(track) track.push({mesh:windowCoolMesh, list:freeCool, idx}); }
  }
  _glowDummy.position.set(wx,wy,wz);
  _glowDummy.scale.set(sx*1.7, sy*1.7, sz);
  _glowDummy.updateMatrix();
  if(warm){
    const gi = _alloc(freeWarmGlow,'warmGlow',windowWarmGlowMesh,MAX_WARM_GLOW);
    if(gi>=0){ windowWarmGlowMesh.setMatrixAt(gi, _glowDummy.matrix); if(track) track.push({mesh:windowWarmGlowMesh, list:freeWarmGlow, idx:gi}); }
  } else {
    const gi = _alloc(freeCoolGlow,'coolGlow',windowCoolGlowMesh,MAX_COOL_GLOW);
    if(gi>=0){ windowCoolGlowMesh.setMatrixAt(gi, _glowDummy.matrix); if(track) track.push({mesh:windowCoolGlowMesh, list:freeCoolGlow, idx:gi}); }
  }
  if(spots) spots.push({ x:wx+nx*0.15, y:wy, z:wz+nz*0.15, nx, nz });
}
function freeFacadeTrack(track){
  const touched = new Set();
  for(const t of track){
    t.mesh.setMatrixAt(t.idx, _hideDummy.matrix);
    t.list.push(t.idx);
    touched.add(t.mesh);
  }
  for(const m of touched) m.instanceMatrix.needsUpdate = true;
}
const activeWindowSpots = [];
const chunkWindowSpotMap = new Map();
function rebuildActiveWindowSpots(){
  activeWindowSpots.length = 0;
  for(const s of downtownWindowSpots) activeWindowSpots.push(s);
  for(const arr of chunkWindowSpotMap.values()) for(const s of arr) activeWindowSpots.push(s);
}
function registerChunkWindowSpots(key, spots){
  if(spots && spots.length){ chunkWindowSpotMap.set(key, spots); rebuildActiveWindowSpots(); }
}
function unregisterChunkWindowSpots(key){
  if(chunkWindowSpotMap.delete(key)) rebuildActiveWindowSpots();
}
function addFacadeGrid(faceWidth, floors, baseH, litRatio, wx,wy,wz, alongX, track, nx,nz, spots){
  const bays = Math.max(2, Math.round(faceWidth/BAY_W));
  const cellW = faceWidth/bays;
  const totalH = floors*GRID_FLOOR_H;
  const midY = baseH + totalH/2;
  const mullionThick = 0.12, frameDepth = 0.1, protrude = 0.07, panelDepth = 0.05, panelProud = 0.03;

  for(let c=0; c<=bays; c++){
    const off = -faceWidth/2 + cellW*c;
    if(alongX) placeFrame(wx+off, wy+midY, wz+protrude, mullionThick, totalH, frameDepth, track);
    else       placeFrame(wx+protrude, wy+midY, wz+off, frameDepth, totalH, mullionThick, track);
  }
  for(let r=0; r<=floors; r++){
    const offY = baseH + GRID_FLOOR_H*r;
    if(alongX) placeFrame(wx, wy+offY, wz+protrude, faceWidth, mullionThick, frameDepth, track);
    else       placeFrame(wx+protrude, wy+offY, wz, frameDepth, mullionThick, faceWidth, track);
  }
  for(let r=0; r<floors; r++){
    const cellY = baseH + GRID_FLOOR_H*r + GRID_FLOOR_H/2;
    for(let c=0; c<bays; c++){
      const cellOff = -faceWidth/2 + cellW*(c+0.5);
      const lit = Math.random() < litRatio;
      const warm = Math.random() < 0.6;
      if(alongX) placePanel(lit, warm, wx+cellOff, wy+cellY, wz+panelProud, cellW*0.8, GRID_FLOOR_H*0.78, panelDepth, track, nx,nz, spots);
      else       placePanel(lit, warm, wx+panelProud, wy+cellY, wz+cellOff, panelDepth, GRID_FLOOR_H*0.78, cellW*0.8, track, nx,nz, spots);
    }
  }
}

function addBuilding(x,z,w,d,h,opts){
  opts = opts||{};
  const facadeTrack = opts.track || null;
  const y = groundHeightAt(x,z);
  const group = new THREE.Group();
  const lean = (Math.random()-0.5)*0.012;

  const isRelay = h > 9 && Math.random() < 1/45;

  const tint = 0.85 + Math.random()*0.3;
  const hueShift = (Math.random()-0.5)*0.04;
  const wallCol = new THREE.Color(isRelay ? 0x1c2426 : pickBuildingPalette());
  wallCol.offsetHSL(hueShift, 0, 0).multiplyScalar(tint);
  const wallMat = buildingWallMat.clone();
  wallMat.color = wallCol;
  patchFogAndMelt(wallMat); // onBeforeCompile isn't carried over by clone()

  const body = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wallMat);
  body.position.y = h/2;
  body.rotation.z = lean;
  group.add(body);

  const baseH = Math.min(3.2, h*0.22);
  const base = new THREE.Mesh(new THREE.BoxGeometry(w+0.16,baseH,d+0.16), buildingDarkMat);
  base.position.y = baseH/2;
  group.add(base);

  const doorW = Math.min(1.6, w*0.22), doorH = Math.min(2.6, baseH*0.85);
  const doorRecess = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.5), new THREE.MeshBasicMaterial({color:0x030204}));
  doorRecess.position.set((Math.random()-0.5)*w*0.4, doorH/2, d/2+0.02);
  group.add(doorRecess);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW+0.24, doorH+0.24, 0.15), doorFrameMat);
  doorFrame.position.set(doorRecess.position.x, doorH/2, d/2-0.08);
  group.add(doorFrame);
  const doorThreshold = new THREE.Mesh(new THREE.BoxGeometry(doorW+0.5, 0.08, 0.5), doorFrameMat);
  doorThreshold.position.set(doorRecess.position.x, 0.04, d/2+0.2);
  group.add(doorThreshold);

  const pilasterMat = buildingDarkMat;
  for(const cx of [-1,1]) for(const cz of [-1,1]){
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.35,h,0.35), pilasterMat);
    p.position.set(cx*(w/2-0.1), h/2, cz*(d/2-0.1));
    group.add(p);
  }

  const cornice = new THREE.Mesh(new THREE.BoxGeometry(w+0.5, 0.4, d+0.5), buildingDarkMat);
  cornice.position.y = h - 0.2;
  group.add(cornice);

  const roofRoll = Math.random();
  if(h > 12 && roofRoll < 0.4){
    const tierW = w*(0.45+Math.random()*0.25), tierD = d*(0.45+Math.random()*0.25);
    const tierH = 1.6+Math.random()*3.2;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(tierW, tierH, tierD), wallMat);
    tier.position.set((Math.random()-0.5)*(w-tierW)*0.5, h+tierH/2, (Math.random()-0.5)*(d-tierD)*0.5);
    group.add(tier);
    const tierCap = new THREE.Mesh(new THREE.BoxGeometry(tierW+0.3, 0.3, tierD+0.3), buildingDarkMat);
    tierCap.position.set(tier.position.x, h+tierH-0.15, tier.position.z);
    group.add(tierCap);
  } else if(roofRoll < 0.7){
    const lipH = 0.5+Math.random()*0.5;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w-0.4, lipH, d-0.4), buildingDarkMat);
    lip.position.y = h+lipH/2-0.05;
    group.add(lip);
  }

  const floors = Math.max(1, Math.floor((h-baseH-0.6)/GRID_FLOOR_H));
  const litRatio = isRelay ? (0.7+Math.random()*0.2) : (opts.lit!==undefined?opts.lit:0.1+Math.random()*0.22);
  const facadeSpots = opts.spots || null;
  addFacadeGrid(w, floors, baseH, litRatio, x, y, z+d/2, true, facadeTrack, 0,1, facadeSpots);
  addFacadeGrid(w, floors, baseH, litRatio*(0.6+Math.random()*0.6), x, y, z-d/2, true, facadeTrack, 0,-1, facadeSpots);
  addFacadeGrid(d, floors, baseH, litRatio, x+w/2, y, z, false, facadeTrack, 1,0, facadeSpots);
  addFacadeGrid(d, floors, baseH, litRatio*(0.6+Math.random()*0.6), x-w/2, y, z, false, facadeTrack, -1,0, facadeSpots);

  if(Math.random()<0.55){
    const tankH = 1.2+Math.random()*1.6;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,tankH,8), buildingDarkMat);
    tank.position.set((Math.random()-0.5)*w*0.4, h+tankH/2, (Math.random()-0.5)*d*0.4);
    group.add(tank);
  } else {
    const slabH = 0.8+Math.random()*1.2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w*0.4,slabH,d*0.35), buildingDarkMat);
    slab.position.set((Math.random()-0.5)*w*0.3, h+slabH/2, (Math.random()-0.5)*d*0.3);
    group.add(slab);
  }

  if(isRelay){
    addRelayDressing(group, w, h, d, doorRecess.position.x);
  }

  group.position.set(x,y,z);
  scene.add(group);
  const obstacleEntry = { x, z, type:'rect', hw: w/2 + 0.35, hd: d/2 + 0.35, radius: Math.hypot(w/2, d/2) + 0.4 };
  obstacles.push(obstacleEntry);
  return { group, obstacleEntry, facadeTrack, isRelay };
}

function updateFacadePoolCounts(){
  gridFrameMesh.count = _counters.frame;
  windowWarmMesh.count = _counters.warm;
  windowCoolMesh.count = _counters.cool;
  windowDarkMesh.count = _counters.dark;
  windowWarmGlowMesh.count = _counters.warmGlow;
  windowCoolGlowMesh.count = _counters.coolGlow;
  rubbleMesh.count = _counters.rubble;
  puddleMesh.count = _counters.puddle;
  gridFrameMesh.instanceMatrix.needsUpdate = true;
  windowWarmMesh.instanceMatrix.needsUpdate = true;
  windowCoolMesh.instanceMatrix.needsUpdate = true;
  windowDarkMesh.instanceMatrix.needsUpdate = true;
  windowWarmGlowMesh.instanceMatrix.needsUpdate = true;
  windowCoolGlowMesh.instanceMatrix.needsUpdate = true;
  rubbleMesh.instanceMatrix.needsUpdate = true;
  puddleMesh.instanceMatrix.needsUpdate = true;
}

export {
  addBuilding, updateFacadePoolCounts, updateRelayBeacons,
  freeFacadeTrack, activeWindowSpots, rebuildActiveWindowSpots,
  registerChunkWindowSpots, unregisterChunkWindowSpots, unitBoxGeo
};
