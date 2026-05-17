// Rendering layer
// Canvas 2D with additive glow, motion-blur trails, ambient camera drift,
// and a smoothly-lerped zoom level that pulls back as eras advance.
//
// Performance: per-particle glow is the dominant cost in Canvas 2D, so we
// pre-render N hue-bucketed glow sprites at startup and reuse them via
// drawImage(). This is roughly 10× faster than building a radialGradient
// per particle per frame, and lets us comfortably handle 1500+ particles.
//
// Thermal lens reveal: a screen-space "scan line" sweeps top→bottom over
// ~2.5s, painting the thermal effect (dimming + scanlines) into its wake.
// Below the line: untouched bright universe. Above: full thermal sensor view.
// After the scan completes the effect covers the whole canvas at the
// current `thermalAlpha`, which can then be faded out at First Light.

const PARTICLE_HUE_BUCKETS = 24;
const PARTICLE_SPRITE_PX   = 128;
const MACRO_HUE_BUCKETS    = 24;
const MACRO_SPRITE_PX      = 256;

const SCAN_DURATION_S = 2.5;
const RADIO_SWEEP_PERIOD_S = 8.0;     // full left-to-right pass duration
const RADIO_DETECT_TOLERANCE_PX = 6;  // half-width of the detection zone

// Filament hue lerp: shortest arc around the color wheel so blue→gold goes
// through purple/magenta/red, matching the warming arc of merging particles.
function filamentHueShort(a, b, t) {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + diff * t) % 360) + 360) % 360;
}

export class Renderer {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = audio || null;
    this.dpr = 1;
    this.stars = this._makeStars(220);
    this.frame = 0;
    this.lastT = performance.now();

    // Camera zoom: lerps from `zoom` toward `targetZoom` exponentially.
    this.zoom = 1.0;
    this.targetZoom = 1.0;

    // Camera center in world coords, set by main.js after world bounds are known.
    this.cam = { x: 0, y: 0 };

    // Thermal lens intensity (0 = visible spectrum / clean, 1 = full thermal).
    // The thermal effect is rendered as a screen-space overlay applied
    // spatially via `scanProgress` (during reveal) or globally (after reveal).
    this.thermalAlpha = 0.0;
    this.targetThermalAlpha = 0.0;

    // Scan reveal state, set by startLensScan() when the universe first
    // tells the player about the lens.
    this.scanActive = false;
    this.scanProgress = 1.0; // 1.0 = no scan needed / scan already completed

    // --- Radio lens state ---
    // Gated on state.radioLensActive. The sweep line travels left to right
    // every RADIO_SWEEP_PERIOD_S seconds. When it crosses a particle/macro,
    // it emits a detection event to the audio layer and leaves a visible
    // spike. radioOpacity lerps in when the lens activates.
    // radioPhase is the underlying time counter; radioX is the derived
    // 0..1 screen position, mapped from radioPhase based on sweep style.
    this.radioX = 0;
    this.radioPhase = 0;
    this.radioOpacity = 0;
    this._radioDetected = new Set();
    this._radioSpikes = [];

    // --- Tap ripples ---
    // Subtle expanding circles at each particle spawn point. The only visual
    // feedback in the very early game (pre-radio), so the player knows their
    // tap landed even when nothing else is rendered.
    this._ripples = [];

    // --- Cosmic Web (Era 4+) state ---
    // Tracks live filament connections between macro pairs so each new
    // connection animates a reveal sweep and triggers a one-time audio swell.
    this._filaments = new Map(); // pairKey -> { born, anim }

