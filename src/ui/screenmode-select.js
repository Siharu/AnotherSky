// ---------- CUSTOM SCREEN MODE DROPDOWN ----------
// Visual-only layer over the real #settings-screenmode <select>, same
// shape as res-select.js (see that file's header comment for the full
// reasoning - the native OPEN dropdown list can't be restyled in any
// browser, so this div-based trigger + list replaces the visible
// interaction and keeps the hidden select in sync in both directions).
// Kept as its own small file rather than generalizing res-select.js into
// a shared helper - two ~90-line copies is a fine trade against a real
// abstraction for just two call sites, and each stays readable on its
// own without indirection.
//
// Import this AFTER systems/settings.js in main.js: settings.js owns
// #settings-screenmode's value (including syncing it to live fullscreen
// state on load), and this module reads that value on init to show the
// right item as selected.

const $ = id => document.getElementById(id);

const nativeSelect = $('settings-screenmode');
const root = $('screenmode-select');
const trigger = $('screenmode-select-trigger');
const triggerValue = trigger.querySelector('.custom-select-value');
const list = $('screenmode-select-options');
const options = Array.from(list.querySelectorAll('li[role="option"]'));

function syncFromNativeValue(){
  const val = nativeSelect.value;
  let matched = null;
  options.forEach(li=>{
    const isMatch = li.dataset.value === val;
    li.classList.toggle('selected', isMatch);
    li.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    if(isMatch) matched = li;
  });
  if(matched) triggerValue.textContent = matched.textContent.trim();
}

function open(){
  root.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
  const pending = list.querySelector('li.selected') || options[0];
  if(pending) pending.classList.add('pending');
}

function close(){
  root.classList.remove('open');
  trigger.setAttribute('aria-expanded', 'false');
  options.forEach(li=>li.classList.remove('pending'));
}

function isOpen(){ return root.classList.contains('open'); }

function choose(li){
  if(!li) return;
  if(nativeSelect.value !== li.dataset.value){
    nativeSelect.value = li.dataset.value;
    nativeSelect.dispatchEvent(new Event('change', { bubbles:true }));
  }
  syncFromNativeValue();
  close();
  trigger.focus();
}

trigger.addEventListener('click', ()=>{
  isOpen() ? close() : open();
});

list.addEventListener('click', e=>{
  const li = e.target.closest('li[role="option"]');
  if(li) choose(li);
});

trigger.addEventListener('keydown', e=>{
  if(e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    open();
    (list.querySelector('li.pending') || options[0])?.focus?.();
  }
});

list.addEventListener('keydown', e=>{
  const current = list.querySelector('li.pending') || list.querySelector('li.selected') || options[0];
  const idx = options.indexOf(current);
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    const next = options[Math.min(idx+1, options.length-1)];
    options.forEach(li=>li.classList.remove('pending'));
    next.classList.add('pending');
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    const prev = options[Math.max(idx-1, 0)];
    options.forEach(li=>li.classList.remove('pending'));
    prev.classList.add('pending');
  } else if(e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    choose(list.querySelector('li.pending'));
  } else if(e.key === 'Escape'){
    e.preventDefault();
    close();
    trigger.focus();
  }
});

document.addEventListener('click', e=>{
  if(isOpen() && !root.contains(e.target)) close();
});

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && isOpen()) close();
});

// nativeSelect's value is set by settings.js's syncScreenmodeFromBrowser()
// at import time (imported before this module, same ordering as
// res-select.js/settings.js) - read it now rather than defaulting to the
// first option.
syncFromNativeValue();

// settings.js dispatches 'change' on the native select whenever the
// browser's actual fullscreen state changes (e.g. the player hits Esc to
// leave fullscreen instead of using this dropdown) - listen for that so
// the themed trigger stays truthful even when it wasn't what changed it.
nativeSelect.addEventListener('change', syncFromNativeValue);
