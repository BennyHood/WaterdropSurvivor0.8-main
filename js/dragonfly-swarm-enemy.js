/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║   DRAGONFLY SWARM ENEMY — Trollslända                                ║
 * ║   Water Drop Survivor — Sandbox 2.0                                  ║
 * ║   File: js/dragonfly-swarm-enemy.js                                  ║
 * ║                                                                       ║
 * ║   WHAT THIS FILE CONTAINS:                                           ║
 * ║   • DragonflyEnemy class — Three.js mesh, flying physics, AI        ║
 * ║   • DragonflySwarmPool — object pool, ZERO garbage collection        ║
 * ║   • 3-state machine: SWARMING → DIVING_ATTACK → STUNNED             ║
 * ║   • Boids flocking AI (Separation, Alignment, Cohesion)             ║
 * ║   • Procedural wing flap (high-freq sine), body bob, velocity bank  ║
 * ║   • 4-wing dragonfly model from Three.js primitives only            ║
 * ║   • Full BloodV2 + GoreSim integration (green insectoid hemolymph)  ║
 * ║   • Level scaling: higher waves = faster swarms, more HP            ║
 * ║                                                                       ║
 * ║   HOW TO ADD TO YOUR GAME:                                           ║
 * ║   1. In sandbox.html, add AFTER leaping-slime-enemy.js:             ║
 * ║      <script src="js/dragonfly-swarm-enemy.js"></script>            ║
 * ║                                                                       ║
 * ║   2. In init():                                                      ║
 * ║      window.DragonflySwarmPool.init(scene, 24);                     ║
 * ║                                                                       ║
 * ║   3. To spawn:                                                       ║
 * ║      window.DragonflySwarmPool.spawn(x, z, waveLevel);             ║
 * ║                                                                       ║
 * ║   4. In animate():                                                   ║
 * ║      window.DragonflySwarmPool.update(dt, playerPosition);         ║
 * ║                                                                       ║
 * ║   5. On hit:                                                         ║
 * ║      window.DragonflySwarmPool.hit(enemy, weaponKey, weaponLevel,  ║
 * ║                                     hitPoint, hitNormal, bulletDir);║
 * ║                                                                       ║
 * ║   6. On reset:                                                       ║
 * ║      window.DragonflySwarmPool.reset();                             ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