    // Sprite caches (built once)
    this.particleSprites = this._makeParticleSprites();
    this.macroSprites    = this._makeMacroSprites();
  }

  setDPR(dpr) {
    this.dpr = dpr;
    this.stars = this._makeStars(220);
    // Sprites are resolution-independent, they get scaled by drawImage.
  }

  setCameraCenter(x, y) { this.cam.x = x; this.cam.y = y; }
  setTargetZoom(z)      { this.targetZoom = z; }
  setTargetThermalAlpha(v) { this.targetThermalAlpha = v; }

  // Queue a tap-feedback ripple at the given world coordinate.
  addRipple(worldX, worldY) {
    this._ripples.push({ x: worldX, y: worldY, born: performance.now() });
    if (this._ripples.length > 60) this._ripples.shift();
  }

  // Trigger the top-to-bottom scan reveal. Idempotent if already in progress.
  startLensScan() {
    if (this.scanActive) return;
    this.scanActive = true;
    this.scanProgress = 0.0;
  }

  // Kept for API compatibility with main.js, no longer drives rendering,
  // dimming is now achieved via the overlay rather than per-particle alpha.
  setTargetLuminosity(_v) {}

  screenToWorld(sx, sy) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      x: (sx - cx) / this.zoom + this.cam.x,
      y: (sy - cy) / this.zoom + this.cam.y
    };
  }

  _makeStars(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: Math.random(),
        y: Math.random(),
        b: 0.15 + Math.random() * 0.55,
        size: 0.5 + Math.random() * 1.4,
        twinkle: Math.random() * Math.PI * 2
      });
    }
    return out;
  }

  // Build one glow sprite per hue bucket. Each sprite contains the soft
  // outer halo plus a bright hot core, all on a transparent background.
  _makeParticleSprites() {
    const sprites = [];
    const N = PARTICLE_HUE_BUCKETS;
    const S = PARTICLE_SPRITE_PX;
    const half = S / 2;
    for (let i = 0; i < N; i++) {
      const hue = (i / N) * 360;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const cx = c.getContext('2d');
      // Outer halo
      const halo = cx.createRadialGradient(half, half, 0, half, half, half);
      halo.addColorStop(0,    `hsla(${hue}, 85%, 82%, 0.85)`);
      halo.addColorStop(0.25, `hsla(${hue}, 80%, 65%, 0.35)`);
      halo.addColorStop(1,    `hsla(${hue}, 80%, 50%, 0)`);
      cx.fillStyle = halo;
      cx.fillRect(0, 0, S, S);
      // Hot core
      const coreR = S * 0.10;
      const core = cx.createRadialGradient(half, half, 0, half, half, coreR);
      core.addColorStop(0, `hsla(${hue}, 30%, 98%, 1)`);
      core.addColorStop(1, `hsla(${hue}, 30%, 98%, 0)`);
      cx.fillStyle = core;
      cx.fillRect(0, 0, S, S);
      sprites.push(c);
    }
    return sprites;
  }

  _makeMacroSprites() {
    const sprites = [];
    const N = MACRO_HUE_BUCKETS;
    const S = MACRO_SPRITE_PX;
    const half = S / 2;
    for (let i = 0; i < N; i++) {
      const hue = (i / N) * 360;
      const shifted = (hue + 30) % 360;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const cx = c.getContext('2d');
      const halo = cx.createRadialGradient(half, half, 0, half, half, half);
      halo.addColorStop(0,    `hsla(${hue}, 90%, 88%, 0.9)`);
      halo.addColorStop(0.15, `hsla(${hue}, 88%, 70%, 0.55)`);
      halo.addColorStop(0.45, `hsla(${shifted}, 75%, 50%, 0.18)`);
      halo.addColorStop(1,    `hsla(${hue}, 60%, 40%, 0)`);
      cx.fillStyle = halo;
      cx.fillRect(0, 0, S, S);
      const coreR = S * 0.084; // matches old r*0.42 against glowR=5r
      const core = cx.createRadialGradient(half, half, 0, half, half, coreR);
      core.addColorStop(0, `hsla(${hue}, 20%, 99%, 1)`);
      core.addColorStop(1, `hsla(${hue}, 20%, 99%, 0)`);
      cx.fillStyle = core;
      cx.fillRect(0, 0, S, S);
      sprites.push(c);
    }
    return sprites;
  }

  _hueIndex(hue, n) {
    return Math.floor((((hue % 360) + 360) % 360) / 360 * n) % n;
  }

  render(sim, state) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.frame++;

    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const k = 1 - Math.exp(-dt * 0.15);
    this.zoom += (this.targetZoom - this.zoom) * k;
    // Faster lerp for the visual lens fades (thermal overlay + radio sweep
    // opacity) so user toggles feel responsive (~0.7s time constant,
    // ~2s for a perceptibly complete fade).
    const kFast = 1 - Math.exp(-dt * 1.5);
    this.thermalAlpha += (this.targetThermalAlpha - this.thermalAlpha) * kFast;
    const z = this.zoom;

    // Advance scan reveal animation.
    if (this.scanActive) {
      this.scanProgress = Math.min(1.0, this.scanProgress + dt / SCAN_DURATION_S);
      if (this.scanProgress >= 1.0) this.scanActive = false;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(2, 1, 8, 0.22)';
    ctx.fillRect(0, 0, W, H);

    // Tap ripples render at all times. Pre-radio they're the only feedback.
    this._drawRipples(W, H);

    // Radio lens runs only after the player has earned it. Pre-radio the
    // canvas is silent and empty save for tap ripples.
    const radioActive = !!(state && state.radioLensActive);
    this.radioOpacity += ((radioActive ? 1 : 0) - this.radioOpacity) * kFast;
    if (this.radioOpacity > 0.005) {
      const s = (state && state.settings) || {};
      const sweepPeriod   = s.radioSweepPeriod   || RADIO_SWEEP_PERIOD_S;
      const sweepStyle    = s.radioSweepStyle    || 'linear';
      const beamWidth     = s.radioBeamWidth     || RADIO_DETECT_TOLERANCE_PX;
      const spikeIntensity = (typeof s.radioSpikeIntensity === 'number') ? s.radioSpikeIntensity : 1.0;
      const lineOpacity    = (typeof s.radioLineOpacity === 'number') ? s.radioLineOpacity : 1.0;
      if (radioActive) this._updateRadioScan(sim, dt, W, H, sweepPeriod, sweepStyle, beamWidth);
      this._drawRadioScan(W, H, spikeIntensity, beamWidth, lineOpacity);
    }

    // Pre-thermal: foreground/starfield/thermal stay invisible.
    const lensActive = !!(state && state.lensVisuallyActive);
    if (!lensActive) {
      return;
    }

    const t = now / 1000;
    const amp = Math.min(W, H) * 0.012;
    const camDriftX = Math.sin(t * 0.11) * amp + Math.sin(t * 0.27) * amp * 0.35;
    const camDriftY = Math.cos(t * 0.09) * amp + Math.cos(t * 0.23) * amp * 0.35;
    const camRot    = Math.sin(t * 0.07) * 0.0035;

    const cx = W / 2, cy = H / 2;

    // Clip starfield + foreground to above the scan line during the reveal,
    // so the universe is painted in line-by-line as the sweep descends.
    ctx.save();
    if (this.scanActive && this.scanProgress < 1.0) {
      const scanY = Math.min(H, Math.floor(this.scanProgress * H));
      ctx.beginPath();
      ctx.rect(0, 0, W, scanY);
      ctx.clip();
    }

    // Background starfield (drift only, no zoom)
    ctx.save();
    ctx.translate(cx + camDriftX * 0.25, cy + camDriftY * 0.25);
    ctx.rotate(camRot * 0.4);
    ctx.translate(-cx, -cy);
    const tw = this.frame * 0.02;
    for (const s of this.stars) {
      const a = s.b * (0.55 + 0.45 * Math.sin(tw + s.twinkle));
      ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.5})`;
      ctx.fillRect(s.x * W, s.y * H, s.size * this.dpr, s.size * this.dpr);
    }
    ctx.restore();

    // Foreground: world → screen
    ctx.save();
    ctx.translate(cx + camDriftX, cy + camDriftY);
    ctx.rotate(camRot);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);

    ctx.globalCompositeOperation = 'lighter';
    for (const p of sim.particles) this._drawParticle(p, z);
    // Filaments draw under macros so macro halos anchor the web visually.
    if (state && state.eraIndex >= 4) this._drawFilaments(sim);
    for (const m of sim.macros)    this._drawMacro(m);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.restore();
    ctx.restore(); // end scan clip

    // --- Thermal lens overlay (screen-space, gated spatially by scanProgress) ---
    if (this.thermalAlpha > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      const scanY = Math.min(H, Math.floor(this.scanProgress * H));
      const a = this.thermalAlpha;
      const dimMul = (state && state.settings && typeof state.settings.thermalDimAmount === 'number')
        ? state.settings.thermalDimAmount : 1.0;
      const scanlineMul = (state && state.settings && typeof state.settings.thermalScanlineIntensity === 'number')
        ? state.settings.thermalScanlineIntensity : 1.0;

      // Dimming layer, the "tinted lens" darkening.
      ctx.fillStyle = `rgba(2, 4, 18, ${0.55 * a * dimMul})`;
      ctx.fillRect(0, 0, W, scanY);

      // Scanline grain, the "sensor pattern".
      ctx.globalAlpha = 0.07 * a * scanlineMul;
      ctx.fillStyle = '#9fb8ff';
      const step = Math.max(2, Math.round(2 * this.dpr));
      for (let y = 0; y < scanY; y += step) {
        ctx.fillRect(0, y, W, 1);
      }
      ctx.globalAlpha = 1;

      // The sweeping scan line itself, only while the scan is in progress.
      if (this.scanActive && this.scanProgress < 1.0) {
        const halo = Math.round(48 * this.dpr);
        const grad = ctx.createLinearGradient(0, scanY - halo, 0, scanY + halo);
        grad.addColorStop(0.0, 'rgba(159, 184, 255, 0)');
        grad.addColorStop(0.5, 'rgba(199, 220, 255, 0.45)');
        grad.addColorStop(1.0, 'rgba(159, 184, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, scanY - halo, W, halo * 2);

        // Sharp bright bar, the wavefront of the sweep.
        const barH = Math.max(2, Math.round(2 * this.dpr));
        ctx.fillStyle = 'rgba(235, 245, 255, 0.95)';
        ctx.fillRect(0, scanY - 1, W, barH);
      }

      // Temperature scale legend in bottom-left, fades with thermal alpha.
      if (state && state.settings && state.settings.thermalShowScale) {
        this._drawTemperatureScale(W, H, a);
      }
    }
  }

  // Bottom-left cold-to-warm hue legend. Hues match the actual particle warming
  // gradient defined in physics.js (lerpHueShort blue → magenta → red → gold).
  _drawTemperatureScale(W, H, thermalAlpha) {
    const ctx = this.ctx;
    const a = Math.max(0, Math.min(1, thermalAlpha * 0.9));
    if (a < 0.05) return;

    const dpr = this.dpr;
    const barW = 200 * dpr;
    const barH = 10 * dpr;
    const margin = 24 * dpr;
    const x = margin;
    const y = H - margin - barH - 14 * dpr;

    // Title above
    ctx.font = `${10 * dpr}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * a})`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('TEMPERATURE', x, y - 6 * dpr);

    // Gradient bar
    const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0.0,  `hsla(240, 80%, 65%, ${a})`);  // blue (cold)
    grad.addColorStop(0.25, `hsla(275, 80%, 65%, ${a})`);  // violet
    grad.addColorStop(0.5,  `hsla(315, 80%, 65%, ${a})`);  // magenta
    grad.addColorStop(0.78, `hsla(355, 80%, 62%, ${a})`);  // red
    grad.addColorStop(1.0,  `hsla(30,  88%, 60%, ${a})`);  // gold (warm)
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, barH);

    // Subtle border around the bar
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 * a})`;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1);

    // Cold / Warm labels below
    ctx.font = `${9 * dpr}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * a})`;
    ctx.textAlign = 'left';
    ctx.fillText('COLD', x, y + barH + 11 * dpr);
    ctx.textAlign = 'right';
    ctx.fillText('WARM', x + barW, y + barH + 11 * dpr);
  }

  _drawParticle(p, z) {
    const ctx = this.ctx;
    const fadeIn = Math.min(1, p.age * 3);
    if (fadeIn <= 0) return;

    // Particles always render at full brightness; thermal dimming is applied
    // as a screen-space overlay after this pass.
    const birthBoost = 1 + Math.max(0, 1 - p.age * 2) * 1.8;
    const glowR = p.r * 4.5 * birthBoost * this.dpr;
    const screenR = glowR * z;

    if (screenR < 1.2) {
      ctx.fillStyle = `hsla(${p.hue}, 60%, 92%, ${fadeIn * 0.9})`;
      const s = 1 / z;
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
      return;
    }

    const sprite = this.particleSprites[this._hueIndex(p.hue, PARTICLE_HUE_BUCKETS)];
    ctx.globalAlpha = fadeIn;
    ctx.drawImage(sprite, p.x - glowR, p.y - glowR, glowR * 2, glowR * 2);
  }

  _drawMacro(m) {
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(m.pulse * 1.6) * 0.08;
    const r = m.r * this.dpr * pulse;
    const glowR = r * 5;
    const sprite = this.macroSprites[this._hueIndex(m.hue, MACRO_HUE_BUCKETS)];
    ctx.globalAlpha = 1;
    ctx.drawImage(sprite, m.x - glowR, m.y - glowR, glowR * 2, glowR * 2);
  }

  // ---- Cosmic Web filaments (Era 4+) ----
  //
  // For each pair of macros within FILAMENT_RANGE world units, draw a thin
  // glowing thread between them with gentle perpendicular sine wobble for
  // organic motion. New pairs animate in (alpha fade) over ~1.5s and emit a
  // single sub-bass swell to the audio layer.

  _drawFilaments(sim) {
    if (sim.macros.length < 2) return;
    const ctx = this.ctx;
    const now = performance.now();
    const MIN_FILAMENT_RANGE = 800;            // shortest reach (lightest pairs)
    const MAX_FILAMENT_RANGE = 2200;           // longest reach (heaviest pairs)
    const REVEAL_DURATION_MS = 1600;
    // Log-mass anchor points used for cold↔warm hue and range scaling.
    const MIN_LOG = Math.log10(140 + 1);       // ~ two minimum-mass macros
    const MAX_LOG = Math.log10(2000 + 1);      // ~ heavy cradle pair
    const LOG_SPAN = MAX_LOG - MIN_LOG;

    const seen = new Set();
    for (let i = 0; i < sim.macros.length; i++) {
      const a = sim.macros[i];
      for (let j = i + 1; j < sim.macros.length; j++) {
        const b = sim.macros[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const combinedMass = a.mass + b.mass;
        // 0 (light/cold) .. 1 (heavy/hot) on a log mass scale.
        const warmth = Math.max(0, Math.min(1, (Math.log10(combinedMass + 1) - MIN_LOG) / LOG_SPAN));
        // Heavy pairs reach further; light pairs need to be closer to connect.
        const dynRange = MIN_FILAMENT_RANGE + warmth * (MAX_FILAMENT_RANGE - MIN_FILAMENT_RANGE);
        if (dist > dynRange) continue;

        const key = a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`;
        seen.add(key);

        let fil = this._filaments.get(key);
        if (!fil) {
          fil = { born: now, anim: 0 };
          this._filaments.set(key, fil);
          if (this.audio && typeof this.audio.detectedFilament === 'function') {
            this.audio.detectedFilament(combinedMass);
          }
        }
        fil.anim = Math.min(1, (now - fil.born) / REVEAL_DURATION_MS);

        this._drawFilamentLine(a, b, dx, dy, dist, fil, dynRange, warmth, now);
      }
    }

    if (this._filaments.size > seen.size) {
      for (const key of this._filaments.keys()) {
        if (!seen.has(key)) this._filaments.delete(key);
      }
    }
  }

  _drawFilamentLine(a, b, dx, dy, dist, fil, range, warmth, nowMs) {
    const ctx = this.ctx;
    const invLen = 1 / dist;
    const nx = -dy * invLen;
    const ny = dx * invLen;

    const proximity = Math.max(0, 1 - dist / range);
    const combinedMass = a.mass + b.mass;
    const baseAlpha = Math.min(0.7, (Math.log10(combinedMass + 1) / 3) * proximity * 0.55);
    const alpha = baseAlpha * fil.anim;
    if (alpha < 0.01) return;

    // Filament hue is driven by combined mass, not by endpoint colors.
    // Walks the same blue→violet→magenta→red→gold short arc the particle
    // warming uses, so cold low-mass pairs read as faint blue threads and
    // heavy bound pairs glow gold across vast distance.
    const hue = filamentHueShort(240, 30, warmth);

    ctx.strokeStyle = `hsla(${hue}, 78%, 68%, ${alpha})`;
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.lineCap = 'round';

    const t = nowMs / 1000;
    const segs = 24;
    const wobbleScale = Math.min(14, dist * 0.04) * this.dpr;

    ctx.beginPath();
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const baseX = a.x + dx * u;
      const baseY = a.y + dy * u;
      const ampMod = Math.sin(u * Math.PI);
      const wobble = Math.sin(t * 0.7 + u * Math.PI * 1.8) * ampMod * wobbleScale;
      const x = baseX + nx * wobble;
      const y = baseY + ny * wobble;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ---- Radio lens ----

  _updateRadioScan(sim, dt, W, H, sweepPeriod, sweepStyle, beamWidth) {
    // Advance phase. For linear style, phase wraps at 1 period and the line
    // snaps back to the left. For sine and ping-pong, the full traversal
    // (left → right → left) takes 2 * period, so each direction matches
    // the linear feel.
    const cycle = (sweepStyle === 'linear') ? sweepPeriod : sweepPeriod * 2;
    this.radioPhase = (this.radioPhase + dt) % cycle;

    if (sweepStyle === 'sine') {
      // Smooth, eases in/out at edges.
      this.radioX = 0.5 - 0.5 * Math.cos((this.radioPhase / sweepPeriod) * Math.PI);
    } else if (sweepStyle === 'pingpong') {
      // Linear bounce.
      const hp = this.radioPhase / sweepPeriod;
      this.radioX = hp <= 1 ? hp : 2 - hp;
    } else {
      // Linear sweep with snap-back.
      this.radioX = this.radioPhase / sweepPeriod;
    }

    const scanXpx = this.radioX * W;
    const tol = beamWidth * this.dpr;

    const cx = W / 2, cy = H / 2;
    const z = this.zoom;

    // Walk both particles and macros, find anyone in the sweep's vertical
    // strip, dedupe against last frame so each crossing fires once.
    const stillDetected = new Set();
    const fire = (body, isStructure) => {
      const screenX = (body.x - this.cam.x) * z + cx;
      if (screenX < -tol || screenX > W + tol) return;
      if (Math.abs(screenX - scanXpx) > tol) return;
      stillDetected.add(body.id);
      if (this._radioDetected.has(body.id)) return;
      const screenY = (body.y - this.cam.y) * z + cy;
      const ny = Math.max(0, Math.min(1, screenY / H));
      if (this.audio) this.audio.detected(body.mass, isStructure);
      this._radioSpikes.push({
        y: screenY,
        mass: body.mass,
        hue: body.hue,
        born: performance.now(),
        isStructure
      });
    };

    for (const p of sim.particles) fire(p, false);
    for (const m of sim.macros)    fire(m, true);

    this._radioDetected = stillDetected;

    // Garbage-collect old spikes (older than ~350ms).
    const cutoff = performance.now() - 350;
    if (this._radioSpikes.length) {
      this._radioSpikes = this._radioSpikes.filter((s) => s.born > cutoff);
    }
  }

  _drawRadioScan(W, H, spikeIntensity, beamWidth, lineOpacity) {
    const ctx = this.ctx;
    const x = this.radioX * W;
    // Combined alpha: the active-state fade-in (0..1 from radioOpacity lerp)
    // multiplied by the user's opacity slider (0..1.5+).
    const o = this.radioOpacity * (typeof lineOpacity === 'number' ? lineOpacity : 1.0);
    const spikeMul = (typeof spikeIntensity === 'number') ? spikeIntensity : 1.0;
    // Halo width physically reflects the detection beam (slight soft edge
    // multiplier so the gradient falls off just outside the catch zone).
    const beam = (typeof beamWidth === 'number' && beamWidth > 0)
      ? beamWidth
      : RADIO_DETECT_TOLERANCE_PX;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    const lineW = Math.max(1, Math.round(1 * this.dpr));
    const haloW = Math.max(8, Math.round(beam * this.dpr * 1.4));
    const halo = ctx.createLinearGradient(x - haloW, 0, x + haloW, 0);
    halo.addColorStop(0,   'rgba(180, 210, 255, 0)');
    halo.addColorStop(0.5, `rgba(210, 230, 255, ${0.18 * o})`);
    halo.addColorStop(1,   'rgba(180, 210, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - haloW, 0, haloW * 2, H);

    ctx.fillStyle = `rgba(225, 240, 255, ${0.55 * o})`;
    ctx.fillRect(x - lineW * 0.5, 0, lineW, H);

    const now = performance.now();
    for (const s of this._radioSpikes) {
      const age = (now - s.born) / 350;
      if (age >= 1) continue;
      const alpha = (1 - age) * 0.9 * o;
      const mag = Math.min(48, 6 + Math.log10(1 + s.mass) * 20) * this.dpr * spikeMul;
      // Spike inherits the detected body's hue so the readout color-matches
      // the matter it's reporting (cold blue particles -> blue spikes,
      // warm gold macros -> gold spikes).
      const hue = (typeof s.hue === 'number') ? s.hue : 220;
      ctx.fillStyle = `hsla(${hue}, 80%, 85%, ${alpha})`;
      ctx.fillRect(x, s.y - lineW * 0.5, mag, lineW);
      ctx.beginPath();
      ctx.arc(x + mag, s.y, 1.6 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawRipples(W, H) {
    const ctx = this.ctx;
    if (this._ripples.length === 0) return;
    const now = performance.now();
    const cx = W / 2, cy = H / 2;
    const z = this.zoom;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = Math.max(1, 1 * this.dpr);

    for (let i = this._ripples.length - 1; i >= 0; i--) {
      const r = this._ripples[i];
      const age = (now - r.born) / 600;
      if (age >= 1) { this._ripples.splice(i, 1); continue; }
      const screenX = (r.x - this.cam.x) * z + cx;
      const screenY = (r.y - this.cam.y) * z + cy;
      const radius = (3 + age * 26) * this.dpr;
      const alpha = (1 - age) * 0.28;
      ctx.strokeStyle = `rgba(180, 210, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
