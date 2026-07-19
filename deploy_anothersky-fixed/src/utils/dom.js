// ---------- DOM HELPERS ----------
// Tiny, dependency-free. Safe to import anywhere in the UI layer.

export const $ = id => document.getElementById(id);

// Reads the vibration setting straight from localStorage rather than
// importing systems/settings.js, which would pull in core/scene.js,
// core/state.js, systems/audio.js, systems/save.js, and ui/menu.js -
// far outside what this file's own header comment promises ("tiny,
// dependency-free, safe to import anywhere"). Key/shape has to be kept
// in sync with settings.js's own SETTINGS_KEY/saveSettings() by hand
// since there's no shared import to keep them automatically in sync -
// acceptable tradeoff for keeping this file genuinely dependency-free.
function vibrationEnabled(){
  try{
    const raw = localStorage.getItem('anothersky_settings_v1');
    if(!raw) return true; // default on, matches settings.js's own default
    const s = JSON.parse(raw);
    return s.vibration !== false;
  }catch(e){ return true; }
}

// Shared "corrupted button press" feedback - removes+re-adds the
// .btn-corrupt class (forces reflow so the animation restarts even on
// rapid repeat clicks) and fires a short haptic pulse where supported.
// Used by every menu/HUD button across ui/*.js.
export function corruptPress(el){
  if(!el) return;
  el.classList.remove('btn-corrupt'); void el.offsetWidth;
  el.classList.add('btn-corrupt');
  setTimeout(()=> el.classList.remove('btn-corrupt'), 240);
  if(vibrationEnabled() && navigator.vibrate){ try{ navigator.vibrate(8); }catch(e){} }
}
