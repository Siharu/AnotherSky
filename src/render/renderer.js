// ---------- RENDERER SETUP ----------
// Real module (Wave 3) - but not the split originally planned. See
// docs/HANDOFF.md: once renderer/scene/camera/baseDPR moved to
// core/scene.js in Wave 2, the only THREE-renderer-adjacent logic left in
// main.js was applyResolution() - and that reads settingsResScale, which
// is settings.js-owned state. Splitting a whole module out for a single
// function that's 90% "read another module's state" would have meant a
// live circular import (settings.js <-> renderer.js) for zero real
// separation of concerns.
//
// applyResolution() now lives in systems/settings.js (it's cohesive with
// the resolution slider that mutates settingsResScale). This file
// re-exports it so any call site expecting render/renderer.js to own
// resolution logic - per the original ARCHITECTURE.md file list - still
// resolves correctly.
export { applyResolution } from '../systems/settings.js';
