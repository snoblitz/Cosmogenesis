# Design

The philosophy of Cosmogenesis. *Why* the game is shaped this way.

When picking up this project after time away, read this **first**. The architecture follows from these principles. If a future change feels wrong but you can't articulate why, it probably violates one of these.

---

## The single most important principle

> **The universe progresses as physics dictates, not as a timer says it's allowed.**

Every gate that controls when something becomes available reads from physical state of the simulation. Never wall-clock time. Era 1 unlocks when 40 particles have been spawned, not when 30 seconds have passed. Era 4 unlocks when 2 macros exist, not when the player has played for 5 minutes.

Two exceptions, both deliberate:
- **Whisper display cooldown** (35s minimum gap between whispers) , this is a *display ergonomics* concern, not world progression. About human reading capacity.
- **Inactivity whisper** , responds to *player behavior*, not the world's state.

Everything else is physics. If you find yourself adding `if (timeSince > X)` to gate a world feature, stop and find the physical signal instead.

---

## Cosmologically honest

Each era reflects a real (or thematically-real) cosmological phenomenon. The progression mirrors the actual history of the universe:

- **Era 0:** Pre-physics. Just raw potential.
- **Era 1:** Gravity emerges. The first force.
- **Era 2:** Matter cohesion. Atoms forming.
- **Era 3:** First massive bodies. Proto-stellar densities.
- **Era 4:** Cosmic web. Filaments between dense regions , this is how the actual universe is structured at large scale.
- **Future:** First Light (stellar ignition), Age of Stars, Cycle of Creation (supernovae), Galaxies, Dark Architecture, Conscious Observation, The Remembering Universe, Recursion.

When in doubt, **what would real cosmology say happens at this moment?** Then translate to a game-feel approximation. The phrase **"beautiful lies"** captures this: simulate aggressively-simplified physics that *feels* right, not literally accurate physics.

---

## Instruments, not upgrades

The game does not have "+10% attraction strength" upgrades. The player does not buy power. The player *earns observational instruments* through progression:

- **Radio Lens** at potential 25 , the first way to perceive the void
- **Thermal Lens** at potential 100 , see the universe via heat radiation
- **Visible Lens** at Era 5 , actual visible light, once stars ignite

Each instrument is **toggleable** (the player can turn it off whenever) and **configurable** (per-instrument settings drawer with sliders, selects, toggles). The framing is *astronomer with instruments*, not *incremental clicker with stat boosts*.

This affects everything:
- Audio is **sonification**, not music. The radio lens's bells are *what the universe sounds like through this instrument*.
- The thermal "view" is a **dim sensor mode**, not "the real universe at low brightness". Real visible light only appears at First Light.
- Settings let players *tune their instruments*, not *upgrade their power*.

---

## Discovered laws, not unlocked abilities

Each era transition announces a **discovered law of reality**, in the universe's own voice:

> *"Attraction is now observable."*
>
> *"Density has crossed the threshold for cohesion."*
>
> *"Macro structures collapse from the void."*
>
> *"Filaments connect distant matter."*

The player is not unlocking a feature. They are *witnessing* a fundamental physical law come into effect. The game's HUD frames this consistently:

- Right panel: **Discovered Laws** , italic, violet-tinged, like cosmic field notes
- Left panel: **Instruments** , steel-blue, toggleable, technical
- The two columns are different categories of progression: *what reality has revealed* vs. *what tools the player has earned*

---

## The voice (whispers)

The universe occasionally **whispers**. Single italic lines in cosmic-poetic register, fading in at the upper third of the screen, visible for ~12-15 seconds, never blocking input.

Whispers are **atmosphere**, not tutorials. We trust the player to figure out mechanics by observing them. Whispers exist because *the universe should occasionally speak*, and when it does, it should be beautiful.

**The whisper voice rules:**
- Tiny bit cosmic-poetic, never insufferable
- Never explain mechanics the player can see for themselves
- One thing the universe could not be otherwise (e.g. "Your universe remembers itself" on resume) , this is the kind of thing whispers exist for
- Each whisper fires exactly **once per universe**, persisted in `seenWhispers`

The full whisper list lives in `src/whispers.js`. When adding a whisper, ask: would this still be beautiful read aloud at a planetarium? If no, cut it.

---

## Show, don't tell

The game has zero tutorial overlays. Zero "Click here!" arrows. Zero modal dialogs explaining mechanics.

The first 25 taps are **completely invisible**. The player taps into pure black void and only sees a tiny tap-ripple. Then the universe reveals itself through the radio lens via a whisper. The reveal teaches the lens, the lens teaches itself.

When something needs explaining (cursor settings, what Potential vs Matter means, what an instrument setting does), it lives in a **tooltip** behind an `i` icon. The icon is the discoverable affordance; the explanation is opt-in. The HUD never shouts at the player.

---

## Trust the player's intelligence

Closely related but worth saying separately:

- Don't show the same thing multiple ways for safety
- Don't explain what they can observe directly
- Don't add hand-holding "tips" for features they'll discover by clicking
- Don't be afraid of subtle effects (the camera drift, the temperature warming gradient) , curious players notice; the others get the same thing without it being shoved in their face

**The exception:** the *first interaction with a new system* often deserves a whisper or info icon to point them at it. Once. Then trust them.

---

## Meditative, not anxious

