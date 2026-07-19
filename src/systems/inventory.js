/* ============================================================
   systems/inventory.js — item/inventory framework, Phase 3.
   Same split as systems/quests.js: this file has no state of its own,
   it just resolves data/items.js + data/lore.js against the live
   `state` object into one flat list of bag slots. ui/inventory.js reads
   that list to render; it doesn't need to know equipment items and
   fragment items come from two different sources. */
import { ITEMS } from '../data/items.js';
import { LORE } from '../data/lore.js';

// getInventorySlots(state) -> [{id, icon, name, have, description, category}, ...]
// Equipment items first (registry order), then one slot per LORE entry
// in id order. Uncollected fragments render as a deliberately vague
// "unknown fragment" slot - have=false, but still present as an empty
// silhouette in the grid, not just absent - so the bag visibly shows
// how much is still out there rather than only what's already found.
function getInventorySlots(state){
  const slots = ITEMS.map(item => ({
    id: item.id,
    icon: item.icon,
    category: item.category,
    name: item.name(state),
    have: item.have(state),
    description: item.description(state),
  }));
  for(const entry of LORE){
    const have = state.collected.has(entry.id);
    slots.push({
      id: `fragment_${entry.id}`,
      icon: '♦',
      category: 'fragment',
      name: have ? entry.title : 'Unknown Fragment',
      have,
      description: have ? entry.text : 'Not yet recovered. Somewhere out there, torn and propped against a stand.',
    });
  }
  return slots;
}

export { getInventorySlots };
