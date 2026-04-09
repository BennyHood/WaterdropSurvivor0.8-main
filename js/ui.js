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

// ── SettingsMenu: full in-game settings ──────────────────────────────────────
// Integrates with the existing window.gameSettings object and persists under
// the same localStorage key ('waterDropSurvivorSettings') used by save-system.js
// and settings-ui.js so all settings stay in sync.
const _SETTINGS_KEY = 'waterDropSurvivorSettings';

const SettingsMenu = {
  _el: null,
  _settings: null,

  _defaults: {
    resolution: 1.0,
    graphicsPreset: 'medium',
    shadows: 'medium',
    motionBlur: 0.5,
    bloom: 0.6,
    vignette: 0.3,
    antiAliasing: true,
    masterVolume: 0.8,
    sfxVolume: 0.7,
    musicVolume: 0.5,
    fogDensity: 0.025,
    drawDistance: 120,
  },

  _load() {
    try {
      const s = localStorage.getItem(_SETTINGS_KEY);
      const parsed = s ? JSON.parse(s) : {};
      this._settings = Object.assign({}, this._defaults, parsed);
    } catch (e) { this._settings = Object.assign({}, this._defaults); }
  },

  _save() {
    try {
      // Merge into existing settings blob so we don't clobber keys from other systems
      let existing = {};
      try { const raw = localStorage.getItem(_SETTINGS_KEY); if (raw) existing = JSON.parse(raw); } catch (_) {}
      const merged = Object.assign(existing, this._settings);
      localStorage.setItem(_SETTINGS_KEY, JSON.stringify(merged));
    } catch (e) { /* non-fatal */ }
  },

  /** Sync SettingsMenu values into the runtime window.gameSettings object */
  _syncToGameSettings() {
    if (!window.gameSettings) return;
    const s = this._settings;
    window.gameSettings.quality = s.graphicsPreset;
    window.gameSettings.soundEnabled = s.masterVolume > 0;
    window.gameSettings.musicEnabled = s.musicVolume > 0;
  },

  _apply() {
    const s = this._settings;

    // ── Fog density / draw distance ──
    if (window.scene && window.scene.fog) {
      if (window.scene.fog.density !== undefined) window.scene.fog.density = s.fogDensity;
      if (window.scene.fog.far !== undefined) window.scene.fog.far = s.drawDistance;
    }

    // ── Resolution scale — clamp final pixel ratio to 1.5 to preserve mobile perf ──
    if (window.renderer) {
      const maxPixelRatio = 1.5;
      const base = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
      const pixelRatio = Math.min(base * s.resolution, maxPixelRatio);
      window.renderer.setPixelRatio(pixelRatio);
    }

    // ── Shadows ──
    if (window.renderer) {
      if (s.shadows === 'off') {
        window.renderer.shadowMap.enabled = false;
      } else {
        window.renderer.shadowMap.enabled = true;
        // Adjust shadow map quality
        const shadowSizes = { low: 512, medium: 1024, high: 2048 };
        const shadowSize = shadowSizes[s.shadows] || 1024;
        if (window.scene) {
          window.scene.traverse(function (obj) {
            if (obj.isLight && obj.shadow && obj.shadow.mapSize) {
              obj.shadow.mapSize.setScalar(shadowSize);
              if (obj.shadow.map) { obj.shadow.map.dispose(); obj.shadow.map = null; }
            }
          });
        }
      }
    }

    // ── Post-processing (bloom, vignette, motion blur) ──
    // These integrate with the existing post-processing passes if available
    if (window.bloomPass) {
      window.bloomPass.strength = s.bloom;
      window.bloomPass.enabled = s.bloom > 0;
    }
    if (window.vignettePass) {
      window.vignettePass.uniforms.darkness.value = s.vignette * 2.0;
      window.vignettePass.enabled = s.vignette > 0;
    }
    if (window.motionBlurPass) {
      window.motionBlurPass.enabled = s.motionBlur > 0;
      if (window.motionBlurPass.uniforms && window.motionBlurPass.uniforms.intensity) {
        window.motionBlurPass.uniforms.intensity.value = s.motionBlur;
      }
    }

    // ── Anti-aliasing (toggle FXAA pass if available) ──
    if (window.fxaaPass) {
      window.fxaaPass.enabled = !!s.antiAliasing;
    }

    // ── Volume ──
    if (window.Howler) {
      window.Howler.volume(s.masterVolume);
    }
    // Sync sfx/music volume into global audio state
    if (window.AudioSystem) {
      if (typeof window.AudioSystem.setSFXVolume === 'function') window.AudioSystem.setSFXVolume(s.sfxVolume);
      if (typeof window.AudioSystem.setMusicVolume === 'function') window.AudioSystem.setMusicVolume(s.musicVolume);
    }

    // Keep window.gameSettings in sync
    this._syncToGameSettings();
    this._save();
  },

  open() {
    if (!this._settings) this._load();
    if (this._el) { this._el.style.display = 'flex'; return; }

    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:sans-serif;';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#1a1a2e;border:1px solid #444;border-radius:12px;padding:24px;color:#ddd;width:380px;max-height:80vh;overflow-y:auto;';

    const title = document.createElement('h2');
    title.textContent = '⚙️ Settings';
    title.style.cssText = 'margin:0 0 16px;color:#ffcc00;text-align:center;';
    panel.appendChild(title);

    const s = this._settings;
    const self = this;

    function addSlider(label, key, min, max, step) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:12px;';
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;';
      const valSpan = document.createElement('span');
      valSpan.textContent = s[key].toFixed(step < 1 ? 2 : 0);
      lbl.innerHTML = '<span>' + label + '</span>';
      lbl.appendChild(valSpan);
      row.appendChild(lbl);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = s[key];
      inp.style.cssText = 'width:100%;accent-color:#ffcc00;';
      inp.addEventListener('input', function () {
        s[key] = parseFloat(this.value);
        valSpan.textContent = s[key].toFixed(step < 1 ? 2 : 0);
        self._apply();
      });
      row.appendChild(inp);
      panel.appendChild(row);
    }

    function addSelect(label, key, options) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;font-size:13px;';
      row.innerHTML = '<span>' + label + '</span>';
      const sel = document.createElement('select');
      sel.style.cssText = 'background:#2a2a3e;color:#ddd;border:1px solid #555;border-radius:4px;padding:2px 6px;';
      options.forEach(function (o) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o.charAt(0).toUpperCase() + o.slice(1);
        if (s[key] === o) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { s[key] = this.value; self._apply(); });
      row.appendChild(sel);
      panel.appendChild(row);
    }

    // Build UI controls
    addSlider('Resolution Scale', 'resolution', 0.5, 1.5, 0.1);
    addSelect('Graphics Preset', 'graphicsPreset', ['low', 'medium', 'high', 'ultra']);
    addSelect('Shadows', 'shadows', ['off', 'low', 'medium', 'high']);
    addSlider('Motion Blur', 'motionBlur', 0, 1, 0.05);
    addSlider('Bloom', 'bloom', 0, 1, 0.05);
    addSlider('Vignette', 'vignette', 0, 1, 0.05);
    addSlider('Master Volume', 'masterVolume', 0, 1, 0.05);
    addSlider('SFX Volume', 'sfxVolume', 0, 1, 0.05);
    addSlider('Music Volume', 'musicVolume', 0, 1, 0.05);
    addSlider('Fog Density', 'fogDensity', 0, 0.1, 0.005);
    addSlider('Draw Distance', 'drawDistance', 40, 200, 5);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'display:block;margin:16px auto 0;padding:8px 32px;background:#ffcc00;color:#000;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:14px;';
    closeBtn.addEventListener('click', function () { overlay.style.display = 'none'; });
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });
    document.body.appendChild(overlay);
    this._el = overlay;
  },

  close() { if (this._el) this._el.style.display = 'none'; },
};
window.SettingsMenu = SettingsMenu;

