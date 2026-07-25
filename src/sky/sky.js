/* ============================================================
   sky/sky.js — sky dome, stars, black hole, and the monolith.
   Extracted verbatim from the monolith (main.js), per
   docs/ARCHITECTURE.md Wave 2: "updateSky(), sky dome/breach/
   monolith, wrongness ramp".

   Scope note (deviates slightly from the ARCHITECTURE.md table -
   see docs/HANDOFF.md for the reasoning): only the CREATION code
   for these four pieces (color-lerp helpers, dome, stars, hole,
   monolith) moved this round. `updateSky(dt)` itself, and the sky
   breach (`skyShapes`/`triggerSkyBreach`), stay in main.js for now -
   updateSky() is a genuine cross-cutting function that also drives
   weather (cloudMat/dripMat), lightning, the watching eye, and
   tower windows, none of which are real modules yet. Moving it
   here today would mean sky.js importing half its state back from
   main.js while main.js imports updateSky from sky.js - a circular
   dependency that's possible in ES modules but adds real fragility
   for no actual gain until weather.js and an eye/lightning module
   exist to receive their share of that function. Revisit once
   those exist; this pass just gets the four leaf objects (dome,
   stars, hole, monolith) out, which have zero such coupling - only
   THREE (global), scene (core/scene.js), and each other.

   `THREE` used as a global here, same as the rest of the codebase -
   see the "READ THIS FIRST" note in docs/HANDOFF.md.
   ============================================================ */

import { scene } from '../core/scene.js';

function skyGradientColors(){
  return {
    top: new THREE.Color(0x040308),
    // boosted slightly from the original 0x3a1220 - the quadratic Bezier
    // blend above only lets this stop reach ~50% of its own value at its
    // peak (t=0.5), so this keeps the low-altitude glow band about as
    // bright as it was before, just without the hard ring edge.
    mid: new THREE.Color(0x4a1729),
    // kept close to FOG_COLOR (0x100e14) on purpose: fogged-out silhouettes
    // at the world edge fade toward FOG_COLOR, so if the horizon band were a
    // very different hue there'd be a visible seam where geometry meets sky.
    horizon: new THREE.Color(0x120f17)
  };
}
// the "before" sky: an overcast, unremarkable grey the player wakes up
// under. Ordinary. Nothing wrong yet. Everything below lerps toward the
// wound-red skyGradientColors() above as state.skyWrongness climbs.
function skyGradientColorsCalm(){
  return {
    top: new THREE.Color(0x1c1e24),
    mid: new THREE.Color(0x35383f),
    horizon: new THREE.Color(0x24252b)
  };
}
const SKY_CALM = skyGradientColorsCalm();
const SKY_WRONG = skyGradientColors();
const _skyTmp = { top:new THREE.Color(), mid:new THREE.Color(), horizon:new THREE.Color() };
function skyColorsAt(t){
  _skyTmp.top.copy(SKY_CALM.top).lerp(SKY_WRONG.top, t);
  _skyTmp.mid.copy(SKY_CALM.mid).lerp(SKY_WRONG.mid, t);
  _skyTmp.horizon.copy(SKY_CALM.horizon).lerp(SKY_WRONG.horizon, t);
  return _skyTmp;
}

