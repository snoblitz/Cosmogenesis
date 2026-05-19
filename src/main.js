// Cosmogenesis - entry point
// Wires together simulation, renderer, state, UI, save/load, and input.

import { Simulation } from './simulation.js';
import { Renderer }   from './renderer.js';
import { GameState, emitterDeployCost }  from './state.js';
import { UI }         from './ui.js';
import { Audio }      from './audio.js';
import { loadGame, saveGame, clearSave, setFreshUntil } from './save.js';
import { ERAS, MIN_ZOOM, FIRST_LIGHT_ERA } from './eras.js';
import { MACRO_CRADLE_THRESHOLD, EMITTER_ERA_GATE, EMITTER_RATE_HZ } from './simulation.js';
import './mobile.js';
import './ios-install-hint.js';

const canvas = document.getElementById('universe');
const sim    = new Simulation();
const audio  = new Audio();
const renderer = new Renderer(canvas, audio);
const state  = new GameState();
const ui     = new UI();
let placementMode = false;
const elZoomIndicator = document.getElementById('zoom-indicator');
let _prevZoomLabel = '';
const elCameraTutorial = document.getElementById('camera-tutorial');
let _cameraTutorialShown = false;
let _cameraTutorialDismissTimer = null;

// Show a one-time camera-controls tutorial toast. Detects input device
// from lastPointerType (set by every real pointer event we have seen)
// with a matchMedia fallback for the cold-boot case. Auto-dismisses on
// any manual camera interaction OR after 14 seconds.
function showCameraTutorialOnce() {
  if (_cameraTutorialShown || (state && state.cameraTutorialShown) || !elCameraTutorial) return;
  _cameraTutorialShown = true;
  if (state) {
    state.cameraTutorialShown = true;
    state.requestSave?.();
  }

  // Device detection: prefer the lastPointerType the player has actually
  // been using; fall back to media-query heuristics.
  let isTouch = false;
  if (lastPointerType === 'touch') isTouch = true;
  else if (lastPointerType === 'mouse' || lastPointerType === 'pen') isTouch = false;
  else if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) isTouch = true;

  if (isTouch) {
    elCameraTutorial.innerHTML =
      '<strong>The cosmos is yours to roam.</strong> ' +
      '<span class="ct-sep">·</span> Pinch to zoom ' +
      '<span class="ct-sep">·</span> Two-finger drag to pan ' +
      '<span class="ct-sep">·</span> Tap <span class="ct-key">&#x2295;</span> to recenter';
  } else {
    elCameraTutorial.innerHTML =
      '<strong>The cosmos is yours to roam.</strong> ' +
      '<span class="ct-sep">·</span> Scroll to zoom ' +
      '<span class="ct-sep">·</span> Hold <span class="ct-key">space</span> + drag to pan ' +
      '<span class="ct-sep">·</span> Arrow keys nudge ' +
      '<span class="ct-sep">·</span> <span class="ct-key">&#x2295;</span> to recenter';
  }
  elCameraTutorial.hidden = false;
  requestAnimationFrame(() => elCameraTutorial.classList.add('show'));
  _cameraTutorialDismissTimer = setTimeout(dismissCameraTutorial, 14000);
}

