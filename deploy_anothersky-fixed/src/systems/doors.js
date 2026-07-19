/* ============================================================
   systems/doors.js — generalized teleport-door-pair transition
   system, Phase 3. Formalizes a pattern that already existed ad hoc:
   world/safehouse.js had one bespoke `updateSafehouseTransition()`
   hardcoded to exactly one pair of doors (the safehouse exterior
   shell <-> interior seam), with its own cooldown/trigger-radius
   logic duplicated inline. Same shape of fix as the quest system
   (see data/quests.js) - pull the reusable mechanics into one place so
   the next door pair (a second building interior, say) is a
   `registerDoorPair()` call instead of a second copy of this logic.

   Ownership split, same as quests: this file owns the *mechanics*
   (distance check, cooldown, position/yaw teleport) and knows nothing
   about visuals. Whoever registers a door pair supplies its own
   `onTeleport(direction)` callback for anything presentational (a
   flash, a sound, a line of dialogue) - that stays with the caller,
   same as `ui/inventory.js` owning how quest data renders rather than
   `systems/quests.js` knowing about DOM. */
import { state } from '../core/state.js';

const registeredDoors = [];

// registerDoorPair(cfg):
//   id            - string, unique-ish, useful for debugging/save data later
//   aTrigger/bTrigger - {x,z} world-space points that arm the teleport
//   aLanding/bLanding - {x,z,yaw?} where the player lands on each side
//   radius        - trigger distance, default 1.0 (matches the safehouse's
//                   original hardcoded 1.0)
//   cooldown      - seconds before either trigger can fire again after a
//                   teleport, default 1.2 (matches the original) - stops
//                   the player immediately re-triggering the pair they
//                   just landed near
//   onTeleport(direction) - optional, called with 'a-to-b' or 'b-to-a'
//                   right after the position/yaw are set
function registerDoorPair(cfg){
  const door = {
    id: cfg.id || `door_${registeredDoors.length}`,
    aTrigger: cfg.aTrigger, bTrigger: cfg.bTrigger,
    aLanding: cfg.aLanding, bLanding: cfg.bLanding,
    radius: cfg.radius != null ? cfg.radius : 1.0,
    cooldown: cfg.cooldown != null ? cfg.cooldown : 1.2,
    onTeleport: cfg.onTeleport || null,
    cooldownTimer: 0,
  };
  registeredDoors.push(door);
  return door;
}

function teleportTo(door, landing, direction){
  state.playerX = landing.x;
  state.playerZ = landing.z;
  if(landing.yaw != null) state.yaw = landing.yaw;
  door.cooldownTimer = door.cooldown;
  if(door.onTeleport) door.onTeleport(direction);
}

// updateDoorTransitions(dt) - call once per frame from the main loop.
// Ticks every registered pair's cooldown and checks both trigger points;
// early-returns per door after the first side that fires (a door pair
// can't fire both directions in the same frame - the teleport itself
// moves the player away from both triggers anyway).
function updateDoorTransitions(dt){
  for(const door of registeredDoors){
    if(door.cooldownTimer > 0){ door.cooldownTimer -= dt; continue; }
    const dA = Math.hypot(state.playerX-door.aTrigger.x, state.playerZ-door.aTrigger.z);
    if(dA < door.radius){ teleportTo(door, door.bLanding, 'a-to-b'); continue; }
    const dB = Math.hypot(state.playerX-door.bTrigger.x, state.playerZ-door.bTrigger.z);
    if(dB < door.radius){ teleportTo(door, door.aLanding, 'b-to-a'); continue; }
  }
}

export { registerDoorPair, updateDoorTransitions, registeredDoors };
