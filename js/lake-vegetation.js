/**
 * LAKE VEGETATION SYSTEM — Cozy Lake Area for Sandbox 2.0
 *
 * Adds bonsai trees, lily pads (näckrosor), reeds (vass), and decorative
 * grass tufts around the Lore Lake. Pooled for zero-GC, with per-frame
 * animation (sway, bob, wind) and a chop mechanic for bonsai trees.
 *
 * Public API (all on window.LakeVegetation):
 *   initLakeVegetationPool()        — create shared geo/mat & pools
 *   generateCozyLakeArea(scene)     — spawn all vegetation into the scene
 *   updateLakeVegetation(delta)     — per-frame animation tick
 *   chopLakeTree(tree)              — chop a bonsai tree (gather wood)
 *
 * Exposes: window.LakeVegetation
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION — matches world-objects.js lake position
  // ═══════════════════════════════════════════════════════════════════════════
  var LAKE_X      = 30;
  var LAKE_Z      = -30;
  var LAKE_RADIUS = 8;

  // Bonsai tree ring — placed just outside the shore ring (r ≈ 10-14)
  var BONSAI_COUNT       = 8;
  var BONSAI_RING_MIN    = 10;
  var BONSAI_RING_MAX    = 14;
  var BONSAI_TRUNK_H     = 1.0;
  var BONSAI_CANOPY_R    = 0.9;
  var BONSAI_HP          = 4;

  // Lily pads (näckrosor) — on the lake surface
  var LILY_COUNT         = 14;
  var LILY_INNER_R       = 1.5;  // minimum distance from lake center
  var LILY_OUTER_R       = 6.5;  // maximum distance from lake center

  // Reeds (vass) — on the shore edge
  var REED_COUNT         = 22;
  var REED_RING_MIN      = 7.0;
  var REED_RING_MAX      = 9.5;

  // Grass tufts — scattered around shore
  var GRASS_COUNT        = 30;
  var GRASS_RING_MIN     = 8.5;
  var GRASS_RING_MAX     = 15;

  // Sway physics (spring-damper for bonsai)
  var SWAY_SPRING = 14.0;
  var SWAY_DAMP   = 5.0;
  var SWAY_PUSH   = 0.3;

  // Gather
  var GATHER_RANGE    = 2.5;
  var GATHER_COOLDOWN = 0.8;

  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINISTIC SEEDED RANDOM (same map every run)
  // ═══════════════════════════════════════════════════════════════════════════
  function _seed(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE STATE
  // ═══════════════════════════════════════════════════════════════════════════
  var _scene          = null;
  var _poolReady      = false;

  // Shared geometries & materials
  var _bonsaiTrunkGeo, _bonsaiTrunkMat;
  var _bonsaiCanopyGeo, _bonsaiCanopyMat;
  var _lilyPadGeo, _lilyPadMat;
  var _lilyFlowerGeo, _lilyFlowerMat;
  var _reedGeo, _reedMat, _reedTopGeo, _reedTopMat;
  var _grassGeo, _grassMat;

  // Live object arrays
  var _bonsaiTrees  = [];  // { group, hp, ox, oz, swayX, swayZ, swayVx, swayVz }
  var _lilyPads     = [];  // { mesh, phase }
  var _reeds        = [];  // { mesh, phase }
  var _grassTufts   = [];  // { mesh, phase }

  var _gatherCooldown = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // POOL INIT — create all shared geometry/material once
  // ═══════════════════════════════════════════════════════════════════════════

  function initLakeVegetationPool() {
    if (_poolReady) return;
    _poolReady = true;

    // ── Bonsai trunk ──
    _bonsaiTrunkGeo = new THREE.CylinderGeometry(0.12, 0.18, BONSAI_TRUNK_H, 6);
    _bonsaiTrunkMat = new THREE.MeshToonMaterial({ color: 0x5C3317 });

    // ── Bonsai canopy (flat sphere for bonsai look) ──
    _bonsaiCanopyGeo = new THREE.SphereGeometry(BONSAI_CANOPY_R, 8, 6);
    _bonsaiCanopyMat = new THREE.MeshToonMaterial({ color: 0x228B22 });

    // ── Lily pad ──
    _lilyPadGeo = new THREE.CircleGeometry(0.45, 8);
    _lilyPadMat = new THREE.MeshToonMaterial({
      color: 0x2E8B2E, side: THREE.DoubleSide
    });

    // ── Lily flower ──
    _lilyFlowerGeo = new THREE.SphereGeometry(0.12, 6, 4);
    _lilyFlowerMat = new THREE.MeshBasicMaterial({ color: 0xFFB6C1 });

    // ── Reed stalk ──
    _reedGeo    = new THREE.CylinderGeometry(0.025, 0.045, 1.6, 4);
    _reedMat    = new THREE.MeshToonMaterial({ color: 0x556B2F });
    _reedTopGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.22, 4);
    _reedTopMat = new THREE.MeshToonMaterial({ color: 0x4A3520 });

    // ── Grass ──
    _grassGeo = new THREE.ConeGeometry(0.18, 0.55, 4);
    _grassMat = new THREE.MeshToonMaterial({ color: 0x4D8B30 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATE — spawn all lake vegetation into the scene
  // ═══════════════════════════════════════════════════════════════════════════

  function generateCozyLakeArea(scene) {
    if (!scene) return;
    _scene = scene;

    if (!_poolReady) initLakeVegetationPool();

    // ── 1. Bonsai trees ──
    for (var i = 0; i < BONSAI_COUNT; i++) {
      var angle  = (i / BONSAI_COUNT) * Math.PI * 2 + _seed(i * 37 + 1) * 0.5;
      var radius = BONSAI_RING_MIN + _seed(i * 53 + 2) * (BONSAI_RING_MAX - BONSAI_RING_MIN);
      var bx     = LAKE_X + Math.cos(angle) * radius;
      var bz     = LAKE_Z + Math.sin(angle) * radius;
      var scale  = 0.7 + _seed(i * 67 + 3) * 0.5;

      var group = new THREE.Group();
      group.position.set(bx, 0, bz);

      // Trunk — slightly curved look via rotation
      var trunk = new THREE.Mesh(_bonsaiTrunkGeo, _bonsaiTrunkMat);
      trunk.position.y = BONSAI_TRUNK_H * 0.5;
      trunk.rotation.z = (_seed(i * 71 + 4) - 0.5) * 0.3;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      group.add(trunk);

      // Canopy — flattened sphere for bonsai silhouette
      var canopy = new THREE.Mesh(_bonsaiCanopyGeo, _bonsaiCanopyMat);
      canopy.position.y = BONSAI_TRUNK_H + BONSAI_CANOPY_R * 0.5;
      canopy.scale.set(1, 0.55, 1); // flatten vertically
      canopy.castShadow = true;
      group.add(canopy);

      group.scale.setScalar(scale);
      _scene.add(group);

      _bonsaiTrees.push({
        group:  group,
        hp:     BONSAI_HP,
        ox:     bx,
        oz:     bz,
        swayX:  0,
        swayZ:  0,
        swayVx: 0,
        swayVz: 0,
        hitR:   0.8 * scale
      });
    }

    // ── 2. Lily pads (näckrosor) ──
    for (var i = 0; i < LILY_COUNT; i++) {
      var la     = _seed(i * 83 + 10) * Math.PI * 2;
      var lr     = LILY_INNER_R + _seed(i * 89 + 11) * (LILY_OUTER_R - LILY_INNER_R);
      var lx     = LAKE_X + Math.cos(la) * lr;
      var lz     = LAKE_Z + Math.sin(la) * lr;
      var lScale = 0.5 + _seed(i * 97 + 12) * 0.5;

      var lilyGroup = new THREE.Group();

      // Pad
      var pad = new THREE.Mesh(_lilyPadGeo, _lilyPadMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.06;
      lilyGroup.add(pad);

      // Flower on every other lily
      if (i % 2 === 0) {
        var flower = new THREE.Mesh(_lilyFlowerGeo, _lilyFlowerMat);
        flower.position.y = 0.14;
        lilyGroup.add(flower);
      }

      lilyGroup.position.set(lx, 0, lz);
      lilyGroup.scale.setScalar(lScale);
      _scene.add(lilyGroup);

      _lilyPads.push({
        mesh:  lilyGroup,
        phase: _seed(i * 101 + 13) * Math.PI * 2
      });
    }

    // ── 3. Reeds (vass) ──
    for (var i = 0; i < REED_COUNT; i++) {
      var ra     = (i / REED_COUNT) * Math.PI * 2 + _seed(i * 109 + 20) * 0.4;
      var rr     = REED_RING_MIN + _seed(i * 113 + 21) * (REED_RING_MAX - REED_RING_MIN);
      var rx     = LAKE_X + Math.cos(ra) * rr;
      var rz     = LAKE_Z + Math.sin(ra) * rr;
      var rScale = 0.6 + _seed(i * 127 + 22) * 0.5;

      var reedGroup = new THREE.Group();

      // 3 stalks per cluster
      for (var s = 0; s < 3; s++) {
        var stalk = new THREE.Mesh(_reedGeo, _reedMat);
        stalk.position.set(
          (s - 1) * 0.12,
          0.8 * rScale,
          (s % 2) * 0.08
        );
        stalk.rotation.z = (s - 1) * 0.08;
        reedGroup.add(stalk);
      }

      // Cattail top
      var top = new THREE.Mesh(_reedTopGeo, _reedTopMat);
      top.position.y = 1.5 * rScale;
      reedGroup.add(top);

      reedGroup.position.set(rx, 0, rz);
      reedGroup.scale.setScalar(rScale);
      _scene.add(reedGroup);

      _reeds.push({
        mesh:  reedGroup,
        phase: _seed(i * 131 + 23) * Math.PI * 2
      });
    }

    // ── 4. Grass tufts ──
    for (var i = 0; i < GRASS_COUNT; i++) {
      var ga     = _seed(i * 137 + 30) * Math.PI * 2;
      var gr     = GRASS_RING_MIN + _seed(i * 139 + 31) * (GRASS_RING_MAX - GRASS_RING_MIN);
      var gx     = LAKE_X + Math.cos(ga) * gr;
      var gz     = LAKE_Z + Math.sin(ga) * gr;
      var gScale = 0.5 + _seed(i * 149 + 32) * 0.6;

      var tuft = new THREE.Group();
      for (var b = 0; b < 3; b++) {
        var blade = new THREE.Mesh(_grassGeo, _grassMat);
        blade.position.set(
          (b - 1) * 0.1,
          0.27 * gScale,
          (b % 2) * 0.06
        );
        blade.rotation.z = (b - 1) * 0.15;
        tuft.add(blade);
      }

      tuft.position.set(gx, 0, gz);
      tuft.rotation.y = _seed(i * 151 + 33) * Math.PI * 2;
      tuft.scale.setScalar(gScale);
      _scene.add(tuft);

      _grassTufts.push({
        mesh:  tuft,
        phase: _seed(i * 157 + 34) * Math.PI * 2
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE — per-frame animation
  // ═══════════════════════════════════════════════════════════════════════════

  function updateLakeVegetation(delta) {
    var dt = delta;

    // ── Bonsai sway (spring-damper) ──
    for (var i = 0; i < _bonsaiTrees.length; i++) {
      var bt = _bonsaiTrees[i];
      bt.swayVx += (-SWAY_SPRING * bt.swayX - SWAY_DAMP * bt.swayVx) * dt;
      bt.swayVz += (-SWAY_SPRING * bt.swayZ - SWAY_DAMP * bt.swayVz) * dt;
      bt.swayX  += bt.swayVx * dt;
      bt.swayZ  += bt.swayVz * dt;

      bt.group.rotation.x = bt.swayZ * 0.12;
      bt.group.rotation.z = -bt.swayX * 0.12;

      // Gentle ambient wind
      var windPhase = dt * 0.5 + i * 1.3;
      bt.group.rotation.x += Math.sin(windPhase) * 0.008;
    }

    // ── Lily pads bob on water ──
    for (var i = 0; i < _lilyPads.length; i++) {
      var lp = _lilyPads[i];
      lp.phase += dt * 0.9;
      lp.mesh.position.y = 0.04 + Math.sin(lp.phase) * 0.018;
      lp.mesh.rotation.z = Math.sin(lp.phase * 0.6) * 0.025;
    }

    // ── Reeds sway in wind ──
    for (var i = 0; i < _reeds.length; i++) {
      var rd = _reeds[i];
      rd.phase += dt * 1.4;
      rd.mesh.rotation.z = Math.sin(rd.phase) * 0.07;
      rd.mesh.rotation.x = Math.sin(rd.phase * 0.65) * 0.04;
    }

    // ── Grass tufts wind rustle ──
    for (var i = 0; i < _grassTufts.length; i++) {
      var gt = _grassTufts[i];
      gt.phase += dt * 1.1;
      gt.mesh.rotation.z = Math.sin(gt.phase) * 0.05;
      gt.mesh.rotation.x = Math.sin(gt.phase * 0.8) * 0.03;
    }

    // Gather cooldown
    if (_gatherCooldown > 0) _gatherCooldown -= dt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHOP — hit a bonsai tree for wood
  // ═══════════════════════════════════════════════════════════════════════════

  function chopLakeTree(tree) {
    if (!tree || tree.hp <= 0) return null;

    tree.hp--;

    // Push sway on hit
    tree.swayVx += (Math.random() - 0.5) * SWAY_PUSH * 4;
    tree.swayVz += (Math.random() - 0.5) * SWAY_PUSH * 4;

    // Dim when depleted
    if (tree.hp <= 0) {
      tree.group.children.forEach(function (c) {
        if (c.material) {
          c.material = c.material.clone();
          c.material.opacity = 0.35;
          c.material.transparent = true;
        }
      });
    }

    return { type: 'wood', amount: 1 + Math.floor(_seed(tree.ox * 7 + tree.oz * 13) * 3) };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATHER HELPER — try gathering from nearby bonsai (called from game loop)
  // ═══════════════════════════════════════════════════════════════════════════

  function tryGatherLakeTree(px, pz) {
    if (_gatherCooldown > 0) return null;

    for (var i = 0; i < _bonsaiTrees.length; i++) {
      var bt = _bonsaiTrees[i];
      if (bt.hp <= 0) continue;
      var dx = px - bt.ox;
      var dz = pz - bt.oz;
      if (dx * dx + dz * dz < GATHER_RANGE * GATHER_RANGE) {
        _gatherCooldown = GATHER_COOLDOWN;
        // Push sway toward player
        var dist = Math.sqrt(dx * dx + dz * dz) || 1;
        bt.swayVx += (dx / dist) * 0.6;
        bt.swayVz += (dz / dist) * 0.6;
        return chopLakeTree(bt);
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLISION — check player vs bonsai hitboxes
  // ═══════════════════════════════════════════════════════════════════════════

  function checkBonsaiCollision(px, pz, pr) {
    var corrX = px;
    var corrZ = pz;
    var playerR = pr || 0.5;

    for (var i = 0; i < _bonsaiTrees.length; i++) {
      var bt = _bonsaiTrees[i];
      if (bt.hp <= 0) continue;
      var dx = corrX - bt.ox;
      var dz = corrZ - bt.oz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var minDist = playerR + bt.hitR;
      if (dist < minDist && dist > 0.001) {
        var overlap = minDist - dist;
        var nx = dx / dist;
        var nz = dz / dist;
        corrX += nx * overlap;
        corrZ += nz * overlap;

        // Sway on bump
        bt.swayVx -= nx * SWAY_PUSH;
        bt.swayVz -= nz * SWAY_PUSH;
      }
    }

    return { x: corrX, z: corrZ };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  var LakeVegetation = {};

  LakeVegetation.initLakeVegetationPool = initLakeVegetationPool;
  LakeVegetation.generateCozyLakeArea   = generateCozyLakeArea;
  LakeVegetation.updateLakeVegetation   = updateLakeVegetation;
  LakeVegetation.chopLakeTree           = chopLakeTree;
  LakeVegetation.tryGatherLakeTree      = tryGatherLakeTree;
  LakeVegetation.checkBonsaiCollision   = checkBonsaiCollision;

  /** Expose bonsai array for external systems */
  LakeVegetation.getBonsaiTrees = function () { return _bonsaiTrees; };

  window.LakeVegetation = LakeVegetation;

})();
