/* ============================================================
   render/colorGrade.js — the "Cinematic Filter" full-screen
   color-grade pass. See git history / chat log for the original
   incident (file didn't exist, then a per-pixel HSV grade shader
   that was correct but slow).

   Rewritten to a LUT-based grade, the same technique engines like
   Unreal (Wuthering Waves, Endfield) use for this: bake the desired
   look into a lookup texture ONCE, then the per-frame cost is a
   texture sample + mix instead of a contrast curve + full RGB<->HSV
   round trip + a 4-tap blur, all recomputed 60x/sec per pixel. The
   look itself - the gold/black duotone read (dark, near-monochrome
   base with warm highlights staying in color) - is authored into
   bakeLUT() below, once, in plain JS math where cost doesn't matter,
   not in the fragment shader where it did.

   Still no EffectComposer/addons (index.html only loads core three.js
   r128) - still a hand-rolled offscreen-target + full-screen-quad
   pass, same shape as before. The expensive part was always the
   fragment shader's math, not the two-pass structure, so this keeps
   that structure and just guts what runs per-pixel.
   ============================================================ */

import { renderer, scene, camera } from '../core/scene.js';

const _bufSize = new THREE.Vector2();

let enabled = true;

/* ---------- offscreen target the scene renders into when the
   filter is on ---------- */
