// ---------- NOTEBOOK ENTRIES ----------
// The 12 numbered story beats from MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md §1,
// plus the two "new mystery" addenda from ANOTHER_SKY_new_mystery.md,
// finally given real text and a real trigger condition each - previously
// manualSave() always showed the same one fixed line regardless of story
// progress, so none of this ever actually surfaced in-game.
//
// Voice-drift entries (6, 9, 11) per MAP1_TONE_INFLUENCES.md's 13
// Sentinels section: written to read *very slightly* off from the plain
// first-person voice everywhere else - a level of specificity about a
// place or person the player-character shouldn't have yet. Nothing marks
// these as different in-game; the drift should only register in
// hindsight, after the corpse-reveal (entry 12). Deliberately not flagged
// with any UI/system difference - that would defeat the point.
//
// `condition(state)` gates readiness; `pickNextNotebookEntry(state)` scans
// in id order and returns the first entry whose condition passes and
// whose id isn't already in state.notebookEntriesShown - i.e. strictly
// progressive, nothing skips ahead, nothing repeats once written.
export const NOTEBOOK_ENTRIES = [
  { id:1, condition: () => true,
    text: "Woke up in a locked room with no memory of getting here. There's a notebook, and the handwriting in it might be mine. It doesn't feel like mine." },
  { id:2, condition: () => true,
    text: "Whoever lived here left the lights on. Not \"forgot to turn them off\" - left them on, like they meant to come back inside an hour." },
  { id:3, condition: (s) => s.minimapUnlocked || s.collected.size >= 3,
    text: "There's a tower out past the rooftops. Something in me already knows to walk toward it, before I've decided to." },
  { id:4, condition: (s) => s.minimapUnlocked,
    text: "Reached the tower. It's not what I expected - not a fortress, not manned. Just standing there, waiting for someone to notice it's still running." },
  { id:5, condition: (s) => s.dread > 0.3,
    text: "First time today I had to stop walking and just breathe. Nothing happened. That's what scared me - nothing happening is starting to feel like a countdown." },
  { id:6, condition: (s) => s.relayActive,
    text: "The relay came back on and it wasn't us that flipped the switch. I keep thinking about who used to work this desk, whether they minded the swing shift, whether they ever got used to the quiet between broadcasts. Strange thing to wonder about a room I've never seen anyone in." },
  { id:7, condition: (s) => s.sanity < 0.5,
    text: "Losing the thread of things. Twice now I've read a sentence in here and not recognized writing it, even though it's unmistakably the same hand as every other page." },
  { id:8, condition: (s) => s.collected.has(5),
    text: "Found something with just a single letter on it. \"S.\" No name attached, like the rest of it got left out on purpose, or got erased right down to the initial and stopped there." },
  { id:9, condition: (s) => s.collected.has(10),
    text: "Nine people, gone from a story that still has a Som-shaped hole in it where they used to be. I remember exactly where each of them used to stand in that room, which is a strange thing to remember about nine people I apparently never met." },
  { id:10, condition: (s) => s.skyWrongness >= 0.95,
    text: "The sky did something today that I don't have a word for. Not a storm. More like being watched by something that finally stopped pretending it wasn't looking." },
  { id:11, condition: (s) => !!s.returnCueShown,
    text: "The radio said something back to me tonight - my own last line, word for word, in my own voice, like it had been saving it up to see if I'd notice. I noticed. I'm choosing to write that down instead of thinking about it further." },
  { id:12, condition: (s) => !!s.doorUnlocked,
    text: "The door that was never locked is open now. If this is the last page, I'd rather it end with a question than a lie: whose hand is this, really, and how long has it been holding the pen." },
  { id:13, condition: (s) => s.collected.has(12),
    text: "Did the math twice. Four years. Wrote '2036' at the top of this page and stared at it until it stopped looking like a real number." },
  { id:14, condition: (s) => s.collected.has(18),
    text: "we are the help. Four words. Nobody mentions those four words. I keep mentioning them to myself, quietly, to see if saying it out loud changes what it sounds like. It doesn't." },
];

// Fallback line once every currently-unlockable entry has already been
// shown - keeps the notebook interaction meaningful ("nothing new yet")
// rather than silently repeating old text or going blank.
export const NOTEBOOK_NOTHING_NEW = "...nothing new to write. not yet.";

export function pickNextNotebookEntry(state){
  const shown = state.notebookEntriesShown || [];
  for(const entry of NOTEBOOK_ENTRIES){
    if(shown.includes(entry.id)) continue;
    if(entry.condition(state)) return entry;
  }
  return null;
}
