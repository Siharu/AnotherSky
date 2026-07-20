// ---------- PLAYER ----------
// Real module (Wave 3, final stub of the migration). Extracted from
// anothersky-horror.html / src/main.js per docs/ARCHITECTURE.md. See
// docs/HANDOFF.md for scope reasoning.
//
// This was flagged from the start as the highest-fan-out file of the six
// remaining stubs, and it held up: updatePlayer() calls updateCompass(),
// updatePlayerVoice(), and updateRadioTower() inline, and reads/writes
// half a dozen module-scope vars (keys, _tmpForward/_tmpRight/Y_AXIS,
// lastStepPhase, orbMeshes, RADIO_TOWER_POS) that had no home before
// this pull. Scope decision: updatePlayer() itself moves (that's the
// stub's actual target - "updatePlayer(), input reading, movement
// application"); updateCompass/updatePlayerVoice/updateRadioTower do
// NOT move with it - they're their own systems (compass-lies-at-low-
// sanity, player vocalizations, radio-tower beacon) that just happen to
// be *called from* updatePlayer, not owned by it. Moving them here on
// the coattails of this pull would repeat the same "false cohesion"
// mistake flagged for ui/menu.js's button-wiring last round.
//
// keys/_tmpForward/_tmpRight/Y_AXIS/orbMeshes/RADIO_TOWER_POS and the
// three functions above are all now exported from main.js and imported
// back here - a live circular import (main.js imports updatePlayer from
// here; this file imports those seven back from main.js), same
// established shape as dread.js/titleScreen.js/safehouse.js. `THREE` is
// a global (classic <script> tag), same as everywhere else.
//
// lastStepPhase moved here outright (not re-exported from main.js) since
// updatePlayer() was its only reader/writer - no reason to leave it
// behind as a stranded export.

import { state, EYE_HEIGHT, SPEED } from '../core/state.js';
import { camera } from '../core/scene.js';
import { groundHeightAt } from '../world/terrain.js';
import { obstacles } from '../world/worldData.js';
import { resolveCollisions } from '../systems/collision.js';
import { updateDoorTransitions } from '../systems/doors.js';
import { updateWorldStream } from '../world/streaming.js';
import { updateFowAt } from '../ui/bigmap.js';
import { updateMinimap } from '../ui/hud.js';
import { playWetFootstep } from '../systems/audio.js';
// keys/_tmpForward/_tmpRight/Y_AXIS/orbMeshes/RADIO_TOWER_POS and the
// three functions above come in via registerPlayerRefs(), called once
// from main.js after they exist, instead of a static import back into
// main.js - same fix as titleScreen.js's HOTFIX #5 (see that file's
// header), applied here before this cycle had a chance to cause the
// same persistent-TDZ/frame-killing-lag bug in the single hottest path
// in the game (updatePlayer runs every frame). getRadioPickupMesh stays
// a function, same reasoning as titleScreen.js - it's a `let` in main.js
// that's reassigned repeatedly (built once, nulled on pickup), so a
// snapshot taken at registration time would go stale. Everything else
// here (keys, _tmpForward, _tmpRight, Y_AXIS, orbMeshes, RADIO_TOWER_POS)
// is an `export const` in main.js that's mutated in place but never
// reassigned, so a one-time reference is safe to hold onto directly.
let keys = {}, _tmpForward = null, _tmpRight = null, Y_AXIS = null;
let orbMeshes = [], RADIO_TOWER_POS = null, RADIO_PICKUP_POS = null;
let getRadioPickupMesh = () => null;
let updateCompass = () => {}, updatePlayerVoice = () => {}, updateRadioTower = () => {};
export function registerPlayerRefs(refs){
  keys = refs.keys;
  _tmpForward = refs._tmpForward;
  _tmpRight = refs._tmpRight;
  Y_AXIS = refs.Y_AXIS;
  orbMeshes = refs.orbMeshes;
  RADIO_TOWER_POS = refs.RADIO_TOWER_POS;
  RADIO_PICKUP_POS = refs.RADIO_PICKUP_POS;
  getRadioPickupMesh = refs.getRadioPickupMesh;
  updateCompass = refs.updateCompass;
  updatePlayerVoice = refs.updatePlayerVoice;
  updateRadioTower = refs.updateRadioTower;
}

