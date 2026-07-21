// ---------- TITLE SCREEN ----------
// Real module (Wave 3). Extracted from anothersky-horror.html / src/main.js
// per docs/ARCHITECTURE.md. See docs/HANDOFF.md for scope reasoning.
//
// Scope: this file is the self-contained title-screen "entry point" -
// titleScreenActive state, the wake sequence (eyelid anime.js timeline),
// the menu idle-breakdown event, and the void micro-glitch/hover-reaction
// system. It self-registers its own DOM listeners (begin-btn click, idle
// listeners, remember/credits hover) rather than main.js wiring them and
// handing this file a callback - main.js just imports tickMenuIdle to
// call from the render loop, and imports titleScreenActive to read in
// updateTitleCam's gate. This is a deliberate change from how the prior
// (settings.js/menu.js) round in this migration was scoped - those left
// button-wiring in main.js because they touched half a dozen unrelated
// overlays each; this file's own triggers (begin-btn, idle timers, hover)
// are genuinely its own concern, so it owns its own wiring.
//
// Real, currently-unavoidable ties back to main.js: radioPickupMesh /
// RADIO_PICKUP_POS / RADIO_FLOAT_HEIGHT (the pickup mesh main.js builds
// and owns), playWakeDialogue() (the post-wake dialogue trigger), and
// stopMenuAmbience() (menu.js's procedural audio bed, still main.js-
// local). None of those are title-screen concerns themselves - they're
// radio/dialogue/ambience concerns that haven't been pulled into their
// own modules yet.
//
// HOTFIX #5 (see docs/HANDOFF.md): these used to come in via a *static*
// `import {...} from '../main.js'` here, forming a real circular import
// (main.js imports tickMenuIdle/setTitleScreenActive from this file;
// this file imported back from main.js). Under plain browser ESM that
// resolves fine because dependency evaluation completes depth-first
// before either module's own top-level code runs - but under a dev
// server that instruments/wraps modules for HMR (Vite and similar),
// circular ESM cycles commonly do NOT get the same guarantee, and the
// cycle became a *permanent* TDZ instead of a same-frame quirk: every
// single call to tickMenuIdle() threw `Cannot access '<binding>' before
// initialization`, every frame, forever (HOTFIX #2-4 kept patching the
// symptom one binding at a time, then wrapping the whole function in
// try/catch - which "fixed" the crash but meant a real exception was
// being thrown and swallowed 60x/sec, which is exactly why the game
// became unplayably laggy instead of merely broken). The actual fix is
// below: this file no longer has ANY static import from main.js, so
// main.js -> titleScreen.js is one-way and the cycle is gone entirely.
// main.js instead calls registerMainRefs(...) once, after these values
// exist, to hand them in explicitly.
//
// DOM refs (titleScreen/titleFrame/titleGrain/hud/eyelids) are resolved
// locally via getElementById rather than imported - main.js's own copies
// aren't exported bindings, and main.js still uses them extensively for
// unrelated wiring (menu button listeners, credits, etc. - out of scope
// for this pull). Same reasoning safehouse.js used for vignetteEl.

import { state, EYE_HEIGHT } from '../core/state.js';
import { clock, scene, camera } from '../core/scene.js';
import { getAudioCtx, initAudio } from '../systems/audio.js';
import { userVolume } from '../systems/settings.js';
import { SAFEHOUSE_DOOR_YAW } from '../world/safehouse.js';
import { groundHeightAt, terrainHeight } from '../world/terrain.js';
import { updateWorldStream } from '../world/streaming.js';

