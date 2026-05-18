// Cosmogenesis - entry point
// Wires together simulation, renderer, state, UI, save/load, and input.

import { Simulation } from './simulation.js';
import { Renderer }   from './renderer.js';
import { GameState }  from './state.js';
import { UI }         from './ui.js';
import { Audio }      from './audio.js';
import { loadGame, saveGame, clearSave, setFreshUntil } from './save.js';
import { ERAS, MIN_ZOOM, FIRST_LIGHT_ERA } from './eras.js';
import { MACRO_CRADLE_THRESHOLD } from './simulation.js';
import './mobile.js';
import './ios-install-hint.js';

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

// --- Wire inspector + context-menu callbacks ---
ui.onMacroRename = (id, newName) => {
  sim.setMacroName(id, newName);
  if (state.requestSave) state.requestSave();
};
ui.onMacroTrackToggle = (id, nextTracked) => {
  sim.setMacroTracked(id, nextTracked);
  if (state.requestSave) state.requestSave();
};
ui.onCatalogEntryClick = (id) => {
  inspectorPinId = id;
};

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
// Tap on a macro (touch only) pins the inspector instead of spawning, with a
// movement slop so accidental drags still paint as expected.
let holding = false;
let holdStartAt = 0;
let lastSpawnAt = 0;
const screenPos = { x: 0, y: 0 };
let pointerInside = false;
let lastPointerType = 'mouse';

// Inspector tracking. Pin survives across frames; hover is re-resolved per
// frame so moving macros are followed correctly. Pending pin holds a candidate
// during the slop window before we commit to "tap" vs "drag".
let inspectorPinId = null;
let pendingPinId = null;
let pendingPinStart = null; // { x, y, pointerId, t }
const TAP_SLOP_PX = 10;     // CSS pixels of movement allowed before tap → drag
const TAP_MAX_MS = 600;     // beyond this, a held finger no longer pins
const LONG_PRESS_MS = 550;  // touch/pen hold-to-open-context-menu threshold

// Long-press timer. When a touch starts on a macro and stays still for
// LONG_PRESS_MS, fire the context menu and cancel the pending pin.
let longPressTimer = null;
let longPressMacroId = null;
let longPressOrigin = null; // { clientX, clientY }

function clearLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
  longPressMacroId = null;
  longPressOrigin = null;
}

// Normalize pointer type so finger contacts on Windows touchscreens that
// erroneously report pointerType='mouse' still get treated as touch. Per
// the Pointer Events spec, real mouse events always report width=height=1;
// finger contacts report a larger area. This catches Surface and other
// devices whose driver/browser combo emulates mouse for finger input.
function effectivePointerType(e) {
  if (!e) return 'mouse';
  const t = e.pointerType || 'mouse';
  if (t === 'mouse' && ((e.width || 0) > 1 || (e.height || 0) > 1)) return 'touch';
  return t;
}