function dismissCameraTutorial() {
  if (!elCameraTutorial || elCameraTutorial.hidden) return;
  if (_cameraTutorialDismissTimer) {
    clearTimeout(_cameraTutorialDismissTimer);
    _cameraTutorialDismissTimer = null;
  }
  elCameraTutorial.classList.remove('show');
  // Wait for fade out before hidden=true so transition runs.
  setTimeout(() => { if (elCameraTutorial) elCameraTutorial.hidden = true; }, 700);
}

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
sim.onEmitterEmit = (_emitter) => {
  state.potential += 1;
};
ui.onDeployEmitterClick = () => {
  if (state.eraIndex < EMITTER_ERA_GATE) return;
  if (placementMode) {
    placementMode = false;
    refreshTools();
    return;
  }
  const cost = emitterDeployCost(sim.deployedEmitterCount());
  if (state.potential < cost) return;
  placementMode = true;
  refreshTools();
};
ui.onEmitterPauseToggle = (emitterId) => {
  const e = sim.getEmitterById(emitterId);
  if (!e) return;
  sim.setEmitterPausedById(emitterId, !e.paused);
  state.requestSave?.();
  ui.refreshContextMenuForEmitter?.(emitterId);
  refreshTools();
};
ui.onEmitterRemove = (emitterId) => {
  if (!sim.removeEmitterById(emitterId)) return;
  if (emitterPinId === emitterId) emitterPinId = null;
  state.requestSave?.();
  refreshTools();
};
ui.onEmitterVisibilityToggle = (emitterId, hidden) => {
  if (!sim.setEmitterHiddenById(emitterId, hidden)) return;
  state.requestSave?.();
};
ui.getToolsContext = () => {
  const deployedCount = sim.deployedEmitterCount();
  const activeCount = sim.activeEmitterCount();
  const deployCost = emitterDeployCost(deployedCount);
  return {
    eraIndex: state.eraIndex,
    eraGate: EMITTER_ERA_GATE,
    deployedCount,
    activeCount,
    deployCost,
    canAfford: state.potential >= deployCost,
    placementActive: placementMode,
    throughputPerSec: activeCount * EMITTER_RATE_HZ,
  };
};
ui.getEmitterMenuContext = (emitterId) => {
  const e = sim.getEmitterById(emitterId);
  if (!e) return null;
  return { paused: !!e.paused };
};
ui.placementMode = false;
function refreshTools() {
  ui.updateTools?.();
  ui.placementMode = placementMode;
}
ui.onCatalogEntryClick = (id) => {
  inspectorPinId = id;
  inspectorPinSource = 'catalog';
};
ui.onCatalogUntrack = (id) => {
  const m = findMacroById(id);
  if (!m) return;
  m.tracked = false;
  if (inspectorPinId === id && inspectorPinSource === 'catalog') {
    inspectorPinId = null;
    inspectorPinSource = null;
  }
  state.requestSave?.();
};
// Click an emitter in the catalog: pin the emitter inspector to it, pan
// the camera to its position with a slight zoom-in. Clicking the same
// emitter again unpins.
ui.onCatalogEmitterClick = (emitterId) => {
  const emitter = sim.getEmitterById?.(emitterId);
  if (!emitter) return;
  // Toggle off if already pinned to this emitter.
  if (emitterPinId === emitterId) {
    emitterPinId = null;
    return;
  }
  // Clear macro pin so the two inspectors don't fight for attention.
  inspectorPinId = null;
  inspectorPinSource = null;
  emitterPinId = emitterId;
  // Focus camera: center on emitter, zoom in modestly (2× era default,
  // clamped to the same min/max bounds userZoomAt uses).
  if (state.eraIndex >= FIRST_LIGHT_ERA) {
    const eraZ = ERAS[state.eraIndex]?.zoom ?? 1.0;
    const focusZ = Math.min(eraZ * 6.0, Math.max(eraZ * 0.25, eraZ * 2.0));
    renderer.targetZoom = focusZ;
  }
  renderer.cam.x = emitter.x;
  renderer.cam.y = emitter.y;
  activateCameraOverride();
  clampCameraToBounds();
};

// Visual targets:
// Thermal overlay alpha target. The overlay (sepia dim + scanlines) shows
// whenever the Thermal Lens is on, regardless of era. Pre-First-Light this
// is the default visual mode. Post-First-Light the auto-handoff turns
// Thermal off in favor of Visible — but if the player toggles Thermal
// back on (it's still an earned instrument), the overlay returns.
function computeThermalTarget() {
  return state.lensVisuallyActive ? 1.0 : 0.0;
}

// --- Canvas sizing & world bounds ---
// World is (MIN_ZOOM × sim.worldScale) times bigger than the viewport in
// each dimension. sim.worldScale starts at 1 (default micro-era cosmos)
// and gets multiplied at signature events like First Light (~7x).
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  renderer.setDPR(dpr);

  const scale = (sim.worldScale && sim.worldScale > 0) ? sim.worldScale : 1;
  const worldW = (canvas.width  / MIN_ZOOM) * scale;
  const worldH = (canvas.height / MIN_ZOOM) * scale;
  sim.setBounds(worldW, worldH);
  // Don't snap the camera back to center while the player has it under
  // manual control -- that would jerk their view on every resize.
  if (!renderer.cameraOverride) {
    renderer.setCameraCenter(worldW / 2, worldH / 2);
  }
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
refreshTools();

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
//
// Camera controls (layered on top of spawn): wheel zoom, middle-click or
// space+drag pan, two-finger pinch/pan on touch, arrow keys + +/-/0 for
// keyboard. Any manual camera input flips renderer.cameraOverride = true,
// which disables era-zoom and Smart Tracking until the Recenter button
// clears the flag.
let holding = false;
let holdStartAt = 0;
let lastSpawnAt = 0;
const screenPos = { x: 0, y: 0 };
let pointerInside = false;
let lastPointerType = 'mouse';

// Camera-control state.
let spaceHeld = false;
let panActive = false;
let panLastClient = null;
let panPointerId = null;
const activeTouches = new Map(); // pointerId -> { clientX, clientY }
let gestureActive = false;
let gestureMid = null;
let gestureDist = 0;

