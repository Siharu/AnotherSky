/* ---------- AUDIO (gameplay core) ----------
   Pulled from main.js. This is the "spine" half of the audio system:
   the shared WebAudio graph (audioCtx/masterGain/heartGain/windGain/
   breathGain/interiorGain) plus initAudio() and every gameplay stinger/
   ambience function (playHeartbeat, playStinger, playThunder,
   playFakeFootstep, playWetFootstep, playAnimalCall, playBreath).

   NOT moved, deliberately: the pre-game menu-ambience cluster
   (startMenuAmbience/stopMenuAmbience/playBootSting/playMenuTone),
   playSpaceBreakdownSound/playWakeFallSound (title-sequence specific),
   and the window-figure encounter's hum/static (setHumVolume/
   playFigureStatic, figureState-coupled). All of those connect straight
   to audioCtx.destination by design (bypassing masterGain, so they can
   start on the very first user gesture before the real ambient mix
   exists) and belong with a future title-sequence/figure-encounter
   pull, not the core engine. They still need to reach the current
   audioCtx though, hence getAudioCtx()/ensureAudioCtx() below - main.js
   calls those instead of touching a module-private variable directly.

   audioCtx itself used to be lazily created from TWO places (initAudio
   here, and startMenuAmbience which stays in main.js) - a raw exported
   `let audioCtx` can't be reassigned from an importing module (ES
   import bindings are read-only views), so both creation sites now go
   through ensureAudioCtx() instead. Plain reads elsewhere in main.js
   (the guard checks at the top of the menu/figure functions) go
   through getAudioCtx().

   heartTimer (a private primitive, decremented every frame from a big
   mixer function in main.js) hit the exact same "can't mutate an
   import binding" problem systems/save.js and ui/whisper.js already
   solved for their own timers - same fix: tickHeartbeat(dt, dread)
   wraps the decrement + trigger entirely inside this module. */
import { state } from '../core/state.js';
import { showWhisper } from '../ui/whisper.js';

let audioCtx = null, masterGain = null, heartGain = null, heartTimer = 0;
let windGain = null, breathGain = null, interiorGain = null;
let pattGain = null, washGain = null;
// Base resting gains for the two outdoor rain layers + wind, so the new
// indoor-muffling tick below has a fixed reference to lerp toward/away
// from rather than needing to read back whatever value it last set.
const RAIN_PATT_BASE = 0.22, RAIN_WASH_BASE = 0.3, WIND_BASE = 0.13;
const INTERIOR_TARGET = 0.5; // interiorGain's resting level once indoors - was created with gain=0 and never touched again anywhere, so the "distinct interior acoustic space" this was built for never actually played
const INDOOR_OUTDOOR_MUFFLE = 0.22; // outdoor rain/wind heard through walls - muffled, not silent

export function getAudioCtx(){ return audioCtx; }
export function ensureAudioCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  return audioCtx;
}
export function getMasterGain(){ return masterGain; }
export function getWindGain(){ return windGain; }
export function getInteriorGain(){ return interiorGain; }

