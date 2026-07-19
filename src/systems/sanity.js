// ---------- SANITY ----------
// Pulled alongside radio.js this round - same blocker set (ghuulList/
// DOM refs, both cleared). No meter, no number by design - the radio
// HUD icon itself is the sanity readout (--corrupt CSS var + periodic
// signal-glitch bursts). Keep it that way per the standing note in
// docs/HANDOFF.md's "READ THIS FIRST" section - don't add a bar/number
// here later without being asked.
//
// radioGlitchTimer is module-private, only ever touched from inside
// updateSanityVisual() itself - no cross-module mutation problem here,
// unlike radioTimer in systems/radio.js.

import { state } from '../core/state.js';
import { ghuulList, triggerPhantomSighting } from '../entities/ghuuls.js';
import { showWhisper } from '../ui/whisper.js';
import { radioBtn } from '../ui/hud.js';
import { getCorruptionLevel } from './zones.js';

export function updateSanity(dt){
  const anyHunting = ghuulList.some(g=>g.aiState==='HUNT');
  const corruption = getCorruptionLevel(state.playerX, state.playerZ);
  // standing inside high corruption drains sanity even with nothing
  // hunting - same rough magnitude as the dread-based drain below at its
  // steepest, so deep corruption is a real reason to leave, not just
  // set dressing (see world/grass.js for the matching visual tell)
  const drain = anyHunting ? 0.028 : (state.dread>0.6 ? (state.dread-0.6)*0.05 : -0.015) + corruption*0.02;
  state.sanity = THREE.MathUtils.clamp(state.sanity - drain*dt, 0, 1);
  updateSanityVisual(dt);

  if(state.sanity<0.4 && Math.random()<dt*0.15){
    const trueCount = state.collected.size;
    const falseCount = Math.max(0, trueCount + (Math.random()<0.5?-1:1));
    showWhisper(state.sanity<0.18
      ? `wait— was that ${falseCount}? weren't there ${falseCount}?`
      : `${trueCount} so far. keep going.`);
  }
  if(state.sanity<0.15 && Math.random()<dt*0.05){
    showWhisper(Math.random()<0.5 ? "it's gone now." : "you're the only one left.");
  }

  // Visual hallucination - a fake ghuul sighting, gated more
  // conservatively than the text whispers above since it's a stronger
  // effect. Never fires while a real ghuul is actually hunting - that's
  // genuine danger and shouldn't compete for the player's attention with
  // a fake one, and it would also undercut the deceptive-radio mechanic
  // (systems/radio.js) which already owns "something's wrong during a
  // real hunt" at this same sanity range.
  if(state.sanity<0.3 && !ghuulList.some(g=>g.aiState==='HUNT') && Math.random()<dt*0.035){
    triggerPhantomSighting(state.playerX, state.playerZ);
  }
}

// no meter, no number - the radio icon itself is the sanity readout (see
// the CSS block in index.html). --corrupt drives the steady fade (waves
// out, static in, color souring); glitch bursts are separate short
// animation events layered on top, timed independently so it reads as an
// unstable signal rather than a smooth dial.
let radioGlitchTimer = 3;
export function updateSanityVisual(dt){
  if(!radioBtn) return;
  const corrupt = THREE.MathUtils.clamp(1 - state.sanity, 0, 1);
  radioBtn.style.setProperty('--corrupt', corrupt.toFixed(3));
  if(corrupt <= 0.04) return; // near-full sanity: signal stays clean, no glitch bursts at all
  radioGlitchTimer -= dt;
  if(radioGlitchTimer <= 0){
    radioBtn.classList.remove('signal-glitch'); void radioBtn.offsetWidth;
    radioBtn.classList.add('signal-glitch');
    setTimeout(()=> radioBtn.classList.remove('signal-glitch'), 200);
    // healthy-ish: rare burst every ~6-7.5s. Near zero sanity: almost
    // constant, a burst every ~0.4-0.9s - the icon reads as barely holding on.
    radioGlitchTimer = THREE.MathUtils.lerp(6, 0.4, corrupt) + Math.random()*1.5;
  }
}
