// ---------- SETTINGS ----------
// Real module (Wave 3). Extracted from anothersky-horror.html / src/main.js
// per docs/ARCHITECTURE.md's migration map. See docs/HANDOFF.md for the
// reasoning behind the scope decisions below.
//
// Scope decision (deliberate, not incidental):
// This module owns ALL settings state (sens/vol/bright/res), persistence,
// the DOM refs + listeners for the settings overlay's sliders, and
// closeSettingsOverlay() - all one cohesive UI+state unit. applyResolution()
// is folded in here too rather than split into render/renderer.js: once
// renderer/scene/camera/baseDPR moved to core/scene.js (Wave 2),
// applyResolution() had nothing left besides "read settingsResScale, call
// renderer.setPixelRatio/setSize" - not enough to justify a real module of
// its own, and splitting it out would have meant a live circular import
// for zero benefit. render/renderer.js stays a documented stub that
// re-exports this file's applyResolution (see that file).
//
// pauseOverlay (menu.js-owned) is imported here for closeSettingsOverlay's
// "return to pause if opened from pause" behavior. This turned out to be
// one-directional, not circular like sky/weather.js's or safehouse.js's
// import shapes: menu.js's own scope stayed narrow enough (see that
// file's header comment) that it never needed to import anything back
// from settings.js.

import { renderer, baseDPR } from '../core/scene.js';
import { state } from '../core/state.js';
import { getMasterGain } from './audio.js';
import { deleteSave } from './save.js';
import { pauseOverlay } from '../ui/menu.js';

const $ = id => document.getElementById(id);

const SETTINGS_KEY = 'anothersky_settings_v1';

// Sensitivity/volume/brightness/resolution persist separately from the
// main save slot (see systems/save.js) - "Delete Memories" shouldn't also
// reset how you've tuned the controls.
export let userVolume = 0.55; // 0..1, remembered while muted so unmuting restores it instead of snapping to full
export let settingsSensMult = 1;
export let settingsBrightness = 1;
export let settingsResScale = 1;
export let settingsInvertY = false;
export let settingsVibration = true;

export function applyResolution(){
  renderer.setPixelRatio(baseDPR * settingsResScale);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

(function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if(raw){
      const s = JSON.parse(raw);
      if(typeof s.sens === 'number') settingsSensMult = s.sens;
      if(typeof s.vol === 'number') userVolume = s.vol;
      if(typeof s.bright === 'number') settingsBrightness = s.bright;
      if(typeof s.res === 'number') settingsResScale = s.res;
      if(typeof s.invertY === 'boolean') settingsInvertY = s.invertY;
      if(typeof s.vibration === 'boolean') settingsVibration = s.vibration;
      if(typeof s.muted === 'boolean') state.muted = s.muted;
    }
  }catch(e){}
  applyResolution();
})();

export function saveSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    sens:settingsSensMult, vol:userVolume, bright:settingsBrightness, res:settingsResScale,
    invertY:settingsInvertY, vibration:settingsVibration, muted:state.muted
  })); }catch(e){}
}

function applyBrightness(){
  const gc = document.getElementById('game-canvas');
  if(gc) gc.style.filter = `brightness(${settingsBrightness})`;
}

export const settingsOverlay = $('settings-overlay');
const settingsSens = $('settings-sens');
const settingsSensVal = $('settings-sens-val');
const settingsVol = $('settings-vol');
const settingsVolVal = $('settings-vol-val');

// Drives the blood-fill track, the rotary-knob thumb angle, and the
// drip-when-maxed state for any of these styled range inputs. Knob sweeps
// -120deg (min) to +120deg (max), a normal rotary-pot range, not a full
// 360 - reads as "turned up" rather than spinning in a circle.
function updateSliderVisual(input){
  const min = Number(input.min), max = Number(input.max), val = Number(input.value);
  const pct = ((val-min)/(max-min))*100;
  const angle = -120 + (pct/100)*240;
  input.style.setProperty('--fill', pct+'%');
  input.style.setProperty('--angle', angle+'deg');
  const wrap = input.closest('.slider-wrap');
  if(wrap){
    wrap.classList.toggle('full', pct>=99);
    const drip = wrap.querySelector('.slider-drip');
    if(drip) drip.style.left = pct+'%';
  }
}

const settingsBright = $('settings-bright');
const settingsBrightVal = $('settings-bright-val');
settingsSens.value = Math.round(settingsSensMult*100);
settingsSensVal.textContent = Math.round(settingsSensMult*100) + '%';
settingsVol.value = Math.round(userVolume*100);
settingsVolVal.textContent = Math.round(userVolume*100) + '%';
settingsBright.value = Math.round(settingsBrightness*100);
settingsBrightVal.textContent = Math.round(settingsBrightness*100) + '%';
updateSliderVisual(settingsSens);
updateSliderVisual(settingsVol);
updateSliderVisual(settingsBright);
applyBrightness();

