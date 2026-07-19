// ---------- HELP PANEL ----------
// Pulled verbatim from main.js. Pure function - only depends on `$`
// (from utils/dom.js) and `window.ontouchstart` detection. No state,
// no other systems. The click-handler wiring that opens/closes the
// help overlay and calls this stays in main.js (same pattern as other
// hub panels - the module exports the render function, main.js wires
// the DOM events that call it).
import { $ } from '../utils/dom.js';

export function renderHelp(){
  const touch = 'ontouchstart' in window;
  const content = $('help-content');
  if(touch){
    content.innerHTML = `
      <div class="help-section-title">Movement</div>
      <div class="help-row"><span class="help-key">Left side</span><span class="help-desc">drag to move</span></div>
      <div class="help-row"><span class="help-key">Right side</span><span class="help-desc">drag to look around</span></div>
      <div class="help-section-title">Actions</div>
      <div class="help-row"><span class="help-key">◎ button</span><span class="help-desc">interact (pick up, use, read)</span></div>
      <div class="help-row"><span class="help-key">≈ button</span><span class="help-desc">toggle the radio, once found</span></div>
      <div class="help-row"><span class="help-key">☰ button</span><span class="help-desc">open this menu</span></div>
      <div class="help-section-title">General</div>
      <div class="help-row"><span class="help-key">Autosave</span><span class="help-desc">progress saves automatically as you play</span></div>
      <div class="help-row"><span class="help-key">Notebook</span><span class="help-desc">write in it at the safehouse for a manual save</span></div>
    `;
  } else {
    content.innerHTML = `
      <div class="help-section-title">Movement</div>
      <div class="help-row"><span class="help-key">WASD / Arrows</span><span class="help-desc">move</span></div>
      <div class="help-row"><span class="help-key">Click + drag</span><span class="help-desc">look around</span></div>
      <div class="help-section-title">Actions</div>
      <div class="help-row"><span class="help-key">E</span><span class="help-desc">interact (pick up, use, read)</span></div>
      <div class="help-row"><span class="help-key">Radio icon</span><span class="help-desc">toggle the radio, once found</span></div>
      <div class="help-row"><span class="help-key">Esc</span><span class="help-desc">open this menu</span></div>
      <div class="help-section-title">General</div>
      <div class="help-row"><span class="help-key">Autosave</span><span class="help-desc">progress saves automatically as you play</span></div>
      <div class="help-row"><span class="help-key">Notebook</span><span class="help-desc">write in it at the safehouse for a manual save</span></div>
    `;
  }
}