// Inspector tracking. Pin survives across frames; hover is re-resolved per
// frame so moving macros are followed correctly. Pending pin holds a candidate
// during the slop window before we commit to "tap" vs "drag".
let inspectorPinId = null;
let inspectorPinSource = null; // 'catalog' | 'viewport'
let emitterPinId = null;       // when set, emitter inspector follows this emitter
let pendingPinId = null;
let pendingPinStart = null; // { x, y, pointerId, t }
const TAP_SLOP_PX = 10;     // CSS pixels of movement allowed before tap → drag
const TAP_MAX_MS = 600;     // beyond this, a held finger no longer pins
const LONG_PRESS_MS = 550;  // touch/pen hold-to-open-context-menu threshold

// Long-press timer. When a touch starts on a world entity and stays still for
// LONG_PRESS_MS, fire the context menu and cancel the pending pin.
let longPressTimer = null;
let longPressTarget = null;
let longPressOrigin = null; // { clientX, clientY }

function clearLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
  longPressTarget = null;
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

// Convert screen coords → world coords, clamped to the current sim bounds.
// Used by particle spawning AND emitter placement so the player can't
// create matter outside the playable area (which would otherwise pile up
// at the bounce wall, or be silently lost).
function screenToClampedWorld(sx, sy) {
  const w = renderer.screenToWorld(sx, sy);
  return {
    x: Math.max(0, Math.min(sim.bounds.w, w.x)),
    y: Math.max(0, Math.min(sim.bounds.h, w.y))
  };
}

function spawnAtScreen(sx, sy) {
  const w = screenToClampedWorld(sx, sy);
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
  if (!holding || placementMode) return;
  const now = performance.now();
  if (now - lastSpawnAt >= currentSpawnInterval()) {
    spawnAtScreen(screenPos.x, screenPos.y);
    lastSpawnAt = now;
  }
  requestAnimationFrame(tickHold);
}

