// js/game-screens.js — Game initialization (init), start/countdown, menu setup, special attacks panel,
// camp board, progression shop, wave spawning, kill cam, particle/blood/water effects, level-up utilities.
// Depends on: all previously loaded game files

// --- GAME LOGIC ---

function init() {
  console.log('[Init] Starting game initialization...');
  // Load save data and settings first
  loadSaveData();
  loadSettings();
  console.log('[Init] Save data loaded OK');

  // Pre-create shared bullet-hole materials now that THREE.js is available
  ensureBulletHoleMaterials();

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, RENDERER_CONFIG.fogNear, RENDERER_CONFIG.fogFar);
  
  particlePool = new ObjectPool(
    () => {
      const p = new Particle(new THREE.Vector3(0, 0, 0), 0xFFFFFF);
      p.mesh.visible = false;
      return p;
    },
    (particle) => {
      if (scene && particle.mesh.parent === scene) scene.remove(particle.mesh);
      particle.mesh.visible = false;
      particle.mesh.position.set(0, -9999, 0);
      if (particle.vel) particle.vel.set(0, 0, 0);
      particle.life = 0;
    },
    100
  );

  if (typeof window._ensureEntityPools === 'function') window._ensureEntityPools();
  if (window.BloodV2 && typeof THREE !== 'undefined') window.BloodV2.init(scene);
  if (window.TraumaSystem && typeof THREE !== 'undefined') window.TraumaSystem.init(scene);
  if (window.GameObjectPool) window.GameObjectPool.prewarm();
  console.log('[Init] Scene created OK');

  const aspect = window.innerWidth / window.innerHeight;
  const d = RENDERER_CONFIG.cameraDistance;
  camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
  camera.position.set(RENDERER_CONFIG.cameraPositionX, RENDERER_CONFIG.cameraPositionY, RENDERER_CONFIG.cameraPositionZ);
  camera.lookAt(scene.position);
  console.log('[Init] Camera created OK');

  // Init GoreSim after camera is created (needs camera reference for billboard effects)
  if (window.GoreSim && typeof THREE !== 'undefined') window.GoreSim.init(scene, camera);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'mediump',
    logarithmicDepthBuffer: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio));
  window._currentPixelRatio = Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  const gameContainer = document.getElementById('game-container');
  if (!gameContainer) {
    console.error('[Init] #game-container element not found - cannot append renderer canvas');
    throw new Error('game-container element missing from DOM');
  }
  gameContainer.appendChild(renderer.domElement);
  console.log('[Init] Renderer created and appended OK');

  window.gameRenderer = renderer;

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL context lost - attempting recovery');
    setGamePaused(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    console.info('WebGL context restored');
    if (isGameActive) setGamePaused(false);
    renderer.shadowMap.needsUpdate = true;
  }, false);

  window.ambientLight = new THREE.AmbientLight(0xffeedd, 0.65);
  scene.add(window.ambientLight);

  const frustumHalf = RENDERER_CONFIG.shadowFrustumHalfSize;
  window.dirLight = new THREE.DirectionalLight(0xffffee, 0.9);
  window.dirLight.position.set(50, 100, 50);
  window.dirLight.castShadow = true;
  window.dirLight.shadow.mapSize.width = RENDERER_CONFIG.defaultShadowMapSize;
  window.dirLight.shadow.mapSize.height = RENDERER_CONFIG.defaultShadowMapSize;
  window.dirLight.shadow.camera.left = -frustumHalf;
  window.dirLight.shadow.camera.right = frustumHalf;
  window.dirLight.shadow.camera.top = frustumHalf;
  window.dirLight.shadow.camera.bottom = -frustumHalf;
  window.dirLight.shadow.camera.updateProjectionMatrix();
  window.dirLight.shadow.radius = RENDERER_CONFIG.shadowRadius;
  window.dirLight.shadow.bias = RENDERER_CONFIG.shadowBias;
  scene.add(window.dirLight);
  scene.add(window.dirLight.target);

  window.fillLight = new THREE.PointLight(0xffaa66, 0.4, 40, 2);
  window.fillLight.position.set(0, 5, 0);
  scene.add(window.fillLight);

  const _applyGfx = window.applyGraphicsQuality || null;
  if (_applyGfx) {
    if (gameSettings.graphicsQuality === 'auto') {
      _applyGfx('medium');
    } else {
      _applyGfx(gameSettings.graphicsQuality);
    }
  } else {
    console.warn('[Init] applyGraphicsQuality not yet defined — skipping initial quality pass.');
  }

  // World generation is skipped — index.html renders only the 3D CampWorld.
  // createWorld() and cacheAnimatedObjects() are not called here; the combat
  // map is only generated when launching a combat run from sandbox.html.
  // createWorld();
  // cacheAnimatedObjects();
  player = new Player();
  player.mesh.position.set(12, 0.5, 0);
  
  initializeGear();
  if (typeof updateBackgroundMusic === 'function') updateBackgroundMusic();
  
  if (window.GameHarvesting) {
    window.GameHarvesting.init(scene, saveData, spawnParticles);
    window.GameHarvesting._onHarvest = function(resourceType, amount) {
      const tq = saveData.tutorialQuests;
      if (!tq) return;
      const res = saveData.resources || {};
      if (tq.currentQuest === 'quest23_harvestFirst') {
        progressTutorialQuest('quest23_harvestFirst', true);
      }
      if (tq.currentQuest === 'quest24_harvestWoodStone') {
        if ((res.wood || 0) >= 5 && (res.stone || 0) >= 5) {
          progressTutorialQuest('quest24_harvestWoodStone', true);
        }
      }
      saveSaveData();
    };
  }

  if (window.GameRageCombat) {
    window.GameRageCombat.init(scene, saveData, spawnParticles);
    window.GameRageCombat.onRageActivated((damageMult, speedMult) => {
      if (player) {
        player._rageDamageMult = damageMult;
        player._rageSpeedMult = speedMult;
      }
    });
    window.GameRageCombat.onRageDeactivated(() => {
      if (player) {
        player._rageDamageMult = 1;
        player._rageSpeedMult = 1;
      }
    });
    window.GameRageCombat.onSpecialAttack((sa) => {
      const pPos = player && player.mesh ? player.mesh.position : null;
      if (!pPos) return;
      const radSq = sa.damageRadius * sa.damageRadius;
      for (const enemy of enemies) {
        if (!enemy || !enemy.mesh || enemy.isDead) continue;
        const dx = enemy.mesh.position.x - pPos.x;
        const dz = enemy.mesh.position.z - pPos.z;
        if (dx*dx + dz*dz <= radSq) {
          enemy.takeDamage(sa.damage, 'specialAttack');
        }
      }
    });
  }

  const MELEE_COOLDOWN_MS = 6000;
  const MELEE_RANGE = 4.5;
  const MELEE_INSTANT_KILL_DAMAGE = 99999;
  let _meleeLastUsed = 0;

  function isMeleeUnlocked() {
    return saveData.skillTree && saveData.skillTree.meleeTakedown &&
           saveData.skillTree.meleeTakedown.level > 0;
  }

  function updateMeleeButton() {
    const btn = document.getElementById('melee-takedown-btn');
    if (!btn) return;
    if (!isMeleeUnlocked()) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    const elapsed = Date.now() - _meleeLastUsed;
    const ready = elapsed >= MELEE_COOLDOWN_MS;
    btn.disabled = !ready;
    btn.classList.toggle('melee-ready', ready);
    const overlay = document.getElementById('melee-cd-overlay');
    if (overlay) {
      const frac = ready ? 0 : 1 - (elapsed / MELEE_COOLDOWN_MS);
      overlay.style.height = (frac * 100) + '%';
    }
  }

  function performMeleeTakedown() {
    if (!isMeleeUnlocked()) {
      showStatChange('🔒 Unlock Melee Takedown in Skill Tree!');
      return;
    }
    if (!isGameActive || isPaused || isGameOver) return;
    const now = Date.now();
    if (now - _meleeLastUsed < MELEE_COOLDOWN_MS) return;
    if (!player || !player.mesh) return;

    _meleeLastUsed = now;

    const slashEl = document.createElement('div');
    slashEl.className = 'melee-slash-fx';
    slashEl.textContent = '🔪';
    slashEl.style.left = '50%';
    slashEl.style.top = '45%';
    slashEl.style.transform = 'translate(-50%,-50%)';
    document.body.appendChild(slashEl);
    setTimeout(() => slashEl.remove(), 500);

    if (window.GameRageCombat) {
      const flashEl = document.getElementById('rage-flash') || (() => {
        const el = document.createElement('div');
        el.id = 'rage-flash';
        el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:199;';
        document.body.appendChild(el);
        return el;
      })();
      flashEl.style.background = 'rgba(180,0,0,0.35)';
      flashEl.style.transition = 'none';
      setTimeout(() => {
        flashEl.style.transition = 'background 300ms ease-out';
        flashEl.style.background = 'rgba(180,0,0,0)';
      }, 50);
    }

    const pPos = player.mesh.position;
    let nearest = null;
    let nearestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy || !enemy.mesh || enemy.isDead) continue;
      const dx = enemy.mesh.position.x - pPos.x;
      const dz = enemy.mesh.position.z - pPos.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < MELEE_RANGE && dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    if (nearest) {
      nearest.takeDamage(MELEE_INSTANT_KILL_DAMAGE, 'melee');
      showStatChange('🔪 TAKEDOWN!');
    } else {
      showStatChange('🔪 No enemy in range!');
    }

    updateMeleeButton();
  }

  const meleeBtn = document.getElementById('melee-takedown-btn');
  if (meleeBtn) {
    meleeBtn.addEventListener('click', performMeleeTakedown);
    meleeBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      performMeleeTakedown();
    }, { passive: false });
  }

  window._updateMeleeButton = updateMeleeButton;
  window._gameCamera = camera;
  
  setupInputs();
  console.log('[Init] Inputs set up OK');
  setupMenus();
  console.log('[Init] Menus set up OK');
  window.addEventListener('resize', onWindowResize, false);
  onWindowResize();

  if (!window._audioContextUnlocked) {
    const _unlockAudio = function() {
      window._audioContextUnlocked = true;
      if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') {
        try { audioCtx.resume(); } catch (e) {}
      }
      window.removeEventListener('click',      _unlockAudio, true);
      window.removeEventListener('keydown',    _unlockAudio, true);
      window.removeEventListener('touchstart', _unlockAudio, true);
      window.removeEventListener('pointerdown',_unlockAudio, true);
    };
    window.addEventListener('click',      _unlockAudio, true);
    window.addEventListener('keydown',    _unlockAudio, true);
    window.addEventListener('touchstart', _unlockAudio, true);
    window.addEventListener('pointerdown',_unlockAudio, true);
  }

  if (window.InstancedRenderer && window.InstancedRenderer.createInstancedRenderer) {
    try {
      window._instancedRenderer = window.InstancedRenderer.createInstancedRenderer(scene);
      console.log('[Init] Instanced renderer created OK');
    } catch (e) { console.warn('[Init] Instanced renderer skipped:', e.message); }
  }

  if (window.GamePerformance && window.GamePerformance.EnhancedObjectPool) {
    try {
      window._projectilePool = new window.GamePerformance.EnhancedObjectPool(
        () => {
          const p = new Projectile();
          p._isPooled = true;
          return p;
        },
        (p) => {
          p.active = false;
          p.life = 0;
          p.vx = 0; p.vz = 0;
          p.mesh.visible = false;
          p.mesh.position.set(0, -9999, 0);
          p.mesh.scale.set(1, 1, 1);
          p.mesh.material.opacity = 0.95;
          if (p.glow) {
            p.glow.visible = false;
            p.glow.position.set(0, -9999, 0);
            p.glow.material.opacity = 0;
          }
        },
        60
      );
      console.log('[Init] Projectile pool created OK');
    } catch (e) { console.warn('[Init] Projectile pool skipped:', e.message); }
  }

  if (window.GamePerformance && window.GamePerformance.EnhancedObjectPool) {
    try {
      window._swordSlashPool = new window.GamePerformance.EnhancedObjectPool(
        () => ({
          mesh: null,
          life: 0,
          maxLife: 12,
          _isPooled: true,
          init() {
            if (!this.mesh) {
              const geometry = new THREE.RingGeometry(1.8, 2.2, 12, 1, -Math.PI/4, Math.PI/2);
              const material = new THREE.MeshBasicMaterial({ color: 0xCCDDFF, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
              this.mesh = new THREE.Mesh(geometry, material);
              this.mesh.rotation.x = -Math.PI / 2;
            }
            return this;
          },
          reinit(x, z, angle) {
            if (!this.mesh) this.init();
            this.mesh.rotation.z = angle - Math.PI/4;
            this.mesh.position.set(x, 0.6, z);
            this.mesh.visible = true;
            this.mesh.scale.set(1, 1, 1);
            this.mesh.material.opacity = 0.9;
            scene.add(this.mesh);
            this.life = 12;
            const dmg = weapons.sword.damage * playerStats.strength * playerStats.damage;
            enemies.forEach(e => {
              const dx = e.mesh.position.x - x;
              const dz = e.mesh.position.z - z;
              const dist = Math.sqrt(dx*dx + dz*dz);
              if (dist < 3.5) {
                const eAngle = Math.atan2(dz, dx);
                let diff = eAngle - angle;
                while (diff < -Math.PI) diff += Math.PI*2;
                while (diff > Math.PI) diff -= Math.PI*2;
                if (Math.abs(diff) < Math.PI/3) e.takeDamage(dmg, false, 'sword');
              }
            });
            return this;
          },
          update() {
            this.life--;
            const progress = 1 - (this.life / this.maxLife);
            this.mesh.material.opacity = 0.9 * Math.pow(this.life / this.maxLife, 1.5);
            this.mesh.scale.set(1 + progress * 0.15, 1 + progress * 0.15, 1);
            if (this.life <= 0) {
              this.mesh.visible = false;
              scene.remove(this.mesh);
              return false;
            }
            return true;
          }
        }),
        (s) => {
          if (s.mesh) {
            s.mesh.visible = false;
            s.mesh.position.set(0, -9999, 0);
          }
          s.life = 0;
        },
        15
      );
      console.log('[Init] SwordSlash pool created OK');
    } catch (e) { console.warn('[Init] SwordSlash pool skipped:', e.message); }
  }

  if (window.GamePerformance && window.GamePerformance.EnhancedObjectPool) {
    try {
      window._iceSpearPool = new window.GamePerformance.EnhancedObjectPool(
        () => ({
          mesh: null, active: false, life: 0, speed: 0, vx: 0, vy: 0, vz: 0,
          hitRadius: 0.3, particleTimer: 0, _isPooled: true,
          init() {
            if (!this.mesh) {
              const geometry = new THREE.ConeGeometry(0.12, 0.7, 4);
              const material = new THREE.MeshPhongMaterial({
                color: 0xAEEEFF, emissive: 0x005577, emissiveIntensity: 0.8,
                shininess: 100, transparent: true, opacity: 0.95
              });
              this.mesh = new THREE.Mesh(geometry, material);
              this.mesh.scale.set(1, 3, 1);
              this.mesh.castShadow = false;
              this.mesh.receiveShadow = false;
            }
            return this;
          },
          reinit(x, z, target) {
            if (!this.mesh) this.init();
            this.mesh.position.set(x, 0.5, z);
            this.mesh.visible = true;
            scene.add(this.mesh);
            this.speed = 0.42 * (window._projSpeedMultiplier || 1.0);
            this.active = true;
            this.life = 70;
            this.particleTimer = 0;
            const dx = target.x - x, dz = target.z - z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            this.vx = (dx / dist) * this.speed;
            this.vy = 0;
            this.vz = (dz / dist) * this.speed;
            this.mesh.rotation.z = -Math.atan2(dz, dx) + Math.PI/2;
            this.mesh.rotation.x = Math.PI/2;
            spawnParticles(this.mesh.position, 0xCCEEFF, 4);
            spawnParticles(this.mesh.position, 0xFFFFFF, 2);
            return this;
          },
          update() { return true; },
          destroy() {
            this.active = false;
            this.mesh.visible = false;
            scene.remove(this.mesh);
          }
        }),
        (ice) => {
          ice.active = false;
          if (ice.mesh) {
            ice.mesh.visible = false;
            ice.mesh.position.set(0, -9999, 0);
          }
          ice.life = 0;
          ice.vx = ice.vy = ice.vz = 0;
        },
        20
      );
      console.log('[Init] IceSpear pool created OK');
    } catch (e) { console.warn('[Init] IceSpear pool skipped:', e.message); }
  }

  if (window.GamePerformance && window.GamePerformance.EnhancedObjectPool) {
    try {
      window._meteorPool = new window.GamePerformance.EnhancedObjectPool(
        () => ({
          mesh: null, shadow: null, target: null, speed: 0, active: false, _isPooled: true,
          init() {
            if (!this.mesh) {
              const geo = new THREE.DodecahedronGeometry(1.5);
              const mat = new THREE.MeshToonMaterial({ color: 0xFF4500, emissive: 0x8B0000 });
              this.mesh = new THREE.Mesh(geo, mat);
            }
            if (!this.shadow) {
              const shadowGeo = new THREE.CircleGeometry(2.5, 16);
              const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.3, transparent: true });
              this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
              this.shadow.rotation.x = -Math.PI/2;
            }
            return this;
          },
          reinit(targetX, targetZ) {
            if (!this.mesh) this.init();
            this.target = new THREE.Vector3(targetX, 0, targetZ);
            this.mesh.position.set(targetX, 20, targetZ);
            this.mesh.visible = true;
            scene.add(this.mesh);
            this.shadow.position.set(targetX, 0.1, targetZ);
            this.shadow.visible = true;
            scene.add(this.shadow);
            this.speed = 0.5;
            this.active = true;
            return this;
          },
          update() {
            if (!this.active) return false;
            this.mesh.position.y -= this.speed;
            this.speed += 0.05;
            if (this.mesh.position.y <= 0) {
              this.explode();
              return false;
            }
            return true;
          },
          explode() {
            this.active = false;
            this.mesh.visible = false;
            this.shadow.visible = false;
            scene.remove(this.mesh);
            scene.remove(this.shadow);
            const range = weapons.meteor.area;
            const dmg = weapons.meteor.damage * playerStats.strength;
            enemies.forEach(e => {
              if (e.isDead || !e.mesh) return;
              const d = e.mesh.position.distanceTo(this.target);
              if (d < range) {
                e.takeDamage(dmg, false, 'fire');
                const knockbackDir = new THREE.Vector3(
                  e.mesh.position.x - this.target.x, 0, e.mesh.position.z - this.target.z
                ).normalize();
                const knockbackStrength = (1 - d / range) * GAME_CONFIG.meteorKnockbackMultiplier;
                e.mesh.position.x += knockbackDir.x * knockbackStrength;
                e.mesh.position.z += knockbackDir.z * knockbackStrength;
                const originalY = e.mesh.position.y;
                e.mesh.position.y = originalY + 0.5 * (1 - d / range);
                setTimeout(() => { e.mesh.position.y = originalY; }, 200);
              }
            });
            spawnParticles(this.target, 0xFF4500, 8);
            spawnParticles(this.target, 0xFFFF00, 4);
            spawnParticles(this.target, 0xFF8C00, 6);
            if (typeof spawnMuzzleSmoke === 'function') spawnMuzzleSmoke(this.target, 10);
            if (typeof playSound === 'function') playSound('meteor');
          }
        }),
        (m) => {
          m.active = false;
          if (m.mesh) {
            m.mesh.visible = false;
            m.mesh.position.set(0, -9999, 0);
          }
          if (m.shadow) {
            m.shadow.visible = false;
            m.shadow.position.set(0, -9999, 0);
          }
          m.speed = 0;
        },
        10
      );
      console.log('[Init] Meteor pool created OK');
    } catch (e) { console.warn('[Init] Meteor pool skipped:', e.message); }
  }

  if (window.PerfManager && window.PerfManager.GCGuard) {
    window.PerfManager.GCGuard.init();
  }
  if (window.DopamineSystem && window.DopamineSystem.CameraFX) {
    window.DopamineSystem.CameraFX.init(camera);
  }
  if (window.AdvancedPhysics && window.AdvancedPhysics.ProjectileLightPool) {
    try {
      window._projectileLightPool = new window.AdvancedPhysics.ProjectileLightPool(scene, 8);
      console.log('[Init] Projectile light pool created OK');
    } catch (e) { console.warn('[Init] Projectile lights skipped:', e.message); }
  }
  if (window.AdvancedPhysics && window.AdvancedPhysics.DynamicShadows) {
    try {
      window.AdvancedPhysics.DynamicShadows.init(scene);
    } catch (e) { console.warn('[Init] Dynamic shadows skipped:', e.message); }
  }
  console.log('[Init] New performance & visual systems initialised OK');
  
  animationFrameId = requestAnimationFrame(animate);
  
  console.log('[Init] All setup complete, setting gameModuleReady');
  window.gameModuleReady = true;
  console.log('[Init] Game module ready - Three.js loaded, event listeners attached');

  setTimeout(() => {
    if (window.CampWorld && renderer) {
      window.CampWorld.warmUp(renderer);
    }
    if (window.UICalibration) window.UICalibration.applyLayout();
    (function initHudTopDrag() {
      const hudTop = document.querySelector('.hud-top');
      if (!hudTop) return;
      const STORAGE_KEY = 'wd_hudtop_pos';
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
          const maxL = Math.max(0, window.innerWidth  - hudTop.offsetWidth);
          const maxT = Math.max(0, window.innerHeight - hudTop.offsetHeight);
          hudTop.style.left = Math.min(maxL, Math.max(0, saved.left)) + 'px';
          hudTop.style.top  = Math.min(maxT, Math.max(0, saved.top))  + 'px';
        }
      } catch(e) {}
      let dragStartX, dragStartY, origLeft, origTop;
      let isDragging = false;
      function getPointer(e) {
        return e.touches ? e.touches[0] : e;
      }
      function onDown(e) {
        if (e.target.closest('button,a,input,select')) return;
        e.preventDefault();
        isDragging = false;
        const p = getPointer(e);
        dragStartX = p.clientX;
        dragStartY = p.clientY;
        const rect = hudTop.getBoundingClientRect();
        origLeft = rect.left;
        origTop  = rect.top;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup',   onUp);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend',  onUp);
      }
      function onMove(e) {
        e.preventDefault();
        const p = getPointer(e);
        const dx = p.clientX - dragStartX;
        const dy = p.clientY - dragStartY;
        if (!isDragging && (Math.abs(dx) + Math.abs(dy)) > 4) isDragging = true;
        if (!isDragging) return;
        const maxL = Math.max(0, window.innerWidth  - hudTop.offsetWidth);
        const maxT = Math.max(0, window.innerHeight - hudTop.offsetHeight);
        hudTop.style.left = Math.min(maxL, Math.max(0, origLeft + dx)) + 'px';
        hudTop.style.top  = Math.min(maxT, Math.max(0, origTop  + dy)) + 'px';
        hudTop.style.right     = '';
        hudTop.style.bottom    = '';
        hudTop.style.transform = '';
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup',   onUp);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend',  onUp);
        if (isDragging) {
          const rect = hudTop.getBoundingClientRect();
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch(e) {}
          isDragging = false;
        }
      }
      hudTop.addEventListener('mousedown',  onDown);
      hudTop.addEventListener('touchstart', onDown, { passive: false });
    })();
  }, 2000);
  
  let pauseWatchdogStart = 0;
  setInterval(() => {
    if (isPaused && isGameActive && !isGameOver) {
      const now = Date.now();
      if (pauseWatchdogStart === 0) pauseWatchdogStart = now;
      const pausedMs = now - pauseWatchdogStart;

      const hasVisibleOverlay =
        document.getElementById('levelup-modal')?.style.display === 'flex' ||
        document.getElementById('settings-modal')?.style.display === 'flex' ||
        document.getElementById('options-menu')?.style.display === 'flex' ||
        document.getElementById('stats-modal')?.style.display === 'flex' ||
        document.getElementById('gear-screen')?.style.display === 'flex' ||
        document.getElementById('achievements-screen')?.style.display === 'flex' ||
        document.getElementById('credits-screen')?.style.display === 'flex' ||
        document.getElementById('attributes-screen')?.style.display === 'flex' ||
        document.getElementById('progression-shop')?.style.display === 'flex' ||
        document.getElementById('camp-screen')?.style.display === 'flex' ||
        document.querySelector('[data-quest-hall-overlay]') !== null ||
        document.getElementById('quest-popup-overlay') !== null ||
        document.getElementById('comic-info-overlay') !== null ||
        document.getElementById('comic-tutorial-modal')?.style.display === 'flex' ||
        document.getElementById('story-quest-modal')?.style.display === 'flex' ||
        windmillQuest.dialogueOpen ||
        (window.UICalibration && window.UICalibration.isActive);

      const PAUSE_WATCHDOG_TIMEOUT_MS = 10000;
      const shouldForce = pausedMs > PAUSE_WATCHDOG_TIMEOUT_MS;
      if (!hasVisibleOverlay && (!levelUpPending || shouldForce)) {
        pauseOverlayCount = 0;
        window.pauseOverlayCount = 0;
        isPaused = false;
        window.isPaused = false;
        if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
        if (shouldForce) {
          levelUpPending = false;
          console.warn(`[PauseWatchdog] Force-unpaused after ${pausedMs}ms - clearing stuck pause state`);
        }
        pauseWatchdogStart = 0;
      }
    } else {
      pauseWatchdogStart = 0;
    }
  }, 2000);
}

