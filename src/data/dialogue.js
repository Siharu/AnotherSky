// ---------- DIALOGUE / VOICE LINES ----------
// Pure data - no THREE.js/DOM dependency. Extracted verbatim from the
// monolith. Consumed by systems/radio.js, systems/sanity.js,
// entities/player.js (call-outs), sky/sky.js (eye-storm lines).
// Player/world voice - keep consistent with the Masterlog Bible tone.

export const collectWhispers = ["it heard that.", "now it knows you know.", "don't look up.", "you shouldn't have read that.", "something just turned its head."];

export const radioAmbientLines = [
  "...relay seven, holding...",
  "...if the rain goes black, get inside...",
  "...still logging survivors on the old frequency...",
  "...static where the choir used to be...",
  "...don't answer if it uses your name...",
  "...the sky's not weather, copy...",
];

export const radioWarningLines = [
  "...movement north of the ridge, keep clear...",
  "...something's circling east of the relay...",
  "...lost contact south of the spire, avoid it...",
  "...whatever that was, it came from the west...",
];

export const radioHuntLines = [
  "...whoever's near the old district, it's already looking at you...",
  "...heat signature closing in, get out of the open, copy...",
  "...that's not us moving on your position...",
];

export const radioLowSanityLines = [
  "...seven, do you copy... seven, do you copy... seven, do—...",
  "...i already told you that. why are you asking again...",
  "...this channel doesn't exist anymore. stop listening...",
  "...it's not us. whatever's talking back, it's not us...",
];

export const radioDreadLines = [
  "...pressure's dropping over the relay, that's never good...",
  "...the sky's doing it again. don't look up...",
  "...if you can see the hole in the clouds, you're too close...",
];

export const radioTowerHintLines = [
  "...if you can reach the mast, we can get you a fix on your position...",
  "...there's a relay tower standing dead center of the grid, still lit...",
  "...find the tower. we can't find you until you do...",
  "...keep this thing on you. it's the only reason we know you're out there...",
];

export const radioTowerFoundLines = [
  "...good, you found the mast. signal's weak but it's holding...",
  "...we've got a rough fix on you now. stay near open ground...",
];

// First power-on line (MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md §4.4) - fires
// exactly once, guaranteed, the very first time the radio broadcasts at
// all. Everything else in this file is picked from a pool by chance;
// this one line is scripted specifically so "get to the mast" reads as
// the map's stated goal from the first thing the player ever hears on
// this radio, not as ambient flavor the player might miss for minutes
// if radioTowerHintLines happens not to roll. See systems/radio.js -
// broadcastRadio() checks state.firstBroadcastDone before falling back
// to pickSituationalRadioLine()'s normal pools.
export const radioFirstPowerOnLine = "...relay seven, holding. if anyone's on this frequency — get to the mast. we can't find you until you do.";

// New mystery material (docs/story/ANOTHER_SKY_new_mystery.md), wired into
// systems/radio.js's pickSituationalRadioLine(): radioFourYearLines surfaces
// once fragment #12 or #19 is collected, radioChoirLines once #14 is -
// confirming (never explaining) what the player just read, same beat
// MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md §1 Beat 5 calls for. Either can fire
// independently once its own trigger is met - not gated on each other.
export const radioFourYearLines = [
  "...four years. give or take. nobody keeps an exact count anymore, and that's on purpose...",
  "...relay six, five, four — before my time, all of them. turnover, they call it...",
  "...you want to know what year it really is? so do we...",
];

export const radioChoirLines = [
  "...used to be able to pick up others between frequencies. dozens of them, talking over each other. haven't heard the choir in two years...",
  "...if the choir comes back, seven, do not even acknowledge you heard it...",
];

// Answering machine (MAP1_TONE_INFLUENCES.md's 999 section) - mundane,
// days-old voicemails that cut off mid-sentence or trail into the choir's
// tone bleeding through the line. Diegetic evidence sitting near fragment
// #14 ("The Choir") so the player connects the two without being told to.
// Deliberately ordinary content for the first few - the horror is in how
// unremarkable they are, not in what they say - with the choir bleed only
// arriving on the last one.
export const answeringMachineLines = [
  "...hey, it's me, shift change got moved up an hour, can you cover till - actually never mind, I'll just see you there...",
  "...don't forget we said we'd do dinner Thursday, my place, bring the good bread this time...",
  "...radio's doing that static thing again, if you're near the panel can you check the - [click]...",
  "...(overlapping voices, too many to separate, none of them finishing a word)...",
];
// you're clear while something is actually hunting you. Deliberately
// reuse phrasing close to the honest radioWarningLines/ambient lines so
// it doesn't read as an obviously different voice - the horror is that
// it sounds exactly like every other transmission you've trusted so far.
export const radioFalseSafeLines = [
  "...all clear on your position, nothing on the scope...",
  "...you're good, nothing moving out there right now...",
  "...quiet out your way. take the moment...",
  "...no contacts near you. you can breathe...",
];

