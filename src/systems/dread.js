// ---------- DREAD ----------
// Real module (Wave 3). Extracted from anothersky-horror.html / src/main.js
// per docs/ARCHITECTURE.md. See docs/HANDOFF.md for scope reasoning.
//
// This was the file flagged (twice, in earlier handoff rounds) as the
// hardest of the six remaining Wave-3 stubs: updateDread() reaches into
// settingsBrightness and half a dozen raw SVG-filter DOM refs that
// weren't module-owned anywhere at the time. Both blockers are gone now:
// settingsBrightness is a real export of systems/settings.js (this
// session's earlier round), and the SVG filter/vignette DOM refs below
// are resolved locally the same way every other extracted module here
// resolves its own DOM (see safehouse.js's vignetteEl precedent) - they
// were never used anywhere outside updateDread() in the first place, so
// there's no cross-module ownership question left, just local lookups.
//
// `THREE` is used as a global here (classic <script> tag, not an ES
// import), same as core/scene.js and everywhere else in this codebase.
//
// updateBreathing() and its breathPhase cache move together with
// updateDread() since updateDread() is its only caller and its only
// meaningful input (state.dread/state.forgetting) - splitting it into
// its own module would be ownership theater, not real separation.
//
// SAFEHOUSE_CENTER is imported from world/safehouse.js, its real owner
// (moved there from main.js during a later audit pass - see that file's
// header for why the old main.js location caused a real TDZ crash for
// safehouse.js itself). This file's own reference stays safe either way,
// since it's only read inside updateDread()'s function body, not at
// this module's load time.

import { state } from '../core/state.js';
import { canvas } from '../core/scene.js';
import { ghuulList } from '../entities/ghuuls.js';
import { lamps } from '../world/worldData.js';
import { settingsBrightness } from './settings.js';
import {
  getAudioCtx, tickHeartbeat, getWindGain, getInteriorGain, playBreath
} from './audio.js';
import { updateWhisperCooldown } from '../ui/whisper.js';
import { SAFEHOUSE_CENTER } from '../world/safehouse.js';
import { isInSafeZone } from './zones.js';

const $ = id => document.getElementById(id);
const vignetteEl = $('vignette');
const dreadTintEl = $('dread-tint');
const rOffsetEl = document.getElementById('chromaGlitch').querySelector('feOffset');
const bOffsetEl = document.getElementById('chromaGlitch').querySelectorAll('feOffset')[1];
const turbNoiseEl = document.getElementById('chromaGlitch').querySelector('feTurbulence');
const tearDisplaceEl = document.getElementById('chromaGlitch').querySelector('feDisplacementMap');

let glitchTimer = 2 + Math.random()*3, glitchBurst = 0;
// PERF: last-applied-value cache for updateDread()'s SVG/canvas filter
// writes - see the throttling comment inside the function itself for why.
// Skipping a redundant DOM-attribute write when the rounded value hasn't
// changed since last frame avoids forcing the browser to re-evaluate the
// whole filter graph every single frame during the long low-dread stretches.
let _lastAberrDx = null, _lastBurstDy = null, _lastTearScale = null, _lastFilterStr = null;

