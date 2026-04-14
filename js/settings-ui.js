// ══════════════════════════════════════════════════════════════════════════════
// Settings UI - Dark-themed Settings Modal with Custom Dialogs
// ══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Initialize settings modal when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsUI);
  } else {
    initSettingsUI();
  }

  function initSettingsUI() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-close-btn');
    const graphicsModeSelect = document.getElementById('graphics-mode-select');
    const manualGraphicsPanel = document.getElementById('manual-graphics-panel');
    const qualitySelect = document.getElementById('quality-select');
    const particleToggle = document.getElementById('particle-effects-toggle');
    const autoAimCheckbox = document.getElementById('auto-aim-checkbox');
    const autoAimTooltip = document.getElementById('auto-aim-label-tooltip');
    const controlTypeSelect = document.getElementById('control-type-select');
    const soundToggle = document.getElementById('sound-toggle');
    const musicToggle = document.getElementById('music-toggle');
    const fpsBoosterStatus = document.getElementById('fps-booster-status');
    const hudScaleSlider = document.getElementById('hud-scale-slider');
    const hudScaleValue = document.getElementById('hud-scale-value');
    const hudOpacitySlider = document.getElementById('hud-opacity-slider');
    const hudOpacityValue = document.getElementById('hud-opacity-value');
    const hudCustomiseInlineBtn = document.getElementById('hud-customise-inline-btn');

    if (!settingsBtn || !settingsModal || !closeBtn) {
      return;
    }

    // ─── Open Settings Modal ───
    settingsBtn.addEventListener('click', openSettings);

    // Also allow Escape key to open/close settings
    document.addEventListener('keydown', function(e) {
      if (e.code === 'Escape') {
        // Close dialog first if open
        const dialogOverlay = document.getElementById('game-dialog-overlay');
        if (dialogOverlay && dialogOverlay.style.display === 'flex') {
          dialogOverlay.style.display = 'none';
          return;
        }
        if (settingsModal.style.display === 'flex') {
          closeSettings();
        } else if (window.gameSettings && !window.isPaused) {
          openSettings();
        }
      }
    });

    function openSettings() {
      if (window.setGamePaused) window.setGamePaused(true);
      window.isPaused = true;

      // Load current settings into UI
      loadSettingsIntoUI();

      settingsModal.style.display = 'flex';
    }

    // ─── Close Settings / Back to Game ───
    closeBtn.addEventListener('click', closeSettings);

    // ─── Go to Camp Button ───
    const goToCampBtn = document.getElementById('settings-go-to-camp-btn');
    if (goToCampBtn) {
      goToCampBtn.addEventListener('click', function() {
        closeSettings();
        // ENGINE 2.0: Only redirect to index.html when running inside sandbox.
        // When already on the camp hub (index.html), use in-page navigation instead
        // to avoid an unnecessary full reload and avoid poisoning wds_fromSandbox.
        if (window.location.pathname.endsWith('sandbox.html')) {
          try {
            localStorage.setItem('wds_fromSandbox', '1');
          } catch (e) { /* ignore */ }
          window.location.href = 'index.html';
        } else {
          // Already on camp hub — navigate in-page
          if (typeof window.updateCampScreen === 'function') {
            window.updateCampScreen();
          } else {
            console.warn('[Settings] updateCampScreen not available; cannot navigate to camp in-page.');
          }
        }
      });
    }

    function closeSettings() {
      settingsModal.style.display = 'none';
      if (window.setGamePaused) window.setGamePaused(false);
      window.isPaused = false;
    }

    // ─── Reset Progress Button (uses comic-book dialog) ───
    const resetBtn = document.getElementById('settings-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        showGameDialog(
          '⚠ RESET PROGRESS',
          'This will wipe ALL your progress — buildings, skills, gear, gold, and stats. You will start fresh from Level 0.\n\nAre you sure?',
          function() {
            // Confirmed — perform the reset
            if (typeof window.hardResetGame === 'function') {
              window.hardResetGame();
            } else {
              // Fallback: clear localStorage and reload
              try {
                localStorage.removeItem('waterDropSurvivorSave');
                localStorage.removeItem('waterDropSurvivorSettings');
              } catch (e) { /* ignore */ }
              window.location.reload();
            }
          }
        );
      });
    }

    // ─── Graphics Mode (Auto/Manual) Toggle ───
    if (graphicsModeSelect && manualGraphicsPanel) {
      graphicsModeSelect.addEventListener('change', function() {
        const mode = this.value;

        if (mode === 'manual') {
          // Show manual panel
          manualGraphicsPanel.style.display = 'block';

          // Update gameSettings to use manual mode
          if (window.gameSettings) {
            window.gameSettings.graphicsMode = 'manual';

            // Apply the current quality preset immediately
            if (qualitySelect && typeof window.applyGraphicsQuality === 'function') {
              window.applyGraphicsQuality(qualitySelect.value);
            }

            // FORCE FULL BLOOD/GORE RENDERING IN MANUAL MODE
            if (window.gameSettings.particleEffects !== false) {
              if (window.BloodV2 && typeof window.BloodV2.setParticleEffects === 'function') {
                window.BloodV2.setParticleEffects(true);
              }
              if (window.GoreSim && typeof window.GoreSim.setEnabled === 'function') {
                window.GoreSim.setEnabled(true);
              }
              if (window.TraumaSystem && typeof window.TraumaSystem.setEnabled === 'function') {
                window.TraumaSystem.setEnabled(true);
              }
            }
          }

          // Hide FPS booster status (only shows in auto mode)
          if (fpsBoosterStatus) fpsBoosterStatus.style.display = 'none';

        } else {
          // Auto mode - hide manual panel
          manualGraphicsPanel.style.display = 'none';

          // Update gameSettings to use auto mode
          if (window.gameSettings) {
            window.gameSettings.graphicsMode = 'auto';
            window.gameSettings.graphicsQuality = 'auto';

            // Reset FPS booster to start at medium quality
            if (typeof window._resetFpsBooster === 'function') {
              window._resetFpsBooster(3); // Medium = index 3
            }
          }

          // Show FPS booster status
          if (fpsBoosterStatus) fpsBoosterStatus.style.display = 'block';
        }

        // Save settings
        saveSettings();
      });
    }

    // ─── Quality Preset Select (Manual Mode) ───
    if (qualitySelect) {
      qualitySelect.addEventListener('change', function() {
        const quality = this.value;

        // Only apply if in manual mode
        if (window.gameSettings && window.gameSettings.graphicsMode === 'manual') {
          if (typeof window.applyGraphicsQuality === 'function') {
            window.applyGraphicsQuality(quality);
          }

          window.gameSettings.graphicsQuality = quality;
          saveSettings();
        }
      });
    }

    // ─── Particle Effects Toggle (Manual Mode) ───
    if (particleToggle) {
      particleToggle.addEventListener('change', function() {
        const enabled = this.checked;

        if (window.gameSettings) {
          window.gameSettings.particleEffects = enabled;
          saveSettings();
        }

        // Apply particle scale changes
        if (window.performanceLog) {
          window.performanceLog.particleEffectsEnabled = enabled;
        }

        // Update BloodV2 and other particle systems
        if (window.BloodV2 && typeof window.BloodV2.setParticleEffects === 'function') {
          window.BloodV2.setParticleEffects(enabled);
        }
      });
    }

    // ─── Auto-Aim Checkbox ───
    if (autoAimCheckbox) {
      autoAimCheckbox.addEventListener('change', function() {
        if (window.gameSettings) {
          window.gameSettings.autoAim = this.checked;
          saveSettings();
        }
      });
    }

    // ─── Control Type Select ───
    if (controlTypeSelect) {
      controlTypeSelect.addEventListener('change', function() {
        if (window.gameSettings) {
          window.gameSettings.controlType = this.value;
          saveSettings();

          // Update joystick visibility
          if (window.updateJoystickVisibility) {
            window.updateJoystickVisibility();
          }
        }
      });
    }

    // ─── Sound Toggle ───
    if (soundToggle) {
      soundToggle.addEventListener('change', function() {
        if (window.gameSettings) {
          window.gameSettings.soundEnabled = this.checked;
          saveSettings();
        }
      });
    }

    // ─── Music Toggle ───
    if (musicToggle) {
      musicToggle.addEventListener('change', function() {
        if (window.gameSettings) {
          window.gameSettings.musicEnabled = this.checked;
          saveSettings();

          // Apply music changes
          if (window.AudioManager && typeof window.AudioManager.setMusicEnabled === 'function') {
            window.AudioManager.setMusicEnabled(this.checked);
          }
        }
      });
    }

    // ─── HUD Scale & Opacity helpers ───
    const HUD_SELECTOR = '.hud-top, #hud-top-right-row, #bottom-bars-container, #super-stat-bar, #skill-icons-panel, #rage-hud, #special-attacks-hud';

    function _applyHudScale(pct) {
      const scale = pct / 100;
      document.querySelectorAll(HUD_SELECTOR).forEach(function(el) {
        // Store the scale as a data attribute to avoid clobbering other transforms
        el.dataset.hudScale = scale;
        el.style.transform = 'scale(' + scale + ')';
        el.style.transformOrigin = el.dataset.hudScaleOrigin || 'top left';
      });
    }
    if (hudScaleSlider && hudScaleValue) {
      hudScaleSlider.addEventListener('input', function() {
        const pct = parseInt(this.value, 10);
        hudScaleValue.textContent = pct + '%';
        if (window.gameSettings) window.gameSettings.hudScale = pct;
        _applyHudScale(pct);
        saveSettings();
      });
    }

    function _applyHudOpacity(pct) {
      const opacity = pct / 100;
      document.querySelectorAll(HUD_SELECTOR).forEach(function(el) { el.style.opacity = opacity; });
    }
    if (hudOpacitySlider && hudOpacityValue) {
      hudOpacitySlider.addEventListener('input', function() {
        const pct = parseInt(this.value, 10);
        hudOpacityValue.textContent = pct + '%';
        if (window.gameSettings) window.gameSettings.hudOpacity = pct;
        _applyHudOpacity(pct);
        saveSettings();
      });
    }

    // ─── Inline HUD Reposition Button ───
    if (hudCustomiseInlineBtn) {
      hudCustomiseInlineBtn.addEventListener('click', function() {
        closeSettings();
        if (window.UICalibration && typeof window.UICalibration.enter === 'function') {
          window.UICalibration.enter(function() {
            if (window.setGamePaused) window.setGamePaused(false);
            window.isPaused = false;
          });
        }
      });
    }

    // ─── Load Settings into UI ───
    function loadSettingsIntoUI() {
      if (!window.gameSettings) return;

      const settings = window.gameSettings;

      // Graphics Mode
      if (graphicsModeSelect) {
        const mode = settings.graphicsMode || 'auto';
        graphicsModeSelect.value = mode;

        // Show/hide manual panel based on mode
        if (manualGraphicsPanel) {
          manualGraphicsPanel.style.display = mode === 'manual' ? 'block' : 'none';
        }

        // Show/hide FPS booster status
        if (fpsBoosterStatus) {
          fpsBoosterStatus.style.display = mode === 'auto' ? 'block' : 'none';
        }
      }

      // Quality Preset
      if (qualitySelect && settings.graphicsQuality && settings.graphicsQuality !== 'auto') {
        qualitySelect.value = settings.graphicsQuality;
      }

      // Particle Effects
      if (particleToggle) {
        particleToggle.checked = settings.particleEffects !== false; // Default to true
      }

      // Auto-Aim
      if (autoAimCheckbox) {
        autoAimCheckbox.checked = settings.autoAim || false;

        // Check if auto-aim is unlocked in skill tree
        if (window.saveData && window.saveData.skillTree && window.saveData.skillTree.autoAim) {
          const unlocked = window.saveData.skillTree.autoAim.unlocked;
          autoAimCheckbox.disabled = !unlocked;

          if (autoAimTooltip) {
            autoAimTooltip.style.display = unlocked ? 'none' : 'inline';
          }
        }
      }

      // Control Type
      if (controlTypeSelect && settings.controlType) {
        controlTypeSelect.value = settings.controlType;
      }

      // Sound
      if (soundToggle) {
        soundToggle.checked = settings.soundEnabled !== false; // Default to true
      }

      // Music
      if (musicToggle) {
        musicToggle.checked = settings.musicEnabled !== false; // Default to true
      }

      // HUD Scale
      const hudScale = settings.hudScale || 100;
      if (hudScaleSlider) hudScaleSlider.value = hudScale;
      if (hudScaleValue) hudScaleValue.textContent = hudScale + '%';
      _applyHudScale(hudScale);

      // HUD Opacity
      const hudOpacity = settings.hudOpacity || 100;
      if (hudOpacitySlider) hudOpacitySlider.value = hudOpacity;
      if (hudOpacityValue) hudOpacityValue.textContent = hudOpacity + '%';
      _applyHudOpacity(hudOpacity);
    }

    // ─── Save Settings to localStorage ───
    function saveSettings() {
      if (!window.gameSettings) return;

      try {
        const settingsToSave = {
          graphicsMode: window.gameSettings.graphicsMode || 'auto',
          graphicsQuality: window.gameSettings.graphicsQuality || 'auto',
          particleEffects: window.gameSettings.particleEffects !== false,
          autoAim: window.gameSettings.autoAim || false,
          controlType: window.gameSettings.controlType || 'keyboard',
          soundEnabled: window.gameSettings.soundEnabled !== false,
          musicEnabled: window.gameSettings.musicEnabled !== false,
          hudScale: window.gameSettings.hudScale || 100,
          hudOpacity: window.gameSettings.hudOpacity || 100
        };

        localStorage.setItem('waterDropSurvivorSettings', JSON.stringify(settingsToSave));

      } catch (e) {
        console.error('[SettingsUI] Failed to save settings:', e);
      }
    }

    // ─── Expose function to refresh UI from outside ───
    window.refreshSettingsUI = function() {
      loadSettingsIntoUI();
    };

    // ─── Expose SettingsUI API so external callers (e.g. profile modal) can show/hide ───
    window.SettingsUI = {
      show: openSettings,
      hide: closeSettings
    };

    // Initial load
    loadSettingsIntoUI();
  }

  // ─── Update Auto-Aim UI when unlocked via Skill Tree ───
  window.updateAutoAimUI = function(unlocked) {
    const autoAimCheckbox = document.getElementById('auto-aim-checkbox');
    const autoAimTooltip = document.getElementById('auto-aim-label-tooltip');

    if (autoAimCheckbox) {
      autoAimCheckbox.disabled = !unlocked;
    }

    if (autoAimTooltip) {
      autoAimTooltip.style.display = unlocked ? 'none' : 'inline';
    }

    if (unlocked) {
      // Auto-aim unlocked — no console output needed
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // COMIC-BOOK GAME DIALOG SYSTEM
  // Replaces browser confirm() and alert() with styled in-game dialogs
  // ═══════════════════════════════════════════════════════════════════════════

  function showGameDialog(title, message, onConfirm, onCancel) {
    const overlay = document.getElementById('game-dialog-overlay');
    if (!overlay) return;

    const titleEl = overlay.querySelector('.game-dialog-title');
    const textEl = overlay.querySelector('.game-dialog-text');
    const confirmBtn = overlay.querySelector('.game-dialog-confirm');
    const cancelBtn = overlay.querySelector('.game-dialog-cancel');

    if (titleEl) titleEl.textContent = title || '';
    if (textEl) textEl.textContent = message || '';

    overlay.style.display = 'flex';

    // Clone buttons to remove old listeners
    const newConfirm = confirmBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newConfirm.addEventListener('click', function() {
      overlay.style.display = 'none';
      if (typeof onConfirm === 'function') onConfirm();
    });

    newCancel.addEventListener('click', function() {
      overlay.style.display = 'none';
      if (typeof onCancel === 'function') onCancel();
    });
  }

  // Expose dialog system globally
  window.showGameDialog = showGameDialog;

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT & LINKING TAB
  // ═══════════════════════════════════════════════════════════════════════════
  (function _initAccountLinkingTab() {
    var LINK_REWARD = { gold: 1000, gems: 25 };

    // Inject CSS once
    if (!document.getElementById('acct-link-style')) {
      var s = document.createElement('style');
      s.id = 'acct-link-style';
      s.textContent = [
        '@keyframes alRewardPop{0%{opacity:0;transform:scale(0.7)}60%{transform:scale(1.15)}100%{opacity:1;transform:scale(1)}}',
        '.al-btn{display:flex;align-items:center;gap:10px;width:100%;padding:11px 16px;',
          'margin-bottom:10px;border-radius:10px;border:2px solid;cursor:pointer;',
          'font-family:"Bangers",cursive;font-size:1.05em;letter-spacing:1px;',
          'background:rgba(0,0,0,0.4);color:#fff;transition:transform .15s,box-shadow .15s;}',
        '.al-btn:active{transform:scale(0.96);}',
        '.al-btn.linked{opacity:0.55;cursor:default;}',
        '.al-btn.apple{border-color:#fff;} .al-btn.google{border-color:#4285F4;} .al-btn.web{border-color:#00eeff;}',
        '.al-btn:hover:not(.linked){box-shadow:0 0 12px currentColor;}',
        '#al-reward-popup{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);',
          'background:linear-gradient(135deg,#1a1a2e,#0d1020);border:3px solid #FFD700;',
          'border-radius:14px;padding:28px 36px;text-align:center;z-index:9999;',
          'font-family:"Bangers",cursive;color:#FFD700;font-size:1.4em;letter-spacing:2px;',
          'box-shadow:0 0 40px #FFD700aa;animation:alRewardPop .4s ease-out;}',
      ].join('');
      document.head.appendChild(s);
    }

    function _showLinkReward(providerName) {
      var popup = document.createElement('div');
      popup.id = 'al-reward-popup';
      popup.innerHTML = '🔗 ' + providerName + ' LINKED!<br>'
        + '<span style="font-size:0.75em;color:#fff;">+'
        + LINK_REWARD.gold + ' Gold &nbsp;+' + LINK_REWARD.gems + ' Gems</span><br>'
        + '<button onclick="this.parentNode.remove()" style="margin-top:14px;padding:6px 20px;'
        + 'font-family:Bangers,cursive;background:#FFD700;border:none;border-radius:8px;'
        + 'cursor:pointer;font-size:0.75em;">✓ NICE</button>';
      document.body.appendChild(popup);
      setTimeout(function() { if (popup.parentNode) popup.remove(); }, 4000);
    }

    function _handleLink(provider) {
      var key = 'wds_linked_' + provider;
      var sd = null;
      try { sd = window.getSaveData ? window.getSaveData() : null; } catch(e) {}
      var linked = (sd && sd.accountLinks) || {};

      // Check existing link state — localStorage preferred, saveData as fallback
      var isAlreadyLinked = false;
      try { isAlreadyLinked = !!localStorage.getItem(key); } catch(e) {
        isAlreadyLinked = !!(linked[provider] && linked[provider].isLinked);
      }
      if (isAlreadyLinked) return; // already linked — no duplicate reward

      try { localStorage.setItem(key, '1'); } catch(e) {}

      // Grant one-time reward via save data
      try {
        if (sd) {
          sd.gold = (sd.gold || 0) + LINK_REWARD.gold;
          sd.gems = (sd.gems || 0) + LINK_REWARD.gems;
          linked = sd.accountLinks || {};
          linked[provider] = { isLinked: true, linkedAt: Date.now() };
          sd.accountLinks = linked;
          if (window.saveSaveData) window.saveSaveData();
        }
      } catch(e) {}
      _showLinkReward(provider);
      // Refresh button states in any open panel
      _refreshLinkButtons();
    }

    var _lastPanel = null;

    function _refreshLinkButtons() {
      if (!_lastPanel) return;
      var sd = null;
      try { sd = window.getSaveData ? window.getSaveData() : null; } catch(e) {}
      var savedLinks = (sd && sd.accountLinks) || {};
      ['apple','google','web'].forEach(function(p) {
        var btn = _lastPanel.querySelector('[data-link="' + p + '"]');
        if (!btn) return;
        var isLinked = false;
        try { isLinked = !!localStorage.getItem('wds_linked_' + p); } catch(e) {
          isLinked = !!(savedLinks[p] && savedLinks[p].isLinked);
        }
        if (isLinked) {
          btn.classList.add('linked');
          btn.querySelector('.al-status').textContent = '✔ Linked';
        }
      });
    }

    function _buildLinkingPanel(container) {
      _lastPanel = container;
      container.innerHTML = '';
      var title = document.createElement('div');
      title.style.cssText = 'color:#FFD700;font-family:"Bangers",cursive;font-size:1.2em;letter-spacing:2px;margin-bottom:14px;';
      title.textContent = '🔗 ACCOUNT & LINKING';
      container.appendChild(title);

      var desc = document.createElement('div');
      desc.style.cssText = 'color:#aaa;font-family:Arial,sans-serif;font-size:12px;margin-bottom:16px;';
      desc.textContent = 'Link your account to earn a one-time reward of +' + LINK_REWARD.gold + ' Gold & +' + LINK_REWARD.gems + ' Gems.';
      container.appendChild(desc);

      var providers = [
        { id: 'apple',  label: '🍎 Login with Apple',      cls: 'apple' },
        { id: 'google', label: '🌐 Login with Google',      cls: 'google' },
        { id: 'web',    label: '🔗 Link Web Account',       cls: 'web' }
      ];

      providers.forEach(function(p) {
        var btn = document.createElement('button');
        btn.className = 'al-btn ' + p.cls;
        btn.setAttribute('data-link', p.id);
        var already = false;
        try { already = !!localStorage.getItem('wds_linked_' + p.id); } catch(e) {
          var _sd2 = null;
          try { _sd2 = window.getSaveData ? window.getSaveData() : null; } catch(e2) {}
          already = !!(_sd2 && _sd2.accountLinks && _sd2.accountLinks[p.id] && _sd2.accountLinks[p.id].isLinked);
        }
        if (already) btn.classList.add('linked');
        var statusSpan = document.createElement('span');
        statusSpan.className = 'al-status';
        statusSpan.style.cssText = 'margin-left:auto;font-size:0.8em;color:#2ecc71;';
        statusSpan.textContent = already ? '✔ Linked' : '';
        btn.innerHTML = p.label + ' ';
        btn.appendChild(statusSpan);
        btn.onclick = function() {
          if (btn.classList.contains('linked')) return;
          _handleLink(p.id);
        };
        container.appendChild(btn);
      });
    }

    // Hook into settings modal: add tab button when modal opens
    var _settingsTabInjected = false;
    var _origOpen = window.openSettings;

    function _injectLinkTab() {
      if (_settingsTabInjected) return;
      var scroll = document.querySelector('#settings-modal .settings-scroll');
      if (!scroll) return;
      _settingsTabInjected = true;

      // Add a section separator and the linking panel directly inside the settings scroll
      var sep = document.createElement('div');
      sep.className = 'settings-section-label';
      sep.textContent = 'ACCOUNT & LINKING';
      sep.style.marginTop = '16px';
      scroll.appendChild(sep);

      var linkContainer = document.createElement('div');
      linkContainer.style.cssText = 'padding:4px 0;';
      scroll.appendChild(linkContainer);
      _buildLinkingPanel(linkContainer);
    }

    // Try to inject after a short delay to ensure modal DOM exists
    setTimeout(_injectLinkTab, 1200);

    // Also expose for manual calls
    window.showAccountLinkingPanel = function(container) {
      if (container) _buildLinkingPanel(container);
    };
  })();

})();