Cosmogenesis is meant to be played slowly. Settings defaults reflect this: the Radio Lens sweeps at 20 seconds per pass, with 200% sustain so bells fuse into chord drones. The default Thermal Lens dims to half-brightness with subtle scanlines, not aggressive vintage CRT.

Mechanically: there is no death state, no failure condition, no "wrong" way to play. Particles can be evicted from the cap (entropy), the cosmic web can fade if macros drift apart (entropy), but nothing the player can do is *wrong*.

**Settings should always be reset-to-defaults reachable** for players who tweak themselves into discomfort.

---

## Color as memory

The hue system is meaningful:

- **Spawn**: blue/violet/cyan range (hue 195-290). Cool. Young.
- **Warming via merging**: lerps toward gold (hue 30) along the **short arc** of the color wheel , blue → violet → magenta → red → gold. **Never through green** (an early bug we fixed).
- **Mass = pitch in the audio**: heavy bodies = deep bass. Light bodies = bright treble.
- **Filaments inherit the temperature gradient**: light pairs glow cold blue, heavy pairs glow gold.
- **The temperature legend in the bottom-left** is the explicit key for all of this, on by default.

Color is not decoration. **Color is memory of mass.** A particle's hue tells you how much matter it has accumulated. A filament's hue tells you the temperature of the connection.

---

## Performance through visual abstraction

We don't try to literally simulate galactic-scale physics. We use **layered abstraction**:

- Many small particles → fewer bigger particles via merging (mass conservation)
- Big particles → macros at threshold (1 object represents many)
- Macros → cradles at higher threshold (categorical naming)
- Cradles → stars at ignition (future Era 5)
- Stars → galaxies (future Era 8)

Each layer collapses many entities into one, keeping the simulation cheap while the cosmos visibly evolves. The "beautiful lie" is that *visual progress represents 100× more 'real' matter than the simulation actually tracks*.

This is the right move both for performance and for honesty: a real galaxy doesn't track every star's gravitational pull on every other; it has structural levels of organization. Our game does too.

---

## "Vanilla forever"

The project has zero dependencies. No npm packages. No bundlers. No transpilers. No external assets.

- Particle glows are runtime-generated SVG sprites
- Audio is procedural Web Audio synthesis
- Cursors are inline SVG data URIs
- Even the temperature legend is canvas-drawn

This is intentional. It keeps the code legible, modifiable, and immortal. Anyone with a browser and a text editor can read this code, run it, and modify it. Forever. Nothing breaks because of a stale lockfile or a deprecated transpiler.

When you're tempted to reach for a library, ask: can this be 50 lines of vanilla? Usually yes.

---

## Bodies as identities (v0.2)

The original v0.1 universe was a beautiful spectacle of mass — particles, structures, cradles, filaments — but every body was anonymous. v0.2 grants every promoted macro an **identity**:

- A name from birth (`Structure342`, `Cradle13460`) where the suffix is the cosmic year of birth
- A life history: born, what it absorbed, when it crossed the cradle threshold
- The player can **rename** any body to whatever they want
- The player can **track** any body, pinning it to a Catalog panel with its full timeline

This is intentionally close to how astronomers relate to the cosmos. Andromeda. Betelgeuse. NGC 1300. Knowing a body's name and history *transforms* the relationship with it. The cosmos stops being a generic backdrop and starts being a place full of named characters with stories.

**The design pillar:** every body of significance can be addressed and remembered. The simulation doesn't gain new mechanics from naming, but the *player's relationship to the cosmos* does.

Bodies the player has personally named and tracked become heirlooms — they survive merges, get their histories recorded in detail, and (eventually, post-First Light) can be witnessed igniting into stars. The "+372 mass" line in a Cradle's timeline isn't just a number; it's the moment that body crossed a threshold the player will remember.

**Practical rules:**
- Auto-names are determined at the moment of promotion (kind + cosmic year suffix). They follow the body via the auto-rename pass when a Structure crosses into Cradle mass.
- Player-set names are *sacred*. The auto-rename pass only touches names that exactly match the auto-name pattern.
- A body's history captures observable, narrative-worthy events. Silent particle accretion does NOT generate history entries (it would explode the log with phantom events). Only real macro-on-macro events do.
- A tombstone glyph marks bodies that died (got absorbed) in another body's timeline — a small visual cue that this is the only place that body now exists.

---

## Anti-patterns we deliberately avoid

| Pattern | Why we don't do it |
|---|---|
| **Time-gated progression** | Violates the physics-only principle. World-time is a lie. |
| **Numerical upgrades (+10% etc.)** | Breaks the "instruments, not upgrades" model. |
| **Tutorial overlays** | Breaks "show, don't tell". The universe teaches itself. |
| **Failure states / Game Over** | Breaks meditative tone. |
| **Aggressive monetization hooks** | Not the game. |
| **Power scaling for difficulty curves** | The universe doesn't get "harder", it gets *bigger*. |
| **Em dashes in user-facing copy** | Stylistic preference. Use commas, periods, or rewrite. |
| **External assets** | Breaks "vanilla forever". |

---

## When in doubt

Ask the four questions:

1. **Is this physically motivated?** Could a real (or thematically-real) cosmological phenomenon justify this?
2. **Does this trust the player?** Would a smart curious player resent this if it were forced on them?
3. **Does this feel like an instrument?** Or does it feel like a video game power-up?
4. **Is this beautiful?** The whispers, the colors, the audio, the visual rhythm — does this match the meditative cosmic vibe?

If any answer is "no", redesign. Don't ship a feature that contradicts these.
