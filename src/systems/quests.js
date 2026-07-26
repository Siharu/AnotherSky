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
//
// `thought(state)` - added alongside `name`/`label`, not replacing
// either. `name` stays the found-transmission voice (external, what's
// literally out there); `thought` is the character's own head talking
// back to it - first person, uncertain, a little afraid to say the
// quiet part. ui/hud.js shows this on tap/click of the current
// objective row, styled as an interior aside rather than a detail
// panel, so "more info" reads as the character thinking harder about
// it rather than a wiki entry opening. Same have(state)-gated branching
// as label() - the thought should shift once the objective's state
// changes, same as everything else here.
// LORE.length gives the true fragment total instead of a hardcoded
// number that would silently drift out of sync if data/lore.js ever
// gains or loses an entry.
import { LORE } from '../data/lore.js';

const QUESTS = [
  {
    id: 'find-radio',
    name(){ return 'something out there is still transmitting'; },
    have(state){ return !!state.radioCollected; },
    label(state){ return state.radioCollected ? 'found' : 'searching'; },
    thought(state){
      return state.radioCollected
        ? "i shouldn't have picked it up. i did anyway."
        : "something's making that sound. i keep telling myself it's the wind.";
    },
  },
  {
    id: 'reach-tower',
    name(){ return 'the mast on the ridge — they can\'t find you until you find it'; },
    have(state){ return !!state.relayActive; },
    label(state){
      if(state.relayActive) return 'online';
      return state.radioCollected ? 'in progress' : 'not yet';
    },
    thought(state){
      if(state.relayActive) return "it's talking again. i don't know if that's good.";
      return state.radioCollected
        ? "if i get to the ridge, someone answers. that's what i keep telling myself."
        : "there's a shape on the ridge that doesn't move. i noticed it before i wanted to.";
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
    thought(state){
      if(state.doorUnlocked) return "it opened on its own. i wish it hadn't.";
      if(state.relayActive) return "it's not locked anymore. i haven't gone back to check.";
      if(state.doorKeyStatus==='notHere') return "wrong key. of course it's the wrong key.";
      if(state.doorKeyStatus==='searching') return "there has to be a key somewhere in this house.";
      return "i tried it twice already. it wasn't ever locked with a key.";
    },
  },
  {
    id: 'connect-relays',
    name(){ return 'not just the one on the ridge — there are more of these masts standing dead out there'; },
    have(state){ return state.hqTowerUnlocked; },
    label(state){
      const total = state.deadRelayTowers.length || 8;
      const done = state.relayTowersConnected.size;
      if(state.hqTowerUnlocked) return 'all connected';
      if(done > 0) return `${done}/${total} connected`;
      return state.doorUnlocked ? 'in progress' : 'not yet';
    },
    thought(state){
      const done = state.relayTowersConnected.size;
      if(state.hqTowerUnlocked) return "all of them, lit. i don't feel found. i feel located.";
      if(done > 0) return "every one i wake up, something else wakes up with it.";
      return state.doorUnlocked ? "there are more of these out there. i can feel it." : "one mast can't be the only one. there's never just one.";
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
    thought(state){
      if(state.enteredMap2) return "i didn't look back at it. i want credit for that.";
      return state.doorwayLightSeen
        ? "it's warm-looking, that light. that's exactly why i shouldn't go to it."
        : "there's a road out of here. i haven't let myself look for it yet.";
    },
  },
  {
    id: 'collect-memories',
    name(){ return 'pages that aren\'t in the notebook - pick up whatever\'s still lying around'; },
    have(state){ return state.collected.size >= LORE.length; },
    label(state){
      if(state.collected.size >= LORE.length) return 'all found';
      if(state.collected.size > 0) return `${state.collected.size}/${LORE.length} found`;
      return 'none yet';
    },
    thought(state){
      if(state.collected.size >= LORE.length) return "that's all of them. i remember all of it now. i wish i didn't.";
      if(state.collected.size > 0) return "each page i find, i remember something i didn't ask to.";
      return "there are pages of this missing. my handwriting, pages i don't remember writing.";
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
    thought: q.thought(state),
  }));
}

export { QUESTS, getActiveQuests };
