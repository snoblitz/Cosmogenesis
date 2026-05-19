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
export const EMITTER_RATE_HZ = 0.2;       // v0.5: slowed from 0.5 → one emission per 5s. Singles slow-burn to ignition; multiples buy speed.
export const EMITTER_PARTICLE_MASS = 60;
export const EMITTER_ERA_GATE = 3;        // earliest era index that allows deploy
// v0.5: calibration phase before an emitter starts emitting. 10s visible
// countdown in the deployables list. At the end of the countdown, the
// emitter either stabilizes OR catastrophically duds (10% chance) and
// dissolves. The roll is deterministic at deploy time so save/load is
// stable, but the visual reveal happens when the countdown hits zero.
export const EMITTER_CALIBRATION_S = 10;
export const EMITTER_DUD_CHANCE = 0.10;
// When a star ignites, any emitters within this radius are consumed by the
// flare — narrative: their matter is drawn into the new star. Mechanical:
// caps emitter accumulation; each is a one-shot conversion device.
export const EMITTER_CONSUME_RADIUS = 400;
// Cosmic time scale: every real second of sim time represents this many years
// in the player-facing universe. Internal dt math stays in real seconds; this
// only affects what we *show* the player (auto-name suffix, ages, etc.).
export const YEARS_PER_SECOND = 10;

