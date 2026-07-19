/* ---------- GHUULS (the watchers) ----------
   Pulled from main.js (Wave 3 — world-gen/entities chokepoint #2, see
   docs/HANDOFF.md). The live PATROL/ALERT/HUNT/SEARCH/RETREAT AI state
   machine, its vision/hearing checks, and the ghuul registry itself.

   Dependencies, all confirmed real module exports: `state` (core/
   state.js), `scene`/`camera` (core/scene.js), `groundHeightAt`
   (world/terrain.js), `showWhisper` (ui/whisper.js). `toonRamp`/
   `patchFogToDistance` are no longer needed here - the visual redesign
   below replaced the toon-shaded 3D body with a flat glitch-shader
   billboard (`fog:false` handles fog itself, no toon gradient map).

   One remaining external dependency: playStinger() (audio system, no
   module home yet - it shares module-scope audioCtx/masterGain with
   the rest of main.js's AUDIO block, a separate, much larger pull).
   Rather than block this entire file on that, updateGhuul() takes the
   stinger function as a parameter instead of calling a global -
   main.js passes its local playStinger at the two call sites. THREE is
   used as a global, same as the rest of the codebase (no ES import -
   see docs/HANDOFF.md's "READ THIS FIRST" section on THREE/anime). */
import { state } from '../core/state.js';
import { scene, camera } from '../core/scene.js';
import { groundHeightAt } from '../world/terrain.js';
import { obstacles } from '../world/worldData.js';
import { showWhisper } from '../ui/whisper.js';
import { isInSafeZone } from '../systems/zones.js';

// ---------- VISUAL REDESIGN: hidden presence, not a solid tailing model ----------
// The ghuul used to be a permanently-visible toon-shaded cylinder+sphere
// body with two glowing eye spheres - always rendered, always facing the
// player once alert, closing distance in a straight line. That reads as
// "a block with red eyes following you," not horror: the player's entire
// threat picture came from staring at a solid 3D model with no ambiguity
// about what it was or where it was.
//
// The fix borrows the visual language already established elsewhere in
// this game for exactly this feeling - the window-apparition
// (figureMesh/figureMaterial in main.js): normally invisible, a black
// silhouette rendered through a chromatic-aberration/RGB-split glitch
// shader, revealed only in brief, uncontrollable flickers. The ghuul now
// works the same way: the AI state machine below (PATROL/ALERT/HUNT/
// SEARCH/RETREAT) and the minimap/bigmap blips are UNCHANGED and always
// track its true position - so the map keeps telling the truth ("it's
// right behind you") while the 3D world mostly doesn't show it, which is
// the actual ask: something present but not reliably visible, seen only
// as a distant, glitching wrongness rather than a character model.
//
// Visibility is its own state machine (visPhase), separate from AI
// state, but weighted by it:
//   PATROL/RETREAT - rare, brief, distant-only glimpses (long cooldowns,
//     gated to dist > GLIMPSE_MIN_DIST so it never resolves as a clean
//     close-up model)
//   ALERT/SEARCH   - shorter cooldowns, glimpses can happen closer
//   HUNT           - the one state where fairness matters (the player is
//     actually being chased and needs to react) - visibility duty-cycles
//     at a fast, harsh strobe instead of going solid, so it's reliably
//     seen without ever settling into a clean, starable model.
//
// The billboard always faces the camera (matches figureMesh's plane
// approach) since a flat, glitch-shaded silhouette reads as "wrong" far
// better than a rigged 3D toon body ever did for this purpose.

const GLIMPSE_MIN_DIST = 9; // PATROL/ALERT/SEARCH/RETREAT glimpses never trigger closer than this - keeps them "distant" as asked
const GHUUL_TEX_W = 200, GHUUL_TEX_H = 340;