// ── setupMenus ────────────────────────────────────────────────────────────────
// Wire up main-menu button handlers. Called once from init().
// START GAME routes to the camp screen (the Engine 2.0 entry point).
// CAMP button also opens the camp screen.
// Also wires up the gameover-screen buttons for index.html:
//   goto-camp-btn    → show 3D camp
//   quit-to-menu-btn → show 3D camp (Engine 2.0: camp IS the menu)
//   restart-btn      → redirect to sandbox.html for a new run
function setupMenus() {
  var startBtn = document.getElementById('start-game-btn');
  var campBtn  = document.getElementById('camp-btn');

  function _showCamp() {
    var mainMenu = document.getElementById('main-menu');
    if (mainMenu) mainMenu.style.display = 'none';
    var campScreen = document.getElementById('camp-screen');
    if (campScreen) {
      campScreen.classList.remove('camp-subsection-active');
      campScreen.style.display = 'flex';
    }
    if (typeof updateCampScreen === 'function') {
      try { updateCampScreen(); } catch (e) { console.error('[setupMenus] Camp update error:', e); }
    }
  }

  if (startBtn && !startBtn._menuSetup) {
    startBtn._menuSetup = true;
    startBtn.addEventListener('click', _showCamp);
  }

  if (campBtn && !campBtn._menuSetup) {
    campBtn._menuSetup = true;
    campBtn.addEventListener('click', _showCamp);
  }

  // ── Gameover-screen buttons (Engine 2.0 flow) ──
  var gotoCampBtn   = document.getElementById('goto-camp-btn');
  var quitMenuBtn   = document.getElementById('quit-to-menu-btn');
  var restartBtn    = document.getElementById('restart-btn');

  if (gotoCampBtn && !gotoCampBtn._menuSetup) {
    gotoCampBtn._menuSetup = true;
    gotoCampBtn.addEventListener('click', function() {
      var gameoverScreen = document.getElementById('gameover-screen');
      if (gameoverScreen) gameoverScreen.style.display = 'none';
      window._campFromRun = true; // Flag used by quest-system.js to delay the account level-up curtain by 3s on return from a run
      _showCamp();
    });
  }

  // In Engine 2.0, "Quit to Menu" also returns to camp (camp is the hub/menu)
  if (quitMenuBtn && !quitMenuBtn._menuSetup) {
    quitMenuBtn._menuSetup = true;
    quitMenuBtn.addEventListener('click', function() {
      var gameoverScreen = document.getElementById('gameover-screen');
      if (gameoverScreen) gameoverScreen.style.display = 'none';
      _showCamp();
    });
  }

  // "Start Run" — returns to the 3D camp so the player can use the Teleport Portal
  // (campBoard building) to launch sandbox.html. Sandbox 2.0 is only reachable via camp.
  if (restartBtn && !restartBtn._menuSetup) {
    restartBtn._menuSetup = true;
    restartBtn.addEventListener('click', function() {
      var gameoverScreen = document.getElementById('gameover-screen');
      if (gameoverScreen) gameoverScreen.style.display = 'none';
      window._campFromRun = true;
      _showCamp();
    });
  }
}

// ── showLoadScreen / showCamp ─────────────────────────────────────────────────
// Convenience helpers used by the DOMContentLoaded startup flow.
function showLoadScreen(onComplete) {
  var ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'flex';
  if (typeof onComplete === 'function') {
    // Delegate to the existing loading.js timing; call onComplete when loading finishes.
    var _orig = window.loadingComplete;
    var _check = setInterval(function () {
      if (window.loadingComplete) {
        clearInterval(_check);
        onComplete();
      }
    }, 100);
  }
}

function showCamp() {
  var ls = document.getElementById('loading-screen');
  if (ls) { ls.classList.add('fade-out'); setTimeout(function () { ls.style.display = 'none'; }, 500); }
  var mainMenu = document.getElementById('main-menu');
  if (mainMenu) mainMenu.style.display = 'none';
  var campScreen = document.getElementById('camp-screen');
  if (campScreen) {
    campScreen.classList.remove('camp-subsection-active');
    campScreen.style.display = 'flex';
  }
  if (typeof updateCampScreen === 'function') {
    try { updateCampScreen(); } catch (e) { console.error('[showCamp] error:', e); }
  }
}

function showMainMenu() {
  document.getElementById('main-menu').style.display = 'flex';
  updateGoldDisplays();
  setGameActive(false);
  setGamePaused(true);
  if (window.GameRageCombat) window.GameRageCombat.setCombatHUDVisible(false);
}

function hideMainMenu() {
  document.getElementById('main-menu').style.display = 'none';
}

