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

import { isVisibleSpectrum } from './eras.js';
import { visibleHueFor } from './simulation.js';

const PARTICLE_HUE_BUCKETS = 24;
const PARTICLE_SPRITE_PX   = 128;
const MACRO_HUE_BUCKETS    = 24;
const MACRO_SPRITE_PX      = 256;

const SCAN_DURATION_S = 2.5;
const VISIBLE_SCAN_DURATION_S = 3.5;
const RADIO_SWEEP_PERIOD_S = 8.0;     // full left-to-right pass duration
const RADIO_DETECT_TOLERANCE_PX = 6;  // half-width of the detection zone

// Filament hue lerp: shortest arc around the color wheel so blue→gold goes
// through purple/magenta/red, matching the warming arc of merging particles.
function filamentHueShort(a, b, t) {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + diff * t) % 360) + 360) % 360;
}

function easeOutCubic(t) {
  const u = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - u, 3);
}

function smoothstep(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

export class Renderer {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = audio || null;
    this.dpr = 1;
    this.stars = this._makeStars(1400);
    this.frame = 0;
    this.lastT = performance.now();

    // Camera zoom: lerps from `zoom` toward `targetZoom` exponentially.
    this.zoom = 1.0;
    this.targetZoom = 1.0;

    // Camera center in world coords, set by main.js after world bounds are known.
    this.cam = { x: 0, y: 0 };

    // When true, era zoom and Smart Tracking stop writing to the camera, so
    // manual pan/zoom controls take over. Cleared by the Recenter button.
    this.cameraOverride = false;

    // Thermal lens intensity (0 = visible spectrum / clean, 1 = full thermal).
    // The thermal effect is rendered as a screen-space overlay applied
    // spatially via `scanProgress` (during reveal) or globally (after reveal).
    this.thermalAlpha = 0.0;
    this.targetThermalAlpha = 0.0;

    // Scan reveal state, set by startLensScan() when the universe first
    // tells the player about the lens.
    this.scanActive = false;
    this.scanProgress = 1.0; // 1.0 = no scan needed / scan already completed

    // First Light reverse-spectrum sweep, a one-shot bottom-to-top reveal.
    this.visibleScanActive = false;
    this.visibleScanProgress = 1.0;

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

    // Placement preview cursor in internal canvas pixels.
    this._cursorScreenX = null;
    this._cursorScreenY = null;

    // --- Cosmic Web (Era 4+) state ---
    // Tracks live filament connections between macro pairs so each new
    // connection animates a reveal sweep and triggers a one-time audio swell.
    this._filaments = new Map(); // pairKey -> { born, anim }

    // Sprite caches (built once)
    this.particleSprites = this._makeParticleSprites();
    this.macroSprites    = this._makeMacroSprites();
    this.starMacroSprite = this._makeStarMacroSprite();
  }

  setDPR(dpr) {
    this.dpr = dpr;
    this.stars = this._makeStars(1400);
    // Sprites are resolution-independent, they get scaled by drawImage.
  }

  setCameraCenter(x, y) { this.cam.x = x; this.cam.y = y; }
  setTargetZoom(z)      { this.targetZoom = z; }
  setTargetThermalAlpha(v) { this.targetThermalAlpha = v; }
  setCursor(sx, sy) {
    this._cursorScreenX = sx;
    this._cursorScreenY = sy;
  }
  clearCursor() {
    this._cursorScreenX = null;
    this._cursorScreenY = null;
  }

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

  startVisibleScan() {
    if (this.visibleScanActive) return;
    this.visibleScanActive = true;
    this.visibleScanProgress = 0.0;
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

  // Inverse of screenToWorld. Returns CSS pixels (divides internal-canvas
  // pixels by dpr) so DOM panels can be positioned without further math.
  // Ignores the small camera drift/rotation in render(), which is sub-pixel
  // for the inspector's purposes.
  worldToScreenCss(wx, wy) {
    const cxCanvas = this.canvas.width  / 2;
    const cyCanvas = this.canvas.height / 2;
    const sxCanvas = (wx - this.cam.x) * this.zoom + cxCanvas;
    const syCanvas = (wy - this.cam.y) * this.zoom + cyCanvas;
    const d = this.dpr || 1;
    return { x: sxCanvas / d, y: syCanvas / d };
  }

  _makeStars(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      // Sparse color variety: most stars are neutral white, but a meaningful
      // minority pick up cool blue or warm amber tints. This blends the
      // background visually with the same color palette the simulated matter
      // uses (cold blue young particles, warm gold accumulated mass), so when
      // the camera pulls way out at First Light the bounded matter zone does
      // not read as a rectangle of dots against a wall of white pinpricks.
      const r = Math.random();
      let color;
      if      (r < 0.78) color = [255, 255, 255];                 // neutral white (majority)
      else if (r < 0.86) color = [180, 210, 255];                 // pale blue (young matter palette)
      else if (r < 0.93) color = [255, 220, 170];                 // pale amber (warm matter palette)
      else if (r < 0.97) color = [220, 200, 255];                 // pale violet (nebular)
      else               color = [255, 195, 180];                 // pale rose (distant red giants)

      // Long-tail size distribution: most are tiny pinpricks; a few are
      // bigger "deep field" markers that read as distant galaxies/clusters.
      const sizeRoll = Math.random();
      const size = sizeRoll < 0.92 ? (0.4 + Math.random() * 1.0)
                                   : (1.8 + Math.random() * 1.6);

      out.push({
        x: Math.random(),
        y: Math.random(),
        b: 0.10 + Math.random() * 0.50,
        size,
        color,
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

  _makeStarMacroSprite() {
    const S = MACRO_SPRITE_PX;
    const half = S / 2;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const cx = c.getContext('2d');
    const halo = cx.createRadialGradient(half, half, 0, half, half, half);
    halo.addColorStop(0.0, 'hsla(50, 96%, 92%, 0.98)');
    halo.addColorStop(0.16, 'hsla(46, 92%, 82%, 0.62)');
    halo.addColorStop(0.48, 'hsla(38, 88%, 62%, 0.2)');
    halo.addColorStop(1.0, 'hsla(32, 82%, 54%, 0)');
    cx.fillStyle = halo;
    cx.fillRect(0, 0, S, S);
    const coreR = S * 0.09;
    const core = cx.createRadialGradient(half, half, 0, half, half, coreR);
    core.addColorStop(0, 'hsla(50, 28%, 99%, 1)');
    core.addColorStop(0.45, 'hsla(48, 52%, 98%, 0.98)');
    core.addColorStop(1, 'hsla(46, 48%, 96%, 0)');
    cx.fillStyle = core;
    cx.fillRect(0, 0, S, S);
    return c;
  }

  _hueIndex(hue, n) {
    return Math.floor((((hue % 360) + 360) % 360) / 360 * n) % n;
  }

  render(sim, state, ui = null) {
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

    // Advance scan reveal animations.
    if (this.scanActive) {
      this.scanProgress = Math.min(1.0, this.scanProgress + dt / SCAN_DURATION_S);
      if (this.scanProgress >= 1.0) this.scanActive = false;
    }
    if (this.visibleScanActive) {
      this.visibleScanProgress = Math.min(1.0, this.visibleScanProgress + dt / VISIBLE_SCAN_DURATION_S);
      if (this.visibleScanProgress >= 1.0) this.visibleScanActive = false;
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

    // Visible universe (starfield/foreground/macros/filaments) draws only
    // when at least one visual lens is active. Thermal and Visible each
    // count; if both are off, we're listening to radio but not looking.
    const lensActive = !!(state && (state.lensVisuallyActive || state.visibleLensActive));
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

    // Background starfield (drift only, no zoom). Each star carries its
    // own color so the field reads as a populated cosmos rather than a
    // monochrome grid of pinpricks.
    ctx.save();
    ctx.translate(cx + camDriftX * 0.25, cy + camDriftY * 0.25);
    ctx.rotate(camRot * 0.4);
    ctx.translate(-cx, -cy);
    const tw = this.frame * 0.02;
    for (const s of this.stars) {
      const a = s.b * (0.55 + 0.45 * Math.sin(tw + s.twinkle));
      const c = s.color || [255, 255, 255];
      ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a * 0.5})`;
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
    // Stash visible-lens settings for the macro/atmosphere/star paths to
    // read. Cheaper than threading state through 5 method signatures, and
    // these values don't change mid-frame.
    const settings = (state && state.settings) || {};
    this._visibleMode = isVisibleSpectrum(state);
    this._visibleExposure = (typeof settings.visibleExposure === 'number') ? settings.visibleExposure : 1.0;
    this._visibleBloom    = (typeof settings.visibleBloom === 'number')    ? settings.visibleBloom    : 1.0;
    this._visibleDiffractionSpikes = !!settings.visibleDiffractionSpikes;

    for (const p of sim.particles) this._drawParticle(p, z);
    // Filaments draw under macros so macro halos anchor the web visually.
    if (state && state.eraIndex >= 4) this._drawFilaments(sim);
    // Per-macro atmosphere (cleared halo + orbiters + feeding streams +
    // accretion ring) draws between the diffuse particle field and the
    // bright macro core, so the macro still reads as the focal point.
    for (const m of sim.macros)    this._drawMacroAtmosphere(m, t, sim.totalElapsedS);
    this._drawEmitters(sim, t, z, ui);
    for (const m of sim.macros)    this._drawMacro(m, this._visibleMode);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.restore();
    ctx.restore(); // end scan clip

    // --- Screen-space lens overlays ---
    if (this.visibleScanActive && this.visibleScanProgress < 1.0) {
      this._drawVisibleScan(W, H);
    } else if (this.thermalAlpha > 0.01) {
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

  _drawVisibleScan(W, H) {
    const ctx = this.ctx;
    const raw = Math.max(0, Math.min(1, this.visibleScanProgress));
    const eased = smoothstep(raw);
    const edgeY = H * (1 - eased);
    const aheadH = Math.max(0, Math.ceil(edgeY));
    const halo = Math.max(56, Math.round(72 * this.dpr));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    if (aheadH > 0) {
      const warmth = ctx.createLinearGradient(0, 0, 0, aheadH);
      warmth.addColorStop(0.0, 'rgba(255, 176, 116, 0.16)');
      warmth.addColorStop(0.7, 'rgba(255, 148, 96, 0.11)');
      warmth.addColorStop(1.0, 'rgba(255, 132, 84, 0.06)');
      ctx.fillStyle = warmth;
      ctx.fillRect(0, 0, W, aheadH);
    }

    const grad = ctx.createLinearGradient(0, edgeY - halo, 0, edgeY + halo);
    grad.addColorStop(0.0, 'rgba(255, 178, 98, 0)');
    grad.addColorStop(0.28, 'rgba(255, 190, 118, 0.28)');
    grad.addColorStop(0.5, 'rgba(255, 245, 225, 0.5)');
    grad.addColorStop(0.72, 'rgba(172, 224, 255, 0.18)');
    grad.addColorStop(1.0, 'rgba(134, 208, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, edgeY - halo, W, halo * 2);

    const barH = Math.max(2, Math.round(2 * this.dpr));
    ctx.fillStyle = 'rgba(255, 248, 232, 0.88)';
    ctx.fillRect(0, edgeY - barH * 0.5, W, barH);
    ctx.globalAlpha = 1;
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

  _drawMacro(m, visibleMode = false) {
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(m.pulse * 1.6) * 0.08;
    const r = m.r * this.dpr * pulse;
    const glowR = r * 5;
    // Color palette policy:
    //  - Stars always use their dedicated white-gold sprite. They are stars
    //    in any lens; the visible spectrum doesn't change what a star is.
    //  - Other macros (Structures, Cradles) use the thermal palette (m.hue)
    //    when the universe is in heat-radiation mode, OR a blackbody-derived
    //    hue (mass → temperature) when the player is observing in visible
    //    spectrum. Heavy cradles are gold-warm thermally but yellow-white
    //    in visible — that's the dramatic reveal at First Light.
    let sprite;
    if (m.kind === 'star') {
      sprite = this.starMacroSprite;
    } else {
      const hue = visibleMode ? visibleHueFor(m.mass) : m.hue;
      sprite = this.macroSprites[this._hueIndex(hue, MACRO_HUE_BUCKETS)];
    }
    // Exposure: in visible-spectrum mode, the Visible Lens has a player-
    // tunable exposure setting (camera-style brightness). Outside visible
    // mode the alpha stays 1.0.
    ctx.globalAlpha = visibleMode ? Math.max(0, Math.min(2, this._visibleExposure || 1)) : 1;
    ctx.drawImage(sprite, m.x - glowR, m.y - glowR, glowR * 2, glowR * 2);
    ctx.globalAlpha = 1;
  }

  _drawEmitterGlyph(x, y, z, opts = {}) {
    const ctx = this.ctx;
    const paused = !!opts.paused;
    const ghost = !!opts.ghost;
    const pulse = ghost ? 0 : Math.sin((opts.nowS || 0) * 4);
    const activeAlpha = ghost ? 0.4 : 0.55 + 0.35 * pulse;
    const stroke = paused
      ? (ghost ? 'rgba(176, 168, 156, 0.2)' : 'rgba(190, 180, 165, 0.25)')
      : (ghost ? `rgba(196, 170, 122, ${activeAlpha})` : `rgba(212, 168, 92, ${activeAlpha})`);
    const fill = ghost
      ? `rgba(196, 170, 122, ${Math.min(1, activeAlpha + 0.04)})`
      : `rgba(212, 168, 92, ${Math.min(1, activeAlpha + 0.08)})`;

    // Emitters live in world space, but the marker should stay UI-sized on
    // screen, so radii/line widths are expressed in world units derived from
    // screen pixels.
    const ringR = (5 * this.dpr) / z;
    const dotR = (2 * this.dpr) / z;
    const ringW = (1.5 * this.dpr) / z;
    const pauseHalfH = (2.2 * this.dpr) / z;
    const pauseGap = (1.5 * this.dpr) / z;

    ctx.strokeStyle = stroke;
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    if (paused) {
      ctx.beginPath();
      ctx.moveTo(x - pauseGap, y - pauseHalfH);
      ctx.lineTo(x - pauseGap, y + pauseHalfH);
      ctx.moveTo(x + pauseGap, y - pauseHalfH);
      ctx.lineTo(x + pauseGap, y + pauseHalfH);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawEmitters(sim, nowS, z, ui = null) {
    const ctx = this.ctx;
    const emitters = Array.isArray(sim.emitters) ? sim.emitters : [];
    const placementMode = !!(ui && ui.placementMode);
    const hasCursor = this._cursorScreenX != null && this._cursorScreenY != null;

    if (emitters.length === 0 && !(placementMode && hasCursor)) return;

    ctx.save();
    ctx.lineCap = 'round';
    for (const emitter of emitters) {
      if (!Number.isFinite(emitter?.x) || !Number.isFinite(emitter?.y)) continue;
      if (emitter.hidden) continue;
      this._drawEmitterGlyph(emitter.x, emitter.y, z, {
        nowS,
        paused: !!emitter.paused,
      });
    }

    if (placementMode && hasCursor) {
      const ghost = this.screenToWorld(this._cursorScreenX, this._cursorScreenY);
      this._drawEmitterGlyph(ghost.x, ghost.y, z, { ghost: true, nowS });
    }
    ctx.restore();
  }

  _drawStarAura(m, tSec, haloR) {
    const ctx = this.ctx;
    const baseR = m.r * this.dpr;
    // Visible Lens "Star Bloom" setting scales the halo radius. 0 = sharp
    // pinpoint, 1 = baseline, 2 = soft long-exposure glow.
    const bloom = (this._visibleMode && typeof this._visibleBloom === 'number') ? this._visibleBloom : 1.0;
    const outerR = haloR + baseR * 2.2 * bloom;
    const pulse = 1 + 0.06 * Math.sin(tSec * Math.PI * 2 * 0.7 + (m.id || 0) * 0.37);
    const halo = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, outerR);
    halo.addColorStop(0.0, `hsla(50, 96%, 92%, ${0.55 * pulse})`);
    halo.addColorStop(0.2, `hsla(48, 94%, 90%, ${0.35 * pulse})`);
    halo.addColorStop(0.62, `hsla(42, 88%, 76%, ${0.12 * pulse})`);
    halo.addColorStop(1.0, 'hsla(38, 82%, 70%, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(m.x, m.y, outerR, 0, Math.PI * 2);
    ctx.fill();

    // Optional Hubble-style diffraction spikes through the star. Drawn as
    // a 4-pointed cross (vertical + horizontal) with linear-gradient alpha
    // falloff from the center. Only renders when the Visible Lens is on
    // AND the player has explicitly enabled the setting.
    if (this._visibleMode && this._visibleDiffractionSpikes) {
      this._drawDiffractionSpikes(m, tSec, outerR);
    }
  }

  _drawDiffractionSpikes(m, tSec, outerR) {
    const ctx = this.ctx;
    // Spike length scales with star size. Long enough to read clearly,
    // not so long it dominates the screen.
    const len = outerR * 1.7;
    const wPx = Math.max(1, 1.4 * this.dpr);
    // Subtle twinkle: spike length breathes ±10% on a star-unique phase.
    const twink = 1 + 0.10 * Math.sin(tSec * Math.PI * 2 * 0.55 + (m.id || 0) * 0.91);
    const L = len * twink;

    // Each spike: gradient from bright center to transparent tip, drawn
    // as a thin rectangle rotated to its axis. Using rect+gradient instead
    // of stroked lines because rectangles can carry a fade.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m.x, m.y);
    for (let i = 0; i < 2; i++) {
      // i=0 horizontal, i=1 vertical
      ctx.save();
      ctx.rotate(i * Math.PI / 2);
      const g = ctx.createLinearGradient(-L, 0, L, 0);
      g.addColorStop(0.0,  'hsla(48, 96%, 92%, 0)');
      g.addColorStop(0.42, 'hsla(48, 96%, 94%, 0.45)');
      g.addColorStop(0.5,  'hsla(50, 100%, 98%, 0.85)');
      g.addColorStop(0.58, 'hsla(48, 96%, 94%, 0.45)');
      g.addColorStop(1.0,  'hsla(48, 96%, 92%, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-L, -wPx, L * 2, wPx * 2);
      ctx.restore();
    }
    ctx.restore();
  }

  _drawIgnitionBurst(m, simTimeS) {
    const anim = m.ignitionAnim;
    if (!anim) return;
    const elapsed = simTimeS - anim.startS;
    if (elapsed >= anim.duration) {
      m.ignitionAnim = null;
      return;
    }
    if (elapsed < 0) return;

    const ctx = this.ctx;
    const u = Math.max(0, Math.min(1, elapsed / anim.duration));
    const eased = easeOutCubic(u);
    const fade = 1 - u;
    const baseR = m.r * this.dpr;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Central flash. Tuned for "dramatic but not retina-burning" — the
    // visible scan reveal carries most of the emotional weight, this burst
    // is the punctuation. Peak alphas were 0.85/0.45/0.9 in earlier builds.
    const flash = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, baseR * 2.6);
    flash.addColorStop(0.0, `hsla(50, 100%, 98%, ${0.55 * fade})`);
    flash.addColorStop(0.32, `hsla(46, 96%, 90%, ${0.28 * fade})`);
    flash.addColorStop(1.0, 'hsla(40, 92%, 76%, 0)');
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(m.x, m.y, baseR * 2.6, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const ringScale = 1 + i * 0.6;
      const ringR = baseR * ringScale * eased * 5;
      if (ringR <= 0.01) continue;
      const ringFade = Math.max(0, fade * (1 - i * 0.14));
      ctx.lineWidth = (3 - 2.5 * u) * this.dpr;
      ctx.strokeStyle = `hsla(${48 - i * 3}, 96%, 88%, ${0.62 * ringFade})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---- Macro atmosphere ----
  //
  // Visual language: the region immediately around a major gravity well
  // should look *depleted but not empty*. We layer four ingredients:
  //   1. A faint dusty halo (additive radial gradient annulus) marking the
  //      cleared zone — center is "the void", outer rim has settled dust.
  //   2. A handful of small trapped orbiters circling the macro.
  //   3. Thin curved feeding streams curling inward from the halo edge.
  //   4. A bright tilted accretion ring that flares when the macro has
  //      recently absorbed mass (decays with a ~2.5s time constant).
  //
  // All four scale with mass via `intensity` so weak Structures get a hint
  // while massive Cradles get the full treatment.
  _drawMacroAtmosphere(m, tSec, simTimeS) {
    const ctx = this.ctx;
    // Ramp in from mass 50 → 500. Below 50 the macro is too small to
    // visually justify a halo; above 500 we cap intensity.
    const intensity = Math.min(1, Math.max(0, ((m.mass || 0) - 50) / 450));
    if (intensity <= 0) return;

    const cx = m.x;
    const cy = m.y;
    const r = m.r * this.dpr;
    const innerR = r * 2.1;
    const haloR  = r * 7.0;
    const seed = (m.id || 0) * 0.737;

    // 1) Cleared halo — annular dust glow. Transparent at center (the
    // depleted void), peaks at mid-radius, fades to transparent outside.
    const dustA = 0.10 * intensity;
    const halo = ctx.createRadialGradient(cx, cy, innerR, cx, cy, haloR);
    halo.addColorStop(0.0,  `hsla(${m.hue}, 55%, 35%, 0)`);
    halo.addColorStop(0.4,  `hsla(${m.hue}, 60%, 50%, ${dustA * 0.45})`);
    halo.addColorStop(0.72, `hsla(${m.hue}, 65%, 58%, ${dustA})`);
    halo.addColorStop(1.0,  `hsla(${m.hue}, 60%, 55%, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();

    // 2) Trapped orbiters — small bright dots circling at orbit radius,
    // alternating direction so the field doesn't read as a single rigid
    // rotation. Slight perspective squash on Y.
    const orbiterCount = 2 + Math.floor(intensity * 4); // 2..6
    const orbitR = r * 2.8;
    for (let i = 0; i < orbiterCount; i++) {
      const dir = (i % 2 === 0) ? 1 : -1;
      const baseA = seed + i * (Math.PI * 2 / orbiterCount);
      const angle = baseA + tSec * (0.45 + 0.15 * (i % 3)) * dir;
      const wobble = 1 + Math.sin(tSec * 1.7 + i) * 0.07;
      const ox = cx + Math.cos(angle) * orbitR * wobble;
      const oy = cy + Math.sin(angle) * orbitR * wobble * 0.88;
      const dotR = (0.9 + 0.4 * (i % 2)) * this.dpr;
      ctx.fillStyle = `hsla(${m.hue}, 80%, 82%, ${0.55 * intensity})`;
      ctx.beginPath();
      ctx.arc(ox, oy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3) Infalling dust cloud — instead of drawing per-arm curves (which
    // read as straight spotlight beams at typical macro scale), populate
    // a swirling cloud of grain particles around the macro. Each grain
    // has a 0..1 lifetime phase that loops every CYCLE_S seconds: at
    // phase 0 it's at the halo edge, at phase 1 it's been swallowed.
    // Combined with a small log-spiral twist, the grain population
    // self-organizes into faint trailing arms that visibly spiral
    // inward, giving the funnel-of-dust read.
    const grainCount = 14 + Math.floor(intensity * 30); // 14..44
    const ARMS = 3;
    const CYCLE_S = 7.5;
    const TWO_PI = Math.PI * 2;
    const armBase = TWO_PI / ARMS;
    // Per-macro spin direction so neighboring macros don't all rotate the
    // same way -- avoids "synchronized choreography" look.
    const spinDir = ((m.id || 0) & 1) ? 1 : -1;
    for (let k = 0; k < grainCount; k++) {
      // Deterministic per-grain randoms in [0, 1).
      const h1 = Math.sin(k * 12.9898 + seed * 7.31) * 43758.5453;
      const h2 = Math.sin(k * 78.233  + seed * 3.17) * 24634.6345;
      const h3 = Math.sin(k * 39.349  + seed * 5.91) * 19349.1031;
      const r1 = h1 - Math.floor(h1);
      const r2 = h2 - Math.floor(h2);
      const r3 = h3 - Math.floor(h3);

      // Lifetime phase (offset per grain so the population is staggered).
      const phase = ((tSec / CYCLE_S) + r1) % 1;

      // Radial fall: ease-in toward macro so grains seem to accelerate
      // (Kepler vibe without simulating real gravity here).
      const fall = phase * phase;
      const radius = haloR - (haloR - innerR) * fall;

      // Twist + base orbital sweep + arm slot + per-grain jitter angle.
      const arm = k % ARMS;
      const twist = phase * 3.4; // total angular travel during a fall
      const orbital = tSec * 0.55 * spinDir;
      const armJitter = (r2 - 0.5) * 0.35; // <±10°ish, breaks up arms
      const angle = arm * armBase + twist * spinDir + orbital + armJitter + seed;

      const gx = cx + Math.cos(angle) * radius;
      const gy = cy + Math.sin(angle) * radius;

      // Brightness envelope: faint at the halo edge, peaks mid-fall,
      // drops out as the grain is absorbed. Dust hue is always offset
      // 150 degrees from the macro's hue (with small per-grain jitter),
      // so the swirl never camouflages into the body -- cool-blue
      // Structures get warm amber dust, warm-gold Cradles get cool
      // steel-blue dust, violets get yellow-green, etc. Per-grain
      // "heating up" is expressed in lightness/saturation only, never
      // a hue shift, so we never drift back toward the macro color.
      const env = Math.sin(phase * Math.PI);
      const dotR = (0.6 + 1.1 * (1 - fall) + r3 * 0.3) * this.dpr;
      const dotA = 0.26 * intensity * env;
      const dustHue = ((m.hue || 0) + 150 + (r3 - 0.5) * 14) % 360;
      const lightness = 72 + 14 * (1 - fall);
      const sat       = 78 + 8  * (1 - fall);
      ctx.fillStyle = `hsla(${dustHue}, ${sat}%, ${lightness}%, ${dotA})`;
      ctx.beginPath();
      ctx.arc(gx, gy, dotR, 0, TWO_PI);
      ctx.fill();
    }

    // 4) Accretion ring — only flares when the macro is actively growing.
    // The growth glow decays exponentially so a single absorption event
    // leaves a satisfying afterglow rather than a single-frame flash.
    const grow = this._macroGrowGlow(m, tSec);
    if (grow > 0.02) {
      const ringR = r * 2.0;
      const ringW = r * 0.55;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(seed); // stable per-macro tilt
      ctx.scale(1, 0.42);
      const ring = ctx.createRadialGradient(0, 0, ringR - ringW, 0, 0, ringR + ringW);
      const hueWarm = m.hue + 25;
      ring.addColorStop(0.0, `hsla(${hueWarm}, 90%, 70%, 0)`);
      ring.addColorStop(0.5, `hsla(${hueWarm}, 95%, 75%, ${0.6 * grow * intensity})`);
      ring.addColorStop(1.0, `hsla(${hueWarm}, 85%, 62%, 0)`);
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(0, 0, ringR + ringW, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (m.kind === 'star') this._drawStarAura(m, tSec, haloR);
    if (m.ignitionAnim) this._drawIgnitionBurst(m, simTimeS);
  }

  // Track per-macro growth glow (driven by changes in m.absorbed). Returns
  // a 0..1 intensity that ramps up on absorption events and decays with a
  // ~2.5s time constant. State lives in renderer (not sim) so it never
  // touches save/load.
  _macroGrowGlow(m, tSec) {
    if (!this._macroGrowth) this._macroGrowth = new Map();
    const id = m.id;
    if (id == null) return 0;
    let entry = this._macroGrowth.get(id);
    const absorbed = m.absorbed || 0;
    if (!entry) {
      entry = { lastAbsorbed: absorbed, glow: 0, lastT: tSec };
      this._macroGrowth.set(id, entry);
      // Opportunistic prune to bound the map size (macros can be merged).
      // Keep the most recently inserted entries; older glow state for
      // departed macros costs only a few bytes but we cap it anyway.
      if (this._macroGrowth.size > 80) {
        const keep = Array.from(this._macroGrowth.entries()).slice(-60);
        this._macroGrowth = new Map(keep);
      }
      return 0;
    }
    const dt = Math.max(0, Math.min(0.1, tSec - entry.lastT));
    entry.lastT = tSec;
    const delta = absorbed - entry.lastAbsorbed;
    if (delta > 0) {
      entry.glow = Math.min(1, entry.glow + delta * 0.045);
      entry.lastAbsorbed = absorbed;
    }
    entry.glow *= Math.exp(-dt / 2.5);
    return entry.glow;
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
    const MIN_FILAMENT_RANGE = 1100;           // shortest reach (lightest pairs)
    const MAX_FILAMENT_RANGE = 2400;           // longest reach (heaviest pairs)
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

    const t = nowMs / 1000;
    const segs = 24;
    const wobbleScale = Math.min(14, dist * 0.04) * this.dpr;

    // Build the wobbling path once, stroke it twice: a wide soft glow
    // underneath for legibility (so the thread reads against the dark
    // background) plus a brighter narrow core on top for definition.
    // Additive blending ('lighter') means the two passes bloom together
    // without ever blowing out, so the filament feels luminous, not loud.
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

    ctx.lineCap = 'round';

    // Outer glow: wide, soft. Roughly 1/3 the alpha of the core so it
    // reads as bloom, not a second line.
    ctx.lineWidth = 5 * this.dpr;
    ctx.strokeStyle = `hsla(${hue}, 85%, 60%, ${alpha * 0.38})`;
    ctx.stroke();

    // Bright core: thin and saturated. Lightness bumped from 68% → 80%
    // so the thread itself stays distinct on top of the glow.
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.strokeStyle = `hsla(${hue}, 92%, 80%, ${Math.min(0.95, alpha * 1.2)})`;
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
