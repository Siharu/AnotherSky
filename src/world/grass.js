/* ---------- GRASS ----------
   Stylized triangle-blade grass, GLSL-driven, following the "sliding
   window around the player" technique (see the reference article
   linked in docs/HANDOFF.md for this round - the shader below is an
   original implementation of the same technique, not copied from it,
   adapted to this project's own terrain/fog/material conventions).

   Core idea: a fixed pool of blades (each just 3 vertices - two base
   corners collapsed to a point, one tip) sits in a small square patch
   that re-centers on the player every frame via mod()-wrapping in the
   vertex shader. The blade pool never grows or regenerates - the same
   handful of blades just keep reappearing around wherever the player
   currently is, so a fixed-size buffer covers infinite walking distance
   the same way world/streaming.js's chunk pool does for buildings.

   Unlike the reference technique (which samples a baked heightmap
   texture for ground height, because its landscape was an arbitrary
   sculpted mesh), this project's ground is a simple analytic ripple
   (world/terrain.js terrainHeight()) - so the shader below just ports
   that same sine formula to GLSL directly. Simpler than baking/
   bilinear-sampling a texture, and guaranteed to match the real mesh
   underfoot exactly since it's the literal same formula, not a lossy
   render of it. Only applies in the GROUND_REAL_RADIUS zone (see
   terrain.js) - grass fades out with uEdgeFade before it would ever
   need the blended/skirt heights, so that part of terrain.js's height
   function doesn't need porting.

   No external texture assets - the noise field and diffuse color map
   are both generated on a canvas at load time via makeCanvas(), same
   "procedural texture, no asset files" pattern used everywhere else in
   world/materials.js. */

// THREE is a classic global script here, same as everywhere else in this
// codebase - see docs/HANDOFF.md's "READ THIS FIRST" note.
import { scene } from '../core/scene.js';
import { state } from '../core/state.js';
import { makeCanvas } from '../render/postprocessing.js';
import { SAFEHOUSE_CENTER } from './safehouse.js';
import { getCorruptionEdgeRadius } from '../systems/zones.js';

const BLADE_COUNT = 36000;
const PATCH_SIZE = 30;       // world units square, re-centers on the player
const MAX_BLADE_HEIGHT = 0.62;
const BLADE_WIDTH = 0.075;

// Quality scaling: this mesh is a single plain THREE.Mesh (not an
// InstancedMesh - see the header above, position is computed entirely
// in-shader from a fixed vertex buffer), so there's no `.count` to turn
// down the way buildings.js's InstancedMeshes can. The equivalent lever
// for a plain BufferGeometry is geometry.setDrawRange() - it changes how
// many vertices actually get drawn without touching the underlying
// buffers, so it's just as cheap to change at runtime as an InstancedMesh
// count would be.
//
// Deliberately reuses settingsResScale (systems/settings.js) rather than
// adding a new slider/UI - one existing knob the player already has
// access to, instead of one more setting to design UI for and explain.
// grass.js does NOT import settings.js to read it directly (that would
// be a new one-directional import in the wrong place architecturally,
// and risks becoming circular later if settings.js ever needs anything
// grass-side back) - settings.js imports setGrassQuality() from here
// instead and calls it from applyResolution(), so the dependency points
// the same direction as everywhere else in the settings system: outward
// from settings.js into the systems it controls, never back.
//
// setGrassQuality() can be called before initGrass() has ever run
// (settings.js applies the saved/default resolution scale once at
// module load, which happens before main.js's init sequence gets to
// building the actual scene) - pendingQualityScale covers that case, and
// initGrass() reads it when the geometry is first built instead of
// always starting at full density and correcting one frame later.
let pendingQualityScale = 1;

// Linear (not quadratic like pixel-ratio scaling) since blade count is
// itself already a 2D-area quantity, not a per-axis one - halving this
// halves the drawn triangle count directly. Floored at 30% so low-end
// settings thin the grass noticeably without ever fully balding it out
// (a bald patch under the player's feet would read as a bug, not as
// "low settings").
function effectiveBladeCount(scale){
  const clamped = Math.max(0.3, Math.min(1, scale));
  return Math.round(BLADE_COUNT * clamped);
}

export function setGrassQuality(scale){
  pendingQualityScale = scale;
  if(!geo) return; // applied from initGrass() once the mesh exists
  geo.setDrawRange(0, effectiveBladeCount(scale) * 3); // *3: 3 vertices per blade
}

/* ---------- procedural textures ---------- */