function eventToScreen(e) {
  const rect = canvas.getBoundingClientRect();
  // Touch-only vertical offset: lifts the effective hit point above the
  // fingertip so the spawn isn't hidden under the user's finger. Mouse and
  // pen input are unaffected. Offset is in CSS pixels, scaled to canvas px.
  let cssY = e.clientY - rect.top;
  if (effectivePointerType(e) === 'touch') {
    const off = (state && state.settings && typeof state.settings.touchOffsetPx === 'number')
      ? state.settings.touchOffsetPx : 0;
    if (off) cssY -= off;
  }
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: cssY                    * (canvas.height / rect.height)
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

// Inspector visibility is gated by the thermal lens being active: if you
// can't see macros, you can't inspect them.
function inspectorAllowed() {
  return !!state.lensVisuallyActive;
}

// Effective hit-test padding in world units. We pad in CSS px and convert.
// dpr scales from CSS to internal canvas px; zoom scales internal to world.
function hitPadWorld(cssPx) {
  return (cssPx * renderer.dpr) / renderer.zoom;
}

function pickMacroAtScreen(sx, sy, cssPad) {
  const w = renderer.screenToWorld(sx, sy);
  return sim.pickMacroAt(w.x, w.y, hitPadWorld(cssPad));
}

function macroInspectorData(m, pinned) {
  // Filament count: walk the renderer's live filaments map and count keys
  // whose endpoint ids exactly match this macro.
  let fil = 0;
  if (renderer && renderer._filaments) {
    const id = m.id;
    for (const key of renderer._filaments.keys()) {
      const us = key.indexOf('_');
      if (us <= 0) continue;
      const a = +key.slice(0, us);
      const b = +key.slice(us + 1);
      if (a === id || b === id) fil++;
    }
  }
  const screen = renderer.worldToScreenCss(m.x, m.y);
  const macroRadiusCss = (m.r * renderer.zoom) / renderer.dpr;
  // Subtle one-line discovery hint. Tailored to the input device that most
  // recently moved the pointer; phrasing is intentionally quiet so the panel
  // stays calm.
  let hint = null;
  if (lastPointerType === 'touch') hint = 'Hold for options';
  else                              hint = 'Right-click for options';
  return {
    id: m.id,
    name: m.name || null,
    tracked: !!m.tracked,
    kind: m.mass >= MACRO_CRADLE_THRESHOLD ? 'cradle' : 'structure',
    mass: m.mass,
    absorbed: m.absorbed,
    age: m.age,
    filaments: fil,
    hint,
    screenX: screen.x,
    screenY: screen.y,
    macroRadiusCss,
    pinned: !!pinned
  };
}

function findMacroById(id) {
  if (id == null) return null;
  for (const m of sim.macros) if (m.id === id) return m;
  return null;
}

function resolveInspector() {
  if (!inspectorAllowed()) {
    inspectorPinId = null;
    pendingPinId = null;
    ui.setMacroInspector(null);
    return;
  }

  // Pinned wins. Drop pin if the macro is gone (merged or expired).
  if (inspectorPinId != null) {
    const m = findMacroById(inspectorPinId);
    if (!m) { inspectorPinId = null; }
    else { ui.setMacroInspector(macroInspectorData(m, true)); return; }
  }

  // While the player is spawning, hide hover to keep focus on the act.
  if (holding) { ui.setMacroInspector(null); return; }

  // Touch has no hover concept: don't reveal anything after a touch lifts.
  if (lastPointerType !== 'mouse' && lastPointerType !== 'pen') {
    ui.setMacroInspector(null);
    return;
  }

  if (!pointerInside) { ui.setMacroInspector(null); return; }

  const m = pickMacroAtScreen(screenPos.x, screenPos.y, 10);
  if (m) ui.setMacroInspector(macroInspectorData(m, false));
  else   ui.setMacroInspector(null);
}

function macroMenuOpts(m, clientX, clientY) {
  return {
    macroId: m.id,
    screenX: clientX,
    screenY: clientY,
    kind: m.mass >= MACRO_CRADLE_THRESHOLD ? 'cradle' : 'structure',
    name: m.name || null,
    tracked: !!m.tracked
  };
}

function touchPointerClient(e) {
  // The visible touch pointer should appear where the spawn lands — i.e.,
  // at the offset-adjusted point, in client (viewport) coordinates.
  const off = (state && state.settings && typeof state.settings.touchOffsetPx === 'number')
    ? state.settings.touchOffsetPx : 0;
  return { x: e.clientX, y: e.clientY - off };
}

canvas.addEventListener('pointerdown', (e) => {
  // Only the left mouse button spawns/pins; right-click is handled by the
  // contextmenu listener below.
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const { x, y } = eventToScreen(e);
  screenPos.x = x;
  screenPos.y = y;
  pointerInside = true;
  lastPointerType = effectivePointerType(e);

  if (lastPointerType === 'touch') {
    const p = touchPointerClient(e);
    ui.showTouchPointerAt(p.x, p.y);
  }

  // Touch (or pen) on a macro: tentative pin. We hold off spawning until the
  // pointer either lifts (confirming the tap), moves past the slop (drag), or
  // is held long enough to open the context menu.
  if ((lastPointerType === 'touch' || lastPointerType === 'pen') && inspectorAllowed()) {
    const m = pickMacroAtScreen(x, y, 16);
    if (m) {
      pendingPinId = m.id;
      pendingPinStart = { x, y, pointerId: e.pointerId, t: performance.now() };
      canvas.setPointerCapture(e.pointerId);

      // Schedule long-press: if the user holds still, open the context menu.
      longPressMacroId = m.id;
      longPressOrigin = { clientX: e.clientX, clientY: e.clientY };
      longPressTimer = setTimeout(() => {
        // Re-validate: macro might have moved or merged; refetch by id.
        const mNow = findMacroById(longPressMacroId);
        if (!mNow) { clearLongPress(); return; }
        // Cancel the pending pin: long-press wins.
        pendingPinId = null;
        pendingPinStart = null;
        ui.showMacroContextMenu({ ...macroMenuOpts(mNow, longPressOrigin.clientX, longPressOrigin.clientY), anchorMode: 'right' });
        clearLongPress();
      }, LONG_PRESS_MS);

      return; // no spawn, no hold yet
    }
  }

  // Tapping empty space dismisses any existing pin.
  if (inspectorPinId != null) inspectorPinId = null;

  holding = true;
  holdStartAt = performance.now();
  canvas.setPointerCapture(e.pointerId);
  spawnAtScreen(x, y);
  lastSpawnAt = holdStartAt;
  requestAnimationFrame(tickHold);
});

// Right-click anywhere on the canvas: if on a macro, open the context menu.
// Otherwise suppress the default browser context menu so right-click on empty
// space doesn't surface the OS menu over the simulation.
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!inspectorAllowed()) return;
  const { x, y } = eventToScreen(e);
  const m = pickMacroAtScreen(x, y, 16);
  if (!m) return;
  ui.showMacroContextMenu(macroMenuOpts(m, e.clientX, e.clientY));
});

