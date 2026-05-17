// Mobile-only UX adjustments. Strictly scoped via matchMedia + body class.
// On desktop (including desktop Safari) this module is a near-no-op:
// the body class is never added and CSS rules are gated by the same media query.

const MOBILE_MQ = '(max-width: 932px) and (pointer: coarse)';

// Convert a panel into a collapsible: <title> stays visible, the rest hides
// behind a tap. We wrap non-title children in a `.panel-body` once; on
// desktop the wrapper is structurally invisible (no styles target it).
function makeCollapsible(panel, titleSelector) {
  if (!panel) return;
  if (panel.dataset.collapsibleReady === '1') return;
  const title = panel.querySelector(titleSelector);
  if (!title) return;

  let body = panel.querySelector(':scope > .panel-body');
  if (!body) {
    body = document.createElement('div');
    body.className = 'panel-body';
    const kids = Array.from(panel.children);
    for (const k of kids) {
      if (k === title) continue;
      body.appendChild(k);
    }
    panel.appendChild(body);
  }
  title.classList.add('panel-header');
  panel.classList.add('is-collapsible');

  title.addEventListener('click', (e) => {
    // Only act when the mobile media query is active. Desktop ignores taps.
    if (!window.matchMedia(MOBILE_MQ).matches) return;
    e.stopPropagation();
    panel.classList.toggle('is-expanded');
  });
  // Make the header focusable for keyboard / a11y.
  title.setAttribute('role', 'button');
  title.setAttribute('tabindex', '0');
  title.addEventListener('keydown', (e) => {
    if (!window.matchMedia(MOBILE_MQ).matches) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      panel.classList.toggle('is-expanded');
    }
  });

  panel.dataset.collapsibleReady = '1';
}

function setupCollapsibles() {
  makeCollapsible(document.getElementById('hud-laws'),        '.laws-title');
  makeCollapsible(document.getElementById('hud-catalog'),     '.catalog-title');
  makeCollapsible(document.getElementById('hud-instruments'), '.unlocks-title');
  makeCollapsible(document.getElementById('hud-unlocks'),     '.unlocks-title');
  // Top-left panel gets a collapsible "details" section for the extra stats,
  // while year/era/lens stay visible. We mark the stat rows as the body and
  // promote a synthetic header row.
  const topLeft = document.getElementById('hud-top-left');
  if (topLeft && !topLeft.dataset.statsReady) {
    const statRows = topLeft.querySelectorAll('.stat-line');
    if (statRows.length) {
      const wrap = document.createElement('div');
      wrap.className = 'stat-body';
      statRows.forEach((r) => wrap.appendChild(r));
      topLeft.appendChild(wrap);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'stat-toggle';
      toggle.setAttribute('aria-label', 'Toggle stats');
      toggle.textContent = 'Stats';
      topLeft.appendChild(toggle);
      toggle.addEventListener('click', (e) => {
        if (!window.matchMedia(MOBILE_MQ).matches) return;
        e.stopPropagation();
        topLeft.classList.toggle('stats-expanded');
      });
    }
    topLeft.dataset.statsReady = '1';
  }
}

function applyMobileBodyClass() {
  const on = window.matchMedia(MOBILE_MQ).matches;
  document.body.classList.toggle('is-mobile', on);
}

if (typeof window !== 'undefined') {
  const mq = window.matchMedia(MOBILE_MQ);
  function syncForMobile() {
    if (mq.matches) {
      setupCollapsibles();
      applyMobileBodyClass();
    } else {
      applyMobileBodyClass();
    }
  }
  syncForMobile();
  const onChange = () => syncForMobile();
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}
