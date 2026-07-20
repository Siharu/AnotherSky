// ---------- CUSTOM RESOLUTION DROPDOWN ----------
// Visual-only layer over the real #settings-res <select> (see that
// element's comment in index.html). This module never owns resolution
// state itself - it just keeps the themed trigger/list in the DOM in
// sync with the hidden select in both directions, and dispatches a real
// 'change' event on the hidden select so systems/settings.js's existing
// listener does all the actual work (applyResolution + saveSettings)
// completely unchanged.
//
// Import this AFTER systems/settings.js in main.js: settings.js sets
// settingsRes.value from the persisted setting at import time, and this
// module reads that value on init to show the right item as selected
// instead of always defaulting to "Native".

const $ = id => document.getElementById(id);

const nativeSelect = $('settings-res');
const root = $('res-select');
const trigger = $('res-select-trigger');
const triggerValue = trigger.querySelector('.custom-select-value');
const list = $('res-select-options');
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
  if(matched) triggerValue.textContent = matched.textContent.replace(/\s*—.*$/, '').trim();
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

syncFromNativeValue();
