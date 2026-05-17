# Changelog

All notable changes to Cosmogenesis. Versioning follows roughly [Semantic Versioning](https://semver.org/) — major.minor.patch.

---

## v0.2.0 — *2026-05-17 (later same day)* — Bodies have identities

Same Sunday as v0.1. Where v0.1 gave you a cosmos that evolves, v0.2 gives you a cosmos full of named, trackable, observable bodies with life stories. The simulation didn't change much; the *relationship* between player and bodies did.

### Bodies become identities

- **Auto-naming on promotion**: every macro is born with a name like `Structure342` or `Cradle1346`. Suffix is the cosmic year of birth, prefix is the kind at promotion. Two bodies born in the same year would collide; the player can always rename.
- **Auto-rename on threshold crossing**: a Structure that grows past the cradle mass threshold has its auto-name flipped from `Structure{N}` → `Cradle{N}` (same year suffix). Player-renamed bodies are sacred — their custom name stays.
- **Player rename via context menu**: right-click (mouse) or long-press (touch, 550ms) any body to open a context menu with **Rename** and **Track / Untrack**. Rename morphs the menu into a text input. Enter saves, Esc cancels, blur commits.
- **`bornAtS` stable anchor**: each macro records the real second of its promotion. Names + ages compute from this so the conversion factor can change without breaking persistent labels.

### Macro inspector

- Hover (mouse) or tap (touch) on a body in the canvas shows a small read-only panel with the body's name, kind, mass, absorbed-particle count, age (in years), and filament-connection count.
- Panel anchors to the body and follows it as it drifts (translate3d, no layout thrash).
- Gated by the Thermal Lens being active — no inspector on bodies the player can't see.
- Quiet hint line at the bottom of the panel: *"Right-click for options"* / *"Hold for options"* — discoverability without noise.
- Touch tap-to-pin so the panel stays put on mobile. Drag past 10px CSS slop becomes a paint gesture (no spawn lost).

### Catalog panel

- New panel below Discovered Laws in the top-right HUD.
- Auto-hides until the player tracks their first body. After that, every tracked body shows as a row: name + `Cradle · 1,247 mass` subtitle, color-accented by kind (violet for Structure, warm gold for Cradle).
- Sorts cradles first (rarer/more meaningful), then by mass descending. Scrolls if the list grows long.
- Click an entry's title row to pin the inspector to that body in canvas.

### Expandable life-history timeline

Each tracked body carries a **history** of significant events. Click the chevron on a catalog entry to expand:

- **born** / **born-cradle**: the moment a particle promoted into this macro, with mass at promotion.
- **absorbed**: a real macro-on-macro merger. Records the absorbed body's name + mass at the moment of absorption. Each absorbed entry shows a small inline-SVG **tombstone** marker next to the name.
- **cradle**: the physical moment this body crossed the cradle mass threshold. Fires regardless of name (player-renamed bodies still get this milestone).

Events render as:
```
YEAR 2,160
Absorbed Cradle1900 🪨 (+312 mass)
```

Stored as `{atS, kind, mass?, targetName?}`. atS is real seconds; display multiplies by `YEARS_PER_SECOND`. Insertion order is preserved (no sort) so causal same-tick events read correctly. Capped at 50 entries per macro; born + cradle events always retained, oldest absorbs trim first.

### Cosmic time

- Player-facing time is now measured in **cosmic years**, not real seconds. `YEARS_PER_SECOND = 10` (one real second = ten cosmic years).
- **Year counter** added to the HUD top-left above Era. Comma-separated, tabular numerals, full digits forever (`13,460,000` not `13.4M`) — watching the number grow IS the scale.
- Inspector ages display in years (`50 yr`).
- Auto-name suffixes use years (`Cradle13460`).
- Settings sliders that configure real-world instrument behavior (radio sweep period, etc.) stay in seconds. Those tune your equipment, not the cosmos.

### Physics: matter ≠ potential

- **Merge tax** (`MERGE_RETENTION = 0.97`): each binding event releases 3% of combined mass as radiation. Potential (total taps) now visibly diverges from Matter (current mass in sim) as the cosmos bonds.
- **Promotion threshold lowered** from 70 to 25 mass to compensate for the tax. Sequential accretion at 3% tax has a steady-state cap of ~32 mass, comfortably above the new threshold. Cradle threshold stays at 500.
- **Silent accretion**: particles that would promote to macros *inside an existing macro's body* are silently absorbed by that macro (with the same tax). Stops the catalog from filling with phantom Structure events for bodies that lived for one frame inside a Cradle's gravity well.
- Updated Matter info tooltip to explain the binding-energy mechanic: *"Each binding releases a fraction of mass as radiation. Matter therefore lags behind Potential: the cosmos can never quite hold all you have offered it."*

### Tuning (early in v0.2)

- `MACRO_CRADLE_THRESHOLD` 200 → 500 (rarer, more meaningful cradles)
- Filament reach: 800-2200 → 1100-2400 world units (more achievable cosmic web for light pairs)
- `MACRO_MUTUAL_G` 1.5 → 2.2 (stronger Tier 2 pull, distant pairs find each other faster)

### Audio UX

- **Visible mute button** added to the bottom-right above the settings cog. Same speaker SVG + diagonal-strike-on-mute as the radio lens instrument toggle, so master mute and per-instrument mute speak the same visual language.
- M keyboard shortcut still works; pressing M now also syncs the button visual.
- M is ignored when focus is in a text input (e.g. the macro rename field) so typing the letter doesn't mute the universe mid-name.
- The hidden M shortcut was a silent footgun in v0.1 — an accidental keypress muted everything across reloads with no obvious way to find out.

### Visual polish

- **Cosmic favicon**: self-contained SVG igniting cradle (warm core, violet halo, faint stars) on a dark rounded square. No external assets.
- Catalog entries get tinted hover states (violet for Structure, warm gold for Cradle); pinned entries are brighter.
- Cradle inspector panels get a warm gold accent that mirrors the cradle tag in the catalog.
- Tombstone glyph next to absorbed body names is a tiny arched-top headstone in CSS `currentColor` at lower opacity — marker, not icon noise.
- 32×32 chevron tap targets with hover background so the catalog expand button is a real button, not a tiny rune.

### Bug fixes

- **Stale name display bug**: the inspector was hiding `.mi-name` instead of clearing its text. Any later code path that unhid it without rewriting would surface the previous body's name. Renaming one body appeared to rename them all. Fixed by always writing + showing the name (never just hiding) and reading rename-input pre-fill from the menu's stashed opts, not from the inspector DOM.
- **Timeline visibility bug**: `.cat-timeline { display: flex }` was silently overriding the HTML `hidden` attribute. The timeline div was always visible regardless of expanded state, and clicking the chevron had no visible effect. Fixed by basing visibility on the parent `<li>`'s `.is-expanded` class.
- **Catalog `pointer-events` bug**: `#ui` has `pointer-events: none` so the canvas underneath stays interactive. The catalog never opted back in with `pointer-events: auto`. Every catalog click passed straight through to the canvas. Affected both chevron expand AND title-click pin. Fixed.
- **Lossless promotion bug**: silent accretion (above) was a correctness fix for the catalog UX but also tightens the simulation: particles inside a macro's body now contribute their mass with the same merge tax that real merges pay.

### Persistence

- `macro.name`, `macro.tracked`, `macro.bornAtS`, `macro.crossedCradle`, `macro.history` all ride along in serialize.
- `sim.totalElapsedS` is persisted so the year counter resumes correctly.
- Legacy migration on load: any macro without a name gets an auto-name based on `bornAtS` (synthesized from `totalElapsedS - age` if `bornAtS` is missing); any macro without a history gets a single synthetic `born` event; unknown event kinds in history get filtered.

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