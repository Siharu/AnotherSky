# ANOTHER SKY — Story Treatment
*Working document — v1*

---

## Premise

You wake in a safehouse with no memory of how you got there, or of much else. A voice on a relay radio calls you "seven" and tells you to find the tower. The sky outside is wrong in a way that gets worse the longer you look at it, and the longer you remember.

The player is never told who they are. They may be one of the Nine. They may be Som. They may be no one the canon has a name for — a survivor the wider Cygnus Signal story never accounts for, brushing up against Som, WNCORE, and the Ghuuls without ever being folded into them. Both readings stay available at the credits. This ambiguity is the spine of the piece, not a gap to be patched later.

---

## Structural Spine (Walking-Sim Loop)

1. **Wake** — safehouse, no memory, tutorial movement/interaction.
2. **Orient toward the tower** — radio establishes the goal (`radioTowerHintLines`), dread and sanity begin ticking.
3. **Explore** — collect the 12 memory fragments (lore orbs) scattered through downtown and the streamed outer chunks, in mostly-open order.
4. **Reach the tower** — minimap unlocks, WNCORE contact strengthens (`radioTowerFoundLines`), the game's midpoint.
5. **Escalate** — eye storm at the 5-minute mark, the Monolith more visible, dread/glitch pushed toward "extreme," sanity fraying (`radioLowSanityLines`, `playerLowSanityLines`).
6. **Operator turn** — the radio voice becomes suspect. The line that was always there — *"it's not us. whatever's talking back, it's not us"* — stops sounding like background flavor and starts sounding like a confession.
7. **Confrontation** — an ambiguous final source (safehouse / tower / a last memory) that never fully resolves who the protagonist is or what "S." means.
8. **Ending** — one of several, chosen by player state, none narratively privileged as "true."

---

## The Operator-Ambiguity Hook (existing, confirmed)

This is already seeded in the shipped dialogue data and is the thread the whole reveal gets built around — nothing new needs inventing, only escalating:

- **`radioHuntLines`**: *"...that's not us moving on your position..."* — first crack. Early/mid game, delivered like routine caution.
- **`radioLowSanityLines`**: *"...i already told you that. why are you asking again..."* and *"...this channel doesn't exist anymore. stop listening..."* — the operator starts contradicting its own timeline.
- **The keystone line**: *"...it's not us. whatever's talking back, it's not us..."* — by design, this can be read two ways:
  - (a) the operator is warning the player about a **third party** impersonating WNCORE on the frequency, or
  - (b) the operator is admitting that **it** is the thing that isn't "us" — that whatever has been talking to the player is not the WNCORE relay crew at all, and hasn't been for a while.

Neither reading is confirmed or denied at any point. The treatment's job is to make sure both remain fully load-bearing all the way to the end — the same way "S." (lore #5) and the Nine (lore #10) stay unconfirmed. This mirrors lore #7, *"A Warning, Too Late"*: the more the player listens, remembers, collects — the more of them the sky (or the operator, or both) can find. Continuing to play IS the horror.

**Escalation plan for the hook**, tied to sanity/dread thresholds rather than fixed timers, so it always lands where the player currently is emotionally:

| Trigger | Line pool | Effect |
|---|---|---|
| First 2 lore fragments collected | `radioAmbientLines` | Establishes normal-sounding contact |
| Tower reached | `radioTowerFoundLines` | Contact "strengthens" — false relief |
| Dread crosses mid threshold | `radioHuntLines` | First "that's not us" |
| Sanity crosses low threshold | `radioLowSanityLines` | Operator contradicts itself, forgets exchanges |
| Eye storm active | `playerEyeStormLines` + a repeat of the keystone line, degraded/pitched differently | Player line ("that's not stars... okay, don't count them") is intercut with the radio line so both voices say "not us" back to back — deliberately inviting the player to wonder if they're the same voice |

---

## The Twelve Memory Fragments (existing `LORE` array — story-mapped)

The 12 fragments are not found in a fixed order (open exploration), but they resolve into three loose clusters. Suggested pacing gates (soft, not hard-locked) below tie each fragment to where the player likely is in the loop:

**Cluster A — What Happened to the World** *(early game, safehouse periphery / downtown core)*
- #0 The Fog of Medusa — the sky as wound, not weather
- #1 Husks — the truth that empties instead of kills
- #6 What the Sky Knows — "not an invasion... a revelation"
- #9 The Rain of Obsedia — black rain that marks, remembers the shape of you

**Cluster B — What Happened to the People** *(mid game, en route to / around the tower)*
- #2 The Infected — still know, still feel themselves replaced
- #3 Ghuuls — "it learned your face from the inside"
- #4 2028–2031 — three years withheld from every record
- #8 WNCORE — broadcasting "out of habit more than hope"

**Cluster C — What Happened to You** *(late game, outer streamed chunks, gated loosely behind dread/sanity thresholds so they surface once the player is already unsettled)*
- #5 S. — "an address the sky still knows how to reach"
- #10 The Nine — Som-shaped hole, "subtracted," not dead, not missing
- #11 A Signal, Decoded — "they lied to us. send help." — nobody agrees who sent it or when
- #7 A Warning, Too Late — the meta-fragment; tells the player to stop reading, knows they won't

Fragment #7 should be the *last* of the twelve the player is statistically likely to find (weighted spawn/late-chunk placement), so it lands as commentary on everything already collected rather than a random early pickup.

---

## Notebook Entries (new — diegetic player-authored text, tied to progression)