// See HOTFIX #5 above: these come in via registerMainRefs(), called once
// from main.js after the real values exist, instead of a static import
// back into main.js. getRadioPickupMesh is a function (not a plain value)
// because radioPickupMesh is reassigned repeatedly over the life of the
// game (built once, nulled on pickup, etc.) - a snapshot taken at
// registration time would go stale, so we call through to main.js's
// current value each time instead.
let getRadioPickupMesh = () => null;
let _RADIO_PICKUP_POS = null;
let _RADIO_FLOAT_HEIGHT = 0;
let _playWakeDialogue = () => {};
let _stopMenuAmbience = () => {};
// Radio tower refs, for the idle-title-screen camera/pulse logic below -
// same reasoning as getRadioPickupMesh above for why the beacon light/
// rings come in as a getter (built once but this file shouldn't assume
// WHEN relative to its own top-level code) rather than importing straight
// from main.js (that's the exact cycle HOTFIX #5 removed - see the top of
// this file). RADIO_TOWER_POS/radioTowerHeight are plain values since
// they're set once at tower-build time and never reassigned after.
let _RADIO_TOWER_POS = { x:0, z:0 };
let _radioTowerHeight = 58;
let getRadioTowerBeaconLight = () => null;
let getRadioTowerPulseRings = () => null;
let _updateRadioTowerBeacon = () => {};
export function registerMainRefs(refs){
  getRadioPickupMesh = refs.getRadioPickupMesh;
  _RADIO_PICKUP_POS = refs.RADIO_PICKUP_POS;
  _RADIO_FLOAT_HEIGHT = refs.RADIO_FLOAT_HEIGHT;
  _playWakeDialogue = refs.playWakeDialogue;
  _stopMenuAmbience = refs.stopMenuAmbience;
  if(refs.RADIO_TOWER_POS) _RADIO_TOWER_POS = refs.RADIO_TOWER_POS;
  if(refs.radioTowerHeight) _radioTowerHeight = refs.radioTowerHeight;
  if(refs.getRadioTowerBeaconLight) getRadioTowerBeaconLight = refs.getRadioTowerBeaconLight;
  if(refs.getRadioTowerPulseRings) getRadioTowerPulseRings = refs.getRadioTowerPulseRings;
  if(refs.updateRadioTowerBeacon) _updateRadioTowerBeacon = refs.updateRadioTowerBeacon;
}

const $ = id => document.getElementById(id);
const titleScreen = $('title-screen');
const titleFrame = $('title-frame');
const titleGrain = $('title-grain');
const hud = $('hud');

// titleScreenActive lives on `state` (core/state.js), not as a bare `let`
// export from this file - see the comment on state.titleScreenActive for
// why (this file's real, currently-unavoidable circular import back to
// main.js made a `let` export's live binding fragile; plain state-object
// property reads have no TDZ regardless of which module in the cycle
// evaluates first).
export function setTitleScreenActive(v){ state.titleScreenActive = v; }

/* ---------- MENU BREAKDOWN (idle glitch event) ----------
   If the player just sits at the main menu doing nothing for a while, the
   void behind the logo stops being a contained smudge and floods out to
   fill the whole screen - full chromatic glitch - then collapses back to
   its normal resting size, with a rising cosmic-horror sound underneath.
   Purely an idle-menu thing: doesn't fire mid-synopsis/setup, and stops
   tracking entirely once the title screen is gone. */