// Inspector visibility is gated by ANY visual lens being active: if you
// can't see macros (radio alone isn't a visual sensor), you can't inspect.
// Either Thermal or Visible qualifies.
function inspectorAllowed() {
  return !!(state.lensVisuallyActive || state.visibleLensActive);
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

function pickEmitterAtScreen(sx, sy, radiusWorld = 12) {
  const w = renderer.screenToWorld(sx, sy);
  let best = null;
  let bestDist = Infinity;
  for (const emitter of sim.emitters) {
    const dx = emitter.x - w.x;
    const dy = emitter.y - w.y;
    const dist = Math.hypot(dx, dy);
    if (dist > radiusWorld || dist >= bestDist) continue;
    best = emitter;
    bestDist = dist;
  }
  return best;
}

function macroInspectorData(m, pinned, source = null) {
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
    kind: m.kind,
    mass: m.mass,
    absorbed: m.absorbed,
    age: m.age,
    filaments: fil,
    hint,
    screenX: screen.x,
    screenY: screen.y,
    macroRadiusCss,
    pinned: !!pinned,
    source: source || null,
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
    inspectorPinSource = null;
    pendingPinId = null;
    ui.setMacroInspector(null);
    return;
  }

  // Pinned wins. Drop pin if the macro is gone (merged or expired).
  if (inspectorPinId != null) {
    const m = findMacroById(inspectorPinId);
    if (!m) { inspectorPinId = null; inspectorPinSource = null; }
    else { ui.setMacroInspector(macroInspectorData(m, true, inspectorPinSource)); return; }
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

function resolveEmitterInspector() {
  if (emitterPinId == null) {
    ui.setEmitterInspector(null);
    return;
  }
  const emitter = sim.getEmitterById?.(emitterPinId);
  if (!emitter) {
    emitterPinId = null;
    ui.setEmitterInspector(null);
    return;
  }
  // Compute on-screen position of the emitter glyph (CSS px). The
  // renderer's emitter glyph radius is ~10 world units; convert through
  // the current zoom + DPR so the inspector's leader anchors at the glyph
  // edge rather than its center.
  const screen = renderer.worldToScreenCss(emitter.x, emitter.y);
  const glyphRadiusCss = (10 * renderer.zoom) / renderer.dpr;
  // Compute the emitter's index in the deployed list (1-based) so the
  // inspector label matches what the Catalog row shows ("Emitter 2", etc.).
  const idx = sim.emitters.indexOf(emitter);
  ui.setEmitterInspector({
    id: emitter.id,
    indexLabel: idx >= 0 ? String(idx + 1) : '',
    paused: !!emitter.paused,
    hidden: !!emitter.hidden,
    rateHz: EMITTER_RATE_HZ,
    emitted: emitter.emitted || 0,
    screenX: screen.x,
    screenY: screen.y,
    macroRadiusCss: glyphRadiusCss,
    source: 'catalog',
  });
}

function macroMenuOpts(m, clientX, clientY) {
  return {
    targetType: 'macro',
    macroId: m.id,
    screenX: clientX,
    screenY: clientY,
    kind: m.kind,
    name: m.name || null,
    tracked: !!m.tracked,
  };
}

function resolveContextTargetAtScreen(sx, sy) {
  const emitter = pickEmitterAtScreen(sx, sy, 12);
  if (emitter) return { type: 'emitter', emitter };
  const macro = pickMacroAtScreen(sx, sy, 16);
  if (macro) return { type: 'macro', macro };
  return null;
}

function showResolvedContextMenu(target, clientX, clientY, anchorMode = 'corner') {
  if (!target) return;
  if (target.type === 'emitter') {
    const menuCtx = ui.getEmitterMenuContext?.(target.emitter.id);
    const opts = {
      targetType: 'emitter',
      emitterId: target.emitter.id,
      paused: !!menuCtx?.paused,
      screenX: clientX,
      screenY: clientY,
      anchorMode,
    };
    if (typeof ui.showContextMenu === 'function') ui.showContextMenu(opts);
    else ui.showMacroContextMenu?.(opts);
    return;
  }
  const opts = { ...macroMenuOpts(target.macro, clientX, clientY), anchorMode };
  if (typeof ui.showContextMenu === 'function') ui.showContextMenu(opts);
  else ui.showMacroContextMenu?.(opts);
}

function touchPointerClient(e) {
  // The visible touch pointer should appear where the spawn lands — i.e.,
  // at the offset-adjusted point, in client (viewport) coordinates.
  const off = (state && state.settings && typeof state.settings.touchOffsetPx === 'number')
    ? state.settings.touchOffsetPx : 0;
  return { x: e.clientX, y: e.clientY - off };
}

// ---- Camera controls ----
//
// All manual camera changes route through these helpers so:
//   1. The override flag is set consistently (suspends era zoom + Smart
//      Tracking until the user clicks Recenter).
//   2. World-bounds clamping happens in one place.
//   3. Zoom limits scale with the current era's natural zoom, so the
//      player can always pull back further than smart-tracking allows and
//      zoom in for a closer look without losing context.

const recenterBtn = document.getElementById('recenter-btn');

function clampCameraToBounds() {
  const z = renderer.targetZoom || 1;
  const halfW = (canvas.width  / z) / 2;
  const halfH = (canvas.height / z) / 2;
  const W = sim.bounds.w, H = sim.bounds.h;
  if (halfW * 2 < W) renderer.cam.x = Math.min(Math.max(renderer.cam.x, halfW), W - halfW);
  else renderer.cam.x = W / 2;
  if (halfH * 2 < H) renderer.cam.y = Math.min(Math.max(renderer.cam.y, halfH), H - halfH);
  else renderer.cam.y = H / 2;
}

function activateCameraOverride() {
  if (!renderer.cameraOverride) {
    renderer.cameraOverride = true;
    if (recenterBtn) recenterBtn.hidden = false;
  }
  // First touch of the camera dismisses the one-time tutorial toast.
  dismissCameraTutorial();
}

function recenterCamera() {
  renderer.cameraOverride = false;
  if (recenterBtn) recenterBtn.hidden = true;
  // Recenter is the player's "give the camera back to the game" gesture —
  // also drop any emitter pin so the inspector doesn't fight smart tracking.
  emitterPinId = null;
  // Era zoom + Smart Tracking resume on the next frame automatically.
}

function userZoomAt(screenX, screenY, factor) {
  // Pre-First-Light eras keep the player in a small contemplative pocket
  // of the cosmos. Manual zoom is disabled; Smart Tracking owns the camera.
  // First Light unlocks the cosmos and manual camera takes over.
  if (state.eraIndex < FIRST_LIGHT_ERA) return;
  if (!isFinite(factor) || factor <= 0) return;
  const eraZ = ERAS[state.eraIndex]?.zoom ?? 1.0;
  const minZ = eraZ * 0.25;  // pull back up to 4x further than era default
  const maxZ = eraZ * 6.0;   // zoom in up to 6x closer
  const cur = renderer.targetZoom;
  const newZ = Math.max(minZ, Math.min(maxZ, cur * factor));
  if (Math.abs(newZ - cur) < 1e-5) return;

  // Anchored zoom: world point under (screenX, screenY) stays fixed.
  // We snap renderer.zoom = newZ as well so the anchor is exact rather
  // than drifting during the lerp -- feels right under a wheel.
  const wBefore = renderer.screenToWorld(screenX, screenY);
  renderer.targetZoom = newZ;
  renderer.zoom = newZ;
  const wAfter = renderer.screenToWorld(screenX, screenY);
  renderer.cam.x += (wBefore.x - wAfter.x);
  renderer.cam.y += (wBefore.y - wAfter.y);

  activateCameraOverride();
  clampCameraToBounds();
}

function userPanBy(dxInternal, dyInternal) {
  // Same era-lock rule as zoom: pan is a manual camera action.
  if (state.eraIndex < FIRST_LIGHT_ERA) return;
  const z = renderer.zoom || 1;
  renderer.cam.x -= dxInternal / z;
  renderer.cam.y -= dyInternal / z;
  activateCameraOverride();
  clampCameraToBounds();
}

// Convert CSS pixel delta to internal canvas pixel delta.
function cssToInternal(dxCss, dyCss) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: dxCss * (canvas.width  / rect.width),
    y: dyCss * (canvas.height / rect.height)
  };
}

