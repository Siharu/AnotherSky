// ---------- ZONES: safe zone + spreading corruption ----------
// Last two items from Phase 4's original six-item list. Grouped into one
// file since both are "spatial gameplay effects based on player
// position" - same shape of system, same consumers (entities/ghuuls.js,
// systems/sanity.js, systems/dread.js), not enough surface area each to
// justify separate files the way e.g. sanity.js and dread.js earned
// their own split.

import { state } from '../core/state.js';
import { SAFEHOUSE_CENTER } from '../world/safehouse.js';

/* ---------- SAFE ZONE (radio tower) ----------
   Matches main.js's RADIO_TOWER_POS ({x:0,z:0}) by convention rather
   than importing it directly - main.js imports this file's own exports
   (isInSafeZone, used by entities/ghuuls.js and systems/sanity.js/
   dread.js, which main.js also imports), so importing RADIO_TOWER_POS
   back out of main.js into this file would create a two-way import
   cycle. Same hardcoded-duplication convention already used for
   SETTINGS_KEY between systems/settings.js and utils/dom.js - if
   RADIO_TOWER_POS's coordinates ever change in main.js, this constant
   needs updating by hand to match. */
const SAFE_ZONE_CENTER = { x:0, z:0 };
const SAFE_ZONE_RADIUS = 20;

export function isInSafeZone(x, z){
  return Math.hypot(x-SAFE_ZONE_CENTER.x, z-SAFE_ZONE_CENTER.z) < SAFE_ZONE_RADIUS;
}

/* ---------- SPREADING CORRUPTION ----------
   Grows outward from SAFEHOUSE_CENTER (near where the player actually
   started - see world/safehouse.js) over real playtime (state.elapsed),
   thematically opposed to the tower's stability above: the Blank Zone
   catching up the longer a player lingers, rather than a fixed danger
   zone. SAFEHOUSE_CENTER only referenced inside getCorruptionLevel()'s
   function body, never at this module's top-level evaluation - see
   systems/dread.js's own header comment for why that ordering matters
   (a real TDZ crash happened here once already from getting this wrong). */
const CORRUPTION_START_RADIUS = 25;      // safe bubble before any corruption is felt at all
const CORRUPTION_GROWTH_PER_SEC = 0.014; // ~1 unit every ~70s of playtime - slow enough not to feel like a race, present enough to matter over a full session
const CORRUPTION_BAND = 40;              // width of the 0 (edge)->1 (deep inside) falloff

export function getCorruptionLevel(x, z){
  const edge = getCorruptionEdgeRadius();
  const d = Math.hypot(x-SAFEHOUSE_CENTER.x, z-SAFEHOUSE_CENTER.z);
  if(d > edge) return 0;
  return Math.min(1, (edge-d)/CORRUPTION_BAND);
}

// Exposed separately from getCorruptionLevel() for world/grass.js, which
// computes its own per-blade falloff on the GPU (see that file's vertex
// shader) rather than calling getCorruptionLevel() per-blade on the CPU -
// it only needs the single growing edge radius each frame, not the full
// per-point falloff calculation.
export function getCorruptionEdgeRadius(){
  return CORRUPTION_START_RADIUS + state.elapsed*CORRUPTION_GROWTH_PER_SEC;
}
