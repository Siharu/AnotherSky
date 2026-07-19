/* ============================================================
   render/postprocessing.js — currently holds just the two small,
   truly load-bearing helpers, pulled from the monolith
   (anothersky-horror.html) verbatim: makeCanvas() and
   patchFogToDistance().

   IMPORTANT: this was found as an empty `export {}` stub while doing
   unrelated work, despite main.js (dozens of call sites) and
   sky/weather.js already having real `import { makeCanvas,
   patchFogToDistance } from './render/postprocessing.js'` lines
   pointing at it. That's not a stale-comment issue - it's a hard
   module-load failure: a browser's ES module loader rejects an
   import of a name the target module doesn't export, so the whole
   game currently cannot boot in the modular build. Filling in just
   these two now, as a targeted fix, rather than doing the full
   Wave 3 postprocessing.js migration (Bayer dithering, half-res
   upscale, scanlines, chromatic aberration, dread vignette) in the
   same pass - see docs/HANDOFF.md for why that's still deferred and
   what's still a stub below.

   Both are genuinely dependency-free: makeCanvas() only touches the
   DOM, patchFogToDistance() only touches the material passed in via
   a shader patch. No THREE global state, no `state`/`scene` reads -
   safe to import from anywhere without circular-import risk.
   ============================================================ */

function makeCanvas(size){ const c=document.createElement('canvas'); c.width=c.height=size; return c; }

/* Three.js's built-in fog applies over the *view-space z depth* of a
   vertex, not true distance from the camera. That's correct for most
   geometry, but this game leans on axis-aligned boxes seen at sharp
   angles (building corners, wall segments) - near a screen edge or a
   steep viewing angle, those objects suddenly have a small depth value
   (they're now roughly perpendicular to view direction), so fog
   under-applies and distant geometry renders clearly - the "floating
   blocks" bug. This patches fog to use true Euclidean distance
   instead. */
function patchFogToDistance(mat){
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>',
      `#ifdef USE_FOG
        fogDepth = length( mvPosition.xyz );
      #endif`
    );
  };
  mat.needsUpdate = true;
  return mat;
}

/* ---------- ADDED THIS ROUND: two more small, dependency-free,
   load-bearing helpers, pulled as prerequisites for world/buildings.js
   and world/props.js rather than waiting for the full Wave 3 pass ----- */

/* Point lights are otherwise invisible - this adds a soft, camera-facing
   additive sprite at each light so the source itself reads as glowing.
   Only depends on makeCanvas() (already real, above) and THREE globals -
   no `state`/`scene` reads, safe to import from anywhere. */
function glowSprite(){
  const size=128, c=makeCanvas(size), ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.35,'rgba(255,255,255,0.4)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,size,size);
  return new THREE.CanvasTexture(c);
}
const glowTex = glowSprite();
function addGlow(parent, color, size, opacity){
  const mat = new THREE.SpriteMaterial({
    map: glowTex, color, transparent:true, blending:THREE.AdditiveBlending,
    depthWrite:false, fog:false, opacity: opacity!==undefined?opacity:0.8, toneMapped:false
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(size,size,1);
  parent.add(spr);
  return spr;
}

/* Shared uniform - the same object reference gets injected into every
   building material's compiled shader, so updating meltUniform.value once
   per frame (main.js's updateSky, still unmoved) pushes a vertical wobble/
   sag effect to every building at once without tracking a material list.
   Layers on top of the fog-distance patch above so full sky wrongness
   reads as the world visibly softening/melting. Genuinely dependency-free
   beyond THREE itself - no state/scene reads. */
const meltUniform = { value: 0 };
function patchFogAndMelt(mat){
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMelt = meltUniform;
    shader.vertexShader = 'uniform float uMelt;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>',
      `#ifdef USE_FOG
        fogDepth = length( mvPosition.xyz );
      #endif`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
        float meltHeight = max(position.y, 0.0);
        float meltPhase = meltHeight*0.55 + (modelMatrix[3].x + modelMatrix[3].z)*0.2;
        float meltWob = sin(meltPhase) * uMelt * meltHeight * 0.05;
        transformed.x += meltWob;
        transformed.z += meltWob * 0.7;
        transformed.y -= uMelt * pow(meltHeight*0.05, 1.7) * 0.9;`
    );
  };
  mat.needsUpdate = true;
  return mat;
}

// ---------- Rest of the Wave 3 postprocessing migration ----------
// STUB - not yet migrated from the monolith. See docs/ARCHITECTURE.md
// for the full migration map and verification checklist.
//
// Target content still owed here (from anothersky-horror.html):
//   PS2 pipeline: Bayer dithering, half-res upscale, scanlines,
//   chromatic aberration, dread vignette
//
// Monolith line range (approximate, will drift as the monolith gets
// edited - re-grep before pulling): grep vignette, scanline, dither

export { makeCanvas, patchFogToDistance, addGlow, meltUniform, patchFogAndMelt };