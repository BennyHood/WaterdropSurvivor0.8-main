/**

- ╔══════════════════════════════════════════════════════════════════╗
- ║        BLOOD SYSTEM V2 — Water Drop Survivor                    ║
- ║        The most realistic browser gore simulator ever built     ║
- ║        File: js/blood-system-v2.js                              ║
- ║                                                                  ║
- ║  HOW TO USE — 5 STEPS:                                          ║
- ║                                                                  ║
- ║  STEP 1: In index.html/sandbox.html, ADD this script tag        ║
- ║          AFTER three.js, BEFORE enemy-class.js:                 ║
- ║          <script src="js/blood-system-v2.js"></script>          ║
- ║          (You can REMOVE the old blood-system.js line)          ║
- ║                                                                  ║
- ║  STEP 2: In game-screens.js inside init(), ADD:                 ║
- ║          window.BloodV2.init(scene);                            ║
- ║                                                                  ║
- ║  STEP 3: In game-loop.js inside animate(), ADD:                 ║
- ║          window.BloodV2.update(deltaTime);                      ║
- ║                                                                  ║
- ║  STEP 4: When a bullet/weapon hits an enemy, CALL:              ║
- ║          window.BloodV2.hit(enemy, weaponKey, hitPoint, normal) ║
- ║                                                                  ║
- ║  STEP 5: When an enemy dies, CALL:                              ║
- ║          window.BloodV2.kill(enemy, weaponKey)                  ║
- ║                                                                  ║
- ║  RESET between runs:                                            ║
- ║          window.BloodV2.reset()                                  ║
- ║                                                                  ║
- ║  That's it. Everything else is automatic.                       ║
- ╚══════════════════════════════════════════════════════════════════╝
- 
- DESIGN PRINCIPLES:
- — Zero garbage collection: ALL objects are pre-allocated pools
- — Zero new THREE.Vector3() during gameplay: reuse scratch vectors
- — InstancedMesh for blood drops (1 draw call for 500 drops)
- — InstancedMesh for mist particles (1 draw call for 250)
- — Ground decals are merged geometry — 1 draw call total
- — Flesh chunks: pooled regular meshes (cheap, < 30 max)
- — Wound decals on enemy: projected circle on enemy surface
- — Arterial streams: particle jets, pressure-simulated
- — Full physics: gravity, drag, viscosity, bounce, coalesce
- — Per-enemy anatomy: 5 organs, each with HP and bleed rate
- — 18 weapon profiles — every weapon is physically distinct
  */