function startGame() {
  if (window.CampWorld) window.CampWorld.exit();
  const campScreenEl = document.getElementById('camp-screen');
  if (campScreenEl) campScreenEl.classList.remove('camp-3d-mode');
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('camp-screen').style.display = 'none';
  document.getElementById('gameover-screen').style.display = 'none';
  const uiLayer = document.getElementById('ui-layer');
  if (uiLayer) uiLayer.style.visibility = '';
  const gameContainer = document.getElementById('game-container');
  if (gameContainer) gameContainer.style.display = 'block';
  resetGame();
  updateQuestTracker();

  if (window.DialogueSystem && !saveData.firstRunBennyShown) {
    saveData.firstRunBennyShown = true;
    if (typeof saveSaveData === 'function') saveSaveData();
    window.DialogueSystem.show(window.DialogueSystem.DIALOGUES.firstRunWelcome);
  }
  
  const isVeryFirstRun = !saveData.firstRunTutorial || !saveData.firstRunTutorial.gameLoopShown;
  if (isVeryFirstRun) {
    if (!saveData.firstRunTutorial) saveData.firstRunTutorial = {};
    saveData.firstRunTutorial.gameLoopShown = true;
    saveSaveData();
    showComicInfoBox(
      '💧 WELCOME TO WATER DROP SURVIVOR',
      '<div style="text-align:left;line-height:1.9;font-size:15px;padding:4px 0">' +
      '<div style="font-size:17px;text-align:center;color:#5DADE2;margin-bottom:12px;"><b>YOUR FIRST RUN</b></div>' +
      '<p style="margin-bottom:10px;">This first run is to <b>get the feel of the character</b>.</p>' +
      '<p style="margin-bottom:10px;">⚠️ <b>You will die</b> — but don\'t worry!</p>' +
      '<p style="margin-bottom:10px;">This game has <b>deep RPG progression</b>. Every time you die, you return to <b>Camp</b> to permanently upgrade your character.</p>' +
      '<div style="background:rgba(255,215,0,0.1);border:2px solid rgba(255,215,0,0.4);border-radius:8px;padding:10px;margin-top:8px;font-size:14px;">' +
      '🎯 <b>Play until you die, and we\'ll start upgrading!</b>' +
      '</div>' +
      '</div>',
      'LET\'S GO! →',
      () => {
        showComicInfoBox(
          '💥 THIS WORLD CAN BE DESTROYED!',
          '<div style="text-align:left;line-height:1.8;font-size:15px;padding:4px 0">' +
          '<div style="margin-bottom:10px;font-size:17px;text-align:center;color:#FF4500"><b>Everything in this world can be destroyed!</b></div>' +
          '<div style="margin:6px 0">🚶 <b>Walk through</b> small objects (fences, crates, bushes) to smash them</div>' +
          '<div style="margin:6px 0">⚡ <b>DASH</b> into anything — trees, houses, structures — to smash them to pieces</div>' +
          '<div style="margin:6px 0">🔫 <b>Shoot</b> objects to destroy them from a distance</div>' +
          '<div style="margin-top:12px;font-size:13px;color:#666;text-align:center">Tip: Big objects block your path — only DASH breaks them!</div>' +
          '</div>',
          'START! →',
          () => { startCountdown(); }
        );
      }
    );
  } else {
    const isFirstRun = !saveData.shownDestructiblesInfo;
    if (isFirstRun) {
      saveData.shownDestructiblesInfo = true;
      saveSaveData();
      showComicInfoBox(
        '💥 THIS WORLD CAN BE DESTROYED!',
        '<div style="text-align:left;line-height:1.8;font-size:15px;padding:4px 0">' +
        '<div style="margin-bottom:10px;font-size:17px;text-align:center;color:#FF4500"><b>Everything in this world can be destroyed!</b></div>' +
        '<div style="margin:6px 0">🚶 <b>Walk through</b> small objects (fences, crates, bushes) to smash them</div>' +
        '<div style="margin:6px 0">⚡ <b>DASH</b> into anything — trees, houses, structures — to smash them to pieces</div>' +
        '<div style="margin:6px 0">🔫 <b>Shoot</b> objects to destroy them from a distance</div>' +
        '<div style="margin:6px 0">🏊 <b>Swim</b> in the lake — there\'s a legendary treasure hidden underwater!</div>' +
        '<div style="margin-top:12px;font-size:13px;color:#666;text-align:center">Tip: Big objects block your path — only DASH breaks them!</div>' +
        '</div>',
        'LET\'S GO! →',
        () => { startCountdown(); }
      );
    } else {
      // ── BUG FIX: Only show quest reminder if NOT in sandbox mode
      // and getCurrentQuest is available from quest-system.js
      // This prevents old-map quests appearing in sandbox 2.0
      const currentQuest = (typeof getCurrentQuest === 'function' && !window._engine2SandboxMode)
        ? getCurrentQuest()
        : null;
      const lastShownQuest = saveData.tutorialQuests && saveData.tutorialQuests.lastShownQuestReminder;
      if (currentQuest && currentQuest.id !== lastShownQuest && saveData.tutorialQuests && saveData.tutorialQuests.firstDeathShown) {
        saveData.tutorialQuests.lastShownQuestReminder = currentQuest.id;
        saveSaveData();
        showComicInfoBox(
          '📜 ACTIVE QUEST',
          `<div style="text-align:left;line-height:1.8;font-size:15px;padding:4px 0">
            <div style="font-size:18px;color:#FFD700;margin-bottom:10px;"><b>${currentQuest.name}</b></div>
            <div style="margin-bottom:8px;">${currentQuest.description}</div>
            <div style="color:#aaa;font-size:13px;"><b>Objective:</b> ${currentQuest.objectives}</div>
            ${currentQuest.claim ? `<div style="color:#aaa;font-size:13px;margin-top:4px;"><b>Claim at:</b> ${currentQuest.claim}</div>` : ''}
          </div>`,
          'GOT IT! →',
          () => { startCountdown(); }
        );
      } else {
        startCountdown();
      }
    }
  }
}
window.startGame = startGame;

function playRoundStartCinematic(callback) {
  _roundStartCinematicActive = true;
  const origLeft = camera.left;
  const origRight = camera.right;
  const origTop = camera.top;
  const origBottom = camera.bottom;
  const origPosY = camera.position.y;

  const origFogNear = scene.fog ? scene.fog.near : null;
  const origFogFar  = scene.fog ? scene.fog.far  : null;
  if (scene.fog) { scene.fog.near = 500; scene.fog.far = 2000; }

  camera.left   = origLeft   * 8;
  camera.right  = origRight  * 8;
  camera.top    = origTop    * 8;
  camera.bottom = origBottom * 8;
  camera.position.y = origPosY + 60;
  camera.updateProjectionMatrix();

  const regions = [
    { label: '⚙️ Windmill',       wx: 20,  wy: 0, wz: 20  },
    { label: '⛰️ Montana',        wx: 0,   wy: 0, wz: -36 },
    { label: '⚡ Eiffel Tower',    wx: -32, wy: 0, wz: 35  },
    { label: '🗿 Stonehenge',      wx: 32,  wy: 0, wz: 28  },
    { label: '🔺 Pyramid',         wx: 32,  wy: 0, wz: -28 },
    { label: '🏠 Spawn',           wx: 0,   wy: 0, wz: 0   }
  ];

  const overlay = document.createElement('div');
  overlay.id = 'cinematic-region-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:500;';
  document.body.appendChild(overlay);

  const labelEls = [];
  const vec = new THREE.Vector3();
  regions.forEach(r => {
    vec.set(r.wx, r.wy, r.wz);
    vec.project(camera);
    const sx = (vec.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-vec.y * 0.5 + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.textContent = r.label;
    el.style.cssText =
      'position:absolute;color:#fff;font-weight:bold;font-size:16px;' +
      'text-shadow:0 0 6px rgba(0,0,0,0.9),0 2px 4px rgba(0,0,0,0.7);' +
      'pointer-events:none;transform:translate(-50%,-50%);' +
      'opacity:0;transition:opacity 0.4s ease;';
    el.style.left = sx + 'px';
    el.style.top = sy + 'px';
    overlay.appendChild(el);
    labelEls.push(el);
  });

  requestAnimationFrame(() => {
    labelEls.forEach(el => { el.style.opacity = '1'; });
  });

  setTimeout(() => {
    labelEls.forEach(el => { el.style.opacity = '0'; });

    const zoomStart = performance.now();
    const zoomDuration = 1500;
    const startLeft = camera.left;
    const startRight = camera.right;
    const startTop = camera.top;
    const startBottom = camera.bottom;
    const startPosY = camera.position.y;

    function animateZoom() {
      const elapsed = performance.now() - zoomStart;
      const t = Math.min(elapsed / zoomDuration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      camera.left = startLeft + (origLeft - startLeft) * ease;
      camera.right = startRight + (origRight - startRight) * ease;
      camera.top = startTop + (origTop - startTop) * ease;
      camera.bottom = startBottom + (origBottom - startBottom) * ease;
      camera.position.y = startPosY + (origPosY - startPosY) * ease;
      camera.updateProjectionMatrix();

      if (scene.fog && origFogNear !== null) {
        scene.fog.near = 500 + (origFogNear - 500) * ease;
        scene.fog.far  = 2000 + (origFogFar  - 2000) * ease;
      }

      if (t < 1) {
        requestAnimationFrame(animateZoom);
      } else {
        camera.left = origLeft;
        camera.right = origRight;
        camera.top = origTop;
        camera.bottom = origBottom;
        camera.position.y = origPosY;
        camera.updateProjectionMatrix();

        if (scene.fog && origFogNear !== null) {
          scene.fog.near = origFogNear;
          scene.fog.far  = origFogFar;
        }

        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        _roundStartCinematicActive = false;
        callback();
      }
    }
    requestAnimationFrame(animateZoom);
  }, 2500);
}

function startCountdown() {
  playRoundStartCinematic(() => {
    countdownActive = true;
    countdownStep = 0;
    countdownTimer = 0;
    if (window.SpawnSequence && player) window.SpawnSequence.play(player.mesh);
    showCountdownMessage(0);
  });
}

function showCountdownMessage(step) {
  if (step >= countdownMessages.length) {
    endCountdown();
    return;
  }
  showStatChange(countdownMessages[step]);
  if (typeof _ssbShowCountdown === 'function') {
    _ssbShowCountdown(countdownMessages[step], step);
  }
  const duration = step === 0 ? 1500 : 1000;
  setTimeout(() => {
    countdownStep++;
    if (countdownStep < countdownMessages.length) {
      showCountdownMessage(countdownStep);
    } else {
      endCountdown();
    }
  }, duration);
}

function endCountdown() {
  countdownActive = false;
  setGamePaused(false);
  setGameActive(true);
  gameStartTime = Date.now();
  console.log('[Countdown] Game started - isPaused:', isPaused, 'isGameActive:', isGameActive);

  // FIX 1B: Engine 2.0 Sandbox mode double-init protection
  // In sandbox mode, Engine2Sandbox is already created by sandbox-loop.js at boot.
  // Skip this block entirely when in sandbox to prevent double ground mesh.
  // The main game (index.html) never enters sandbox mode, so wave spawning works normally.
  if (window._engine2SandboxMode === true && window._engine2Instance) {
    // Already initialized by sandbox-loop.js — skip
    console.log('[Engine2] Sandbox mode already active, skipping duplicate init');
  } else if (window._engine2SandboxMode === true && window.Engine2Sandbox && !window._engine2Instance) {
    window._engine2Instance = new window.Engine2Sandbox(scene, camera);
    window._engine2Instance.init();
    console.log('[Engine2] Engine 2.0 Sandbox mode activated');
  }

  if (window.NeuralMatrix) window.NeuralMatrix.applyToRun(playerStats);

  if (window.AdvancedClicker && typeof saveData !== 'undefined') {
    const _clickBonuses = window.AdvancedClicker.getMainGameBonuses(saveData);
    if (_clickBonuses.goldPct > 0) {
      window._idleClickerGoldBonus = _clickBonuses.goldPct / 100;
    }
    if (_clickBonuses.atkBonus > 0 && playerStats) {
      playerStats.damage = (playerStats.damage || 1) * (1 + _clickBonuses.atkBonus * 0.05);
    }
  }

  window._eventHorizonHoles = [];
  window._activeBloodPools = 0;

  if (window.GameRageCombat) window.GameRageCombat.setCombatHUDVisible(true);

  const chatTab = document.getElementById('ai-chat-tab');
  if (chatTab) chatTab.classList.remove('camp-mode');

  const runs = saveData.totalRuns || 0;
  if (runs === 0 || runs % 5 === 0) {
    setTimeout(() => {
      showChatReminderBubble('Need auto-aim? Ask me here! 💬', false);
    }, 4000);
  }
}

function showBuildingDetail(title, description) {
  let popup = document.getElementById('building-detail-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'building-detail-popup';
    popup.className = 'camp-menu-box';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:320px;width:90%;z-index:200;text-align:center;';
    document.body.appendChild(popup);
    popup.addEventListener('click', () => { popup.style.display = 'none'; });
  }
  popup.innerHTML = `
    <div style="font-size:20px;color:#FFD700;font-weight:bold;margin-bottom:10px;">${title}</div>
    <div style="font-size:14px;color:#c9d1d9;line-height:1.6;">${description}</div>
    <div style="font-size:11px;color:#888;margin-top:12px;">Tap to close</div>
  `;
  popup.style.display = 'block';
}

function addLongPressDetail(element, title, description) {
  let holdTimer = null;
  const HOLD_DURATION = 500;
  const startHold = () => {
    if (holdTimer) return;
    holdTimer = setTimeout(() => { holdTimer = null; showBuildingDetail(title, description); }, HOLD_DURATION);
  };
  const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
  element.addEventListener('pointerdown', () => startHold());
  element.addEventListener('pointerup', cancelHold);
  element.addEventListener('pointerleave', cancelHold);
  element.addEventListener('pointercancel', cancelHold);
}

// ============================================================
// TRASH & RECYCLE
// ============================================================
function showRecycleScreen() {
  const existing = document.getElementById('recycle-overlay');
  if (existing) existing.remove();

  const RARITY_COLORS = { common:'#aaaaaa', uncommon:'#55cc55', rare:'#44aaff', epic:'#aa44ff', legendary:'#ffd700', mythic:'#ff4444' };
  const RARITY_METAL  = { common:1, uncommon:2, rare:3, epic:5, legendary:8, mythic:12 };
  const RARITY_LEATHER= { common:0, uncommon:0, rare:1, epic:2, legendary:3, mythic:5 };

  const overlay = document.createElement('div');
  overlay.id = 'recycle-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:600;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow-y:auto;padding:16px 6px 40px;box-sizing:border-box;';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  function _showRewardFloat(text, color, x, y) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;color:${color};font-family:Bangers,cursive;font-size:20px;font-weight:900;letter-spacing:2px;pointer-events:none;z-index:700;text-shadow:0 0 8px ${color};transition:opacity 1.2s,transform 1.2s;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-60px)';
    });
    setTimeout(() => el.remove(), 1300);
  }

  function _refreshRecycle() {
    const res = window.GameHarvesting ? window.GameHarvesting.getResources() : {};
    const r = res || {};
    const equippedIds = new Set(Object.values(saveData.equippedGear || {}));
    const recyclableItems = (saveData.inventory || []).filter(g => !equippedIds.has(g.id));

    overlay.innerHTML = `
      <div style="max-width:700px;width:100%;color:#fff;font-family:Bangers,cursive;">
        <div style="font-size:clamp(18px,4vw,28px);letter-spacing:3px;text-align:center;color:#FFD700;text-shadow:0 0 12px rgba(255,215,0,0.6);margin-bottom:4px;">♻️ TRASH &amp; RECYCLE</div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#aaa;text-align:center;margin-bottom:14px;">Drag gear cards into the grinder · Craft Leather from Skins · Cook Food</div>
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:1.05em;color:#90CAF9;margin-bottom:8px;letter-spacing:1px;">📦 INVENTORY (drag to grinder)</div>
            <div id="recycle-inv-grid" style="display:flex;flex-wrap:wrap;gap:8px;min-height:80px;border:1px dashed #334;border-radius:8px;padding:8px;">
              ${recyclableItems.length === 0
                ? '<div style="font-family:Arial,sans-serif;font-size:12px;color:#555;margin:auto;padding:12px;">No unequipped gear to recycle</div>'
                : recyclableItems.map(g => {
                    const rc = RARITY_COLORS[g.rarity] || '#aaa';
                    const icon = g.icon || (g.type === 'weapon' ? '⚔️' : g.type === 'helmet' ? '🪖' : g.type === 'armor' ? '🛡️' : g.type === 'boots' ? '👢' : '💍');
                    const statLine = g.stats ? Object.entries(g.stats).slice(0,2).map(([k,v]) => `${k}:${v}`).join(' ') : '';
                    return `<div class="recycle-item-card" draggable="true" data-item-id="${g.id}"
                      style="width:75px;background:rgba(20,20,40,0.9);border:2px solid ${rc};border-radius:8px;padding:6px 4px;cursor:grab;text-align:center;filter:drop-shadow(0 2px 6px ${rc}66);user-select:none;-webkit-user-select:none;">
                      <div style="font-size:22px;">${icon}</div>
                      <div style="font-family:Arial,sans-serif;font-size:9px;color:${rc};margin-top:3px;word-break:break-word;line-height:1.3;">${g.name || 'Gear'}</div>
                      <div style="font-family:Arial,sans-serif;font-size:9px;color:#888;margin-top:2px;">${g.rarity || 'common'}</div>
                      ${statLine ? `<div style="font-family:monospace;font-size:8px;color:#aaa;margin-top:2px;">${statLine}</div>` : ''}
                    </div>`;
                  }).join('')
              }
            </div>
          </div>
          <div style="flex:0 0 160px;display:flex;flex-direction:column;align-items:center;">
            <div style="font-size:1.05em;color:#F9A825;margin-bottom:8px;letter-spacing:1px;">⚙️ GRINDER</div>
            <div id="recycle-grinder-drop"
              style="width:140px;height:140px;border:3px dashed #F9A825;border-radius:12px;background:rgba(30,20,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:copy;position:relative;transition:border-color 0.2s,background 0.2s;filter:drop-shadow(0 0 8px #F9A82544);">
              <div style="font-size:42px;">⚙️</div>
              <div style="font-family:Arial,sans-serif;font-size:11px;color:#F9A825;margin-top:6px;text-align:center;">Drop gear here<br>to recycle</div>
            </div>
            <div style="font-family:Arial,sans-serif;font-size:10px;color:#888;margin-top:6px;text-align:center;">common=1🔩  uncommon=2🔩<br>rare=3🔩+1🟫  epic=5🔩+2🟫<br>legendary=8🔩+3🟫</div>
          </div>
        </div>
        <div id="recycle-craft-content"></div>
        <button id="recycle-close-btn" style="display:block;margin:14px auto 0;background:transparent;border:2px solid #888;color:#ccc;font-family:Bangers,cursive;font-size:1.1em;letter-spacing:2px;padding:8px 28px;border-radius:8px;cursor:pointer;">CLOSE</button>
      </div>`;

    document.getElementById('recycle-close-btn').onclick = () => overlay.remove();

    const canLeather = (r.animalSkin || 0) >= 2;
    const canFood    = (r.meat || 0) >= 1;
    const craftHTML = `
      <div style="background:rgba(30,30,50,0.9);border:2px solid ${canLeather?'#654321':'#333'};border-radius:10px;padding:12px;margin-bottom:8px;">
        <div style="font-size:1.1em;color:#F5CBA7;margin-bottom:5px;">🟫 Craft Leather</div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#bbb;margin-bottom:7px;">2 🐾 Animal Skin → 1 🟫 Leather &nbsp;|&nbsp; Have: <b style="color:${canLeather?'#2ecc71':'#e74c3c'}">${r.animalSkin||0}</b></div>
        <button onclick="window._craftLeather()" ${canLeather?'':'disabled'} style="background:${canLeather?'#3E2723':'#222'};border:2px solid ${canLeather?'#8D6E63':'#555'};color:${canLeather?'#fff':'#666'};font-family:Bangers,cursive;font-size:1em;letter-spacing:1px;padding:5px 16px;border-radius:7px;cursor:${canLeather?'pointer':'default'};">CRAFT LEATHER</button>
      </div>
      <div style="background:rgba(30,30,50,0.9);border:2px solid ${canFood?'#CC4400':'#333'};border-radius:10px;padding:12px;margin-bottom:8px;">
        <div style="font-size:1.1em;color:#FDEBD0;margin-bottom:5px;">🍲 Cook Food</div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#bbb;margin-bottom:7px;">1 🍖 Meat → 1 🍲 Food &nbsp;|&nbsp; Have: <b style="color:${canFood?'#2ecc71':'#e74c3c'}">${r.meat||0}</b></div>
        <button onclick="window._craftMeal()" ${canFood?'':'disabled'} style="background:${canFood?'#7B3F00':'#222'};border:2px solid ${canFood?'#CC7700':'#555'};color:${canFood?'#fff':'#666'};font-family:Bangers,cursive;font-size:1em;letter-spacing:1px;padding:5px 16px;border-radius:7px;cursor:${canFood?'pointer':'default'};">COOK MEAL</button>
      </div>`;
    const craftEl = document.getElementById('recycle-craft-content');
    if (craftEl) craftEl.innerHTML = craftHTML;

    const cards = overlay.querySelectorAll('.recycle-item-card');
    cards.forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', card.dataset.itemId);
        card.style.opacity = '0.45';
        card.style.cursor = 'grabbing';
      });
      card.addEventListener('dragend', () => {
        card.style.opacity = '1';
        card.style.cursor = 'grab';
      });
    });

    const grinder = document.getElementById('recycle-grinder-drop');
    if (grinder) {
      grinder.addEventListener('dragover', e => {
        e.preventDefault();
        grinder.style.borderColor = '#ffff00';
        grinder.style.background = 'rgba(60,40,0,0.95)';
      });
      grinder.addEventListener('dragleave', () => {
        grinder.style.borderColor = '#F9A825';
        grinder.style.background = 'rgba(30,20,0,0.85)';
      });
      grinder.addEventListener('drop', e => {
        e.preventDefault();
        grinder.style.borderColor = '#F9A825';
        grinder.style.background = 'rgba(30,20,0,0.85)';
        const itemId = e.dataTransfer.getData('text/plain');
        window.recycleItemById(itemId, e.clientX, e.clientY);
      });
    }
  }

  window.recycleItemById = function(itemId, mouseX, mouseY) {
    const inv = saveData.inventory || [];
    const idx = inv.findIndex(g => g.id === itemId);
    if (idx === -1) return;
    const item = inv[idx];
    const rarity = (item.rarity || 'common').toLowerCase();
    const metalAmt   = RARITY_METAL[rarity]   || 1;
    const leatherAmt = RARITY_LEATHER[rarity]  || 0;

    const grinder = document.getElementById('recycle-grinder-drop');
    if (grinder) {
      const gear = grinder.querySelector('div');
      if (gear) {
        gear.style.transition = 'transform 0.6s';
        gear.style.transform = 'rotate(360deg)';
        setTimeout(() => { gear.style.transition = ''; gear.style.transform = ''; }, 650);
      }
      grinder.style.borderColor = '#ffff00';
      setTimeout(() => { if (grinder) grinder.style.borderColor = '#F9A825'; }, 700);
    }

    saveData.inventory.splice(idx, 1);

    if (window.GameHarvesting) {
      window.GameHarvesting.recycleToMetal('item', metalAmt);
      if (leatherAmt > 0) {
        const res = window.GameHarvesting.getResources();
        if (res) {
          res.leather = (res.leather || 0) + leatherAmt;
        }
      }
    }
    saveSaveData();
    if (typeof playSound === 'function') playSound('collect');

    const mx = mouseX || window.innerWidth / 2;
    const my = mouseY || window.innerHeight / 2;
    _showRewardFloat('+' + metalAmt + ' 🔩 Metal' + (leatherAmt > 0 ? '  +' + leatherAmt + ' 🟫 Leather' : ''), RARITY_COLORS[rarity] || '#ffaa00', mx - 60, my - 40);

    setTimeout(() => _refreshRecycle(), 300);
  };

  window._recycleWeapon = () => {
    if (window.GameHarvesting) {
      window.GameHarvesting.recycleToMetal('weapon', 2);
      saveSaveData();
      _refreshRecycle();
      if (typeof playSound === 'function') playSound('collect');
    }
  };
  window._craftLeather = () => {
    if (window.GameHarvesting && window.GameHarvesting.craftLeather()) {
      saveSaveData();
      _refreshRecycle();
      if (typeof playSound === 'function') playSound('levelup');
    }
  };
  window._craftMeal = () => {
    if (window.GameHarvesting && window.GameHarvesting.craftMeal()) {
      saveSaveData();
      _refreshRecycle();
      if (typeof playSound === 'function') playSound('levelup');
    }
  };

  _refreshRecycle();
}

