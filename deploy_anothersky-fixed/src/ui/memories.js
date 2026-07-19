// ---------- MEMORIES PANEL ----------
// Pulled verbatim from main.js. Pure render function - reads `state`
// (core/state.js) and `LORE` (data/lore.js), writes innerHTML via `$`
// (utils/dom.js). Click-handler wiring stays in main.js, same pattern
// as ui/help.js.
import { $ } from '../utils/dom.js';
import { state } from '../core/state.js';
import { LORE } from '../data/lore.js';

export function renderMemories(){
  const list = $('memories-list');
  $('memories-progress').textContent = `${state.collected.size} / ${LORE.length} remembered`;
  list.innerHTML = '';
  for(const entry of LORE){
    const div = document.createElement('div');
    if(state.collected.has(entry.id)){
      div.className = 'lore-entry';
      div.innerHTML = `<h3>${entry.title}</h3><p>${entry.text}</p>`;
    } else {
      div.className = 'lore-entry locked';
      div.innerHTML = `<h3><span class="redacted" data-text="? ? ? ? ?"></span></h3><p style="opacity:.3">not yet remembered.</p>`;
    }
    list.appendChild(div);
  }
}
