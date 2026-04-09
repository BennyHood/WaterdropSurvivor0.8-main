// --- UI / DOM HELPER FUNCTIONS ---
// Extracted from game.js - loaded as a regular script before the game.js ES module
// Exposes window.GameUI for use by main.js
//
// Only pure DOM-manipulation helpers that do NOT depend on THREE.js scene state
// are extracted here. Functions that require camera (3D→2D projection), player
// position, or other runtime scene objects remain in main.js.

// Stat Notification Queue System - module-private state
const _statNotificationQueue = [];
let _isShowingNotification = false;
// Gap between consecutive queued notifications (ms)
const _NOTIF_BETWEEN_DELAY = 1500;

function _updateLiveStatDisplay(text) {
  // Show notification in the live stat rectangle via main.js
  if (window.showLiveStatNotification) {
    window.showLiveStatNotification(text);
  }
}

function _processStatNotificationQueue() {
  if (_statNotificationQueue.length === 0) {
    _isShowingNotification = false;
    return;
  }

  _isShowingNotification = true;
  const { text, level } = _statNotificationQueue.shift();

  // Update live stat display
  _updateLiveStatDisplay(text);

  // Create notification element
  const container = document.getElementById('stat-notifications');
  const notification = document.createElement('div');
  notification.className = 'stat-notification';

  // Add styling based on level
  if (level === 'mythical') {
    notification.classList.add('combo-mythical');
  } else if (level === 'high') {
    notification.classList.add('combo-high');
  }

  notification.innerText = text;
  container.appendChild(notification);

  // Display for 0.8s, fade for 0.3s, then 1.5s gap before next
  setTimeout(() => {
    notification.style.animation = 'stat-fade-out 0.3s ease-out forwards';

    // Remove element, then wait inter-notification gap before showing next
    setTimeout(() => {
      if (container.contains(notification)) container.removeChild(notification);
      // Wait 1.5s before processing next notification
      if (_statNotificationQueue.length > 0) {
        setTimeout(_processStatNotificationQueue, _NOTIF_BETWEEN_DELAY);
      } else {
        _isShowingNotification = false;
      }
    }, 300);
  }, 800);
}

function showStatChange(text, level = 'normal') {
  // Add to queue with level
  _statNotificationQueue.push({ text, level });

  // Mirror to super stat bar with appropriate rarity
  if (window.pushSuperStatEvent) {
    let rarity = 'common';
    if      (level === 'mythical')  rarity = 'mythic';
    else if (level === 'legendary') rarity = 'legendary';
    else if (level === 'high')      rarity = 'epic';
    else if (level === 'rare')      rarity = 'rare';
    else if (level === 'uncommon')  rarity = 'uncommon';
    window.pushSuperStatEvent(text, rarity, '', 'neutral');
  }

  // Start processing queue if not already processing
  if (!_isShowingNotification) {
    _processStatNotificationQueue();
  }
}

// showStatusMessage: compact status notification (camp screen feedback)
function showStatusMessage(text, duration = 2000) {
  showStatChange(text);
}

// ── Resource Collection Toast ─────────────────────────────────────────
// Shows a brief slide-in toast on the right side when resources are collected.
const _resourceToastQueue = [];
let _resourceToastActive = false;

function showResourceToast(text, color) {
  _resourceToastQueue.push({ text, color: color || '#00ffcc' });
  if (!_resourceToastActive) _processResourceToastQueue();
}

