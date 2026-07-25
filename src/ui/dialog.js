// ---------- DIALOG (in-game confirm/alert, replaces browser confirm()/alert()) ----------
// Browser confirm()/alert() render as an OS-chrome popup stamped with the page's
// origin ("anothersky.vercel.app says...") - it breaks presence instantly, especially
// mid-scene. This is a drop-in async replacement styled like the rest of the game
// (same notched panel, --rust border, --font-mono label, --font-serif body) that
// resolves a Promise<boolean> the same way confirm() returns a bool, so call sites
// just add `await` and swap confirm(x) -> await gameConfirm(x). alert() has a
// single-button gameAlert() counterpart for the same reason.

// Ransom-note text: splits into words, occasionally swapping one into a
// mismatched typeface from the game's existing rn-f0..rn-f6 pool (same
// fonts main.js's own ransomize() uses for pickup lines/menu labels).
// Was: every single word got a random font/rotation/size - correct
// ransom-note logic, but on a full paragraph of body text that's a wall of
// noise, not dread (screenshot feedback: "hurts my eyes"). Restrained to
// occasional intrusions instead: most words stay in the dialog's own
// plain italic serif, and only a minority get pulled into a wrong font -
// reads as a few words are somehow not right, unsettling, rather than the
// whole sentence being visibly cut-and-pasted. Rotation/size jitter also
// pulled way back for the same reason - a slight, quiet wrongness, not a
// crooked scrapbook. Kept as a small local copy rather than importing
// main.js's version - main.js imports THIS module, so importing back
// would be circular; this pool only needs the DOM classes, not any shared
// state, so duplicating the logic is simpler than restructuring the
// export graph for it.
const RANSOM_FONTS = ['rn-f0','rn-f2','rn-f3','rn-f6']; // trimmed from the full pool - dropped the brighter/busier faces (news italic, courier2) that read more "tabloid" than "wrong"
const RANSOM_WORD_CHANCE = 0.22; // was every word (1.0) - most words now stay put
function ransomizeDialogText(el){
  const words = el.textContent.split(/(\s+)/);
  el.innerHTML = '';
  words.forEach(tok=>{
    if(tok.trim()===''){ el.appendChild(document.createTextNode(tok)); return; }
    if(Math.random() >= RANSOM_WORD_CHANCE){ el.appendChild(document.createTextNode(tok)); return; }
    const span = document.createElement('span');
    span.className = 'rn-word ' + RANSOM_FONTS[Math.floor(Math.random()*RANSOM_FONTS.length)];
    span.textContent = tok;
    const rot = (Math.random()*3-1.5).toFixed(1);
    const ty = (Math.random()*2-1).toFixed(1);
    const sizePct = (96+Math.random()*10).toFixed(0);
    span.style.fontSize = sizePct + '%';
    span.style.transform = `rotate(${rot}deg) translateY(${ty}px)`;
    el.appendChild(span);
  });
}

let dialogEl, titleEl, bodyEl, okBtn, cancelBtn;
let resolveFn = null;

