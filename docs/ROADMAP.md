# Roadmap

Where Cosmogenesis is going. Ordered roughly by what should come next.

This is a living doc — adjust as priorities shift. Anchor every item to a principle from [DESIGN.md](DESIGN.md): is it physically motivated? Does it trust the player? Does it feel like an instrument or an instrument-adjacent observation tool?

---

## v0.2 candidates (next session)

The natural next moves, in rough order of leverage:

### 1. Era 5 — First Light 🔥

The biggest single-feature jump available. The narrative payoff for everything pre-Era-5 is gated on this.

**What it would entail:**
- Trigger: a cradle (mass ≥ some second threshold, maybe 500) crosses ignition. Becomes a **Star**.
- Visual: the cradle suddenly *emits* light. Concentric expanding luminance rings, dramatic hue shift to bright white/gold, soft halo extending beyond its physical radius.
- Audio: a grand era cue with overtones. Brighter, more transcendent than Era 3 cue.
- **Renderer transition**: thermal overlay smoothly fades out (already wired) as the universe becomes truly visible. The bottom-left LENS label updates from "Thermal" to "Visible · Thermal" or just "Visible".
- **Visible Lens unlock**: appears in Instruments panel with eye icon (or maybe a new icon).
- New whisper: *"Light. As we know it."* or similar.
- Reverse-scan animation: a soft bottom-to-top sweep paints the visible spectrum in (mirror of the original thermal reveal).

**Mechanical implications:**
- "Star" as a new entity category? Or just cradle.kind = 'star'? Probably the latter — minimal new types, just classification by mass band.
- Stars exert *radiant pressure* (push particles slightly outward at close range)? Optional Tier 3.

### 2. Spectrum filter (Phase B)

When Visible Lens is unlocked, give the player a **lens spectrum selector**: Radio / Infrared / Visible / UV / X-ray. Each shows the same simulation through a different visual treatment.

- Radio: signal-dominant view (existing radio sweep)
- IR: heat-map (warm bodies bright, cold bodies dim)
- Visible: standard rendering
- UV: only hot dense things visible, blue-shifted
- X-ray: only star cores + macro collisions blaze through

This makes the player *the astronomer*. Choose your wavelength.

### 3. Ambient music layer

Soft procedural pad underneath the bells, also in A minor pentatonic so it harmonizes with detection sounds. Slow chord progression: i - VI - III - VII (Am - F - C - G) on a 30-second loop, very low volume by default.

Pure synthesis — no audio files. Same Web Audio API. Add to `audio.js` as `playAmbientLayer()` with volume control in global settings.

### 4. Sound when cradle promotes

When a macro crosses the cradle threshold (200), play a special "gestation" sound — soft warm swell, indicating "this one has crossed a meaningful line."

### 5. Cradle visual treatment

Currently cradles look identical to macros (just bigger due to mass-radius scaling). Could differentiate:
- Pulsing extra halo ring
- Slightly different glow profile (more concentric)
- Subtle warm tint baseline regardless of inherited hue

Easy 30-line addition. High visual reward.

---

## v0.3+ candidates

### Era 6, 7, 8...

Continue the cosmological arc:
- **Era 6 — Age of Stars**: stable stellar systems, radiation pressure balancing gravity
- **Era 7 — Cycle of Creation**: supernovae (a star dies dramatically, scatters seeds back into the field as a burst of high-mass cold particles)
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

### Mobile / touch polish

- Larger touch targets for the gear/info icons
- Touch-and-hold timing tuning (currently optimized for mouse)
- Bottom-right buttons may overlap with browser UI on mobile
- Settings panels need scroll or pagination on small screens

### Save sharing / universe export

- Generate a shareable seed string from current state
- Import a seed to load that universe
- "Universe snapshot" — captures current state as a screenshot + audio sample + state JSON

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
2. Skim [CHANGELOG.md](CHANGELOG.md) to remember what shipped
3. Skim [ARCHITECTURE.md](ARCHITECTURE.md) to refresh the code layout
4. Pick one v0.2 candidate from above
5. Before implementing: sketch the design pitch against the four DESIGN.md questions:
   - Is this physically motivated?
   - Does this trust the player?
   - Does this feel like an instrument?
   - Is this beautiful?
6. If all four are "yes", build it.
