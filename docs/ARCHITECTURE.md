# Architecture

Technical breakdown of Cosmogenesis. Module-by-module, with the data-flow diagrams and the non-obvious design choices called out.

Current version: **v0.2**. See [CHANGELOG.md](CHANGELOG.md) for the version-by-version feature list.

---

## Top-level structure

```
                        ┌────────────────────┐
                        │     main.js        │ (orchestrator)
                        │  - boot            │
                        │  - input handlers  │
                        │  - inspector       │
                        │  - context menu    │
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
├── sim.tick(dt)               ← physics + integration + merges + history events
├── state.update(sim, renderer) ← recompute totals, cosmic year, era progression, whispers
├── renderer.render(sim, state) ← draw frame
├── ui.render(state)            ← DOM HUD updates (incl. year counter)
├── resolveInspector()          ← pick or pin macro under pointer, push to ui
└── ui.renderCatalog(...)       ← refresh tracked-body list + timelines
```

The loop is **stateless beyond the persisted state**. Resuming a saved game starts a brand new game loop with the loaded state.

---

## Simulation layer

### `simulation.js`

Owns `particles[]`, `macros[]`, and the cosmic timeline. Each tick:

1. Builds a **uniform spatial grid** for O(N) neighbor lookups (`GRID_SIZE = 90` world units)
2. Advances `totalElapsedS` (real seconds since universe start; player-facing year = `totalElapsedS * YEARS_PER_SECOND`)
3. Applies short-range attraction between particles (era ≥ 1)
4. Applies macro→particle gravity (always when macros exist; strength gated by era ≥ 3)
5. Applies macro→macro mutual attraction (era ≥ 4, "Cosmic Web Tier 2")
6. Integrates velocity → position with light damping
7. Bounces off world bounds with energy loss
8. Tries particle-particle merges with **merge tax** (era ≥ 2)
9. Promotes particles that crossed `MACRO_MASS_THRESHOLD` (25) into macros, OR silently accretes into a containing macro if the particle is inside one (era ≥ 2)
10. Tries macro-macro merges, pushing an `absorbed` history event on the surviving macro (era ≥ 2)
11. `_promoteAutoNames()` — rewrites `Structure{N}` → `Cradle{N}` on threshold crossing AND pushes a `cradle` history event (independent of name rewrite, so player-renamed bodies still get the milestone)

**Key constants** at top of file:
- `MAX_PARTICLES = 1500` — hard ceiling, oldest mass-1 evicted past this
- `MAX_MACROS = 40` — macro ceiling
- `MACRO_MASS_THRESHOLD = 25` — particle → macro promotion mass (lowered from 70 in v0.2 to compensate for the merge tax; sequential accretion steady state is ~32 mass at 3% tax)
- `MACRO_CRADLE_THRESHOLD = 500` — macro → cradle classification (no separate object type, just a mass band)
- `GRID_SIZE = 90` — spatial partition cell size
- `YEARS_PER_SECOND = 10` — cosmic-time multiplier for player-facing displays
- `MAX_MACRO_HISTORY = 50` — cap on per-macro timeline entries; born + cradle events always retained, oldest absorbs trim first

**Macro shape** (v0.2):
```js
{
  id, x, y, vx, vy,
  mass, r, hue, age,
  pulse, absorbed,
  bornAtS,         // stable birth anchor in real seconds
  crossedCradle,   // latch to prevent duplicate cradle history events
  name,            // string, always present (auto or player-set)
  tracked,         // appears in Catalog if true
  history          // [{ atS, kind, mass?, targetName? }]
}
```

**Helpers:**
- `_promoteToMacro(p)` — creates a new macro with auto-name (`{kind}{bornAtYears}`) and an initial `born` or `born-cradle` history event.
- `_macroContaining(x, y)` — returns the macro whose body contains a point, or null. Used to suppress phantom promotions inside an existing macro's gravity well.
- `_autoNameFor(m)` — recomputes the expected auto-name from `bornAtS`; used by both `setMacroName` (empty input reverts to auto) and `deserialize` (legacy backfill).
- `setMacroName(id, name)` — public API for player rename. Empty input reverts to auto-name (no "unnamed" state).
- `setMacroTracked(id, bool)` — public API for Catalog tracking.
- `pickMacroAt(wx, wy, padWorld)` — nearest-hit picker for the inspector / context menu, scaled by zoom in the caller.
- `_pushHistory(m, ev)` — pushes a history event with the soft cap policy.