function ensureBuilt(){
  if(dialogEl) return;
  dialogEl = document.createElement('div');
  dialogEl.id = 'game-dialog-overlay';
  dialogEl.innerHTML = `
    <div class="game-dialog-panel notched">
      <span class="gd-corner gd-tl"></span>
      <span class="gd-corner gd-tr"></span>
      <span class="gd-corner gd-bl"></span>
      <span class="gd-corner gd-br"></span>
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
      position:relative; overflow:hidden;
      width:min(420px, 100%); background:rgba(6,4,5,0.96);
      border:1px solid rgba(122,31,31,0.55); padding:22px 22px 18px;
      box-shadow:0 0 0 1px rgba(0,0,0,0.6), 0 10px 40px rgba(0,0,0,0.6);
      animation: dialog-glitch-shift 2.6s steps(1) infinite;
    }
    /* one-shot harder burst right as the dialog opens, so the effect
       reads immediately instead of waiting on the ambient cycle below */
    .game-dialog-panel.glitch-in{ animation: dialog-glitch-in 0.5s steps(1) 1, dialog-glitch-shift 2.6s steps(1) infinite 0.5s; }
    /* scanlines - repeating horizontal bands, slow vertical roll so they
       read as a live CRT raster rather than a static printed texture.
       Plain alpha compositing (no mix-blend-mode) - overlay/multiply-style
       blends collapse toward the backdrop color on a near-black panel like
       this one, which was why the previous version was invisible; direct
       rgba bands always show regardless of what's underneath. */
    .game-dialog-panel::before{
      content:''; position:absolute; inset:0; z-index:2; pointer-events:none;
      background:repeating-linear-gradient(
        to bottom,
        rgba(255,255,255,0.06) 0px,
        rgba(255,255,255,0.06) 1px,
        rgba(0,0,0,0.22) 2px,
        rgba(0,0,0,0.22) 3px
      );
      background-size:100% 3px;
      animation: dialog-scanline-roll 9s linear infinite;
    }
    /* static noise - tiled SVG turbulence, opacity/position jump on a
       stepped timer so it flickers between "frames" of noise instead of
       smoothly drifting like a texture pan. screen blend is fine here
       (unlike overlay above) since screen only ever brightens, so it
       still shows against a dark backdrop. Pulled back from the first
       pass (0.16-0.24 opacity, 0.4s cycle) - that read as active TV
       snow, too busy for a resting panel; low and slow now, just enough
       grain to feel like a dying signal rather than a loud one. */
    .game-dialog-panel::after{
      content:''; position:absolute; inset:-20%; z-index:3; pointer-events:none;
      background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
      opacity:0.05; mix-blend-mode:screen;
      animation: dialog-static-flicker 1.1s steps(2) infinite;
    }
    .game-dialog-panel > *{ position:relative; z-index:4; }
    /* corner brackets - small L-shaped marks at each corner, each with its
       own chromatic RGB-split jolt on a desynced timer (different
       animation-delay per corner) so the glitch reads as flickering
       around the frame rather than the whole panel jerking as one block. */
    .gd-corner{
      position:absolute; width:22px; height:22px; z-index:5; pointer-events:none;
      border-color:rgba(122,31,31,0.85); border-style:solid; border-width:0;
    }
    .gd-tl{ top:-1px; left:-1px; border-top-width:2px; border-left-width:2px; animation: gd-corner-glitch 3.4s steps(1) infinite; }
    .gd-tr{ top:-1px; right:-1px; border-top-width:2px; border-right-width:2px; animation: gd-corner-glitch 3.4s steps(1) infinite 0.85s; }
    .gd-bl{ bottom:-1px; left:-1px; border-bottom-width:2px; border-left-width:2px; animation: gd-corner-glitch 3.4s steps(1) infinite 1.7s; }
    .gd-br{ bottom:-1px; right:-1px; border-bottom-width:2px; border-right-width:2px; animation: gd-corner-glitch 3.4s steps(1) infinite 2.55s; }
    @keyframes gd-corner-glitch{
      0%, 90%, 100%{ filter:none; transform:translate(0,0); border-color:rgba(122,31,31,0.85); }
      90.3%{ filter:drop-shadow(-2px 0 rgba(255,40,60,0.85)) drop-shadow(2px 0 rgba(40,220,255,0.7)); transform:translate(-1.5px,-1px); border-color:rgba(201,194,182,0.9); }
      90.7%{ filter:drop-shadow(2px 0 rgba(255,40,60,0.85)) drop-shadow(-2px 0 rgba(40,220,255,0.7)); transform:translate(1.5px,1px); }
      91.1%{ filter:none; transform:translate(0,0); border-color:rgba(122,31,31,0.85); }
      95%{ filter:drop-shadow(-2px 0 rgba(255,40,60,0.75)) drop-shadow(2px 0 rgba(40,220,255,0.6)); transform:translate(-1px,0); }
      95.4%{ filter:none; transform:translate(0,0); }
    }
    @keyframes dialog-scanline-roll{
      0%{ background-position-y:0; }
      100%{ background-position-y:60px; }
    }
    @keyframes dialog-static-flicker{
      0%{ opacity:0.035; transform:translate(0,0); }
      50%{ opacity:0.08; transform:translate(-1%,1%); }
      100%{ opacity:0.045; transform:translate(1%,-1%); }
    }
    /* chromatic-aberration glitch - RGB channel split via layered
       drop-shadows, held mostly at rest (no filter) with brief, jarring
       jolts - same "wrong-but-still, rare flash" language as the
       safehouse's locked-door glitch treatment, not a constant wobble.
       Cycle stretched and jolts softened from the first pass - was
       firing 3x/loop at full strength, closer to a strobe than dread. */
    @keyframes dialog-glitch-shift{
      0%, 96%, 100%{ filter:none; transform:translate(0,0); }
      96.4%{ filter:drop-shadow(-2px 0 rgba(255,40,60,0.4)) drop-shadow(2px 0 rgba(40,220,255,0.32)); transform:translate(-1.5px,0); }
      96.8%{ filter:none; transform:translate(0,0); }
    }
    @keyframes dialog-glitch-in{
      0%{ filter:drop-shadow(-3px 0 rgba(255,40,60,0.5)) drop-shadow(3px 0 rgba(40,220,255,0.42)); transform:translate(-2px,0); }
      30%{ filter:none; transform:translate(0,0); }
      55%{ filter:drop-shadow(-2px 0 rgba(255,40,60,0.4)) drop-shadow(2px 0 rgba(40,220,255,0.32)); transform:translate(-1px,0); }
      75%{ filter:none; transform:translate(0,0); }
      100%{ filter:none; transform:translate(0,0); }
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

// Fires the one-shot opening burst and re-triggers it on every open (a
// CSS animation already in its "infinite" tail won't restart just from
// re-adding the same class, so the panel is force-reflowed between
// removing and re-adding 'glitch-in').
function triggerGlitchIn(panelEl){
  panelEl.classList.remove('glitch-in');
  void panelEl.offsetWidth; // force reflow so the removed class actually takes effect before re-adding
  panelEl.classList.add('glitch-in');
}

// Two-button confirm - resolves true (confirm) / false (cancel), same contract
// as window.confirm() so existing `if(confirm(...))` call sites just need
// `if(await gameConfirm(...))`.
export function gameConfirm(message, title = 'CONFIRM'){
  ensureBuilt();
  titleEl.textContent = title;
  bodyEl.textContent = message;
  ransomizeDialogText(titleEl);
  ransomizeDialogText(bodyEl);
  okBtn.textContent = 'CONFIRM';
  dialogEl.querySelector('.game-dialog-actions').classList.remove('single');
  dialogEl.classList.add('open');
  triggerGlitchIn(dialogEl.querySelector('.game-dialog-panel'));
  return new Promise(res => { resolveFn = res; });
}

// Single-button alert - resolves once dismissed, for parity with window.alert().
export function gameAlert(message, title = 'NOTICE'){
  ensureBuilt();
  titleEl.textContent = title;
  bodyEl.textContent = message;
  ransomizeDialogText(titleEl);
  ransomizeDialogText(bodyEl);
  okBtn.textContent = 'OK';
  dialogEl.querySelector('.game-dialog-actions').classList.add('single');
  dialogEl.classList.add('open');
  triggerGlitchIn(dialogEl.querySelector('.game-dialog-panel'));
  return new Promise(res => { resolveFn = res; });
}
