/* ============================================================
   render/colorGrade.js — the "Cinematic Filter" full-screen
   color-grade pass. This file was imported by main.js (17,
   3625, 3705) and systems/settings.js (33, 97) but never
   actually existed on disk - same class of bug postprocessing.js
   hit before it (see that file's header comment): a browser's ES
   module loader rejects an import of a name the target module
   doesn't export, so the whole game failed to boot
   (`GET .../render/colorGrade.js 404`) rather than failing loudly
   about a missing export. Filling it in now.

   No EffectComposer/RenderPass/ShaderPass here - index.html only
   loads core three.js r128 (see its <script> tags), no addons -
   so this hand-rolls the same shape: render the scene to an
   offscreen target, then draw a full-screen textured quad with a
   grading ShaderMaterial through its own ortho camera. When the
   filter is off, renderWithColorGrade() just does the plain
   renderer.render(scene, camera) - this module is main.js's ONLY
   render call site either way (grep confirms no other
   renderer.render anywhere), so both paths live here.
   ============================================================ */

import { renderer, scene, camera } from '../core/scene.js';

// Deliberately NOT importing settingsResScale from systems/settings.js
// here - that module imports setColorGradeEnabled FROM this file, so
// importing back would be a live circular import between the two.
// renderer.getDrawingBufferSize() reads the actual current backbuffer
// (renderer.setPixelRatio/.setSize, applied by settings.js's own
// applyResolution()) without this file needing to know why that size
// is what it is.
const _bufSize = new THREE.Vector2();

let enabled = true;

/* ---------- offscreen target the scene renders into when the
   filter is on ---------- */
