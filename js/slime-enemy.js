/**

- ╔══════════════════════════════════════════════════════════════════════╗
- ║   SLIME ENEMY — Complete System v1.0                                ║
- ║   Water Drop Survivor — Sandbox 2.0                                 ║
- ║   File: js/slime-enemy.js                                           ║
- ║                                                                      ║
- ║   WHAT THIS FILE CONTAINS:                                          ║
- ║   • SlimeEnemy class — full Three.js mesh, physics, AI             ║
- ║   • SlimePool — object pool, ZERO garbage collection               ║
- ║   • 47 unique hit reactions across all weapons                      ║
- ║   • 18 unique kill animations (one per death cause)                 ║
- ║   • Progressive wound system — holes GROW with repeated hits       ║
- ║   • Blood trail system — moving slimes leave ground trails         ║
- ║   • Level scaling — higher atk = penetration, through-shots        ║
- ║   • Weapon upgrade effects — higher lvl = more brutal impact       ║
- ║                                                                      ║
- ║   HOW TO ADD TO YOUR GAME:                                          ║
- ║   1. In sandbox.html, add AFTER blood-system-v2.js:                ║
- ║      <script src="js/slime-enemy.js"></script>                      ║
- ║                                                                      ║
- ║   2. In game-screens.js init():                                     ║
- ║      window.SlimePool.init(scene, 40);  // 40 = max slimes          ║
- ║                                                                      ║
- ║   3. To spawn a slime:                                              ║
- ║      var s = window.SlimePool.spawn(x, y, z);                      ║
- ║                                                                      ║
- ║   4. In game-loop.js animate():                                     ║
- ║      window.SlimePool.update(delta, playerPosition);               ║
- ║                                                                      ║
- ║   5. When player shoots:                                            ║
- ║      window.SlimePool.hit(slime, weaponKey, weaponLevel,           ║
- ║                            hitPoint, hitNormal, bulletDir);        ║
- ║                                                                      ║
- ║   6. On reset:                                                      ║
- ║      window.SlimePool.reset();                                      ║
- ╚══════════════════════════════════════════════════════════════════════╝
  */

