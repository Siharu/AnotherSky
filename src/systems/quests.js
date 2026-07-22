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

// Objective text was flatly instructional before this pass ("Find a way
// to call for help" / "Reach the relay tower") - functionally correct,
// but it told the player what to do without ever making them wonder why.
// Rewritten in the same found-transmission voice as data/dialogue.js's
// radio lines (lowercase, ellipsis-led, withholding rather than
// explaining) so the objective panel reads as one more fragment of the
// world rather than a UI layer sitting outside it. Mechanics (id/have/
// label wiring, what each entry reads off `state`) are unchanged -
// this is a text-only pass.
const QUESTS = [
  {
    id: 'find-radio',
    name(){ return 'something out there is still transmitting'; },
    have(state){ return !!state.radioCollected; },
    label(state){ return state.radioCollected ? 'found' : 'searching'; },
  },
  {
    id: 'reach-tower',
    name(){ return 'the mast on the ridge — they can\'t find you until you find it'; },
    have(state){ return !!state.relayActive; },
    label(state){
      if(state.relayActive) return 'online';
      return state.radioCollected ? 'in progress' : 'not yet';
    },
  },
  {
    id: 'unlock-door',
    name(){ return 'the locked room wasn\'t locked with a key'; },
    have(state){ return !!state.doorUnlocked; },
    label(state){
      if(state.doorUnlocked) return 'open';
      if(state.relayActive) return 'now open';
      if(state.doorKeyStatus==='notHere') return 'not the key';
      if(state.doorKeyStatus==='searching') return 'searching';
      return 'sealed';
    },
  },
  {
    id: 'leave-downtown',
    name(){ return 'that light isn\'t yours to walk toward — the road out is'; },
    have(state){ return !!state.enteredMap2; },
    label(state){
      if(state.enteredMap2) return 'gone';
      return state.doorwayLightSeen ? 'walking' : 'not yet';
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
