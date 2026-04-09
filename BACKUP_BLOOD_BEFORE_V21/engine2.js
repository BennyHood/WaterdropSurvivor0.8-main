/**
 * ENGINE 2.0 SANDBOX
 *
 * Clean arena system with PBR ground, spawn hole, and world landmarks.
 * Replaces old wave manager and infinite ground plane.
 *
 * GROUND TEXTURE STATUS: ✅ WORKING
 * - Primary texture: assets/textures/rocky_terrain_03_diff_2k.jpg (3.7MB, 2048x2048)
 * - Fallback chain: rocky_terrain_03_diff → mossy_brick → ground/color.jpg → procedural
 * - Texture confirmed loading and displaying properly as of 2026-03-24
 * - Material: MeshLambertMaterial with 20x20 repeat, anisotropic filtering
 *
 * LANDMARKS STATUS: ✅ ADDED 2026-03-24
 * - UFO crash site at (-50, 25) with glowing engine lights + companion egg
 * - Annunaki Obelisk at (25, -35) with energy crystal, rotating rings, pylons
 * - Lake with waterfall at (30, -30) with sparkles and animated water
 * - All landmarks animated in sandbox-loop.js
 *
 * NEVER modify this file without understanding the texture loading flow.
 * See README.md section "🧪 SANDBOX 2.0 — TESTING ENVIRONMENT" for details.
 */

class Engine2Sandbox {
  constructor(scene, camera) {
    this.scene = scene || null;
    this.camera = camera || null;
    this.groundMesh = null;
    this.rimMesh = null;
    this.loaded = false;

    // Texture loading state
    this.textures = {
      diffuse: null,
      normal: null,
      roughness: null
    };
  }

  /**
   * Initialize the Engine 2.0 arena
   * Called when "Start Run" is triggered
   * @param {THREE.Scene} [sceneOverride] optional scene passed by caller
   */
  init(sceneOverride) {
    if (sceneOverride) this.scene = sceneOverride;
    if (!this.scene) {
      console.warn('[Engine2] init() called without a valid scene. Aborting arena build.');
      return;
    }

    console.log('[Engine2] Initializing Engine 2.0 Sandbox...');

    // Load textures and create arena
    this._loadTextures(() => {
      this._createArena();
      this._applyTerrainDisplacement();
      this._createLandmarks();
      this.loaded = true;
      console.log('[Engine2] Engine 2.0 arena initialized successfully');
    });
  }

