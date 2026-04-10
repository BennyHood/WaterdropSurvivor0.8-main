// js/enemy-class.js — DroneTurret helper, water particle pool, and Enemy class.
// Contains all enemy AI, pathfinding, attack logic, death effects, and hard-mode tank enemies.
// Depends on: THREE (CDN), variables from main.js and player-class.js

    // ── GLOBAL SHARED GEOMETRY & MATERIAL (prevents per-enemy VRAM exhaustion) ──────────────
    // ALL enemies reference exactly these objects. Never dispose SHARED_GEO or SHARED_MAT.
    const SHARED_GEO = {
      cube:   new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 8, 8)
    };
    SHARED_GEO.cube._isShared   = true;
    SHARED_GEO.sphere._isShared = true;
    const SHARED_MAT = {
      // SHARED_MAT.enemy is only used as a fallback — type-specific colors come from SHARED_MAT_CACHE
      enemy:  new THREE.MeshPhongMaterial({
        color: 0x44AA44,
        emissive: new THREE.Color(0x44AA44).multiplyScalar(0.6),
        emissiveIntensity: 0.15,
        shininess: 40
      }),
      black:  new THREE.MeshBasicMaterial({ color: 0x000000 }),
      bullet: new THREE.MeshBasicMaterial({ color: 0xffff00 })
    };
    SHARED_MAT.enemy._isShared = true;
    SHARED_MAT.black._isShared = true;
    SHARED_MAT.bullet._isShared = true;
    window.SHARED_GEO = SHARED_GEO;
    window.SHARED_MAT = SHARED_MAT;

    // ── Per-color shared material cache — same color → same material object ──────────────────
    // Prevents creating N materials for N enemies of the same type while still giving each
    // type its own distinct visual appearance.  Tag with _isShared so takeDamage() knows to
    // clone before mutating (blood stain, freeze, fire char, etc.).
    // Now using MeshPhongMaterial with emissive properties for camp-style visuals
    const SHARED_MAT_CACHE = {};
    function getOrCreateMat(colorHex, opts) {
      // Build a deterministic key: hex color + optional transparency flag
      const key = colorHex.toString(16) + (opts && opts.transparent ? '_t' : '');
      if (!SHARED_MAT_CACHE[key]) {
        // Use MeshPhongMaterial with emissive glow for better visuals (camp style)
        // Emissive color is darkened (55% of base) to prevent washing out the appearance
        const darkEmissive = new THREE.Color(colorHex).multiplyScalar(0.55);
        const m = new THREE.MeshPhongMaterial(Object.assign({
          color: colorHex,
          emissive: darkEmissive,
          emissiveIntensity: 0.18,  // Enhanced inner glow (was 0.15)
          shininess: 50,             // Enhanced water-like shine (was 40)
          specular: 0x444444         // Add subtle specular highlights
        }, opts || {}));
        m._isShared = true;
        SHARED_MAT_CACHE[key] = m;
      }
      return SHARED_MAT_CACHE[key];
    }
    window.SHARED_MAT_CACHE = SHARED_MAT_CACHE;

    // ── Per-type geometry cache — each shape is created once, shared across all instances ───
    const SHARED_GEO_TYPE = {};
    function getEnemyGeo(type) {
      if (SHARED_GEO_TYPE[type]) return SHARED_GEO_TYPE[type];
      let geo;
      switch (type) {
        case 1:  geo = new THREE.CapsuleGeometry(0.42, 0.55, 3, 7);  break; // Fast — elongated speedy shape
        case 3:  geo = new THREE.IcosahedronGeometry(0.85, 0);       break; // Slowing/Spiky — spiny icosahedron
        case 4:  geo = new THREE.TetrahedronGeometry(0.9, 0);        break; // Ranged
        case 5:  geo = new THREE.OctahedronGeometry(0.9, 0);         break; // Flying
        case 6:  geo = getHardTankGeometry(); geo._isShared = true; SHARED_GEO_TYPE[6] = geo; return geo; // Hard Tank (own cache)
        case 7:  geo = new THREE.CapsuleGeometry(0.48, 0.6, 3, 8);  break; // Hard Fast — larger capsule
        case 8:  geo = new THREE.DodecahedronGeometry(0.85, 0);      break; // Hard Balanced
        case 9:  geo = new THREE.IcosahedronGeometry(0.9, 0);        break; // Elite
        case 10: geo = new THREE.DodecahedronGeometry(1.1, 0);       break; // MiniBoss
        case 12: geo = new THREE.OctahedronGeometry(0.75, 1);        break; // Bug Ranged — multi-faceted
        case 13: geo = new THREE.BoxGeometry(0.9, 0.65, 0.9);        break; // Bug Slow — blocky tanky
        case 14: geo = new THREE.IcosahedronGeometry(0.65, 0);       break; // Bug Fast — angular speeder
        case 15: geo = new THREE.SphereGeometry(0.65, 7, 7);         break; // Daddy Longlegs (small)
        case 16: geo = new THREE.SphereGeometry(0.4, 6, 6);          break; // Sweeping Swarm — small
        case 17: geo = new THREE.CapsuleGeometry(0.55, 0.6, 4, 8);  break; // Grey Alien
        case 18: geo = new THREE.BoxGeometry(0.8, 0.9, 0.75);        break; // Reptilian Shifter — scaly block
        case 19: geo = new THREE.OctahedronGeometry(1.0, 1);         break; // Annunaki Orb
        case 20: geo = new THREE.DodecahedronGeometry(0.9, 0);       break; // Source Glitch
        case 21: geo = new THREE.IcosahedronGeometry(0.75, 1);       break; // Water Organism — watery angular creature
        case 22: geo = new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6); break; // Yellow Jellyfish — dome bell
        default: return SHARED_GEO.sphere; // Types 0,2,11 share generic sphere
      }
      SHARED_GEO_TYPE[type] = geo;
      geo._isShared = true;
      return geo;
    }
    window.SHARED_GEO_TYPE = SHARED_GEO_TYPE;

    // ── Per-type base colors ─────────────────────────────────────────────────────────────────
    const _ENEMY_COLORS = [
      0x44AA44,  // 0: Tank/Amoeba — green
      0x4488FF,  // 1: Fast/Water Bug — blue
      0x44CC88,  // 2: Balanced/Microbe — teal
      0x88BBFF,  // 3: Slowing/Spiky — ice blue
      0xFF8833,  // 4: Ranged/Tetrahedron — orange
      0xAA44FF,  // 5: Flying/Octahedron — violet
      0x226611,  // 6: Hard Tank — dark green
      0xFFCC00,  // 7: Hard Fast/Capsule — gold
      0x9933AA,  // 8: Hard Balanced/Dodecahedron — dark purple
      0xCC2222,  // 9: Elite/Icosahedron — crimson
      0xFFAA00,  // 10: MiniBoss — golden
      0x6600BB,  // 11: FlyingBoss — deep purple
      0x22BBCC,  // 12: Bug Ranged — bright teal
      0x116655,  // 13: Bug Slow — dark teal
      0x00EEFF,  // 14: Bug Fast — cyan
      0x888888,  // 15: Daddy Longlegs — grey
      0xFF4400,  // 16: Sweeping Swarm — orange-red
      0xAABBCC,  // 17: Grey Alien — blue-grey
      0x556633,  // 18: Reptilian Shifter — camo green
      0xFFD700,  // 19: Annunaki Orb — gold
      0xFF00FF,  // 20: Source Glitch — magenta
      0x4FC3F7,  // 21: Water Organism — cyan blue (matching player water color)
      0xFFFF00   // 22: Yellow Jellyfish — bright yellow
    ];
    // Fallback color for any type not listed in _ENEMY_COLORS
    const DEFAULT_ENEMY_COLOR = _ENEMY_COLORS[0]; // green (same as Tank/index-0)
    // Expose for use by object-pool.js when resetting pooled enemy material colors
    window._ENEMY_COLORS = _ENEMY_COLORS;

    // Helper: get the base blood color for an enemy instance (reads BloodV2 table if available)
    function _getEnemyBloodColor(enemy) {
      if (enemy && enemy.enemyType && window.BloodV2 && window.BloodV2.ENEMY_BLOOD) {
        var _eb = window.BloodV2.ENEMY_BLOOD[enemy.enemyType];
        if (_eb) return _eb.base;
      }
      return 0xcc1100;
    }
    const ENEMY_INSTANCING_ENABLED = window.ENEMY_INSTANCING_ENABLED === true;

    // ── Shared enemy projectile resources — created once, reused by every enemy shot ──────────
    // Previously fireProjectile() created a new SphereGeometry + MeshBasicMaterial on EVERY
    // shot, causing severe VRAM growth and GC pressure.  One geometry + one material is shared
    // across all live enemy projectile meshes; only the Mesh instance itself is per-shot.
    // The pool below pre-allocates ENEMY_PROJ_POOL_SIZE meshes so that even firing-intensive
    // encounters don't allocate new objects mid-frame.
    // 64 slots: typically ≤6 ranged enemies × fire-rate ~6 active projectiles each = ~36 concurrent;
    // 64 gives comfortable headroom with minimal VRAM cost.
    const _ENEMY_PROJ_GEO = new THREE.SphereGeometry(0.2, 6, 6);
    const _ENEMY_PROJ_MAT = new THREE.MeshBasicMaterial({ color: 0xFF6347 });
    _ENEMY_PROJ_GEO._isShared = true;
    _ENEMY_PROJ_MAT._isShared = true;
    const ENEMY_PROJ_POOL_SIZE     = 64;  // Initial pool allocation
    const ENEMY_PROJ_POOL_SIZE_MAX = 128; // Hard cap — beyond this, shots are silently dropped
    const _enemyProjPool = []; // pool of { mesh, active, ... } objects
    function _acquireEnemyProj() {
      for (let _ei = 0; _ei < _enemyProjPool.length; _ei++) {
        if (!_enemyProjPool[_ei].active) return _enemyProjPool[_ei];
      }
      // Pool exhausted — create a new slot up to the hard cap
      if (_enemyProjPool.length < ENEMY_PROJ_POOL_SIZE_MAX) {
        const _m = new THREE.Mesh(_ENEMY_PROJ_GEO, _ENEMY_PROJ_MAT);
        _m.frustumCulled = false;
        const _slot = { mesh: _m, active: false, lifetime: 0, speed: 0, direction: new THREE.Vector3(), damage: 0 };
        _slot.update = _enemyProjUpdate;
        _slot.destroy = _enemyProjDestroy;
        _enemyProjPool.push(_slot);
        return _slot;
      }
      return null;
    }
    function _enemyProjUpdate() {
      if (!this.active) return false;
      this.mesh.position.addScaledVector(this.direction, this.speed);
      this.lifetime--;
      if (this.lifetime <= 0) { this.destroy(); return false; }
      // Collision with player
      const _pp = (window.player && window.player.mesh) ? window.player.mesh.position : null;
      if (_pp) {
        const _pdx = this.mesh.position.x - _pp.x;
        const _pdz = this.mesh.position.z - _pp.z;
        if (_pdx * _pdx + _pdz * _pdz < 0.64) {
          // Kinetic Mirror — 10% reflect
          if (window._nmKineticMirror && !this._reflected && Math.random() < 0.10) {
            this._reflected = true;
            this.isEnemyProjectile = false;
            this.direction.x = -this.direction.x * 3.0;
            this.direction.z = -this.direction.z * 3.0;
            this.speed *= 3.0;
            if (typeof spawnParticles === 'function') spawnParticles(this.mesh.position, 0x00ffcc, 6);
            return true;
          }
          if (window.player && typeof window.player.takeDamage === 'function') {
            window.player.takeDamage(this.damage);
          }
          if (typeof spawnParticles === 'function') spawnParticles(this.mesh.position, 0xFF6347, 5);
          if (typeof playSound === 'function') { try { playSound('hit'); } catch (e) {} }
          this.destroy();
          return false;
        }
      }
      return true;
    }
    function _enemyProjDestroy() {
      this.active = false;
      this.isEnemyProjectile = false;
      this._reflected = false;
      if (this.mesh.parent) scene.remove(this.mesh);
    }

    // Enemy types that display eyes (creatures with recognizable faces)
    const ENEMY_TYPES_WITH_EYES = new Set([0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 17, 21]);

    // Enemy types that fly (need a ground shadow disc)
    const ENEMY_TYPES_FLYING = new Set([5, 11, 14, 16, 17, 19]);

    // Shared eye geometry and material reused by all enemy types that have eyes
    const SHARED_EYE_GEO = new THREE.SphereGeometry(0.09, 5, 5);
    const SHARED_PUPIL_GEO = new THREE.SphereGeometry(0.045, 5, 5);
    const SHARED_EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const SHARED_PUPIL_MAT = new THREE.MeshBasicMaterial({ color: 0x000000 });
    SHARED_EYE_GEO._isShared    = true;
    SHARED_PUPIL_GEO._isShared  = true;
    SHARED_EYE_MAT._isShared    = true;
    SHARED_PUPIL_MAT._isShared  = true;
    // Expose for object-pool.js to restore eyes on recycled enemies
    window.SHARED_EYE_GEO    = SHARED_EYE_GEO;
    window.SHARED_EYE_MAT    = SHARED_EYE_MAT;
    window.SHARED_PUPIL_GEO  = SHARED_PUPIL_GEO;
    window.SHARED_PUPIL_MAT  = SHARED_PUPIL_MAT;
    window.ENEMY_TYPES_WITH_EYES = ENEMY_TYPES_WITH_EYES;

    // ── PERF FIX: Pre-allocated wound decal pool (replaces per-hit new THREE.SphereGeometry) ──
    const _WOUND_POOL_SIZE = 30;
    const _WOUND_SPHERE_GEO = new THREE.SphereGeometry(0.1, 5, 5);
    const _WOUND_CIRCLE_GEO = new THREE.CircleGeometry(0.12, 8);
    _WOUND_SPHERE_GEO._isShared = true;
    _WOUND_CIRCLE_GEO._isShared = true;
    const _WOUND_MAT = new THREE.MeshBasicMaterial({ color: 0x220000 });
    _WOUND_MAT._isShared = true;
    const _WOUND_CIRCLE_MAT = new THREE.MeshBasicMaterial({ color: 0x0A0000, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
    _WOUND_CIRCLE_MAT._isShared = true;
    const _woundPool = [];
    let _woundPoolInited = false;
    function _initWoundPool() {
      if (_woundPoolInited || !scene) return;
      _woundPoolInited = true;
      for (let i = 0; i < _WOUND_POOL_SIZE; i++) {
        const isCircle = i >= _WOUND_POOL_SIZE / 2;
        const geo = isCircle ? _WOUND_CIRCLE_GEO : _WOUND_SPHERE_GEO;
        const mat = isCircle ? _WOUND_CIRCLE_MAT : _WOUND_MAT;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        _woundPool.push({ mesh: mesh, active: false, timer: 0, maxTime: 8, parentEnemy: null, isCircle: isCircle });
      }
    }
    function _acquireWound(wantCircle) {
      if (!_woundPoolInited) _initWoundPool();
      for (let i = 0; i < _woundPool.length; i++) {
        if (!_woundPool[i].active && _woundPool[i].isCircle === !!wantCircle) {
          _woundPool[i].active = true;
          _woundPool[i].timer = 0;
          _woundPool[i].mesh.visible = true;
          return _woundPool[i];
        }
      }
      // Fallback: steal oldest
      for (let i = 0; i < _woundPool.length; i++) {
        if (_woundPool[i].isCircle === !!wantCircle) {
          _releaseWound(_woundPool[i]);
          _woundPool[i].active = true;
          _woundPool[i].timer = 0;
          _woundPool[i].mesh.visible = true;
          return _woundPool[i];
        }
      }
      return null;
    }
    function _releaseWound(slot) {
      var parentEnemy = slot.parentEnemy;
      slot.active = false;
      slot.mesh.visible = false;
      if (parentEnemy && Array.isArray(parentEnemy.bulletHoles)) {
        for (var i = parentEnemy.bulletHoles.length - 1; i >= 0; i--) {
          if (parentEnemy.bulletHoles[i] === slot.mesh) {
            parentEnemy.bulletHoles.splice(i, 1);
          }
        }
      }
      if (slot.mesh.parent) slot.mesh.parent.remove(slot.mesh);
      slot.parentEnemy = null;
    }
    function _updateWoundPool(dt) {
      for (let i = 0; i < _woundPool.length; i++) {
        var w = _woundPool[i];
        if (!w.active) continue;
        w.timer += dt;
        if (w.timer >= w.maxTime) { _releaseWound(w); }
      }
    }
    window._updateWoundPool = _updateWoundPool;
    window._initWoundPool = _initWoundPool;

    // ── Shared eye layout helper — returns canonical eye position/scale for a type ───────────
    // Defined once here and exposed via window so object-pool.js can use the same values
    // without duplicating the lookup logic.  Keeps eye positioning in sync everywhere.
    function getEnemyEyeLayout(type) {
      return {
        scale: (type >= 12 && type <= 14) ? 1.2 : 0.85,
        yPos:  (type >= 12 && type <= 14) ? 0.90 : 0.92,
        zPos:  (type === 10 || type === 11 || type === 19) ? 1.10 : 0.42,
        xPos:  (type >= 12 && type <= 14) ? 0.28 : 0.22,
      };
    }
    window.getEnemyEyeLayout = getEnemyEyeLayout;

    // ── Shared leg geometry — used by all legged enemy types (one geo, many instances) ──────
    // Capsule sticks oriented vertically; each leg Mesh has its own world-space transform.
    const SHARED_LEG_GEO  = new THREE.CapsuleGeometry(0.038, 0.38, 2, 4);
    const SHARED_LLEG_GEO = new THREE.CapsuleGeometry(0.025, 0.72, 2, 4); // Daddy-Longlegs long legs
    SHARED_LEG_GEO._isShared  = true;
    SHARED_LLEG_GEO._isShared = true;
    window.SHARED_LEG_GEO  = SHARED_LEG_GEO;
    window.SHARED_LLEG_GEO = SHARED_LLEG_GEO;

    // ── Shared head geometry (3-part anatomy: Base / Torso / Head) ──────────────────────────
    // One sphere used as the head for all creature-type enemies. Sized so it sits
    // naturally on top of the standard body sphere without per-enemy VRAM cost.
    const SHARED_HEAD_GEO = new THREE.SphereGeometry(0.42, 6, 6);
    SHARED_HEAD_GEO._isShared = true;
    window.SHARED_HEAD_GEO = SHARED_HEAD_GEO;

    // ── Shared guts geometry — inner-organ sphere revealed when torso takes heavy damage ─────
    const SHARED_GUTS_GEO = new THREE.SphereGeometry(0.28, 5, 4);
    SHARED_GUTS_GEO._isShared = true;
    window.SHARED_GUTS_GEO = SHARED_GUTS_GEO;

    let hardTankGeometryCache = null;

    // ── Spider Sprite System ──────────────────────────────────────────────────────────────
    // Replaces the procedural 3D sphere+legs for type-15 (Daddy Longlegs) with a
    // pixel-art billboard sprite that animates walk / rear / attack / hit / die states.
    // The physical mesh remains as a tiny transparent hitbox; all visuals come from the sprite.
    const SPIDER_SHEET_COLS = 4;
    const SPIDER_SHEET_ROWS = 6;
    // Sprite sheet paths — IMG_1155.png (walk+rear) and IMG_1149.png (attack+hit+die)
    // Both are 1024×1536 grids → 4 columns × 6 rows, each cell ≈ 256×256 px
    const SPIDER_SHEET_PATHS = ['sprite sheet/IMG_1155.png', 'sprite sheet/IMG_1149.png'];
    const SPIDER_ANIMS = {
      walk:   { sheet: 0, frames: [{c:0,r:0},{c:1,r:0},{c:2,r:0},{c:3,r:0},{c:0,r:1},{c:1,r:1},{c:2,r:1},{c:3,r:1}], fps: 8,  loop: true  },
      rear:   { sheet: 0, frames: [{c:0,r:2},{c:1,r:2},{c:2,r:2},{c:3,r:2},{c:0,r:3},{c:1,r:3},{c:2,r:3},{c:3,r:3}], fps: 10, loop: true  },
      attack: { sheet: 0, frames: [{c:0,r:4},{c:1,r:4},{c:2,r:4},{c:3,r:4},{c:0,r:5},{c:1,r:5},{c:2,r:5},{c:3,r:5}], fps: 14, loop: false },
      hit:    { sheet: 1, frames: [{c:0,r:0},{c:1,r:0},{c:2,r:0},{c:3,r:0}], fps: 16, loop: false },
      die:    { sheet: 1, frames: [{c:0,r:2},{c:1,r:2},{c:2,r:2},{c:3,r:2},{c:0,r:3},{c:1,r:3},{c:2,r:3},{c:3,r:3},{c:0,r:4},{c:1,r:4},{c:2,r:4},{c:3,r:4}], fps: 10, loop: false },
    };
    // Module-level texture cache so all spider instances share the same GPU textures
    const _spiderTexCache = {};
    // Track pending texture loads — resolve list of waiting instances
    const _spiderTexWaiters = {};

    class EnemySpiderSprite {
      constructor(parentMesh) {
        this._anim      = 'walk';
        this._frameIdx  = 0;
        this._frameTimer= 0;
        this._playing   = true;
        this._onComplete= null;
        this._textures  = [null, null];
        this._sprite    = null;
        this._loaded    = [false, false];
        this._flashTimer= 0;
        this._parent    = parentMesh;
        this._dead      = false;
        this._init();
      }

      _init() {
        const THREE = window.THREE;
        if (!THREE) return;
        const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.08, color: 0xffffff });
        this._sprite = new THREE.Sprite(mat);
        this._sprite.scale.set(2.6, 2.6, 1);
        this._sprite.position.set(0, 1.0, 0);
        this._parent.add(this._sprite);

        const loader = new THREE.TextureLoader();
        SPIDER_SHEET_PATHS.forEach((path, i) => {
          if (_spiderTexCache[path]) {
            this._textures[i] = _spiderTexCache[path];
            this._loaded[i] = true;
            if (i === 0) this._applyFrame();
            return;
          }
          if (_spiderTexWaiters[path]) {
            _spiderTexWaiters[path].push(tex => { this._textures[i] = tex; this._loaded[i] = true; if (i === 0) this._applyFrame(); });
            return;
          }
          _spiderTexWaiters[path] = [];
          loader.load(path, (tex) => {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            try { tex.colorSpace = THREE.SRGBColorSpace; } catch(_) {}
            tex.repeat.set(1 / SPIDER_SHEET_COLS, 1 / SPIDER_SHEET_ROWS);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            _spiderTexCache[path] = tex;
            this._textures[i] = tex;
            this._loaded[i] = true;
            if (i === 0) this._applyFrame();
            (_spiderTexWaiters[path] || []).forEach(cb => cb(tex));
            delete _spiderTexWaiters[path];
          }, undefined, () => {
            // Texture load failed — mark loaded so we don't retry per frame
            this._loaded[i] = true;
            (_spiderTexWaiters[path] || []).forEach(cb => cb(null));
            delete _spiderTexWaiters[path];
          });
        });
      }

      play(animName, onComplete) {
        const a = SPIDER_ANIMS[animName];
        if (!a) return;
        if (this._anim === animName && this._playing && animName !== 'hit') return;
        this._anim       = animName;
        this._frameIdx   = 0;
        this._frameTimer = 0;
        this._playing    = true;
        this._onComplete = onComplete || null;
        this._applyFrame();
      }

      flash() {
        this._flashTimer = 0.12;
        if (this._sprite && this._sprite.material) this._sprite.material.color.setHex(0xFF8888);
      }

      update(dt) {
        if (this._dead) return;
        // Hit flash fade back to white
        if (this._flashTimer > 0) {
          this._flashTimer -= dt;
          if (this._flashTimer <= 0 && this._sprite && this._sprite.material)
            this._sprite.material.color.setHex(0xffffff);
        }
        if (!this._playing) return;
        const anim = SPIDER_ANIMS[this._anim];
        if (!anim) return;
        this._frameTimer += dt;
        const fd = 1 / anim.fps;
        if (this._frameTimer >= fd) {
          this._frameTimer -= fd;
          this._frameIdx++;
          if (this._frameIdx >= anim.frames.length) {
            if (anim.loop) {
              this._frameIdx = 0;
            } else {
              this._frameIdx = anim.frames.length - 1;
              this._playing  = false;
              if (this._onComplete) { const cb = this._onComplete; this._onComplete = null; cb(); }
              return;
            }
          }
          this._applyFrame();
        }
      }

      _applyFrame() {
        const anim = SPIDER_ANIMS[this._anim];
        if (!anim || !this._sprite || !this._loaded[anim.sheet]) return;
        const tex = this._textures[anim.sheet];
        if (!tex) return;
        if (this._sprite.material.map !== tex) {
          this._sprite.material.map = tex;
          this._sprite.material.needsUpdate = true;
        }
        const frame = anim.frames[this._frameIdx];
        tex.offset.set(
          frame.c / SPIDER_SHEET_COLS,
          1 - (frame.r + 1) / SPIDER_SHEET_ROWS
        );
      }

      playDeath(onDone) {
        this._dead = false;
        this.play('die', () => {
          this._dead = true;
          if (this._sprite) this._sprite.visible = false;
          if (onDone) onDone();
        });
      }

      dispose() {
        if (this._sprite) {
          if (this._parent) this._parent.remove(this._sprite);
          if (this._sprite.material) {
            // Don't dispose shared cached textures
            this._sprite.material.dispose();
          }
          this._sprite = null;
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────────────────

    // Water particle pool for player physics effects
    const waterParticlePool = [];
    const MAX_WATER_PARTICLES = 20;
    let waterParticleGeom = null;
    let waterParticleMat = null;

    // Pre-allocated constants for enemy update() — avoids per-frame Set/allocation
    const _ENEMY_FLYING_TYPES = new Set([5, 11, 14, 16, 17, 19, 20]);
    const _TREE_COLL_R = 1.0;
    const _PROP_COLL_R = 0.7;
    const _MELEE_STOP_DIST      = 1.5; // Enemies stop at this distance to avoid overlap/jitter
    // Reptilian Shifter visibility thresholds
    const _REPTILIAN_VISIBLE_DIST = 3;   // distance at which shifter becomes fully visible
    const _REPTILIAN_CAMO_OPACITY = 0.2; // default camo opacity (80% invisible)
    const _FENCE_COLL_R = 0.6;
    // Shared blood stain geometry (avoids per-hit CircleGeometry creation)
    let _sharedBloodStainGeo = null;
    // Shared blood drip geometry (avoids per-hit SphereGeometry creation)
    let _sharedBloodDripGeo = null;
    // Module-scoped temp vector for takeDamage() blood/hit direction — avoids per-hit allocation
    const _tmpHitDir = new THREE.Vector3();
    // Module-scoped temp vector for head look-at target — avoids per-frame allocation in update()
    const _tmpHeadTarget = new THREE.Vector3();
    // Additional pre-allocated scratch vectors for death-animation hot paths
    const _tmpExitDir  = new THREE.Vector3(); // dieStandard exitDir / bone-break exits
    const _tmpCrawlDir = new THREE.Vector3(); // CRAWL TRAIL direction
    const _tmpRollDir  = new THREE.Vector3(); // BARREL ROLL direction
    const _tmpNeckDir  = new THREE.Vector3(); // DECAPITATION neck spray direction
    const _tmpMistDir  = new THREE.Vector3(); // MIST death particle direction
    const _tmpSlashDir = new THREE.Vector3(); // slash attack direction
    const _tmpHeadVel  = new THREE.Vector3(); // head-roll velocity on decapitation

    // ── Screen Blood Splatter ─────────────────────────────────────────────────────
    // Triggered when a point-blank meat chunk reaches camera proximity.
    // Injects temporary blob elements into #blood-splatter-overlay and removes them
    // after the CSS animation finishes.
    window._triggerBloodSplatter = (function() {
      let _lastSplatter = 0;
      return function triggerBloodSplatter() {
        const _now = Date.now();
        if (_now - _lastSplatter < 1800) return; // debounce 1.8 s
        _lastSplatter = _now;
        const _el = document.getElementById('blood-splatter-overlay');
        if (!_el) return;
        // Clear any leftover blobs from a previous splatter
        _el.innerHTML = '';
        // Spawn 6-12 irregular blobs scattered across the top half of the screen
        const _count = 6 + Math.floor(Math.random() * 7);
        for (let _i = 0; _i < _count; _i++) {
          const _blob = document.createElement('div');
          _blob.className = 'bso-blob';
          const _w = 24 + Math.random() * 80;  // px width
          const _h = _w * (0.55 + Math.random() * 0.9);
          const _left = Math.random() * 92;     // % from left
          const _top  = Math.random() * 55;     // % from top — top half
          const _dur  = (2.2 + Math.random() * 1.4).toFixed(2);
          const _del  = (Math.random() * 0.5).toFixed(2);
          const _travel = Math.round(60 + Math.random() * 140);
          _blob.style.cssText =
            `width:${_w}px;height:${_h}px;` +
            `left:${_left}%;top:${_top}%;` +
            `--drip-dur:${_dur}s;--drip-delay:${_del}s;--drip-travel:${_travel}px;`;
          _el.appendChild(_blob);
        }
        _el.classList.add('active');
        // Remove class after animation ends so it can be re-triggered
        setTimeout(() => {
          _el.classList.remove('active');
          _el.innerHTML = '';
        }, 3500);
      };
    }());

    function spawnWaterParticle(pos) {
      if (!scene) return;
      let p = waterParticlePool.find(x => !x.active);
      if (!p) {
        if (waterParticlePool.length >= MAX_WATER_PARTICLES) return;
        if (!waterParticleGeom) waterParticleGeom = new THREE.SphereGeometry(0.12, 4, 4);
        if (!waterParticleMat) waterParticleMat = new THREE.MeshBasicMaterial({ color: 0x44aabb, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(waterParticleGeom, waterParticleMat.clone());
        p = { mesh, active: false, life: 0, vx: 0, vy: 0, vz: 0 };
        scene.add(p.mesh);
        waterParticlePool.push(p);
      }
      p.active = true;
      p.life = 0.5;
      p.mesh.position.set(pos.x + (Math.random()-0.5)*0.5, pos.y + Math.random()*0.5, pos.z + (Math.random()-0.5)*0.5);
      p.mesh.scale.setScalar(1);
      p.mesh.material.opacity = 0.7;
      p.vx = (Math.random()-0.5)*4;
      p.vy = Math.random()*3+1;
      p.vz = (Math.random()-0.5)*4;
      p.mesh.visible = true;
    }

    function updateWaterParticles(delta) {
      for (const p of waterParticlePool) {
        if (!p.active) continue;
        p.life -= delta;
        if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        p.vy -= 9.8 * delta;
        const lifeFrac = p.life / 0.5;
        p.mesh.scale.setScalar(lifeFrac * 0.8);
        p.mesh.material.opacity = lifeFrac * 0.7;
      }
    }
    function getHardTankGeometry() {
      if (!hardTankGeometryCache) {
        const geometry = new THREE.SphereGeometry(0.6, 8, 8);
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);
          const noiseX = 1 + (Math.random() - 0.5) * 0.3;
          const noiseY = 1 + (Math.random() - 0.5) * 0.3;
          const noiseZ = 1 + (Math.random() - 0.5) * 0.3;
          positions.setX(i, x * noiseX);
          positions.setY(i, y * noiseY);
          positions.setZ(i, z * noiseZ);
        }
        geometry.computeVertexNormals();
        hardTankGeometryCache = geometry;
      }
      return hardTankGeometryCache;
    }

    // Drone Turret class - New weapon replacing Lightning
    class DroneTurret {
      constructor(player) {
        this.player = player;
        this.offset = new THREE.Vector3(2, 1.5, 0); // Initial hover position relative to player
        this.wobblePhase = Math.random() * Math.PI * 2; // Random starting phase
        
        // Create drone body - small mechanical unit
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
        const bodyMat = new THREE.MeshToonMaterial({ 
          color: 0x808080, // Gray metallic
          emissive: 0x404040,
          emissiveIntensity: 0.3
        });
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        scene.add(this.mesh);
        
        // Add glowing core
        const coreGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const coreMat = new THREE.MeshBasicMaterial({ 
          color: 0x00FFFF, // Cyan glow
          transparent: true,
          opacity: 0.8
        });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        this.core.position.y = 0;
        this.mesh.add(this.core);
        
        // Add propellers/rotors on top
        const propGeo = new THREE.BoxGeometry(0.6, 0.05, 0.1);
        const propMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        this.propeller1 = new THREE.Mesh(propGeo, propMat);
        this.propeller1.position.y = 0.2;
        this.mesh.add(this.propeller1);
        
        this.propeller2 = new THREE.Mesh(propGeo, propMat);
        this.propeller2.position.y = 0.2;
        this.propeller2.rotation.y = Math.PI / 2;
        this.mesh.add(this.propeller2);
        
        // Add small barrel/gun
        const barrelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6);
        const barrelMat = new THREE.MeshToonMaterial({ color: 0x222222 });
        this.barrel = new THREE.Mesh(barrelGeo, barrelMat);
        this.barrel.rotation.x = Math.PI / 2;
        this.barrel.position.z = 0.3;
        this.barrel.position.y = -0.1;
        this.mesh.add(this.barrel);
        
        this.active = true;
        this.shootTimer = 0;
      }
      
      update(dt) {
        if (!this.active) {
          this.mesh.visible = false;
          return;
        }
        
        this.mesh.visible = true;
        
        // Hover near player with smooth bobbing motion
        this.wobblePhase += dt * 3;
        const bobHeight = Math.sin(this.wobblePhase) * 0.2;
        
        // Target position relative to player
        const targetX = this.player.mesh.position.x + this.offset.x;
        const targetY = this.player.mesh.position.y + this.offset.y + bobHeight;
        const targetZ = this.player.mesh.position.z + this.offset.z;
        
        // Smooth follow with lerp (frame-rate independent)
        const lerpSpeed = 0.1 / dt; // Normalize for frame rate
        const lerpFactor = Math.min(1, dt * 6); // Cap at 1.0, smooth at 60fps
        this.mesh.position.x += (targetX - this.mesh.position.x) * lerpFactor;
        this.mesh.position.y += (targetY - this.mesh.position.y) * lerpFactor;
        this.mesh.position.z += (targetZ - this.mesh.position.z) * lerpFactor;
        
        // Rotate propellers (frame-rate independent)
        this.propeller1.rotation.y += 0.3 * dt * 60; // Normalized for 60fps
        this.propeller2.rotation.y += 0.3 * dt * 60;
        
        // Pulse core
        this.core.material.opacity = 0.6 + Math.sin(gameTime * 5) * 0.2;
        
        // Find and track nearest enemy (squared distance avoids sqrt)
        let nearestEnemy = null;
        let minDistSq = weapons.droneTurret.range * weapons.droneTurret.range;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const distSq = this.mesh.position.distanceToSquared(e.mesh.position);
          if (distSq < minDistSq) {
            minDistSq = distSq;
            nearestEnemy = e;
          }
        }
        
        // Aim barrel at target
        if (nearestEnemy) {
          const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
          const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
          const angle = Math.atan2(dx, dz);
          this.mesh.rotation.y = angle;
        }
      }
      
      destroy() {
        if (this.mesh) {
          scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          if (this.core) {
            this.core.geometry.dispose();
            this.core.material.dispose();
          }
          if (this.propeller1) {
            this.propeller1.geometry.dispose();
            this.propeller1.material.dispose();
          }
          if (this.propeller2) {
            this.propeller2.geometry.dispose();
            this.propeller2.material.dispose();
          }
          if (this.barrel) {
            this.barrel.geometry.dispose();
            this.barrel.material.dispose();
          }
        }
      }
    }

    class Enemy {
      constructor(type, x, z, playerLevel = 1) {
        this.type = type; // 0: Tank, 1: Fast, 2: Balanced, 3: Slowing, 4: Ranged, 5: Flying, 6: Hard Tank, 7: Hard Fast, 8: Hard Balanced, 9: Elite, 10: MiniBoss, 11: FlyingBoss, 12: BugRanged, 13: BugSlow, 14: BugFast

        // Enemy scaling based on player level - NOT SPEED, just HP and DAMAGE
        // Progressive difficulty: 20% per level to force use of all upgrades
        const levelScaling = 1 + (playerLevel - 1) * 0.20;

        // ── BODY MESH — type-specific geometry & shared-per-color material ──────────
        // Geometry is cached per type (getEnemyGeo).  Material is retrieved from
        // SHARED_MAT_CACHE (same color → same material object) to avoid per-enemy VRAM.
        // Types whose material opacity/emissive must change per-instance get a clone.
        const _bodyGeo = getEnemyGeo(type);
        const _colorHex = _ENEMY_COLORS[type] !== undefined ? _ENEMY_COLORS[type] : DEFAULT_ENEMY_COLOR;

        // CRITICAL FIX: Store the enemy's actual color for instanced rendering
        // Instanced enemies (types 0,1,2) use shared white materials, but need their
        // real color stored separately so the instanced renderer can apply per-instance
        // color tinting. Without this, all instanced enemies render as white/green.
        this._baseColorHex = _colorHex;

        // Types that animate their own material properties each frame need a per-instance copy
        const _needsUniqueMat = (type === 18 || type === 19 || type === 20);
        const _baseMat = getOrCreateMat(_colorHex,
          (type === 18) ? { transparent: true, opacity: _REPTILIAN_CAMO_OPACITY } : null
        );
        const _bodyMat = _needsUniqueMat ? _baseMat.clone() : _baseMat;
        // MiniBoss/FlyingBoss have emissive glow — give them a per-instance material so the
        // pulsing glow animation in update() doesn't affect all enemies of the same color.
        if (type === 10 || type === 11) {
          const _bossMat = new THREE.MeshPhongMaterial({
            color: _colorHex,
            emissive: new THREE.Color(_colorHex).multiplyScalar(0.7),
            emissiveIntensity: 0.3,
            shininess: 90  // Higher shininess for bosses to make them stand out
          });
          this.mesh = new THREE.Mesh(_bodyGeo, _bossMat);
        } else {
          this.mesh = new THREE.Mesh(_bodyGeo, _bodyMat);
        }
        // Save the original material so the pool can restore it after recycling
        // (damage clones the material; die() disposes the clone — restoring prevents black/invisible enemies)
        this.defaultMaterial = this.mesh.material;

        const yPos = (type === 5 || type === 14 || type === 16 || type === 17) ? 2
                   : (type === 11 ? 5 : (type === 19 ? 4 : (type === 20 ? 2 : 0.5)));
        this.mesh.position.set(x, yPos, z);
        // Face toward the player immediately on spawn so the enemy never appears backwards.
        // Falls back to facing the world origin if player reference is unavailable.
        const _spawnPx = (window.player && window.player.mesh) ? window.player.mesh.position.x : 0;
        const _spawnPz = (window.player && window.player.mesh) ? window.player.mesh.position.z : 0;
        const _spawnDx = _spawnPx - x;
        const _spawnDz = _spawnPz - z;
        if (_spawnDx * _spawnDx + _spawnDz * _spawnDz > 0.01) {
          this.mesh.rotation.y = Math.atan2(_spawnDx, _spawnDz);
        }
        if (type === 11) this.mesh.scale.set(1.8, 1.8, 1.8);
        const _isBoss = (type === 10 || type === 11 || type === 19);
        this.mesh.castShadow = _isBoss;
        this.mesh.receiveShadow = _isBoss;

        // ── INSTANCING: Types 0, 1, 2 use instanced rendering for performance ────────
        // Check if the instanced renderer is available and active. If so, mark this
        // enemy for instancing (mesh won't be added to scene, rendered via InstancedMesh)
        // and hide its individual mesh. Otherwise fall back to regular scene rendering.
        const _shouldInstance = ENEMY_INSTANCING_ENABLED
          && (type === 0 || type === 1 || type === 2)
          && window._instancedRenderer && window._instancedRenderer.active;

        if (_shouldInstance) {
          this._usesInstancing = true;
          this.mesh.visible = false; // Hidden — rendered via InstancedMesh batch
          // Don't add to scene — instanced renderer handles it
        } else {
          this._usesInstancing = false;
          scene.add(this.mesh);
        }

        // ── HEAD — proper sphere sitting on top of the torso body ───────────────────
        // Uses SHARED_HEAD_GEO (one geometry for all enemies) + a slightly lighter
        // variant of the body colour from the shared material cache → zero extra VRAM.
        // Position y=0.95 overlaps the top of the body sphere (radius≈1) slightly so
        // the head reads as a natural continuation of the silhouette, not a floating ball.
        const _headR = Math.min(255, ((_colorHex >> 16) & 0xFF) + 45);
        const _headG = Math.min(255, ((_colorHex >>  8) & 0xFF) + 45);
        const _headB = Math.min(255, ( _colorHex        & 0xFF) + 45);
        const _headColorHex = (_headR << 16) | (_headG << 8) | _headB;
        const _headMat = getOrCreateMat(_headColorHex);
        this.headMesh = new THREE.Mesh(SHARED_HEAD_GEO, _headMat);
        this.headMesh.position.y = 0.95;
        this.mesh.add(this.headMesh);

        // ── EYES — placed on the forward face of the head sphere ────────────────────
        // Each eye is a child of this.mesh (NOT headMesh) so world-space positioning
        // is unaffected by the head's lookAt() rotation.  Positions are chosen so the
        // eyes sit just in front of the head sphere's surface at head-centre height.
        this.leftEye  = null;
        this.rightEye = null;
        if (ENEMY_TYPES_WITH_EYES.has(type)) {
          const _eyeL = new THREE.Mesh(SHARED_EYE_GEO, SHARED_EYE_MAT);
          const _eyeR = new THREE.Mesh(SHARED_EYE_GEO, SHARED_EYE_MAT);
          const _el = getEnemyEyeLayout(type);
          _eyeL.scale.setScalar(_el.scale);
          _eyeR.scale.setScalar(_el.scale);
          _eyeL.position.set(-_el.xPos, _el.yPos, _el.zPos);
          _eyeR.position.set( _el.xPos, _el.yPos, _el.zPos);
          // Add black pupils as child meshes so they inherit lookAt() tracking
          const _pupilL = new THREE.Mesh(SHARED_PUPIL_GEO, SHARED_PUPIL_MAT);
          const _pupilR = new THREE.Mesh(SHARED_PUPIL_GEO, SHARED_PUPIL_MAT);
          _pupilL.position.set(0, 0, 0.06);
          _pupilR.position.set(0, 0, 0.06);
          _eyeL.add(_pupilL);
          _eyeR.add(_pupilR);
          this.mesh.add(_eyeL);
          this.mesh.add(_eyeR);
          this.leftEye  = _eyeL;
          this.rightEye = _eyeR;
        }

        // ── GLITCH MESHES for Source Glitch (type 20) ────────────────────────────────
        this._glitchMeshes = null;
        if (type === 20) {
          this._glitchMeshes = [];
          for (let _gi = 0; _gi < 4; _gi++) {
            const _gmGeo = (_gi % 2 === 0) ? new THREE.BoxGeometry(0.4, 0.4, 0.4) : new THREE.OctahedronGeometry(0.3, 0);
            const _gmMat = new THREE.MeshBasicMaterial({ color: 0xFF00FF, transparent: true, opacity: 0.8 });
            const _gm = new THREE.Mesh(_gmGeo, _gmMat);
            _gm.position.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2);
            this.mesh.add(_gm);
            this._glitchMeshes.push(_gm);
          }
        }

        // ── BLOB SHADOW for all non-instanced enemies (fake shadow, no shadow maps) ──
        // Flying enemies get a standard circle; grounded enemies get a slightly
        // smaller disc (opacity ~0.4) that stays flat on the ground (Y = 0.05).
        this.groundShadow = null;
        if (!this._usesInstancing) {
          const _shadowRadius = ENEMY_TYPES_FLYING.has(type) ? 0.5 : 0.4;
          const _shadowOpacity = ENEMY_TYPES_FLYING.has(type) ? 0.2 : 0.4;
          const _shadowGeo = new THREE.CircleGeometry(_shadowRadius, 8);
          const _shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: _shadowOpacity, depthWrite: false });
          _shadowMat._baseOpacity = _shadowOpacity; // stored so the update loop can scale it
          this.groundShadow = new THREE.Mesh(_shadowGeo, _shadowMat);
          this.groundShadow.rotation.x = -Math.PI / 2;
          this.groundShadow.position.set(x, 0.05, z);
          scene.add(this.groundShadow);
        }

        // ── SPIDER SPRITE (type 15) — replace procedural mesh with a pixel-art billboard ───
        // The SphereGeometry mesh becomes a tiny transparent hitbox; all visuals come from
        // the EnemySpiderSprite billboard that auto-animates walk / rear / attack / hit / die.
        this._spiderSprite = null;
        if (type === 15 && !this._usesInstancing) {
          // Hide the 3D sphere (use a per-instance transparent material so shared cache is untouched)
          const _spiderHitboxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
          _spiderHitboxMat._isSpiderHitbox = true;
          this.mesh.material = _spiderHitboxMat;
          // Update defaultMaterial so the pool restores the transparent hitbox mat (not the sphere mat)
          this.defaultMaterial = this.mesh.material;
          // Also hide the head mesh
          if (this.headMesh) this.headMesh.visible = false;
          // Create the sprite
          this._spiderSprite = new EnemySpiderSprite(this.mesh);
        }

        // ── LEGS — procedural stick-legs for creature/bug types ──────────────────────
        // Leg meshes share SHARED_LEG_GEO (one geometry, many instances with unique transforms).
        // Each leg's material is retrieved from the shared color cache (no extra VRAM per enemy).
        // Type 15 uses the sprite system above instead of procedural legs.
        this._legs = null;
        const _LEGGED_TYPES = new Set([0, 1, 2, 3, 12, 13, 14]);
        if (_LEGGED_TYPES.has(type) && !this._usesInstancing) {
          const _legCount = (type >= 12 && type <= 14) ? 8 : 6;
          const _legGeo   = SHARED_LEG_GEO;
          // Slightly darker shade for legs — per-channel darkening preserves hue
          const _legR = Math.max(0, ((_colorHex >> 16) & 0xFF) - 40);
          const _legG = Math.max(0, ((_colorHex >> 8) & 0xFF) - 40);
          const _legB = Math.max(0, (_colorHex & 0xFF) - 40);
          const _legColorHex = (_legR << 16) | (_legG << 8) | _legB;
          const _legMat = getOrCreateMat(_legColorHex);
          this._legs = [];
          const _legReach   = (type >= 12 && type <= 14) ? 0.52 : 0.48;
          const _legDropY   = -0.22;
          const _legTiltAmt = 0.33;
          for (let _li = 0; _li < _legCount; _li++) {
            const _angle = (_li / _legCount) * Math.PI * 2;
            const _leg = new THREE.Mesh(_legGeo, _legMat);
            _leg.position.set(
              Math.cos(_angle) * _legReach,
              _legDropY,
              Math.sin(_angle) * _legReach
            );
            // Tilt outward so legs splay naturally away from the body centre
            _leg.rotation.z = Math.cos(_angle) * _legTiltAmt;
            _leg.rotation.x = Math.sin(_angle) * _legTiltAmt;
            this.mesh.add(_leg);
            this._legs.push(_leg);
          }
        }

        // ── TENTACLES — jellyfish type 22 gets flowing tentacles ────────────────────
        this._tentacles = null;
        if (type === 22 && !this._usesInstancing) {
          const _tentacleCount = 8;
          const _tentacleGeo = new THREE.CylinderGeometry(0.04, 0.02, 1.2, 4);
          // Tentacles use a slightly darker and more translucent yellow
          const _tentR = Math.max(0, ((_colorHex >> 16) & 0xFF) - 30);
          const _tentG = Math.max(0, ((_colorHex >> 8) & 0xFF) - 30);
          const _tentB = Math.max(0, (_colorHex & 0xFF) - 30);
          const _tentColorHex = (_tentR << 16) | (_tentG << 8) | _tentB;
          const _tentMat = new THREE.MeshPhongMaterial({
            color: _tentColorHex,
            transparent: true,
            opacity: 0.7,
            shininess: 40
          });
          this._tentacles = [];
          const _tentRadius = 0.5;
          for (let _ti = 0; _ti < _tentacleCount; _ti++) {
            const _angle = (_ti / _tentacleCount) * Math.PI * 2;
            const _tent = new THREE.Mesh(_tentacleGeo, _tentMat);
            _tent.position.set(
              Math.cos(_angle) * _tentRadius,
              -0.6, // Hang below the bell
              Math.sin(_angle) * _tentRadius
            );
            // Rotation to make tentacles hang downward
            _tent.rotation.z = Math.cos(_angle) * 0.2;
            _tent.rotation.x = Math.sin(_angle) * 0.2;
            // Store base angle for wave animation
            _tent._baseAngle = _angle;
            _tent._wavePhase = Math.random() * Math.PI * 2; // Random starting phase
            this.mesh.add(_tent);
            this._tentacles.push(_tent);
          }
        }

        // ── ANATOMY GROUPS — organic locomotion squish & head-bob ───────────────────
        // For non-boss, non-instanced enemies:
        //   baseGroup  → this.mesh  (squish/scale along locomotion rhythm)
        //   torsoGroup → this.mesh  (forward-lean rotation.x)
        //   headGroup  → headMesh   (bob up/down + player look-at)
        // These use the SAME Three.js objects as the main mesh to avoid allocating extra
        // geometry/material — they just drive the existing mesh's transform properties.
        this.baseGroup        = null;
        this.torsoGroup       = null;
        this.headGroup        = null;
        this._gutsContainer   = null;
        this._gutsExposed     = false;
        this._annunakiLaserMesh = null;

        // Sentinel mesh for die() flesh-tumbling effect — tiny invisible disc
        // Its non-null value tells die() to spawn a tumbling meat chunk on death.
        // The disc has its own unique geo+mat so die() can safely dispose them.
        this._anatJawMesh  = null;
        this._anatHeadMesh = null;
        if (!this._usesInstancing && type !== 10 && type !== 11 && type !== 19 && type !== 20) {
          const _sentGeo = new THREE.CircleGeometry(0.22, 5);
          const _sentMat = new THREE.MeshBasicMaterial({ color: 0x3B0000 });
          this._anatBaseMesh = new THREE.Mesh(_sentGeo, _sentMat);
          this._anatBaseMesh.visible = false;
          this._anatBaseMesh.rotation.x = -Math.PI / 2;
          this._anatBaseMesh.position.y = 0.01;
          this.mesh.add(this._anatBaseMesh);

          // ── GUTS CONTAINER — inner-organ sphere revealed when torso takes heavy damage ─
          // Uses SHARED_GUTS_GEO + shared dark-red transparent material → no per-enemy VRAM.
          // Starts hidden; shown by takeDamage() once torso HP drops below 50%.
          const _gutsMat = getOrCreateMat(0x8B0000, { transparent: true, opacity: 0.88 });
          this._gutsContainer = new THREE.Mesh(SHARED_GUTS_GEO, _gutsMat);
          this._gutsContainer.position.y = 0.22;
          this._gutsContainer.visible = false;
          this.mesh.add(this._gutsContainer);
        } else {
          this._anatBaseMesh = null;
        }

        // Assign anatomy locomotion groups (non-boss, non-instanced only)
        // Boss types (10, 11) retain their own special scale pulsing logic.
        if (!this._usesInstancing && type !== 10 && type !== 11) {
          this.baseGroup  = this.mesh;
          this.torsoGroup = this.mesh;
          this.headGroup  = this.headMesh;
          this._headGroupBaseY = this.headMesh.position.y; // 0.95
        }

        // ── TYPE-SPECIFIC AI STATE (no new meshes — pure numeric state) ─────────────
        if (type === 15) {
          // Daddy Longlegs rearing-attack cycle
          this._rearingPhase = 0;
          this._rearingTimer = 0;
        }
        if (type === 19) {
          // Annunaki Orb — teleport and laser AI state
          this._annunakiTeleportTimer   = 0;
          this._annunakiTeleportCooldown = 4.0;
          this._annunakiLaserTimer      = 0;
          this._annunakiLaserActive     = false;
          this._annunakiWarning         = false;
        }
        if (type === 20) {
          // Source Glitch — rapid teleport AI
          this._glitchTeleportTimer    = 0;
          this._glitchTeleportCooldown = 0.7 + Math.random() * 0.8;
        }

        // Stats based on type — delegated to GameEnemies.getEnemyBaseStats
        Object.assign(this, getEnemyBaseStats(type, levelScaling, GAME_CONFIG.enemySpeedBase, playerLevel));
        this.isDead = false;
        this.active = true; // Marks enemy as active for hit detection; cleared in die()
        this.isDamaged = false; // Track if enemy has been visually damaged
        this.hitRadius = 0.75; // Radius used for projectile hit detection
        this.pulsePhase = Math.random() * Math.PI;
        this.wobbleOffset = Math.random() * 100;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000; // 1 second cooldown
        // Simple movement — no AI state machine (removed to fix FPS spikes and erratic behavior)
        this._aiTimer = 0; // retained to avoid breaking any pool-recycling references

        // Blink timer vars for enemy eye animation (fire only when leftEye is set)
        this.blinkTimer = 0;
        this.blinkDuration = 0.08;
        this.nextBlinkTime = 1.5 + Math.random() * 3.5;
        this.isBlinking = false;

        // Anatomy health pools — each body part has its own HP and can be dismembered
        this.anatomy = {
          head:  { hp: 100, attached: true },
          torso: { hp: 100, attached: true },
          base:  { hp: 100, attached: true }
        };
        // Lerped look-target for organic head tracking delay (avoids per-frame allocation)
        this._lerpedHeadTarget = new THREE.Vector3();
        this._lerpedHeadTargetInit = false;
      }

      update(dt, playerPos) {
        if (this.isDead) return;

        // Shotgun slide physics — enemy knocked back by double barrel glides on ground
        if (this._shotgunSlide) {
          const sl = this._shotgunSlide;
          sl.frame++;
          const friction = 0.9;
          sl.vx *= friction;
          sl.vz *= friction;
          this.mesh.position.x += sl.vx;
          this.mesh.position.z += sl.vz;
          // Leave blood smear trail on ground while sliding
          if (sl.frame % 2 === 0) {
            if (window.BloodSimulatorV21) {
              window.BloodSimulatorV21.rawBurst(this.mesh.position.x, 0.1, this.mesh.position.z, 2, { spreadXZ: 0.2, spreadY: 0.1 });
            } else if (window.BloodSystem) {
              window.BloodSystem.emitDragTrail(this.mesh.position, { x: sl.vx, y: 0, z: sl.vz }, 6);
            }
          }
          if (sl.frame % 3 === 0) {
            spawnBloodDecal(this.mesh.position);
          }

          // ── Knockback Domino Effect ──────────────────────────────────────────────────
          // When a sliding enemy collides with another, transfer kinetic energy — the
          // secondary enemy takes minor damage and receives a small secondary knockback.
          const slideSpeed = Math.sqrt(sl.vx * sl.vx + sl.vz * sl.vz);
          if (slideSpeed > 0.05 && sl.frame % 2 === 0) {
            // Energy transfer fraction and damage multiplier for the domino chain
            const DOMINO_RADIUS           = 1.2; // collision detection radius (world units)
            const DOMINO_TRANSFER_FACTOR  = 0.4; // 40 % of kinetic energy passed to secondary
            const DOMINO_DMG_MULTIPLIER   = 8;   // damage = slideSpeed × this multiplier
            const candidates = window._enemySpatialHash
              ? window._enemySpatialHash.query(this.mesh.position.x, this.mesh.position.z, DOMINO_RADIUS)
              : (typeof enemies !== 'undefined' ? enemies : []);
            for (let _di = 0; _di < candidates.length; _di++) {
              const other = candidates[_di];
              if (other === this || other.isDead || !other.active || other._shotgunSlide) continue;
              const odx = other.mesh.position.x - this.mesh.position.x;
              const odz = other.mesh.position.z - this.mesh.position.z;
              const odistSq = odx * odx + odz * odz;
              if (odistSq < DOMINO_RADIUS * DOMINO_RADIUS) {
                // Transfer kinetic energy as secondary knockback
                other._shotgunSlide = {
                  vx: sl.vx * DOMINO_TRANSFER_FACTOR,
                  vz: sl.vz * DOMINO_TRANSFER_FACTOR,
                  frames: 8,
                  frame: 0
                };
                // Minor collision damage (scales with slide speed)
                const dominoDmg = Math.max(1, Math.floor(slideSpeed * DOMINO_DMG_MULTIPLIER));
                other.takeDamage(dominoDmg, false, 'knockback');
                // Absorb some momentum from the primary slider
                sl.vx *= (1 - DOMINO_TRANSFER_FACTOR * 0.5);
                sl.vz *= (1 - DOMINO_TRANSFER_FACTOR * 0.5);
                if (spawnParticles) spawnParticles(other.mesh.position, 0xFFCC44, 5);
              }
            }
          }
          // ────────────────────────────────────────────────────────────────────────────

          if (sl.frame >= sl.frames || (Math.abs(sl.vx) < 0.01 && Math.abs(sl.vz) < 0.01)) {
            this._shotgunSlide = null;
          }
          return; // Skip normal movement while sliding
        }

        // Windmill Quest: Attack windmill instead of player
        let targetPos = playerPos;
        if (windmillQuest.active && windmillQuest.windmill) {
          targetPos = windmillQuest.windmill.position;
        }

        // Move towards target
        const dx = targetPos.x - this.mesh.position.x;
        const dz = targetPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        // AI decision timer
        this._aiTimer += dt;

        // Ranged enemy firing logic (standalone — movement handled in unified vx/vz block below)
        if (this.type === 4 && dist < this.attackRange) {
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            this.fireProjectile(targetPos);
            this.lastAttackTime = now;
          }
        }
        if (this.type === 12 && dist < this.attackRange) {
          const now = Date.now();
          if (now - this.lastAttackTime > 1800) {
            this.fireProjectile(targetPos);
            this.lastAttackTime = now;
          }
        }
        if (this.isFlyingBoss && dist < this.attackRange) {
          const now = Date.now();
          if (now - this.lastAttackTime > 2000) {
            this.fireProjectile(targetPos);
            this.lastAttackTime = now;
          }
          // Flying Boss orbit uses absolute positioning — special case
          const orbitSpeed = 0.72 * Math.min(dt, 0.05);
          const angle = Math.atan2(this.mesh.position.z - targetPos.z, this.mesh.position.x - targetPos.x);
          const newAngle = angle + orbitSpeed;
          const orbitR = this.attackRange * (0.6 + Math.sin(gameTime * 0.5) * 0.2);
          this.mesh.position.x = targetPos.x + Math.cos(newAngle) * orbitR;
          this.mesh.position.z = targetPos.z + Math.sin(newAngle) * orbitR;
          // Smooth orbit facing (same shortest-arc lerp as normal enemies)
          this._targetRotY = Math.atan2(dx, dz);
          let _orbitDelta = this._targetRotY - this.mesh.rotation.y;
          if (_orbitDelta > Math.PI) _orbitDelta -= Math.PI * 2;
          if (_orbitDelta < -Math.PI) _orbitDelta += Math.PI * 2;
          this.mesh.rotation.y += _orbitDelta * Math.min(1.0, dt * 10);
        }

        if (!(this.isFlyingBoss && dist < this.attackRange) && dist > 0.5) {
          // Check if slow/freeze effect expired
          const nowMs = Date.now();
          if (this.slowedUntil && this.slowedUntil < nowMs) {
            this.speed = this.originalSpeed || this.speed;
            this.slowedUntil = null;
          }
          // Handle freeze expiry: thaw enemy, restore color and speed
          if (this.isFrozen && this.frozenUntil < nowMs) {
            this.isFrozen = false;
            this._freezeProgress = 0;
            this.speed = this.originalSpeed || this.speed;
            if (this.mesh && this.mesh.material && this._originalColor) {
              this.mesh.material.color.copy(this._originalColor);
              if (this.mesh.material.emissive) {
                this.mesh.material.emissive.setHex(0x000000);
                this.mesh.material.emissiveIntensity = 0;
              }
              this.mesh.material.needsUpdate = true;
            }
            // Remove ice crack overlays on thaw
            if (this._iceCracks && this._iceCracks.length > 0) {
              for (const crack of this._iceCracks) {
                this.mesh.remove(crack);
                crack.geometry.dispose();
                crack.material.dispose();
              }
              this._iceCracks = [];
            }
            // Shatter ice: spawn ice chips flying outward
            spawnParticles(this.mesh.position, 0xAEEEFF, 6);
            spawnParticles(this.mesh.position, 0xFFFFFF, 4);
            // Ice crack particles + water pool on ground
            if (window.BloodSimulatorV21) {
              window.BloodSimulatorV21.rawBurst(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z, 30, { color: 0xAEEEFF, spreadXZ: 0.6, spreadY: 0.4, viscosity: 0.95 });
            } else if (window.BloodSystem) {
              window.BloodSystem.emitBurst(this.mesh.position, 30, { spreadXZ: 0.6, spreadY: 0.4, color1: 0xAEEEFF, color2: 0xFFFFFF, minSize: 0.05, maxSize: 0.14 });
            }
            // Brief shaking struggle: enemy wiggles before breaking free
            let shakeCount = 0;
            const origX = this.mesh.position.x;
            const origZ = this.mesh.position.z;
            // Store interval ID on instance so die() can cancel it to prevent a
            // leaked interval firing against a pooled/recycled enemy in the next run.
            if (this._shakeInterval) clearInterval(this._shakeInterval);
            this._shakeInterval = setInterval(() => {
              shakeCount++;
              if (!this.mesh || this.isDead) { clearInterval(this._shakeInterval); this._shakeInterval = null; return; }
              if (this.mesh) {
                this.mesh.position.x = origX + (Math.random() - 0.5) * 0.12;
                this.mesh.position.z = origZ + (Math.random() - 0.5) * 0.12;
              }
              if (shakeCount >= 8) {
                clearInterval(this._shakeInterval);
                this._shakeInterval = null;
                if (this.mesh) { this.mesh.position.x = origX; this.mesh.position.z = origZ; }
              }
            }, 40);
          }
          
          // Clear expired lightning spasm freeze
          if (this._lightningFreezeUntil && nowMs >= this._lightningFreezeUntil) {
            this._lightningFreezeUntil = null;
          }

          // Frozen enemies or lightning-spasmed enemies stop moving
          if (this.isFrozen || (this._lightningFreezeUntil && nowMs < this._lightningFreezeUntil)) {
            // Gradual freeze visual: lerp from original → ice blue based on freeze progress
            if (this.mesh && this.mesh.material && this._originalColor && this.frozenUntil) {
              // Safety: clone shared material if not already per-instance
              if (this.mesh.material._isShared) {
                this.mesh.material = this.mesh.material.clone();
                this.mesh.material._isShared = false;
              }
              const totalFreezeDur = this._freezeDuration || 2500;
              const elapsed = Math.max(0, nowMs - (this.frozenUntil - totalFreezeDur));
              const freezeT = Math.min(1, elapsed / 600); // 600ms to reach full ice
              if (!Enemy._iceColor) Enemy._iceColor = new THREE.Color(0xB0E8FF);
              this.mesh.material.color.copy(this._originalColor).lerp(Enemy._iceColor, freezeT);
              this.mesh.material.emissiveIntensity = 0.3 + Math.sin(gameTime * 8) * 0.15 * freezeT;
            }
            // Skip all movement below
          } else {
          
          // Base movement towards target — simple direct approach (no prediction to avoid instability)
          // ── RAGE FLEE: When player's Rage Mode is active, ALL enemies turn tail and run ──
          // Invert velocity direction so they flee from the player.
          const _isRageFlee = window.GameRageCombat && window.GameRageCombat.isRageActive;

          const _safeDistInv = dist > 0.01 ? 1 / dist : 0;
          let vx = (_isRageFlee ? -dx : dx) * _safeDistInv * this.speed;
          let vz = (_isRageFlee ? -dz : dz) * _safeDistInv * this.speed;

          // When fleeing, face away from player (smooth lerp)
          if (_isRageFlee) {
            this._targetRotY = Math.atan2(-dx, -dz);
            let _fleeDelta = this._targetRotY - this.mesh.rotation.y;
            if (_fleeDelta > Math.PI) _fleeDelta -= Math.PI * 2;
            if (_fleeDelta < -Math.PI) _fleeDelta += Math.PI * 2;
            this.mesh.rotation.y += _fleeDelta * Math.min(1.0, dt * 10);
          }
          
          // Add enemy avoidance to prevent stacking/trains (optimized — squared distance to skip sqrt)
          let avoidX = 0, avoidZ = 0;
          let avoidanceCount = 0;
          const maxAvoidanceChecks = 5;
          const avoidRadiusSq = 1.5 * 1.5;
          for (let other of enemies) {
            if (other === this || other.isDead || !other.active) continue;
            if (avoidanceCount >= maxAvoidanceChecks) break;
            const odx = this.mesh.position.x - other.mesh.position.x;
            const odz = this.mesh.position.z - other.mesh.position.z;
            const odistSq = odx*odx + odz*odz;
            
            if (odistSq < avoidRadiusSq && odistSq > 0.0001) {
              const odist = Math.sqrt(odistSq);
              const repulsion = 0.02;
              avoidX += (odx / odist) * repulsion;
              avoidZ += (odz / odist) * repulsion;
              avoidanceCount++;
            }
          }
          const avoidMag = Math.sqrt(avoidX*avoidX + avoidZ*avoidZ);
          if (avoidMag > this.speed * 0.6) {
            const scale = (this.speed * 0.6) / avoidMag;
            avoidX *= scale;
            avoidZ *= scale;
          }
          vx += avoidX;
          vz += avoidZ;
          
          // ── Simple direct movement — no complex state machine to avoid FPS spikes ──
          // Removed: flank, lunge, wait, ambush, dodge states (caused jitter and FPS drops).
          const _distSq       = dist * dist;
          const _isRangedType = (this.type === 4 || this.type === 12 || this.type === 17);

          // Source Glitch (type 20) — unique teleport behavior
          if (this.type === 20) {
            this._glitchTP = (this._glitchTP || 0) + dt;
            if (this._glitchTP > 1.8 && _distSq < 144) {
              this._glitchTP = 0;
              this.mesh.position.x += (Math.random() - 0.5) * 5;
              this.mesh.position.z += (Math.random() - 0.5) * 5;
              if (window.playSound) window.playSound('teleport', 0.4);
            }
            this.mesh.rotation.x = Math.sin(gameTime * 6 + this.wobbleOffset) * 0.8;
            this.mesh.rotation.z = Math.cos(gameTime * 5 + this.wobbleOffset) * 0.6;
            if (this.mesh.material) {
              const _gp = [0xFF00FF, 0x00FFFF, 0xFF8800];
              this.mesh.material.color.setHex(_gp[Math.floor(gameTime * 15) % 3]);
            }
          }

          // ── RANGED ENEMY: maintain distance & fire periodically ──────────────────────
          if (_isRangedType) {
            if (dist < 6.0) {
              vx = -(dx * _safeDistInv) * this.speed * 0.8;
              vz = -(dz * _safeDistInv) * this.speed * 0.8;
            }
            this._rangedShotTimer = (this._rangedShotTimer || 0) + dt;
            const _fireInterval = (this.type === 17) ? 2.0 : 2.5;
            const _fireRange = this.attackRange || (this.type === 17 ? 11 : 18);
            if (this._rangedShotTimer >= _fireInterval && dist <= _fireRange) {
              this._rangedShotTimer = 0;
              this.fireProjectile(targetPos);
            }
          }

          // ── STOP DISTANCE: melee enemies halt at _MELEE_STOP_DIST to prevent overlap/jitter ──
          // This is the key fix for the shaking/jitter bug: enemies stop before entering
          // the player's collision radius, so they never get pushed back and rush in again.
          if (!_isRangedType && this.type !== 20 && dist < _MELEE_STOP_DIST) {
            vx = 0;
            vz = 0;
          }

          // Clamp velocity magnitude to prevent teleportation
          const _MAX_VEL = this.speed * 2.0;
          const _velMag = Math.sqrt(vx * vx + vz * vz);
          if (_velMag > _MAX_VEL) {
            const _velScale = _MAX_VEL / _velMag;
            vx *= _velScale;
            vz *= _velScale;
          }
          
          // Cap dt to prevent lag-spike teleportation (~5fps floor)
          // FIXED: Removed frame-rate dependent * 60 multiplier that caused jitter and teleportation
          // Speed is now in units/second, dt scales it properly without additional multiplier
          const _safeDt = Math.min(dt, 0.2);

          this.mesh.position.x += vx * _safeDt;
          this.mesh.position.z += vz * _safeDt;
          // Track last movement vector for glide-spin death state (store unscaled velocity direction)
          this._lastMoveVX = vx;
          this._lastMoveVZ = vz;
          // Smooth rotation toward target using direct lerp with fixed speed.
          // FIXED: Reduced lerp factor from dt * 10 to dt * 5 to prevent overshooting on frame drops
          // This eliminates jitter caused by rotation snapping when FPS varies
          if (!_isRageFlee) {
            this._targetRotY = Math.atan2(dx, dz);
            let _faceDelta = this._targetRotY - this.mesh.rotation.y;
            // Normalize to shortest arc (-PI to +PI)
            if (_faceDelta > Math.PI) _faceDelta -= Math.PI * 2;
            if (_faceDelta < -Math.PI) _faceDelta += Math.PI * 2;
            // Smooth lerp with reduced factor to prevent overshoot
            this.mesh.rotation.y += _faceDelta * Math.min(1.0, dt * 5);
          }
          // Collision with environment props (trees, barrels, crates) — ground enemies bounce off
          // Skip flying enemy types: 5=Flying, 11=FlyingBoss, 14=BugFast(fly), 16=SweepingSwarm
          const _isFlying = _ENEMY_FLYING_TYPES.has(this.type);
          if (!_isFlying && window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (!prop || !prop.mesh || prop.destroyed) continue;
              const edx = this.mesh.position.x - prop.mesh.position.x;
              const edz = this.mesh.position.z - prop.mesh.position.z;
              const eDist = Math.sqrt(edx*edx + edz*edz);
              const eRadius = prop.type === 'tree' ? _TREE_COLL_R : _PROP_COLL_R;
              if (eDist < eRadius && eDist > 0.001) {
                this.mesh.position.x = prop.mesh.position.x + (edx / eDist) * eRadius;
                this.mesh.position.z = prop.mesh.position.z + (edz / eDist) * eRadius;
                // Wobble the prop on enemy impact
                if (!prop._wobbleTime) prop._wobbleTime = 0;
                if (prop._wobbleTime <= 0) {
                  prop._wobbleTime = 0.6;
                  if (!prop._wobbleDir) prop._wobbleDir = { x: edx / eDist, z: edz / eDist };
                  else { prop._wobbleDir.x = edx / eDist; prop._wobbleDir.z = edz / eDist; }
                }
              }
            }
          }
          // Collision with fences (also skip for flying enemies)
          if (!_isFlying && window.breakableFences) {
            for (let fence of window.breakableFences) {
              if (!fence.userData || !fence.userData.isFence || fence.userData.hp <= 0) continue;
              const efdx = this.mesh.position.x - fence.position.x;
              const efdz = this.mesh.position.z - fence.position.z;
              const efDist = Math.sqrt(efdx*efdx + efdz*efdz);
              if (efDist < _FENCE_COLL_R && efDist > 0.001) {
                this.mesh.position.x = fence.position.x + (efdx / efDist) * _FENCE_COLL_R;
                this.mesh.position.z = fence.position.z + (efdz / efDist) * _FENCE_COLL_R;
                if (!fence.userData._wobbleTime) fence.userData._wobbleTime = 0;
                if (fence.userData._wobbleTime <= 0) {
                  fence.userData._wobbleTime = 0.5;
                  if (!fence.userData._wobbleDir) fence.userData._wobbleDir = { x: efdx / efDist, z: efdz / efDist };
                  else { fence.userData._wobbleDir.x = efdx / efDist; fence.userData._wobbleDir.z = efdz / efDist; }
                }
              }
            }
          }
          } // end else (!isFrozen) movement block
        }

        // Reptilian Shifter: fade opacity based on distance to player (active camo)
        if (this.type === 18 && this.mesh && this.mesh.material) {
          const _reptDist = dist; // dist is already computed above (distance to player)
          const _reptTargetOpacity = _reptDist <= _REPTILIAN_VISIBLE_DIST ? 1.0 : _REPTILIAN_CAMO_OPACITY;
          // Smooth opacity transition
          this.mesh.material.opacity += (_reptTargetOpacity - this.mesh.material.opacity) * Math.min(1, dt * 4);
        }

        // Grey Alien Scout: fire plasma bolt at player periodically
        if (this.type === 17) {
          if (!this._alienShotTimer) this._alienShotTimer = 0;
          this._alienShotTimer += dt;
          if (this._alienShotTimer >= 2.0 && dist <= this.attackRange) {
            this._alienShotTimer = 0;
            this.fireProjectile(targetPos);
          }
        }

        // Collision with target
        if (windmillQuest.active && windmillQuest.windmill && dist < 3.0) {
          // Attack windmill with cooldown
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            windmillQuest.windmill.userData.hp -= this.damage;
            if (typeof updateWindmillQuestUI === 'function') {
              updateWindmillQuestUI();
            }
            this.lastAttackTime = now;
            playSound('hit');
          }
          // Knockback (dt-scaled so it is frame-rate independent; dt capped to prevent lag-spike teleportation)
          const _wkDt = Math.min(dt, 0.05);
          this.mesh.position.x -= (dx / dist) * 120 * _wkDt;
          this.mesh.position.z -= (dz / dist) * 120 * _wkDt;

          if (windmillQuest.windmill.userData.hp <= 0) {
            if (typeof failWindmillQuest === 'function') {
              failWindmillQuest();
            }
          }
        } else if (dist < _MELEE_STOP_DIST && this.type !== 4) { // Attack within stop distance (melee enemies only)
          // Attack player with cooldown to prevent instant death
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            player.takeDamage(this.damage);
            this.lastAttackTime = now;
            
            // No position knockback — enemies stop at _MELEE_STOP_DIST which prevents jitter.
            // The cooldown gap provides the rhythm without spatial oscillation.
            
            // Thorns damage - reflect damage back to enemy if still alive
            if (playerStats.thornsPercent > 0 && !this.isDead) {
              const thornsDamage = this.damage * playerStats.thornsPercent;
              this.takeDamage(thornsDamage, false);
              createDamageNumber(thornsDamage, this.mesh.position, false);
              spawnParticles(this.mesh.position, 0xFF6347, 8); // Tomato red thorns
            }
            
            // Slowing enemy slows player on hit
            if (this.type === 3) {
              playerStats.walkSpeed *= this.slowAmount;
              // Remove slow after duration
              setTimeout(() => {
                playerStats.walkSpeed /= this.slowAmount;
              }, this.slowDuration);
              // Visual effect for slow
              spawnParticles(player.mesh.position, 0x00FFFF, 10);
            }
          }
        }

        // Squishy idle breathing at 1.5Hz (9.4 rad/s) — only when not in hit reaction
        this.pulsePhase += dt * 9.4;
        const squish = Math.sin(this.pulsePhase) * 0.05;

        // ── DISTANCE-BASED LOD: Skip expensive animations for distant enemies ──────────
        // Calculate squared distance once for all animation checks below.
        // Near enemies (< 50 units) get full animation fidelity; distant ones skip
        // expensive operations like eye tracking, head bob, leg animation, etc.
        const _animDistSq = (this.mesh.position.x - playerPos.x) * (this.mesh.position.x - playerPos.x)
                          + (this.mesh.position.z - playerPos.z) * (this.mesh.position.z - playerPos.z);
        const _skipExpensiveAnims = _animDistSq > 2500; // 50² = far enough to skip details

        if (!this._squishTimer) {
        // MiniBoss glowing effect
        if (this.isMiniBoss) {
          const glowIntensity = 0.3 + Math.sin(this.pulsePhase * 2) * 0.2;
          this.mesh.material.emissiveIntensity = glowIntensity;
          // Larger breathing effect for mini-boss
          this.mesh.scale.set(1+squish*2, 1-squish*2, 1+squish*2);
        } else if (this.isFlyingBoss) {
          // Flying Boss — dramatic pulsing glow and slow rotation
          const fbGlow = 0.5 + Math.sin(this.pulsePhase * 1.5) * 0.3;
          this.mesh.material.emissiveIntensity = fbGlow;
          this.mesh.rotation.y += dt * 0.8; // Slow menacing spin
          this.mesh.scale.set(1.8 + squish, 1.8 + squish, 1.8 + squish);
        } else if (this.type === 0 || this.type === 3 || this.type === 6) {
           // Tank, Slowing, and Hard Tank breathe more dramatically
           this.mesh.scale.set(1+squish*1.5, 1-squish*1.5, 1+squish*1.5);
        } else {
           this.mesh.scale.set(1-squish, 1+squish*1.5, 1-squish);
        }
        } // end !_squishTimer breathing
        
        // Blinking eyes animation (skip for distant enemies — not visible anyway)
        if (!_skipExpensiveAnims && this.leftEye && this.rightEye) {
          this.blinkTimer += dt;
          if (this.blinkTimer >= this.nextBlinkTime) {
            this.isBlinking = true;
            this.blinkTimer = 0;
            this.nextBlinkTime = 1.5 + Math.random() * 3.5;
          }
          if (this.isBlinking) {
            const bp = Math.min(1, this.blinkTimer / this.blinkDuration);
            const eyeScale = bp < 0.5 ? 1 - bp * 2 : (bp - 0.5) * 2;
            this.leftEye.scale.y = Math.max(0.05, eyeScale);
            this.rightEye.scale.y = Math.max(0.05, eyeScale);
            if (bp >= 1) {
              this.isBlinking = false;
              this.blinkTimer = 0;
              this.leftEye.scale.y = 1;
              this.rightEye.scale.y = 1;
            }
          }
        }
        
        // Eye tracking: non-instanced enemies rotate eyes toward player each frame (skip for distant)
        if (!_skipExpensiveAnims && this.leftEye && this.rightEye && !this._usesInstancing && playerPos) {
          _tmpHeadTarget.set(playerPos.x, this.mesh.position.y + 0.1, playerPos.z);
          this.leftEye.lookAt(_tmpHeadTarget);
          this.rightEye.lookAt(_tmpHeadTarget);
        }

        // Idle sway: gentle rotation.z oscillation at 0.8Hz (5.03 rad/s) (skip for distant)
        if (!_skipExpensiveAnims && !this._squishTimer && !this.isFrozen) {
          this.mesh.rotation.z = Math.sin(gameTime * 5.03 + this.wobbleOffset) * 0.03;
        }

        // Update ground shadow position for all non-instanced enemies
        if (this.groundShadow) {
          this.groundShadow.position.x = this.mesh.position.x;
          this.groundShadow.position.z = this.mesh.position.z;
          // Grounded enemies keep constant opacity; flying enemies fade with altitude
          const _baseOp = this.groundShadow.material._baseOpacity || 0.4;
          const _shadowHeight = Math.max(0, this.mesh.position.y - 0.5);
          this.groundShadow.material.opacity = Math.max(0.05, _baseOp - _shadowHeight * 0.03);
        }

        // ── Organic "Snail/Worm Pump" Locomotion (skip for distant enemies) ────────────
        // Animate the segmented anatomy groups for a squishy, organic movement feel.
        // Runs continuously — hit-squish is applied additively on top of the base scale.
        if (!_skipExpensiveAnims && this.baseGroup && this.headGroup && this.torsoGroup) {
          const _pump     = Math.sin(gameTime * 4.0 + this.wobbleOffset);
          const _mvX      = this._lastMoveVX || 0;
          const _mvZ      = this._lastMoveVZ || 0;
          const _isMoving = Math.abs(_mvX) + Math.abs(_mvZ) > 0.002;

          // baseGroup: expand horizontally and contract longitudinally while pumping forward
          const _bScaleXZ = 1.0 + (_isMoving ? _pump * 0.14 : _pump * 0.04);
          const _bScaleY  = 1.0 - (_isMoving ? _pump * 0.10 : _pump * 0.03);
          this.baseGroup.scale.set(_bScaleXZ, _bScaleY, _bScaleXZ);

          // torsoGroup: lean forward into the movement direction (local-space X tilt)
          const _moveSpd = Math.sqrt(_mvX * _mvX + _mvZ * _mvZ);
          this.torsoGroup.rotation.x = Math.min(_moveSpd * 0.42, 0.28); // max ~16° lean

          // headGroup: heavy look-at with lerp delay and up/down bob from the base pump
          if (playerPos) {
            const _headY = this._headGroupBaseY + _pump * 0.06;
            _tmpHeadTarget.set(
              playerPos.x,
              this.mesh.position.y + _headY,
              playerPos.z
            );
            if (!this._lerpedHeadTarget) {
              this._lerpedHeadTarget = new THREE.Vector3().copy(_tmpHeadTarget);
            }
            // Lerp rate 3.5 ≈ 280 ms lag — makes the head feel heavy and organic
            this._lerpedHeadTarget.lerp(_tmpHeadTarget, Math.min(1.0, dt * 3.5));
            this.headGroup.position.y = _headY;
            // Only look at player when head is still attached
            if (this.anatomy && this.anatomy.head.attached) {
              this.headGroup.lookAt(this._lerpedHeadTarget);
            }
          }

          // ── Gut Physics — procedural intestine swing ─────────────────────────────
          if (this._gutsContainer && this._gutsContainer.visible) {
            // Sine-wave pendulum that swings harder while moving
            const _gutSwing = Math.sin(gameTime * 3.2 + this.wobbleOffset) * (0.12 + _moveSpd * 0.9);
            this._gutsContainer.rotation.x = _gutSwing;
            this._gutsContainer.rotation.z = Math.cos(gameTime * 2.7 + this.wobbleOffset) * (_moveSpd * 0.5);

            // Blood slide tracks every 10 frames while dragging guts on the floor
            if (_isMoving) {
              this._gutsFrame = (this._gutsFrame || 0) + 1;
              if (this._gutsFrame % 10 === 0) {
                spawnBloodDecal({
                  x: this.mesh.position.x + (Math.random() - 0.5) * 0.2,
                  y: 0,
                  z: this.mesh.position.z + (Math.random() - 0.5) * 0.2
                });
              }
            }
          }
        }

        // ── LEG ANIMATION — walk-cycle tilt proportional to movement speed (skip for distant) ────
        if (!_skipExpensiveAnims && this._legs && this._legs.length > 0) {
          const _legMvX = this._lastMoveVX || 0;
          const _legMvZ = this._lastMoveVZ || 0;
          const _legSpd = Math.sqrt(_legMvX * _legMvX + _legMvZ * _legMvZ);
          if (_legSpd > 0.001) {
            for (let _li = 0; _li < this._legs.length; _li++) {
              const _leg  = this._legs[_li];
              const _base = (_li / this._legs.length) * Math.PI * 2;
              // Alternating stride: each leg steps 180° out of phase with its opposite
              const _stride = Math.sin(gameTime * 8.0 + _base + this.wobbleOffset) * Math.min(_legSpd * 6, 0.35);
              _leg.rotation.x = Math.sin(_base) * 0.33 + _stride;
            }
          }
        }

        // Headless stumble: if head severed, add random XZ drift to simulate blind wandering
        if (this.anatomy && !this.anatomy.head.attached && !this.isDead) {
          const _stumbleAmt = 0.24 * dt; // frame-rate independent (0.004 units/frame at 60fps)
          this.mesh.position.x += (Math.random() - 0.5) * _stumbleAmt;
          this.mesh.position.z += (Math.random() - 0.5) * _stumbleAmt;
        }

        // ── "LAST STAND" Death Throe state ─────────────────────────────────────────
        // If below 15% HP and has lost head or torso segment, enter erratic death throes.
        if (!this.isDead && this.anatomy && this.maxHp > 0 &&
            (this.hp / this.maxHp) < 0.15 &&
            (!this.anatomy.head.attached || !this.anatomy.torso.attached)) {
          if (!this._deathThroeState) {
            // Enter Death Throe state for the first time: halve movement speed
            this._deathThroeState = true;
            this.speed = (this.originalSpeed || this.speed) * 0.5;
            this._playDeathThroeAudio();
          }
          // Violent erratic twitch-and-drag animation overrides normal locomotion
          if (this.baseGroup) {
            this.baseGroup.rotation.x = (Math.random() - 0.5) * 0.9;
            this.baseGroup.rotation.z = (Math.random() - 0.5) * 0.9;
            this.baseGroup.scale.set(
              0.75 + Math.random() * 0.55,
              0.45 + Math.random() * 0.45,
              0.75 + Math.random() * 0.55
            );
          }
          const _throeShake = 4.2 * dt; // frame-rate independent death throe shake (0.07 units/frame at 60fps)
          this.mesh.position.x += (Math.random() - 0.5) * _throeShake;
          this.mesh.position.z += (Math.random() - 0.5) * _throeShake;
          // Repeat scraping audio every ~2 seconds
          this._deathThroeAudioTimer = (this._deathThroeAudioTimer || 0) + dt;
          if (this._deathThroeAudioTimer > 2.0) {
            this._deathThroeAudioTimer = 0;
            this._playDeathThroeAudio();
          }
        }
      }

      // Web Audio synth: low-pitched, distorted wet scraping noise for Death Throe state
      _playDeathThroeAudio() {
        if (typeof audioCtx === 'undefined' || !audioCtx || !isSoundEnabled()) return;
        try {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const now = audioCtx.currentTime;
          const noise = createNoise(0.65);
          const noiseGain = audioCtx.createGain();
          const distortion = audioCtx.createWaveShaper();
          const lpf = audioCtx.createBiquadFilter();
          // Generate heavy distortion curve (soft-clipping at drive=400: higher = more crunch)
          const DISTORTION_DRIVE = 400;
          const _curve = new Float32Array(256);
          for (let _ci = 0; _ci < 256; _ci++) {
            const _x = (_ci * 2) / 256 - 1;
            _curve[_ci] = (Math.PI + DISTORTION_DRIVE) * _x / (Math.PI + DISTORTION_DRIVE * Math.abs(_x));
          }
          distortion.curve = _curve;
          lpf.type = 'lowpass';
          lpf.frequency.setValueAtTime(160, now);
          lpf.frequency.exponentialRampToValueAtTime(55, now + 0.55);
          noiseGain.gain.setValueAtTime(0.22, now);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
          noise.connect(distortion);
          distortion.connect(lpf);
          lpf.connect(noiseGain);
          noiseGain.connect(audioCtx.destination);
          noise.start(now);
          noise.stop(now + 0.65);
        } catch (_e) {}
      }

      fireProjectile(targetPos) {
        // Acquire a pooled enemy projectile slot (shared geometry + material — no VRAM growth)
        const projectile = _acquireEnemyProj();
        if (!projectile) return; // pool saturated — silently skip

        const _startX = this.mesh.position.x;
        const _startZ = this.mesh.position.z;
        const dx = targetPos.x - _startX;
        const dz = targetPos.z - _startZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.01) return; // degenerate case — target on top of enemy

        projectile.active           = true;
        projectile.isEnemyProjectile = true;
        projectile._reflected       = false;
        projectile.speed            = this.projectileSpeed || 0.15;
        projectile.damage           = this.damage;
        projectile.lifetime         = 120; // ~2 s at 60 fps
        projectile.direction.set(dx / dist, 0, dz / dist);

        projectile.mesh.position.set(_startX, 0.8, _startZ);
        scene.add(projectile.mesh);

        projectiles.push(projectile);

        if (typeof playSound === 'function') { try { playSound('shoot'); } catch (e) {} }
      }

      /**
       * Schedule a deferred flush of the per-enemy accumulated damage display.
       * Called when a rapid-fire burst occurs within the 100 ms batching window to
       * ensure the total accumulated damage is eventually shown even if no further
       * hits arrive to trigger an immediate flush.
       */
      _scheduleDamageFlush() {
        if (this._damageFlushTimer) return; // already scheduled
        const _self = this;
        this._damageFlushTimer = setTimeout(() => {
          _self._damageFlushTimer = null;
          _self._lastDamageNumberTime = Date.now();
          if (!_self.isDead && _self.mesh && (_self._accumulatedDamage || 0) > 0) {
            createDamageNumber(_self._accumulatedDamage, _self.mesh.position, _self._accumulatedCrit || false);
          }
          _self._accumulatedDamage = 0;
          _self._accumulatedCrit   = false;
        }, 100);
      }

      /**
       * Apply damage to the enemy
       * @param {number} amount - Damage amount
       * @param {boolean} isCrit - Whether this is a critical hit
       * @param {string} damageType - Type of damage: 'physical', 'fire', 'ice', 'lightning', 'shotgun', 'headshot', 'gun', 'doubleBarrel', 'drone'
       * @param {object|null} hitDir - Direction vector {vx, vz} of the incoming projectile
       * @param {THREE.Vector3|null} hitPoint - World-space position where the hit landed (Y used for segment detection)
       */
      takeDamage(amount, isCrit = false, damageType = 'physical', hitDir = null, hitPoint = null) {
        // If this enemy is already dead but still in the geyser bleed-out animation,
        // a fire/plasma hit should interrupt the blood and instantly char the corpse.
        if (this.isDead) {
          if (this._inGeyserBleedout && (damageType === 'fire' || damageType === 'plasma')) {
            if (typeof this._interruptGeyserBleedout === 'function') this._interruptGeyserBleedout();
          }
          return;
        }

        // Track last damage type and crit state for death effects
        this.lastDamageType = damageType;
        this.lastCrit = isCrit;
        // Flash the spider sprite on every hit
        if (this._spiderSprite) {
          this._spiderSprite.flash();
          this._spiderSprite.play('hit');
        }
        // Track last bullet direction for weapon-specific death effects (e.g. shotgun cone, sniper exit wound)
        if (hitDir && (hitDir.vx !== undefined)) {
          this._lastHitVX = hitDir.vx;
          this._lastHitVZ = hitDir.vz;
        }

        // ── Phasing (Level 60+) ──────────────────────────────────────────────
        // If the enemy has phasing enabled and is not currently in a phase-out
        // window, there is a 20% chance per hit to enter the phased state.
        // While phased the enemy turns 50% transparent and the *next* hit is
        // completely absorbed (no HP loss).  After absorbing one hit the enemy
        // becomes solid again.
        if (this._phasingEnabled) {
          // Helper: set material opacity/transparency — clones shared mat first if needed
          const _setPhaseMat = (opacity, transparent) => {
            if (!this.mesh) return;
            if (this.mesh.material && this.mesh.material._isShared) {
              this.mesh.material = this.mesh.material.clone();
              this.mesh.material._isShared = false;
            }
            const mat = this.mesh.material;
            if (mat) { mat.transparent = transparent; mat.opacity = opacity; }
          };
          if (this._phaseIgnoreNext) {
            // Absorb this hit — show a ghostly deflect flash and restore opacity
            this._phaseIgnoreNext = false;
            _setPhaseMat(1.0, false);
            if (typeof createFloatingText === 'function') {
              createFloatingText('PHASED!', this.mesh.position, '#88CCFF');
            }
            return; // hit completely absorbed
          }
          if (!this._isPhasing && Math.random() < 0.20) {
            // Enter phased state: go 50% transparent for up to 3 seconds
            this._isPhasing = true;
            this._phaseIgnoreNext = true;
            _setPhaseMat(0.5, true);
            // Auto-exit phase after 3 s if no hit absorbed it
            clearTimeout(this._phaseClearTimer);
            this._phaseClearTimer = setTimeout(() => {
              this._isPhasing = false;
              this._phaseIgnoreNext = false;
              _setPhaseMat(1.0, false);
            }, 3000);
          }
        }
        // ────────────────────────────────────────────────────────────────────
        
        // Damage type sets for cleaner conditional checks
        const HEAVY_HIT_TYPES = ['doubleBarrel', 'shotgun', 'pumpShotgun', 'autoShotgun', 'sniperRifle', 'homingMissile', 'fireball'];
        const SHOTGUN_TYPES = ['doubleBarrel', 'shotgun', 'pumpShotgun', 'autoShotgun'];
        // dt threshold above which FPS is considered too low for cosmetic-only effects (~45 FPS = 1/45 ≈ 0.022s)
        const _DT_LOW_FPS = 0.022;
        // Minimum allowed mesh scale to prevent NaN/zero values propagating under rapid fire
        const _SCALE_MIN = 0.2;

        // Phase 5: Hit impact particles (flesh/blood) on every hit — scaled with HP ratio
        const hpRatio = this.hp / this.maxHp;
        const isHeavyHit = HEAVY_HIT_TYPES.includes(damageType) || isCrit;
        const bloodParticleCount = Math.max(8, Math.floor((1 - hpRatio) * 25) + 8); // Increased base from 5 to 8
        spawnParticles(this.mesh.position, 0x8B0000, Math.min(bloodParticleCount, 30)); // Increased max from 20 to 30
        spawnParticles(this.mesh.position, 0x660000, Math.min(Math.floor(bloodParticleCount * 0.5), 12)); // Increased from 8 to 12
        if (isHeavyHit) {
          spawnParticles(this.mesh.position, 0xCC0000, 10); // Increased from 6 to 10
          spawnParticles(this.mesh.position, 0xAA0000, 8); // Increased from 4 to 8
          spawnParticles(this.mesh.position, 0xFF0000, 6); // Added extra bright red particles
        }
        if (isCrit) {
          // Extra impact particles for crits
          spawnParticles(this.mesh.position, 0xFFFF00, 8); // Yellow flash
          spawnParticles(this.mesh.position, 0xFFAA00, 6); // Orange glow
        }

        // Enhanced screen shake for impactful hit feedback
        if (typeof window.triggerScreenShake === 'function') {
          let shakeIntensity = 0.08; // Base shake for normal hits

          if (isCrit) {
            shakeIntensity = 0.25; // Strong shake for critical hits
          } else if (isHeavyHit) {
            shakeIntensity = 0.18; // Medium-strong shake for heavy weapons
          }

          // Extra shake based on damage amount
          const damageScale = Math.min(amount / 200, 1.0);
          shakeIntensity += damageScale * 0.12;

          // Boss hits shake more
          if (this.isBoss) {
            shakeIntensity *= 1.5;
          }

          window.triggerScreenShake(shakeIntensity);
        }

        // Hit-stop effect for heavy weapons - brief time freeze for impact feel
        if (window.DopamineSystem && window.DopamineSystem.TimeDilation) {
          if (isCrit && amount > 100) {
            // Big crit hits: 70ms freeze
            window.DopamineSystem.TimeDilation.snap(0.0, 70);
          } else if (isHeavyHit && amount > 50) {
            // Heavy weapon hits: 40ms freeze
            window.DopamineSystem.TimeDilation.snap(0.0, 40);
          } else if (SHOTGUN_TYPES.includes(damageType)) {
            // Shotgun hits: 30ms freeze for satisfying pellet impact
            window.DopamineSystem.TimeDilation.snap(0.0, 30);
          }
        }

        // Ground blood decal — more on heavy hits
        spawnBloodDecal(this.mesh.position);
        if (isHeavyHit) {
          spawnBloodDecal(this.mesh.position);
          spawnBloodDecal({ x: this.mesh.position.x + (Math.random()-0.5)*0.5, y: 0, z: this.mesh.position.z + (Math.random()-0.5)*0.5 });
        }
        if (hpRatio < 0.5) {
          spawnBloodDecal(this.mesh.position); // Extra blood when low HP
        }
        if (hpRatio < 0.25) {
          spawnBloodDecal(this.mesh.position); // Extra decal at critical HP
          spawnBloodDecal({ x: this.mesh.position.x + (Math.random()-0.5)*0.8, y: 0, z: this.mesh.position.z + (Math.random()-0.5)*0.8 });
          // Arterial spurt at critically low HP — continuous pumping wound
          if (window.BloodSimulatorV21) {
            if (!this._arterialSpurtFired) {
              this._arterialSpurtFired = true;
              window.BloodSimulatorV21.rawBurst(this.mesh.position.x, this.mesh.position.y + 0.4, this.mesh.position.z, 50, { spreadXZ: 11, spreadY: 16, viscosity: 0.62 });
            }
          } else if (window.BloodSystem && window.BloodSystem.emitArterialSpurt && !this._arterialSpurtFired) {
            this._arterialSpurtFired = true; // fire only once per HP threshold crossing
            const artDir = { x: Math.cos(Math.random() * Math.PI * 2), y: 0, z: Math.sin(Math.random() * Math.PI * 2) };
            window.BloodSystem.emitArterialSpurt(this.mesh.position, artDir, {
              pulses: 5, perPulse: 50, interval: 180, intensity: 0.7, coneAngle: 0.3
            });
          }
        }
        // Blood system: directional spray on heavy hits
        if (window.BloodSimulatorV21 && isHeavyHit) {
          const isShotgunHit = SHOTGUN_TYPES.includes(damageType);
          window.BloodSimulatorV21.onEnemyHit(this, this.mesh.position,
            isShotgunHit ? 'projectile' : 'melee');
        } else if (window.BloodSystem && isHeavyHit) {
          const isShotgunHit = SHOTGUN_TYPES.includes(damageType);
          window.BloodSystem.emitBurst(this.mesh.position, isShotgunHit ? 60 : 30, { spreadXZ: 0.8, spreadY: 0.2, minSize: 0.01, maxSize: 0.06, minLife: 20, maxLife: 50 });
        }
        // Weapon-level-based blood effects — higher levels produce more brutal hits
        if (window.BloodSystem) {
          const wl = (typeof weapons !== 'undefined' && weapons) || {};
          const gunLvl = (wl.gun && wl.gun.level) || 1;
          const droneLvl = (wl.droneTurret && wl.droneTurret.level) || 1;
          const swordLvl = (wl.sword && wl.sword.level) || 1;
          const auraLvl = (wl.aura && wl.aura.level) || 1;

          if (damageType === 'gun' || damageType === 'physical') {
            // Gun: Level 1 = small entry wound only; Level 2+ = exit wound spray
            window.BloodSystem.emitBurst(this.mesh.position, 10 + gunLvl * 8, { spreadXZ: 0.3 + gunLvl * 0.15, spreadY: 0.1 + gunLvl * 0.05 });
            if (gunLvl >= 2) {
              _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
              window.BloodSystem.emitExitWound(this.mesh.position, _tmpHitDir, 15 + gunLvl * 10, { speed: 0.2 + gunLvl * 0.05 });
            }
            if (gunLvl >= 3) {
              window.BloodSystem.emitHeartbeatWound(this.mesh.position, { pulses: 2, perPulse: 30 + gunLvl * 15, interval: 250 });
            }
          } else if (damageType === 'drone') {
            // Drone: Level 1 = entry only, Level 3+ = go through with exit mist
            _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitDroneMist(this.mesh.position, _tmpHitDir, 20 + droneLvl * 15);
            if (droneLvl >= 3) {
              window.BloodSystem.emitExitWound(this.mesh.position, _tmpHitDir, 20 + droneLvl * 8, { speed: 0.25 });
            }
          } else if (damageType === 'sword') {
            // Sword: slash lines with blood pouring — higher levels = deeper cuts
            _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitSwordSlash(this.mesh.position, _tmpHitDir, 20 + swordLvl * 12);
            if (swordLvl >= 2) {
              window.BloodSystem.emitPulse(this.mesh.position, { pulses: 2, perPulse: 40 + swordLvl * 20, interval: 200, arcDir: _tmpHitDir, spreadXZ: 0.4 });
            }
          } else if (damageType === 'aura') {
            // Aura: energy burns escalate with level
            window.BloodSystem.emitAuraBurn(this.mesh.position, 15 + auraLvl * 10);
            if (auraLvl >= 2) {
              window.BloodSystem.emitBurst(this.mesh.position, 10 + auraLvl * 8, { spreadXZ: 0.3, spreadY: 0.15, color1: 0x2A0000, color2: 0xFF4500, minSize: 0.02, maxSize: 0.06 });
            }
          } else if (damageType === 'headshot') {
            // Headshot: always dramatic blood spray from head
            window.BloodSystem.emitHeadBleed(this.mesh.position, { intensity: 0.5, duration: 3 });
            window.BloodSystem.emitBurst(this.mesh.position, 80, { spreadXZ: 1.2, spreadY: 0.4 });
          } else if (damageType === 'shotgun' || damageType === 'doubleBarrel' || damageType === 'pumpShotgun' || damageType === 'autoShotgun') {
            // Shotgun variants: massive burst — exit wounds + guts at high power
            window.BloodSystem.emitBurst(this.mesh.position, 80, { spreadXZ: 1.5, spreadY: 0.3 });
            window.BloodSystem.emitGuts(this.mesh.position, { count: 15 });
            _tmpHitDir.set(Math.random()-0.5, 0, Math.random()-0.5).normalize();
            window.BloodSystem.emitExitWound(this.mesh.position, _tmpHitDir, 40, { speed: 0.35 });
          } else if (damageType === 'samuraiSword' || damageType === 'teslaSaber') {
            // Bladed weapons: deep slashing wounds
            _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitSwordSlash(this.mesh.position, _tmpHitDir, 35);
            window.BloodSystem.emitPulse(this.mesh.position, { pulses: 2, perPulse: 50, interval: 200, arcDir: _tmpHitDir, spreadXZ: 0.5 });
            if (damageType === 'teslaSaber') {
              spawnParticles(this.mesh.position, 0x00CCFF, 8); // Electric sparks
              spawnParticles(this.mesh.position, 0xFFFFFF, 4);
            }
          } else if (damageType === 'whip') {
            // Whip: lash marks
            window.BloodSystem.emitBurst(this.mesh.position, 25, { spreadXZ: 0.6, spreadY: 0.1 });
            spawnParticles(this.mesh.position, 0xCC8844, 5);
          } else if (damageType === 'sniperRifle' || damageType === '50cal') {
            // Sniper: massive through-and-through — exit wound on opposite side of bullet direction
            const sniperDir = (hitDir && (hitDir.vx !== undefined))
              ? new THREE.Vector3(hitDir.vx, 0, hitDir.vz).normalize()
              : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitBurst(this.mesh.position, 100, { spreadXZ: 2.0, spreadY: 0.5 });
            // Exit wound on the OPPOSITE side (bullet passes through)
            const exitPos = this.mesh.position.clone().addScaledVector(sniperDir, 0.9);
            window.BloodSystem.emitExitWound(exitPos, sniperDir, 80, { speed: 0.6, spread: 0.5 });
            window.BloodSystem.emitGuts(this.mesh.position, { count: 8 });
          } else if (damageType === 'minigun' || damageType === 'uzi') {
            // Rapid fire: small frequent blood spurts
            window.BloodSystem.emitBurst(this.mesh.position, 15, { spreadXZ: 0.3, spreadY: 0.1 });
          } else if (damageType === 'bow') {
            // Arrow: pin wound + blood trickle
            window.BloodSystem.emitBurst(this.mesh.position, 20, { spreadXZ: 0.4, spreadY: 0.15 });
            spawnParticles(this.mesh.position, 0x8B4513, 3); // Wood splinter particles
          } else if (damageType === 'boomerang' || damageType === 'shuriken') {
            // Thrown weapons: slicing cuts
            _tmpHitDir.set(Math.random()-0.5, 0, Math.random()-0.5).normalize();
            window.BloodSystem.emitSwordSlash(this.mesh.position, _tmpHitDir, 25);
            spawnParticles(this.mesh.position, 0xCCCCCC, 4); // Metal spark
          } else if (damageType === 'nanoSwarm' || damageType === 'special') {
            // Nano/special: small precise wounds
            window.BloodSystem.emitBurst(this.mesh.position, 12, { spreadXZ: 0.2, spreadY: 0.1 });
            spawnParticles(this.mesh.position, 0x6688FF, 3);
          } else if (damageType === 'homingMissile' || damageType === 'fireball') {
            // Explosive: massive blast
            window.BloodSystem.emitBurst(this.mesh.position, 90, { spreadXZ: 2.0, spreadY: 0.5 });
            window.BloodSystem.emitGuts(this.mesh.position, { count: 12 });
            spawnParticles(this.mesh.position, 0xFF4400, 10);
          } else if (damageType === 'lightning') {
            // Lightning: charring + electric sparks
            window.BloodSystem.emitAuraBurn(this.mesh.position, 30);
            spawnParticles(this.mesh.position, 0x00CCFF, 6);
            spawnParticles(this.mesh.position, 0xFFFF00, 4);
          } else if (damageType === 'poison') {
            // Poison: toxic dissolve particles
            window.BloodSystem.emitBurst(this.mesh.position, 15, { spreadXZ: 0.3, spreadY: 0.1, color1: 0x00AA00, color2: 0x44FF44 });
            spawnParticles(this.mesh.position, 0x00FF00, 5);
          }
        }
        // Pulsating wound blood drips — use instanced BloodSystem drops (zero per-drop mesh cost)
        if (isHeavyHit || hpRatio < 0.5) {
          const dripCount = isHeavyHit ? (3 + Math.floor(Math.random() * 3)) : (1 + Math.floor(Math.random() * 2));
          if (window.BloodSystem && window.BloodSystem.emitDrop) {
            const spread = isHeavyHit ? 0.25 : 0.1;
            for (let bd = 0; bd < dripCount; bd++) {
              window.BloodSystem.emitDrop(
                this.mesh.position.x,
                this.mesh.position.y + 0.2 + Math.random() * 0.4,
                this.mesh.position.z,
                (Math.random() - 0.5) * spread,
                0.08 + Math.random() * 0.2,
                (Math.random() - 0.5) * spread,
                0.015 + Math.random() * 0.04
              );
            }
          } else if (bloodDrips.length < MAX_BLOOD_DRIPS) {
            // Fallback: legacy individual mesh path — cap at 3 to avoid per-hit allocation spikes
            const _fallbackMax = Math.min(dripCount, 3);
            for (let bd = 0; bd < _fallbackMax && bloodDrips.length < MAX_BLOOD_DRIPS; bd++) {
              if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
              const dripSize = 0.015 + Math.random() * 0.04;
              const dripMesh = new THREE.Mesh(_sharedBloodDripGeo, new THREE.MeshBasicMaterial({ color: [0x8B0000, 0xAA0000, 0x660000, 0xCC0000][bd % 4] }));
              dripMesh.scale.setScalar(dripSize);
              dripMesh.position.copy(this.mesh.position);
              dripMesh.position.y += 0.2 + Math.random() * 0.4;
              scene.add(dripMesh);
              bloodDrips.push({
                mesh: dripMesh,
                velX: (Math.random() - 0.5) * (isHeavyHit ? 0.25 : 0.1),
                velZ: (Math.random() - 0.5) * (isHeavyHit ? 0.25 : 0.1),
                velY: 0.08 + Math.random() * 0.2,
                life: 40 + Math.floor(Math.random() * 25),
                _sharedGeo: true
              });
            }
          }
        }
        // Register persistent wound for heartbeat spurts – start early (75% HP) so blood
        // visually pumps from wounds well before the enemy dies, not only near death.
        // Direction is randomised so each wound spurts in a unique direction.
        if (hpRatio < 0.75 && window.BloodSystem && window.BloodSystem.addWound) {
          const wDir = { x: Math.cos(Math.random() * Math.PI * 2), z: Math.sin(Math.random() * Math.PI * 2) };
          const wLife = hpRatio < 0.25 ? 480 : (hpRatio < 0.5 ? 300 : 180); // 75-50%→180f, 50-25%→300f, <25%→480f
          window.BloodSystem.addWound(this.mesh.position, wDir, damageType, { life: wLife });
        }
        // Blood splatter on nearby enemies (stain them red)
        if (isHeavyHit && enemies) {
          const hitPos = this.mesh.position;
          for (let ne = 0; ne < enemies.length; ne++) {
            const other = enemies[ne];
            if (other === this || other.isDead || !other.mesh) continue;
            const dx = other.mesh.position.x - hitPos.x;
            const dz = other.mesh.position.z - hitPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < 4.0) { // Within 2 units
              // Stain the nearby enemy with blood
              if (other.mesh.material && other.mesh.material.color) {
                // Detach from shared material before modifying per-enemy color
                if (other.mesh.material._isShared) {
                  other.mesh.material = other.mesh.material.clone();
                  other.mesh.material._isShared = false;
                }
                if (!other._originalColor) other._originalColor = other.mesh.material.color.clone();
                const stainAmt = Math.max(0, 0.15 * (1 - Math.sqrt(distSq) / 2));
                if (!Enemy._bloodColor) Enemy._bloodColor = new THREE.Color(0x8B0000);
                other.mesh.material.color.lerp(Enemy._bloodColor, stainAmt);
              }
            }
          }
        }
        
        // Progressive blood stain: blend enemy mesh color toward dark red as HP drops
        // This works on ALL enemy colors (including yellow/gold) by directly lerping the color
        if (this.mesh && this.mesh.material) {
          // Detach from the shared material on first hit so per-enemy color
          // transitions don't affect all living enemies simultaneously.
          if (this.mesh.material._isShared) {
            this.mesh.material = this.mesh.material.clone();
            this.mesh.material._isShared = false;
          }
          if (!this._originalColor) {
            this._originalColor = this.mesh.material.color.clone();
          }
          // Lerp factor: 0 at full HP → 0.85 near death (almost fully blood-covered)
          const bloodLerp = (1 - hpRatio) * 0.85;
          // Cached blood colors to avoid per-hit allocation
          if (!Enemy._bloodColor) Enemy._bloodColor = new THREE.Color(0x8B0000);
          if (!Enemy._emissiveBloodColor) Enemy._emissiveBloodColor = new THREE.Color(0x6B0000);
          // Only update color if not frozen (freeze manages its own colour)
          if (!this.isFrozen) {
            this.mesh.material.color.copy(this._originalColor).lerp(Enemy._bloodColor, bloodLerp);
            if (this.isSkinned) {
              try {
                if (this.mesh && this.mesh.material) this.mesh.material.color.setHex(0x8B2020);
              } catch(e) {}
            }
          }
          // Also apply emissive for wet blood sheen
          if (!this.isFrozen && this.mesh.material.emissive !== undefined) {
            const bloodStainIntensity = (1 - hpRatio) * 0.4;
            this.mesh.material.emissive.copy(Enemy._emissiveBloodColor);
            this.mesh.material.emissiveIntensity = bloodStainIntensity;
          }
        }
        
        // Throttle expensive new-mesh creation (blood stains, drips, holes) to at most
        // once every 120 ms to avoid creating dozens of objects during rapid drone fire.
        const nowHit = Date.now();
        const canSpawnMeshes = !this._lastHitMeshTime || (nowHit - this._lastHitMeshTime) > 120;
        if (canSpawnMeshes) {
          this._lastHitMeshTime = nowHit;

        // Add blood stain meshes directly on enemy body (visible on all colors)
        if (!this._bloodStains) this._bloodStains = [];
        const MAX_BODY_BLOOD_STAINS = 12;
        if (this._bloodStains.length < MAX_BODY_BLOOD_STAINS) {
          const stainCount = hpRatio < 0.25 ? 3 : (hpRatio < 0.5 ? 2 : 1);
          // Lazy-init shared stain geometry (unit-size, scale per instance)
          if (!_sharedBloodStainGeo && typeof THREE !== 'undefined') {
            _sharedBloodStainGeo = new THREE.CircleGeometry(1, 16);
          }
          for (let s = 0; s < stainCount && this._bloodStains.length < MAX_BODY_BLOOD_STAINS; s++) {
            const stainSize = 0.08 + Math.random() * 0.15;
            const stain = new THREE.Mesh(
              _sharedBloodStainGeo,
              new THREE.MeshBasicMaterial({
                color: 0x5a0000,
                transparent: true,
                opacity: 0.82,
                side: THREE.DoubleSide,
                depthWrite: false
              })
            );
            stain.scale.setScalar(stainSize);
            // Place on enemy surface
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const r = 0.49;
            stain.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
            stain.lookAt(stain.position.clone().multiplyScalar(2));
            this.mesh.add(stain);
            this._bloodStains.push(stain);
          }
        }
        
        // Blood drip: small drops fall from wounded enemy to ground (managed in main loop)
        // More blood drips from first shot onward, increasing with damage
        if (scene) {
          // Blood drip: use instanced drops for zero per-drop mesh overhead
          const dripCount = hpRatio < 0.25 ? 6 : (hpRatio < 0.5 ? 4 : 3);
          if (window.BloodSystem && window.BloodSystem.emitDrop) {
            for (let d = 0; d < dripCount; d++) {
              window.BloodSystem.emitDrop(
                this.mesh.position.x + (Math.random() - 0.5) * 0.5,
                this.mesh.position.y + (Math.random() - 0.5) * 0.3,
                this.mesh.position.z + (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.06,
                0.02 + Math.random() * 0.06,
                (Math.random() - 0.5) * 0.06,
                0.03 + Math.random() * 0.05
              );
            }
          } else if (bloodDrips.length < MAX_BLOOD_DRIPS) {
            if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') {
              _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
            }
            for (let d = 0; d < dripCount && bloodDrips.length < MAX_BLOOD_DRIPS; d++) {
              const dripSize = 0.03 + Math.random() * 0.05;
              const drip = new THREE.Mesh(
                _sharedBloodDripGeo,
                new THREE.MeshBasicMaterial({ color: 0x8B0000 })
              );
              drip.scale.setScalar(dripSize);
              drip.position.set(
                this.mesh.position.x + (Math.random() - 0.5) * 0.5,
                this.mesh.position.y + (Math.random() - 0.5) * 0.3,
                this.mesh.position.z + (Math.random() - 0.5) * 0.5
              );
              scene.add(drip);
              bloodDrips.push({ mesh: drip, velY: 0, life: 30 + Math.floor(Math.random() * 20), _sharedGeo: true });
            }
          }
        }
        
        // Bullet-hole decal that sticks to enemy surface (visible bloody wound)
        if (!this.bulletHoles) this.bulletHoles = [];
        const MAX_ENEMY_BULLET_HOLES = 4;
        if (this.bulletHoles.length < MAX_ENEMY_BULLET_HOLES) {
          // Reuse shared geometry; clone shared material for per-hole opacity control
          ensureBulletHoleMaterials();
          if (bulletHoleGeo && bulletHoleMat) {
          const holeDecal = new THREE.Mesh(bulletHoleGeo, bulletHoleMat.clone());
          // Choose the best anatomical group to parent the hole to (torso or head).
          // This makes holes appear ON the correct body segment rather than floating.
          const _enemyBaseY = this.mesh.position.y;
          const _hitHY = hitPoint ? (hitPoint.y - _enemyBaseY) : 0.35;
          const _targetGroup = (_hitHY >= 0.5 && this.headGroup) ? this.headGroup
                             : (this.torsoGroup ? this.torsoGroup : null);
          if (hitPoint && _targetGroup) {
            // Convert world hit position to local space of the target group
            const _localHit = _targetGroup.worldToLocal(
              new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z)
            );
            const _localNorm = _localHit.clone().normalize();
            holeDecal.position.copy(_localHit).addScaledVector(_localNorm, 0.02);
            holeDecal.lookAt(_localHit.clone().add(_localNorm));
            _targetGroup.add(holeDecal);
          } else {
            // Fallback: direction-based placement on this.mesh
            let nx, ny, nz;
            if (hitDir && (hitDir.vx !== undefined || hitDir.x !== undefined)) {
              const hvx = hitDir.vx !== undefined ? hitDir.vx : (hitDir.x || 0);
              const hvz = hitDir.vz !== undefined ? hitDir.vz : (hitDir.z || 0);
              const hLen = Math.sqrt(hvx * hvx + hvz * hvz) || 1;
              nx = hvx / hLen;
              ny = 0;
              nz = hvz / hLen;
            } else {
              // Fallback: random hemisphere facing forward (player-side)
              const theta = Math.random() * Math.PI * 2;
              const phi = Math.random() * Math.PI * 0.5;
              nx = Math.sin(phi) * Math.cos(theta);
              ny = Math.sin(phi) * Math.sin(theta) * 0.5;
              nz = Math.abs(Math.cos(phi));
            }
            // Offset 0.01 units along normal from mesh surface
            const meshRadius = 0.54;
            holeDecal.position.set(nx * (meshRadius + 0.01), ny * (meshRadius + 0.01), nz * (meshRadius + 0.01));
            // Face outward along normal
            holeDecal.lookAt(new THREE.Vector3(nx * 2, ny * 2, nz * 2));
            this.mesh.add(holeDecal);
          }
          this.bulletHoles.push(holeDecal);
          }
        }
        } // end canSpawnMeshes throttle
        
        // Airborne blood splatter - throttled alongside other mesh creation
        if (canSpawnMeshes) {
          const burstCount = isCrit ? 5 : 3;
          if (window.BloodSystem && window.BloodSystem.emitDrop) {
            for (let b = 0; b < burstCount; b++) {
              window.BloodSystem.emitDrop(
                this.mesh.position.x + (Math.random() - 0.5) * 0.4,
                this.mesh.position.y + 0.1,
                this.mesh.position.z + (Math.random() - 0.5) * 0.4,
                (Math.random() - 0.5) * 0.08,
                0.12 + Math.random() * 0.22,
                (Math.random() - 0.5) * 0.08,
                0.03 + Math.random() * 0.05
              );
            }
          } else {
            for (let b = 0; b < burstCount && bloodDrips.length < MAX_BLOOD_DRIPS; b++) {
              const bSize = 0.03 + Math.random() * 0.05;
              if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') {
                _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
              }
              const p = new THREE.Mesh(
                _sharedBloodDripGeo,
                new THREE.MeshBasicMaterial({ color: 0xAA0000 })
              );
              p.scale.setScalar(bSize);
              p.position.set(
                this.mesh.position.x + (Math.random() - 0.5) * 0.4,
                this.mesh.position.y + 0.1,
                this.mesh.position.z + (Math.random() - 0.5) * 0.4
              );
              scene.add(p);
              bloodDrips.push({
                mesh: p,
                velX: (Math.random() - 0.5) * 0.08,
                velZ: (Math.random() - 0.5) * 0.08,
                velY: 0.12 + Math.random() * 0.22,
                life: 35 + Math.floor(Math.random() * 15),
                _sharedGeo: true
              });
            }
          }
        } // end airborne blood throttle
        
        // Phase 3: Apply armor reduction for MiniBoss/FlyingBoss — delegated to GameCombat
        let finalAmount = amount;
        if (this.armor > 0) {
          // Apply player's armor penetration: reduces effective enemy armor
          const effectiveArmor = this.armor * (1 - (playerStats.armorPenetration || 0));
          finalAmount = calculateEnemyArmorReduction(amount, effectiveArmor);
          // Show armor reduction effect
          if (this.isMiniBoss || this.isFlyingBoss) {
            createFloatingText(`-${Math.floor(amount * effectiveArmor)}`, this.mesh.position, '#FFD700');
          }
        }

        // Apply elemental resistance/vulnerability based on damage type
        if (damageType && this.elementalResistance) {
          const resistKey = damageType === 'gun' || damageType === 'sword' || damageType === 'drone' || damageType === 'shotgun' || damageType === 'doubleBarrel'
            ? 'physical' : damageType;
          const resist = this.elementalResistance[resistKey] || 0;
          if (resist !== 0) finalAmount *= (1 - resist);
        }

        // Frozen enemies take double damage after armor — freeze bonus applies on top of armor
        if (this.isFrozen) finalAmount *= 2;

        // Execute bonus: extra damage vs enemies below 30% HP
        if (playerStats.executeDamage > 0 && this.hp / this.maxHp < 0.30) {
          finalAmount *= (1 + playerStats.executeDamage);
        }

        // ── Annunaki Boss: Divine Shield + Neural Matrix gate ─────────────────
        // The shield can only be penetrated if the player has unlocked at least
        // 3 major Neural Matrix nodes (eventHorizon, bloodAlchemy, kineticMirror,
        // annunakiProtocol).  Without that, all damage is absorbed by the shield
        // and the player sees a warning.
        if (this.isAnnunakiBoss && this.divineShieldActive) {
          const _nm = (typeof saveData !== 'undefined' && saveData && saveData.neuralMatrix) ? saveData.neuralMatrix : {};
          const _majorNodes = ['eventHorizon', 'bloodAlchemy', 'kineticMirror', 'annunakiProtocol'];
          const _unlockedCount = _majorNodes.filter(n => !!_nm[n]).length;
          if (_unlockedCount < 3) {
            // Shield blocks the hit — show warning once per 3 s
            const _now = Date.now();
            if (!this._shieldWarnLast || _now - this._shieldWarnLast > 3000) {
              this._shieldWarnLast = _now;
              if (typeof createFloatingText === 'function') {
                createFloatingText(
                  '🛡️ NEURAL MATRIX: ' + _unlockedCount + '/3 NODES REQUIRED',
                  this.mesh.position, '#FFD700'
                );
              }
              if (window.pushSuperStatEvent) {
                window.pushSuperStatEvent('🛡️ SHIELD BLOCKS — UNLOCK 3 NM NODES', 'rare', '⬡', 'danger');
              }
            }
            return; // damage blocked entirely
          }
          // Player has ≥3 nodes — damage drains the shield first
          // divineShieldHp is initialised to 50000 in spawnAnnunakiBoss; treat
          // undefined as 0 only as a safety guard.
          this.divineShieldHp = (this.divineShieldHp != null ? this.divineShieldHp : 0) - finalAmount;
          if (this.divineShieldHp <= 0) {
            this.divineShieldActive = false;
            this.divineShieldHp = 0;
            if (typeof createFloatingText === 'function') {
              createFloatingText('🔥 DIVINE SHIELD BROKEN!', this.mesh.position, '#FF4400');
            }
            if (window.pushSuperStatEvent) {
              window.pushSuperStatEvent('💥 DIVINE SHIELD BROKEN', 'mythic', '🔥', 'success');
            }
          }
          return; // don't remove main HP while shield is (was) active
        }
        // ────────────────────────────────────────────────────────────────────

        const oldHp = this.hp;
        this.hp -= finalAmount;

        // ── Batched damage numbers (100 ms window per enemy) ─────────────────
        // Rapid-fire weapons (Aura, Shotgun, minigun) can hit the same enemy
        // many times in a single frame.  Accumulate all damage within a 100 ms
        // window and emit only ONE floating number, preventing DOM element floods.
        {
          const now = Date.now();
          if (!this._accumulatedDamage)       this._accumulatedDamage      = 0;
          if (!this._accumulatedCrit)         this._accumulatedCrit        = false;
          if (!this._lastDamageNumberTime)    this._lastDamageNumberTime   = 0;
          this._accumulatedDamage += Math.floor(finalAmount);
          if (isCrit) this._accumulatedCrit = true;
          if (now - this._lastDamageNumberTime >= 100) {
            // Enough time has elapsed — flush accumulated total immediately.
            if (this._damageFlushTimer) { clearTimeout(this._damageFlushTimer); this._damageFlushTimer = null; }
            createDamageNumber(this._accumulatedDamage, this.mesh.position, this._accumulatedCrit);
            this._lastDamageNumberTime = now;
            this._accumulatedDamage    = 0;
            this._accumulatedCrit      = false;
          } else if (!this._damageFlushTimer) {
            // Still within the 100 ms burst window — schedule a deferred flush so
            // the accumulated total is always eventually shown.
            this._scheduleDamageFlush();
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── LOCALIZED HIT DETECTION ────────────────────────────────────────────────
        // Use hitPoint.y (world-space) relative to enemy base to decide which segment
        // was struck: Base (low), Torso (mid), Head (top).
        // Falls back to random distribution when no hitPoint is provided.
        if (this.anatomy) {
          // Compute relative hit height — 0 = floor level, 1 ≈ top of enemy
          const _enemyBaseY = this.mesh.position.y;
          const _relY = hitPoint ? (hitPoint.y - _enemyBaseY) : -1; // -1 = use random

          let _hitSegment; // 'head' | 'torso' | 'base'
          if (_relY >= 0) {
            // Rough segment boundaries (normalised to mesh height ~1 unit)
            if      (_relY >= 0.55) _hitSegment = 'head';
            else if (_relY >= 0.22) _hitSegment = 'torso';
            else                   _hitSegment = 'base';
          } else {
            // Random fallback: 25% head, 40% torso, 35% base
            const _zone = Math.random();
            if      (_zone < 0.25) _hitSegment = 'head';
            else if (_zone < 0.65) _hitSegment = 'torso';
            else                   _hitSegment = 'base';
          }

          // ── Apply damage to the chosen segment ─────────────────────────────────
          const _seg = this.anatomy[_hitSegment];
          if (_seg && _seg.attached) {
            const _dmgMult = _hitSegment === 'head' ? 0.5 : (_hitSegment === 'torso' ? 0.4 : 0.3);
            _seg.hp = Math.max(0, _seg.hp - finalAmount * _dmgMult);

            // ── VISUAL DEGRADATION: chip the segment mesh inward, varying deformation
            // by hit coordinate so each bullet hole looks structurally unique.
            const _segMesh = _hitSegment === 'head'  ? this.headGroup
                           : _hitSegment === 'torso' ? this.torsoGroup
                           :                           this.baseGroup;
            if (_segMesh) {
              // Use hit coordinate components to seed deformation amounts
              const _hx = hitPoint ? (hitPoint.x - this.mesh.position.x) : (Math.random() - 0.5);
              const _hz = hitPoint ? (hitPoint.z - this.mesh.position.z) : (Math.random() - 0.5);
              // _hy: 0 at mid-torso, ±0.35 at extremes; clamp so fallback stays moderate
              const _hy = hitPoint ? Math.max(-0.35, Math.min(0.35, _relY - 0.35)) : (Math.random() - 0.5) * 0.35;
              // Impact angle drives which axes collapse (cavity in direction of bullet)
              const _dX = 0.80 + Math.abs(_hz) * 0.15; // Z-offset compresses X
              const _dZ = 0.80 + Math.abs(_hx) * 0.15; // X-offset compresses Z
              const _dY = 1.0  - Math.abs(_hy) * 0.18; // height offset flattens Y
              _segMesh.scale.x = Math.max(0.1, Math.min(3.0, _segMesh.scale.x * _dX));
              _segMesh.scale.y = Math.max(0.1, Math.min(3.0, _segMesh.scale.y * _dY));
              _segMesh.scale.z = Math.max(0.1, Math.min(3.0, _segMesh.scale.z * _dZ));
            }

            // ── MEAT CHUNKS: flesh/gore pieces fly out on every hit ──────────────
            if (scene && managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              const _chunkCount = 3 + Math.floor(Math.random() * 2); // 3-4 max
              const _chunkHitX  = hitDir ? (hitDir.vx || 0) : (Math.random() - 0.5);
              const _chunkHitZ  = hitDir ? (hitDir.vz || 0) : (Math.random() - 0.5);
              const _spawnY     = _enemyBaseY + (_hitSegment === 'head' ? 0.55 : (_hitSegment === 'torso' ? 0.35 : 0.12));
              const _chunkMeshes = [];
              for (let _ci = 0; _ci < _chunkCount; _ci++) {
                const _cSize = 0.04 + Math.random() * 0.07;
                // Mix shapes: organ blobs, limb capsules, irregular flesh
                const _crShp = Math.random();
                const _cGeo  = _crShp < 0.4
                  ? new THREE.DodecahedronGeometry(_cSize, 0)
                  : _crShp < 0.75
                    ? new THREE.CapsuleGeometry(_cSize * 0.45, _cSize * 1.2, 3, 4)
                    : new THREE.SphereGeometry(_cSize, 4, 3);
                const _goreC = [0x6B0000, 0x8B0000, 0x4A0000, 0x550011][Math.floor(Math.random() * 4)];
                const _cMat  = new THREE.MeshBasicMaterial({ color: _goreC });
                const _cMesh = new THREE.Mesh(_cGeo, _cMat);
                _cMesh.position.set(
                  this.mesh.position.x + (Math.random() - 0.5) * 0.15,
                  _spawnY,
                  this.mesh.position.z + (Math.random() - 0.5) * 0.15
                );
                scene.add(_cMesh);
                _chunkMeshes.push({
                  mesh: _cMesh, geo: _cGeo, mat: _cMat,
                  vx: _chunkHitX * (0.08 + Math.random() * 0.14) + (Math.random() - 0.5) * 0.12,
                  vy: 0.10 + Math.random() * 0.18,
                  vz: _chunkHitZ * (0.08 + Math.random() * 0.14) + (Math.random() - 0.5) * 0.12,
                  rotX: (Math.random() - 0.5) * 0.35,
                  rotZ: (Math.random() - 0.5) * 0.35,
                  life: 70 + Math.floor(Math.random() * 40),
                  isCamChunk: false
                });
              }

              // ── SCREEN SPLATTER: point-blank kill check — one chunk flies at camera ──
              const _camPos = (typeof camera !== 'undefined' && camera) ? camera.position : null;
              const _dToPlayer = _camPos
                ? Math.sqrt(
                    (_camPos.x - this.mesh.position.x) ** 2 +
                    (_camPos.z - this.mesh.position.z) ** 2
                  )
                : 999;
              if (_dToPlayer < 2.5 && _chunkMeshes.length > 0 && !this._splatterSent) {
                this._splatterSent = true;
                const _sc = _chunkMeshes[0];
                _sc.isCamChunk = true;
                if (_camPos) {
                  const _toCamX = _camPos.x - this.mesh.position.x;
                  const _toCamZ = _camPos.z - this.mesh.position.z;
                  const _tcLen  = Math.sqrt(_toCamX * _toCamX + _toCamZ * _toCamZ) || 1;
                  _sc.vx = (_toCamX / _tcLen) * 0.22;
                  _sc.vz = (_toCamZ / _tcLen) * 0.22;
                  _sc.vy = 0.06;
                }
              }

              managedAnimations.push({
                _chunks: _chunkMeshes,
                update(_dt) {
                  for (let _i = _chunkMeshes.length - 1; _i >= 0; _i--) {
                    const _c = _chunkMeshes[_i];
                    if (!_c.mesh.visible) continue;
                    _c.vy -= 0.011; // gravity
                    _c.mesh.position.x += _c.vx;
                    _c.mesh.position.y += _c.vy;
                    _c.mesh.position.z += _c.vz;
                    _c.mesh.rotation.x += _c.rotX;
                    _c.mesh.rotation.z += _c.rotZ;
                    // Bounce on floor
                    if (_c.mesh.position.y < 0.04) {
                      _c.mesh.position.y = 0.04;
                      _c.vy = Math.abs(_c.vy) * 0.28;
                      _c.vx *= 0.65; _c.vz *= 0.65;
                      if (Math.random() < 0.6) spawnBloodDecal(_c.mesh.position);
                    }
                    // Blood trail in air
                    if (_c.life % 8 === 0 && _c.mesh.position.y > 0.1) {
                      spawnBloodDecal({ x: _c.mesh.position.x, y: 0, z: _c.mesh.position.z });
                    }
                    // Screen splatter trigger — chunk reaching camera proximity
                    if (_c.isCamChunk && _camPos) {
                      const _dCam = Math.sqrt(
                        (_c.mesh.position.x - _camPos.x) ** 2 +
                        (_c.mesh.position.y - _camPos.y) ** 2 +
                        (_c.mesh.position.z - _camPos.z) ** 2
                      );
                      if (_dCam < 0.8) {
                        _c.isCamChunk = false;
                        if (typeof window._triggerBloodSplatter === 'function') {
                          window._triggerBloodSplatter();
                        }
                      }
                    }
                    _c.life--;
                    // PERF FIX: Sink into ground and shrink instead of opacity fade (avoids mobile overdraw)
                    if (_c.life < 60) {
                      _c.mesh.position.y -= 0.003;
                      _c.mesh.scale.multiplyScalar(0.985);
                    }
                    if (_c.life <= 0) {
                      scene.remove(_c.mesh); _c.geo.dispose(); _c.mat.dispose();
                      _chunkMeshes.splice(_i, 1);
                    }
                  }
                  return _chunkMeshes.length > 0;
                },
                cleanup() {
                  for (const _c of _chunkMeshes) {
                    if (_c.mesh.parent) scene.remove(_c.mesh);
                    _c.geo.dispose(); _c.mat.dispose();
                  }
                  _chunkMeshes.length = 0;
                }
              });
            }

            // ── SEGMENT SEVERING ────────────────────────────────────────────────
            if (_seg.hp <= 0) {
              _seg.attached = false;

              if (_hitSegment === 'head') {
                // Hide the head group and spawn a rolling severed head object
                if (this.headGroup) this.headGroup.visible = false;
                if (scene && managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                  const _shGeo  = new THREE.SphereGeometry(0.14, 6, 5);
                  const _shMat  = new THREE.MeshBasicMaterial({ color: this.mesh.material.color.getHex(), transparent: true, opacity: 0.9 });
                  const _shMesh = new THREE.Mesh(_shGeo, _shMat);
                  _shMesh.position.copy(this.mesh.position);
                  _shMesh.position.y = (this._headGroupBaseY || 0.42) + this.mesh.position.y;
                  scene.add(_shMesh);
                  const _svx = (Math.random() - 0.5) * 0.18;
                  const _svz = (Math.random() - 0.5) * 0.18;
                  let   _svy = 0.14;
                  const _sRx = 0.18 + Math.random() * 0.22;
                  const _sRz = (Math.random() - 0.5) * 0.12;
                  let _sLife = 300, _sBT = 0; // 300 frames ≈ 5 seconds at 60 fps
                  const _shFullScale = new THREE.Vector3(1, 1, 1);
                  const _shZeroScale = new THREE.Vector3(0, 0, 0);
                  managedAnimations.push({
                    update(_dt) {
                      _svy -= 0.007;
                      _shMesh.position.x += _svx;
                      _shMesh.position.y += _svy;
                      _shMesh.position.z += _svz;
                      _shMesh.rotation.x += _sRx;
                      _shMesh.rotation.z += _sRz;
                      if (_shMesh.position.y < 0.15) {
                        _shMesh.position.y = 0.15;
                        _svy = Math.abs(_svy) * 0.22;
                      }
                      _sBT++;
                      if (_sBT % 5 === 0) spawnBloodDecal({ x: _shMesh.position.x, y: 0, z: _shMesh.position.z });
                      if (_sBT % 12 === 0 && _sLife > 60) spawnParticles(_shMesh.position, 0x8B0000, 2);
                      _sLife--;
                      // Shrink linearly to zero over last 60 frames (1 second)
                      if (_sLife <= 60) {
                        _shMesh.scale.lerpVectors(_shFullScale, _shZeroScale, 1 - _sLife / 60);
                      }
                      // Fade out over the final 100 frames
                      _shMat.opacity = Math.max(0, Math.min(0.9, (_sLife / 100) * 0.9));
                      if (_sLife <= 0) { scene.remove(_shMesh); _shGeo.dispose(); _shMat.dispose(); return false; }
                      return true;
                    },
                    cleanup() { if (_shMesh.parent) scene.remove(_shMesh); _shGeo.dispose(); _shMat.dispose(); }
                  });
                }
                // Behavior change: headless = blind stumble (applied in update())
              } else if (_hitSegment === 'torso') {
                // Torso gone: squish body, reveal guts, spawn spinning torso chunk
                if (this.mesh && !this.isDead) this.mesh.scale.multiplyScalar(0.75);
                if (this._gutsContainer) {
                  this._gutsContainer.visible = true;
                  this._gutsExposed = true;
                }
                if (scene && managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                  const _tGeo  = new THREE.BoxGeometry(0.22, 0.28, 0.18);
                  const _tMat  = new THREE.MeshBasicMaterial({ color: 0x550022, transparent: true, opacity: 0.85 });
                  const _tMesh = new THREE.Mesh(_tGeo, _tMat);
                  _tMesh.position.copy(this.mesh.position);
                  _tMesh.position.y += 0.35;
                  scene.add(_tMesh);
                  const _tvx = (Math.random() - 0.5) * 0.22;
                  let   _tvy = 0.16;
                  const _tvz = (Math.random() - 0.5) * 0.22;
                  const _trX = (Math.random() - 0.5) * 0.28;
                  const _trZ = (Math.random() - 0.5) * 0.28;
                  let _tLife = 300; // 300 frames ≈ 5 seconds at 60 fps
                  const _tFullScale = new THREE.Vector3(1, 1, 1);
                  const _tZeroScale = new THREE.Vector3(0, 0, 0);
                  managedAnimations.push({
                    update(_dt) {
                      _tvy -= 0.010;
                      _tMesh.position.x += _tvx;
                      _tMesh.position.y += _tvy;
                      _tMesh.position.z += _tvz;
                      _tMesh.rotation.x += _trX;
                      _tMesh.rotation.z += _trZ;
                      if (_tMesh.position.y < 0.06) { _tMesh.position.y = 0.06; _tvy = Math.abs(_tvy) * 0.25; }
                      if (_tLife % 7 === 0) spawnBloodDecal({ x: _tMesh.position.x, y: 0, z: _tMesh.position.z });
                      _tLife--;
                      // Shrink linearly to zero over last 60 frames (1 second)
                      if (_tLife <= 60) {
                        _tMesh.scale.lerpVectors(_tFullScale, _tZeroScale, 1 - _tLife / 60);
                      }
                      // Fade out over the final 80 frames
                      _tMat.opacity = Math.max(0, Math.min(0.85, (_tLife / 80) * 0.85));
                      if (_tLife <= 0) { scene.remove(_tMesh); _tGeo.dispose(); _tMat.dispose(); return false; }
                      return true;
                    },
                    cleanup() { if (_tMesh.parent) scene.remove(_tMesh); _tGeo.dispose(); _tMat.dispose(); }
                  });
                }
              } else {
                // Base gone: hide it, enemy crawls at 50% speed
                if (this.baseGroup) this.baseGroup.visible = false;
                if (!this.originalSpeed) this.originalSpeed = this.speed;
                this.speed = this.originalSpeed * 0.5;
              }
            }

            // ── Show guts when torso HP drops below 50% (even before severing) ──
            if (_hitSegment === 'torso' && _seg.hp < 50 && !this._gutsExposed && this._gutsContainer) {
              this._gutsContainer.visible = true;
              this._gutsExposed = true;
            }
          }
        }

        // ── 5 BRUTAL GORE STATES on critical hits ──
        // Randomly apply one of 5 visual states so each crit feels uniquely brutal.
        if (isCrit && !this.isDead && this.mesh) {
          const goreState = Math.floor(Math.random() * 5);
          switch (goreState) {
            case 0: // Shoot off an eye — remove one eye instance (handled visually by hiding via scale)
              if (!this._shotEye) {
                this._shotEye = true;
                // Spawn a tiny sphere flying off sideways — geometry/material disposed after animation to avoid leaks
                if (scene) {
                  const eyeGeo = new THREE.SphereGeometry(0.07, 4, 4);
                  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
                  const flyEye = new THREE.Mesh(eyeGeo, eyeMat);
                  flyEye.position.copy(this.mesh.position);
                  flyEye.position.y += 0.5;
                  scene.add(flyEye);
                  const evx = (Math.random() - 0.5) * 0.25, evz = (Math.random() - 0.5) * 0.25;
                  let ef = 0;
                  const _animEye = () => {
                    if (++ef > 20 || !flyEye.parent) return;
                    flyEye.position.x += evx; flyEye.position.z += evz; flyEye.position.y += 0.05 - ef * 0.005;
                    requestAnimationFrame(_animEye);
                  };
                  _animEye();
                  // Dispose geometry and material after 400ms to prevent memory leaks
                  setTimeout(() => { if (flyEye.parent) scene.remove(flyEye); eyeGeo.dispose(); eyeMat.dispose(); }, 400);
                }
              }
              break;
            case 1: // Blast a hole through — add a dark hole decal on the enemy front face
              // Skip cosmetic bullet-hole Meshes when FPS is below ~45 (dt > 1/45 ≈ 0.022s)
              if (window._lastDt && window._lastDt > _DT_LOW_FPS) break;
              if (this.mesh && (!this.bulletHoles || this.bulletHoles.length < 8)) {
                if (!this.bulletHoles) this.bulletHoles = [];
                // PERF FIX: Use wound pool instead of new geometry per hit
                const cSlot = _acquireWound(true);
                if (cSlot) {
                  const hole = cSlot.mesh;
                  hole.position.set((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, 0.52);
                  this.mesh.add(hole);
                  cSlot.parentEnemy = this;
                  cSlot.maxTime = 10;
                  this.bulletHoles.push(hole);
                }
              }
              break;
            case 2: // Tear off a side chunk — squish/shear the enemy scale temporarily
              if (this.mesh && !this._toreChunk) {
                this._toreChunk = true;
                this.mesh.scale.set(0.82, 1.12, 0.88);
                setTimeout(() => { if (this.mesh && !this.isDead) this.mesh.scale.set(1, 1, 1); }, 300);
              }
              break;
            case 3: // Decapitate top half — shrink Y scale to squish upper body
              if (this.mesh && !this._decapitated) {
                this._decapitated = true;
                this.mesh.scale.y = 0.65;
                spawnParticles({ x: this.mesh.position.x, y: this.mesh.position.y + 0.8, z: this.mesh.position.z }, 0x8B0000, 12);
              }
              break;
            case 4: // Extreme arterial spurt — force an immediate spurt regardless of HP
              if (window.BloodSystem && window.BloodSystem.emitArterialSpurt) {
                const aDir = { x: Math.cos(Math.random() * Math.PI * 2), y: 0, z: Math.sin(Math.random() * Math.PI * 2) };
                window.BloodSystem.emitArterialSpurt(this.mesh.position, aDir, { pulses: 4, perPulse: 60, interval: 120, intensity: 1.0, coneAngle: 0.5 });
              } else {
                // Fallback: lots of blood particles
                spawnParticles(this.mesh.position, 0xFF0000, 20);
                spawnParticles({ x: this.mesh.position.x, y: this.mesh.position.y + 0.6, z: this.mesh.position.z }, 0xCC0000, 15);
              }
              break;
          }
        }

        // Knockback chain reaction — strong hits propagate to nearby enemies
        if (window.AdvancedPhysics && window.AdvancedPhysics.KnockbackChain && finalAmount > 10) {
          const knockForce = Math.min(finalAmount * 0.15, 8);
          window.AdvancedPhysics.KnockbackChain.add(this.mesh.position, knockForce, 3, 2);
        }

        // Multi-hit: chance to strike again for 50% damage
        if (playerStats.multiHitChance > 0 && !this.isDead && this.hp > 0 && Math.random() < playerStats.multiHitChance) {
          const multiHitDmg = Math.max(1, Math.floor(finalAmount * 0.5));
          this.hp -= multiHitDmg;
          // Feed into the batched accumulator so it appears in the same 100 ms window.
          this._accumulatedDamage = (this._accumulatedDamage || 0) + multiHitDmg;
          // If a deferred flush isn't already scheduled, schedule one now.
          this._scheduleDamageFlush();
        }

        // Life steal: heal player for a % of damage dealt
        if (playerStats.lifeStealPercent > 0) {
          const lifeStealHeal = finalAmount * playerStats.lifeStealPercent;
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + lifeStealHeal);
          updateHUD();
        }

        // Vampire class drain: handled via lifeStealPercent (set in level-up-system.js)
        // Additional drain for _vampireClass in case it was applied without lifeStealPercent
        if (window._vampireClass && !(playerStats.lifeStealPercent > 0) && playerStats.hp < playerStats.maxHp) {
          const drain = finalAmount * 0.08;
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + drain);
          updateHUD();
        }

        // Record damage dealt for milestone tracking
        if (window.GameMilestones) window.GameMilestones.recordDamageDealt(finalAmount);

        const hpPercent = this.hp / this.maxHp;
        const oldHpPercent = oldHp / this.maxHp;
        
        // 75% HP: Blood spots, darken color by 20%
        if (oldHpPercent >= 0.75 && hpPercent < 0.75 && !this.stage1Damage) {
          this.stage1Damage = true;
          
          // Darken color
          const currentColor = this.mesh.material.color;
          currentColor.r *= 0.8;
          currentColor.g *= 0.8;
          currentColor.b *= 0.8;
          
          // Blood spots (small red particles)
          spawnParticles(this.mesh.position, 0x8B0000, 10);
          playSound('hit');
        }
        
        // 50% HP: Add flesh/hole meshes
        if (oldHpPercent >= 0.5 && hpPercent < 0.5 && !this.stage2Damage) {
          this.stage2Damage = true;
          
          // Add visible wounds/holes using pool; for instanced enemies place at world pos since
          // the individual mesh isn't in the scene during combat
          for(let i=0; i<3; i++) {
            const slot = _acquireWound(false);
            if (!slot) continue;
            const hole = slot.mesh;
            if (this._usesInstancing) {
              hole.position.set(
                this.mesh.position.x + (Math.random() - 0.5) * 0.5,
                this.mesh.position.y + (Math.random() - 0.5) * 0.5,
                this.mesh.position.z + (Math.random() - 0.5) * 0.5
              );
              scene.add(hole);
              slot.maxTime = 8;
            } else {
              hole.position.set(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
              );
              this.mesh.add(hole);
              slot.parentEnemy = this;
              slot.maxTime = 8;
            }
          }
          
          spawnParticles(this.mesh.position, 0x8B0000, 8); // Reduced for performance
          playSound('hit');
        }
        
        // 25% HP: Heavy blood spray, walkSpeed *= 0.6
        if (oldHpPercent >= 0.25 && hpPercent < 0.25 && !this.stage3Damage) {
          this.stage3Damage = true;
          
          // Reduce speed
          this.speed *= 0.6;
          
          // Massive blood spray instead of big limb pieces
          const enemyColor = this.mesh.material.color.getHex();
          spawnParticles(this.mesh.position, 0x8B0000, 10);
          spawnParticles(this.mesh.position, 0xCC0000, 6);
          spawnParticles(this.mesh.position, 0x660000, 4);
          spawnParticles(this.mesh.position, enemyColor, 3);
          
          // Blood spray decals around (reduced for FPS)
          for (let i = 0; i < 3; i++) {
            spawnBloodDecal(this.mesh.position);
          }
          
          // Airborne blood bursts
          for (let b = 0; b < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; b++) {
            const p = new THREE.Mesh(
              new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 4, 4),
              new THREE.MeshBasicMaterial({ color: 0xAA0000 })
            );
            p.position.set(
              this.mesh.position.x + (Math.random() - 0.5) * 0.5,
              this.mesh.position.y + 0.2,
              this.mesh.position.z + (Math.random() - 0.5) * 0.5
            );
            scene.add(p);
            bloodDrips.push({
              mesh: p,
              velY: 0.18 + Math.random() * 0.25,
              life: 35 + Math.floor(Math.random() * 15)
            });
          }
          
          playSound('hit');
        }
        
        // 35% HP: Spawn flesh/limb chunks — enemy starts visibly tearing apart
        if (oldHpPercent >= 0.35 && hpPercent < 0.35 && !this.stage35Damage) {
          this.stage35Damage = true;
          if (scene && managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            const _tlCount = 2 + Math.floor(Math.random() * 2);
            for (let _tli = 0; _tli < _tlCount; _tli++) {
              const _tlSz = 0.06 + Math.random() * 0.08;
              const _tlGeo = new THREE.CapsuleGeometry(_tlSz * 0.4, _tlSz * 1.3, 3, 5);
              const _tlMat = new THREE.MeshBasicMaterial({ color: 0x660000, transparent: true, opacity: 0.88 });
              const _tlMesh = new THREE.Mesh(_tlGeo, _tlMat);
              _tlMesh.position.copy(this.mesh.position);
              _tlMesh.position.y += 0.2 + Math.random() * 0.3;
              scene.add(_tlMesh);
              let _tlVX = (Math.random() - 0.5) * 0.22, _tlVY = 0.14 + Math.random() * 0.16;
              let _tlVZ = (Math.random() - 0.5) * 0.22;
              let _tlRX = (Math.random() - 0.5) * 0.3, _tlRZ = (Math.random() - 0.5) * 0.3;
              let _tlLife = 120;
              managedAnimations.push({
                update() {
                  _tlVY -= 0.010;
                  _tlMesh.position.x += _tlVX; _tlMesh.position.y += _tlVY; _tlMesh.position.z += _tlVZ;
                  _tlMesh.rotation.x += _tlRX; _tlMesh.rotation.z += _tlRZ;
                  if (_tlMesh.position.y < 0.07) {
                    _tlMesh.position.y = 0.07; _tlVY = Math.abs(_tlVY) * 0.2;
                    _tlVX *= 0.72; _tlVZ *= 0.72;
                    spawnBloodDecal(_tlMesh.position);
                  }
                  _tlLife--;
                  _tlMat.opacity = Math.max(0, (_tlLife / 80) * 0.88);
                  if (_tlLife <= 0) { scene.remove(_tlMesh); _tlGeo.dispose(); _tlMat.dispose(); return false; }
                  return true;
                },
                cleanup() { if (_tlMesh.parent) scene.remove(_tlMesh); _tlGeo.dispose(); _tlMat.dispose(); }
              });
            }
          }
          if (window.BloodSystem && window.BloodSystem.emitBurst) {
            window.BloodSystem.emitBurst(this.mesh.position, 30, { spreadXZ: 1.0, spreadY: 0.3 });
          }
          spawnParticles(this.mesh.position, 0x8B0000, 8);
          spawnBloodDecal(this.mesh.position);
        }
        
        // Destruction effect at 20% HP threshold — covered in blood, near death
        if (oldHpPercent >= 0.2 && hpPercent < 0.2 && !this.isDamaged) {
          this.isDamaged = true;
          
          // Visually damage the enemy - make smaller
          const damagePercent = 0.35 + Math.random() * 0.15; // 35-50%
          const newScale = 1 - damagePercent;
          this.mesh.scale.multiplyScalar(newScale);
          
          // Heavy blood spray instead of big broken pieces
          spawnParticles(this.mesh.position, 0x8B0000, 18);
          spawnParticles(this.mesh.position, 0xCC0000, 12);
          spawnParticles(this.mesh.position, 0x440000, 8);
          
          // Blood pools around enemy
          for (let i = 0; i < 8; i++) {
            spawnBloodDecal(this.mesh.position);
          }
          
          playSound('hit');
        }
        
        // Enhanced splash particles using enemy's own color
        const enemyColor = this.mesh.material.color.getHex();
        const particleCount = isCrit ? 8 : 3;
        spawnParticles(this.mesh.position, enemyColor, particleCount);
        
        // Blood spray on every hit — more blood as enemy takes more damage
        const bloodIntensity = Math.ceil((1 - hpPercent) * 6) + 1;
        spawnParticles(this.mesh.position, 0x8B0000, Math.min(bloodIntensity, 6));
        if (hpPercent < 0.6) {
          spawnBloodDecal(this.mesh.position);
        }
        if (hpPercent < 0.3) {
          spawnBloodDecal(this.mesh.position);
          spawnParticles(this.mesh.position, 0xCC0000, 3);
        }
        
        // Additional impact particles
        if (isCrit) {
          spawnParticles(this.mesh.position, enemyColor, 5);
          spawnParticles(this.mesh.position, 0xFFFFFF, 3);
          spawnBloodDecal(this.mesh.position);
        }
        
        // Water-balloon squishy hit reaction — consistent squish with bounce-back overshoot
        if (!this._squishTimer) {
          const isShotgun = damageType === 'doubleBarrel' || damageType === 'shotgun';
          const isHeavy = isCrit || isShotgun;
          // Phase 1: Hit frame squish (water balloon impact)
          const sy = isCrit ? 0.5 : 0.6;
          const sxz = isCrit ? 1.45 : 1.35;
          // Clamp scale to prevent explosively large or NaN values under rapid fire (e.g. minigun)
          const _rawSX = this.mesh.scale.x * sxz;
          const _rawSY = this.mesh.scale.y * sy;
          const _rawSZ = this.mesh.scale.z * sxz;
          this.mesh.scale.set(
            Math.max(0.1, Math.min(3.0, isNaN(_rawSX) ? 1.0 : _rawSX)),
            Math.max(0.1, Math.min(3.0, isNaN(_rawSY) ? 1.0 : _rawSY)),
            Math.max(0.1, Math.min(3.0, isNaN(_rawSZ) ? 1.0 : _rawSZ))
          );
          // Phase 2: Lerp back to (1,1,1) over 150ms
          this._squishTimer = setTimeout(() => {
            if (this.mesh && !this.isDead) {
              this.mesh.scale.set(1, 1, 1);
              // Phase 3: Bounce-back overshoot — tall then settle
              this.mesh.scale.set(0.92, 1.15, 0.92);
              this._squishTimer = setTimeout(() => {
                if (this.mesh && !this.isDead) this.mesh.scale.set(1, 1, 1);
                this._squishTimer = null;
              }, 60);
            } else {
              this._squishTimer = null;
            }
          }, 150);
          if (isHeavy) {
            spawnParticles(this.mesh.position, 0xAA0000, 4);
            spawnBloodDecal(this.mesh.position);
          }
        }

        // ── SNIPER: violent instant backward snap ──────────────────────────────
        if ((damageType === 'sniperRifle' || damageType === '50cal') && this.mesh && !this.isDead) {
          this.mesh.rotation.x = -1.5; // Violent punch-through snap backward
          setTimeout(() => {
            if (this.mesh && !this.isDead) this.mesh.rotation.x = 0;
          }, 350);
        }

        // ── FIRE / PLASMA: Char & Melt hit reaction ─────────────────────────────────
        // Permanently lerp material color towards charred black. Spawn black smoke particles.
        if ((damageType === 'fire' || damageType === 'plasma') && this.mesh && this.mesh.material && !this.isDead) {
          // Clone shared material before mutating so charring doesn't affect all enemies of this type
          if (this.mesh.material._isShared) {
            this.mesh.material = this.mesh.material.clone();
            this.mesh.material._isShared = false;
          }
          if (!this._charStartColor) this._charStartColor = this.mesh.material.color.clone();
          const _hpRatio = Math.max(0, this.hp / this.maxHp);
          const _charAmt = (1.0 - _hpRatio) * 0.85;
          if (!Enemy._charBlackColor) Enemy._charBlackColor = new THREE.Color(0x111111);
          this.mesh.material.color.copy(this._charStartColor).lerp(Enemy._charBlackColor, _charAmt);
          this.mesh.material.needsUpdate = true;
          // Black smoke rising from the burning flesh
          if (typeof smokeParticles !== 'undefined' && typeof MAX_SMOKE_PARTICLES !== 'undefined' &&
              smokeParticles.length < MAX_SMOKE_PARTICLES && scene) {
            if (typeof _ensureSmokePool === 'function') _ensureSmokePool();
            const _smokeEntry = (typeof _smokePool !== 'undefined' && _smokePool) ? _smokePool.get() : (() => {
              const _sg = new THREE.SphereGeometry(0.09, 5, 5);
              const _sm = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5 });
              const _s  = new THREE.Mesh(_sg, _sm);
              return { mesh: _s, material: _sm, geometry: _sg, velocity: { x: 0, y: 0, z: 0 }, life: 0, maxLife: 30 };
            })();
            _smokeEntry.mesh.position.copy(this.mesh.position);
            _smokeEntry.mesh.position.y += 0.2 + Math.random() * 0.5;
            _smokeEntry.velocity.x = (Math.random()-0.5)*0.02;
            _smokeEntry.velocity.y = 0.025+Math.random()*0.02;
            _smokeEntry.velocity.z = (Math.random()-0.5)*0.02;
            _smokeEntry.life = 30;
            _smokeEntry.maxLife = 30;
            if (_smokeEntry.material && _smokeEntry.material.color) {
              _smokeEntry.material.color.setHex(0x111111);
              _smokeEntry.material.opacity = 0.5;
            }
            _smokeEntry.mesh.visible = true;
            if (!_smokeEntry.mesh.parent && scene) scene.add(_smokeEntry.mesh);
            smokeParticles.push(_smokeEntry);
          }
        }

        // ── ELECTRIC / LIGHTNING: Nervous System Spasm hit reaction ─────────────────
        // Hijack locomotion: jitter X/Z, freeze forward velocity 0.5 s, flash white.
        if ((damageType === 'lightning' || damageType === 'electric') && this.mesh && !this.isDead) {
          this.mesh.position.x += (Math.random() - 0.5) * 0.4;
          this.mesh.position.z += (Math.random() - 0.5) * 0.4;
          this._lightningFreezeUntil = Date.now() + 500;
          this._lastMoveVX = 0;
          this._lastMoveVZ = 0;
          if (this.mesh.material && !this._lightningFlashTimer) {
            // Clone shared material before modifying so flash doesn't affect all enemies
            if (this.mesh.material._isShared) {
              this.mesh.material = this.mesh.material.clone();
              this.mesh.material._isShared = false;
            }
            const _preFlash = this.mesh.material.color.clone();
            this.mesh.material.color.setHex(0xFFFFFF);
            this.mesh.material.needsUpdate = true;
            this._lightningFlashTimer = setTimeout(() => {
              if (this.mesh && this.mesh.material && !this.isDead) {
                this.mesh.material.color.copy(_preFlash);
                this.mesh.material.needsUpdate = true;
              }
              this._lightningFlashTimer = null;
            }, 130);
          }
        }

        // ─── TRAUMA SYSTEM INTEGRATION ───────────────────────────────────────────────
        // Weapon-specific wound decals and gore reactions
        if (window.TraumaSystem && hitPoint) {
          // Get weapon level for intensity scaling
          const wl = (typeof weapons !== 'undefined' && weapons) || {};
          let weaponLevel = 1;
          if (damageType === 'gun' || damageType === 'physical') weaponLevel = (wl.gun && wl.gun.level) || 1;
          else if (damageType === 'drone') weaponLevel = (wl.droneTurret && wl.droneTurret.level) || 1;
          else if (damageType === 'sword' || damageType === 'samuraiSword') weaponLevel = (wl.sword && wl.sword.level) || (wl.samuraiSword && wl.samuraiSword.level) || 1;
          else if (damageType === 'shotgun' || damageType === 'doubleBarrel' || damageType === 'pumpShotgun' || damageType === 'autoShotgun') weaponLevel = (wl.shotgun && wl.shotgun.level) || (wl.doubleBarrel && wl.doubleBarrel.level) || 1;
          else if (damageType === 'bow') weaponLevel = (wl.bow && wl.bow.level) || 1;
          else if (damageType === 'iceSpear') weaponLevel = (wl.iceSpear && wl.iceSpear.level) || 1;

          // Check if hit is near existing wound (aggravation system)
          const nearbyWound = TraumaSystem.findNearbyWound(this, hitPoint);

          if (nearbyWound) {
            // Aggravate existing wound
            const chunkTornOff = TraumaSystem.aggravateWound(nearbyWound, hitPoint, weaponLevel);
            if (chunkTornOff && typeof createFloatingText === 'function') {
              createFloatingText('CHUNK TORN!', hitPoint, '#FF0000');
            }
          } else {
            // Create new wound decal
            TraumaSystem.addWoundDecal(this, hitPoint, damageType);
          }

          // Weapon-specific hit effects
          const SHOTGUN_TYPES = ['shotgun', 'doubleBarrel', 'pumpShotgun', 'autoShotgun'];
          const SWORD_TYPES = ['sword', 'samuraiSword', 'teslaSaber', 'whip'];
          const BOW_TYPES = ['bow', 'iceSpear'];
          const GUN_TYPES = ['gun', 'physical', 'uzi', 'minigun', 'sniperRifle', 'drone'];

          // ── GUN/TURRET: Bullet holes, exit wounds, pierce-through ──────────────────
          if (GUN_TYPES.includes(damageType)) {
            // Add small circular bullet hole wound decal
            TraumaSystem.addWoundDecal(this, hitPoint, 'bullethole');

            // High-level weapons (10+): Exit wound on opposite side
            if (weaponLevel >= 10 && hitDir) {
              const exitPos = hitPoint.clone();
              // Calculate exit wound position on opposite side of enemy
              const enemyRadius = 0.4; // Approximate enemy radius
              exitPos.x += (hitDir.vx || 0) * enemyRadius * 2;
              exitPos.y += (hitDir.vy || 0) * enemyRadius * 2;
              exitPos.z += (hitDir.vz || 0) * enemyRadius * 2;
              // Larger wound for exit
              TraumaSystem.addWoundDecal(this, exitPos, 'exitwound');

              // Blood spray from exit wound
              if (window.BloodSystem && window.BloodSystem.emitBurst) {
                window.BloodSystem.emitBurst(exitPos, 20, {
                  spreadXZ: 0.8,
                  spreadY: 0.4,
                  direction: { x: hitDir.vx || 0, y: 0, z: hitDir.vz || 0 }
                });
              }
            }

            // Very high-level weapons (20+): Pierce through multiple enemies
            // (This will be handled in the weapon projectile logic, not here)
            if (weaponLevel >= 20) {
              // Flag this hit for pierce-through (weapon system will use this)
              this._lastHitCanPierce = true;
            }

            // Track bullet hole locations for corpse blood pump
            if (!this._bulletHoles) this._bulletHoles = [];
            this._bulletHoles.push({
              pos: hitPoint.clone(),
              dir: hitDir ? { x: hitDir.vx || 0, y: 0, z: hitDir.vz || 0 } : { x: 0, y: 0, z: 1 }
            });
          }

          // Shotgun: Multiple scattered wounds
          if (SHOTGUN_TYPES.includes(damageType)) {
            const woundCount = 3 + Math.floor(Math.random() * 5); // 3-8 wounds
            for (let i = 0; i < woundCount; i++) {
              const scatterPos = hitPoint.clone();
              scatterPos.x += (Math.random() - 0.5) * 0.4;
              scatterPos.y += (Math.random() - 0.5) * 0.3;
              scatterPos.z += (Math.random() - 0.5) * 0.4;
              TraumaSystem.addWoundDecal(this, scatterPos, damageType);
            }
          }

          // ── MELEE/SWORD: Diagonal slash decals ─────────────────────────────────────
          if (SWORD_TYPES.includes(damageType)) {
            // Add elongated slash wound decal
            TraumaSystem.addWoundDecal(this, hitPoint, 'slash');

            // Blood spray along slash arc
            if (window.BloodSystem && window.BloodSystem.emitBurst) {
              window.BloodSystem.emitBurst(hitPoint, 25 + weaponLevel * 5, {
                spreadXZ: 0.6,
                spreadY: 0.2,
                direction: hitDir ? { x: hitDir.vx || 0, y: 0, z: hitDir.vz || 0 } : null
              });
            }

            // High-level melee (10+): Deep slash with multiple wound decals along the cut line
            if (weaponLevel >= 10 && hitDir) {
              const slashLength = 0.6;
              const slashSegments = 3;
              for (let i = 1; i <= slashSegments; i++) {
                const segmentPos = hitPoint.clone();
                const perpX = -(hitDir.vz || 0); // Perpendicular to hit direction
                const perpZ = (hitDir.vx || 0);
                const offset = (i / slashSegments - 0.5) * slashLength;
                segmentPos.x += perpX * offset;
                segmentPos.z += perpZ * offset;
                segmentPos.y += (Math.random() - 0.5) * 0.2;
                TraumaSystem.addWoundDecal(this, segmentPos, 'slash');
              }
            }

            // Track slash direction for kill animation
            if (!this._slashDirection && hitDir) {
              this._slashDirection = { x: hitDir.vx || 0, y: 0, z: hitDir.vz || 0 };
            }
          }

          // Bow/Arrow: Stick arrow in enemy at hit location
          if (BOW_TYPES.includes(damageType) && weaponLevel >= 1) {
            const arrowDir = hitDir ? new THREE.Vector3(hitDir.vx || 0, 0, hitDir.vz || 0).normalize()
                                    : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();

            // Level 10+: PIERCE-THROUGH with flesh chunk — arrow goes completely through
            if (weaponLevel >= 10) {
              // Create flesh chunk at exit wound
              const exitPoint = hitPoint.clone();
              exitPoint.x += arrowDir.x * 0.5; // Exit on opposite side
              exitPoint.z += arrowDir.z * 0.5;

              if (window.TraumaSystem && window.TraumaSystem.tearOffFleshChunk) {
                window.TraumaSystem.tearOffFleshChunk(this, exitPoint, arrowDir, 0.12);

                // Extra blood spray for pierce-through
                if (window.BloodSystem && window.BloodSystem.emitBurst) {
                  window.BloodSystem.emitBurst(exitPoint, 30, {
                    spreadXZ: 0.5,
                    spreadY: 0.2,
                    direction: { x: arrowDir.x, y: 0, z: arrowDir.z }
                  });
                }

                // Create entry and exit wound decals
                TraumaSystem.addWoundDecal(this, hitPoint, 'bullethole'); // Entry wound
                TraumaSystem.addWoundDecal(this, exitPoint, 'bullethole'); // Exit wound

                // Visual feedback
                if (typeof createFloatingText === 'function') {
                  createFloatingText('PIERCE!', hitPoint, '#FFAA00');
                }
              }

              // Arrow continues through (but we still show it stuck for visual clarity)
              TraumaSystem.stickArrowInEnemy(this, hitPoint, arrowDir, damageType);
            } else {
              // Normal arrow stick (levels 1-9)
              TraumaSystem.stickArrowInEnemy(this, hitPoint, arrowDir, damageType);
            }
          }

          // ── 180 SPIN DEATH: 15% chance on high-impact hits ─────────────────────────
          // High-impact hits trigger a dramatic 180° spin with blood arc
          const HIGH_IMPACT_TYPES = [...SHOTGUN_TYPES, ...GUN_TYPES, 'drone', 'meteor', 'missile'];
          const isHighImpact = HIGH_IMPACT_TYPES.includes(damageType) && weaponLevel >= 5;

          if (isHighImpact && Math.random() < 0.15 && this.hp - finalAmount <= 0) {
            // Flag this enemy for 180 spin death animation
            this._spinDeathTriggered = true;
            this._spinDeathDirection = hitDir ? { x: hitDir.vx || 0, y: 0, z: hitDir.vz || 0 } : null;
          }
        }

        // Weapon-specific trauma effects
        if (window.TraumaSystem) {
          var _eColor = _getEnemyBloodColor(this);
          if (damageType === 'shotgun' || damageType === 'doubleBarrel' || damageType === 'pumpShotgun' || damageType === 'autoShotgun') {
            if (hitPoint) {
              var _blastDir = { x: 0, z: 0 };
              if (this.mesh) {
                var _px = hitPoint.x - this.mesh.position.x;
                var _pz = hitPoint.z - this.mesh.position.z;
                var EPSILON_DISTANCE = 0.001; // avoid division-by-zero when hit is exactly at enemy center
                var _pl = Math.sqrt(_px*_px + _pz*_pz) + EPSILON_DISTANCE;
                _blastDir.x = _px/_pl; _blastDir.z = _pz/_pl;
              }
              window.TraumaSystem.shotgunBlast(hitPoint, _blastDir, _eColor);
            }
          } else if (damageType === 'sword' || damageType === 'samuraiSword' || damageType === 'teslaSaber') {
            if (hitPoint) {
              var _sax = this._slashDirection ? this._slashDirection.x : 1;
              var _saz = this._slashDirection ? this._slashDirection.z : 0;
              window.TraumaSystem.swordCleave(hitPoint, _sax, _saz, _eColor);
            }
          } else if (damageType === 'meteor' || damageType === 'rocket' || damageType === 'grenade') {
            if (this.mesh) {
              var _gpos = this.mesh.position;
              window.TraumaSystem.explosiveGib({ x: _gpos.x, y: _gpos.y, z: _gpos.z }, _eColor);
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────────────────

        if (this.hp <= 0) {
          this.die();
        }
      }

      die() {
        const _enemyInst = this; // captured for object pool release at animation end
        this.isDead = true;
        this.active = false; // Prevent further hit detection on dying enemy
        this._deathTimestamp = Date.now();
        // Trigger spider death animation — sprite plays its die sequence before disposal
        if (this._spiderSprite) {
          this._spiderSprite.playDeath(() => { /* sprite hides itself when done */ });
        }
        // Register kill for combat intensity tracking (dynamic shadow quality)
        if (typeof window.registerCombatKill === 'function') window.registerCombatKill();
        // Record kill milestone progress
        if (window.GameMilestones) window.GameMilestones.recordKill();
        // Grant Account XP for kill — strict economy: Normal=1, Elite/MiniBoss=5, Boss=10
        const _isBossKill  = !!this.isFlyingBoss;  // FlyingBoss (type 11): top-tier boss, 10 XP
        const _isEliteKill = !!this.isMiniBoss;    // MiniBoss / Annunaki (types 10, 19): elite, 5 XP
        const xpAmount = _isBossKill ? 10 : (_isEliteKill ? 5 : 1);
        if (typeof addAccountXP === 'function') {
          addAccountXP(xpAmount);
        } else if (window.GameAccount && typeof window.GameAccount.addXP === 'function' && window.saveData) {
          window.GameAccount.addXP(xpAmount, 'Enemy Kill', window.saveData);
        }
        // Track per-run kill type for end screen
        if (window.currentRunStats) {
          if (_isBossKill)       window.currentRunStats.bossKills++;
          else if (_isEliteKill) window.currentRunStats.eliteKills++;
          else                   window.currentRunStats.normalKills++;
          window.currentRunStats.xpFromKills += xpAmount;
        }
        // Discover Codex entry on first kill of each enemy type
        if (window.CodexSystem) {
          const _t = this.typeIndex;
          const _typeMap = {
            0: 'enemy_tank', 1: 'enemy_fast', 2: 'enemy_balanced', 3: 'enemy_slow',
            4: 'enemy_ranged', 5: 'enemy_flying', 6: 'enemy_hardtank', 7: 'enemy_hardfast',
            8: 'enemy_elite'
          };
          if (_typeMap[_t]) window.CodexSystem.discover(_typeMap[_t]);
          if (this.isBoss && !this.isFlyingBoss) window.CodexSystem.discover('enemy_miniboss');
          if (this.isFlyingBoss) window.CodexSystem.discover('enemy_flyingboss');
        }
        // Clear freeze state so no further update logic applies to dead enemy
        this.isFrozen = false;
        // Cancel pending squish timeout to prevent callback on dead enemy
        if (this._squishTimer) {
          clearTimeout(this._squishTimer);
          this._squishTimer = null;
          // Reset scale so death animation starts from a clean (1,1,1) state
          if (this.mesh) this.mesh.scale.set(1, 1, 1);
        }
        // Cancel pending lightning-flash timeout to prevent color restore on dead enemy
        if (this._lightningFlashTimer) {
          clearTimeout(this._lightningFlashTimer);
          this._lightningFlashTimer = null;
        }
        // Cancel pending drone shake interval to prevent timer leak
        if (this._droneShakeTimer) {
          clearInterval(this._droneShakeTimer);
          this._droneShakeTimer = null;
        }
        // Cancel freeze-thaw shake interval so it cannot fire against a pooled
        // enemy after die() has been called.
        if (this._shakeInterval) {
          clearInterval(this._shakeInterval);
          this._shakeInterval = null;
        }
        // Cancel shotgun slide and clear velocity to prevent movement on dead enemy
        this._shotgunSlide = null;
        // Cancel pending phase timer to prevent it from mutating a recycled enemy's
        // material opacity/transparency after this enemy has been returned to the pool.
        if (this._phaseClearTimer) {
          clearTimeout(this._phaseClearTimer);
          this._phaseClearTimer = null;
        }
        // Cancel pending damage-flush timer to prevent floating text on dead enemy.
        if (this._damageFlushTimer) {
          clearTimeout(this._damageFlushTimer);
          this._damageFlushTimer = null;
        }
        
        // Hide ground shadow for the duration of the death animation.
        // With pooling the shadow mesh is kept alive and restored on reuse;
        // without pooling it is removed and disposed as before.
        if (this.groundShadow) {
          if (window.enemyPool) {
            this.groundShadow.visible = false;
          } else {
            scene.remove(this.groundShadow);
            this.groundShadow.geometry.dispose();
            this.groundShadow.material.dispose();
            this.groundShadow = null;
          }
        }
        
        // Clone position NOW before any mesh removal or disposal to prevent
        // race condition where position becomes undefined after scene.remove/dispose
        if (!this.mesh) return;
        // If this enemy was rendered via instancing, add its mesh to the scene
        // now so the death animation (fall/splatter) is visible.
        if (this._usesInstancing) {
          // Scale correction: the proxy mesh uses SHARED_GEO.sphere (radius 1) for types 0 and 2,
          // but the instanced renderer renders them with smaller geometry:
          //   type 0 (tank)     → SphereGeometry(0.6)        → deathScale 0.60
          //   type 1 (fast)     → CapsuleGeometry(0.3, 0.8)  → deathScale 0.71 (≈ 0.3/0.42)
          //   type 2 (balanced) → DodecahedronGeometry(0.5)  → deathScale 0.50
          // Without this correction the death mesh appears as a large "big ball".
          const _INSTANCED_DEATH_SCALE = { 0: 0.60, 1: 0.71, 2: 0.50 };
          const deathScale = _INSTANCED_DEATH_SCALE[this.type];
          if (deathScale !== undefined) this.mesh.scale.setScalar(deathScale);
          scene.add(this.mesh);
          this._usesInstancing = false;
        }
        const deathPos = this.mesh.position.clone();
        
        // Track kills for active quests
        if (montanaQuest.active) {
          montanaQuest.kills++;
          if (typeof updateMontanaQuestUI === 'function') {
            updateMontanaQuestUI();
          }
        }
        if (eiffelQuest.active) {
          eiffelQuest.kills++;
          if (typeof updateEiffelQuestUI === 'function') {
            updateEiffelQuestUI();
          }
        }
        
        // Determine death effect based on damage type and health when dying
        const damageType = this.lastDamageType || 'physical';
        const enemyColor = (this.mesh.material && this.mesh.material.color)
          ? this.mesh.material.color.getHex()
          : (_ENEMY_COLORS[this.type] !== undefined ? _ENEMY_COLORS[this.type] : DEFAULT_ENEMY_COLOR);
        // Detect yellow/gold enemy for special spin death (type 7=HardFast gold, type 10=MiniBoss gold)
        const isYellowEnemy = (this.type === 7 || this.type === 10);

        // ── SOURCE GLITCH: instant deletion — no death animation, no blood ──
        if (this.type === 20) {
          // Drop Corrupted Source Code before removing mesh
          if (this.dropsCorruptedSourceCode) {
            if (!saveData.cutGems) saveData.cutGems = [];
            const _cscGem = {
              id: 'csc_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
              type: 'corruptedSource',
              rarity: 'corrupted',
              slottedIn: null
            };
            saveData.cutGems.push(_cscGem);
            if (typeof saveSaveData === 'function') saveSaveData();
            if (typeof createFloatingText === 'function') {
              createFloatingText('💀 CORRUPTED SOURCE CODE', deathPos, '#FF00FF');
            }
            if (window.pushSuperStatEvent) {
              window.pushSuperStatEvent('💀 Corrupted Source Code', 'corrupted', '💀', 'success');
            }
          }
          // Instant vanish — digital glitch particles
          if (typeof spawnParticles === 'function') {
            spawnParticles(deathPos, 0xFF00FF, 15);
            spawnParticles(deathPos, 0x00FFFF, 10);
            spawnParticles(deathPos, 0xFFFFFF, 8);
          }
          // Remove mesh immediately with no death animation
          if (window.enemyPool) {
            window.enemyPool._return(this);
          } else {
            scene.remove(this.mesh);
          }
          this._skipMainDeathAnim = true;
          // Spawn XP (generous amount for the rare encounter)
          spawnExp(deathPos.x, deathPos.z, 'physical', 1.0, this.type);
          spawnExp(deathPos.x + 0.5, deathPos.z + 0.5, 'physical', 1.0, this.type);
          spawnExp(deathPos.x - 0.5, deathPos.z - 0.5, 'physical', 1.0, this.type);
        } else {
        // Trigger kill cam effect for varied visual feedback
        triggerKillCam(this.mesh.position, this.isMiniBoss, damageType);
        
        // Arterial spurt on death — blood jets pump from the neck/chest wound
        // Skip for elemental deaths (fire/lightning/poison) that have their own dissolution effects
        if (window.BloodSystem && window.BloodSystem.emitArterialSpurt &&
            damageType !== 'fire' && damageType !== 'lightning' && damageType !== 'poison') {
          // Randomize direction angle and elevation so every death looks unique
          const _spurtAngle = Math.random() * Math.PI * 2;
          const _spurtLift = 0.15 + Math.random() * 0.55; // varied elevation (0.15–0.70)
          const _spurtXZ = Math.sqrt(Math.max(0, 1 - _spurtLift * _spurtLift));
          const spurtDir = {
            x: Math.cos(_spurtAngle) * _spurtXZ,
            y: _spurtLift,
            z: Math.sin(_spurtAngle) * _spurtXZ
          };
          // Miniboss/boss get more dramatic spurts; vary pulse count and pressure per death
          const spurtPulses   = (this.isMiniBoss || this.isFlyingBoss) ? 12 : (6 + Math.floor(Math.random() * 5));
          const spurtPerPulse = (this.isMiniBoss || this.isFlyingBoss) ? 150 : (60 + Math.floor(Math.random() * 50));
          const _spurtInterval = 120 + Math.floor(Math.random() * 80); // 120–200 ms between pulses
          const _spurtIntensity = 0.7 + Math.random() * 0.6; // 0.7–1.3 pressure multiplier
          window.BloodSystem.emitArterialSpurt(deathPos, spurtDir, {
            pulses: spurtPulses, perPulse: spurtPerPulse, interval: _spurtInterval, intensity: _spurtIntensity
          });
        }

        // Special death effects based on damage type
        // Check for "Glide & Spin" death: enemy killed while moving fast (not elemental/special)
        const _mvX = this._lastMoveVX || 0;
        const _mvZ = this._lastMoveVZ || 0;
        const _moveSpeed = Math.sqrt(_mvX * _mvX + _mvZ * _mvZ);
        const _isGlideSpinCandidate = _moveSpeed > 0.035 &&
          damageType !== 'fire' && damageType !== 'ice' && damageType !== 'lightning' &&
          damageType !== 'headshot' && damageType !== 'aura' && damageType !== 'poison' &&
          !this.isMiniBoss && !this.isFlyingBoss;

        // ─── TRAUMA SYSTEM: 180 SPIN DEATH (15% chance on high-impact kills) ───────
        if (this._spinDeathTriggered) {
          this.dieBySpinDeath(enemyColor);
        } else if (isYellowEnemy && damageType !== 'ice' && damageType !== 'fire' && damageType !== 'headshot') {
          // Yellow enemies: 180-degree spin death with continuous neck blood arc
          this.dieBySpinDeath(enemyColor);
        } else if (_isGlideSpinCandidate && (damageType === 'gun' || damageType === 'physical' || damageType === 'uzi' || damageType === 'minigun' || damageType === 'sniperRifle' || damageType === 'drone' || damageType === 'shotgun' || damageType === 'doubleBarrel') && Math.random() < 0.55) {
          // Fast-moving enemy killed by ballistic/gun weapon — Glide & Spin death
          this.dieByGlideSpin(enemyColor, _mvX / (_moveSpeed || 1), _mvZ / (_moveSpeed || 1), _moveSpeed);
        } else if (damageType === 'gun' || damageType === 'physical' || damageType === 'uzi' || damageType === 'minigun' || damageType === 'sniperRifle' || damageType === 'drone') {
          // Gun/Turret death: stumble backward, blood pump from bullet holes
          this.dieByGunshot(enemyColor);
        } else if (damageType === 'fire') {
          // Fire death: Char and ash
          this.dieByFire(enemyColor);
        } else if (damageType === 'ice') {
          // Ice death: Shatter into ice shards
          this.dieByIce(enemyColor);
        } else if (damageType === 'lightning') {
          // Lightning death: Blackened and smoke
          this.dieByLightning(enemyColor);
        } else if (damageType === 'meteor' || damageType === 'homingMissile' || damageType === 'fireball') {
          // Meteor/Missile death: Crushing impact, flatten enemy into crater
          this.dieByMeteor(enemyColor);
        } else if (damageType === 'shotgun' || damageType === 'doubleBarrel') {
          // Shotgun / double barrel death: Massive gibs explosion
          this.dieByShotgun(enemyColor);
        } else if (damageType === 'headshot') {
          // Headshot: Specific head explosion
          this.dieByHeadshot(enemyColor);
        } else if (damageType === 'drone') {
          // Drone death: riddled with tiny holes and blood mist spray
          this.dieByDrone(enemyColor);
        } else if (damageType === 'sword' || damageType === 'whip' || damageType === 'samuraiSword') {
          // Sword/whip/samurai death: slash wounds with immediate blood flow and visual slice
          this.dieBySword(enemyColor);
        } else if (damageType === 'aura') {
          // Aura death: burnt flesh, boiling blood effects
          this.dieByAura(enemyColor);
        } else if (damageType === 'poison') {
          // Poison death: dissolve in green toxic melt
          this.dieByPoison(enemyColor);
        } else {
          // Standard death — Geyser Rollover: rolls onto back with 3-second heartbeat bleed-out
          this.dieGeyserRollover(enemyColor);
        }

        // TraumaSystem death gore
        // Shotgun-family deaths already emit full TraumaSystem gore inside dieByShotgun(),
        // so skip the generic shotgunBlast here to avoid double-spawning effects.
        var _shotgunDeathHandledByMethod =
          damageType === 'shotgun' ||
          damageType === 'doubleBarrel' ||
          damageType === 'pumpShotgun' ||
          damageType === 'autoShotgun';
        if (window.TraumaSystem && !_shotgunDeathHandledByMethod) {
          var _deathColor = _getEnemyBloodColor(this);
          var _deathPos = this.mesh ? this.mesh.position : null;
          if (_deathPos) {
            if (damageType === 'meteor' || damageType === 'rocket' || damageType === 'grenade') {
              window.TraumaSystem.explosiveGib({ x: _deathPos.x, y: _deathPos.y, z: _deathPos.z }, _deathColor);
            }
          }
        }
        
        // Screen flash on kill (dopamine boost) - stronger flash for mini-boss
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.background = this.isFlyingBoss ? 'rgba(139, 0, 139, 0.4)' : (this.isMiniBoss ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255, 255, 255, 0.2)');
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '500';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), (this.isMiniBoss || this.isFlyingBoss) ? 100 : 50);
        // Hit-stop: mini-boss and flying-boss deaths get the longest freeze
        if ((this.isMiniBoss || this.isFlyingBoss) && window.triggerHitStop) window.triggerHitStop(80);
        
        // Blood spray on death — visceral pumping wound blood
        // Skip entirely for elemental deaths that have their own dissolution effects
        const _suppressDeathBlood = damageType === 'fire' || damageType === 'lightning' || damageType === 'poison';
        const isShotgunKill = damageType === 'shotgun' || damageType === 'doubleBarrel';
        const isHeadshotKill = damageType === 'headshot';
        if (!_suppressDeathBlood) {
        const deathBloodMult = this.isMiniBoss ? 2.0 : (isShotgunKill ? 1.8 : 1.0);
        spawnParticles(this.mesh.position, 0x8B0000, Math.floor(14 * deathBloodMult));
        spawnParticles(this.mesh.position, 0xCC0000, Math.floor(8 * deathBloodMult));
        spawnParticles(this.mesh.position, 0x660000, Math.floor(6 * deathBloodMult));
        spawnParticles(this.mesh.position, 0xAA0000, Math.floor(4 * deathBloodMult));
        // Wound blood burst — directional spray
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, Math.floor((this.isMiniBoss ? 600 : 350) * deathBloodMult), { spreadXZ: 2.0, spreadY: 0.5, minSize: 0.02, maxSize: 0.12, minLife: 50, maxLife: 100 });
          // Pumping blood — pulses simulating heartbeat pumping out
          window.BloodSystem.emitPulse(deathPos, { pulses: this.isMiniBoss ? 10 : 6, perPulse: Math.floor((this.isMiniBoss ? 500 : 280) * deathBloodMult), interval: 180, spreadXZ: 1.5, minSize: 0.015, maxSize: 0.09, minLife: 45, maxLife: 90 });
          // Extra guts for shotgun/explosive kills
          if (isShotgunKill && typeof window.BloodSystem.emitGuts === 'function') {
            window.BloodSystem.emitGuts(deathPos, 30);
          }
          // Blood skid mark — elongated streak in the knockback direction
          if (isShotgunKill && typeof spawnBloodSkidMark === 'function') {
            const pdx = deathPos.x - (player ? player.mesh.position.x : 0);
            const pdz = deathPos.z - (player ? player.mesh.position.z : 0);
            const pdist = Math.sqrt(pdx * pdx + pdz * pdz) || 1;
            spawnBloodSkidMark(deathPos, pdx / pdist, pdz / pdist);
          }
          // Growing blood pool — forms gradually at death position
          if (typeof window.BloodSystem.emitPoolGrow === 'function') {
            window.BloodSystem.emitPoolGrow(deathPos, { maxRadius: this.isMiniBoss ? 2.5 : 1.5 });
          }
        }
        // Airborne blood spray burst — sprays high in air, rains down varied droplets
        const sprayCount = Math.floor(18 * deathBloodMult);
        for (let sb = 0; sb < sprayCount && bloodDrips.length < MAX_BLOOD_DRIPS; sb++) {
          const spraySize = 0.015 + Math.random() * 0.08;
          if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') {
            _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
          }
          const spray = new THREE.Mesh(
            _sharedBloodDripGeo,
            new THREE.MeshBasicMaterial({ color: [0xAA0000, 0x8B0000, 0x660000, 0xCC0000, 0x990000, 0x550000][sb % 6] })
          );
          spray.scale.setScalar(spraySize);
          spray.position.copy(deathPos);
          spray.position.y += 0.2 + Math.random() * 0.4;
          scene.add(spray);
          bloodDrips.push({
            mesh: spray,
            velX: (Math.random() - 0.5) * (isShotgunKill ? 0.7 : 0.5),
            velZ: (Math.random() - 0.5) * (isShotgunKill ? 0.7 : 0.5),
            velY: 0.25 + Math.random() * 0.65,
            life: 60 + Math.floor(Math.random() * 40),
            _sharedGeo: true
          });
        }
        // Dynamic blood pools: reduced count to keep managedAnimations queue healthy.
        // Previously 16-24 pools per death quickly saturated the 350-slot limit when
        // multiple enemies died in quick succession, causing the fallback path to be hit
        // and enemies to vanish instantly instead of playing their death animation.
        const airBloodCount = this.isMiniBoss ? 8 : 5;
        for (let ab = 0; ab < airBloodCount; ab++) {
          if (managedAnimations.length >= MAX_MANAGED_ANIMATIONS) break;
          const landX = deathPos.x + (Math.random() - 0.5) * 5;
          const landZ = deathPos.z + (Math.random() - 0.5) * 5;
          // Dynamic sizing: small drips (0.05), drops (0.15), pools (0.4+)
          const sizeRoll = Math.random();
          const r = sizeRoll < 0.3 ? (0.04 + Math.random() * 0.1) :  // 30% tiny drips
                    sizeRoll < 0.55 ? (0.12 + Math.random() * 0.2) :  // 25% drops
                    sizeRoll < 0.8 ? (0.25 + Math.random() * 0.3) :   // 25% medium pools
                                     (0.4 + Math.random() * 0.4);     // 20% big pools
          const poolGeo = new THREE.CircleGeometry(r, r > 0.2 ? 12 : 6);
          const poolMat = new THREE.MeshBasicMaterial({ 
            color: sizeRoll < 0.5 ? 0x8B0000 : 0x6B0000, 
            transparent: true, opacity: 0
          });
          const pool = new THREE.Mesh(poolGeo, poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(landX, 0.05, landZ);
          scene.add(pool);
          const delayFrames = 3 + Math.floor(Math.random() * 15);
          const maxOpacity = 0.5 + Math.random() * 0.35;
          const WAIT_FRAMES = 480;
          const FADE_FRAMES = 60;
          let abTimer = 0;
          managedAnimations.push({
            update(_dt) {
              abTimer++;
              if (abTimer === delayFrames) poolMat.opacity = maxOpacity;
              if (abTimer > WAIT_FRAMES) {
                poolMat.opacity = Math.max(0, maxOpacity * (1 - (abTimer - WAIT_FRAMES) / FADE_FRAMES));
              }
              if (abTimer >= WAIT_FRAMES + FADE_FRAMES) {
                if (pool.parent) scene.remove(pool);
                poolGeo.dispose();
                poolMat.dispose();
                return false;
              }
              return true;
            },
            cleanup() {
              if (pool.parent) scene.remove(pool);
              poolGeo.dispose();
              poolMat.dispose();
            }
          });
        }
        for (let db = 0; db < (this.isMiniBoss ? 18 : 12); db++) {
          spawnBloodDecal(this.mesh.position);
        }
        } // end if (!_suppressDeathBlood)
        
        // Enemy death animation: fall lifeless to ground, then spawn XP star separately
        const dyingMesh = this.mesh;
        // Clone shared material for the fade-out animation so opacity changes on the
        // dying mesh don't affect all other living enemies sharing the same cached material.
        // Keep a reference to the original so the pool can restore it on reuse.
        const _origMaterial = (dyingMesh.material && dyingMesh.material._isShared) ? dyingMesh.material : null;
        if (_origMaterial) {
          dyingMesh.material = _origMaterial.clone();
        }
        const _bulletHoles = this.bulletHoles;
        const _bloodStains = this._bloodStains;
        const _leftEye = this.leftEye;
        const _rightEye = this.rightEye;
        // Hide eyes during death animation so they don't float as opaque white dots
        // while the body mesh fades out. The eye meshes stay as children of this.mesh
        // so acquireEnemy() can re-discover and restore them on recycle.
        if (_leftEye)  _leftEye.visible = false;
        if (_rightEye) _rightEye.visible = false;
        // Also hide head sphere during death fade (it uses its own opaque material)
        if (this.headMesh) this.headMesh.visible = false;
        // Hide guts container so it doesn't remain opaque while the body fades out.
        // The shared geo/mat must never be disposed; just toggling visibility is enough.
        if (this._gutsContainer) this._gutsContainer.visible = false;
        // Capture anatomy part refs so the managed animation can dispose their GL resources
        const _anatBaseMesh = this._anatBaseMesh;
        const _anatHeadMesh = this._anatHeadMesh;
        const _anatJawMesh  = this._anatJawMesh;
        this.bulletHoles = [];
        this._bloodStains = [];
        this.leftEye = null;
        this.rightEye = null;
        this._anatBaseMesh = null;
        this._anatHeadMesh = null;
        this._anatJawMesh  = null;
        // Hide the flat cylinder base-disc immediately so it doesn't appear as a
        // big flat disk during the death fall / explosion phases.
        if (_anatBaseMesh) _anatBaseMesh.visible = false;
        // Spawn the base mass as a tumbling flesh chunk that rolls away instead of
        // remaining as a flat disk on the ground.
        if (scene && _anatBaseMesh) {
          const _fbGeo = new THREE.CapsuleGeometry(0.12, 0.22, 3, 5);
          const _fbMat = new THREE.MeshBasicMaterial({ color: 0x6B0000, transparent: true, opacity: 0.88 });
          const _fbMesh = new THREE.Mesh(_fbGeo, _fbMat);
          _fbMesh.position.copy(deathPos);
          _fbMesh.position.y = 0.2;
          scene.add(_fbMesh);
          let _fbVX = (Math.random() - 0.5) * 0.18, _fbVY = 0.12 + Math.random() * 0.14;
          let _fbVZ = (Math.random() - 0.5) * 0.18;
          let _fbRX = (Math.random() - 0.5) * 0.22, _fbRZ = (Math.random() - 0.5) * 0.22;
          let _fbLife = 200;
          managedAnimations.push({
            update() {
              _fbVY -= 0.009;
              _fbMesh.position.x += _fbVX; _fbMesh.position.y += _fbVY; _fbMesh.position.z += _fbVZ;
              _fbMesh.rotation.x += _fbRX; _fbMesh.rotation.z += _fbRZ;
              if (_fbMesh.position.y < 0.08) {
                _fbMesh.position.y = 0.08; _fbVY = Math.abs(_fbVY) * 0.22;
                _fbVX *= 0.7; _fbVZ *= 0.7;
                if (Math.random() < 0.5) spawnBloodDecal(_fbMesh.position);
              }
              _fbLife--;
              _fbMat.opacity = Math.max(0, (_fbLife / 120) * 0.88);
              if (_fbLife <= 0) { scene.remove(_fbMesh); _fbGeo.dispose(); _fbMat.dispose(); return false; }
              return true;
            },
            cleanup() { if (_fbMesh.parent) scene.remove(_fbMesh); _fbGeo.dispose(); _fbMat.dispose(); }
          });
        }
        
        // XP scaling by enemy type - stronger enemies give more XP
        let expMultiplier = 1;
        if (this.isFlyingBoss) {
          expMultiplier = 5;
        } else if (this.isMiniBoss) {
          expMultiplier = 3;
        } else if (this.type === 9) { // Elite
          expMultiplier = 2;
        } else if (this.type >= 6 && this.type <= 8) { // Hard variants
          expMultiplier = 2;
        } else if (this.type === 0 || this.type === 3 || this.type === 5) { // Tank, Slowing, Flying
          expMultiplier = 1;
        } else if (this.type === 13) { // Bug Slow (tanky)
          expMultiplier = 2;
        } else {
          expMultiplier = 1; // Fast, Balanced, Ranged, Bug Fast, Bug Ranged
        }
        const wasFlying = this.isFlying;
        
        // XP star pops out immediately on death, flying slightly away from the body
        // so it is visible during the death animation and can be collected right away.
        const xpPopAngle = Math.random() * Math.PI * 2;
        const xpPopDist = 0.8 + Math.random() * 0.6; // 0.8–1.4 units away
        var _isCrit = this.lastCrit || false;
        var _isExplosive = (damageType === 'shotgun' || damageType === 'doubleBarrel' || damageType === 'lightning' || damageType === 'homingMissile' || damageType === 'meteor' || damageType === 'fireball');
        var xpHitForce = _isCrit ? 2.0 : (_isExplosive ? 2.5 : 1.0);
        for (let i = 0; i < expMultiplier; i++) {
          const spread = i * (Math.PI * 2 / Math.max(expMultiplier, 1));
          const angle = xpPopAngle + spread;
          spawnExp(deathPos.x + Math.cos(angle) * xpPopDist, deathPos.z + Math.sin(angle) * xpPopDist, damageType, xpHitForce, this.type);
        }
        
        // Dynamic death animation styles - weapon-dependent with variation
        // 0=collapse, 1=spin fall, 2=backward fall, 3=forward collapse, 4=side fall,
        // 5=ragdoll tumble, 6=explosion knockback, 7=splatter, 8=split in half,
        // 9=gut spill, 10=crawl & collapse
        // Declare these BEFORE deathStyle so they're available in the selection logic
        const isShotgunDeath = damageType === 'shotgun' || damageType === 'doubleBarrel' || damageType === 'pumpShotgun' || damageType === 'autoShotgun';
        const isExplosiveDeath = isShotgunDeath || damageType === 'lightning' || damageType === 'homingMissile' || damageType === 'fireball' || damageType === 'sniperRifle';
        const isCritDeath = this.lastCrit || false;
        let deathStyle;
        if (isShotgunDeath) {
          // Shotgun variants: knockback-heavy deaths
          deathStyle = [2, 5, 6, 7, 9][Math.floor(Math.random() * 5)];
        } else if (damageType === 'sniperRifle' || damageType === '50cal') {
          // Sniper: violent backward knockback, split or ragdoll
          deathStyle = [2, 5, 6, 8][Math.floor(Math.random() * 4)];
        } else if (damageType === 'minigun' || damageType === 'uzi') {
          // Rapid fire: riddled with bullets, ragdoll tumble
          deathStyle = [0, 1, 5, 7][Math.floor(Math.random() * 4)];
        } else if (damageType === 'samuraiSword' || damageType === 'teslaSaber') {
          // Bladed melee: clean cuts, split, collapse
          deathStyle = [0, 3, 4, 8, 10][Math.floor(Math.random() * 5)];
        } else if (damageType === 'whip') {
          // Whip: dramatic side falls, collapse
          deathStyle = [0, 3, 4, 10][Math.floor(Math.random() * 4)];
        } else if (damageType === 'bow') {
          // Arrow: pin and fall backward
          deathStyle = [2, 3, 4][Math.floor(Math.random() * 3)];
        } else if (damageType === 'boomerang' || damageType === 'shuriken') {
          // Thrown weapons: spin deaths
          deathStyle = [1, 4, 5][Math.floor(Math.random() * 3)];
        } else if (damageType === 'nanoSwarm') {
          // Nano: dissolve/crumple
          deathStyle = [0, 3, 7][Math.floor(Math.random() * 3)];
        } else if (damageType === 'homingMissile' || damageType === 'fireball') {
          // Explosive: massive knockback, splatter
          deathStyle = [5, 6, 7, 9][Math.floor(Math.random() * 4)];
        } else if (damageType === 'lightning' || damageType === 'special') {
          // Lightning/special: dramatic spin or explosion deaths
          deathStyle = [1, 5, 6][Math.floor(Math.random() * 3)];
        } else if (damageType === 'poison') {
          // Poison: slow collapse, crawl
          deathStyle = [0, 3, 10][Math.floor(Math.random() * 3)];
        } else if (damageType === 'melee' || damageType === 'knife') {
          // Melee: collapse or forward fall
          deathStyle = [0, 2, 3, 4, 10][Math.floor(Math.random() * 5)];
        } else if (damageType === 'headshot') {
          // Headshot: dramatic backward fall
          deathStyle = [2, 5, 8][Math.floor(Math.random() * 3)];
        } else {
          // Gun/default: any animation
          deathStyle = Math.floor(Math.random() * 11);
        }
        const fallSignX = (Math.random() < 0.5) ? 1 : -1;
        const fallSignZ = (Math.random() < 0.5) ? 1 : -1;
        const spinDir = (Math.random() < 0.5) ? 1 : -1;
        
        // Fall down animation: enemy falls dynamically, lies on ground, explodes into blood
        // LINGER_FRAMES extended to keep corpse visible for ~10 seconds total (at 60fps):
        //   FALL(40) + LINGER(500) + EXPLODE(20) + FADE(40) = 600 frames ≈ 10 s
        const FALL_FRAMES = wasFlying ? 70 : 55;  // INCREASED: Slower, more dramatic fall
        const LINGER_FRAMES = 720; // INCREASED: Corpse lingers longer for better blood pooling (~12 seconds)
        const EXPLODE_FRAMES = 30; // INCREASED: Longer blood explosion phase
        const FADE_FRAMES = 60;    // INCREASED: Slower fade out (1 second)
        let fallFrame = 0;
        // Guard against NaN scale from prior squish operations
        const startScaleY = isNaN(dyingMesh.scale.y) ? 1.0 : dyingMesh.scale.y;

        // Instant flatten: random rotation, drop to ground, spawn 5 simple red cube meat chunks
        dyingMesh.rotation.x = -Math.PI / 2 + (Math.random() - 0.5);
        dyingMesh.position.y = 0.05;
        if (scene) {
          for (let _mc = 0; _mc < 5; _mc++) {
            const _mcGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
            const _mcMat = new THREE.MeshBasicMaterial({ color: 0xCC0000, transparent: true, opacity: 0.9 });
            const _mcMesh = new THREE.Mesh(_mcGeo, _mcMat);
            _mcMesh.position.copy(deathPos);
            _mcMesh.position.y += 0.2 + Math.random() * 0.3;
            scene.add(_mcMesh);
            const _mcVx = (Math.random() - 0.5) * 0.28;
            const _mcVz = (Math.random() - 0.5) * 0.28;
            let _mcVy = 0.12 + Math.random() * 0.16;
            const _mcRx = (Math.random() - 0.5) * 0.25;
            const _mcRz = (Math.random() - 0.5) * 0.25;
            let _mcLife = 90 + Math.floor(Math.random() * 30);
            managedAnimations.push({
              update() {
                _mcVy -= 0.012; // gravity
                _mcMesh.position.x += _mcVx;
                _mcMesh.position.y += _mcVy;
                _mcMesh.position.z += _mcVz;
                _mcMesh.rotation.x += _mcRx;
                _mcMesh.rotation.z += _mcRz;
                if (_mcMesh.position.y < 0.06) {
                  _mcMesh.position.y = 0.06;
                  _mcVy = Math.abs(_mcVy) * 0.25;
                }
                _mcLife--;
                _mcMat.opacity = Math.max(0, (_mcLife / 60) * 0.9);
                if (_mcLife <= 0) {
                  scene.remove(_mcMesh);
                  _mcGeo.dispose();
                  _mcMat.dispose();
                  return false;
                }
                return true;
              },
              cleanup() {
                if (_mcMesh.parent) scene.remove(_mcMesh);
                _mcGeo.dispose();
                _mcMat.dispose();
              }
            });
          }
        }

        // Capture startY after the instant drop so the linger animation stays near ground level
        const startY = dyingMesh.position.y; // = 0.05 after instant flatten above

        // Spawn detached body parts for heavy kills (dismemberment)
        const SHOTGUN_CHUNK_MIN = 3, SHOTGUN_CHUNK_EXTRA = 4;
        const NORMAL_CHUNK_MIN = 1, NORMAL_CHUNK_EXTRA = 3;
        const CHUNK_SIZE_MIN = 0.08, CHUNK_SIZE_RANGE = 0.18;
        const GROUND_Y = 0.05, BOUNCE_DAMPEN = 0.3;
        const _deathChunks = [];
        if (isExplosiveDeath || (isCritDeath && Math.random() < 0.5)) {
          const chunkCount = isShotgunDeath ? (SHOTGUN_CHUNK_MIN + Math.floor(Math.random() * SHOTGUN_CHUNK_EXTRA)) : (NORMAL_CHUNK_MIN + Math.floor(Math.random() * NORMAL_CHUNK_EXTRA));
          for (let ci = 0; ci < chunkCount; ci++) {
            const chunkSize = CHUNK_SIZE_MIN + Math.random() * CHUNK_SIZE_RANGE;
            // Vary shapes: ~35% organ blobs, ~40% limb/intestine capsules, ~25% irregular flesh
            const _rShp = Math.random();
            const chunkGeo = _rShp < 0.35
              ? new THREE.SphereGeometry(chunkSize, 5, 4)                                    // organ blob
              : _rShp < 0.75
                ? new THREE.CapsuleGeometry(chunkSize * 0.4, chunkSize * 1.4, 3, 5)         // limb / intestine
                : new THREE.DodecahedronGeometry(chunkSize * 0.9, 0);                       // irregular flesh
            // Use realistic gore colors (dark reds, maroon) instead of enemy color to avoid pink bubbles
            const goreColors = [0x8B0000, 0x660000, 0x4A0000, 0x550011, 0x3D0000, 0x800000];
            const chunkColor = goreColors[Math.floor(Math.random() * goreColors.length)];
            const chunkMat = new THREE.MeshBasicMaterial({ color: chunkColor, transparent: true, opacity: 0.9 });
            const chunk = new THREE.Mesh(chunkGeo, chunkMat);
            chunk.position.copy(deathPos);
            chunk.position.y += 0.3 + Math.random() * 0.3;
            scene.add(chunk);
            _deathChunks.push({
              mesh: chunk, geo: chunkGeo, mat: chunkMat,
              vx: (Math.random() - 0.5) * (isShotgunDeath ? 0.35 : 0.2),
              vy: 0.15 + Math.random() * 0.25,
              vz: (Math.random() - 0.5) * (isShotgunDeath ? 0.35 : 0.2),
              rotX: (Math.random() - 0.5) * 0.3,
              rotZ: (Math.random() - 0.5) * 0.3,
              life: 80 + Math.floor(Math.random() * 40)
            });
          }
        }
        
        // Head roll for headshot or lucky heavy kills
        let _headRoll = null;
        if (damageType === 'headshot' || (isExplosiveDeath && Math.random() < 0.4)) {
          const headGeo = new THREE.SphereGeometry(0.15, 6, 5);
          const headMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.9 });
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.copy(deathPos);
          head.position.y = 0.4;
          scene.add(head);
          _headRoll = {
            mesh: head, geo: headGeo, mat: headMat,
            vx: (Math.random() - 0.5) * 0.12,
            vz: (Math.random() - 0.5) * 0.12,
            vy: 0.08,
            rotX: 0.15 + Math.random() * 0.2,
            rotZ: (Math.random() - 0.5) * 0.1,
            life: 120, bloodTimer: 0
          };
        }
        
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS && !this._skipMainDeathAnim) {
          managedAnimations.push({ update(_dt) {
            fallFrame++;
            
            // Animate detached body chunks (gravity + rotation + blood trail)
            for (let ci = _deathChunks.length - 1; ci >= 0; ci--) {
              const c = _deathChunks[ci];
              c.life--;
              c.vy -= 0.012; // gravity
              c.mesh.position.x += c.vx;
              c.mesh.position.y += c.vy;
              c.mesh.position.z += c.vz;
              c.mesh.rotation.x += c.rotX;
              c.mesh.rotation.z += c.rotZ;
              // Bounce off ground
              if (c.mesh.position.y < GROUND_Y) {
                c.mesh.position.y = GROUND_Y;
                c.vy = Math.abs(c.vy) * BOUNCE_DAMPEN;
                c.vx *= 0.7; c.vz *= 0.7;
                if (Math.random() < 0.5) spawnBloodDecal(c.mesh.position);
              }
              // Blood trail from chunks
              if (c.life % 6 === 0 && c.mesh.position.y > 0.1) {
                spawnBloodDecal({ x: c.mesh.position.x, y: 0, z: c.mesh.position.z });
              }
              c.mat.opacity = Math.max(0, (c.life / 60) * 0.9);
              if (c.life <= 0) {
                scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose();
                _deathChunks.splice(ci, 1);
              }
            }
            
            // Animate rolling head with blood trail
            if (_headRoll) {
              _headRoll.life--;
              _headRoll.vy -= 0.006; // slower gravity for rolling
              _headRoll.mesh.position.x += _headRoll.vx;
              _headRoll.mesh.position.y += _headRoll.vy;
              _headRoll.mesh.position.z += _headRoll.vz;
              _headRoll.mesh.rotation.x += _headRoll.rotX;
              _headRoll.mesh.rotation.z += _headRoll.rotZ;
              // Bounce/roll on ground
              if (_headRoll.mesh.position.y < 0.15) {
                _headRoll.mesh.position.y = 0.15;
                _headRoll.vy = Math.abs(_headRoll.vy) * 0.2;
                _headRoll.vx *= 0.92; _headRoll.vz *= 0.92; // friction
              }
              // Pumping blood from neck stump
              _headRoll.bloodTimer++;
              if (_headRoll.bloodTimer % 5 === 0) {
                spawnBloodDecal({ x: _headRoll.mesh.position.x, y: 0, z: _headRoll.mesh.position.z });
              }
              if (_headRoll.bloodTimer % 12 === 0 && _headRoll.life > 40) {
                spawnParticles(_headRoll.mesh.position, 0x8B0000, 2);
              }
              _headRoll.mat.opacity = Math.max(0, (_headRoll.life / 80) * 0.9);
              if (_headRoll.life <= 0) {
                scene.remove(_headRoll.mesh); _headRoll.geo.dispose(); _headRoll.mat.dispose();
                _headRoll = null;
              }
            }
            
            if (fallFrame <= FALL_FRAMES) {
              const progress = Math.min(fallFrame / FALL_FRAMES, 1);
              const eased = 1 - Math.pow(1 - progress, 3); // Ease-out cubic for natural fall
              
              if (deathStyle === 0) {
                // Face-plant: fall forward onto stomach with bounce
                dyingMesh.rotation.x = fallSignX * eased * (Math.PI / 2);
                dyingMesh.rotation.z = fallSignZ * eased * 0.2;
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.65);
              } else if (deathStyle === 1) {
                // Side fall: topple sideways dramatically
                dyingMesh.rotation.z = fallSignZ * eased * (Math.PI / 2);
                dyingMesh.rotation.x = fallSignX * eased * 0.3;
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.45);
              } else if (deathStyle === 2) {
                // Back fall: fall backward with arms spread
                dyingMesh.rotation.x = fallSignX * -1 * eased * (Math.PI / 2.2);
                dyingMesh.rotation.z = fallSignZ * eased * 0.15;
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.5);
                dyingMesh.scale.x = startScaleY * (1 + eased * 0.15);
              } else if (deathStyle === 3) {
                // Knees first: two-stage collapse — knees buckle then body falls forward
                if (progress < 0.4) {
                  const kneePhase = progress / 0.4;
                  dyingMesh.scale.y = startScaleY * (1 - kneePhase * 0.55);
                  dyingMesh.position.y = startY * (1 - kneePhase * 0.65);
                } else {
                  const bodyPhase = (progress - 0.4) / 0.6;
                  const bodyEased = 1 - Math.pow(1 - bodyPhase, 2);
                  dyingMesh.scale.y = startScaleY * 0.45 * (1 - bodyEased * 0.6);
                  dyingMesh.rotation.x = fallSignX * bodyEased * (Math.PI / 2);
                  dyingMesh.rotation.z = fallSignZ * bodyEased * 0.35;
                  dyingMesh.position.y = startY * 0.35 * (1 - bodyEased);
                }
              } else if (deathStyle === 4) {
                // Spin and collapse: enemy spins violently as they fall
                dyingMesh.rotation.y = spinDir * eased * Math.PI * 2.0;
                dyingMesh.rotation.x = fallSignX * eased * (Math.PI / 2.5);
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.6);
              } else if (deathStyle === 5) {
                // Dramatic crumple: compress vertically then topple
                if (progress < 0.3) {
                  const crumple = progress / 0.3;
                  dyingMesh.scale.y = startScaleY * (1 - crumple * 0.45);
                  dyingMesh.scale.x = startScaleY * (1 + crumple * 0.25);
                  dyingMesh.position.y = startY * (1 - crumple * 0.35);
                } else {
                  const topple = (progress - 0.3) / 0.7;
                  const toppleEased = 1 - Math.pow(1 - topple, 2);
                  dyingMesh.rotation.x = fallSignX * toppleEased * (Math.PI / 2);
                  dyingMesh.rotation.z = fallSignZ * toppleEased * (Math.PI / 3);
                  dyingMesh.scale.y = startScaleY * 0.55 * (1 - toppleEased * 0.45);
                  dyingMesh.position.y = startY * 0.65 * (1 - toppleEased);
                }
              } else if (deathStyle === 6) {
                // Ragdoll flip — launched up slightly then crashes
                if (progress < 0.25) {
                  const launchPhase = progress / 0.25;
                  dyingMesh.position.y = startY + launchPhase * 0.4;
                  dyingMesh.rotation.x = fallSignX * launchPhase * 0.5;
                } else {
                  const crashPhase = (progress - 0.25) / 0.75;
                  const crashEased = 1 - Math.pow(1 - crashPhase, 3);
                  dyingMesh.position.y = (startY + 0.4) * (1 - crashEased);
                  dyingMesh.rotation.x = fallSignX * (0.5 + crashEased * (Math.PI / 2));
                  dyingMesh.rotation.z = fallSignZ * crashEased * 0.4;
                  dyingMesh.scale.y = startScaleY * (1 - crashEased * 0.55);
                }
              } else if (deathStyle === 8) {
                // Crawl and Collapse — fall to knees, crawl forward, collapse face-down
                if (progress < 0.25) {
                  const kneePhase = progress / 0.25;
                  dyingMesh.scale.y = startScaleY * (1 - kneePhase * 0.5);
                  dyingMesh.position.y = startY * (1 - kneePhase * 0.6);
                  dyingMesh.rotation.x = fallSignX * kneePhase * 0.3;
                } else if (progress < 0.75) {
                  const crawlPhase = (progress - 0.25) / 0.5;
                  dyingMesh.scale.y = startScaleY * 0.5;
                  dyingMesh.position.y = startY * 0.4;
                  dyingMesh.position.x = deathPos.x + fallSignX * crawlPhase * 2.5;
                  dyingMesh.position.z = deathPos.z + fallSignZ * crawlPhase * 1.5;
                  dyingMesh.rotation.x = fallSignX * (0.3 + crawlPhase * 0.15 * Math.sin(crawlPhase * 12));
                  if (window.BloodSystem && window.BloodSystem.emitCrawlTrail) {
                    window.BloodSystem.emitCrawlTrail(dyingMesh.position, { x: fallSignX, y: 0, z: fallSignZ });
                  }
                  if (fallFrame % 6 === 0) spawnBloodDecal(dyingMesh.position);
                } else {
                  const collapsePhase = (progress - 0.75) / 0.25;
                  const collapseEased = 1 - Math.pow(1 - collapsePhase, 2);
                  dyingMesh.scale.y = startScaleY * 0.5 * (1 - collapseEased * 0.6);
                  dyingMesh.position.y = startY * 0.4 * (1 - collapseEased);
                  dyingMesh.rotation.x = fallSignX * (0.45 + collapseEased * (Math.PI / 2));
                  spawnBloodDecal(dyingMesh.position);
                }
              } else if (deathStyle === 9) {
                // Split in Half — left/right halves slide apart with blood in the gap
                if (progress < 0.15) {
                  const stagger = progress / 0.15;
                  dyingMesh.rotation.z = fallSignZ * stagger * 0.1;
                  dyingMesh.position.y = startY * (1 - stagger * 0.1);
                } else {
                  const splitPhase = (progress - 0.15) / 0.85;
                  const splitEased = 1 - Math.pow(1 - splitPhase, 2);
                  dyingMesh.scale.x = startScaleY * (1 - splitEased * 0.48);
                  dyingMesh.position.x = deathPos.x + fallSignX * splitEased * 0.6;
                  dyingMesh.position.y = startY * (1 - splitEased);
                  dyingMesh.rotation.z = fallSignZ * splitEased * (Math.PI / 4);
                  dyingMesh.scale.y = startScaleY * (1 - splitEased * 0.55);
                  if (splitPhase > 0.2 && !dyingMesh._splitProxy && managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                    const proxyGeo = dyingMesh.geometry.clone();
                    const proxyMat = dyingMesh.material.clone();
                    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
                    proxy.position.copy(dyingMesh.position);
                    proxy.position.x = deathPos.x - fallSignX * splitEased * 0.6;
                    proxy.rotation.copy(dyingMesh.rotation);
                    proxy.rotation.z = -fallSignZ * splitEased * (Math.PI / 4);
                    proxy.scale.copy(dyingMesh.scale);
                    scene.add(proxy);
                    dyingMesh._splitProxy = { mesh: proxy, geo: proxyGeo, mat: proxyMat };
                  }
                  if (dyingMesh._splitProxy) {
                    const p = dyingMesh._splitProxy;
                    p.mesh.position.x = deathPos.x - fallSignX * splitEased * 0.6;
                    p.mesh.position.y = startY * (1 - splitEased);
                    p.mesh.rotation.z = -fallSignZ * splitEased * (Math.PI / 4);
                    p.mesh.scale.copy(dyingMesh.scale);
                    p.mat.opacity = dyingMesh.material.opacity;
                  }
                  if (fallFrame % 4 === 0) {
                    spawnBloodDecal({ x: deathPos.x, y: 0, z: deathPos.z });
                  }
                }
              } else if (deathStyle === 10) {
                // Gut Spill — stagger, bend forward, guts fall out, body collapses on top
                if (progress < 0.2) {
                  const stagger = progress / 0.2;
                  dyingMesh.position.x = deathPos.x + Math.sin(stagger * 8) * 0.08;
                  dyingMesh.position.y = startY * (1 - stagger * 0.1);
                } else if (progress < 0.5) {
                  const bendPhase = (progress - 0.2) / 0.3;
                  const bendEased = 1 - Math.pow(1 - bendPhase, 2);
                  dyingMesh.rotation.x = fallSignX * bendEased * (Math.PI / 3);
                  dyingMesh.position.y = startY * (0.9 - bendEased * 0.25);
                  dyingMesh.scale.y = startScaleY * (1 - bendEased * 0.2);
                  if (bendPhase > 0.5 && !dyingMesh._gutsSpawned && managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                    dyingMesh._gutsSpawned = true;
                    if (window.BloodSystem && window.BloodSystem.emitGuts) {
                      window.BloodSystem.emitGuts(dyingMesh.position);
                    }
                    for (let gi = 0; gi < 4; gi++) {
                      const gutGeo = new THREE.CylinderGeometry(0.04 + Math.random() * 0.03, 0.03, 0.15 + Math.random() * 0.15, 6);
                      const gutMat = new THREE.MeshBasicMaterial({ color: gi < 2 ? 0xCC3344 : 0xDD7788, transparent: true, opacity: 0.9 });
                      const gutMesh = new THREE.Mesh(gutGeo, gutMat);
                      gutMesh.position.copy(dyingMesh.position);
                      gutMesh.position.y = startY * 0.5;
                      scene.add(gutMesh);
                      _deathChunks.push({ mesh: gutMesh, geo: gutGeo, mat: gutMat,
                        vx: (Math.random() - 0.5) * 0.06, vz: fallSignX * (0.02 + Math.random() * 0.04),
                        vy: 0.04 + Math.random() * 0.03, rotX: Math.random() * 0.1, rotZ: Math.random() * 0.1,
                        life: 100, bloodTimer: 0
                      });
                    }
                  }
                } else {
                  const collapsePhase = (progress - 0.5) / 0.5;
                  const collapseEased = 1 - Math.pow(1 - collapsePhase, 3);
                  dyingMesh.rotation.x = fallSignX * (Math.PI / 3 + collapseEased * (Math.PI / 6));
                  dyingMesh.position.y = startY * 0.65 * (1 - collapseEased);
                  dyingMesh.scale.y = startScaleY * 0.8 * (1 - collapseEased * 0.55);
                  if (collapsePhase > 0.7) spawnBloodDecal(deathPos);
                }
              } else {
                // Violent twist — wrench sideways with full rotation
                dyingMesh.rotation.y = spinDir * eased * Math.PI;
                dyingMesh.rotation.z = fallSignZ * eased * (Math.PI / 2.5);
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.5);
                dyingMesh.scale.x = startScaleY * (1 + eased * 0.2);
              }
              // Flying enemies: also tumble during fall
              if (wasFlying) {
                dyingMesh.rotation.y += 0.12;
                dyingMesh.position.y = Math.max(0, startY * (1 - eased));
              }
              // Blood spray during fall
              if (progress > 0.3 && fallFrame % 4 === 0) {
                spawnBloodDecal(deathPos);
              }
              // Bounce impact when hitting ground near end of fall
              if (progress > 0.82 && progress < 0.95) {
                spawnParticles(deathPos, 0x8B0000, 4);
                spawnParticles(deathPos, 0x660000, 2);
                spawnBloodDecal(deathPos);
                spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*0.8, y: 0, z: deathPos.z + (Math.random()-0.5)*0.8 });
              }
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES) {
              // Phase 2: Lie on ground lifeless - pooling blood beneath
              const lingerProgress = (fallFrame - FALL_FRAMES) / LINGER_FRAMES;
              if (lingerProgress < 0.15) {
                // Impact bounce/settle
                const bounce = Math.sin(lingerProgress * Math.PI * 8) * 0.03 * (1 - lingerProgress * 7);
                dyingMesh.position.y = bounce;
              }
              // Continuous blood pooling with heartbeat pulsation while body lies there
              if (fallFrame % 10 === 0 && lingerProgress < 0.6) {
                spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*0.6, y: 0, z: deathPos.z + (Math.random()-0.5)*0.6 });
              }
              // Heartbeat blood pump — rhythmic spurts from wound
              const heartbeatPhase = Math.sin(lingerProgress * Math.PI * 12); // ~6 beats
              if (heartbeatPhase > 0.8 && lingerProgress < 0.7 && fallFrame % 3 === 0) {
                spawnParticles(deathPos, 0x8B0000, 2);
                if (bloodDrips.length < MAX_BLOOD_DRIPS) {
                  if (!_sharedBloodDripGeo) _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
                  const pumpDrip = new THREE.Mesh(_sharedBloodDripGeo, new THREE.MeshBasicMaterial({ color: 0xAA0000 }));
                  pumpDrip.scale.setScalar(0.02 + Math.random() * 0.03);
                  pumpDrip.position.copy(deathPos);
                  pumpDrip.position.y += 0.1;
                  scene.add(pumpDrip);
                  bloodDrips.push({
                    mesh: pumpDrip,
                    velX: (Math.random()-0.5) * 0.08,
                    velZ: (Math.random()-0.5) * 0.08,
                    velY: 0.06 + Math.random() * 0.1,
                    life: 30 + Math.floor(Math.random() * 15),
                    _sharedGeo: true
                  });
                }
              }
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES + EXPLODE_FRAMES) {
              // Phase 3: Body dissolves into blood — SINK & SHRINK (no transparency for mobile perf)
              const explodeProgress = (fallFrame - FALL_FRAMES - LINGER_FRAMES) / EXPLODE_FRAMES;
              if (explodeProgress < 0.4) {
                spawnParticles(deathPos, 0x8B0000, 5);
                spawnParticles(deathPos, 0x660000, 3);
                spawnBloodDecal(deathPos);
                spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*1.5, y: 0, z: deathPos.z + (Math.random()-0.5)*1.5 });
              }
              // PERF FIX: Sink into ground and shrink instead of fading opacity (avoids mobile overdraw)
              dyingMesh.position.y -= 0.02 * explodeProgress;
              dyingMesh.scale.multiplyScalar(0.97);
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES + EXPLODE_FRAMES + FADE_FRAMES) {
              // Phase 4: Continue sinking and shrinking to zero
              dyingMesh.position.y -= 0.025;
              dyingMesh.scale.multiplyScalar(0.92);
            } else {
              // Phase 5: Corpse fully faded — either return to pool or dispose.
              // ── POOL PATH ────────────────────────────────────────────────────
              if (window.enemyPool) {
                // Dispose the cloned death-animation material; restore shared original.
                if (dyingMesh.material && !dyingMesh.material._isShared) dyingMesh.material.dispose();
                if (_origMaterial) dyingMesh.material = _origMaterial;
                // Dispose bullet-hole and blood-stain cloned materials.
                if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material && !h.material._isShared) h.material.dispose(); });
                if (_bloodStains) _bloodStains.forEach(s => { if (s.material && !s.material._isShared) s.material.dispose(); });
                // Dispose animation-only gore meshes (head roll, split proxy, chunks).
                if (_anatHeadMesh) { if (_anatHeadMesh.geometry) _anatHeadMesh.geometry.dispose(); if (_anatHeadMesh.material) _anatHeadMesh.material.dispose(); }
                if (_anatJawMesh)  { if (_anatJawMesh.geometry)  _anatJawMesh.geometry.dispose();  if (_anatJawMesh.material)  _anatJawMesh.material.dispose(); }
                _deathChunks.forEach(c => { scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose(); });
                if (_headRoll) { scene.remove(_headRoll.mesh); _headRoll.geo.dispose(); _headRoll.mat.dispose(); }
                if (dyingMesh._splitProxy) { scene.remove(dyingMesh._splitProxy.mesh); dyingMesh._splitProxy.geo.dispose(); dyingMesh._splitProxy.mat.dispose(); dyingMesh._splitProxy = null; }
                // Restore sentinel disc reference so the next die() can trigger gore again.
                if (_anatBaseMesh) { _anatBaseMesh.visible = false; _enemyInst._anatBaseMesh = _anatBaseMesh; }
                // Dispose spider sprite (spider enemies only)
                if (_enemyInst._spiderSprite) { _enemyInst._spiderSprite.dispose(); _enemyInst._spiderSprite = null; }
                // Park the enemy and push to free list.
                window.enemyPool._return(_enemyInst);
              } else {
                // ── DISPOSE PATH (no pool) ──────────────────────────────────────
                scene.remove(dyingMesh);
                // Dispose geometry only if it is NOT a shared instance (flagged with _isShared)
                if (dyingMesh.geometry && !dyingMesh.geometry._isShared) dyingMesh.geometry.dispose();
                // Dispose material only if it is NOT a shared cached instance
                if (dyingMesh.material && !dyingMesh.material._isShared) dyingMesh.material.dispose();
                // bullet holes use shared geometry — only dispose per-hole cloned materials
                if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material && !h.material._isShared) h.material.dispose(); });
                // blood stains use shared geometry — only dispose per-stain materials
                if (_bloodStains) _bloodStains.forEach(s => { if (s.material && !s.material._isShared) s.material.dispose(); });
                // Eyes use shared geo/mat — no disposal needed (they are children of dyingMesh, removed with it)
                // Anatomy part meshes have unique geometries — dispose both geo and mat
                if (_anatBaseMesh) { if (_anatBaseMesh.geometry) _anatBaseMesh.geometry.dispose(); if (_anatBaseMesh.material) _anatBaseMesh.material.dispose(); }
                if (_anatHeadMesh) { if (_anatHeadMesh.geometry) _anatHeadMesh.geometry.dispose(); if (_anatHeadMesh.material) _anatHeadMesh.material.dispose(); }
                if (_anatJawMesh)  { if (_anatJawMesh.geometry)  _anatJawMesh.geometry.dispose();  if (_anatJawMesh.material)  _anatJawMesh.material.dispose();  }
                // Clean up remaining chunks
                _deathChunks.forEach(c => { scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose(); });
                if (_headRoll) { scene.remove(_headRoll.mesh); _headRoll.geo.dispose(); _headRoll.mat.dispose(); }
                if (dyingMesh._splitProxy) { scene.remove(dyingMesh._splitProxy.mesh); dyingMesh._splitProxy.geo.dispose(); dyingMesh._splitProxy.mat.dispose(); }
                // Dispose spider sprite (spider enemies only)
                if (_enemyInst._spiderSprite) { _enemyInst._spiderSprite.dispose(); _enemyInst._spiderSprite = null; }
              }
              return false;
            }
            return true;
          },
          cleanup() {
            // Called by resetGame when the animation is still in-progress.
            // With object pooling: restore the shared material, park mesh, return to pool.
            // Without pooling: force-remove and dispose everything.
            if (window.enemyPool) {
              if (dyingMesh.parent) scene.remove(dyingMesh);
              if (dyingMesh.material && !dyingMesh.material._isShared) dyingMesh.material.dispose();
              if (_origMaterial) dyingMesh.material = _origMaterial;
              if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material && !h.material._isShared) h.material.dispose(); });
              if (_bloodStains) _bloodStains.forEach(s => { if (s.material && !s.material._isShared) s.material.dispose(); });
              if (_anatHeadMesh) { if (_anatHeadMesh.geometry) _anatHeadMesh.geometry.dispose(); if (_anatHeadMesh.material) _anatHeadMesh.material.dispose(); }
              if (_anatJawMesh)  { if (_anatJawMesh.geometry)  _anatJawMesh.geometry.dispose();  if (_anatJawMesh.material)  _anatJawMesh.material.dispose(); }
              _deathChunks.forEach(c => { if (c.mesh.parent) scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose(); });
              if (_headRoll) { if (_headRoll.mesh.parent) scene.remove(_headRoll.mesh); _headRoll.geo.dispose(); _headRoll.mat.dispose(); }
              if (dyingMesh._splitProxy) { if (dyingMesh._splitProxy.mesh.parent) scene.remove(dyingMesh._splitProxy.mesh); dyingMesh._splitProxy.geo.dispose(); dyingMesh._splitProxy.mat.dispose(); dyingMesh._splitProxy = null; }
              if (_anatBaseMesh) { _anatBaseMesh.visible = false; _enemyInst._anatBaseMesh = _anatBaseMesh; }
              if (_enemyInst._spiderSprite) { _enemyInst._spiderSprite.dispose(); _enemyInst._spiderSprite = null; }
              window.enemyPool._return(_enemyInst);
            } else {
              // Force-remove the dying mesh and all sub-resources from the scene.
              if (dyingMesh.parent) scene.remove(dyingMesh);
              const _isSharedGeoC = dyingMesh.geometry && dyingMesh.geometry._isShared;
              if (dyingMesh.geometry && !_isSharedGeoC) dyingMesh.geometry.dispose();
              if (dyingMesh.material && !dyingMesh.material._isShared) dyingMesh.material.dispose();
              // bullet holes / blood stains use shared geometry — only dispose per-hole materials
              if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material && !h.material._isShared) h.material.dispose(); });
              if (_bloodStains) _bloodStains.forEach(s => { if (s.material && !s.material._isShared) s.material.dispose(); });
              // Anatomy part meshes have unique geometries — dispose both geo and mat
              if (_anatBaseMesh) { if (_anatBaseMesh.geometry) _anatBaseMesh.geometry.dispose(); if (_anatBaseMesh.material) _anatBaseMesh.material.dispose(); }
              if (_anatHeadMesh) { if (_anatHeadMesh.geometry) _anatHeadMesh.geometry.dispose(); if (_anatHeadMesh.material) _anatHeadMesh.material.dispose(); }
              if (_anatJawMesh)  { if (_anatJawMesh.geometry)  _anatJawMesh.geometry.dispose();  if (_anatJawMesh.material)  _anatJawMesh.material.dispose();  }
              _deathChunks.forEach(c => { if (c.mesh.parent) scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose(); });
              if (_headRoll) { if (_headRoll.mesh.parent) scene.remove(_headRoll.mesh); _headRoll.geo.dispose(); _headRoll.mat.dispose(); }
              if (dyingMesh._splitProxy) { if (dyingMesh._splitProxy.mesh.parent) scene.remove(dyingMesh._splitProxy.mesh); dyingMesh._splitProxy.geo.dispose(); dyingMesh._splitProxy.mat.dispose(); }
              if (_enemyInst._spiderSprite) { _enemyInst._spiderSprite.dispose(); _enemyInst._spiderSprite = null; }
            }
          }
        });
        } else {
          // Fallback: no animation slot available, return to pool or dispose immediately
          if (window.enemyPool) {
            if (dyingMesh.material && !dyingMesh.material._isShared) dyingMesh.material.dispose();
            if (_origMaterial) dyingMesh.material = _origMaterial;
            if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material && !h.material._isShared) h.material.dispose(); });
            if (_bloodStains) _bloodStains.forEach(s => { if (s.material && !s.material._isShared) s.material.dispose(); });
            if (_anatHeadMesh) { if (_anatHeadMesh.geometry) _anatHeadMesh.geometry.dispose(); if (_anatHeadMesh.material) _anatHeadMesh.material.dispose(); }
            if (_anatJawMesh)  { if (_anatJawMesh.geometry)  _anatJawMesh.geometry.dispose();  if (_anatJawMesh.material)  _anatJawMesh.material.dispose(); }
            if (_anatBaseMesh) { _anatBaseMesh.visible = false; _enemyInst._anatBaseMesh = _anatBaseMesh; }
            window.enemyPool._return(_enemyInst);
          } else {
            scene.remove(dyingMesh);
            setTimeout(() => {
              const _isSharedGeoFB = dyingMesh.geometry && dyingMesh.geometry._isShared;
              if (dyingMesh.geometry && !_isSharedGeoFB) dyingMesh.geometry.dispose();
              if (dyingMesh.material && !dyingMesh.material._isShared) dyingMesh.material.dispose();
              // bullet holes / blood stains use shared geometry — only dispose per-hole materials
              if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material && !h.material._isShared) h.material.dispose(); });
              if (_bloodStains) _bloodStains.forEach(s => { if (s.material && !s.material._isShared) s.material.dispose(); });
              // Anatomy part meshes have unique geometries — dispose both geo and mat
              if (_anatBaseMesh) { if (_anatBaseMesh.geometry) _anatBaseMesh.geometry.dispose(); if (_anatBaseMesh.material) _anatBaseMesh.material.dispose(); }
              if (_anatHeadMesh) { if (_anatHeadMesh.geometry) _anatHeadMesh.geometry.dispose(); if (_anatHeadMesh.material) _anatHeadMesh.material.dispose(); }
              if (_anatJawMesh)  { if (_anatJawMesh.geometry)  _anatJawMesh.geometry.dispose();  if (_anatJawMesh.material)  _anatJawMesh.material.dispose();  }
            }, 100);
          }
          // XP already spawned above; nothing extra needed in this fallback
        }
        } // end else (non-source-glitch): skip standard kill cam / blood / animation for type 20
        
        // PR #117: Drop GOLD - Reduced drop rate (chest-like rarity), bigger amounts
        let goldAmount = 0;
        let dropChance = 0;
        
        if (this.isFlyingBoss) {
          // Flying Boss: guaranteed large gold reward
          goldAmount = 100 + Math.floor(Math.random() * 101); // 100-200 gold
          dropChance = 1.0;
        } else if (this.isMiniBoss) {
          // MiniBoss: guaranteed 50-100 gold (increased from 30-60)
          goldAmount = 50 + Math.floor(Math.random() * 51);
          dropChance = 1.0; // 100% for mini-boss
        } else {
          // Regular enemies: MUCH lower drop rate (5-10% instead of 100%)
          dropChance = 0.05 + Math.random() * 0.05; // 5-10% chance
          
          if (Math.random() < dropChance) {
            // When they DO drop, drop MUCH more gold
            if (this.type === 0) { // Tank
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 1) { // Fast
              goldAmount = 5 + Math.floor(Math.random() * 3); // 5-7 gold (was 1)
            } else if (this.type === 2) { // Balanced
              goldAmount = 6 + Math.floor(Math.random() * 4); // 6-9 gold (was 1-2)
            } else if (this.type === 3) { // Slowing
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 4) { // Ranged
              goldAmount = 6 + Math.floor(Math.random() * 4); // 6-9 gold (was 1-2)
            } else if (this.type === 5) { // Flying
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 6) { // Hard Tank
              goldAmount = 15 + Math.floor(Math.random() * 11); // 15-25 gold (was 3-5)
            } else if (this.type === 7) { // Hard Fast
              goldAmount = 10 + Math.floor(Math.random() * 11); // 10-20 gold (was 2-4)
            } else if (this.type === 8) { // Hard Balanced
              goldAmount = 15 + Math.floor(Math.random() * 11); // 15-25 gold (was 3-5)
            } else if (this.type === 9) { // Elite
              goldAmount = 25 + Math.floor(Math.random() * 26); // 25-50 gold (was 5-8)
            } else if (this.type === 12) { // Bug Ranged
              goldAmount = 8 + Math.floor(Math.random() * 7);  // 8-14 gold
            } else if (this.type === 13) { // Bug Slow
              goldAmount = 12 + Math.floor(Math.random() * 9); // 12-20 gold
            } else if (this.type === 14) { // Bug Fast
              goldAmount = 5 + Math.floor(Math.random() * 5);  // 5-9 gold
            } else if (this.type === 15) { // Daddy Longlegs — easy early enemy, small reward
              goldAmount = 3 + Math.floor(Math.random() * 4);  // 3-6 gold
            } else if (this.type === 16) { // Sweeping Swarm — minimal reward
              goldAmount = 2 + Math.floor(Math.random() * 3);  // 2-4 gold
            } else if (this.type === 20) { // Source Glitch — no gold, drops Corrupted Source Code instead
              goldAmount = 0;
            } else {
              goldAmount = 5 + Math.floor(Math.random() * 6); // 5-10 gold (was 1-2)
            }
          }
        }
        
        // Only spawn gold if amount > 0
        if (goldAmount > 0) {
          spawnGold(deathPos.x, deathPos.z, goldAmount);
          // Rare visual-only gold drop animation (~12% chance)
          if (Math.random() < 0.12) {
            spawnGoldDrop(deathPos.x, deathPos.z, goldAmount);
          }
        }

        // Boss Chest: bosses drop a glowing chest with Relics inside
        if ((this.isFlyingBoss || this.isMiniBoss) && typeof window.spawnBossChest === 'function') {
          window.spawnBossChest(deathPos.x, deathPos.z);
        }
        
        // Phase 1: Gear drop system - enemies have a chance to drop gear
        let gearDropChance = 0;
        if (this.isFlyingBoss) {
          gearDropChance = 0.75; // 75% for flying boss
        } else if (this.isMiniBoss) {
          gearDropChance = 0.5; // 50% for mini-boss
        } else {
          // Regular enemies: 3-8% chance (scales with enemy type 0-9)
          // Enemy types 0-9 add 0-0.05% additional chance
          gearDropChance = 0.03 + Math.min(this.type * 0.005, 0.05); // 3-8% cap
        }
        
        if (Math.random() < gearDropChance) {
          const newGear = generateRandomGear();
          saveData.inventory.push(newGear);
          saveSaveData();
          
          // Show notification
          const rarityColors = {
            common:    '#aaaaaa',
            uncommon:  '#55cc55',
            rare:      '#44aaff',
            epic:      '#aa44ff',
            legendary: '#ffd700',
            mythic:    '#ff4444'
          };
          createFloatingText(`+${newGear.name}`, deathPos, rarityColors[newGear.rarity] || '#FFFFFF');
          playSound('coin');

          // Notify SSB with gear drop rarity
          if (window.pushSuperStatEvent) {
            const gr = newGear.rarity || 'common';
            window.pushSuperStatEvent(`📦 ${newGear.name}`, gr, '📦', 'success');
          }
          
          console.log('[Phase 1 Gear Drop]', newGear.name, '-', newGear.rarity);
          
          // Quest progression: lake chest quest (triggered by first item collection)
          if (saveData.storyQuests.currentQuest === 'discoverLakeChest' && saveData.inventory.length === 1) {
            // This is the first item - treat it as finding the lake chest
            setTimeout(() => {
              progressQuest('discoverLakeChest', true);
            }, 2000); // Small delay to let player see the item notification
          }
        }
        
        playerStats.kills++;

        // Alien Biomatter rare drop from Grey Alien Scout (type 17)
        if (this.type === 17 && Math.random() < 0.35) {
          // 35% chance to drop Alien Biomatter
          if (!saveData.alienBiomatter) saveData.alienBiomatter = 0;
          saveData.alienBiomatter = Math.min(saveData.alienBiomatter + 1, 999);
          saveSaveData();
          createFloatingText('🧬 Alien Biomatter', deathPos, '#00FF88');
          if (window.pushSuperStatEvent) {
            window.pushSuperStatEvent('🧬 Alien Biomatter', 'uncommon', '🧬', 'success');
          }
        }

        // Clean up Annunaki Orb laser beam if it was alive when the orb died
        if (this.type === 19 && this._annunakiLaserMesh) {
          scene.remove(this._annunakiLaserMesh);
          this._annunakiLaserMesh.geometry.dispose();
          this._annunakiLaserMesh.material.dispose();
          this._annunakiLaserMesh = null;
        }

        // Heal on kill (Bloodlust skill and similar)
        if (playerStats.healOnKill > 0) {
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + playerStats.healOnKill);
          updateHUD();
        }

        // Tutorial Quest: Track kills this run
        if (saveData.tutorialQuests) {
          saveData.tutorialQuests.killsThisRun = playerStats.kills;
          updateQuestTracker();
          
          // Quest 1: Kill 3 enemies
          const currentQuest = getCurrentQuest();
          if (currentQuest && currentQuest.id === 'quest1_kill3' && playerStats.kills >= 3) {
            progressTutorialQuest('quest1_kill3', true);
            // Guard: only set pending notification if quest1 is now in readyToClaim
            if (saveData.tutorialQuests.readyToClaim.includes('quest1_kill3')) {
              saveData.tutorialQuests.pendingMissionNotification = 'quest1_kill3';
            }
          }
          // Quest kill tracking — notify mid-run when objective reached
          if (currentQuest && currentQuest.id === 'quest8_kill10' && playerStats.kills >= 10 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest8_kill10')) {
            showStatChange('⚔️ 10 Kills! Return to camp after this run!');
          }
          // Kill 15 enemies
          if (currentQuest && currentQuest.id === 'quest10_kill15' && playerStats.kills >= 15 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest10_kill15')) {
            showStatChange('⚔️ 15 Kills! Return to camp to claim your reward!');
          }
          // Kill 25 enemies
          if (currentQuest && currentQuest.id === 'quest14_kill25' && playerStats.kills >= 25 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest14_kill25')) {
            progressTutorialQuest('quest14_kill25', true);
            showStatChange('⚔️ 25 Kills! Return to camp to claim your reward!');
          }
          // Kill 20 enemies (Trash & Recycle unlock)
          if (currentQuest && currentQuest.id === 'quest26_kill20' && playerStats.kills >= 20 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest26_kill20')) {
            showStatChange('⚔️ 20 Kills! Return to camp to claim your reward!');
          }
          // Kill 12 enemies (alternation run quest)
          if (currentQuest && currentQuest.id === 'quest15b_runKill12' && playerStats.kills >= 12 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest15b_runKill12')) {
            showStatChange('⚔️ 12 Kills! Return to camp to claim your reward!');
          }
          // Kill 8 enemies (grow companion to adult)
          if (currentQuest && currentQuest.id === 'quest19c_growAdult' && playerStats.kills >= 8 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest19c_growAdult')) {
            showStatChange('🐺 8 Kills! Your companion is growing stronger!');
          }
        }
        
        // Track side challenge progress
        if (saveData.sideChallenges.kill10Enemies && !saveData.sideChallenges.kill10Enemies.completed) {
          saveData.sideChallenges.kill10Enemies.progress++;
          if (saveData.sideChallenges.kill10Enemies.progress >= saveData.sideChallenges.kill10Enemies.target) {
            saveData.sideChallenges.kill10Enemies.completed = true;
            // Award gold before saving to prevent loss on crash
            saveData.gold += 50;
            saveSaveData();
            createFloatingText("Side Quest Complete: Kill 10 Enemies! +50 Gold", deathPos, '#FFD700');
          }
        }
        
        // Track mini-boss defeats for achievements
        if (this.isMiniBoss) {
          playerStats.miniBossesDefeated++;
          createFloatingText("MINI-BOSS DEFEATED! 🏆", deathPos);
          // Track first boss defeat for quest_pushingLimits
          if (saveData.tutorialQuests && !saveData.tutorialQuests.firstBossDefeated) {
            saveData.tutorialQuests.firstBossDefeated = true;
            saveSaveData();
          }
          // Clean up any surviving minions spawned with this mini-boss
          // Stagger deaths to prevent simultaneous death effect overload (freeze fix)
          let minionDelay = 0;
          for (const e of enemies) {
            if (!e.isDead && e.isMiniBossMinion) {
              const minionRef = e;
              setTimeout(() => { if (!minionRef.isDead) minionRef.die(); }, minionDelay);
              minionDelay += 150; // 150ms between each minion death
            }
          }
        }
        if (this.isFlyingBoss) {
          playerStats.miniBossesDefeated++;
          createFloatingText("⚡ FLYING BOSS DEFEATED! ⚡", deathPos, '#FF00FF');
          showEnhancedNotification('achievement', '⚡ FLYING BOSS SLAIN!', 'You defeated the Level 15 Flying Boss!');
        }
        
        updateHUD();
        updateComboCounter(true); // Phase 2: Track combo on kill
        checkAchievements(); // Check for achievements after kill
        // Rage Mode: add rage on kill
        if (window.GameRageCombat) window.GameRageCombat.addRage(8);
        // Special Atk Points: earn 1 point per 10 kills
        if (playerStats.kills % 10 === 0) {
          saveData.specialAtkPoints = (saveData.specialAtkPoints || 0) + 1;
        }
        // Harvesting: chance to drop Flesh, and spawn skinnable carcass for animal-type enemies
        if (window.GameHarvesting && this.mesh) window.GameHarvesting.onEnemyKilled(this.mesh.position, this.type);
        // Kill 7 achievement check
        if (playerStats.kills === 7 && (!saveData.achievementQuests || !saveData.achievementQuests.kill7Unlocked)) {
          if (!saveData.achievementQuests) saveData.achievementQuests = { kill7Unlocked: false, kill7Quest: 'none' };
          saveData.achievementQuests.kill7Unlocked = true;
          saveData.achievementQuests.kill7Quest = 'active';
          saveSaveData();
          showEnhancedNotification('achievement', '🏆 ACHIEVEMENT UNLOCKED: Kill 7 Enemies!', 'Visit the Achievement Building in Camp to claim your reward!');
          updateStatBar();
        }
      }
      
      // Specialized death effects by damage type
      dieStandard(enemyColor) {
        // 7 varied death animations — realistic gun kills with pumping blood
        const deathVariation = Math.floor(Math.random() * 10);
        const deathPos = this.mesh.position.clone();

        // HEARTBEAT BLEED-OUT: Every 600ms for 4 seconds, a high-pressure squirt of blood
        // shoots UP from the bullet holes, landing on the floor to expand the blood pool.
        if (window.BloodSystem && window.BloodSystem.emitHeartbeatWound) {
          window.BloodSystem.emitHeartbeatWound(deathPos, {
            pulses: 7,        // ~4 seconds at 600ms intervals
            perPulse: 120,
            interval: 600,
            woundHeight: 1.2,
            pressure: 1.0
          });
        }
        
        if (deathVariation === 0) {
          // BLOOD BURST — intense spray, wound pumps blood in pulses
          spawnParticles(deathPos, 0x8B0000, 18);
          spawnParticles(deathPos, 0xCC0000, 10);
          for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const dist = 0.4 + Math.random() * 0.8;
            spawnBloodDecal({ x: deathPos.x + Math.cos(angle) * dist, y: 0, z: deathPos.z + Math.sin(angle) * dist });
          }
          // Pumping blood: pulses of decreasing size spray from wound
          if (window.BloodSystem) {
            window.BloodSystem.emitPulse(deathPos, { pulses: 5, perPulse: 120, interval: 200, spreadXZ: 1.0, minSize: 0.02, maxSize: 0.08 });
          }
        } else if (deathVariation === 1) {
          // CORPSE WITH POOLING BLOOD — body falls, blood pools slowly
          spawnParticles(deathPos, 0x8B0000, 8);
          spawnParticles(deathPos, 0xCC0000, 4);
          const corpseGeo = new THREE.SphereGeometry(0.45, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos); corpse.position.y = 0.12; corpse.scale.y = 0.22;
          scene.add(corpse);
          const bloodGeo = new THREE.CircleGeometry(0.8, 16);
          const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8B0000, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
          const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
          bloodPool.position.set(deathPos.x, 0.05, deathPos.z); bloodPool.rotation.x = -Math.PI / 2;
          scene.add(bloodPool);
          let corpseLife = 600; // ~10 seconds at 60fps
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              corpseLife--;
              // Blood pool grows (first 0.5s) then stays full, fades only at the end
              if (corpseLife > 540) bloodMat.opacity = Math.min(0.6, (600 - corpseLife) / 60 * 0.6);
              else if (corpseLife > 60) bloodMat.opacity = 0.6;
              else bloodMat.opacity = (corpseLife / 60) * 0.6;
              corpse.material.opacity = corpseLife > 60 ? 0.85 : (corpseLife / 60) * 0.85;
              if (corpseLife <= 0) {
                scene.remove(corpse); scene.remove(bloodPool);
                corpseGeo.dispose(); corpseMat.dispose(); bloodGeo.dispose(); bloodMat.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(corpse); scene.remove(bloodPool);
            corpseGeo.dispose(); corpseMat.dispose(); bloodGeo.dispose(); bloodMat.dispose();
          }
        } else if (deathVariation === 2) {
          // BLOOD MIST — dissolves in cloud of blood particles
          spawnParticles(deathPos, 0x8B0000, 15);
          spawnParticles(deathPos, 0xCC2200, 10);
          spawnParticles(deathPos, 0x660000, 6);
          for (let i = 0; i < 4; i++) {
            spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*2.5, y: 0, z: deathPos.z + (Math.random()-0.5)*2.5 });
          }
        } else if (deathVariation === 3) {
          // SPLATTER — blood splashes radially, corpse flattened
          spawnParticles(deathPos, 0x8B0000, 18);
          spawnParticles(deathPos, 0xCC0000, 8);
          for (let i = 0; i < 6; i++) {
            const splatter = new THREE.Mesh(
              new THREE.CircleGeometry(0.15 + Math.random() * 0.25, 8),
              new THREE.MeshBasicMaterial({ color: 0x8B0000, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
            );
            const angle = (i / 6) * Math.PI * 2;
            const dist = 0.4 + Math.random() * 0.6;
            splatter.position.set(deathPos.x + Math.cos(angle)*dist, 0.05, deathPos.z + Math.sin(angle)*dist);
            splatter.rotation.x = -Math.PI / 2;
            scene.add(splatter);
            let life = 100;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                life--;
                splatter.material.opacity = (life/100) * 0.55;
                if (life <= 0) { scene.remove(splatter); splatter.geometry.dispose(); splatter.material.dispose(); return false; }
                return true;
              }});
            } else { scene.remove(splatter); splatter.geometry.dispose(); splatter.material.dispose(); }
          }
        } else if (deathVariation === 4) {
          // EXIT WOUND SPRAY — blood flies 1m+ out from back, pumping decaying pulses
          spawnParticles(deathPos, 0x8B0000, 12);
          spawnParticles(deathPos, 0xCC0000, 8);
          if (window.BloodSystem) {
            _tmpExitDir.set((Math.random()-0.5)*2, 0, (Math.random()-0.5)*2).normalize();
            const exitDir = _tmpExitDir;
            const exitPos = deathPos.clone();
            exitPos.x += exitDir.x * 0.5; exitPos.z += exitDir.z * 0.5;
            window.BloodSystem.emitExitWound(exitPos, exitDir, 80, { spread: 0.6, speed: 0.4 });
            // Pumping — smaller and smaller pulses
            window.BloodSystem.emitPulse(exitPos, { pulses: 4, perPulse: 60, interval: 250, spreadXZ: 0.8, minSize: 0.015, maxSize: 0.06 });
          }
          for (let i = 0; i < 4; i++) spawnBloodDecal(deathPos);
        } else if (deathVariation === 5) {
          // WOUND BLEED — large entry/exit wounds with blood streaming down and pooling
          spawnParticles(deathPos, 0x8B0000, 14);
          spawnParticles(deathPos, 0x660000, 8);
          // Blood drips streaming down from wound position
          for (let d = 0; d < 4 && bloodDrips.length < MAX_BLOOD_DRIPS; d++) {
            if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
            const drip = new THREE.Mesh(_sharedBloodDripGeo, new THREE.MeshBasicMaterial({ color: [0x8B0000, 0xAA0000, 0x660000, 0xCC0000][d%4] }));
            drip.scale.setScalar(0.04 + Math.random() * 0.04);
            drip.position.set(deathPos.x + (Math.random()-0.5)*0.3, deathPos.y + 0.3, deathPos.z + (Math.random()-0.5)*0.3);
            scene.add(drip);
            bloodDrips.push({ mesh: drip, velX: (Math.random()-0.5)*0.02, velZ: (Math.random()-0.5)*0.02, velY: -0.03, life: 50 + Math.floor(Math.random()*20), _sharedGeo: true });
          }
          for (let i = 0; i < 5; i++) spawnBloodDecal(deathPos);
        } else if (deathVariation === 6) {
          // STAIN DEATH — multiple ground stains in varied sizes (small to large)
          spawnParticles(deathPos, 0x8B0000, 12);
          spawnParticles(deathPos, 0xCC0000, 6);
          for (let i = 0; i < 7; i++) {
            const sizeRoll = Math.random();
            const r = sizeRoll < 0.4 ? 0.05 + Math.random()*0.1 : sizeRoll < 0.7 ? 0.15 + Math.random()*0.2 : 0.3 + Math.random()*0.3;
            const stainGeo = new THREE.CircleGeometry(r, r > 0.15 ? 10 : 6);
            const stainMat = new THREE.MeshBasicMaterial({ color: sizeRoll < 0.5 ? 0x8B0000 : 0x6B0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
            const stain = new THREE.Mesh(stainGeo, stainMat);
            stain.position.set(deathPos.x + (Math.random()-0.5)*2, 0.05, deathPos.z + (Math.random()-0.5)*2);
            stain.rotation.x = -Math.PI / 2;
            scene.add(stain);
            let life = 120;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                life--;
                stain.material.opacity = (life/120) * 0.5;
                if (life <= 0) { scene.remove(stain); stainGeo.dispose(); stainMat.dispose(); return false; }
                return true;
              }});
            } else { scene.remove(stain); stainGeo.dispose(); stainMat.dispose(); }
          }
        } else if (deathVariation === 7) {
          // CRAWL TRAIL — crawls forward leaving blood trail then face-plants
          spawnParticles(deathPos, 0x8B0000, 10);
          spawnParticles(deathPos, 0xAA0000, 6);
          const crawlGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const crawlMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const crawlBody = new THREE.Mesh(crawlGeo, crawlMat);
          crawlBody.position.copy(deathPos);
          crawlBody.position.y = 0.15;
          crawlBody.scale.y = 0.3;
          scene.add(crawlBody);
          _tmpCrawlDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          const crawlDir = _tmpCrawlDir;
          let crawlLife = 80;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              crawlLife--;
              if (crawlLife > 30) {
                crawlBody.position.x += crawlDir.x * 0.015;
                crawlBody.position.z += crawlDir.z * 0.015;
                if (crawlLife % 5 === 0) {
                  spawnBloodDecal({ x: crawlBody.position.x, y: 0, z: crawlBody.position.z });
                }
                if (window.BloodSystem && window.BloodSystem.emitCrawlTrail) {
                  window.BloodSystem.emitCrawlTrail(crawlBody.position, { x: crawlDir.x, y: 0, z: crawlDir.z });
                }
              } else if (crawlLife === 30) {
                crawlBody.scale.y = 0.15;
                crawlBody.position.y = 0.08;
                spawnParticles(crawlBody.position, 0x8B0000, 8);
              }
              if (crawlLife < 30) {
                crawlBody.material.opacity = (crawlLife / 30) * 0.85;
              }
              if (crawlLife <= 0) {
                scene.remove(crawlBody); crawlBody.geometry.dispose(); crawlBody.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(crawlBody); crawlBody.geometry.dispose(); crawlBody.material.dispose();
          }
        } else if (deathVariation === 8) {
          // ROLL OVER — body rolls sideways with tumbling animation
          spawnParticles(deathPos, 0x8B0000, 12);
          spawnParticles(deathPos, 0xCC0000, 6);
          const rollGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const rollMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const rollBody = new THREE.Mesh(rollGeo, rollMat);
          rollBody.position.copy(deathPos);
          rollBody.position.y = 0.2;
          rollBody.scale.y = 0.35;
          scene.add(rollBody);
          _tmpRollDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          const rollDir = _tmpRollDir;
          let rollLife = 90;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              rollLife--;
              if (rollLife > 30) {
                rollBody.position.x += rollDir.x * 0.02;
                rollBody.position.z += rollDir.z * 0.02;
                rollBody.rotation.z += Math.PI * 2 / 60;
                if (rollLife % 4 === 0) {
                  spawnBloodDecal({ x: rollBody.position.x, y: 0, z: rollBody.position.z });
                  spawnParticles(rollBody.position, 0x8B0000, 2);
                }
              } else if (rollLife === 30) {
                rollBody.position.y = 0.08;
                rollBody.scale.y = 0.18;
                spawnParticles(rollBody.position, 0x660000, 6);
              }
              if (rollLife < 30) {
                rollBody.material.opacity = (rollLife / 30) * 0.85;
              }
              if (rollLife <= 0) {
                scene.remove(rollBody); rollBody.geometry.dispose(); rollBody.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(rollBody); rollBody.geometry.dispose(); rollBody.material.dispose();
          }
        } else if (deathVariation === 9) {
          // STAGGER & DROP — staggers 3 steps left/right then drops
          spawnParticles(deathPos, 0x8B0000, 14);
          spawnParticles(deathPos, 0xCC0000, 8);
          const staggerGeo = new THREE.SphereGeometry(0.45, 8, 6);
          const staggerMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const staggerBody = new THREE.Mesh(staggerGeo, staggerMat);
          staggerBody.position.copy(deathPos);
          staggerBody.position.y = 0.3;
          staggerBody.scale.y = 0.4;
          scene.add(staggerBody);
          let staggerLife = 100;
          const staggerSign = Math.random() < 0.5 ? 1 : -1;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              staggerLife--;
              if (staggerLife > 40) {
                const phase = (100 - staggerLife) / 20;
                staggerBody.position.x = deathPos.x + Math.sin(phase * Math.PI) * 0.3 * staggerSign;
                staggerBody.position.z = deathPos.z + Math.cos(phase * Math.PI * 0.5) * 0.1;
                if (staggerLife % 8 === 0) spawnParticles(staggerBody.position, 0x8B0000, 3);
              } else if (staggerLife === 40) {
                staggerBody.position.y = 0.08;
                staggerBody.scale.y = 0.18;
                spawnParticles(staggerBody.position, 0x660000, 10);
                const poolGeo = new THREE.CircleGeometry(0.7, 12);
                const poolMat = new THREE.MeshBasicMaterial({ color: 0x8B0000, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
                const pool = new THREE.Mesh(poolGeo, poolMat);
                pool.position.set(staggerBody.position.x, 0.05, staggerBody.position.z);
                pool.rotation.x = -Math.PI / 2;
                scene.add(pool);
                let poolLife = 100;
                if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                  managedAnimations.push({ update(_dt) {
                    poolLife--;
                    pool.material.opacity = (poolLife / 100) * 0.6;
                    if (poolLife <= 0) { scene.remove(pool); poolGeo.dispose(); poolMat.dispose(); return false; }
                    return true;
                  }});
                } else { scene.remove(pool); poolGeo.dispose(); poolMat.dispose(); }
                for (let i = 0; i < 5; i++) spawnBloodDecal({ x: staggerBody.position.x + (Math.random()-0.5)*0.8, y: 0, z: staggerBody.position.z + (Math.random()-0.5)*0.8 });
              }
              if (staggerLife < 40) {
                staggerBody.material.opacity = (staggerLife / 40) * 0.85;
              }
              if (staggerLife <= 0) {
                scene.remove(staggerBody); staggerBody.geometry.dispose(); staggerBody.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(staggerBody); staggerBody.geometry.dispose(); staggerBody.material.dispose();
          }
        }
      }
      
      dieByFire(enemyColor) {
        // FIRE DEATH: Char & Melt — body shrinks into a tiny smoking black pile of ash
        // that stays on the floor forever. No blood.
        const deathPos = this.mesh.position.clone();

        // Skip the generic fall animation — fire death handles the mesh itself
        this._skipMainDeathAnim = true;

        // Final burst of fire and black smoke
        spawnParticles(deathPos, 0xFF4500, 18); // Orange fire
        spawnParticles(deathPos, 0xFFFF00, 8);  // Yellow flames
        spawnParticles(deathPos, 0x111111, 14); // Black smoke
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, 40, { spreadXZ: 0.8, spreadY: 0.5,
            color1: 0x222222, color2: 0x111111, minSize: 0.04, maxSize: 0.12, minLife: 20, maxLife: 50 });
        }

        // Instantly scale the mesh to 0 — it has already been charred visually by the hit reaction
        if (this.mesh) this.mesh.scale.set(0, 0, 0);

        // Permanent tiny black ash pile — stays on the floor forever (no removal)
        const ashGeo  = new THREE.SphereGeometry(0.18, 6, 4);
        const ashMat  = new THREE.MeshBasicMaterial({ color: 0x0A0A0A, transparent: true, opacity: 0.92 });
        const ash     = new THREE.Mesh(ashGeo, ashMat);
        ash.position.set(deathPos.x, 0.06, deathPos.z);
        ash.scale.set(2.2, 0.22, 2.2); // Flat, small ash pile
        scene.add(ash);

        // Permanent char burn mark on the ground
        const burnGeo = new THREE.CircleGeometry(0.55, 12);
        const burnMat = new THREE.MeshBasicMaterial({ color: 0x080808, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
        const burn    = new THREE.Mesh(burnGeo, burnMat);
        burn.rotation.x = -Math.PI / 2;
        burn.position.set(deathPos.x, 0.04, deathPos.z);
        scene.add(burn);

        // Smoking ash: black smoke particles rise from the pile for several seconds
        let ashSmokeTimer = 0;
        let ashSmokeCount = 20;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            ashSmokeTimer++;
            if (ashSmokeTimer % 8 === 0 && ashSmokeCount > 0) {
              ashSmokeCount--;
              if (typeof smokeParticles !== 'undefined' && typeof MAX_SMOKE_PARTICLES !== 'undefined' &&
                  smokeParticles.length < MAX_SMOKE_PARTICLES && scene) {
                if (typeof _ensureSmokePool === 'function') _ensureSmokePool();
                const _entry = (typeof _smokePool !== 'undefined' && _smokePool) ? _smokePool.get() : (() => {
                  const _sg = new THREE.SphereGeometry(0.07, 5, 5);
                  const _sm = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.45 });
                  const _s  = new THREE.Mesh(_sg, _sm);
                  return { mesh: _s, material: _sm, geometry: _sg, velocity: { x: 0, y: 0, z: 0 }, life: 0, maxLife: 35 };
                })();
                _entry.mesh.position.set(deathPos.x + (Math.random()-0.5)*0.12, 0.1 + Math.random()*0.15, deathPos.z + (Math.random()-0.5)*0.12);
                _entry.velocity.x = (Math.random()-0.5)*0.012;
                _entry.velocity.y = 0.018+Math.random()*0.012;
                _entry.velocity.z = (Math.random()-0.5)*0.012;
                _entry.life = 35;
                _entry.maxLife = 35;
                if (_entry.material && _entry.material.color) {
                  _entry.material.color.setHex(0x111111);
                  _entry.material.opacity = 0.45;
                }
                _entry.mesh.visible = true;
                if (!_entry.mesh.parent && scene) scene.add(_entry.mesh);
                smokeParticles.push(_entry);
              }
            }
            return ashSmokeCount > 0;
          }});
        }
      }
      
      
      dieByIce(enemyColor) {
        // Enhanced ice death: crack → struggle → shatter, leaves ice chunks + water pools
        // Ice Spear weapon gets extra shatter effect (15+ chunks that slide on ground)
        const deathPos = this.mesh.position.clone();
        const isIceSpear = this.lastDamageType === 'iceSpear';

        spawnParticles(deathPos, 0x87CEEB, isIceSpear ? 25 : 15); // Light blue ice
        spawnParticles(deathPos, 0xFFFFFF, isIceSpear ? 20 : 12); // White frost

        // Ice Spear: Freeze enemy solid with visual effect
        if (isIceSpear && this.mesh && this.mesh.material) {
          // Turn material white/blue frozen
          if (this.mesh.material._isShared) {
            this.mesh.material = this.mesh.material.clone();
            this.mesh.material._isShared = false;
          }
          this.mesh.material.color.setHex(0xDDEEFF);
          this.mesh.material.roughness = 0.1;
          this.mesh.material.metalness = 0.8;
          this.mesh.material.needsUpdate = true;
        }

        // Ice crack particles
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, isIceSpear ? 60 : 40, {
            spreadXZ: isIceSpear ? 0.8 : 0.5,
            spreadY: isIceSpear ? 0.6 : 0.4,
            color1: 0xAEEEFF,
            color2: 0xFFFFFF,
            minSize: 0.05,
            maxSize: 0.14,
            minLife: 30,
            maxLife: 60
          });
        }

        // Brief struggle: body shakes before shattering
        let struggleCount = 0;
        const sx = deathPos.x, sz = deathPos.z;
        const struggleInterval = setInterval(() => {
          struggleCount++;
          if (this.mesh) {
            this.mesh.position.x = sx + (Math.random()-0.5) * (struggleCount < 4 ? 0.06 : 0.12);
            this.mesh.position.z = sz + (Math.random()-0.5) * (struggleCount < 4 ? 0.06 : 0.12);
            this.mesh.rotation.y += (Math.random()-0.5) * 0.3;
          }
          if (struggleCount >= 10) clearInterval(struggleInterval);
        }, 40);

        // Shatter into ice shards (Ice Spear gets 15+ chunks that slide)
        const shardCount = isIceSpear ? 18 : 10;
        for(let i = 0; i < shardCount; i++) {
          const shardGeo = new THREE.ConeGeometry(0.1, 0.3, 4);
          const shardMat = new THREE.MeshBasicMaterial({ 
            color: 0xADD8E6, // Light ice blue
            transparent: true,
            opacity: 0.7
          });
          const shard = new THREE.Mesh(shardGeo, shardMat);
          shard.position.copy(deathPos);
          scene.add(shard);
          
          const angle = (i / shardCount) * Math.PI * 2;
          // Ice Spear chunks slide on ground with friction
          const vel = new THREE.Vector3(
            Math.cos(angle) * (isIceSpear ? 0.4 : 0.3),
            0.4 + Math.random() * 0.2,
            Math.sin(angle) * (isIceSpear ? 0.4 : 0.3)
          );

          let life = isIceSpear ? 120 : 60; // Ice Spear chunks last longer
          const GROUND_Y = 0.05;
          let grounded = false;

          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;

              // Physics
              shard.position.add(vel);
              vel.y -= 0.03;

              // Ground collision with slide
              if (shard.position.y <= GROUND_Y) {
                shard.position.y = GROUND_Y;
                if (!grounded) {
                  vel.y = 0;
                  grounded = true;
                }
                // Ice Spear: chunks slide on ground with friction
                if (isIceSpear) {
                  vel.x *= 0.96; // Low friction for ice
                  vel.z *= 0.96;
                  shard.rotation.y += 0.1; // Spin on ground
                } else {
                  vel.x *= 0.85;
                  vel.z *= 0.85;
                }
              }

              shard.rotation.x += grounded ? 0.05 : 0.2;
              shard.rotation.z += grounded ? 0.05 : 0.15;
              shard.material.opacity = (life / (isIceSpear ? 120 : 60)) * 0.7;

              if (life <= 0) {
                scene.remove(shard);
                shard.geometry.dispose();
                shard.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(shard);
            shard.geometry.dispose();
            shard.material.dispose();
          }
        }

        // Water pool left on ground after ice melts
        setTimeout(() => {
          if (!scene) return;
          const waterGeo = new THREE.CircleGeometry(0.6 + Math.random() * 0.3, 12);
          const waterMat = new THREE.MeshBasicMaterial({ color: 0x88CCFF, transparent: true, opacity: 0.55, depthWrite: false });
          const water = new THREE.Mesh(waterGeo, waterMat);
          water.rotation.x = -Math.PI / 2;
          water.position.set(deathPos.x, 0.05, deathPos.z);
          scene.add(water);
          let wLife = 180;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              wLife--;
              water.material.opacity = (wLife / 180) * 0.55;
              if (wLife <= 0) { scene.remove(water); water.geometry.dispose(); water.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(water); water.geometry.dispose(); water.material.dispose(); }});
          } else {
            scene.remove(water); water.geometry.dispose(); water.material.dispose();
          }
        }, 300);
      }
      
      dieByLightning(enemyColor) {
        // LIGHTNING DEATH: Violent shake, swell, cook into blackened smoking husk
        // Enemy violently shakes, swells slightly, then cooks into blackened husk with smoke
        const deathPos = this.mesh.position.clone();

        // Skip the generic fall animation — lightning death handles the mesh itself
        this._skipMainDeathAnim = true;

        // Final electric flash
        spawnParticles(deathPos, 0xFFFF00, 12); // Yellow lightning
        spawnParticles(deathPos, 0xFFFFFF, 10); // White flash
        spawnParticles(deathPos, 0x4444FF, 8);  // Blue electric arcs
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, 30, { spreadXZ: 0.7, spreadY: 0.6,
            color1: 0xFFFFFF, color2: 0x8888FF, minSize: 0.03, maxSize: 0.09, minLife: 15, maxLife: 40 });
        }

        // Phase 1: VIOLENT SHAKE (rapid alternating rotation)
        let shakePhase = 0;
        const originalScale = this.mesh ? this.mesh.scale.clone() : new THREE.Vector3(1, 1, 1);
        const shakeInterval = setInterval(() => {
          shakePhase++;
          if (!this.mesh) {
            clearInterval(shakeInterval);
            return;
          }

          // Violent alternating rotations
          this.mesh.rotation.x = (Math.random() - 0.5) * 0.8;
          this.mesh.rotation.z = (Math.random() - 0.5) * 0.8;

          // Swell slightly as energy builds
          const swellFactor = 1.0 + (shakePhase / 20) * 0.3; // Up to 30% larger
          this.mesh.scale.copy(originalScale).multiplyScalar(swellFactor);

          // Electric spark particles during shake
          if (shakePhase % 2 === 0) {
            spawnParticles(this.mesh.position, 0xFFFF00, 2);
          }

          // After 20 shakes (~0.4 seconds), transition to cooking phase
          if (shakePhase >= 20) {
            clearInterval(shakeInterval);

            // Phase 2: COOK INTO BLACKENED HUSK
            // Turn material black/charred
            if (this.mesh.material) {
              if (this.mesh.material._isShared) {
                this.mesh.material = this.mesh.material.clone();
                this.mesh.material._isShared = false;
              }
              this.mesh.material.color.setHex(0x1A1A1A); // Charcoal black
              this.mesh.material.emissive.setHex(0x330000); // Faint red ember glow
              this.mesh.material.emissiveIntensity = 0.3;
              this.mesh.material.roughness = 1.0;
              this.mesh.material.needsUpdate = true;
            }

            // Reset rotations and scale down slightly (cooked/shriveled)
            this.mesh.rotation.set(0, 0, 0);
            this.mesh.scale.copy(originalScale).multiplyScalar(0.85);

            // Smoke particles rising from the cooked husk
            let smokeTimer = 0;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                smokeTimer++;
                // Emit smoke particles every few frames
                if (smokeTimer % 8 === 0 && smokeTimer < 240) { // Smoke for ~4 seconds
                  spawnParticles(deathPos, 0x333333, 1); // Dark smoke
                  spawnParticles(deathPos, 0x555555, 1); // Grey smoke
                }
                return smokeTimer < 240;
              }});
            }
          }
        }, 20); // Shake every 20ms for violent effect

        // Permanent blackened husk on the floor (no blue spark, just smoking corpse)
        // The mesh itself stays as the husk
      }

      dieByMeteor(enemyColor) {
        // METEOR/MISSILE DEATH: Crushing impact — instant flatten (scale.y = 0.1)
        // Creates massive dark red/black crater decal, splashes blood on nearby enemies
        const deathPos = this.mesh.position.clone();

        // Skip the generic fall animation
        this._skipMainDeathAnim = true;

        // Massive impact particles
        spawnParticles(deathPos, 0xFF4400, 20); // Orange explosion
        spawnParticles(deathPos, 0xFFAA00, 15); // Yellow fire
        spawnParticles(deathPos, 0x8B0000, 25); // Dark red blood
        spawnParticles(deathPos, 0x330000, 15); // Nearly black blood

        // Blood explosion burst
        if (window.BloodSystem) {
          window.BloodSystem.emitMeteorExplosion(deathPos, 80, {
            spreadXZ: 2.0,
            spreadY: 0.8,
            color1: 0x8B0000,
            color2: 0x330000
          });
        }

        // INSTANTLY FLATTEN enemy (scale.y = 0.1, complete annihilation)
        if (this.mesh) {
          this.mesh.scale.y = 0.1;
          this.mesh.position.y = 0.05; // Squashed into ground

          // Turn material dark/bloodied
          if (this.mesh.material) {
            if (this.mesh.material._isShared) {
              this.mesh.material = this.mesh.material.clone();
              this.mesh.material._isShared = false;
            }
            this.mesh.material.color.setHex(0x2A0000); // Dark blood red
            this.mesh.material.needsUpdate = true;
          }
        }

        // Create massive dark red/black crater decal on floor
        const craterGeo = new THREE.CircleGeometry(1.2, 16);
        const craterMat = new THREE.MeshBasicMaterial({
          color: 0x1A0000,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const crater = new THREE.Mesh(craterGeo, craterMat);
        crater.rotation.x = -Math.PI / 2;
        crater.position.set(deathPos.x, 0.04, deathPos.z);
        scene.add(crater);

        // Crater fades slowly over time
        let craterLife = 360; // ~6 seconds
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            craterLife--;
            crater.material.opacity = (craterLife / 360) * 0.85;
            if (craterLife <= 0) {
              scene.remove(crater);
              crater.geometry.dispose();
              crater.material.dispose();
              return false;
            }
            return true;
          }});
        }

        // SPLASH BLOOD ON NEARBY ENEMIES (within 3 units)
        if (enemies) {
          for (let ne = 0; ne < enemies.length; ne++) {
            const other = enemies[ne];
            if (other === this || other.isDead || !other.mesh) continue;

            const dx = other.mesh.position.x - deathPos.x;
            const dz = other.mesh.position.z - deathPos.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < 9.0) { // Within 3 units
              // Stain the nearby enemy with heavy blood splatter
              if (other.mesh.material && other.mesh.material.color) {
                if (other.mesh.material._isShared) {
                  other.mesh.material = other.mesh.material.clone();
                  other.mesh.material._isShared = false;
                }
                if (!other._originalColor) other._originalColor = other.mesh.material.color.clone();

                const stainAmt = Math.max(0, 0.4 * (1 - Math.sqrt(distSq) / 3));
                if (!Enemy._bloodColor) Enemy._bloodColor = new THREE.Color(0x8B0000);
                other.mesh.material.color.lerp(Enemy._bloodColor, stainAmt);

                // Spawn blood particles on the splattered enemy
                spawnParticles(other.mesh.position, 0x8B0000, Math.floor(stainAmt * 10));
              }
            }
          }
        }
      }

      dieByShotgun(enemyColor) {
        // "INSIDE-OUT BLOWOUT": Massive blunt/explosive hit — scales mesh to pancake on X/Z,
        // instantly deletes the Torso segment, spawns 30 meat chunks, blasts Head 15 units back.
        // ENHANCED: Now spawns guts, brains, and bones using TraumaSystem
        const deathPos = this.mesh.position.clone();

        // ── Pancake mesh scale: rapidly squash Y while expanding X/Z ──────────────
        if (this.mesh) {
          this.mesh.scale.set(2.8 + Math.random() * 0.8, 0.12 + Math.random() * 0.10, 2.8 + Math.random() * 0.8);
        }

        // ── Instantly delete Torso segment ────────────────────────────────────────
        if (this.torsoGroup) {
          this.torsoGroup.visible = false;
          if (this.anatomy && this.anatomy.torso) this.anatomy.torso.attached = false;
        }

        // Calculate backward velocity from bullet direction
        const bulletVX = this._lastHitVX || 0;
        const bulletVZ = this._lastHitVZ || 1;
        const bulletLen = Math.sqrt(bulletVX * bulletVX + bulletVZ * bulletVZ) || 1;
        const backwardDir = {
          x: -bulletVX / bulletLen,
          y: 0,
          z: -bulletVZ / bulletLen
        };

        // ── TRAUMA SYSTEM: Spawn guts, brains, bones ─────────────────────────────
        if (window.TraumaSystem) {
          // Guts (intestines): 10-15 long pinkish cylinders
          const gutCount = 10 + Math.floor(Math.random() * 6);
          const gutVelocity = {
            x: backwardDir.x * 0.25,
            y: 0.3,
            z: backwardDir.z * 0.25
          };
          TraumaSystem.spawnGuts(deathPos, gutCount, gutVelocity);

          // Brains: 3-5 grey/pink bouncy spheres (from head)
          const brainCount = 3 + Math.floor(Math.random() * 3);
          const brainVelocity = {
            x: backwardDir.x * 0.3,
            y: 0.4,
            z: backwardDir.z * 0.3
          };
          TraumaSystem.spawnBrains(deathPos, brainCount, brainVelocity);

          // Bones: 8-12 white shards
          const boneCount = 8 + Math.floor(Math.random() * 5);
          const boneVelocity = {
            x: backwardDir.x * 0.2,
            y: 0.25,
            z: backwardDir.z * 0.2
          };
          TraumaSystem.spawnBones(deathPos, boneCount, boneVelocity);

          // Register corpse for heartbeat blood pump system
          // Collect existing wounds from this enemy for pumping
          const bulletHoles = [];
          if (this._traumaWounds) {
            this._traumaWounds.forEach(wound => {
              if (wound.position) {
                bulletHoles.push({
                  pos: wound.position.clone(),
                  dir: backwardDir
                });
              }
            });
          }
          TraumaSystem.registerCorpse(deathPos, 'shotgun', bulletHoles);
        }

        // ── Blast Head segment 15 units backwards ────────────────────────────────
        if (this.headGroup) {
          // Detach head from parent, add to scene at world position
          const _headWorldPos = new THREE.Vector3();
          this.headGroup.getWorldPosition(_headWorldPos);
          this.headGroup.visible = false; // hide original
          if (this.anatomy && this.anatomy.head) this.anatomy.head.attached = false;

          const _hGeo = new THREE.SphereGeometry(0.18, 7, 6);
          const _hMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.95 });
          const _hMesh = new THREE.Mesh(_hGeo, _hMat);
          _hMesh.position.copy(_headWorldPos);
          scene.add(_hMesh);

          // Direction away from player for the head blast
          const _px = player ? player.mesh.position.x : deathPos.x;
          const _pz = player ? player.mesh.position.z : deathPos.z;
          const _bdx = deathPos.x - _px;
          const _bdz = deathPos.z - _pz;
          const _blen = Math.sqrt(_bdx*_bdx + _bdz*_bdz) || 1;
          const _blastVX = (_bdx / _blen) * 0.42 + (Math.random()-0.5)*0.15;
          const _blastVZ = (_bdz / _blen) * 0.42 + (Math.random()-0.5)*0.15;
          let _blastVY = 0.38;
          let _headLife = 80;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              _headLife--;
              _blastVY -= 0.016;
              _hMesh.position.x += _blastVX;
              _hMesh.position.y += _blastVY;
              _hMesh.position.z += _blastVZ;
              _hMesh.rotation.x += 0.18;
              _hMesh.rotation.z += 0.12;
              if (_hMesh.position.y < 0.18) {
                _hMesh.position.y = 0.18;
                _blastVY = Math.abs(_blastVY) * 0.15;
              }
              if (_headLife % 4 === 0 && _headLife > 20) spawnBloodDecal(_hMesh.position);
              if (_headLife < 20) _hMat.opacity = (_headLife / 20) * 0.95;
              if (_headLife <= 0) {
                scene.remove(_hMesh); _hGeo.dispose(); _hMat.dispose();
                return false;
              }
              return true;
            }, cleanup() { scene.remove(_hMesh); _hGeo.dispose(); _hMat.dispose(); }});
          } else { scene.remove(_hMesh); _hGeo.dispose(); _hMat.dispose(); }
        }

        spawnParticles(deathPos, 0x8B0000, 30); // Lots of blood
        spawnParticles(deathPos, 0xCC0000, 20); // Bright splatter
        spawnParticles(deathPos, 0xFF2200, 10); // Vivid gore
        // Advanced blood burst + viscera for heavy shotgun damage
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, 800, { spreadXZ: 2.2, spreadY: 0.4 });
          window.BloodSystem.emitGuts(deathPos);
          // Meteor explosion effect for massive blast
          if (window.BloodSystem.emitMeteorExplosion) {
            window.BloodSystem.emitMeteorExplosion(deathPos, 200, { radius: 3.0 });
          }
          // Heartbeat blood pumping from severed body
          if (window.BloodSystem.emitHeartbeatWound) {
            window.BloodSystem.emitHeartbeatWound(deathPos, { pulses: 4, perPulse: 150, interval: 300 });
          }
          // Growing blood pool beneath
          if (window.BloodSystem.emitPoolGrow) {
            window.BloodSystem.emitPoolGrow(deathPos, { maxRadius: 2.0, growSpeed: 0.03 });
          }
        }

        // Scatter blood decals in a wide radius
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const dist = 0.3 + Math.random() * 1.5;
          spawnBloodDecal({ x: deathPos.x + Math.cos(angle) * dist, y: 0, z: deathPos.z + Math.sin(angle) * dist });
        }

        // ── 30 MEAT/FLESH CHUNKS flying outward in a full cone — "Inside-Out Blowout" ──
        const bulletAngle = Math.atan2(bulletVZ, bulletVX);
        const chunkCount = 30; // Exactly 30 per spec
        const goreColors = [0x8B0000, 0x660000, 0x4A0000, 0x550011, 0xAA2200, 0xCC1100];
        const _sgChunks = [];
        for (let ci = 0; ci < chunkCount; ci++) {
          const chunkSize = 0.12 + Math.random() * 0.22; // Larger than standard chunks
          const isBox = Math.random() >= 0.5;
          const chunkColor = goreColors[ci % goreColors.length];
          // Use global object pool to avoid per-chunk allocation / GC stutter.
          let chunkEntry;
          if (window.GameObjectPool) {
            chunkEntry = window.GameObjectPool.getChunk(isBox, chunkSize, chunkColor, deathPos);
          } else {
            const chunkGeo = isBox
              ? new THREE.BoxGeometry(chunkSize * 1.2, chunkSize * 0.8, chunkSize)
              : new THREE.SphereGeometry(chunkSize, 5, 4);
            const chunkMat = new THREE.MeshBasicMaterial({ color: chunkColor, transparent: true, opacity: 0.95 });
            chunkEntry = { mesh: new THREE.Mesh(chunkGeo, chunkMat), geo: chunkGeo, mat: chunkMat };
          }
          const chunk = chunkEntry.mesh;
          chunk.position.copy(deathPos);
          chunk.position.y += 0.2 + Math.random() * 0.5;
          scene.add(chunk);
          // Cone spread: chunks fly backward (opposite of bullet dir) within a ~120° cone
          const coneHalf = Math.PI * 0.33; // 60° each side = 120° total
          const spreadAngle = bulletAngle + Math.PI + (Math.random() - 0.5) * coneHalf * 2;
          const speed = 0.18 + Math.random() * 0.22;
          _sgChunks.push({
            mesh: chunk, geo: chunkEntry.geo, mat: chunkEntry.mat, _poolEntry: chunkEntry,
            vx: Math.cos(spreadAngle) * speed,
            vy: 0.12 + Math.random() * 0.28,
            vz: Math.sin(spreadAngle) * speed,
            rotX: (Math.random() - 0.5) * 0.35,
            rotZ: (Math.random() - 0.5) * 0.35,
            life: 90 + Math.floor(Math.random() * 50)
          });
        }
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            for (let ci = _sgChunks.length - 1; ci >= 0; ci--) {
              const c = _sgChunks[ci];
              c.life--;
              c.vy -= 0.014;
              c.mesh.position.x += c.vx;
              c.mesh.position.y += c.vy;
              c.mesh.position.z += c.vz;
              c.mesh.rotation.x += c.rotX;
              c.mesh.rotation.z += c.rotZ;
              if (c.mesh.position.y < 0.05) {
                c.mesh.position.y = 0.05;
                c.vy = Math.abs(c.vy) * 0.25;
                c.vx *= 0.6; c.vz *= 0.6;
                if (Math.random() < 0.6) spawnBloodDecal(c.mesh.position);
              }
              if (c.life % 5 === 0 && c.life > 20 && window.BloodSystem) {
                window.BloodSystem.emitBurst(c.mesh.position, 4, { spreadXZ: 0.3, spreadY: 0.1 });
              }
              if (c.life < 20) c.mat.opacity = c.life / 20;
              if (c.life <= 0) {
                scene.remove(c.mesh);
                // Return to pool (5 s delay) instead of disposing geometry/material.
                if (window.GameObjectPool && c._poolEntry) {
                  window.GameObjectPool.releaseChunk(c._poolEntry);
                } else {
                  c.geo.dispose(); c.mat.dispose();
                }
                _sgChunks.splice(ci, 1);
              }
            }
            return _sgChunks.length > 0;
          }, cleanup() {
            for (const c of _sgChunks) {
              if (c.mesh.parent) scene.remove(c.mesh);
              if (window.GameObjectPool && c._poolEntry) {
                window.GameObjectPool.releaseChunk(c._poolEntry);
              } else {
                c.geo.dispose(); c.mat.dispose();
              }
            }
            _sgChunks.length = 0;
          }});
        } else {
          for (const c of _sgChunks) {
            scene.remove(c.mesh);
            if (window.GameObjectPool && c._poolEntry) {
              window.GameObjectPool.releaseChunk(c._poolEntry);
            } else {
              c.geo.dispose(); c.mat.dispose();
            }
          }
        }

        // ── Upper body ─────────────────────────────────────────────────────────
        const upperGeo = new THREE.SphereGeometry(0.35, 8, 8);
        const upperMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
        const upper = new THREE.Mesh(upperGeo, upperMat);
        upper.position.copy(deathPos);
        upper.position.y += 0.4;
        scene.add(upper);
        // Intestine strands hanging from upper half (dark pink cylinder)
        for (let g = 0; g < 3; g++) {
          const gutGeo = new THREE.CylinderGeometry(0.025, 0.015, 0.3 + Math.random() * 0.2, 4);
          const gutMat = new THREE.MeshBasicMaterial({ color: [0xFF69B4, 0xCC2244, 0x8B1A1A][g % 3] });
          const gut = new THREE.Mesh(gutGeo, gutMat);
          gut.position.set((Math.random() - 0.5) * 0.2, -0.25, (Math.random() - 0.5) * 0.2);
          gut.rotation.z = (Math.random() - 0.5) * 0.5;
          upper.add(gut);
        }

        // ── Lower body ─────────────────────────────────────────────────────────
        const lowerGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.35, 7);
        const lowerMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
        const lower = new THREE.Mesh(lowerGeo, lowerMat);
        lower.position.copy(deathPos);
        lower.position.y += 0.15;
        scene.add(lower);
        // Intestines from lower half too
        for (let g = 0; g < 2; g++) {
          const gutGeo = new THREE.CylinderGeometry(0.025, 0.015, 0.25 + Math.random() * 0.15, 4);
          const gutMat = new THREE.MeshBasicMaterial({ color: [0xFF69B4, 0x8B1A1A][g % 2] });
          const gut = new THREE.Mesh(gutGeo, gutMat);
          gut.position.set((Math.random() - 0.5) * 0.15, 0.22, (Math.random() - 0.5) * 0.15);
          lower.add(gut);
        }

        // ── Physics ────────────────────────────────────────────────────────────
        // Body flies backward and glides on ground leaving blood smear trail
        const slideAngle = Math.random() * Math.PI * 2;
        const slideSpd = 0.12 + Math.random() * 0.08; // Faster slide from shotgun power
        let upperVelY = 0.06;
        let lowerSlideX = Math.cos(slideAngle) * slideSpd;
        let lowerSlideZ = Math.sin(slideAngle) * slideSpd;
        let splitLife = 160;
        let dragTimer = 0;

        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            splitLife--;
            dragTimer++;

            // Lower half slides/glides backward, leaving blood trail
            lower.position.x += lowerSlideX;
            lower.position.z += lowerSlideZ;
            lowerSlideX *= 0.95; // Friction
            lowerSlideZ *= 0.95;

            // Blood drag trail every 2 frames — heavy blood smear on ground where body glides
            if (dragTimer % 2 === 0 && window.BloodSystem) {
              window.BloodSystem.emitDragTrail(lower.position, { x: lowerSlideX, y: 0, z: lowerSlideZ }, 12);
            }
            // Ground blood stain smears along glide path
            if (dragTimer % 3 === 0) {
              spawnBloodDecal(lower.position);
            }

            // Upper half: drop organs after brief pause, then collapse
            if (splitLife < 100) {
              upperVelY -= 0.012;
              upper.position.y += upperVelY;
              upper.rotation.x += 0.04;
              upper.rotation.z += 0.03;
              if (upper.position.y < 0.1) upper.position.y = 0.1;
            }

            if (splitLife < 30) {
              upper.material.opacity = splitLife / 30;
              lower.material.opacity = splitLife / 30;
            }

            if (splitLife <= 0) {
              scene.remove(upper); scene.remove(lower);
              upper.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
              lower.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
              return false;
            }
            return true;
          }, cleanup() {
            scene.remove(upper); scene.remove(lower);
            upper.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
            lower.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
          }});
        } else {
          scene.remove(upper); scene.remove(lower);
          upper.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
          lower.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        }

        // Large blood pool at split point
        const bloodGeo = new THREE.CircleGeometry(1.2, 16);
        const bloodMat = new THREE.MeshBasicMaterial({ 
          color: 0x8B0000, 
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide
        });
        const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
        bloodPool.position.copy(deathPos);
        bloodPool.position.y = 0.05;
        bloodPool.rotation.x = -Math.PI / 2;
        scene.add(bloodPool);
        
        // Fade blood pool
        let life = 150;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
        managedAnimations.push({ update(_dt) {
          life--;
          bloodPool.material.opacity = (life / 150) * 0.7;
          if (life <= 0) {
            scene.remove(bloodPool);
            bloodPool.geometry.dispose();
            bloodPool.material.dispose();
            return false;
          }
          return true;
        }, cleanup() { scene.remove(bloodPool); bloodPool.geometry.dispose(); bloodPool.material.dispose(); }});
        } else {
          scene.remove(bloodPool);
          bloodPool.geometry.dispose(); bloodPool.material.dispose();
        }
      }
      
      dieBySpinDeath(enemyColor) {
        // Yellow enemy: 180-degree spin with continuous neck blood arc trail
        const deathPos = this.mesh.position.clone();
        spawnParticles(deathPos, 0x8B0000, 20);
        spawnParticles(deathPos, 0xCC0000, 10);

        // Create spinning body proxy
        const bodyGeo = new THREE.SphereGeometry(0.4, 8, 8);
        const bodyMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.copy(deathPos);
        scene.add(body);

        let spinAngle = 0;
        let spinLife = 90; // ~1.5 seconds at 60fps
        const spinSpeed = (Math.PI) / 30; // 180° in ~30 frames, then continues

        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            spinLife--;
            spinAngle += spinSpeed;
            body.rotation.y = spinAngle;

            // Blood spray from neck following the spin
            if (window.BloodSystem && spinLife > 15) {
              window.BloodSystem.emitSpinTrail(body.position, spinAngle, 4);
            }

            // Scatter blood decal spots on ground as it spins
            if (spinLife % 5 === 0) {
              const splatAngle = spinAngle;
              const dist = 0.5 + Math.random() * 1.5;
              spawnBloodDecal({ x: deathPos.x + Math.cos(splatAngle) * dist, y: 0, z: deathPos.z + Math.sin(splatAngle) * dist });
            }

            if (spinLife < 25) {
              body.material.opacity = spinLife / 25;
            }
            if (spinLife <= 0) {
              scene.remove(body);
              body.geometry.dispose(); body.material.dispose();
              return false;
            }
            return true;
          }, cleanup() {
            scene.remove(body);
            body.geometry.dispose(); body.material.dispose();
          }});
        } else {
          scene.remove(body);
          body.geometry.dispose(); body.material.dispose();
        }
      }
      
      dieByGlideSpin(enemyColor, dirX, dirZ, moveSpeed) {
        // GLIDE & SPIN DEATH: Enemy killed while moving fast continues gliding and spins wildly.
        // Creates a radial/spiral blood skid mark on the floor.
        const deathPos = this.mesh.position.clone();

        const bodyGeo = new THREE.SphereGeometry(0.42, 8, 8);
        const bodyMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.copy(deathPos);
        body.position.y = 0.18;
        body.scale.y = 0.4;
        scene.add(body);

        let glideLife = 90; // ~1.5 seconds at 60fps
        let glideVX = dirX * moveSpeed * 2.5;
        let glideVZ = dirZ * moveSpeed * 2.5;
        let spinAngleX = 0;
        let spinAngleZ = 0;
        const spinSpeedX = 0.18 + Math.random() * 0.12; // Wild X-axis spin
        const spinSpeedZ = 0.14 + Math.random() * 0.10; // Wild Z-axis spin
        let bloodFrameCounter = 0;

        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            glideLife--;
            // Friction deceleration
            glideVX *= 0.96;
            glideVZ *= 0.96;
            body.position.x += glideVX;
            body.position.z += glideVZ;
            // Wild spin on X and Z axes (not Y) — tumbling corpse
            spinAngleX += spinSpeedX;
            spinAngleZ += spinSpeedZ;
            body.rotation.x = spinAngleX;
            body.rotation.z = spinAngleZ;

            // Radial blood spatter: emit 2-3 blood particles every frame
            bloodFrameCounter++;
            if (window.BloodSystem && glideLife > 10) {
              const dropCount = 2 + (bloodFrameCounter % 2 === 0 ? 1 : 0);
              window.BloodSystem.emitSpinTrail(body.position, spinAngleX + spinAngleZ, dropCount);
              // Also paint a ground stain at current position every 3rd frame
              if (bloodFrameCounter % 3 === 0) {
                window.BloodSystem.emitDragTrail(body.position, { x: glideVX, y: 0, z: glideVZ }, 3);
              }
            }

            if (glideLife < 20) {
              body.material.opacity = glideLife / 20;
            }
            if (glideLife <= 0) {
              scene.remove(body);
              body.geometry.dispose(); body.material.dispose();
              return false;
            }
            return true;
          }, cleanup() {
            scene.remove(body);
            body.geometry.dispose(); body.material.dispose();
          }});
        } else {
          scene.remove(body);
          body.geometry.dispose(); body.material.dispose();
        }
      }

      dieByHeadshot(enemyColor) {
        // FRESH IMPLEMENTATION: Enhanced headshot with actual head detachment
        // Headshot: Blood spray (reduced enemy color particles, more blood)
        spawnParticles(this.mesh.position, 0xDC143C, 20); // Crimson blood
        spawnParticles(this.mesh.position, 0x8B0000, 15); // Dark red blood
        spawnParticles(this.mesh.position, 0xCC0000, 10); // Bright blood spray
        // Advanced headshot: pulsating blood from neck/head in 180-degree spread
        if (window.BloodSystem) {
          const neckPos = this.mesh.position.clone();
          neckPos.y += 0.6;
          window.BloodSystem.emitPulse(neckPos, { pulses: 4, perPulse: 400, interval: 200, spreadXZ: 1.8, color1: 0x8B0000, color2: 0xDC143C });
          // Neck stump blood fountain
          if (window.BloodSystem.emitThroatSpray) {
            _tmpNeckDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            const neckDir = _tmpNeckDir;
            window.BloodSystem.emitThroatSpray(neckPos, neckDir, { pulses: 5, perPulse: 200, arcHeight: 1.0 });
          }
          // Head bleed fountain
          if (window.BloodSystem.emitHeadBleed) {
            window.BloodSystem.emitHeadBleed(neckPos, { intensity: 1.2, duration: 6 });
          }
        }
        
        // Create detached head that flies off with enhanced rotation
        const headGeo = new THREE.SphereGeometry(0.3, 12, 12);
        const headMat = new THREE.MeshBasicMaterial({ 
          color: enemyColor, 
          transparent: true,
          opacity: 1
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.copy(this.mesh.position);
        head.position.y += 0.5; // Start from head height
        scene.add(head);
        
        // Head velocity (flies backward and up with spin)
        _tmpHeadVel.set(
          (Math.random() - 0.5) * 0.6,
          0.8 + Math.random() * 0.4, // Upward
          (Math.random() - 0.5) * 0.6
        );
        const headVel = _tmpHeadVel;
        
        // Enhanced rotation speeds for dramatic spinning
        const rotSpeed = {
          x: 0.15 + Math.random() * 0.1,
          y: 0.2 + Math.random() * 0.15,
          z: 0.1 + Math.random() * 0.1
        };
        
        // Blood spray trail from neck
        let headLife = 80;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
        managedAnimations.push({ update(_dt) {
          headLife--;
          head.position.add(headVel);
          headVel.y -= 0.025;
          head.rotation.x += rotSpeed.x;
          head.rotation.y += rotSpeed.y;
          head.rotation.z += rotSpeed.z;
          if (headLife % 2 === 0 && headLife > 20) {
            spawnParticles(head.position, 0xDC143C, 3);
          }
          if (headLife < 20) {
            head.material.opacity = headLife / 20;
          }
          if (headLife <= 0 || head.position.y < 0) {
            scene.remove(head);
            head.geometry.dispose();
            head.material.dispose();
            return false;
          }
          return true;
        }});
        } else {
          scene.remove(head);
          head.geometry.dispose(); head.material.dispose();
        }
        
        // Body falls (corpse without head) - 3D flattened body matching enemy color
        const corpseGeo = new THREE.SphereGeometry(0.5, 8, 6);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: enemyColor, 
          transparent: true,
          opacity: 0.85
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.11;
        corpse.scale.y = 0.22; // Flat headless body
        scene.add(corpse);
        
        // Large blood splatter pool (crimson, not white!)
        const bloodGeo = new THREE.CircleGeometry(1.2, 16); // Larger pool
        const bloodMat = new THREE.MeshBasicMaterial({ 
          color: 0xDC143C, // Crimson blood
          transparent: true,
          opacity: 0.7, // More visible
          side: THREE.DoubleSide
        });
        const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
        bloodPool.position.copy(this.mesh.position);
        bloodPool.position.y = 0.05;
        bloodPool.rotation.x = -Math.PI / 2;
        scene.add(bloodPool);
        
        // Extra blood particles instead of large gore pieces (better performance)
        spawnParticles(this.mesh.position, 0xDC143C, 12); // Crimson blood burst
        spawnParticles(this.mesh.position, 0x8B0000, 8);  // Dark blood
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2;
          spawnBloodDecal({ x: this.mesh.position.x + Math.cos(angle) * (0.5 + Math.random() * 0.8), y: 0, z: this.mesh.position.z + Math.sin(angle) * (0.5 + Math.random() * 0.8) });
        }
        
        // Fade corpse
        let life = 120;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
        managedAnimations.push({ update(_dt) {
          life--;
          corpse.material.opacity = (life / 120) * 0.8;
          bloodPool.material.opacity = (life / 120) * 0.6;
          if (life <= 0) {
            scene.remove(corpse);
            scene.remove(bloodPool);
            corpse.geometry.dispose();
            corpse.material.dispose();
            bloodPool.geometry.dispose();
            bloodPool.material.dispose();
            return false;
          }
          return true;
        }});
        } else {
          scene.remove(corpse); scene.remove(bloodPool);
          corpse.geometry.dispose(); corpse.material.dispose();
          bloodPool.geometry.dispose(); bloodPool.material.dispose();
        }
      }

      dieByDrone(enemyColor) {
        const variation = Math.floor(Math.random() * 3);
        const deathPos = this.mesh.position.clone();

        if (variation === 0) {
          // RIDDLED WITH HOLES — blood mist spray (original)
          spawnParticles(deathPos, 0xAA0000, 12);
          spawnParticles(deathPos, 0xCC2200, 8);
          if (window.BloodSystem) {
            _tmpMistDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            const mistDir = _tmpMistDir;
            window.BloodSystem.emitDroneMist(deathPos, mistDir, 120, { lineLength: 0.6 });
            window.BloodSystem.emitBurst(deathPos, 80, { spreadXZ: 0.6, spreadY: 0.15, minSize: 0.01, maxSize: 0.04, minLife: 20, maxLife: 45 });
          }
          const holeCount = 15 + Math.floor(Math.random() * 6);
          for (let h = 0; h < holeCount; h++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 0.9;
            spawnBloodDecal({ x: deathPos.x + Math.cos(angle) * dist, y: 0, z: deathPos.z + Math.sin(angle) * dist });
          }
          const corpseGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.8 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos);
          corpse.position.y = 0.1;
          corpse.scale.y = 0.2;
          scene.add(corpse);
          let life = 120;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              corpse.material.opacity = (life / 120) * 0.8;
              if (life <= 0) { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); }});
          } else {
            scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose();
          }
        } else if (variation === 1) {
          // SWISS CHEESE — more holes, blood streams, body puffs up then deflates
          spawnParticles(deathPos, 0xAA0000, 16);
          spawnParticles(deathPos, 0xCC2200, 10);
          if (window.BloodSystem) {
            window.BloodSystem.emitBurst(deathPos, 100, { spreadXZ: 0.8, spreadY: 0.3, minSize: 0.01, maxSize: 0.05, minLife: 25, maxLife: 55 });
          }
          const holeCount = 22 + Math.floor(Math.random() * 8);
          const holePositions = [];
          for (let h = 0; h < holeCount; h++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 1.0;
            const hx = deathPos.x + Math.cos(angle) * dist;
            const hz = deathPos.z + Math.sin(angle) * dist;
            holePositions.push({ x: hx, z: hz });
            spawnBloodDecal({ x: hx, y: 0, z: hz });
          }
          const corpseGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos);
          corpse.position.y = 0.15;
          corpse.scale.y = 0.25;
          scene.add(corpse);
          let life = 100;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              if (life > 70) {
                const puff = 1 + (100 - life) * 0.01;
                corpse.scale.set(puff, 0.25 * puff, puff);
              } else if (life > 40) {
                const deflate = (life - 40) / 30;
                corpse.scale.set(1.3 * deflate + 0.7, 0.25 * deflate + 0.1, 1.3 * deflate + 0.7);
              }
              if (life % 6 === 0 && life > 30 && holePositions.length > 0) {
                const hp = holePositions[life % holePositions.length];
                spawnParticles({ x: hp.x, y: 0.15, z: hp.z }, 0x8B0000, 2);
              }
              corpse.material.opacity = Math.min(0.85, (life / 100) * 0.85);
              if (life <= 0) { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); }});
          } else {
            scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose();
          }
        } else {
          // OVERWHELMED COLLAPSE — tiny blood geysers, body tips sideways
          spawnParticles(deathPos, 0xAA0000, 14);
          spawnParticles(deathPos, 0x880000, 8);
          if (window.BloodSystem) {
            window.BloodSystem.emitBurst(deathPos, 60, { spreadXZ: 0.5, spreadY: 0.4, minSize: 0.01, maxSize: 0.04, minLife: 20, maxLife: 50 });
          }
          const woundPoints = [];
          for (let w = 0; w < 6; w++) {
            woundPoints.push({
              x: deathPos.x + (Math.random() - 0.5) * 0.6,
              z: deathPos.z + (Math.random() - 0.5) * 0.6
            });
            spawnBloodDecal({ x: woundPoints[w].x, y: 0, z: woundPoints[w].z });
          }
          const corpseGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.8 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos);
          corpse.position.y = 0.2;
          corpse.scale.y = 0.25;
          scene.add(corpse);
          const tipDir = Math.random() < 0.5 ? 1 : -1;
          let life = 110;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              if (life > 60) {
                corpse.rotation.z += tipDir * 0.02;
                corpse.position.y = Math.max(0.08, corpse.position.y - 0.002);
              }
              if (life % 8 === 0 && life > 30) {
                const wp = woundPoints[life % woundPoints.length];
                spawnParticles({ x: wp.x, y: 0.1, z: wp.z }, 0xAA0000, 3);
              }
              if (life < 40) {
                corpse.material.opacity = (life / 40) * 0.8;
              }
              if (life <= 0) { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); }});
          } else {
            scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose();
          }
        }
      }

      dieBySword(enemyColor) {
        const variation = Math.floor(Math.random() * 3);
        const deathPos = this.mesh.position.clone();

        if (variation === 0) {
          // DEEP SLASH — blood flow along the cut line (original)
          spawnParticles(deathPos, 0x8B0000, 18);
          spawnParticles(deathPos, 0xCC0000, 10);
          if (window.BloodSystem) {
            const slashAngle = Math.random() * Math.PI * 2;
            _tmpSlashDir.set(Math.cos(slashAngle), 0, Math.sin(slashAngle)).normalize();
            const slashDir = _tmpSlashDir;
            window.BloodSystem.emitSwordSlash(deathPos, slashDir, 120);
            window.BloodSystem.emitBurst(deathPos, 60, { spreadXZ: 0.8, spreadY: 0.2, minSize: 0.03, maxSize: 0.09, minLife: 30, maxLife: 70 });
            window.BloodSystem.emitPulse(deathPos, { pulses: 3, perPulse: 80, interval: 200, spreadXZ: 0.5, arcDir: slashDir });
          }
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            spawnBloodDecal({ x: deathPos.x + Math.cos(a) * (0.3 + Math.random() * 0.7), y: 0, z: deathPos.z + Math.sin(a) * (0.3 + Math.random() * 0.7) });
          }
          const corpseGeo = new THREE.SphereGeometry(0.45, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos);
          corpse.position.y = 0.1;
          corpse.scale.y = 0.22;
          scene.add(corpse);
          let life = 130;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              corpse.material.opacity = (life / 130) * 0.85;
              if (life <= 0) { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); }});
          } else {
            scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose();
          }
        } else if (variation === 1) {
          // CLEAVING CUT — top half slides off bottom half, blood pours from seam
          spawnParticles(deathPos, 0x8B0000, 25);
          spawnParticles(deathPos, 0xCC0000, 15);

          // Use slash direction from hits if available
          const slashDir = this._slashDirection || { x: Math.random() - 0.5, y: 0, z: Math.random() - 0.5 };
          const slashAngle = Math.atan2(slashDir.z, slashDir.x);

          if (window.BloodSystem) {
            const slashVec = new THREE.Vector3(slashDir.x, 0, slashDir.z).normalize();
            window.BloodSystem.emitSwordSlash(deathPos, slashVec, 180);
            window.BloodSystem.emitBurst(deathPos, 100, {
              spreadXZ: 1.2,
              spreadY: 0.4,
              minSize: 0.03,
              maxSize: 0.12,
              minLife: 30,
              maxLife: 90
            });
          }

          // Bottom half: stays on ground
          const bottomGeo = new THREE.CylinderGeometry(0.35, 0.30, 0.35, 8);
          const bottomMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.95 });
          const bottom = new THREE.Mesh(bottomGeo, bottomMat);
          bottom.position.copy(deathPos);
          bottom.position.y = 0.175; // Half height at ground level
          scene.add(bottom);

          // Top half: slides off
          const topGeo = new THREE.CylinderGeometry(0.38, 0.35, 0.4, 8);
          const topMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.95 });
          const top = new THREE.Mesh(topGeo, topMat);
          top.position.copy(deathPos);
          top.position.y = 0.55; // Stacked on top initially
          scene.add(top);

          // Blood seam between halves
          const seamGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 8);
          const seamMat = new THREE.MeshBasicMaterial({ color: 0x5A0000, transparent: true, opacity: 0.95 });
          const seam = new THREE.Mesh(seamGeo, seamMat);
          seam.position.copy(deathPos);
          seam.position.y = 0.37; // At cut line
          scene.add(seam);

          // Physics for top half sliding
          const slideVX = slashDir.x * 0.08;
          const slideVZ = slashDir.z * 0.08;
          let topVY = 0;
          let life = 150;
          let tiltAngle = 0;

          // Scatter blood decals
          for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            spawnBloodDecal({
              x: deathPos.x + Math.cos(angle) * (0.4 + Math.random() * 0.6),
              y: 0,
              z: deathPos.z + Math.sin(angle) * (0.4 + Math.random() * 0.6)
            });
          }

          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;

              // Top half slides off in slash direction
              if (life > 80) {
                top.position.x += slideVX;
                top.position.z += slideVZ;

                // Tilt as it slides
                tiltAngle += 0.03;
                top.rotation.z = Math.sin(tiltAngle) * 0.3;
                top.rotation.x += slashDir.z * 0.02;

                // Start falling after initial slide
                if (life < 110) {
                  topVY -= 0.015;
                  top.position.y += topVY;
                  if (top.position.y <= 0.2) {
                    top.position.y = 0.2;
                    topVY = 0;
                  }
                }

                // Blood gushes from the cut seam
                if (life % 3 === 0 && window.BloodSystem) {
                  // Blood pours from bottom half
                  window.BloodSystem.emitBurst(bottom.position, 12, {
                    spreadXZ: 0.3,
                    spreadY: 0.6,
                    direction: { x: 0, y: 1, z: 0 }
                  });
                  // Blood trails from top half as it slides
                  window.BloodSystem.emitBurst(top.position, 8, {
                    spreadXZ: 0.2,
                    spreadY: 0.1
                  });
                }

                // Blood trail decals
                if (life % 5 === 0) {
                  spawnBloodDecal(top.position);
                }

                // Move seam with top half initially
                if (life > 120) {
                  seam.position.copy(top.position);
                  seam.position.y = top.position.y - 0.18;
                }
              }

              // Fade out
              if (life < 40) {
                const fade = life / 40;
                topMat.opacity = fade * 0.95;
                bottomMat.opacity = fade * 0.95;
                seamMat.opacity = fade * 0.95;
              }

              if (life <= 0) {
                scene.remove(top);
                scene.remove(bottom);
                scene.remove(seam);
                topGeo.dispose();
                topMat.dispose();
                bottomGeo.dispose();
                bottomMat.dispose();
                seamGeo.dispose();
                seamMat.dispose();
                return false;
              }
              return true;
            }, cleanup() {
              scene.remove(top);
              scene.remove(bottom);
              scene.remove(seam);
              topGeo.dispose();
              topMat.dispose();
              bottomGeo.dispose();
              bottomMat.dispose();
              seamGeo.dispose();
              seamMat.dispose();
            }});
          } else {
            scene.remove(top);
            scene.remove(bottom);
            scene.remove(seam);
            topGeo.dispose();
            topMat.dispose();
            bottomGeo.dispose();
            bottomMat.dispose();
            seamGeo.dispose();
            seamMat.dispose();
          }
        } else {
          // MULTIPLE CUTS — 3 slash lines, blood pours from each, body collapses in segments
          spawnParticles(deathPos, 0x8B0000, 22);
          spawnParticles(deathPos, 0xCC0000, 14);
          const slashDirs = [];
          for (let s = 0; s < 3; s++) {
            const a = Math.random() * Math.PI * 2;
            slashDirs.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).normalize());
            if (window.BloodSystem) {
              window.BloodSystem.emitSwordSlash(
                { x: deathPos.x + (Math.random()-0.5)*0.3, y: deathPos.y, z: deathPos.z + (Math.random()-0.5)*0.3 },
                slashDirs[s], 100
              );
            }
          }
          if (window.BloodSystem) {
            window.BloodSystem.emitBurst(deathPos, 90, { spreadXZ: 0.9, spreadY: 0.25, minSize: 0.03, maxSize: 0.09, minLife: 25, maxLife: 65 });
          }
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            spawnBloodDecal({ x: deathPos.x + Math.cos(a) * (0.3 + Math.random() * 0.8), y: 0, z: deathPos.z + Math.sin(a) * (0.3 + Math.random() * 0.8) });
          }
          const segGeo = new THREE.SphereGeometry(0.25, 6, 4);
          const segMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const segments = [];
          for (let s = 0; s < 3; s++) {
            const seg = new THREE.Mesh(segGeo, segMat);
            seg.position.set(deathPos.x + (s - 1) * 0.2, 0.12, deathPos.z + (Math.random()-0.5)*0.2);
            seg.scale.y = 0.22;
            scene.add(seg);
            segments.push(seg);
          }
          let life = 130;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              for (let s = 0; s < segments.length; s++) {
                if (life > 90 - s * 15) {
                  segments[s].position.y = Math.max(0.05, segments[s].position.y - 0.002);
                }
                if (life % 7 === 0 && life > 30) spawnParticles(segments[s].position, 0x8B0000, 2);
              }
              if (life < 40) {
                segMat.opacity = (life / 40) * 0.85;
              }
              if (life <= 0) {
                for (const seg of segments) { scene.remove(seg); }
                segGeo.dispose(); segMat.dispose();
                return false;
              }
              return true;
            }, cleanup() {
              for (const seg of segments) { scene.remove(seg); }
              segGeo.dispose(); segMat.dispose();
            }});
          } else {
            for (const seg of segments) { scene.remove(seg); }
            segGeo.dispose(); segMat.dispose();
          }
        }
      }

      dieByAura(enemyColor) {
        // DISINTEGRATE FROM BELOW — body melts from feet upward into glowing ash/blood
        const deathPos = this.mesh.position.clone();

        // Initial burst of glowing ash and blood particles
        spawnParticles(deathPos, 0xFF4500, 16); // Glowing orange ash
        spawnParticles(deathPos, 0xFFEE88, 14); // Golden energy
        spawnParticles(deathPos, 0x8B0000, 12); // Dark blood
        spawnParticles(deathPos, 0xFF6347, 10); // Red-orange mix

        if (window.BloodSystem) {
          window.BloodSystem.emitAuraBurn(deathPos, 100); // Heavy burn effect
          window.BloodSystem.emitBurst(deathPos, 40, {
            spreadXZ: 0.4,
            spreadY: 0.2,
            minSize: 0.02,
            maxSize: 0.06,
            minLife: 20,
            maxLife: 50
          });
        }

        // Create disintegrating body stump with glowing emissive material
        const stumpGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.8, 8);
        const stumpMat = new THREE.MeshBasicMaterial({
          color: enemyColor,
          transparent: true,
          opacity: 0.85,
          emissive: 0xFF4500, // Glowing orange emissive
          emissiveIntensity: 0.4
        });
        const stump = new THREE.Mesh(stumpGeo, stumpMat);
        stump.position.copy(deathPos);
        stump.position.y = 0.4;
        scene.add(stump);

        // Create dark blood/ash pool on ground (grows as body melts)
        const poolGeo = new THREE.CircleGeometry(0.3, 10); // Starts small
        const poolMat = new THREE.MeshBasicMaterial({
          color: 0x2A0000, // Dark blood
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        });
        const bloodPool = new THREE.Mesh(poolGeo, poolMat);
        bloodPool.rotation.x = -Math.PI / 2;
        bloodPool.position.set(deathPos.x, 0.01, deathPos.z);
        scene.add(bloodPool);

        // Glowing burn mark underneath
        const burnGeo = new THREE.CircleGeometry(0.5, 10);
        const burnMat = new THREE.MeshBasicMaterial({
          color: 0xFF3300, // Bright orange-red glow
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        });
        const burnMark = new THREE.Mesh(burnGeo, burnMat);
        burnMark.rotation.x = -Math.PI / 2;
        burnMark.position.set(deathPos.x, 0.005, deathPos.z);
        scene.add(burnMark);

        let life = 110; // Longer animation for dramatic effect

        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({
            update(_dt) {
              life--;
              const erode = life / 110;

              // Body melts down from top (scale.y shrinks)
              stump.scale.y = Math.max(0.02, erode);
              stump.position.y = 0.4 * erode;
              stump.material.opacity = erode * 0.85;

              // Increase emissive glow as body disintegrates
              stump.material.emissiveIntensity = 0.4 + (1 - erode) * 0.6;

              // Blood pool grows as body melts (inverse of erode)
              const poolGrowth = 1 - erode;
              bloodPool.scale.setScalar(1 + poolGrowth * 1.5); // Grows to 2.5x size
              bloodPool.material.opacity = 0.5 + poolGrowth * 0.3;

              // Continuous stream of glowing ash/blood particles rising from dissolving body
              if (life % 3 === 0 && life > 10) {
                const particlePos = {
                  x: deathPos.x + (Math.random() - 0.5) * 0.35,
                  y: stump.position.y + 0.1,
                  z: deathPos.z + (Math.random() - 0.5) * 0.35
                };

                // Mix of glowing ash (orange) and blood (dark red)
                if (Math.random() < 0.5) {
                  spawnParticles(particlePos, 0xFF4500, 2); // Orange ash
                } else {
                  spawnParticles(particlePos, 0x8B0000, 2); // Blood
                }

                // Additional golden energy wisps
                if (Math.random() < 0.3) {
                  spawnParticles(particlePos, 0xFFEE88, 1);
                }
              }

              // Burn mark pulses and fades
              burnMat.opacity = (life / 110) * 0.6 * (1 + Math.sin(life * 0.2) * 0.2);

              // Final burst of ash as body fully disintegrates
              if (life === 15) {
                spawnParticles(deathPos, 0xFF4500, 20); // Big orange ash burst
                spawnParticles(deathPos, 0x8B0000, 15); // Blood burst
                spawnParticles(deathPos, 0xFFEE88, 10); // Golden energy
                if (window.BloodSystem) {
                  window.BloodSystem.emitBurst(deathPos, 50, {
                    spreadXZ: 0.6,
                    spreadY: 0.3,
                    minSize: 0.015,
                    maxSize: 0.05,
                    minLife: 15,
                    maxLife: 40
                  });
                }
              }

              if (life <= 0) {
                scene.remove(stump);
                scene.remove(bloodPool);
                scene.remove(burnMark);
                stumpGeo.dispose();
                stumpMat.dispose();
                poolGeo.dispose();
                poolMat.dispose();
                burnGeo.dispose();
                burnMat.dispose();
                return false;
              }
              return true;
            },
            cleanup() {
              scene.remove(stump);
              scene.remove(bloodPool);
              scene.remove(burnMark);
              stumpGeo.dispose();
              stumpMat.dispose();
              poolGeo.dispose();
              poolMat.dispose();
              burnGeo.dispose();
              burnMat.dispose();
            }
          });
        } else {
          scene.remove(stump);
          scene.remove(bloodPool);
          scene.remove(burnMark);
          stumpGeo.dispose();
          stumpMat.dispose();
          poolGeo.dispose();
          poolMat.dispose();
          burnGeo.dispose();
          burnMat.dispose();
        }
      }

      dieByGunshot(enemyColor) {
        // GUN/TURRET DEATH: Stumble backward from bullet impact, collapse, blood pumps from bullet holes
        const deathPos = this.mesh.position.clone();

        // Calculate backward direction from last hit
        const bulletVX = this._lastHitVX || 0;
        const bulletVZ = this._lastHitVZ || 1;
        const bulletLen = Math.sqrt(bulletVX * bulletVX + bulletVZ * bulletVZ) || 1;
        const backwardDir = {
          x: -bulletVX / bulletLen,
          y: 0,
          z: -bulletVZ / bulletLen
        };

        // Initial blood spray from impact
        spawnParticles(deathPos, 0x8B0000, 25);
        spawnParticles(deathPos, 0xCC0000, 15);
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, 120, { spreadXZ: 1.0, spreadY: 0.3 });
        }

        // Register corpse with bullet holes for heartbeat blood pump
        if (window.TraumaSystem) {
          const bulletHoles = this._bulletHoles || [];
          TraumaSystem.registerCorpse(deathPos, 'gun', bulletHoles);
        }

        // Create stumbling body
        const bodyGeo = new THREE.SphereGeometry(0.42, 8, 8);
        const bodyMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.copy(deathPos);
        scene.add(body);

        // Stumble backward physics
        let stumbleVX = backwardDir.x * 0.15;
        let stumbleVZ = backwardDir.z * 0.15;
        let stumbleVY = 0;
        let stumbleLife = 120; // ~2 seconds
        let stumblePhase = 0; // 0=stumbling backward, 1=collapsed on ground
        let pumpTimer = 0;

        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            stumbleLife--;
            pumpTimer++;

            if (stumblePhase === 0) {
              // Phase 0: Stumble backward
              body.position.x += stumbleVX;
              body.position.z += stumbleVZ;
              stumbleVX *= 0.92; // Friction
              stumbleVZ *= 0.92;

              // Tilt backward from impact
              body.rotation.x -= 0.04;
              body.rotation.z += stumbleVX * 0.5;

              // Fall to ground after short stumble
              if (stumbleLife < 90) {
                stumbleVY -= 0.02;
                body.position.y += stumbleVY;
                if (body.position.y <= 0.2) {
                  body.position.y = 0.2;
                  stumblePhase = 1; // Transition to collapsed
                }
              }

              // Blood trail while stumbling
              if (pumpTimer % 3 === 0 && window.BloodSystem) {
                window.BloodSystem.emitBurst(body.position, 8, { spreadXZ: 0.3, spreadY: 0.1 });
              }
              if (pumpTimer % 5 === 0) {
                spawnBloodDecal(body.position);
              }
            } else {
              // Phase 1: Collapsed on ground, blood pumping from wounds slows
              body.position.y = 0.2;

              // Blood pumps from bullet holes (slowing over time)
              const pumpStrength = Math.max(0, 1.0 - (120 - stumbleLife) / 50);
              if (pumpTimer % 8 === 0 && pumpStrength > 0.2 && window.BloodSystem) {
                const particleCount = Math.floor(30 * pumpStrength);
                window.BloodSystem.emitBurst(body.position, particleCount, {
                  spreadXZ: 0.5 * pumpStrength,
                  spreadY: 0.3 * pumpStrength
                });
              }

              // Occasional spurt from specific bullet holes
              if (pumpTimer % 12 === 0 && this._bulletHoles && this._bulletHoles.length > 0) {
                const randomHole = this._bulletHoles[Math.floor(Math.random() * this._bulletHoles.length)];
                if (randomHole && randomHole.pos && window.BloodSystem) {
                  const worldHolePos = body.position.clone();
                  worldHolePos.y += 0.3;
                  window.BloodSystem.emitBurst(worldHolePos, Math.floor(15 * pumpStrength), {
                    spreadXZ: 0.3,
                    spreadY: 0.4,
                    direction: randomHole.dir
                  });
                }
              }
            }

            // Fade out at end
            if (stumbleLife < 30) {
              bodyMat.opacity = (stumbleLife / 30);
            }

            if (stumbleLife <= 0) {
              scene.remove(body);
              bodyGeo.dispose();
              bodyMat.dispose();
              return false;
            }
            return true;
          }, cleanup() {
            scene.remove(body);
            bodyGeo.dispose();
            bodyMat.dispose();
          }});
        } else {
          scene.remove(body);
          bodyGeo.dispose();
          bodyMat.dispose();
        }

        // Blood pool at death location
        const poolGeo = new THREE.CircleGeometry(0.8, 16);
        const poolMat = new THREE.MeshBasicMaterial({
          color: 0x8B0000,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        });
        const pool = new THREE.Mesh(poolGeo, poolMat);
        pool.position.copy(deathPos);
        pool.position.y = 0.05;
        pool.rotation.x = -Math.PI / 2;
        scene.add(pool);

        let poolLife = 140;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            poolLife--;
            // Pool grows slightly
            if (poolLife > 80) {
              pool.scale.set(1 + (140 - poolLife) * 0.01, 1 + (140 - poolLife) * 0.01, 1);
            }
            // Fade out
            if (poolLife < 40) {
              poolMat.opacity = (poolLife / 40) * 0.6;
            }
            if (poolLife <= 0) {
              scene.remove(pool);
              poolGeo.dispose();
              poolMat.dispose();
              return false;
            }
            return true;
          }, cleanup() {
            scene.remove(pool);
            poolGeo.dispose();
            poolMat.dispose();
          }});
        } else {
          scene.remove(pool);
          poolGeo.dispose();
          poolMat.dispose();
        }
      }

      dieGeyserRollover(enemyColor) {
        // GEYSER ROLLOVER DEATH: Enemy snaps backward on impact, head flies off, torso
        // bursts — then rolls onto its back with a "heartbeat bleed-out" for 3 s,
        // squirting blood fountains straight up. Finally fades to a dark corpse husk.
        const deathPos = this.mesh.position.clone();
        const _dyingMesh = this.mesh;

        // Flag die() to skip the generic fall animation — this method handles the mesh fully
        this._skipMainDeathAnim = true;

        // Stop all forward movement immediately
        this._lastMoveVX = 0;
        this._lastMoveVZ = 0;

        // ── Violent backwards snap on impact ────────────────────────────────
        // Read last-hit direction so the snap goes the right way.
        const _ivx = this._lastHitVX || 0;
        const _ivz = this._lastHitVZ || 0;
        const _ilen = Math.sqrt(_ivx * _ivx + _ivz * _ivz) || 1;
        const _snapForce = 0.6 + Math.random() * 0.6; // 0.6–1.2 rad
        _dyingMesh.rotation.x = -_snapForce;
        _dyingMesh.rotation.z += (_ivx / _ilen) * _snapForce * 0.35;

        // ── Head flies off ─────────────────────────────────────────────────
        if (this.headGroup) {
          const _headWorldPos = new THREE.Vector3();
          this.headGroup.getWorldPosition(_headWorldPos);
          this.headGroup.visible = false;

          const _fhGeo = new THREE.SphereGeometry(0.2, 7, 6);
          const _fhMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
          const _fh = new THREE.Mesh(_fhGeo, _fhMat);
          _fh.position.copy(_headWorldPos);
          scene.add(_fh);
          // Head flies backward from impact direction with random scatter
          const _fhvx = -(_ivx / _ilen) * (0.06 + Math.random() * 0.09) + (Math.random() - 0.5) * 0.07;
          const _fhvz = -(_ivz / _ilen) * (0.06 + Math.random() * 0.09) + (Math.random() - 0.5) * 0.07;
          let _fhvy = 0.18 + Math.random() * 0.20;
          const _fhrx = (Math.random() - 0.5) * 0.18;
          const _fhrz = (Math.random() - 0.5) * 0.18;
          let _fhl = 80;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              _fhl--;
              _fh.position.x += _fhvx;
              _fh.position.y += _fhvy;
              _fh.position.z += _fhvz;
              _fhvy -= 0.020;
              _fh.rotation.x += _fhrx;
              _fh.rotation.z += _fhrz;
              if (_fhl < 20) _fhMat.opacity = _fhl / 20;
              if (_fhl <= 0 || _fh.position.y < 0) {
                scene.remove(_fh);
                _fhGeo.dispose();
                _fhMat.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(_fh);
            _fhGeo.dispose();
            _fhMat.dispose();
          }
        }

        // ── Torso burst: scatter blood outward in a ring from chest height ──
        if (typeof spawnParticles === 'function') {
          spawnParticles({ x: deathPos.x, y: deathPos.y + 0.35, z: deathPos.z }, 0x8B0000, 8);
          spawnParticles({ x: deathPos.x, y: deathPos.y + 0.35, z: deathPos.z }, 0x660000, 5);
        }

        // Phase 1 — Roll onto back: rotate 180° on Z over ~30 frames
        const ROLL_FRAMES     = 30;
        const HEARTBEAT_FRAMES = 180; // 3 seconds at 60 fps
        const FADE_FRAMES_GR  = 50;
        const TOTAL_FRAMES    = ROLL_FRAMES + HEARTBEAT_FRAMES + FADE_FRAMES_GR;

        let geyserFrame = 0;
        let _heartTimer = 0;
        let _pumpPhase  = 0; // 0–1 within current beat
        let _geyserAborted = false;
        const _enemyRef = this; // Capture enemy reference for use in managed animation callbacks

        // Mark enemy as being in bleed-out state so fire/plasma hits can interrupt it
        this._inGeyserBleedout = true;
        this._interruptGeyserBleedout = () => {
          _geyserAborted = true;
          _enemyRef._inGeyserBleedout = false;
          _enemyRef._interruptGeyserBleedout = null;
          // Instantly remove the rolling corpse
          if (_dyingMesh.parent) scene.remove(_dyingMesh);
          // Spawn ash pile identical to dieByFire result
          const _ashGeo = new THREE.SphereGeometry(0.18, 6, 4);
          const _ashMat = new THREE.MeshBasicMaterial({ color: 0x0A0A0A, transparent: true, opacity: 0.92 });
          const _ash    = new THREE.Mesh(_ashGeo, _ashMat);
          _ash.position.set(deathPos.x, 0.06, deathPos.z);
          _ash.scale.set(2.2, 0.22, 2.2);
          scene.add(_ash);
          spawnParticles(deathPos, 0xFF4500, 14);
          spawnParticles(deathPos, 0x111111, 10);
        };

        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            if (_geyserAborted) return false;
            geyserFrame++;

            if (geyserFrame <= ROLL_FRAMES) {
              // Roll 180° on Z axis to flip onto back
              const _rollT = geyserFrame / ROLL_FRAMES;
              _dyingMesh.rotation.z = _rollT * Math.PI;
              _dyingMesh.position.y = deathPos.y * (1 - _rollT * 0.5);

            } else if (geyserFrame <= ROLL_FRAMES + HEARTBEAT_FRAMES) {
              // Phase 2 — Heartbeat bleed-out: scale chest up/down like a pumping heart,
              // fountain of blood straight up at each peak.
              _heartTimer++;
              const _beatPeriod = 22; // ~2.7 heartbeats/sec at 60 fps
              _pumpPhase = (_heartTimer % _beatPeriod) / _beatPeriod;
              const _beat = Math.sin(_pumpPhase * Math.PI * 2);
              // Scale chest (torsoGroup or baseGroup) up/down
              if (_dyingMesh.children.length > 0) {
                const _chest = _dyingMesh.children[0];
                if (_chest) {
                  _chest.scale.x = 1.0 + _beat * 0.18;
                  _chest.scale.z = 1.0 + _beat * 0.18;
                  _chest.scale.y = 1.0 + _beat * 0.12;
                }
              }
              // At peak of each pump, squirt blood fountain straight up
              if (_pumpPhase < 0.05 && _heartTimer > 3) {
                if (window.BloodSystem) {
                  window.BloodSystem.emitBurst(
                    { x: deathPos.x, y: deathPos.y + 0.3, z: deathPos.z },
                    22,
                    { spreadXZ: 0.15, spreadY: 0.9, minSize: 0.02, maxSize: 0.07, minLife: 30, maxLife: 65 }
                  );
                }
                spawnParticles({ x: deathPos.x, y: deathPos.y + 0.3, z: deathPos.z }, 0x8B0000, 6);
              }
              // Continuous blood drip from ground
              if (_heartTimer % 8 === 0) spawnBloodDecal(deathPos);

            } else {
              // Phase 3 — Fade to dark corpse husk
              const _fadeT = (geyserFrame - ROLL_FRAMES - HEARTBEAT_FRAMES) / FADE_FRAMES_GR;
              if (_dyingMesh.material) {
                _dyingMesh.material.color.setHex(0x1A0000); // Dark corpse husk
                _dyingMesh.material.opacity = Math.max(0, (1 - _fadeT) * 0.75);
                _dyingMesh.material.needsUpdate = true;
              }
              if (geyserFrame >= TOTAL_FRAMES) {
                _enemyRef._inGeyserBleedout = false;
                _enemyRef._interruptGeyserBleedout = null;
                if (_dyingMesh.parent) scene.remove(_dyingMesh);
                return false;
              }
            }
            return true;
          }, cleanup() {
            _enemyRef._inGeyserBleedout = false;
            _enemyRef._interruptGeyserBleedout = null;
            if (_dyingMesh.parent) scene.remove(_dyingMesh);
          }});
        }
      }

      dieByPoison(enemyColor) {
        // POISON / ACID DEATH: The Puddle — corpse flattens into a permanent neon-green
        // acidic puddle decal on the floor. scale.y → 0.05, scale.x/z → 2.5.
        const deathPos = this.mesh.position.clone();

        // Skip the generic fall animation — poison/acid death handles the mesh itself
        this._skipMainDeathAnim = true;
        spawnParticles(deathPos, 0x00FF00, 14); // Bright green toxic
        spawnParticles(deathPos, 0x44FF44, 8);  // Light green bubbles
        spawnParticles(deathPos, 0x006600, 6);  // Dark green ooze
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, 40, { spreadXZ: 0.8, spreadY: 0.2,
            color1: 0x00FF44, color2: 0x004400, minSize: 0.03, maxSize: 0.10, minLife: 25, maxLife: 60 });
        }

        // Animate the mesh itself morphing into an acidic puddle over 0.5 seconds
        if (this.mesh && this.mesh.material) {
          this.mesh.material.color.setHex(0x00FF22); // Neon green
          this.mesh.material.needsUpdate = true;
        }
        const _startScaleX = this.mesh ? this.mesh.scale.x : 1;
        const _startScaleY = this.mesh ? this.mesh.scale.y : 1;
        const _startScaleZ = this.mesh ? this.mesh.scale.z : 1;
        const _targetScaleY = 0.05;
        const _targetScaleXZ = 2.5;
        const _meltFrames = 30;
        let _meltFrame = 0;
        const _dyingMeshRef = this.mesh;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            _meltFrame++;
            const _t = Math.min(_meltFrame / _meltFrames, 1);
            if (_dyingMeshRef) {
              _dyingMeshRef.scale.x = _startScaleX + (_targetScaleXZ - _startScaleX) * _t;
              _dyingMeshRef.scale.y = _startScaleY + (_targetScaleY - _startScaleY) * _t;
              _dyingMeshRef.scale.z = _startScaleZ + (_targetScaleXZ - _startScaleZ) * _t;
              _dyingMeshRef.position.y = Math.max(0.04, deathPos.y * (1 - _t * 0.95));
              if (_meltFrame % 5 === 0 && _meltFrame < 25) spawnParticles(deathPos, 0x00FF44, 2);
            }
            return _meltFrame < _meltFrames;
          }});
        }

        // Permanent neon-green acidic puddle decal on the floor
        const puddleGeo = new THREE.CircleGeometry(1.0, 14);
        const puddleMat = new THREE.MeshBasicMaterial({ color: 0x00FF22, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
        const puddle = new THREE.Mesh(puddleGeo, puddleMat);
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(deathPos.x, 0.03, deathPos.z);
        scene.add(puddle);
        // Pulsing acid puddle — permanently bubbles with green particles
        let _bubbleTimer = 0;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            _bubbleTimer++;
            if (_bubbleTimer % 35 === 0 && scene) spawnParticles(puddle.position, 0x00FF22, 1);
            return true; // stays forever
          }, cleanup() {
            if (puddle.parent) scene.remove(puddle);
            puddleGeo.dispose(); puddleMat.dispose();
          }});
        }
      }
    }
    // Lazily initialised on first use so the top-level script evaluation never calls THREE
    // before THREE.js has been loaded (mirrors the bulletHoleGeo/bulletHoleMat pattern).
    let projectileGeometryCache = null;
    let projectileMaterialCache = null;
    let _cachedProjSizeMultiplier = null;
    function ensureProjectileCaches() {
      const sizeMultiplier = window._projSizeMultiplier || 1.0;
      // Rebuild cache when size multiplier changes so new pool slots get correctly-sized geometry
      if (projectileGeometryCache && _cachedProjSizeMultiplier === sizeMultiplier) return;
      _cachedProjSizeMultiplier = sizeMultiplier;
      // Small elongated cylinder — bake a 90° Z-rotation so the long axis is along X.
      // In Projectile.reinit() the mesh Y-rotation is set to Math.atan2(vx,vz) so the
      // cylinder naturally faces the direction of travel.
      const cylGeo = new THREE.CylinderGeometry(0.04 * sizeMultiplier, 0.04 * sizeMultiplier, 0.4 * sizeMultiplier, 8);
      cylGeo.rotateZ(Math.PI / 2); // now long axis faces +X; mesh.rotation.y handles directional aim
      projectileGeometryCache = {
        bullet:     cylGeo,
        bulletGlow: new THREE.SphereGeometry(0.06 * sizeMultiplier, 6, 6)
      };
      projectileMaterialCache = {
        bullet: new THREE.MeshBasicMaterial({
          color: 0xffffaa,      // Soft yellow/white — glows smooth without needing lighting calculations
          transparent: true,
          opacity: 0.95
        }),
        bulletGlow: new THREE.MeshBasicMaterial({
          color: 0xFFAA00,      // Warm orange glow
          transparent: true,
          opacity: 0.4
        })
      };
    }

    // Phase 5: Companion System - Simplified implementation for stable gameplay
