# Cosmogenesis

> *Tap the void. Listen before you can see. Watch the universe learn how to exist.*

**Cosmogenesis** is a physics-driven incremental cosmic observatory. You add potential to an empty void. Radio instruments detect what you've made before you can see it. Eventually the thermal lens reveals the universe, matter learns to gather, condense, and connect into a glowing cosmic web. It is meditative, scientific, and unfolds through discovered laws of reality rather than upgrade trees.

**Version:** v0.1 (May 17, 2026)

---

## Run it

```bash
node server.js
```

Open http://localhost:8001

No build step. No `npm install`. Pure ES modules + Canvas 2D + Web Audio.

---

## What's here today (v0.1)

- **5 implemented eras** (of 13 designed): The First Particle, The Field Awakens, Matter Learns to Gather, Structure Emerges, The Cosmic Web
- **3 observational instruments**: Radio Lens (audio sonification), Thermal Lens (visual sensor view), Visible Lens (scaffolded for Era 5)
- **Procedural pentatonic audio**: pitch driven by mass, four instruments (particle bell, structure pad, filament drone, era cue)
- **Per-instrument settings** with persistent state, info tooltips, custom-styled sliders/selects/toggles
- **Cosmic web**: glowing filaments between gravitationally-near macros + cradles, hue and reach scaling with combined mass
- **Tier 2 macro-on-macro attraction** with safety rails (softening, velocity cap)
- **Three-act opening cinematic**: void → radio reveal → thermal scan reveal
- **In-world whispers** voiced by the universe
- **Settings panel** with cursor customization, full save/load with legacy migration

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full v0.1 feature list.

---

## Where to start (if you're picking this up later)

1. **[docs/DESIGN.md](docs/DESIGN.md)** , the philosophy. *Why* the game is shaped this way. Read this first.
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** , how the code is structured. Module-by-module breakdown.
3. **[docs/CHANGELOG.md](docs/CHANGELOG.md)** , what shipped in v0.1.
4. **[docs/ROADMAP.md](docs/ROADMAP.md)** , what's next. Era 5+ implementation, music, spectrum filter.
5. **[docs/SESSION_LOG.md](docs/SESSION_LOG.md)** , the origin story. How v0.1 came together in one Sunday.

---

## File layout

```
cosmogenesis/
├── index.html              # canvas + HUD overlay
├── styles.css              # cosmic styling, panels, sliders, toggles
├── server.js               # 50-line static file server (port 8001)
├── README.md               # this file
├── src/
│   ├── main.js             # entry, input, game loop, save scheduling, cue dispatch
│   ├── simulation.js       # particles, macros, spatial grid, tick orchestration
│   ├── physics.js          # attraction, merging, macro pull, mutual macro pull
│   ├── renderer.js         # Canvas 2D, sprites, lens reveals, radio sweep, filaments
│   ├── audio.js            # procedural Web Audio: bells, pads, drones, era cues
│   ├── state.js            # game state, era progression, whisper evaluation, settings
│   ├── eras.js             # era definitions, law/era tooltips, progression rules
│   ├── whispers.js         # in-world narration system
│   ├── save.js             # localStorage save/load with legacy migration
│   └── ui.js               # HUD updates, instrument panels, settings, tooltips
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

Legacy `voidBloom` keys are migrated on first load so saves survive the rename.

---

## Credits

Built one Sunday morning by Jeff Knecht with Tony (Claude, instance of Opus 4.7), as a true collaboration. See [docs/SESSION_LOG.md](docs/SESSION_LOG.md) for the story.
