// --- DYNAMIC TRAUMA & WEAPON REACTION SYSTEM ---
// The masterpiece gore & trauma update for Engine 2.5
// Implements weapon-specific trauma reactions, progressive wound accumulation, and realistic physics-based gore
// Uses THREE.InstancedMesh and object pooling for performance
// Exposes window.TraumaSystem for use by enemy-class.js

(function() {
  'use strict';

  // ─── Configuration ──────────────────────────────────────────────────────────
  const MAX_WOUND_DECALS = 500;          // Maximum wound decals on all enemies combined
  // Pool sizes are set at init time based on graphics quality (see _resolvePoolSizes)
  let MAX_FLESH_CHUNKS   = 1000;         // Maximum flying flesh chunks
  let MAX_GUT_INSTANCES  = 500;          // Intestines instances
  let MAX_BRAIN_INSTANCES= 300;          // Brain matter instances
  let MAX_BONE_INSTANCES = 400;          // Bone shard instances
  const MAX_STUCK_ARROWS = 100;          // Arrows/spears stuck in enemies
  const WOUND_AGGRAVATION_DIST = 0.3;    // Distance to consider hits on same wound
  const WOUND_CHUNK_THRESHOLD = 3;       // Hits before chunk tears off
  const CORPSE_LIFETIME = 6000;          // Corpse stays for 6 seconds (ms)
  const HEARTBEAT_INTERVAL = 400;        // Blood pump interval (ms)
  const CORPSE_FADE_DURATION_S = 1.0;    // Seconds for blood-pool fade-out after pumping ends
  const GRAVITY = -0.025;                // Physics gravity for chunks
  // Named constants for arterial pump helper
  const ARTERIAL_PUMP_WEAPON_TYPE = 'pistol';  // Weapon profile to use for fake arterial hit via BloodV2
  const ARTERIAL_PUMP_Y_OFFSET    = 0.1;       // Vertical offset above wound origin for pump spawn point
  const ARTERIAL_PUMP_ID_PREFIX   = 'ts_pump_'; // Namespace prefix — prevents collision with real enemy IDs

  // ─── Internal State ─────────────────────────────────────────────────────────
  let _scene = null;
  let _initialized = false;
  let _arterialPumpIdCounter = 0;  // monotonic counter for arterial pump fake-enemy IDs

  // Wound decal system (planes attached to enemy meshes)
  const _woundDecals = []; // { mesh, parentEnemy, life, position }

  // Instanced gore meshes
  let _fleshChunkIM = null;    // Generic flesh chunks
  let _gutIM = null;           // Intestines (long pinkish)
  let _brainIM = null;         // Brain matter (grey/pink)
  let _boneIM = null;          // Bone shards (white)
  let _stuckArrowIM = null;    // Arrows/spears stuck in enemies

  // Physics state arrays for instanced meshes
  let _fleshPX = null, _fleshPY = null, _fleshPZ = null; // positions
  let _fleshVX = null, _fleshVY = null, _fleshVZ = null; // velocities
  let _fleshRX = null, _fleshRY = null, _fleshRZ = null; // rotations
  let _fleshRVX = null, _fleshRVY = null, _fleshRVZ = null; // rotation velocities
  let _fleshLife = null;       // lifetime remaining
  let _fleshHead = 0;

  // Same for guts, brains, bones
  let _gutPX = null, _gutPY = null, _gutPZ = null;
  let _gutVX = null, _gutVY = null, _gutVZ = null;
  let _gutRX = null, _gutRY = null, _gutRZ = null;
  let _gutRVX = null, _gutRVY = null, _gutRVZ = null;
  let _gutLife = null;
  let _gutHead = 0;

  let _brainPX = null, _brainPY = null, _brainPZ = null;
  let _brainVX = null, _brainVY = null, _brainVZ = null;
  let _brainRX = null, _brainRY = null, _brainRZ = null;
  let _brainRVX = null, _brainRVY = null, _brainRVZ = null;
  let _brainLife = null;
  let _brainHead = 0;

  let _bonePX = null, _bonePY = null, _bonePZ = null;
  let _boneVX = null, _boneVY = null, _boneVZ = null;
  let _boneRX = null, _boneRY = null, _boneRZ = null;
  let _boneRVX = null, _boneRVY = null, _boneRVZ = null;
  let _boneLife = null;
  let _boneHead = 0;

  // Stuck arrows tracking { instanceIndex, parentEnemy, stickPosition (local), life }
  const _stuckArrows = [];
  let _arrowPX = null, _arrowPY = null, _arrowPZ = null;
  let _arrowRX = null, _arrowRY = null, _arrowRZ = null;
  let _arrowLife = null;
  let _arrowHead = 0;

  // Corpse tracking for heartbeat blood pump
  const _activeCorpses = []; // { position, startTime, weapon, holes: [{pos, dir}] }

  // Reusable THREE objects
  let _tmpMatrix = null;
  let _tmpPos = null;
  let _tmpQuat = null;
  let _tmpScale = null;

  // ─── Init ────────────────────────────────────────────────────────────────────
  function _resolvePoolSizes() {
    var quality = '';
    try { quality = (localStorage.getItem('sandboxGraphicsQuality') || '').toLowerCase(); } catch(e) {}
    if (quality === 'ultralow') {
      MAX_FLESH_CHUNKS    = 100;
      MAX_GUT_INSTANCES   = 50;
      MAX_BRAIN_INSTANCES = 30;
      MAX_BONE_INSTANCES  = 40;
    } else if (quality === 'low') {
      MAX_FLESH_CHUNKS    = 250;
      MAX_GUT_INSTANCES   = 125;
      MAX_BRAIN_INSTANCES = 75;
      MAX_BONE_INSTANCES  = 100;
    } else if (quality === 'medium') {
      MAX_FLESH_CHUNKS    = 500;
      MAX_GUT_INSTANCES   = 250;
      MAX_BRAIN_INSTANCES = 150;
      MAX_BONE_INSTANCES  = 200;
    } else {
      // high / ultra / default
      MAX_FLESH_CHUNKS    = 1000;
      MAX_GUT_INSTANCES   = 500;
      MAX_BRAIN_INSTANCES = 300;
      MAX_BONE_INSTANCES  = 400;
    }
  }

  function init(threeScene) {
    if (typeof THREE === 'undefined') {
      console.warn('[TraumaSystem] THREE.js not yet available – init deferred');
      return;
    }
    if (_initialized) return;
    _scene = threeScene;
    _initialized = true;

    // Resolve pool sizes based on graphics quality setting
    _resolvePoolSizes();

    // Initialize reusable THREE objects
    _tmpMatrix = new THREE.Matrix4();
    _tmpPos = new THREE.Vector3();
    _tmpQuat = new THREE.Quaternion();
    _tmpScale = new THREE.Vector3();

    // Initialize instanced meshes
    _initFleshChunks();
    _initGuts();
    _initBrains();
    _initBones();
    _initStuckArrows();

    console.log('[TraumaSystem] Initialized with instanced gore meshes');
  }

  function _initFleshChunks() {
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,   // white base so per-instance color drives actual tint
      vertexColors: true, // required for InstancedMesh instanceColor tinting
      roughness: 0.9,
      metalness: 0.0
    });
    _fleshChunkIM = new THREE.InstancedMesh(geo, mat, MAX_FLESH_CHUNKS);
    _fleshChunkIM.frustumCulled = false;
    _fleshChunkIM.castShadow = false;
    _fleshChunkIM.receiveShadow = false;
    _fleshChunkIM.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 9999);
    _scene.add(_fleshChunkIM);

    // Allocate physics arrays
    _fleshPX = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshPY = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshPZ = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshVX = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshVY = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshVZ = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshRX = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshRY = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshRZ = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshRVX = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshRVY = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshRVZ = new Float32Array(MAX_FLESH_CHUNKS);
    _fleshLife = new Float32Array(MAX_FLESH_CHUNKS);

    // Allocate instanceColor buffer and initialize every slot to dark-red default
    _fleshChunkIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLESH_CHUNKS * 3), 3);
    _fleshChunkIM.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // Hide all instances initially and set default color (dark red: 0x8B0000)
    for (let i = 0; i < MAX_FLESH_CHUNKS; i++) {
      _fleshPY[i] = -9999;
      _fleshLife[i] = 0;
      _tmpMatrix.makeTranslation(0, -9999, 0);
      _fleshChunkIM.setMatrixAt(i, _tmpMatrix);
      _fleshChunkIM.instanceColor.setXYZ(i, 0x8B / 255, 0, 0);
    }
    _fleshChunkIM.instanceMatrix.needsUpdate = true;
    _fleshChunkIM.instanceColor.needsUpdate = true;
  }

  function _initGuts() {
    // Long pinkish cylinders for intestines
    const geo = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xCC6677,
      roughness: 0.8,
      metalness: 0.0
    });
    _gutIM = new THREE.InstancedMesh(geo, mat, MAX_GUT_INSTANCES);
    _gutIM.frustumCulled = false;
    _gutIM.castShadow = false;
    _gutIM.receiveShadow = false;
    _gutIM.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 9999);
    _scene.add(_gutIM);

    _gutPX = new Float32Array(MAX_GUT_INSTANCES);
    _gutPY = new Float32Array(MAX_GUT_INSTANCES);
    _gutPZ = new Float32Array(MAX_GUT_INSTANCES);
    _gutVX = new Float32Array(MAX_GUT_INSTANCES);
    _gutVY = new Float32Array(MAX_GUT_INSTANCES);
    _gutVZ = new Float32Array(MAX_GUT_INSTANCES);
    _gutRX = new Float32Array(MAX_GUT_INSTANCES);
    _gutRY = new Float32Array(MAX_GUT_INSTANCES);
    _gutRZ = new Float32Array(MAX_GUT_INSTANCES);
    _gutRVX = new Float32Array(MAX_GUT_INSTANCES);
    _gutRVY = new Float32Array(MAX_GUT_INSTANCES);
    _gutRVZ = new Float32Array(MAX_GUT_INSTANCES);
    _gutLife = new Float32Array(MAX_GUT_INSTANCES);

    for (let i = 0; i < MAX_GUT_INSTANCES; i++) {
      _gutPY[i] = -9999;
      _gutLife[i] = 0;
      _tmpMatrix.makeTranslation(0, -9999, 0);
      _gutIM.setMatrixAt(i, _tmpMatrix);
    }
    _gutIM.instanceMatrix.needsUpdate = true;
  }

  function _initBrains() {
    // Grey/pink bouncy spheres
    const geo = new THREE.SphereGeometry(0.06, 8, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xBB9999,
      roughness: 0.7,
      metalness: 0.1
    });
    _brainIM = new THREE.InstancedMesh(geo, mat, MAX_BRAIN_INSTANCES);
    _brainIM.frustumCulled = false;
    _brainIM.castShadow = false;
    _brainIM.receiveShadow = false;
    _brainIM.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 9999);
    _scene.add(_brainIM);

    _brainPX = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainPY = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainPZ = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainVX = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainVY = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainVZ = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainRX = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainRY = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainRZ = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainRVX = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainRVY = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainRVZ = new Float32Array(MAX_BRAIN_INSTANCES);
    _brainLife = new Float32Array(MAX_BRAIN_INSTANCES);

    for (let i = 0; i < MAX_BRAIN_INSTANCES; i++) {
      _brainPY[i] = -9999;
      _brainLife[i] = 0;
      _tmpMatrix.makeTranslation(0, -9999, 0);
      _brainIM.setMatrixAt(i, _tmpMatrix);
    }
    _brainIM.instanceMatrix.needsUpdate = true;
  }

  function _initBones() {
    // White angular shards
    const geo = new THREE.BoxGeometry(0.04, 0.12, 0.03);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xEEEEDD,
      roughness: 0.6,
      metalness: 0.2
    });
    _boneIM = new THREE.InstancedMesh(geo, mat, MAX_BONE_INSTANCES);
    _boneIM.frustumCulled = false;
    _boneIM.castShadow = false;
    _boneIM.receiveShadow = false;
    _boneIM.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 9999);
    _scene.add(_boneIM);

    _bonePX = new Float32Array(MAX_BONE_INSTANCES);
    _bonePY = new Float32Array(MAX_BONE_INSTANCES);
    _bonePZ = new Float32Array(MAX_BONE_INSTANCES);
    _boneVX = new Float32Array(MAX_BONE_INSTANCES);
    _boneVY = new Float32Array(MAX_BONE_INSTANCES);
    _boneVZ = new Float32Array(MAX_BONE_INSTANCES);
    _boneRX = new Float32Array(MAX_BONE_INSTANCES);
    _boneRY = new Float32Array(MAX_BONE_INSTANCES);
    _boneRZ = new Float32Array(MAX_BONE_INSTANCES);
    _boneRVX = new Float32Array(MAX_BONE_INSTANCES);
    _boneRVY = new Float32Array(MAX_BONE_INSTANCES);
    _boneRVZ = new Float32Array(MAX_BONE_INSTANCES);
    _boneLife = new Float32Array(MAX_BONE_INSTANCES);

    for (let i = 0; i < MAX_BONE_INSTANCES; i++) {
      _bonePY[i] = -9999;
      _boneLife[i] = 0;
      _tmpMatrix.makeTranslation(0, -9999, 0);
      _boneIM.setMatrixAt(i, _tmpMatrix);
    }
    _boneIM.instanceMatrix.needsUpdate = true;
  }

  function _initStuckArrows() {
    // Arrows/spears that stick into enemies
    const geo = new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.8,
      metalness: 0.0
    });
    _stuckArrowIM = new THREE.InstancedMesh(geo, mat, MAX_STUCK_ARROWS);
    _stuckArrowIM.frustumCulled = false;
    _stuckArrowIM.castShadow = false;
    _stuckArrowIM.receiveShadow = false;
    _stuckArrowIM.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 9999);
    _scene.add(_stuckArrowIM);

    _arrowPX = new Float32Array(MAX_STUCK_ARROWS);
    _arrowPY = new Float32Array(MAX_STUCK_ARROWS);
    _arrowPZ = new Float32Array(MAX_STUCK_ARROWS);
    _arrowRX = new Float32Array(MAX_STUCK_ARROWS);
    _arrowRY = new Float32Array(MAX_STUCK_ARROWS);
    _arrowRZ = new Float32Array(MAX_STUCK_ARROWS);
    _arrowLife = new Float32Array(MAX_STUCK_ARROWS);

    for (let i = 0; i < MAX_STUCK_ARROWS; i++) {
      _arrowPY[i] = -9999;
      _arrowLife[i] = 0;
      _tmpMatrix.makeTranslation(0, -9999, 0);
      _stuckArrowIM.setMatrixAt(i, _tmpMatrix);
    }
    _stuckArrowIM.instanceMatrix.needsUpdate = true;
  }

  // ─── Wound Decal System ──────────────────────────────────────────────────────
  // Creates a localized wound decal attached to the enemy mesh
  function addWoundDecal(enemy, hitPoint, weaponType) {
    // Resolve the attachment mesh — support enemies that use parts.root (e.g. skinwalkers)
    const attachMesh = (enemy && enemy.mesh) ? enemy.mesh
                     : (enemy && enemy.parts && enemy.parts.root) ? enemy.parts.root
                     : null;
    if (!enemy || !attachMesh || !hitPoint) return null;
    if (_woundDecals.length >= MAX_WOUND_DECALS) {
      // Remove oldest decal
      const oldest = _woundDecals.shift();
      if (oldest && oldest.mesh && oldest.mesh.parent) {
        oldest.mesh.parent.remove(oldest.mesh);
        oldest.mesh.geometry.dispose();
        oldest.mesh.material.dispose();
      }
    }

    // Create a small dark red/black plane as wound decal
    let size = 0.08; // Default size
    if (weaponType === 'shotgun' || weaponType === 'doubleBarrel') {
      size = 0.15; // Large shotgun pellet wound
    } else if (weaponType === 'bullethole') {
      size = 0.06; // Small circular bullet hole
    } else if (weaponType === 'exitwound') {
      size = 0.12; // Larger exit wound
    } else if (weaponType === 'slash') {
      size = 0.20; // Long slash wound
    }

    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x2A0000,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const decal = new THREE.Mesh(geo, mat);

    // Position decal at hit point relative to attachment mesh
    const localHit = attachMesh.worldToLocal(hitPoint.clone());
    decal.position.copy(localHit);
    decal.position.y += 0.01; // Slightly above surface to avoid z-fighting

    // Orient decal to face outward from enemy center
    decal.lookAt(attachMesh.position);

    attachMesh.add(decal);

    const woundData = {
      mesh: decal,
      parentEnemy: enemy,
      position: hitPoint.clone(),
      life: CORPSE_LIFETIME,
      hitCount: 1,
      weaponType: weaponType
    };

    _woundDecals.push(woundData);

    // Track wound on enemy for aggravation system
    if (!enemy._traumaWounds) enemy._traumaWounds = [];
    enemy._traumaWounds.push(woundData);

    return woundData;
  }

  // Check if hit is near existing wound (for aggravation)
  function findNearbyWound(enemy, hitPoint) {
    if (!enemy._traumaWounds || enemy._traumaWounds.length === 0) return null;

    for (const wound of enemy._traumaWounds) {
      if (!wound.position) continue;
      const dist = hitPoint.distanceTo(wound.position);
      if (dist < WOUND_AGGRAVATION_DIST) {
        return wound;
      }
    }
    return null;
  }

  // Aggravate wound: scale up and potentially tear off chunk
  function aggravateWound(wound, hitPoint, weaponLevel) {
    if (!wound || !wound.mesh) return false;

    wound.hitCount++;
    wound.position.copy(hitPoint); // Update position to latest hit

    // Scale up wound decal
    const scale = 1.0 + (wound.hitCount * 0.4);
    wound.mesh.scale.setScalar(scale);

    // At threshold, tear off flesh chunk
    if (wound.hitCount >= WOUND_CHUNK_THRESHOLD) {
      tearOffFleshChunk(hitPoint, wound.weaponType, weaponLevel);
      // Remove wound decal (torn off)
      if (wound.mesh.parent) {
        wound.mesh.parent.remove(wound.mesh);
        wound.mesh.geometry.dispose();
        wound.mesh.material.dispose();
      }
      // Remove from tracking arrays
      const idx = _woundDecals.indexOf(wound);
      if (idx >= 0) _woundDecals.splice(idx, 1);
      if (wound.parentEnemy && wound.parentEnemy._traumaWounds) {
        const eidx = wound.parentEnemy._traumaWounds.indexOf(wound);
        if (eidx >= 0) wound.parentEnemy._traumaWounds.splice(eidx, 1);
      }
      return true; // Chunk torn off
    }

    return false; // Just aggravated, not torn
  }

  // Tear off a flesh chunk when wound is hit 3+ times
  function tearOffFleshChunk(position, weaponType, weaponLevel) {
    const idx = _fleshHead % MAX_FLESH_CHUNKS;
    _fleshHead++;

    // Position
    _fleshPX[idx] = position.x;
    _fleshPY[idx] = position.y + 0.2;
    _fleshPZ[idx] = position.z;

    // Velocity: fly off in random direction
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.15 + Math.random() * 0.25;
    _fleshVX[idx] = Math.cos(angle) * speed;
    _fleshVY[idx] = 0.2 + Math.random() * 0.3;
    _fleshVZ[idx] = Math.sin(angle) * speed;

    // Rotation
    _fleshRX[idx] = Math.random() * Math.PI * 2;
    _fleshRY[idx] = Math.random() * Math.PI * 2;
    _fleshRZ[idx] = Math.random() * Math.PI * 2;
    _fleshRVX[idx] = (Math.random() - 0.5) * 0.3;
    _fleshRVY[idx] = (Math.random() - 0.5) * 0.3;
    _fleshRVZ[idx] = (Math.random() - 0.5) * 0.3;

    // Life: stay on ground for a while
    _fleshLife[idx] = 300; // 300 frames = ~5 seconds at 60fps

    // Spawn blood spray from torn chunk
    if (window.BloodSystem && window.BloodSystem.emitBurst) {
      window.BloodSystem.emitBurst(position, 40, { spreadXZ: 1.0, spreadY: 0.3 });
    }
  }

  // ─── Corpse Heartbeat Blood Pump System + Dynamic Blood Pools ────────────────
  function registerCorpse(position, weapon, bulletHoles = []) {
    if (!position) return;

    // Create dynamic blood pool mesh
    const poolGeo = new THREE.CircleGeometry(0.3, 12); // Starts small
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0xAA0000, // Bright red initially
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const bloodPool = new THREE.Mesh(poolGeo, poolMat);
    bloodPool.rotation.x = -Math.PI / 2; // Lay flat on ground
    bloodPool.position.set(position.x, 0.01, position.z);
    _scene.add(bloodPool);

    const corpse = {
      position: position.clone(),
      startTime: Date.now(),
      weapon: weapon,
      holes: bulletHoles.map(h => ({ pos: h.pos.clone(), dir: h.dir })),
      pumpCount: 0,
      pumpTimer: 0,          // dt accumulator — triggers pump when >= HEARTBEAT_INTERVAL/1000
      fadeTimer: -1,         // -1 = not fading; >=0 counts down (in seconds) for blood-pool fade
      bloodPool: bloodPool,  // Dynamic blood pool mesh
      poolSize: 0.3,         // Current pool radius
      poolMaxSize: 1.8,      // Max pool radius (grows with each pump)
      poolTargetColor: 0x2A0000  // Dark crimson/black target color
    };

    _activeCorpses.push(corpse);
  }

  function _pumpCorpse(corpse) {
    const maxPumps = 10;
    const pumpIndex = corpse.pumpCount;
    const pressure = 1.0 - (pumpIndex / maxPumps);
    const particleCount = Math.floor(50 * pressure) + 10;

    if (window.BloodSystem && window.BloodSystem.emitPulse) {
      const phase = Math.sin(pumpIndex * Math.PI / 4) * 0.5 + 0.5;
      const intensity = pressure * phase;

      if (corpse.holes.length > 0) {
        corpse.holes.forEach(hole => {
          window.BloodSystem.emitBurst(hole.pos, Math.floor(particleCount / corpse.holes.length), {
            spreadXZ: 0.4 * intensity,
            spreadY: 0.6 * intensity,
            minSize: 0.02,
            maxSize: 0.06
          });
        });
      } else {
        window.BloodSystem.emitPulse(corpse.position, {
          pulses: 1,
          perPulse: particleCount,
          interval: 0,
          spreadXZ: 0.5 * intensity,
          spreadY: 0.4 * intensity
        });
      }
    }

    // DYNAMIC BLOOD POOL: Grow pool with each pump and darken over time
    if (corpse.bloodPool && corpse.bloodPool.material) {
      const growthPerPump = 0.15;
      corpse.poolSize = Math.min(corpse.poolMaxSize, corpse.poolSize + growthPerPump);
      corpse.bloodPool.geometry.dispose();
      corpse.bloodPool.geometry = new THREE.CircleGeometry(corpse.poolSize, 12);

      const darkProgress = pumpIndex / maxPumps;
      const currentColor = new THREE.Color(0xAA0000);
      const targetColor = new THREE.Color(corpse.poolTargetColor);
      currentColor.lerp(targetColor, darkProgress);
      corpse.bloodPool.material.color.copy(currentColor);
      corpse.bloodPool.material.opacity = 0.6 + darkProgress * 0.25;
    }

    corpse.pumpCount++;
  }

  // ─── Gore Chunk Spawning Functions ───────────────────────────────────────────
  function spawnGuts(position, count = 5, velocity = null) {
    for (let i = 0; i < count; i++) {
      const idx = _gutHead % MAX_GUT_INSTANCES;
      _gutHead++;

      _gutPX[idx] = position.x + (Math.random() - 0.5) * 0.3;
      _gutPY[idx] = position.y + 0.3;
      _gutPZ[idx] = position.z + (Math.random() - 0.5) * 0.3;

      if (velocity) {
        _gutVX[idx] = velocity.x + (Math.random() - 0.5) * 0.2;
        _gutVY[idx] = velocity.y + 0.2 + Math.random() * 0.3;
        _gutVZ[idx] = velocity.z + (Math.random() - 0.5) * 0.2;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.1 + Math.random() * 0.2;
        _gutVX[idx] = Math.cos(angle) * speed;
        _gutVY[idx] = 0.15 + Math.random() * 0.25;
        _gutVZ[idx] = Math.sin(angle) * speed;
      }

      _gutRX[idx] = Math.random() * Math.PI * 2;
      _gutRY[idx] = Math.random() * Math.PI * 2;
      _gutRZ[idx] = Math.random() * Math.PI * 2;
      _gutRVX[idx] = (Math.random() - 0.5) * 0.2;
      _gutRVY[idx] = (Math.random() - 0.5) * 0.2;
      _gutRVZ[idx] = (Math.random() - 0.5) * 0.2;

      _gutLife[idx] = 400; // ~6.7 seconds
    }
  }

  function spawnBrains(position, count = 3, velocity = null) {
    for (let i = 0; i < count; i++) {
      const idx = _brainHead % MAX_BRAIN_INSTANCES;
      _brainHead++;

      _brainPX[idx] = position.x + (Math.random() - 0.5) * 0.2;
      _brainPY[idx] = position.y + 0.5; // Higher up (from head)
      _brainPZ[idx] = position.z + (Math.random() - 0.5) * 0.2;

      if (velocity) {
        _brainVX[idx] = velocity.x + (Math.random() - 0.5) * 0.3;
        _brainVY[idx] = velocity.y + 0.3 + Math.random() * 0.4;
        _brainVZ[idx] = velocity.z + (Math.random() - 0.5) * 0.3;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.25;
        _brainVX[idx] = Math.cos(angle) * speed;
        _brainVY[idx] = 0.3 + Math.random() * 0.4;
        _brainVZ[idx] = Math.sin(angle) * speed;
      }

      _brainRX[idx] = Math.random() * Math.PI * 2;
      _brainRY[idx] = Math.random() * Math.PI * 2;
      _brainRZ[idx] = Math.random() * Math.PI * 2;
      _brainRVX[idx] = (Math.random() - 0.5) * 0.3;
      _brainRVY[idx] = (Math.random() - 0.5) * 0.3;
      _brainRVZ[idx] = (Math.random() - 0.5) * 0.3;

      _brainLife[idx] = 400;
    }
  }

  function spawnBones(position, count = 5, velocity = null) {
    for (let i = 0; i < count; i++) {
      const idx = _boneHead % MAX_BONE_INSTANCES;
      _boneHead++;

      _bonePX[idx] = position.x + (Math.random() - 0.5) * 0.3;
      _bonePY[idx] = position.y + 0.25;
      _bonePZ[idx] = position.z + (Math.random() - 0.5) * 0.3;

      if (velocity) {
        _boneVX[idx] = velocity.x + (Math.random() - 0.5) * 0.25;
        _boneVY[idx] = velocity.y + 0.2 + Math.random() * 0.3;
        _boneVZ[idx] = velocity.z + (Math.random() - 0.5) * 0.25;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.22;
        _boneVX[idx] = Math.cos(angle) * speed;
        _boneVY[idx] = 0.2 + Math.random() * 0.3;
        _boneVZ[idx] = Math.sin(angle) * speed;
      }

      _boneRX[idx] = Math.random() * Math.PI * 2;
      _boneRY[idx] = Math.random() * Math.PI * 2;
      _boneRZ[idx] = Math.random() * Math.PI * 2;
      _boneRVX[idx] = (Math.random() - 0.5) * 0.4;
      _boneRVY[idx] = (Math.random() - 0.5) * 0.4;
      _boneRVZ[idx] = (Math.random() - 0.5) * 0.4;

      _boneLife[idx] = 400;
    }
  }

  function spawnSmear(startPos, endPos, color, count) {
    if (!startPos || !endPos) return;
    var smearChunkCount = count || 10;
    var dx = endPos.x - startPos.x;
    var dz = endPos.z - startPos.z;
    for (var i = 0; i < smearChunkCount; i++) {
      var t = i / Math.max(smearChunkCount - 1, 1);
      var idx = _fleshHead % MAX_FLESH_CHUNKS;
      _fleshHead++;
      _fleshPX[idx] = startPos.x + dx * t + (Math.random() - 0.5) * 0.08;
      _fleshPY[idx] = 0.07;
      _fleshPZ[idx] = startPos.z + dz * t + (Math.random() - 0.5) * 0.08;
      _fleshVX[idx] = 0;
      _fleshVY[idx] = 0;
      _fleshVZ[idx] = 0;
      _fleshRX[idx] = 0;
      _fleshRY[idx] = 0;
      _fleshRZ[idx] = Math.atan2(dz, dx);
      _fleshRVX[idx] = 0;
      _fleshRVY[idx] = 0;
      _fleshRVZ[idx] = 0;
      _fleshLife[idx] = 360;
      if (_fleshChunkIM.instanceColor) {
        _fleshChunkIM.instanceColor.setXYZ(idx,
          ((color >> 16) & 0xff) / 255,
          ((color >>  8) & 0xff) / 255,
          ( color        & 0xff) / 255);
      }
    }
    if (_fleshChunkIM.instanceColor) _fleshChunkIM.instanceColor.needsUpdate = true;
  }

  function startArterialPump(position, dirX, dirY, dirZ, color, duration) {
    if (!position) return;
    var bloodColor = color || 0xcc1100;
    var streamLife = (typeof duration === 'number' && duration > 0) ? duration : 6.0;
    if (window.BloodV2 && window.BloodV2.hit) {
      var fakeEnemy = {
        alive: true,
        enemyType: 'default',
        id: ARTERIAL_PUMP_ID_PREFIX + (++_arterialPumpIdCounter),
        hp: 1, maxHp: 1,
        mesh: { position: { x: position.x, y: position.y, z: position.z }, scale: { y: 1 } }
      };
      // Pass caller's color via a temporary ENEMY_BLOOD override so the stream uses it
      var _prevColor = null;
      if (window.BloodV2.ENEMY_BLOOD) {
        _prevColor = window.BloodV2.ENEMY_BLOOD['default'];
        window.BloodV2.ENEMY_BLOOD['default'] = { base: bloodColor, dark: bloodColor, organ: bloodColor, mist: bloodColor };
      }
      window.BloodV2.hit(fakeEnemy, ARTERIAL_PUMP_WEAPON_TYPE,
        { x: position.x, y: position.y + ARTERIAL_PUMP_Y_OFFSET, z: position.z },
        { x: dirX, y: dirY, z: dirZ });
      if (_prevColor !== null) window.BloodV2.ENEMY_BLOOD['default'] = _prevColor;
    }
    // Spawn a few guts at the wound site tinted with the caller's color
    spawnGuts(position, 3, { x: dirX * 0.15, y: Math.abs(dirY) * 0.2 + 0.15, z: dirZ * 0.15 });
  }

  function shotgunBlast(position, blastDir, enemyColor) {
    if (!position) return;
    var col = enemyColor || 0xcc1100;
    var gutCount = 8 + Math.floor(Math.random() * 6);
    var bx = blastDir ? blastDir.x : 0;
    var bz = blastDir ? blastDir.z : 0;
    var vel = { x: bx * 0.2, y: 0.15, z: bz * 0.2 };
    spawnGuts(position, gutCount, vel);
    spawnBones(position, 4, vel);
    spawnBrains(position, 2, { x: bx * 0.1, y: 0.2, z: bz * 0.1 });
    if (blastDir) {
      var endPos = {
        x: position.x + bx * 1.5,
        y: position.y,
        z: position.z + bz * 1.5
      };
      spawnSmear(position, endPos, col, 12);
    }
    if (window.BloodV2 && window.BloodV2.rawBurst) {
      window.BloodV2.rawBurst(position.x, position.y, position.z, 40, {
        spdMin: 3.0, spdMax: 12.0, rMin: 0.012, rMax: 0.030,
        life: 3.0, visc: 0.55, color: col
      });
    }
  }

  function swordCleave(position, sliceAxisX, sliceAxisZ, enemyColor) {
    if (!position) return;
    var col = enemyColor || 0xcc1100;
    // Compute perpendicular to the slice axis, handling the (0,0) / undefined edge case
    var axisX = (typeof sliceAxisX === 'number') ? sliceAxisX : 0;
    var axisZ = (typeof sliceAxisZ === 'number') ? sliceAxisZ : 0;
    if (axisX === 0 && axisZ === 0) { axisX = 1; axisZ = 0; }
    var perpX = -axisZ;
    var perpZ = axisX;
    var perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ);
    if (perpLen > 0) { perpX /= perpLen; perpZ /= perpLen; } else { perpX = 0; perpZ = 1; }
    for (var half = 0; half < 2; half++) {
      var sign = (half === 0) ? 1 : -1;
      for (var j = 0; j < 3; j++) {
        var idx = _fleshHead % MAX_FLESH_CHUNKS;
        _fleshHead++;
        _fleshPX[idx] = position.x + perpX * sign * (0.1 + Math.random() * 0.1);
        _fleshPY[idx] = position.y + 0.2 + Math.random() * 0.3;
        _fleshPZ[idx] = position.z + perpZ * sign * (0.1 + Math.random() * 0.1);
        _fleshVX[idx] = perpX * sign * (0.12 + Math.random() * 0.18);
        _fleshVY[idx] = 0.05 + Math.random() * 0.12;
        _fleshVZ[idx] = perpZ * sign * (0.12 + Math.random() * 0.18);
        _fleshRX[idx] = Math.random() * Math.PI * 2;
        _fleshRY[idx] = Math.random() * Math.PI * 2;
        _fleshRZ[idx] = Math.random() * Math.PI * 2;
        _fleshRVX[idx] = (Math.random() - 0.5) * 0.35;
        _fleshRVY[idx] = (Math.random() - 0.5) * 0.35;
        _fleshRVZ[idx] = (Math.random() - 0.5) * 0.35;
        _fleshLife[idx] = 300;
      }
    }
    if (window.BloodV2 && window.BloodV2.smearBlood) {
      var halfLen = 0.6;
      window.BloodV2.smearBlood(
        position.x - perpX * halfLen, position.y + 0.1, position.z - perpZ * halfLen,
        position.x + perpX * halfLen, position.y + 0.1, position.z + perpZ * halfLen,
        16, col);
    } else if (window.BloodV2 && window.BloodV2.rawBurst) {
      window.BloodV2.rawBurst(position.x, position.y + 0.1, position.z, 30, {
        spdMin: 2.0, spdMax: 8.0, rMin: 0.008, rMax: 0.022,
        life: 2.5, visc: 0.60, color: col
      });
    }
  }

  function explosiveGib(position, enemyColor) {
    if (!position) return;
    var col = enemyColor || 0xcc1100;
    spawnGuts(position, 12, null);
    spawnBones(position, 8, null);
    spawnBrains(position, 6, null);
    for (var i = 0; i < 20; i++) {
      var idx = _fleshHead % MAX_FLESH_CHUNKS;
      _fleshHead++;
      var angle = Math.random() * Math.PI * 2;
      var elev = 0.3 + Math.random() * 0.6;
      var speed = 0.25 + Math.random() * 0.35;
      _fleshPX[idx] = position.x;
      _fleshPY[idx] = position.y + 0.2;
      _fleshPZ[idx] = position.z;
      _fleshVX[idx] = Math.cos(angle) * Math.cos(elev) * speed;
      _fleshVY[idx] = Math.abs(Math.sin(elev)) * speed + 0.1;
      _fleshVZ[idx] = Math.sin(angle) * Math.cos(elev) * speed;
      _fleshRX[idx] = Math.random() * Math.PI * 2;
      _fleshRY[idx] = Math.random() * Math.PI * 2;
      _fleshRZ[idx] = Math.random() * Math.PI * 2;
      _fleshRVX[idx] = (Math.random() - 0.5) * 0.5;
      _fleshRVY[idx] = (Math.random() - 0.5) * 0.5;
      _fleshRVZ[idx] = (Math.random() - 0.5) * 0.5;
      _fleshLife[idx] = 360 + Math.floor(Math.random() * 120);
    }
    if (window.BloodV2 && window.BloodV2.rawBurst) {
      window.BloodV2.rawBurst(position.x, position.y, position.z, 80, {
        spdMin: 4.0, spdMax: 22.0, rMin: 0.014, rMax: 0.042,
        life: 3.5, visc: 0.52, color: col
      });
    }
  }

  // ─── Stuck Arrow/Spear System ────────────────────────────────────────────────
  function stickArrowInEnemy(enemy, hitPoint, direction, weaponType = 'bow') {
    if (!enemy || !enemy.mesh || !hitPoint) return;
    if (_stuckArrows.length >= MAX_STUCK_ARROWS) {
      // Remove oldest arrow
      const oldest = _stuckArrows.shift();
      if (oldest !== undefined) {
        _arrowLife[oldest.instanceIndex] = 0;
      }
    }

    const idx = _arrowHead % MAX_STUCK_ARROWS;
    _arrowHead++;

    // Convert to local position on enemy
    const localHit = enemy.mesh.worldToLocal(hitPoint.clone());

    const arrowData = {
      instanceIndex: idx,
      parentEnemy: enemy,
      localPosition: localHit,
      life: CORPSE_LIFETIME * 2, // Arrows stay longer
      weaponType: weaponType
    };

    _stuckArrows.push(arrowData);

    // Set initial position (will be updated in update loop)
    const worldPos = enemy.mesh.localToWorld(localHit.clone());
    _arrowPX[idx] = worldPos.x;
    _arrowPY[idx] = worldPos.y;
    _arrowPZ[idx] = worldPos.z;

    // Rotation to point in direction of arrow flight
    _arrowRX[idx] = Math.atan2(direction.y, Math.sqrt(direction.x * direction.x + direction.z * direction.z));
    _arrowRY[idx] = Math.atan2(direction.x, direction.z);
    _arrowRZ[idx] = 0;

    _arrowLife[idx] = arrowData.life;

    // Track on enemy for cleanup
    if (!enemy._stuckArrows) enemy._stuckArrows = [];
    enemy._stuckArrows.push(arrowData);
  }

  // ─── Update Loop ──────────────────────────────────────────────────────────────
  function update(dt = 0.016) {
    if (!_initialized) return;

    const GROUND_Y = 0.05;
    const FRICTION = 0.92;
    const BOUNCE = 0.3;

    // FIX N: Dirty flags to track which instance buffers were modified this frame
    let fleshDirty = false;
    let gutDirty = false;
    let brainDirty = false;
    let boneDirty = false;
    let arrowDirty = false;

    // Update flesh chunks
    for (let i = 0; i < MAX_FLESH_CHUNKS; i++) {
      if (_fleshLife[i] <= 0) continue;

      // Physics
      _fleshVY[i] += GRAVITY;
      _fleshPX[i] += _fleshVX[i];
      _fleshPY[i] += _fleshVY[i];
      _fleshPZ[i] += _fleshVZ[i];

      // Rotation
      _fleshRX[i] += _fleshRVX[i];
      _fleshRY[i] += _fleshRVY[i];
      _fleshRZ[i] += _fleshRVZ[i];

      // Ground collision
      if (_fleshPY[i] <= GROUND_Y) {
        _fleshPY[i] = GROUND_Y;
        _fleshVY[i] *= -BOUNCE;
        _fleshVX[i] *= FRICTION;
        _fleshVZ[i] *= FRICTION;
        _fleshRVX[i] *= FRICTION;
        _fleshRVY[i] *= FRICTION;
        _fleshRVZ[i] *= FRICTION;

        // Stop bouncing after velocity is low
        if (Math.abs(_fleshVY[i]) < 0.01) {
          _fleshVY[i] = 0;
          _fleshVX[i] = 0;
          _fleshVZ[i] = 0;
        }
      }

      // Life decay
      _fleshLife[i]--;

      // Update matrix
      _tmpPos.set(_fleshPX[i], _fleshPY[i], _fleshPZ[i]);
      _tmpQuat.setFromEuler(new THREE.Euler(_fleshRX[i], _fleshRY[i], _fleshRZ[i]));
      _tmpScale.set(1, 1, 1);
      _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
      _fleshChunkIM.setMatrixAt(i, _tmpMatrix);
      fleshDirty = true;  // FIX N: Mark as dirty when chunk is updated
    }
    // FIX N: Only set needsUpdate if at least one chunk was active this frame
    if (fleshDirty) _fleshChunkIM.instanceMatrix.needsUpdate = true;

    // Update guts (same physics)
    for (let i = 0; i < MAX_GUT_INSTANCES; i++) {
      if (_gutLife[i] <= 0) continue;
      _gutVY[i] += GRAVITY;
      _gutPX[i] += _gutVX[i];
      _gutPY[i] += _gutVY[i];
      _gutPZ[i] += _gutVZ[i];
      _gutRX[i] += _gutRVX[i];
      _gutRY[i] += _gutRVY[i];
      _gutRZ[i] += _gutRVZ[i];
      if (_gutPY[i] <= GROUND_Y) {
        _gutPY[i] = GROUND_Y;
        _gutVY[i] *= -BOUNCE;
        _gutVX[i] *= FRICTION;
        _gutVZ[i] *= FRICTION;
        _gutRVX[i] *= FRICTION;
        _gutRVY[i] *= FRICTION;
        _gutRVZ[i] *= FRICTION;
        if (Math.abs(_gutVY[i]) < 0.01) {
          _gutVY[i] = 0;
          _gutVX[i] = 0;
          _gutVZ[i] = 0;
        }
      }
      _gutLife[i]--;
      _tmpPos.set(_gutPX[i], _gutPY[i], _gutPZ[i]);
      _tmpQuat.setFromEuler(new THREE.Euler(_gutRX[i], _gutRY[i], _gutRZ[i]));
      _tmpScale.set(1, 1, 1);
      _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
      _gutIM.setMatrixAt(i, _tmpMatrix);
      gutDirty = true;  // FIX N: Mark as dirty
    }
    // FIX N: Only set needsUpdate if guts were updated
    if (gutDirty) _gutIM.instanceMatrix.needsUpdate = true;

    // Update brains (with extra bounce)
    const BRAIN_BOUNCE = 0.5;
    for (let i = 0; i < MAX_BRAIN_INSTANCES; i++) {
      if (_brainLife[i] <= 0) continue;
      _brainVY[i] += GRAVITY;
      _brainPX[i] += _brainVX[i];
      _brainPY[i] += _brainVY[i];
      _brainPZ[i] += _brainVZ[i];
      _brainRX[i] += _brainRVX[i];
      _brainRY[i] += _brainRVY[i];
      _brainRZ[i] += _brainRVZ[i];
      if (_brainPY[i] <= GROUND_Y) {
        _brainPY[i] = GROUND_Y;
        _brainVY[i] *= -BRAIN_BOUNCE;
        _brainVX[i] *= FRICTION;
        _brainVZ[i] *= FRICTION;
        _brainRVX[i] *= FRICTION;
        _brainRVY[i] *= FRICTION;
        _brainRVZ[i] *= FRICTION;
        if (Math.abs(_brainVY[i]) < 0.01) {
          _brainVY[i] = 0;
          _brainVX[i] = 0;
          _brainVZ[i] = 0;
        }
      }
      _brainLife[i]--;
      _tmpPos.set(_brainPX[i], _brainPY[i], _brainPZ[i]);
      _tmpQuat.setFromEuler(new THREE.Euler(_brainRX[i], _brainRY[i], _brainRZ[i]));
      _tmpScale.set(1, 1, 1);
      _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
      _brainIM.setMatrixAt(i, _tmpMatrix);
      brainDirty = true;  // FIX N: Mark as dirty
    }
    // FIX N: Only set needsUpdate if brains were updated
    if (brainDirty) _brainIM.instanceMatrix.needsUpdate = true;

    // Update bones
    for (let i = 0; i < MAX_BONE_INSTANCES; i++) {
      if (_boneLife[i] <= 0) continue;
      _boneVY[i] += GRAVITY;
      _bonePX[i] += _boneVX[i];
      _bonePY[i] += _boneVY[i];
      _bonePZ[i] += _boneVZ[i];
      _boneRX[i] += _boneRVX[i];
      _boneRY[i] += _boneRVY[i];
      _boneRZ[i] += _boneRVZ[i];
      if (_bonePY[i] <= GROUND_Y) {
        _bonePY[i] = GROUND_Y;
        _boneVY[i] *= -BOUNCE;
        _boneVX[i] *= FRICTION;
        _boneVZ[i] *= FRICTION;
        _boneRVX[i] *= FRICTION;
        _boneRVY[i] *= FRICTION;
        _boneRVZ[i] *= FRICTION;
        if (Math.abs(_boneVY[i]) < 0.01) {
          _boneVY[i] = 0;
          _boneVX[i] = 0;
          _boneVZ[i] = 0;
        }
      }
      _boneLife[i]--;
      _tmpPos.set(_bonePX[i], _bonePY[i], _bonePZ[i]);
      _tmpQuat.setFromEuler(new THREE.Euler(_boneRX[i], _boneRY[i], _boneRZ[i]));
      _tmpScale.set(1, 1, 1);
      _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
      _boneIM.setMatrixAt(i, _tmpMatrix);
      boneDirty = true;  // FIX N: Mark as dirty
    }
    // FIX N: Only set needsUpdate if bones were updated
    if (boneDirty) _boneIM.instanceMatrix.needsUpdate = true;

    // Update stuck arrows (follow enemy movement)
    for (let i = _stuckArrows.length - 1; i >= 0; i--) {
      const arrow = _stuckArrows[i];
      const idx = arrow.instanceIndex;

      _arrowLife[idx]--;
      if (_arrowLife[idx] <= 0 || !arrow.parentEnemy || arrow.parentEnemy.isDead) {
        // Remove arrow
        _arrowPY[idx] = -9999;
        _tmpMatrix.makeTranslation(0, -9999, 0);
        _stuckArrowIM.setMatrixAt(idx, _tmpMatrix);
        _stuckArrows.splice(i, 1);
        continue;
      }

      // Update position to follow enemy
      if (arrow.parentEnemy.mesh) {
        const worldPos = arrow.parentEnemy.mesh.localToWorld(arrow.localPosition.clone());
        _arrowPX[idx] = worldPos.x;
        _arrowPY[idx] = worldPos.y;
        _arrowPZ[idx] = worldPos.z;

        _tmpPos.set(_arrowPX[idx], _arrowPY[idx], _arrowPZ[idx]);
        _tmpQuat.setFromEuler(new THREE.Euler(_arrowRX[idx], _arrowRY[idx], _arrowRZ[idx]));
        _tmpScale.set(1, 1, 1);
        _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
        _stuckArrowIM.setMatrixAt(idx, _tmpMatrix);
        arrowDirty = true;  // FIX N: Mark as dirty
      }
    }
    // FIX N: Only set needsUpdate if arrows were updated
    if (arrowDirty) _stuckArrowIM.instanceMatrix.needsUpdate = true;

    // Update wound decals (decay over time)
    for (let i = _woundDecals.length - 1; i >= 0; i--) {
      const wound = _woundDecals[i];
      wound.life--;
      if (wound.life <= 0 || !wound.parentEnemy || wound.parentEnemy.isDead) {
        // Remove wound decal
        if (wound.mesh && wound.mesh.parent) {
          wound.mesh.parent.remove(wound.mesh);
          wound.mesh.geometry.dispose();
          wound.mesh.material.dispose();
        }
        _woundDecals.splice(i, 1);
      }
    }

    // Update corpse heartbeat pumps using dt accumulator (no setTimeout)
    const HEARTBEAT_INTERVAL_S = HEARTBEAT_INTERVAL / 1000;
    const maxPumps = 10;
    for (let i = _activeCorpses.length - 1; i >= 0; i--) {
      const corpse = _activeCorpses[i];

      // Handle blood pool fade-out phase
      if (corpse.fadeTimer >= 0) {
        corpse.fadeTimer -= dt;
        if (corpse.bloodPool && corpse.bloodPool.material) {
          corpse.bloodPool.material.opacity = Math.max(0, (corpse.fadeTimer / CORPSE_FADE_DURATION_S) * 0.6);
        }
        if (corpse.fadeTimer <= 0) {
          if (corpse.bloodPool) {
            _scene.remove(corpse.bloodPool);
            corpse.bloodPool.geometry.dispose();
            corpse.bloodPool.material.dispose();
            corpse.bloodPool = null;
          }
          _activeCorpses.splice(i, 1);
        }
        continue;
      }

      // Check corpse lifetime
      const elapsed = Date.now() - corpse.startTime;
      if (elapsed > CORPSE_LIFETIME || corpse.pumpCount >= maxPumps) {
        corpse.fadeTimer = CORPSE_FADE_DURATION_S; // Start fade-out
        continue;
      }

      // Accumulate dt and fire a pump when interval is reached
      corpse.pumpTimer += dt;
      if (corpse.pumpTimer >= HEARTBEAT_INTERVAL_S) {
        corpse.pumpTimer -= HEARTBEAT_INTERVAL_S;
        _pumpCorpse(corpse);
      }
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────────────
  function reset() {
    // Clear all wound decals
    _woundDecals.forEach(wound => {
      if (wound.mesh && wound.mesh.parent) {
        wound.mesh.parent.remove(wound.mesh);
        wound.mesh.geometry.dispose();
        wound.mesh.material.dispose();
      }
    });
    _woundDecals.length = 0;

    // Reset all instanced meshes
    for (let i = 0; i < MAX_FLESH_CHUNKS; i++) {
      _fleshLife[i] = 0;
      _fleshPY[i] = -9999;
    }
    for (let i = 0; i < MAX_GUT_INSTANCES; i++) {
      _gutLife[i] = 0;
      _gutPY[i] = -9999;
    }
    for (let i = 0; i < MAX_BRAIN_INSTANCES; i++) {
      _brainLife[i] = 0;
      _brainPY[i] = -9999;
    }
    for (let i = 0; i < MAX_BONE_INSTANCES; i++) {
      _boneLife[i] = 0;
      _bonePY[i] = -9999;
    }
    for (let i = 0; i < MAX_STUCK_ARROWS; i++) {
      _arrowLife[i] = 0;
      _arrowPY[i] = -9999;
    }

    _stuckArrows.length = 0;
    _activeCorpses.length = 0;

    console.log('[TraumaSystem] Reset complete');
  }

  // ─── Expose Public API ────────────────────────────────────────────────────────
  window.TraumaSystem = {
    init,
    update,
    reset,
    addWoundDecal,
    findNearbyWound,
    aggravateWound,
    tearOffFleshChunk,
    registerCorpse,
    spawnGuts,
    spawnBrains,
    spawnBones,
    stickArrowInEnemy,
    spawnSmear,
    startArterialPump,
    shotgunBlast,
    swordCleave,
    explosiveGib
  };

  console.log('[TraumaSystem] Module loaded - window.TraumaSystem ready');
})();