export function initAudio(userVolume){
  if(masterGain) return; // audioCtx may already exist (menu ambience creates it early) - masterGain is the real "already initialized" signal
  try{
    ensureAudioCtx();
    masterGain = audioCtx.createGain(); masterGain.gain.value = state.muted ? 0 : userVolume; masterGain.connect(audioCtx.destination);

    // Build a long, irregular noise buffer (not a short repeating loop).
    // Rain "patter" is many independent impulses at random times/amplitudes,
    // layered under a softer broadband wash, so the ear never catches a seam.
    const sr = audioCtx.sampleRate;
    const bufLen = sr*10; // 10s buffer, far above the ~1-2s a listener notices looping
    function makeNoiseBuffer(density){
      const buf = audioCtx.createBuffer(1, bufLen, sr);
      const d = buf.getChannelData(0);
      let last = 0;
      for(let i=0;i<bufLen;i++){
        // sparse random impulses (raindrop hits) blended with smoothed broadband noise
        const impulse = (Math.random()<density) ? (Math.random()*2-1) : 0;
        const broadband = (Math.random()*2-1)*0.35;
        last = last*0.72 + broadband*0.28; // gentle smoothing so it's not harsh static
        d[i] = impulse*0.6 + last;
      }
      return buf;
    }

    // Layer 1: high, close patter (leaves/ground)
    const pattBuf = makeNoiseBuffer(0.012);
    const pattSrc = audioCtx.createBufferSource(); pattSrc.buffer=pattBuf; pattSrc.loop=true;
    const pattFilter = audioCtx.createBiquadFilter(); pattFilter.type='bandpass'; pattFilter.frequency.value=2600; pattFilter.Q.value=0.5;
    pattGain = audioCtx.createGain(); pattGain.gain.value=RAIN_PATT_BASE;
    pattSrc.connect(pattFilter); pattFilter.connect(pattGain); pattGain.connect(masterGain);
    pattSrc.start(0, Math.random()*bufLen/sr);

    // Layer 2: deeper, distant wash (the bulk of "rain" sound)
    const washBuf = makeNoiseBuffer(0.004);
    const washSrc = audioCtx.createBufferSource(); washSrc.buffer=washBuf; washSrc.loop=true;
    const washFilter = audioCtx.createBiquadFilter(); washFilter.type='lowpass'; washFilter.frequency.value=1400;
    washGain = audioCtx.createGain(); washGain.gain.value=RAIN_WASH_BASE;
    washSrc.connect(washFilter); washFilter.connect(washGain); washGain.connect(masterGain);
    washSrc.start(0, Math.random()*bufLen/sr);

    // slow random drift on both filters so the texture keeps subtly shifting
    const drift1 = audioCtx.createOscillator(); drift1.frequency.value=0.037;
    const drift1Gain = audioCtx.createGain(); drift1Gain.gain.value=350;
    drift1.connect(drift1Gain); drift1Gain.connect(pattFilter.frequency); drift1.start();
    const drift2 = audioCtx.createOscillator(); drift2.frequency.value=0.021;
    const drift2Gain = audioCtx.createGain(); drift2Gain.gain.value=260;
    drift2.connect(drift2Gain); drift2Gain.connect(washFilter.frequency); drift2.start();

    // wind
    const windBuf = makeNoiseBuffer(0.002);
    const windSrc = audioCtx.createBufferSource(); windSrc.buffer=windBuf; windSrc.loop=true;
    const windFilter = audioCtx.createBiquadFilter(); windFilter.type='bandpass'; windFilter.frequency.value=350; windFilter.Q.value=0.7;
    const windGainNode = audioCtx.createGain(); windGainNode.gain.value=WIND_BASE;
    windGain = windGainNode;
    const lfo = audioCtx.createOscillator(); lfo.frequency.value=0.06;
    const lfoGain = audioCtx.createGain(); lfoGain.gain.value=140;
    lfo.connect(lfoGain); lfoGain.connect(windFilter.frequency); lfo.start();
    windSrc.connect(windFilter); windFilter.connect(windGainNode); windGainNode.connect(masterGain);
    windSrc.start(0, Math.random()*bufLen/sr);

    // safehouse interior ambience - low, dry, close creaking (old wood
    // settling, not weather) so the room reads as a distinct acoustic space
    // rather than just the same outdoor wind at a different volume. Gain
    // is driven every frame by distance to SAFEHOUSE_CENTER (see the wind
    // gain update below) - silent once you've walked any real distance away.
    const interiorBuf = makeNoiseBuffer(0.0022);
    const interiorSrc = audioCtx.createBufferSource(); interiorSrc.buffer=interiorBuf; interiorSrc.loop=true;
    const interiorFilter = audioCtx.createBiquadFilter(); interiorFilter.type='lowpass'; interiorFilter.frequency.value=220;
    const interiorGainNode = audioCtx.createGain(); interiorGainNode.gain.value=0;
    interiorGain = interiorGainNode;
    const interiorLfo = audioCtx.createOscillator(); interiorLfo.frequency.value=0.045;
    const interiorLfoGain = audioCtx.createGain(); interiorLfoGain.gain.value=60;
    interiorLfo.connect(interiorLfoGain); interiorLfoGain.connect(interiorFilter.frequency); interiorLfo.start();
    interiorSrc.connect(interiorFilter); interiorFilter.connect(interiorGainNode); interiorGainNode.connect(masterGain);
    interiorSrc.start(0, Math.random()*bufLen/sr);

    heartGain = audioCtx.createGain(); heartGain.gain.value=0.0; heartGain.connect(masterGain);
    breathGain = audioCtx.createGain(); breathGain.gain.value=0.6; breathGain.connect(masterGain);
  }catch(e){ /* audio unavailable, continue silently */ }
}

