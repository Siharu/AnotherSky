/* ============================================================
   sky/weather.js — rain, dust, and the drifting cloud/drip layers.
   Extracted verbatim from the monolith (main.js), per
   docs/ARCHITECTURE.md Wave 2: "rain, dust, clouds (updateRain,
   updateDust, cloud shader uniforms)".

   Kept deliberately separate from sky/sky.js (dome/stars/hole/
   monolith) even though both are "atmosphere" - they're different
   kinds of system (static/shader-only vs. per-frame particle sim)
   with no shared internals; the only common consumer is
   updateSky(), still in main.js, which already imports from both
   independently. See docs/HANDOFF.md for the full reasoning.

   Depends on `makeCanvas`/`patchFogToDistance` from
   render/postprocessing.js (jumped ahead this same round - see that
   file's header) rather than main.js, specifically to avoid a
   circular top-level import: this file calls both at module-load
   time (dustSprite() building dustMat, patchFogToDistance() on
   rainMat), not just inside updateRain/updateDust, so they can't
   come from a module that itself imports back from here.

   `SAFEHOUSE_CENTER`/`SAFEHOUSE_HALF_W`/`SAFEHOUSE_HALF_D` are imported
   from world/safehouse.js, their real owner (moved there from main.js
   during a later audit pass - see that file's own header for why: the
   old main.js-export location caused a real TDZ crash for safehouse.js
   itself, since safehouse.js read them at its own module top level,
   not deferred inside a function the way this file's updateRain() does).
   This file's own reference stays safe either way, since it's only read
   inside updateRain()'s function body, not at this module's load time.

   `THREE` used as a global, same as the rest of the codebase.
   ============================================================ */

import { scene, camera } from '../core/scene.js';
import { state } from '../core/state.js';
import { makeCanvas, patchFogToDistance } from '../render/postprocessing.js';
import { SAFEHOUSE_CENTER, SAFEHOUSE_HALF_W, SAFEHOUSE_HALF_D } from '../world/safehouse.js';

function dustSprite(){
  const size=64, c=makeCanvas(size), ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0,'rgba(220,214,200,0.9)');
  g.addColorStop(1,'rgba(220,214,200,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,size,size);
  return new THREE.CanvasTexture(c);
}

/* A blurred, elongated streak rather than a round dot - drawn as a
   soft vertical line then blurred, so a single billboard sprite reads
   as a falling drop with a motion-blurred head/tail without needing
   any actual per-pixel blur math in the fragment shader. Narrow
   rectangle down the vertical center, radial-faded at the ends so it
   tapers rather than ending in a hard cap. */