;(function (global) {
'use strict';

// ══════════════════════════════════════════
//  POOL SIZES — tuned for mobile performance
//  Change these if you need more / less
//  PERFORMANCE FIX 1D: Reduced from 500/250 to 120 max total
// ══════════════════════════════════════════
var _bsMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || ('ontouchstart' in window && navigator.maxTouchPoints > 1);
var CFG = {
DROP_COUNT:       _bsMobile ? 48 : 80,    // blood drop instances (reduced for mobile)
MIST_COUNT:       _bsMobile ? 32 : 64,    // fine mist instances
CHUNK_COUNT:      _bsMobile ? 20 : 40,    // flesh/slime chunks   (pooled Mesh)
DECAL_COUNT:      _bsMobile ? 80 : 200,   // ground blood decals  (pooled Mesh)
WOUND_PER_ENEMY:  8,     // max wounds on one enemy body
STREAM_COUNT:     _bsMobile ? 8 : 16,     // arterial pump streams
GRAVITY:         -16.0,
GROUND_Y:         0.01,   // small offset above ground plane to prevent z-fighting
DECAL_FADE:       _bsMobile ? 120.0 : 300.0,  // shorter decal life on mobile for perf
DRIP_RATE:        0.15,  // seconds between wound drips (base)
PUMP_RATE:        0.05,  // seconds between arterial pumps
BOUNCE_DECAL_PROB: 0.10, // probability of spawning a decal on first bounce
// V-cone spray constants
BLOOD_SPRAY_CONE_HALF_ANGLE: 0.61, // ~35 degrees — aperture of bullet exit V-cone
BLOOD_SPRAY_GRAVITY_MULTIPLIER: -2.0, // downward arc bias for exit spray drops
// Arterial pumping constants
ARTERIAL_PHASE_INCREMENT: 0.45, // phase step per pump tick for sine-wave pulsation
// Blood mist cloud constants
MIST_CLOUD_GRAVITY_FACTOR:    0.04,  // fraction of GRAVITY applied to cloud puffs (nearly weightless)
MIST_CLOUD_DRAG_BOOST:        2.5,   // extra drag multiplier so clouds decelerate into a floating hover
MIST_CLOUD_EXPAND_SCALE:      0.55,  // cloud base-radius is multiplied by this to get per-frame expand rate
MIST_CLOUD_MAX_COUNT:         10,    // cap cloud puffs per hit for non-explosive weapons
MIST_CLOUD_MAX_COUNT_EXP:     16,    // cap for explosive weapons
MIST_CLOUD_VERTICAL_SCALE:    0.35,  // fraction of outward speed converted to upward drift
MIST_CLOUD_UPWARD_BIAS:       0.08,  // constant upward velocity added to every puff (slow rise)
MIST_CLOUD_RADIUS_MIN_FACTOR: 0.45,  // puff start radius is at least baseR * this value
MIST_CLOUD_RADIUS_RANGE:      0.55,  // random range added on top of RADIUS_MIN_FACTOR
MIST_CLOUD_EXPAND_MIN_FACTOR: 0.5,   // minimum expand-rate multiplier (keeps puffs from being static)
MIST_CLOUD_EXPAND_RANGE:      1.0,   // random range added on top of EXPAND_MIN_FACTOR
};

function _bsCreateCircleTexture(size) {
var texSize = size || 128;
function _solidFallbackTexture() {
return null;
}
var canvas = document.createElement('canvas');
canvas.width = texSize;
canvas.height = texSize;
if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
  return _solidFallbackTexture();
}
var ctx = null;
try { ctx = canvas.getContext('2d'); } catch (_e) { return _solidFallbackTexture(); }
if (!ctx) return _solidFallbackTexture();
var r = texSize * 0.5;
var g = ctx.createRadialGradient(r, r, texSize * 0.12, r, r, r);
g.addColorStop(0,   'rgba(255,255,255,1)');
g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
g.addColorStop(0.8, 'rgba(255,255,255,0.35)');
g.addColorStop(1,   'rgba(255,255,255,0)');
ctx.clearRect(0, 0, texSize, texSize);
ctx.fillStyle = g;
ctx.fillRect(0, 0, texSize, texSize);
var tex = new THREE.CanvasTexture(canvas);
tex.needsUpdate = true;
tex.generateMipmaps = false;
tex.minFilter = THREE.LinearFilter;
tex.magFilter = THREE.LinearFilter;
return tex;
}

function _bsLoadParticleTexture(path) {
var fallback = _bsCreateCircleTexture(128);
if (!fallback) return null;
var texture = (typeof fallback.clone === 'function') ? fallback.clone() : fallback;
texture.needsUpdate = true;
try {
var loader = new THREE.TextureLoader();
loader.load(path, function (loaded) {
  texture.image = loaded.image;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
}, undefined, function () {
  // Keep fallback when texture fails to load.
});
} catch (_e) {}
return texture;
}

// ══════════════════════════════════════════
//  COLOURS — per enemy type
//  Add more when you add more enemy types
// ══════════════════════════════════════════
var ENEMY_BLOOD = {
slime:         { base: 0x22cc44, dark: 0x117722, organ: 0x00ff88, mist: 0x55ff66 },
bug:           { base: 0xaadd00, dark: 0x667700, organ: 0xddff00, mist: 0xccee33 },
human:         { base: 0xcc1100, dark: 0x880000, organ: 0xff3300, mist: 0xee2200 },
alien:         { base: 0x8800ff, dark: 0x440088, organ: 0xcc44ff, mist: 0xaa33ee },
robot:         { base: 0x88aaff, dark: 0x334488, organ: 0xffffff, mist: 0xaaccff },
crawler:       { base: 0x994422, dark: 0x662200, organ: 0xcc6633, mist: 0xbb7744 },
leaping_slime: { base: 0x00bfff, dark: 0x0090cc, organ: 0x00ffff, mist: 0x55ddff },
skinwalker:    { base: 0x220000, dark: 0x0a0000, organ: 0x550011, mist: 0x330000 },
default:       { base: 0xcc1100, dark: 0x880000, organ: 0xff3300, mist: 0xee2200 },
};

// ══════════════════════════════════════════
//  WEAPON PROFILES
//  Every single physical property that makes
//  each weapon look and feel completely unique
// ══════════════════════════════════════════
var WEAPONS = {

// ── PISTOL ─────────────────────────────────────────────────────
pistol: {
label:         'Pistol',
woundR:        0.045,      // wound radius on body
penetration:   0.40,       // 0=surface 1=full through
exitWound:     true,
exitScale:     1.9,        // exit hole bigger than entry
dropCount:     30,         // blood drops per hit
dropSpeed:     [4.0, 12.0], // [min,max] m/s
mistCount:     18,
mistSpeed:     [1.0, 3.5],
chunkChance:   0.3,
chunkCount:    [3,6],
pushForce:     0.35,
organDmg:      18,
pumpOnHeart:   true,
killStyle:     'penetration',
},

// ── REVOLVER ───────────────────────────────────────────────────
revolver: {
label:         'Revolver',
woundR:        0.060,
penetration:   0.65,
exitWound:     true,
exitScale:     2.6,
dropCount:     45,
dropSpeed:     [5.5, 12.0],
mistCount:     30,
mistSpeed:     [2.0, 5.0],
chunkChance:   0.38,
chunkCount:    [4,8],
pushForce:     0.8,
organDmg:      28,
pumpOnHeart:   true,
// Hydrostatic shockwave: radial mist burst
shockwave:     true,
shockR:        0.8,
killStyle:     'penetration',
},

// ── SHOTGUN ────────────────────────────────────────────────────
shotgun: {
label:         'Shotgun',
woundR:        0.22,
penetration:   0.25,
exitWound:     false,
exitScale:     1.0,
dropCount:     180,        // MASSIVE blood volume
dropSpeed:     [7.0, 20.0],
mistCount:     90,
mistSpeed:     [3.0, 9.0],
chunkChance:   1.0,
chunkCount:    [12,28],
pushForce:     3.5,
organDmg:      55,
pellets:       9,          // spread pattern
pelletAngle:   28,         // degrees
pumpOnHeart:   true,
killStyle:     'devastation',
},

// ── SMG ────────────────────────────────────────────────────────
smg: {
label:         'SMG',
woundR:        0.032,
penetration:   0.38,
exitWound:     true,
exitScale:     1.4,
dropCount:     24,
dropSpeed:     [3.0, 7.0],
mistCount:     15,
mistSpeed:     [1.0, 3.0],
chunkChance:   0.3,
chunkCount:    [3,6],
pushForce:     0.20,
organDmg:      12,
pumpOnHeart:   true,
killStyle:     'perforation',
},

// ── SNIPER ─────────────────────────────────────────────────────
sniper: {
label:         'Sniper Rifle',
woundR:        0.022,
penetration:   1.0,        // full through
exitWound:     true,
exitScale:     0.85,       // supersonic — exit nearly same size
dropCount:     54,
dropSpeed:     [10.0, 55.0],
mistCount:     60,
mistSpeed:     [5.0, 14.0],
chunkChance:   0.50,
chunkCount:    [4,9],
pushForce:     2.0,
organDmg:      80,
// Temporary cavity: huge outward burst then blood collapses inward
supersonicCavity: true,
cavityR:       4.5,
pumpOnHeart:   true,
killStyle:     'supersonic',
},

// ── MINIGUN ────────────────────────────────────────────────────
minigun: {
label:         'Minigun',
woundR:        0.028,
penetration:   0.32,
exitWound:     true,
exitScale:     1.2,
dropCount:     21,
dropSpeed:     [3.0, 6.5],
mistCount:     12,
mistSpeed:     [1.0, 3.0],
chunkChance:   0.32,
chunkCount:    [3,7],
pushForce:     0.18,
organDmg:      10,
pumpOnHeart:   true,
killStyle:     'saturation',
},

// ── GRENADE ────────────────────────────────────────────────────
grenade: {
label:         'Grenade',
woundR:        0.55,
penetration:   0.85,
exitWound:     false,
exitScale:     1.0,
dropCount:     240,
dropSpeed:     [14.0, 35.0],
mistCount:     150,
mistSpeed:     [6.0, 18.0],
chunkChance:   1.0,
chunkCount:    [11,24],
pushForce:     40.0,
organDmg:      200,
isExplosive:   true,
blastR:        3.5,
killStyle:     'explosion',
},

// ── ROCKET ─────────────────────────────────────────────────────
rocket: {
label:         'Rocket Launcher',
woundR:        0.90,
penetration:   1.0,
exitWound:     false,
exitScale:     1.0,
dropCount:     400,
dropSpeed:     [22.0, 55.0],
mistCount:     250,
mistSpeed:     [10.0, 25.0],
chunkChance:   1.0,
chunkCount:    [18,36],
pushForce:     50.0,
organDmg:      9999,
isExplosive:   true,
blastR:        6.0,
killStyle:     'vaporize',
},

// ── LASER ──────────────────────────────────────────────────────
laser: {
label:         'Laser',
woundR:        0.018,
penetration:   1.0,
exitWound:     true,
exitScale:     0.7,
dropCount:     9,          // cauterizes — barely bleeds
dropSpeed:     [0.3, 1.5],
mistCount:     0,
mistSpeed:     [0,0],
chunkChance:   0.3,
chunkCount:    [3,6],
pushForce:     0.05,
organDmg:      45,
cauterizes:    true,
smokeCount:    10,
pumpOnHeart:   false,
killStyle:     'cauterize',
},

// ── PLASMA ─────────────────────────────────────────────────────
plasma: {
label:         'Plasma Cannon',
woundR:        0.14,
penetration:   0.70,
exitWound:     false,
exitScale:     1.0,
dropCount:     66,
dropSpeed:     [5.0, 14.0],
mistCount:     45,
mistSpeed:     [2.0, 7.0],
chunkChance:   0.65,
chunkCount:    [5,11],
pushForce:     2.5,
organDmg:      60,
charEffect:    true,
pumpOnHeart:   true,
killStyle:     'melt',
},

// ── KNIFE ──────────────────────────────────────────────────────
knife: {
label:         'Knife',
woundR:        0.022,
penetration:   0.92,
exitWound:     false,
exitScale:     1.0,
dropCount:     36,
dropSpeed:     [0.5, 2.5],
mistCount:     0,
mistSpeed:     [0,0],
chunkChance:   0.3,
chunkCount:    [3,6],
pushForce:     0.08,
organDmg:      35,
isSlash:       true,
slashArc:      0.35,       // blood arc width
pumpOnHeart:   true,
killStyle:     'slash',
},

// ── SWORD ──────────────────────────────────────────────────────
sword: {
label:         'Sword',
woundR:        0.042,
penetration:   0.85,
exitWound:     false,
exitScale:     1.0,
dropCount:     75,
dropSpeed:     [1.0, 6.0],
mistCount:     9,
mistSpeed:     [0.5, 2.0],
chunkChance:   0.45,
chunkCount:    [4,8],
pushForce:     1.0,
organDmg:      50,
isSlash:       true,
slashArc:      0.80,
pumpOnHeart:   true,
killStyle:     'sever',
},

// ── AXE ────────────────────────────────────────────────────────
axe: {
label:         'Axe',
woundR:        0.09,
penetration:   0.98,
exitWound:     false,
exitScale:     1.0,
dropCount:     105,
dropSpeed:     [1.5, 7.5],
mistCount:     12,
mistSpeed:     [0.5, 2.5],
chunkChance:   0.80,
chunkCount:    [5,10],
pushForce:     2.5,
organDmg:      70,
isSlash:       true,
slashArc:      0.55,
pumpOnHeart:   true,
killStyle:     'cleave',
},

// ── FLAMETHROWER ───────────────────────────────────────────────
flame: {
label:         'Flamethrower',
woundR:        0.18,
penetration:   0.15,
exitWound:     false,
exitScale:     1.0,
dropCount:     6,
dropSpeed:     [0.1, 0.5],
mistCount:     0,
mistSpeed:     [0,0],
chunkChance:   0.3,
chunkCount:    [3,6],
pushForce:     0.4,
organDmg:      20,
cauterizes:    true,
smokeCount:    18,
burnsEnemy:    true,
pumpOnHeart:   false,
killStyle:     'combust',
},

// ── ICE SPEAR ──────────────────────────────────────────────────
ice: {
label:         'Ice Spear',
woundR:        0.065,
penetration:   0.55,
exitWound:     false,
exitScale:     1.0,
dropCount:     30,
dropSpeed:     [1.0, 4.0],
mistCount:     18,
mistSpeed:     [0.3, 1.5],
chunkChance:   0.3,
chunkCount:    [3,6],
pushForce:     0.4,
organDmg:      30,
freezesBlood:  true,
pumpOnHeart:   false,
killStyle:     'shatter',
},

// ── LIGHTNING ──────────────────────────────────────────────────
lightning: {
label:         'Lightning',
woundR:        0.035,
penetration:   1.0,
exitWound:     true,
exitScale:     1.0,
dropCount:     21,
dropSpeed:     [2.0, 7.0],
mistCount:     30,
mistSpeed:     [1.0, 4.0],
chunkChance:   0.36,
chunkCount:    [3,7],
pushForce:     4.0,
organDmg:      40,
electricEffect: true,
pumpOnHeart:   false,
killStyle:     'electrocute',
},

// ── KNIFE TAKEDOWN (your existing special) ─────────────────────
knife_takedown: {
label:         'Knife Takedown',
woundR:        0.026,
penetration:   0.98,
exitWound:     false,
exitScale:     1.0,
dropCount:     60,
dropSpeed:     [0.3, 1.5],
mistCount:     0,
mistSpeed:     [0,0],
chunkChance:   0.3,
chunkCount:    [3,6],
pushForce:     0.02,
organDmg:      120,
isSlash:       true,
slashArc:      0.20,
pumpOnHeart:   true,
isTakedown:    true,      // triggers execution sequence
killStyle:     'execution',
},

// ── METEOR ─────────────────────────────────────────────────────
meteor: {
label:         'Meteor',
woundR:        1.20,
penetration:   1.0,
exitWound:     false,
exitScale:     1.0,
dropCount:     600,
dropSpeed:     [25.0, 65.0],
mistCount:     375,
mistSpeed:     [12.0, 30.0],
chunkChance:   1.0,
chunkCount:    [23,46],
pushForce:     80.0,
organDmg:      9999,
isExplosive:   true,
blastR:        8.0,
killStyle:     'vaporize',
},

};

// ══════════════════════════════════════════
//  ANATOMY PROFILES
//  Every new enemy type you create gets an entry here.
//  organs: brain, heart, guts, membrane, core
//  yRange: normalized -1(bottom) to +1(top) of enemy mesh
// ══════════════════════════════════════════
var ANATOMY = {

slime: {
membrane: { hp:35,  maxHp:35,  yRange:[-1.0, 1.0], bleedRate:0.30, pumpBlood:false },
brain:    { hp:20,  maxHp:20,  yRange:[ 0.5, 1.0], bleedRate:0.15, pumpBlood:false },
heart:    { hp:45,  maxHp:45,  yRange:[ 0.1, 0.5], bleedRate:1.00, pumpBlood:true  },
guts:     { hp:65,  maxHp:65,  yRange:[-0.3, 0.1], bleedRate:0.60, pumpBlood:false },
core:     { hp:90,  maxHp:90,  yRange:[-1.0,-0.3], bleedRate:0.80, pumpBlood:false },
},

// Default anatomy — used for enemies without a specific enemyType
default: {
membrane: { hp:35,  maxHp:35,  yRange:[-1.0, 1.0], bleedRate:0.30, pumpBlood:false },
brain:    { hp:20,  maxHp:20,  yRange:[ 0.5, 1.0], bleedRate:0.15, pumpBlood:false },
heart:    { hp:45,  maxHp:45,  yRange:[ 0.1, 0.5], bleedRate:1.00, pumpBlood:true  },
guts:     { hp:65,  maxHp:65,  yRange:[-0.3, 0.1], bleedRate:0.60, pumpBlood:false },
core:     { hp:90,  maxHp:90,  yRange:[-1.0,-0.3], bleedRate:0.80, pumpBlood:false },
},

// Add more enemy types here as you build them:
// bug:   { membrane:{…}, brain:{…}, … },
// alien: { … },

};

// ══════════════════════════════════════════
//  INTERNAL STATE — pre-allocated
// ══════════════════════════════════════════

var _scene       = null;
var _ready       = false;
var _particleTex = null;
var _frame       = 0;   // frame counter for debug

// ── Scratch vectors (NEVER allocate in update loop) ──────────────
var _s0 = new THREE.Vector3();
var _s1 = new THREE.Vector3();
var _s2 = new THREE.Vector3();
var _m4 = new THREE.Matrix4();
var _q0 = new THREE.Quaternion();
var _col = new THREE.Color(); // scratch colour for setColorAt

// ── Blood drop InstancedMesh ──────────────────────────────────────
var _dropIM   = null;   // InstancedMesh for regular drops
var _mistIM   = null;   // InstancedMesh for fine mist
var _dropData = [];     // flat array of drop state objects
var _mistData = [];

// ── Flesh chunks ─────────────────────────────────────────────────
var _chunks   = [];

// ── Ground decals ─────────────────────────────────────────────────
var _decals   = [];
var _decalIdx = 0;

// ── Arterial streams ──────────────────────────────────────────────
var _streams  = [];

// ── Per-enemy gore state ─────────────────────────────────────────
var _goreMap  = new Map();   // enemyId → EnemyGoreState

// ══════════════════════════════════════════
//  DATA STRUCTURES (plain objects, no classes
//  to avoid GC from constructor calls)
// ══════════════════════════════════════════

function makeDrop() {
return {
alive:    false,
idx:      0,        // index into InstancedMesh
px:0, py:0, pz:0,  // position
vx:0, vy:0, vz:0,  // velocity
r:        0.015,    // radius
life:     0,
maxLife:  0,
viscosity:0.72,
bounces:  0,
maxBounces:3,
onGround: false,
color:    0xcc0000,
frozen:   false,
charred:  false,
isMist:   false,
isCloud:  false,    // true → billowing mist-cloud puff; uses special update path
expandRate: 0,      // radius growth per second (only used when isCloud=true)
};
}

function makeChunk() {
return {
alive:   false,
mesh:    null,
px:0, py:0, pz:0,
vx:0, vy:0, vz:0,
rx:0, ry:0, rz:0,
rvx:0, rvy:0, rvz:0,
life:    0,
size:    0.08,
bounces: 0,
color:   0xcc1100,
};
}

function makeDecal() {
return {
mesh:    null,
alive:   false,
life:    0,
maxLife: CFG.DECAL_FADE,
};
}

function makeStream() {
return {
alive:   false,
enemy:   null,
lx:0, ly:0, lz:0,  // local position on enemy
dx:0, dy:0, dz:0,  // direction (normalised)
pressure:1.0,
life:    0,
timer:   0,
color:   0xcc0000,
};
}

// ── Per-enemy gore ────────────────────────────────────────────────
function makeGoreState(enemy, enemyType) {
var profile = ANATOMY[enemyType] || ANATOMY.default;
var organs  = {};
for (var k in profile) {
organs[k] = { hp: profile[k].hp, maxHp: profile[k].maxHp };
}
return {
enemy:    enemy,
type:     enemyType || 'default',
organs:   organs,
wounds:   [],        // array of wound objects
killedBy: null,
alive:    true,
};
}

function makeWound() {
return {
alive:      false,
lx:0, ly:0, lz:0,   // local position on enemy
radius:     0.04,
depth:      0.0,
hits:       0,
organ:      'membrane',
dripTimer:  0,
cauterized: false,
frozen:     false,
color:      0xaa0000,
};
}

// ══════════════════════════════════════════
//  INIT — call once after scene exists
// ══════════════════════════════════════════
function init(scene) {
_scene = scene;
_buildDropPool();
_buildMistPool();
_buildChunkPool();
_buildDecalPool();
_ready = true;
console.log('!!! BLOOD V2 IS ALIVE !!! Pools: ' +
CFG.DROP_COUNT + ' drops, ' +
CFG.MIST_COUNT + ' mist, ' +
CFG.CHUNK_COUNT + ' chunks, ' +
CFG.DECAL_COUNT + ' decals'
);
}

// ══════════════════════════════════════════
//  POOL BUILDERS
// ══════════════════════════════════════════

function _buildDropPool() {
var geo = new THREE.SphereGeometry(1.0, 8, 6); // unit sphere, scaled per instance
if (!_particleTex) _particleTex = _bsLoadParticleTexture('assets/textures/blood-particle.png');
var dropMatOpts = {
  color: 0xffffff,
  vertexColors: true,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  blending: THREE.NormalBlending
};
if (_particleTex) {
dropMatOpts.map = _particleTex;
dropMatOpts.alphaMap = _particleTex;
}
var mat = new THREE.MeshBasicMaterial(dropMatOpts);

_dropIM = new THREE.InstancedMesh(geo, mat, CFG.DROP_COUNT);
_dropIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
_dropIM.instanceColor  = new THREE.InstancedBufferAttribute(
  new Float32Array(CFG.DROP_COUNT * 3), 3
);
_dropIM.instanceColor.setUsage(THREE.DynamicDrawUsage);
_dropIM.frustumCulled = false;
_dropIM.count = 0; // FIXED: Start at 0, will be set dynamically based on active drops
// BUG F: Set renderOrder for proper layering (drops render after background, before mist)
_dropIM.renderOrder = 1;
// Transparent particles should not write depth to avoid hard "crystal/square" artifacts.
_dropIM.material.depthWrite = false;
_dropIM.material.depthTest = true;
_scene.add(_dropIM);
_dropIM.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 999);

// Pre-create drop data objects
_dropData = [];
for (var i = 0; i < CFG.DROP_COUNT; i++) {
var d = makeDrop();
d.idx = i;
_dropData.push(d);
// Hide all instances initially
_m4.makeScale(0, 0, 0);
_dropIM.setMatrixAt(i, _m4);
_dropIM.setColorAt(i, _col.setHex(0xcc1100));
}
_dropIM.instanceMatrix.needsUpdate = true;
_dropIM.instanceColor.needsUpdate  = true;

}