function _processResourceToastQueue() {
  if (_resourceToastQueue.length === 0) { _resourceToastActive = false; return; }
  _resourceToastActive = true;
  const { text, color } = _resourceToastQueue.shift();

  let wrap = document.getElementById('resource-toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'resource-toast-wrap';
    wrap.style.cssText = 'position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:99990;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
    document.body.appendChild(wrap);
  }

  const toast = document.createElement('div');
  toast.style.cssText = [
    'background:rgba(0,0,0,0.85)',
    `border-left:3px solid ${color}`,
    `color:${color}`,
    'font-family:"Bangers",cursive',
    'font-size:clamp(12px,3vw,15px)',
    'letter-spacing:1px',
    'padding:8px 14px',
    'border-radius:4px 0 0 4px',
    'transform:translateX(110%)',
    'transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
    'max-width:220px',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis'
  ].join(';');
  toast.textContent = text;
  wrap.appendChild(toast);

  // Slide in with a bounce overshoot effect
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.animation = 'toast-pop-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards';
    });
  });

  // Slide out after 3.5s, then show next
  setTimeout(() => {
    toast.style.transition = 'transform 0.3s ease-in,opacity 0.3s ease-in';
    toast.style.animation = '';
    toast.style.transform = 'translateX(110%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (wrap.contains(toast)) wrap.removeChild(toast);
      _processResourceToastQueue();
    }, 350);
  }, 3500);
}

window.showResourceToast = showResourceToast;

window.GameUI = {
  showStatChange,
  showStatusMessage,
  showYouDiedBanner,
  showResourceToast
};

function showYouDiedBanner(duration) {
  duration = duration || 3000;
  const banner = document.getElementById('you-died-banner');
  if (!banner) return;

  // Calculate current run stats
  const survivalTime = !gameStartTime ? 0 : Math.floor((Date.now() - gameStartTime) / 1000);
  const kills = (typeof playerStats !== 'undefined' && playerStats && playerStats.kills) || 0;
  const level = (typeof playerStats !== 'undefined' && playerStats && playerStats.lvl) || 0;

  // Update banner content with Annunaki-themed stats
  banner.innerHTML = `
    <div style="font-size: 72px; font-weight: bold; margin-bottom: 20px; text-shadow: 0 0 20px #00ffff, 0 0 40px #8a2be2, 4px 4px 8px #000;">
      ◊ SYSTEM TERMINATED ◊
    </div>
    <div style="font-size: 24px; font-family: 'Courier New', monospace; color: #e0e0ff; text-shadow: 0 0 10px #00ffff;">
      <div style="margin: 10px 0;">⧗ TIME: ${survivalTime}s</div>
      <div style="margin: 10px 0;">⚔ KILLS: ${kills}</div>
      <div style="margin: 10px 0;">⧫ LEVEL: ${level}</div>
    </div>
  `;

  // Populate death stats from current playerStats / gameStartTime
  // Falls back to _sandboxRunStartTime for sandbox.html
  try {
    const t = document.getElementById('yd-time');
    const k = document.getElementById('yd-kills');
    const l = document.getElementById('yd-level');
    const _start = (typeof gameStartTime !== 'undefined' && gameStartTime)
      ? gameStartTime
      : (typeof _sandboxRunStartTime !== 'undefined' ? _sandboxRunStartTime : null);
    if (t && _start) {
      const secs = Math.floor((Date.now() - _start) / 1000);
      const mm = Math.floor(secs / 60), ss = secs % 60;
      t.textContent = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
    }
    if (k && typeof playerStats !== 'undefined') k.textContent = playerStats.kills || 0;
    if (l && typeof playerStats !== 'undefined') l.textContent = playerStats.lvl || 1;
  } catch (e) { /* non-fatal — stats just won't appear */ }

  // Force animation restart by toggling display
  banner.style.display = 'none';
  void banner.offsetWidth; // reflow to restart CSS animations
  banner.style.display = 'block';

  setTimeout(() => {
    banner.style.display = 'none';
  }, duration);
}

// ── ProfileUI: top-left profile display ──────────────────────────────────────
const ProfileUI = {
  create() {
    /* waterdrop guy picture with customizable frame */
    /* level number, rank, account login, progress bar to next level with exact % text */
    /* rank-up gives visual rewards and new frames */
  }
};
window.ProfileUI = ProfileUI;

// ── SettingsMenu: full in-game settings ──────────────────────────────────────
const SettingsMenu = {
  open() {
    /* resolution, graphics presets, shadows (ring on low → full cascaded on high), post-processing motion blur strength, bloom, vignette, anti-aliasing, sound sliders, fog density, draw distance – all saved and applied instantly */
  }
};
window.SettingsMenu = SettingsMenu;

