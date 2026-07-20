// ---------- MENU HUB (core) ----------
// Rebuilt clean (this round) after the previous gameHasBegun-boolean
// version turned out to be the actual cause of "menu button does
// nothing": that flag had to be hand-set to true from three separate
// call sites (restoreFromSave, the wake sequence, its anime.js
// fallback), and if any of those three didn't run - or ran an
// error-throwing code path before reaching the flip - openHub()'s
// guard just silently no-op'd forever with zero feedback.
//
// This version drops the shadow variable entirely. Instead, "has the
// game actually started" is read straight off the HUD element's own
// 'visible' class at the moment of the click - that class is the same
// signal every begin/restore/regain path already sets right when
// gameplay visually starts, so there's nothing new to keep in sync, and
// nothing to silently forget to flip. If the HUD is visible, the menu
// can open. That's the whole rule.
//
// Scope kept deliberately narrow: this file owns hubOverlay,
// hubOpen, openHub()/closeHub(), and showHubFlavor() -
// the self-contained "is the menu hub open" state machine. The
// individual hub-button click handlers (settings/load/quit/memories/
// radiolog/inventory/help) and the Escape-key priority chain are NOT
// moved here - they reach into settings.js, save.js, memories/radiolog/
// inventory/help.js, bigmap.js, and credits.js all at once, none of
// which this file otherwise needs. That wiring stays in main.js as
// app-level orchestration rather than being force-fit into "menu"
// ownership it doesn't actually have.
//
// hud/bigmapOverlay are resolved locally via document.getElementById
// rather than imported - main.js's own copies aren't exported bindings
// (same reasoning safehouse.js used for vignetteEl).

const $ = id => document.getElementById(id);

export const hubOverlay = $('hub-overlay');
const bigmapOverlay = $('bigmap-overlay');
const hud = $('hud');

export function isGameplayActive(){
  return !!(hud && hud.classList.contains('visible'));
}

export let hubOpen = false;

export function openHub(){
  if(!isGameplayActive()){ console.warn('[menu] hub-btn click ignored: HUD is not visible yet (game hasn\'t started)'); return; }
  if(hubOpen) return;
  if(bigmapOverlay && bigmapOverlay.classList.contains('open')) return; // don't stack over the map
  hubOpen = true;
  hubOverlay.classList.add('open');
}

export function closeHub(){
  hubOverlay.classList.remove('open');
  hubOpen = false;
}

export function showHubFlavor(text){
  const el = $('hub-flavor');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showHubFlavor._t);
  showHubFlavor._t = setTimeout(()=> el.classList.remove('show'), 3000);
}