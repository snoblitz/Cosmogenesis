// iOS "Add to Home Screen" hint.
//
// Only shows on iOS Safari when NOT already in standalone mode and NOT
// inside an in-app browser (Chrome iOS, Firefox iOS, Twitter, Instagram,
// Facebook, etc., where Add to Home Screen isn't available the same way).
// Strictly opt-out: dismissed state persists forever.
//
// Desktop and Android are untouched.

const DISMISS_KEY = 'cosmogenesis.iosInstallHint.v1';
const SHOW_DELAY_MS = 12000;

function isIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac with touch points.
  if (ua.includes('Mac') && navigator.maxTouchPoints > 1) return true;
  return false;
}

function isStandalone() {
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  if (navigator.standalone === true) return true;
  return false;
}

function isRealSafari() {
  const ua = navigator.userAgent || '';
  // Real iOS Safari has "Safari" and "Version/" and lacks the in-app markers.
  if (!/Safari\//.test(ua)) return false;
  if (!/Version\//.test(ua)) return false;
  // Exclude alternate engines / wrappers.
  const blocked = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo|FBAN|FBAV|Instagram|Line\/|MicroMessenger|GSA/;
  if (blocked.test(ua)) return false;
  return true;
}

function alreadyDismissed() {
  try {
    return !!localStorage.getItem(DISMISS_KEY);
  } catch (_) {
    return false;
  }
}

function rememberDismissed() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) {}
}

function injectStyles() {
  if (document.getElementById('ios-install-hint-styles')) return;
  const style = document.createElement('style');
  style.id = 'ios-install-hint-styles';
  style.textContent = `
    #ios-install-hint {
      position: fixed;
      left: 50%;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
      transform: translate(-50%, 24px);
      width: min(300px, calc(100vw - 110px));
      padding: 12px 14px 14px;
      border-radius: 18px;
      background: rgba(10, 8, 18, 0.82);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      backdrop-filter: blur(18px) saturate(140%);
      border: 1px solid rgba(190, 170, 255, 0.18);
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.35) inset,
        0 18px 40px rgba(0, 0, 0, 0.55),
        0 0 60px rgba(160, 120, 255, 0.18);
      color: #f4ecff;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif;
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 420ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    #ios-install-hint.is-visible {
      opacity: 1;
      transform: translate(-50%, 0);
      pointer-events: auto;
    }
    #ios-install-hint .iih-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.01em;
      margin-bottom: 6px;
      color: #fff;
    }
    #ios-install-hint .iih-spark {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #fff 0%, #ffd98a 35%, #b48bff 75%, transparent 100%);
      box-shadow: 0 0 12px rgba(255, 210, 140, 0.55);
      flex-shrink: 0;
    }
    #ios-install-hint .iih-body {
      color: rgba(228, 220, 250, 0.86);
      font-size: 13px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
    }
    #ios-install-hint .iih-share {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 22px;
      vertical-align: -5px;
      color: #6fa8ff;
    }
    #ios-install-hint .iih-share svg { width: 100%; height: 100%; display: block; }
    #ios-install-hint .iih-emph {
      color: #fff;
      font-weight: 600;
    }
    #ios-install-hint .iih-close {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 0;
      background: transparent;
      color: rgba(228, 220, 250, 0.7);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    #ios-install-hint .iih-close:active { background: rgba(255,255,255,0.08); }
    #ios-install-hint .iih-arrow {
      position: absolute;
      left: 50%;
      bottom: -7px;
      width: 14px;
      height: 14px;
      transform: translateX(-50%) rotate(45deg);
      background: rgba(10, 8, 18, 0.82);
      border-right: 1px solid rgba(190, 170, 255, 0.18);
      border-bottom: 1px solid rgba(190, 170, 255, 0.18);
    }
    @media (prefers-reduced-motion: reduce) {
      #ios-install-hint { transition: opacity 200ms linear; transform: translate(-50%, 0); }
    }
  `;
  document.head.appendChild(style);
}

function buildCard() {
  const card = document.createElement('div');
  card.id = 'ios-install-hint';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('aria-label', 'Add Cosmogenesis to your home screen');

  card.innerHTML = `
    <button class="iih-close" type="button" aria-label="Dismiss">×</button>
    <div class="iih-title"><span class="iih-spark" aria-hidden="true"></span>Keep the cosmos close</div>
    <div class="iih-body">
      Tap
      <span class="iih-share" aria-hidden="true">
        <svg viewBox="0 0 20 22" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 2.5 L10 14" />
          <path d="M6.5 6 L10 2.5 L13.5 6" />
          <path d="M4.5 10.5 L4.5 19 L15.5 19 L15.5 10.5" />
        </svg>
      </span>
      then <span class="iih-emph">Add to Home Screen</span> to launch Cosmogenesis fullscreen.
    </div>
    <div class="iih-arrow" aria-hidden="true"></div>
  `;

  const close = card.querySelector('.iih-close');
  close.addEventListener('click', () => dismiss(card));
  // Tap on the card body anywhere also dismisses, so it never traps a user.
  card.addEventListener('click', (e) => {
    if (e.target.closest('.iih-close')) return;
    dismiss(card);
  });

  return card;
}

function dismiss(card) {
  if (!card || card.dataset.dismissed === '1') return;
  card.dataset.dismissed = '1';
  card.classList.remove('is-visible');
  rememberDismissed();
  setTimeout(() => {
    if (card.parentNode) card.parentNode.removeChild(card);
  }, 500);
}

function show() {
  injectStyles();
  const card = buildCard();
  document.body.appendChild(card);
  // Next frame for the transition to fire.
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-visible')));
}

function maybeShow() {
  if (!isIOS()) return;
  if (isStandalone()) return;
  if (!isRealSafari()) return;
  if (alreadyDismissed()) return;

  const trigger = () => setTimeout(show, SHOW_DELAY_MS);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    trigger();
  } else {
    window.addEventListener('DOMContentLoaded', trigger, { once: true });
  }
}

maybeShow();
