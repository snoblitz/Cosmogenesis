// Cosmogenesis - entry point
// Wires together simulation, renderer, state, UI, save/load, and input.

import { Simulation } from './simulation.js';
import { Renderer }   from './renderer.js';
import { GameState }  from './state.js';
import { UI }         from './ui.js';
import { Audio }      from './audio.js';
import { loadGame, saveGame, clearSave, setFreshUntil } from './save.js';
import { ERAS, MIN_ZOOM, FIRST_LIGHT_ERA } from './eras.js';

const canvas = document.getElementById('universe');
const sim    = new Simulation();
const audio  = new Audio();
const renderer = new Renderer(canvas, audio);
const state  = new GameState();
const ui     = new UI();

// --- Load saved game ---
const saved = loadGame();
if (saved) {
  sim.deserialize(saved.sim || {});
  state.deserialize(saved.state || {});
  sim.setEraLevel(state.eraIndex);
  ui.hydrateLaws(state.laws);
  state.wasResumed = true;
  // Validate lens enable state against unlocks (defensive against bad saves).
  if (!state.seenWhispers.has('opening-radio'))   state.radioLensActive    = false;
  if (!state.seenWhispers.has('opening-thermal')) state.lensVisuallyActive = false;
}
// Apply restored audio settings (always, including fresh games).
audio.setVolume(state.settings.radioVolume);
audio.setSustain(state.settings.radioSustain);
ui.setAudio(audio);

// Visual targets:
//   - Before the lens is revealed: clean bright universe, no overlay.
//   - Lens revealed, era < First Light: thermal overlay active.
//   - Era >= First Light: thermal fades out, universe in visible spectrum.
function computeThermalTarget() {
  const lensActive = state.lensVisuallyActive;
  const ignited    = state.eraIndex >= FIRST_LIGHT_ERA;
  if (!lensActive) return 0.0;
  if (!ignited)    return 1.0;
  return 0.0;
}

// --- Canvas sizing & world bounds ---
// World is MIN_ZOOM times bigger than the viewport in each dimension, so even
// at the most pulled-back zoom level the world still fills the screen.
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  renderer.setDPR(dpr);

  const worldW = canvas.width  / MIN_ZOOM;
  const worldH = canvas.height / MIN_ZOOM;
  sim.setBounds(worldW, worldH);
  renderer.setCameraCenter(worldW / 2, worldH / 2);
}
window.addEventListener('resize', resize);
resize();

// Snap visuals to the loaded state so nothing lerps on first frame
renderer.setTargetZoom(ERAS[state.eraIndex]?.zoom ?? 1.0);
renderer.zoom = renderer.targetZoom;
const _initialThermal = computeThermalTarget();
renderer.setTargetThermalAlpha(_initialThermal);
renderer.thermalAlpha = _initialThermal;
// If lens is already active on load (resumed save), skip the scan reveal , 
// the player has already seen it, the overlay is just present.
if (state.lensVisuallyActive) {
  renderer.scanProgress = 1.0;
  renderer.scanActive = false;
}

// Track lens activation so we can trigger the scan reveal exactly once,
// at the moment the player first earns it.
let _prevLensActive = state.lensVisuallyActive;
// Track era index so we can fire era cues exactly once on each forward transition.
let _prevEraIndex = state.eraIndex;

// --- Input ---
// Click/tap = single particle. Hold = continuous flow. Drag = paint a stream.
// Spawn rate ramps up the longer you hold, so charging feels intentional.
let holding = false;
let holdStartAt = 0;
let lastSpawnAt = 0;
const screenPos = { x: 0, y: 0 };

function eventToScreen(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height)
  };
}

function spawnAtScreen(sx, sy) {
  const w = renderer.screenToWorld(sx, sy);
  sim.spawnParticle(w.x, w.y);
  state.potential += 1;
  state.markInteraction(Date.now());
  renderer.addRipple(w.x, w.y);
  // Audio comes from the radio lens detecting matter, not from creation.
}

