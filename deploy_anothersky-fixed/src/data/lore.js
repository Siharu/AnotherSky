// ---------- LORE (memory fragments) ----------
// Pure data - no THREE.js/DOM dependency, safe to import anywhere
// (world/props.js for orb placement, ui/memories.js for the panel).
// Extracted verbatim from the monolith (anothersky-horror.html, was
// lines 1597-1610). Player-facing text - keep world voice consistent
// with the Masterlog Bible (WNCORE, Ghuuls/Husks, "bear the unbearable
// truth") if adding entries.
export const LORE = [
  { id:0, title:"The Fog of Medusa", text:"It was never weather. What rolled in was a wound in the sky, and what falls from it now is not rain so much as runoff — the world weeping through the crack." },
  { id:1, title:"Husks", text:"Some saw all of it at once. The truth doesn't kill the body. It just empties it, and leaves the shape standing, still walking, still waiting for orders no one is giving anymore." },
  { id:2, title:"The Infected", text:"Worse than a husk: infected still know. They remember being someone. They can feel themselves being replaced, one held breath at a time, and there is nothing anyone can do to stop it." },
  { id:3, title:"Ghuuls", text:"When the replacement finishes, it keeps the skin. It learned your face from the inside. It is very good at being you — except for the eyes, and the way it stands too still in the rain." },
  { id:4, title:"2028–2031", text:"Three years missing from every record that should hold them. Not destroyed. Withheld. Whatever opened the sky did its opening quietly, in the years nobody thought to keep watch." },
  { id:5, title:"S.", text:"One name recurs where the records should be blank. Not a witness. Not a victim. Something closer to an address the sky still knows how to reach." },
  { id:6, title:"What the Sky Knows", text:"It was never an invasion. Call it a revelation instead — a truth too large for a skull, arriving anyway, and rearranging whatever it finds inside to make room for itself." },
  { id:7, title:"A Warning, Too Late", text:"The more of this you remember, the more of you the sky can find. You should stop reading these. You are not going to stop reading these." },
  { id:8, title:"WNCORE", text:"They still broadcast, out of habit more than hope. Not because anyone answers. Because the alternative is silence, and silence is how the sky knows you've stopped looking up." },
  { id:9, title:"The Rain of Obsedia", text:"Black rain doesn't wash anything clean. It marks. Days after, you'll still find it in the seams of your clothes, in the creases of your palms, remembering the shape of you." },
  { id:10, title:"The Nine", text:"Nine people erased from a life that still has a Som-shaped hole in it. Not dead. Not missing. Subtracted — and the world stitched itself shut over the gap like it was never there." },
  { id:11, title:"A Signal, Decoded", text:"Eleven words, pulled out of static that shouldn't have carried words at all: they lied to us. send help. Nobody has ever agreed on who sent it, or from when." },
  { id:12, title:"The Fourth Year", text:"Everyone agrees the sky opened once, between '28 and '31, and closed. Nobody has agreed on what to call the years since, because agreeing would mean admitting it never closed. It just got patient." },
  { id:13, title:"Relay Seven", text:"There were six relays before this one. Nobody who staffed them is on record as having left. WNCORE's own logs call that turnover. Turnover implies somewhere to turn over to." },
  { id:14, title:"The Choir", text:"Before the static, relay seven used to pick up something between frequencies — dozens of voices, overlapping, none of them finishing a sentence. Ops called it the choir. Nobody's heard it in two years. Some say that's an improvement." },
  { id:15, title:"What the Husks Remember", text:"A husk will walk the same six blocks for a year and never vary the route. Feed one a familiar sound — a name, a doorbell, a particular song — and it stops. Just once. Just for a second. Nobody has found out what it's remembering, because it starts walking again before anyone can ask." },
  { id:16, title:"Withheld", text:"Three years, taken whole, filed as though they were an accident. But an accident doesn't need a filing system. Someone built the shape that '28–'31 gets poured into before it ever happened. That takes planning. Planning takes a planner." },
  { id:17, title:"Address Book", text:"Found a list, water-damaged, in a Relay Seven drawer: names, and beside each one, not an address — a coordinate pair with no matching map. Cross-referenced against nothing. 'S.' isn't on it. Something about that is worse than if it had been." },
  { id:18, title:"The Second Signal", text:"Everyone quotes the eleven words — they lied to us. send help. Fewer people mention the second transmission, thirty seconds later, same frequency, no static, perfectly clean: four words. we are the help. Nobody has decided if that's a correction or a confession." },
  { id:19, title:"Four Years, Give or Take", text:"Ask anyone how long it's been since the sky opened and you'll get 'about four years' — never a date, never a count of days. Time got vague on purpose, somewhere. Vague is easier to live inside than exact. Exact would mean someone's counting, and counting means someone's still trying to leave." }
];

// ---------- Cluster assignment (MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md §2) ----------
// Pure data, consumed by main.js's orb-placement loop. Kept here (next to
// LORE) so the fragment-id -> narrative-cluster mapping can't drift out of
// sync with LORE by living in a second file that also needs editing
// whenever a fragment moves.
//   A - World (cosmic/world scope), early downtown, near safehouse.
//   B - This Town (local+world scope, #13/#14 lead), mid-downtown, en route
//       to the tower.
//   C - You/Cosmic scope, outer streamed chunks, dread/sanity-gated.
//   centerpiece - #18, gated behind #11 already found, never repeated.
export const LORE_CLUSTER_A = [0, 1, 6, 9];
export const LORE_CLUSTER_B = [13, 14, 2, 3, 4, 8]; // order matters: 13 before 14, both before the rest
export const LORE_CLUSTER_C = [5, 10, 11, 7, 12, 15, 16, 17, 19];
export const LORE_CENTERPIECE = 18; // gated: only appears once 11 is in state.collected
export function loreCluster(id){
  if(LORE_CLUSTER_A.includes(id)) return 'A';
  if(LORE_CLUSTER_B.includes(id)) return 'B';
  if(id === LORE_CENTERPIECE) return 'centerpiece';
  return 'C';
}
