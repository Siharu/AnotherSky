// ---------- INVENTORY PANEL ----------
// Phase 3 - was a flat field-status text list (no real item-carrying
// system, by design comment that's no longer accurate). Rebuilt this
// round to actually feel like opening a bag: a grid of slot tiles
// (filled/empty), click a tile to inspect it in a detail line below the
// grid, same "select to read" interaction memories.js already uses for
// lore entries - not a new pattern, just applied here too. Objectives
// (from systems/quests.js) still render underneath as their own list -
// those are progress/status, not carryable items, so they stay a
// separate section rather than being crammed into the grid.
import { $ } from '../utils/dom.js';
import { state } from '../core/state.js';
import { getActiveQuests } from '../systems/quests.js';
import { getInventorySlots } from '../systems/inventory.js';

// which slot is currently shown in the detail line - module-level so it
// survives re-renders within the same panel session (closing/reopening
// the panel calls renderInventory() fresh each time, which resets this
// to null; see main.js's pause-inventory click handler)
let selectedSlotId = null;

export function renderInventory(){
  const list = $('inventory-list');
  const slots = getInventorySlots(state);

  // default selection: first item the player actually has, so opening
  // the bag with anything in it immediately shows something instead of
  // a blank detail line
  if(selectedSlotId==null || !slots.some(s=>s.id===selectedSlotId)){
    const firstHave = slots.find(s=>s.have);
    selectedSlotId = firstHave ? firstHave.id : null;
  }
  const selected = slots.find(s=>s.id===selectedSlotId) || null;

  const gridHtml = slots.map(s => `
    <div class="inv-slot ${s.have?'filled':'empty'} ${s.id===selectedSlotId?'selected':''}" data-slot-id="${s.id}" tabindex="0" role="button" title="${s.name}">
      <span class="inv-glyph">${s.have ? s.icon : '·'}</span>
    </div>
  `).join('');

  const detailHtml = selected ? `
    <div class="inv-detail ${selected.have?'inv-have':''}">
      <div class="inv-detail-name">${selected.name}</div>
      <div class="inv-detail-desc">${selected.description}</div>
    </div>
  ` : `<div class="inv-detail inv-detail-empty">Nothing selected.</div>`;

  const objectiveRows = getActiveQuests(state).map(q =>
    `<div class="inventory-row ${q.have?'inv-have':''}"><span class="inv-name">${q.name}</span><span class="inv-status">${q.label}</span></div>`
  ).join('');

  list.innerHTML = `
    <div class="inv-bag">
      <div class="inv-grid">${gridHtml}</div>
      ${detailHtml}
    </div>
    ${objectiveRows ? `<div class="inv-section-label">Objectives</div>${objectiveRows}` : ''}
  `;

  // click/keyboard select - event delegation on the grid, rebuilt fresh
  // every render since innerHTML above already tore down any prior
  // listeners along with the old nodes
  const grid = list.querySelector('.inv-grid');
  if(grid){
    grid.addEventListener('click', (e)=>{
      const tile = e.target.closest('.inv-slot');
      if(!tile) return;
      selectedSlotId = tile.dataset.slotId;
      renderInventory();
    });
    grid.addEventListener('keydown', (e)=>{
      if(e.key!=='Enter' && e.key!==' ') return;
      const tile = e.target.closest('.inv-slot');
      if(!tile) return;
      e.preventDefault();
      selectedSlotId = tile.dataset.slotId;
      renderInventory();
    });
  }
}