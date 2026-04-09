/**
 * WORLD OBJECTS MODULE — Engine 2.0 Static World
 *
 * Hardcoded, deterministic world generation for the Engine 2.0 sandbox.
 * Every tree, rock, fence post, and grass tuft is placed at a fixed position
 * so the map is identical on every run.
 *
 * Features:
 *  - Static map with 80+ trees (3 types), 40 rocks, fence lines, 200+ grass tufts
 *  - Stonehenge (detailed, weathered, with lintels and altar)
 *  - Lore Lake (water lilies, reeds, cozy ambiance)
 *  - Collision hitboxes for trees/fences (sway/wobble) and rocks (solid)
 *  - Mine/Gather system (hit trees → wood, rocks → stone)
 *  - Day/Night cycle (smooth color grading integrated with Engine 2.0 lighting)
 *
 * Exposes: window.WorldObjects
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  const ARENA_RADIUS = 80;
  const HOLE_RADIUS = 3;  // must match engine2.js spawn hole

  // Day/Night
  const DAY_NIGHT_SPEED = 1 / 600; // 10-minute full cycle
  const DAWN = 0.25, NOON = 0.5, DUSK = 0.75;

  // Lake config (matches GAME_CONFIG)
  const LAKE_X = 30, LAKE_Z = -30, LAKE_RADIUS = 8;
  const LAKE_SLOW_FACTOR = 0.35;   // 65% speed reduction in water
  const LAKE_SINK_Y = -0.15;       // sink to "neck" level

  // Stonehenge
  const SH_X = 35, SH_Z = 35;

  // Collision
  const TREE_HITBOX_R = 1.0;
  const ROCK_HITBOX_R = 1.2;
  const FENCE_HITBOX_R = 0.4;

  // Sway physics
  const SWAY_SPRING = 12.0;   // spring constant
  const SWAY_DAMP = 4.0;      // damping factor
  const SWAY_PUSH = 0.25;     // push amount on collision

  // Gathering
  const GATHER_RANGE = 2.5;
  const GATHER_COOLDOWN = 0.8; // seconds between swings
  const TREE_HP = 5;
  const ROCK_HP = 8;

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDCODED STATIC POSITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // Tree data: { x, z, type (0=oak, 1=pine, 2=willow), s: scale }
  const TREE_DATA = [
    // ── Northwest forest cluster (dense) ──
    { x: -55, z: -50, type: 0, s: 1.1 },
    { x: -50, z: -55, type: 1, s: 0.9 },
    { x: -48, z: -45, type: 0, s: 1.0 },
    { x: -60, z: -42, type: 2, s: 1.2 },
    { x: -42, z: -58, type: 1, s: 0.85 },
    { x: -56, z: -38, type: 0, s: 1.15 },
    { x: -38, z: -52, type: 1, s: 0.95 },
    { x: -62, z: -55, type: 0, s: 1.0 },
    { x: -44, z: -40, type: 2, s: 1.1 },
    { x: -52, z: -62, type: 1, s: 0.8 },
    { x: -35, z: -48, type: 0, s: 1.05 },
    { x: -58, z: -35, type: 2, s: 1.3 },
    { x: -40, z: -65, type: 1, s: 0.9 },
    { x: -65, z: -48, type: 0, s: 1.0 },
    { x: -47, z: -35, type: 1, s: 1.1 },
    { x: -53, z: -30, type: 0, s: 0.95 },
    { x: -33, z: -42, type: 2, s: 1.15 },
    { x: -68, z: -40, type: 1, s: 0.85 },
    { x: -45, z: -28, type: 0, s: 1.0 },
    { x: -30, z: -55, type: 1, s: 0.9 },
    // ── Northeast scattered ──
    { x: -55, z: 40, type: 0, s: 1.0 },
    { x: -48, z: 35, type: 1, s: 0.9 },
    { x: -60, z: 50, type: 2, s: 1.1 },
    { x: -42, z: 45, type: 0, s: 0.85 },
    { x: -52, z: 55, type: 1, s: 1.0 },
    { x: -38, z: 38, type: 0, s: 1.05 },
    { x: -65, z: 42, type: 2, s: 1.2 },
    { x: -45, z: 60, type: 1, s: 0.9 },
    // ── South scattered ──
    { x: 10, z: -60, type: 0, s: 1.0 },
    { x: -15, z: -55, type: 1, s: 0.9 },
    { x: 20, z: -50, type: 2, s: 1.1 },
    { x: -5, z: -65, type: 0, s: 0.85 },
    { x: 15, z: -45, type: 1, s: 1.0 },
    { x: -20, z: -62, type: 0, s: 0.95 },
    { x: 5, z: -55, type: 2, s: 1.15 },
    { x: -10, z: -48, type: 1, s: 0.9 },
    // ── East side ──
    { x: 55, z: -10, type: 0, s: 1.0 },
    { x: 50, z: 5, type: 1, s: 0.9 },
    { x: 60, z: -20, type: 2, s: 1.1 },
    { x: 48, z: 15, type: 0, s: 0.85 },
    { x: 58, z: -5, type: 1, s: 1.0 },
    { x: 52, z: 20, type: 0, s: 0.95 },
    { x: 62, z: 10, type: 2, s: 1.2 },
    { x: 45, z: -15, type: 1, s: 0.9 },
    // ── West side ──
    { x: -55, z: 10, type: 0, s: 1.0 },
    { x: -60, z: -5, type: 1, s: 0.95 },
    { x: -48, z: 15, type: 2, s: 1.1 },
    { x: -52, z: -15, type: 0, s: 0.85 },
    // ── Central scattered (avoid spawn zone radius 10) ──
    { x: 18, z: 20, type: 0, s: 1.0 },
    { x: -20, z: 22, type: 1, s: 0.9 },
    { x: 25, z: -18, type: 2, s: 1.05 },
    { x: -22, z: -20, type: 0, s: 0.9 },
    { x: 15, z: -25, type: 1, s: 1.0 },
    // ── Near lake: old willows removed — replaced by LakeVegetation bonsai trees ──
    // ── Near Stonehenge ──
    { x: 28, z: 28, type: 0, s: 0.9 },
    { x: 42, z: 28, type: 1, s: 1.0 },
    { x: 28, z: 42, type: 0, s: 1.05 },
    { x: 42, z: 42, type: 1, s: 0.9 },
    { x: 25, z: 35, type: 0, s: 0.85 },
    { x: 45, z: 35, type: 1, s: 0.95 },
    // ── Far edges ──
    { x: 70, z: 50, type: 0, s: 1.0 },
    { x: 65, z: -55, type: 1, s: 0.9 },
    { x: -70, z: 60, type: 2, s: 1.1 },
    { x: -65, z: -65, type: 0, s: 0.85 },
    { x: 70, z: -60, type: 1, s: 1.0 },
    { x: 60, z: 65, type: 0, s: 0.95 },
    { x: -70, z: -70, type: 2, s: 1.2 },
    { x: 68, z: 30, type: 1, s: 0.9 },
    { x: -68, z: 25, type: 0, s: 1.0 },
    { x: 55, z: 55, type: 1, s: 0.85 },
    { x: -60, z: 65, type: 2, s: 1.1 },
    { x: 72, z: -40, type: 0, s: 0.9 },
    { x: -72, z: -50, type: 1, s: 1.0 },
  ];

  // Rock data: { x, z, s: scale, ry: y-rotation }
  const ROCK_DATA = [
    // ── Scattered boulders ──
    { x: -30, z: -30, s: 1.2, ry: 0.5 },
    { x: -25, z: -25, s: 0.8, ry: 1.2 },
    { x: 15, z: 30, s: 1.0, ry: 0.8 },
    { x: -40, z: 15, s: 1.3, ry: 2.1 },
    { x: 45, z: -40, s: 0.9, ry: 0.3 },
    { x: -50, z: -20, s: 1.1, ry: 1.5 },
    { x: 35, z: 50, s: 0.7, ry: 0.9 },
    { x: -15, z: 40, s: 1.0, ry: 2.5 },
    { x: 50, z: 10, s: 1.2, ry: 0.2 },
    { x: -35, z: 55, s: 0.85, ry: 1.8 },
    { x: 25, z: -55, s: 1.1, ry: 0.7 },
    { x: -55, z: 30, s: 0.9, ry: 1.1 },
    { x: 40, z: -25, s: 1.0, ry: 2.3 },
    { x: -20, z: -45, s: 1.15, ry: 0.4 },
    { x: 55, z: 35, s: 0.75, ry: 1.6 },
    { x: -45, z: -35, s: 1.05, ry: 0.6 },
    { x: 30, z: 15, s: 0.9, ry: 2.0 },
    { x: -10, z: -35, s: 1.2, ry: 1.3 },
    { x: 60, z: -15, s: 0.8, ry: 0.1 },
    { x: -60, z: -10, s: 1.0, ry: 1.9 },
    // ── Rocky outcrops ──
    { x: 65, z: -50, s: 1.4, ry: 0.3 },
    { x: -65, z: 50, s: 1.3, ry: 1.7 },
    { x: 55, z: 60, s: 1.1, ry: 2.4 },
    { x: -55, z: -60, s: 1.5, ry: 0.8 },
    { x: 70, z: 15, s: 0.85, ry: 1.4 },
    { x: -70, z: -15, s: 1.0, ry: 0.5 },
    { x: 20, z: 65, s: 1.2, ry: 2.1 },
    { x: -20, z: -65, s: 0.9, ry: 1.0 },
    // ── Mine area cluster ──
    { x: -18, z: 22, s: 1.3, ry: 0.7 },
    { x: -22, z: 25, s: 1.0, ry: 1.5 },
    { x: -16, z: 26, s: 0.8, ry: 2.2 },
    { x: -24, z: 20, s: 1.1, ry: 0.3 },
  ];

  // Fence lines: arrays of posts forming fence segments
  const FENCE_LINES = [
    // Path from spawn to Stonehenge
    { posts: [
      { x: 8, z: 8 }, { x: 10, z: 10 }, { x: 12, z: 12 }, { x: 14, z: 14 },
      { x: 16, z: 16 }, { x: 18, z: 18 }, { x: 20, z: 20 }, { x: 22, z: 22 },
    ]},
    // Path border east
    { posts: [
      { x: 10, z: 6 }, { x: 12, z: 8 }, { x: 14, z: 10 }, { x: 16, z: 12 },
      { x: 18, z: 14 }, { x: 20, z: 16 }, { x: 22, z: 18 }, { x: 24, z: 20 },
    ]},
    // Fence near farm area
    { posts: [
      { x: -10, z: 15 }, { x: -10, z: 17 }, { x: -10, z: 19 }, { x: -10, z: 21 },
      { x: -10, z: 23 }, { x: -10, z: 25 },
    ]},
    // Fence near spawn
    { posts: [
      { x: 6, z: -5 }, { x: 8, z: -5 }, { x: 10, z: -5 }, { x: 12, z: -5 },
      { x: 14, z: -5 },
    ]},
  ];

  // Grass tuft positions (200+ light tufts scattered across the map)
  const GRASS_DATA = [];
  // Deterministic grass generation using seeded hash
  function _seeded(seed) {
    return ((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
  }
  for (let i = 0; i < 220; i++) {
    var gx = (_seeded(i * 13 + 7) - 0.5) * 150;
    var gz = (_seeded(i * 17 + 11) - 0.5) * 150;
    // Avoid spawn hole and too close to center
    if (Math.abs(gx) < 5 && Math.abs(gz) < 5) continue;
    if (gx * gx + gz * gz < 25) continue;
    GRASS_DATA.push({
      x: gx, z: gz,
      s: 0.4 + _seeded(i * 23 + 3) * 0.6,
      ry: _seeded(i * 31 + 5) * Math.PI * 2
    });
  }

  // Reed positions (around lake)
  const REED_DATA = [];
  for (var ri = 0; ri < 30; ri++) {
    var ra = (ri / 30) * Math.PI * 2;
    var rr = LAKE_RADIUS - 0.5 + _seeded(ri * 43 + 1) * 3;
    REED_DATA.push({
      x: LAKE_X + Math.cos(ra) * rr,
      z: LAKE_Z + Math.sin(ra) * rr,
      s: 0.6 + _seeded(ri * 47 + 2) * 0.6,
      phase: _seeded(ri * 53 + 3) * Math.PI * 2
    });
  }

  // Water lily positions (on lake surface)
  const LILY_DATA = [];
  for (var li = 0; li < 12; li++) {
    var la = _seeded(li * 61 + 7) * Math.PI * 2;
    var lr = _seeded(li * 67 + 13) * (LAKE_RADIUS - 2);
    LILY_DATA.push({
      x: LAKE_X + Math.cos(la) * lr,
      z: LAKE_Z + Math.sin(la) * lr,
      s: 0.3 + _seeded(li * 71 + 17) * 0.4,
      phase: _seeded(li * 73 + 19) * Math.PI * 2
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE STATE
  // ═══════════════════════════════════════════════════════════════════════════
  var _scene = null;
  var _ambientLight = null;
  var _sunLight = null;
  var _fillLight = null;
  var _hemisphereLight = null;

  // World object arrays (for collision / update)
  var _trees = [];       // { mesh, group, type, hp, swayVx, swayVz, swayX, swayZ, ox, oz }
  var _rocks = [];       // { mesh, ox, oz }
  var _fencePosts = [];  // { mesh, swayVx, swayVz, swayX, swayZ, ox, oz }
  var _grassMeshes = []; // grass tuft meshes
  var _reedMeshes = [];  // { mesh, phase }
  var _lilyMeshes = [];  // { mesh, phase }

  // Stonehenge
  var _stonehengeGroup = null;

  // Day/night
  var _dayTime = 0.30; // start at early morning
  var _dayNightEnabled = true;

  // Gathering state
  var _gatherCooldown = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED GEOMETRIES & MATERIALS (created once, reused)
  // ═══════════════════════════════════════════════════════════════════════════
  var _trunkGeo, _oakLeavesGeo, _pineLeavesGeo, _willowLeavesGeo;
  var _trunkMat, _oakLeavesMat, _pineLeavesMat, _willowLeavesMat;
  var _rockGeo, _rockMat;
  var _fencePostGeo, _fenceRailGeo, _fenceMat;
  var _grassGeo, _grassMat;
  var _reedGeo, _reedMat;
  var _lilyPadGeo, _lilyPadMat, _lilyFlowerGeo, _lilyFlowerMat;

  function _createSharedGeometry() {
    // ── Trees ──
    _trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 2.5, 6);
    _trunkMat = new THREE.MeshToonMaterial({ color: 0x6B3A1F });

    // Oak: round canopy
    _oakLeavesGeo = new THREE.SphereGeometry(2.0, 8, 6);
    _oakLeavesMat = new THREE.MeshToonMaterial({ color: 0x2D8B2D });

    // Pine: cone canopy
    _pineLeavesGeo = new THREE.ConeGeometry(1.5, 4.0, 6);
    _pineLeavesMat = new THREE.MeshToonMaterial({ color: 0x1A6B1A });

    // Willow: drooping canopy (elongated sphere)
    _willowLeavesGeo = new THREE.SphereGeometry(2.2, 8, 6);
    _willowLeavesMat = new THREE.MeshToonMaterial({ color: 0x3AAA3A });

    // ── Rocks ──
    _rockGeo = new THREE.DodecahedronGeometry(1.0, 0);
    _rockMat = new THREE.MeshToonMaterial({ color: 0x7A7A7A });

    // ── Fences ──
    _fencePostGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.6, 5);
    _fenceRailGeo = new THREE.BoxGeometry(2.0, 0.08, 0.06);
    _fenceMat = new THREE.MeshToonMaterial({ color: 0x8B6B3A });

    // ── Grass ──
    _grassGeo = new THREE.ConeGeometry(0.2, 0.6, 4);
    _grassMat = new THREE.MeshToonMaterial({ color: 0x4A8B2A });

    // ── Reeds ──
    _reedGeo = new THREE.CylinderGeometry(0.03, 0.05, 1.8, 4);
    _reedMat = new THREE.MeshToonMaterial({ color: 0x5A7A3A });

    // ── Water lilies ──
    _lilyPadGeo = new THREE.CircleGeometry(0.5, 8);
    _lilyPadMat = new THREE.MeshToonMaterial({
      color: 0x2A7A2A, side: THREE.DoubleSide
    });
    _lilyFlowerGeo = new THREE.SphereGeometry(0.15, 6, 4);
    _lilyFlowerMat = new THREE.MeshBasicMaterial({ color: 0xFFCCDD });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function _buildTrees() {
    for (var i = 0; i < TREE_DATA.length; i++) {
      var td = TREE_DATA[i];
      var group = new THREE.Group();
      group.position.set(td.x, 0, td.z);

      // Trunk
      var trunk = new THREE.Mesh(_trunkGeo, _trunkMat);
      trunk.position.y = 1.25;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      group.add(trunk);

      // Canopy
      var canopy;
      if (td.type === 0) {
        // Oak
        canopy = new THREE.Mesh(_oakLeavesGeo, _oakLeavesMat);
        canopy.position.y = 3.8;
      } else if (td.type === 1) {
        // Pine
        canopy = new THREE.Mesh(_pineLeavesGeo, _pineLeavesMat);
        canopy.position.y = 4.5;
      } else {
        // Willow (drooping)
        canopy = new THREE.Mesh(_willowLeavesGeo, _willowLeavesMat);
        canopy.position.y = 3.2;
        canopy.scale.set(1, 0.7, 1); // flatten slightly for drooping effect
      }
      canopy.castShadow = true;
      group.add(canopy);

      // Apply scale
      group.scale.setScalar(td.s);

      _scene.add(group);
      _trees.push({
        group: group,
        type: td.type,
        hp: TREE_HP,
        ox: td.x, oz: td.z,
        swayX: 0, swayZ: 0,
        swayVx: 0, swayVz: 0,
        hitR: TREE_HITBOX_R * td.s
      });
    }
  }

  function _buildRocks() {
    for (var i = 0; i < ROCK_DATA.length; i++) {
      var rd = ROCK_DATA[i];
      var mesh = new THREE.Mesh(_rockGeo, _rockMat);
      mesh.position.set(rd.x, 0.5 * rd.s, rd.z);
      mesh.scale.setScalar(rd.s);
      mesh.rotation.y = rd.ry;
      // Slightly flatten for natural look
      mesh.scale.y *= 0.7;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      _scene.add(mesh);
      _rocks.push({
        mesh: mesh,
        hp: ROCK_HP,
        ox: rd.x, oz: rd.z,
        hitR: ROCK_HITBOX_R * rd.s
      });
    }
  }

  function _buildFences() {
    for (var f = 0; f < FENCE_LINES.length; f++) {
      var line = FENCE_LINES[f];
      for (var p = 0; p < line.posts.length; p++) {
        var pp = line.posts[p];
        // Post
        var post = new THREE.Mesh(_fencePostGeo, _fenceMat);
        post.position.set(pp.x, 0.8, pp.z);
        post.castShadow = true;
        _scene.add(post);
        _fencePosts.push({
          mesh: post,
          ox: pp.x, oz: pp.z,
          swayX: 0, swayZ: 0,
          swayVx: 0, swayVz: 0,
          hitR: FENCE_HITBOX_R
        });

        // Rail between this post and the next
        if (p < line.posts.length - 1) {
          var np = line.posts[p + 1];
          var mx = (pp.x + np.x) / 2;
          var mz = (pp.z + np.z) / 2;
          var dx = np.x - pp.x;
          var dz = np.z - pp.z;
          var len = Math.sqrt(dx * dx + dz * dz);
          var angle = Math.atan2(dx, dz);

          var rail = new THREE.Mesh(_fenceRailGeo, _fenceMat);
          rail.position.set(mx, 1.1, mz);
          rail.rotation.y = angle;
          rail.scale.x = len / 2.0;
          rail.castShadow = true;
          _scene.add(rail);

          // Second rail lower
          var rail2 = new THREE.Mesh(_fenceRailGeo, _fenceMat);
          rail2.position.set(mx, 0.5, mz);
          rail2.rotation.y = angle;
          rail2.scale.x = len / 2.0;
          _scene.add(rail2);
        }
      }
    }
  }

  function _buildGrass() {
    for (var i = 0; i < GRASS_DATA.length; i++) {
      var gd = GRASS_DATA[i];
      // Create a small tuft: 3 overlapping cones
      var tuft = new THREE.Group();
      for (var b = 0; b < 3; b++) {
        var blade = new THREE.Mesh(_grassGeo, _grassMat);
        blade.position.set(
          (b - 1) * 0.12,
          0.3 * gd.s,
          (b % 2) * 0.08
        );
        blade.rotation.z = (b - 1) * 0.15;
        tuft.add(blade);
      }
      tuft.position.set(gd.x, 0, gd.z);
      tuft.rotation.y = gd.ry;
      tuft.scale.setScalar(gd.s);
      _scene.add(tuft);
      _grassMeshes.push(tuft);
    }
  }

  function _buildReeds() {
    for (var i = 0; i < REED_DATA.length; i++) {
      var rd = REED_DATA[i];
      var group = new THREE.Group();
      // 3 reed stalks per cluster
      for (var s = 0; s < 3; s++) {
        var reed = new THREE.Mesh(_reedGeo, _reedMat);
        reed.position.set(
          (s - 1) * 0.15,
          0.9 * rd.s,
          (s % 2) * 0.1
        );
        reed.rotation.z = (s - 1) * 0.1;
        group.add(reed);
      }
      // Add a cattail top on the center reed
      var topGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.25, 4);
      var topMat = new THREE.MeshToonMaterial({ color: 0x5A3A1A });
      var top = new THREE.Mesh(topGeo, topMat);
      top.position.y = 1.7 * rd.s;
      group.add(top);

      group.position.set(rd.x, 0, rd.z);
      group.scale.setScalar(rd.s);
      _scene.add(group);
      _reedMeshes.push({ mesh: group, phase: rd.phase });
    }
  }

  function _buildWaterLilies() {
    for (var i = 0; i < LILY_DATA.length; i++) {
      var ld = LILY_DATA[i];
      var group = new THREE.Group();

      // Lily pad (flat circle on water)
      var pad = new THREE.Mesh(_lilyPadGeo, _lilyPadMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.06;
      group.add(pad);

      // Flower on top (every other lily)
      if (i % 2 === 0) {
        var flower = new THREE.Mesh(_lilyFlowerGeo, _lilyFlowerMat);
        flower.position.y = 0.15;
        flower.scale.y = 0.6;
        group.add(flower);
      }

      group.position.set(ld.x, 0, ld.z);
      group.scale.setScalar(ld.s);
      _scene.add(group);
      _lilyMeshes.push({ mesh: group, phase: ld.phase });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STONEHENGE — Massively detailed, weathered
  // ═══════════════════════════════════════════════════════════════════════════

  function _buildStonehenge() {
    _stonehengeGroup = new THREE.Group();
    _stonehengeGroup.position.set(SH_X, 0, SH_Z);

    // Weathered stone material variations
    var stoneMats = [
      new THREE.MeshStandardMaterial({
        color: 0x8A8A7A, roughness: 0.95, metalness: 0.05
      }),
      new THREE.MeshStandardMaterial({
        color: 0x7A7A6A, roughness: 0.92, metalness: 0.03
      }),
      new THREE.MeshStandardMaterial({
        color: 0x9A9A85, roughness: 0.98, metalness: 0.02
      }),
    ];

    // Moss patches material
    var mossMat = new THREE.MeshToonMaterial({
      color: 0x4A6A3A, transparent: true, opacity: 0.7
    });

    // ── OUTER SARSEN CIRCLE (30 uprights) ──
    var outerRadius = 13;
    var outerStones = 30;
    var outerUpGeo = new THREE.BoxGeometry(1.4, 4.5, 0.9);

    for (var i = 0; i < outerStones; i++) {
      var angle = (i / outerStones) * Math.PI * 2;
      var sx = Math.cos(angle) * outerRadius;
      var sz = Math.sin(angle) * outerRadius;

      var stone = new THREE.Mesh(outerUpGeo, stoneMats[i % 3]);
      stone.position.set(sx, 2.25, sz);
      stone.rotation.y = angle + Math.PI / 2;
      // Slight random weathering tilt
      stone.rotation.z = (_seeded(i * 37 + 100) - 0.5) * 0.06;
      stone.rotation.x = (_seeded(i * 41 + 200) - 0.5) * 0.04;
      stone.castShadow = true;
      stone.receiveShadow = true;
      _stonehengeGroup.add(stone);

      // Moss patch on some stones
      if (i % 3 === 0) {
        var mossGeo = new THREE.PlaneGeometry(0.8, 0.6);
        var moss = new THREE.Mesh(mossGeo, mossMat);
        moss.position.set(sx * 0.98, 1.2, sz * 0.98);
        moss.rotation.y = angle;
        _stonehengeGroup.add(moss);
      }
    }

    // ── LINTELS on top (connecting every 2 uprights) ──
    var lintelGeo = new THREE.BoxGeometry(2.8, 0.7, 1.0);
    for (var i = 0; i < outerStones; i += 2) {
      if (i + 1 >= outerStones) break;
      var a1 = (i / outerStones) * Math.PI * 2;
      var a2 = ((i + 1) / outerStones) * Math.PI * 2;
      var lx = (Math.cos(a1) + Math.cos(a2)) / 2 * outerRadius;
      var lz = (Math.sin(a1) + Math.sin(a2)) / 2 * outerRadius;
      var la = (a1 + a2) / 2 + Math.PI / 2;

      var lintel = new THREE.Mesh(lintelGeo, stoneMats[(i / 2) % 3]);
      lintel.position.set(lx, 4.7, lz);
      lintel.rotation.y = la;
      lintel.castShadow = true;
      _stonehengeGroup.add(lintel);
    }

    // ── INNER TRILITHON HORSESHOE (5 pairs of massive stones) ──
    var innerRadius = 7;
    var trilithonGeo = new THREE.BoxGeometry(1.8, 6.0, 1.2);
    var trilithonLintelGeo = new THREE.BoxGeometry(3.5, 0.9, 1.3);
    var trilithonAngles = [-0.6, -0.3, 0, 0.3, 0.6]; // horseshoe arrangement

    for (var t = 0; t < 5; t++) {
      var ta = trilithonAngles[t] + Math.PI / 2; // face center from south

      // Left upright
      var lux = Math.cos(ta - 0.12) * innerRadius;
      var luz = Math.sin(ta - 0.12) * innerRadius;
      var leftUp = new THREE.Mesh(trilithonGeo, stoneMats[t % 3]);
      leftUp.position.set(lux, 3.0, luz);
      leftUp.rotation.y = ta;
      leftUp.castShadow = true;
      leftUp.receiveShadow = true;
      _stonehengeGroup.add(leftUp);

      // Right upright
      var rux = Math.cos(ta + 0.12) * innerRadius;
      var ruz = Math.sin(ta + 0.12) * innerRadius;
      var rightUp = new THREE.Mesh(trilithonGeo, stoneMats[(t + 1) % 3]);
      rightUp.position.set(rux, 3.0, ruz);
      rightUp.rotation.y = ta;
      rightUp.castShadow = true;
      rightUp.receiveShadow = true;
      _stonehengeGroup.add(rightUp);

      // Lintel spanning the pair
      var tlx = (lux + rux) / 2;
      var tlz = (luz + ruz) / 2;
      var tLintel = new THREE.Mesh(trilithonLintelGeo, stoneMats[(t + 2) % 3]);
      tLintel.position.set(tlx, 6.3, tlz);
      tLintel.rotation.y = ta;
      tLintel.castShadow = true;
      _stonehengeGroup.add(tLintel);
    }

    // ── ALTAR STONE (center, flat slab) ──
    var altarGeo = new THREE.BoxGeometry(3, 0.4, 1.5);
    var altarMat = new THREE.MeshStandardMaterial({
      color: 0x6A6A5A, roughness: 0.9, metalness: 0.1
    });
    var altar = new THREE.Mesh(altarGeo, altarMat);
    altar.position.set(0, 0.2, 0);
    altar.castShadow = true;
    altar.receiveShadow = true;
    _stonehengeGroup.add(altar);

    // ── HEEL STONE (outside the circle to the east) ──
    var heelGeo = new THREE.BoxGeometry(1.5, 3.0, 1.0);
    var heel = new THREE.Mesh(heelGeo, stoneMats[0]);
    heel.position.set(18, 1.5, 0);
    heel.rotation.z = 0.1; // slight lean
    heel.castShadow = true;
    _stonehengeGroup.add(heel);

    // ── STATION STONES (4 corner markers) ──
    var stationGeo = new THREE.BoxGeometry(0.8, 1.5, 0.8);
    var stationPositions = [
      { x: 16, z: 10 }, { x: -16, z: 10 },
      { x: 16, z: -10 }, { x: -16, z: -10 }
    ];
    for (var si = 0; si < stationPositions.length; si++) {
      var sp = stationPositions[si];
      var ss = new THREE.Mesh(stationGeo, stoneMats[si % 3]);
      ss.position.set(sp.x, 0.75, sp.z);
      ss.rotation.y = _seeded(si * 59 + 300) * 0.3;
      ss.castShadow = true;
      _stonehengeGroup.add(ss);
    }

    // ── GROUND CIRCLE (sacred circle marking) ──
    var groundRingGeo = new THREE.RingGeometry(12, 14, 48);
    var groundRingMat = new THREE.MeshStandardMaterial({
      color: 0x5A5A4A, roughness: 0.95, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    var groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.02;
    groundRing.receiveShadow = true;
    _stonehengeGroup.add(groundRing);

    // ── SCATTERED RUBBLE (weathered fallen fragments) ──
    var rubbleGeo = new THREE.DodecahedronGeometry(0.3, 0);
    for (var rb = 0; rb < 20; rb++) {
      var rba = _seeded(rb * 79 + 400) * Math.PI * 2;
      var rbr = 3 + _seeded(rb * 83 + 500) * 12;
      var rubble = new THREE.Mesh(rubbleGeo, stoneMats[rb % 3]);
      rubble.position.set(
        Math.cos(rba) * rbr,
        0.15,
        Math.sin(rba) * rbr
      );
      rubble.rotation.set(
        _seeded(rb * 89 + 600) * Math.PI,
        _seeded(rb * 97 + 700) * Math.PI,
        0
      );
      rubble.scale.setScalar(0.5 + _seeded(rb * 101 + 800) * 1.0);
      rubble.castShadow = true;
      _stonehengeGroup.add(rubble);
    }

    _scene.add(_stonehengeGroup);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LORE LAKE ENHANCEMENT — add reeds and lilies to existing lake
  // ═══════════════════════════════════════════════════════════════════════════

  function _buildLoreLake() {
    // Reeds around the lake shore
    _buildReeds();
    // Water lilies on the surface
    _buildWaterLilies();

    // Cozy warm light near the lake
    var lakeLight = new THREE.PointLight(0x6699BB, 1.2, 20);
    lakeLight.position.set(LAKE_X, 2, LAKE_Z);
    _scene.add(lakeLight);

    // Firefly / ambient particles (small glowing spheres)
    var fireflyGeo = new THREE.SphereGeometry(0.06, 4, 4);
    var fireflyMat = new THREE.MeshBasicMaterial({
      color: 0xFFFF88, transparent: true, opacity: 0.8
    });
    for (var fi = 0; fi < 8; fi++) {
      var fa = _seeded(fi * 113 + 900) * Math.PI * 2;
      var fr = 2 + _seeded(fi * 127 + 1000) * (LAKE_RADIUS - 2);
      var ff = new THREE.Mesh(fireflyGeo, fireflyMat.clone());
      ff.position.set(
        LAKE_X + Math.cos(fa) * fr,
        0.8 + _seeded(fi * 131 + 1100) * 1.5,
        LAKE_Z + Math.sin(fa) * fr
      );
      ff.userData = { phase: _seeded(fi * 137 + 1200) * Math.PI * 2, speed: 1 + _seeded(fi * 139) * 2 };
      _scene.add(ff);
      _lilyMeshes.push({ mesh: ff, phase: ff.userData.phase, isFirefly: true });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAY/NIGHT CYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  function _smoothstep(t) { return t * t * (3 - 2 * t); }

  function _lerpColor(c1, c2, t) {
    var r1 = (c1 >> 16) & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = c1 & 0xFF;
    var r2 = (c2 >> 16) & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = c2 & 0xFF;
    var r = Math.round(r1 + (r2 - r1) * t);
    var g = Math.round(g1 + (g2 - g1) * t);
    var b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
  }

  function _updateDayNight(dt) {
    if (!_dayNightEnabled) return;
    _dayTime += DAY_NIGHT_SPEED * dt;
    if (_dayTime > 1) _dayTime -= 1;

    var t = _dayTime;
    var sunIntensity, ambientIntensity, fogColor, skyColor;

    // Color palette
    var COL_NIGHT   = 0x0A0A1A;
    var COL_DAWN    = 0x2A1510;
    var COL_MORNING = 0x1A1A2E;
    var COL_DAY     = 0x4488AA;
    var COL_DUSK    = 0x2A1A10;

    if (t < 0.20) {
      // Deep night (0.00 → 0.20)
      sunIntensity = 0.15;
      ambientIntensity = 0.2;
      fogColor = COL_NIGHT;
      skyColor = COL_NIGHT;
    } else if (t < 0.30) {
      // Dawn (0.20 → 0.30)
      var p = _smoothstep((t - 0.20) / 0.10);
      sunIntensity = 0.15 + 0.55 * p;
      ambientIntensity = 0.2 + 0.25 * p;
      fogColor = _lerpColor(COL_NIGHT, COL_DAWN, p);
      skyColor = _lerpColor(COL_NIGHT, COL_MORNING, p);
    } else if (t < 0.45) {
      // Morning (0.30 → 0.45)
      var p = _smoothstep((t - 0.30) / 0.15);
      sunIntensity = 0.70 + 0.40 * p;
      ambientIntensity = 0.45 + 0.15 * p;
      fogColor = _lerpColor(COL_DAWN, COL_DAY, p);
      skyColor = _lerpColor(COL_MORNING, COL_DAY, p);
    } else if (t < 0.55) {
      // Noon peak (0.45 → 0.55)
      sunIntensity = 1.1;
      ambientIntensity = 0.6;
      fogColor = COL_DAY;
      skyColor = COL_DAY;
    } else if (t < 0.70) {
      // Afternoon (0.55 → 0.70)
      var p = _smoothstep((t - 0.55) / 0.15);
      sunIntensity = 1.1 - 0.40 * p;
      ambientIntensity = 0.6 - 0.15 * p;
      fogColor = _lerpColor(COL_DAY, COL_DUSK, p);
      skyColor = _lerpColor(COL_DAY, COL_DUSK, p);
    } else if (t < 0.80) {
      // Dusk (0.70 → 0.80)
      var p = _smoothstep((t - 0.70) / 0.10);
      sunIntensity = 0.70 - 0.55 * p;
      ambientIntensity = 0.45 - 0.25 * p;
      fogColor = _lerpColor(COL_DUSK, COL_NIGHT, p);
      skyColor = _lerpColor(COL_DUSK, COL_NIGHT, p);
    } else {
      // Night (0.80 → 1.00)
      sunIntensity = 0.15;
      ambientIntensity = 0.2;
      fogColor = COL_NIGHT;
      skyColor = COL_NIGHT;
    }

    // Apply to lights (use lerp for smooth transitions)
    var lerpRate = 0.08;
    if (_ambientLight) {
      _ambientLight.intensity += (ambientIntensity - _ambientLight.intensity) * lerpRate;
    }
    if (_sunLight) {
      _sunLight.intensity += (sunIntensity - _sunLight.intensity) * lerpRate;

      // Move sun in an arc
      var sunAngle = (t - 0.25) * Math.PI * 2;
      var sunElevation = Math.sin(sunAngle);
      var sunHeight = Math.max(15, sunElevation * 80);
      var lateralX = Math.cos(sunAngle) * 60;
      _sunLight.position.set(lateralX, sunHeight, 20);
    }

    // Apply fog and background color
    if (_scene && _scene.fog) {
      _scene.fog.color.setHex(fogColor);
    }
    if (_scene && _scene.background) {
      _scene.background.setHex(skyColor);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLISION & SWAY PHYSICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check collision between player position and all world objects.
   * Returns corrected position { x, z } and applies sway forces.
   * @param {number} px - player X
   * @param {number} pz - player Z
   * @param {number} pr - player radius
   * @returns {{ x: number, z: number, inLake: boolean, lakeDepth: number }}
   */
  function _checkCollisions(px, pz, pr) {
    var result = { x: px, z: pz, inLake: false, lakeDepth: 0 };
    var corrX = px, corrZ = pz;

    // ── Trees (sway on contact) ──
    for (var i = 0; i < _trees.length; i++) {
      var tr = _trees[i];
      var dx = corrX - tr.ox;
      var dz = corrZ - tr.oz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var minDist = pr + tr.hitR;

      if (dist < minDist && dist > 0.001) {
        // Push player out
        var overlap = minDist - dist;
        var nx = dx / dist;
        var nz = dz / dist;
        corrX += nx * overlap;
        corrZ += nz * overlap;

        // Apply sway force to tree (opposite direction of player push)
        tr.swayVx -= nx * SWAY_PUSH;
        tr.swayVz -= nz * SWAY_PUSH;
      }
    }

    // ── Rocks (solid, no sway) ──
    for (var i = 0; i < _rocks.length; i++) {
      var rk = _rocks[i];
      var dx = corrX - rk.ox;
      var dz = corrZ - rk.oz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var minDist = pr + rk.hitR;

      if (dist < minDist && dist > 0.001) {
        var overlap = minDist - dist;
        var nx = dx / dist;
        var nz = dz / dist;
        corrX += nx * overlap;
        corrZ += nz * overlap;
      }
    }

    // ── Fence posts (sway on contact) ──
    for (var i = 0; i < _fencePosts.length; i++) {
      var fp = _fencePosts[i];
      var dx = corrX - fp.ox;
      var dz = corrZ - fp.oz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var minDist = pr + fp.hitR;

      if (dist < minDist && dist > 0.001) {
        var overlap = minDist - dist;
        var nx = dx / dist;
        var nz = dz / dist;
        corrX += nx * overlap;
        corrZ += nz * overlap;

        fp.swayVx -= nx * SWAY_PUSH;
        fp.swayVz -= nz * SWAY_PUSH;
      }
    }

    // ── Lore Lake (slow + sink) ──
    var ldx = corrX - LAKE_X;
    var ldz = corrZ - LAKE_Z;
    var lakeDist = Math.sqrt(ldx * ldx + ldz * ldz);
    if (lakeDist < LAKE_RADIUS) {
      result.inLake = true;
      // Depth factor: deeper toward center
      result.lakeDepth = 1 - (lakeDist / LAKE_RADIUS);
    }

    result.x = corrX;
    result.z = corrZ;
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAY ANIMATION UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  function _updateSway(dt) {
    // FIX 1A & FIX L: Skip all sway updates in sandbox mode — sandbox handles its own world via WorldTrees
    if (window._engine2SandboxMode) return;

    // Trees — skip if a WorldTrees instance is active (it handles sway with LOD)
    if (!(window._engine2Instance && window._engine2Instance._worldTrees)) {
      for (var i = 0; i < _trees.length; i++) {
        var tr = _trees[i];
        // Spring-damper physics
        tr.swayVx += (-SWAY_SPRING * tr.swayX - SWAY_DAMP * tr.swayVx) * dt;
        tr.swayVz += (-SWAY_SPRING * tr.swayZ - SWAY_DAMP * tr.swayVz) * dt;
        tr.swayX += tr.swayVx * dt;
        tr.swayZ += tr.swayVz * dt;

        // Apply sway as rotation to the group
        tr.group.rotation.x = tr.swayZ * 0.15;
        tr.group.rotation.z = -tr.swayX * 0.15;
      }
    }

    // Fence posts
    for (var i = 0; i < _fencePosts.length; i++) {
      var fp = _fencePosts[i];
      fp.swayVx += (-SWAY_SPRING * fp.swayX - SWAY_DAMP * fp.swayVx) * dt;
      fp.swayVz += (-SWAY_SPRING * fp.swayZ - SWAY_DAMP * fp.swayVz) * dt;
      fp.swayX += fp.swayVx * dt;
      fp.swayZ += fp.swayVz * dt;

      fp.mesh.rotation.x = fp.swayZ * 0.3;
      fp.mesh.rotation.z = -fp.swayX * 0.3;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AMBIENT ANIMATIONS (reeds, lilies, fireflies)
  // ═══════════════════════════════════════════════════════════════════════════

  function _updateAmbient(dt) {
    // Reeds sway in wind
    for (var i = 0; i < _reedMeshes.length; i++) {
      var rm = _reedMeshes[i];
      rm.phase += dt * 1.5;
      rm.mesh.rotation.z = Math.sin(rm.phase) * 0.08;
      rm.mesh.rotation.x = Math.sin(rm.phase * 0.7) * 0.05;
    }

    // Water lilies bob gently
    for (var i = 0; i < _lilyMeshes.length; i++) {
      var lm = _lilyMeshes[i];
      lm.phase += dt * (lm.isFirefly ? 2.5 : 0.8);

      if (lm.isFirefly) {
        // Firefly flicker
        if (lm.mesh.material) {
          lm.mesh.material.opacity = 0.3 + Math.abs(Math.sin(lm.phase)) * 0.7;
        }
        lm.mesh.position.y += Math.sin(lm.phase * 0.5) * 0.003;
      } else {
        // Lily bob
        lm.mesh.position.y = 0.03 + Math.sin(lm.phase) * 0.02;
        lm.mesh.rotation.z = Math.sin(lm.phase * 0.5) * 0.03;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATHERING / MINING
  // ═══════════════════════════════════════════════════════════════════════════

  function _tryGather(px, pz) {
    if (_gatherCooldown > 0) return null;

    // Check trees
    for (var i = 0; i < _trees.length; i++) {
      var tr = _trees[i];
      if (tr.hp <= 0) continue;
      var dx = px - tr.ox;
      var dz = pz - tr.oz;
      if (dx * dx + dz * dz < GATHER_RANGE * GATHER_RANGE) {
        tr.hp--;
        _gatherCooldown = GATHER_COOLDOWN;
        // Strong sway on hit
        var dist = Math.sqrt(dx * dx + dz * dz) || 1;
        tr.swayVx += (dx / dist) * 0.8;
        tr.swayVz += (dz / dist) * 0.8;
        // Dim the tree when depleted
        if (tr.hp <= 0) {
          tr.group.children.forEach(function (c) {
            if (c.material) {
              c.material = c.material.clone();
              c.material.opacity = 0.4;
              c.material.transparent = true;
            }
          });
        }
        return { type: 'wood', amount: 2 + Math.floor(_seeded(i * 151 + _dayTime * 100) * 3) };
      }
    }

    // Check rocks
    for (var i = 0; i < _rocks.length; i++) {
      var rk = _rocks[i];
      if (rk.hp <= 0) continue;
      var dx = px - rk.ox;
      var dz = pz - rk.oz;
      if (dx * dx + dz * dz < GATHER_RANGE * GATHER_RANGE) {
        rk.hp--;
        _gatherCooldown = GATHER_COOLDOWN;
        if (rk.hp <= 0) {
          if (rk.mesh.material) {
            rk.mesh.material = rk.mesh.material.clone();
            rk.mesh.material.opacity = 0.4;
            rk.mesh.material.transparent = true;
          }
        }
        return { type: 'stone', amount: 1 + Math.floor(_seeded(i * 157 + _dayTime * 100) * 3) };
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  var WorldObjects = {};

  /**
   * Initialize all world objects. Call once after scene is ready.
   * @param {THREE.Scene} scene
   * @param {{ ambient: THREE.Light, sun: THREE.Light, fill: THREE.Light }} lights
   */
  WorldObjects.init = function (scene, lights) {
    if (!scene) {
      console.warn('[WorldObjects] init() called without scene');
      return;
    }
    _scene = scene;

    // Store light references for day/night
    if (lights) {
      _ambientLight = lights.ambient || null;
      _sunLight = lights.sun || null;
      _fillLight = lights.fill || null;
      _hemisphereLight = lights.hemisphere || null;
    }

    console.log('[WorldObjects] Building static world...');

    _createSharedGeometry();
    _buildTrees();
    _buildRocks();
    _buildFences();
    _buildGrass();
    _buildStonehenge();
    _buildLoreLake();
    _buildHiddenMeshes();

    console.log('[WorldObjects] ✓ Static world built:',
      _trees.length, 'trees,',
      _rocks.length, 'rocks,',
      _fencePosts.length, 'fence posts,',
      _grassMeshes.length, 'grass tufts');
  };

  /**
   * Update world animations and day/night cycle. Call every frame.
   * @param {number} dt - delta time in seconds
   */
  WorldObjects.update = function (dt) {
    _updateDayNight(dt);
    _updateSway(dt);
    _updateAmbient(dt);
    if (_gatherCooldown > 0) _gatherCooldown -= dt;
    _updateHiddenEvents(dt);
  };

  /**
   * Check player collision against world objects.
   * Returns corrected position and lake status.
   * @param {number} px - player X
   * @param {number} pz - player Z
   * @param {number} pr - player collision radius (default 0.5)
   * @returns {{ x: number, z: number, inLake: boolean, lakeDepth: number }}
   */
  WorldObjects.checkCollision = function (px, pz, pr) {
    return _checkCollisions(px, pz, pr || 0.5);
  };

  /**
   * Attempt to gather resources from nearby trees/rocks.
   * @param {number} px - player X
   * @param {number} pz - player Z
   * @returns {{ type: string, amount: number } | null}
   */
  WorldObjects.tryGather = function (px, pz) {
    return _tryGather(px, pz);
  };

  /** Lake slow factor (0-1 multiplier to apply to player speed when in lake) */
  WorldObjects.LAKE_SLOW_FACTOR = LAKE_SLOW_FACTOR;
  /** Lake sink Y offset */
  WorldObjects.LAKE_SINK_Y = LAKE_SINK_Y;

  /** Get current day/night time (0-1) */
  WorldObjects.getDayTime = function () { return _dayTime; };

  /**
   * Enable or disable the built-in day/night cycle.
   * Pass false when an external sky-cycle system (e.g. sandbox _updateSkyCycle)
   * takes ownership of scene.background, fog.color, and light intensities so the
   * two systems don't fight each other.
   * @param {boolean} enabled
   */
  WorldObjects.setDayNightEnabled = function (enabled) { _dayNightEnabled = !!enabled; };

  // ═══════════════════════════════════════════════════════════════════════════
  // HIDDEN ENVIRONMENTAL EVENTS
  // Two deeply hidden, undocumented atmospheric surprises
  // ═══════════════════════════════════════════════════════════════════════════
  var _hiddenEventTimer = 0;
  var _glyphGroup = null;
  var _glyphActive = false;
  var _glyphFade = 0;
  var _watcherMesh = null;
  var _watcherActive = false;
  var _watcherFade = 0;
  var _watcherPulse = 0;

  function _buildHiddenMeshes() {
    if (!_scene) return;

    // Event 1: Ancient Annunaki Glyphs above Stonehenge
    _glyphGroup = new THREE.Group();
    _glyphGroup.visible = false;
    var glyphMat = new THREE.MeshBasicMaterial({
      color: 0x00FFCC, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false
    });
    // Create 7 floating glyph rings (torus knots as ancient symbols)
    for (var g = 0; g < 7; g++) {
      var radius = 0.3 + Math.random() * 0.4;
      var glyph = new THREE.Mesh(
        new THREE.TorusKnotGeometry(radius, 0.06, 32, 6, 2, 3),
        glyphMat.clone()
      );
      var angle = (g / 7) * Math.PI * 2;
      var dist = 3 + Math.random() * 2;
      glyph.position.set(
        Math.cos(angle) * dist,
        8 + g * 0.6 + Math.random() * 2,
        Math.sin(angle) * dist
      );
      glyph.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      glyph._baseY = glyph.position.y;
      glyph._phase = Math.random() * Math.PI * 2;
      glyph._rotSpeed = 0.3 + Math.random() * 0.5;
      _glyphGroup.add(glyph);
    }
    // Center column of light (vertical beam)
    var beamGeo = new THREE.CylinderGeometry(0.15, 0.15, 12, 8);
    var beamMat = new THREE.MeshBasicMaterial({
      color: 0x00FFAA, transparent: true, opacity: 0, depthWrite: false
    });
    var beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 6, 0);
    _glyphGroup.add(beam);
    _glyphGroup._beam = beam;
    // Position at Stonehenge center (approx 45, 0, 45)
    _glyphGroup.position.set(45, 0, 45);
    _scene.add(_glyphGroup);

    // Event 2: The Watcher — giant translucent eye in the sky
    var watcherGroup = new THREE.Group();
    // Outer eye (iris/sclera)
    var eyeGeo = new THREE.SphereGeometry(6, 24, 16);
    var eyeMat = new THREE.MeshBasicMaterial({
      color: 0x220033, transparent: true, opacity: 0, depthWrite: false
    });
    var eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    eyeMesh.scale.set(1.0, 0.45, 1.0); // flatten to eye shape
    watcherGroup.add(eyeMesh);
    // Iris
    var irisGeo = new THREE.SphereGeometry(2.5, 20, 12);
    var irisMat = new THREE.MeshBasicMaterial({
      color: 0x990044, transparent: true, opacity: 0, depthWrite: false
    });
    var iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(0, 0, 2.0);
    iris.scale.set(1, 1, 0.3);
    watcherGroup.add(iris);
    // Pupil
    var pupilGeo = new THREE.SphereGeometry(1.2, 16, 10);
    var pupilMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0, depthWrite: false
    });
    var pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 3.2);
    pupil.scale.set(1, 1, 0.2);
    watcherGroup.add(pupil);
    // Veins (thin torus shapes)
    for (var v = 0; v < 5; v++) {
      var vein = new THREE.Mesh(
        new THREE.TorusGeometry(3 + Math.random() * 2.5, 0.08, 6, 20),
        new THREE.MeshBasicMaterial({
          color: 0x440011, transparent: true, opacity: 0, depthWrite: false
        })
      );
      vein.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, 0);
      watcherGroup.add(vein);
    }
    watcherGroup.position.set(0, 35, 0);
    watcherGroup.rotation.x = -Math.PI / 2; // face down
    watcherGroup.visible = false;
    _scene.add(watcherGroup);
    _watcherMesh = watcherGroup;
    _watcherMesh._eyeMat = eyeMat;
    _watcherMesh._irisMat = irisMat;
    _watcherMesh._pupilMat = pupilMat;
  }

  function _updateHiddenEvents(dt) {
    _hiddenEventTimer += dt;

    // Event 1: Annunaki Glyphs — appear near midnight (dayTime ~0.0-0.05)
    var isDeepNight = _dayTime < 0.05 || _dayTime > 0.95;
    var glyphShouldShow = isDeepNight && (_hiddenEventTimer > 60);
    if (glyphShouldShow && !_glyphActive && _glyphGroup) {
      _glyphActive = true;
      _glyphFade = 0;
      _glyphGroup.visible = true;
    }
    if (_glyphActive && _glyphGroup) {
      if (isDeepNight) {
        _glyphFade = Math.min(1, _glyphFade + dt * 0.3);
      } else {
        _glyphFade = Math.max(0, _glyphFade - dt * 0.5);
        if (_glyphFade <= 0) {
          _glyphActive = false;
          _glyphGroup.visible = false;
        }
      }
      // Animate glyphs: rotate, bob, pulse opacity
      for (var i = 0; i < _glyphGroup.children.length; i++) {
        var child = _glyphGroup.children[i];
        if (child === _glyphGroup._beam) {
          child.material.opacity = _glyphFade * 0.15 * (0.7 + Math.sin(_hiddenEventTimer * 2) * 0.3);
          continue;
        }
        if (child._baseY !== undefined) {
          child.rotation.y += child._rotSpeed * dt;
          child.rotation.x += child._rotSpeed * 0.3 * dt;
          child.position.y = child._baseY + Math.sin(_hiddenEventTimer * 0.8 + child._phase) * 0.5;
          child.material.opacity = _glyphFade * (0.4 + Math.sin(_hiddenEventTimer * 1.5 + child._phase) * 0.3);
          child.material.color.setHex(
            _hiddenEventTimer % 8 < 4 ? 0x00FFCC : 0x8800FF
          );
        }
      }
    }

    // Event 2: The Watcher — appears rarely during night, stares at player
    var watcherTrigger = _dayTime > 0.80 && _dayTime < 0.90 && _hiddenEventTimer > 120;
    if (watcherTrigger && !_watcherActive && _watcherMesh) {
      _watcherActive = true;
      _watcherFade = 0;
      _watcherPulse = 0;
      _watcherMesh.visible = true;
    }
    if (_watcherActive && _watcherMesh) {
      var inWindow = _dayTime > 0.78 && _dayTime < 0.92;
      if (inWindow) {
        _watcherFade = Math.min(1, _watcherFade + dt * 0.15);
      } else {
        _watcherFade = Math.max(0, _watcherFade - dt * 0.3);
        if (_watcherFade <= 0) {
          _watcherActive = false;
          _watcherMesh.visible = false;
        }
      }
      _watcherPulse += dt * 1.5;
      var opBase = _watcherFade * 0.25;
      var pulse = Math.sin(_watcherPulse) * 0.08;
      _watcherMesh._eyeMat.opacity = opBase + pulse;
      _watcherMesh._irisMat.opacity = (opBase + pulse) * 1.5;
      _watcherMesh._pupilMat.opacity = (opBase + pulse) * 2.0;
      // Slow rotation (eerie drift)
      _watcherMesh.rotation.z += dt * 0.05;
      // Veins pulse
      for (var i = 0; i < _watcherMesh.children.length; i++) {
        var c = _watcherMesh.children[i];
        if (c.geometry && c.geometry.type === 'TorusGeometry') {
          c.material.opacity = opBase * 0.6 * (0.5 + Math.sin(_watcherPulse + i) * 0.5);
        }
      }
    }
  }

  window.WorldObjects = WorldObjects;
  console.log('[WorldObjects] Module loaded');
})();