/* ---------- SKY ---------- */
let domeMat;
let domeMesh;
{
  const domeGeo = new THREE.SphereGeometry(400, 32, 24);
  const { top, mid, horizon } = skyColorsAt(0); // start on the calm grey sky
  // same direction as moonLight.position - a real light source should leave
  // a visible trace in the sky it's coming from, not just light the ground.
  const moonDir = new THREE.Vector3(-60, 140, -40).normalize();
  domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: top },
      uMid: { value: mid },
      uHorizon: { value: horizon },
      uSunDir: { value: moonDir },
      uTime: { value: 0 },
      uWrongness: { value: 0 }
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSunDir;
      uniform float uTime; uniform float uWrongness;
      varying vec3 vPos;
      // cheap 3D value noise, self-contained (the dome shader doesn't share
      // code with the cloud layer's fbm) - just enough octaves to break up
      // flat color bands into something that reads as atmosphere/haze
      // rather than a solid painted wedge.
      float hash13(vec3 p){
        p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
        p *= 17.0;
        return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
      }
      float vnoise(vec3 p){
        vec3 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        float n000=hash13(i+vec3(0,0,0)), n100=hash13(i+vec3(1,0,0));
        float n010=hash13(i+vec3(0,1,0)), n110=hash13(i+vec3(1,1,0));
        float n001=hash13(i+vec3(0,0,1)), n101=hash13(i+vec3(1,0,1));
        float n011=hash13(i+vec3(0,1,1)), n111=hash13(i+vec3(1,1,1));
        float nx00=mix(n000,n100,f.x), nx10=mix(n010,n110,f.x);
        float nx01=mix(n001,n101,f.x), nx11=mix(n011,n111,f.x);
        float nxy0=mix(nx00,nx10,f.y), nxy1=mix(nx01,nx11,f.y);
        return mix(nxy0,nxy1,f.z);
      }
      float skyFbm(vec3 p){
        float v=0.0, a=0.5;
        for(int i=0;i<4;i++){ v += a*vnoise(p); p*=2.05; a*=0.5; }
        return v;
      }
      void main(){
        vec3 dir = normalize(vPos);
        float y = dir.y;
        float t = clamp((y+0.15)/1.15, 0.0, 1.0);
        // uMid is intentionally the brightest of the three stops (a low
        // atmospheric glow band), but blending it as two independent
        // smoothstep halves that only match in *value* at t=0.5 - not in
        // slope - creates a real Mach band: a visible ring of constant
        // altitude circling the zenith. A single quadratic Bezier across
        // all three colors is smooth (continuous derivative) everywhere.
        vec3 a = mix(uHorizon, uMid, t);
        vec3 b = mix(uMid, uTop, t);
        vec3 col = mix(a, b, t);

        // large slow-drifting haze/nebula texture - low-frequency so it
        // reads as uneven atmospheric density (thicker murk in some
        // directions than others) rather than visible noise grain. This is
        // what was missing: without it every altitude band is a perfectly
        // flat, uniform color, which at a steep viewing angle (looking up
        // and to one side) projects as a hard-edged colored wedge instead
        // of sky.
        float haze = skyFbm(dir*1.6 + vec3(0.0, uTime*0.006, uTime*0.004));
        col *= 0.86 + haze*0.34;
        // a second, finer layer breaks up any remaining flatness at close
        // viewing range without being identifiable as "noise" on its own
        float fine = vnoise(dir*9.0 + uTime*0.02) - 0.5;
        col += fine * 0.025;

        // soft moon glow - a wide, dim halo around the actual light direction,
        // not a hard disc, so it reads as atmosphere rather than a UI marker.
        // Weakened once the sky's turned wrong - a natural moon-glow doesn't
        // belong once the thing overhead isn't the moon anymore.
        float sunDot = max(dot(dir, uSunDir), 0.0);
        float glow = pow(sunDot, 6.0) * 0.22 + pow(sunDot, 26.0) * 0.35;
        glow *= mix(1.0, 0.35, uWrongness);
        col += vec3(0.55, 0.42, 0.58) * glow;
        // 4x4 ordered (Bayer) dither, computed arithmetically instead of via
        // bayer[yi][xi] - that was two chained dynamic index ops (row into
        // a mat4, then column into the resulting vec4), which some ANGLE/
        // HLSL backends flag as "potentially uninitialized variable" even
        // though the result was always fully defined.
        float px = mod(gl_FragCoord.x, 4.0);
        float py = mod(gl_FragCoord.y, 4.0);
        float xl = mod(px, 2.0), yl = mod(py, 2.0);
        float xh = floor(px/2.0), yh = floor(py/2.0);
        float bIdx = 4.0*(2.0*xl + 3.0*yl - 4.0*xl*yl) + (2.0*xh + 3.0*yh - 4.0*xh*yh);
        float threshold = bIdx/16.0 - 0.5;
        col += threshold * 0.01;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  domeMesh = new THREE.Mesh(domeGeo, domeMat);
  scene.add(domeMesh);
}

