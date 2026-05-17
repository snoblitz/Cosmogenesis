// Physics layer
// Pure functions that mutate particle arrays. No DOM, no rendering.
// All forces are "beautiful lies", approximations tuned for game-feel.

const G = 0.55;                       // gravitational-ish constant for particle-particle
const SOFTEN_SQ = 16;                 // softening to avoid singularities (4^2)
const ATTRACTION_RANGE_SQ = 90 * 90;  // tied to grid cell size
const MERGE_VEL_THRESHOLD = 5.5;      // relative speed below which a collision merges
const MACRO_G = 4.0;                  // macro-objects pull much harder
const MACRO_RANGE_SQ = 1300 * 1300;     // long-range macro influence on particles

// Macro-on-macro mutual attraction (Era 4+ "Cosmic Web" tier 2).
// Tuned conservatively after observing three-body chaos at higher coupling:
// gentle constant, generous distance softening so close-spawning macros don't
// detonate the existing web, and a hard velocity cap applied per tick.
const MACRO_MUTUAL_G          = 2.2;
const MACRO_MUTUAL_RANGE_SQ   = 1400 * 1400;  // aligned with filament render range
const MACRO_MUTUAL_SOFTEN_SQ  = 8100;          // ~90px softening, prevents singularity
const MAX_MACRO_SPEED         = 12;

const TIME_SCALE = 60;

// Interpolate two hues (0..360) along the SHORT arc of the color wheel.
// Linear blending of raw hue values produces wrong intermediates
// (e.g. blue + gold = green); this picks the shorter path instead.
function lerpHueShort(a, b, t) {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + diff * t) % 360) + 360) % 360;
}

// Iterate the 3x3 neighborhood of a cell in the spatial grid
function forNeighborhood(cx, cy, cols, rows, grid, fn) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const bucket = grid.get(ny * cols + nx);
      if (bucket) fn(bucket);
    }
  }
}

export function applyAttraction(particles, grid, cols, rows, cellSize, dt) {
  const scaled = dt * TIME_SCALE;
  for (const p of particles) {
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / cellSize)));
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / cellSize)));
    forNeighborhood(cx, cy, cols, rows, grid, (bucket) => {
      for (const q of bucket) {
        if (q === p) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > ATTRACTION_RANGE_SQ) continue;
        const inv = 1 / Math.sqrt(d2 + SOFTEN_SQ);
        const f = G * q.mass * inv * inv * inv; // GM/r^2 with softening, factored
        p.vx += dx * f * scaled;
        p.vy += dy * f * scaled;
      }
    });
  }
}

export function applyMacroPull(particles, macros, dt, strength) {
  const scaled = dt * TIME_SCALE;
  for (const m of macros) {
    for (const p of particles) {
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > MACRO_RANGE_SQ) continue;
      const inv = 1 / Math.sqrt(d2 + 64);
      const f = MACRO_G * m.mass * strength * inv * inv * inv;
      p.vx += dx * f * scaled;
      p.vy += dy * f * scaled;
    }
  }
}

// Era 4+ tier 2: macros attract one another. Without this, filaments fade
// over time as macros drift apart because nothing holds the web together.
// Force is gentle, falloff is softened to prevent singularity behavior, and
// a velocity cap is applied per tick so close pairs can't accelerate into
// chaos or skip the merge gate by approaching at impossible speeds.
export function applyMacroMutualPull(macros, dt) {
  if (macros.length < 2) return;
  const scaled = dt * TIME_SCALE;
  for (let i = 0; i < macros.length; i++) {
    const a = macros[i];
    for (let j = i + 1; j < macros.length; j++) {
      const b = macros[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > MACRO_MUTUAL_RANGE_SQ) continue;
      const inv  = 1 / Math.sqrt(d2 + MACRO_MUTUAL_SOFTEN_SQ);
      const inv3 = inv * inv * inv;
      // Force on a from b
      const fa = MACRO_MUTUAL_G * b.mass * inv3;
      a.vx += dx * fa * scaled;
      a.vy += dy * fa * scaled;
      // Equal-and-opposite on b from a
      const fb = MACRO_MUTUAL_G * a.mass * inv3;
      b.vx -= dx * fb * scaled;
      b.vy -= dy * fb * scaled;
    }
  }
  // Hard velocity cap per macro after the integration pass.
  const maxSq = MAX_MACRO_SPEED * MAX_MACRO_SPEED;
  for (const m of macros) {
    const sp2 = m.vx * m.vx + m.vy * m.vy;
    if (sp2 > maxSq) {
      const k = MAX_MACRO_SPEED / Math.sqrt(sp2);
      m.vx *= k;
      m.vy *= k;
    }
  }
}

export function tryMerges(particles, grid, cols, rows, cellSize) {
  let merges = 0;
  for (const p of particles) {
    if (!p.alive) continue;
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / cellSize)));
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / cellSize)));
    forNeighborhood(cx, cy, cols, rows, grid, (bucket) => {
      for (const q of bucket) {
        if (!p.alive) return;
        if (q === p || !q.alive) continue;
        if (q.id < p.id) continue; // canonical ordering avoids double-handling
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const sumR = p.r + q.r;
        if (dx * dx + dy * dy > sumR * sumR) continue;
        const dvx = q.vx - p.vx;
        const dvy = q.vy - p.vy;
        if (dvx * dvx + dvy * dvy > MERGE_VEL_THRESHOLD * MERGE_VEL_THRESHOLD) continue;
        const tm = p.mass + q.mass;
        p.x  = (p.x  * p.mass + q.x  * q.mass) / tm;
        p.y  = (p.y  * p.mass + q.y  * q.mass) / tm;
        p.vx = (p.vx * p.mass + q.vx * q.mass) / tm;
        p.vy = (p.vy * p.mass + q.vy * q.mass) / tm;
        p.mass = tm;
        p.r = 2.2 * Math.cbrt(p.mass);
        // Hues drift toward gold as mass grows. Lerp around the SHORT arc
        // of the color wheel so the path goes blue → purple → magenta → red → gold,
        // never through green.
        const warmth = Math.min(1, (p.mass - 1) / 30);
        const avgHue = lerpHueShort(p.hue, q.hue, 0.5);
        p.hue = lerpHueShort(avgHue, 30, warmth);
        q.alive = false;
        merges++;
      }
    });
  }
  return merges;
}