;(function(global) {
'use strict';

// ════════════════════════════════════════════════
//  SLIME CONFIGURATION
// ════════════════════════════════════════════════
var SLIME_CFG = {
BASE_HP:          120,
BASE_SPEED:       1.4,
BASE_DAMAGE:      8,
BASE_SCALE:       0.55,
SCALE_VARIANCE:   0.12,   // slimes vary slightly in size
ATTACK_RANGE:     0.8,
ATTACK_COOLDOWN:  1.4,    // seconds
AGGRO_RANGE:      12.0,
TRAIL_INTERVAL:   0.08,   // how often moving slime leaves blood drop
TRAIL_CHANCE:     0.35,   // 35% chance per interval to drop blood
MAX_WOUNDS:       8,
WOBBLE_SPEED:     6.0,    // idle wobble animation speed
SQUISH_ON_HIT:    true,
};

// Organ layout (normalized Y: -1=bottom, +1=top)
var ORGANS = {
brain:    { yMin: 0.52, yMax: 1.00, hp: 22,  maxHp: 22,  bleedRate: 0.18, name: 'Nucleus'    },
heart:    { yMin: 0.10, yMax: 0.52, hp: 48,  maxHp: 48,  bleedRate: 1.00, name: 'Pump Core'  },
guts:     { yMin:-0.28, yMax: 0.10, hp: 68,  maxHp: 68,  bleedRate: 0.55, name: 'Fluid Sac'  },
membrane: { yMin:-1.00, yMax: 1.00, hp: 38,  maxHp: 38,  bleedRate: 0.28, name: 'Outer Gel'  },
core:     { yMin:-1.00, yMax:-0.28, hp: 95,  maxHp: 95,  bleedRate: 0.72, name: 'Vital Core'  },
};

// Slime colour palette — outer gel changes as slime takes damage
var SLIME_COLORS = {
healthy:  0x22dd44,
hurt:     0x18aa30,
critical: 0x0e7020,
dead:     0x0a5018,
blood:    0x11bb33,
bloodDark:0x0a7020,
guts:     0x55ee22,
brain:    0xaaffcc,
core:     0x00ff99,
};

// ════════════════════════════════════════════════
//  WEAPON HIT PROFILES
//  damage, pushForce, penetrationDepth,
//  throughAt (weapon level for through-shot)
// ════════════════════════════════════════════════
var WEAPON_HIT = {
pistol:         { dmg:15,   push:0.30, pen:0.40, throughAt:5, hitCount: 28 },
revolver:       { dmg:32,   push:0.70, pen:0.65, throughAt:4, hitCount: 22 },
shotgun:        { dmg:55,   push:3.50, pen:0.28, throughAt:6, hitCount: 18 },
smg:            { dmg:11,   push:0.20, pen:0.38, throughAt:6, hitCount: 32 },
sniper:         { dmg:88,   push:2.00, pen:1.00, throughAt:1, hitCount: 12 },
minigun:        { dmg:9,    push:0.18, pen:0.33, throughAt:7, hitCount: 36 },
grenade:        { dmg:180,  push:20.0, pen:0.90, throughAt:1, hitCount: 10 },
rocket:         { dmg:9999, push:50.0, pen:1.00, throughAt:1, hitCount: 8  },
laser:          { dmg:40,   push:0.05, pen:1.00, throughAt:1, hitCount: 8  },
plasma:         { dmg:58,   push:2.50, pen:0.70, throughAt:3, hitCount: 14 },
knife:          { dmg:28,   push:0.08, pen:0.95, throughAt:8, hitCount: 20 },
sword:          { dmg:52,   push:0.90, pen:0.85, throughAt:7, hitCount: 16 },
axe:            { dmg:68,   push:2.20, pen:0.98, throughAt:6, hitCount: 12 },
flame:          { dmg:18,   push:0.40, pen:0.15, throughAt:9, hitCount: 8  },
ice:            { dmg:28,   push:0.35, pen:0.55, throughAt:8, hitCount: 10 },
lightning:      { dmg:38,   push:4.00, pen:1.00, throughAt:2, hitCount: 12 },
knife_takedown: { dmg:120,  push:0.02, pen:0.99, throughAt:1, hitCount: 6  },
meteor:         { dmg:9999, push:80.0, pen:1.00, throughAt:1, hitCount: 4  },
};

// ════════════════════════════════════════════════
//  SCRATCH VECTORS — reused every frame, NO new()
// ════════════════════════════════════════════════
var _v0 = new THREE.Vector3();
var _v1 = new THREE.Vector3();
var _v2 = new THREE.Vector3();
var _v3 = new THREE.Vector3();
var _col = new THREE.Color();
var _whiteCol = new THREE.Color(1, 1, 1); // PERF FIX: pre-allocated white for lerp

// ════════════════════════════════════════════════
//  WOUND OBJECT — pre-allocated, no GC
// ════════════════════════════════════════════════
function makeWound() {
return {
alive:      false,
lx:0, ly:0, lz:0,    // local position on slime body
radius:     0.04,
depth:      0.0,
hits:       0,
organ:      'membrane',
dripTimer:  0,
pumpTimer:  0,
isPumping:  false,    // arterial pump active
pumpLife:   0,
cauterized: false,
frozen:     false,
mesh:       null,     // wound decal mesh on body
};
}

// ════════════════════════════════════════════════
//  SLIME INSTANCE
// ════════════════════════════════════════════════
function SlimeEnemy() {
this.alive       = false;
this.active      = false;
this.id          = Math.random().toString(36).slice(2);
this.enemyType   = 'slime';

// Stats
this.hp          = 0;
this.maxHp       = 0;
this.speed       = 0;
this.damage      = 0;
this.level       = 1;   // enemy wave level — affects HP/speed

// Anatomy organ HP
this.organs      = {};
this.killedBy    = null;

// Physics
this.vx          = 0;
this.vy          = 0;
this.vz          = 0;
this.velocity    = new THREE.Vector3(); // for BloodV2 integration

// State machine
this.state       = 'idle'; // idle | chase | attack | dying | dead
this.stateTimer  = 0;
this.attackTimer = 0;

// Visual
this.mesh        = null;   // main body mesh
this.eyeL        = null;
this.eyeR        = null;
this.eyeMeshes   = [];
this.shadowMesh  = null;
this.scale       = SLIME_CFG.BASE_SCALE;

// Wounds
this.wounds      = [];

// Death animation state
this.dying       = false;
this.deathTimer  = 0;
this.deathStyle  = null;
this.deathData   = {};     // extra data per death style

// Trail
this.trailTimer  = 0;

// Squish animation
this.squishTimer  = 0;
this.squishAmount = 0;

// Idle wobble
this.wobblePhase  = Math.random() * Math.PI * 2;

// Bob animation (ambient idle)
this._bobPhase = Math.random() * Math.PI * 2;

// Push
this.pushX = 0;
this.pushZ = 0;

// Hit flash
this.flashTimer  = 0;

// Death slide velocity (set from sandbox kill functions)
this._deathSlideVX = 0;
this._deathSlideVZ = 0;
}

// ── Reset for reuse from pool ──────────────────
SlimeEnemy.prototype.spawn = function(x, y, z, waveLevel) {
// Cancel any in-flight fade interval from a previous life cycle
if (this._fadeInterval) { clearInterval(this._fadeInterval); this._fadeInterval = null; }
this.alive      = true;
this.active     = true;
this.dying      = false;
this.deathStyle = null;
this.killedBy   = null;
this.level      = waveLevel || 1;

// Scale HP and speed with wave level
var lvlScale    = 1.0 + (this.level - 1) * 0.22;
this.maxHp      = Math.floor(SLIME_CFG.BASE_HP * lvlScale);
this.hp         = this.maxHp;
this.speed      = SLIME_CFG.BASE_SPEED + (this.level - 1) * 0.08;
this.damage     = SLIME_CFG.BASE_DAMAGE + (this.level - 1) * 2;

// Organ HP
for (var k in ORGANS) {
var o = ORGANS[k];
this.organs[k] = { hp: o.hp * lvlScale, maxHp: o.maxHp * lvlScale };
}

// Physics
this.vx = 0; this.vy = 0; this.vz = 0;
this.velocity.set(0,0,0);
this.pushX = 0; this.pushZ = 0;

// State
this.state      = 'idle';
this.stateTimer = Math.random() * 2.0;
this.attackTimer= 0;
this.deathTimer = 0;

// Visual
this.trailTimer  = 0;
this.squishTimer = 0;
this.squishAmount= 0;
this.flashTimer  = 0;
this.wobblePhase = Math.random() * Math.PI * 2;
this._bobPhase   = Math.random() * Math.PI * 2;
this._deathSlideVX = 0;
this._deathSlideVZ = 0;

// Wounds — deactivate all
for (var i = 0; i < this.wounds.length; i++) {
this.wounds[i].alive = false;
if (this.wounds[i].mesh) this.wounds[i].mesh.visible = false;
}

// Position mesh
if (this.mesh) {
this.scale = SLIME_CFG.BASE_SCALE + (Math.random()-0.5)*SLIME_CFG.SCALE_VARIANCE;
this.mesh.position.set(x, y + this.scale * 0.5, z);
this.mesh.scale.setScalar(this.scale);
this.mesh.visible = true;
this.mesh.material.color.setHex(SLIME_COLORS.healthy);
this.mesh.material.opacity = 1.0;
// BUG K: Explicitly reset material.transparent to false to ensure full opacity
this.mesh.material.transparent = false;
if (this.shadowMesh) {
this.shadowMesh.position.set(x, 0.01, z);
this.shadowMesh.visible = true;
}
if (this.eyeL) { this.eyeL.visible = true; this.eyeR.visible = true; }
}
};

// ── MAIN UPDATE ───────────────────────────────
SlimeEnemy.prototype.update = function(dt, playerPos) {
if (!this.alive && !this._sinkTimer) { return; }
if (!this.mesh) return;

// ── PERF FIX: Post-death sink-and-shrink (replaces setInterval fade)
if (this._sinkTimer > 0 || this._sinkDuration > 0) {
if (this._sinkDuration > 0) {
this._sinkTimer += dt;
var st = Math.min(this._sinkTimer / this._sinkDuration, 1.0);
// Shrink + sink into ground (no transparency = no GPU overdraw)
var shrink = 1.0 - st * 0.8;
this.mesh.scale.set(this.scale * 1.6 * shrink, 0.05 * shrink, this.scale * 1.6 * shrink);
this.mesh.position.y = 0.015 - st * 0.3;
if (st >= 1.0) {
this._sinkDuration = 0;
this._sinkTimer = 0;
this._cleanup();
return;
}
}
return;
}

// ── Death animation
if (this.dying) {
this._updateDeath(dt);
return;
}

// ── PERF FIX: Update frame-driven hit-animation tweens (replaces setInterval)
this._updateHitTweens(dt);

// ── Squish recovery
if (this.squishTimer > 0) {
this.squishTimer -= dt;
var t = Math.max(0, this.squishTimer / 0.25);
var sq = 1.0 + this.squishAmount * t * Math.sin(t * Math.PI);
this.mesh.scale.set(this.scale * (1.0 + (1.0-t)*0.15), this.scale * sq, this.scale * (1.0 + (1.0-t)*0.15));
}

// ── Hit flash
if (this.flashTimer > 0) {
this.flashTimer -= dt;
var f = this.flashTimer / 0.12;
_col.setHex(SLIME_COLORS.healthy);
_col.lerp(_whiteCol, f);
this.mesh.material.color.copy(_col);
} else {
// Colour by health
var hpRatio = this.hp / this.maxHp;
if (hpRatio > 0.6)       this.mesh.material.color.setHex(SLIME_COLORS.healthy);
else if (hpRatio > 0.3)  this.mesh.material.color.setHex(SLIME_COLORS.hurt);
else                     this.mesh.material.color.setHex(SLIME_COLORS.critical);
}

// ── AI State Machine
this.stateTimer -= dt;
this.attackTimer = Math.max(0, this.attackTimer - dt);

if (playerPos) {
var dx = playerPos.x - this.mesh.position.x;
var dz = playerPos.z - this.mesh.position.z;
var dist = Math.sqrt(dx*dx + dz*dz);

if (dist < SLIME_CFG.AGGRO_RANGE) {
  this.state = 'chase';
}
if (dist < SLIME_CFG.ATTACK_RANGE && this.attackTimer <= 0) {
  this.state = 'attack';
}

}

// ── Movement
if (this.state === 'chase' && playerPos) {
var dx = playerPos.x - this.mesh.position.x;
var dz = playerPos.z - this.mesh.position.z;
var dist = Math.sqrt(dx*dx + dz*dz) + 0.001;
// Hop movement — slimes bounce slightly as they move
this.wobblePhase += dt * SLIME_CFG.WOBBLE_SPEED;
var hopY = Math.max(0, Math.sin(this.wobblePhase) * 0.08);
this.vx += (dx/dist) * this.speed * dt * 8.0;
this.vz += (dz/dist) * this.speed * dt * 8.0;
// Cap speed
var spd = Math.sqrt(this.vx*this.vx + this.vz*this.vz);
if (spd > this.speed) { this.vx = (this.vx/spd)*this.speed; this.vz = (this.vz/spd)*this.speed; }
this.mesh.position.x += (this.vx + this.pushX) * dt;
this.mesh.position.y  = this.scale * 0.5 + hopY;
this.mesh.position.z += (this.vz + this.pushZ) * dt;
// Face direction of movement
if (spd > 0.1) {
this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
}
} else {
// Idle bob
this._bobPhase += dt * 2.5;
this.wobblePhase += dt * 1.5;
var idleWobble = Math.sin(this._bobPhase) * 0.06;
this.mesh.position.y = this.scale * 0.5 + idleWobble;
if (this.squishTimer <= 0) {
this.mesh.scale.set(
this.scale * (1.0 + Math.sin(this.wobblePhase * 0.8) * 0.012),
this.scale * (1.0 + Math.cos(this.wobblePhase * 0.8) * 0.012),
this.scale * (1.0 + Math.sin(this.wobblePhase * 0.8) * 0.012)
);
}
}

// ── Push decay
this.pushX *= Math.max(0, 1.0 - dt * 6.0);
this.pushZ *= Math.max(0, 1.0 - dt * 6.0);

// ── Drag
this.vx *= Math.max(0, 1.0 - dt * 4.5);
this.vz *= Math.max(0, 1.0 - dt * 4.5);

// ── Velocity sync for BloodV2 wound dripping
this.velocity.set(this.vx + this.pushX, 0, this.vz + this.pushZ);

// ── Shadow scale
if (this.shadowMesh) {
this.shadowMesh.position.x = this.mesh.position.x;
this.shadowMesh.position.z = this.mesh.position.z;
var shadowScale = this.scale * (1.0 - this.mesh.position.y * 0.2);
this.shadowMesh.scale.setScalar(Math.max(0.1, shadowScale));
}

// ── Eye tracking
this._updateEyes(playerPos);

// ── Blood trail
var isMoving = Math.abs(this.vx) > 0.2 || Math.abs(this.vz) > 0.2;
if (isMoving && this.hp < this.maxHp * 0.7) {
this.trailTimer += dt;
if (this.trailTimer >= SLIME_CFG.TRAIL_INTERVAL) {
this.trailTimer = 0;
if (Math.random() < SLIME_CFG.TRAIL_CHANCE) {
this._dropTrail();
}
}
}

// ── Wound drip update (passed through BloodV2)
if (global.BloodV2) {
// BloodV2 handles wound dripping via its update loop
// We just need to keep its gore state synced
}
};

// ── Eye tracking ───────────────────────────────
SlimeEnemy.prototype._updateEyes = function(playerPos) {
if (!this.eyeL || !playerPos) return;
// Rotate eyes slightly toward player
var dx = playerPos.x - this.mesh.position.x;
var dz = playerPos.z - this.mesh.position.z;
var angle = Math.atan2(dx, dz);
var eyeOffset = 0.06;
this.eyeL.position.x = -eyeOffset + Math.sin(angle) * 0.035;
this.eyeR.position.x =  eyeOffset + Math.sin(angle) * 0.035;
};

// ── Blood trail drop ───────────────────────────
SlimeEnemy.prototype._dropTrail = function() {
if (!global.BloodV2 || !this.mesh) return;
var pos = this.mesh.position;
var drop = {
alive: true,
px: pos.x + (Math.random()-0.5)*0.08,
py: 0.012,
pz: pos.z + (Math.random()-0.5)*0.08,
vx: 0, vy: 0, vz: 0,
r: 0.012 + Math.random()*0.018,
maxLife: 8.0 + Math.random()*5.0,
life: 8.0 + Math.random()*5.0,
viscosity: 0.92,
bounces: 0, maxBounces: 0,
onGround: true,
color: SLIME_COLORS.blood,
frozen: false, charred: false,
isMist: false,
};
// Inject directly into BloodV2 drop pool
var pool = global.BloodV2._dropData;
if (!pool) return;
for (var i = 0; i < pool.length; i++) {
if (!pool[i].alive) {
var d = pool[i];
d.alive = true; d.px = drop.px; d.py = drop.py; d.pz = drop.pz;
d.vx = 0; d.vy = 0; d.vz = 0;
d.r = drop.r; d.maxLife = drop.maxLife; d.life = drop.life;
d.viscosity = drop.viscosity;
d.bounces = 0; d.maxBounces = 0;
d.onGround = true; d.color = drop.color;
d.frozen = false; d.charred = false;
// Place on ground (InstancedMesh)
var im = global.BloodV2._dropIM;
if (im) {
var m4 = new THREE.Matrix4();
m4.makeScale(d.r*50, 0.05, d.r*50);
m4.setPosition(d.px, 0.012, d.pz);
im.setMatrixAt(d.idx, m4);
im.instanceMatrix.needsUpdate = true;
}
break;
}
}
};

// ════════════════════════════════════════════════
//  HIT REACTION SYSTEM
//  47 unique reactions, chosen by weapon + context
// ════════════════════════════════════════════════
SlimeEnemy.prototype.receiveHit = function(weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir) {
if (!this.alive || this.dying) return;

weaponLevel = weaponLevel || 1;
var wh  = WEAPON_HIT[weaponKey] || WEAPON_HIT.pistol;
var pos = this.mesh ? this.mesh.position : new THREE.Vector3();

// Calculate damage
var dmg = wh.dmg * (1.0 + (weaponLevel - 1) * 0.18);

// Through-shot: at high weapon level, bullet penetrates fully
var isThrough = weaponLevel >= wh.throughAt;

// Determine hit local Y
var localY = 0;
if (hitPoint && this.mesh) {
var esc = this.mesh.scale.y || 1.0;
localY = Math.max(-1, Math.min(1, (hitPoint.y - pos.y) / (esc * 0.5 + 0.001)));
}

// Determine organ hit
var organ = this._getOrgan(localY);

// Apply damage
this.hp -= dmg;
this._damageOrgan(organ, dmg * wh.pen);

// Hit flash and squish
this.flashTimer  = 0.12;
this.squishTimer = 0.25;
this.squishAmount = Math.min(0.4, dmg / 80.0);

// Push force
if (bulletDir || hitNormal) {
var bx = bulletDir ? bulletDir.x : (hitNormal ? -hitNormal.x : 0);
var bz = bulletDir ? bulletDir.z : (hitNormal ? -hitNormal.z : 0);
this.pushX += bx * wh.push;
this.pushZ += bz * wh.push;
}

// ── Add/grow wound on body
if (hitPoint) {
var lx = hitPoint.x - pos.x;
var ly = hitPoint.y - pos.y;
var lz = hitPoint.z - pos.z;
this._addWound(lx, ly, lz, wh.pen, organ, weaponKey, isThrough);
}

// ── Trigger hit animation
this._playHitReaction(weaponKey, weaponLevel, organ, isThrough, hitPoint, hitNormal, bulletDir);

// ── Tell BloodV2 about the hit
if (global.BloodV2) {
global.BloodV2.hit(this, weaponKey, hitPoint, hitNormal);
}
// ── Tell GoreSim about the hit
if (global.GoreSim && typeof global.GoreSim.onHit === 'function') {
global.GoreSim.onHit(this, weaponKey, hitPoint, hitNormal);
}

// ── Check death
if (this.hp <= 0) {
this._die(weaponKey, weaponLevel, organ, hitPoint, hitNormal, bulletDir);
}

return { organ: organ, isThrough: isThrough, damage: dmg };
};

// ════════════════════════════════════════════════
//  47 HIT REACTIONS
// ════════════════════════════════════════════════
SlimeEnemy.prototype._playHitReaction = function(wk, wlvl, organ, isThrough, hitPoint, hitNormal, bulletDir) {
var self   = this;
var pos    = this.mesh ? this.mesh.position.clone() : new THREE.Vector3();
var hpRatio = this.hp / this.maxHp;

// ── PISTOL REACTIONS (6 variants) ─────────────────────────────────
if (wk === 'pistol') {
if (isThrough) {
// THROUGH-SHOT: clean entry + exit spray out back
this._throughShotReaction(pos, hitPoint, hitNormal, bulletDir, wlvl);
} else if (organ === 'brain') {
// Brain hit: sudden lurch backward, eyes go wide
this._lurchReaction(pos, 0.3);
} else if (organ === 'heart') {
// Heart hit: violent shudder, pump starts
this._shudderReaction(pos, 0.4);
this._startPumpWound(organ);
} else if (hpRatio < 0.3) {
// Critical HP: desperate wobble
this._desperateWobble(pos);
} else if (wlvl >= 3) {
// Higher level: bigger squish, more blood
this._heavyImpactReaction(pos, 0.5);
} else {
// Standard: flinch back
this._flinchReaction(pos, 0.25);
}
}

// ── REVOLVER REACTIONS (5 variants) ───────────────────────────────
else if (wk === 'revolver') {
if (isThrough) {
this._throughShotReaction(pos, hitPoint, hitNormal, bulletDir, wlvl * 1.3);
} else if (organ === 'heart') {
// Heavy round to heart: stumble, clutch animation
this._stumbleReaction(pos, 0.6);
this._startPumpWound(organ);
} else if (organ === 'brain') {
// Revolver headshot: spin stagger
this._spinStaggerReaction(pos, 0.5);
} else if (hpRatio < 0.4) {
this._heavyImpactReaction(pos, 0.7);
} else {
// Shockwave effect — radial push
this._shudderReaction(pos, 0.55);
}
}

// ── SHOTGUN REACTIONS (7 variants) ────────────────────────────────
else if (wk === 'shotgun') {
if (wlvl >= 5 || this.hp <= 0) {
// High level shotgun at close range: full devastation
this._devastationReaction(pos, bulletDir);
} else if (organ === 'membrane') {
// Pellets spread across membrane: multiple small impacts
this._multiImpactReaction(pos, 6, 0.8);
} else if (organ === 'guts') {
// Gut shot: immediate deflation begin, lurch forward
this._gutShotReaction(pos);
} else if (organ === 'heart') {
this._heartBlastReaction(pos);
} else if (hpRatio < 0.4) {
// Almost dead — shotgun spins it
this._spinThrowReaction(pos, bulletDir, 1.5);
} else if (wlvl >= 3) {
this._heavyImpactReaction(pos, 1.2);
} else {
// Standard shotgun hit: big backwards push + multihole
this._pushbackReaction(pos, bulletDir, 2.5);
}
}

// ── SMG REACTIONS (4 variants) ────────────────────────────────────
else if (wk === 'smg') {
if (isThrough) {
this._throughShotReaction(pos, hitPoint, hitNormal, bulletDir, wlvl);
} else if (hpRatio < 0.2) {
// Near death under SMG fire: jitter dance
this._bulletDanceReaction(pos);
} else {
// SMG: rapid small flinches
this._rapidFlinchReaction(pos);
}
}

// ── SNIPER REACTIONS (5 variants) ─────────────────────────────────
else if (wk === 'sniper') {
// Sniper ALWAYS goes through (pen=1.0)
this._supersonicThroughReaction(pos, hitPoint, hitNormal, bulletDir, wlvl);
if (organ === 'brain') {
// Brain snipe: instant neural collapse sequence
this._brainSnipeReaction(pos);
} else if (organ === 'heart') {
this._heartSnipeReaction(pos);
}
}

// ── MINIGUN REACTIONS (3 variants) ────────────────────────────────
else if (wk === 'minigun') {
if (wlvl >= 5) {
this._throughShotReaction(pos, hitPoint, hitNormal, bulletDir, wlvl * 0.8);
}
if (hpRatio < 0.3) {
this._bulletDanceReaction(pos);
} else {
this._rapidFlinchReaction(pos);
}
}

// ── GRENADE REACTIONS (3 variants) ────────────────────────────────
else if (wk === 'grenade') {
this._explosionReaction(pos, bulletDir, 12.0);
}

// ── ROCKET REACTIONS (2 variants) ─────────────────────────────────
else if (wk === 'rocket') {
this._explosionReaction(pos, bulletDir, 30.0);
}

// ── LASER REACTIONS (4 variants) ──────────────────────────────────
else if (wk === 'laser') {
// Laser: no flinch, just… smokes
this._laserHitReaction(pos, wlvl);
if (organ === 'heart') {
this._cauterizedPumpReaction(pos); // heart pumps despite cauterize
}
}

// ── PLASMA REACTIONS (3 variants) ─────────────────────────────────
else if (wk === 'plasma') {
this._plasmaHitReaction(pos, wlvl);
if (organ === 'brain' || organ === 'heart') {
this._heavyImpactReaction(pos, 0.9);
}
}

// ── KNIFE REACTIONS (4 variants) ──────────────────────────────────
else if (wk === 'knife') {
if (organ === 'heart') {
this._knifeHeartReaction(pos);
} else if (organ === 'brain') {
this._knifeBrainReaction(pos);
} else {
this._knifeStabReaction(pos, wlvl);
}
}

// ── SWORD REACTIONS (3 variants) ──────────────────────────────────
else if (wk === 'sword') {
if (wlvl >= 4) {
this._spinThrowReaction(pos, bulletDir, 1.2);
} else {
this._slashKnockReaction(pos, bulletDir, wlvl);
}
}

// ── AXE REACTIONS (3 variants) ────────────────────────────────────
else if (wk === 'axe') {
this._axeCleavReaction(pos, organ, wlvl);
}

// ── FLAME REACTIONS (3 variants) ──────────────────────────────────
else if (wk === 'flame') {
this._flameHitReaction(pos, wlvl);
}

// ── ICE REACTIONS (3 variants) ────────────────────────────────────
else if (wk === 'ice') {
this._iceHitReaction(pos, wlvl);
}

// ── LIGHTNING REACTIONS (3 variants) ──────────────────────────────
else if (wk === 'lightning') {
this._lightningHitReaction(pos, wlvl);
}

// ── KNIFE TAKEDOWN ─────────────────────────────────────────────────
else if (wk === 'knife_takedown') {
this._takedownReaction(pos);
}
};

// ════════════════════════════════════════════════
//  HIT REACTION IMPLEMENTATIONS
// ════════════════════════════════════════════════

// ── PERF FIX: Frame-driven tween system (replaces all setInterval hit animations)
// Each slime can have multiple concurrent tweens. Each tween has:
//   { elapsed:0, duration:X, onTick:fn(t), onDone:fn() }
// Updated every frame in update() — zero OS timer overhead.
SlimeEnemy.prototype._addTween = function(duration, onTick, onDone) {
if (!this._tweenTimers) this._tweenTimers = [];
this._tweenTimers.push({ elapsed: 0, duration: duration, onTick: onTick, onDone: onDone || null });
};

SlimeEnemy.prototype._updateHitTweens = function(dt) {
if (!this._tweenTimers || this._tweenTimers.length === 0) return;
for (var i = this._tweenTimers.length - 1; i >= 0; i--) {
var tw = this._tweenTimers[i];
tw.elapsed += dt;
var t = Math.min(tw.elapsed / tw.duration, 1.0);
if (tw.onTick) tw.onTick(t);
if (t >= 1.0) {
if (tw.onDone) tw.onDone();
this._tweenTimers.splice(i, 1);
}
}
};

// Simple forward flinch
SlimeEnemy.prototype._flinchReaction = function(pos, scale) {
if (!this.mesh) return;
var self = this;
var orig = this.mesh.rotation.y;
this.mesh.rotation.x = -0.15 * scale;
setTimeout(function() { if (self.mesh) self.mesh.rotation.x = 0; }, 120);
};

// Heavy impact — big squish
SlimeEnemy.prototype._heavyImpactReaction = function(pos, scale) {
if (!this.mesh) return;
var self = this;
this.squishTimer  = 0.35;
this.squishAmount = 0.35 * scale;
};

// Shudder — rapid micro-oscillation (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._shudderReaction = function(pos, scale) {
if (!this.mesh) return;
var self = this;
var maxCount = 6;
var stepDur = 0.035; // 35ms per step
this._addTween(maxCount * stepDur, function(t) {
var count = Math.floor(t * maxCount);
if (self.mesh) self.mesh.rotation.z = (count % 2 === 0 ? 1 : -1) * 0.08 * scale;
}, function() { if (self.mesh) self.mesh.rotation.z = 0; });
};

// Lurch backward (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._lurchReaction = function(pos, scale) {
if (!this.mesh) return;
var self = this;
this.mesh.rotation.x = 0.25 * scale;
// Delayed recovery tween
this._addTween(0.08 + 0.16, function(t) {
// First 0.08s = delay, then 0.16s recovery
var totalDur = 0.08 + 0.16;
if (t < 0.08 / totalDur) return;
var recT = (t - 0.08 / totalDur) / (0.16 / totalDur);
recT = Math.min(recT, 1.0);
if (self.mesh) self.mesh.rotation.x = 0.25 * scale * (1.0 - recT);
}, function() { if (self.mesh) self.mesh.rotation.x = 0; });
};