/* ---------- STARS (a sky needs stars — there were none before) ---------- */
let starPoints, starMat;
{
  const STAR_COUNT = 900;
  const positions = new Float32Array(STAR_COUNT*3);
  const seeds = new Float32Array(STAR_COUNT);
  for(let i=0;i<STAR_COUNT;i++){
    // random point on upper hemisphere of a big sphere
    const u = Math.random(), v = Math.random();
    const theta = u*Math.PI*2;
    const phi = Math.acos(1 - v*0.75); // bias to upper sky, keep off low horizon
    const r = 390;
    const x = r*Math.sin(phi)*Math.cos(theta);
    const y = r*Math.cos(phi);
    const z = r*Math.sin(phi)*Math.sin(theta);
    positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
    seeds[i] = Math.random()*100;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  starGeo.setAttribute('seed', new THREE.BufferAttribute(seeds,1));
  starMat = new THREE.ShaderMaterial({
    uniforms:{ uTime:{value:0}, uCoverage:{value:1.0} },
    transparent:true,
    depthWrite:false,
    vertexShader:`
      attribute float seed;
      varying float vSeed;
      void main(){
        vSeed = seed;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 1.4 + 1.2*fract(seed*0.37);
      }
    `,
    fragmentShader:`
      uniform float uTime;
      uniform float uCoverage;
      varying float vSeed;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if(d>0.5) discard;
        float twinkle = 0.55 + 0.45*sin(uTime*(0.6+fract(vSeed*0.13)*1.4) + vSeed*10.0);
        float alpha = (1.0-d*2.0) * twinkle * uCoverage;
        gl_FragColor = vec4(vec3(0.92,0.95,1.0), alpha*0.9);
      }
    `
  });
  starPoints = new THREE.Points(starGeo, starMat);
  scene.add(starPoints);
}

/* ---------- THE HOLE (an animated black hole, directly overhead) ---------- */
const holeUniforms = {
  uTime: { value: 0 },
  uDread: { value: 0 },
  uWrongness: { value: 0 }
};
const holeVertexShader = `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
const holeFragmentShader = `
    precision mediump float;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uDread;
    uniform float uWrongness;

    float hash(vec2 p){
      return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
    }
    // smooth interpolated noise - continuous, no hard cell edges like a raw
    // floor()+hash() lookup would give (that's what caused the shard/block look)
    float smoothNoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      float a = hash(i);
      float b = hash(i+vec2(1.0,0.0));
      float c = hash(i+vec2(0.0,1.0));
      float d = hash(i+vec2(1.0,1.0));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
    }
    float turbulence(vec2 p){
      float v = 0.0, amp = 0.5;
      for(int i=0;i<4;i++){
        v += smoothNoise(p) * amp;
        p *= 2.02;
        amp *= 0.55;
      }
      return v;
    }

    void main(){
      vec2 p = vUv - 0.5;
      float radius = length(p) * 2.0;
      float angle = atan(p.y, p.x);

      float horizon = 0.09 + uDread*0.03;
      float diskOuter = 0.44;

      vec3 col = vec3(0.0);
      float alpha = 0.0;

      if(radius < horizon){
        // event horizon - true black, fully opaque
        col = vec3(0.0);
        alpha = 1.0;
      } else if(radius < diskOuter){
        // turbulent, uneven swirl using continuous noise - actual flowing
        // plasma instead of hard geometric shard shapes
        float t = uTime * 0.5;
        float swirl = angle*4.0 - radius*14.0 + t*2.6;
        vec2 turbUV = vec2(angle*1.4, radius*5.0) + vec2(t*0.35, -t*0.2);
        float turb = turbulence(turbUV);
        float bands = sin(swirl + turb*2.4) * 0.5 + 0.5;
        bands = mix(bands, turb, 0.45);
        bands = smoothstep(0.1, 0.95, bands);

        // Doppler beaming: the side of the disk rotating toward the viewer
        // reads brighter and hotter/bluer, the receding side dimmer and
        // redder - what actually separates a photographed accretion disk
        // from a flat symmetric swirl.
        float approach = cos(angle - 0.7);
        float beaming = 0.55 + 0.45*approach;

        // towardCenter and edgeFade below are also decreasing functions of
        // radius, written the same reversed-edge way the halo bug above was -
        // fixed the same way (increasing edges + invert) for portability.
        float towardCenter = 1.0 - smoothstep(horizon, diskOuter, radius);
        vec3 cold  = vec3(0.20,0.045,0.13);
        vec3 hot   = vec3(0.58,0.20,0.16);
        vec3 white = vec3(0.92,0.80,0.76);
        vec3 blueHot = vec3(0.75,0.82,0.95);
        vec3 c = mix(cold, hot, bands);
        c = mix(c, white, pow(towardCenter, 4.0) * bands);
        // the sun being consumed - a searing core bleeding into the inner
        // disk that intensifies as uDread rises (the more it's forgotten,
        // the more violently the light gets pulled in and torn apart)
        c = mix(c, blueHot, pow(towardCenter,2.2) * beaming * (0.3+uDread*0.7));
        c *= beaming;
        col = c;

        float edgeFade = 1.0 - smoothstep(diskOuter-0.16, diskOuter, radius);
        alpha = edgeFade * (0.32 + bands*0.55) * (0.7+beaming*0.5);

        // soft photon glow hugging the horizon - a glow, not a hard ring
        float ringDist = abs(radius - (horizon+0.02));
        float ring = 1.0 - smoothstep(0.0, 0.055, ringDist);
        col += vec3(1.0,0.87,0.85) * ring * (0.85 + uDread*0.5) * beaming;
        alpha = max(alpha, ring*0.8);
      } else {
        // gravitational lensing halo, blended softly into the sky - falloff
        // extended way out so it dissolves into the cloud noise instead of
        // ending in a visible ring against empty space
        //
        // NOTE: smoothstep(edge0, edge1, x) requires edge0 < edge1 - the
        // result is undefined by the GLSL spec otherwise. The previous
        // version here called it as smoothstep(diskOuter+0.5, diskOuter-0.06,
        // radius), i.e. edge0 > edge1 - that "worked" on some GPUs/drivers by
        // accident but could render as a much harder cutoff than intended on
        // others, which is almost certainly why the halo still looked like a
        // defined ring instead of a soft fade. Written the portable way:
        // increasing edges, then invert.
        float glow = 1.0 - smoothstep(diskOuter-0.06, diskOuter+0.12, radius);
        glow = pow(glow, 0.9);
        glow *= 1.0 - smoothstep(0.35, 0.55, radius);
        col = mix(vec3(0.30,0.10,0.23), vec3(0.07,0.03,0.10), glow);
        alpha = glow * (0.14 + uDread*0.08); // was set twice (a dead 0.07+uDread*0.04 line above it, immediately overwritten) - the actually-used value is this one
      }

      // Only the accretion-disk/halo DETAIL ramps in with wrongness - the
      // event horizon's alpha is intentionally excluded from this (see the
      // branch above: "true black, fully opaque" was the comment, but this
      // scaling used to apply to it too, fading the solid core down to
      // ~6% opacity along with everything else). Without that exclusion
      // the whole hole reads as a flat, barely-there grey smudge at low
      // wrongness instead of an actual black silhouette with color/motion
      // ramping in on top of it as things get worse.
      if(radius >= horizon){
        alpha *= mix(0.06, 1.0, smoothstep(0.15, 0.7, uWrongness));
      }

      gl_FragColor = vec4(col, alpha);
    }
  `;
function createHoleMaterial(uniforms){
  return new THREE.ShaderMaterial({
    uniforms, transparent:true, side:THREE.DoubleSide, depthWrite:false,
    vertexShader: holeVertexShader, fragmentShader: holeFragmentShader
  });
}
const holeMaterial = createHoleMaterial(holeUniforms);
let holeMesh;
{
  holeMesh = new THREE.Mesh(new THREE.PlaneGeometry(240,240), holeMaterial);
  holeMesh.position.y = 150;
  scene.add(holeMesh);
}

/* ---------- THE MONOLITH (a structure being consumed) ----------
   Redesigned from a random-noise "impossible slab stack" (which read as
   visual noise, not awe) around a single reference: Destiny's SIVA -
   the core idea being that dread comes from something ONCE recognizable
   being overtaken by a coherent, self-similar growth language, not from
   randomness for its own sake. Three explicit borrowed principles:
     1. one strong, simple base silhouette (a real tapering tower, not
        random-drift slabs) so the eye has something to resolve as
        "a structure" before anything else registers as wrong
     2. the wrongness is a coherent fractal/crystalline growth erupting
        FROM that structure, not independent random noise layered on top
        - it reads as infection, not glitch soup
     3. one dominant glowing focal point (the growth's origin/"core"),
        not scattered uniform window-dots - matches Half-Life 2's
        Citadel glow / Journey's peak beacon / the Erdtree's central
        light: a landmark needs exactly one thing the eye goes to.

   Still uses the same fixed-billboard-recenter trick as before (see
   MONOLITH_BEARING/MONOLITH_DIST below, unchanged) - it never gets
   nearer or farther no matter how long you walk, which is the actual
   "behaves like the sky, not the world" wrongness. That mechanic was
   already right; only the texture content changed.

   Two layers, same convention already used for the eye-storm entities
   elsewhere in this file (eMesh + additive-blended gMesh): monolithMesh
   (the silhouette + dim base windows, normal transparent blending) and
   monolithGlowMesh (just the crystal veins + core, additive blending,
   its own opacity curve - see updateSky's comment on why the glow
   ramps faster than the silhouette). */
const MONOLITH_BEARING = 2.35;   // fixed world-space angle, unrelated to spawn/radio-tower angle so it isn't mistaken for either
const MONOLITH_DIST = 900;       // recenter radius - stays this far away, always, in that direction

// Recursive crystalline branch generator - draws one jagged, tapering
// shard from (x,y) at `angle` for `length`, then recurses into 2-3
// child shards at randomized angle offsets with decaying length. This
// is the "growth," not random independent shapes - every shard is a
// continuation of its parent, which is what makes the mass read as one
// coherent (if wrong) organism instead of noise. Segment endpoints are
// recorded into `veins` so the glow pass can re-trace the exact same
// paths afterward.
function drawCrystalShard(ctx, x, y, angle, length, depth, veins){
  if(length < 4 || depth <= 0) return;
  const width = Math.max(1.2, length*0.16);
  const ex = x + Math.cos(angle)*length, ey = y + Math.sin(angle)*length;
  const nx = Math.cos(angle+Math.PI/2)*width, ny = Math.sin(angle+Math.PI/2)*width;
  ctx.beginPath();
  ctx.moveTo(x-nx, y-ny);
  ctx.lineTo(x+nx, y+ny);
  ctx.lineTo(ex, ey);
  ctx.closePath();
  ctx.fill();
  veins.push({x1:x, y1:y, x2:ex, y2:ey, w: Math.max(0.6, width*0.35)});

  const branchCount = depth > 1 && Math.random() < 0.75 ? (Math.random()<0.3 ? 3 : 2) : 1;
  for(let i=0;i<branchCount;i++){
    const spread = 0.35 + Math.random()*0.55; // radians - sharp angular splits, not gentle organic curves
    const childAngle = angle + (i - (branchCount-1)/2)*spread + (Math.random()-0.5)*0.2;
    const childLen = length * (0.5 + Math.random()*0.25);
    drawCrystalShard(ctx, ex, ey, childAngle, childLen, depth-1, veins);
  }
}

function monolithTexture(){
  const w=640,h=1024, c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,w,h);
  const cx = w/2;

  // 1. THE BASE - one coherent tapering tower silhouette, the "used to
  // be a real structure" read. Gentle consistent taper (unlike the old
  // random-drift version) so it resolves as architecture at a glance.
  const infectionY = h*0.42; // everything above this line is consumed
  ctx.fillStyle = '#050308';
  const baseW0 = w*0.30, baseW1 = w*0.16;
  ctx.beginPath();
  ctx.moveTo(cx-baseW0/2, h);
  ctx.lineTo(cx-baseW1/2, infectionY);
  ctx.lineTo(cx+baseW1/2, infectionY);
  ctx.lineTo(cx+baseW0/2, h);
  ctx.closePath();
  ctx.fill();
  // a few setback ledges for architectural believability
  for(let i=0;i<4;i++){
    const t = 0.2 + i*0.2;
    const ly = h - (h-infectionY)*t;
    const lw = THREE.MathUtils.lerp(baseW0, baseW1, t) * 1.08;
    ctx.fillRect(cx-lw/2, ly, lw, 3);
  }
  // sparse, dim, ordinary window lights - confined to the untouched
  // base only, deliberately unremarkable so they read as "was normal"
  // and contrast against the crystal glow above
  for(let i=0;i<40;i++){
    const t = Math.random();
    const ly = infectionY + (h-infectionY)*t;
    const lw = THREE.MathUtils.lerp(baseW1, baseW0, t);
    const lx = cx + (Math.random()-0.5)*lw*0.8;
    ctx.fillStyle = `rgba(255,220,180,${0.06+Math.random()*0.1})`;
    ctx.fillRect(lx, ly, 1.2, 1.2);
  }

  // 2. THE GROWTH - one dominant crystalline mass erupting from the
  // infection line, plus two smaller secondary eruptions lower down the
  // tower for scale/spread, all drawn with the same recursive shard
  // language so it reads as one organism, not scattered debris.
  ctx.fillStyle = '#0c0710';
  const veins = [];
  drawCrystalShard(ctx, cx, infectionY, -Math.PI/2, h*0.30, 6, veins); // dominant central eruption
  drawCrystalShard(ctx, cx - baseW1*0.3, infectionY + h*0.06, -Math.PI/2 - 0.5, h*0.14, 4, veins);
  drawCrystalShard(ctx, cx + baseW1*0.25, infectionY + h*0.1, -Math.PI/2 + 0.6, h*0.11, 4, veins);

  // corrupted scanline cuts, same technique used elsewhere in this game
  // for a glitched read - kept light and confined near the infection
  // boundary rather than blanket-applied, so it reads as "the seam
  // where it broke through" rather than a general filter
  ctx.globalCompositeOperation = 'destination-out';
  for(let i=0;i<10;i++){
    const y = infectionY + (Math.random()-0.5)*h*0.15;
    const sliceH = 1+Math.random()*4, xOff=(Math.random()-0.5)*40;
    ctx.fillRect(xOff, y, w, sliceH);
  }
  ctx.globalCompositeOperation = 'source-over';

  return { texture: new THREE.CanvasTexture(c), veins, coreX: cx, coreY: infectionY };
}

// Second pass: the glow-only texture, re-tracing the exact vein paths
// recorded during shard generation (not independently random - the
// glow must sit exactly on the crystal geometry it's lighting) plus one
// dominant radial core glow at the growth's origin point. Additive
// blending, own mesh/opacity curve - see updateSky's comment.
function monolithGlowTexture(veins, coreX, coreY){
  const w=640,h=1024, c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  ctx.globalCompositeOperation = 'lighter'; // overlapping strokes brighten rather than overwrite, cheap fake bloom
  for(const v of veins){
    const dist = Math.hypot(v.x2-coreX, v.y2-coreY);
    const falloff = THREE.MathUtils.clamp(1 - dist/(h*0.4), 0.08, 1); // brightest near the core, dim at the tips
    ctx.strokeStyle = `rgba(255,${100+falloff*70|0},40,${0.15+falloff*0.4})`;
    ctx.lineWidth = Math.max(0.8, v.w);
    ctx.beginPath();
    ctx.moveTo(v.x1,v.y1); ctx.lineTo(v.x2,v.y2);
    ctx.stroke();
  }
  // the one dominant focal point - everything else on this structure
  // exists to lead the eye here
  const core = ctx.createRadialGradient(coreX,coreY,0, coreX,coreY, 70);
  core.addColorStop(0, 'rgba(255,210,140,0.95)');
  core.addColorStop(0.35, 'rgba(255,120,40,0.55)');
  core.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(coreX,coreY,70,0,Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(c);
}

const _monolithGen = monolithTexture();
const monolithMat = new THREE.MeshBasicMaterial({
  map: _monolithGen.texture, transparent:true, depthWrite:false, side:THREE.DoubleSide,
  color:0x4a3550, fog:false, opacity:0.5
});
const monolithMesh = new THREE.Mesh(new THREE.PlaneGeometry(520, 900), monolithMat);
monolithMesh.position.y = 260;
scene.add(monolithMesh);

const monolithGlowMat = new THREE.MeshBasicMaterial({
  map: monolithGlowTexture(_monolithGen.veins, _monolithGen.coreX, _monolithGen.coreY),
  transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false,
  blending: THREE.AdditiveBlending, opacity: 0
});
const monolithGlowMesh = new THREE.Mesh(new THREE.PlaneGeometry(520, 900), monolithGlowMat);
monolithGlowMesh.position.y = 260;
scene.add(monolithGlowMesh);

/* ---------- UTILITY FOG SWARM (the growth building itself) ----------
   Requested addition, referencing "utility fog" - a swarm of tiny units
   that link up to temporarily hold a solid shape, then disperse back
   into a formless cloud. Purely a background spectacle: a slow, looping,
   NON-interactive scripted cycle (dispersed -> assembling -> formed ->
   dispersing -> repeat) with its own independent timer, decoupled from
   dread/player state entirely - it never blocks, prompts, or reacts to
   the player, it's just visible happening in the distance, same as
   weather. The one thing it DOES control: the static crystal-growth
   texture (monolithMat/monolithGlowMat, above) only shows through once
   the swarm has actually finished assembling that shape this cycle -
   otherwise a solid structure and a loose swarm cloud would be visible
   at the same time, contradicting each other. The base tower silhouette
   is NOT gated by this - it's meant to read as real, pre-existing
   architecture the fog is building ONTO, not something it's building
   from scratch.

   Particle targets are sampled directly off the same `veins` array the
   glow pass traces (drawCrystalShard's recorded segment endpoints), so
   the swarm assembles into the *exact* silhouette already on the
   texture - not an independently-random cloud that happens to be near
   it. */
function monolithSwarmDotTexture(){
  const s=32, c=document.createElement('canvas'); c.width=s; c.height=s;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(255,190,120,0.95)');
  g.addColorStop(0.5,'rgba(255,120,40,0.5)');
  g.addColorStop(1,'rgba(255,80,20,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
  return new THREE.CanvasTexture(c);
}

const MONOLITH_SWARM_DURATIONS = { dispersed: 55, assembling: 18, formed: 70, dispersing: 10 };
function buildMonolithSwarm(veins){
  // sample several points along every vein segment so particle targets
  // trace the same crystal silhouette the static texture already draws
  const targets = [];
  for(const v of veins){
    const steps = 3 + Math.floor(Math.hypot(v.x2-v.x1, v.y2-v.y1)/40);
    for(let i=0;i<=steps;i++){
      const t = i/steps;
      targets.push({ x: v.x1+(v.x2-v.x1)*t, y: v.y1+(v.y2-v.y1)*t });
    }
  }
  const count = targets.length;
  const positions = new Float32Array(count*3);
  const startDelay = new Float32Array(count);   // stagger so particles don't move in lockstep
  const jitterSeed = new Float32Array(count);
  const dispersedPos = new Float32Array(count*2); // x,y per particle, re-randomized each dispersed phase

  // canvas space (0..640, 0..1024) -> plane-local space (-260..260, -450..450), y flipped
  function toPlane(cx, cy){ return { x: cx - 320, y: 450 - cy*(900/1024) }; }

  for(let i=0;i<count;i++){
    startDelay[i] = Math.random()*0.65; // fraction of the 'assembling' duration before this particle starts moving
    jitterSeed[i] = Math.random()*1000;
    const p = toPlane(targets[i].x, targets[i].y);
    positions[i*3] = p.x; positions[i*3+1] = p.y; positions[i*3+2] = 0;
    targets[i] = p; // now in plane-local space
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: monolithSwarmDotTexture(), size: 5, sizeAttenuation:false,
    color: 0xffb060, transparent:true, depthWrite:false, opacity:0,
    blending: THREE.AdditiveBlending, fog:false
  });
  const points = new THREE.Points(geometry, material);
  points.position.y = 260;
  scene.add(points);

  function randomizeDispersed(){
    for(let i=0;i<count;i++){
      const t = targets[i];
      // loose scatter around (but well clear of) the target - reads as
      // an ambient formless cloud near the structure, not resembling it
      dispersedPos[i*2] = t.x + (Math.random()-0.5)*260;
      dispersedPos[i*2+1] = t.y + (Math.random()-0.5)*320 - 60;
    }
  }
  randomizeDispersed();

  return {
    points, material, geometry, targets, count,
    startDelay, jitterSeed, dispersedPos, positions,
    phase: 'dispersed',
    phaseT: Math.random()*MONOLITH_SWARM_DURATIONS.dispersed, // stagger first cycle so it isn't perfectly synced to game start
    randomizeDispersed,
    formedFactor: 0 // 0 = fully dispersed/invisible structure, 1 = fully assembled - read by updateSky to gate monolithMat/monolithGlowMat
  };
}

const monolithSwarm = buildMonolithSwarm(_monolithGen.veins);

function updateMonolithSwarm(dt, visibility){
  const s = monolithSwarm;
  s.phaseT += dt;
  const dur = MONOLITH_SWARM_DURATIONS[s.phase];

  if(s.phase === 'dispersed' && s.phaseT >= dur){
    s.phase = 'assembling'; s.phaseT = 0;
  } else if(s.phase === 'assembling' && s.phaseT >= dur){
    s.phase = 'formed'; s.phaseT = 0;
  } else if(s.phase === 'formed' && s.phaseT >= dur){
    s.phase = 'dispersing'; s.phaseT = 0;
  } else if(s.phase === 'dispersing' && s.phaseT >= dur){
    s.phase = 'dispersed'; s.phaseT = 0;
    s.randomizeDispersed(); // fresh scatter pattern each cycle, not a mirror-reverse of the last one
  }

  const pos = s.positions;
  for(let i=0;i<s.count;i++){
    const t = s.targets[i];
    const dx0 = s.dispersedPos[i*2], dy0 = s.dispersedPos[i*2+1];
    let x, y;
    if(s.phase === 'dispersed'){
      x = dx0; y = dy0;
    } else if(s.phase === 'assembling'){
      const localT = THREE.MathUtils.clamp((s.phaseT/dur - s.startDelay[i]) / (1-s.startDelay[i]), 0, 1);
      const eased = localT*localT*(3-2*localT); // smoothstep - decelerates into place rather than snapping
      x = THREE.MathUtils.lerp(dx0, t.x, eased);
      y = THREE.MathUtils.lerp(dy0, t.y, eased);
    } else if(s.phase === 'formed'){
      // small alive-feeling jitter, not perfectly frozen in place
      const j = jitterAt(s.jitterSeed[i], s.phaseT);
      x = t.x + j.x; y = t.y + j.y;
    } else { // dispersing
      const eased = THREE.MathUtils.clamp(s.phaseT/dur, 0, 1);
      x = THREE.MathUtils.lerp(t.x, dx0, eased);
      y = THREE.MathUtils.lerp(t.y, dy0, eased);
    }
    pos[i*3] = x; pos[i*3+1] = y;
  }
  s.geometry.attributes.position.needsUpdate = true;

  // formedFactor drives how much of the static crystal texture shows
  // through - 0 while dispersed/early-assembling, ramping to 1 as
  // assembly finishes, holding at 1 through 'formed', ramping back down
  // through 'dispersing'
  if(s.phase === 'dispersed') s.formedFactor = 0;
  else if(s.phase === 'assembling') s.formedFactor = THREE.MathUtils.clamp(s.phaseT/dur, 0, 1);
  else if(s.phase === 'formed') s.formedFactor = 1;
  else s.formedFactor = THREE.MathUtils.clamp(1 - s.phaseT/dur, 0, 1);

  // swarm particles themselves are only worth seeing when the monolith
  // is visible at all (same dread/wrongness curve as everything else
  // about it) - during 'formed' they fade down since the static texture
  // has taken over and showing both at full brightness would look noisy
  const swarmPresence = (s.phase === 'formed') ? 0.35 : 1.0;
  s.material.opacity = visibility * swarmPresence * 0.8;
}

function jitterAt(seed, t){
  return {
    x: Math.sin(t*1.7 + seed)*2.2,
    y: Math.cos(t*1.3 + seed*1.3)*2.2
  };
}

export {
  skyGradientColors, skyGradientColorsCalm, SKY_CALM, SKY_WRONG, skyColorsAt,
  domeMat, domeMesh,
  starPoints, starMat,
  holeUniforms, holeMaterial, holeMesh, createHoleMaterial,
  MONOLITH_BEARING, MONOLITH_DIST, monolithMat, monolithMesh,
  monolithGlowMat, monolithGlowMesh,
  monolithSwarm, updateMonolithSwarm
};
