// Simulation layer
// Holds particles + macro-objects, runs the tick loop, and gates which
// physical laws are active based on the current era level.

import { applyAttraction, applyMacroPull, applyMacroMutualPull, tryMerges, MERGE_RETENTION } from './physics.js';

export const GRID_SIZE = 90;            // spatial partition cell size (world px)
export const MAX_PARTICLES = 1500;      // hard performance ceiling
export const MACRO_MASS_THRESHOLD = 25; // mass at which a particle promotes to a macro
export const MAX_MACROS = 40;           // cap macros to keep render cheap
export const MACRO_CRADLE_THRESHOLD = 500; // mass at which a macro is a "Cradle" (rare, meaningful)
export const STAR_IGNITION_THRESHOLD = 1500;
export const EMITTER_RATE_HZ = 0.5;       // particles per second per active emitter
const EMITTER_OFFSET = 30;                // world-px from macro edge (not center)
const EMITTER_PARTICLE_SPEED = 12;        // initial speed toward macro
export const EMITTER_ERA_GATE = 3;        // earliest era index that allows deploy
// Cosmic time scale: every real second of sim time represents this many years
// in the player-facing universe. Internal dt math stays in real seconds; this
// only affects what we *show* the player (auto-name suffix, ages, etc.).
export const YEARS_PER_SECOND = 10;
// Cap on per-macro history entries kept in memory + localStorage. We always
// retain born, cradle, and ignition milestones; oldest absorbs are trimmed first.
export const MAX_MACRO_HISTORY = 50;

const DAMPING = 0.997;
const TIME_SCALE = 60; // dt is seconds; multiply velocity by this so numbers feel right

export class Simulation {
  constructor() {
    this.particles = [];
    this.macros = [];
    this.emitters = [];
    this.nextId = 1;
    this._nextEmitterId = 1;
    this.bounds = { w: 1920, h: 1080 };
    this.eraLevel = 0;       // 0 none, 1 attraction, 2 merging+macros, 3 strong macro pull
    this.totalMerges = 0;
    this.totalSpawned = 0;
    this.totalElapsedS = 0;  // simulation timeline in seconds (used for auto-naming)
  }

  setBounds(w, h) { this.bounds.w = w; this.bounds.h = h; }
  setEraLevel(n)  { this.eraLevel = n; }