// ============================================================
// All remaining functions are unchanged from original
// (showCampfireKitchen, showWorkshop, showArmory, UIManager,
//  showQuestCompleteBanner, showWeaponsmith, showSpecialAttacksPanel,
//  showCampBoardMenu, showProgressionShop, buyUpgrade, etc.)
// are identical to the original file — only the 3 bugs above were fixed.
// ============================================================

// ── Annunaki Forge Overlay (Camp mode) ──────────────────────────────────
// Opened when player clicks the Forge building in the 3D camp hub.
// Contains two tabs:
//   1. Stat Upgrades  — permanent upgrades using PERMANENT_UPGRADES
//   2. Weapon Merging — combine 3 identical weapons of same rarity → next rarity
function _showProgressionShopOverlay() {
  const existing = document.getElementById('progression-shop-overlay');
  if (existing) existing.remove();

  if (window.CampWorld) window.CampWorld.pauseInput();

  // ── Rarity data ──────────────────────────────────────────────────────────
  const FORGE_RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const FORGE_RARITY_COLORS = {
    common: '#aaaaaa', uncommon: '#55cc55', rare: '#44aaff',
    epic: '#aa44ff', legendary: '#ffaa00', mythic: '#ff4444'
  };
  const FORGE_RARITY_NAMES = {
    common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
    epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic'
  };

  // ── Overlay shell ────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'progression-shop-overlay';
  overlay.className = 'camp-bld-overlay';
  overlay.style.zIndex = '500';

  const panel = document.createElement('div');
  panel.className = 'camp-bld-panel';
  panel.style.cssText = (panel.style.cssText || '') + 'max-width:600px;display:flex;flex-direction:column;padding:0;overflow:hidden;';

  // Header
  const header = document.createElement('div');
  header.className = 'camp-bld-header';
  header.innerHTML = '<span class="camp-bld-title">⚒️ ANNUNAKI FORGE</span>';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'camp-bld-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  closeBtn.onclick = () => {
    panel.classList.add('closing');
    setTimeout(() => { overlay.remove(); if (window.CampWorld) window.CampWorld.resumeInput(); }, 200);
  };
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Subtitle
  const sub = document.createElement('div');
  sub.className = 'camp-bld-subtitle';
  sub.textContent = 'Forge stat upgrades · Merge 3 identical weapons into a higher rarity';
  panel.appendChild(sub);

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;border-bottom:2px solid rgba(255,100,0,0.3);';
  const FORGE_TABS = [
    { id: 'upgrades', label: '⬆️ Stat Upgrades',  color: '#FFD700' },
    { id: 'merge',    label: '🔥 Weapon Merging', color: '#ff6600' }
  ];
  let _forgeTab = 'upgrades';
  const tabBody = document.createElement('div');
  tabBody.style.cssText = 'flex:1;overflow-y:auto;padding:16px;max-height:55vh;';

  function _renderForgeTab() {
    tabBody.innerHTML = '';
    FORGE_TABS.forEach(t => {
      const btn = tabBar.querySelector('[data-ftab="' + t.id + '"]');
      if (btn) {
        btn.style.borderBottom = t.id === _forgeTab ? '3px solid ' + t.color : '3px solid transparent';
        btn.style.color = t.id === _forgeTab ? t.color : '#666';
      }
    });
    if (_forgeTab === 'upgrades') _renderForgeUpgradesTab(tabBody);
    else _renderForgeMergeTab(tabBody);
  }

  FORGE_TABS.forEach(t => {
    const btn = document.createElement('button');
    btn.setAttribute('data-ftab', t.id);
    btn.style.cssText = 'flex:1;background:none;border:none;border-bottom:3px solid transparent;color:#666;font-family:\'Bangers\',cursive;font-size:15px;letter-spacing:1px;padding:10px 4px;cursor:pointer;transition:color 0.2s,border-color 0.2s;';
    btn.textContent = t.label;
    btn.onclick = () => { _forgeTab = t.id; _renderForgeTab(); };
    tabBar.appendChild(btn);
  });
  panel.appendChild(tabBar);
  panel.appendChild(tabBody);
  overlay.appendChild(panel);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeBtn.onclick(); });
  document.body.appendChild(overlay);
  _renderForgeTab();

  // ── Tab 1: Stat Upgrades ─────────────────────────────────────────────────
  function _renderForgeUpgradesTab(container) {
    if (typeof PERMANENT_UPGRADES === 'undefined') {
      container.innerHTML = '<div style="color:#888;text-align:center;padding:20px;">Upgrades not available in camp.</div>';
      return;
    }
    let html = '<div style="font-family:\'Bangers\',cursive;font-size:17px;color:#FFD700;letter-spacing:2px;margin-bottom:12px;">⬆️ PERMANENT STAT UPGRADES</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;">';
    Object.keys(PERMANENT_UPGRADES).forEach(key => {
      const up = PERMANENT_UPGRADES[key];
      const lvl = saveData.upgrades[key] || 0;
      const maxed = lvl >= up.maxLevel;
      const cost = getCost ? getCost(key) : 0;
      const canBuy = !maxed && saveData.gold >= cost;
      html += `<div style="background:rgba(255,215,0,0.06);border:1px solid ${maxed ? 'rgba(0,180,0,0.5)' : 'rgba(255,215,0,0.25)'};border-radius:6px;padding:10px;">
        <div style="font-family:'Bangers',cursive;font-size:14px;color:${maxed ? '#27ae60' : '#FFD700'};margin-bottom:3px;">${up.name}</div>
        <div style="font-size:10px;color:#888;margin-bottom:6px;">${up.description}</div>
        <div style="font-size:10px;color:#aaa;margin-bottom:6px;">Level: ${lvl} / ${up.maxLevel}</div>
        ${maxed ? '<div style="font-size:11px;color:#27ae60;font-weight:bold;">✅ MAX LEVEL</div>'
          : `<button class="forge-buy-btn" data-key="${key}" ${canBuy ? '' : 'disabled'} style="font-size:12px;padding:5px 10px;background:${canBuy ? 'linear-gradient(to bottom,#C9A227,#8B6914)' : 'rgba(60,50,0,0.5)'};color:${canBuy ? '#000' : '#555'};border:1px solid ${canBuy ? '#8B6914' : '#333'};border-radius:4px;cursor:${canBuy ? 'pointer' : 'not-allowed'};font-weight:bold;letter-spacing:1px;">BUY — ${cost} 💰</button>`
        }
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.forge-buy-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', function() {
        const key = this.getAttribute('data-key');
        if (typeof buyUpgrade === 'function') buyUpgrade(key);
        _renderForgeTab();
      });
    });
  }

  // ── Tab 2: Weapon Merging ─────────────────────────────────────────────────
  // Mechanic: select 3 identical weapons (same name + rarity) → merge into 1 of next rarity
  let _mergeSelection = []; // array of inventory indices

  function _getWeapons() {
    return (saveData.inventory || [])
      .map((item, idx) => ({ ...item, _idx: idx }))
      .filter(item => item && item.type === 'weapon');
  }

  function _renderForgeMergeTab(container) {
    _mergeSelection = _mergeSelection.filter(idx => {
      const item = (saveData.inventory || [])[idx];
      return item && item.type === 'weapon';
    });

    const weapons = _getWeapons();
    // Group by (name + rarity); key is kept in a Map so it never touches the DOM
    const groups = new Map(); // groupKey (string) → weapon[]
    weapons.forEach(w => {
      const key = (w.name || 'Weapon') + '|' + (w.rarity || 'common');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    });

    // ── Static header (safe constant strings only) ──────────────────────────
    container.innerHTML =
      '<div style="font-family:\'Bangers\',cursive;font-size:17px;color:#ff6600;letter-spacing:2px;margin-bottom:4px;">🔥 WEAPON MERGING</div>' +
      '<div style="font-size:11px;color:#888;margin-bottom:12px;">Select <b style="color:#ff6600;">3 identical weapons</b> of the same rarity to forge them into a higher rarity weapon. <span style="color:#555;">Weapons must share the same name.</span></div>';

    if (weapons.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#555;text-align:center;padding:20px;font-size:13px;';
      empty.textContent = 'No weapons in inventory. Equip or obtain weapons to merge them.';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.id = 'forge-weapon-list';

    groups.forEach((grp, groupKey) => {
      const sample = grp[0];
      const rarity = sample.rarity || 'common';
      const col = FORGE_RARITY_COLORS[rarity] || '#aaa';
      const rarityIdx = FORGE_RARITY_ORDER.indexOf(rarity);
      const canMerge = grp.length >= 3 && rarityIdx >= 0 && rarityIdx < FORGE_RARITY_ORDER.length - 1;
      const nextRarity = canMerge ? FORGE_RARITY_ORDER[rarityIdx + 1] : null;
      const nextCol = nextRarity ? FORGE_RARITY_COLORS[nextRarity] : '#aaa';

      // Outer card — safe styles only (col/nextCol are known hex values from FORGE_RARITY_COLORS)
      const card = document.createElement('div');
      card.style.cssText = `background:rgba(255,100,0,0.06);border:1px solid ${col}66;border-radius:6px;padding:12px;margin-bottom:10px;`;

      // Info row
      const infoRow = document.createElement('div');
      infoRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';

      const iconEl = document.createElement('div');
      iconEl.style.cssText = 'font-size:20px;';
      iconEl.textContent = '⚔️';
      infoRow.appendChild(iconEl);

      const textCol = document.createElement('div');
      textCol.style.cssText = 'flex:1;';

      const nameEl = document.createElement('div');
      nameEl.style.cssText = `font-family:'Bangers',cursive;font-size:15px;color:${col};letter-spacing:1px;`;
      nameEl.textContent = sample.name || 'Weapon'; // textContent prevents XSS
      textCol.appendChild(nameEl);

      const rarityCountEl = document.createElement('div');
      rarityCountEl.style.cssText = 'font-size:10px;color:#888;';
      rarityCountEl.textContent = `${FORGE_RARITY_NAMES[rarity] || rarity} · You have: `;
      const countBold = document.createElement('b');
      countBold.style.color = col;
      countBold.textContent = String(grp.length);
      rarityCountEl.appendChild(countBold);
      textCol.appendChild(rarityCountEl);

      if (sample.description) {
        const descEl = document.createElement('div');
        descEl.style.cssText = 'font-size:10px;color:#555;margin-top:2px;';
        descEl.textContent = sample.description; // textContent prevents XSS
        textCol.appendChild(descEl);
      }
      infoRow.appendChild(textCol);

      if (canMerge && nextRarity) {
        const mergeHint = document.createElement('div');
        mergeHint.style.cssText = 'text-align:right;font-size:10px;color:#aaa;';
        mergeHint.textContent = '3 → 1';
        const nextSpan = document.createElement('span');
        nextSpan.style.cssText = `color:${nextCol};font-family:'Bangers',cursive;font-size:12px;display:block;`;
        nextSpan.textContent = FORGE_RARITY_NAMES[nextRarity] || nextRarity;
        mergeHint.appendChild(nextSpan);
        infoRow.appendChild(mergeHint);
      }

      card.appendChild(infoRow);

      // Action row — merge button or status text
      if (canMerge && nextRarity) {
        const mergeBtn = document.createElement('button');
        mergeBtn.className = 'forge-merge-btn';
        mergeBtn.style.cssText = 'width:100%;font-size:13px;padding:8px;background:linear-gradient(135deg,#3a0000,#7a2200);color:#ff6600;border:1px solid #ff6600;border-radius:4px;cursor:pointer;font-family:\'Bangers\',cursive;letter-spacing:2px;transition:all 0.2s;';
        mergeBtn.textContent = `🔥 MERGE 3 INTO ${(FORGE_RARITY_NAMES[nextRarity] || nextRarity).toUpperCase()}`;
        // Store groupKey on the element via dataset (no HTML injection)
        mergeBtn.addEventListener('click', () => _executeWeaponMerge(groupKey, container));
        card.appendChild(mergeBtn);
      } else {
        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'font-size:10px;color:#444;text-align:center;';
        statusEl.textContent = grp.length < 3
          ? `Need ${3 - grp.length} more to merge`
          : 'Max rarity reached';
        card.appendChild(statusEl);
      }

      list.appendChild(card);
    });

    container.appendChild(list);
  }

  function _executeWeaponMerge(groupKey, container) {
    const inv = saveData.inventory || [];
    const [targetName, targetRarity] = groupKey.split('|');
    const rarityIdx = FORGE_RARITY_ORDER.indexOf(targetRarity);
    if (rarityIdx < 0 || rarityIdx >= FORGE_RARITY_ORDER.length - 1) return;

    // Find 3 matching weapons
    const matches = inv.map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item && item.type === 'weapon' && item.name === targetName && item.rarity === targetRarity);
    if (matches.length < 3) return;

    // Remove 3 from inventory
    const toRemove = [matches[0].idx, matches[1].idx, matches[2].idx].sort((a, b) => b - a);
    toRemove.forEach(idx => inv.splice(idx, 1));

    // Create merged weapon of next rarity
    const nextRarity = FORGE_RARITY_ORDER[rarityIdx + 1];
    const template = { ...matches[0].item };
    template.rarity = nextRarity;
    // Generate a unique id for the new item
    template.id = 'forge_' + targetName.toLowerCase().replace(/\s+/g, '_') + '_' + nextRarity + '_' + Date.now();
    // Boost stats by rarity multiplier
    const multiplier = { common: 1.0, uncommon: 1.3, rare: 1.6, epic: 2.0, legendary: 2.5, mythic: 3.2 }[nextRarity] || 1.3;
    if (template.stats) {
      for (const k in template.stats) {
        if (typeof template.stats[k] === 'number') {
          template.stats[k] = Math.round(template.stats[k] * multiplier);
        }
      }
    }
    inv.push(template);
    saveData.inventory = inv;

    // Grant Account XP for merging
    const xpReward = 20 * (rarityIdx + 1);
    if (window.GameAccount && typeof window.GameAccount.addXP === 'function') {
      window.GameAccount.addXP(xpReward, 'Forge Merge: ' + targetName, saveData);
    } else if (typeof addAccountXP === 'function') {
      addAccountXP(xpReward);
    }

    if (typeof saveSaveData === 'function') saveSaveData();

    // ── Merge Animation ──────────────────────────────────────────────────
    _playForgeMergeAnimation(FORGE_RARITY_COLORS[nextRarity] || '#ff6600', FORGE_RARITY_NAMES[nextRarity] || nextRarity, targetName, () => {
      _renderForgeTab();
    });
  }

  // ── Merge success animation ──────────────────────────────────────────────
  function _playForgeMergeAnimation(rarityColor, rarityName, weaponName, onDone) {
    const anim = document.createElement('div');
    anim.className = 'forge-merge-anim';
    anim.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none;overflow:hidden;';

    // Screen shake via CSS class
    document.body.classList.add('forge-screen-shake');
    setTimeout(() => document.body.classList.remove('forge-screen-shake'), 600);

    // Radial glow flash
    const flash = document.createElement('div');
    flash.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(circle at 50% 50%,${rarityColor}55 0%,transparent 70%);animation:forgeMergeFlash 0.8s ease-out forwards;`;
    anim.appendChild(flash);

    // Central reveal card — use DOM nodes for weapon name/rarity (XSS-safe)
    const card = document.createElement('div');
    card.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);background:linear-gradient(135deg,#0a0000,#1a0500);border:3px solid ${rarityColor};border-radius:12px;padding:24px 36px;text-align:center;animation:forgeMergeReveal 0.7s 0.3s cubic-bezier(0.175,0.885,0.32,1.5) forwards;box-shadow:0 0 40px ${rarityColor},0 0 80px ${rarityColor}55;`;

    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'font-size:42px;margin-bottom:8px;';
    iconEl.textContent = '⚔️';

    const weaponNameEl = document.createElement('div');
    weaponNameEl.style.cssText = `font-family:'Bangers',cursive;font-size:28px;color:${rarityColor};letter-spacing:3px;text-shadow:0 0 20px ${rarityColor};`;
    weaponNameEl.textContent = weaponName; // textContent prevents XSS

    const rarityEl = document.createElement('div');
    rarityEl.style.cssText = `font-family:'Bangers',cursive;font-size:18px;color:${rarityColor};letter-spacing:4px;margin-top:6px;opacity:0.9;`;
    rarityEl.textContent = `✨ ${rarityName.toUpperCase()} ✨`;

    const forgedByEl = document.createElement('div');
    forgedByEl.style.cssText = 'font-size:12px;color:#888;margin-top:8px;letter-spacing:1px;';
    forgedByEl.textContent = 'FORGED BY THE ANNUNAKI';

    card.appendChild(iconEl);
    card.appendChild(weaponNameEl);
    card.appendChild(rarityEl);
    card.appendChild(forgedByEl);
    anim.appendChild(card);

    // Sparks burst — precompute --spark-x / --spark-y in JS to avoid CSS trig functions
    // (cos()/sin() inside calc() have uneven support in older iOS Safari).
    for (let i = 0; i < 28; i++) {
      const spark = document.createElement('div');
      const angleRad = (i / 28) * Math.PI * 2;
      const dist = 80 + Math.random() * 180;
      const size = 3 + Math.random() * 5;
      const sparkX = Math.cos(angleRad) * dist;
      const sparkY = Math.sin(angleRad) * dist;
      spark.style.cssText = `position:absolute;top:50%;left:50%;width:${size}px;height:${size}px;background:${rarityColor};border-radius:50%;transform-origin:0 0;animation:forgeSpark 0.9s ${Math.random() * 0.3}s ease-out forwards;--spark-x:${sparkX.toFixed(1)}px;--spark-y:${sparkY.toFixed(1)}px;`;
      anim.appendChild(spark);
    }

    document.body.appendChild(anim);
    setTimeout(() => {
      anim.style.transition = 'opacity 0.4s';
      anim.style.opacity = '0';
      setTimeout(() => { anim.remove(); if (onDone) onDone(); }, 400);
    }, 1800);
  }
}

function showProgressionShop() {
  const _fromCamp = window.CampWorld && window.CampWorld.isActive;
  if (_fromCamp) {
    _showProgressionShopOverlay();
    return;
  }
  const shopGrid = document.getElementById('shop-grid');
  shopGrid.innerHTML = '';

  const upgradesHeader = document.createElement('div');
  upgradesHeader.style.cssText = 'width:100%;text-align:center;color:#FFD700;font-family:"Bangers",cursive;font-size:20px;letter-spacing:2px;margin-bottom:6px;padding-top:4px;';
  upgradesHeader.textContent = '⬆️ STAT UPGRADES';
  shopGrid.appendChild(upgradesHeader);
  
  Object.keys(PERMANENT_UPGRADES).forEach(key => {
    const upgrade = PERMANENT_UPGRADES[key];
    const currentLevel = saveData.upgrades[key];
    const isMaxLevel = currentLevel >= upgrade.maxLevel;
    const cost = getCost(key);
    const canAfford = saveData.gold >= cost;
    
    const card = document.createElement('div');
    card.className = 'upgrade-shop-card' + (isMaxLevel ? ' max-level' : '');
    
    const effectText = upgrade.description;
    
    card.innerHTML = `
      <div class="upgrade-shop-title">${upgrade.name}</div>
      <div class="upgrade-shop-desc">${effectText}</div>
      <div class="upgrade-shop-level">Level: ${currentLevel} / ${upgrade.maxLevel}</div>
      ${!isMaxLevel ? `
        <div class="upgrade-shop-cost">Cost: ${cost} Gold</div>
        <button class="upgrade-buy-btn" ${!canAfford ? 'disabled' : ''}>
          ${canAfford ? 'BUY' : 'NOT ENOUGH GOLD'}
        </button>
      ` : '<div class="upgrade-shop-cost" style="color: #27ae60;">MAX LEVEL</div>'}
    `;
    
    if (!isMaxLevel) {
      const btn = card.querySelector('.upgrade-buy-btn');
      btn.onclick = () => {
        playSound('levelup');
        buyUpgrade(key);
      };
    }
    
    shopGrid.appendChild(card);
  });
  
  document.getElementById('progression-shop').style.display = 'flex';
  updateGoldDisplays();
}

function buyUpgrade(upgradeKey) {
  const upgrade = PERMANENT_UPGRADES[upgradeKey];
  const currentLevel = saveData.upgrades[upgradeKey];
  const cost = getCost(upgradeKey);

  if (currentLevel >= upgrade.maxLevel) return;
  if (saveData.gold < cost) return;

  saveData.gold -= cost;
  saveData.upgrades[upgradeKey]++;

  if (typeof addAccountXP === 'function') {
    addAccountXP(3);
  } else if (window.GameAccount && typeof window.GameAccount.addXP === 'function') {
    window.GameAccount.addXP(3, 'Upgrade Purchase', saveData);
  }

  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest7_buyProgression') {
    progressTutorialQuest('quest7_buyProgression', true);
  }

  saveSaveData();
  playSound('levelup');
  showProgressionShop();
}

