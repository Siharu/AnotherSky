/* ---------- WHISPER / AMBIENT DIALOGUE DELIVERY ----------
   Pulled from main.js (Wave 3 — world-gen/entities chokepoint #2, see
   docs/HANDOFF.md). Genuinely self-contained: only touches its own
   private timers, the `whisperEl` DOM ref, and its own line pools.
   No `state`, no `scene`, no ghuul/director/sanity coupling - every
   caller elsewhere (updateGhuul, updateSanity, runDirectorAction, the
   collect-orb flow) just calls showWhisper()/pickAmbientWhisper()/
   pickWhisperOnCollect() as an import, same as before.

   whisperCooldown (private, primitive) can't be mutated directly from
   an importing module - the same problem systems/save.js already
   solved for autosaveTimer via tickAutosave(dt). Same fix here:
   updateWhisperCooldown(dt, dread) wraps the decrement + dread-gated
   trigger entirely inside this module; main.js calls it instead of
   touching whisperCooldown itself. */
import { $ } from '../utils/dom.js';
import { ambientWhispers, collectWhispers } from '../data/dialogue.js';

const whisperEl = $('whisper');

let whisperTimer = 0, whisperCooldown = 0;

export function showWhisper(text){
  whisperEl.textContent = text;
  whisperEl.classList.add('show');
  whisperTimer = 2.6;
}

// per-frame tick: hides the whisper line once its display time elapses
export function updateWhisper(dt){
  if(whisperTimer>0){
    whisperTimer -= dt;
    if(whisperTimer<=0) whisperEl.classList.remove('show');
  }
}

// dread-gated ambient whisper trigger - was inline in main.js's
// glitch/aberration update, manipulating whisperCooldown directly;
// wrapped here so the timer stays private to this module.
export function updateWhisperCooldown(dt, dread){
  whisperCooldown -= dt;
  if(dread>0.65 && whisperCooldown<=0){
    whisperCooldown = 14+Math.random()*8;
    showWhisper(pickAmbientWhisper());
  }
}

export function pickAmbientWhisper(){ return ambientWhispers[Math.floor(Math.random()*ambientWhispers.length)]; }

export function pickWhisperOnCollect(){ return collectWhispers[Math.floor(Math.random()*collectWhispers.length)]; }