  // Hit-test a world point against macros. `padWorld` is added to every macro's
  // radius so callers can make tap targets larger than the visual circle.
  // Returns the nearest qualifying macro (by normalized distance), or null.
  pickMacroAt(wx, wy, padWorld = 0) {
    let best = null;
    let bestScore = Infinity;
    for (const m of this.macros) {
      const dx = m.x - wx;
      const dy = m.y - wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const reach = m.r + padWorld;
      if (dist > reach) continue;
      const score = dist / reach;
      if (score < bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  _macroById(id) {
    for (const m of this.macros) {
      if (m.id === id) return m;
    }
    return null;
  }

  getEmitterForMacro(macroId) {
    for (const emitter of this.emitters) {
      if (emitter.macroId === macroId) return emitter;
    }
    return null;
  }

  deployedEmitterCount() {
    return this.emitters.length;
  }

  deployEmitter(macroId) {
    if (!this._macroById(macroId)) return null;
    if (this.getEmitterForMacro(macroId)) return null;
    const emitter = {
      id: this._nextEmitterId++,
      macroId,
      angle: Math.random() * Math.PI * 2,
      paused: false,
      accum: 0
    };
    this.emitters.push(emitter);
    return emitter;
  }

  removeEmitter(macroId) {
    const idx = this.emitters.findIndex(e => e.macroId === macroId);
    if (idx < 0) return false;
    this.emitters.splice(idx, 1);
    return true;
  }

  setEmitterPaused(macroId, paused) {
    const emitter = this.getEmitterForMacro(macroId);
    if (!emitter) return false;
    emitter.paused = !!paused;
    return true;
  }

  spawnParticle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 1.5;
    return this.spawnParticleWithVelocity(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  spawnParticleWithVelocity(x, y, vx, vy) {
    if (this.particles.length >= MAX_PARTICLES) {
      // Drop the oldest non-massive particle to make room
      let oldestIdx = -1;
      let oldestAge = -1;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (p.mass <= 2 && p.age > oldestAge) { oldestAge = p.age; oldestIdx = i; }
      }
      if (oldestIdx >= 0) this.particles.splice(oldestIdx, 1);
      else this.particles.shift();
    }
    const particle = {
      id: this.nextId++,
      x, y,
      vx, vy,
      mass: 1,
      r: 2.2,
      hue: 195 + Math.random() * 95,   // blue → violet → magenta range
      age: 0,
      alive: true
    };
    this.particles.push(particle);
    this.totalSpawned++;
    return particle;
  }

  // Build a uniform spatial grid for neighbor lookups
  _buildGrid() {
    const cols = Math.max(1, Math.ceil(this.bounds.w / GRID_SIZE));
    const rows = Math.max(1, Math.ceil(this.bounds.h / GRID_SIZE));
    const grid = new Map();
    for (const p of this.particles) {
      if (!p.alive) continue;
      const cx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / GRID_SIZE)));
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / GRID_SIZE)));
      const key = cy * cols + cx;
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(p);
    }
    return { grid, cols, rows };
  }

  tick(dt) {
    if (dt <= 0) return;
    if (this.particles.length === 0 && this.macros.length === 0 && this.emitters.length === 0) {
      // Still age particles for fade-in even with no physics, and keep the
      // timeline ticking so auto-names reflect real elapsed time.
      for (const p of this.particles) p.age += dt;
      this.totalElapsedS += dt;
      return;
    }
    this.totalElapsedS += dt;

    const { grid, cols, rows } = this._buildGrid();

    // 1. Forces
    if (this.eraLevel >= 1) {
      applyAttraction(this.particles, grid, cols, rows, GRID_SIZE, dt);
    }
    if (this.macros.length) {
      const strength = this.eraLevel >= 3 ? 1.0 : 0.55;
      applyMacroPull(this.particles, this.macros, dt, strength);
    }

    // Era 4+: macros pull one another. Keeps the cosmic web from drifting
    // apart between play sessions.
    if (this.eraLevel >= 4 && this.macros.length >= 2) {
      applyMacroMutualPull(this.macros, dt);
    }

    // 2. Integrate
    for (const p of this.particles) {
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x  += p.vx * dt * TIME_SCALE;
      p.y  += p.vy * dt * TIME_SCALE;
      p.age += dt;
      this._bounceBounds(p, 6);
    }
    for (const m of this.macros) {
      m.vx *= 0.995;
      m.vy *= 0.995;
      m.x  += m.vx * dt * TIME_SCALE;
      m.y  += m.vy * dt * TIME_SCALE;
      m.age += dt;
      m.pulse += dt;
      this._bounceBounds(m, m.r * 0.9);
    }

    // 3. Merges (era 2+)
    if (this.eraLevel >= 2) {
      const merges = tryMerges(this.particles, grid, cols, rows, GRID_SIZE);
      this.totalMerges += merges;
    }

    // 4. Cleanup merged-out particles
    if (this.particles.some(p => !p.alive)) {
      this.particles = this.particles.filter(p => p.alive);
    }

    // 5. Macro promotion (era 2+). Particles that reach the promotion mass
    // INSIDE an existing macro's body are silently accreted rather than
    // promoted, since they would just be absorbed the next tick anyway and
    // spam the catalog history with phantom Structure events. Free-space
    // promotions still happen normally.
    if (this.eraLevel >= 2) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        if (p.mass < MACRO_MASS_THRESHOLD) continue;
        const host = this._macroContaining(p.x, p.y);
        if (host) {
          const combined = host.mass + p.mass;
          host.mass = combined * MERGE_RETENTION;
          host.r = Math.max(8, Math.cbrt(host.mass) * 4.5);
          host.absorbed += Math.round(p.mass);
          this.particles.splice(i, 1);
          continue;
        }
        if (this.macros.length < MAX_MACROS) {
          this.macros.push(this._promoteToMacro(p));
          this.particles.splice(i, 1);
        }
      }
    }

    // 6. Macro-macro merging (rare, dramatic)
    if (this.macros.length >= 2 && this.eraLevel >= 2) {
      this._mergeMacros();
    }

    // 7. Emitters: auto-spawn particles around a parent macro and feed them
    // inward. Emitters tied to absorbed macros are culled here.
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const emitter = this.emitters[i];
      const macro = this._macroById(emitter.macroId);
      if (!macro) {
        this.emitters.splice(i, 1);
        continue;
      }
      if (emitter.paused) continue;
      emitter.accum += dt;
      const interval = 1 / EMITTER_RATE_HZ;
      while (emitter.accum >= interval) {
        emitter.accum -= interval;
        const cos = Math.cos(emitter.angle);
        const sin = Math.sin(emitter.angle);
        const x = macro.x + cos * (macro.r + EMITTER_OFFSET);
        const y = macro.y + sin * (macro.r + EMITTER_OFFSET);
        this.spawnParticleWithVelocity(
          x,
          y,
          -cos * EMITTER_PARTICLE_SPEED,
          -sin * EMITTER_PARTICLE_SPEED
        );
      }
    }

    // 8. Auto-name promotion: a Structure that has grown past the Cradle
    // threshold (via macro-macro merges) should reflect its new status. We
    // only rewrite names that still match the exact original auto-name; any
    // player-renamed body keeps the name they gave it.
    this._promoteAutoNames();
  }

  _promoteAutoNames() {
    for (const m of this.macros) {
      if (m.mass >= MACRO_CRADLE_THRESHOLD) {
        // Physical threshold crossing event, regardless of whether the name
        // gets rewritten. Player-renamed bodies still get their cradle moment
        // recorded in the timeline.
        if (!m.crossedCradle) {
          m.crossedCradle = true;
          this._pushHistory(m, {
            atS: this.totalElapsedS,
            kind: 'cradle',
            mass: m.mass
          });
        }
        if (m.kind === 'structure') m.kind = 'cradle';
        // Name promotion: only rewrite if the name still matches the exact
        // original auto-name. Player-renamed bodies keep their name.
        if (typeof m.bornAtS === 'number') {
          const suffix = m.bornAtS * YEARS_PER_SECOND;
          const oldAuto = `Structure${suffix}`;
          if (m.name === oldAuto) m.name = `Cradle${suffix}`;
        }
      }

      if (m.kind === 'cradle' && m.mass >= STAR_IGNITION_THRESHOLD) {
        const oldName = m.name || null;
        m.kind = 'star';
        m.ignitedAtS = this.totalElapsedS;
        m.ignitionAnim = { startS: this.totalElapsedS, duration: 2.5 };
        if (typeof m.bornAtS === 'number') {
          const suffix = m.bornAtS * YEARS_PER_SECOND;
          const oldAuto = `Cradle${suffix}`;
          if (m.name === oldAuto) m.name = `Star${suffix}`;
        }
        this._pushHistory(m, {
          atS: this.totalElapsedS,
          kind: 'ignited',
          mass: m.mass,
          prevName: oldName
        });
      }
    }
  }

  _bounceBounds(o, margin) {
    const w = this.bounds.w, h = this.bounds.h;
    if (o.x < margin)     { o.x = margin;     o.vx = Math.abs(o.vx) * 0.45; }
    if (o.y < margin)     { o.y = margin;     o.vy = Math.abs(o.vy) * 0.45; }
    if (o.x > w - margin) { o.x = w - margin; o.vx = -Math.abs(o.vx) * 0.45; }
    if (o.y > h - margin) { o.y = h - margin; o.vy = -Math.abs(o.vy) * 0.45; }
  }

  _macroContaining(x, y) {
    for (const m of this.macros) {
      const dx = m.x - x;
      const dy = m.y - y;
      if (dx * dx + dy * dy < m.r * m.r) return m;
    }
    return null;
  }

  _promoteToMacro(p) {
    // Auto-name: kind reflects mass at creation, suffix is the player-facing
    // cosmic year at the moment of birth. We store bornAtS in real seconds
    // (stable across changes to the conversion constant) and multiply for
    // display so the name stays in cosmic units.
    const bornAtS = Math.max(0, Math.floor(this.totalElapsedS));
    const bornAtYears = bornAtS * YEARS_PER_SECOND;
    const bornAsCradle = p.mass >= MACRO_CRADLE_THRESHOLD;
    const kind = bornAsCradle ? 'cradle' : 'structure';
    const label = bornAsCradle ? 'Cradle' : 'Structure';
    return {
      id: this.nextId++,
      x: p.x, y: p.y,
      vx: p.vx * 0.3, vy: p.vy * 0.3,
      mass: p.mass,
      r: Math.max(8, Math.cbrt(p.mass) * 4.5),
      hue: p.hue,
      age: 0,
      pulse: Math.random() * Math.PI * 2,
      absorbed: Math.round(p.mass),
      bornAtS,
      kind,
      crossedCradle: bornAsCradle,
      name: `${label}${bornAtYears}`,
      tracked: false,
      history: [{
        atS: this.totalElapsedS,
        kind: bornAsCradle ? 'born-cradle' : 'born',
        mass: p.mass
      }]
    };
  }

  // Build the auto-name from the macro's birth context (or a sensible
  // approximation for legacy macros without bornAtS).
  _autoNameFor(m) {
    const bornAtS = (typeof m.bornAtS === 'number')
      ? m.bornAtS
      : Math.max(0, Math.floor(this.totalElapsedS - (m.age || 0)));
    const macroKind = m.kind || ((m.mass || 0) >= MACRO_CRADLE_THRESHOLD ? 'cradle' : 'structure');
    const label = macroKind === 'star'
      ? 'Star'
      : (macroKind === 'cradle' ? 'Cradle' : 'Structure');
    return `${label}${bornAtS * YEARS_PER_SECOND}`;
  }

  setMacroName(id, name) {
    for (const m of this.macros) {
      if (m.id !== id) continue;
      const trimmed = (name == null) ? '' : String(name).trim().slice(0, 40);
      // Empty input reverts to the auto-name rather than leaving the body
      // unnamed. There's no longer a meaningful "no name" state.
      m.name = trimmed.length ? trimmed : this._autoNameFor(m);
      return true;
    }
    return false;
  }

  setMacroTracked(id, tracked) {
    for (const m of this.macros) {
      if (m.id !== id) continue;
      m.tracked = !!tracked;
      return true;
    }
    return false;
  }

  _mergeMacros() {
    for (let i = 0; i < this.macros.length; i++) {
      const a = this.macros[i];
      for (let j = i + 1; j < this.macros.length; j++) {
        const b = this.macros[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > a.r + b.r) continue;
        const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
        if (Math.hypot(dvx, dvy) > 4) continue;
        const tm = (a.mass + b.mass) * MERGE_RETENTION;
        a.x  = (a.x  * a.mass + b.x  * b.mass) / (a.mass + b.mass);
        a.y  = (a.y  * a.mass + b.y  * b.mass) / (a.mass + b.mass);
        a.vx = (a.vx * a.mass + b.vx * b.mass) / (a.mass + b.mass);
        a.vy = (a.vy * a.mass + b.vy * b.mass) / (a.mass + b.mass);
        a.mass = tm;
        a.r = Math.max(8, Math.cbrt(tm) * 4.5);
        a.absorbed += b.absorbed;
        // Record the absorption in A's history. Snapshot B's name + mass at
        // this moment; B is about to be spliced out.
        this._pushHistory(a, {
          atS: this.totalElapsedS,
          kind: 'absorbed',
          targetName: b.name || 'unnamed',
          mass: b.mass
        });
        this.macros.splice(j, 1);
        j--;
      }
    }
  }

  // Push an event onto a macro's history with a soft cap. We always retain
  // the first event (born) and any cradle/ignition thresholds; ordinary
  // absorbs get trimmed from the oldest first when the cap is exceeded.
  _pushHistory(m, event) {
    if (!Array.isArray(m.history)) m.history = [];
    m.history.push(event);
    if (m.history.length <= MAX_MACRO_HISTORY) return;
    // Build a kept set: index 0 (born) + every cradle/ignition milestone +
    // the most recent events until we're under the cap.
    const keep = new Array(m.history.length).fill(false);
    keep[0] = true;
    for (let i = 0; i < m.history.length; i++) {
      const k = m.history[i].kind;
      if (k === 'cradle' || k === 'born-cradle' || k === 'born' || k === 'ignited') keep[i] = true;
    }
    let kept = keep.reduce((n, v) => n + (v ? 1 : 0), 0);
    for (let i = m.history.length - 1; i >= 0 && kept < MAX_MACRO_HISTORY; i--) {
      if (!keep[i]) { keep[i] = true; kept++; }
    }
    m.history = m.history.filter((_, i) => keep[i]);
  }

  serialize() {
    return {
      particles: this.particles.map(p => ({
        id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
        mass: p.mass, r: p.r, hue: p.hue, age: p.age, alive: p.alive
      })),
      macros: this.macros.map(m => ({
        id: m.id, x: m.x, y: m.y, vx: m.vx, vy: m.vy,
        mass: m.mass, r: m.r, hue: m.hue, age: m.age,
        pulse: m.pulse, absorbed: m.absorbed,
        bornAtS: typeof m.bornAtS === 'number' ? m.bornAtS : 0,
        kind: m.kind || null,
        crossedCradle: !!m.crossedCradle,
        ignitedAtS: typeof m.ignitedAtS === 'number' ? m.ignitedAtS : null,
        ignitionAnim: m.ignitionAnim ? { ...m.ignitionAnim } : null,
        name: m.name || null,
        tracked: !!m.tracked,
        history: Array.isArray(m.history) ? m.history.slice() : []
      })),
      emitters: this.emitters.map(e => ({
        macroId: e.macroId,
        angle: e.angle,
        paused: e.paused,
        accum: e.accum
      })),
      nextId: this.nextId,
      eraLevel: this.eraLevel,
      totalMerges: this.totalMerges,
      totalSpawned: this.totalSpawned,
      totalElapsedS: this.totalElapsedS
    };
  }

  loadFromJSON(d) {
    d = d || {};
    this.particles = Array.isArray(d.particles) ? d.particles : [];
    this.macros = Array.isArray(d.macros) ? d.macros : [];
    this.emitters = [];
    this.nextId = d.nextId || 1;
    this._nextEmitterId = 1;
    this.eraLevel = d.eraLevel || 0;
    this.totalMerges = d.totalMerges || 0;
    this.totalSpawned = d.totalSpawned || 0;
    this.totalElapsedS = typeof d.totalElapsedS === 'number' ? d.totalElapsedS : 0;

    // Backfill bornAtS + kind + name + history for legacy macros saved before
    // their respective features.
    const KNOWN_KINDS = new Set(['born', 'born-cradle', 'absorbed', 'cradle', 'ignited']);
    for (const m of this.macros) {
      const hadBornAtS = typeof m.bornAtS === 'number';
      if (!hadBornAtS) {
        m.bornAtS = Math.max(0, Math.floor(this.totalElapsedS - (m.age || 0)));
      }
      if (!m.kind) {
        if ((m.mass || 0) >= STAR_IGNITION_THRESHOLD) m.kind = 'star';
        else if ((m.mass || 0) >= MACRO_CRADLE_THRESHOLD) m.kind = 'cradle';
        else m.kind = 'structure';
      }
      if (!m.name) m.name = this._autoNameFor(m);
      // Filter junk + defensively sanitize each event.
      if (!Array.isArray(m.history)) m.history = [];
      m.history = m.history.filter(e => e && typeof e === 'object' && KNOWN_KINDS.has(e.kind));
      // Synthesize a born event if this macro never had a history recorded.
      if (m.history.length === 0) {
        const bornKind = (m.mass || 0) >= MACRO_CRADLE_THRESHOLD ? 'born-cradle' : 'born';
        m.history.push({ atS: Math.max(0, m.bornAtS), kind: bornKind, mass: m.mass || 0 });
      }
      if (m.kind === 'star') {
        const ignitedAtS = hadBornAtS ? Math.max(0, m.bornAtS) : Math.max(0, this.totalElapsedS);
        if (!m.history.some(e => e.kind === 'ignited')) {
          m.history.push({ atS: ignitedAtS, kind: 'ignited', mass: m.mass || 0 });
        }
        if (typeof m.ignitedAtS !== 'number') m.ignitedAtS = ignitedAtS;
      }
      // Backfill the cradle-crossed flag from current mass so the event
      // doesn't get re-recorded on load.
      if (typeof m.crossedCradle !== 'boolean') {
        m.crossedCradle = m.kind === 'cradle' || m.kind === 'star' || (m.mass || 0) >= MACRO_CRADLE_THRESHOLD;
      }
      if (!m.ignitionAnim || typeof m.ignitionAnim !== 'object') m.ignitionAnim = null;
    }

    if (Array.isArray(d.emitters)) {
      for (const e of d.emitters) {
        if (!e || typeof e !== 'object' || !this._macroById(e.macroId)) continue;
        this.emitters.push({
          id: this._nextEmitterId++,
          macroId: e.macroId,
          angle: typeof e.angle === 'number' ? e.angle : 0,
          paused: !!e.paused,
          accum: typeof e.accum === 'number' ? e.accum : 0
        });
      }
    }
  }

  deserialize(d) {
    this.loadFromJSON(d);
  }
}
