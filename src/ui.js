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
      'Mass is conserved when particles merge, but the cosmos can only carry so much at once. The oldest, smallest things dissipate to make room for the new. A kind of entropy you can watch happen.'
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
  </svg>`
};

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
    earned: (state) => state.eraIndex >= FIRST_LIGHT_ERA,
    toggleable: true,
    settings: []
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
    this.elCatalogPanel  = document.getElementById('hud-catalog');
    this.elCatalogList   = document.getElementById('catalog-list');
    this._catalogNodes   = new Map();   // macroId -> li
    this._catalogPinnedId = null;        // for visual highlight sync
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
    this._contextMenuOpen = false;
    this._contextMenuMacroId = null;
    this._contextMenuMode = 'actions'; // 'actions' | 'rename'

    // External callbacks set by main.js so the input layer can react.
    this.onMacroRename       = null;  // (macroId, newName) => void
    this.onMacroTrackToggle  = null;  // (macroId, nextTracked) => void
    this.onCatalogEntryClick = null;  // (macroId) => void
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
    this._globalSettingsBuilt = true;
    // Apply the currently-stored cursor on first build.
    this._applyCursor(state.settings.cursorStyle);
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
  // reveals the panel on first earned item, refreshes enabled/disabled state.
  _syncListPanel(state, definitions, container, panel, nodeMap) {
    let anyEarned = false;
    for (const def of definitions) {
      if (!def.earned(state)) continue;
      anyEarned = true;
      let li = nodeMap.get(def.id);
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
    const wrap = document.createElement('label');
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
    switchEl.addEventListener('click', stop);
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
      return;
    }

    const wasHidden = el.hidden;
    if (wasHidden) el.hidden = false;

    const kindLabel = data.kind === 'cradle' ? 'Cradle' : 'Structure';
    if (this.elInspectorKind && this.elInspectorKind.textContent !== kindLabel) {
      this.elInspectorKind.textContent = kindLabel;
    }
    el.setAttribute('data-kind', data.kind);

    // Names are auto-assigned at creation and can be edited by the player.
    // Always write + show, never just hide, so we can never display a stale
    // value from a previous macro.
    const displayName = (data.name && data.name.length > 0)
      ? data.name
      : (data.kind === 'cradle' ? 'Cradle' : 'Structure');
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

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;
    const offset = Math.max(14, (data.macroRadiusCss || 12) + 14);
    let x = data.screenX + offset;
    let y = data.screenY - this._inspectorHeight / 2;

    if (x + this._inspectorWidth > vw - pad) {
      x = data.screenX - offset - this._inspectorWidth;
    }
    if (x < pad) x = pad;
    if (x + this._inspectorWidth > vw - pad) x = vw - pad - this._inspectorWidth;
    if (y < pad) y = pad;
    if (y + this._inspectorHeight > vh - pad) y = vh - pad - this._inspectorHeight;

    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
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
      });
    }

    if (this.elContextMenuInput) {
      this.elContextMenuInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._commitRename();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.hideMacroContextMenu();
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
      this.hideMacroContextMenu();
      e.stopPropagation();
      e.preventDefault();
    }, true); // capture phase so we run before canvas handlers

    // Escape closes from anywhere.
    document.addEventListener('keydown', (e) => {
      if (!this._contextMenuOpen) return;
      if (e.key === 'Escape') this.hideMacroContextMenu();
    });
  }

  // opts: { macroId, screenX, screenY, kind, name, tracked }
  showMacroContextMenu(opts) {
    const menu = this.elContextMenu;
    if (!menu || !opts) return;

    this._contextMenuMacroId = opts.macroId;
    this._contextMenuMacroName = opts.name || '';
    this._contextMenuMacroKind = opts.kind || 'structure';
    this._contextMenuOpen = true;
    this._contextMenuMode = 'actions';

    menu.setAttribute('data-kind', opts.kind || 'structure');
    menu.setAttribute('data-tracked', opts.tracked ? '1' : '0');

    if (this.elContextMenuTitle) {
      const title = opts.name && opts.name.length
        ? opts.name
        : (opts.kind === 'cradle' ? 'Cradle' : 'Structure');
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

    // Start in actions mode (not rename) on every show.
    if (this.elContextMenuActions) this.elContextMenuActions.hidden = false;
    if (this.elContextMenuRename)  this.elContextMenuRename.hidden  = true;

    menu.hidden = false;
    this._contextMenuLastX = opts.screenX;
    this._contextMenuLastY = opts.screenY;
    this._positionContextMenu(opts.screenX, opts.screenY);
    requestAnimationFrame(() => {
      if (!menu.hidden) {
        menu.setAttribute('data-visible', '1');
        // Re-position now that the visible scale is final.
        this._positionContextMenu(this._contextMenuLastX, this._contextMenuLastY);
      }
    });
  }

  hideMacroContextMenu() {
    const menu = this.elContextMenu;
    if (!menu || !this._contextMenuOpen) return;
    this._contextMenuOpen = false;
    this._contextMenuMacroId = null;
    this._contextMenuMode = 'actions';
    menu.removeAttribute('data-visible');
    menu.hidden = true;
    if (this.elContextMenuInput) {
      this.elContextMenuInput.value = '';
      this.elContextMenuInput.blur();
    }
  }

  isContextMenuOpen() { return this._contextMenuOpen; }

  _positionContextMenu(sx, sy) {
    const menu = this.elContextMenu;
    if (!menu) return;
    // Measure now that content/mode is set.
    const rect = menu.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;
    let x = sx;
    let y = sy;
    if (x + w > vw - pad) x = vw - pad - w;
    if (x < pad) x = pad;
    if (y + h > vh - pad) y = vh - pad - h;
    if (y < pad) y = pad;
    // Preserve the open-scale transform so the entrance animation reads.
    const visible = menu.getAttribute('data-visible') === '1';
    const scale = visible ? 1 : 0.96;
    menu.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) scale(${scale})`;
  }

  _enterRenameMode() {
    if (!this.elContextMenu) return;
    this._contextMenuMode = 'rename';
    if (this.elContextMenuActions) this.elContextMenuActions.hidden = true;
    if (this.elContextMenuRename)  this.elContextMenuRename.hidden  = false;
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
    if (typeof this.onMacroRename === 'function' && id != null) {
      this.onMacroRename(id, value);
    }
    this.hideMacroContextMenu();
  }

  _toggleTrackFromMenu() {
    const id = this._contextMenuMacroId;
    if (id == null) return;
    const menu = this.elContextMenu;
    const nextTracked = !(menu.getAttribute('data-tracked') === '1');
    if (typeof this.onMacroTrackToggle === 'function') {
      this.onMacroTrackToggle(id, nextTracked);
    }
    this.hideMacroContextMenu();
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
      }
      return;
    }

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
      let li = this._catalogNodes.get(m.id);
      if (!li) {
        li = document.createElement('li');
        li.dataset.macroId = String(m.id);
        const title = document.createElement('span');
        title.className = 'cat-title';
        const sub = document.createElement('span');
        sub.className = 'cat-sub';
        li.appendChild(title);
        li.appendChild(sub);
        li.addEventListener('click', () => {
          if (typeof this.onCatalogEntryClick === 'function') {
            this.onCatalogEntryClick(m.id);
          }
        });
        this._catalogNodes.set(m.id, li);
      }
      const kind = m.mass >= cradleThreshold ? 'cradle' : 'structure';
      if (li.dataset.kind !== kind) li.dataset.kind = kind;
      const isPinned = (pinnedId != null && pinnedId === m.id);
      li.classList.toggle('is-pinned', isPinned);

      const titleEl = li.firstChild;
      const subEl   = li.lastChild;
      const titleText = m.name && m.name.length
        ? m.name
        : (kind === 'cradle' ? 'Cradle' : 'Structure');
      if (titleEl.textContent !== titleText) titleEl.textContent = titleText;

      const kindLabel = kind === 'cradle' ? 'Cradle' : 'Structure';
      const massStr = fmt(Math.round(m.mass));
      const subText = `${kindLabel} \u00b7 ${massStr} mass`;
      if (subEl.textContent !== subText) subEl.textContent = subText;

      // Maintain sort order in the DOM.
      const nextSibling = prevNode ? prevNode.nextSibling : this.elCatalogList.firstChild;
      if (li !== nextSibling) {
        this.elCatalogList.insertBefore(li, nextSibling);
      }
      prevNode = li;
    }

    // Remove entries for macros that are no longer tracked (or no longer exist).
    for (const [id, li] of this._catalogNodes) {
      if (!seen.has(id)) {
        li.remove();
        this._catalogNodes.delete(id);
      }
    }
  }

  render(state) {
    // Cache state so async handlers (era info icon click, etc.) can read
    // the current era without us having to pass state into every closure.
    this._lastState = state;

    const era = state.currentEra();
    if (this.elEra.textContent !== era.name) this.elEra.textContent = era.name;
    if (this.elYear) {
      const yearStr = fmt(state.cosmicYear || 0);
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

    // Build global settings panel content on first render (state is now loaded)
    if (!this._globalSettingsBuilt) this._populateGlobalSettings(state);

    // Discovery banner (one at a time)
    if (!this._bannerLock && state.pendingDiscoveries.length) {
      const era = state.pendingDiscoveries.shift();
      // If a whisper is queued or showing, give the banner extra dwell so
      // the player isn't trying to read two things at once. Era transitions
      // are major moments and deserve a real beat.
      const concurrent = !!state.pendingWhisper || this._whisperLock;
      this._showBanner(era, concurrent);
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