const MENU_IDLE_BREAKDOWN = 60; // seconds of no input before it fires
// Wall-clock based rather than dt-accumulated on purpose: main.js's
// animate() clamps dt to a max of 0.05s/frame (const dt =
// Math.min(clock.getDelta(), 0.05)) to keep physics stable during lag
// spikes - but that also means a struggling device (dropping well below
// 20fps) was accumulating far less than 1 real second of "timer time" per
// real second elapsed, so 60 real seconds of sitting idle on a laggy
// device could accumulate as little as 10s on the old dt-based timer -
// requiring several real minutes of waiting instead of one. Tracking an
// actual timestamp and diffing against performance.now() makes this
// correct regardless of frame rate.
let menuIdleSince = null, menuBreakdownActive = false;
function resetMenuIdle(){ menuIdleSince = performance.now(); }
['pointerdown','pointermove','keydown','wheel','touchstart'].forEach(evt=>{
  if(titleScreen) titleScreen.addEventListener(evt, resetMenuIdle, { passive:true });
});
function isMainMenuIdleEligible(){
  // Defensive - see docs/HANDOFF.md HOTFIX #2 and HOTFIX #3. In normal
  // browser load order this is always initialized by the time animate()
  // calls into this (deferred module scripts run after DOM parsing), but
  // fail soft instead of throwing if that guarantee is ever violated.
  //
  // HOTFIX #3: the `if(!titleScreen)` check above (HOTFIX #2) only guards
  // against `titleScreen` being null (element missing from the DOM) - it
  // does NOT guard against a module load-order race (this file's
  // circular import with main.js, see file header) where `titleScreen`
  // itself hasn't been initialized yet, because reading a not-yet-
  // initialized `const`/`let` throws a TDZ ReferenceError on the read
  // itself, before `!` or `if` ever get to evaluate anything. A
  // truthiness check can't fail soft against that - only try/catch can.
  try {
    // only while the actual button menu is up - not mid-synopsis/setup,
    // and not after the title screen has already started fading for
    // gameplay
    return !!titleScreen
        && titleScreen.classList.contains('show-menu')
        && !titleScreen.classList.contains('show-setup')
        && titleScreen.style.display !== 'none'
        && !menuBreakdownActive;
  } catch (e) {
    return false;
  }
}
export function tickMenuIdle(){
  // HOTFIX #4: HOTFIX #3 wrapped isMainMenuIdleEligible()'s own body in
  // try/catch, but tickMenuIdle() reads/writes menuIdleSince (also
  // module-scope, also exposed to the same load-order race, see file
  // header + HOTFIX #3 comment above) directly, outside that try/catch -
  // so the exact same TDZ crash just resurfaced one binding over,
  // `Cannot access 'menuIdleSince' before initialization`, same call
  // path. Patching each module-scope binding this function touches one
  // at a time is a losing game - anything read in this call path is
  // exposed to the same race. Wrapping the whole per-frame entry point
  // (the only thing animate() actually calls into here) is the fix that
  // covers all of them, present and future, at once: any TDZ read
  // anywhere below just skips this one frame instead of taking down the
  // render loop.
  try {
    if(!isMainMenuIdleEligible()){ menuIdleSince = null; return; }
    if(menuIdleSince === null){ menuIdleSince = performance.now(); return; } // first eligible frame - start the clock now, not from page load
    if(performance.now() - menuIdleSince >= MENU_IDLE_BREAKDOWN*1000){
      menuIdleSince = null;
      triggerMenuBreakdown();
    }
  } catch (e) {
    // fail soft - see comment above. Should no longer fire in practice
    // now that the circular import (HOTFIX #5) is gone; kept as a safety
    // net, not a fix in itself.
  }
}
function triggerMenuBreakdown(){
  if(menuBreakdownActive) return;
  menuBreakdownActive = true;
  titleScreen.classList.add('breakdown-active');
  playSpaceBreakdownSound();
  setTimeout(()=>{
    titleScreen.classList.remove('breakdown-active');
    menuBreakdownActive = false;
  }, 4200); // grow+glitch+collapse cycle - matches the CSS transition durations
}
// scary space sound - a deep rising sub sweep, a harsh gated/stuttering
// distorted layer, and a rising-then-falling detuned "wail", all inside
// the same ~4.2s window as the visual. Same synthesis approach as the rest
// of the game's procedural audio (oscillators + filters + envelopes, no
// samples), just built specifically for this one cue.
function distortionCurve(amount){
  const n = 256, curve = new Float32Array(n);
  for(let i=0;i<n;i++){
    const x = i*2/n - 1;
    curve[i] = (3+amount)*x*20*(Math.PI/180) / (Math.PI + amount*Math.abs(x));
  }
  return curve;
}
function playSpaceBreakdownSound(){
  const audioCtx = getAudioCtx();
  if(!audioCtx || state.muted) return;
  if(audioCtx.state === 'suspended') audioCtx.resume();
  const t = audioCtx.currentTime, total = 4.2;
  const out = audioCtx.createGain(); out.gain.value = userVolume*0.55;
  out.connect(audioCtx.destination);

  // deep rising sub sweep - the "something enormous waking up" layer
  const sub = audioCtx.createOscillator(); sub.type='sine';
  sub.frequency.setValueAtTime(30, t);
  sub.frequency.linearRampToValueAtTime(70, t+total*0.6);
  sub.frequency.linearRampToValueAtTime(24, t+total);
  const subGain = audioCtx.createGain(); subGain.gain.setValueAtTime(0,t);
  subGain.gain.linearRampToValueAtTime(0.7, t+total*0.5);
  subGain.gain.linearRampToValueAtTime(0, t+total);
  sub.connect(subGain); subGain.connect(out);
  sub.start(t); sub.stop(t+total+0.1);

  // harsh stuttering distorted layer - the "signal breaking apart" texture,
  // gated by a fast square LFO so it chops instead of sustaining cleanly
  const stutterOsc = audioCtx.createOscillator(); stutterOsc.type='sawtooth'; stutterOsc.frequency.value=110;
  const shaper = audioCtx.createWaveShaper(); shaper.curve = distortionCurve(60); shaper.oversample='4x';
  const stutterLfo = audioCtx.createOscillator(); stutterLfo.type='square'; stutterLfo.frequency.value=14;
  const stutterLfoGain = audioCtx.createGain(); stutterLfoGain.gain.value=0.5;
  const stutterGain = audioCtx.createGain(); stutterGain.gain.value=0.18;
  stutterLfo.connect(stutterLfoGain); stutterLfoGain.connect(stutterGain.gain);
  const stutterFilt = audioCtx.createBiquadFilter(); stutterFilt.type='bandpass'; stutterFilt.frequency.value=700; stutterFilt.Q.value=1.2;
  stutterOsc.connect(shaper); shaper.connect(stutterFilt); stutterFilt.connect(stutterGain); stutterGain.connect(out);
  stutterOsc.start(t); stutterLfo.start(t);
  stutterOsc.stop(t+total); stutterLfo.stop(t+total);

  // rising-then-falling detuned wail - the "cosmic scream" peak, timed to
  // land right as the void fills the screen
  const wail = audioCtx.createOscillator(); wail.type='sawtooth';
  wail.frequency.setValueAtTime(180, t+total*0.15);
  wail.frequency.exponentialRampToValueAtTime(520, t+total*0.55);
  wail.frequency.exponentialRampToValueAtTime(90, t+total*0.95);
  const wailVibrato = audioCtx.createOscillator(); wailVibrato.type='sine'; wailVibrato.frequency.value=7;
  const wailVibratoGain = audioCtx.createGain(); wailVibratoGain.gain.value=18;
  wailVibrato.connect(wailVibratoGain); wailVibratoGain.connect(wail.frequency);
  const wailFilt = audioCtx.createBiquadFilter(); wailFilt.type='bandpass'; wailFilt.frequency.value=900; wailFilt.Q.value=2.5;
  const wailGain = audioCtx.createGain(); wailGain.gain.setValueAtTime(0, t);
  wailGain.gain.linearRampToValueAtTime(0.28, t+total*0.55);
  wailGain.gain.linearRampToValueAtTime(0, t+total);
  wail.connect(wailFilt); wailFilt.connect(wailGain); wailGain.connect(out);
  wail.start(t+total*0.1); wailVibrato.start(t);
  wail.stop(t+total+0.1); wailVibrato.stop(t+total+0.1);

  setTimeout(()=>{ try{ out.disconnect(); }catch(e){} }, (total+0.3)*1000);
}