function _buildMistPool() {
var geo = new THREE.SphereGeometry(1.0, 6, 4);
if (!_particleTex) _particleTex = _bsLoadParticleTexture('assets/textures/blood-particle.png');
var mistMatOpts = {
  color: 0xffffff,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  vertexColors: true,
  side: THREE.DoubleSide,
  blending: THREE.NormalBlending
};
if (_particleTex) {
mistMatOpts.map = _particleTex;
mistMatOpts.alphaMap = _particleTex;
}
var mat = new THREE.MeshBasicMaterial(mistMatOpts);

_mistIM = new THREE.InstancedMesh(geo, mat, CFG.MIST_COUNT);
_mistIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
_mistIM.instanceColor  = new THREE.InstancedBufferAttribute(
  new Float32Array(CFG.MIST_COUNT * 3), 3
);
_mistIM.instanceColor.setUsage(THREE.DynamicDrawUsage);
_mistIM.frustumCulled = false;
_mistIM.count = 0; // FIXED: Start at 0, will be set dynamically based on active mist
// BUG G: Fix mist rendering settings for near-camera visibility
_mistIM.renderOrder = 2; // Render after drops so mist appears on top
_mistIM.material.depthTest = true; // Must respect depth to avoid clipping through geometry
_mistIM.material.depthWrite = false; // Correct for transparent materials
_scene.add(_mistIM);
_mistIM.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 999);

_mistData = [];
for (var i = 0; i < CFG.MIST_COUNT; i++) {
var d = makeDrop();
d.idx    = i;
d.isMist = true;
_mistData.push(d);
_m4.makeScale(0, 0, 0);
_mistIM.setMatrixAt(i, _m4);
_mistIM.setColorAt(i, _col.setHex(0xcc1100));
}
_mistIM.instanceMatrix.needsUpdate = true;
_mistIM.instanceColor.needsUpdate  = true;

}

function _buildChunkPool() {
// Irregular polyhedron chunks — looks like torn flesh
var shapes = [
new THREE.DodecahedronGeometry(1.0, 0),
new THREE.TetrahedronGeometry(1.0, 0),
new THREE.OctahedronGeometry(1.0, 0),
];
var mat = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false });

_chunks = [];
for (var i = 0; i < CFG.CHUNK_COUNT; i++) {
var geo  = shapes[i % shapes.length];
var mesh = new THREE.Mesh(geo, mat.clone());
mesh.visible = false;
mesh.frustumCulled = false; // prevent chunks vanishing at screen edges
_scene.add(mesh);
var c    = makeChunk();
c.mesh   = mesh;
_chunks.push(c);
}

}

function _buildDecalPool() {
// Ground blood splatter decals
var geo = new THREE.CircleGeometry(1.0, 16);
if (!_particleTex) _particleTex = _bsLoadParticleTexture('assets/textures/blood-particle.png');
var mat = new THREE.MeshBasicMaterial({
transparent: true,
opacity:     0.80,
depthWrite:  false,
blending: THREE.NormalBlending,
depthTest:   true,
polygonOffset: true,
polygonOffsetFactor: -1,
polygonOffsetUnits: -1,
});
if (_particleTex) {
mat.map = _particleTex;
mat.alphaMap = _particleTex;
}

_decals = [];
for (var i = 0; i < CFG.DECAL_COUNT; i++) {
var mesh = new THREE.Mesh(geo, mat.clone());
mesh.rotation.x = -Math.PI / 2;
mesh.position.y = CFG.GROUND_Y;
mesh.visible    = false;
mesh.frustumCulled = false; // prevent decals vanishing at screen edges
mesh.renderOrder = 2;
_scene.add(mesh);
var d = makeDecal();
d.mesh = mesh;
_decals.push(d);
}

}

// ══════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════

/**

- hit(enemy, weaponKey, hitPoint, hitNormal)
- 
- enemy      — your enemy object. Needs:
- ```
            .mesh (THREE.Mesh or THREE.Object3D)
  ```
- ```
            .id or .uuid (unique identifier)
  ```
- ```
            .velocity (THREE.Vector3, optional)
  ```
- ```
            .enemyType (string: 'slime','bug'... optional)
  ```
- ```
            .alive (bool)
  ```
- weaponKey  — string key from WEAPONS table above
- hitPoint   — THREE.Vector3 world position of hit
- hitNormal  — THREE.Vector3 surface normal at hit (optional)
  */
// ══════════════════════════════════════════
//  DYNAMIC GORE LOD
//  < 15 enemies  → full physics / ultra-detailed gore
//  >= 15 enemies → skip physics, project flat decal only
// ══════════════════════════════════════════
function _isHighEntityMode() {
var cnt = 0;
if (window.enemies && Array.isArray(window.enemies)) {
cnt = window.enemies.length;
} else {
if (Array.isArray(window._activeSlimes))   cnt += window._activeSlimes.length;
if (Array.isArray(window._activeCrawlers)) cnt += window._activeCrawlers.length;
}
return cnt >= 15;
}

// Spawn a single flat directional blood decal directly onto the ground (Y=0.01)
// Used in HIGH-ENTITY mode to avoid all airborne trajectory math.
function _spawnLodDecal(ex, ez, col) {
var radius = 0.35 + Math.random() * 0.45;
_spawnDecal(ex + (Math.random() - 0.5) * 0.6, ez + (Math.random() - 0.5) * 0.6, radius, col.base);
// Second overlapping splat for visual richness without extra CPU cost
_spawnDecal(ex + (Math.random() - 0.5) * 0.3, ez + (Math.random() - 0.5) * 0.3, radius * 0.6, col.dark);
}

  function hit(enemy, weaponKey, hitPoint, hitNormal) {
  if (!_ready || !enemy) return;

var wp   = WEAPONS[weaponKey] || WEAPONS.pistol;
var eId  = enemy.id !== undefined ? enemy.id : enemy.uuid;
var eType = enemy.enemyType || 'default';
var col  = ENEMY_BLOOD[eType] || ENEMY_BLOOD.default;

// ── DYNAMIC GORE LOD ──────────────────────────────────────────────────
// HIGH-ENTITY MODE (>= 15 enemies): skip all physics, drop a flat decal only
if (_isHighEntityMode()) {
var _lodX = hitPoint ? hitPoint.x : (enemy.mesh ? enemy.mesh.position.x : 0);
var _lodZ = hitPoint ? hitPoint.z : (enemy.mesh ? enemy.mesh.position.z : 0);
_spawnLodDecal(_lodX, _lodZ, col);
return;
}
// LOW-ENTITY MODE (< 15 enemies): fall through to full physics below
var gs = _goreMap.get(eId);
if (!gs) {
gs = makeGoreState(enemy, eType);
_goreMap.set(eId, gs);
}
if (!gs.alive) return;

// Determine hit position
var hx = hitPoint ? hitPoint.x : (enemy.mesh ? enemy.mesh.position.x : 0);
var hy = hitPoint ? hitPoint.y : (enemy.mesh ? enemy.mesh.position.y : 0);
var hz = hitPoint ? hitPoint.z : (enemy.mesh ? enemy.mesh.position.z : 0);

var ex = enemy.mesh ? enemy.mesh.position.x : 0;
var ey = enemy.mesh ? enemy.mesh.position.y : 0;
var ez = enemy.mesh ? enemy.mesh.position.z : 0;
var esc = enemy.mesh ? enemy.mesh.scale.y : 1.0;

// Local Y on enemy body: -1=bottom, +1=top
var localY = (esc > 0.001) ? Math.max(-1, Math.min(1, (hy - ey) / (esc * 0.5 + 0.001))) : 0;

// Which organ was hit?
var organ = _getOrgan(gs.type, localY);

// Apply organ damage
var dmgAmount = wp.organDmg + (Math.random() * wp.organDmg * 0.3);
var organKilled = _damageOrgan(gs, organ, dmgAmount);

// Add / grow wound
var lx = hx - ex, ly = hy - ey, lz = hz - ez;
_addWound(gs, lx, ly, lz, wp.woundR, organ, wp, col);

// ── SPAWN BLOOD EFFECTS ──────────────────
if (wp.isExplosive) {
_fxExplosion(hx, hy, hz, wp, col);

} else if (wp.cauterizes) {
_fxCauterize(hx, hy, hz, wp);

} else if (wp.freezesBlood) {
_fxIce(hx, hy, hz, wp, col);

} else if (wp.electricEffect) {
_fxElectric(hx, hy, hz, wp, col);

} else if (wp.isSlash) {
_fxSlash(hx, hy, hz, hitNormal, wp, col);

} else {
_fxBullet(hx, hy, hz, hitNormal, wp, col);
if (wp.supersonicCavity) _fxSupersonic(hx, hy, hz, wp, col);
if (wp.shockwave) _fxShockwave(hx, hy, hz, wp, col);
}

// ── Blood mist cloud puff ──────────────────────────────────────────────────
// Spawn a billowing cloud of blood vapour at the impact site.
// Skipped for cauterize / freezing / electric weapons (they have their own visual).
// Count scales from wp.mistCount (weapon power); radius scales from wp.woundR (wound size).
if (!wp.cauterizes && !wp.freezesBlood && !wp.electricEffect) {
var _maxCloud = wp.isExplosive ? CFG.MIST_CLOUD_MAX_COUNT_EXP : CFG.MIST_CLOUD_MAX_COUNT;
var _cloudN   = Math.min(Math.max(3, Math.floor(wp.mistCount * 0.3)), _maxCloud);
var _cloudR   = Math.max(0.04, wp.woundR * 1.3);
_fxMistCloud(hx, hy, hz, col, _cloudN, _cloudR);
}

// Chunks
if (Math.random() < wp.chunkChance) {
var nc = wp.chunkCount[0] + Math.floor(Math.random() * (wp.chunkCount[1] - wp.chunkCount[0] + 1));
_spawnChunks(hx, hy, hz, hitNormal, nc, wp, col);
}

// Arterial pump on heart hit
if (organ === 'heart' && wp.pumpOnHeart) {
var anat = ANATOMY[gs.type] || ANATOMY.default;
if (anat.heart && anat.heart.pumpBlood) {
var existing = _streams.find(function(s){ return s.alive && s.enemy === enemy; });
if (!existing) {
_startStream(enemy, lx, ly + 0.1, lz, hitNormal, col.base, 7.0);
}
}
}

// Organ death reaction
if (organKilled) {
_organDeathFX(gs, organ, hx, hy, hz, wp, col);
}

return { organ: organ, organKilled: organKilled };

}

/**

- kill(enemy, weaponKey)
- Call when enemy health reaches zero
  */
  function kill(enemy, weaponKey) {
  if (!_ready || !enemy) return;

var wp   = WEAPONS[weaponKey] || WEAPONS.pistol;
var eId  = enemy.id !== undefined ? enemy.id : enemy.uuid;
var eType = enemy.enemyType || 'default';
var col  = ENEMY_BLOOD[eType] || ENEMY_BLOOD.default;

var ex = enemy.mesh ? enemy.mesh.position.x : 0;
var ey = enemy.mesh ? enemy.mesh.position.y : 0;
var ez = enemy.mesh ? enemy.mesh.position.z : 0;

var gs = _goreMap.get(eId);

// Stop all streams for this enemy
for (var i = 0; i < _streams.length; i++) {
if (_streams[i].enemy === enemy) _streams[i].alive = false;
}

// ── DYNAMIC GORE LOD ──────────────────────────────────────────────────
// HIGH-ENTITY MODE (>= 15 enemies): skip explosion physics, spray larger flat decals
if (_isHighEntityMode()) {
_spawnLodDecal(ex, ez, col);
_spawnLodDecal(ex + (Math.random() - 0.5) * 0.8, ez + (Math.random() - 0.5) * 0.8, col);
_spawnLodDecal(ex + (Math.random() - 0.5) * 0.5, ez + (Math.random() - 0.5) * 0.5, col);
if (gs) {
  gs.alive = false;
  for (var j = 0; j < gs.wounds.length; j++) gs.wounds[j].alive = false;
}
_goreMap.delete(eId);
return;
}
// LOW-ENTITY MODE (< 15 enemies): full explosion effects below

var killedBy = gs ? gs.killedBy : 'core';

// DEATH EXPLOSION based on weapon and organ
_killExplosion(ex, ey, ez, wp, col, killedBy, enemy);

if (gs) {
gs.alive = false;
for (var j = 0; j < gs.wounds.length; j++) gs.wounds[j].alive = false;
}
_goreMap.delete(eId);

}

