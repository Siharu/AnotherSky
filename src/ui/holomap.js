/* ============================================================
   ui/holomap.js — 3D holographic map overlay.

   Unlocks once state.relayTowersConnected.size reaches
   HOLOMAP_UNLOCK_COUNT (see main.js's connectDeadRelay()) - the idea
   being each relay you bring back online feeds a little more of the
   district's shape into whatever's rebuilding the projection, so by
   the fifth one there's enough of a picture to actually show you.

   Deliberately a second, fully separate THREE.Scene/Camera/Renderer
   bound to its own <canvas id="holomap-canvas"> rather than reusing
   the main game's scene/camera - the hologram is a miniature stylized
   readout (translucent cyan wireframe, small enough to fit in a
   window), not a real render of the world from a different angle, so
   sharing the main renderer's fog/lighting/materials would fight the
   look rather than help it. Same reasoning ui/bigmap.js's separate
   canvas-2D map already applies, just in 3D instead of top-down 2D.

   Building positions (activeMinimapBuildings) and the door/tower
   coordinates are read the same way ui/bigmap.js already does -
   RADIO_TOWER_POS/HQ_TOWER_POS still have no shared module home (see
   drawBigMap()'s own comment on this), so they're passed in once from
   main.js via buildHoloTowers() rather than imported directly. */
import { state } from '../core/state.js';
import { activeMinimapBuildings } from '../world/worldData.js';

const HOLO_SCALE = 1/11; // world units -> holo-space units; keeps the ~220-radius playable area inside a roughly person-height projection
const CYAN = 0x5ad9ff;

let holoCanvas, holoRenderer, holoScene, holoCamera, holoGroup;
let playerMarker = null;
const towerMarkers = []; // { beam, cap, id, kind }
let rotY = 0.5, autoRotate = true, dragging = false, lastPointerX = 0;
let built = false;

function makeTowerMarker(x, z, color){
  const h = 2.4;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.05, h, 6),
    new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.85 })
  );
  beam.position.set(x*HOLO_SCALE, h/2, z*HOLO_SCALE);
  holoGroup.add(beam);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  cap.position.set(x*HOLO_SCALE, h, z*HOLO_SCALE);
  holoGroup.add(cap);
  return { beam, cap };
}

export function initHoloMap(){
  holoCanvas = document.getElementById('holomap-canvas');
  if(!holoCanvas || typeof THREE === 'undefined') return;
  holoRenderer = new THREE.WebGLRenderer({ canvas: holoCanvas, alpha:true, antialias:true });
  holoRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  holoScene = new THREE.Scene();
  holoCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  holoCamera.position.set(0, 9.5, 15);
  holoCamera.lookAt(0, 1.2, 0);

  holoGroup = new THREE.Group();
  holoScene.add(holoGroup);

  // faint ground disc + grid, same cyan-wireframe language as the rest
  // of the projection so nothing on it reads as "solid"
  const grid = new THREE.GridHelper(20, 20, CYAN, 0x144a55);
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  holoGroup.add(grid);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(10, 48),
    new THREE.MeshBasicMaterial({ color:CYAN, transparent:true, opacity:0.035 })
  );
  disc.rotation.x = -Math.PI/2;
  holoGroup.add(disc);

  // downtown buildings as translucent wireframe blocks - only their
  // outline, so overlapping ones don't turn into a solid cyan mass
  for(const b of activeMinimapBuildings){
    const w = Math.max(0.04, b.hw*2*HOLO_SCALE);
    const d = Math.max(0.04, b.hd*2*HOLO_SCALE);
    const h = Math.max(0.08, (b.h||6)*HOLO_SCALE*1.6);
    const geo = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.EdgesGeometry(geo);
    const color = b.type==='ruin' ? 0xff9f5a : b.type==='relay' ? 0xff5a5a : CYAN;
    const mesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent:true, opacity:0.45 }));
    mesh.position.set(b.x*HOLO_SCALE, h/2, b.z*HOLO_SCALE);
    holoGroup.add(mesh);
  }

  // player marker - small bright cone, always upright regardless of
  // holoGroup's own rotation (added directly to the scene, not the group)
  playerMarker = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.4, 6),
    new THREE.MeshBasicMaterial({ color:0xf5f2e8 })
  );
  holoScene.add(playerMarker);

  holoCanvas.addEventListener('pointerdown', e=>{ dragging=true; lastPointerX=e.clientX; autoRotate=false; });
  window.addEventListener('pointerup', ()=>{ dragging=false; });
  window.addEventListener('pointermove', e=>{
    if(!dragging) return;
    rotY += (e.clientX - lastPointerX) * 0.008;
    lastPointerX = e.clientX;
  });

  built = true;
}

// Called once from main.js after the live tower, the 8 dead relays, and
// the HQ tower all exist - same "params passed in because there's no
// shared module home yet" pattern drawBigMap(orbMeshes, RADIO_TOWER_POS,
// HQ_TOWER_POS) already uses.
export function buildHoloTowers(RADIO_TOWER_POS, HQ_TOWER_POS){
  if(!built) return;
  towerMarkers.push({ ...makeTowerMarker(RADIO_TOWER_POS.x, RADIO_TOWER_POS.z, 0xff9f5a), id:'relay-seven', kind:'live' });
  for(const t of state.deadRelayTowers){
    towerMarkers.push({ ...makeTowerMarker(t.x, t.z, 0xff5a5a), id:t.id, kind:'dead' });
  }
  towerMarkers.push({ ...makeTowerMarker(HQ_TOWER_POS.x, HQ_TOWER_POS.z, 0xff2020), id:'hq', kind:'hq' });
}

export function openHoloMap(){
  const el = document.getElementById('holomap-overlay');
  if(el) el.classList.add('open');
}
export function closeHoloMap(){
  const el = document.getElementById('holomap-overlay');
  if(el) el.classList.remove('open');
}

export function updateHoloMap(dt){
  if(!built) return;
  const overlay = document.getElementById('holomap-overlay');
  if(!overlay || !overlay.classList.contains('open')) return;

  if(autoRotate) rotY += dt*0.12;
  holoGroup.rotation.y = rotY;

  if(playerMarker){
    playerMarker.position.set(state.playerX*HOLO_SCALE, 0.25, state.playerZ*HOLO_SCALE);
    // pulses gently so it reads as a live position readout, not a fixed decal
    const pulse = 0.75 + Math.sin(performance.now()*0.005)*0.25;
    playerMarker.scale.setScalar(pulse);
  }

  // dead relays dim to a spent green once connected - the live tower
  // and the HQ tower don't change color here (their own state is
  // already legible from context: HQ is only visible on this map at
  // all once unlocked, the live tower's amber never needs to change)
  for(const m of towerMarkers){
    if(m.kind !== 'dead') continue;
    const connected = state.relayTowersConnected.has(m.id);
    const c = connected ? 0x2a6a55 : 0xff5a5a;
    m.beam.material.color.setHex(c);
    m.cap.material.color.setHex(c);
  }

  const w = holoCanvas.clientWidth, h = holoCanvas.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio||1);
  if(Math.round(holoCanvas.width) !== Math.round(w*dpr) || Math.round(holoCanvas.height) !== Math.round(h*dpr)){
    holoRenderer.setSize(w, h, false);
    holoCamera.aspect = w/Math.max(1,h);
    holoCamera.updateProjectionMatrix();
  }
  holoRenderer.render(holoScene, holoCamera);
}
