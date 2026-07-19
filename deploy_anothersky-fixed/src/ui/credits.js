// ---------- CREDITS: glitch-scramble ----------
// Pulled verbatim from main.js. Self-contained: only touches
// document.querySelectorAll for '.redacted' elements (used by both the
// credits crawl and the memories panel's locked entries) and its own
// module-level timer handle. No `state`, no other systems. The
// creditsOverlay open/close click-handler wiring (which calls
// startGlitchScramble()/stopGlitchScramble()) stays in main.js.
const GLITCH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&▓▒░╳╱╲∆∇◇ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ';

function glitchScrambleTick(){
  document.querySelectorAll('#credits-overlay .redacted, #memories-overlay .redacted').forEach(el=>{
    if(!el.dataset.real) el.dataset.real = el.dataset.text || '';
    const real = el.dataset.real;
    let out = '';
    for(let i=0;i<real.length;i++){
      out += real[i]===' ' ? ' ' : GLITCH_CHARS[Math.floor(Math.random()*GLITCH_CHARS.length)];
    }
    el.setAttribute('data-text', out);
    el.textContent = out; // keep the real (invisible, color:transparent) text in
                           // sync too, so the element's own box actually sizes
                           // to the scrambled length - otherwise only the
                           // absolutely-positioned ::before/::after glow
                           // grows, overflowing past the box's left edge and
                           // overlapping the role label next to it
  });
}

let glitchScrambleTimer = null;

export function startGlitchScramble(){
  stopGlitchScramble();
  glitchScrambleTick();
  glitchScrambleTimer = setInterval(glitchScrambleTick, 140);
}

export function stopGlitchScramble(){
  if(glitchScrambleTimer){ clearInterval(glitchScrambleTimer); glitchScrambleTimer = null; }
}
