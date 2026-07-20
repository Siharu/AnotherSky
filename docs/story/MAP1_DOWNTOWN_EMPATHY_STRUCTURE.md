# ANOTHER SKY — MAP 1: "DOWNTOWN EMPATHY"
## Full Story Structure, Dialogue Script & Implementation Notes — Wake to Blackout

*Merged doc — was two files (`MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md` +
`story/ANOTHER_SKY_map1_story_direction.md`); combined because the
second was a strict subset in scope (the door/relay beat sheet) but
carried the only full copy of the dialogue script and implementation
notes the first only referenced by name (`doorApproachLine`,
`radioTowerFoundLines`, etc.). This file is now the single source for
both. Supersedes the chapter outline in `MAP1_CAMPAIGN_STRUCTURE.md`
for everything up through the corpse-reveal; that doc's Chapter 8 (the
forest wake-up) still stands as Map 2's opening and isn't repeated
here.*

---

## The Big Idea for This Map (door/relay throughline)

The locked door was never a key problem. "Key's not here" (the
existing bed-table dead end) is left standing exactly as-is — it's not
a bug in the design, it's the joke the whole map is setting up. The
door isn't secured with a lock that opens with a key. It's held by a
**ward plate wired to Relay Seven's power loop** — the same relay the
player spends the whole map walking toward. Nobody in-world calls it a
ward; the player character doesn't know that word either. They just
know: *it's locked, there's no key, and then one day it isn't locked
anymore, and the timing lines up exactly with the tower coming back
online.*

That gives the map a genuine goal-and-payoff structure instead of
"collect things until a timer fires":
**Reach and activate the tower → the safehouse's locked door loses its
hold → the player has a reason to walk all the way back → what's
behind it is the hook into Map 2.**

This also feeds the operator-ambiguity hook one more time for free:
the player never learns *who* wired the door to the relay, or why.
WNCORE will take partial credit for it over the radio. Whether to
believe that is left exactly as unresolved as everything else.

---

## 0. The Downtown's Actual Situation (internal canon — never stated on-screen)

Downtown was not part of the wider world's four years of decay. Relay
Seven's transmission carried an incidental side effect: it dampened or
drowned out **the choir** — the overlapping between-frequency voices
described in fragment #14 — for as long as it stayed powered. That
dampening is what let a small holdout population keep living something
close to a normal life here, years after most of the world had already
emptied out or gone to ground.

**A few days before the player wakes**, the relay's dampening failed —
not from an attack, not from a single dramatic event, just the same
slow entropy eating everything else in this world. The choir came back
through clean. The residents didn't fight, flee in panic, or leave any
sign of struggle. They got up — mid-meal, mid-shift, mid-conversation —
and walked out toward it, the same pull that's been drawing the
husk-infected into Map 2's forest for four years. Downtown isn't a
separate event from that migration. **It's the same convergence,
caught days-fresh instead of years-fresh.**

This is why the city reads wrong: lights still on timers, food still
on stoves gone cold rather than rotted for years, laundry still on
lines, a couple of dwellings clearly still "lived in" right up until
they weren't. It should never look post-apocalyptic in the four-years
sense — it should look like a town that stepped out for a moment and
never came back, because that's exactly what happened.

**Nobody ever says this to the player.** It's read only through:
- Environmental staging (see §3, per-cluster detail below)
- Fragment #13 ("Relay Seven" — the turnover line) and #14 ("The Choir")
- The dramatic irony of the player's own goal: reactivating the same
  relay whose *failure* just emptied this town is going to bring its
  signal back online. Reactivating it either re-establishes the
  dampening (protective) or announces the player's position to
  whatever's on the frequency (per the existing operator-ambiguity
  hook) — and the game should never resolve which. The dread here is
  structural, not exposited.

---

## 1. Full Beat Structure (Wake → Blackout)

### Beat 1 — Wake
Safehouse interior. No memory beyond reflex. First notebook contact
establishes the handwriting-that's-probably-his hook. First
locked-door attempt, bed-table dead end (untouched, verbatim — see §4
for the exact lines).
*Environmental note: the safehouse itself should NOT show the
"recently occupied" staging — it reads as long-abandoned, sealed off,
separate from downtown proper. This is a deliberate contrast the
player should feel without it being pointed out: the place he woke up
in is old and dead; the town outside is fresh and wrong.*

