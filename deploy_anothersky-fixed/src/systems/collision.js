// ---------- COLLISION ----------
// Pulled verbatim from main.js. Pure function - only depends on
// `obstacles` (passed in, since it's still a main.js-owned array
// pushed into by not-yet-extracted world-gen) and PLAYER_RADIUS
// (from core/state.js). No THREE object construction, no DOM.
import { PLAYER_RADIUS } from '../core/state.js';

export function resolveCollisions(x, z, obstacles){
  for(const o of obstacles){
    if(o.type==='rect'){
      // closest point on the (axis-aligned) rectangle to the player, then
      // treat it like a circle-vs-point push from that closest point - this
      // is what makes collision hug the actual walls instead of the old
      // inscribed/circumscribed circle around them.
      const cx = Math.min(Math.max(x, o.x-o.hw), o.x+o.hw);
      const cz = Math.min(Math.max(z, o.z-o.hd), o.z+o.hd);
      const dx = x-cx, dz = z-cz;
      const distSq = dx*dx+dz*dz;
      if(distSq < PLAYER_RADIUS*PLAYER_RADIUS){
        if(distSq > 0.0001){
          const dist = Math.sqrt(distSq);
          const overlap = PLAYER_RADIUS-dist;
          x += dx/dist*overlap;
          z += dz/dist*overlap;
        } else {
          // player center is exactly inside the rect (rare, e.g. a
          // teleport/save-restore edge case) - push out the nearest face
          const left=(x-(o.x-o.hw)), right=((o.x+o.hw)-x), top=(z-(o.z-o.hd)), bottom=((o.z+o.hd)-z);
          const m = Math.min(left,right,top,bottom);
          if(m===left) x = o.x-o.hw-PLAYER_RADIUS;
          else if(m===right) x = o.x+o.hw+PLAYER_RADIUS;
          else if(m===top) z = o.z-o.hd-PLAYER_RADIUS;
          else z = o.z+o.hd+PLAYER_RADIUS;
        }
      }
      continue;
    }
    const dx=x-o.x, dz=z-o.z;
    const minDist = o.radius+PLAYER_RADIUS;
    const distSq = dx*dx+dz*dz;
    if(distSq < minDist*minDist && distSq>0.0001){
      const dist=Math.sqrt(distSq);
      const overlap=minDist-dist;
      x += dx/dist*overlap;
      z += dz/dist*overlap;
    }
  }
  const r = Math.hypot(x,z);
  // WORLD_RADIUS (230) now only bounds the original hand-authored downtown;
  // beyond it the world streams procedurally (see the chunk system below),
  // so the player is no longer walled in there. This is just a sanity cap
  // far out, to avoid float-precision weirdness on an extremely long walk.
  const MAX_WALK_RADIUS = 20000;
  if(r>MAX_WALK_RADIUS){ x = x/r*MAX_WALK_RADIUS; z = z/r*MAX_WALK_RADIUS; }
  return [x,z];
}