export function updateDread(dt){
  let dist = Infinity;
  for(const g of ghuulList){
    const d = Math.hypot(g.x-state.playerX, g.z-state.playerZ);
    if(d<dist) dist = d;
  }
  const proximityTarget = THREE.MathUtils.clamp(1 - (dist-6)/45, 0, 1);
  // Lamps are real 3D point lights with their own falloff, so standing next
  // to one already lights the immediate area correctly - but the vignette/
  // dread-tint are flat full-screen overlays layered on top with no idea
  // where the light sources are, so they darkened the screen right next to
  // a lit lamp exactly as much as out in the open. This eases that overlay
  // back near a lamp, same idea as the safehouse-calm easing below, so a
  // working light source actually reads as a pocket of safety again.
  let lampDist = Infinity;
  for(const l of lamps){
    const d = Math.hypot(l.x-state.playerX, l.z-state.playerZ);
    if(d<lampDist) lampDist = d;
  }
  const lampProximity = THREE.MathUtils.clamp(1 - (lampDist-1.5)/7, 0, 1);
  state.lampCalm = state.lampCalm==null ? 0 : state.lampCalm;
  state.lampCalm += (lampProximity - state.lampCalm)*dt*3;
  // the safehouse is supposed to be an actual respite, not just a roofed
  // room - passive dread (just existing/"forgetting" over time) shouldn't
  // keep creeping up while the player is standing still inside it. Real
  // threats still count: proximityTarget isn't gated here, so a ghuul
  // actually closing in still pushes dread up even indoors.
  // Passive dread ("forgetting" - just existing over time) used to climb
  // from the moment the game started, reaching max in under two minutes
  // regardless of story progress - so the world was visibly darkening,
  // shaking, and glitching before the player had even found the relay
  // tower that's supposed to be causing it. Sky curdle itself is pickup-
  // driven now (see main.js's targetSkyWrongness()), not tower-triggered,
  // so this follows the same signal: nothing passive happens until the
  // sky's actually started turning, whatever pickup count that took.
  // A ghuul actually closing in still pushes dread up regardless (real
  // threat, not ambient atmosphere), indoors or out.
  if(state.started && state.skyWrongness > 0.05 && !state.insideSafehouse) state.forgetting = Math.min(1, state.forgetting + dt*0.006); // reverted from 0.009 - "extreme atmosphere" pass made dread build too fast once the sky starts turning
  const target = Math.max(proximityTarget, state.forgetting, state.stormDreadBoost);
  state.dread += (target-state.dread)*dt*1.2;

  // ease the interior-calm factor in/out smoothly (not a hard cut at the
  // doorway) so walking in/out doesn't snap the vignette
  state.safehouseCalm = state.safehouseCalm==null ? 0 : state.safehouseCalm;
  state.safehouseCalm += ((state.insideSafehouse?1:0) - state.safehouseCalm)*dt*2.5;
  // same easing shape for the radio tower's safe zone (systems/zones.js) -
  // the ghuul-AI side of this (entities/ghuuls.js forcing any threatening
  // ghuul to RETREAT while the player's inside) already handles the real
  // danger; this is just the matching visual "you can breathe here" cue
  // rather than the vignette staying at full dread right up until a
  // ghuul's distance actually changes.
  state.zoneCalm = state.zoneCalm==null ? 0 : state.zoneCalm;
  state.zoneCalm += ((isInSafeZone(state.playerX, state.playerZ)?1:0) - state.zoneCalm)*dt*2.5;
  const calm = Math.min(1, state.safehouseCalm + state.lampCalm*0.7 + state.zoneCalm*0.85);

  vignetteEl.style.opacity = ((0.62 + state.dread*0.5) * (1 - calm*0.65)).toFixed(2); // was 0.5/0.4 - extreme atmosphere pass: darker floor, steeper climb with dread
  dreadTintEl.style.background = `rgba(90,10,10,${(state.dread*0.36*(1-calm*0.8)).toFixed(2)})`; // was 0.28

  // chromatic-aberration / signal-tear glitch, layered on top of the
  // existing saturate/contrast dread filter. A small ambient RGB split is
  // always present and grows with dread; short random bursts spike it much
  // higher for a fraction of a second (a "wrongness flicker" on the sky and
  // buildings), then decay back down. Bursts fire more often as dread rises.
  glitchTimer -= dt;
  if(glitchTimer <= 0){
    glitchBurst = 1;
    glitchTimer = THREE.MathUtils.lerp(6, 1.1, state.dread) * (0.5+Math.random()); // was lerp(9,1.6,...) - extreme atmosphere pass: glitches fire more often at every dread level
    turbNoiseEl.setAttribute('baseFrequency', `0 ${(0.01+Math.random()*0.06).toFixed(3)}`);
    turbNoiseEl.setAttribute('seed', String(Math.floor(Math.random()*200)));
  }
  glitchBurst = Math.max(0, glitchBurst - dt*3.2);
  const glitchCalm = 1 - calm*0.7; // indoors: glitch still happens if dread is genuinely high (real threat), just damped
  const aberr = (0.5 + state.dread*2.2 + glitchBurst*9) * glitchCalm;
  const dreadForFilter = state.dread*glitchCalm;

  // PERF: the SVG filter graph itself is untouched (same feTurbulence/
  // feDisplacementMap chain, same visual result) - what was actually
  // expensive was rewriting every one of these DOM attributes/the canvas
  // filter string on literally every frame, even during the long stretches
  // where glitchBurst is 0 and the values are basically static (each write
  // forces the browser to re-evaluate the whole filter graph, which is not
  // GPU-accelerated the way canvas rendering is). Two changes, neither
  // alters what's ever visible:
  //  1. skip the write entirely if the rounded value hasn't changed since
  //     last frame (the common case at low/steady dread)
  //  2. during an active glitch burst (glitchBurst>0, i.e. the only time
  //     these values are moving fast enough to matter visually), still
  //     update every frame for the same snappy flicker as before - the
  //     throttle only kicks in once a burst has fully decayed to 0
  const aberrStr = (-aberr).toFixed(2);
  if(aberrStr !== _lastAberrDx || glitchBurst > 0){
    rOffsetEl.setAttribute('dx', aberrStr);
    bOffsetEl.setAttribute('dx', aberr.toFixed(2));
    _lastAberrDx = aberrStr;
  }
  const burstDyStr = (glitchBurst*1.5*glitchCalm).toFixed(2);
  if(burstDyStr !== _lastBurstDy){
    bOffsetEl.setAttribute('dy', burstDyStr);
    _lastBurstDy = burstDyStr;
  }
  const tearScaleStr = ((state.dread*3 + glitchBurst*26)*glitchCalm).toFixed(1);
  if(tearScaleStr !== _lastTearScale){
    tearDisplaceEl.setAttribute('scale', tearScaleStr);
    _lastTearScale = tearScaleStr;
  }
  const filterStr = `url(#chromaGlitch) saturate(${(1-0.4*dreadForFilter).toFixed(2)}) contrast(${(1+0.25*dreadForFilter).toFixed(2)}) brightness(${settingsBrightness})`;
  if(filterStr !== _lastFilterStr){
    canvas.style.filter = filterStr;
    _lastFilterStr = filterStr;
  }

  tickHeartbeat(dt, state.dread);

  updateWhisperCooldown(dt, state.dread);

  { const wg = getWindGain(); if(wg) wg.gain.value = 0.13 + state.windGust*0.22; }
  { const ig = getInteriorGain();
    if(ig){
      const dHouse = Math.hypot(state.playerX-SAFEHOUSE_CENTER.x, state.playerZ-SAFEHOUSE_CENTER.z);
      // full within the walls (~6m covers the room's own half-diagonal), fades
      // to nothing by 16m so it doesn't linger audibly once you've actually left
      const t = 1 - THREE.MathUtils.clamp((dHouse-6)/10, 0, 1);
      ig.gain.value = t*t * 0.16;
    }
  }
  updateBreathing(dt);
}

/* ---------- BREATHING ----------
   Heavy, audible breathing that gets faster and louder as forgetting/dread
   rises - built the same way as the other ambient layers (filtered noise
   bursts on an envelope) rather than a sample, so it stays procedural. */
let breathPhase = 0;
function updateBreathing(dt){
  const audioCtx = getAudioCtx();
  if(!audioCtx) return;
  const intensity = Math.max(state.dread, state.forgetting);
  const rate = THREE.MathUtils.lerp(0.22, 0.85, intensity); // breaths per second-ish
  breathPhase += dt*rate;
  if(breathPhase >= 1){
    breathPhase -= 1;
    playBreath(0.05 + intensity*0.35, intensity);
  }
}
