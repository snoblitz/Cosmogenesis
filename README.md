# Cosmogenesis

> *Tap the void. Listen before you can see. Watch the universe learn how to exist. Name what coalesces.*

**Cosmogenesis** is a physics-driven incremental cosmic observatory. You add potential to an empty void. Radio instruments detect what you've made before you can see it. Eventually the thermal lens reveals the universe, First Light paints it into the visible spectrum, and matter learns to gather, condense, and connect into a glowing cosmic web. Bodies that emerge have names, can be tracked, and carry life histories you can read. It is meditative, scientific, and unfolds through discovered laws of reality rather than upgrade trees.

**Version:** v0.5 (May 18, 2026)

**Play it:** https://snoblitz.github.io/Cosmogenesis/

---

## Run it locally

```bash
node server.js
```

Open http://localhost:8001

No build step. No `npm install`. Pure ES modules + Canvas 2D + Web Audio.

The repo is also a fully static site — any plain HTTP file server works. GitHub Pages serves it directly from `main` (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

---

## What's here today (v0.5)

### From v0.1
- **5 implemented eras** (of 13 designed): The First Particle, The Field Awakens, Matter Learns to Gather, Structure Emerges, The Cosmic Web
- **3 observational instruments**: Radio Lens (audio sonification), Thermal Lens (visual sensor view), Visible Lens (active from Era 5)
- **Procedural pentatonic audio**: pitch driven by mass, four instruments (particle bell, structure pad, filament drone, era cue)
- **Cosmic web** with mass-driven filament temperature + range; Tier 2 macro-on-macro attraction
- **Three-act opening cinematic**: void → radio reveal → thermal scan reveal
- **In-world whispers**, per-instrument settings, save/load with legacy migration

### From v0.2
- **Bodies have identities**: every macro is auto-named on promotion (`Structure342`, `Cradle13460`), where the suffix is the cosmic year of birth. Names follow the body across merges and threshold crossings.
- **Macro inspector**: hover (mouse) or tap (touch) any body to see its name, kind, mass, absorbed-particle count, age in years, and filament connections.
- **Context menu**: right-click (mouse) or long-press (touch) any body to rename it or add it to your Catalog.
- **Catalog panel**: a new HUD card under Discovered Laws that lists every tracked body. Click an entry to pin the inspector to it.
- **Expandable life-history**: each tracked body carries a timeline of its significant events (born, absorbed others, crossed cradle threshold). A small tombstone glyph marks the bodies that died.
- **Cosmic time**: real seconds are now displayed as **years** at a 10× scale. A live Year counter sits above Era in the top-left HUD.
- **Binding-energy mechanic**: every merge releases a small fraction of mass as radiation. Potential (your taps) and Matter (what the cosmos holds) now diverge meaningfully.
- **Visible mute button** in the bottom-right.
- **Cosmic favicon**: self-contained SVG igniting cradle on a dark backdrop.

### From v0.3
- **Era 5 — First Light**: cradles ignite into stars at mass **1500** with an audio cue, white-gold aura, ignition burst (3 rings + flash), and a reverse-spectrum bottom-to-top sweep that paints the visible spectrum in.
- **Star naming + memory**: `Cradle{N}` becomes `Star{N}` on ignition, and history now records a new `ignited` event.
- **Manual camera controls**: mouse-wheel zoom, drag pan, pinch zoom, two-finger pan, and keyboard navigation.
- **Smart Tracking**: optional auto-pan + auto-zoom keeps all macros in view, with a recenter button on the right rail.
- **Inspector leader line**: catalog-pinned popups throw a thin elbow back to the selected body, with smart placement that avoids HUD panels.
- **Macro atmosphere + accretion dust**, clearer cosmic structure (filaments + two-pass core stroke), touch + PWA polish.

### New in v0.4
- **Cosmic expansion at First Light**: the world physically grows **7× per dimension** at ignition, **3000 cosmic-dust particles** seed the new outer ring (fully interactive — they get pulled, absorbed, can coalesce), particle/macro caps bump, camera cinematic pulls back to **0.06×** to reveal the new scale. A `cosmos-yours` whisper lands at full pullback: *"Out of many — one — a new center holds the field."*
- **Era 1–4 camera lock**: manual camera disabled pre-First-Light so the contemplative early eras stay contemplative and the cosmic reveal hits harder.
- **Zoom-out wall guard**: `fitMinZoom()` floor stops the player from ever pulling back far enough to see the seeded universe's rectangular edge.
- **Visible Lens — permanent + customizable**: earns at First Light alongside Thermal (mutex), persists forever, has a settings drawer for Exposure / Star Bloom / Diffraction Spikes, drives a dual-color blackbody curve for macro tint.
- **Deployable Emitters** (Tools panel, era 3+): standalone world entities that emit dense particle packets at 0.5 Hz. Pause / resume / remove from the context menu OR the new catalog row quick actions.
- **Catalog as command center**: two collapsible subsections — **Tracked** + **Deployed** — each with header + chevron + count badge.
  - Tracked rows get a gold **star** to quick-untrack.
  - Deployed rows get an **eye** (visibility toggle, emitter keeps emitting), a **power** button (pause/resume), and a **trash** button (two-click confirm).
  - Click an emitter row title to pin an amber **Emitter Inspector** popup with leader line. Dismiss with another click, a canvas tap, Escape, delete, or recenter.
- **Dense color-varied starfield** (220 → 1400 stars) + **zoom indicator pill** + camera tutorial toast (device-aware) at the cosmic reveal moment.

### New in v0.5
- **The Inducer** — the cursor tool is now a named multi-mode instrument with four modes, each with a distinct physical signature and a distinct on-screen cursor glyph:
  - **Field** (era 0, default, mass 1) — the original tap / hold trickle. Cursor: small soft hum dot.
  - **Resonance Lens** (era 2, 120 P, mass 3) — drag-paint spray. Cursor: double pulsing violet ring.
  - **Compression Lens** (era 4, 800 P, up to mass 25) — hold to charge, release to fire. Sub-20% charge fizzles. Cursor: charge ring grows blue → white-hot, with a fizzle-threshold tick + full-charge halo bloom, and a screen-space flash on release.
  - **Accretion Stream** (era 5, 4500 P, mass 2 feeders) — beam mass-2 feeders directly into the nearest macro. No Potential earned (it's the only mode that pure-sinks Potential into mass). Cursor: orange crosshair + animated dashed tether to the targeted macro + reticle on target.
- **Instruments panel restructured** into three collapsible subsections — **Sensors** (lenses) / **Upgrades** (Inducer modes) / **Tools** (Deploy Emitter) — mirroring the Catalog's Tracked/Deployed pattern.
- **Emitter rebalance** — emitters are now one-shot capital investments, not passive income:
  - Base cost **50 → 250 P**, rate **0.5 → 0.2 Hz**, era gate **3 → 4**.
  - **10 s calibration window** before the emitter fires; deployed-list row shows a live `Calibrating Ns` badge, urgent red in the final 3 s.
  - **10% catastrophic dud rate** — rolled at deploy time, revealed at calibration end.
  - **Consumed on star ignition** — every emitter within 400 px world units of an igniting cradle is removed. Dropping an emitter near a feeding cradle is a sacrifice that converts into a star.
- **Potential income overhaul** — the +1-per-emission trickle is gone. Potential now grows from physical milestones plus per-second stellar luminosity:
  - **`onMacroBirth` +5**, **`onCradleCross` +10**, **`onStarIgnite` +100**.
  - **Per-second stellar income**: every active star contributes `3 × log10(mass)` P per second. Log-scaled so a single giant doesn't dominate; many medium stars pay almost as much as one huge one.
- **Era threshold rebalance** so each tool gets a full era to breathe before the next one unlocks: era 1 needs 80 spawns (was 40); era 2 needs 280 particles (was 140); era 3 needs a macro **and** 500 total spawned; era 4 needs 3 macros **and** max-macro-mass ≥ 200.
- **Onboarding whispers** fire once on first unlock of each Inducer mode (`inducer-resonance`, `inducer-compression`, `inducer-accretion`) with plain-language guidance on how to use each mode.

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full version-by-version feature list.

---

## Where to start (if you're picking this up later)

1. **[docs/DESIGN.md](docs/DESIGN.md)** — the philosophy. *Why* the game is shaped this way. Read this first.
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the code is structured. Module-by-module breakdown.
3. **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — what shipped in v0.1 through v0.5.
4. **[docs/ROADMAP.md](docs/ROADMAP.md)** — what's next. v0.6 candidates: Inducer economy visual/audio polish, full era 1→5 pacing playtest, particle eviction policy, spectrum filter, body-lineage polish.
5. **[docs/SESSION_LOG.md](docs/SESSION_LOG.md)** — the origin story. How v0.1, v0.2, and onward came together.

---

## File layout

```
cosmogenesis/
├── index.html              # canvas + HUD overlay (incl. catalog, inspector, context menu)
├── styles.css              # cosmic styling, panels, sliders, toggles
├── server.js               # 50-line static file server (port 8001)
├── favicon.svg             # inline-SVG cosmic favicon
├── README.md               # this file
├── src/
│   ├── main.js             # entry, input, game loop, save scheduling, cue dispatch
│   ├── simulation.js       # particles, macros, spatial grid, tick orchestration, history
│   ├── physics.js          # attraction, merging (with binding-energy tax), macro pull
│   ├── renderer.js         # Canvas 2D, sprites, lens reveals, radio sweep, filaments
│   ├── audio.js            # procedural Web Audio: bells, pads, drones, era cues
│   ├── state.js            # game state, era progression, whisper evaluation, settings, cosmic year
│   ├── eras.js             # era definitions, law/era tooltips, progression rules
│   ├── whispers.js         # in-world narration system
│   ├── save.js             # localStorage save/load with legacy migration
│   └── ui.js               # HUD, inspector, catalog, context menu, history timeline
└── docs/
    ├── ARCHITECTURE.md
    ├── DESIGN.md
    ├── CHANGELOG.md
    ├── ROADMAP.md
    └── SESSION_LOG.md
```

---

## Save data

Stored in `localStorage` under the key `cosmogenesis`. Click the ↻ button (bottom-right) to begin a new universe. After a reset, the next **5 minutes** of play won't auto-resume on refresh, so you can iterate freely.

Legacy `voidBloom` keys are migrated on first load so saves survive the rename. v0.2 also backfills macro names + history for any v0.1 save on load — your existing bodies get cosmic names assigned from their `bornAtS` and a synthetic born event added to their timeline.

---

## Controls

- **Tap / click** empty space — add potential to the void (spawn a particle)
- **Hold** — continuous spawn (ramps up over ~1.2s)
- **Hover** (mouse) or **tap** (touch) a body — show inspector
- **Right-click** (mouse) or **long-press 550ms** (touch) a body — rename / track
- **Click ⚙** — global settings popup
- **Click 🔊** — toggle audio mute (also: **M** key)
- **Click ↻** — reset (click twice within 3 seconds to confirm)

---

## Credits

Built one Sunday morning by Jeff Knecht with Tony (Claude, instance of Opus 4.7), as a true collaboration. See [docs/SESSION_LOG.md](docs/SESSION_LOG.md) for the story.
