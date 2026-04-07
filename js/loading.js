    // Standalone loading script - runs independently before module loads
    // Prevents race condition where buttons don't work because event listeners aren't attached yet
    
    (function() {
      // Initialize flags
      window.gameModuleReady = false;
      window.loadingComplete = false;
      
      // Shared utility: make menu buttons visible when the game is in fallback/error mode.
      // Normally buttons are transparent overlays on a background image; this makes them
      // clickable even when the background doesn't align or init failed.
      window._applyFallbackButtonStyles = function(btn) {
        if (!btn) return;
        btn.style.background = 'linear-gradient(to bottom, #2980B9, #1A5276)';
        btn.style.color = '#FFFFFF';
        btn.style.border = '3px solid #5DADE2';
        btn.style.textShadow = '0 0 8px rgba(93,173,226,0.8)';
        btn.style.fontSize = '20px';
        btn.style.fontWeight = 'bold';
        btn.style.borderRadius = '12px';
      };

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLoading);
      } else {
        initLoading();
      }
      
      function initLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        const loadingBar = document.getElementById('loading-bar');
        
        if (!loadingScreen || !loadingBar) {
          console.error('[Loading] Loading elements not found');
          return;
        }

        // Fast-boot path: when returning from a sandbox run skip the fake progress
        // animation and poll for gameModuleReady immediately so camp appears faster.
        var quickBoot = false;
        try { quickBoot = !!localStorage.getItem('wds_fromSandbox'); } catch (e) {}
        if (quickBoot) {
          console.log('[Loading] wds_fromSandbox detected — skipping loading animation, fast-booting camp');
          loadingBar.style.width = '100%';
          window.loadingComplete = true;
          waitForModuleReady();
          return;
        }
        
        let progress = 0;
        let progressInterval;
        
        // Animate loading bar from 0% to 100% over ~8 seconds
        function updateProgress() {
          progress += 2.5; // 2.5% per step
          loadingBar.style.width = progress + '%';
          
          if (progress >= 100) {
            clearInterval(progressInterval);
            window.loadingComplete = true;
            
            // Wait for module to be ready before showing menu
            waitForModuleReady();
          }
        }
        
        // Start progress animation
        progressInterval = setInterval(updateProgress, 200); // 40 steps × 200ms = 8s
        
        // 15-second failsafe timeout - show menu anyway if module fails to load
        setTimeout(function() {
          if (!window.gameModuleReady) {
            console.warn('[Loading] Failsafe timeout - showing menu without module ready signal');
            clearInterval(progressInterval);
            window.loadingComplete = true;
            showMenuAfterLoading();
          }
        }, 15000);
      }
      
      // Wait for module to signal ready, then show menu
      function waitForModuleReady() {
        let attempts = 0;
        const maxAttempts = 50; // 50 × 100ms = 5s max wait
        
        const checkInterval = setInterval(function() {
          attempts++;
          
          if (window.gameModuleReady) {
            // Module is ready!
            clearInterval(checkInterval);
            showMenuAfterLoading();
          } else if (attempts >= maxAttempts) {
            // Timeout - show anyway
            console.warn('[Loading] Module ready timeout - showing menu anyway');
            clearInterval(checkInterval);
            showMenuAfterLoading();
          }
        }, 100);
      }
      
      function showMenuAfterLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (!loadingScreen) return;

        // Check for return-from-sandbox flag. When set, we skip the main-menu even
        // if init had an error, because camp-world.js can warm up independently.
        var returnFromSandbox = false;
        try {
          returnFromSandbox = !!localStorage.getItem('wds_fromSandbox');
          if (returnFromSandbox) localStorage.removeItem('wds_fromSandbox');
        } catch (e) { /* localStorage unavailable — ignore */ }

        // Log the state for debugging
        const initOk = window.gameModuleReady && !window.gameInitError;
        console.log('[Loading] Force booting to 3D camp — initOk:', initOk,
          'gameModuleReady:', window.gameModuleReady,
          'initError:', !!window.gameInitError, 'returnFromSandbox:', returnFromSandbox);

        // ── FORCE CAMP BOOT: show camp screen WHILE loading screen is still fully opaque ──
        // This prevents any flash of the raw THREE.js scene or 2D building cards.
        var campScreen = document.getElementById('camp-screen');
        var mainMenuEl = document.getElementById('main-menu');

        // Force hide main menu permanently
        if (mainMenuEl) mainMenuEl.style.display = 'none';

        // Show camp screen (still hidden behind the opaque loading screen)
        if (campScreen) {
          campScreen.classList.remove('camp-subsection-active');
          campScreen.style.display = 'flex';
        }

        // Helper: fade out the loading screen after CampWorld has rendered its first frame
        function fadeLoadingScreen() {
          loadingScreen.classList.add('fade-out');
          setTimeout(function() { loadingScreen.style.display = 'none'; }, 500);
        }

        // Helper: call updateCampScreen, then wait 2 rAFs so CampWorld renders before revealing.
        // A setTimeout fallback guarantees the fade even when rAF is throttled (background tabs,
        // slow start-up, power-saving mode, etc.).
        function bootCamp() {
          try {
            window.updateCampScreen();
            console.log('[Loading] CampWorld initialized successfully');
          } catch (e) {
            console.error('[Loading] updateCampScreen error:', e);
            console.log('[Loading] Continuing with camp display despite error - CampWorld may self-initialize');
          }

          // ── Safety net ────────────────────────────────────────────────────
          // Regardless of whether updateCampScreen() succeeded, make absolutely sure:
          // 1. The game-container canvas is visible (not hidden by a prior 2D-mode call).
          // 2. The camp-screen has camp-3d-mode so the solid background doesn't block the canvas.
          // These are idempotent and harmless if updateCampScreen already handled them.
          var _gcEl = document.getElementById('game-container');
          if (_gcEl) _gcEl.style.display = 'block';
          var _csEl = document.getElementById('camp-screen');
          if (_csEl) _csEl.classList.add('camp-3d-mode');

          // Two nested rAFs let CampWorld.enter() issue its first render call and give
          // the GPU a chance to draw before we reveal the scene.
          var fadeDone = false;
          function safeFade() {
            if (fadeDone) return;
            fadeDone = true;
            fadeLoadingScreen();
          }
          requestAnimationFrame(function() {
            requestAnimationFrame(safeFade);
          });
          // Fallback: if rAF is paused (background tab, throttled browser), fade after 2s.
          setTimeout(safeFade, 2000);
        }

        // Initialize camp - attempt even if init wasn't perfect
        if (typeof window.updateCampScreen === 'function') {
          bootCamp();
        } else {
          console.warn('[Loading] updateCampScreen not yet available - polling until ready (max 10s)');
          // Poll for updateCampScreen to become available (100 × 100ms = 10s max)
          var pollAttempts = 0;
          var maxPollAttempts = 100;
          var campPollInterval = setInterval(function() {
            pollAttempts++;
            if (typeof window.updateCampScreen === 'function') {
              clearInterval(campPollInterval);
              console.log('[Loading] updateCampScreen available after ' + pollAttempts + ' polls — initializing camp');
              bootCamp();
            } else if (pollAttempts >= maxPollAttempts) {
              clearInterval(campPollInterval);
              console.warn('[Loading] updateCampScreen never became available after 10s — fading anyway');
              fadeLoadingScreen();
            }
          }, 100);
        }
      }
    })();