### Beat 2 — First Steps Outside
Player exits the safehouse into downtown for the first time. This is
the single most important environmental-storytelling moment in the
whole map — the "recently occupied" wrongness needs to land in the
first two minutes of exterior exploration, before any dialogue or
fragment explains anything.
**Staging beats (a few, scattered near the safehouse exit, not
everywhere at once):**
- A window with a light still on behind drawn curtains.
- A door standing open, no forced-entry damage.
- Something midway through being done — a cart half-unloaded, a
  bicycle laid on its side rather than crashed.
No lore fragment should be sitting right here. The wrongness has to be
felt as pure environment first; the *explanation* comes later, gated
behind fragments, so the player's own noticing gets to arrive before
the game confirms it.

### Beat 3 — Radio Contact
First radio pickup. `radioTowerHintLines` framing establishes the
tower as the stated goal. Dread/sanity begin ticking. (First power-on
line, verbatim, §4.)

### Beat 4 — Cluster A: What Happened to the World *(early downtown core)*
Existing fragments #0, #1, #6, #9 — the Fog of Medusa, Husks, "not an
invasion... a revelation," the Rain of Obsedia. These stay scoped to
the *cosmic* mystery, not the local one — deliberately kept separate
so the town's specific wrongness doesn't get answered too early by
generic apocalypse lore.
Notebook entries 1–2.

### Beat 5 — Cluster B: What Happened to This Town *(new placement — mid-downtown, en route to tower)*
This is where fragment placement changes from the original treatment.
New fragments #13 ("Relay Seven") and #14 ("The Choir") are moved into
heavy rotation here, ahead of the older Cluster B fragments (#2, #3,
#4, #8), because they're the ones that actually explain what the
player has already been visually noticing since Beat 2.
- #13 should be found first (establishes "turnover" as a pattern,
  sounds almost administrative/dry).
- #14 should be found second, ideally in a spot with strong staging
  nearby (a radio left on, tuned to static, in a room that otherwise
  looks fine) — this is the fragment that reframes everything the
  player has walked past so far.
Recommend a **short radio line pair** confirming (never explaining)
once #14 is found, reusing the already-drafted `radioChoirLines`:
> *"...used to be able to pick up others between frequencies. dozens
> of them, talking over each other. haven't heard the choir in two
> years..."*
This should land close enough to the fragment pickup that the player
connects it themselves, but not so immediate it feels like a cutscene
explaining the fragment.
Notebook entries 3–6 continue as originally scoped (tower sighted,
tower reached, first dread spike, first "that's not us").
Older Cluster B fragments (#2 Infected, #3 Ghuuls, #4 Blank Zone, #8
WNCORE) stay in the mix here too, just de-emphasized relative to
#13/#14 — they're world-scale context, not this-town-scale.