Distinct from the lore orbs (found world-text) and the radio (external voice), the notebook is the player character's *own* handwriting — the one place the ambiguity is written from the inside. Entries should read like someone trying to hold onto a self they're not sure is theirs.

1. **On waking (safehouse):** *"Don't know this handwriting. Pretty sure it's mine."*
2. **After first lore fragment:** *"I read that and some part of me flinched like I already knew it. Filed away, not learned."*
3. **After tower sighted (far):** *"If anything still talks on this continent, it talks through that. I need eyes on this place."* — mirrors `playerTowerFarLines`, written down instead of spoken, showing the player is narrating themselves in real time.
4. **After tower reached:** *"Signal's weak. So is the feeling that this is good news."*
5. **First dread spike:** *"The sky isn't supposed to look like that. Didn't need a word for wrong. Had one anyway."*
6. **After a `radioHuntLines` moment:** *"They said 'that's not us.' Didn't ask them who 'us' is. Didn't want the answer fast enough."*
7. **Sanity crossing low threshold:** *"I keep filling in the gaps myself. That's the part that scares me — how easy it is."* (direct callback/escalation of the existing `playerLowSanityLines` entry — same voice, now written down as if to prove it still can be)
8. **After finding "S." fragment:** *"Wrote my own name at the top of this page to check. Crossed it out. It didn't look wrong. That's worse than if it had."*
9. **After finding "The Nine" fragment:** *"Nine people, one hole. If I'm one of the nine, this page should feel like coming home. It doesn't. Doesn't feel like anything I recognize as home, or anything I recognize as not-home either."*
10. **Eye storm onset:** *"Don't count them. Writing that down so future-me doesn't have to relearn it."*
11. **Post-eye-storm, near tower a second time:** *"The voice on the radio used my last line back at me before I said it. I don't have a version of this where that's fine."* — the operator-ambiguity hook made explicit in the player's own hand, no external confirmation given either way.
12. **Final entry, pre-climax (left blank on the page except for one line):** *"If this is the last page, I'd rather it end with a question than a lie."*

The notebook should never resolve #8 or #9. It should get *more* uncertain as it goes, not less — the opposite arc of a normal journal, which usually moves toward clarity.

---

## Climax — The Ambiguous Confrontation

Three candidate "sources" for the climax, kept genuinely interchangeable in design terms (same beat, different dressing) so the specific choice can be made in production without changing the throughline:

- **The Safehouse** — the player returns to where they woke and finds it altered/wrong, suggesting the "safe" starting point was never external to the phenomenon.
- **The Tower** — the relay itself turns out to be broadcasting on a loop that includes the player's own voice lines from earlier in the session, playing back before the player says them.
- **A Final Memory** — an orb/fragment that, unlike the other twelve, is presented in first person and addressed to "you," collapsing the distance between world-lore and player-identity.

Recommend **the Tower**, since it's the existing spatial/mechanical centerpiece (minimap unlock, contact milestone) and reusing it for the climax means the whole map already points there twice — once for hope, once for dread — without needing new geography.

At the climax, the keystone line recurs a final time, degraded/re-pitched, immediately followed by the player's own recorded call-out lines (`playerCallOutLines`) playing back at the wrong time — before the player says them, or in a voice not quite theirs. No character (the operator, "S.," the Nine) ever steps forward to confirm or deny anything. The confrontation is with the ambiguity itself, not with a monster wearing an explanation.

---

## Endings (multiple, unranked)

All endings should be reachable through player state (sanity/dread thresholds, fragments collected, time survived) rather than a single dialogue choice, so the ambiguity feels emergent rather than menu-selected.

1. **Escape** — player reaches an extraction point (or simply keeps walking past the map's edge as chunks stop generating). The radio goes quiet. No confirmation the escape is real, geographically sound, or even survivable past the credits.
2. **Ghuul Transformation** — sanity/dread bottom out; the last thing rendered is the player's own reflection (puddle, window) not moving in sync with the player's input. Ambient text: *"— eyes. and the way it stands too still in the rain."* (echoing lore #3 back at the player without saying so directly.)
3. **Becoming "S."** — triggered by having collected fragment #5 and #10 and reaching the tower at high dread; the notebook's crossed-out name (entry #8) reappears, uncrossed, in a font/hand that isn't quite the player's.
4. **Another Loop** — the game returns the player to the safehouse wake-up beat, notebook intact but one new entry already written in that the player didn't write, implying recursion rather than resolution. This is the ending most in conversation with the Cygnus Signal Series' central thesis — *the only humane response to unbearable truth is to bear it* — since it refuses even the comfort of an ending.

None of the four should be flagged in-game as "canon," "best," or "true." Credits/epilogue text should stay in the same withholding register as lore #7 and the keystone radio line — offering no closure on Som, the Nine, or who was on the other end of the radio.

---

## Guardrails for Drafting Scenes/Dialogue Later

- Never let a fragment, notebook entry, or radio line **confirm** the protagonist is/isn't one of the Nine, Som, or "S." Every new line should be checked against: *does this foreclose either reading?* If yes, cut or rewrite.
- The operator's dialogue should drift from *reassuring* → *inconsistent* → *uncanny* without ever crossing into a jump-scare "reveal" moment. The horror is cumulative doubt, not a twist.
- Player-authored notebook text should escalate in self-doubt, not in evidence. It should sound like someone losing confidence in their own authorship of their own hand, not like someone solving a mystery.
- Keep new world-voice lines consistent with existing tone: short, plain-spoken, present-tense dread, minimal punctuation drama (matches `LORE` and `dialogue.js` house style — no exclamation points, no melodrama).