canvas.addEventListener('pointermove', (e) => {
  const { x, y } = eventToScreen(e);
  screenPos.x = x;
  screenPos.y = y;
  pointerInside = true;
  if (e.pointerType) lastPointerType = effectivePointerType(e);

  if (lastPointerType === 'touch') {
    const p = touchPointerClient(e);
    ui.showTouchPointerAt(p.x, p.y);
  }

  // If we have a pending pin (touch/pen on a macro), watch for drag.
  if (pendingPinId != null && pendingPinStart) {
    const rect = canvas.getBoundingClientRect();
    const dxCss = (x - pendingPinStart.x) * (rect.width  / canvas.width);
    const dyCss = (y - pendingPinStart.y) * (rect.height / canvas.height);
    const dist  = Math.hypot(dxCss, dyCss);
    const aged  = performance.now() - pendingPinStart.t;
    if (dist > TAP_SLOP_PX || aged > TAP_MAX_MS) {
      // Treat as a paint gesture from this point forward. Don't retro-spawn.
      pendingPinId = null;
      pendingPinStart = null;
      clearLongPress();
      holding = true;
      holdStartAt = performance.now();
      lastSpawnAt = 0;
      spawnAtScreen(x, y);
      lastSpawnAt = holdStartAt;
      requestAnimationFrame(tickHold);
    }
  }
});

function endHold(e) {
  // Resolve any pending pin first. If the pointer lifted while still close to
  // its origin, commit the pin. Otherwise it was already promoted to a hold.
  if (pendingPinId != null) {
    inspectorPinId = pendingPinId;
    pendingPinId = null;
    pendingPinStart = null;
  }
  clearLongPress();
  holding = false;
  if (e && e.pointerId !== undefined && canvas.hasPointerCapture?.(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
  // Touch lifts off → pointer is no longer "inside" for hover purposes.
  if (e && (e.type === 'pointerup' || e.type === 'pointercancel')) {
    if (lastPointerType === 'touch') pointerInside = false;
  }
  // Always hide the touch pointer overlay on lift/cancel/leave.
  if (ui && ui.hideTouchPointer) ui.hideTouchPointer();
}
canvas.addEventListener('pointerup',     endHold);
canvas.addEventListener('pointercancel', endHold);
canvas.addEventListener('pointerleave',  (e) => {
  pointerInside = false;
  endHold(e);
});
window.addEventListener('blur',          () => { pointerInside = false; endHold(); });

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

canvas.addEventListener('pointerenter', (e) => {
  pointerInside = true;
  if (e.pointerType) lastPointerType = effectivePointerType(e);
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
  resolveInspector();
  ui.renderCatalog(sim, inspectorPinId, MACRO_CRADLE_THRESHOLD);

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

// --- Mute button (bottom-right, above settings) ---
// Uses the same speaker-with-diagonal-strike iconography as the radio lens
// instrument toggle. CSS handles the strike fade-in via the .muted class.
const muteBtn = document.getElementById('mute-btn');
function syncMuteBtn() {
  if (!muteBtn) return;
  const muted = !!audio.muted;
  muteBtn.classList.toggle('muted', muted);
  muteBtn.title = muted ? 'Unmute audio (M)' : 'Mute audio (M)';
  muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
}
syncMuteBtn();
if (muteBtn) {
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.toggleMute();
    syncMuteBtn();
  });
  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
}

// Keyboard: M to toggle audio mute (keep the shortcut; sync the button afterward).
window.addEventListener('keydown', (e) => {
  if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    // Ignore when typing in a text input (e.g. the macro rename field).
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    audio.toggleMute();
    syncMuteBtn();
  }
});

// Expose for debugging in the console
window.__cosmogenesis = { sim, state, ui, renderer, audio, clearSave };