const settingsRes = $('settings-res');
settingsRes.value = String(settingsResScale);
settingsRes.addEventListener('change', ()=>{
  settingsResScale = parseFloat(settingsRes.value);
  applyResolution();
  saveSettings();
});
settingsSens.addEventListener('input', ()=>{
  settingsSensMult = settingsSens.value/100;
  settingsSensVal.textContent = settingsSens.value + '%';
  updateSliderVisual(settingsSens);
  saveSettings();
});
settingsVol.addEventListener('input', ()=>{
  userVolume = settingsVol.value/100;
  settingsVolVal.textContent = settingsVol.value + '%';
  { const mg = getMasterGain(); if(mg && !state.muted) mg.gain.value = userVolume; }
  updateSliderVisual(settingsVol);
  saveSettings();
});
settingsBright.addEventListener('input', ()=>{
  settingsBrightness = settingsBright.value/100;
  settingsBrightVal.textContent = settingsBright.value + '%';
  updateSliderVisual(settingsBright);
  applyBrightness();
  saveSettings();
});

// ---------- MUTE / INVERT-Y / VIBRATION ----------
// All three read from state that already exists and is already checked
// elsewhere in the codebase (state.muted was read in several places but
// never actually settable by the player - this closes that gap rather
// than introducing new state). settingsInvertY/settingsVibration are
// brand new - see main.js's setYawPitch() and the vibrate() call sites
// for where they're actually applied.
const settingsMute = $('settings-mute');
const settingsInvertYEl = $('settings-invert-y');
const settingsVibrationEl = $('settings-vibration');
settingsMute.checked = state.muted;
settingsInvertYEl.checked = settingsInvertY;
settingsVibrationEl.checked = settingsVibration;
settingsMute.addEventListener('change', ()=>{
  state.muted = settingsMute.checked;
  const mg = getMasterGain();
  if(mg) mg.gain.value = state.muted ? 0 : userVolume;
  saveSettings();
});
settingsInvertYEl.addEventListener('change', ()=>{
  settingsInvertY = settingsInvertYEl.checked;
  saveSettings();
});
settingsVibrationEl.addEventListener('change', ()=>{
  settingsVibration = settingsVibrationEl.checked;
  saveSettings();
});

// ---------- FULLSCREEN ----------
// Deliberately not persisted - the Fullscreen API requires a fresh user
// gesture every time (can't auto-re-enter on page load even if it was on
// last session), so there's nothing meaningful to restore from a saved
// setting. Button label just tracks live browser state instead.
const settingsFullscreen = $('settings-fullscreen');
function updateFullscreenLabel(){
  settingsFullscreen.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
}
settingsFullscreen.addEventListener('click', ()=>{
  if(document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(()=>{}); // some browsers/contexts (e.g. iframes without allow="fullscreen") reject this - failing silently just leaves the button as "Enter Fullscreen", not a broken state
});
document.addEventListener('fullscreenchange', updateFullscreenLabel);
updateFullscreenLabel();

// Settings can be opened from the title menu OR from inside the in-game
// pause menu. Opening it from pause used to just layer settings on top
// without hiding the pause panel underneath - both overlays stayed
// 'open' at once, so the torn-paper pause panel (different width, its
// own dim backdrop) kept showing around/behind the settings panel like a
// second, dimmer menu. This flag remembers which door we came in through
// so closing settings puts us back where we were instead of leaving
// pause silently still open behind it.
export let settingsOpenedFromPause = false;
export function setSettingsOpenedFromPause(v){ settingsOpenedFromPause = v; }

export function closeSettingsOverlay(){
  settingsOverlay.classList.remove('open');
  if(settingsOpenedFromPause){
    settingsOpenedFromPause = false;
    pauseOverlay.classList.add('open');
  }
}
$('settings-close').addEventListener('click', closeSettingsOverlay);
$('settings-delete-save').addEventListener('click', ()=>{
  if(confirm('Delete all saved progress? This cannot be undone.')){
    deleteSave();
    // Deleting storage alone wasn't enough: the periodic autosave loop
    // (and pickup-triggered autosaves) keep running for the rest of this
    // session regardless, and the very next tick would silently write a
    // fresh save right back to the same key - so "Delete Memories" looked
    // like it did nothing. Reloading to the title screen (same as Quit to
    // Title) guarantees no live session is left around to resurrect it,
    // and gives a moment of actual on-screen confirmation first.
    alert('Save deleted.');
    location.reload();
  }
});
