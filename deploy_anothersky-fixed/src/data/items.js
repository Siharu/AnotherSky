/* ============================================================
   data/items.js — item/inventory framework, Phase 3.

   Declarative registry, same shape as data/quests.js: each entry
   describes how to resolve itself against `state`, and owns zero state
   of its own - every `have(state)` check just reads flags that already
   exist elsewhere (state.radioCollected, state.minimapUnlocked, etc.),
   so there's no way for the bag's contents to drift out of sync with
   what's actually true in the game.

   Fragment slots (the 12 LORE memory pickups) are NOT listed here -
   they're generated from data/lore.js by systems/inventory.js, since
   there's no reason to hand-author 12 near-identical entries when the
   source list already exists. This file only covers the small set of
   named equipment items.

   icon is a single glyph (no image assets in this project), rendered
   large inside a bordered slot tile by ui/inventory.js - kept to
   plain unicode symbols that read at small size, not emoji (emoji
   would clash with the mono/serif torn-paper aesthetic everywhere
   else in the UI). */

const ITEMS = [
  {
    id: 'radio',
    icon: '▽',
    category: 'equipment',
    name(state){ return state.radioCollected ? 'WNCORE Radio' : 'WNCORE Radio'; },
    have(state){ return !!state.radioCollected; },
    description(state){
      if(!state.radioCollected) return 'Not yet found. Somewhere near where you woke up.';
      return state.radioOn
        ? 'Currently on. Keep it close - it\'s the only thing standing between you and total silence.'
        : 'Off for now. Switch it on to pick up whatever\'s still broadcasting.';
    },
  },
  {
    id: 'notebook',
    icon: '▤',
    category: 'equipment',
    name(){ return 'Field Notebook'; },
    have(){ return true; }, // always carried - this is the manual-save interactable
    description(){ return 'Every entry you write yourself. Sits on the table back at the safehouse.'; },
  },
  {
    id: 'minimap',
    icon: '▦',
    category: 'equipment',
    name(){ return 'Minimap Access'; },
    have(state){ return !!state.minimapUnlocked; },
    description(state){
      if(!state.minimapUnlocked) return 'Locked. The relay tower is supposed to fix that.';
      return 'Unlocked. The corner of the HUD will keep drawing the streets around you now.';
    },
  },
];

export { ITEMS };
