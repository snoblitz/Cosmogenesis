# Cosmogenesis

> *Tap the void. Listen before you can see. Watch the universe learn how to exist. Name what coalesces.*

**Cosmogenesis** is a physics-driven incremental cosmic observatory. You add potential to an empty void. Radio instruments detect what you've made before you can see it. Eventually the thermal lens reveals the universe, First Light paints it into the visible spectrum, and matter learns to gather, condense, and connect into a glowing cosmic web. Bodies that emerge have names, can be tracked, and carry life histories you can read. It is meditative, scientific, and unfolds through discovered laws of reality rather than upgrade trees.

**Version:** v0.3 (May 17, 2026)

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

## What's here today (v0.3)

### From v0.1
- **5 implemented eras** (of 13 designed): The First Particle, The Field Awakens, Matter Learns to Gather, Structure Emerges, The Cosmic Web
- **3 observational instruments**: Radio Lens (audio sonification), Thermal Lens (visual sensor view), Visible Lens (now active in Era 5)
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
- **Visible mute button** in the bottom-right with the same speaker-with-strike iconography as the radio lens (the M key was hidden and easily mis-pressed).
- **Cosmic favicon**: self-contained SVG igniting cradle on a dark backdrop.

### New in v0.3
- **Era 5 — First Light**: cradles ignite into stars at mass **1500** with an audio cue, white-gold aura, ignition burst (3 rings + flash), and a reverse-spectrum bottom-to-top sweep that paints the visible spectrum in.
- **Star naming + memory**: `Cradle{N}` becomes `Star{N}` on ignition, and history now records a new `ignited` event.
- **Manual camera controls**: mouse-wheel zoom, drag pan, pinch zoom, two-finger pan, and keyboard navigation.
- **Smart Tracking**: optional auto-pan + auto-zoom keeps all macros in view, with a recenter button on the right rail.
- **Inspector leader line**: catalog-pinned popups throw a thin elbow back to the selected body, with smart placement that avoids HUD panels; viewport taps stay clean.
- **Macro atmosphere + accretion dust**: each well now shows a depleted-but-not-empty falloff and a dusty amber infall cloud whose hue is forced to contrast with the body.
- **Clearer cosmic structure**: filament glow and a core two-pass stroke make dense scenes read cleanly.
- **Touch + PWA polish**: progress-ring long-press feedback, a side-anchored menu, finger-lift / menu-placement fixes, and more reliable iOS PWA reloads.

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full version-by-version feature list.

---

## Where to start (if you're picking this up later)

1. **[docs/DESIGN.md](docs/DESIGN.md)** — the philosophy. *Why* the game is shaped this way. Read this first.
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the code is structured. Module-by-module breakdown.
3. **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — what shipped in v0.1 and v0.2.
4. **[docs/ROADMAP.md](docs/ROADMAP.md)** — what's next. Era 5+ implementation, music, spectrum filter, body-lineage polish.
5. **[docs/SESSION_LOG.md](docs/SESSION_LOG.md)** — the origin story. How v0.1 and v0.2 came together in one Sunday.

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