// Phantom - broadcasts that shouldn't be possible (a dead channel, a
// voice that isn't relay seven, something addressing the player by name
// with no way of knowing it). Never truthful, never situational - these
// exist purely to be wrong in a way the player can't rationalize away
// the way a false-safe line can ("maybe it just didn't see it"). Kept
// separate from every other pool so systems/radio.js can log these with
// their own `phantom:true` flag instead of folding them into normal
// radioLog history.
export const radioPhantomLines = [
  "...that frequency's been dead for years. who's transmitting...",
  "...i can hear you breathing. stop that...",
  "...seven, this isn't seven. seven's gone...",
  "...you weren't supposed to still be listening...",
];

export const playerCallOutLines = [
  "anyone left out here? say something.",
  "i know how this sounds. i'm asking anyway.",
  "i keep doing this. calling out. it never works. i still do it.",
  "nobody. of course."
];

export const playerFearLines = [
  "keep moving. don't need to know what that is to know i don't want it closer.",
  "stop trying to name it. just move.",
  "whatever that is, it's not confused about what it's doing. i need to be less confused about what i'm doing.",
  "i don't have to understand it to know it's wrong. go.",
  "don't run in a straight line. don't run in a straight line—",
  "it's not that it's fast. it's that it doesn't stop."
];

export const playerLowSanityLines = [
  "i had this figured. i had a plan. where did the plan go.",
  "that's the third door i've counted twice. or the first door three times. i can't tell anymore.",
  "focus. if i stop making sense of this, it wins.",
  "i'm not losing my mind. i'm losing the parts of it i was using to survive.",
  "i keep filling in the gaps myself. that's the part that scares me — how easy it is.",
  "i said that already. didn't i say that already."
];

export const playerTowerFarLines = [
  "a relay tower. if anything on this continent still talks, it talks through one of those.",
  "if there's a signal anywhere, it starts there.",
  "i need eyes on this place. that tower's the closest thing to eyes i've got."
];

export const playerTowerNearLines = [
  "please still be standing. please still be more than rust.",
  "okay. okay, i'm close.",
  "come on. give me something. anything."
];

export const playerTowerUnlockedLines = [
  "now i can see the shape of this place. doesn't make it kinder. just makes it mine to navigate.",
  "signal's weak but it's something. it's something.",
  "at least i'm not guessing blind anymore. i'll take it."
];

export const playerDreadHighLines = [
  "the sky isn't supposed to look like that. i don't need a word for wrong to know this is wrong.",
  "it's not hunting me. that's almost worse. this is just what's here now.",
  "i keep waiting for someone to tell me this isn't normal. there's no one left to tell me anything.",
  "i don't remember my own name, but i remember skies didn't used to do that. i think. i think i remember that."
];

export const playerEyeStormLines = [
  "that's not stars. those are— okay. okay, don't count them. just move.",
  "it's not chasing. it's just watching. all of it, at once.",
  "i don't need to understand this right now. i need to not be under it."
];

export const ambientWhispers = ["it sees you.", "keep walking.", "don't turn around.", "the sky is listening.", "that's not the wind."];

// ---------- LOCKED DOOR / RELAY PAYOFF (scripted, one-shot) ----------
// The locked room was never key-locked - it's wired to Relay Seven's
// power loop. These fire in a fixed sequence once (see updateRadioTower()
// and tryLockedDoor() in main.js): relay comes online right after the
// tower/minimap beat, a return cue nudges the player back once they've
// drifted away, and the door beat itself quotes the original "you'd need
// a key for this" line back before giving with no resistance at all.
export const relayActivationLine = "...huh. that's odd. something on our end just came back online. wasn't us that flipped it.";
export const relayReturnCueLine = "...seven, you should head back to wherever you started. something about your position just... changed. can't explain it better than that.";
export const doorApproachLine = "...locked. you'd need a key for this. yeah. i remember.";
export const doorOpenPlayerLine = "no key. it just... stopped being locked. like whatever was holding it shut ran out of reason to.";
export const doorOpenRadioLine = "...that's us, seven. or - that's someone being generous about what 'us' means. don't spend too long thinking about which.";

// ---------- WAKE-UP: BODY BEAT ----------
// One extra line for playWakeDialogue() (main.js) - fires right at the
// very start, before "unknown ceiling", so the physical beat (waking up
// hurt) lands before the disorientation beat does. Kept as its own
// export rather than editing the inline array in main.js directly, so
// every scripted line in the wake sequence has one source-of-truth home
// the way the rest of this file already works.
export const wakeBodyAcheLine = "...agh. my whole body hurts.";

