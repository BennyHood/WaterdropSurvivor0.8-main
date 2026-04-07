// js/game-loop.js — Performance logging, FPS watchdog, day/night cycle update,
// and the main animate() game loop (collision detection, AI updates, rendering).
// This is the last file loaded — it starts the game by calling init().

    // ─── Projectile pool helper — zero allocation in the animate loop ───────────────
    // Uses window._projectilePool (EnhancedObjectPool) when available; falls back to
    // direct construction so the game works even if the pool hasn't been initialised yet.

    // Distance within which the Hunting Knife instantly kills wildlife.
    const KNIFE_KILL_RANGE = 2.2;

    // ─── Bullet Tracer Trails ───────────────────────────────────────────────────
    // Array of { mesh, life } objects — faded and removed over ~150ms (9 frames).
    // Populated by Projectile.update(); cleared by the main animate() loop below.
    window.bulletTrails = [];

    // ─── Neural Matrix: Event Horizon black holes ────────────────────────────────
    // Each entry: { x, z, timer (seconds remaining), mesh }
    window._eventHorizonHoles = [];

    // Pool of pre-allocated hole mesh pairs to avoid per-spawn geometry allocation.
    // Pairs are hidden when inactive and re-used when a new hole is requested.
    const EVENT_HORIZON_POOL_SIZE = 8;
    const _eventHorizonMeshPool = []; // { sphere, ring, inUse }
    let _eventHorizonPoolReady = false;

    function _initEventHorizonPool() {
      if (_eventHorizonPoolReady || typeof THREE === 'undefined' || typeof scene === 'undefined') return;
      const sphereGeo = new THREE.SphereGeometry(0.9, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 });
      const ringGeo   = new THREE.RingGeometry(0.9, 1.4, 32);
      const ringMat   = new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      for (let _hi = 0; _hi < EVENT_HORIZON_POOL_SIZE; _hi++) {
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.visible = false;
        scene.add(sphere);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        scene.add(ring);
        sphere._glowRing = ring;
        _eventHorizonMeshPool.push({ sphere, ring, inUse: false });
      }
      _eventHorizonPoolReady = true;
    }

    function _acquireEventHorizonMesh() {
      _initEventHorizonPool();
      for (let _hi = 0; _hi < _eventHorizonMeshPool.length; _hi++) {
        if (!_eventHorizonMeshPool[_hi].inUse) {
          _eventHorizonMeshPool[_hi].inUse = true;
          return _eventHorizonMeshPool[_hi];
        }
      }
      return null; // pool exhausted (all 8 holes active simultaneously)
    }

    function _releaseEventHorizonMesh(pair) {
      if (!pair) return;
      pair.sphere.visible = false;
      pair.ring.visible   = false;
      pair.inUse = false;
    }

    // ─── Neural Matrix: active blood pool counter (for Blood Alchemy regen) ─────
    // Incremented by emitPoolGrow wrapper, decremented on expiry.
    window._activeBloodPools = 0;

    // Spawn a black-hole ground vortex for the Event Horizon upgrade.
    window._spawnEventHorizon = function (pos) {
      if (!window._eventHorizonHoles) window._eventHorizonHoles = [];
      let holeMesh = null;
      if (typeof THREE !== 'undefined' && typeof scene !== 'undefined') {
        const pair = _acquireEventHorizonMesh();
        if (pair) {
          holeMesh = pair.sphere;
          holeMesh.position.set(pos.x, 0.12, pos.z);
          holeMesh.scale.set(1, 1, 1);
          holeMesh.visible = true;
          pair.ring.position.set(pos.x, 0.12, pos.z);
          pair.ring.visible = true;
          holeMesh._glowRing = pair.ring;
          holeMesh._poolPair = pair;
        }
      }
      window._eventHorizonHoles.push({ x: pos.x, z: pos.z, timer: 1.5, mesh: holeMesh });
    };

    function _spawnProjectile(x, z, target) {
      if (window._projectilePool) {
        return window._projectilePool.get().reinit(x, z, target);
      }
      return new Projectile(x, z, target);
    }

    /**
     * Rescale a projectile's pre-computed vx/vz so it travels at desiredSpeed.
     * reinit() computes velocity using the constructor's base speed (0.4); any
     * per-weapon speed override must call this AFTER _spawnProjectile() to take effect.
     *
     * @param {Projectile} p            - Freshly spawned projectile.
     * @param {number}     desiredSpeed - Target world-units-per-frame speed.
     */
    function _rescaleProjSpeed(p, desiredSpeed) {
      const curSpeed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      if (curSpeed > 0) {
        const ratio = desiredSpeed / curSpeed;
        p.vx *= ratio;
        p.vz *= ratio;
      }
    }

    // ─── Shared geometries/materials for hot-path effects (avoid per-frame allocation) ───
    let _sharedGoreGeo = null;      // DodecahedronGeometry for gore blobs
    let _sharedGoreMats = [null, null]; // Two alternating MeshStandardMaterials
    let _sharedLavaGeo  = null;     // SphereGeometry for lava spout particles
    let _sharedLavaMats = [null, null]; // Two color variants
    // Shared lightning bolt materials (avoid creating new materials per bolt)
    let _sharedBoltMat = null;
    let _sharedGlowMat = null;
    // Shared smoke geometry (avoid per-particle geometry creation)
    let _sharedSmokeGeo = null;
    // Cached homing missile geometries/materials (avoid per-missile creation)
    let _missileGeoCache = null;

    function _ensureSharedGeo() {
      if (typeof THREE === 'undefined') return;
      if (!_sharedGoreGeo) {
        _sharedGoreGeo = new THREE.DodecahedronGeometry(0.09, 0);
        _sharedGoreMats[0] = new THREE.MeshStandardMaterial({ color: 0x6B0000, roughness: 0.9 });
        _sharedGoreMats[1] = new THREE.MeshStandardMaterial({ color: 0x4B0082, roughness: 0.9 });
      }
      if (!_sharedLavaGeo) {
        _sharedLavaGeo = new THREE.SphereGeometry(0.15, 4, 4);
        _sharedLavaMats[0] = new THREE.MeshBasicMaterial({ color: 0xFF4500 });
        _sharedLavaMats[1] = new THREE.MeshBasicMaterial({ color: 0xFF8C00 });
      }
      if (!_sharedBoltMat) {
        _sharedBoltMat = new THREE.LineBasicMaterial({ color: 0xFFFF00, transparent: true, opacity: 1.0, linewidth: 2 });
        _sharedGlowMat = new THREE.LineBasicMaterial({ color: 0x88DDFF, transparent: true, opacity: 0.6, linewidth: 3 });
      }
      if (!_sharedSmokeGeo) {
        _sharedSmokeGeo = new THREE.SphereGeometry(0.15, 4, 4);
      }
      if (!_missileGeoCache) {
        _missileGeoCache = {
          bodyGeo: new THREE.SphereGeometry(0.3, 8, 8),
          bodyMat: new THREE.MeshToonMaterial({ color: 0x222222 }),
          noseGeo: new THREE.ConeGeometry(0.2, 0.3, 6),
          noseMat: new THREE.MeshToonMaterial({ color: 0x111111 }),
          armGeo: new THREE.BoxGeometry(0.5, 0.08, 0.15),
          armMat: new THREE.MeshToonMaterial({ color: 0x111111 }),
          eyeGeo: new THREE.SphereGeometry(0.08, 6, 6),
          eyeWhiteMat: new THREE.MeshBasicMaterial({ color: 0xFFFFFF }),
          pupilGeo: new THREE.SphereGeometry(0.04, 4, 4),
          pupilMat: new THREE.MeshBasicMaterial({ color: 0x000000 })
        };
      }
    }

    function _ensureSmokePool() {
      if (_smokePool || typeof ObjectPool === 'undefined' || typeof THREE === 'undefined') return;
      _ensureSharedGeo();
      const _smokeGeoRef = (typeof _sharedSmokeSphereGeo !== 'undefined' && _sharedSmokeSphereGeo)
        ? _sharedSmokeSphereGeo
        : _sharedSmokeGeo;
      _smokePool = new ObjectPool(
        () => {
          const mesh = new THREE.Mesh(_smokeGeoRef, new THREE.MeshBasicMaterial({
            color: 0x666666,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
          }));
          mesh.visible = false;
          return {
            mesh,
            material: mesh.material,
            geometry: _smokeGeoRef,
            velocity: { x: 0, y: 0, z: 0 },
            life: 0,
            maxLife: GAME_CONFIG.smokeDurationFrames
          };
        },
        (entry) => {
          entry.mesh.visible = false;
          entry.mesh.position.set(0, -9999, 0);
          entry.velocity.x = entry.velocity.y = entry.velocity.z = 0;
          entry.material.opacity = 0.5;
          if (entry.material.color) entry.material.color.setHex(0x666666);
          entry.life = 0;
          entry.maxLife = GAME_CONFIG.smokeDurationFrames;
        },
        MAX_SMOKE_PARTICLES
      );
    }

    function _ensureLavaPool() {
      if (_lavaPool || typeof ObjectPool === 'undefined' || typeof THREE === 'undefined') return;
      _ensureSharedGeo();
      _lavaPool = new ObjectPool(
        () => {
          const mesh = new THREE.Mesh(_sharedLavaGeo, _sharedLavaMats[0]);
          mesh.visible = false;
          return { mesh, vx: 0, vy: 0, vz: 0, life: 0 };
        },
        (entry) => {
          entry.mesh.visible = false;
          entry.mesh.position.set(0, -9999, 0);
          entry.vx = entry.vy = entry.vz = 0;
          entry.life = 0;
        },
        MAX_LAVA_PARTICLES
      );
    }

    // ─── Hit-Stop (Micro-Freeze) ────────────────────────────────────────────────────
    // Instantly freezes time for a short window (50–80 ms) to add weight to heavy blows.
    // Uses DopamineSystem.TimeDilation.snap(0) for an immediate freeze then lerps back.
    let _hitStopUntilMs = 0; // timestamp (ms) when the hit-stop ends

    /**
     * Trigger a hit-stop (micro-freeze).
     * @param {number} durationMs - Freeze duration in milliseconds (recommended 50–80).
     */
    function triggerHitStop(durationMs) {
      if (!window.DopamineSystem || !window.DopamineSystem.TimeDilation) return;
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      // Don't stack — only extend if a new hit-stop is longer
      if (nowMs + durationMs <= _hitStopUntilMs) return;
      _hitStopUntilMs = nowMs + durationMs;
      window.DopamineSystem.TimeDilation.snap(0);
    }
    // Expose globally so projectile-classes.js and enemy-class.js can call it
    window.triggerHitStop = triggerHitStop;

    // ─── Muzzle Flash PointLight Pool ──────────────────────────────────────────────
    // Pre-allocate 3 reusable PointLights instead of creating new ones every shot.
    // This eliminates GPU shader recompilations that caused FPS drops during combat.
    const FLASH_POOL_SIZE = 3;
    let _flashPool = null;
    // Reusable temporary vector for _acquireFlash callers (avoids per-shot clone allocations).
    // Initialized at script load time — THREE CDN is always loaded before game-loop.js.
    const _flashTempPos = new THREE.Vector3();
    // Reusable temp vectors for weapon targeting — avoids per-shot Vector3 allocations
    const _tmpGunTarget = new THREE.Vector3();
    const _tmpSpreadTarget = new THREE.Vector3();
    const _tmpShotgunDir = new THREE.Vector3();
    const _tmpShotgunTarget = new THREE.Vector3();
    const _tmpBoltStart = new THREE.Vector3();
    const _tmpBoltEnd = new THREE.Vector3();
    const _tmpKnockback = new THREE.Vector3();
    // Additional reusable temp vectors for homing missile, whip, tesla arcs
    const _tmpMissileDesired = new THREE.Vector3();
    const _tmpWhipLastPos = new THREE.Vector3();
    const _tmpBoltPoint = new THREE.Vector3();
    const _tmpArcMid = new THREE.Vector3();
    // Pre-allocated missile velocity pool — round-robin of 4 vectors so multiple simultaneous
    // missiles can each have an independent persistent velocity without allocating on launch.
    const _missileVelPool = [
      new THREE.Vector3(), new THREE.Vector3(),
      new THREE.Vector3(), new THREE.Vector3()
    ];
    let _missileVelIdx = 0;
    // Pre-allocated temporaries for instanced eye-batch sync (zero allocation per frame)
    const _eyeSyncPos   = new THREE.Vector3();
    const _eyeSyncEuler = new THREE.Euler();   // identity (0,0,0) — eyes are spheres, no rotation needed
    const _eyeSyncScale = new THREE.Vector3(1, 1, 1);

    // ─── Frustum Culling ────────────────────────────────────────────────────────
    // Reusable Frustum + matrix objects — updated once per frame.
    // Used to skip update()/collision logic for off-screen entities.
    const _frustum         = new THREE.Frustum();
    const _frustumProjMat  = new THREE.Matrix4();
    // Scratch sphere for intersectsSphere checks (margin = 2 world units)
    const _frustumSphere   = new THREE.Sphere(new THREE.Vector3(), 2);

    /** Returns true when `pos` is inside the camera frustum (plus a 2-unit margin). */
    function _isInFrustum(pos) {
      _frustumSphere.center.copy(pos);
      return _frustum.intersectsSphere(_frustumSphere);
    }

    /** Update the frustum from the current camera matrices (call once per frame). */
    function _updateFrustum() {
      _frustumProjMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_frustumProjMat);
    }


    function _ensureFlashPool(sceneRef) {
      if (_flashPool !== null || typeof THREE === 'undefined') return;
      _flashPool = [];
      for (let i = 0; i < FLASH_POOL_SIZE; i++) {
        const pl = new THREE.PointLight(0xFFFFFF, 0, 1);
        pl.castShadow = false;
        pl.position.set(0, -9999, 0); // parked off-screen when idle
        pl._poolExpireAt = 0;
        sceneRef.add(pl);
        _flashPool.push(pl);
      }
    }

    // Acquire a pooled PointLight, configure it, and auto-dim after `duration` ms.
    // Reuses the slot whose expiry is furthest in the past so concurrent flashes work.
    function _acquireFlash(sceneRef, color, intensity, radius, pos, duration) {
      _ensureFlashPool(sceneRef);
      if (!_flashPool) return;
      const now = performance.now ? performance.now() : Date.now();
      let best = _flashPool[0];
      for (let i = 1; i < _flashPool.length; i++) {
        if (_flashPool[i]._poolExpireAt <= now) { best = _flashPool[i]; break; }
        if (_flashPool[i]._poolExpireAt < best._poolExpireAt) best = _flashPool[i];
      }
      best.color.setHex(color);
      best.intensity = intensity;
      best.distance = radius;
      best.position.copy(pos);
      best._poolExpireAt = now + duration;
      // Timeout just dims the light; harmless if called after a game reset because
      // game-over-reset.js already zeros all pool lights synchronously on reset.
      setTimeout(() => {
        best.intensity = 0;
        best.position.set(0, -9999, 0);
        best._poolExpireAt = 0;
      }, duration);
    }

    // --- MAIN LOOP ---
    // Performance tracking for freeze bug investigation
    let performanceLog = {
      frameCount: 0,
      lastLogTime: 0,
      totalFrameTime: 0, // Tracks the time taken by the previous frame (0 on first frame)
      slowFrames: 0,
      spawnCount: 0,
      renderCount: 0,
      lastEnemyCount: 0,
      cumulativeFrameTime: 0, // Track cumulative time for accurate average
      // FRESH: FPS watchdog - rolling 10-frame average
      recentFrameTimes: [],
      rollingAvgFPS: 60,
      particleThrottleActive: false,
      particleThrottleScale: 1.0, // Granular: 1.0 = full, 0.25 = 25%
      qualityParticleScale: 1.0,  // Set by applyGraphicsQuality per quality level
      consecutiveSkipCount: 0, // Track consecutive skipped renders to prevent frozen screen
      gameLogicErrorCount: 0  // Track consecutive game logic errors (freeze detection)
    };
    // Expose for cross-script FPS-based throttling (BloodSystem, etc.)
    window.performanceLog = performanceLog;
    
    // Pixel ratio dynamic scaler constants
    const _PR_MIN = 0.6;        // Minimum pixel ratio floor
    const _PR_STEP_DOWN = 0.1;  // Step down when FPS < 45 for 3s
    const _PR_STEP_UP   = 0.05; // Step up when FPS > 58 for 5s
    const _PR_LOW_FPS_THRESHOLD  = 45;   // FPS below this triggers reduction
    const _PR_HIGH_FPS_THRESHOLD = 58;   // FPS above this triggers recovery
    const _PR_LOW_DURATION_MS    = 3000; // 3 consecutive seconds below low threshold
    const _PR_HIGH_DURATION_MS   = 5000; // 5 consecutive seconds above high threshold
    
    // FRESH: FPS Watchdog - Update rolling average and throttle particles if needed
    function updateFPSWatchdog(frameTime) {
      // Add current frame time to rolling window
      performanceLog.recentFrameTimes.push(frameTime);
      
      // Keep only last 10 frames
      if (performanceLog.recentFrameTimes.length > 10) {
        performanceLog.recentFrameTimes.shift();
      }
      
      // Calculate rolling average FPS
      if (performanceLog.recentFrameTimes.length === 10) {
        const avgFrameTime = performanceLog.recentFrameTimes.reduce((a, b) => a + b, 0) / 10;
        performanceLog.rollingAvgFPS = 1000 / avgFrameTime; // Convert ms to FPS
        
        // Granular particle throttling based on FPS tiers
        const fps = performanceLog.rollingAvgFPS;
        let newScale;
        if (fps < 20) {
          newScale = 0.25; // Critical: 25% particles
        } else if (fps < 30) {
          newScale = 0.50; // Low: 50% particles
        } else if (fps < 45) {
          newScale = 0.75; // Medium: 75% particles
        } else {
          newScale = 1.0;  // Good: full particles
        }
        
        // Apply with hysteresis: only restore when FPS is 5 above threshold
        if (newScale < performanceLog.particleThrottleScale) {
          performanceLog.particleThrottleScale = newScale;
          performanceLog.particleThrottleActive = newScale < 1.0;
          // console.warn(`FPS watchdog: FPS=${fps.toFixed(1)}, particles at ${(newScale*100).toFixed(0)}%`); // REMOVED: hot-path performance
        } else if (fps >= 50 && performanceLog.particleThrottleScale < 1.0) {
          performanceLog.particleThrottleScale = 1.0;
          performanceLog.particleThrottleActive = false;
          // console.log(`FPS watchdog: FPS recovered (${fps.toFixed(1)}), restoring full particles`); // REMOVED: hot-path performance
        } else if (fps >= 35 && performanceLog.particleThrottleScale < 0.75) {
          performanceLog.particleThrottleScale = 0.75;
        } else if (fps >= 25 && performanceLog.particleThrottleScale < 0.50) {
          performanceLog.particleThrottleScale = 0.50;
        }

        // Dynamic pixel ratio scaler: auto-reduce on sustained low FPS, restore on high FPS
        if (renderer) {
          const _prNow = performance.now();
          if (fps < _PR_LOW_FPS_THRESHOLD) {
            if (!performanceLog._pixelRatioLowFPSStart) performanceLog._pixelRatioLowFPSStart = _prNow;
            else if (_prNow - performanceLog._pixelRatioLowFPSStart >= _PR_LOW_DURATION_MS) {
              const cur = window._currentPixelRatio || renderer.getPixelRatio();
              if (cur > _PR_MIN) {
                const next = Math.max(_PR_MIN, Math.round((cur - _PR_STEP_DOWN) * 100) / 100);
                window._currentPixelRatio = next;
                renderer.setPixelRatio(next);
                // console.warn(`[PixelRatio] FPS=${fps.toFixed(0)}<${_PR_LOW_FPS_THRESHOLD}: reduced to ${next.toFixed(2)}`); // REMOVED: hot-path performance
              }
              performanceLog._pixelRatioLowFPSStart = _prNow; // reset to throttle future changes
            }
            performanceLog._pixelRatioHighFPSStart = 0;
          } else if (fps > _PR_HIGH_FPS_THRESHOLD) {
            if (!performanceLog._pixelRatioHighFPSStart) performanceLog._pixelRatioHighFPSStart = _prNow;
            else if (_prNow - performanceLog._pixelRatioHighFPSStart >= _PR_HIGH_DURATION_MS) {
              const maxPR = window.devicePixelRatio || 1;
              const cur = window._currentPixelRatio || renderer.getPixelRatio();
              if (cur < maxPR) {
                const next = Math.min(maxPR, Math.round((cur + _PR_STEP_UP) * 100) / 100);
                window._currentPixelRatio = next;
                renderer.setPixelRatio(next);
                // console.log(`[PixelRatio] FPS=${fps.toFixed(0)}>${_PR_HIGH_FPS_THRESHOLD}: increased to ${next.toFixed(2)}`); // REMOVED: hot-path performance
              }
              performanceLog._pixelRatioHighFPSStart = _prNow; // reset to throttle future changes
            }
            performanceLog._pixelRatioLowFPSStart = 0;
          } else {
            performanceLog._pixelRatioLowFPSStart = 0;
            performanceLog._pixelRatioHighFPSStart = 0;
          }
        }
      }
    }
    
    // Enhance spawnParticles to respect throttle + quality particle scale
    // Use window.spawnParticles explicitly so the reassignment works correctly across
    // separate <script> files that share the global scope (function declarations live
    // on window, not in a per-script lexical scope, so window.x is the canonical reference)
    if (typeof window.spawnParticles === 'function') {
      const originalSpawnParticles = window.spawnParticles;
      // Per-frame particle budget to prevent GC stutter from too many spawn calls
      let _particleFrameBudget = 0;
      let _particleFrameNum    = -1;
      const _MAX_DAMAGE_PARTICLES_PER_FRAME = 5;

      window.spawnParticles = function(position, color, count) {
        // Combine FPS-based throttle with quality-preset particle scale
        const qualityScale = performanceLog.qualityParticleScale || 1.0;
        const adjustedCount = Math.ceil(count * performanceLog.particleThrottleScale * qualityScale);
        if (adjustedCount <= 0) return;

        // Per-frame cap: max 5 particle spawn calls per frame to prevent GC stutter.
        // Uses performanceLog.frameCount (incremented once per animate() tick) as frame
        // identifier. Falls back to Math.floor(performance.now() / 16) (~60fps buckets)
        // if frameCount is unavailable or stale (e.g. outside the main game loop).
        const curFrame = (performanceLog.frameCount > 0)
          ? performanceLog.frameCount
          : Math.floor(performance.now() / 16);
        if (curFrame !== _particleFrameNum) {
          _particleFrameNum  = curFrame;
          _particleFrameBudget = 0;
        }
        if (_particleFrameBudget >= _MAX_DAMAGE_PARTICLES_PER_FRAME) return;
        _particleFrameBudget++;

        return originalSpawnParticles(position, color, adjustedCount);
      };
    }

    // ─── Dynamic FPS Booster ────────────────────────────────────────────────────
    // When graphicsQuality === 'auto', monitors rolling FPS every 2 seconds and
    // steps quality up/down through QUALITY_LEVELS to keep FPS ≥ 60.
    // Drops 2 quality levels when FPS < 60, 3 levels when critically low (< 35).
    // Uses hysteresis (separate up/down thresholds) to prevent oscillation.
    let _fpsBoosterLastCheck  = 0;
    let _fpsBoosterCurrentIdx = 3;          // Start at 'medium' (index 3)
    let _fpsBoosterStableCount = 0;         // Frames of stable FPS before up-stepping
    const _FPS_BOOSTER_INTERVAL  = 2000;    // Check every 2 seconds
    const _FPS_TARGET_LOW        = 60;      // Below this → step quality DOWN 2 levels
    const _FPS_TARGET_HIGH       = 100;     // Above this → step quality UP (if stable)
    const _FPS_CRITICAL_LOW      = 35;      // Below this → drop 3 levels at once
    const _FPS_STABILITY_MIN     = 70;      // Must be above this for stable count to grow
    const _FPS_STABLE_CHECKS     = 3;       // Need 3 consecutive stable checks (~6s) before up-stepping

    function updateDynamicFPSBooster(nowMs) {
      // Only active when user selected 'auto'
      if (!window.gameSettings || window.gameSettings.graphicsQuality !== 'auto') return;
      if (!window.QUALITY_LEVELS || !window.QUALITY_PRESETS) return;

      if (nowMs - _fpsBoosterLastCheck < _FPS_BOOSTER_INTERVAL) return;
      _fpsBoosterLastCheck = nowMs;

      const fps = performanceLog.rollingAvgFPS;
      if (!fps || fps <= 0) return;

      const levels = window.QUALITY_LEVELS;
      let idx = _fpsBoosterCurrentIdx;
      let changed = false;

      if (fps < _FPS_CRITICAL_LOW && idx > 0) {
        // Critical: drop 3 levels at once
        idx = Math.max(0, idx - 3);
        _fpsBoosterStableCount = 0;
        changed = true;
      } else if (fps < _FPS_TARGET_LOW && idx > 0) {
        // Below 60 FPS target: step down 2 levels
        idx = Math.max(0, idx - 2);
        _fpsBoosterStableCount = 0;
        changed = true;
      } else if (fps > _FPS_TARGET_HIGH && idx < levels.length - 1) {
        // Above target with headroom: step up if stable
        _fpsBoosterStableCount++;
        if (_fpsBoosterStableCount >= _FPS_STABLE_CHECKS) {
          idx = idx + 1;
          _fpsBoosterStableCount = 0;
          changed = true;
        }
      } else {
        // In the sweet spot (60-100 FPS), accumulate stability
        if (fps >= _FPS_STABILITY_MIN) _fpsBoosterStableCount = Math.min(_fpsBoosterStableCount + 1, _FPS_STABLE_CHECKS);
        else _fpsBoosterStableCount = 0;
      }

      if (changed) {
        _fpsBoosterCurrentIdx = idx;
        const newQuality = levels[idx];
        if (typeof applyGraphicsQuality === 'function') {
          applyGraphicsQuality(newQuality);
        }
        // console.log(`[FPS Booster] FPS=${fps.toFixed(0)} → adjusted to "${newQuality}" (level ${idx}/${levels.length - 1})`); // REMOVED: hot-path performance

        // Update status indicator if visible
        const statusEl = document.getElementById('fps-booster-status');
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.textContent = `Auto: ${newQuality} (${fps.toFixed(0)} FPS)`;
        }
      }
    }
    // Expose so settings UI can read current auto-quality
    window._getFpsBoosterCurrentIdx = function() { return _fpsBoosterCurrentIdx; };
    window._resetFpsBooster = function(idx) { _fpsBoosterCurrentIdx = idx; _fpsBoosterStableCount = 0; };

    // ─── Combat Intensity Tracking ──────────────────────────────────────────────
    // Tracks recent kill rate to drive dynamic shadow-map quality reduction during
    // heavy combat. Lower shadow resolution during intense fights recovers ~5 FPS.
    let _combatKillsInWindow = 0;      // kills in last 3 seconds
    let _combatWindowStart = 0;        // timestamp of window start (ms)
    const COMBAT_WINDOW_MS = 3000;     // 3-second rolling window
    const COMBAT_INTENSITY_HIGH = 5;   // kills/window → reduce shadows
    const COMBAT_INTENSITY_LOW  = 2;   // kills/window → restore shadows
    let _shadowsReducedForCombat = false;

    /**
     * Call once per enemy kill to register for combat intensity.
     * Exposed on window so any script (enemy-class, game-loop) can call it.
     */
    window.registerCombatKill = function() {
      _combatKillsInWindow++;
      // Force shadow map update this frame (death/explosion visual needs fresh shadows)
      window._shadowForceUpdate = true;
    };

    /**
     * Tick combat intensity each frame: age out old kills and apply dynamic
     * shadow-map quality changes if the kill rate crosses thresholds.
     * @param {number} nowMs - current timestamp in milliseconds
     */
    function updateCombatIntensity(nowMs) {
      if (nowMs - _combatWindowStart > COMBAT_WINDOW_MS) {
        _combatKillsInWindow = 0;
        _combatWindowStart = nowMs;
      }

      if (!window.dirLight || !renderer) return;

      if (!_shadowsReducedForCombat && _combatKillsInWindow >= COMBAT_INTENSITY_HIGH) {
        // Heavy combat — drop shadow map to 512 and use faster shadow type
        if (window.dirLight.shadow.mapSize.width !== 512) {
          if (window.dirLight.shadow.map) { window.dirLight.shadow.map.dispose(); window.dirLight.shadow.map = null; }
          window.dirLight.shadow.mapSize.width  = 512;
          window.dirLight.shadow.mapSize.height = 512;
          renderer.shadowMap.type = THREE.PCFShadowMap; // Faster shadow filtering
          renderer.shadowMap.needsUpdate = true;
        }
        _shadowsReducedForCombat = true;
      } else if (_shadowsReducedForCombat && _combatKillsInWindow <= COMBAT_INTENSITY_LOW) {
        // Combat calmed down — restore default shadow quality
        const defaultSize = (typeof RENDERER_CONFIG !== 'undefined' && RENDERER_CONFIG.defaultShadowMapSize) ? RENDERER_CONFIG.defaultShadowMapSize : 1024;
        if (window.dirLight.shadow.mapSize.width !== defaultSize) {
          if (window.dirLight.shadow.map) { window.dirLight.shadow.map.dispose(); window.dirLight.shadow.map = null; }
          window.dirLight.shadow.mapSize.width  = defaultSize;
          window.dirLight.shadow.mapSize.height = defaultSize;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Restore quality shadows
          renderer.shadowMap.needsUpdate = true;
        }
        _shadowsReducedForCombat = false;
      }
    }

    
    // Day/Night Cycle Update - Non-blocking, smooth lighting transitions
    function updateDayNightCycle(dt) {
      if (!dayNightCycle.enabled || !window.ambientLight || !window.dirLight) return;
      
      // Update time of day
      dayNightCycle.timeOfDay += dayNightCycle.cycleSpeed * dt;
      if (dayNightCycle.timeOfDay > 1) dayNightCycle.timeOfDay -= 1;
      
      const t = dayNightCycle.timeOfDay;
      
      // Update UI clock
      const hours = Math.floor(t * 24);
      const minutes = Math.floor((t * 24 * 60) % 60);
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      const clockTime = document.getElementById('day-night-time');
      const clockIcon = document.getElementById('day-night-icon');
      if (clockTime) clockTime.textContent = timeStr;
      
      // Update icon based on time
      if (clockIcon) {
        if (t >= 0.2 && t < 0.7) {
          clockIcon.textContent = '☀️'; // Day
        } else if (t >= 0.7 && t < 0.8) {
          clockIcon.textContent = '🌅'; // Sunset
        } else if (t >= 0.1 && t < 0.2) {
          clockIcon.textContent = '🌄'; // Sunrise
        } else {
          clockIcon.textContent = '🌙'; // Night
        }
      }
      
      // Calculate sun position and lighting based on time of day
      // 0 = midnight (dark), 0.25 = sunrise, 0.5 = noon (bright), 0.75 = sunset, 1 = midnight
      // Use smoothstep easing for smoother color transitions
      const smoothstep = (t) => t * t * (3 - 2 * t); // Smooth interpolation
      
      let sunIntensity, ambientIntensity;
      
      if (t < 0.25) {
        // Night to sunrise (0 -> 0.25)
        const phase = smoothstep(t / 0.25); // Smooth easing
        sunIntensity = 0.2 + (0.6 * phase); // 0.2 -> 0.8
        ambientIntensity = 0.3 + (0.3 * phase); // 0.3 -> 0.6
      } else if (t < 0.5) {
        // Sunrise to noon (0.25 -> 0.5)
        const phase = smoothstep((t - 0.25) / 0.25);
        sunIntensity = 0.8 + (0.2 * phase); // 0.8 -> 1.0
        ambientIntensity = 0.6 + (0.1 * phase); // 0.6 -> 0.7
      } else if (t < 0.75) {
        // Noon to sunset (0.5 -> 0.75)
        const phase = smoothstep((t - 0.5) / 0.25);
        sunIntensity = 1.0 - (0.6 * phase); // 1.0 -> 0.4
        ambientIntensity = 0.7 - (0.3 * phase); // 0.7 -> 0.4
      } else {
        // Sunset to night (0.75 -> 1.0)
        const phase = smoothstep((t - 0.75) / 0.25);
        sunIntensity = 0.4 - (0.2 * phase); // 0.4 -> 0.2
        ambientIntensity = 0.4 - (0.1 * phase); // 0.4 -> 0.3
      }
      
      // Apply lighting changes with lerp for extra smoothness
      const lerpSpeed = 0.1; // Smooth transition speed
      window.ambientLight.intensity += (ambientIntensity - window.ambientLight.intensity) * lerpSpeed;
      window.dirLight.intensity += (sunIntensity - window.dirLight.intensity) * lerpSpeed;
      
      // Note: scene.background and scene.fog.color are kept at their initial COLORS.bg value.
      // Changing them to sky-blue during the day cycle caused a blue-screen artifact at the
      // screen edges and the fog area, which is now fixed by relying solely on dynamic
      // lighting (ambient + directional) to convey the time of day.
      
      // Move sun position in an arc - shadows cast from side based on sun position
      // At 6pm (t=0.75), sun is low on horizon casting long lateral shadows
      // At noon (t=0.5), sun is overhead casting short shadows
      const sunAngle = (t - 0.25) * Math.PI * 2; // Offset so noon is at top
      // Sun elevation: high at noon, low at dawn/dusk for dramatic side shadows
      const sunElevation = Math.sin(sunAngle);
      // At 6pm (sunset), sun is low — shadows stretch sideways from objects
      const sunHeight = Math.max(15, sunElevation * 80);
      // Horizontal offset increases as sun goes lower (longer lateral shadows)
      const lateralStrength = 60;
      // Anchor light to player for correct shadow casting as player moves around the map
      const shadowCenterX = (player && player.mesh) ? player.mesh.position.x : 0;
      const shadowCenterZ = (player && player.mesh) ? player.mesh.position.z : 0;
      window.dirLight.position.set(
        shadowCenterX + Math.cos(sunAngle) * lateralStrength,
        sunHeight,
        shadowCenterZ + Math.sin(sunAngle) * lateralStrength
      );
      window.dirLight.target.position.set(shadowCenterX, 0, shadowCenterZ);
      window.dirLight.target.updateMatrixWorld();
      
      // Dynamic shadow quality based on sun angle - sharper at low angles
      const shadowSharpness = Math.max(1, 6 - Math.abs(sunElevation) * 4);
      window.dirLight.shadow.radius = shadowSharpness;
    }
    
    // 120 fps cap: minimum milliseconds between processed frames (~8.33 ms)
    const _MIN_FRAME_MS = 1000 / 120;
    let _lastAnimTime = 0;

    function animate(time) {
      animationFrameId = requestAnimationFrame(animate);

      // ── Safe CampWorld render branch ─────────────────────────────────────────
      // Must come BEFORE the renderer/scene/camera safety check so CampWorld can
      // render even when the main combat scene failed to initialise (e.g. init()
      // threw before window.gameRenderer was set or before animate() was started
      // in game-screens.js).  CampWorld owns its own THREE.WebGLRenderer reference
      // set by warmUp() / enter() and does not depend on the combat scene at all.
      if (window.CampWorld && window.CampWorld.isActive) {
        if (time - _lastAnimTime < _MIN_FRAME_MS) return;
        _lastAnimTime = time;
        const _campDt = lastTime === null ? 0.016 : Math.min((time - lastTime) / 1000, 0.033);
        lastTime = time;
        gameTime = time / 1000;
        try { window.CampWorld.update(_campDt); } catch (e) { console.error('[CampWorld] Update error:', e); }
        try { window.CampWorld.render(); } catch (e) { console.error('[CampWorld] Render error:', e); }
        return;
      }

      // Safety check: Ensure Three.js components are initialized before rendering (PR #82)
      if (!renderer || !scene || !camera) {
        return;
      }

      // Cap frame rate at 120fps to avoid unnecessary GPU work on high-refresh screens.
      // Use a fixed increment to avoid under-running the target on high-refresh displays.
      if (time - _lastAnimTime < _MIN_FRAME_MS) return;
      _lastAnimTime = time;

      // Initialize lastTime on first frame to prevent huge dt (PR #82 fix)
      if (lastTime === null) {
        lastTime = time;
        gameTime = time / 1000; // Initialize gameTime for visual effects
        // Render the initial frame before returning to avoid blank screen.
        // Skip if CampWorld is active — it owns its own scene and camera.
        if (!(window.CampWorld && window.CampWorld.isActive)) {
          try { renderer.render(scene, camera); } catch(e) { console.error('Render error (init frame):', e); }
        }
        return;
      }

      // Performance tracking - start frame timer
      const frameStartTime = performance.now();

      let dt = (time - lastTime) / 1000;
      if (window.BloodV2) window.BloodV2.update(dt);
      if (window.SlimePool) window.SlimePool.update(dt, player && player.mesh ? player.mesh.position : null);
      if (window.WaveSpawner) window.WaveSpawner.update(dt, player && player.mesh ? player.mesh.position : null);
      if (window.HitDetection) window.HitDetection.update(dt, player && player.mesh ? player.mesh.position : null);
      lastTime = time;
      gameTime = time / 1000; // Update game time in seconds

      // Guard against NaN or negative dt (e.g. from tab-switch timing jitter)
      // which could propagate NaN into physics positions and permanently break the loop.
      if (!isFinite(dt) || dt <= 0) dt = 0.016; // fallback to ~60fps frame

      // Hit-stop recovery — once the freeze window expires, snap time back to normal
      if (_hitStopUntilMs > 0 && time >= _hitStopUntilMs) {
        _hitStopUntilMs = 0;
        if (window.DopamineSystem && window.DopamineSystem.TimeDilation) {
          window.DopamineSystem.TimeDilation.set(1.0, 8); // fast lerp back to normal
        }
      }

      // Time dilation — DopamineSystem scales dt for slow-motion effects
      if (window.DopamineSystem && window.DopamineSystem.TimeDilation) {
        dt *= window.DopamineSystem.TimeDilation.update(dt);
      }

      // Debug: log frame timing anomalies (throttled, observation-only)
      if (window.GameDebug) window.GameDebug.onFrameStart(time, dt * 1000, gameTime);
      
      // Phase 3: Lag compensation - cap deltaTime to prevent physics explosion during lag spikes
      const MAX_DELTA_TIME = 0.033; // ~30fps cap — prevents NaN/physics explosion on lag spikes
      dt = Math.min(dt, MAX_DELTA_TIME);
      if (dt === MAX_DELTA_TIME) {
        // Throttle warning to avoid console spam during sustained lag
        if (!window.lastLagWarning || (Date.now() - window.lastLagWarning) > 5000) {
          console.warn(`High deltaTime detected, capping to ${MAX_DELTA_TIME}s`);
          window.lastLagWarning = Date.now();
        }
      }
      // Skip sub-millisecond frames (super-fast monitors) to avoid divide-by-zero NaN errors
      if (dt < 0.001) return;
      // Expose dt globally so other modules (e.g. enemy-class.js) can gate cosmetics by FPS
      window._lastDt = dt;
      
      // Day/Night Cycle - Update lighting smoothly (non-blocking)
      // Runs every frame regardless of pause state for smooth visual transitions
      updateDayNightCycle(dt);

      // Update combat intensity and dynamic shadow quality every frame
      updateCombatIntensity(performance.now ? performance.now() : Date.now());

      // Dynamic FPS Booster — auto-adjust quality level based on real-time FPS
      updateDynamicFPSBooster(performance.now ? performance.now() : Date.now());

      
      // Update ambient creatures (birds, bats, fireflies, owls) based on time of day
      // Throttle to every other frame — cosmetic-only, saves CPU
      if (isGameActive && !isPaused && (performanceLog.frameCount & 1) === 0) {
        updateAmbientCreatures(dt * 2); // Double dt to compensate for half update rate
      }
      
      // Frame Skip Mechanism: Determine if rendering should be skipped based on previous frame time
      // Note: This only skips the render call - game logic still runs to maintain state consistency
      // Rendering is often a significant performance cost, so skipping it can provide relief
      const FRAME_TIME_BUDGET = 33.33; // ~30fps minimum (33.33ms per frame)
      const previousFrameTime = performanceLog.totalFrameTime;
      let shouldSkipRender = false;
      
      // Skip if previous frame exceeded 2x budget (first frame has totalFrameTime=0 so won't skip)
      // But never skip more than 2 consecutive frames to prevent a frozen-screen bug
      if (previousFrameTime > FRAME_TIME_BUDGET * 2 && performanceLog.consecutiveSkipCount < 2) {
        shouldSkipRender = true;
        performanceLog.consecutiveSkipCount++;
        // Throttled warning to prevent console spam during sustained poor performance
        if (!window.lastFrameSkipWarning || (Date.now() - window.lastFrameSkipWarning) > 5000) {
          console.warn(`Frame skip triggered: previous frame took ${previousFrameTime.toFixed(2)}ms`);
          window.lastFrameSkipWarning = Date.now();
        }
      }
      
      // Update Kill Cam and Cinematic effects before any early-return so they always
      // advance and terminate correctly — even when the game is paused (e.g. a level-up
      // pause that coincides with a boss cinematic).  Without this, cinematicActive could
      // stay true indefinitely while paused, leaving the camera locked on the now-empty
      // boss position and producing the "visual freeze" symptom.
      updateKillCam(dt);
      updateCinematic();

      // Handle countdown sequence (PR #70)
      if (countdownActive) {
        // During countdown, update spawn sequence particles and render but skip full game logic
        if (window.SpawnSequence) window.SpawnSequence.update(dt);
        if (!(window.CampWorld && window.CampWorld.isActive)) {
          try { renderer.render(scene, camera); } catch(e) { console.error('Render error (countdown):', e); }
        }
        return;
      }

      if (isPaused || isGameOver || !isGameActive) {
        // Update camera to follow player even when paused.
        // Skip camera override during the round-start cinematic so the zoom animation
        // is not fought by the paused-branch camera reset every frame.
        // cinematicActive is intentionally NOT excluded here: updateCinematic() ran
        // above and already ended any elapsed cinematic, so by the time we reach this
        // branch cinematicActive is false whenever the cinematic has finished.
        if (player && player.mesh && !killCamActive && !cinematicActive && !_roundStartCinematicActive) {
          camera.position.x = player.mesh.position.x;
          camera.position.z = player.mesh.position.z + 16;
          camera.lookAt(player.mesh.position);
        }
        // Still render the scene so visual effects (camera shake, particles, modals) are visible (PR #82)
        // When CampWorld is active, its dedicated early-return branch handles update/render with its own dt.
        try {
          if (!(window.CampWorld && window.CampWorld.isActive) && renderer && scene && camera) {
            renderer.render(scene, camera);
          }
        } catch(e) { console.error('Render error (paused):', e); }
        return;
      }
      
      // --- BEGIN GAME LOGIC (wrapped in try-catch to guarantee rendering) ---
      // Any uncaught exception in game logic previously prevented renderer.render() from
      // being called, producing the "frozen picture, game runs in background" bug.
      let aliveEnemies = 0; // Declared here so it's accessible in the performance logging below
      try {

      // Refresh frustum from current camera matrices (used for off-screen culling below)
      _updateFrustum();
      // Reset per-frame collision hit counter and drain any queued AoE hits from last frame
      if (window.GameCombat && window.GameCombat.resetFrameHits) window.GameCombat.resetFrameHits();

      // Handle keyboard/gamepad input updates (integrated into game loop)
      if (gameSettings.controlType === 'keyboard') {
        const keysPressed = gameSettings.keysPressed || {};
        let x = 0, y = 0;
        if (keysPressed['w']) y = -1;
        if (keysPressed['s']) y = 1;
        if (keysPressed['a']) x = -1;
        if (keysPressed['d']) x = 1;
        
        if (x !== 0 || y !== 0) {
          const dist = Math.sqrt(x*x + y*y);
          joystickLeft.x = x / dist;
          joystickLeft.y = y / dist;
          joystickLeft.active = true;
        } else {
          joystickLeft.active = false;
          joystickLeft.x = 0;
          joystickLeft.y = 0;
        }
        
        // Mouse aiming
        if (renderer && renderer.domElement) {
          const rect = renderer.domElement.getBoundingClientRect();
          const mouseX = gameSettings.lastMouseX - rect.left;
          const mouseY = gameSettings.lastMouseY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          
          const dx = mouseX - centerX;
          const dy = mouseY - centerY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist > 10) {
            joystickRight.x = dx / dist;
            joystickRight.y = dy / dist;
            joystickRight.active = true;
          } else {
            joystickRight.active = false;
            joystickRight.x = 0;
            joystickRight.y = 0;
          }
        }
      } else if (gameSettings.controlType === 'gamepad') {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[0];
        
        if (gamepad) {
          // Left stick for movement
          const leftX = Math.abs(gamepad.axes[0]) > 0.1 ? gamepad.axes[0] : 0;
          const leftY = Math.abs(gamepad.axes[1]) > 0.1 ? gamepad.axes[1] : 0;
          
          if (leftX !== 0 || leftY !== 0) {
            joystickLeft.x = leftX;
            joystickLeft.y = leftY;
            joystickLeft.active = true;
          } else {
            joystickLeft.active = false;
            joystickLeft.x = 0;
            joystickLeft.y = 0;
          }
          
          // Right stick for aiming
          const rightX = Math.abs(gamepad.axes[2]) > 0.1 ? gamepad.axes[2] : 0;
          const rightY = Math.abs(gamepad.axes[3]) > 0.1 ? gamepad.axes[3] : 0;
          
          if (rightX !== 0 || rightY !== 0) {
            joystickRight.x = rightX;
            joystickRight.y = rightY;
            joystickRight.active = true;
          } else {
            joystickRight.active = false;
            joystickRight.x = 0;
            joystickRight.y = 0;
          }
          
          // Button 0 (A/X) for dash - detect button press (not hold)
          const dashPressed = gamepad.buttons[0].pressed;
          const dashAllowed = !playerStats || playerStats.dashUnlocked !== false;
          if (dashPressed && !gameSettings.gamepadButtonStates.dashButton && !player.isDashing && joystickLeft.active && dashAllowed) {
            player.isDashing = true;
            player.dashTime = player.dashDuration;
            // Convert joystick direction to isometric world coordinates before dashing
            const inputX = joystickLeft.x;
            const inputY = joystickLeft.y;
            // Standard isometric transform from input (screen) space to world space
            // Use the centralized dash method for consistent behavior (iso conversion, effects, stats)
            player.dash(joystickLeft.x, joystickLeft.y);
          }
          gameSettings.gamepadButtonStates.dashButton = dashPressed;
        }
      }

      // Spawn Logic - Only spawn new wave if previous wave is cleared
      // ENGINE 2.0: Disable automatic wave spawning when Engine 2.0 Sandbox mode is active
      frameCount++;
      // Count alive enemies without creating a new array (avoids per-frame GC allocation)
      aliveEnemies = 0;
      for (let i = 0; i < enemies.length; i++) {
        if (!enemies[i].isDead) aliveEnemies++;
      }
      const timeSinceLastWave = frameCount - lastWaveEndTime;
      const minWaveDelay = Math.floor(GAME_CONFIG.waveInterval * 0.6); // 60% of wave interval (3 seconds at 60fps)

      // ENGINE 2.0: Skip wave spawning if sandbox mode is enabled
      const engine2SandboxActive = window._engine2SandboxMode === true;

      // Spawn new wave if: interval passed AND (no enemies alive OR enough time since last spawn)
      // Skip if the Annunaki endgame event has stopped normal waves.
      // Skip if Engine 2.0 Sandbox mode is active (no automatic enemy spawning).
      if (!engine2SandboxActive && !window._annunakiWavesStopped && frameCount % GAME_CONFIG.waveInterval === 0 && (aliveEnemies === 0 || timeSinceLastWave > GAME_CONFIG.waveInterval)) {
        lastWaveEndTime = frameCount; // Update last wave time on every spawn
        const spawnStartTime = performance.now();
        const _dbgPreSpawn = enemies.length;
        spawnWave();
        const spawnEndTime = performance.now();
        performanceLog.spawnCount++;
        if (window.GameDebug && window.GameDebug.enabled) {
          window.GameDebug.onEnemyTick(enemies, enemies.length - _dbgPreSpawn, 0);
        }
        
        // Log if spawning took unusually long
        // if (spawnEndTime - spawnStartTime > 10) {
        //   console.warn(`Spawn wave took ${(spawnEndTime - spawnStartTime).toFixed(2)}ms, enemies: ${aliveEnemies}`); // REMOVED: hot-path performance
        // }
      } else if (!engine2SandboxActive && !window._annunakiWavesStopped && aliveEnemies === 0 && timeSinceLastWave >= minWaveDelay) {
        // Quick spawn if all enemies cleared and minimum delay passed
        lastWaveEndTime = frameCount;
        const spawnStartTime = performance.now();
        const _dbgPreSpawn2 = enemies.length;
        spawnWave();
        const spawnEndTime = performance.now();
        performanceLog.spawnCount++;
        if (window.GameDebug && window.GameDebug.enabled) {
          window.GameDebug.onEnemyTick(enemies, enemies.length - _dbgPreSpawn2, 0);
        }
        
        // Log if spawning took unusually long
        // if (spawnEndTime - spawnStartTime > 10) {
        //   console.warn(`Quick spawn took ${(spawnEndTime - spawnStartTime).toFixed(2)}ms`); // REMOVED: hot-path performance
        // }
      }
      
      // Track enemy count changes for logging
      if (aliveEnemies !== performanceLog.lastEnemyCount) {
        performanceLog.lastEnemyCount = aliveEnemies;
      }
      
      // HP Regen (Every 60 frames approx 1 sec)
      if (frameCount % 60 === 0 && playerStats.hpRegen > 0 && playerStats.hp < playerStats.maxHp) {
        // Blood Alchemy: multiply regen by (1 + 0.5 * activeBloodPools)
        let regenAmount = playerStats.hpRegen;
        if (window._nmBloodAlchemy) {
          const poolCount = window._activeBloodPools || 0;
          regenAmount *= (1 + 0.5 * poolCount);
        }
        playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + regenAmount);
        updateHUD();
        // Green particle
        spawnParticles(player.mesh.position, 0x00FF00, 2);
      }

      // Stamina regen: regenerates over time at staminaRegen units/second
      if (playerStats.maxStamina > 0 && (playerStats.stamina || 0) < playerStats.maxStamina) {
        const staminaRegenRate = playerStats.staminaRegen || 8;
        playerStats.stamina = Math.min(
          playerStats.maxStamina,
          (playerStats.stamina || 0) + staminaRegenRate * dt
        );
      }

      // Annunaki Protocol: drain ANNUNAKI_HP_DRAIN_RATE % max HP per second (every 60 frames)
      // Double-check saveData to prevent drain when the protocol is not explicitly unlocked
      // (guards against stale window flags from previous sessions).
      const ANNUNAKI_HP_DRAIN_RATE = 0.01; // 1% max HP per second — forces ultra-aggressive playstyle
      if (window._nmAnnunakiActive
          && saveData?.neuralMatrix?.annunakiProtocol
          && frameCount % 60 === 0) {
        const drain = Math.max(1, playerStats.maxHp * ANNUNAKI_HP_DRAIN_RATE);
        player.takeDamage(drain);
      }

      // Event Horizon: update black holes
      if (window._eventHorizonHoles && window._eventHorizonHoles.length > 0) {
        const PULL_RADIUS = 5.0;
        const PULL_FORCE  = 0.18;
        for (let hi = window._eventHorizonHoles.length - 1; hi >= 0; hi--) {
          const hole = window._eventHorizonHoles[hi];
          hole.timer -= dt;
          // Animate hole mesh pulsing
          if (hole.mesh) {
            const sc = 0.6 + 0.2 * Math.sin(hole.timer * 12);
            hole.mesh.scale.set(sc, sc, sc);
          }
          // Pull enemies toward the hole
          for (const en of enemies) {
            if (en.isDead || !en.mesh) continue;
            const ex = en.mesh.position.x - hole.x;
            const ez = en.mesh.position.z - hole.z;
            const dist2 = ex * ex + ez * ez;
            if (dist2 < PULL_RADIUS * PULL_RADIUS && dist2 > 0.01) {
              const dist = Math.sqrt(dist2);
              en.mesh.position.x -= (ex / dist) * PULL_FORCE;
              en.mesh.position.z -= (ez / dist) * PULL_FORCE;
            }
          }
          // Remove expired holes
          if (hole.timer <= 0) {
            if (hole.mesh) {
              if (hole.mesh._poolPair) {
                _releaseEventHorizonMesh(hole.mesh._poolPair);
              } else if (scene) {
                scene.remove(hole.mesh);
                if (hole.mesh._glowRing) scene.remove(hole.mesh._glowRing);
              }
            }
            window._eventHorizonHoles.splice(hi, 1);
          }
        }
      }

      // Low-HP damage bonus: dynamically update playerStats.damage each frame
      if (playerStats.lowHpDamage > 0) {
        playerStats.damage = playerStats.hp < playerStats.maxHp * 0.5 ? (1 + playerStats.lowHpDamage) : 1;
      }

      // Boiling Point: below 40% HP, boost speed and fire rate per stack
      if (playerStats.boilingPoint > 0) {
        const isLowHp = playerStats.hp < playerStats.maxHp * 0.40;
        if (isLowHp && !player._boilingPointActive) {
          player._boilingPointActive = true;
          const speedBonus = 1 + (0.25 * playerStats.boilingPoint);
          const cdMult = 1 / (1 + (0.20 * playerStats.boilingPoint));
          player._boilingBaseSpeed = playerStats.walkSpeed;
          player._boilingBaseCdGun   = weapons.gun.cooldown;
          player._boilingBaseCdDB    = weapons.doubleBarrel.cooldown;
          player._boilingBaseCdSniper = weapons.sniperRifle.cooldown;
          playerStats.walkSpeed       *= speedBonus;
          weapons.gun.cooldown         *= cdMult;
          weapons.doubleBarrel.cooldown *= cdMult;
          if (weapons.sniperRifle.active) weapons.sniperRifle.cooldown *= cdMult;
          spawnParticles(player.mesh.position, 0xFF4400, 8);
          if (typeof showStatChange === 'function') showStatChange('🔥 BOILING POINT!');
        } else if (!isLowHp && player._boilingPointActive) {
          player._boilingPointActive = false;
          if (player._boilingBaseSpeed)   { playerStats.walkSpeed = player._boilingBaseSpeed; player._boilingBaseSpeed = null; }
          if (player._boilingBaseCdGun)   { weapons.gun.cooldown = player._boilingBaseCdGun; player._boilingBaseCdGun = null; }
          if (player._boilingBaseCdDB)    { weapons.doubleBarrel.cooldown = player._boilingBaseCdDB; player._boilingBaseCdDB = null; }
          if (player._boilingBaseCdSniper){ weapons.sniperRifle.cooldown = player._boilingBaseCdSniper; player._boilingBaseCdSniper = null; }
        }
      }

      // Player Update
      if (killCamActive) {
        // Preserve kill cam camera position from being overridden by player.update
        const prevCamX = camera.position.x;
        const prevCamZ = camera.position.z;
        if (window.GameDebug) window.GameDebug.safeCall('player.update', () => player.update(dt));
        else player.update(dt);
        camera.position.x = prevCamX;
        camera.position.z = prevCamZ;
      } else if (cinematicActive) {
        // Preserve cinematic camera position
        const prevCamX = camera.position.x;
        const prevCamY = camera.position.y;
        const prevCamZ = camera.position.z;
        if (window.GameDebug) window.GameDebug.safeCall('player.update', () => player.update(dt));
        else player.update(dt);
        camera.position.x = prevCamX;
        camera.position.y = prevCamY;
        camera.position.z = prevCamZ;
      } else {
        if (window.GameDebug) window.GameDebug.safeCall('player.update', () => player.update(dt));
        else player.update(dt);
      }

      // Update enemy AI movement (was missing - enemies were frozen)
      const _fc = performanceLog.frameCount;
      // Build spatial hash for enemy lookups (used by projectiles via window._enemySpatialHash)
      // TIME-SLICING: rebuild the hash every frame but insert enemies in batches of
      // (enemies.length / 4) spread across 4 frames so not all weapons pay the full cost
      // on the same frame. A full rebuild still happens every 4 frames for accuracy.
      if (window.GamePerformance && window.GamePerformance.SpatialHash) {
        if (!window._enemySpatialHash) {
          window._enemySpatialHash = new window.GamePerformance.SpatialHash(4);
        }
        const _hashSlice = _fc & 3; // 0,1,2,3 in rotation
        if (_hashSlice === 0) {
          // Full rebuild on slice 0 — clear and insert all enemies
          window._enemySpatialHash.clear();
          for (var _shi = 0; _shi < enemies.length; _shi++) {
            var _she = enemies[_shi];
            if (_she && _she.mesh && !_she.isDead) {
              window._enemySpatialHash.insert(_she);
            }
          }
        } else {
          // Partial update: re-insert only the quarter of enemies belonging to this slice
          const _sliceSize = Math.ceil(enemies.length / 4);
          const _sliceStart = _hashSlice * _sliceSize;
          const _sliceEnd   = Math.min(_sliceStart + _sliceSize, enemies.length);
          for (var _shi2 = _sliceStart; _shi2 < _sliceEnd; _shi2++) {
            var _she2 = enemies[_shi2];
            if (_she2 && _she2.mesh && !_she2.isDead) {
              window._enemySpatialHash.insert(_she2);
            }
          }
        }
      }
      // Build EXP gem spatial hash for fast pickup/cleanup queries
      if (window.GamePerformance && window.GamePerformance.SpatialHash) {
        if (!window._expGemSpatialHash) {
          window._expGemSpatialHash = new window.GamePerformance.SpatialHash(4);
        }
        window._expGemSpatialHash.clear();
        for (var _egi = 0; _egi < expGems.length; _egi++) {
          var _ege = expGems[_egi];
          if (_ege && _ege.mesh && _ege.active) {
            window._expGemSpatialHash.insert(_ege);
          }
        }
      }
      // QuadTree — hierarchical spatial partitioning (supplements spatial hash)
      // Bounds cover ±60 units (well beyond fog far plane of 45 units)
      if (window.PerfManager && window.PerfManager.QuadTree) {
        const qtHalf = RENDERER_CONFIG.fogFar ? RENDERER_CONFIG.fogFar + 15 : 60;
        if (!window._enemyQuadTree) {
          window._enemyQuadTree = new window.PerfManager.QuadTree({ x: -qtHalf, z: -qtHalf, w: qtHalf * 2, h: qtHalf * 2 });
        }
        window._enemyQuadTree.clear();
        for (var _qi = 0; _qi < enemies.length; _qi++) {
          var _qe = enemies[_qi];
          if (_qe && _qe.mesh && !_qe.isDead) {
            window._enemyQuadTree.insert(_qe);
          }
        }
      }
      // Knockback chain reactions — propagate physics impulses between enemies
      if (window.AdvancedPhysics && window.AdvancedPhysics.KnockbackChain) {
        window.AdvancedPhysics.KnockbackChain.process(enemies, window._enemySpatialHash, dt);
      }
      // Debug: track alive/died counts per frame for diagnostics
      const _dbgAliveBeforeEnemyTick = window.GameDebug && window.GameDebug.enabled
        ? enemies.filter(e => e && !e.isDead).length : 0;

      // ── ANIMATION THROTTLE — skip expensive updates for distant enemies ──────────
      // Applies distance-based LOD: near enemies (< 50 units) update every frame,
      // medium (< 80 units) every 2nd frame, far (< 100 units) every 4th frame,
      // very far (100+) every 8th frame.  Reduces per-frame AI/animation overhead
      // by ~60% when 150+ enemies are on screen.
      const _playerPos = player.mesh.position;
      const _useThrottle = window.GamePerformance && window.GamePerformance.AnimationThrottle;
      enemies.forEach((e, _eIdx) => {
        if (!e || !e.mesh || e.isDead) return;

        // Calculate squared distance for throttle check (avoids expensive sqrt)
        let _shouldUpdate = true;
        if (_useThrottle && window._frameCount !== undefined) {
          const _edx = e.mesh.position.x - _playerPos.x;
          const _edz = e.mesh.position.z - _playerPos.z;
          const _eDistSq = _edx * _edx + _edz * _edz;
          // Use staggered update to spread distant-enemy processing evenly across
          // frames — prevents burst-frame stutters when all far enemies tick together.
          _shouldUpdate = _useThrottle.shouldUpdateStaggered(_eDistSq, window._frameCount, _eIdx);
        }

        if (_shouldUpdate) {
          e.update(dt, _playerPos);
        }
      });

      if (window.GameDebug && window.GameDebug.enabled) {
        const _dbgAliveAfter = enemies.filter(e => e && !e.isDead).length;
        window.GameDebug.onEnemyTick(enemies, 0, _dbgAliveBeforeEnemyTick - _dbgAliveAfter);
      }

      // Dash cooldown tick (Feature 1)
      if (isDashing) {
        dashTimer -= dt;
        if (dashTimer <= 0) {
          isDashing = false;
          dashInvulnerable = false;
        }
      }
      if (dashCooldownRemaining > 0) {
        dashCooldownRemaining -= dt;
        if (dashCooldownRemaining < 0) dashCooldownRemaining = 0;
      }
      
      // Lake Physics - Check if player is in water (squared distance avoids expensive sqrt)
      const LAKE_CENTER_X = 30;
      const LAKE_CENTER_Z = -30;
      const LAKE_RADIUS_SQ = 18 * 18;
      const _ldx = player.mesh.position.x - LAKE_CENTER_X;
      const _ldz = player.mesh.position.z - LAKE_CENTER_Z;
      const distToLakeSq = _ldx * _ldx + _ldz * _ldz;
      
      if (distToLakeSq < LAKE_RADIUS_SQ) {
        // Player is in water!
        if (!player.inWater) {
          player.inWater = true;
          player.waterEntryTime = gameTime;
          player.swimBobPhase = 0;
          
          // Splash effect on water entry
          spawnParticles(player.mesh.position, 0x87CEEB, 20); // Blue splash
          spawnParticles(player.mesh.position, 0xFFFFFF, 10); // White foam
          playSound('waterSplash');
        }
        
        // Swimming: 40% speed reduction (was 50%)
        player.velocity.multiplyScalar(0.6);
        
        // Swimming bobbing animation
        player.swimBobPhase = (player.swimBobPhase || 0) + dt * 3.0;
        const bobY = -0.2 + Math.sin(player.swimBobPhase) * 0.15;
        player.mesh.position.y = bobY;
        
        // Gentle swimming tilt/roll
        player.mesh.rotation.z = Math.sin(player.swimBobPhase * 0.7) * 0.12;
        
        // Camera angle adjustment: tilt slightly lower when swimming
        if (!killCamActive && !cinematicActive) {
          camera.position.y = Math.max(10, camera.position.y - dt * 2);
        }
        
        // Create ripple effect
        if (Math.random() < 0.3) {
          spawnParticles(player.mesh.position, 0x87CEEB, 2);
        }
        
        // Check underwater legendary chest collection
        if (window.underwaterChest && !window.underwaterChest.userData.collected) {
          const _ucdx = player.mesh.position.x - window.underwaterChest.position.x;
          const _ucdz = player.mesh.position.z - window.underwaterChest.position.z;
          const _ucDistSq = _ucdx * _ucdx + _ucdz * _ucdz;
          const _ucRadius = window.underwaterChest.userData.collectRadius;
          if (_ucDistSq < _ucRadius * _ucRadius) {
            window.underwaterChest.userData.collected = true;
            scene.remove(window.underwaterChest);
            window.underwaterChest = null;
            
            // Grant legendary armor (+50 armor stacks with existing)
            if (playerStats) {
              playerStats.armor = (playerStats.armor || 0) + 50; // +50 armor
            }
            
            // Show legendary armor popup
            showComicInfoBox(
              '⚔️ LEGENDARY ARMOR FOUND!',
              '<div style="text-align:center;padding:10px 0">' +
              '<div style="font-size:52px;margin:8px 0">🛡️</div>' +
              '<div style="font-size:22px;font-weight:bold;color:#FFD700;letter-spacing:2px">AQUA PLATE ARMOR</div>' +
              '<div style="color:#FF8C00;font-size:16px;margin:4px 0">✦ ✦ ✦ LEGENDARY ✦ ✦ ✦</div>' +
              '<div style="margin:12px 0;font-size:15px;line-height:1.6">' +
              '+50 Armor (reduces all damage)<br>' +
              '+20% Water Resistance<br>' +
              '<span style="color:#87CEEB">Forged from the deepest currents...</span>' +
              '</div>' +
              '<div style="color:#4FC3F7;font-size:13px">Hidden beneath the lake for centuries!</div>' +
              '</div>',
              'EQUIP ARMOR!'
            );
            createFloatingText('LEGENDARY ARMOR!', player.mesh.position);
            spawnParticles(player.mesh.position, 0xFFD700, 30);
            spawnParticles(player.mesh.position, 0xFF8C00, 20);
          }
        }
      } else {
        if (player.inWater) {
          player.inWater = false;
          player.swimBobPhase = 0;
          player.mesh.rotation.z = 0;
          // Return to normal height
          player.mesh.position.y = 0.5;
          // Restore normal camera height
        }
      }
      
      // Check legendary cigar quest
      if (isGameActive && !isPaused) {
        checkLegendaryCigarQuest();
      }

      // Waterdrop story quests: lake bounce + minute-10 alien + AI narrator
      if (isGameActive && !isPaused && !isGameOver && player && player.mesh) {
        if (window.checkLakeBounceQuest) window.checkLakeBounceQuest(player.mesh);
        if (window.checkMinuteTenAlienQuest) window.checkMinuteTenAlienQuest();
        if (window.checkAINarratorTick) window.checkAINarratorTick(dt);
      }

      // Milestone system tick
      if (window.GameMilestones && isGameActive && !isPaused && !isGameOver) {
        window.GameMilestones.tick(dt);
        window.GameMilestones.checkMilestones();
      }
      
      // QUEST 3: Check Stonehenge chest proximity
      if (window.stonehengeChest && 
          saveData.tutorialQuests && 
          (saveData.tutorialQuests.currentQuest === 'quest3_stonehengeGear' ||
           saveData.tutorialQuests.currentQuest === 'quest6_stonehengeChest') &&
          isGameActive && !isPaused) {
        const _scdx = player.mesh.position.x - window.stonehengeChest.position.x;
        const _scdz = player.mesh.position.z - window.stonehengeChest.position.z;
        const _scDistSq = _scdx * _scdx + _scdz * _scdz;
        const _scRadius = window.stonehengeChest.userData.pickupRadius;
        if (_scDistSq < _scRadius * _scRadius) {
          // Player found the chest!
          scene.remove(window.stonehengeChest);
          window.stonehengeChest = null;
          
          const activeQuestId = saveData.tutorialQuests ? saveData.tutorialQuests.currentQuest : null;
          // Show item card popup
          showComicInfoBox(
            '🎁 Treasure Found!',
            '<div style="text-align: center;"><div style="font-size: 48px; margin: 10px 0;">🚬</div><div style="color: #3498db; font-size: 24px; font-weight: bold;">CIGARR</div><div style="color: #FFD700; font-size: 18px;">★★★ RARE ★★★</div><div style="margin: 15px 0; font-size: 16px; font-family: Arial, sans-serif;">+1 to all combat stats</div><div style="color: #3498db; font-family: Arial, sans-serif;">Go to the Armory to equip your Cigarr!</div></div>',
            'Collect!',
            () => {
              // Complete the active stonehenge chest quest
              progressTutorialQuest(activeQuestId, true);
              
              // Show blue particle effect at pickup location
              for (let i = 0; i < 15; i++) {
                const angle = (i / 15) * Math.PI * 2;
                const speed = 2 + Math.random() * 2;
                const particle = particlePool.get();
                if (particle) {
                  particle.reset(player.mesh.position, 0x4169E1);
                  particle.vel.set(
                    Math.cos(angle) * speed,
                    3 + Math.random() * 2,
                    Math.sin(angle) * speed
                  );
                  // Short, contained burst for pickup feedback
                  particle.life = Math.floor(Particle.MAX_LIFETIME * 0.5);
                }
              }
            }
          );
        }
      }

      // Companion Egg at UFO sight (quest18_findCompanionEgg)
      if (window.companionEggObject &&
          saveData.tutorialQuests &&
          saveData.tutorialQuests.currentQuest === 'quest18_findCompanionEgg' &&
          !saveData.hasCompanionEgg &&
          isGameActive && !isPaused) {
        const _egDx = player.mesh.position.x - window.companionEggObject.position.x;
        const _egDz = player.mesh.position.z - window.companionEggObject.position.z;
        const _egDistSq = _egDx * _egDx + _egDz * _egDz;
        const _egRadius  = window.companionEggObject.userData.pickupRadius;
        if (_egDistSq < _egRadius * _egRadius) {
          scene.remove(window.companionEggObject);
          window.companionEggObject = null;
          saveData.hasCompanionEgg = true;
          // Add egg to inventory display
          saveData.inventory.push({
            id: 'companion_egg_ufo',
            name: 'Mysterious Companion Egg',
            type: 'special',
            rarity: 'legendary',
            description: 'A pulsing egg found at the UFO crash site. Hatch it in the Companion House!',
            isCompanionEgg: true
          });
          saveSaveData();
          // Show pickup popup
          showComicInfoBox(
            '🥚 Companion Egg Found!',
            '<div style="text-align:center;"><div style="font-size:64px;margin:10px 0;animation:pulse 1s ease-in-out infinite;">🥚</div><div style="color:#00FFB4;font-size:22px;font-weight:bold;">MYSTERIOUS COMPANION EGG</div><div style="color:#FFD700;font-size:16px;">★★★★★ LEGENDARY ★★★★★</div><div style="margin:15px 0;font-size:14px;font-family:Arial,sans-serif;color:#ccc;">Found at the UFO crash site in Area 51. Something stirs within... Take it to the <b style="color:#00FFB4;">Companion House</b> to hatch it!</div></div>',
            '🐣 Take to Camp!',
            () => {
              progressTutorialQuest('quest18_findCompanionEgg', true);
              // Show green particles
              for (let i = 0; i < 20; i++) {
                const angle = (i / 20) * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                const particle = particlePool.get();
                if (particle) {
                  particle.reset(player.mesh.position, 0x00FFB4);
                  particle.vel.set(Math.cos(angle) * speed, 4 + Math.random() * 2, Math.sin(angle) * speed);
                  particle.life = Math.floor(Particle.MAX_LIFETIME * 0.6);
                }
              }
            }
          );
        }
        // Animate the egg (bob up and down)
        if (window.companionEggObject) {
          window.companionEggObject.position.y = Math.sin(Date.now() * 0.002) * 0.3;
          window.companionEggObject.rotation.y += 0.01;
        }
      } else if (window.companionEggObject && !saveData.hasCompanionEgg) {
        // Keep animating even when quest isn't active
        window.companionEggObject.position.y = Math.sin(Date.now() * 0.002) * 0.3;
        window.companionEggObject.rotation.y += 0.01;
      }

      // Mysterious Egg pickup for quest_eggHunt
      if (window._mysteriousEggObject &&
          saveData.tutorialQuests &&
          saveData.tutorialQuests.currentQuest === 'quest_eggHunt' &&
          !saveData.tutorialQuests.mysteriousEggFound &&
          isGameActive && !isPaused && player.mesh) {
        const _meDx = player.mesh.position.x - window._mysteriousEggObject.position.x;
        const _meDz = player.mesh.position.z - window._mysteriousEggObject.position.z;
        if (_meDx * _meDx + _meDz * _meDz < 3.5 * 3.5) {
          scene.remove(window._mysteriousEggObject);
          window._mysteriousEggObject = null;
          saveData.tutorialQuests.mysteriousEggFound = true;
          saveSaveData();
          createFloatingText("🥚 Mysterious Egg collected!", player.mesh.position, '#8B5CF6');
          showStatChange('🥚 Mysterious Egg collected! Finish the run and bring it to camp!');
          playSound('chest_open');
          // Trigger DopamineSystem reward feedback
          if (window.DopamineSystem) {
            if (window.DopamineSystem.TimeDilation) window.DopamineSystem.TimeDilation.set(0.3, 4);
            if (window.DopamineSystem.CameraFX) {
              window.DopamineSystem.CameraFX.zoomPunch(0.9, 500);
              window.DopamineSystem.CameraFX.chromaticPulse(0.5, 600);
            }
            setTimeout(function() {
              if (window.DopamineSystem && window.DopamineSystem.TimeDilation) window.DopamineSystem.TimeDilation.set(1.0, 3);
            }, 600);
          }
        }
        // Animate the egg (bob and spin)
        if (window._mysteriousEggObject) {
          window._mysteriousEggObject.position.y = Math.sin(Date.now() * 0.003) * 0.4 + 0.5;
          window._mysteriousEggObject.rotation.y += 0.015;
        }
      }

      // Farmer NPC: Update "?" indicator position and check for player proximity to trigger dialogue
      updateFarmerNPCIndicator();
      updateFarmerBubblePosition();
      if (farmerNPC && !windmillQuest.dialogueOpen && !isPaused && !isGameOver) {
        const _fndx = player.mesh.position.x - farmerNPC.position.x;
        const _fndz = player.mesh.position.z - farmerNPC.position.z;
        const farmerDist = Math.sqrt(_fndx * _fndx + _fndz * _fndz);
        const FARMER_TALK_DIST = 5;
        // Trigger intro dialogue if quest not yet started (and not currently failed/awaiting retry)
        if (!windmillQuest.active && !windmillQuest.hasCompleted && !windmillQuest.failed && !windmillQuest.failedCooldown && farmerDist < FARMER_TALK_DIST) {
          const windmillRef = animatedSceneObjects.windmills.length > 0 ? animatedSceneObjects.windmills[0] : null;
          showFarmerDialogue(FARMER_DIALOGUE.intro, function() {
            if (windmillRef) startWindmillQuest(windmillRef);
          });
        }
        // Reward dialogue after quest success
        else if (windmillQuest.hasCompleted && windmillQuest.rewardReady && !windmillQuest.rewardGiven && farmerDist < FARMER_TALK_DIST) {
          showFarmerDialogue(FARMER_DIALOGUE.success, function() {
            giveWindmillQuestReward();
          });
        }
        // Failure dialogue – shown once after quest fails; sets cooldown to prevent immediate re-trigger
        else if (windmillQuest.failed && !windmillQuest.active && !windmillQuest.hasCompleted && farmerDist < FARMER_TALK_DIST) {
          showFarmerDialogue(FARMER_DIALOGUE.failure, function() {
            windmillQuest.failed = false;
            windmillQuest.failedCooldown = true; // Prevent quest from restarting until next run
          });
        }
      }

      // Check windmill quest trigger – quest now starts only via farmer NPC dialogue above

      // Update windmill quest
      if (windmillQuest.active) {
        windmillQuest.timer -= dt;
        updateWindmillQuestUI();
        
        if (windmillQuest.timer <= 0) {
          // Quest completed successfully
          completeWindmillQuest();
        } else if (windmillQuest.windmill && windmillQuest.windmill.userData.hp <= 0) {
          // Quest failed – windmill destroyed
          failWindmillQuest();
        }
      }
      
      // Check Montana quest trigger (optimized with stored reference)
      if (!montanaQuest.active && !montanaQuest.hasCompleted && montanaLandmark) {
        const _mtdx = player.mesh.position.x - montanaLandmark.position.x;
        const _mtdz = player.mesh.position.z - montanaLandmark.position.z;
        if (Math.sqrt(_mtdx * _mtdx + _mtdz * _mtdz) < MONTANA_QUEST_TRIGGER_DISTANCE) {
          startMontanaQuest(montanaLandmark);
        }
      }
      
      // Update Montana quest
      if (montanaQuest.active) {
        montanaQuest.timer -= dt;
        updateMontanaQuestUI();
        
        if (montanaQuest.timer <= 0 && montanaQuest.kills >= montanaQuest.killsNeeded) {
          // Quest completed successfully
          completeMontanaQuest();
        } else if (montanaQuest.timer <= 0) {
          // Quest failed
          montanaQuest.active = false;
          document.getElementById('montana-quest-ui').style.display = 'none';
          createFloatingText("MONTANA FAILED!", montanaQuest.landmark.position);
        }
      }
      
      // Check Eiffel quest trigger (optimized with stored reference)
      if (!eiffelQuest.active && !eiffelQuest.hasCompleted && eiffelLandmark) {
        const _efdx = player.mesh.position.x - eiffelLandmark.position.x;
        const _efdz = player.mesh.position.z - eiffelLandmark.position.z;
        if (Math.sqrt(_efdx * _efdx + _efdz * _efdz) < EIFFEL_QUEST_TRIGGER_DISTANCE) {
          startEiffelQuest(eiffelLandmark);
        }
      }
      
      // Update Eiffel quest
      if (eiffelQuest.active) {
        eiffelQuest.timer -= dt;
        updateEiffelQuestUI();
        
        if (eiffelQuest.timer <= 0 && eiffelQuest.kills >= eiffelQuest.killsNeeded) {
          // Quest completed successfully
          completeEiffelQuest();
        } else if (eiffelQuest.timer <= 0) {
          // Quest failed
          eiffelQuest.active = false;
          document.getElementById('eiffel-quest-ui').style.display = 'none';
          createFloatingText("EIFFEL FAILED!", eiffelQuest.landmark.position);
        }
      }

      // --- WEAPONS ---
      
      // Track landmark visits for quest11_findAllLandmarks
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest11_findAllLandmarks') {
        if (!saveData.tutorialQuests.landmarksFound) {
          saveData.tutorialQuests.landmarksFound = { stonehenge: false, pyramid: false, montana: false, teslaTower: false, eiffel: false };
        }
        const lf = saveData.tutorialQuests.landmarksFound;
        const px = player.mesh.position.x, pz = player.mesh.position.z;
        for (const cfg of Object.values(LANDMARK_CONFIGS)) {
          if (!lf[cfg.key] && Math.hypot(px - cfg.x, pz - cfg.z) < cfg.radius) {
            lf[cfg.key] = true;
            createFloatingText(`📍 ${cfg.label} Found!`, player.mesh.position);
            showStatChange(`📍 ${cfg.label} Found!`);
            saveSaveData();
          }
        }
        // Check if all found
        const allFound = Object.values(LANDMARK_CONFIGS).every(cfg => lf[cfg.key]);
        if (allFound) {
          progressTutorialQuest('quest11_findAllLandmarks', true);
          saveSaveData();
        }
        updateQuestTracker();
      }

      // Discover Codex landmark entries when player is nearby (always active, not quest-gated)
      if (window.CodexSystem && player && player.mesh) {
        const _cx = player.mesh.position.x, _cz = player.mesh.position.z;
        const _codexLandmarkMap = {
          stonehenge: 'land_stonehenge', pyramid: 'land_pyramid',
          teslaTower: 'land_tesla', eiffel: 'land_windmill', montana: 'land_montana'
        };
        for (const cfg of Object.values(LANDMARK_CONFIGS)) {
          if (_codexLandmarkMap[cfg.key] && Math.hypot(_cx - cfg.x, _cz - cfg.z) < cfg.radius) {
            window.CodexSystem.discover(_codexLandmarkMap[cfg.key]);
          }
        }
        // UFO crash site discovery
        if (Math.hypot(_cx - (-50), _cz - 25) < 20) window.CodexSystem.discover('land_ufo');
      }
      
      // 1. GUN
      if (weapons.gun.active && time - weapons.gun.lastShot > weapons.gun.cooldown) {
        // Find nearest enemy via spatial hash (O(1) grid lookup)
        const _gunRangeSq = weapons.gun.range * weapons.gun.range;
        const _gunResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _gunRangeSq, enemies);
        let nearest = _gunResult.enemy;
        let minDstSq = _gunResult.distSq;

        // In manual mode: only fire if right stick is active (player is aiming) OR if on keyboard/gamepad
        // This prevents auto-fire off-aim on mobile touch
        const canFireManual = gameSettings.autoAim || joystickRight.active || gameSettings.controlType === 'keyboard' || gameSettings.controlType === 'gamepad';

        if (nearest && canFireManual) {
          // Determine fire target:
          // - auto-aim: target nearest enemy directly
          // - manual with right stick: fire in right-stick direction
          // - manual keyboard: fire in player facing direction
          let gunTarget;
          if (gameSettings.autoAim) {
            gunTarget = nearest.mesh.position;
          } else if (joystickRight.active) {
            // Right stick directs the shot
            const aimAngle = Math.atan2(joystickRight.x, joystickRight.y);
            _tmpGunTarget.set(
              player.mesh.position.x + Math.sin(aimAngle) * weapons.gun.range,
              0,
              player.mesh.position.z + Math.cos(aimAngle) * weapons.gun.range
            );
            gunTarget = _tmpGunTarget;
          } else {
            _tmpGunTarget.set(
              player.mesh.position.x + Math.sin(player.mesh.rotation.y) * weapons.gun.range,
              0,
              player.mesh.position.z + Math.cos(player.mesh.rotation.y) * weapons.gun.range
            );
            gunTarget = _tmpGunTarget;
          }
          // Fire based on barrels
          for(let i=0; i<weapons.gun.barrels; i++) {
            setTimeout(() => {
              projectiles.push(_spawnProjectile(player.mesh.position.x, player.mesh.position.z, gunTarget));
              
              // Trigger waterdrop shooting wave animation
              if (i === 0) {
                const wdc = document.getElementById('waterdrop-container');
                if (wdc) {
                  wdc.classList.remove('shooting');
                  void wdc.offsetWidth;
                  wdc.classList.add('shooting');
                  setTimeout(() => wdc.classList.remove('shooting'), 300);
                }
              }
              
              // Double Cast: chance to fire a second shot with slight spread
              const castChance = playerStats.doubleCastChance || 0;
              if (castChance > 0 && Math.random() < castChance) {
                const spreadAngle = (Math.random() - 0.5) * (Math.PI / 18); // random ±5 degrees
                const dx = gunTarget.x - player.mesh.position.x;
                const dz = gunTarget.z - player.mesh.position.z;
                // Rotate displacement vector by spreadAngle to get a new target at same distance
                _tmpSpreadTarget.set(
                  player.mesh.position.x + (Math.cos(spreadAngle) * dx - Math.sin(spreadAngle) * dz),
                  0,
                  player.mesh.position.z + (Math.sin(spreadAngle) * dx + Math.cos(spreadAngle) * dz)
                );
                projectiles.push(_spawnProjectile(player.mesh.position.x, player.mesh.position.z, _tmpSpreadTarget));
              }
              
              // Per-weapon muzzle flash system
              if (typeof window.spawnWeaponMuzzleFlash === 'function') {
                const flashDir = new THREE.Vector3(
                  Math.sin(player.mesh.rotation.y),
                  0,
                  Math.cos(player.mesh.rotation.y)
                );
                window.spawnWeaponMuzzleFlash('gun', player.mesh.position, flashDir, scene);
              }

              // Gun kickback effect - snappy recoil via scale squish
              player.mesh.scale.set(1.15, 0.85, 1.15);
              if (playerRecoilTimeout) clearTimeout(playerRecoilTimeout);
              playerRecoilTimeout = setTimeout(() => {
                player.mesh.scale.set(1, 1, 1);
                playerRecoilTimeout = null;
              }, 80);
              activeTimeouts.push(playerRecoilTimeout);
            }, i * 100);
          }
          weapons.gun.lastShot = time;
          playSound('shoot'); // Gun sound
        }
      }

      // 2. SWORD
      if (weapons.sword.active && time - weapons.sword.lastShot > weapons.sword.cooldown) {
        // Find enemy in front or just slash in movement dir
        // If moving, slash forward. If idle, slash nearest?
        // Let's slash in player rotation direction
        const angle = player.mesh.rotation.y;
        // Use pool if available, otherwise create new
        if (window._swordSlashPool) {
          const slash = window._swordSlashPool.get().reinit(player.mesh.position.x, player.mesh.position.z, angle);
          projectiles.push(slash);
        } else {
          projectiles.push(new SwordSlash(player.mesh.position.x, player.mesh.position.z, angle));
        }
        weapons.sword.lastShot = time;
        playSound('sword'); // Sword slash sound

        // Per-weapon muzzle flash system
        if (typeof window.spawnWeaponMuzzleFlash === 'function') {
          const flashDir = new THREE.Vector3(
            Math.sin(angle),
            0,
            Math.cos(angle)
          );
          window.spawnWeaponMuzzleFlash('sword', player.mesh.position, flashDir, scene);
        }
      }

      // 3. AURA — Spiritual force field, fast pulses, less damage per tick
      if (weapons.aura.active && time - weapons.aura.lastShot > weapons.aura.cooldown) {
        const effectiveAuraRange = weapons.aura.range * (playerStats.auraRange || 1.0);
        const auraRangeSq = effectiveAuraRange * effectiveAuraRange;
        // Track pulse count for climbing effect (0-33% up body)
        if (!weapons.aura._pulseCount) weapons.aura._pulseCount = 0;
        weapons.aura._pulseCount++;
        const pulseHeight = Math.min(0.33, weapons.aura._pulseCount * 0.02); // Climbs up to 33% body
        let hit = false;
        window.GameCombat.forEachEnemyInRangeSH(player.mesh.position.x, player.mesh.position.z, auraRangeSq, enemies, (e) => {
            // Reduced damage per pulse (spiritual burn, not bullet damage)
            const auraDmg = weapons.aura.damage * playerStats.strength * 0.6;
            e.takeDamage(auraDmg, false, 'aura');
            hit = true;
            // Enemy reacts to each pulse — flinch/shudder
            if (e.mesh) {
              const shudder = (Math.random() - 0.5) * 0.15;
              e.mesh.position.x += shudder;
              e.mesh.position.z += shudder;
              // Spiritual pain — brief scale squish
              e.mesh.scale.set(1 + Math.random() * 0.1, 1 - Math.random() * 0.1, 1 + Math.random() * 0.1);
              setTimeout(() => { if (e.mesh && !e.isDead) e.mesh.scale.set(1, 1, 1); }, 80);
            }
            // Spiritual bleed effect on lower body — yellow-white energy wisps climbing up
            const ePos = e.mesh.position;
            spawnParticles(
              { x: ePos.x, y: pulseHeight * 1.5, z: ePos.z },
              0xFFEE88, 2
            );
            // Bleeding at feet from spiritual damage
            if (Math.random() < 0.4) {
              spawnBloodDecal({ x: ePos.x + (Math.random()-0.5)*0.3, y: 0, z: ePos.z + (Math.random()-0.5)*0.3 });
            }
        });
        if (hit) {
          // Per-weapon muzzle flash system
          if (typeof window.spawnWeaponMuzzleFlash === 'function') {
            window.spawnWeaponMuzzleFlash('aura', player.mesh.position, null, scene);
          }
        }
        weapons.aura.lastShot = time;
      }

      // 4. METEOR
      if (weapons.meteor.active && time - weapons.meteor.lastShot > weapons.meteor.cooldown) {
        // Target random enemy or random spot near player
        let targetX = player.mesh.position.x + (Math.random() - 0.5) * 10;
        let targetZ = player.mesh.position.z + (Math.random() - 0.5) * 10;
        
        if (enemies.length > 0) {
          const e = enemies[Math.floor(Math.random() * enemies.length)];
          targetX = e.mesh.position.x;
          targetZ = e.mesh.position.z;
        }

        // Use pool if available, otherwise create new
        if (window._meteorPool) {
          const meteor = window._meteorPool.get().reinit(targetX, targetZ);
          meteors.push(meteor);
        } else {
          meteors.push(new Meteor(targetX, targetZ));
        }

        // Per-weapon muzzle flash system (casting effect from player)
        if (typeof window.spawnWeaponMuzzleFlash === 'function') {
          const dir = new THREE.Vector3(
            targetX - player.mesh.position.x,
            0,
            targetZ - player.mesh.position.z
          ).normalize();
          window.spawnWeaponMuzzleFlash('meteor', player.mesh.position, dir, scene);
        }

        weapons.meteor.lastShot = time;
      }

      // 5. DRONE TURRET
      if (weapons.droneTurret.active && time - weapons.droneTurret.lastShot > weapons.droneTurret.cooldown) {
        // Update all drones
        for (let drone of droneTurrets) {
          if (!drone.active) continue;
          
          // Find nearest enemy for this drone via spatial hash
          const _droneRangeSq = weapons.droneTurret.range * weapons.droneTurret.range;
          const _droneResult = window.GameCombat.findNearestEnemySH(drone.mesh.position.x, drone.mesh.position.z, _droneRangeSq, enemies);
          let nearestEnemy = _droneResult.enemy;
          
          // Fire projectile from drone
          if (nearestEnemy) {
            const projectile = _spawnProjectile(
              drone.mesh.position.x, 
              drone.mesh.position.z, 
              nearestEnemy.mesh.position
            );
            // Mark projectile as from drone turret for damage calculation
            projectile.isDroneTurret = true;
            // Drone shots: very small (barely visible) but fast — high-DPS volume fire
            projectile.mesh.scale.set(0.35, 0.35, 0.35);
            projectile.mesh.material.color.setHex(0x00FFFF); // Cyan tint for drone shots
            if (projectile.glow) {
              projectile.glow.scale.set(0.35, 0.35, 0.35);
              projectile.glow.material.color.setHex(0x00FFFF);
            }
            // Fast projectile speed — drones fire many rapid shots
            projectile.vx = projectile.vx * 2.2;
            projectile.vz = projectile.vz * 2.2;
            projectile.life = 30; // Short lifetime = close-range rapid fire
            projectile.maxLife = 30;
            projectiles.push(projectile);

            // Per-weapon muzzle flash system
            if (typeof window.spawnWeaponMuzzleFlash === 'function') {
              const dir = new THREE.Vector3(
                nearestEnemy.mesh.position.x - drone.mesh.position.x,
                0,
                nearestEnemy.mesh.position.z - drone.mesh.position.z
              ).normalize();
              window.spawnWeaponMuzzleFlash('droneTurret', drone.mesh.position, dir, scene);
            }

            playSound('shoot');
          }
        }
        
        weapons.droneTurret.lastShot = time;
      }

      // 6. DOUBLE BARREL - Swarm of 10-20 pellets, compact-to-wide spread, faster than gun
      if (weapons.doubleBarrel.active && time - weapons.doubleBarrel.lastShot > weapons.doubleBarrel.cooldown) {
        // Find nearest enemy via spatial hash
        const _dbRangeSq = weapons.doubleBarrel.range * weapons.doubleBarrel.range;
        const _dbResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _dbRangeSq, enemies);
        let nearest = _dbResult.enemy;

        if (nearest) {
          _tmpShotgunDir.set(
            nearest.mesh.position.x - player.mesh.position.x,
            0,
            nearest.mesh.position.z - player.mesh.position.z
          ).normalize();
          
          const baseAngle = Math.atan2(_tmpShotgunDir.z, _tmpShotgunDir.x);
          const spreadAngle = weapons.doubleBarrel.spread;
          
          // Swarm of pellets — compact near muzzle, fans out at range
          const pelletCount = weapons.doubleBarrel.pellets || 12;
          for (let i = 0; i < pelletCount; i++) {
            // Gaussian-like spread: most pellets near centre, fewer at edges
            const r1 = Math.random(), r2 = Math.random();
            const gaussSpread = (r1 + r2 - 1.0) * spreadAngle;
            const angle = baseAngle + gaussSpread;
            _tmpShotgunTarget.set(
              player.mesh.position.x + Math.cos(angle) * weapons.doubleBarrel.range,
              0,
              player.mesh.position.z + Math.sin(angle) * weapons.doubleBarrel.range
            );
            const pellet = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, _tmpShotgunTarget);
            pellet.isDoubleBarrel = true;
            // Visual: tiny pellets — much smaller than gun bullets to look like real buckshot
            pellet.mesh.scale.set(0.28, 0.28, 0.28);
            pellet.mesh.material.color.setHex(0xFFA500);
            if (pellet.glow) {
              pellet.glow.scale.set(0.28, 0.28, 0.28);
              pellet.glow.material.color.setHex(0xFFD700);
            }
            // Speed: rescale pre-computed velocity so pellets travel faster than gun bullets
            _rescaleProjSpeed(pellet, 2.625 + Math.random() * 0.525); // 0.75*3.5–0.9*3.5
            projectiles.push(pellet);
          }
          
          // HEAVY RECOIL - much stronger than pistol
          player.mesh.scale.set(1.3, 0.7, 1.3);
          if (playerRecoilTimeout) clearTimeout(playerRecoilTimeout);
          playerRecoilTimeout = setTimeout(() => {
            player.mesh.scale.set(1, 1, 1);
            playerRecoilTimeout = null;
          }, 100);
          activeTimeouts.push(playerRecoilTimeout);

          // Per-weapon muzzle flash system
          if (typeof window.spawnWeaponMuzzleFlash === 'function') {
            const flashDir = new THREE.Vector3(
              Math.sin(player.mesh.rotation.y),
              0,
              Math.cos(player.mesh.rotation.y)
            );
            window.spawnWeaponMuzzleFlash('doubleBarrel', player.mesh.position, flashDir, scene);
          }

          weapons.doubleBarrel.lastShot = time;
          playSound('doublebarrel');
        }
      }
      
      // 7. ICE SPEAR
      if (weapons.iceSpear.active && time - weapons.iceSpear.lastShot > weapons.iceSpear.cooldown) {
        // Find nearest enemy via spatial hash
        const _isRangeSq = weapons.iceSpear.range * weapons.iceSpear.range;
        const _isResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _isRangeSq, enemies);
        let nearest = _isResult.enemy;

        if (nearest) {
          // Use pool if available, otherwise create new
          if (window._iceSpearPool) {
            const iceSpear = window._iceSpearPool.get().reinit(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position);
            projectiles.push(iceSpear);
          } else {
            projectiles.push(new IceSpear(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position));
          }

          // Per-weapon muzzle flash system
          if (typeof window.spawnWeaponMuzzleFlash === 'function') {
            const dir = new THREE.Vector3(
              nearest.mesh.position.x - player.mesh.position.x,
              0,
              nearest.mesh.position.z - player.mesh.position.z
            ).normalize();
            window.spawnWeaponMuzzleFlash('iceSpear', player.mesh.position, dir, scene);
          }

          weapons.iceSpear.lastShot = time;
          playSound('shoot');
        }
      }
      
      // 8. FIRE RING
      if (weapons.fireRing.active && time - weapons.fireRing.lastShot > weapons.fireRing.cooldown) {
        // Damage enemies within ring range via spatial hash
        let hit = false;
        const fireRangeSq = weapons.fireRing.range * weapons.fireRing.range;
        window.GameCombat.forEachEnemyInRangeSH(player.mesh.position.x, player.mesh.position.z, fireRangeSq, enemies, (e) => {
            const dmg = weapons.fireRing.damage * playerStats.strength *
              (1 + (playerStats.fireDamage || 0) + (playerStats.elementalDamage || 0));
            const isCrit = Math.random() < playerStats.critChance;
            const finalDmg = isCrit ? dmg * playerStats.critDmg : dmg;
            e.takeDamage(finalDmg, isCrit, 'fire');
            createDamageNumber(finalDmg, e.mesh.position, isCrit);
            // Fire particles on hit
            spawnParticles(e.mesh.position, 0xFF4500, 6); // Orange-red fire
            spawnParticles(e.mesh.position, 0xFFD700, 4); // Yellow flames
            // Charring effect: progressively darken enemy color toward black on each fire hit.
            // Different factors per channel simulate realistic charring (reds fade slowest).
            if (e.mesh.material && e.mesh.material.color) {
              const CHAR_RED_FACTOR = 0.88;   // Reds persist slightly longer when charred
              const CHAR_GREEN_FACTOR = 0.85; // Greens fade mid-rate
              const CHAR_BLUE_FACTOR = 0.82;  // Blues fade fastest for warm char tint
              e.mesh.material.color.r *= CHAR_RED_FACTOR;
              e.mesh.material.color.g *= CHAR_GREEN_FACTOR;
              e.mesh.material.color.b *= CHAR_BLUE_FACTOR;
            }
            e.lastDamageType = 'fire';
            hit = true;
        });
        if (hit && typeof window.spawnWeaponMuzzleFlash === 'function') {
          window.spawnWeaponMuzzleFlash('fireRing', player.mesh.position, null, scene);
        }
        weapons.fireRing.lastShot = time;
      }

      // 9. LIGHTNING STRIKE — lightning from the heavens, each strike looks different
      if (weapons.lightning.active && time - weapons.lightning.lastShot > weapons.lightning.cooldown) {
        const _ltRangeSq = weapons.lightning.range * weapons.lightning.range;
        const _ltResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _ltRangeSq, enemies);
        let nearest = _ltResult.enemy;
        if (nearest) {
          // Number of simultaneous strikes increases with level
          const strikeCount = weapons.lightning.strikes || 1;
          const hitTargets = new Set();
          let current = nearest;

          for (let sc = 0; sc < strikeCount && current; sc++) {
            if (hitTargets.has(current)) break;
            hitTargets.add(current);

            const chainCount = weapons.lightning.chainCount || 3;
            let chainCurrent = current;
            _tmpBoltStart.set(chainCurrent.mesh.position.x + (Math.random() - 0.5) * 2, 15 + Math.random() * 5, chainCurrent.mesh.position.z + (Math.random() - 0.5) * 2);

            const LIGHTNING_SKY_BASE = 15;
            const LIGHTNING_SKY_VARIANCE = 5;
            const LIGHTNING_OFFSET_RANGE = 2;
            const chainHitTargets = new Set();
            for (let c = 0; c < chainCount && chainCurrent; c++) {
              if (chainHitTargets.has(chainCurrent)) break;
              chainHitTargets.add(chainCurrent);
              const dmg = (weapons.lightning.damage * playerStats.strength) *
                (1 + (playerStats.lightningDamage || 0) + (playerStats.elementalDamage || 0)) *
                (1 - c * 0.2); // 20% falloff per chain
              const isCrit = Math.random() < playerStats.critChance;
              chainCurrent.takeDamage(Math.floor(isCrit ? dmg * playerStats.critDmg : dmg), isCrit, 'lightning');
              spawnParticles(chainCurrent.mesh.position, 0xFFFF00, 6);
              spawnParticles(chainCurrent.mesh.position, 0x00FFFF, 4);
              
              // Visible lightning bolt from sky — each looks different via random jitter
              if (c === 0) _tmpBoltStart.y = LIGHTNING_SKY_BASE + Math.random() * LIGHTNING_SKY_VARIANCE;
              else _tmpBoltStart.y = 0.8;
              _tmpBoltEnd.copy(chainCurrent.mesh.position); _tmpBoltEnd.y = 0.8;
              // Randomize bolt style: forked (many segments), straight (few), zigzag (medium with wide jitter)
              // Segment counts halved from original to reduce BufferGeometry vertex cost.
              const BOLT_STYLES = [
                { baseSegments: 5, extraSegments: 3, jitter: 0.4 },  // Forked
                { baseSegments: 2, extraSegments: 2, jitter: 0.2 },  // Straight
                { baseSegments: 3, extraSegments: 2, jitter: 1.0 }   // Zigzag
              ];
              const style = BOLT_STYLES[Math.floor(Math.random() * BOLT_STYLES.length)];
              const segments = style.baseSegments + Math.floor(Math.random() * style.extraSegments);
              const jitterScale = style.jitter;
              const _boltPositions = new Float32Array((segments + 1) * 3);
              for (let s = 0; s <= segments; s++) {
                const t = s / segments;
                const _bi = s * 3;
                _boltPositions[_bi]     = _tmpBoltStart.x + (_tmpBoltEnd.x - _tmpBoltStart.x) * t + (s > 0 && s < segments ? (Math.random() - 0.5) * jitterScale : 0);
                _boltPositions[_bi + 1] = _tmpBoltStart.y + (_tmpBoltEnd.y - _tmpBoltStart.y) * t + (s > 0 && s < segments ? (Math.random() - 0.5) * jitterScale * 0.5 : 0);
                _boltPositions[_bi + 2] = _tmpBoltStart.z + (_tmpBoltEnd.z - _tmpBoltStart.z) * t + (s > 0 && s < segments ? (Math.random() - 0.5) * jitterScale : 0);
              }
              _ensureSharedGeo();
              const boltGeo = new THREE.BufferGeometry();
              boltGeo.setAttribute('position', new THREE.BufferAttribute(_boltPositions, 3));
              // Vary bolt color slightly between strikes
              const boltColors = [0xFFFF00, 0x88DDFF, 0xFFFFFF, 0xAADDFF, 0xCCFFFF];
              const boltMat = _sharedBoltMat.clone();
              boltMat.color.setHex(boltColors[Math.floor(Math.random() * boltColors.length)]);
              const boltLine = new THREE.Line(boltGeo, boltMat);
              scene.add(boltLine);
              // Glow bolt (wider, dimmer)
              const glowMat = _sharedGlowMat.clone();
              const glowLine = new THREE.Line(boltGeo, glowMat);
              scene.add(glowLine);
              // Fade and remove bolt
              if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                let boltLife = 8;
                managedAnimations.push({ update(_dt) {
                  boltLife--;
                  boltMat.opacity = boltLife / 8;
                  glowMat.opacity = (boltLife / 8) * 0.6;
                  if (boltLife <= 0) {
                    scene.remove(boltLine); scene.remove(glowLine);
                    boltGeo.dispose(); boltMat.dispose(); glowMat.dispose();
                    return false;
                  }
                  return true;
                }});
              } else {
                scene.remove(boltLine); scene.remove(glowLine);
                boltGeo.dispose(); boltMat.dispose(); glowMat.dispose();
              }
              
              _tmpBoltStart.copy(chainCurrent.mesh.position);
              // Find next chain target via spatial hash
              let nextTarget = null; let nextDistSq = Infinity;
              const _chainRange = weapons.lightning.chainRange || 5;
              const _chainRangeSq = _chainRange * _chainRange;
              const _chainCandidates = window._enemySpatialHash
                ? window._enemySpatialHash.query(chainCurrent.mesh.position.x, chainCurrent.mesh.position.z, _chainRange)
                : enemies;
              for (let _ci = 0; _ci < _chainCandidates.length; _ci++) {
                const e = _chainCandidates[_ci];
                if (e.isDead || chainHitTargets.has(e)) continue;
                const _cdx = chainCurrent.mesh.position.x - e.mesh.position.x;
                const _cdz = chainCurrent.mesh.position.z - e.mesh.position.z;
                const _cdSq = _cdx * _cdx + _cdz * _cdz;
                if (_cdSq < _chainRangeSq && _cdSq < nextDistSq) { nextDistSq = _cdSq; nextTarget = e; }
              }
              chainCurrent = nextTarget;
            }

            // Find next strike target for multi-strike via spatial hash
            let nextStrikeTarget = null; let nextStrikeDistSq = Infinity;
            const _strikeRangeSq = weapons.lightning.range * weapons.lightning.range;
            const _strikeCandidates = window._enemySpatialHash
              ? window._enemySpatialHash.query(player.mesh.position.x, player.mesh.position.z, weapons.lightning.range)
              : enemies;
            for (let _si = 0; _si < _strikeCandidates.length; _si++) {
              const e = _strikeCandidates[_si];
              if (e.isDead || hitTargets.has(e)) continue;
              const _sdx = player.mesh.position.x - e.mesh.position.x;
              const _sdz = player.mesh.position.z - e.mesh.position.z;
              const _sdSq = _sdx * _sdx + _sdz * _sdz;
              if (_sdSq < _strikeRangeSq && _sdSq < nextStrikeDistSq) { nextStrikeDistSq = _sdSq; nextStrikeTarget = e; }
            }
            current = nextStrikeTarget;
          }

          // Per-weapon muzzle flash system
          if (typeof window.spawnWeaponMuzzleFlash === 'function') {
            const dir = new THREE.Vector3(
              nearest.mesh.position.x - player.mesh.position.x,
              0,
              nearest.mesh.position.z - player.mesh.position.z
            ).normalize();
            window.spawnWeaponMuzzleFlash('lightning', nearest.mesh.position, dir, scene);
          }

          weapons.lightning.lastShot = time;
          playSound('hit');
        }
      }

      // 10. POISON CLOUD — AoE damage field around player that poisons nearby enemies
      if (weapons.poison.active && time - weapons.poison.lastShot > weapons.poison.cooldown) {
        const poisonRangeSq = weapons.poison.range * weapons.poison.range;
        window.GameCombat.forEachEnemyInRangeSH(player.mesh.position.x, player.mesh.position.z, poisonRangeSq, enemies, (e) => {
            const dmg = weapons.poison.damage * playerStats.strength;
            e.takeDamage(Math.floor(dmg), false, 'poison');
            spawnParticles(e.mesh.position, 0x00FF00, 4);
            spawnParticles(e.mesh.position, 0x44FF44, 3);
        });
        // Per-weapon muzzle flash system
        if (typeof window.spawnWeaponMuzzleFlash === 'function') {
          window.spawnWeaponMuzzleFlash('poisonCloud', player.mesh.position, null, scene);
        }
        weapons.poison.lastShot = time;
      }

      // 11. HOMING MISSILE — Bullet Bill style with fire/smoke trail
      if (weapons.homingMissile.active && time - weapons.homingMissile.lastShot > weapons.homingMissile.cooldown) {
        const _hmRangeSq = weapons.homingMissile.range * weapons.homingMissile.range;
        const _hmResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _hmRangeSq, enemies);
        let nearest = _hmResult.enemy;
        if (nearest) {
          // Bullet Bill body: dark sphere with white eyes — use cached geometries/materials
          _ensureSharedGeo();
          const mc = _missileGeoCache;
          const missileGroup = new THREE.Group();
          const body = new THREE.Mesh(mc.bodyGeo, mc.bodyMat);
          missileGroup.add(body);
          // Nose cone
          const nose = new THREE.Mesh(mc.noseGeo, mc.noseMat);
          nose.rotation.x = Math.PI / 2;
          nose.position.z = 0.35;
          missileGroup.add(nose);
          // Arms (small fins)
          const arms = new THREE.Mesh(mc.armGeo, mc.armMat);
          arms.position.z = -0.15;
          missileGroup.add(arms);
          // White eyes
          const leftEye = new THREE.Mesh(mc.eyeGeo, mc.eyeWhiteMat);
          leftEye.position.set(-0.12, 0.08, 0.22);
          missileGroup.add(leftEye);
          const rightEye = new THREE.Mesh(mc.eyeGeo, mc.eyeWhiteMat);
          rightEye.position.set(0.12, 0.08, 0.22);
          missileGroup.add(rightEye);
          // Pupils
          const leftPupil = new THREE.Mesh(mc.pupilGeo, mc.pupilMat);
          leftPupil.position.set(-0.12, 0.08, 0.28);
          missileGroup.add(leftPupil);
          const rightPupil = new THREE.Mesh(mc.pupilGeo, mc.pupilMat);
          rightPupil.position.set(0.12, 0.08, 0.28);
          missileGroup.add(rightPupil);
          
          missileGroup.position.set(player.mesh.position.x, 0.6, player.mesh.position.z);
          // Tilt missile at 45° angle (lie down instead of standing up)
          missileGroup.rotation.x = -Math.PI / 4;
          scene.add(missileGroup);
          let target = nearest;
          let mLife = 120;
          let smokeTimer = 0;
          // Borrow a pre-allocated velocity vector from the pool (zero allocation on missile launch).
          // `& 3` is equivalent to `% 4` for wrapping within 0-3 — more readable as explicit modulo.
          const mVel = _missileVelPool[_missileVelIdx++ % _missileVelPool.length];
          mVel.set(target.mesh.position.x - missileGroup.position.x, 0, target.mesh.position.z - missileGroup.position.z).normalize().multiplyScalar(0.25);
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              mLife--;
              smokeTimer++;
              // Home toward target with stronger tracking
              if (!target.isDead) {
                _tmpMissileDesired.set(target.mesh.position.x - missileGroup.position.x, 0, target.mesh.position.z - missileGroup.position.z).normalize().multiplyScalar(0.25);
                mVel.lerp(_tmpMissileDesired, 0.15); // Stronger homing
              } else {
                // Re-acquire target if current target died — use spatial hash
                const _reAcqRangeSq = 400; // 20² world units
                const _reAcqResult = window.GameCombat.findNearestEnemySH(missileGroup.position.x, missileGroup.position.z, _reAcqRangeSq, enemies);
                if (_reAcqResult.enemy) target = _reAcqResult.enemy;
              }
              missileGroup.position.add(mVel);
              missileGroup.rotation.y = Math.atan2(mVel.x, mVel.z);
              missileGroup.rotation.x = -Math.PI / 4; // Maintain 45° tilt
              // Enhanced fire and smoke trail from back
              const trailPos = { x: missileGroup.position.x - mVel.x * 1.5, y: missileGroup.position.y, z: missileGroup.position.z - mVel.z * 1.5 };
              spawnParticles(trailPos, 0xFF4400, 2); // Orange fire
              spawnParticles(trailPos, 0xFF2200, 1); // Red fire
              if (smokeTimer % 2 === 0) {
                spawnParticles(trailPos, 0x555555, 2); // More smoke
                spawnParticles(trailPos, 0x888888, 1); // Light smoke
              }
              // Explode on contact — direct array scan for nearby enemies
              for (let _mi = 0; _mi < enemies.length; _mi++) {
                const e = enemies[_mi];
                if (e.isDead) continue;
                const _mhdx = missileGroup.position.x - e.mesh.position.x;
                const _mhdz = missileGroup.position.z - e.mesh.position.z;
                if (_mhdx * _mhdx + _mhdz * _mhdz < 1.44) { // 1.2²
                  const dmg = weapons.homingMissile.damage * playerStats.strength;
                  e.takeDamage(Math.floor(dmg), false, 'shotgun'); // Use shotgun death = dismemberment
                  spawnParticles(missileGroup.position, 0xFF4500, 12);
                  spawnParticles(missileGroup.position, 0xFFAA00, 8);
                  spawnParticles(missileGroup.position, 0x222222, 6); // Smoke explosion
                  // Massive blood burst from explosion
                  if (window.BloodSystem) window.BloodSystem.emitBurst(e.mesh.position, 500, { spreadXZ: 2.5, spreadY: 1.5 });
                  if (window.BloodV2) window.BloodV2.kill(e, 'shotgun');
                  if (window.GoreSim) window.GoreSim.onKill(e, 'rocket');
                  // Homing missile: massive gore blobs + heavy blood spray
                  spawnParticles(e.mesh.position, 0x8B0000, 5);
                  spawnParticles(e.mesh.position, 0xCC0000, 4);
                  for (let mgc = 0; mgc < 4 && bloodDrips.length < MAX_BLOOD_DRIPS; mgc++) {
                    _ensureSharedGeo();
                    let mgore;
                    const _mgPool = window.meatChunkPool || null;
                    if (_mgPool) {
                      mgore = _mgPool.get();
                      mgore.visible = true;
                    } else {
                      mgore = new THREE.Mesh(_sharedGoreGeo, _sharedGoreMats[mgc % 2]);
                      scene.add(mgore);
                    }
                    const mgScale = 0.9 + Math.random() * 1.1; // vary size via scale
                    mgore.scale.setScalar(mgScale);
                    mgore.position.copy(e.mesh.position);
                    bloodDrips.push({
                      mesh: mgore,
                      velX: (Math.random() - 0.5) * 0.55,
                      velZ: (Math.random() - 0.5) * 0.55,
                      velY: 0.3 + Math.random() * 0.4,
                      life: 60 + Math.floor(Math.random() * 25),
                      _pool: _mgPool
                    });
                  }
                  for (let gd = 0; gd < 3; gd++) {
                    spawnBloodDecal({ x: e.mesh.position.x + (Math.random()-0.5)*0.8, y: 0, z: e.mesh.position.z + (Math.random()-0.5)*0.8 });
                  }
                  // Heavy knockback from missile
                  _tmpKnockback.set(e.mesh.position.x - missileGroup.position.x, 0, e.mesh.position.z - missileGroup.position.z).normalize();
                  e.mesh.position.x += _tmpKnockback.x * 2.5;
                  e.mesh.position.z += _tmpKnockback.z * 2.5;
                  // Knockback Domino: give this enemy a slide so the domino logic in
                  // enemy-class.js can chain-collide with other nearby enemies
                  e._shotgunSlide = {
                    vx: _tmpKnockback.x * 0.45,
                    vz: _tmpKnockback.z * 0.45,
                    frames: 14,
                    frame: 0
                  };
                  // Hit-stop: heavy missile impact deserves a brief freeze
                  triggerHitStop(70);
                  scene.remove(missileGroup);
                  // Don't dispose shared cached geometries/materials
                  return false;
                }
              }
              if (mLife <= 0) {
                scene.remove(missileGroup);
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(missileGroup);
          }

          // Per-weapon muzzle flash system
          if (typeof window.spawnWeaponMuzzleFlash === 'function') {
            const dir = new THREE.Vector3(
              nearest.mesh.position.x - player.mesh.position.x,
              0,
              nearest.mesh.position.z - player.mesh.position.z
            ).normalize();
            window.spawnWeaponMuzzleFlash('homingMissile', player.mesh.position, dir, scene);
          }

          weapons.homingMissile.lastShot = time;
          playSound('shoot');
        }
      }

      // ── 12. SAMURAI SWORD — wide arc slash, higher damage than regular sword ──
      if (weapons.samuraiSword && weapons.samuraiSword.active && time - weapons.samuraiSword.lastShot > weapons.samuraiSword.cooldown) {
        const slashAngle = Math.atan2(
          (enemies[0] && !enemies[0].isDead ? enemies[0].mesh.position.z : 0) - player.mesh.position.z,
          (enemies[0] && !enemies[0].isDead ? enemies[0].mesh.position.x : 1) - player.mesh.position.x
        );
        // Use pool if available, otherwise create new
        if (window._swordSlashPool) {
          const slash = window._swordSlashPool.get().reinit(player.mesh.position.x, player.mesh.position.z, slashAngle);
          projectiles.push(slash);
        } else {
          projectiles.push(new SwordSlash(player.mesh.position.x, player.mesh.position.z, slashAngle));
        }
        weapons.samuraiSword.lastShot = time;
        playSound('shoot');
      }

      // ── 13. WHIP — chain damage through multiple enemies ──
      if (weapons.whip && weapons.whip.active && time - weapons.whip.lastShot > weapons.whip.cooldown) {
        let hitCount = 0;
        const maxChain = weapons.whip.chainHits || 3;
        _tmpWhipLastPos.copy(player.mesh.position);
        const hitEnemies = new Set();
        const _whipRange = weapons.whip.range;
        const _whipRangeSq = _whipRange * _whipRange;
        for (let c = 0; c < maxChain; c++) {
          let nearest = null; let minDSq = _whipRangeSq;
          const _whipCandidates = window._enemySpatialHash
            ? window._enemySpatialHash.query(_tmpWhipLastPos.x, _tmpWhipLastPos.z, _whipRange)
            : enemies;
          for (let _wi = 0; _wi < _whipCandidates.length; _wi++) {
            const e = _whipCandidates[_wi];
            if (e.isDead || hitEnemies.has(e)) continue;
            const _wdx = _tmpWhipLastPos.x - e.mesh.position.x;
            const _wdz = _tmpWhipLastPos.z - e.mesh.position.z;
            const _wdSq = _wdx * _wdx + _wdz * _wdz;
            if (_wdSq < minDSq) { minDSq = _wdSq; nearest = e; }
          }
          if (!nearest) break;
          hitEnemies.add(nearest);
          const dmg = weapons.whip.damage * playerStats.strength * (1 - c * 0.15);
          nearest.takeDamage(Math.floor(dmg), false, 'melee');
          spawnParticles(nearest.mesh.position, 0xCC8844, 4);
          _tmpWhipLastPos.copy(nearest.mesh.position);
          hitCount++;
        }
        if (hitCount > 0) playSound('shoot');
        weapons.whip.lastShot = time;
      }

      // ── 14. UZI — extreme fire rate ranged projectile ──
      if (weapons.uzi && weapons.uzi.active && time - weapons.uzi.lastShot > weapons.uzi.cooldown) {
        const _uziRangeSq = weapons.uzi.range * weapons.uzi.range;
        const _uziResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _uziRangeSq, enemies);
        let nearest = _uziResult.enemy;
        if (nearest) {
          const p = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position);
          p.mesh.material.color.setHex(0xFFD700); // Bright orange-gold uzi rounds
          if (p.glow) p.glow.material.color.setHex(0xFFAA00);
          weapons.uzi.lastShot = time;
          projectiles.push(p);
          playSound('shoot');
        }
      }

      // ── 15. 50 CAL SNIPER — high damage, piercing, slow fire ──
      if (weapons.sniperRifle && weapons.sniperRifle.active && time - weapons.sniperRifle.lastShot > weapons.sniperRifle.cooldown) {
        const _snRangeSq = weapons.sniperRifle.range * weapons.sniperRifle.range;
        const _snResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _snRangeSq, enemies);
        let nearest = _snResult.enemy;
        if (nearest) {
          const p = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position);
          p.pierceCount = weapons.sniperRifle.piercing || 3;
          // Fix: ensure maxHits reflects sniper's built-in piercing (overrides the reinit default)
          p.maxHits = (weapons.sniperRifle.piercing || 3) + (playerStats.pierceCount || 0);
          p.isSniperRifle = true;
          // Sniper: elongated bright white/blue-tinted slug
          p.mesh.scale.set(0.8, 0.8, 2.2);
          p.mesh.material.color.setHex(0xFFFFFF); // Bright white
          if (p.glow) { p.glow.material.color.setHex(0xAADDFF); p.glow.material.opacity = 0.6; }
          _rescaleProjSpeed(p, 2.8); // sniper rounds: 0.8 * 3.5 = 2.8
          projectiles.push(p);
          spawnParticles(player.mesh.position, 0xFFFFFF, 4);
          weapons.sniperRifle.lastShot = time;
          playSound('shoot');
        }
      }

      // ── 16. PUMP SHOTGUN — wide spread, heavy pellets ──
      if (weapons.pumpShotgun && weapons.pumpShotgun.active && time - weapons.pumpShotgun.lastShot > weapons.pumpShotgun.cooldown) {
        const _psRangeSq = weapons.pumpShotgun.range * weapons.pumpShotgun.range;
        const _psResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _psRangeSq, enemies);
        let nearest = _psResult.enemy;
        if (nearest) {
          const baseAngle = Math.atan2(nearest.mesh.position.z - player.mesh.position.z, nearest.mesh.position.x - player.mesh.position.x);
          const pelletCount = weapons.pumpShotgun.pellets || 8;
          const spreadAngle = weapons.pumpShotgun.spread || 0.7;
          for (let i = 0; i < pelletCount; i++) {
            const spread = (Math.random() + Math.random() - 1.0) * spreadAngle;
            const dir = { x: Math.cos(baseAngle + spread) * 20 + player.mesh.position.x, y: 0, z: Math.sin(baseAngle + spread) * 20 + player.mesh.position.z };
            const pellet = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, dir);
            pellet.isDoubleBarrel = true;
            pellet.mesh.scale.set(0.32, 0.32, 0.32); // small heavy pellets
            if (pellet.glow) pellet.glow.scale.set(0.32, 0.32, 0.32);
            _rescaleProjSpeed(pellet, 2.1 + Math.random() * 0.525); // pump shotgun: 0.6*3.5–0.75*3.5
            pellet.life = 20;
            projectiles.push(pellet);
          }
          spawnParticles(player.mesh.position, 0xFFAA00, 6);
          weapons.pumpShotgun.lastShot = time;
          playSound('shoot');
        }
      }

      // ── 17. AUTO SHOTGUN — rapid semi-auto bursts ──
      if (weapons.autoShotgun && weapons.autoShotgun.active && time - weapons.autoShotgun.lastShot > weapons.autoShotgun.cooldown) {
        const _asRangeSq = weapons.autoShotgun.range * weapons.autoShotgun.range;
        const _asResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _asRangeSq, enemies);
        let nearest = _asResult.enemy;
        if (nearest) {
          const baseAngle = Math.atan2(nearest.mesh.position.z - player.mesh.position.z, nearest.mesh.position.x - player.mesh.position.x);
          const pelletCount = weapons.autoShotgun.pellets || 6;
          for (let i = 0; i < pelletCount; i++) {
            const spread = (Math.random() + Math.random() - 1.0) * (weapons.autoShotgun.spread || 0.6);
            const dir = { x: Math.cos(baseAngle + spread) * 20 + player.mesh.position.x, y: 0, z: Math.sin(baseAngle + spread) * 20 + player.mesh.position.z };
            const pellet = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, dir);
            pellet.isDoubleBarrel = true;
            pellet.mesh.scale.set(0.25, 0.25, 0.25); // very small rapid-fire pellets
            if (pellet.glow) pellet.glow.scale.set(0.25, 0.25, 0.25);
            _rescaleProjSpeed(pellet, 1.925 + Math.random() * 0.35); // auto shotgun: 0.55*3.5–0.65*3.5
            pellet.life = 18;
            projectiles.push(pellet);
          }
          weapons.autoShotgun.lastShot = time;
          playSound('shoot');
        }
      }

      // ── 18. MINIGUN — extreme fire rate ──
      if (weapons.minigun && weapons.minigun.active && time - weapons.minigun.lastShot > weapons.minigun.cooldown) {
        const _mgRangeSq = weapons.minigun.range * weapons.minigun.range;
        const _mgResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _mgRangeSq, enemies);
        let nearest = _mgResult.enemy;
        if (nearest) {
          const spreadOffset = (Math.random() - 0.5) * 0.15;
          const dir = { x: nearest.mesh.position.x + spreadOffset, y: 0, z: nearest.mesh.position.z + spreadOffset };
          const p = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, dir);
          p.mesh.material.color.setHex(0xFFD700); // Bright orange-gold minigun rounds
          if (p.glow) p.glow.material.color.setHex(0xFFAA00);
          _rescaleProjSpeed(p, 2.45); // minigun: 0.7 * 3.5 = 2.45
          projectiles.push(p);
          weapons.minigun.lastShot = time;
          if (Math.random() < 0.3) playSound('shoot');
        }
      }

      // ── 19. BOW — long range arrow with pierce ──
      if (weapons.bow && weapons.bow.active && time - weapons.bow.lastShot > weapons.bow.cooldown) {
        const _bowRangeSq = weapons.bow.range * weapons.bow.range;
        const _bowResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _bowRangeSq, enemies);
        let nearest = _bowResult.enemy;
        if (nearest) {
          const p = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position);
          p.pierceCount = weapons.bow.piercing || 1;
          p.mesh.scale.set(0.3, 0.3, 1.2);
          p.mesh.material.color.setHex(0x8B4513);
          p.isBow = true; // flag for projectile-pinning on hit
          _rescaleProjSpeed(p, 0.5); // bow arrows slightly faster than reverted base (0.4)
          projectiles.push(p);
          weapons.bow.lastShot = time;
          playSound('shoot');
        }
      }

      // ── 20. TESLA SABER — melee hit + chain lightning effect ──
      if (weapons.teslaSaber && weapons.teslaSaber.active && time - weapons.teslaSaber.lastShot > weapons.teslaSaber.cooldown) {
        const tsRange = weapons.teslaSaber.range * weapons.teslaSaber.range;
        let hitAny = false;
        window.GameCombat.forEachEnemyInRangeSH(player.mesh.position.x, player.mesh.position.z, tsRange, enemies, (e) => {
            const dmg = weapons.teslaSaber.damage * playerStats.strength;
            e.takeDamage(Math.floor(dmg), false, 'lightning');
            spawnParticles(e.mesh.position, 0x00CCFF, 6);
            spawnParticles(e.mesh.position, 0xFFFFFF, 3);
            hitAny = true;
        });
        if (hitAny) playSound('shoot');
        weapons.teslaSaber.lastShot = time;
      }

      // ── 21. BOOMERANG — projectile that returns, hits both ways ──
      if (weapons.boomerang && weapons.boomerang.active && time - weapons.boomerang.lastShot > weapons.boomerang.cooldown) {
        const _bmRangeSq = weapons.boomerang.range * weapons.boomerang.range;
        const _bmResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _bmRangeSq, enemies);
        let nearest = _bmResult.enemy;
        if (nearest) {
          const p = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position);
          p.isBoomerang = true;
          p.returnPhase = false;
          p.originX = player.mesh.position.x;
          p.originZ = player.mesh.position.z;
          p.mesh.material.color.setHex(0xDD8800);
          p.mesh.scale.set(0.5, 0.5, 0.5);
          p.life = 80;
          projectiles.push(p);
          weapons.boomerang.lastShot = time;
          playSound('shoot');
        }
      }

      // ── 22. SHURIKEN — multiple spinning stars auto-target ──
      if (weapons.shuriken && weapons.shuriken.active && time - weapons.shuriken.lastShot > weapons.shuriken.cooldown) {
        const starCount = weapons.shuriken.projectiles || 3;
        // Use spatial hash to find nearby alive enemies, then sort closest
        const _shRange = weapons.shuriken.range || 15;
        const _shCandidates = window._enemySpatialHash
          ? window._enemySpatialHash.query(player.mesh.position.x, player.mesh.position.z, _shRange)
          : enemies;
        const sortedEnemies = [];
        for (let _si = 0; _si < _shCandidates.length; _si++) {
          const e = _shCandidates[_si];
          if (!e.isDead) sortedEnemies.push(e);
        }
        sortedEnemies.sort((a, b) => {
          const _adx = player.mesh.position.x - a.mesh.position.x;
          const _adz = player.mesh.position.z - a.mesh.position.z;
          const _bdx = player.mesh.position.x - b.mesh.position.x;
          const _bdz = player.mesh.position.z - b.mesh.position.z;
          return (_adx * _adx + _adz * _adz) - (_bdx * _bdx + _bdz * _bdz);
        });
        if (sortedEnemies.length > starCount) sortedEnemies.length = starCount;
        sortedEnemies.forEach(e => {
          const p = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, e.mesh.position);
          p.isShuriken = true;
          p.mesh.material.color.setHex(0xCCCCCC);
          p.mesh.scale.set(0.4, 0.4, 0.15);
          _rescaleProjSpeed(p, 0.45); // shuriken travel slower than bullets
          projectiles.push(p);
        });
        if (sortedEnemies.length > 0) playSound('shoot');
        weapons.shuriken.lastShot = time;
      }

      // ── 23. NANO SWARM — persistent damaging cloud around player ──
      if (weapons.nanoSwarm && weapons.nanoSwarm.active && time - weapons.nanoSwarm.lastShot > weapons.nanoSwarm.cooldown) {
        const swarmRangeSq = weapons.nanoSwarm.range * weapons.nanoSwarm.range;
        window.GameCombat.forEachEnemyInRangeSH(player.mesh.position.x, player.mesh.position.z, swarmRangeSq, enemies, (e) => {
            const dmg = weapons.nanoSwarm.damage * playerStats.strength;
            e.takeDamage(Math.floor(dmg), false, 'special');
            if (Math.random() < 0.3) spawnParticles(e.mesh.position, 0x88AAFF, 2);
        });
        spawnParticles(player.mesh.position, 0x6688FF, 4);
        weapons.nanoSwarm.lastShot = time;
      }

      // ── 24. FIREBALL — projectile that explodes on impact ──
      if (weapons.fireball && weapons.fireball.active && time - weapons.fireball.lastShot > weapons.fireball.cooldown) {
        const _fbRangeSq = weapons.fireball.range * weapons.fireball.range;
        const _fbResult = window.GameCombat.findNearestEnemySH(player.mesh.position.x, player.mesh.position.z, _fbRangeSq, enemies);
        let nearest = _fbResult.enemy;
        if (nearest) {
          const p = _spawnProjectile(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position);
          p.isFireball = true;
          p.explosionRadius = weapons.fireball.explosionRadius || 3;
          p.mesh.material.color.setHex(0xFF4400);
          p.mesh.material.emissive = new THREE.Color(0xFF2200);
          p.mesh.material.emissiveIntensity = 0.6;
          p.mesh.scale.set(0.6, 0.6, 0.6);
          _rescaleProjSpeed(p, 0.35); // fireballs are lobbed slowly for explosive area damage
          projectiles.push(p);
          spawnParticles(player.mesh.position, 0xFF6600, 4);
          weapons.fireball.lastShot = time;
          playSound('shoot');
        }
      }

      updateWaterParticles(dt);
      updateStatBar();
      
      // Update Harvesting system (resource node interactions)
      if (window.GameHarvesting && player && player.mesh) {
        window._gamePlayerMesh = player.mesh;
        window.GameHarvesting.update(dt, player.mesh.position, Date.now());
        // Resolve solid collisions so the player cannot walk through harvestable nodes
        window.GameHarvesting.resolveNodeCollisions(player.mesh.position, 0.55);
      }

      // Update Rage Combat system (meter decay, special attack cooldowns)
      if (window.GameRageCombat) {
        window.GameRageCombat.update(dt);
      }
      // Update melee takedown button cooldown display
      if (window._updateMeleeButton) window._updateMeleeButton();
      
      // Phase 5: Update companion
      if (activeCompanion && !activeCompanion.isDead) {
        activeCompanion.update(dt);
      }

      // Wildlife AI — wandering and interaction
      if (window._wildlifeAnimals && player && player.mesh) {
        const pPos = player.mesh.position;
        for (const animalGroup of window._wildlifeAnimals) {
          const ud = animalGroup.userData;
          if (!ud || !ud.alive) continue;
          // Wander timer
          ud.wanderTimer -= dt;
          if (ud.wanderTimer <= 0) {
            ud.wanderTimer = 3 + Math.random() * 5;
            const baseX = animalGroup.position.x;
            const baseZ = animalGroup.position.z;
            ud.wanderTarget = { x: baseX + (Math.random() - 0.5) * 20, z: baseZ + (Math.random() - 0.5) * 20 };
          }
          // Move toward wander target
          const wx = ud.wanderTarget.x - animalGroup.position.x;
          const wz = ud.wanderTarget.z - animalGroup.position.z;
          const wDist = Math.sqrt(wx * wx + wz * wz);
          if (wDist > 1) {
            const spd = (ud.animalData.speed || 0.05) * 0.5;
            animalGroup.position.x += (wx / wDist) * spd;
            animalGroup.position.z += (wz / wDist) * spd;
            animalGroup.rotation.y = Math.atan2(wx, wz);
          }
          // Idle animation — slight bob
          animalGroup.position.y = Math.sin(Date.now() * 0.002 + (animalGroup.userData.wanderTimer * 100)) * 0.05;

          // Player interaction check (tranquilize for quest33)
          const pdx = pPos.x - animalGroup.position.x;
          const pdz = pPos.z - animalGroup.position.z;
          const pDist = Math.sqrt(pdx * pdx + pdz * pdz);

          // ── HUNTING KNIFE: instantly kill any nearby animal if the knife is equipped ──
          if (pDist < KNIFE_KILL_RANGE && !ud._knifeKilled) {
            const hasKnife = saveData.craftedWeapons && (saveData.craftedWeapons.knife || saveData.craftedWeapons.huntingKnife);
            const toolsOwned = window.GameHarvesting ? window.GameHarvesting.getTools() : null;
            const knifeOwned = hasKnife || (toolsOwned && toolsOwned.knife);
            if (knifeOwned) {
              ud._knifeKilled = true;
              ud.alive = false;
              animalGroup.visible = false;
              // Drop leather and meat
              const leatherAmt = 1 + Math.floor(Math.random() * 2);
              const meatAmt    = 1 + Math.floor(Math.random() * 2);
              if (!saveData.resources) saveData.resources = {};
              saveData.resources.leather = (saveData.resources.leather || 0) + leatherAmt;
              saveData.resources.meat    = (saveData.resources.meat    || 0) + meatAmt;
              if (window.GameHarvesting && window.GameHarvesting.refreshHUD) window.GameHarvesting.refreshHUD();
              if (typeof showStatChange === 'function') {
                showStatChange('🔪 +' + leatherAmt + ' Leather');
                setTimeout(() => showStatChange('🍖 +' + meatAmt + ' Meat'), 400);
              }
              // Spawn blood decal where animal was
              if (typeof spawnBloodDecal === 'function') {
                spawnBloodDecal(animalGroup.position);
              }
              saveSaveData();
            }
          }

          if (pDist < 3 && ud.animalId === 'wolf' && ud.gender) {
            // Check if player has tranquilizer rifle and quest is active
            if (saveData.craftedWeapons && saveData.craftedWeapons.tranquilizerRifle &&
                saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest33_captureWolves') {
              if (!ud.tranquilized) {
                ud.tranquilized = true;
                ud.alive = false;
                animalGroup.visible = false;
                if (!saveData.tranquilizedAnimals) saveData.tranquilizedAnimals = [];
                saveData.tranquilizedAnimals.push({ id: 'wolf', gender: ud.gender });
                if (typeof showStatChange === 'function') showStatChange('🔫 ' + ud.gender + ' Wolf Tranquilized!');
                // Check if both wolves captured
                const captured = saveData.tranquilizedAnimals.filter(a => a.id === 'wolf');
                const hasMale = captured.some(a => a.gender === 'male');
                const hasFemale = captured.some(a => a.gender === 'female');
                if (hasMale && hasFemale) {
                  if (typeof progressTutorialQuest === 'function') progressTutorialQuest('quest33_captureWolves', true);
                }
                saveSaveData();
              }
            }
          }
        }
      }
      
      // Update drone turrets
      droneTurrets.forEach(drone => drone.update(dt));
      
      // Projectiles update returns false if dead; release pooled bullets back to the pool
      // In-place compaction avoids the GC spike from .filter() creating a new array each frame.
      // Frustum culling: skip expensive collision + movement for off-screen non-homing projectiles,
      // but still decrement their life counter so they expire normally and don't leak.
      {
        let _j = 0;
        for (let _i = 0; _i < projectiles.length; _i++) {
          const p = projectiles[_i];
          if (p.mesh && !p.isHoming && !_isInFrustum(p.mesh.position)) {
            // Off-screen: tick lifetime only — skip movement & collision.
            if (p.life !== undefined) p.life--;
            else if (p.lifetime !== undefined) p.lifetime--;
            const expired = (p.life !== undefined && p.life <= 0) ||
                            (p.lifetime !== undefined && p.lifetime <= 0);
            if (expired) {
              if (typeof p.destroy === 'function') p.destroy();
              // Return to appropriate pool
              if (p._isPooled) {
                if (window._projectilePool && p.vx !== undefined && p.mesh && !p.mesh.geometry.type.includes('Ring') && !p.mesh.geometry.type.includes('Cone')) {
                  window._projectilePool.release(p);
                } else if (window._swordSlashPool && p.mesh && p.mesh.geometry.type && p.mesh.geometry.type.includes('Ring')) {
                  window._swordSlashPool.release(p);
                } else if (window._iceSpearPool && p.mesh && p.mesh.geometry.type && p.mesh.geometry.type.includes('Cone')) {
                  window._iceSpearPool.release(p);
                }
              }
              // Drop from array (don't push to _j)
            } else {
              projectiles[_j++] = p;
            }
            continue;
          }
          const alive = p.update() !== false;
          if (!alive) {
            // Return to appropriate pool based on object type
            if (p._isPooled) {
              if (window._projectilePool && p.vx !== undefined && p.mesh && !p.mesh.geometry.type.includes('Ring') && !p.mesh.geometry.type.includes('Cone')) {
                window._projectilePool.release(p);
              } else if (window._swordSlashPool && p.mesh && p.mesh.geometry.type && p.mesh.geometry.type.includes('Ring')) {
                window._swordSlashPool.release(p);
              } else if (window._iceSpearPool && p.mesh && p.mesh.geometry.type && p.mesh.geometry.type.includes('Cone')) {
                window._iceSpearPool.release(p);
              }
            }
          }
          if (alive) projectiles[_j++] = p;
        }
        projectiles.length = _j;
      }
      // Meteors — in-place compaction (no new array allocation)
      {
        let _j = 0;
        for (let _i = 0; _i < meteors.length; _i++) {
          const alive = meteors[_i].update() !== false;
          if (!alive && meteors[_i]._isPooled && window._meteorPool) {
            window._meteorPool.release(meteors[_i]);
          }
          if (alive) meteors[_j++] = meteors[_i];
        }
        meteors.length = _j;
      }
      // ExpGems: skip update() for gems that are truly off-screen AND far from the player
      // (player can't collect them if they're off-screen and beyond pickup range).
      // We use a generous 12-unit "safe zone" around the player to catch magnet/collection
      // triggers before they enter the frustum.
      const _EXP_CULL_SAFE_SQ = 12 * 12;
      expGems.forEach(g => {
        if (g.mesh && !_isInFrustum(g.mesh.position)) {
          // Allow update if player is close enough to possibly collect the gem
          const _gdx = g.mesh.position.x - player.mesh.position.x;
          const _gdz = g.mesh.position.z - player.mesh.position.z;
          if (_gdx * _gdx + _gdz * _gdz > _EXP_CULL_SAFE_SQ) return;
        }
        g.update(player.mesh.position);
      });
      goldCoins.forEach(g => g.update(player.mesh.position));
      goldDrops.forEach(g => g.update(player.mesh.position));
      chests.forEach(c => c.update(player.mesh.position));
      // Boss Chests (dropped by bosses, grant Relic loot screen on collection)
      if (window.bossChests && window.bossChests.length) {
        window.bossChests = window.bossChests.filter(bc => { bc.update(player.mesh.position); return !bc.collected; });
      }

      // --- Instanced renderer: sync entity transforms to GPU buffers ---
      if (window._instancedRenderer && window._instancedRenderer.active) {
        const ir = window._instancedRenderer;
        const _enemyInstancingEnabled = window.ENEMY_INSTANCING_ENABLED === true;

        if (_enemyInstancingEnabled) {
          // Propagate each enemy's current material colour as its per-instance colour so that
          // damage flashes (blood stain, freeze tint, etc.) are visible on instanced bodies.
          // CRITICAL FIX: For instanced enemies, use their stored base color (_baseColorHex)
          // instead of material.color, because instanced enemies use shared white materials.
          // This ensures each enemy type renders with its correct color (green, blue, teal, etc.)
          // instead of all appearing white or green.
          for (let _ei = 0; _ei < enemies.length; _ei++) {
            const _e = enemies[_ei];
            if (_e && _e.mesh && !_e.isDead && _e._usesInstancing) {
              // Use the stored base color hex for instanced enemies
              if (_e._baseColorHex !== undefined) {
                _e._instanceColor = _e._baseColorHex;
              } else if (_e.mesh.material) {
                // Fallback to material color if base color not set
                _e._instanceColor = _e.mesh.material.color;
              }
            }
          }
        }

        ir.beginFrame();
        if (_enemyInstancingEnabled) {
          ir.syncEntities('enemy_tank',     enemies,     e => !e.isDead && e.type === 0 && e._usesInstancing);
          ir.syncEntities('enemy_fast',     enemies,     e => !e.isDead && e.type === 1 && e._usesInstancing);
          ir.syncEntities('enemy_balanced', enemies,     e => !e.isDead && e.type === 2 && e._usesInstancing);

          // Sync eye positions for instanced enemies — compute world-space position from
          // the body mesh's transform (position + Y-rotation + scale).  Eyes are spheres
          // so rotation in the eye batch itself doesn't matter visually.
          const _eyeBatch = ir.getBatch('enemy_eye');
          if (_eyeBatch) {
            const _eyeSpread = 0.18;  // local X offset (types 0-2 all share this value)
            const _eyeYOff   = 0.28;  // local Y offset — fixed (matches non-instanced eyes)
            // Forward (local +Z) offset per type so eyes sit outside the body mesh.
            // Tank (0) body radius ~0.55, Balanced (2) ~0.45, Fast (1) ~0.32.
            const _EYE_FWD_BY_TYPE = { 0: 0.58, 1: 0.35, 2: 0.48 };
            for (let _ei = 0; _ei < enemies.length; _ei++) {
              const _e = enemies[_ei];
              if (!_e || !_e.mesh || _e.isDead || !_e._usesInstancing) continue;
              if (_e.type !== 0 && _e.type !== 1 && _e.type !== 2) continue;

              const _eyeFwd = _EYE_FWD_BY_TYPE[_e.type] ?? 0.42;

              const _mx  = _e.mesh.position.x;
              const _my  = _e.mesh.position.y;
              const _mz  = _e.mesh.position.z;
              const _ry  = _e.mesh.rotation.y;
              const _cos = Math.cos(_ry);
              const _sin = Math.sin(_ry);

              // Left eye: local (-spread, _eyeYOff, fwd)
              // THREE.js Y-rotation matrix: wx = cos*lx + sin*lz, wz = -sin*lx + cos*lz
              _eyeSyncPos.set(
                _mx + _cos * -_eyeSpread + _sin * _eyeFwd,
                _my + _eyeYOff,
                _mz + -_sin * -_eyeSpread + _cos * _eyeFwd
              );
              _eyeBatch.push(_eyeSyncPos, _eyeSyncEuler, _eyeSyncScale);

              // Right eye: local (+spread, _eyeYOff, fwd)
              _eyeSyncPos.set(
                _mx + _cos * _eyeSpread + _sin * _eyeFwd,
                _my + _eyeYOff,
                _mz + -_sin * _eyeSpread + _cos * _eyeFwd
              );
              _eyeBatch.push(_eyeSyncPos, _eyeSyncEuler, _eyeSyncScale);
            }
            // Note: endFrame() below will commit the eye batch along with all others.
          }
        }

        ir.syncEntities('exp_gem', expGems, g => g.active);
        ir.syncEntities('bullet', projectiles, p => p.active && !p.isEnemyProjectile);
        // bullet_glow uses the same entity array: syncEntities reads p.mesh.position which is
        // the bullet position.  The 'bullet_glow' batch geometry is a larger sphere (radius 0.18)
        // so each instance renders as a soft halo around the corresponding bullet.
        ir.syncEntities('bullet_glow', projectiles, p => p.active && !p.isEnemyProjectile);
        ir.endFrame();
      }

      // --- Dopamine system per-frame updates ---
      if (window.DopamineSystem) {
        if (window.DopamineSystem.CameraFX) window.DopamineSystem.CameraFX.update(dt);
        if (window.DopamineSystem.ElasticNumbers) window.DopamineSystem.ElasticNumbers.update(dt);
        if (window.DopamineSystem.FeverMode) window.DopamineSystem.FeverMode.update(dt);
      }

      // --- Advanced physics per-frame updates ---
      if (window._projectileLightPool) window._projectileLightPool.update();
      if (window.AdvancedPhysics && window.AdvancedPhysics.DynamicShadows) {
        window.AdvancedPhysics.DynamicShadows.update();
      }
      if (window._waterMaterial && window.AdvancedPhysics) {
        window.AdvancedPhysics.WaterMaterial.animate(window._waterMaterial, gameTime);
      }
      
      // Phase 5: Update particles and release back to pool when dead
      // PERFORMANCE: Cull particles beyond fog far plane (invisible beyond fog anyway)
      // In-place compaction avoids the GC spike from .filter() creating a new array each frame.
      const FOG_DISTANCE_SQ = RENDERER_CONFIG.fogFar * RENDERER_CONFIG.fogFar;
      {
        let _j = 0;
        for (let _i = 0; _i < particles.length; _i++) {
          const p = particles[_i];
          // Cull particles beyond fog distance (inline squared avoids both sqrt and method call)
          const _pfdx = p.mesh.position.x - player.mesh.position.x;
          const _pfdz = p.mesh.position.z - player.mesh.position.z;
          const distSq = _pfdx * _pfdx + _pfdz * _pfdz;
          if (distSq > FOG_DISTANCE_SQ) {
            // Remove from scene before releasing so the mesh is not left as an
            // invisible orphan in scene.children, which inflates scene child count.
            scene.remove(p.mesh);
            p.mesh.visible = false;
            if (particlePool) particlePool.release(p);
            continue;
          }
          const alive = p.update();
          if (!alive && particlePool) particlePool.release(p);
          if (alive) particles[_j++] = p;
        }
        particles.length = _j;
      }
      
      // Update blood decal fade (12 second lifetime)
      updateBloodDecals();
      
      // Update bullet tracer trails — fade opacity to 0 over ~150ms and remove
      if (window.bulletTrails && window.bulletTrails.length > 0) {
        let _j = 0;
        for (let _i = 0; _i < window.bulletTrails.length; _i++) {
          const t = window.bulletTrails[_i];
          t.life--;
          t.mesh.material.opacity = Math.max(0, (t.life / 9) * 0.55);
          if (t.life <= 0) {
            scene.remove(t.mesh);
            // Return to pool instead of disposing geometry/material (prevents GC stutter).
            if (window.GameObjectPool && t.mesh._poolEntry) {
              window.GameObjectPool.releaseTrail(t.mesh._poolEntry);
            } else {
              t.mesh.geometry.dispose();
              t.mesh.material.dispose();
            }
          } else {
            window.bulletTrails[_j++] = t;
          }
        }
        window.bulletTrails.length = _j;
      }

      // Update advanced blood particle system
      if (window.BloodSystem) window.BloodSystem.update();
      if (window.BloodV2) window.BloodV2.update(dt);
      if (window.GoreSim) window.GoreSim.update(dt);
      // Update trauma system (gore chunks, stuck arrows, wound decals)
      if (window.TraumaSystem) window.TraumaSystem.update();

      // Update managed animations (replaces individual RAF loops for death/damage effects)
      // In-place compaction — no new array allocation each frame.
      if (managedAnimations.length > 0) {
        let _j = 0;
        for (let _i = 0; _i < managedAnimations.length; _i++) {
          if (managedAnimations[_i].update(dt)) managedAnimations[_j++] = managedAnimations[_i];
        }
        managedAnimations.length = _j;
      }

      // Update blood drips (falling drops from wounded enemies)
      // In-place compaction — no new array allocation each frame.
      // Hard cap: purge oldest drips if array exceeds MAX_BLOOD_DRIPS to prevent
      // runaway mesh proliferation (safety guard per GC requirements).
      while (bloodDrips.length > MAX_BLOOD_DRIPS) {
        const _old = bloodDrips.shift();
        if (_old && _old.mesh) scene.remove(_old.mesh);
      }
      if (bloodDrips.length > 0) {
        let _j = 0;
        for (let _i = 0; _i < bloodDrips.length; _i++) {
          const d = bloodDrips[_i];
          d.velY -= 0.018;
          d.mesh.position.y += d.velY;
          // Apply horizontal velocity for spray effect
          if (d.velX) d.mesh.position.x += d.velX;
          if (d.velZ) d.mesh.position.z += d.velZ;
          d.life--;
          if (d.mesh.position.y <= 0.02 || d.life <= 0) {
            const hitGround = d.mesh.position.y <= 0.02;
            // Reuse temp vector instead of clone()
            _tmpKnockback.copy(d.mesh.position);
            scene.remove(d.mesh);
            // Only dispose geometry/material if they are NOT shared
            if (!d._sharedGeo) {
              if (!_sharedGoreGeo || (d.mesh.geometry !== _sharedGoreGeo && d.mesh.geometry !== _sharedLavaGeo)) {
                d.mesh.geometry.dispose();
              }
            }
            if (!_sharedGoreMats[0] || (d.mesh.material !== _sharedGoreMats[0] && d.mesh.material !== _sharedGoreMats[1] &&
                d.mesh.material !== _sharedLavaMats[0] && d.mesh.material !== _sharedLavaMats[1])) {
              d.mesh.material.dispose();
            }
            // Ice shards don't leave blood decals on landing
            if (hitGround && !d.isIce) spawnBloodDecal(_tmpKnockback);
            continue; // dropped from array
          }
          bloodDrips[_j++] = d;
        }
        bloodDrips.length = _j;
      }
      
      // Update object wobble animations (trees, fences, barrels, crates)
      if (window.destructibleProps) {
        for (let prop of window.destructibleProps) {
          if (prop.destroyed || !prop._wobbleTime || prop._wobbleTime <= 0) continue;
          prop._wobbleTime -= dt;
          const wobbleAmount = Math.sin(prop._wobbleTime * 18) * prop._wobbleTime * 0.15;
          const dir = prop._wobbleDir || { x: 1, z: 0 };
          prop.mesh.rotation.x = dir.x * wobbleAmount;
          prop.mesh.rotation.z = dir.z * wobbleAmount;
          if (prop._wobbleTime <= 0) {
            prop.mesh.rotation.x = 0;
            prop.mesh.rotation.z = 0;
          }
        }
      }
      if (window.breakableFences) {
        for (let fence of window.breakableFences) {
          if (!fence.userData || fence.userData.hp <= 0 || !fence.userData._wobbleTime || fence.userData._wobbleTime <= 0) continue;
          fence.userData._wobbleTime -= dt;
          const wobbleAmount = Math.sin(fence.userData._wobbleTime * 20) * fence.userData._wobbleTime * 0.2;
          const dir = fence.userData._wobbleDir || { x: 1, z: 0 };
          fence.rotation.x = dir.x * wobbleAmount;
          fence.rotation.z = dir.z * wobbleAmount;
          if (fence.userData._wobbleTime <= 0) {
            fence.rotation.x = 0;
            fence.rotation.z = 0;
          }
        }
      }
      
      // Performance: Use cached arrays instead of scene.traverse() every frame
      // Windmill Rotation and Light Animation
      animatedSceneObjects.windmills.forEach(c => {
        // Rotate all blades stored in userData
        if (c.userData.blades && c.userData.blades.length > 0) {
          c.userData.blades[0].rotation.z += 0.02;
        }
        // Rotate spinning ground shadow in sync with blades + offset by sun angle
        if (c.userData.shadowGroup) {
          c.userData.shadowGroup.rotation.z += 0.02;
          // Move shadow based on sun position for realistic shadow casting
          if (window.dirLight) {
            const lightPos = window.dirLight.position;
            const wmPos = c.position;
            const shadowDirX = wmPos.x - lightPos.x;
            const shadowDirZ = wmPos.z - lightPos.z;
            const shadowDist = Math.sqrt(shadowDirX*shadowDirX + shadowDirZ*shadowDirZ);
            // Shadow offset: longer when sun is lower (more dramatic at sunset/sunrise)
            const sunH = Math.max(lightPos.y, 15);
            const shadowLength = Math.min(12, 80 / sunH);
            if (shadowDist > 0) {
              c.userData.shadowGroup.position.set(
                wmPos.x + (shadowDirX / shadowDist) * shadowLength,
                0.03,
                wmPos.z + (shadowDirZ / shadowDist) * shadowLength
              );
              // Scale shadow based on sun height
              const shadowScale = 0.8 + shadowLength * 0.15;
              c.userData.shadowGroup.scale.set(shadowScale, shadowScale, 1);
            }
            // Shadow opacity: darker when sun is brighter
            const opacity = Math.min(0.35, window.dirLight.intensity * 0.3);
            c.userData.shadowGroup.children.forEach(child => {
              if (child.material) child.material.opacity = opacity;
            });
          }
        }
        
        // Animate windmill light (pulsing) with null check
        if (c.userData.light && c.userData.light.material) {
          c.userData.light.material.opacity = 0.8 + Math.sin(gameTime * 3) * 0.2;
        }
      });
      
      // Water ripple animation
      animatedSceneObjects.waterRipples.forEach(c => {
        c.userData.phase += 0.05;
        const scale = 1 + Math.sin(c.userData.phase) * 0.1;
        c.scale.set(scale, 1, scale);
        c.material.opacity = 0.3 + Math.sin(c.userData.phase) * 0.2;
      });
      
      // Lake sparkles animation
      animatedSceneObjects.sparkles.forEach(c => {
        c.userData.phase += 0.02 * c.userData.speed;
        c.material.opacity = 0.3 + Math.abs(Math.sin(c.userData.phase)) * 0.7;
        c.scale.set(
          1 + Math.sin(c.userData.phase * 2) * 0.5,
          1,
          1 + Math.sin(c.userData.phase * 2) * 0.5
        );
      });
      
      // Crystal tower animation
      animatedSceneObjects.crystals.forEach(obj => {
        // Rotate crystals
        obj.rotation.x += 0.01;
        obj.rotation.y += 0.02;
        
        // Orbit animation
        obj.userData.phase += 0.01 * obj.userData.orbitSpeed;
        const offsetY = Math.sin(obj.userData.phase) * 0.5;
        obj.position.y += offsetY * 0.05;
        
        // Pulsing emissive
        if (obj.material.emissiveIntensity !== undefined) {
          obj.material.emissiveIntensity = 0.3 + Math.sin(obj.userData.phase * 2) * 0.2;
        }
      });
      
      // Comet particle animation (orbiting particles)
      animatedSceneObjects.cometParticles.forEach(obj => {
        // Store the initial position as the orbit center (relative to parent/comet group)
        if (!obj.userData.basePosition) {
          obj.userData.basePosition = obj.position.clone();
        }
        
        obj.userData.angle += obj.userData.speed * 0.02;
        
        const centerX = obj.userData.basePosition.x;
        const centerZ = obj.userData.basePosition.z;
        const centerY = obj.userData.basePosition.y;
        
        obj.position.x = centerX + Math.cos(obj.userData.angle) * obj.userData.radius;
        obj.position.z = centerZ + Math.sin(obj.userData.angle) * obj.userData.radius;
        obj.position.y = centerY + obj.userData.height + Math.sin(obj.userData.angle * 2) * 0.3;
        
        // Pulsing opacity (between 0.3 and 0.7 for good visibility)
        obj.material.opacity = 0.5 + Math.sin(obj.userData.angle * 3) * 0.2;
      });
      
      // Waterfall animation
      
      // Tree sway animation - subtle wind effect
      if (window.destructibleProps) {
        window.destructibleProps.forEach(prop => {
          if (prop.type === 'tree' && !prop.destroyed && prop.mesh.userData.swayPhase !== undefined) {
            prop.mesh.userData.swayPhase += dt * prop.mesh.userData.swaySpeed;
            const swayX = Math.sin(prop.mesh.userData.swayPhase) * prop.mesh.userData.swayAmount;
            const swayZ = Math.cos(prop.mesh.userData.swayPhase * 0.7) * prop.mesh.userData.swayAmount;
            
            // Apply sway to leaves (independent sway)
            if (prop.mesh.userData.leaves) {
              prop.mesh.userData.leaves.rotation.x = swayX;
              prop.mesh.userData.leaves.rotation.z = swayZ;
            }
            // Trunk sways less
            if (prop.mesh.userData.trunk) {
              prop.mesh.userData.trunk.rotation.x = swayX * 0.3;
              prop.mesh.userData.trunk.rotation.z = swayZ * 0.3;
            }
          }
        });
      }
      
      // Fence physics - check player collision and reset
      if (window.breakableFences) {
        window.breakableFences.forEach(fence => {
          if (fence.userData.isFence && fence.userData.hp > 0) {
            const dist = Math.sqrt(
              (player.mesh.position.x - fence.position.x) ** 2 +
              (player.mesh.position.z - fence.position.z) ** 2
            );
            
            // Player collision - shake fence
            if (dist < 2) {
              fence.rotation.x = Math.sin(gameTime * 10) * 0.1;
              fence.rotation.z = Math.cos(gameTime * 10) * 0.1;
            } else {
              // Return to normal
              fence.rotation.x *= 0.9;
              fence.rotation.z *= 0.9;
            }
          }
        });
      }
      
      // Walk-into prop damage: barrels and crates take damage when player runs into them
      if (window.destructibleProps && player && !player.isDead) {
        const PROP_WALK_COLLISION_SQ = 1.2; // Squared distance: ~1.1 unit radius for barrel/crate collision
        const PROP_WALK_DMG_COOLDOWN = 300; // ms between walk-into damage ticks (tunable)
        for (let prop of window.destructibleProps) {
          if (prop.destroyed || prop.type === 'tree') continue; // Trees need dash to break
          const pdx = player.mesh.position.x - prop.mesh.position.x;
          const pdz = player.mesh.position.z - prop.mesh.position.z;
          const pdist2 = pdx * pdx + pdz * pdz;
          if (pdist2 < PROP_WALK_COLLISION_SQ) {
            // Wobble effect when player walks into prop
            prop.mesh.rotation.x = Math.sin(gameTime * 12) * 0.12;
            prop.mesh.rotation.z = Math.cos(gameTime * 10) * 0.12;
            if (!prop._walkDmgTimer || Date.now() - prop._walkDmgTimer > PROP_WALK_DMG_COOLDOWN) {
              prop._walkDmgTimer = Date.now();
              prop.hp -= 8; // Walk-into damage
              spawnParticles(prop.mesh.position, 0xD2691E, 4);
              const hpPct = prop.hp / prop.maxHp;
              if (hpPct <= 0.5 && !prop.darkenedStage1) {
                prop.darkenedStage1 = true;
                prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.8);
              } else if (hpPct <= 0.25 && !prop.darkenedStage2) {
                prop.darkenedStage2 = true;
                prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.6);
                prop.mesh.scale.copy(prop.originalScale).multiplyScalar(0.85);
              } else if (prop.hp <= 0) {
                prop.destroyed = true;
                if (prop.type === 'barrel') {
                  spawnParticles(prop.mesh.position, 0xFF4500, 20);
                  spawnParticles(prop.mesh.position, 0xFFFF00, 10);
                } else {
                  spawnParticles(prop.mesh.position, 0xD2691E, 18);
                }
                scene.remove(prop.mesh);
                if (prop.mesh.geometry) prop.mesh.geometry.dispose();
                if (prop.mesh.material) prop.mesh.material.dispose();
              }
            }
          } else {
            // Return to upright position when player moves away
            prop.mesh.rotation.x *= 0.85;
            prop.mesh.rotation.z *= 0.85;
          }
        }
      }
      
      // Waterfall animation
      animatedSceneObjects.waterfalls.forEach(obj => {
        obj.userData.phase += 0.05;
        obj.material.opacity = 0.6 + Math.sin(obj.userData.phase) * 0.1;
      });
      
      animatedSceneObjects.waterDrops.forEach(obj => {
        obj.position.y -= obj.userData.speed;
        if (obj.position.y < 0) {
          obj.position.y = obj.userData.startY;
        }
      });
      
      animatedSceneObjects.splashes.forEach(obj => {
        obj.userData.phase += 0.1;
        const scale = 1 + Math.sin(obj.userData.phase) * 0.3;
        obj.scale.set(scale, 1, scale);
        obj.material.opacity = 0.4 + Math.sin(obj.userData.phase) * 0.2;
      });
      
      // FRESH IMPLEMENTATION: Tesla Tower Lightning Arcs Animation
      animatedSceneObjects.teslaTowers.forEach(tower => {
        if (!tower.userData.arcTimer) tower.userData.arcTimer = 0;
        tower.userData.arcTimer += dt;
        
        // Create new lightning arc every 1.5 seconds
        if (tower.userData.arcTimer > 1.5) {
          tower.userData.arcTimer = 0;
          
          // Clear old arcs
          if (tower.userData.arcLines && tower.userData.arcLines.length > 0) {
            tower.userData.arcLines.forEach(line => {
              scene.remove(line);
              if (line.geometry) line.geometry.dispose();
              if (line.material) line.material.dispose();
            });
            tower.userData.arcLines = [];
          }
          
          // Create new lightning arcs to random ground points
          const numArcs = Math.floor(Math.random() * 2) + 2; // 2-3 arcs
          for (let i = 0; i < numArcs; i++) {
            const targetPoint = tower.userData.arcPoints[Math.floor(Math.random() * tower.userData.arcPoints.length)];
            
            // Create jagged lightning path using Float32Array (avoids per-segment Vector3 allocation)
            const segments = 8;
            const _arcStart = tower.userData.topPosition;
            const _arcEnd = targetPoint;
            const _arcPositions = new Float32Array((segments + 1) * 3);
            // First point: start
            _arcPositions[0] = _arcStart.x; _arcPositions[1] = _arcStart.y; _arcPositions[2] = _arcStart.z;
            for (let j = 1; j < segments; j++) {
              const t = j / segments;
              const _ai = j * 3;
              _arcPositions[_ai]     = _arcStart.x + (_arcEnd.x - _arcStart.x) * t + (Math.random() - 0.5) * 3;
              _arcPositions[_ai + 1] = _arcStart.y + (_arcEnd.y - _arcStart.y) * t;
              _arcPositions[_ai + 2] = _arcStart.z + (_arcEnd.z - _arcStart.z) * t + (Math.random() - 0.5) * 3;
            }
            // Last point: end
            const _lastI = segments * 3;
            _arcPositions[_lastI] = _arcEnd.x; _arcPositions[_lastI + 1] = _arcEnd.y; _arcPositions[_lastI + 2] = _arcEnd.z;
            
            // Create line (Note: linewidth has no effect in WebGL, arcs will be 1-pixel lines)
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(_arcPositions, 3));
            const material = new THREE.LineBasicMaterial({ 
              color: 0x00FFFF, 
              transparent: true,
              opacity: 0.8
            });
            const line = new THREE.Line(geometry, material);
            scene.add(line);
            tower.userData.arcLines.push(line);
          }
        }
        
        // Fade out arcs over time
        if (tower.userData.arcLines && tower.userData.arcLines.length > 0) {
          const fadeProgress = tower.userData.arcTimer / 1.5;
          const opacity = Math.max(0, 0.8 - fadeProgress * 0.8);
          tower.userData.arcLines.forEach(line => {
            if (line.material) line.material.opacity = opacity;
          });
        }
      });

      // Volcano light flicker & Tesla light flicker
      if (window.volcanoLight) {
        window.volcanoLight.userData.phase += dt * 8;
        window.volcanoLight.intensity = 3 + Math.sin(window.volcanoLight.userData.phase) * 1.5 + Math.sin(window.volcanoLight.userData.phase * 3.7) * 0.8;
      }
      // ── All-Seeing Eye (Pyramid): hover bob + pulse glow ──
      if (window._pyramidEye) {
        const pe = window._pyramidEye;
        pe.phase += dt * 1.5;
        pe.group.position.y = pe.baseY + Math.sin(pe.phase) * 0.3;
        pe.group.rotation.y = pe.phase * 0.4;
        // Pulse the glow intensity
        if (pe.glow) {
          pe.glow.intensity = 1.8 + Math.sin(pe.phase * 2.0) * 1.2;
        }
      }
      if (window.lavaPool && window.lavaPool.material) {
        const lp = window.lavaPool;
        lp.userData.phase = (lp.userData.phase || 0) + dt * 4;
        lp.material.color.setHex(Math.sin(lp.userData.phase) > 0 ? 0xFF6A00 : 0xFF4500);
      }
      if (window.teslaPointLight) {
        window.teslaPointLight.userData.phase += dt * 5;
        window.teslaPointLight.intensity = 2 + Math.sin(window.teslaPointLight.userData.phase * 3) * 1.5;
      }
      // Area 51 warning light removed (Area 51 base removed from map)

      // All-Seeing Eye orb pulse animation (Illuminati pyramid)
      if (window._eyeOfHorusMesh) {
        window._eyeOfHorusPhase = (window._eyeOfHorusPhase || 0) + dt * 2.2;
        const _eyePulse = 0.7 + Math.sin(window._eyeOfHorusPhase) * 0.3;
        window._eyeOfHorusMesh.material.opacity = _eyePulse;
        // Gentle hover: oscillate around the base position stored in userData
        if (window._eyeOfHorusMesh.userData.baseY === undefined) {
          window._eyeOfHorusMesh.userData.baseY = window._eyeOfHorusMesh.position.y;
        }
        window._eyeOfHorusMesh.position.y =
          window._eyeOfHorusMesh.userData.baseY + Math.sin(window._eyeOfHorusPhase * 0.8) * 0.4;
        if (window._eyeOfHorusLight) {
          window._eyeOfHorusLight.intensity = 1.5 + Math.sin(window._eyeOfHorusPhase) * 1.0;
        }
      }

      // ── Annunaki Obelisk: crystal rotation + energy ring spin + pulsing lights ──
      if (window._annunakiObelisk) {
        const obelisk = window._annunakiObelisk;

        // Rotate and pulse the top energy crystal
        if (obelisk.crystal) {
          obelisk.crystal.userData.phase = (obelisk.crystal.userData.phase || 0) + dt * 1.5;
          obelisk.crystal.rotation.y += dt * 0.8;
          obelisk.crystal.rotation.x = Math.sin(obelisk.crystal.userData.phase) * 0.3;
          // Pulse the crystal's emissive intensity
          obelisk.crystal.material.emissiveIntensity = 1.0 + Math.sin(obelisk.crystal.userData.phase * 2) * 0.4;
        }

        // Rotate energy rings at different speeds
        if (obelisk.rings && obelisk.rings.length > 0) {
          obelisk.rings.forEach((ring, idx) => {
            if (ring.userData.isEnergyRing) {
              ring.userData.phase += dt * ring.userData.speed;
              ring.rotation.z = ring.userData.phase;
              // Subtle opacity pulse
              ring.material.opacity = (0.3 - idx * 0.08) + Math.sin(ring.userData.phase * 1.5) * 0.1;
            }
          });
        }

        // Pulse the top and base lights
        const obeliskPhase = (window._obeliskLightPhase || 0) + dt * 2.0;
        window._obeliskLightPhase = obeliskPhase;

        if (obelisk.topLight) {
          obelisk.topLight.intensity = 2.5 + Math.sin(obeliskPhase) * 0.8;
        }
        if (obelisk.baseLight) {
          obelisk.baseLight.intensity = 1.3 + Math.sin(obeliskPhase * 1.3) * 0.5;
        }

        // Pulse pylon crystals
        if (obelisk.pylonCrystals && obelisk.pylonCrystals.length > 0) {
          obelisk.pylonCrystals.forEach(crystal => {
            crystal.userData.phase = (crystal.userData.phase || 0) + dt * 2.5;
            crystal.rotation.y += dt * 1.2;
            // Sync pulse with main crystal but offset by initial phase
            crystal.material.opacity = 0.6 + Math.sin(obeliskPhase * 2 + crystal.userData.phase) * 0.2;
          });
        }
      }

      // Lava damage: player takes damage when close to volcano (OPTIMIZED: ultra-compact at -35, 0, -35)
      if (player && isGameActive && !isGameOver) {
        const LAVA_DAMAGE_RADIUS = 8;   // Distance from volcano center to take lava damage
        const LAVA_WARN_RADIUS = 14;    // Distance at which warning appears
        const LAVA_MAX_DAMAGE = 10;     // Max damage per tick at volcano center
        const LAVA_TICK_INTERVAL = 0.5; // Seconds between lava damage ticks
        const lavaX = -35, lavaZ = -35; // OPTIMIZED: Updated for ultra-compact 80x80 map (was -60, -72)
        const ldx = player.mesh.position.x - lavaX;
        const ldz = player.mesh.position.z - lavaZ;
        const lavaDist = Math.sqrt(ldx * ldx + ldz * ldz);
        // Show warning when approaching lava zone (helps prevent "random death")
        if (lavaDist < LAVA_WARN_RADIUS && lavaDist >= LAVA_DAMAGE_RADIUS) {
          if (!window._lavaWarnShown || (Date.now() - window._lavaWarnShown) > 5000) {
            window._lavaWarnShown = Date.now();
            showStatChange('🌋 DANGER: Volcanic heat! Move away!');
          }
        }
        if (lavaDist < LAVA_DAMAGE_RADIUS) {
          if (!window._lavaDamageTimer) window._lavaDamageTimer = 0;
          window._lavaDamageTimer += dt;
          if (window._lavaDamageTimer > LAVA_TICK_INTERVAL) {
            window._lavaDamageTimer = 0;
            player.takeDamage(LAVA_MAX_DAMAGE * (1 - lavaDist / LAVA_DAMAGE_RADIUS)); // More damage closer to center
            spawnParticles(player.mesh.position, 0xFF4500, 4);
            playSound('volcano');
          }
        }
        // Lava spout: occasional lava particles erupting from volcano top
        if (!window._lavaSpoutTimer) window._lavaSpoutTimer = 0;
        window._lavaSpoutTimer += dt;
        if (window._lavaSpoutTimer > (2 + Math.random() * 3)) { // Every 2-5 seconds
          window._lavaSpoutTimer = 0;
          _ensureLavaPool();
          for (let ls = 0; ls < 8; ls++) {
            _ensureSharedGeo();
            const lavaMatIdx = Math.random() < 0.5 ? 0 : 1;
            if (lavaParticles.length >= MAX_LAVA_PARTICLES && lavaParticles.length > 0) {
              const oldest = lavaParticles.shift();
              if (scene && oldest.mesh.parent === scene) scene.remove(oldest.mesh);
              if (_lavaPool) _lavaPool.release(oldest);
            }
            const lavaEntry = _lavaPool ? _lavaPool.get() : {
              mesh: new THREE.Mesh(_sharedLavaGeo, _sharedLavaMats[lavaMatIdx]),
              vx: 0, vy: 0, vz: 0, life: 0
            };
            lavaEntry.mesh.material = _sharedLavaMats[lavaMatIdx];
            lavaEntry.mesh.position.set(lavaX + (Math.random() - 0.5) * 2, 22, lavaZ + (Math.random() - 0.5) * 2);
            lavaEntry.vx = (Math.random() - 0.5) * 0.3;
            lavaEntry.vz = (Math.random() - 0.5) * 0.3;
            lavaEntry.vy = 0.3 + Math.random() * 0.2;
            lavaEntry.life = 60;
            lavaEntry.mesh.visible = true;
            if (!lavaEntry.mesh.parent && scene) scene.add(lavaEntry.mesh);
            lavaParticles.push(lavaEntry);
          }
        }
      }

      // Update managed smoke particles (replaces individual RAF loops)
      // In-place compaction — no new array allocation each frame.
      {
        let _j = 0;
        for (let _i = 0; _i < smokeParticles.length; _i++) {
          const sp = smokeParticles[_i];
          sp.life--;
          sp.mesh.position.x += sp.velocity.x;
          sp.mesh.position.y += sp.velocity.y;
          sp.mesh.position.z += sp.velocity.z;
          // Ground collision: keep smoke above ground to prevent visual artifacts
          if (sp.mesh.position.y < 0.1) {
            sp.mesh.position.y = 0.1;
            sp.velocity.y = Math.abs(sp.velocity.y) * 0.1; // Damp vertical velocity at ground
          }
          sp.mesh.scale.multiplyScalar(1.05);
          if (sp.material) sp.material.opacity = (sp.life / sp.maxLife) * 0.5;
          if (sp.life <= 0) {
            scene.remove(sp.mesh);
            if (_smokePool) {
              _smokePool.release(sp);
            } else {
              // Don't dispose shared smoke geometry
              sp.material.dispose();
            }
            continue; // dropped from array
          }
          smokeParticles[_j++] = sp;
        }
        smokeParticles.length = _j;
      }

      // Update pooled lava spout particles (volcano)
      {
        let _j = 0;
        for (let _i = 0; _i < lavaParticles.length; _i++) {
          const lp = lavaParticles[_i];
          lp.life--;
          lp.vy -= 0.012;
          lp.mesh.position.x += lp.vx;
          lp.mesh.position.y += lp.vy;
          lp.mesh.position.z += lp.vz;
          if (lp.life <= 0) {
            scene.remove(lp.mesh);
            if (_lavaPool) _lavaPool.release(lp);
            continue;
          }
          lavaParticles[_j++] = lp;
        }
        lavaParticles.length = _j;
      }
      
      const now = Date.now();
      if (now - lastCleanupTime > 3000) { // Run cleanup every 3 seconds
        lastCleanupTime = now;

        // Failsafe: force-remove any enemy mesh still in scene if isDead for more than 10 seconds
        // (guards against cases where the death managedAnimation slot was never available or got stuck)
        const CORPSE_TIMEOUT_MS = 10000;
        for (const e of enemies) {
          if (e.isDead && e._deathTimestamp && (now - e._deathTimestamp) > CORPSE_TIMEOUT_MS) {
            if (e.mesh && e.mesh.parent) scene.remove(e.mesh);
          }
        }

        // Remove dead enemies from array once their death animation has fully completed.
        // Each dieBy* managed-animation callback handles scene.remove when the animation ends.
        // Only splice the enemy out when the mesh is gone (animation done) or the corpse
        // timeout has expired (failsafe for cases where no animation slot was available).
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e.isDead) {
            const meshGone = !e.mesh || !e.mesh.parent;
            const timedOut = e._deathTimestamp && (now - e._deathTimestamp) > CORPSE_TIMEOUT_MS;
            if (meshGone || timedOut) {
              enemies.splice(i, 1);
            }
          }
        }

        // Scene children growth guard — warn and cull stale invisible meshes if count exceeds threshold
        const MAX_SCENE_CHILDREN = 1200;
        if (scene.children.length > MAX_SCENE_CHILDREN) {
          // console.warn(`[Perf] scene.children=${scene.children.length} exceeds ${MAX_SCENE_CHILDREN}. Culling invisible non-tracked meshes.`); // REMOVED: hot-path performance
          const toRemove = [];
          for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            // Only cull plain Mesh objects that have no userData tracking and are fully transparent
            // Handle both single materials and material arrays
            const mat = obj.material;
            const isFullyTransparent = Array.isArray(mat)
              ? mat.every(m => m.transparent && m.opacity <= 0.01)
              : (mat && mat.transparent && mat.opacity <= 0.01);
            if (obj.isMesh && !obj.userData.tracked && isFullyTransparent) {
              toRemove.push(obj);
            }
          }
          toRemove.forEach(obj => {
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            } else if (obj.material) {
              obj.material.dispose();
            }
          });
          // if (toRemove.length) console.warn(`[Perf] Culled ${toRemove.length} stale transparent meshes.`); // REMOVED: hot-path performance
        }

        // Limit max items on ground (memory optimization)
        const MAX_EXP_GEMS = 100;
        const MAX_GOLD_COINS = 50;
        const MAX_GOLD_DROPS = 20;
        
        // Helper function to cleanup distant items
        const cleanupDistantItems = (items, maxItems, collectCallback) => {
          if (items.length > maxItems && player && player.mesh) {
            // Sort by squared distance (avoids sqrt), keep closest ones, auto-collect furthest
            const _px = player.mesh.position.x;
            const _pz = player.mesh.position.z;
            items.sort((a, b) => {
              const _adx = a.mesh.position.x - _px;
              const _adz = a.mesh.position.z - _pz;
              const _bdx = b.mesh.position.x - _px;
              const _bdz = b.mesh.position.z - _pz;
              return (_adx * _adx + _adz * _adz) - (_bdx * _bdx + _bdz * _bdz);
            });
            
            // Auto-collect excess items (furthest ones)
            const excessItems = items.splice(maxItems);
            excessItems.forEach(item => {
              if (item.active) {
                collectCallback(item);
                scene.remove(item.mesh);
                if (item.mesh.geometry) item.mesh.geometry.dispose();
                if (item.mesh.material) item.mesh.material.dispose();
                item.active = false;
              }
            });
          }
        };
        
        // Clean up exp gems
        cleanupDistantItems(expGems, MAX_EXP_GEMS, (gem) => addExp(gem.value));
        
        // Clean up gold coins
        cleanupDistantItems(goldCoins, MAX_GOLD_COINS, (coin) => {
          playerStats.gold += coin.amount;
        });
        
        // Clean up gold drops (visual only — no gold added, just destroy properly)
        cleanupDistantItems(goldDrops, MAX_GOLD_DROPS, (drop) => { if (drop.destroy) drop.destroy(); });
      }
      
      // Compact inactive item arrays — in-place to avoid new array allocation each frame.
      {
        let _j = 0;
        for (let _i = 0; _i < expGems.length; _i++) {
          if (expGems[_i].active) expGems[_j++] = expGems[_i];
        }
        expGems.length = _j;
      }
      {
        let _j = 0;
        for (let _i = 0; _i < goldCoins.length; _i++) {
          if (goldCoins[_i].active) goldCoins[_j++] = goldCoins[_i];
        }
        goldCoins.length = _j;
      }
      {
        let _j = 0;
        for (let _i = 0; _i < goldDrops.length; _i++) {
          if (goldDrops[_i].active) goldDrops[_j++] = goldDrops[_i];
        }
        goldDrops.length = _j;
      }
      {
        let _j = 0;
        for (let _i = 0; _i < chests.length; _i++) {
          if (chests[_i].active) chests[_j++] = chests[_i];
        }
        chests.length = _j;
      }

      // Screen shake effect
      if (window.screenShakeIntensity > 0.01) {
        camera.position.x += (Math.random() - 0.5) * window.screenShakeIntensity * 2;
        camera.position.y += (Math.random() - 0.5) * window.screenShakeIntensity * 1;
        camera.position.z += (Math.random() - 0.5) * window.screenShakeIntensity * 2;
        window.screenShakeIntensity *= 0.85; // Decay
      } else {
        window.screenShakeIntensity = 0;
      }

      // Fountain jet animation
      if (window.fountainJets && isGameActive) {
        const fjTime = gameTime;
        window.fountainJets.forEach(jet => {
          jet.userData.phase += dt * 4;
          const arcHeight = Math.abs(Math.sin(jet.userData.phase)) * 1.5;
          const inAngle = jet.userData.angle;
          const dist = 3.5 - arcHeight * 0.3; // arc inward
          jet.position.set(
            Math.cos(inAngle) * dist,
            0.5 + arcHeight,
            Math.sin(inAngle) * dist
          );
          jet.material.opacity = 0.4 + Math.sin(jet.userData.phase) * 0.3;
        });
      }
      
      // Fountain/lightning spawn sequence update
      if (window.SpawnSequence) window.SpawnSequence.update(dt);

      // Underwater chest shimmer animation
      if (window.underwaterChest && !window.underwaterChest.userData.collected) {
        const uwData = window.underwaterChest.userData;
        if (uwData.shimmerRing) {
          uwData.shimmerRing.userData.phase = (uwData.shimmerRing.userData.phase || 0) + dt * 2;
          const shimmerScale = 1 + Math.sin(uwData.shimmerRing.userData.phase) * 0.2;
          uwData.shimmerRing.scale.set(shimmerScale, shimmerScale, shimmerScale);
          uwData.shimmerRing.material.opacity = 0.3 + Math.sin(uwData.shimmerRing.userData.phase) * 0.2;
        }
        if (uwData.glowLight) {
          uwData.glowLight.intensity = 3 + Math.sin(gameTime * 3) * 1.5;
        }
        // Gentle bobbing
        window.underwaterChest.position.y = -0.4 + Math.sin(gameTime * 1.5) * 0.08;
      }

      // Game logic completed without error — reset consecutive error counter
      performanceLog.gameLogicErrorCount = 0;

      } catch (gameLogicError) {
        // --- END GAME LOGIC try-catch ---
        // Log the error that would have frozen the screen (always-on, not gated by ?debug=1)
        performanceLog.gameLogicErrorCount++;
        if (!window._lastGameLogicError || (Date.now() - window._lastGameLogicError) > 2000) {
          console.error('[GameLoop] Game logic error caught — rendering continues (consecutive errors: ' + performanceLog.gameLogicErrorCount + '):', gameLogicError);
          window._lastGameLogicError = Date.now();
        }
        // Force-end stuck cinematics/killcams that may have caused the crash
        if (cinematicActive) {
          console.warn('[GameLoop] Force-ending cinematic after game logic error');
          cinematicActive = false;
          cinematicData = null;
        }
        if (killCamActive) {
          console.warn('[GameLoop] Force-ending killCam after game logic error');
          killCamActive = false;
        }
      }

      // Phase 3: Render loop protection - wrap in try-catch to prevent freeze
      // Frame Skip Mechanism: Skip rendering if frame budget exceeded
      // BUT: always render after game logic errors to prevent frozen-screen bug
      const renderStartTime = performance.now();
      
      if (!shouldSkipRender || performanceLog.gameLogicErrorCount > 0) {
        // Shadow map: update every 2nd frame normally; force-update on kills/explosions
        renderer.shadowMap.needsUpdate = (performanceLog.frameCount % 2 === 0) || !!window._shadowForceUpdate;
        window._shadowForceUpdate = false;
        try {
          // When CampWorld is active, its dedicated early-return branch handles update/render with its own dt.
          if (!(window.CampWorld && window.CampWorld.isActive) && renderer && scene && camera) {
            renderer.render(scene, camera);
          }
          performanceLog.renderCount++;
          performanceLog.consecutiveSkipCount = 0; // Reset on successful render
        } catch (error) {
          console.error('Render error caught - game continues:', error);
          if (window.GameDebug) window.GameDebug.oshot('render_err', 'Render error: ' + error.message, error.stack);
          // Log error details but continue - the game loop will recover naturally
          // Active objects are already filtered above, so invalid objects are removed
        }
      } else {
        // Frame was skipped to maintain performance (already warned above with throttling)
      }
      
      const renderEndTime = performance.now();
      
      // Always-on freeze detection: log when game logic errors are accumulating
      if (window.GameDebug) {
        window.GameDebug.onRenderStatus(performanceLog.gameLogicErrorCount, cinematicActive, killCamActive, isPaused);
      }
      
      // Track frame performance
      const frameEndTime = performance.now();
      const totalFrameTime = frameEndTime - frameStartTime;
      performanceLog.totalFrameTime = totalFrameTime;
      performanceLog.frameCount++;
      window._frameCount = performanceLog.frameCount; // Expose for AnimationThrottle system
      
      // FRESH: Update FPS watchdog with current frame time
      updateFPSWatchdog(totalFrameTime);
      
      // Log slow frames (disabled for performance - only track count)
      if (totalFrameTime > FRAME_TIME_BUDGET) {
        performanceLog.slowFrames++;
        // Removed console.warn for slow frames - hot-path performance killer on mobile
      }
      
      // Track cumulative frame time for accurate average
      performanceLog.cumulativeFrameTime += totalFrameTime;
      
      // Periodic performance summary (every 5 seconds) - disabled for production perf
      const currentTime = performance.now();
      if (currentTime - performanceLog.lastLogTime > 5000) {
        const avgFrameTime = performanceLog.cumulativeFrameTime / performanceLog.frameCount;
        const slowFramePercent = (performanceLog.slowFrames / performanceLog.frameCount * 100).toFixed(1);
        const runSec = Math.floor((Date.now() - gameStartTime) / 1000);
        // console.log(`[Loop] t=${runSec}s L${playerStats.lvl} — Avg frame: ${avgFrameTime.toFixed(2)}ms, Slow: ${slowFramePercent}%, Enemies: ${aliveEnemies}, Renders: ${performanceLog.renderCount}, cinematic: ${cinematicActive}, paused: ${isPaused}`); // REMOVED: hot-path performance
        
        // Reset counters for next period
        performanceLog.lastLogTime = currentTime;
        performanceLog.slowFrames = 0;
        performanceLog.frameCount = 0;
        performanceLog.spawnCount = 0;
        performanceLog.renderCount = 0;
        performanceLog.cumulativeFrameTime = 0;
      }
      
      // Process disposal queue after rendering (PR #81)
      processDisposalQueue();
    }

    // Init Game
    // Safety pre-check: THREE.js must be loaded before we attempt init
    if (typeof THREE === 'undefined') {
      console.error('[GameLoop] THREE.js not loaded — cannot initialize');
      var noThreeDiv = document.createElement('div');
      noThreeDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(200,0,0,0.95);color:#fff;padding:10px;font-family:monospace;font-size:13px;z-index:99999;text-align:center;';
      noThreeDiv.textContent = '⚠️ THREE.js failed to load. Please refresh or try Sandbox Mode.';
      var noThreeSandboxLink = document.createElement('div');
      noThreeSandboxLink.style.cssText = 'margin-top:6px;color:#0ff;text-decoration:underline;cursor:pointer;font-size:13px;';
      noThreeSandboxLink.textContent = '→ Try Sandbox Mode instead';
      noThreeSandboxLink.onclick = function() { window.location.href = 'sandbox.html'; };
      noThreeDiv.appendChild(noThreeSandboxLink);
      document.body.appendChild(noThreeDiv);
    } else {
    try { init(); } catch(e) {
      console.error('[Game Error]', e);
      console.error('[Game] Initialization failed - proceeding with camp boot anyway (Engine 2.0)');
      window.gameModuleReady = true;
      window.gameInitError = e; // Store the error for display

      // Show error on screen so the user can report what went wrong
      var errorDiv = document.createElement('div');
      errorDiv.id = 'init-error-display';
      errorDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(200,0,0,0.95);color:#fff;padding:10px;font-family:monospace;font-size:11px;z-index:99999;max-height:20vh;overflow-y:auto;border-top:3px solid #ff0;';
      // Build the error overlay content using DOM APIs to avoid injecting HTML
      var headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'font-size:14px;font-weight:bold;color:#ff0;margin-bottom:4px;';
      headerDiv.textContent = '⚠️ GAME INIT ERROR — use links below to recover';
      var messageDiv = document.createElement('div');
      messageDiv.style.cssText = 'white-space:pre-wrap;word-break:break-all;max-height:12vh;overflow-y:auto;';
      messageDiv.textContent = (e && e.stack) ? String(e.stack) : String(e);
      var sandboxLink = document.createElement('div');
      sandboxLink.style.cssText = 'margin-top:6px;color:#0ff;text-decoration:underline;cursor:pointer;font-size:13px;';
      sandboxLink.textContent = '→ Try Sandbox Mode instead';
      sandboxLink.onclick = function() { window.location.href = 'sandbox.html'; };
      var reloadLink = document.createElement('div');
      reloadLink.style.cssText = 'margin-top:6px;color:#ff0;text-decoration:underline;cursor:pointer;font-size:13px;';
      reloadLink.textContent = '↺ Reload page';
      reloadLink.onclick = function() { window.location.reload(); };
      errorDiv.appendChild(headerDiv);
      errorDiv.appendChild(messageDiv);
      errorDiv.appendChild(sandboxLink);
      errorDiv.appendChild(reloadLink);
      // Overlay is NOT dismissible by clicking — user must use Sandbox or Reload links to recover
      document.body.appendChild(errorDiv);
      // NOTE: overlay is NOT auto-dismissed — user must reload or go to Sandbox to recover

      // ── FORCE CAMP BOOT: DO NOT show main menu, boot to camp instead ──
      // Main menu is permanently disabled. Camp can self-initialize independently.
      console.log('[Game] Force booting to camp despite init error');
      var mainMenu = document.getElementById('main-menu');
      if (mainMenu) mainMenu.style.display = 'none'; // Keep main menu hidden

      // CRITICAL: start the animate() loop even when init() failed partway through.
      // If init() threw before reaching the requestAnimationFrame(animate) call at
      // line ~579 of game-screens.js, the loop was never started. Without the loop,
      // CampWorld.render() is never called and the 3D camp stays invisible.
      // Only start the loop if a meaningful render/update path is ready to avoid
      // creating a self-sustaining rAF loop when renderer/scene/camera don't exist.
      var hasCoreRenderPath =
        (typeof renderer !== 'undefined' && !!renderer) &&
        (typeof scene !== 'undefined' && !!scene) &&
        (typeof camera !== 'undefined' && !!camera);
      var hasCampFallbackPath = !!(window.CampWorld && window.gameRenderer);
      if (!animationFrameId && (hasCoreRenderPath || hasCampFallbackPath)) {
        console.log('[Game] Starting animate() loop from catch block (recovery path is ready)');
        animationFrameId = requestAnimationFrame(animate);
      } else if (!animationFrameId) {
        console.warn('[Game] Skipping animate() startup from catch block; renderer/camp fallback not ready');
      }
    }
    } // end THREE check

