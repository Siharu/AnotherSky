# Another Sky — Project Structure (Phase 2 scaffold)

This is the modularization scaffold for `anothersky-horror.html`.
**The monolith remains the deployed, working build** — nothing here
replaces it yet. This tree is where code moves *into*, one verified
piece at a time.

- `docs/ARCHITECTURE.md` — full migration map: what's already moved,
  what's stubbed, what order to pull the rest in, and how to verify
  each step before moving to the next.
- `docs/HANDOFF.md` — existing project handoff notes (carried over).
- `src/` — the module tree. 5 files are real, working, verified ESM
  right now (`data/lore.js`, `data/dialogue.js`, `utils/dom.js`,
  `utils/math.js`, `audio/sfx.js`). Everything else is a documented
  stub pointing at its target monolith line range.
- `assets/` — the pipeline for Map 2's real low-poly models (Map 1
  stays fully procedural). See `assets/README.md` for art direction,
  poly budgets, and the naming convention, and
  `assets/models/map2/manifest.json` for the (currently empty) asset
  registry.

## Next step

Pick one Wave-2 file from `docs/ARCHITECTURE.md`, pull the real code
in from the monolith, syntax-check it, wire it up, and do a live
in-browser pass before touching the next one. Don't pull more than one
Wave-3 file per sitting — those have the most fan-out and are the
easiest to break silently.
