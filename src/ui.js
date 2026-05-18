// UI layer
// Pushes game state into the existing DOM HUD. Knows nothing about physics.

const INFO_TOOLTIPS = {
  potential: {
    title: 'Potential',
    body: [
      'Every touch you have ever made.',
      'The void remembers your effort. This number only grows, even as the matter it shaped slowly fades.'
    ]
  },
  matter: {
    title: 'Matter',
    body: [
      'What the universe presently holds.',
      'Each binding releases a fraction of mass as radiation. Matter therefore lags behind Potential: the cosmos can never quite hold all you have offered it.'
    ]
  },
  structures: {
    title: 'Structures',
    body: [
      'Macro-objects: gravity wells condensed from accumulated mass.',
      'When matter crosses a density threshold it collapses inward, becoming a singular body that bends the field around it.'
    ]
  },
  cradles: {
    title: 'Cradles',
    body: [
      'Macros that have crossed the gestational threshold by merging with others.',
      'Each cradle carries enough mass that, in time, it may ignite into a star.'
    ]
  },
  filaments: {
    title: 'Filaments',
    body: [
      'Active gravitational threads connecting macros and cradles within range of each other.',
      'As the cosmic web tightens, these connections multiply and brighten.'
    ]
  }
};

import { ERAS, FIRST_LIGHT_ERA } from './eras.js';
import { YEARS_PER_SECOND } from './simulation.js';

// Lookup: law text -> era definition. Lets _appendLaw attach the era's
// `lawTooltip` to each list item without needing to track era index alongside
// the law string in state.
const LAW_TO_ERA = new Map();
for (const era of ERAS) {
  if (era && era.law) LAW_TO_ERA.set(era.law, era);
}

// Unlocks: player capabilities earned through play. Derived from existing
// state rather than independently tracked, so they're always in sync with
// what the player has actually achieved. Order matters, first item first.
// Inline SVG glyphs for instrument quick-toggle icons. Each glyph includes
// a `.icon-strike` line that's invisible by default and revealed via CSS
// when the parent <li> has the .disabled class, producing the universal
// "off / muted" diagonal-slash visual.
const INSTRUMENT_ICONS = {
  speaker: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g class="icon-glyph" fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h2.2L8.5 3v10L5.2 10H3z" stroke-width="1" />
      <path d="M10.5 5.5c1 .8 1.6 1.9 1.6 3s-.6 2.2-1.6 3" fill="none" stroke-width="1.2"/>
    </g>
    <line class="icon-strike" x1="1.5" y1="14.5" x2="14.5" y2="1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`,
  eye: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g class="icon-glyph" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1.5 8c2-3.2 4.2-4.5 6.5-4.5S12.5 4.8 14.5 8c-2 3.2-4.2 4.5-6.5 4.5S3.5 11.2 1.5 8z"/>
      <circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none"/>
    </g>
    <line class="icon-strike" x1="1.5" y1="14.5" x2="14.5" y2="1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`,
  fisheye: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g class="icon-glyph" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="8" r="4.5"/>
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
    </g>
    <line class="icon-strike" x1="1.5" y1="14.5" x2="14.5" y2="1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`
};

// Small arched-top headstone, drawn in currentColor. Used as a death marker
// next to absorbed bodies in the catalog timeline.
const TOMBSTONE_SVG = `<svg viewBox="0 0 12 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M2 6 Q2 1.5 6 1.5 Q10 1.5 10 6 L10 13 L2 13 Z" fill="currentColor"/>
  <path d="M5 4.4 L7 4.4 M6 3.4 L6 5.4" stroke="rgba(0,0,0,0.35)" stroke-width="0.6" stroke-linecap="round" fill="none"/>
</svg>`;

function macroKindLabel(kind) {
  if (kind === 'star') return 'Star';
  if (kind === 'cradle') return 'Cradle';
  return 'Structure';
}

// Instruments: observation tools the player actively wields (toggleable).
// Each gets a clickable entry in the Instruments HUD panel. State-derived,
// no separate persistence — always in sync with what's actually unlocked.
// Global (non-instrument) settings: rendered into the floating settings
// panel anchored to the bottom-right ⚙ button.
const GLOBAL_SETTINGS = [
  {
    key: 'cursorStyle',
    label: 'Cursor',
    type: 'select',
    default: 'crosshair',
    options: [
      { value: 'crosshair', label: 'Crosshair' },
      { value: 'default',   label: 'Default Arrow' },
      { value: 'reticle',   label: 'Reticle' },
      { value: 'dot',       label: 'Glow Dot' },
      { value: 'plus',      label: 'Plus' },
      { value: 'none',      label: 'Hidden' }
    ],
    tooltip: 'The pointer style shown while hovering over the universe canvas.',
    onChange: (v, ui) => ui._applyCursor && ui._applyCursor(v)
  },
  {
    key: 'touchOffsetPx',
    label: 'Touch Offset',
    min: 0, max: 80, step: 4, default: 0,
    format: (v) => v === 0 ? 'Off' : `${Math.round(v)}px`,
    tooltip: 'For touch input only. Lifts the effective tap point above your fingertip so the spawn isn\'t hidden under your finger. Mouse and stylus are never offset. Try 32px on phones if the dot lands under your touch.'
  },
  {
    key: 'showTouchPointer',
    label: 'Show Touch Pointer',
    type: 'toggle',
    default: false,
    tooltip: 'For touch input only. Renders your chosen cursor at the tap location so you can see exactly where the spawn lands - especially useful with Touch Offset enabled. Mouse and stylus are unaffected.',
    onChange: (_v, ui) => ui._refreshTouchPointerStyle && ui._refreshTouchPointerStyle()
  },
  {
    key: 'smartTracking',
    label: 'Smart Tracking',
    type: 'toggle',
    default: false,
    tooltip: 'Slowly pans the camera to keep your structures and cradles on screen. Useful on small viewports where bodies drift out of view. No zoom change.'
  }
];

// CSS cursor values per style. SVG data URIs render crisp at any size and
// stay tiny without requiring external image assets.
const CURSOR_VALUES = {
  default:   'default',
  crosshair: 'crosshair',
  reticle:   "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='8' fill='none' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><line x1='12' y1='1' x2='12' y2='8' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><line x1='12' y1='16' x2='12' y2='23' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><line x1='1' y1='12' x2='8' y2='12' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><line x1='16' y1='12' x2='23' y2='12' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><circle cx='12' cy='12' r='1.5' fill='%23ffffff' fill-opacity='0.85'/></svg>\") 12 12, crosshair",
  dot:       "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><circle cx='8' cy='8' r='4' fill='%23c7b6ff' fill-opacity='0.4'/><circle cx='8' cy='8' r='2' fill='%23ffffff' fill-opacity='0.95'/></svg>\") 8 8, crosshair",
  plus:      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><line x1='8' y1='2' x2='8' y2='14' stroke='%23ffffff' stroke-opacity='0.9' stroke-width='1.2'/><line x1='2' y1='8' x2='14' y2='8' stroke='%23ffffff' stroke-opacity='0.9' stroke-width='1.2'/></svg>\") 8 8, crosshair",
  none:      'none'
};

// Parallel SVG-only variants for the touch pointer overlay. Same glyphs as
// the cursors above but rendered as a centered floating element rather than
// a cursor hotspot — so styles like 'default' (system arrow) and 'crosshair'
// (browser default) need explicit SVG fallbacks. Each value is { svg, size }
// where size is the side length in CSS px.
const TOUCH_POINTER_GLYPHS = {
  default:   { svg: "<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><path d='M3 2 L3 14 L7 11 L10 17 L12 16 L9 10 L14 10 Z' fill='%23ffffff' fill-opacity='0.9' stroke='%23000000' stroke-opacity='0.4' stroke-width='0.6'/></svg>", size: 20, hotspot: { x: 3, y: 2 } },
  crosshair: { svg: "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><line x1='11' y1='1' x2='11' y2='8' stroke='%23ffffff' stroke-opacity='0.9' stroke-width='1.2'/><line x1='11' y1='14' x2='11' y2='21' stroke='%23ffffff' stroke-opacity='0.9' stroke-width='1.2'/><line x1='1' y1='11' x2='8' y2='11' stroke='%23ffffff' stroke-opacity='0.9' stroke-width='1.2'/><line x1='14' y1='11' x2='21' y2='11' stroke='%23ffffff' stroke-opacity='0.9' stroke-width='1.2'/></svg>", size: 22, hotspot: { x: 11, y: 11 } },
  reticle:   { svg: "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='8' fill='none' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><line x1='12' y1='1' x2='12' y2='8' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><line x1='12' y1='16' x2='12' y2='23' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><line x1='1' y1='12' x2='8' y2='12' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><line x1='16' y1='12' x2='23' y2='12' stroke='%23ffffff' stroke-opacity='0.75' stroke-width='1'/><circle cx='12' cy='12' r='1.5' fill='%23ffffff' fill-opacity='0.85'/></svg>", size: 24, hotspot: { x: 12, y: 12 } },
  dot:       { svg: "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><circle cx='8' cy='8' r='4' fill='%23c7b6ff' fill-opacity='0.4'/><circle cx='8' cy='8' r='2' fill='%23ffffff' fill-opacity='0.95'/></svg>", size: 16, hotspot: { x: 8, y: 8 } },
  plus:      { svg: "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><line x1='8' y1='2' x2='8' y2='14' stroke='%23ffffff' stroke-opacity='0.9' stroke-width='1.2'/><line x1='2' y1='8' x2='14' y2='8' stroke='%23ffffff' stroke-opacity='0.9' stroke-width='1.2'/></svg>", size: 16, hotspot: { x: 8, y: 8 } },
  none:      null
};