function rainDropSprite(){
  const size=64, c=makeCanvas(size), ctx=c.getContext('2d');
  ctx.clearRect(0,0,size,size);
  const g = ctx.createLinearGradient(0,4,0,size-4);
  g.addColorStop(0,'rgba(220,228,240,0)');
  g.addColorStop(0.18,'rgba(220,228,240,0.9)');
  g.addColorStop(0.82,'rgba(220,228,240,0.9)');
  g.addColorStop(1,'rgba(220,228,240,0)');
  ctx.fillStyle = g;
  ctx.fillRect(size*0.5-2, 4, 4, size-8);
  ctx.filter = 'blur(2.5px)';
  ctx.drawImage(c, 0, 0);
  ctx.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

let cloudLayer, cloudLayer2, cloudMat, cloudMat2, dripLayer, dripMat;
{
  const cloudVert = `
    varying vec3 vPos;
    void main(){
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `;
  // hash + value-noise built on the 3D direction itself, not UVs -
  // a sphere has no seam if the texture is a function of position, not wrap coords.
  const cloudFrag = `
    precision mediump float;
    varying vec3 vPos;
    uniform float uTime;
    uniform float uOpacity;
    uniform vec3 uOffset;
    uniform float uDread;
    uniform float uBleed;
    uniform float uWrongness;
    uniform float uBreachAmt;
    uniform vec3 uBreachDir;

    float hash3(vec3 p){
      p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
      p *= 17.0;
      return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
    }
    float noise(vec3 p){
      vec3 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      float n000=hash3(i+vec3(0,0,0)), n100=hash3(i+vec3(1,0,0));
      float n010=hash3(i+vec3(0,1,0)), n110=hash3(i+vec3(1,1,0));
      float n001=hash3(i+vec3(0,0,1)), n101=hash3(i+vec3(1,0,1));
      float n011=hash3(i+vec3(0,1,1)), n111=hash3(i+vec3(1,1,1));
      float nx00=mix(n000,n100,f.x), nx10=mix(n010,n110,f.x);
      float nx01=mix(n001,n101,f.x), nx11=mix(n011,n111,f.x);
      float nxy0=mix(nx00,nx10,f.y), nxy1=mix(nx01,nx11,f.y);
      return mix(nxy0,nxy1,f.z);
    }
    // proper fractal Brownian motion: 5 octaves, base frequency high enough
    // that several cloud clusters fit across the dome (the old single 1.6Hz
    // term only fit half a wave across the whole sky - that's the "one egg"
    // bug). Weights still sum to ~1 so the mask thresholds below don't need retuning.
    float fbm(vec3 p){
      float sum = 0.0, amp = 0.5, freq = 1.0;
      for(int i=0;i<5;i++){
        sum += noise(p*freq) * amp;
        freq *= 2.05;
        amp *= 0.52;
      }
      return sum;
    }
    // 4-octave version for the base cloud mask (was full 5) - the top octave
    // is fine grain that mostly reads as noise-floor texture at dome scale,
    // so dropping just that one still saves some fragment cost. Dropping to
    // 3 (an earlier pass) removed too much high-frequency detail - with only
    // low frequencies left, cloud/halo boundaries came out looking like
    // smooth, near-perfect circles instead of organic blobs. 4 keeps enough
    // irregularity to break that up. Veins keep the full 5-octave fbm since
    // they're a rarer, closer-read detail.
    float cloudFbm(vec3 p){
      float sum = 0.0, amp = 0.5, freq = 1.0;
      for(int i=0;i<4;i++){
        sum += noise(p*freq) * amp;
        freq *= 2.05;
        amp *= 0.52;
      }
      return sum;
    }
    // thin branching blood-vein cracks: ridged noise at two frequencies
    // (fine capillaries riding on top of thicker main veins) collapsed
    // toward its zero-crossings so what's left is a web of hairline seams
    // instead of blobs. uDread both brightens the veins and speeds their
    // pulse so the sky visibly "gets a pulse" as dread rises.
    float veinPattern(vec3 p){
      float big = abs(fbm(p*1.6 + 4.0) - 0.5);
      float fine = abs(fbm(p*4.5 - 9.0) - 0.5);
      float bigVein  = smoothstep(0.05, 0.0, big);
      float fineVein = smoothstep(0.025, 0.0, fine) * 0.5;
      return clamp(bigVein + fineVein, 0.0, 1.0);
    }
    // the sky starts to bleed after enough time has passed - long dark drips
    // hanging and stretching down from the cloud base, like the underside of
    // the dome is a wound seeping downward. Columns are stable (hashed by
    // horizontal angle) so drips don't swim around, they just grow longer.
    float dripPattern(vec3 dir, float bleed){
      float ang = atan(dir.x, dir.z);
      float cols = 14.0;
      float col = ang*cols;
      float ci = floor(col);
      float cf = fract(col) - 0.5;
      float colHash = hash3(vec3(ci, 7.1, 3.4));
      float isActive = step(0.5, colHash); // roughly half the columns drip
      float lenHash = hash3(vec3(ci, 19.2, 44.0));
      float maxLen = 0.18 + lenHash*0.4;
      float len = maxLen * bleed;
      float dripTop = 0.16 + lenHash*0.08;
      float dripBot = dripTop - len;
      float vertical = smoothstep(dripBot, dripBot+0.03, dir.y) * (1.0 - smoothstep(dripTop-0.03, dripTop, dir.y));
      float width = 0.03 + 0.018*sin(lenHash*40.0);
      float colMask = smoothstep(width, width*0.35, abs(cf));
      float tip = smoothstep(dripBot+0.045, dripBot, dir.y) * smoothstep(width*2.4, width*0.6, abs(cf));
      return isActive * clamp(vertical*colMask + tip, 0.0, 1.0);
    }
    void main(){
      vec3 dir = normalize(vPos) + uOffset;
      // domain warp - offsets the sampling position by another noise field
      // before the FBM runs, so cloud clusters come out turbulent and
      // irregular instead of the smooth concentric rings a single warped
      // FBM would otherwise produce (the other half of the "egg" symmetry).
      vec3 wp = dir*1.1 + uOffset*0.4;
      float wx = noise(wp + vec3(11.3, 4.7, 8.1)) - 0.5;
      float wy = noise(wp + vec3(27.2, 91.4, 15.6)) - 0.5;
      float wz = noise(wp + vec3(63.9, 12.2, 44.8)) - 0.5;
      vec3 warped = dir + vec3(wx, wy, wz) * 0.85;
      float n = cloudFbm(warped * 3.2);
      // widened from (0.38,0.68) - a narrower band made the cloud edge read
      // as a defined line/circle; spreading the same transition over more
      // of the noise range fades it out instead.
      float mask = smoothstep(0.30, 0.78, n);

      // ordinary overcast storm cloud - flat neutral greys, nothing wrong yet
      vec3 coldCalm = vec3(0.30,0.31,0.34);
      vec3 hotCalm  = vec3(0.48,0.49,0.53);
      // the wound - what these same clouds curdle into as uWrongness rises
      vec3 coldWrong = vec3(0.20,0.06,0.13);
      vec3 hotWrong  = vec3(0.36,0.10,0.10);
      vec3 cold = mix(coldCalm, coldWrong, uWrongness);
      vec3 hot  = mix(hotCalm, hotWrong, uWrongness);
      vec3 col = mix(cold, hot, n);

      // cheap fake-volume: sample the mask again at a tiny offset toward
      // "up" in noise-space and use the difference as a stand-in for a
      // surface normal, so puffs get a brighter lit crown and a darker
      // underside instead of reading as one flat painted layer.
      float nUp = cloudFbm((warped + vec3(0.0, 0.06, 0.0)) * 3.2);
      float relief = clamp((n - nUp) * 3.5, -1.0, 1.0);
      vec3 litTop = mix(vec3(0.62,0.63,0.66), vec3(0.62,0.22,0.20), uWrongness);
      vec3 shadUnder = vec3(0.05,0.045,0.06);
      col = mix(col, litTop, max(relief, 0.0) * mask * 0.5);
      col = mix(col, shadUnder, max(-relief, 0.0) * mask * 0.6);

      // veins sit in their own slow-drifting sample space so they don't lock
      // to the cloud puffs, and pulse independently on top of the dread ramp.
      // Gated by uWrongness too - the vein web is part of the sky curdling,
      // it shouldn't show through an ordinary grey cloud deck.
      float veinPulse = 0.55 + 0.45*sin(uTime*(0.8+uDread*2.2));
      float veinStrength = uDread * veinPulse * uWrongness;
      // veinPattern() burns two full 5-octave fbm() calls - skip it outright
      // when dread is low enough that veinStrength would erase the result
      // anyway (mix(col, veinColor, ~0) and max(mask, ~0) are no-ops).
      float vein = veinStrength > 0.01 ? veinPattern(dir*2.0 + vec3(0.0, uTime*0.015, 0.0)) : 0.0;
      vec3 veinColor = vec3(0.75, 0.02, 0.05);
      col = mix(col, veinColor, vein*veinStrength);
      // veins read through thin/absent cloud too, not just where mask is high
      float finalAlpha = max(mask, vein*veinStrength*0.7) * uOpacity;

      // sky-bleed drips - dark, near-black-red, independent of dread, only
      // driven by uBleed (time-gated). Drawn after veins so drips read as
      // solid streaks even where the vein web is also active.
      float drip = dripPattern(dir, uBleed);
      vec3 bleedColor = vec3(0.10, 0.005, 0.01);
      col = mix(col, bleedColor, drip*0.92*uWrongness);
      finalAlpha = max(finalAlpha, drip*uBleed*0.9*uWrongness);

      // the breach: something enormous pressing up against the underside of
      // the cloud deck from one direction, uBreachDir. A tight cone around
      // that direction gets punched brighter/thinner (stretched, straining)
      // and right at its peak, briefly torn - so the cloud layer itself
      // looks like it's about to give way, not just a shape glimpsed through it.
      if(uBreachAmt > 0.001){
        // ragged, noise-perturbed boundary instead of a perfect geometric
        // cone edge - without this the strain reads as a flat colored slice
        // cut across the sky rather than clouds actually straining/tearing
        float edgeNoise = (noise(dir*5.0 + vec3(uTime*0.12, 0.0, 0.0)) - 0.5) * 0.14;
        float bd = max(dot(dir, uBreachDir) + edgeNoise, 0.0);
        float cone = pow(bd, 11.0); // was 26 - too steep, dropped from full to nothing in a few degrees, reading as a hard slice
        float strain = cone * uBreachAmt;
        vec3 strainColor = mix(vec3(0.65,0.58,0.6), vec3(0.9,0.15,0.12), uWrongness);
        // smoothstep instead of a raw clamp(strain*1.6,0,1) - the old clamp
        // saturated to one flat, perfectly uniform color across a wide area
        // the instant strain crossed ~0.6, which is what made the boundary
        // look like a hard-edged solid wedge instead of a gradient
        float strainMix = smoothstep(0.05, 0.95, strain*1.25);
        col = mix(col, strainColor, strainMix);
        // a thin tear right at the hottest point of the strain, once it's
        // pushed far enough - the mask briefly drops to near-zero there,
        // like the cloud has actually split.
        float tear = smoothstep(0.97, 0.999, bd) * smoothstep(0.6, 1.0, uBreachAmt);
        finalAlpha = mix(finalAlpha, finalAlpha*0.15, tear);
        finalAlpha = max(finalAlpha, strain*0.7);
      }

      gl_FragColor = vec4(col, finalAlpha);
    }
  `;
  const geo = new THREE.SphereGeometry(150, 40, 28);
  const breachUniforms = { uBreachAmt:{value:0}, uBreachDir:{value:new THREE.Vector3(0,1,0)} };
  cloudMat = new THREE.ShaderMaterial({
    uniforms:{ uTime:{value:0}, uOpacity:{value:0.6}, uOffset:{value:new THREE.Vector3(0,0,0)}, uDread:{value:0}, uBleed:{value:0}, uWrongness:{value:0}, ...breachUniforms },
    vertexShader:cloudVert, fragmentShader:cloudFrag,
    transparent:true, side:THREE.BackSide, blending:THREE.AdditiveBlending, depthWrite:false, fog:false
  });
  cloudLayer = new THREE.Mesh(geo, cloudMat);
  scene.add(cloudLayer);

  const geo2 = new THREE.SphereGeometry(170, 36, 24);
  cloudMat2 = new THREE.ShaderMaterial({
    uniforms:{ uTime:{value:0}, uOpacity:{value:0.3}, uOffset:{value:new THREE.Vector3(50,20,10)}, uDread:{value:0}, uBleed:{value:0}, uWrongness:{value:0}, uBreachAmt:{value:0}, uBreachDir:{value:new THREE.Vector3(0,1,0)} },
    vertexShader:cloudVert, fragmentShader:cloudFrag,
    transparent:true, side:THREE.BackSide, blending:THREE.AdditiveBlending, depthWrite:false, fog:false
  });
  cloudLayer2 = new THREE.Mesh(geo2, cloudMat2);
  scene.add(cloudLayer2);

  // Dedicated drip layer, separate from the puff-cloud meshes above.
  // The drip math already existed inside cloudFrag (dripPattern, mixed into
  // col there) but that mesh renders with AdditiveBlending - additive can
  // only ever brighten a pixel, so mixing toward a near-black drip color on
  // an additive-blended surface does effectively nothing visible; that's
  // why the drips never read as actual dark streaks against the sky, only
  // the (unrelated) flat wrongness color wash did. This mesh uses ordinary
  // alpha blending instead, so a dark, near-black-red color can genuinely
  // read as dark against a bright orange sky, matching the reference "wax
  // dripping down from the clouds" look rather than just tinting overall.
  const dripFrag = `
    precision mediump float;
    varying vec3 vPos;
    uniform float uTime;
    uniform float uBleed;
    uniform float uWrongness;
    uniform vec3 uOffset;
    float hash3(vec3 p){
      p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
      p *= 17.0;
      return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
    }
    float dripPattern(vec3 dir, float bleed){
      float ang = atan(dir.x, dir.z);
      float cols = 14.0;
      float col = ang*cols;
      float ci = floor(col);
      float cf = fract(col) - 0.5;
      float colHash = hash3(vec3(ci, 7.1, 3.4));
      float isActive = step(0.5, colHash);
      float lenHash = hash3(vec3(ci, 19.2, 44.0));
      float maxLen = 0.18 + lenHash*0.4;
      float len = maxLen * bleed;
      float dripTop = 0.16 + lenHash*0.08;
      float dripBot = dripTop - len;
      float vertical = smoothstep(dripBot, dripBot+0.03, dir.y) * (1.0 - smoothstep(dripTop-0.03, dripTop, dir.y));
      float width = 0.03 + 0.018*sin(lenHash*40.0);
      float colMask = smoothstep(width, width*0.35, abs(cf));
      float tip = smoothstep(dripBot+0.045, dripBot, dir.y) * smoothstep(width*2.4, width*0.6, abs(cf));
      return isActive * clamp(vertical*colMask + tip, 0.0, 1.0);
    }
    void main(){
      vec3 dir = normalize(vPos) + uOffset*0.3;
      float drip = dripPattern(dir, uBleed);
      // near-black wet-tar red, well outside additive territory now - this
      // is the actual color that should read as "dripping down", not just
      // contribute a faint highlight
      vec3 dripColor = vec3(0.09, 0.01, 0.015);
      float alpha = drip * uBleed * uWrongness;
      gl_FragColor = vec4(dripColor, alpha);
    }
  `;
  const dripGeo = new THREE.SphereGeometry(148, 36, 24);
  dripMat = new THREE.ShaderMaterial({
    uniforms:{ uTime:{value:0}, uBleed:{value:0}, uWrongness:{value:0}, uOffset:{value:new THREE.Vector3(0,0,0)} },
    vertexShader:cloudVert, fragmentShader:dripFrag,
    transparent:true, side:THREE.BackSide, blending:THREE.NormalBlending, depthWrite:false, depthTest:false, fog:false
  });
  dripLayer = new THREE.Mesh(dripGeo, dripMat);
  // renderOrder forces paint order regardless of transparent-object depth
  // sorting quirks at this scale, so the drips reliably draw on top of both
  // puff-cloud layers instead of the sort occasionally flipping them under.
  cloudLayer.renderOrder = 1; cloudLayer2.renderOrder = 2; dripLayer.renderOrder = 3;
  scene.add(dripLayer);
}

/* ---------- RAIN ---------- */
const RAIN_COUNT = 2400, RAIN_RADIUS = 40, RAIN_TOP = 36, RAIN_BOTTOM = -4; // was 1400 - too sparse to read as real rain, especially per squall cell
// rain falls in a handful of drifting patches ("cells") instead of one
// uniform disc - each cell has its own wandering offset + local radius, and
// every drop belongs to one cell, so from above it reads as scattered
// squalls moving over/around the player rather than rain "everywhere".
const RAIN_CELL_COUNT = 6;
const rainCellX = new Float32Array(RAIN_CELL_COUNT);
const rainCellZ = new Float32Array(RAIN_CELL_COUNT);
const rainCellR = new Float32Array(RAIN_CELL_COUNT);
const rainCellPhase = new Float32Array(RAIN_CELL_COUNT);
const rainCellSpeed = new Float32Array(RAIN_CELL_COUNT);
const rainCellOrbit = new Float32Array(RAIN_CELL_COUNT);
for(let c=0;c<RAIN_CELL_COUNT;c++){
  rainCellPhase[c] = Math.random()*Math.PI*2;
  rainCellOrbit[c] = RAIN_RADIUS*(0.25+Math.random()*0.55);
  rainCellSpeed[c] = (0.06+Math.random()*0.08) * (Math.random()<0.5?1:-1);
  rainCellR[c] = RAIN_RADIUS*(0.22+Math.random()*0.28); // patch size
  rainCellX[c] = Math.cos(rainCellPhase[c])*rainCellOrbit[c];
  rainCellZ[c] = Math.sin(rainCellPhase[c])*rainCellOrbit[c];
}
const rainDropCell = new Uint8Array(RAIN_COUNT);
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT*3);
const rainVel = new Float32Array(RAIN_COUNT);
const rainSize = new Float32Array(RAIN_COUNT);
for(let i=0;i<RAIN_COUNT;i++){
  const cell = i % RAIN_CELL_COUNT;
  rainDropCell[i] = cell;
  const x = rainCellX[cell] + (Math.random()-0.5)*rainCellR[cell]*2;
  const z = rainCellZ[cell] + (Math.random()-0.5)*rainCellR[cell]*2;
  const y = RAIN_TOP*Math.random();
  rainPos[i*3+0]=x; rainPos[i*3+1]=y; rainPos[i*3+2]=z;
  rainVel[i] = 14+Math.random()*10;
  rainSize[i] = 0.5+Math.random()*0.6; // was line length pre-Points; now drives sprite size instead
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos,3));
rainGeo.setAttribute('aSize', new THREE.BufferAttribute(rainSize,1));

