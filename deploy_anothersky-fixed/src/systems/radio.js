// ---------- RADIO ----------
// Pulled per docs/HANDOFF.md's ranking: audio + DOM refs (its two
// blockers) were both cleared a few rounds back, so this was a clean
// "just move it" pull, not a re-tangle like sanity/director were once
// feared to be.
//
// Bonus fix while pulling this: main.js had its own inline duplicate
// copies of every radioXLines[] array (identical content, byte-diffed
// before touching anything) - the exact "two sources of truth" bug
// class the LORE duplicate hit a while back. data/dialogue.js already
// exported real versions of all of them, but nothing anywhere actually
// imported from it. Same story for pickFrom() - utils/math.js already
// had a real export, main.js had its own unused-import duplicate.
// Both fixed here: this module imports the real ones, main.js's local
// copies are deleted (see HANDOFF.md).
//
// radioTimer is a private mutable primitive read/written from both
// updateRadio() (this module) and toggleRadio() (still in main.js, DOM-
// click-wiring). Same "two-owner lazy mutation" shape whisperCooldown/
// autosaveTimer/audioCtx already hit - solved the same way: radioTimer
// stays module-private, exposed only through updateRadio(dt) and a
// small resetRadioTimer(v) setter for toggleRadio() to call instead of
// reaching in directly.

import { state } from '../core/state.js';
import { ghuulList } from '../entities/ghuuls.js';
import { pickFrom } from '../utils/math.js';
import {
  radioAmbientLines, radioWarningLines, radioHuntLines,
  radioLowSanityLines, radioDreadLines, radioTowerHintLines, radioTowerFoundLines,
  radioFalseSafeLines, radioPhantomLines,
  radioFourYearLines, radioChoirLines,
} from '../data/dialogue.js';
import { radioTicker } from '../ui/hud.js';

export function bearingToCompassAngle(){ return Math.random()*Math.PI*2; }

export function pickSituationalRadioLine(forceWarning){
  const anyHunting = ghuulList.some(g=>g.aiState==='HUNT');
  // Deceptive: below a sanity threshold, the signal itself starts lying
  // while something is actually hunting - instead of the honest
  // radioHuntLines warning, it tells you you're clear. Chance scales with
  // how far under the threshold sanity has slipped (never fires above
  // it, closer to guaranteed near rock bottom) - reads as the radio
  // actively failing you when you need it most, not a random wrong
  // guess. Mechanically meaningful, not just flavor: warning stays
  // false, so this does NOT set state.warnedBearing the way a real hunt
  // line does - the real cost of being lied to here is losing the
  // compass cue during the one moment it would have mattered.
  if(anyHunting && state.sanity < 0.35 && Math.random() < (0.35 - state.sanity)*1.2){
    return { text: pickFrom(radioFalseSafeLines), warning:false, deceptive:true };
  }
  if(anyHunting) return { text: pickFrom(radioHuntLines), warning:true };
  if(forceWarning) return { text: pickFrom(radioWarningLines), warning:true };
  if(state.sanity < 0.3 && Math.random()<0.6) return { text: pickFrom(radioLowSanityLines), warning:false };
  if(state.dread > 0.55 && Math.random()<0.5) return { text: pickFrom(radioDreadLines), warning:false };
  if(!state.minimapUnlocked && Math.random()<0.4) return { text: pickFrom(radioTowerHintLines), warning:false };
  if(state.minimapUnlocked && Math.random()<0.15) return { text: pickFrom(radioTowerFoundLines), warning:false };
  // New mystery material - confirms (never explains) fragments the player
  // has already read, per MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md's "the player
  // connects it themselves" beat. Gated on collection so these can't fire
  // before the fragment that motivates them; low chance so they read as
  // one of many possible transmissions, not a scripted follow-up.
  if((state.collected.has(12) || state.collected.has(19)) && Math.random()<0.12) return { text: pickFrom(radioFourYearLines), warning:false };
  if(state.collected.has(14) && Math.random()<0.12) return { text: pickFrom(radioChoirLines), warning:false };
  if(Math.random()<0.35) return { text: pickFrom(radioWarningLines), warning:true };
  return { text: pickFrom(radioAmbientLines), warning:false };
}

export function broadcastRadio(forceWarning){
  const pick = pickSituationalRadioLine(forceWarning);
  radioTicker.textContent = pick.text;
  radioTicker.classList.add('show');
  clearTimeout(broadcastRadio._hideT);
  broadcastRadio._hideT = setTimeout(()=> radioTicker.classList.remove('show'), 5200);
  if(pick.warning){
    state.warnedBearing = bearingToCompassAngle();
    state.warnedBearingExpires = 75;
  }
  state.radioLog.push({ text: pick.text, warning: !!pick.warning, elapsed: state.elapsed });
  if(state.radioLog.length > 30) state.radioLog.shift(); // cap history - a lost player reviewing this doesn't need the first ten minutes, just recent context
}

// Phantom transmission - never truthful, never situational, doesn't route
// through pickSituationalRadioLine at all. Triggered by the AI Director
// (entities/director.js) as its own weighted event, independent of
// radioTimer/state.radioOn, so it can cut in even with the radio
// nominally off - part of what makes it unplaceable as "just the radio
// again" rather than routine chatter. Logged into state.radioLog with a
// phantom:true flag so ui/radiolog.js can render it distinctly (e.g.
// visually corrupted) rather than looking like an ordinary past
// broadcast - that's a follow-up UI task, not done as part of this change.
export function broadcastPhantomTransmission(){
  const text = pickFrom(radioPhantomLines);
  radioTicker.textContent = text;
  radioTicker.classList.add('show');
  clearTimeout(broadcastRadio._hideT);
  broadcastRadio._hideT = setTimeout(()=> radioTicker.classList.remove('show'), 5200);
  state.radioLog.push({ text, warning:false, phantom:true, elapsed: state.elapsed });
  if(state.radioLog.length > 30) state.radioLog.shift();
}

let radioTimer = 10;
export function resetRadioTimer(v){ radioTimer = v; }

export function updateRadio(dt){
  if(!state.radioOn) return;
  radioTimer -= dt;
  if(radioTimer<=0){
    radioTimer = 14+Math.random()*12;
    broadcastRadio(false);
  }
  if(state.warnedBearing!==null){
    state.warnedBearingExpires -= dt;
    if(state.warnedBearingExpires<=0) state.warnedBearing=null;
  }
}