const INSTRUMENT_DEFINITIONS = [
  {
    id: 'radio-lens',
    label: 'Radio Lens',
    icon: 'speaker',
    earned: (state) => state.seenWhispers && state.seenWhispers.has('opening-radio'),
    toggleable: true,
    settings: [
      { key: 'radioSweepPeriod',    label: 'Sweep Period',    min: 3,   max: 20,  step: 0.5,  default: 20.0,
        format: (v) => `${v.toFixed(1)}s`,
        tooltip: 'How long the sweep takes to travel from one side to the other. Lower values mean faster scans and more frequent detections.' },
      { key: 'radioSweepStyle',     label: 'Sweep Style',     type: 'select',     default: 'sine',
        options: [
          { value: 'linear',   label: 'Linear' },
          { value: 'sine',     label: 'Sine' },
          { value: 'pingpong', label: 'Ping-pong' }
        ],
        tooltip: [
          'Linear: constant speed, snaps back to the left after each pass.',
          'Sine: smooth, eases at the edges like a pendulum.',
          'Ping-pong: bounces back and forth without snapping, doubling detection density per cycle.'
        ] },
      { key: 'radioBeamWidth',      label: 'Beam Width',      min: 3,   max: 20,  step: 0.5,  default: 6.0,
        format: (v) => `${v.toFixed(1)}px`,
        tooltip: 'Width of the detection zone around the sweep line. Narrow beams pick out individual particles for sparse melodies; wide beams catch many at once and produce chord-like clusters.' },
      { key: 'radioSustain',        label: 'Sustain',         min: 0.3, max: 2,   step: 0.05, default: 2.0,
        format: (v) => `${Math.round(v * 100)}%`,
        onChange: (v, ui) => ui._audio && ui._audio.setSustain(v),
        tooltip: 'How long each detected note rings out. Lower values produce staccato pings; higher values produce sustained pad-like drones that overlap into chords.' },
      { key: 'radioSpikeIntensity', label: 'Spike Intensity', min: 0,   max: 2,   step: 0.05, default: 0.5,
        format: (v) => `${Math.round(v * 100)}%`,
        tooltip: 'Visual size of the detection markers drawn on the sweep line. Zero hides them entirely for a pure audio readout.' },
      { key: 'radioLineOpacity',    label: 'Opacity',         min: 0,   max: 1.5, step: 0.05, default: 0.5,
        format: (v) => `${Math.round(v * 100)}%`,
        tooltip: 'Visibility of the sweep line and its halo. Setting this to zero keeps audio active while hiding all radio visuals.' },
      { key: 'radioVolume',         label: 'Volume',          min: 0,   max: 2,   step: 0.05, default: 1.0,
        format: (v) => `${Math.round(v * 100)}%`,
        onChange: (v, ui) => ui._audio && ui._audio.setVolume(v),
        tooltip: 'Audio master level for the radio lens. Zero silences the instrument without disabling its visuals.' }
    ]
  },
  {
    id: 'thermal-lens',
    label: 'Thermal Lens',
    icon: 'eye',
    // Once earned (via opening-thermal whisper), Thermal Lens stays in the
    // panel forever. Post-First-Light it auto-toggles off in favor of the
    // Visible Lens (cinematic handoff), but the player can flip back to
    // thermal observation any time — real astronomers use multiple sensor
    // modes. The Instruments panel is the player's earned toolkit; nothing
    // gets retired by progression.
    earned: (state) => state.seenWhispers && state.seenWhispers.has('opening-thermal'),
    toggleable: true,
    settings: [
      { key: 'thermalDimAmount',         label: 'Dimming',           min: 0, max: 1.5, step: 0.05, default: 1.0,
        format: (v) => `${Math.round(v * 100)}%`,
        tooltip: 'How much the thermal lens darkens the view. Pre-light eras show heat, not visible light, so a dim treatment is more cosmologically honest.' },
      { key: 'thermalScanlineIntensity', label: 'Scanlines',         min: 0, max: 2,   step: 0.05, default: 1.0,
        format: (v) => `${Math.round(v * 100)}%`,
        tooltip: 'Intensity of the sensor-pattern scanlines overlaid on the universe. Zero gives a clean view; higher values feel like an older CRT.' },
      { key: 'thermalShowScale',         label: 'Temperature Scale', type: 'toggle', default: true,
        tooltip: 'Shows a color key in the bottom-left mapping particle hue to relative temperature. Cold blue particles are young; warm gold ones have absorbed lots of matter.' }
    ]
  },
  {
    id: 'visible-lens',
    label: 'Visible Lens',
    icon: 'fisheye',
    // Unlocked at First Light. Sits alongside Thermal in the panel — the
    // player toggles between the two as observation modes (mutex enforced
    // in state.toggleLens). Customizations below tune the visible render
    // like a real telescope: exposure, bloom, diffraction.
    earned: (state) => state.eraIndex >= FIRST_LIGHT_ERA,
    toggleable: true,
    settings: [
      { key: 'visibleExposure', label: 'Exposure', min: 0.3, max: 2.0, step: 0.05, default: 1.0,
        format: (v) => `${Math.round(v * 100)}%`,
        tooltip: 'Brightness of the visible-spectrum view, like a camera exposure setting. Lower it for a cleaner contrast against the void; raise it to coax faint emission out of cooler bodies.' },
      { key: 'visibleBloom', label: 'Star Bloom', min: 0, max: 2.0, step: 0.05, default: 1.0,
        format: (v) => `${Math.round(v * 100)}%`,
        tooltip: 'How much halo glow surrounds bright bodies. Zero gives the sharp pinpoint look of a perfect lens; higher values feel like atmospheric scatter or a long-exposure photo.' },
      { key: 'visibleDiffractionSpikes', label: 'Diffraction Spikes', type: 'toggle', default: true,
        tooltip: 'Cross-shaped spikes on the brightest bodies. Real telescopes with support vanes produce these naturally; toggling them gives the view that classic Hubble-image feel.' }
    ]
  }
];

// Unlocks: reserved for future non-instrument earnings (abilities, badges,
// narrative milestones). Empty for now — the panel stays hidden until
// populated.
const UNLOCK_DEFINITIONS = [];

export class UI {
  constructor() {
    this.elEra        = document.getElementById('era-name');
    this.elYear       = document.getElementById('year-count');
    this.elEraInfo    = document.getElementById('era-info');
    this.elLens       = document.getElementById('lens-name');
    this.elLensLine   = document.querySelector('.lens-line');
    this.elPot        = document.getElementById('stat-potential');
    this.elMat        = document.getElementById('stat-matter');
    this.elStr        = document.getElementById('stat-structures');
    this.elStrRow     = document.querySelector('.stat-structures-row');
    this.elCradles    = document.getElementById('stat-cradles');
    this.elCradRow    = document.querySelector('.stat-cradles-row');
    this.elFilaments  = document.getElementById('stat-filaments');
    this.elFilRow     = document.querySelector('.stat-filaments-row');
    this.elHint       = document.getElementById('hint');
    this.elLaws       = document.getElementById('laws-list');
    this.elUnlocks    = document.getElementById('unlocks-list');
    this.elUnlocksPanel = document.getElementById('hud-unlocks');
    this.elInstruments = document.getElementById('instruments-list');
    this.elInstrumentsPanel = document.getElementById('hud-instruments');
    this.elInstrumentsTools = document.querySelector('.instruments-tools');
    this.elEmitterDeployBtn = document.getElementById('emitter-deploy-btn');
    this.elEmitterDeployCost = document.getElementById('emitter-deploy-cost');
    this.elEmitterReadout = document.getElementById('emitter-readout');
    this.elBanner     = document.getElementById('discovery-banner');
    this.elWhisper    = document.getElementById('whisper');
    this.elTooltip    = document.getElementById('info-tooltip');
    this.elSettingsBtn   = document.getElementById('settings-btn');
    this.elSettingsPanel = document.getElementById('settings-panel');
    this.elSettingsContent = document.getElementById('settings-content');
    this.elCanvas        = document.getElementById('universe');
    this.elInspector     = document.getElementById('macro-inspector');
    this.elInspectorKind = this.elInspector?.querySelector('.mi-kind') || null;
    this.elInspectorName = this.elInspector?.querySelector('.mi-name') || null;
    this.elInspectorMass = this.elInspector?.querySelector('[data-mi="mass"]') || null;
    this.elInspectorAbs  = this.elInspector?.querySelector('[data-mi="absorbed"]') || null;
    this.elInspectorAge  = this.elInspector?.querySelector('[data-mi="age"]') || null;
    this.elInspectorFil  = this.elInspector?.querySelector('[data-mi="filaments"]') || null;
    this.elInspectorFilRow = this.elInspector?.querySelector('.mi-row-filaments') || null;
    this.elInspectorHint = this.elInspector?.querySelector('.mi-hint') || null;
    this.elInspectorLeader = document.getElementById('inspector-leader');
    this.elInspectorLeaderLine = this.elInspectorLeader?.querySelector('polyline') || null;
    this.elCatalogPanel  = document.getElementById('hud-catalog');
    this.elCatalogList   = document.getElementById('catalog-list');
    this._catalogNodes   = new Map();   // macroId -> { li, titleEl, subEl, timelineEl }
    this._catalogExpanded = new Set();   // macroIds whose timeline is open
    this._inspectorVisible = false;
    this._inspectorWidth = 0;
    this._inspectorHeight = 0;

    // Context menu (right-click / long-press) DOM + state.
    this.elContextMenu       = document.getElementById('macro-context-menu');
    this.elContextMenuTitle  = this.elContextMenu?.querySelector('.mcm-title') || null;
    this.elContextMenuActions= this.elContextMenu?.querySelector('.mcm-actions') || null;
    this.elContextMenuRename = this.elContextMenu?.querySelector('.mcm-rename') || null;
    this.elContextMenuInput  = this.elContextMenu?.querySelector('.mcm-input') || null;
    this.elContextMenuTrackLabel = this.elContextMenu?.querySelector('.mcm-track-label') || null;
    this.elContextMenuTrackGlyph = this.elContextMenu?.querySelector('.mcm-item[data-action="track"] .mcm-glyph') || null;
    this.elContextMenuEmitterToggle = this.elContextMenu?.querySelector('.mcm-item[data-action="emitter-toggle"]') || null;
    this.elContextMenuEmitterToggleLabel = this.elContextMenu?.querySelector('.mcm-emitter-toggle-label') || null;
    this.elContextMenuEmitterToggleGlyph = this.elContextMenu?.querySelector('.mcm-emitter-toggle-glyph') || null;
    this.elContextMenuEmitterRemove = this.elContextMenu?.querySelector('.mcm-item[data-action="emitter-remove"]') || null;
    this._contextMenuItems = Array.from(this.elContextMenu?.querySelectorAll('.mcm-item') || []);
    this._contextMenuOpen = false;
    this._contextMenuTargetType = 'macro';
    this._contextMenuMacroId = null;
    this._contextMenuEmitterId = null;
    this._contextMenuMode = 'actions'; // 'actions' | 'rename'

    // External callbacks set by main.js so the input layer can react.
    this.onMacroRename       = null;  // (macroId, newName) => void
    this.onMacroTrackToggle  = null;  // (macroId, nextTracked) => void
    this.onEmitterPauseToggle = null; // (emitterId) => void
    this.onEmitterRemove = null;      // (emitterId) => void
    this.onDeployEmitterClick = null; // () => void
    this.getEmitterMenuContext = null; // (emitterId) => { paused }
    this.getToolsContext = null;      // () => tools readout state
    this.onCatalogEntryClick = null;  // (macroId) => void
    this._wireToolsPanel();
    this._wireContextMenu();
    this._renderedLawCount = 0;
    this._unlockNodes  = new Map();
    this._instrumentNodes = new Map();
    this._bannerLock = false;
    this._whisperLock = false;
    this._lensRevealed = false;
    this._tooltipKey = null;
    this._audio = null;
    this._globalSettingsBuilt = false;

    this._wireTooltips();
    this._wireSettingsButton();
    this._wireEraInfo();
  }

