/* ============================================================
   world/props.js — pulled from the monolith this round (world-gen mesh
   builders: buildings/props/streaming, ranked round, pulled alongside
   world/buildings.js and world/streaming.js).

   Owns: addLamp(), addStreetRibbon(), the rubble/puddle instanced-clutter
   pools (placeRubble/placePuddle/scatterClutter/scatterChunkClutter), and
   addRuin(). rubbleMesh/puddleMesh are exported for world/buildings.js's
   updateFacadePoolCounts() to flush in the same pass as the facade pools
   (see that file's header comment) — the only cross-import between the
   two, and it runs the other direction (buildings.js imports from here,
   this file does not import from buildings.js), so no cycle.

   Shared state used here now lives in world/worldData.js (obstacles,
   CHUNK_SIZE, lamps, the _counters/_alloc/_hideDummy pool primitives) or
   world/materials.js (toonRamp, stoneTex) for the same reasons noted in
   buildings.js's header — main.js's still-unmoved code needs pieces of
   both too. addGlow/meltUniform-adjacent patchFogToDistance both come
   from render/postprocessing.js, already real. */

import { scene } from '../core/scene.js';
import { groundHeightAt } from './terrain.js';
import { makeCanvas, patchFogToDistance, addGlow } from '../render/postprocessing.js';
import { toonRamp, stoneTex, streetTexture, metalTex, woodPlankTex } from './materials.js';
import { obstacles, lamps, CHUNK_SIZE, _counters, _alloc } from './worldData.js';

// shared lamp-pole material - was a flat MeshToonMaterial color (0x0d0d0e,
// no map at all), the last obviously-untextured structure alongside
// buildings/ground/street which all already carry a canvas map. One
// module-level instance since every lamp pole is visually identical.
const lampPoleMat = new THREE.MeshToonMaterial({ map:metalTex, color:0x3a3630, gradientMap:toonRamp });
patchFogToDistance(lampPoleMat);

function addLamp(x,z){
  const y = groundHeightAt(x,z);
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.08,3.2,6), lampPoleMat);
  pole.position.y = 1.6; group.add(pole);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8), new THREE.MeshBasicMaterial({color:0xffb877}));
  cap.position.y = 3.2; group.add(cap);
  const light = new THREE.PointLight(0xffa858, 1.4, 16, 2);
  light.position.y = 3.2; group.add(light);
  const glow = addGlow(group, 0xffb877, 2.6, 0.85);
  glow.position.y = 3.2;
  group.position.set(x,y,z);
  scene.add(group);
  const lampEntry = { light, glow, base:1.4, phase:Math.random()*10, x, z };
  lamps.push(lampEntry);
  return { group, lampEntry };
}