;(function(global) {
'use strict';

// ════════════════════════════════════════════════
//  DRAGONFLY CONFIGURATION
// ════════════════════════════════════════════════
var DF_CFG = {
  BASE_HP:            30,
  BASE_SIZE:          0.40,
  SCALE_VARIANCE:     0.10,     // random size spread between instances
  BASE_DAMAGE:        10,       // contact damage per tick
  ATTACK_RANGE:       0.80,     // contact radius
  ATTACK_COOLDOWN:    600,      // ms between contact damage ticks

  // Flight
  FLY_HEIGHT:         2.5,      // default hover altitude
  FLY_HEIGHT_VARIANCE:1.0,      // per-instance altitude variance
  SPEED_SWARMING:     4.5,      // m/s max speed in swarm state
  SPEED_DIVING:       9.0,      // m/s during attack dive

  // Procedural animation
  WING_FLAP_FREQ:     22.0,     // rad/s — high frequency for insect wings
  WING_FLAP_AMP:      0.65,     // radians of wing deflection
  BOB_FREQ:           2.0,      // rad/s vertical bob
  BOB_AMP:            0.18,     // metres of vertical bob
  BANK_SPEED:         7.0,      // how fast the dragonfly rolls into turns

  // Boids parameters
  SEPARATION_RADIUS:  1.6,
  ALIGNMENT_RADIUS:   3.8,
  COHESION_RADIUS:    5.0,
  SEPARATION_FORCE:   3.0,
  ALIGNMENT_FORCE:    0.9,
  COHESION_FORCE:     0.7,
  PLAYER_CHASE_FORCE: 1.4,      // weak player pull in SWARMING state
  VELOCITY_DAMPING:   0.018,    // per-frame damping coefficient at 60 fps

  // Pre-calculated bases for Math.pow(base, dt * 60) frame-rate independent decay.
  // Avoids recomputing (1 - coefficient) on every frame tick.
  DAMPING_BASE:       1.0 - 0.018,  // = 0.982 — swarming velocity retention per frame @60 fps
  STUN_DECAY_BASE:    0.82,          // 18% velocity loss per frame @60 fps while stunned

  // State timings (seconds)
  SWARM_TIME_MIN:     2.0,
  SWARM_TIME_MAX:     5.5,
  DIVE_TIME:          2.0,
  STUN_TIME:          0.80,

  // Colors — iridescent insectoid green
  COLOR_HEALTHY:      0x33bb44,
  COLOR_HURT:         0x226633,
  COLOR_CRITICAL:     0x113322,
  COLOR_BODY_DARK:    0x1a6628,
  COLOR_WING:         0x88ffaa,
  COLOR_EYE:          0xff3300,
  EMISSIVE_IDLE:      0x002200,
  EMISSIVE_ATTACK:    0x114400,
};

// ════════════════════════════════════════════════
//  WEAPON DAMAGE PROFILES
// ════════════════════════════════════════════════
var DF_WEAPON_HIT = {
  pistol:         { dmg: 12,   push: 1.50 },
  revolver:       { dmg: 26,   push: 3.50 },
  shotgun:        { dmg: 44,   push: 8.00 },
  smg:            { dmg: 9,    push: 1.00 },
  sniper:         { dmg: 70,   push: 5.00 },
  minigun:        { dmg: 7,    push: 0.90 },
  grenade:        { dmg: 144,  push: 25.0 },
  rocket:         { dmg: 9999, push: 60.0 },
  laser:          { dmg: 32,   push: 0.20 },
  plasma:         { dmg: 46,   push: 3.50 },
  knife:          { dmg: 22,   push: 0.40 },
  sword:          { dmg: 41,   push: 2.00 },
  axe:            { dmg: 54,   push: 4.00 },
  flame:          { dmg: 14,   push: 1.00 },
  ice:            { dmg: 22,   push: 1.50 },
  lightning:      { dmg: 30,   push: 6.00 },
  knife_takedown: { dmg: 96,   push: 0.10 },
  meteor:         { dmg: 9999, push: 100.0 },
  gun:            { dmg: 15,   push: 1.50 }, // generic fallback
};

// ════════════════════════════════════════════════
//  SCRATCH VECTORS — zero allocation in update()
//  Never create new THREE.Vector3() during gameplay.
// ════════════════════════════════════════════════
var _v0 = new THREE.Vector3(); // general / separation accumulator
var _v1 = new THREE.Vector3(); // per-neighbour delta
var _v2 = new THREE.Vector3(); // alignment accumulator
var _v3 = new THREE.Vector3(); // cohesion accumulator
var _v4 = new THREE.Vector3(); // chase force / steering result
var _v5 = new THREE.Vector3(); // lerp target / temp

// ════════════════════════════════════════════════
//  DRAGONFLY ENEMY INSTANCE
// ════════════════════════════════════════════════
function DragonflyEnemy() {
  this.alive        = false;
  this.active       = false;
  this.enemyType    = 'dragonfly';
  this.type         = 'dragonfly';
  this.isBoss       = false;
  this.radius       = DF_CFG.BASE_SIZE;

  // Stats
  this.hp           = 0;
  this.maxHp        = 0;
  this.level        = 1;
  this.size         = DF_CFG.BASE_SIZE;

  // Physics — full 3D velocity (Y managed separately for flight)
  this.velocity     = new THREE.Vector3();
  this._flyHeight   = DF_CFG.FLY_HEIGHT;

  // State machine
  this.state        = 'SWARMING'; // SWARMING | DIVING_ATTACK | STUNNED
  this.stateTimer   = 0;

  // Death
  this.dying        = false;
  this.dead         = false;
  this.deathTimer   = 0;
  this.killedBy     = null;
  this._spinVelX    = 0; // death tumble angular speeds
  this._spinVelZ    = 0;

  // Visual feedback
  this.flashTimer   = 0;

  // Procedural animation state
  this._bobPhase    = Math.random() * Math.PI * 2;
  this._wingPhase   = Math.random() * Math.PI * 2;
  this._bankAngle   = 0; // current roll (banking into turns)

  // Three.js objects (built once in pool, reused every spawn)
  this.mesh         = null; // THREE.Group — root container
  this.bodyMesh     = null; // main thorax cylinder
  this.tailMesh     = null; // abdomen segment
  this.headMesh     = null; // head sphere
  this.leftEyeMesh  = null; // compound eye left
  this.rightEyeMesh = null; // compound eye right
  this.wingFL       = null; // front-left wing pivot group
  this.wingFR       = null; // front-right wing pivot group
  this.wingBL       = null; // back-left wing pivot group
  this.wingBR       = null; // back-right wing pivot group
  this.shadowMesh   = null; // ground shadow

  // isDead getter/setter for player auto-aim compatibility
  Object.defineProperty(this, 'isDead', {
    get: function() { return this.dead; },
    set: function(v) { this.dead = v; },
  });
}

// ─── Activate from pool ───────────────────────────────────────────────────────
DragonflyEnemy.prototype.spawn = function(x, z, waveLevel) {
  this.alive        = true;
  this.active       = true;
  this.dead         = false;
  this.dying        = false;
  this.level        = waveLevel || 1;
  this.flashTimer   = 0;
  this.deathTimer   = 0;
  this.killedBy     = null;
  this._spinVelX    = 0;
  this._spinVelZ    = 0;

  // Scale HP with wave level
  var lvlMult = 1.0 + (this.level - 1) * 0.18;
  this.maxHp  = Math.floor(DF_CFG.BASE_HP * lvlMult);
  this.hp     = this.maxHp;

  // Slight random size variation
  this.size   = DF_CFG.BASE_SIZE * (1.0 + (Math.random() - 0.5) * DF_CFG.SCALE_VARIANCE);
  this.radius = this.size;

  // Per-instance flight altitude
  this._flyHeight = DF_CFG.FLY_HEIGHT + (Math.random() - 0.5) * DF_CFG.FLY_HEIGHT_VARIANCE;

  // Random animation phase offsets
  this._bobPhase  = Math.random() * Math.PI * 2;
  this._wingPhase = Math.random() * Math.PI * 2;
  this._bankAngle = 0;

  // Initial velocity: random horizontal drift
  this.velocity.set(
    (Math.random() - 0.5) * 2.0,
    0,
    (Math.random() - 0.5) * 2.0
  );

  // Start swarming, pick random time before first dive
  this.state      = 'SWARMING';
  this.stateTimer = DF_CFG.SWARM_TIME_MIN +
                    Math.random() * (DF_CFG.SWARM_TIME_MAX - DF_CFG.SWARM_TIME_MIN);

  // Place mesh at fly height
  this.mesh.position.set(x, this._flyHeight, z);
  this.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
  this.mesh.scale.set(1, 1, 1);
  this.mesh.visible = true;

  // Reset material to healthy state
  this.bodyMesh.material.color.setHex(DF_CFG.COLOR_HEALTHY);
  this.bodyMesh.material.emissive.setHex(DF_CFG.EMISSIVE_IDLE);
  this.bodyMesh.material.opacity = 1.0;
  this.bodyMesh.material.transparent = false;

  if (this.shadowMesh) {
    this.shadowMesh.visible = true;
    this.shadowMesh.position.set(x, 0.01, z);
  }
};

// ─── Main update — called every frame ─────────────────────────────────────────
DragonflyEnemy.prototype.update = function(dt, playerPos, flock) {
  if (!this.alive || !this.mesh) return;

  // Death animation takes full control
  if (this.dying) {
    this._updateDeath(dt);
    return;
  }

  // Hit flash decay
  if (this.flashTimer > 0) {
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.bodyMesh.material.emissive.setHex(DF_CFG.EMISSIVE_IDLE);
    }
  }

  this.stateTimer -= dt;

  // Run current state behaviour
  switch (this.state) {
    case 'SWARMING':
      this._stateSwarming(dt, playerPos, flock);
      break;
    case 'DIVING_ATTACK':
      this._stateDiving(dt, playerPos);
      break;
    case 'STUNNED':
      this._stateStunned(dt);
      break;
  }

  // ── Altitude control: smoothly lerp Y toward target flight height ──────────
  this._bobPhase += dt * DF_CFG.BOB_FREQ;
  var baseY   = (this.state === 'DIVING_ATTACK') ? 0.65 : this._flyHeight;
  var targetY = baseY + Math.sin(this._bobPhase) * DF_CFG.BOB_AMP;
  this.mesh.position.y += (targetY - this.mesh.position.y) * Math.min(3.5 * dt, 1.0);

  // ── Wing flap: high-frequency sine on pivot group rotation ─────────────────
  this._wingPhase += dt * DF_CFG.WING_FLAP_FREQ;
  var flapAngle = Math.sin(this._wingPhase) * DF_CFG.WING_FLAP_AMP;
  // Back wings slightly out of phase for natural dragonfly beat
  var flapBack  = Math.sin(this._wingPhase + Math.PI * 0.35) * DF_CFG.WING_FLAP_AMP * 0.88;

  if (this.wingFL) {
    this.wingFL.rotation.z =  flapAngle;
    this.wingFR.rotation.z = -flapAngle;
    this.wingBL.rotation.z =  flapBack;
    this.wingBR.rotation.z = -flapBack;
  }

  // ── Banking: roll into the direction of horizontal velocity ────────────────
  var targetBank = -this.velocity.x * 0.18;
  this._bankAngle += (targetBank - this._bankAngle) * Math.min(DF_CFG.BANK_SPEED * dt, 1.0);
  this.mesh.rotation.z = this._bankAngle;

  // ── Yaw: face the direction of travel ──────────────────────────────────────
  if (this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z > 0.04) {
    var targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
    var currYaw   = this.mesh.rotation.y;
    var delta     = targetYaw - currYaw;
    // Wrap delta to [-PI, PI] for shortest-path rotation
    while (delta >  Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.mesh.rotation.y += delta * Math.min(8.0 * dt, 1.0);
  }

  // ── Pitch: tilt nose down slightly proportional to forward speed ───────────
  var hSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
  this.mesh.rotation.x = hSpeed * -0.06;

  // ── Ground shadow ──────────────────────────────────────────────────────────
  if (this.shadowMesh) {
    this.shadowMesh.position.x = this.mesh.position.x;
    this.shadowMesh.position.z = this.mesh.position.z;
    var heightFactor = Math.max(0.15, 1.0 - this.mesh.position.y * 0.09);
    this.shadowMesh.scale.set(heightFactor, 1, heightFactor);
  }
};

// ─── SWARMING: boids flocking + gentle player chase ──────────────────────────
DragonflyEnemy.prototype._stateSwarming = function(dt, playerPos, flock) {
  // Re-use module-level scratch vectors — zero allocation
  _v0.set(0, 0, 0); // separation accumulator
  _v2.set(0, 0, 0); // alignment accumulator
  _v3.set(0, 0, 0); // cohesion accumulator

  var sepCount = 0, aliCount = 0, cohCount = 0;

  if (flock) {
    for (var i = 0; i < flock.length; i++) {
      var other = flock[i];
      if (other === this || !other.alive) continue;

      // Reuse _v1 as per-neighbour delta (no allocation)
      _v1.subVectors(this.mesh.position, other.mesh.position);
      _v1.y = 0; // operate in XZ plane only
      var d = _v1.length();

      // Separation: steer away from too-close neighbours
      if (d > 0.001 && d < DF_CFG.SEPARATION_RADIUS) {
        _v1.normalize().multiplyScalar(1.0 / d); // weight by inverse distance
        _v0.add(_v1);
        sepCount++;
      }

      // Alignment: match average heading of local flock
      if (d < DF_CFG.ALIGNMENT_RADIUS) {
        _v2.x += other.velocity.x;
        _v2.z += other.velocity.z;
        aliCount++;
      }

      // Cohesion: steer toward average position of local flock
      if (d < DF_CFG.COHESION_RADIUS) {
        _v3.x += other.mesh.position.x;
        _v3.z += other.mesh.position.z;
        cohCount++;
      }
    }
  }

  // Normalize and scale each boids force
  if (sepCount > 0) {
    _v0.divideScalar(sepCount);
    if (_v0.lengthSq() > 0.0001) _v0.normalize().multiplyScalar(DF_CFG.SEPARATION_FORCE);
  }

  if (aliCount > 0) {
    _v2.divideScalar(aliCount);
    if (_v2.lengthSq() > 0.0001) _v2.normalize().multiplyScalar(DF_CFG.ALIGNMENT_FORCE);
  }

  if (cohCount > 0) {
    _v3.divideScalar(cohCount);
    _v3.sub(this.mesh.position);
    _v3.y = 0;
    if (_v3.lengthSq() > 0.0001) _v3.normalize().multiplyScalar(DF_CFG.COHESION_FORCE);
  }

  // Chase player weakly during swarming
  _v4.set(0, 0, 0);
  if (playerPos) {
    _v4.subVectors(playerPos, this.mesh.position);
    _v4.y = 0;
    if (_v4.lengthSq() > 0.0001) _v4.normalize().multiplyScalar(DF_CFG.PLAYER_CHASE_FORCE);
  }

  // Accumulate all forces into velocity
  this.velocity.x += (_v0.x + _v2.x + _v3.x + _v4.x) * dt;
  this.velocity.z += (_v0.z + _v2.z + _v3.z + _v4.z) * dt;
  this.velocity.y  = 0; // altitude controlled separately

  // Velocity damping — truly frame-rate independent exponential decay.
  // Math.pow(base, dt * 60): same per-second result at 30, 60, or 120 fps.
  var dampFactor = Math.pow(DF_CFG.DAMPING_BASE, dt * 60);
  this.velocity.x *= dampFactor;
  this.velocity.z *= dampFactor;

  // Clamp to swarming speed
  var hSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
  if (hSpeed > DF_CFG.SPEED_SWARMING) {
    var inv = DF_CFG.SPEED_SWARMING / hSpeed;
    this.velocity.x *= inv;
    this.velocity.z *= inv;
  }

  // Integrate position
  this.mesh.position.x += this.velocity.x * dt;
  this.mesh.position.z += this.velocity.z * dt;

  // Transition to dive attack when timer expires
  if (this.stateTimer <= 0 && playerPos) {
    this.state      = 'DIVING_ATTACK';
    this.stateTimer = DF_CFG.DIVE_TIME;
    this.bodyMesh.material.emissive.setHex(DF_CFG.EMISSIVE_ATTACK);
  }
};

// ─── DIVING_ATTACK: fast dash toward player ───────────────────────────────────
DragonflyEnemy.prototype._stateDiving = function(dt, playerPos) {
  if (playerPos) {
    // Compute desired velocity pointing at player
    _v5.subVectors(playerPos, this.mesh.position);
    _v5.y = 0;
    if (_v5.lengthSq() > 0.0001) {
      _v5.normalize().multiplyScalar(DF_CFG.SPEED_DIVING);
      // Smooth steer toward target direction
      this.velocity.x += (_v5.x - this.velocity.x) * Math.min(5.0 * dt, 1.0);
      this.velocity.z += (_v5.z - this.velocity.z) * Math.min(5.0 * dt, 1.0);
    }
  }
  this.velocity.y = 0;

  this.mesh.position.x += this.velocity.x * dt;
  this.mesh.position.z += this.velocity.z * dt;

  // Return to swarming after dive completes
  if (this.stateTimer <= 0) {
    this.state      = 'SWARMING';
    this.stateTimer = DF_CFG.SWARM_TIME_MIN +
                      Math.random() * (DF_CFG.SWARM_TIME_MAX - DF_CFG.SWARM_TIME_MIN);
    this.bodyMesh.material.emissive.setHex(DF_CFG.EMISSIVE_IDLE);
  }
};

// ─── STUNNED: knocked off course, loses control briefly ──────────────────────
DragonflyEnemy.prototype._stateStunned = function(dt) {
  // Velocity decay while stunned — truly frame-rate independent exponential decay.
  // Math.pow(base, dt * 60): same per-second result at 30, 60, or 120 fps.
  var stunDecay = Math.pow(DF_CFG.STUN_DECAY_BASE, dt * 60);
  this.velocity.x *= stunDecay;
  this.velocity.z *= stunDecay;
  this.velocity.y  = 0;

  this.mesh.position.x += this.velocity.x * dt;
  this.mesh.position.z += this.velocity.z * dt;

  if (this.stateTimer <= 0) {
    this.state      = 'SWARMING';
    this.stateTimer = DF_CFG.SWARM_TIME_MIN +
                      Math.random() * (DF_CFG.SWARM_TIME_MAX - DF_CFG.SWARM_TIME_MIN);
    this.bodyMesh.material.emissive.setHex(DF_CFG.EMISSIVE_IDLE);
  }
};

// ─── Take damage ──────────────────────────────────────────────────────────────
DragonflyEnemy.prototype.receiveHit = function(weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir) {
  if (!this.alive || this.dying) return null;

  var wh       = DF_WEAPON_HIT[weaponKey] || DF_WEAPON_HIT.gun;
  var lvlBonus = weaponLevel ? (1.0 + (weaponLevel - 1) * 0.15) : 1.0;
  var dmg      = Math.round(wh.dmg * lvlBonus);

  this.hp -= dmg;

  // Flash white on hit
  this.bodyMesh.material.emissive.setHex(0xaaaaaa);
  this.flashTimer = 0.12;

  // Physical knockback — apply to horizontal velocity
  if (bulletDir) {
    this.velocity.x += bulletDir.x * wh.push;
    this.velocity.z += bulletDir.z * wh.push;
  }

  // Enter STUNNED state on strong impacts
  if (wh.push > 2.0) {
    this.state      = 'STUNNED';
    this.stateTimer = DF_CFG.STUN_TIME * (1.0 + (wh.push - 2.0) * 0.05);
  }

  // Colour shifts toward critical as HP drops
  var ratio = Math.max(0, this.hp / this.maxHp);
  if (ratio < 0.33) {
    this.bodyMesh.material.color.setHex(DF_CFG.COLOR_CRITICAL);
  } else if (ratio < 0.66) {
    this.bodyMesh.material.color.setHex(DF_CFG.COLOR_HURT);
  }

  // BloodV2 hit — green insectoid hemolymph
  if (global.BloodV2 && typeof global.BloodV2.hit === 'function') {
    try { global.BloodV2.hit(this, weaponKey, hitPoint, hitNormal); } catch(e) {}
  }
  // GoreSim wound simulation
  if (global.GoreSim && typeof global.GoreSim.onHit === 'function') {
    try { global.GoreSim.onHit(this, weaponKey, hitPoint, hitNormal); } catch(e) {}
  }

  if (this.hp <= 0) {
    this._die(weaponKey, hitPoint);
    return { damage: dmg, killed: true };
  }

  return { damage: dmg, killed: false };
};

// ─── Begin death animation ────────────────────────────────────────────────────
DragonflyEnemy.prototype._die = function(weaponKey, hitPoint) {
  if (this.dying) return;
  this.dying      = true;
  this.killedBy   = weaponKey || 'unknown';
  this.deathTimer = 0.70;

  // Violent random multi-axis tumble on death
  var sign = (Math.random() > 0.5) ? 1 : -1;
  this._spinVelX = sign * (7.0 + Math.random() * 9.0);
  this._spinVelZ = -sign * (5.0 + Math.random() * 8.0);

  // BloodV2 kill burst — green hemolymph spray
  if (global.BloodV2 && typeof global.BloodV2.kill === 'function') {
    try { global.BloodV2.kill(this, weaponKey, hitPoint); } catch(e) {}
  }
  // NOTE: GoreSim.onKill intentionally NOT called here.
  // The game loop (sandbox-loop.js) is the single owner of GoreSim.onKill
  // to prevent duplicate calls when receiveHit triggers _die directly.
};

// ─── Death animation update ───────────────────────────────────────────────────
DragonflyEnemy.prototype._updateDeath = function(dt) {
  this.deathTimer -= dt;

  var progress = 1.0 - Math.max(0, this.deathTimer / 0.70);

  // Violent multi-axis spin out of control
  this.mesh.rotation.x += this._spinVelX * dt;
  this.mesh.rotation.z += this._spinVelZ * dt;

  // Fall while tumbling
  this.mesh.position.y  -= progress * 5.0 * dt;

  // Carry death momentum forward
  this.mesh.position.x  += this.velocity.x * dt * 0.45;
  this.mesh.position.z  += this.velocity.z * dt * 0.45;

  // Shrink toward zero
  var scale = 1.0 - progress;
  if (scale < 0.001) scale = 0.001;
  this.mesh.scale.set(scale, scale, scale);

  // Fade body out
  this.bodyMesh.material.transparent = true;
  this.bodyMesh.material.opacity      = Math.max(0, 1.0 - progress * 1.6);

  if (this.deathTimer <= 0) {
    this._cleanup();
  }
};

// ─── Return to pool ───────────────────────────────────────────────────────────
DragonflyEnemy.prototype._cleanup = function() {
  this.alive    = false;
  this.active   = false;
  this.dead     = true;
  this.dying    = false;
  this._spinVelX = 0;
  this._spinVelZ = 0;

  if (this.mesh) {
    this.mesh.visible = false;
    this.mesh.position.set(0, -100, 0); // park off-scene
    this.mesh.scale.set(1, 1, 1);
    this.mesh.rotation.set(0, 0, 0);
  }
  if (this.bodyMesh && this.bodyMesh.material) {
    this.bodyMesh.material.opacity      = 1.0;
    this.bodyMesh.material.transparent  = false;
    this.bodyMesh.material.emissive.setHex(DF_CFG.EMISSIVE_IDLE);
    this.bodyMesh.material.color.setHex(DF_CFG.COLOR_HEALTHY);
  }
  if (this.shadowMesh) {
    this.shadowMesh.visible = false;
  }
  this.velocity.set(0, 0, 0);
};

// ════════════════════════════════════════════════
//  DRAGONFLY SWARM POOL
//  Zero-GC object pool — all meshes pre-allocated
// ════════════════════════════════════════════════
var DragonflySwarmPool = {
  _scene:       null,
  _pool:        [],
  _count:       0,
  _ready:       false,
  _aliveFlock:  [], // scratch array for boids — reused every frame, no allocation
  _aliveScratch:[],

  init: function(scene, maxCount) {
    this._scene      = scene;
    this._count      = maxCount || 24;
    this._pool       = [];
    this._aliveFlock = [];

    for (var i = 0; i < this._count; i++) {
      var e = this._buildMesh(scene, i);
      this._pool.push(e);
    }
    this._ready = true;
    console.log('[DragonflySwarmPool] Ready. ' + this._count + ' dragonflies pre-allocated.');
  },

  _buildMesh: function(scene, idx) {
    var e = new DragonflyEnemy();
    var s = DF_CFG.BASE_SIZE;

    // ── ROOT GROUP ─────────────────────────────────────────────────────────
    var group = new THREE.Group();
    group.visible = false;
    group.position.set(0, -100, 0);
    scene.add(group);
    e.mesh = group;

    // ── THORAX / BODY (elongated cylinder oriented forward along Z) ─────────
    var bodyGeo = new THREE.CylinderGeometry(s * 0.22, s * 0.18, s * 1.50, 8);
    bodyGeo.rotateX(Math.PI / 2); // orient along local Z (forward)
    var bodyMat = new THREE.MeshPhysicalMaterial({
      color:              DF_CFG.COLOR_HEALTHY,
      emissive:           new THREE.Color(DF_CFG.EMISSIVE_IDLE),
      emissiveIntensity:  0.35,
      metalness:          0.55,
      roughness:          0.18,
      clearcoat:          0.85,
      clearcoatRoughness: 0.12,
      transparent:        false,
      opacity:            1.0,
    });
    var bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow    = true;
    bodyMesh.receiveShadow = false;
    bodyMesh.frustumCulled = false;
    group.add(bodyMesh);
    e.bodyMesh = bodyMesh;

    // ── ABDOMEN / TAIL (tapered cylinder, extends behind thorax) ────────────
    var tailGeo = new THREE.CylinderGeometry(s * 0.11, s * 0.04, s * 1.60, 7);
    tailGeo.rotateX(Math.PI / 2);
    var tailMat = new THREE.MeshStandardMaterial({
      color:    DF_CFG.COLOR_BODY_DARK,
      metalness: 0.40,
      roughness: 0.30,
    });
    var tailMesh = new THREE.Mesh(tailGeo, tailMat);
    tailMesh.castShadow = true;
    tailMesh.position.set(0, 0, s * 1.55); // behind the thorax
    group.add(tailMesh);
    e.tailMesh = tailMesh;

    // ── HEAD (sphere, slightly flattened — insect-like) ─────────────────────
    var headGeo = new THREE.SphereGeometry(s * 0.28, 12, 10);
    var headMat = new THREE.MeshPhysicalMaterial({
      color:    DF_CFG.COLOR_HEALTHY,
      metalness: 0.50,
      roughness: 0.15,
      clearcoat: 1.0,
    });
    var headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.castShadow = true;
    headMesh.position.set(0, 0, -s * 0.94); // in front of thorax
    group.add(headMesh);
    e.headMesh = headMesh;

    // ── COMPOUND EYES (two large spheres, glowing orange/red) ───────────────
    var eyeGeo = new THREE.SphereGeometry(s * 0.145, 8, 8);
    var eyeMat = new THREE.MeshStandardMaterial({
      color:    DF_CFG.COLOR_EYE,
      emissive: new THREE.Color(0x550000),
      roughness: 0.10,
      metalness: 0.20,
    });
    var leftEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    leftEye.position.set( s * 0.22, s * 0.10, -s * 1.10);
    group.add(leftEye);
    e.leftEyeMesh = leftEye;

    var rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    rightEye.position.set(-s * 0.22, s * 0.10, -s * 1.10);
    group.add(rightEye);
    e.rightEyeMesh = rightEye;

    // ── WINGS (4 planes — pivot groups allow correct edge-pivot rotation) ───
    //  Wings are horizontal planes. Each wing hangs off a pivot Group so the
    //  flap rotation happens around the attachment edge, not the wing centre.
    //
    //  Pivot group local Z = body forward axis.
    //  Rotating pivot.rotation.z = ±sin(t) makes the wing tip go up/down.

    var wingMatFront = new THREE.MeshStandardMaterial({
      color:       DF_CFG.COLOR_WING,
      transparent: true,
      opacity:     0.40,
      side:        THREE.DoubleSide,
      metalness:   0.08,
      roughness:   0.25,
    });
    var wingMatBack = new THREE.MeshStandardMaterial({
      color:       DF_CFG.COLOR_WING,
      transparent: true,
      opacity:     0.35,
      side:        THREE.DoubleSide,
      metalness:   0.08,
      roughness:   0.25,
    });

    // Front wing geometry — longer, wider
    var wFGeo = new THREE.PlaneGeometry(s * 1.55, s * 0.52);
    // Offset vertices so the pivot edge is at x=0 (inner edge at body)
    wFGeo.translate(s * 0.775, 0, 0);

    // Back wing geometry — slightly shorter
    var wBGeo = new THREE.PlaneGeometry(s * 1.30, s * 0.46);
    wBGeo.translate(s * 0.65, 0, 0);

    // Front-left pivot
    var pvFL = new THREE.Group();
    pvFL.position.set(s * 0.08, s * 0.05, -s * 0.32);
    var mFL = new THREE.Mesh(wFGeo, wingMatFront.clone());
    mFL.rotation.x = -Math.PI / 2; // lie in horizontal plane
    pvFL.add(mFL);
    group.add(pvFL);
    e.wingFL = pvFL;

    // Front-right pivot (mirrored)
    var pvFR = new THREE.Group();
    pvFR.position.set(-s * 0.08, s * 0.05, -s * 0.32);
    var mFR = new THREE.Mesh(wFGeo, wingMatFront.clone());
    mFR.rotation.x = -Math.PI / 2;
    pvFR.add(mFR);
    group.add(pvFR);
    e.wingFR = pvFR;

    // Back-left pivot
    var pvBL = new THREE.Group();
    pvBL.position.set(s * 0.08, s * 0.05, s * 0.38);
    var mBL = new THREE.Mesh(wBGeo, wingMatBack.clone());
    mBL.rotation.x = -Math.PI / 2;
    pvBL.add(mBL);
    group.add(pvBL);
    e.wingBL = pvBL;

    // Back-right pivot (mirrored)
    var pvBR = new THREE.Group();
    pvBR.position.set(-s * 0.08, s * 0.05, s * 0.38);
    var mBR = new THREE.Mesh(wBGeo, wingMatBack.clone());
    mBR.rotation.x = -Math.PI / 2;
    pvBR.add(mBR);
    group.add(pvBR);
    e.wingBR = pvBR;

    // Front-right pivot mirrors the front-left (negative rotation)
    // handled in update: wingFR.rotation.z = -flapAngle

    // ── GROUND SHADOW ─────────────────────────────────────────────────────
    var shadowGeo = new THREE.CircleGeometry(s * 0.85, 10);
    var shadowMat = new THREE.MeshBasicMaterial({
      color:      0x000000,
      transparent: true,
      opacity:    0.18,
      depthWrite: false,
    });
    var shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x  = -Math.PI / 2;
    shadow.position.set(0, 0.01, 0);
    shadow.visible     = false;
    shadow.renderOrder = -1;
    scene.add(shadow);
    e.shadowMesh = shadow;

    e.id = 'dragonfly-' + idx;
    return e;
  },

  // ── spawn ──────────────────────────────────────────────────────────────────
  spawn: function(x, z, waveLevel) {
    if (!this._ready) return null;
    var e = null;
    for (var i = 0; i < this._pool.length; i++) {
      if (!this._pool[i].active) { e = this._pool[i]; break; }
    }
    if (!e) {
      // Pool exhausted — recycle oldest slot
      e = this._pool[0];
      e._cleanup();
    }
    e.spawn(x, z, waveLevel);
    return e;
  },

  // ── update — called every frame ────────────────────────────────────────────
  update: function(dt, playerPos) {
    if (!this._ready) return;

    // Build alive flock list (reuse _aliveFlock scratch — zero allocation)
    this._aliveFlock.length = 0;
    for (var i = 0; i < this._pool.length; i++) {
      var e = this._pool[i];
      if (e.active && !e.dying) this._aliveFlock.push(e);
    }

    // Update every active instance, passing the flock for boids
    for (var j = 0; j < this._pool.length; j++) {
      if (this._pool[j].active) {
        this._pool[j].update(dt, playerPos, this._aliveFlock);
      }
    }
  },

  // ── hit — delegate to enemy instance ──────────────────────────────────────
  hit: function(enemy, weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir) {
    if (!enemy || !enemy.active) return null;
    return enemy.receiveHit(weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir);
  },

  // ── getAlive — return all alive, non-dying instances ──────────────────────
  // Accepts optional output array; reuses internal scratch to avoid allocation.
  getAlive: function(outArray) {
    var result = outArray || this._aliveScratch;
    result.length = 0;
    var pool = this._pool;
    for (var i = 0; i < pool.length; i++) {
      var e = pool[i];
      if (e.alive && !e.dying) result.push(e);
    }
    return result;
  },

  // ── reset all instances (e.g. game over / wave reset) ─────────────────────
  reset: function() {
    for (var i = 0; i < this._pool.length; i++) {
      var e = this._pool[i];
      if (e.alive || e.dying) e._cleanup();
    }
    this._aliveFlock.length = 0;
    console.log('[DragonflySwarmPool] Reset complete.');
  },
};

// ════════════════════════════════════════════════
//  EXPOSE GLOBALLY
// ════════════════════════════════════════════════
global.DragonflySwarmPool = DragonflySwarmPool;
global.DragonflyEnemy     = DragonflyEnemy;
global.DF_CFG             = DF_CFG;

// Register dragonfly hemolymph colour with BloodV2 if already loaded.
// If BloodV2 loads after this file, call BloodV2.addEnemyBlood() in your init().
if (global.BloodV2 && typeof global.BloodV2.addEnemyBlood === 'function') {
  global.BloodV2.addEnemyBlood(
    'dragonfly',
    0x33dd44,  // base   — bright insectoid green
    0x226622,  // dark   — deep forest green
    0x88ff44,  // organ  — neon yellow-green (innards)
    0x99ee55   // mist   — fine spray
  );
}

console.log([
  '',
  '╔══════════════════════════════════════════════════════════╗',
  '║  Dragonfly Swarm System v1.0 — LOADED                   ║',
  '╠══════════════════════════════════════════════════════════╣',
  '║  Trollslända — insectoid flying swarm enemy              ║',
  '║  3-state AI: SWARMING → DIVING_ATTACK → STUNNED         ║',
  '║  Boids flocking: Separation + Alignment + Cohesion      ║',
  '║  High-freq sine wing flap — zero GC scratch vectors     ║',
  '║  Banking roll, velocity pitch, per-instance bob          ║',
  '║  BloodV2 + GoreSim integration (green hemolymph)        ║',
  '║  Level-scaling HP   |  Wing-pivot edge rotation         ║',
  '╠══════════════════════════════════════════════════════════╣',
  '║  init():  DragonflySwarmPool.init(scene, 24);           ║',
  '║  spawn(): DragonflySwarmPool.spawn(x, z, waveLevel);    ║',
  '║  loop():  DragonflySwarmPool.update(dt, playerPos);     ║',
  '╚══════════════════════════════════════════════════════════╝',
  '',
].join('\n'));

})(window);