// Tileable-ish value noise: three independent random channels, each
// blurred a little so sampling it doesn't look like static. Two
// different uses read this (blade height/bald-patch variation, and
// wind), same as the reference technique's single reused noise map.
function buildNoiseTexture(){
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for(let i=0;i<img.data.length;i+=4){
    img.data[i]   = Math.random()*255;
    img.data[i+1] = Math.random()*255;
    img.data[i+2] = Math.random()*255;
    img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // soften with a couple of self-blur passes so it reads as drifting
  // clumps of value rather than pure per-pixel static
  ctx.globalAlpha = 0.5;
  ctx.filter = 'blur(3px)';
  ctx.drawImage(c, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Blotchy green diffuse map the fragment shader tiles across the whole
// patch - gives blade-to-blade color variation instead of one flat
// green, same role groundTexture()/streetTexture() play for their
// meshes.
function buildDiffuseTexture(){
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2c4a26';
  ctx.fillRect(0,0,size,size);
  for(let i=0;i<220;i++){
    const x=Math.random()*size, y=Math.random()*size, r=8+Math.random()*26;
    const grad = ctx.createRadialGradient(x,y,0,x,y,r);
    const dark = Math.random()<0.5;
    const col = dark ? `${20+Math.random()*10},${34+Math.random()*14},${16+Math.random()*10}`
                      : `${54+Math.random()*22},${78+Math.random()*26},${40+Math.random()*18}`;
    grad.addColorStop(0, `rgba(${col},0.5)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,size,size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---------- geometry ----------
   Every blade is 3 vertices, non-indexed (drawn straight as a TRIANGLES
   list) - all 3 share the same aBladeOrigin (its slot in the patch) and
   aYaw (its facing), and differ only in the `color` attribute, which
   the vertex shader reads as a corner tag rather than an actual color:
   bottom-left tags red, bottom-right tags blue, tip tags green=1
   (white). That tag is what lets three collapsed-to-a-point vertices
   fan out into an actual triangle entirely inside the shader. */
function buildGeometry(){
  const positions = new Float32Array(BLADE_COUNT*3*3); // all zero - real position is computed in-shader
  const colors    = new Float32Array(BLADE_COUNT*3*3);
  const origins   = new Float32Array(BLADE_COUNT*3*3);
  const yaws      = new Float32Array(BLADE_COUNT*3*3);

  const half = PATCH_SIZE/2;
  for(let i=0;i<BLADE_COUNT;i++){
    const ox = (Math.random()*2-1)*half;
    const oz = (Math.random()*2-1)*half;
    const yaw = Math.random()*Math.PI*2;
    const yx = Math.sin(yaw), yz = -Math.cos(yaw);

    const corners = [
      [0.1, 0, 0],   // bottom-left tag
      [0, 0, 0.1],   // bottom-right tag
      [1, 1, 1],     // tip (isTop = green channel)
    ];
    for(let c=0;c<3;c++){
      const vi = (i*3+c)*3;
      colors[vi]=corners[c][0]; colors[vi+1]=corners[c][1]; colors[vi+2]=corners[c][2];
      origins[vi]=ox; origins[vi+1]=0; origins[vi+2]=oz;
      yaws[vi]=yx; yaws[vi+1]=0; yaws[vi+2]=yz;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aBladeOrigin', new THREE.BufferAttribute(origins, 3));
  geo.setAttribute('aYaw', new THREE.BufferAttribute(yaws, 3));
  // the shader repositions every vertex every frame relative to the
  // player, so the raw (all-zero) local bounds mean nothing to THREE's
  // frustum test - skip it, same call the reference technique makes.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), PATCH_SIZE*2);
  return geo;
}

/* ---------- shaders ---------- */

const vertexShader = /* glsl */`
varying vec3 vAo;
varying vec2 vWorldUV;
varying float vFogDepth;
varying float vCorruption;

uniform float uTime;
uniform vec3 uPlayerPos;
uniform float uPatchSize;
uniform float uBladeWidth;
uniform float uMaxBladeHeight;
uniform float uWindDirection;
uniform float uWindSpeed;
uniform float uWindNoiseScale;
uniform float uMaxBendAngle;
uniform float uBaldPatchModifier;
uniform float uFalloffSharpness;
uniform float uHeightNoiseFreq;
uniform float uHeightNoiseAmp;
uniform float uRandomHeightAmount;
uniform float uInsideSafehouse; // 0/1 - see updateGrass()'s comment for why this exists
uniform vec2 uCorruptionOrigin;
uniform float uCorruptionEdge; // growing radius - see systems/zones.js's getCorruptionLevel() for the matching JS-side formula this mirrors
uniform sampler2D uNoiseTex;

attribute vec3 aBladeOrigin;
attribute vec3 aYaw;

// cheap deterministic hash - standard one-liner, used only for a touch
// of per-blade height jitter so the patch doesn't look too uniform
float hash21(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}

mat3 rotateAroundAxis(vec3 axis, float angle){
  axis = normalize(axis);
  float s = sin(angle), c = cos(angle), oc = 1.0-c;
  return mat3(
    oc*axis.x*axis.x+c,        oc*axis.x*axis.y-axis.z*s, oc*axis.z*axis.x+axis.y*s,
    oc*axis.x*axis.y+axis.z*s, oc*axis.y*axis.y+c,        oc*axis.y*axis.z-axis.x*s,
    oc*axis.z*axis.x-axis.y*s, oc*axis.y*axis.z+axis.x*s, oc*axis.z*axis.z+c
  );
}

// world/terrain.js terrainHeight(), ported 1:1 so blades land exactly
// on the real ground mesh instead of an approximation of it.
float terrainHeightGLSL(float x, float z){
  return sin(x*0.045)*0.55 + cos(z*0.06)*0.5 + sin((x+z)*0.025)*0.35;
}

void main(){
  float halfSize = uPatchSize*0.5;

  // sliding-window wrap: reposition this blade's slot to wherever it
  // currently falls relative to the player, wrapping at the patch
  // bounds - the pool never runs out no matter how far the player walks.
  vec2 wrapped;
  wrapped.x = mod(aBladeOrigin.x - uPlayerPos.x + halfSize, uPatchSize) - halfSize;
  wrapped.y = mod(aBladeOrigin.z - uPlayerPos.z + halfSize, uPatchSize) - halfSize;

  vec3 worldPos = vec3(uPlayerPos.x + wrapped.x, 0.0, uPlayerPos.z + wrapped.y);
  worldPos.y = terrainHeightGLSL(worldPos.x, worldPos.z);

  vWorldUV = worldPos.xz * 0.08;
  // mirrors systems/zones.js's getCorruptionLevel() falloff exactly
  // (CORRUPTION_BAND=40 hardcoded here as a literal since it's a fixed
  // constant, not something that needs to vary at runtime the way
  // uCorruptionEdge does) - computed per-blade from worldPos rather than
  // a single flat value for the whole patch, since blades within one
  // patch can span a meaningful chunk of the falloff band near the edge
  float corruptionDist = distance(worldPos.xz, uCorruptionOrigin);
  vCorruption = clamp((uCorruptionEdge - corruptionDist) / 40.0, 0.0, 1.0);
  vec3 heightNoise = texture2D(uNoiseTex, vWorldUV * uHeightNoiseFreq).rgb;

  float bladeHeight = (heightNoise.r+heightNoise.g+heightNoise.b) * uMaxBladeHeight * uHeightNoiseAmp;
  bladeHeight += hash21(vWorldUV) * uRandomHeightAmount * 0.1;

  // clumpy/patchy edges rather than a hard-cut square mat: blades
  // shrink toward the patch border, and get further thinned by noise
  // the closer they are to that border (bald patches concentrate at
  // the edge, not the middle).
  float edgeX = abs(wrapped.x)/halfSize, edgeZ = abs(wrapped.y)/halfSize;
  float edgeFactor = pow(clamp(1.0 - max(edgeX,edgeZ), 0.0, 1.0), uFalloffSharpness);
  bladeHeight -= heightNoise.r * uBaldPatchModifier * (1.0-edgeFactor);
  bladeHeight = max(bladeHeight, 0.0);

  // grass had no concept of the safehouse interior at all - it's a
  // player-centered patch that follows the player everywhere, including
  // indoors, and the safehouse floor sits at the same world XZ the
  // exterior ground does (interiors aren't spatially separated in this
  // project), so blades were rendering straight through the floor/walls.
  // sky/weather.js already computes state.insideSafehouse every frame and
  // uses it the same way to hide rain (rain.visible = !insideSafehouse) -
  // reusing that exact signal here instead of re-deriving the safehouse
  // AABB a second time. Zeroing height also zeroes width via the
  // smoothstep below, collapsing every blade to an invisible point -
  // same practical effect as toggling visibility, just per-blade since
  // this mesh (unlike rain's own Points object) has no single flag to flip.
  if(uInsideSafehouse > 0.5) bladeHeight = 0.0;

  float isTop = color.g;                                    // 1 at the tip, 0 at either base vertex
  float side  = (color.r > 0.05) ? 1.0 : (color.b > 0.05) ? -1.0 : 0.0; // which base corner

  float width = smoothstep(0.0, uMaxBladeHeight*0.5, bladeHeight) * uBladeWidth;
  vec3 blade = vec3(aYaw.x * width*0.5*side, bladeHeight*isTop, aYaw.z * width*0.5*side);

  // wind: a second, scrolled/rotated noise sample bends the tip around
  // a roughly-horizontal axis. Pivoted from the blade's own base (the
  // "subtract height, rotate, add height back" step below) so it bends
  // like a hinge instead of swinging from the ground origin.
  vec2 windUV = worldPos.xz * (uWindNoiseScale*0.1);
  float wd = uWindDirection;
  mat2 windRot = mat2(cos(wd), -sin(wd), sin(wd), cos(wd));
  windUV = windRot*windUV + uTime*uWindSpeed;
  vec3 windNoise = texture2D(uNoiseTex, windUV).rgb;
  vec3 bendAxis = vec3(windNoise.g - 0.5, 0.0, windNoise.b - 0.5);
  float bendAngle = radians(mix(-uMaxBendAngle, uMaxBendAngle, clamp(windNoise.g+windNoise.b-0.5, 0.0, 1.0))) * isTop;
  mat3 bend = rotateAroundAxis(length(bendAxis) > 0.0001 ? bendAxis : vec3(1.0,0.0,0.0), bendAngle);
  blade = bend * blade;

  vAo = vec3(mix(0.22, 1.0, isTop)); // near-black base, full bright tip - cheap fake AO

  vec3 transformed = worldPos + blade;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vFogDepth = length(mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */`
varying vec3 vAo;
varying vec2 vWorldUV;
varying float vFogDepth;
varying float vCorruption;

uniform sampler2D uDiffuseMap;
uniform vec3 uFogColor;
uniform float uFogDensity;

void main(){
  vec3 tex = texture2D(uDiffuseMap, vWorldUV*10.0).rgb;
  vec3 col = tex * vAo;

  // spreading corruption (systems/zones.js) - blends toward a near-black,
  // slightly desaturated dead tone rather than pure black, so it reads as
  // dead/wrong grass rather than a flat missing-texture-looking void.
  // Applied before the fog blend below so it's the actual ground truth
  // color fog then mixes with, not something fog would wash back out.
  vec3 deadColor = vec3(0.04, 0.035, 0.03);
  col = mix(col, deadColor, vCorruption);

  // same FogExp2 falloff scene.fog uses elsewhere, applied by true
  // distance (see render/postprocessing.js patchFogToDistance's
  // reasoning for why view-space z alone isn't used) so the patch
  // blends into the scene instead of hard-cutting at its own edge.
  float fogFactor = 1.0 - exp(-uFogDensity*uFogDensity*vFogDepth*vFogDepth);
  col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------- module state ---------- */

let mesh = null;
let material = null;
let geo = null; // used by setGrassQuality() above to adjust draw range post-init

function buildMaterial(){
  const fogColor = scene.fog ? scene.fog.color : new THREE.Color(0x000000);
  const fogDensity = scene.fog ? scene.fog.density : 0.01;
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    vertexColors: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3() },
      uPatchSize: { value: PATCH_SIZE },
      uBladeWidth: { value: BLADE_WIDTH },
      uMaxBladeHeight: { value: MAX_BLADE_HEIGHT },
      uWindDirection: { value: Math.PI*0.25 },
      uWindSpeed: { value: 0.12 },
      uWindNoiseScale: { value: 0.9 },
      uMaxBendAngle: { value: 20 },
      uBaldPatchModifier: { value: 0.5 },
      uFalloffSharpness: { value: 1.6 },
      uHeightNoiseFreq: { value: 1.4 },
      uHeightNoiseAmp: { value: 1.0 },
      uRandomHeightAmount: { value: 0.35 },
      uInsideSafehouse: { value: 0 },
      uCorruptionOrigin: { value: new THREE.Vector2(SAFEHOUSE_CENTER.x, SAFEHOUSE_CENTER.z) },
      uCorruptionEdge: { value: 0 },
      uNoiseTex: { value: buildNoiseTexture() },
      uDiffuseMap: { value: buildDiffuseTexture() },
      uFogColor: { value: fogColor },
      uFogDensity: { value: fogDensity },
    },
  });
}

export function initGrass(){
  if(mesh) return mesh;
  geo = buildGeometry();
  geo.setDrawRange(0, effectiveBladeCount(pendingQualityScale) * 3); // apply whatever quality was set (or the default) before this ran
  material = buildMaterial();
  mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false; // real position only exists post-shader - see buildGeometry()'s note
  mesh.renderOrder = 1; // draw after the ground plane it sits on
  scene.add(mesh);
  return mesh;
}

export function updateGrass(dt){
  if(!material) return;
  material.uniforms.uTime.value += dt;
  material.uniforms.uPlayerPos.value.set(state.playerX, 0, state.playerZ);
  material.uniforms.uInsideSafehouse.value = state.insideSafehouse ? 1 : 0;
  material.uniforms.uCorruptionEdge.value = getCorruptionEdgeRadius();
}