// ---------- MATH / COLOR HELPERS ----------
// Pure functions, no THREE.js/DOM dependency (THREE.MathUtils covers
// clamp/lerp elsewhere in the codebase - this file is for the small
// one-off helpers that aren't part of that).

export function pickFrom(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t){
  return a + (b - a) * t;
}
