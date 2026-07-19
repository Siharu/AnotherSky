# ANOTHER SKY — New Mystery Material
*Authored addition — extends `data/lore.js` and `data/dialogue.js` tone/canon. Nothing here contradicts existing fragments; everything is written to sit beside them.*

---

## Anchor: Why Four Years Matters

Existing canon already gives us a gap — lore #4, *"2028–2031,"* three years withheld from every record. The WNCORE lore elsewhere pins the outbreak start around April 2032. If the player is waking up now, roughly four years past that start, that puts the game's present at **~2036** — one year past the three withheld years, plus one more year nobody's accounted for at all.

That's the hook: **the missing years everyone talks about were 2028–2031. It's now 2036. There's a fourth gap nobody has named yet, because it's still happening, and the player is standing inside it.**

The world blames the sky for '28–'31. Nobody's noticed that whatever happened then never actually stopped — it just got quiet enough to mistake for over. The player's memory loss isn't just personal amnesia. It's the same withholding mechanism the historical record shows, happening to one person in real time instead of to three years all at once.

---

## New Lore Fragments (proposed additions, ids 12–19, same voice/format as `LORE`)

```
{ id:12, title:"The Fourth Year", text:"Everyone agrees the sky opened once, between '28 and '31, and closed. Nobody has agreed on what to call the years since, because agreeing would mean admitting it never closed. It just got patient." },
{ id:13, title:"Relay Seven", text:"There were six relays before this one. Nobody who staffed them is on record as having left. WNCORE's own logs call that turnover. Turnover implies somewhere to turn over to." },
{ id:14, title:"The Choir", text:"Before the static, relay seven used to pick up something between frequencies — dozens of voices, overlapping, none of them finishing a sentence. Ops called it the choir. Nobody's heard it in two years. Some say that's an improvement." },
{ id:15, title:"What the Husks Remember", text:"A husk will walk the same six blocks for a year and never vary the route. Feed one a familiar sound — a name, a doorbell, a particular song — and it stops. Just once. Just for a second. Nobody has found out what it's remembering, because it starts walking again before anyone can ask." },
{ id:16, title:"Withheld", text:"Three years, taken whole, filed as though they were an accident. But an accident doesn't need a filing system. Someone built the shape that '28–'31 gets poured into before it ever happened. That takes planning. Planning takes a planner." },
{ id:17, title:"Address Book", text:"Found a list, water-damaged, in a Relay Seven drawer: names, and beside each one, not an address — a coordinate pair with no matching map. Cross-referenced against nothing. 'S.' isn't on it. Something about that is worse than if it had been." },
{ id:18, title:"The Second Signal", text:"Everyone quotes the eleven words — they lied to us. send help. Fewer people mention the second transmission, thirty seconds later, same frequency, no static, perfectly clean: four words. we are the help. Nobody has decided if that's a correction or a confession." },
{ id:19, title:"Four Years, Give or Take", text:"Ask anyone how long it's been since the sky opened and you'll get 'about four years' — never a date, never a count of days. Time got vague on purpose, somewhere. Vague is easier to live inside than exact. Exact would mean someone's counting, and counting means someone's still trying to leave." }
```

**Fragment #18 ("The Second Signal")** is the new centerpiece — it directly reframes existing lore #11 (*"they lied to us. send help"*) by revealing there's a second half nobody talks about: *"we are the help."* That single line does the most work in this whole document: it can be read as WNCORE correcting a misunderstanding, or as the thing on the other end of the radio finally telling the truth about what it is. It should be gated behind having already found #11, so the player meets the incomplete version first and the completed, worse version second.

---

## New Radio Lines (extends `dialogue.js` pools)

```js
export const radioFourYearLines = [
  "...four years. give or take. nobody keeps an exact count anymore, and that's on purpose...",
  "...relay six, five, four — before my time, all of them. turnover, they call it...",
  "...you want to know what year it really is? so do we...",
];

export const radioChoirLines = [
  "...used to be able to pick up others between frequencies. dozens of them, talking over each other. haven't heard the choir in two years...",
  "...if the choir comes back, seven, do not answer it. do not even acknowledge you heard it...",
];
```

`radioFourYearLines` slots into the same threshold system as the existing pools — surface it once the player has collected fragment #12 or #19, so the radio starts confirming (or half-confirming) what the player just read, the same way it already does for dread/sanity states.

---

## Notebook Addendum (extends the 12 entries from the treatment)

**13. After finding "The Fourth Year":** *"Did the math twice. Four years. Wrote '2036' at the top of this page and stared at it until it stopped looking like a real number."*

**14. After finding "The Second Signal":** *"we are the help. Four words. Nobody mentions those four words. I keep mentioning them to myself, quietly, to see if saying it out loud changes what it sounds like. It doesn't."*

This keeps the notebook doing what it already does — escalating doubt, never delivering proof — while giving it a second engine besides "am I one of the Nine" to run on: *what year is it, actually, and who decided I didn't need to know.*

---

## How This Threads Into the Existing Ambiguity (not a new answer, a new question)

The operator-ambiguity hook already asks: *is the voice on the radio "us" or not?* This material adds a second, compatible question that never resolves either: *is the missing time in the record (2028–2031) the same phenomenon as the missing time in the player's own memory — and if the world's three-year gap never actually ended, has "four years since" ever meant what everyone assumes it means?*

Both questions should be left open at credits, same as before. If anything, "The Second Signal" is the one piece of new material weighty enough to *almost* answer the operator question — which is exactly why it should never be confirmed, corrected, or followed up on by any other line in the game. Let it sit there once, fully clean, no static, and never be repeated.