/* Points instead of LineSegments (the "cheap beautiful rain" swap):
   each drop is one camera-facing billboard using the blurred vertical-
   streak sprite above for its head/tail falloff, instead of an actual
   two-vertex line segment - cheaper per-drop and the blur reads better
   than a hard-edged line. The one thing a flat billboard can't do on
   its own is foreshorten when the camera looks up/down (a streak
   sprite stays the same elongated shape no matter which way you're
   facing, which looks wrong looking straight up) - uUvSquash/uSizeScale
   below compress the sprite as the camera's view direction approaches
   vertical, recomputed each frame in updateRain() from the camera's
   actual world-space look direction. */
const rainVert = `
  attribute float aSize;
  uniform float uSizeScale;
  varying float vFade;
  void main(){
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // fade drops as they near the top/bottom of their fall band, so
    // recycling (see updateRain) doesn't pop them in/out at full opacity
    vFade = smoothstep(${RAIN_BOTTOM.toFixed(1)}, ${(RAIN_BOTTOM+3).toFixed(1)}, position.y)
          * smoothstep(${RAIN_TOP.toFixed(1)}, ${(RAIN_TOP-4).toFixed(1)}, position.y);
    gl_PointSize = aSize * uSizeScale * (140.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const rainFrag = `
  precision mediump float;
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uUvSquash;
  varying float vFade;
  void main(){
    vec2 uv = gl_PointCoord;
    // vertically squash the sprite's UVs around its center as the
    // camera's view direction approaches straight up/down - this is
    // the actual fix for "rain looks like long lines when you look up"
    // described in the reference article: compress the sample instead
    // of trying to reorient billboard geometry that has no real length.
    uv.y = 0.5 + (uv.y - 0.5) * uUvSquash;
    if(uv.y < 0.0 || uv.y > 1.0) discard;
    vec4 tex = texture2D(uMap, uv);
    gl_FragColor = vec4(uColor, tex.a * uOpacity * vFade);
  }