/**

- update(dt) — call EVERY FRAME from game-loop.js
- dt = delta time in seconds (e.g. 0.016 for 60fps)
  */
  function update(dt) {
  if (!_ready) return;
  _frame++;

var dirty = false;

// ── Update blood drops ───────────────────
for (var i = 0; i < _dropData.length; i++) {
var d = _dropData[i];
if (!d.alive) continue;
_updateDrop(d, dt, _dropIM, false);
dirty = true;
}
if (dirty) {
  _dropIM.count = CFG.DROP_COUNT;
  _dropIM.instanceMatrix.needsUpdate = true;
  if (_dropIM.instanceColor) _dropIM.instanceColor.needsUpdate = true;
}

// ── Update mist ──────────────────────────
var mistDirty = false;
for (var i = 0; i < _mistData.length; i++) {
var d = _mistData[i];
if (!d.alive) continue;
_updateDrop(d, dt, _mistIM, true);
mistDirty = true;
}
if (mistDirty) {
  _mistIM.count = CFG.MIST_COUNT;
  _mistIM.instanceMatrix.needsUpdate = true;
  if (_mistIM.instanceColor) _mistIM.instanceColor.needsUpdate = true;
}

// ── Update chunks ────────────────────────
for (var i = 0; i < _chunks.length; i++) {
_updateChunk(_chunks[i], dt);
}

// ── Update streams ───────────────────────
for (var i = 0; i < _streams.length; i++) {
_updateStream(_streams[i], dt);
}

// ── Update per-enemy wounds (dripping) ───
for (var _gsEntry of _goreMap.values()) {
var gs = _gsEntry;
if (!gs.alive) continue;
var col = ENEMY_BLOOD[gs.type] || ENEMY_BLOOD.default;
var ex = gs.enemy.mesh ? gs.enemy.mesh.position.x : 0;
var ey = gs.enemy.mesh ? gs.enemy.mesh.position.y : 0;
var ez = gs.enemy.mesh ? gs.enemy.mesh.position.z : 0;
var evx = gs.enemy.velocity ? gs.enemy.velocity.x : 0;
var evz = gs.enemy.velocity ? gs.enemy.velocity.z : 0;
for (var j = 0; j < gs.wounds.length; j++) {
_updateWound(gs.wounds[j], dt, ex, ey, ez, evx, evz, col);
}
}

// ── Fade decals ──────────────────────────
// Throttle: only check 10 decals per frame to save CPU.
// Scale dt by (DECAL_COUNT/10) so that DECAL_FADE matches real seconds regardless of pool size.
var _decalDt = dt * (CFG.DECAL_COUNT / 10);
var startD = (_frame * 10) % CFG.DECAL_COUNT;
for (var i = 0; i < 10; i++) {
var dd = _decals[(startD + i) % CFG.DECAL_COUNT];
if (!dd.alive) continue;
dd.life -= _decalDt;
if (dd.life <= 0) {
dd.alive = false;
dd.mesh.visible = false;
} else if (dd.life < 4.0) {
dd.mesh.material.opacity = (dd.life / 4.0) * 0.80;
}
}

}

/**

- reset() — call between runs to clear everything
  */
  function reset() {
  for (var i = 0; i < _dropData.length; i++) _killDrop(_dropData[i], _dropIM);
  for (var i = 0; i < _mistData.length; i++) _killDrop(_mistData[i], _mistIM);
  for (var i = 0; i < _chunks.length;  i++) _killChunk(_chunks[i]);
  for (var i = 0; i < _streams.length; i++) _streams[i].alive = false;
  for (var i = 0; i < _decals.length;  i++) { _decals[i].alive = false; _decals[i].mesh.visible = false; }
  _goreMap.clear();
  _streams = [];
  if (_dropIM) _dropIM.instanceMatrix.needsUpdate = true;
  if (_mistIM) _mistIM.instanceMatrix.needsUpdate = true;
  }

// ══════════════════════════════════════════
//  PHYSICS UPDATE — blood drop
// ══════════════════════════════════════════
function _updateDrop(d, dt, im, isMist) {
d.life -= dt;
if (d.life <= 0) { _killDrop(d, im); return; }

var misty = isMist || d.isMist;

// ── Blood mist cloud: billowing puff that expands and fades in-air ──
if (d.isCloud) {
  // Expand radius over time — cloud puffs billow outward
  d.r += d.expandRate * dt;
  // Extremely weak gravity — cloud stays at roughly the same height
  d.vy += CFG.GRAVITY * dt * CFG.MIST_CLOUD_GRAVITY_FACTOR;
  // High drag — cloud slows almost immediately into a hovering drift
  var cSpd2 = d.vx*d.vx + d.vy*d.vy + d.vz*d.vz;
  var cDrag  = 1.0 - d.viscosity * dt * Math.sqrt(cSpd2) * 0.5 * CFG.MIST_CLOUD_DRAG_BOOST;
  if (cDrag < 0) cDrag = 0;
  d.vx *= cDrag; d.vy *= cDrag; d.vz *= cDrag;
  // Integrate position
  d.px += d.vx * dt;
  d.py += d.vy * dt;
  d.pz += d.vz * dt;
  // Clamp: cloud puffs float just above the ground surface
  if (d.py < CFG.GROUND_Y + 0.05) d.py = CFG.GROUND_Y + 0.05;
  // Fade opacity linearly with remaining life (full at birth → invisible at death)
  var cFade = d.life / d.maxLife;
  var cS    = d.r * cFade;
  _m4.makeScale(cS, cS, cS);
  _m4.setPosition(d.px, d.py, d.pz);
  im.setMatrixAt(d.idx, _m4);
  im.setColorAt(d.idx, _col.setHex(d.color));
  return;
}

if (d.onGround) {
  if (misty) {
    // Mist dissipates into a hazy puddle instead of sitting as a solid decal
    d.life = Math.min(d.life, 0.3);
    var ma = Math.max(0.15, d.life / d.maxLife);
    _m4.makeScale(d.r * 3 * ma, 0.02 * ma, d.r * 3 * ma);
    _m4.setPosition(d.px, CFG.GROUND_Y, d.pz);
    im.setMatrixAt(d.idx, _m4);
    return;
  }
  // Settled: slowly spread as puddle, fade near end
  d.r = Math.min(d.r + dt * 0.008, 0.025);
  if (d.life < 2.5) {
    var a = d.life / 2.5;
    _m4.makeScale(d.r * 5 * a, 0.04 * a, d.r * 5 * a);
    _m4.setPosition(d.px, CFG.GROUND_Y, d.pz);
    im.setMatrixAt(d.idx, _m4);
  }
  return;
}

// ── Gravity ────────────────────────────
d.vy += CFG.GRAVITY * dt * (misty ? 0.35 : 1);

// ── Viscous drag ───────────────────────
// Drag coefficient increases with speed (realistic)
var speed2 = d.vx * d.vx + d.vy * d.vy + d.vz * d.vz;
var drag   = 1.0 - d.viscosity * dt * Math.sqrt(speed2) * 0.5 * (misty ? 1.35 : 1);
if (drag < 0) drag = 0;
d.vx *= drag;
d.vy *= drag;
d.vz *= drag;

// ── Integrate ──────────────────────────
d.px += d.vx * dt;
d.py += d.vy * dt;
d.pz += d.vz * dt;

// ── Ground collision ───────────────────
if (d.py <= CFG.GROUND_Y) {
d.py = CFG.GROUND_Y;
if (d.bounces < d.maxBounces && !misty) {
// Realistic bounce: lose 60-70% energy, lateral bleeds off
var bounceY = Math.abs(d.vy) * Math.max(0.05, 0.35 - d.viscosity * 0.25);
d.vy = bounceY;
d.vx *= 0.55;
d.vz *= 0.55;
d.bounces++;
if (d.bounces === 1 && Math.random() < CFG.BOUNCE_DECAL_PROB) {
_spawnDecal(d.px, d.pz, d.r * 0.8, d.color);
}
} else {
d.vy = 0; d.vx = 0; d.vz = 0;
d.onGround = true;
if (!misty) _spawnDecal(d.px, d.pz, d.r * 1.2, d.color);
}
}

// ── Update InstancedMesh matrix ────────
var spd  = Math.sqrt(speed2);
var fade = misty ? Math.max(0.2, d.life / d.maxLife) : 1.0;
var s    = d.r * (misty ? 3.0 : 1.5) * fade;

if (!d.onGround && spd > 3.5 && !misty) {
// Elongate drop along velocity vector at high speed
var stretch = 1.0 + spd * 0.07;
_m4.makeScale(s, s * stretch, s);
// Orient along velocity — approximate with y-axis align
var len = spd + 0.0001;
_q0.set(
d.vz / len * 0.5,
0,
-d.vx / len * 0.5,
Math.sqrt(1 - 0.25 * (d.vx * d.vx + d.vz * d.vz) / (len * len))
);
_m4.makeRotationFromQuaternion(_q0);
_m4.scale(_s0.set(s, s * stretch, s));
} else if (d.onGround) {
_m4.makeScale(s, 0.03, s);
} else {
_m4.makeScale(s, s, s);
}

_m4.setPosition(d.px, d.py, d.pz);
im.setMatrixAt(d.idx, _m4);
im.setColorAt(d.idx, _col.setHex(d.color));

}

// ══════════════════════════════════════════
//  PHYSICS UPDATE — flesh chunk
// ══════════════════════════════════════════
function _updateChunk(c, dt) {
if (!c.alive) return;
c.life -= dt;
if (c.life <= 0) { _killChunk(c); return; }

// Gravity
c.vy += CFG.GRAVITY * 0.65 * dt;
// Drag
c.vx *= (1.0 - 0.45 * dt);
c.vy *= (1.0 - 0.10 * dt);
c.vz *= (1.0 - 0.45 * dt);
// Integrate
c.px += c.vx * dt;
c.py += c.vy * dt;
c.pz += c.vz * dt;
// Rotation
c.rx += c.rvx * dt;
c.ry += c.rvy * dt;
c.rz += c.rvz * dt;
c.rvx *= 0.93;
c.rvy *= 0.93;
c.rvz *= 0.93;

// Ground
if (c.py <= 0.04) {
c.py = 0.04;
if (c.bounces < 2) {
c.vy = Math.abs(c.vy) * 0.28;
c.vx *= 0.65;
c.vz *= 0.65;
c.bounces++;
// Mini blood splat when chunk lands
_spawnSplat(c.px, c.pz, c.size, c.color);
} else {
c.vy = 0; c.vx = 0; c.vz = 0;
if (c.life > 2.0) c.life = 2.0;
}
}

if (c.mesh) {
c.mesh.position.set(c.px, c.py, c.pz);
c.mesh.rotation.set(c.rx, c.ry, c.rz);
if (c.life < 1.5) c.mesh.material.opacity = c.life / 1.5;
}

}

// ══════════════════════════════════════════
//  PHYSICS UPDATE — arterial stream
// ══════════════════════════════════════════
function _updateStream(s, dt) {
if (!s.alive) return;
if (!s.enemy || !s.enemy.alive) { s.alive = false; return; }

s.life -= dt;
if (s.life <= 0) { s.alive = false; return; }

s.pressure = Math.max(0.1, s.life / 7.0);
s.timer   += dt;
var interval = CFG.PUMP_RATE / s.pressure;

if (s.timer >= interval) {
s.timer = 0;
_pumpStream(s);
}

}

function _pumpStream(s) {
var ex = s.enemy.mesh ? s.enemy.mesh.position.x : 0;
var ey = s.enemy.mesh ? s.enemy.mesh.position.y : 0;
var ez = s.enemy.mesh ? s.enemy.mesh.position.z : 0;
var wx = ex + s.lx, wy = ey + s.ly, wz = ez + s.lz;

s.phase += CFG.ARTERIAL_PHASE_INCREMENT;
if (s.phase >= Math.PI * 2) s.phase -= Math.PI * 2;  // keep in [0,2π] without modulo division
var sineBoost = 1.0 + Math.sin(s.phase) * 0.55;
var spd   = (3.5 + s.pressure * 9.5) * sineBoost;
var count = Math.max(1, Math.ceil(s.pressure * 6 * (0.5 + 0.5 * Math.abs(Math.sin(s.phase)))));

for (var i = 0; i < count; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = wx; d.py = wy; d.pz = wz;
d.vx = s.dx * spd + (Math.random()-0.5) * 0.8;
d.vy = s.dy * spd + Math.random() * 0.6 * s.pressure;
d.vz = s.dz * spd + (Math.random()-0.5) * 0.8;
d.r          = 0.022 * s.pressure + Math.random() * 0.015;
d.maxLife    = 1.8 + Math.random();
d.life       = d.maxLife;
d.viscosity  = 0.55;
d.bounces    = 0;
d.maxBounces = 2;
d.onGround   = false;
d.color      = s.color;
d.frozen     = false; d.charred = false;
}

}