let rt = new THREE.WebGLRenderTarget(
  Math.max(1, window.innerWidth),
  Math.max(1, window.innerHeight),
  { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
);

/* ---------- full-screen quad + its own ortho camera, same
   pattern EffectComposer uses internally - kept manual here since
   no addon script is loaded ---------- */
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new THREE.Scene();

/* Light panel + color-mixer + effects values as specified:
     Contrast +20..+35, Highlights -15, Shadows -20, Blacks -10
     Orange/red/yellow: sat +15, hue nudged toward orange (the
       "gold" look)
     Green/aqua/blue/purple: sat -100 (deletes background noise,
       leaves the warm channel as the only thing reading as color)
     Clarity +15, Vignette -20 (darkens edges)
   Lightroom's panel scale is roughly -100..+100 per slider around
   a neutral point; converted below to the multiplicative/additive
   uniforms this shader actually consumes. */
const gradeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uContrast: { value: 1.28 },      // +28 on the 0..100 slider scale
    uHighlights: { value: 0.90 },    // -15, softened - see uPivot note below
    uShadows: { value: 0.92 },       // -20, softened - same reason
    uBlackPoint: { value: 0.03 },    // -10, softened - see uPivot note below
    uPivot: { value: 0.16 },         // contrast/shadow-highlight pivot point
    uSaturation: { value: 1.0 },     // global saturation left neutral - the color-mixer split below does the real work
    uWarmBoost: { value: 1.15 },     // +15 saturation on red/orange/yellow
    uWarmHueShift: { value: 0.03 },  // slight hue nudge toward orange for the warm channel
    uCoolKill: { value: 0.0 },       // -100 saturation on green/aqua/blue/purple - 0.0 = fully desaturated
    uClarity: { value: 0.15 },       // +15
    uVignette: { value: 0.20 },      // -20, edges darkened
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
    uniform vec2 uResolution;
    uniform float uContrast;
    uniform float uHighlights;
    uniform float uShadows;
    uniform float uBlackPoint;
    uniform float uPivot;
    uniform float uSaturation;
    uniform float uWarmBoost;
    uniform float uWarmHueShift;
    uniform float uCoolKill;
    uniform float uClarity;
    uniform float uVignette;
    varying vec2 vUv;

    vec3 gradeCurve(vec3 c){
      // black point: crush near-zero values instead of just
      // multiplying, so the game's already-heavy fog/dark scenes
      // don't wash out to grey. Softened from the original -10
      // spec (uBlackPoint 0.03, not 0.10) - a photo-grade black
      // crush assumes normal exposure; this game's baseline
      // luminance already sits well below a typical photo's, so
      // the full -10 crush was clipping most on-screen pixels to
      // literal 0 (reported as "everything is black").
      c = max(c - uBlackPoint, 0.0) / max(1.0 - uBlackPoint, 0.0001);
      // Contrast/shadows/highlights all pivot on uPivot rather
      // than photo-normal mid-grey (0.5) - this scene's average
      // luminance runs close to uPivot (~0.16), not 0.5, so a
      // 0.5-pivoted contrast stretch was pushing nearly every
      // pixel below the pivot into negative territory, i.e.
      // clamped to black. Pivoting at the scene's actual dark
      // baseline keeps the contrast boost visible without wiping
      // out everything darker than a normally-exposed photo.
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowLift = c * mix(uShadows, 1.0, smoothstep(0.0, uPivot, lum));
      vec3 highlightRolloff = mix(shadowLift, shadowLift * uHighlights, smoothstep(uPivot, 1.0, lum));
      return (highlightRolloff - uPivot) * uContrast + uPivot;
    }

    // ---- HSV helpers for the color-mixer split below ----
    vec3 rgb2hsv(vec3 c){
      vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0*d + e)), d / (q.x + e), q.x);
    }
    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    // Color-mixer split: red/orange/yellow (hue ~0.0-0.17) gets a
    // saturation boost and a slight push toward orange (the "gold"
    // look); green/aqua/blue/purple (hue ~0.25-0.83) gets its
    // saturation pulled toward uCoolKill (0 = fully desaturated,
    // deleting background color noise so only the warm channel
    // reads as color). Smooth hue-band weights instead of a hard
    // cutoff so the transition doesn't band across a gradient sky.
    vec3 selectiveMix(vec3 c){
      vec3 hsv = rgb2hsv(c);
      float warmWeight = 1.0 - smoothstep(0.10, 0.20, min(hsv.x, 1.0 - hsv.x));
      float coolWeight = smoothstep(0.16, 0.30, hsv.x) * (1.0 - smoothstep(0.80, 0.92, hsv.x));

      float sat = hsv.y;
      sat = mix(sat, sat * uWarmBoost, warmWeight);
      sat = mix(sat, sat * uCoolKill, coolWeight);

      float hue = hsv.x + uWarmHueShift * warmWeight * 0.08;

      return hsv2rgb(vec3(hue, clamp(sat, 0.0, 1.0), hsv.z));
    }

    void main(){
      vec2 texel = 1.0 / uResolution;
      vec4 src = texture2D(tDiffuse, vUv);

      // clarity: cheap local-contrast boost via a 4-tap blur used
      // as an unsharp mask - deliberately not a full separable
      // gaussian, this only has to read "a bit grittier", not be a
      // reference-quality sharpen.
      vec3 blur = (
        texture2D(tDiffuse, vUv + vec2( texel.x,  0.0)).rgb +
        texture2D(tDiffuse, vUv + vec2(-texel.x,  0.0)).rgb +
        texture2D(tDiffuse, vUv + vec2( 0.0,  texel.y)).rgb +
        texture2D(tDiffuse, vUv + vec2( 0.0, -texel.y)).rgb
      ) * 0.25;
      vec3 sharpened = src.rgb + (src.rgb - blur) * uClarity;

      vec3 graded = gradeCurve(sharpened);
      graded = selectiveMix(graded);

      // vignette: radial falloff from screen center, darkens the
      // edges to pull focus toward the center of frame.
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

// Defensive: if this shader ever fails to compile/link (typo, driver
// quirk, whatever), silently falling back to the plain render is far
// better than the whole game going black with zero on-screen signal.
// One-time warm-up render + program status check, done off the main
// render path so it can't itself throw into the game loop.
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

/* Called from main.js's debounced resize handler (line ~3625) and
   from applyResolution() indirectly via settingsResScale - the
   render target has to track the same backbuffer size the main
   renderer uses, or the grade pass would sample a stretched/
   letterboxed frame. */
function resizeColorGrade(){
  renderer.getDrawingBufferSize(_bufSize);
  const w = Math.max(1, Math.floor(_bufSize.x));
  const h = Math.max(1, Math.floor(_bufSize.y));
  rt.setSize(w, h);
  gradeMaterial.uniforms.uResolution.value.set(w, h);
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
    // Never let a grading-pass failure blank the game - log it once
    // and permanently fall back to the plain render for the rest of
    // the session rather than retrying (and re-throwing) every frame.
    console.error('[colorGrade] render pass threw, disabling grade pass for this session:', err);
    gradeCompileFailed = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
}

export { renderWithColorGrade, resizeColorGrade, setColorGradeEnabled };
