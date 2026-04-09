// --- ADVANCED BLOOD & PHYSICS SYSTEM ---
// Provides a THREE.Points-based blood particle system with pulsating emission,
// physics simulation, and ground staining.
// Exposes window.BloodSystem for use by main.js

(function() {
  'use strict';

  // ─── Configuration ──────────────────────────────────────────────────────────
  const MAX_BLOOD_PARTICLES = 50000;
  const GRAVITY = -0.018;
  const GROUND_Y = 0.05; // Y position for ground stains (raised to prevent z-fighting with terrain)
  // Global cap on wound-tracking entries and instanced drop instances.
  // Keeping these bounded prevents runaway memory growth between level transitions.
  const MAX_ACTIVE_WOUNDS_CAP = 100;

  // ─── Internal State ─────────────────────────────────────────────────────────
  let _scene = null;
  let _points = null;
  let _geo = null;
  let _positions = null;
  let _colors = null;
  let _sizes = null;

  // Per-particle physics state (Float32Array for cache efficiency)
  let _velX = null, _velY = null, _velZ = null;
  let _life = null;      // remaining life in frames (0 = dead/stained)
  let _grounded = null;  // Uint8Array: 1 = particle hit ground and is a stain

  let _count = 0;   // active particle count
  let _head = 0;    // ring-buffer write head
  let _highWater = 0; // high-water mark: max index that has been written to + 1

  // Shared material / geometry
  let _mat = null;

  // ─── Wound Tracking (heartbeat arterial spurts) ─────────────────────────────
  // Each wound: { x, y, z, dirX, dirZ, weapon, life }
  const MAX_WOUNDS = 32;
  const _wounds = [];

  // ─── Instanced Blood Drops (2000-instance zero-lag flying drops) ─────────────
  const MAX_BLOOD_DROPS = 2000;
  let _dropIM = null;          // THREE.InstancedMesh
  let _dropPX = null, _dropPY = null, _dropPZ = null;  // positions
  let _dropVX = null, _dropVY = null, _dropVZ = null;  // velocities
  let _dropLife = null;        // frames remaining (0 = inactive)
  let _dropSize = null;        // base scale (uniform)
  let _dropHead = 0;           // ring-buffer write head
  let _dropHighWater = 0;      // highest index written + 1
  // Reusable THREE objects – allocated once in _initDrops to avoid per-frame GC
  let _dPos = null, _dQuat = null, _dScale = null, _dMtx = null;

  // ─── Init ────────────────────────────────────────────────────────────────────
  // ─── Create circular texture for point particles ─────────────────────────────
  function _createCircleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw a radial gradient circle
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function init(threeScene) {
    if (typeof THREE === 'undefined') {
      console.warn('[BloodSystem] THREE.js not yet available – init deferred');
      return;
    }
    if (_scene) return; // already initialised
    _scene = threeScene;

    _geo = new THREE.BufferGeometry();
    _positions = new Float32Array(MAX_BLOOD_PARTICLES * 3);
    _colors    = new Float32Array(MAX_BLOOD_PARTICLES * 3);
    _sizes     = new Float32Array(MAX_BLOOD_PARTICLES);

    _velX      = new Float32Array(MAX_BLOOD_PARTICLES);
    _velY      = new Float32Array(MAX_BLOOD_PARTICLES);
    _velZ      = new Float32Array(MAX_BLOOD_PARTICLES);
    _life      = new Float32Array(MAX_BLOOD_PARTICLES);
    _grounded  = new Uint8Array(MAX_BLOOD_PARTICLES);

    // Hide all particles initially (park at Y = -9999)
    for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
      _positions[i * 3 + 1] = -9999;
      _life[i] = 0;
    }

    _geo.setAttribute('position', new THREE.BufferAttribute(_positions, 3));
    _geo.setAttribute('color',    new THREE.BufferAttribute(_colors, 3));

    _mat = new THREE.PointsMaterial({
      size: 4.0,  // BUG H: Increased from 0.09 to 4.0 for better visibility at all distances
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,  // BUG H: Keep true for proper perspective scaling
      blending: THREE.NormalBlending,
      // Make points circular (not square) by using a radial gradient
      alphaTest: 0.01,
      map: _createCircleTexture()
    });

    _points = new THREE.Points(_geo, _mat);
    _points.renderOrder = 15;  // Render blood above ground to avoid z-fighting
    _points.frustumCulled = false; // particles span entire world; skip bounding-sphere test
    _geo.setDrawRange(0, 0);  // start with nothing to draw
    _scene.add(_points);

    // Initialise the instanced blood-drop system
    _initDrops(threeScene);
  }

  // ─── Instanced Blood Drop Init ───────────────────────────────────────────────
  function _initDrops(scene) {
    if (_dropIM) return; // already initialised
    // Unit sphere scaled per instance — 4 segments is enough for small drops
    const geo = new THREE.SphereGeometry(1, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8B0000 });
    _dropIM = new THREE.InstancedMesh(geo, mat, MAX_BLOOD_DROPS);
    _dropIM.frustumCulled = false;
    _dropIM.renderOrder = 10;

    _dropPX   = new Float32Array(MAX_BLOOD_DROPS);
    _dropPY   = new Float32Array(MAX_BLOOD_DROPS);
    _dropPZ   = new Float32Array(MAX_BLOOD_DROPS);
    _dropVX   = new Float32Array(MAX_BLOOD_DROPS);
    _dropVY   = new Float32Array(MAX_BLOOD_DROPS);
    _dropVZ   = new Float32Array(MAX_BLOOD_DROPS);
    _dropLife = new Float32Array(MAX_BLOOD_DROPS);
    _dropSize = new Float32Array(MAX_BLOOD_DROPS);

    // Allocate reusable THREE objects once
    _dPos   = new THREE.Vector3();
    _dQuat  = new THREE.Quaternion(); // identity, never rotated
    _dScale = new THREE.Vector3();
    _dMtx   = new THREE.Matrix4();

    // Park all instances below ground so they are invisible initially
    _dScale.set(0, 0, 0);
    for (let i = 0; i < MAX_BLOOD_DROPS; i++) {
      _dropPY[i] = -9999;
      _dPos.set(0, -9999, 0);
      _dMtx.compose(_dPos, _dQuat, _dScale);
      _dropIM.setMatrixAt(i, _dMtx);
    }
    _dropIM.instanceMatrix.needsUpdate = true;
    scene.add(_dropIM);
  }

  // ─── Emit helpers ────────────────────────────────────────────────────────────

  /**
   * Emit a single blood particle.
   * @param {number} x,y,z   - spawn position
   * @param {number} vx,vy,vz - initial velocity
   * @param {number} r,g,b   - colour (0-1)
   * @param {number} size    - point size (0.03 – 0.12 typical)
   * @param {number} life    - life in frames
   */
  function _emit(x, y, z, vx, vy, vz, r, g, b, size, life) {
    if (!_scene) return;
    const i = _head;
    _head = (_head + 1) % MAX_BLOOD_PARTICLES;
    if (_count < MAX_BLOOD_PARTICLES) _count++;
    if (_head > _highWater) _highWater = _head;
    // Once wrapped, all slots are in play
    if (_count >= MAX_BLOOD_PARTICLES) _highWater = MAX_BLOOD_PARTICLES;

    const i3 = i * 3;
    _positions[i3]     = x;
    _positions[i3 + 1] = y;
    _positions[i3 + 2] = z;
    _velX[i] = vx;
    _velY[i] = vy;
    _velZ[i] = vz;
    _colors[i3]     = r;
    _colors[i3 + 1] = g;
    _colors[i3 + 2] = b;
    _sizes[i]    = size;
    _life[i]     = life;
    _grounded[i] = 0;
  }

  // Convert hex colour to [r,g,b] 0-1 components
  function _hexToRgb(hex) {
    return [((hex >> 16) & 0xFF) / 255, ((hex >> 8) & 0xFF) / 255, (hex & 0xFF) / 255];
  }

  // ─── Public emission API ─────────────────────────────────────────────────────

  /**
   * Emit a burst (single pulse) of blood particles around a world position.
   * @param {THREE.Vector3} pos
   * @param {number} count
   * @param {object} options
   */
  function emitBurst(pos, count, options) {
    if (!_scene) return;
    // FPS-based particle budget: scale count by current throttle level
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    count = Math.ceil(count * scale);
    const opts = options || {};
    const spreadXZ  = opts.spreadXZ  !== undefined ? opts.spreadXZ  : 1.8;
    // spreadY default reduced to 0.3 — gives realistic 0–2m blood height instead of 40m+
    const spreadY   = opts.spreadY   !== undefined ? opts.spreadY   : 0.3;
    const minLife   = opts.minLife   !== undefined ? opts.minLife   : 50;
    const maxLife   = opts.maxLife   !== undefined ? opts.maxLife   : 100;
    const minSize   = opts.minSize   !== undefined ? opts.minSize   : 0.04;
    const maxSize   = opts.maxSize   !== undefined ? opts.maxSize   : 0.14;
    const color1    = opts.color1    !== undefined ? opts.color1    : 0x8B0000;
    const color2    = opts.color2    !== undefined ? opts.color2    : 0xFF1A1A;

    const [r1, g1, b1] = _hexToRgb(color1);
    const [r2, g2, b2] = _hexToRgb(color2);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = minSize + Math.random() * (maxSize - minSize);
      const life = minLife + Math.floor(Math.random() * (maxLife - minLife));

      // Random spherical direction
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI;
      const speed = 0.04 + Math.random() * spreadXZ;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.abs(Math.cos(phi)) * spreadY + 0.05;
      const vz = Math.sin(phi) * Math.sin(theta) * speed;

      _emit(pos.x, pos.y + 0.3, pos.z, vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Pulsating heartbeat emission — emits `pulses` bursts spaced `interval` ms apart.
   * Simulates blood pumping from an open wound or severed neck.
   * Default: 6 pulses, 500 drops each.
   */
  function emitPulse(pos, options) {
    if (!_scene) return;
    // FPS-based particle budget: scale per-pulse count by current throttle level
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    const opts     = options || {};
    const pulses   = opts.pulses   !== undefined ? opts.pulses   : 6;
    const perPulse = Math.ceil((opts.perPulse !== undefined ? opts.perPulse : 500) * scale);
    const interval = opts.interval !== undefined ? opts.interval : 200; // ms
    const arcDir   = opts.arcDir;   // optional THREE.Vector3 direction
    const spreadXZ = opts.spreadXZ !== undefined ? opts.spreadXZ : 1.8;
    const minSize  = opts.minSize  !== undefined ? opts.minSize  : 0.03;
    const maxSize  = opts.maxSize  !== undefined ? opts.maxSize  : 0.10;
    const minLife  = opts.minLife  !== undefined ? opts.minLife  : 50;
    const maxLife  = opts.maxLife  !== undefined ? opts.maxLife  : 100;
    const color1   = opts.color1   !== undefined ? opts.color1   : 0x8B0000;
    const color2   = opts.color2   !== undefined ? opts.color2   : 0xFF0000;

    const [r1, g1, b1] = _hexToRgb(color1);
    const [r2, g2, b2] = _hexToRgb(color2);

    for (let p = 0; p < pulses; p++) {
      setTimeout(() => {
        if (!_scene) return;
        // Pressure drops with each pulse: ~22% falloff per pump gives a realistic
        // heartbeat decay — first pump is highest-pressure, last is a weak seep.
        const pressure = Math.max(0.15, 1 - p * 0.22);
        const pulseCount = Math.ceil(perPulse * pressure);
        for (let i = 0; i < pulseCount; i++) {
          const t   = Math.random();
          const r   = r1 + (r2 - r1) * t;
          const g   = g1 + (g2 - g1) * t;
          const b   = b1 + (b2 - b1) * t;
          const size = minSize + Math.random() * (maxSize - minSize);
          const life = minLife + Math.floor(Math.random() * (maxLife - minLife));

          let vx, vy, vz;
          if (arcDir) {
            // Fan out 180° relative to arcDir
            const baseAngle = Math.atan2(arcDir.z, arcDir.x);
            const angle = baseAngle + (Math.random() - 0.5) * Math.PI;
            const speed = (0.05 + Math.random() * spreadXZ) * pressure;
            vx = Math.cos(angle) * speed;
            // Realistic pump height: first pulse ~1-2m, decays with pressure.
            // Formula: vy^2 / (2 * GRAVITY_ABS) = height → vy = sqrt(2 * 0.018 * h)
            // First pump (pressure=1) → 0.12-0.27 → 0.4-2.0m; later pulses decay naturally.
            vy = (0.12 + Math.random() * 0.15) * pressure;
            vz = Math.sin(angle) * speed;
          } else {
            const theta = Math.random() * Math.PI * 2;
            const speed = (0.04 + Math.random() * spreadXZ) * pressure;
            vx = Math.cos(theta) * speed;
            vy = (0.12 + Math.random() * 0.15) * pressure;
            vz = Math.sin(theta) * speed;
          }

          _emit(pos.x, pos.y + 0.5, pos.z, vx, vy, vz, r, g, b, size, life);
        }
      }, p * interval);
    }
  }

  /**
   * Spray blood out the back (exit wound direction).
   * @param {THREE.Vector3} pos  - exit wound position
   * @param {THREE.Vector3} dir  - direction bullet was travelling (normalised)
   * @param {number} count
   */
  function emitExitWound(pos, dir, count, options) {
    if (!_scene) return;
    const opts  = options || {};
    const spread = opts.spread !== undefined ? opts.spread : 0.5;
    const speed  = opts.speed  !== undefined ? opts.speed  : 0.35;

    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xCC3300);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = 0.03 + Math.random() * 0.06;
      const life = 35 + Math.floor(Math.random() * 30);

      // Main direction + conical spread
      const perpX = -dir.z;
      const perpZ =  dir.x;
      const vy = 0.05 + Math.random() * 0.25;
      const lateral = (Math.random() - 0.5) * spread;
      const forward = speed * (0.6 + Math.random() * 0.8);
      const vx = dir.x * forward + perpX * lateral;
      const vz = dir.z * forward + perpZ * lateral;

      _emit(pos.x, pos.y, pos.z, vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Emit a drag trail of blood+guts on the ground behind a sliding lower body.
   * @param {THREE.Vector3} pos  - current position of lower body
   * @param {THREE.Vector3} vel  - slide velocity direction
   */
  function emitDragTrail(pos, vel, count) {
    if (!_scene) return;
    const [r1, g1, b1] = _hexToRgb(0x6B0000);
    const [r2, g2, b2] = _hexToRgb(0x8B2500);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = 0.06 + Math.random() * 0.08;

      // Park at ground level immediately (stain) with slight vertical scatter
      const ox = (Math.random() - 0.5) * 0.3;
      const oz = (Math.random() - 0.5) * 0.3;
      // Emit as grounded stain directly
      const idx = _head;
      _head = (_head + 1) % MAX_BLOOD_PARTICLES;
      if (_count < MAX_BLOOD_PARTICLES) _count++;
      const idx3 = idx * 3;
      _positions[idx3]     = pos.x + ox;
      _positions[idx3 + 1] = GROUND_Y;
      _positions[idx3 + 2] = pos.z + oz;
      _velX[idx] = 0;
      _velY[idx] = 0;
      _velZ[idx] = 0;
      _colors[idx3]     = r;
      _colors[idx3 + 1] = g;
      _colors[idx3 + 2] = b;
      _sizes[idx]    = size;
      _life[idx]     = 1800 + Math.floor(Math.random() * 600); // 30-40 second stain
      _grounded[idx] = 1;
    }
  }

  /**
   * Circular splatter trail (for 180-degree spinning death).
   * Call every frame while the enemy spins, passing current angle.
   * @param {THREE.Vector3} center
   * @param {number} angle   - current spin angle (radians)
   * @param {number} count   - drops per call
   */
  function emitSpinTrail(center, angle, count) {
    if (!_scene) return;
    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xFF1A1A);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = 0.04 + Math.random() * 0.07;
      const life = 40 + Math.floor(Math.random() * 30);

      // Blood flies outward from neck at current spin angle
      const dist = 0.3 + Math.random() * 0.4;
      const sprayAngle = angle + (Math.random() - 0.5) * 0.4;
      const vx = Math.cos(sprayAngle) * (0.1 + Math.random() * 0.3);
      const vy = 0.08 + Math.random() * 0.25;
      const vz = Math.sin(sprayAngle) * (0.1 + Math.random() * 0.3);

      _emit(
        center.x + Math.cos(angle) * dist,
        center.y + 0.6,
        center.z + Math.sin(angle) * dist,
        vx, vy, vz, r, g, b, size, life
      );
    }
  }

  /**
   * Emit viscera/gut blobs that spill onto the floor — for heavy damage deaths
   * (shotgun, explosives). Creates large, dark elongated particles dragging on ground.
   * @param {THREE.Vector3} pos  - wound/death position
   * @param {object} options
   */
  function emitGuts(pos, options) {
    if (!_scene) return;
    const opts = options || {};
    const count = opts.count !== undefined ? opts.count : 60;
    const dir   = opts.dir; // optional THREE.Vector3 spill direction
    // Viscera color palette: dark purple, dark red, pink intestine tones
    const viscColors = [0x4B0082, 0x6B0000, 0x8B2500, 0x5C1A1A, 0xFF69B4];
    for (let i = 0; i < count; i++) {
      const hex = viscColors[Math.floor(Math.random() * viscColors.length)];
      const [r, g, b] = _hexToRgb(hex);
      const size = 0.12 + Math.random() * 0.20; // large blobs
      const baseAngle = dir ? Math.atan2(dir.z, dir.x) : Math.random() * Math.PI * 2;
      const angle = baseAngle + (Math.random() - 0.5) * (dir ? Math.PI * 0.8 : Math.PI * 2);
      const dist  = Math.random() * 0.7;
      // Heavy, low — guts fall to ground quickly
      const speed = 0.015 + Math.random() * 0.04;
      const vx = Math.cos(angle) * speed;
      const vy = 0.03 + Math.random() * 0.10;
      const vz = Math.sin(angle) * speed;
      _emit(
        pos.x + Math.cos(angle) * dist * 0.4,
        pos.y + 0.3,
        pos.z + Math.sin(angle) * dist * 0.4,
        vx, vy, vz, r, g, b, size,
        1800 + Math.floor(Math.random() * 600) // 30-40 second stain
      );
    }
  }

  /**
   * Emit a fine blood mist for drone turret hits — tiny droplets spread along the
   * bullet line, simulating 15-20 rapid small-calibre entry wounds.
   * @param {THREE.Vector3} pos       - impact centre
   * @param {THREE.Vector3} bulletDir - normalised bullet travel direction
   * @param {number} count
   * @param {object} options
   */
  function emitDroneMist(pos, bulletDir, count, options) {
    if (!_scene) return;
    const opts = options || {};
    const lineLength = opts.lineLength !== undefined ? opts.lineLength : 0.45;
    const n = count !== undefined ? count : 80;
    const [r1, g1, b1] = _hexToRgb(0xCC0000);
    const [r2, g2, b2] = _hexToRgb(0xFF2200);
    // Perpendicular to bullet direction (horizontal spread axis)
    const perpX = -bulletDir.z;
    const perpZ =  bulletDir.x;

    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = 0.015 + Math.random() * 0.025; // very fine mist
      const life = 20 + Math.floor(Math.random() * 20);

      // Spread along perpendicular axis to create a line of tiny holes
      const along = (Math.random() - 0.5) * lineLength;
      const ox = perpX * along;
      const oz = perpZ * along;

      // Slight forward spray + micro gravity fall
      const vx = bulletDir.x * (0.02 + Math.random() * 0.04) + (Math.random() - 0.5) * 0.025;
      const vy = 0.01 + Math.random() * 0.06;
      const vz = bulletDir.z * (0.02 + Math.random() * 0.04) + (Math.random() - 0.5) * 0.025;

      _emit(pos.x + ox, pos.y + 0.35, pos.z + oz, vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Emit a sword-slash wound — a horizontal arc of blood particles spraying in the
   * direction of the slash. Simulates immediate blood flow from a cutting wound.
   * @param {THREE.Vector3} pos    - wound centre
   * @param {THREE.Vector3} slashDir - normalised direction of the slash
   * @param {number} count
   */
  function emitSwordSlash(pos, slashDir, count) {
    if (!_scene) return;
    const n = count !== undefined ? count : 70;
    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xCC0000);
    // Perpendicular to slash direction (spread along wound line)
    const perpX = -slashDir.z;
    const perpZ =  slashDir.x;

    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      // Mix of tiny and medium droplets along the slash line
      const size = Math.random() < 0.4 ? (0.015 + Math.random() * 0.03) : (0.04 + Math.random() * 0.07);
      const life = 30 + Math.floor(Math.random() * 50);

      // Spread along the wound line + outward spray
      const along = (Math.random() - 0.5) * 0.8;
      const outward = 0.04 + Math.random() * 0.12;
      const vx = slashDir.x * outward + perpX * along * 0.3;
      // Low upward velocity — slash wounds bleed outward more than upward
      const vy = 0.03 + Math.random() * 0.08;
      const vz = slashDir.z * outward + perpZ * along * 0.3;

      _emit(pos.x + perpX * along * 0.3, pos.y + 0.4, pos.z + perpZ * along * 0.3,
            vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Emit aura-burn effects — small charred particles and boiling blood droplets for
   * energy/heat-based weapon kills.
   * @param {THREE.Vector3} pos
   * @param {number} count
   */
  function emitAuraBurn(pos, count) {
    if (!_scene) return;
    const n = count !== undefined ? count : 60;
    // Dark charred + bright boiling-blood palette
    const burnColors = [0x2A0000, 0x550000, 0x8B0000, 0xCC2200, 0xFF4500];

    for (let i = 0; i < n; i++) {
      const hex = burnColors[Math.floor(Math.random() * burnColors.length)];
      const [r, g, b] = _hexToRgb(hex);
      const size = 0.02 + Math.random() * 0.06;
      const life = 25 + Math.floor(Math.random() * 35);

      const theta = Math.random() * Math.PI * 2;
      const speed = 0.02 + Math.random() * 0.06;
      const vx = Math.cos(theta) * speed;
      // Boiling: particles rise upward then fall back
      const vy = 0.04 + Math.random() * 0.10;
      const vz = Math.sin(theta) * speed;

      _emit(pos.x, pos.y + 0.3, pos.z, vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Simulate heartbeat pumping blood from open wounds/holes. Rhythmic pulsation
   * with decreasing pressure — blood arcs upward then rains down with gravity,
   * creating ground pools on impact.
   * @param {THREE.Vector3} pos
   * @param {object} options
   */
  function emitHeartbeatWound(pos, options) {
    if (!_scene) return;
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    const opts       = options || {};
    const pulses     = opts.pulses     !== undefined ? opts.pulses     : 8;
    const perPulse   = Math.ceil((opts.perPulse !== undefined ? opts.perPulse : 200) * scale);
    const interval   = opts.interval   !== undefined ? opts.interval   : 350;
    const woundHeight = opts.woundHeight !== undefined ? opts.woundHeight : 0.5;
    const basePressure = opts.pressure !== undefined ? opts.pressure : 1.0;

    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xCC1100);

    for (let p = 0; p < pulses; p++) {
      setTimeout(() => {
        if (!_scene) return;
        // Pressure decreases with each heartbeat — first pump is strongest
        const pressure = Math.max(0.1, basePressure * (1 - p * 0.12));
        const pulseCount = Math.ceil(perPulse * pressure);
        for (let i = 0; i < pulseCount; i++) {
          const t    = Math.random();
          const r    = r1 + (r2 - r1) * t;
          const g    = g1 + (g2 - g1) * t;
          const b    = b1 + (b2 - b1) * t;
          const size = 0.03 + Math.random() * 0.09;
          const life = 60 + Math.floor(Math.random() * 60);

          const theta = Math.random() * Math.PI * 2;
          const speed = (0.02 + Math.random() * 0.06) * pressure;
          const vx = Math.cos(theta) * speed;
          // Blood arcs upward — height depends on pressure & woundHeight
          const vy = (0.10 + Math.random() * 0.18) * pressure * woundHeight;
          const vz = Math.sin(theta) * speed;

          _emit(pos.x, pos.y + 0.4, pos.z, vx, vy, vz, r, g, b, size, life);
        }
      }, p * interval);
    }
  }

  /**
   * Arterial spray from throat/neck wounds. Blood pumps in arcs following the
   * heartbeat, spraying forward and to the sides. Creates heavy ground coating.
   * @param {THREE.Vector3} pos
   * @param {THREE.Vector3} facingDir - normalised direction the character faces
   * @param {object} options
   */
  function emitThroatSpray(pos, facingDir, options) {
    if (!_scene) return;
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    const opts      = options || {};
    const pulses    = opts.pulses    !== undefined ? opts.pulses    : 6;
    const perPulse  = Math.ceil((opts.perPulse !== undefined ? opts.perPulse : 300) * scale);
    const arcHeight = opts.arcHeight !== undefined ? opts.arcHeight : 0.8;

    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xFF0000);

    const baseAngle = Math.atan2(facingDir.z, facingDir.x);

    for (let p = 0; p < pulses; p++) {
      setTimeout(() => {
        if (!_scene) return;
        const pressure = Math.max(0.15, 1 - p * 0.18);
        const pulseCount = Math.ceil(perPulse * pressure);
        for (let i = 0; i < pulseCount; i++) {
          const t    = Math.random();
          const r    = r1 + (r2 - r1) * t;
          const g    = g1 + (g2 - g1) * t;
          const b    = b1 + (b2 - b1) * t;
          const size = 0.03 + Math.random() * 0.08;
          const life = 50 + Math.floor(Math.random() * 60);

          // Spray forward with side spread — fan 120° around facing direction
          const angle = baseAngle + (Math.random() - 0.5) * (Math.PI * 0.67);
          const speed = (0.08 + Math.random() * 0.15) * pressure;
          const vx = Math.cos(angle) * speed;
          const vy = (0.12 + Math.random() * 0.20) * pressure * arcHeight;
          const vz = Math.sin(angle) * speed;

          _emit(pos.x, pos.y + 0.6, pos.z, vx, vy, vz, r, g, b, size, life);
        }
      }, p * 350);
    }
  }

  /**
   * Blood pumping from head wounds / removed head stump. Fountain effect upward
   * with blood raining down, creating significant ground pooling.
   * @param {THREE.Vector3} pos
   * @param {object} options
   */
  function emitHeadBleed(pos, options) {
    if (!_scene) return;
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    const opts      = options || {};
    const intensity = opts.intensity !== undefined ? opts.intensity : 1.0;
    const duration  = opts.duration  !== undefined ? opts.duration  : 8;
    const perPulse  = Math.ceil(250 * scale * intensity);

    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xDD1100);

    for (let p = 0; p < duration; p++) {
      setTimeout(() => {
        if (!_scene) return;
        const pressure = Math.max(0.12, 1 - p * 0.11);
        const pulseCount = Math.ceil(perPulse * pressure);
        for (let i = 0; i < pulseCount; i++) {
          const t    = Math.random();
          const r    = r1 + (r2 - r1) * t;
          const g    = g1 + (g2 - g1) * t;
          const b    = b1 + (b2 - b1) * t;
          const size = 0.03 + Math.random() * 0.10;
          const life = 60 + Math.floor(Math.random() * 70);

          // Fountain: mostly upward, slight radial spread
          const theta = Math.random() * Math.PI * 2;
          const spread = 0.01 + Math.random() * 0.04;
          const vx = Math.cos(theta) * spread;
          const vy = (0.16 + Math.random() * 0.22) * pressure * intensity;
          const vz = Math.sin(theta) * spread;

          _emit(pos.x, pos.y + 0.7, pos.z, vx, vy, vz, r, g, b, size, life);
        }
      }, p * 300);
    }
  }

  /**
   * Player water blood equivalent — same physics as emitBurst but uses blue/cyan
   * water colours. Water drops fall with gravity and create water pools on ground.
   * @param {THREE.Vector3} pos
   * @param {number} count
   * @param {object} options
   */
  function emitWaterBurst(pos, count, options) {
    if (!_scene) return;
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    count = Math.ceil(count * scale);
    const opts = options || {};
    const spreadXZ = opts.spreadXZ !== undefined ? opts.spreadXZ : 1.8;
    const spreadY  = opts.spreadY  !== undefined ? opts.spreadY  : 0.3;
    const minLife  = opts.minLife  !== undefined ? opts.minLife  : 50;
    const maxLife  = opts.maxLife  !== undefined ? opts.maxLife  : 100;
    const minSize  = opts.minSize  !== undefined ? opts.minSize  : 0.04;
    const maxSize  = opts.maxSize  !== undefined ? opts.maxSize  : 0.14;
    const color1   = opts.color1   !== undefined ? opts.color1   : 0x5DADE2;
    const color2   = opts.color2   !== undefined ? opts.color2   : 0x87CEEB;

    // Water colour palette — blend between blue/cyan tones
    const waterColors = [0x5DADE2, 0x87CEEB, 0x44AABB];
    const [r1, g1, b1] = _hexToRgb(color1);
    const [r2, g2, b2] = _hexToRgb(color2);

    for (let i = 0; i < count; i++) {
      // Occasionally pick from the tertiary cyan colour
      let r, g, b;
      if (Math.random() < 0.25) {
        [r, g, b] = _hexToRgb(waterColors[2]);
      } else {
        const t = Math.random();
        r = r1 + (r2 - r1) * t;
        g = g1 + (g2 - g1) * t;
        b = b1 + (b2 - b1) * t;
      }
      const size = minSize + Math.random() * (maxSize - minSize);
      const life = minLife + Math.floor(Math.random() * (maxLife - minLife));

      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI;
      const speed = 0.04 + Math.random() * spreadXZ;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.abs(Math.cos(phi)) * spreadY + 0.05;
      const vz = Math.sin(phi) * Math.sin(theta) * speed;

      _emit(pos.x, pos.y + 0.3, pos.z, vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Player water blood pulsation — same as emitPulse but with water/blue colours.
   * Water pools form on the ground with lighter blue tones.
   * @param {THREE.Vector3} pos
   * @param {object} options
   */
  function emitWaterPulse(pos, options) {
    if (!_scene) return;
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    const opts     = options || {};
    const pulses   = opts.pulses   !== undefined ? opts.pulses   : 6;
    const perPulse = Math.ceil((opts.perPulse !== undefined ? opts.perPulse : 500) * scale);
    const interval = opts.interval !== undefined ? opts.interval : 200;
    const arcDir   = opts.arcDir;
    const spreadXZ = opts.spreadXZ !== undefined ? opts.spreadXZ : 1.8;
    const minSize  = opts.minSize  !== undefined ? opts.minSize  : 0.03;
    const maxSize  = opts.maxSize  !== undefined ? opts.maxSize  : 0.10;
    const minLife  = opts.minLife  !== undefined ? opts.minLife  : 50;
    const maxLife  = opts.maxLife  !== undefined ? opts.maxLife  : 100;

    // Water blue/cyan palette
    const [r1, g1, b1] = _hexToRgb(0x5DADE2);
    const [r2, g2, b2] = _hexToRgb(0x87CEEB);
    const [r3, g3, b3] = _hexToRgb(0x44AABB);

    for (let p = 0; p < pulses; p++) {
      setTimeout(() => {
        if (!_scene) return;
        const pressure = Math.max(0.15, 1 - p * 0.22);
        const pulseCount = Math.ceil(perPulse * pressure);
        for (let i = 0; i < pulseCount; i++) {
          let r, g, b;
          if (Math.random() < 0.25) {
            r = r3; g = g3; b = b3;
          } else {
            const t = Math.random();
            r = r1 + (r2 - r1) * t;
            g = g1 + (g2 - g1) * t;
            b = b1 + (b2 - b1) * t;
          }
          const size = minSize + Math.random() * (maxSize - minSize);
          const life = minLife + Math.floor(Math.random() * (maxLife - minLife));

          let vx, vy, vz;
          if (arcDir) {
            const baseAngle = Math.atan2(arcDir.z, arcDir.x);
            const angle = baseAngle + (Math.random() - 0.5) * Math.PI;
            const speed = (0.05 + Math.random() * spreadXZ) * pressure;
            vx = Math.cos(angle) * speed;
            vy = (0.12 + Math.random() * 0.15) * pressure;
            vz = Math.sin(angle) * speed;
          } else {
            const theta = Math.random() * Math.PI * 2;
            const speed = (0.04 + Math.random() * spreadXZ) * pressure;
            vx = Math.cos(theta) * speed;
            vy = (0.12 + Math.random() * 0.15) * pressure;
            vz = Math.sin(theta) * speed;
          }

          _emit(pos.x, pos.y + 0.5, pos.z, vx, vy, vz, r, g, b, size, life);
        }
      }, p * interval);
    }
  }

  /**
   * Create a growing blood pool on the ground that expands over time. Starts small
   * and grows as blood accumulates — particles are placed directly as ground stains.
   * @param {THREE.Vector3} pos
   * @param {object} options
   */
  function emitPoolGrow(pos, options) {
    if (!_scene) return;
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    const opts      = options || {};
    const maxRadius = opts.maxRadius !== undefined ? opts.maxRadius : 1.5;
    const growSpeed = opts.growSpeed !== undefined ? opts.growSpeed : 0.02;
    const poolColor = opts.color    !== undefined ? opts.color    : 0x6B0000;
    const steps     = 30;
    const perStep   = Math.ceil(12 * scale);

    const [pr, pg, pb] = _hexToRgb(poolColor);

    // Blood Alchemy: track active pool count; decrement after pool's lifetime (30-40s)
    window._activeBloodPools = (window._activeBloodPools || 0) + 1;
    const _poolLifetime = 30000 + Math.random() * 10000; // 30-40 seconds, matching particle lifetime
    setTimeout(() => {
      window._activeBloodPools = Math.max(0, (window._activeBloodPools || 1) - 1);
    }, _poolLifetime);

    for (let s = 0; s < steps; s++) {
      setTimeout(() => {
        if (!_scene) return;
        const radius = Math.min(maxRadius, (s + 1) * growSpeed * maxRadius);
        for (let i = 0; i < perStep; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist  = Math.random() * radius;
          // Slight colour variation for natural look
          const shade = 0.85 + Math.random() * 0.15;
          const r = pr * shade;
          const g = pg * shade;
          const b = pb * shade;
          const size = 0.08 + Math.random() * 0.12;

          // Place directly as grounded stain
          const idx = _head;
          _head = (_head + 1) % MAX_BLOOD_PARTICLES;
          if (_count < MAX_BLOOD_PARTICLES) _count++;
          if (_head > _highWater) _highWater = _head;
          if (_count >= MAX_BLOOD_PARTICLES) _highWater = MAX_BLOOD_PARTICLES;
          const idx3 = idx * 3;
          _positions[idx3]     = pos.x + Math.cos(angle) * dist;
          _positions[idx3 + 1] = GROUND_Y;
          _positions[idx3 + 2] = pos.z + Math.sin(angle) * dist;
          _velX[idx] = 0;
          _velY[idx] = 0;
          _velZ[idx] = 0;
          _colors[idx3]     = r;
          _colors[idx3 + 1] = g;
          _colors[idx3 + 2] = b;
          _sizes[idx]    = size;
          _life[idx]     = 1800 + Math.floor(Math.random() * 600); // 30-40 second pool
          _grounded[idx] = 1;
        }
      }, s * 80);
    }
  }

  /**
   * Massive explosion blood spray for homing/meteor kills. Blood and body parts
   * fly in all directions with high velocity. Burn marks mixed with blood.
   * @param {THREE.Vector3} pos
   * @param {number} count
   * @param {object} options
   */
  function emitMeteorExplosion(pos, count, options) {
    if (!_scene) return;
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    count = Math.ceil(count * scale);
    const opts      = options || {};
    const radius    = opts.radius    !== undefined ? opts.radius    : 3.0;
    const burnColor = opts.burnColor !== undefined ? opts.burnColor : 0x332200;

    // Explosion palette: blood reds + burn/char tones
    const bloodColors = [0x8B0000, 0xCC1100, 0xFF1A1A];
    const charColors  = [burnColor, 0x1A0A00, 0x553300];

    for (let i = 0; i < count; i++) {
      // 70% blood, 30% burn/char particles
      const isBurn = Math.random() < 0.3;
      const palette = isBurn ? charColors : bloodColors;
      const hex = palette[Math.floor(Math.random() * palette.length)];
      const [r, g, b] = _hexToRgb(hex);
      const size = isBurn
        ? (0.04 + Math.random() * 0.08)
        : (0.05 + Math.random() * 0.15);
      const life = 50 + Math.floor(Math.random() * 80);

      // High-velocity radial explosion — spread reduced by 25% so it looks big but stays tighter
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI;
      const speed = (0.10 + Math.random() * 0.30) * (radius / 3.0) * 0.75;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.abs(Math.cos(phi)) * speed * 0.8 + 0.05;
      const vz = Math.sin(phi) * Math.sin(theta) * speed;

      _emit(pos.x, pos.y + 0.4, pos.z, vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Blood trail from crawling wounded enemy. Similar to drag trail but with
   * handprint-like patterns and intermittent drip marks.
   * @param {THREE.Vector3} pos - current crawl position
   * @param {THREE.Vector3} dir - crawl direction (normalised)
   * @param {number} count
   */
  function emitCrawlTrail(pos, dir, count) {
    if (!_scene) return;
    const n = count !== undefined ? count : 8;
    const [r1, g1, b1] = _hexToRgb(0x6B0000);
    const [r2, g2, b2] = _hexToRgb(0x8B2500);

    // Perpendicular to crawl direction for handprint side offset
    const perpX = -dir.z;
    const perpZ =  dir.x;

    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;

      // Alternate handprint patterns (left/right of centre) with random drips
      const isHandprint = Math.random() < 0.6;
      const side = (i % 2 === 0) ? 1 : -1;
      const lateralOffset = isHandprint ? side * (0.15 + Math.random() * 0.1) : (Math.random() - 0.5) * 0.2;
      const forwardOffset = (Math.random() - 0.5) * 0.15;
      const size = isHandprint ? (0.08 + Math.random() * 0.06) : (0.03 + Math.random() * 0.04);

      // Place directly as grounded stain
      const idx = _head;
      _head = (_head + 1) % MAX_BLOOD_PARTICLES;
      if (_count < MAX_BLOOD_PARTICLES) _count++;
      if (_head > _highWater) _highWater = _head;
      if (_count >= MAX_BLOOD_PARTICLES) _highWater = MAX_BLOOD_PARTICLES;
      const idx3 = idx * 3;
      _positions[idx3]     = pos.x + perpX * lateralOffset + dir.x * forwardOffset;
      _positions[idx3 + 1] = GROUND_Y;
      _positions[idx3 + 2] = pos.z + perpZ * lateralOffset + dir.z * forwardOffset;
      _velX[idx] = 0;
      _velY[idx] = 0;
      _velZ[idx] = 0;
      _colors[idx3]     = r;
      _colors[idx3 + 1] = g;
      _colors[idx3 + 2] = b;
      _sizes[idx]    = size;
      _life[idx]     = 1800 + Math.floor(Math.random() * 600); // 30-40 second stain
      _grounded[idx] = 1;
    }
  }

  // ─── Update (call every frame) ───────────────────────────────────────────────
  function update() {
    if (!_scene || !_geo) return;

    // Only iterate particles up to the high-water mark (avoids scanning 50k dead slots)
    const limit = _highWater;

    let needsUpdate = false;
    let anyAlive = false;
    for (let i = 0; i < limit; i++) {
      if (_life[i] <= 0) continue;
      anyAlive = true;
      needsUpdate = true;
      _life[i]--;

      if (_grounded[i]) {
        // Stain — very slow fade to match 30-second lifetime, darkening toward dried blood
        const i3 = i * 3;
        if (_colors[i3] > 0.18) _colors[i3]     -= 0.00015;
        if (_colors[i3+1] > 0)  _colors[i3 + 1] -= 0.00008;
        if (_life[i] <= 0) _positions[i * 3 + 1] = -9999;
        continue;
      }

      // Physics
      const i3 = i * 3;
      _velY[i] += GRAVITY;
      _positions[i3]     += _velX[i];
      _positions[i3 + 1] += _velY[i];
      _positions[i3 + 2] += _velZ[i];

      // Ground collision → become stain
      if (_positions[i3 + 1] <= GROUND_Y) {
        _positions[i3 + 1] = GROUND_Y;
        _velX[i] = 0;
        _velY[i] = 0;
        _velZ[i] = 0;
        _grounded[i] = 1;
        // 30–40 second semi-permanent decals (1800–2400 frames at 60fps)
        _life[i] = 1800 + Math.floor(Math.random() * 600);
        // Fan out on ground — add slight random spread to position
        _positions[i3]     += (Math.random() - 0.5) * 0.15;
        _positions[i3 + 2] += (Math.random() - 0.5) * 0.15;
        // Make stain larger and vary opacity via colour intensity (0.6–0.9 range)
        _sizes[i] = Math.min(0.22, _sizes[i] * 2.0);
        const wetness = 0.6 + Math.random() * 0.3; // 0.6–0.9 opacity equivalent
        _colors[i3]     = Math.min(1, _colors[i3]     * wetness * 1.5);
        _colors[i3 + 1] = Math.min(1, _colors[i3 + 1] * wetness);
        _colors[i3 + 2] = Math.min(1, _colors[i3 + 2] * wetness);
      }

      // Kill if life expired
      if (_life[i] <= 0) {
        _positions[i3 + 1] = -9999;
      }
    }

    if (needsUpdate) {
      _geo.attributes.position.needsUpdate = true;
      _geo.attributes.color.needsUpdate    = true;
    }

    // Limit GPU draw range to only the particles that have been allocated
    _geo.setDrawRange(0, limit);

    // If no particles remain alive, reset high-water mark to avoid wasted iteration
    if (!anyAlive) {
      _highWater = 0;
      _count = 0;
      _head = 0;
    }

    // ── Wound heartbeat spurts ───────────────────────────────────────────────
    // Emit weapon-specific blood jets from each registered wound, scaled by a
    // sine-wave "heartbeat" pump so the spurts visually pulse with each beat.
    if (_wounds.length > 0) {
      const now = Date.now();
      // Main cardiac pump frequency: ~0.008 rad/ms ≈ 75 bpm
      const pump = Math.max(0, Math.sin(now * 0.008));
      // Only emit during the rising half of the pump — creates distinct pulses
      const isEmitting = pump > 0.3;
      const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
        ? window.performanceLog.particleThrottleScale : 1.0;

      for (let wi = _wounds.length - 1; wi >= 0; wi--) {
        const w = _wounds[wi];
        w.life--;
        if (w.life <= 0) { _wounds.splice(wi, 1); continue; }
        if (!isEmitting) continue;

        // Weapon-specific arc shape and volume
        let perPump = 10, coneAngle = 0.30, speed = 0.12, arcY = 0.09;
        const wp = w.weapon;
        if (wp === 'shotgun' || wp === 'doubleBarrel' || wp === 'pumpShotgun' || wp === 'autoShotgun') {
          // Shotgun: wide mist — many fine drops, broad cone, low velocity
          perPump   = Math.ceil(12 * pump * scale);
          coneAngle = Math.PI * 0.55;
          speed     = 0.04 * pump;
          arcY      = 0.04 * pump;
        } else if (wp === 'sniperRifle' || wp === '50cal') {
          // Sniper: tight high-pressure jet that reaches far
          perPump   = Math.ceil(18 * pump * scale);
          coneAngle = 0.08;
          speed     = 0.28 * pump;
          arcY      = 0.18 * pump;
        } else if (wp === 'minigun' || wp === 'uzi') {
          // Rapid fire: moderate stream, moderate cone
          perPump   = Math.ceil(8 * pump * scale);
          coneAngle = 0.22;
          speed     = 0.12 * pump;
          arcY      = 0.08 * pump;
        } else {
          // Default gun / sword / other: standard medium spurt
          perPump   = Math.ceil(10 * pump * scale);
          coneAngle = 0.30;
          speed     = 0.12 * pump;
          arcY      = 0.09 * pump;
        }

        const baseAngle = Math.atan2(w.dirZ, w.dirX);
        for (let p = 0; p < perPump; p++) {
          const t     = Math.random();
          const r     = 0.55 + t * 0.12;  // dark → bright red
          const g     = 0.0;
          const b     = 0.0;
          const sz    = 0.025 + Math.random() * 0.04;
          const life  = 35 + Math.floor(Math.random() * 35);
          const angle = baseAngle + (Math.random() - 0.5) * coneAngle * 2;
          const spd   = speed * (0.7 + Math.random() * 0.6);
          const vx    = Math.cos(angle) * spd;
          const vy    = arcY  * (0.8 + Math.random() * 0.4);
          const vz    = Math.sin(angle) * spd;
          _emit(w.x, w.y, w.z, vx, vy, vz, r, g, b, sz, life);
        }
      }
    }

    // ── Instanced blood drops update ─────────────────────────────────────────
    // Physics: gravity + parabolic trajectory.  Ground landing → shrink + stain.
    if (_dropIM && _dropHighWater > 0) {
      let needsDropUpdate = false;
      const dlimit = _dropHighWater;
      for (let i = 0; i < dlimit; i++) {
        if (_dropLife[i] <= 0) continue;
        _dropLife[i]--;

        if (_dropPY[i] <= 0.02) {
          // Landed — park, shrink, emit a Points stain
          _dropLife[i] = 0;
          // Small stain: emit one grounded Points particle at impact site
          const sx = _dropPX[i] + (Math.random() - 0.5) * 0.1;
          const sz = _dropPZ[i] + (Math.random() - 0.5) * 0.1;
          const ss = Math.min(0.20, _dropSize[i] * 2.5);
          _emit(sx, GROUND_Y, sz, 0, 0, 0, 0.55, 0, 0, ss, 1800 + Math.floor(Math.random() * 600));
          const stainIdx = (_head - 1 + MAX_BLOOD_PARTICLES) % MAX_BLOOD_PARTICLES;
          _grounded[stainIdx] = 1;
          // Park instance below ground
          _dPos.set(0, -9999, 0);
          _dScale.set(0, 0, 0);
          _dMtx.compose(_dPos, _dQuat, _dScale);
          _dropIM.setMatrixAt(i, _dMtx);
          needsDropUpdate = true;
          continue;
        }

        // Parabolic physics
        _dropVY[i] += GRAVITY;
        _dropPX[i] += _dropVX[i];
        _dropPY[i] += _dropVY[i];
        _dropPZ[i] += _dropVZ[i];

        // Kill if life expired on this frame (life was 1 before decrement above)
        if (_dropLife[i] <= 0) {
          _dPos.set(0, -9999, 0);
          _dScale.set(0, 0, 0);
          _dMtx.compose(_dPos, _dQuat, _dScale);
          _dropIM.setMatrixAt(i, _dMtx);
          needsDropUpdate = true;
          continue;
        }

        // Update instance matrix with current position
        const s = _dropSize[i];
        _dPos.set(_dropPX[i], _dropPY[i], _dropPZ[i]);
        _dScale.set(s, s, s);
        _dMtx.compose(_dPos, _dQuat, _dScale);
        _dropIM.setMatrixAt(i, _dMtx);
        needsDropUpdate = true;
      }
      if (needsDropUpdate) _dropIM.instanceMatrix.needsUpdate = true;
    }
  }

  // ─── Cleanup (call on game reset) ────────────────────────────────────────────
  function reset() {
    if (!_life) return;
    for (let i = 0; i < _highWater; i++) {
      _life[i]     = 0;
      _grounded[i] = 0;
      if (_positions) _positions[i * 3 + 1] = -9999;
    }
    _highWater = 0;
    _count = 0;
    _head = 0;
    if (_geo) {
      _geo.setDrawRange(0, 0);
      if (_geo.attributes.position) _geo.attributes.position.needsUpdate = true;
    }
    // Clear all active wounds
    _wounds.length = 0;
    // Reset instanced blood drops — park all below ground
    if (_dropIM) {
      _dScale.set(0, 0, 0);
      for (let i = 0; i < _dropHighWater; i++) {
        _dropLife[i] = 0;
        _dropPY[i]   = -9999;
        _dPos.set(0, -9999, 0);
        _dMtx.compose(_dPos, _dQuat, _dScale);
        _dropIM.setMatrixAt(i, _dMtx);
      }
      if (_dropHighWater > 0) _dropIM.instanceMatrix.needsUpdate = true;
    }
    _dropHead      = 0;
    _dropHighWater = 0;
  }

  // ─── Instanced Blood Drop Emit ───────────────────────────────────────────────
  /**
   * Spawn one flying blood drop using the shared InstancedMesh pool.
   * Drops obey parabolic physics (gravity) and trigger a ground stain on landing.
   * @param {number} x,y,z   - spawn position
   * @param {number} vx,vy,vz - initial velocity
   * @param {number} size    - radius of the drop (0.02–0.08 typical)
   */
  function emitDrop(x, y, z, vx, vy, vz, size) {
    if (!_dropIM) return;
    // Guard against NaN positions
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    const i = _dropHead;
    _dropHead = (_dropHead + 1) % MAX_BLOOD_DROPS;
    if (i + 1 > _dropHighWater) _dropHighWater = i + 1;

    _dropPX[i]   = x;
    _dropPY[i]   = y;
    _dropPZ[i]   = z;
    _dropVX[i]   = isFinite(vx) ? vx : 0;
    _dropVY[i]   = isFinite(vy) ? vy : 0;
    _dropVZ[i]   = isFinite(vz) ? vz : 0;
    _dropSize[i] = (size > 0 && isFinite(size)) ? size : 0.04;
    _dropLife[i] = 60 + Math.random() * 40;
  }

  // ─── Wound System ───────────────────────────────────────────────────────────
  /**
   * Register a persistent arterial wound on an enemy.  During update(), the wound
   * emits heartbeat-timed blood spurts whose volume and pressure scale with a
   * sine-wave "pump" to simulate a beating heart.
   *
   * @param {THREE.Vector3|{x,y,z}} pos       - world-space wound origin
   * @param {{x,z}}|null            facingDir - direction blood jets outward
   * @param {string}                weaponType - e.g. 'shotgun', 'sniperRifle', 'gun'
   * @param {object}                [options]
   *   life {number} – wound lifetime in frames (default 360 ≈ 6 s at 60 fps)
   */
  function addWound(pos, facingDir, weaponType, options) {
    if (!_scene) return;
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) return;
    const opts = options || {};
    const life = (opts.life > 0 && isFinite(opts.life)) ? opts.life : 360;
    // Evict oldest wound when at capacity (hard cap for GC safety)
    if (_wounds.length >= MAX_WOUNDS || _wounds.length >= MAX_ACTIVE_WOUNDS_CAP) _wounds.shift();
    _wounds.push({
      x:      pos.x,
      y:      pos.y + 0.4, // mid-chest offset
      z:      pos.z,
      dirX:   (facingDir && isFinite(facingDir.x)) ? facingDir.x : 1,
      dirZ:   (facingDir && isFinite(facingDir.z)) ? facingDir.z : 0,
      weapon: weaponType || 'gun',
      life:   life
    });
  }

  /** Remove all registered wounds (called on game reset). */
  function clearWounds() {
    _wounds.length = 0;
  }

  // How much pressure drops per pump in emitArterialSpurt.
  // 0.12 → first 8 pumps range from 1.0 down to 0.16 (realistic heartbeat decay).
  const ARTERIAL_PRESSURE_DECAY_RATE = 0.12;

  /**
   * Arterial spurt — continuous high-pressure jets of blood pumping from a
   * wound on a heavily damaged or dying enemy. Shoots narrow streams in a
   * specific direction (e.g. out of neck / chest) that arc and fall.
   *
   * @param {THREE.Vector3} pos       - wound origin position
   * @param {THREE.Vector3} facingDir - direction blood squirts out (normalised)
   * @param {object}        options
   *   pulses       {number}  – number of heartbeat-timed squirts (default 8)
   *   perPulse     {number}  – particles per squirt (default 80)
   *   interval     {number}  – ms between squirts (default 160)
   *   intensity    {number}  – pressure multiplier 0–1 (default 1.0)
   *   coneAngle    {number}  – half-angle of spray cone in radians (default 0.25)
   */
  function emitArterialSpurt(pos, facingDir, options) {
    if (!_scene) return;
    const scale = (window.performanceLog && window.performanceLog.particleThrottleScale !== undefined)
      ? window.performanceLog.particleThrottleScale : 1.0;
    const opts      = options  || {};
    const pulses    = opts.pulses    !== undefined ? opts.pulses    : 8;
    const perPulse  = Math.ceil((opts.perPulse !== undefined ? opts.perPulse : 80) * scale);
    const interval  = opts.interval  !== undefined ? opts.interval  : 160;
    const intensity = opts.intensity !== undefined ? opts.intensity : 1.0;
    const coneAngle = opts.coneAngle !== undefined ? opts.coneAngle : 0.25;

    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xFF0000);

    // Base spray direction from the facing vector
    const baseAngle = facingDir ? Math.atan2(facingDir.z, facingDir.x) : 0;

    for (let p = 0; p < pulses; p++) {
      setTimeout(() => {
        if (!_scene) return;
        // Pressure decays with each pulse — realistic heartbeat pumping effect
        const pressure = Math.max(0.10, 1 - p * ARTERIAL_PRESSURE_DECAY_RATE) * intensity;
        const count    = Math.ceil(perPulse * pressure);
        for (let i = 0; i < count; i++) {
          const t    = Math.random();
          const r    = r1 + (r2 - r1) * t;
          const g    = g1 + (g2 - g1) * t;
          const b    = b1 + (b2 - b1) * t;
          const size = 0.025 + Math.random() * 0.045;
          const life = 40 + Math.floor(Math.random() * 50);

          // Narrow cone spray: tight jet with slight lateral wobble
          const angle  = baseAngle + (Math.random() - 0.5) * coneAngle * 2;
          const speed  = (0.10 + Math.random() * 0.12) * pressure;
          const vx     = Math.cos(angle) * speed;
          // Arc upward then fall — first pump high arc, later pulses droop lower
          const vy     = (0.08 + Math.random() * 0.10) * pressure;
          const vz     = Math.sin(angle) * speed;

          _emit(pos.x, pos.y + 0.55, pos.z, vx, vy, vz, r, g, b, size, life);
        }
      }, p * interval);
    }
  }

  // ─── Expose ──────────────────────────────────────────────────────────────────
  window.BloodSystem = {
    init,
    update,
    reset,
    emitBurst,
    emitPulse,
    emitExitWound,
    emitDragTrail,
    emitSpinTrail,
    emitGuts,
    emitDroneMist,
    emitSwordSlash,
    emitAuraBurn,
    emitHeartbeatWound,
    emitThroatSpray,
    emitHeadBleed,
    emitWaterBurst,
    emitWaterPulse,
    emitPoolGrow,
    emitMeteorExplosion,
    emitCrawlTrail,
    emitArterialSpurt,
    // New: instanced drop + wound systems
    emitDrop,
    addWound,
    clearWounds
  };

})();