// ══════════════════════════════════════════
//  WOUND DRIPPING
// ══════════════════════════════════════════
function _updateWound(w, dt, ex, ey, ez, evx, evz, col) {
if (!w.alive || w.cauterized || w.frozen) return;
var anat  = ANATOMY.default;
var oData = anat[w.organ];
if (!oData) return;

w.dripTimer += dt;
var rate = CFG.DRIP_RATE / (oData.bleedRate * (0.4 + w.depth));
if (w.dripTimer >= rate) {
w.dripTimer = 0;
var d = _getFreeDrop(_dropData);
if (!d) return;
d.alive = true;
d.px = ex + w.lx;
d.py = ey + w.ly;
d.pz = ez + w.lz;
d.vx = (Math.random()-0.5)*0.25 + evx*0.12;
d.vy = -0.45 - Math.random()*0.9;
d.vz = (Math.random()-0.5)*0.25 + evz*0.12;
d.r         = 0.009 + w.depth * 0.012;
d.maxLife   = 2.2 + Math.random();
d.life      = d.maxLife;
d.viscosity = 0.70;
d.bounces   = 0; d.maxBounces = 2;
d.onGround  = false;
d.color     = w.color;
d.frozen    = false; d.charred = false;
}

}

// ══════════════════════════════════════════
//  BLOOD EFFECT FUNCTIONS
// ══════════════════════════════════════════

function _fxBullet(hx, hy, hz, normal, wp, col) {
var nx = 0, ny = 0, nz = 1;
if (normal) {
_s1.set(normal.x, normal.y, normal.z);
if (_s1.lengthSq() > 0.0001) _s1.normalize();
nx = -_s1.x; ny = -_s1.y; nz = -_s1.z;
}

var count = wp.dropCount;
var sMin  = wp.dropSpeed[0], sMax = wp.dropSpeed[1];

// Compute tangent/bitangent for V-cone spread
var _tl;
var tx, ty, tz, bx, by, bz;
var absNX = Math.abs(nx), absNY = Math.abs(ny), absNZ = Math.abs(nz);
if (absNX <= absNY && absNX <= absNZ) {
_tl = Math.sqrt(ny*ny + nz*nz) || 1;
tx = 0; ty = -nz/_tl; tz = ny/_tl;
} else if (absNY <= absNX && absNY <= absNZ) {
_tl = Math.sqrt(nx*nx + nz*nz) || 1;
tx = -nz/_tl; ty = 0; tz = nx/_tl;
} else {
_tl = Math.sqrt(nx*nx + ny*ny) || 1;
tx = -ny/_tl; ty = nx/_tl; tz = 0;
}
bx = ny*tz - nz*ty;
by = nz*tx - nx*tz;
bz = nx*ty - ny*tx;
var coneHalfAngle = CFG.BLOOD_SPRAY_CONE_HALF_ANGLE;
var sinCone = Math.sin(coneHalfAngle);
var cosCone = Math.cos(coneHalfAngle);
var coneCount = Math.floor(count * 0.6);
var gravBias = CFG.BLOOD_SPRAY_GRAVITY_MULTIPLIER * sinCone;

for (var i = 0; i < count; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
var spd  = sMin + Math.random() * (sMax - sMin);
d.alive  = true;
d.px = hx; d.py = hy; d.pz = hz;
if (i < coneCount) {
// Per-particle angle for accurate V-cone distribution (cos/sin intentional per drop)
var angle = (i / coneCount) * Math.PI * 2;
var cosA = Math.cos(angle), sinA = Math.sin(angle);
d.vx = nx * spd * cosCone + (tx * cosA + bx * sinA) * spd * sinCone;
d.vy = ny * spd * cosCone + (ty * cosA + by * sinA) * spd * sinCone + gravBias;
d.vz = nz * spd * cosCone + (tz * cosA + bz * sinA) * spd * sinCone;
} else {
// Wider scatter for mist-edge drops outside the cone
var sctr = wp.woundR * 5;
var scatterMult  = 8;    // wider than the 6× default — emphasises the mist edge
var verticalBoost = 1.2; // slight upward jitter on edge drops
d.vx = nx * spd + (Math.random()-0.5) * sctr * scatterMult;
d.vy = ny * spd + Math.random() * verticalBoost + gravBias;
d.vz = nz * spd + (Math.random()-0.5) * sctr * scatterMult;
}
d.r         = 0.006 + Math.random()*0.009;
d.maxLife   = 2.5 + Math.random()*1.5;
d.life      = d.maxLife;
d.viscosity = 0.60;
d.bounces   = 0; d.maxBounces = 3;
d.onGround  = false;
d.color     = (i % 3 === 0) ? col.dark : col.base;
d.frozen    = false; d.charred = false;
}

// Mist
for (var i = 0; i < wp.mistCount; i++) {
var d = _getFreeDrop(_mistData);
if (!d) break;
var spd = wp.mistSpeed[0] + Math.random()*(wp.mistSpeed[1]-wp.mistSpeed[0]);
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = nx*spd + (Math.random()-0.5)*spd*0.8;
d.vy = ny*spd*0.6 + Math.random()*0.6;
d.vz = nz*spd + (Math.random()-0.5)*spd*0.8;
d.r         = 0.004 + Math.random()*0.007;
d.maxLife   = 0.8 + Math.random()*0.5;
d.life      = d.maxLife;
d.viscosity = 0.20;
d.bounces   = 0; d.maxBounces = 0;
d.onGround  = false;
d.color     = col.mist;
d.frozen    = false; d.charred = false;
}

// Exit wound
if (wp.exitWound) {
var ec = Math.ceil(wp.dropCount * 0.55);
for (var i = 0; i < ec; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
var spd = (sMin + Math.random()*(sMax-sMin)) * wp.exitScale;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = -nx*spd + (Math.random()-0.5)*3.5;
d.vy = 0.2 + Math.random()*0.5;
d.vz = -nz*spd + (Math.random()-0.5)*3.5;
d.r         = 0.008 + Math.random()*0.012;
d.maxLife   = 2.2 + Math.random()*2.0;
d.life      = d.maxLife;
d.viscosity = 0.58;
d.bounces   = 0; d.maxBounces = 4;
d.onGround  = false;
d.color     = col.dark;
d.frozen    = false; d.charred = false;
}
}

// ARTERIAL JET — high-pressure squirt from the wound
for (var i = 0; i < 8; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
var spd = 8.0 + Math.random() * 10.0;
var sctr = 0.08;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = nx * spd + (Math.random()-0.5) * sctr;
d.vy = ny * spd * 0.8 + Math.random() * 0.8;
d.vz = nz * spd + (Math.random()-0.5) * sctr;
d.r         = 0.018 + Math.random()*0.012;
d.maxLife   = 3.5 + Math.random()*1.5;
d.life      = d.maxLife;
d.viscosity = 0.45;
d.bounces   = 0; d.maxBounces = 3;
d.onGround  = false;
d.color     = col.base;
d.frozen    = false; d.charred = false;
}

}

function _fxSupersonic(hx, hy, hz, wp, col) {
// Huge radial cavity burst — then drops collapse back under gravity
var count = 55;
for (var i = 0; i < count; i++) {
var a = (i / count) * Math.PI * 2;
var r = 1.8 + Math.random() * wp.cavityR;
var d = _getFreeDrop(_mistData);
if (!d) d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = Math.cos(a) * r;
d.vy = Math.random() * 3.5;
d.vz = Math.sin(a) * r;
d.r         = 0.007 + Math.random()*0.012;
d.maxLife   = 0.9 + Math.random()*0.4;
d.life      = d.maxLife;
d.viscosity = 0.15;
d.bounces   = 0; d.maxBounces = 0;
d.onGround  = false;
d.color     = col.mist;
d.frozen    = false; d.charred = false;
}
}

function _fxShockwave(hx, hy, hz, wp, col) {
// Hydrostatic shockwave from heavy round — concentric ring of mist
var count = 24;
for (var i = 0; i < count; i++) {
var a = (i / count) * Math.PI * 2;
var r = 1.2 + Math.random() * 0.4;
var d = _getFreeDrop(_mistData);
if (!d) break;
d.alive = true;
d.px = hx + Math.cos(a)*0.05;
d.py = hy;
d.pz = hz + Math.sin(a)*0.05;
d.vx = Math.cos(a) * r;
d.vy = 0.3 + Math.random() * 0.5;
d.vz = Math.sin(a) * r;
d.r         = 0.005 + Math.random()*0.006;
d.maxLife   = 0.6 + Math.random()*0.3;
d.life      = d.maxLife;
d.viscosity = 0.10;
d.bounces   = 0; d.maxBounces = 0;
d.onGround  = false;
d.color     = col.mist;
d.frozen    = false; d.charred = false;
}
}

function _fxSlash(hx, hy, hz, normal, wp, col) {
// Blood arcs off blade in a wide fan — tripled for Hollywood overdone style
var count = wp.dropCount * 3;
for (var i = 0; i < count; i++) {
var t = i / count;
var arc = (t - 0.5) * Math.PI * wp.slashArc * 2;
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = Math.cos(arc) * (1.0 + Math.random() * 2.5);
d.vy = 0.4 + Math.random() * 0.8;
d.vz = Math.sin(arc) * (1.0 + Math.random() * 2.5);
d.r         = 0.007 + Math.random()*0.012;
d.maxLife   = 2.8 + Math.random()*1.5;
d.life      = d.maxLife;
d.viscosity = 0.68;
d.bounces   = 0; d.maxBounces = 3;
d.onGround  = false;
d.color     = col.base;
d.frozen    = false; d.charred = false;
}
// Drips straight down from wound site
for (var i = 0; i < 6; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = (Math.random()-0.5)*0.15;
d.vy = -0.25 - Math.random()*0.5;
d.vz = (Math.random()-0.5)*0.15;
d.r         = 0.010 + Math.random()*0.015;
d.maxLife   = 3.0 + Math.random();
d.life      = d.maxLife;
d.viscosity = 0.85;
d.bounces   = 0; d.maxBounces = 1;
d.onGround  = false;
d.color     = col.dark;
d.frozen    = false; d.charred = false;
}
// UPWARD ARC — 12 drops that rise and fall like a visible arc
for (var i = 0; i < 12; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
var spd = 3.0 + Math.random() * 4.0;
var a   = Math.random() * Math.PI * 2;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = Math.cos(a) * spd * 0.4;
d.vy = spd;
d.vz = Math.sin(a) * spd * 0.4;
d.r         = 0.010 + Math.random()*0.014;
d.maxLife   = 3.5 + Math.random()*1.0;
d.life      = d.maxLife;
d.viscosity = 0.55;
d.bounces   = 0; d.maxBounces = 3;
d.onGround  = false;
d.color     = col.base;
d.frozen    = false; d.charred = false;
}
}

function _fxSmear(x1, y1, z1, x2, y2, z2, count, color) {
var steps = count || 12;
for (var i = 0; i < steps; i++) {
var t = i / Math.max(steps - 1, 1);
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 0.04;
d.py = y1 + (y2 - y1) * t;
d.pz = z1 + (z2 - z1) * t + (Math.random() - 0.5) * 0.04;
d.vx = (Math.random() - 0.5) * 0.05;
d.vy = -1.5;
d.vz = (Math.random() - 0.5) * 0.05;
d.r         = 0.012 + Math.random() * 0.010;
d.maxLife   = 4.0 + Math.random();
d.life      = d.maxLife;
d.viscosity = 0.90;
d.bounces   = 0; d.maxBounces = 0;
d.onGround  = false;
d.color     = color || 0xaa0000;
d.frozen    = false; d.charred = false;
}
}