// Visible-spectrum hue for a body of the given mass. Models a coarse
// blackbody curve: cold low-mass bodies glow deep red, warming through
// orange and yellow as mass grows, then crossing into the dramatic blue-white
// range when the body has gone through stellar ignition (mass ≥ 1500). This
// is the COMPLEMENT to the thermal palette (m.hue), which evolves via the
// "accumulated heat" abstraction (cool blue → gold via merges). The visible
// palette is *physical*: hotter bodies are bluer, matching real astronomy.
// Renderer picks which palette to use based on the active lens.
export function visibleHueFor(mass) {
  const m = Math.max(0, mass || 0);
  // Pre-ignition gradient: red (cold rocky) → orange → yellow → yellow-white
  if (m < 50)   return lerp(8,  22, m / 50);            // deep red → orange-red
  if (m < 200)  return lerp(22, 38, (m - 50) / 150);    // orange-red → orange
  if (m < 700)  return lerp(38, 52, (m - 200) / 500);   // orange → yellow
  if (m < 1500) return lerp(52, 58, (m - 700) / 800);   // yellow → yellow-white
  // Post-ignition: smooth from white-yellow toward blue-white over ~3000 mass
  // so freshly ignited stars do not snap straight to deep blue.
  if (m < 3000) return lerp(58, 200, (m - 1500) / 1500);
  return 220;                                            // hot blue-white
}
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
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
    this.onEmitterEmit = null;
    // v0.5 milestone callbacks. main.js wires these to GameState income hooks.
    // The simulation never reaches into state; state listens to the sim.
    this.onMacroBirth = null;
    this.onCradleCross = null;
    this.onStarIgnite = null;
    // Fires when calibration completes and the emitter survives.
    this.onEmitterStabilize = null;
    // Fires when an emitter catastrophically duds (calibration end + bad roll).
    this.onEmitterDud = null;
    // Fires when a star ignition consumes an emitter within radius.
    this.onEmitterConsumed = null;
    // Runtime caps (overridable per-era). Default to the historical micro-era
    // values; First Light bumps them to make room for the expanded cosmos.
    this.particleCap = MAX_PARTICLES;
    this.macroCap    = MAX_MACROS;
    // Multiplier on the resize-time world size. 1 = default micro-era world
    // (viewport / MIN_ZOOM in each dim). First Light multiplies this by ~7
    // (sqrt 50) to make a ~50x area cosmos. Persisted so reloads + window
    // resizes preserve the expanded scale.
    this.worldScale = 1;
  }

  setBounds(w, h) { this.bounds.w = w; this.bounds.h = h; }
  setEraLevel(n)  { this.eraLevel = n; }

  // Cosmic expansion event (First Light, etc.). Multiplies worldScale by
  // `factor`, shifts every existing body (particles, macros, emitters) by
  // (dx, dy) so they remain at the center of the now-larger world, and
  // returns the shift so callers can update the camera + lookups.
  //
  // The caller is responsible for kicking the resize/setBounds path because
  // those are driven from main.js (canvas pixel size + MIN_ZOOM). This
  // method updates bounds.w/h directly so the new size is in effect
  // immediately, even before the next window resize.
  expandWorld(factor) {
    if (!Number.isFinite(factor) || factor <= 1) return { dx: 0, dy: 0, oldRect: null };
    const oldW = this.bounds.w, oldH = this.bounds.h;
    const newW = oldW * factor, newH = oldH * factor;
    const dx = (newW - oldW) / 2;
    const dy = (newH - oldH) / 2;
    for (const p of this.particles) { p.x += dx; p.y += dy; }
    for (const m of this.macros)    { m.x += dx; m.y += dy; }
    for (const e of this.emitters)  { e.x += dx; e.y += dy; }
    this.bounds.w = newW;
    this.bounds.h = newH;
    this.worldScale *= factor;
    return { dx, dy, oldRect: { x: dx, y: dy, w: oldW, h: oldH } };
  }

  // Sparsely seed the OUTER RING of the now-expanded world with diffuse
  // cosmic matter. Particles are mass 1-2, slow drift velocities, slightly
  // warmer hues than fresh player spawns (suggests these have been drifting
  // for some time). Rejection sampling avoids the old central rectangle.
  // Bypasses the particle cap because the player has not done the spawning;
  // the cap is for hand-spawned + emitter-spawned bodies.
  // Returns total mass added.
  seedCosmicMatter(count, oldRect) {
    if (!oldRect) return 0;
    let totalMass = 0;
    let placed = 0;
    let tries = 0;
    const maxTries = count * 6;
    while (placed < count && tries < maxTries) {
      tries++;
      const x = Math.random() * this.bounds.w;
      const y = Math.random() * this.bounds.h;
      if (x >= oldRect.x && x <= oldRect.x + oldRect.w &&
          y >= oldRect.y && y <= oldRect.y + oldRect.h) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 1.5;  // slow cosmic drift, vs 1.5-7.5 for player spawns
      const mass = 1 + Math.random() * 1.2;     // mass 1-2.2 with slight variation
      this.particles.push({
        id: this.nextId++,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        mass,
        r: 2.2,
        // Slightly warmer hue: 180-310 instead of player-spawn 195-290. The
        // long tail toward warm reads as "this has been here a while".
        hue: 180 + Math.random() * 130,
        age: 0,
        alive: true
      });
      totalMass += mass;
      placed++;
    }
    this.totalSpawned += placed;
    return totalMass;
  }

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

  getEmitterById(id) {
    for (const emitter of this.emitters) {
      if (emitter.id === id) return emitter;
    }
    return null;
  }

  deployedEmitterCount() {
    return this.emitters.length;
  }

  activeEmitterCount() {
    let count = 0;
    for (const emitter of this.emitters) {
      if (!emitter.paused) count++;
    }
    return count;
  }

  deployEmitterAt(x, y) {
    // v0.5: emitters now go through a 10-second calibration phase before
    // emitting. 10% of placements are duds — they dissolve at calibration
    // end with no emissions. The dud roll is captured at deploy time so
    // saves are deterministic; the reveal happens visually when the
    // countdown completes.
    const isDud = Math.random() < EMITTER_DUD_CHANCE;
    const emitter = {
      id: this._nextEmitterId++,
      x,
      y,
      paused: false,
      hidden: false,
      accum: 0,
      emitted: 0,
      // Calibration tracked against sim time (totalElapsedS) so it pauses
      // with the rest of the simulation and serializes cleanly.
      calibrationStartS: this.totalElapsedS,
      calibrationUntilS: this.totalElapsedS + EMITTER_CALIBRATION_S,
      isDud,
      stable: false
    };
    this.emitters.push(emitter);
    return emitter;
  }

  removeEmitterById(id) {
    const idx = this.emitters.findIndex(e => e.id === id);
    if (idx < 0) return false;
    this.emitters.splice(idx, 1);
    return true;
  }

  setEmitterPausedById(id, paused) {
    const emitter = this.getEmitterById(id);
    if (!emitter) return false;
    emitter.paused = !!paused;
    return true;
  }

  // Hide an emitter visually. It continues to emit (and earn Potential),
  // it just doesn't render. Useful when the player wants a cleaner view
  // post-deployment.
  setEmitterHiddenById(id, hidden) {
    const emitter = this.getEmitterById(id);
    if (!emitter) return false;
    emitter.hidden = !!hidden;
    return true;
  }

  spawnParticle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 1.5;
    return this.spawnParticleWithVelocity(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  spawnParticleWithVelocity(x, y, vx, vy, opts) {
    if (this.particles.length >= this.particleCap) {
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
    const mass = opts?.mass ?? 1;
    const r = opts?.r ?? 2.2;
    const hue = opts?.hue ?? (195 + Math.random() * 95);
    const particle = {
      id: this.nextId++,
      x, y,
      vx, vy,
      mass,
      r,
      hue,
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
        // v0.5: feeder particles (from Accretion Stream) never auto-promote.
        // They exist to feed an existing macro via merge participation; if
        // they miss the host they just drift and decay naturally.
        if (p.feeder) continue;
        if (this.macros.length < this.macroCap) {
          const newMacro = this._promoteToMacro(p);
          this.macros.push(newMacro);
          this.particles.splice(i, 1);
          if (typeof this.onMacroBirth === 'function') {
            this.onMacroBirth(newMacro);
          }
        }
      }
    }

    // 6. Macro-macro merging (rare, dramatic)
    if (this.macros.length >= 2 && this.eraLevel >= 2) {
      this._mergeMacros();
    }

    // 7. Emitters: standalone world entities that spray dense packets outward
    // in random directions. Gravity determines what they ultimately feed.
    // v0.5: each emitter goes through a 10s calibration phase before any
    // emissions. 10% are duds and dissolve at calibration end. Survivors
    // emit at EMITTER_RATE_HZ until consumed by a nearby ignition.
    for (let ei = this.emitters.length - 1; ei >= 0; ei--) {
      const emitter = this.emitters[ei];
      // Calibration phase: no emissions until completion.
      if (!emitter.stable && emitter.calibrationUntilS !== undefined) {
        if (this.totalElapsedS < emitter.calibrationUntilS) {
          continue;
        }
        // Calibration complete: dud or stabilize.
        if (emitter.isDud) {
          this.emitters.splice(ei, 1);
          if (typeof this.onEmitterDud === 'function') {
            this.onEmitterDud(emitter);
          }
          continue;
        }
        emitter.stable = true;
        if (typeof this.onEmitterStabilize === 'function') {
          this.onEmitterStabilize(emitter);
        }
      }
      if (emitter.paused) continue;
      emitter.accum += dt;
      const interval = 1 / EMITTER_RATE_HZ;
      while (emitter.accum >= interval) {
        emitter.accum -= interval;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 1.5;
        this.spawnParticleWithVelocity(
          emitter.x,
          emitter.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          // Dense packet: 0.97 retention means particles must exceed ~3% of
          // the macro's mass to net-grow it. Mass 60 stays positive past the
          // ignition target (1500 * 0.031 ≈ 46) so a single emitter can
          // eventually push a cradle past 1500 — slowly, at 0.2 Hz.
          { mass: EMITTER_PARTICLE_MASS, r: 3.4, hue: 38 + Math.random() * 18 }
        );
        emitter.emitted = (emitter.emitted || 0) + 1;
        if (typeof this.onEmitterEmit === 'function') {
          this.onEmitterEmit(emitter);
        }
      }
    }

    // 8. Auto-name promotion: a Structure that has grown past the Cradle
    // threshold (via macro-macro merges) should reflect its new status. We
    // only rewrite names that still match the exact original auto-name; any
    // player-renamed body keeps the name they gave it.
    this._promoteAutoNames();
  }

  _consumeEmittersAround(x, y, radius, igniter) {
    // v0.5: when a star ignites, emitters within `radius` are pulled into
    // the new star. Their matter is the same matter that fed the cradle.
    // Caps emitter sprawl: each placement is one shot at conversion.
    const r2 = radius * radius;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) {
        this.emitters.splice(i, 1);
        if (typeof this.onEmitterConsumed === 'function') {
          this.onEmitterConsumed(e, igniter);
        }
      }
    }
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
          if (typeof this.onCradleCross === 'function') {
            this.onCradleCross(m);
          }
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
        if (typeof this.onStarIgnite === 'function') {
          this.onStarIgnite(m);
        }
        // v0.5: consume emitters within radius — they fed the star into
        // being, and the ignition flare draws their matter in. One-shot
        // economic conversion: Potential → emitter → star.
        this._consumeEmittersAround(m.x, m.y, EMITTER_CONSUME_RADIUS, m);
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
        x: e.x,
        y: e.y,
        paused: e.paused,
        hidden: !!e.hidden,
        accum: e.accum,
        emitted: typeof e.emitted === 'number' ? e.emitted : 0,
        // v0.5 calibration / dud state. Saved relative to totalElapsedS so
        // reloads in mid-calibration resume correctly.
        calibrationStartS: typeof e.calibrationStartS === 'number' ? e.calibrationStartS : null,
        calibrationUntilS: typeof e.calibrationUntilS === 'number' ? e.calibrationUntilS : null,
        isDud: !!e.isDud,
        stable: !!e.stable
      })),
      nextId: this.nextId,
      eraLevel: this.eraLevel,
      totalMerges: this.totalMerges,
      totalSpawned: this.totalSpawned,
      totalElapsedS: this.totalElapsedS,
      particleCap: this.particleCap,
      macroCap: this.macroCap,
      worldScale: this.worldScale
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
    this.particleCap = typeof d.particleCap === 'number' ? d.particleCap : MAX_PARTICLES;
    this.macroCap    = typeof d.macroCap    === 'number' ? d.macroCap    : MAX_MACROS;
    this.worldScale  = typeof d.worldScale  === 'number' ? d.worldScale  : 1;

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
        if (!e || typeof e !== 'object') continue;
        let x = e.x;
        let y = e.y;
        if (typeof x !== 'number' || typeof y !== 'number') {
          if (typeof e.macroId !== 'number') continue;
          const macro = this._macroById(e.macroId);
          if (!macro) continue;
          x = macro.x;
          y = macro.y;
        }
        this.emitters.push({
          id: this._nextEmitterId++,
          x,
          y,
          paused: !!e.paused,
          hidden: !!e.hidden,
          accum: typeof e.accum === 'number' ? e.accum : 0,
          emitted: typeof e.emitted === 'number' ? e.emitted : 0,
          // v0.5: migration — legacy saves had no calibration fields. Mark
          // them as already-stable so they continue working without a
          // freshly-imposed 10s wait. New deploys go through deployEmitterAt
          // which sets the proper calibration state.
          calibrationStartS: typeof e.calibrationStartS === 'number' ? e.calibrationStartS : null,
          calibrationUntilS: typeof e.calibrationUntilS === 'number' ? e.calibrationUntilS : null,
          isDud: !!e.isDud,
          stable: e.stable === undefined ? true : !!e.stable
        });
      }
    }
  }

  deserialize(d) {
    this.loadFromJSON(d);
  }
}
