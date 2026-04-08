// js/sandbox-loop.js — Sandbox game loop for Engine 2.0 testing.
// Spawns player + a single Slime dummy (respawns on death).
// Tests: Gun shooting → blood → dynamic EXP gem drops → pickup → Level-Up modal.
// All meshes use object pooling / InstancedMesh where available.
// Loaded LAST in sandbox.html, after all dependency scripts.

(function () {
  'use strict';

  // ─── Minimal stubs for functions from game-screens.js / game-loop.js ────────
  // These are only called optionally (e.g., evaporation effect, void gem FX).
  if (typeof spawnParticles === 'undefined') {
    window.spawnParticles = function (pos, color, count) {
      // Lightweight fallback: create tiny instanced spheres via dopamine if available
      if (window.DopamineSystem && window.DopamineSystem.spawnBurst) {
        window.DopamineSystem.spawnBurst(pos, color, count);
      }
    };
  }
  if (typeof createFloatingText === 'undefined') {
    // ── Pooled floating-text system: aggressive font, damage-scaled sizing, smooth fly-up ──
    const _FT_POOL_SIZE = 40;
    const _ftPool  = []; // available elements
    const _ftNDC   = { x: 0, y: 0 }; // reusable NDC projection (no new object)
    // Pre-allocate all floating-text divs once (called lazily on first use)
    function _ftInit() {
      if (_ftPool.length) return;
      const baseStyle = [
        'position:fixed',
        'pointer-events:none',
        'font-family:Impact,"Arial Black",Bangers,sans-serif',
        'font-weight:900',
        'letter-spacing:1px',
        'text-shadow:2px 2px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,0 0 8px rgba(0,0,0,0.7)',
        'z-index:9999',
        'will-change:transform,opacity',
        'display:none',
        'white-space:nowrap',
        'text-align:center',
        'transform-origin:center center',
      ].join(';');
      for (let _i = 0; _i < _FT_POOL_SIZE; _i++) {
        const _el = document.createElement('div');
        _el.style.cssText = baseStyle;
        document.body.appendChild(_el);
        _ftPool.push(_el);
      }
    }
    // Reusable Vector3 for world→screen projection (avoids new THREE.Vector3 per call)
    const _ftV3 = { x: 0, y: 0, z: 0, _v3: null }; // _v3 set after THREE loads
    /**
     * @param {string|number} text - Text to display
     * @param {object} pos - World position {x,y,z}
     * @param {string} color - CSS color
     * @param {number} [damageAmount=0] - Damage amount for size scaling (higher = bigger)
     */
    window.createFloatingText = function (text, pos, color, damageAmount) {
      _ftInit();
      const el = _ftPool.length ? _ftPool.pop() : null;
      if (!el) return; // pool exhausted — skip to avoid visual glitch
      el.textContent = text;
      el.style.color = color || '#FFD700';

      // Scale font size with damage: base 18px, sqrt scaling with damage, caps at 42px
      // sqrt(damage) * scale factor gives perceptible but not excessive growth
      const _DMG_FONT_SCALE = 1.8;
      const dmg = typeof damageAmount === 'number' ? damageAmount : 0;
      const fontSize = Math.min(42, Math.max(18, 18 + Math.sqrt(dmg) * _DMG_FONT_SCALE));
      el.style.fontSize = fontSize + 'px';

      el.style.transition = 'none';
      el.style.transform  = 'translate(-50%,-50%) scale(1.2)';
      el.style.opacity    = '1';
      // Project world→screen using pre-allocated Vector3
      let sx = window.innerWidth / 2, sy = window.innerHeight / 2;
      if (camera && renderer) {
        if (!_ftV3._v3) _ftV3._v3 = new THREE.Vector3();
        _ftV3._v3.set(pos.x, pos.y + 1, pos.z);
        _ftV3._v3.project(camera);
        sx = (_ftV3._v3.x * 0.5 + 0.5) * window.innerWidth;
        sy = (-_ftV3._v3.y * 0.5 + 0.5) * window.innerHeight;
      }
      // Add slight horizontal jitter for visual variety
      sx += (Math.random() - 0.5) * 30;
      el.style.left    = sx + 'px';
      el.style.top     = sy + 'px';
      el.style.display = 'block';
      requestAnimationFrame(function () {
        el.style.transition = 'transform 0.6s cubic-bezier(0.22,1,0.36,1),opacity 0.6s ease-out';
        el.style.transform  = 'translate(-50%,-50%) translateY(-70px) scale(0.7)';
        el.style.opacity    = '0';
      });
      setTimeout(function () {
        el.style.display    = 'none';
        el.style.transition = 'none';
        el.style.transform  = 'translate(-50%,-50%) scale(1.2)';
        el.style.opacity    = '1';
        _ftPool.push(el); // return to pool
      }, 650); // slightly after 0.6s transition to ensure animation completes
    };
  }
  if (typeof showYouDiedBanner === 'undefined') {
    window.showYouDiedBanner = function (duration) {
      duration = duration || 4500;
      const b = document.getElementById('you-died-banner');
      if (!b) return;
      // Populate stats if elements exist
      try {
        var t = document.getElementById('yd-time');
        var k = document.getElementById('yd-kills');
        var l = document.getElementById('yd-level');
        if (t && typeof _sandboxRunStartTime !== 'undefined' && _sandboxRunStartTime) {
          var secs = Math.floor((Date.now() - _sandboxRunStartTime) / 1000);
          t.textContent = secs >= 60 ? Math.floor(secs/60)+'m '+(secs%60)+'s' : secs+'s';
        }
        if (k && window.playerStats) k.textContent = window.playerStats.kills || 0;
        if (l && window.playerStats) l.textContent = window.playerStats.lvl || 1;
      } catch (e) {}
      b.style.display = 'none';
      b.offsetWidth; // reflow to restart CSS animation
      b.style.display = 'block';
      setTimeout(function () { b.style.display = 'none'; }, duration);
    };
  }
  if (typeof setGamePaused === 'undefined') {
    window.setGamePaused = function (p) { window.isPaused = !!p; };
  }
  // Always override forceGameUnpause in sandbox: game-screens.js is not loaded here,
  // so we provide a reliable version that resets window.isPaused directly.
  window.forceGameUnpause = function () {
    window.isPaused = false;
    // Also reset main.js overlay counter (accessible as global let in same page scope)
    try { pauseOverlayCount = 0; window.pauseOverlayCount = 0; } catch (_) {}
    if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
  };
  // ── Quest & companion stubs ──────────────────────────────────────────────────
  // progressTutorialQuest is exposed by camp-skill-system.js as window.progressTutorialQuest.
  // This no-op stub only activates if camp-skill-system.js hasn't loaded yet.
  if (typeof progressTutorialQuest === 'undefined' && typeof window.progressTutorialQuest === 'undefined') {
    window.progressTutorialQuest = function () {}; // fallback: camp-skill-system not loaded
  }
  if (typeof droneTurrets === 'undefined') {
    window.droneTurrets = [];
  }
  if (typeof startDroneHum === 'undefined') {
    window.startDroneHum = function () {};
  }
  if (typeof DroneTurret === 'undefined') {
    window.DroneTurret = function () { this.update = function(){}; };
  }
  if (typeof saveSaveData === 'undefined') {
    window.saveSaveData = function () {}; // no-op: no save system in sandbox
  }
  if (typeof loadSaveData === 'undefined') {
    window.loadSaveData = function () {};
  }
  if (typeof showUpgradeModal === 'undefined') {
    window.showUpgradeModal = function () {}; // fallback if level-up-system didn't load
  }
  if (typeof updateGoldDisplays === 'undefined') {
    window.updateGoldDisplays = function () {};
  }
  if (typeof showNarratorLine === 'undefined') {
    window.showNarratorLine = function () {};
  }
  if (typeof pushSuperStatEvent === 'undefined') {
    window.pushSuperStatEvent = function () {};
  }
  if (typeof showResourceToast === 'undefined') {
    window.showResourceToast = function () {};
  }
  if (typeof updateHUD === 'undefined') {
    window.updateHUD = function () {};
  }
  if (typeof showLiveStatNotification === 'undefined') {
    window.showLiveStatNotification = function () {};
  }
  if (typeof playSound === 'undefined') {
    window.playSound = function () {};
  }
  // ── Player Status Effect API ──────────────────────────────────────────────────
  // window.setPlayerStatusEffect(type, duration) — call from any damage system.
  // type: 'fire' | 'poison' | 'ice' | 'shock'
  // Updates the StatusBar CSS class and depletes the bar over `duration` seconds.
  (function () {
    var _statusContainer = null;
    var _statusFill = null;
    var _statusType = null;
    var _statusTimer = 0;
    var _statusDuration = 0;
    window.setPlayerStatusEffect = function (type, duration) {
      _statusContainer = document.getElementById('stamina-bar-container');
      _statusFill = document.getElementById('stamina-fill');
      if (!_statusContainer) return;
      // Remove old effect class
      _statusContainer.classList.remove('status-fire','status-poison','status-ice','status-shock');
      _statusType = type;
      _statusTimer = duration;
      _statusDuration = duration;
      if (type) _statusContainer.classList.add('status-' + type);
    };
    window.clearPlayerStatusEffect = function () {
      _statusType = null;
      _statusTimer = 0;
      var c = document.getElementById('stamina-bar-container');
      if (c) c.classList.remove('status-fire','status-poison','status-ice','status-shock');
      var f = document.getElementById('stamina-fill');
      if (f) f.style.width = '';
    };
    // Tick is called from the game loop (via addExp/updateHUD path) every frame
    window._tickPlayerStatus = function (dt) {
      if (!_statusType || _statusTimer <= 0) return;
      _statusTimer -= dt;
      if (_statusTimer <= 0) {
        window.clearPlayerStatusEffect();
      } else {
        var pct = (_statusTimer / _statusDuration) * 100;
        var f = _statusFill || document.getElementById('stamina-fill');
        if (f) f.style.width = Math.max(0, pct) + '%';
      }
    };
  }());
  // addExp — called by gem-classes.js ExpGem.collect() when a gem is picked up.
  // Handles EXP gain, HUD refresh, and level-up trigger.
  if (typeof window.addExp === 'undefined') {
    window.addExp = function (amount) {
      playerStats.exp += amount;
      _refreshExpBar();
      if (playerStats.exp >= playerStats.expReq) {
        playerStats.exp -= playerStats.expReq;
        playerStats.lvl++;
        // Soft early-game curve: L1→2 uses GAME_CONFIG.baseExpReq (45 XP, ~2–3 common gems),
        // then L2→3+ follow: 60 + 20*(lvl - 1)^1.3, balanced for ~65 max level.
        // L1→2: 45 XP (~2–3 gems) | L2→3: 80 XP (4 gems) | L3→4: ~109 (5–6 gems) | L10: ~356 | L65: ~4000
        playerStats.expReq = Math.floor(60 + 20 * Math.pow(playerStats.lvl - 1, 1.3));
        _onLevelUp();
      }
    };
  }
  // spawnWaterDroplet — called by player-class.js when HP < 25-30% (water bleed)
  // or during the dash ability.  Falls back to a simple one-frame particle burst.
  if (typeof spawnWaterDroplet === 'undefined') {
    window.spawnWaterDroplet = function (pos) {
      if (!pos) return;
      if (window.BloodSystem && typeof BloodSystem.emitWaterBurst === 'function') {
        BloodSystem.emitWaterBurst({ x: pos.x, y: pos.y, z: pos.z }, 1, { spreadXZ: 0.3, spreadY: 0.2 });
      }
    };
  }
  // gameOver — called by player-class.js when the player dies.  In the sandbox
  // we simply reload the page so the user can test again without a full game-over
  // screen from the main game (which requires systems not loaded here).
  if (typeof gameOver === 'undefined') {
    window.gameOver = function () {
      // Evaluate run quests before showing death screen (CHANGE 3) — pass endOfRun=true
      if (typeof _checkSandboxRunQuestProgress === 'function') _checkSandboxRunQuestProgress(true);
      // Track survival time and run bonus XP
      var _elapsedSec = _sandboxRunStartTime ? (Date.now() - _sandboxRunStartTime) / 1000 : 0;
      if (saveData && saveData.stats) saveData.stats.longestSurvivalTime = Math.max(saveData.stats.longestSurvivalTime || 0, _elapsedSec);
      var _runKills = playerStats ? (playerStats.kills || 0) : 0;
      var _runBonus = Math.min(50, Math.floor(_runKills * (1 + _elapsedSec / 60)));
      if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(_runBonus, 'Run End Bonus', saveData);
      if (typeof _checkSandboxAchievements === 'function') _checkSandboxAchievements();

      // Show YOU DIED banner with stats FIRST so player can read them
      if (typeof showYouDiedBanner === 'function') {
        showYouDiedBanner(GAME_OVER_RELOAD_DELAY_MS);
      } else {
        const b = document.getElementById('you-died-banner');
        if (b) b.style.display = 'block';
      }

      // Reset blood/gore systems after a short delay so the death scene stays visible briefly
      setTimeout(function () {
        if (window.BloodV2 && typeof window.BloodV2.reset === 'function') window.BloodV2.reset();
        if (window.GoreSim && typeof window.GoreSim.reset === 'function') window.GoreSim.reset();
        if (window.SlimePool && typeof window.SlimePool.reset === 'function') window.SlimePool.reset();
        if (window.WaveSpawner && typeof window.WaveSpawner.reset === 'function') window.WaveSpawner.reset();
        if (window.HitDetection && typeof window.HitDetection.reset === 'function') window.HitDetection.reset();
        if (window.LeapingSlimePool && typeof window.LeapingSlimePool.reset === 'function') window.LeapingSlimePool.reset();
        SeqWaveManager.reset();
        // Reset gold coins
        if (_goldPoolInited) {
          for (let _gi = 0; _gi < _goldPool.length; _gi++) {
            _goldPool[_gi].active = false;
            _goldPool[_gi].mesh.visible = false;
            _goldPool[_gi].mesh.position.set(0, -1000, 0);
          }
        }
      }, 800); // brief delay so blood/gore stays visible for dramatic effect

      // Reload page after the full delay
      setTimeout(function () { location.reload(); }, GAME_OVER_RELOAD_DELAY_MS);
    };
  }

  // ─── Minimal saveData stub (prevents null-checks in gem-classes / player) ───
  window.saveData = window.saveData || {
    gold: 0,
    totalGoldEarned: 0,
    cutGems: [],
    rawGems: {},
    weaponGemSlots: {},
    companionGemSlots: {},
    equippedGear: { weapon: 'gun' },
    companions: {},
    selectedCompanion: null,
    tutorialQuests: { currentQuest: null, readyToClaim: [], firstDeathShown: false, pendingBuildQuest: null, landmarksFound: null, mysteriousEggFound: false, killsThisRun: 0, firstBossDefeated: false },
    tutorial: { completed: true, currentStep: 'completed' },
    upgrades: { goldEarned: 0 },
    resources: { magicEssence: 0 },
    // Rage combat system
    rageMeter: 0,
    equippedSpecials: ['knifeTakedown'], // Currently equipped special attacks
    specialAttacksLoadout: ['knifeTakedown'], // Starting special attack (legacy)
    specialAttackLevels: { knifeTakedown: 1 },
    skillTree: {
      specialKnifeTakedown: { level: 1 } // Starting attack is unlocked
    },
    // Companion system
    hasCompanionEgg: false,
    companionEggHatched: false,
    companionEggHatchProgress: 0,
    companionGrowthStage: 'newborn',
    companionSkillPoints: 0,
  };

  window.gameSettings = window.gameSettings || {
    soundEnabled: false,
    musicEnabled: false,
    controlType: 'keyboard',
    quality: 'medium',
  };

  // ─── Constants ───────────────────────────────────────────────────────────────
  const GAME_OVER_RELOAD_DELAY_MS = 4500;    // ms to show "YOU DIED" + stats before page reload
  const SLIME_HP            = 80;
  const SLIME_SPEED         = 1.8;           // world units / second
  const SLIME_DAMAGE        = 22;            // contact damage per hit (brutally hard before upgrades)
  const PICKUP_RANGE        = 3.5;           // world units — magnetism pull starts here
  const MAGNETISM_SPEED     = 6.0;           // units/sec toward player while in range
  const ARENA_RADIUS        = 80;            // half of 200×200 arena
  const POOL_SIZE_PROJECTILES = 60;
  const PROJECTILE_SPEED    = 22;            // units/second
  const PROJECTILE_RANGE_SQ = 14 * 14;      // squared range (14 units)
  // Fallback enemy type index (BALANCED=2) used when enemies.js is not loaded
  const DEFAULT_ENEMY_TYPE  = 2;
  // Use ENEMY_TYPES from enemies.js if available, otherwise fall back to minimal stub
  const ENEMY_TYPES = window.ENEMY_TYPES || { BALANCED: DEFAULT_ENEMY_TYPE };
  // Converts walkSpeed display units → Three.js world units per frame
  // walkSpeed is a display value (25 = normal speed); factor tuned to match main game
  const MOVEMENT_TIME_SCALE  = 0.0042;
  // Half-width of the Slime HP bar plane (full width = 1.4, half = 0.7)
  const SLIME_HP_BAR_HALF_WIDTH = 0.7;
  // Enemy object pool
  const MAX_SLIMES          = 50;            // pre-allocated pool size
  const ESCALATION_INTERVAL = 30;           // seconds between difficulty increases
  // EXP gem object pool — pre-allocated so no new THREE.Mesh during gameplay
  const POOL_SIZE_GEMS      = 40;
  // Slime separation: minimum distance before soft push-apart force is applied
  const SLIME_SEPARATION_DIST  = 2.2;      // world units (increased from 1.6 to prevent overlapping)
  const SLIME_SEPARATION_FORCE = 2.5;      // push strength (units/sec) (increased from 1.0 for stronger separation)
  // XP gem drop rate bonus — probability of spawning an extra star on every enemy kill
  // ── INCREASED BY 15%: was 0.15 (15%), now 0.1725 (17.25%) ──
  const BONUS_XP_DROP_RATE = 0.1725; // 17.25% chance for a bonus star per kill (+15% increase)

  // XP magnetism range - used by ExpGem class for pickup
  magnetRange = 4.0; // Base magnetism range (world units) — uses global from main.js

  // Minimal HP bar updater (prevents missing function errors, stores hp ratio for future UI hooks)
  function _updateSlimeHPBar(slot) {
    if (!slot) return;
    const max = slot.maxHp || SLIME_HP;
    slot._hpRatio = max > 0 ? Math.max(0, Math.min(1, slot.hp / max)) : 0;
  }

  // ─── Game-feel tuning constants ──────────────────────────────────────────────
  const HIT_STOP_KILL_DURATION_MS  = 12;   // ms to freeze simulation on kill (impactful feel)
  const SHAKE_DURATION_SCALE       = 0.2;  // intensity × this = shake duration in seconds
  const SHAKE_FADE_RATE            = 6;    // amplitude fade multiplier (higher = faster fade)
  const SHAKE_HEAVY_HP_THRESHOLD   = 0.25; // hp fraction below which hits count as "heavy"
  const SHAKE_MID_HP_THRESHOLD     = 0.5;  // hp fraction for mid-tier shake
  const SHAKE_HEAVY_INTENSITY      = 0.28; // world-unit shake radius for heavy hits
  const SHAKE_MID_INTENSITY        = 0.18; // world-unit shake radius for mid hits
  const SHAKE_LIGHT_INTENSITY      = 0.10; // world-unit shake radius for light hits
  const SHAKE_KILL_BASE            = 0.35; // base shake radius on kill
  const SHAKE_KILL_SCALE           = 0.15; // per-unit-of-hitForce extra shake on kill
  const SHAKE_KILL_CAP             = 0.25; // max extra shake added from hitForce
  const COLLISION_QUERY_RADIUS     = 2.0;  // spatial hash query radius (world units)
  const COLLISION_THRESHOLD_SQ     = 1.2;  // squared distance for projectile→slime hit
  const MIN_FLASH_DURATION_SEC     = 0.001; // clamp floor for flash timer (avoids div/0)
  const DEFAULT_FLASH_COLOR        = 0xFFFF88; // fallback muzzle flash colour
  const DEFAULT_FLASH_INTENSITY    = 4.0;      // fallback PointLight intensity
  const DEFAULT_FLASH_RADIUS       = 8;        // fallback PointLight range (world units)
  const DEFAULT_FLASH_DURATION_MS  = 80;       // fallback flash duration in ms

  // ─── Module state ────────────────────────────────────────────────────────────
  let _ready    = false;
  let _lastTime = 0;
  let _rafId    = null;
  // Enemy pool (replaces single _slime)
  let _enemyPool    = [];          // pre-allocated pool of MAX_SLIMES slime objects
  let _activeSlimes = [];          // live list of currently active pool slots (fast iteration)
  let _maxActive    = 5;           // current max simultaneous active slimes
  let _waveSize     = 3;           // number of slimes to spawn per wave (Survivor-style)
  let _spawnTimer   = 1.5;         // seconds until next wave spawn
  let _spawnInterval = 4.0;        // seconds between wave spawns (decreases over time)
  let _escalationTimer = ESCALATION_INTERVAL; // seconds until next difficulty escalation
  let _allFleshChunks = [];        // global flying flesh chunk list (from all pool slots)
  let _activeCrawlers = [];        // live list of active crawler enemies
  let _activeLeapingSlimes = [];   // live list of active leaping slime enemies
  let _activeSkinwalkers = [];     // live list of active skinwalker enemies
  let _projPool = [];              // reusable projectile objects
  let _projPoolGeo = null;         // shared geometry for pool slots (set once in _buildProjectilePool)
  let _projPoolNextIdx = 0;        // ring-cursor for O(1) free-slot lookup (avoids full-array scan)
  let _activeProjList = [];        // currently flying projectiles
  let _animateErrorShown = false;  // prevent spamming error display every frame
  // EXP gem object pool (pre-allocated ExpGem instances, no new THREE.Mesh during gameplay)
  let _expGemPool     = [];        // all pre-allocated gem slots
  let _expGemFreeList = [];        // slots available for reuse
  // Sword melee cooldown (sandbox double-barrel / sword fire timer)
  let _swordCooldown = 0;
  // Active weapon effect timers (for unlocked weapons in sandbox)
  let _swordEffectCooldown = 0;  // sword slash cooldown
  let _auraEffectTimer    = 0;   // aura damage tick
  // Timers for all additional active weapons (values in ms, matching weapon cooldown units)
  let _uziTimer           = 0;
  let _minigunTimer       = 0;
  let _bowTimer           = 0;
  let _sniperTimer        = 0;
  let _pumpShotgunTimer   = 0;
  let _autoShotgunTimer   = 0;
  let _doubleBarrelTimer  = 0;
  let _iceSpearTimer      = 0;
  let _fireRingTimer      = 0;
  let _fireRingAngle      = 0;   // running rotation angle for fire-ring orbs (radians)
  let _lightningTimer     = 0;
  let _meteorTimer        = 0;
  let _teslaSaberTimer    = 0;
  let _whipTimer          = 0;
  let _boomerangTimer     = 0;
  let _shurikenTimer      = 0;
  let _nanoSwarmTimer     = 0;
  let _homingMissileTimer = 0;
  let _poisonTimer        = 0;
  let _fireballTimer      = 0;
  // Mobile detection: shared module-level flag so _applyGraphicsQuality() (called from
  // settings UI as well as _initScene) can reference it without a ReferenceError.
  // High-DPI mobile screens (e.g. iPhone 16) have devicePixelRatio ≥ 3, causing the GPU
  // to render the post-processing chain at near-4K resolution and tanking frame rate.
  const _isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 1);

  // Pre-allocated scratch array for combining enemy lists without GC allocation
  const _allEnemiesScratch = [];
  // ─── Gore: Corpse Linger System ──────────────────────────────────────────────
  // Corpses linger 5-8 seconds after death with heartbeat blood pumping.
  const _activeCorpses = [];       // { slot, timer, lingerDuration, bloodTimer, poolMesh, poolMat, poolSlot }

  // ─── Corpse Blood Pool ────────────────────────────────────────────────────────
  const CORPSE_BLOOD_POOL_SIZE = 30;
  const _corpseBloodPool = [];
  const _corpseBloodFreeList = [];  // free-list: contains unused slot objects

  // Pre-allocated reusable Vector3 objects — ZERO new THREE.Vector3() during gameplay
  // Declared as plain objects first; upgraded to THREE.Vector3 after THREE is available
  // (THREE loads before sandbox-loop.js, so they become real Vector3s at IIFE boot time)
  let _tmpV3  = null; // general-purpose temp vector (set in _initScene)
  let _tmpV3b = null; // second reusable temp vector (set in _initScene)
  let _leapHitNormal = null; // scratch for leaping slime hit normal (no per-hit allocation)
  let _leapBulletDir = null; // scratch for leaping slime bullet direction (no per-hit allocation)

  // Reusable world-space position object for blood emission (avoids new {} per hit)
  const _reusableBloodPos = { x: 0, y: 0, z: 0 };

  // ─── Invisible enemy safety net timer ────────────────────────────────────────
  let _visibilityCheckTimer = 0;
  const MIN_VISIBLE_Y_THRESHOLD = -50; // Enemies below this Y are intentionally hidden (pooled/underground)
  const DEATH_ANIMATION_TIMEOUT_MS = 5000; // Force-remove skinwalker if death animation stalls longer than this

  // ─── Spatial Hashing ─────────────────────────────────────────────────────────
  // SpatialHash instance for O(1) projectile→enemy collision queries.
  // Replaces the O(n²) inner loop in _updateProjectiles when available.
  let _enemySpatialHash = null;

  // ─── Hit-Stop (Time Freeze) ───────────────────────────────────────────────────
  // When >0, the simulation is frozen for this many milliseconds.
  // The renderer still draws so the visual "freeze frame" is visible.
  let _hitStopRemaining = 0;

  // ─── Screen Shake ─────────────────────────────────────────────────────────────
  let _shakeTimer         = 0;    // seconds remaining in current shake
  let _shakePeakIntensity = 0;    // peak shake radius (world units)
  const _shakeOffset = { x: 0, z: 0 }; // applied to camera each frame

  // ─── Kill Combo System ───────────────────────────────────────────────────────
  let _killCombo      = 0;    // current combo count
  let _killComboTimer = 0;    // countdown before combo resets (seconds)

  // ─── Level-Up Shockwave Rings (pooled: pre-allocated once, reused) ──────────
  let _lvlUpRings = [];       // active expanding ring meshes (references into _lvlUpRingPool)
  const _lvlUpRingPool = [];  // pre-allocated ring meshes (pool size = _ringDefs.length, never disposed)
  let _lvlUpRingsInited = false;

  // ─── Gold Coin Drop System ───────────────────────────────────────────────────
  // Pooled gold coin meshes that drop from enemies and are collected by the player.
  const GOLD_POOL_SIZE     = 40;
  const GOLD_MAGNET_RANGE  = 4.0;   // World units; scales with pickupRange upgrades
  const GOLD_COLLECT_RANGE = 0.9;
  const GOLD_DROP_CHANCE   = 0.22;  // 22% chance per enemy kill to drop gold
  const GOLD_AMOUNT_MIN    = 1;
  const GOLD_AMOUNT_MAX    = 4;
  let _goldPool = [];          // { mesh, active, vx, vy, vz, onGround, value, bounceCount }
  let _goldPoolInited = false;

  // ─── Blood Moon Event State ───────────────────────────────────────────────────
  let _bloodMoonActive      = false;
  let _bloodMoonTimer       = 0;     // seconds remaining
  const BLOOD_MOON_DURATION = 60;    // 60 seconds of hell
  const BLOOD_MOON_SPEED_MULT  = 2;  // enemies move 2× faster
  const BLOOD_MOON_DAMAGE_MULT = 2;  // enemies deal 2× damage

  // ─── Session Timer (CHANGE 12) ───────────────────────────────────────────────
  let _sessionTimerSecs    = 0; // total elapsed seconds since boot
  let _sessionTimerAccum   = 0; // accumulator for 1-second updates

  // ─── Run Quest Tracking (CHANGE 1) ───────────────────────────────────────────
  let _sandboxRunKills    = 0; // kills this run (for quest tracking)
  let _sandboxRunStartTime = 0; // Date.now() at run start (for survival quests)
  let _xpMagnetRunStacks  = 0; // XP magnet upgrade stacks this run

  // ─── Damage Number Pool (CHANGE 8) ───────────────────────────────────────────
  let _dmgNumPool = null; // lazy-init pool of span elements

  // ─── Pooled PointLight Flash System ──────────────────────────────────────────
  // Pre-allocated PointLights for muzzle flashes / hit lights.  Zero new THREE.PointLight
  // after _buildFlashPool() is called.  Exposed as window._acquireFlash for
  // muzzle-flash-system.js to use.
  const FLASH_POOL_SIZE = 8;
  let _flashPool = [];

  // Joystick state (mobile)
  const _joy    = { dx: 0, dz: 0, active: false, id: -1, startX: 0, startZ: 0 };
  const _aimJoy = { dx: 0, dz: 0, active: false, id: -1, startX: 0, startZ: 0, fired: false };

  // Mouse aim state (desktop)
  const _mouse = { worldX: 0, worldZ: 0 };

  // ─── Weather Particle System ──────────────────────────────────────────────────
  var _weatherParticles = null;
  var _weatherGeo = null;
  var _weatherMat = null;
  var _weatherPositions = null;
  var _weatherVelocities = [];
  var _weatherActive = true;
  var WEATHER_COUNT = 800;
  var _weatherFrameCounter = 0;

  // ─── Sky Color Day/Night Cycle ────────────────────────────────────────────────
  var _skyTime = 0.25; // Start at "morning" (0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset)
  var _skySpeed = 0.008; // Full day cycle in ~125 seconds
  // Motion blur damping constant — shared by AfterImagePass setup and quality toggle.
  // Higher value = more persistent trail; 0 = no motion blur; 1 = infinite smear.
  var MOTION_BLUR_DAMP = 0.87;
  var _skyColors = [
    { time: 0.0,  sky: 0x0a0a1a, fog: 0x0a0a1a, ambInt: 0.15, sunInt: 0.2  },  // Midnight
    { time: 0.2,  sky: 0x1a1025, fog: 0x1a1025, ambInt: 0.2,  sunInt: 0.4  },  // Pre-dawn
    { time: 0.3,  sky: 0xff7744, fog: 0x553322, ambInt: 0.35, sunInt: 0.8  },  // Sunrise
    { time: 0.4,  sky: 0x5588cc, fog: 0x334466, ambInt: 0.4,  sunInt: 1.0  },  // Morning
    { time: 0.5,  sky: 0x4499ee, fog: 0x2a4466, ambInt: 0.45, sunInt: 1.2  },  // Noon
    { time: 0.65, sky: 0x5588cc, fog: 0x334466, ambInt: 0.4,  sunInt: 1.0  },  // Afternoon
    { time: 0.75, sky: 0xff6633, fog: 0x442211, ambInt: 0.3,  sunInt: 0.6  },  // Sunset
    { time: 0.85, sky: 0x1a1030, fog: 0x1a1030, ambInt: 0.2,  sunInt: 0.3  },  // Dusk
    { time: 1.0,  sky: 0x0a0a1a, fog: 0x0a0a1a, ambInt: 0.15, sunInt: 0.2  },  // Midnight (loop)
  ];
  // Reusable THREE.Color instances to avoid per-frame allocations in _updateSkyCycle.
  // Initialized lazily on first call so THREE is guaranteed to be loaded.
  var _skyColA = null;  // lerp source sky color
  var _skyColB = null;  // lerp target sky color
  var _fogColA = null;  // lerp source fog color
  var _fogColB = null;  // lerp target fog color

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ─── Eye of Horus Notification Shrine ────────────────────────────────────────
  // Permanent widget fixed at top-center. Crown is always visible; curtain
  // rolls down from behind the crown when a notification fires.
  var _notifTimeout      = null;
  var _notifCloseTimeout = null;

  function _buildHorusShrine() {
    // Container
    var shrine = document.createElement('div');
    shrine.id = 'horus-shrine';
    shrine.style.cssText = [
      'position:fixed',
      'top:4px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:9500',
      'pointer-events:none',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'width:180px',
    ].join(';');

    // Crown (always visible)
    var crown = document.createElement('div');
    crown.id = 'horus-crown';
    crown.style.cssText = [
      'width:52px',
      'height:52px',
      'background:linear-gradient(135deg,rgba(12,8,2,0.97),rgba(28,20,4,0.97))',
      'border:2px solid rgba(212,175,55,0.65)',
      'border-radius:14px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.85),0 0 10px rgba(212,175,55,0.12)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'position:relative',
      'z-index:1',
    ].join(';');

    // Eye of Horus SVG
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '38');
    svg.setAttribute('height', '38');
    svg.setAttribute('viewBox', '0 0 52 52');

    var defs = document.createElementNS(svgNS, 'defs');
    // Radial gradient for glow
    var radGrad = document.createElementNS(svgNS, 'radialGradient');
    radGrad.setAttribute('id', 'horus-glow');
    radGrad.setAttribute('cx', '50%');
    radGrad.setAttribute('cy', '50%');
    radGrad.setAttribute('r', '50%');
    var stop1 = document.createElementNS(svgNS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', 'rgb(255,215,0)');
    stop1.setAttribute('stop-opacity', '0.4');
    var stop2 = document.createElementNS(svgNS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', 'rgb(212,130,0)');
    stop2.setAttribute('stop-opacity', '0');
    radGrad.appendChild(stop1);
    radGrad.appendChild(stop2);
    // Filter for blur
    var filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', 'eye-filter');
    var blur = document.createElementNS(svgNS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '1.2');
    filter.appendChild(blur);
    defs.appendChild(radGrad);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // 10. Subtle glow circle — appended right after defs so it paints behind all eye shapes
    var glowCircle = document.createElementNS(svgNS, 'circle');
    glowCircle.setAttribute('cx', '26');
    glowCircle.setAttribute('cy', '26');
    glowCircle.setAttribute('r', '18');
    glowCircle.setAttribute('fill', 'url(#horus-glow)');
    glowCircle.setAttribute('opacity', '0.4');
    svg.appendChild(glowCircle);

    // 1. Gold outer almond eye shape (glow outline)
    var outerAlmond = document.createElementNS(svgNS, 'path');
    outerAlmond.setAttribute('d', 'M8,26 C14,14 38,14 44,26 C38,38 14,38 8,26 Z');
    outerAlmond.setAttribute('fill', 'none');
    outerAlmond.setAttribute('stroke', 'url(#horus-glow)');
    outerAlmond.setAttribute('stroke-width', '1.5');
    outerAlmond.setAttribute('opacity', '0.35');
    svg.appendChild(outerAlmond);

    // 2. Main eye white (filled almond)
    var eyeWhite = document.createElementNS(svgNS, 'path');
    eyeWhite.setAttribute('d', 'M8,26 C14,14 38,14 44,26 C38,38 14,38 8,26 Z');
    eyeWhite.setAttribute('fill', 'rgba(255,245,220,0.08)');
    eyeWhite.setAttribute('stroke', 'rgba(212,175,55,0.9)');
    eyeWhite.setAttribute('stroke-width', '1.8');
    svg.appendChild(eyeWhite);

    // 3. Iris
    var iris = document.createElementNS(svgNS, 'circle');
    iris.setAttribute('cx', '26');
    iris.setAttribute('cy', '26');
    iris.setAttribute('r', '7.5');
    iris.setAttribute('fill', 'rgba(20,12,2,0.95)');
    iris.setAttribute('stroke', 'rgba(212,175,55,0.7)');
    iris.setAttribute('stroke-width', '1.5');
    svg.appendChild(iris);

    // 4. Pupil (animated via CSS class)
    var pupil = document.createElementNS(svgNS, 'circle');
    pupil.setAttribute('cx', '26');
    pupil.setAttribute('cy', '26');
    pupil.setAttribute('r', '3.5');
    pupil.setAttribute('fill', 'rgba(212,175,55,0.95)');
    pupil.setAttribute('filter', 'url(#eye-filter)');
    pupil.setAttribute('class', 'horus-pupil');
    svg.appendChild(pupil);

    // 5. Inner gold sparkle
    var sparkle = document.createElementNS(svgNS, 'circle');
    sparkle.setAttribute('cx', '26');
    sparkle.setAttribute('cy', '26');
    sparkle.setAttribute('r', '1.2');
    sparkle.setAttribute('fill', 'white');
    sparkle.setAttribute('opacity', '0.9');
    svg.appendChild(sparkle);

    // 6. Upper lash line
    var lashLine = document.createElementNS(svgNS, 'path');
    lashLine.setAttribute('d', 'M8,26 Q26,10 44,26');
    lashLine.setAttribute('fill', 'none');
    lashLine.setAttribute('stroke', 'rgba(212,175,55,0.6)');
    lashLine.setAttribute('stroke-width', '1');
    svg.appendChild(lashLine);

    // 7. Lower classic Horus cheek mark
    var cheekMark = document.createElementNS(svgNS, 'path');
    cheekMark.setAttribute('d', 'M26,33 L18,44 C17,45 16,46 16,46');
    cheekMark.setAttribute('fill', 'none');
    cheekMark.setAttribute('stroke', 'rgba(212,175,55,0.8)');
    cheekMark.setAttribute('stroke-width', '1.8');
    cheekMark.setAttribute('stroke-linecap', 'round');
    svg.appendChild(cheekMark);

    // 8. Second cheek flourish
    var cheekFlourish = document.createElementNS(svgNS, 'path');
    cheekFlourish.setAttribute('d', 'M26,33 L22,42 L20,45');
    cheekFlourish.setAttribute('fill', 'none');
    cheekFlourish.setAttribute('stroke', 'rgba(180,140,30,0.5)');
    cheekFlourish.setAttribute('stroke-width', '1');
    cheekFlourish.setAttribute('stroke-linecap', 'round');
    svg.appendChild(cheekFlourish);

    // 9. Decorative dot
    var dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', '14');
    dot.setAttribute('cy', '45');
    dot.setAttribute('r', '1.2');
    dot.setAttribute('fill', 'rgba(212,175,55,0.6)');
    svg.appendChild(dot);

    crown.appendChild(svg);
    shrine.appendChild(crown);

    // Curtain (rolls down on notification)
    var curtain = document.createElement('div');
    curtain.id = 'horus-curtain';
    curtain.style.cssText = [
      'width:164px',
      'max-height:0px',
      'overflow:hidden',
      'transition:max-height 0.38s cubic-bezier(0.22,1,0.36,1),opacity 0.18s ease 0.15s',
      'background:linear-gradient(180deg,rgba(10,6,1,0.98),rgba(18,12,2,0.98))',
      'border:1.5px solid rgba(212,175,55,0.55)',
      'border-radius:10px',
      'box-shadow:0 8px 28px rgba(0,0,0,0.9),0 0 16px rgba(212,175,55,0.08)',
      'position:relative',
      'z-index:1',
      'opacity:0',
      'margin-top:3px',
      'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
    ].join(';');

    // Top accent line
    var accentLine = document.createElement('div');
    accentLine.style.cssText = [
      'width:60%',
      'height:1px',
      'background:linear-gradient(90deg,transparent,rgba(212,175,55,0.6),transparent)',
      'margin:0 auto 8px auto',
    ].join(';');
    curtain.appendChild(accentLine);

    // Text area
    var textEl = document.createElement('div');
    textEl.id = 'horus-text';
    textEl.style.cssText = [
      'padding:10px 14px 14px',
      'font-family:Cinzel,Georgia,serif',
      'font-size:12px',
      'font-weight:500',
      'letter-spacing:2.5px',
      'text-align:center',
      'color:rgba(212,175,55,0.92)',
      'text-shadow:0 0 8px rgba(212,175,55,0.4)',
      'line-height:1.5',
      'text-transform:uppercase',
      'min-height:32px',
      'word-break:break-word',
    ].join(';');
    curtain.appendChild(textEl);

    // Decorative corner marks
    var cornerL = document.createElement('span');
    cornerL.style.cssText = 'position:absolute;bottom:6px;left:8px;font-size:8px;color:rgba(212,175,55,0.3);';
    cornerL.textContent = '[';
    var cornerR = document.createElement('span');
    cornerR.style.cssText = 'position:absolute;bottom:6px;right:8px;font-size:8px;color:rgba(212,175,55,0.3);';
    cornerR.textContent = ']';
    curtain.appendChild(cornerL);
    curtain.appendChild(cornerR);

    shrine.appendChild(curtain);
    document.body.appendChild(shrine);
  }

  function _showWaveNotification(text, color, durationMs) {
    if (!document.getElementById('horus-shrine')) {
      _buildHorusShrine();
    }
    var curtain = document.getElementById('horus-curtain');
    var textEl  = document.getElementById('horus-text');
    if (!curtain || !textEl) return;

    textEl.textContent = text;
    // Apply color only if it's not white (white looks bad against the gold bg)
    if (color && color !== '#ffffff' && color !== 'white' && color !== 'rgb(255,255,255)') {
      textEl.style.color = color;
    } else {
      textEl.style.color = 'rgba(212,175,55,0.92)';
    }

    clearTimeout(_notifTimeout);
    clearTimeout(_notifCloseTimeout);

    // Open curtain: make visible then expand
    curtain.style.transition = 'max-height 0.38s cubic-bezier(0.22,1,0.36,1),opacity 0.15s ease';
    curtain.style.opacity = '1';
    curtain.style.maxHeight = '80px';

    _notifTimeout = setTimeout(function() {
      // Close: fade text first, then roll up curtain
      curtain.style.transition = 'max-height 0.38s cubic-bezier(0.22,1,0.36,1),opacity 0.2s ease';
      curtain.style.opacity = '0';
      _notifCloseTimeout = setTimeout(function() {
        curtain.style.maxHeight = '0px';
      }, 200);
    }, durationMs || 2800);
  }

  // Display an error message on-screen so mobile users can see what went wrong.
  function _showError(msg) {
    console.error('[SandboxLoop]', msg);
    // Try #status-message first, then #tutorial-text as fallback
    const el = document.getElementById('status-message') || document.getElementById('tutorial-text');
    if (el) {
      el.style.display = 'block';
      el.style.color   = '#FF4444';
      el.style.background = 'rgba(0,0,0,0.85)';
      el.style.padding = '8px 12px';
      el.style.borderRadius = '8px';
      el.style.zIndex = '99999';
      el.style.position = 'fixed';
      el.style.top = '50%';
      el.style.left = '50%';
      el.style.transform = 'translate(-50%,-50%)';
      el.style.maxWidth = '90vw';
      el.style.fontSize = '14px';
      el.style.fontFamily = 'monospace';
      el.style.wordBreak = 'break-word';
      el.textContent = '⚠ Sandbox Error: ' + msg;
    }
  }

  // ─── Spatial Hash helpers ────────────────────────────────────────────────────

  /** Create the enemy spatial hash if the GamePerformance utility is loaded. */
  function _initSpatialHash() {
    if (window.GamePerformance && window.GamePerformance.SpatialHash) {
      _enemySpatialHash = new window.GamePerformance.SpatialHash(4); // 4-unit cells
      console.log('[SandboxLoop] Spatial hash initialized (cell size: 4)');
    }
  }

  /**
   * Re-insert every active slime into the spatial hash so projectile collision
   * queries are O(1) per projectile instead of O(n).  Call once per frame,
   * before _updateProjectiles.
   */
  function _rebuildSpatialHash() {
    if (!_enemySpatialHash) return;
    if (_activeSlimes.length === 0 && _activeCrawlers.length === 0 && _activeLeapingSlimes.length === 0) return;
    _enemySpatialHash.clear();
    for (let i = 0; i < _activeSlimes.length; i++) {
      _enemySpatialHash.insert(_activeSlimes[i]);
    }
    // Also insert active crawlers into spatial hash for collision detection
    for (let i = 0; i < _activeCrawlers.length; i++) {
      _enemySpatialHash.insert(_activeCrawlers[i]);
    }
    // Also insert active leaping slimes into spatial hash
    for (let i = 0; i < _activeLeapingSlimes.length; i++) {
      _enemySpatialHash.insert(_activeLeapingSlimes[i]);
    }
  }

  // ─── Hit-Stop & Screen Shake helpers ─────────────────────────────────────────

  /**
   * Freeze the simulation for `ms` milliseconds (renders but no updates).
   * Concurrent calls extend the freeze only if the new duration is longer.
   */
  function _triggerHitStop(ms) {
    if (ms > _hitStopRemaining) _hitStopRemaining = ms;
  }

  /**
   * Trigger a camera shake.  `intensity` is in world units — small hits pass ~0.12,
   * kills pass ~0.35.  Duration auto-scales so bigger hits shake longer.
   * @param {number} intensity - Shake radius in world units.
   * @param {number} [minDuration=0] - Optional minimum duration in seconds.
   */
  function _triggerShake(intensity, minDuration) {
    const duration = Math.max(minDuration || 0, Math.min(0.5, intensity * SHAKE_DURATION_SCALE));
    if (intensity > _shakePeakIntensity) _shakePeakIntensity = intensity;
    if (duration > _shakeTimer) _shakeTimer = duration;
  }

  /** Advance the shake state each frame; writes into _shakeOffset. */
  function _updateCameraShake(dt) {
    if (_shakeTimer <= 0) {
      _shakeTimer = 0;
      _shakePeakIntensity = 0;
      _shakeOffset.x = 0;
      _shakeOffset.z = 0;
      return;
    }
    _shakeTimer = Math.max(0, _shakeTimer - dt);
    // Amplitude fades linearly as timer runs out
    const amp = _shakePeakIntensity * Math.min(1, _shakeTimer * SHAKE_FADE_RATE);
    _shakeOffset.x = (Math.random() * 2 - 1) * amp;
    _shakeOffset.z = (Math.random() * 2 - 1) * amp;
  }

  // ─── Kill Combo helpers ───────────────────────────────────────────────────────
  function _incrementKillCombo() {
    _killCombo++;
    _killComboTimer = 2.5;
    _updateKillComboDisplay();
  }

  function _updateKillComboDisplay() {
    var el = document.getElementById('kill-combo-display');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kill-combo-display';
      el.style.cssText = [
        'position:fixed',
        'bottom:120px',
        'left:50%',
        'transform:translateX(-50%)',
        'font-family:Bangers,cursive',
        'font-size:24px',
        'color:rgba(255,215,55,0.95)',
        'text-shadow:0 0 10px rgba(220,30,0,0.8)',
        'pointer-events:none',
        'z-index:9999',
        'transition:opacity 0.3s ease',
        'opacity:0',
      ].join(';');
      document.body.appendChild(el);
    }
    if (_killCombo < 2) {
      el.style.opacity = '0';
      return;
    }
    el.style.opacity = '1';
    var fontSize = Math.min(48, 24 + (_killCombo - 1) * 1.5);
    el.style.fontSize = fontSize + 'px';
    el.textContent = _killCombo + 'x COMBO';
    if (_killCombo >= 5) {
      el.style.animation = 'combo-pulse 0.4s ease-in-out infinite alternate';
      if (!document.getElementById('combo-pulse-style')) {
        var style = document.createElement('style');
        style.id = 'combo-pulse-style';
        style.textContent = '@keyframes combo-pulse{from{text-shadow:0 0 12px red}to{text-shadow:0 0 28px red,0 0 8px #ff6666}}';
        document.head.appendChild(style);
      }
    } else {
      el.style.animation = '';
    }
  }

  function _updateComboVignette() {
    if (_killCombo >= 5) {
      var v = document.getElementById('combo-vignette');
      if (!v) {
        v = document.createElement('div');
        v.id = 'combo-vignette';
        v.style.cssText = [
          'position:fixed',
          'top:0',
          'left:0',
          'width:100%',
          'height:100%',
          'pointer-events:none',
          'z-index:9998',
          'background:radial-gradient(ellipse at center, transparent 50%, rgba(160,0,0,0.3) 100%)',
          'transition:opacity 0.3s ease',
        ].join(';');
        document.body.appendChild(v);
      }
      v.style.opacity = String(Math.min(0.7, (_killCombo - 4) * 0.12));
    } else {
      var v = document.getElementById('combo-vignette');
      if (v) v.style.opacity = '0';
    }
  }

  // ─── Wave Flash helper ────────────────────────────────────────────────────────
  function _triggerWaveFlash() {
    var fl = document.getElementById('wave-flash');
    if (!fl) {
      fl = document.createElement('div');
      fl.id = 'wave-flash';
      fl.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'width:100%',
        'height:100%',
        'background:white',
        'pointer-events:none',
        'z-index:10000',
        'opacity:0',
      ].join(';');
      document.body.appendChild(fl);
    }
    fl.style.transition = 'none';
    fl.style.opacity = '0.35';
    requestAnimationFrame(function() {
      fl.style.transition = 'opacity 0.5s ease';
      requestAnimationFrame(function() {
        fl.style.opacity = '0';
      });
    });
  }

  // ─── Damage Number Pool helpers ───────────────────────────────────────────────
  function _initDmgNumPool() {
    if (_dmgNumPool) return;
    _dmgNumPool = [];
    for (var i = 0; i < 20; i++) {
      var sp = document.createElement('span');
      sp.className = 'damage-number';
      sp.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'font-weight:bold',
        'font-size:18px',
        'text-shadow:1px 1px 3px black',
        'z-index:9997',
        'opacity:0',
        'display:none',
        'transition:opacity 0.6s ease',
        'user-select:none',
      ].join(';');
      document.body.appendChild(sp);
      _dmgNumPool.push(sp);
    }
  }

  function _showDamageNumber(worldX, worldY, worldZ, amount, isKill, isCrit) {
    if (!camera || !renderer) return;
    _initDmgNumPool();
    // Find a free span
    var sp = null;
    for (var i = 0; i < _dmgNumPool.length; i++) {
      if (parseFloat(_dmgNumPool[i].style.opacity) <= 0 || _dmgNumPool[i].style.display === 'none') {
        sp = _dmgNumPool[i];
        break;
      }
    }
    if (!sp) return;
    if (!_tmpV3b) return; // scene not yet initialized
    // Project world position to screen — reuse _tmpV3b to avoid new THREE.Vector3 allocation
    _tmpV3b.set(worldX, worldY + 1.0, worldZ);
    _tmpV3b.project(camera);
    var sx = (_tmpV3b.x * 0.5 + 0.5) * window.innerWidth;
    var sy = (-_tmpV3b.y * 0.5 + 0.5) * window.innerHeight;
    // Color based on type
    var color = isKill ? '#ff4444' : (isCrit ? '#ffdd00' : '#ffffff');
    sp.textContent = String(amount);
    sp.style.color = color;
    sp.style.left = sx + 'px';
    sp.style.top = sy + 'px';
    sp.style.display = 'block';
    sp.style.transition = 'none';
    sp.style.opacity = '1';
    sp.style.transform = 'translateX(-50%)';
    // Start animation: float up and fade
    var startY = sy;
    var _sp = sp;
    requestAnimationFrame(function() {
      _sp.style.transition = 'opacity 0.6s ease, top 0.6s ease';
      _sp.style.opacity = '0';
      _sp.style.top = (startY - 40) + 'px';
    });
    setTimeout(function() {
      _sp.style.display = 'none';
      _sp.style.transition = 'none';
    }, 650);
  }

  // ─── Persistent HUD elements (kill count + session timer) ────────────────────
  function _initPersistentHUD() {
    if (!document.getElementById('hud-kill-count')) {
      var kc = document.createElement('div');
      kc.id = 'hud-kill-count';
      kc.style.cssText = [
        'position:fixed',
        'top:14px',
        'right:16px',
        'color:rgba(255,215,55,0.9)',
        'font-family:Bangers,cursive',
        'font-size:14px',
        'letter-spacing:1.5px',
        'text-shadow:0 0 8px rgba(0,0,0,0.9)',
        'z-index:9000',
        'pointer-events:none',
      ].join(';');
      kc.textContent = '💀 0';
      document.body.appendChild(kc);
    }
    if (!document.getElementById('hud-session-timer')) {
      var st = document.createElement('div');
      st.id = 'hud-session-timer';
      st.style.cssText = [
        'position:fixed',
        'top:34px',
        'right:16px',
        'color:rgba(255,215,55,0.9)',
        'font-family:Bangers,cursive',
        'font-size:14px',
        'letter-spacing:1.5px',
        'text-shadow:0 0 8px rgba(0,0,0,0.9)',
        'z-index:9000',
        'pointer-events:none',
      ].join(';');
      st.textContent = '⌛ 0:00';
      document.body.appendChild(st);
    }
  }

  function _updatePersistentHUD(dt) {
    // Blood Moon countdown
    if (_bloodMoonActive) {
      _bloodMoonTimer -= dt;
      if (_bloodMoonTimer <= 0) _endBloodMoon();
    }
    // Update session timer
    _sessionTimerAccum += dt;
    if (_sessionTimerAccum >= 1.0) {
      _sessionTimerSecs += Math.floor(_sessionTimerAccum);
      _sessionTimerAccum -= Math.floor(_sessionTimerAccum);
      var mins = Math.floor(_sessionTimerSecs / 60);
      var secs = _sessionTimerSecs % 60;
      var timerEl = document.getElementById('hud-session-timer');
      if (timerEl) timerEl.textContent = '⌛ ' + mins + ':' + (secs < 10 ? '0' : '') + secs;
      // Check survival-time quests once per second (CHANGE 4)
      _checkSandboxRunQuestProgress();
    }
  }

  function _updateKillCountHUD() {
    var kc = document.getElementById('hud-kill-count');
    if (kc && playerStats) kc.textContent = '💀 ' + (playerStats.kills || 0);
  }

  // ─── Projectile pool ─────────────────────────────────────────────────────────
  function _buildProjectilePool() {
    _projPoolGeo = new THREE.SphereGeometry(0.065, 5, 5); // smaller, bullet-like
    for (let i = 0; i < POOL_SIZE_PROJECTILES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFAA });
      const m = new THREE.Mesh(_projPoolGeo, mat);
      m.visible = false;
      scene.add(m);
      _projPool.push({
        mesh: m,
        mat: mat,          // store reference for color update
        active: false,
        vx: 0,
        vz: 0,
        distSq: 0,
        ox: 0,
        oz: 0,
        weaponKey: 'gun',  // which weapon fired this projectile
        weaponDmg: 0,      // pre-computed base damage (0 = fall back to gun stats)
        explosionRadius: 0, // >0 triggers an AoE on impact (fireball)
      });
    }
  }

  // Hard cap: pool never grows beyond this; when full the oldest active projectile is recycled.
  const _PROJ_POOL_MAX = 120;
  function _fireProjectile(fromX, fromZ, toX, toZ, weaponKey, weaponDmg, explosionRadius) {
    // Ring-index scan: start from where we left off to keep per-shot cost O(1) amortised.
    let p = null;
    const len = _projPool.length;
    for (let _scan = 0; _scan < len; _scan++) {
      const idx = (_projPoolNextIdx + _scan) % len;
      if (!_projPool[idx].active) {
        p = _projPool[idx];
        _projPoolNextIdx = (idx + 1) % len;
        break;
      }
    }
    if (!p) {
      if (len < _PROJ_POOL_MAX) {
        // Expand pool up to hard cap
        const geo = _projPoolGeo || new THREE.SphereGeometry(0.065, 5, 5);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFAA });
        const m = new THREE.Mesh(geo, mat);
        m.visible = false;
        scene.add(m);
        const slot = { mesh: m, mat: mat, active: false, vx: 0, vz: 0, distSq: 0, ox: 0, oz: 0, weaponKey: 'gun', weaponDmg: 0, explosionRadius: 0 };
        _projPool.push(slot);
        p = slot;
        _projPoolNextIdx = 0; // reset cursor after growth
      } else {
        // Pool at hard cap — recycle the oldest active projectile (ring position = _projPoolNextIdx)
        p = _projPool[_projPoolNextIdx % len];
        if (p.mesh) p.mesh.visible = false;
        p.active = false;
        const _staleIdx = _activeProjList.indexOf(p);
        if (_staleIdx !== -1) _activeProjList.splice(_staleIdx, 1);
        _projPoolNextIdx = (_projPoolNextIdx + 1) % len;
      }
    }
    const dx = toX - fromX, dz = toZ - fromZ;
    const _dist = Math.sqrt(dx * dx + dz * dz) || 1;
    p.vx = (dx / _dist) * PROJECTILE_SPEED;
    p.vz = (dz / _dist) * PROJECTILE_SPEED;
    p.ox = fromX;
    p.oz = fromZ;
    p.distSq = 0;
    p.active = true;
    p.weaponKey      = weaponKey      || 'gun';
    p.weaponDmg      = weaponDmg      || 0;
    p.explosionRadius = explosionRadius || 0;
    p.mesh.position.set(fromX, 0.5, fromZ);
    p.mesh.visible = true;
    _activeProjList.push(p);
  }

  function _updateProjectiles(dt) {
    for (let i = _activeProjList.length - 1; i >= 0; i--) {
      const p = _activeProjList[i];
      if (!p) continue;
      if (!p.active) { _activeProjList.splice(i, 1); continue; }

      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;

      const ddx = p.mesh.position.x - p.ox;
      const ddz = p.mesh.position.z - p.oz;
      p.distSq = ddx * ddx + ddz * ddz;

      // Bullet color: bright yellow/white near muzzle (< 1 unit), copper-red farther
      // Skip expensive Math.sqrt when projectile is beyond color-change range (distSq > 36 → dist > 6)
      if (p.mat) {
        if (p.distSq > 36) {
          // Beyond 6m: final copper color (no sqrt needed)
          p.mat.color.setRGB(0.6, 0.133, 0);
        } else {
          const dist = Math.sqrt(p.distSq);
          if (dist < 1.0) {
            const t = dist;
            const r = 255, g = Math.round(255 * (1 - t * 0.2)), b = Math.round(200 * (1 - t));
            p.mat.color.setRGB(r/255, g/255, b/255);
          } else {
            const t = Math.min(1, (dist - 1.0) / 5.0);
            const r = Math.round(0xFF * (1 - t * 0.4));
            const g = Math.round(0xAA * (1 - t * 0.8));
            const b = Math.round(0x22 * (1 - t));
            p.mat.color.setRGB(r/255, g/255, b/255);
          }
        }
      }
      if (p.distSq > PROJECTILE_RANGE_SQ) {
        // Place bullet hole when projectile reaches max range (missed target)
        _placeBulletHole(p.mesh.position.x, p.mesh.position.z);
        _releaseProjectile(p, i);
        continue;
      }

      // Collision with enemies — use spatial hash if available (O(1) per projectile)
      let hitThisFrame = false;
      if (_enemySpatialHash && (_activeSlimes.length > 0 || _activeCrawlers.length > 0 || _activeLeapingSlimes.length > 0)) {
        const nearby = _enemySpatialHash.query(p.mesh.position.x, p.mesh.position.z, COLLISION_QUERY_RADIUS);
        for (let si = 0; si < nearby.length; si++) {
          const s = nearby[si];
          if (!s.active || s.dead) continue;
          const ex = p.mesh.position.x - s.mesh.position.x;
          const ez = p.mesh.position.z - s.mesh.position.z;
          if (ex * ex + ez * ez < COLLISION_THRESHOLD_SQ) {
            if (s.enemyType === 'crawler') {
              _hitCrawler(p, s);
            } else if (s.enemyType === 'leaping_slime') {
              _hitLeapingSlime(p, s);
            } else {
              _hitSlime(p, s);
            }
            _releaseProjectile(p, i);
            hitThisFrame = true;
            break;
          }
        }
        // Skinwalkers not in spatial hash — check separately
        if (!hitThisFrame) {
          for (let wi = 0; wi < _activeSkinwalkers.length; wi++) {
            const sw = _activeSkinwalkers[wi];
            if (sw.dead) continue;
            const wx = p.mesh.position.x - sw.parts.root.position.x;
            const wz = p.mesh.position.z - sw.parts.root.position.z;
            if (wx * wx + wz * wz < COLLISION_THRESHOLD_SQ * 4) {
              _hitSkinwalker(p, sw);
              _releaseProjectile(p, i);
              hitThisFrame = true;
              break;
            }
          }
        }
      } else {
        // Fallback: O(n²) brute-force (used when spatial-hash.js is not loaded)
        for (let si = 0; si < _activeSlimes.length; si++) {
          const s = _activeSlimes[si];
          const sx = s.mesh.position.x, sz = s.mesh.position.z;
          const ex = p.mesh.position.x - sx;
          const ez = p.mesh.position.z - sz;
          if (ex * ex + ez * ez < COLLISION_THRESHOLD_SQ) {
            _hitSlime(p, s);
            _releaseProjectile(p, i);
            hitThisFrame = true;
            break;
          }
        }
        if (!hitThisFrame) {
          // Also check crawlers in brute-force mode
          for (let ci = 0; ci < _activeCrawlers.length; ci++) {
            const c = _activeCrawlers[ci];
            if (!c.active || c.dead) continue;
            const cx = p.mesh.position.x - c.mesh.position.x;
            const cz = p.mesh.position.z - c.mesh.position.z;
            if (cx * cx + cz * cz < COLLISION_THRESHOLD_SQ) {
              _hitCrawler(p, c);
              _releaseProjectile(p, i);
              hitThisFrame = true;
              break;
            }
          }
        }
        if (!hitThisFrame) {
          // Also check leaping slimes in brute-force mode
          for (let li = 0; li < _activeLeapingSlimes.length; li++) {
            const l = _activeLeapingSlimes[li];
            if (!l.active || l.dead) continue;
            const lx = p.mesh.position.x - l.mesh.position.x;
            const lz = p.mesh.position.z - l.mesh.position.z;
            if (lx * lx + lz * lz < COLLISION_THRESHOLD_SQ) {
              _hitLeapingSlime(p, l);
              _releaseProjectile(p, i);
              hitThisFrame = true;
              break;
            }
          }
        }
        if (!hitThisFrame) {
          // Check skinwalkers in brute-force mode
          for (let wi = 0; wi < _activeSkinwalkers.length; wi++) {
            const sw = _activeSkinwalkers[wi];
            if (sw.dead) continue;
            const wx = p.mesh.position.x - sw.parts.root.position.x;
            const wz = p.mesh.position.z - sw.parts.root.position.z;
            if (wx * wx + wz * wz < COLLISION_THRESHOLD_SQ * 4) {
              _hitSkinwalker(p, sw);
              _releaseProjectile(p, i);
              hitThisFrame = true;
              break;
            }
          }
        }
      }
      if (hitThisFrame) continue;

      // Grey Boss hit detection
      if (!hitThisFrame &&
          typeof GreyBossSystem !== 'undefined' &&
          !GreyBossSystem.isDead()) {
        const bossPos = GreyBossSystem.getBossPosition();
        if (bossPos) {
          const bx = p.mesh.position.x - bossPos.x;
          const bz = p.mesh.position.z - bossPos.z;
          if (bx * bx + bz * bz < COLLISION_THRESHOLD_SQ) {
            if (typeof window._greyBossTakeDamage === 'function') {
              window._greyBossTakeDamage(p.damage || 10);
            }
            _releaseProjectile(p, i);
            hitThisFrame = true;
          }
        }
      }
      if (hitThisFrame) continue;
    }
  }

  function _releaseProjectile(p, idx) {
    p.active = false;
    p.mesh.visible = false;
    p.weaponKey = 'gun';
    p.weaponDmg = 0;
    p.explosionRadius = 0;
    if (idx !== undefined) _activeProjList.splice(idx, 1);
  }

  // ─── Slime Pool ──────────────────────────────────────────────────────────────
  // Shared geometry for all pool slots (avoids duplicating vertex data)
  let _slimeBaseGeo = null;
  // Shared wound geometries by stage (pooled per slime slot)
  const WOUNDS_PER_STAGE = [0, 2, 2, 3, 4]; // wounds added per stage
  const MAX_WOUNDS_PER_SLIME = 11; // max total wounds across all 4 stages

  function _buildSlimePool() {
    // Build shared geometry once
    _slimeBaseGeo = new THREE.SphereGeometry(0.7, 12, 10);
    const pos = _slimeBaseGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      let x = pos.getX(i);
      let z = pos.getZ(i);
      if (y < 0) { y *= 0.55; x *= 1.25; z *= 1.25; }
      else        { x *= 1.05; z *= 1.05; }
      pos.setXYZ(i, x, y, z);
    }
    _slimeBaseGeo.computeVertexNormals();

    const eyeGeo   = new THREE.SphereGeometry(0.1, 6, 6);
    const eyeMat   = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    for (let i = 0; i < MAX_SLIMES; i++) {
      // MeshPhongMaterial: glossy wet look without expensive physical rendering
      const mat = new THREE.MeshPhongMaterial({
        color: 0x55EE44,
        emissive: 0x113300,
        emissiveIntensity: 0.2,
        shininess: 100,         // high shininess for wet/glossy appearance
        specular: 0x55ff55,     // bright green specular to retain shiny Waterdrop aesthetic
      });
      const mesh = new THREE.Mesh(_slimeBaseGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // prevent enemies vanishing at screen edges
      mesh.visible = false; // inactive until spawned
      scene.add(mesh);

      // Eye pair with tracking
      const eyePupils = [];
      const eyeMeshes = [];
      [-0.22, 0.22].forEach(function (ox) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat.clone());
        eye.position.set(ox, 0.3, 0.6);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), pupilMat);
        pupil.position.set(0, 0, 0.06);
        eye.add(pupil);
        mesh.add(eye);
        eyePupils.push(pupil); // Store reference for eye tracking
        eyeMeshes.push(eye);   // Store eye mesh for blink animation
      });

      // Pre-allocate wound meshes (pooled — no new THREE.Mesh during gameplay)
      const woundPool = [];
      const woundGeos = [
        new THREE.SphereGeometry(0.12, 6, 6), // stage 1 size
        new THREE.SphereGeometry(0.15, 6, 6), // stage 2 size
        new THREE.SphereGeometry(0.18, 6, 6), // stage 3 size
        new THREE.SphereGeometry(0.22, 6, 6), // stage 4 size
      ];
      for (let w = 0; w < MAX_WOUNDS_PER_SLIME; w++) {
        const wGeo  = woundGeos[Math.min(Math.floor(w / 3), 3)]; // get geo by wound index
        const wMat  = new THREE.MeshBasicMaterial({ color: 0x660000 });
        const wound = new THREE.Mesh(wGeo, wMat);
        wound.visible = false;
        mesh.add(wound);
        woundPool.push(wound);
      }

      // Pre-allocate blood splatter meshes (pooled — no new THREE.Mesh during gameplay)
      const MAX_SPLATTERS = 9;
      const splatPool = [];
      const _splatGeo = new THREE.CircleGeometry(0.09, 7);
      for (var _si = 0; _si < MAX_SPLATTERS; _si++) {
        var _sMat = new THREE.MeshBasicMaterial({
          color: 0x440000,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        var _sMesh = new THREE.Mesh(_splatGeo, _sMat);
        _sMesh.renderOrder = 4;
        _sMesh.visible = false;
        mesh.add(_sMesh);
        splatPool.push(_sMesh);
      }

      _enemyPool.push({
        mesh,
        woundPool,   // pre-allocated wound meshes (pooled, replaces old wounds array)
        woundCount: 0, // number of currently active wound meshes
        splatPool,   // pre-allocated blood splatter meshes (pooled)
        splatIndex: 0, // next splatter slot to write (ring buffer)
        eyePupils,   // Store eye pupil references for tracking
        eyeMeshes,  // eye meshes for blinking
        hp: SLIME_HP,
        maxHp: SLIME_HP,
        active: false,
        dead: false,
        flashTimer: 0,
        wobbleTime: Math.random() * Math.PI * 2,
        squishTime: 0,
        knockbackVx: 0,
        knockbackVz: 0,
        lastDamageTime: 0,
        damageStage: 0,
        // Blinking eyes
        blinkTimer: 0,
        nextBlinkTime: 2 + Math.random() * 4,
        isBlinking: false,
        // Attack lunge animation state
        attackTimer: 0,       // cooldown until next lunge
        lungeTime: 0,         // active lunge duration (0 = idle)
        lungeDirX: 0,
        lungeDirZ: 0,
        // Properties expected by Player.prototype.update (auto-aim, collision checks)
        id: 'pool-slime-' + i,
        enemyType: 'slime',
        type: 'slime',
        radius: 0.7,
        isBoss: false,
        get isDead() { return this.dead; },
        set isDead(value) { this.dead = value; },
      });
    }
  }

  function _activateSlime(slot, x, z) {
    slot.active = true;
    slot.dead = false;
    slot.hp = SLIME_HP;
    slot.flashTimer = 0;
    slot.wobbleTime = Math.random() * Math.PI * 2;
    slot.squishTime = 0;
    slot.knockbackVx = 0;
    slot.knockbackVz = 0;
    slot.lastDamageTime = 0;
    slot.damageStage = 0;
    slot.woundCount = 0; // number of active wound meshes (from pre-allocated pool)
    slot.attackTimer = 1.5 + Math.random() * 1.5; // stagger first attack
    slot.lungeTime = 0;
    slot.lungeDirX = 0;
    slot.lungeDirZ = 0;
    slot.speedMultiplier = 0.85 + Math.random() * 0.3; // Individual speed variation (0.85-1.15x)
    // Hide all pre-allocated wounds
    if (slot.woundPool) {
      for (let i = 0; i < slot.woundPool.length; i++) slot.woundPool[i].visible = false;
    }
    // Hide all pre-allocated splatters and reset ring-buffer index
    slot.splatIndex = 0;
    if (slot.splatPool) {
      for (var _spi = 0; _spi < slot.splatPool.length; _spi++) slot.splatPool[_spi].visible = false;
    }
    slot.mesh.position.set(x, 0.45, z);
    slot.mesh.material.color.setHex(0x55EE44);
    slot.mesh.material.transparent = false; // fully opaque during normal gameplay
    slot.mesh.material.opacity = 1;
    slot.mesh.material.emissiveIntensity = 0.2;
    slot.mesh.scale.set(1, 1, 1);
    slot.mesh.visible = true;
    _activeSlimes.push(slot);
    _updateSlimeHPBar(slot);
  }

  function _deactivateSlime(slot) {
    // Remove any skin flaps before pooling — prevents accumulation across reuses
    _removeSkinFlaps(slot);
    // Hide all pre-allocated splatter meshes (pooled — no dispose needed)
    slot.splatIndex = 0;
    if (slot.splatPool) {
      for (var _spi = 0; _spi < slot.splatPool.length; _spi++) slot.splatPool[_spi].visible = false;
    }
    slot.active = false;
    slot.dead = true;
    slot.mesh.visible = false;
    // Hide all wound meshes (return to pool — no dispose calls needed)
    if (slot.woundPool) {
      for (let i = 0; i < slot.woundPool.length; i++) slot.woundPool[i].visible = false;
    }
    slot.woundCount = 0;
    // Reset material for reuse — ensure fully opaque, no transparency overhead
    slot.mesh.material.transparent = false;
    slot.mesh.material.color.setHex(0x55EE44);
    slot.mesh.material.opacity = 1;
    slot.mesh.material.emissiveIntensity = 0.2;
    slot.mesh.scale.set(1, 1, 1);
    // Remove from active list
    const idx = _activeSlimes.indexOf(slot);
    if (idx !== -1) _activeSlimes.splice(idx, 1);
  }

  /** Update lingering corpses: heartbeat blood pumping, growing blood pool, eventual cleanup. */
  // Math.pow(0.85, dt*60) = exp(ln(0.85)*dt*60) — precompute the rate constant
  const DEATH_SLIDE_DECAY_RATE = Math.log(0.85) * 60;
  function _updateCorpses(dt) {
    for (let i = _activeCorpses.length - 1; i >= 0; i--) {
      const c = _activeCorpses[i];

      // Internal pool-slime reuse check: if the slot was reactivated as a new slime,
      // abandon this stale corpse entry without touching the mesh.
      // Intentionally scoped to slimes only — crawlers and leaping slimes keep
      // active=true throughout their death animations, so a broader check would
      // incorrectly discard their corpse entries on the very first frame.
      if (c.slot && c.slot.active && c.slot.enemyType === 'slime') {
        if (c.poolMesh) { c.poolMesh.visible = false; c.poolMesh.scale.set(0.2, 0.2, 0.2); }
        if (c.poolSlot) _corpseBloodFreeList.push(c.poolSlot);
        _activeCorpses.splice(i, 1);
        continue;
      }

      c.timer += dt;
      const lifeRatio = c.timer / c.lingerDuration; // 0 → 1 over linger duration

      // Death slide: apply kill velocity to corpse mesh for the first 0.3 seconds
      if (c.timer < 0.3 && c.slot && c.slot.mesh && (c.slot._deathSlideVX || c.slot._deathSlideVZ)) {
        c.slot.mesh.position.x += (c.slot._deathSlideVX || 0) * dt;
        c.slot.mesh.position.z += (c.slot._deathSlideVZ || 0) * dt;
        const deathSlideDecay = Math.exp(DEATH_SLIDE_DECAY_RATE * dt);
        c.slot._deathSlideVX = (c.slot._deathSlideVX || 0) * deathSlideDecay;
        c.slot._deathSlideVZ = (c.slot._deathSlideVZ || 0) * deathSlideDecay;
        // Keep blood pool position synced
        c.x = c.slot.mesh.position.x;
        c.z = c.slot.mesh.position.z;
        if (c.poolMesh) {
          c.poolMesh.position.x = c.x;
          c.poolMesh.position.z = c.z;
        }
      }

      // Grow blood pool from small to large as corpse bleeds out (more dramatic)
      const poolRadius = 0.1 + lifeRatio * 1.1; // grows from 0.1 to 1.2 units
      if (c.poolMesh) {
        c.poolMesh.scale.set(poolRadius * 2, poolRadius * 2, 1);
        // Lerp pool color from 0x8B0000 (dark red) to 0x2A0000 (near black) over linger
        if (c.poolMat && c.poolMat.color) {
          const r = _lerp(0x8B / 255, 0x2A / 255, lifeRatio);
          const g = 0;
          const b = 0;
          c.poolMat.color.setRGB(r, g, b);
        }
        // Darken pool as time passes (more blood = darker)
        c.poolMat.opacity = 0.85 * (1 - lifeRatio * 0.2);
      }

      // Heartbeat blood pumping: sin-wave drives burst rate
      if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
        const heartRate = 3.0 * (1 - lifeRatio * 0.8); // slows from 3 Hz to 0.6 Hz
        c.bloodTimer += dt;
        const heartbeat = Math.sin(c.bloodTimer * heartRate * Math.PI * 2);
        if (heartbeat > 0.85 && lifeRatio < 0.85) {
          const pressure = (1 - lifeRatio) * 0.15; // weakening pressure (reduced from 0.5 - 70% reduction)
          BloodSystem.emitBurst(
            { x: c.x, y: 0.3, z: c.z },
            Math.floor(2 + pressure * 4), // Reduced from 6 + pressure * 12 (~70% reduction)
            { spreadXZ: 0.4 * pressure, spreadY: 0.25 * pressure, minLife: 15, maxLife: 40 }
          );
        }
      }

      // After linger duration: fade out, clean up, return to pool
      if (c.timer >= c.lingerDuration) {
        // Fade out corpse mesh
        if (c.slot.mesh && c.slot.mesh.material) {
          // Enable transparency only for the fade-out window (avoids overdraw during normal gameplay)
          if (!c.slot.mesh.material.transparent) c.slot.mesh.material.transparent = true;
          c.slot.mesh.material.opacity -= dt * 2;
          if (c.slot.mesh.material.opacity <= 0) {
            // Fully faded — return slot to pool
            if (c.poolMesh) { c.poolMesh.visible = false; c.poolMesh.scale.set(0.2, 0.2, 0.2); }
            if (c.poolSlot) _corpseBloodFreeList.push(c.poolSlot);
            // Restore slot mesh for reuse — reset to fully opaque (no transparent overhead)
            c.slot.mesh.visible = false;
            c.slot.mesh.material.transparent = false;
            c.slot.mesh.material.opacity = 1;
            c.slot.mesh.material.color.setHex(0x55EE44);
            c.slot.mesh.material.emissiveIntensity = 0.2;
            c.slot.mesh.scale.set(1, 1, 1);
            c.slot.woundCount = 0;
            if (c.slot.woundPool) {
              for (let w = 0; w < c.slot.woundPool.length; w++) c.slot.woundPool[w].visible = false;
            }
            // HP bars removed
            _activeCorpses.splice(i, 1);
          }
        } else {
          // No material — just clean up immediately
          if (c.poolMesh) { c.poolMesh.visible = false; c.poolMesh.scale.set(0.2, 0.2, 0.2); }
          if (c.poolSlot) _corpseBloodFreeList.push(c.poolSlot);
          _activeCorpses.splice(i, 1);
        }
      }
    }
  }

  /** Spawn a single slime from the pool at a random position around the player. */
  function _spawnSlime() {
    if (!player || !player.mesh) return;
    if (_activeSlimes.length >= _maxActive) return;
    for (let i = 0; i < _enemyPool.length; i++) {
      if (!_enemyPool[i].active) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = 8 + Math.random() * 6;
        const px    = player.mesh.position.x;
        const pz    = player.mesh.position.z;
        const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
        const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
        _activateSlime(_enemyPool[i], rx, rz);
        return;
      }
    }
  }

  /**
   * Survivor-style wave spawn: spawn up to _waveSize slimes at once.
   * Slimes are spread around the player with randomized positioning for varied approach patterns.
   */
  function _spawnWave() {
    if (!player || !player.mesh) return;
    const available = _maxActive - _activeSlimes.length;
    if (available <= 0) return;
    const count = Math.min(_waveSize, available);
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;
    for (let n = 0; n < count; n++) {
      // More random spawn pattern - not evenly distributed
      const angle = Math.random() * Math.PI * 2;
      const dist  = 8 + Math.random() * 7; // Increased distance variation (8-15 units)
      const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
      const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
      for (let i = 0; i < _enemyPool.length; i++) {
        if (!_enemyPool[i].active) {
          _activateSlime(_enemyPool[i], rx, rz);
          break;
        }
      }
    }
  }

  /** Return the closest active (non-dead) slime to the player, or null. */
  function _getClosestActiveSlime() {
    if (!player || !player.mesh || _activeSlimes.length === 0) return null;
    const px = player.mesh.position.x, pz = player.mesh.position.z;
    let closest = null, closestDistSq = Infinity;
    for (let i = 0; i < _activeSlimes.length; i++) {
      const s = _activeSlimes[i];
      const dx = s.mesh.position.x - px;
      const dz = s.mesh.position.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < closestDistSq) { closestDistSq = distSq; closest = s; }
    }
    return closest;
  }

  // ── Shared kill/bullet-hole helpers ─────────────────────────────────────────
  const _KILL_VARIANT_COUNT = 3;
  function _normalizeWeaponKey(key) {
    if (!key) return 'gun';
    const k = String(key).toLowerCase();
    if (k.indexOf('shotgun') !== -1) return 'shotgun';
    if (k.indexOf('fire') !== -1 || k.indexOf('flame') !== -1) return 'fire';
    if (k.indexOf('sword') !== -1 || k.indexOf('blade') !== -1 || k.indexOf('katana') !== -1) return 'sword';
    return k;
  }
  // Map sandbox-normalized weapon types to the keys expected by GoreSim/BloodV2
  function _goreSimWeaponKey(key) {
    const norm = _normalizeWeaponKey(key);
    if (norm === 'fire') return 'flame';
    if (norm === 'gun')  return 'pistol';
    return norm; // shotgun, sword, etc. match directly
  }
  function _pickKillVariant() {
    return Math.floor(Math.random() * _KILL_VARIANT_COUNT);
  }
  const _BULLET_HOLE_MAX_PER_ENEMY = 12;
  function _addEnemyBulletHole(enemy, parent, dirX, dirZ, radius, yOffset) {
    if (!enemy || !parent) return;
    if (!enemy._bulletHoles) enemy._bulletHoles = [];
    if (enemy._bulletHoleIndex === undefined) enemy._bulletHoleIndex = 0;
    const idx = enemy._bulletHoleIndex % _BULLET_HOLE_MAX_PER_ENEMY;
    ensureBulletHoleMaterials && ensureBulletHoleMaterials();
    const geo = (typeof bulletHoleGeo !== 'undefined' && bulletHoleGeo) ? bulletHoleGeo : new THREE.CircleGeometry(0.08, 8);
    const baseMat = (typeof bulletHoleMat !== 'undefined' && bulletHoleMat) ? bulletHoleMat : null;
    let hole = enemy._bulletHoles[idx];
    if (!hole) {
      const mat = baseMat ? baseMat.clone() : new THREE.MeshBasicMaterial({ color: 0x3A0000, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      hole = new THREE.Mesh(geo, mat);
      hole.frustumCulled = false;
      enemy._bulletHoles[idx] = hole;
    }
    if (hole.parent !== parent) parent.add(hole);
    const ny = (yOffset !== undefined) ? yOffset : (0.12 + Math.random() * 0.25);
    const nx = dirX, nz = dirZ;
    hole.position.set(nx * radius, ny, nz * radius);
    // PERF FIX: Use pre-allocated _tmpV3b instead of allocating new Vector3 each hit
    _tmpV3b.set(nx * 2, ny, nz * 2);
    hole.lookAt(parent.localToWorld(_tmpV3b));
    hole.visible = true;
    enemy._bulletHoleIndex = idx + 1;
    return hole;
  }

  function _hitSlime(projectile, slot) {
    if (!slot || !slot.active || slot.dead) return;

    // Determine hit force from weapon (gun = 1.0)
    const hitForce = 1.0 + (weapons && weapons.gun ? (weapons.gun.level - 1) * 0.15 : 0);
    const weaponKey = (projectile && projectile.weaponKey) || 'gun';
    // Use weapon-specific damage if the projectile carries it, otherwise fall back to gun stats
    const damage = (projectile && projectile.weaponDmg > 0)
      ? projectile.weaponDmg
      : (weapons && weapons.gun ? weapons.gun.damage : 15);

    // Critical hit chance — playerStats.critChance is the total chance (0.0–1.0)
    const critChance = (playerStats && playerStats.critChance != null) ? playerStats.critChance : 0.10;
    const isCrit = Math.random() < critChance;
    const critMultiplier = isCrit ? (playerStats && playerStats.critDmg ? playerStats.critDmg : 1.5) : 1.0;
    const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
    const actualDmg = Math.round(damage * hitForce * critMultiplier * strMult);

    slot.hp -= actualDmg;
    slot.flashTimer = 0.1;

    // Apply knockback force — reduced to 1/4 of original to prevent stutter
    const knockbackStrength = 0.04 * hitForce;
    if (projectile && projectile.vx !== undefined && projectile.vz !== undefined) {
      slot.knockbackVx = projectile.vx * knockbackStrength;
      slot.knockbackVz = projectile.vz * knockbackStrength;
    }

    // Squish animation on hit
    slot.squishTime = 0.3;

    // ── 5-PART PROGRESSIVE DAMAGE SYSTEM ── (hpPercent declared first, used below too)
    const hpPercent = slot.hp / slot.maxHp;

    // Screen shake — scales with damage: light hit = micro-shake, heavy = harder shake
    const shakeIntensity = hpPercent < SHAKE_HEAVY_HP_THRESHOLD ? SHAKE_HEAVY_INTENSITY
                         : hpPercent < SHAKE_MID_HP_THRESHOLD   ? SHAKE_MID_INTENSITY
                         : SHAKE_LIGHT_INTENSITY;
    _triggerShake(shakeIntensity);

    // Floating damage number — reuse pre-allocated _tmpV3 (no new THREE.Vector3 per hit)
    if (isCrit) {
      _tmpV3.set(slot.mesh.position.x, 2.0, slot.mesh.position.z);
      createFloatingText(actualDmg, _tmpV3, '#FFD700', actualDmg);
      // Show "Critical" text slightly above
      _tmpV3.set(slot.mesh.position.x, 2.4, slot.mesh.position.z);
      createFloatingText('Critical', _tmpV3, '#FF4400', 0);
      _showDamageNumber(slot.mesh.position.x, 2.0, slot.mesh.position.z, actualDmg, slot.hp <= 0, true);
    } else {
      _tmpV3.set(slot.mesh.position.x, 1.5, slot.mesh.position.z);
      createFloatingText(actualDmg, _tmpV3, '#FF4444', actualDmg);
      _showDamageNumber(slot.mesh.position.x, 1.5, slot.mesh.position.z, actualDmg, slot.hp <= 0, false);
    }

    // ── GORE SIMULATOR: Connect every weapon to gore system ──────────────────
    if (window.GoreSim && typeof GoreSim.onHit === 'function') {
      _tmpV3.set(slot.mesh.position.x, slot.mesh.position.y + 0.3, slot.mesh.position.z);
      var hitNormal = null;
      if (projectile && projectile.vx !== undefined) {
        _leapHitNormal.set(-projectile.vx, 0, -projectile.vz).normalize();
        hitNormal = _leapHitNormal;
      }
      GoreSim.onHit(slot, (projectile && projectile.weaponKey) || 'pistol', _tmpV3, hitNormal);
    }

    // ── BULLET HOLE GENERATION: Create a NEW visible bullet hole on slime mesh per shot ──
    // This ensures EVERY single gun shot dynamically generates a visible bullet hole
    if (slot.woundPool && slot.woundCount >= slot.woundPool.length) slot.woundCount = 0;
    if (slot.woundPool && slot.woundCount < slot.woundPool.length) {
      const wound = slot.woundPool[slot.woundCount++];
      // Make wound appear as true black hole
      wound.material.color.setHex(0x000000);
      wound.visible = true;
      wound.renderOrder = 5;

      // Position bullet hole on surface - randomized around hit point
      // Calculate hit direction from projectile velocity
      let hitDirX = 0, hitDirZ = 0;
      if (projectile && projectile.vx !== undefined && projectile.vz !== undefined) {
        const vel = Math.sqrt(projectile.vx * projectile.vx + projectile.vz * projectile.vz) || 1;
        hitDirX = projectile.vx / vel;
        hitDirZ = projectile.vz / vel;
      }

      // Place wound at surface impact point
      const surfaceRadius = 0.68; // Approximate radius of slime body
      const woundX = hitDirX * surfaceRadius;
      const woundZ = hitDirZ * surfaceRadius;
      const woundY = -0.1 + Math.random() * 0.4; // Randomize height slightly
      wound.position.set(woundX, woundY, woundZ);

      // Scale down for bullet hole size (smaller than normal wounds)
      wound.scale.setScalar(0.28);

      // Recycle a pre-allocated splatter mesh from the pool (ring buffer)
      if (slot.splatPool && slot.splatPool.length > 0) {
        var _bsmesh = slot.splatPool[slot.splatIndex % slot.splatPool.length];
        slot.splatIndex++;
        var _bsAngle = Math.atan2(hitDirZ, hitDirX);
        var _bsRadius = 0.65 + Math.random() * 0.15;
        var _bsHeight = 0.0 + Math.random() * 0.6 - 0.2;
        _bsmesh.position.set(
          Math.cos(_bsAngle) * _bsRadius + (Math.random()-0.5)*0.1,
          _bsHeight,
          Math.sin(_bsAngle) * _bsRadius + (Math.random()-0.5)*0.1
        );
        _bsmesh.lookAt(
          Math.cos(_bsAngle) * 2,
          _bsHeight,
          Math.sin(_bsAngle) * 2
        );
        var _bsScale = 0.6 + Math.random() * 0.8;
        _bsmesh.scale.set(_bsScale, _bsScale * 1.4, 1);
        _bsmesh.rotation.z = Math.random() * Math.PI * 2;
        _bsmesh.material.opacity = 0.9;
        _bsmesh.material.color.setHex(0x440000);
        _bsmesh.userData.fadeTimer = 50 + Math.random() * 20;
        _bsmesh.visible = true;
      }
    }

    // ── 5-PART PROGRESSIVE DAMAGE SYSTEM ──────────────────────────────────────
    // (hpPercent already declared above before blood system section)

    _placeBloodStain(slot.mesh.position.x, slot.mesh.position.z, 0.15 + Math.random() * 0.25);

    if (hpPercent <= 0.75 && slot.damageStage === 0) {
      slot.damageStage = 1;
      _applyDamageStage1(slot);
    } else if (hpPercent <= 0.50 && slot.damageStage === 1) {
      slot.damageStage = 2;
      _applyDamageStage2(slot);
    } else if (hpPercent <= 0.35 && slot.damageStage === 2) {
      slot.damageStage = 3;
      _applyDamageStage3(slot);
    } else if (hpPercent <= 0.20 && slot.damageStage === 3) {
      slot.damageStage = 4;
      _applyDamageStage4(slot);
    }

    if (slot.hp <= 0) {
      _triggerProjectileExplosion(projectile, slot.mesh.position.x, slot.mesh.position.z);
      _killSlime(slot, hitForce, projectile.vx || 0, projectile.vz || 0, weaponKey);
    } else {
      _triggerProjectileExplosion(projectile, slot.mesh.position.x, slot.mesh.position.z);
      _updateSlimeHPBar(slot);
    }
  }

  function _killSlime(slot, hitForce, killVX, killVZ, weaponKey) {
    // Remove any skin flaps before kill FX so they don't persist on the corpse mesh
    _removeSkinFlaps(slot);
    const x = slot.mesh.position.x;
    const y = slot.mesh.position.y + 0.4; // center of body
    const z = slot.mesh.position.z;
    const weaponType = _normalizeWeaponKey(weaponKey);
    const killVariant = _pickKillVariant();

    // Hit-stop: freeze simulation for a brief moment — gives attacks a heavy, impactful feel
    _triggerHitStop(HIT_STOP_KILL_DURATION_MS);
    // Hard camera shake on kill (scales slightly with hit force)
    _triggerShake(SHAKE_KILL_BASE + Math.min(SHAKE_KILL_CAP, (hitForce - 1) * SHAKE_KILL_SCALE));

    // ── GORE SIMULATOR: Weapon-specific death reaction ──────────────────────
    if (window.GoreSim && typeof GoreSim.onKill === 'function') {
      GoreSim.onKill(slot, _goreSimWeaponKey(weaponKey), null);
    }

    // Weapon-driven kill styling
    let burstCount = 80;
    let burstOpts  = { spdMin: 3, spdMax: 14, rMin: 0.010, rMax: 0.030, life: 3.5, visc: 0.55, enemyType: 'slime' };
    let chunkCount = 12 + Math.floor(Math.random() * 8);
    let chunkColors = null;
    let chunkForce = null;
    let stainScale = 1.0;
    let slideScale = 0.5;
    let corpseLinger = 15;
    let extraFx = null;

    switch (weaponType) {
      case 'shotgun':
        burstCount = 130;
        burstOpts.spdMin = 4; burstOpts.spdMax = 18;
        burstOpts.rMax = 0.034;
        chunkCount = 18 + Math.floor(Math.random() * 8);
        stainScale = 1.4;
        slideScale = 0.9;
        if (killVariant === 1) {
          burstCount = 160;
          burstOpts.spdMax = 22;
          extraFx = function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(x, y + 0.1, z, 50, {
                enemyType: 'slime', spdMin: 6, spdMax: 14, rMin: 0.009, rMax: 0.024, life: 3.2, visc: 0.50
              });
            }
          };
        } else if (killVariant === 2) {
          chunkCount = 22;
          slideScale = 1.1;
          chunkForce = { dirX: killVX || 0, dirZ: killVZ || 0, power: 0.65, spread: 0.55 };
        }
        break;
      case 'sword':
        burstCount = 70;
        burstOpts.spdMin = 2.0; burstOpts.spdMax = 10.0;
        burstOpts.rMin = 0.008; burstOpts.rMax = 0.026;
        chunkCount = 14;
        slideScale = 0.65;
        if (killVariant === 0) {
          chunkForce = { dirX: (killVX || 0.8), dirZ: (killVZ || 0), power: 0.55, spread: 0.40 };
        } else if (killVariant === 1) {
          extraFx = function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(x, y + 0.15, z, 35, {
                enemyType: 'slime', spdMin: 3, spdMax: 9, rMin: 0.007, rMax: 0.022, life: 2.4
              });
            }
          };
        } else {
          slideScale = 0.85;
          if (slot.mesh) slot.mesh.rotation.y += (Math.random() < 0.5 ? -1 : 1) * Math.PI * 0.4;
        }
        break;
      case 'fire':
        burstCount = 50;
        burstOpts = { color: 0x552211, spdMin: 2.5, spdMax: 8.5, rMin: 0.006, rMax: 0.020, life: 2.5, visc: 0.70, enemyType: 'slime' };
        chunkColors = [0x553311, 0x331a0c, 0x220b06];
        chunkCount = 8 + Math.floor(Math.random() * 3);
        stainScale = 1.15;
        slideScale = 0.35;
        corpseLinger = 18;
        if (slot.mesh && slot.mesh.material) slot.mesh.material.color.setHex(0x332011);
        if (killVariant === 1) {
          burstCount = 70;
          burstOpts.color = 0x663000;
        } else if (killVariant === 2) {
          extraFx = function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(x, y + 0.05, z, 30, {
                color: 0xff5500, spdMin: 4, spdMax: 10, rMin: 0.008, rMax: 0.022, life: 2.8
              });
            }
          };
        }
        break;
    }

    // Hollywood-style overdone slime death burst
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(x, y, z, burstCount, burstOpts);
    }
    _spawnFleshChunks(slot, chunkCount, true, chunkColors, chunkForce);
    if (extraFx) extraFx();

    // Place a blood stain decal on the ground at the kill position
    _placeBloodStain(x, z, (0.15 + Math.random() * 0.25) * stainScale);

    // ── GORE: Corpse linger for N seconds with heartbeat blood pumping ──────────
    // Remove from active list but keep the mesh visible as a "corpse"
    const idx = _activeSlimes.indexOf(slot);
    if (idx !== -1) _activeSlimes.splice(idx, 1);
    slot.active = false;
    slot.dead = true;
    // Set death slide velocity for corpse movement
    slot._deathSlideVX = (killVX || 0) * slideScale;
    slot._deathSlideVZ = (killVZ || 0) * slideScale;
    // CRITICAL FIX: Ensure corpse mesh stays visible!
    slot.mesh.visible = true;
    // Flatten the corpse mesh and darken to a bloody grey
    slot.mesh.material.color.setHex(0x1a4a1a);
    slot.mesh.material.emissiveIntensity = 0.05;
    slot.mesh.scale.set(1.4, 0.35, 1.4); // squish flat on ground
    slot.mesh.position.y = 0.12; // lay on ground
    // Reset eye pupils to center (dead stare)
    if (slot.eyePupils) {
      for (var _ep = 0; _ep < slot.eyePupils.length; _ep++) {
        slot.eyePupils[_ep].position.x = 0;
        slot.eyePupils[_ep].position.z = 0.06; // Center position
      }
    }
    // HP bars removed
    // Growing blood pool under corpse
    const _cbSlot = _acquireCorpseBlood(x, 0.06, z, 0x550000);
    _activeCorpses.push({ slot, timer: 0, lingerDuration: corpseLinger, bloodTimer: 0, poolMesh: _cbSlot?.mesh || null, poolMat: _cbSlot?.mat || null, poolSlot: _cbSlot || null, x, z });

    // ══════════ NEW XP STAR SYSTEM V2 ══════════
    // Spawn XP stars instantly when HP reaches 0
    // Stars spawn with physics based on kill damage and proper enemy colors
    const killDamage = slot.maxHp * hitForce; // Estimate kill damage from hitForce

    // Spawn primary star (guaranteed)
    if (window.XPStarSystem) {
      XPStarSystem.spawn(x, y, z, 'slime', killDamage, killVX || 0, killVZ || 0);

      // Bonus star (17.25% chance)
      if (Math.random() < BONUS_XP_DROP_RATE) {
        XPStarSystem.spawn(x, y, z, 'slime', killDamage * 0.8, killVX || 0, killVZ || 0);
      }
    }

    // ══════════ GOLD COIN DROP ══════════
    if (Math.random() < GOLD_DROP_CHANCE) {
      const goldValue = GOLD_AMOUNT_MIN + Math.floor(Math.random() * (GOLD_AMOUNT_MAX - GOLD_AMOUNT_MIN + 1));
      _spawnGoldCoin(x, z, goldValue);
    }

    _tmpV3.set(x, 1.8, z);

    playerStats.kills++;
    _incrementKillCombo();
    _updateKillCountHUD();
    // Boss hit-stop
    if (slot.isBoss) {
      if (_hitStopRemaining < 120) _hitStopRemaining = 120;
      if (saveData.tutorialQuests) saveData.tutorialQuests.firstBossDefeated = true;
    }
    // Run quest kill tracking (CHANGE 1)
    _sandboxRunKills++;
    if (saveData.tutorialQuests) saveData.tutorialQuests.killsThisRun = _sandboxRunKills;
    _checkSandboxRunQuestProgress();

    if (window.GameRageCombat && typeof GameRageCombat.addRage === 'function') {
      GameRageCombat.addRage(8);
    }
    if (window.GameMilestones && typeof GameMilestones.recordKill === 'function') {
      GameMilestones.recordKill();
    }
    // Achievement + stat tracking
    if (saveData) {
      if (saveData.stats) saveData.stats.totalKills = (saveData.stats.totalKills || 0) + 1;
      saveData.totalKills = (saveData.totalKills || 0) + 1;
    }
    if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(2, 'Kill', saveData);
    // Codex discovery
    if (window.CodexSystem && typeof window.CodexSystem.discover === 'function') {
      var _codexData = saveData && saveData.codexData;
      if (!_codexData || !_codexData.discovered || !_codexData.discovered['enemy_balanced']) {
        window.CodexSystem.discover('enemy_balanced');
        if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(5, 'Codex Discovery', saveData);
      }
    }
    _checkSandboxAchievements();
    SeqWaveManager.onEnemyKilled('slime');
    // HP bars removed - function kept for compatibility but does nothing
  }

  // ─── CRAWLER HIT & KILL ───────────────────────────────────────────────────────
  function _hitCrawler(projectile, crawler) {
    if (!crawler || !crawler.active || crawler.dead || crawler.dying) return;

    const weaponKey = (projectile && projectile.weaponKey) || 'gun';
    const hitForce = 1.0 + (weapons && weapons.gun ? (weapons.gun.level - 1) * 0.15 : 0);
    // Use weapon-specific damage if the projectile carries it, otherwise fall back to gun stats
    const damage = (projectile && projectile.weaponDmg > 0)
      ? projectile.weaponDmg
      : (weapons && weapons.gun ? weapons.gun.damage : 15);
    const critChance = (playerStats && playerStats.critChance != null) ? playerStats.critChance : 0.10;
    const isCrit = Math.random() < critChance;
    const critMultiplier = isCrit ? (playerStats && playerStats.critDmg ? playerStats.critDmg : 1.5) : 1.0;
    const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
    const actualDmg = Math.round(damage * hitForce * critMultiplier * strMult);

    crawler.hp -= actualDmg;
    crawler.flashTimer = 0.1;
    crawler.squishTime = 0.3;

    // Knockback
    if (projectile && projectile.vx !== undefined) {
      crawler.knockbackVx = projectile.vx * 0.03 * hitForce;
      crawler.knockbackVz = projectile.vz * 0.03 * hitForce;
    }

    // Floating damage text
    const cx = crawler.mesh.position.x;
    const cz = crawler.mesh.position.z;
    if (isCrit) {
      _tmpV3.set(cx, 2.0, cz);
      createFloatingText(actualDmg, _tmpV3, '#FFD700', actualDmg);
      _tmpV3.set(cx, 2.4, cz);
      createFloatingText('Critical', _tmpV3, '#FF4400', 0);
      _showDamageNumber(cx, 2.0, cz, actualDmg, crawler.hp <= 0, true);
    } else {
      _tmpV3.set(cx, 1.5, cz);
      createFloatingText(actualDmg, _tmpV3, '#FF4444', actualDmg);
      _showDamageNumber(cx, 1.5, cz, actualDmg, crawler.hp <= 0, false);
    }

    // Blood from crawler (brown/amber blood)
    _reusableBloodPos.x = cx;
    _reusableBloodPos.y = 0.5;
    _reusableBloodPos.z = cz;
    // Gore simulator
    if (window.GoreSim && typeof GoreSim.onHit === 'function') {
      _tmpV3.set(cx, 0.4, cz);
      var hitNormal = null;
      if (projectile && projectile.vx !== undefined) {
        _leapHitNormal.set(-projectile.vx, 0, -projectile.vz).normalize();
        hitNormal = _leapHitNormal;
      }
      GoreSim.onHit(crawler, (projectile && projectile.weaponKey) || 'pistol', _tmpV3, hitNormal);
    }

    // Bullet hole on crawler
    if (crawler.woundPool && crawler.woundCount >= crawler.woundPool.length) crawler.woundCount = 0;
    if (crawler.woundPool && crawler.woundCount < crawler.woundPool.length) {
      const wound = crawler.woundPool[crawler.woundCount++];
      wound.material.color.setHex(0x441100);
      wound.visible = true;
      wound.position.set(
        (Math.random() - 0.5) * 0.3,
        0.1 + Math.random() * 0.2,
        (Math.random() - 0.5) * 0.5
      );
      wound.scale.setScalar(0.5);
    }

    // Dedicated bullet-hole decal (ensures visibility on every enemy colour)
    if (projectile) {
      const len = Math.sqrt((projectile.vx || 0) * (projectile.vx || 0) + (projectile.vz || 0) * (projectile.vz || 0)) || 1;
      const nhx = (projectile.vx || 0) / len;
      const nhz = (projectile.vz || 0) / len;
      _addEnemyBulletHole(crawler, crawler.group, nhx, nhz, 0.55, 0.12 + Math.random() * 0.25);
    }

    if (crawler.hp <= 0) {
      _triggerProjectileExplosion(projectile, cx, cz);
      _killCrawler(crawler, hitForce, projectile.vx || 0, projectile.vz || 0, weaponKey);
    } else {
      _triggerProjectileExplosion(projectile, cx, cz);
      _placeBloodStain(cx, cz, 0.15 + Math.random() * 0.25);
    }
  }

  function _killCrawler(crawler, hitForce, killVX, killVZ, weaponKey) {
    // Remove any skin flaps before kill FX
    _removeSkinFlaps(crawler);
    const x = crawler.mesh.position.x;
    const y = 0.4;
    const z = crawler.mesh.position.z;
    const weaponType = _normalizeWeaponKey(weaponKey);
    const killVariant = _pickKillVariant();

    _triggerHitStop(HIT_STOP_KILL_DURATION_MS * 1.5);
    _triggerShake(SHAKE_KILL_BASE * 1.3 + Math.min(SHAKE_KILL_CAP, (hitForce - 1) * SHAKE_KILL_SCALE));

    // Gore sim kill
    if (window.GoreSim && typeof GoreSim.onKill === 'function') {
      GoreSim.onKill(crawler, _goreSimWeaponKey(weaponKey), null);
    }

    let burstCount = 60;
    let burstOpts  = { enemyType: 'crawler', spdMin: 2.5, spdMax: 12.0, rMin: 0.010, rMax: 0.030, life: 3.4, visc: 0.60 };
    let chunkColors = [0x8B4513, 0x6B3410, 0x5C3010, 0xDEB887];
    let chunkCount  = 6 + Math.floor(Math.random() * 5);
    let chunkForce  = null;
    let stainScale  = 1.0;
    let slideScale  = 0.5;
    let corpseLinger = 45;
    let extraFx = null;

    switch (weaponType) {
      case 'shotgun':
        burstCount = 110;
        burstOpts.spdMin = 5; burstOpts.spdMax = 18;
        burstOpts.rMax = 0.038;
        chunkCount = 10 + Math.floor(Math.random() * 6);
        stainScale = 1.5;
        slideScale = 1.1;
        chunkForce = { dirX: killVX || 0, dirZ: killVZ || 0, power: 0.80, spread: 0.60 };
        if (killVariant === 1) {
          extraFx = function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(x, y + 0.15, z, 45, { enemyType: 'crawler', spdMin: 7, spdMax: 16, rMin: 0.010, rMax: 0.026, life: 3.0, visc: 0.55 });
            }
          };
        } else if (killVariant === 2) {
          chunkCount = 14;
          slideScale = 1.2;
        }
        break;
      case 'sword':
        burstCount = 70;
        burstOpts.spdMin = 3.0; burstOpts.spdMax = 11.0;
        burstOpts.rMin = 0.009; burstOpts.rMax = 0.026;
        chunkCount = 9 + Math.floor(Math.random() * 4);
        slideScale = 0.7;
        chunkForce = { dirX: (killVX || 0.5), dirZ: (killVZ || 0), power: 0.55, spread: 0.35 };
        if (killVariant === 1) {
          extraFx = function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(x, y + 0.1, z, 30, { enemyType: 'crawler', spdMin: 4, spdMax: 10, rMin: 0.008, rMax: 0.020, life: 2.2 });
            }
          };
        } else if (killVariant === 2 && crawler.headMesh) {
          crawler.headMesh.rotation.y += (Math.random() < 0.5 ? -1 : 1) * 0.5;
        }
        break;
      case 'fire':
        burstCount = 50;
        burstOpts = { enemyType: 'crawler', color: 0x663311, spdMin: 2.0, spdMax: 9.0, rMin: 0.008, rMax: 0.022, life: 2.6, visc: 0.72 };
        chunkColors = [0x4d2b10, 0x2a1608, 0x3b220f];
        chunkCount = 6 + Math.floor(Math.random() * 3);
        stainScale = 1.2;
        slideScale = 0.35;
        corpseLinger = 50;
        if (killVariant === 2) {
          extraFx = function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(x, y + 0.08, z, 28, { color: 0xff6600, spdMin: 3, spdMax: 9, rMin: 0.008, rMax: 0.020, life: 2.4 });
            }
          };
        }
        break;
    }

    // Hollywood-style overdone crawler death burst
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(x, y, z, burstCount, burstOpts);
    }

    // Spawn brown crawler/worm flesh chunks
    _spawnFleshChunks(crawler, chunkCount, true, chunkColors, chunkForce);
    if (extraFx) extraFx();

    _placeBloodStain(x, z, (0.15 + Math.random() * 0.25) * stainScale);

    // Mark as dying (crawler death animation handles fade)
    crawler.dying = true;
    crawler.deathTimer = 0;
    crawler._deathSlideVX = (killVX || 0) * slideScale;
    crawler._deathSlideVZ = (killVZ || 0) * slideScale;
    const cidx = _activeCrawlers.indexOf(crawler);
    if (cidx !== -1) _activeCrawlers.splice(cidx, 1);

    // Corpse linger duration is driven by corpseLinger
    const _cbSlot2 = _acquireCorpseBlood(x, 0.03, z, 0x442200, 0.7);
    _activeCorpses.push({ slot: crawler, timer: 0, lingerDuration: corpseLinger, bloodTimer: 0, poolMesh: _cbSlot2?.mesh || null, poolMat: _cbSlot2?.mat || null, poolSlot: _cbSlot2 || null, x, z });

    // ══════════ NEW XP STAR SYSTEM V2 ══════════
    // Crawler drops green stars — use actual maxHp to keep scaling consistent
    const crawlerBaseHp =
      (typeof crawler.maxHp === 'number' && crawler.maxHp > 0)
        ? crawler.maxHp
        : (window.CRAWLER_CFG && typeof CRAWLER_CFG.BASE_HP === 'number' && CRAWLER_CFG.BASE_HP > 0)
          ? CRAWLER_CFG.BASE_HP
          : 250;
    const killDamage = crawlerBaseHp * hitForce;

    if (window.XPStarSystem) {
      XPStarSystem.spawn(x, y, z, 'crawler', killDamage, killVX || 0, killVZ || 0);

      // Bonus drop (higher rate for crawler: 25.875%)
      if (Math.random() < BONUS_XP_DROP_RATE * 1.5) {
        XPStarSystem.spawn(x, y, z, 'crawler', killDamage * 0.8, killVX || 0, killVZ || 0);
      }
    }

    // ══════════ GOLD COIN DROP ══════════
    if (Math.random() < GOLD_DROP_CHANCE * 1.5) { // Crawlers drop more gold
      const goldValue = GOLD_AMOUNT_MIN + Math.floor(Math.random() * (GOLD_AMOUNT_MAX - GOLD_AMOUNT_MIN + 1)) + 1;
      _spawnGoldCoin(x, z, goldValue);
    }

    playerStats.kills++;
    _incrementKillCombo();
    _updateKillCountHUD();
    // Boss hit-stop
    if (crawler.isBoss) {
      if (_hitStopRemaining < 120) _hitStopRemaining = 120;
      if (saveData.tutorialQuests) saveData.tutorialQuests.firstBossDefeated = true;
    }
    // Run quest kill tracking (CHANGE 1)
    _sandboxRunKills++;
    if (saveData.tutorialQuests) saveData.tutorialQuests.killsThisRun = _sandboxRunKills;
    _checkSandboxRunQuestProgress();
    if (window.GameRageCombat && typeof GameRageCombat.addRage === 'function') {
      GameRageCombat.addRage(12);
    }
    // Achievement + stat tracking
    if (saveData) {
      if (saveData.stats) saveData.stats.totalKills = (saveData.stats.totalKills || 0) + 1;
      saveData.totalKills = (saveData.totalKills || 0) + 1;
    }
    if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(2, 'Kill', saveData);
    // Codex discovery
    if (window.CodexSystem && typeof window.CodexSystem.discover === 'function') {
      var _codexData = saveData && saveData.codexData;
      if (!_codexData || !_codexData.discovered || !_codexData.discovered['enemy_bug']) {
        window.CodexSystem.discover('enemy_bug');
        if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(5, 'Codex Discovery', saveData);
      }
    }
    _checkSandboxAchievements();
    SeqWaveManager.onEnemyKilled('crawler');
  }

  /** Spawn crawlers alongside slimes during waves */
  function _spawnCrawler() {
    if (!window.CrawlerPool || !player || !player.mesh) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 10 + Math.random() * 8;
    const px    = player.mesh.position.x;
    const pz    = player.mesh.position.z;
    const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const waveLevel = Math.floor(_waveSize / 4) + 1;
    const c = CrawlerPool.spawn(rx, rz, waveLevel);
    if (c) {
      _activeCrawlers.push(c);
    }
  }

  /** Update crawlers: contact damage to player */
  function _updateCrawlers(dt) {
    if (!window.CrawlerPool || !player || !player.mesh) return;
    const playerPos = player.mesh.position;
    CrawlerPool.update(_bloodMoonActive ? dt * BLOOD_MOON_SPEED_MULT : dt, playerPos);

    // Refresh active list and handle contact damage
    for (let i = _activeCrawlers.length - 1; i >= 0; i--) {
      const c = _activeCrawlers[i];
      if (!c.active || !c.alive || c.dying) {
        _activeCrawlers.splice(i, 1);
        continue;
      }
      // Contact damage (crawler does more damage than slimes)
      const dx = playerPos.x - c.mesh.position.x;
      const dz = playerPos.z - c.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      // BUG J: Add mesh.visible check to prevent invisible crawlers from dealing damage
      if (dist < 1.3 && !player.invulnerable && c.mesh && c.mesh.visible) {
        const now = Date.now();
        if (now - c.lastDamageTime > 400) {
          c.lastDamageTime = now;
          const crawlerDmg = (window.CRAWLER_CFG ? window.CRAWLER_CFG.BASE_DAMAGE : 18) * (_bloodMoonActive ? BLOOD_MOON_DAMAGE_MULT : 1);
          if (typeof player.takeDamage === 'function') {
            player.takeDamage(crawlerDmg, 'crawler', c.mesh.position);
          } else {
            playerStats.hp -= crawlerDmg;
          }
          // Screen shake on player damage (0.25s minimum duration)
          const _cDmgRatio = _clamp(crawlerDmg / (playerStats.maxHp || 100), 0.003, 0.015);
          _triggerShake(_cDmgRatio, 0.25);
          if (playerStats && playerStats.hp <= 0) {
            playerStats.hp = 0;
            gameOver();
          }
        }
      }
    }
  }

  // ─── LEAPING SLIME ENEMY ─────────────────────────────────────────────────────

  /** Apply a projectile hit to a leaping slime. */
  function _hitLeapingSlime(projectile, enemy) {
    if (!enemy || !enemy.active || enemy.dead || enemy.dying) return;

    if (enemy.woundPool && enemy.woundCount >= enemy.woundPool.length) enemy.woundCount = 0;

    const weaponKey   = (projectile && projectile.weaponKey) || (weapons && weapons.gun ? 'gun' : 'pistol');
    const weaponLevel = (weapons && weapons[weaponKey] && weapons[weaponKey].level) || (weapons && weapons.gun ? (weapons.gun.level || 1) : 1);
    const hitForce    = 1.0 + (weaponLevel - 1) * 0.15;

    // Build hit-point and direction vectors from projectile position
    _tmpV3.set(
      enemy.mesh.position.x,
      enemy.mesh.position.y + enemy.size,
      enemy.mesh.position.z
    );
    var hitNormal = null;
    var bulletDir = null;
    if (projectile && projectile.vx !== undefined) {
      const spd = Math.sqrt(projectile.vx * projectile.vx + projectile.vz * projectile.vz) || 1;
      hitNormal = _leapHitNormal.set(-projectile.vx / spd, 0, -projectile.vz / spd);
      bulletDir = _leapBulletDir.set(projectile.vx / spd, 0, projectile.vz / spd);
    }

    // Critical hit check (uses same playerStats as slimes)
    const critChance = (playerStats && playerStats.critChance != null) ? playerStats.critChance : 0.10;
    const isCrit = Math.random() < critChance;
    const critMult = isCrit ? (playerStats && playerStats.critDmg ? playerStats.critDmg : 1.5) : 1.0;

    // Apply hit — the LeapingSlimeEnemy.receiveHit applies base damage; scale by crit
    const result = window.LeapingSlimePool
      ? window.LeapingSlimePool.hit(enemy, weaponKey, weaponLevel, _tmpV3, hitNormal, bulletDir)
      : null;

    const leapStrMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
    const actualDmg = result
      ? Math.round(result.damage * (isCrit ? critMult : 1.0) * leapStrMult)
      : Math.round(15 * hitForce * critMult * leapStrMult);

    // Extra crit+strength damage not already applied inside receiveHit.
    if (result) {
      const extraDmg = Math.round(result.damage * ((isCrit ? critMult : 1.0) * leapStrMult - 1.0));
      if (extraDmg > 0) {
        enemy.hp -= extraDmg;
        if (enemy.hp < 0) enemy.hp = 0;
      }
    }

    // Floating damage text — reuse _tmpV3b to avoid _tmpV3.clone() allocation
    _tmpV3b.set(_tmpV3.x, _tmpV3.y + 0.5, _tmpV3.z);
    if (isCrit) {
      createFloatingText(actualDmg, _tmpV3b, '#FFD700', actualDmg);
      _showDamageNumber(_tmpV3.x, _tmpV3.y + 0.5, _tmpV3.z, actualDmg, enemy.hp <= 0, true);
      _tmpV3b.y += 0.4;
      createFloatingText('Critical', _tmpV3b, '#FF4400', 0);
    } else {
      createFloatingText(actualDmg, _tmpV3b, '#00CFFF', actualDmg);
      _showDamageNumber(_tmpV3.x, _tmpV3.y + 0.5, _tmpV3.z, actualDmg, enemy.hp <= 0, false);
    }

    // Light-blue blood burst (DeepSkyBlue) — use BloodV2 rawBurst if available
    const bx = enemy.mesh.position.x, by = enemy.mesh.position.y + enemy.size, bz = enemy.mesh.position.z;
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(bx, by, bz, 6, { enemyType: 'leaping_slime' });
    } else if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst({ x: bx, y: by, z: bz }, 5, { spreadXZ: 1.0, spreadY: 0.4 });
    }

    // GoreSim hit reaction
    if (window.GoreSim && typeof GoreSim.onHit === 'function') {
      GoreSim.onHit(enemy, weaponKey, _tmpV3, hitNormal);
    }

    // Bullet hole decal
    if (projectile && enemy.mesh) {
      const len = Math.sqrt((projectile.vx || 0) * (projectile.vx || 0) + (projectile.vz || 0) * (projectile.vz || 0)) || 1;
      const nhx = (projectile.vx || 0) / len;
      const nhz = (projectile.vz || 0) / len;
      _addEnemyBulletHole(enemy, enemy.mesh, nhx, nhz, enemy.size * 1.1, enemy.size * 0.35);
    }

    // Screen shake (lighter than green slime — it's smaller)
    const hpRatio = enemy.hp / enemy.maxHp;
    const shakeAmt = hpRatio < 0.33 ? SHAKE_HEAVY_INTENSITY * 0.6
                   : hpRatio < 0.66 ? SHAKE_MID_INTENSITY   * 0.6
                   :                  SHAKE_LIGHT_INTENSITY  * 0.6;
    _triggerShake(shakeAmt);

    if (enemy.hp <= 0) {
      _triggerProjectileExplosion(projectile, enemy.mesh.position.x, enemy.mesh.position.z);
      _killLeapingSlime(enemy, hitForce, projectile ? projectile.vx || 0 : 0, projectile ? projectile.vz || 0 : 0, weaponKey);
    } else {
      _triggerProjectileExplosion(projectile, enemy.mesh.position.x, enemy.mesh.position.z);
      _placeBloodStain(enemy.mesh.position.x, enemy.mesh.position.z, 0.15 + Math.random() * 0.25);
    }
  }

  /** Kill a leaping slime, spawn loot and effects. */
  function _killLeapingSlime(enemy, hitForce, killVX, killVZ, weaponKey) {
    if (!enemy || enemy.dead) return;
    // Remove any skin flaps before kill FX
    _removeSkinFlaps(enemy);
    const x = enemy.mesh.position.x;
    const y = enemy.mesh.position.y + enemy.size;
    const z = enemy.mesh.position.z;
    const weaponType = _normalizeWeaponKey(weaponKey);
    const killVariant = _pickKillVariant();

    // Hit-stop & camera shake (lighter than green slime kill)
    _triggerHitStop(HIT_STOP_KILL_DURATION_MS * 0.8);
    _triggerShake(SHAKE_KILL_BASE * 0.7 + Math.min(SHAKE_KILL_CAP * 0.7, (hitForce - 1) * SHAKE_KILL_SCALE));

    let burstCount = 60;
    let burstOpts  = { enemyType: 'leaping_slime', spdMin: 2.5, spdMax: 10.0, rMin: 0.008, rMax: 0.022, life: 3.0, visc: 0.55 };
    let chunkColors = [0x00bfff, 0x0090cc, 0x005f99, 0x00ffff];
    let chunkCount  = 4 + Math.floor(Math.random() * 3);
    let chunkForce  = null;
    let stainScale  = 1.0;
    let slideScale  = 0.5;
    let corpseLinger = 8;
    let extraFx = null;

    switch (weaponType) {
      case 'shotgun':
        burstCount = 100;
        burstOpts.spdMin = 5; burstOpts.spdMax = 16; burstOpts.rMax = 0.030;
        chunkCount = 7 + Math.floor(Math.random() * 4);
        stainScale = 1.35;
        slideScale = 1.0;
        chunkForce = { dirX: killVX || 0, dirZ: killVZ || 0, power: 0.70, spread: 0.55 };
        if (killVariant === 1) {
          extraFx = function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(x, y + 0.1, z, 30, { enemyType: 'leaping_slime', spdMin: 6, spdMax: 12, rMin: 0.009, rMax: 0.022, life: 2.8 });
            }
          };
        } else if (killVariant === 2) {
          chunkCount = 10;
          slideScale = 1.2;
        }
        break;
      case 'sword':
        burstCount = 45;
        burstOpts.spdMin = 2.0; burstOpts.spdMax = 9.0;
        burstOpts.rMin = 0.007; burstOpts.rMax = 0.021;
        chunkCount = 6;
        slideScale = 0.7;
        chunkForce = { dirX: (killVX || 0.5), dirZ: (killVZ || 0), power: 0.45, spread: 0.35 };
        if (killVariant === 2 && enemy.mesh) {
          enemy.mesh.rotation.y += (Math.random() < 0.5 ? -1 : 1) * 0.35;
        }
        break;
      case 'fire':
        burstCount = 40;
        burstOpts = { enemyType: 'leaping_slime', color: 0x336699, spdMin: 2.2, spdMax: 8.5, rMin: 0.007, rMax: 0.020, life: 2.6, visc: 0.70 };
        chunkColors = [0x225a7a, 0x1a3c52, 0x11232f];
        chunkCount = 5;
        stainScale = 1.1;
        slideScale = 0.3;
        corpseLinger = 10;
        if (killVariant === 2) {
          extraFx = function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(x, y + 0.05, z, 26, { color: 0xff6600, spdMin: 3, spdMax: 9, rMin: 0.008, rMax: 0.021, life: 2.5 });
            }
          };
        }
        break;
    }

    // Light-blue gore burst
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(x, y, z, burstCount, burstOpts);
    } else if (window.BloodSystem) {
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst({ x, y, z }, burstCount, { spreadXZ: 2.5, spreadY: 1.0, minLife: 40, maxLife: 100 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts({ x, y, z }, 6);
      }
    }
    if (extraFx) extraFx();

    // GoreSim kill
    if (window.GoreSim && typeof GoreSim.onKill === 'function') {
      GoreSim.onKill(enemy, _goreSimWeaponKey(weaponKey), null);
    }

    // Spawn blue slime flesh chunks
    _spawnFleshChunks(enemy, chunkCount, false, chunkColors, chunkForce);

    _placeBloodStain(x, z, (0.15 + Math.random() * 0.25) * stainScale);

    // Remove from active list
    const idx = _activeLeapingSlimes.indexOf(enemy);
    if (idx !== -1) _activeLeapingSlimes.splice(idx, 1);

    // Trigger death animation inside the instance — set _tmpV3 to kill position first
    // Set death slide velocities before calling _die so _updateDeath can use them
    enemy._deathSlideVX = (killVX || 0) * slideScale;
    enemy._deathSlideVZ = (killVZ || 0) * slideScale;
    _tmpV3.set(x, y, z);
    enemy._die(_goreSimWeaponKey(weaponKey), _tmpV3);

    // Linger corpse duration is driven by corpseLinger
    const _cbSlot3 = _acquireCorpseBlood(x, 0.03, z, 0x007799, 0.5);
    _activeCorpses.push({
      slot: enemy, timer: 0, lingerDuration: corpseLinger, bloodTimer: 0,
      poolMesh: _cbSlot3?.mesh || null, poolMat: _cbSlot3?.mat || null, poolSlot: _cbSlot3 || null, x, z
    });

    // ══════════ NEW XP STAR SYSTEM V2 ══════════
    // Leaping slime drops grey/white stars (common)
    const killDamage = enemy.maxHp * hitForce;

    if (window.XPStarSystem) {
      XPStarSystem.spawn(x, y, z, 'leaping_slime', killDamage, killVX || 0, killVZ || 0);

      // Bonus star (17.25% chance)
      if (Math.random() < BONUS_XP_DROP_RATE) {
        XPStarSystem.spawn(x, y, z, 'leaping_slime', killDamage * 0.7, killVX || 0, killVZ || 0);
      }
    }

    // ══════════ GOLD COIN DROP ══════════
    if (Math.random() < GOLD_DROP_CHANCE) {
      const goldValue = GOLD_AMOUNT_MIN + Math.floor(Math.random() * (GOLD_AMOUNT_MAX - GOLD_AMOUNT_MIN + 1));
      _spawnGoldCoin(x, z, goldValue);
    }

    playerStats.kills++;
    _incrementKillCombo();
    _updateKillCountHUD();
    // Boss hit-stop
    if (enemy.isBoss) {
      if (_hitStopRemaining < 120) _hitStopRemaining = 120;
      if (saveData.tutorialQuests) saveData.tutorialQuests.firstBossDefeated = true;
    }
    // Run quest kill tracking (CHANGE 1)
    _sandboxRunKills++;
    if (saveData.tutorialQuests) saveData.tutorialQuests.killsThisRun = _sandboxRunKills;
    _checkSandboxRunQuestProgress();
    if (window.GameRageCombat && typeof GameRageCombat.addRage === 'function') {
      GameRageCombat.addRage(8);
    }
    // Achievement + stat tracking
    if (saveData) {
      if (saveData.stats) saveData.stats.totalKills = (saveData.stats.totalKills || 0) + 1;
      saveData.totalKills = (saveData.totalKills || 0) + 1;
    }
    if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(2, 'Kill', saveData);
    // Codex discovery
    if (window.CodexSystem && typeof window.CodexSystem.discover === 'function') {
      var _codexData = saveData && saveData.codexData;
      if (!_codexData || !_codexData.discovered || !_codexData.discovered['enemy_fast']) {
        window.CodexSystem.discover('enemy_fast');
        if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(5, 'Codex Discovery', saveData);
      }
    }
    _checkSandboxAchievements();
    SeqWaveManager.onEnemyKilled('leaping_slime');
  }

  /** Spawn one leaping slime near the player. */
  function _spawnLeapingSlime() {
    if (!window.LeapingSlimePool || !player || !player.mesh) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 9 + Math.random() * 6;
    const px    = player.mesh.position.x;
    const pz    = player.mesh.position.z;
    const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const waveLevel = Math.floor(_waveSize / 3) + 1;
    const e = LeapingSlimePool.spawn(rx, rz, waveLevel);
    if (e && _activeLeapingSlimes.indexOf(e) === -1) {
      _activeLeapingSlimes.push(e);
    }
  }

  /** Update leaping slimes: pool tick, contact damage to player, cleanup dead. */
  function _updateLeapingSlimes(dt) {
    if (!window.LeapingSlimePool || !player || !player.mesh) return;
    const playerPos = player.mesh.position;
    LeapingSlimePool.update(_bloodMoonActive ? dt * BLOOD_MOON_SPEED_MULT : dt, playerPos);

    const LEAPING_CONTACT_RADIUS =
      window.LEAP_CFG && typeof LEAP_CFG.ATTACK_RANGE === 'number'
        ? LEAP_CFG.ATTACK_RANGE
        : 1.0; // fallback: smaller than green slime (0.75 base size)
    const LEAPING_DAMAGE  = window.LEAP_CFG ? LEAP_CFG.BASE_DAMAGE    : 15;
    const LEAPING_COOLDOWN = window.LEAP_CFG ? LEAP_CFG.ATTACK_COOLDOWN : 500;

    for (let i = _activeLeapingSlimes.length - 1; i >= 0; i--) {
      const e = _activeLeapingSlimes[i];
      if (!e.active || e.dead) {
        _activeLeapingSlimes.splice(i, 1);
        continue;
      }
      // Skip dying ones (still animating their death)
      if (e.dying) continue;

      // Contact damage to player
      const dx   = playerPos.x - e.mesh.position.x;
      const dz   = playerPos.z - e.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < LEAPING_CONTACT_RADIUS && !player.invulnerable) {
        const now = Date.now();
        if (now - e.lastDamageTime > LEAPING_COOLDOWN) {
          e.lastDamageTime = now;
          const leapingDmgEffective = LEAPING_DAMAGE * (_bloodMoonActive ? BLOOD_MOON_DAMAGE_MULT : 1);
          if (typeof player.takeDamage === 'function') {
            player.takeDamage(leapingDmgEffective, 'leaping_slime', e.mesh.position);
          } else {
            playerStats.hp -= leapingDmgEffective;
          }
          // Screen shake on player damage (0.25s minimum duration)
          const _lDmgRatio = _clamp(leapingDmgEffective / (playerStats.maxHp || 100), 0.003, 0.015);
          _triggerShake(_lDmgRatio, 0.25);
          if (playerStats && playerStats.hp <= 0) {
            playerStats.hp = 0;
            gameOver();
          }
        }
      }
    }
  }

  // ─── 5-PART GORE SYSTEM ───────────────────────────────────────────────────────
  /**
   * Acquire the next available pre-allocated wound mesh from the slot's pool.
   * Returns null if the pool is exhausted (won't happen within 11 wounds).
   */
  function _acquireWound(slot, woundColor) {
    if (!slot.woundPool || slot.woundCount >= slot.woundPool.length) return null;
    const wound = slot.woundPool[slot.woundCount++];
    wound.material.color.setHex(woundColor || 0x660000);
    wound.visible = true;
    return wound;
  }

  // Stage 1: 75% HP - Darken appearance, add first wounds, start arterial bleeding
  function _applyDamageStage1(slot) {
    slot.mesh.material.color.setHex(0x44CC33);
    slot.mesh.material.emissiveIntensity = 0.15;

    for (let i = 0; i < 2; i++) {
      const wound = _acquireWound(slot, 0x660000);
      if (wound) {
        const angle = Math.random() * Math.PI * 2;
        const height = -0.2 + Math.random() * 0.6;
        wound.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
      }
    }

    const _bPos1 = _reusableBloodPos;
    _bPos1.x = slot.mesh.position.x; _bPos1.y = slot.mesh.position.y + 0.4; _bPos1.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      // Increased from 8 to 10 to match old map realism
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos1, 10, { spreadXZ: 0.8, spreadY: 0.4, minLife: 50, maxLife: 100 });
      }
      // Start pulsing heartbeat bleed (arterial spurts from wound)
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos1, { pulses: 4, perPulse: 80, interval: 400, woundHeight: 0.6 });
      }
      // ADD: Arterial spurt effect like old map (narrow jet, high pressure)
      if (typeof BloodSystem.emitArterialSpurt === 'function') {
        const facingDir = { x: Math.cos(Math.random() * Math.PI * 2), z: Math.sin(Math.random() * Math.PI * 2) };
        BloodSystem.emitArterialSpurt(_bPos1, facingDir, {
          pulses: 5,
          perPulse: 50,
          interval: 180,
          intensity: 0.7,
          coneAngle: 0.3
        });
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.6, slot.mesh.position.z);
    // Damage stage text removed — keep screen clean (only damage numbers + Critical)
  }

  // Stage 2: 50% HP - More wounds, flesh chunks start flying
  function _applyDamageStage2(slot) {
    slot.mesh.material.color.setHex(0x33AA22);

    for (let i = 0; i < 2; i++) {
      const wound = _acquireWound(slot, 0x550000);
      if (wound) {
        const angle = Math.random() * Math.PI * 2;
        const height = -0.2 + Math.random() * 0.6;
        wound.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
      }
    }

    _spawnFleshChunks(slot, 4 + Math.floor(Math.random() * 4), false, slot.mesh.material.color.getHex());
    var stageColor2 = slot.mesh.material.color.getHex();
    _spawnFleshChunks(slot, 2 + Math.floor(Math.random() * 2), false, [stageColor2]);

    const _bPos2 = _reusableBloodPos;
    _bPos2.x = slot.mesh.position.x; _bPos2.y = slot.mesh.position.y + 0.4; _bPos2.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      // Tuned burst count to 18 to match old map impact
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos2, 18, { spreadXZ: 1.5, spreadY: 0.6, minLife: 50, maxLife: 100 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos2, 6);
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos2, { pulses: 3, perPulse: 25, interval: 200, woundHeight: 0.8 });
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.7, slot.mesh.position.z);
    // Damage stage text removed — keep screen clean (only damage numbers + Critical)
  }

  // Stage 3: 35% HP - Body parts breaking off, heavy bleeding
  function _applyDamageStage3(slot) {
    slot.mesh.material.color.setHex(0x228811);
    slot.mesh.material.transparent = true; // enable for partial opacity render
    slot.mesh.material.opacity = 0.85;
    slot.mesh.scale.set(0.92, 0.92, 0.92);

    for (let i = 0; i < 3; i++) {
      const wound = _acquireWound(slot, 0x440000);
      if (wound) {
        const angle = Math.random() * Math.PI * 2;
        const height = -0.2 + Math.random() * 0.6;
        wound.position.set(Math.cos(angle) * 0.45, height, Math.sin(angle) * 0.45);
      }
    }

    _spawnFleshChunks(slot, 6 + Math.floor(Math.random() * 6), false, slot.mesh.material.color.getHex());
    var stageColor3 = slot.mesh.material.color.getHex();
    _spawnFleshChunks(slot, 3 + Math.floor(Math.random() * 3), false, [stageColor3]);

    const _bPos3 = _reusableBloodPos;
    _bPos3.x = slot.mesh.position.x; _bPos3.y = slot.mesh.position.y + 0.4; _bPos3.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      // Burst count tuned to 25 to approximate old map's sniper hit intensity
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos3, 25, { spreadXZ: 2.0, spreadY: 0.8, minLife: 50, maxLife: 100 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos3, 12);
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos3, { pulses: 4, perPulse: 30, interval: 180, woundHeight: 1.0 });
      }
      if (typeof BloodSystem.emitExitWound === 'function') {
        const a = Math.random() * Math.PI * 2;
        BloodSystem.emitExitWound(_bPos3, { x: Math.cos(a) * 0.3, y: 0.1, z: Math.sin(a) * 0.3 });
      }
      // ADD: Throat spray effect (fan spray like old map)
      if (typeof BloodSystem.emitThroatSpray === 'function') {
        const facingDir = { x: Math.cos(Math.random() * Math.PI * 2), z: Math.sin(Math.random() * Math.PI * 2) };
        BloodSystem.emitThroatSpray(_bPos3, facingDir, {
          pulses: 6,
          perPulse: 50,
          interval: 180
        });
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.8, slot.mesh.position.z);
    // Damage stage text removed — keep screen clean (only damage numbers + Critical)
  }

  // Stage 4: 20% HP - Near death, chunks flying everywhere
  function _applyDamageStage4(slot) {
    slot.mesh.material.color.setHex(0x116600);
    slot.mesh.material.transparent = true; // enable for partial opacity render
    slot.mesh.material.opacity = 0.75;
    slot.mesh.material.emissiveIntensity = 0.05;
    slot.mesh.scale.set(0.85, 0.85, 0.85);

    for (let i = 0; i < 4; i++) {
      const wound = _acquireWound(slot, 0x330000);
      if (wound) {
        const angle = Math.random() * Math.PI * 2;
        const height = -0.2 + Math.random() * 0.6;
        wound.position.set(Math.cos(angle) * 0.4, height, Math.sin(angle) * 0.4);
      }
    }

    _spawnFleshChunks(slot, 8 + Math.floor(Math.random() * 6), true, slot.mesh.material.color.getHex());
    var stageColor4 = slot.mesh.material.color.getHex();
    _spawnFleshChunks(slot, 4 + Math.floor(Math.random() * 3), true, [stageColor4]);

    const _bPos4 = _reusableBloodPos;
    _bPos4.x = slot.mesh.position.x; _bPos4.y = slot.mesh.position.y + 0.4; _bPos4.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos4, 15, { spreadXZ: 2.5, spreadY: 1.0 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos4, 18);
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos4, { pulses: 4, perPulse: 35, interval: 200, woundHeight: 1.2, pressure: 1.3 });
      }
      if (typeof BloodSystem.emitExitWound === 'function') {
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          BloodSystem.emitExitWound(_bPos4, { x: Math.cos(a) * 0.4, y: 0.15, z: Math.sin(a) * 0.4 });
        }
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.9, slot.mesh.position.z);
    // Damage stage text removed — keep screen clean (only damage numbers + Critical)
  }

  // ─── Blood ground stain decal pool ───────────────────────────────────────────
  // Pre-allocated circular planes placed on the floor at enemy kill/hit positions.
  // Uses a ring-buffer so oldest stains are recycled when the pool is full.
  const BLOOD_STAIN_POOL_SIZE = 30;
  const _bloodStainPool = [];
  let _bloodStainHead = 0; // ring-buffer index

  function _buildBloodStainPool() {
    const stainGeo = new THREE.CircleGeometry(0.8, 16);
    for (let i = 0; i < BLOOD_STAIN_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x550000,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(stainGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.06, 0);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      _bloodStainPool.push({ mesh, fadeTimer: 0 });
    }
  }

  function _buildCorpseBloodPool() {
    const geo = new THREE.CircleGeometry(0.1, 10);
    for (let i = 0; i < CORPSE_BLOOD_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x550000,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.06, 0);
      mesh.visible = false;
      scene.add(mesh);
      const slot = { mesh, mat };
      _corpseBloodPool.push(slot);
      _corpseBloodFreeList.push(slot);
    }
  }

  function _acquireCorpseBlood(x, y, z, color, opacity) {
    if (_corpseBloodFreeList.length === 0) return null;
    const slot = _corpseBloodFreeList.pop();
    slot.mesh.scale.set(0.2, 0.2, 0.2);
    slot.mesh.position.set(x, y, z);
    slot.mat.color.setHex(color || 0x550000);
    slot.mat.opacity = (typeof opacity === 'number') ? opacity : 0.75;
    slot.mesh.visible = true;
    return slot;
  }

  /**
   * Place a blood stain at (x, z) when an enemy dies.
   * Stains fade in quickly and then very slowly fade out over ~20 seconds.
   */
  function _placeBloodStain(x, z, sizeOverride) {
    const slot = _bloodStainPool[_bloodStainHead % BLOOD_STAIN_POOL_SIZE];
    _bloodStainHead++;
    if (!slot) return;
    const size = sizeOverride !== undefined ? sizeOverride : (0.6 + Math.random() * 0.9);
    slot.mesh.scale.set(size, size, size);
    slot.mesh.position.set(x + (Math.random() - 0.5) * 0.3, 0.06, z + (Math.random() - 0.5) * 0.3);
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    slot.mesh.material.opacity = 0;
    slot.mesh.visible = true;
    slot.fadeTimer = 20.0; // seconds to live
    slot.fadeIn = 0.5; // seconds to fade in
    slot.age = 0;
  }

  function _updateBloodStains(dt) {
    for (let i = 0; i < _bloodStainPool.length; i++) {
      const s = _bloodStainPool[i];
      if (!s.mesh.visible) continue;
      s.age += dt;
      if (s.age < s.fadeIn) {
        s.mesh.material.opacity = Math.min(0.7, (s.age / s.fadeIn) * 0.7);
      } else {
        const remaining = s.fadeTimer - s.age;
        s.mesh.material.opacity = Math.max(0, (remaining / (s.fadeTimer - s.fadeIn)) * 0.7);
        if (remaining <= 0) {
          s.mesh.visible = false;
          s.mesh.material.opacity = 0;
        }
      }
    }
  }

  // ─── Flesh chunk object pool ──────────────────────────────────────────────────
  // Pre-allocated pool prevents new THREE.Mesh calls during gameplay
  const FLESH_POOL_SIZE = 80;
  let _fleshPool = [];

  // ─── Bullet hole decal pool ───────────────────────────────────────────────────
  // Pre-allocated circular decals for ground bullet impacts when projectiles miss
  const BULLET_HOLE_POOL_SIZE = 50;
  const _bulletHolePool = [];
  let _bulletHoleHead = 0; // ring-buffer index

  function _buildBulletHolePool() {
    const holeGeo = new THREE.CircleGeometry(0.08, 8);
    for (let i = 0; i < BULLET_HOLE_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(holeGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.015, 0);
      mesh.visible = false;
      scene.add(mesh);
      _bulletHolePool.push({ mesh, fadeTimer: 0 });
    }
  }

  /**
   * Place a bullet hole decal at (x, z) when a projectile hits the ground.
   * Holes fade in quickly and slowly fade out over ~15 seconds.
   */
  function _placeBulletHole(x, z) {
    const slot = _bulletHolePool[_bulletHoleHead % BULLET_HOLE_POOL_SIZE];
    _bulletHoleHead++;
    if (!slot) return;
    const size = 0.7 + Math.random() * 0.4;
    slot.mesh.scale.set(size, size, size);
    slot.mesh.position.set(x + (Math.random() - 0.5) * 0.05, 0.015, z + (Math.random() - 0.5) * 0.05);
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    slot.mesh.material.opacity = 0;
    slot.mesh.visible = true;
    slot.fadeTimer = 15.0; // seconds to live
    slot.fadeIn = 0.15; // seconds to fade in (quick)
    slot.age = 0;
  }

  function _updateBulletHoles(dt) {
    for (let i = 0; i < _bulletHolePool.length; i++) {
      const h = _bulletHolePool[i];
      if (!h.mesh.visible) continue;
      h.age += dt;
      if (h.age < h.fadeIn) {
        h.mesh.material.opacity = Math.min(0.85, (h.age / h.fadeIn) * 0.85);
      } else {
        const remaining = h.fadeTimer - h.age;
        h.mesh.material.opacity = Math.max(0, (remaining / (h.fadeTimer - h.fadeIn)) * 0.85);
        if (remaining <= 0) {
          h.mesh.visible = false;
          h.mesh.material.opacity = 0;
        }
      }
    }
  }

  function _buildFleshPool() {
    const colors = [0x33AA22, 0x228811, 0x116600, 0x55CC33];
    // Pre-create multiple geometries of different sizes to reuse
    const geoSmall = new THREE.BoxGeometry(0.1, 0.08, 0.12);
    const geoMed   = new THREE.BoxGeometry(0.18, 0.14, 0.22);
    const geoLarge = new THREE.BoxGeometry(0.25, 0.20, 0.30);
    for (let i = 0; i < FLESH_POOL_SIZE; i++) {
      const geo = i % 3 === 0 ? geoLarge : i % 3 === 1 ? geoMed : geoSmall;
      const mat = new THREE.MeshPhongMaterial({
        color: colors[i % colors.length],
        shininess: 20
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      _fleshPool.push({
        mesh,
        vx: 0, vy: 0, vz: 0,
        rotSpeedX: 0, rotSpeedY: 0, rotSpeedZ: 0,
        life: 0,
        onGround: false,
        active: false,
        isLarge: (i % 3 === 0)
      });
    }
  }

  function _acquireFleshChunk() {
    for (let i = 0; i < _fleshPool.length; i++) {
      if (!_fleshPool[i].active) return _fleshPool[i];
    }
    return null; // pool exhausted (won't happen with 80 slots in practice)
  }

  function _releaseFleshChunk(chunk) {
    chunk.active = false;
    chunk.mesh.visible = false;
    chunk.mesh.material.transparent = false;
    chunk.mesh.material.opacity = 1;
  }

  // Shared geometry for skin-flap meshes spawned by shockwave skin-rip zones.
  // Created lazily once on first shockwave, reused for all subsequent skin flaps.
  let _skinFlapGeo = null;

  // Removes all skin-flap child meshes from enemy.mesh and disposes their materials.
  // Must be called from every deactivation/kill path to prevent accumulation on pooled enemies.
  function _removeSkinFlaps(enemy) {
    if (!enemy || !enemy.mesh) return;
    try {
      for (let _rfi = enemy.mesh.children.length - 1; _rfi >= 0; _rfi--) {
        const _ch = enemy.mesh.children[_rfi];
        if (_ch && _ch.userData && _ch.userData.isSkinFlap) {
          enemy.mesh.remove(_ch);
          if (_ch.material) _ch.material.dispose();
        }
      }
      enemy.isSkinned = false;
    } catch(_rfe) { /* visual-only — suppress */ }
  }

  // Spawns 2-4 skin-flap PlaneGeometry meshes as children of enemy.mesh.
  // origColor is the hex color of the skin flap (typically e._originalColor).
  // All errors are silently suppressed — this is a visual-only effect.
  function _spawnSkinFlaps(enemy, origColor) {
    if (!enemy || !enemy.mesh) return;
    // Remove any existing flaps first (e.g. double shockwave hit)
    _removeSkinFlaps(enemy);
    try {
      if (!_skinFlapGeo) _skinFlapGeo = new THREE.PlaneGeometry(0.06, 0.06);
      const flapCount = 2 + Math.floor(Math.random() * 3);
      for (let fi = 0; fi < flapCount; fi++) {
        const flapMat = new THREE.MeshBasicMaterial({
          color: origColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85
        });
        const flap = new THREE.Mesh(_skinFlapGeo, flapMat);
        flap.userData.isSkinFlap = true; // tag for cleanup
        flap.position.set(
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3,
          0.08 + Math.random() * 0.07
        );
        flap.rotation.set(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          Math.random() * Math.PI * 2
        );
        enemy.mesh.add(flap);
      }
    } catch(e2) { /* visual-only — suppress to prevent game disruption */ }
  }

  // Spawn flying flesh chunks using pre-allocated pool (no new THREE.Mesh during gameplay)
  // color parameter can be either a single hex color or an array of colors to choose from
  // forceOpts (optional 5th param): { dirX, dirZ, power, spread } — applies a strong
  //   directional launch so chunks fly 5-7 m in the knockback direction before landing.
  //   physics is per-frame (no dt): vy=0.25-0.40 keeps chunks airborne ~20-32 frames,
  //   horizontal power 0.28-0.38 gives ~5.6-12 m travel before ground-friction stops them.
  function _spawnFleshChunks(slot, count, large, color, forceOpts) {
    const pos = slot.mesh.position;
    // Derive default chunk color from the enemy's actual body material
    const _slotBaseColor = (slot.mesh && slot.mesh.material && slot.mesh.material.color)
      ? slot.mesh.material.color.getHex()
      : (slot.body && slot.body.material && slot.body.material.color
         ? slot.body.material.color.getHex()
         : 0xCC4422);
    const chunkColors = Array.isArray(color) ? color : (color ? [color] : [_slotBaseColor]);

    for (let i = 0; i < count; i++) {
      const chunk = _acquireFleshChunk();
      if (!chunk) break; // pool exhausted — skip excess chunks

      // Set chunk color from the provided color array
      chunk.mesh.material.color.setHex(chunkColors[i % chunkColors.length]);

      const angle = Math.random() * Math.PI * 2;
      chunk.mesh.position.set(
        pos.x + Math.cos(angle) * 0.3,
        pos.y + 0.3 + Math.random() * 0.3,
        pos.z + Math.sin(angle) * 0.3
      );
      chunk.mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      if (forceOpts && isFinite(forceOpts.dirX) && isFinite(forceOpts.dirZ)) {
        // High-force directional launch: biased strongly toward knockback direction
        const _fPow    = (forceOpts.power  !== undefined && isFinite(forceOpts.power))  ? forceOpts.power  : 0.30;
        const _fSpread = (forceOpts.spread !== undefined && isFinite(forceOpts.spread)) ? forceOpts.spread : 0.35;
        chunk.vx = forceOpts.dirX * _fPow + (Math.random() - 0.5) * _fSpread;
        chunk.vy = 0.25 + Math.random() * 0.15; // stay airborne 20-32 frames at 60fps
        chunk.vz = forceOpts.dirZ * _fPow + (Math.random() - 0.5) * _fSpread;
      } else {
        chunk.vx = (Math.random() - 0.5) * 0.12;
        chunk.vy = 0.08 + Math.random() * 0.12;
        chunk.vz = (Math.random() - 0.5) * 0.12;
      }
      chunk.rotSpeedX = (Math.random() - 0.5) * 0.3;
      chunk.rotSpeedY = (Math.random() - 0.5) * 0.3;
      chunk.rotSpeedZ = (Math.random() - 0.5) * 0.3;
      chunk.life = 2.0 + Math.random() * 1.0;
      chunk.onGround = false;
      chunk.active = true;
      chunk.mesh.material.transparent = false;
      chunk.mesh.material.opacity = 1;
      chunk.mesh.visible = true;
      _allFleshChunks.push(chunk);
    }
  }

  // ─── EXP Gem Object Pool ──────────────────────────────────────────────────────
  // Pre-allocates POOL_SIZE_GEMS ExpGem instances once at boot so no new THREE.Mesh
  // is created during gameplay when enemies are killed.
  function _buildExpGemPool() {
    if (typeof ExpGem === 'undefined') return; // gem-classes.js not loaded
    for (let i = 0; i < POOL_SIZE_GEMS; i++) {
      const gem = new ExpGem(0, 0, 'gun', 1.0, 0);
      gem._pooled = true;
      gem._returnToPool = function (g) { _expGemFreeList.push(g); };
      // Ensure gem mesh belongs to the sandbox scene.
      // Compare against window.scene rather than checking for any parent, so a gem
      // that was added to a different scene is correctly re-parented here.
      if (gem.mesh && window.scene && gem.mesh.parent !== window.scene) {
        window.scene.add(gem.mesh);
      }
      gem.deactivate(); // park off-screen (sets active=false, visible=false)
      _expGemPool.push(gem);
      _expGemFreeList.push(gem);
    }
    console.log('[SandboxLoop] EXP gem pool built: ' + POOL_SIZE_GEMS + ' slots');
  }

  /** Acquire a pooled gem, reset it to position (x, z), and return it.
   *  Falls back to creating a new ExpGem if the pool is exhausted. */
  function _acquireExpGem(x, z, sourceWeapon, hitForce, enemyType) {
    if (_expGemFreeList.length > 0) {
      const gem = _expGemFreeList.pop();
      gem.reset(x, z, sourceWeapon, hitForce, enemyType);
      // Re-parent to sandbox scene if necessary (handles scene-switch edge cases)
      if (gem.mesh && window.scene && gem.mesh.parent !== window.scene) {
        window.scene.add(gem.mesh);
      }
      if (gem.mesh) gem.mesh.visible = true;
      // Start grow timer at 0.15 so the star is already ~15% size on the first
      // rendered frame — makes it immediately perceptible rather than 1% scale.
      if (gem._growTimer !== undefined) gem._growTimer = 0.15;
      return gem;
    }
    // Pool exhausted (shouldn't happen with 40 slots in a single-player sandbox)
    if (typeof ExpGem !== 'undefined') {
      const gem = new ExpGem(x, z, sourceWeapon, hitForce, enemyType);
      gem._pooled = false; // not pooled — will be disposed normally on collect
      // ExpGem constructor already called scene.add; re-parent if needed
      if (gem.mesh && window.scene && gem.mesh.parent !== window.scene) {
        window.scene.add(gem.mesh);
      }
      if (gem._growTimer !== undefined) gem._growTimer = 0.15;
      return gem;
    }
    return null;
  }

  // ─── Pooled PointLight Flash System ──────────────────────────────────────────
  // Pre-allocates FLASH_POOL_SIZE PointLights at boot so muzzle flashes and hit
  // lights never create new THREE.PointLight during gameplay.
  // Exposes window._acquireFlash used by muzzle-flash-system.js.
  function _buildFlashPool() {
    for (let i = 0; i < FLASH_POOL_SIZE; i++) {
      const light = new THREE.PointLight(0xFFFFFF, 0, 10);
      light.visible = false;
      scene.add(light);
      _flashPool.push({
        light,
        timer: 0,
        duration: 1,
        maxIntensity: 0,
        active: false
      });
    }
    // Expose globally so muzzle-flash-system.js can call _acquireFlash at shot-time.
    // window._acquireFlash is called lazily (at fire-time), so it just needs to be
    // set before the first shot — _buildFlashPool() runs during boot, before gameplay.
    window._acquireFlash = function(sc, color, intensity, radius, pos, durationMs) {
      for (let i = 0; i < _flashPool.length; i++) {
        const f = _flashPool[i];
        if (f.active) continue;
        f.light.color.setHex(color);
        f.light.intensity = intensity;
        f.light.distance  = radius;
        f.light.position.copy(pos);
        f.light.visible   = true;
        f.maxIntensity    = intensity;
        f.duration        = Math.max(MIN_FLASH_DURATION_SEC, durationMs / 1000);
        f.timer           = f.duration;
        f.active          = true;
        return f;
      }
      return null; // pool exhausted — flash skipped (harmless visual miss)
    };
    console.log('[SandboxLoop] Flash pool built: ' + FLASH_POOL_SIZE + ' PointLight slots');
  }

  /** Tick every active flash — fades intensity as the timer runs out. */
  function _updateFlashPool(dt) {
    for (let i = 0; i < _flashPool.length; i++) {
      const f = _flashPool[i];
      if (!f.active) continue;
      f.timer -= dt;
      if (f.timer <= 0) {
        f.active          = false;
        f.light.visible   = false;
        f.light.intensity = 0;
      } else {
        // Smooth fade-out: intensity decays to 0 as timer reaches 0
        f.light.intensity = f.maxIntensity * (f.timer / f.duration);
      }
    }
  }

  function _updateFleshChunks(dt) {
    for (let i = _allFleshChunks.length - 1; i >= 0; i--) {
      const chunk = _allFleshChunks[i];

      chunk.life -= dt;
      if (chunk.life <= 0) {
        _releaseFleshChunk(chunk);
        _allFleshChunks.splice(i, 1);
        continue;
      }

      if (!chunk.onGround) {
        chunk.vy -= 0.025; // gravity
        chunk.mesh.position.x += chunk.vx;
        chunk.mesh.position.y += chunk.vy;
        chunk.mesh.position.z += chunk.vz;
        if (chunk.mesh.position.y <= 0.05) {
          chunk.mesh.position.y = 0.05;
          chunk.onGround = true;
          chunk.vy = 0;
          chunk.vx *= 0.3;
          chunk.vz *= 0.3;
        }
      } else {
        chunk.vx *= 0.92;
        chunk.vz *= 0.92;
        chunk.mesh.position.x += chunk.vx;
        chunk.mesh.position.z += chunk.vz;
      }

      chunk.mesh.rotation.x += chunk.rotSpeedX * dt;
      chunk.mesh.rotation.y += chunk.rotSpeedY * dt;
      chunk.mesh.rotation.z += chunk.rotSpeedZ * dt;

      if (chunk.life < 0.5 && chunk.mesh.material.opacity > 0) {
        chunk.mesh.material.transparent = true;
        chunk.mesh.material.opacity = chunk.life / 0.5;
      }
    }
  }

  // Update every active pool slot (movement, HP bar, contact damage)
  function _updateSlime(dt) {
    if (!player || !player.mesh) return;

    _updateFleshChunks(dt);

    const px = player.mesh.position.x, pz = player.mesh.position.z;
    const colors = [0x55EE44, 0x44CC33, 0x33AA22, 0x228811, 0x116600];

    for (let si = 0; si < _activeSlimes.length; si++) {
      const s = _activeSlimes[si];

      // HP bars removed

      // Flash on hit
      if (s.flashTimer > 0) {
        s.flashTimer -= dt;
        s.mesh.material.color.setHex(0xFFFFFF);
      } else {
        s.mesh.material.color.setHex(colors[s.damageStage] || 0x55EE44);
      }

      // Attack timer cooldown
      if (s.attackTimer > 0) s.attackTimer -= dt;

      // Get positions early for eye tracking and movement
      const sx = s.mesh.position.x, sz = s.mesh.position.z;

      // Enhanced breathing animation — constant pulsing/squishing for alive feel
      s.wobbleTime += dt * 3.5;
      const breathCycle = Math.sin(s.wobbleTime * 0.8) * 0.08; // Breathing scale factor
      const wobble   = Math.sin(s.wobbleTime) * 0.12;
      const wobbleY  = Math.sin(s.wobbleTime * 2.0) * 0.06; // secondary vertical bob

      // Eye tracking — pupils follow player (unless dead)
      if (s.eyePupils && !s.dead && player && player.mesh) {
        const eyeTrackingEnabled = true; // Can be disabled on death
        if (eyeTrackingEnabled) {
          // Calculate direction from slime to player
          const dirX = px - sx;
          const dirZ = pz - sz;
          const dirLength = Math.sqrt(dirX * dirX + dirZ * dirZ);
          if (dirLength > 0.1) {
            // Normalized direction
            const ndx = dirX / dirLength;
            const ndz = dirZ / dirLength;
            // Convert to local space (relative to slime's rotation)
            const angle = Math.atan2(dirX, dirZ) - s.mesh.rotation.y;
            const pupilOffsetX = Math.sin(angle) * 0.03; // Horizontal pupil movement
            const pupilOffsetZ = Math.cos(angle) * 0.03; // Depth pupil movement
            // Apply to each pupil
            for (var _epi = 0; _epi < s.eyePupils.length; _epi++) {
              s.eyePupils[_epi].position.x = pupilOffsetX;
              s.eyePupils[_epi].position.z = 0.06 + pupilOffsetZ;
            }
          }
        }
      }

      // ── Blinking eyes (feel alive) ──────────────────────────────
      if (s.eyeMeshes && s.eyeMeshes.length > 0 && !s.dead) {
        s.blinkTimer += dt;
        if (s.blinkTimer >= s.nextBlinkTime && !s.isBlinking) {
          s.isBlinking = true;
          s.blinkTimer = 0;
          s.nextBlinkTime = 2 + Math.random() * 4;
        }
        if (s.isBlinking) {
          const bp = Math.min(1, s.blinkTimer / 0.1);
          const eyeScaleY = bp < 0.5 ? Math.max(0.05, 1 - bp * 2) : Math.max(0.05, (bp - 0.5) * 2);
          for (var _ebi = 0; _ebi < s.eyeMeshes.length; _ebi++) s.eyeMeshes[_ebi].scale.y = eyeScaleY;
          if (bp >= 1) {
            s.isBlinking = false;
            s.blinkTimer = 0;
            for (var _ebi2 = 0; _ebi2 < s.eyeMeshes.length; _ebi2++) s.eyeMeshes[_ebi2].scale.y = 1;
          }
        }
      }

      // Squish animation on hit
      let squishX = 1.0, squishY = 1.0, squishZ = 1.0;
      if (s.squishTime > 0) {
        s.squishTime -= dt;
        const squishProgress = 1 - (s.squishTime / 0.3);
        const squishAmount = Math.sin(squishProgress * Math.PI) * 0.35;
        squishX = 1 + squishAmount;
        squishZ = 1 + squishAmount;
        squishY = 1 - squishAmount * 0.5;
      }

      // Lunge attack animation: flatten then extend forward
      let lungeScaleX = 1.0, lungeScaleY = 1.0, lungeScaleZ = 1.0;
      let lungeMoveX = 0, lungeMoveZ = 0;
      if (s.lungeTime > 0) {
        s.lungeTime -= dt;
        const lungeT = 1 - Math.max(0, s.lungeTime) / 0.4; // 0→1 over 0.4s
        // Flatten body (squish down) then shoot forward
        if (lungeT < 0.4) {
          // Compress phase
          const compress = lungeT / 0.4;
          lungeScaleY = 1 - compress * 0.4;
          lungeScaleX = 1 + compress * 0.3;
          lungeScaleZ = 1 + compress * 0.3;
        } else {
          // Extend/shoot phase
          const extend = (lungeT - 0.4) / 0.6;
          lungeScaleY = 0.6 + extend * 0.6;
          lungeScaleX = 1.3 - extend * 0.5;
          lungeScaleZ = 1.3 - extend * 0.5;
          // Move forward during extension
          lungeMoveX = s.lungeDirX * extend * SLIME_SPEED * 3.5 * dt;
          lungeMoveZ = s.lungeDirZ * extend * SLIME_SPEED * 3.5 * dt;
        }
      }

      // Combined scale: breathing + wobble + squish + lunge + damage stage shrink
      const damageScale = s.damageStage >= 4 ? 0.85 : (s.damageStage >= 3 ? 0.92 : 1.0);
      s.mesh.scale.set(
        damageScale * squishX * lungeScaleX * (1 + wobble + breathCycle * 0.5),
        damageScale * squishY * lungeScaleY * (1 - wobbleY + breathCycle),
        damageScale * squishZ * lungeScaleZ * (1 + wobble + breathCycle * 0.5)
      );

      // Knockback physics — gentle decay to prevent stutter
      // Math.pow(0.05, dt) replaced with exp(-2.9957*dt) for perf (called per-slime per-frame)
      if (Math.abs(s.knockbackVx) > 0.005 || Math.abs(s.knockbackVz) > 0.005) {
        s.mesh.position.x += s.knockbackVx * dt * 4;
        s.mesh.position.z += s.knockbackVz * dt * 4;
        var _knockbackDecay = Math.exp(-2.9957 * dt); // equivalent to Math.pow(0.05, dt)
        s.knockbackVx *= _knockbackDecay;
        s.knockbackVz *= _knockbackDecay;
      }

      // Move toward player (sx, sz already defined above)
      const ddx = px - sx, ddz = pz - sz;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);

      if (lungeMoveX !== 0 || lungeMoveZ !== 0) {
        // Apply lunge movement
        s.mesh.position.x = _clamp(s.mesh.position.x + lungeMoveX, -ARENA_RADIUS, ARENA_RADIUS);
        s.mesh.position.z = _clamp(s.mesh.position.z + lungeMoveZ, -ARENA_RADIUS, ARENA_RADIUS);
      } else if (dist > 1.2 && Math.abs(s.knockbackVx) < 0.05 && Math.abs(s.knockbackVz) < 0.05) {
        // Apply individual speed variation for more natural movement
        const speed = SLIME_SPEED * (s.speedMultiplier || 1.0) * (_bloodMoonActive ? BLOOD_MOON_SPEED_MULT : 1);
        s.mesh.position.x += (ddx / dist) * speed * dt;
        s.mesh.position.z += (ddz / dist) * speed * dt;
        s.mesh.rotation.y = Math.atan2(ddx, ddz);
      }

      // Trigger attack lunge when close enough and cooldown elapsed
      if (dist < 2.8 && s.attackTimer <= 0 && s.lungeTime <= 0) {
        s.attackTimer = 2.0 + Math.random() * 1.5; // next lunge cooldown
        s.lungeTime   = 0.4; // lunge animation duration
        if (dist > 0.01) {
          s.lungeDirX = ddx / dist;
          s.lungeDirZ = ddz / dist;
        }
      }

      // Contact damage to player (brutally hard before Camp upgrades)
      if (dist < 1.1 && !player.invulnerable) {
        const now = Date.now();
        if (now - s.lastDamageTime > 500) {
          s.lastDamageTime = now;
          const slimeDmgEffective = SLIME_DAMAGE * (_bloodMoonActive ? BLOOD_MOON_DAMAGE_MULT : 1);
          if (typeof player.takeDamage === 'function') {
            player.takeDamage(slimeDmgEffective, 'slime', s.mesh.position);
          } else {
            playerStats.hp -= slimeDmgEffective;
          }
          // Screen shake on player damage (0.25s minimum duration)
          const _sDmgRatio = _clamp(slimeDmgEffective / (playerStats.maxHp || 100), 0.003, 0.015);
          _triggerShake(_sDmgRatio, 0.25);
          // Sandbox HP guard: always check game-over via playerStats (works even if
          // player.takeDamage doesn't call gameOver() itself in sandbox context)
          if (playerStats && playerStats.hp <= 0) {
            playerStats.hp = 0;
            gameOver();
          }
        }
      }
    }

    // ── Soft separation: prevent slimes from overlapping each other ──────────
    // O(n²) but capped at MAX_SLIMES=50 → at most 1225 checks per frame, negligible cost.
    for (let ai = 0; ai < _activeSlimes.length; ai++) {
      const a = _activeSlimes[ai];
      const ax = a.mesh.position.x, az = a.mesh.position.z;
      for (let bi = ai + 1; bi < _activeSlimes.length; bi++) {
        const b = _activeSlimes[bi];
        const bx = b.mesh.position.x, bz = b.mesh.position.z;
        const dx = ax - bx, dz = az - bz;
        const distSq = dx * dx + dz * dz;
        if (distSq < SLIME_SEPARATION_DIST * SLIME_SEPARATION_DIST && distSq > 0.0001) {
          const dist2 = Math.sqrt(distSq);
          const push = (SLIME_SEPARATION_DIST - dist2) / SLIME_SEPARATION_DIST * SLIME_SEPARATION_FORCE * dt;
          const nx = dx / dist2, nz = dz / dist2;
          a.mesh.position.x = _clamp(ax + nx * push, -ARENA_RADIUS, ARENA_RADIUS);
          a.mesh.position.z = _clamp(az + nz * push, -ARENA_RADIUS, ARENA_RADIUS);
          b.mesh.position.x = _clamp(bx - nx * push, -ARENA_RADIUS, ARENA_RADIUS);
          b.mesh.position.z = _clamp(bz - nz * push, -ARENA_RADIUS, ARENA_RADIUS);
        }
      }
    }
  }

  // ══════════ NEW XP STAR SYSTEM V2 UPDATE ══════════
  function _updateGems(dt) {
    if (!player || !window.XPStarSystem) return;

    const px = player.mesh.position.x;
    const py = player.mesh.position.y + 0.5; // Player center height
    const pz = player.mesh.position.z;

    // Respect pickup-range / XP collection-radius upgrades, if available
    const _xpStats = (typeof window.playerStats !== 'undefined' && window.playerStats) || player.stats || null;
    // Read the base magnet range directly from XPStarSystem so this code stays in sync
    // whenever XP_CFG.MAGNET_RANGE is tuned — no duplicate hardcoded constant.
    const _BASE_MAGNET = XPStarSystem.getMagnetRange();
    const _baseMultiplier = (_xpStats && typeof _xpStats.pickupRange === 'number' && _xpStats.pickupRange > 0)
      ? _xpStats.pickupRange
      : 1.0;
    // Each XP Magnet stack adds +2.5 world-units; convert to multiplier against MAGNET_RANGE
    const _magnetStacks = (window._sandboxXpMagnetRunStacks || 0);
    // playerStats.magnetRange (set by Magnet Drop building) only overrides when it exceeds the
    // current scaled base, so pickup upgrades are never downgraded.
    const _currentBaseRange = _BASE_MAGNET * _baseMultiplier;
    const _playerMagnetRange = (_xpStats && typeof _xpStats.magnetRange === 'number' && _xpStats.magnetRange > _currentBaseRange)
      ? _xpStats.magnetRange / _BASE_MAGNET
      : _baseMultiplier;
    const radiusMultiplier = _playerMagnetRange + (_magnetStacks * 2.5 / _BASE_MAGNET);

    // Update XP stars and collect any that are ready
    const collected = XPStarSystem.update(dt, px, py, pz, radiusMultiplier);

    // Process collected stars
    for (let i = 0; i < collected.length; i++) {
      const star = collected[i];

      // Add XP
      if (typeof window.addExp === 'function') {
        window.addExp(star.xp);
      }

      // Play sound
      if (typeof window.playSound === 'function') {
        window.playSound('collect');
      }

      // Show floating text
      _tmpV3b.set(star.position.x, star.position.y, star.position.z);
      createFloatingText('+' + star.xp + ' XP', _tmpV3b, '#5DADE2');
    }
  }

  // ─── Blood Moon Event Functions ───────────────────────────────────────────────
  function _triggerBloodMoon() {
    _bloodMoonActive = true;
    _bloodMoonTimer  = BLOOD_MOON_DURATION;
    localStorage.setItem('bloodMoonQueued', 'false');

    _showWaveNotification('🌑 BLOOD MOON RISES — ENEMIES ARE RELENTLESS!', '#cc0000', 6000);

    // Crimson lighting transition
    if (window._sandboxLights) {
      if (window._sandboxLights.ambient) {
        window._sandboxLights.ambient.color.setHex(0x660000);
        window._sandboxLights.ambient.intensity = 0.65;
      }
      if (window._sandboxLights.sun) {
        window._sandboxLights.sun.color.setHex(0x990000);
        window._sandboxLights.sun.intensity = 0.3;
      }
      if (window._sandboxLights.fill) {
        window._sandboxLights.fill.color.setHex(0x440000);
        window._sandboxLights.fill.intensity = 0.15;
      }
    }
    if (window.scene) {
      if (window.scene.fog)        window.scene.fog.color.setHex(0x3a0000);
      if (window.scene.background) window.scene.background.set(new window.THREE.Color(0x1a0000));
    }

    // Blood Moon vignette overlay
    let v = document.getElementById('blood-moon-vignette');
    if (!v) {
      v = document.createElement('div');
      v.id = 'blood-moon-vignette';
      document.body.appendChild(v);
    }
  }

  function _endBloodMoon() {
    _bloodMoonActive = false;
    _bloodMoonTimer  = 0;
    // Remove vignette
    const v = document.getElementById('blood-moon-vignette');
    if (v) v.remove();
    // Restore lighting — the day/night cycle will naturally correct it on next update
    if (window._sandboxLights) {
      if (window._sandboxLights.ambient) window._sandboxLights.ambient.color.setHex(0xffffff);
      if (window._sandboxLights.sun)     window._sandboxLights.sun.color.setHex(0xFFF5E0);
      if (window._sandboxLights.fill)    window._sandboxLights.fill.color.setHex(0x8899ff);
      if (window._sandboxLights.fill)    window._sandboxLights.fill.intensity = 0.35;
    }
    if (window.scene && window.scene.fog) window.scene.fog.color.setHex(0x1a1a2e);
    _showWaveNotification('☀️ The Blood Moon fades… for now.', '#ff8800', 4000);
  }

  // ─── Gold Coin System ─────────────────────────────────────────────────────────
  function _initGoldPool() {
    if (_goldPoolInited || !scene) return;
    _goldPoolInited = true;
    const geo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xFFD700, emissive: 0xFF9900, emissiveIntensity: 0.6,
      metalness: 0.9, roughness: 0.2,
    });
    for (let i = 0; i < GOLD_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.position.set(0, -1000, 0);
      scene.add(mesh);
      _goldPool.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, onGround: false, value: 1, bounceCount: 0 });
    }
  }

  function _spawnGoldCoin(x, z, value) {
    if (!_goldPoolInited) _initGoldPool();
    let coin = null;
    for (let i = 0; i < _goldPool.length; i++) {
      if (!_goldPool[i].active) { coin = _goldPool[i]; break; }
    }
    if (!coin) return; // pool exhausted
    coin.active = true;
    coin.onGround = false;
    coin.bounceCount = 0;
    coin.value = value;
    const angle = Math.random() * Math.PI * 2;
    const spd = 1.0 + Math.random() * 1.5;
    coin.vx = Math.cos(angle) * spd;
    coin.vy = 3.0 + Math.random() * 2.0;
    coin.vz = Math.sin(angle) * spd;
    coin.mesh.position.set(x, 0.3, z);
    coin.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    coin.mesh.visible = true;
    coin.mesh.scale.set(1, 1, 1);
  }

  function _updateGoldCoins(dt) {
    if (!_goldPoolInited || !player) return;
    const px = player.mesh.position.x;
    const py = player.mesh.position.y + 0.5;
    const pz = player.mesh.position.z;
    const rm = (playerStats && playerStats.pickupRange > 0) ? playerStats.pickupRange : 1.0;
    const mRange = GOLD_MAGNET_RANGE * rm;
    const cRange = GOLD_COLLECT_RANGE * rm;

    for (let i = 0; i < _goldPool.length; i++) {
      const c = _goldPool[i];
      if (!c.active) continue;

      // Physics
      if (!c.onGround) {
        c.vy += -16.0 * dt;
        c.mesh.position.x += c.vx * dt;
        c.mesh.position.y += c.vy * dt;
        c.mesh.position.z += c.vz * dt;
        c.mesh.rotation.y += 3.0 * dt;

        if (c.mesh.position.y <= 0.12) {
          c.mesh.position.y = 0.12;
          c.vy = -c.vy * 0.35;
          c.vx *= 0.7;
          c.vz *= 0.7;
          c.bounceCount++;
          if (Math.abs(c.vy) < 0.3 || c.bounceCount > 4) {
            c.vy = 0; c.vx = 0; c.vz = 0;
            c.onGround = true;
          }
        }
      } else {
        c.mesh.rotation.y += 1.5 * dt; // gentle spin on ground
      }

      // Magnetism
      const dx = px - c.mesh.position.x;
      const dy = py - c.mesh.position.y;
      const dz = pz - c.mesh.position.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist < mRange && dist > 0.01) {
        c.onGround = false;
        const t = Math.max(0, (mRange - dist) / mRange);
        const spd2 = 5.0 * (1 + t * t * 3);
        c.mesh.position.x += (dx / dist) * spd2 * dt;
        c.mesh.position.y += (dy / dist) * spd2 * dt;
        c.mesh.position.z += (dz / dist) * spd2 * dt;
        c.vx = 0; c.vy = 0; c.vz = 0;
      }

      // Collect
      if (dist < cRange) {
        // Give gold
        if (playerStats) playerStats.gold = (playerStats.gold || 0) + c.value;
        if (saveData) saveData.gold = (saveData.gold || 0) + c.value;
        // Floating text
        _tmpV3b.set(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z);
        createFloatingText('+' + c.value + ' 💰', _tmpV3b, '#FFD700');
        // Deactivate
        c.active = false;
        c.mesh.visible = false;
        c.mesh.position.set(0, -1000, 0);
      }
    }
  }

  function _refreshExpBar() {
    try {
      const pct = Math.min(100, (playerStats.exp / playerStats.expReq) * 100);
      const fill = document.getElementById('exp-fill');
      const text = document.getElementById('exp-text');
      const bFill = document.getElementById('bottom-exp-fill');
      const bText = document.getElementById('bottom-exp-text');
      if (fill) fill.style.width = pct + '%';
      if (text) text.innerText = 'EXP: ' + Math.ceil(pct) + '%';
      if (bFill) bFill.style.width = pct + '%';
      if (bText) bText.innerText = 'EXP: ' + Math.ceil(pct) + '%';

      // Waterdrop SVG level text
      const wlv = document.getElementById('waterdrop-level-text');
      const wfill = document.getElementById('waterdrop-exp-fill');
      if (wlv) wlv.textContent = playerStats.lvl;
      if (wfill) {
        const fillY = 110 - (pct / 100) * 92; // WATERDROP_FILL_HEIGHT=92, bottom at y=110
        wfill.setAttribute('y', fillY);
        wfill.setAttribute('height', (pct / 100) * 92);
      }
    } catch (e) {}
  }

  function _onLevelUp() {
    // ── Force wave: layered shockwave rings + distance-based brutal damage ──
    if (player && player.mesh && scene) {
      try {
        const px = player.mesh.position.x;
        const py = player.mesh.position.y;
        const pz = player.mesh.position.z;

        // Pooled shockwave rings: enhanced force wave with energy pulse
        // [color, initialOpacity, innerR, outerR, expandRate, fadeRate]
        // Ring 0: Central bright energy flash (fast-expanding white/gold disc)
        // Ring 1: Fast energy pulse ring (bright cyan-white, outruns everything)
        // Ring 2-5: Original layered rings (white → orange → crimson → dark)
        const _ringDefs = [
          [0xFFFFFF, 1.00, 0.00, 0.30, 0.90, 0.075],  // blinding white core
          [0xCCFFFF, 0.95, 0.05, 0.22, 0.78, 0.060],  // inner cyan pulse
          [0x88FFFF, 0.90, 0.08, 0.40, 0.58, 0.045],  // mid cyan ring
          [0x44EEFF, 0.75, 0.10, 0.60, 0.40, 0.028],  // outer cyan
          [0x00CCFF, 0.55, 0.09, 0.85, 0.25, 0.015],  // far energy fade
          [0x0088CC, 0.35, 0.08, 1.20, 0.14, 0.008],  // distant deep blue edge
        ];
        // Lazy-init the pool once (pre-allocate ring meshes for all defs (currently 6), reuse every level-up)
        if (!_lvlUpRingsInited) {
          _lvlUpRingsInited = true;
          for (let _rdi = 0; _rdi < _ringDefs.length; _rdi++) {
            const _rd = _ringDefs[_rdi];
            const _rGeo = new THREE.RingGeometry(_rd[2], _rd[3], 48);
            const _rMat = new THREE.MeshBasicMaterial({
              color: _rd[0], transparent: true, opacity: _rd[1],
              side: THREE.DoubleSide, depthWrite: false,
            });
            const _rMesh = new THREE.Mesh(_rGeo, _rMat);
            _rMesh.rotation.x = -Math.PI / 2;
            _rMesh.visible = false;
            scene.add(_rMesh);
            _lvlUpRingPool.push(_rMesh);
          }
        }
        // Deactivate any currently-active rings from a prior level-up before reactivating
        for (let _rci = 0; _rci < _lvlUpRings.length; _rci++) {
          _lvlUpRings[_rci].visible = false;
          _lvlUpRings[_rci].material.opacity = 0;
        }
        _lvlUpRings.length = 0;
        // Activate pooled rings: reset position, scale, opacity
        for (let _rdi = 0; _rdi < _ringDefs.length; _rdi++) {
          const _rd = _ringDefs[_rdi];
          const _rMesh = _lvlUpRingPool[_rdi];
          _rMesh.material.color.setHex(_rd[0]);
          _rMesh.material.opacity = _rd[1];
          _rMesh.position.set(px, py + 0.05, pz);
          _rMesh.scale.set(1, 1, 1);
          _rMesh._expandRate = _rd[4];
          _rMesh._fadeRate   = _rd[5];
          _rMesh.visible = true;
          _lvlUpRings.push(_rMesh);
        }

        // ── Character level-up water/energy fountain ──
        // Multi-pulse upward fountain: primary blast → rising jet → dispersing crown
        if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
          // Primary blast: wide, powerful upward burst from ground
          BloodV2.rawBurstUpward(px, py + 0.1, pz, 90, {
            color: 0x44CCFF, spdMin: 5, spdMax: 14, rMin: 0.014, rMax: 0.036, life: 2.8, visc: 0.40,
          });
          // Rising jet: narrower core shooting higher (80ms later)
          setTimeout(function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(px, py + 0.6, pz, 55, {
                color: 0x88EEFF, spdMin: 7, spdMax: 18, rMin: 0.010, rMax: 0.025, life: 2.4, visc: 0.38,
              });
            }
          }, 80);
          // Crown dispersal: mist of bright droplets at peak (180ms later)
          setTimeout(function() {
            if (window.BloodV2 && typeof BloodV2.rawBurstUpward === 'function') {
              BloodV2.rawBurstUpward(px, py + 1.2, pz, 35, {
                color: 0xCCFFFF, spdMin: 3, spdMax: 9, rMin: 0.007, rMax: 0.018, life: 1.8, visc: 0.50,
              });
            }
          }, 180);
        }

        // ── Distance-based force wave damage ──
        // Gun damage is used as the baseline (same power as 1 shot)
        const _gunDmg = (weapons && weapons.gun && weapons.gun.damage > 0)
          ? Math.round(weapons.gun.damage * ((playerStats && playerStats.strength) || 1.0))
          : 15;
        const _killRSq  = 3.0 * 3.0;   // < 3m  → instant brutal kill, flesh flies 5-7m
        const _nearRSq  = 6.0 * 6.0;   // < 6m  → HP=1 (one-shot-to-finish), heavy gore
        const _outerRSq = 12.0 * 12.0; // < 12m → half HP, skin partially ripped

        _allEnemiesScratch.length = 0;
        for (let _si = 0; _si < _activeSlimes.length; _si++) _allEnemiesScratch.push(_activeSlimes[_si]);
        for (let _ci = 0; _ci < _activeCrawlers.length; _ci++) _allEnemiesScratch.push(_activeCrawlers[_ci]);
        for (let _li = 0; _li < _activeLeapingSlimes.length; _li++) _allEnemiesScratch.push(_activeLeapingSlimes[_li]);
        // Note: skinwalkers are handled in a dedicated loop below — they use parts.root,
        //       don't define `active`, and need takeDamage()/_killSkinwalker() instead of _killSlime().

        for (let i = 0; i < _allEnemiesScratch.length; i++) {
          const e = _allEnemiesScratch[i];
          if (!e || !e.active || e.dead || e.dying) continue;
          const em = e.mesh || e.group;
          if (!em) continue;
          // Resolve the actual render mesh for material overrides.
          // For leaping slimes e.mesh is a THREE.Group (no .material) — use e.body instead.
          const renderMesh = (em.material) ? em : (e.body && e.body.material ? e.body : null);
          const dx = em.position.x - px;
          const dz = em.position.z - pz;
          const distSq = dx * dx + dz * dz;
          if (distSq > _outerRSq) continue;

          // Knockback: strong impulse pushing enemy toward ~5m away
          const dist = Math.sqrt(distSq) || 0.01;
          const kbDirX = dx / dist;
          const kbDirZ = dz / dist;
          const pushStrength = (5.0 - dist) * 3.5 + 8.0;
          e.knockbackVx = kbDirX * pushStrength;
          e.knockbackVz = kbDirZ * pushStrength;

          const ex = em.position.x;
          const ey = em.position.y + 0.4;
          const ez = em.position.z;

          // Raw flesh/blood colors used across all zones
          const _fleshCols = [0xCC1111, 0xAA0000, 0x881111, 0xFF2222, 0xBB0000];

          if (distSq <= _killRSq) {
            // ── ZONE 1: < 1m — brutal instant kill ──
            // Massive blood burst
            if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
              BloodV2.rawBurst(ex, ey, ez, 200, {
                spdMin: 10, spdMax: 24, rMin: 0.018, rMax: 0.055, life: 5.0, visc: 0.25,
                enemyType: e.enemyType || 'slime',
              });
            }
            // High-force flesh chunks fly 5-7 m in knockback direction then leave slide marks
            _spawnFleshChunks(e, 18 + Math.floor(Math.random() * 8), true, _fleshCols,
              { dirX: kbDirX, dirZ: kbDirZ, power: 0.32, spread: 0.35 });
            // Slide trail: blood stains every ~1m along knockback direction for 6 meters
            for (let _s = 1; _s <= 6; _s++) {
              _placeBloodStain(ex + kbDirX * _s, ez + kbDirZ * _s, 0.18 + Math.random() * 0.20);
            }
            if (e.enemyType === 'crawler') {
              _killCrawler(e, 4.0, kbDirX * 14, kbDirZ * 14);
            } else if (e.enemyType === 'leaping_slime') {
              _killLeapingSlime(e, 4.0, kbDirX * 14, kbDirZ * 14);
            } else {
              _killSlime(e, 4.0, kbDirX * 14, kbDirZ * 14);
            }
            // Override corpse color: skin entirely ripped off → raw flesh red (not dark green)
            if (renderMesh) {
              renderMesh.material.color.setHex(0xCC1111);
              if (renderMesh.material.emissive) renderMesh.material.emissive.setHex(0x880000);
              renderMesh.material.emissiveIntensity = 0.45;
            }
          } else if (distSq <= _nearRSq) {
            // ── ZONE 2: 1-2m — HP=1 (one-shot-to-finish), ~2/3 skin ripped off ──
            e.hp = 1;
            // Advance damage stage to critical (stage 4) so next hit triggers proper death
            if (e.damageStage !== undefined) e.damageStage = 4;
            // Visual: dark bloody red showing ~2/3 exposed raw flesh
            if (renderMesh) {
              renderMesh.material.color.setHex(0x881122);
              if (renderMesh.material.emissive) renderMesh.material.emissive.setHex(0x550000);
              renderMesh.material.emissiveIntensity = 0.30;
            }
            if (window.GoreSim && typeof GoreSim.onHit === 'function') {
              _tmpV3.set(ex, ey, ez);
              _tmpV3b.set(-kbDirX, 0, -kbDirZ);
              GoreSim.onHit(e, 'pistol', _tmpV3, _tmpV3b);
            }
            if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
              BloodV2.rawBurst(ex, ey, ez, 100, {
                spdMin: 5, spdMax: 16, rMin: 0.015, rMax: 0.040, life: 4.0, visc: 0.35,
                enemyType: e.enemyType || 'slime',
              });
            }
            // Medium-force flesh chunks (partial skin strips)
            _spawnFleshChunks(e, 10 + Math.floor(Math.random() * 5), true, _fleshCols,
              { dirX: kbDirX, dirZ: kbDirZ, power: 0.20, spread: 0.40 });
            for (let _s = 1; _s <= 3; _s++) {
              _placeBloodStain(ex + kbDirX * _s * 1.2, ez + kbDirZ * _s * 1.2, 0.14 + Math.random() * 0.16);
            }
            e.isSkinned = true;
            try {
              if (e.mesh && e.mesh.material) e.mesh.material.color.setHex(0x6B1010);
            } catch(e2) { /* visual-only */ }
            _spawnSkinFlaps(e, e._originalColor ? e._originalColor.getHex() : 0x44AA44);
          } else {
            // ── ZONE 3: 2-5m — half HP, ~1/3 skin ripped ──
            e.hp = Math.max(1, Math.floor((e.hp || _gunDmg * 2) * 0.5));
            // Advance damage stage to 2 (significant but survivable)
            if (e.damageStage !== undefined && e.damageStage < 2) e.damageStage = 2;
            // Visual: partial bloody color — 1/3 of skin stripped showing raw red beneath
            if (renderMesh) {
              renderMesh.material.color.setHex(0xBB3322);
              if (renderMesh.material.emissive) renderMesh.material.emissive.setHex(0x440000);
              renderMesh.material.emissiveIntensity = 0.15;
            }
            if (window.GoreSim && typeof GoreSim.onHit === 'function') {
              _tmpV3.set(ex, ey, ez);
              _tmpV3b.set(-kbDirX, 0, -kbDirZ);
              GoreSim.onHit(e, 'pistol', _tmpV3, _tmpV3b);
            }
            if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
              BloodV2.rawBurst(ex, ey, ez, 40, {
                spdMin: 2, spdMax: 9, rMin: 0.010, rMax: 0.025, life: 3.0, visc: 0.50,
                enemyType: e.enemyType || 'slime',
              });
            }
            _placeBloodStain(ex, ez);
            _placeBloodStain(ex + kbDirX * 1.5, ez + kbDirZ * 1.5);
            e.isSkinned = true;
            try {
              if (e.mesh && e.mesh.material) e.mesh.material.color.setHex(0x8B2020);
            } catch(e2) { /* visual-only */ }
            _spawnSkinFlaps(e, e._originalColor ? e._originalColor.getHex() : 0x44AA44);
          }
        }

        // ── Skinwalkers: dedicated loop (no `active`, uses parts.root, needs takeDamage) ──
        for (let _swi = 0; _swi < _activeSkinwalkers.length; _swi++) {
          const e = _activeSkinwalkers[_swi];
          if (!e || e.dead || !e.parts || !e.parts.root) continue;
          const _swPos = e.parts.root.position;
          const dx = _swPos.x - px;
          const dz = _swPos.z - pz;
          const distSq = dx * dx + dz * dz;
          if (distSq > _outerRSq) continue;

          const dist    = Math.sqrt(distSq) || 0.01;
          const kbDirX  = dx / dist;
          const kbDirZ  = dz / dist;
          const ex = _swPos.x, ey = _swPos.y + 1.0, ez = _swPos.z;

          if (distSq <= _killRSq) {
            if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
              BloodV2.rawBurst(ex, ey, ez, 200, {
                spdMin: 10, spdMax: 24, rMin: 0.018, rMax: 0.055, life: 5.0, visc: 0.25,
                enemyType: 'skinwalker',
              });
            }
            for (let _s = 1; _s <= 6; _s++) {
              _placeBloodStain(ex + kbDirX * _s, ez + kbDirZ * _s, 0.18 + Math.random() * 0.20);
            }
            e.takeDamage(9999);
            if (e.dead) _killSkinwalker(e);
          } else if (distSq <= _nearRSq) {
            // Leave skinwalker at 1 HP — next hit kills
            const _swDmg = Math.max(0, (e.hp || 1) - 1);
            if (_swDmg > 0) e.takeDamage(_swDmg);
            if (e.dead) _killSkinwalker(e);
            if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
              BloodV2.rawBurst(ex, ey, ez, 100, {
                spdMin: 5, spdMax: 16, rMin: 0.015, rMax: 0.040, life: 4.0, visc: 0.35,
                enemyType: 'skinwalker',
              });
            }
            for (let _s = 1; _s <= 3; _s++) {
              _placeBloodStain(ex + kbDirX * _s * 1.2, ez + kbDirZ * _s * 1.2, 0.14 + Math.random() * 0.16);
            }
          } else {
            // Half HP
            const _swDmg = Math.floor((e.hp || 1) * 0.5);
            if (_swDmg > 0) e.takeDamage(_swDmg);
            if (e.dead) _killSkinwalker(e);
            if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
              BloodV2.rawBurst(ex, ey, ez, 40, {
                spdMin: 2, spdMax: 9, rMin: 0.010, rMax: 0.025, life: 3.0, visc: 0.50,
                enemyType: 'skinwalker',
              });
            }
            _placeBloodStain(ex, ez);
            _placeBloodStain(ex + kbDirX * 1.5, ez + kbDirZ * 1.5);
          }
        }
      } catch(e) { console.warn('[LvlUp shockwave] error:', e); }
    }

    // ── Egg Hunt quest: spawn The Grey boss at level 10 (CHANGE 7) ──
    if (playerStats.lvl >= 10 &&
        saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest_eggHunt' &&
        !window._mysteriousEggSpawned && player && player.mesh && scene) {
      try {
        window._mysteriousEggSpawned = true;
        const eggGroup = new THREE.Group();
        const eggGeo = new THREE.SphereGeometry(0.8, 16, 16);
        const eggMat = new THREE.MeshStandardMaterial({
          color: 0x8B5CF6, emissive: 0x7C3AED, emissiveIntensity: 0.6
        });
        const eggMesh = new THREE.Mesh(eggGeo, eggMat);
        eggMesh.scale.set(1.0, 1.3, 1.0);
        eggGroup.add(eggMesh);
        eggGroup.position.set(
          player.mesh.position.x + 8,
          0.8,
          player.mesh.position.z + 8
        );
        scene.add(eggGroup);
        window._mysteriousEggObject = eggGroup;
        _showWaveNotification('✨ A Mysterious Egg appeared nearby', '#8B5CF6', 3500);
      } catch(e) { console.warn('[EggHunt] egg spawn failed:', e); }
    }

    // ── Small "LEVEL UP!" text that rises from character's head ──
    // Appears first (small), grows upward, then the big fire animation plays.
    _spawnSmallLevelUpText();

    // ── Fiery "LEVEL UP" text animation (Grind Survivors style) ──
    // Spawns a massive burning text above the player before showing the upgrade modal.
    setTimeout(_spawnFireLevelUpText, 0); // fire immediately with small text

    // Delay before upgrade modal appears so player can enjoy the fiery text animation
    window.isPaused = true;
    setTimeout(function () {
      if (typeof showUpgradeModal === 'function') {
        showUpgradeModal(false, null);
        // Failsafe: if showUpgradeModal returned without showing the modal
        setTimeout(function () {
          const modal = document.getElementById('levelup-modal');
          if (window.isPaused && (!modal || modal.style.display !== 'flex')) {
            window.isPaused = false;
          }
        }, 80);
      } else {
        window.isPaused = false;
      }
    }, 1800); // 1.8s delay to let the fiery text play

    // Stats + Account XP + Codex + Achievements on level up
    if (saveData && saveData.stats) saveData.stats.highestLevel = Math.max(saveData.stats.highestLevel || 0, playerStats.lvl);
    if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(10, 'Level Up', saveData);
    if (playerStats.lvl >= 5 && window.CodexSystem && typeof window.CodexSystem.discover === 'function') {
      var _codexData2 = saveData && saveData.codexData;
      if (!_codexData2 || !_codexData2.discovered || !_codexData2.discovered['char_waterdrop']) {
        window.CodexSystem.discover('char_waterdrop');
        if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(5, 'Codex Discovery', saveData);
      }
    }
    _checkSandboxAchievements();
  }

  // ── Small "LEVEL UP!" text that rises from the character's head ──
  // Starts tiny, grows to 50% of the fire text size, then fades out.
  var _smallLvlUpEl = null;
  function _spawnSmallLevelUpText() {
    if (!player || !player.mesh || !camera || !renderer) return;
    // Project player position to screen space
    var _sVec = new THREE.Vector3();
    _sVec.copy(player.mesh.position);
    _sVec.y += 1.8; // above character head
    _sVec.project(camera);
    var screenX = (_sVec.x * 0.5 + 0.5) * window.innerWidth;
    var screenY = (-_sVec.y * 0.5 + 0.5) * window.innerHeight;

    if (!_smallLvlUpEl) {
      _smallLvlUpEl = document.createElement('div');
      _smallLvlUpEl.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'z-index:10002',
        'font-family:"Cinzel Decorative","Bangers","Impact","Arial Black",sans-serif',
        'font-weight:900',
        'white-space:nowrap',
        'letter-spacing:4px',
        'text-align:center',
        'will-change:transform,opacity',
      ].join(';');
      document.body.appendChild(_smallLvlUpEl);
    }

    // Target size: 50% of fire text's clamp(22px, 4.5vw, 44px) = clamp(11px, 2.25vw, 22px)
    var targetSize = Math.min(22, Math.max(11, window.innerWidth * 0.0225));
    var startSize = targetSize * 0.2;
    _smallLvlUpEl.textContent = 'LEVEL UP!';
    _smallLvlUpEl.style.display = 'block';
    _smallLvlUpEl.style.opacity = '0';
    _smallLvlUpEl.style.fontSize = startSize + 'px';
    _smallLvlUpEl.style.color = '#FFD700';
    _smallLvlUpEl.style.textShadow = '0 0 8px #FF6600, 0 0 16px #FF4500, 2px 2px 0 #000, -2px -2px 0 #000';
    _smallLvlUpEl.style.left = screenX + 'px';
    _smallLvlUpEl.style.top = screenY + 'px';
    _smallLvlUpEl.style.transform = 'translate(-50%, 0)';

    var start = performance.now();
    var duration = 900; // ms
    var startY = screenY;

    (function animate() {
      var t = (performance.now() - start) / duration;
      if (t > 1) {
        _smallLvlUpEl.style.display = 'none';
        return;
      }
      // Rise up 80px
      var curY = startY - 80 * t;
      // Size: start → target over first 60% then hold
      var sizeT = Math.min(1, t / 0.6);
      var eased = 1 - Math.pow(1 - sizeT, 3);
      var curSize = startSize + (targetSize - startSize) * eased;
      // Opacity: fade in first 20%, hold, fade out last 25%
      var opacity = t < 0.2 ? t / 0.2 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      _smallLvlUpEl.style.top = curY + 'px';
      _smallLvlUpEl.style.fontSize = curSize + 'px';
      _smallLvlUpEl.style.opacity = '' + Math.max(0, Math.min(1, opacity));
      requestAnimationFrame(animate);
    })();
  }

  // ── Fiery LEVEL UP text: Grind Survivors style with Eye of Horus ──
  // DOM elements pooled: created once, reused on every level-up (no DOM churn)
  var _fireLvlContainer = null;
  var _fireLvlTextEl = null;
  var _fireLvlEmbers = [];
  var _FIRE_EMBER_COUNT = 36;
  var _fireLvlInited = false;
  var _fireLvlEmberColors = ['#CCCCCC','#FFFFFF','#AAAAAA','#E8E8E8'];
  var _fireLvlRafId = 0; // tracks active RAF so back-to-back level-ups cancel the prior animation

  function _initFireLevelUpPool() {
    if (_fireLvlInited) return;
    _fireLvlInited = true;

    _fireLvlContainer = document.createElement('div');
    _fireLvlContainer.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:38%',
      'transform:translate(-50%,-50%) scale(0) translateY(30px)',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'z-index:10000',
      'pointer-events:none',
      'opacity:0',
      'will-change:transform,opacity',
    ].join(';');

    _fireLvlTextEl = document.createElement('div');
    _fireLvlTextEl.textContent = 'LEVEL UP';
    _fireLvlTextEl.style.cssText = [
      'font-family:"Cinzel Decorative","Bangers","Impact","Arial Black",sans-serif',
      'font-size:clamp(22px,4.5vw,44px)',
      'font-weight:900',
      'letter-spacing:8px',
      'color:#FFFFFF',
      'text-shadow:0 0 10px #00FFFF,0 0 20px #00CCFF,0 0 40px #0088FF',
      'white-space:nowrap',
      'line-height:1',
    ].join(';');
    _fireLvlContainer.appendChild(_fireLvlTextEl);
    document.body.appendChild(_fireLvlContainer);

    for (var i = 0; i < _FIRE_EMBER_COUNT; i++) {
      var ember = document.createElement('div');
      ember.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'z-index:10001',
        'opacity:0',
        'will-change:transform,opacity',
      ].join(';');
      document.body.appendChild(ember);
      _fireLvlEmbers.push({ el: ember, x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotV: 0, life: 0, maxLife: 0, isAsh: false });
    }
  }

  function _spawnFireLevelUpText() {
    _initFireLevelUpPool();

    // Cancel any prior animation loop so back-to-back level-ups don't fight over DOM elements
    if (_fireLvlRafId) {
      cancelAnimationFrame(_fireLvlRafId);
      _fireLvlRafId = 0;
    }

    // Reset container
    _fireLvlContainer.style.display = 'flex';
    _fireLvlContainer.style.opacity = '0';
    _fireLvlContainer.style.transform = 'translate(-50%,-50%) scale(0) translateY(30px)';
    _fireLvlTextEl.style.color = '#FFFFFF';
    _fireLvlTextEl.style.filter = '';
    _fireLvlTextEl.style.textShadow = '0 0 10px #00FFFF, 0 0 20px #00CCFF, 0 0 40px #0088FF';

    // Reset embers with randomized properties
    for (var i = 0; i < _FIRE_EMBER_COUNT; i++) {
      var em = _fireLvlEmbers[i];
      var size = 2 + Math.random() * 6;
      var isAsh = true; // all particles are grey/white ash flecks
      em.el.style.width = size + 'px';
      em.el.style.height = (isAsh ? size * 0.5 : size) + 'px';
      em.el.style.background = isAsh ? '#999' : _fireLvlEmberColors[Math.floor(Math.random() * 4)];
      em.el.style.borderRadius = isAsh ? '1px' : '50%';
      em.el.style.boxShadow = '0 0 ' + (isAsh ? '2px 1px rgba(150,150,150,0.5)' : '5px 2px rgba(255,100,0,0.7)');
      em.el.style.opacity = '0';
      em.x = 0; em.y = 0;
      em.vx = (Math.random() - 0.5) * (isAsh ? 80 : 240);
      em.vy = -(isAsh ? 20 : 60) - Math.random() * (isAsh ? 100 : 180);
      em.rot = Math.random() * 360;
      em.rotV = (Math.random() - 0.5) * 400;
      em.life = 0.4 + Math.random() * (isAsh ? 1.0 : 0.7);
      em.maxLife = 0;
      em.isAsh = isAsh;
    }

    var startTime = performance.now();
    var _lastFrameTime = startTime;
    var totalDuration = 1700;
    var container = _fireLvlContainer;
    var el = _fireLvlTextEl;
    var embers = _fireLvlEmbers;

    function _hideLevelUpFX() {
      container.style.display = 'none';
      container.style.opacity = '0';
      for (var i = 0; i < embers.length; i++) {
        embers[i].el.style.opacity = '0';
      }
      _fireLvlRafId = 0;
    }

    function animFrame() {
      var now = performance.now();
      var elapsed = now - startTime;
      var dt = Math.min(0.05, (now - _lastFrameTime) / 1000);
      _lastFrameTime = now;
      var t = elapsed / totalDuration;

      if (t < 0.18) {
        var p = t / 0.18;
        var easeP = 1 - Math.pow(1 - p, 3); // ease-out cubic
        var scale = easeP * 1.3;
        var yOff = (1 - easeP) * 60;
        container.style.opacity = '' + Math.min(1, p * 3);
        container.style.transform = 'translate(-50%,-50%) scale(' + scale + ') translateY(' + yOff + 'px)';
      } else if (t < 0.32) {
        var p = (t - 0.18) / 0.14;
        var scale = 1.3 - 0.2 * p;
        container.style.transform = 'translate(-50%,-50%) scale(' + scale + ') translateY(0)';
        container.style.opacity = '1';
        if (p < 0.6) {
          var cx = window.innerWidth / 2;
          var cy = window.innerHeight * 0.38;
          for (var i = 0; i < embers.length; i++) {
            var em = embers[i];
            if (em.maxLife === 0) {
              em.maxLife = em.life;
              em.x = cx + (Math.random() - 0.5) * 160;
              em.y = cy + (Math.random() - 0.5) * 50;
              em.el.style.opacity = '1';
            }
          }
        }
      } else if (t < 0.72) {
        var p = (t - 0.32) / 0.40;
        var pulse = 1.1 + 0.04 * Math.sin(p * Math.PI * 5);
        var yRise = -18 * p;
        container.style.transform = 'translate(-50%,calc(-50% + ' + yRise + 'px)) scale(' + pulse + ')';
        container.style.opacity = '1';
        var ashBlend = Math.max(0, (p - 0.5) / 0.5);
        if (ashBlend > 0) {
          var channelVal = Math.round(255 * (1 - ashBlend * 0.2));
          el.style.color = 'rgb(' + channelVal + ',' + channelVal + ',' + channelVal + ')';
        }
      } else if (t < 1) {
        var p = (t - 0.72) / 0.28;
        var yRise = -18 - 80 * p;
        var scale = 1.1 + 0.15 * p;
        var fadeOut = 1 - Math.pow(p, 1.5);
        container.style.transform = 'translate(-50%,calc(-50% + ' + yRise + 'px)) scale(' + scale + ')';
        container.style.opacity = '' + Math.max(0, fadeOut);
        el.style.filter = 'blur(' + (4 * p) + 'px)';
        var gr = Math.round(200 + 55 * (1 - p));
        el.style.color = 'rgb(' + gr + ',' + gr + ',' + gr + ')';
        el.style.textShadow = '0 0 ' + (10 + 20 * p) + 'px rgba(180,220,255,' + (0.5 * (1 - p)) + ')';
      } else {
        _hideLevelUpFX();
        return;
      }

      for (var i = 0; i < embers.length; i++) {
        var em = embers[i];
        if (em.maxLife === 0) continue;
        em.life -= dt;
        if (em.life <= 0) { em.el.style.opacity = '0'; continue; }
        em.x += em.vx * dt;
        em.y += em.vy * dt;
        em.vy += (em.isAsh ? 10 : 25) * dt;
        em.vx *= em.isAsh ? 0.995 : 0.99;
        em.rot += em.rotV * dt;
        em.el.style.left = em.x + 'px';
        em.el.style.top = em.y + 'px';
        em.el.style.transform = 'rotate(' + em.rot + 'deg)';
        em.el.style.opacity = '' + Math.max(0, em.life / em.maxLife);
      }

      _fireLvlRafId = requestAnimationFrame(animFrame);
    }
    _fireLvlRafId = requestAnimationFrame(animFrame);
  }

  // ─── Sandbox weapon effects (sword, samurai sword, aura) ────────────────────
  // These run when those weapons are unlocked at level-up and deal area damage
  // to active slimes, giving immediate visible feedback in the sandbox.

  // Pre-allocated reusable objects for weapon effects (avoids GC during combat)
  const _swordSlashColor  = 0xFF8800;
  const _auraColor        = 0x3399FF;

  // ── Shared helpers used by _updateWeaponEffects and its weapon blocks ─────

  /** Get X position of any enemy (skinwalkers use parts.root, others use mesh). */
  function _weaponEnemyX(e) {
    return (e.parts && e.parts.root) ? e.parts.root.position.x : e.mesh.position.x;
  }
  /** Get Z position of any enemy (skinwalkers use parts.root, others use mesh). */
  function _weaponEnemyZ(e) {
    return (e.parts && e.parts.root) ? e.parts.root.position.z : e.mesh.position.z;
  }

  /**
   * Find the nearest active enemy across all pools within rangeSq world units.
   * Pass Infinity (or omit) to search without a distance cap.
   */
  function _weaponFindNearest(ox, oz, rangeSq) {
    let best = null;
    let bestDSq = (rangeSq != null) ? rangeSq : Infinity;
    const pools = [_activeSlimes, _activeCrawlers, _activeLeapingSlimes];
    for (let pi = 0; pi < pools.length; pi++) {
      const arr = pools[pi];
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (!e || !e.active || e.dead) continue;
        const dx = e.mesh.position.x - ox, dz = e.mesh.position.z - oz;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDSq) { bestDSq = dSq; best = e; }
      }
    }
    for (let i = 0; i < _activeSkinwalkers.length; i++) {
      const sw = _activeSkinwalkers[i];
      if (!sw || sw.dead) continue;
      const dx = sw.parts.root.position.x - ox, dz = sw.parts.root.position.z - oz;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDSq) { bestDSq = dSq; best = sw; }
    }
    return best;
  }

  /**
   * If a projectile has explosionRadius > 0, trigger the AoE explosion at (ix, iz).
   * This runs on impact so the explosion is "explode on hit" not "explode on cast".
   */
  function _triggerProjectileExplosion(projectile, ix, iz) {
    if (!projectile || !(projectile.explosionRadius > 0)) return;
    const eRadius = projectile.explosionRadius;
    const dmg = projectile.weaponDmg || 0;
    _weaponAoeDamage(ix, iz, eRadius * eRadius, dmg, '#FF4400');
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(ix, 0.5, iz, 15, { color: 0xFF6600, spdMin: 1, spdMax: 5 });
    }
    // Clear radius so it doesn't retrigger on the same projectile after release
    projectile.explosionRadius = 0;
  }

  /**
   * Apply `dmg` damage to a single enemy (any type) and show floating text.
   * Caller is responsible for multiplying by strMult before passing `dmg`.
   */
  function _weaponHitEnemy(e, dmg, color) {
    if (!e || e.dead) return;
    const ex = _weaponEnemyX(e), ez = _weaponEnemyZ(e);
    _tmpV3.set(ex, 1.5, ez);
    createFloatingText(dmg, _tmpV3, color, dmg);
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(ex, 0.5, ez, 4, {});
    }
    if (e.parts && e.parts.root) {
      // Skinwalker — its own takeDamage handles hp and sets e.dead when HP reaches zero.
      // _updateSkinwalkers removes dead skinwalkers before calling sw.update(), so
      // onDeath (and _killSkinwalker) might never fire from the animation loop.
      // Call _killSkinwalker immediately if this hit killed it (it guards with _killProcessed).
      e.takeDamage(dmg);
      if (e.dead) _killSkinwalker(e);
    } else {
      e.hp -= dmg;
      if (e.flashTimer !== undefined) e.flashTimer = 0.1;
      if (e.hp <= 0) {
        if (e.enemyType === 'crawler') {
          _killCrawler(e, 1.0, 0, 0);
        } else if (e.enemyType === 'leaping_slime') {
          _killLeapingSlime(e, 1.0, 0, 0);
        } else {
          _killSlime(e, 1.0, 0, 0);
        }
      } else if (e.enemyType === 'slime') {
        _updateSlimeHPBar(e);
      }
    }
  }

  /**
   * Deal `dmg` (already pre-multiplied by playerStats.strength where needed)
   * to every active enemy within `rangeSq` of (cx, cz).
   */
  function _weaponAoeDamage(cx, cz, rangeSq, dmg, color) {
    for (let si = _activeSlimes.length - 1; si >= 0; si--) {
      const s = _activeSlimes[si];
      if (!s || !s.active || s.dead) continue;
      const dx = s.mesh.position.x - cx, dz = s.mesh.position.z - cz;
      if (dx * dx + dz * dz <= rangeSq) _weaponHitEnemy(s, dmg, color);
    }
    for (let ci = _activeCrawlers.length - 1; ci >= 0; ci--) {
      const c = _activeCrawlers[ci];
      if (!c || !c.active || c.dead) continue;
      const dx = c.mesh.position.x - cx, dz = c.mesh.position.z - cz;
      if (dx * dx + dz * dz <= rangeSq) _weaponHitEnemy(c, dmg, color);
    }
    for (let li = _activeLeapingSlimes.length - 1; li >= 0; li--) {
      const l = _activeLeapingSlimes[li];
      if (!l || !l.active || l.dead) continue;
      const dx = l.mesh.position.x - cx, dz = l.mesh.position.z - cz;
      if (dx * dx + dz * dz <= rangeSq) _weaponHitEnemy(l, dmg, color);
    }
    for (let wi = _activeSkinwalkers.length - 1; wi >= 0; wi--) {
      const sw = _activeSkinwalkers[wi];
      if (!sw || sw.dead) continue;
      const dx = sw.parts.root.position.x - cx, dz = sw.parts.root.position.z - cz;
      if (dx * dx + dz * dz <= rangeSq) _weaponHitEnemy(sw, dmg, color);
    }
  }

  function _updateWeaponEffects(dt) {
    if (!player || !player.mesh || !weapons) return;
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;

    // ── SWORD / SAMURAI SWORD: periodic melee slash in front of player ────────
    const hasSword = (weapons.sword && weapons.sword.active) ||
                     (weapons.samuraiSword && weapons.samuraiSword.active);
    if (hasSword) {
      _swordEffectCooldown -= dt * 1000;
      if (_swordEffectCooldown <= 0) {
        // Choose best active sword
        const sw = (weapons.samuraiSword && weapons.samuraiSword.active)
          ? weapons.samuraiSword : weapons.sword;
        _swordEffectCooldown = sw.cooldown || 1200;
        sw.lastShot = Date.now(); // track for skill-icon cooldown overlay
        const sRange = sw.range || 3.5;
        const sRangeSq = sRange * sRange;
        // Iterate backward so that _killSlime's splice doesn't skip entries
        for (let si = _activeSlimes.length - 1; si >= 0; si--) {
          const s = _activeSlimes[si];
          if (!s || !s.active || s.dead) continue;
          const dx = s.mesh.position.x - px;
          const dz = s.mesh.position.z - pz;
          if (dx * dx + dz * dz <= sRangeSq) {
            const dmg = Math.round((sw.damage || 30) * (playerStats ? playerStats.strength || 1 : 1));
            s.hp -= dmg;
            s.flashTimer = 0.12;
            s.squishTime = 0.25;
            _tmpV3.set(s.mesh.position.x, 1.4, s.mesh.position.z);
            createFloatingText(dmg, _tmpV3, '#FF8800', dmg);
            if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
              _reusableBloodPos.x = s.mesh.position.x;
              _reusableBloodPos.y = s.mesh.position.y + 0.5;
              _reusableBloodPos.z = s.mesh.position.z;
              BloodSystem.emitBurst(_reusableBloodPos, 20, { spreadXZ: 1.0, spreadY: 0.4 });
            }
            if (s.hp <= 0) {
              _killSlime(s, 1.2, 0, 0); // _deactivateSlime splices from _activeSlimes (safe: iterating backward)
            } else {
              _updateSlimeHPBar(s);
            }
          }
        }
        // Also hit crawlers in sword range
        for (let ci = _activeCrawlers.length - 1; ci >= 0; ci--) {
          const c = _activeCrawlers[ci];
          if (!c || !c.active || c.dead) continue;
          const dx = c.mesh.position.x - px, dz = c.mesh.position.z - pz;
          if (dx * dx + dz * dz <= sRangeSq) {
            const dmg = Math.round((sw.damage || 30) * (playerStats ? playerStats.strength || 1 : 1));
            _weaponHitEnemy(c, dmg, '#FF8800');
          }
        }
        // Also hit leaping slimes in sword range
        for (let li = _activeLeapingSlimes.length - 1; li >= 0; li--) {
          const l = _activeLeapingSlimes[li];
          if (!l || !l.active || l.dead) continue;
          const dx = l.mesh.position.x - px, dz = l.mesh.position.z - pz;
          if (dx * dx + dz * dz <= sRangeSq) {
            const dmg = Math.round((sw.damage || 30) * (playerStats ? playerStats.strength || 1 : 1));
            _weaponHitEnemy(l, dmg, '#FF8800');
          }
        }
        // Also hit skinwalkers in sword range
        for (let wi = _activeSkinwalkers.length - 1; wi >= 0; wi--) {
          const skinw = _activeSkinwalkers[wi];
          if (!skinw || skinw.dead) continue;
          const dx = skinw.parts.root.position.x - px, dz = skinw.parts.root.position.z - pz;
          if (dx * dx + dz * dz <= sRangeSq) {
            const dmg = Math.round((sw.damage || 30) * (playerStats ? playerStats.strength || 1 : 1));
            _weaponHitEnemy(skinw, dmg, '#FF8800');
          }
        }
        // Visual flash on player
        if (player.mesh && player.mesh.material) {
          const origC = player.mesh.material.color.getHex();
          player.mesh.material.color.setHex(_swordSlashColor);
          setTimeout(function () {
            if (player && player.mesh && player.mesh.material)
              player.mesh.material.color.setHex(origC);
          }, 100);
        }
        // Sword slash emoji removed — keep only damage numbers
      }
    } else {
      _swordEffectCooldown = 0; // reset if weapon removed
    }

    // ── AURA: continuous damage ring around player ────────────────────────────
    if (weapons.aura && weapons.aura.active) {
      _auraEffectTimer -= dt * 1000;
      if (_auraEffectTimer <= 0) {
        _auraEffectTimer = weapons.aura.cooldown || 1000;
        weapons.aura.lastShot = Date.now(); // track for skill-icon cooldown overlay
        const aRange = weapons.aura.range || 3.5;
        const aRangeSq = aRange * aRange;
        // Iterate backward so _killSlime's splice is safe
        for (let si = _activeSlimes.length - 1; si >= 0; si--) {
          const s = _activeSlimes[si];
          if (!s || !s.active || s.dead) continue;
          const dx = s.mesh.position.x - px;
          const dz = s.mesh.position.z - pz;
          if (dx * dx + dz * dz <= aRangeSq) {
            const dmg = Math.round((weapons.aura.damage || 8) * (playerStats ? playerStats.strength || 1 : 1));
            s.hp -= dmg;
            s.flashTimer = 0.08;
            _tmpV3.set(s.mesh.position.x, 1.3, s.mesh.position.z);
            createFloatingText(dmg, _tmpV3, '#33AAFF', dmg);
            if (s.hp <= 0) {
              _killSlime(s, 1.0, 0, 0);
            } else {
              _updateSlimeHPBar(s);
            }
          }
        }
        // Also hit crawlers in aura range
        for (let ci = _activeCrawlers.length - 1; ci >= 0; ci--) {
          const c = _activeCrawlers[ci];
          if (!c || !c.active || c.dead) continue;
          const dx = c.mesh.position.x - px, dz = c.mesh.position.z - pz;
          if (dx * dx + dz * dz <= aRangeSq) {
            const dmg = Math.round((weapons.aura.damage || 8) * (playerStats ? playerStats.strength || 1 : 1));
            _weaponHitEnemy(c, dmg, '#33AAFF');
          }
        }
        // Also hit leaping slimes in aura range
        for (let li = _activeLeapingSlimes.length - 1; li >= 0; li--) {
          const l = _activeLeapingSlimes[li];
          if (!l || !l.active || l.dead) continue;
          const dx = l.mesh.position.x - px, dz = l.mesh.position.z - pz;
          if (dx * dx + dz * dz <= aRangeSq) {
            const dmg = Math.round((weapons.aura.damage || 8) * (playerStats ? playerStats.strength || 1 : 1));
            _weaponHitEnemy(l, dmg, '#33AAFF');
          }
        }
        // Also hit skinwalkers in aura range
        for (let wi = _activeSkinwalkers.length - 1; wi >= 0; wi--) {
          const skinw = _activeSkinwalkers[wi];
          if (!skinw || skinw.dead) continue;
          const dx = skinw.parts.root.position.x - px, dz = skinw.parts.root.position.z - pz;
          if (dx * dx + dz * dz <= aRangeSq) {
            const dmg = Math.round((weapons.aura.damage || 8) * (playerStats ? playerStats.strength || 1 : 1));
            _weaponHitEnemy(skinw, dmg, '#33AAFF');
          }
        }
      }
    } else {
      _auraEffectTimer = 0;
    }

    // ── ICE SPEAR: fires icy projectile toward nearest enemy ──────────────────
    if (weapons.iceSpear && weapons.iceSpear.active) {
      _iceSpearTimer -= dt * 1000;
      if (_iceSpearTimer <= 0) {
        _iceSpearTimer = weapons.iceSpear.cooldown || 1500;
        weapons.iceSpear.lastShot = Date.now();
        const range = weapons.iceSpear.range || 15;
        const nearest = _weaponFindNearest(px, pz, range * range);
        if (nearest) {
          const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
          const dmg = Math.round((weapons.iceSpear.damage || 20) * strMult);
          _fireProjectile(px, pz, _weaponEnemyX(nearest), _weaponEnemyZ(nearest), 'iceSpear', dmg);
        }
      }
    } else { _iceSpearTimer = 0; }

    // ── FIRE RING: orbiting fire orbs that scorch enemies they pass over ──────
    if (weapons.fireRing && weapons.fireRing.active) {
      const orbs = weapons.fireRing.orbs || 3;
      const fRange = weapons.fireRing.range || 4;
      _fireRingAngle += (weapons.fireRing.rotationSpeed || 2) * dt;
      _fireRingTimer -= dt * 1000;
      if (_fireRingTimer <= 0) {
        _fireRingTimer = weapons.fireRing.cooldown || 800;
        weapons.fireRing.lastShot = Date.now();
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.fireRing.damage || 8) * strMult);
        const orbHitRadSq = 0.9 * 0.9;
        for (let oi = 0; oi < orbs; oi++) {
          const angle = _fireRingAngle + (oi / orbs) * Math.PI * 2;
          const orbX = px + Math.cos(angle) * fRange;
          const orbZ = pz + Math.sin(angle) * fRange;
          _weaponAoeDamage(orbX, orbZ, orbHitRadSq, dmg, '#FF4400');
        }
      }
    } else { _fireRingTimer = 0; }

    // ── LIGHTNING: instant chain-strike hitting up to 3 enemies in range ──────
    if (weapons.lightning && weapons.lightning.active) {
      _lightningTimer -= dt * 1000;
      if (_lightningTimer <= 0) {
        _lightningTimer = weapons.lightning.cooldown || 2000;
        weapons.lightning.lastShot = Date.now();
        const lRange = weapons.lightning.range || 18;
        const lRangeSq = lRange * lRange;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.lightning.damage || 45) * strMult);
        // Collect all enemies in range
        const inRange = [];
        const lPools = [_activeSlimes, _activeCrawlers, _activeLeapingSlimes];
        for (let pi = 0; pi < lPools.length; pi++) {
          const arr = lPools[pi];
          for (let i = 0; i < arr.length; i++) {
            const e = arr[i];
            if (!e || !e.active || e.dead) continue;
            const dx = e.mesh.position.x - px, dz = e.mesh.position.z - pz;
            if (dx * dx + dz * dz <= lRangeSq) inRange.push(e);
          }
        }
        for (let wi = 0; wi < _activeSkinwalkers.length; wi++) {
          const sw = _activeSkinwalkers[wi];
          if (!sw || sw.dead) continue;
          const dx = sw.parts.root.position.x - px, dz = sw.parts.root.position.z - pz;
          if (dx * dx + dz * dz <= lRangeSq) inRange.push(sw);
        }
        // Strike up to strikes+2 enemies using partial Fisher-Yates shuffle
        const strikeCount = Math.min(inRange.length, (weapons.lightning.strikes || 1) + 2);
        for (let si = 0; si < strikeCount; si++) {
          const ri = si + Math.floor(Math.random() * (inRange.length - si));
          const tmp = inRange[si]; inRange[si] = inRange[ri]; inRange[ri] = tmp;
          _weaponHitEnemy(inRange[si], dmg, '#88FFFF');
        }
      }
    } else { _lightningTimer = 0; }

    // ── METEOR: big AoE impact at nearest enemy position ─────────────────────
    if (weapons.meteor && weapons.meteor.active) {
      _meteorTimer -= dt * 1000;
      if (_meteorTimer <= 0) {
        _meteorTimer = weapons.meteor.cooldown || 2500;
        weapons.meteor.lastShot = Date.now();
        const mArea = weapons.meteor.area || 5;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.meteor.damage || 60) * strMult);
        const nearest = _weaponFindNearest(px, pz, Infinity);
        const mx = nearest ? _weaponEnemyX(nearest) : px;
        const mz = nearest ? _weaponEnemyZ(nearest) : pz;
        _weaponAoeDamage(mx, mz, mArea * mArea, dmg, '#FF6622');
        if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
          BloodV2.rawBurst(mx, 0.5, mz, 30, { color: 0xFF4400, spdMin: 2, spdMax: 8 });
        }
      }
    } else { _meteorTimer = 0; }

    // ── BOW: fires arrow toward nearest enemy ─────────────────────────────────
    if (weapons.bow && weapons.bow.active) {
      _bowTimer -= dt * 1000;
      if (_bowTimer <= 0) {
        _bowTimer = weapons.bow.cooldown || 1400;
        weapons.bow.lastShot = Date.now();
        const range = weapons.bow.range || 16;
        const nearest = _weaponFindNearest(px, pz, range * range);
        if (nearest) {
          const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
          const dmg = Math.round((weapons.bow.damage || 22) * strMult);
          _fireProjectile(px, pz, _weaponEnemyX(nearest), _weaponEnemyZ(nearest), 'bow', dmg);
        }
      }
    } else { _bowTimer = 0; }

    // ── MINIGUN: very rapid fire toward nearest enemy ─────────────────────────
    if (weapons.minigun && weapons.minigun.active) {
      _minigunTimer -= dt * 1000;
      if (_minigunTimer <= 0) {
        _minigunTimer = weapons.minigun.cooldown || 60;
        weapons.minigun.lastShot = Date.now();
        const range = weapons.minigun.range || 12;
        const nearest = _weaponFindNearest(px, pz, range * range);
        if (nearest) {
          const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
          const dmg = Math.round((weapons.minigun.damage || 6) * strMult);
          _fireProjectile(px, pz, _weaponEnemyX(nearest), _weaponEnemyZ(nearest), 'minigun', dmg);
        }
      }
    } else { _minigunTimer = 0; }

    // ── PUMP SHOTGUN: spread of pellets toward nearest enemy ──────────────────
    if (weapons.pumpShotgun && weapons.pumpShotgun.active) {
      _pumpShotgunTimer -= dt * 1000;
      if (_pumpShotgunTimer <= 0) {
        _pumpShotgunTimer = weapons.pumpShotgun.cooldown || 1800;
        weapons.pumpShotgun.lastShot = Date.now();
        const range = weapons.pumpShotgun.range || 8;
        const nearest = _weaponFindNearest(px, pz, range * range);
        const baseAngle = nearest
          ? Math.atan2(_weaponEnemyX(nearest) - px, _weaponEnemyZ(nearest) - pz)
          : player.mesh.rotation.y;
        const spread = weapons.pumpShotgun.spread || 0.7;
        const pellets = weapons.pumpShotgun.pellets || 8;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.pumpShotgun.damage || 14) * strMult);
        for (let pi = 0; pi < pellets; pi++) {
          const a = baseAngle + (Math.random() - 0.5) * spread;
          _fireProjectile(px, pz, px + Math.sin(a) * 10, pz + Math.cos(a) * 10, 'pumpShotgun', dmg);
        }
      }
    } else { _pumpShotgunTimer = 0; }

    // ── AUTO SHOTGUN: faster burst spread toward nearest enemy ────────────────
    if (weapons.autoShotgun && weapons.autoShotgun.active) {
      _autoShotgunTimer -= dt * 1000;
      if (_autoShotgunTimer <= 0) {
        _autoShotgunTimer = weapons.autoShotgun.cooldown || 600;
        weapons.autoShotgun.lastShot = Date.now();
        const range = weapons.autoShotgun.range || 7;
        const nearest = _weaponFindNearest(px, pz, range * range);
        const baseAngle = nearest
          ? Math.atan2(_weaponEnemyX(nearest) - px, _weaponEnemyZ(nearest) - pz)
          : player.mesh.rotation.y;
        const spread = weapons.autoShotgun.spread || 0.6;
        const pellets = weapons.autoShotgun.pellets || 6;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.autoShotgun.damage || 10) * strMult);
        for (let pi = 0; pi < pellets; pi++) {
          const a = baseAngle + (Math.random() - 0.5) * spread;
          _fireProjectile(px, pz, px + Math.sin(a) * 10, pz + Math.cos(a) * 10, 'autoShotgun', dmg);
        }
      }
    } else { _autoShotgunTimer = 0; }

    // ── UZI: rapid fire toward nearest enemy ──────────────────────────────────
    if (weapons.uzi && weapons.uzi.active) {
      _uziTimer -= dt * 1000;
      if (_uziTimer <= 0) {
        _uziTimer = weapons.uzi.cooldown || 120;
        weapons.uzi.lastShot = Date.now();
        const range = weapons.uzi.range || 10;
        const nearest = _weaponFindNearest(px, pz, range * range);
        if (nearest) {
          const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
          const dmg = Math.round((weapons.uzi.damage || 8) * strMult);
          _fireProjectile(px, pz, _weaponEnemyX(nearest), _weaponEnemyZ(nearest), 'uzi', dmg);
        }
      }
    } else { _uziTimer = 0; }

    // ── SNIPER RIFLE: slow single long-range shot toward nearest enemy ────────
    if (weapons.sniperRifle && weapons.sniperRifle.active) {
      _sniperTimer -= dt * 1000;
      if (_sniperTimer <= 0) {
        _sniperTimer = weapons.sniperRifle.cooldown || 3000;
        weapons.sniperRifle.lastShot = Date.now();
        const range = weapons.sniperRifle.range || 30;
        const nearest = _weaponFindNearest(px, pz, range * range);
        if (nearest) {
          const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
          const dmg = Math.round((weapons.sniperRifle.damage || 95) * strMult);
          _fireProjectile(px, pz, _weaponEnemyX(nearest), _weaponEnemyZ(nearest), 'sniperRifle', dmg);
        }
      }
    } else { _sniperTimer = 0; }

    // ── TESLA SABER: melee + chains to 2 extra enemies beyond reach ──────────
    if (weapons.teslaSaber && weapons.teslaSaber.active) {
      _teslaSaberTimer -= dt * 1000;
      if (_teslaSaberTimer <= 0) {
        _teslaSaberTimer = weapons.teslaSaber.cooldown || 800;
        weapons.teslaSaber.lastShot = Date.now();
        const tRange = weapons.teslaSaber.range || 3.5;
        const tRangeSq = tRange * tRange;
        const chainRangeSq = 6 * 6;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.teslaSaber.damage || 28) * strMult);
        const chainDmg = Math.round(dmg * 0.6);
        // Primary melee hit on all enemies in direct range
        _weaponAoeDamage(px, pz, tRangeSq, dmg, '#AAFFFF');
        // Collect chain targets (enemies just outside melee range)
        const chainTargets = [];
        const tPools = [_activeSlimes, _activeCrawlers, _activeLeapingSlimes];
        for (let pi = 0; pi < tPools.length; pi++) {
          const arr = tPools[pi];
          for (let i = 0; i < arr.length; i++) {
            const e = arr[i];
            if (!e || !e.active || e.dead) continue;
            const dx = e.mesh.position.x - px, dz = e.mesh.position.z - pz;
            const dSq = dx * dx + dz * dz;
            if (dSq > tRangeSq && dSq <= chainRangeSq) chainTargets.push(e);
          }
        }
        for (let wi = 0; wi < _activeSkinwalkers.length; wi++) {
          const sw = _activeSkinwalkers[wi];
          if (!sw || sw.dead) continue;
          const dx = sw.parts.root.position.x - px, dz = sw.parts.root.position.z - pz;
          const dSq = dx * dx + dz * dz;
          if (dSq > tRangeSq && dSq <= chainRangeSq) chainTargets.push(sw);
        }
        // Chain-zap up to 2 targets using partial shuffle
        const zapCount = Math.min(chainTargets.length, 2);
        for (let si = 0; si < zapCount; si++) {
          const ri = si + Math.floor(Math.random() * (chainTargets.length - si));
          const tmp = chainTargets[si]; chainTargets[si] = chainTargets[ri]; chainTargets[ri] = tmp;
          _weaponHitEnemy(chainTargets[si], chainDmg, '#AAFFFF');
        }
      }
    } else { _teslaSaberTimer = 0; }

    // ── WHIP: hits all enemies in a wide forward arc ──────────────────────────
    if (weapons.whip && weapons.whip.active) {
      _whipTimer -= dt * 1000;
      if (_whipTimer <= 0) {
        _whipTimer = weapons.whip.cooldown || 900;
        weapons.whip.lastShot = Date.now();
        const wRange = weapons.whip.range || 6;
        const wRangeSq = wRange * wRange;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.whip.damage || 18) * strMult);
        const facingAngle = player.mesh.rotation.y;
        const halfArc = Math.PI * 0.6; // 108° half-arc (216° total forward arc)
        const whipPools = [_activeSlimes, _activeCrawlers, _activeLeapingSlimes];
        for (let pi = 0; pi < whipPools.length; pi++) {
          const arr = whipPools[pi];
          for (let ei = arr.length - 1; ei >= 0; ei--) {
            const e = arr[ei];
            if (!e || !e.active || e.dead) continue;
            const dx = e.mesh.position.x - px, dz = e.mesh.position.z - pz;
            if (dx * dx + dz * dz > wRangeSq) continue;
            const angle = Math.atan2(dx, dz);
            let diff = Math.abs(angle - facingAngle);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff <= halfArc) _weaponHitEnemy(e, dmg, '#FFAA00');
          }
        }
        for (let wi = _activeSkinwalkers.length - 1; wi >= 0; wi--) {
          const sw = _activeSkinwalkers[wi];
          if (!sw || sw.dead) continue;
          const dx = sw.parts.root.position.x - px, dz = sw.parts.root.position.z - pz;
          if (dx * dx + dz * dz > wRangeSq) continue;
          const angle = Math.atan2(dx, dz);
          let diff = Math.abs(angle - facingAngle);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff <= halfArc) _weaponHitEnemy(sw, dmg, '#FFAA00');
        }
      }
    } else { _whipTimer = 0; }

    // ── DOUBLE BARREL: wide spread burst toward nearest enemy ─────────────────
    if (weapons.doubleBarrel && weapons.doubleBarrel.active) {
      _doubleBarrelTimer -= dt * 1000;
      if (_doubleBarrelTimer <= 0) {
        _doubleBarrelTimer = weapons.doubleBarrel.cooldown || 1500;
        weapons.doubleBarrel.lastShot = Date.now();
        const range = weapons.doubleBarrel.range || 12;
        const nearest = _weaponFindNearest(px, pz, range * range);
        const baseAngle = nearest
          ? Math.atan2(_weaponEnemyX(nearest) - px, _weaponEnemyZ(nearest) - pz)
          : player.mesh.rotation.y;
        const spread = weapons.doubleBarrel.spread || 0.55;
        const pellets = weapons.doubleBarrel.pellets || 12;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.doubleBarrel.damage || 12) * strMult);
        for (let pi = 0; pi < pellets; pi++) {
          const a = baseAngle + (Math.random() - 0.5) * spread;
          _fireProjectile(px, pz, px + Math.sin(a) * 10, pz + Math.cos(a) * 10, 'doubleBarrel', dmg);
        }
      }
    } else { _doubleBarrelTimer = 0; }

    // ── BOOMERANG: fires projectile toward nearest enemy ──────────────────────
    if (weapons.boomerang && weapons.boomerang.active) {
      _boomerangTimer -= dt * 1000;
      if (_boomerangTimer <= 0) {
        _boomerangTimer = weapons.boomerang.cooldown || 1600;
        weapons.boomerang.lastShot = Date.now();
        const range = weapons.boomerang.range || 12;
        const nearest = _weaponFindNearest(px, pz, range * range);
        const bAngle = nearest
          ? Math.atan2(_weaponEnemyX(nearest) - px, _weaponEnemyZ(nearest) - pz)
          : player.mesh.rotation.y;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.boomerang.damage || 25) * strMult);
        _fireProjectile(px, pz, px + Math.sin(bAngle) * 10, pz + Math.cos(bAngle) * 10, 'boomerang', dmg);
      }
    } else { _boomerangTimer = 0; }

    // ── SHURIKEN: fires N projectiles evenly spread around the player ─────────
    if (weapons.shuriken && weapons.shuriken.active) {
      _shurikenTimer -= dt * 1000;
      if (_shurikenTimer <= 0) {
        _shurikenTimer = weapons.shuriken.cooldown || 400;
        weapons.shuriken.lastShot = Date.now();
        const numProj = weapons.shuriken.projectiles || 3;
        const range = weapons.shuriken.range || 10;
        const nearest = _weaponFindNearest(px, pz, range * range);
        const baseAngle = nearest
          ? Math.atan2(_weaponEnemyX(nearest) - px, _weaponEnemyZ(nearest) - pz)
          : player.mesh.rotation.y;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.shuriken.damage || 12) * strMult);
        for (let si = 0; si < numProj; si++) {
          const a = baseAngle + (si / numProj) * Math.PI * 2;
          _fireProjectile(px, pz, px + Math.sin(a) * 10, pz + Math.cos(a) * 10, 'shuriken', dmg);
        }
      }
    } else { _shurikenTimer = 0; }

    // ── NANO SWARM: wider aura of nano-bots dealing persistent area damage ────
    if (weapons.nanoSwarm && weapons.nanoSwarm.active) {
      _nanoSwarmTimer -= dt * 1000;
      if (_nanoSwarmTimer <= 0) {
        _nanoSwarmTimer = weapons.nanoSwarm.cooldown || 200;
        weapons.nanoSwarm.lastShot = Date.now();
        const nRange = weapons.nanoSwarm.range || 8;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round((weapons.nanoSwarm.damage || 4) * strMult);
        _weaponAoeDamage(px, pz, nRange * nRange, dmg, '#00FFCC');
      }
    } else { _nanoSwarmTimer = 0; }

    // ── HOMING MISSILE: fires toward nearest enemy ────────────────────────────
    if (weapons.homingMissile && weapons.homingMissile.active) {
      _homingMissileTimer -= dt * 1000;
      if (_homingMissileTimer <= 0) {
        _homingMissileTimer = weapons.homingMissile.cooldown || 2200;
        weapons.homingMissile.lastShot = Date.now();
        const range = weapons.homingMissile.range || 20;
        const nearest = _weaponFindNearest(px, pz, range * range);
        if (nearest) {
          const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
          const dmg = Math.round((weapons.homingMissile.damage || 50) * strMult);
          _fireProjectile(px, pz, _weaponEnemyX(nearest), _weaponEnemyZ(nearest), 'homingMissile', dmg);
        }
      }
    } else { _homingMissileTimer = 0; }

    // ── POISON: periodic AoE dot damage cloud around player ──────────────────
    if (weapons.poison && weapons.poison.active) {
      _poisonTimer -= dt * 1000;
      if (_poisonTimer <= 0) {
        _poisonTimer = weapons.poison.cooldown || 1500;
        weapons.poison.lastShot = Date.now();
        const pRange = weapons.poison.range || 5;
        const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
        const dmg = Math.round(((weapons.poison.dotDamage || 3) + (weapons.poison.damage || 6)) * strMult);
        _weaponAoeDamage(px, pz, pRange * pRange, dmg, '#00CC44');
      }
    } else { _poisonTimer = 0; }

    // ── FIREBALL: fires a tagged projectile; AoE triggers on impact ──────────
    if (weapons.fireball && weapons.fireball.active) {
      _fireballTimer -= dt * 1000;
      if (_fireballTimer <= 0) {
        _fireballTimer = weapons.fireball.cooldown || 1800;
        weapons.fireball.lastShot = Date.now();
        const range = weapons.fireball.range || 14;
        const nearest = _weaponFindNearest(px, pz, range * range);
        if (nearest) {
          const strMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
          const dmg = Math.round((weapons.fireball.damage || 35) * strMult);
          const eRadius = weapons.fireball.explosionRadius || 3;
          // Tag the projectile so _hit* handlers apply fireball damage + AoE on impact
          _fireProjectile(px, pz, _weaponEnemyX(nearest), _weaponEnemyZ(nearest),
            'fireball', dmg, eRadius);
        }
      }
    } else { _fireballTimer = 0; }

    // ── DRONE TURRET: drones orbit player and fire automatically ─────────────
    // The DroneTurret class and its update loop live in enemy-class.js / game-loop.js.
    // In the sandbox the game loop is not running, so we drive the update here.
    if (weapons.droneTurret && weapons.droneTurret.active &&
        typeof DroneTurret !== 'undefined' &&
        Array.isArray(window.droneTurrets) && window.droneTurrets.length > 0) {
      for (let di = 0; di < window.droneTurrets.length; di++) {
        const drone = window.droneTurrets[di];
        if (drone && typeof drone.update === 'function') drone.update(dt);
      }
    }
  }

  // ─── Manual aim only — no auto-aim lock ─────────────────────────────────────
  let _gunCooldown = 0;

  // ─── Revolver ammo / reload state ────────────────────────────────────────────
  const REVOLVER_MAX_AMMO = 5;
  const REVOLVER_RELOAD_TIME = 1.8;        // seconds for full reload
  const REVOLVER_FIRE_RATE_MULT = 0.85;    // 15% faster than base gun cooldown (snappier feel)
  let _revolverAmmo = REVOLVER_MAX_AMMO;
  let _isReloading = false;
  let _reloadTimer = 0;
  let _reloadAnimFrame = 0; // 0 to REVOLVER_MAX_AMMO, how many bullets loaded so far

  // ─── Gun model state ─────────────────────────────────────────────────────────
  let _gunModel = null;
  let _gunDrum  = null; // direct reference to drum mesh for spin animation
  const _gunOffset = { x: 0.35, y: -0.1, z: 0 };
  let _gunRecoilTime = 0;

  // ─── Player bounce/animation state ───────────────────────────────────────────
  let _playerBounceTime = 0;
  let _playerBounceActive = false;
  let _playerIdleTime = 0;

  // ─── Player velocity physics (acceleration / friction / inputResponsiveness) ─
  let _playerVx = 0;        // current X velocity (world units / second)
  let _playerVz = 0;        // current Z velocity (world units / second)
  let _smoothInputX = 0;    // lerped input direction X (inputResponsiveness lerp)
  let _smoothInputZ = 0;    // lerped input direction Z

  function _tryFire(dt) {
    if (!player || !player.mesh) return;

    // Player position for aim calculations
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;

    // Effective magazine size and reload time — read from playerStats if available
    const _effMaxAmmo    = (playerStats && playerStats.magazineCapacity) || REVOLVER_MAX_AMMO;
    const _effReloadTime = REVOLVER_RELOAD_TIME / Math.max(0.1, (playerStats && playerStats.reloadSpeed) || 1.0);

    // Handle reload state
    if (_isReloading) {
      _reloadTimer -= dt;
      const progress = 1 - Math.max(0, _reloadTimer / _effReloadTime);
      _reloadAnimFrame = Math.floor(progress * _effMaxAmmo);
      _updateRevolverUI();
      if (_reloadTimer <= 0) {
        _isReloading = false;
        _revolverAmmo = _effMaxAmmo;
        _reloadAnimFrame = _effMaxAmmo;
        _updateRevolverUI();
      }
      return; // can't fire while reloading
    }

    // Out of ammo — start reload
    if (_revolverAmmo <= 0) {
      _isReloading = true;
      _reloadTimer = _effReloadTime;
      _reloadAnimFrame = 0;
      _updateRevolverUI();
      return;
    }

    // _gunCooldown is tracked in milliseconds (matching weapons.gun.cooldown units).
    // dt is in seconds, so dt*1000 converts to ms per frame.
    _gunCooldown -= dt * 1000;
    if (_gunCooldown > 0) return;

    // Fire rate: base cooldown reduced by playerStats.fireRate multiplier
    const fireRateMult = Math.max(0.1, (playerStats && playerStats.fireRate) || 1.0);
    const cooldown = weapons && weapons.gun ? Math.round(weapons.gun.cooldown * REVOLVER_FIRE_RATE_MULT / fireRateMult) : Math.round(850 / fireRateMult);
    _gunCooldown = cooldown;
    if (weapons && weapons.gun) weapons.gun.lastShot = Date.now(); // track for skill-icon cooldown overlay

    // Manual aim: joystick takes priority, then mouse, then auto-aim to nearest enemy.
    let tx, tz;
    if (_aimJoy.active && (_aimJoy.dx !== 0 || _aimJoy.dz !== 0)) {
      tx = px + _aimJoy.dx * 10;
      tz = pz + _aimJoy.dz * 10;
    } else if (_mouse && (_mouse.worldX !== 0 || _mouse.worldZ !== 0)) {
      tx = _mouse.worldX;
      tz = _mouse.worldZ;
    } else {
      // Auto-aim fallback: find nearest enemy within gun range
      const gunRange = (weapons && weapons.gun && weapons.gun.range) || 12;
      const gunRangeSq = gunRange * gunRange;
      let nearestEnemy = null;
      let nearestDistSq = gunRangeSq;

      // Iterate each active-enemy array directly to avoid GC allocation from .concat()
      const enemySources = [_activeSlimes, _activeLeapingSlimes, _activeCrawlers, _activeSkinwalkers];
      for (let s = 0; s < enemySources.length; s++) {
        const arr = enemySources[s];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (!e || !e.mesh) continue;
          const dx = e.mesh.position.x - px;
          const dz = e.mesh.position.z - pz;
          const distSq = dx * dx + dz * dz;
          if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestEnemy = e;
          }
        }
      }

      if (!nearestEnemy) return; // no enemies in range — don't fire

      tx = nearestEnemy.mesh.position.x;
      tz = nearestEnemy.mesh.position.z;
    }

    _revolverAmmo--;
    _updateRevolverUI();
    _fireProjectile(px, pz, tx, tz);

    // Muzzle flash: illuminate environment on every shot
    const weaponName = (saveData && saveData.equippedGear && saveData.equippedGear.weapon) || 'gun';
    if (window.spawnWeaponMuzzleFlash) {
      _tmpV3.set(px, 0.5, pz);
      const fdx = tx - px, fdz = tz - pz;
      const flen = Math.sqrt(fdx * fdx + fdz * fdz) || 1;
      _tmpV3b.set(fdx / flen, 0, fdz / flen);
      window.spawnWeaponMuzzleFlash(weaponName, _tmpV3, _tmpV3b, scene);
    } else if (window._acquireFlash) {
      _tmpV3.set(px, 1.0, pz);
      window._acquireFlash(scene, DEFAULT_FLASH_COLOR, DEFAULT_FLASH_INTENSITY, DEFAULT_FLASH_RADIUS, _tmpV3, DEFAULT_FLASH_DURATION_MS);
    }

    // Smoothly rotate toward the firing angle using shortest-arc interpolation so the
    // player never spins the long way when rotation.y crosses the -π/π boundary.
    const targetYaw = Math.atan2(tx - px, tz - pz);
    const currentYaw = player.mesh.rotation.y;
    let yawDelta = targetYaw - currentYaw;
    yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
    player.mesh.rotation.y = currentYaw + yawDelta * 0.35;

    // Update gun model position/rotation (if attached)
    _updateGunModel(tx, tz);

    // Gun recoil animation
    if (_gunModel) {
      _gunModel.position.x = _gunOffset.x - 0.06;
      _gunModel.position.z = _gunOffset.z + 0.04;
      _gunRecoilTime = 0.08;
    }
  }

  function _updateRevolverUI() {
    const ui = document.getElementById('revolver-ui');
    if (!ui) return;
    const cylinder = document.getElementById('revolver-cylinder');
    const chambersEl = document.getElementById('revolver-chambers');
    const label = document.getElementById('revolver-ammo-label');
    if (!cylinder || !chambersEl || !label) return;

    const effMax = (playerStats && playerStats.magazineCapacity) || REVOLVER_MAX_AMMO;
    const currentAmmo = _isReloading ? _reloadAnimFrame : _revolverAmmo;

    // Rebuild chambers only when magSize changes
    if (chambersEl._builtFor !== effMax) {
      chambersEl._builtFor = effMax;
      chambersEl.innerHTML = '';
      const radius = 34; // px from cylinder centre
      const cx = 50;
      const cy = 50;
      for (let i = 0; i < effMax; i++) {
        const angle = (i / effMax) * Math.PI * 2 - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        const ch = document.createElement('div');
        ch.className = 'revolver-chamber loaded';
        ch.style.left = (x - 9) + 'px';
        ch.style.top  = (y - 9) + 'px';
        chambersEl.appendChild(ch);
      }
    }

    // Update chamber states
    const chambers = chambersEl.children;
    for (let i = 0; i < chambers.length; i++) {
      if (_isReloading) {
        if (i < _reloadAnimFrame) {
          chambers[i].className = 'revolver-chamber reloading';
          // After animation frame, settle to loaded
          if (chambers[i]._reloadDone !== _reloadAnimFrame) {
            chambers[i]._reloadDone = _reloadAnimFrame;
            const chamber = chambers[i];
            setTimeout(() => { if (chamber.className === 'revolver-chamber reloading') chamber.className = 'revolver-chamber loaded'; }, 180);
          }
        } else {
          chambers[i].className = 'revolver-chamber empty';
        }
      } else {
        chambers[i].className = 'revolver-chamber' + (i < _revolverAmmo ? ' loaded' : ' empty');
      }
    }

    // Rotate cylinder on each shot — track via the stored rotation offset
    if (!cylinder._rotDeg) cylinder._rotDeg = 0;
    if (cylinder._lastAmmo !== undefined && !_isReloading && _revolverAmmo < cylinder._lastAmmo) {
      const step = 360 / effMax;
      cylinder._rotDeg += step;
      cylinder.style.transition = 'transform 0.12s cubic-bezier(0.22,1,0.36,1)';
      cylinder.style.transform = `rotate(${cylinder._rotDeg}deg)`;
    } else if (_isReloading && cylinder._lastAmmo !== undefined) {
      cylinder.style.transition = 'transform 0.5s ease-out';
      cylinder.style.transform = `rotate(0deg)`;
      cylinder._rotDeg = 0;
    }
    cylinder._lastAmmo = _isReloading ? -1 : _revolverAmmo;

    // Update label
    if (_isReloading) {
      label.textContent = 'RELOAD';
      label.className = 'revolver-label reloading';
    } else {
      label.textContent = _revolverAmmo + '/' + effMax;
      label.className = 'revolver-label' + (_revolverAmmo <= 1 ? ' danger' : '');
      label.style.color = _revolverAmmo <= 1 ? '#FF4444' : '#FFD700';
    }
  }

  // ─── Gun model (revolver) ─────────────────────────────────────────────────────
  function _buildGunModel() {
    if (!player || !player.mesh) return;
    const gunGroup = new THREE.Group();

    // Barrel (long thin cylinder)
    const barrelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.4, metalness: 0.8 });
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.22, 0, 0);
    gunGroup.add(barrel);

    // Cylinder (revolver drum)
    const drumGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.15, 12);
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.5, metalness: 0.7 });
    const drum = new THREE.Mesh(drumGeo, drumMat);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0.05, -0.02, 0);
    gunGroup.add(drum);

    // Grip/Handle
    const gripGeo = new THREE.BoxGeometry(0.08, 0.22, 0.06);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x4A2E1A, roughness: 0.9, metalness: 0.0 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(-0.06, -0.14, 0);
    grip.rotation.z = -0.15;
    gunGroup.add(grip);

    gunGroup.position.set(_gunOffset.x, _gunOffset.y, _gunOffset.z);
    gunGroup.castShadow = true;

    player.mesh.add(gunGroup);
    _gunModel = gunGroup;
    _gunDrum = drum;
  }

  function _updateGunModel(targetX, targetZ) {
    if (!_gunModel || !player || !player.mesh) return;
    // Spin drum slightly on each shot
    if (_gunDrum) _gunDrum.rotation.x += 0.4;
  }

  function _updateGunRecoil(dt) {
    if (_gunRecoilTime <= 0 || !_gunModel) return;
    _gunRecoilTime = Math.max(0, _gunRecoilTime - dt);
    const t = 1 - _gunRecoilTime / 0.08;
    _gunModel.position.x = (_gunOffset.x - 0.06) + t * 0.06;
    _gunModel.position.z = (_gunOffset.z + 0.04) - t * 0.04;
  }

  // ─── Input ────────────────────────────────────────────────────────────────────
  const _keysDown = {};
  // Pre-allocated objects for mouse raycasting (avoids GC pressure on every mousemove)
  const _mouseRay   = new THREE.Raycaster();
  const _mouseNDC   = new THREE.Vector2();
  const _mousePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _mousePt    = new THREE.Vector3();
  // Pre-allocated camera follow target (avoids new Vector3 every frame)
  const _camTarget  = new THREE.Vector3();

  let _inputInitialized = false;

  function _initInput() {
    // Guard against double registration — listeners should only be attached once
    // per page lifetime, even if initialization is accidentally re-entered.
    if (_inputInitialized) return;
    _inputInitialized = true;

    document.addEventListener('keydown', function (e) {
      _keysDown[e.code] = true;
      // 'E' key: attempt to gather resources from nearby trees/rocks
      if (e.code === 'KeyE' && window.WorldObjects && player && player.mesh) {
        var result = WorldObjects.tryGather(player.mesh.position.x, player.mesh.position.z);
        if (result) {
          _tmpV3.set(player.mesh.position.x, player.mesh.position.y + 1.5, player.mesh.position.z);
          createFloatingText('+' + result.amount + ' ' + result.type, _tmpV3, result.type === 'wood' ? '#8B6B3A' : '#9A9A9A');
        }
      }
    });
    document.addEventListener('keyup',   function (e) { _keysDown[e.code] = false; });

    // Mouse: project onto ground plane (y=0) — uses pre-allocated objects (no GC)
    document.addEventListener('mousemove', function (e) {
      if (!camera || !renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      _mouseRay.setFromCamera(_mouseNDC, camera);
      _mouseRay.ray.intersectPlane(_mousePlane, _mousePt);
      _mouse.worldX = _mousePt.x;
      _mouse.worldZ = _mousePt.z;
    });

    // Joystick: left = move, right = aim/shoot
    const jZone = document.getElementById('joystick-zone');
    if (jZone) {
      jZone.addEventListener('touchstart',  _onTouchStart,  { passive: false });
      jZone.addEventListener('touchmove',   _onTouchMove,   { passive: false });
      jZone.addEventListener('touchend',    _onTouchEnd,    { passive: false });
      jZone.addEventListener('touchcancel', _onTouchEnd,    { passive: false });
    }
  }

  function _onTouchStart(e) {
    e.preventDefault();
    const rect = renderer ? renderer.domElement.getBoundingClientRect() : document.body.getBoundingClientRect();
    const half = rect.width / 2;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const lx = t.clientX - rect.left;
      if (lx < half) {
        _joy.id = t.identifier; _joy.startX = t.clientX; _joy.startZ = t.clientY; _joy.active = true;
      } else {
        _aimJoy.id = t.identifier; _aimJoy.startX = t.clientX; _aimJoy.startZ = t.clientY; _aimJoy.active = true;
      }
    }
    _updateJoystickVisuals();
  }

  function _onTouchMove(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === _joy.id) {
        const raw = 60, ddx = _clamp(t.clientX - _joy.startX, -raw, raw), ddz = _clamp(t.clientY - _joy.startZ, -raw, raw);
        const len = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        _joy.dx = ddx / len; _joy.dz = ddz / len;
      }
      if (t.identifier === _aimJoy.id) {
        const raw = 60, ddx = _clamp(t.clientX - _aimJoy.startX, -raw, raw), ddz = _clamp(t.clientY - _aimJoy.startZ, -raw, raw);
        const len = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        _aimJoy.dx = ddx / len; _aimJoy.dz = ddz / len;
      }
    }
    _updateJoystickVisuals();
  }

  function _onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === _joy.id)    { _joy.active = false;    _joy.dx = 0;    _joy.dz = 0; }
      if (t.identifier === _aimJoy.id) { _aimJoy.active = false; _aimJoy.dx = 0; _aimJoy.dz = 0; }
    }
    _updateJoystickVisuals();
  }

  function _updateJoystickVisuals() {
    const outer  = document.getElementById('joystick-outer');
    const inner  = document.getElementById('joystick-inner');
    const outerR = document.getElementById('joystick-outer-right');
    const innerR = document.getElementById('joystick-inner-right');
    if (inner  && outer)  { inner.style.transform  = _joy.active    ? 'translate(' + _joy.dx * 30    + 'px,' + _joy.dz * 30    + 'px)' : ''; }
    if (innerR && outerR) { innerR.style.transform = _aimJoy.active ? 'translate(' + _aimJoy.dx * 30 + 'px,' + _aimJoy.dz * 30 + 'px)' : ''; }
  }

  function _getMoveDir() {
    let dx = 0, dz = 0;
    if (_keysDown['KeyW'] || _keysDown['ArrowUp'])    dz -= 1;
    if (_keysDown['KeyS'] || _keysDown['ArrowDown'])  dz += 1;
    if (_keysDown['KeyA'] || _keysDown['ArrowLeft'])  dx -= 1;
    if (_keysDown['KeyD'] || _keysDown['ArrowRight']) dx += 1;
    if (_joy.active) { dx = _joy.dx; dz = _joy.dz; }
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0) { dx /= len; dz /= len; }
    return { dx, dz };
  }

  // ─── Three.js scene init ──────────────────────────────────────────────────────
  function _initScene() {
    // Allocate pre-shared Vector3 objects — must be after THREE.js is available
    _tmpV3  = new THREE.Vector3();
    _tmpV3b = new THREE.Vector3();
    _leapHitNormal = new THREE.Vector3();
    _leapBulletDir = new THREE.Vector3();

    // Renderer - expose as window global for gem-classes.js and other systems
    window.renderer = renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    // Apply saved or default graphics quality — this sets pixelRatio, shadowMap, toneMapping
    let _savedQuality = DEFAULT_QUALITY;
    try { _savedQuality = localStorage.getItem('sandboxGraphicsQuality') || DEFAULT_QUALITY; } catch (_) {}
    // Apply defaults first so properties exist before _applyGraphicsQuality runs
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, _isMobile ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    // sRGB output color space for correct texture color rendering
    if (typeof THREE.SRGBColorSpace !== 'undefined') {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (typeof THREE.sRGBEncoding !== 'undefined') {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }

    const container = document.getElementById('game-container');
    if (container) container.appendChild(renderer.domElement);
    else           document.body.appendChild(renderer.domElement);

    // Scene - expose as window global for gem-classes.js to add meshes
    window.scene = scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 40, 120);

    // Camera (top-down, slightly angled — matching main game)
    window.camera = camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.position.set(0, 18, 12);
    camera.lookAt(0, 0, 0);

    // Lighting — enhanced for better real-time shadows and atmosphere
    const ambient = new THREE.AmbientLight(0xffffff, 0.45); // slightly reduced ambient for contrast
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xFFF5E0, 1.1); // warm daylight tone
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near    = 1;
    sun.shadow.camera.far     = 200;
    sun.shadow.camera.left    = -80;
    sun.shadow.camera.right   =  80;
    sun.shadow.camera.top     =  80;
    sun.shadow.camera.bottom  = -80;
    sun.shadow.bias           = -0.001; // reduce shadow acne
    sun.shadow.normalBias     = 0.02;
    scene.add(sun);
    scene.add(sun.target); // target must be in scene for updateMatrixWorld() to work

    // Soft fill light from opposite side for rim lighting
    const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
    fill.position.set(-10, 20, -10);
    scene.add(fill);

    // Ground bounce — subtle warm light from below
    const bounce = new THREE.HemisphereLight(0x88BBAA, 0x445544, 0.3);
    scene.add(bounce);

    // Store light references for WorldObjects day/night cycle
    window._sandboxLights = { ambient: ambient, sun: sun, fill: fill, hemisphere: bounce };

    // Resize handler
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (window._bloomComposer) window._bloomComposer.setSize(window.innerWidth, window.innerHeight);
    });

    // Post-processing — graceful fallback if CDN scripts didn't load
    try {
      if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
        const composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(scene, camera));
        const bloomPass = new THREE.UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          0.4,   // strength (subtle)
          0.6,   // radius
          0.85   // threshold (only bright things bloom)
        );
        composer.addPass(bloomPass);
        window._bloomComposer = composer;
        window._bloomPass = bloomPass;

        // Motion blur via AfterImagePass — trails previous frames for a velocity smear
        if (THREE.AfterImagePass) {
          const afterImagePass = new THREE.AfterImagePass(MOTION_BLUR_DAMP);
          composer.addPass(afterImagePass);
          window._afterImagePass = afterImagePass;
          console.log('[SandboxLoop] Motion blur (AfterImagePass) enabled');
        }

        console.log('[SandboxLoop] Bloom post-processing enabled');
      }
    } catch(e) {
      console.warn('[SandboxLoop] Post-processing setup failed, using standard rendering:', e);
    }

    // Apply saved quality after renderer is set up
    _applyGraphicsQuality(_savedQuality);
  }

  // ─── Gathering Nodes (trees & rocks) for the sandbox arena ───────────────────
  function _spawnGatheringNodes() {
    if (!window.destructibleProps) window.destructibleProps = [];
    const TREE_COUNT = 8, ROCK_COUNT = 6;
    const ARENA_R = 28;
    const THREE = window.THREE;
    if (!THREE || !scene) return;

    function _makeNode(type, x, z) {
      var mesh, hp, maxHp;
      if (type === 'tree') {
        var grp = new THREE.Group();
        var trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
        var trunk = new THREE.Mesh(trunkGeo, new THREE.MeshToonMaterial({ color: 0x8B4513 }));
        trunk.position.y = 1.5;
        trunk.castShadow = true;
        var leavesGeo = new THREE.SphereGeometry(1.5, 8, 8);
        var leaves = new THREE.Mesh(leavesGeo, new THREE.MeshToonMaterial({ color: 0x228B22 }));
        leaves.position.y = 3.5;
        leaves.castShadow = true;
        grp.add(trunk);
        grp.add(leaves);
        grp.position.set(x, 0, z);
        grp.userData.trunk = trunk;
        grp.userData.leaves = leaves;
        grp.userData.swayPhase = Math.random() * Math.PI * 2;
        grp.userData.swaySpeed = 0.5 + Math.random() * 0.5;
        grp.userData.swayAmount = 0.05 + Math.random() * 0.05;
        scene.add(grp);
        mesh = grp; hp = 50; maxHp = 50;
      } else {
        var rGeo = new THREE.DodecahedronGeometry(0.8, 0);
        var rMat = new THREE.MeshToonMaterial({ color: 0x888888 });
        var rock = new THREE.Mesh(rGeo, rMat);
        rock.position.set(x, 0.5, z);
        rock.castShadow = true;
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        scene.add(rock);
        mesh = rock; hp = 40; maxHp = 40;
      }
      return {
        type: type, mesh: mesh, hp: hp, maxHp: maxHp, destroyed: false,
        originalPosition: mesh.position.clone(),
        originalScale: mesh.scale.clone(),
        originalColor: type === 'tree'
          ? { trunk: mesh.userData.trunk.material.color.clone(), leaves: mesh.userData.leaves.material.color.clone() }
          : mesh.material.color.clone()
      };
    }

    for (var i = 0; i < TREE_COUNT; i++) {
      var angle = (i / TREE_COUNT) * Math.PI * 2;
      var r = ARENA_R * (0.6 + Math.random() * 0.35);
      window.destructibleProps.push(_makeNode('tree', Math.cos(angle) * r, Math.sin(angle) * r));
    }
    for (var j = 0; j < ROCK_COUNT; j++) {
      var rAngle = (j / ROCK_COUNT) * Math.PI * 2 + 0.5;
      var rr = ARENA_R * (0.55 + Math.random() * 0.35);
      window.destructibleProps.push(_makeNode('rock', Math.cos(rAngle) * rr, Math.sin(rAngle) * rr));
    }
  }

  // ─── Graphics Quality presets ─────────────────────────────────────────────────
  // Maps quality key → renderer configuration.
  // Called once at boot (from saved preference) and dynamically when user changes.
  const QUALITY_DESCS = {
    ultralow: 'Shadows OFF · Pixel ratio 0.5× · No tone mapping · No post-FX — best for budget phones',
    low:      'Shadows OFF · Pixel ratio 0.75× (mobile) / 1× (desktop) · Linear tone mapping · No post-FX — good for S10/mid-range',
    medium:   'Shadows ON  · Pixel ratio 1× · Linear tone mapping · Bloom — balanced (default)',
    high:     'Shadows ON (PCF) · Pixel ratio 1.5× (mobile) / ≤2× (desktop) · Filmic tone mapping · Bloom + Motion Blur — modern phones',
    ultra:    'Shadows ON (PCFSoft) · Pixel ratio 1.5× (mobile) / ≤2× (desktop) · Filmic tone mapping · Bloom + Motion Blur — iPhone 16 / PC',
  };
  const DEFAULT_QUALITY = 'ultra';

  // ─── FPS Tracking & Auto-Quality Adjustment ───────────────────────────────────
  // Circular buffer — zero allocations every frame (no push/shift GC pressure)
  const FPS_SAMPLE_COUNT    = 60;  // 60 frames ≈ 1 second at 60 fps
  const FPS_CHECK_INTERVAL  = 2.0; // re-evaluate every 2 seconds
  const FPS_TARGET          = 60;  // desired minimum FPS
  const FPS_VERY_LOW_THRESHOLD = 40; // urgent: drop two quality levels
  const FPS_LOW_THRESHOLD      = 55; // moderate: drop one quality level
  const FPS_HIGH_THRESHOLD     = 70; // comfortable: allow one quality step up

  const _fpsBuf   = new Float32Array(FPS_SAMPLE_COUNT); // pre-allocated, GC-free
  let   _fpsBufIdx   = 0;
  let   _fpsBufFull  = false; // true once we've filled the buffer at least once
  let   _fpsCheckTimer = 0;
  let   _autoQualityEnabled = true;
  // Quality tier order for stepping up/down
  const _qualityTiers = ['ultralow', 'low', 'medium', 'high', 'ultra'];

  function _trackFPS(dt) {
    if (!_autoQualityEnabled) return;
    // Respect user's manual graphics selection — never auto-downgrade in manual mode.
    if (window.gameSettings && window.gameSettings.graphicsMode === 'manual') return;
    // Skip sampling when the tab is backgrounded or gameplay is paused/frozen —
    // throttled rAF in background tabs produces artificially low frame times that
    // would wrongly trigger a quality drop.
    if (document.hidden || window.isPaused || _hitStopRemaining > 0) return;

    const fps = dt > 0 ? 1.0 / dt : FPS_TARGET;
    _fpsBuf[_fpsBufIdx] = fps;
    _fpsBufIdx = (_fpsBufIdx + 1) % FPS_SAMPLE_COUNT;
    if (_fpsBufIdx === 0) _fpsBufFull = true;

    _fpsCheckTimer += dt;
    if (_fpsCheckTimer < FPS_CHECK_INTERVAL) return;
    _fpsCheckTimer = 0;

    // Calculate average FPS — plain loop, zero allocations
    var _fpsSum = 0;
    var _fpsLen = _fpsBufFull ? FPS_SAMPLE_COUNT : _fpsBufIdx;
    if (_fpsLen === 0) return; // no samples yet
    for (var _fi = 0; _fi < _fpsLen; _fi++) _fpsSum += _fpsBuf[_fi];
    const avgFPS = _fpsSum / _fpsLen;

    // Normalize current quality to a known tier; guard against unknown stored values
    let currentQuality = DEFAULT_QUALITY;
    try { currentQuality = localStorage.getItem('sandboxGraphicsQuality') || DEFAULT_QUALITY; } catch (_) {}
    let tierIdx = _qualityTiers.indexOf(currentQuality);
    if (tierIdx < 0) tierIdx = _qualityTiers.indexOf(DEFAULT_QUALITY); // clamp unknown values

    // Auto-adjust: step down when FPS is too low, step up when FPS is comfortable
    if (avgFPS < FPS_VERY_LOW_THRESHOLD && tierIdx > 0) {
      // Very low FPS — drop two tiers at once for quick relief
      const newTier = _qualityTiers[Math.max(0, tierIdx - 2)];
      // console.log(`[Auto-Quality] FPS ${avgFPS.toFixed(1)} < ${FPS_VERY_LOW_THRESHOLD} — dropping to ${newTier}`); // REMOVED: hot-path performance
      _applyGraphicsQuality(newTier);
      _showPerformanceNotification(`Performance mode: ${newTier.toUpperCase()}`);
    } else if (avgFPS < FPS_LOW_THRESHOLD && tierIdx > 0) {
      // Below target — drop one tier
      const newTier = _qualityTiers[tierIdx - 1];
      // console.log(`[Auto-Quality] FPS ${avgFPS.toFixed(1)} < ${FPS_LOW_THRESHOLD} — dropping to ${newTier}`); // REMOVED: hot-path performance
      _applyGraphicsQuality(newTier);
      _showPerformanceNotification(`Performance mode: ${newTier.toUpperCase()}`);
    } else if (avgFPS >= FPS_HIGH_THRESHOLD && tierIdx < _qualityTiers.length - 1) {
      // Plenty of headroom — step up one tier, capped at user's chosen ceiling
      let userTierIdx = _qualityTiers.length - 1; // default: no ceiling
      try {
        const saved = localStorage.getItem('sandboxGraphicsQualityUser');
        if (saved) {
          const idx = _qualityTiers.indexOf(saved);
          if (idx >= 0) userTierIdx = idx;
        }
      } catch (_) {}
      if (tierIdx < userTierIdx) {
        const newTier = _qualityTiers[tierIdx + 1];
        // console.log(`[Auto-Quality] FPS ${avgFPS.toFixed(1)} >= ${FPS_HIGH_THRESHOLD} — stepping up to ${newTier}`); // REMOVED: hot-path performance
        _applyGraphicsQuality(newTier);
      }
    }
  }

  function _showPerformanceNotification(message) {
    // Create a simple notification overlay
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: #FFD700;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.transition = 'opacity 0.5s';
      notification.style.opacity = '0';
      setTimeout(() => document.body.removeChild(notification), 500);
    }, 3000);
  }

  function _applyGraphicsQuality(quality) {
    if (!renderer) return;
    switch (quality) {
      case 'ultralow':
        renderer.setPixelRatio(0.5);
        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1.0;
        break;
      case 'low':
        renderer.setPixelRatio(_isMobile ? 0.75 : 1.0);
        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.0;
        break;
      case 'medium':
        renderer.setPixelRatio(1.0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.BasicShadowMap;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.1;
        break;
      case 'high':
        renderer.setPixelRatio(_isMobile ? 1.5 : Math.min(window.devicePixelRatio, 2.0));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        break;
      case 'ultra':
      default:
        // Strictly cap at 1.5 on mobile to prevent GPU overload on high-DPI devices (iPhone 16 @ 3.0)
        renderer.setPixelRatio(_isMobile ? 1.5 : Math.min(window.devicePixelRatio, 2.0));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.4;
        break;
    }
    // Force shader recompile so shadow map type change takes effect
    renderer.shadowMap.needsUpdate = true;
    // Toggle post-FX based on quality tier
    var bloomOn = (quality !== 'ultralow' && quality !== 'low');
    var mbOn = (quality === 'high' || quality === 'ultra');
    if (window._bloomPass) {
      // Disable bloom pass entirely at ultralow/low for max performance
      window._bloomPass.enabled = bloomOn;
      window._bloomPass.strength = bloomOn ? 0.4 : 0.0;
    }
    if (window._afterImagePass) {
      // Motion blur only at high / ultra; disable pass at lower tiers
      window._afterImagePass.enabled = mbOn;
      window._afterImagePass.uniforms['damp'].value = mbOn ? MOTION_BLUR_DAMP : 0.0;
    }
    // At ultralow/low the composer has no active passes beyond RenderPass, so bypass
    // it entirely and use renderer.render() directly to avoid render target overhead.
    window._composerActive = bloomOn;
    // Persist selection
    try { localStorage.setItem('sandboxGraphicsQuality', quality); } catch (_) {}
    // Update gameSettings global if present
    if (window.gameSettings) window.gameSettings.quality = quality;
    // console.log('[SandboxLoop] Graphics quality applied:', quality); // REMOVED: hot-path performance
  }

  /**
   * Called when the player explicitly picks a quality setting.
   * Records the choice as the auto-quality ceiling so auto-adjust
   * never steps higher than the user's preference.
   * Exposed on window so settings-ui.js (which calls window.applyGraphicsQuality)
   * can delegate through this function.
   */
  function _setUserQualityPreference(quality) {
    try { localStorage.setItem('sandboxGraphicsQualityUser', quality); } catch (_) {}
    _applyGraphicsQuality(quality);
  }
  // Override the global applyGraphicsQuality hook so the settings UI
  // records the user's preference ceiling alongside applying the quality.
  window.applyGraphicsQuality = _setUserQualityPreference;

  // ─── Settings modal + UI Calibration entry (sandbox) ─────────────────────────
  function _initSandboxSettings() {
    const settingsBtn   = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeBtn      = document.getElementById('settings-close-btn');
    const uiCalBtn      = document.getElementById('ui-calibration-btn');
    const campBtn       = document.getElementById('settings-go-to-camp-btn');
    const qualitySelect = document.getElementById('graphics-quality-select');
    const qualityDesc   = document.getElementById('quality-desc');
    const applyQualBtn  = document.getElementById('apply-quality-btn');

    if (!settingsBtn || !settingsModal || !closeBtn) return;

    // Provide desktop-friendly defaults in sandbox; actual firing is driven by _aimJoy/mouse,
    // not controlType. Only set these if they haven't been initialized yet (e.g., from saves).
    if (window.gameSettings) {
      if (typeof window.gameSettings.autoAim === 'undefined') {
        window.gameSettings.autoAim = true;
      }
      if (typeof window.gameSettings.controlType === 'undefined') {
        window.gameSettings.controlType = 'keyboard';
      }
    }

    settingsBtn.style.display = 'block';

    // NOTE: Open/close/Escape handlers are managed by settings-ui.js.
    // Do NOT add duplicate listeners here — they conflict and break the modal.

    // Override updateCampScreen so settings-ui.js's "Go to Camp" handler navigates
    // back to index.html (the camp hub) instead of trying to run the in-page camp
    // flow.  A single handler in settings-ui.js is sufficient; no duplicate listener
    // is added here.
    window.updateCampScreen = function () {
      // Signal to index.html that we are returning from a sandbox run so it boots
      // directly into the 3D Camp instead of showing the main menu.
      try { localStorage.setItem('wds_fromSandbox', '1'); } catch (e) { /* ignore */ }
      window.location.href = 'index.html';
    };

    // NOTE: Graphics quality is managed entirely by settings-ui.js (which reads
    // #quality-select and persists via saveData).  No duplicate wiring is needed
    // here — the IDs it uses (graphics-quality-select, quality-desc, apply-quality-btn)
    // do not exist in sandbox.html.

    if (uiCalBtn) {
      uiCalBtn.addEventListener('click', function () {
        settingsModal.style.display = 'none';
        if (window.UICalibration && typeof window.UICalibration.enter === 'function') {
          if (typeof setGamePaused === 'function') setGamePaused(true);
          window.UICalibration.enter(function () {
            if (typeof setGamePaused === 'function') setGamePaused(false);
          });
        } else {
          console.warn('[SandboxLoop] UI Calibration unavailable — script missing?');
        }
      });
    }

    // Apply saved HUD layout on boot if available
    if (window.UICalibration && typeof window.UICalibration.applyLayout === 'function') {
      window.UICalibration.applyLayout();
    }
  }

  // ─── Ground via Engine2Sandbox ────────────────────────────────────────────────
  function _initGround() {
    if (typeof Engine2Sandbox === 'function') {
      try {
        const e2 = new Engine2Sandbox();
        e2.init(scene);
        window._engine2Instance = e2;
        return;
      } catch (e) {
        console.warn('[SandboxLoop] Engine2Sandbox failed, falling back to basic ground:', e);
      }
    }
    // Fallback flat ground with texture — also used when Engine2Sandbox is missing or throws
    const geo = new THREE.PlaneGeometry(200, 200);
    // Create material first so texture-load callbacks can safely reference it
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.85, metalness: 0.02 });
    try {
      const loader = new THREE.TextureLoader();
      const tex = loader.load(
        'assets/textures/rocky_terrain_03_diff_2k.jpg',
        function(t) { mat.map = t; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); mat.color.setHex(0xffffff); mat.needsUpdate = true; },
        undefined,
        function() {
          loader.load('assets/textures/mossy_brick_diff_4k.jpg',
            function(t) { mat.map = t; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); mat.color.setHex(0xffffff); mat.needsUpdate = true; },
            undefined,
            function() { /* all textures failed, plain colour is fine */ }
          );
        }
      );
      void tex; // texture object kept alive by THREE's cache
    } catch (e) {
      // keep plain-colour material
    }
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ─── Spiral Door Spawn Sequence ───────────────────────────────────────────────
  // Multi-layered rotating circular door that opens on the ground, revealing
  // the player rising from below on an elevator platform with a light from below.
  let _spawnIntroTimer = 0;
  const SPAWN_INTRO_DURATION = 2.8;  // total seconds for the full intro
  let _spawnIntroActive = false;

  // ─── Player init ─────────────────────────────────────────────────────────────
  function _initPlayer() {
    // ── Camp Bridge: calculateTotalPlayerStats() aggregates ALL permanent bonuses
    // from the Camp (skill tree, buildings, gear, neural matrix, attributes).
    // Exposed by stat-aggregator.js, which is loaded before sandbox-loop.js.
    if (typeof window.calculateTotalPlayerStats === 'function') {
      try {
        playerStats = window.calculateTotalPlayerStats();
        // Inject into window so other systems can read it
        window.playerStats = playerStats;
        console.log('[SandboxLoop] calculateTotalPlayerStats() applied — all camp bonuses loaded.');
      } catch (e) {
        console.warn('[SandboxLoop] calculateTotalPlayerStats() error (non-fatal):', e);
        playerStats = null;
      }
    }

    // Fallback: if aggregator unavailable, use base defaults + skill tree only
    if (!playerStats) {
      if (typeof getDefaultPlayerStats === 'function') {
        playerStats = getDefaultPlayerStats(typeof GAME_CONFIG !== 'undefined' ? GAME_CONFIG.baseExpReq : 30);
      } else {
        playerStats = {
          lvl: 1, exp: 0, expReq: 30, hp: 100, maxHp: 100,
          strength: 1, armor: 0, speed: 1, critChance: 0.1, critDmg: 1.5,
          damage: 1, atkSpeed: 1, walkSpeed: 25, kills: 0, hpRegen: 0, gold: 0,
          pickupRange: 1.0, dropRate: 1.0, perks: {}, survivalTime: 0,
        };
      }
      if (typeof window.applySkillTreeBonuses === 'function') {
        try {
          window.applySkillTreeBonuses();
        } catch (e) {
          console.warn('[SandboxLoop] applySkillTreeBonuses() fallback error (non-fatal):', e);
        }
      }
    }

    // Sync revolver ammo to stat — reload after playerStats has been applied
    _revolverAmmo = (playerStats && playerStats.magazineCapacity) || REVOLVER_MAX_AMMO;

    // Always expose playerStats to window so level-up-system.js can find it
    window.playerStats = playerStats;

    // Set up weapons and expose to window so level-up-system.js can find them
    if (typeof getDefaultWeapons === 'function') {
      weapons = getDefaultWeapons();
    }
    window.weapons = weapons;
    // Create player using the existing Player class
    if (typeof Player === 'function') {
      player = new Player();
      player.mesh.position.set(0, SPAWN_SHAFT_DEPTH + 0.5, 0); // Deep underground
    } else {
      const geo = new THREE.SphereGeometry(0.5, 12, 12);
      const mat = new THREE.MeshPhongMaterial({ color: 0x3A9FD8, emissive: 0x0A3D5C, emissiveIntensity: 0.35 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, SPAWN_SHAFT_DEPTH + 0.5, 0); // Deep underground
      mesh.castShadow = true;
      scene.add(mesh);
      player = { mesh, invulnerable: false };
    }
    // Reset velocity state so previous run's momentum doesn't carry over
    _playerVx = 0; _playerVz = 0;
    _smoothInputX = 0; _smoothInputZ = 0;
    // Mark invulnerable during intro, build spiral door and gun
    player.invulnerable = true;
    _buildSpiralDoor();
    _buildGunModel();
    _spawnIntroActive = true;
    _spawnIntroTimer = 0;
  }

  const _spiralDoorParts = []; // { mesh, ring, segment, baseAngle, baseRadius }
  let _elevatorPlatform = null;
  let _spawnLight = null;
  let _undergroundShaft = null;   // Black cylinder for spawn hole depth
  const SPIRAL_RING_COUNT = 3;    // concentric rings
  const SPIRAL_SEG_COUNT  = 8;    // segments per ring
  const SPIRAL_RING_RADII = [1.0, 1.8, 2.6]; // inner to outer — clamped within hole radius 3
  const SPIRAL_COLORS     = [0x555555, 0x444444, 0x333333]; // heavy metal grey tones
  const SPAWN_SHAFT_DEPTH = -8;   // deep underground start

  function _buildSpiralDoor() {
    // ── Underground shaft: black cylinder visible through the spawn hole ──
    const shaftGeo = new THREE.CylinderGeometry(2.8, 2.8, Math.abs(SPAWN_SHAFT_DEPTH) * 2, 24);
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide });
    _undergroundShaft = new THREE.Mesh(shaftGeo, shaftMat);
    _undergroundShaft.position.set(0, SPAWN_SHAFT_DEPTH, 0);
    scene.add(_undergroundShaft);

    // Segment geometry: heavy metal door panels
    const segH = 0.12; // thicker door panels for heavy metal feel
    for (let r = 0; r < SPIRAL_RING_COUNT; r++) {
      const ringR = SPIRAL_RING_RADII[r];
      const arcLen = (2 * Math.PI * ringR) / SPIRAL_SEG_COUNT * 0.88;
      const segGeo = new THREE.BoxGeometry(arcLen, segH, 0.3);
      const segMat = new THREE.MeshStandardMaterial({
        color: SPIRAL_COLORS[r],
        roughness: 0.3,
        metalness: 0.9,
        emissive: 0x111111,
        emissiveIntensity: 0.1,
      });
      for (let s = 0; s < SPIRAL_SEG_COUNT; s++) {
        const mesh = new THREE.Mesh(segGeo, segMat);
        mesh.castShadow = true;
        mesh.visible = false;
        scene.add(mesh);
        _spiralDoorParts.push({
          mesh,
          ring:      r,
          segment:   s,
          baseAngle: (s / SPIRAL_SEG_COUNT) * Math.PI * 2,
          baseRadius: ringR,
        });
      }
    }

    // Elevator platform — heavy disc below the player
    const platGeo = new THREE.CylinderGeometry(2.2, 2.4, 0.2, 24);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x3A3A3A, roughness: 0.3, metalness: 0.85,
      emissive: 0x111122, emissiveIntensity: 0.3,
    });
    _elevatorPlatform = new THREE.Mesh(platGeo, platMat);
    _elevatorPlatform.position.set(0, SPAWN_SHAFT_DEPTH, 0);
    _elevatorPlatform.castShadow = true;
    _elevatorPlatform.visible = false;
    scene.add(_elevatorPlatform);

    // Spawn light (point light from below, warm amber)
    _spawnLight = new THREE.PointLight(0xFFAA44, 0, 15);
    _spawnLight.position.set(0, SPAWN_SHAFT_DEPTH + 1, 0);
    scene.add(_spawnLight);
  }

  /** Place spiral door segments for a given open fraction (0=closed, 1=fully open). */
  function _updateSpiralDoorGeometry(openFrac, spin) {
    const outFrac = Math.max(0, openFrac);
    const HOLE_LIMIT = 2.8; // door segments must NOT open wider than the hole
    for (let i = 0; i < _spiralDoorParts.length; i++) {
      const part = _spiralDoorParts[i];
      const r = part.ring;
      // Each ring spins in alternating direction
      const dir = r % 2 === 0 ? 1 : -1;
      const angle = part.baseAngle + dir * spin * (1 + r * 0.2);
      // Segments start near center (closed iris) and spread to HOLE_LIMIT (not beyond)
      const closedR = 0.1 + r * 0.1;
      const openR = Math.min(part.baseRadius, HOLE_LIMIT);
      const radius = closedR + outFrac * (openR - closedR);
      part.mesh.position.set(
        Math.cos(angle) * radius,
        0.06 + r * 0.01,
        Math.sin(angle) * radius
      );
      // Rotate segment to face tangent
      part.mesh.rotation.set(0, -angle + Math.PI / 2, 0);
      part.mesh.visible = true;
    }
  }

  function _hideSpiralDoor() {
    for (let i = 0; i < _spiralDoorParts.length; i++) {
      _spiralDoorParts[i].mesh.visible = false;
    }
    if (_elevatorPlatform) _elevatorPlatform.visible = false;
    if (_spawnLight) { _spawnLight.intensity = 0; }
    if (_undergroundShaft) _undergroundShaft.visible = false;
  }

  /** Main spawn intro tick — drives door, elevator, light from timer. */
  function _updateSpawnIntro(dt) {
    if (!_spawnIntroActive || !player || !player.mesh) return;
    _spawnIntroTimer += dt;
    const t = Math.min(1, _spawnIntroTimer / SPAWN_INTRO_DURATION);

    // ── Phase 1 (t 0→0.3): Door appears, starts spinning, light ramps up ────
    const doorAppear = Math.min(1, t / 0.3);

    // ── Phase 2 (t 0.2→0.75): Door opens (segments spread outward) ─────────
    const openT = _clamp((t - 0.2) / 0.55, 0, 1);
    const openEased = openT * openT * (3 - 2 * openT); // smoothstep

    // ── Phase 3 (t 0.35→0.85): Player + elevator rises from deep underground ──
    const riseT = _clamp((t - 0.35) / 0.5, 0, 1);
    const riseEased = 1 - Math.pow(1 - riseT, 3);

    // ── Phase 4 (t 0.80→1.0): Door snaps shut, light fades ────────────────
    const closeT = _clamp((t - 0.80) / 0.20, 0, 1);
    const closeEased = closeT * closeT; // accelerating snap-shut

    // Spin speed: fast during open, slows as it closes
    const spin = (openEased * 1.4 - closeEased * 1.2) * 0.5;

    // Door open fraction: opens then snaps shut realistically
    const doorOpen = openEased * (1 - closeEased);

    // Only render door if it's appeared
    if (doorAppear > 0.01) {
      _updateSpiralDoorGeometry(doorOpen, spin);
      // Fade segment opacity in during appearance
      for (let i = 0; i < _spiralDoorParts.length; i++) {
        const mat = _spiralDoorParts[i].mesh.material;
        if (!mat.transparent) mat.transparent = true;
        mat.opacity = _clamp(doorAppear, 0, 1);
      }
    }

    // Underground shaft visible during spawn
    if (_undergroundShaft) _undergroundShaft.visible = true;

    // Elevator platform: rises from deep underground to y=0
    if (_elevatorPlatform) {
      _elevatorPlatform.visible = riseT > 0;
      _elevatorPlatform.position.y = SPAWN_SHAFT_DEPTH + riseEased * Math.abs(SPAWN_SHAFT_DEPTH);
    }

    // Player: rises from deep underground to y=0.5 with elevator
    player.mesh.position.y = SPAWN_SHAFT_DEPTH + 0.5 + riseEased * (Math.abs(SPAWN_SHAFT_DEPTH) + 0.0);

    // Spawn light: ramps up early, fades as door closes
    if (_spawnLight) {
      const lightStrength = _clamp(doorAppear - closeEased, 0, 1);
      _spawnLight.intensity = lightStrength * 6.0;
      _spawnLight.position.y = SPAWN_SHAFT_DEPTH + 2 + riseEased * Math.abs(SPAWN_SHAFT_DEPTH);
    }

    // Completion
    if (t >= 1) {
      player.mesh.position.y = 0.5;
      _spawnIntroActive = false;
      player.invulnerable = false;
      _hideSpiralDoor();
      _tmpV3.set(0, 2, 0);
      createFloatingText('READY!', _tmpV3, '#FFD700');
    }
  }

  // ─── Player movement ──────────────────────────────────────────────────────────
  function _movePlayer(dt) {
    if (!player || !player.mesh) return;
    const rawDir = _getMoveDir();

    // ── Stats with safe fallbacks ──────────────────────────────────────────────
    const ps         = playerStats || {};
    // topSpeed: world-units/sec.  Use new stat if set, otherwise derive from walkSpeed.
    const topSpeed   = ps.topSpeed   || ((ps.walkSpeed || 25) * MOVEMENT_TIME_SCALE * 60);
    // inputResponsiveness: lerp factor per frame (0.04=heavy/sluggish, 1.0=instant snap)
    const inputResp  = _clamp(ps.inputResponsiveness || 0.12, 0.04, 1.0);
    // acceleration / friction: clamp the per-frame lerp factor to [0, 1]
    const accelFrac  = _clamp((ps.acceleration || 22.0) * dt, 0, 1);
    const fricFrac   = _clamp((ps.friction     || 18.0) * dt, 0, 1);

    const hasInput = rawDir.dx !== 0 || rawDir.dz !== 0;

    // 1. Smooth the raw input direction using inputResponsiveness (creates "heavy" feel)
    _smoothInputX = _lerp(_smoothInputX, rawDir.dx, inputResp);
    _smoothInputZ = _lerp(_smoothInputZ, rawDir.dz, inputResp);

    // 2. Velocity physics: accelerate toward target or apply friction
    if (hasInput) {
      _playerVx = _lerp(_playerVx, _smoothInputX * topSpeed, accelFrac);
      _playerVz = _lerp(_playerVz, _smoothInputZ * topSpeed, accelFrac);
    } else {
      _playerVx = _lerp(_playerVx, 0, fricFrac);
      _playerVz = _lerp(_playerVz, 0, fricFrac);
      // Snap to rest when moving very slowly to avoid infinite creep
      if (Math.abs(_playerVx) < 0.02) _playerVx = 0;
      if (Math.abs(_playerVz) < 0.02) _playerVz = 0;
    }

    // 3. Apply velocity to position
    if (_playerVx !== 0 || _playerVz !== 0) {
      var _newPx = _clamp(player.mesh.position.x + _playerVx * dt, -ARENA_RADIUS, ARENA_RADIUS);
      var _newPz = _clamp(player.mesh.position.z + _playerVz * dt, -ARENA_RADIUS, ARENA_RADIUS);

      // World object collision (trees, rocks, fences) + lake detection
      if (window.WorldObjects && typeof WorldObjects.checkCollision === 'function') {
        var _colResult = WorldObjects.checkCollision(_newPx, _newPz, 0.5);
        _newPx = _colResult.x;
        _newPz = _colResult.z;

        // Lore Lake: sink to neck, slow walk
        if (_colResult.inLake) {
          if (!player._inLake) {
            player._inLake = true;
            player._swimBobPhase = 0;
          }
          // Speed reduction
          _playerVx *= WorldObjects.LAKE_SLOW_FACTOR;
          _playerVz *= WorldObjects.LAKE_SLOW_FACTOR;
          // Sink player based on depth
          if (!_spawnIntroActive) {
            player._swimBobPhase = (player._swimBobPhase || 0) + dt * 2.5;
            player.mesh.position.y = WorldObjects.LAKE_SINK_Y + Math.sin(player._swimBobPhase) * 0.04;
          }
        } else {
          player._inLake = false;
        }
      }

      player.mesh.position.x = _clamp(_newPx, -ARENA_RADIUS, ARENA_RADIUS);
      player.mesh.position.z = _clamp(_newPz, -ARENA_RADIUS, ARENA_RADIUS);
    }

    // 4. Visual effects — use actual velocity magnitude, not raw input, for smooth transitions
    const speed         = Math.sqrt(_playerVx * _playerVx + _playerVz * _playerVz);
    const movingVisually = speed > 0.15;
    const leanDirX      = speed > 0.1 ? _playerVx / Math.max(speed, 0.01) : 0;
    const leanDirZ      = speed > 0.1 ? _playerVz / Math.max(speed, 0.01) : 0;

    if (movingVisually) {
      // Lean into movement direction (proportional to velocity, not raw input)
      player.mesh.rotation.z = _lerp(player.mesh.rotation.z, -leanDirX * 0.22, 0.14);
      player.mesh.rotation.x = _lerp(player.mesh.rotation.x, -leanDirZ * 0.18, 0.14);

      // Bounce/wiggle: squish and stretch
      if (!_playerBounceActive) {
        _playerBounceTime = 0;
        _playerBounceActive = true;
      }
      _playerBounceTime += dt * 8.5;
      const bounceY = Math.abs(Math.sin(_playerBounceTime)) * 0.12;
      const squishX = 1 + Math.abs(Math.sin(_playerBounceTime)) * 0.08;
      // Only write position.y when the fluid sloshing system is NOT active — the fluid
      // system in player-class.js manages vertical offset via _fluidOffsetY and positions
      // _innerFluid relative to mesh.position.y.  Overwriting it here causes stutter.
      if (!_spawnIntroActive && !player._innerFluid) player.mesh.position.y = 0.5 + bounceY;
      if (!player.currentScaleXZ) {
        player.mesh.scale.x = squishX;
        player.mesh.scale.z = squishX;
        // Halve the squish on Y to prevent extreme vertical shrink: volume-preserving approx.
        player.mesh.scale.y = 1 / (squishX * 0.5 + 0.5);
      }
    } else {
      _playerBounceActive = false;
      // Smooth return to upright
      player.mesh.rotation.z = _lerp(player.mesh.rotation.z, 0, 0.09);
      player.mesh.rotation.x = _lerp(player.mesh.rotation.x, 0, 0.09);
      // Guard: let the fluid system own mesh.position.y when _innerFluid is active
      if (!_spawnIntroActive && !player._innerFluid) player.mesh.position.y = _lerp(player.mesh.position.y, 0.5, 0.1);
      // Idle gentle wobble
      _playerIdleTime += dt;
      const idleWobble = Math.sin(_playerIdleTime * 2.2) * 0.025;
      if (!player.currentScaleXZ) {
        player.mesh.scale.x = 1 + idleWobble;
        player.mesh.scale.z = 1 + idleWobble;
        // Y-axis uses half the wobble to keep vertical proportions natural during breathing
        player.mesh.scale.y = 1 - idleWobble * 0.5;
      }
    }

    // ── Continuous 360° smooth aim rotation ────────────────────────────────────
    // Update player facing direction every frame so the model follows the right
    // joystick (or mouse) even when not actively firing.
    // Shortest-arc interpolation avoids spinning the long way when crossing the
    // -π/π boundary during continuous 360° rotation.
    const px2 = player.mesh.position.x, pz2 = player.mesh.position.z;
    if (_aimJoy.active && (_aimJoy.dx !== 0 || _aimJoy.dz !== 0)) {
      const aimAngle = Math.atan2(_aimJoy.dx, _aimJoy.dz);
      let _aimDelta = aimAngle - player.mesh.rotation.y;
      _aimDelta = ((_aimDelta + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
      player.mesh.rotation.y += _aimDelta * 0.25;
    } else if (_mouse && (_mouse.worldX !== 0 || _mouse.worldZ !== 0)) {
      const mAngle = Math.atan2(_mouse.worldX - px2, _mouse.worldZ - pz2);
      let _mDelta = mAngle - player.mesh.rotation.y;
      _mDelta = ((_mDelta + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
      player.mesh.rotation.y += _mDelta * 0.25;
    }

    // Camera follow — reuse _camTarget to avoid per-frame Vector3 allocation
    if (camera) {
      _camTarget.set(
        player.mesh.position.x + _shakeOffset.x,
        18,
        player.mesh.position.z + 12 + _shakeOffset.z
      );
      camera.position.lerp(_camTarget, 0.06);
      camera.lookAt(player.mesh.position);
    }
  }

  // ─── HUD refresh ─────────────────────────────────────────────────────────────
  let _hudTimer = 0;
  function _refreshHUD(dt) {
    _hudTimer += dt;
    if (_hudTimer < 0.1) return; // 10 Hz
    _hudTimer = 0;
    if (!playerStats) return;
    try {
      const hpPct = Math.max(0, (playerStats.hp / playerStats.maxHp) * 100);
      const hpFill = document.getElementById('hp-fill');
      const hpText = document.getElementById('hp-text');
      if (hpFill) hpFill.style.width = hpPct + '%';
      if (hpText) hpText.innerText = 'HP: ' + Math.ceil(playerStats.hp) + '/' + playerStats.maxHp;
      _refreshExpBar();
      // Update stamina bar and skill icons panel (defined in game-hud.js)
      if (typeof _updateStaminaBar === 'function') _updateStaminaBar();
      if (typeof _updateSkillIcons === 'function') _updateSkillIcons();
    } catch (e) {}
  }

  // ─── Blood system init ────────────────────────────────────────────────────────
  function _initBloodSystem() {
    if (window.BloodSystem && typeof BloodSystem.init === 'function') {
      BloodSystem.init(scene);
    }
    // New v2 systems — guarded so missing scripts are harmless
    if (window.BloodV2 && typeof window.BloodV2.init === 'function') {
      window.BloodV2.init(scene);
    }
    if (window.GoreSim && typeof window.GoreSim.init === 'function') {
      window.GoreSim.init(scene, camera);
    }
    if (window.SlimePool && typeof window.SlimePool.init === 'function') {
      window.SlimePool.init(scene, 40);
    }
    if (window.WaveSpawner && typeof window.WaveSpawner.init === 'function') {
      window.WaveSpawner.init(scene, 9);
    }
    if (window.HitDetection && typeof window.HitDetection.init === 'function') {
      window.HitDetection.init(scene);
    }
    // Initialize trauma system alongside blood system
    if (window.TraumaSystem && typeof TraumaSystem.init === 'function') {
      TraumaSystem.init(scene);
    }
  }

  // ─── Rage combat system init ──────────────────────────────────────────────────
  function _initRageCombat() {
    if (window.GameRageCombat && typeof GameRageCombat.init === 'function') {
      try {
        GameRageCombat.init(scene, saveData, spawnParticles);
        // Make combat HUD visible in sandbox
        if (typeof GameRageCombat.setCombatHUDVisible === 'function') {
          GameRageCombat.setCombatHUDVisible(true);
        }
        // Register special attack callback to handle damage to slimes
        if (typeof GameRageCombat.onSpecialAttack === 'function') {
          GameRageCombat.onSpecialAttack((sa) => {
            if (!player || !player.mesh) return;
            const pPos = player.mesh.position;
            const radSq = sa.damageRadius * sa.damageRadius;
            // Check each active slime and deal damage if in range
            for (let i = 0; i < _activeSlimes.length; i++) {
              const s = _activeSlimes[i];
              if (!s || !s.active || s.dead) continue;
              const dx = s.mesh.position.x - pPos.x;
              const dz = s.mesh.position.z - pPos.z;
              if (dx*dx + dz*dz <= radSq) {
                s.hp -= sa.damage;
                if (s.hp <= 0) {
                  _killSlime(s, 1.0, 0, 0);
                } else {
                  // Visual feedback for hit
                  s.flashTimer = 0.15;
                  s.squishTime = 0.3;
                  _updateSlimeHPBar(s);
                }
              }
            }
          });
        }
        console.log('[SandboxLoop] Rage combat system initialized');
      } catch (e) {
        console.warn('[SandboxLoop] Failed to initialize rage combat:', e);
      }
    }
  }

  // ─── Object pool init ─────────────────────────────────────────────────────────
  function _initPools() {
    // Initialize the GameObjectPool (trail pool) with the active scene
    if (window.GameObjectPool && typeof GameObjectPool.init === 'function') {
      GameObjectPool.init(scene);
    }
    // Initialize entity pools from main.js if available
    if (typeof _ensureEntityPools === 'function') {
      _ensureEntityPools();
    }
    // Build our local projectile pool
    _buildProjectilePool();
    // Build pre-allocated flesh chunk pool (avoids new THREE.Mesh during gameplay)
    _buildFleshPool();
    // Build pre-allocated blood stain decal pool (ground stains at kill positions)
    _buildBloodStainPool();
    _buildCorpseBloodPool();
    // Build pre-allocated bullet hole decal pool (ground impacts at miss positions)
    _buildBulletHolePool();

    // ═══ NEW XP STAR SYSTEM V2 ═══
    // Initialize the brand new XP star system (no old map conflicts)
    if (typeof XPStarSystem !== 'undefined') {
      XPStarSystem.init(scene);
      console.log('[SandboxLoop] XP Star System V2 initialized');
    } else {
      console.error('[SandboxLoop] XPStarSystem not loaded!');
    }

    // Initialize gold coin pool
    _initGoldPool();

    // Build pooled PointLight flash pool (muzzle flashes, hit lights)
    _buildFlashPool();
    // Initialize spatial hash for O(1) projectile→enemy collision
    _initSpatialHash();
  }

  // ─── Sandbox status overlay (disabled — clean screen) ────────────────────────
  function _buildSandboxOverlay() {
    // Debug/status overlay removed per requirements — screen must be clean
  }

  // ─── Skinwalker support ──────────────────────────────────────────────────────

  /** Spawn one skinwalker far from the player. */
  function _spawnSkinwalker(spawnX, spawnZ) {
    if (!window.SkinwalkerEnemy || !player || !player.mesh) return;
    let rx, rz;
    if (spawnX !== undefined && spawnZ !== undefined) {
      rx = spawnX;
      rz = spawnZ;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 20 + Math.random() * 10;
      const px    = player.mesh.position.x;
      const pz    = player.mesh.position.z;
      rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
      rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    }
    // PERF FIX: Use pre-allocated _tmpV3 instead of allocating new Vector3 each spawn
    _tmpV3.set(rx, 0, rz);
    const sw    = SkinwalkerEnemy.acquire(scene, _tmpV3);
    if (!sw) return;
    sw.onAttack = function(dmg) {
      if (!player) return;
      const now = Date.now();
      if (!sw._lastDmgTime || now - sw._lastDmgTime > 600) {
        sw._lastDmgTime = now;
        if (typeof player.takeDamage === 'function') {
          player.takeDamage(dmg, 'skinwalker', sw.parts.root.position);
        } else {
          playerStats.hp -= dmg;
          if (playerStats.hp <= 0) { playerStats.hp = 0; gameOver(); }
        }
        // Screen shake on player damage (0.25s minimum duration)
        const _swDmgRatio = _clamp(dmg / (playerStats.maxHp || 100), 0.003, 0.015);
        _triggerShake(_swDmgRatio, 0.25);
      }
    };
    sw.onDeath = function() {
      _killSkinwalker(sw);
    };
    _activeSkinwalkers.push(sw);
    // console.log('[SeqWave] Skinwalker spawned at', rx.toFixed(1), rz.toFixed(1)); // REMOVED: hot-path performance
  }

  /** Update all active skinwalkers each frame. */
  function _updateSkinwalkers(dt) {
    if (!player || !player.mesh) return;
    const playerPos = player.mesh.position;
    const now = Date.now();
    for (let i = _activeSkinwalkers.length - 1; i >= 0; i--) {
      const sw = _activeSkinwalkers[i];
      if (sw.dead) {
        // Track when death first became true
        if (!sw._deathStartTime) sw._deathStartTime = now;
        // Force-remove if death animation has stalled for more than 5 seconds
        if (now - sw._deathStartTime > DEATH_ANIMATION_TIMEOUT_MS) {
          _killSkinwalker(sw);
          continue;
        }
        // While in death state but before timeout, keep updating so the
        // death animation can complete and trigger sw.onDeath → _killSkinwalker.
        sw.update(dt, playerPos);
        continue;
      }
      sw.update(dt, playerPos);
    }
  }

  /** Apply projectile damage to a skinwalker. */
  function _hitSkinwalker(projectile, sw) {
    if (!sw || sw.dead) return;
    const hitForce = 1.0 + (weapons && weapons.gun ? (weapons.gun.level - 1) * 0.15 : 0);
    // Use weapon-specific damage if the projectile carries it, otherwise fall back to gun stats
    const damage = (projectile && projectile.weaponDmg > 0)
      ? projectile.weaponDmg
      : (weapons && weapons.gun ? weapons.gun.damage : 15);
    const critChance = (playerStats && playerStats.critChance != null) ? playerStats.critChance : 0.10;
    const isCrit   = Math.random() < critChance;
    const critMult = isCrit ? (playerStats && playerStats.critDmg ? playerStats.critDmg : 1.5) : 1.0;
    const swStrMult = (playerStats && playerStats.strength > 0) ? playerStats.strength : 1;
    const actualDmg = Math.round(damage * hitForce * critMult * swStrMult);

    sw.takeDamage(actualDmg);
    // Fireball explosion on impact
    _triggerProjectileExplosion(projectile, sw.parts.root.position.x, sw.parts.root.position.z);
    // If this hit killed the skinwalker, ensure kill processing runs immediately.
    // _updateSkinwalkers removes dead skinwalkers before calling sw.update(), which
    // means onDeath (and _killSkinwalker) might never fire from the animation loop.
    if (sw.dead) _killSkinwalker(sw);

    // Floating damage text
    const hx = sw.parts.root.position.x;
    const hy = sw.parts.root.position.y + 1.8;
    const hz = sw.parts.root.position.z;
    _tmpV3b.set(hx, hy, hz);
    if (isCrit) {
      createFloatingText(actualDmg, _tmpV3b, '#FFD700', actualDmg);
      _showDamageNumber(hx, hy, hz, actualDmg, sw.dead, true);
    } else {
      createFloatingText(actualDmg, _tmpV3b, '#c8c7c0', actualDmg);
      _showDamageNumber(hx, hy, hz, actualDmg, sw.dead, false);
    }

    // Blood on hit
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(hx, hy, hz, 5, { color: 0xc8c7c0 });
    }

    // Bullet hole decal on skinwalker
    if (projectile && sw.parts && sw.parts.root) {
      const len = Math.sqrt((projectile.vx || 0) * (projectile.vx || 0) + (projectile.vz || 0) * (projectile.vz || 0)) || 1;
      const nhx2 = (projectile.vx || 0) / len;
      const nhz2 = (projectile.vz || 0) / len;
      _addEnemyBulletHole(sw, sw.parts.root, nhx2, nhz2, 0.4, 0.5 + Math.random() * 0.6);
    }

    _triggerShake(SHAKE_LIGHT_INTENSITY * 0.8);
  }

  /** Kill a skinwalker — rewards, gore, and pool return. */
  function _killSkinwalker(sw) {
    if (!sw || sw._killProcessed) return;
    sw._killProcessed = true;
    const x = sw.parts.root.position.x;
    const y = sw.parts.root.position.y + 1.2;
    const z = sw.parts.root.position.z;

    _triggerHitStop(HIT_STOP_KILL_DURATION_MS * 0.9);
    _triggerShake(SHAKE_KILL_BASE * 0.9);

    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(x, y, z, 20, { color: 0xc8c7c0 });
    }
    if (window.GoreSim && typeof GoreSim.onKill === 'function') {
      GoreSim.onKill(sw, 'pistol', null);
    }
    _placeBloodStain(x, z);

    if (window.XPStarSystem) {
      const killDamage = 120 * 1.5;
      XPStarSystem.spawn(x, y, z, 'skinwalker', killDamage, 0, 0);
      if (Math.random() < 0.35) XPStarSystem.spawn(x, y, z, 'skinwalker', killDamage * 0.7, 0, 0);
    }

    // ══════════ GOLD COIN DROP ══════════ (Skinwalkers always drop gold)
    {
      const goldValue = 2 + Math.floor(Math.random() * 4);
      _spawnGoldCoin(x, z, goldValue);
      if (Math.random() < 0.5) _spawnGoldCoin(x, z, 1); // 50% for bonus coin
    }

    playerStats.kills++;
    _incrementKillCombo();
    _updateKillCountHUD();
    // Boss hit-stop
    if (sw.isBoss) {
      if (_hitStopRemaining < 120) _hitStopRemaining = 120;
      if (saveData.tutorialQuests) saveData.tutorialQuests.firstBossDefeated = true;
    }
    // Run quest kill tracking (CHANGE 1)
    _sandboxRunKills++;
    if (saveData.tutorialQuests) saveData.tutorialQuests.killsThisRun = _sandboxRunKills;
    _checkSandboxRunQuestProgress();
    if (window.GameRageCombat && typeof GameRageCombat.addRage === 'function') {
      GameRageCombat.addRage(15);
    }
    // Achievement + stat tracking
    if (saveData) {
      if (saveData.stats) saveData.stats.totalKills = (saveData.stats.totalKills || 0) + 1;
      saveData.totalKills = (saveData.totalKills || 0) + 1;
    }
    if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(2, 'Kill', saveData);
    // Codex discovery
    if (window.CodexSystem && typeof window.CodexSystem.discover === 'function') {
      var _codexData = saveData && saveData.codexData;
      if (!_codexData || !_codexData.discovered || !_codexData.discovered['enemy_hardfast']) {
        window.CodexSystem.discover('enemy_hardfast');
        if (window.GameAccount && typeof window.GameAccount.addXP === 'function') window.GameAccount.addXP(5, 'Codex Discovery', saveData);
      }
    }
    _checkSandboxAchievements();
    const idx = _activeSkinwalkers.indexOf(sw);
    if (idx !== -1) _activeSkinwalkers.splice(idx, 1);

    // Notify sequential wave manager
    SeqWaveManager.onEnemyKilled('skinwalker');

    setTimeout(function() {
      // Guard against double-release: if reset() already removed sw from
      // _activeSkinwalkers and called release(), don't release again.
      if (_activeSkinwalkers.indexOf(sw) !== -1) return;
      if (window.SkinwalkerEnemy) SkinwalkerEnemy.release(sw);
    }, 8000);
  }

  // ─── Run Quest Progress Checker (CHANGE 2) ───────────────────────────────────
  // Called after every kill and when the death/end-run screen appears.
  // Mirrors the logic in js/game-over-reset.js so quests complete in sandbox.
  // Pass endOfRun=true when called from gameOver() to also check end-of-run quests.
  function _checkSandboxRunQuestProgress(endOfRun) {
    if (!saveData || !saveData.tutorialQuests) return;
    if (typeof window.progressTutorialQuest !== 'function') return;
    const tq = saveData.tutorialQuests;
    const cq = tq.currentQuest;
    if (!cq) return;
    const elapsedSec = _sandboxRunStartTime ? (Date.now() - _sandboxRunStartTime) / 1000 : 0;
    // Kill-count quests (safe to check mid-run)
    if (cq === 'quest1_kill3'          && _sandboxRunKills >= 3)   window.progressTutorialQuest('quest1_kill3', true);
    if (cq === 'quest4_kill10'         && _sandboxRunKills >= 10)  window.progressTutorialQuest('quest4_kill10', true);
    if (cq === 'quest8_kill10'         && _sandboxRunKills >= 10)  window.progressTutorialQuest('quest8_kill10', true);
    if (cq === 'quest10_kill15'        && _sandboxRunKills >= 15)  window.progressTutorialQuest('quest10_kill15', true);
    if (cq === 'quest14_kill25'        && _sandboxRunKills >= 25)  window.progressTutorialQuest('quest14_kill25', true);
    if (cq === 'quest15b_runKill12'    && _sandboxRunKills >= 12)  window.progressTutorialQuest('quest15b_runKill12', true);
    if (cq === 'quest26_kill20'        && _sandboxRunKills >= 20)  window.progressTutorialQuest('quest26_kill20', true);
    if (cq === 'quest_annunaki1'       && _sandboxRunKills >= 100) window.progressTutorialQuest('quest_annunaki1', true);
    if (cq === 'quest19c_growAdult'    && _sandboxRunKills >= 8)   window.progressTutorialQuest('quest19c_growAdult', true);
    // Survival-time quests (safe to check mid-run via per-second tick)
    if (cq === 'quest6_survive2min'    && elapsedSec >= 120)       window.progressTutorialQuest('quest6_survive2min', true);
    if (cq === 'quest28_survive3min'   && elapsedSec >= 180)       window.progressTutorialQuest('quest28_survive3min', true);
    if (cq === 'quest_dailyRoutine'    && elapsedSec >= 120)       window.progressTutorialQuest('quest_dailyRoutine', true);
    if (cq === 'quest19b_growJuvenile' && elapsedSec >= 60)        window.progressTutorialQuest('quest19b_growJuvenile', true);
    // Level-based quests (safe to check mid-run)
    if (cq === 'quest_harvester'       && playerStats && playerStats.lvl >= 3)  window.progressTutorialQuest('quest_harvester', true);
    if (cq === 'quest_annunaki3'       && playerStats && playerStats.lvl >= 50) window.progressTutorialQuest('quest_annunaki3', true);
    if (cq === 'quest3_reachLevel5'    && playerStats && playerStats.lvl >= 5)  window.progressTutorialQuest('quest3_reachLevel5', true);
    // Boss defeat / special state quests (safe mid-run once flag is set)
    if (cq === 'quest_pushingLimits'   && tq.firstBossDefeated)    window.progressTutorialQuest('quest_pushingLimits', true);
    if (cq === 'quest_eggHunt'         && tq.mysteriousEggFound)   window.progressTutorialQuest('quest_eggHunt', true);
    // Resource quests (safe mid-run; resources tracked across runs)
    if (cq === 'quest_firstBlood') {
      const r = saveData.resources || {};
      if ((r.wood || 0) >= 30 && (r.stone || 0) >= 30) window.progressTutorialQuest('quest_firstBlood', true);
    }
    if (cq === 'quest_gainingStats' && (saveData.totalKills || 0) >= 300) window.progressTutorialQuest('quest_gainingStats', true);
    // End-of-run only: firstRunDeath requires the player to actually die/end the run
    if (endOfRun) {
      if (cq === 'firstRunDeath') window.progressTutorialQuest('firstRunDeath', true);
    }
  }

  function _checkSandboxAchievements() {
    if (window.checkAchievements && typeof window.checkAchievements === 'function') {
      window.checkAchievements();
    }
  }

  // ─── Sequential Kill-Based Wave Manager ──────────────────────────────────────
  // Roguelike Survivor RPG wave system: phases trigger based on kill counts,
  // not timers. Enemies always spawn 20+ units away from the player.
  //
  // Phase sequence:
  //  0 → spawn 3 red slimes
  //  1 → on 2 kills: spawn 2 blue (leaping) + 2 green
  //  2 → on 3 more kills: spawn 3 blue + 2 green + 1 worm (crawler)
  //  3 → when 2 alive remain: spawn 3 green + 3 blue + 1 worm
  //  4 → when 1 alive remains: spawn 1 of each + 1 skinwalker
  //  5 → on 1 kill from phase 4: spawn 2 of each + 1 skinwalker
  //  (looping after phase 5, doubling count if new weapon unlocked)
  const SeqWaveManager = {
    _phase:        -1,   // current phase (-1 = not started)
    _phaseKills:   0,    // kills accumulated since this phase began
    _totalKills:   0,    // all-time kill counter
    _waveNumber:   0,    // actual wave number (for wave 30 boss trigger)
    _x2Active:     false, // first-new-weapon x2 multiplier
    _greyBossTriggered: false, // SECTION 3A: tracks if Grey boss notification shown
    _prevWeaponCount: 1,  // number of weapons player had last check
    _initialized:  false,
    _pendingTimeouts: [], // all pending setTimeout IDs so reset() can cancel them

    _setTimeout: function(fn, delay) {
      const id = setTimeout(fn, delay);
      this._pendingTimeouts.push(id);
      return id;
    },

    _clearAllTimeouts: function() {
      for (let i = 0; i < this._pendingTimeouts.length; i++) {
        clearTimeout(this._pendingTimeouts[i]);
      }
      this._pendingTimeouts = [];
    },

    /** Initialize and spawn the first wave. Call from _boot. */
    start: function() {
      this._phase           = 0;
      this._phaseKills      = 0;
      this._totalKills      = 0;
      this._waveNumber      = 1;
      this._x2Active        = false;
      this._prevWeaponCount = 1;
      this._greyBossTriggered = false;
      this._initialized     = true;
      // Brief delay before first enemy appears
      SeqWaveManager._setTimeout(function() { SeqWaveManager._spawnPhase(0); }, 1500);
    },

    /** Returns total count of alive enemies across all pools. */
    _totalAlive: function() {
      const slimes   = _activeSlimes.length;
      const crawlers = _activeCrawlers.length;
      const leapers  = _activeLeapingSlimes.length;
      const skins    = _activeSkinwalkers.length;
      return slimes + crawlers + leapers + skins;
    },

    /** Called from every kill function (_killSlime, _killCrawler, _killLeapingSlime, _killSkinwalker). */
    onEnemyKilled: function(type) {
      if (!this._initialized) return;
      this._phaseKills++;
      this._totalKills++;

      const alive = this._totalAlive();

      // Show kill notification
      _showWaveNotification('Enemy down! ' + alive + ' remain', '#aaffaa', 1200);

      // Phase transitions
      if (this._phase === 0 && this._phaseKills >= 2) {
        this._advancePhase(1);
      } else if (this._phase === 1 && this._phaseKills >= 3) {
        this._advancePhase(2);
      } else if (this._phase === 2 && alive <= 2) {
        this._advancePhase(3);
      } else if (this._phase === 3 && alive <= 1) {
        this._advancePhase(4);
      } else if (this._phase === 4 && this._phaseKills >= 1) {
        this._advancePhase(5);
      } else if (this._phase === 5 && alive <= 0) {
        // Loop: go back to phase 5 with increasing difficulty
        this._advancePhase(5);
      }
    },

    _advancePhase: function(nextPhase) {
      this._phase      = nextPhase;
      this._phaseKills = 0;
      this._waveNumber++; // Increment wave counter

      // SECTION 2E: Boss encounters at milestone waves
      // Wave 10: Grey Alien Boss
      if (this._waveNumber === 10) {
        // ── Blood Moon check ──────────────────────────────────────────────────
        if (localStorage.getItem('bloodMoonQueued') === 'true') {
          SeqWaveManager._setTimeout(function() { _triggerBloodMoon(); }, 1200);
        }
        _showWaveNotification('👽 WAVE 10 — GREY ALIEN SCOUT DETECTED! 👽', '#00ffaa', 4000);
        if (typeof GreyBossSystem !== 'undefined' && GreyBossSystem.spawn) {
          SeqWaveManager._setTimeout(function() {
            if (typeof GreyBossSystem.spawn === 'function') {
              GreyBossSystem.spawn();
            }
          }, 1000);
        }
        // Continue spawning regular enemies alongside boss
      }

      // Wave 20: Aida Boss (mid-game challenge)
      if (this._waveNumber === 20) {
        _showWaveNotification('🤖 WAVE 20 — A.I.D.A. PROTOCOL INITIATED! 🤖', '#ff00ff', 4000);
        if (typeof AidaBoss !== 'undefined' && AidaBoss.spawn) {
          SeqWaveManager._setTimeout(function() {
            AidaBoss.spawn();
          }, 1000);
        }
        // Continue spawning regular enemies alongside boss
      }

      // Wave 30: Annunaki Final Boss
      if (this._waveNumber === 30) {
        _showWaveNotification('⚡ WAVE 30 — THE ANNUNAKI AWAKENS! ⚡', '#ffd700', 4000);
        if (typeof AnnunakiBoss !== 'undefined' && AnnunakiBoss.spawn) {
          SeqWaveManager._setTimeout(function() {
            AnnunakiBoss.spawn();
          }, 1000);
        }
        // Complete quest
        if (typeof QuestSystem !== 'undefined' && QuestSystem.completeObjective) {
          QuestSystem.completeObjective('quest_makeItToFinalBoss');
        }
        return; // Don't spawn regular enemies
      }

      // PERFORMANCE FIX 1E: Clean up wave debris before spawning next wave
      _cleanupWaveDebris();
      // Small delay so player sees the kill before next enemies appear
      const self = this;
      SeqWaveManager._setTimeout(function() { self._spawnPhase(nextPhase); }, 800);
    },

    _mult: function(n) {
      return this._x2Active ? n * 2 : n;
    },

    _spawnPhase: function(phase) {
      // Wave flash: dramatic full-screen white flash on each new wave
      _triggerWaveFlash();

      // SECTION 3A: Custom wave definitions for waves 21-29
      // Waves 21-29 have custom escalating difficulty before the final boss
      if (this._waveNumber >= 21 && this._waveNumber <= 29) {
        this._spawnCustomWave(this._waveNumber);
        return;
      }

      switch (phase) {
        case 0:
          _showWaveNotification('WAVE START — 3 Slimes incoming!', '#ffdd44', 2500);
          this._spawnBatch([
            { type: 'slime',   count: 3 }
          ]);
          break;
        case 1:
          _showWaveNotification('WAVE 2 — Blue & Green rise!', '#44aaff', 2500);
          this._spawnBatch([
            { type: 'leaping', count: this._mult(2) },
            { type: 'slime',   count: this._mult(2) }
          ]);
          break;
        case 2:
          _showWaveNotification('WAVE 3 — The Worm awakens!', '#44ff88', 2500);
          this._spawnBatch([
            { type: 'leaping', count: this._mult(3) },
            { type: 'slime',   count: this._mult(2) },
            { type: 'crawler', count: this._mult(1) }
          ]);
          break;
        case 3:
          _showWaveNotification('WAVE 4 — More worms!', '#ff8844', 2500);
          this._spawnBatch([
            { type: 'slime',   count: this._mult(3) },
            { type: 'leaping', count: this._mult(3) },
            { type: 'crawler', count: this._mult(1) }
          ]);
          break;
        case 4:
          _showWaveNotification('☠ WAVE 5 — SKINWALKER APPEARS!', '#ff4444', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(1) },
            { type: 'leaping',    count: this._mult(1) },
            { type: 'crawler',    count: this._mult(1) },
            { type: 'skinwalker', count: this._mult(1) }
          ]);
          break;
        case 5:
        default:
          _showWaveNotification('💀 HORDE — 2 of everything!', '#ff0055', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(2) },
            { type: 'leaping',    count: this._mult(2) },
            { type: 'crawler',    count: this._mult(2) },
            { type: 'skinwalker', count: this._mult(2) }
          ]);
          break;
      }
    },

    /**
     * _spawnCustomWave(waveNum) - Custom wave definitions for waves 21-29
     * SECTION 3A: Escalating endgame content before Annunaki boss
     */
    _spawnCustomWave: function(waveNum) {
      switch (waveNum) {
        case 21:
          _showWaveNotification('⚡ WAVE 21 — Escalation Begins!', '#ff8800', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(3) },
            { type: 'leaping',    count: this._mult(3) },
            { type: 'crawler',    count: this._mult(2) },
            { type: 'skinwalker', count: this._mult(2) }
          ]);
          break;

        case 22:
          _showWaveNotification('⚡ WAVE 22 — The Swarm Intensifies!', '#ff7700', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(3) },
            { type: 'leaping',    count: this._mult(3) },
            { type: 'crawler',    count: this._mult(3) },
            { type: 'skinwalker', count: this._mult(2) }
          ]);
          break;

        case 23:
          _showWaveNotification('⚡ WAVE 23 — No Mercy!', '#ff6600', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(4) },
            { type: 'leaping',    count: this._mult(3) },
            { type: 'crawler',    count: this._mult(3) },
            { type: 'skinwalker', count: this._mult(3) }
          ]);
          break;

        case 24:
          _showWaveNotification('⚡ WAVE 24 — Maximum Pressure!', '#ff5500', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(4) },
            { type: 'leaping',    count: this._mult(4) },
            { type: 'crawler',    count: this._mult(3) },
            { type: 'skinwalker', count: this._mult(3) }
          ]);
          break;

        case 25:
          // WAVE 25: Mini-boss Grey encounter with elite variants
          _showWaveNotification('👽 WAVE 25 — THE GREY APPEARS! 👽', '#88ff88', 4000);

          // Trigger Grey boss if available
          if (typeof GreyBossSystem !== 'undefined' && !this._greyBossTriggered) {
            this._greyBossTriggered = true;
            // Grey boss is proximity-triggered, so just spawn support enemies
          }

          // Elite enemy support squad
          this._spawnBatch([
            { type: 'slime',      count: this._mult(3) },
            { type: 'leaping',    count: this._mult(3) },
            { type: 'crawler',    count: this._mult(2) },
            { type: 'skinwalker', count: this._mult(4) } // Extra skinwalkers as elite variants
          ]);
          break;

        case 26:
          _showWaveNotification('🔥 WAVE 26 — Post-Grey Assault!', '#ff4400', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(4) },
            { type: 'leaping',    count: this._mult(4) },
            { type: 'crawler',    count: this._mult(4) },
            { type: 'skinwalker', count: this._mult(3) }
          ]);
          break;

        case 27:
          _showWaveNotification('🔥 WAVE 27 — Overwhelming Force!', '#ff3300', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(5) },
            { type: 'leaping',    count: this._mult(4) },
            { type: 'crawler',    count: this._mult(4) },
            { type: 'skinwalker', count: this._mult(4) }
          ]);
          break;

        case 28:
          _showWaveNotification('🔥 WAVE 28 — Final Warning!', '#ff2200', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(5) },
            { type: 'leaping',    count: this._mult(5) },
            { type: 'crawler',    count: this._mult(4) },
            { type: 'skinwalker', count: this._mult(4) }
          ]);
          break;

        case 29:
          // WAVE 29: Herald of Annunaki - massive elite encounter
          _showWaveNotification('💀 WAVE 29 — HERALD OF ANNUNAKI! 💀', '#ffd700', 4000);

          // Spawn a horde of elite enemies as the "Herald"
          this._spawnBatch([
            { type: 'slime',      count: this._mult(6) },
            { type: 'leaping',    count: this._mult(5) },
            { type: 'crawler',    count: this._mult(5) },
            { type: 'skinwalker', count: this._mult(5) } // 5 skinwalkers = Herald army
          ]);
          break;

        default:
          // Fallback to standard phase 5 horde
          _showWaveNotification('💀 HORDE — 2 of everything!', '#ff0055', 3000);
          this._spawnBatch([
            { type: 'slime',      count: this._mult(2) },
            { type: 'leaping',    count: this._mult(2) },
            { type: 'crawler',    count: this._mult(2) },
            { type: 'skinwalker', count: this._mult(2) }
          ]);
          break;
      }
    },

    /** Spawn a batch of enemies spread at 20–30 units from player. */
    _spawnBatch: function(groups) {
      if (!player || !player.mesh) return;
      const px = player.mesh.position.x;
      const pz = player.mesh.position.z;
      let delay = 0;
      for (let g = 0; g < groups.length; g++) {
        const grp = groups[g];
        for (let i = 0; i < grp.count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist  = 20 + Math.random() * 10; // Always 20–30 units away
          const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
          const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
          (function(type, x, z, spawnDelay) {
            SeqWaveManager._setTimeout(function() {
              if (!player || !player.mesh) return;
              switch (type) {
                case 'slime':
                  // Activate a pooled slime
                  for (let k = 0; k < _enemyPool.length; k++) {
                    if (!_enemyPool[k].active) {
                      _activateSlime(_enemyPool[k], x, z);
                      break;
                    }
                  }
                  break;
                case 'leaping':
                  if (window.LeapingSlimePool) {
                    const e = LeapingSlimePool.spawn(x, z, 1);
                    if (e && _activeLeapingSlimes.indexOf(e) === -1) _activeLeapingSlimes.push(e);
                  }
                  break;
                case 'crawler':
                  if (window.CrawlerPool) {
                    const c = CrawlerPool.spawn(x, z, 1);
                    if (c) _activeCrawlers.push(c);
                  }
                  break;
                case 'skinwalker':
                  _spawnSkinwalker(x, z);
                  break;
              }
            }, spawnDelay);
          })(grp.type, rx, rz, delay);
          delay += 300; // Stagger spawns by 300ms each
        }
      }
    },

    /** Check if player has unlocked a new weapon and activate x2 if so. */
    _checkWeaponUnlock: function() {
      if (this._x2Active || !window.weapons) return;
      let count = 0;
      const wk = Object.keys(weapons);
      for (let i = 0; i < wk.length; i++) {
        if (weapons[wk[i]] && weapons[wk[i]].active) count++;
      }
      if (count > this._prevWeaponCount) {
        this._prevWeaponCount = count;
        if (!this._x2Active) {
          this._x2Active = true;
          _showWaveNotification('🔫 NEW WEAPON! Enemy counts DOUBLED!', '#ffaa00', 3500);
          // console.log('[SeqWave] x2 multiplier activated (new weapon unlocked)'); // REMOVED: hot-path performance
        }
      }
    },

    /** Per-frame tick — checks weapon unlocks. */
    update: function(dt) {
      this._checkWeaponUnlock();
      _updateSkinwalkers(dt);
    },

    reset: function() {
      // Cancel all pending wave timeouts first so stale callbacks can't fire
      this._clearAllTimeouts();
      this._phase        = -1;
      this._phaseKills   = 0;
      this._totalKills   = 0;
      this._x2Active     = false;
      this._initialized  = false;
      for (let i = _activeSkinwalkers.length - 1; i >= 0; i--) {
        try { SkinwalkerEnemy.release(_activeSkinwalkers[i]); } catch(e) {}
      }
      _activeSkinwalkers.length = 0;
    }
  };

  // Alias old WaveManager so existing code still compiles
  const WaveManager = SeqWaveManager;

  // ─── LootManager — encapsulates EXP gem update and collection logic ──────────
  // Delegates to _updateGems for the pooled gem simulation.
  const LootManager = {
    /** Tick all active EXP gems and check for player pickup.  Call once per frame. */
    update: function(dt) {
      _updateGems(dt);
      _updateGoldCoins(dt);
    }
  };

  // ── PERFORMANCE FIX 1E: Wave Cleanup Function ────────────────────────────────
  // Clears all projectile DOM elements, floating damage numbers, health bars, and
  // particle elements between waves to prevent memory buildup.
  function _cleanupWaveDebris() {
    // Clear floating damage numbers (from createFloatingText pool)
    const damageNums = document.querySelectorAll('div[style*="position:fixed"][style*="pointer-events:none"][style*="font-family:Impact"]');
    for (var _di = 0; _di < damageNums.length; _di++) {
      if (damageNums[_di].style.display !== 'none') damageNums[_di].style.display = 'none';
    }

    // Clear any projectile DOM elements (if any weapons create DOM projectiles)
    const projectileDivs = document.querySelectorAll('.projectile, .bullet-trail, .projectile-glow');
    for (var _pi = 0; _pi < projectileDivs.length; _pi++) projectileDivs[_pi].remove();

    // Clear any particle effect elements
    const particleDivs = document.querySelectorAll('.particle, .explosion-particle, .blood-particle');
    for (var _parI = 0; _parI < particleDivs.length; _parI++) particleDivs[_parI].remove();

    // Clear all active projectiles without breaking the pooling system
    if (Array.isArray(_activeProjList) && _activeProjList.length > 0) {
      for (let i = 0; i < _activeProjList.length; i++) {
        const proj = _activeProjList[i];
        if (!proj) {
          continue;
        }
        // Prefer using the central projectile release helper if available
        if (typeof _releaseProjectile === 'function') {
          _releaseProjectile(proj);
        } else {
          // Fallback: just mark projectile inactive; leave mesh attached for pooling
          proj.active = false;
        }
      }
      // Reset active list; do not mutate _projPool or detach meshes here
      _activeProjList.length = 0;
    }

    // Clear trauma system debris if available
    if (window.TraumaSystem && typeof TraumaSystem.clearAll === 'function') {
      TraumaSystem.clearAll();
    }
  }

  // ─── Main animation loop ──────────────────────────────────────────────────────
  function _animate(nowMs) {
    // PERFORMANCE FIX 1A: Cancel any previous rAF before scheduling the next one
    // This prevents multiple overlapping rAF loops if _boot() is called more than once
    if (_rafId !== null) cancelAnimationFrame(_rafId);
    _rafId = requestAnimationFrame(_animate);

    try {
      const rawDt = Math.min((nowMs - _lastTime) / 1000, 0.05); // cap at 50 ms
      _lastTime = nowMs;

      // ── Hit-stop: freeze simulation for a brief "impact" moment ─────────────
      if (_hitStopRemaining > 0) {
        _hitStopRemaining -= rawDt * 1000;
        if (_hitStopRemaining < 0) _hitStopRemaining = 0;
        if (window._bloomComposer && window._composerActive) {
          window._bloomComposer.render();
        } else {
          renderer.render(scene, camera); // keep drawing; only physics is frozen
        }
        return;
      }

      const dt = rawDt;

      // Track FPS for auto-quality adjustment
      _trackFPS(dt);

      if (window.isPaused) {
        if (window._bloomComposer && window._composerActive) {
          window._bloomComposer.render();
        } else {
          renderer.render(scene, camera);
        }
        return;
      }

      // Update dopamine time dilation
      if (window.DopamineSystem && window.DopamineSystem.TimeDilation) {
        window.DopamineSystem.TimeDilation.update(dt);
      }

      _movePlayer(dt);
      if (_spawnIntroActive) _updateSpawnIntro(dt);
      _updateGunRecoil(dt);

      // Rebuild spatial hash once per frame so _updateProjectiles uses fresh data
      _rebuildSpatialHash();

      _updateSlime(dt);
      _updateCrawlers(dt);
      _updateLeapingSlimes(dt);
      _tryFire(dt);
      _updateProjectiles(dt);
      _updateWeaponEffects(dt); // sword/samurai/aura active weapon effects

      // Manager updates (wave spawning + loot pickup)
      WaveManager.update(dt);
      LootManager.update(dt);

      // Boss updates
      if (typeof AnnunakiBoss !== 'undefined' && AnnunakiBoss.update) {
        AnnunakiBoss.update(dt);
      }
      if (typeof AidaBoss !== 'undefined' && AidaBoss.update) {
        AidaBoss.update(dt);
      }

      // Player class built-in update (handles dash, invulnerability ticks, etc.)
      if (player && typeof player.update === 'function') {
        // Build combined enemy list without GC allocation from .concat()
        _allEnemiesScratch.length = 0;
        for (let _si = 0; _si < _activeSlimes.length; _si++) _allEnemiesScratch.push(_activeSlimes[_si]);
        for (let _li = 0; _li < _activeLeapingSlimes.length; _li++) _allEnemiesScratch.push(_activeLeapingSlimes[_li]);
        player.update(dt, _allEnemiesScratch, _activeProjList, expGems);
      }

      // Blood system tick (BloodSystem shim internally calls BloodV2.update — do NOT call BloodV2.update again)
      if (window.BloodSystem && typeof BloodSystem.update === 'function') {
        BloodSystem.update();
      }
      if (window.GoreSim && typeof window.GoreSim.update === 'function') {
        window.GoreSim.update(dt);
      }
      if (window.SlimePool && typeof window.SlimePool.update === 'function') {
        window.SlimePool.update(dt, player ? player.mesh.position : null);
      }
      if (!window._sandboxWaveManagerActive && window.WaveSpawner && typeof window.WaveSpawner.update === 'function') {
        window.WaveSpawner.update(dt, player ? player.mesh.position : null);
      }
      if (window.HitDetection && typeof window.HitDetection.update === 'function') {
        // Defensive check: ensure player and player.mesh exist before accessing position
        const playerPos = (player && player.mesh && player.mesh.position) ? player.mesh.position : null;
        window.HitDetection.update(dt, playerPos);
      }
      // World Trees — wind sway, collision shake, leaf particles
      if (window._engine2Instance && window._engine2Instance._worldTrees) {
        // Defensive check: ensure player and player.mesh exist before accessing position
        const playerPos = (player && player.mesh && player.mesh.position) ? player.mesh.position : null;
        window._engine2Instance._worldTrees.update(dt, playerPos);
      }
      // Trauma system tick (gore chunks, stuck arrows, wound decals)
      if (window.TraumaSystem && typeof TraumaSystem.update === 'function') {
        TraumaSystem.update(dt);
      }

      // Blood stain decal fade update
      _updateBloodStains(dt);

      // Bullet hole decal fade update
      _updateBulletHoles(dt);

      // Gore: corpse linger system — heartbeat blood pumping and cleanup
      _updateCorpses(dt);

      // Rage combat system tick
      if (window.GameRageCombat && typeof GameRageCombat.update === 'function') {
        GameRageCombat.update(dt);
      }

      // Stamina regen: regenerates over time at staminaRegen units/second
      if (window.playerStats && window.playerStats.maxStamina > 0 &&
          (window.playerStats.stamina || 0) < window.playerStats.maxStamina) {
        const _staRegen = window.playerStats.staminaRegen || 8;
        window.playerStats.stamina = Math.min(
          window.playerStats.maxStamina,
          (window.playerStats.stamina || 0) + _staRegen * dt
        );
      }

      // Grey Boss system tick
      if (typeof GreyBossSystem !== 'undefined') { GreyBossSystem.update(dt); }

      // Damage numbers
      if (window.DopamineSystem && window.DopamineSystem.DamageNumbers) {
        window.DopamineSystem.DamageNumbers.update(dt);
      }

      // World objects: day/night cycle, sway physics, ambient animations
      if (window.WorldObjects && typeof WorldObjects.update === 'function') {
        WorldObjects.update(dt);
      }

      // ── Universal invisible entity safety net (once per second) ──────────────
      // Fixes: Enemies, XP stars, and blood particles disappearing unexpectedly
      _visibilityCheckTimer += dt;
      if (_visibilityCheckTimer >= 1.0) {
        _visibilityCheckTimer = 0;

        // Check enemies
        const _enemyArrays = [
          { arr: _activeSlimes,       type: 'slime' },
          { arr: _activeCrawlers,     type: 'crawler' },
          { arr: _activeLeapingSlimes,type: 'leaping_slime' },
          { arr: _activeSkinwalkers,  type: 'skinwalker' },
        ];
        for (let _ea = 0; _ea < _enemyArrays.length; _ea++) {
          const _entry = _enemyArrays[_ea];
          const _arr = _entry.arr;
          for (let _ei = 0; _ei < _arr.length; _ei++) {
            const _e = _arr[_ei];
            const _mesh = _e && (_e.mesh || (_e.parts && _e.parts.root));
            // Use a unified "alive" check: works for slimes (dead), crawlers/leapers (alive), skinwalkers (dead)
            // _e.alive === undefined means the property doesn't exist (internal slimes) — treat as alive
            const _eAlive = _e && !_e.dead && (_e.alive === true || _e.alive === undefined);
            if (_eAlive && _mesh && !_mesh.visible && _mesh.position && _mesh.position.y > MIN_VISIBLE_Y_THRESHOLD) {
              _mesh.visible = true;
              // console.warn('[InvisibilityFix] Restored visibility for ' + _entry.type, _e); // REMOVED: hot-path performance
            }
          }
        }

        // Check XP stars - ensure all active stars are visible and have non-zero scale
        if (window.XPStarSystem && window.XPStarSystem._activeStars) {
          const _activeStars = window.XPStarSystem._activeStars;
          for (let _si = 0; _si < _activeStars.length; _si++) {
            const _star = _activeStars[_si];
            if (_star && _star.active && _star.mesh && _star.mesh.position && _star.mesh.position.y > MIN_VISIBLE_Y_THRESHOLD) {
              if (!_star.mesh.visible) {
                _star.mesh.visible = true;
                // console.warn('[InvisibilityFix] Restored visibility for XP star', _star); // REMOVED: hot-path performance
              }
              // Also restore if scale was accidentally zeroed out
              if (_star.mesh.scale.x < 0.001) {
                _star.mesh.scale.set(1, 1, 1);
                // console.warn('[InvisibilityFix] Restored scale for XP star', _star); // REMOVED: hot-path performance
              }
            }
          }
        }

        // Check blood instanced meshes — ensure they aren't accidentally hidden
        if (window.BloodV2 && typeof window.BloodV2.getMeshes === 'function') {
          const _bMeshes = window.BloodV2.getMeshes();
          if (_bMeshes.drops && !_bMeshes.drops.visible) _bMeshes.drops.visible = true;
          if (_bMeshes.mist  && !_bMeshes.mist.visible)  _bMeshes.mist.visible  = true;
        }
      }

      // Atmospheric weather particles and dynamic sky cycle
      try { if (_weatherActive) _updateWeatherSystem(dt, nowMs); } catch(e) {}
      try { _updateSkyCycle(dt); } catch(e) {}

      // ── Engine 2.0 Landmark Animations ───────────────────────────────────────
      // Animate UFO, Obelisk, and Lake features added to Sandbox 2.0
      if (window._engine2Landmarks) {
        const landmarks = window._engine2Landmarks;

        // UFO engine lights pulsing
        if (landmarks.ufo) {
          if (landmarks.ufo.engineLights) {
            var _uelArr = landmarks.ufo.engineLights;
            for (var _uelI = 0; _uelI < _uelArr.length; _uelI++) {
              var _uel = _uelArr[_uelI];
              _uel.userData.phase = (_uel.userData.phase || 0) + dt * 2;
              var pulseFactor = 0.7 + Math.sin(_uel.userData.phase) * 0.3;
              _uel.material.opacity = pulseFactor;
              _uel.scale.setScalar(0.8 + pulseFactor * 0.4);
            }
          }
          if (landmarks.ufo.enginePointLights) {
            var _uplArr = landmarks.ufo.enginePointLights;
            for (var _uplI = 0; _uplI < _uplArr.length; _uplI++) {
              var _upl = _uplArr[_uplI];
              _upl.userData.phase = (_upl.userData.phase || 0) + dt * 2;
              _upl.intensity = 2.0 + Math.sin(_upl.userData.phase) * 1.0;
            }
          }
        }

        // Annunaki Obelisk crystal rotation + energy rings
        if (landmarks.obelisk) {
          // Rotate and pulse the top energy crystal
          if (landmarks.obelisk.crystal) {
            landmarks.obelisk.crystal.userData.phase = (landmarks.obelisk.crystal.userData.phase || 0) + dt * 1.5;
            landmarks.obelisk.crystal.rotation.y += dt * 0.8;
            landmarks.obelisk.crystal.rotation.x = Math.sin(landmarks.obelisk.crystal.userData.phase) * 0.3;
            landmarks.obelisk.crystal.material.emissiveIntensity = 1.0 + Math.sin(landmarks.obelisk.crystal.userData.phase * 2) * 0.4;
          }

          // Rotate energy rings at different speeds
          if (landmarks.obelisk.rings && landmarks.obelisk.rings.length > 0) {
            var _orArr = landmarks.obelisk.rings;
            for (var _orI = 0; _orI < _orArr.length; _orI++) {
              var _or = _orArr[_orI];
              _or.userData.phase = (_or.userData.phase || 0) + dt * _or.userData.speed;
              _or.rotation.z = _or.userData.phase;
              _or.material.opacity = (0.3 - _orI * 0.08) + Math.sin(_or.userData.phase * 1.5) * 0.1;
            }
          }

          // Pulse the top and base lights
          const obeliskPhase = (window._obeliskLightPhase || 0) + dt * 2.0;
          window._obeliskLightPhase = obeliskPhase;

          if (landmarks.obelisk.topLight) {
            landmarks.obelisk.topLight.intensity = 2.5 + Math.sin(obeliskPhase) * 0.8;
          }
          if (landmarks.obelisk.baseLight) {
            landmarks.obelisk.baseLight.intensity = 1.3 + Math.sin(obeliskPhase * 1.3) * 0.5;
          }

          // Pulse pylon crystals
          if (landmarks.obelisk.pylonCrystals && landmarks.obelisk.pylonCrystals.length > 0) {
            var _pcArr = landmarks.obelisk.pylonCrystals;
            for (var _pcI = 0; _pcI < _pcArr.length; _pcI++) {
              var _pc = _pcArr[_pcI];
              _pc.userData.phase = (_pc.userData.phase || 0) + dt * 2.5;
              _pc.rotation.y += dt * 1.2;
              _pc.material.opacity = 0.6 + Math.sin(obeliskPhase * 2 + _pc.userData.phase) * 0.2;
            }
          }
        }

        // Lake sparkles animation (waterfall removed)
        if (landmarks.lake && landmarks.lake.sparkles) {
          var _lsArr = landmarks.lake.sparkles;
          for (var _lsI = 0; _lsI < _lsArr.length; _lsI++) {
            var _ls = _lsArr[_lsI];
            _ls.userData.phase = (_ls.userData.phase || 0) + 0.02 * _ls.userData.speed;
            _ls.material.opacity = 0.3 + Math.abs(Math.sin(_ls.userData.phase)) * 0.7;
            var _lsScale = 1 + Math.sin(_ls.userData.phase * 2) * 0.5;
            _ls.scale.set(_lsScale, 1, _lsScale);
          }
        }

        // Annunaki Tablet glow + glyph shimmer + dust motes
        if (window._engine2Instance && window._engine2Instance._annunakiTablet) {
          window._engine2Instance._annunakiTablet.update(dt);
        }
      }

      // Ancient Pyramid animation (registered in window._engine2Landmarks)
      if (window._engine2Landmarks && window._engine2Landmarks.pyramid &&
          typeof window._engine2Landmarks.pyramid.update === 'function') {
        window._engine2Landmarks.pyramid.update(dt);
      }

      // Ground details: grass wind, player disturbance
      if (window._engine2Instance && window._engine2Instance._groundDetails) {
        // Defensive check: ensure player and player.mesh exist before accessing position
        const playerPos = (player && player.mesh && player.mesh.position) ? player.mesh.position : null;
        window._engine2Instance._groundDetails.update(dt, playerPos);
      }

      // Camera shake & pooled flash updates
      // BonusLandmarks animated update (fire, debris, well) - pass playerPos for LOD
      if (window._engine2Instance && window._engine2Instance._bonusLandmarks) {
        const playerPos = (player && player.mesh && player.mesh.position) ? player.mesh.position : null;
        window._engine2Instance._bonusLandmarks.update(dt, playerPos);
      }

      // Expose sandbox enemies so game-hud.js minimap / quest arrow and other systems can see them.
      // Reuse the same array instance each frame to avoid per-frame allocations.
      if (!window.enemies || !Array.isArray(window.enemies)) {
        window.enemies = [];
      }
      window.enemies.length = 0;
      for (var _ei = 0; _ei < _activeSlimes.length; _ei++) { window.enemies.push(_activeSlimes[_ei]); }
      for (var _ej = 0; _ej < _activeCrawlers.length; _ej++) { window.enemies.push(_activeCrawlers[_ej]); }
      for (var _ek = 0; _ek < _activeLeapingSlimes.length; _ek++) { window.enemies.push(_activeLeapingSlimes[_ek]); }
      for (var _em = 0; _em < _activeSkinwalkers.length; _em++) { window.enemies.push(_activeSkinwalkers[_em]); }
      // Also update the lexical `enemies` binding declared in main.js so game-hud.js reads it correctly.
      if (typeof enemies !== 'undefined') { enemies = window.enemies; }

      _updateCameraShake(dt);
      _updateFlashPool(dt);

      // Kill combo: countdown timer and fade out when expired
      if (_killComboTimer > 0) {
        _killComboTimer -= dt;
        if (_killComboTimer <= 0) {
          _killCombo = 0;
          var comboEl = document.getElementById('kill-combo-display');
          if (comboEl) {
            comboEl.style.transition = 'opacity 0.4s ease';
            comboEl.style.opacity = '0';
          }
        }
      }
      _updateComboVignette();

      // Level-up shockwave ring animation (supports per-ring _expandRate/_fadeRate)
      for (var _ri = _lvlUpRings.length - 1; _ri >= 0; _ri--) {
        var _ring = _lvlUpRings[_ri];
        var _rExp  = (_ring._expandRate !== undefined) ? _ring._expandRate : 0.38;
        var _rFade = (_ring._fadeRate   !== undefined) ? _ring._fadeRate   : 0.022;
        _ring.scale.x += _rExp  * dt * 60;
        _ring.scale.z += _rExp  * dt * 60;
        _ring.material.opacity -= _rFade * dt * 60;
        if (_ring.material.opacity <= 0) {
          // Pooled: just hide — no dispose, no scene.remove (stays in scene invisible)
          _ring.visible = false;
          _ring.material.opacity = 0;
          _lvlUpRings.splice(_ri, 1);
        }
      }

      // Persistent HUD: session timer and kill count
      _updatePersistentHUD(dt);

      // Mysterious egg proximity check for quest_eggHunt (CHANGE 7)
      if (window._mysteriousEggObject && player && player.mesh) {
        const _epx = player.mesh.position.x - window._mysteriousEggObject.position.x;
        const _epz = player.mesh.position.z - window._mysteriousEggObject.position.z;
        if (_epx * _epx + _epz * _epz <= 4) { // within 2 units (2^2 = 4)
          if (saveData.tutorialQuests) saveData.tutorialQuests.mysteriousEggFound = true;
          // Dispose GPU resources before removing from scene
          window._mysteriousEggObject.traverse(function(child) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
          scene.remove(window._mysteriousEggObject);
          window._mysteriousEggObject = null;
          _showWaveNotification('🥚 You found the Mysterious Egg!', '#8B5CF6', 3000);
          _checkSandboxRunQuestProgress();
        }
      }

      _refreshHUD(dt);

      // Tick player status effects (StatusBar depletion)
      if (typeof window._tickPlayerStatus === 'function') window._tickPlayerStatus(dt);

      if (window._bloomComposer && window._composerActive) {
        window._bloomComposer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (e) {
      if (!_animateErrorShown) {
        _animateErrorShown = true;
        // Only show error for critical issues, log others to console
        const errorMsg = (e && e.message ? e.message : String(e));
        console.error('[SandboxLoop] _animate error:', e);

        // Only show on-screen error for fatal errors that prevent game from running.
        // Suppress property-access errors (TypeError: Cannot read ... of undefined/null)
        // but always surface ReferenceErrors so missing globals are visible.
        const isPropertyAccessError =
          /Cannot read (propert(?:y|ies)) of (undefined|null)/i.test(errorMsg);

        if (!isPropertyAccessError) {
          _showError('Animate error: ' + errorMsg);
        } else {
          console.warn('[SandboxLoop] Non-fatal animate error suppressed from UI:', errorMsg);
        }
      }
    }
  }

  // ─── Boot sequence ────────────────────────────────────────────────────────────

  // ─── Weather Particle System ──────────────────────────────────────────────────
  function _initWeatherSystem() {
    try {
      if (typeof THREE === 'undefined' || !scene) return;
      // Disable WorldObjects' built-in day/night so _updateSkyCycle is the sole
      // controller of scene.background, fog.color, and light intensities.
      if (window.WorldObjects && typeof WorldObjects.setDayNightEnabled === 'function') {
        WorldObjects.setDayNightEnabled(false);
      }
      _weatherGeo = new THREE.BufferGeometry();
      var positions = new Float32Array(WEATHER_COUNT * 3);
      _weatherVelocities = [];
      for (var i = 0; i < WEATHER_COUNT; i++) {
        positions[i * 3]     = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = Math.random() * 60 - 5;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
        _weatherVelocities.push(-2 - Math.random() * 3); // downward Y velocity: -2 to -5
      }
      _weatherPositions = positions;
      _weatherGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      _weatherMat = new THREE.PointsMaterial({
        color: 0xccddff,
        size: 0.15,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      _weatherParticles = new THREE.Points(_weatherGeo, _weatherMat);
      // Disable frustum culling because geometry positions are continuously re-centered
      // around the player without updating the geometry's bounding volume.
      _weatherParticles.frustumCulled = false;
      scene.add(_weatherParticles);
      // Weather toggle exposed globally
      window._toggleWeather = function() {
        _weatherActive = !_weatherActive;
        if (_weatherParticles) _weatherParticles.visible = _weatherActive;
      };
    } catch(e) {
      console.warn('[SandboxLoop] Weather system init failed (non-fatal):', e);
    }
  }

  function _updateWeatherSystem(dt, nowMs) {
    if (!_weatherParticles || !_weatherPositions || !_weatherGeo) return;
    var px = (player && player.mesh) ? player.mesh.position.x : 0;
    var pz = (player && player.mesh) ? player.mesh.position.z : 0;
    var pos = _weatherPositions;
    _weatherFrameCounter++;
    // Re-center particle cloud around player every 60 frames
    var recenter = (_weatherFrameCounter % 60 === 0);
    // Scale horizontal drift by dt so motion is frame-rate independent.
    // Using 60 as a reference FPS keeps behavior similar at 60 FPS.
    var driftScale = dt * 60;
    for (var i = 0; i < WEATHER_COUNT; i++) {
      var idx = i * 3;
      // Downward movement
      pos[idx + 1] += _weatherVelocities[i] * dt;
      // Horizontal drift (sin-wave swaying), scaled by dt
      pos[idx]     += Math.sin(nowMs * 0.001 + i) * 0.02  * driftScale;
      pos[idx + 2] += Math.cos(nowMs * 0.0008 + i * 0.5) * 0.015 * driftScale;
      // Respawn particle when it falls below floor
      if (pos[idx + 1] < -2) {
        pos[idx]     = px + (Math.random() - 0.5) * 200;
        pos[idx + 1] = 40 + Math.random() * 20;
        pos[idx + 2] = pz + (Math.random() - 0.5) * 200;
      }
      // Periodically re-center around player
      if (recenter) {
        var dx = pos[idx]     - px;
        var dz = pos[idx + 2] - pz;
        if (Math.abs(dx) > 100) pos[idx]     = px + (Math.random() - 0.5) * 200;
        if (Math.abs(dz) > 100) pos[idx + 2] = pz + (Math.random() - 0.5) * 200;
      }
    }
    _weatherGeo.attributes.position.needsUpdate = true;
  }

  // ─── Sky Color Day/Night Cycle ────────────────────────────────────────────────
  function _updateSkyCycle(dt) {
    if (typeof THREE === 'undefined' || !scene) return;
    // Advance time
    _skyTime += _skySpeed * dt;
    if (_skyTime >= 1.0) _skyTime -= 1.0;

    // Find bracketing keyframes
    var colors = _skyColors;
    var a = colors[0], b = colors[1];
    for (var i = 0; i < colors.length - 1; i++) {
      if (_skyTime >= colors[i].time && _skyTime < colors[i + 1].time) {
        a = colors[i];
        b = colors[i + 1];
        break;
      }
    }
    var span = b.time - a.time;
    var t = span > 0 ? (_skyTime - a.time) / span : 0;

    // Lazy-init reusable THREE.Color instances (avoids allocations every frame)
    if (!_skyColA) {
      _skyColA = new THREE.Color();
      _skyColB = new THREE.Color();
      _fogColA = new THREE.Color();
      _fogColB = new THREE.Color();
    }

    // Lerp sky and fog colors using cached instances (zero allocations per frame)
    _skyColA.setHex(a.sky);
    _skyColB.setHex(b.sky);
    _fogColA.setHex(a.fog);
    _fogColB.setHex(b.fog);
    _skyColA.lerp(_skyColB, t); // _skyColA now holds the interpolated sky color
    _fogColA.lerp(_fogColB, t); // _fogColA now holds the interpolated fog color

    var ambInt = a.ambInt + (b.ambInt - a.ambInt) * t;
    var sunInt = a.sunInt + (b.sunInt - a.sunInt) * t;

    // Apply sky color
    if (scene.background) scene.background.set(_skyColA);
    else scene.background = _skyColA.clone();
    if (scene.fog) scene.fog.color.set(_fogColA);

    // Apply lighting (guarded)
    if (window._sandboxLights) {
      if (window._sandboxLights.ambient) window._sandboxLights.ambient.intensity = ambInt;
      // Sun position follows the cycle; suppress when below horizon
      if (window._sandboxLights.sun) {
        var sunAngle = _skyTime * Math.PI * 2;
        var sunElevation = Math.sin(sunAngle);
        var sunY = sunElevation * 40 + 10;
        // Anchor sun relative to player so shadows cast correctly as player moves
        var _px = (player && player.mesh) ? player.mesh.position.x : 0;
        var _pz = (player && player.mesh) ? player.mesh.position.z : 0;
        window._sandboxLights.sun.position.set(_px + Math.cos(sunAngle) * 60, Math.max(5, sunY), _pz + 20);
        window._sandboxLights.sun.intensity = sunY < 0 ? 0 : sunInt;
        // Point shadow camera at player so shadows stay sharp around the action
        if (window._sandboxLights.sun.target) {
          window._sandboxLights.sun.target.position.set(_px, 0, _pz);
          window._sandboxLights.sun.target.updateMatrixWorld();
        }
        // Sharper shadows when sun is low on the horizon (dramatic side shadows)
        var shadowBlurRadius = Math.max(1, 4 - Math.abs(sunElevation) * 3);
        window._sandboxLights.sun.shadow.radius = shadowBlurRadius;
      }
    }

    // Adjust weather particle appearance based on time of day
    if (_weatherMat) {
      var isNight = (_skyTime >= 0.8 || _skyTime < 0.2);
      if (isNight) {
        _weatherMat.color.setHex(0x4466aa);
        _weatherMat.opacity = 0.2;
      } else {
        _weatherMat.color.setHex(0xccddff);
        _weatherMat.opacity = 0.4;
      }
    }
  }

  // ─── Boot sequence ────────────────────────────────────────────────────────────
  function _boot() {
    if (_ready) return;
    _ready = true;

    // Failsafe: if boot takes > 10 s (silent error, missing dep, etc.) force-clear the
    // loading screen so the UI never hard-locks.  Cancelled below once boot succeeds.
    const _bootFailsafeTimer = setTimeout(function () {
      if (typeof _showError === 'function') {
        _showError('Boot timed out');
      }
      const _fls = document.getElementById('loading-screen');
      if (_fls) { _fls.style.opacity = '0'; _fls.style.pointerEvents = 'none'; _fls.style.display = 'none'; }
      window.gameModuleReadyTimedOut = true;
      console.warn('[SandboxLoop] ⚠ Boot failsafe triggered — loading screen force-cleared after 10 s.');
    }, 10000);

    console.log('[🎮 SandboxLoop] Starting Sandbox 2.0 boot sequence...');

    // Bug 1 fix: set sandbox mode flag BEFORE any init calls so world-gen.js
    // skips the duplicate ground plane and Engine2Sandbox initialises correctly.
    window._engine2SandboxMode = true;
    console.log('[🎮 SandboxLoop] ✓ Sandbox mode flag set');

    try {
      // Allow showUpgradeModal to run (main.js defaults isGameActive=false for menu).
      // Use setter functions to avoid readonly property crash on iOS/Safari.
      if (typeof setGameActive === 'function') setGameActive(true);
      if (typeof setGameOver === 'function') setGameOver(false);
      window.isGameActive = true;
      window.isGameOver = false;
      console.log('[🎮 SandboxLoop] ✓ Game state activated');

      // Hide loading screen
      const ls = document.getElementById('loading-screen');
      if (ls) {
        ls.style.opacity = '0';
        ls.style.pointerEvents = 'none';
        setTimeout(function () { ls.style.display = 'none'; }, 400);
      }
      console.log('[🎮 SandboxLoop] ✓ Loading screen hidden');

      // Show the ui-layer (HUD)
      const uiLayer = document.getElementById('ui-layer');
      if (uiLayer) uiLayer.style.display = 'block';
      console.log('[🎮 SandboxLoop] ✓ UI layer shown');

      console.log('[🎮 SandboxLoop] Initializing settings...');
      _initSandboxSettings();
      console.log('[🎮 SandboxLoop] ✓ Settings initialized');

      // Init Three.js
      console.log('[🎮 SandboxLoop] Initializing Three.js scene...');
      _initScene();
      console.log('[🎮 SandboxLoop] ✓ Scene initialized');

      // Spawn gathering nodes (trees + rocks) around the arena perimeter
      _spawnGatheringNodes();

      console.log('[🎮 SandboxLoop] Initializing ground (Engine2Sandbox)...');
      _initGround();
      console.log('[🎮 SandboxLoop] ✓ Ground initialized');

      // Initialize static world objects (trees, rocks, fences, grass, Stonehenge, Lore Lake, day/night)
      if (window.WorldObjects && typeof WorldObjects.init === 'function') {
        console.log('[🎮 SandboxLoop] Initializing WorldObjects (static map)...');
        WorldObjects.init(scene, window._sandboxLights);
        console.log('[🎮 SandboxLoop] ✓ WorldObjects initialized');
      }

      console.log('[🎮 SandboxLoop] Initializing blood/gore systems...');
      _initBloodSystem();
      console.log('[🎮 SandboxLoop] ✓ Blood systems initialized');

      console.log('[🎮 SandboxLoop] Initializing rage combat...');
      _initRageCombat();
      console.log('[🎮 SandboxLoop] ✓ Rage combat initialized');

      console.log('[🎮 SandboxLoop] Initializing object pools...');
      _initPools();
      console.log('[🎮 SandboxLoop] ✓ Object pools initialized');

      // Initialize atmospheric weather particle system (non-fatal if it fails)
      try { _initWeatherSystem(); } catch(e) { console.warn('[SandboxLoop] Weather init failed:', e); }

      console.log('[🎮 SandboxLoop] Initializing player (spawn animation will trigger)...');
      _initPlayer();
      console.log('[🎮 SandboxLoop] ✓ Player initialized at position:', player?.mesh?.position);
      console.log('[🎮 SandboxLoop] ✓ Spawn intro active:', _spawnIntroActive);

      console.log('[🎮 SandboxLoop] Building slime enemy pool...');
      _buildSlimePool();     // Pre-allocate enemy pool (50 slots)
      console.log('[🎮 SandboxLoop] ✓ Slime pool built (50 slots)');

      // Initialize crawler enemy pool
      if (window.CrawlerPool && typeof CrawlerPool.init === 'function') {
        console.log('[🎮 SandboxLoop] Building crawler enemy pool...');
        CrawlerPool.init(scene, 15);
        console.log('[🎮 SandboxLoop] ✓ Crawler pool built (15 slots)');
      }

      // Initialize leaping slime enemy pool
      if (window.LeapingSlimePool && typeof LeapingSlimePool.init === 'function') {
        console.log('[🎮 SandboxLoop] Building leaping slime pool...');
        LeapingSlimePool.init(scene, 20);
        console.log('[🎮 SandboxLoop] ✓ Leaping slime pool built (20 slots)');
      }
      // Initialize Grey Boss system
      if (typeof GreyBossSystem !== 'undefined') { GreyBossSystem.init(scene, camera, player); }

      console.log('[🎮 SandboxLoop] Spawning first wave...');
      SeqWaveManager.start();  // Start sequential kill-based wave system
      window._sandboxWaveManagerActive = true;
      console.log('[🎮 SandboxLoop] ✓ Sequential wave system started');

      console.log('[🎮 SandboxLoop] Initializing input handlers...');
      _initInput();
      console.log('[🎮 SandboxLoop] ✓ Input initialized');

      _buildSandboxOverlay();
      _refreshExpBar();
      _initPersistentHUD(); // Initialize kill count and session timer HUD

      // Attach X button handler for levelup-modal (game-screens.js not loaded in sandbox)
      const xBtn = document.getElementById('levelup-x-btn');
      if (xBtn) {
        xBtn.addEventListener('click', function () {
          const modal = document.getElementById('levelup-modal');
          if (modal) modal.style.display = 'none';
          window.isPaused = false;
        });
      }

      // Show starting weapon choice if player has unlocked starting weapons
      if (saveData.unlockedStartWeapons && saveData.unlockedStartWeapons.length > 0 && weapons) {
        try {
          var _swChoices = saveData.unlockedStartWeapons;
          var _swOverlay = document.createElement('div');
          _swOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;';
          var _swPanel = document.createElement('div');
          _swPanel.style.cssText = 'background:#1a1a2e;border:3px solid #FFD700;border-radius:12px;padding:24px;color:#fff;font-family:"Bangers",cursive;text-align:center;max-width:500px;';
          _swPanel.innerHTML = '<div style="font-size:1.8em;color:#FFD700;margin-bottom:16px;">⚔️ CHOOSE STARTING WEAPON</div><div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;" id="_swChoiceList"></div>';
          _swOverlay.appendChild(_swPanel);
          document.body.appendChild(_swOverlay);
          var _swList = _swPanel.querySelector('#_swChoiceList');
          // Map stored weapon IDs to actual internal sandbox weapon keys
          var _swIdMap = {
            pistol: 'gun', shotgun: 'pumpShotgun', rifle: 'sniperRifle',
            revolver: 'uzi', flamethrower: 'fireRing', rocketLauncher: 'homingMissile'
          };
          _swChoices.forEach(function(wid) {
            var _btn = document.createElement('button');
            _btn.style.cssText = 'padding:10px 16px;background:#2a2a4e;border:2px solid #FFD700;color:#FFD700;font-family:"Bangers",cursive;font-size:1.2em;cursor:pointer;border-radius:8px;';
            _btn.textContent = wid;
            _btn.onclick = function() {
              var internalId = _swIdMap[wid] || wid;
              if (weapons[internalId]) {
                weapons[internalId].active = true;
                weapons[internalId].level = Math.max(1, weapons[internalId].level || 1);
              } else {
                console.warn('[SandboxLoop] Unknown starting weapon id:', wid, '→', internalId);
              }
              _swOverlay.remove();
            };
            _swList.appendChild(_btn);
          });
          var _skipBtn = document.createElement('button');
          _skipBtn.style.cssText = 'margin-top:12px;padding:8px 16px;background:#333;border:1px solid #888;color:#aaa;cursor:pointer;border-radius:8px;';
          _skipBtn.textContent = 'Skip (use default)';
          _skipBtn.onclick = function() { _swOverlay.remove(); };
          _swPanel.appendChild(_skipBtn);
        } catch(e) { console.warn('[SandboxLoop] Starting weapon modal error:', e); }
      }

      // Start loop
      // PERFORMANCE FIX 1A: Cancel any previous rAF before starting a new loop
      if (_rafId !== null) cancelAnimationFrame(_rafId);
      _lastTime = performance.now();
      _rafId = requestAnimationFrame(_animate);

      // Initialize run quest tracking (CHANGE 1 + 9)
      _sandboxRunKills = 0;
      _xpMagnetRunStacks = 0;
      window._sandboxXpMagnetRunStacks = 0;
      _sandboxRunStartTime = Date.now();
      window.gameStartTime = _sandboxRunStartTime; // expose for ui.js showYouDiedBanner
      if (saveData.tutorialQuests) saveData.tutorialQuests.killsThisRun = 0;
      // Track total runs — keep stats.* and top-level counter in sync
      if (saveData) {
        if (saveData.stats) saveData.stats.totalRuns = (saveData.stats.totalRuns || 0) + 1;
        saveData.totalRuns = (saveData.totalRuns || 0) + 1;
      }
      // Initialize GameAccount if available
      if (window.GameAccount && typeof window.GameAccount.init === 'function' && !window.GameAccount._initialized) {
        window.GameAccount.init(saveData);
        window.GameAccount._initialized = true;
      }

      console.log('[🎮 SandboxLoop] ✓ Animation loop started');
      // Signal loading.js that the game module is ready so the loading screen
      // fades out and routes to the camp / main-menu screen.
      clearTimeout(_bootFailsafeTimer); // boot succeeded — cancel the failsafe timer
      window.gameModuleReady = true;
      console.log('[🎮 SandboxLoop] ════════════════════════════════════════════');
      console.log('[🎮 SandboxLoop] 🎉 ENGINE 2.0 SANDBOX READY!');
      console.log('[🎮 SandboxLoop] ════════════════════════════════════════════');
      console.log('[🎮 SandboxLoop] ✓ Spawn animation should be running');
      console.log('[🎮 SandboxLoop] ✓ Eye of Horus button (𓂀) in top-right');
      console.log('[🎮 SandboxLoop] ✓ Ground texture loading from Engine2Sandbox');
      console.log('[🎮 SandboxLoop] ✓ Blood/gore systems ready');
      console.log('[🎮 SandboxLoop] Type runSandboxDiagnostics() for full report');
      console.log('[🎮 SandboxLoop] ════════════════════════════════════════════');
      console.log('[GORE PATCH v1 REALISTIC] Applied successfully');
    } catch (e) {
      clearTimeout(_bootFailsafeTimer);
      _showError('Boot error: ' + (e && e.message ? e.message : String(e)));
      console.error('[SandboxLoop] _boot error:', e);
      // Failsafe: ensure the loading screen is always dismissed even on crash
      var _ls = document.getElementById('loading-screen');
      if (_ls) { _ls.style.opacity = '0'; _ls.style.pointerEvents = 'none'; _ls.style.display = 'none'; }
      window.gameModuleReady = true;
    }
  }

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }
}());
