/* ============================================================
   systems/quests.js — objective registry, referenced by name in
   several other files' comments (data/items.js, systems/inventory.js,
   systems/doors.js, ui/inventory.js) as if it already existed, but
   never actually created - ui/inventory.js has a real, live
   `import { getActiveQuests } from '../systems/quests.js'` line
   pointing at a file that didn't exist on disk. Same class of bug as
   the postprocessing.js incident noted elsewhere in the project's
   history: a missing module a real import statement depends on is a
   hard failure, not a stale comment - the browser's module loader
   rejects the whole graph (main.js -> ui/inventory.js -> here), so
   the modular build could not boot at all until this file existed.

   Same declarative registry shape as data/items.js (the file whose own
   header comment describes this file's intended shape most precisely):
   each entry resolves itself purely by reading flags that already
   exist on `state` - no new state fields, so objective status can't
   drift out of sync with what's actually true in the game.

   `label(state)` returns the short status word ui/inventory.js prints
   next to each objective row ("In Progress"/"Found"/etc.) - kept
   separate from `have(state)` (an active quest can have have:false and
   still show a specific in-progress label, not just a generic one). */

const QUESTS = [
  {
    id: 'find-radio',
    name(){ return 'Find a way to call for help'; },
    have(state){ return !!state.radioCollected; },
    label(state){ return state.radioCollected ? 'Found' : 'Searching'; },
  },
  {
    id: 'reach-tower',
    name(){ return 'Reach the relay tower'; },
    have(state){ return !!state.relayActive; },
    label(state){
      if(state.relayActive) return 'Online';
      return state.radioCollected ? 'In progress' : 'Not yet';
    },
  },
  {
    id: 'unlock-door',
    name(){ return 'Get back into the locked room'; },
    have(state){ return !!state.doorUnlocked; },
    label(state){
      if(state.doorUnlocked) return 'Unlocked';
      if(state.relayActive) return 'Now open';
      if(state.doorKeyStatus==='notHere') return 'Key not here';
      if(state.doorKeyStatus==='searching') return 'Searching';
      return 'Sealed';
    },
  },
];

// Objectives only start showing once the player has actually picked up
// the radio (the game's first real hook) - before that, printing "Reach
// the relay tower"/"Get back into the locked room" would spoil beats
// the player hasn't been introduced to yet. Each quest that does show
// stays visible afterward even once complete (have:true), same
// "still there so progress reads as progress" reasoning data/items.js
// uses for its own slots.
function getActiveQuests(state){
  if(!state.radioCollected) return [];
  return QUESTS.map(q => ({
    id: q.id,
    name: q.name(state),
    have: q.have(state),
    label: q.label(state),
  }));
}

export { QUESTS, getActiveQuests };