function spawnEnemy(type, x, z, level) {
  return (window.enemyPool && window.enemyPool.acquireEnemy(type, x, z, level))
      || new Enemy(type, x, z, level);
}

function checkTimedAlienSpawns() {
  if (!isGameActive || isGameOver || !player || !player.mesh) return;
  const runMinutes = (Date.now() - gameStartTime) / 60000;

  if (runMinutes >= 10 && !_alienScoutSpawned) {
    _alienScoutSpawned = true;
    const angle = Math.random() * Math.PI * 2;
    const dist = 28;
    const ex = player.mesh.position.x + Math.cos(angle) * dist;
    const ez = player.mesh.position.z + Math.sin(angle) * dist;
    const scout = spawnEnemy(17, ex, ez, playerStats.lvl);
    enemies.push(scout);
    createFloatingText('👽 GREY ALIEN SCOUT INCOMING!', player.mesh.position, '#00FF88');
    if (window.pushSuperStatEvent) {
      window.pushSuperStatEvent('👽 Grey Alien Scout', 'rare', '👽', 'danger');
    }
  }

  if (runMinutes >= 15 && !_annunakiOrbSpawned) {
    _annunakiOrbSpawned = true;
    const angle = Math.random() * Math.PI * 2;
    const dist = 32;
    const ex = player.mesh.position.x + Math.cos(angle) * dist;
    const ez = player.mesh.position.z + Math.sin(angle) * dist;
    const orb = spawnEnemy(19, ex, ez, playerStats.lvl);
    enemies.push(orb);
    createFloatingText('⚠️ ANNUNAKI ORB APPROACHING ⚠️', player.mesh.position, '#FFD700');
    triggerCinematic('miniboss', orb.mesh, 4000);
    if (window.pushSuperStatEvent) {
      window.pushSuperStatEvent('🔺 ANNUNAKI ORB', 'epic', '🔺', 'danger');
    }
  }
}