// Convert client (viewport) coords to internal canvas px.
function clientToInternal(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width  / rect.width),
    y: (clientY - rect.top)  * (canvas.height / rect.height)
  };
}

if (recenterBtn) {
  recenterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    recenterCamera();
  });
}

// Wheel zoom (desktop / trackpad). Anchored at the cursor so the world
// point under the mouse stays fixed -- standard map behavior.
canvas.addEventListener('wheel', (e) => {
  if (!inspectorAllowed()) return;
  e.preventDefault();
  const { x: sx, y: sy } = clientToInternal(e.clientX, e.clientY);
  // deltaY positive = scroll down = zoom out. Exponential so trackpad
  // continuous deltas feel smooth and wheel ticks feel meaningful.
  const factor = Math.exp(-e.deltaY * 0.0015);
  userZoomAt(sx, sy, factor);
}, { passive: false });

// Multi-touch pinch + two-finger pan. Started when activeTouches.size hits 2,
// ended when it drops below 2. Cancels any in-progress spawn / pending pin.
function gestureBegin() {
  holding = false;
  pendingPinId = null;
  pendingPinStart = null;
  clearLongPress();
  if (ui && ui.hideTouchPointer) ui.hideTouchPointer();
  const t = Array.from(activeTouches.values());
  if (t.length < 2) return;
  gestureMid = {
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2
  };
  gestureDist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
  gestureActive = true;
}

function gestureUpdate() {
  const t = Array.from(activeTouches.values());
  if (t.length < 2) { gestureActive = false; return; }
  const mx = (t[0].clientX + t[1].clientX) / 2;
  const my = (t[0].clientY + t[1].clientY) / 2;
  const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;

  // Pan by midpoint delta first, then zoom anchored at new midpoint.
  const pan = cssToInternal(mx - gestureMid.x, my - gestureMid.y);
  if (pan.x || pan.y) userPanBy(pan.x, pan.y);
  const factor = dist / gestureDist;
  if (Math.abs(factor - 1) > 1e-4) {
    const anchor = clientToInternal(mx, my);
    userZoomAt(anchor.x, anchor.y, factor);
  }

  gestureMid = { x: mx, y: my };
  gestureDist = dist;
}

