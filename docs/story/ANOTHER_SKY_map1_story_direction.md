# ANOTHER SKY — Map 1 Story Direction & Dialogue
*Authored beat sheet + script. Written to slot into existing systems (`state.collected`, `state.doorKeyStatus`, `state.triedLockedDoor`, tower/minimap unlock, `showLineBox`, `radioTowerFoundLines`, etc.) — no new state architecture required beyond what's flagged below.*

---

## The Big Idea for This Map

The locked door was never a key problem. "Key's not here" (the existing bed-table dead end) is left standing exactly as-is — it's not a bug in the design, it's the joke the whole map is setting up. The door isn't secured with a lock that opens with a key. It's held by a **ward plate wired to Relay Seven's power loop** — the same relay the player spends the whole map walking toward. Nobody in-world calls it a ward; the player character doesn't know that word either. They just know: *it's locked, there's no key, and then one day it isn't locked anymore, and the timing lines up exactly with the tower coming back online.*

That gives the map a genuine goal-and-payoff structure instead of "collect things until a timer fires":
**Reach and activate the tower → the safehouse's locked door loses its hold → the player has a reason to walk all the way back → what's behind it is the hook into Map 2.**

This also feeds the operator-ambiguity hook one more time for free: the player never learns *who* wired the door to the relay, or why. WNCORE will take partial credit for it over the radio. Whether to believe that is left exactly as unresolved as everything else.

---

## Beat Sheet (with trigger conditions)

| # | Beat | Trigger | State touched |
|---|---|---|---|
| 1 | Cold open / wake | game start | `state.started = true` |
| 2 | Tutorial: move, notebook, radio pickup | first few seconds | existing |
| 3 | First locked-door attempt (optional, early) | player interacts with door | `state.triedLockedDoor`, `state.doorKeyStatus='searching'` |
| 4 | Bed table dead end (existing, untouched) | player checks nightstand while searching | `state.doorKeyStatus='notHere'` |
| 5 | Downtown exploration, Cluster A pages | open | `state.collected` |
| 6 | Radio starts hinting at the tower | after 2 pages | existing `radioTowerHintLines` |
| 7 | Tower reached, minimap unlocks | player reaches `RADIO_TOWER_POS` | existing |
| 8 | **Relay activation beat (new)** | tower reached AND radio collected | new: `state.relayActive = true` |
| 9 | Escalation: eye storm, Cluster B/C pages, operator ambiguity building | ongoing after tower | existing systems |
| 10 | **"Something changed" radio cue (new)** | `state.relayActive` true AND player is a set distance from safehouse | new radio line pool, one-shot |
| 11 | **Return to safehouse, door beat (new)** | player re-enters `LOCKED_DOOR_POS` radius with `state.relayActive` true | new: `state.doorUnlocked = true`, reuses `tryLockedDoor()` flow |
| 12 | Door opens, reveal / map-1 closer | player interacts with unlocked door | transition hook to Map 2 |

Beat 8 doesn't need to be visible to the player immediately — it can fire silently the moment the tower's reached, so the payoff at beat 11 feels like the world quietly kept a promise rather than a scripted cutscene announcing itself.

---

## Dialogue Script

### 1. Cold Open (wake sequence)
*(Existing eyelid-flutter/glitch title sequence stays as-is. This is the first line once control passes to the player, replacing/extending whatever placeholder currently runs first.)*

> **[on-screen, fractured dialogue voice]** "...okay. okay. eyes first. floor's still floor. that's — that's something."

> **[a beat later, once they can move]** "Don't know this room. Don't know this handwriting on the notebook either. Pretty sure it's mine."

### 2. First Locked Door Attempt (existing line, kept verbatim)
> "...that's not right. locked — you'd need a key for this."

*(No change. This line needs to survive untouched all the way to the payoff — the player should be able to quote it back at the door later.)*

### 3. Bed Table (existing line, kept verbatim)
> "nothing in the drawer. key's not here."

### 4. Radio Pickup (new framing line, first power-on)
> "...relay seven, holding. if anyone's on this frequency — get to the mast. we can't find you until you do."

*(Reuses the tone of `radioTowerHintLines` but is written as the very first thing the player hears, so "get to the mast" reads as the map's stated goal, not ambient flavor.)*

### 5. Tower Reached (existing `radioTowerFoundLines`, kept)
> "...good, you found the mast. signal's weak but it's holding..."
> "...we've got a rough fix on you now. stay near open ground..."

### 6. Relay Activation Beat (new — fires once, quietly, right after tower contact strengthens)
> **[radio, new line]** "...huh. that's odd. something on our end just came back online. wasn't us that flipped it."

This is the map's most important new line. It's short, easy to miss, and deliberately undersells itself — no music sting, no UI flourish, just one more radio line in the mix. Its entire job is to be remembered ten minutes later when the door gives.

### 7. "Something Changed" Cue (new — fires once, as the player moves back toward the safehouse with `relayActive` true)
> "...seven, you should head back to wherever you started. something about your position just... changed. can't explain it better than that."

### 8. Door Opens (new — the payoff)
> **[player, on approach, before interacting — quoting beat 2 back]** "...locked. you'd need a key for this. Yeah. I remember."
> **[on interact — door gives with no resistance, no static burst this time (deliberately drop `playFigureStatic()` here — silence reads louder than the static did)]**
> **[player]** "No key. It just... stopped being locked. Like whatever was holding it shut ran out of reason to."
> **[radio, unprompted, a few seconds later]** "...that's us, seven. Or — that's someone being generous about what 'us' means. Don't spend too long thinking about which."

That last radio line is the map's closing beat, and it's built to directly reuse the existing keystone ambiguity ("...it's not us. whatever's talking back, it's not us...") by inverting it: here, the voice claims credit instead of denying involvement, and immediately undercuts its own claim in the same breath. It should NOT resolve anything — it's the same hook, wearing a different sentence.

---

## Direction Notes for Implementation

- **`playFigureStatic()` omission is intentional.** The first door attempt (beat 2) plays the static burst; the successful open (beat 8) should play nothing but the door's own physical sound. The contrast is the tell that something's different this time, without a single new sound asset.
- **Don't gate the door behind 12/12 pages.** Gate it behind `state.relayActive` (tower reached + radio collected) — matches the "reach the tower" framing already established as the map's stated goal in beat 4, and keeps the fragment-collecting from feeling mandatory for progression (per the zone-threshold design from the last pass — fragments should open *areas*, not this specific door).
- **The bed-table dead end stays a dead end.** Nothing should ever retroactively explain what was or wasn't in that drawer. The door not needing a key at all is the answer to why the key was never findable — a joke that only lands if the game never comments on it directly.
- **What's behind the door** is intentionally not scripted here — that's Map 2's opening, not Map 1's closer. Map 1 should end on the open doorway and a light source the player hasn't seen yet (a color temperature that doesn't match anything used elsewhere on this map), then cut/fade — the reveal itself belongs to the next document, not this one.
