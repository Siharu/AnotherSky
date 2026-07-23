// ---------- DIALOG (in-game confirm/alert, replaces browser confirm()/alert()) ----------
// Browser confirm()/alert() render as an OS-chrome popup stamped with the page's
// origin ("anothersky.vercel.app says...") - it breaks presence instantly, especially
// mid-scene. This is a drop-in async replacement styled like the rest of the game
// (same notched panel, --rust border, --font-mono label, --font-serif body) that
// resolves a Promise<boolean> the same way confirm() returns a bool, so call sites
// just add `await` and swap confirm(x) -> await gameConfirm(x). alert() has a
// single-button gameAlert() counterpart for the same reason.

let dialogEl, titleEl, bodyEl, okBtn, cancelBtn;
let resolveFn = null;

function ensureBuilt(){
  if(dialogEl) return;
  dialogEl = document.createElement('div');
  dialogEl.id = 'game-dialog-overlay';
  dialogEl.innerHTML = `
    <div class="game-dialog-panel notched">
      <div class="game-dialog-title"></div>
      <div class="game-dialog-body"></div>
      <div class="game-dialog-actions">
        <button type="button" class="game-dialog-btn game-dialog-cancel">CANCEL</button>
        <button type="button" class="game-dialog-btn game-dialog-ok">CONFIRM</button>
      </div>
    </div>`;
  document.body.appendChild(dialogEl);

  const style = document.createElement('style');
  style.textContent = `
    #game-dialog-overlay{
      position:fixed; inset:0; z-index:9999; display:none;
      align-items:center; justify-content:center;
      background:rgba(2,1,2,0.72); backdrop-filter:blur(2px);
      padding:24px;
    }
    #game-dialog-overlay.open{ display:flex; }
    .game-dialog-panel{
      width:min(420px, 100%); background:rgba(6,4,5,0.96);
      border:1px solid rgba(122,31,31,0.55); padding:22px 22px 18px;
      box-shadow:0 0 0 1px rgba(0,0,0,0.6), 0 10px 40px rgba(0,0,0,0.6);
    }
    .game-dialog-title{
      font-family:var(--font-mono); font-size:.62rem; letter-spacing:.24em;
      text-transform:uppercase; color:var(--rust-light); margin-bottom:10px;
    }
    .game-dialog-body{
      font-family:var(--font-serif); font-style:italic; font-size:.98rem;
      line-height:1.55; color:var(--bone); opacity:.9; margin-bottom:20px;
      white-space:pre-line;
    }
    .game-dialog-actions{ display:flex; justify-content:flex-end; gap:10px; }
    .game-dialog-btn{
      font-family:var(--font-mono); font-size:.68rem; letter-spacing:.14em;
      text-transform:uppercase; background:transparent; color:var(--bone);
      border:1px solid rgba(201,194,182,0.35); padding:9px 16px; cursor:pointer;
    }
    .game-dialog-btn:hover{ background:rgba(201,194,182,0.08); }
    .game-dialog-btn.game-dialog-ok{
      border-color:var(--rust); color:var(--rust-light);
    }
    .game-dialog-btn.game-dialog-ok:hover{ background:rgba(122,31,31,0.18); }
    .game-dialog-actions.single .game-dialog-cancel{ display:none; }
  `;
  document.head.appendChild(style);

  titleEl = dialogEl.querySelector('.game-dialog-title');
  bodyEl = dialogEl.querySelector('.game-dialog-body');
  okBtn = dialogEl.querySelector('.game-dialog-ok');
  cancelBtn = dialogEl.querySelector('.game-dialog-cancel');

  okBtn.addEventListener('click', ()=> settle(true));
  cancelBtn.addEventListener('click', ()=> settle(false));
  dialogEl.addEventListener('click', (e)=>{ if(e.target === dialogEl) settle(false); });
  document.addEventListener('keydown', (e)=>{
    if(!dialogEl.classList.contains('open')) return;
    if(e.key === 'Escape') settle(false);
    if(e.key === 'Enter') settle(true);
  });
}

function settle(result){
  if(!resolveFn) return;
  dialogEl.classList.remove('open');
  const r = resolveFn;
  resolveFn = null;
  r(result);
}

// Two-button confirm - resolves true (confirm) / false (cancel), same contract
// as window.confirm() so existing `if(confirm(...))` call sites just need
// `if(await gameConfirm(...))`.
export function gameConfirm(message, title = 'CONFIRM'){
  ensureBuilt();
  titleEl.textContent = title;
  bodyEl.textContent = message;
  okBtn.textContent = 'CONFIRM';
  dialogEl.querySelector('.game-dialog-actions').classList.remove('single');
  dialogEl.classList.add('open');
  return new Promise(res => { resolveFn = res; });
}

// Single-button alert - resolves once dismissed, for parity with window.alert().
export function gameAlert(message, title = 'NOTICE'){
  ensureBuilt();
  titleEl.textContent = title;
  bodyEl.textContent = message;
  okBtn.textContent = 'OK';
  dialogEl.querySelector('.game-dialog-actions').classList.add('single');
  dialogEl.classList.add('open');
  return new Promise(res => { resolveFn = res; });
}