### `physics.js`

Pure functions, no DOM, no rendering. All forces are "beautiful lies" — softened approximations tuned for game-feel, not physical accuracy.

Exports:
- `applyAttraction(particles, grid, ...)` — particle-particle short-range gravity
- `applyMacroPull(particles, macros, dt, strength)` — macro→particle long-range gravity
- `applyMacroMutualPull(macros, dt)` — macro→macro pull (Tier 2, gated era ≥ 4)
- `tryMerges(particles, grid, ...)` — momentum-conserving particle merges with hue warming via `lerpHueShort` AND a 3% mass tax via `MERGE_RETENTION`
- `MERGE_RETENTION = 0.97` — single tunable for binding-energy loss; same value used in `_mergeMacros` and the silent-accretion path in `simulation.js`

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

**Coordinate helpers** (used by the inspector + context menu in main.js):
- `screenToWorld(sx, sy)` — internal canvas px → world coords
- `worldToScreenCss(wx, wy)` — world coords → CSS px (divides by DPR) for DOM positioning

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

### `audio.js`

Pure procedural Web Audio. No files. Lazy `AudioContext` creation on first user gesture (Chrome autoplay policy compliant).

**Four instruments:**

1. **Particle bell** (`_playBell(mass)`) — soft sine, 80ms attack, ~0.8-2.0s decay. Mass picks pitch on log scale across 4 octaves of A minor pentatonic.
2. **Structure pad** (`_playStructure(mass)`) — triangle + sub-sine + slow vibrato. 320ms attack, 3.5-6.5s decay. For macros and cradles.
3. **Filament drone** (`detectedFilament(combinedMass)`) — sine fundamental + perfect fifth + LFO vibrato. 1.6s attack, 7.5s decay. Fired once per new filament pair.
4. **Era cue** (`playEraCue(N)`) — currently wired for Era 3: stacked A minor chord across 4 octaves, 2.4-3.2s attacks, 10-13s decays. Future eras add their own cues to this dispatch.

**Throttling** prevents overload during busy scans: `minBellIntervalMs = 45`, `minStructureIntervalMs = 150`.

**Settings hooks**:
- `setVolume(v)` — master gain multiplier
- `setSustain(v)` — multiplies all decay times
- `toggleMute()` / `setMuted(bool)` — also persists to `localStorage[cosmogenesis_muted]`

### `ui.js`

DOM HUD updates. Knows nothing about physics, only reads from `state` (and `sim` for the catalog body list).

**Patterns:**

- **`INSTRUMENT_DEFINITIONS`** — declarative array of instruments with settings, tooltips, change handlers
- **`UNLOCK_DEFINITIONS`** — parallel array for non-instrument earnings (empty in v0.1, reserved)
- **`GLOBAL_SETTINGS`** — settings panel popup contents (cursor style currently)
- **`INFO_TOOLTIPS`** — stat-line + cradle/filament tooltips
- **`LAW_TO_ERA`** — law text → era definition lookup for the right-side laws panel
- **`INSTRUMENT_ICONS`** / **`TOMBSTONE_SVG`** — inline-SVG icon library

**Settings system**: `_buildSettingControl(setting, state)` dispatches by `setting.type`:
- (default) → `_buildSliderControl`
- `'select'` → `_buildSelectControl`
- `'toggle'` → `_buildToggleControl`

Each returns `{ wrap, apply }` where `apply(value)` sets state + DOM + fires `onChange`. The Restore Defaults button just iterates and applies each setting's `default`.

**Tooltip system**: `_toggleTooltipFor(anchorEl, key, title, body)` is the generic primitive. Used by stat-line icons, setting icons, law icons, era info icon. Smart-clamps to viewport edges, repositions on resize.

**Conditional rows**: stat rows with class `stat-conditional` are hidden by default and reveal once their metric crosses zero. Used for Structures, Cradles, Filaments.