  setAudio(audio) { this._audio = audio; }

  _wireToolsPanel() {
    if (!this.elEmitterDeployBtn) return;
    this.elEmitterDeployBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.onDeployEmitterClick?.();
    });
  }

  _wireEraInfo() {
    if (!this.elEraInfo) return;
    this.elEraInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      const state = this._lastState;
      if (!state) return;
      const era = state.currentEra();
      if (!era || !era.eraTooltip) return;
      this._toggleTooltipFor(this.elEraInfo, `era:${era.name}`, era.name, era.eraTooltip);
    });
    this.elEraInfo.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  _applyCursor(styleKey) {
    if (!this.elCanvas) return;
    const v = CURSOR_VALUES[styleKey] || CURSOR_VALUES.crosshair;
    this.elCanvas.style.cursor = v;
    // If the touch pointer is visible, re-render it with the new glyph.
    this._refreshTouchPointerStyle();
  }

  // ---- Touch pointer overlay ---------------------------------------------
  // Optional visible cursor that follows the user's finger on touch input.
  // Mirrors the chosen cursorStyle so the touch experience matches desktop
  // visual language. Off by default; opt-in via the Show Touch Pointer
  // setting. Position is in viewport (client) coords; the hotspot of each
  // glyph is centered on the given position so it lands where the spawn does.
  _ensureTouchPointerEl() {
    if (this._touchPointerEl) return this._touchPointerEl;
    const el = document.createElement('div');
    el.id = 'touch-pointer';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position: fixed; pointer-events: none; z-index: 9000;' +
      ' background-repeat: no-repeat; background-position: center;' +
      ' opacity: 0; transition: opacity 140ms ease;' +
      ' filter: drop-shadow(0 0 6px rgba(180, 150, 255, 0.45));' +
      ' will-change: transform, opacity;';
    document.body.appendChild(el);
    this._touchPointerEl = el;
    return el;
  }

  _currentTouchPointerGlyph() {
    const style = (this._stateRef && this._stateRef.settings && this._stateRef.settings.cursorStyle) || 'crosshair';
    return TOUCH_POINTER_GLYPHS[style] || TOUCH_POINTER_GLYPHS.crosshair;
  }

  _refreshTouchPointerStyle() {
    if (!this._touchPointerEl) return;
    const g = this._currentTouchPointerGlyph();
    if (!g) {
      this._touchPointerEl.style.backgroundImage = 'none';
      return;
    }
    this._touchPointerEl.style.width  = g.size + 'px';
    this._touchPointerEl.style.height = g.size + 'px';
    this._touchPointerEl.style.backgroundImage = `url("data:image/svg+xml;utf8,${g.svg}")`;
    this._touchPointerEl.style.backgroundSize  = `${g.size}px ${g.size}px`;
    // Store hotspot for positioning math.
    this._touchPointerHotspot = g.hotspot;
    this._touchPointerSize    = g.size;
  }

  showTouchPointerAt(clientX, clientY) {
    if (!this._stateRef || !this._stateRef.settings || !this._stateRef.settings.showTouchPointer) return;
    const el = this._ensureTouchPointerEl();
    if (!this._touchPointerHotspot) this._refreshTouchPointerStyle();
    const g = this._currentTouchPointerGlyph();
    if (!g) return; // 'none' style: nothing to show
    const hs = this._touchPointerHotspot || { x: g.size / 2, y: g.size / 2 };
    const left = Math.round(clientX - hs.x);
    const top  = Math.round(clientY - hs.y);
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    el.style.opacity = '1';
    this._touchPointerVisible = true;
  }

  hideTouchPointer() {
    if (!this._touchPointerEl) return;
    this._touchPointerEl.style.opacity = '0';
    this._touchPointerVisible = false;
  }

  _wireSettingsButton() {
    if (!this.elSettingsBtn || !this.elSettingsPanel) return;
    this.elSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = this.elSettingsPanel.classList.toggle('revealed');
      this.elSettingsBtn.classList.toggle('expanded', open);
    });
    // Click anywhere outside the panel + button closes it.
    document.addEventListener('pointerdown', (e) => {
      if (this.elSettingsPanel.contains(e.target)) return;
      if (this.elSettingsBtn.contains(e.target)) return;
      if (this.elSettingsPanel.classList.contains('revealed')) {
        this.elSettingsPanel.classList.remove('revealed');
        this.elSettingsBtn.classList.remove('expanded');
      }
    });
    // Esc closes it too.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elSettingsPanel.classList.contains('revealed')) {
        this.elSettingsPanel.classList.remove('revealed');
        this.elSettingsBtn.classList.remove('expanded');
      }
    });
  }

  _populateGlobalSettings(state) {
    if (!this.elSettingsContent || this._globalSettingsBuilt) return;
    for (const s of GLOBAL_SETTINGS) {
      const { wrap } = this._buildSettingControl(s, state);
      this.elSettingsContent.appendChild(wrap);
    }
    this._appendReloadAction();
    this._globalSettingsBuilt = true;
    // Apply the currently-stored cursor on first build.
    this._applyCursor(state.settings.cursorStyle);
  }

  // Safety net for PWA / iOS standalone where stale caches can persist
  // across deploys. Tapping this clears any registered Cache Storage and
  // service workers, then hard-reloads.
  _appendReloadAction() {
    if (!this.elSettingsContent) return;
    const wrap = document.createElement('div');
    wrap.className = 'setting-row settings-reload-row';
    wrap.style.cssText = 'margin-top: 14px; padding-top: 10px;' +
      ' border-top: 1px solid rgba(184, 164, 255, 0.16);';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-reload-btn';
    btn.textContent = 'Reload Cosmogenesis';
    btn.style.cssText =
      'width: 100%; padding: 8px 10px; background: rgba(184, 164, 255, 0.08);' +
      ' border: 1px solid rgba(184, 164, 255, 0.35); border-radius: 6px;' +
      ' color: rgba(255, 255, 255, 0.88); font-family: inherit; font-size: 12px;' +
      ' letter-spacing: 1.2px; text-transform: uppercase; cursor: pointer;' +
      ' transition: background 0.12s ease, border-color 0.12s ease;';
    btn.addEventListener('pointerenter', () => {
      btn.style.background = 'rgba(184, 164, 255, 0.18)';
      btn.style.borderColor = 'rgba(184, 164, 255, 0.7)';
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.background = 'rgba(184, 164, 255, 0.08)';
      btn.style.borderColor = 'rgba(184, 164, 255, 0.35)';
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Reloading...';
      try {
        if (window.caches && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch (_) { /* best effort; still reload */ }
      // Cache-buster query so iOS Safari fetches a fresh document, then
      // immediately replace history so the URL stays clean afterward.
      const u = new URL(window.location.href);
      u.searchParams.set('_r', String(Date.now()));
      window.location.replace(u.toString());
    });
    const hint = document.createElement('div');
    hint.style.cssText =
      'margin-top: 6px; font-size: 10px; letter-spacing: 0.4px;' +
      ' color: rgba(255, 255, 255, 0.42); font-style: italic; text-align: center;';
    hint.textContent = 'Forces a fresh load if a new version is available.';
    wrap.appendChild(btn);
    wrap.appendChild(hint);
    this.elSettingsContent.appendChild(wrap);
  }

  _wireTooltips() {
    if (!this.elTooltip) return;
    document.querySelectorAll('.info-icon').forEach((icon) => {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleTooltip(icon);
      });
    });
    // Click anywhere else closes the tooltip.
    document.addEventListener('pointerdown', (e) => {
      if (!this.elTooltip.contains(e.target)) this._hideTooltip();
    });
    // Esc also closes it.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._hideTooltip();
    });
    // Reposition on resize while open.
    window.addEventListener('resize', () => {
      if (this._tooltipKey && this._tooltipAnchor) {
        this._positionTooltipForElement(this._tooltipAnchor);
      }
    });
  }

  _toggleTooltip(icon) {
    const key = icon.dataset.info;
    if (!key || !INFO_TOOLTIPS[key]) return;
    const info = INFO_TOOLTIPS[key];
    this._toggleTooltipFor(icon, `info:${key}`, info.title, info.body);
  }

  // Generic tooltip: anchor element + arbitrary content. Used both by the
  // static stat-line info icons (via _toggleTooltip) and by the per-setting
  // info icons in instrument settings drawers.
  _toggleTooltipFor(anchorEl, key, title, body) {
    if (this._tooltipKey === key && this.elTooltip.classList.contains('visible')) {
      this._hideTooltip();
      return;
    }
    const bodyArr = Array.isArray(body) ? body : [body];
    const paras = bodyArr.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
    this.elTooltip.innerHTML =
      `<span class="tip-title">${escapeHtml(title)}</span>${paras}`;
    this._tooltipKey = key;
    this._tooltipAnchor = anchorEl;
    this._positionTooltipForElement(anchorEl);
    this.elTooltip.classList.add('visible');
  }

  _positionTooltipForElement(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this.elTooltip.style.left = '0px';
    this.elTooltip.style.top  = '-9999px';
    const tw = this.elTooltip.offsetWidth;
    const th = this.elTooltip.offsetHeight;
    let left = rect.right + 16;
    let top  = rect.top - 6;
    if (left + tw > window.innerWidth - 12) left = window.innerWidth - tw - 12;
    if (top + th  > window.innerHeight - 12) top  = window.innerHeight - th - 12;
    if (top < 12) top = 12;
    this.elTooltip.style.left = left + 'px';
    this.elTooltip.style.top  = top  + 'px';
  }

  _positionTooltipForKey(key) {
    const icon = document.querySelector(`.info-icon[data-info="${key}"]`);
    this._positionTooltipForElement(icon);
  }

  _hideTooltip() {
    this.elTooltip.classList.remove('visible');
    this._tooltipKey = null;
  }

  hydrateLaws(laws) {
    this.elLaws.innerHTML = '';
    for (const law of laws) this._appendLaw(law);
    this._renderedLawCount = laws.length;
  }

  // Sync items from a definition list into a panel. Appends new entries,
  // removes entries that have become unearned (e.g. Thermal Lens after First
  // Light), reveals the panel on first earned item, refreshes enabled state.
  _syncListPanel(state, definitions, container, panel, nodeMap) {
    let anyEarned = false;
    for (const def of definitions) {
      const isEarned = def.earned(state);
      let li = nodeMap.get(def.id);
      if (!isEarned) {
        // Item is no longer earned (e.g. an instrument that's been retired
        // by a later-era replacement). Remove its DOM node so it stops
        // claiming a slot in the panel.
        if (li) {
          li.remove();
          nodeMap.delete(def.id);
        }
        continue;
      }
      anyEarned = true;
      if (!li) {
        li = this._buildListItem(def, state);
        container.appendChild(li);
        nodeMap.set(def.id, li);
      }
      if (def.toggleable) {
        li.classList.toggle('disabled', !state.isLensEnabled(def.id));
      }
    }
    if (anyEarned && panel && !panel.classList.contains('revealed')) {
      panel.classList.add('revealed');
    }
  }

  _buildListItem(def, state) {
    const li = document.createElement('li');
    li.dataset.lensId = def.id;
    if (def.toggleable) li.classList.add('toggleable');

    const row = document.createElement('span');
    row.className = 'item-row';

    const label = document.createElement('span');
    label.className = 'item-label';
    label.textContent = def.label;
    if (def.toggleable) {
      label.title = 'Click to toggle';
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        state.toggleLens(def.id);
      });
    }
    row.appendChild(label);

    // Themed quick-toggle icon (speaker for audio lens, eye for visual lens).
    // Clicking it toggles the lens, same as clicking the label.
    if (def.icon && INSTRUMENT_ICONS[def.icon] && def.toggleable) {
      const iconBtn = document.createElement('span');
      iconBtn.className = 'instrument-icon';
      iconBtn.innerHTML = INSTRUMENT_ICONS[def.icon];
      iconBtn.title = `Toggle ${def.label}`;
      iconBtn.setAttribute('role', 'button');
      iconBtn.setAttribute('aria-label', `Toggle ${def.label}`);
      iconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.toggleLens(def.id);
      });
      row.appendChild(iconBtn);
    }

    const hasSettings = Array.isArray(def.settings) && def.settings.length > 0;
    if (hasSettings) {
      const gear = document.createElement('button');
      gear.className = 'settings-toggle';
      gear.type = 'button';
      gear.textContent = '\u2699'; // gear glyph
      gear.title = 'Settings';
      gear.setAttribute('aria-label', `Configure ${def.label}`);
      gear.addEventListener('click', (e) => {
        e.stopPropagation();
        li.classList.toggle('expanded');
      });
      row.appendChild(gear);
    }

    li.appendChild(row);

    if (hasSettings) {
      const panel = document.createElement('div');
      panel.className = 'settings-panel';
      const settingApplies = [];
      for (const s of def.settings) {
        const { wrap, apply } = this._buildSettingControl(s, state);
        panel.appendChild(wrap);
        settingApplies.push({ setting: s, apply });
      }

      // Restore-defaults button. Resets every slider for this instrument
      // back to its `default` value defined in INSTRUMENT_DEFINITIONS.
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'settings-reset';
      reset.textContent = 'Restore defaults';
      reset.title = `Reset ${def.label} settings`;
      reset.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const { setting, apply } of settingApplies) {
          if (setting.default !== undefined) apply(setting.default);
        }
        if (state.requestSave) state.requestSave();
      });
      panel.appendChild(reset);

      li.appendChild(panel);
    }

    return li;
  }

  _buildSettingControl(setting, state) {
    const wrap = document.createElement('div');
    wrap.className = 'setting-row';

    const head = document.createElement('span');
    head.className = 'setting-head';

    const lbl = document.createElement('span');
    lbl.className = 'setting-label';
    lbl.textContent = setting.label;

    // Per-setting info icon. Optional, just add a `tooltip` field to any
    // setting definition (string or array of paragraphs) and you get the
    // tappable explainer for free, consistent with the stat-line icons.
    if (setting.tooltip) {
      const info = document.createElement('button');
      info.className = 'info-icon';
      info.type = 'button';
      info.textContent = 'i';
      info.setAttribute('aria-label', `What is ${setting.label}?`);
      info.title = `What is ${setting.label}?`;
      const tipKey = `setting:${setting.key}`;
      info.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleTooltipFor(info, tipKey, setting.label, setting.tooltip);
      });
      info.addEventListener('pointerdown', (e) => e.stopPropagation());
      lbl.appendChild(document.createTextNode(' '));
      lbl.appendChild(info);
    }

    head.appendChild(lbl);

    const valEl = document.createElement('span');
    valEl.className = 'setting-value';
    head.appendChild(valEl);

    wrap.appendChild(head);

    if (setting.type === 'select') {
      return this._buildSelectControl(setting, state, wrap, valEl);
    }
    if (setting.type === 'toggle') {
      return this._buildToggleControl(setting, state, wrap, valEl);
    }
    return this._buildSliderControl(setting, state, wrap, valEl);
  }

  _buildSliderControl(setting, state, wrap, valEl) {
    const fmt = setting.format || ((v) => v.toFixed(2));

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'setting-slider';
    input.min = setting.min;
    input.max = setting.max;
    input.step = setting.step;
    const initialVal = (state.settings && typeof state.settings[setting.key] === 'number')
      ? state.settings[setting.key]
      : (typeof setting.default === 'number' ? setting.default : setting.min);
    input.value = initialVal;
    valEl.textContent = fmt(initialVal);

    const apply = (v) => {
      input.value = v;
      if (state.settings) state.settings[setting.key] = v;
      valEl.textContent = fmt(v);
      if (typeof setting.onChange === 'function') setting.onChange(v, this);
    };

    const stop = (e) => e.stopPropagation();
    input.addEventListener('pointerdown', stop);
    input.addEventListener('click', stop);
    input.addEventListener('input', () => {
      apply(parseFloat(input.value));
      if (state.requestSave) state.requestSave();
    });

    wrap.appendChild(input);
    return { wrap, apply };
  }

  _buildSelectControl(setting, state, wrap, valEl) {
    const select = document.createElement('select');
    select.className = 'setting-select';
    for (const opt of setting.options) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      select.appendChild(optEl);
    }
    const initialVal = (state.settings && state.settings[setting.key] != null)
      ? state.settings[setting.key]
      : setting.default;
    select.value = initialVal;

    const labelFor = (v) => {
      const o = setting.options.find((o) => o.value === v);
      return o ? o.label : String(v);
    };
    valEl.textContent = labelFor(initialVal);

    const apply = (v) => {
      select.value = v;
      if (state.settings) state.settings[setting.key] = v;
      valEl.textContent = labelFor(v);
      if (typeof setting.onChange === 'function') setting.onChange(v, this);
    };

    const stop = (e) => e.stopPropagation();
    select.addEventListener('pointerdown', stop);
    select.addEventListener('click', stop);
    select.addEventListener('change', () => {
      apply(select.value);
      if (state.requestSave) state.requestSave();
    });

    wrap.appendChild(select);
    // Hide the head's value indicator for selects (the select itself shows it).
    valEl.style.display = 'none';
    return { wrap, apply };
  }

  _buildToggleControl(setting, state, wrap, valEl) {
    // iOS-style switch placed inline in the head row so booleans stay compact.
    valEl.style.display = 'none';

    const switchEl = document.createElement('span');
    switchEl.className = 'toggle-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    switchEl.appendChild(input);
    switchEl.appendChild(slider);

    const initialVal = !!(state.settings && state.settings[setting.key]);
    input.checked = initialVal;

    const apply = (v) => {
      input.checked = !!v;
      if (state.settings) state.settings[setting.key] = !!v;
      if (typeof setting.onChange === 'function') setting.onChange(!!v, this);
    };

    const stop = (e) => e.stopPropagation();
    switchEl.addEventListener('pointerdown', stop);
    switchEl.addEventListener('click', (e) => {
      // The row is no longer a <label>, so there's no implicit checkbox
      // toggling. Handle the click explicitly on the visible switch.
      e.stopPropagation();
      apply(!input.checked);
      if (state.requestSave) state.requestSave();
    });
    input.addEventListener('change', () => {
      apply(input.checked);
      if (state.requestSave) state.requestSave();
    });

    const head = wrap.querySelector('.setting-head');
    if (head) head.appendChild(switchEl);
    else wrap.appendChild(switchEl);
    return { wrap, apply };
  }

  // Show/hide/update the macro inspector panel. `data` is null to hide.
  // The inspector is purely read-only; player actions (rename, track) live in
  // the context menu (right-click / long-press).
  // `data` shape: { id, kind, mass, absorbed, age, filaments, screenX, screenY,
  //                 macroRadiusCss, pinned, name, hint? }
  setMacroInspector(data) {
    const el = this.elInspector;
    if (!el) return;

    if (!data) {
      if (this._inspectorVisible) {
        el.removeAttribute('data-visible');
        el.removeAttribute('data-pinned');
        el.removeAttribute('data-kind');
        el.hidden = true;
        this._inspectorVisible = false;
      }
      if (this.elInspectorLeader) {
        this.elInspectorLeader.removeAttribute('data-visible');
        this.elInspectorLeader.hidden = true;
      }
      return;
    }

    const wasHidden = el.hidden;
    if (wasHidden) el.hidden = false;

    const kindLabel = macroKindLabel(data.kind);
    if (this.elInspectorKind && this.elInspectorKind.textContent !== kindLabel) {
      this.elInspectorKind.textContent = kindLabel;
    }
    el.setAttribute('data-kind', data.kind);

    // Names are auto-assigned at creation and can be edited by the player.
    // Always write + show, never just hide, so we can never display a stale
    // value from a previous macro.
    const displayName = (data.name && data.name.length > 0)
      ? data.name
      : macroKindLabel(data.kind);
    if (this.elInspectorName) {
      if (this.elInspectorName.textContent !== displayName) {
        this.elInspectorName.textContent = displayName;
      }
      this.elInspectorName.hidden = false;
    }

    const massStr = Math.round(data.mass).toString();
    if (this.elInspectorMass && this.elInspectorMass.textContent !== massStr) {
      this.elInspectorMass.textContent = massStr;
    }
    const absStr = Math.round(data.absorbed).toString();
    if (this.elInspectorAbs && this.elInspectorAbs.textContent !== absStr) {
      this.elInspectorAbs.textContent = absStr;
    }
    const ageStr = `${Math.round(data.age * YEARS_PER_SECOND)} yr`;
    if (this.elInspectorAge && this.elInspectorAge.textContent !== ageStr) {
      this.elInspectorAge.textContent = ageStr;
    }
    if (this.elInspectorFilRow) {
      if (data.filaments > 0) {
        this.elInspectorFilRow.hidden = false;
        const filStr = data.filaments.toString();
        if (this.elInspectorFil && this.elInspectorFil.textContent !== filStr) {
          this.elInspectorFil.textContent = filStr;
        }
      } else {
        this.elInspectorFilRow.hidden = true;
      }
    }
    if (this.elInspectorHint) {
      if (data.hint) {
        if (this.elInspectorHint.textContent !== data.hint) {
          this.elInspectorHint.textContent = data.hint;
        }
        this.elInspectorHint.hidden = false;
      } else {
        this.elInspectorHint.hidden = true;
      }
    }

    if (data.pinned) el.setAttribute('data-pinned', '1');
    else el.removeAttribute('data-pinned');

    el.dataset.macroId = data.id != null ? String(data.id) : '';

    this._positionInspector(data, wasHidden);

    if (!this._inspectorVisible) {
      requestAnimationFrame(() => {
        if (!el.hidden) el.setAttribute('data-visible', '1');
      });
      this._inspectorVisible = true;
    }
  }

  _positionInspector(data, wasHidden = false) {
    const el = this.elInspector;
    if (!el) return;
    if (wasHidden || this._inspectorWidth === 0) {
      const rect = el.getBoundingClientRect();
      this._inspectorWidth  = rect.width;
      this._inspectorHeight = rect.height;
    }

    const w = this._inspectorWidth;
    const h = this._inspectorHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;
    const macroR = data.macroRadiusCss || 12;
    // Real breathing room — never butt up against the body.
    const gap = Math.max(32, macroR + 28);
    const diagGap = gap * 0.72;
    const mx = data.screenX;
    const my = data.screenY;

    // Candidate anchors around the macro. Order is preference on ties.
    const candidates = [
      { x: mx + gap,                y: my - h / 2,             dir: 'right',  bias: 3 },
      { x: mx - gap - w,            y: my - h / 2,             dir: 'left',   bias: 2 },
      { x: mx - w / 2,              y: my - gap - h,           dir: 'top',    bias: 1 },
      { x: mx - w / 2,              y: my + gap,               dir: 'bottom', bias: 1 },
      { x: mx + diagGap,            y: my - diagGap - h,       dir: 'tr',     bias: 0 },
      { x: mx + diagGap,            y: my + diagGap,           dir: 'br',     bias: 0 },
      { x: mx - diagGap - w,        y: my - diagGap - h,       dir: 'tl',     bias: 0 },
      { x: mx - diagGap - w,        y: my + diagGap,           dir: 'bl',     bias: 0 },
    ];

    const avoid = this._collectInspectorAvoidRects();
    const area = Math.max(1, w * h);
    let best = null;

    for (const c of candidates) {
      const clampedX = Math.max(pad, Math.min(vw - pad - w, c.x));
      const clampedY = Math.max(pad, Math.min(vh - pad - h, c.y));
      const shiftX = Math.abs(clampedX - c.x);
      const shiftY = Math.abs(clampedY - c.y);
      const rect = {
        left:   clampedX,
        top:    clampedY,
        right:  clampedX + w,
        bottom: clampedY + h,
      };

      let score = 100 + c.bias;
      // Penalty for needing to clamp away from the natural anchor.
      score -= (shiftX + shiftY) * 0.25;

      // Penalty for overlapping any visible UI rect (HUD panels, chrome buttons).
      let overlap = 0;
      for (const ar of avoid) {
        const ox = Math.max(0, Math.min(rect.right, ar.right) - Math.max(rect.left, ar.left));
        const oy = Math.max(0, Math.min(rect.bottom, ar.bottom) - Math.max(rect.top, ar.top));
        overlap += ox * oy;
      }
      score -= (overlap / area) * 600;

      // Penalty for sitting on top of the macro (closest panel-edge point to body).
      const px = Math.max(rect.left, Math.min(rect.right, mx));
      const py = Math.max(rect.top,  Math.min(rect.bottom, my));
      const distToMacro = Math.hypot(px - mx, py - my);
      const minDist = macroR + 16;
      if (distToMacro < minDist) score -= (minDist - distToMacro) * 4;

      if (!best || score > best.score) {
        best = { x: clampedX, y: clampedY, score, dir: c.dir };
      }
    }

    const finalX = best ? best.x : Math.max(pad, Math.min(vw - pad - w, mx + gap));
    const finalY = best ? best.y : Math.max(pad, Math.min(vh - pad - h, my - h / 2));

    el.style.transform = `translate3d(${Math.round(finalX)}px, ${Math.round(finalY)}px, 0)`;
    this._positionInspectorLeader(data, finalX, finalY);
  }

  // Returns viewport-space rects for any on-screen UI we should not occlude.
  // Recomputed each call: rects change with HUD toggles, viewport size, and
  // panel collapses. Cost is small (a handful of getBoundingClientRect calls).
  _collectInspectorAvoidRects() {
    if (!this._inspectorAvoidIds) {
      this._inspectorAvoidIds = [
        'hud-left',           // era / stats column
        'hud-top-right',      // laws + catalog column
        'hud-bottom',         // hint strip
        'hud-catalog',        // catalog panel (when broken out)
        'settings-panel',     // open settings drawer
        'settings-btn',
        'mute-btn',
        'reset-btn',
        'recenter-btn',
        'discovery-banner',
        'macro-context-menu',
        'info-tooltip',
      ];
    }
    const out = [];
    for (const id of this._inspectorAvoidIds) {
      const el = document.getElementById(id);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.push(r);
    }
    return out;
  }

  _positionInspectorLeader(data, panelX, panelY) {
    const leader = this.elInspectorLeader;
    const line = this.elInspectorLeaderLine;
    if (!leader || !line) return;

    // Only draw a leader line when the inspector was opened from the catalog.
    // Hover and tap selection from the viewport don't need it — the cursor /
    // finger already makes the link obvious.
    const w = this._inspectorWidth;
    const h = this._inspectorHeight;
    if (data.source !== 'catalog' || w <= 0 || h <= 0) {
      leader.removeAttribute('data-visible');
      leader.hidden = true;
      return;
    }

    const left = panelX, right = panelX + w;
    const top = panelY, bottom = panelY + h;
    const mx = data.screenX, my = data.screenY;
    const macroR = data.macroRadiusCss || 12;

    // Enter the panel horizontally on whichever side is closer to the macro.
    // Pick a top- or bottom-corner entry (not the mid-edge) so the angled
    // segment is always visibly slanted — entering at the vertical midpoint
    // would produce a flat horizontal line whenever the panel sits beside the
    // macro at the same height.
    const enterRight = mx < (left + right) / 2;
    const anchorX = enterRight ? left : right;
    const cornerOffset = 24;
    let anchorY;
    if (my <= top + cornerOffset + 2) {
      // Macro is at or above the panel — enter near the bottom corner so the
      // angled run still slopes down from the body.
      anchorY = bottom - cornerOffset;
    } else {
      // Default: enter near the top corner; line angles up from the macro.
      anchorY = top + cornerOffset;
    }

    // Horizontal segment: a short run into the panel. Length scales with the
    // horizontal gap so close panels don't get a huge stub.
    const horizGap = Math.abs(anchorX - mx);
    const horizLen = Math.max(18, Math.min(56, horizGap * 0.45));
    const sign = enterRight ? -1 : 1; // direction from anchor back toward macro
    const elbowX = anchorX + sign * horizLen;
    const elbowY = anchorY;

    // Start point: the macro's center — the line reads as emanating from the
    // body itself rather than tangent to its outer glow.
    const dxe = elbowX - mx;
    const dye = elbowY - my;
    const distToElbow = Math.hypot(dxe, dye);
    if (distToElbow < macroR + 8) {
      leader.removeAttribute('data-visible');
      leader.hidden = true;
      return;
    }
    const sx = mx;
    const sy = my;

    const fmt = (n) => n.toFixed(1);
    line.setAttribute(
      'points',
      `${fmt(sx)},${fmt(sy)} ${fmt(elbowX)},${fmt(elbowY)} ${fmt(anchorX)},${fmt(anchorY)}`
    );

    leader.hidden = false;
    if (leader.getAttribute('data-visible') !== '1') {
      requestAnimationFrame(() => {
        if (!leader.hidden) leader.setAttribute('data-visible', '1');
      });
    }
  }

  // ---- Context menu (right-click / long-press) ----

  _wireContextMenu() {
    const menu = this.elContextMenu;
    if (!menu) return;

    // Clicks inside the menu must not bubble to the canvas, or the canvas
    // would treat them as taps and spawn.
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.addEventListener('contextmenu', (e) => e.preventDefault());

    if (this.elContextMenuActions) {
      this.elContextMenuActions.addEventListener('click', (e) => {
        const btn = e.target.closest('.mcm-item');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'rename') this._enterRenameMode();
        else if (action === 'track') this._toggleTrackFromMenu();
        else if (action === 'emitter-toggle') {
          const emitterId = this._contextMenuEmitterId;
          if (this._contextMenuTargetType === 'emitter' && typeof this.onEmitterPauseToggle === 'function' && emitterId != null) {
            this.onEmitterPauseToggle(emitterId);
          }
          this.hideContextMenu();
        } else if (action === 'emitter-remove') {
          const emitterId = this._contextMenuEmitterId;
          if (this._contextMenuTargetType === 'emitter' && typeof this.onEmitterRemove === 'function' && emitterId != null) {
            this.onEmitterRemove(emitterId);
          }
          this.hideContextMenu();
        }
      });
    }

    if (this.elContextMenuInput) {
      this.elContextMenuInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._commitRename();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.hideContextMenu();
        }
      });
      // Form submit also commits (mobile keyboard "go" button).
      const form = this.elContextMenuRename;
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          this._commitRename();
        });
      }
    }

    // Global dismiss: any pointerdown outside the menu closes it AND
    // suppresses the underlying canvas event (so closing the menu doesn't
    // also spawn a particle).
    document.addEventListener('pointerdown', (e) => {
      if (!this._contextMenuOpen) return;
      if (menu.contains(e.target)) return;
      this.hideContextMenu();
      e.stopPropagation();
      e.preventDefault();
    }, true); // capture phase so we run before canvas handlers

    // Escape closes from anywhere.
    document.addEventListener('keydown', (e) => {
      if (!this._contextMenuOpen) return;
      if (e.key === 'Escape') this.hideContextMenu();
    });
  }

  _applyContextMenuTargetVisibility() {
    const targetType = this._contextMenuTargetType || 'macro';
    for (const item of this._contextMenuItems) {
      const itemTarget = item.dataset.target || 'macro';
      item.hidden = itemTarget !== targetType;
    }
  }

  showContextMenu(opts) {
    const menu = this.elContextMenu;
    if (!menu || !opts) return;

    const targetType = opts.targetType === 'emitter' ? 'emitter' : 'macro';
    this._contextMenuTargetType = targetType;
    this._contextMenuMacroId = targetType === 'macro' ? opts.macroId : null;
    this._contextMenuEmitterId = targetType === 'emitter' ? opts.emitterId : null;
    this._contextMenuMacroName = targetType === 'macro' ? (opts.name || '') : '';
    this._contextMenuMacroKind = targetType === 'macro' ? (opts.kind || 'structure') : 'emitter';
    this._contextMenuOpen = true;
    this._contextMenuMode = 'actions';

    menu.setAttribute('data-kind', targetType === 'macro' ? (opts.kind || 'structure') : 'emitter');
    menu.setAttribute('data-tracked', targetType === 'macro' && opts.tracked ? '1' : '0');
    menu.setAttribute('data-target-type', targetType);

    if (this.elContextMenuTitle) {
      const title = targetType === 'emitter'
        ? (opts.title || 'Emitter')
        : (opts.name && opts.name.length ? opts.name : macroKindLabel(opts.kind));
      if (this.elContextMenuTitle.textContent !== title) {
        this.elContextMenuTitle.textContent = title;
      }
    }
    if (this.elContextMenuTrackLabel) {
      this.elContextMenuTrackLabel.textContent = opts.tracked ? 'Untrack' : 'Track';
    }
    if (this.elContextMenuTrackGlyph) {
      this.elContextMenuTrackGlyph.textContent = opts.tracked ? '★' : '☆';
    }

    this._applyContextMenuTargetVisibility();
    if (targetType === 'emitter') this._applyEmitterContextMenuState(opts);

    // Start in actions mode (not rename) on every show.
    if (this.elContextMenuActions) this.elContextMenuActions.hidden = false;
    if (this.elContextMenuRename) this.elContextMenuRename.hidden = true;

    menu.hidden = false;
    this._contextMenuLastX = opts.screenX;
    this._contextMenuLastY = opts.screenY;
    this._contextMenuAnchorMode = opts.anchorMode || 'corner';
    // Snap to the new position with no transition first, otherwise the
    // leftover inline transform from the previous open would visibly fly
    // across the screen to the new touch point.
    menu.style.transition = 'none';
    this._positionContextMenu(opts.screenX, opts.screenY);
    // Force layout so the snap is committed before we re-enable transitions.
    void menu.offsetWidth;
    if (this._contextMenuAnchorMode === 'right') {
      menu.style.transition =
        'opacity 200ms cubic-bezier(0.22, 1.4, 0.36, 1),' +
        ' transform 220ms cubic-bezier(0.22, 1.4, 0.36, 1)';
    } else {
      menu.style.transition = '';
      menu.style.transformOrigin = '';
    }
    requestAnimationFrame(() => {
      if (!menu.hidden) {
        menu.setAttribute('data-visible', '1');
        // Re-apply the position now that visible scale is 1.
        this._positionContextMenu(this._contextMenuLastX, this._contextMenuLastY);
        // Once the entrance animation completes, disable the transform
        // transition so subsequent reflows (rename mode, iOS focus scroll,
        // etc.) don't make the menu visibly slide.
        if (this._contextMenuAnchorMode === 'right') {
          setTimeout(() => {
            if (this._contextMenuOpen) {
              menu.style.transition = 'opacity 160ms ease';
            }
          }, 260);
        }
      }
    });
  }

  showMacroContextMenu(opts) {
    this.showContextMenu({ ...opts, targetType: 'macro' });
  }

  showEmitterContextMenu(opts) {
    this.showContextMenu({ ...opts, targetType: 'emitter' });
  }

  hideContextMenu() {
    const menu = this.elContextMenu;
    if (!menu || !this._contextMenuOpen) return;
    this._contextMenuOpen = false;
    this._contextMenuTargetType = 'macro';
    this._contextMenuMacroId = null;
    this._contextMenuEmitterId = null;
    this._contextMenuMode = 'actions';
    menu.removeAttribute('data-visible');
    menu.hidden = true;
    if (this.elContextMenuInput) {
      this.elContextMenuInput.value = '';
      this.elContextMenuInput.blur();
    }
  }

  hideMacroContextMenu() { this.hideContextMenu(); }

  isContextMenuOpen() { return this._contextMenuOpen; }

  _positionContextMenu(sx, sy) {
    const menu = this.elContextMenu;
    if (!menu) return;
    // Use offsetWidth/Height (layout box) instead of getBoundingClientRect
    // (visual box), so our position math doesn't drift with the entrance
    // scale transform.
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;
    const mode = this._contextMenuAnchorMode || 'corner';
    let x, y;
    let flippedLeft = false;
    if (mode === 'right') {
      // Touch-friendly: place to the right of the finger, vertically centered,
      // so the menu isn't hidden under the user's hand. Flip to the left if
      // there isn't room on the right.
      const gap = 22;
      x = sx + gap;
      y = sy - h / 2;
      if (x + w > vw - pad) { x = sx - gap - w; flippedLeft = true; }
    } else {
      x = sx;
      y = sy;
    }
    if (x + w > vw - pad) x = vw - pad - w;
    if (x < pad) x = pad;
    if (y + h > vh - pad) y = vh - pad - h;
    if (y < pad) y = pad;
    // Anchor the entrance animation: in touch mode the menu grows out of the
    // edge nearest the finger so the reveal reads as a direct response to the
    // press; in corner mode we keep the original top-left origin.
    if (mode === 'right') {
      const originY = Math.max(0, Math.min(h, sy - y));
      menu.style.transformOrigin = `${flippedLeft ? '100%' : '0%'} ${originY}px`;
    } else {
      menu.style.transformOrigin = 'top left';
    }
    // Preserve the open-scale transform so the entrance animation reads.
    const visible = menu.getAttribute('data-visible') === '1';
    const startScale = mode === 'right' ? 0.82 : 0.96;
    const scale = visible ? 1 : startScale;
    menu.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) scale(${scale})`;
    this._contextMenuAnchorResolved = { x: Math.round(x), y: Math.round(y) };
  }

  _enterRenameMode() {
    if (!this.elContextMenu || this._contextMenuTargetType !== 'macro') return;
    this._contextMenuMode = 'rename';
    if (this.elContextMenuActions) this.elContextMenuActions.hidden = true;
    if (this.elContextMenuRename) this.elContextMenuRename.hidden = false;
    if (this.elContextMenuInput) {
      // Pre-fill with the name we opened the menu for (stashed from opts),
      // never from the inspector DOM. The inspector might be showing a
      // different macro by the time the menu is interacted with.
      this.elContextMenuInput.value = this._contextMenuMacroName || '';
      requestAnimationFrame(() => {
        try {
          this.elContextMenuInput.focus();
          this.elContextMenuInput.select();
        } catch (_) { /* ignore */ }
      });
    }
    // Re-measure + reposition: rename mode usually changes height.
    if (this._contextMenuLastX != null) {
      this._positionContextMenu(this._contextMenuLastX, this._contextMenuLastY);
    }
  }

  _commitRename() {
    const id = this._contextMenuMacroId;
    const value = this.elContextMenuInput ? this.elContextMenuInput.value : '';
    if (this._contextMenuTargetType === 'macro' && typeof this.onMacroRename === 'function' && id != null) {
      this.onMacroRename(id, value);
    }
    this.hideContextMenu();
  }

  _toggleTrackFromMenu() {
    const id = this._contextMenuMacroId;
    if (this._contextMenuTargetType !== 'macro' || id == null) return;
    const menu = this.elContextMenu;
    const nextTracked = !(menu.getAttribute('data-tracked') === '1');
    if (typeof this.onMacroTrackToggle === 'function') {
      this.onMacroTrackToggle(id, nextTracked);
    }
    this.hideContextMenu();
  }

  _applyEmitterContextMenuState(opts = null) {
    const emitterId = this._contextMenuEmitterId;
    const emitterCtx = (typeof this.getEmitterMenuContext === 'function' && emitterId != null)
      ? this.getEmitterMenuContext(emitterId)
      : null;
    const paused = !!(emitterCtx?.paused ?? opts?.paused);

    if (this.elContextMenuEmitterToggleLabel) {
      this.elContextMenuEmitterToggleLabel.textContent = paused ? 'Resume Emitter' : 'Pause Emitter';
    }
    if (this.elContextMenuEmitterToggleGlyph) {
      this.elContextMenuEmitterToggleGlyph.textContent = paused ? '▶' : '⏸';
    }
  }

  refreshContextMenuForMacro(macroId) {
    if (!this._contextMenuOpen || this._contextMenuTargetType !== 'macro' || this._contextMenuMacroId !== macroId) return;
    if (this._contextMenuLastX != null) {
      this._positionContextMenu(this._contextMenuLastX, this._contextMenuLastY);
    }
  }

  refreshContextMenuForEmitter(emitterId) {
    if (!this._contextMenuOpen || this._contextMenuTargetType !== 'emitter' || this._contextMenuEmitterId !== emitterId) return;
    this._applyEmitterContextMenuState();
    if (this._contextMenuLastX != null) {
      this._positionContextMenu(this._contextMenuLastX, this._contextMenuLastY);
    }
  }

  updateTools() {
    const ctx = (typeof this.getToolsContext === 'function') ? this.getToolsContext() : null;
    const eraIndex = ctx?.eraIndex ?? 0;
    const eraGate = ctx?.eraGate ?? 3;
    const deployCost = ctx?.deployCost ?? 0;
    const canAfford = !!ctx?.canAfford;
    const placementActive = !!ctx?.placementActive;
    const activeCount = ctx?.activeCount ?? 0;
    const deployedCount = ctx?.deployedCount ?? 0;
    const pausedCount = Math.max(0, deployedCount - activeCount);
    const throughputPerSec = ctx?.throughputPerSec ?? 0;
    const toolsUnlocked = eraIndex >= eraGate;

    if (this.elInstrumentsTools) this.elInstrumentsTools.hidden = !toolsUnlocked;
    if (this.elEmitterDeployBtn) {
      this.elEmitterDeployBtn.disabled = !canAfford;
      this.elEmitterDeployBtn.setAttribute('aria-pressed', placementActive ? 'true' : 'false');
    }
    if (this.elEmitterDeployCost) {
      this.elEmitterDeployCost.textContent = `${fmt(deployCost)} Potential`;
    }
    if (this.elEmitterReadout) {
      this.elEmitterReadout.textContent = deployedCount <= 0
        ? 'Emitters: 0 placed'
        : `Emitters: ${activeCount} active${pausedCount > 0 ? ` · ${pausedCount} paused` : ''} · +${throughputPerSec.toFixed(1)} Potential/sec`;
    }
  }

  // Build / refresh the Catalog panel. Lists every macro with `tracked=true`.
  // Each entry shows the player-given name (or a "Kind #id" fallback), a
  // subtitle with kind + current mass, and click-pins the inspector to it.
  // Re-uses DOM nodes between frames so it's cheap to call every frame.
  renderCatalog(sim, pinnedId, cradleThreshold) {
    if (!this.elCatalogList || !this.elCatalogPanel || !sim) return;

    const tracked = [];
    for (const m of sim.macros) if (m.tracked) tracked.push(m);

    // Hide the whole panel until the player tracks something. Keeps the HUD
    // clean for new players.
    const want = tracked.length > 0;
    if (this.elCatalogPanel.hidden !== !want) this.elCatalogPanel.hidden = !want;
    if (!want) {
      if (this._catalogNodes.size) {
        this.elCatalogList.innerHTML = '';
        this._catalogNodes.clear();
        if (this._catalogExpanded) this._catalogExpanded.clear();
      }
      return;
    }

    if (!this._catalogExpanded) this._catalogExpanded = new Set();

    // Sort: cradles first (rarer/more meaningful), then by mass desc.
    tracked.sort((a, b) => {
      const ka = a.mass >= cradleThreshold ? 1 : 0;
      const kb = b.mass >= cradleThreshold ? 1 : 0;
      if (ka !== kb) return kb - ka;
      return b.mass - a.mass;
    });

    const seen = new Set();
    let prevNode = null;
    for (const m of tracked) {
      seen.add(m.id);
      let entry = this._catalogNodes.get(m.id);
      if (!entry) {
        entry = this._buildCatalogEntry(m.id);
        this._catalogNodes.set(m.id, entry);
      }
      const { li, titleEl, subEl, timelineEl } = entry;

      const kind = m.kind || (m.mass >= cradleThreshold ? 'cradle' : 'structure');
      if (li.dataset.kind !== kind) li.dataset.kind = kind;
      li.classList.toggle('is-star', kind === 'star');
      const isPinned = (pinnedId != null && pinnedId === m.id);
      li.classList.toggle('is-pinned', isPinned);

      const titleText = m.name && m.name.length
        ? m.name
        : macroKindLabel(kind);
      if (titleEl.textContent !== titleText) titleEl.textContent = titleText;

      const kindLabel = macroKindLabel(kind);
      const massStr = fmt(Math.round(m.mass));
      const subText = `${kindLabel} \u00b7 ${massStr} mass`;
      if (subEl.textContent !== subText) subEl.textContent = subText;

      const expanded = this._catalogExpanded.has(m.id);
      li.classList.toggle('is-expanded', expanded);
      // Only re-render the timeline when expanded (when collapsed the CSS
      // hides it via .is-expanded, so its contents don't matter).
      if (expanded) {
        this._renderTimelineInto(timelineEl, m);
      }

      // Maintain sort order in the DOM.
      const nextSibling = prevNode ? prevNode.nextSibling : this.elCatalogList.firstChild;
      if (li !== nextSibling) {
        this.elCatalogList.insertBefore(li, nextSibling);
      }
      prevNode = li;
    }

    // Remove entries (and their expanded state) for macros that are no
    // longer tracked or no longer exist.
    for (const [id, entry] of this._catalogNodes) {
      if (!seen.has(id)) {
        entry.li.remove();
        this._catalogNodes.delete(id);
        this._catalogExpanded.delete(id);
      }
    }
  }

  _buildCatalogEntry(macroId) {
    const li = document.createElement('li');
    li.dataset.macroId = String(macroId);

    const rowMain = document.createElement('div');
    rowMain.className = 'cat-row-main';

    const titles = document.createElement('div');
    titles.className = 'cat-titles';

    const titleEl = document.createElement('span');
    titleEl.className = 'cat-title';
    const subEl = document.createElement('span');
    subEl.className = 'cat-sub';
    titles.appendChild(titleEl);
    titles.appendChild(subEl);

    const chevron = document.createElement('button');
    chevron.type = 'button';
    chevron.className = 'cat-chevron';
    chevron.setAttribute('aria-label', 'Toggle history');
    chevron.textContent = '\u25B8'; // ▸

    rowMain.appendChild(titles);
    rowMain.appendChild(chevron);

    const timelineEl = document.createElement('div');
    timelineEl.className = 'cat-timeline';

    li.appendChild(rowMain);
    li.appendChild(timelineEl);

    // Click on titles (or anywhere not the chevron) pins the inspector.
    titles.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof this.onCatalogEntryClick === 'function') {
        this.onCatalogEntryClick(macroId);
      }
    });
    // Chevron toggles the expanded state without pinning.
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this._catalogExpanded) this._catalogExpanded = new Set();
      if (this._catalogExpanded.has(macroId)) this._catalogExpanded.delete(macroId);
      else this._catalogExpanded.add(macroId);
    });

    return { li, titleEl, subEl, timelineEl };
  }

  _renderTimelineInto(container, m) {
    // Cheap diff: if we already rendered this length, only the last events
    // could be new. Compare child count and event count; if they match, do
    // nothing this frame. (Mass / years in earlier events are immutable.)
    const events = Array.isArray(m.history) ? m.history : [];
    if (container.childElementCount === events.length &&
        container.dataset.macroId === String(m.id)) {
      return;
    }
    container.dataset.macroId = String(m.id);
    container.innerHTML = '';
    for (const ev of events) {
      const row = document.createElement('div');
      row.className = 'cat-event';
      row.setAttribute('data-kind', ev.kind);

      const yearEl = document.createElement('span');
      yearEl.className = 'cat-event-year';
      const year = Math.max(0, Math.floor((ev.atS || 0) * YEARS_PER_SECOND));
      yearEl.textContent = `Year ${year.toLocaleString()}`;

      const labelEl = document.createElement('span');
      labelEl.className = 'cat-event-label';
      if (ev.kind === 'absorbed') {
        this._fillAbsorbedLabel(labelEl, ev);
      } else {
        labelEl.textContent = this._labelForHistoryEvent(ev);
      }

      row.appendChild(yearEl);
      row.appendChild(labelEl);
      container.appendChild(row);
    }
  }

  // Build the absorbed label as structured DOM so we can interleave a small
  // tombstone glyph after the absorbed body's name.
  _fillAbsorbedLabel(labelEl, ev) {
    const mass = (typeof ev.mass === 'number') ? Math.round(ev.mass) : 0;
    const target = ev.targetName || 'an unnamed body';
    labelEl.appendChild(document.createTextNode('Absorbed '));

    const nameSpan = document.createElement('span');
    nameSpan.className = 'cat-event-name';
    nameSpan.textContent = target;
    labelEl.appendChild(nameSpan);

    const tomb = document.createElement('span');
    tomb.className = 'cat-event-tombstone';
    tomb.setAttribute('aria-label', 'absorbed');
    tomb.setAttribute('title', `${target} was absorbed`);
    tomb.innerHTML = TOMBSTONE_SVG;
    labelEl.appendChild(tomb);

    labelEl.appendChild(document.createTextNode(` (+${mass} mass)`));
  }

  _labelForHistoryEvent(ev) {
    const mass = (typeof ev.mass === 'number') ? Math.round(ev.mass) : 0;
    if (ev.kind === 'born') {
      return `Coalesced as Structure (mass ${mass})`;
    }
    if (ev.kind === 'born-cradle') {
      return `Coalesced as Cradle (mass ${mass})`;
    }
    if (ev.kind === 'cradle') {
      return `Crossed Cradle threshold (mass ${mass})`;
    }
    if (ev.kind === 'ignited') {
      return ev.prevName
        ? `Ignited as Star — was ${ev.prevName}`
        : 'Ignited as Star';
    }
    if (ev.kind === 'absorbed') {
      const target = ev.targetName || 'an unnamed body';
      return `Absorbed ${target} (+${mass} mass)`;
    }
    return 'Event';
  }

  render(state) {
    // Cache state so async handlers (era info icon click, etc.) can read
    // the current era without us having to pass state into every closure.
    this._lastState = state;
    this._stateRef  = state;

    const era = state.currentEra();
    if (this.elEra.textContent !== era.name) this.elEra.textContent = era.name;
    if (this.elYear) {
      const yearStr = (state.cosmicYear || 0).toLocaleString();
      if (this.elYear.textContent !== yearStr) this.elYear.textContent = yearStr;
    }
    if (this.elHint.textContent !== era.hint) this.elHint.textContent = era.hint;

    const lens = state.lensLabel();
    if (this.elLens.textContent !== lens) this.elLens.textContent = lens;
    this.elLens.classList.toggle('visible', lens.includes('Visible'));
    // When no lens is enabled, dim the whole LENS row so the player gets
    // immediate feedback that they have intentionally turned everything off.
    if (this.elLensLine) {
      this.elLensLine.classList.toggle('inactive', !lens);
    }

    this.elPot.textContent = fmt(state.potential);
    this.elMat.textContent = fmt(Math.floor(state.matter));
    this.elStr.textContent = fmt(state.structures);
    if (this.elCradles)   this.elCradles.textContent   = fmt(state.cradles || 0);
    if (this.elFilaments) this.elFilaments.textContent = fmt(state.filaments || 0);

    // Conditional row reveals: each new metric fades in the first time it
    // becomes meaningful (> 0). Once revealed, stays present even if the
    // value drops back to zero later.
    const conditionals = [
      { el: this.elStrRow,  value: state.structures },
      { el: this.elCradRow, value: state.cradles },
      { el: this.elFilRow,  value: state.filaments }
    ];
    for (const c of conditionals) {
      if (c.el && c.value > 0 && !c.el.classList.contains('revealed')) {
        c.el.classList.add('revealed');
      }
    }

    while (this._renderedLawCount < state.laws.length) {
      this._appendLaw(state.laws[this._renderedLawCount]);
      this._renderedLawCount++;
    }

    // Sync both side panels (Unlocks above, Instruments below)
    this._syncListPanel(state, UNLOCK_DEFINITIONS, this.elUnlocks, this.elUnlocksPanel, this._unlockNodes);
    this._syncListPanel(state, INSTRUMENT_DEFINITIONS, this.elInstruments, this.elInstrumentsPanel, this._instrumentNodes);
    this.updateTools();

    // Build global settings panel content on first render (state is now loaded)
    if (!this._globalSettingsBuilt) this._populateGlobalSettings(state);

    // Discovery banner (one at a time). For most eras, fire as soon as the
    // era advances. First Light is the exception: the ignition cinematic
    // (visible-spectrum reveal scan + flash + expanding rings) needs ~3s to
    // fully read on its own. The banner appears as a quiet capstone after
    // that, so the player isn't trying to read text during the most
    // dramatic visual moment in the game.
    if (!this._bannerLock && state.pendingDiscoveries.length) {
      const era = state.pendingDiscoveries.shift();
      const concurrent = !!state.pendingWhisper || this._whisperLock;
      const delayMs = (era && era.name === 'First Light') ? 3200 : 0;
      if (delayMs > 0) {
        this._bannerLock = true; // claim the slot now so we don't double-pop
        setTimeout(() => {
          this._bannerLock = false; // _showBanner will re-claim
          this._showBanner(era, concurrent);
        }, delayMs);
      } else {
        this._showBanner(era, concurrent);
      }
    }

    // Whisper (one at a time, distinct from banners)
    if (!this._whisperLock && state.pendingWhisper) {
      const w = state.pendingWhisper;
      state.pendingWhisper = null;
      this._showWhisper(w, state);
    }

    // Lens reveal lifecycle (fresh universe: handled in _showWhisper for
    // opening-radio; resumed universe: reveal HUD line instantly).
    if (!this._lensRevealed && state.seenWhispers &&
        (state.seenWhispers.has('opening-radio') || state.seenWhispers.has('opening-thermal'))) {
      this._revealLensInstant(state);
    }
  }

  _appendLaw(law) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.className = 'law-text';
    text.textContent = `"${law}"`;
    li.appendChild(text);

    // Attach info icon if this law has a tooltip (defined per-era in eras.js).
    const era = LAW_TO_ERA.get(law);
    if (era && era.lawTooltip) {
      const info = document.createElement('button');
      info.className = 'info-icon';
      info.type = 'button';
      info.textContent = 'i';
      info.title = `About this law`;
      info.setAttribute('aria-label', `About this law`);
      info.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleTooltipFor(info, `law:${era.name}`, era.name, era.lawTooltip);
      });
      info.addEventListener('pointerdown', (e) => e.stopPropagation());
      li.appendChild(document.createTextNode(' '));
      li.appendChild(info);
    }

    this.elLaws.appendChild(li);
  }

  _showBanner(era, concurrentWhisper) {
    this._bannerLock = true;
    this.elBanner.innerHTML =
      `<span class="title">A New Era</span>` +
      `<div class="era-title">${escapeHtml(era.name)}</div>` +
      `<div class="law">"${escapeHtml(era.law)}"</div>`;
    void this.elBanner.offsetWidth;
    this.elBanner.classList.add('show');

    // Era discoveries are headline moments. Generous base dwell, extended
    // further when a whisper is overlapping so neither feels rushed.
    const baseHoldMs    = 7000;
    const concurrentExtraMs = concurrentWhisper ? 3500 : 0;
    const holdMs = baseHoldMs + concurrentExtraMs;

    setTimeout(() => {
      this.elBanner.classList.remove('show');
      setTimeout(() => { this._bannerLock = false; }, 800);
    }, holdMs);
  }

  _showWhisper(whisper, state) {
    this._whisperLock = true;
    this.elWhisper.textContent = whisper.message;
    void this.elWhisper.offsetWidth;
    this.elWhisper.classList.add('show');

    let highlightEl = null;
    if (whisper.highlight) highlightEl = document.getElementById(whisper.highlight);

    // Lens-reveal whispers trigger their respective lens activation 1.4s into
    // the whisper, synchronized with the HUD lens-line reveal/update.
    if (whisper.id === 'opening-radio') {
      if (this.elLensLine && !this._lensRevealed) this._lensRevealed = true;
      setTimeout(() => {
        if (this.elLensLine) this.elLensLine.classList.add('revealed');
        if (state) state.radioLensActive = true;
        if (highlightEl) highlightEl.classList.add('whisper-attention');
      }, 1400);
    } else if (whisper.id === 'opening-thermal') {
      setTimeout(() => {
        if (state) state.lensVisuallyActive = true;
        if (highlightEl) highlightEl.classList.add('whisper-attention');
      }, 1400);
    } else if (highlightEl) {
      highlightEl.classList.add('whisper-attention');
    }

    // Base hold is generous to let the player actually read the line. If an
    // era-discovery banner is on screen, extend further so the whisper has
    // unobstructed time after the banner clears.
    const baseHoldMs   = 12000;
    const bannerExtraMs = this._bannerLock ? 3500 : 0;
    const holdMs = baseHoldMs + bannerExtraMs;

    setTimeout(() => {
      this.elWhisper.classList.remove('show');
      if (highlightEl) highlightEl.classList.remove('whisper-attention');
      setTimeout(() => {
        this.elWhisper.textContent = '';
        this._whisperLock = false;
      }, 2400);
    }, holdMs);
  }

  _revealLensInstant(state) {
    if (!this.elLensLine) return;
    this._lensRevealed = true;
    const prev = this.elLensLine.style.transition;
    this.elLensLine.style.transition = 'none';
    this.elLensLine.classList.add('revealed');
    requestAnimationFrame(() => {
      this.elLensLine.style.transition = prev;
    });
  }
}

function fmt(n) {
  if (n < 1000)  return String(n);
  if (n < 1e6)   return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  if (n < 1e9)   return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
