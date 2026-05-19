# Roadmap

Where Cosmogenesis is going. Ordered roughly by what should come next.

This is a living doc — adjust as priorities shift. Anchor every item to a principle from [DESIGN.md](DESIGN.md): is it physically motivated? Does it trust the player? Does it feel like an instrument or an instrument-adjacent observation tool?

---

## ✅ v0.2 — Shipped 2026-05-17

The "bodies have identities" arc. See [CHANGELOG.md](CHANGELOG.md) for the full feature list.

- Auto-naming (`Structure342`, `Cradle13460`) with stable `bornAtS` anchor
- Macro inspector (hover/tap) with live Mass / Absorbed / Age / Filaments
- Context menu (right-click / long-press) for rename + track
- Catalog panel listing tracked bodies, click to pin
- Expandable life-history timeline per tracked body with tombstone markers
- Cosmic time (`YEARS_PER_SECOND = 10`) + live Year counter in HUD
- Binding-energy merge tax (visible Potential/Matter divergence)
- Visible mute button (no more silent M-key footgun)
- Cosmic SVG favicon

---

## ✅ v0.3 — Shipped 2026-05-17

The "First Light + camera + touch" arc. Where v0.2 made bodies feel knowable, v0.3 made the universe easier to see, follow, and physically inhabit. See [CHANGELOG.md](CHANGELOG.md) for the full feature list.

- **Era 5 — First Light**: ignition, audio cue, white-gold aura + ignition burst, reverse-spectrum sweep, `ignited` history event, kind field, auto-rename `Cradle{N}` → `Star{N}`
- **Manual camera controls**: wheel, drag, pinch, keyboard — plus **Smart Tracking** auto-fit
- **Inspector leader line**: catalog-only elbow line + smart placement candidate scoring
- **Macro atmosphere / accretion dust / filament glow**: broader macro presence and better large-scale readability
- **Touch UX polish**: progress-ring long-press, menu placement fixes
- **iOS PWA reload help**

---

## ✅ v0.4 — Shipped 2026-05-18

The "cosmic expansion + catalog command center" arc. First Light became an actual world-scale event, the Catalog grew real management surfaces, the Visible Lens got customization, and the manual zoom got an immersion guard. See [CHANGELOG.md](CHANGELOG.md) for the full feature list.

- **Cosmic expansion at First Light**: world bounds × 7 per dim, 3000 outer-ring cosmic-dust particles seeded, caps bumped (particles 1500→8000, macros 40→100), camera cinematic to era-5 default 0.06×
- **`cosmos-yours` whisper** at full pullback + one-time camera tutorial toast (device-aware)
- **Era 1–4 camera lock**: manual zoom/pan disabled, smart tracking forced on — saves the cosmic reveal for First Light
- **Dense starfield** (220→1400 stars, color buckets, size variance) + **MIN_ZOOM** widened 0.40→0.20
- **Zoom indicator pill** next to Recenter
- **Zoom-out wall guard** (`fitMinZoom()`): player can no longer pull back past the seeded universe's edge
- **Visible Lens**: permanent instrument (mutex with Thermal), dual-color `visibleHueFor(mass)` blackbody curve, settings drawer (Exposure / Star Bloom / Diffraction Spikes)
- **Deployable Emitters** (Tools panel, era 3+): standalone world entities, dense packet emission, pause/resume/remove
- **Catalog command center**: Tracked + Deployed collapsible subsections with count badges; per-emitter eye/power/trash quick actions; gold star to untrack macros; click an emitter row for an amber **Emitter Inspector** popup with leader line; dismiss on tap/Escape/delete
- **Whispers**: cut `perspective-grows` + `first-macro`, rewrote `first-filament`, added `cosmos-yours`, First Light bypasses cooldown
- **Refactor**: `_positionFloatingInspector` + `_drawFloatingLeader` shared by both inspectors; runtime instance fields for `particleCap` / `macroCap` / `worldScale`

---

## ✅ v0.5 — Shipped 2026-05-18

The "Inducer modes + economy rebalance" arc. The cursor tool became the **Inducer**, a multi-mode instrument with three additional modes that unlock as the universe grows. Potential is now the only currency that matters in the early game, and it grows from physical milestones + stellar luminosity instead of a per-emission trickle. Emitters became one-shot capital investments — slow, fallible, consumed on star ignition. Era thresholds were raised so each tool gets a full era to breathe before the next one arrives. See [CHANGELOG.md](CHANGELOG.md) for the full feature list.