// ══════════════════════════════════════════
//  BLOOD MIST CLOUD
//  Spawns a billowing puff-cloud of blood mist at the hit point.
//  Particles expand radially (radius grows over life), drift slowly outward,
//  decelerate quickly into a hovering float, and fade with remaining life.
//  count  — number of puff particles (scaled by weapon power)
//  baseR  — starting radius of each puff (scaled by wound size)
// ══════════════════════════════════════════
function _fxMistCloud(hx, hy, hz, col, count, baseR) {
var n = count || 6;
for (var i = 0; i < n; i++) {
var d = _getFreeDrop(_mistData);
if (!d) break;
// Spread origin slightly so the cloud isn't a perfect ball
var offR = baseR * 0.4;
d.alive      = true;
d.isCloud    = true;
d.isMist     = true;
d.px = hx + (Math.random()-0.5)*offR;
d.py = hy + (Math.random()-0.5)*offR;
d.pz = hz + (Math.random()-0.5)*offR;
// Slow outward drift — cloud stays roughly at the wound location
var a   = Math.random() * Math.PI * 2;
var e   = (Math.random()-0.5) * Math.PI;
var spd = 0.25 + Math.random() * 0.75;
d.vx = Math.cos(a) * Math.cos(e) * spd;
d.vy = Math.abs(Math.sin(e)) * spd * CFG.MIST_CLOUD_VERTICAL_SCALE + CFG.MIST_CLOUD_UPWARD_BIAS;
d.vz = Math.sin(a) * Math.cos(e) * spd;
// Starting radius: vary each puff so the cloud looks uneven/organic
d.r          = baseR * (CFG.MIST_CLOUD_RADIUS_MIN_FACTOR + Math.random() * CFG.MIST_CLOUD_RADIUS_RANGE);
// Each puff expands at a different rate — gives the cloud a billowing feel
d.expandRate = baseR * CFG.MIST_CLOUD_EXPAND_SCALE * (CFG.MIST_CLOUD_EXPAND_MIN_FACTOR + Math.random() * CFG.MIST_CLOUD_EXPAND_RANGE);
d.maxLife    = 1.4 + Math.random() * 2.2;
d.life       = d.maxLife;
d.viscosity  = 0.88;   // high drag — puffs stop drifting quickly
d.bounces    = 0; d.maxBounces = 0;
d.onGround   = false;
d.color      = col.mist;
d.frozen     = false; d.charred = false;
}
}

function _fxExplosion(hx, hy, hz, wp, col) {
var count = wp.dropCount;
var sMin = wp.dropSpeed[0], sMax = wp.dropSpeed[1];
for (var i = 0; i < count; i++) {
var a = Math.random() * Math.PI * 2;
var e = (Math.random()-0.15) * Math.PI;
var spd = sMin + Math.random()*(sMax-sMin);
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = Math.cos(a)*Math.cos(e)*spd;
d.vy = Math.abs(Math.sin(e)*spd) + 2.0;
d.vz = Math.sin(a)*Math.cos(e)*spd;
d.r         = 0.014 + Math.random()*0.038;
d.maxLife   = 3.0 + Math.random()*2.0;
d.life      = d.maxLife;
d.viscosity = 0.52;
d.bounces   = 0; d.maxBounces = 4;
d.onGround  = false;
d.color     = (Math.random()<0.3) ? col.dark : col.base;
d.frozen    = false; d.charred = false;
}
// Dense mist cloud
var mc = wp.mistCount;
for (var i = 0; i < mc; i++) {
var d = _getFreeDrop(_mistData);
if (!d) break;
var spd = wp.mistSpeed[0] + Math.random()*(wp.mistSpeed[1]-wp.mistSpeed[0]);
var a   = Math.random() * Math.PI * 2;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = Math.cos(a)*spd;
d.vy = Math.random()*spd*0.5 + 1.0;
d.vz = Math.sin(a)*spd;
d.r         = 0.005 + Math.random()*0.009;
d.maxLife   = 1.2 + Math.random()*0.6;
d.life      = d.maxLife;
d.viscosity = 0.18;
d.bounces   = 0; d.maxBounces = 0;
d.onGround  = false;
d.color     = col.mist;
d.frozen    = false; d.charred = false;
}
}