function spawnWave() {
  // FIX 1B: Guard spawnWave() — sandbox handles its own wave spawning via sandbox-loop.js
  if (window._engine2SandboxMode) return;

  // ── BUG FIX: Respect Annunaki wave-stop flag ──
  if (window._annunakiWavesStopped) return;

  if (typeof window._ensureEntityPools === 'function') window._ensureEntityPools();

  waveCount++;
  checkTimedAlienSpawns();

  if (window.pushSuperStatEvent) {
    const wRarity = waveCount >= 10 ? 'epic' : waveCount >= 5 ? 'rare' : 'uncommon';
    window.pushSuperStatEvent(`🌊 Wave ${waveCount}!`, wRarity, '🌊', 'neutral');
  }
  
  let currentEnemyCount = 0;
  for (let _ei = 0; _ei < enemies.length; _ei++) {
    if (!enemies[_ei].isDead) currentEnemyCount++;
  }
  if (currentEnemyCount >= GAME_CONFIG.maxEnemiesOnScreen) {
    console.warn(`[EnemyCap] Enemy count (${currentEnemyCount}) at max (${GAME_CONFIG.maxEnemiesOnScreen}), skipping wave spawn`);
    return;
  }
  
  const miniBossLevels = [10, 25, 40, 55, 70, 85, 100, 115, 130, 145];
  const isMiniBossWave = miniBossLevels.includes(playerStats.lvl) && !miniBossesSpawned.has(playerStats.lvl);
  const isFlyingBossWave = playerStats.lvl === 15 && !miniBossesSpawned.has(FLYING_BOSS_SPAWN_KEY);
  
  if (isFlyingBossWave) {
    miniBossesSpawned.add(FLYING_BOSS_SPAWN_KEY);
    const angle = Math.random() * Math.PI * 2;
    const dist = 35;
    const ex = player.mesh.position.x + Math.cos(angle) * dist;
    const ez = player.mesh.position.z + Math.sin(angle) * dist;
    const flyingBoss = spawnEnemy(11, ex, ez, playerStats.lvl);
    enemies.push(flyingBoss);
    if (window.GameDebug) window.GameDebug.onBossSpawn(flyingBoss, playerStats.lvl, 'FlyingBoss_L' + playerStats.lvl);
    createFloatingText("⚠️ FLYING BOSS INCOMING! ⚠️", player.mesh.position, '#FF00FF');
    triggerCinematic('miniboss', flyingBoss.mesh, 4000);
    for (let i = 0; i < 4; i++) {
      const sa = Math.random() * Math.PI * 2;
      const sd = 28 + Math.random() * 6;
      enemies.push(spawnEnemy(14, player.mesh.position.x + Math.cos(sa) * sd, player.mesh.position.z + Math.sin(sa) * sd, playerStats.lvl));
    }
    return;
  }
  
  if (isMiniBossWave) {
    miniBossesSpawned.add(playerStats.lvl);
    const angle = Math.random() * Math.PI * 2;
    const dist = 28;
    const ex = player.mesh.position.x + Math.cos(angle) * dist;
    const ez = player.mesh.position.z + Math.sin(angle) * dist;
    const miniBoss = spawnEnemy(10, ex, ez, playerStats.lvl);
    if (saveData.aidaDarkPacts && (saveData.aidaDarkPacts.bossSpeedCharges || 0) > 0) {
      miniBoss.walkSpeed = (miniBoss.walkSpeed || 4) * 2.0;
      miniBoss.runSpeed  = (miniBoss.runSpeed  || 6) * 2.0;
      saveData.aidaDarkPacts.bossSpeedCharges = Math.max(0, saveData.aidaDarkPacts.bossSpeedCharges - 1);
      if (typeof saveSaveData === 'function') saveSaveData();
    }
    enemies.push(miniBoss);
    if (window.GameDebug) window.GameDebug.onBossSpawn(miniBoss, playerStats.lvl, 'MiniBoss_L' + playerStats.lvl);
    createFloatingText("MINI-BOSS INCOMING!", player.mesh.position);
    console.log(`[MiniBoss] L${playerStats.lvl} spawned t=${Math.floor((Date.now()-gameStartTime)/1000)}s — loop alive, enemies=${enemies.length}`);
    triggerCinematic('miniboss', miniBoss.mesh, 3000);
    const supportCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < supportCount; i++) {
      const supportAngle = Math.random() * Math.PI * 2;
      const supportDist = 25 + Math.random() * 5;
      const supportX = player.mesh.position.x + Math.cos(supportAngle) * supportDist;
      const supportZ = player.mesh.position.z + Math.sin(supportAngle) * supportDist;
      const supportType = Math.floor(Math.random() * Math.min(3, Math.max(1, playerStats.lvl / 3)));
      const minion = spawnEnemy(supportType, supportX, supportZ, playerStats.lvl);
      minion.isMiniBossMinion = true;
      enemies.push(minion);
    }
    return;
  }
  
  let baseCount, levelBonus, cap;
  if (playerStats.lvl <= 30) {
    baseCount = 6 + Math.floor(waveCount / 2);
    levelBonus = Math.floor(playerStats.lvl / 2);
    cap = 18;
  } else if (playerStats.lvl <= 75) {
    baseCount = 8 + Math.floor(waveCount / 2);
    levelBonus = Math.floor(playerStats.lvl / 3);
    cap = 24;
  } else if (playerStats.lvl <= 120) {
    baseCount = 10 + Math.floor(waveCount / 2);
    levelBonus = Math.floor(playerStats.lvl / 3);
    cap = 26;
  } else {
    baseCount = 12 + Math.floor(waveCount / 2);
    levelBonus = Math.floor(playerStats.lvl / 3);
    cap = 30;
  }

  const count = Math.min(baseCount + levelBonus, cap);
  
  for(let i=0; i<count; i++) {
    let ex, ez, inLake;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    
    do {
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 8;
      ex = player.mesh.position.x + Math.cos(angle) * dist;
      ez = player.mesh.position.z + Math.sin(angle) * dist;
      const distToLake = Math.sqrt(
        (ex - GAME_CONFIG.lakeCenterX) * (ex - GAME_CONFIG.lakeCenterX) + 
        (ez - GAME_CONFIG.lakeCenterZ) * (ez - GAME_CONFIG.lakeCenterZ)
      );
      inLake = distToLake < GAME_CONFIG.lakeRadius + 5;
      attempts++;
    } while (inLake && attempts < MAX_ATTEMPTS);
    
    if (inLake) {
      const angleFromLake = Math.atan2(ez - GAME_CONFIG.lakeCenterZ, ex - GAME_CONFIG.lakeCenterX);
      ex = GAME_CONFIG.lakeCenterX + Math.cos(angleFromLake) * (GAME_CONFIG.lakeRadius + 10);
      ez = GAME_CONFIG.lakeCenterZ + Math.sin(angleFromLake) * (GAME_CONFIG.lakeRadius + 10);
    }
    
    const totalRuns = saveData.totalRuns || 0;
    const isEarlyGame = totalRuns < 2;

    let maxType = 2;
    if (!isEarlyGame) {
      if (playerStats.lvl >= 8) maxType = 5;
      if (playerStats.lvl >= 10) maxType = 5;
      if (playerStats.lvl >= 12) maxType = 6;
      if (playerStats.lvl >= 14) maxType = 7;
      if (playerStats.lvl >= 16) maxType = 8;
      if (playerStats.lvl >= 18) maxType = 9;
    }

    let type = Math.floor(Math.random() * (maxType + 1));

    if (type === 4 && playerStats.lvl < 10) {
      type = 3;
    }

    if (!isEarlyGame) {
      if (playerStats.lvl >= 8 && Math.random() < 0.15) type = 5;
      if (type === 4 && Math.random() > 0.3) type = Math.floor(Math.random() * 3);
      if (type >= 6 && type <= 9 && Math.random() > 0.3) {
        const fallbackMax = playerStats.lvl >= 8 ? 6 : 3;
        type = Math.floor(Math.random() * fallbackMax);
        if (type === 4 && playerStats.lvl < 10) type = Math.floor(Math.random() * 3);
      }
      if (Math.random() < 0.20) type = 21;
      if (Math.random() < 0.15) type = 15;
      if (playerStats.lvl >= 15 && Math.random() < 0.20) type = 12 + Math.floor(Math.random() * 3);
      const killsMilestone = saveData.totalKills || 0;
      if (playerStats.lvl >= 10 && killsMilestone >= 3 && Math.random() < 0.10) type = 16;
    } else {
      if (Math.random() < 0.25) type = 21;
      else if (Math.random() < 0.30) type = 15;
      else if (Math.random() < 0.25) type = 7;
    }
    
    const newEnemy = spawnEnemy(type, ex, ez, playerStats.lvl);
    enemies.push(newEnemy);
  }

  if (window._nmForbiddenProtocol && Math.random() < 0.15) {
    const glitchAngle = Math.random() * Math.PI * 2;
    const glitchDist = 12 + Math.random() * 8;
    const gx = player.mesh.position.x + Math.cos(glitchAngle) * glitchDist;
    const gz = player.mesh.position.z + Math.sin(glitchAngle) * glitchDist;
    const glitch = spawnEnemy(20, gx, gz, playerStats.lvl);
    enemies.push(glitch);
    if (typeof createFloatingText === 'function') createFloatingText('⚠ SOURCE GLITCH', player.mesh.position, '#FF00FF');
  }

  const isVeryFirstRun = saveData.totalRuns === 0;
  if (isVeryFirstRun && waveCount === 1 && !_firstEnemyTutorialShown) {
    _firstEnemyTutorialShown = true;
    setGamePaused(true);
    setTimeout(() => {
      showComicInfoBox(
        '🎯 FIRST ENEMY!',
        '<div style="text-align:left;line-height:1.8;font-size:15px;padding:4px 0">' +
        '<div style="font-size:17px;text-align:center;color:#5DADE2;margin-bottom:10px;"><b>HOW TO SURVIVE</b></div>' +
        '<p style="margin-bottom:8px;">🕹️ <b>STEER:</b> Left joystick / WASD keys to move your droplet</p>' +
        '<p style="margin-bottom:8px;">🎯 <b>AIM:</b> Right joystick / mouse to aim your shots</p>' +
        '<p style="margin-bottom:8px;">💨 <b>DASH:</b> Double-tap direction to evade quickly</p>' +
        '<p style="margin-bottom:8px;">⭐ <b>XP:</b> Collect the stars enemies drop to level up</p>' +
        '<div style="background:rgba(255,215,0,0.1);border:2px solid rgba(255,215,0,0.4);border-radius:8px;padding:8px;margin-top:8px;font-size:13px;">' +
        '💡 <b>Tip:</b> Keep moving — standing still is dangerous!</div>' +
        '</div>',
        'GOT IT! FIGHT! →',
        () => { setGamePaused(false); }
      );
    }, 300);
  }
  
  if (waveCount % 5 === 0) {
    const chestAngle = Math.random() * Math.PI * 2;
    const chestDist = 10 + Math.random() * 5;
    const cx = player.mesh.position.x + Math.cos(chestAngle) * chestDist;
    const cz = player.mesh.position.z + Math.sin(chestAngle) * chestDist;
    spawnChest(cx, cz);
    createFloatingText('Wave Bonus Chest!', player.mesh.position, '#FFD700');
  }
}

function triggerKillCam(enemyPosition, isMiniBoss = false, damageType = 'physical') {
  const shouldActivateKillCam = isMiniBoss;
  if (!shouldActivateKillCam || killCamActive) return;
  
  const killCamTypes = ['zoom_in','slow_motion','rotate','shake_zoom','dramatic_pan'];
  killCamType = killCamTypes[Math.floor(Math.random() * killCamTypes.length)];
  killCamActive = true;
  killCamTimer = 0;
  killCamDuration = isMiniBoss ? 1.2 : 0.6;
  killCamData.originalCameraPos = camera.position.clone();
  killCamData.originalCameraTarget = new THREE.Vector3(player.mesh.position.x, 0, player.mesh.position.z);
  killCamData.killPosition = enemyPosition.clone();
  killCamData.isMiniBoss = isMiniBoss;
  killCamData.damageType = damageType;
  createKillCamOverlay(isMiniBoss);
}

function createKillCamOverlay(isMiniBoss) {
  const overlay = document.createElement('div');
  overlay.id = 'kill-cam-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '499';
  overlay.style.background = 'radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.3) 100%)';
  overlay.style.border = isMiniBoss ? '4px solid rgba(255, 215, 0, 0.6)' : '2px solid rgba(255, 255, 255, 0.3)';
  overlay.style.boxSizing = 'border-box';
  overlay.style.animation = 'killCamPulse 0.3s ease-in-out';
  document.body.appendChild(overlay);
  
  const killText = document.createElement('div');
  killText.style.position = 'absolute';
  killText.style.top = '50%';
  killText.style.left = '50%';
  killText.style.transform = 'translate(-50%, -50%)';
  killText.style.color = isMiniBoss ? '#FFD700' : '#FF0000';
  killText.style.fontSize = isMiniBoss ? '48px' : '36px';
  killText.style.fontWeight = '900';
  killText.style.textShadow = '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(255,0,0,0.5)';
  killText.style.fontFamily = "'M PLUS Rounded 1c', sans-serif";
  killText.textContent = isMiniBoss ? '⚡ BOSS DOWN! ⚡' : getRandomKillMessage();
  killText.style.opacity = '0';
  killText.style.animation = 'killTextAppear 0.3s ease-out forwards';
  overlay.appendChild(killText);
  
  setTimeout(() => {
    if (overlay.parentElement) overlay.remove();
  }, killCamDuration * 1000);
}