- **Inducer modes** (cursor as multi-mode instrument): **Field** (default), **Resonance Lens** (era 2, 120 P, drag-paint), **Compression Lens** (era 4, 800 P, hold-to-charge), **Accretion Stream** (era 5, 4500 P, beam feeders into nearest macro)
- **Per-mode cursor visuals** drawn in screen space: hum dot / double ring / charge ring (blue → white-hot + fizzle-threshold tick + full-charge halo bloom) / crosshair-and-tether-to-target
- **Instruments panel restructured** into three subsections (Sensors / Upgrades / Tools), mirroring the Catalog's pattern
- **Emitter rebalance**: 50 → 250 P base cost, 0.5 → 0.2 Hz, **10 s calibration window**, **10% catastrophic dud rate**, **consumed on star ignition**
- **Calibration UI**: live `Calibrating Ns` badge on each deployed emitter row, urgent red in final 3 s
- **Potential income overhaul**: `onMacroBirth +5`, `onCradleCross +10`, `onStarIgnite +100`, **per-second stellar luminosity income** (`factor * log10(mass)` per active star, log-scaled)
- **Era threshold rebalance**: 0→1 (40 → 80 spawns), 1→2 (140 → 280 particles), 2→3 (1 macro AND 500 spawned), 3→4 (3 macros AND max mass ≥ 200)
- **Tool gates pushed**: Resonance era 1→2, Compression era 3→4, Accretion era 4→5, Emitters era 3→4
- **Onboarding whispers**: `inducer-resonance` / `inducer-compression` / `inducer-accretion` fire once on first unlock with plain-language guidance
- **Save migration**: legacy saves without `unlockedInducerModes` infer the set from `eraIndex`; legacy emitters without calibration fields are marked `stable: true`

---

## v0.6 candidates (next session)

The natural next moves, in rough order of leverage:

### 1. Visual + audio polish on the Inducer economy

The v0.5 economy works numerically but a few feedback loops are still silent or invisible:
- Brief inward streak from each consumed emitter to the igniting cradle (close the "sacrifice converts into a star" loop visually)
- Whisper or audio cue on emitter dud reveal (currently silent removal)
- Per-second stellar income readout in the HUD so players connect star count to growth rate
- Integer rounding for `state.potential` display (it accrues per-frame and is now non-integer under the hood)

### 2. Full era 1 → 5 pacing playtest

The v0.5 rebalance landed but real-session feedback is still pending. A scripted Playwright session that drives a fresh universe through era 5 + verifies pacing feels right + measures time-in-each-era would catch any remaining trouble spots.

### 3. Particle cap eviction policy

`spawnParticleWithVelocity` currently evicts the oldest low-mass particle when at cap. Post-First-Light this preferentially evicts cosmic-seeded dust, slowly eroding the sandbox. Either:
- **Keep as-is** and call it canon (universe consolidates as you act), OR
- Tag cosmic-seeded particles with a `cosmic: true` flag and prefer evicting player-spawned particles first, OR
- Mass-weighted eviction (lighter particles always go first regardless of age).

### 4. Spectrum filter (Phase B)

When Visible Lens is unlocked, give the player a **lens spectrum selector**: Radio / Infrared / Visible / UV / X-ray. Each shows the same simulation through a different visual treatment.

- Radio: signal-dominant view (existing radio sweep)
- IR: heat-map (warm bodies bright, cold bodies dim)
- Visible: standard rendering
- UV: only hot dense things visible, blue-shifted
- X-ray: only star cores + macro collisions blaze through

This makes the player *the astronomer*. Choose your wavelength.

### 5. Body lineage polish (carried from v0.4 backlog)

- **Lineage view**: clicking a body's "Absorbed {Target}" event in its history could navigate (or hover-preview) the absorbed body's history.
- **Catalog filters / sort**: filter by kind, sort by age / mass / tracked-time. Useful once players have 20+ tracked bodies.
- **Catalog export**: a tiny "copy as JSON" or "copy as text summary" for sharing your cosmic family tree.

### 6. Ambient music layer

Soft procedural pad underneath the bells, also in A minor pentatonic so it harmonizes with detection sounds. Slow chord progression: i - VI - III - VII (Am - F - C - G) on a 30-second loop, very low volume by default.

Pure synthesis — no audio files. Same Web Audio API. Add to `audio.js` as `playAmbientLayer()` with volume control in global settings.

### 7. Sound on history milestones