canvas.addEventListener('pointerdown', (e) => {
  // Middle-click (any pointer) or space+left-click (mouse) → start pan.
  // Intercepted before the spawn path so it doesn't paint particles.
  const isMouse = e.pointerType === 'mouse';
  if ((isMouse && e.button === 1) || (isMouse && e.button === 0 && spaceHeld)) {
    e.preventDefault();
    panActive = true;
    panLastClient = { x: e.clientX, y: e.clientY };
    panPointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    return;
  }
  // Only the left mouse button spawns/pins; right-click is handled by the
  // contextmenu listener below.
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const { x, y } = eventToScreen(e);
  screenPos.x = x;
  screenPos.y = y;
  pointerInside = true;
  lastPointerType = effectivePointerType(e);

  // Track touches for pinch/pan detection. As soon as a second finger
  // lands, enter gesture mode and short-circuit the spawn path.
  if (lastPointerType === 'touch') {
    activeTouches.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (activeTouches.size >= 2) {
      gestureBegin();
      return;
    }
  }

  if (lastPointerType === 'touch') {
    const p = touchPointerClient(e);
    ui.showTouchPointerAt(p.x, p.y);
  }

  if (placementMode) {
    const cost = emitterDeployCost(sim.deployedEmitterCount());
    if (state.potential < cost) {
      placementMode = false;
      refreshTools();
      return;
    }
    const w = screenToClampedWorld(x, y);
    const emitter = sim.deployEmitterAt(w.x, w.y);
    if (emitter) {
      state.potential -= cost;
      state.requestSave?.();
    }
    placementMode = false;
    refreshTools();
    return;
  }

  // Touch (or pen) on a world entity: tentative pin for macros, with long-press
  // opening whichever context menu sits under the pointer.
  if (lastPointerType === 'touch' || lastPointerType === 'pen') {
    const target = resolveContextTargetAtScreen(x, y);
    if (target && (target.type === 'emitter' || inspectorAllowed())) {
      pendingPinId = target.type === 'macro' ? target.macro.id : null;
      pendingPinStart = { x, y, pointerId: e.pointerId, t: performance.now() };
      canvas.setPointerCapture(e.pointerId);

      longPressTarget = target.type === 'emitter'
        ? { type: 'emitter', id: target.emitter.id }
        : { type: 'macro', id: target.macro.id };
      longPressOrigin = { clientX: e.clientX, clientY: e.clientY };
      longPressTimer = setTimeout(() => {
        if (!longPressTarget) return;
        const targetNow = longPressTarget.type === 'emitter'
          ? (() => {
              const emitter = sim.getEmitterById(longPressTarget.id);
              return emitter ? { type: 'emitter', emitter } : null;
            })()
          : (() => {
              const macro = findMacroById(longPressTarget.id);
              return macro ? { type: 'macro', macro } : null;
            })();
        if (!targetNow) { clearLongPress(); return; }
        pendingPinId = null;
        pendingPinStart = null;
        showResolvedContextMenu(targetNow, longPressOrigin.clientX, longPressOrigin.clientY, 'right');
        clearLongPress();
      }, LONG_PRESS_MS);

      return;
    }
  }

  // Tapping empty space dismisses any existing pin.
  if (inspectorPinId != null) { inspectorPinId = null; inspectorPinSource = null; }

  holding = true;
  holdStartAt = performance.now();
  canvas.setPointerCapture(e.pointerId);
  spawnAtScreen(x, y);
  lastSpawnAt = holdStartAt;
  requestAnimationFrame(tickHold);
});

// Right-click anywhere on the canvas: if on a world entity, open its context
// menu. Otherwise suppress the default browser context menu so right-click on
// empty space doesn't surface the OS menu over the simulation.
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // After a touch long-press, the browser synthesizes a contextmenu event on
  // finger lift. The menu is already open in 'right' anchor mode -- don't
  // re-open it in 'corner' mode and snap it below the lift point.
  if (ui.isContextMenuOpen && ui.isContextMenuOpen()) return;
  const { x, y } = eventToScreen(e);
  const target = resolveContextTargetAtScreen(x, y);
  if (!target) return;
  if (target.type === 'macro' && !inspectorAllowed()) return;
  showResolvedContextMenu(target, e.clientX, e.clientY);
});

