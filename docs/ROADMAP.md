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

## v0.4 candidates (next session)

The natural next moves, in rough order of leverage:

### 1. Body lineage polish

Now that bodies have identity, the catalog could go deeper:

- **Tombstone entries for absorbed tracked bodies**: when a tracked body gets absorbed, don't just vanish from the catalog. Leave a faded "extinct" entry showing its full history up to the moment of absorption, with a clear `Absorbed by {Name}` final event.
- **Lineage view**: clicking a body's "Absorbed {Target}" event in its history could navigate (or hover-preview) the absorbed body's history.
- **Catalog filters / sort**: filter by kind, sort by age / mass / tracked-time. Useful once players have 20+ tracked bodies.
- **Catalog export**: a tiny "copy as JSON" or "copy as text summary" for sharing your cosmic family tree.

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

### 4. Sound on history milestones

When a macro crosses the cradle threshold or gets absorbed, play a brief audio marker. Currently history events fire silently in the simulation; pairing them with a subtle sound would let players *hear* their tracked bodies' significant moments without watching the catalog.

### 5. Cradle visual treatment

Cradles look mostly identical to large Structures (just bigger due to mass-radius scaling). The catalog gives them a gold accent; the canvas doesn't. Differentiate:
- Pulsing extra halo ring
- Slightly different glow profile (more concentric)
- Subtle warm tint baseline regardless of inherited hue
- The body's catalog accent color could project onto its canvas presence

Easy 30-line addition. High visual reward.

---

## v0.5+ candidates

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