/* ---------- VOID AS A LIVING THING ----------
   Rare short micro-glitches independent of the full 60s idle-breakdown
   event, plus a subtle reaction to which menu button is currently under
   the cursor/focus - "Remember" (the one with weight) makes it swell and
   brighten slightly; "Credits" calms it. Both purely additive over the
   existing void CSS/animation. */
function scheduleVoidMicroGlitch(){
  setTimeout(()=>{
    const voidEl = $('title-void');
    if(voidEl && titleScreen.style.display!=='none' && !menuBreakdownActive){
      voidEl.classList.remove('void-micro'); void voidEl.offsetWidth;
      voidEl.classList.add('void-micro');
    }
    scheduleVoidMicroGlitch();
  }, (9+Math.random()*14)*1000);
}
scheduleVoidMicroGlitch();
const rememberBtn = $('menu-remember'), creditsBtn = $('menu-credits');
if(rememberBtn){
  rememberBtn.addEventListener('pointerenter', ()=> titleScreen.classList.add('void-react-remember'));
  rememberBtn.addEventListener('pointerleave', ()=> titleScreen.classList.remove('void-react-remember'));
  rememberBtn.addEventListener('focus', ()=> titleScreen.classList.add('void-react-remember'));
  rememberBtn.addEventListener('blur', ()=> titleScreen.classList.remove('void-react-remember'));
}
if(creditsBtn){
  creditsBtn.addEventListener('pointerenter', ()=> titleScreen.classList.add('void-react-calm'));
  creditsBtn.addEventListener('pointerleave', ()=> titleScreen.classList.remove('void-react-calm'));
  creditsBtn.addEventListener('focus', ()=> titleScreen.classList.add('void-react-calm'));
  creditsBtn.addEventListener('blur', ()=> titleScreen.classList.remove('void-react-calm'));
}