// ---------- RADIO PICKUP EXCHANGE ----------
// Replaces the old single "...a radio. still has weight to it." pickup
// line + the deterministic "note taped to the back" tutorial hook. That
// hook is retired now that the safehouse TV/sticky-note beat (below)
// carries the "find the relay towers" instruction instead - this
// sequence just covers the actual physical beat of finding and trying
// the radio, unresolved on purpose (radioPickupNoAnswerLine confirms
// nobody answers back yet, rather than a note doing the telling).
export const radioPickupFloatingLine = "huh... why is that radio floating?";
export const radioPickupTryLine = "...does this thing even work?";
export const radioPickupCallLine = "hello? can you guys hear me?";
export const radioPickupNoAnswerLine = "...hm. guess this thing's one-sided.";
export const radioPickupCheckRoomsLine = "i should check the other rooms.";

// ---------- SAFEHOUSE TV / STICKY NOTE ----------
// A new interactable (main.js/world/safehouse.js's TV_POS): first visit
// plays the room-description beat and turns the TV on to static; the
// sticky note beside it is a second, separate interaction (same prop,
// second read) that actually states the objective in-world instead of
// the objective panel just appearing with no diegetic reason. Written to
// answer the exact question the panel text otherwise leaves open -
// "why towers, plural" - without over-explaining REDACTED, which stays
// a redaction on purpose (matches the sky/lore convention elsewhere of
// withholding rather than resolving).
export const tvRoomDescriptionLines = [
  "this room's dustier than the others. damp, too - like nobody's used it in years.",
  "surprised the tv even still gets power. everything on it is static."
];
export const tvStickyNoteLine = "...sticky note, taped to the frame. \"reconnect all relay towers - link went down after REDACTED.\" the rest of that word's scratched out, hard enough to tear the paper.";
export const tvStickyNoteFollowupLine = "all of them. not just the one on the ridge. there's more of these things standing out there.";

// ---------- RELAY TOWER CONNECTION QUEST ----------
// One flavor line per dead relay a player connects their radio to
// (main.js's connectDeadRelay()) - not numbered 1:1 to a specific
// tower, just pulled in order so the run of lines reads as the player
// getting steadily more unsettled by how many of these there turn out
// to be, then closing on the last one differently once hqTowerUnlocked
// actually flips true.
export const relayConnectLines = [
  "...this one's further gone than the first. still took the signal, though.",
  "another one. how many of these are out here.",
  "same lattice, same dead horn cluster. different rust pattern. that's the only thing that's different.",
  "connected. i don't know what i'm connecting it to anymore.",
  "i keep expecting one of these to answer back different. none of them do.",
  "six now. i've stopped being surprised and started just counting.",
  "almost done. i can feel it in how the static's changed - fuller, somehow. wronger.",
];
export const relayConnectFinalLine = "...that's all of them. eight dead relays, one live one, and now something's finally lit up out past all of it. i can see it from here. i couldn't see it from here before.";

// ---------- HQ TOWER ----------
// The giant tenth mast (main.js's HQ_TOWER_POS) - always visible at a
// distance, deliberately unreachable (a soft collision wall) until
// hqTowerUnlocked flips true once every dead relay's connected.
export const hqApproachBlockedLines = [
  "it's not getting any closer. i've been walking straight at it.",
  "something about the ground out there doesn't want me on it yet.",
  "wrong direction, apparently. or wrong time. same difference right now."
];
export const hqApproachUnlockedLine = "...it's letting me through now. i don't love what that implies about who's been deciding until this point.";

// ---------- RETURN TO SAFEHOUSE: "WHO ARE YOU" BEAT ----------
// Fires once (main.js) after hqTowerUnlocked and the player heads back
// to the safehouse - the TV, previously just static, says something for
// the first time. state.tvStage tracks this as a one-shot separate from
// the earlier sticky-note read.
export const tvWhoAreYouLine = "...who are you?";
export const tvWhoAreYouPlayerLine = "i don't - i don't know. i don't know who i am.";
export const tvStickyNoteHQLine = "...second note, older, under the first one. \"plan: reach HQ relay, pull the real logs.\" the paper's gone soft and yellow. this one's been here a long time.";

// ---------- GHUUL SWARM DEATH ----------
// One-shot, checked in main.js when 4+ HUNT-state ghuuls are all within
// close range of the player at once. Deliberately not addressed to the
// player character at all - these read as something else's voice
// (closer to radioPhantomLines' register than anything the player or
// Relay Seven would say), the same "wrong in a way you can't rationalize
// away" move radioPhantomLines already uses.
export const swarmDeathLines = [
  "looks like you couldn't fix it either.",
  "maybe the next one can.",
  "the world doesn't care who changes it.",
  "the signal ruined you.",
  "they were once like you."
];