// Indoor/outdoor ambience mix - this was the missing piece the comments
// on interiorGain/windGain above kept referencing ("gain is driven every
// frame by distance to SAFEHOUSE_CENTER", "see the wind gain update
// below") but no such code ever existed anywhere in this file or
// main.js: interiorGain was created at gain=0 and never touched again,
// and the outdoor rain/wind layers connected straight to masterGain at
// a fixed gain with zero indoor/outdoor distinction - rain sounded
// identical whether you were standing in the open or inside the
// safehouse. state.insideSafehouse is already set every frame by
// weather.js's updateRain(), so this just needs to read it and ease the
// two mixes toward their indoor/outdoor targets - no new call site
// wiring needed beyond the one tick call in main.js's update loop.
export function tickAmbienceMix(dt){
  if(!pattGain || !washGain || !windGain || !interiorGain) return;
  const indoors = state.insideSafehouse;
  const outdoorMul = indoors ? INDOOR_OUTDOOR_MUFFLE : 1.0;
  const rate = Math.min(1, dt*2.2); // eased over ~0.5s, not snapped - walking through a doorway shouldn't hard-cut the mix
  pattGain.gain.value += (RAIN_PATT_BASE*outdoorMul - pattGain.gain.value) * rate;
  washGain.gain.value += (RAIN_WASH_BASE*outdoorMul - washGain.gain.value) * rate;
  windGain.gain.value += (WIND_BASE*outdoorMul - windGain.gain.value) * rate;
  interiorGain.gain.value += ((indoors ? INTERIOR_TARGET : 0) - interiorGain.gain.value) * rate;
}

function playHeartbeat(vol){
  if(!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(); osc.type='sine'; osc.frequency.value=52;
  const g = audioCtx.createGain(); g.gain.value=0;
  osc.connect(g); g.connect(masterGain);
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(vol,t+0.03);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.35);
  osc.start(t); osc.stop(t+0.4);
}

// was inline in main.js's per-frame mixer, decrementing heartTimer
// directly - see file header.
export function tickHeartbeat(dt, dread){
  heartTimer -= dt;
  if(dread>0.1 && heartTimer<=0){
    heartTimer = THREE.MathUtils.lerp(1.05, 0.4, dread);
    playHeartbeat(0.12 + dread*0.28);
  }
}

export function playStinger(){
  if(!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(); osc.type='sawtooth'; osc.frequency.value=90;
  const filt = audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=400;
  const g = audioCtx.createGain(); g.gain.value=0;
  osc.connect(filt); filt.connect(g); g.connect(masterGain);
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(0.25,t+0.02);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.6);
  osc.frequency.exponentialRampToValueAtTime(40,t+0.6);
  osc.start(t); osc.stop(t+0.65);
}

export function playThunder(){
  if(!audioCtx) return;
  const t = audioCtx.currentTime;
  const sr = audioCtx.sampleRate, len = sr*2.2;
  const buf = audioCtx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const src = audioCtx.createBufferSource(); src.buffer=buf;
  const filt = audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.setValueAtTime(900,t);
  filt.frequency.exponentialRampToValueAtTime(70, t+2.0);
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(0.5,t+0.08);
  g.gain.exponentialRampToValueAtTime(0.001,t+2.2);
  src.connect(filt); filt.connect(g); g.connect(masterGain);
  src.start(t); src.stop(t+2.3);
}