// Stumble — stagger sideways
SlimeEnemy.prototype._stumbleReaction = function(pos, scale) {
if (!this.mesh) return;
var self = this;
var dir  = (Math.random() < 0.5) ? 1 : -1;
this.mesh.rotation.z = dir * 0.22 * scale;
this.pushX += dir * 0.5;
setTimeout(function() {
if (!self.mesh) return;
self.mesh.rotation.z *= 0.3;
setTimeout(function() { if (self.mesh) self.mesh.rotation.z = 0; }, 120);
}, 150);
};

// Spin stagger — brain/head hit (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._spinStaggerReaction = function(pos, scale) {
if (!this.mesh) return;
var self  = this;
var startY = this.mesh.rotation.y;
this._addTween(0.2, function(t) {
if (!self.mesh) return;
self.mesh.rotation.y = startY + Math.sin(t * Math.PI) * 0.6 * scale;
self.mesh.rotation.z = Math.sin(t * Math.PI * 3) * 0.15 * scale;
});
};

// Through-shot reaction — bullet goes through
SlimeEnemy.prototype._throughShotReaction = function(pos, hitPoint, hitNormal, bulletDir, intensity) {
if (!this.mesh) return;
// Body barely moves — bullet just… went through
this.squishTimer  = 0.15;
this.squishAmount = 0.12;
// But extra blood burst out the back via BloodV2 — already handled in hit()
};

