// Game state layer
// Tracks the player-facing numbers and current era, queues discoveries
// when era thresholds are crossed, and evaluates whispers spoken by the
// universe itself.

import { ERAS, evaluateEra, FIRST_LIGHT_ERA } from './eras.js';
import { findReadyWhisper, WHISPERS } from './whispers.js';
import { YEARS_PER_SECOND } from './simulation.js';

// v0.5: Emitter base cost up from 50 → 250. Emitters are now capital
// investment, not income. They convert Potential into a star via mass-60
// packets; they pay back through the macro-birth / cradle-cross / star-ignite
// milestone events and the per-second stellar luminosity income their work
// eventually creates.
export const EMITTER_COST_BASE = 250;
export function emitterDeployCost(activeCount) {
  return EMITTER_COST_BASE * Math.pow(2, activeCount);
}

// Potential income payouts on physical threshold events. These replace the
// per-emission +1 trickle that emitters used to print. The new economy
// rewards causing things to happen, not just owning a meter.
export const POTENTIAL_MACRO_BIRTH  = 5;    // a particle condenses into a macro
export const POTENTIAL_CRADLE_CROSS = 10;   // a macro crosses mass 500
export const POTENTIAL_STAR_IGNITE  = 100;  // a cradle ignites (mass 1500)
// Per-second per-star luminosity income = factor * log10(mass). Log scaling
// prevents a single giant from dominating the economy; many medium stars
// pay almost as much as one huge one.
export const POTENTIAL_STELLAR_FACTOR = 3;

// Inducer modes — selectable spawn behaviors for the cursor tool ("the
// Inducer"). Each mode unlocks behind BOTH an era gate AND a one-time
// Potential payment. Field is the default and always available.
export const INDUCER_MODES = {
  field: {
    id: 'field',
    label: 'Field',
    description: 'Default tap or hold. Each click drops a mass-1 particle and earns 1 Potential.',
    eraGate: 0,
    unlockCost: 0,
    packetMass: 1
  },
  resonance: {
    id: 'resonance',
    label: 'Resonance Lens',
    description: 'Drag to spray mass-3 packets along your cursor path. +1 Potential per packet.',
    eraGate: 2,
    unlockCost: 120,
    packetMass: 3
  },
  compression: {
    id: 'compression',
    label: 'Compression Lens',
    description: 'Hold to charge, release to fire one heavy packet (up to mass 25). Sub-20% charge fizzles.',
    eraGate: 4,
    unlockCost: 800,
    packetMass: 25,
    chargeTimeS: 1.5
  },
  accretion: {
    id: 'accretion',
    label: 'Accretion Stream',
    description: 'Beam mass-2 feeders directly into the nearest macro (within ~220px). No Potential earned.',
    eraGate: 5,
    unlockCost: 4500,
    packetMass: 2
  }
};