function updateKillCam(dt) {
  if (!killCamActive) return;
  if (!killCamData || !killCamData.killPosition || !killCamData.originalCameraPos) {
    console.warn('[KillCam] Invalid killCamData — force-ending kill cam');
    killCamActive = false;
    return;
  }
  killCamTimer += dt;
  const progress = Math.min(killCamTimer / killCamDuration, 1);
  switch (killCamType) {
    case 'zoom_in':
      const zoomFactor = 1 - (progress * KILL_CAM_CONSTANTS.ZOOM_IN_INTENSITY);
      const targetPos = killCamData.killPosition.clone();
      camera.position.x = killCamData.originalCameraPos.x + (targetPos.x - killCamData.originalCameraPos.x) * progress;
      camera.position.z = killCamData.originalCameraPos.z + ((targetPos.z + 15 * zoomFactor) - killCamData.originalCameraPos.z) * progress;
      camera.lookAt(targetPos.x, 0, targetPos.z);
      break;
    case 'slow_motion':
      const slowZoom = 1 - (Math.sin(progress * Math.PI) * KILL_CAM_CONSTANTS.SLOW_MOTION_ZOOM);
      camera.position.x = killCamData.originalCameraPos.x;
      camera.position.y = killCamData.originalCameraPos.y;
      camera.position.z = killCamData.originalCameraPos.z * slowZoom;
      break;
    case 'rotate':
      const angle = progress * Math.PI * 0.5;
      const radius = KILL_CAM_CONSTANTS.ROTATE_CAM_RADIUS;
      const centerPos = killCamData.killPosition.clone();
      camera.position.x = centerPos.x + Math.cos(angle) * radius;
      camera.position.z = centerPos.z + Math.sin(angle) * radius;
      camera.position.y = killCamData.originalCameraPos.y;
      camera.lookAt(centerPos.x, 0, centerPos.z);
      break;
    case 'shake_zoom':
      const shakeIntensity = (1 - progress) * 2;
      const zoomIn = 1 - (progress * KILL_CAM_CONSTANTS.SHAKE_ZOOM_INTENSITY);
      camera.position.x = killCamData.originalCameraPos.x + (Math.random() - 0.5) * shakeIntensity;
      camera.position.y = killCamData.originalCameraPos.y + (Math.random() - 0.5) * shakeIntensity;
      camera.position.z = killCamData.originalCameraPos.z * zoomIn + (Math.random() - 0.5) * shakeIntensity;
      break;
    case 'dramatic_pan':
      const panProgress = Math.min(progress * 1.5, 1);
      const panTarget = new THREE.Vector3(
        killCamData.killPosition.x + (player.mesh.position.x - killCamData.killPosition.x) * panProgress,
        0,
        killCamData.killPosition.z + (player.mesh.position.z - killCamData.killPosition.z) * panProgress
      );
      const panStartPos = killCamData.originalCameraPos;
      const panEndPosZOffset = 10;
      const panEndPos = new THREE.Vector3(panTarget.x, panStartPos.y, panTarget.z + panEndPosZOffset);
      camera.position.x = panStartPos.x + (panEndPos.x - panStartPos.x) * panProgress;
      camera.position.y = panStartPos.y + (panEndPos.y - panStartPos.y) * panProgress;
      camera.position.z = panStartPos.z + (panEndPos.z - panStartPos.z) * panProgress;
      camera.lookAt(panTarget);
      break;
  }
  if (progress >= 1) {
    killCamActive = false;
    camera.position.copy(killCamData.originalCameraPos);
    camera.lookAt(killCamData.originalCameraTarget);
  }
}

const MAX_TOTAL_PARTICLES = 150;
let _particleRecycleIdx = 0;
function spawnParticles(pos, color, count) {
  if (!particlePool) return;
  const cappedCount = Math.min(count, 6);
  for (let i = 0; i < cappedCount; i++) {
    if (particles.length >= MAX_TOTAL_PARTICLES) {
      const idx = _particleRecycleIdx % particles.length;
      particles[idx].reset(pos, color);
      _particleRecycleIdx = (idx + 1) % particles.length;
    } else {
      const particle = particlePool.get();
      particle.reset(pos, color);
      particles.push(particle);
    }
  }
}

let _bloodDecalIM        = null;
const _bdIMSpawnTime     = new Float64Array(MAX_BLOOD_DECALS);
const _bdIMInitialSize   = new Float32Array(MAX_BLOOD_DECALS);
const _bdIMMatrix        = new THREE.Matrix4();
const _bdIMScale         = new THREE.Vector3();
const _bdIMPos           = new THREE.Vector3();
const _bdIMQuat          = new THREE.Quaternion();
const _bdIMRot           = new THREE.Euler(-Math.PI / 2, 0, 0);
let   _bdIMIndex         = 0;
const BLOOD_DECAL_FADE_MS = 12000;

function _ensureBloodDecalIM() {
  if (_bloodDecalIM || window._bloodDecalsDisabled || !scene || typeof THREE === 'undefined') return;
  try {
    const geo = new THREE.CircleGeometry(1, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6B0000, transparent: true, opacity: 0.7, depthWrite: false,
      roughness: 0.15, metalness: 0.6, emissive: 0x3A0000, emissiveIntensity: 0.15,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    _bloodDecalIM = new THREE.InstancedMesh(geo, mat, MAX_BLOOD_DECALS);
    _bloodDecalIM.renderOrder = 12;
    _bloodDecalIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _bdIMQuat.setFromEuler(_bdIMRot);
    for (let i = 0; i < MAX_BLOOD_DECALS; i++) {
      _bdIMPos.set(0, -100, 0);
      _bdIMScale.set(0.01, 0.01, 0.01);
      _bdIMMatrix.compose(_bdIMPos, _bdIMQuat, _bdIMScale);
      _bloodDecalIM.setMatrixAt(i, _bdIMMatrix);
      _bdIMSpawnTime[i] = 0;
      _bdIMInitialSize[i] = 0;
    }
    _bloodDecalIM.instanceMatrix.needsUpdate = true;
    scene.add(_bloodDecalIM);
    window._bloodDecalIM   = _bloodDecalIM;
    window._bdIMSpawnTime  = _bdIMSpawnTime;
  } catch (e) {
    window._bloodDecalsDisabled = true;
  }
}

function spawnBloodDecal(pos) {
  if (!scene) return;
  _ensureBloodDecalIM();
  if (!_bloodDecalIM) return;
  const idx = _bdIMIndex;
  _bdIMIndex = (idx + 1) % MAX_BLOOD_DECALS;
  const size = 0.15 + Math.random() * 0.35;
  _bdIMSpawnTime[idx]  = Date.now();
  _bdIMInitialSize[idx] = size;
  _bdIMPos.set(pos.x + (Math.random() - 0.5) * 0.8, 0.01 + (idx * 0.0001), pos.z + (Math.random() - 0.5) * 0.8);
  _bdIMScale.set(size, size, size);
  _bdIMMatrix.compose(_bdIMPos, _bdIMQuat, _bdIMScale);
  _bloodDecalIM.setMatrixAt(idx, _bdIMMatrix);
  _bloodDecalIM.instanceMatrix.needsUpdate = true;
}

function spawnBloodSkidMark(pos, dirX, dirZ) {
  if (!scene) return;
  const geo = new THREE.PlaneGeometry(1.5, 0.4);
  const mat = new THREE.MeshBasicMaterial({ color: 0x5A0000, transparent: true, opacity: 0.6, depthWrite: false });
  const skid = new THREE.Mesh(geo, mat);
  skid.rotation.x = -Math.PI / 2;
  skid.rotation.z = -Math.atan2(dirZ, dirX);
  skid.renderOrder = -1;
  skid.position.set(pos.x, 0.05, pos.z);
  scene.add(skid);
  skid.userData.spawnTime = Date.now();
  skid.userData.initialOpacity = 0.6;
  if (!window._bloodDecals) window._bloodDecals = [];
  window._bloodDecals.push(skid);
  setTimeout(() => {
    if (skid.parent) scene.remove(skid);
    geo.dispose();
    mat.dispose();
  }, 12000);
}

const BLOOD_DECAL_FADE_START = 0.7;
function updateBloodDecals() {
  if (_bloodDecalIM) {
    const now = Date.now();
    let needsUpdate = false;
    for (let i = 0; i < MAX_BLOOD_DECALS; i++) {
      const spawnTime = _bdIMSpawnTime[i];
      if (!spawnTime) continue;
      const age = now - spawnTime;
      if (age >= BLOOD_DECAL_FADE_MS) {
        _bdIMSpawnTime[i] = 0;
        _bdIMPos.set(0, -100, 0);
        _bdIMScale.set(0.01, 0.01, 0.01);
        _bdIMMatrix.compose(_bdIMPos, _bdIMQuat, _bdIMScale);
        _bloodDecalIM.setMatrixAt(i, _bdIMMatrix);
        needsUpdate = true;
      } else if (age > BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) {
        const fadeProgress = (age - BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) /
                             (BLOOD_DECAL_FADE_MS * (1 - BLOOD_DECAL_FADE_START));
        const baseSize = _bdIMInitialSize[i];
        const s = baseSize * (1 - fadeProgress);
        _bloodDecalIM.getMatrixAt(i, _bdIMMatrix);
        _bdIMMatrix.decompose(_bdIMPos, _bdIMQuat, _bdIMScale);
        _bdIMScale.set(s, s, s);
        _bdIMMatrix.compose(_bdIMPos, _bdIMQuat, _bdIMScale);
        _bloodDecalIM.setMatrixAt(i, _bdIMMatrix);
        needsUpdate = true;
      }
    }
    if (needsUpdate) _bloodDecalIM.instanceMatrix.needsUpdate = true;
    return;
  }
  const now = Date.now();
  if (window._bloodDecalsDisabled) return;
  for (let i = bloodDecals.length - 1; i >= 0; i--) {
    const decal = bloodDecals[i];
    if (!decal.userData.spawnTime) { if (!decal.parent) bloodDecals.splice(i, 1); continue; }
    if (!decal.parent) { bloodDecals.splice(i, 1); continue; }
    const age = now - decal.userData.spawnTime;
    if (age >= BLOOD_DECAL_FADE_MS) {
      if (decal.parent) scene.remove(decal);
      if (decal.geometry) decal.geometry.dispose();
      if (decal.material) decal.material.dispose();
      bloodDecals.splice(i, 1);
    } else if (age > BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) {
      const fadeProgress = (age - BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) / (BLOOD_DECAL_FADE_MS * (1 - BLOOD_DECAL_FADE_START));
      decal.material.opacity = (decal.userData.initialOpacity || 0.7) * (1 - fadeProgress);
    }
  }
}

let _sharedSmokeSphereGeo = null;
function _ensureSharedSmokeGeo() {
  if (!_sharedSmokeSphereGeo && typeof THREE !== 'undefined') {
    _sharedSmokeSphereGeo = new THREE.SphereGeometry(0.04, 4, 4);
  }
}

function spawnMuzzleSmoke(pos, count = 5) {
  const cappedCount = Math.min(count, 3);
  _ensureSharedSmokeGeo();
  if (typeof _ensureSmokePool === 'function') _ensureSmokePool();
  for(let i = 0; i < cappedCount; i++) {
    if (smokeParticles.length >= MAX_SMOKE_PARTICLES && smokeParticles.length > 0) {
      const oldest = smokeParticles.shift();
      if (scene && oldest.mesh.parent === scene) scene.remove(oldest.mesh);
      if (_smokePool) {
        _smokePool.release(oldest);
      } else if (oldest.material) {
        oldest.material.dispose();
      }
    }
    const entry = _smokePool ? _smokePool.get() : (() => {
      const mesh = new THREE.Mesh(_sharedSmokeSphereGeo, new THREE.MeshBasicMaterial({ 
        color: 0x666666, transparent: true, opacity: 0.5, depthWrite: false
      }));
      return {
        mesh, material: mesh.material, geometry: _sharedSmokeSphereGeo,
        velocity: { x: 0, y: 0, z: 0 }, life: 0, maxLife: GAME_CONFIG.smokeDurationFrames
      };
    })();
    entry.mesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.3,
      pos.y + 0.5,
      pos.z + (Math.random() - 0.5) * 0.3
    );
    entry.velocity.x = (Math.random() - 0.5) * 0.02;
    entry.velocity.y = 0.03 + Math.random() * 0.02;
    entry.velocity.z = (Math.random() - 0.5) * 0.02;
    entry.life = GAME_CONFIG.smokeDurationFrames;
    entry.maxLife = GAME_CONFIG.smokeDurationFrames;
    if (entry.mesh.material) entry.mesh.material.opacity = 0.5;
    entry.mesh.visible = true;
    if (!entry.mesh.parent && scene) scene.add(entry.mesh);
    smokeParticles.push(entry);
  }
}

function spawnExp(x, z, sourceWeapon, hitForce, enemyType) {
  expGems.push(new ExpGem(x, z, sourceWeapon, hitForce, enemyType));
}

function spawnGold(x, z, amount) {
  goldCoins.push(new GoldCoin(x, z, amount));
}

function spawnGoldDrop(x, z, amount) {
  goldDrops.push(new GoldDrop(x, z, amount));
}

function spawnChest(x, z, tier = 'common') {
  chests.push(new Chest(x, z, tier));
  createFloatingText('CHEST!', new THREE.Vector3(x, 0.3, z));
}

function addGold(amount) {
  const bonus = PERMANENT_UPGRADES.goldEarned.effect(saveData.upgrades.goldEarned);
  const _clickerBonus = window._idleClickerGoldBonus || 0;
  const finalAmount = Math.floor(amount * (1 + bonus) * (1 + _clickerBonus));
  playerStats.gold += finalAmount;
  saveData.gold += finalAmount;
  saveData.totalGoldEarned += finalAmount;
  updateHUD();
  updateGoldDisplays();
}

function updateGoldDisplays() {
  const goldText = `GOLD: ${saveData.gold}`;
  const menuGold = document.getElementById('menu-gold');
  const shopGold = document.getElementById('shop-gold');
  if (menuGold) menuGold.innerText = goldText;
  if (shopGold) shopGold.innerText = goldText;
  // Also refresh the in-game HUD gold counter
  const hudGold = document.getElementById('hud-gold');
  if (hudGold) hudGold.textContent = '💰 ' + (typeof playerStats !== 'undefined' && playerStats ? playerStats.gold : 0);
}

function spawnWaterDroplet(pos) {
  const geo = new THREE.SphereGeometry(0.1, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.player, transparent: true, opacity: 0.6 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.position.y = 0.3;
  scene.add(mesh);
  let life = 20;
  const update = () => {
    life--;
    mesh.position.y -= 0.02;
    mat.opacity = life / 20;
    if (life <= 0 || mesh.position.y <= 0.05) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    } else {
      requestAnimationFrame(update);
    }
  };
  update();
}

// ── BUG FIX: addExp guard — only add XP when game is active
function addExp(amount) {
  if (!isGameActive || isGameOver) return; // FIXED: prevents XP when game not running
  playerStats.exp += amount;
  
  if (activeCompanion && !activeCompanion.isDead) {
    activeCompanion.addXP(amount);
  }
  
  const waterdropContainer = document.getElementById('waterdrop-container');
  if (waterdropContainer) {
    waterdropContainer.classList.add('grow');
    setTimeout(() => {
      waterdropContainer.classList.remove('grow');
    }, 300);
  }
  
  if (playerStats.exp >= playerStats.expReq && !isGameOver && isGameActive && !levelUpPending) {
    levelUp();
  }
  updateHUD();
}

