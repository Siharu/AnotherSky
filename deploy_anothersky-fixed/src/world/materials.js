/* ---------- WORLD MATERIALS / TEXTURES ----------
   Pulled from main.js (Wave 3 — world-gen chokepoint #1, see
   docs/HANDOFF.md). These are pure canvas-texture generators: their only
   real dependency is makeCanvas() (already a real export from
   render/postprocessing.js). No `state`, no `scene`, no entity data —
   confirmed via grep before moving, same mechanical-hoist shape as the
   sky.js/terrain.js/hud.js/save.js partial pulls.

   toonRamp itself is just toonGradientMap() called once at module-load
   time, same as it was inline in main.js — moving it here just gives it
   (and the texture functions that feed material construction) a real
   module home instead of living mid-file in the monolith.

   NOT moved: stoneTex/streetTex (the cached `stoneTexture()`/
   `streetTexture()` instances) and every MeshToonMaterial built from
   these — those still construct real THREE materials tied to specific
   mesh geometry defined all over main.js, so they stay put and just
   import groundTexture/stoneTexture/streetTexture/toonRamp back in,
   same pattern as makeCanvas/patchFogToDistance.

   UPDATE (Wave 3 — world/buildings.js pull): stoneTex/buildingWallMat/
   buildingDarkMat/BUILDING_PALETTES/pickBuildingPalette moved here
   after all, since world/buildings.js now needs buildingDarkMat for its
   facade-grid frame pool (gridFrameMesh) and buildingWallMat for the
   per-building wall material clone — and main.js's exit-road curb/
   traffic-light-pole code (still unmoved) also reads buildingDarkMat
   directly, so it has to live somewhere both sides can import from
   rather than in either one. Same shared-object rationale as
   world/worldData.js's obstacles/CHUNK_SIZE/DOWNTOWN_EDGE additions
   this round. These ARE real THREE material instances (not just
   texture factories) but they're dependency-free beyond makeCanvas/
   patchFogToDistance/toonRamp, all already real imports/exports here. */
import { makeCanvas, patchFogToDistance } from '../render/postprocessing.js';

function groundTexture(){
  const size=1024, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#0d0d10'; ctx.fillRect(0,0,size,size);
  // macro tonal patches - a handful of large soft blotches (wet stains, ash
  // drifts, old scorch marks) so the ground reads as weathered street rather
  // than one uniform noise tile repeated 15x15 across the whole map.
  const patchCount = 14;
  for(let i=0;i<patchCount;i++){
    const px=Math.random()*size, py=Math.random()*size, pr=60+Math.random()*160;
    const grad = ctx.createRadialGradient(px,py,0,px,py,pr);
    const kind = Math.random();
    let col;
    if(kind<0.4) col = `${18+Math.random()*10},${16+Math.random()*8},${20+Math.random()*10}`;
    else if(kind<0.7) col = `${34+Math.random()*14},${20+Math.random()*10},${26+Math.random()*12}`;
    else col = `${26+Math.random()*10},${24+Math.random()*10},${30+Math.random()*12}`;
    grad.addColorStop(0, `rgba(${col},${0.35+Math.random()*0.3})`);
    grad.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,size,size);
  }
  // speckle
  for(let i=0;i<9000;i++){
    const x=Math.random()*size, y=Math.random()*size, s=Math.random()*1.6;
    const v=Math.random()*22;
    ctx.fillStyle=`rgba(${28+v},${26+v},${30+v},${0.25+Math.random()*0.3})`;
    ctx.fillRect(x,y,s,s);
  }
  // branching cracks glowing faintly violet/rust
  function crack(x,y,ang,len,depth){
    if(depth>5||len<8) return;
    const x2=x+Math.cos(ang)*len, y2=y+Math.sin(ang)*len;
    const grad=ctx.createLinearGradient(x,y,x2,y2);
    grad.addColorStop(0,'rgba(122,60,90,0.55)');
    grad.addColorStop(1,'rgba(60,20,30,0.15)');
    ctx.strokeStyle=grad;
    ctx.lineWidth=Math.max(0.6,3-depth*0.5);
    ctx.shadowColor='rgba(140,70,110,0.5)';
    ctx.shadowBlur=6;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.shadowBlur=0;
    const branches = Math.random()<0.7?2:1;
    for(let i=0;i<branches;i++){
      crack(x2,y2, ang + (Math.random()-0.5)*1.3, len*(0.55+Math.random()*0.3), depth+1);
    }
  }
  const seeds = 6;
  for(let i=0;i<seeds;i++){
    crack(Math.random()*size, Math.random()*size, Math.random()*Math.PI*2, 60+Math.random()*70, 0);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(15,15);
  return tex;
}

