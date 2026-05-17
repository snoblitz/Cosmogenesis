// Simulation layer
// Holds particles + macro-objects, runs the tick loop, and gates which
// physical laws are active based on the current era level.

import { applyAttraction, applyMacroPull, applyMacroMutualPull, tryMerges, MERGE_RETENTION } from './physics.js';

export const GRID_SIZE = 90;            // spatial partition cell size (world px)
export const MAX_PARTICLES = 1500;      // hard performance ceiling
export const MACRO_MASS_THRESHOLD = 70; // mass at which a particle promotes to a macro
export const MAX_MACROS = 40;           // cap macros to keep render cheap
export const MACRO_CRADLE_THRESHOLD = 500; // mass at which a macro is a "Cradle" (rare, meaningful)
// Cosmic time scale: every real second of sim time represents this many years
// in the player-facing universe. Internal dt math stays in real seconds; this
// only affects what we *show* the player (auto-name suffix, ages, etc.).
export const YEARS_PER_SECOND = 10;

const DAMPING = 0.997;
const TIME_SCALE = 60; // dt is seconds; multiply velocity by this so numbers feel right

export class Simulation {
  constructor() {
    this.particles = [];
    this.macros = [];
    this.nextId = 1;
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

  spawnParticle(x, y) {
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
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 1.5;
    this.particles.push({
      id: this.nextId++,
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      mass: 1,
      r: 2.2,
      hue: 195 + Math.random() * 95,   // blue → violet → magenta range
      age: 0,
      alive: true
    });
    this.totalSpawned++;
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
    if (dt <= 0 || this.particles.length === 0 && this.macros.length === 0) {
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

    // 5. Macro promotion (era 2+)
    if (this.eraLevel >= 2 && this.macros.length < MAX_MACROS) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        if (p.mass >= MACRO_MASS_THRESHOLD) {
          this.macros.push(this._promoteToMacro(p));
          this.particles.splice(i, 1);
          if (this.macros.length >= MAX_MACROS) break;
        }
      }
    }

    // 6. Macro-macro merging (rare, dramatic)
    if (this.macros.length >= 2 && this.eraLevel >= 2) {
      this._mergeMacros();
    }
  }

  _bounceBounds(o, margin) {
    const w = this.bounds.w, h = this.bounds.h;
    if (o.x < margin)     { o.x = margin;     o.vx = Math.abs(o.vx) * 0.45; }
    if (o.y < margin)     { o.y = margin;     o.vy = Math.abs(o.vy) * 0.45; }
    if (o.x > w - margin) { o.x = w - margin; o.vx = -Math.abs(o.vx) * 0.45; }
    if (o.y > h - margin) { o.y = h - margin; o.vy = -Math.abs(o.vy) * 0.45; }
  }

  _promoteToMacro(p) {
    // Auto-name: kind reflects mass at creation, suffix is the player-facing
    // cosmic year at the moment of birth. We store bornAtS in real seconds
    // (stable across changes to the conversion constant) and multiply for
    // display so the name stays in cosmic units.
    const bornAtS = Math.max(0, Math.floor(this.totalElapsedS));
    const bornAtYears = bornAtS * YEARS_PER_SECOND;
    const kind = p.mass >= MACRO_CRADLE_THRESHOLD ? 'Cradle' : 'Structure';
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
      name: `${kind}${bornAtYears}`,
      tracked: false
    };
  }

  // Build the auto-name from the macro's birth context (or a sensible
  // approximation for legacy macros without bornAtS).
  _autoNameFor(m) {
    const bornAtS = (typeof m.bornAtS === 'number')
      ? m.bornAtS
      : Math.max(0, Math.floor(this.totalElapsedS - (m.age || 0)));
    const kind = (m.mass || 0) >= MACRO_CRADLE_THRESHOLD ? 'Cradle' : 'Structure';
    return `${kind}${bornAtS * YEARS_PER_SECOND}`;
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
        this.macros.splice(j, 1);
        j--;
      }
    }
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
        name: m.name || null,
        tracked: !!m.tracked
      })),
      nextId: this.nextId,
      eraLevel: this.eraLevel,
      totalMerges: this.totalMerges,
      totalSpawned: this.totalSpawned,
      totalElapsedS: this.totalElapsedS
    };
  }

  deserialize(d) {
    this.particles  = Array.isArray(d.particles) ? d.particles : [];
    this.macros     = Array.isArray(d.macros)    ? d.macros    : [];
    this.nextId       = d.nextId       || 1;
    this.eraLevel     = d.eraLevel     || 0;
    this.totalMerges  = d.totalMerges  || 0;
    this.totalSpawned = d.totalSpawned || 0;
    this.totalElapsedS = typeof d.totalElapsedS === 'number' ? d.totalElapsedS : 0;

    // Backfill bornAtS + name for legacy macros saved before auto-naming.
    for (const m of this.macros) {
      if (typeof m.bornAtS !== 'number') {
        m.bornAtS = Math.max(0, Math.floor(this.totalElapsedS - (m.age || 0)));
      }
      if (!m.name) m.name = this._autoNameFor(m);
    }
  }
}
