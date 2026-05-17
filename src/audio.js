// Audio layer
// Procedural, no audio files. Built on Web Audio API.
//
// Two instruments, dispatched on body type:
//
//   PARTICLES  -> soft sine bells. Mass picks pitch on a log scale up the
//                 pentatonic; lighter = higher, heavier = mid-low. Pure
//                 ambient tones, gentle attack, ~1-2s decay.
//
//   STRUCTURES -> deep triangle pad with a sub-octave sine and slow vibrato.
//                 Long slow attack, multi-second decay, distinctly rooted in
//                 the bottom of the scale. The drone underneath everything.
//
// Both throttle independently so a sweep over a busy field doesn't starve
// macros, and macros don't crowd out particle voices either.

const MUTE_KEY = 'cosmogenesis_muted';
const LEGACY_MUTE_KEY = 'voidBloom_muted';

// A minor pentatonic, ordered from highest to lowest. Whole set shifted down
// one octave from the original range so the universe sits in a warmer,
// more contemplative register.
const NOTES_HZ = [
  // Octave 4
  440.00, 392.00, 329.63, 293.66, 261.63,
  // Octave 3
  220.00, 196.00, 164.81, 146.83, 130.81,
  // Octave 2
  110.00,  98.00,  82.41,  73.42,  65.41,
  // Octave 1 (sub-bass / drone)
   55.00,  49.00,  41.20,  36.71,  32.70
];