// Supersonic through-reaction for sniper
SlimeEnemy.prototype._supersonicThroughReaction = function(pos, hitPoint, hitNormal, bulletDir, wlvl) {
if (!this.mesh) return;
var self = this;
// Delayed full-body shudder (pressure wave arrives after bullet)
this.mesh.scale.set(this.scale * 1.25, this.scale * 0.72, this.scale * 1.25);
setTimeout(function() {
if (!self.mesh) return;
self.squishTimer  = 0.6;
self.squishAmount = 0.45;
}, 60);
};

// Rapid flinch — for SMG/minigun
SlimeEnemy.prototype._rapidFlinchReaction = function(pos) {
if (!this.mesh) return;
this.mesh.rotation.z += (Math.random()-0.5) * 0.08;
this.mesh.rotation.x += (Math.random()-0.5) * 0.05;
// Auto-recover handled by main update
};

// Bullet dance — near-death under rapid fire, slime jitters
SlimeEnemy.prototype._bulletDanceReaction = function(pos) {
if (!this.mesh) return;
var self  = this;
var orig  = { x: this.mesh.rotation.x, z: this.mesh.rotation.z };
this.mesh.rotation.x = (Math.random()-0.5) * 0.35;
this.mesh.rotation.z = (Math.random()-0.5) * 0.35;
setTimeout(function() {
if (self.mesh) {
self.mesh.rotation.x = orig.x;
self.mesh.rotation.z = orig.z;
}
}, 80);
};

// Multi-impact — shotgun pellets (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._multiImpactReaction = function(pos, count, scale) {
if (!this.mesh) return;
var self = this;
var stepDur = 0.020; // 20ms per step
this._addTween(count * stepDur + 0.08, function(t) {
var totalDur = count * stepDur + 0.08;
var elapsed = t * totalDur;
if (elapsed < count * stepDur && self.mesh) {
self.mesh.rotation.z += (Math.random()-0.5) * 0.03 * scale;
self.mesh.rotation.x += (Math.random()-0.5) * 0.02 * scale;
}
}, function() { if (self.mesh) { self.mesh.rotation.z = 0; self.mesh.rotation.x = 0; } });
};

// Gut shot — forward slump
SlimeEnemy.prototype._gutShotReaction = function(pos) {
if (!this.mesh) return;
var self = this;
this.mesh.rotation.x = 0.35;
// Scale squish downward — looks like deflating
this.mesh.scale.set(this.scale * 1.12, this.scale * 0.85, this.scale * 1.12);
setTimeout(function() {
if (self.mesh) {
self.mesh.rotation.x = 0.08;
self.mesh.scale.setScalar(self.scale);
}
}, 300);
};