export function inducerModeList() {
  return ['field', 'resonance', 'compression', 'accretion'].map(id => INDUCER_MODES[id]);
}

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
    // Lens system:
    //   - radioLensActive:    audio + sweep line are running
    //   - lensVisuallyActive: THERMAL lens visuals are running (sepia overlay
    //                          + scanlines + thermal-palette body colors)
    //   - visibleLensActive:  VISIBLE-spectrum lens is running (no overlay,
    //                          blackbody body colors). Earned at First Light.
    //   - thermalScanDone:    has the dramatic one-time thermal reveal played?
    //   - visibleScanDone:    has the dramatic one-time First Light reveal played?
    //
    // Thermal + Visible are mutually exclusive when rendering — the player
    // is looking through one filter at a time. The Instruments panel keeps
    // BOTH entries forever once earned, so the player can toggle between
    // observation modes. At First Light we auto-flip Thermal→off / Visible→on
    // as the cinematic handoff; afterward the player owns the choice.
    this.radioLensActive = false;
    this.lensVisuallyActive = false;
    this.visibleLensActive = false;
    this.thermalScanDone = false;
    this.visibleScanDone = false;
    // Idempotent flag for the one-time cosmic expansion that fires at First
    // Light (world grows ~50x, outer cosmos seeded with diffuse matter,
    // Potential inflated to match). Persisted so saves never re-expand on
    // reload, and so legacy post-First-Light saves can trigger the
    // expansion on first load if they were saved before this feature.
    this.firstLightExpansionDone = false;
    // Idempotent flag for the one-time camera-controls tutorial toast that
    // accompanies the cosmos-yours whisper. Persisted so reloads after
    // First Light don't re-show it.
    this.cameraTutorialShown = false;
    // Wall-clock timestamp until which Smart Tracking auto-pan is suppressed.
    // Set during dramatic cinematics (First Light) so the auto-fit logic
    // doesn't fight the era-zoom + camera reframe. Not persisted (purely
    // transient UX).
    this.smartTrackingSuppressUntil = 0;

    // v0.5 Inducer system. The cursor tool has four selectable modes; only
    // Field is available at game start. Other modes are unlocked by paying
    // Potential AFTER the corresponding era is reached. unlockedInducerModes
    // is serialized as an array but lives in memory as a Set for O(1) lookups.
    this.inducerMode = 'field';
    this.unlockedInducerModes = new Set(['field']);
    // Compression Lens charge progress in seconds (0..chargeTimeS). Resets on
    // release or mode change. Not persisted — transient input state.
    this.compressionCharge = 0;

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
      visibleExposure:          0.3,     // visible-spectrum brightness multiplier (0.3..2)
      visibleBloom:             0.4,     // halo/aura radius multiplier on bright bodies (0..2)
      visibleDiffractionSpikes: true,    // 4-point cross spikes on stars (Hubble-style)
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
    if (id === 'visible-lens') return this.eraIndex >= FIRST_LIGHT_ERA;
    return false;
  }

  // Current on/off state of the named lens.
  isLensEnabled(id) {
    if (id === 'radio-lens')   return !!this.radioLensActive;
    if (id === 'thermal-lens') return !!this.lensVisuallyActive;
    if (id === 'visible-lens') return !!this.visibleLensActive;
    return false;
  }

  // True when any non-audio sensor is on. The renderer gates the entire
  // visual universe (particles, macros, filaments) on this — if both
  // thermal and visible are off, you see only the radio sweep + ripples.
  anyVisualLensActive() {
    return !!(this.lensVisuallyActive || this.visibleLensActive);
  }

  // Flip a lens on or off. No-op if the lens isn't unlocked yet. Thermal
  // and Visible are mutually exclusive at render time — toggling one ON
  // auto-toggles the other OFF so they never disagree.
  toggleLens(id) {
    if (!this.canToggleLens(id)) return false;
    if (id === 'radio-lens') {
      this.radioLensActive = !this.radioLensActive;
    } else if (id === 'thermal-lens') {
      this.lensVisuallyActive = !this.lensVisuallyActive;
      if (this.lensVisuallyActive) this.visibleLensActive = false;
    } else if (id === 'visible-lens') {
      this.visibleLensActive = !this.visibleLensActive;
      if (this.visibleLensActive) this.lensVisuallyActive = false;
    }
    if (this.requestSave) this.requestSave();
    return this.isLensEnabled(id);
  }

  currentEra() {
    return ERAS[this.eraIndex] || ERAS[ERAS.length - 1];
  }

  lensLabel() {
    const labels = [];
    if (this.radioLensActive)   labels.push('Radio');
    if (this.lensVisuallyActive) labels.push('Thermal');
    if (this.visibleLensActive) labels.push('Visible');
    return labels.join(' \u00b7 ');
  }

  markInteraction(now) {
    this.lastInteractionAt = now;
  }

  // ---- Inducer mode API ----
  // True when the player meets the era gate AND has the Potential to pay.
  canUnlockInducerMode(modeId) {
    const m = INDUCER_MODES[modeId];
    if (!m) return false;
    if (this.unlockedInducerModes.has(modeId)) return false;
    if (this.eraIndex < m.eraGate) return false;
    return this.potential >= m.unlockCost;
  }

  // True when the mode is available to select (era reached, even if not yet
  // purchased). UI uses this to decide between "locked / era required" and
  // "available to unlock for X P".
  inducerModeEraReached(modeId) {
    const m = INDUCER_MODES[modeId];
    if (!m) return false;
    return this.eraIndex >= m.eraGate;
  }

  isInducerModeUnlocked(modeId) {
    return this.unlockedInducerModes.has(modeId);
  }

  unlockInducerMode(modeId) {
    if (!this.canUnlockInducerMode(modeId)) return false;
    const m = INDUCER_MODES[modeId];
    this.potential -= m.unlockCost;
    this.unlockedInducerModes.add(modeId);
    if (this.requestSave) this.requestSave();
    return true;
  }

  setInducerMode(modeId) {
    if (!this.isInducerModeUnlocked(modeId)) return false;
    if (this.inducerMode === modeId) return true;
    this.inducerMode = modeId;
    this.compressionCharge = 0;
    if (this.requestSave) this.requestSave();
    return true;
  }

  currentInducerMode() {
    return INDUCER_MODES[this.inducerMode] || INDUCER_MODES.field;
  }

  // ---- Potential income hooks ----
  // Called by simulation.js when physical threshold events occur. Each one
  // pays a one-shot Potential reward. Star ignition is the big one because
  // it's the gate to passive stellar luminosity income.
  onMacroBirth(_macro) {
    this.potential += POTENTIAL_MACRO_BIRTH;
  }
  onCradleCross(_macro) {
    this.potential += POTENTIAL_CRADLE_CROSS;
  }
  onStarIgnite(_macro) {
    this.potential += POTENTIAL_STAR_IGNITE;
  }

  update(sim, renderer, dt = 0) {
    // Recompute live totals
    let matter = 0;
    let maxMass = 0;
    let cradles = 0;
    let stellarIncomePerSec = 0;
    for (const p of sim.particles) {
      matter += p.mass;
      if (p.mass > maxMass) maxMass = p.mass;
    }
    for (const m of sim.macros) {
      matter += m.mass;
      if (m.mass > maxMass) maxMass = m.mass;
      if (m.kind === 'cradle' || m.kind === 'star') cradles++;
      if (m.kind === 'star' && m.mass > 1) {
        // log10(mass) * factor per second. log10(1500) ≈ 3.18, so a freshly
        // ignited star pays ~9.5 P/s; a 10k-mass behemoth pays ~12 P/s. The
        // sublinear curve prevents one giant from dwarfing the rest.
        stellarIncomePerSec += POTENTIAL_STELLAR_FACTOR * Math.log10(m.mass);
      }
    }
    if (stellarIncomePerSec > 0 && dt > 0) {
      this.potential += stellarIncomePerSec * dt;
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
      const prevEra = this.eraIndex;
      this.eraIndex = this.eraIndex + 1;
      this.eraEnteredAt = Date.now();
      const era = ERAS[this.eraIndex];
      if (era && !this.laws.includes(era.law)) {
        this.laws.push(era.law);
        this.pendingDiscoveries.push(era);
      }
      sim.setEraLevel(this.eraIndex);

      // Signature-moment whispers bypass the normal cooldown so they fire
      // synchronous with their dramatic visual event, not 35s later. Right
      // now this is only First Light, but the pattern can extend.
      if (prevEra < FIRST_LIGHT_ERA && this.eraIndex >= FIRST_LIGHT_ERA) {
        // Auto-handoff: thermal lens hands the visual reins to the visible
        // lens. The player can toggle either back on whenever; this is
        // just the cinematic moment of switching modes for them.
        this.lensVisuallyActive = false;
        this.visibleLensActive = true;
        const w = WHISPERS.find(x => x.id === 'first-light');
        if (w && !this.seenWhispers.has(w.id)) {
          this.pendingWhisper = w;
          this.seenWhispers.add(w.id);
          this._whisperCooldownUntil = Date.now() + WHISPER_COOLDOWN_MS;
        }
      }

      if (this.requestSave) this.requestSave();
    }

    // Cosmic expansion: idempotent migration that runs once when the player
    // is in First Light era but hasn't yet had the universe expanded. This
    // covers both the natural era 4->5 transition AND legacy saves written
    // before this feature shipped. Either way it fires exactly once and
    // sets the flag.
    if (!this.firstLightExpansionDone && this.eraIndex >= FIRST_LIGHT_ERA && sim && typeof sim.expandWorld === 'function') {
      const EXPANSION_FACTOR = 7;       // ~sqrt(50): 50x area, 7x per dim
      const COSMIC_SEED_COUNT = 3000;   // dense enough to match Era 1-4 player density across the new area
      const expansion = sim.expandWorld(EXPANSION_FACTOR);
      const seededMass = sim.seedCosmicMatter(COSMIC_SEED_COUNT, expansion.oldRect);
      // Bump caps so the bigger universe has headroom for player creation
      // + cosmic seed + future macro formation.
      sim.particleCap = 8000;
      sim.macroCap = 100;
      // Economy inflation (Option A): credit Potential by the seeded mass
      // so the new Matter doesn't suddenly exceed Potential. Each seeded
      // particle is treated as a cosmic tap the universe made.
      this.potential += Math.round(seededMass);
      // Camera handoff: re-center on new world center, clear any manual
      // override so the era-5 zoom target + cinematic framing can take over.
      if (renderer) {
        renderer.setCameraCenter?.(sim.bounds.w / 2, sim.bounds.h / 2);
        if (renderer.cameraOverride !== undefined) renderer.cameraOverride = false;
      }
      // Suppress Smart Tracking briefly so it doesn't fight the cinematic.
      this.smartTrackingSuppressUntil = Date.now() + 10000;
      this.firstLightExpansionDone = true;
      if (this.requestSave) this.requestSave();
    }

    // Cosmic-invitation whisper: fires once when the First-Light camera lerp
    // settles at the cosmic zoom (~0.06). Bypasses the normal cooldown so
    // it lands precisely on the cinematic moment, not 30s later. main.js
    // also kicks the camera-control tutorial toast on the same trigger.
    if (this.eraIndex >= FIRST_LIGHT_ERA &&
        !this.seenWhispers.has('cosmos-yours') &&
        renderer && renderer.zoom <= 0.07) {
      const w = WHISPERS.find(x => x.id === 'cosmos-yours');
      if (w) {
        this.pendingWhisper = w;
        this.seenWhispers.add(w.id);
        this._whisperCooldownUntil = Date.now() + WHISPER_COOLDOWN_MS;
        if (this.requestSave) this.requestSave();
      }
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
      visibleLensActive:  this.visibleLensActive,
      thermalScanDone:    this.thermalScanDone,
      visibleScanDone:    this.visibleScanDone,
      firstLightExpansionDone: this.firstLightExpansionDone,
      cameraTutorialShown: this.cameraTutorialShown,
      inducerMode: this.inducerMode,
      unlockedInducerModes: Array.from(this.unlockedInducerModes),
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
    this.visibleLensActive  = !!d.visibleLensActive;
    this.thermalScanDone    = !!d.thermalScanDone;
    this.visibleScanDone    = !!d.visibleScanDone;
    this.firstLightExpansionDone = !!d.firstLightExpansionDone;
    this.cameraTutorialShown = !!d.cameraTutorialShown;

    // Inducer migration: 'field' is always unlocked. If the save has an
    // explicit list, honor it (filtered to known modes). If the save predates
    // the Inducer system (no field), grant whatever the player's eraIndex
    // would have qualified them to unlock — they earned the era, so they get
    // the option to use the mode. They still have to pay to ACTIVATE? No:
    // the goal of migration is to not regress a player's options, so grant
    // outright unlock for any era they already cleared.
    this.unlockedInducerModes = new Set(['field']);
    if (Array.isArray(d.unlockedInducerModes) && d.unlockedInducerModes.length) {
      for (const id of d.unlockedInducerModes) {
        if (INDUCER_MODES[id]) this.unlockedInducerModes.add(id);
      }
    } else {
      // Legacy save: infer from era.
      for (const id of Object.keys(INDUCER_MODES)) {
        if (this.eraIndex >= INDUCER_MODES[id].eraGate) this.unlockedInducerModes.add(id);
      }
    }
    const requestedMode = typeof d.inducerMode === 'string' ? d.inducerMode : 'field';
    this.inducerMode = this.unlockedInducerModes.has(requestedMode) ? requestedMode : 'field';

    // Migration: saves written before the visibleLensActive field existed
    // had `lensVisuallyActive` doing double duty post-First-Light. If we're
    // resuming in a post-First-Light universe with thermal flagged on but
    // no explicit visible flag, infer the auto-handoff: visible was meant
    // to be the active one.
    if (d.visibleLensActive === undefined &&
        this.eraIndex >= FIRST_LIGHT_ERA &&
        this.lensVisuallyActive) {
      this.lensVisuallyActive = false;
      this.visibleLensActive = true;
    }
    if (d.settings && typeof d.settings === 'object') {
      Object.assign(this.settings, d.settings);
    }
  }
}