/* ---------- START (wake sequence) ---------- */
// a slow descending tone under the fade-out - the sensation of the menu's
// own sound falling away rather than just cutting, timed to land under
// the first eyelid flutters. Separate from stopMenuAmbience's own fade.
function playWakeFallSound(){
  const audioCtx = getAudioCtx();
  if(!audioCtx || state.muted) return;
  const t = audioCtx.currentTime, dur = 2.6;
  const osc = audioCtx.createOscillator(); osc.type='sine';
  osc.frequency.setValueAtTime(340, t);
  osc.frequency.exponentialRampToValueAtTime(48, t+dur);
  const filt = audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.setValueAtTime(1200,t);
  filt.frequency.exponentialRampToValueAtTime(120, t+dur);
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(userVolume*0.18, t+0.3);
  g.gain.linearRampToValueAtTime(0, t+dur);
  osc.connect(filt); filt.connect(g); g.connect(audioCtx.destination);
  osc.start(t); osc.stop(t+dur+0.1);
}

$('begin-btn').addEventListener('click', ()=>{
  const btn = $('begin-btn');
  btn.disabled = true;
  _stopMenuAmbience();
  initAudio(userVolume);
  { const ac = getAudioCtx(); if(ac && ac.state==='suspended') ac.resume(); }
  playWakeFallSound();
  state.yaw = SAFEHOUSE_DOOR_YAW; // wake up facing the doorway, not wherever the idle title orbit happened to be looking

  // fade the title UI first, then open the eyes onto the already-waiting scene
  titleScreen.style.transition = 'opacity .7s ease';
  titleScreen.style.opacity = '0';

  const eyelids = document.getElementById('eyelids');

  // waking after four years doesn't happen in one clean motion - the eyes
  // flutter a few times first, each one letting in a little more of the
  // scene (and a little more dread) before they finally give up and stay
  // open. Partial-opens use a smaller travel distance than the final one.
  // (Previously set an eager "game has begun" flag here, before the
  // multi-second eyelid animation even played, so the menu hub was
  // reachable mid-animation. That flag - and the extra state it required
  // keeping in sync - turned out to be the actual bug: openHub()
  // now just checks whether the HUD is visible, so the menu becomes
  // reachable the moment hud.classList.add('visible') actually runs
  // below/in the catch fallback, with nothing separate to forget to set.)
  let timeline;
  try{
    timeline = anime.timeline({ easing:'easeInOutQuad' });
  }catch(err){
    console.error('anime.js timeline failed to start; falling back to an instant wake', err);
    hud.classList.add('visible');
    state.started = true;
    setTitleScreenActive(false);
    eyelids.style.display = 'none';
    titleScreen.style.display = 'none';
    titleFrame.style.display = 'none';
    titleGrain.style.display = 'none';
    const titleMenuElFallback = $('title-menu');
    if(titleMenuElFallback) titleMenuElFallback.style.display = 'none';
    clock.getDelta();
    return;
  }
  timeline
    .add({ targets:'.eyelid', duration:160 }) // a beat held shut - still under
    // flutter 1: barely cracks open, snaps shut - too bright, too wrong
    .add({
      targets:'.eyelid-top', translateY:['0%','-14%','0%'],
      duration:260, easing:'easeOutQuad'
    }, '+=180')
    .add({
      targets:'.eyelid-bottom', translateY:['0%','14%','0%'],
      duration:260, easing:'easeOutQuad'
    }, '-=260')
    // flutter 2: a little further this time, held a beat longer
    .add({
      targets:'.eyelid-top', translateY:['0%','-26%','0%'],
      duration:320, easing:'easeOutQuad'
    }, '+=340')
    .add({
      targets:'.eyelid-bottom', translateY:['0%','26%','0%'],
      duration:320, easing:'easeOutQuad'
    }, '-=320')
    // flutter 3: nearly all the way, a small stutter mid-motion (glitch-blink)
    .add({
      targets:'.eyelid-top', translateY:['0%','-55%','-48%','-60%','0%'],
      duration:420, easing:'linear'
    }, '+=260')
    .add({
      targets:'.eyelid-bottom', translateY:['0%','55%','48%','60%','0%'],
      duration:420, easing:'linear'
    }, '-=420')
    // final open - commits, doesn't come back down
    .add({
      targets:'.eyelid-top', translateY:['0%','-4%','-100%'],
      duration:900,
      easing:'cubicBezier(.55,.06,.68,.19)'
    }, '+=380')
    .add({
      targets:'.eyelid-bottom', translateY:['0%','4%','100%'],
      duration:900,
      easing:'cubicBezier(.55,.06,.68,.19)'
    }, '-=900')
    .finished.then(()=>{
      eyelids.style.display='none';
      titleScreen.style.display='none';
      titleFrame.style.display='none';
      titleGrain.style.display='none';
      const titleMenuEl = $('title-menu');
      if(titleMenuEl) titleMenuEl.style.display='none'; // fixed-position overlay - hide explicitly, don't rely only on ancestor display:none
      hud.classList.add('visible');
      state.started=true;
      setTitleScreenActive(false);
      clock.getDelta();
      // now that state.yaw reflects the real look direction, put the radio
      // a few meters behind the player (opposite the initial look
      // direction, with a little spread so it's not dead-center) instead
      // of wherever the parse-time placeholder angle happened to land -
      // player wakes up facing away from it and has to turn to find it,
      // rather than it being the first thing in view.
      if(getRadioPickupMesh()){
        const ang = state.yaw + Math.PI + (Math.random()*0.5 - 0.25);
        const dist = 3.2 + Math.random()*1.2;
        _RADIO_PICKUP_POS.x = state.playerX - Math.sin(ang)*dist;
        _RADIO_PICKUP_POS.z = state.playerZ - Math.cos(ang)*dist;
        const ry = groundHeightAt(_RADIO_PICKUP_POS.x, _RADIO_PICKUP_POS.z) + _RADIO_FLOAT_HEIGHT;
        getRadioPickupMesh().position.set(_RADIO_PICKUP_POS.x, ry, _RADIO_PICKUP_POS.z);
      }
      _playWakeDialogue();
    });
});