function _fxCauterize(hx, hy, hz, wp) {
// Smoke + char particles, almost no blood
var count = wp.smokeCount || 12;
for (var i = 0; i < count; i++) {
var d = _getFreeDrop(_mistData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = (Math.random()-0.5)*0.6;
d.vy = 0.4 + Math.random()*1.2;
d.vz = (Math.random()-0.5)*0.6;
d.r         = 0.008 + Math.random()*0.014;
d.maxLife   = 1.0 + Math.random()*0.5;
d.life      = d.maxLife;
d.viscosity = 0.95;
d.bounces   = 0; d.maxBounces = 0;
d.onGround  = false;
d.color     = (Math.random()<0.6) ? 0x111111 : 0x333322;
d.charred   = true;
}
// Tiny white-hot flash drops
for (var i = 0; i < 4; i++) {
var d = _getFreeDrop(_mistData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = (Math.random()-0.5)*2.5; d.vy = 1.5+Math.random(); d.vz = (Math.random()-0.5)*2.5;
d.r = 0.004; d.maxLife = 0.25+Math.random()*0.15; d.life = d.maxLife;
d.viscosity = 0.05; d.bounces = 0; d.maxBounces = 0; d.onGround = false;
d.color = 0xffffff; d.frozen = false; d.charred = false;
}
// Very few blood drops (wound still bleeds a tiny bit despite cauterize)
for (var i = 0; i < wp.dropCount; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = (Math.random()-0.5)*0.4; d.vy = -0.1+Math.random()*0.3; d.vz = (Math.random()-0.5)*0.4;
d.r = 0.008; d.maxLife = 2.0; d.life = d.maxLife;
d.viscosity = 0.90; d.bounces = 0; d.maxBounces = 1; d.onGround = false;
d.color = 0x440000; d.frozen = false; d.charred = true;
}
}

function _fxIce(hx, hy, hz, wp, col) {
var count = wp.dropCount;
for (var i = 0; i < count; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = (Math.random()-0.5)*3.5; d.vy = Math.random()*2.5; d.vz = (Math.random()-0.5)*3.5;
d.r         = 0.010 + Math.random()*0.020;
d.maxLife   = 4.5 + Math.random()*2.0;
d.life      = d.maxLife;
d.viscosity = 0.92;
d.bounces   = 0; d.maxBounces = 1;
d.onGround  = false;
d.color     = 0x88ccff;
d.frozen    = true; d.charred = false;
}
// Ice crystal mist
for (var i = 0; i < wp.mistCount; i++) {
var d = _getFreeDrop(_mistData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = (Math.random()-0.5)*2; d.vy = Math.random()*1.5; d.vz = (Math.random()-0.5)*2;
d.r = 0.004; d.maxLife = 1.5+Math.random(); d.life = d.maxLife;
d.viscosity = 0.80; d.bounces = 0; d.maxBounces = 0; d.onGround = false;
d.color = 0xaaddff; d.frozen = true; d.charred = false;
}
}

function _fxElectric(hx, hy, hz, wp, col) {
// Yellow spark steam burst
for (var i = 0; i < 22; i++) {
var d = _getFreeDrop(_mistData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = (Math.random()-0.5)*5; d.vy = 1.0+Math.random()*3; d.vz = (Math.random()-0.5)*5;
d.r = 0.006+Math.random()*0.010; d.maxLife = 0.4+Math.random()*0.3; d.life = d.maxLife;
d.viscosity = 0.05; d.bounces = 0; d.maxBounces = 0; d.onGround = false;
d.color = (Math.random()<0.5) ? 0xffee00 : 0xffffff;
d.frozen = false; d.charred = false;
}
// Delayed actual blood (body is shocked, blood comes after)
var self = this;
setTimeout(function() {
if (!_ready) return;
for (var i = 0; i < wp.dropCount; i++) {
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = hx; d.py = hy; d.pz = hz;
d.vx = (Math.random()-0.5)*2.5; d.vy = 0.5+Math.random()*1.5; d.vz = (Math.random()-0.5)*2.5;
d.r = 0.012+Math.random()*0.018; d.maxLife = 2.0+Math.random(); d.life = d.maxLife;
d.viscosity = 0.62; d.bounces = 0; d.maxBounces = 3; d.onGround = false;
d.color = col.base; d.frozen = false; d.charred = false;
}
}, 120);
}

// ══════════════════════════════════════════
//  ORGAN DEATH EFFECTS
// ══════════════════════════════════════════
function _organDeathFX(gs, organ, hx, hy, hz, wp, col) {
switch (organ) {

case 'brain':
// Neural fluid eruption from top — greenish mist burst
_burstRadial(hx, hy+0.15, hz, 30, col.organ, 2.5, 6.0, 0.006, 0.010, 1.0, 0.2);
break;

case 'heart':
// 3 massive arterial pulses then silence — hollywood geyser
for (var p = 0; p < 3; p++) {
(function(pulse) {
setTimeout(function() {
if (!_ready) return;
_burstUpward(hx, hy+0.1, hz, 55, 0xff0000, 3.5+pulse, 16.0+pulse, 0.025, 0.04, 3.0, 0.55);
}, pulse * 170);
})(p);
}
break;

case 'guts':
// Slow deflation — timed drip stream downward
for (var t = 0; t < 45; t++) {
(function(tick) {
setTimeout(function() {
if (!_ready) return;
var d = _getFreeDrop(_dropData);
if (!d) return;
d.alive = true;
d.px = hx + (Math.random()-0.5)*0.15;
d.py = hy;
d.pz = hz + (Math.random()-0.5)*0.15;
d.vx = (Math.random()-0.5)*0.5;
d.vy = -0.15 - Math.random()*0.8;
d.vz = (Math.random()-0.5)*0.5;
d.r = 0.010+Math.random()*0.016; d.maxLife = 3.0+Math.random(); d.life = d.maxLife;
d.viscosity = 0.80; d.bounces = 0; d.maxBounces = 1; d.onGround = false;
d.color = 0x44cc22; d.frozen = false; d.charred = false;
}, tick * 55);
})(t);
}
break;

case 'membrane':
// Outward burst of gel
_burstRadial(hx, hy, hz, 40, col.base, 2.0, 8.0, 0.014, 0.034, 3.0, 0.58);
break;

case 'core':
_burstRadial(hx, hy, hz, 55, col.organ, 2.5, 9.0, 0.014, 0.032, 3.5, 0.55);
break;
}

}

// ══════════════════════════════════════════
//  KILL EXPLOSION — final death burst
// ══════════════════════════════════════════
function _killExplosion(ex, ey, ez, wp, col, killedBy, enemy) {

if (wp.killStyle === 'vaporize') {
_fxExplosion(ex, ey, ez, wp, col);
_spawnChunks(ex, ey, ez, null, wp.chunkCount[1], wp, col);
return;
}

if (wp.killStyle === 'combust') {
for (var i = 0; i < 50; i++) {
var d = _getFreeDrop(_mistData);
if (!d) break;
d.alive = true;
d.px = ex+(Math.random()-0.5)*0.2; d.py = ey; d.pz = ez+(Math.random()-0.5)*0.2;
d.vx = (Math.random()-0.5)*1.5; d.vy = 0.5+Math.random()*3.5; d.vz = (Math.random()-0.5)*1.5;
d.r = 0.010+Math.random()*0.018; d.maxLife = 1.5+Math.random(); d.life = d.maxLife;
d.viscosity = 0.05; d.bounces = 0; d.maxBounces = 0; d.onGround = false;
d.color = (Math.random()<0.4) ? 0xff4400 : 0x111111; d.frozen = false; d.charred = true;
}
return;
}

if (wp.killStyle === 'shatter') {
// ICE SHATTER — blue chunks + crystal mist
_spawnChunks(ex, ey, ez, null, 14, wp, col);
_burstRadial(ex, ey, ez, 40, 0x88ccff, 3.0, 10.0, 0.006, 0.012, 3.5, 0.92);
return;
}

if (wp.killStyle === 'electrocute') {
// Lightning death — body spasms then collapses
_burstRadial(ex, ey, ez, 20, 0xffee00, 2.0, 8.0, 0.005, 0.009, 0.5, 0.05);
setTimeout(function() {
if (!_ready) return;
_burstRadial(ex, ey, ez, 50, col.base, 1.0, 5.0, 0.012, 0.025, 3.0, 0.60);
}, 200);
return;
}

if (wp.killStyle === 'cauterize') {
// Laser — tiny ember shower, no real blood
_burstRadial(ex, ey, ez, 20, 0x111111, 0.5, 2.0, 0.008, 0.014, 1.5, 0.90);
return;
}

if (wp.killStyle === 'execution') {
// Knife takedown — dramatic slow bleed then gush
for (var p = 0; p < 5; p++) {
(function(pulse) {
setTimeout(function() {
if (!_ready) return;
_burstUpward(ex, ey+0.08, ez, 12+pulse*2, col.base, 0.3, 1.5+pulse*0.3, 0.018, 0.030, 2.5+pulse*0.5, 0.72);
}, pulse * 250);
})(p);
}
return;
}

// DEFAULT — based on organ that killed
switch (killedBy) {
case 'brain':
_burstUpward(ex, ey+0.2, ez, 35, col.organ, 2.0, 7.0, 0.008, 0.018, 2.5, 0.30);
_burstRadial(ex, ey, ez, 25, col.base, 1.5, 5.0, 0.012, 0.025, 2.5, 0.60);
break;
case 'heart':
for (var p = 0; p < 4; p++) {
(function(pulse) {
setTimeout(function() {
if (!_ready) return;
_burstUpward(ex, ey+0.05, ez, 50, 0xff0000, 3.5, 8.0, 0.024, 0.040, 3.0, 0.55);
}, pulse*160);
})(p);
}
setTimeout(function() { if (!_ready) return; _burstUpward(ex, ey+0.05, ez, 50, 0xff0000, 3.5, 8.0, 0.024, 0.040, 3.0, 0.55); }, 360);
setTimeout(function() { if (!_ready) return; _burstUpward(ex, ey+0.05, ez, 50, 0xff0000, 3.5, 8.0, 0.024, 0.040, 3.0, 0.55); }, 540);
break;
case 'guts':
// Slow deflation
for (var t = 0; t < 80; t++) {
(function(tick) {
setTimeout(function() {
if (!_ready) return;
var d = _getFreeDrop(_dropData);
if (!d) return;
d.alive = true;
d.px = ex+(Math.random()-0.5)*0.25; d.py = ey; d.pz = ez+(Math.random()-0.5)*0.25;
d.vx = (Math.random()-0.5)*1.0; d.vy = -0.1-Math.random()*0.6; d.vz = (Math.random()-0.5)*1.0;
d.r = 0.009+Math.random()*0.018; d.maxLife = 3.5+Math.random(); d.life = d.maxLife;
d.viscosity = 0.82; d.bounces = 0; d.maxBounces = 1; d.onGround = false;
d.color = 0x44cc22; d.frozen = false; d.charred = false;
}, tick * 38);
})(t);
}
break;
default:
_burstRadial(ex, ey, ez, 180, col.base, 2.0, 18.0, 0.012, 0.030, 3.0, 0.58);
_burstUpward(ex, ey, ez, 40, col.base, 5.0, 14.0, 0.012, 0.030, 3.0, 0.58);
if (Math.random() < 0.5) _spawnChunks(ex, ey, ez, null, 3+Math.floor(Math.random()*4), wp, col);
setTimeout(function() { if (_ready) _burstRadial(ex, ey, ez, 30, col.base, 2.0, 18.0, 0.012, 0.030, 3.0, 0.58); }, 0);
setTimeout(function() { if (_ready) _burstRadial(ex, ey, ez, 30, col.base, 2.0, 18.0, 0.012, 0.030, 3.0, 0.58); }, 120);
setTimeout(function() { if (_ready) _burstRadial(ex, ey, ez, 30, col.base, 2.0, 18.0, 0.012, 0.030, 3.0, 0.58); }, 240);
break;
}

}

// ══════════════════════════════════════════
//  BURST HELPERS
// ══════════════════════════════════════════

function _burstRadial(ox, oy, oz, count, color, spdMin, spdMax, rMin, rMax, life, visc) {
for (var i = 0; i < count; i++) {
var a = Math.random() * Math.PI * 2;
var e = (Math.random()-0.2) * Math.PI;
var s = spdMin + Math.random() * (spdMax - spdMin);
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = ox; d.py = oy; d.pz = oz;
d.vx = Math.cos(a)*Math.cos(e)*s;
d.vy = Math.abs(Math.sin(e)*s) + Math.random()*1.5;
d.vz = Math.sin(a)*Math.cos(e)*s;
d.r         = rMin + Math.random()*(rMax-rMin);
d.maxLife   = life + Math.random()*1.5;
d.life      = d.maxLife;
d.viscosity = visc;
d.bounces   = 0; d.maxBounces = 3;
d.onGround  = false;
d.color     = color;
d.frozen    = false; d.charred = false;
}
}

function _burstUpward(ox, oy, oz, count, color, spdMin, spdMax, rMin, rMax, life, visc) {
for (var i = 0; i < count; i++) {
var a = Math.random() * Math.PI * 2;
var s = spdMin + Math.random() * (spdMax - spdMin);
var d = _getFreeDrop(_dropData);
if (!d) break;
d.alive = true;
d.px = ox; d.py = oy; d.pz = oz;
d.vx = Math.cos(a)*(0.5+Math.random()*1.5);
d.vy = s * 0.35;
d.vz = Math.sin(a)*(0.5+Math.random()*1.5);
d.r         = rMin + Math.random()*(rMax-rMin);
d.maxLife   = life + Math.random()*1.0;
d.life      = d.maxLife;
d.viscosity = visc;
d.bounces   = 0; d.maxBounces = 4;
d.onGround  = false;
d.color     = color;
d.frozen    = false; d.charred = false;
}
}

// ══════════════════════════════════════════
//  CHUNK SPAWNING
// ══════════════════════════════════════════
function _spawnChunks(ox, oy, oz, normal, count, wp, col) {
for (var i = 0; i < count; i++) {
var c = _getFreeChunk();
if (!c) break;
var a = Math.random() * Math.PI * 2;
var e = 0.3 + Math.random() * 0.6;
var s = 3.0 + Math.random() * (wp.dropSpeed ? wp.dropSpeed[1] * 0.55 : 8.0);
c.alive  = true;
c.px = ox; c.py = oy; c.pz = oz;
c.vx = Math.cos(a)*Math.cos(e)*s;
c.vy = Math.sin(e)*s + 1.5;
c.vz = Math.sin(a)*Math.cos(e)*s;
c.rvx = (Math.random()-0.5)*18;
c.rvy = (Math.random()-0.5)*18;
c.rvz = (Math.random()-0.5)*18;
c.rx = 0; c.ry = 0; c.rz = 0;
c.life    = 4.0 + Math.random()*3.0;
c.size    = 0.035 + Math.random()*0.06;
c.bounces = 0;
c.color   = col.base;
if (c.mesh) {
c.mesh.visible = true;
c.mesh.scale.setScalar(c.size);
c.mesh.material.color.setHex(c.color);
c.mesh.material.opacity = 1.0;
}
}
}

// ══════════════════════════════════════════
//  DECALS
// ══════════════════════════════════════════
function _spawnDecal(x, z, radius, color) {
var dd = _decals[_decalIdx % CFG.DECAL_COUNT];
_decalIdx++;
dd.alive   = true;
dd.life    = CFG.DECAL_FADE;
dd.maxLife = CFG.DECAL_FADE;
dd.mesh.position.set(x, CFG.GROUND_Y, z);
// Irregular shape: vary x (world X) and y (world Z after rotation) scale separately
dd.mesh.scale.set(
radius * (1.5 + Math.random() * 1.5),
radius * (1.0 + Math.random() * 1.0),
1
);
dd.mesh.rotation.z = Math.random() * Math.PI * 2;
dd.mesh.material.color.setHex(color || 0x880000);
dd.mesh.material.opacity = 0.70 + Math.random()*0.15;
dd.mesh.visible = true;
}

function _spawnSplat(x, z, size, color) {
_spawnDecal(x, z, size * 1.2, color);
}

// ══════════════════════════════════════════
//  ANATOMY HELPERS
// ══════════════════════════════════════════
function _getOrgan(type, localY) {
var profile = ANATOMY[type] || ANATOMY.default;
for (var k in profile) {
var o = profile[k];
if (localY >= o.yRange[0] && localY <= o.yRange[1]) return k;
}
return 'membrane';
}

function _damageOrgan(gs, organ, amount) {
if (!gs.organs[organ]) return false;
gs.organs[organ].hp -= amount;
if (gs.organs[organ].hp <= 0) {
gs.organs[organ].hp = 0;
if (!gs.killedBy) gs.killedBy = organ;
return true;
}
return false;
}

function _addWound(gs, lx, ly, lz, radius, organ, wp, col) {
var MERGE = 0.14;
// Check for existing nearby wound to grow
for (var i = 0; i < gs.wounds.length; i++) {
var w = gs.wounds[i];
if (!w.alive) continue;
var dist = Math.sqrt((w.lx-lx)*(w.lx-lx)+(w.ly-ly)*(w.ly-ly)+(w.lz-lz)*(w.lz-lz));
if (dist < MERGE) {
// GROW existing wound
w.hits++;
w.radius = Math.min(w.radius + radius * 0.35, 0.45);
w.depth  = Math.min(w.depth  + wp.penetration * 0.4, 1.0);
return w;
}
}
// Find free wound slot
var slot = null;
for (var i = 0; i < gs.wounds.length; i++) {
if (!gs.wounds[i].alive) { slot = gs.wounds[i]; break; }
}
if (!slot && gs.wounds.length < CFG.WOUND_PER_ENEMY) {
slot = makeWound();
gs.wounds.push(slot);
} else if (!slot) {
slot = gs.wounds[0]; // recycle oldest
}
slot.alive      = true;
slot.lx = lx; slot.ly = ly; slot.lz = lz;
slot.radius     = radius;
slot.depth      = wp.penetration;
slot.hits       = 1;
slot.organ      = organ;
slot.dripTimer  = 0;
slot.cauterized = wp.cauterizes  || false;
slot.frozen     = wp.freezesBlood || false;
slot.color      = (ENEMY_BLOOD[gs.type] || ENEMY_BLOOD.default).dark;
return slot;
}

// ══════════════════════════════════════════
//  ARTERIAL STREAM
// ══════════════════════════════════════════
function _startStream(enemy, lx, ly, lz, normal, color, life) {
var s = null;
for (var i = 0; i < _streams.length; i++) {
if (!_streams[i].alive) { s = _streams[i]; break; }
}
if (!s) {
if (_streams.length < CFG.STREAM_COUNT) {
s = makeStream();
_streams.push(s);
} else {
s = _streams[0];
}
}
s.alive    = true;
s.enemy    = enemy;
s.lx = lx; s.ly = ly; s.lz = lz;
s.dx = (Math.random()-0.5)*0.8;
s.dy = 0.5 + Math.random()*0.5;
s.dz = (Math.random()-0.5)*0.8;
// Normalise direction
var len = Math.sqrt(s.dx*s.dx + s.dy*s.dy + s.dz*s.dz) + 0.001;
s.dx /= len; s.dy /= len; s.dz /= len;
s.pressure = 1.0;
s.life     = life || 6.0;
s.timer    = 0;
s.color    = color || 0xcc0000;
}

// ══════════════════════════════════════════
//  POOL HELPERS
// ══════════════════════════════════════════
function _getFreeDrop(pool) {
for (var i = 0; i < pool.length; i++) {
if (!pool[i].alive) return pool[i];
}
// Recycle the drop with least life remaining
var oldest = pool[0], oldestLife = pool[0].life;
for (var i = 1; i < pool.length; i++) {
if (pool[i].alive && pool[i].life < oldestLife) {
oldest = pool[i]; oldestLife = pool[i].life;
}
}
_killDrop(oldest, oldest.isMist ? _mistIM : _dropIM);
return oldest;
}

function _getFreeChunk() {
for (var i = 0; i < _chunks.length; i++) {
if (!_chunks[i].alive) return _chunks[i];
}
// Recycle oldest
var oldest = _chunks[0];
for (var i = 1; i < _chunks.length; i++) {
if (_chunks[i].alive && _chunks[i].life < oldest.life) oldest = _chunks[i];
}
_killChunk(oldest);
return oldest;
}

function _killDrop(d, im) {
d.alive      = false;
d.isCloud    = false;
d.expandRate = 0;
_m4.makeScale(0.001, 0.001, 0.001);
_m4.setPosition(-9999, -9999, -9999);
if (im) im.setMatrixAt(d.idx, _m4);
}

function _killChunk(c) {
c.alive = false;
if (c.mesh) c.mesh.visible = false;
}

// ══════════════════════════════════════════
//  PUBLIC OBJECT
// ══════════════════════════════════════════
global.BloodV2 = {
// Core API
init:    init,
hit:     hit,
kill:    kill,
update:  update,
reset:   reset,

// Expose instanced mesh references so external systems (safety-net) can check visibility
getMeshes: function() { return { drops: _dropIM, mist: _mistIM }; },

// Data tables — extend these to add new weapons/enemies
WEAPONS:     WEAPONS,
ANATOMY:     ANATOMY,
ENEMY_BLOOD: ENEMY_BLOOD,
CFG:         CFG,

// Utility: get kill description text for UI/AI narration
getKillText: function(weaponKey, organ) {
var desc = {
brain:    'Neural fluid erupts. Cross-eyed wobble. Melts top-down.',
heart:    'Pumping core bursts. Three massive spurts. Collapse.',
guts:     'Digestive sac deflates. Slow. Wet. Inevitable.',
membrane: 'Outer gel explodes outward. Raw tissue exposed.',
core:     'Vital fluid drains. Sags. Shrinks. Gone.',
};
return {
weapon: (WEAPONS[weaponKey] || WEAPONS.pistol).label,
organ:  organ,
death:  desc[organ] || 'It dies.',
};
},

// Add a new enemy blood colour easily
addEnemyBlood: function(enemyType, base, dark, organ, mist) {
ENEMY_BLOOD[enemyType] = { base:base, dark:dark, organ:organ, mist:mist };
},

// Add a new weapon profile
addWeapon: function(key, profile) {
WEAPONS[key] = profile;
},

// Add a new enemy anatomy
addAnatomy: function(enemyType, anatomyProfile) {
ANATOMY[enemyType] = anatomyProfile;
},

// Direct particle burst — bypasses hit/weapon logic, spawns exactly `count` drops radially.
// opts: { spdMin, spdMax, rMin, rMax, life, visc, color, enemyType }
//   If enemyType is provided, it overrides color with the enemy's blood color from ENEMY_BLOOD table.
rawBurst: function(ox, oy, oz, count, opts) {
if (!_ready) return;
var o = opts || {};
// If enemyType is provided, use that enemy's blood color; otherwise use opts.color or default red
var bloodColor = 0xcc1100; // default red
if (o.enemyType && ENEMY_BLOOD[o.enemyType]) {
  bloodColor = ENEMY_BLOOD[o.enemyType].base;
} else if (o.color !== undefined) {
  bloodColor = o.color;
}
_burstRadial(ox, oy, oz,
  typeof count === 'number' ? count : 20,
  bloodColor,
  o.spdMin !== undefined ? o.spdMin : 1.5,
  o.spdMax !== undefined ? o.spdMax : 6.0,
  o.rMin   !== undefined ? o.rMin   : 0.007,
  o.rMax   !== undefined ? o.rMax   : 0.016,
  o.life   !== undefined ? o.life   : 2.5,
  o.visc   !== undefined ? o.visc   : 0.60
);
},

// Direct upward particle burst — spawns exactly `count` drops in an upward cone.
// opts: { spdMin, spdMax, rMin, rMax, life, visc, color, enemyType }
//   If enemyType is provided, it overrides color with the enemy's blood color from ENEMY_BLOOD table.
rawBurstUpward: function(ox, oy, oz, count, opts) {
if (!_ready) return;
var o = opts || {};
// If enemyType is provided, use that enemy's blood color; otherwise use opts.color or default red
var bloodColor = 0xcc1100; // default red
if (o.enemyType && ENEMY_BLOOD[o.enemyType]) {
  bloodColor = ENEMY_BLOOD[o.enemyType].base;
} else if (o.color !== undefined) {
  bloodColor = o.color;
}
_burstUpward(ox, oy, oz,
  typeof count === 'number' ? count : 15,
  bloodColor,
  o.spdMin !== undefined ? o.spdMin : 1.5,
  o.spdMax !== undefined ? o.spdMax : 5.5,
  o.rMin   !== undefined ? o.rMin   : 0.007,
  o.rMax   !== undefined ? o.rMax   : 0.016,
  o.life   !== undefined ? o.life   : 2.5,
  o.visc   !== undefined ? o.visc   : 0.60
);
},

smearBlood: function(x1, y1, z1, x2, y2, z2, count, color) {
if (!_ready) return;
_fxSmear(x1, y1, z1, x2, y2, z2, count || 12, color || 0xaa0000);
},

// Spawn a blood mist cloud at (ox, oy, oz).
// opts: { count, baseR, color, enemyType }
//   count   — number of puff particles (default 6)
//   baseR   — starting radius of each puff (default 0.06)
//   color   — hex mist colour; if enemyType is given it overrides this with ENEMY_BLOOD mist colour
//   enemyType — enemy type key for automatic colour selection
spawnMistCloud: function(ox, oy, oz, opts) {
if (!_ready) return;
var o = opts || {};
var mistColor = 0xee2200; // default red mist
if (o.enemyType && ENEMY_BLOOD[o.enemyType]) {
  mistColor = ENEMY_BLOOD[o.enemyType].mist;
} else if (o.color !== undefined) {
  mistColor = o.color;
}
var col = { mist: mistColor };
_fxMistCloud(ox, oy, oz, col,
  o.count  !== undefined ? o.count  : 6,
  o.baseR  !== undefined ? o.baseR  : 0.06
);
},

};

// Print integration guide
console.log([
'',
'╔══════════════════════════════════════════════════════╗',
'║  BloodV2 — Realistic Gore System — LOADED           ║',
'╠══════════════════════════════════════════════════════╣',
'║  Step 1  sandbox.html:                              ║',
'║    <script src="js/blood-system-v2.js"></script>    ║',
'║    (after three.js, before enemy-class.js)          ║',
'║                                                      ║',
'║  Step 2  game-screens.js  init():                   ║',
'║    window.BloodV2.init(scene);                      ║',
'║                                                      ║',
'║  Step 3  game-loop.js  animate():                   ║',
'║    window.BloodV2.update(delta);                    ║',
'║                                                      ║',
'║  Step 4  combat.js  on bullet hit:                  ║',
'║    window.BloodV2.hit(enemy,                        ║',
'║      "shotgun", hitPoint, hitNormal);               ║',
'║                                                      ║',
'║  Step 5  enemy-class.js  on death:                  ║',
'║    window.BloodV2.kill(enemy, "shotgun");           ║',
'║                                                      ║',
'║  Reset:  window.BloodV2.reset();                    ║',
'╚══════════════════════════════════════════════════════╝',
'',
].join('\n'));

console.log('[GORE PATCH v2 OVERDONE] Applied');

})(window);

// ─────────────────────────────────────────────────────────────────────────────
//  BACKWARDS-COMPAT SHIM
//  All existing game files call window.BloodSystem (the old API name).
//  This shim maps every BloodSystem method to its BloodV2 equivalent so that
//  no other file needs to change.  BloodV2 is the single source of truth.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
'use strict';

var BV2 = window.BloodV2;
if (!BV2) { console.warn('[BloodV2 shim] window.BloodV2 not found — shim skipped'); return; }

// — tiny helpers used by several shim methods —
function _pos3(pos) {
// Accept THREE.Vector3, {x,y,z} plain object, or positional args
if (!pos) return { x: 0, y: 0, z: 0 };
return { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 };
}

function _fakeEnemy(pos) {
// BloodV2.hit / kill expects an enemy-like object with {mesh.position, alive}
var p = _pos3(pos);
return {
alive: true,
enemyType: 'default',
id: 'shim*' + Date.now() + '*' + Math.random(),
hp: 100,
maxHp: 100,
mesh: {
position: { x: p.x, y: p.y, z: p.z },
scale:    { y: 1 }
}
};
}

window.BloodSystem = {

// ── lifecycle ─────────────────────────────────────────────────────────────
init: function (scene) {
  // Guard: BV2.init is called once by sandbox-loop directly too
  // Only init if not already initialized
  if (!BV2._initialized) BV2.init(scene);
},

update: function (dt) {
  // game-loop.js calls update() with no arg; sandbox-loop.js calls update() with no arg too.
  // BloodV2.update expects deltaTime in seconds.  Default to 1/60 when omitted.
  BV2.update(typeof dt === 'number' ? dt : 1 / 60);
},

reset: function () {
  if (typeof BV2.reset === 'function') BV2.reset();
},

// ── burst / spray ─────────────────────────────────────────────────────────
emitBurst: function (pos, count, opts) {
  var p = _pos3(pos);
  var cnt = typeof count === 'number' ? count : 30;
  // Directly spawn exactly `cnt` drops using rawBurst — no threshold mapping
  BV2.rawBurst(p.x, p.y, p.z, cnt, {
    spdMin: 1.5, spdMax: 6.0,
    rMin: 0.007, rMax: 0.016,
    life: 2.5, visc: 0.60,
    color: 0xcc1100
  });
},

emitPulse: function (pos, opts) {
  var o = opts || {};
  var pulses   = typeof o.pulses   === 'number' ? o.pulses   : 1;
  var perPulse = typeof o.perPulse === 'number' ? o.perPulse : 30;
  var interval = typeof o.interval === 'number' ? o.interval : 200;
  var p = _pos3(pos);
  for (var i = 0; i < pulses; i++) {
    (function (idx) {
      setTimeout(function () {
        if (!BV2.rawBurst) return;
        BV2.rawBurst(p.x, p.y, p.z, perPulse, {
          spdMin: 2.0, spdMax: 7.0,
          rMin: 0.007, rMax: 0.016,
          life: 2.0, visc: 0.55,
          color: 0xcc1100
        });
      }, idx * interval);
    })(i);
  }
},

emitDrop: function (x, y, z /*, vx, vy, vz, size */) {
  var e = _fakeEnemy({ x: x, y: y, z: z });
  BV2.hit(e, 'pistol', { x: x, y: y, z: z }, null);
},

// ── gore ──────────────────────────────────────────────────────────────────
emitGuts: function (pos /*, opts */) {
  // Use pistol kill - no chunk spawning, just blood burst
  var e = _fakeEnemy(pos);
  BV2.kill(e, 'pistol');
},

emitHeartbeatWound: function (pos, opts) {
  var o = opts || {};
  var pulses      = typeof o.pulses      === 'number' ? o.pulses      : 2;
  var perPulse    = typeof o.perPulse    === 'number' ? o.perPulse    : 20;
  var interval    = typeof o.interval    === 'number' ? o.interval    : 300;
  var pressure    = typeof o.pressure    === 'number' ? o.pressure    : 1.0;
  var woundHeight = typeof o.woundHeight === 'number' ? o.woundHeight : 0.5;
  var p = _pos3(pos);
  var yOffset = woundHeight * 0.5;
  for (var i = 0; i < pulses; i++) {
    (function (idx) {
      setTimeout(function () {
        if (!BV2.rawBurstUpward) return;
        BV2.rawBurstUpward(p.x, p.y + yOffset, p.z, perPulse, {
          spdMin: 1.5 * pressure, spdMax: 5.5 * pressure,
          rMin: 0.007, rMax: 0.016,
          life: 2.2, visc: 0.60,
          color: 0xcc1100
        });
      }, idx * interval);
    })(i);
  }
},

// ── wounds / drips ────────────────────────────────────────────────────────
addWound: function (enemy /*, opts */) {
  // BloodV2 manages wounds internally via hit(); no separate wound-tracking call needed.
},

// ── weapon-specific effects (used by enemy-class.js) ─────────────────────
emitSwordSlash: function (pos, dir, count) {
  var e = _fakeEnemy(pos);
  var p = _pos3(pos);
  BV2.hit(e, 'sword', { x: p.x, y: p.y, z: p.z }, dir || null);
},

emitAuraBurn: function (pos, count) {
  var e = _fakeEnemy(pos);
  var p = _pos3(pos);
  BV2.hit(e, 'aura', { x: p.x, y: p.y, z: p.z }, null);
},

emitHeadBleed: function (pos /*, opts */) {
  var e = _fakeEnemy(pos);
  var p = _pos3(pos);
  BV2.hit(e, 'pistol', { x: p.x, y: p.y + 0.5, z: p.z }, null);
},

emitExitWound: function (pos, dir, count /*, opts */) {
  var e = _fakeEnemy(pos);
  var p = _pos3(pos);
  BV2.hit(e, 'shotgun', { x: p.x, y: p.y, z: p.z }, dir || null);
},

emitDroneMist: function (pos, dir, count) {
  var e = _fakeEnemy(pos);
  var p = _pos3(pos);
  BV2.hit(e, 'pistol', { x: p.x, y: p.y, z: p.z }, dir || null);
},

// ── water / player effects (player-class.js) ─────────────────────────────
emitWaterBurst: function (pos /*, count, opts */) {
  var e = _fakeEnemy(pos);
  BV2.hit(e, 'pistol', _pos3(pos), null);
},

emitWaterPulse: function (pos /*, opts */) {
  var e = _fakeEnemy(pos);
  BV2.hit(e, 'revolver', _pos3(pos), null);
},

// ── trail effects (enemy-class.js) ───────────────────────────────────────
emitDragTrail: function (pos, dir /*, count */) {
  var e = _fakeEnemy(pos);
  BV2.hit(e, 'pistol', _pos3(pos), dir || null);
},

emitSpinTrail: function (pos, angle /*, count */) {
  var e = _fakeEnemy(pos);
  var dir = { x: Math.cos(angle || 0), y: 0, z: Math.sin(angle || 0) };
  BV2.hit(e, 'pistol', _pos3(pos), dir);
},

emitCrawlTrail: function (pos, dir /*, count */) {
  var e = _fakeEnemy(pos);
  BV2.hit(e, 'pistol', _pos3(pos), dir || null);
},

// ── arterial / throat sprays ──────────────────────────────────────────────
emitArterialSpurt: function (pos /*, opts */) {
  var e = _fakeEnemy(pos);
  BV2.hit(e, 'shotgun', _pos3(pos), null);
},

emitThroatSpray: function (pos /*, opts */) {
  var e = _fakeEnemy(pos);
  BV2.hit(e, 'shotgun', _pos3(pos), null);
},

// ── area effects ─────────────────────────────────────────────────────────
emitMeteorExplosion: function (pos /*, opts */) {
  var e = _fakeEnemy(pos);
  BV2.kill(e, 'shotgun');
},

emitPoolGrow: function (pos /*, opts */) {
  var e = _fakeEnemy(pos);
  BV2.hit(e, 'pistol', _pos3(pos), null);
},

// ── catch-all for any future callers ─────────────────────────────────────
emitSwordSlashFX: function (pos, dir) {
  var e = _fakeEnemy(pos);
  BV2.hit(e, 'sword', _pos3(pos), dir || null);
}

};

console.log('[BloodV2] BloodSystem shim installed — all BloodSystem.* calls now route to BloodV2');
console.log('[GORE PATCH v1 REALISTIC] Applied successfully');
}());