canvas.addEventListener('pointermove', (e) => {
  // Active pan (middle-click or space+drag): consume the event.
  if (panActive && e.pointerId === panPointerId) {
    const dxCss = e.clientX - panLastClient.x;
    const dyCss = e.clientY - panLastClient.y;
    panLastClient = { x: e.clientX, y: e.clientY };
    const d = cssToInternal(dxCss, dyCss);
    userPanBy(d.x, d.y);
    return;
  }

  // Active multi-touch gesture: update midpoint + distance.
  if (gestureActive && activeTouches.has(e.pointerId)) {
    activeTouches.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    gestureUpdate();
    return;
  }
  // Even when not yet in gesture mode, keep the touch position fresh in case
  // we transition.
  if (activeTouches.has(e.pointerId)) {
    activeTouches.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }

  const { x, y } = eventToScreen(e);
  screenPos.x = x;
  screenPos.y = y;
  pointerInside = true;
  if (e.pointerType) lastPointerType = effectivePointerType(e);

  // Placement-mode ghost emitter follows the cursor.
  renderer.setCursor?.(x, y);

  if (lastPointerType === 'touch') {
    const p = touchPointerClient(e);
    ui.showTouchPointerAt(p.x, p.y);
  }

  // If we have a pending touch/pen interaction on a world entity, watch for drag.
  if (pendingPinStart) {
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
      if (placementMode) return;
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
  // End active pan first.
  if (panActive && (!e || e.pointerId === panPointerId)) {
    panActive = false;
    panPointerId = null;
    panLastClient = null;
    canvas.style.cursor = spaceHeld ? 'grab' : '';
    if (e && e.pointerId !== undefined && canvas.hasPointerCapture?.(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    return;
  }
  // End multi-touch gesture as fingers lift.
  if (e && e.pointerId !== undefined && activeTouches.has(e.pointerId)) {
    activeTouches.delete(e.pointerId);
    if (gestureActive && activeTouches.size < 2) {
      gestureActive = false;
      gestureMid = null;
      gestureDist = 0;
      // Don't reactivate spawn from the lingering finger -- the user is
      // clearly using the camera, not painting. They can lift and re-tap.
      return;
    }
  }
  // Resolve any pending pin first. If the pointer lifted while still close to
  // its origin, commit the pin. Otherwise it was already promoted to a hold.
  if (pendingPinId != null) {
    inspectorPinId = pendingPinId;
    inspectorPinSource = 'viewport';
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
  renderer.clearCursor?.();
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

// --- Keyboard camera controls ---
// Space + drag → pan (handled in pointerdown via spaceHeld flag).
// Arrow keys → pan. + / - / 0 → zoom in / out / reset. Ignored while the
// user is typing into an input/textarea so we don't fight renaming.
function isTypingInInput() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !spaceHeld && !isTypingInInput()) {
    spaceHeld = true;
    if (!panActive) canvas.style.cursor = 'grab';
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape' && placementMode) {
    placementMode = false;
    refreshTools();
    return;
  }
  if (isTypingInInput()) return;
  if (!inspectorAllowed()) return;
  const PAN_STEP = canvas.width * 0.06; // ~6% of viewport per press
  if (e.code === 'ArrowLeft')  { userPanBy(-PAN_STEP, 0); e.preventDefault(); return; }
  if (e.code === 'ArrowRight') { userPanBy( PAN_STEP, 0); e.preventDefault(); return; }
  if (e.code === 'ArrowUp')    { userPanBy(0, -PAN_STEP); e.preventDefault(); return; }
  if (e.code === 'ArrowDown')  { userPanBy(0,  PAN_STEP); e.preventDefault(); return; }
  if (e.key === '+' || e.key === '=') {
    userZoomAt(canvas.width / 2, canvas.height / 2, 1.18); e.preventDefault(); return;
  }
  if (e.key === '-' || e.key === '_') {
    userZoomAt(canvas.width / 2, canvas.height / 2, 1 / 1.18); e.preventDefault(); return;
  }
  if (e.key === '0') { recenterCamera(); e.preventDefault(); return; }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceHeld = false;
    if (!panActive) canvas.style.cursor = '';
  }
});

// --- Game loop ---
let last = performance.now();

// Smart Tracking: when enabled, frame the camera so all macros stay on
// screen. Two ingredients:
//   * Aim point = blend of (bbox center) and (sqrt(mass)-weighted centroid),
//     bbox-heavy (80/20) so the frame is dictated by the spread of bodies
//     rather than the position of the heaviest one. A huge cradle still
//     nudges the focus slightly toward itself, but smaller bodies can't
//     be pushed off-screen by it.
//   * Zoom = era zoom by default, but zoomed out enough to fit every
//     macro's halo inside the viewport (with a small breathing-room
//     buffer). Capped at 0.3 of era zoom so the universe never shrinks
//     to a dot.
// Time constant ~0.9s -- fast enough to actually catch drifting bodies,
// slow enough that the camera reads as settling rather than chasing.
// Bounded by the world so we never pan into pure void.
const SMART_TRACK_TAU_S = 0.9;
const SMART_TRACK_MIN_ZOOM_FRAC = 0.3;
const SMART_TRACK_FIT_BUFFER = 1.08; // 8% breathing room on every side
function updateSmartTracking(dt) {
  if (renderer.cameraOverride) return;
  // Pre-First-Light eras: Smart Tracking is FORCED on regardless of the
  // user's setting, because manual camera is locked. Post-First-Light:
  // respect the user's smartTracking setting.
  const eraLocked = state.eraIndex < FIRST_LIGHT_ERA;
  if (!eraLocked && (!state.settings || !state.settings.smartTracking)) return;
  // Suppress during dramatic cinematics (e.g. just after First Light
  // expansion and reframe) so smart-track auto-zoom doesn't fight the
  // dramatic camera pull-back.
  if (state.smartTrackingSuppressUntil && Date.now() < state.smartTrackingSuppressUntil) return;
  const macros = sim.macros;
  if (!macros || macros.length === 0) return;

  const dpr = renderer.dpr || 1;
  let totalW = 0, sx = 0, sy = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const m of macros) {
    const mass = Math.max(m.mass || 1, 1);
    // Sub-linear influence (sqrt) is the gentlest weighting that still
    // biases toward heavier bodies. Used at low weight in the blend.
    const w = Math.sqrt(mass);
    sx += m.x * w;
    sy += m.y * w;
    totalW += w;
    // Expand bbox by the macro's visible halo, not just its center, so
    // big bodies don't get cropped at the edges of frame.
    const ext = (m.r || 4) * dpr * 7;
    if (m.x - ext < minX) minX = m.x - ext;
    if (m.x + ext > maxX) maxX = m.x + ext;
    if (m.y - ext < minY) minY = m.y - ext;
    if (m.y + ext > maxY) maxY = m.y + ext;
  }
  if (totalW <= 0) return;

  const wcx = sx / totalW;
  const wcy = sy / totalW;
  const bcx = (minX + maxX) / 2;
  const bcy = (minY + maxY) / 2;
  // 80% bbox / 20% weighted: frame is dominated by where bodies *are*,
  // with a small nudge toward mass concentration. Single-macro scenes
  // collapse to that macro's center either way.
  let tx = bcx * 0.8 + wcx * 0.2;
  let ty = bcy * 0.8 + wcy * 0.2;

  // Required half-extent to fit every macro (with halo) around the aim
  // point, plus an 8% buffer so things aren't pinned to the edges.
  const reqHalfW = Math.max(maxX - tx, tx - minX) * SMART_TRACK_FIT_BUFFER;
  const reqHalfH = Math.max(maxY - ty, ty - minY) * SMART_TRACK_FIT_BUFFER;

  // Era zoom is the cap: smart tracking only ever zooms OUT from it.
  const eraZ = renderer.targetZoom;
  const fitZ = Math.min(
    canvas.width  / (2 * Math.max(1, reqHalfW)),
    canvas.height / (2 * Math.max(1, reqHalfH))
  );
  const smartZ = Math.max(eraZ * SMART_TRACK_MIN_ZOOM_FRAC, Math.min(eraZ, fitZ));
  renderer.targetZoom = smartZ;

  // Clamp aim so the viewport stays inside the world bounds. Use the
  // smart target zoom (the framing we're heading for) rather than the
  // lerped current zoom, so the clamp predicts the final view.
  const halfW = (canvas.width  / smartZ) / 2;
  const halfH = (canvas.height / smartZ) / 2;
  const W = sim.bounds.w, H = sim.bounds.h;
  if (halfW * 2 < W) tx = Math.min(Math.max(tx, halfW), W - halfW);
  else tx = W / 2;
  if (halfH * 2 < H) ty = Math.min(Math.max(ty, halfH), H - halfH);
  else ty = H / 2;

  const alpha = 1 - Math.exp(-dt / SMART_TRACK_TAU_S);
  renderer.cam.x += (tx - renderer.cam.x) * alpha;
  renderer.cam.y += (ty - renderer.cam.y) * alpha;
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  // Keep renderer zoom + thermal in sync with current state. Skip the era
  // zoom write while the player is driving the camera manually -- their
  // pan/zoom would otherwise be overwritten every frame.
  if (!renderer.cameraOverride) {
    renderer.setTargetZoom(ERAS[state.eraIndex]?.zoom ?? 1.0);
  }
  renderer.setTargetThermalAlpha(computeThermalTarget());

  // Edge-trigger the thermal scan reveal exactly once per universe.
  // Subsequent toggles of the thermal lens don't re-play the cinematic.
  if (state.lensVisuallyActive && !_prevLensActive && !state.thermalScanDone) {
    renderer.startLensScan();
    state.thermalScanDone = true;
    if (state.requestSave) state.requestSave();
  }
  if (state.eraIndex >= FIRST_LIGHT_ERA && !state.visibleScanDone) {
    renderer.startVisibleScan?.();
    state.visibleScanDone = true;
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
  updateSmartTracking(dt);
  renderer.render(sim, state, ui);
  ui.render(state);
  ui.updateTools?.();
  resolveInspector();
  resolveEmitterInspector();
  ui.renderCatalog(sim, inspectorPinId, MACRO_CRADLE_THRESHOLD, emitterPinId);

  // Zoom indicator: shows current camera magnification (e.g. "0.22×")
  // so the player knows exactly what zoom level they are observing at.
  // Same scale we use when discussing zoom internally.
  if (elZoomIndicator) {
    const label = renderer.zoom.toFixed(2) + '\u00d7';
    if (label !== _prevZoomLabel) {
      elZoomIndicator.textContent = label;
      _prevZoomLabel = label;
    }
  }

  // First time the cosmos-yours whisper has been seen, fire the one-time
  // camera-controls tutorial so the player learns the freshly-unlocked
  // manual camera. The whisper itself plays the cosmic-invitation role;
  // the tutorial gives them the actual controls.
  if (!_cameraTutorialShown && state.seenWhispers && state.seenWhispers.has('cosmos-yours')) {
    showCameraTutorialOnce();
  }

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