When a macro crosses the cradle threshold or gets absorbed, play a brief audio marker. Currently history events fire silently in the simulation; pairing them with a subtle sound would let players *hear* their tracked bodies' significant moments without watching the catalog.

### 8. Refactor: `_createParticle` helper

Unify the two parallel particle-creation paths (`spawnParticleWithVelocity` + the direct-push in `seedCosmicMatter`) behind one helper. Not a bug — future-proofs new seeding flavors (supernovae remnants, future-era dust events).

---

## v0.6+ candidates

### Era 6, 7, 8...

Continue the cosmological arc:
- **Era 6 — Age of Stars**: stable stellar systems, radiation pressure balancing gravity
- **Era 7 — Cycle of Creation**: supernovae (a star dies dramatically, scatters seeds back into the field as a burst of high-mass cold particles). Adds an `exploded` event to the body's timeline before extinction.
- **Era 8 — Galaxies Take Shape**: bound clusters of stars with shared rotation, drawn as soft spiral arms
- **Era 9 — Dark Architecture**: invisible scaffolding becomes apparent (galaxies behave differently than visible mass would predict)
- **Era 10 — Conscious Observation**: the cursor becomes part of the physics (hover affects particles subtly)
- **Era 11 — The Remembering Universe**: faint after-images of past supernovae or merged macros persist
- **Era 12 — Recursion**: zoom into a star and discover a smaller universe inside, OR collapse-and-restart with something carried forward

Each era should follow the same pattern: physical trigger, visual transformation, audio cue, narrative whisper, no time gates.

### Tier 3 cosmic web (radiation pressure + bound clusters)

If Tier 2 macro-mutual works well, the next layer is bound systems:
- Three connected macros form a triangle, the triangle has shared rotation and angular momentum
- Cradles attract more weakly at long range but more strongly at intermediate range (analog to galaxy clusters)
- Filaments physically constrain particle flow (particles can be "caught" in a filament and flow along it)

### Additional global settings

- Reduce Motion toggle (disables camera drift + ambient animation)
- Audio output mode (mono/stereo, voice limit)
- Performance presets (low/medium/high — adjusts MAX_PARTICLES + MAX_MACROS + sprite resolution)
- Theme color picker (panel accent hue)
- Keyboard shortcuts overlay
- `YEARS_PER_SECOND` slider so players can choose their time-scale (10×, 100×, 1000×)

### Mobile / touch polish

- Bottom-right buttons may overlap with browser UI on mobile
- Settings panels need scroll or pagination on small screens
- Test the 550ms long-press timing on more devices; some users may want it shorter

### Save sharing / universe export

- Generate a shareable seed string from current state
- Import a seed to load that universe
- "Universe snapshot" — captures current state as a screenshot + audio sample + state JSON
- Tracked-bodies markdown export for sharing your cosmic dynasty

---

## Long shots

- **WebGL renderer** for 10,000+ particle support if needed (probably overkill, current Canvas 2D handles 1500 fine)
- **Cosmic background radiation** — faint always-on hum that gets quieter as the universe ages
- **Live universe ticker** — opt-in JSON-export of your universe's state for tracking long-form play
- **Procedural era names per universe** — could each universe have its own slightly different era nomenclature drawn from a pool?
- **Multi-universe view** — see multiple saved universes side by side, like cosmological microscope slides
- **First-person fly-through** — at high era, lock the camera to fly through the cosmic web as a 3D-ish camera (would require WebGL + significant rework)

---

## What we're NOT planning

For clarity, things that came up in discussion and were intentionally set aside:

- **Failure states** — Cosmogenesis doesn't have "Game Over"
- **Monetization** — not a product, a meditation
- **Tutorial mode** — show, don't tell remains canon
- **Achievements / badges** — the era progression IS the achievement system
- **Player accounts / cloud save** — localStorage is enough
- **Multiplayer** — single observer per universe is the design
- **External assets** — vanilla forever

---

## When picking up after a break

1. Read [DESIGN.md](DESIGN.md) again to re-anchor on principles
2. Skim [CHANGELOG.md](CHANGELOG.md) to remember what shipped (v0.1, v0.2, v0.3)
3. Skim [ARCHITECTURE.md](ARCHITECTURE.md) to refresh the code layout
4. Pick one v0.4 candidate from above
5. Before implementing: sketch the design pitch against the four DESIGN.md questions:
   - Is this physically motivated?
   - Does this trust the player?
   - Does this feel like an instrument?
   - Is this beautiful?
6. If all four are "yes", build it.