/* ---------- IDLE TITLE-SCREEN 3D SCENE ----------
   The camera framing, radio pulse rings, and world-streaming that make
   the title screen actually show something behind the DOM overlay above
   (see index.html's #title-screen comment: "the 3D scene is already
   rendering behind this the whole time"). This used to live inline in
   main.js's animate() loop - technically working, but title-screen
   presentation is this file's whole reason to exist, not main.js's, and
   main.js's animate() is already a few thousand lines it doesn't need
   more of. Moved here now that core/scene.js confirmed safe to import
   directly (no dependency on main.js - see the module-level comment
   block at the top of this file on why that check specifically matters
   before importing anything back toward main.js's side of the graph).
   The tower's actual mesh/light/ring objects still get BUILT in main.js
   (that's genuinely still main.js's scope - scene construction, not
   title-screen presentation), reaching this file through
   registerMainRefs() same as the radio pickup mesh above. */

let titleCamYaw = Math.PI * 0.15;
// Pulled back from an early version that orbited tight (radius 2.2)
// right at the tower's own base - standing under a 58-unit lattice tower
// looking mostly straight up doesn't show a silhouette, it shows dark
// steel filling the frame, which is why the title screen was reading as
// flat black in practice even before the world-streaming gap (below) was
// found and fixed. A real establishing distance, a slow BOUNDED arc-sway
// (not a full 360 spin, so the tower/beacon never swings out of frame
// for half the loop) plus a small sine/cosine bob standing in for
// handheld camera motion - a completely still shot reads as a stock
// photo, a slight sway reads as someone actually standing there.
function updateTitleCam(dt){
  titleCamYaw += dt*0.05;
  const bearing = Math.PI*0.15 + Math.sin(titleCamYaw*0.18)*0.5;
  const orbitR = 32;
  const cx = Math.sin(bearing)*orbitR, cz = Math.cos(bearing)*orbitR;
  const y = terrainHeight(cx, cz);
  const bob = Math.sin(titleCamYaw*0.9)*0.05 + Math.cos(titleCamYaw*0.55)*0.035;
  camera.position.set(cx, y + EYE_HEIGHT + 1.1 + bob, cz);
  const lookTarget = {
    x: _RADIO_TOWER_POS.x + Math.sin(titleCamYaw*0.7)*0.4,
    y: _radioTowerHeight*0.5,
    z: _RADIO_TOWER_POS.z
  };
  camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
}

