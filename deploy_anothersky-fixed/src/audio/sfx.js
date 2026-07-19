// ---------- ONE-SHOT SOUND EFFECTS ----------
// Self-contained: owns its own AudioContext, volume, and mute state
// rather than reaching into the game's shared `state` object. Call
// setVolume()/setMuted() from systems/settings.js when those change.
//
// Extracted from the monolith (was: distortionCurve, playMenuTone,
// playSpaceBreakdownSound, playWakeFallSound, ~lines 5160/6141/6502/6605).
// NOT yet extracted: initAudio()'s big ambient rain/noise engine
// (masterGain + procedural rain buffers) - it's tightly coupled to the
// per-frame rain-intensity control in the main loop, so it stays in the
// monolith for now. See docs/ARCHITECTURE.md migration map.

let audioCtx = null;
let userVolume = 0.7;
let muted = false;
const MENU_NOTES = [220, 246.94, 261.63, 293.66, 329.63]; // A3, B3, C4, D4, E4 - same pentatonic-ish set as the monolith
let lastMenuNote = -1;

export function setVolume(v){ userVolume = v; }
export function setMuted(m){ muted = m; }
export function getAudioCtx(){ return audioCtx; }

function ensureCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function distortionCurve(amount){
  const n = 256, curve = new Float32Array(n);
  for(let i=0;i<n;i++){
    const x = i*2/n - 1;
    curve[i] = (3+amount)*x*20*(Math.PI/180) / (Math.PI + amount*Math.abs(x));
  }
  return curve;
}

// Menu hover/click tone - a sine + triangle blip, click drops an octave
// so it reads as "confirmed" vs. hover's "brushed past."
export function playMenuTone(isClick){
  if(muted) return;
  const ctx = ensureCtx();
  let idx = Math.floor(Math.random()*MENU_NOTES.length);
  if(idx === lastMenuNote) idx = (idx+1) % MENU_NOTES.length;
  lastMenuNote = idx;
  const freq = MENU_NOTES[idx] * (isClick ? 0.5 : 1);
  const t = ctx.currentTime;
  const g = ctx.createGain(); g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(userVolume*(isClick?0.22:0.14), t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t+(isClick?1.6:1.1));
  g.connect(ctx.destination);
  const sine = ctx.createOscillator(); sine.type='sine'; sine.frequency.value=freq;
  const tri = ctx.createOscillator(); tri.type='triangle'; tri.frequency.value=freq*2;
  const triGain = ctx.createGain(); triGain.gain.value=0.25;
  sine.connect(g); tri.connect(triGain); triGain.connect(g);
  sine.start(t); tri.start(t);
  sine.stop(t+2); tri.stop(t+2);
}

// The eyelid-wake "falling into your body" cue - a falling sine + lowpass sweep.
export function playWakeFallSound(){
  if(muted) return;
  const ctx = ensureCtx();
  const t = ctx.currentTime, dur = 2.6;
  const osc = ctx.createOscillator(); osc.type='sine';
  osc.frequency.setValueAtTime(340, t);
  osc.frequency.exponentialRampToValueAtTime(48, t+dur);
  const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.setValueAtTime(1200,t);
  filt.frequency.exponentialRampToValueAtTime(120, t+dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(userVolume*0.18, t+0.3);
  g.gain.linearRampToValueAtTime(0, t+dur);
  osc.connect(filt); filt.connect(g); g.connect(ctx.destination);
  osc.start(t); osc.stop(t+dur+0.1);
}

// Menu idle-breakdown cue: deep rising sub sweep + stuttering distorted
// layer + a rising/falling detuned wail, all inside one ~4.2s window -
// matches the CSS void-flood animation duration in the title screen.
export function playSpaceBreakdownSound(){
  if(muted) return;
  const ctx = ensureCtx();
  const t = ctx.currentTime, total = 4.2;
  const out = ctx.createGain(); out.gain.value = userVolume*0.55;
  out.connect(ctx.destination);

  const sub = ctx.createOscillator(); sub.type='sine';
  sub.frequency.setValueAtTime(30, t);
  sub.frequency.linearRampToValueAtTime(70, t+total*0.6);
  sub.frequency.linearRampToValueAtTime(24, t+total);
  const subGain = ctx.createGain(); subGain.gain.setValueAtTime(0,t);
  subGain.gain.linearRampToValueAtTime(0.7, t+total*0.5);
  subGain.gain.linearRampToValueAtTime(0, t+total);
  sub.connect(subGain); subGain.connect(out);
  sub.start(t); sub.stop(t+total+0.1);

  const stutterOsc = ctx.createOscillator(); stutterOsc.type='sawtooth'; stutterOsc.frequency.value=110;
  const shaper = ctx.createWaveShaper(); shaper.curve = distortionCurve(60); shaper.oversample='4x';
  const stutterLfo = ctx.createOscillator(); stutterLfo.type='square'; stutterLfo.frequency.value=14;
  const stutterLfoGain = ctx.createGain(); stutterLfoGain.gain.value=0.5;
  const stutterGain = ctx.createGain(); stutterGain.gain.value=0.18;
  stutterLfo.connect(stutterLfoGain); stutterLfoGain.connect(stutterGain.gain);
  const stutterFilt = ctx.createBiquadFilter(); stutterFilt.type='bandpass'; stutterFilt.frequency.value=700; stutterFilt.Q.value=1.2;
  stutterOsc.connect(shaper); shaper.connect(stutterFilt); stutterFilt.connect(stutterGain); stutterGain.connect(out);
  stutterOsc.start(t); stutterLfo.start(t);
  stutterOsc.stop(t+total); stutterLfo.stop(t+total);

  const wail = ctx.createOscillator(); wail.type='sawtooth';
  wail.frequency.setValueAtTime(180, t+total*0.15);
  wail.frequency.exponentialRampToValueAtTime(520, t+total*0.55);
  wail.frequency.exponentialRampToValueAtTime(90, t+total*0.95);
  const wailVibrato = ctx.createOscillator(); wailVibrato.type='sine'; wailVibrato.frequency.value=7;
  const wailVibratoGain = ctx.createGain(); wailVibratoGain.gain.value=18;
  wailVibrato.connect(wailVibratoGain); wailVibratoGain.connect(wail.frequency);
  const wailFilt = ctx.createBiquadFilter(); wailFilt.type='bandpass'; wailFilt.frequency.value=900; wailFilt.Q.value=2.5;
  const wailGain = ctx.createGain(); wailGain.gain.setValueAtTime(0, t);
  wailGain.gain.linearRampToValueAtTime(0.28, t+total*0.55);
  wailGain.gain.linearRampToValueAtTime(0, t+total);
  wail.connect(wailFilt); wailFilt.connect(wailGain); wailGain.connect(out);
  wail.start(t+total*0.1); wailVibrato.start(t);
  wail.stop(t+total+0.1); wailVibrato.stop(t+total+0.1);

  setTimeout(()=>{ try{ out.disconnect(); }catch(e){} }, (total+0.3)*1000);
}