  /**
   * Load ground textures - uses file-based textures with fallback chain
   */
  _loadTextures(callback) {
    console.log('[Engine2] Loading ground textures...');
    const loader = new THREE.TextureLoader();

    // Helper to configure texture properly
    const configureTexture = (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(20, 20);
      texture.anisotropy = 4;

      // Set proper color space for correct display
      if (THREE.SRGBColorSpace !== undefined) {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else if (THREE.sRGBEncoding !== undefined) {
        texture.encoding = THREE.sRGBEncoding;
      }

      return texture;
    };

    // Helper to apply texture to material
    const applyTexture = (texture) => {
      this.textures.diffuse = texture;
      if (this.groundMesh && this.groundMesh.material) {
        this.groundMesh.material.map = texture;
        this.groundMesh.material.color.setHex(0xffffff); // White base for natural texture color
        this.groundMesh.material.needsUpdate = true;
      }
      console.log('[Engine2] ✓ Texture applied successfully');
    };

    // Fallback chain: Try loading textures in order
    const tryLoadTexture = (paths, index = 0) => {
      if (index >= paths.length) {
        console.warn('[Engine2] All texture files failed to load, using procedural fallback');
        this._createProceduralTexture();
        this._generateProceduralNormalMap();
        callback();
        return;
      }

      const path = paths[index];
      console.log(`[Engine2] Attempting to load: ${path}`);

      loader.load(
        path,
        (texture) => {
          console.log(`[Engine2] ✓ Successfully loaded: ${path}`);
          configureTexture(texture);
          applyTexture(texture);
          this._generateProceduralNormalMap();
          callback();
        },
        undefined,
        (error) => {
          console.warn(`[Engine2] Failed to load ${path}:`, error);
          tryLoadTexture(paths, index + 1);
        }
      );
    };

    // Texture fallback paths in priority order
    const texturePaths = [
      'assets/textures/rocky_terrain_03_diff_2k.jpg',
      'assets/textures/mossy_brick_diff_4k.jpg',
      'assets/textures/ground/color.jpg'
    ];

    tryLoadTexture(texturePaths);
  }

  /**
   * Create procedural texture as fallback when file loading fails
   */
  _createProceduralTexture() {
    console.log('[Engine2] Creating procedural stone texture...');

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Base stone color (warm grey/brown)
    ctx.fillStyle = '#8B7D6B';
    ctx.fillRect(0, 0, 1024, 1024);

    // Add stone tile pattern
    const tileSize = 128;
    for (let y = 0; y < 1024; y += tileSize) {
      for (let x = 0; x < 1024; x += tileSize) {
        // Tile variation
        const colorVar = Math.floor(Math.random() * 30 - 15);
        const baseGrey = 139 + colorVar;
        ctx.fillStyle = `rgb(${baseGrey + 10}, ${baseGrey}, ${baseGrey - 10})`;
        ctx.fillRect(x, y, tileSize, tileSize);

        // Grout lines
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, tileSize, tileSize);

        // Surface weathering
        for (let i = 0; i < 100; i++) {
          const wx = x + Math.random() * tileSize;
          const wy = y + Math.random() * tileSize;
          const brightness = 100 + Math.random() * 80;
          ctx.fillStyle = `rgba(${brightness}, ${brightness - 10}, ${brightness - 20}, ${Math.random() * 0.3})`;
          ctx.fillRect(wx, wy, Math.random() * 2 + 1, Math.random() * 2 + 1);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 20);
    texture.anisotropy = 4;
    texture.needsUpdate = true; // CRITICAL: Force texture upload to GPU

    this.textures.diffuse = texture;

    if (this.groundMesh && this.groundMesh.material) {
      this.groundMesh.material.map = texture;
      this.groundMesh.material.color.setHex(0xffffff);
      this.groundMesh.material.needsUpdate = true;
    }

    console.log('[Engine2] ✓ Procedural stone texture applied with needsUpdate=true');
  }

  /**
   * Generate a procedural normal map for surface depth and detail
   * This adds realistic lighting to the ground even with simple textures
   */
  _generateProceduralNormalMap() {
    console.log('[Engine2] Generating procedural normal map for enhanced depth...');

    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base flat normal (pointing up)
    ctx.fillStyle = 'rgb(128, 128, 255)'; // Normal pointing straight up
    ctx.fillRect(0, 0, size, size);

    // Add height variation for stone blocks
    const tileSize = 128;
    const tilesX = Math.ceil(size / tileSize);
    const tilesY = Math.ceil(size / tileSize);

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x = tx * tileSize;
        const y = ty * tileSize;

        // Slight height variation per tile
        const heightVar = Math.random() * 20 - 10;

        // Edge normals for depth between tiles
        ctx.strokeStyle = `rgb(${128 + heightVar}, ${128 - heightVar}, ${240 + heightVar})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, tileSize, tileSize);

        // Add some surface bumps within tiles
        for (let i = 0; i < 5; i++) {
          const bx = x + Math.random() * tileSize;
          const by = y + Math.random() * tileSize;
          const bRadius = 10 + Math.random() * 20;

          const bumpGradient = ctx.createRadialGradient(bx, by, 0, bx, by, bRadius);
          const normalVariation = Math.random() * 30 - 15;
          bumpGradient.addColorStop(0, `rgb(${128 + normalVariation}, ${128 + normalVariation}, ${255})`);
          bumpGradient.addColorStop(1, 'rgb(128, 128, 255)');

          ctx.fillStyle = bumpGradient;
          ctx.fillRect(bx - bRadius, by - bRadius, bRadius * 2, bRadius * 2);
        }
      }
    }

    // Create normal map texture
    const normalTexture = new THREE.CanvasTexture(canvas);
    normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping;
    normalTexture.repeat.set(40, 40);
    normalTexture.anisotropy = 16;

    this.textures.normal = normalTexture;
    console.log('[Engine2] ✓ Normal map generated for enhanced lighting');
  }

  /**
   * Create the arena with ground plane and center hole
   */
  _createArena() {
    if (!this.scene) return;

    // Create the shape for the ground (200x200 unit square)
    const groundSize = 200;
    const shape = new THREE.Shape();

    // Define outer square boundary
    const halfSize = groundSize / 2;
    shape.moveTo(-halfSize, -halfSize);
    shape.lineTo(halfSize, -halfSize);
    shape.lineTo(halfSize, halfSize);
    shape.lineTo(-halfSize, halfSize);
    shape.lineTo(-halfSize, -halfSize);

    // Create circular hole in the center (radius ~3)
    const holeRadius = 3;
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, holeRadius, 0, Math.PI * 2, false);
    shape.holes.push(holePath);

    // Create geometry from shape
    const groundGeometry = new THREE.ShapeGeometry(shape, 24); // 24 segments for smooth hole

    // ShapeGeometry UVs are raw shape coordinates (-100 to 100 for a 200-unit shape).
    // Normalize them to 0-1 so texture repeat values work correctly (like PlaneGeometry).
    const uvAttr = groundGeometry.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(
        i,
        (uvAttr.getX(i) + halfSize) / groundSize,
        (uvAttr.getY(i) + halfSize) / groundSize
      );
    }
    uvAttr.needsUpdate = true;

    // Create material — use MeshLambertMaterial for much better mobile performance
    const materialOptions = {
      color: 0xFFFFFF, // White base - allows texture colors to show naturally
      flatShading: false,
    };

    // Apply color/albedo texture
    if (this.textures.diffuse) {
      materialOptions.map = this.textures.diffuse;
      console.log('[Engine2] ✓ APPLYING TEXTURE TO MATERIAL');
    } else {
      // Fallback: warm stone color
      materialOptions.color = 0x6B5A4A;
      console.log('[Engine2] ⚠ WARNING: Using fallback stone color (no texture loaded)');
    }

    const groundMaterial = new THREE.MeshLambertMaterial(materialOptions);

    // Enable shadow receiving for atmospheric lighting
    groundMaterial.shadowSide = THREE.FrontSide;

    // Create the mesh
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);

    // Rotate to be horizontal (XZ plane)
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(0, 0, 0);
    this.groundMesh.receiveShadow = true;

    // Add to scene
    this.scene.add(this.groundMesh);

    console.log('[Engine2] Created 200x200 ground with center hole (radius 3)');
    // Terrain displacement is applied separately after arena creation

    // Add rim around the hole for visual clarity
    this._createHoleRim(holeRadius);
  }

  /**
   * Create an enhanced rim/edge around the spawn hole
   * Creates a dramatic stone ledge with depth and weathering
   */
  _createHoleRim(radius) {
    if (!this.scene) return;

    // Main rim - weathered stone edge
    const rimGeometry = new THREE.TorusGeometry(radius, 0.2, 24, 96);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A3C2E, // Dark weathered stone
      roughness: 0.9,
      metalness: 0.1,
      emissive: 0x1a1410, // Subtle warm glow
      emissiveIntensity: 0.05
    });

    this.rimMesh = new THREE.Mesh(rimGeometry, rimMaterial);
    this.rimMesh.rotation.x = -Math.PI / 2;
    this.rimMesh.position.set(0, 0.08, 0); // Slightly raised
    this.rimMesh.castShadow = true;
    this.rimMesh.receiveShadow = true;
    this.scene.add(this.rimMesh);

    // Inner dark ring - creates depth illusion
    const innerRingGeometry = new THREE.TorusGeometry(radius - 0.15, 0.12, 16, 64);
    const innerRingMaterial = new THREE.MeshStandardMaterial({
      color: 0x2A1F1A,
      roughness: 0.95,
      metalness: 0.05,
      emissive: 0x0a0505,
      emissiveIntensity: 0.1
    });

    const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.set(0, 0.04, 0);
    innerRing.receiveShadow = true;
    this.scene.add(innerRing);

    // Store for cleanup
    if (!this.rimMeshes) this.rimMeshes = [];
    this.rimMeshes.push(innerRing);

    console.log('[Engine2] ✓ Created enhanced hole rim with depth detail');
  }

  /**
   * Create world landmarks (UFO, Obelisk, Lake) for Sandbox 2.0
   * These are the key landmarks from the old map, ported to Engine 2.0
   */
  _createLandmarks() {
    if (!this.scene) return;

    console.log('[Engine2] Creating world landmarks...');

    // Store references for animation
    if (!window._engine2Landmarks) window._engine2Landmarks = {};

    // ══════════════════════════════════════════════════════════════
    // 1. UFO CRASH SITE — Northwest area (-50, 25)
    // ══════════════════════════════════════════════════════════════
    const shipGroup = new THREE.Group();
    shipGroup.position.set(-50, 0, 25);
    shipGroup.rotation.y = 0.8;

    // Disc body (saucer shape)
    const discGeo = new THREE.SphereGeometry(8, 16, 8);
    const discMat = new THREE.MeshPhysicalMaterial({
      color: 0x778899, metalness: 0.8, roughness: 0.3,
      emissive: 0x002244, emissiveIntensity: 0.2
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.scale.set(1, 0.3, 1); // Flatten into disc
    disc.position.y = 1.5;
    disc.castShadow = true;
    shipGroup.add(disc);

    // Dome on top
    const domeGeo = new THREE.SphereGeometry(3.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshPhysicalMaterial({
      color: 0x88CCFF, transparent: true, opacity: 0.6,
      metalness: 0.1, roughness: 0.1
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 2.4;
    dome.castShadow = true;
    shipGroup.add(dome);

    // Damage / cracked section
    const damagedGeo = new THREE.BoxGeometry(4, 0.8, 3);
    const damagedMat = new THREE.MeshToonMaterial({ color: 0x445566 });
    const damaged = new THREE.Mesh(damagedGeo, damagedMat);
    damaged.position.set(6, 1.2, 2);
    damaged.rotation.z = 0.3;
    damaged.castShadow = true;
    shipGroup.add(damaged);

    // Glowing engine lights around disc edge
    const engineColors = [0x00FFCC, 0x00FF88, 0x44FFAA];
    const engineLights = [];
    const enginePointLights = [];

    for (let e = 0; e < 6; e++) {
      const eAngle = (e / 6) * Math.PI * 2;

      // Engine light mesh
      const engineLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: engineColors[e % 3] })
      );
      engineLight.position.set(Math.cos(eAngle) * 7.5, 1.5, Math.sin(eAngle) * 7.5);
      engineLight.userData = { isEngineLight: true, phase: (e / 6) * Math.PI * 2 };
      shipGroup.add(engineLight);
      engineLights.push(engineLight);

      // Point light for real glow
      const enginePointLight = new THREE.PointLight(engineColors[e % 3], 2.5, 12);
      enginePointLight.position.set(Math.cos(eAngle) * 7.5, 1.5, Math.sin(eAngle) * 7.5);
      enginePointLight.userData = { isEngineLight: true, phase: (e / 6) * Math.PI * 2 };
      shipGroup.add(enginePointLight);
      enginePointLights.push(enginePointLight);
    }

    // Tilt the ship (crashed angle)
    shipGroup.rotation.x = 0.25;
    shipGroup.rotation.z = -0.15;

    // Crash crater under ship
    const crashGeo = new THREE.RingGeometry(6, 10, 16);
    const crashMat = new THREE.MeshBasicMaterial({ color: 0x4A3728, transparent: true, opacity: 0.7 });
    const crashCrater = new THREE.Mesh(crashGeo, crashMat);
    crashCrater.rotation.x = -Math.PI / 2;
    crashCrater.position.set(-50, 0.01, 25);
    this.scene.add(crashCrater);
    this.scene.add(shipGroup);

    // Companion Egg near UFO (quest objective)
    const eggGroup = new THREE.Group();
    eggGroup.position.set(-32, 0, 25);
    const eggGeo = new THREE.SphereGeometry(0.7, 12, 10);
    eggGeo.scale(1, 1.3, 1);
    const eggMat = new THREE.MeshPhysicalMaterial({
      color: 0x00FFB4, emissive: 0x00CC88, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.9, metalness: 0.2, roughness: 0.3
    });
    const eggMesh = new THREE.Mesh(eggGeo, eggMat);
    eggMesh.position.y = 0.9;
    eggMesh.castShadow = true;
    eggGroup.add(eggMesh);

    const eggLight = new THREE.PointLight(0x00FFB4, 3, 8);
    eggLight.position.y = 1;
    eggGroup.add(eggLight);
    eggGroup.userData = { isCompanionEgg: true, pickupRadius: 4 };
    this.scene.add(eggGroup);
    window.companionEggObject = eggGroup;

    // Store UFO references for animation
    window._engine2Landmarks.ufo = {
      group: shipGroup,
      engineLights: engineLights,
      enginePointLights: enginePointLights
    };

    console.log('[Engine2] ✓ UFO crash site created at (-50, 25)');

    // ══════════════════════════════════════════════════════════════
    // 2. ANNUNAKI OBELISK — Southwest region (25, -35)
    // BLACK OBELISK WITH GOLD EYE OF HORUS (55% smaller)
    // ══════════════════════════════════════════════════════════════
    const obeliskGroup = new THREE.Group();
    obeliskGroup.position.set(25, 0, -35);

    // Main obelisk shaft - tapered monolith (55% smaller: 18 * 0.45 = 8.1m)
    const obeliskHeight = 8.1;
    const obeliskBaseSize = 1.125; // 2.5 * 0.45
    const obeliskTopSize = 0.81; // 1.8 * 0.45

    const obeliskGeometry = new THREE.CylinderGeometry(obeliskTopSize, obeliskBaseSize, obeliskHeight, 4);
    const obeliskMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, // Deep black
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x0a0a0a,
      emissiveIntensity: 0.1
    });
    const obeliskShaft = new THREE.Mesh(obeliskGeometry, obeliskMaterial);
    obeliskShaft.position.y = obeliskHeight / 2;
    obeliskShaft.castShadow = true;
    obeliskShaft.receiveShadow = true;
    obeliskGroup.add(obeliskShaft);

    // Pyramidion cap (pointed top) - Gold
    const capGeometry = new THREE.ConeGeometry(obeliskTopSize + 0.135, 1.35, 4); // 3 * 0.45
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFD700, // Bright gold
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xFFD700,
      emissiveIntensity: 0.5
    });
    const pyramidionCap = new THREE.Mesh(capGeometry, capMaterial);
    pyramidionCap.position.y = obeliskHeight + 0.675; // 1.5 * 0.45
    pyramidionCap.castShadow = true;
    obeliskGroup.add(pyramidionCap);

    // Base platform - stepped stone pedestal (scaled down)
    const baseLevels = 3;
    const baseColors = [0xB8956A, 0xA8856A, 0x98754A];
    for (let i = 0; i < baseLevels; i++) {
      const levelSize = (5 - i * 0.8) * 0.45; // Scaled down
      const levelHeight = 0.27; // 0.6 * 0.45
      const baseGeo = new THREE.BoxGeometry(levelSize, levelHeight, levelSize);
      const baseMat = new THREE.MeshStandardMaterial({
        color: baseColors[i],
        roughness: 0.95,
        metalness: 0.0
      });
      const baseLevel = new THREE.Mesh(baseGeo, baseMat);
      baseLevel.position.y = i * levelHeight + levelHeight / 2;
      baseLevel.castShadow = true;
      baseLevel.receiveShadow = true;
      obeliskGroup.add(baseLevel);
    }

    // ═══════════════════════════════════════════════════════════════
    // EYE OF HORUS - Golden symbol on the black obelisk
    // ═══════════════════════════════════════════════════════════════
    const createEyeOfHorus = (scale = 1) => {
      const eyeGroup = new THREE.Group();
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xFFD700,
        metalness: 0.9,
        roughness: 0.1,
        emissive: 0xFFD700,
        emissiveIntensity: 0.8
      });

      // Eye outline (almond shape)
      const eyeOuterShape = new THREE.Shape();
      eyeOuterShape.moveTo(-0.5 * scale, 0);
      eyeOuterShape.bezierCurveTo(-0.5 * scale, 0.25 * scale, -0.25 * scale, 0.35 * scale, 0, 0.35 * scale);
      eyeOuterShape.bezierCurveTo(0.25 * scale, 0.35 * scale, 0.5 * scale, 0.25 * scale, 0.5 * scale, 0);
      eyeOuterShape.bezierCurveTo(0.5 * scale, -0.25 * scale, 0.25 * scale, -0.35 * scale, 0, -0.35 * scale);
      eyeOuterShape.bezierCurveTo(-0.25 * scale, -0.35 * scale, -0.5 * scale, -0.25 * scale, -0.5 * scale, 0);

      const eyeOuterGeo = new THREE.ShapeGeometry(eyeOuterShape);
      const eyeOuter = new THREE.Mesh(eyeOuterGeo, goldMat);
      eyeGroup.add(eyeOuter);

      // Pupil (circle)
      const pupilGeo = new THREE.CircleGeometry(0.15 * scale, 16);
      const pupil = new THREE.Mesh(pupilGeo, goldMat);
      pupil.position.set(0.05 * scale, 0, 0.01);
      eyeGroup.add(pupil);

      // Eye markings (lower curve)
      const lowerMarkShape = new THREE.Shape();
      lowerMarkShape.moveTo(0.5 * scale, 0);
      lowerMarkShape.bezierCurveTo(0.5 * scale, -0.5 * scale, 0.3 * scale, -0.6 * scale, 0, -0.6 * scale);
      const lowerMarkGeo = new THREE.ShapeGeometry(lowerMarkShape);
      const lowerMark = new THREE.Mesh(lowerMarkGeo, goldMat);
      lowerMark.position.set(0, 0, 0.01);
      eyeGroup.add(lowerMark);

      // Spiral tail (right side)
      const spiralCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0.5 * scale, -0.1 * scale, 0),
        new THREE.Vector3(0.7 * scale, -0.3 * scale, 0),
        new THREE.Vector3(0.6 * scale, -0.5 * scale, 0)
      );
      const spiralGeo = new THREE.TubeGeometry(spiralCurve, 8, 0.03 * scale, 6, false);
      const spiral = new THREE.Mesh(spiralGeo, goldMat);
      eyeGroup.add(spiral);

      return eyeGroup;
    };

    // Add Eye of Horus to each face of the obelisk at mid-height
    for (let face = 0; face < 4; face++) {
      const angle = (face / 4) * Math.PI * 2;
      const distance = obeliskBaseSize * 0.5;

      const eye = createEyeOfHorus(0.4);
      eye.position.set(
        Math.cos(angle) * distance,
        obeliskHeight / 2,
        Math.sin(angle) * distance
      );
      eye.rotation.y = angle + Math.PI / 2;
      obeliskGroup.add(eye);
    }

    // Energy crystal at top (scaled down)
    const crystalGeo = new THREE.OctahedronGeometry(0.36, 0); // 0.8 * 0.45
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x00FFFF,
      metalness: 0.1,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
      emissive: 0x00FFFF,
      emissiveIntensity: 1.2
    });
    const energyCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    energyCrystal.position.y = obeliskHeight + 1.44; // (3.2 * 0.45)
    energyCrystal.userData = { isObeliskCrystal: true, phase: 0 };
    obeliskGroup.add(energyCrystal);

    // Energy field rings (scaled down)
    const energyRings = [];
    for (let ring = 0; ring < 3; ring++) {
      const ringGeo = new THREE.TorusGeometry((3 + ring * 1.5) * 0.45, 0.0675, 8, 24); // Scaled
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00FFFF,
        transparent: true,
        opacity: 0.3 - ring * 0.08
      });
      const energyRing = new THREE.Mesh(ringGeo, ringMat);
      energyRing.position.y = (obeliskHeight / 2 + ring * 2) * 0.45;
      energyRing.rotation.x = Math.PI / 2;
      energyRing.userData = { isEnergyRing: true, phase: ring * (Math.PI * 2 / 3), speed: 0.5 + ring * 0.2 };
      obeliskGroup.add(energyRing);
      energyRings.push(energyRing);
    }

    // Mystical lights (adjusted for smaller size)
    const obeliskTopLight = new THREE.PointLight(0x00FFFF, 3, 13.5); // 30 * 0.45
    obeliskTopLight.position.y = obeliskHeight + 1.35; // 3 * 0.45
    obeliskGroup.add(obeliskTopLight);

    const obeliskBaseLight = new THREE.PointLight(0xFFD700, 1.5, 6.75); // 15 * 0.45
    obeliskBaseLight.position.y = 0.9; // 2 * 0.45
    obeliskGroup.add(obeliskBaseLight);

    // Power conduit pylons (scaled down)
    const pylonCrystals = [];
    for (let pylon = 0; pylon < 4; pylon++) {
      const pylonAngle = (pylon / 4) * Math.PI * 2;
      const pylonDist = 3.15; // 7 * 0.45

      const pylonGeo = new THREE.CylinderGeometry(0.135, 0.18, 1.8, 6); // All scaled by 0.45
      const pylonMat = new THREE.MeshStandardMaterial({
        color: 0xB8956A,
        roughness: 0.8,
        metalness: 0.2,
        emissive: 0x00AAAA,
        emissiveIntensity: 0.2
      });
      const pylonMesh = new THREE.Mesh(pylonGeo, pylonMat);
      pylonMesh.position.set(
        Math.cos(pylonAngle) * pylonDist,
        0.9, // 2 * 0.45
        Math.sin(pylonAngle) * pylonDist
      );
      pylonMesh.castShadow = true;
      obeliskGroup.add(pylonMesh);

      // Crystal tops on pylons (scaled down)
      const pylonCrystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18, 0), // 0.4 * 0.45
        new THREE.MeshBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.7 })
      );
      pylonCrystal.position.set(
        Math.cos(pylonAngle) * pylonDist,
        1.89, // 4.2 * 0.45
        Math.sin(pylonAngle) * pylonDist
      );
      pylonCrystal.userData = { isPylonCrystal: true, phase: pylon * Math.PI / 2 };
      obeliskGroup.add(pylonCrystal);
      pylonCrystals.push(pylonCrystal);
    }

    this.scene.add(obeliskGroup);

    // Obelisk ground marker (scaled down)
    const obeliskCircleGeo = new THREE.RingGeometry(3.6, 4.05, 32); // 8 * 0.45, 9 * 0.45
    const obeliskCircleMat = new THREE.MeshStandardMaterial({
      color: 0xB8956A,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const obeliskCircle = new THREE.Mesh(obeliskCircleGeo, obeliskCircleMat);
    obeliskCircle.rotation.x = -Math.PI / 2;
    obeliskCircle.position.set(25, 0.01, -35);
    obeliskCircle.receiveShadow = true;
    this.scene.add(obeliskCircle);

    // Ancient runes (scaled down)
    for (let rune = 0; rune < 8; rune++) {
      const runeAngle = (rune / 8) * Math.PI * 2;
      const runeGeo = new THREE.BoxGeometry(0.27, 0.045, 0.18); // Scaled by 0.45
      const runeMat = new THREE.MeshBasicMaterial({ color: 0x2C1810 });
      const runeBlock = new THREE.Mesh(runeGeo, runeMat);
      runeBlock.position.set(
        25 + Math.cos(runeAngle) * 3.825, // 8.5 * 0.45
        0.02,
        -35 + Math.sin(runeAngle) * 3.825
      );
      runeBlock.rotation.y = runeAngle + Math.PI / 2;
      this.scene.add(runeBlock);
    }

    // Store obelisk references for animation
    window._engine2Landmarks.obelisk = {
      group: obeliskGroup,
      crystal: energyCrystal,
      topLight: obeliskTopLight,
      baseLight: obeliskBaseLight,
      rings: energyRings,
      pylonCrystals: pylonCrystals
    };

    console.log('[Engine2] ✓ Black Obelisk with gold Eye of Horus created at (25, -35) - 55% smaller');

    // ══════════════════════════════════════════════════════════════
    // 3. LAKE (NO WATERFALL) — Southeast area (30, -30)
    // ══════════════════════════════════════════════════════════════

    // Reflective lake
    const enhancedLakeGeo = new THREE.CircleGeometry(8, 48);
    const enhancedLakeMat = new THREE.MeshPhysicalMaterial({
      color: 0x4ECDC4,
      metalness: 0.5,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
      reflectivity: 0.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const enhancedLake = new THREE.Mesh(enhancedLakeGeo, enhancedLakeMat);
    enhancedLake.rotation.x = -Math.PI / 2;
    enhancedLake.position.set(30, 0.03, -30);
    enhancedLake.receiveShadow = true;
    this.scene.add(enhancedLake);

    // Sandy shore ring
    const shoreGeo = new THREE.RingGeometry(7.5, 10, 48);
    const shoreMat = new THREE.MeshStandardMaterial({
      color: 0xC2B280,
      roughness: 0.9,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const shore = new THREE.Mesh(shoreGeo, shoreMat);
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(30, 0.02, -30);
    shore.receiveShadow = true;
    this.scene.add(shore);

    // Sun sparkles on lake
    const sparkles = [];
    for (let i = 0; i < 10; i++) {
      const sparkleGeo = new THREE.CircleGeometry(0.3, 6);
      const sparkleMat = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.8
      });
      const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 7;
      sparkle.position.set(
        30 + Math.cos(angle) * dist,
        0.02,
        -30 + Math.sin(angle) * dist
      );
      sparkle.rotation.x = -Math.PI / 2;
      sparkle.userData = {
        isSparkle: true,
        phase: Math.random() * Math.PI * 2,
        speed: 1 + Math.random() * 2
      };
      this.scene.add(sparkle);
      sparkles.push(sparkle);
    }

    // Store lake references for animation (no waterfall)
    window._engine2Landmarks.lake = {
      sparkles: sparkles
    };

    console.log('[Engine2] ✓ Lake created at (30, -30) - waterfall removed');

    // ===== LANDMARK 4: ANCIENT PYRAMID =====
    if (typeof AncientPyramid !== 'undefined') {
      this._pyramid = new AncientPyramid(this.scene);
      // Register in centralized landmark registry so sandbox-loop can animate it
      if (window._engine2Landmarks) {
        window._engine2Landmarks.pyramid = this._pyramid;
      }
    }
    // Ground details: tall grass, fallen logs, rock clusters, scatter debris
    if (typeof GroundDetails !== 'undefined') {
      this._groundDetails = new GroundDetails(this.scene);
    }
    // ══════════════════════════════════════════════════════════════
    // 4. ANNUNAKI TABLET — Southwest area (-35, 15)
    // ══════════════════════════════════════════════════════════════
    if (typeof AnnunakiTablet !== 'undefined') {
      try {
        this._annunakiTablet = new AnnunakiTablet(this.scene);
        console.log('[Engine2] ✓ Annunaki Tablet initialized at (-35, 0, 15)');
      } catch (e) {
        console.error('[Engine2] Failed to initialize Annunaki Tablet:', e);
      }
    } else {
      console.warn('[Engine2] AnnunakiTablet class not loaded - tablet will not appear');
    }
    // World Trees landmark system
    if (typeof WorldTrees !== 'undefined') {
      this._worldTrees = new WorldTrees(this.scene);
      console.log('[Engine2] ✓ WorldTrees initialised');
    }

    console.log('[Engine2] ✓ All landmarks created successfully');

    // Bonus landmarks (Ritual Fire Circle, Alien Crash Debris, Ancient Stone Well)
    if (typeof BonusLandmarks !== 'undefined') {
      this._bonusLandmarks = new BonusLandmarks(this.scene);
    }
  }

  /**
   * Apply terrain height variation as a second mesh overlay on top of the flat ground.
   * Uses a sine-combination pseudo-noise for gentle rolling hills.
   */
  _applyTerrainDisplacement() {
    if (!this.scene) return;

    // Inline pseudo-noise: sine-combination based, no external libraries
    function noise2D(x, z) {
      return Math.sin(x * 0.03 + z * 0.02) * Math.cos(z * 0.04 - x * 0.01)
           + Math.sin(x * 0.07 - z * 0.05) * 0.5
           + Math.sin(x * 0.15 + z * 0.12) * 0.25;
    }

    // Build terrain shape matching the arena footprint with a center hole so the
    // spawn shaft stays visible through the mesh (not occluded by a solid overlay).
    const halfSize = 100;
    const groundSize = 200;
    const holeRadius = 4; // match the flat-zone boundary requested by the spec

    const terrainShape = new THREE.Shape();
    terrainShape.moveTo(-halfSize, -halfSize);
    terrainShape.lineTo( halfSize, -halfSize);
    terrainShape.lineTo( halfSize,  halfSize);
    terrainShape.lineTo(-halfSize,  halfSize);
    terrainShape.lineTo(-halfSize, -halfSize);

    const holePath = new THREE.Path();
    holePath.absarc(0, 0, holeRadius, 0, Math.PI * 2, false);
    terrainShape.holes.push(holePath);

    // 128 curve-segments gives ~128 vertices around the hole for smooth blending
    const terrainGeo = new THREE.ShapeGeometry(terrainShape, 128);

    // Normalize UVs from raw shape coords to 0-1 (same as _createArena ground)
    const uvAttr = terrainGeo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(
        i,
        (uvAttr.getX(i) + halfSize) / groundSize,
        (uvAttr.getY(i) + halfSize) / groundSize
      );
    }
    uvAttr.needsUpdate = true;

    // Displace vertices — ShapeGeometry is in the XY plane; setting Z moves
    // vertices "up" in local space, which becomes world-Y after -PI/2 X rotation.
    const posAttr = terrainGeo.attributes.position;
    // Drastically reduced max height so players/enemies don't visibly clip
    // through the terrain (game movement only tracks X/Z, not Y).
    const maxHeight = 0.6;

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i); // world X (unchanged by rotation)
      const y = posAttr.getY(i); // shape Y → -world Z after rotation

      // Distance in world XZ — sqrt(x²+y²) is invariant under the Y→-Z flip
      const distFromCenter = Math.sqrt(x * x + y * y);

      // Smooth falloff from hole edge (r=4) outward to r=8 for clean transition
      let centerFalloff = 1.0;
      const flatZoneOuter = 8;
      if (distFromCenter < flatZoneOuter) {
        const span = flatZoneOuter - holeRadius;
        centerFalloff = span > 0 ? (distFromCenter - holeRadius) / span : 0;
        if (centerFalloff < 0) centerFalloff = 0;
      }

      // Flatten within 10 units of outer edge for clean boundary
      const edgeDist = Math.min(halfSize - Math.abs(x), halfSize - Math.abs(y));
      const edgeFalloff = edgeDist < 10 ? Math.max(0, edgeDist / 10.0) : 1.0;

      const height = noise2D(x, y) * maxHeight * centerFalloff * edgeFalloff;
      posAttr.setZ(i, height);
    }

    terrainGeo.computeVertexNormals();

    // Build material — use same diffuse texture as ground if available
    let terrainMat;
    if (this.textures.diffuse) {
      terrainMat = new THREE.MeshStandardMaterial({
        map: this.textures.diffuse,
        color: 0xFFFFFF,
        roughness: 0.75,
        metalness: 0.08,
        transparent: true,
        opacity: 0.95
      });
    } else {
      terrainMat = new THREE.MeshStandardMaterial({
        color: 0x6B5A4A,
        roughness: 0.75,
        metalness: 0.08,
        transparent: true,
        opacity: 0.95
      });
    }

    this.terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    this.terrainMesh.rotation.x = -Math.PI / 2;
    this.terrainMesh.position.set(0, 0.05, 0);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    console.log('[Engine2] ✓ Terrain displacement overlay added (gentle rolling hills, hole preserved)');
  }

  /**
   * Cleanup method - disposes all arena resources
   */
  dispose() {
    if (this.groundMesh && this.scene) {
      this.scene.remove(this.groundMesh);
      this.groundMesh.geometry.dispose();
      this.groundMesh.material.dispose();
    }
    this.groundMesh = null;

    if (this.rimMesh && this.scene) {
      this.scene.remove(this.rimMesh);
      this.rimMesh.geometry.dispose();
      this.rimMesh.material.dispose();
    }
    this.rimMesh = null;

    // Clean up additional rim meshes
    if (this.rimMeshes && this.scene) {
      this.rimMeshes.forEach(mesh => {
        this.scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      });
      this.rimMeshes = [];
    }

    // Dispose textures
    if (this.textures.diffuse) this.textures.diffuse.dispose();
    if (this.textures.normal) this.textures.normal.dispose();
    if (this.textures.roughness) this.textures.roughness.dispose();

    // Clean up terrain displacement mesh
    if (this.terrainMesh && this.scene) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.material.dispose();
    }
    this.terrainMesh = null;

    this.loaded = false;
    console.log('[Engine2] ✓ Cleaned up Engine 2.0 arena and all resources');
  }
}

// Expose globally for non-module consumers
window.Engine2Sandbox = Engine2Sandbox;
