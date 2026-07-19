// Setup: npm install --no-save jsdom three@0.128.0   (run from this project's
// root, alongside package.json - these are dev-only tooling deps, never
// committed, see HANDOFF.md's "browser probe" entry for why they aren't
// in package.json).
// Run:   node docs/jsdom_probe.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  resources: 'usable',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(global, 'location', { value: dom.window.location, configurable: true });
global.NodeFilter = dom.window.NodeFilter;
global.Node = dom.window.Node;
// Node's native global.performance already has .now() - don't override it
// with dom.window.performance, that creates a circular getter and blows
// the call stack.
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.localStorage = dom.window.localStorage;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
// Minimal WebGL/canvas stub so three.js's renderer construction doesn't
// throw immediately - we only need module evaluation to proceed far
// enough to see the REAL error, not a working render.
// jsdom has zero WebGL support at all - getContext returning null makes
// THREE.WebGLRenderer's constructor throw immediately, which stops
// module evaluation before we ever reach the circular-import code this
// probe exists to diagnose. A Proxy that answers "yes" to capability
// checks and returns a callable no-op (itself) for everything else gets
// THREE r128's constructor far enough to succeed without a real GPU.
function makeFakeGL(canvasEl){
  const fakeGL = new Proxy(function fakeGLFn(){ return fakeGLFn; }, {
    get(target, prop){
      if(prop === 'canvas') return canvasEl;
      if(prop === 'drawingBufferWidth') return 800;
      if(prop === 'drawingBufferHeight') return 600;
      if(prop === 'getContextAttributes') return () => ({ alpha:true, antialias:true, depth:true, stencil:true, premultipliedAlpha:true });
      if(prop === 'getExtension') return () => null;
      if(prop === 'getParameter') return () => [4096]; // single-element array: coerces numerically (Math ops) AND supports .indexOf() (extension-list checks)
      if(prop === 'getShaderPrecisionFormat') return () => ({ rangeMin:127, rangeMax:127, precision:23 });
      if(typeof prop === 'symbol') return undefined;
      return target; // any other GL call: return a callable no-op (itself)
    }
  });
  return fakeGL;
}
function makeFake2D(){
  const grad = { addColorStop(){}, };
  const ctx2d = new Proxy(function(){ return ctx2d; }, {
    get(target, prop){
      if(prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
      if(prop === 'measureText') return () => ({ width: 10 });
      if(typeof prop === 'symbol') return undefined;
      return target;
    },
    set(){ return true; },
  });
  return ctx2d;
}
dom.window.HTMLCanvasElement.prototype.getContext = function(type){
  if(type === '2d') return makeFake2D();
  return makeFakeGL(this);
};

// index.html loads three.js as a plain global <script> from a CDN - jsdom's
// runScripts:'outside-only' doesn't auto-execute that tag, so load an
// equivalent build ourselves and expose it the same way the CDN script
// would (window.THREE / global THREE), or every module that references
// the bare global `THREE` identifier throws ReferenceError immediately.
const threeSrc = fs.readFileSync(
  new URL('../node_modules/three/build/three.min.js', import.meta.url), 'utf8'
);
dom.window.eval(threeSrc);
global.THREE = dom.window.THREE;

process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION:', err && err.stack || err);
});

try {
  await import('../src/main.js');
  console.log('main.js evaluated with no top-level throw.');
} catch (err) {
  console.log('TOP-LEVEL THROW:', err && err.stack || err);
}

// give any queued microtasks/rAF callbacks a moment to fire and surface
// errors from inside animate() itself, not just module evaluation
await new Promise(r => setTimeout(r, 500));