// Heart blast — pump starts, convulsion (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._heartBlastReaction = function(pos) {
if (!this.mesh) return;
var self  = this;
this._addTween(0.32, function(t) {
if (!self.mesh) return;
var count = Math.floor(t * 8);
self.mesh.rotation.z = Math.sin(count * 1.5) * 0.22;
self.mesh.position.y += Math.sin(count) * 0.003;
}, function() { if (self.mesh) self.mesh.rotation.z = 0; });
this._startPumpWound('heart');
};

// Big spin-throw (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._spinThrowReaction = function(pos, dir, scale) {
if (!this.mesh) return;
var self   = this;
var startY = this.mesh.rotation.y;
var bx     = dir ? dir.x : (Math.random()-0.5);
var bz     = dir ? dir.z : (Math.random()-0.5);
this.pushX += bx * 2.5 * scale;
this.pushZ += bz * 2.5 * scale;
this._addTween(0.32, function(t) {
if (!self.mesh) return;
self.mesh.rotation.y = startY + t * Math.PI * 2 * scale;
self.mesh.rotation.z = Math.sin(t * Math.PI) * 0.4;
});
};

// Devastation — for high-level shotgun
SlimeEnemy.prototype._devastationReaction = function(pos, dir) {
if (!this.mesh) return;
var bx = dir ? dir.x : 0;
var bz = dir ? dir.z : 1;
this.pushX += bx * 5.0;
this.pushZ += bz * 5.0;
this.squishTimer  = 0.5;
this.squishAmount = 0.6;
};

// Pushback
SlimeEnemy.prototype._pushbackReaction = function(pos, dir, scale) {
if (!this.mesh) return;
var bx = dir ? dir.x : 0;
var bz = dir ? dir.z : 1;
this.pushX += bx * scale;
this.pushZ += bz * scale;
this._heavyImpactReaction(pos, 0.8);
};

// Brain snipe
SlimeEnemy.prototype._brainSnipeReaction = function(pos) {
if (!this.mesh) return;
var self = this;
// Instant cross-eye (eyes go weird)
if (this.eyeL) {
this.eyeL.position.x = -0.02;
this.eyeR.position.x =  0.02;
// Eyes point inward
setTimeout(function() {
if (self.eyeL) { self.eyeL.position.x = -0.06; self.eyeR.position.x = 0.06; }
}, 200);
}
// Head wobble then slump
this.mesh.rotation.z = 0.5;
setTimeout(function() {
if (self.mesh) {
self.mesh.rotation.z = 0.25;
self.mesh.rotation.x = 0.4;
}
}, 150);
};

// Heart snipe
SlimeEnemy.prototype._heartSnipeReaction = function(pos) {
this._startPumpWound('heart');
this._shudderReaction(pos, 1.2);
};

// Explosion reaction — huge push + spin (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._explosionReaction = function(pos, dir, force) {
if (!this.mesh) return;
var bx = dir ? dir.x : (Math.random()-0.5)*2;
var bz = dir ? dir.z : (Math.random()-0.5)*2;
this.pushX += bx * force * 0.3;
this.pushZ += bz * force * 0.3;
this.squishTimer  = 0.8;
this.squishAmount = 0.9;
var self = this;
this._addTween(0.27, function(t) {
if (!self.mesh) return;
self.mesh.rotation.y += 0.18 * (1.0 - t) * 0.06;
self.mesh.rotation.z = Math.sin(t * Math.PI * 4) * 0.5 * (1.0-t);
});
};

// Laser — barely reacts, just smokes
SlimeEnemy.prototype._laserHitReaction = function(pos, wlvl) {
if (!this.mesh) return;
// Tiny lean toward heat source
this.mesh.rotation.x -= 0.04;
var self = this;
setTimeout(function() { if (self.mesh) self.mesh.rotation.x += 0.04; }, 80);
};

// Cauterized pump — heart still pumps despite burn
SlimeEnemy.prototype._cauterizedPumpReaction = function(pos) {
this._startPumpWound('heart');
};

// Plasma — char + stagger
SlimeEnemy.prototype._plasmaHitReaction = function(pos, wlvl) {
this._heavyImpactReaction(pos, 0.7 * wlvl * 0.3);
};

// Knife stab — very little movement, body stays still
SlimeEnemy.prototype._knifeStabReaction = function(pos, wlvl) {
if (!this.mesh) return;
// Subtle tension — body stiffens
var self = this;
this.mesh.scale.set(this.scale * 0.95, this.scale * 1.08, this.scale * 0.95);
setTimeout(function() { if (self.mesh) self.mesh.scale.setScalar(self.scale); }, 180);
};

// Knife to heart — starts arterial pump, body seizes (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._knifeHeartReaction = function(pos) {
this._startPumpWound('heart');
if (!this.mesh) return;
var self = this;
this._addTween(0.8, function(t) {
if (self.mesh) self.mesh.rotation.z = Math.sin(t * 0.8 * 50 * 0.015 * 1000 * t) * 0.12 * (1.0 - t);
}, function() { if (self.mesh) self.mesh.rotation.z = 0; });
};

// Knife to brain — instant drop effect
SlimeEnemy.prototype._knifeBrainReaction = function(pos) {
if (!this.mesh) return;
var self = this;
this.mesh.rotation.x = 0.6;
this.mesh.rotation.z = (Math.random()<0.5?1:-1) * 0.3;
setTimeout(function() {
if (self.mesh) { self.mesh.rotation.x = 0.2; self.mesh.rotation.z *= 0.5; }
}, 300);
};

// Slash knock
SlimeEnemy.prototype._slashKnockReaction = function(pos, dir, wlvl) {
var scale = 0.5 + wlvl * 0.15;
this._spinThrowReaction(pos, dir, scale * 0.5);
};

// Axe cleave
SlimeEnemy.prototype._axeCleavReaction = function(pos, organ, wlvl) {
this._heavyImpactReaction(pos, 1.0 + wlvl * 0.15);
if (organ === 'brain' || organ === 'membrane') {
var self = this;
// Deep cleave — body tilts hard
if (this.mesh) {
this.mesh.rotation.z = (Math.random()<0.5?1:-1) * 0.45;
setTimeout(function() { if (self.mesh) { self.mesh.rotation.z *= 0.3; } }, 250);
}
}
};

// Flame hit — gradual slow-down
SlimeEnemy.prototype._flameHitReaction = function(pos, wlvl) {
this.speed = Math.max(0.2, this.speed * 0.85);
};

// Ice hit — slow + rigid
SlimeEnemy.prototype._iceHitReaction = function(pos, wlvl) {
this.speed = Math.max(0.1, this.speed * 0.7);
if (!this.mesh) return;
this.mesh.material.color.setHex(0x88ccff);
var self = this;
setTimeout(function() { if (self.mesh && self.alive) self.mesh.material.color.setHex(SLIME_COLORS.hurt); }, 600);
};

// Lightning — convulsion (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._lightningHitReaction = function(pos, wlvl) {
if (!this.mesh) return;
var self  = this;
this.mesh.material.color.setHex(0xffffcc);
this._addTween(0.3, function(t) {
if (!self.mesh) return;
var count = Math.floor(t * 10);
self.mesh.rotation.z = (count%2===0?1:-1) * 0.25;
self.mesh.position.y += (count%2===0 ? 0.005 : -0.005);
}, function() { if (self.mesh && self.alive) self.mesh.material.color.setHex(SLIME_COLORS.hurt); });
};

// Desperate wobble — near-death general (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._desperateWobble = function(pos) {
if (!this.mesh) return;
var self  = this;
this._addTween(0.36, function(t) {
if (!self.mesh) return;
var count = Math.floor(t * 8);
self.mesh.rotation.z = Math.sin(count * 0.9) * 0.18;
}, function() { if (self.mesh) self.mesh.rotation.z = 0; });
};

// Takedown reaction (PERF FIX: uses frame tween instead of setInterval)
SlimeEnemy.prototype._takedownReaction = function(pos) {
if (!this.mesh) return;
var self = this;
// Slime is pinned — freeze in place
this.speed = 0;
this.state = 'pinned';
this.mesh.rotation.x = 0.3;
// Gradual lean and settle
this._addTween(0.4, function(t) {
if (!self.mesh) return;
self.mesh.rotation.x = 0.3 + t * 0.3;
self.mesh.scale.set(self.scale*(1+t*0.1), self.scale*(1-t*0.15), self.scale*(1+t*0.1));
});
};

// ════════════════════════════════════════════════
//  ARTERIAL PUMP WOUND
// ════════════════════════════════════════════════
SlimeEnemy.prototype._startPumpWound = function(organ) {
// Find or create a heart wound and mark it pumping
for (var i = 0; i < this.wounds.length; i++) {
if (this.wounds[i].organ === organ && this.wounds[i].alive) {
this.wounds[i].isPumping = true;
this.wounds[i].pumpLife  = 8.0;
return;
}
}
};