function ghuulTexture(){
  const c = document.createElement('canvas'); c.width = GHUUL_TEX_W; c.height = GHUUL_TEX_H;
  const ctx = c.getContext('2d');
  const w = GHUUL_TEX_W, h = GHUUL_TEX_H;
  ctx.fillStyle = '#030203';
  // deliberately wrong proportions - too tall, hunched, one arm too long -
  // so even a clean silhouette (before any glitching) doesn't read as an
  // ordinary person the way figureTexture's window apparition does
  ctx.beginPath();
  ctx.ellipse(w*0.52, h*0.12, w*0.10, h*0.085, 0.12, 0, Math.PI*2); // head, off-center/tilted
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.34, h*0.22);
  ctx.quadraticCurveTo(w*0.55, h*0.16, w*0.7, h*0.24); // hunched shoulders
  ctx.quadraticCurveTo(w*0.62, h*0.5, w*0.58, h*0.74);
  ctx.quadraticCurveTo(w*0.48, h*0.78, w*0.4, h*0.74);
  ctx.quadraticCurveTo(w*0.36, h*0.48, w*0.34, h*0.22);
  ctx.closePath();
  ctx.fill();
  // one unnaturally long trailing arm
  ctx.beginPath();
  ctx.moveTo(w*0.36, h*0.26);
  ctx.quadraticCurveTo(w*0.22, h*0.5, w*0.28, h*0.82);
  ctx.lineTo(w*0.35, h*0.8);
  ctx.quadraticCurveTo(w*0.3, h*0.5, w*0.42, h*0.28);
  ctx.closePath();
  ctx.fill();
  // legs, close together, slightly bent (never a natural walk cycle needed - it's a flat glitch silhouette)
  ctx.fillRect(w*0.42, h*0.74, w*0.07, h*0.24);
  ctx.fillRect(w*0.5, h*0.74, w*0.07, h*0.24);
  // corrupted scanline slices, same technique as figureTexture - reads
  // glitched even in a single static frame before the shader animates it
  ctx.globalCompositeOperation = 'destination-out';
  for(let i=0;i<16;i++){
    const y = Math.random()*h, sliceH = 1+Math.random()*6, xOff=(Math.random()-0.5)*36;
    ctx.fillRect(xOff, y, w, sliceH);
  }
  ctx.globalCompositeOperation = 'source-over';
  // eyes are baked into the texture itself, not separate 3D meshes - a
  // dim red glow that only ever shows when the glitch shader lets any of
  // this silhouette through at all, never a persistent beacon
  ctx.fillStyle = '#7a0e12';
  ctx.beginPath(); ctx.ellipse(w*0.48, h*0.115, 2.2, 1.6, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w*0.565, h*0.12, 2.2, 1.6, 0, 0, Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(c);
}

// Shared vertex/fragment shader source - same chromatic-aberration/
// scanline-tear/flicker technique as main.js's figureMaterial, but each
// ghuul gets its OWN ShaderMaterial instance below (own uniforms object)
// since multiple ghuuls need independent opacity/glitch/time state.
const GHUUL_VERTEX_SHADER = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
const GHUUL_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uGlitch;
  float hash(float n){ return fract(sin(n*127.1)*43758.5453); }
  void main(){
    float row = floor(vUv.y*90.0);
    float tear = (hash(row + floor(uTime*9.0)) - 0.5) * uGlitch * 0.5;
    vec2 uv = vec2(clamp(vUv.x + tear, 0.0, 1.0), vUv.y);
    float split = 0.006 + uGlitch*0.025;
    float r = texture2D(uMap, uv + vec2(split,0.0)).a;
    float g = texture2D(uMap, uv).a;
    float b = texture2D(uMap, uv - vec2(split,0.0)).a;
    vec3 col = vec3(r*0.9, g*0.95, b);
    float flicker = 0.7 + 0.3*sin(uTime*40.0) * step(0.5, hash(floor(uTime*16.0)));
    float a = max(r,max(g,b)) * uOpacity * mix(1.0, flicker, uGlitch);
    gl_FragColor = vec4(col, a);
  }