let rt = new THREE.WebGLRenderTarget(
  Math.max(1, window.innerWidth),
  Math.max(1, window.innerHeight),
  { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
);

const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new THREE.Scene();

/* ---------- LUT bake: gold/black duotone look ----------
   Runs once, at module load, in plain JS - this is where all the
   "expensive" grading math from the old shader now lives, since
   here it costs nothing (LUT_SIZE^3 texels, computed once, not
   LUT_SIZE^3 * screen-pixels * 60fps).

   The look: crush toward a near-black base, then lerp that base
   toward a warm gold based on luminance (a duotone gradient, not a
   flat tint) - this IS the "gold and black filter" read. Pixels
   that are already warm in hue (fire, lamps, skin) get blended back
   toward their real color instead of the duotone, the same way a
   film emulation keeps practical light sources reading as light
   sources rather than flattening everything to two colors. Cool/
   neutral pixels (sky, fog, foliage) go almost fully duotone -
   that's what deletes the background color noise and makes the
   warm highlights the only thing that reads as "color" on screen. */
const LUT_SIZE = 16; // perfect square (4x4 tile grid) - see sampleLut3D's assumption below
const GOLD = [1.0, 0.78, 0.42];   // highlight duotone color
const BLACK_TINT = [0.03, 0.02, 0.015]; // shadow duotone color - not pure 0, keeps blacks from looking dead/crushed
const CONTRAST = 1.22;
const PIVOT = 0.16; // this game's baseline luminance runs dark - see prior tuning notes in chat history
const DUOTONE_GAMMA = 0.85; // <1 biases the gold up into the midtones sooner, not just the brightest highlights

function luminance(r, g, b){ return r*0.2126 + g*0.7152 + b*0.0722; }

function rgb2hsv(r, g, b){
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let h = 0;
  if(d !== 0){
    if(max===r) h = ((g-b)/d) % 6;
    else if(max===g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h /= 6; if(h<0) h += 1;
  }
  return [h, max===0?0:d/max, max];
}

function smoothstep(edge0, edge1, x){
  const t = Math.max(0, Math.min(1, (x-edge0)/(edge1-edge0)));
  return t*t*(3-2*t);
}

function bakeLUT(){
  const dim = Math.sqrt(LUT_SIZE); // tile grid columns/rows (4 for LUT_SIZE 16)
  const texSize = dim * LUT_SIZE;
  const data = new Uint8Array(texSize * texSize * 4);

  for(let bz=0; bz<LUT_SIZE; bz++){
    const tileCol = bz % dim, tileRow = Math.floor(bz/dim);
    for(let gy=0; gy<LUT_SIZE; gy++){
      for(let rx=0; rx<LUT_SIZE; rx++){
        let r = rx/(LUT_SIZE-1), g = gy/(LUT_SIZE-1), b = bz/(LUT_SIZE-1);

        // pivot-based contrast (same reasoning as the old shader's
        // uPivot - this scene's dark baseline, not photo mid-grey)
        const contrasted = v => (v - PIVOT) * CONTRAST + PIVOT;
        r = Math.max(0, contrasted(r));
        g = Math.max(0, contrasted(g));
        b = Math.max(0, contrasted(b));

        const lum = Math.min(1, luminance(r,g,b));
        const duoT = Math.pow(lum, DUOTONE_GAMMA);
        const duo = [
          BLACK_TINT[0] + (GOLD[0]-BLACK_TINT[0])*duoT,
          BLACK_TINT[1] + (GOLD[1]-BLACK_TINT[1])*duoT,
          BLACK_TINT[2] + (GOLD[2]-BLACK_TINT[2])*duoT,
        ];

        // warm-hued source pixels keep more of their real color
        // instead of going full duotone - lamps/fire/skin read as
        // themselves, everything else (sky, fog, foliage) reads as
        // the gold/black gradient.
        const [hue, sat] = rgb2hsv(r,g,b);
        const warmWeight = sat * (1.0 - smoothstep(0.10, 0.22, Math.min(hue, 1-hue)));

        let outR = duo[0] + (r-duo[0])*warmWeight;
        let outG = duo[1] + (g-duo[1])*warmWeight;
        let outB = duo[2] + (b-duo[2])*warmWeight;
        outR = Math.max(0, Math.min(1, outR));
        outG = Math.max(0, Math.min(1, outG));
        outB = Math.max(0, Math.min(1, outB));

        const px = tileCol*LUT_SIZE + rx, py = tileRow*LUT_SIZE + gy;
        const idx = (py*texSize + px) * 4;
        data[idx+0] = Math.round(outR*255);
        data[idx+1] = Math.round(outG*255);
        data[idx+2] = Math.round(outB*255);
        data[idx+3] = 255;
      }
    }
  }
  return { data, texSize };
}

const { data: lutData, texSize: LUT_TEX_SIZE } = bakeLUT();
const lutTexture = new THREE.DataTexture(lutData, LUT_TEX_SIZE, LUT_TEX_SIZE, THREE.RGBAFormat);
lutTexture.minFilter = THREE.LinearFilter;
lutTexture.magFilter = THREE.LinearFilter;
lutTexture.wrapS = THREE.ClampToEdgeWrapping;
lutTexture.wrapT = THREE.ClampToEdgeWrapping;
lutTexture.generateMipmaps = false;
lutTexture.needsUpdate = true;

const gradeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    tLut: { value: lutTexture },
    uLutSize: { value: LUT_SIZE },
    uVignette: { value: 0.20 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tLut;
    uniform float uLutSize;
    uniform float uVignette;
    varying vec2 vUv;

    // Standard 2D-tiled 3D LUT sample (LUT_SIZE must be a perfect
    // square - baked assumption shared with bakeLUT() above): 2
    // texture2D samples (adjacent z-slices) + 1 mix, replacing what
    // used to be a 4-tap blur + full RGB<->HSV round trip per pixel.
    vec3 sampleLut3D(vec3 c){
      float lutSize = uLutSize;
      float sliceGrid = sqrt(lutSize);
      float sliceSize = 1.0/sliceGrid;
      float slicePixelSize = sliceSize/lutSize;
      float sliceInnerSize = slicePixelSize*(lutSize-1.0);

      float zSlice0 = floor(c.b*(lutSize-1.0));
      float zSlice1 = min(zSlice0+1.0, lutSize-1.0);
      float zFrac = fract(c.b*(lutSize-1.0));

      vec2 xy = vec2(slicePixelSize*0.5 + c.r*sliceInnerSize, slicePixelSize*0.5 + c.g*sliceInnerSize);

      vec2 tile0 = vec2(mod(zSlice0, sliceGrid), floor(zSlice0/sliceGrid)) * sliceSize;
      vec2 tile1 = vec2(mod(zSlice1, sliceGrid), floor(zSlice1/sliceGrid)) * sliceSize;

      vec3 c0 = texture2D(tLut, tile0+xy).rgb;
      vec3 c1 = texture2D(tLut, tile1+xy).rgb;
      return mix(c0, c1, zFrac);
    }

    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 graded = sampleLut3D(clamp(src.rgb, 0.0, 1.0));

      vec2 centered = vUv - 0.5;
      float vig = 1.0 - dot(centered, centered) * uVignette;
      graded *= vig;

      gl_FragColor = vec4(clamp(graded, 0.0, 1.0), src.a);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gradeMaterial);
quad.frustumCulled = false;
quadScene.add(quad);

let gradeCompileFailed = false;
try{
  renderer.compile(quadScene, quadCamera);
  const program = renderer.properties.get(gradeMaterial).program;
  if(program && program.program){
    const gl = renderer.getContext();
    if(!gl.getProgramParameter(program.program, gl.LINK_STATUS)){
      console.error('[colorGrade] shader program failed to link:', gl.getProgramInfoLog(program.program));
      gradeCompileFailed = true;
    }
  }
}catch(err){
  console.error('[colorGrade] shader compile check failed:', err);
  gradeCompileFailed = true;
}

function setColorGradeEnabled(value){
  enabled = !!value;
}

// The grade pass's cost scales with how many pixels it has to shade
// (render into rt, then sample+mix+vignette on the composite quad), not
// with scene complexity - so rendering that offscreen pass at a lower
// resolution and letting LinearFilter upscale it on the composite quad
// cuts the actual fill-rate cost directly. 0.65 keeps the duotone/
// vignette look visually identical (it's already a soft, low-frequency
// grade, not fine detail) while dropping to well under half the pixel
// count of the native buffer.
const GRADE_RES_SCALE = 0.65;

function resizeColorGrade(){
  renderer.getDrawingBufferSize(_bufSize);
  const w = Math.max(1, Math.floor(_bufSize.x * GRADE_RES_SCALE));
  const h = Math.max(1, Math.floor(_bufSize.y * GRADE_RES_SCALE));
  rt.setSize(w, h);
}
resizeColorGrade();

function renderWithColorGrade(){
  if(!enabled || gradeCompileFailed){
    renderer.render(scene, camera);
    return;
  }
  try{
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);

    gradeMaterial.uniforms.tDiffuse.value = rt.texture;
    renderer.render(quadScene, quadCamera);
  }catch(err){
    console.error('[colorGrade] render pass threw, disabling grade pass for this session:', err);
    gradeCompileFailed = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
}

export { renderWithColorGrade, resizeColorGrade, setColorGradeEnabled };