function currentSpawnInterval() {
  const held = (performance.now() - holdStartAt) / 1000;
  const t = Math.min(1, held / 1.2);
  const eased = t * t * (3 - 2 * t);
  const hz = 9 + eased * 13;
  return 1000 / hz;
}

function tickHold() {
  if (!holding) return;
  const now = performance.now();
  if (now - lastSpawnAt >= currentSpawnInterval()) {
    spawnAtScreen(screenPos.x, screenPos.y);
    lastSpawnAt = now;
  }
  requestAnimationFrame(tickHold);
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const { x, y } = eventToScreen(e);
  screenPos.x = x;
  screenPos.y = y;
  holding = true;
  holdStartAt = performance.now();
  canvas.setPointerCapture(e.pointerId);
  spawnAtScreen(x, y);
  lastSpawnAt = holdStartAt;
  requestAnimationFrame(tickHold);
});

canvas.addEventListener('pointermove', (e) => {
  if (!holding) return;
  const { x, y } = eventToScreen(e);
  screenPos.x = x;
  screenPos.y = y;
});

function endHold(e) {
  holding = false;
  if (e && e.pointerId !== undefined && canvas.hasPointerCapture?.(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
}
canvas.addEventListener('pointerup',     endHold);
canvas.addEventListener('pointercancel', endHold);
canvas.addEventListener('pointerleave',  endHold);
window.addEventListener('blur',          () => endHold());

// --- Reset (two-click to confirm, with visual prompt) ---
const resetBtn = document.getElementById('reset-btn');
let resetArmed = false;
let resetArmTimer = null;

function disarmReset() {
  resetArmed = false;
  resetBtn.classList.remove('armed');
  resetBtn.textContent = '↻';
  resetBtn.title = 'Begin a new universe';
  if (resetArmTimer) { clearTimeout(resetArmTimer); resetArmTimer = null; }
}

const FRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes after reset = no auto-resume

resetBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.classList.add('armed');
    resetBtn.textContent = '✕';
    resetBtn.title = 'Click again to confirm';
    resetArmTimer = setTimeout(disarmReset, 3000);
  } else {
    disarmReset();
    window.__cosmogenesis_disableSave();
    clearSave();
    setFreshUntil(Date.now() + FRESH_WINDOW_MS);
    location.reload();
  }
});

// --- Game loop ---
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  // Keep renderer zoom + thermal in sync with current state
  renderer.setTargetZoom(ERAS[state.eraIndex]?.zoom ?? 1.0);
  renderer.setTargetThermalAlpha(computeThermalTarget());

  // Edge-trigger the thermal scan reveal exactly once per universe.
  // Subsequent toggles of the thermal lens don't re-play the cinematic.
  if (state.lensVisuallyActive && !_prevLensActive && !state.thermalScanDone) {
    renderer.startLensScan();
    state.thermalScanDone = true;
    if (state.requestSave) state.requestSave();
  }
  _prevLensActive = state.lensVisuallyActive;

  // Edge-trigger era audio cues on forward transitions only. Resumed saves
  // initialize _prevEraIndex to the loaded era so past transitions don't
  // re-fire.
  if (state.eraIndex > _prevEraIndex) {
    if (audio && typeof audio.playEraCue === 'function') {
      audio.playEraCue(state.eraIndex);
    }
  }
  _prevEraIndex = state.eraIndex;

  sim.tick(dt);
  state.update(sim, renderer);
  renderer.render(sim, state);
  ui.render(state);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Save scheduling ---
let savingDisabled = false;
function snapshot() {
  if (savingDisabled) return;
  saveGame({ sim: sim.serialize(), state: state.serialize() });
}
state.requestSave = snapshot;          // immediate save on era/whisper changes
setInterval(snapshot, 5000);           // belt-and-suspenders autosave
window.addEventListener('beforeunload', snapshot);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') snapshot();
});

window.__cosmogenesis_disableSave = () => { savingDisabled = true; };

// Keyboard: M to toggle audio mute
window.addEventListener('keydown', (e) => {
  if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    audio.toggleMute();
  }
});

// Expose for debugging in the console
window.__cosmogenesis = { sim, state, ui, renderer, audio, clearSave };
