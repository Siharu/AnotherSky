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
// own modules yet - so this is a live circular import (main.js imports
// titleScreenActive/tickMenuIdle from here; this file imports those three
// back from main.js), same shape sky/weather.js and safehouse.js already
// use for the same reason. Revisit when radio/dialogue/menu-ambience get
// their own modules - at that point this import should point there
// instead of at main.js.
//
// DOM refs (titleScreen/titleFrame/titleGrain/hud/eyelids) are resolved
// locally via getElementById rather than imported - main.js's own copies
// aren't exported bindings, and main.js still uses them extensively for
// unrelated wiring (menu button listeners, credits, etc. - out of scope
// for this pull). Same reasoning safehouse.js used for vignetteEl.

import { state } from '../core/state.js';
import { clock } from '../core/scene.js';
import { getAudioCtx, initAudio } from '../systems/audio.js';
import { userVolume } from '../systems/settings.js';
import { SAFEHOUSE_DOOR_YAW } from '../world/safehouse.js';
import { groundHeightAt } from '../world/terrain.js';
import {
  radioPickupMesh, RADIO_PICKUP_POS, RADIO_FLOAT_HEIGHT,
  playWakeDialogue, stopMenuAmbience
} from '../main.js';

const $ = id => document.getElementById(id);
const titleScreen = $('title-screen');
const titleFrame = $('title-frame');
const titleGrain = $('title-grain');
const hud = $('hud');

export let titleScreenActive = true;
export function setTitleScreenActive(v){ titleScreenActive = v; }

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
  titleScreen.addEventListener(evt, resetMenuIdle, { passive:true });
});
function isMainMenuIdleEligible(){
  // only while the actual button menu is up - not mid-synopsis/setup, and
  // not after the title screen has already started fading for gameplay
  return titleScreen.classList.contains('show-menu')
      && !titleScreen.classList.contains('show-setup')
      && titleScreen.style.display !== 'none'
      && !menuBreakdownActive;
}
export function tickMenuIdle(){
  if(!isMainMenuIdleEligible()){ menuIdleSince = null; return; }
  if(menuIdleSince === null){ menuIdleSince = performance.now(); return; } // first eligible frame - start the clock now, not from page load
  if(performance.now() - menuIdleSince >= MENU_IDLE_BREAKDOWN*1000){
    menuIdleSince = null;
    triggerMenuBreakdown();
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
  stopMenuAmbience();
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
  // multi-second eyelid animation even played, so the pause menu was
  // reachable mid-animation. That flag - and the extra state it required
  // keeping in sync - turned out to be the actual bug: openPauseMenu()
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
      if(radioPickupMesh){
        const ang = state.yaw + Math.PI + (Math.random()*0.5 - 0.25);
        const dist = 3.2 + Math.random()*1.2;
        RADIO_PICKUP_POS.x = state.playerX - Math.sin(ang)*dist;
        RADIO_PICKUP_POS.z = state.playerZ - Math.cos(ang)*dist;
        const ry = groundHeightAt(RADIO_PICKUP_POS.x, RADIO_PICKUP_POS.z) + RADIO_FLOAT_HEIGHT;
        radioPickupMesh.position.set(RADIO_PICKUP_POS.x, ry, RADIO_PICKUP_POS.z);
      }
      playWakeDialogue();
    });
});
