# Another Sky — Game Plan (start here)

`docs/` has eight files with no map between them (was nine — Map 1's
two overlapping structure docs got merged this round, see below). This
is that map: what each doc actually owns, in what order to read them,
and what's currently open. It doesn't duplicate their content — it
points at it and says why it exists. Update this file's "Current
status" and "Open threads" sections as things ship; leave the per-doc
summaries alone unless a doc's actual scope changes.

## Reading order

**1. World/story canon (read in this order — later docs assume earlier ones):**
1. `another-sky-story-flow.md` — the top-level canon map: the three-story
   Cygnus Signal universe (Simulunas → The Beyonders → Another Sky), how
   they connect, and an `[OPEN]`-tagged list of unresolved lore questions.
   Read this first, always — everything else sits underneath it.
2. `story/ANOTHER_SKY_story_treatment.md` — the actual story treatment for
   the game specifically: premise, the player's deliberately-unresolved
   identity, structural spine.
3. `story/ANOTHER_SKY_new_mystery.md` — one specific canon addition (the
   "four years vs. three withheld years" timeline hook). Extends
   `data/lore.js`/`data/dialogue.js` tone; doesn't contradict anything above.
4. `MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md` — Map 1's full structure, wake to
   blackout, plus the complete door/relay dialogue script and
   implementation notes (merged in from the former
   `story/ANOTHER_SKY_map1_story_direction.md` - that file's beat sheet
   was a strict subset of this one's, but it held the only full copy of
   the dialogue lines, so both now live in this one doc). Supersedes an
   older (not-present-in-this-repo) chapter outline for everything up to
   the corpse-reveal.
5. `MAP1_TONE_INFLUENCES.md` — not a structure doc, an overlay: concrete
   devices mapped onto #4's beats, borrowed from 999/Junji Ito/Bloodborne/
   13 Sentinels. Read #4 first or this won't have anchors to attach to.

**2. Engineering:**
6. `ARCHITECTURE.md` — module structure (migration is complete — `src/` is
   the deployed build, `old/anothersky-horror.html` is archived
   reference-only) and the rendering-performance audit (streaming/pooling/
   culling/LOD status).
7. `HANDOFF.md` — the round-by-round dev log, newest entry at the top,
   standing "Development" maintenance checklist right under the title.
   This is the working diary; ARCHITECTURE.md is the current-state
   snapshot distilled from it. When in doubt about *why* something is
   built a certain way, HANDOFF has the reasoning; ARCHITECTURE has the
   answer.

**3. `README.md`** is the old Phase-2-scaffold intro — stale (still
describes the migration as in-progress; it's done). Kept for now since
`assets/README.md`/the Map 2 asset-pipeline pointer in it is still
accurate; its migration-status framing should defer to this file.

## Current status (keep this section current)

- **Engineering:** module migration complete (`ARCHITECTURE.md`).
  First LOD pass shipped this round, downtown buildings only — greeble
  detail (pilasters/cornice/roof extras) now drops past 90 units,
  full-building cull unchanged at 240. Not yet live frame-time-tested.
- **Recent bug fixes:** hub-btn (☰) portrait tap-through (invisible
  look-zone was eating the tap before it reached the button) —
  see HANDOFF.md's latest rounds for both.
- **Docs:** `story/ANOTHER_SKY_map1_story_direction.md` merged into
  `MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md` and deleted - both covered Map 1
  structure with heavy overlap; the merged doc keeps the fuller beat
  structure plus the full dialogue script the other doc uniquely held.
- **Story/content:** Map 1 ("Downtown Empathy") has a complete beat
  sheet, dialogue script, and tone overlay ready to build against
  (`MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md` + `MAP1_TONE_INFLUENCES.md`).
  Map 2 is referenced (forest wake-up, husk migration) but its own
  structure doc isn't in this repo yet.

## Open threads

- Player-facing changelog (HANDOFF.md's standing "Still open" item).
- LOD: confirm the downtown pass actually helps frame time (FPS
  counter via `?debug=1`), decide if `LOD_DETAIL_DIST=90` is right,
  and decide whether `world/streaming.js`'s procedural chunks need
  their own LOD tier or if unload-radius pooling already covers it.
- `generateDistrict()` (downtown mesh-build) is still one synchronous
  blocking call at load time — separate from the in-play stutter that
  was already root-caused and fixed; only worth revisiting if the
  loading transition doesn't already mask it.
- `isMainMenuIdleEligible()` null-guard (HOTFIX #2 in HANDOFF.md) was
  reasoned from a browser error report but never reproduced directly —
  probably fixed, not confirmed.
- Map 2's own structure/beat-sheet doc doesn't exist yet in this repo.
