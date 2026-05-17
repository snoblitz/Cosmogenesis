// localStorage save/load. Keep this thin, the simulation and state
// classes own their own shape.

const KEY = 'cosmogenesis';
// Bumped to 2 when the coordinate system changed from "canvas pixels" to
// "world coords" (world is larger than viewport so the camera can pull back).
// Old saves are discarded to avoid particles starting at (0,0) of the new world.
const VERSION = 2;

// Companion key: an absolute timestamp until which loadGame() acts as if no
// save exists, even if one is on disk. Set by the reset flow so the player
// gets a true blank slate for the next ~5 minutes of testing/exploration.
const FRESH_KEY = 'cosmogenesis_freshUntil';

// Legacy keys from the previous project name. Migrated on first load so
// players don't lose their universe across the rename.
const LEGACY_KEY = 'voidBloom';
const LEGACY_FRESH_KEY = 'voidBloom_freshUntil';

function migrateLegacyKeys() {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && !localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, legacy);
    }
    if (legacy) localStorage.removeItem(LEGACY_KEY);

    const legacyFresh = localStorage.getItem(LEGACY_FRESH_KEY);
    if (legacyFresh && !localStorage.getItem(FRESH_KEY)) {
      localStorage.setItem(FRESH_KEY, legacyFresh);
    }
    if (legacyFresh) localStorage.removeItem(LEGACY_FRESH_KEY);
  } catch (_) { /* ignore */ }
}

export function saveGame(data) {
  try {
    const payload = { v: VERSION, ts: Date.now(), ...data };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[cosmogenesis] save failed:', e);
  }
}

export function loadGame() {
  try {
    migrateLegacyKeys();
    const freshUntil = Number(localStorage.getItem(FRESH_KEY) || 0);
    if (freshUntil > 0 && Date.now() < freshUntil) return null;
    if (freshUntil > 0) {
      localStorage.removeItem(FRESH_KEY);
    }

    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION) return null;
    return parsed;
  } catch (e) {
    console.warn('[cosmogenesis] load failed:', e);
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (_) {}
}

export function setFreshUntil(timestamp) {
  try { localStorage.setItem(FRESH_KEY, String(timestamp)); } catch (_) {}
}