function levelUp(freeLevel = false) {
  if (levelUpPending) return;
  levelUpPending = true;
  setGamePaused(true);
  
  savedCameraPosition = { 
    x: camera.position.x, y: camera.position.y, z: camera.position.z,
    left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom
  };
  
  if (comboState.lastKillTime && comboState.count >= 5) {
    const currentTime = Date.now();
    const timeSinceLastKill = currentTime - comboState.lastKillTime;
    if (timeSinceLastKill < comboState.comboWindow) {
      comboState.pausedAt = currentTime;
    }
  }
  
  playerStats.lvl++;
  if (window.GameMilestones) window.GameMilestones.recordLevel(playerStats.lvl);
  if (window.pushSuperStatEvent) {
    const lvl = playerStats.lvl;
    const r = lvl >= 50 ? 'mythic' : lvl >= 25 ? 'legendary' : lvl >= 10 ? 'epic' : lvl >= 5 ? 'rare' : 'uncommon';
    window.pushSuperStatEvent(`\u2B06 Level ${lvl}!`, r, '\u2728', 'success');
  }
  if (!freeLevel) {
    playerStats.exp -= playerStats.expReq;
  }
  
  if (playerStats.lvl === 100) {
    levelUpPending = false;
    setGamePaused(false);
    startAnnunakiEvent();
    return;
  }
  
  // XP curve tuned for ~65 levels: fast early (1-20), moderate mid (21-40), slow late (41+).
  // Uses boundary-preserving scaling so each tier is continuous with the previous.
  const base = GAME_CONFIG.baseExpReq;
  const lvl = playerStats.lvl;
  if (lvl <= 20) {
    // Fast early game: levels 1-20 are quick
    playerStats.expReq = Math.floor(base * Math.pow(lvl, 1.4));
  } else if (lvl <= 40) {
    // Moderate mid game: levels 21-40 slow down, continuous from lvl 20
    const expAt20 = base * Math.pow(20, 1.4);
    const scaledLvl = lvl / 20;
    playerStats.expReq = Math.floor(expAt20 * Math.pow(scaledLvl, 1.75));
  } else {
    // Slow late game: levels 41+ are very slow, continuous from lvl 40
    const expAt20 = base * Math.pow(20, 1.4);
    const expAt40 = expAt20 * Math.pow(40 / 20, 1.75);
    const scaledLvl = lvl / 40;
    playerStats.expReq = Math.floor(expAt40 * Math.pow(scaledLvl, 2.1));
  }
  
  if (playerStats.lvl >= 15 && saveData.tutorialQuests &&
      saveData.tutorialQuests.currentQuest === 'quest_eggHunt' &&
      !saveData.tutorialQuests.mysteriousEggFound && !window._mysteriousEggSpawned) {
    window._mysteriousEggSpawned = true;
    try {
      const eggGroup = new THREE.Group();
      const eggGeo = new THREE.SphereGeometry(0.8, 16, 16);
      eggGeo.scale(1, 1.3, 1);
      const eggMat = new THREE.MeshStandardMaterial({
        color: 0x8B5CF6, emissive: 0x7C3AED, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.5
      });
      const eggMesh = new THREE.Mesh(eggGeo, eggMat);
      eggMesh.castShadow = true;
      eggMesh.position.y = 0.8;
      eggGroup.add(eggMesh);
      const px = player.mesh ? player.mesh.position.x : 0;
      const pz = player.mesh ? player.mesh.position.z : 0;
      eggGroup.position.set(px + 8, 0, pz + 8);
      eggGroup.userData.isMysteriousEgg = true;
      scene.add(eggGroup);
      window._mysteriousEggObject = eggGroup;
      createFloatingText("🥚 A Mysterious Egg appeared!", eggGroup.position, '#8B5CF6');
      showStatChange('🥚 A Mysterious Egg appeared nearby! Go pick it up!');
    } catch(e) {
      console.error('[Quest] Failed to spawn egg:', e);
    }
  }
  
  try {
    checkAchievements();
    createSlowMotionEffect();
    createCenteredLevelUpText();
    if (renderer) renderer.setPixelRatio(0.55);
  } catch(e) {
    console.error('[LevelUp] Pre-modal synchronous error:', e);
  }
  
  setTimeout(() => {
    try {
      createLevelUpEffects();
      playSound('levelup');
    } catch(e) {
      console.error('[LevelUp] Effects error:', e);
    }
  }, 300);
  
  setTimeout(() => {
    try {
      showUpgradeModal();
      if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio));
    } catch(e) {
      console.error('[LevelUp] showUpgradeModal error:', e);
      if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio));
      levelUpPending = false;
      setGamePaused(false);
    }
  }, 800);
}

function checkPendingLevelUp() {
  levelUpPending = false;
  if (pendingQuestLevels > 0 && !isGameOver && isGameActive) {
    pendingQuestLevels--;
    levelUp(true);
  } else if (playerStats && playerStats.exp >= playerStats.expReq && !isGameOver && isGameActive) {
    levelUp();
  }
}
window.checkPendingLevelUp = checkPendingLevelUp;

function forceGameUnpause() {
  pauseOverlayCount = 0;
  window.pauseOverlayCount = 0;
  isPaused = false;
  window.isPaused = false;
  if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
  checkPendingLevelUp();
}
window.forceGameUnpause = forceGameUnpause;

function awardLevels(count) {
  if (!count || count < 1) return;
  if (levelUpPending) {
    pendingQuestLevels += count;
  } else {
    pendingQuestLevels += (count - 1);
    levelUp(true);
  }
}

function createCenteredLevelUpText() {
  const levelUpText = document.createElement('div');
  
  let startX = window.innerWidth / 2;
  let startY = window.innerHeight / 2;
  if (player && player.mesh && camera) {
    const headPos = player.mesh.position.clone();
    headPos.y += 2;
    headPos.project(camera);
    startX = (headPos.x * 0.5 + 0.5) * window.innerWidth;
    startY = (-(headPos.y * 0.5) + 0.5) * window.innerHeight;
  }
  
  levelUpText.style.cssText = `
    position: fixed;
    left: ${startX}px;
    top: ${startY}px;
    transform: translate(-50%, -50%) scale(0);
    font-family: 'Bangers', cursive;
    font-size: 44px;
    font-weight: 500;
    color: #FFD700;
    text-shadow: 
      0 0 10px rgba(255,165,0,0.95),
      0 0 22px rgba(255,80,0,0.7),
      0 0 40px rgba(255,215,0,0.5),
      2px 2px 0 #000,
      -1px -1px 0 #000,
      1px -1px 0 #000,
      -1px 1px 0 #000;
    z-index: 200;
    pointer-events: none;
    letter-spacing: 6px;
    will-change: transform, opacity;
  `;
  levelUpText.textContent = 'LEVEL UP!';
  document.body.appendChild(levelUpText);

  const _embers = [];
  const _EMBER_COUNT = 18;
  function _spawnEmbers(cx, cy) {
    for (let i = 0; i < _EMBER_COUNT; i++) {
      const em = document.createElement('div');
      const size = 4 + Math.random() * 7;
      const emberColor = Math.random() < 0.5 ? '#FF4500' : (Math.random() < 0.5 ? '#FFD700' : '#FF8C00');
      em.style.cssText = `position:fixed;width:${size}px;height:${size}px;border-radius:50%;background:${emberColor};box-shadow:0 0 ${size*1.5}px ${emberColor};left:${cx}px;top:${cy}px;pointer-events:none;z-index:199;transform:translate(-50%,-50%);will-change:transform,opacity;`;
      document.body.appendChild(em);
      const angle  = (Math.random() * Math.PI * 2);
      const speed  = 1.5 + Math.random() * 2.8;
      const drift  = (Math.random() - 0.5) * 0.6;
      const life   = 600 + Math.random() * 600;
      _embers.push({ el: em, vx: Math.cos(angle)*speed+drift, vy: -(speed*0.8+Math.random()*1.2), startTime: Date.now(), life });
    }
  }

  function _tickEmbers() {
    const now = Date.now();
    for (let i = _embers.length - 1; i >= 0; i--) {
      const e = _embers[i];
      const t = (now - e.startTime) / e.life;
      if (t >= 1) {
        if (e.el.parentNode) e.el.parentNode.removeChild(e.el);
        _embers.splice(i, 1);
        continue;
      }
      const px = parseFloat(e.el.style.left) + e.vx;
      const py = parseFloat(e.el.style.top)  + e.vy;
      e.vy  -= 0.04;
      e.vx  *= 0.97;
      e.el.style.left    = px + 'px';
      e.el.style.top     = py + 'px';
      e.el.style.opacity = (1 - t * t).toFixed(3);
    }
    if (_embers.length > 0) requestAnimationFrame(_tickEmbers);
  }
  
  const startTime = Date.now();
  const totalDuration = 2200;
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  let _embersSpawned = false;
  
  const animFn = () => {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / totalDuration;
    
    if (progress < 0.15) {
      const t = progress / 0.15;
      const scale = t * 1.3;
      const curY = startY - t * 90;
      levelUpText.style.top = curY + 'px';
      levelUpText.style.transform = `translate(-50%, -50%) scale(${scale})`;
      levelUpText.style.opacity = t;
    } else if (progress < 0.25) {
      levelUpText.style.transform = `translate(-50%, -50%) scale(1.3)`;
      levelUpText.style.opacity = '1';
      if (!_embersSpawned) {
        _embersSpawned = true;
        const rect = levelUpText.getBoundingClientRect();
        _spawnEmbers(rect.left + rect.width / 2, rect.top + rect.height / 2);
        requestAnimationFrame(_tickEmbers);
      }
    } else if (progress < 0.65) {
      const t = (progress - 0.25) / 0.40;
      const curX = startX + (centerX - startX) * t;
      const curY = (startY - 90) + (centerY - (startY - 90)) * t;
      const scale = 1.3 + t * 0.2;
      levelUpText.style.left = curX + 'px';
      levelUpText.style.top  = curY + 'px';
      levelUpText.style.transform = `translate(-50%, -50%) scale(${scale})`;
      levelUpText.style.opacity = '1';
    } else if (progress < 1) {
      const fp = (progress - 0.65) / 0.35;
      const burnHue = fp < 0.4 ? `#FFD700`
        : fp < 0.7 ? `hsl(${30 - fp*80},100%,${60 - fp*50}%)`
        : `hsl(0,80%,${Math.max(0,20 - (fp-0.7)*70)}%)`;
      levelUpText.style.left   = centerX + 'px';
      levelUpText.style.top    = centerY + 'px';
      levelUpText.style.color  = burnHue;
      levelUpText.style.textShadow = `0 0 ${30*(1-fp)}px ${burnHue}, 2px 2px 0 #000`;
      const scale = 1.5 - fp * 0.4;
      levelUpText.style.transform = `translate(-50%, -50%) scale(${scale}) skewX(${fp*6}deg)`;
      levelUpText.style.opacity = Math.max(0, 1 - fp * 1.1);
      if (fp > 0.05 && fp < 0.35 && Math.random() < 0.25) {
        const rect = levelUpText.getBoundingClientRect();
        _spawnEmbers(rect.left + rect.width/2 + (Math.random()-0.5)*60, rect.top + rect.height/2 + (Math.random()-0.5)*20);
      }
    } else {
      if (levelUpText.parentNode) levelUpText.parentNode.removeChild(levelUpText);
      return;
    }
    requestAnimationFrame(animFn);
  };
  animFn();
}

function createSmallFloatingText(text, pos) {
  const statusEl = document.getElementById('status-message');
  if (!statusEl) return;
  if (floatingTextFadeInterval) { clearInterval(floatingTextFadeInterval); floatingTextFadeInterval = null; }
  if (floatingTextFadeTimeout) { clearTimeout(floatingTextFadeTimeout); floatingTextFadeTimeout = null; }
  statusEl.innerText = text;
  statusEl.style.color = '#5DADE2';
  statusEl.style.fontSize = '18px';
  statusEl.style.opacity = '1';
  floatingTextFadeTimeout = setTimeout(() => {
    let opacity = 1;
    floatingTextFadeInterval = setInterval(() => {
      opacity -= 0.05;
      if (opacity <= 0) {
        clearInterval(floatingTextFadeInterval);
        floatingTextFadeInterval = null;
        statusEl.innerText = '';
        statusEl.style.opacity = '1';
      } else {
        statusEl.style.opacity = opacity.toString();
      }
    }, 50);
  }, 1000);
}

function createSlowMotionEffect() {
  const slowMoOverlay = document.createElement('div');
  slowMoOverlay.style.position = 'fixed';
  slowMoOverlay.style.top = '0';
  slowMoOverlay.style.left = '0';
  slowMoOverlay.style.width = '100%';
  slowMoOverlay.style.height = '100%';
  slowMoOverlay.style.background = 'radial-gradient(circle, rgba(93,173,226,0.3), rgba(0,0,0,0.6))';
  slowMoOverlay.style.zIndex = '15';
  slowMoOverlay.style.pointerEvents = 'none';
  slowMoOverlay.style.animation = 'slowMoPulse 1.5s ease-in-out';
  document.body.appendChild(slowMoOverlay);
  setTimeout(() => { slowMoOverlay.remove(); }, 1500);
}

function createLevelUpEffects() {
  if (player && player.mesh && player.mesh.material && player.mesh.material.color) {
    const origColor  = player.mesh.material.color.getHex();
    const origScaleX = player.mesh.scale.x;
    const origScaleY = player.mesh.scale.y;
    const origScaleZ = player.mesh.scale.z;
    player.mesh.material.color.setHex(0xffffff);
    player.mesh.scale.set(origScaleX * 1.3, origScaleY * 1.3, origScaleZ * 1.3);
    setTimeout(() => {
      if (!player || !player.mesh || !player.mesh.material) return;
      player.mesh.material.color.setHex(origColor);
      player.mesh.scale.set(origScaleX, origScaleY, origScaleZ);
    }, 300);
  }
  const pos = player.mesh.position;
  if (window.BloodSystem) {
    window.BloodSystem.emitBurst(pos, 20, { spreadXZ:0.5,spreadY:1.4,minLife:60,maxLife:110,minSize:0.05,maxSize:0.12,color1:0x5DADE2,color2:0x85C1E9 });
    window.BloodSystem.emitBurst(pos, 10, { spreadXZ:0.35,spreadY:1.8,minLife:40,maxLife:75,minSize:0.03,maxSize:0.07,color1:0xDDF3FF,color2:0xFFFFFF });
    setTimeout(() => {
      if (!player || !player.mesh) return;
      window.BloodSystem.emitBurst(player.mesh.position, 12, { spreadXZ:0.25,spreadY:1.0,minLife:70,maxLife:120,minSize:0.04,maxSize:0.09,color1:0x1A8FC1,color2:0x5DADE2 });
    }, 150);
  } else {
    spawnParticles(pos, COLORS.player, 25);
    spawnParticles(pos, 0xFFFFFF, 8);
    spawnParticles(pos, 0x5DADE2, 15);
  }
}

class LightningBolt {
  constructor(start, end) {
    const points = [];
    const segments = 8;
    for(let i=0; i<=segments; i++) {
      const t = i / segments;
      const x = start.x + (end.x - start.x) * t + (Math.random() - 0.5) * 1.5;
      const y = start.y + (end.y - start.y) * t + (Math.random() - 0.5) * 1.5;
      const z = start.z + (end.z - start.z) * t + (Math.random() - 0.5) * 1.5;
      points.push(new THREE.Vector3(x, y, z));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 1, linewidth: 5 });
    this.mesh = new THREE.Line(geometry, material);
    scene.add(this.mesh);
    this.life = 20;
    this.maxLife = 20;
  }
  update() {
    this.life--;
    this.mesh.material.opacity = this.life / this.maxLife;
    if (this.life <= 0) {
      scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      return false;
    }
    return true;
  }
}

let floatingTextFadeInterval = null;
let floatingTextFadeTimeout = null;

function createFloatingText(text, pos, color) {
  const statusEl = document.getElementById('status-message');
  if (!statusEl) return;
  if (floatingTextFadeInterval) { clearInterval(floatingTextFadeInterval); floatingTextFadeInterval = null; }
  if (floatingTextFadeTimeout) { clearTimeout(floatingTextFadeTimeout); floatingTextFadeTimeout = null; }
  statusEl.innerText = text;
  statusEl.style.color = color || '#FF4444';
  statusEl.style.fontSize = '18px';
  statusEl.style.opacity = '1';
  floatingTextFadeTimeout = setTimeout(() => {
    let opacity = 1;
    floatingTextFadeInterval = setInterval(() => {
      opacity -= 0.05;
      if (opacity <= 0) {
        clearInterval(floatingTextFadeInterval);
        floatingTextFadeInterval = null;
        statusEl.innerText = '';
        statusEl.style.opacity = '1';
        statusEl.style.fontSize = '16px';
      } else {
        statusEl.style.opacity = opacity.toString();
      }
    }, 50);
  }, 4000);
}

// ============================================================
// Camp navigation proxy — must come after all function definitions
// ============================================================
(function() {
  var _orig = (typeof updateCampScreen === 'function') ? updateCampScreen : null;
  window.updateCampScreen = function() {
    if (!_orig) { console.warn('[CampWorld] updateCampScreen not yet available'); return; }
    try { _orig(); } catch(e) { console.error('[CampWorld] updateCampScreen error:', e); }
  };
})();
