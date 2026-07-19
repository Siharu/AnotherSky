// ---------- PAUSE MENU (core) ----------
// Rebuilt clean (this round) after the previous gameHasBegun-boolean
// version turned out to be the actual cause of "menu button does
// nothing": that flag had to be hand-set to true from three separate
// call sites (restoreFromSave, the wake sequence, its anime.js
// fallback), and if any of those three didn't run - or ran an
// error-throwing code path before reaching the flip - openPauseMenu()'s
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
// Scope kept deliberately narrow: this file owns pauseOverlay,
// pauseMenuOpen, openPauseMenu()/closePauseMenu(), and pauseFlavor() -
// the self-contained "is the pause menu open" state machine. The
// individual pause-button click handlers (settings/load/quit/memories/
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

export const pauseOverlay = $('pause-overlay');
const bigmapOverlay = $('bigmap-overlay');
const hud = $('hud');

export function isGameplayActive(){
  return !!(hud && hud.classList.contains('visible'));
}

export let pauseMenuOpen = false;

export function openPauseMenu(){
  if(!isGameplayActive()){ console.warn('[menu] pause-btn click ignored: HUD is not visible yet (game hasn\'t started)'); return; }
  if(pauseMenuOpen) return;
  if(bigmapOverlay && bigmapOverlay.classList.contains('open')) return; // don't stack over the map
  pauseMenuOpen = true;
  pauseOverlay.classList.add('open');
}

export function closePauseMenu(){
  pauseOverlay.classList.remove('open');
  pauseMenuOpen = false;
}

export function pauseFlavor(text){
  const el = $('pause-flavor');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(pauseFlavor._t);
  pauseFlavor._t = setTimeout(()=> el.classList.remove('show'), 3000);
}