// asphalt strip texture for the streets - visually distinct from the ground
// (darker, cooler, tire-streaked) with a broken center line baked in.
function streetTexture(){
  const size=256, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#0a0a0c'; ctx.fillRect(0,0,size,size);
  for(let i=0;i<2200;i++){
    const x=Math.random()*size, y=Math.random()*size, s=Math.random()*1.4;
    const v=Math.random()*16;
    ctx.fillStyle=`rgba(${20+v},${19+v},${22+v},${0.3+Math.random()*0.35})`;
    ctx.fillRect(x,y,s,s);
  }
  for(let i=0;i<10;i++){
    const x = 20+Math.random()*(size-40);
    const grad = ctx.createLinearGradient(x,0,x,size);
    grad.addColorStop(0,'rgba(6,6,8,0)');
    grad.addColorStop(0.5,'rgba(4,4,6,0.4)');
    grad.addColorStop(1,'rgba(6,6,8,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x-3,0,6,size);
  }
  const dashW = 10, dashLen = 26, gapLen = 22, cx = size/2;
  for(let y=0; y<size; y+=dashLen+gapLen){
    ctx.fillStyle = 'rgba(150,138,120,0.35)';
    ctx.fillRect(cx-dashW/2, y, dashW, dashLen);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function stoneTexture(){
  const size=512, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#1c1a1c'; ctx.fillRect(0,0,size,size);
  for(let i=0;i<4000;i++){
    const x=Math.random()*size,y=Math.random()*size, v=Math.random()*30;
    ctx.fillStyle=`rgba(${40+v},${38+v},${40+v},${0.2+Math.random()*0.4})`;
    ctx.fillRect(x,y,Math.random()*3,Math.random()*3);
  }
  for(let i=0;i<10;i++){
    ctx.strokeStyle='rgba(8,8,9,0.5)'; ctx.lineWidth=1+Math.random()*2;
    ctx.beginPath(); ctx.moveTo(Math.random()*size,Math.random()*size);
    ctx.lineTo(Math.random()*size,Math.random()*size); ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// worn painted metal - lamp poles/caps and (new this round) bridge rails
// were flat MeshBasicMaterial/MeshToonMaterial colors with no map at all,
// the one obviously "unfinished" surface type left next to the textured
// ground/street/stone/radio props. Same procedural-canvas approach as the
// rest of this file: base coat + streak/scratch wear + rust bleed at the
// edges, so it reads as "old metal that's been rained on" rather than a
// clean flat color.
function metalTexture(){
  const size=256, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#141316'; ctx.fillRect(0,0,size,size);
  for(let i=0;i<340;i++){
    const x=Math.random()*size;
    const v=8+Math.random()*14;
    ctx.strokeStyle=`rgba(${v+18},${v+16},${v+18},${0.05+Math.random()*0.12})`;
    ctx.lineWidth=0.5+Math.random()*1.2;
    ctx.beginPath();
    ctx.moveTo(x, Math.random()*size*0.2);
    ctx.lineTo(x+(Math.random()-0.5)*4, size*0.8+Math.random()*size*0.2);
    ctx.stroke();
  }
  for(let i=0;i<160;i++){
    const x=Math.random()*size, y=Math.random()*size, s=1+Math.random()*3;
    ctx.fillStyle=`rgba(${40+Math.random()*20},${38+Math.random()*18},${40+Math.random()*20},${0.15+Math.random()*0.25})`;
    ctx.fillRect(x,y,s,s*0.6);
  }
  for(let i=0;i<26;i++){
    const x=Math.random()*size, y=size*0.55+Math.random()*size*0.45;
    const r=6+Math.random()*22;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(112,52,26,0.45)');
    g.addColorStop(1,'rgba(112,52,26,0)');
    ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1,2);
  return tex;
}
const metalTex = metalTexture();

// weathered wood planking - new this round for the bridge deck. Same
// wear-pass shape as metalTexture(): base grain, then damage/staining
// layered on top so it reads as old boards, not a clean plank material.
function woodPlankTexture(){
  const size=256, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#241c14'; ctx.fillRect(0,0,size,size);
  const plankH = size/8;
  for(let p=0;p<8;p++){
    const y = p*plankH;
    const base = 26+Math.random()*14;
    ctx.fillStyle = `rgb(${base+18},${base+10},${base})`;
    ctx.fillRect(0,y+1,size,plankH-2);
    for(let i=0;i<10;i++){
      const gy = y+2+Math.random()*(plankH-4);
      ctx.strokeStyle=`rgba(10,7,5,${0.15+Math.random()*0.2})`;
      ctx.lineWidth=0.5+Math.random();
      ctx.beginPath(); ctx.moveTo(0,gy);
      for(let x=0;x<=size;x+=24) ctx.lineTo(x, gy+(Math.random()-0.5)*2.5);
      ctx.stroke();
    }
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.fillRect(0,y,size,1.5);
  }
  for(let i=0;i<10;i++){
    const x=Math.random()*size, y=Math.random()*size, r=8+Math.random()*20;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(6,5,4,0.4)');
    g.addColorStop(1,'rgba(6,5,4,0)');
    ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1,4);
  return tex;
}
const woodPlankTex = woodPlankTexture();

// worn brick facade - buildings were using the same stoneTex as ruins/
// radio-adjacent stone props, which reads fine for rubble but flat and
// generic for actual building walls. Real brick coursing (offset rows +
// mortar grooves) plus two wear passes: grime/soot streaking running down
// from the top like real rain-fed staining, and a soft AO darkening along
// the bottom edge so the wall reads as sitting in its own shadow rather
// than floating flat-lit.
function brickTexture(){
  const size=512, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#241d1a'; ctx.fillRect(0,0,size,size); // mortar base color shows through the grooves
  const brickW=42, brickH=18, mortar=3;
  let row=0;
  for(let y=0;y<size;y+=brickH+mortar){
    const offset = (row%2===0) ? 0 : -(brickW+mortar)/2;
    for(let x=offset;x<size;x+=brickW+mortar){
      const v = 34+Math.random()*20;
      const warmth = Math.random()*10;
      ctx.fillStyle = `rgb(${v+warmth+6|0},${v-2|0},${v-8|0})`;
      ctx.fillRect(x, y, brickW, brickH);
      // per-brick subtle shading so bricks aren't perfectly flat individually
      if(Math.random()<0.5){
        ctx.fillStyle = `rgba(0,0,0,${0.06+Math.random()*0.1})`;
        ctx.fillRect(x, y, brickW, brickH*0.4);
      }
    }
    row++;
  }
  // grime/soot streaks - vertical, biased from the top, irregular width
  for(let i=0;i<22;i++){
    const x = Math.random()*size, w = 8+Math.random()*22;
    const g = ctx.createLinearGradient(x,0,x,size);
    g.addColorStop(0, 'rgba(6,5,5,0.28)');
    g.addColorStop(0.6, 'rgba(6,5,5,0.12)');
    g.addColorStop(1, 'rgba(6,5,5,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x-w/2, 0, w, size);
  }
  // soft ambient-occlusion darkening along the bottom edge (grounds the wall)
  const ao = ctx.createLinearGradient(0,size*0.72,0,size);
  ao.addColorStop(0,'rgba(0,0,0,0)');
  ao.addColorStop(1,'rgba(0,0,0,0.4)');
  ctx.fillStyle = ao; ctx.fillRect(0,size*0.72,size,size*0.28);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2,3);
  return tex;
}
const brickTex = brickTexture();

// corkboard - new this round for the safehouse radio room's 90's-office
// pass. Same wear-pass shape as the other procedural textures: base cork
// speckle, then pin holes/torn-paper edges scattered on top so it reads
// as a used board, not a clean material swatch.
function corkboardTexture(){
  const size=256, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#a97a4a'; ctx.fillRect(0,0,size,size);
  for(let i=0;i<2400;i++){
    const x=Math.random()*size, y=Math.random()*size;
    const v=Math.random()*30-15;
    ctx.fillStyle=`rgba(${140+v|0},${100+v|0},${62+v|0},${0.15+Math.random()*0.25})`;
    ctx.fillRect(x,y,1+Math.random()*1.5,1+Math.random()*1.5);
  }
  // thin wood frame border
  ctx.strokeStyle='rgba(40,26,14,0.9)'; ctx.lineWidth=10;
  ctx.strokeRect(5,5,size-10,size-10);
  // a few pinned scraps - flat pale rectangles at slight angles, just
  // enough to suggest paperwork without needing to render legible text
  for(let i=0;i<5;i++){
    const w=30+Math.random()*26, h=22+Math.random()*20;
    const x=20+Math.random()*(size-60), y=20+Math.random()*(size-60);
    ctx.save();
    ctx.translate(x+w/2,y+h/2); ctx.rotate((Math.random()-0.5)*0.3);
    ctx.fillStyle = `rgba(${210+Math.random()*20|0},${200+Math.random()*15|0},${175+Math.random()*15|0},0.92)`;
    ctx.fillRect(-w/2,-h/2,w,h);
    ctx.strokeStyle='rgba(30,20,12,0.4)'; ctx.lineWidth=1;
    for(let l=0;l<3;l++){
      ctx.beginPath(); ctx.moveTo(-w/2+3, -h/2+5+l*5); ctx.lineTo(w/2-3, -h/2+5+l*5); ctx.stroke();
    }
    ctx.restore();
    // pin dot
    ctx.fillStyle='rgba(150,20,20,0.85)';
    ctx.beginPath(); ctx.arc(x+w/2, y+3, 2.4, 0, Math.PI*2); ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}
const corkboardTex = corkboardTexture();

// kitchen tile - new this round for the kitchen pass. Small ceramic
// squares with visible grout lines, then a wear pass (chipped corners,
// faint yellow-brown staining concentrated low/near the sink area of
// whatever surface uses it) so it reads as an old, used kitchen rather
// than a bathroom-clean swatch.
function tileTexture(){
  const size=256, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#26221e'; ctx.fillRect(0,0,size,size); // grout base
  const tile=32, gap=2;
  for(let y=0;y<size;y+=tile){
    for(let x=0;x<size;x+=tile){
      const v = 168+Math.random()*24;
      ctx.fillStyle = `rgb(${v|0},${v-4|0},${v-14|0})`;
      ctx.fillRect(x+gap, y+gap, tile-gap*2, tile-gap*2);
      if(Math.random()<0.12){
        // chipped corner
        ctx.fillStyle='rgba(30,26,22,0.5)';
        const cx=x+gap+(Math.random()<0.5?0:tile-gap*2-6), cy=y+gap+(Math.random()<0.5?0:tile-gap*2-6);
        ctx.fillRect(cx,cy,6,6);
      }
    }
  }
  // grime/staining, biased toward the lower third
  for(let i=0;i<16;i++){
    const x=Math.random()*size, y=size*0.5+Math.random()*size*0.5, r=10+Math.random()*24;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(90,70,30,0.22)');
    g.addColorStop(1,'rgba(90,70,30,0)');
    ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2,1.4);
  return tex;
}
const tileTex = tileTexture();

// woven fabric - new this round, closes out the last flat-color items
// in the safehouse (mattress ticking / blanket / pillow). Simple
// crosshatch weave plus a few worn/frayed patches, tinted per-material
// via the mesh's own color like every other texture in this file.
function fabricTexture(){
  const size=128, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#808080'; ctx.fillRect(0,0,size,size);
  for(let y=0;y<size;y+=3){
    ctx.strokeStyle=`rgba(0,0,0,${0.08+Math.random()*0.06})`;
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(size,y); ctx.stroke();
  }
  for(let x=0;x<size;x+=3){
    ctx.strokeStyle=`rgba(255,255,255,${0.04+Math.random()*0.05})`;
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,size); ctx.stroke();
  }
  for(let i=0;i<8;i++){
    const x=Math.random()*size, y=Math.random()*size, r=6+Math.random()*14;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(0,0,0,0.18)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2,2);
  return tex;
}
const fabricTex = fabricTexture();

// worn interior plaster - the safehouse's own interior walls
// (`wallMat` in `world/safehouse.js`) were still a flat color with no
// map at all, the last untextured surface in the interior after this
// round's furniture/appliance pass. Subtle by design - a wall shouldn't
// compete with the furniture sitting in front of it - just enough
// noise/staining/hairline cracking to read as plaster, not vinyl.
function plasterTexture(){
  const size=256, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.fillStyle='#8a8478'; ctx.fillRect(0,0,size,size);
  for(let i=0;i<3000;i++){
    const x=Math.random()*size, y=Math.random()*size;
    const v=Math.random()*14-7;
    ctx.fillStyle=`rgba(${138+v|0},${132+v|0},${120+v|0},${0.08+Math.random()*0.14})`;
    ctx.fillRect(x,y,1,1);
  }
  // faint water-stain patches, low opacity
  for(let i=0;i<6;i++){
    const x=Math.random()*size, y=Math.random()*size, r=20+Math.random()*40;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(90,80,60,0.12)');
    g.addColorStop(1,'rgba(90,80,60,0)');
    ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  // hairline cracks
  function crack(x,y,ang,len,depth){
    if(depth>3||len<10) return;
    const x2=x+Math.cos(ang)*len, y2=y+Math.sin(ang)*len;
    ctx.strokeStyle='rgba(50,44,36,0.18)';
    ctx.lineWidth=0.6;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
    if(Math.random()<0.6) crack(x2,y2, ang+(Math.random()-0.5)*1.0, len*0.6, depth+1);
  }
  for(let i=0;i<3;i++) crack(Math.random()*size, Math.random()*size, Math.random()*Math.PI*2, 30+Math.random()*30, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2,1);
  return tex;
}
const plasterTex = plasterTexture();

/* toon shading ramp: hard 3-step bands instead of smooth PBR falloff */
function toonGradientMap(){
  const c = makeCanvas(4);
  const ctx = c.getContext('2d');
  const shades = ['#2a2a30','#5c5866','#8f889a','#c4bdc9'];
  for(let i=0;i<4;i++){ ctx.fillStyle = shades[i]; ctx.fillRect(i,0,1,1); }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
const toonRamp = toonGradientMap();

/* ---------- shared building materials/palette ----------
   Pulled verbatim from main.js alongside world/buildings.js this round -
   see the header comment above for why these live here instead of in
   buildings.js itself. */
const stoneTex = stoneTexture();

const buildingWallMat = new THREE.MeshToonMaterial({ map: brickTex, color:0x86828c, gradientMap:toonRamp });
patchFogToDistance(buildingWallMat);
const buildingDarkMat = new THREE.MeshToonMaterial({ color:0x0c0a0e, gradientMap:toonRamp });
patchFogToDistance(buildingDarkMat);

// Building wasn't reading as "many different buildings" so much as "one
// gray box repeated" - the old single base hex (0x86828c) only ever got a
// narrow +-15% tint and +-0.04 hue nudge, which is nowhere near enough
// separation once toon shading and the dim night lighting crush it. A
// small weighted palette of genuinely distinct base tones (near-black,
// two greys, one warm dark brick) gives real block-to-block variation
// while keeping the district's overall dark, oppressive read intact -
// black/near-black is still the majority weight, not just one option
// among equals.
const BUILDING_PALETTES = [
  { color:0x201e22, weight:0.36 }, // near-black charcoal - the "everything is black" default, kept as the majority tone on purpose
  { color:0x4c4952, weight:0.30 }, // mid grey
  { color:0x716a5e, weight:0.18 }, // warm dark grey/brick - breaks the cool-gray monotony
  { color:0x8a8790, weight:0.16 }, // lighter grey - the rarest, reads almost pale against the rest of the block
];
function pickBuildingPalette(){
  const r = Math.random();
  let acc = 0;
  for(const p of BUILDING_PALETTES){ acc += p.weight; if(r <= acc) return p.color; }
  return BUILDING_PALETTES[0].color;
}

export {
  groundTexture, streetTexture, stoneTexture, metalTexture, woodPlankTexture, brickTexture, corkboardTexture, tileTexture, fabricTexture, plasterTexture, toonGradientMap, toonRamp,
  stoneTex, metalTex, woodPlankTex, brickTex, corkboardTex, tileTex, fabricTex, plasterTex, buildingWallMat, buildingDarkMat, BUILDING_PALETTES, pickBuildingPalette
};
