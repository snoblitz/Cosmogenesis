// Game state layer
// Tracks the player-facing numbers and current era, queues discoveries
// when era thresholds are crossed, and evaluates whispers spoken by the
// universe itself.

import { ERAS, evaluateEra, FIRST_LIGHT_ERA } from './eras.js';
import { findReadyWhisper } from './whispers.js';
import { YEARS_PER_SECOND } from './simulation.js';

const WHISPER_COOLDOWN_MS = 35000;

export class GameState {
  constructor() {
    this.potential = 0;
    this.matter = 0;
    this.structures = 0;
    this.cradles = 0;
    this.filaments = 0;
    this.cosmicYear = 0;
    this.eraIndex = 0;
    this.laws = [];
    this.pendingDiscoveries = [];

    // --- Whisper system ---
    this.seenWhispers = new Set();    // persisted as array
    this.pendingWhisper = null;       // UI consumes and clears
    this.wasResumed = false;          // set by main.js on save load
    this.eraEnteredAt = Date.now();   // for time-since-era whispers
    this.lastInteractionAt = 0;       // updated on every spawn
    this.maxParticleMass = 0;         // tracked per tick
    this._whisperCooldownUntil = 0;

    // Lens system:
    //   - radioLensActive:    audio + sweep line are running
    //   - lensVisuallyActive: thermal visuals are running
    //   - thermalScanDone:    has the dramatic one-time reveal scan played?
    // Both `*Active` flags are toggleable by the player once unlocked.
    // `thermalScanDone` ensures toggling thermal off/on doesn't re-trigger
    // the cinematic top-to-bottom reveal sweep on every flip.
    this.radioLensActive = false;
    this.lensVisuallyActive = false;
    this.thermalScanDone = false;
    this.visibleScanDone = false;

    // Per-instrument settings, all user-adjustable from the HUD and
    // persisted across sessions. Defaults are the values the lens shipped
    // with; sliders rebind to these.
    this.settings = {
      radioSweepPeriod:         20.0,    // seconds for a full left-to-right pass
      radioVolume:              1.0,     // multiplier on audio master (0..2)
      radioBeamWidth:           6.0,     // detection zone half-width in px (3..20)
      radioSustain:             2.0,     // multiplier on note decay length (0.3..2)
      radioSweepStyle:          'sine',  // 'linear' | 'sine' | 'pingpong'
      radioSpikeIntensity:      0.5,     // multiplier on spike size (0..2)
      radioLineOpacity:         0.5,     // multiplier on sweep line + halo alpha (0..1.5)
      thermalDimAmount:         1.0,     // multiplier on dimming overlay (0..1.5)
      thermalScanlineIntensity: 1.0,     // multiplier on scanline grain (0..2)
      thermalShowScale:         true,    // show cold-to-warm temperature legend
      cursorStyle:              'crosshair', // pointer style over the canvas
      touchOffsetPx:            0,       // vertical offset (CSS px) lifting touch input above the fingertip
      showTouchPointer:         false,   // render the chosen cursor glyph at the touch location
      smartTracking:            false    // slowly pan the camera to keep the most mass on screen
    };

    // External save hook, main.js sets this so state mutations that must
    // persist immediately (era advance, whisper consumed) don't get lost
    // if the player refreshes before the next autosave tick.
    this.requestSave = null;
  }

  // Whether a given lens has been unlocked AND can therefore be toggled.
  canToggleLens(id) {
    if (id === 'radio-lens')   return this.seenWhispers.has('opening-radio');
    if (id === 'thermal-lens') return this.seenWhispers.has('opening-thermal');
    return false;
  }

  // Current on/off state of the named lens.
  isLensEnabled(id) {
    if (id === 'radio-lens')   return !!this.radioLensActive;
    if (id === 'thermal-lens') return !!this.lensVisuallyActive;
    return false;
  }

