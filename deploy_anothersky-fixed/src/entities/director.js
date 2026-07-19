// ---------- AI DIRECTOR ----------
// Pulled per docs/HANDOFF.md's ranking (#2 after radio/sanity): most of
// this was already unblocked once systems/audio.js and entities/ghuuls.js
// existed - playFakeFootstep()/playAnimalCall() and alertGhuulToward()
// are both real imports now. flickerRandomLamp() came along for free
// too - it only ever touched `lamps`, already a real export from
// world/worldData.js.
//
// The one genuine remaining blocker: runDirectorAction()'s 'thunder'
// case calls triggerLightning(), which reaches into sky/weather's
// ambient/skyLight THREE objects - a whole not-yet-touched lighting
// system, not something worth pulling just to unblock one switch case
// here. Same shape as updateGhuul()'s injected `stinger` param:
// evaluateDirector(dt, triggerLightning) takes it as a parameter and
// threads it through to runDirectorAction() rather than importing it.
// main.js's call site passes its local triggerLightning().
//
// `director` (the { timer, stress } state object) stays module-private -
// nothing outside this file ever touched it directly.

import { state } from '../core/state.js';
import { ghuulList, alertGhuulToward } from './ghuuls.js';
import { lamps } from '../world/worldData.js';
import { showWhisper, pickAmbientWhisper } from '../ui/whisper.js';
import { broadcastRadio, broadcastPhantomTransmission } from '../systems/radio.js';
import { playFakeFootstep, playAnimalCall } from '../systems/audio.js';

const director = { timer: 8, stress: 0 };

export function directorInputs(){
  let nearestGhuulDist = Infinity, anyHunting=false, anyPatrolIdle=null;
  for(const g of ghuulList){
    const d = Math.hypot(g.x-state.playerX, g.z-state.playerZ);
    if(d<nearestGhuulDist) nearestGhuulDist=d;
    if(g.aiState==='HUNT') anyHunting=true;
    if(g.aiState==='PATROL' && !anyPatrolIdle) anyPatrolIdle=g;
  }
  return { nearestGhuulDist, anyHunting, anyPatrolIdle };
}

export function evaluateDirector(dt, triggerLightning){
  director.timer -= dt;
  if(director.timer>0) return;
  const inputs = directorInputs();
  director.stress = THREE.MathUtils.clamp(
    (1-state.sanity)*0.4 + (inputs.anyHunting?0.4:0) + state.dread*0.3, 0, 1
  );
  director.timer = THREE.MathUtils.lerp(24, 8, director.stress);
  if(inputs.anyHunting){ return; }

  const options = [];
  const push=(name,w)=>{ if(w>0) options.push({name,w}); };
  push('silence',        6 - director.stress*4.5);
  push('whisper',        2 + director.stress*2);
  push('thunder',        1.6);
  push('radioBurst',     state.radioOn ? 2 : 0);
  push('fakeFootsteps',  1.2 + director.stress*3);
  push('animalCall',     1.8 - director.stress);
  push('lampFlicker',    1.4);
  push('alertGhuul',     inputs.anyPatrolIdle ? 0.8+director.stress*2.5 : 0);
  // only enters the option pool above a real stress threshold, unlike
  // every other event here - this one's meant to read as a sign things
  // have gotten bad, not routine chatter, so it can't fire early/often
  // the way e.g. lampFlicker can
  push('phantomTransmission', director.stress > 0.5 ? (director.stress-0.5)*3 : 0);

  const total = options.reduce((a,o)=>a+o.w,0);
  let r = Math.random()*total, picked='silence';
  for(const o of options){ if(r<o.w){ picked=o.name; break; } r-=o.w; }
  runDirectorAction(picked, inputs, triggerLightning);
}

export function runDirectorAction(name, inputs, triggerLightning){
  switch(name){
    case 'silence': break;
    case 'whisper': showWhisper(pickAmbientWhisper()); break;
    case 'thunder': triggerLightning(); break;
    case 'radioBurst': broadcastRadio(false); break;
    case 'fakeFootsteps': playFakeFootstep(); break;
    case 'animalCall': playAnimalCall(); break;
    case 'lampFlicker': flickerRandomLamp(); break;
    case 'phantomTransmission': broadcastPhantomTransmission(); break;
    case 'alertGhuul': {
      const g = inputs.anyPatrolIdle;
      if(!g) break;
      let tx = state.playerX, tz = state.playerZ;
      if(state.warnedBearing!==null){
        tx = state.playerX + Math.cos(state.warnedBearing)*20;
        tz = state.playerZ + Math.sin(state.warnedBearing)*20;
      }
      alertGhuulToward(g, tx, tz);
      break;
    }
  }
}

export function flickerRandomLamp(){
  if(!lamps.length) return;
  const l = lamps[Math.floor(Math.random()*lamps.length)];
  const old = l.base;
  l.base = 0.15;
  setTimeout(()=>{ l.base = old; }, 300+Math.random()*500);
}