`;
const rainMat = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: rainDropSprite() },
    uColor: { value: new THREE.Color(0x9fb0c8) },
    uOpacity: { value: 0.4 },
    uUvSquash: { value: 1.0 },
    uSizeScale: { value: 1.0 },
  },
  vertexShader: rainVert,
  fragmentShader: rainFrag,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false, // manual distance-fog blend added in updateRain would be
              // overkill for particles this close to the player; the
              // additive blend already fades them against the fogged
              // scene behind them same as the old line rain did
});
const rain = new THREE.Points(rainGeo, rainMat);
// rain always wraps to stay within RAIN_RADIUS of the player (see updateRain),
// but Three.js only computes a geometry's boundingSphere once, lazily, from
// whatever the vertex positions happen to be at that moment - here, still
// clustered near world origin at init. With the player spawning away from
// origin that stale sphere no longer overlaps most of the view frustum, so
// rain would only render by coincidence (e.g. looking up). Since this is a
// small particle buffer, just skip frustum culling for it entirely rather
// than trying to keep a bounding sphere in sync every frame.
rain.frustumCulled = false;
scene.add(rain);

/* ---------- FAR RAIN (illusion layer) ----------
   The real particle rain above only ever simulates within RAIN_RADIUS
   (40 units) of the player - cheap, but it means the world reads as a
   rain "bubble" with a visible edge rather than weather actually
   covering the map. Rather than widening the real simulation (1400
   line segments already; scaling that out to map-covering radius
   would multiply the particle count for no visual gain at distance,
   since individual streaks that far out are sub-pixel anyway), this
   is a single cheap surrounding shell: a large open cylinder, always
   centered on the player, with a scrolling streak texture on its
   inner face. No per-particle simulation - one mesh, one texture
   scroll per frame. Reads as "it's raining everywhere past what you
   can see clearly," which is the actual illusion wanted, for the cost
   of one draw call.
   Sits at FAR_RAIN_RADIUS (110), deliberately past where FogExp2
   density 0.0135 (see core/scene.js) has already reduced visibility
   to a low value - it fades into the existing fog/haze rather than
   presenting its own hard edge, same trick the skirt plane and star-
   dome use for their outer boundaries. */
function farRainTexture(){
  const size = 128, c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.clearRect(0,0,size,size);
  // vertical streaks, staggered columns, thin - reads as rain at a
  // glance without needing individual line simulation
  for(let i=0;i<40;i++){
    const x = Math.random()*size;
    const len = 30+Math.random()*70;
    const y = Math.random()*size;
    const alpha = 0.12+Math.random()*0.18;
    ctx.strokeStyle = `rgba(180,196,216,${alpha})`;
    ctx.lineWidth = 1+Math.random()*1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x+2, y+len);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const FAR_RAIN_RADIUS = 110, FAR_RAIN_HEIGHT = 46;
const farRainTex = farRainTexture();
farRainTex.repeat.set(14, 3);
// vertical alpha falloff so the shell fades at top and bottom instead
// of ending in a hard horizontal line - a small 1-wide gradient strip,
// multiplied against the streak texture via the material's alphaMap
// rather than baked into the streak canvas itself, so the streak
// texture can keep tiling seamlessly in V without the fade repeating
// with it.
function farRainFadeTexture(){
  const c = makeCanvas(64);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0,0,0,64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.28, 'rgba(255,255,255,1)');
  g.addColorStop(0.72, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
const farRainGeo = new THREE.CylinderGeometry(FAR_RAIN_RADIUS, FAR_RAIN_RADIUS, FAR_RAIN_HEIGHT, 40, 1, true);
const farRainMat = new THREE.MeshBasicMaterial({
  map: farRainTex, alphaMap: farRainFadeTexture(), transparent:true, opacity:0.5,
  side: THREE.BackSide, // player is inside the cylinder looking out at its inner face
  depthWrite:false, blending:THREE.AdditiveBlending, fog:true
});
patchFogToDistance(farRainMat);
const farRain = new THREE.Mesh(farRainGeo, farRainMat);
farRain.position.y = (RAIN_TOP+RAIN_BOTTOM)/2; // same vertical band the near rain falls through
farRain.frustumCulled = false; // always centered on the player and huge - same reasoning as rain/dust above
scene.add(farRain);

/* ---------- DUST ---------- */
// mirrors rain's clear->black wrongness lerp (see RAIN_COLOR_CLEAR/BLACK
// above) so the two particle layers cohere instead of dust staying a flat,
// static wash while everything else in the scene visibly sours with dread.
const DUST_COLOR_CLEAR = new THREE.Color(0xdcd6c8);
const DUST_COLOR_WRONG = new THREE.Color(0x6e3f50);
const DUST_COUNT = 260, DUST_RADIUS = 26;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_COUNT*3);
const dustSeed = new Float32Array(DUST_COUNT);
for(let i=0;i<DUST_COUNT;i++){
  dustPos[i*3]=(Math.random()-0.5)*DUST_RADIUS*2;
  dustPos[i*3+1]=Math.random()*5.5;
  dustPos[i*3+2]=(Math.random()-0.5)*DUST_RADIUS*2;
  dustSeed[i]=Math.random()*100;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos,3));
const dustMat = new THREE.PointsMaterial({ size:0.14, map:dustSprite(), transparent:true, opacity:0.55, blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true });
const dust = new THREE.Points(dustGeo, dustMat);
dust.frustumCulled = false; // same reasoning as rain above - wraps around the player, stale lazy bounding sphere would cull it inconsistently
scene.add(dust);

const RAIN_COLOR_CLEAR = new THREE.Color(0x9fb0c8);
const RAIN_COLOR_BLACK = new THREE.Color(0x0a0508);
// how hard the sprite compresses/shrinks as the camera's look direction
// approaches straight up or down - 1.0 would mean no compression at all
const RAIN_MIN_UV_SQUASH = 0.22, RAIN_MIN_SIZE_SCALE = 0.5;
const _camDir = new THREE.Vector3();
function updateRain(dt){
  // rain has no per-particle occlusion against roofs (there's no geometry
  // raycast for weather) - the safehouse is the only roofed interior in
  // the game right now, so it's cheaper and correct-enough to just hide
  // the whole layer while the player is standing inside its footprint,
  // same test the interior ambient sound gain uses.
  const insideSafehouse = Math.abs(state.playerX-SAFEHOUSE_CENTER.x) < SAFEHOUSE_HALF_W-0.25
                        && Math.abs(state.playerZ-SAFEHOUSE_CENTER.z) < SAFEHOUSE_HALF_D-0.25;
  state.insideSafehouse = insideSafehouse; // also read by updateDread, which runs later this same frame
  rain.visible = !insideSafehouse;
  const wrongness = Math.max(state.dread, state.forgetting);
  rainMat.uniforms.uColor.value.copy(RAIN_COLOR_CLEAR).lerp(RAIN_COLOR_BLACK, wrongness);
  rainMat.uniforms.uOpacity.value = 0.4 + wrongness*0.35;

  // compress the drop sprites as the camera looks toward vertical - the
  // fix for flat billboards keeping their elongated streak shape no
  // matter which way the camera faces (see rainFrag's comment above).
  camera.getWorldDirection(_camDir);
  const verticalFacing = Math.abs(_camDir.y);
  rainMat.uniforms.uUvSquash.value = THREE.MathUtils.lerp(1, RAIN_MIN_UV_SQUASH, verticalFacing);
  rainMat.uniforms.uSizeScale.value = THREE.MathUtils.lerp(1, RAIN_MIN_SIZE_SCALE, verticalFacing);

  const arr = rainGeo.attributes.position.array;
  const px=state.playerX, pz=state.playerZ;
  const gustMul = 1 + state.windGust*2.2;
  const windX = state.windX*0.4*gustMul, windZ = state.windZ*0.4*gustMul;
  const suction = wrongness>0.8 ? (wrongness-0.8)/0.2 : 0; // 0..1 near peak dread

  // drift each rain cell slowly around the player - phase advances at the
  // cell's own speed (some cw, some ccw, per-cell rate from init) so the
  // patches roam independently instead of the whole disc moving as one
  // block. Wind gives the patches a visible push too.
  for(let c=0;c<RAIN_CELL_COUNT;c++){
    rainCellPhase[c] += rainCellSpeed[c]*dt;
    rainCellX[c] = Math.cos(rainCellPhase[c])*rainCellOrbit[c] + windX*6.0;
    rainCellZ[c] = Math.sin(rainCellPhase[c])*rainCellOrbit[c] + windZ*6.0;
  }

  for(let i=0;i<RAIN_COUNT;i++){
    const idx=i*3;
    const cell = rainDropCell[i];
    const cx = px+rainCellX[cell], cz = pz+rainCellZ[cell], cr = rainCellR[cell];
    const fallSpeed = rainVel[i]*(1-suction*1.4); // goes negative at full suction - rain rises
    let y = arr[idx+1] - fallSpeed*dt;
    arr[idx] += windX*dt*3.0;
    arr[idx+2] += windZ*dt*3.0;
    if(y < RAIN_BOTTOM){
      y = RAIN_TOP*Math.random()+RAIN_TOP*0.3;
      arr[idx] = cx + (Math.random()-0.5)*cr*2;
      arr[idx+2] = cz + (Math.random()-0.5)*cr*2;
    } else {
      // keep each drop within its own cell's radius (wrap relative to the
      // cell center, which itself drifts around the player) instead of
      // wrapping across the whole RAIN_RADIUS disc - this is what keeps
      // the patches from smearing back out into uniform coverage.
      let dx = arr[idx]-cx;
      if(dx>cr) arr[idx]-=cr*2;
      else if(dx<-cr) arr[idx]+=cr*2;
      let dz = arr[idx+2]-cz;
      if(dz>cr) arr[idx+2]-=cr*2;
      else if(dz<-cr) arr[idx+2]+=cr*2;
    }
    arr[idx+1]=y;
  }
  rainGeo.attributes.position.needsUpdate = true;

  // far rain shell - just follow the player and scroll the texture, no
  // per-particle work. Kept visible indoors too (unlike the near rain,
  // which hides for lack of roof occlusion): this shell sits well
  // outside the safehouse footprint, so seeing it faintly through a
  // window while sheltering is correct, not a bug.
  farRain.position.x = px; farRain.position.z = pz;
  farRainTex.offset.y -= dt*0.18;
  farRainMat.opacity = (0.42 + wrongness*0.22) * (1-suction*0.6);
}

function updateDust(dt){
  const arr = dustGeo.attributes.position.array;
  const px=state.playerX, pz=state.playerZ;
  const t = performance.now()*0.0006;

  // wind slowly rotates direction over time instead of staying fixed
  state.windTarget += dt*0.05;
  const targetX = Math.cos(state.windTarget)*0.9, targetZ = Math.sin(state.windTarget)*0.9;
  state.windX += (targetX-state.windX)*dt*0.15;
  state.windZ += (targetZ-state.windZ)*dt*0.15;

  // gusts: windGust spikes from 0 toward 1 then decays, on an irregular timer.
  // used to swell wind audio, kick rain sideways harder, and sway the camera.
  state.windGustTimer -= dt;
  if(state.windGustTimer<=0){
    state.windGustTimer = 4 + Math.random()*7;
    state.windGust = 1;
  }
  state.windGust = Math.max(0, state.windGust - dt*0.5);

  const pull = Math.max(state.dread, state.forgetting);
  // dust was flat and static regardless of dread - now cools toward a
  // bruised violet-rust and thickens as things sour, with a slow twinkle
  // (independent of the per-particle drift above) so it doesn't read as
  // a static texture wash even when the player is standing still.
  dustMat.color.copy(DUST_COLOR_CLEAR).lerp(DUST_COLOR_WRONG, pull*0.7);
  dustMat.opacity = (0.45 + pull*0.35) * (0.85 + 0.15*Math.sin(t*3.2));
  for(let i=0;i<DUST_COUNT;i++){
    const idx=i*3;
    const seed = dustSeed[i];
    arr[idx] += state.windX*dt*0.55 + Math.sin(t+seed)*0.003;
    arr[idx+1] += 0.0025 + Math.sin(t*0.7+seed)*0.0015 + pull*pull*dt*3.5;
    arr[idx+2] += state.windZ*dt*0.55 + Math.cos(t+seed)*0.003;
    if(arr[idx+1]>6+pull*40) arr[idx+1]=0;
    let dx=arr[idx]-px;
    if(dx>DUST_RADIUS) arr[idx]-=DUST_RADIUS*2; else if(dx<-DUST_RADIUS) arr[idx]+=DUST_RADIUS*2;
    let dz=arr[idx+2]-pz;
    if(dz>DUST_RADIUS) arr[idx+2]-=DUST_RADIUS*2; else if(dz<-DUST_RADIUS) arr[idx+2]+=DUST_RADIUS*2;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// HUD weather label support: counts how many squall cells are currently
// drifting near the player (rainCellX/Z are already player-relative - see
// updateRain above) rather than reading any authored "weather state",
// since none exists in this file. Fuzzy by nature (a read of what's
// actually rendering, not a designed intensity level) - see
// docs/HANDOFF.md's weather-label entry for the tradeoff.
export function getNearbySquallCount(radius=14){
  let n = 0;
  for(let c=0;c<RAIN_CELL_COUNT;c++){
    if(Math.hypot(rainCellX[c], rainCellZ[c]) < radius) n++;
  }
  return n;
}

export { cloudLayer, cloudLayer2, cloudMat, cloudMat2, dripLayer, dripMat, rain, farRain, dust, updateRain, updateDust };