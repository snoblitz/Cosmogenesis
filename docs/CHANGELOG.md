# Changelog

All notable changes to Cosmogenesis. Versioning follows roughly [Semantic Versioning](https://semver.org/) — major.minor.patch.

---

## v0.4.0 — *2026-05-18 (Monday)* — Cosmic expansion + catalog command center

From v0.3 to v0.4, Cosmogenesis grew from "a small luminous pocket" to "a sandbox you genuinely inhabit". First Light now triggers an actual **cosmic expansion event** — the world bounds explode ~50×, thousands of cosmic-dust particles seed the outer void, and the camera pulls way back to reveal it. The Catalog became a real command center with subsections, quick actions, and click-to-inspect for deployed emitters. The Visible Lens picked up customization. And the manual zoom-out now has a soft floor so the player never sees the seeded universe's rectangular edge.

### First Light — cosmic expansion event

- **`sim.expandWorld(factor)`**: at ignition, world bounds grow 7× per dimension (~50× area). All existing bodies (particles, macros, emitters) are translated to the new world center, then `sim.worldScale` is multiplied by `factor` and persisted across saves/resizes.
- **`sim.seedCosmicMatter(count, oldRect)`**: 3000 cosmic-dust particles are rejection-sampled into the *new* outer ring (avoiding the old played-in area). Mass 1.0–2.2, hue 180–310 (warmer tail than player spawns), drift speed 0.3–1.8. **Fully interactive** — they participate in gravity, get absorbed, can coalesce into new macros, weave into filaments.
- **Option A economy**: `state.potential` is inflated by the total seeded mass, so the player isn't taxed for matter that just materialized around them.
- **Caps bumped post-First-Light**: `particleCap` 1500 → 8000, `macroCap` 40 → 100. Headroom for cosmic-scale play.
- **`firstLightExpansionDone`** flag (persisted) prevents double-fire on reload.
- **Camera cinematic**: at ignition the camera recenters on the new world center, override clears, smart tracking is suppressed for ~10s while the zoom lerps out to era-5 default (**0.06×**) over ~15s.
- **`cosmos-yours` whisper**: when zoom settles at full pullback, the universe whispers *"Out of many — one — a new center holds the field"* (bypasses cooldown like First Light).
- **Camera tutorial toast**: one-time, device-aware (wheel/keys vs. pinch/drag) hint about the manual camera, anchored to the moment the cosmos-yours whisper fires.

### Era 1–4 camera lock + reveal polish

- Manual camera is **locked** pre-First-Light. `userZoomAt` + `userPanBy` early-return; smart tracking is forced on regardless of user setting. The contemplative early eras stay contemplative; the cosmic reveal at First Light hits harder.
- **Dense color-varied starfield** (220 → 1400 stars, 5 palette buckets, size variance) makes the void around the playable zone read as continuous cosmos even pre-First-Light.
- **MIN_ZOOM** 0.40 → 0.20 (world extents widened correspondingly).
- **Zoom indicator pill** next to the Recenter button shows live zoom (e.g. `0.06×`) so player and dev can talk about the same numbers.

### Zoom-out wall guard

- New runtime `fitMinZoom()` floor in `main.js`: the smallest zoom at which the viewport still fits inside `sim.bounds` × a 6% margin. Applied in both `userZoomAt` (wheel/keyboard/pinch) and `updateSmartTracking` (auto-framing). Player can no longer pull back far enough to see the seeded universe's rectangular edge. Default post-First-Light floor: **~0.030×**.

### Visible Lens

- **Earned at First Light** as a permanent instrument (mutex with Thermal: enabling one auto-disables the other; both stay in the instrument panel forever).
- **`state.visibleLensActive`** is a separate persisted flag — independent of `lensVisuallyActive` (thermal). Fixes the bug where toggling Visible would retire Thermal from the panel.
- **Dual color system**: `visibleHueFor(mass)` blackbody curve drives macro tint when Visible Lens is active (cool blue cradles, warm sun-yellow stars, orange super-massives).
- **Settings drawer** (cog button on the instrument): Exposure (0–1), Star Bloom (0–2), Diffraction Spikes (on/off). Persisted across reloads. Defaults: Exposure 0.3, Bloom 0.4, Spikes ON.

### Deployable Emitters

- New **Tools** panel (era 3+) with a **Deploy Emitter** button (cost: 50 Potential, scales).
- Emitters are world entities: they spray dense `mass: 60` particle packets outward at 0.5 Hz; gravity decides what they ultimately feed.
- Pause / resume / remove from context menu (right-click / long-press).
- Pre-Visible-Lens the emitter glyph reads through the radio/thermal aesthetic; post-First-Light it picks up an amber glow that matches the visible spectrum palette.

### Catalog — command center restructure

- **Two collapsible subsections**: **Tracked** (macros the player pinned) + **Deployed** (emitters the player placed). Each has a header with chevron + label + count badge. Click header to collapse; count badge stays visible. Panel hides entirely when both sections are empty.
- **Per-emitter quick actions** on each Deployed row:
  - **Eye** — toggle render visibility (emitter still emits + earns; just hidden from the canvas)
  - **Power** — pause / resume emission (icon flips on `.is-paused` parent class)
  - **Trash** — two-click confirm (first click swaps to a red "Confirm?" label; second click within 3 s actually removes; auto-reverts after 3 s or on blur)
- **Quick untrack on Tracked rows**: filled gold star button removes the macro from the catalog (macro itself stays in the sim, can be re-tracked via context menu).
- **Click-to-inspect for emitters**: clicking the title area of a Deployed row pins a dedicated **Emitter Inspector** popup with an amber leader-line back to the emitter glyph. Status (Active / Paused / Hidden), Rate (`0.5 / sec`), live Emitted count (new `emitter.emitted` field, serialized). Catalog row gets an amber pinned accent.
- **Dismiss paths for the emitter inspector**: click same row again, tap the canvas, press Escape, delete the emitter, or hit Recenter — all clear the pin. Camera does **not** move when an emitter is pinned (intentionally — Jeff wants details without disturbing the view).

### Refactor

- Extracted **`_positionFloatingInspector` + `_drawFloatingLeader`** in `ui.js` so the macro inspector and emitter inspector share one positioning + leader-line algorithm.
- Runtime instance fields on `sim`: `particleCap`, `macroCap`, `worldScale` (previously module-level consts). Allows post-First-Light cap bumps + world expansion to survive reloads.
- New persisted state: `firstLightExpansionDone`, `cameraTutorialShown`, `visibleLensActive`, `smartTrackingSuppressUntil`, per-emitter `hidden` + `emitted`, `worldScale`.

### Whispers

- **Cut**: `perspective-grows` (redundant with the era 3 banner) + `first-macro` (redundant with the cohesion law).
- **Rewritten**: `first-filament` → *"Distant macros bend toward each other. The cosmic web takes shape."*
- **Added**: `cosmos-yours` at era ≥ 5 + zoom ≤ 0.07 (special-cased to bypass cooldown).
- **First Light** whisper also bypasses cooldown so it lands at the moment, not in the queue.

### Playwright harness (local-only)

Local-only scripts at repo root, gitignored: `playtest_session.py`, `playtest_emitters.py`, `playtest_firstlight.py`, `playtest_verify.py`, `playtest_vlens.py`, `playtest_zoom.py`, `playtest_starfield.py`, `playtest_expansion.py`, `playtest_notes_batch.py`, `playtest_catalog_restructure.py`, `playtest_emitter_focus.py`, `playtest_zoom_wall.py`. Output in `playtest/`.

### Known follow-ups

- **Particle cap eviction subtlety**: `spawnParticleWithVelocity` evicts the oldest low-mass particle when at cap, which means cosmic-seeded dust gets evicted first as the player keeps spawning. Could be a feature (universe consolidates as you act) or a slow erosion of the sandbox. Flagged for design decision.
- **Refactor opportunity**: extract `_createParticle` helper to unify the two parallel particle-creation paths (player spawn vs cosmic seed). Not a bug, future-proofing for more seeding flavors.
- **Emitter economy "currently broken"** per Jeff — deferred design pass.

---

## v0.3.0 — *2026-05-17 (continued — same Sunday, evening)* — First Light + Camera + Touch

From v0.2 to v0.3, Cosmogenesis crossed a line: bodies stopped merely *becoming trackable* and started becoming luminous destinations. The evening pass turned Cradles into Stars, gave the player a real manual camera, and made touch interaction feel deliberate instead of provisional.

### First Light

- **Stars are now a first-class macro kind**: every macro carries persistent `kind` metadata in save data — `structure | cradle | star` — instead of inferring the top tier loosely from mass at render time.
- **Ignition threshold**: `STAR_IGNITION_THRESHOLD = 1500`. The moment a cradle crosses that mass, it permanently becomes a Star.
- **Auto-rename on ignition**: auto-named bodies flip from `Cradle{N}` → `Star{N}` when they ignite. Player-renamed bodies keep their chosen name; ignition changes the kind, not authorship.
- **New history milestone**: `ignited` events record `prevName` plus the body's mass at ignition, so the timeline preserves both the physical crossing and the identity shift.
- **Era progression** now advances to **Era 5** as soon as any macro has `kind === 'star'`.
- **First Light cue**: `_playFirstLightCue()` layers A5 / C6 / E6 triangle bells with **0.4s attack**, **6.4s decay**, and **90ms** stagger; a lowpass opens **900 → 4200Hz** over **1s** while an A3 + E3 sine pad holds underneath for **8s**.
- **Ignition burst**: Stars don't simply switch state — they erupt in a **2.5s** white-gold flash with **3 expanding rings** eased by cubic-out.
- **Visible scan reveal**: `startVisibleScan()` plays a one-time **3.5s** reverse-spectrum sweep, bottom-to-top, as the mirror image of the original thermal reveal — warm edge leading, cooler wake trailing.
- **Persistence mirrors the thermal lens path**: `visibleScanDone` now rides in state and save data alongside `thermalScanDone`, so First Light stays a once-per-universe event.

### Star identity in the UI

- Inspector, catalog, and timeline now speak Star as a distinct category, with warm white-gold accents beyond the cradle palette.
- Timeline copy for ignition reads as a named milestone rather than a raw threshold crossing:
```
YEAR 18,420
Ignited as Star (+1,500 mass)
```
- The Visible Lens instrument now carries a `◉` glyph, matching its role as the era of actual light rather than just inference.
- Renderer adds a steady white-gold aura to each star at `haloR + 2.2×r`, with a restrained twinkle so stars feel alive without turning into UI markers.

### Camera, tracking, and inspector placement

- **Manual camera controls** finally sit on top of the old ambient drift: mouse-wheel zoom centers on the cursor, drag pans the world, keyboard navigation adds arrow-key motion plus zoom keys, and touch gets pinch-to-zoom with two-finger pan.
- **Recenter View** moved to the right rail above **Master Sound**, where it belongs as a camera command instead of floating over the temperature legend.
- **Smart Tracking** is now an optional setting (`smartTracking`) that gently auto-pans and auto-zooms to keep all macros in frame. Fit behavior was retuned to converge faster, then relax into a steadier hold.
- **Inspector placement** is now scored across **8 candidate anchors** — right, left, top, bottom, and 4 diagonals — using penalties for viewport clamping, overlap with live UI rects, and covering the macro itself.
- Tie-break bias deliberately prefers **right > left > vertical > diagonal**, so placement feels stable instead of jitter-random.
- UI avoidance uses fresh `getBoundingClientRect()` reads each reposition, so the inspector respects the real current footprint of HUD, settings, catalog, banners, and context menus.
- **Catalog-pinned leader line**: when the inspector was opened by clicking a catalog row (and only then), an SVG elbow line now points back to the body in-world.
- The leader is gated by `inspectorPinSource` (`'catalog' | 'viewport'`), drawn as a 3-point polyline (macro center → elbow → panel corner), forced to keep a visible bend even in near-vertical alignments, and tinted to the panel border's lavender `rgba(184,164,255,0.78)` with a faint glow.

### Macro rendering and accretion readability

- Each gravity well now carries a depleted-but-not-empty atmospheric falloff, so macros still feel like they have an envelope after heavy feeding.
- Filaments render as a two-pass **glow + core** stroke instead of a single thin line, making the web readable against both dark background and warmer macro neighborhoods.
- Accretion visuals were rebuilt: the old thin feeding lines are gone, replaced by dust-grain funnels with a soft underlay.
- Infall dust is now rendered as a swirling cloud around the body rather than per-arm linework, which reads better at motion and at small size.
- Dust color is a dedicated dusty amber, not a lazy reuse of the body's own hue.
- To prevent camouflage, dust hue is guaranteed to sit **150° away** from the macro's hue on the wheel.

### Touch interaction grows up

- **Long-press affordance** was iterated into a subtle progress ring at the touch point during the **550ms** hold. The earlier arc-style indicator is gone.
- A visible touch pointer now anchors the context menu off to the side instead of letting the menu jump wildly between consecutive opens.
- **Touch Offset** was added as a setting so spawned matter can appear clear of the fingertip on occluding devices.
- Windows touchscreens now use contact size to detect actual finger contact more reliably.
- Fixed a side-selection flash where the menu could briefly open on the wrong side before correcting.
- Fixed menu drift after finger-lift, and the touch path now correctly respects `[hidden]` rows in the action list.
- Fixed synthetic `contextmenu` on finger-lift from re-anchoring a menu that was already placed.
- Fixed toggle-row hit behavior so the switch itself owns the toggle; the info icon no longer steals the click.

### Reliability polish

- Installed iOS PWAs now get a firmer nudge to pick up fresh builds, using cache-busting plus service-worker-style reload pressure so updates land more reliably outside Safari.

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