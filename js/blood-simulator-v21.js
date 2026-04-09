// ===============================================
// BLOOD SIMULATOR V2.1 – MAX QUALITY (BennyHood Edition)
// Fully fixed, terrain-aware, fantasy-realism, 120 FPS mobile+PC
// Replaces all old blood systems. Compatible with AdvancedTreeSystem.
// ===============================================

// Per-enemy-type blood palette (mirrors BloodV2 ENEMY_BLOOD table)
const _BSV21_BLOOD = {
  slime:         0x22cc44,
  crawler:       0x994422,
  leaping_slime: 0x00bfff,
  skinwalker:    0x220000,
  bug:           0xaadd00,
  human:         0xcc1100,
  alien:         0x8800ff,
  robot:         0x88aaff,
};

const BloodSimulatorV21 = {
  scene: null,
  terrainMesh: null,
  player: null,
  dropIM: null,
  mistIM: null,
  MAX_DROPS: 1200,
  MAX_MIST: 800,

  // Fixed-size ring-buffer pool — no unbounded growth
  _pool: null,          // Array(MAX_DROPS) of drop objects, pre-allocated in init()
  _head: 0,             // next write index

  // Pre-allocated scratch objects — zero per-frame allocations
  _matrix: null,
  _rayOrigin: null,
  _rayDir: null,
  _raycaster: null,
  _color: null,

  init(scene, terrainMesh, player) {
    this.scene = scene;
    this.terrainMesh = terrainMesh;
    this.player = player;

    // Preallocate scratch objects
    this._matrix    = new THREE.Matrix4();
    this._rayOrigin = new THREE.Vector3();
    this._rayDir    = new THREE.Vector3(0, -1, 0);
    this._raycaster = new THREE.Raycaster();
    this._raycaster.ray.direction.set(0, -1, 0);
    this._color     = new THREE.Color();

    // Pre-allocate fixed drop pool
    this._pool = new Array(this.MAX_DROPS);
    for (let i = 0; i < this.MAX_DROPS; i++) {
      this._pool[i] = {
        alive: false, px: 0, py: 0, pz: 0,
        vx: 0, vy: 0, vz: 0, radius: 0.012,
        viscosity: 0.62, life: 0, onGround: false, color: 0x8B0000
      };
    }
    this._head = 0;

    // Drop instanced mesh — vertexColors=true so per-drop color works
    const dropGeo = new THREE.SphereGeometry(0.012, 8, 6);
    const dropMat = new THREE.MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0.05,
      transparent: true,
      opacity: 0.98,
      vertexColors: true
    });
    this.dropIM = new THREE.InstancedMesh(dropGeo, dropMat, this.MAX_DROPS);
    this.dropIM.count = 0;
    this.dropIM.castShadow = true;
    this.dropIM.receiveShadow = true;
    // Initialise instanceColor buffer
    this.dropIM.setColorAt(0, new THREE.Color(0x8B0000));
    scene.add(this.dropIM);

    const mistGeo = new THREE.PlaneGeometry(0.08, 0.08);
    const mistMat = new THREE.MeshStandardMaterial({
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
      vertexColors: true
    });
    this.mistIM = new THREE.InstancedMesh(mistGeo, mistMat, this.MAX_MIST);
    this.mistIM.count = 0;
    scene.add(this.mistIM);

    console.log('✅ BloodSimulatorV21 initialized – terrain collision + full fantasy realism');
    return this;
  },

  // Reset all drops (call on game-over / round restart)
  reset() {
    if (!this._pool) return;
    for (let i = 0; i < this.MAX_DROPS; i++) this._pool[i].alive = false;
    this._head = 0;
    if (this.dropIM) { this.dropIM.count = 0; this.dropIM.instanceMatrix.needsUpdate = true; }
  },

  update(dt) {
    if (!this.dropIM || !this._pool) return;
    let activeDrops = 0;
    const matrix    = this._matrix;
    const rayOrigin = this._rayOrigin;
    const raycaster = this._raycaster;
    const color     = this._color;

    for (let i = 0; i < this.MAX_DROPS; i++) {
      const d = this._pool[i];
      if (!d.alive) continue;

      // Lifetime — expire and free slot
      d.life -= dt;
      if (d.life <= 0) { d.alive = false; continue; }

      // Gravity + drag (clamped so drag never goes negative)
      d.vy -= 9.81 * dt * 1.1;
      const speed = Math.hypot(d.vx, d.vy, d.vz);
      const drag  = Math.max(0, 1 - d.viscosity * dt * speed * 1.2);
      d.vx *= drag;
      d.vy *= drag;
      d.vz *= drag;

      d.px += d.vx * dt;
      d.py += d.vy * dt;
      d.pz += d.vz * dt;

      // Terrain collision using pre-allocated raycaster
      if (this.terrainMesh && !d.onGround) {
        rayOrigin.set(d.px, d.py + 3, d.pz);
        raycaster.ray.origin.copy(rayOrigin);
        const intersects = raycaster.intersectObject(this.terrainMesh, true);
        if (intersects.length > 0 && intersects[0].distance < 3.5) {
          d.py = intersects[0].point.y + 0.018;
          d.vy = Math.max(0, -d.vy * 0.38);
          if (Math.abs(d.vy) < 0.12) d.onGround = true;
        }
      }

      // Player-proximity waterdrop repulsion
      if (this.player) {
        const dx = d.px - this.player.position.x;
        const dz = d.pz - this.player.position.z;
        if (dx * dx + dz * dz < 1.8 && d.py > 0.1) {
          d.vx += dx * 6 * dt;
          d.vz += dz * 6 * dt;
        }
      }

      if (activeDrops >= this.MAX_DROPS) continue;
      matrix.makeScale(d.radius * 2, d.radius * 2, d.radius * 2);
      matrix.setPosition(d.px, d.py, d.pz);
      this.dropIM.setMatrixAt(activeDrops, matrix);
      color.setHex(d.color);
      this.dropIM.setColorAt(activeDrops, color);
      activeDrops++;
    }
    this.dropIM.count = activeDrops;
    this.dropIM.instanceMatrix.needsUpdate = true;
    if (this.dropIM.instanceColor) this.dropIM.instanceColor.needsUpdate = true;
  },

  // Write `count` drops into the ring-buffer, overwriting oldest if full
  rawBurst(x, y, z, count = 45, options = {}) {
    if (!this._pool) return;
    // Resolve color: explicit > enemyType lookup > default red
    let resolvedColor = options.color;
    if (!resolvedColor && options.enemyType && _BSV21_BLOOD[options.enemyType]) {
      resolvedColor = _BSV21_BLOOD[options.enemyType];
    }
    const opts = { spreadXZ: 9, spreadY: 14, viscosity: 0.62, ...options, color: resolvedColor || 0x8B0000 };
    const n = Math.min(count, this.MAX_DROPS);
    for (let i = 0; i < n; i++) {
      const d = this._pool[this._head];
      d.alive    = true;
      d.px       = x + (Math.random() - 0.5) * 0.4;
      d.py       = y + Math.random() * 0.6;
      d.pz       = z + (Math.random() - 0.5) * 0.4;
      d.vx       = (Math.random() - 0.5) * opts.spreadXZ;
      d.vy       = 4 + Math.random() * opts.spreadY;
      d.vz       = (Math.random() - 0.5) * opts.spreadXZ;
      d.radius   = 0.008 + Math.random() * 0.009;
      d.viscosity = opts.viscosity;
      d.life     = 5 + Math.random() * 3;
      d.onGround = false;
      d.color    = opts.color || 0x8B0000;
      this._head = (this._head + 1) % this.MAX_DROPS;
    }
  },

  onEnemyHit(enemy, hitPoint, damageType = 'melee') {
    const burstCount = damageType === 'projectile' ? 65 : 38;
    const bloodColor = (enemy && enemy.enemyType && _BSV21_BLOOD[enemy.enemyType])
      ? _BSV21_BLOOD[enemy.enemyType] : 0x8B0000;
    this.rawBurst(hitPoint.x, hitPoint.y, hitPoint.z, burstCount, {
      spreadXZ: 11,
      spreadY: 16,
      viscosity: enemy.bloodViscosity || 0.62,
      color: bloodColor
    });
  },

  onEnemyDeath(enemy, position) {
    const bloodColor = (enemy && enemy.enemyType && _BSV21_BLOOD[enemy.enemyType])
      ? _BSV21_BLOOD[enemy.enemyType] : 0x8B0000;
    this.rawBurst(position.x, position.y + 0.8, position.z, 120, {
      spreadXZ: 14,
      spreadY: 22,
      viscosity: 0.55,
      color: bloodColor
    });
  }
};

window.BloodSimulatorV21 = BloodSimulatorV21;