// Subset used by the structure instrument. Bottom two octaves only.
const STRUCTURE_NOTES_HZ = NOTES_HZ.slice(NOTES_HZ.length - 10);

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = readMuted();
    this.lastBellAt = 0;
    this.lastStructureAt = 0;
    this.minBellIntervalMs      = 45;  // ~22Hz max for particle bells
    this.minStructureIntervalMs = 150; // ~7Hz max for structure drones
    this._volumeMultiplier = 1.0;
    this._sustainMultiplier = 1.0;
  }

  setVolume(v) {
    this._volumeMultiplier = Math.max(0, Math.min(2, v));
    if (this.master) this.master.gain.value = 0.22 * this._volumeMultiplier;
  }

  setSustain(v) {
    this._sustainMultiplier = Math.max(0.1, Math.min(3, v));
  }

  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch (_) {}
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22 * this._volumeMultiplier;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  // Dispatch from the renderer's radio sweep on detection.
  detected(mass, isStructure = false) {
    if (this.muted) return;
    if (!this._ensure()) return;
    if (isStructure) this._playStructure(mass);
    else             this._playBell(mass);
  }

  // ---- Particle bell: soft sine, pitch by mass ----
  _playBell(mass) {
    const now = performance.now();
    if (now - this.lastBellAt < this.minBellIntervalMs) return;
    this.lastBellAt = now;

    const t = this.ctx.currentTime;
    const massVal = Math.max(1, mass);

    const ratio = Math.min(1, Math.log10(massVal + 1) / 2.2);
    const idx   = Math.floor(ratio * (NOTES_HZ.length - 1));
    const freq  = NOTES_HZ[idx];

    const decayS  = (0.75 + Math.min(2.0, Math.log10(massVal + 1) * 0.8)) * this._sustainMultiplier;
    const attackS = 0.080;
    const peak    = Math.min(0.10, 0.035 + Math.log10(massVal + 1) * 0.028);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 6;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(2400, Math.max(380, freq * 2.5));
    lp.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attackS);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + attackS + decayS);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + attackS + decayS + 0.05);
  }

  // ---- Structure drone: triangle + sub-sine + slow vibrato ----
  _playStructure(mass) {
    const now = performance.now();
    if (now - this.lastStructureAt < this.minStructureIntervalMs) return;
    this.lastStructureAt = now;

    const t = this.ctx.currentTime;
    const massVal = Math.max(1, mass);

    // Constrained to bottom octaves; heavier macros sit even lower.
    const ratio = Math.min(1, Math.log10(massVal + 1) / 2.8);
    const idx   = Math.floor(ratio * (STRUCTURE_NOTES_HZ.length - 1));
    const freq  = STRUCTURE_NOTES_HZ[idx];

    // Slow swell, long resonant tail. Macros are events of gravity, not
    // events of light, they should hang in the air.
    const attackS = 0.32;
    const decayS  = (3.5 + Math.min(3.0, Math.log10(massVal + 1) * 1.4)) * this._sustainMultiplier;
    const peak    = Math.min(0.13, 0.055 + Math.log10(massVal + 1) * 0.028);

    // Main voice: triangle has odd-harmonic content (3rd, 5th, 7th) so it
    // reads as bell-like / organ-like rather than the pure sine of particles.
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 4;

    // Sub voice: pure sine one octave down, low amplitude, just for body.
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq * 0.5;

    // Slow vibrato LFO modulates main detune for a breathing pad feel.
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 3.2 + Math.random() * 0.8;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 5; // ±5 cents
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);

    // Warm, fairly aggressive lowpass to soften the triangle's upper
    // harmonics and round the whole thing into a pad-like tone.
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(1200, freq * 5);
    lp.Q.value = 0.7;

    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.40;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attackS);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + attackS + decayS);

    osc.connect(lp);
    lp.connect(gain);
    sub.connect(subGain);
    subGain.connect(gain);
    gain.connect(this.master);

    osc.start(t);
    sub.start(t);
    lfo.start(t);
    const stopAt = t + attackS + decayS + 0.1;
    osc.stop(stopAt);
    sub.stop(stopAt);
    lfo.stop(stopAt);
  }
  // ---- Cosmic web filament: deep sub-bass swell when a new pair forms ----
  // Rare event, no throttle. Two-voice sine (fundamental + perfect fifth)
  // with slow vibrato and a very long sustain. The sound of two gravity
  // wells acknowledging each other across space.
  detectedFilament(combinedMass) {
    if (this.muted) return;
    if (!this._ensure()) return;

    const t = this.ctx.currentTime;
    const mass = Math.max(1, combinedMass);

    // Map mass to a deep fundamental in the 45,75Hz range.
    const ratio = Math.min(1, Math.log10(mass + 1) / 3.2);
    const fundFreq = 45 + ratio * 30;

    const fund = this.ctx.createOscillator();
    fund.type = 'sine';
    fund.frequency.value = fundFreq;

    // Perfect fifth above for harmonic body.
    const fifth = this.ctx.createOscillator();
    fifth.type = 'sine';
    fifth.frequency.value = fundFreq * 1.5;

    // Slow breathing LFO on the fundamental's detune.
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.35 + Math.random() * 0.25;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain);
    lfoGain.connect(fund.detune);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.6;

    const fifthGain = this.ctx.createGain();
    fifthGain.gain.value = 0.42;

    // Long swell + very long decay. Scales subtly with combined mass.
    const peak    = Math.min(0.16, 0.08 + Math.log10(mass + 1) * 0.025) * this._sustainMultiplier;
    const attackS = 1.6;
    const decayS  = 7.5 * this._sustainMultiplier;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attackS);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + attackS + decayS);

    fund.connect(lp);
    fifth.connect(fifthGain);
    fifthGain.connect(lp);
    lp.connect(gain);
    gain.connect(this.master);

    fund.start(t);
    fifth.start(t);
    lfo.start(t);
    const stopAt = t + attackS + decayS + 0.2;
    fund.stop(stopAt);
    fifth.stop(stopAt);
    lfo.stop(stopAt);
  }

  // ---- Era transition cues ----
  // Dispatched once when the player crosses into a new era. Each cue is a
  // composed event, not a per-detection sound: a single grand swell that
  // marks the cosmological moment. Future eras add their own dispatch here.
  playEraCue(eraIndex) {
    if (this.muted) return;
    if (!this._ensure()) return;
    if (eraIndex === 3) this._playStructureEmergenceCue();
  }

  // Era 3: Structure Emerges. The first macro has formed. The cue is a
  // stacked A-minor pad across four octaves with a high C4 sparkle on top.
  // Big, slow, reverent. The kind of sound a horizon line might make.
  _playStructureEmergenceCue() {
    const t = this.ctx.currentTime;

    // Tonic chord stack: A1, E2, A2, C4. A minor triad (A + C + E) split
    // across octaves so the low voices ground the moment and the high
    // voice opens it skyward.
    const voices = [
      { freq:  55.00, type: 'triangle', peak: 0.10, attackS: 2.4, decayS: 13, lfo: true  },
      { freq:  82.41, type: 'triangle', peak: 0.08, attackS: 2.5, decayS: 13, lfo: true  },
      { freq: 110.00, type: 'triangle', peak: 0.07, attackS: 2.7, decayS: 12, lfo: true  },
      { freq: 261.63, type: 'sine',     peak: 0.06, attackS: 3.2, decayS: 10, lfo: false }
    ];

    for (const v of voices) {
      const osc = this.ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.value = v.freq;
      osc.detune.value = (Math.random() - 0.5) * 4;

      // Slow breathing vibrato on the bass voices for a sense of mass.
      let lfo = null;
      if (v.lfo) {
        lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.28 + Math.random() * 0.25;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
      }

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(1400, v.freq * 5);
      lp.Q.value = 0.55;

      const gain = this.ctx.createGain();
      const peak = v.peak * this._sustainMultiplier;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + v.attackS);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + v.attackS + v.decayS);

      osc.connect(lp);
      lp.connect(gain);
      gain.connect(this.master);

      const stopAt = t + v.attackS + v.decayS + 0.3;
      osc.start(t);
      osc.stop(stopAt);
      if (lfo) { lfo.start(t); lfo.stop(stopAt); }
    }
  }
}

function readMuted() {
  try {
    // Migrate the legacy key on first read.
    const legacy = localStorage.getItem(LEGACY_MUTE_KEY);
    if (legacy != null && localStorage.getItem(MUTE_KEY) == null) {
      localStorage.setItem(MUTE_KEY, legacy);
    }
    if (legacy != null) localStorage.removeItem(LEGACY_MUTE_KEY);
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch (_) { return false; }
}
