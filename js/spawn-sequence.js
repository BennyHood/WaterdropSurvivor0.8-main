// --- UNDERGROUND ELEVATOR SPAWN SEQUENCE ---
// Epic underground elevator spawn animation:
//  1. Ground opens up with animated hole expansion at exact spawn location
//  2. Elevator platform rises from underground with player on it
//  3. Player materializes and grows as elevator reaches surface
//  4. Ground closes seamlessly after player emerges
// Exposes window.SpawnSequence for use by main.js

(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────
  const PLAYER_SPAWN       = { x: 12, y: 0, z: 0 };  // Where the player materialises
  const ELEVATOR_START_Y   = -8;                      // Starting depth underground
  const ELEVATOR_RISE_TIME = 1800;                    // Duration in ms for elevator rise
  const HOLE_OPEN_TIME     = 600;                     // Duration in ms for hole opening
  const HOLE_CLOSE_TIME    = 800;                     // Duration in ms for hole closing
  const HOLE_MAX_RADIUS    = 2.2;                     // Maximum radius of the hole
  const HOLE_EMOJI         = '🕳️';                    // Hole visual indicator

  const ELEVATOR_COLOR     = 0x888888;  // Metallic grey fallback platform color
  const HOLE_EDGE_COLOR    = 0x2A1A0A;  // Dark brown dirt edge
  const UNDERGROUND_COLOR  = 0x1A1410;  // Very dark underground

  // ─── State ───────────────────────────────────────────────────────────────────
  let _scene           = null;
  let _playerMesh      = null;
  let _elevatorPlatform = null;  // The elevator platform mesh
  let _holeSegments    = [];     // Ground hole segments for animation
  let _holeRim         = null;   // Visual rim around hole
  let _groundCovers    = [];     // Ground cover pieces that slide open
  let _undergroundShaft = null;  // Dark shaft below ground
  let _dustParticles   = [];     // Dust particles from ground opening
  let _active          = false;

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  // Create the elevator platform mesh
  function _createElevatorPlatform() {
    if (!_scene) return;

    // Create a circular platform with metallic appearance
    const platformGeo = new THREE.CylinderGeometry(HOLE_MAX_RADIUS * 0.9, HOLE_MAX_RADIUS * 0.9, 0.3, 32);
    const platformMat = new THREE.MeshStandardMaterial({
      color: ELEVATOR_COLOR, // robust fallback to avoid magenta/pink missing-material artifacts
      roughness: 0.6,
      metalness: 0.7,
      emissive: 0x1a1a1a,
      emissiveIntensity: 0.2
    });

    _elevatorPlatform = new THREE.Mesh(platformGeo, platformMat);
    _elevatorPlatform.position.set(PLAYER_SPAWN.x, ELEVATOR_START_Y, PLAYER_SPAWN.z);
    _elevatorPlatform.castShadow = true;
    _elevatorPlatform.receiveShadow = true;
    _scene.add(_elevatorPlatform);

    // Add support cables/pillars for visual effect
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const cableX = Math.cos(angle) * (HOLE_MAX_RADIUS * 0.75);
      const cableZ = Math.sin(angle) * (HOLE_MAX_RADIUS * 0.75);

      const cableGeo = new THREE.CylinderGeometry(0.08, 0.08, Math.abs(ELEVATOR_START_Y), 8);
      const cableMat = new THREE.MeshStandardMaterial({
        color: 0x3A3A3A,
        roughness: 0.7,
        metalness: 0.8
      });

      const cable = new THREE.Mesh(cableGeo, cableMat);
      cable.position.set(
        PLAYER_SPAWN.x + cableX,
        ELEVATOR_START_Y / 2,
        PLAYER_SPAWN.z + cableZ
      );
      _scene.add(cable);
      _holeSegments.push(cable); // Store for cleanup
    }
  }

  // Create the underground shaft visual
  function _createUndergroundShaft() {
    if (!_scene) return;

    // Create a dark cylinder showing the underground shaft
    const shaftGeo = new THREE.CylinderGeometry(HOLE_MAX_RADIUS, HOLE_MAX_RADIUS, Math.abs(ELEVATOR_START_Y) * 2, 32);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: UNDERGROUND_COLOR,
      roughness: 0.95,
      metalness: 0.1,
      side: THREE.DoubleSide,
      emissive: 0x0a0505,
      emissiveIntensity: 0.15
    });

    _undergroundShaft = new THREE.Mesh(shaftGeo, shaftMat);
    _undergroundShaft.position.set(PLAYER_SPAWN.x, ELEVATOR_START_Y, PLAYER_SPAWN.z);
    _scene.add(_undergroundShaft);
  }

  // Create hole rim around the opening
  function _createHoleRim() {
    if (!_scene) return;

    const rimGeo = new THREE.TorusGeometry(HOLE_MAX_RADIUS, 0.15, 16, 64);
    const rimMat = new THREE.MeshStandardMaterial({
      color: HOLE_EDGE_COLOR,
      roughness: 0.95,
      metalness: 0.05,
      emissive: 0x0a0505,
      emissiveIntensity: 0.1
    });

    _holeRim = new THREE.Mesh(rimGeo, rimMat);
    _holeRim.rotation.x = -Math.PI / 2;
    _holeRim.position.set(PLAYER_SPAWN.x, 0.05, PLAYER_SPAWN.z);
    _holeRim.scale.set(0.01, 0.01, 0.01); // Start tiny, will grow
    _scene.add(_holeRim);
  }

  // Create ground cover pieces that slide open
  function _createGroundCovers() {
    if (!_scene) return;

    // Create 4 triangular pieces that slide outward from center
    const numSegments = 4;
    for (let i = 0; i < numSegments; i++) {
      const angle = (i / numSegments) * Math.PI * 2;
      const nextAngle = ((i + 1) / numSegments) * Math.PI * 2;

      // Create a triangular segment
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); // Center point
      shape.lineTo(Math.cos(angle) * HOLE_MAX_RADIUS, Math.sin(angle) * HOLE_MAX_RADIUS);
      shape.lineTo(Math.cos(nextAngle) * HOLE_MAX_RADIUS, Math.sin(nextAngle) * HOLE_MAX_RADIUS);
      shape.lineTo(0, 0);

      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshStandardMaterial({
        color: 0x6B5A4A, // Ground color matching the terrain
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
      });

      const coverPiece = new THREE.Mesh(geometry, material);
      coverPiece.rotation.x = -Math.PI / 2; // Lay flat
      coverPiece.position.set(PLAYER_SPAWN.x, 0.08, PLAYER_SPAWN.z);
      coverPiece.userData.angle = angle + Math.PI / numSegments; // Store angle for animation
      coverPiece.userData.initialPos = { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z };
      _scene.add(coverPiece);
      _groundCovers.push(coverPiece);
    }
  }

  // Spawn dust particles as ground opens
  function _spawnDustParticles(count) {
    if (!_scene) return;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * HOLE_MAX_RADIUS;
      const speed = 0.08 + Math.random() * 0.12;

      const dustGeo = new THREE.SphereGeometry(0.03 + Math.random() * 0.05, 4, 4);
      const dustMat = new THREE.MeshBasicMaterial({
        color: 0x8B7D6B,
        transparent: true,
        opacity: 0.6
      });

      const dustMesh = new THREE.Mesh(dustGeo, dustMat);
      dustMesh.position.set(
        PLAYER_SPAWN.x + Math.cos(angle) * radius,
        0.1,
        PLAYER_SPAWN.z + Math.sin(angle) * radius
      );
      _scene.add(dustMesh);

      _dustParticles.push({
        mesh: dustMesh,
        vx: Math.cos(angle) * speed,
        vy: speed * 0.8,
        vz: Math.sin(angle) * speed,
        life: 1.0
      });
    }
  }

  // Remove all transient objects from the scene
  function _cleanup() {
    // Clean up elevator platform
    if (_elevatorPlatform) {
      _scene.remove(_elevatorPlatform);
      _elevatorPlatform.geometry.dispose();
      _elevatorPlatform.material.dispose();
      _elevatorPlatform = null;
    }

    // Clean up hole segments (cables, etc)
    _holeSegments.forEach(seg => {
      _scene.remove(seg);
      if (seg.geometry) seg.geometry.dispose();
      if (seg.material) seg.material.dispose();
    });
    _holeSegments = [];

    // Clean up ground covers
    _groundCovers.forEach(cover => {
      _scene.remove(cover);
      if (cover.geometry) cover.geometry.dispose();
      if (cover.material) cover.material.dispose();
    });
    _groundCovers = [];

    // Clean up hole rim
    if (_holeRim) {
      _scene.remove(_holeRim);
      _holeRim.geometry.dispose();
      _holeRim.material.dispose();
      _holeRim = null;
    }

    // Clean up underground shaft
    if (_undergroundShaft) {
      _scene.remove(_undergroundShaft);
      _undergroundShaft.geometry.dispose();
      _undergroundShaft.material.dispose();
      _undergroundShaft = null;
    }

    // Clean up dust particles
    _dustParticles.forEach(p => {
      _scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    _dustParticles = [];
  }

  // ─── Phases ──────────────────────────────────────────────────────────────────
  // Phase timing:
  // 0 = idle
  // 1 = hole opening (0-600ms)
  // 2 = elevator rising (600-2400ms)
  // 3 = player materializing (2400-3000ms)
  // 4 = hole closing (3000-3800ms)
  // 5 = done (3800ms+)

  let _phase     = 0;   // Current phase
  let _phaseTime = 0;   // Time since phase started
  let _lastTick  = 0;

  function _startPhase(p) {
    _phase     = p;
    _phaseTime = 0;
    _lastTick  = performance.now();
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Call once during init (after the scene has been created).
   * @param {THREE.Scene} threeScene
   */
  function init(threeScene) {
    _scene = threeScene;
  }

  /**
   * Begin the underground elevator spawn sequence.
   * Called from startCountdown() in main.js.
   * @param {THREE.Mesh} playerMesh  – the player's root mesh
   */
  function play(playerMesh) {
    if (!_scene || _active) return;
    _active     = true;
    _playerMesh = playerMesh;

    // Position player on elevator platform (underground to start)
    if (_playerMesh) {
      _playerMesh.position.set(PLAYER_SPAWN.x, ELEVATOR_START_Y + 0.5, PLAYER_SPAWN.z);
      _playerMesh.scale.set(0.01, 0.01, 0.01); // Start tiny
      _playerMesh.visible = true;
    }

    // Create all visual elements
    _createUndergroundShaft();
    _createElevatorPlatform();
    _createHoleRim();
    _createGroundCovers();

    // Phase 1 – Hole Opening (0-600ms)
    _startPhase(1);
    _spawnDustParticles(30);

    // Phase 2 – Elevator Rising (600-2400ms)
    setTimeout(() => {
      _startPhase(2);
    }, HOLE_OPEN_TIME);

    // Phase 3 – Player Materializing (2400-3000ms)
    setTimeout(() => {
      _startPhase(3);
    }, HOLE_OPEN_TIME + ELEVATOR_RISE_TIME);

    // Phase 4 – Hole Closing (3000-3800ms)
    setTimeout(() => {
      _startPhase(4);
    }, HOLE_OPEN_TIME + ELEVATOR_RISE_TIME + 600);

    // Phase 5 – Done (3800ms+)
    setTimeout(() => {
      _startPhase(5);
      _cleanup();
      _active = false;
    }, HOLE_OPEN_TIME + ELEVATOR_RISE_TIME + 600 + HOLE_CLOSE_TIME);
  }

  /**
   * Call every frame from the main animation loop.
   * Handles elevator rise, hole animation, player growth, and dust particles.
   * @param {number} dt – delta time in seconds
   */
  function update(dt) {
    if (!_active && _phase === 0) return;

    const GRAVITY = -0.018;

    // ── Phase 1: Hole Opening Animation ────────────────────────────────────
    if (_phase === 1) {
      // Grow hole rim from tiny to full size
      if (_holeRim) {
        const progress = Math.min(_phaseTime / HOLE_OPEN_TIME, 1.0);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        _holeRim.scale.set(easeProgress, easeProgress, easeProgress);
      }

      // Slide ground covers outward to reveal hole
      const progress = Math.min(_phaseTime / HOLE_OPEN_TIME, 1.0);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
      const slideDistance = HOLE_MAX_RADIUS * 1.2; // How far pieces slide

      _groundCovers.forEach(cover => {
        const angle = cover.userData.angle;
        const offsetX = Math.cos(angle) * slideDistance * easeProgress;
        const offsetZ = Math.sin(angle) * slideDistance * easeProgress;
        cover.position.x = cover.userData.initialPos.x + offsetX;
        cover.position.z = cover.userData.initialPos.z + offsetZ;
        // Also rotate pieces slightly for visual flair
        cover.rotation.z = easeProgress * 0.3;
      });

      // Update phase time
      const now = performance.now();
      _phaseTime += (now - _lastTick);
      _lastTick = now;
    }

    // ── Phase 2: Elevator Rising ───────────────────────────────────────────
    if (_phase === 2) {
      const progress = Math.min(_phaseTime / ELEVATOR_RISE_TIME, 1.0);
      const easeProgress = progress < 0.5
        ? 2 * progress * progress  // Ease in
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;  // Ease out

      const targetY = 0.15; // Final elevation surface position
      const currentY = ELEVATOR_START_Y + (targetY - ELEVATOR_START_Y) * easeProgress;

      // Move elevator platform
      if (_elevatorPlatform) {
        _elevatorPlatform.position.y = currentY;
      }

      // Move player with elevator
      if (_playerMesh) {
        _playerMesh.position.y = currentY + 0.5;
      }

      // Adjust cables to stay connected
      for (let i = 0; i < _holeSegments.length; i++) {
        const cable = _holeSegments[i];
        const cableHeight = Math.abs(currentY);
        cable.scale.y = cableHeight / Math.abs(ELEVATOR_START_Y);
        cable.position.y = currentY / 2;
      }

      // Update phase time
      const now = performance.now();
      _phaseTime += (now - _lastTick);
      _lastTick = now;
    }

    // ── Phase 3: Player Materializing ──────────────────────────────────────
    if (_phase === 3) {
      // Grow player from tiny to full size with slight overshoot
      if (_playerMesh) {
        const current = _playerMesh.scale.x;
        if (current < 1.0) {
          const next = Math.min(current + dt * 2.0, 1.12); // Overshoot to 1.12
          _playerMesh.scale.set(next, next, next);
        } else if (_playerMesh.scale.x > 1.0) {
          // Settle back to 1.0
          const next = Math.max(_playerMesh.scale.x - dt * 0.8, 1.0);
          _playerMesh.scale.set(next, next, next);
        }
      }
    }

    // ── Phase 4: Hole Closing ──────────────────────────────────────────────
    if (_phase === 4) {
      const progress = Math.min(_phaseTime / HOLE_CLOSE_TIME, 1.0);
      const easeProgress = 1 - Math.pow(1 - progress, 2); // Ease out

      // Shrink hole rim
      if (_holeRim) {
        const scale = 1.0 - easeProgress;
        _holeRim.scale.set(scale, scale, scale);
        _holeRim.material.opacity = scale;
        _holeRim.material.transparent = true;
      }

      // Slide ground covers back inward — keep fully opaque so they stay the same
      // dark colour as before the hatch opened (no colour/opacity change after close).
      const slideDistance = HOLE_MAX_RADIUS * 1.2;
      _groundCovers.forEach(cover => {
        const angle = cover.userData.angle;
        const offsetX = Math.cos(angle) * slideDistance * (1.0 - easeProgress);
        const offsetZ = Math.sin(angle) * slideDistance * (1.0 - easeProgress);
        cover.position.x = cover.userData.initialPos.x + offsetX;
        cover.position.z = cover.userData.initialPos.z + offsetZ;
        cover.rotation.z = (1.0 - easeProgress) * 0.3;
        // Maintain full opacity — do NOT alter material opacity so the cover stays dark
        cover.material.transparent = false;
        cover.material.opacity = 1.0;
      });

      // Lower elevator back down
      if (_elevatorPlatform) {
        const startY = 0.15;
        const currentY = startY - (startY - ELEVATOR_START_Y) * easeProgress;
        _elevatorPlatform.position.y = currentY;
      }

      // Fade out underground shaft
      if (_undergroundShaft) {
        _undergroundShaft.material.opacity = 1.0 - easeProgress;
        _undergroundShaft.material.transparent = true;
      }

      // Update phase time
      const now = performance.now();
      _phaseTime += (now - _lastTick);
      _lastTick = now;
    }

    // ── Phase 5: Finalize ───────────────────────────────────────────────────
    if (_phase === 5 && _playerMesh) {
      // Ensure player is at exact final position and scale
      _playerMesh.scale.set(1, 1, 1);
      _playerMesh.position.y = 0.5;
    }

    // ── Dust Particle Physics (all phases) ─────────────────────────────────
    for (let i = _dustParticles.length - 1; i >= 0; i--) {
      const p = _dustParticles[i];

      p.vy += GRAVITY;
      p.mesh.position.x += p.vx;
      p.mesh.position.y += p.vy;
      p.mesh.position.z += p.vz;

      // Fade out over time
      p.life -= dt * 0.8;
      p.mesh.material.opacity = Math.max(0, p.life * 0.6);

      // Remove when life expires or falls below ground
      if (p.life <= 0 || p.mesh.position.y < -0.5) {
        _scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        _dustParticles.splice(i, 1);
      }
    }
  }

  /**
   * Reset the sequence state (call on game reset for new run).
   */
  function reset() {
    if (_scene) _cleanup();
    _phase      = 0;
    _phaseTime  = 0;
    _active     = false;
    _playerMesh = null;
  }

  // ─── Expose ──────────────────────────────────────────────────────────────────
  window.SpawnSequence = { init, play, update, reset };

})();
