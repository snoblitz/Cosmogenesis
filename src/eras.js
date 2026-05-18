// Era definitions
// The first four eras are wired up; the rest are reserved scaffolding
// for the full progression arc described in the design doc.
//
// Each era also has a `zoom` value, the camera target when that era is
// active. Lower zoom = more pulled-back perspective. The renderer smoothly
// lerps toward this value over many seconds, so era transitions don't snap.

export const ERAS = [
  {
    name: 'The First Particle',
    law:  'Potential may be made manifest.',
    lawTooltip: 'Every action you take adds potential to the void. Even before physics emerges, what you create endures.',
    eraTooltip: 'Each tap or hold adds raw potential to the void. The universe is silent and dark. Only your input gives it anything to record.',
    hint: 'Tap the void to add potential…',
    zoom: 1.0
  },
  {
    name: 'The Field Awakens',
    law:  'Attraction is now observable.',
    lawTooltip: 'Particles within a short range begin to pull on one another. The first force has woken in the field.',
    eraTooltip: 'Particles now attract one another across short distances. Watch them drift together into loose swarms.',
    hint: 'Particles drift toward one another…',
    zoom: 0.88
  },
  {
    name: 'Matter Learns to Gather',
    law:  'Density has crossed the threshold for cohesion.',
    lawTooltip: 'Slow-moving particles that meet now fuse into denser ones. As mass grows, color shifts from cold blue toward warm gold. Color becomes memory of mass.',
    eraTooltip: 'Slow collisions now fuse particles into denser bodies. Mass accumulates and color warms as bodies age.',
    hint: 'Slow-moving particles may now merge…',
    zoom: 0.76
  },
  {
    name: 'Structure Emerges',
    law:  'Macro structures collapse from the void.',
    lawTooltip: 'When a single body accumulates enough mass it condenses into a macro: a permanent gravity well. The universe has its first true center.',
    eraTooltip: 'When a body grows massive enough it condenses into a macro: a permanent gravity well that pulls everything around it.',
    hint: 'Massive bodies bend the field around them…',
    zoom: 0.64
  },
  // --- Reserved for future implementation ---
  { name: 'The Cosmic Web',          law: 'Filaments connect distant matter.',
    lawTooltip: 'Macros that share a gravitational neighborhood weave luminous threads between them. The cosmic web begins to take shape.',
    eraTooltip: 'Macros that share a gravitational neighborhood are connected by glowing filaments. The web of structure begins.',
    hint: '', zoom: 0.48 },
  { name: 'First Light',             law: 'Density ignites the first radiance.',
    lawTooltip: 'A sufficiently massive macro crosses the ignition threshold and begins emitting true visible light. The dark age ends.',
    eraTooltip: 'Macros that reach the ignition threshold begin to emit visible light. The thermal lens gives way to the eye.',
    hint: '', zoom: 0.44 },
  { name: 'The Age of Stars',        law: 'Light becomes the architect of form.',
    lawTooltip: 'Stars stabilize through the balance of gravity and radiation pressure. Stable orbital structures become possible.',
    eraTooltip: 'Light and gravity balance into stable stars. Orbital systems become possible.',
    hint: '', zoom: 0.42 },
  { name: 'The Cycle of Creation',   law: 'What collapses gives rise to what arises.',
    lawTooltip: 'Massive stars exhaust their fuel and explode, scattering heavy matter as seed for the next generation.',
    eraTooltip: 'Massive stars exhaust their fuel and supernova, scattering heavy matter as seeds for new structures.',
    hint: '', zoom: 0.40 },
  { name: 'Galaxies Take Shape',     law: 'Structure remembers its origin.',
    lawTooltip: 'Stars bind into galaxies with shared rotation. Each carries the imprint of how it formed.',
    eraTooltip: 'Stars bind into vast rotating systems. Each carries the memory of how it formed.',
    hint: '', zoom: 0.41 },
  { name: 'Dark Architecture',       law: 'The unseen sculpts the visible.',
    lawTooltip: 'Dark matter scaffolding becomes apparent. The visible cosmos rides on an invisible substrate.',
    eraTooltip: 'Invisible mass becomes apparent through its gravitational effects. The cosmos rides on an unseen substrate.',
    hint: '', zoom: 0.40 },
  { name: 'Conscious Observation',   law: 'The universe begins to perceive itself.',
    lawTooltip: 'The first observer emerges in a stable system. Awareness becomes part of the physics.',
    eraTooltip: 'The universe begins to perceive itself. Awareness becomes part of the physics.',
    hint: '', zoom: 0.40 },
  { name: 'The Remembering Universe',law: 'All that has been is held within all that is.',
    lawTooltip: 'The universe acquires memory. Past states leave faint echoes detectable in the present.',
    eraTooltip: 'Every past state leaves an echo detectable in the present.',
    hint: '', zoom: 0.40 },
  { name: 'Recursion',               law: 'A new void opens within the bloom.',
    lawTooltip: 'The cycle completes. Within any structure, a smaller void contains a smaller universe. Begin again.',
    eraTooltip: 'The cycle completes. A new void opens within the bloom. Begin again.',
    hint: '', zoom: 0.40 }
];

// The most zoomed-out we will ever go (determines world size vs. viewport).
export const MIN_ZOOM = 0.40;

// The era index at which "First Light" occurs. Before this, the renderer
// applies a thermal/dim treatment; at this era, the universe ignites into
// the visible spectrum.
export const FIRST_LIGHT_ERA = 5;

// Lens label shown in the HUD. Eventually this becomes a user-selectable
// spectrum filter (Phase B); for now it tracks the current physical era.
export function lensLabel(eraIndex) {
  return eraIndex >= FIRST_LIGHT_ERA ? 'Visible' : 'Thermal';
}

// Decide whether the player should advance to the *next* era.
// Returns the target era index, or null if no change.
//
// All gates are physical state, never wall-clock time. The universe progresses
// when the universe has done enough, not when a timer says it's allowed.
export function evaluateEra(state, sim) {
  const i = state.eraIndex;

  // 0 → 1 ("The Field Awakens")
  //   Meaningful potential has been added to the void.
  if (i < 1 && sim.totalSpawned >= 40) return 1;

  // 1 → 2 ("Matter Learns to Gather")
  //   Enough particles for attraction to have visibly populated the field.
  //   Merging is off in era 1, so this count only grows by spawning.
  if (i < 2 && sim.particles.length >= 140) return 2;

  // 2 → 3 ("Structure Emerges")
  //   At least one macro-object has naturally condensed.
  if (i < 3 && sim.macros.length >= 1) return 3;

  // 3 → 4 ("The Cosmic Web")
  //   Two or more structures exist; filaments can now connect them.
  if (i < 4 && sim.macros.length >= 2) return 4;

  // 4 → 5 ("First Light")
  //   At least one cradle has ignited into a star.
  if (i < 5 && sim.macros.some(m => m.kind === 'star')) return 5;

  return null;
}