// asphalt street ribbon - follows terrain height like the ground does, so it
// doesn't float or clip. Built as a custom strip (not an axis-aligned plane)
// because streets radiate out at arbitrary angles from the map center.
const streetTex = streetTexture();
const streetMat = new THREE.MeshToonMaterial({ map:streetTex, color:0x9a969c, gradientMap:toonRamp, side:THREE.DoubleSide });
patchFogToDistance(streetMat);
function addStreetRibbon(ang, fromDist, toDist, halfWidth){
  const dirX = Math.cos(ang), dirZ = Math.sin(ang);
  const perpX = -dirZ, perpZ = dirX;
  const segs = Math.max(6, Math.round((toDist-fromDist)/6));
  const positions = [], uvs = [], indices = [];
  for(let i=0;i<=segs;i++){
    const t = i/segs;
    const dist = fromDist + (toDist-fromDist)*t;
    const cx = dirX*dist, cz = dirZ*dist;
    for(const side of [-1,1]){
      const x = cx + perpX*halfWidth*side;
      const z = cz + perpZ*halfWidth*side;
      positions.push(x, groundHeightAt(x,z)+0.025, z);
      uvs.push(side<0?0:1, t*(toDist-fromDist)/8);
    }
  }
  for(let i=0;i<segs;i++){
    const a=i*2, b=i*2+1, c=i*2+2, d=i*2+3;
    indices.push(a,b,c, b,d,c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, streetMat);
  scene.add(mesh);
  return mesh;
}

// ground clutter: rubble chunks and standing black-rain puddles, instanced
// so a few hundred of them cost almost nothing. Same alloc/free pooled-
// instance pattern as the facade grid (world/buildings.js), so streamed
// chunks can keep scattering clutter as the player walks arbitrarily far.
const RUBBLE_COUNT = 1400, PUDDLE_COUNT = 420;
const MAX_RUBBLE = 9000, MAX_PUDDLE = 2600;
const rubbleGeo = new THREE.DodecahedronGeometry(0.4, 0);
const rubbleMat = new THREE.MeshToonMaterial({ map:stoneTex, color:0x8a848e, gradientMap:toonRamp });
patchFogToDistance(rubbleMat);
const rubbleMesh = new THREE.InstancedMesh(rubbleGeo, rubbleMat, MAX_RUBBLE);
rubbleGeo.computeBoundingSphere();
scene.add(rubbleMesh);
function puddleTexture(){
  const size=128, c=makeCanvas(size), ctx=c.getContext('2d');
  const grad = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  grad.addColorStop(0,'rgba(10,6,14,0.95)');
  grad.addColorStop(0.75,'rgba(20,10,20,0.6)');
  grad.addColorStop(1,'rgba(20,10,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
const puddleGeo = new THREE.CircleGeometry(1, 16);
puddleGeo.rotateX(-Math.PI/2);
const puddleMat = new THREE.MeshBasicMaterial({
  map: puddleTexture(), transparent:true, depthWrite:false, fog:true,
  color: 0x6a3a52
});
patchFogToDistance(puddleMat);
const puddleMesh = new THREE.InstancedMesh(puddleGeo, puddleMat, MAX_PUDDLE);
puddleGeo.computeBoundingSphere();
scene.add(puddleMesh);
const freeRubble = [], freePuddle = [];
_counters.rubble = 0; _counters.puddle = 0;
const _clutterDummy = new THREE.Object3D();
// track is optional - omit it for the permanent downtown scatter, pass the
// chunk's shared facade track for streamed clutter so it frees on unload
// alongside that chunk's windows/frames (freeFacadeTrack, world/buildings.js,
// is mesh-agnostic).
function placeRubble(x,z,track){
  const idx = _alloc(freeRubble,'rubble',rubbleMesh,MAX_RUBBLE);
  if(idx<0) return false;
  const y = groundHeightAt(x,z);
  _clutterDummy.position.set(x, y+0.15, z);
  const s = 0.4+Math.random()*0.9;
  _clutterDummy.scale.set(s, s*(0.6+Math.random()*0.6), s);
  _clutterDummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
  _clutterDummy.updateMatrix();
  rubbleMesh.setMatrixAt(idx, _clutterDummy.matrix);
  if(track) track.push({mesh:rubbleMesh, list:freeRubble, idx});
  return true;
}
function placePuddle(x,z,track){
  const idx = _alloc(freePuddle,'puddle',puddleMesh,MAX_PUDDLE);
  if(idx<0) return false;
  const y = groundHeightAt(x,z);
  _clutterDummy.position.set(x, y+0.02, z);
  const s = 0.7+Math.random()*1.6;
  _clutterDummy.scale.set(s, 1, s*(0.7+Math.random()*0.5));
  _clutterDummy.rotation.set(0, Math.random()*Math.PI*2, 0);
  _clutterDummy.updateMatrix();
  puddleMesh.setMatrixAt(idx, _clutterDummy.matrix);
  if(track) track.push({mesh:puddleMesh, list:freePuddle, idx});
  return true;
}
// scatters clutter randomly within [minR,maxR] of the origin, avoiding
// obstacles - used once for the permanent downtown disc.
function scatterClutter(count, isPuddle, minR, maxR){
  let placed = 0, attempts = 0;
  while(placed < count && attempts < count*6){
    attempts++;
    const ang = Math.random()*Math.PI*2, r = minR+Math.random()*(maxR-minR);
    const x = Math.cos(ang)*r, z = Math.sin(ang)*r;
    let blocked = false;
    for(let i=0;i<obstacles.length;i++){
      const o = obstacles[i];
      const dx=x-o.x, dz=z-o.z;
      if(dx*dx+dz*dz < (o.radius+0.6)*(o.radius+0.6)){ blocked = true; break; }
    }
    if(blocked) continue;
    if((isPuddle ? placePuddle(x,z) : placeRubble(x,z))) placed++;
  }
  return placed;
}
// scatters a smaller handful of clutter within one streamed chunk's bounds,
// tracked so it frees when the chunk unloads - this is what keeps the
// ground from reading as an endless bare plain once you leave downtown.
function scatterChunkClutter(centerX, centerZ, track){
  const rubbleN = 10 + Math.floor(Math.random()*10);
  const puddleN = 2 + Math.floor(Math.random()*4);
  for(let i=0;i<rubbleN;i++){
    const x = centerX + (Math.random()-0.5)*CHUNK_SIZE*0.95;
    const z = centerZ + (Math.random()-0.5)*CHUNK_SIZE*0.95;
    let blocked = false;
    for(let j=0;j<obstacles.length;j++){
      const o = obstacles[j];
      const dx=x-o.x, dz=z-o.z;
      if(dx*dx+dz*dz < (o.radius+0.6)*(o.radius+0.6)){ blocked = true; break; }
    }
    if(!blocked) placeRubble(x,z,track);
  }
  for(let i=0;i<puddleN;i++){
    const x = centerX + (Math.random()-0.5)*CHUNK_SIZE*0.95;
    const z = centerZ + (Math.random()-0.5)*CHUNK_SIZE*0.95;
    placePuddle(x,z,track);
  }
}

function addRuin(x,z,type){
  const y = groundHeightAt(x,z);
  const mat = new THREE.MeshToonMaterial({ map:stoneTex, color:0x9a9aa0, gradientMap:toonRamp });
  patchFogToDistance(mat);
  const group = new THREE.Group();
  let radius = 2.2;
  if(type===0){
    const h = 3+Math.random()*4;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.1,h,7), mat);
    pillar.position.y = h/2; pillar.rotation.z=(Math.random()-0.5)*0.08;
    group.add(pillar); radius=1.3;
  } else if(type===1){
    const w=4+Math.random()*3, h=3+Math.random()*2;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.8,h,0.8), mat); legL.position.set(-w/2,h/2,0); group.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.8,h,0.8), mat); legR.position.set(w/2,h/2,0); group.add(legR);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w+0.8,0.8,0.8), mat); top.position.set(0,h+0.2,0); group.add(top);
    radius = w/2+1;
  } else {
    const h=2+Math.random()*2.5;
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.6+Math.random(),h,1.6+Math.random()), mat);
    block.position.y=h/2; block.rotation.y=Math.random()*Math.PI;
    group.add(block); radius=1.5;
  }
  group.position.set(x,y,z);
  scene.add(group);
  const obstacleEntry = { x, z, radius };
  obstacles.push(obstacleEntry);
  return { group, obstacleEntry };
}

