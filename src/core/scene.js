/* ============================================================
   core/scene.js — THREE.js renderer/scene/camera/clock bootstrap,
   extracted verbatim from the monolith (main.js "THREE SETUP"
   block + the clock declaration from the main-loop section).

   Scope kept deliberately tight to what ARCHITECTURE.md calls
   "scene/camera bootstrap that everything else attaches to":
   the canvas, renderer, scene, camera, and clock. Resolution-
   scaling state (`settingsResScale`, `applyResolution()`) stays in
   main.js for now since it's mutated from the settings-panel code
   that hasn't been extracted yet (Wave 3, systems/settings.js) -
   moving it here first would mean main.js trying to reassign an
   imported binding, which ES modules don't allow (only the owning
   module can reassign its own exported `let`). Revisit once
   systems/settings.js is a real module.

   `THREE` is used here as a global, same as everywhere else in this
   codebase - see the "READ THIS FIRST" note in docs/HANDOFF.md about
   why THREE stays a classic script, not an ES import.
   ============================================================ */

import { $ } from '../utils/dom.js';

const canvas = $('game-canvas');

/* ---------- THREE SETUP ---------- */
const baseDPR = Math.min(window.devicePixelRatio||1, 2);
// MSAA (antialias:true) and a >=2x device pixel ratio both smooth edges by
// oversampling - running both at once is close to double-paying for the
// same thing (real GPU cost, marginal extra smoothness) since the DPR
// upscale alone already does most of the work. Only turn MSAA on when the
// DPR is low enough that supersampling isn't already covering it.
let renderer;
try{
  renderer = new THREE.WebGLRenderer({ canvas, antialias: baseDPR < 1.5, powerPreference:'high-performance' });
}catch(err){
  // WebGL context creation failed - old device, disabled GPU, a browser
  // setting, whatever. Previously this threw straight out of module
  // top-level code, killing every addEventListener/setup call after it
  // in main.js with zero explanation - a player just saw a black screen.
  // This has to be dependency-free (raw DOM, no game systems, no CSS
  // classes from index.html's stylesheet assumed to exist) since it's
  // one of the very first things that runs - nothing else can be
  // trusted to work yet if we're here.
  console.error('WebGL context creation failed:', err);
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#0a0a0c;color:#c9c2b6;'
    +'display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;'
    +'font:16px/1.5 -apple-system,sans-serif;';
  msg.innerHTML = '<div style="max-width:420px;"><div style="font-size:22px;margin-bottom:12px;">'
    +"This device or browser can't run Another Sky</div>"
    +'<div style="opacity:0.7;font-size:14px;">It needs WebGL, which failed to start here - '
    +'try a different browser, update your graphics drivers, or check if hardware acceleration '
    +"is disabled in your browser's settings.</div></div>";
  document.body.appendChild(msg);
  throw err; // still stop module execution - nothing downstream can run without a renderer anyway, but now with an actual explanation on screen first
}
renderer.setPixelRatio(baseDPR);
renderer.setSize(window.innerWidth, window.innerHeight);
// filmic tone mapping - rolls off bright highlights (lamp glow, lightning)
// smoothly instead of clipping them, and gives the toon-shaded mid-tones a
// bit more cinematic contrast without touching any material colors.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const FOG_COLOR = 0x100e14;
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0135); // was 0.0095 - "extreme atmosphere" pass: tighter visibility range, world closes in sooner
renderer.setClearColor(FOG_COLOR);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth/window.innerHeight, 0.1, 900);
camera.rotation.order = 'YXZ';

/* ---------- MAIN LOOP CLOCK ---------- */
const clock = new THREE.Clock();

export { canvas, renderer, baseDPR, scene, FOG_COLOR, camera, clock };
