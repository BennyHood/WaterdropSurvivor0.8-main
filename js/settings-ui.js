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

    if (!settingsBtn || !settingsModal || !closeBtn) {
      console.warn('[SettingsUI] Required elements not found');
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
        if (window.location.pathname.indexOf('sandbox.html') !== -1) {
          try {
            localStorage.setItem('wds_fromSandbox', '1');
          } catch (e) { /* ignore */ }
          window.location.href = 'index.html';
        } else {
          // Already on camp hub — navigate in-page
          if (typeof window.updateCampScreen === 'function') {
            window.updateCampScreen();
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
              console.log('[SettingsUI] Manual mode: Full Blood/Gore rendering ENABLED');
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

        console.log('[SettingsUI] Particle effects', enabled ? 'enabled' : 'disabled');
      });
    }

    // ─── Auto-Aim Checkbox ───
    if (autoAimCheckbox) {
      autoAimCheckbox.addEventListener('change', function() {
        if (window.gameSettings) {
          window.gameSettings.autoAim = this.checked;
          saveSettings();
          console.log('[SettingsUI] Auto-aim', this.checked ? 'enabled' : 'disabled');
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
          console.log('[SettingsUI] Sound', this.checked ? 'enabled' : 'disabled');
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
          musicEnabled: window.gameSettings.musicEnabled !== false
        };

        localStorage.setItem('waterDropSurvivorSettings', JSON.stringify(settingsToSave));
        console.log('[SettingsUI] Settings saved:', settingsToSave);

      } catch (e) {
        console.error('[SettingsUI] Failed to save settings:', e);
      }
    }

    // ─── Expose function to refresh UI from outside ───
    window.refreshSettingsUI = function() {
      loadSettingsIntoUI();
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
      console.log('[SettingsUI] Auto-aim unlocked and enabled in settings');
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

})();