`;
let _sharedGhuulTexture = null;
function getGhuulTexture(){
  if(!_sharedGhuulTexture) _sharedGhuulTexture = ghuulTexture();
  return _sharedGhuulTexture;
}

function createGhuul(spawnRadius){
  const material = new THREE.ShaderMaterial({
    vertexShader: GHUUL_VERTEX_SHADER, fragmentShader: GHUUL_FRAGMENT_SHADER,
    uniforms:{ uMap:{value:getGhuulTexture()}, uOpacity:{value:0}, uTime:{value:0}, uGlitch:{value:0.2} },
    transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false
  });
  const group = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.55), material);
  plane.position.y = 1.28;
  group.add(plane);
  group.visible = false; // hidden by default - only shown during a glimpse/hunt window
  scene.add(group);
  const startAng = Math.random()*Math.PI*2;
  const ax = Math.cos(startAng)*spawnRadius, az = Math.sin(startAng)*spawnRadius;
  return {
    group, material, plane,
    x: ax, z: az,
    anchorX: ax, anchorZ: az,
    aiState: 'PATROL',
    stateTimer: 0,
    patrolTarget: null,
    suspicionX: 0, suspicionZ: 0,
    lastSeenX: ax, lastSeenZ: az,
    timeSinceSeen: 999,
    searchTimer: 0,
    retreatTimer: 0,
    dirX: 0, dirZ: -1,
    // visibility/glimpse state - independent of AI state, just weighted by it
    visPhase: 'hidden',      // hidden -> glimpse -> hidden (or, in HUNT, a continuous strobe)
    visTimer: 6 + Math.random()*14, // time until first possible glimpse
    visClock: 0,
    warnedSafeZone: false, // "it won't follow you here." only fires once per ghuul, not every safe-zone entry
  };
}

// ---------- PHANTOM SIGHTING (sanity hallucination) ----------
// A fake ghuul sighting triggered by low sanity (systems/sanity.js),
// visually identical to a real glimpse (same texture, same glitch
// shader - the whole point is the player can't tell the difference in
// the moment) but mechanically inert: never added to ghuulList, so it
// has zero interaction with the AI state machine, hearing/vision
// checks, collision, or the minimap/bigmap blips that always track real
// ghuuls' true positions. Purely a scare, self-disposing after one
// flicker-in/hold/flicker-out cycle rather than persisting like a real
// ghuul's glimpse/hidden cycle does.
export function triggerPhantomSighting(px, pz){
  const ang = Math.random()*Math.PI*2;
  const dist = 14 + Math.random()*14; // distant-only, same reasoning as GLIMPSE_MIN_DIST for real ghuuls - never resolves as a clean close-up
  const x = px + Math.cos(ang)*dist, z = pz + Math.sin(ang)*dist;
  const material = new THREE.ShaderMaterial({
    vertexShader: GHUUL_VERTEX_SHADER, fragmentShader: GHUUL_FRAGMENT_SHADER,
    uniforms:{ uMap:{value:getGhuulTexture()}, uOpacity:{value:0}, uTime:{value:0}, uGlitch:{value:0.6} },
    transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.55), material);
  const gy = groundHeightAt(x, z);
  plane.position.set(x, gy+1.28, z);
  scene.add(plane);

  const start = performance.now();
  const HOLD_MS = 900 + Math.random()*700; // shorter than a real glimpse (350-750ms) - long enough to register, gone before it can be studied or mistaken for a real hunt-state strobe
  (function tick(){
    const elapsed = performance.now() - start;
    const frac = elapsed / HOLD_MS;
    material.uniforms.uTime.value = elapsed/1000;
    material.uniforms.uGlitch.value = 0.5 + Math.random()*0.4;
    plane.lookAt(camera.position.x, gy+1.28, camera.position.z);
    // hard glitch flicker like a real glimpse's uOpacity logic, not a
    // smooth fade - stays consistent with "broken signal catching it,"
    // never politely materializes/dematerializes
    material.uniforms.uOpacity.value = frac < 0.85 ? (Math.random() < 0.7 ? 1 : 0.2) : 0;
    if(elapsed < HOLD_MS){
      requestAnimationFrame(tick);
    } else {
      scene.remove(plane);
      material.dispose();
      plane.geometry.dispose();
    }
  })();
}

const ghuulList = [ createGhuul(65) ];
let ghuulSpawnThresholds = [3, 6];
function maybeSpawnGhuul(){
  const c = state.collected.size;
  if(isInSafeZone(state.playerX, state.playerZ)) return; // the tower keeps something back, including new arrivals
  if(ghuulSpawnThresholds.length && c>=ghuulSpawnThresholds[0]){
    ghuulSpawnThresholds.shift();
    ghuulList.push(createGhuul(90));
    showWhisper("another one just woke up.");
  }
}

function ghuulVisionRange(){
  const fogFactor = THREE.MathUtils.clamp(1 - (scene.fog.density-0.005)*110, 0.35, 1);
  return 42 * fogFactor;
}
function ghuulHearingRadius(){
  return 6 + state.noise*24;
}
function ghuulFacingPlayer(g, px, pz){
  const dx=px-g.x, dz=pz-g.z, d=Math.hypot(dx,dz)||0.001;
  const dot = (g.dirX*dx + g.dirZ*dz)/d;
  return dot > 0.5;
}
// Line-of-sight occlusion - previously canSee only checked distance/fog,
// facing direction, and a small miss-chance, with zero awareness of
// buildings: a ghuul could "see" straight through a wall. Reuses the
// same `obstacles` array world/buildings.js already populates for player
// collision (every building registers its footprint there) rather than
// building parallel geometry just for this - each obstacle carries a
// `radius` (a bounding-circle approximation of its rect footprint,
// already computed at registration time), so this is a cheap segment-vs-
// circle test rather than a full segment-vs-AABB one. Slightly
// conservative near a building's corners (can occasionally block a line
// that a precise rectangle test wouldn't), which is the safe direction
// to err for a horror game's fairness - a rare early break in line of
// sight costs nothing, a ghuul seeing through a wall it shouldn't costs
// player trust in the mechanic.
function lineOfSightBlocked(gx, gz, px, pz){
  const dx = px-gx, dz = pz-gz;
  const len2 = dx*dx + dz*dz;
  if(len2 < 0.0001) return false;
  for(const o of obstacles){
    const t = Math.max(0, Math.min(1, ((o.x-gx)*dx + (o.z-gz)*dz)/len2));
    const cx = gx + dx*t, cz = gz + dz*t;
    const ddx = o.x-cx, ddz = o.z-cz;
    if(ddx*ddx + ddz*ddz < o.radius*o.radius) return true;
  }
  return false;
}
function ghuulMoveToward(g, tx, tz, speed, dt){
  const dx=tx-g.x, dz=tz-g.z, d=Math.hypot(dx,dz)||0.001;
  if(d>0.35){
    g.x += dx/d*speed*dt;
    g.z += dz/d*speed*dt;
    g.dirX = dx/d; g.dirZ = dz/d;
  }
}
function ghuulMoveAway(g, px, pz, speed, dt){
  const dx=g.x-px, dz=g.z-pz, d=Math.hypot(dx,dz)||0.001;
  g.x += dx/d*speed*dt; g.z += dz/d*speed*dt;
  g.dirX = dx/d; g.dirZ = dz/d;
}
function ghuulPatrolStep(g, dt){
  if(!g.patrolTarget || Math.hypot(g.x-g.patrolTarget.x, g.z-g.patrolTarget.z)<1.4){
    const ang = Math.random()*Math.PI*2, r = 4+Math.random()*11;
    g.patrolTarget = { x: g.anchorX+Math.cos(ang)*r, z: g.anchorZ+Math.sin(ang)*r };
  }
  ghuulMoveToward(g, g.patrolTarget.x, g.patrolTarget.z, 0.85, dt);
}
function alertGhuulToward(g, tx, tz){
  if(g.aiState!=='PATROL') return false;
  g.aiState='ALERT'; g.suspicionX=tx; g.suspicionZ=tz; g.stateTimer=0;
  return true;
}

// stinger: the audio "it sees you" sting - passed in from main.js since
// the audio system (audioCtx/masterGain) doesn't have a module home yet.
// See file header.
function updateGhuul(dt, stinger){
  const px=state.playerX, pz=state.playerZ;

  for(const g of ghuulList){
    g.stateTimer += dt;
    const dx=px-g.x, dz=pz-g.z;
    const dist = Math.hypot(dx,dz) || 0.001;

    const withinVision = dist < ghuulVisionRange();
    const withinHearing = dist < ghuulHearingRadius();
    // ordered last - JS's && short-circuits, so the per-obstacle
    // occlusion loop only ever runs once the cheap checks already passed,
    // not on every ghuul every frame regardless of whether it could
    // matter
    const canSee = withinVision && ghuulFacingPlayer(g, px, pz) && Math.random()>0.015
      && !lineOfSightBlocked(g.x, g.z, px, pz);

    // Safe zone: the player standing within the radio tower's radius
    // forces any actively-threatening ghuul to break off, checked before
    // the state switch below rather than folded into it - this way
    // every existing state (ALERT/HUNT/STALK) gets the same override
    // without needing its own separate safe-zone branch duplicated three
    // times. The switch's own RETREAT case then handles movement
    // normally on this and subsequent frames - no special-casing needed
    // there.
    if(isInSafeZone(px, pz) && (g.aiState==='HUNT' || g.aiState==='ALERT' || g.aiState==='STALK')){
      g.aiState='RETREAT'; g.retreatTimer=4+Math.random()*3; g.stateTimer=0;
      if(!g.warnedSafeZone){ showWhisper("it won't follow you here."); g.warnedSafeZone=true; }
    }

    switch(g.aiState){
      case 'PATROL':
        ghuulPatrolStep(g, dt);
        if(canSee){
          g.aiState='HUNT'; g.timeSinceSeen=0; g.stateTimer=0;
          if(stinger) stinger(); showWhisper('it sees you.');
        } else if(withinHearing){
          g.aiState='ALERT'; g.suspicionX=px; g.suspicionZ=pz; g.stateTimer=0;
        }
        break;

      case 'ALERT':
        ghuulMoveToward(g, g.suspicionX, g.suspicionZ, 1.9, dt);
        if(canSee){
          g.aiState='HUNT'; g.timeSinceSeen=0; g.stateTimer=0;
          if(stinger) stinger(); showWhisper('it found you.');
        } else if(withinHearing){
          g.suspicionX=px; g.suspicionZ=pz;
        } else if(g.stateTimer>6.5){
          // 35% of the time, losing the trail doesn't mean losing
          // interest - it starts shadowing at a distance instead of
          // resetting to oblivious patrol. Keeps a memory of roughly
          // where it lost track of things (suspicionX/Z) as its initial
          // stalk anchor.
          if(Math.random()<0.35){ g.aiState='STALK'; g.stateTimer=0; g.stalkSeenTimer=0; }
          else { g.aiState='PATROL'; g.stateTimer=0; }
        }
        break;

      case 'HUNT':
        g.lastSeenX=px; g.lastSeenZ=pz;
        ghuulMoveToward(g, px, pz, 3.5, dt);
        if(canSee){
          g.timeSinceSeen=0;
        } else {
          g.timeSinceSeen += dt;
          if(g.timeSinceSeen>2.4){ g.aiState='SEARCH'; g.searchTimer=0; g.stateTimer=0; }
        }
        if(g.stateTimer>28){ g.aiState='RETREAT'; g.retreatTimer=5+Math.random()*4; g.stateTimer=0; }
        break;

      case 'SEARCH':
        g.searchTimer += dt;
        if(g.searchTimer<3.5){
          ghuulMoveToward(g, g.lastSeenX, g.lastSeenZ, 2.1, dt);
        } else {
          if(!g.patrolTarget || Math.hypot(g.x-g.patrolTarget.x, g.z-g.patrolTarget.z)<1.2){
            const ang=Math.random()*Math.PI*2;
            g.patrolTarget={ x:g.lastSeenX+Math.cos(ang)*8, z:g.lastSeenZ+Math.sin(ang)*8 };
          }
          ghuulMoveToward(g, g.patrolTarget.x, g.patrolTarget.z, 1.6, dt);
        }
        if(canSee){ g.aiState='HUNT'; g.timeSinceSeen=0; g.stateTimer=0; }
        else if(g.searchTimer>10){
          // primary STALK entry point - having actually lost a real
          // hunt is the most narratively coherent reason to start
          // shadowing rather than snap back to oblivious patrol. Higher
          // chance than ALERT's equivalent branch above since this
          // followed a genuine hunt, not just an unplaced noise.
          if(Math.random()<0.55){ g.aiState='STALK'; g.stateTimer=0; g.stalkSeenTimer=0; }
          else { g.aiState='PATROL'; g.stateTimer=0; g.patrolTarget=null; }
        }
        break;

      case 'STALK': {
        // Maintains a distance band rather than closing the way
        // ALERT/HUNT do - moves toward a point offset from the player at
        // STALK_DIST along the player's own facing-away direction,
        // trailing at an angle instead of beelining straight at their
        // current position. Recomputed every frame (not cached like
        // patrolTarget) so it continuously re-angles as the player moves,
        // reading as something pacing them rather than walking a fixed
        // path.
        const STALK_DIST = 15;
        const away = dist>0.001 ? {x:-dx/dist, z:-dz/dist} : {x:1,z:0}; // unit vector from player back toward the ghuul's general side
        const wobble = Math.sin(g.visClock*0.6)*0.6; // slow lateral drift so it doesn't sit dead-still relative to the player at exactly STALK_DIST
        const tx = px + away.x*STALK_DIST + -away.z*wobble;
        const tz = pz + away.z*STALK_DIST + away.x*wobble;
        ghuulMoveToward(g, tx, tz, 1.3, dt);

        if(canSee){
          g.stalkSeenTimer += dt;
          // being clearly seen for a sustained stretch breaks the
          // "unnoticed" premise stalking depends on - it commits rather
          // than keep pretending it wasn't there. Shorter fuse than
          // HUNT's own SEARCH->give-up window since this is a much more
          // exposed position to be caught in.
          if(g.stalkSeenTimer>1.6){
            g.aiState='HUNT'; g.timeSinceSeen=0; g.stateTimer=0;
            if(stinger) stinger(); showWhisper("it wasn't hiding anymore.");
          }
        } else {
          g.stalkSeenTimer = 0;
        }
        // gives up if the player's moved well outside stalking range, or
        // if it's been trailing for a long time without ever committing -
        // this isn't meant to be a permanent tail, just an unsettling
        // stretch of one
        if(dist > ghuulVisionRange()*1.4 || g.stateTimer>50){
          g.aiState='PATROL'; g.stateTimer=0; g.patrolTarget=null;
        }
        break;
      }

      case 'RETREAT':
        g.retreatTimer -= dt;
        ghuulMoveAway(g, px, pz, 1.9, dt);
        if(g.retreatTimer<=0){ g.aiState='PATROL'; g.stateTimer=0; }
        break;
    }

    const gy = groundHeightAt(g.x,g.z);
    g.group.position.set(g.x, gy, g.z);
    // billboard: the flat glitch-card always faces the camera, same as
    // main.js's figureMesh - a rigged facing-direction doesn't mean
    // anything for a silhouette that's supposed to read as "wrong," so
    // this replaces the old lookAt(player)/lookAt(patrol-direction) logic
    g.plane.lookAt(camera.position.x, gy+1.28, camera.position.z);

    updateGhuulVisibility(g, dist, dt);
  }
}

// See the header comment for the design reasoning. This runs every
// frame for every ghuul, independent of (but weighted by) aiState.
function updateGhuulVisibility(g, dist, dt){
  g.visClock += dt;
  const mat = g.material;
  mat.uniforms.uTime.value = g.visClock;

  if(g.aiState === 'HUNT'){
    // the one state where fairness matters - the player is actually
    // being chased and needs a real chance to see and react. Stays
    // visible almost all the time, but duty-cycles with a fast, harsh
    // strobe (brief hard cuts to near-black) rather than sitting there
    // as a clean, starable model - it never stops looking wrong even
    // under direct, sustained viewing.
    g.group.visible = true;
    g.visPhase = 'hidden'; // reset so leaving HUNT starts a fresh cooldown, not mid-glimpse
    const strobe = Math.sin(g.visClock*22) > -0.35 ? 1 : 0.15;
    mat.uniforms.uOpacity.value = strobe;
    mat.uniforms.uGlitch.value = 0.55 + Math.random()*0.35;
    return;
  }

  // PATROL/ALERT/SEARCH/RETREAT: rare, brief, distant-only glimpses.
  // The AI state machine and minimap/bigmap blips above and elsewhere
  // keep tracking the true position regardless - only the 3D visual
  // presence is this sparse.
  if(g.visPhase === 'hidden'){
    g.group.visible = false;
    g.visTimer -= dt;
    if(g.visTimer <= 0){
      if(dist > GLIMPSE_MIN_DIST){
        g.visPhase = 'glimpse';
        g.visTimer = 0.35 + Math.random()*0.4; // brief - gone before it can be studied
        mat.uniforms.uGlitch.value = 0.45 + Math.random()*0.3;
      } else {
        // too close for a "distant figure" glimpse right now - recheck
        // soon rather than burning a full cooldown waiting on distance
        g.visTimer = 1 + Math.random()*2;
      }
    }
  } else { // 'glimpse'
    g.group.visible = true;
    g.visTimer -= dt;
    // hard glitch flicker, not a smooth fade in/out - it should look
    // like a broken signal catching it for a moment, not an object
    // politely materializing
    mat.uniforms.uOpacity.value = Math.random() < 0.75 ? 1 : 0.25;
    if(g.visTimer <= 0){
      g.visPhase = 'hidden';
      g.group.visible = false;
      const alertish = (g.aiState === 'ALERT' || g.aiState === 'SEARCH');
      g.visTimer = g.aiState === 'STALK' ? (2.5 + Math.random()*5) // tighter than ALERT/SEARCH - stalking should read as closer/more frequent than an ambient glimpse
        : alertish ? (4 + Math.random()*7)
        : (14 + Math.random()*22);
    }
  }
}

export {
  ghuulList, ghuulSpawnThresholds, createGhuul, maybeSpawnGhuul,
  ghuulVisionRange, ghuulHearingRadius, ghuulFacingPlayer,
  ghuulMoveToward, ghuulMoveAway, ghuulPatrolStep, alertGhuulToward,
  updateGhuul
};
