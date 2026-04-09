/**

- ============================================================
- GORE SIMULATOR v1.0 — Water Drop Survivor
- File: js/gore-simulator.js
- Load AFTER: blood-system.js, enemy-class.js, weapons.js
- ============================================================
- 
- A physically-simulated, anatomically-aware hit & kill system.
- Every weapon behaves differently. Every wound is unique.
- Blood obeys gravity, momentum, viscosity, and surface tension.
- Enemies have 5 internal organs, each with HP, each producing
- a different death reaction when destroyed.
- 
- NO external dependencies beyond Three.js (already loaded).
- Slots into existing global scope — no ES modules.
- 
- INTEGRATION:
- 1. Add <script src="js/gore-simulator.js"></script> in index.html
- ```
    AFTER blood-system.js
- 1. In combat.js where you apply damage, call:
- ```
    window.GoreSim.onHit(enemy, weapon, hitPoint, hitNormal)
- 1. In enemy-class.js death handler, call:
- ```
    window.GoreSim.onKill(enemy, weapon, killerProjectile)
- ============================================================
  */

(function() {
'use strict';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const MAX_BLOOD_DROPS      = 800;   // pooled rigid-body blood drops
const MAX_DECALS           = 250;   // pooled ground blood decals
const MAX_WOUNDS           = 12;    // max wounds per enemy simultaneously
const MAX_MIST_PARTICLES   = 500;   // fine blood mist particles
const MAX_CHUNKS           = 80;    // flying flesh/slime chunks
const MAX_STREAMS          = 25;    // pumping arterial streams
const GRAVITY              = -9.8;
const BLOOD_VISCOSITY      = 0.72;  // 0=water, 1=honey — slime blood is thick
const SLIME_VISCOSITY      = 0.55;
const DRIP_INTERVAL        = 0.18;  // seconds between wound drips
const PUMP_INTERVAL        = 0.08;  // arterial pump rate
const DECAL_FADE_TIME      = 40.0;  // seconds before decal fades

// ─────────────────────────────────────────────
//  WEAPON GORE PROFILES
//  Every weapon has unique physical properties
//  that determine how blood and flesh behave
// ─────────────────────────────────────────────
const WEAPON_GORE = {
// ── FIREARMS ──────────────────────────────
pistol: {
woundRadius:    0.04,
penetration:    0.45,
exitWound:      true,
exitScale:      1.8,       // exit wound bigger than entry
bloodVolume:    0.6,
bloodVelocity:  { min: 2.0, max: 5.0 },
mistDensity:    0.7,       // fine mist on entry
chunkChance:    0.0,
pushForce:      0.3,
sound:          'thud_wet',
killStyle:      'penetration',
description:    'Clean entry, ragged exit. Blood channel follows bullet path.',
},
revolver: {
woundRadius:    0.055,
penetration:    0.65,
exitWound:      true,
exitScale:      2.4,
bloodVolume:    0.9,
bloodVelocity:  { min: 3.5, max: 7.0 },
mistDensity:    1.0,
chunkChance:    0.05,
pushForce:      0.6,
sound:          'thud_heavy',
killStyle:      'penetration',
description:    'Heavy round. Hydrostatic shock wave sends ripple through flesh.',
},
shotgun: {
woundRadius:    0.18,
penetration:    0.3,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    3.5,
bloodVelocity:  { min: 4.0, max: 12.0 },
mistDensity:    2.5,
chunkChance:    0.7,       // 70% chance of flesh chunks
chunkCount:     { min: 4, max: 9 },
pushForce:      2.5,
pelletCount:    8,         // spread pattern
pelletSpread:   0.4,
sound:          'boom_wet',
killStyle:      'devastation',
description:    'Massive cavity. Flesh vaporizes at center. Chunks fly outward.',
},
smg: {
woundRadius:    0.035,
penetration:    0.4,
exitWound:      true,
exitScale:      1.5,
bloodVolume:    0.5,
bloodVelocity:  { min: 2.5, max: 6.0 },
mistDensity:    0.9,
chunkChance:    0.0,
pushForce:      0.25,
sound:          'thud_fast',
killStyle:      'perforation',
description:    'Rapid small wounds. Swiss cheese effect. Blood from every hole.',
},
sniper: {
woundRadius:    0.025,
penetration:    1.0,       // full penetration, exits clean
exitWound:      true,
exitScale:      0.9,       // exit nearly same size — supersonic
bloodVolume:    1.2,
bloodVelocity:  { min: 6.0, max: 18.0 }, // supersonic mist explosion
mistDensity:    2.0,
chunkChance:    0.15,
pushForce:      1.5,
sound:          'crack_wet',
killStyle:      'supersonic',
description:    'Sonic pressure wave. Temporary cavity 10x bullet diameter. Blood erupts then collapses.',
},
minigun: {
woundRadius:    0.03,
penetration:    0.35,
exitWound:      true,
exitScale:      1.3,
bloodVolume:    0.4,
bloodVelocity:  { min: 2.0, max: 5.5 },
mistDensity:    0.8,
chunkChance:    0.02,
pushForce:      0.2,
sound:          'thud_rapid',
killStyle:      'saturation',
description:    'Constant stream. Body dances. Blood sprays continuously.',
},

// ── EXPLOSIVE ─────────────────────────────
grenade: {
woundRadius:    0.5,
penetration:    0.8,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    8.0,
bloodVelocity:  { min: 8.0, max: 25.0 },
mistDensity:    5.0,
chunkChance:    1.0,       // always chunks
chunkCount:     { min: 8, max: 20 },
pushForce:      15.0,
isExplosive:    true,
blastRadius:    3.0,
sound:          'blast_wet',
killStyle:      'explosion',
description:    'Overpressure. Internal organs rupture. Body cavity becomes shrapnel.',
},
rocket: {
woundRadius:    0.8,
penetration:    1.0,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    15.0,
bloodVelocity:  { min: 15.0, max: 40.0 },
mistDensity:    10.0,
chunkChance:    1.0,
chunkCount:     { min: 15, max: 35 },
pushForce:      40.0,
isExplosive:    true,
blastRadius:    5.0,
sound:          'explosion_wet',
killStyle:      'vaporize',
description:    'Direct hit liquefies. Only chunks remain. Blood rains.',
},

// ── ENERGY ────────────────────────────────
laser: {
woundRadius:    0.02,
penetration:    1.0,
exitWound:      true,
exitScale:      0.8,
bloodVolume:    0.2,       // cauterizes — less blood
bloodVelocity:  { min: 0.5, max: 2.0 },
mistDensity:    0.1,
chunkChance:    0.0,
pushForce:      0.1,
cauterizes:     true,      // wound smokes, doesn't drip
charEffect:     true,
sound:          'sizzle',
killStyle:      'cauterize',
description:    'Cauterized entry. Smoke. Little blood — but organ damage is catastrophic.',
},
plasma: {
woundRadius:    0.12,
penetration:    0.7,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    1.5,
bloodVelocity:  { min: 3.0, max: 8.0 },
mistDensity:    1.5,
chunkChance:    0.3,
pushForce:      2.0,
cauterizes:     false,
charEffect:     true,
sound:          'plasma_hit',
killStyle:      'melt',
description:    'Superheated. Tissue flash-boils. Blood vaporizes at wound edge.',
},

// ── MELEE ─────────────────────────────────
knife: {
woundRadius:    0.02,
penetration:    0.9,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    1.8,
bloodVelocity:  { min: 0.3, max: 1.5 },
mistDensity:    0.0,
chunkChance:    0.0,
pushForce:      0.1,
isSlashing:     true,
slashLength:    0.3,
pumpBlood:      true,      // arterial pumping if organ hit
sound:          'slash_wet',
killStyle:      'slash',
description:    'Clean cut. Blood wells up. If artery hit — pump spray.',
},
sword: {
woundRadius:    0.04,
penetration:    0.8,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    3.0,
bloodVelocity:  { min: 0.5, max: 3.0 },
mistDensity:    0.1,
chunkChance:    0.1,
pushForce:      0.8,
isSlashing:     true,
slashLength:    0.7,
pumpBlood:      true,
sound:          'slash_heavy',
killStyle:      'sever',
description:    'Deep cut. May sever limb. Blood arc follows blade momentum.',
},
axe: {
woundRadius:    0.08,
penetration:    0.95,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    4.5,
bloodVelocity:  { min: 1.0, max: 4.0 },
mistDensity:    0.3,
chunkChance:    0.4,
chunkCount:     { min: 1, max: 3 },
pushForce:      2.0,
isSlashing:     true,
slashLength:    0.5,
pumpBlood:      true,
sound:          'chop_wet',
killStyle:      'cleave',
description:    'Splitting force. Bone shatters. Wet crunch. Blood fans out from impact.',
},

// ── SPECIAL ───────────────────────────────
flame: {
woundRadius:    0.15,
penetration:    0.2,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    0.3,
bloodVelocity:  { min: 0.2, max: 1.0 },
mistDensity:    0.0,
chunkChance:    0.0,
pushForce:      0.5,
cauterizes:     true,
charEffect:     true,
burnsEnemy:     true,
sound:          'flame_hit',
killStyle:      'combust',
description:    'Tissue chars. No blood — it vaporizes. Enemy burns, collapses.',
},
ice: {
woundRadius:    0.06,
penetration:    0.5,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    0.8,
bloodVelocity:  { min: 0.5, max: 2.0 },
mistDensity:    0.2,
chunkChance:    0.0,
pushForce:      0.3,
freezesBlood:   true,
sound:          'crack_ice',
killStyle:      'shatter',
description:    'Blood crystallizes on exit. Kill: enemy flash-freezes and shatters.',
},
lightning: {
woundRadius:    0.03,
penetration:    1.0,
exitWound:      true,
exitScale:      1.0,
bloodVolume:    0.4,
bloodVelocity:  { min: 1.0, max: 4.0 },
mistDensity:    0.3,
chunkChance:    0.05,
pushForce:      3.0,
electricEffect: true,
sound:          'zap_wet',
killStyle:      'electrocute',
description:    'Vaporizes water in tissue. Steam burst. Blood boils from wound.',
},

// ── KNIFE TAKEDOWN (your existing ability) ─
knife_takedown: {
woundRadius:    0.025,
penetration:    0.95,
exitWound:      false,
exitScale:      1.0,
bloodVolume:    2.5,
bloodVelocity:  { min: 0.2, max: 0.8 },
mistDensity:    0.0,
chunkChance:    0.0,
pushForce:      0.05,
isSlashing:     true,
slashLength:    0.2,
pumpBlood:      true,
isTakedown:     true,      // triggers special execution animation
sound:          'stab_deep',
killStyle:      'execution',
description:    'Precision stab. Held in place. Blood wells slowly then gushes.',
},
};

// ─────────────────────────────────────────────
//  SLIME ANATOMY
//  The slime has 5 internal zones. Each zone
//  has HP. Destroy a zone = unique death.
//  woundZone determines which organ was hit
//  based on normalized hit position (y axis).
// ─────────────────────────────────────────────
const SLIME_ANATOMY = {
membrane: {
hp: 35, maxHp: 35,
yRange: [-1.0, 1.0],   // outermost — hit anywhere
color: 0x33cc44,
deathReaction: 'membrane_burst',
bleedRate: 0.3,
description: 'Outer membrane — protective gel layer',
},
brain: {
hp: 20, maxHp: 20,
yRange: [0.55, 1.0],   // top of slime
color: 0xaaffaa,
deathReaction: 'brain_death',
bleedRate: 0.15,
description: 'Tiny nucleus — cognitive center',
},
heart: {
hp: 45, maxHp: 45,
yRange: [0.1, 0.55],   // upper center
color: 0xff3333,
deathReaction: 'heart_death',
bleedRate: 1.0,        // arterial — pumps hard
pumpBlood: true,
description: 'Pumping core — arterial bleed if destroyed',
},
guts: {
hp: 65, maxHp: 65,
yRange: [-0.3, 0.1],   // center-lower
color: 0x88ff55,
deathReaction: 'gut_death',
bleedRate: 0.6,
description: 'Digestive fluid sac — slow deflation death',
},
coreFluid: {
hp: 90, maxHp: 90,
yRange: [-1.0, -0.3],  // base/bottom
color: 0x00ff88,
deathReaction: 'deflate_death',
bleedRate: 0.8,
description: 'Vital fluid core — death when depleted',
},
};

// ─────────────────────────────────────────────
//  CRAWLER ANATOMY
//  Multi-segmented worm — each zone maps to a
//  body region from head to tail.
// ─────────────────────────────────────────────
const CRAWLER_ANATOMY = {
head: {
hp: 40, maxHp: 40,
yRange: [0.4, 1.0],
color: 0x994422,
deathReaction: 'head_burst',
bleedRate: 0.5,
description: 'Armored head — splits into toothed maw',
},
thorax: {
hp: 60, maxHp: 60,
yRange: [0.0, 0.4],
color: 0xcc6633,
deathReaction: 'thorax_rupture',
bleedRate: 0.8,
pumpBlood: true,
description: 'Central thorax — vital organs cluster',
},
abdomen: {
hp: 80, maxHp: 80,
yRange: [-0.5, 0.0],
color: 0xbb7744,
deathReaction: 'abdomen_burst',
bleedRate: 0.6,
description: 'Segmented abdomen — bursts into chunks on death',
},
tail: {
hp: 50, maxHp: 50,
yRange: [-1.0, -0.5],
color: 0x885522,
deathReaction: 'tail_sever',
bleedRate: 0.4,
description: 'Trailing segments — can be severed',
},
};

// ─────────────────────────────────────────────
//  Each blood drop is a rigid body with:
//  - initial velocity from impact
//  - gravity
//  - drag (air resistance based on viscosity)
//  - surface tension (drops coalesce on ground)
//  - bounce (loses energy on each bounce)
// ─────────────────────────────────────────────
class BloodDrop {
constructor() {
this.active    = false;
this.pos       = new THREE.Vector3();
this.vel       = new THREE.Vector3();
this.radius    = 0.02;
this.life      = 0;
this.maxLife   = 0;
this.color     = 0xcc0000;
this.viscosity = BLOOD_VISCOSITY;
this.bounces   = 0;
this.maxBounces = 3;
this.onGround  = false;
this.groundY   = 0;
this.isMist    = false;   // fine mist = no bounce, just settle
this.frozen    = false;   // ice weapon
this.charred   = false;   // fire/laser weapon
this.size      = 1;       // mesh scale multiplier
// Three.js mesh assigned by pool
this.mesh      = null;
}

reset(pos, vel, options = {}) {
this.active     = true;
this.pos.copy(pos);
this.vel.copy(vel);
this.radius     = options.radius    || 0.015 + Math.random() * 0.025;
this.maxLife    = options.life      || 3.0 + Math.random() * 2.0;
this.life       = this.maxLife;
this.color      = options.color     || 0xaa0000;
this.viscosity  = options.viscosity || BLOOD_VISCOSITY;
this.bounces    = 0;
this.maxBounces = options.maxBounces || 3;
this.onGround   = false;
this.groundY    = options.groundY   || 0.015;
this.isMist     = options.isMist    || false;
this.frozen     = options.frozen    || false;
this.charred    = options.charred   || false;
this.size       = this.radius * 1.5;
if (this.mesh) {
this.mesh.visible = true;
this.mesh.scale.setScalar(this.size);
this.mesh.material.color.setHex(this.color);
if (this.frozen) this.mesh.material.color.setHex(0x88ccff);
if (this.charred) this.mesh.material.color.setHex(0x222222);
}
}

update(dt) {
if (!this.active) return;
this.life -= dt;
if (this.life <= 0) { this.deactivate(); return; }

if (this.onGround) {
  // Settled on ground — spread into puddle slowly
  this.size = Math.min(this.size + dt * 0.005, 0.08);
  this.size = Math.min(this.size + dt * 0.008, 0.12);
  if (this.mesh) this.mesh.scale.set(this.size, 0.1, this.size);
  // Fade after a while
  if (this.life < 1.5 && this.mesh) {
    const alpha = this.life / 1.5;
    this.mesh.material.opacity = alpha * 0.8;
  }
  return;
}

// Gravity
this.vel.y += GRAVITY * dt;

// Air drag — viscous blood resists fast movement
const speed    = this.vel.length();
const drag     = 1.0 - (1.0 - this.viscosity) * dt * speed * 0.5;
this.vel.multiplyScalar(Math.max(0, drag));

// Integrate position
this.pos.addScaledVector(this.vel, dt);

// Ground collision
if (this.pos.y <= this.groundY) {
  this.pos.y = this.groundY;
  if (this.isMist) {
    // Mist just settles
    this.onGround = true;
    this.vel.set(0,0,0);
    if (this.mesh) this.mesh.scale.setScalar(this.size * 0.5);
  } else if (this.bounces < this.maxBounces) {
    // Bounce — loses energy based on viscosity
    this.vel.y = Math.abs(this.vel.y) * (0.35 - this.viscosity * 0.2);
    // Lateral momentum bleeds off
    this.vel.x *= 0.6;
    this.vel.z *= 0.6;
    this.bounces++;
    // Spawn ground decal on first bounce
    if (this.bounces === 1) {
      GoreSim._spawnDecal(this.pos, this.radius * 1.5, this.color);
    }
  } else {
    // Settle
    this.vel.set(0,0,0);
    this.onGround = true;
    GoreSim._spawnDecal(this.pos, this.radius * 2, this.color);
    if (this.mesh) {
      this.mesh.scale.set(this.size, 0.08, this.size);
    }
  }
}

// Update mesh
if (this.mesh) {
  this.mesh.position.copy(this.pos);
  if (!this.onGround) {
    // Elongate in direction of travel when fast
    if (speed > 3.0) {
      const stretch = 1.0 + speed * 0.08;
      this.mesh.scale.set(this.size, this.size * stretch, this.size);
      // Orient along velocity
      this.mesh.lookAt(
        this.pos.x + this.vel.x,
        this.pos.y + this.vel.y,
        this.pos.z + this.vel.z
      );
    } else {
      this.mesh.scale.setScalar(this.size);
    }
  }
}

}

deactivate() {
this.active = false;
if (this.mesh) {
this.mesh.visible = false;
this.mesh.material.opacity = 1.0;
}
}
}

// ─────────────────────────────────────────────
//  FLESH CHUNK — torn pieces of slime body
// ─────────────────────────────────────────────
class FleshChunk {
constructor() {
this.active  = false;
this.pos     = new THREE.Vector3();
this.vel     = new THREE.Vector3();
this.rot     = new THREE.Vector3();
this.rotVel  = new THREE.Vector3();
this.life    = 0;
this.size    = 0.1;
this.color   = 0xcc0000;
this.mesh    = null;
this.bounces = 0;
this.groundY = 0.02;
}

reset(pos, vel, options = {}) {
this.active  = true;
this.pos.copy(pos);
this.vel.copy(vel);
this.rotVel.set(
(Math.random() - 0.5) * 15,
(Math.random() - 0.5) * 15,
(Math.random() - 0.5) * 15
);
this.life    = 4.0 + Math.random() * 3.0;
this.size    = options.size  || 0.06 + Math.random() * 0.12;
this.color   = options.color || 0x22bb33;
this.bounces = 0;
if (this.mesh) {
this.mesh.visible = true;
this.mesh.scale.setScalar(this.size);
this.mesh.material.color.setHex(this.color);
this.mesh.material.opacity = 1.0;
}
}

update(dt) {
if (!this.active) return;
this.life -= dt;
if (this.life <= 0) { this.deactivate(); return; }

// Gravity
this.vel.y += GRAVITY * 0.7 * dt;

// Drag
this.vel.multiplyScalar(1.0 - 0.4 * dt);

// Integrate
this.pos.addScaledVector(this.vel, dt);

// Rotation
this.rot.addScaledVector(this.rotVel, dt);
this.rotVel.multiplyScalar(0.95);

// Ground bounce
if (this.pos.y <= this.groundY) {
  this.pos.y = this.groundY;
  if (this.bounces < 2) {
    this.vel.y = Math.abs(this.vel.y) * 0.3;
    this.vel.x *= 0.7;
    this.vel.z *= 0.7;
    this.bounces++;
    // Splat blood on landing
    GoreSim._spawnBloodBurst(this.pos, this.vel, 3, this.color, 'ground');
  } else {
    this.vel.set(0,0,0);
    this.rotVel.set(0,0,0);
    if (this.life > 2.0) this.life = 2.0;
  }
}

if (this.mesh) {
  this.mesh.position.copy(this.pos);
  this.mesh.rotation.set(this.rot.x, this.rot.y, this.rot.z);
  if (this.life < 1.5) {
    this.mesh.material.opacity = this.life / 1.5;
  }
}

}

deactivate() {
this.active = false;
if (this.mesh) this.mesh.visible = false;
}
}

// ─────────────────────────────────────────────
//  ARTERIAL STREAM
//  High-pressure pumping blood from heart wounds
//  Simulates fluid jet with gravity arc
// ─────────────────────────────────────────────
class ArterialStream {
constructor() {
this.active    = false;
this.origin    = new THREE.Vector3();
this.direction = new THREE.Vector3();
this.pressure  = 1.0;      // 0-1, decreases over time
this.timer     = 0;
this.interval  = PUMP_INTERVAL;
this.enemy     = null;
this.life      = 0;
this.color     = 0xcc0000;
}

start(enemy, origin, direction, options = {}) {
this.active    = true;
this.enemy     = enemy;
this.origin.copy(origin);
this.direction.copy(direction);
this.pressure  = 1.0;
this.life      = options.life || 5.0;
this.interval  = PUMP_INTERVAL;
this.timer     = 0;
this.color     = options.color || 0xcc0000;
}

update(dt) {
if (!this.active) return;
this.life -= dt;
if (this.life <= 0 || !this.enemy || !this.enemy.alive) {
this.active = false;
return;
}

// Pressure decreases as enemy loses blood
this.pressure = Math.max(0, this.life / 5.0);

this.timer += dt;
if (this.timer >= this.interval / this.pressure) {
  this.timer = 0;
  this._pump();
}

}

_pump() {
const speed = 4.0 + this.pressure * 8.0;
const count = Math.ceil(this.pressure * 5);
for (let i = 0; i < count; i++) {
const vel = new THREE.Vector3(
this.direction.x + (Math.random() - 0.5) * 0.3,
this.direction.y + Math.random() * 0.4 * this.pressure,
this.direction.z + (Math.random() - 0.5) * 0.3
).multiplyScalar(speed * (0.7 + Math.random() * 0.6));

  // Update origin to enemy position
  const worldOrigin = this.origin.clone();
  if (this.enemy.mesh) {
    worldOrigin.add(this.enemy.mesh.position);
  }

  GoreSim._spawnDrop(worldOrigin, vel, {
    color:      this.color,
    radius:     0.025 * this.pressure + Math.random() * 0.015,
    life:       1.5 + Math.random(),
    maxBounces: 2,
    viscosity:  SLIME_VISCOSITY,
  });
}

}
}

// ─────────────────────────────────────────────
//  WOUND — persistent hole in enemy body
//  Grows on repeated hits at same location
// ─────────────────────────────────────────────
class Wound {
constructor() {
this.active     = false;
this.localPos   = new THREE.Vector3(); // position relative to enemy center
this.radius     = 0.04;
this.depth      = 0.0;
this.hits       = 0;
this.organ      = null;
this.drip_timer = 0;
this.isCauterized = false;
this.isFrozen   = false;
this.color      = 0xaa0000;
this.mesh       = null;   // wound hole decal on enemy mesh
}

reset(localPos, radius, organ, options = {}) {
this.active     = true;
this.localPos.copy(localPos);
this.radius     = radius;
this.depth      = options.depth      || 0.2;
this.hits       = 1;
this.organ      = organ;
this.drip_timer = 0;
this.isCauterized = options.cauterized || false;
this.isFrozen   = options.frozen     || false;
this.color      = options.color      || 0x880000;
if (this.mesh) {
this.mesh.visible = true;
this.mesh.scale.setScalar(this.radius * 8);
this.mesh.material.color.setHex(0x000000);
}
}

grow(additionalDepth, additionalRadius) {
this.hits++;
this.depth  = Math.min(this.depth  + additionalDepth,  1.0);
this.radius = Math.min(this.radius + additionalRadius, 0.4);
if (this.mesh) this.mesh.scale.setScalar(this.radius * 8);
}

update(dt, enemyPos, enemyVelocity) {
if (!this.active || this.isCauterized || this.isFrozen) return;

const anatomy = SLIME_ANATOMY[this.organ];
if (!anatomy) return;

this.drip_timer += dt;
const dripInterval = DRIP_INTERVAL / (anatomy.bleedRate * (0.5 + this.depth));
if (this.drip_timer >= dripInterval) {
  this.drip_timer = 0;
  this._drip(enemyPos, enemyVelocity);
}

}

_drip(enemyPos, enemyVelocity) {
const worldPos = enemyPos.clone().add(this.localPos);

// Drip direction: down + enemy velocity influence + small random
const vel = new THREE.Vector3(
  (Math.random() - 0.5) * 0.3 + (enemyVelocity ? enemyVelocity.x * 0.15 : 0),
  -0.5 - Math.random() * 0.8,
  (Math.random() - 0.5) * 0.3 + (enemyVelocity ? enemyVelocity.z * 0.15 : 0)
);

GoreSim._spawnDrop(worldPos, vel, {
  color:      this.color,
  radius:     0.01 + this.depth * 0.015,
  life:       2.0 + Math.random(),
  maxBounces: 2,
  viscosity:  SLIME_VISCOSITY,
});

}
}

// ─────────────────────────────────────────────
//  ENEMY GORE STATE
//  Attached to each enemy instance.
//  Tracks wounds, anatomy HP, bleed state.
// ─────────────────────────────────────────────
class EnemyGoreState {
constructor(enemy) {
this.enemy    = enemy;
this.wounds   = [];
this.streams  = [];
this.anatomy  = {};
this.alive    = true;
this.killedBy = null;

// Copy anatomy from template
for (const [key, data] of Object.entries(SLIME_ANATOMY)) {
  this.anatomy[key] = { hp: data.hp, maxHp: data.maxHp };
}

}

getOrganAt(localY) {
// localY: -1 = bottom, +1 = top
for (const [key, data] of Object.entries(SLIME_ANATOMY)) {
if (localY >= data.yRange[0] && localY <= data.yRange[1]) {
return key;
}
}
return 'membrane';
}

damageOrgan(organ, amount) {
if (!this.anatomy[organ]) return false;
this.anatomy[organ].hp -= amount;
if (this.anatomy[organ].hp <= 0) {
this.anatomy[organ].hp = 0;
this.killedBy = organ;
return true; // organ destroyed
}
return false;
}

addWound(localPos, radius, organ, options) {
// Check if a wound already exists near this point
const MERGE_DIST = 0.12;
for (const w of this.wounds) {
if (!w.active) continue;
if (w.localPos.distanceTo(localPos) < MERGE_DIST) {
// Grow existing wound
w.grow(options.depth * 0.4, radius * 0.3);
return w;
}
}
// Find inactive wound slot
let wound = this.wounds.find(w => !w.active);
if (!wound) {
if (this.wounds.length < MAX_WOUNDS) {
wound = new Wound();
this.wounds.push(wound);
} else {
// Recycle oldest
wound = this.wounds[0];
}
}
wound.reset(localPos, radius, organ, options);
return wound;
}

update(dt) {
if (!this.alive) return;
const pos = this.enemy.mesh ? this.enemy.mesh.position : new THREE.Vector3();
const vel = this.enemy.velocity || new THREE.Vector3();
for (const w of this.wounds) w.update(dt, pos, vel);
for (const s of this.streams) s.update(dt);
}

cleanup() {
this.alive = false;
for (const w of this.wounds) w.active = false;
for (const s of this.streams) s.active = false;
}
}

// Helper: get anatomy color for enemy type and organ
function _getAnatomyColor(enemyType, organ) {
  if (enemyType === 'slime' && SLIME_ANATOMY[organ]) return SLIME_ANATOMY[organ].color;
  if (enemyType === 'crawler' && CRAWLER_ANATOMY[organ]) return CRAWLER_ANATOMY[organ].color;
  return 0x880000;
}

// Helper: derive gore chunk color from the enemy's actual body material
function getEnemyGoreColor(enemy) {
  try {
    if (enemy && enemy.mesh && enemy.mesh.material && enemy.mesh.material.color) {
      return enemy.mesh.material.color.getHex();
    }
    if (enemy && enemy.body && enemy.body.material && enemy.body.material.color) {
      return enemy.body.material.color.getHex();
    }
  } catch(e) {}
  return 0xCC4422;
}

// ─────────────────────────────────────────────
//  GORE SIMULATOR — MAIN PUBLIC API
// ─────────────────────────────────────────────
const GoreSim = {
scene:          null,
camera:         null,
_drops:         [],
_chunks:        [],
_streams:       [],
_decalMeshes:   [],
_decalIndex:    0,
_dropMeshes:    [],
_dropIndex:     0,
_chunkMeshes:   [],
_chunkIndex:    0,
_enemyGoreMap:  new Map(),  // enemy.id -> EnemyGoreState
_dropPool:      [],
_chunkPool:     [],
_initialized:   false,

// ────────────────────────────────────────
//  INIT — call once after Three.js scene exists
// ────────────────────────────────────────
init(scene, camera) {
if (this._initialized) return;
this.scene  = scene;
this.camera = camera;
this._buildPools();
this._initialized = true;
console.log('!!! GORE SIMULATOR IS ALIVE !!! Realistic Gore Simulator v1.0 ready.');
},

_buildPools() {
// Blood drop pool
const dropGeo  = new THREE.SphereGeometry(1.0, 6, 5); // low-poly sphere, scaled per drop
const dropMat  = new THREE.MeshBasicMaterial({ color: 0xaa0000, transparent: true, opacity: 0.9 });
for (let i = 0; i < MAX_BLOOD_DROPS; i++) {
const mesh   = new THREE.Mesh(dropGeo, dropMat.clone());
mesh.visible = false;
this.scene.add(mesh);
const drop   = new BloodDrop();
drop.mesh    = mesh;
this._drops.push(drop);
}

// Flesh chunk pool
const chunkGeo = new THREE.DodecahedronGeometry(0.5, 0);
const chunkMat = new THREE.MeshLambertMaterial({ color: 0xCC4422, transparent: true });
for (let i = 0; i < MAX_CHUNKS; i++) {
  const mesh   = new THREE.Mesh(chunkGeo, chunkMat.clone());
  mesh.visible = false;
  this.scene.add(mesh);
  const chunk  = new FleshChunk();
  chunk.mesh   = mesh;
  this._chunks.push(chunk);
}

// Ground decal pool
const decalGeo = new THREE.CircleGeometry(0.5, 16);
const decalMat = new THREE.MeshBasicMaterial({
  color:       0x880000,
  transparent: true,
  opacity:     0.75,
  depthWrite:  false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
for (let i = 0; i < MAX_DECALS; i++) {
  const mesh   = new THREE.Mesh(decalGeo, decalMat.clone());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.025;
  mesh.renderOrder = 1;
  mesh.visible = false;
  this.scene.add(mesh);
  this._decalMeshes.push(mesh);
}

console.log(`[GoreSim] Pools built: ${MAX_BLOOD_DROPS} drops, ${MAX_CHUNKS} chunks, ${MAX_DECALS} decals.`);

},

// ────────────────────────────────────────
//  PUBLIC: Hit Event
//  Call from combat.js when projectile hits enemy
// ────────────────────────────────────────
onHit(enemy, weaponType, hitPoint, hitNormal) {
if (!this._initialized || !enemy) return;

// ── DYNAMIC GORE LOD ──────────────────────────────────────────────────
// HIGH-ENTITY MODE (>= 15 enemies): skip all physics, project flat decal only
const _enemyCnt = (window.enemies && Array.isArray(window.enemies)) ? window.enemies.length
  : ((window._activeSlimes ? window._activeSlimes.length : 0) + (window._activeCrawlers ? window._activeCrawlers.length : 0));
if (_enemyCnt >= 15) {
  const _lodPos = enemy.mesh ? enemy.mesh.position : hitPoint;
  if (_lodPos) {
    const _lodColor = getEnemyGoreColor(enemy);
    this._spawnDecal({ x: _lodPos.x + (Math.random()-0.5)*0.4, y: 0.01, z: _lodPos.z + (Math.random()-0.5)*0.4 }, 0.25 + Math.random()*0.3, _lodColor);
  }
  return;
}
// LOW-ENTITY MODE: full physics below

const profile = WEAPON_GORE[weaponType] || WEAPON_GORE.pistol;

// Get or create gore state for this enemy
let gore = this._enemyGoreMap.get(enemy.id || enemy.uuid);
if (!gore) {
  gore = new EnemyGoreState(enemy);
  this._enemyGoreMap.set(enemy.id || enemy.uuid, gore);
}

const hp = this.scene; // sanity
if (!hp) return;

// Determine which organ was hit based on hit Y position relative to enemy
const enemyPos  = enemy.mesh ? enemy.mesh.position : new THREE.Vector3();
const enemyScale = enemy.mesh ? enemy.mesh.scale.y : 1.0;
const localY    = hitPoint
  ? Math.max(-1, Math.min(1, (hitPoint.y - enemyPos.y) / (enemyScale * 0.5 + 0.01)))
  : 0;
const organHit  = gore.getOrganAt(localY);

// Calculate organ damage (weapon penetration determines how much organ damage)
const organDamage = profile.penetration * 20 + Math.random() * 10;
const organDead   = gore.damageOrgan(organHit, organDamage);

// Calculate local wound position
const localPos = hitPoint
  ? hitPoint.clone().sub(enemyPos)
  : new THREE.Vector3((Math.random()-0.5)*0.2, localY*0.3, (Math.random()-0.5)*0.2);

// Add wound to enemy
const wound = gore.addWound(localPos, profile.woundRadius, organHit, {
  depth:      profile.penetration,
  cauterized: profile.cauterizes || false,
  frozen:     profile.freezesBlood || false,
  color:      _getAnatomyColor(enemy.enemyType, organHit),
});

// ── SPAWN BLOOD BASED ON WEAPON TYPE ──────
if (profile.isExplosive) {
  this._explosionBlood(hitPoint || enemyPos, profile, gore);
} else if (profile.isSlashing) {
  this._slashBlood(hitPoint || enemyPos, hitNormal, profile, gore);
} else if (profile.cauterizes) {
  this._cauterizeEffect(hitPoint || enemyPos, profile);
} else if (profile.electricEffect) {
  this._electricEffect(hitPoint || enemyPos, profile);
} else if (profile.freezesBlood) {
  this._iceEffect(hitPoint || enemyPos, profile);
} else {
  this._bulletBlood(hitPoint || enemyPos, hitNormal, profile, gore, organHit, localY);
}

// ── FLESH CHUNKS ──────────────────────────
if (Math.random() < profile.chunkChance) {
  const count = profile.chunkCount
    ? Math.floor(profile.chunkCount.min + Math.random() * (profile.chunkCount.max - profile.chunkCount.min))
    : 2;
  var hitChunkColor = getEnemyGoreColor(enemy);
  this._spawnChunks(hitPoint || enemyPos, hitNormal, count, profile, hitChunkColor);
}

// ── ARTERIAL PUMP if heart hit ─────────────
if (organHit === 'heart' && profile.pumpBlood !== false && SLIME_ANATOMY.heart.bleedRate > 0.5) {
  const existingStream = gore.streams.find(s => s.active);
  if (!existingStream) {
    const stream = new ArterialStream();
    const streamDir = hitNormal
      ? hitNormal.clone().negate()
      : new THREE.Vector3(Math.random()-0.5, 0.5, Math.random()-0.5).normalize();
    stream.start(enemy, localPos, streamDir, {
      life:  8.0,
      color: 0xcc1100,
    });
    gore.streams.push(stream);
    this._streams.push(stream);
  }
}

// ── ORGAN DEATH reaction ───────────────────
if (organDead && !enemy.dead) {
  this._organDeathReaction(enemy, gore, organHit, hitPoint, profile);
}

return { organHit, organDead, wound };

},

// ────────────────────────────────────────
//  PUBLIC: Kill Event
// ────────────────────────────────────────
onKill(enemy, weaponType, projectile) {
if (!this._initialized) return;

const profile = WEAPON_GORE[weaponType] || WEAPON_GORE.pistol;
const gore    = this._enemyGoreMap.get(enemy.id || enemy.uuid);

// ── DYNAMIC GORE LOD ──────────────────────────────────────────────────
// HIGH-ENTITY MODE (>= 15 enemies): skip explosion physics, spray flat decals
// Note: LOD check is before pos.clone() to avoid the allocation in high-entity mode
const _enemyCntK = (window.enemies && Array.isArray(window.enemies)) ? window.enemies.length
  : ((Array.isArray(window._activeSlimes) ? window._activeSlimes.length : 0) + (Array.isArray(window._activeCrawlers) ? window._activeCrawlers.length : 0));
if (_enemyCntK >= 15) {
  const _kColor = getEnemyGoreColor(enemy);
  const _kx = enemy.mesh ? enemy.mesh.position.x : 0;
  const _kz = enemy.mesh ? enemy.mesh.position.z : 0;
  for (let _di = 0; _di < 3; _di++) {
    this._spawnDecal({ x: _kx + (Math.random()-0.5)*1.2, y: 0.01, z: _kz + (Math.random()-0.5)*1.2 }, 0.3 + Math.random()*0.45, _kColor);
  }
  if (gore) gore.cleanup();
  this._enemyGoreMap.delete(enemy.id || enemy.uuid);
  return;
}
// LOW-ENTITY MODE: full explosion below

const pos     = enemy.mesh ? enemy.mesh.position.clone() : new THREE.Vector3();

const killedBy = gore ? gore.killedBy : 'membrane';

// Stop all bleeds
if (gore) {
  for (const s of gore.streams) s.active = false;
}

this._killExplosion(pos, profile, killedBy, enemy);
if (gore) gore.cleanup();
this._enemyGoreMap.delete(enemy.id || enemy.uuid);

},

// ────────────────────────────────────────
//  BULLET HIT BLOOD
// ────────────────────────────────────────
_bulletBlood(pos, normal, profile, gore, organ, localY) {
const count = Math.ceil(profile.bloodVolume * 20);
const speed = profile.bloodVelocity;

// Entry wound spray — forward cone opposite to normal
const hitDir = normal ? normal.clone().negate() : new THREE.Vector3(0, 0, 1);

for (let i = 0; i < count; i++) {
  const spread = profile.woundRadius * 4;
  const vel = new THREE.Vector3(
    hitDir.x * (speed.min + Math.random() * (speed.max - speed.min)) + (Math.random()-0.5) * spread * 6,
    hitDir.y * (speed.min + Math.random() * (speed.max - speed.min)) + (Math.random() - 0.5) * 1.0,
    hitDir.y * (speed.min + Math.random() * (speed.max - speed.min)) + (Math.random() - 0.6) * 1.2,
    hitDir.z * (speed.min + Math.random() * (speed.max - speed.min)) + (Math.random()-0.5) * spread * 6
  );
  vel.y -= 0.4;

  const isMist = Math.random() < profile.mistDensity * 0.3;
  this._spawnDrop(pos, vel, {
    color:      SLIME_ANATOMY[organ]?.color || 0xaa0000,
    radius:     isMist ? 0.005 + Math.random() * 0.008 : 0.012 + Math.random() * 0.025,
    life:       isMist ? 1.0 + Math.random() * 0.5 : 2.5 + Math.random() * 1.5,
    maxBounces: isMist ? 0 : 3,
    viscosity:  SLIME_VISCOSITY,
    isMist,
  });
}

// Exit wound spray if applicable
if (profile.exitWound) {
  const exitCount = Math.ceil(count * 0.6 * profile.exitScale);
  const exitDir = normal ? normal.clone() : new THREE.Vector3(0, 0, -1);
  for (let i = 0; i < exitCount; i++) {
    const vel = new THREE.Vector3(
      exitDir.x * (speed.min + Math.random() * speed.max) * profile.exitScale + (Math.random()-0.5)*3,
      exitDir.y * (speed.min + Math.random() * speed.max) * profile.exitScale + Math.random() * 2,
      exitDir.z * (speed.min + Math.random() * speed.max) * profile.exitScale + (Math.random()-0.5)*3
    );
    this._spawnDrop(pos, vel, {
      color:     0x880000,
      radius:    0.018 + Math.random() * 0.03,
      life:      2.0 + Math.random() * 2,
      maxBounces: 4,
      viscosity: SLIME_VISCOSITY,
    });
  }
}

// ENHANCEMENT 1 — Directional side spray (6 drops perpendicular to hit direction)
const sideVec = new THREE.Vector3(-hitDir.z, 0, hitDir.x).normalize();
for (let i = 0; i < 6; i++) {
  const sign  = (i % 2 === 0) ? 1 : -1;
  const spd2  = 2 + Math.random() * 3;
  const vel2  = new THREE.Vector3(
    sideVec.x * sign * spd2,
    -0.2,
    sideVec.z * sign * spd2
  );
  this._spawnDrop(pos, vel2, {
    color:      SLIME_ANATOMY[organ]?.color || 0xaa0000,
    radius:     0.008 + Math.random() * 0.010,
    life:       1.8 + Math.random() * 0.7,
    maxBounces: 0,
    viscosity:  0.65,
    isMist:     false,
  });
}

// ENHANCEMENT 2 — Wound drip trail (4 slow drops falling straight down)
for (let i = 0; i < 4; i++) {
  const vel3 = new THREE.Vector3(
    Math.random() * 0.15 - 0.075,
    -0.3 - Math.random() * 0.5,
    Math.random() * 0.15 - 0.075
  );
  this._spawnDrop(pos, vel3, {
    color:      SLIME_ANATOMY[organ]?.color || 0xaa0000,
    radius:     0.006 + Math.random() * 0.006,
    life:       2.5 + Math.random() * 1.5,
    maxBounces: 0,
    viscosity:  0.90,
    isMist:     false,
  });
}

// ENHANCEMENT 3 — Mist cloud (14 drops, 180-degree spread in hit normal plane)
for (let i = 0; i < 14; i++) {
  const angle4 = (Math.random() - 0.5) * Math.PI;
  const mSpd   = 0.8 + Math.random() * 1.7;
  const vel4   = new THREE.Vector3(
    (hitDir.x * Math.cos(angle4) - hitDir.z * Math.sin(angle4)) * mSpd,
    -0.05,
    (hitDir.z * Math.cos(angle4) + hitDir.x * Math.sin(angle4)) * mSpd
  );
  this._spawnDrop(pos, vel4, {
    color:      SLIME_ANATOMY[organ]?.color || 0xaa0000,
    radius:     0.003 + Math.random() * 0.004,
    life:       0.6 + Math.random() * 0.6,
    maxBounces: 0,
    viscosity:  0.20,
    isMist:     true,
  });
}

// Supersonic weapon: temporary cavity blood burst then collapse
if (profile.killStyle === 'supersonic') {
  this._supersonicCavity(pos, profile);
}

},

// ────────────────────────────────────────
//  SUPERSONIC CAVITY EFFECT (sniper)
// ────────────────────────────────────────
_supersonicCavity(pos, profile) {
// Huge outward burst
const burstCount = 40;
for (let i = 0; i < burstCount; i++) {
const angle = (i / burstCount) * Math.PI * 2;
const r     = 1.5 + Math.random() * 2;
const vel   = new THREE.Vector3(
Math.cos(angle) * r,
Math.random() * 2.5,
Math.sin(angle) * r
);
this._spawnDrop(pos, vel, {
color:      0xcc2200,
radius:     0.008 + Math.random() * 0.015,
life:       1.2 + Math.random(),
maxBounces: 1,
viscosity:  SLIME_VISCOSITY * 0.5, // fast — less viscous in mist
isMist:     true,
});
}
},

// ────────────────────────────────────────
//  SLASH/STAB BLOOD
// ────────────────────────────────────────
_slashBlood(pos, normal, profile, gore) {
// Slash produces a sheeting arc of blood following blade direction
const count = Math.ceil(profile.bloodVolume * 15);
for (let i = 0; i < count; i++) {
// Arc upward and to the side — simulates blade pulling blood off
const t = i / count;
const vel = new THREE.Vector3(
(Math.cos(t * Math.PI) * 2 + (Math.random()-0.5)) * 1.5,
1.5 + Math.random() * 2.5,
(Math.sin(t * Math.PI) * 2 + (Math.random()-0.5)) * 1.5
);
this._spawnDrop(pos, vel, {
color:     0xbb1100,
radius:    0.015 + Math.random() * 0.03,
life:      2.5 + Math.random() * 1.5,
maxBounces: 3,
viscosity: SLIME_VISCOSITY,
});
}

// Additional drips falling straight down from wound
for (let i = 0; i < 5; i++) {
  const vel = new THREE.Vector3(
    (Math.random()-0.5) * 0.2,
    -0.3 - Math.random() * 0.4,
    (Math.random()-0.5) * 0.2
  );
  this._spawnDrop(pos, vel, {
    color:     0xaa0000,
    radius:    0.012 + Math.random() * 0.02,
    life:      3.0 + Math.random(),
    maxBounces: 1,
    viscosity: SLIME_VISCOSITY * 1.2,
  });
}

},

// ────────────────────────────────────────
//  EXPLOSION BLOOD
// ────────────────────────────────────────
_explosionBlood(pos, profile, gore) {
const count = Math.ceil(profile.bloodVolume * 25);
for (let i = 0; i < count; i++) {
const angle  = Math.random() * Math.PI * 2;
const elev   = (Math.random() - 0.2) * Math.PI;
const speed  = profile.bloodVelocity.min + Math.random() * (profile.bloodVelocity.max - profile.bloodVelocity.min);
const vel    = new THREE.Vector3(
Math.cos(angle) * Math.cos(elev) * speed,
Math.abs(Math.sin(elev)) * speed + 2,
Math.sin(angle) * Math.cos(elev) * speed
);
this._spawnDrop(pos, vel, {
color:      0xcc1100,
radius:     0.015 + Math.random() * 0.04,
life:       3.0 + Math.random() * 2,
maxBounces: 4,
viscosity:  SLIME_VISCOSITY,
});
}
// Mist cloud
for (let i = 0; i < 60; i++) {
const vel = new THREE.Vector3(
(Math.random()-0.5) * 12,
Math.random() * 6,
(Math.random()-0.5) * 12
);
this._spawnDrop(pos, vel, {
color:     0xaa1100,
radius:    0.006 + Math.random() * 0.010,
life:      1.5 + Math.random(),
maxBounces: 0,
viscosity: 0.2,
isMist:    true,
});
}
},

// ────────────────────────────────────────
//  CAUTERIZE EFFECT (laser / flame)
// ────────────────────────────────────────
_cauterizeEffect(pos, profile) {
// Smoking sizzle — no blood drops, just dark char particles
for (let i = 0; i < 8; i++) {
const vel = new THREE.Vector3(
(Math.random()-0.5) * 0.5,
0.5 + Math.random() * 1.0,
(Math.random()-0.5) * 0.5
);
this._spawnDrop(pos, vel, {
color:     0x111111,
radius:    0.01 + Math.random() * 0.015,
life:      1.0 + Math.random(),
maxBounces: 0,
viscosity: 0.9,
charred:   true,
isMist:    true,
});
}
// Small flash of white-hot
for (let i = 0; i < 3; i++) {
const vel = new THREE.Vector3(
(Math.random()-0.5) * 2,
1.5 + Math.random(),
(Math.random()-0.5) * 2
);
this._spawnDrop(pos, vel, {
color:     0xffffff,
radius:    0.006,
life:      0.3 + Math.random() * 0.2,
maxBounces: 0,
viscosity: 0.1,
isMist:    true,
});
}
},

// ────────────────────────────────────────
//  ICE EFFECT
// ────────────────────────────────────────
_iceEffect(pos, profile) {
const count = Math.ceil(profile.bloodVolume * 12);
for (let i = 0; i < count; i++) {
const vel = new THREE.Vector3(
(Math.random()-0.5) * 3,
Math.random() * 2,
(Math.random()-0.5) * 3
);
this._spawnDrop(pos, vel, {
color:     0x88ccff,
radius:    0.01 + Math.random() * 0.02,
life:      4.0 + Math.random() * 2,
maxBounces: 2,
viscosity: 0.9, // thick — crystallizing
frozen:    true,
});
}
},

// ────────────────────────────────────────
//  ELECTRIC EFFECT
// ────────────────────────────────────────
_electricEffect(pos, profile) {
// Blood boils from wound — steam + few drops
for (let i = 0; i < 15; i++) {
const vel = new THREE.Vector3(
(Math.random()-0.5) * 4,
1 + Math.random() * 3,
(Math.random()-0.5) * 4
);
this._spawnDrop(pos, vel, {
color:     0xffdd00,
radius:    0.007 + Math.random() * 0.012,
life:      0.5 + Math.random() * 0.5,
maxBounces: 0,
viscosity: 0.05,
isMist:    true,
});
}
// Some actual blood drops after arc
setTimeout(() => {
for (let i = 0; i < 8; i++) {
const vel = new THREE.Vector3(
(Math.random()-0.5) * 2,
0.5 + Math.random() * 1.5,
(Math.random()-0.5) * 2
);
this._spawnDrop(pos, vel, {
color:     0xaa0000,
radius:    0.015 + Math.random() * 0.02,
life:      2.0 + Math.random(),
maxBounces: 3,
viscosity:  SLIME_VISCOSITY,
});
}
}, 150);
},

// ────────────────────────────────────────
//  ORGAN DEATH REACTION
//  Unique behavior when each organ is destroyed
// ────────────────────────────────────────
_organDeathReaction(enemy, gore, organ, pos, profile) {
const p = pos || (enemy.mesh ? enemy.mesh.position : new THREE.Vector3());

switch (organ) {
  case 'brain':
    // Sudden massive mist burst from top of slime — neural fluid
    this._spawnBloodBurst(p, null, 25, 0xaaffaa, 'brain');
    // Enemy immediately goes limp — handled externally by calling code checking killedBy
    break;

  case 'heart':
    // Massive arterial pump — 3 huge spurts before death
    const pumpPos = p.clone().add(new THREE.Vector3(0, 0.2, 0));
    for (let pulse = 0; pulse < 3; pulse++) {
      setTimeout(() => {
        if (!this.scene) return;
        for (let i = 0; i < 20; i++) {
          const vel = new THREE.Vector3(
            (Math.random()-0.5) * 5,
            3 + Math.random() * 4,
            (Math.random()-0.5) * 5
          );
          this._spawnDrop(pumpPos, vel, {
            color:     0xff0000,
            radius:    0.03 + Math.random() * 0.02,
            life:      3.0 + Math.random(),
            maxBounces: 3,
            viscosity:  SLIME_VISCOSITY,
          });
        }
      }, pulse * 180);
    }
    break;

  case 'guts':
    // Slow deflation — constant low trickle, enemy shrinks
    // Spawn many slow dripping drops downward
    for (let i = 0; i < 30; i++) {
      setTimeout(() => {
        if (!this.scene) return;
        const vel = new THREE.Vector3(
          (Math.random()-0.5) * 0.5,
          -0.2 - Math.random() * 0.8,
          (Math.random()-0.5) * 0.5
        );
        this._spawnDrop(p, vel, {
          color:     0x55cc33,
          radius:    0.012 + Math.random() * 0.018,
          life:      3.0 + Math.random(),
          maxBounces: 1,
          viscosity:  SLIME_VISCOSITY * 1.3,
        });
      }, i * 60);
    }
    break;

  case 'membrane':
    // Outer burst — spray outward in all directions
    this._spawnBloodBurst(p, null, 35, 0x33ee44, 'membrane');
    break;

  case 'coreFluid':
    // Vital core gone — full deflation burst
    this._spawnBloodBurst(p, null, 50, 0x00ff88, 'core');
    break;
}

},

// ────────────────────────────────────────
//  KILL EXPLOSION
//  Final death — depends on weapon and killedBy organ
// ────────────────────────────────────────
_killExplosion(pos, profile, killedBy, enemy) {

var chunkColor = (enemy && enemy.enemyType) ?
  { slime: 0x22aa33, crawler: 0x8B4513, leaping_slime: 0x00bfff }[enemy.enemyType] || 0x22aa33
  : 0x22aa33;

if (profile.killStyle === 'vaporize' || profile.killStyle === 'explosion') {
  // MASSIVE chunk explosion
  this._spawnChunks(pos, null, 15 + Math.floor(Math.random() * 10), profile, chunkColor);
  this._explosionBlood(pos, profile, null);
  return;
}

if (profile.killStyle === 'combust') {
  // Burning collapse — dark particles rising
  for (let i = 0; i < 40; i++) {
    const vel = new THREE.Vector3(
      (Math.random()-0.5) * 1.5,
      0.5 + Math.random() * 3,
      (Math.random()-0.5) * 1.5
    );
    this._spawnDrop(pos, vel, {
      color:     Math.random() < 0.5 ? 0x222222 : 0xff4400,
      radius:    0.01 + Math.random() * 0.02,
      life:      1.5 + Math.random(),
      maxBounces: 0,
      viscosity: 0.05,
      charred:   true,
      isMist:    true,
    });
  }
  return;
}

if (profile.killStyle === 'shatter') {
  // ICE SHATTER — frozen chunks + blue mist
  for (let i = 0; i < 12; i++) {
    const vel = new THREE.Vector3(
      (Math.random()-0.5) * 8,
      2 + Math.random() * 6,
      (Math.random()-0.5) * 8
    );
    this._spawnChunk(pos, vel, {
      color: 0x88ddff,
      size:  0.05 + Math.random() * 0.12,
    });
  }
  for (let i = 0; i < 30; i++) {
    const vel = new THREE.Vector3(
      (Math.random()-0.5) * 5,
      Math.random() * 4,
      (Math.random()-0.5) * 5
    );
    this._spawnDrop(pos, vel, {
      color:     0x88ccff,
      radius:    0.008 + Math.random() * 0.015,
      life:      3.0 + Math.random() * 2,
      maxBounces: 0,
      viscosity: 0.95,
      frozen:    true,
      isMist:    true,
    });
  }
  return;
}

// DEFAULT DEATH — based on which organ killed enemy
const deathBloodCount  = 120 + Math.floor(profile.bloodVolume * 40);
const deathColor       = SLIME_ANATOMY[killedBy]?.color || 0xaa0000;

switch (killedBy) {

  case 'brain':
    // Cross-eyed wobble → instant flat melt downward
    // Brain fluid + regular blood
    this._spawnBloodBurst(pos, null, deathBloodCount, 0xaaffaa, 'brain_death');
    this._spawnBloodBurst(pos, null, 20, deathColor, 'normal');
    break;

  case 'heart':
    // 3 massive cardiac pulses then collapse
    for (let p = 0; p < 4; p++) {
      setTimeout(() => {
        this._spawnBloodBurst(pos, null, 50, 0xff0000, 'pump');
      }, p * 150);
    }
    setTimeout(() => { this._spawnBloodBurst(pos, null, 50, 0xff0000, 'pump'); }, 360);
    setTimeout(() => { this._spawnBloodBurst(pos, null, 50, 0xff0000, 'pump'); }, 540);
    break;

  case 'guts':
    // Deflation — slime slowly sinks while leaking everywhere
    for (let i = 0; i < 80; i++) {
      setTimeout(() => {
        if (!this.scene) return;
        const vel = new THREE.Vector3(
          (Math.random()-0.5) * 1,
          -0.1 - Math.random() * 0.5,
          (Math.random()-0.5) * 1
        );
        this._spawnDrop(pos, vel, {
          color:     0x44cc22,
          radius:    0.01 + Math.random() * 0.02,
          life:      3.5 + Math.random(),
          maxBounces: 1,
          viscosity: SLIME_VISCOSITY * 1.4,
        });
      }, i * 40);
    }
    break;

  default: {
    // Normal violent death burst — overdone Hollywood style
    const _enemyTypeColors = { slime: 0x22aa33, crawler: 0x8B4513, leaping_slime: 0x00bfff };
    const _chunkCol = enemy && enemy.enemyType ? (_enemyTypeColors[enemy.enemyType] || 0x22aa33) : 0x22aa33;
    this._spawnBloodBurst(pos, null, deathBloodCount, deathColor, 'normal');
    // Some chunks for drama
    if (Math.random() < 0.5) {
      this._spawnChunks(pos, null, 3 + Math.floor(Math.random() * 4), profile, _chunkCol);
      this._spawnChunks(pos, null, 3 + Math.floor(Math.random() * 4), profile, chunkColor);
    }
    break;
  }
}

},

// ────────────────────────────────────────
//  INTERNAL HELPERS
// ────────────────────────────────────────
_spawnDrop(pos, vel, options = {}) {
let drop = this._drops.find(d => !d.active);
if (!drop) {
// Recycle oldest active drop
let oldest = null, oldestLife = Infinity;
for (const d of this._drops) {
if (d.active && d.life < oldestLife) { oldest = d; oldestLife = d.life; }
}
drop = oldest || this._drops[0];
if (drop) drop.deactivate();
drop = this._drops.find(d => !d.active) || this._drops[0];
}
if (drop) drop.reset(pos, vel, options);
return drop;
},

_spawnDecal(pos, radius, color) {
const mesh = this._decalMeshes[this._decalIndex % MAX_DECALS];
this._decalIndex++;
const decalY = (pos && typeof pos.y === 'number') ? pos.y : 0.06;
mesh.position.set(pos.x, decalY, pos.z);
mesh.scale.setScalar(radius * 3 + Math.random() * 0.15);
mesh.material.color.setHex(color || 0x880000);
mesh.material.opacity = 0.7 + Math.random() * 0.2;
mesh.visible = true;
// Fade after DECAL_FADE_TIME
const m = mesh;
const start = performance.now();
const fade = () => {
const elapsed = (performance.now() - start) / 1000;
if (elapsed >= DECAL_FADE_TIME) { m.visible = false; return; }
if (elapsed > DECAL_FADE_TIME - 3.0) {
m.material.opacity = Math.max(0, (DECAL_FADE_TIME - elapsed) / 3.0 * 0.7);
}
requestAnimationFrame(fade);
};
requestAnimationFrame(fade);
},

_spawnChunk(pos, vel, options = {}) {
let chunk = this._chunks.find(c => !c.active);
if (!chunk) {
chunk = this._chunks.find(c => c.active && c.life < 1.0) || this._chunks[0];
if (chunk) chunk.deactivate();
chunk = this._chunks.find(c => !c.active) || this._chunks[0];
}
if (chunk) chunk.reset(pos, vel, options);
return chunk;
},

_spawnChunks(pos, normal, count, profile, color) {
for (let i = 0; i < count; i++) {
const angle = Math.random() * Math.PI * 2;
const elev  = 0.3 + Math.random() * 0.5;
const speed = 3 + Math.random() * (profile.bloodVelocity?.max || 8) * 0.5;
const vel   = new THREE.Vector3(
Math.cos(angle) * Math.cos(elev) * speed,
Math.sin(elev) * speed + 1,
Math.sin(angle) * Math.cos(elev) * speed
);
this._spawnChunk(pos, vel, {
color: color || 0x22aa33,
size:  0.04 + Math.random() * 0.14,
});
}
},

_spawnBloodBurst(pos, direction, count, color, style) {
for (let i = 0; i < count; i++) {
let vel;
if (style === 'pump' || style === 'heart_death') {
// Upward fountain
vel = new THREE.Vector3(
(Math.random()-0.5) * 4,
3 + Math.random() * 5,
(Math.random()-0.5) * 4
);
} else if (style === 'brain_death') {
// Spray outward from top
const a = Math.random() * Math.PI * 2;
vel = new THREE.Vector3(
Math.cos(a) * (1 + Math.random() * 3),
1 + Math.random() * 4,
Math.sin(a) * (1 + Math.random() * 3)
);
} else if (style === 'ground') {
// Splat outward flat
const a = Math.random() * Math.PI * 2;
vel = new THREE.Vector3(
Math.cos(a) * (0.5 + Math.random() * 2),
0.1 + Math.random() * 0.5,
Math.sin(a) * (0.5 + Math.random() * 2)
);
} else {
// Default radial burst
const a = Math.random() * Math.PI * 2;
const e = (Math.random() - 0.3) * Math.PI;
const s = 2 + Math.random() * 6;
vel = new THREE.Vector3(
Math.cos(a) * Math.cos(e) * s,
Math.abs(Math.sin(e)) * s + Math.random() * 2,
Math.sin(a) * Math.cos(e) * s
);
}
this._spawnDrop(pos, vel, {
color,
radius:     0.012 + Math.random() * 0.03,
life:       2.5 + Math.random() * 2.0,
maxBounces: 3,
viscosity:  SLIME_VISCOSITY,
});
}
},

// ────────────────────────────────────────
//  UPDATE LOOP — call from game-loop.js
// ────────────────────────────────────────
update(dt) {
if (!this._initialized) return;
for (const d of this._drops)   d.update(dt);
for (const c of this._chunks)  c.update(dt);
for (const s of this._streams) s.update(dt);
for (const [id, gore] of this._enemyGoreMap) gore.update(dt);
},

// ────────────────────────────────────────
//  CLEANUP — call when scene resets
// ────────────────────────────────────────
reset() {
for (const d of this._drops)   d.deactivate();
for (const c of this._chunks)  c.deactivate();
for (const s of this._streams) s.active = false;
for (const m of this._decalMeshes) m.visible = false;
this._enemyGoreMap.clear();
this._streams = [];
},

// ────────────────────────────────────────
//  UTILITY — get kill description text
//  Use this for UI death messages / AI narration
// ────────────────────────────────────────
getKillDescription(weaponType, organ) {
const w = WEAPON_GORE[weaponType];
const o = SLIME_ANATOMY[organ];
const weaponDesc = w ? w.description : 'Unknown weapon.';
const organDesc  = o ? o.description : 'unknown organ';

const deaths = {
  brain:     'Neural fluid erupts. The slime cross-eyes, wobbles, and melts from the top down.',
  heart:     'The pumping core ruptures. Three massive spurts of arterial green. Collapse.',
  guts:      'The digestive sac deflates. Slow, wet, inevitable. Fluid pools beneath it.',
  membrane:  'The outer gel layer explodes outward. Raw exposed tissue. Instant agony.',
  coreFluid: 'Vital fluid drains away. The slime sags, shrinks, and dissolves into nothing.',
};

return {
  weapon: weaponDesc,
  organ:  organDesc,
  death:  deaths[organ] || 'It dies.',
};

},

// ────────────────────────────────────────
//  EXPOSE PROFILES for weapons.js to extend
// ────────────────────────────────────────
WEAPON_GORE,
SLIME_ANATOMY,
CRAWLER_ANATOMY,
};

// Expose globally
window.GoreSim = GoreSim;

console.log('[GORE PATCH v1 REALISTIC] Applied successfully');

// ─────────────────────────────────────────────
//  INTEGRATION INSTRUCTIONS (printed to console)
// ─────────────────────────────────────────────
console.log(`╔══════════════════════════════════════════════════════════╗ ║            GORE SIMULATOR v1.0  —  LOADED               ║ ╠══════════════════════════════════════════════════════════╣ ║                                                          ║ ║  1. In index.html, add AFTER blood-system.js:           ║ ║     <script src="js/gore-simulator.js"></script>        ║ ║                                                          ║ ║  2. In game-screens.js init():                          ║ ║     window.GoreSim.init(scene, camera);                 ║ ║                                                          ║ ║  3. In combat.js when bullet hits enemy:                ║ ║     window.GoreSim.onHit(                               ║ ║       enemy,        // enemy object with .mesh          ║ ║       'pistol',     // weapon type key                  ║ ║       hitPoint,     // THREE.Vector3 world pos          ║ ║       hitNormal     // THREE.Vector3 surface normal     ║ ║     );                                                   ║ ║                                                          ║ ║  4. In enemy-class.js death handler:                    ║ ║     window.GoreSim.onKill(enemy, weaponType);           ║ ║                                                          ║ ║  5. In game-loop.js animate():                          ║ ║     window.GoreSim.update(deltaTime);                   ║ ║                                                          ║ ║  6. On game reset:                                       ║ ║     window.GoreSim.reset();                             ║ ║                                                          ║ ║  WEAPON KEYS AVAILABLE:                                 ║ ║  pistol, revolver, shotgun, smg, sniper, minigun,       ║ ║  grenade, rocket, laser, plasma, knife, sword, axe,     ║ ║  flame, ice, lightning, knife_takedown                  ║ ║                                                          ║ ╚══════════════════════════════════════════════════════════╝`);

})(); // end IIFE
