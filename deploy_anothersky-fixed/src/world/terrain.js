/* ---------- TERRAIN HEIGHT ----------
   Pulled from main.js (Wave 2). Scoped down from the ARCHITECTURE.md
   table the same way sky.js was: this file owns only the two pure,
   zero-dependency height functions (no THREE object construction, no
   `scene`/`state` reads). The actual detailed ground mesh + far skirt
   plane (originally right below these two functions in the monolith)
   still stay in main.js — building that mesh is tangled up with scene/
   state and other in-progress systems, not just the texture calls.
   groundTexture()/toonRamp themselves DO now have a real module home
   (world/materials.js, pulled in the world-gen chokepoint round — see
   docs/HANDOFF.md), so that specific blocker is gone; the mesh itself
   just hasn't been moved yet. */
function terrainHeight(x,z){
  return Math.sin(x*0.045)*0.55 + Math.cos(z*0.06)*0.5 + Math.sin((x+z)*0.025)*0.35;
}
// The detailed ground mesh (built in main.js) is a fixed patch centered on
// the world origin, not something that regenerates as the player walks -
// past its edge, what's actually rendered underfoot is the flat, unlit
// "skirt" plane. Anything placed using raw terrainHeight() out there
// (streamed buildings/lamps/ruins can spawn arbitrarily far from origin)
// would sit at the analytic sine-wave height while the real visible
// ground beneath it is flat - exactly the "floating buildings" bug. This
// blends between the two so placement always matches what's actually on
// screen.
const GROUND_REAL_RADIUS = 220; // fade starts here, fully flat by the mesh edge (300)
const GROUND_EDGE_RADIUS = 295; // just inside the 600-wide detailed patch's true edge
const SKIRT_HEIGHT = -0.15;
function groundHeightAt(x,z){
  const r = Math.hypot(x,z);
  if(r <= GROUND_REAL_RADIUS) return terrainHeight(x,z);
  const t = Math.min(1, (r-GROUND_REAL_RADIUS)/(GROUND_EDGE_RADIUS-GROUND_REAL_RADIUS));
  const s = t*t*(3-2*t); // smoothstep - no visible kink where the blend starts
  return THREE.MathUtils.lerp(terrainHeight(x,z), SKIRT_HEIGHT, s);
}

export { terrainHeight, groundHeightAt, GROUND_REAL_RADIUS, GROUND_EDGE_RADIUS, SKIRT_HEIGHT };
