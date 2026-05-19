// Whispers
// Soft, in-world guidance lines spoken by the universe itself.
// Each whisper fires once per universe (persisted in `state.seenWhispers`)
// and uses the same poetic register as the discovered laws.
//
// Order in this array = priority. The evaluator returns the FIRST whisper
// whose test passes and that hasn't been seen.

export const WHISPERS = [
  {
    id: 'resumed',
    message: 'Your universe remembers itself. It has continued in your absence.',
    test: (s) => s.wasResumed === true
  },
  {
    id: 'opening-radio',
    message: 'The first instrument awakens. You cannot yet see the universe, but it has begun to speak.',
    test: (s) => s.potential >= 25,
    highlight: 'lens-name'
  },
  {
    id: 'opening-thermal',
    message: 'Before light, there was warmth. What you see is the universe\u2019s heat, not its glow.',
    test: (s) => s.potential >= 100,
    highlight: 'lens-name'
  },
  {
    id: 'hold-to-pour',
    message: 'Press and hold. Let the potential flow.',
    test: (s) => s.potential >= 5
  },
  {
    id: 'field-awakens',
    message: 'They are not alone now. They begin to seek.',
    test: (s, sim) => s.eraIndex >= 1 && sim.particles.length >= 70
  },
  {
    id: 'first-warmth',
    message: 'What gathers grows warm. Color is memory.',
    test: (s) => s.maxParticleMass >= 28
  },
  {
    id: 'first-filament',
    message: 'Distant macros bend toward each other. The cosmic web takes shape.',
    test: (s, sim) => sim.macros.length >= 2 && s.eraIndex >= 4
  },
  {
    id: 'inactivity',
    message: 'The universe continues without you. It does not require your attention.',
    test: (s) =>
      s.eraIndex >= 1 &&
      s.lastInteractionAt > 0 &&
      (Date.now() - s.lastInteractionAt) > 90000
  },
  {
    id: 'inducer-resonance',
    message: 'The Resonance Lens holds. Drag your finger across the field — what you trace becomes substance.',
    test: (s) => s.unlockedInducerModes && s.unlockedInducerModes.has && s.unlockedInducerModes.has('resonance')
  },
  {
    id: 'inducer-compression',
    message: 'Press and hold. Let the Compression Lens gather, then release a denser seed than your hand alone could offer.',
    test: (s) => s.unlockedInducerModes && s.unlockedInducerModes.has && s.unlockedInducerModes.has('compression')
  },
  {
    id: 'inducer-accretion',
    message: 'Aim near a gravity well. The Accretion Stream feeds it directly — no Potential earned, but mass concentrated where you choose.',
    test: (s) => s.unlockedInducerModes && s.unlockedInducerModes.has && s.unlockedInducerModes.has('accretion')
  },
  {
    id: 'first-light',
    message: 'The dark threshold has been crossed. What you see now is light itself.',
    test: (s) => s.eraIndex >= 5
  },
  {
    id: 'cosmos-yours',
    message: 'The void was your study. The cosmos is yours to sow.',
    test: (s, sim, renderer) => s.eraIndex >= 5 && renderer && renderer.zoom <= 0.07
  }
];

export function findReadyWhisper(state, sim, renderer) {
  if (!state.seenWhispers) return null;
  // Opening sequence (radio then thermal) takes priority. Until both have
  // been heard, only `opening-*` whispers and the resume whisper are
  // eligible. This prevents earlier ambient whispers from eating cooldown
  // and blocking the next lens reveal.
  const openingComplete =
    state.seenWhispers.has('opening-radio') &&
    state.seenWhispers.has('opening-thermal');
  for (const w of WHISPERS) {
    if (state.seenWhispers.has(w.id)) continue;
    if (!openingComplete && !w.id.startsWith('opening-') && w.id !== 'resumed') continue;
    try {
      if (w.test(state, sim, renderer)) return w;
    } catch (_) { /* defensive: skip on test error */ }
  }
  return null;
}
