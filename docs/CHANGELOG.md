# Changelog

All notable changes to Cosmogenesis. Versioning follows roughly [Semantic Versioning](https://semver.org/) — major.minor.patch.

---

## v0.1.0 — *2026-05-17* — Initial baseline checkpoint

The first complete vertical slice. Five eras playable, three instruments, cosmic web with mutual macro attraction, full settings system, audio + visual reveal cinematic, persistent saves with legacy migration. Built in one Sunday morning collaborative session.

### World

- **5 implemented eras** (of 13 designed):
  - 0 — The First Particle (initial, no physics)
  - 1 — The Field Awakens (particle-particle attraction)
  - 2 — Matter Learns to Gather (particle merging + warming hue gradient)
  - 3 — Structure Emerges (macro promotion at mass ≥ 70)
  - 4 — The Cosmic Web (filaments between macros, Tier 2 mutual attraction)
- **8 future eras scaffolded** in `eras.js` with full law tooltips, era tooltips, and target zoom values
- **Physics-only progression** — no wall-clock gates anywhere in world state

### Simulation

- Particle/macro physics with uniform spatial grid for O(N) neighbor lookups
- Mass-conserving merges with momentum preservation
- Hue warming on merge via shortest-arc color wheel interpolation (blue → magenta → red → gold, never through green)
- Macro promotion at mass threshold (70)
- Macro categorization: structures (≥70) → cradles (≥200)
- Macro-on-macro mutual attraction at Era 4 with safety rails:
  - Soft inverse-cube falloff with 90px softening
  - Hard velocity cap (12 units/s)
  - Conservative coupling constant (G=1.5)
- Cap of 1500 particles, 40 macros

### Instruments

- **Radio Lens** (unlocks at potential ≥ 25)
  - Vertical sweep line moving across the viewport
  - Detects bodies, emits pentatonic bell per detection
  - Spike visualization on the line, color-matched to body hue
  - Settings: Sweep Period (3-20s), Sweep Style (Linear/Sine/Ping-pong), Beam Width (3-20px), Sustain, Spike Intensity, Opacity, Volume
- **Thermal Lens** (unlocks at potential ≥ 100)
  - Dim overlay + scanline grain, painted via top-to-bottom scan reveal (2.5s cinematic, plays once per universe)
  - Settings: Dimming, Scanlines, Temperature Scale toggle
- **Visible Lens** (scaffolded, unlocks Era 5)
  - Definition in place; settings array empty pending First Light implementation
- All instruments toggleable from the Instruments panel with themed icons (🔊 speaker for Radio, 👁 eye for Thermal) and diagonal slash when off

### Audio (procedural Web Audio)

- **Particle bells**: soft sine, 80ms attack, ~0.8-2.0s decay, A minor pentatonic across 4 octaves, mass picks pitch on log scale
- **Structure pad**: triangle + sub-octave sine + slow vibrato LFO, 320ms attack, 3.5-6.5s decay (for macros and cradles)
- **Filament drone**: sine fundamental + perfect fifth + vibrato, 1.6s attack, 7.5s decay, fires once per new filament pair
- **Era 3 cue**: stacked A-minor chord across 4 octaves (A1, E2, A2, C4), grand swell, ~13s total presence
- All audio routes through master gain with mute keyboard shortcut (M)
- Throttling prevents overload during busy scans

### UI / HUD

- Left HUD panel: Era + Lens + Potential + Matter + (conditional) Structures + Cradles + Filaments
- Right HUD panel: Discovered Laws (with info icons + tooltips per law)
- Whisper line at upper third of screen (12s base hold, +3.5s when concurrent with era banner)
- Discovery banner at center for era transitions (7s base hold, +3.5s when concurrent with whisper)
- Bottom-left: Temperature Scale legend (toggleable, on by default)
- Bottom-right: Settings button (⚙) above Reset button (↻)
- Hint line at bottom-center, swaps per era
- Floating Settings popup with cursor style selector
- Tap-ripple feedback at every spawn (subtle cyan expanding circle)
- Camera: ambient Lissajous drift + rotation + era-driven zoom pullback (1.0 → 0.40 across eras)

### Whispers

- 9 whispers across the opening sequence and era progression
- Persisted in `seenWhispers` Set, each fires exactly once per universe
- 35-second display cooldown between whispers
- Prerequisite gate: nothing speaks before opening-radio is seen (except the resume whisper)
- Lens-reveal whispers (`opening-radio`, `opening-thermal`) trigger their lens activation 1.4s into the whisper, synchronized with the HUD lens-line fade-in

### Cosmic Web (Era 4+)

- Filaments draw between macros within range
- **Mass-driven temperature**: combined mass → warmth on a log scale → hue (blue ↔ gold) along the same short arc as particle warming
- **Mass-driven range**: light pairs reach 800 world units, heavy pairs reach 2200
- Gentle perpendicular sine wobble for organic motion
- Reveal animation (1.6s alpha ramp + audio swell) per new pair connection
- GC: pairs falling out of range or whose macros merged are removed automatically
- Tier 2 macro-on-macro mutual attraction (era 4 gate) keeps the web from drifting apart

### Settings system

- Per-instrument settings drawers (gear icon, expandable)
- Three control types: slider, select dropdown, iOS-style toggle switch
- Live updates with state persistence
- Restore Defaults button per instrument
- Info icons (with tooltips) next to every setting
- Global settings panel (popup from bottom-right ⚙ button)
- Cursor style selector with 6 options (Crosshair, Default, Reticle, Glow Dot, Plus, Hidden)
- All settings persist in `state.settings` and survive save/load

### Performance

- Pre-rendered hue-bucketed sprites (24 each for particles + macros)
- Render LOD (single-pixel fallback for sub-pixel particles)
- Spatial grid for particle interactions (O(N) average)
- Cosmic web O(N²) over macros is acceptable at N ≤ 40
- Comfortably handles 1500 particles + 40 macros + active radio/thermal lenses

### Save / Load

- localStorage key `cosmogenesis` (version 2)
- Companion key `cosmogenesis_freshUntil` for post-reset fresh window (5 minutes)
- Legacy migration from `voidBloom` keys (one-time on first load)
- Immediate save on era advance, whisper consumption, setting change
- 5-second autosave interval
- `beforeunload` + `visibilitychange` handlers for safety

### Project rename

- Originally **Void Bloom** (during build session)
- Renamed to **Cosmogenesis** at checkpoint, with full migration of localStorage keys, debug handles, console messages, and titles
- Folder name `Source\void-bloom\` left as-is (no impact on functionality)

---

## v0.0.x — Pre-checkpoint development

Not formally versioned. Single continuous build session on May 17, 2026. See [SESSION_LOG.md](SESSION_LOG.md) for the chronological narrative.