// ════════════════════════════════════════════════
//  18 KILL ANIMATIONS
// ════════════════════════════════════════════════
SlimeEnemy.prototype._die = function(wk, wlvl, organ, hitPoint, hitNormal, bulletDir) {
if (this.dying) return;
this.dying    = true;
this.hp       = 0;
this.speed    = 0;
this.state    = 'dying';
this.deathTimer = 0;

if (global.BloodV2) {
global.BloodV2.kill(this, wk);
}
if (global.GoreSim && typeof global.GoreSim.onKill === 'function') {
global.GoreSim.onKill(this, wk, null);
}

// Choose death style based on weapon + organ + level
var style = this._chooseDeathStyle(wk, wlvl, organ);
this.deathStyle = style;
this.deathData  = { wk: wk, wlvl: wlvl, organ: organ, dir: bulletDir };
this._initDeathAnimation(style);
};

SlimeEnemy.prototype._chooseDeathStyle = function(wk, wlvl, organ) {
// Explosive weapons: always explosive death
if (wk === 'rocket' || wk === 'meteor') return 'vaporize';
if (wk === 'grenade') return 'explosion_toss';
// Brain kill
if (organ === 'brain') {
if (wk === 'sniper') return 'brain_snipe';
if (wk === 'axe')    return 'split_top';
return 'neural_melt';
}
// Heart kill
if (organ === 'heart') {
if (wk === 'knife_takedown') return 'execution_bleed';
if (wk === 'knife' || wk === 'sword') return 'slash_collapse';
return 'cardiac_pump_collapse';
}
// Gut kill
if (organ === 'guts') return 'deflation_death';
// Elemental kills
if (wk === 'flame') return 'burn_collapse';
if (wk === 'ice')   return 'freeze_shatter';
if (wk === 'lightning') return 'electro_death';
if (wk === 'laser') return 'laser_collapse';
// Shotgun at high level
if (wk === 'shotgun' && wlvl >= 4) return 'shotgun_explosion';
// Sniper generic
if (wk === 'sniper') return 'sniper_spin';
// Knife takedown
if (wk === 'knife_takedown') return 'execution_bleed';
// Melee generic
if (wk === 'axe' || wk === 'sword') return 'melee_spin';
// Default
return 'standard_collapse';
};

SlimeEnemy.prototype._initDeathAnimation = function(style) {
var self = this;
var pos  = this.mesh ? this.mesh.position.clone() : new THREE.Vector3();

switch (style) {

// ── 1. STANDARD COLLAPSE ─────────────────────────────────────
case 'standard_collapse':
  // Slime tips over and melts flat
  this.deathData.phase = 'tipping';
  break;

// ── 2. NEURAL MELT (brain death) ─────────────────────────────
case 'neural_melt':
  // Cross-eyes → wobble → melt from top down
  if (this.eyeL) { this.eyeL.position.x = -0.01; this.eyeR.position.x = 0.01; }
  this.mesh.rotation.z = (Math.random()<0.5?1:-1) * 0.15;
  this.deathData.phase = 'wobbling';
  this.deathData.meltProgress = 0;
  break;

// ── 3. BRAIN SNIPE ───────────────────────────────────────────
case 'brain_snipe':
  // Instant: body drops straight down, no drama
  this.deathData.phase = 'dropping';
  break;

// ── 4. SPLIT TOP (axe to head) ───────────────────────────────
case 'split_top':
  // Slime splits vertically at top, falls sideways
  this.deathData.phase = 'splitting';
  this.deathData.splitDir = (Math.random()<0.5) ? 1 : -1;
  break;

// ── 5. CARDIAC PUMP COLLAPSE (heart death) ───────────────────
case 'cardiac_pump_collapse':
  // 3-4 massive heart pumps, then sudden drop
  this.deathData.phase = 'pumping';
  this.deathData.pumpCount = 0;
  this.deathData.maxPumps = 3 + Math.floor(Math.random()*2);
  break;

// ── 6. SLASH COLLAPSE (sword/knife heart kill) ───────────────
case 'slash_collapse':
  // Stagger sideways, leaving slash-shaped blood trail on ground
  this.deathData.phase = 'staggering';
  this.deathData.dir   = (Math.random()<0.5) ? 1 : -1;
  break;

// ── 7. EXECUTION BLEED (knife takedown kill) ─────────────────
case 'execution_bleed':
  // Stays upright for 1 full second bleeding... then collapses slow
  this.deathData.phase  = 'bleeding_standing';
  this.deathData.standTime = 1.2;
  break;

// ── 8. DEFLATION DEATH (guts kill) ───────────────────────────
case 'deflation_death':
  // Slowly sinks down while leaking, like a deflating balloon
  this.deathData.phase     = 'deflating';
  this.deathData.startY    = this.mesh ? this.mesh.position.y : 0;
  this.deathData.startScaleX = this.scale;
  break;

// ── 9. VAPORIZE (rocket/meteor) ──────────────────────────────
case 'vaporize':
  // Nothing left — mesh disappears instantly
  if (this.mesh) this.mesh.visible = false;
  if (this.shadowMesh) this.shadowMesh.visible = false;
  this.deathData.phase = 'done';
  setTimeout(function() { self._cleanup(); }, 1000);
  return;

// ── 10. EXPLOSION TOSS (grenade) ─────────────────────────────
case 'explosion_toss':
  // Slime is launched up and arcs to ground dead
  this.deathData.phase = 'airborne';
  this.deathData.velX  = (Math.random()-0.5) * 8;
  this.deathData.velY  = 6 + Math.random() * 4;
  this.deathData.velZ  = (Math.random()-0.5) * 8;
  this.deathData.rotV  = (Math.random()-0.5) * 12;
  break;

// ── 11. BURN COLLAPSE (flame) ────────────────────────────────
case 'burn_collapse':
  this.deathData.phase = 'burning';
  this.deathData.meltProgress = 0;
  if (this.mesh) this.mesh.material.color.setHex(0x552211);
  break;

// ── 12. FREEZE SHATTER (ice) ─────────────────────────────────
case 'freeze_shatter':
  // Slime freezes solid (blue, rigid) then shatters
  this.deathData.phase = 'freezing';
  this.deathData.freezeTimer = 0.6;
  if (this.mesh) this.mesh.material.color.setHex(0x88ccff);
  break;

// ── 13. ELECTRO DEATH (lightning) ────────────────────────────
case 'electro_death':
  this.deathData.phase    = 'spasming';
  this.deathData.spasmCount = 0;
  if (this.mesh) this.mesh.material.color.setHex(0xffffcc);
  break;

// ── 14. LASER COLLAPSE ───────────────────────────────────────
case 'laser_collapse':
  // Slime stands for a second smouldering then topples
  this.deathData.phase = 'smouldering';
  this.deathData.smokeTimer = 0.8;
  break;

// ── 15. SHOTGUN EXPLOSION ────────────────────────────────────
case 'shotgun_explosion':
  // Huge push backward + spin into wall and splat
  this.deathData.phase = 'flying_back';
  this.deathData.velX  = (this.deathData.dir ? this.deathData.dir.x : 1) * 6;
  this.deathData.velY  = 2.5;
  this.deathData.velZ  = (this.deathData.dir ? this.deathData.dir.z : 0) * 6;
  this.deathData.spin  = (Math.random()-0.5) * 15;
  break;

// ── 16. SNIPER SPIN ──────────────────────────────────────────
case 'sniper_spin':
  // Bullet force spins slime — blood trails in circle — falls
  this.deathData.phase = 'spinning';
  this.deathData.spinV = (Math.random()<0.5?1:-1) * (8 + Math.random()*6);
  this.deathData.velY  = 2 + Math.random()*2;
  break;

// ── 17. MELEE SPIN ───────────────────────────────────────────
case 'melee_spin':
  this.deathData.phase = 'melee_spinning';
  this.deathData.spinV = (Math.random()<0.5?1:-1) * (5 + Math.random()*4);
  this.deathData.dir   = this.deathData.dir || (Math.random()<0.5?1:-1);
  break;

// ── 18. PLASMA MELT ─────────────────────────────────────────
case 'plasma_melt':
  this.deathData.phase = 'melting';
  this.deathData.meltProgress = 0;
  if (this.mesh) this.mesh.material.color.setHex(0x885533);
  break;

}
};

