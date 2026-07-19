// ---------- RADIO LOG PANEL ----------
// Pulled verbatim from main.js. Pure render function - reads
// `state.radioLog` (core/state.js), writes innerHTML via `$`
// (utils/dom.js). Click-handler wiring stays in main.js.
import { $ } from '../utils/dom.js';
import { state } from '../core/state.js';

export function renderRadioLog(){
  const list = $('radiolog-list');
  list.innerHTML = '';
  if(!state.radioLog || !state.radioLog.length){
    list.innerHTML = '<div id="lore-empty">nothing received yet.</div>';
    return;
  }
  for(let i=state.radioLog.length-1;i>=0;i--){
    const entry = state.radioLog[i];
    const div = document.createElement('div');
    div.className = 'radiolog-entry' + (entry.warning ? ' warning' : '');
    const mins = Math.floor(entry.elapsed/60), secs = Math.floor(entry.elapsed%60);
    div.innerHTML = `<span class="rl-time">${mins}:${String(secs).padStart(2,'0')} in</span><span class="rl-text">${entry.text}</span>`;
    list.appendChild(div);
  }
}
