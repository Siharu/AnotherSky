// ---------- SAVE / LOAD ----------
// Scoped down from the ARCHITECTURE.md table, same pattern as
// sky.js/terrain.js/hud.js: `restoreFromSave()` is a genuine
// cross-cutting function - it touches `orbMeshes`/`scene` (world-gen),
// `radioPickupMesh`/`radioBtn`, `initAudio()`/`audioCtx` (audio init),
// `titleScreen`/`hud`/`titleScreenActive`/`clock` (title
// sequence + main loop state) - none of which have a module home yet.
// Pulling it now would need to reach back into main.js for nearly all
// of that, the same circular-import trap blocking world-gen/hud's
// minimap. `manualSave()` also stays - it calls `showLineBox()`, a
// main.js-internal function (not yet extracted).
//
// What's actually here: `hasSave()`, `writeSave()`, `deleteSave()`,
// `updateRegainAvailability()`, `tickAutosave()` - the pieces that only
// touch `state`, `localStorage`, and simple DOM refs. `writeSave()`
// already imports `flashAutosaveIndicator` from the real `ui/hud.js`
// module. `SAVE_KEY` is exported since main.js still reads it directly
// in a couple of spots (checking for raw save data before calling the
// still-local `restoreFromSave()`).
//
// Still owed once world-gen/audio-init/title-sequence have real module
// homes: `restoreFromSave()`, `manualSave()`.
import { $ } from '../utils/dom.js';
import { state } from '../core/state.js';
import { HALLWAY_SPAWN_POS } from '../world/safehouse.js';
import { flashAutosaveIndicator } from '../ui/hud.js';

export const SAVE_KEY = 'anothersky_save_v1';

// Save-data versioning. SAVE_KEY's own "_v1" suffix was the only
// versioning that existed before this - which meant the only way to
// handle a save-shape change was to bump the key and orphan every
// existing save, rather than actually migrate them forward. Real
// versioning lives inside the payload instead: every save now carries
// its own saveVersion, and migrateSave() runs it through a migration
// chain (each step upgrades exactly one version) before anything reads
// its fields. Saves written before this change have no saveVersion
// field at all - treated as version 0 below.
//
// To add a save-shape-breaking change in the future: bump
// CURRENT_SAVE_VERSION, and add a `if(v === N)` step to the chain in
// migrateSave() that transforms an (N)-shaped save into an (N+1)-shaped
// one. Don't skip versions - each step should only know about the one
// version immediately before it, so the chain stays composable instead
// of every step needing to know every past shape.
export const CURRENT_SAVE_VERSION = 2;

export function migrateSave(save){
  let v = save.saveVersion || 0;
  // v0 -> v1: no real shape change yet, saveVersion just didn't exist.
  // restoreFromSave()'s existing `||`/`!=null`/`!!` fallbacks already
  // handle every field being absent on a v0 save, so this step is a
  // deliberate no-op - it exists so the chain has a documented starting
  // point once a real v1->v2 step gets added later, instead of that
  // future step having to also account for "or no version at all".
  if(v === 0){ v = 1; }
  // v1 -> v2: the safehouse interior was rebuilt from the old six-room
  // layout into the NW/NE/SW/SE room grid (see world/safehouse.js's
  // header comment) - completely different wall geometry at the same
  // world-space footprint. A v1 save's playerX/playerZ was a valid
  // standing position in the OLD rooms, but has no guarantee of being
  // clear of a wall/door in the NEW grid (this is what "spawning inside
  // the locked door" on Continue turned out to be - not a fresh-spawn
  // bug, a stale-save-position bug). Rather than trying to guess which
  // old coordinates happen to still be safe, just re-place any pre-
  // rewrite save at the same safe hallway point a fresh game starts at -
  // matches main.js's own spawn (HALLWAY_SPAWN_POS), outside the sealed
  // wake-up room rather than inside it.
  if(v === 1){
    if(typeof save.playerX === 'number' && typeof save.playerZ === 'number'){
      save.playerX = HALLWAY_SPAWN_POS.x;
      save.playerZ = HALLWAY_SPAWN_POS.z;
    }
    v = 2;
  }
  save.saveVersion = v;
  return save;
}

export function hasSave(){
  try{ return !!localStorage.getItem(SAVE_KEY); }catch(e){ return false; }
}

export function writeSave(indicatorLabel){
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      saveVersion: CURRENT_SAVE_VERSION,
      playerX: state.playerX, playerZ: state.playerZ, yaw: state.yaw,
      collected: [...state.collected], radioCollected: state.radioCollected,
      firstBroadcastDone: state.firstBroadcastDone,
      doorwayLightSeen: state.doorwayLightSeen,
      insightGlimpseShown: state.insightGlimpseShown,
      calendarRead: state.calendarRead,
      storageDrawerOpened: state.storageDrawerOpened,
      minimapUnlocked: state.minimapUnlocked, dread: state.dread,
      sanity: state.sanity, forgetting: state.forgetting,
      elapsed: state.elapsed, skyWrongness: state.skyWrongness,
      radioLog: state.radioLog,
      notebookEntriesShown: state.notebookEntriesShown,
      triedLockedDoor: state.triedLockedDoor, doorKeyStatus: state.doorKeyStatus,
      relayActive: state.relayActive, relayLineShown: state.relayLineShown,
      returnCueShown: state.returnCueShown, doorUnlocked: state.doorUnlocked,
      enteredMap2: state.enteredMap2,
      relayTowersConnected: [...state.relayTowersConnected],
      hqTowerUnlocked: state.hqTowerUnlocked, tvStage: state.tvStage,
      ts: Date.now()
    }));
    flashAutosaveIndicator(indicatorLabel);
  }catch(e){ /* storage unavailable/full - saving silently fails rather than breaking play */ }
}

export function updateRegainAvailability(){
  const btn = $('menu-regain');
  if(btn) btn.classList.toggle('disabled', !hasSave());
}

export function deleteSave(){
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  updateRegainAvailability();
}

// autosave: after anything that actually matters (lore pickup, radio
// pickup) plus a periodic tick, rather than every frame
const AUTOSAVE_INTERVAL = 20*60; // 20 minutes - periodic tick only; pickup events save immediately regardless
let autosaveTimer = AUTOSAVE_INTERVAL;

export function tickAutosave(dt){
  if(!state.started) return;
  if(!state.autosaveEnabled) return; // periodic tick only - checkpoint/pickup writeSave() calls elsewhere always fire regardless, same as they always did
  autosaveTimer -= dt;
  if(autosaveTimer<=0){ autosaveTimer = AUTOSAVE_INTERVAL; writeSave(); }
}