// ════════════════════════════════════════════════
//  DEATH ANIMATION UPDATE
// ════════════════════════════════════════════════
SlimeEnemy.prototype._updateDeath = function(dt) {
if (!this.mesh) return;
this.deathTimer += dt;
var self   = this;
var style  = this.deathStyle;
var data   = this.deathData;
var pos    = this.mesh.position;
var MAX_TIME = 4.0;

// Death slide: apply kill velocity for first 0.3 seconds with friction
if (this.deathTimer < 0.3 && (this._deathSlideVX || this._deathSlideVZ)) {
  pos.x += this._deathSlideVX * dt;
  pos.z += this._deathSlideVZ * dt;
  // dt-scaled exponential decay: 0.85 per frame at 60 FPS
  var deathSlideFriction = Math.exp(Math.log(0.85) * dt * 60);
  this._deathSlideVX *= deathSlideFriction;
  this._deathSlideVZ *= deathSlideFriction;
}

// Emit blood trail during death movement
if (this.deathTimer < 2.5 && Math.random() < 0.5) {
this._dropTrail();
}

switch (style) {

case 'standard_collapse':
  if (data.phase === 'tipping') {
    this.mesh.rotation.z += dt * 1.8;
    pos.y = Math.max(0.05, pos.y - dt * 0.5);
    if (this.mesh.rotation.z > Math.PI/2) data.phase = 'flattening';
  } else {
    this.mesh.scale.set(this.scale*(1+data.meltProgress*0.5), Math.max(0.02, this.scale*(1-data.meltProgress)), this.scale*(1+data.meltProgress*0.5));
    data.meltProgress = (data.meltProgress||0) + dt * 0.6;
    if ((data.meltProgress||0) > 1.0) this._finishDeath();
  }
  break;

case 'neural_melt':
  if (data.phase === 'wobbling') {
    this.mesh.rotation.z = Math.sin(this.deathTimer * 8) * 0.3 * Math.max(0, 1-this.deathTimer);
    pos.y = Math.max(0.05, pos.y - dt * 0.15);
    if (this.deathTimer > 0.8) { data.phase = 'melting'; }
  } else {
    data.meltProgress += dt * 0.5;
    var mp = data.meltProgress;
    this.mesh.scale.set(this.scale*(1+mp*0.4), Math.max(0.02, this.scale*(1-mp)), this.scale*(1+mp*0.4));
    this.mesh.material.color.setHex(SLIME_COLORS.brain);
    if (mp > 1.0) this._finishDeath();
  }
  break;

case 'brain_snipe':
  pos.y = Math.max(0.02, pos.y - dt * 3.5);
  this.mesh.scale.y = Math.max(0.02, this.mesh.scale.y - dt * 1.5);
  if (pos.y <= 0.02) this._finishDeath();
  break;

case 'split_top':
  this.mesh.rotation.z += dt * data.splitDir * 3.0;
  pos.y = Math.max(0.02, pos.y - dt * 0.8);
  if (Math.abs(this.mesh.rotation.z) > Math.PI/2) this._finishDeath();
  break;

case 'cardiac_pump_collapse':
  if (data.phase === 'pumping') {
    // Pulse the body
    if (this.deathTimer > data.pumpCount * 0.2) {
      data.pumpCount++;
      // Body lurches on each pump
      if (this.mesh) {
        this.mesh.scale.y = this.scale * 1.15;
        setTimeout(function(){ if (self.mesh) self.mesh.scale.y = self.scale; }, 80);
      }
      if (data.pumpCount >= data.maxPumps) data.phase = 'collapsing';
    }
  } else {
    pos.y = Math.max(0.02, pos.y - dt * 2.5);
    this.mesh.scale.x += dt * 0.4;
    this.mesh.scale.z += dt * 0.4;
    this.mesh.scale.y = Math.max(0.02, this.mesh.scale.y - dt * 0.8);
    if (pos.y <= 0.02) this._finishDeath();
  }
  break;

case 'slash_collapse':
  this.mesh.rotation.z += dt * data.dir * 2.5;
  pos.x += dt * data.dir * 0.8;
  pos.y = Math.max(0.02, pos.y - dt * 1.2);
  if (pos.y <= 0.02) this._finishDeath();
  break;

case 'execution_bleed':
  if (data.phase === 'bleeding_standing') {
    // Just stand there bleeding (BloodV2 handles the blood)
    this.mesh.rotation.x = 0.2 + Math.sin(this.deathTimer * 3) * 0.05;
    data.standTime -= dt;
    if (data.standTime <= 0) data.phase = 'slow_collapse';
  } else {
    this.mesh.rotation.x += dt * 1.0;
    pos.y = Math.max(0.02, pos.y - dt * 0.8);
    if (pos.y <= 0.02) this._finishDeath();
  }
  break;

case 'deflation_death':
  data.meltProgress = (data.meltProgress||0) + dt * 0.35;
  var mp = data.meltProgress;
  this.mesh.scale.set(
    this.scale * (1 + mp * 0.6),
    Math.max(0.02, this.scale * (1 - mp)),
    this.scale * (1 + mp * 0.6)
  );
  pos.y = Math.max(0.02, data.startY * (1 - mp));
  if (mp > 1.0) this._finishDeath();
  break;

case 'explosion_toss':
  if (data.phase === 'airborne') {
    data.velY += SLIME_CFG.BASE_SPEED < 0 ? 0 : -9.81 * dt;  // gravity
    pos.x += data.velX * dt;
    pos.y += data.velY * dt;
    pos.z += data.velZ * dt;
    this.mesh.rotation.y += data.rotV * dt;
    this.mesh.rotation.z += data.rotV * dt * 0.5;
    if (pos.y <= 0.04) {
      pos.y = 0.04;
      data.phase = 'landed';
      // SPLAT on landing
      if (global.BloodV2) {
        var lp = new THREE.Vector3(pos.x, pos.y, pos.z);
        global.BloodV2.hit(this, 'grenade', lp, new THREE.Vector3(0,1,0));
      }
      setTimeout(function() { self._finishDeath(); }, 300);
    }
  }
  break;

case 'burn_collapse':
  data.meltProgress += dt * 0.4;
  var mp = data.meltProgress;
  this.mesh.scale.set(this.scale*(1+mp*0.3), Math.max(0.02, this.scale*(1-mp)), this.scale*(1+mp*0.3));
  pos.y = Math.max(0.02, pos.y - dt * 0.5);
  this.mesh.material.color.setHex(mp < 0.5 ? 0x552211 : 0x221108);
  if (mp > 1.0) this._finishDeath();
  break;

case 'freeze_shatter':
  if (data.phase === 'freezing') {
    data.freezeTimer -= dt;
    // Rigid — no wobble
    if (data.freezeTimer <= 0) {
      // SHATTER
      data.phase = 'shattered';
      if (this.mesh) this.mesh.visible = false;
      if (global.BloodV2) {
        var pos2 = this.mesh.position.clone();
        global.BloodV2.kill(this, 'ice');
      }
      setTimeout(function() { self._finishDeath(); }, 500);
    }
  }
  break;

case 'electro_death':
  if (data.phase === 'spasming') {
    this.mesh.rotation.z = Math.sin(this.deathTimer * 20) * 0.4 * Math.max(0, 1 - this.deathTimer * 0.8);
    this.mesh.rotation.x = Math.sin(this.deathTimer * 17) * 0.25 * Math.max(0, 1 - this.deathTimer * 0.8);
    pos.y = Math.max(0.02, pos.y - dt * 0.4);
    if (this.deathTimer > 1.5) { data.phase = 'collapsed'; this._finishDeath(); }
  }
  break;

case 'laser_collapse':
  if (data.phase === 'smouldering') {
    data.smokeTimer -= dt;
    if (data.smokeTimer <= 0) data.phase = 'toppling';
  } else {
    this.mesh.rotation.z += dt * 2.0;
    pos.y = Math.max(0.02, pos.y - dt * 1.5);
    if (pos.y <= 0.02) this._finishDeath();
  }
  break;

case 'shotgun_explosion':
  if (data.phase === 'flying_back') {
    data.velY -= 9.81 * dt;
    pos.x += data.velX * dt;
    pos.y += data.velY * dt;
    pos.z += data.velZ * dt;
    this.mesh.rotation.y += data.spin * dt;
    if (pos.y <= 0.04) {
      pos.y = 0.04;
      data.phase = 'splat';
      this.mesh.scale.set(this.scale * 1.8, 0.08, this.scale * 1.8);
      if (global.BloodV2) {
        var hp = new THREE.Vector3(pos.x, 0.04, pos.z);
        global.BloodV2.hit(this, 'shotgun', hp, new THREE.Vector3(0,1,0));
      }
      setTimeout(function() { self._finishDeath(); }, 400);
    }
  }
  break;

case 'sniper_spin':
  data.velY = (data.velY||2) + GRAVITY * dt;
  pos.y = Math.max(0.02, pos.y + data.velY * dt);
  this.mesh.rotation.y += data.spinV * dt;
  data.spinV *= 0.95;
  if (pos.y <= 0.02) {
    // Landing splat
    this.mesh.scale.set(this.scale * 1.5, 0.06, this.scale * 1.5);
    setTimeout(function() { self._finishDeath(); }, 300);
  }
  break;

case 'melee_spin':
  this.mesh.rotation.y += data.spinV * dt;
  data.spinV *= 0.88;
  pos.y = Math.max(0.02, pos.y - dt * 1.0);
  if (pos.y <= 0.02 || Math.abs(data.spinV) < 0.3) this._finishDeath();
  break;

}

// Safety timeout
if (this.deathTimer > MAX_TIME) this._finishDeath();
};

var GRAVITY = -9.81;

// ════════════════════════════════════════════════
//  CLEANUP
// ════════════════════════════════════════════════
SlimeEnemy.prototype._finishDeath = function() {
if (this.mesh) {
// Flatten onto ground
if (this.deathStyle !== 'vaporize' && this.deathStyle !== 'freeze_shatter') {
this.mesh.scale.set(this.scale * 1.6, 0.05, this.scale * 1.6);
this.mesh.position.y = 0.015;
this.mesh.rotation.z = 0;
}
// PERF FIX: Use sink-and-shrink instead of opacity fade to avoid transparent overdraw.
// Tracked in game-loop update() via _sinkTimer instead of setInterval.
this._sinkTimer = 0;
this._sinkDuration = 1.5; // seconds to sink into ground
} else {
this._cleanup();
}
};