**Macro inspector** (v0.2):
- `setMacroInspector(data | null)` — read-only display of a body's stats. `data` carries `{id, name, kind, mass, absorbed, age, filaments, screenX, screenY, macroRadiusCss, pinned, hint}`. Position updated each frame via `translate3d` (no layout thrash). Cached width/height; re-measure on content change.
- Always writes the name even when fallback-displaying ("Structure"/"Cradle"), so no stale-text bug from previous bodies.

**Context menu** (v0.2):
- `showMacroContextMenu({macroId, screenX, screenY, kind, name, tracked})` — pops the menu at the requested point, stashes the macroId + name so subsequent rename pre-fill reads from the menu's own state (not from the inspector DOM, which might be showing a different body).
- Two action modes: `actions` (Rename + Track buttons) and `rename` (input field). `_enterRenameMode` morphs the menu in place. Enter / blur / form-submit commit; Escape cancels.
- Document-level pointerdown handler in capture phase: if menu is open and click is outside, close + stopPropagation + preventDefault. Prevents click-outside from also spawning a particle on the canvas.
- Callbacks set by main.js: `onMacroRename(id, name)`, `onMacroTrackToggle(id, bool)`.

**Catalog** (v0.2):
- `renderCatalog(sim, pinnedId, cradleThreshold)` — runs every frame. Filters tracked macros, sorts cradles-first then by mass desc, diffs against `_catalogNodes` (Map: macroId → entry handles).
- Each catalog entry is built once by `_buildCatalogEntry(macroId)`. Returns `{li, titleEl, subEl, timelineEl}`. The title row click pins; the chevron click toggles `_catalogExpanded` (Set of macroIds).
- `_renderTimelineInto(container, m)` cheaply diffs the history → DOM. `absorbed` events use structured DOM (textNode + name span + tombstone span + suffix textNode) to allow the inline SVG glyph next to the body's name; other event kinds use plain `textContent`.
- Pointer-events: the whole #hud-catalog panel must opt back in with `pointer-events: auto` because the parent #ui inherits `pointer-events: none` so the canvas underneath stays interactive.

**Year counter** (v0.2):
- `state.cosmicYear` is computed in `state.update(sim, ...)` as `Math.floor(sim.totalElapsedS * YEARS_PER_SECOND)`.
- `ui.render()` writes it to `#year-count` formatted via `toLocaleString()` (full comma-separated digits, never K/M/B abbreviation — abbreviating breaks immersive cosmic scale).

---

## State layer

### `state.js`

Single source of truth. Owns:

- **Counters**: `potential`, `matter`, `structures`, `cradles`, `filaments`, `maxParticleMass`, `cosmicYear`
- **Era progression**: `eraIndex`, `eraEnteredAt`, `laws` (string array of discovered laws)
- **Whisper system**: `seenWhispers` (Set), `pendingWhisper`, `_whisperCooldownUntil`
- **Lens state**: `radioLensActive`, `lensVisuallyActive`, `thermalScanDone`
- **Settings**: `settings.{...}` (all user-tunable per-instrument + global)
- **Discovery banner queue**: `pendingDiscoveries`

`update(sim, renderer)` runs every frame:
1. Recompute live totals from sim (matter, structures, cradles, maxMass, **cosmicYear**)
2. Read filament count from `renderer._filaments.size`
3. Evaluate era progression via `evaluateEra()` — advance ≤1 step per frame
4. Evaluate whispers via `findReadyWhisper()` — gated by cooldown + prerequisite (opening-radio AND opening-thermal must be seen before non-opening whispers)
5. If any of the above mutated significantly, call `requestSave` (set by main.js → triggers immediate persistence)

`serialize()` + `deserialize()` shape (v0.2):

```
{
  potential, eraIndex, laws, seenWhispers (array), eraEnteredAt,
  radioLensActive, lensVisuallyActive, thermalScanDone,
  settings: { radioSweepPeriod, radioVolume, ... }
}
```

Plus on the sim side:

```
{
  particles: [...],
  macros: [...{id, x, y, vx, vy, mass, r, hue, age, pulse, absorbed,
               bornAtS, crossedCradle, name, tracked, history}],
  nextId, eraLevel, totalMerges, totalSpawned, totalElapsedS
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

## Input model

### Pointer

`main.js` handles canvas-level pointer events. Three gestures dispatch differently based on `e.pointerType`:

**Mouse (or pen) on canvas:**
- `pointerdown` (button 0) → spawn + start hold loop
- `pointerdown` (button 2) → ignored; `contextmenu` event fires next and shows the context menu if over a macro
- `pointermove` → update `screenPos` always; the per-frame `resolveInspector()` re-picks the macro under the cursor for hover-only inspector
- `contextmenu` → preventDefault, hit-test, open context menu if over a macro

**Touch (or pen) on canvas:**
- `pointerdown` on macro → start tentative pin + 550ms long-press timer (no spawn yet)
- `pointermove` exceeding 10px CSS slop → cancel tentative pin AND long-press, become a paint gesture (spawning from current position)
- Long-press timer fires (no movement, no lift in 550ms) → open context menu at touch point, abort pin
- `pointerup` within slop + before timer → confirm pin
- `pointerdown` on empty space → spawn + hold (existing behavior)

### Per-frame inspector resolution

`main.js::resolveInspector()` runs after `sim.tick` + `state.update` + `renderer.render`:

```
if !lensActive          → hide inspector, clear pin
if inspectorPinId set   → show pinned macro (drop pin if macro is gone)
else if holding          → hide (focus on the act of spawning)
else if !mouse/pen       → hide (touch has no hover concept)
else if !pointerInside   → hide
else                     → hover-pick macro at screenPos, show or hide
```

### Keyboard

- **M** → toggle audio mute (ignored when focus is in a text input — so typing M while renaming doesn't mute)
- **Escape** → close context menu (if open)

---

## Coordinate systems

Three coordinate spaces:

- **World coords** — what particles and macros use. World is `viewport_px / MIN_ZOOM`. Centered around `(worldW/2, worldH/2)`.
- **Screen coords (internal canvas px)** — what the renderer ultimately draws, after applying camera transform (translate + scale + rotate).
- **CSS pixels** — what DOM panels (inspector, context menu) position themselves in. Differs from internal canvas px by the `devicePixelRatio`.

Conversion helpers in renderer.js: `screenToWorld(sx, sy)` for input, `worldToScreenCss(wx, wy)` for DOM panel positioning.

---

## Persistence + freshness window

When the player resets (↻ button), `save.js` sets `freshUntil = now + 5min` in localStorage. For the next 5 minutes, any page reload sees an active fresh window and `loadGame()` returns null (treating it as a brand new universe). Saves still happen in the background, but loads ignore them until the window expires.

This lets the dev/player iterate on the opening sequence freely without their universe haunting them on every refresh.

---

## Legacy save migration

v0.2 backfills the following on `sim.deserialize` for any save written by an earlier build:
- `totalElapsedS` defaults to 0 if missing
- `m.bornAtS` defaults to `max(0, totalElapsedS - age)` if missing
- `m.name` defaults to `_autoNameFor(m)` if missing
- `m.crossedCradle` defaults to `mass >= MACRO_CRADLE_THRESHOLD` so the cradle event doesn't re-fire on load
- `m.history` defaults to `[{atS, kind: born | born-cradle, mass}]` if missing or empty; events with unknown `kind` get filtered out

The state-side `cosmogenesis` localStorage key is unchanged; the new fields ride on the sim shape.

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

The macro inspector + catalog gate on `lensVisuallyActive` (you can't inspect what you can't see).

---

## What's NOT in v0.2

For reference when picking this up later:

- **No build tools**, no bundler, no transpiler. Pure ES modules in the browser.
- **No tests**. Manual play testing only.
- **No CI/CD**. Static file server.
- **No external dependencies**. Vanilla everything.
- **No images other than `favicon.svg`**. Cursors are inline SVG data URIs. Particle glows are runtime-generated sprites.
- **No audio files**. Procedural Web Audio synthesis only.

This is intentional. The project's "vanilla forever" constraint keeps everything legible and modifiable.

---