// Radio pulse rings: expanding "ping" rings pooled/built once in main.js
// at the beacon (see registerMainRefs above), only actually animated
// here during the idle title screen. Explicitly zeroes out and returns
// once titleScreenActive goes false, rather than just not being called
// anymore, so a ring mid-fade when the player hits "Remember" doesn't
// hang there frozen at whatever opacity/scale it last had.
let titlePulseClock = 0;
const PULSE_PERIOD = 2.6, PULSE_MAX_R = 22, PULSE_RING_COUNT = 3;
function updateTitlePulseRings(dt, active){
  const rings = getRadioTowerPulseRings();
  if(!rings) return;
  if(!active){
    if(titlePulseClock !== 0){
      titlePulseClock = 0;
      rings.forEach(r=>{ r.visible = false; r.material.opacity = 0; });
    }
    return;
  }
  titlePulseClock += dt;
  rings.forEach((ring, i)=>{
    const phase = ((titlePulseClock/PULSE_PERIOD) + i/PULSE_RING_COUNT) % 1;
    const r = 0.6 + phase*PULSE_MAX_R;
    ring.visible = true;
    ring.scale.setScalar(r);
    ring.material.opacity = (1-phase) * 0.4;
  });
}

// Single per-frame entry point main.js's animate() calls during its idle
// (!state.started) branch, replacing the three separate inline calls
// that used to sit there. World streaming keeps running even if the
// player's paused at the bigmap or hit an ending (titleScreenActive is
// false in both those cases too, same as before this move) - only the
// camera/beacon/rings are actually gated to the title screen itself.
export function updateTitleScene(dt){
  updateWorldStream();
  const active = state.titleScreenActive;
  if(active){
    updateTitleCam(dt);
    _updateRadioTowerBeacon();
  }
  updateTitlePulseRings(dt, active);
}