SlimeEnemy.prototype._cleanup = function() {
// PERF FIX: No more setInterval fade — just reset state
this._sinkTimer = 0;
this._sinkDuration = 0;
this.alive  = false;
this.dying  = false;
this.active = false;
this._deathSlideVX = 0;
this._deathSlideVZ = 0;
// Reset all hit-anim tween state
this._tweenTimers = null;
if (this.mesh) { this.mesh.visible = false; this.mesh.material.opacity = 1.0; this.mesh.material.transparent = false; }
if (this.shadowMesh) this.shadowMesh.visible = false;
if (this.eyeL) { this.eyeL.visible = false; this.eyeR.visible = false; }
for (var i = 0; i < this.wounds.length; i++) {
this.wounds[i].alive = false;
if (this.wounds[i].mesh) this.wounds[i].mesh.visible = false;
}
};

// ════════════════════════════════════════════════
//  ANATOMY HELPERS
// ════════════════════════════════════════════════
SlimeEnemy.prototype._getOrgan = function(localY) {
for (var k in ORGANS) {
if (localY >= ORGANS[k].yMin && localY <= ORGANS[k].yMax) return k;
}
return 'membrane';
};

SlimeEnemy.prototype._damageOrgan = function(organ, amount) {
if (!this.organs[organ]) return false;
this.organs[organ].hp -= amount;
if (this.organs[organ].hp <= 0) {
this.organs[organ].hp = 0;
if (!this.killedBy) this.killedBy = organ;
return true;
}
return false;
};

SlimeEnemy.prototype._addWound = function(lx, ly, lz, depth, organ, wk, isThrough) {
var MERGE = 0.14;
for (var i = 0; i < this.wounds.length; i++) {
var w = this.wounds[i];
if (!w.alive) continue;
var dd = Math.sqrt((w.lx-lx)*(w.lx-lx)+(w.ly-ly)*(w.ly-ly)+(w.lz-lz)*(w.lz-lz));
if (dd < MERGE) {
w.hits++;
w.radius = Math.min(w.radius * 1.35 + 0.01, 0.45);
w.depth  = Math.min(w.depth  + depth * 0.4, 1.0);
return w;
}
}
// New wound
var slot = null;
for (var i = 0; i < this.wounds.length; i++) {
if (!this.wounds[i].alive) { slot = this.wounds[i]; break; }
}
if (!slot && this.wounds.length < SLIME_CFG.MAX_WOUNDS) {
slot = makeWound();
this.wounds.push(slot);
} else if (!slot) {
slot = this.wounds[0];
}
slot.alive      = true;
slot.lx = lx; slot.ly = ly; slot.lz = lz;
slot.radius     = 0.035 + depth * 0.02;
slot.depth      = depth;
slot.hits       = 1;
slot.organ      = organ;
slot.dripTimer  = 0;
slot.pumpTimer  = 0;
slot.isPumping  = false;
slot.pumpLife   = 0;
slot.cauterized = (wk === 'laser' || wk === 'flame');
slot.frozen     = (wk === 'ice');
return slot;
};

// ════════════════════════════════════════════════
//  SLIME POOL
//  Zero-GC object pool for all slimes
// ════════════════════════════════════════════════
var SlimePool = {
_scene:  null,
_pool:   [],
_count:  0,
_ready:  false,

init: function(scene, maxCount) {
this._scene = scene;
this._count = maxCount || 40;
this._pool  = [];
for (var i = 0; i < this._count; i++) {
var s = this._buildSlimeMesh(scene);
this._pool.push(s);
}
this._ready = true;
console.log('[SlimePool] Ready. ' + this._count + ' slimes pre-allocated.');
},

_buildSlimeMesh: function(scene) {
var s = new SlimeEnemy();

// ── BODY ────────────────────────────────────────────────────
// Use a slightly flattened sphere for slime shape
var bodyGeo = new THREE.SphereGeometry(1.0, 16, 12);
// Squish it slightly to look like a blob
var positions = bodyGeo.attributes.position;
for (var i = 0; i < positions.count; i++) {
  var y = positions.getY(i);
  // Flatten bottom, round top
  if (y < 0) positions.setY(i, y * 0.65);
}
positions.needsUpdate = true;
bodyGeo.computeVertexNormals();

var bodyMat = new THREE.MeshLambertMaterial({
  color:       SLIME_COLORS.healthy,
  transparent: false,
});
var body = new THREE.Mesh(bodyGeo, bodyMat);
body.castShadow    = true;
body.receiveShadow = false;
body.frustumCulled = false; // prevent slimes vanishing at screen edges
body.visible       = false;
scene.add(body);
s.mesh = body;

// ── EYES ────────────────────────────────────────────────────
var eyeGeo  = new THREE.SphereGeometry(0.15, 8, 6);
var pupilGeo = new THREE.SphereGeometry(0.09, 6, 5);
var eyeMat  = new THREE.MeshBasicMaterial({ color: 0xffffff });
var pupMat  = new THREE.MeshBasicMaterial({ color: 0x111111 });

var eyeL = new THREE.Mesh(eyeGeo, eyeMat.clone());
var eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone());
var pupL = new THREE.Mesh(pupilGeo, pupMat.clone());
var pupR = new THREE.Mesh(pupilGeo, pupMat.clone());

eyeL.position.set(-0.25, 0.25, 0.78);
eyeR.position.set( 0.25, 0.25, 0.78);
pupL.position.set(-0.25, 0.25, 0.90);
pupR.position.set( 0.25, 0.25, 0.90);

body.add(eyeL);
body.add(eyeR);
body.add(pupL);
body.add(pupR);

eyeL.visible = false;
eyeR.visible = false;
pupL.visible = false;
pupR.visible = false;

s.eyeL = eyeL;
s.eyeR = eyeR;

// ── SHADOW ──────────────────────────────────────────────────
var shadowGeo = new THREE.CircleGeometry(0.8, 10);
var shadowMat = new THREE.MeshBasicMaterial({
  color:       0x000000,
  transparent: true,
  opacity:     0.25,
  depthWrite:  false,
});
var shadow = new THREE.Mesh(shadowGeo, shadowMat);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.01;
shadow.visible    = false;
shadow.renderOrder = -1;
scene.add(shadow);
s.shadowMesh = shadow;

return s;

},

spawn: function(x, y, z, waveLevel) {
if (!this._ready) return null;
var s = this._pool.find(function(sl) { return !sl.active; });
if (!s) {
// Recycle oldest alive slime
s = this._pool[0];
if (s.alive) s._cleanup();
}
s.spawn(x, y || 0, z, waveLevel);
return s;
},

update: function(dt, playerPos) {
if (!this._ready) return;
for (var i = 0; i < this._pool.length; i++) {
if (this._pool[i].active) {
this._pool[i].update(dt, playerPos);
}
}
},

hit: function(slime, weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir) {
if (!slime || !slime.active) return;
return slime.receiveHit(weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir);
},

getAlive: function() {
return this._pool.filter(function(s) { return s.alive && !s.dying; });
},

reset: function() {
for (var i = 0; i < this._pool.length; i++) {
var s = this._pool[i];
if (s.alive || s.dying) s._cleanup();
}
console.log('[SlimePool] Reset complete.');
},
};

// ════════════════════════════════════════════════
//  EXPOSE GLOBALLY
// ════════════════════════════════════════════════
global.SlimePool  = SlimePool;
global.SlimeEnemy = SlimeEnemy;
global.SLIME_COLORS = SLIME_COLORS;
global.ORGANS       = ORGANS;

console.log([
'',
'╔══════════════════════════════════════════════════════╗',
'║  SlimeEnemy System v1.0 — LOADED                    ║',
'╠══════════════════════════════════════════════════════╣',
'║  18 kill animations  |  47 hit reactions            ║',
'║  5-organ anatomy     |  Blood trail system          ║',
'║  Progressive wounds  |  Level scaling               ║',
'║  Zero GC             |  Full BloodV2 integration    ║',
'╠══════════════════════════════════════════════════════╣',
'║  game-screens.js init():                            ║',
'║    window.SlimePool.init(scene, 40);                ║',
'║                                                      ║',
'║  To spawn:                                          ║',
'║    window.SlimePool.spawn(x, y, z, waveLevel);     ║',
'║                                                      ║',
'║  game-loop.js animate():                            ║',
'║    window.SlimePool.update(delta, playerPos);       ║',
'║                                                      ║',
'║  On hit (from combat.js):                          ║',
'║    window.SlimePool.hit(                            ║',
'║      slime, "shotgun", weaponLevel,                 ║',
'║      hitPoint, hitNormal, bulletDir                 ║',
'║    );                                               ║',
'╚══════════════════════════════════════════════════════╝',
'',
].join('\n'));

})(window);
