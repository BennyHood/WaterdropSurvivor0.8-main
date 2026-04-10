// ============================================================
// camp-world.js  —  3D Playable Camp Hub World
// ============================================================
// A fully playable Three.js scene that replaces the static 2D
// Camp Menu.  The player spawns here after every death, walks
// around the cosy campfire hub and physically visits buildings
// to open their existing 2D UI panels.
//
// Architecture
// ─────────────
//  • Regular script (not ES-module) – THREE via window.THREE
//  • Uses the SAME WebGLRenderer as the main game (no 2nd ctx)
//  • Exposes  window.CampWorld  for main.js integration
// ============================================================

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // Constants
  // ──────────────────────────────────────────────────────────
  const SPAWN_POS = { x: 0, z: 3 };           // where player spawns (near fire)
  const PLAYER_SPEED = 7.0;                    // units per second
  const PLAYER_RADIUS = 0.55;
  const INTERACTION_RADIUS = 5.5;             // proximity to trigger interact

  // Building layout (id → world position + label)
  const BUILDING_DEFS = [
    // ── Campfire hub (closest) ──────────────────────────────
    { id: 'campBoard',           x: -4,    z:   4,  label: 'Teleport Portal',     icon: '🌀' },
    { id: 'codex',               x:  4,    z:   4,  label: 'Codex',               icon: '📖' },

    // ── CENTERPIECE: Quest Hall + flanks (north hub) ────────
    { id: 'questMission',        x:  0,    z:  13,  label: 'Quest Hall',          icon: '📜' },
    { id: 'armory',              x: -12,   z:  13,  label: 'Armory',              icon: '⚔️'  },
    { id: 'progressionHouse',    x:  12,   z:  13,  label: 'Progression House',   icon: '💪' },

    // ── Skill Tree — majestic glowing tree behind Quest Hall ─
    { id: 'skillTree',           x:  0,    z:  21,  label: 'Skill Tree',          icon: '🌳' },
    { id: 'tavern',              x: -9,    z:  20,  label: 'Tavern',              icon: '🍺' },
    { id: 'shop',                x:  9,    z:  20,  label: 'Shop',                icon: '🛒' },

    // ── Mid ring — forge, progression, combat ───────────────
    { id: 'forge',               x: -11,   z:   4,  label: 'The Forge',           icon: '⚒️'  },
    { id: 'specialAttacks',      x:  11,   z:   4,  label: 'Special Attacks',     icon: '⚡' },
    { id: 'trainingHall',        x:  11,   z:  -6,  label: 'Training Hall',       icon: '🏋️' },
    { id: 'inventory',           x:  14,   z:   0,  label: 'Inventory',           icon: '📦' },

    // ── Companion Area — clearly visible west cluster ────────
    { id: 'companionHouse',      x: -15,   z:   0,  label: 'Companion Home',      icon: '🏡' },
    { id: 'droppletShop',        x: -14,   z:   8,  label: 'The Dropplet Shop',   icon: '💧' },
    { id: 'tempShop',            x:  14,   z:   8,  label: 'Temp Shop',           icon: '🏪' },

    // ── Economy / south ring ─────────────────────────────────
    { id: 'warehouse',           x:  0,    z: -12,  label: 'Warehouse',           icon: '🏪' },
    { id: 'shrine',              x:  0,    z:  -6,  label: 'The Artifact Shrine', icon: '🏛️' },
    { id: 'achievementBuilding', x: -6,    z: -14,  label: 'Hall of Trophies',    icon: '🏆' },
    { id: 'accountBuilding',     x:  3,    z: -10,  label: 'Profile & Records',   icon: '👤' },
    { id: 'prismReliquary',      x: -10,   z: -16,  label: 'Prism Reliquary',     icon: '💎' },
    { id: 'astralGateway',       x:  10,   z: -16,  label: 'Astral Gateway',      icon: '🌀' },
    { id: 'trashRecycle',        x: -14,   z: -10,  label: 'Trash & Recycle',     icon: '♻️' },

    // ── 🎰 Casino corner (southeast) ─────────────────────────
    { id: 'slotMachine',         x:  12,   z: -11,  label: '🎰 Slot Machine',     icon: '🎰' },

    // ── Far south ─────────────────────────────────────────────
    { id: 'prestige',            x:  0,    z: -20,  label: 'Prestige Altar',      icon: '✨' },
  ];

  // ──────────────────────────────────────────────────────────
  // Module-level state
  // ──────────────────────────────────────────────────────────
  let _campScene   = null;
  let _campCamera  = null;
  let _renderer    = null;       // shared renderer from main.js

  // ── Profile avatar (UI layer) ─────────────────────────────
  let _uiScene          = null;
  let _uiCamera         = null;
  let _profileAvatar    = null;
  let _avatarTexture    = null;
  let _avatarMaterial   = null;
  let _avatarFrame      = 0;
  let _avatarFrameTimer = 0;
  const _AVATAR_FPS     = 14;   // ~14 fps for natural breathing cadence
  const _AVATAR_SIZE    = 128;  // sprite display size in pixels
  const _AVATAR_MARGIN  = 85;   // distance from left/top viewport edge to sprite center
  let _callbacks   = {};         // { buildingId → fn() } set by main.js
  let _isBuilding  = false;      // guard against re-entrant _buildScene() calls
  let _saveData    = null;
  // Track MutationObservers created by buildings so we can disconnect them on scene rebuild
  const _buildingObservers = [];

  let _playerMesh  = null;
  let _playerVel   = { x: 0, z: 0 };
  let _playerPos   = { x: SPAWN_POS.x, z: SPAWN_POS.z };

  // Camp player limb references for animation
  let _playerLeftArm = null;
  let _playerRightArm = null;
  let _playerLeftLeg = null;
  let _playerRightLeg = null;
  let _playerGunBody = null;
  let _playerBandageTail = null;
  // Camp player animation state
  let _campAnimState = 'idle'; // idle | walk | run | dash | slide | shoot | knife | chop | gather | tool
  let _campAnimTimer = 0;
  let _campDashTimer = 0;
  let _campDashVec   = { x: 0, z: 0 };
  let _campDashing   = false;
  let _campSliding   = false;
  let _campSlideTimer = 0;
  let _campActionTimer = 0; // for shoot/knife/chop/gather timed animations
  let _campActionAnim = null;
  // Movement feel state
  let _campAngularVel = 0;    // angular velocity for banking
  let _campForwardLean = 0;   // forward lean angle
  let _campBankLean = 0;      // banking lean angle
  let _campSlideAmt = 0;      // visual slide intensity
  // Spritesheet overlay
  let _spriteAnimator = null;

  // A.I.D.A NPC state (terminal/AI entity replacing Benny)
  let _bennyMesh   = null;  // kept as _bennyMesh internally to avoid large rename surface
  // dialogue bubble is managed by window.DialogueSystem
  const BENNY_POS  = { x: 4, z: 7 }; // near camp entrance
  const BENNY_GREET_RADIUS = 3.5;
  let _bennyGreeted = false;      // whether A.I.D.A greeting has fired this session

  let _campTime    = 0;
  let _isActive    = false;
  let _menuOpen    = false;  // true while a building menu overlay is visible
  let _menuOpenTs  = 0;      // timestamp (ms) when _menuOpen was last set true

  // Campfire light + flame for flickering
  let _fireLight   = null;
  let _flameMeshes = [];

  // Robot lap animation around the campfire (triggered after chip insertion)
  let _robotMesh    = null;
  let _robotLapActive = false;
  let _robotLapT = 0;

  // Camp Quest Arrow
  let _campArrowEl = null;
  let _campArrowDistEl = null;

  // Pre-allocated scratch Vector3 for per-frame camp UI projections (bubble + quest arrow)
  // Avoids GC pressure from new THREE.Vector3() every frame
  var _campUITmpVec = null; // lazily initialized when THREE is available

  // Smoke particle system and pulsating glow rings around campfire
  let _smokeSystem   = null;
  let _smokePositions = null;
  let _smokeVelocities = null;
  let _smokeLifetimes = null;
  let _glowRings = null;

  // Spark / ember particle system
  let _sparkSystem   = null;
  let _sparkPositions = null;
  let _sparkVelocities = [];
  let _sparkLifetimes = [];
  const SPARK_COUNT   = 120;

  // Floating dust / atmosphere particles
  let _dustSystem    = null;
  let _dustPositions = null;
  let _dustVelocities = [];
  let _dustLifetimes  = [];
  const DUST_COUNT    = 80;

  // Green firefly particles for cozy atmosphere
  let _fireflySystem = null;
  let _fireflyPositions = null;
  let _fireflyVelocities = [];
  let _fireflyLifetimes = [];
  let _fireflyPhases = [];  // For pulsing glow effect
  const FIREFLY_COUNT = 40;

  // Building mesh registry { id → THREE.Group }
  let _buildingMeshes = {};

  // ── AIDA Camp Corruption ─────────────────────────────────
  // Tree meshes stored for glitch effect (tier 2 corruption)
  let _treeMeshes = [];
  // Star field mesh for tinting
  let _starsMesh = null;
  // Lake mesh + light
  let _lakeMesh = null;
  let _lakeLight = null;
  // Lake binary particle system
  let _lakeParticles = null;
  let _lakeParticlePositions = null;
  let _lakeParticleVelocities = [];
  let _lakeParticleLifetimes = [];
  const LAKE_PARTICLE_COUNT = 150;
  const LAKE_POS = { x: 0, z: -52 }; // Large beautiful lake at the very north/top of map
  // Corruption level last applied (0–3) – used to detect tier transitions
  let _lastCorruptionLevel = -1;
  // Tree glitch timer
  let _treeGlitchTimer = 0;
  const TREE_GLITCH_INTERVAL = 3.5; // seconds between glitch bursts
  let _treeGlitching = false;       // true during 0.2s glitch flash
  let _treeGlitchFlashTimer = 0;
  let _treeGlitchMat = null;        // shared neon wireframe material, created once
  // Original tree canopy materials stored for restoration after glitch
  // Each entry: { canopies: Mesh[], origMats: Material[] }
  let _treeOrigMaterials = [];

  // Interaction state
  let _nearBuilding  = null;   // id of nearest building (if within radius)
  let _promptEl      = null;   // the DOM prompt element
  let _interactBtn   = null;   // mobile interact button
  let _buildingNameEl = null;  // separate building name display element

  // Alien Incubator pod state
  let _incubatorMesh = null;
  const INCUBATOR_POS = { x: -18, z: 0 }; // grouped with Companion Home (x:-15, z:0)
  const INCUBATOR_INTERACT_RADIUS = 3.5;
  let _incubatorInteracted = false; // guard against duplicate interactions this session

  // ── A.I.D.A Intro — Broken Robot + Chip ──────────────────
  // Broken robot sits directly beside the campfire (south side).
  // Chip is placed clearly to the north of the fire so it's easy to spot.
  // After Quest Hall is built (level > 0) AND chip inserted, robot moves inside.
  const AIDA_ROBOT_POS  = { x: 2, z: 2 };    // directly by campfire (south side)
  const AIDA_CHIP_POS   = { x: 0, z: -5 };   // north of fire — clearly visible open area
  const AIDA_QUEST_HALL_POS = { x: 0, z: 11.5 }; // in front of Quest Hall (z:13) once built
  const AIDA_INTRO_RADIUS      = 5.0;   // Generous radius so the interaction is easy to trigger
  const AIDA_CHIP_MAGNET_RANGE = 2.0;   // Distance at which chip starts flying toward player
  const AIDA_CHIP_AUTO_PICKUP  = 0.4;   // Auto-pickup distance — sucks chip into hand

  /**
   * _getAidaRobotPos()
   * Returns the live world position of the AIDA robot mesh when it exists, falling back to the
   * default spawn constant. Always use this for proximity checks so they stay accurate after the
   * robot has been relocated (e.g., from campfire to Quest Hall after building is complete).
   */
  function _getAidaRobotPos() {
    if (_aidaRobotMesh) return _aidaRobotMesh.position;
    return AIDA_ROBOT_POS;
  }
  let _aidaRobotMesh  = null;  // broken robot Group
  let _aidaChipMesh   = null;  // glowing chip Mesh (hidden after pickup)
  let _aidaIntroState = {      // session cache (authoritative value in saveData)
    chipPickedUp: false,
    chipInserted: false,
  };
  let _robotBubbleEl  = null;  // floating speech bubble DOM element above robot

  // Keyboard state (managed inside this module)
  let _keys = {};

  // Touch movement (own system, independent from game's joystick zone)
  // Activated only when camp is active.
  const _touch = {
    active: false,
    id: null,
    startX: 0,
    startY: 0,
    x: 0,       // normalised -1..1
    y: 0,
  };
  // Touch indicator DOM element (shown where the user touched)
  let _touchIndicator = null;

  // ──────────────────────────────────────────────────────────
  // Helper: safe THREE access (module loaded before main.js)
  // ──────────────────────────────────────────────────────────
  function T() { return window.THREE; }

  /**
   * _waitForTHREE(callback)
   * Polls for window.THREE every 50ms for up to 3 seconds (60 attempts).
   * Calls callback() once THREE is available, or logs a warning if it times out.
   */
  function _waitForTHREE(callback) {
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (T()) {
        clearInterval(interval);
        callback();
      } else if (attempts >= 60) {
        clearInterval(interval);
        console.warn('[CampWorld] window.THREE not available after 3s, giving up');
      }
    }, 50);
  }

  // ──────────────────────────────────────────────────────────
  // Scene construction
  // ──────────────────────────────────────────────────────────
  function _buildScene() {
    const THREE = T();
    try {
    // Reset building mesh registry so stale refs from a previous failed build don't linger
    _buildingMeshes = {};
    // Disconnect all MutationObservers from the previous scene build to prevent leaks
    while (_buildingObservers.length) _buildingObservers.pop().disconnect();
    _campScene = new THREE.Scene();
    _campScene.background = new THREE.Color(0x0a0c18); // deep night sky
    _campScene.fog = new THREE.FogExp2(0x120e08, 0.035); // heavy fog/mist for culling

    // ── Lighting ────────────────────────────────────────────
    // Warmer dim ambient – cozy sky light
    const ambient = new THREE.AmbientLight(0x2a3050, 0.55);
    _campScene.add(ambient);

    // Warm moonlight with better intensity
    const moonLight = new THREE.DirectionalLight(0x6080c0, 0.6);
    moonLight.position.set(-30, 60, -20);
    moonLight.castShadow = false;
    _campScene.add(moonLight);

    // Enhanced warm campfire point light (flickers each frame)
    _fireLight = new THREE.PointLight(0xff8a30, 6.5, 32, 2);
    _fireLight.position.set(0, 2, 0);
    _fireLight.castShadow = true;
    _fireLight.shadow.mapSize.setScalar(512);
    _campScene.add(_fireLight);

    // Secondary warm fill light (softer, from below, more orange)
    const fillLight = new THREE.PointLight(0xff6620, 2.2, 16, 2);
    fillLight.position.set(0, 0.4, 0);
    _campScene.add(fillLight);

    // ── Ground ──────────────────────────────────────────────
    _buildGround();

    // ── Campfire ────────────────────────────────────────────
    _buildCampfire();

    // ── Stars ───────────────────────────────────────────────
    _buildStars();

    // ── Atmospheric particles ───────────────────────────────
    _buildSparkSystem();
    _buildDustSystem();
    _buildFireflySystem();

    // ── Surrounding trees / scenery ─────────────────────────
    _buildAmbientForest();

    // ── Pooled fence around absolute map edge ───────────────
    _buildMapFence();

    // ── Spawn elevator (black cylinder with gold contours) ──
    _buildSpawnElevator();

    // ── Extra trees, branches, logs, and grass patches ──────
    _buildExtraVegetation();

    // ── Small reflection pond near campfire ─────────────────
    _buildCampPond();

    // ── Lake (Waterdrop's ultimate goal, south of forest ring) ──
    _buildLake();
    _buildLakeParticles();

    // ── Buildings ───────────────────────────────────────────
    for (const def of BUILDING_DEFS) {
      const grp = _buildBuilding(def);
      grp.visible = false; // hidden until _refreshBuildings() called
      _buildingMeshes[def.id] = grp;
      _campScene.add(grp);
    }

    // ── Torch / Lantern Lights between buildings ─────────
    _buildCampTorches();

    // ── Player character ─────────────────────────────────────
    _buildPlayer();

    // ── Benny NPC ────────────────────────────────────────────
    _buildBennyNPC();

    // ── Crashed UFO Debris + Alien Incubator Pod ─────────────
    _buildUFODebrisAndIncubator();

    // ── A.I.D.A Intro — Broken Robot + Chip ─────────────────
    _buildAidaIntroProps();

    // ── Camera ──────────────────────────────────────────────
    const aspect = window.innerWidth / window.innerHeight;
    _campCamera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
    _updateCamera(0);

    // Profile avatar sprite sheet disabled — no UI overlay allocated
    } catch (err) {
      console.error('[CampWorld] _buildScene() error:', err);
      throw err; // re-throw so warmUp/enter can reset _campScene for a clean retry
    }
  }

  // ── Profile avatar UI overlay (OrthographicCamera) ───────
  function _buildProfileAvatarUI(THREE) {
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Separate scene so it draws cleanly on top of the 3-D camp
    _uiScene  = new THREE.Scene();
    _uiCamera = new THREE.OrthographicCamera(
      -W / 2, W / 2,   // left, right
       H / 2, -H / 2,  // top, bottom
      0.1, 20           // near, far (positive values avoid confusing clipping)
    );
    _uiCamera.position.z = 10;

    // Dispose any previous GPU resources to avoid leaks on scene rebuild
    if (_avatarMaterial) { _avatarMaterial.dispose(); _avatarMaterial = null; }
    if (_avatarTexture)  { _avatarTexture.dispose();  _avatarTexture  = null; }

    _avatarTexture = new THREE.TextureLoader().load('assets/ui/idle-breathing-ui.png');
    _avatarTexture.colorSpace    = THREE.SRGBColorSpace;  // match renderer sRGB output
    _avatarTexture.magFilter     = THREE.NearestFilter;   // crisp pixel-art upscale
    _avatarTexture.minFilter     = THREE.NearestFilter;
    _avatarTexture.generateMipmaps = false;               // UI spritesheet does not need mip levels
    _avatarTexture.repeat.set(1 / 8, 1 / 4);             // 8 cols × 4 rows
    _avatarTexture.offset.set(0, 1 - 1 / 4);             // frame 0 = top-left

    _avatarMaterial = new THREE.SpriteMaterial({
      map:         _avatarTexture,
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
    });

    _profileAvatar = new THREE.Sprite(_avatarMaterial);
    _profileAvatar.scale.set(_AVATAR_SIZE, _AVATAR_SIZE, 1);
    // top-left corner: _AVATAR_MARGIN px from left/top edge (measured to sprite center)
    _profileAvatar.position.set(-W / 2 + _AVATAR_MARGIN, H / 2 - _AVATAR_MARGIN, 0);
    _uiScene.add(_profileAvatar);

    // Reset animation state
    _avatarFrame      = 0;
    _avatarFrameTimer = 0;
  }

  // Advance the avatar sprite sheet by one frame (time-based, not per-frame)
  function _updateProfileAvatar(dt) {
    if (!_avatarTexture) return;
    _avatarFrameTimer += dt;
    const frameDuration    = 1 / _AVATAR_FPS;
    const framesToAdvance  = Math.floor(_avatarFrameTimer / frameDuration);
    if (framesToAdvance > 0) {
      _avatarFrame      = (_avatarFrame + framesToAdvance) % 32;
      _avatarFrameTimer %= frameDuration;
    }
    const col = _avatarFrame % 8;
    const row = Math.floor(_avatarFrame / 8);
    _avatarTexture.offset.set(col / 8, 1 - (row + 1) / 4);
  }

  // ── Ground plane with dirt paths ────────────────────────
  function _buildGround() {
    const THREE = T();

    // Dark earthy ground
    const groundGeo  = new THREE.PlaneGeometry(100, 100, 30, 30);
    const groundMat  = new THREE.MeshPhongMaterial({
      color: 0x1a1208,
      emissive: 0x0a0604,
      emissiveIntensity: 0.1,
      shininess: 5
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    _campScene.add(ground);

    // Central dirt circle (around campfire)
    const dirtGeo = new THREE.CircleGeometry(6, 32);
    const dirtMat = new THREE.MeshPhongMaterial({
      color: 0x3d2410,
      emissive: 0x1e1208,
      emissiveIntensity: 0.1,
      shininess: 5,
      depthWrite: false
    });
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.05;
    _campScene.add(dirt);

    // Stone ring around firepit
    const stoneRingGeo = new THREE.RingGeometry(0.9, 1.35, 16);
    const stoneMat = new THREE.MeshPhongMaterial({
      color: 0x888070,
      emissive: 0x444038,
      emissiveIntensity: 0.1,
      shininess: 20,
      side: THREE.DoubleSide
    });
    const stoneRing = new THREE.Mesh(stoneRingGeo, stoneMat);
    stoneRing.rotation.x = -Math.PI / 2;
    stoneRing.position.y = 0.05;
    _campScene.add(stoneRing);

    // Individual stones on the ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 1.1;
      const sGeo = new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.1, 0);
      const sMat = new THREE.MeshPhongMaterial({
        color: 0x706858,
        emissive: 0x38342c,
        emissiveIntensity: 0.1,
        shininess: 15
      });
      const s = new THREE.Mesh(sGeo, sMat);
      s.position.set(Math.sin(a) * r, 0.1, Math.cos(a) * r);
      s.rotation.set(Math.random(), Math.random(), Math.random());
      s.castShadow = true;
      _campScene.add(s);
    }

    // Dirt paths radiating to each building
    const pathMat = new THREE.MeshPhongMaterial({
      color: 0x2e1c0e,
      emissive: 0x170e07,
      emissiveIntensity: 0.1,
      shininess: 5
    });
    for (const def of BUILDING_DEFS) {
      const dx = def.x;
      const dz = def.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);
      const pathGeo = new THREE.PlaneGeometry(1.2, dist - 5);
      const path = new THREE.Mesh(pathGeo, pathMat);
      path.rotation.x = -Math.PI / 2;
      path.rotation.z = -angle;
      // midpoint between campfire and building
      path.position.set(dx * 0.5, 0.015, dz * 0.5);
      _campScene.add(path);
    }
  }

  // ── Campfire ─────────────────────────────────────────────
  function _buildCampfire() {
    const THREE = T();

    // Logs (two crossing cylinders)
    const logMat = new THREE.MeshPhongMaterial({
      color: 0x3d2208,
      emissive: 0x1e1104,
      emissiveIntensity: 0.1,
      shininess: 10
    });
    for (let i = 0; i < 2; i++) {
      const logGeo = new THREE.CylinderGeometry(0.14, 0.18, 2.2, 8);
      const log = new THREE.Mesh(logGeo, logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i * Math.PI) / 2;
      log.position.y = 0.14;
      log.castShadow = true;
      _campScene.add(log);
    }

    // Embers (flat circle glow)
    const emberGeo = new THREE.CircleGeometry(0.7, 16);
    const emberMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.7
    });
    const embers = new THREE.Mesh(emberGeo, emberMat);
    embers.rotation.x = -Math.PI / 2;
    embers.position.y = 0.08;
    _campScene.add(embers);

    // Fire flames (multiple cones, stored for flicker animation)
    const flameColors = [0xff7700, 0xff4400, 0xffdd00, 0xff9900];
    const flameSizes  = [
      [0.25, 1.6],
      [0.18, 1.9],
      [0.20, 1.4],
      [0.10, 1.1],
    ];
    flameColors.forEach((col, i) => {
      const [r, h] = flameSizes[i];
      const flameGeo = new THREE.ConeGeometry(r, h, 8, 1, true);
      const flameMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(
        (Math.random() - 0.5) * 0.3,
        0.65 + h * 0.45,
        (Math.random() - 0.5) * 0.3
      );
      _flameMeshes.push(flame);
      _campScene.add(flame);
    });

    // A soft glow halo on ground
    const haloGeo = new THREE.CircleGeometry(4, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.08
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    _campScene.add(halo);

    // Enhanced ground glow rings (multiple pulsating rings)
    for (let g = 0; g < 3; g++) {
      const glowGeo = new THREE.CircleGeometry(1.5 + g * 1.2, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: g === 0 ? 0xff4400 : g === 1 ? 0xff7700 : 0xffaa00,
        transparent: true,
        opacity: 0.06 - g * 0.015,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const glowRing = new THREE.Mesh(glowGeo, glowMat);
      glowRing.rotation.x = -Math.PI / 2;
      glowRing.position.y = 0.01 + g * 0.005;
      _campScene.add(glowRing);
      _glowRings = _glowRings || [];
      _glowRings.push({ mesh: glowRing, baseMat: glowMat, phase: g * Math.PI * 0.67 });
    }

    // Smoke particle system
    const smokeCount = 20;
    const smokeGeo = new THREE.BufferGeometry();
    const smokePos = new Float32Array(smokeCount * 3);
    for (let s = 0; s < smokeCount; s++) {
      smokePos[s * 3] = 0; smokePos[s * 3 + 1] = -10; smokePos[s * 3 + 2] = 0;
    }
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: 0x888888,
      size: 0.6,
      transparent: true,
      opacity: 0.25,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    _smokeSystem = new THREE.Points(smokeGeo, smokeMat);
    _campScene.add(_smokeSystem);
    _smokePositions = smokePos;
    _smokeVelocities = [];
    _smokeLifetimes = [];
    for (let s = 0; s < smokeCount; s++) {
      _smokeLifetimes.push(0);
      _smokeVelocities.push({ x: (Math.random() - 0.5) * 0.3, y: 0.8 + Math.random() * 0.4, z: (Math.random() - 0.5) * 0.3 });
    }
  }

  // ── Small aesthetic reflection pond near campfire ────────
  function _buildCampPond() {
    const THREE = T();

    // Pond water surface — dark reflective ellipse (centered at origin, positioned via mesh.position)
    const pondGeo = new THREE.EllipseCurve(0, 0, 2.5, 1.5, 0, Math.PI * 2, false, 0);
    const pondShape = new THREE.Shape(pondGeo.getPoints(40));
    const pondPlaneGeo = new THREE.ShapeGeometry(pondShape);
    const pondMat = new THREE.MeshPhongMaterial({
      color: 0x001a2e, emissive: 0x001833, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.82, shininess: 200, specular: 0x88ccff,
      side: THREE.DoubleSide
    });
    const pond = new THREE.Mesh(pondPlaneGeo, pondMat);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-6, 0.04, 5);
    pond._pondSurface = true;
    _campScene.add(pond);

    // Pond edge stones (small pebbles)
    const pebblePositions = [
      [-7.8, 5.0], [-7.5, 4.0], [-7.0, 3.8], [-6.0, 3.7],
      [-5.0, 4.0], [-4.5, 5.0], [-4.8, 6.0], [-5.8, 6.5],
      [-7.0, 6.4], [-7.6, 5.8]
    ];
    pebblePositions.forEach(([px, pz]) => {
      const pGeo = new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 5, 4);
      const pMat = new THREE.MeshPhongMaterial({ color: 0x4a4a5a, emissive: 0x111111, emissiveIntensity: 0.1 });
      const pebble = new THREE.Mesh(pGeo, pMat);
      pebble.position.set(px, 0.05, pz);
      pebble.scale.set(1, 0.5, 1);
      _campScene.add(pebble);
    });

    // Soft water reflection light
    const pondLight = new THREE.PointLight(0x3388cc, 0.8, 8, 2);
    pondLight.position.set(-6, 0.5, 5);
    _campScene.add(pondLight);
  }

  // ── Star field ───────────────────────────────────────────
  function _buildStars() {
    const THREE = T();
    const starCount = 600;
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 80 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45; // upper hemisphere
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 10;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.35,
      transparent: true,
      opacity: 0.8
    });
    _starsMesh = new THREE.Points(starGeo, starMat);
    _campScene.add(_starsMesh);
  }

  // ── Spark / ember particle system ────────────────────────
  function _buildSparkSystem() {
    const THREE = T();
    const geo = new THREE.BufferGeometry();
    _sparkPositions = new Float32Array(SPARK_COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(_sparkPositions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffcc44,
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    _sparkSystem = new THREE.Points(geo, mat);
    _campScene.add(_sparkSystem);

    // Initialise all particles as "dead" (below ground)
    for (let i = 0; i < SPARK_COUNT; i++) {
      _sparkLifetimes.push(0);
      _sparkVelocities.push({ x: 0, y: 0, z: 0 });
      _sparkPositions[i * 3] = 0;
      _sparkPositions[i * 3 + 1] = -5;
      _sparkPositions[i * 3 + 2] = 0;
    }
  }

  // ── Green firefly particle system for cozy atmosphere ────
  function _buildFireflySystem() {
    const THREE = T();
    const geo = new THREE.BufferGeometry();
    _fireflyPositions = new Float32Array(FIREFLY_COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(_fireflyPositions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x88ff44,  // Bright green-yellow
      size: 0.15,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    _fireflySystem = new THREE.Points(geo, mat);
    _campScene.add(_fireflySystem);

    // Initialize fireflies around the camp perimeter and near trees
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      _fireflyLifetimes.push(Math.random() * 8 + 2); // 2-10 second lifetime
      _fireflyPhases.push(Math.random() * Math.PI * 2); // Random phase for pulsing
      _fireflyVelocities.push({
        x: (Math.random() - 0.5) * 0.6,
        y: (Math.random() - 0.5) * 0.3,
        z: (Math.random() - 0.5) * 0.6
      });
      // Spawn in a ring around camp (radius 15-30) at low height
      const r = 15 + Math.random() * 15;
      const a = Math.random() * Math.PI * 2;
      _fireflyPositions[i * 3]     = Math.sin(a) * r;
      _fireflyPositions[i * 3 + 1] = 1 + Math.random() * 2.5; // 1-3.5 height
      _fireflyPositions[i * 3 + 2] = Math.cos(a) * r;
    }
  }

  // ── Atmospheric dust ─────────────────────────────────────
  function _buildDustSystem() {
    const THREE = T();
    const geo = new THREE.BufferGeometry();
    _dustPositions = new Float32Array(DUST_COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(_dustPositions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffa060,
      size: 0.09,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    _dustSystem = new THREE.Points(geo, mat);
    _campScene.add(_dustSystem);

    for (let i = 0; i < DUST_COUNT; i++) {
      _dustLifetimes.push(Math.random() * 4);
      _dustVelocities.push({
        x: (Math.random() - 0.5) * 0.4,
        y: 0.15 + Math.random() * 0.3,
        z: (Math.random() - 0.5) * 0.4
      });
      const r = Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      _dustPositions[i * 3]     = Math.sin(a) * r;
      _dustPositions[i * 3 + 1] = Math.random() * 4;
      _dustPositions[i * 3 + 2] = Math.cos(a) * r;
    }
  }

  // ── Torch / Lantern system between buildings ────────────
  let _torchLights = [];
  // Alien pulsing lights (prismReliquary + astralGateway)
  let _alienLights = [];
  let _alienTime = 0;
  function _buildCampTorches() {
    const THREE = T();
    _torchLights = [];
    _alienLights = [];
    _alienTime = 0;
    // Place torch posts with warm point lights between building positions
    // Creates a cozy, non-electrical atmosphere around the camp
    const torchPositions = [
      // Path torches between buildings (x, z) — updated for new layout
      { x:  5, z:  3 },   // between campfire and special attacks / forge
      { x: -5, z:  3 },   // between campfire and forge
      { x:  0, z:  7 },   // path to Quest Hall
      { x: -6, z:  9 },   // path to Armory flank
      { x:  6, z:  9 },   // path to Progression House flank
      { x:  0, z: -6 },   // path south to shrine
      { x: -7, z: -1 },   // near companion house area
      { x:  7, z: -1 },   // near inventory
      { x:  0, z: 17 },   // path to Skill Tree / tavern / shop
      { x: -10, z: 16 },  // tavern approach
      { x:  10, z: 16 },  // shop approach
    ];

    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.9, metalness: 0.1 });
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xffaa33, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 });
    const flameGeo = new THREE.SphereGeometry(0.12, 6, 6);

    for (const tp of torchPositions) {
      // Torch post
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(tp.x, 0.8, tp.z);
      _campScene.add(post);

      // Flame mesh on top
      const flame = new THREE.Mesh(flameGeo, flameMat.clone());
      flame.position.set(tp.x, 1.7, tp.z);
      flame.scale.set(1, 1.5, 1);
      _campScene.add(flame);

      // Warm point light
      const torchLight = new THREE.PointLight(0xffaa44, 1.2, 8, 2);
      torchLight.position.set(tp.x, 1.8, tp.z);
      _campScene.add(torchLight);
      _torchLights.push({ light: torchLight, flame: flame, baseIntensity: 1.2 });
    }
  }

  // Flicker torch lights each frame for cozy animation
  function _updateTorchFlicker() {
    for (const t of _torchLights) {
      const flicker = 0.85 + Math.random() * 0.3; // 0.85–1.15
      t.light.intensity = t.baseIntensity * flicker;
      // Subtle flame scale wobble
      if (t.flame) {
        t.flame.scale.y = 1.3 + Math.random() * 0.4;
        t.flame.scale.x = 0.9 + Math.random() * 0.2;
      }
    }
  }

  // Pulse alien lights (prismReliquary + astralGateway) with slow sine wave
  function _updateAlienLights(dt) {
    _alienTime = (_alienTime + dt) % (Math.PI * 2 / 1.1);
    for (const al of _alienLights) {
      // Slow sine oscillation: 0.5–1.5x base intensity
      al.light.intensity = al.base * (1.0 + 0.45 * Math.sin(_alienTime * 1.1 + al.phase));
    }
  }

  // ── Ambient forest ring ──────────────────────────────────
  function _buildAmbientForest() {
    const THREE = T();
    const treeCount = 40;
    const treeColors = [0x1a4010, 0x143810, 0x0e2808, 0x224818];

    _treeMeshes = [];
    _treeOrigMaterials = [];

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2 + Math.random() * 0.3;
      const radius = 28 + Math.random() * 10;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const scale = 0.7 + Math.random() * 1.1;

      const grp = new THREE.Group();
      grp.position.set(x, 0, z);

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.15 * scale, 0.22 * scale, 1.8 * scale, 6);
      const trunkMat = new THREE.MeshPhongMaterial({
        color: 0x3d2208,
        emissive: 0x1e1104,
        emissiveIntensity: 0.1,
        shininess: 10
      });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.9 * scale;
      trunk.castShadow = true;
      grp.add(trunk);

      // Canopy (2 stacked cones)
      const col = treeColors[Math.floor(Math.random() * treeColors.length)];
      const canopyMat = new THREE.MeshPhongMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.12,
        shininess: 25
      });
      const canopyMeshes = [];
      const origMats = [];
      for (let c = 0; c < 2; c++) {
        const cr = (1.2 - c * 0.3) * scale;
        const ch = (1.6 - c * 0.3) * scale;
        const canopyGeo = new THREE.ConeGeometry(cr, ch, 7);
        const mat = canopyMat.clone();
        const canopy = new THREE.Mesh(canopyGeo, mat);
        canopy.position.y = (1.8 + c * 1.0) * scale;
        canopy.castShadow = true;
        grp.add(canopy);
        canopyMeshes.push(canopy);
        origMats.push(mat);
      }
      _campScene.add(grp);
      _treeMeshes.push(grp);
      _treeOrigMaterials.push({ canopies: canopyMeshes, origMats });
    }
  }

  // ── Pooled fence around absolute map edge (wooden slanted stakes + wall) ──
  // Uses a single InstancedMesh pool for all stakes to minimize draw calls.
  function _buildMapFence() {
    const THREE = T();
    const MAP_RADIUS = 55;
    const STAKE_COUNT = 120;
    const stakeGeo = new THREE.CylinderGeometry(0.08, 0.14, 2.8, 6);
    const stakeMat = new THREE.MeshPhongMaterial({
      color: 0x5c3a1e,
      emissive: 0x1a0e04,
      emissiveIntensity: 0.08,
      shininess: 8,
    });
    const stakePool = new THREE.InstancedMesh(stakeGeo, stakeMat, STAKE_COUNT);
    stakePool.castShadow = true;
    const _mat4 = new THREE.Matrix4();
    const _pos = new THREE.Vector3();
    const _quat = new THREE.Quaternion();
    const _scale = new THREE.Vector3();

    for (let i = 0; i < STAKE_COUNT; i++) {
      const angle = (i / STAKE_COUNT) * Math.PI * 2;
      const x = Math.sin(angle) * MAP_RADIUS;
      const z = Math.cos(angle) * MAP_RADIUS;
      const slant = 0.15 + Math.random() * 0.1; // slight outward lean
      _pos.set(x, 1.2, z);
      _quat.setFromAxisAngle(new THREE.Vector3(-Math.cos(angle), 0, Math.sin(angle)), slant);
      _scale.set(0.8 + Math.random() * 0.4, 0.9 + Math.random() * 0.3, 0.8 + Math.random() * 0.4);
      _mat4.compose(_pos, _quat, _scale);
      stakePool.setMatrixAt(i, _mat4);
    }
    stakePool.instanceMatrix.needsUpdate = true;
    _campScene.add(stakePool);

    // Horizontal crossbar wall ring (two rings at different heights)
    for (let h = 0; h < 2; h++) {
      const ringY = 0.6 + h * 1.0;
      const ringGeo = new THREE.TorusGeometry(MAP_RADIUS, 0.06, 4, STAKE_COUNT);
      const ringMat = new THREE.MeshPhongMaterial({
        color: 0x4a2e14,
        emissive: 0x0e0804,
        emissiveIntensity: 0.05,
        shininess: 5,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ringY;
      ring.castShadow = true;
      _campScene.add(ring);
    }
  }

  // ── Spawn elevator – black cylinder with gold/silver contours ──
  function _buildSpawnElevator() {
    const THREE = T();
    const ELEV_POS = { x: 0, y: 0, z: 6 }; // near spawn point

    // Main cylinder body — matte black, partially submerged
    const bodyGeo = new THREE.CylinderGeometry(1.2, 1.2, 3.0, 24, 1, true); // open-ended
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x0a0a0a,
      emissive: 0x050505,
      emissiveIntensity: 0.05,
      shininess: 30,
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(ELEV_POS.x, ELEV_POS.y - 0.5, ELEV_POS.z);
    _campScene.add(body);

    // Gold contour rings
    for (let r = 0; r < 3; r++) {
      const ringGeo = new THREE.TorusGeometry(1.22, 0.03, 8, 32);
      const ringMat = new THREE.MeshPhongMaterial({
        color: 0xccaa44,
        emissive: 0x665520,
        emissiveIntensity: 0.3,
        shininess: 100,
        specular: 0xffdd88,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(ELEV_POS.x, ELEV_POS.y - 0.8 + r * 0.8, ELEV_POS.z);
      _campScene.add(ring);
    }

    // Door contour lines (silver vertical strips)
    const doorGeo = new THREE.BoxGeometry(0.04, 2.0, 0.04);
    const doorMat = new THREE.MeshPhongMaterial({
      color: 0xaaaaaa,
      emissive: 0x444444,
      emissiveIntensity: 0.2,
      shininess: 80,
      specular: 0xffffff,
    });
    for (let d = 0; d < 2; d++) {
      const doorLine = new THREE.Mesh(doorGeo, doorMat);
      const dx = (d === 0 ? -0.35 : 0.35);
      doorLine.position.set(ELEV_POS.x + dx, ELEV_POS.y, ELEV_POS.z + 1.2);
      _campScene.add(doorLine);
    }
    // Horizontal door frame
    const framGeo = new THREE.BoxGeometry(0.74, 0.04, 0.04);
    const topFrame = new THREE.Mesh(framGeo, doorMat);
    topFrame.position.set(ELEV_POS.x, ELEV_POS.y + 0.95, ELEV_POS.z + 1.2);
    _campScene.add(topFrame);
  }

  // ── Extra trees, branches, logs, and grass patches ──
  // Carefully placed to avoid overlapping existing structures.
  function _buildExtraVegetation() {
    const THREE = T();

    // ─ Fallen logs (pooled via InstancedMesh) ─
    const logGeo = new THREE.CylinderGeometry(0.12, 0.16, 2.4, 8);
    const logMat = new THREE.MeshPhongMaterial({
      color: 0x3d2208,
      emissive: 0x1e1104,
      emissiveIntensity: 0.08,
      shininess: 8,
    });
    const LOG_DATA = [
      { x: 12, z: -8, ry: 0.4 },
      { x: -15, z: -12, ry: 1.2 },
      { x: 20, z: 5, ry: -0.7 },
      { x: -22, z: 10, ry: 2.1 },
      { x: 8, z: -25, ry: 0.9 },
      { x: -10, z: -30, ry: 1.8 },
    ];
    const logPool = new THREE.InstancedMesh(logGeo, logMat, LOG_DATA.length);
    const _m4 = new THREE.Matrix4();
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < LOG_DATA.length; i++) {
      const d = LOG_DATA[i];
      _p.set(d.x, 0.08, d.z);
      _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.ry));
      _m4.compose(_p, _q, _s);
      logPool.setMatrixAt(i, _m4);
    }
    logPool.instanceMatrix.needsUpdate = true;
    logPool.castShadow = true;
    _campScene.add(logPool);

    // ─ Extra scattered trees (inner ring, between buildings) ─
    // Shared geometry and materials to minimize draw-call / material state changes
    const extraTreeColors = [0x1a4010, 0x143810, 0x0e2808, 0x2a5818];
    const _sharedTrunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.8, 6);
    const _sharedTrunkMat = new THREE.MeshPhongMaterial({ color: 0x3d2208, emissive: 0x1e1104, emissiveIntensity: 0.1, shininess: 10 });
    const _sharedCanopyGeos = [
      new THREE.ConeGeometry(1.2, 1.6, 7),
      new THREE.ConeGeometry(0.9, 1.3, 7),
    ];
    const _sharedCanopyMats = extraTreeColors.map(function (col) {
      return new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.12, shininess: 25 });
    });
    const EXTRA_TREES = [
      { x: 18, z: -18, s: 0.8 },
      { x: -16, z: -22, s: 1.0 },
      { x: 22, z: 12, s: 0.7 },
      { x: -20, z: 15, s: 0.9 },
      { x: 5, z: -35, s: 1.1 },
      { x: -8, z: -38, s: 0.85 },
      { x: 25, z: -5, s: 0.75 },
      { x: -25, z: -8, s: 0.95 },
    ];
    for (let i = 0; i < EXTRA_TREES.length; i++) {
      const t = EXTRA_TREES[i];
      const grp = new THREE.Group();
      grp.position.set(t.x, 0, t.z);
      // Trunk — shared geometry + material, scaled per instance
      const trunk = new THREE.Mesh(_sharedTrunkGeo, _sharedTrunkMat);
      trunk.scale.setScalar(t.s);
      trunk.position.y = 0.9 * t.s;
      trunk.castShadow = true;
      grp.add(trunk);
      // Canopy — shared geometries + materials, scaled per instance
      const canopyMat = _sharedCanopyMats[i % _sharedCanopyMats.length];
      for (let c = 0; c < 2; c++) {
        const canopy = new THREE.Mesh(_sharedCanopyGeos[c], canopyMat);
        canopy.scale.setScalar(t.s);
        canopy.position.y = (1.8 + c * 1.0) * t.s;
        canopy.castShadow = true;
        grp.add(canopy);
      }
      _campScene.add(grp);
    }

    // ─ Grass patches (pooled InstancedMesh) ─
    const bladeGeo = new THREE.PlaneGeometry(0.08, 0.35);
    const grassMat = new THREE.MeshPhongMaterial({
      color: 0x2a5c18,
      emissive: 0x0a2008,
      emissiveIntensity: 0.08,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const GRASS_COUNT = 200;
    const grassPool = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_COUNT);
    for (let g = 0; g < GRASS_COUNT; g++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 42;
      const gx = Math.sin(angle) * r;
      const gz = Math.cos(angle) * r;
      // Skip if too close to lake or campfire center
      const distToLake = Math.sqrt((gx - LAKE_POS.x) * (gx - LAKE_POS.x) + (gz - LAKE_POS.z) * (gz - LAKE_POS.z));
      const distToCenter = Math.sqrt(gx * gx + gz * gz);
      if (distToLake < 24 || distToCenter < 4) { // skip, leave identity matrix (hidden at origin)
        _m4.makeScale(0, 0, 0);
        grassPool.setMatrixAt(g, _m4);
        continue;
      }
      _p.set(gx, 0.15, gz);
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      _s.set(0.8 + Math.random() * 0.5, 0.7 + Math.random() * 0.6, 1);
      _m4.compose(_p, _q, _s);
      grassPool.setMatrixAt(g, _m4);
    }
    grassPool.instanceMatrix.needsUpdate = true;
    _campScene.add(grassPool);

    // ─ Branches (small fallen twigs, pooled) ─
    const branchGeo = new THREE.CylinderGeometry(0.02, 0.04, 0.8, 4);
    const branchMat = new THREE.MeshPhongMaterial({ color: 0x4a3018, shininess: 5 });
    const BRANCH_COUNT = 30;
    const branchPool = new THREE.InstancedMesh(branchGeo, branchMat, BRANCH_COUNT);
    for (let b = 0; b < BRANCH_COUNT; b++) {
      const bAngle = Math.random() * Math.PI * 2;
      const bR = 6 + Math.random() * 38;
      _p.set(Math.sin(bAngle) * bR, 0.02, Math.cos(bAngle) * bR);
      _q.setFromEuler(new THREE.Euler(Math.random() * 0.3, Math.random() * Math.PI, Math.PI / 2 + Math.random() * 0.2));
      _s.set(1, 1, 1);
      _m4.compose(_p, _q, _s);
      branchPool.setMatrixAt(b, _m4);
    }
    branchPool.instanceMatrix.needsUpdate = true;
    _campScene.add(branchPool);
  }

  // ── Lake — Large beautiful lake at the very north/top of the map ──
  function _buildLake() {
    const THREE = T();

    // Large dark-blue reflective lake surface with enhanced moon reflection
    const lakeGeo = new THREE.CircleGeometry(20, 64);
    const lakeMat = new THREE.MeshPhongMaterial({
      color: 0x1a3a5c,
      emissive: 0x0d1d2e,
      emissiveIntensity: 0.18,
      shininess: 140,
      specular: 0x88aaff,
      transparent: true,
      opacity: 0.90,
    });
    _lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
    _lakeMesh.rotation.x = -Math.PI / 2;
    _lakeMesh.position.set(LAKE_POS.x, 0.01, LAKE_POS.z);
    _lakeMesh.receiveShadow = false;
    _campScene.add(_lakeMesh);

    // Enhanced blue lake glow
    _lakeLight = new THREE.PointLight(0x3388cc, 2.0, 40, 2);
    _lakeLight.position.set(LAKE_POS.x, 2, LAKE_POS.z);
    _campScene.add(_lakeLight);

    // Shore ring – larger to match new lake size
    const shoreGeo = new THREE.RingGeometry(20, 23, 64);
    const shoreMat = new THREE.MeshPhongMaterial({
      color: 0x2a4010,
      emissive: 0x152008,
      emissiveIntensity: 0.1,
      shininess: 15,
      side: THREE.DoubleSide,
    });
    const shore = new THREE.Mesh(shoreGeo, shoreMat);
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(LAKE_POS.x, 0.005, LAKE_POS.z);
    _campScene.add(shore);

    // Mist/fog layer hovering over lake for atmosphere and culling
    const mistGeo = new THREE.PlaneGeometry(50, 50);
    const mistMat = new THREE.MeshBasicMaterial({
      color: 0x88aacc,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mist = new THREE.Mesh(mistGeo, mistMat);
    mist.rotation.x = -Math.PI / 2;
    mist.position.set(LAKE_POS.x, 0.8, LAKE_POS.z);
    _campScene.add(mist);
  }

  // ── Lake binary-code particle system (active only at corruption tier 3) ──
  function _buildLakeParticles() {
    const THREE = T();
    const count = LAKE_PARTICLE_COUNT;
    const geo = new THREE.BufferGeometry();
    _lakeParticlePositions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = Math.random() * 10;
      const a = Math.random() * Math.PI * 2;
      _lakeParticlePositions[i * 3]     = LAKE_POS.x + Math.cos(a) * r;
      _lakeParticlePositions[i * 3 + 1] = -5; // start below ground (hidden)
      _lakeParticlePositions[i * 3 + 2] = LAKE_POS.z + Math.sin(a) * r;
      _lakeParticleVelocities.push(0.4 + Math.random() * 0.9);
      _lakeParticleLifetimes.push(Math.random() * 5);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(_lakeParticlePositions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xff1100,
      size: 0.22,
      transparent: true,
      opacity: 0.0, // invisible until tier 3 corruption is applied
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    _lakeParticles = new THREE.Points(geo, mat);
    _campScene.add(_lakeParticles);
  }

  // ── Player water-drop (exact match of in-game character) ──
  function _buildPlayer() {
    const THREE = T();
    const grp = new THREE.Group();

    // Body — chunky waterdrop matching spritesheet (wide bottom, curved tip)
    const bodyGeo = new THREE.SphereGeometry(PLAYER_RADIUS, 16, 12);
    const positions = bodyGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i);
      let x = positions.getX(i);
      let z = positions.getZ(i);
      if (y > 0) {
        // Stretch top into a pointed tip
        positions.setY(i, y * 1.35);
        const t = y / PLAYER_RADIUS; // 0..1
        const squeeze = 1 - t * 0.55; // narrow more dramatically at top
        positions.setX(i, x * squeeze);
        positions.setZ(i, z * squeeze);
        // Bend the tip to one side (like spritesheet curved point)
        if (t > 0.5) {
          const bend = (t - 0.5) * 2.0; // 0..1 in upper half
          positions.setX(i, positions.getX(i) + bend * 0.18);
          positions.setZ(i, positions.getZ(i) - bend * 0.06);
        }
      } else {
        // Widen the bottom for chunky squat shape
        const bulge = 1 + Math.abs(y / PLAYER_RADIUS) * 0.15;
        positions.setX(i, x * bulge);
        positions.setZ(i, z * bulge);
      }
    }
    bodyGeo.computeVertexNormals();

    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x4FC3F7,       // match COLORS.player
      emissive: 0x0d47a1,
      emissiveIntensity: 0.3,
      shininess: 90,
      transparent: true,
      opacity: 0.85
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    grp.add(body);

    // Shiny highlight (water reflection)
    const hlGeo = new THREE.SphereGeometry(PLAYER_RADIUS * 0.28, 8, 8);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(-0.18, 0.25, 0.18);
    grp.add(hl);

    // Glow shell
    const glowGeo = new THREE.SphereGeometry(PLAYER_RADIUS + 0.04, 16, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4FC3F7, transparent: true, opacity: 0.15, side: THREE.BackSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    grp.add(glow);

    // Eye whites — larger to match spritesheet's prominent eyes
    const eyeWhiteGeo = new THREE.SphereGeometry(0.13, 8, 8);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const leftEyeW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    leftEyeW.position.set(-0.16, 0.08, 0.40);
    grp.add(leftEyeW);
    const rightEyeW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    rightEyeW.position.set(0.16, 0.08, 0.40);
    grp.add(rightEyeW);

    // Red eyes — big and bold matching spritesheet
    const eyeGeo = new THREE.SphereGeometry(0.10, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xCC2222 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.16, 0.08, 0.43);
    grp.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.16, 0.08, 0.43);
    grp.add(rightEye);

    // Pupils
    const pupilGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x220000 });
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(-0.16, 0.08, 0.47);
    grp.add(leftPupil);
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0.16, 0.08, 0.47);
    grp.add(rightPupil);

    // Angry brows — thick and prominent matching spritesheet
    const browGeo = new THREE.BoxGeometry(0.14, 0.035, 0.04);
    const browMat = new THREE.MeshBasicMaterial({ color: 0x1565C0 });
    const leftBrow = new THREE.Mesh(browGeo, browMat);
    leftBrow.position.set(-0.16, 0.18, 0.42);
    leftBrow.rotation.z = 0.30;
    grp.add(leftBrow);
    const rightBrow = new THREE.Mesh(browGeo, browMat);
    rightBrow.position.set(0.16, 0.18, 0.42);
    rightBrow.rotation.z = -0.30;
    grp.add(rightBrow);

    // Mouth — small determined frown
    const mouthGeo = new THREE.BoxGeometry(0.10, 0.02, 0.025);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x1a3a5a });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, -0.06, 0.44);
    grp.add(mouth);

    // Cigar — brown cylinder body + orange ember end, matching spritesheet
    const cigarMat = new THREE.MeshPhongMaterial({ color: 0x8B6914, shininess: 20 });
    const cigarGeo = new THREE.CylinderGeometry(0.025, 0.022, 0.22, 8);
    const cigar = new THREE.Mesh(cigarGeo, cigarMat);
    cigar.rotation.z = -0.3;
    cigar.rotation.x = Math.PI / 2;
    cigar.position.set(0.12, -0.04, 0.50);
    grp.add(cigar);
    // Cigar lit tip (orange ember)
    const emberGeo = new THREE.SphereGeometry(0.028, 6, 6);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xFF6600 });
    const ember = new THREE.Mesh(emberGeo, emberMat);
    ember.position.set(0.22, -0.01, 0.50);
    grp.add(ember);

    // Head bandage wrap — positioned higher around curved tip matching spritesheet
    const bandageMat = new THREE.MeshPhongMaterial({
      color: 0xF5DEB3, emissive: 0x8B7355, emissiveIntensity: 0.1, shininess: 10
    });
    const wrapGeo = new THREE.TorusGeometry(0.34, 0.055, 6, 16);
    const wrap = new THREE.Mesh(wrapGeo, bandageMat);
    wrap.position.set(0.04, 0.35, 0);
    wrap.rotation.x = Math.PI / 2;
    wrap.rotation.z = 0.20;
    grp.add(wrap);
    // Second wrap band for thicker look
    const wrap2Geo = new THREE.TorusGeometry(0.30, 0.04, 6, 16);
    const wrap2 = new THREE.Mesh(wrap2Geo, bandageMat);
    wrap2.position.set(0.06, 0.42, 0);
    wrap2.rotation.x = Math.PI / 2;
    wrap2.rotation.z = 0.10;
    grp.add(wrap2);

    // Bandage tail — hangs from the back of the wrap
    const tailGeo = new THREE.BoxGeometry(0.08, 0.28, 0.035);
    const tail = new THREE.Mesh(tailGeo, bandageMat);
    tail.position.set(-0.22, 0.22, -0.18);
    tail.rotation.z = 0.35;
    grp.add(tail);
    _playerBandageTail = tail;

    // Arms — thick and stubby with rounded fist ends matching spritesheet
    const armGeo = new THREE.CylinderGeometry(0.06, 0.10, 0.24, 8);
    const limbMat = new THREE.MeshPhongMaterial({
      color: 0x4FC3F7, emissive: 0x0d47a1, emissiveIntensity: 0.15,
      transparent: true, opacity: 0.85
    });

    const leftArm = new THREE.Mesh(armGeo, limbMat);
    leftArm.position.set(-0.38, -0.04, 0.05);
    leftArm.rotation.z = Math.PI / 5;
    grp.add(leftArm);
    _playerLeftArm = leftArm;
    // Left fist
    const fistGeo = new THREE.SphereGeometry(0.10, 8, 8);
    const leftFist = new THREE.Mesh(fistGeo, limbMat);
    leftFist.position.set(-0.44, -0.18, 0.05);
    grp.add(leftFist);

    const rightArm = new THREE.Mesh(armGeo, limbMat);
    rightArm.position.set(0.38, -0.04, 0.05);
    rightArm.rotation.z = -Math.PI / 5;
    grp.add(rightArm);
    _playerRightArm = rightArm;
    // Right fist
    const rightFist = new THREE.Mesh(fistGeo, limbMat);
    rightFist.position.set(0.44, -0.18, 0.05);
    grp.add(rightFist);

    // Gun (held by right arm)
    const gunBodyGeo = new THREE.BoxGeometry(0.10, 0.14, 0.30);
    const gunMat = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 40 });
    const gunBody = new THREE.Mesh(gunBodyGeo, gunMat);
    gunBody.position.set(0.38, -0.06, 0.30);
    grp.add(gunBody);
    _playerGunBody = gunBody;

    // Gun barrel
    const barrelGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.26, 8);
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.38, -0.06, 0.50);
    grp.add(barrel);

    // Gun handle
    const handleGeo = new THREE.BoxGeometry(0.06, 0.16, 0.08);
    const handleMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0.38, -0.20, 0.22);
    handle.rotation.z = -Math.PI / 6;
    grp.add(handle);

    // Legs — short and thick matching spritesheet's stubby legs
    const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.24, 8);
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLeg.position.set(-0.16, -0.42, 0);
    grp.add(leftLeg);
    _playerLeftLeg = leftLeg;
    // Left foot
    const footGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const leftFoot = new THREE.Mesh(footGeo, limbMat);
    leftFoot.position.set(-0.16, -0.54, 0.02);
    leftFoot.scale.set(1, 0.6, 1.2);
    grp.add(leftFoot);

    const rightLeg = new THREE.Mesh(legGeo, limbMat);
    rightLeg.position.set(0.16, -0.42, 0);
    grp.add(rightLeg);
    _playerRightLeg = rightLeg;
    // Right foot
    const rightFoot = new THREE.Mesh(footGeo, limbMat);
    rightFoot.position.set(0.16, -0.54, 0.02);
    rightFoot.scale.set(1, 0.6, 1.2);
    grp.add(rightFoot);

    // Ground shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.45, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.3,
      depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.01
    });
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = -PLAYER_RADIUS + 0.02;
    grp.add(shadowDisc);

    grp.position.set(_playerPos.x, PLAYER_RADIUS, _playerPos.z);
    _playerMesh = grp;
    _campScene.add(grp);

    // Sprite overlay disabled — spritesheet PNGs lack alpha transparency,
    // causing a large opaque square to render over the 3D character.
    // _initSpriteOverlay();
  }

  // ── Sprite overlay initialization ─────────────────────────
  function _initSpriteOverlay() {
    if (!window.SpriteAnimator || !_playerMesh) return;
    _spriteAnimator = new window.SpriteAnimator(_campScene);
    _spriteAnimator.load().then(() => {
      const spriteMesh = _spriteAnimator.createMesh(1.8);
      if (spriteMesh) {
        spriteMesh.position.y = 0.3; // center on character
        _playerMesh.add(spriteMesh);
        _spriteAnimator.setVisible(true);
        _spriteAnimator.play('idle');
      }
    }).catch(() => {
      // Spritesheets not available — no overlay; 3D character still works
      _spriteAnimator = null;
    });
  }

  // ── A.I.D.A Terminal NPC ─────────────────────────────────────
  // ── Crashed UFO Debris + Alien Incubator Pod ─────────────────────────────
  function _buildUFODebrisAndIncubator() {
    const THREE = T();
    const grp = new THREE.Group();

    // ── Crashed UFO hull fragment ──────────────────────────────────────────
    // Flattened disc shape, cracked and scorched
    const hullGeo = new THREE.TorusGeometry(1.6, 0.35, 8, 24);
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x556677, metalness: 0.85, roughness: 0.35,
      emissive: 0x001122, emissiveIntensity: 0.3
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.x = Math.PI / 2 + 0.4; // Tilted — crash angle
    hull.rotation.z = 0.3;
    hull.position.set(0, 0.3, 0);
    hull.castShadow = true;
    grp.add(hull);

    // Cockpit dome (cracked)
    const domeGeo = new THREE.SphereGeometry(0.7, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const domeMat = new THREE.MeshPhysicalMaterial({
      color: 0x88aacc, transparent: true, opacity: 0.55,
      metalness: 0.1, roughness: 0.05, transmission: 0.3
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(-0.2, 0.55, 0);
    dome.rotation.z = 0.25;
    grp.add(dome);

    // Scorch marks on ground beneath crash site
    const scorchGeo = new THREE.CircleGeometry(2.4, 20);
    const scorchMat = new THREE.MeshBasicMaterial({
      color: 0x110808, transparent: true, opacity: 0.7, depthWrite: false
    });
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.015;
    grp.add(scorch);

    // Debris chunks scattered around
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 5; i++) {
      const dGeo = new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.18, 0);
      const d = new THREE.Mesh(dGeo, debrisMat);
      const angle = (i / 5) * Math.PI * 2;
      d.position.set(Math.cos(angle) * (1.8 + Math.random() * 1.0), 0.05, Math.sin(angle) * (1.8 + Math.random() * 1.0));
      d.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      d.castShadow = true;
      grp.add(d);
    }

    // Alien glowing core (exposed energy cell)
    const coreGeo = new THREE.OctahedronGeometry(0.22, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.85
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0.6, 0.55, 0.2);
    core._ufoCoreGlow = true;
    grp.add(core);

    // Faint green light from crash site
    const ufoLight = new THREE.PointLight(0x00ffcc, 1.2, 8, 2);
    ufoLight.position.set(0, 1.2, 0);
    grp.add(ufoLight);
    grp._ufoLight = ufoLight;

    grp.position.set(INCUBATOR_POS.x - 3, 0, INCUBATOR_POS.z - 1);
    _campScene.add(grp);

    // ── Incubator Pod ─────────────────────────────────────────────────────
    const podGrp = new THREE.Group();

    // Pod base ring
    const podBaseGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.2, 12);
    const podBaseMat = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.9, roughness: 0.2 });
    const podBase = new THREE.Mesh(podBaseGeo, podBaseMat);
    podBase.position.y = 0.1;
    podGrp.add(podBase);

    // Pod chamber (translucent egg-shaped capsule)
    const podGeo = new THREE.SphereGeometry(0.5, 10, 14);
    podGeo.scale(0.9, 1.4, 0.9);
    const podMat = new THREE.MeshPhysicalMaterial({
      color: 0x33aaff, transparent: true, opacity: 0.45,
      metalness: 0.05, roughness: 0.05, transmission: 0.5,
      emissive: 0x003366, emissiveIntensity: 0.4
    });
    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.y = 0.85;
    pod._incubatorPod = true;
    podGrp.add(pod);

    // Tech struts on pod
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.85, roughness: 0.3 });
    for (let s = 0; s < 4; s++) {
      const sAngle = (s / 4) * Math.PI * 2;
      const strutGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5);
      const strut = new THREE.Mesh(strutGeo, strutMat);
      strut.position.set(Math.cos(sAngle) * 0.48, 0.55, Math.sin(sAngle) * 0.48);
      strut.rotation.z = Math.PI / 12;
      podGrp.add(strut);
    }

    // Pulsing light inside pod
    const podLight = new THREE.PointLight(0x3399ff, 0.8, 3, 2);
    podLight.position.set(0, 0.85, 0);
    podGrp._podLight = podLight;
    podGrp.add(podLight);

    // Label sign
    const signGeo = new THREE.BoxGeometry(1.1, 0.35, 0.08);
    const signMat = new THREE.MeshStandardMaterial({ color: 0x0d0d1a, metalness: 0.7 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 0.18, 0.65);
    podGrp.add(sign);

    podGrp.position.set(INCUBATOR_POS.x, 0, INCUBATOR_POS.z);
    _incubatorMesh = podGrp;
    _campScene.add(podGrp);
  }

  // ── A.I.D.A Intro — Broken Robot + Glowing Chip ─────────
  function _buildAidaIntroProps() {
    const THREE = T();
    const sd = window.saveData;
    const introState = (sd && sd.aidaIntroState) || {};

    // ─ Broken Robot ─────────────────────────────────────────
    const robotGrp = new THREE.Group();
    const metalMat  = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.55, metalness: 0.75 });
    const darkMat   = new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.7, metalness: 0.5 });

    // Body (slightly tilted — looks broken/slumped)
    const bodyGeo = new THREE.BoxGeometry(0.7, 0.9, 0.45);
    const body = new THREE.Mesh(bodyGeo, metalMat);
    body.position.set(0, 0.55, 0);
    body.rotation.z = 0.18; // slump to the side
    body.castShadow = true;
    robotGrp.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.45, 0.4, 0.42);
    const head = new THREE.Mesh(headGeo, metalMat);
    head.position.set(0.08, 1.18, 0);
    head.rotation.z = 0.25; // drooping
    head.castShadow = true;
    robotGrp.add(head);

    // Eye sockets (dark — offline)
    const eyeGeo  = new THREE.BoxGeometry(0.09, 0.06, 0.05);
    const eyeMat  = new THREE.MeshBasicMaterial({ color: 0x110011 }); // eyes are off
    [-0.1, 0.1].forEach(ox => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0.08 + ox, 1.2, 0.22);
      robotGrp.add(eye);
    });

    // Left arm (fallen to ground)
    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
    const leftArm = new THREE.Mesh(armGeo, darkMat);
    leftArm.position.set(-0.55, 0.25, 0);
    leftArm.rotation.z = -1.2;
    leftArm.castShadow = true;
    robotGrp.add(leftArm);

    // Right arm (hanging)
    const rightArm = new THREE.Mesh(armGeo, darkMat);
    rightArm.position.set(0.55, 0.45, 0);
    rightArm.rotation.z = 0.8;
    rightArm.castShadow = true;
    robotGrp.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.55, 0.22);
    [-0.2, 0.2].forEach((ox, i) => {
      const leg = new THREE.Mesh(legGeo, darkMat);
      leg.position.set(ox, 0.12, 0);
      leg.rotation.z = i === 0 ? -0.1 : 0.15;
      leg.castShadow = true;
      robotGrp.add(leg);
    });

    robotGrp.position.set(AIDA_ROBOT_POS.x, 0, AIDA_ROBOT_POS.z);
    robotGrp.scale.set(0.65, 0.65, 0.65); // Scaled down to fit scene better
    robotGrp._isAidaRobot = true;
    _aidaRobotMesh = robotGrp;
    _robotMesh = robotGrp;
    _campScene.add(robotGrp);

    // ─ Aida Chip ────────────────────────────────────────────
    // Small glowing microchip lying on the ground near the robot.
    // Hidden once picked up.
    const chipGrp = new THREE.Group();

    const chipBodyGeo = new THREE.BoxGeometry(0.28, 0.06, 0.22);
    const chipMat = new THREE.MeshStandardMaterial({
      color: 0x00ccff,
      emissive: 0x00aaff,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.8,
    });
    const chipBody = new THREE.Mesh(chipBodyGeo, chipMat);
    chipBody._aidaChipBody = true;
    chipGrp.add(chipBody);

    // Small glow disc underneath
    const glowGeo = new THREE.CircleGeometry(0.28, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.45 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.04;
    chipGrp.add(glow);

    // Point light so the chip illuminates the ground around it
    const chipLight = new THREE.PointLight(0x00aaff, 1.2, 3, 2);
    chipLight.position.y = 0.2;
    chipGrp.add(chipLight);

    chipGrp.position.set(AIDA_CHIP_POS.x, 0.06, AIDA_CHIP_POS.z);
    chipGrp._isAidaChip = true;
    chipGrp.visible = !introState.chipPickedUp; // hide if already picked up
    _aidaChipMesh = chipGrp;
    _campScene.add(chipGrp);

    // Sync session state with saveData
    _aidaIntroState.chipPickedUp = !!introState.chipPickedUp;
    _aidaIntroState.chipInserted = !!introState.chipInserted;

    // If chip already inserted, robot eyes should be on
    if (_aidaIntroState.chipInserted) {
      _aidaRobotEyesOn(true);
      // If Quest Hall is already built, park AIDA in front of it instead of the campfire
      const qmData = sd && sd.campBuildings && sd.campBuildings.questMission;
      if (qmData && qmData.level > 0) {
        robotGrp.position.set(AIDA_QUEST_HALL_POS.x, 0, AIDA_QUEST_HALL_POS.z);
      }
    }
  }

  // Turn the robot's eye meshes on (glowing) or off
  function _aidaRobotEyesOn(on) {
    if (!_aidaRobotMesh) return;
    _aidaRobotMesh.traverse(function (child) {
      if (child.isMesh && child.material && child.material.color) {
        const col = child.material.color.getHex();
        if (col === 0x110011 || col === 0x00ccff) {
          child.material.color.set(on ? 0x00ccff : 0x110011);
          if (on) {
            if (!child.material.emissive) child.material.emissive = new (T().Color)();
            child.material.emissive.set(0x0088ff);
            child.material.emissiveIntensity = 1.5;
          } else {
            if (child.material.emissive) child.material.emissive.set(0x000000);
            child.material.emissiveIntensity = 0;
          }
        }
      }
    });
  }

  // ── Robot floating speech bubble ─────────────────────────────
  // Shown above the broken robot before the chip is picked up, so players know what to do.
  function _ensureRobotBubble() {
    if (_robotBubbleEl) return;
    _robotBubbleEl = document.createElement('div');
    _robotBubbleEl.id = 'camp-robot-bubble';
    _robotBubbleEl.style.cssText = [
      'position:fixed', 'z-index:220', 'padding:10px 18px', 'border-radius:14px',
      'background:rgba(0,20,30,0.92)', 'border:2px solid rgba(0,204,255,0.7)',
      'box-shadow:0 0 16px rgba(0,170,255,0.4)',
      'font-family:"Courier New",monospace', 'font-size:13px', 'color:#00eeff',
      'max-width:260px', 'text-align:center', 'pointer-events:none', 'display:none',
      'transform:translate(-50%,-100%)',
      'text-shadow:0 0 8px rgba(0,204,255,0.6)',
      'opacity:0', 'transition:opacity 0.4s ease-out',
    ].join(';');
    // Glowing tail
    const tail = document.createElement('div');
    tail.style.cssText = [
      'position:absolute', 'bottom:-10px', 'left:50%', 'transform:translateX(-50%)',
      'width:0', 'height:0',
      'border-left:8px solid transparent', 'border-right:8px solid transparent',
      'border-top:10px solid rgba(0,204,255,0.7)',
    ].join(';');
    const span = document.createElement('span');
    span.textContent = 'Help me! Find the chip north of the campfire and use it to start me up.';
    _robotBubbleEl.appendChild(span);
    _robotBubbleEl.appendChild(tail);
    document.body.appendChild(_robotBubbleEl);
  }

  function _updateRobotBubble() {
    // Show only when chip not yet picked up and robot mesh exists and no menu open
    const shouldShow = !_aidaIntroState.chipPickedUp && !!_aidaRobotMesh && !_menuOpen && !window._suppressAidaBubbles;
    if (!shouldShow) {
      if (_robotBubbleEl) { _robotBubbleEl.style.opacity = '0'; _robotBubbleEl.style.display = 'none'; }
      return;
    }
    _ensureRobotBubble();
    if (!_campCamera) { _robotBubbleEl.style.opacity = '0'; _robotBubbleEl.style.display = 'none'; return; }
    const THREE = T();
    if (!THREE) { _robotBubbleEl.style.opacity = '0'; _robotBubbleEl.style.display = 'none'; return; }
    if (!_campUITmpVec) _campUITmpVec = new THREE.Vector3();
    _campUITmpVec.copy(_aidaRobotMesh.position);
    _campUITmpVec.y += 2.2;
    _campUITmpVec.project(_campCamera);
    // Only show when in front of camera
    if (_campUITmpVec.z > 1.0) { _robotBubbleEl.style.opacity = '0'; _robotBubbleEl.style.display = 'none'; return; }
    const sx = (_campUITmpVec.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-_campUITmpVec.y * 0.5 + 0.5) * window.innerHeight;
    _robotBubbleEl.style.left = sx + 'px';
    _robotBubbleEl.style.top  = sy + 'px';
    _robotBubbleEl.style.display = 'block';
    // Trigger fade-in via opacity (transition:opacity 0.4s defined in cssText)
    requestAnimationFrame(function () { if (_robotBubbleEl) _robotBubbleEl.style.opacity = '1'; });
  }

  // Per-frame update for Aida intro props (chip glow + proximity prompts)
  function _updateAidaIntro(dt) {
    if (!_campScene) return;

    // Robot lap animation around the campfire (after chip inserted)
    if (_robotLapActive && _robotMesh) {
      _robotLapT += dt;
      const lapDuration = 6.0;
      const lapProgress = Math.min(_robotLapT / lapDuration, 1.0);
      const angle = lapProgress * Math.PI * 2;
      const lapRadius = 4.5;
      _robotMesh.position.x = Math.sin(angle) * lapRadius;
      _robotMesh.position.z = Math.cos(angle) * lapRadius;
      _robotMesh.rotation.y = -angle + Math.PI * 0.5;
      if (lapProgress >= 1.0) {
        _robotLapActive = false;
        _robotMesh.position.set(AIDA_ROBOT_POS.x, 0, AIDA_ROBOT_POS.z);
        _robotMesh.rotation.y = 0;
      }
    }

    // ─ Robot speech bubble — visible before chip is picked up ─
    _updateRobotBubble();

    // ─ Chip float + glow animation + magnet ─
    if (!_aidaIntroState.chipPickedUp && _aidaChipMesh && _aidaChipMesh.visible) {
      const cdx = _playerPos.x - _aidaChipMesh.position.x;
      const cdz = _playerPos.z - _aidaChipMesh.position.z;
      const chipDist = Math.sqrt(cdx * cdx + cdz * cdz);

      // ── Magnet: pull chip toward player when within range ──
      if (chipDist < AIDA_CHIP_MAGNET_RANGE && chipDist > 0.01) {
        const pullSpeed = 6.0 * (1 + (AIDA_CHIP_MAGNET_RANGE - chipDist) / AIDA_CHIP_MAGNET_RANGE);
        _aidaChipMesh.position.x += (cdx / chipDist) * pullSpeed * dt;
        _aidaChipMesh.position.z += (cdz / chipDist) * pullSpeed * dt;
        // Fast spinning when attracted
        _aidaChipMesh.rotation.y += dt * 5.0;
        _aidaChipMesh.position.y = 0.3 + Math.sin(_campTime * 6.0) * 0.1;
        _aidaChipMesh.traverse(function (child) {
          if (child._aidaChipBody && child.material) {
            child.material.emissiveIntensity = 1.5 + Math.abs(Math.sin(_campTime * 8.0)) * 1.0;
          }
        });
      } else {
        // Normal float + glow
        _aidaChipMesh.position.y = 0.06 + Math.sin(_campTime * 2.8) * 0.08;
        _aidaChipMesh.rotation.y += dt * 1.2;
        _aidaChipMesh.traverse(function (child) {
          if (child._aidaChipBody && child.material) {
            child.material.emissiveIntensity = 0.9 + Math.abs(Math.sin(_campTime * 3.0)) * 0.8;
          }
        });
      }

      // ── Auto-pickup: suck chip into hand at very close range ──
      if (chipDist <= AIDA_CHIP_AUTO_PICKUP) {
        _pickUpAidaChip();
      }
    }

    if (_menuOpen) return; // don't show prompts while a menu is open
    if (!_promptEl) return;

    // ─ Chip proximity prompt — use chip's live position (it moves via magnet) ─
    if (!_aidaIntroState.chipPickedUp && _aidaChipMesh && _aidaChipMesh.visible) {
      const cdx = _playerPos.x - _aidaChipMesh.position.x;
      const cdz = _playerPos.z - _aidaChipMesh.position.z;
      if (Math.sqrt(cdx * cdx + cdz * cdz) < AIDA_INTRO_RADIUS) {
        _promptEl.textContent = '💾 A.I.D.A Chip — Press [E] to pick up';
        _promptEl.style.display = 'block';
        if (_interactBtn) {
          _interactBtn.textContent = 'Pick up chip';
          _interactBtn.style.background = 'linear-gradient(135deg,#0088cc,#004466)';
          _interactBtn.style.display = 'block';
        }
      }
    }

    // ─ Robot proximity prompt ─
    // Allow chip insertion regardless of Quest Hall build state
    if (_aidaIntroState.chipPickedUp && !_aidaIntroState.chipInserted) {
      const _rp = _getAidaRobotPos();
      const rdx = _playerPos.x - _rp.x;
      const rdz = _playerPos.z - _rp.z;
      if (Math.sqrt(rdx * rdx + rdz * rdz) < AIDA_INTRO_RADIUS) {
        _promptEl.textContent = '🤖 Broken Robot — Insert chip into robot chip slot [E]';
        _promptEl.style.display = 'block';
        if (_interactBtn) {
          _interactBtn.textContent = 'INSERT';
          _interactBtn.style.background = 'linear-gradient(135deg,#00cc66,#006633)';
          _interactBtn.style.display = 'block';
        }
      }
    }
    // ─ Post-insertion: show hint to go to Quest Hall ─
    if (_aidaIntroState.chipInserted) {
      const _rp = _getAidaRobotPos();
      const rdx = _playerPos.x - _rp.x;
      const rdz = _playerPos.z - _rp.z;
      if (Math.sqrt(rdx * rdx + rdz * rdz) < AIDA_INTRO_RADIUS) {
        _promptEl.textContent = '🤖 A.I.D.A — Go to Quest Hall!';
        _promptEl.style.display = 'block';
        if (_interactBtn) {
          _interactBtn.textContent = 'QUEST HALL';
          _interactBtn.style.background = 'linear-gradient(135deg,#cc8800,#664400)';
          _interactBtn.style.display = 'block';
        }
      }
    }
  }

  // Pick up the Aida Chip (called from E-key / interact button)
  function _pickUpAidaChip() {
    if (_aidaIntroState.chipPickedUp) return;
    _aidaIntroState.chipPickedUp = true;

    const sd = (typeof saveData !== 'undefined') ? saveData : null;
    if (sd) {
      if (!sd.aidaIntroState) sd.aidaIntroState = {};
      sd.aidaIntroState.chipPickedUp = true;
      if (typeof saveSaveData === 'function') saveSaveData();
    }

    if (_aidaChipMesh) _aidaChipMesh.visible = false;

    const DS = window.DialogueSystem;
    if (DS) DS.show(DS.DIALOGUES.aidaChipFound);

    if (typeof showStatusMessage === 'function') {
      showStatusMessage('Go and find the broken robot in the south area of the camp.', 4000);
    }
  }

  // Insert Aida Chip into the robot (called from E-key / interact button)
  function _insertAidaChip() {
    if (!_aidaIntroState.chipPickedUp || _aidaIntroState.chipInserted) return;
    _aidaIntroState.chipInserted = true;

    const sd = (typeof saveData !== 'undefined') ? saveData : null;
    if (sd) {
      if (!sd.aidaIntroState) sd.aidaIntroState = {};
      sd.aidaIntroState.chipInserted = true;
      if (typeof saveSaveData === 'function') saveSaveData();
    }

    _aidaRobotEyesOn(true);

    // Start robot lap animation around the fire
    _robotLapActive = true;
    _robotLapT = 0;

    const DS = window.DialogueSystem;
    if (DS) {
      DS.show(DS.DIALOGUES.aidaRobotWake, {
        onComplete: function () {
          _aidaGrantStarterMaterials();
          if (typeof window.startAidaIntroQuest === 'function') {
            window.startAidaIntroQuest();
          }
        }
      });
    } else {
      _aidaGrantStarterMaterials();
      if (typeof window.startAidaIntroQuest === 'function') window.startAidaIntroQuest();
    }
  }

  // Grant starter materials to build the first building (Quest Hall)
  // Upgraded: 3 Wood + 3 Stone with visual reward notification
  function _aidaGrantStarterMaterials() {
    const sd = (typeof saveData !== 'undefined') ? saveData : null;
    if (!sd || sd.aidaStarterGranted) return;
    sd.aidaStarterGranted = true;
    if (!sd.resources) sd.resources = {};
    // Grant 3 Wood, 3 Stone
    sd.resources.wood  = (sd.resources.wood  || 0) + 3;
    sd.resources.stone = (sd.resources.stone || 0) + 3;
    // Unlock Quest Hall so first building can be constructed
    if (sd.campBuildings && sd.campBuildings.questMission) {
      sd.campBuildings.questMission.level = 0;
      sd.campBuildings.questMission.unlocked = true;
    }
    if (typeof saveSaveData === 'function') saveSaveData();
    // Show reward notification with OK press requirement
    if (window._showRewardEarned) {
      window._showRewardEarned(
        ['🪵 +3 Wood', '🪨 +3 Stone'],
        '🤖 A.I.D.A — Resources Provided',
        function() {
          // After OK, show player bubble with hint
          if (window._showPlayerBubble) {
            window._showPlayerBubble('Now I can build the Quest Hall...', 4000);
          }
        }
      );
    } else if (typeof showStatChange === 'function') {
      showStatChange('🎁 A.I.D.A: +3 Wood, +3 Stone — Build the Quest Hall!', 'rare');
    }
    if (typeof window.CampWorld !== 'undefined' && window.CampWorld.refreshBuildings) {
      window.CampWorld.refreshBuildings(sd);
    }
  }

  function _buildBennyNPC() {
    const THREE = T();
    const grp = new THREE.Group();

    // Base platform — dark metallic slab
    const baseGeo = new THREE.BoxGeometry(0.7, 0.12, 0.5);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3, metalness: 0.8 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.06;
    grp.add(base);

    // Main terminal column
    const colGeo = new THREE.BoxGeometry(0.22, 1.1, 0.18);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x0d0d1a, roughness: 0.2, metalness: 0.9 });
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.y = 0.67;
    grp.add(col);

    // Screen face — glowing cyan panel
    const screenGeo = new THREE.BoxGeometry(0.18, 0.55, 0.04);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: 0x00ffcc,
      emissiveIntensity: 0.85,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.85, 0.11);
    grp.add(screen);

    // Scanline overlay (darker horizontal stripe for retro terminal look)
    const scanGeo = new THREE.BoxGeometry(0.17, 0.02, 0.045);
    const scanMat = new THREE.MeshStandardMaterial({
      color: 0x003322, emissive: 0x001a11, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.7
    });
    for (let si = 0; si < 5; si++) {
      const scan = new THREE.Mesh(scanGeo, scanMat);
      scan.position.set(0, 0.62 + si * 0.10, 0.135);
      grp.add(scan);
    }

    // Top antenna array — two thin rods
    const antGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6);
    const antMat = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 1.0, roughness: 0.1 });
    [-0.07, 0.07].forEach(function (ox) {
      const ant = new THREE.Mesh(antGeo, antMat);
      ant.position.set(ox, 1.45, 0);
      grp.add(ant);
      // Blinking tip light
      const tipGeo = new THREE.SphereGeometry(0.025, 6, 6);
      const tipMat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 1.2
      });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(ox, 1.69, 0);
      tip._aidaTip = true; // flagged for blink animation
      grp.add(tip);
    });

    // Side panel detail — small button clusters
    const btnGeo = new THREE.BoxGeometry(0.04, 0.04, 0.03);
    const btnColors = [0xff3300, 0x00ff88, 0xffcc00];
    btnColors.forEach(function (c, bi) {
      const btnMat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 });
      const btn = new THREE.Mesh(btnGeo, btnMat);
      btn.position.set(0.14, 0.55 + bi * 0.1, 0.03);
      grp.add(btn);
    });

    // Floor glow ring (holographic projection base)
    const ringGeo = new THREE.RingGeometry(0.32, 0.42, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    ring._aidaRing = true;
    grp.add(ring);

    grp.position.set(BENNY_POS.x, 0, BENNY_POS.z);
    _bennyMesh = grp;
    _campScene.add(grp);
  }

  // Update A.I.D.A terminal each frame (blink lights, rotate ring, position bubble)
  function _updateBennyNPC(dt) {
    if (!_bennyMesh || !_campScene) return;
    const THREE = T();

    // Gentle idle pulse — terminal hums very slightly
    _bennyMesh.position.y = Math.sin(_campTime * 2.0) * 0.015;

    // Animate glowing tips blink and ring rotation
    _bennyMesh.traverse(function (child) {
      if (child._aidaTip) {
        const blink = 0.6 + Math.sin(_campTime * 4.5 + (child.position.x > 0 ? 1.2 : 0)) * 0.6;
        child.material.emissiveIntensity = Math.max(0, blink);
      }
      if (child._aidaRing) {
        child.rotation.z += dt * 0.6;
        const pulse = 0.12 + Math.sin(_campTime * 3.0) * 0.10;
        child.material.opacity = Math.max(0, pulse);
      }
    });

    // Always face the player
    if (_playerMesh) {
      const dx = _playerPos.x - BENNY_POS.x;
      const dz = _playerPos.z - BENNY_POS.z;
      if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
        const targetAngle = Math.atan2(dx, dz);
        let da = targetAngle - _bennyMesh.rotation.y;
        while (da > Math.PI)  da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        _bennyMesh.rotation.y += da * 0.05;
      }
    }

    // Project A.I.D.A screen top to screen space for the dialogue bubble
    const DS = window.DialogueSystem;
    if (DS && DS.isActive() && _campCamera && _bennyMesh) {
      const pos3d = new THREE.Vector3(
        _bennyMesh.position.x,
        1.9 + _bennyMesh.position.y,
        _bennyMesh.position.z
      );
      pos3d.project(_campCamera);
      const sx = ( pos3d.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-pos3d.y * 0.5 + 0.5) * window.innerHeight;
      DS.setPosition(sx, sy);
    }

    // Check proximity for first greeting
    if (_playerMesh && !_bennyGreeted) {
      const dx = _playerPos.x - BENNY_POS.x;
      const dz = _playerPos.z - BENNY_POS.z;
      // Skip greeting until A.I.D.A chip is inserted — terminal is offline until then
      if (Math.sqrt(dx * dx + dz * dz) < BENNY_GREET_RADIUS && _aidaIntroState.chipInserted) {
        _bennyGreeted = true;
        _triggerBennyGreeting();
      }
    }
  }

  // Trigger A.I.D.A greeting (shown once per save after first camp visit)
  function _triggerBennyGreeting() {
    if (!window.saveData) return;
    const sd = window.saveData;
    if (sd.bennyGreetingShown) return;  // already seen

    // Show greeting on first camp visit
    sd.bennyGreetingShown = true;
    if (typeof saveSaveData === 'function') saveSaveData();

    const DS = window.DialogueSystem;
    if (!DS) {
      _showBennySpeech('> Follow me!');
      setTimeout(function () { _hideBennySpeech(); }, 4000);
      return;
    }

    // Show camp welcome sequence as cinematic popup (long text stays in the popup).
    // After it closes, show a brief "Follow me!" above AIDA's head, then the contextual hint.
    DS.show(DS.DIALOGUES.campWelcome, {
      onComplete: function () {
        _showBennySpeech('> Follow me!');
        setTimeout(function () { _hideBennySpeech(); _showBennyContextualHint(); }, 3000);
      }
    });
  }

  /**
   * Show A.I.D.A contextual hint based on the player's current tutorial progress.
   * Reads saveData.tutorialQuests.completedQuests to determine the next directive.
   */
  function _showBennyContextualHint() {
    if (!window.saveData || !window.saveData.tutorialQuests) return;
    const DS = window.DialogueSystem;
    if (!DS) return;

    const tq = window.saveData.tutorialQuests;
    const completed = tq.completedQuests || [];
    const current   = tq.currentQuest || '';

    let hint = null;

    // Walk down the tutorial chain and give the most relevant directive
    if (!completed.includes('quest_findingAida')) {
      // Give a hint appropriate to whether the chip has been picked up yet
      if (!_aidaIntroState.chipPickedUp) {
        hint = { text: '> A glowing chip lies north of the campfire. Pick it up.', emotion: 'smoky' };
      } else {
        hint = { text: '> Chip acquired. Insert it into the broken robot unit by the campfire.', emotion: 'smoky' };
      }
    } else if (!completed.includes('quest_buildQuesthall') && current === 'quest_buildQuesthall') {
      hint = { text: '> Directive: construct the Command Node. Starter materials have been provided. Walk to the plot and build.', emotion: 'task' };
    } else if (!completed.includes('firstRunDeath') && current === 'firstRunDeath') {
      hint = { text: '> Directive: initiate a run and sustain a termination event. This is... required for calibration.', emotion: 'task' };
    } else if (!completed.includes('quest_dailyRoutine') && current === 'quest_dailyRoutine') {
      hint = { text: '> Directive: survive for 120 seconds continuously. My models require sustained combat data.', emotion: 'task' };
    } else if (!completed.includes('quest_harvester') && current === 'quest_harvester') {
      hint = { text: '> Directive: achieve Level 3. Progression data unlocks the Fabrication Node blueprint.', emotion: 'task' };
    } else if (!completed.includes('quest_firstBlood') && current === 'quest_firstBlood') {
      hint = { text: '> Directive: acquire 30 Wood and 30 Stone. The Armory node requires these materials.', emotion: 'task' };
    } else if (!completed.includes('quest_gainingStats') && current === 'quest_gainingStats') {
      hint = { text: '> Directive: neutralise 300 hostiles. Threshold unlocks the Neural Enhancement Matrix.', emotion: 'task' };
    } else if (!completed.includes('quest_eggHunt') && current === 'quest_eggHunt') {
      hint = { text: '> Anomaly detected: a biological container is hidden on the map. Reach Level 15 and retrieve it.', emotion: 'thinking' };
    } else if (!completed.includes('quest_newFriend') && current === 'quest_newFriend') {
      hint = { text: '> Biological container acquired. Return it to the Companion Node. Incubation protocols... interest me.', emotion: 'happy' };
    } else if (!completed.includes('quest_pushingLimits') && current === 'quest_pushingLimits') {
      hint = { text: '> Primary threat: Boss-class entity at Wave 10. Eliminate it. I am monitoring your performance.', emotion: 'task' };
    } else if (!completed.includes('quest2_spendSkills') && current === 'quest2_spendSkills') {
      hint = { text: '> Directive: allocate 3 Skill Points in the Neural Enhancement Matrix. Capability growth is mandatory.', emotion: 'task' };
    } else if (tq.readyToClaim && tq.readyToClaim.length > 0) {
      hint = { text: '> ALERT: unclaimed directives detected at the Command Node. Retrieve your rewards immediately.', emotion: 'goal' };
    } else if (completed.length > 8) {
      hint = { text: '> You have exceeded initial projections. Continue toward Level 100 and prestige. I have... plans for you.', emotion: 'thinking' };
    } else {
      const currentQ = (typeof getCurrentQuest === 'function') ? getCurrentQuest() : null;
      if (currentQ) {
        hint = { text: '> Active directive: ' + currentQ.name + '. Proceed.', emotion: 'task' };
      } else {
        hint = { text: '> Engage hostiles and gather data. Return when you have something useful.', emotion: 'task' };
      }
    }

    if (hint) DS.show([hint]);
  }

  function _showBennySpeech(text) {
    // Suppress bubbles while a cinematic dialogue is playing
    if (window._suppressAidaBubbles) return;
    const DS = window.DialogueSystem;
    if (DS) {
      DS.show([{ text: text.replace(/\n/g, ' '), emotion: 'task' }]);
    }
  }

  function _hideBennySpeech() {
    const DS = window.DialogueSystem;
    if (DS) DS.dismiss();
  }

  // Benny walk-to-building animation: smoothly moves Benny to a building, shows speech, then returns
  // Player now auto-follows Benny when he walks
  let _bennyWalking = false;
  function _bennyWalkToBuild(buildingId, speechText) {
    if (!_bennyMesh || _bennyWalking) return;
    const def = BUILDING_DEFS.find(d => d.id === buildingId);
    if (!def) return;
    _bennyWalking = true;
    // Save original positions
    const origX = BENNY_POS.x;
    const origZ = BENNY_POS.z;
    const targetX = def.x;
    const targetZ = def.z;
    const walkDuration = 1200; // ms

    // Player follow offset (slightly behind Benny)
    const playerOrigX = _playerPos ? _playerPos.x : 0;
    const playerOrigZ = _playerPos ? _playerPos.z : 3;
    // Player target: slightly offset from building position
    const PLAYER_FOLLOW_DISTANCE = 2.0;
    const dx = targetX - origX;
    const dz = targetZ - origZ;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const playerTargetX = targetX - (dx / dist) * PLAYER_FOLLOW_DISTANCE;
    const playerTargetZ = targetZ - (dz / dist) * PLAYER_FOLLOW_DISTANCE;

    // Show A.I.D.A "follow signal" prompt first
    const DS = window.DialogueSystem;
    if (DS) {
      DS.show([{ text: '> Follow my signal.', emotion: 'task' }]);
    } else {
      _showBennySpeech(speechText || '> Relocating. Follow.');
    }

    // Animate walk to building (both Benny and player)
    const startMs = performance.now();
    function walkStep() {
      var t = Math.min((performance.now() - startMs) / walkDuration, 1);
      var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      _bennyMesh.position.x = origX + (targetX - origX) * eased;
      _bennyMesh.position.z = origZ + (targetZ - origZ) * eased;
      // Face target direction
      var bdx = targetX - _bennyMesh.position.x;
      var bdz = targetZ - _bennyMesh.position.z;
      if (Math.abs(bdx) > 0.01 || Math.abs(bdz) > 0.01) {
        _bennyMesh.rotation.y = Math.atan2(bdx, bdz);
      }
      // Player auto-follow: smoothly move player toward their target
      if (_playerMesh) {
        _playerPos.x = playerOrigX + (playerTargetX - playerOrigX) * eased;
        _playerPos.z = playerOrigZ + (playerTargetZ - playerOrigZ) * eased;
        _playerMesh.position.x = _playerPos.x;
        _playerMesh.position.z = _playerPos.z;
        // Face Benny
        var pdx = _bennyMesh.position.x - _playerPos.x;
        var pdz = _bennyMesh.position.z - _playerPos.z;
        if (Math.abs(pdx) > 0.01 || Math.abs(pdz) > 0.01) {
          _playerMesh.rotation.y = Math.atan2(pdx, pdz);
        }
      }
      if (t < 1) {
        requestAnimationFrame(walkStep);
      } else {
        // Arrived — show A.I.D.A's building directive, wait, then return
        if (DS) {
          DS.show([{ text: speechText || '> Node location confirmed. Construct when ready.', emotion: 'task' }]);
        }
        setTimeout(function () {
          _hideBennySpeech();
          var retStart = performance.now();
          function returnStep() {
            var rt = Math.min((performance.now() - retStart) / walkDuration, 1);
            var re = rt < 0.5 ? 2 * rt * rt : 1 - Math.pow(-2 * rt + 2, 2) / 2;
            _bennyMesh.position.x = targetX + (origX - targetX) * re;
            _bennyMesh.position.z = targetZ + (origZ - targetZ) * re;
            // Player returns too
            if (_playerMesh) {
              _playerPos.x = playerTargetX + (playerOrigX - playerTargetX) * re;
              _playerPos.z = playerTargetZ + (playerOrigZ - playerTargetZ) * re;
              _playerMesh.position.x = _playerPos.x;
              _playerMesh.position.z = _playerPos.z;
            }
            if (rt < 1) {
              requestAnimationFrame(returnStep);
            } else {
              _bennyMesh.position.x = origX;
              _bennyMesh.position.z = origZ;
              if (_playerMesh) {
                _playerPos.x = playerOrigX;
                _playerPos.z = playerOrigZ;
                _playerMesh.position.x = playerOrigX;
                _playerMesh.position.z = playerOrigZ;
              }
              _bennyWalking = false;
            }
          }
          requestAnimationFrame(returnStep);
        }, 1500);
      }
    }
    requestAnimationFrame(walkStep);
  }

  /**
   * Like _bennyWalkToBuild but fires onDialogClosed callback ONLY after the
   * dialog is dismissed.  Used so the 3D building pop animation shows AFTER
   * the player reads Benny's message — not at the same time.
   */
  function _bennyWalkToBuildThenDialog(buildingId, speechText, onDialogClosed) {
    if (!_bennyMesh || _bennyWalking) {
      // If Benny can't walk, still play animation immediately
      if (typeof onDialogClosed === 'function') onDialogClosed();
      return;
    }
    const def = BUILDING_DEFS.find(d => d.id === buildingId);
    if (!def) {
      if (typeof onDialogClosed === 'function') onDialogClosed();
      return;
    }
    _bennyWalking = true;

    const origX = BENNY_POS.x;
    const origZ = BENNY_POS.z;
    const targetX = def.x;
    const targetZ = def.z;
    const walkDuration = 1200;

    const playerOrigX = _playerPos ? _playerPos.x : 0;
    const playerOrigZ = _playerPos ? _playerPos.z : 3;
    const PLAYER_FOLLOW_DISTANCE = 2.0;
    const wdx = targetX - origX;
    const wdz = targetZ - origZ;
    const wdist = Math.sqrt(wdx * wdx + wdz * wdz) || 1;
    const playerTargetX = targetX - (wdx / wdist) * PLAYER_FOLLOW_DISTANCE;
    const playerTargetZ = targetZ - (wdz / wdist) * PLAYER_FOLLOW_DISTANCE;

    const DS = window.DialogueSystem;
    if (DS) DS.show([{ text: '> Follow my signal. Node proximity required.', emotion: 'task' }]);

    const startMs = performance.now();
    function walkStep2() {
      var t = Math.min((performance.now() - startMs) / walkDuration, 1);
      var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      _bennyMesh.position.x = origX + (targetX - origX) * eased;
      _bennyMesh.position.z = origZ + (targetZ - origZ) * eased;
      var bdx2 = targetX - _bennyMesh.position.x;
      var bdz2 = targetZ - _bennyMesh.position.z;
      if (Math.abs(bdx2) > 0.01 || Math.abs(bdz2) > 0.01) _bennyMesh.rotation.y = Math.atan2(bdx2, bdz2);
      if (_playerMesh) {
        _playerPos.x = playerOrigX + (playerTargetX - playerOrigX) * eased;
        _playerPos.z = playerOrigZ + (playerTargetZ - playerOrigZ) * eased;
        _playerMesh.position.x = _playerPos.x;
        _playerMesh.position.z = _playerPos.z;
        var pdx2 = _bennyMesh.position.x - _playerPos.x;
        var pdz2 = _bennyMesh.position.z - _playerPos.z;
        if (Math.abs(pdx2) > 0.01 || Math.abs(pdz2) > 0.01) _playerMesh.rotation.y = Math.atan2(pdx2, pdz2);
      }
      if (t < 1) {
        requestAnimationFrame(walkStep2);
      } else {
        // Arrived — show A.I.D.A's building directive FIRST, then fire callback
        var dialogLines = [
          { text: speechText || '> Node confirmed. Construction parameters loaded.', emotion: 'task' }
        ];
        if (DS) {
          DS.show(dialogLines, {
            onComplete: function () {
              // Dialog closed → fire callback so building pops up NOW
              if (typeof onDialogClosed === 'function') onDialogClosed();
              _startBennyReturn();
            }
          });
        } else {
          _showBennySpeech(speechText || '> Construct now.');
          if (typeof onDialogClosed === 'function') onDialogClosed();
          setTimeout(_startBennyReturn, 2000);
        }
      }
    }

    function _startBennyReturn() {
      _hideBennySpeech();
      var retStart = performance.now();
      function returnStep2() {
        var rt = Math.min((performance.now() - retStart) / walkDuration, 1);
        var re = rt < 0.5 ? 2 * rt * rt : 1 - Math.pow(-2 * rt + 2, 2) / 2;
        _bennyMesh.position.x = targetX + (origX - targetX) * re;
        _bennyMesh.position.z = targetZ + (origZ - targetZ) * re;
        if (_playerMesh) {
          _playerPos.x = playerTargetX + (playerOrigX - playerTargetX) * re;
          _playerPos.z = playerTargetZ + (playerOrigZ - playerTargetZ) * re;
          _playerMesh.position.x = _playerPos.x;
          _playerMesh.position.z = _playerPos.z;
        }
        if (rt < 1) {
          requestAnimationFrame(returnStep2);
        } else {
          _bennyMesh.position.x = origX;
          _bennyMesh.position.z = origZ;
          if (_playerMesh) {
            _playerPos.x = playerOrigX;
            _playerPos.z = playerOrigZ;
            _playerMesh.position.x = playerOrigX;
            _playerMesh.position.z = playerOrigZ;
          }
          _bennyWalking = false;
        }
      }
      requestAnimationFrame(returnStep2);
    }

    requestAnimationFrame(walkStep2);
  }

  function _buildBuilding(def) {
    switch (def.id) {
      case 'questMission':       return _buildQuestHall(def);
      case 'skillTree':          return _buildSkillTree(def);
      case 'forge':              return _buildForge(def);
      case 'progressionHouse':   return _buildProgressionHouse(def);
      case 'companionHouse':     return _buildCompanionHouse(def);
      case 'trainingHall':       return _buildTrainingHall(def);
      case 'achievementBuilding':return _buildAchievementHall(def);
      case 'armory':             return _buildArmory(def);
      case 'inventory':          return _buildInventoryStorage(def);
      case 'campBoard':          return _buildCampBoard(def);
      case 'codex':             return _buildCodexSign(def);
      case 'specialAttacks':     return _buildSpecialAttacksArena(def);
      case 'warehouse':          return _buildWarehouse(def);
      case 'slotMachine':        return _buildSlotMachine(def);
      case 'tavern':             return _buildTavern(def);
      case 'shop':               return _buildShop(def);
      case 'prestige':           return _buildPrestigeAltar(def);
      case 'prismReliquary':     return _buildPrismReliquary(def);
      case 'astralGateway':      return _buildAstralGateway(def);
      case 'shrine':             return _buildArtifactShrine(def);
      case 'droppletShop':       return _buildDroppletShop(def);
      default:                   return _buildGenericBuilding(def);
    }
  }

  // Shared material helpers
  function _mat(color, emissive, eIntensity) {
    const THREE = T();
    return new THREE.MeshPhongMaterial({
      color,
      emissive: emissive || 0x000000,
      emissiveIntensity: eIntensity || 0
    });
  }
  function _lambert(color) {
    const THREE = T();
    return new THREE.MeshPhongMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.12,
      shininess: 25
    });
  }

  // ── Quest Hall ─ rustic log cabin with quest board ───────
  function _buildQuestHall(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Base / floor
    const baseGeo = new THREE.BoxGeometry(5.5, 0.25, 5);
    grp.add(_mesh(baseGeo, _lambert(0x2e1a0a)));

    // Walls
    const wallMat = _lambert(0x5c3317);
    const wallH = 3.5;
    const wallGeo = new THREE.BoxGeometry(5, wallH, 4.5);
    const walls = _mesh(wallGeo, wallMat);
    walls.position.y = wallH * 0.5 + 0.25;
    walls.castShadow = true;
    grp.add(walls);

    // Roof (two triangular prisms)
    const roofMat = _lambert(0x8b4513);
    const roofGeo = new THREE.CylinderGeometry(0, 3.6, 2, 4);
    const roof = _mesh(roofGeo, roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = wallH + 0.25 + 1;
    roof.castShadow = true;
    grp.add(roof);

    // Door
    const doorGeo = new THREE.BoxGeometry(1, 2.2, 0.15);
    const door = _mesh(doorGeo, _lambert(0x3d2005));
    door.position.set(0, wallH * 0.5 - 0.3, 2.3);
    grp.add(door);

    // Quest board (sign post)
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    const post = _mesh(postGeo, _lambert(0x4d2c0a));
    post.position.set(2, 1.25, 3);
    grp.add(post);

    const boardGeo = new THREE.BoxGeometry(1.6, 1, 0.1);
    const board = _mesh(boardGeo, _lambert(0xc8a870));
    board.position.set(2, 2.3, 3);
    grp.add(board);

    // Lanterns (hanging)
    for (let i = -1; i <= 1; i += 2) {
      const lanternGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
      const lantern = _mesh(lanternGeo, _mat(0xffcc44, 0xffcc44, 0.8));
      const lLight = new THREE.PointLight(0xffcc44, 1.2, 5, 2);
      lantern.position.set(i * 2.2, wallH + 0.05, 2.3);
      lLight.position.copy(lantern.position);
      grp.add(lantern);
      grp.add(lLight);
    }

    _addNameSign(grp, def.label, 0, wallH + 2.6, 0);
    return grp;
  }

  // ── Skill Tree ─ massive glowing magical tree ────────────
  function _buildSkillTree(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Ancient crystalline trunk — dark obsidian with cyan vein emission
    const trunkGeo = new THREE.CylinderGeometry(0.8, 1.3, 8, 10);
    const trunkMat = new THREE.MeshPhongMaterial({
      color: 0x0a0520,
      emissive: 0x0033aa,
      emissiveIntensity: 0.3,
      shininess: 60
    });
    const trunk = _mesh(trunkGeo, trunkMat);
    trunk.position.y = 4;
    trunk.castShadow = true;
    grp.add(trunk);

    // Thick roots radiating from base
    for (let r = 0; r < 7; r++) {
      const a = (r / 7) * Math.PI * 2;
      const rootLen = 2.5 + Math.random() * 1.5;
      const rootGeo = new THREE.CylinderGeometry(0.08, 0.22, rootLen, 5);
      const rootCol = r % 2 === 0 ? 0x0044cc : 0x6600cc;
      const rootMat = new THREE.MeshBasicMaterial({ color: rootCol, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
      const root = _mesh(rootGeo, rootMat);
      root.position.set(Math.sin(a) * (rootLen * 0.5), 0.1, Math.cos(a) * (rootLen * 0.5));
      root.rotation.z = Math.sin(a) * 0.7;
      root.rotation.x = Math.cos(a) * 0.7;
      grp.add(root);
    }

    // Main holographic canopy layers — cyan / purple alternating
    const canopyData = [
      { y: 7,    r: 5.5, col: 0x00ffff, opacity: 0.55 },
      { y: 10,   r: 4.5, col: 0x9900ff, opacity: 0.55 },
      { y: 12.5, r: 3.5, col: 0x00ffff, opacity: 0.65 },
      { y: 14.5, r: 2.5, col: 0xcc00ff, opacity: 0.70 },
      { y: 16,   r: 1.5, col: 0x00ffff, opacity: 0.85 },
    ];
    canopyData.forEach((l) => {
      const cMat = new THREE.MeshPhongMaterial({
        color: l.col,
        emissive: l.col,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: l.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const cGeo = new THREE.SphereGeometry(l.r, 10, 7);
      const canopy = _mesh(cGeo, cMat);
      canopy.position.y = l.y;
      grp.add(canopy);
    });

    // Holographic rune pillars — 8 around the base
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pr = 4.5;
      const pillarGeo = new THREE.CylinderGeometry(0.1, 0.15, 3, 5);
      const pCol = i % 2 === 0 ? 0x00ffff : 0xaa00ff;
      const pillarMat = new THREE.MeshPhongMaterial({
        color: pCol, emissive: pCol, emissiveIntensity: 0.9,
        transparent: true, opacity: 0.75
      });
      const pillar = _mesh(pillarGeo, pillarMat);
      pillar.position.set(Math.sin(a) * pr, 1.5, Math.cos(a) * pr);
      grp.add(pillar);
      // Glow cap on pillar
      const capGeo = new THREE.SphereGeometry(0.22, 6, 6);
      const capMat = new THREE.MeshBasicMaterial({ color: pCol, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
      const cap = _mesh(capGeo, capMat);
      cap.position.set(Math.sin(a) * pr, 3.2, Math.cos(a) * pr);
      grp.add(cap);
    }

    // Primary bioluminescent glow — cyan
    const glowLight1 = new THREE.PointLight(0x00ffff, 4, 24, 2);
    glowLight1.position.set(0, 12, 0);
    grp.add(glowLight1);

    // Secondary glow — purple accent
    const glowLight2 = new THREE.PointLight(0xaa00ff, 3, 20, 2);
    glowLight2.position.set(0, 7, 0);
    grp.add(glowLight2);

    // Ground halo — flat disc of light radiating from roots
    const haloGeo = new THREE.CircleGeometry(6, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x3300ff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const halo = _mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    grp.add(halo);

    // Holographic leaf sparkle particles — dense cyan/purple cloud
    const sparkleGeo = new THREE.BufferGeometry();
    const sCount = 120;
    const sPos = new Float32Array(sCount * 3);
    const sCols = new Float32Array(sCount * 3);
    for (let i = 0; i < sCount; i++) {
      const a  = Math.random() * Math.PI * 2;
      const ry = 5 + Math.random() * 12;
      const rr = 0.5 + Math.random() * 5;
      sPos[i * 3]     = Math.sin(a) * rr;
      sPos[i * 3 + 1] = ry;
      sPos[i * 3 + 2] = Math.cos(a) * rr;
      // Alternate cyan / purple
      if (i % 3 === 0) { sCols[i*3]=0; sCols[i*3+1]=1; sCols[i*3+2]=1; }       // cyan
      else if (i % 3 === 1) { sCols[i*3]=0.7; sCols[i*3+1]=0; sCols[i*3+2]=1; } // purple
      else { sCols[i*3]=0; sCols[i*3+1]=0.6; sCols[i*3+2]=1; }                   // blue
    }
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sparkleGeo.setAttribute('color',    new THREE.BufferAttribute(sCols, 3));
    const sparkleMat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    grp.add(new THREE.Points(sparkleGeo, sparkleMat));

    // Songspire energy filaments — from trunk to canopy
    const threadColors = [0x00ffff, 0xaa00ff, 0x0088ff, 0xff00cc];
    for (let t = 0; t < 16; t++) {
      const a = (t / 16) * Math.PI * 2;
      const startR = 0.8;
      const endR   = 2 + Math.random() * 3;
      const startY = 2 + Math.random() * 4;
      const endY   = 8 + Math.random() * 7;
      const threadLen = Math.sqrt(Math.pow(endR - startR, 2) + Math.pow(endY - startY, 2));
      const threadGeo = new THREE.CylinderGeometry(0.025, 0.025, threadLen, 4, 1);
      const tCol = threadColors[t % threadColors.length];
      const threadMat = new THREE.MeshBasicMaterial({
        color: tCol,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending
      });
      const thread = _mesh(threadGeo, threadMat);
      const mx = (Math.sin(a) * startR + Math.sin(a) * endR) * 0.5;
      const mz = (Math.cos(a) * startR + Math.cos(a) * endR) * 0.5;
      thread.position.set(mx, (startY + endY) * 0.5, mz);
      thread.rotation.z = Math.atan2(endR - startR, endY - startY);
      thread.rotation.y = a;
      grp.add(thread);
    }

    _addNameSign(grp, def.label, 0, 1.2, 5.5);
    return grp;
  }

  // ── The Forge ─ stone forge with anvil & embers ──────────
  function _buildForge(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Main forge building (stone, dark)
    const wallMat = _mat(0x4a4440, 0x220800, 0.05);
    const wallGeo = new THREE.BoxGeometry(6, 4, 5.5);
    const walls = _mesh(wallGeo, wallMat);
    walls.position.y = 2;
    walls.castShadow = true;
    grp.add(walls);

    // Roof
    const roofGeo = new THREE.BoxGeometry(6.4, 0.6, 6);
    const roof = _mesh(roofGeo, _lambert(0x3a3030));
    roof.position.y = 4.3;
    grp.add(roof);

    // Chimney
    const chimneyGeo = new THREE.BoxGeometry(0.9, 3, 0.9);
    const chimney = _mesh(chimneyGeo, _lambert(0x3d3530));
    chimney.position.set(-1.5, 5.5, -1);
    grp.add(chimney);

    // Chimney glow (orange embers rising)
    const chimneyLight = new THREE.PointLight(0xff5500, 2, 6, 2);
    chimneyLight.position.set(-1.5, 7.5, -1);
    grp.add(chimneyLight);

    // Anvil outside
    const anvilBase = _mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), _lambert(0x2a2a2a));
    anvilBase.position.set(3.5, 0.3, 1);
    grp.add(anvilBase);
    const anvilTop = _mesh(new THREE.BoxGeometry(1.2, 0.25, 0.55), _lambert(0x333333));
    anvilTop.position.set(3.5, 0.73, 1);
    anvilTop.castShadow = true;
    grp.add(anvilTop);

    // Glowing forge interior (visible through front opening)
    const forgeGlowGeo = new THREE.BoxGeometry(2, 1.8, 0.3);
    const forgeGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.85
    });
    const forgeGlow = _mesh(forgeGlowGeo, forgeGlowMat);
    forgeGlow.position.set(0, 1.5, 2.85);
    grp.add(forgeGlow);

    const forgeLight = new THREE.PointLight(0xff4400, 4, 12, 2);
    forgeLight.position.set(0, 1.5, 3.5);
    grp.add(forgeLight);

    // Tool rack (hammers, tongs)
    const rackGeo = new THREE.BoxGeometry(2, 0.08, 0.08);
    const rack = _mesh(rackGeo, _lambert(0x553311));
    rack.position.set(-3.5, 2.5, 2.9);
    grp.add(rack);
    for (let t = 0; t < 3; t++) {
      const hGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6);
      const h = _mesh(hGeo, _lambert(0x333333));
      h.rotation.z = Math.PI / 2;
      h.position.set(-4.3 + t * 0.7, 2.8, 2.9);
      grp.add(h);
    }

    // Ember particles (static orange dots near forge opening)
    const embGeo = new THREE.BufferGeometry();
    const eCount = 30;
    const ePos = new Float32Array(eCount * 3);
    for (let i = 0; i < eCount; i++) {
      ePos[i * 3]     = (Math.random() - 0.5) * 2.5;
      ePos[i * 3 + 1] = 0.8 + Math.random() * 2;
      ePos[i * 3 + 2] = 2.5 + Math.random() * 1;
    }
    embGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    const embMat = new THREE.PointsMaterial({
      color: 0xff6600,
      size: 0.12,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    grp.add(new THREE.Points(embGeo, embMat));

    _addNameSign(grp, def.label, 0, 5.2, 0);
    return grp;
  }

  // ── Progression House ─ upgrade temple with glowing energy ──
  function _buildProgressionHouse(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Main building (temple-like)
    const wallMat = _mat(0x4a3860, 0x6a00aa, 0.08);
    const wallGeo = new THREE.BoxGeometry(6, 4.5, 5.5);
    const walls = _mesh(wallGeo, wallMat);
    walls.position.y = 2.25;
    walls.castShadow = true;
    grp.add(walls);

    // Roof with crystal
    const roofGeo = new THREE.BoxGeometry(6.4, 0.6, 6);
    const roof = _mesh(roofGeo, _lambert(0x503070));
    roof.position.y = 4.8;
    grp.add(roof);

    // Central crystal (progression symbol)
    const crystalGeo = new THREE.OctahedronGeometry(0.7, 0);
    const crystalMat = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      emissive: 0x00aaff,
      emissiveIntensity: 0.8,
      shininess: 100,
      transparent: true,
      opacity: 0.9
    });
    const crystal = _mesh(crystalGeo, crystalMat);
    crystal.position.set(0, 5.8, 0);
    crystal.rotation.y = Math.PI / 4;
    grp.add(crystal);

    // Crystal glow
    const crystalLight = new THREE.PointLight(0x00ffff, 3, 10, 2);
    crystalLight.position.set(0, 5.8, 0);
    grp.add(crystalLight);

    // Entrance pillars
    const pillarGeo = new THREE.BoxGeometry(0.5, 3.5, 0.5);
    const pillarMat = _lambert(0x604080);
    for (let i = 0; i < 2; i++) {
      const pillar = _mesh(pillarGeo, pillarMat);
      pillar.position.set(i === 0 ? -2 : 2, 1.75, 2.8);
      pillar.castShadow = true;
      grp.add(pillar);
    }

    // Energy orbs floating around
    const orbGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.8
    });
    for (let i = 0; i < 4; i++) {
      const orb = _mesh(orbGeo, orbMat);
      const angle = (i / 4) * Math.PI * 2;
      orb.position.set(Math.cos(angle) * 2.5, 3 + Math.sin(i) * 0.5, Math.sin(angle) * 2.5);
      grp.add(orb);
    }

    // Glowing entrance
    const entranceGlowGeo = new THREE.BoxGeometry(2.5, 3, 0.3);
    const entranceGlowMat = new THREE.MeshBasicMaterial({
      color: 0x6600ff,
      transparent: true,
      opacity: 0.5
    });
    const entranceGlow = _mesh(entranceGlowGeo, entranceGlowMat);
    entranceGlow.position.set(0, 2, 2.85);
    grp.add(entranceGlow);

    const entranceLight = new THREE.PointLight(0x6600ff, 2, 8, 2);
    entranceLight.position.set(0, 2, 3.5);
    grp.add(entranceLight);

    _addNameSign(grp, def.label, 0, 6.2, 0);
    return grp;
  }

  // ── Companion House ─ cozy nest/den ──────────────────────
  function _buildCompanionHouse(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Rounded base platform
    const platGeo = new THREE.CylinderGeometry(4, 4.3, 0.4, 24);
    grp.add(_mesh(platGeo, _lambert(0x2a1e0a)));

    // Main structure (dome-like rounded house)
    const domeMat = _mat(0x8b5e3c, 0x4a2000, 0.06);
    const domeGeo = new THREE.SphereGeometry(3.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const dome = _mesh(domeGeo, domeMat);
    dome.position.y = 0.2;
    dome.castShadow = true;
    grp.add(dome);

    // Door arch
    const doorGeo = new THREE.CylinderGeometry(0.7, 0.7, 2, 12, 1, true, 0, Math.PI);
    const doorMat = _lambert(0x3d2005);
    const door = _mesh(doorGeo, doorMat);
    door.rotation.y = Math.PI;
    door.position.set(0, 1, 3.6);
    grp.add(door);

    // Toys outside (colorful spheres/cubes = toys)
    const toyColors = [0xff4466, 0x44aaff, 0xffdd22, 0x44ff88];
    toyColors.forEach((col, i) => {
      const a = (i / toyColors.length) * Math.PI * 2 + 0.5;
      const r = 3.0;
      const tGeo = i % 2 === 0
        ? new THREE.SphereGeometry(0.22, 8, 8)
        : new THREE.BoxGeometry(0.35, 0.35, 0.35);
      const toy = _mesh(tGeo, _mat(col, col, 0.2));
      toy.position.set(Math.sin(a) * r, 0.25 + 0.2, Math.cos(a) * r);
      grp.add(toy);
    });

    // Training hoop (a torus)
    const hoopGeo = new THREE.TorusGeometry(0.9, 0.07, 8, 24);
    const hoop = _mesh(hoopGeo, _mat(0xffaa00, 0xff8800, 0.3));
    hoop.position.set(3.8, 1.2, 1);
    hoop.rotation.y = 0.5;
    grp.add(hoop);

    // Nest / bed visible through door (a torus on the floor)
    const nestGeo = new THREE.TorusGeometry(0.7, 0.22, 8, 16);
    const nest = _mesh(nestGeo, _lambert(0x8b6914));
    nest.rotation.x = -Math.PI / 2;
    nest.position.set(0, 0.22, 0);
    grp.add(nest);

    // Warm interior light
    const iLight = new THREE.PointLight(0xffaa66, 1.8, 5, 2);
    iLight.position.set(0, 1.5, 0);
    grp.add(iLight);

    _addNameSign(grp, def.label, 0, 4.5, 0);
    return grp;
  }

  // ── Training Hall ─ wooden dojo with equipment ───────────
  function _buildTrainingHall(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Platform
    const platGeo = new THREE.BoxGeometry(7, 0.3, 6.5);
    grp.add(_mesh(platGeo, _lambert(0x4a3218)));

    // Walls (open-sided dojo style)
    const wallMat = _lambert(0x6b4423);
    // Back + side walls
    [[0, 1.8, -3, 6.5, 3.6, 0.2], [3.3, 1.8, 0, 0.2, 3.6, 6]].forEach(([x, y, z, w, h, d]) => {
      const wGeo = new THREE.BoxGeometry(w, h, d);
      const wall = _mesh(wGeo, wallMat);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      grp.add(wall);
    });
    // Left side
    const lWallGeo = new THREE.BoxGeometry(0.2, 3.6, 6);
    const lWall = _mesh(lWallGeo, wallMat);
    lWall.position.set(-3.3, 1.8, 0);
    lWall.castShadow = true;
    grp.add(lWall);

    // Pagoda roof
    const rGeo = new THREE.BoxGeometry(7.5, 0.4, 7);
    const roofTop = _mesh(rGeo, _lambert(0x8b3a00));
    roofTop.position.y = 3.8;
    grp.add(roofTop);

    // Training dummy (capsule-ish)
    const dummyBody = _mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8), _lambert(0x8b4513));
    dummyBody.position.set(2, 1.1, 1.5);
    const dummyHead = _mesh(new THREE.SphereGeometry(0.4, 8, 8), _lambert(0xd2a679));
    dummyHead.position.set(2, 2.3, 1.5);
    const dummyPole = _mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 6), _lambert(0x5c3a1e));
    dummyPole.position.set(2, 0.35, 1.5);
    grp.add(dummyBody, dummyHead, dummyPole);

    // Weight / barbell
    const barGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6);
    const bar = _mesh(barGeo, _lambert(0x333333));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(-2, 0.8, 1.5);
    grp.add(bar);
    for (let s = -1; s <= 1; s += 2) {
      const wGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12);
      const w = _mesh(wGeo, _lambert(0x444444));
      w.rotation.z = Math.PI / 2;
      w.position.set(-2 + s * 0.9, 0.8, 1.5);
      grp.add(w);
    }

    _addNameSign(grp, def.label, 0, 4.6, 0);
    return grp;
  }

  // ── Hall of Trophies ─ gleaming achievement building ─────
  function _buildAchievementHall(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Grand columns (4)
    const colMat = _mat(0xe8d8a0, 0xffd700, 0.05);
    [[-2, 2.5], [2, 2.5], [-2, -2.5], [2, -2.5]].forEach(([cx, cz]) => {
      const cGeo = new THREE.CylinderGeometry(0.35, 0.4, 5, 12);
      const col  = _mesh(cGeo, colMat);
      col.position.set(cx, 2.5, cz);
      col.castShadow = true;
      grp.add(col);
    });

    // Main building
    const bGeo = new THREE.BoxGeometry(5.5, 4, 5.5);
    const bMat = _mat(0xd4c890, 0x8b6914, 0.05);
    const bldg = _mesh(bGeo, bMat);
    bldg.position.y = 2;
    bldg.castShadow = true;
    grp.add(bldg);

    // Triangular pediment (front gable)
    const pedGeo = new THREE.CylinderGeometry(0, 3.5, 2, 4);
    const ped = _mesh(pedGeo, _mat(0xe8d8a0, 0x8b6914, 0.05));
    ped.rotation.y = Math.PI / 4;
    ped.position.y = 5;
    ped.castShadow = true;
    grp.add(ped);

    // Trophy displays (golden star shapes)
    for (let i = 0; i < 3; i++) {
      const tLight = new THREE.PointLight(0xffd700, 1.2, 4, 2);
      tLight.position.set(-2.2 + i * 2.2, 3, 2.9);
      grp.add(tLight);

      const starGeo = new THREE.OctahedronGeometry(0.35, 0);
      const starMat = new THREE.MeshPhongMaterial({
        color: 0xffd700,
        emissive: 0xffd700,
        emissiveIntensity: 0.6,
        shininess: 120
      });
      const star = _mesh(starGeo, starMat);
      star.position.set(-2.2 + i * 2.2, 2.8, 2.9);
      grp.add(star);
    }

    // Steps
    for (let s = 0; s < 3; s++) {
      const sGeo = new THREE.BoxGeometry(4 - s * 0.4, 0.25, 0.5);
      const step = _mesh(sGeo, _lambert(0xb8a878));
      step.position.set(0, s * 0.25 + 0.12, 2.8 + s * 0.4);
      grp.add(step);
    }

    _addNameSign(grp, def.label, 0, 7.3, 0);
    return grp;
  }

  // ── Armory ─ fortified weapon rack building ──────────────
  function _buildArmory(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Stone walls
    const wallMat = _lambert(0x4a4240);
    const wGeo = new THREE.BoxGeometry(5.5, 4.5, 5);
    const walls = _mesh(wGeo, wallMat);
    walls.position.y = 2.25;
    walls.castShadow = true;
    grp.add(walls);

    // Battlements on top
    for (let b = -2; b <= 2; b++) {
      const bGeo = new THREE.BoxGeometry(0.5, 0.7, 0.5);
      const batt = _mesh(bGeo, _lambert(0x3a3230));
      batt.position.set(b * 1.1, 4.85, 2.6);
      grp.add(batt);
    }

    // Arrow slit windows
    for (let s = -1; s <= 1; s += 2) {
      const wGeo2 = new THREE.BoxGeometry(0.2, 0.7, 0.15);
      const wWindow = _mesh(wGeo2, _lambert(0x111111));
      wWindow.position.set(s * 1.8, 2.5, 2.55);
      grp.add(wWindow);
    }

    // Weapon rack outside
    const rackH = _mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), _lambert(0x553311));
    rackH.rotation.z = Math.PI / 2;
    rackH.position.set(3.6, 1.5, 0);
    grp.add(rackH);
    const rackV1 = _mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), _lambert(0x553311));
    rackV1.position.set(2.8, 1, 0);
    grp.add(rackV1);
    const rackV2 = _mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), _lambert(0x553311));
    rackV2.position.set(4.4, 1, 0);
    grp.add(rackV2);

    // Swords on rack
    for (let sw = -1; sw <= 1; sw++) {
      const bladeGeo = new THREE.BoxGeometry(0.08, 1.5, 0.08);
      const blade = _mesh(bladeGeo, _mat(0xcccccc, 0x888888, 0.3));
      blade.position.set(3.6 + sw * 0.5, 1.5, 0.2);
      grp.add(blade);
      const guardGeo = new THREE.BoxGeometry(0.5, 0.07, 0.07);
      const guard = _mesh(guardGeo, _lambert(0xaa8833));
      guard.position.set(3.6 + sw * 0.5, 0.8, 0.2);
      grp.add(guard);
    }

    _addNameSign(grp, def.label, 0, 5.6, 0);
    return grp;
  }

  // ── Inventory Storage ─ crates and barrels ───────────────
  function _buildInventoryStorage(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Main warehouse
    const wallMat = _lambert(0x6b5c42);
    const wGeo = new THREE.BoxGeometry(6, 4, 5.5);
    const walls = _mesh(wGeo, wallMat);
    walls.position.y = 2;
    walls.castShadow = true;
    grp.add(walls);

    // Sloped shed roof
    const roofGeo = new THREE.BoxGeometry(6.5, 0.3, 6);
    const roof = _mesh(roofGeo, _lambert(0x4a3822));
    roof.position.y = 4.15;
    grp.add(roof);

    // Door
    const doorGeo = new THREE.BoxGeometry(1.2, 2.5, 0.15);
    const door = _mesh(doorGeo, _lambert(0x3d2a18));
    door.position.set(-0.5, 1.25, 2.83);
    grp.add(door);

    // Crates outside
    [[3.2, 0.4, 1.5], [3.2, 1.1, 1.5], [3.9, 0.4, 1], [3.9, 0.4, 2.2]].forEach(([x, y, z]) => {
      const cGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
      const crate = _mesh(cGeo, _lambert(0x9b7c44));
      crate.position.set(x, y, z);
      crate.castShadow = true;
      grp.add(crate);
    });

    // Barrel
    const brlGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 12);
    const brl = _mesh(brlGeo, _lambert(0x5c3a1e));
    brl.position.set(-3.5, 0.4, 2);
    grp.add(brl);

    _addNameSign(grp, def.label, 0, 5.0, 0);
    return grp;
  }

  // ── Teleport Portal ─ glowing ground portal for fast travel ──
  function _buildCampBoard(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Outer stone ring platform
    const platformGeo = new THREE.CylinderGeometry(2.2, 2.4, 0.18, 12);
    const platformMat = new THREE.MeshPhongMaterial({
      color: 0x1a1a2e, emissive: 0x0a0a1a, emissiveIntensity: 0.15, shininess: 60
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 0.09;
    platform.receiveShadow = true;
    grp.add(platform);

    // Inner swirling portal disc (glowing cyan/blue)
    const portalGeo = new THREE.CircleGeometry(1.5, 48);
    const portalMat = new THREE.MeshBasicMaterial({
      color: 0x00ccff, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.rotation.x = -Math.PI / 2;
    portal.position.y = 0.19;
    portal._portalDisc = true;
    grp.add(portal);

    // Second layer portal (slightly smaller, different phase)
    const portal2Geo = new THREE.CircleGeometry(1.1, 48);
    const portal2Mat = new THREE.MeshBasicMaterial({
      color: 0x8844ff, transparent: true, opacity: 0.30,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const portal2 = new THREE.Mesh(portal2Geo, portal2Mat);
    portal2.rotation.x = -Math.PI / 2;
    portal2.position.y = 0.20;
    portal2._portalDisc2 = true;
    grp.add(portal2);

    // 6 rune stones around the ring
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 1.9;
      const stoneGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.55, 5);
      const stoneMat = new THREE.MeshPhongMaterial({
        color: 0x223355, emissive: 0x0044aa, emissiveIntensity: 0.5, shininess: 80
      });
      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.position.set(Math.sin(a) * r, 0.36, Math.cos(a) * r);
      stone.castShadow = true;
      grp.add(stone);
      // Glowing tip on each runestone
      const tipGeo = new THREE.SphereGeometry(0.10, 6, 6);
      const tipMat = new THREE.MeshBasicMaterial({ color: 0x00eeff });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(Math.sin(a) * r, 0.68, Math.cos(a) * r);
      grp.add(tip);
    }

    // Central hovering energy gem
    const gemGeo = new THREE.OctahedronGeometry(0.4, 1);
    const gemMat = new THREE.MeshPhongMaterial({
      color: 0x44aaff, emissive: 0x0066cc, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.9, shininess: 200
    });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.position.set(0, 1.0, 0);
    gem._portalGem = true;
    grp.add(gem);

    // Wireframe overlay on gem
    const wireGeo = new THREE.OctahedronGeometry(0.43, 1);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.4 });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.position.set(0, 1.0, 0);
    wire._portalGemWire = true;
    grp.add(wire);

    // Portal light column glow
    const portalLight = new THREE.PointLight(0x00aaff, 3.0, 10, 2);
    portalLight.position.set(0, 0.8, 0);
    grp.add(portalLight);

    _addNameSign(grp, def.label, 0, 1.9, 0);
    return grp;
  }

  // ── Codex — wooden message/info board sign ─────────────────
  function _buildCodexSign(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Two wooden posts
    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 2.6, 8);
    const postMat = _lambert(0x5c3317);
    for (const px of [-0.7, 0.7]) {
      const post = _mesh(postGeo, postMat);
      post.position.set(px, 1.3, 0);
      post.castShadow = true;
      grp.add(post);
    }

    // Cross bar
    const barGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.7, 6);
    const bar = _mesh(barGeo, postMat);
    bar.position.y = 2.4;
    bar.rotation.z = Math.PI / 2;
    grp.add(bar);

    // Main sign board
    const boardGeo = new THREE.BoxGeometry(1.9, 1.2, 0.1);
    const boardMat = _lambert(0x8B5E3C);
    const board = _mesh(boardGeo, boardMat);
    board.position.y = 1.8;
    board.castShadow = true;
    grp.add(board);

    // Sign face (lighter wood)
    const faceGeo = new THREE.BoxGeometry(1.7, 1.0, 0.05);
    const face = _mesh(faceGeo, _mat(0xf0d890, 0xf5e0a0, 0.18));
    face.position.set(0, 1.8, 0.08);
    grp.add(face);

    // Corner tacks
    const tackGeo = new THREE.SphereGeometry(0.045, 6, 6);
    const tackMat = _mat(0xffd700, 0xffd700, 0.7);
    for (const [tx, ty] of [[-0.72, 0.35], [0.72, 0.35], [-0.72, -0.35], [0.72, -0.35]]) {
      const tack = _mesh(tackGeo, tackMat);
      tack.position.set(tx, 1.8 + ty, 0.12);
      grp.add(tack);
    }

    // Warm glow
    const glow = new THREE.PointLight(0xf5e0a0, 1.4, 5, 2);
    glow.position.set(0, 2.2, 0.8);
    grp.add(glow);

    // Eye of Horus notification indicator - Golden Pyramid with Black Eye
    // This is a golden pyramid hovering above the sign that becomes visible when new codex entries are available
    // The pyramid has 4 faces, and we'll add the Eye of Horus symbol on one face

    // Main pyramid structure
    const notifGeo = new THREE.ConeGeometry(0.22, 0.38, 4);
    const notifMat = new THREE.MeshPhongMaterial({
      color: 0xFFD700,        // Bright gold
      emissive: 0xFFAA00,     // Golden emissive
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.95,
      shininess: 80,
      specular: 0xFFFFAA
    });
    const notifPyramid = new THREE.Mesh(notifGeo, notifMat);
    notifPyramid.name = 'codex-notif-pyramid';
    notifPyramid.position.set(0, 3.2, 0);
    notifPyramid.rotation.y = Math.PI / 4;
    grp.add(notifPyramid);

    // Eye of Horus symbol on front face (black on gold)
    // Create a small plane with the Eye of Horus using simple geometry
    const eyeGroup = new THREE.Group();

    // Eye outline (horizontal ellipse)
    const eyeOutlineGeo = new THREE.CircleGeometry(0.08, 16);
    eyeOutlineGeo.scale(1.4, 0.7, 1); // Make it elliptical
    const eyeOutlineMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const eyeOutline = new THREE.Mesh(eyeOutlineGeo, eyeOutlineMat);
    eyeGroup.add(eyeOutline);

    // Inner eye (smaller circle)
    const innerEyeGeo = new THREE.CircleGeometry(0.04, 16);
    const innerEye = new THREE.Mesh(innerEyeGeo, eyeOutlineMat);
    eyeGroup.add(innerEye);

    // Eye makeup line (bottom curve - distinctive Egyptian style)
    const curveGeo = new THREE.PlaneGeometry(0.1, 0.02);
    const bottomCurve = new THREE.Mesh(curveGeo, eyeOutlineMat);
    bottomCurve.position.set(0.06, -0.05, 0.001);
    bottomCurve.rotation.z = -0.3;
    eyeGroup.add(bottomCurve);

    // Position eye on the front face of the pyramid
    eyeGroup.position.set(0, 3.15, 0.15);
    eyeGroup.rotation.x = Math.PI / 6; // Tilt to match pyramid face angle
    grp.add(eyeGroup);

    // Store reference for updating visibility
    grp.userData.notifPyramid = notifPyramid;
    grp.userData.notifEye = eyeGroup;

    // Pulsing golden light beneath the pyramid
    const notifLight = new THREE.PointLight(0xFFD700, 1.8, 4.5, 2);
    notifLight.name = 'codex-notif-light';
    notifLight.position.set(0, 3.2, 0);
    grp.add(notifLight);

    grp.userData.notifLight = notifLight;

    // Initially hidden — will be shown by CodexSystem.hasNew()
    notifPyramid.visible = false;
    eyeGroup.visible = false;
    notifLight.visible = false;

    // Remove any stale indicator from previous scene builds
    const existingInd = document.getElementById('codex-horus-indicator');
    if (existingInd) existingInd.remove();

    // Inject a DOM element for the JS notification system to toggle
    const indEl = document.createElement('div');
    indEl.id = 'codex-horus-indicator';
    indEl.style.display = 'none';
    indEl.dataset.grpRef = 'codex-notif';
    document.body.appendChild(indEl);

    // MutationObserver to sync 3D notif with DOM indicator
    // The observer is registered in _buildingObservers so it is disconnected when
    // the camp scene is rebuilt (preventing a leak on scene re-entry).
    const mo = new MutationObserver(() => {
      const visible = indEl.style.display !== 'none';
      notifPyramid.visible = visible;
      eyeGroup.visible = visible;
      notifLight.visible = visible;
    });
    mo.observe(indEl, { attributes: true, attributeFilter: ['style'] });
    _buildingObservers.push(mo);

    _addNameSign(grp, def.label, 0, 3.8, 0);
    return grp;
  }

  function _buildGenericBuilding(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);
    const geo = new THREE.BoxGeometry(4, 3.5, 4);
    const mat = _lambert(0x5c4a35);
    const b = _mesh(geo, mat);
    b.position.y = 1.75;
    b.castShadow = true;
    grp.add(b);
    _addNameSign(grp, def.label, 0, 4.2, 0);
    return grp;
  }

  // ── Special Attacks Arena ─ octagonal training arena ────
  function _buildSpecialAttacksArena(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Octagonal stone floor
    const floorGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.2, 8);
    const floorMat = _lambert(0x2a2a3a);
    const floor = _mesh(floorGeo, floorMat);
    floor.position.y = 0.1;
    grp.add(floor);

    // Low stone wall ring
    const wallGeo = new THREE.CylinderGeometry(3.6, 3.6, 1.1, 8, 1, true);
    const wallMat = new THREE.MeshPhongMaterial({
      color: 0x404055,
      emissive: 0x20202a,
      emissiveIntensity: 0.1,
      shininess: 20,
      side: THREE.DoubleSide
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 0.75;
    grp.add(wall);

    // Central weapon rack (cross of cylinders)
    const rackMat = _lambert(0x884422);
    for (let i = 0; i < 2; i++) {
      const rGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6);
      const rack = _mesh(rGeo, rackMat);
      rack.position.y = 1.2;
      rack.rotation.z = (i * Math.PI) / 2;
      grp.add(rack);
    }

    // Glowing energy orb in the center
    const orbGeo = new THREE.SphereGeometry(0.5, 12, 8);
    const orbMat = new THREE.MeshPhongMaterial({
      color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.85
    });
    const orb = _mesh(orbGeo, orbMat);
    orb.position.y = 2.0;
    grp.add(orb);

    // Pulsing light from the orb
    const orbLight = new THREE.PointLight(0xff4400, 2.0, 8, 2);
    orbLight.position.set(0, 2.0, 0);
    grp.add(orbLight);

    // Corner pillars
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pillarGeo = new THREE.CylinderGeometry(0.2, 0.25, 2.5, 6);
      const pillar = _mesh(pillarGeo, _lambert(0x555566));
      pillar.position.set(Math.cos(a) * 3.0, 1.25, Math.sin(a) * 3.0);
      pillar.castShadow = true;
      grp.add(pillar);

      // Torch on each pillar
      const torchGeo = new THREE.BoxGeometry(0.18, 0.35, 0.18);
      const torch = _mesh(torchGeo, _mat(0xffcc44, 0xffcc44, 0.8));
      torch.position.set(Math.cos(a) * 3.0, 2.7, Math.sin(a) * 3.0);
      const tLight = new THREE.PointLight(0xffcc44, 1.0, 5, 2);
      tLight.position.copy(torch.position);
      grp.add(torch);
      grp.add(tLight);
    }

    _addNameSign(grp, def.label, 0, 4.0, 0);
    return grp;
  }

  // ── Warehouse ─ storage building with crates ─────────────
  function _buildWarehouse(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Base
    const baseGeo = new THREE.BoxGeometry(6, 0.2, 5);
    grp.add(_mesh(baseGeo, _lambert(0x1a120a)));

    // Walls
    const wallGeo = new THREE.BoxGeometry(5.5, 3.5, 4.5);
    const walls = _mesh(wallGeo, _lambert(0x7a5c3a));
    walls.position.y = 1.95;
    walls.castShadow = true;
    grp.add(walls);

    // Flat roof with slight overhang
    const roofGeo = new THREE.BoxGeometry(6.2, 0.3, 5.2);
    const roof = _mesh(roofGeo, _lambert(0x5c3d1e));
    roof.position.y = 3.85;
    roof.castShadow = true;
    grp.add(roof);

    // Door (large double door)
    const doorGeo = new THREE.BoxGeometry(1.6, 2.4, 0.15);
    const door = _mesh(doorGeo, _lambert(0x3d2005));
    door.position.set(0, 1.4, 2.35);
    grp.add(door);

    // Storage crates outside
    const cratePositions = [[-2.2, 0], [2.2, 0], [-2.2, -1], [2.2, -1]];
    cratePositions.forEach(([cx, cz]) => {
      const cGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      const crate = _mesh(cGeo, _lambert(0xc8a870));
      crate.position.set(cx, 0.45, cz - 2.8);
      crate.rotation.y = Math.random() * 0.4;
      crate.castShadow = true;
      grp.add(crate);
    });

    // Lantern
    const lanternGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
    const lantern = _mesh(lanternGeo, _mat(0xffcc44, 0xffcc44, 0.8));
    lantern.position.set(0, 3.3, 2.4);
    const lLight = new THREE.PointLight(0xffcc44, 1.0, 6, 2);
    lLight.position.copy(lantern.position);
    grp.add(lantern);
    grp.add(lLight);

    _addNameSign(grp, def.label, 0, 4.6, 0);
    return grp;
  }

  // ── Slot Machine ─ neon gambling cabinet ─────────────────
  function _buildSlotMachine(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Base platform
    const baseGeo = new THREE.BoxGeometry(3.5, 0.2, 3.5);
    grp.add(_mesh(baseGeo, _lambert(0x1a1a2e)));

    // Cabinet body
    const cabGeo = new THREE.BoxGeometry(2.5, 3.5, 2.2);
    const cab = _mesh(cabGeo, _lambert(0x2d1b69));
    cab.position.y = 1.95;
    cab.castShadow = true;
    grp.add(cab);

    // Screen face (bright neon)
    const screenGeo = new THREE.BoxGeometry(1.8, 1.4, 0.12);
    const screen = _mesh(screenGeo, _mat(0xff44cc, 0xff44cc, 1.2));
    screen.position.set(0, 2.4, 1.17);
    grp.add(screen);

    // Lever
    const leverBaseGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8);
    const leverBase = _mesh(leverBaseGeo, _lambert(0xcccccc));
    leverBase.position.set(1.4, 2.2, 0);
    grp.add(leverBase);
    const leverTopGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const leverTop = _mesh(leverTopGeo, _mat(0xff3300, 0xff3300, 0.8));
    leverTop.position.set(1.4, 2.75, 0);
    grp.add(leverTop);

    // Neon glow light
    const neonLight = new THREE.PointLight(0xff44cc, 1.2, 7, 2);
    neonLight.position.set(0, 2.4, 1.5);
    grp.add(neonLight);

    _addNameSign(grp, def.label, 0, 4.8, 0);
    return grp;
  }

  // ── Tavern ─ cozy inn with warm interior glow ────────────
  function _buildTavern(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Foundation
    const baseGeo = new THREE.BoxGeometry(6, 0.25, 5.5);
    grp.add(_mesh(baseGeo, _lambert(0x2e1a0a)));

    // Walls (warm beige/cream)
    const wallGeo = new THREE.BoxGeometry(5.5, 4, 5);
    const walls = _mesh(wallGeo, _lambert(0xa07848));
    walls.position.y = 2.25;
    walls.castShadow = true;
    grp.add(walls);

    // Sloped roof
    const roofGeo = new THREE.CylinderGeometry(0, 4.2, 2.2, 4);
    const roof = _mesh(roofGeo, _lambert(0x8b2500));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 5.35;
    roof.castShadow = true;
    grp.add(roof);

    // Door
    const doorGeo = new THREE.BoxGeometry(1.2, 2.5, 0.15);
    const door = _mesh(doorGeo, _lambert(0x3d1a05));
    door.position.set(0, 1.5, 2.6);
    grp.add(door);

    // Hanging sign
    const signPostGeo = new THREE.BoxGeometry(0.1, 1.5, 0.1);
    const signPost = _mesh(signPostGeo, _lambert(0x4d2c0a));
    signPost.position.set(1.8, 3.5, 2.7);
    grp.add(signPost);
    const signBoardGeo = new THREE.BoxGeometry(1.4, 0.7, 0.1);
    const signBoard = _mesh(signBoardGeo, _lambert(0xd4a838));
    signBoard.position.set(1.1, 3.1, 2.75);
    grp.add(signBoard);

    // Warm glow from windows
    const winLight = new THREE.PointLight(0xff9944, 1.5, 8, 2);
    winLight.position.set(0, 2.5, 1);
    grp.add(winLight);

    // Lanterns on either side
    for (let s = -1; s <= 1; s += 2) {
      const lGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
      const lantern = _mesh(lGeo, _mat(0xffcc44, 0xffcc44, 0.9));
      lantern.position.set(s * 2.4, 3.8, 2.6);
      const lLight = new THREE.PointLight(0xffcc44, 1.2, 6, 2);
      lLight.position.copy(lantern.position);
      grp.add(lantern);
      grp.add(lLight);
    }

    _addNameSign(grp, def.label, 0, 6.0, 0);
    return grp;
  }

  // ── Shop ─ market stall with colourful awning ────────────
  function _buildShop(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Base platform
    const baseGeo = new THREE.BoxGeometry(5.5, 0.25, 5);
    grp.add(_mesh(baseGeo, _lambert(0x1a1208)));

    // Walls (light stone)
    const wallGeo = new THREE.BoxGeometry(5, 3.5, 4.5);
    const walls = _mesh(wallGeo, _lambert(0xd4c8a0));
    walls.position.y = 2.0;
    walls.castShadow = true;
    grp.add(walls);

    // Flat roof
    const roofGeo = new THREE.BoxGeometry(5.8, 0.25, 5.3);
    const roof = _mesh(roofGeo, _lambert(0x4a8c3a));
    roof.position.y = 3.85;
    grp.add(roof);

    // Awning (angled)
    const awningGeo = new THREE.BoxGeometry(5.4, 0.1, 1.6);
    const awning = _mesh(awningGeo, _mat(0xFFD700, 0xCC8800, 0.3));
    awning.position.set(0, 3.5, 2.8);
    awning.rotation.x = -0.3;
    grp.add(awning);

    // Counter / display table
    const counterGeo = new THREE.BoxGeometry(3.5, 0.8, 0.9);
    const counter = _mesh(counterGeo, _lambert(0x8b6914));
    counter.position.set(0, 1.0, 2.4);
    grp.add(counter);

    // Gold coin stack (decorative)
    for (let i = 0; i < 3; i++) {
      const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 8);
      const coin = _mesh(coinGeo, _mat(0xFFD700, 0xCC8800, 0.4));
      coin.position.set(-0.6 + i * 0.6, 1.5, 2.4);
      grp.add(coin);
    }

    // Welcoming light
    const shopLight = new THREE.PointLight(0xffe066, 1.4, 7, 2);
    shopLight.position.set(0, 3, 2);
    grp.add(shopLight);

    _addNameSign(grp, def.label, 0, 5.0, 0);
    return grp;
  }

  // ── Astral Gateway — alien crystalline portal structure ───
  function _buildAstralGateway(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Obsidian hexagonal base platform
    const platformGeo = new THREE.CylinderGeometry(3.8, 4.1, 0.35, 6);
    grp.add(_mesh(platformGeo, _lambert(0x080814)));

    // Outer ring of alien crystal pillars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 3.0;
      const pillarGeo = new THREE.CylinderGeometry(0.15, 0.22, 3.5 + (i % 2) * 1.2, 6);
      const pillarMat = new THREE.MeshPhongMaterial({
        color: 0x4400cc, emissive: 0x2200aa, emissiveIntensity: 0.7,
        transparent: true, opacity: 0.88
      });
      const pillar = _mesh(pillarGeo, pillarMat);
      pillar.position.set(Math.sin(a) * r, 1.9, Math.cos(a) * r);
      grp.add(pillar);
    }

    // Central portal arch (two tall crystals leaning inward)
    const archColors = [0x6622ff, 0x2255ff];
    for (let s = -1; s <= 1; s += 2) {
      const archGeo = new THREE.ConeGeometry(0.35, 5.0, 6);
      const archMat = new THREE.MeshPhongMaterial({
        color: archColors[s === -1 ? 0 : 1],
        emissive: archColors[s === -1 ? 0 : 1],
        emissiveIntensity: 0.9,
        transparent: true, opacity: 0.85
      });
      const arch = _mesh(archGeo, archMat);
      arch.position.set(s * 1.4, 2.6, 0);
      arch.rotation.z = s * 0.18;
      grp.add(arch);
    }

    // Hovering central vortex gem
    const vortexGeo = new THREE.OctahedronGeometry(0.65, 1);
    const vortexMat = new THREE.MeshPhongMaterial({
      color: 0x8844ff, emissive: 0x5522ff, emissiveIntensity: 1.5,
      transparent: true, opacity: 0.92, wireframe: false
    });
    const vortex = _mesh(vortexGeo, vortexMat);
    vortex.position.set(0, 3.2, 0);
    grp.add(vortex);

    // Wireframe overlay on gem for alien look
    const wireGeo = new THREE.OctahedronGeometry(0.68, 1);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, wireframe: true, transparent: true, opacity: 0.55 });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.position.set(0, 3.2, 0);
    grp.add(wireMesh);

    // Floating rune discs on platform
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const runeGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6);
      const runeMat = new THREE.MeshPhongMaterial({ color: 0x220066, emissive: 0x8800ff, emissiveIntensity: 0.8 });
      const rune = _mesh(runeGeo, runeMat);
      rune.position.set(Math.sin(a) * 2.8, 0.22, Math.cos(a) * 2.8);
      grp.add(rune);
    }

    // Alien glow sprite (additive, blue/purple)
    const glowC = document.createElement('canvas');
    glowC.width = 64; glowC.height = 64;
    const gCtx = glowC.getContext('2d');
    const gGrad = gCtx.createRadialGradient(32,32,0,32,32,32);
    gGrad.addColorStop(0, 'rgba(140,100,255,0.95)');
    gGrad.addColorStop(0.4, 'rgba(60,20,200,0.5)');
    gGrad.addColorStop(1, 'rgba(0,0,0,0)');
    gCtx.fillStyle = gGrad;
    gCtx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(glowC);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x8844ff, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.7, depthWrite: false });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(0, 3.2, 0);
    glow.scale.set(10, 10, 1);
    grp.add(glow);

    // Pulsing blue/purple point light (registered in _alienLights for animation)
    const alienLight1 = new THREE.PointLight(0x5500ff, 3.5, 14, 2);
    alienLight1.position.set(0, 3.5, 0);
    grp.add(alienLight1);
    const alienLight2 = new THREE.PointLight(0x0055ff, 1.5, 8, 2);
    alienLight2.position.set(0, 1.0, 0);
    grp.add(alienLight2);
    _alienLights.push({ light: alienLight1, base: 3.5, phase: 0 });
    _alienLights.push({ light: alienLight2, base: 1.5, phase: Math.PI });

    _addNameSign(grp, def.label, 0, 6.5, 0);
    return grp;
  }

  // ── Prism Reliquary — glowing alien crystal structure ─────
  function _buildPrismReliquary(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Hexagonal obsidian platform
    const platformGeo = new THREE.CylinderGeometry(4.0, 4.3, 0.4, 6);
    grp.add(_mesh(platformGeo, _lambert(0x0d0d1a)));

    // Inner glowing ring
    const ringGeo = new THREE.CylinderGeometry(2.8, 3.0, 0.15, 6);
    const ringMat = new THREE.MeshPhongMaterial({ color: 0x220033, emissive: 0x8800ff, emissiveIntensity: 0.6 });
    const ring = _mesh(ringGeo, ringMat);
    ring.position.y = 0.3;
    grp.add(ring);

    // Central large crystal — main spire
    const spireGeo = new THREE.ConeGeometry(0.7, 5.5, 6);
    const spireMat = new THREE.MeshPhongMaterial({
      color: 0xcc88ff, emissive: 0x9900ff, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.88
    });
    const spire = _mesh(spireGeo, spireMat);
    spire.position.y = 3.15;
    grp.add(spire);

    // Inverted crystal base on the central spire
    const spireBaseGeo = new THREE.ConeGeometry(0.7, 1.8, 6);
    const spireBase = _mesh(spireBaseGeo, spireMat);
    spireBase.position.y = 0.5;
    spireBase.rotation.x = Math.PI;
    grp.add(spireBase);

    // 4 orbiting sub-crystals (Ruby/Sapphire/Emerald/Void)
    const orbitColors = [
      { color: 0xff6644, emissive: 0xff2200, eInt: 0.8 }, // Ruby
      { color: 0x5588ff, emissive: 0x2255ff, eInt: 0.8 }, // Sapphire
      { color: 0x44ff88, emissive: 0x00cc44, eInt: 0.8 }, // Emerald
      { color: 0xcc44ff, emissive: 0x9900cc, eInt: 0.9 }  // Void
    ];
    orbitColors.forEach((c, i) => {
      const angle = (i / 4) * Math.PI * 2;
      const r = 2.2;
      const crystalGeo = new THREE.ConeGeometry(0.28, 1.6, 4);
      const crystalMat = new THREE.MeshPhongMaterial({
        color: c.color, emissive: c.emissive, emissiveIntensity: c.eInt,
        transparent: true, opacity: 0.85
      });
      const crystal = _mesh(crystalGeo, crystalMat);
      crystal.position.set(Math.sin(angle) * r, 1.8, Math.cos(angle) * r);
      crystal.rotation.z = 0.3 + (i * 0.15);
      grp.add(crystal);

      // Small inverted companion crystal
      const smallGeo = new THREE.ConeGeometry(0.15, 0.8, 4);
      const small = _mesh(smallGeo, crystalMat);
      small.position.set(Math.sin(angle) * r, 1.0, Math.cos(angle) * r);
      small.rotation.x = Math.PI;
      grp.add(small);
    });

    // Floating gem rune circles (flat disc decorations on platform)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const discGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 6);
      const discMat = new THREE.MeshPhongMaterial({ color: 0x440066, emissive: 0xcc00ff, emissiveIntensity: 0.7 });
      const disc = _mesh(discGeo, discMat);
      disc.position.set(Math.sin(a) * 3.2, 0.25, Math.cos(a) * 3.2);
      grp.add(disc);
    }

    // Fake atmospheric glow — additive sprite (no real-time PointLight overhead)
    const _glowCanvas = document.createElement('canvas');
    _glowCanvas.width = 64; _glowCanvas.height = 64;
    const _gCtx = _glowCanvas.getContext('2d');
    const _gGrad = _gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    _gGrad.addColorStop(0, 'rgba(220,140,255,0.9)');
    _gGrad.addColorStop(0.35, 'rgba(150,50,255,0.55)');
    _gGrad.addColorStop(1, 'rgba(0,0,0,0)');
    _gCtx.fillStyle = _gGrad;
    _gCtx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(_glowCanvas);
    const glowSpriteMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xcc88ff, transparent: true,
      blending: THREE.AdditiveBlending, opacity: 0.75, depthWrite: false
    });
    const glowSprite = new THREE.Sprite(glowSpriteMat);
    glowSprite.position.set(0, 4, 0);
    glowSprite.scale.set(12, 12, 1);
    grp.add(glowSprite);

    // Smaller accent glow near base
    const accentSpriteMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xff88ff, transparent: true,
      blending: THREE.AdditiveBlending, opacity: 0.4, depthWrite: false
    });
    const accentSprite = new THREE.Sprite(accentSpriteMat);
    accentSprite.position.set(1.5, 2, 1.5);
    accentSprite.scale.set(6, 6, 1);
    grp.add(accentSprite);

    // Pulsing blue/purple point lights (alien atmosphere)
    const prismLight1 = new THREE.PointLight(0x8800ff, 4.0, 16, 2);
    prismLight1.position.set(0, 3.5, 0);
    grp.add(prismLight1);
    const prismLight2 = new THREE.PointLight(0x0044ff, 2.0, 10, 2);
    prismLight2.position.set(0, 0.5, 0);
    grp.add(prismLight2);
    _alienLights.push({ light: prismLight1, base: 4.0, phase: 0.8 });
    _alienLights.push({ light: prismLight2, base: 2.0, phase: 2.2 });

    _addNameSign(grp, def.label, 0, 7.2, 0);
    return grp;
  }

  // ── The Artifact Shrine ─ ancient stone temple with cyan/gold aura ──────────
  function _buildArtifactShrine(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Stone base platform (dark obsidian-like)
    const basePlatGeo = new THREE.CylinderGeometry(4.2, 4.5, 0.5, 16);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x1a0a2e, emissive: 0x0a0015, shininess: 60 });
    grp.add(_mesh(basePlatGeo, baseMat));

    // Raised inner platform
    const innerPlatGeo = new THREE.CylinderGeometry(3.0, 3.2, 0.7, 16);
    grp.add(_mesh(innerPlatGeo, new THREE.MeshPhongMaterial({ color: 0x0d0824, emissive: 0x0a0020, shininess: 80 })));

    // Four stone pillars at cardinal directions
    const pillarMat = new THREE.MeshPhongMaterial({ color: 0x2a1545, emissive: 0x00ffff, emissiveIntensity: 0.08, shininess: 40 });
    const pillarCapMat = new THREE.MeshPhongMaterial({ color: 0xC9A227, emissive: 0xC9A227, emissiveIntensity: 0.4, shininess: 120 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const r = 2.6;
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      // Pillar shaft
      const pillarGeo = new THREE.CylinderGeometry(0.22, 0.26, 3.5, 8);
      const pillar = _mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 1.75 + 0.35, pz);
      grp.add(pillar);
      // Gold capital on top
      const capGeo = new THREE.BoxGeometry(0.55, 0.3, 0.55);
      const cap = _mesh(capGeo, pillarCapMat);
      cap.position.set(px, 3.65, pz);
      grp.add(cap);
    }

    // Central shrine pedestal
    const pedestalGeo = new THREE.CylinderGeometry(0.55, 0.7, 2.2, 12);
    const pedestalMat = new THREE.MeshPhongMaterial({ color: 0x1a0a2e, emissive: 0x6600cc, emissiveIntensity: 0.25, shininess: 80 });
    grp.add(_mesh(pedestalGeo, pedestalMat));

    // Artifact crystal orb on pedestal (the focal point)
    const orbGeo = new THREE.IcosahedronGeometry(0.5, 2);
    const orbMat = new THREE.MeshPhongMaterial({
      color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.75, shininess: 200
    });
    const orb = _mesh(orbGeo, orbMat);
    orb.position.set(0, 2.5, 0);
    grp.add(orb);

    // Gold ring around orb
    const orbRingGeo = new THREE.TorusGeometry(0.62, 0.06, 8, 32);
    const orbRingMat = new THREE.MeshPhongMaterial({ color: 0xC9A227, emissive: 0xC9A227, emissiveIntensity: 0.6 });
    const orbRing = _mesh(orbRingGeo, orbRingMat);
    orbRing.position.set(0, 2.5, 0);
    grp.add(orbRing);

    // Outer decorative stone ring
    const archRingGeo = new THREE.TorusGeometry(3.2, 0.18, 8, 48);
    const archRingMat = new THREE.MeshPhongMaterial({ color: 0x3a1f5a, emissive: 0x8a2be2, emissiveIntensity: 0.3 });
    const archRing = _mesh(archRingGeo, archRingMat);
    archRing.position.set(0, 0.6, 0);
    archRing.rotation.x = Math.PI / 2;
    grp.add(archRing);

    // Three artifact slot stones around the pedestal
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const r = 1.6;
      const sx = Math.cos(a) * r;
      const sz = Math.sin(a) * r;
      const slotStoneGeo = new THREE.BoxGeometry(0.4, 0.6, 0.4);
      const slotStoneMat = new THREE.MeshPhongMaterial({ color: 0x2a1545, emissive: 0xC9A227, emissiveIntensity: 0.2, shininess: 60 });
      const slotStone = _mesh(slotStoneGeo, slotStoneMat);
      slotStone.position.set(sx, 0.65, sz);
      grp.add(slotStone);
    }

    // Cyan glow sprite above orb
    const _glowC = document.createElement('canvas');
    _glowC.width = 64; _glowC.height = 64;
    const _gc = _glowC.getContext('2d');
    const _rg = _gc.createRadialGradient(32, 32, 2, 32, 32, 32);
    _rg.addColorStop(0, 'rgba(0,255,255,0.9)');
    _rg.addColorStop(1, 'rgba(0,255,255,0)');
    _gc.fillStyle = _rg;
    _gc.fillRect(0, 0, 64, 64);
    const shrineGlowTex = new THREE.CanvasTexture(_glowC);
    const shrineGlowMat = new THREE.SpriteMaterial({
      map: shrineGlowTex, color: 0x00ffff, transparent: true,
      blending: THREE.AdditiveBlending, opacity: 0.7, depthWrite: false
    });
    const shrineGlow = new THREE.Sprite(shrineGlowMat);
    shrineGlow.position.set(0, 2.5, 0);
    shrineGlow.scale.set(5, 5, 1);
    grp.add(shrineGlow);

    // Gold accent glow
    const goldGlowMat = new THREE.SpriteMaterial({
      map: shrineGlowTex, color: 0xC9A227, transparent: true,
      blending: THREE.AdditiveBlending, opacity: 0.4, depthWrite: false
    });
    const goldGlow = new THREE.Sprite(goldGlowMat);
    goldGlow.position.set(0, 1.0, 0);
    goldGlow.scale.set(10, 10, 1);
    grp.add(goldGlow);

    // Pulsing cyan/purple point lights
    const shrineLight1 = new THREE.PointLight(0x00ffff, 3.5, 14, 2);
    shrineLight1.position.set(0, 3.0, 0);
    grp.add(shrineLight1);
    const shrineLight2 = new THREE.PointLight(0xC9A227, 1.5, 8, 2);
    shrineLight2.position.set(0, 1.0, 0);
    grp.add(shrineLight2);
    const shrineLight3 = new THREE.PointLight(0x8a2be2, 2.0, 10, 2);
    shrineLight3.position.set(0, 0.5, 0);
    grp.add(shrineLight3);
    _alienLights.push({ light: shrineLight1, base: 3.5, phase: 0.5 });
    _alienLights.push({ light: shrineLight2, base: 1.5, phase: 1.8 });
    _alienLights.push({ light: shrineLight3, base: 2.0, phase: 3.1 });

    _addNameSign(grp, def.label, 0, 5.2, 0);
    return grp;
  }

  // ── The Dropplet Shop — a waterdrop-themed merchant building ─────────────
  function _buildDroppletShop(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Tiled floor platform — cyan-tinted stone
    const floorGeo = new THREE.BoxGeometry(6, 0.3, 6);
    grp.add(_mesh(floorGeo, _lambert(0x0a2233)));

    // Main stall body — front-open market stall shape
    const bodyGeo = new THREE.BoxGeometry(5.5, 3.2, 4);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x0d1f2d, emissive: 0x003344, emissiveIntensity: 0.3 });
    const body = _mesh(bodyGeo, bodyMat);
    body.position.set(0, 1.75, -0.5);
    grp.add(body);

    // Awning / canopy — slanted water-blue roof
    const roofGeo = new THREE.BoxGeometry(6.5, 0.2, 5.2);
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x004466, emissive: 0x0088aa, emissiveIntensity: 0.4 });
    const roof = _mesh(roofGeo, roofMat);
    roof.position.set(0, 3.5, -0.2);
    roof.rotation.x = 0.08;
    grp.add(roof);

    // Counter top — horizontal wooden plank
    const counterGeo = new THREE.BoxGeometry(5.0, 0.15, 1.2);
    const counter = _mesh(counterGeo, _lambert(0x1a3040));
    counter.position.set(0, 1.2, 1.6);
    grp.add(counter);

    // Large glowing waterdrop orb (focal point)
    const dropGeo = new THREE.SphereGeometry(0.6, 16, 16);
    const dropMat = new THREE.MeshPhongMaterial({
      color: 0x00ccff, emissive: 0x00aaff, emissiveIntensity: 1.5,
      transparent: true, opacity: 0.85
    });
    const dropOrb = _mesh(dropGeo, dropMat);
    dropOrb.position.set(0, 2.4, 1.2);
    grp.add(dropOrb);

    // Hanging sign — dark panel with glow
    const signGeo = new THREE.BoxGeometry(3.0, 0.8, 0.08);
    const signMat = new THREE.MeshPhongMaterial({ color: 0x001122, emissive: 0x00aaff, emissiveIntensity: 0.6 });
    const sign = _mesh(signGeo, signMat);
    sign.position.set(0, 4.1, 2.2);
    grp.add(sign);

    // Point light — cyan glow from orb
    const shopLight = new THREE.PointLight(0x00ccff, 2.5, 12, 2);
    shopLight.position.set(0, 2.8, 1.2);
    grp.add(shopLight);
    _alienLights.push({ light: shopLight, base: 2.5, phase: 1.1 });

    // Warm accent light underneath counter
    const warmLight = new THREE.PointLight(0x0055aa, 1.0, 6, 2);
    warmLight.position.set(0, 0.8, 1.6);
    grp.add(warmLight);

    _addNameSign(grp, def.label, 0, 5.0, 0);
    return grp;
  }

  function _buildPrestigeAltar(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);
    const platformGeo = new THREE.CylinderGeometry(4.0, 4.3, 0.25, 12);

    grp.add(_mesh(platformGeo, _lambert(0x303040)));

    // Inner raised ring
    const ringGeo = new THREE.CylinderGeometry(3.0, 3.2, 0.8, 12);
    grp.add(_mesh(ringGeo, _lambert(0x252535)));

    // Standing rune stones around the circle
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 3.5;
      const stoneGeo = new THREE.BoxGeometry(0.4, 2.0 + (i % 2) * 0.8, 0.4);
      const stoneMat = new THREE.MeshPhongMaterial({
        color: 0x4a3f6b,
        emissive: 0x8844ff,
        emissiveIntensity: 0.4
      });
      const stone = _mesh(stoneGeo, stoneMat);
      stone.position.set(Math.sin(a) * r, 1.4 + (i % 2) * 0.4, Math.cos(a) * r);
      stone.castShadow = true;
      grp.add(stone);
    }

    // Central glowing gem
    const gemGeo = new THREE.OctahedronGeometry(0.7, 0);
    const gemMat = new THREE.MeshPhongMaterial({
      color: 0xcc88ff, emissive: 0x8800ff, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.9
    });
    const gem = _mesh(gemGeo, gemMat);
    gem.position.y = 2.0;
    grp.add(gem);

    // Orbiting light
    const altarLight = new THREE.PointLight(0x8800ff, 3.0, 14, 2);
    altarLight.position.set(0, 2.5, 0);
    grp.add(altarLight);

    // Second warm gold light
    const goldLight = new THREE.PointLight(0xFFD700, 1.5, 8, 2);
    goldLight.position.set(0, 1.5, 0);
    grp.add(goldLight);

    _addNameSign(grp, def.label, 0, 5.0, 0);
    return grp;
  }
  function _mesh(geo, mat) {
    const THREE = T();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    return m;
  }

  // ── Floating name sign above each building ───────────────
  function _addNameSign(grp, label, x, y, z) {
    const THREE = T();
    // Use a canvas texture for the label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(20,12,4,0.82)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#c8a248';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = '#f0d890';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const signGeo = new THREE.PlaneGeometry(2.6, 0.65);
    const signMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(x, y, z);
    grp.add(sign);
  }

  // ──────────────────────────────────────────────────────────
  // Particle update
  // ──────────────────────────────────────────────────────────
  function _updateParticles(dt) {
    // ── Campfire sparks ──────────────────────────────────────
    if (!_sparkSystem || !_sparkPositions) return;
    for (let i = 0; i < SPARK_COUNT; i++) {
      _sparkLifetimes[i] -= dt;
      if (_sparkLifetimes[i] <= 0) {
        // Respawn from fire
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.5;
        _sparkPositions[i * 3]     = Math.sin(a) * r;
        _sparkPositions[i * 3 + 1] = 0.6 + Math.random() * 0.6;
        _sparkPositions[i * 3 + 2] = Math.cos(a) * r;
        _sparkVelocities[i] = {
          x: (Math.random() - 0.5) * 1.2,
          y: 2.5 + Math.random() * 2.5,
          z: (Math.random() - 0.5) * 1.2
        };
        _sparkLifetimes[i] = 0.5 + Math.random() * 1.2;
      } else {
        _sparkPositions[i * 3]     += _sparkVelocities[i].x * dt;
        _sparkPositions[i * 3 + 1] += _sparkVelocities[i].y * dt;
        _sparkPositions[i * 3 + 2] += _sparkVelocities[i].z * dt;
        _sparkVelocities[i].y -= 1.2 * dt; // gravity
        _sparkVelocities[i].x *= 0.98;
        _sparkVelocities[i].z *= 0.98;
      }
    }
    if (_sparkSystem) _sparkSystem.geometry.attributes.position.needsUpdate = true;

    // ── Smoke particles ─────────────────────────────────────
    if (_smokeSystem && _smokePositions && _smokeLifetimes) {
      for (let s = 0; s < _smokeLifetimes.length; s++) {
        if (_smokeLifetimes[s] <= 0) {
          _smokePositions[s * 3]     = (Math.random() - 0.5) * 0.3;
          _smokePositions[s * 3 + 1] = 1.2;
          _smokePositions[s * 3 + 2] = (Math.random() - 0.5) * 0.3;
          _smokeVelocities[s] = { x: (Math.random() - 0.5) * 0.25, y: 0.6 + Math.random() * 0.5, z: (Math.random() - 0.5) * 0.25 };
          _smokeLifetimes[s] = 3.0 + Math.random() * 2.0;
        } else {
          _smokePositions[s * 3]     += _smokeVelocities[s].x * dt;
          _smokePositions[s * 3 + 1] += _smokeVelocities[s].y * dt;
          _smokePositions[s * 3 + 2] += _smokeVelocities[s].z * dt;
          _smokeLifetimes[s] -= dt;
          _smokeVelocities[s].x *= 0.99;
          _smokeVelocities[s].z *= 0.99;
        }
      }
      _smokeSystem.geometry.attributes.position.needsUpdate = true;
    }
    // ── Pulsating glow rings around fire ────────────────────
    if (_glowRings) {
      const gt = Date.now() * 0.001;
      _glowRings.forEach(function(r) {
        r.baseMat.opacity = (0.04 + 0.02 * Math.sin(gt * 1.5 + r.phase));
      });
    }

    // ── Atmospheric dust ─────────────────────────────────────
    if (!_dustSystem || !_dustPositions) return;
    for (let i = 0; i < DUST_COUNT; i++) {
      _dustLifetimes[i] -= dt;
      if (_dustLifetimes[i] <= 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 7;
        _dustPositions[i * 3]     = Math.sin(a) * r;
        _dustPositions[i * 3 + 1] = 0.1;
        _dustPositions[i * 3 + 2] = Math.cos(a) * r;
        _dustVelocities[i] = {
          x: (Math.random() - 0.5) * 0.5,
          y: 0.1 + Math.random() * 0.35,
          z: (Math.random() - 0.5) * 0.5
        };
        _dustLifetimes[i] = 3 + Math.random() * 3;
      } else {
        _dustPositions[i * 3]     += _dustVelocities[i].x * dt;
        _dustPositions[i * 3 + 1] += _dustVelocities[i].y * dt;
        _dustPositions[i * 3 + 2] += _dustVelocities[i].z * dt;
      }
    }
    if (_dustSystem) _dustSystem.geometry.attributes.position.needsUpdate = true;

    // ── Green fireflies ──────────────────────────────────────
    if (!_fireflySystem || !_fireflyPositions) return;
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      _fireflyLifetimes[i] -= dt;
      if (_fireflyLifetimes[i] <= 0) {
        // Respawn in ring around camp
        const a = Math.random() * Math.PI * 2;
        const r = 15 + Math.random() * 15;
        _fireflyPositions[i * 3]     = Math.sin(a) * r;
        _fireflyPositions[i * 3 + 1] = 1 + Math.random() * 2.5;
        _fireflyPositions[i * 3 + 2] = Math.cos(a) * r;
        _fireflyVelocities[i] = {
          x: (Math.random() - 0.5) * 0.6,
          y: (Math.random() - 0.5) * 0.3,
          z: (Math.random() - 0.5) * 0.6
        };
        _fireflyPhases[i] = Math.random() * Math.PI * 2;
        _fireflyLifetimes[i] = 2 + Math.random() * 8;
      } else {
        // Gentle wandering movement
        _fireflyPositions[i * 3]     += _fireflyVelocities[i].x * dt;
        _fireflyPositions[i * 3 + 1] += _fireflyVelocities[i].y * dt;
        _fireflyPositions[i * 3 + 2] += _fireflyVelocities[i].z * dt;
        // Random direction changes
        _fireflyVelocities[i].x += (Math.random() - 0.5) * 0.2 * dt;
        _fireflyVelocities[i].y += (Math.random() - 0.5) * 0.1 * dt;
        _fireflyVelocities[i].z += (Math.random() - 0.5) * 0.2 * dt;
        // Limit speed
        const speed = Math.sqrt(
          _fireflyVelocities[i].x ** 2 +
          _fireflyVelocities[i].y ** 2 +
          _fireflyVelocities[i].z ** 2
        );
        if (speed > 0.8) {
          _fireflyVelocities[i].x *= 0.8 / speed;
          _fireflyVelocities[i].y *= 0.8 / speed;
          _fireflyVelocities[i].z *= 0.8 / speed;
        }
      }
      // Update pulsing glow phase
      _fireflyPhases[i] += dt * 3.0; // Pulse frequency
    }
    if (_fireflySystem) {
      _fireflySystem.geometry.attributes.position.needsUpdate = true;
      // Pulsing glow effect
      const pulseIntensity = 0.6 + 0.4 * Math.sin(_campTime * 2.5);
      _fireflySystem.material.opacity = pulseIntensity;
    }
  }

  // ──────────────────────────────────────────────────────────
  // Fire flicker animation
  // ──────────────────────────────────────────────────────────
  function _updateFire(dt) {
    _campTime += dt;
    const flicker = 0.85 + 0.15 * Math.sin(_campTime * 11.3)
                         + 0.10 * Math.sin(_campTime * 7.1)
                         + 0.05 * Math.sin(_campTime * 17.9);
    if (_fireLight) {
      _fireLight.intensity = 6.5 * flicker;  // Updated to match new base intensity
    }
    _flameMeshes.forEach((f, i) => {
      const s = 0.9 + 0.1 * Math.sin(_campTime * (8 + i * 3.1));
      f.scale.set(s, 0.85 + 0.2 * Math.sin(_campTime * (6 + i * 2.7)), s);
      f.material.opacity = 0.7 + 0.15 * Math.sin(_campTime * (5 + i * 1.5));
    });
    // Animate Teleport Portal gem and discs
    const portalMesh = _buildingMeshes['campBoard'];
    if (portalMesh) {
      portalMesh.traverse(function(child) {
        if (child._portalGem) {
          child.position.y = 1.0 + Math.sin(_campTime * 2.0) * 0.15;
          child.rotation.y += dt * 1.5;
        }
        if (child._portalGemWire) {
          child.position.y = 1.0 + Math.sin(_campTime * 2.0) * 0.15;
          child.rotation.y -= dt * 1.0;
        }
        if (child._portalDisc && child.material) {
          child.material.opacity = 0.25 + 0.15 * Math.abs(Math.sin(_campTime * 1.8));
          child.rotation.z += dt * 0.8;
        }
        if (child._portalDisc2 && child.material) {
          child.material.opacity = 0.20 + 0.12 * Math.abs(Math.sin(_campTime * 2.3 + 1.2));
          child.rotation.z -= dt * 1.1;
        }
      });
    }
    // Flicker torch lights for cozy atmosphere
    _updateTorchFlicker();
    // Pulse alien lights on prismReliquary and astralGateway
    _updateAlienLights(dt);
  }

  // ──────────────────────────────────────────────────────────
  // AIDA Camp Corruption — visual degradation as Neural Matrix
  // nodes are unlocked.  Three tiers based on paid-node count:
  //   Tier 1 (≥1 node)  : Sky & stars tint to sickly digital green
  //   Tier 2 (≥3 nodes) : Trees occasionally glitch to neon wireframe
  //   Tier 3 (all nodes): Lake turns pitch black, red binary particles rise
  // ──────────────────────────────────────────────────────────

  /** Count the number of *paid* Neural Matrix nodes the player has unlocked. */
  function _getUnlockedNodeCount() {
    const sd = _saveData || window.saveData;
    if (!sd || !sd.neuralMatrix) return 0;
    const nm = sd.neuralMatrix;
    const paidNodes = ['eventHorizon', 'bloodAlchemy', 'kineticMirror', 'annunakiProtocol'];
    return paidNodes.reduce((n, id) => n + (nm[id] ? 1 : 0), 0);
  }

  /**
   * Returns 0 (none), 1 (sky tint), 2 (+ tree glitch), or 3 (+ lake corruption).
   * Thresholds are tuned to the current Neural Matrix which has 4 paid nodes.
   */
  function _getCorruptionLevel() {
    const n = _getUnlockedNodeCount();
    if (n >= 4) return 3;
    if (n >= 3) return 2;
    if (n >= 1) return 1;
    return 0;
  }

  /** Apply / revert per-tier environmental changes when corruption level changes. */
  function _applyCorruptionTier(level) {
    const THREE = T();
    if (!_campScene || !THREE) return;

    if (level >= 1) {
      // Sickly digital-green sky
      _campScene.background = new THREE.Color(0x030a03);
      if (_campScene.fog) {
        _campScene.fog.color = new THREE.Color(0x061406);
      }
      if (_starsMesh && _starsMesh.material) {
        _starsMesh.material.color.set(0x00ff44);
        _starsMesh.material.size = 0.28;
      }
    } else {
      // Restore natural sky
      _campScene.background = new THREE.Color(0x0a0c18);
      if (_campScene.fog) {
        _campScene.fog.color = new THREE.Color(0x120e08);
      }
      if (_starsMesh && _starsMesh.material) {
        _starsMesh.material.color.set(0xffffff);
        _starsMesh.material.size = 0.35;
      }
    }

    if (level >= 3) {
      // Lake goes pitch black; activate particle opacity
      if (_lakeMesh && _lakeMesh.material) {
        _lakeMesh.material.color.set(0x000000);
        _lakeMesh.material.opacity = 1.0;
      }
      if (_lakeLight) {
        _lakeLight.color.set(0x330000);
        _lakeLight.intensity = 0.8;
      }
      if (_lakeParticles && _lakeParticles.material) {
        _lakeParticles.material.opacity = 0.85;
      }
    } else {
      // Restore natural lake
      if (_lakeMesh && _lakeMesh.material) {
        _lakeMesh.material.color.set(0x1a3a5c);
        _lakeMesh.material.opacity = 0.88;
      }
      if (_lakeLight) {
        _lakeLight.color.set(0x2266aa);
        _lakeLight.intensity = 1.2;
      }
      if (_lakeParticles && _lakeParticles.material) {
        _lakeParticles.material.opacity = 0.0;
        // Reset particle positions below ground so they don't flash on re-enable
        if (_lakeParticlePositions) {
          for (let i = 0; i < LAKE_PARTICLE_COUNT; i++) {
            _lakeParticlePositions[i * 3 + 1] = -5;
          }
          _lakeParticles.geometry.attributes.position.needsUpdate = true;
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // Codex Pyramid Animation (Golden Pyramid with Eye of Horus)
  // ──────────────────────────────────────────────────────────
  function _updateCodexPyramid(dt) {
    const codexMesh = _buildingMeshes['codex'];
    if (!codexMesh) return;

    const pyramid = codexMesh.userData.notifPyramid;
    const eyeGroup = codexMesh.userData.notifEye;
    const light = codexMesh.userData.notifLight;

    if (!pyramid || !pyramid.visible) return;

    // Gentle floating animation (up and down)
    pyramid.position.y = 3.2 + Math.sin(_campTime * 2.0) * 0.08;

    // Slow rotation around Y axis
    pyramid.rotation.y += dt * 0.5;

    // Pulse the pyramid opacity for glow effect
    const pulse = 0.85 + 0.15 * Math.sin(_campTime * 3.0);
    if (pyramid.material) {
      pyramid.material.emissiveIntensity = 0.95 * pulse;
      pyramid.material.opacity = 0.95 * pulse;
    }

    // Sync eye position with pyramid
    if (eyeGroup) {
      eyeGroup.position.y = pyramid.position.y - 0.05;
    }

    // Pulsing light intensity
    if (light) {
      light.intensity = 1.8 + 0.4 * Math.sin(_campTime * 3.5);
    }
  }

  /** Per-frame corruption logic: tree glitch + lake particles. */
  function _updateCorruption(dt) {
    const level = _getCorruptionLevel();

    // Detect tier changes and apply environmental palette swap
    if (level !== _lastCorruptionLevel) {
      _applyCorruptionTier(level);
      _lastCorruptionLevel = level;
    }

    // ── Tier 2: tree glitch ─────────────────────────────────
    if (level >= 2) {
      const THREE = T();
      if (!_treeGlitching) {
        _treeGlitchTimer -= dt;
        if (_treeGlitchTimer <= 0) {
          _treeGlitchTimer = TREE_GLITCH_INTERVAL + Math.random() * 2;
          // Flash a random subset (~1/3) of trees to neon wireframe
          _treeGlitching = true;
          _treeGlitchFlashTimer = 0.2;
          if (!_treeGlitchMat) {
            _treeGlitchMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
          }
          _treeOrigMaterials.forEach((entry) => {
            if (Math.random() < 0.33) {
              entry.canopies.forEach(c => { c.material = _treeGlitchMat; });
              entry._glitched = true;
            }
          });
        }
      } else {
        _treeGlitchFlashTimer -= dt;
        if (_treeGlitchFlashTimer <= 0) {
          // Restore the original materials (no allocation — use stored references)
          _treeOrigMaterials.forEach((entry) => {
            if (entry._glitched) {
              entry.canopies.forEach((c, i) => { c.material = entry.origMats[i]; });
              entry._glitched = false;
            }
          });
          _treeGlitching = false;
        }
      }
    }

    // ── Tier 3: lake binary-code particles ──────────────────
    if (level >= 3 && _lakeParticles && _lakeParticlePositions) {
      for (let i = 0; i < LAKE_PARTICLE_COUNT; i++) {
        _lakeParticleLifetimes[i] -= dt;
        if (_lakeParticleLifetimes[i] <= 0) {
          // Respawn at random lake surface position
          const r = Math.random() * 10;
          const a = Math.random() * Math.PI * 2;
          _lakeParticlePositions[i * 3]     = LAKE_POS.x + Math.cos(a) * r;
          _lakeParticlePositions[i * 3 + 1] = 0.05;
          _lakeParticlePositions[i * 3 + 2] = LAKE_POS.z + Math.sin(a) * r;
          _lakeParticleVelocities[i] = 0.4 + Math.random() * 0.9;
          _lakeParticleLifetimes[i]  = 2.5 + Math.random() * 3;
        } else {
          _lakeParticlePositions[i * 3 + 1] += _lakeParticleVelocities[i] * dt;
        }
      }
      _lakeParticles.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ──────────────────────────────────────────────────────────
  // Player movement + animation states
  // ──────────────────────────────────────────────────────────
  const CAMP_DASH_DURATION = 0.22;
  const CAMP_DASH_SPEED    = 22;
  const CAMP_SLIDE_DURATION = 0.35;
  const CAMP_RUN_THRESHOLD = 5.5;  // speed above this = running
  const CAMP_WALK_THRESHOLD = 0.5; // speed below this = idle

  function _updatePlayer(dt) {
    let mx = 0, mz = 0;

    // Keyboard
    if (_keys['ArrowLeft']  || _keys['KeyA']) mx -= 1;
    if (_keys['ArrowRight'] || _keys['KeyD']) mx += 1;
    if (_keys['ArrowUp']    || _keys['KeyW']) mz -= 1;
    if (_keys['ArrowDown']  || _keys['KeyS']) mz += 1;

    // Internal touch movement (own camp touch system, avoids interference with game joystick)
    if (_touch.active) {
      mx += _touch.x;
      mz += _touch.y;
    }

    // Normalize diagonal
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }

    // ── Dash trigger (Shift or double-tap) ──
    if (!_campDashing && !_campSliding && (_keys['ShiftLeft'] || _keys['ShiftRight']) && len > 0.1) {
      _campDashing = true;
      _campDashTimer = CAMP_DASH_DURATION;
      _campDashVec.x = mx;
      _campDashVec.z = mz;
    }

    // ── Slide trigger (Ctrl) ──
    if (!_campDashing && !_campSliding && (_keys['ControlLeft'] || _keys['ControlRight']) && len > 0.1) {
      _campSliding = true;
      _campSlideTimer = CAMP_SLIDE_DURATION;
    }

    // ── Action triggers (keys) ──
    if (!_campActionAnim) {
      if (_keys['KeyE']) {
        // Priority: A.I.D.A chip pickup / robot insertion (intro quest)
        if (!_aidaIntroState.chipPickedUp && _aidaChipMesh && _aidaChipMesh.visible) {
          // Use chip's live position (chip moves via magnet attraction)
          const cdx = _playerPos.x - _aidaChipMesh.position.x;
          const cdz = _playerPos.z - _aidaChipMesh.position.z;
          if (Math.sqrt(cdx * cdx + cdz * cdz) < AIDA_INTRO_RADIUS) {
            _keys['KeyE'] = false; // consume key
            _pickUpAidaChip();
            return;
          }
        }
        if (_aidaIntroState.chipPickedUp && !_aidaIntroState.chipInserted) {
          // Allow insertion regardless of Quest Hall build state
          const _rp = _getAidaRobotPos();
          const rdx = _playerPos.x - _rp.x;
          const rdz = _playerPos.z - _rp.z;
          if (Math.sqrt(rdx * rdx + rdz * rdz) < AIDA_INTRO_RADIUS) {
            _keys['KeyE'] = false; // consume key
            _insertAidaChip();
            return;
          }
        }
        // Check if player is near the Incubator pod — interact with it
        const _idx = _playerPos.x - INCUBATOR_POS.x;
        const _idz = _playerPos.z - INCUBATOR_POS.z;
        if (Math.sqrt(_idx * _idx + _idz * _idz) < INCUBATOR_INTERACT_RADIUS) {
          _interactIncubator();
        } else {
          _campActionAnim = 'chop';
          _campActionTimer = 0.8;
        }
      } else if (_keys['KeyF']) {
        _campActionAnim = 'shoot';
        _campActionTimer = 0.4;
      } else if (_keys['KeyQ']) {
        _campActionAnim = 'knife';
        _campActionTimer = 0.35;
      } else if (_keys['KeyR']) {
        _campActionAnim = 'gather';
        _campActionTimer = 1.0;
      } else if (_keys['KeyT']) {
        _campActionAnim = 'tool';
        _campActionTimer = 0.6;
      }
    }

    // ── Update dash ──
    if (_campDashing) {
      _campDashTimer -= dt;
      const dashSpeed = CAMP_DASH_SPEED;
      _playerPos.x += _campDashVec.x * dashSpeed * dt;
      _playerPos.z += _campDashVec.z * dashSpeed * dt;
      _playerVel.x = _campDashVec.x * dashSpeed;
      _playerVel.z = _campDashVec.z * dashSpeed;
      if (_campDashTimer <= 0) _campDashing = false;
    }
    // ── Update slide ──
    else if (_campSliding) {
      _campSlideTimer -= dt;
      const slideDecel = _campSlideTimer / CAMP_SLIDE_DURATION;
      _playerPos.x += _playerVel.x * slideDecel * dt;
      _playerPos.z += _playerVel.z * slideDecel * dt;
      if (_campSlideTimer <= 0) _campSliding = false;
    }
    // ── Normal movement ──
    else {
      // Smooth velocity
      const targetX = mx * PLAYER_SPEED;
      const targetZ = mz * PLAYER_SPEED;
      const lerpF = (len > 0) ? 0.18 : 0.12;
      _playerVel.x += (targetX - _playerVel.x) * lerpF;
      _playerVel.z += (targetZ - _playerVel.z) * lerpF;

      // Update position (clamp to camp area)
      _playerPos.x += _playerVel.x * dt;
      _playerPos.z += _playerVel.z * dt;
    }

    // Clamp
    _playerPos.x = Math.max(-38, Math.min(38, _playerPos.x));
    _playerPos.z = Math.max(-38, Math.min(38, _playerPos.z));

    // Update action timer
    if (_campActionAnim) {
      _campActionTimer -= dt;
      if (_campActionTimer <= 0) _campActionAnim = null;
    }

    if (!_playerMesh) return;

    _playerMesh.position.x = _playerPos.x;
    _playerMesh.position.z = _playerPos.z;

    // Rotation toward movement direction — crisp and responsive
    const speed = Math.sqrt(_playerVel.x * _playerVel.x + _playerVel.z * _playerVel.z);
    if (speed > 0.3) {
      const targetAngle = Math.atan2(_playerVel.x, _playerVel.z);
      let da = targetAngle - _playerMesh.rotation.y;
      while (da > Math.PI)  da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      // Track angular velocity for banking lean
      const angVel = da / Math.max(dt, 0.001);
      _campAngularVel += (angVel - _campAngularVel) * Math.min(dt * 12, 0.7);
      _playerMesh.rotation.y += da * 0.25;
      
      // Slide detection: sharp turn at speed
      const turnIntensity = Math.abs(_campAngularVel) * speed;
      if (turnIntensity > 15) {
        _campSlideAmt = Math.min(1, _campSlideAmt + dt * 6);
      }
    } else {
      _campAngularVel *= 0.85;
    }
    _campSlideAmt = Math.max(0, _campSlideAmt - dt * 3);

    // ── Determine animation state ──
    let newState = 'idle';
    if (_campActionAnim) {
      newState = _campActionAnim;
    } else if (_campDashing) {
      newState = 'dash';
    } else if (_campSliding) {
      newState = 'slide';
    } else if (speed > CAMP_RUN_THRESHOLD) {
      newState = 'run';
    } else if (speed > CAMP_WALK_THRESHOLD) {
      newState = 'walk';
    }

    if (newState !== _campAnimState) {
      _campAnimState = newState;
      _campAnimTimer = 0;
    }
    _campAnimTimer += dt;

    // ── Apply 3D procedural animation per state ──
    const phase = _campAnimTimer;

    // Bobbing height
    let bobY = 0;
    // Body squish
    let scaleY = 1, scaleXZ = 1;
    // Limb swing
    let armSwing = 0, legSwing = 0;

    switch (_campAnimState) {
      case 'idle':
        bobY = Math.sin(_campTime * 2.5) * 0.04;
        armSwing = Math.sin(_campTime * 1.5) * 0.08;
        break;
      case 'walk': {
        // Speed-proportional walk animation
        const walkRate = 8 + Math.min(speed * 0.5, 4);
        bobY = Math.sin(phase * walkRate) * 0.06;
        armSwing = Math.sin(phase * walkRate) * (0.25 + speed * 0.03);
        legSwing = Math.sin(phase * walkRate) * (0.30 + speed * 0.03);
        scaleY = 1.0 + Math.sin(phase * walkRate * 2) * 0.03;
        scaleXZ = 1.0 - Math.sin(phase * walkRate * 2) * 0.015;
        break;
      }
      case 'run': {
        // Speed-proportional run animation
        const runRate = 12 + Math.min(speed * 0.3, 6);
        bobY = Math.sin(phase * runRate) * 0.10;
        armSwing = Math.sin(phase * runRate) * 0.55;
        legSwing = Math.sin(phase * runRate) * 0.65;
        scaleY = 1.0 + Math.sin(phase * runRate * 2) * 0.06;
        scaleXZ = 1.0 - Math.sin(phase * runRate * 2) * 0.03;
        // Forward lean proportional to speed
        const fwdLean = -(0.10 + Math.min(speed * 0.01, 0.12));
        _campForwardLean += (fwdLean - _campForwardLean) * Math.min(dt * 12, 0.6);
        break;
      }
      case 'dash':
        bobY = -0.1;  // low to ground
        scaleY = 0.6;
        scaleXZ = 1.4;
        armSwing = -0.8; // arms back
        legSwing = -0.3;
        _campForwardLean += (-0.3 - _campForwardLean) * 0.3; // smooth strong forward lean
        break;
      case 'slide':
        bobY = -0.15;
        scaleY = 0.5;
        scaleXZ = 1.3;
        armSwing = 0; // arms out
        legSwing = 0.2;
        break;
      case 'shoot': {
        const t = _campActionTimer / 0.4;
        const recoil = Math.sin((1 - t) * Math.PI) * 0.15;
        bobY = recoil * 0.05;
        armSwing = 0;
        // Gun recoil — kick right arm back
        if (_playerRightArm) _playerRightArm.rotation.x = -0.8 + recoil * 2.0;
        if (_playerGunBody) _playerGunBody.position.z = 0.30 - recoil * 0.15;
        break;
      }
      case 'knife': {
        const t = _campActionTimer / 0.35;
        const slash = Math.sin((1 - t) * Math.PI * 2);
        armSwing = 0;
        if (_playerRightArm) _playerRightArm.rotation.x = slash * 1.2;
        if (_playerRightArm) _playerRightArm.rotation.z = -Math.PI / 6 + slash * 0.5;
        break;
      }
      case 'chop': {
        const chopPhase = Math.sin(phase * 8);
        armSwing = 0;
        if (_playerRightArm) _playerRightArm.rotation.x = chopPhase * 1.4;
        if (_playerLeftArm) _playerLeftArm.rotation.x = chopPhase * 0.6;
        bobY = Math.abs(chopPhase) * 0.04;
        break;
      }
      case 'gather': {
        const gatherPhase = Math.sin(phase * 5);
        bobY = -0.08 + Math.abs(gatherPhase) * 0.08; // bobbing down and up
        armSwing = 0;
        if (_playerRightArm) _playerRightArm.rotation.x = 0.6 + gatherPhase * 0.4;
        if (_playerLeftArm) _playerLeftArm.rotation.x = 0.6 - gatherPhase * 0.4;
        scaleY = 0.95;
        break;
      }
      case 'tool': {
        const toolPhase = Math.sin(phase * 10);
        armSwing = 0;
        if (_playerRightArm) _playerRightArm.rotation.x = toolPhase * 1.0;
        bobY = Math.abs(toolPhase) * 0.03;
        break;
      }
    }

    // Apply body position
    _playerMesh.position.y = PLAYER_RADIUS + bobY;

    // Apply body squish to first child (body mesh)
    if (_playerMesh.children[0]) {
      _playerMesh.children[0].scale.set(scaleXZ, scaleY, scaleXZ);
    }

    // Apply limb animation (only if not overridden by action states)
    if (_campAnimState !== 'shoot' && _campAnimState !== 'knife' &&
        _campAnimState !== 'chop' && _campAnimState !== 'gather' && _campAnimState !== 'tool') {
      if (_playerLeftArm) _playerLeftArm.rotation.x = armSwing;
      if (_playerRightArm) _playerRightArm.rotation.x = -armSwing;
      if (_playerLeftLeg) _playerLeftLeg.rotation.x = -legSwing;
      if (_playerRightLeg) _playerRightLeg.rotation.x = legSwing;
      // Reset gun position when not in action state
      if (_playerGunBody) _playerGunBody.position.z = 0.30;
    } else {
      // Legs stay still during action states
      if (_playerLeftLeg) _playerLeftLeg.rotation.x = 0;
      if (_playerRightLeg) _playerRightLeg.rotation.x = 0;
    }

    // Physics-based lean: forward lean + bank lean into turns
    // Bank lean driven by angular velocity — replaces static rotation that caused 'rolling'
    const maxBank = 0.20;
    const bankInput = -_campAngularVel * 0.015 * (1 + _campSlideAmt * 0.5);
    const targetBank = Math.max(-maxBank, Math.min(maxBank, bankInput));
    const campLeanDt = Math.min(dt * 12, 0.6);
    _campBankLean += (targetBank - _campBankLean) * campLeanDt;
    
    if (_campAnimState !== 'dash' && _campAnimState !== 'run') {
      // Settle forward lean for non-run states
      _campForwardLean += (0 - _campForwardLean) * Math.min(dt * 8, 0.45);
    }
    _playerMesh.rotation.x = _campForwardLean;
    _playerMesh.rotation.z = _campBankLean;

    // Bandage tail physics — sway based on movement
    if (_playerBandageTail) {
      _playerBandageTail.rotation.x = Math.sin(_campTime * 4 + speed) * 0.2 * (1 + speed * 0.1);
    }

    // ── Update sprite animator overlay (disabled — see _initSpriteOverlay) ──
    // if (_spriteAnimator) {
    //   _spriteAnimator.update(dt);
    //   if (_spriteAnimator.currentAnim() !== _campAnimState) {
    //     _spriteAnimator.play(_campAnimState);
    //   }
    // }
  }

  // ──────────────────────────────────────────────────────────
  // Camera follow
  // ──────────────────────────────────────────────────────────
  function _updateCamera(dt) {
    if (!_campCamera || !_playerMesh) return;
    // Camera offset: diagonal top-down angle similar to the main game camera
    // Main game uses an orthographic camera at (18,16,18) from player.
    // Here we mimic that with a perspective offset.
    const targetCX = _playerPos.x + 11;
    const targetCZ = _playerPos.z + 13;
    const targetCY = 14;

    if (dt === 0) {
      // Immediate snap on init
      _campCamera.position.set(targetCX, targetCY, targetCZ);
    } else {
      _campCamera.position.x += (targetCX - _campCamera.position.x) * 0.06;
      _campCamera.position.y += (targetCY - _campCamera.position.y) * 0.06;
      _campCamera.position.z += (targetCZ - _campCamera.position.z) * 0.06;
    }
    _campCamera.lookAt(_playerPos.x, 0, _playerPos.z);
  }

  // ──────────────────────────────────────────────────────────
  // Sign-post labels: face camera every frame
  // ──────────────────────────────────────────────────────────
  function _updateSigns() {
    if (!_campCamera) return;
    for (const def of BUILDING_DEFS) {
      const grp = _buildingMeshes[def.id];
      if (!grp || !grp.visible) continue;
      // Last child is the sign plane
      const sign = grp.children[grp.children.length - 1];
      if (sign && sign.isMesh) {
        sign.lookAt(_campCamera.position);
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // Proximity / interaction
  // ──────────────────────────────────────────────────────────
  function _updateInteraction() {
    let nearest = null;
    let nearestDist = Infinity;

    for (const def of BUILDING_DEFS) {
      const grp = _buildingMeshes[def.id];
      if (!grp || !grp.visible) continue;
      const dx = _playerPos.x - def.x;
      const dz = _playerPos.z - def.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < INTERACTION_RADIUS && dist < nearestDist) {
        nearestDist = dist;
        nearest = def;
      }
    }

    if (_nearBuilding !== (nearest ? nearest.id : null)) {
      _nearBuilding = nearest ? nearest.id : null;
      _updatePromptUI();
    }
  }

  function _isBuildingUnlocked(buildingId) {
    if (!_saveData || !_saveData.campBuildings) return false;
    const bd = _saveData.campBuildings[buildingId];
    // A building is truly "unlocked" (enterable) ONLY when it has been built (level > 0).
    // unlocked=true with level===0 means the quest unlocked it but it still needs building.
    return bd ? (bd.level > 0) : false;
  }

  // Returns true if this building is unlocked by a quest but not yet built (level===0)
  function _isBuildingNeedsBuild(buildingId) {
    if (!_saveData || !_saveData.campBuildings) return false;
    const bd = _saveData.campBuildings[buildingId];
    return bd ? (bd.unlocked === true && !bd.level) : false;
  }

  // Returns true if this building has a ready-to-claim quest that would unlock it
  function _isBuildingReadyForBuild(buildingId) {
    if (!_saveData || !_saveData.tutorialQuests) return false;
    var map = window._buildingQuestUnlockMap;
    if (!map) return false;
    var questId = map[buildingId];
    if (!questId) return false;
    var readyToClaim = _saveData.tutorialQuests.readyToClaim || [];
    return readyToClaim.indexOf(questId) !== -1;
  }

  function _updatePromptUI() {
    if (!_promptEl) return;
    // Never show the prompt or interact button while a building menu is open
    if (_menuOpen) {
      _promptEl.style.display = 'none';
      if (_interactBtn) _interactBtn.style.display = 'none';
      if (_buildingNameEl) _buildingNameEl.style.display = 'none';
      return;
    }
    if (_nearBuilding) {
      const def = BUILDING_DEFS.find(d => d.id === _nearBuilding);
      if (def) {
        // Display building name in separate element
        if (_buildingNameEl) {
          _buildingNameEl.textContent = `${def.icon}  ${def.label}`;
          _buildingNameEl.style.display = 'block';
        }

        if (_isBuildingUnlocked(_nearBuilding)) {
          // Building is built (level > 0) — show ENTER
          _promptEl.textContent = `Press [E] to Enter`;
          if (_interactBtn) {
            _interactBtn.textContent = 'ENTER';
            _interactBtn.style.background = 'linear-gradient(135deg,#c8a248,#8b6914)';
            _interactBtn.style.display = 'block';
          }
        } else if (_isBuildingNeedsBuild(_nearBuilding)) {
          // Building unlocked by quest but not yet built — show BUILD
          _promptEl.textContent = `Press [E] to Build`;
          if (_interactBtn) {
            _interactBtn.textContent = 'BUILD';
            _interactBtn.style.background = 'linear-gradient(135deg,#2980b9,#1a5276)';
            _interactBtn.style.display = 'block';
          }
        } else if (_isBuildingReadyForBuild(_nearBuilding)) {
          _promptEl.textContent = `Press [E] to Build`;
          if (_interactBtn) {
            _interactBtn.textContent = 'BUILD';
            _interactBtn.style.background = 'linear-gradient(135deg,#2980b9,#1a5276)';
            _interactBtn.style.display = 'block';
          }
        } else {
          _promptEl.textContent = `🔒 Complete quests to unlock`;
          if (_interactBtn) _interactBtn.style.display = 'none';
        }
        _promptEl.style.display = 'block';
      }
    } else {
      _promptEl.style.display = 'none';
      if (_interactBtn) _interactBtn.style.display = 'none';
      if (_buildingNameEl) _buildingNameEl.style.display = 'none';
    }
  }

  function _interact() {
    if (_menuOpen) return; // already showing a building menu

    // ── A.I.D.A intro interactions (chip pickup / robot insertion) ─
    if (!_aidaIntroState.chipPickedUp && _aidaChipMesh && _aidaChipMesh.visible) {
      // Use chip's live position (chip moves via magnet)
      const cdx = _playerPos.x - _aidaChipMesh.position.x;
      const cdz = _playerPos.z - _aidaChipMesh.position.z;
      if (Math.sqrt(cdx * cdx + cdz * cdz) < AIDA_INTRO_RADIUS) {
        _pickUpAidaChip();
        return;
      }
    }
    if (_aidaIntroState.chipPickedUp && !_aidaIntroState.chipInserted) {
      // Allow insertion regardless of Quest Hall build state
      const _rp = _getAidaRobotPos();
      const rdx = _playerPos.x - _rp.x;
      const rdz = _playerPos.z - _rp.z;
      if (Math.sqrt(rdx * rdx + rdz * rdz) < AIDA_INTRO_RADIUS) {
        _insertAidaChip();
        return;
      }
    }
    // Post-insertion: near robot shows hint to go to Quest Hall (no longer opens Profile)
    if (_aidaIntroState.chipInserted) {
      const _rp = _getAidaRobotPos();
      const rdx = _playerPos.x - _rp.x;
      const rdz = _playerPos.z - _rp.z;
      if (Math.sqrt(rdx * rdx + rdz * rdz) < AIDA_INTRO_RADIUS) {
        const DS = window.DialogueSystem;
        if (DS && DS.DIALOGUES && DS.DIALOGUES.aidaQuestHallHint) {
          _openMenu();
          _playerVel.x = 0; _playerVel.z = 0;
          _keys = {}; _touch.active = false;
          DS.show(DS.DIALOGUES.aidaQuestHallHint, {
            onComplete: function() { _menuOpen = false; document.body.classList.remove('camp-menu-open'); }
          });
        }
        return;
      }
    }

    if (!_nearBuilding) return;

    // accountBuilding (Profile) must NOT be manually built - it unlocks via quest progression
    if (_nearBuilding === 'accountBuilding' && !_isBuildingUnlocked('accountBuilding')) return;

    // If this building is locked but has a ready-to-claim quest, show the build overlay directly
    if (!_isBuildingUnlocked(_nearBuilding) && _isBuildingReadyForBuild(_nearBuilding)) {
      const def = BUILDING_DEFS.find(d => d.id === _nearBuilding);
      const buildingName = def ? def.label : _nearBuilding;
      // Auto-claim the quest silently to give rewards, then show build overlay
      const map = window._buildingQuestUnlockMap;
      if (map && map[_nearBuilding] && typeof window.claimTutorialQuest === 'function') {
        const targetId = _nearBuilding;
        // Claim rewards without re-triggering build overlay from claimTutorialQuest
        // by temporarily patching _campShowBuildOverlay. Use try-finally so the
        // original is always restored even if claimTutorialQuest throws.
        const origOverlay = window._campShowBuildOverlay;
        window._campShowBuildOverlay = null;
        try {
          window.claimTutorialQuest(map[targetId]);
        } finally {
          window._campShowBuildOverlay = origOverlay;
        }
        // Now show our own build overlay
        if (typeof origOverlay === 'function') {
          origOverlay(targetId, buildingName);
        }
      }
      return;
    }

    // Building is unlocked by quest but not yet built — show build overlay
    if (_isBuildingNeedsBuild(_nearBuilding)) {
      const def = BUILDING_DEFS.find(d => d.id === _nearBuilding);
      const buildingName = def ? def.label : _nearBuilding;
      if (typeof window._campShowBuildOverlay === 'function') {
        window._campShowBuildOverlay(_nearBuilding, buildingName);
      }
      return;
    }

    // Block interaction with locked buildings
    if (!_isBuildingUnlocked(_nearBuilding)) {
      if (typeof showStatusMessage === 'function') {
        showStatusMessage('🔒 Complete quests to unlock this building!', 2000);
      }
      return;
    }
    // Built-in Slot Machine interaction (no external callback needed)
    if (_nearBuilding === 'slotMachine') {
      _openMenu();
      _playerVel.x = 0; _playerVel.z = 0;
      _keys = {}; _touch.active = false;
      _showSlotMachineUI();
      return;
    }
    const fn = _callbacks[_nearBuilding];
    if (typeof fn === 'function') {
      // Pause camp input while the building menu is open
      _openMenu();
      _playerVel.x = 0;
      _playerVel.z = 0;
      _keys = {};
      _touch.active = false;
      _touch.x = 0;
      _touch.y = 0;
      _hideTouchIndicator();
      // Hide A.I.D.A terminal dialogue when any building menu opens
      if (window.DialogueSystem && typeof window.DialogueSystem.hideOnMenuOpen === 'function') {
        window.DialogueSystem.hideOnMenuOpen();
      }
      fn();
    } else {
      console.warn('[CampWorld] No callback registered for building:', _nearBuilding);
    }
  }

  // Known overlay/screen element IDs that camp building callbacks may show.
  // Used by _checkMenuClosed() to auto-detect when the player closes a menu.
  // Also exposed as window._CAMP_OVERLAY_IDS for use by other modules (e.g. dialogue-system.js).
  const _OVERLAY_IDS = [
    'gear-screen', 'achievements-screen', 'progression-shop',
    'companion-house-modal', 'inventory-screen-modal',
    'camp-board-overlay', 'special-attacks-panel-overlay',
    'quest-hall-overlay', 'prestige-menu', 'expeditions-menu',
    // Additional overlays added to fix stuck menus
    'prism-reliquary-overlay', 'neural-matrix-overlay',
    'armory-overlay', 'recycle-overlay', 'campfire-kitchen-overlay',
    'workshop-overlay', 'gacha-store-overlay', 'aida-dark-pact-overlay',
    'aida-modal-overlay', 'camp-codex-screen', 'character-visuals-screen', 'codex-screen',
    'weaponsmith-overlay',
    // Progression upgrades overlay (camp-bld-overlay style)
    'progression-shop-overlay',
    // Profile/account building overlay
    'account-building-overlay',
    // 1945 minigame overlay
    'neural-1945-overlay',
    // WaterDrop Runner overlay
    'wdr-overlay',
    // Advanced Clicker overlay
    'adv-clicker-overlay',
    // Slot Machine overlay
    'slot-machine-overlay',
    // Reward earned overlay
    'camp-reward-overlay',
    // Profile modal overlay
    'camp-profile-modal',
  ];
  window._CAMP_OVERLAY_IDS = _OVERLAY_IDS;

  // ════════════════════════════════════════════════════════════════════════
  // CAMP STORYLINE BAR ("notisbar") — persistent quest objective display
  // ════════════════════════════════════════════════════════════════════════
  let _storylineBarEl = null;
  function _ensureStorylineBar() {
    if (_storylineBarEl) return;
    _storylineBarEl = document.createElement('div');
    _storylineBarEl.id = 'camp-storyline-bar';
    _storylineBarEl.style.cssText = [
      'position:fixed', 'bottom:18px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:210', 'padding:10px 28px', 'border-radius:8px',
      'background:linear-gradient(90deg,rgba(0,0,0,0.85),rgba(10,10,30,0.92),rgba(0,0,0,0.85))',
      'border:1px solid rgba(0,255,255,0.3)',
      'box-shadow:0 0 20px rgba(0,255,255,0.15),0 4px 12px rgba(0,0,0,0.6)',
      'font-family:"Segoe UI",sans-serif', 'font-size:13px', 'color:#00ffcc',
      'letter-spacing:1.5px', 'text-align:center',
      'pointer-events:none', 'display:none', 'max-width:80vw', 'white-space:nowrap',
      'text-overflow:ellipsis', 'overflow:hidden',
    ].join(';');
    document.body.appendChild(_storylineBarEl);
  }
  var _lastStorylineText = null;
  function _setCampStoryline(text) {
    if (text === _lastStorylineText) return; // skip redundant DOM writes
    _lastStorylineText = text;
    _ensureStorylineBar();
    if (!text) {
      _storylineBarEl.style.display = 'none';
      return;
    }
    _storylineBarEl.textContent = text;
    _storylineBarEl.style.display = 'block';
  }
  window._setCampStoryline = _setCampStoryline;

  // ════════════════════════════════════════════════════════════════════════
  // PLAYER COMIC BUBBLE — thought/speech bubble above player character
  // ════════════════════════════════════════════════════════════════════════
  let _playerBubbleEl = null;
  let _playerBubbleTimer = 0;
  function _ensurePlayerBubble() {
    if (_playerBubbleEl) return;
    _playerBubbleEl = document.createElement('div');
    _playerBubbleEl.id = 'camp-player-bubble';
    _playerBubbleEl.style.cssText = [
      'position:fixed', 'z-index:220', 'padding:8px 16px', 'border-radius:14px',
      'background:rgba(255,255,255,0.95)', 'border:2px solid #333',
      'box-shadow:0 3px 10px rgba(0,0,0,0.4)',
      'font-family:"Comic Sans MS","Segoe UI",cursive', 'font-size:13px', 'color:#222',
      'max-width:260px', 'text-align:center', 'pointer-events:none', 'display:none',
      'transform:translate(-50%,-100%)',
    ].join(';');
    // Comic tail
    var tail = document.createElement('div');
    tail.style.cssText = [
      'position:absolute', 'bottom:-10px', 'left:50%', 'transform:translateX(-50%)',
      'width:0', 'height:0',
      'border-left:8px solid transparent', 'border-right:8px solid transparent',
      'border-top:10px solid #fff',
    ].join(';');
    _playerBubbleEl.appendChild(tail);
    document.body.appendChild(_playerBubbleEl);
  }
  function _showPlayerBubble(text, durationMs) {
    _ensurePlayerBubble();
    // Set text before the tail
    var span = _playerBubbleEl.querySelector('span');
    if (!span) {
      span = document.createElement('span');
      _playerBubbleEl.insertBefore(span, _playerBubbleEl.firstChild);
    }
    span.textContent = text;
    _playerBubbleEl.style.display = 'block';
    _playerBubbleTimer = (durationMs || 3000) / 1000;
  }
  function _updatePlayerBubble(dt) {
    if (!_playerBubbleEl || _playerBubbleTimer <= 0) return;
    _playerBubbleTimer -= dt;
    if (_playerBubbleTimer <= 0) {
      _playerBubbleEl.style.display = 'none';
      return;
    }
    // Position above the player character using screen projection
    if (_playerMesh && _campCamera) {
      var THREE = T();
      if (!_campUITmpVec && THREE) _campUITmpVec = new THREE.Vector3();
      if (_campUITmpVec) {
        _campUITmpVec.copy(_playerMesh.position);
        _campUITmpVec.y += 1.8;
        _campUITmpVec.project(_campCamera);
        var x = (_campUITmpVec.x * 0.5 + 0.5) * window.innerWidth;
        var y = (-_campUITmpVec.y * 0.5 + 0.5) * window.innerHeight;
        _playerBubbleEl.style.left = x + 'px';
        _playerBubbleEl.style.top = y + 'px';
      }
    }
  }
  window._showPlayerBubble = _showPlayerBubble;

  // ════════════════════════════════════════════════════════════════════════
  // REWARD EARNED NOTIFICATION — overlay requiring OK press
  // ════════════════════════════════════════════════════════════════════════
  let _rewardOverlayEl = null;
  function _showRewardEarned(rewards, title, onOK) {
    if (_rewardOverlayEl && _rewardOverlayEl.parentNode) _rewardOverlayEl.parentNode.removeChild(_rewardOverlayEl);
    // Pause camp input while reward overlay is shown
    _openMenu();
    _rewardOverlayEl = document.createElement('div');
    _rewardOverlayEl.id = 'camp-reward-overlay';
    _rewardOverlayEl.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:25000', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.8)',
      'font-family:"Bangers",cursive',
    ].join(';');
    var box = document.createElement('div');
    box.style.cssText = [
      'background:linear-gradient(135deg,rgba(8,20,8,0.95),rgba(5,15,5,0.98))',
      'border:2px solid rgba(0,255,100,0.5)', 'border-radius:16px',
      'padding:30px 50px', 'text-align:center', 'max-width:400px',
      'box-shadow:0 0 40px rgba(0,255,100,0.2)',
    ].join(';');
    var titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:28px;color:#00ff66;letter-spacing:3px;margin-bottom:16px;text-shadow:0 0 20px #00ff66;';
    titleEl.textContent = title || '🎁 REWARD EARNED';
    box.appendChild(titleEl);
    // Render each reward line
    if (Array.isArray(rewards)) {
      rewards.forEach(function(r) {
        var line = document.createElement('div');
        line.style.cssText = 'font-size:18px;color:#FFD700;margin:6px 0;font-family:"Segoe UI",sans-serif;';
        line.textContent = r;
        box.appendChild(line);
      });
    }
    // OK button
    var okBtn = document.createElement('button');
    okBtn.style.cssText = [
      'margin-top:24px', 'padding:12px 48px', 'font-size:20px',
      'font-family:"Bangers",cursive', 'color:#000', 'background:#00ff66',
      'border:none', 'border-radius:8px', 'cursor:pointer',
      'letter-spacing:2px', 'box-shadow:0 0 20px rgba(0,255,100,0.4)',
    ].join(';');
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', function() {
      if (_rewardOverlayEl && _rewardOverlayEl.parentNode) _rewardOverlayEl.parentNode.removeChild(_rewardOverlayEl);
      _rewardOverlayEl = null;
      _resumeInput();
      if (onOK) onOK();
    });
    box.appendChild(okBtn);
    _rewardOverlayEl.appendChild(box);
    document.body.appendChild(_rewardOverlayEl);
  }
  window._showRewardEarned = _showRewardEarned;

  // ════════════════════════════════════════════════════════════════════════
  // ACHIEVEMENT NOTIFICATION — toast with OK button
  // ════════════════════════════════════════════════════════════════════════
  function _showAchievementToast(text, rewards, onOK) {
    _showRewardEarned(rewards, '🏆 ' + text, onOK);
  }
  window._showAchievementToast = _showAchievementToast;

  // ════════════════════════════════════════════════════════════════════════
  // POST-RUN NOTIFICATION CHAIN — sequential overlays on camp return
  // Shows account level-up → achievements → challenges → rank → reward earned
  // ════════════════════════════════════════════════════════════════════════
  function _showPostRunNotifications() {
    var sd = (typeof saveData !== 'undefined') ? saveData : null;
    if (!sd) return;
    var steps = [];

    // 1. Account level-up notification
    var pendingLevelUp = window._pendingAccountLevelUp;
    if (pendingLevelUp && pendingLevelUp.leveledUp) {
      steps.push(function(next) {
        _showRewardEarned(
          ['⬆️ Account Level ' + (pendingLevelUp.newLevel || sd.accountLevel || 1)],
          '🎉 ACCOUNT LEVEL UP!',
          next
        );
      });
      window._pendingAccountLevelUp = null;
    }

    // 2. Achievements earned this run
    var pendingAchievements = window._pendingRunAchievements;
    if (pendingAchievements && pendingAchievements.length > 0) {
      pendingAchievements.forEach(function(ach) {
        steps.push(function(next) {
          _showRewardEarned(
            ach.rewards || [],
            '🏆 ' + (ach.name || 'Achievement Unlocked!'),
            next
          );
        });
      });
      window._pendingRunAchievements = null;
    }

    // 3. Rank change
    var pendingRank = window._pendingRankChange;
    if (pendingRank) {
      steps.push(function(next) {
        _showRewardEarned(
          ['New Rank: ' + (pendingRank.title || 'Unknown')],
          '⚔️ RANK UP!',
          next
        );
      });
      window._pendingRankChange = null;
    }

    // 4. Final "reward earned" summary if XP was earned
    var runStats = window.currentRunStats;
    if (runStats && (runStats.xpAccumulated || runStats.goldEarned)) {
      var finalRewards = [];
      if (runStats.xpAccumulated) finalRewards.push('⭐ +' + runStats.xpAccumulated + ' XP Earned');
      if (runStats.goldEarned) finalRewards.push('🪙 +' + runStats.goldEarned + ' Gold');
      if (runStats.kills) finalRewards.push('⚔️ ' + runStats.kills + ' Kills');
      if (finalRewards.length > 0) {
        steps.push(function(next) {
          _showRewardEarned(finalRewards, '📊 RUN SUMMARY', next);
        });
      }
    }

    // Execute steps sequentially
    function _runStep(idx) {
      if (idx >= steps.length) return;
      steps[idx](function() { _runStep(idx + 1); });
    }
    if (steps.length > 0) _runStep(0);
  }

  /**
   * Auto-detect when a building overlay has been dismissed.
   * If _menuOpen is true but no known overlay is visible, resume camp input.
   */
  function _checkMenuClosed() {
    if (!_menuOpen) return;
    // Wait at least 350ms after menu opened before checking — avoids race where
    // the overlay hasn't been appended to DOM yet (JS is synchronous but DOM
    // rendering is deferred; empirically 350ms covers one full render cycle).
    if (Date.now() - _menuOpenTs < 350) return;
    const campScreen = document.getElementById('camp-screen');
    // If camp-screen itself is hidden, another full-screen took over; wait for it.
    if (campScreen && campScreen.style.display === 'none') return;

    // Check if any overlay element (from the building callback list) is visible
    for (let i = 0; i < _OVERLAY_IDS.length; i++) {
      const el = document.getElementById(_OVERLAY_IDS[i]);
      if (!el) continue;
      // Use getComputedStyle so we catch CSS-visible elements as well as inline-styled ones
      var cs = getComputedStyle(el);
      if (cs.display !== 'none') return;
    }

    // Check for camp tab panels that might be open (skill tree, training)
    const campTabs = document.getElementById('camp-tabs');
    if (campTabs) {
      var cts = getComputedStyle(campTabs);
      if (cts.display !== 'none') return;
    }

    // No overlay detected — resume camp input
    _resumeInput();
  }

  function _resumeInput() {
    if (!_menuOpen) return;
    _menuOpen = false;
    document.body.classList.remove('camp-menu-open');
    _keys = {};
    _touch.active = false;
    _touch.x = 0;
    _touch.y = 0;
    // Refresh prompt in case building state changed while menu was open
    _updatePromptUI();
  }

  // Helper: mark menu as open, add CSS class to body, and immediately hide the interact prompt.
  // Use this instead of setting _menuOpen manually to ensure the CSS class (used by
  // .camp-menu-open #camp-interact-prompt { display: none !important }) is always in sync.
  function _openMenu() {
    _menuOpen = true; _menuOpenTs = Date.now();
    document.body.classList.add('camp-menu-open');
    if (_promptEl) _promptEl.style.display = 'none';
    if (_interactBtn) _interactBtn.style.display = 'none';
    if (_buildingNameEl) _buildingNameEl.style.display = 'none';
  }

  // ──────────────────────────────────────────────────────────
  // Refresh building visibility based on save data
  // ──────────────────────────────────────────────────────────
  function _refreshBuildings() {
    if (!_saveData) return;
    const THREE = T();
    for (const def of BUILDING_DEFS) {
      const grp = _buildingMeshes[def.id];
      if (!grp) continue;
      const bd = _saveData.campBuildings && _saveData.campBuildings[def.id];
      const isUnlocked = bd ? (bd.unlocked === true) : false;
      const isBuilt = bd ? (bd.level > 0) : false;

      if (isBuilt) {
        // Fully built — show normally
        grp.visible = true;
        _setBlueprintMode(grp, false);
        _setConstructionMode(grp, false);
      } else if (isUnlocked) {
        // Unlocked by quest but NOT yet built — show in construction/scaffolding mode
        grp.visible = true;
        _setBlueprintMode(grp, false);
        _setConstructionMode(grp, true);
      } else {
        // Locked — completely hidden, camp starts empty and builds piece by piece
        grp.visible = false;
        _setBlueprintMode(grp, false);
        _setConstructionMode(grp, false);
      }
    }
  }

  // Apply or remove blueprint (locked) visual mode to a building group
  function _setBlueprintMode(grp, enable) {
    const THREE = T();
    grp.traverse(child => {
      if (!child.isMesh) return;
      if (enable) {
        // Store original material if not already stored
        if (!child.userData._origMaterial) {
          child.userData._origMaterial = child.material;
        }
        // Blueprint: wireframe + semi-transparent blue tint
        if (!child.userData._blueprintMat) {
          child.userData._blueprintMat = new THREE.MeshBasicMaterial({
            color: 0x4488FF,
            transparent: true,
            opacity: 0.18,
            wireframe: false,
            depthWrite: false,
            side: THREE.DoubleSide
          });
        }
        child.material = child.userData._blueprintMat;
      } else {
        // Restore original material
        if (child.userData._origMaterial) {
          child.material = child.userData._origMaterial;
        }
      }
    });
  }

  // Apply or remove construction (needs-build) visual mode to a building group.
  // Shows the building as a semi-transparent orange scaffold — distinct from both
  // the blue blueprint (locked) and normal (built) appearances.
  function _setConstructionMode(grp, enable) {
    const THREE = T();
    grp.traverse(child => {
      if (!child.isMesh) return;
      if (enable) {
        if (!child.userData._origMaterial) {
          child.userData._origMaterial = child.material;
        }
        if (!child.userData._constructionMat) {
          child.userData._constructionMat = new THREE.MeshBasicMaterial({
            color: 0xFF9933,
            transparent: true,
            opacity: 0.45,
            wireframe: true,
            depthWrite: false,
            side: THREE.DoubleSide
          });
        }
        child.material = child.userData._constructionMat;
      } else {
        // Restore original material if currently showing construction mode
        if (child.userData._origMaterial && child.userData._constructionMat &&
            (child.material === child.userData._constructionMat)) {
          child.material = child.userData._origMaterial;
        }
      }
    });
  }

  // Play animation when a building is first unlocked and appears as construction scaffolding
  function _playBuildingAppearAnimation(buildingId) {
    const grp = _buildingMeshes[buildingId];
    if (!grp) return;
    const THREE = T();

    // Building materializes from transparency with shimmer effect
    const APPEAR_DURATION_MS = 800;
    const startTime = performance.now();

    // Start with construction mode already applied
    _setBlueprintMode(grp, false);
    _setConstructionMode(grp, true);
    grp.visible = true;

    // Create initial shimmer/reveal particles
    if (_campScene) {
      const SHIMMER_COUNT = 50;
      const shimmerGeo = new THREE.BufferGeometry();
      const shimmerPos = new Float32Array(SHIMMER_COUNT * 3);
      const shimmerVel = [];

      for (let i = 0; i < SHIMMER_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 3;
        const h = Math.random() * 4;
        shimmerPos[i * 3]     = grp.position.x + Math.sin(a) * r;
        shimmerPos[i * 3 + 1] = h;
        shimmerPos[i * 3 + 2] = grp.position.z + Math.cos(a) * r;

        shimmerVel.push({
          x: (Math.random() - 0.5) * 0.5,
          y: 0.3 + Math.random() * 0.5,
          z: (Math.random() - 0.5) * 0.5
        });
      }

      shimmerGeo.setAttribute('position', new THREE.BufferAttribute(shimmerPos, 3));
      const shimmerMat = new THREE.PointsMaterial({
        color: 0xFF9933, // Orange construction color
        size: 0.25,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const shimmerParticles = new THREE.Points(shimmerGeo, shimmerMat);
      _campScene.add(shimmerParticles);

      const pStartMs = performance.now();
      function animShimmer() {
        const pt = Math.min((performance.now() - pStartMs) / 1500, 1);
        shimmerMat.opacity = 1.0 - pt;

        for (let i = 0; i < SHIMMER_COUNT; i++) {
          shimmerPos[i * 3]     += shimmerVel[i].x * 0.016;
          shimmerPos[i * 3 + 1] += shimmerVel[i].y * 0.016;
          shimmerPos[i * 3 + 2] += shimmerVel[i].z * 0.016;
        }
        shimmerGeo.attributes.position.needsUpdate = true;

        if (pt < 1) {
          requestAnimationFrame(animShimmer);
        } else {
          _campScene.remove(shimmerParticles);
          shimmerGeo.dispose();
          shimmerMat.dispose();
        }
      }
      requestAnimationFrame(animShimmer);
    }

    // Fade in the construction wireframe
    grp.traverse(child => {
      if (child.isMesh && child.userData._constructionMat) {
        const mat = child.userData._constructionMat;
        const originalOpacity = 0.45;
        mat.opacity = 0;

        function fadeIn() {
          const elapsed = performance.now() - startTime;
          const t = Math.min(elapsed / APPEAR_DURATION_MS, 1.0);
          mat.opacity = originalOpacity * t;

          if (t < 1.0) {
            requestAnimationFrame(fadeIn);
          } else {
            mat.opacity = originalOpacity;
          }
        }
        requestAnimationFrame(fadeIn);
      }
    });
  }

  // Play a construction animation when a building is first unlocked
  function _playBuildingUnlockAnimation(buildingId) {
    const grp = _buildingMeshes[buildingId];
    if (!grp) return;
    const THREE = T();

    // Remove blueprint and construction mode immediately
    _setBlueprintMode(grp, false);
    _setConstructionMode(grp, false);

    // Enhanced build animation: ground glow → foundation → scale up with stunning particles
    const ANIM_DURATION_MS      = 1200; // Longer for more drama
    const OVERSHOOT_THRESHOLD   = 0.85;
    const OVERSHOOT_PEAK_SCALE  = 1.10; // More overshoot for impact
    const OVERSHOOT_AMOUNT      = OVERSHOOT_PEAK_SCALE - 1.0;

    const startTime = performance.now();
    grp.scale.set(0.01, 0.01, 0.01);

    // ═══ 1. Ground foundation glow that appears first ═══
    const foundationGeo = new THREE.CircleGeometry(3.5, 32);
    const foundationMat = new THREE.MeshBasicMaterial({
      color: 0xFFD700,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const foundation = new THREE.Mesh(foundationGeo, foundationMat);
    foundation.rotation.x = -Math.PI / 2;
    foundation.position.set(grp.position.x, 0.02, grp.position.z);
    _campScene.add(foundation);

    // ═══ 2. Building scale animation with foundation glow and light fade-in ═══
    // Store original light intensities and start at 0
    const buildingLights = [];
    grp.traverse(child => {
      if (child.isLight && child.type === 'PointLight') {
        buildingLights.push({
          light: child,
          originalIntensity: child.intensity
        });
        child.intensity = 0;
      }
    });

    function animStep() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / ANIM_DURATION_MS, 1.0);

      // Scale building with overshoot
      const scale = t < OVERSHOOT_THRESHOLD
        ? OVERSHOOT_PEAK_SCALE * (t / OVERSHOOT_THRESHOLD)
        : OVERSHOOT_PEAK_SCALE - OVERSHOOT_AMOUNT * ((t - OVERSHOOT_THRESHOLD) / (1.0 - OVERSHOOT_THRESHOLD));
      grp.scale.set(scale, scale, scale);

      // Foundation glow pulse (appears, pulses, fades)
      if (t < 0.3) {
        foundationMat.opacity = (t / 0.3) * 0.6; // Fade in
      } else if (t < 0.7) {
        const pulse = Math.sin((t - 0.3) * Math.PI * 8) * 0.15; // Pulse
        foundationMat.opacity = 0.6 + pulse;
      } else {
        foundationMat.opacity = 0.6 * (1 - (t - 0.7) / 0.3); // Fade out
      }

      // Fade in building lights (start at 50% progress for dramatic effect)
      if (t > 0.5) {
        const lightT = (t - 0.5) / 0.5; // 0 to 1 over second half of animation
        for (const lightInfo of buildingLights) {
          lightInfo.light.intensity = lightInfo.originalIntensity * lightT;
        }
      }

      if (t < 1.0) {
        requestAnimationFrame(animStep);
      } else {
        grp.scale.set(1, 1, 1);
        // Ensure lights are at full intensity
        for (const lightInfo of buildingLights) {
          lightInfo.light.intensity = lightInfo.originalIntensity;
        }
        _campScene.remove(foundation);
        foundationGeo.dispose();
        foundationMat.dispose();
      }
    }
    requestAnimationFrame(animStep);

    // ═══ 3. Light beam effect shooting upward ═══
    if (_campScene) {
      // Create 6-8 light beams that shoot upward in a cone
      const BEAM_COUNT = 8;
      const beams = [];

      for (let i = 0; i < BEAM_COUNT; i++) {
        const angle = (i / BEAM_COUNT) * Math.PI * 2;
        const beamGeo = new THREE.CylinderGeometry(0.15, 0.05, 8, 8);
        const beamMat = new THREE.MeshBasicMaterial({
          color: 0xFFD700,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(
          grp.position.x + Math.sin(angle) * 1.5,
          4,
          grp.position.z + Math.cos(angle) * 1.5
        );
        beam.rotation.x = Math.PI * 0.05; // Slight outward tilt
        beam.rotation.z = -angle;
        beam.scale.set(1, 0.01, 1); // Start compressed
        _campScene.add(beam);
        beams.push({ mesh: beam, mat: beamMat, angle: angle });
      }

      // Animate beams shooting up
      const beamStartMs = performance.now();
      function animBeams() {
        const bt = Math.min((performance.now() - beamStartMs) / 1000, 1);

        for (const beamInfo of beams) {
          // Beams shoot up quickly then fade
          if (bt < 0.4) {
            beamInfo.mesh.scale.y = bt / 0.4; // Shoot up
            beamInfo.mat.opacity = 0.7;
          } else {
            beamInfo.mat.opacity = 0.7 * (1 - (bt - 0.4) / 0.6); // Fade out
          }
        }

        if (bt < 1) {
          requestAnimationFrame(animBeams);
        } else {
          // Cleanup
          for (const beamInfo of beams) {
            _campScene.remove(beamInfo.mesh);
            beamInfo.mesh.geometry.dispose();
            beamInfo.mat.dispose();
          }
        }
      }
      requestAnimationFrame(animBeams);
    }

    // ═══ 4. Enhanced multi-layer particle system ═══
    if (_campScene) {
      // Layer 1: Golden burst particles (radial explosion)
      const BURST_COUNT = 80; // More particles for dramatic effect
      const burstGeo = new THREE.BufferGeometry();
      const burstPos = new Float32Array(BURST_COUNT * 3);
      const burstVel = [];
      const burstColors = new Float32Array(BURST_COUNT * 3);

      for (let i = 0; i < BURST_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.5;
        burstPos[i * 3]     = grp.position.x + Math.sin(a) * r;
        burstPos[i * 3 + 1] = grp.position.y + 0.3;
        burstPos[i * 3 + 2] = grp.position.z + Math.cos(a) * r;

        burstVel.push({
          x: Math.sin(a) * (2.5 + Math.random() * 2),
          y: 3.5 + Math.random() * 4,
          z: Math.cos(a) * (2.5 + Math.random() * 2)
        });

        // Golden to white gradient for sparkle effect
        const c = Math.random() > 0.3 ? 1.0 : 0.9;
        burstColors[i * 3]     = c;
        burstColors[i * 3 + 1] = c * 0.84;
        burstColors[i * 3 + 2] = 0;
      }

      burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
      burstGeo.setAttribute('color', new THREE.BufferAttribute(burstColors, 3));

      const burstMat = new THREE.PointsMaterial({
        size: 0.35,
        transparent: true,
        opacity: 1.0,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const burstParticles = new THREE.Points(burstGeo, burstMat);
      _campScene.add(burstParticles);

      // Layer 2: Ascending magic sparkles (rising from ground)
      const SPARKLE_COUNT = 60;
      const sparkleGeo = new THREE.BufferGeometry();
      const sparklePos = new Float32Array(SPARKLE_COUNT * 3);
      const sparkleVel = [];

      for (let i = 0; i < SPARKLE_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 3;
        sparklePos[i * 3]     = grp.position.x + Math.sin(a) * r;
        sparklePos[i * 3 + 1] = 0.1;
        sparklePos[i * 3 + 2] = grp.position.z + Math.cos(a) * r;

        sparkleVel.push({
          x: (Math.random() - 0.5) * 0.8,
          y: 1.5 + Math.random() * 2,
          z: (Math.random() - 0.5) * 0.8,
          spin: Math.random() * 0.3
        });
      }

      sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3));
      const sparkleMat = new THREE.PointsMaterial({
        color: 0xFFFFAA,
        size: 0.2,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sparkleParticles = new THREE.Points(sparkleGeo, sparkleMat);
      _campScene.add(sparkleParticles);

      // Layer 3: Construction dust cloud (brown/tan particles settling)
      const DUST_COUNT = 50;
      const dustGeo = new THREE.BufferGeometry();
      const dustPos = new Float32Array(DUST_COUNT * 3);
      const dustVel = [];

      for (let i = 0; i < DUST_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 2.5;
        dustPos[i * 3]     = grp.position.x + Math.sin(a) * r;
        dustPos[i * 3 + 1] = 0.5 + Math.random() * 2;
        dustPos[i * 3 + 2] = grp.position.z + Math.cos(a) * r;

        dustVel.push({
          x: (Math.random() - 0.5) * 1.5,
          y: 0.5 + Math.random() * 1.5,
          z: (Math.random() - 0.5) * 1.5
        });
      }

      dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
      const dustMat = new THREE.PointsMaterial({
        color: 0x8B7355,
        size: 0.4,
        transparent: true,
        opacity: 0.7,
        depthWrite: false
      });
      const dustParticles = new THREE.Points(dustGeo, dustMat);
      _campScene.add(dustParticles);

      // ═══ Animate all particle layers ═══
      const pStartMs = performance.now();
      function animParticles() {
        const pt = Math.min((performance.now() - pStartMs) / 2500, 1);

        // Burst particles: explosive outward with gravity
        burstMat.opacity = 1.0 - pt;
        for (let i = 0; i < BURST_COUNT; i++) {
          burstPos[i * 3]     += burstVel[i].x * 0.016;
          burstPos[i * 3 + 1] += burstVel[i].y * 0.016;
          burstPos[i * 3 + 2] += burstVel[i].z * 0.016;
          burstVel[i].y -= 6 * 0.016; // Gravity
          burstVel[i].x *= 0.98; // Air resistance
          burstVel[i].z *= 0.98;
        }
        burstGeo.attributes.position.needsUpdate = true;

        // Sparkle particles: rising with gentle drift
        sparkleMat.opacity = 1.0 - pt * pt; // Slower fade
        for (let i = 0; i < SPARKLE_COUNT; i++) {
          sparklePos[i * 3]     += sparkleVel[i].x * 0.016;
          sparklePos[i * 3 + 1] += sparkleVel[i].y * 0.016;
          sparklePos[i * 3 + 2] += sparkleVel[i].z * 0.016;
          sparkleVel[i].y *= 0.96; // Slow down as they rise
        }
        sparkleGeo.attributes.position.needsUpdate = true;

        // Dust particles: settling down with drift
        dustMat.opacity = 0.7 * (1.0 - pt);
        for (let i = 0; i < DUST_COUNT; i++) {
          dustPos[i * 3]     += dustVel[i].x * 0.016;
          dustPos[i * 3 + 1] += dustVel[i].y * 0.016;
          dustPos[i * 3 + 2] += dustVel[i].z * 0.016;
          dustVel[i].y -= 2 * 0.016; // Gravity (slower than burst)
        }
        dustGeo.attributes.position.needsUpdate = true;

        if (pt < 1) {
          requestAnimationFrame(animParticles);
        } else {
          // Cleanup all particle systems
          _campScene.remove(burstParticles);
          burstGeo.dispose();
          burstMat.dispose();

          _campScene.remove(sparkleParticles);
          sparkleGeo.dispose();
          sparkleMat.dispose();

          _campScene.remove(dustParticles);
          dustGeo.dispose();
          dustMat.dispose();
        }
      }
      requestAnimationFrame(animParticles);
    }
  }

  // ──────────────────────────────────────────────────────────
  // HUD DOM elements (created once)
  // ──────────────────────────────────────────────────────────
  function _ensureHUD() {
    // Interaction prompt
    if (!document.getElementById('camp-interact-prompt')) {
      const prompt = document.createElement('div');
      prompt.id = 'camp-interact-prompt';
      prompt.style.cssText = [
        'position:fixed',
        'bottom:25%',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(5,4,2,0.88)',
        'border:none',
        'border-radius:50px',
        'color:#f5e17a',
        'font-family:"Bangers",cursive',
        'font-size:18px',
        'letter-spacing:2px',
        'padding:10px 28px',
        'display:none',
        'z-index:80',
        'pointer-events:none',
        'text-shadow:0 0 10px rgba(255,220,80,0.7),0 0 20px rgba(255,180,0,0.4)',
        'box-shadow:0 0 18px rgba(200,162,72,0.5),0 0 6px rgba(0,0,0,0.9)',
        'backdrop-filter:blur(4px)',
        '-webkit-backdrop-filter:blur(4px)',
        'white-space:nowrap',
      ].join(';');
      document.body.appendChild(prompt);
      _promptEl = prompt;
    } else {
      _promptEl = document.getElementById('camp-interact-prompt');
    }

    // Mobile interact button
    if (!document.getElementById('camp-interact-btn')) {
      const btn = document.createElement('button');
      btn.id = 'camp-interact-btn';
      btn.textContent = 'ENTER';
      btn.style.cssText = [
        'position:fixed',
        'bottom:18%',
        'right:6%',
        'background:linear-gradient(135deg,#c8a248 0%,#8b6914 60%,#5c4509 100%)',
        'border:2px solid rgba(255,215,0,0.7)',
        'border-radius:50%',
        'width:84px',
        'height:84px',
        'color:#fff8e0',
        'font-family:"Bangers",cursive',
        'font-size:14px',
        'font-weight:bold',
        'display:none',
        'z-index:80',
        'cursor:pointer',
        'letter-spacing:1px',
        'touch-action:manipulation',
        'text-shadow:0 1px 3px rgba(0,0,0,0.5)',
        'transition:transform 0.1s,box-shadow 0.1s',
      ].join(';');
      btn.addEventListener('click', () => { btn.style.transform = 'scale(0.93)'; setTimeout(() => { btn.style.transform = ''; }, 120); _interact(); });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); _interact(); });
      document.body.appendChild(btn);
      _interactBtn = btn;
    } else {
      _interactBtn = document.getElementById('camp-interact-btn');
    }

    // Building name display (positioned next to the interact button)
    if (!document.getElementById('camp-building-name')) {
      const nameEl = document.createElement('div');
      nameEl.id = 'camp-building-name';
      nameEl.style.cssText = [
        'position:fixed',
        'bottom:18%',
        'right:calc(6% + 86px)',
        'background:linear-gradient(135deg,rgba(34,34,51,0.95),rgba(20,20,35,0.95))',
        'border:2px solid rgba(200,162,72,0.6)',
        'border-radius:10px',
        'padding:12px 18px',
        'color:#e8c547',
        'font-family:"Bangers",cursive',
        'font-size:16px',
        'display:none',
        'z-index:80',
        'pointer-events:none',
        'text-shadow:0 0 8px rgba(200,162,72,0.6)',
        'box-shadow:0 0 16px rgba(200,162,72,0.3)',
        'white-space:nowrap',
        'letter-spacing:1px',
      ].join(';');
      document.body.appendChild(nameEl);
      _buildingNameEl = nameEl;
    } else {
      _buildingNameEl = document.getElementById('camp-building-name');
    }

    // Touch joystick indicator (virtual stick shown at touch origin)
    if (!document.getElementById('camp-touch-indicator')) {
      const ring = document.createElement('div');
      ring.id = 'camp-touch-indicator';
      ring.style.cssText = [
        'position:fixed',
        'width:80px',
        'height:80px',
        'border:3px solid rgba(93,173,226,0.5)',
        'border-radius:50%',
        'background:rgba(93,173,226,0.08)',
        'display:none',
        'z-index:55',
        'pointer-events:none',
      ].join(';');
      // Inner dot
      const dot = document.createElement('div');
      dot.style.cssText = [
        'position:absolute',
        'top:50%',
        'left:50%',
        'width:28px',
        'height:28px',
        'margin:-14px 0 0 -14px',
        'border-radius:50%',
        'background:rgba(93,173,226,0.6)',
      ].join(';');
      ring.appendChild(dot);
      document.body.appendChild(ring);
      _touchIndicator = ring;
    } else {
      _touchIndicator = document.getElementById('camp-touch-indicator');
    }

    // ── Player Profile UI (top-left corner) ──
    _ensureCampProfile();

    // ── WaterBot Terminal (Annunaki terminal, camp-only) ──
    _ensureWaterBot();
  }

  // ──────────────────────────────────────────────────────────
  // Player Profile UI — top-left corner of camp HUD
  // ──────────────────────────────────────────────────────────

  /**
   * Resolve the player's display name from the most authoritative source available.
   * Priority: saveData.playerName → localStorage['wds_playerName'] (set by Welcome screen) → 'UNIT-001'.
   * Returns the raw (un-uppercased) name string.
   */
  function _resolvePlayerName() {
    var sd = (typeof saveData !== 'undefined') ? saveData : null;
    return (sd && sd.playerName) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('wds_playerName')) ||
      'UNIT-001';
  }
  function _ensureCampProfile() {
    if (document.getElementById('camp-profile-ui')) {
      _updateCampProfile();
      return;
    }
    const sd = (typeof saveData !== 'undefined') ? saveData : null;

    const ui = document.createElement('div');
    ui.id = 'camp-profile-ui';
    ui.style.cssText = [
      'position:fixed', 'top:10px', 'left:10px', 'z-index:200',
      'background:linear-gradient(135deg,rgba(8,8,20,0.92),rgba(5,5,15,0.95))',
      'border:1px solid rgba(0,255,255,0.25)', 'border-radius:12px',
      'padding:8px 14px', 'display:flex', 'align-items:center', 'gap:10px',
      'cursor:pointer', 'pointer-events:auto',
      'box-shadow:0 0 16px rgba(0,255,255,0.12),0 2px 8px rgba(0,0,0,0.6)',
      'min-width:160px',
    ].join(';');

    // Avatar circle
    const avatar = document.createElement('div');
    avatar.id = 'camp-profile-avatar';
    avatar.style.cssText = [
      'width:44px', 'height:44px', 'border-radius:50%', 'flex-shrink:0',
      'background:radial-gradient(circle at 35% 30%, #0a3a4a 0%, #020a10 100%)',
      'border:2px solid #00ffff', 'display:flex', 'align-items:center', 'justify-content:center',
      'font-size:22px',
    ].join(';');
    avatar.textContent = '💧';

    // Info column
    const info = document.createElement('div');
    info.id = 'camp-profile-info';
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;';

    const nameEl = document.createElement('div');
    nameEl.id = 'camp-profile-name';
    nameEl.style.cssText = 'color:#00ffff;font-family:Bangers,cursive;font-size:15px;letter-spacing:1.5px;';
    nameEl.textContent = _resolvePlayerName().toUpperCase();

    const levelEl = document.createElement('div');
    levelEl.id = 'camp-profile-level';
    levelEl.style.cssText = 'color:#FFD700;font-family:"Courier New",monospace;font-size:10px;';
    levelEl.textContent = 'LVL 1 · RECRUIT';

    info.appendChild(nameEl);
    info.appendChild(levelEl);

    // "!" new-stuff badge
    const badge = document.createElement('div');
    badge.id = 'camp-profile-badge';
    badge.style.cssText = [
      'width:18px', 'height:18px', 'border-radius:50%',
      'background:radial-gradient(circle, #cc0000, #880000)',
      'border:2px solid #ff4444',
      'color:#fff', 'font-weight:bold', 'font-size:11px',
      'display:none', 'align-items:center', 'justify-content:center',
      'animation:camp-badge-pulse 1s ease-in-out infinite alternate',
      'flex-shrink:0',
    ].join(';');
    badge.textContent = '!';

    ui.appendChild(avatar);
    ui.appendChild(info);
    ui.appendChild(badge);
    document.body.appendChild(ui);

    // Inject badge pulse keyframe if not already present
    if (!document.getElementById('camp-badge-style')) {
      const s = document.createElement('style');
      s.id = 'camp-badge-style';
      s.textContent = '@keyframes camp-badge-pulse{from{box-shadow:0 0 4px #ff0000}to{box-shadow:0 0 12px #ff5555,0 0 20px #cc0000}}';
      document.head.appendChild(s);
    }

    // Hide the harvest-hud resource counters in camp (replaced by WaterBot)
    const harvestHud = document.getElementById('harvest-hud');
    if (harvestHud) harvestHud.style.display = 'none';

    ui.addEventListener('click', function(e) {
      e.stopPropagation();
      _showProfileModal();
    });

    _updateCampProfile();
  }

  function _updateCampProfile() {
    const sd = (typeof saveData !== 'undefined') ? saveData : null;

    const nameEl = document.getElementById('camp-profile-name');
    const levelEl = document.getElementById('camp-profile-level');
    const badge = document.getElementById('camp-profile-badge');

    // Resolve name using shared helper (saveData → localStorage → fallback)
    if (nameEl) {
      nameEl.textContent = _resolvePlayerName().toUpperCase();
    }
    if (!sd) return;
    if (levelEl) {
      // FIX: Use accountLevel (permanent profile level) instead of in-run level
      const accLvl = sd.accountLevel || (sd.account && sd.account.level) || 1;
      // Get rank from GameAccount milestones if available
      let rank = 'RECRUIT';
      if (window.GameAccount && window.GameAccount.getMilestones) {
        var milestones = window.GameAccount.getMilestones();
        for (var mi = milestones.length - 1; mi >= 0; mi--) {
          if (milestones[mi].level <= accLvl) {
            rank = milestones[mi].title || rank;
            break;
          }
        }
      } else {
        // Fallback kill-based rank
        var kills = sd.totalKills || 0;
        if (kills >= 1000) rank = 'COMMANDER';
        else if (kills >= 300) rank = 'WARRIOR';
        else if (kills >= 100) rank = 'FIGHTER';
        else if (kills >= 30) rank = 'SOLDIER';
      }
      levelEl.textContent = 'LVL ' + accLvl + ' · ' + rank;
    }
    if (badge) {
      const tq = sd.tutorialQuests;
      const hasNew = tq && tq.readyToClaim && tq.readyToClaim.length > 0;
      badge.style.display = hasNew ? 'flex' : 'none';
    }
  }

  // ──────────────────────────────────────────────────────────
  // Profile Modal — opens when clicking the profile UI (not WaterBot)
  // Contains settings, profile border, linked rank/level, name, and 7-day welcome
  // ──────────────────────────────────────────────────────────
  function _showProfileModal() {
    // Close existing if open
    var existing = document.getElementById('camp-profile-modal');
    if (existing) { existing.remove(); _resumeInput(); return; }

    _openMenu();
    var sd = (typeof saveData !== 'undefined') ? saveData : null;
    var accLvl = (sd && sd.accountLevel) || 1;
    // Resolve name using shared helper (saveData → localStorage → fallback)
    var playerName = _resolvePlayerName();
    // Get rank
    var rank = 'RECRUIT';
    if (window.GameAccount && window.GameAccount.getMilestones) {
      var milestones = window.GameAccount.getMilestones();
      for (var mi = milestones.length - 1; mi >= 0; mi--) {
        if (milestones[mi].level <= accLvl) { rank = milestones[mi].title || rank; break; }
      }
    }
    var rankColor = '#FFD700';
    if (window.GameAccount && window.GameAccount.getRankColor) {
      rankColor = window.GameAccount.getRankColor(rank);
    }

    var modal = document.createElement('div');
    modal.id = 'camp-profile-modal';
    modal.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:20000', 'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.75)',
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'background:linear-gradient(135deg,rgba(8,8,20,0.98),rgba(5,5,15,0.99))',
      'border:2px solid rgba(0,255,255,0.4)', 'border-radius:18px',
      'padding:30px 40px', 'text-align:center', 'max-width:380px', 'width:90%',
      'box-shadow:0 0 50px rgba(0,255,255,0.15)',
    ].join(';');

    // Avatar with profile border ring
    var avatarWrap = document.createElement('div');
    avatarWrap.style.cssText = [
      'width:80px', 'height:80px', 'border-radius:50%', 'margin:0 auto 16px',
      'background:radial-gradient(circle at 35% 30%, #0a3a4a 0%, #020a10 100%)',
      'border:3px solid ' + rankColor,
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-size:38px',
      'box-shadow:0 0 20px ' + rankColor + '44',
    ].join(';');
    avatarWrap.textContent = '💧';
    box.appendChild(avatarWrap);

    // Name
    var nameEl = document.createElement('div');
    nameEl.style.cssText = 'color:#00ffff;font-family:Bangers,cursive;font-size:24px;letter-spacing:2px;margin-bottom:4px;';
    nameEl.textContent = playerName.toUpperCase();
    box.appendChild(nameEl);

    // Level + Rank
    var lvlEl = document.createElement('div');
    lvlEl.style.cssText = 'color:' + rankColor + ';font-family:"Courier New",monospace;font-size:14px;margin-bottom:16px;';
    lvlEl.textContent = 'LEVEL ' + accLvl + ' · ' + rank;
    box.appendChild(lvlEl);

    // XP bar
    var xpNeeded = 100 + (accLvl - 1) * 50; // approximate
    if (typeof getAccountLevelXPRequired === 'function') xpNeeded = getAccountLevelXPRequired(accLvl);
    var currXP = (sd && sd.accountXP) || 0;
    var xpPct = Math.min(100, (currXP / xpNeeded) * 100);
    var xpBar = document.createElement('div');
    xpBar.style.cssText = 'width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;margin-bottom:20px;overflow:hidden;';
    var xpFill = document.createElement('div');
    xpFill.style.cssText = 'width:' + xpPct + '%;height:100%;background:linear-gradient(90deg,#00ffcc,#00ccff);border-radius:4px;transition:width 0.4s;';
    xpBar.appendChild(xpFill);
    box.appendChild(xpBar);
    var xpLabel = document.createElement('div');
    xpLabel.style.cssText = 'color:#888;font-size:11px;margin-top:-16px;margin-bottom:18px;';
    xpLabel.textContent = currXP + ' / ' + xpNeeded + ' XP';
    box.appendChild(xpLabel);

    // Stats summary — built via DOM elements to avoid innerHTML XSS risk
    var statsEl = document.createElement('div');
    statsEl.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:18px;line-height:1.8;text-align:left;padding:0 10px;';
    var totalKills = (sd && sd.totalKills) || 0;
    var totalRuns = (sd && sd.totalRuns) || 0;
    var totalGold = (sd && sd.gold) || 0;
    var _statLines = [
      { label: '⚔️ Total Kills: ', value: totalKills, color: '#fff' },
      { label: '🔄 Total Runs: ', value: totalRuns, color: '#fff' },
      { label: '🪙 Gold: ', value: totalGold, color: '#FFD700' }
    ];
    _statLines.forEach(function(s, idx) {
      var lbl = document.createTextNode(s.label);
      var val = document.createElement('span');
      val.style.color = s.color;
      val.textContent = s.value;
      statsEl.appendChild(lbl);
      statsEl.appendChild(val);
      if (idx < _statLines.length - 1) statsEl.appendChild(document.createElement('br'));
    });
    box.appendChild(statsEl);

    // Buttons row
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';

    // Settings button
    var settingsBtn = document.createElement('button');
    settingsBtn.style.cssText = 'padding:8px 16px;font-size:13px;font-family:"Segoe UI",sans-serif;background:rgba(255,255,255,0.1);color:#ccc;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;';
    settingsBtn.textContent = '⚙️ Settings';
    settingsBtn.addEventListener('click', function() {
      modal.remove();
      _resumeInput();
      if (window.SettingsUI && typeof window.SettingsUI.show === 'function') {
        window.SettingsUI.show();
      } else if (typeof window.showSettings === 'function') {
        window.showSettings();
      }
    });
    btnRow.appendChild(settingsBtn);

    // 7-Day Welcome button
    var welcomeBtn = document.createElement('button');
    welcomeBtn.style.cssText = 'padding:8px 16px;font-size:13px;font-family:"Segoe UI",sans-serif;background:rgba(255,255,255,0.1);color:#ccc;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;';
    welcomeBtn.textContent = '🎁 7-Day Rewards';
    welcomeBtn.addEventListener('click', function() {
      modal.remove();
      _resumeInput();
      if (window.WelcomeUI && typeof window.WelcomeUI.show === 'function') {
        window.WelcomeUI.show();
      }
    });
    btnRow.appendChild(welcomeBtn);

    box.appendChild(btnRow);

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'margin-top:18px;padding:10px 32px;font-size:16px;font-family:Bangers,cursive;background:rgba(0,255,255,0.15);color:#00ffff;border:1px solid rgba(0,255,255,0.3);border-radius:8px;cursor:pointer;letter-spacing:1px;';
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', function() {
      modal.remove();
      _resumeInput();
    });
    box.appendChild(closeBtn);

    modal.appendChild(box);
    // Click outside to close
    modal.addEventListener('click', function(e) {
      if (e.target === modal) { modal.remove(); _resumeInput(); }
    });
    document.body.appendChild(modal);
  }

  // ──────────────────────────────────────────────────────────
  // WaterBot Terminal — Annunaki-themed camp terminal
  // ──────────────────────────────────────────────────────────
  var _waterbotOpen = false;

  // FAQ/lore answers for chat tab
  var _WATERBOT_FAQ = [
    { q: 'who are you', a: '> I am WaterBot — an Annunaki intelligence fragment, bound to this terminal. My directives are... complex.' },
    { q: 'what is the lake', a: '> The lake is a collective consciousness. You were ripped from it. The Alien Ship\'s toxic leak created anomalies like you.' },
    { q: 'how do i level up', a: '> Survive. Kill. Collect EXP orbs. Every death refines you. Every kill builds towards transcendence.' },
    { q: 'what is the alien ship', a: '> The Anomaly Source. It orbits the anomaly zone. Approach with extreme caution — its radiation rewrites cellular memory.' },
    { q: 'what are skill points', a: '> Neural pathway modifiers. Allocate them at the Skill Tree node. Choose deliberately — they alter your combat subroutines permanently.' },
    { q: 'how do i get gold', a: '> Eliminate hostiles. Complete objectives. Gold is the camp\'s primary construction catalyst.' },
    { q: 'what is wood', a: '> A structural material. Harvest trees outside the camp perimeter. Used for most construction projects.' },
    { q: 'what is stone', a: '> A durable material. Mine rock formations in the field. Required for advanced construction.' },
    { q: 'who is aida', a: '> A.I.D.A is Artificial Intelligence for Dimensional Anomalies. She inserted herself into your neural pathways. She claims to help you. I... have reservations.' },
    { q: 'how do i get back to the lake', a: '> Unknown. But the landmarks hold answers — the Alien Ship, the Pyramid, the Tesla Tower. Explore them. Survive them.' },
  ];

  function _ensureWaterBot() {
    if (document.getElementById('waterbot-terminal')) return;

    const terminal = document.createElement('div');
    terminal.id = 'waterbot-terminal';
    terminal.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:500', 'display:none', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.75)', 'backdrop-filter:blur(3px)',
      'pointer-events:auto',
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
      'width:min(680px,96vw)', 'height:min(520px,90vh)',
      'background:linear-gradient(180deg,#060610 0%,#020208 100%)',
      'border:1px solid rgba(0,255,255,0.35)', 'border-radius:16px',
      'display:flex', 'flex-direction:column', 'overflow:hidden',
      'box-shadow:0 0 40px rgba(0,255,255,0.15),0 0 80px rgba(0,0,0,0.8)',
      'position:relative',
    ].join(';');

    // Header bar
    const header = document.createElement('div');
    header.style.cssText = [
      'padding:10px 18px', 'background:rgba(0,255,255,0.06)',
      'border-bottom:1px solid rgba(0,255,255,0.2)',
      'display:flex', 'align-items:center', 'justify-content:space-between',
    ].join(';');
    header.innerHTML = '<span style="color:#00ffff;font-family:Bangers,cursive;font-size:18px;letter-spacing:3px;">◈ WATERBOT — ANNUNAKI TERMINAL</span>'
      + '<button id="waterbot-close-btn" style="background:none;border:1px solid rgba(0,255,255,0.3);border-radius:6px;color:#00ffff;font-size:14px;padding:4px 10px;cursor:pointer;">✕ CLOSE</button>';

    // Tab row
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:0;border-bottom:1px solid rgba(0,255,255,0.15);';
    const tabDefs = [
      { id: 'wb-tab-resources', label: '📦 RESOURCES' },
      { id: 'wb-tab-stats', label: '⚡ SKILLS' },
      { id: 'wb-tab-chat', label: '💬 CHAT' },
    ];
    tabDefs.forEach(function(td, i) {
      const tb = document.createElement('button');
      tb.id = td.id;
      tb.textContent = td.label;
      tb.dataset.tabIdx = String(i);
      tb.style.cssText = [
        'flex:1', 'background:' + (i === 0 ? 'rgba(0,255,255,0.1)' : 'transparent'),
        'border:none', 'border-right:1px solid rgba(0,255,255,0.1)',
        'color:' + (i === 0 ? '#00ffff' : 'rgba(0,255,255,0.5)'),
        'font-family:Bangers,cursive', 'font-size:13px', 'letter-spacing:1px',
        'padding:8px 4px', 'cursor:pointer',
      ].join(';');
      tb.addEventListener('click', function() { _waterbotShowTab(parseInt(this.dataset.tabIdx)); });
      tabs.appendChild(tb);
    });

    // Content area
    const content = document.createElement('div');
    content.id = 'waterbot-content';
    content.style.cssText = 'flex:1;overflow-y:auto;padding:14px 18px;font-family:"Courier New",monospace;font-size:13px;color:#c8e8d0;';

    // Chat input row
    const chatRow = document.createElement('div');
    chatRow.id = 'waterbot-chat-row';
    chatRow.style.cssText = 'display:none;padding:8px 14px;border-top:1px solid rgba(0,255,255,0.15);gap:8px;';
    chatRow.innerHTML = '<input id="waterbot-chat-input" type="text" placeholder="> Ask WaterBot..." '
      + 'style="flex:1;background:#020a10;border:1px solid rgba(0,255,255,0.3);border-radius:6px;color:#00ffff;font-family:\'Courier New\',monospace;font-size:12px;padding:6px 10px;outline:none;">'
      + '<button id="waterbot-chat-send" style="background:rgba(0,255,255,0.12);border:1px solid rgba(0,255,255,0.35);border-radius:6px;color:#00ffff;font-family:Bangers,cursive;font-size:13px;padding:6px 14px;cursor:pointer;">SEND</button>';

    box.appendChild(header);
    box.appendChild(tabs);
    box.appendChild(content);
    box.appendChild(chatRow);
    terminal.appendChild(box);
    document.body.appendChild(terminal);

    // Close handlers
    terminal.addEventListener('click', function(e) { if (e.target === terminal) _closeWaterBot(); });
    document.getElementById('waterbot-close-btn').addEventListener('click', _closeWaterBot);

    // Chat send
    const sendBtn = document.getElementById('waterbot-chat-send');
    const chatInput = document.getElementById('waterbot-chat-input');
    if (sendBtn && chatInput) {
      function doSend() {
        const q = chatInput.value.trim().toLowerCase();
        chatInput.value = '';
        if (!q) return;
        _waterbotChat(q);
      }
      sendBtn.addEventListener('click', doSend);
      chatInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSend(); });
    }

    _waterbotShowTab(0);
  }

  function _toggleWaterBot() {
    if (_waterbotOpen) { _closeWaterBot(); } else { _openWaterBot(); }
  }

  function _openWaterBot() {
    const t = document.getElementById('waterbot-terminal');
    if (!t) { _ensureWaterBot(); }
    const terminal = document.getElementById('waterbot-terminal');
    if (!terminal) return;
    _waterbotOpen = true;
    terminal.style.display = 'flex';
    _waterbotShowTab(0);
  }

  function _closeWaterBot() {
    const terminal = document.getElementById('waterbot-terminal');
    if (terminal) terminal.style.display = 'none';
    _waterbotOpen = false;
  }

  function _waterbotShowTab(idx) {
    const tabIds = ['wb-tab-resources', 'wb-tab-stats', 'wb-tab-chat'];
    tabIds.forEach(function(id, i) {
      const tb = document.getElementById(id);
      if (!tb) return;
      if (i === idx) {
        tb.style.background = 'rgba(0,255,255,0.1)';
        tb.style.color = '#00ffff';
      } else {
        tb.style.background = 'transparent';
        tb.style.color = 'rgba(0,255,255,0.5)';
      }
    });
    const chatRow = document.getElementById('waterbot-chat-row');
    if (chatRow) chatRow.style.display = idx === 2 ? 'flex' : 'none';

    const content = document.getElementById('waterbot-content');
    if (!content) return;
    content.innerHTML = '';

    const sd = (typeof saveData !== 'undefined') ? saveData : null;
    const res = (sd && sd.resources) || {};
    const tq = (sd && sd.tutorialQuests) || {};
    const ps = (typeof playerStats !== 'undefined') ? playerStats : (sd && sd.playerStats) || {};

    if (idx === 0) {
      // Resources tab
      _waterbotSection(content, '▸ MATERIALS', [
        { label: '🪵 Wood', val: res.wood || 0 },
        { label: '🪨 Stone', val: res.stone || 0 },
        { label: '💎 Crystal', val: res.crystal || 0 },
        { label: '🔩 Metal', val: res.metal || 0 },
        { label: '🧪 Slime', val: res.slime || 0 },
      ]);
      _waterbotSection(content, '▸ CURRENCY', [
        { label: '💰 Gold', val: sd ? (sd.gold || 0) : 0 },
        { label: '💠 Gems', val: sd ? (sd.gems || 0) : 0 },
      ]);
      _waterbotSection(content, '▸ PROGRESS', [
        { label: '⚔️ Total Kills', val: sd ? (sd.totalKills || 0) : 0 },
        { label: '🏃 Total Runs', val: sd ? (sd.totalRuns || 0) : 0 },
        { label: '🌊 Level', val: sd ? (sd.level || 1) : 1 },
      ]);
    } else if (idx === 1) {
      // Skills/attributes tab
      _waterbotSection(content, '▸ ATTRIBUTES', [
        { label: '❤️ Max HP', val: ps.maxHp || 100 },
        { label: '⚡ Speed', val: ps.speed ? ps.speed.toFixed(1) : '—' },
        { label: '🎯 Fire Rate', val: ps.fireRate ? ps.fireRate.toFixed(2) + '×' : '—' },
        { label: '🔫 Mag Size', val: ps.magazineCapacity || 5 },
        { label: '🛡️ Armor', val: ps.armor || 0 },
        { label: '🩸 Regen', val: ps.hpRegen ? ps.hpRegen.toFixed(1) + '/s' : '0/s' },
        { label: '💥 Damage', val: ps.weaponDamage ? ps.weaponDamage.toFixed(1) + '×' : '—' },
      ]);
      _waterbotSection(content, '▸ POINTS', [
        { label: '🌟 Skill Points', val: sd ? (sd.skillPoints || 0) : 0 },
        { label: '📚 Training Points', val: sd ? (sd.trainingPoints || 0) : 0 },
        { label: '🏅 Camp XP', val: sd ? (sd.campXP || 0) : 0 },
      ]);
    } else if (idx === 2) {
      // Chat tab — show previous messages
      const msgs = content._chatHistory || [];
      content._chatHistory = msgs;
      if (msgs.length === 0) {
        const intro = document.createElement('div');
        intro.style.cssText = 'color:rgba(0,255,255,0.7);margin-bottom:12px;';
        intro.textContent = '> WATERBOT ONLINE. Ask me about lore, gameplay, or resources.';
        content.appendChild(intro);
      } else {
        msgs.forEach(function(m) {
          const d = document.createElement('div');
          d.style.cssText = 'margin-bottom:8px;' + (m.isUser ? 'color:#FFD700;' : 'color:#c8e8d0;');
          d.textContent = m.text;
          content.appendChild(d);
        });
      }
    }
  }

  function _waterbotSection(parent, title, rows) {
    const s = document.createElement('div');
    s.style.cssText = 'margin-bottom:14px;';
    const h = document.createElement('div');
    h.style.cssText = 'color:#00ffff;font-family:Bangers,cursive;font-size:13px;letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid rgba(0,255,255,0.15);padding-bottom:3px;';
    h.textContent = title;
    s.appendChild(h);
    rows.forEach(function(r) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:2px 0;';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'color:rgba(200,232,208,0.7);';
      lbl.textContent = r.label;
      const val = document.createElement('span');
      val.style.cssText = 'color:#FFD700;font-weight:bold;';
      val.textContent = r.val;
      row.appendChild(lbl);
      row.appendChild(val);
      s.appendChild(row);
    });
    parent.appendChild(s);
  }

  function _waterbotChat(query) {
    const content = document.getElementById('waterbot-content');
    if (!content) return;
    if (!content._chatHistory) content._chatHistory = [];

    // Add user message
    content._chatHistory.push({ isUser: true, text: '> ' + query });

    // Find best answer
    let answer = '> ...query unrecognised. Ask about lore, resources, skills, or gameplay.';
    for (let i = 0; i < _WATERBOT_FAQ.length; i++) {
      if (query.indexOf(_WATERBOT_FAQ[i].q) !== -1) {
        answer = _WATERBOT_FAQ[i].a;
        break;
      }
    }
    content._chatHistory.push({ isUser: false, text: answer });

    // Re-render chat tab
    _waterbotShowTab(2);

    // Scroll to bottom
    content.scrollTop = content.scrollHeight;
  }

  function _onKeyDown(e) {
    if (!_isActive || _menuOpen) return;
    _keys[e.code] = true;
    if (e.code === 'KeyE') _interact();
  }
  function _onKeyUp(e) {
    _keys[e.code] = false;
  }

  // ──────────────────────────────────────────────────────────
  // Touch movement handlers (own system for camp navigation)
  // ──────────────────────────────────────────────────────────
  const _TOUCH_DEAD_ZONE = 10; // px

  function _onTouchStart(e) {
    if (!_isActive || _menuOpen) return;
    // Don't intercept touches aimed at overlay panels above the 3D camp
    var t0 = e.changedTouches[0];
    if (t0) {
      var el = document.elementFromPoint(t0.clientX, t0.clientY);
      if (el) {
        // Let touches on interactive elements (buttons, links, inputs) pass through
        if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' ||
            el.tagName === 'SELECT' || el.closest('button') || el.closest('a')) return;
        // If the touched element is inside a fixed overlay (z-index ≥ 100), let it handle the event
        var node = el;
        while (node && node !== document.body) {
          var zIdx = 0;
          if (node.style && node.style.zIndex) zIdx = parseInt(node.style.zIndex, 10);
          if (!zIdx && node.nodeType === 1) {
            var cs = window.getComputedStyle(node);
            if (cs.zIndex && cs.zIndex !== 'auto') zIdx = parseInt(cs.zIndex, 10);
          }
          if (zIdx >= 100) return;
          node = node.parentElement;
        }
      }
    }
    // Only handle left-half touches for movement (right half reserved for interact / UI)
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < window.innerWidth * 0.55 && !_touch.active) {
        _touch.active = true;
        _touch.id     = t.identifier;
        _touch.startX = t.clientX;
        _touch.startY = t.clientY;
        _touch.x = 0;
        _touch.y = 0;
        _showTouchIndicator(t.clientX, t.clientY);
        e.preventDefault();
        break;
      }
    }
  }

  function _onTouchMove(e) {
    if (!_isActive || !_touch.active || _menuOpen) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== _touch.id) continue;
      const dx = t.clientX - _touch.startX;
      const dy = t.clientY - _touch.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 60;
      const factor = Math.min(dist, maxDist) / maxDist;
      if (dist > _TOUCH_DEAD_ZONE) {
        _touch.x = (dx / dist) * factor;
        _touch.y = (dy / dist) * factor;
      } else {
        _touch.x = 0;
        _touch.y = 0;
      }
      _moveTouchIndicator(t.clientX, t.clientY);
      e.preventDefault();
      break;
    }
  }

  function _onTouchEnd(e) {
    if (!_isActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === _touch.id) {
        _touch.active = false;
        _touch.id = null;
        _touch.x = 0;
        _touch.y = 0;
        _hideTouchIndicator();
        break;
      }
    }
  }

  // Touch joystick visual (shows ring where user touched)
  function _showTouchIndicator(cx, cy) {
    if (!_touchIndicator) return;
    _touchIndicator.style.left = (cx - 40) + 'px';
    _touchIndicator.style.top  = (cy - 40) + 'px';
    _touchIndicator.style.display = 'block';
  }
  function _moveTouchIndicator(cx, cy) {
    if (!_touchIndicator) return;
    // Inner dot follows finger, outer stays at origin
    const inner = _touchIndicator.children[0];
    if (inner) {
      const ox = _touch.startX;
      const oy = _touch.startY;
      const dx = Math.max(-30, Math.min(30, cx - ox));
      const dy = Math.max(-30, Math.min(30, cy - oy));
      inner.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }
  function _hideTouchIndicator() {
    if (!_touchIndicator) return;
    _touchIndicator.style.display = 'none';
    const inner = _touchIndicator.children[0];
    if (inner) inner.style.transform = '';
  }

  // ──────────────────────────────────────────────────────────
  // Mobile error overlay helper
  // ──────────────────────────────────────────────────────────
  function _showMobileError(err, context) {
    if (!document.body) return;

    // Reuse an existing overlay if present so repeated failures don't stack divs
    const OVERLAY_ID = 'camp-mobile-error-overlay';
    let div = document.getElementById(OVERLAY_ID);
    if (div) {
      while (div.firstChild) { div.removeChild(div.firstChild); }
    } else {
      div = document.createElement('div');
      div.id = OVERLAY_ID;
    }
    div.style.cssText = 'position:fixed;top:10%;left:5%;width:90%;background:rgba(200,0,0,0.9);color:white;z-index:999999;padding:20px;border:3px solid yellow;font-family:monospace;border-radius:10px;overflow:auto;max-height:80vh;';

    const heading = document.createElement('h3');
    heading.textContent = '🚨 CRASH IN ' + context + ' 🚨';

    const msgLabel = document.createElement('b');
    msgLabel.textContent = 'Message:';
    const msgText = document.createTextNode(' ' + (err && err.message ? err.message : String(err)));

    const stackLabel = document.createElement('b');
    stackLabel.textContent = 'Stack:';
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;font-size:10px;';
    pre.textContent = err && err.stack ? err.stack : '';

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'padding:10px;background:black;color:white;border:1px solid white;';
    closeBtn.textContent = 'Close (Screenshot this first!)';
    closeBtn.addEventListener('click', function () { div.parentNode && div.parentNode.removeChild(div); });

    div.appendChild(heading);
    div.appendChild(msgLabel);
    div.appendChild(msgText);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createElement('br'));
    div.appendChild(stackLabel);
    div.appendChild(document.createElement('br'));
    div.appendChild(pre);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createElement('br'));
    div.appendChild(closeBtn);

    if (!div.parentNode) {
      document.body.appendChild(div);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────

  /**
   * warmUp(renderer)
   * Pre-build the camp scene in the background (called at game init, not on first death).
   * This eliminates the synchronous scene-build freeze on the first camp visit.
   */
  function warmUp(rendererRef) {
    if (_campScene || _isBuilding) return; // Already built or building
    if (!T()) {
      // THREE not yet available — wait and retry
      _waitForTHREE(function () { warmUp(rendererRef); });
      return;
    }
    _renderer = rendererRef;
    _isBuilding = true;
    try {
      _buildScene();
      console.log('[CampWorld] Scene pre-warmed successfully');
    } catch (e) {
      console.error('[CampWorld]', '_buildScene() in warmUp', 'failed:', e);
      _showMobileError(e, '_buildScene() in warmUp');
      _campScene = null;
    }
    _isBuilding = false;
  }

  /**
   * enter(renderer, saveData, callbacks)
   * Called by main.js whenever the camp should be shown.
   * @param {THREE.WebGLRenderer} renderer  shared renderer
   * @param {object} saveData              current save data
   * @param {object} callbacks             { buildingId: fn, ... }
   */
  function enter(renderer, saveData, callbacks) {
    if (!T()) {
      console.warn('[CampWorld] THREE not yet available – deferred enter');
      // Retry: wait for window.THREE then re-enter
      _waitForTHREE(function () { enter(renderer, saveData, callbacks); });
      return;
    }

    _renderer  = renderer;
    _saveData  = saveData;
    _callbacks = callbacks || {};

    // Build scene once — wrap in try/catch so a partial build failure
    // resets _campScene to null, allowing a clean retry on the next enter().
    // Note: JavaScript is single-threaded so warmUp() (called via setTimeout) will
    // always complete fully before enter() runs. _isBuilding guards against any
    // unexpected re-entrant scenario.
    if (!_campScene) {
      if (_isBuilding) {
        // This path should not occur in practice (single-threaded JS), but as a
        // safety valve: skip activation and let the caller try again on next visit.
        console.warn('[CampWorld] enter() called while scene is building — retry will succeed');
        return;
      }
      _isBuilding = true;
      try {
        _buildScene();
      } catch (e) {
        console.error('[CampWorld]', '_buildScene() in enter', 'failed:', e);
        _showMobileError(e, '_buildScene() in enter');
        _campScene = null; // ensure a full rebuild is attempted next time
        _isBuilding = false;
        return;
      }
      _isBuilding = false;
    }

    // Reset player to spawn — wrap in try/catch so any unexpected setup
    // failure does not block camp activation (scene is already built).
    try {
      _playerPos.x = SPAWN_POS.x;
      _playerPos.z = SPAWN_POS.z;
      _playerVel.x = 0;
      _playerVel.z = 0;
      if (_playerMesh) {
        _playerMesh.position.set(_playerPos.x, PLAYER_RADIUS, _playerPos.z);
      }
      _updateCamera(0);

      // Refresh building visibility
      _refreshBuildings();

      // Sync A.I.D.A intro state from saveData
      const ais = (_saveData && _saveData.aidaIntroState) || {};
      _aidaIntroState.chipPickedUp = !!ais.chipPickedUp;
      _aidaIntroState.chipInserted = !!ais.chipInserted;
      if (_aidaChipMesh)  _aidaChipMesh.visible  = !_aidaIntroState.chipPickedUp;
      if (_aidaRobotMesh) _aidaRobotEyesOn(_aidaIntroState.chipInserted);
      // If Quest Hall already built, move AIDA to stand in front of it
      if (_aidaIntroState.chipInserted && _aidaRobotMesh) {
        const _qmData = _saveData && _saveData.campBuildings && _saveData.campBuildings.questMission;
        if (_qmData && _qmData.level > 0) {
          _aidaRobotMesh.position.set(AIDA_QUEST_HALL_POS.x, 0, AIDA_QUEST_HALL_POS.z);
        }
      }

      // Ensure HUD elements
      _ensureHUD();
      _nearBuilding = null;
      _updatePromptUI();

      // Resource HUD is replaced by WaterBot terminal — suppress it in camp.
      // GameHarvesting.showCampHUD was previously called here, but the WaterBot
      // terminal now surfaces all resource data. Keep HUD hidden in camp mode.
      const _harvestHudEl = document.getElementById('harvest-hud');
      if (_harvestHudEl) _harvestHudEl.style.display = 'none';

      // Show camp profile UI and refresh
      const _profileUI = document.getElementById('camp-profile-ui');
      if (_profileUI) _profileUI.style.display = 'flex';
      _updateCampProfile();

      // Camera aspect
      const aspect = window.innerWidth / window.innerHeight;
      if (_campCamera) {
        _campCamera.aspect = aspect;
        _campCamera.updateProjectionMatrix();
      }

      // Reset touch state
      _touch.active = false;
      _touch.id = null;
      _touch.x = 0;
      _touch.y = 0;
      _hideTouchIndicator();

      // Force corruption tier re-evaluation on each camp visit (save data may
      // have changed since the last visit, e.g. a new node was unlocked mid-run)
      _lastCorruptionLevel = -1;
      _treeGlitchTimer = TREE_GLITCH_INTERVAL;

      // Reset Benny greeting so proximity check re-runs on each camp visit
      // (but _triggerBennyGreeting() checks bennyGreetingShown in save data so it only shows once)
      _bennyGreeted = false;

      // Benny quest-aware speech on returning to camp (after first greeting already shown)
      if (window.saveData && window.saveData.bennyGreetingShown) {
        setTimeout(function () {
          if (!_isActive) return;
          var sd = window.saveData;
          var tq = sd && sd.tutorialQuests;
          if (tq && tq.readyToClaim && tq.readyToClaim.length > 0) {
            _showBennySpeech('Duuude welcome back!\nGo claim your\nquest in the\nMain Building! 📜');
            setTimeout(function () { _hideBennySpeech(); }, 4000);
          } else if (tq && tq.currentQuest) {
            var currentQ = (typeof getCurrentQuest === 'function') ? getCurrentQuest() : null;
            if (currentQ) {
              // Context-aware hints for the new slow-burn quest chain
              if (currentQ.id === 'quest_buildQuesthall') {
                _showBennySpeech('Walk to the\nQuest Hall plot\nand build it! 🏗️\n(I gave you materials)');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'firstRunDeath') {
                _showBennySpeech('Head out and fight!\nDie once so\nI can... calibrate. ⚔️');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'quest_dailyRoutine') {
                _showBennySpeech('Hey dude! 🌊\nSurvive 2 minutes\nin your next run\nto unlock daily rewards!');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'quest_harvester') {
                _showBennySpeech('Reach Level 3\nin a run to unlock\nthe Forge, dude! 🔨');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'quest_firstBlood') {
                var w = (sd.resources && sd.resources.wood) || 0;
                var s = (sd.resources && sd.resources.stone) || 0;
                _showBennySpeech('Gather resources!\n🪵 Wood: ' + w + '/30\n🪨 Stone: ' + s + '/30\nThen turn them in!');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'quest_gainingStats') {
                var kills = sd.totalKills || 0;
                _showBennySpeech('Keep fighting!\n⚔️ ' + kills + '/300 kills\nThe Skill Tree\nawaits, dude! 🌳');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'quest_eggHunt') {
                _showBennySpeech('Reach Level 15 and\nfind the Mysterious\nEgg out there! 🥚');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'quest_newFriend') {
                _showBennySpeech('You found the egg!\nClaim your quest\nat the Main Building\nto hatch it! 🐣');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'quest_pushingLimits') {
                _showBennySpeech('Defeat the Boss\nat Wave 10 to\nunlock Special Attacks\nand the Warehouse! 🏆');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else if (currentQ.id === 'questForge0_unlock' || currentQ.id === 'questForge0b_craftTools') {
                // Legacy forge quest hints
                _showBennySpeech('Duude! Build the\nForge and craft\ntools to gather\nresources! 🔨');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else {
                _showBennySpeech('Hey dude!\nYour quest:\n' + currentQ.name);
                setTimeout(function () { _hideBennySpeech(); }, 3500);
              }
            }
          }
        }, 1500);
      }
    } catch (setupErr) {
      console.warn('[CampWorld] Non-critical setup error in enter():', setupErr);
    }

    // First-time camp arrival: show player comic bubble intro
    if (_saveData && !_saveData._firstCampBubbleShown) {
      _saveData._firstCampBubbleShown = true;
      setTimeout(function() {
        if (!_isActive) return;
        if (window._showPlayerBubble) {
          window._showPlayerBubble('hey whats going on...', 4000);
        }
      }, 2000);
    }

    // Post-run camp arrival: show pending notifications (level-up, achievements, rewards)
    if (window._campFromRun) {
      window._campFromRun = false;
      setTimeout(function() {
        _showPostRunNotifications();
      }, 800);
    }

    _isActive = true;
    if (typeof window._syncJoystickZone === 'function') window._syncJoystickZone();
  }

  /**
   * exit()
   * Called by main.js when leaving camp.
   */
  function exit() {
    _isActive = false;
    if (typeof window._syncJoystickZone === 'function') window._syncJoystickZone();
    _menuOpen = false;
    // Hide camp-specific overlays
    _setCampStoryline(null);
    if (_playerBubbleEl) _playerBubbleEl.style.display = 'none';
    _playerBubbleTimer = 0;
    document.body.classList.remove('camp-menu-open');
    _keys = {};
    _touch.active = false;
    _touch.x = 0;
    _touch.y = 0;
    _nearBuilding = null;
    if (_promptEl) _promptEl.style.display = 'none';
    if (_interactBtn) _interactBtn.style.display = 'none';
    _hideTouchIndicator();
    _hideBennySpeech();
    // Reset camp animation state
    _campAnimState = 'idle';
    _campAnimTimer = 0;
    _campDashing = false;
    _campSliding = false;
    _campActionAnim = null;
    // Remove camp mode from resource HUD when leaving camp (WaterBot now handles it)
    if (window.GameHarvesting) window.GameHarvesting.hideCampHUD();

    // Hide camp-specific UI when leaving
    const _profileUI = document.getElementById('camp-profile-ui');
    if (_profileUI) _profileUI.style.display = 'none';
    _closeWaterBot();

    // Reset main-game joystick state so sticks don't stay "active" into the next run.
    // Use window._campJoystick / _campJoystickRight which are the same objects as
    // joystickLeft / joystickRight in main.js (set before camp-world.js loads).
    const _jLeft  = window._campJoystick;
    const _jRight = window._campJoystickRight;
    if (_jLeft)  { _jLeft.active  = false; _jLeft.x  = 0; _jLeft.y  = 0; _jLeft.id  = null; }
    if (_jRight) { _jRight.active = false; _jRight.x = 0; _jRight.y = 0; _jRight.id = null; }
  }

  // ── Alien Incubator Pod animation + proximity interaction ────────────────
  function _updateIncubator(dt) {
    if (!_incubatorMesh || !_campScene) return;
    const THREE = T();

    // Animate pod glow pulsing
    _incubatorMesh.traverse(function (child) {
      if (child._incubatorPod && child.material) {
        const pulse = 0.3 + Math.abs(Math.sin(_campTime * 2.2)) * 0.5;
        child.material.emissiveIntensity = pulse;
        child.material.opacity = 0.35 + pulse * 0.2;
      }
    });
    if (_incubatorMesh._podLight) {
      _incubatorMesh._podLight.intensity = 0.5 + Math.abs(Math.sin(_campTime * 2.2)) * 0.8;
    }
    // Gentle float
    _incubatorMesh.position.y = Math.sin(_campTime * 1.5) * 0.05;

    // Proximity check — show interaction UI
    const idx = _playerPos.x - INCUBATOR_POS.x;
    const idz = _playerPos.z - INCUBATOR_POS.z;
    const incubatorDist = Math.sqrt(idx * idx + idz * idz);
    const isNear = incubatorDist < INCUBATOR_INTERACT_RADIUS;

    // Show / hide incubator prompt
    if (isNear && !_menuOpen) {
      const sd = (typeof _saveData !== 'undefined' && _saveData) ? _saveData : (typeof saveData !== 'undefined' ? saveData : null);
      const biomatter = (sd && sd.alienBiomatter) ? sd.alienBiomatter : 0;
      const alreadyHatched = sd && sd.alienIncubatorHatched;

      if (!_promptEl) return;

      if (alreadyHatched) {
        _promptEl.textContent = '👽 Incubator — Companion Active';
      } else if (biomatter >= 50) {
        _promptEl.textContent = `🧬 Incubator — Deposit 50 Biomatter [E]  (${biomatter} available)`;
        if (_interactBtn) {
          _interactBtn.textContent = 'DEPOSIT';
          _interactBtn.style.background = 'linear-gradient(135deg,#00cc66,#006633)';
          _interactBtn.style.display = 'block';
        }
      } else {
        _promptEl.textContent = `🧬 Incubator — Need 50 Alien Biomatter  (${biomatter}/50)`;
      }
    }
  }

  /**
   * Called by external input handler (or the existing camp E-key handler)
   * when the player presses interact near the Incubator pod.
   */
  function _interactIncubator() {
    const sd = (typeof saveData !== 'undefined') ? saveData : null;
    if (!sd) return;
    if (!sd.alienIncubatorHatched) {
      // Pre-hatch: deposit biomatter
      if ((sd.alienBiomatter || 0) < 50) {
        _showIncubatorMsg(`🧬 Need 50 Alien Biomatter to hatch. You have ${sd.alienBiomatter || 0}/50.`, '#ff8800');
        return;
      }
      // Deposit 50 biomatter and hatch companion
      sd.alienBiomatter -= 50;
      sd.alienIncubatorHatched = true;
      sd.companionGrowthStage = sd.companionGrowthStage === 'egg' ? 'newborn' : sd.companionGrowthStage;
      // Only advance from 'egg' → 'newborn' on first hatch; leave juvenile/adult intact
      if (!sd.companions.greyAlien.skills) sd.companions.greyAlien.skills = {};
      if (typeof saveSaveData === 'function') saveSaveData();
      // Flash pod
      if (_incubatorMesh) {
        _incubatorMesh.traverse(function (child) {
          if (child._incubatorPod && child.material) {
            child.material.emissive.set(0x00ff88);
            child.material.emissiveIntensity = 3.0;
            setTimeout(() => { if (child.material) child.material.emissive.set(0x003366); }, 800);
          }
        });
      }
      _showIncubatorMsg('👽 Grey Alien companion hatched! It will join you on your next run.', '#00ff88');
      return;
    }

    // Post-hatch: show skill upgrade UI
    _showIncubatorSkillUI();
  }

  /** Shows the Grey Alien companion skill upgrade modal at the Incubator. */
  function _showIncubatorSkillUI() {
    const sd = (typeof saveData !== 'undefined') ? saveData : null;
    if (!sd) return;
    if (!sd.companions.greyAlien.skills) sd.companions.greyAlien.skills = {};
    const skills = sd.companions.greyAlien.skills;
    const sp = sd.companionSkillPoints || 0;
    _menuOpen = true; _menuOpenTs = Date.now();
    document.body.classList.add('camp-menu-open');

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed','top:0','left:0','width:100%','height:100%',
      'background:rgba(0,0,0,0.88)','z-index:8000',
      'display:flex','align-items:center','justify-content:center'
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#040c14',
      'border:2px solid #00ff88',
      'border-radius:6px',
      'padding:20px',
      'max-width:min(400px,92vw)',
      'width:100%',
      'box-shadow:0 0 20px rgba(0,255,136,0.4)',
      'font-family:"Courier New",monospace',
      'color:#00ff88'
    ].join(';');

    function skillRow(id, icon, label, desc, maxLevel) {
      const level = skills[id] || 0;
      const canUpgrade = level < maxLevel && sp > 0;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin:10px 0;padding:8px;border:1px solid rgba(0,255,136,0.25);border-radius:4px;';
      const info = document.createElement('div');
      info.style.flex = '1';
      info.innerHTML = `<span style="font-size:1.3em">${icon}</span> <b>${label}</b> <span style="color:#888">Lv ${level}/${maxLevel}</span><br><span style="font-size:0.8em;color:#668866">${desc}</span>`;
      row.appendChild(info);
      if (canUpgrade) {
        const btn = document.createElement('button');
        btn.textContent = 'UPGRADE (1 SP)';
        btn.style.cssText = 'background:#003322;color:#00ff88;border:1px solid #00ff88;border-radius:3px;padding:4px 8px;cursor:pointer;font-family:inherit;font-size:0.85em;white-space:nowrap;';
        btn.onclick = function () {
          if ((sd.companionSkillPoints || 0) > 0 && (skills[id] || 0) < maxLevel) {
            skills[id] = (skills[id] || 0) + 1;
            sd.companionSkillPoints = (sd.companionSkillPoints || 0) - 1;
            if (typeof saveSaveData === 'function') saveSaveData();
            if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); _menuOpen = false; document.body.classList.remove('camp-menu-open'); }
            _showIncubatorSkillUI(); // Refresh
          }
        };
        row.appendChild(btn);
      } else if (level >= maxLevel) {
        const lbl = document.createElement('span');
        lbl.style.cssText = 'color:#00ff88;font-size:0.8em;white-space:nowrap;';
        lbl.textContent = '✓ MAX';
        row.appendChild(lbl);
      } else {
        const lbl = document.createElement('span');
        lbl.style.cssText = 'color:#446644;font-size:0.8em;white-space:nowrap;';
        lbl.textContent = 'Need SP';
        row.appendChild(lbl);
      }
      return row;
    }

    panel.innerHTML = `<div style="font-size:1.1em;margin-bottom:6px;text-align:center;letter-spacing:1px;">
      👽 GREY ALIEN COMPANION<br>
      <span style="font-size:0.8em;color:#668866">Skill Points Available: <b>${sp}</b></span></div>`;
    panel.appendChild(skillRow('damage',   '💥', 'Plasma Damage',  '+20% bolt damage per level',   3));
    panel.appendChild(skillRow('fireRate', '⚡', 'Fire Rate',       '-15% attack cooldown per level', 3));
    panel.appendChild(skillRow('multiShot','🔫', 'Multi-Shot',      'Fire extra bolts per attack',    3));

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '[ CLOSE ]';
    closeBtn.style.cssText = 'display:block;margin:14px auto 0;background:none;color:#00ff88;border:1px solid #00ff88;border-radius:3px;padding:6px 18px;cursor:pointer;font-family:inherit;letter-spacing:1px;';
    closeBtn.onclick = function () { if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); _menuOpen = false; document.body.classList.remove('camp-menu-open'); } };
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function _showIncubatorMsg(text, color) {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'bottom:22%', 'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.88)',
      `color:${color || '#00ffcc'}`,
      'font-family:"Courier New",monospace',
      'font-size:clamp(13px,3vw,15px)',
      'padding:10px 18px',
      'border-radius:4px',
      `border:1px solid ${color || '#00ffcc'}`,
      'z-index:9000',
      'pointer-events:none',
      'text-align:center',
      'max-width:min(340px,88vw)'
    ].join(';');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3500);
  }

  /**
   * _updateCampStorylineBar
   * Updates the camp storyline bar with the current quest objective text.
   */
  function _updateCampStorylineBar() {
    const tq = (typeof saveData !== 'undefined') && saveData && saveData.tutorialQuests;
    if (!tq || !tq.currentQuest) {
      _setCampStoryline(null);
      return;
    }
    var cq = tq.currentQuest;
    var storyText = '';
    if (cq === 'quest_findingAida') {
      if (!_aidaIntroState.chipPickedUp) {
        storyText = '📜 Quest 1 — Find the glowing chip north of the campfire...';
      } else if (!_aidaIntroState.chipInserted) {
        storyText = '📜 Quest 1 — Insert the chip into the broken robot...';
      } else {
        storyText = '📜 Quest 1 — Go to the Quest Hall to continue...';
      }
    } else if (cq === 'quest_buildQuesthall') {
      storyText = '📜 Quest 2 — Build the Quest Hall...';
    } else if (cq === 'quest_craftAllTools') {
      storyText = '📜 Quest — Craft all tools at the Forge...';
    } else if (cq === 'quest_firstBlood') {
      storyText = '📜 Quest — Complete your first run...';
    } else if (cq === 'quest_dailyRoutine') {
      storyText = '📜 Quest — Complete your daily routine...';
    } else if (cq === 'firstRunDeath') {
      storyText = '📜 Quest — Head out and fight — survive your first run!';
    } else if (cq === 'quest_shrineCalibrate') {
      storyText = '📜 Quest — Calibrate the shrine...';
    }
    _setCampStoryline(storyText || null);
  }

  /**
   * _updateCampQuestArrow
   * Shows a waterdrop-shaped arrow pointing toward the current quest objective building.
   */
  function _updateCampQuestArrow() {
    if (!_campArrowEl) {
      _campArrowEl = document.getElementById('camp-quest-arrow');
      _campArrowDistEl = document.getElementById('camp-quest-arrow-dist');
    }
    if (!_campArrowEl) return;

    let targetDef = null;
    const tq = (typeof saveData !== 'undefined') && saveData && saveData.tutorialQuests;
    if (tq) {
      const cq = tq.currentQuest;
      const questToBuilding = {
        'quest_findingAida': null,
        'quest_buildQuesthall': 'questMission',
        'quest_dailyRoutine': 'questMission',
        'quest_craftAllTools': 'forge',
        'quest_firstBlood': 'questMission',
        'firstRunDeath': null,
        'quest_shrineCalibrate': 'questMission',
      };
      const targetId = cq ? questToBuilding[cq] : null;
      if (targetId) {
        targetDef = BUILDING_DEFS.find(function(d) { return d.id === targetId; });
      } else if (cq === 'quest_findingAida') {
        // Phase 1: chip not yet picked up → point to chip
        // Phase 2: chip picked up but not inserted → point to AIDA robot (live position)
        if (!_aidaIntroState.chipPickedUp) {
          targetDef = { x: AIDA_CHIP_POS.x, z: AIDA_CHIP_POS.z };
        } else {
          const _rp = _getAidaRobotPos();
          targetDef = { x: _rp.x, z: _rp.z };
        }
      }
    }

    // Also point to Quest Hall if a quest is ready to claim
    if (!targetDef && tq && tq.readyToClaim && tq.readyToClaim.length > 0) {
      targetDef = BUILDING_DEFS.find(function(d) { return d.id === 'questMission'; });
    }

    if (!targetDef) {
      _campArrowEl.style.display = 'none';
      return;
    }

    const dx = targetDef.x - _playerPos.x;
    const dz = targetDef.z - _playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // ── Distance-based color coding ──
    // Green (0-1m: very close), Yellow (2-5m), White (standard)
    var arrowColor = '#ffffff';
    if (dist < 1.5)       arrowColor = '#00ff66';
    else if (dist < 5.0)  arrowColor = '#ffdd00';
    _campArrowEl.style.color = arrowColor;
    _campArrowEl.style.textShadow = '0 0 12px ' + arrowColor;

    // ── "Point down" mode: when directly over the goal, show ▼ indicator ──
    if (dist < 3.5) {
      // Project goal position to screen to show ▼ marker
      if (_campCamera) {
        var THREE = T();
        if (!_campUITmpVec && THREE) _campUITmpVec = new THREE.Vector3();
        if (_campUITmpVec) {
          _campUITmpVec.set(targetDef.x, 0.5, targetDef.z);
          _campUITmpVec.project(_campCamera);
          var gx = (_campUITmpVec.x * 0.5 + 0.5) * window.innerWidth;
          var gy = (-_campUITmpVec.y * 0.5 + 0.5) * window.innerHeight;
          _campArrowEl.style.display = 'block';
          _campArrowEl.style.left = (gx - 24) + 'px';
          _campArrowEl.style.top = (gy - 40) + 'px';
          _campArrowEl.style.transform = 'rotate(180deg)';
          _campArrowEl.style.color = '#00ff66';
          _campArrowEl.style.textShadow = '0 0 16px #00ff66';
          if (_campArrowDistEl) _campArrowDistEl.textContent = Math.round(dist * 10) / 10 + 'm';
        }
      } else {
        _campArrowEl.style.display = 'none';
      }
      return;
    }

    _campArrowEl.style.display = 'block';
    if (_campArrowDistEl) _campArrowDistEl.textContent = Math.round(dist) + 'm';

    const angleRad = Math.atan2(dz, dx);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const margin = 70;
    const cx = W / 2;
    const cy = H / 2;
    const tanA = Math.tan(angleRad);
    let ax, ay;
    if (Math.abs(Math.cos(angleRad)) > 0.001) {
      if (dx > 0) {
        ax = cx + (W / 2 - margin);
        ay = cy + tanA * (W / 2 - margin);
      } else {
        ax = cx - (W / 2 - margin);
        ay = cy - tanA * (W / 2 - margin);
      }
      if (Math.abs(ay - cy) > H / 2 - margin) {
        ay = dz > 0 ? cy + H / 2 - margin : cy - H / 2 + margin;
        ax = Math.abs(tanA) > 0.001 ? cx + (ay - cy) / tanA : cx;
      }
    } else {
      ax = cx;
      ay = dz > 0 ? cy + H / 2 - margin : cy - H / 2 + margin;
    }

    _campArrowEl.style.left = (ax - 24) + 'px';
    _campArrowEl.style.top = (ay - 30) + 'px';
    const angleDeg = angleRad * (180 / Math.PI);
    _campArrowEl.style.transform = 'rotate(' + (angleDeg + 90) + 'deg)';
  }

  /**
   * update(dt)
   * Per-frame logic update.  Called from main.js animate() when isActive.
   */
  function update(dt) {
    if (!_isActive || !_campScene) return;
    _updateFire(dt);
    _updateParticles(dt);
    _updateBennyNPC(dt);
    _updateIncubator(dt);
    _updateAidaIntro(dt);
    _updateCampQuestArrow();
    _updatePlayerBubble(dt);
    _updateCampStorylineBar();
    _updateCodexPyramid(dt);
    _updateCorruption(dt);

    // When a building menu is open, freeze player input/movement but keep
    // rendering the camp scene (fire, particles, camera).  Auto-detect when
    // the overlay is dismissed: if the camp-screen is visible and no other
    // full-screen overlay is on top, resume.
    if (_menuOpen) {
      _checkMenuClosed();
    }

    if (!_menuOpen) {
      _updatePlayer(dt);
      _updateInteraction();
    }
    _updateCamera(dt);
    _updateSigns();
    // Sprite sheet idle-breathing avatar removed per design update
    // _updateProfileAvatar(dt);
  }

  /**
   * render()
   * Render the camp scene.  Called from main.js animate().
   */
  function render() {
    if (!_isActive || !_campScene || !_campCamera || !_renderer) return;
    _renderer.render(_campScene, _campCamera);
    // Render UI overlay on top without clearing — avatar rendering disabled
    if (_uiScene && _uiCamera) {
      // Profile avatar sprite sheet removed; _uiScene kept for future UI elements
    }
  }

  /**
   * refreshBuildings()
   * Re-evaluate which buildings are visible (call after unlock events).
   */
  function refreshBuildings(saveData) {
    if (saveData) _saveData = saveData;
    _refreshBuildings();
    // Refresh prompt UI in case a building's state changed
    _updatePromptUI();
    // If Quest Hall just got built and AIDA chip is inserted, walk AIDA to Quest Hall
    if (_aidaIntroState.chipInserted && _aidaRobotMesh && !_robotLapActive) {
      const _qmBd = _saveData && _saveData.campBuildings && _saveData.campBuildings.questMission;
      if (_qmBd && _qmBd.level > 0) {
        _aidaRobotMesh.position.set(AIDA_QUEST_HALL_POS.x, 0, AIDA_QUEST_HALL_POS.z);
      }
    }
  }

  /**
   * onResize()
   * Update camera aspect on window resize.
   */
  function onResize() {
    if (_campCamera) {
      _campCamera.aspect = window.innerWidth / window.innerHeight;
      _campCamera.updateProjectionMatrix();
    }
    // Update orthographic UI camera to match new viewport
    if (_uiCamera) {
      const W = window.innerWidth;
      const H = window.innerHeight;
      _uiCamera.left   = -W / 2;
      _uiCamera.right  =  W / 2;
      _uiCamera.top    =  H / 2;
      _uiCamera.bottom = -H / 2;
      _uiCamera.updateProjectionMatrix();
    }
    // Reposition avatar to stay in top-left corner after resize
    if (_profileAvatar) {
      const W = window.innerWidth;
      const H = window.innerHeight;
      _profileAvatar.position.set(-W / 2 + _AVATAR_MARGIN, H / 2 - _AVATAR_MARGIN, 0);
    }
  }

  // Register keyboard listeners globally (only fire when camp is active via _isActive guard).
  // These are intentionally registered once at module load time (page lifetime) since
  // camp-world.js is a singleton loaded once at startup — no leak concerns.
  window.addEventListener('keydown', _onKeyDown);
  window.addEventListener('keyup',   _onKeyUp);

  // Touch movement listeners (own camp movement system, active only when camp is active)
  window.addEventListener('touchstart', _onTouchStart, { passive: false });
  window.addEventListener('touchmove',  _onTouchMove,  { passive: false });
  window.addEventListener('touchend',   _onTouchEnd,   { passive: true });
  window.addEventListener('touchcancel',_onTouchEnd,   { passive: true });

  // Handle resize
  window.addEventListener('resize', onResize);

  // ──────────────────────────────────────────────────────────
  // Slot Machine UI
  // ──────────────────────────────────────────────────────────
  function _showSlotMachineUI() {
    const sd = (typeof saveData !== 'undefined') ? saveData : (_saveData || null);
    const coins = sd && sd.resources ? (sd.resources.slotCoins || 0) : 0;
    const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '🎰'];

    const overlay = document.createElement('div');
    overlay.id = 'slot-machine-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);z-index:8500;display:flex;align-items:center;justify-content:center;';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#0d0d1a;border:2px solid #ff44cc;border-radius:10px;padding:24px;max-width:360px;width:90%;text-align:center;box-shadow:0 0 30px rgba(255,68,204,0.5);font-family:"Courier New",monospace;color:#fff;';

    function _render() {
      const currentCoins = sd && sd.resources ? (sd.resources.slotCoins || 0) : 0;
      panel.innerHTML = `
        <div style="font-size:2em;margin-bottom:4px;">🎰</div>
        <div style="font-family:Bangers,cursive;font-size:22px;color:#ff44cc;letter-spacing:2px;margin-bottom:8px;">SLOT MACHINE</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:16px;">Cost: 1 🎰 Slot Coin | Reward: +5 Account XP</div>
        <div style="font-size:13px;color:#ffcc44;margin-bottom:20px;">Your Slot Coins: <b>${currentCoins}</b></div>
        <div id="slot-reels" style="font-size:2.5em;letter-spacing:12px;margin-bottom:20px;min-height:52px;">❓ ❓ ❓</div>
        <div id="slot-result" style="font-size:13px;color:#aaa;min-height:20px;margin-bottom:16px;"></div>
        <button id="slot-spin-btn" ${currentCoins < 1 ? 'disabled' : ''} style="${currentCoins < 1 ? 'font-size:15px;padding:10px 28px;background:#333;color:#666;border:2px solid #555;border-radius:5px;cursor:not-allowed;letter-spacing:1px;margin-right:8px;' : 'font-size:15px;padding:10px 28px;background:linear-gradient(to bottom,#8b00cc,#44007a);color:#fff;border:2px solid #ff44cc;border-radius:5px;cursor:pointer;letter-spacing:1px;margin-right:8px;'}">🎰 SPIN (1 Coin)</button>
        <button id="slot-close-btn" style="font-size:13px;padding:10px 20px;background:rgba(30,30,30,0.9);color:#888;border:1px solid #555;border-radius:5px;cursor:pointer;">Close</button>
      `;
      panel.querySelector('#slot-close-btn').onclick = function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        _menuOpen = false;
        document.body.classList.remove('camp-menu-open');
      };
      const spinBtn = panel.querySelector('#slot-spin-btn');
      if (spinBtn && !spinBtn.disabled) {
        spinBtn.onclick = function () {
          if (!sd || !sd.resources || (sd.resources.slotCoins || 0) < 1) {
            if (typeof showStatusMessage === 'function') showStatusMessage('Need 1 Slot Coin to play!', 2000);
            return;
          }
          sd.resources.slotCoins = (sd.resources.slotCoins || 0) - 1;
          if (typeof showStatChange === 'function') showStatChange('−1 🎰 Slot Coin', 'rare');
          // Grant 5 Account XP always
          if (typeof addAccountXP === 'function') addAccountXP(5);
          else if (typeof window.addAccountXP === 'function') window.addAccountXP(5);
          else if (sd) { sd.accountXP = (sd.accountXP || 0) + 5; }
          if (typeof showStatChange === 'function') showStatChange('+5 Account XP', 'epic');
          if (typeof saveSaveData === 'function') saveSaveData();
          // Animate reels
          const reels = panel.querySelector('#slot-reels');
          const result = panel.querySelector('#slot-result');
          spinBtn.disabled = true;
          let ticks = 0;
          const totalTicks = 18;
          const interval = setInterval(function () {
            const r1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            const r2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            const r3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            reels.textContent = r1 + ' ' + r2 + ' ' + r3;
            ticks++;
            if (ticks >= totalTicks) {
              clearInterval(interval);
              const allMatch = r1 === r2 && r2 === r3;
              if (allMatch) {
                result.style.color = '#ffcc00';
                result.textContent = '🎉 JACKPOT! Bonus: +20 Account XP!';
                if (typeof addAccountXP === 'function') addAccountXP(20);
                else if (typeof window.addAccountXP === 'function') window.addAccountXP(20);
                else if (sd) { sd.accountXP = (sd.accountXP || 0) + 20; }
                if (typeof saveSaveData === 'function') saveSaveData();
              } else {
                result.style.color = '#aaa';
                result.textContent = '+5 Account XP awarded.';
              }
              _render();
            }
          }, 80);
        };
      }
    }

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    _render();
  }

  // ──────────────────────────────────────────────────────────
  // Expose public API
  // ──────────────────────────────────────────────────────────
  window.CampWorld = {
    get isActive() { return _isActive; },
    get menuOpen() { return _menuOpen; },
    pauseInput: function () { _menuOpen = true; _menuOpenTs = Date.now(); document.body.classList.add('camp-menu-open'); },
    resumeInput: _resumeInput,
    _forceResumeInput: _resumeInput,
    enter,
    exit,
    update,
    render,
    refreshBuildings,
    playBuildingAppearAnimation: _playBuildingAppearAnimation,
    playBuildingUnlockAnimation: _playBuildingUnlockAnimation,
    bennyWalkToBuild: _bennyWalkToBuild,
    bennyWalkToBuildThenDialog: _bennyWalkToBuildThenDialog,
    showBennyContextualHint: _showBennyContextualHint,
    showBennySpeech: _showBennySpeech,
    hideBennySpeech: _hideBennySpeech,
    interactIncubator: _interactIncubator,
    unlockBuilding(buildingId, saveData) {
      if (saveData) _saveData = saveData;
      if (_saveData && _saveData.campBuildings && _saveData.campBuildings[buildingId]) {
        _saveData.campBuildings[buildingId].unlocked = true;
      }
      _refreshBuildings();
      _playBuildingAppearAnimation(buildingId); // Use appear animation for quest unlock
    },
    onResize,
    warmUp,
  };

})();