let lastStepPhase = -1;

export function updatePlayer(dt){
  let mx = state.moveJoystick.x + (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0);
  let my = state.moveJoystick.y + (keys['KeyW']||keys['ArrowUp']?1:0) - (keys['KeyS']||keys['ArrowDown']?1:0);
  const len = Math.hypot(mx,my);
  if(len>1){ mx/=len; my/=len; }
  const moving = len>0.05;
  // idle tracking - one of the two ways the sky-curdle event can fire (see
  // updateSky). Only counts once the wake sequence is actually over, so
  // standing on the title screen doesn't burn idle time before the player
  // could even move.
  if(state.started){
    if(moving) state.idleTimer = 0; else state.idleTimer += dt;
  }

  const targetNoise = len*0.85;
  state.noise += (targetNoise-state.noise) * Math.min(1, dt*3);

  _tmpForward.set(0,0,-1).applyAxisAngle(Y_AXIS, state.yaw);
  _tmpRight.set(1,0,0).applyAxisAngle(Y_AXIS, state.yaw);

  let nx = state.playerX + (_tmpRight.x*mx + _tmpForward.x*my)*SPEED*dt + state.knockback.x*dt;
  let nz = state.playerZ + (_tmpRight.z*mx + _tmpForward.z*my)*SPEED*dt + state.knockback.z*dt;
  [nx,nz] = resolveCollisions(nx,nz,obstacles);
  state.playerX = nx; state.playerZ = nz;
  updateDoorTransitions(dt);
  // decaying impulse - a shove reads as a shove only if it fades out fast
  const kbDecay = Math.max(0, 1 - dt*4.5);
  state.knockback.x *= kbDecay;
  state.knockback.z *= kbDecay;
  updateWorldStream();
  updateFowAt(state.playerX, state.playerZ);

  if(moving) state.walkTime += dt*7.5;
  if(moving){
    const stepPhase = Math.floor(state.walkTime/Math.PI);
    if(stepPhase !== lastStepPhase){
      lastStepPhase = stepPhase;
      playWetFootstep();
    }
  }
  const bob = moving ? Math.sin(state.walkTime)*0.045 : 0;
  // violent shaking once forgetting has taken hold, on top of the base
  // proximity-driven shake - this is the "everything starts shaking unless
  // you recall why you're here" escalation.
  const violentShake = state.forgetting>0.55 ? (state.forgetting-0.55)/0.45 : 0;
  const shakeAmt = state.dread*0.02 + violentShake*violentShake*0.5 + state.breachShake*state.breachShake*0.35;
  const shakeX = (Math.random()-0.5)*shakeAmt;
  const shakeY = (Math.random()-0.5)*shakeAmt;

  // wind sway - a slow sinusoidal drift plus gust-driven lean, so wind reads
  // as a physical force pushing on the player rather than just moving rain.
  const windMag = Math.hypot(state.windX, state.windZ);
  const windSway = Math.sin(performance.now()*0.00035)*0.006*windMag;
  const gustLean = state.windGust*0.035;
  const swayX = windSway*state.windX + gustLean*state.windX;
  const swayZ = windSway*state.windZ + gustLean*state.windZ;

  const groundY = groundHeightAt(state.playerX, state.playerZ);
  camera.position.set(
    state.playerX + shakeX + swayX,
    groundY + EYE_HEIGHT + bob + shakeY,
    state.playerZ + swayZ
  );
  camera.rotation.set(
    state.pitch + gustLean*0.4 + (Math.random()-0.5)*violentShake*0.03,
    state.yaw + (Math.random()-0.5)*violentShake*0.04,
    gustLean*0.6
  );

  updateCompass();
  updatePlayerVoice(dt);
  updateRadioTower(dt);
  updateMinimap(getRadioPickupMesh(), orbMeshes, RADIO_PICKUP_POS, RADIO_TOWER_POS);
}