// ---------- BRIDGE (new this round) ----------
// A small pedestrian footbridge - deck + plank texture, two rail runs on
// worn metal posts. Decorative/structural-clutter only for now, same tier
// as addRuin(): it doesn't span a gap or gate traversal, it's a landmark
// silhouette placed like any other rare streamed structure. Real
// gap-crossing/traversal-gating is a separate, later decision - noted in
// the handoff rather than half-built here.
const bridgeDeckMat = new THREE.MeshToonMaterial({ map:woodPlankTex, color:0xa89880, gradientMap:toonRamp });
patchFogToDistance(bridgeDeckMat);
const bridgeRailMat = new THREE.MeshToonMaterial({ map:metalTex, color:0x4a3f34, gradientMap:toonRamp });
patchFogToDistance(bridgeRailMat);

function addBridge(x,z,ang){
  const y = groundHeightAt(x,z);
  const group = new THREE.Group();
  const length = 7 + Math.random()*2, width = 2.4, deckH = 0.9;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, width), bridgeDeckMat);
  deck.position.y = deckH;
  group.add(deck);

  // support posts every ~1.6 units along the span, both edges
  const postGeo = new THREE.CylinderGeometry(0.06,0.08,deckH,6);
  const postCount = Math.max(3, Math.round(length/1.6));
  for(let i=0;i<postCount;i++){
    const px = -length/2 + (i/(postCount-1))*length;
    for(const pz of [-width/2+0.1, width/2-0.1]){
      const post = new THREE.Mesh(postGeo, bridgeRailMat);
      post.position.set(px, deckH/2, pz);
      group.add(post);
    }
  }

  // two rail runs (top + mid) on each edge, plus vertical balusters
  const railGeo = new THREE.BoxGeometry(length, 0.05, 0.05);
  const balusterGeo = new THREE.CylinderGeometry(0.025,0.025,0.85,5);
  for(const pz of [-width/2+0.1, width/2-0.1]){
    const railTop = new THREE.Mesh(railGeo, bridgeRailMat);
    railTop.position.set(0, deckH+0.85, pz);
    group.add(railTop);
    const railMid = new THREE.Mesh(railGeo, bridgeRailMat);
    railMid.position.set(0, deckH+0.42, pz);
    group.add(railMid);
    const balusterCount = Math.max(3, Math.round(length/1.1));
    for(let i=0;i<balusterCount;i++){
      const bx = -length/2 + (i/(balusterCount-1))*length;
      const bal = new THREE.Mesh(balusterGeo, bridgeRailMat);
      bal.position.set(bx, deckH+0.42, pz);
      group.add(bal);
    }
  }

  group.position.set(x, y, z);
  group.rotation.y = ang || 0;
  scene.add(group);
  // obstacle footprint sized to the rotated span's rough bounding radius,
  // same coarse circular-blocker approach addRuin() already uses
  const obstacleEntry = { x, z, radius: Math.max(length,width)/2 };
  obstacles.push(obstacleEntry);
  return { group, obstacleEntry };
}

export {
  addLamp, addStreetRibbon, addRuin, addBridge,
  rubbleMesh, puddleMesh, rubbleGeo, puddleGeo, RUBBLE_COUNT, PUDDLE_COUNT,
  placeRubble, placePuddle, scatterClutter, scatterChunkClutter
};
