/* ============================================================
   core/state.js — shared mutable game state + world/movement
   constants, extracted verbatim from the monolith (main.js
   lines 56-97 as of the module split).

   Per ARCHITECTURE.md's stated boundary: this module exports the
   mutable `state` object and constants; every other module imports
   `{ state }` and reads/writes it directly, matching the monolith's
   original single-scope behavior - only where the code physically
   lives has changed, not how it behaves.
   ============================================================ */

// Bump this on every meaningful deploy. Logged to console on load and
// shown small in the credits screen (see ui/credits.js) so a bug report
// can actually be tied to a specific code version instead of guessing
// which round of fixes someone is or isn't running. Not tied to
// CURRENT_SAVE_VERSION in systems/save.js on purpose - save-shape
// changes and general code changes don't happen on the same cadence,
// conflating them would make this number lie about one or the other.
export const GAME_VERSION = '0.1.0';

const state = {
  started:false,
  yaw: Math.PI * 0.15,
  pitch: -0.03,
  playerX: -60, playerZ: 45, // radio tower landmark sits at (0,0) - spawn away from it so walking up to it and unlocking the minimap is an actual discovery, not instant on start
  moveKeyboard: {x:0,y:0},
  moveJoystick: {x:0,y:0},
  dread: 0,
  stormDreadBoost: 0,          // temporary forced-dread floor during the eye-storm event
  knockback: {x:0, z:0},       // decaying impulse, e.g. from the window figure's shove
  walkTime: 0,
  distanceTraveled: 0,        // cumulative world units actually walked since wake - an action-based gate (see updatePlayer/updateWindowFigure) for events that shouldn't fire on a raw boot clock while the player is standing still reading a notebook
  elapsed: 0,                 // real seconds since the game started (kept for other unrelated timers - eye storm, window figure)
  skyWrongness: 0,             // 0 = the calm grey sky you wake up under, 1 = fully "another sky" (red/veined/hole visible)
  skyEventTriggered: false,   // the curdle no longer starts on a raw clock - see updateSky(): fires on reaching the tower or on prolonged idle
  skyEventClock: 0,            // seconds since skyEventTriggered flipped true; drives skyWrongness/bleed ramps instead of raw state.elapsed
  idleTimer: 0,                 // seconds since the player last actually moved (post-wake) - one of the two sky-event triggers
  breachShake: 0,              // 0..1, spikes when a sky-horror shoves through the cloud layer
  collected: new Set(),
  nearOrbId: -1,
  muted:false,
  autosaveEnabled:true,
  portraitBlocked:false,
  /* systemic layer additions */
  noise: 0,                 // 0..1, derived from movement magnitude, drives ghuul hearing
  sanity: 1,                 // 1 clear -> 0 corrupted; degrades under sustained hunt/dread
  radioOn:false,
  minimapUnlocked:false,
  radioCollected:false,
  firstBroadcastDone:false,
  doorwayLightSeen:false,
  insightGlimpseShown:false,
  nearCalendar:false,
  nearStorageDrawer:false,
  calendarRead:false,
  storageDrawerOpened:false,
  nearRadio:false,
  nearNotebook:false,
  nearLockedDoor:false,          // safehouse locked room door - see tryInteract()/showLineBox
  nearBedTable:false,            // bedside table in the safehouse - checkable once the key quest starts
  nearAnsweringMachine:false,    // answering machine prop near lore fragment #14 ("The Choir") - Beat 5's 999 device
  // Was a bare `export let titleScreenActive` in ui/titleScreen.js. That
  // module has a documented, deliberate circular import back to main.js
  // (radioPickupMesh/playWakeDialogue/stopMenuAmbience) - fine for
  // functions (hoisted), but a `let` export's live binding can end up
  // permanently in the temporal-dead-zone depending on which module
  // triggers evaluation of the cycle first, which is exactly what broke
  // in the browser (main.js:2748 "Cannot access 'titleScreenActive'
  // before initialization", on every single animate() frame - the
  // titleScreen.js module record itself was left in an errored/
  // unresolved state by the cycle). Plain object-property reads have no
  // TDZ, so moving it onto `state` sidesteps the whole class of bug
  // regardless of import order. See ui/titleScreen.js's setter.
  titleScreenActive:true,
  triedLockedDoor:false,         // first attempt gets the full static+line beat; repeats just re-fire the static
  doorKeyStatus:'none',          // 'none' -> 'searching' (after first try) -> 'notHere' (after checking the bed table)
  relayActive:false,             // true the moment the tower's reached AND the radio's been collected (see updateRadioTower()) - the locked door is wired to this, not to any key
  relayLineShown:false,          // one-shot "something on our end just came back online" radio beat, fires right after relayActive flips true
  returnCueShown:false,          // one-shot "you should head back to wherever you started" cue, fires once the player's moving back toward the safehouse with relayActive true
  doorUnlocked:false,            // true once the player actually opens the (now-unlocked) locked door - stops the static/jitter treatment for good
  enteredMap2:false,             // true once the map1-closer beat has fired - the door dialogue's natural endpoint, ready for real Map 2 content to hang off later
  nearBatteryId:-1,
  warnedBearing:null,         // angle (rad) the radio last warned about, for director follow-through
  radioLog:[],                 // persisted transmission history for the in-game Radio Log panel - broadcastRadio() pushes to this
  notebookEntriesShown: [],      // ids of data/notebook.js NOTEBOOK_ENTRIES already surfaced - progressive, never re-shown once written (MAP1_DOWNTOWN_EMPATHY_STRUCTURE.md §1 notebook beats)
  warnedBearingExpires:0,
  windX: 0.6, windZ: 0.35, windTarget: 0,  // global wind direction, drifts over time
  windGust: 0, windGustTimer: 3+Math.random()*4,  // periodic gusts so wind has a felt presence
  forgetting: 0  // 0 clear -> 1 fully lost; climbs steadily, only pulled back by remembering
};

const EYE_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.55;
const WORLD_RADIUS = 230;
const SPEED = 4.8;
const LOOK_SENS_TOUCH = 0.0054;

export { state, EYE_HEIGHT, PLAYER_RADIUS, WORLD_RADIUS, SPEED, LOOK_SENS_TOUCH };
