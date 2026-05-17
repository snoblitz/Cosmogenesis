# Architecture

Technical breakdown of Cosmogenesis v0.1. Module-by-module, with the data-flow diagrams and the non-obvious design choices called out.

---

## Top-level structure

```
                        ┌────────────────────┐
                        │     main.js        │ (orchestrator)
                        │  - boot            │
                        │  - input handlers  │
                        │  - game loop       │
                        │  - save scheduling │
                        │  - cue dispatch    │
                        └─┬────────┬─────────┘
                          │        │
            ┌─────────────┘        └──────────────┐
            ▼                                     ▼
  ┌──────────────────┐                ┌──────────────────────┐
  │   SIM LAYER      │                │   PRESENTATION LAYER │
  │ - simulation.js  │                │ - renderer.js        │
  │ - physics.js     │                │ - audio.js           │
  └────────┬─────────┘                │ - ui.js              │
           │                          │ - state.js (binding) │
           │                          └──────────┬───────────┘
           │                                     │
           └──────► state.js ◄───────────────────┘
                   (single source of truth)
                          │
                          ▼
                    save.js → localStorage
```

`state.js` is the truth. `simulation.js` mutates the sim shape, `renderer.js` reads to draw, `audio.js` emits sound on detection events, `ui.js` projects state into the DOM. Everything threads through `main.js` once per frame.

---

## Game loop

`main.js` runs at `requestAnimationFrame`:

```
frame(now)
├── compute dt (capped at 1/30s)
├── compute visual targets from state (lens active flags, era zoom)
├── push targets to renderer (zoom, thermalAlpha)
├── edge-trigger: lens scan reveal (once per universe)
├── edge-trigger: era audio cues (forward transitions only)
├── sim.tick(dt)               ← physics + integration + merges
├── state.update(sim, renderer) ← recompute totals, era progression, whispers
├── renderer.render(sim, state) ← draw frame
└── ui.render(state)            ← DOM HUD updates
```

The loop is **stateless beyond the persisted state**. Resuming a saved game starts a brand new game loop with the loaded state.

---

## Simulation layer

### `simulation.js`

Owns `particles[]` and `macros[]`. Each tick:

1. Builds a **uniform spatial grid** for O(N) neighbor lookups (`GRID_SIZE = 90` world units)
2. Applies short-range attraction between particles (era ≥ 1)
3. Applies macro→particle gravity (always when macros exist; strength gated by era ≥ 3)
4. Applies macro→macro mutual attraction (era ≥ 4, "Cosmic Web Tier 2")
5. Integrates velocity → position with light damping
6. Bounces off world bounds with energy loss
7. Tries particle-particle merges (era ≥ 2)
8. Promotes particles that crossed `MACRO_MASS_THRESHOLD` (70) into macros (era ≥ 2)
9. Tries macro-macro merges (era ≥ 2)

**Key constants** at top of file:
- `MAX_PARTICLES = 1500` — hard ceiling, oldest mass-1 evicted past this
- `MAX_MACROS = 40` — macro ceiling
- `MACRO_MASS_THRESHOLD = 70` — particle → macro promotion mass
- `MACRO_CRADLE_THRESHOLD = 200` — macro → cradle classification (no separate object type, just a mass band)
- `GRID_SIZE = 90` — spatial partition cell size

### `physics.js`

Pure functions, no DOM, no rendering. All forces are "beautiful lies" — softened approximations tuned for game-feel, not physical accuracy.

Exports:
- `applyAttraction(particles, grid, ...)` — particle-particle short-range gravity
- `applyMacroPull(particles, macros, dt, strength)` — macro→particle long-range gravity
- `applyMacroMutualPull(macros, dt)` — macro→macro pull (Tier 2, gated era ≥ 4)
- `tryMerges(particles, grid, ...)` — momentum-conserving particle merges with hue warming via `lerpHueShort`

**Force formulas** use `1/r³` style (softening squared) which is `G·M/r²` divided by `r` for normalization. Hard velocity cap on macros (`MAX_MACRO_SPEED = 12`) prevents close-pair chaos in Tier 2.

---

## Presentation layer

### `renderer.js`

Canvas 2D. Single render function, layered passes:

```
render(sim, state)
├── advance lerps (zoom, thermalAlpha, radioOpacity, scanProgress)
├── trail fade (full canvas)
├── tap ripples (screen space, always visible)
├── radio scan (if radioOpacity > threshold)
│   ├── update sweep position (linear/sine/pingpong)
│   ├── walk all bodies, detect ones in beam
│   ├── emit audio.detected() for new detections
│   └── draw sweep line + halo + spikes (hue-matched)
├── if !lensVisuallyActive: return (rest is hidden pre-thermal)
├── camera transform (drift + rotation + zoom)
├── inside scan clip if reveal in progress
│   ├── starfield (parallax)
│   ├── particles (sprite cache, LOD pixel fallback)
│   ├── filaments (era 4+, hue/range scaled by combined mass)
│   └── macros (sprite cache)
├── restore transform
├── thermal overlay (if thermalAlpha > threshold)
│   ├── dim layer (gated to above scan line during reveal)
│   ├── scanline grain
│   ├── moving scan bar (during reveal only)
│   └── temperature legend (if settings.thermalShowScale)
```

**Performance notes:**

- **Pre-rendered hue-bucketed sprites** for particle + macro glow. 24 sprites each, baked once in constructor. `drawImage` is ~10× faster than rebuilding a `createRadialGradient` per particle per frame.
- **LOD fallback**: particles whose final screen radius < 1.2px draw as a single tinted dot, not a full glow.
- **Filament cost**: O(N²) over macros, but N ≤ 40 so this is ~800 distance checks per frame. Trivial.
- **Spatial grid** keeps particle-particle attraction at O(N) average, not O(N²).

**Camera system:**

- World is `viewport / MIN_ZOOM = viewport × 2.5` (so particles can spread out at low zoom)
- Camera always centered on world center
- Zoom lerps slowly toward per-era target (`time constant ~6.7s`)
- Ambient Lissajous drift + tiny rotation for organic feel
- `screenToWorld()` for input coordinate inversion

### `audio.js`

Pure procedural Web Audio. No files. Lazy `AudioContext` creation on first user gesture (Chrome autoplay policy compliant).

**Four instruments:**

1. **Particle bell** (`_playBell(mass)`) , soft sine, 80ms attack, ~0.8-2.0s decay. Mass picks pitch on log scale across 4 octaves of A minor pentatonic.
2. **Structure pad** (`_playStructure(mass)`) , triangle + sub-sine + slow vibrato. 320ms attack, 3.5-6.5s decay. For macros and cradles.
3. **Filament drone** (`detectedFilament(combinedMass)`) , sine fundamental + perfect fifth + LFO vibrato. 1.6s attack, 7.5s decay. Fired once per new filament pair.
4. **Era cue** (`playEraCue(N)`) , currently wired for Era 3: stacked A minor chord across 4 octaves, 2.4-3.2s attacks, 10-13s decays. Future eras add their own cues to this dispatch.

**Throttling** prevents overload during busy scans: `minBellIntervalMs = 45`, `minStructureIntervalMs = 150`.

**Settings hooks**:
- `setVolume(v)` — master gain multiplier
- `setSustain(v)` — multiplies all decay times

### `ui.js`

DOM HUD updates. Knows nothing about physics, only reads from `state`.

**Patterns:**

- **`INSTRUMENT_DEFINITIONS`** , declarative array of instruments with settings, tooltips, change handlers
- **`UNLOCK_DEFINITIONS`** , parallel array for non-instrument earnings (empty in v0.1, reserved)
- **`GLOBAL_SETTINGS`** , settings panel popup contents (cursor style currently)
- **`INFO_TOOLTIPS`** , stat-line + cradle/filament tooltips
- **`LAW_TO_ERA`** , law text → era definition lookup for the right-side laws panel

**Settings system**: `_buildSettingControl(setting, state)` dispatches by `setting.type`:
- (default) → `_buildSliderControl`
- `'select'` → `_buildSelectControl`
- `'toggle'` → `_buildToggleControl`

Each returns `{ wrap, apply }` where `apply(value)` sets state + DOM + fires `onChange`. The Restore Defaults button just iterates and applies each setting's `default`.

**Tooltip system**: `_toggleTooltipFor(anchorEl, key, title, body)` is the generic primitive. Used by stat-line icons, setting icons, law icons, era info icon. Smart-clamps to viewport edges, repositions on resize.

**Conditional rows**: stat rows with class `stat-conditional` are hidden by default and reveal once their metric crosses zero. Used for Structures, Cradles, Filaments.

---

## State layer

### `state.js`

Single source of truth. Owns:

- **Counters**: `potential`, `matter`, `structures`, `cradles`, `filaments`, `maxParticleMass`
- **Era progression**: `eraIndex`, `eraEnteredAt`, `laws` (string array of discovered laws)
- **Whisper system**: `seenWhispers` (Set), `pendingWhisper`, `_whisperCooldownUntil`
- **Lens state**: `radioLensActive`, `lensVisuallyActive`, `thermalScanDone`
- **Settings**: `settings.{...}` (all user-tunable per-instrument + global)
- **Discovery banner queue**: `pendingDiscoveries`

`update(sim, renderer)` runs every frame:
1. Recompute live totals from sim (matter, structures, cradles, maxMass)
2. Read filament count from `renderer._filaments.size`
3. Evaluate era progression via `evaluateEra()` , advance ≤1 step per frame
4. Evaluate whispers via `findReadyWhisper()` — gated by cooldown + prerequisite (opening-radio AND opening-thermal must be seen before non-opening whispers)
5. If any of the above mutated significantly, call `requestSave` (set by main.js → triggers immediate persistence)

`serialize()` + `deserialize()` shape:

```
{
  potential, eraIndex, laws, seenWhispers (array), eraEnteredAt,
  radioLensActive, lensVisuallyActive, thermalScanDone,
  settings: { radioSweepPeriod, radioVolume, ... }
}
```

### `eras.js`

Pure data + the `evaluateEra()` predicate. Each era has:
- `name`, `law`, `lawTooltip`, `eraTooltip`, `hint`, `zoom`

13 eras defined. 5 wired up (0-4). 8 reserved.

`evaluateEra(state, sim)` returns the next era index if progression triggers, else `null`. **All gates are physical state, never wall-clock time.** The universe progresses when the universe has done enough, not when a timer says it's allowed.

### `whispers.js`

`WHISPERS[]` array (priority order) + `findReadyWhisper(state, sim, renderer)`.

Each whisper has:
- `id` (persisted in `seenWhispers` once shown)
- `message` (poetic text)
- `test(state, sim, renderer)` → boolean
- `highlight` (optional, element ID to pulse during the whisper)

**Hard rule**: nothing speaks before `opening-radio` has been seen, except the resume whisper. Prevents earlier whispers (e.g., hold-to-pour at potential ≥ 5) from eating cooldown and blocking the lens-reveal sequence.

### `save.js`

Three localStorage keys:
- `cosmogenesis` — the actual save (versioned, `VERSION = 2`)
- `cosmogenesis_freshUntil` — timestamp until which loads return null (post-reset window, 5 min)
- (legacy) `voidBloom`, `voidBloom_freshUntil`, `voidBloom_muted` — migrated on first load, then deleted

---

## Coordinate systems

Two coordinate spaces:

- **World coords** — what particles and macros use. World is `viewport_px / MIN_ZOOM`. Centered around `(worldW/2, worldH/2)`.
- **Screen coords (canvas pixels)** — what the renderer ultimately draws, after applying camera transform (translate + scale + rotate).

Conversion via `renderer.screenToWorld(sx, sy)` for input.

---

## Persistence + freshness window

When the player resets (↻ button), `save.js` sets `freshUntil = now + 5min` in localStorage. For the next 5 minutes, any page reload sees an active fresh window and `loadGame()` returns null (treating it as a brand new universe). Saves still happen in the background, but loads ignore them until the window expires.

This lets the dev/player iterate on the opening sequence freely without their universe haunting them on every refresh.

---

## What's gated by era level

| Era | sim.eraLevel | What activates |
|---|---|---|
| 0 | 0 | nothing |
| 1 | 1 | particle-particle attraction |
| 2 | 2 | particle merging + macro promotion + macro-macro merging |
| 3 | 3 | macro→particle pull at full strength (was 0.55× before) |
| 4 | 4 | macro→macro mutual attraction (Tier 2 cosmic web cohesion) |

Renderer + UI also gate on `eraIndex`:
- Filaments draw at era ≥ 4
- Thermal overlay scales with `lensVisuallyActive` (currently gated by opening-thermal whisper, post tap-100)
- Era 5+ would gate the Visible Lens unlock + ignition mechanic (not yet wired)

---

## What's NOT in v0.1

For reference when picking this up later:

- **No build tools**, no bundler, no transpiler. Pure ES modules in the browser.
- **No tests**. Manual play testing only.
- **No CI/CD**. Static file server.
- **No external dependencies**. Vanilla everything.
- **No images**. Cursors are inline SVG data URIs. Particle glows are runtime-generated sprites.
- **No audio files**. Procedural Web Audio synthesis only.

This is intentional. The project's "vanilla forever" constraint keeps everything legible and modifiable.