### Beat 6 — Tower Reached (Midpoint)
Minimap unlocks. `radioTowerFoundLines`. `state.relayActive` fires
silently — doesn't need to be visible to the player immediately; it
can fire the moment the tower's reached, so the payoff at Beat 9 feels
like the world quietly kept a promise rather than a scripted cutscene
announcing itself. The relay-activation line (*"something on our end
just came back online, wasn't us that flipped it"*) fires once,
undersold — exact line in §4.
*This is also the point where the dramatic irony from §0 should peak,
if you want one (optional, not required) environmental beat: something
in the immediate area around the tower reacting almost imperceptibly
the instant it comes online — a light flickering on somewhere in view,
one single distant sound cutting out. Small. Never remarked on by any
character.*

### Beat 7 — Escalation / Cluster C *(outer streamed chunks)*
Eye storm at ~5min. Monolith visibility increases, dread/glitch toward
extreme. Cluster C fragments (#5 "S.", #10 The Nine, #11 A Signal
Decoded, #7 A Warning Too Late) unlock, gated loosely behind
dread/sanity thresholds.
New fragments #12 ("The Fourth Year"), #15 ("What the Husks
Remember"), #16 ("Withheld"), #17 ("Address Book"), #19 ("Four Years,
Give or Take") fill out this cluster's remaining slots — they're
cosmic/world-scale, same register as the original Cluster C, not
town-specific.
Fragment #18 ("The Second Signal") stays gated behind #11 already
found, per `new_mystery.md` — the single most load-bearing fragment in
the game. Never repeated or confirmed afterward.
Notebook entries 7–9 (sanity crossing low / "S." fragment / "The Nine"
fragment).

### Beat 8 — Return Cue
Player moves back toward the safehouse with `relayActive` true.
"Something changed" cue fires once (`relayReturnCueLine`), built and
wired already — exact line in §4.
Notebook entries 10–11 (eye storm onset / "the voice used my last line
back at me").

### Beat 9 — The Door
Player re-enters `LOCKED_DOOR_POS` radius. `state.doorUnlocked` fires.
Door-open sequence plays verbatim (`doorApproachLine` /
`doorOpenPlayerLine` / `doorOpenRadioLine`, full text in §4) — no
static burst this time, silence is the tell.

### Beat 10 — The Reveal (Notebook Accumulation)
No single trigger. This is the point at which the player has been
stacking enough mismatched-dates / recognized-handwriting /
already-visited-room details across the general notebook pickups to
conclude, unprompted, that the body they're in died four years ago and
was physically revived to receive them. Notebook entry 12 (*"if this
is the last page, I'd rather it end with a question than a lie"*) plus
new-mystery addenda 13–14 if #12/#18 were found.
This reveal is scoped entirely to the corpse mechanic. It does not
touch, confirm, or deny anything about Som, the Nine, or "S." — that
thread stays completely silent through the rest of this map.

### Beat 11 — Blackout
Open road. Head pain. Blackout. **Map 1 ends here** — no depicted
cause for the gap, deliberately. (What happens next — waking in the
forest, found by the group — belongs to Map 2's opening, per the
existing campaign structure doc, and isn't re-covered here.)

---

## 2. Fragment Placement Summary (all 20, clusters reassigned)

| Cluster | Fragments | Scope | Timing |
|---|---|---|---|
| A — World | #0, #1, #6, #9 | Cosmic/world | Early downtown |
| B — This Town | **#13, #14** (lead), then #2, #3, #4, #8 | Local + world | Mid downtown, en route to tower |
| C — You / Cosmic | #5, #10, #11, #7, #12, #15, #16, #17, #19 | Cosmic/identity | Outer chunks, dread/sanity-gated |
| Centerpiece | #18 | Gated behind #11 | Late, once only, never repeated |

---

## 3. Per-Cluster Environmental Staging Notes

- **Cluster A zone (near safehouse):** staging should be
  neutral-to-old. This is the buffer between the dead safehouse and
  the fresh town — a transition, not a reveal.
- **Cluster B zone (mid-downtown):** peak staging density. This is
  where "occupied days ago" needs to be unmistakable — lit windows,
  unfinished tasks, no bodies, no visible violence anywhere. Absence
  of struggle is the actual horror beat here, not gore.
- **Cluster C zone (outer chunks):** staging should thin back out
  toward standard four-years-abandoned decay — these are the parts of
  the map outside whatever radius the relay's dampening ever reached,
  so they were never part of the holdout in the first place. This also
  gives the world a legible edge: downtown-proper is the anomaly, not
  the norm.

---

## 4. Dialogue Script (door/relay throughline, full text)

*Written to slot into existing systems (`state.collected`,
`state.doorKeyStatus`, `state.triedLockedDoor`, tower/minimap unlock,
`showLineBox`, `radioTowerFoundLines`, etc.) — no new state
architecture required beyond what's flagged below.*

### 4.1 Cold Open (wake sequence)
*(Existing eyelid-flutter/glitch title sequence stays as-is. This is
the first line once control passes to the player, replacing/extending
whatever placeholder currently runs first.)*

> **[on-screen, fractured dialogue voice]** "...okay. okay. eyes
> first. floor's still floor. that's — that's something."

> **[a beat later, once they can move]** "Don't know this room. Don't
> know this handwriting on the notebook either. Pretty sure it's
> mine."

### 4.2 First Locked Door Attempt (existing line, kept verbatim)
> "...that's not right. locked — you'd need a key for this."

*(No change. This line needs to survive untouched all the way to the
payoff — the player should be able to quote it back at the door
later.)*

### 4.3 Bed Table (existing line, kept verbatim)
> "nothing in the drawer. key's not here."

### 4.4 Radio Pickup (new framing line, first power-on)
> "...relay seven, holding. if anyone's on this frequency — get to
> the mast. we can't find you until you do."

*(Reuses the tone of `radioTowerHintLines` but is written as the very
first thing the player hears, so "get to the mast" reads as the map's
stated goal, not ambient flavor.)*

### 4.5 Tower Reached (existing `radioTowerFoundLines`, kept)
> "...good, you found the mast. signal's weak but it's holding..."
> "...we've got a rough fix on you now. stay near open ground..."

### 4.6 Relay Activation Beat (new — fires once, quietly, right after tower contact strengthens)
> **[radio, new line]** "...huh. that's odd. something on our end just
> came back online. wasn't us that flipped it."

This is the map's most important new line. It's short, easy to miss,
and deliberately undersells itself — no music sting, no UI flourish,
just one more radio line in the mix. Its entire job is to be
remembered ten minutes later when the door gives.

### 4.7 "Something Changed" Cue (new — fires once, as the player moves back toward the safehouse with `relayActive` true)
> "...seven, you should head back to wherever you started. something
> about your position just... changed. can't explain it better than
> that."

### 4.8 Door Opens (new — the payoff)
> **[player, on approach, before interacting — quoting §4.2 back]**
> "...locked. you'd need a key for this. Yeah. I remember."
> **[on interact — door gives with no resistance, no static burst this
> time (deliberately drop `playFigureStatic()` here — silence reads
> louder than the static did)]**
> **[player]** "No key. It just... stopped being locked. Like whatever
> was holding it shut ran out of reason to."
> **[radio, unprompted, a few seconds later]** "...that's us, seven.
> Or — that's someone being generous about what 'us' means. Don't
> spend too long thinking about which."

That last radio line is the map's closing beat, and it's built to
directly reuse the existing keystone ambiguity ("...it's not us.
whatever's talking back, it's not us...") by inverting it: here, the
voice claims credit instead of denying involvement, and immediately
undercuts its own claim in the same breath. It should NOT resolve
anything — it's the same hook, wearing a different sentence.

---

## 5. Direction Notes for Implementation

- **`playFigureStatic()` omission is intentional.** The first door
  attempt (§4.2) plays the static burst; the successful open (§4.8)
  should play nothing but the door's own physical sound. The contrast
  is the tell that something's different this time, without a single
  new sound asset.
- **Don't gate the door behind 12/12 pages.** Gate it behind
  `state.relayActive` (tower reached + radio collected) — matches the
  "reach the tower" framing already established as the map's stated
  goal, and keeps the fragment-collecting from feeling mandatory for
  progression (per the zone-threshold design — fragments should open
  *areas*, not this specific door).
- **The bed-table dead end stays a dead end.** Nothing should ever
  retroactively explain what was or wasn't in that drawer. The door
  not needing a key at all is the answer to why the key was never
  findable — a joke that only lands if the game never comments on it
  directly.
- **What's behind the door** is intentionally not scripted here —
  that's Map 2's opening, not Map 1's closer. Map 1 should end on the
  open doorway and a light source the player hasn't seen yet (a color
  temperature that doesn't match anything used elsewhere on this map),
  then cut/fade — the reveal itself belongs to the next document, not
  this one.

---

## 6. Guardrails Carried Forward

- Never let any fragment, radio line, or notebook entry explicitly
  state "the choir took them" — the causal chain in §0 should be
  assemble-it-yourself, same standard as the corpse-reveal.
- Never let the operator (WNCORE radio voice) comment on the town's
  specific abandonment — its silence on this specific point is itself
  part of the operator-ambiguity hook (does it not know, or is it not
  saying?).
- Fragment #18 stays a one-time, unrepeated, uncorroborated event, per
  existing guardrail.
- Corpse-reveal (Beat 10) stays fully separate from Som/Nine/"S."
  ambiguity, which remains open until Map 4.