  // Flip a lens on or off. No-op if the lens isn't unlocked yet.
  toggleLens(id) {
    if (!this.canToggleLens(id)) return false;
    if (id === 'radio-lens')   this.radioLensActive    = !this.radioLensActive;
    if (id === 'thermal-lens') this.lensVisuallyActive = !this.lensVisuallyActive;
    if (this.requestSave) this.requestSave();
    return this.isLensEnabled(id);
  }

  currentEra() {
    return ERAS[this.eraIndex] || ERAS[ERAS.length - 1];
  }

  lensLabel() {
    const labels = [];
    if (this.radioLensActive) labels.push('Radio');
    if (this.lensVisuallyActive) {
      labels.push(this.eraIndex >= FIRST_LIGHT_ERA ? 'Visible' : 'Thermal');
    }
    return labels.join(' \u00b7 ');
  }

  markInteraction(now) {
    this.lastInteractionAt = now;
  }

  update(sim, renderer) {
    // Recompute live totals
    let matter = 0;
    let maxMass = 0;
    let cradles = 0;
    for (const p of sim.particles) {
      matter += p.mass;
      if (p.mass > maxMass) maxMass = p.mass;
    }
    for (const m of sim.macros) {
      matter += m.mass;
      if (m.mass > maxMass) maxMass = m.mass;
      if (m.kind === 'cradle' || m.kind === 'star') cradles++;
    }
    this.matter = matter;
    this.structures = sim.macros.length;
    this.cradles = cradles;
    this.maxParticleMass = maxMass;
    this.cosmicYear = Math.floor((sim.totalElapsedS || 0) * YEARS_PER_SECOND);
    // Pull filament count straight from renderer's live map. Cheap, no extra
    // state to sync, always in sync with what's actually drawn.
    this.filaments = (renderer && renderer._filaments) ? renderer._filaments.size : 0;

    // Era advancement (one at a time so each discovery banner is seen)
    const next = evaluateEra(this, sim);
    if (next !== null && next > this.eraIndex) {
      this.eraIndex = this.eraIndex + 1;
      this.eraEnteredAt = Date.now();
      const era = ERAS[this.eraIndex];
      if (era && !this.laws.includes(era.law)) {
        this.laws.push(era.law);
        this.pendingDiscoveries.push(era);
      }
      sim.setEraLevel(this.eraIndex);
      if (this.requestSave) this.requestSave();
    }

    // Whisper evaluation
    const now = Date.now();
    if (!this.pendingWhisper && now >= this._whisperCooldownUntil) {
      const w = findReadyWhisper(this, sim, renderer);
      if (w) {
        this.pendingWhisper = w;
        this.seenWhispers.add(w.id);
        this._whisperCooldownUntil = now + WHISPER_COOLDOWN_MS;
        if (this.requestSave) this.requestSave();
      }
    }
  }

  serialize() {
    return {
      potential: this.potential,
      eraIndex: this.eraIndex,
      laws: this.laws.slice(),
      seenWhispers: Array.from(this.seenWhispers),
      eraEnteredAt: this.eraEnteredAt,
      radioLensActive:    this.radioLensActive,
      lensVisuallyActive: this.lensVisuallyActive,
      thermalScanDone:    this.thermalScanDone,
      visibleScanDone:    this.visibleScanDone,
      settings:           { ...this.settings }
    };
  }

  deserialize(d) {
    this.potential = d.potential || 0;
    this.eraIndex  = d.eraIndex  || 0;
    this.laws      = Array.isArray(d.laws) ? d.laws.slice() : [];
    this.seenWhispers = new Set(Array.isArray(d.seenWhispers) ? d.seenWhispers : []);
    // Fallback to 0 ("long ago") so resumed saves don't get artificially
    // gated by a fresh dwell timer on era transitions they've already earned.
    this.eraEnteredAt = d.eraEnteredAt || 0;
    this.radioLensActive    = !!d.radioLensActive;
    this.lensVisuallyActive = !!d.lensVisuallyActive;
    this.thermalScanDone    = !!d.thermalScanDone;
    this.visibleScanDone    = !!d.visibleScanDone;
    if (d.settings && typeof d.settings === 'object') {
      Object.assign(this.settings, d.settings);
    }
  }
}