export function playFakeFootstep(){
  if(!audioCtx) return;
  const t = audioCtx.currentTime;
  const pan = audioCtx.createStereoPanner(); pan.pan.value = (Math.random()<0.5?-1:1)*(0.4+Math.random()*0.5);
  const filt = audioCtx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=500;
  const g = audioCtx.createGain(); g.gain.value=0;
  const osc = audioCtx.createOscillator(); osc.type='triangle'; osc.frequency.value=68+Math.random()*24;
  osc.connect(filt); filt.connect(g); g.connect(pan); pan.connect(masterGain);
  const steps = 3+Math.floor(Math.random()*2);
  for(let i=0;i<steps;i++){
    const st = t+i*0.34;
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(0.16, st+0.02);
    g.gain.exponentialRampToValueAtTime(0.001, st+0.22);
  }
  osc.start(t); osc.stop(t+steps*0.34+0.3);
  showWhisper('footsteps. not yours.');
}

// player's own footsteps - a wet splash layer (filtered noise) plus a low
// thump, since it's raining constantly here. Volume/wetness scale with how
// black/heavy the rain currently is (dread/forgetting), same signal that
// already darkens the rain.
export function playWetFootstep(){
  if(!audioCtx) return;
  const t = audioCtx.currentTime;
  const wetness = 0.5 + Math.max(state.dread, state.forgetting)*0.5;
  const dur = 0.32;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate*dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++){
    const decay = Math.pow(1-i/d.length, 2.2);
    d[i] = (Math.random()*2-1) * decay;
  }
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const splashFilt = audioCtx.createBiquadFilter(); splashFilt.type='bandpass';
  splashFilt.frequency.value = 1400 + Math.random()*600; splashFilt.Q.value = 0.6;
  const splashGain = audioCtx.createGain();
  splashGain.gain.value = 0.09 + wetness*0.1;
  src.connect(splashFilt); splashFilt.connect(splashGain); splashGain.connect(masterGain);
  src.start(t); src.stop(t+dur+0.05);

  const thump = audioCtx.createOscillator(); thump.type='sine'; thump.frequency.value=58+Math.random()*10;
  const thumpFilt = audioCtx.createBiquadFilter(); thumpFilt.type='lowpass'; thumpFilt.frequency.value=180;
  const thumpGain = audioCtx.createGain(); thumpGain.gain.value=0;
  thumpGain.gain.setValueAtTime(0, t);
  thumpGain.gain.linearRampToValueAtTime(0.1, t+0.015);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, t+0.18);
  thump.connect(thumpFilt); thumpFilt.connect(thumpGain); thumpGain.connect(masterGain);
  thump.start(t); thump.stop(t+0.2);
}

export function playAnimalCall(){
  if(!audioCtx) return;
  const t = audioCtx.currentTime;
  const pan = audioCtx.createStereoPanner(); pan.pan.value = (Math.random()*2-1);
  const osc = audioCtx.createOscillator(); osc.type='sine'; osc.frequency.value=280;
  const filt = audioCtx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value=350; filt.Q.value=2;
  const g = audioCtx.createGain(); g.gain.value=0;
  osc.connect(filt); filt.connect(g); g.connect(pan); pan.connect(masterGain);
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(0.1,t+0.4);
  g.gain.exponentialRampToValueAtTime(0.001,t+1.8);
  osc.frequency.exponentialRampToValueAtTime(140,t+1.8);
  osc.start(t); osc.stop(t+1.9);
}

export function playBreath(vol, intensity){
  if(!audioCtx || !breathGain) return;
  const dur = THREE.MathUtils.lerp(0.9, 0.45, intensity);
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate*dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/d.length, 1.4);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const filt = audioCtx.createBiquadFilter(); filt.type='bandpass';
  filt.frequency.value = THREE.MathUtils.lerp(420, 620, intensity); filt.Q.value = 0.9;
  const g = audioCtx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(vol, audioCtx.currentTime+dur*0.35);
  g.gain.linearRampToValueAtTime(0, audioCtx.currentTime+dur);
  src.connect(filt); filt.connect(g); g.connect(breathGain);
  src.start(); src.stop(audioCtx.currentTime+dur+0.05);
}
