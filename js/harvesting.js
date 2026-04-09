// ============================================================
// HARVESTING & RESOURCE SYSTEM
// Exposes window.GameHarvesting for use by main.js
// ============================================================
(function () {
  'use strict';

  // ── Resource catalogue ──────────────────────────────────────
  const RESOURCE_TYPES = {
    wood:         { label: 'Wood',         icon: '🪵', color: '#8B4513', category: 'material' },
    stone:        { label: 'Stone',        icon: '🪨', color: '#888888', category: 'material' },
    coal:         { label: 'Coal',         icon: '🖤', color: '#222222', category: 'material', hidden: true },
    iron:         { label: 'Iron',         icon: '⚙️', color: '#AAAAAA', category: 'material', hidden: true },
    metal:        { label: 'Metal',        icon: '🔩', color: '#778899', category: 'material', hidden: true },
    crystal:      { label: 'Crystal',      icon: '💎', color: '#88CCFF', category: 'material', hidden: true },
    magicEssence: { label: 'Magic Essence',icon: '✨', color: '#AA44FF', category: 'material', hidden: true },
    gem:          { label: 'Gem',          icon: '💍', color: '#FFD700', category: 'material', hidden: true },
    flesh:        { label: 'Flesh',        icon: '🥩', color: '#CC2200', category: 'food', hidden: true },
    meat:         { label: 'Meat',         icon: '🍖', color: '#CC4400', category: 'food', hidden: true },
    food:         { label: 'Food',         icon: '🍲', color: '#FF8C00', category: 'food', hidden: true },
    animalSkin:   { label: 'Animal Skin',  icon: '🐾', color: '#D2B48C', category: 'animal', hidden: true },
    fur:          { label: 'Fur',          icon: '🧶', color: '#8B6914', category: 'animal', hidden: true },
    leather:      { label: 'Leather',      icon: '🟫', color: '#654321', category: 'animal', hidden: true },
    feather:      { label: 'Feather',      icon: '🪶', color: '#DDDDDD', category: 'animal', hidden: true },
    chitin:       { label: 'Chitin',       icon: '🛡️', color: '#556B2F', category: 'animal', hidden: true },
    venom:        { label: 'Venom',        icon: '☠️', color: '#7CFC00', category: 'animal', hidden: true },
    berry:        { label: 'Berry',        icon: '🫐', color: '#4B0082', category: 'food', hidden: true },
    flower:       { label: 'Flower',       icon: '🌸', color: '#FF69B4', category: 'food', hidden: true },
    vegetable:    { label: 'Vegetable',    icon: '🥕', color: '#FF8C00', category: 'food', hidden: true }
  };

  // ── Harvesting tool definitions ─────────────────────────────
  const TOOL_DEFS = {
    axe: {
      id: 'axe', name: 'Axe', icon: '🪓',
      targets: ['tree'],            // node types this tool works on
      yields: 'wood',
      amountMin: 2, amountMax: 5,
      buyCost: 1,                   // gold cost in the Store — 1 Gold each so player is never softlocked
      epicBuyCost: 800,
      epicForgeReq: { wood: 20 },
      swingDurationMs: 600
    },
    sledgehammer: {
      id: 'sledgehammer', name: 'Sledgehammer', icon: '🔨',
      targets: ['rock'],
      yields: 'stone',
      amountMin: 2, amountMax: 4,
      buyCost: 1,
      epicBuyCost: 1000,
      epicForgeReq: { stone: 20 },
      swingDurationMs: 800
    },
    pickaxe: {
      id: 'pickaxe', name: 'Pickaxe', icon: '⛏️',
      targets: ['coal', 'iron'],
      yields: null,                 // yield determined by node type
      amountMin: 1, amountMax: 3,
      buyCost: 1,
      epicBuyCost: 1200,
      epicForgeReq: { wood: 15, stone: 15 },
      swingDurationMs: 700
    },
    magicTool: {
      id: 'magicTool', name: 'Magic Pickaxe', icon: '🔮',
      targets: ['crystal', 'magic'],
      yields: null,                 // node determines actual yield
      amountMin: 1, amountMax: 2,
      buyCost: 1,
      epicBuyCost: 2000,
      epicForgeReq: { wood: 10, stone: 5 },
      swingDurationMs: 500
    },
    knife: {
      id: 'knife', name: 'Hunting Knife', icon: '🔪',
      targets: ['animal_carcass'],
      yields: null,
      amountMin: 1, amountMax: 3,
      buyCost: 1,
      epicBuyCost: 600,
      epicForgeReq: { wood: 8, stone: 3 },
      swingDurationMs: 400
    },
    berryScoop: {
      id: 'berryScoop', name: 'Foraging Scoop', icon: '🧺',
      targets: ['berryBush', 'flowerPatch', 'vegetablePatch'],
      yields: null,
      amountMin: 2, amountMax: 6,
      buyCost: 1,
      epicBuyCost: 400,
      epicForgeReq: { wood: 10 },
      swingDurationMs: 300
    },
    // ── Robotic Harvesting Backpack system ─────────────────────
    harvesterBackpack: {
      id: 'harvesterBackpack', name: 'Harvester Backpack', icon: '🎒',
      description: 'A.I.D.A\'s hands-free harvesting apparatus. Enables robotic arm attachments.',
      craftCost: { leather: 2, metal: 2 },
      isBackpack: true,
      swingDurationMs: 0
    },
    woodAxeArm: {
      id: 'woodAxeArm', name: 'Wood Axe Arm', icon: '🦾',
      description: 'Robotic axe arm. Stand near trees to auto-harvest wood.',
      targets: ['tree'],
      yields: 'wood',
      craftCost: { gold: 10, wood: 5, metal: 2 },
      isRoboticArm: true,
      swingDurationMs: 600,
      chopCount: 3,
      requiredBackpack: 'harvesterBackpack'
    },
    stonePickaxeArm: {
      id: 'stonePickaxeArm', name: 'Stone Pickaxe Arm', icon: '⚙️',
      description: 'Robotic pickaxe arm. Stand near rocks to auto-harvest stone.',
      targets: ['rock'],
      yields: 'stone',
      craftCost: { gold: 10, stone: 5, metal: 2 },
      isRoboticArm: true,
      swingDurationMs: 700,
      chopCount: 3,
      requiredBackpack: 'harvesterBackpack'
    }
  };

  // ── Gathering skill definitions ──────────────────────────────
  const GATHERING_SKILLS = {
    chopSpeed:    { label: 'Chopping Speed',    icon: '🪓', maxLevel: 10, description: 'Faster tree chopping' },
    mineSpeed:    { label: 'Mining Speed',      icon: '⛏️', maxLevel: 10, description: 'Faster stone/ore mining' },
    gatherSpeed:  { label: 'Gathering Speed',   icon: '🧺', maxLevel: 10, description: 'Faster berry/flower gathering' },
    yieldBonus:   { label: 'Resource Yield',    icon: '📦', maxLevel: 10, description: 'More resources per harvest' },
    critGather:   { label: 'Lucky Harvest',     icon: '🍀', maxLevel: 5,  description: 'Chance for double resources' },
    durability:   { label: 'Tool Durability',   icon: '🔧', maxLevel: 5,  description: 'Tools last longer', hidden: true } // TODO: not yet implemented
  };

  // ── Node visual descriptors (populated during init when THREE is available) ─
  const NODE_DEFS = {
    tree: {
      label: 'Tree',         color: 0x2D6A2D, radius: 1.0,
      hp: 60,                yield: 'wood',
      toolRequired: 'axe',   harvestAnim: 'chop'
    },
    rock: {
      label: 'Rock',         color: 0x808080, radius: 1.8,
      hp: 80,                yield: 'stone',
      toolRequired: 'sledgehammer', harvestAnim: 'smash'
    },
    coal: {
      label: 'Coal Vein',    color: 0x222222, radius: 1.6,
      hp: 60,                yield: 'coal',
      toolRequired: 'pickaxe', harvestAnim: 'mine'
    },
    iron: {
      label: 'Iron Deposit', color: 0xC0C0C0, radius: 1.7,
      hp: 100,               yield: 'iron',
      toolRequired: 'pickaxe', harvestAnim: 'mine'
    },
    crystal: {
      label: 'Crystal',      color: 0x66BBFF, radius: 1.4,
      hp: 40,                yield: 'crystal',
      toolRequired: 'magicTool', harvestAnim: 'channel'
    },
    magic: {
      label: 'Magic Node',   color: 0x8833FF, radius: 1.5,
      hp: 50,                yield: 'magicEssence',
      toolRequired: 'magicTool', harvestAnim: 'channel'
    },
    berryBush: {
      label: 'Berry Bush',   color: 0x4B0082, radius: 0.8,
      hp: 20,                yield: 'berry',
      toolRequired: 'berryScoop', harvestAnim: 'gather',
      autoHarvest: true
    },
    flowerPatch: {
      label: 'Flower Patch', color: 0xFF69B4, radius: 0.6,
      hp: 15,                yield: 'flower',
      toolRequired: 'berryScoop', harvestAnim: 'gather',
      autoHarvest: true
    },
    vegetablePatch: {
      label: 'Vegetable Patch', color: 0xFF8C00, radius: 0.7,
      hp: 25,                yield: 'vegetable',
      toolRequired: 'berryScoop', harvestAnim: 'gather',
      autoHarvest: true
    },
    metalOre: {
      label: 'Metal Ore',    color: 0x7B8999, radius: 1.6,
      hp: 120,               yield: 'metal',
      toolRequired: 'pickaxe', harvestAnim: 'mine'
    },
    animal_carcass: {
      label: 'Animal Carcass', color: 0xCC9966, radius: 0.9,
      hp: 30,                yield: 'animalSkin',  // primary yield; meat is secondary
      toolRequired: 'knife',  harvestAnim: 'skin'
    }
  };

  // ── Module state ─────────────────────────────────────────────
  let _scene = null;
  let _saveData = null;
  let _spawnParticlesFn = null;

  const harvestNodes = [];          // active resource nodes in the world
  const HARVEST_RANGE = 3.0;       // distance in world-units to trigger harvest
  const HARVEST_COOLDOWN_MS = 1500; // ms between harvest ticks per node
  const HARVEST_WINDUP_MS = 400;   // ms player must remain in range before harvesting begins
  const SWING_OVERLAY_HEIGHT_OFFSET = 2.2; // world-Y offset above ground to project overlay above player's head
  // Fraction of a node's visual radius used as its solid collision boundary.
  // 0.85 — close to visual radius so the player definitely can't walk through trees/rocks/coal.
  const NODE_COLLISION_RADIUS_SCALE = 0.85;

  // Active swing animation state
  let _swingAnim = null; // { toolId, endTime, nodeRef }

  // (Legacy variable kept for API compatibility — still-timer logic removed)
  let _lastPlayerPos = null;

  // Floating text pool (lightweight HTML elements)
  const _floatingTexts = [];

  // ── Internal helpers ─────────────────────────────────────────

  function _getResources() {
    if (!_saveData) return null;
    if (!_saveData.resources) {
      _saveData.resources = {
        wood: 0, stone: 0, coal: 0, iron: 0, metal: 0,
        crystal: 0, magicEssence: 0, gem: 0, flesh: 0, meat: 0, food: 0,
        animalSkin: 0, fur: 0, leather: 0, feather: 0, chitin: 0, venom: 0,
        berry: 0, flower: 0, vegetable: 0
      };
    }
    // Ensure new keys exist for old save files
    const r = _saveData.resources;
    if (r.metal    === undefined) r.metal    = 0;
    if (r.meat     === undefined) r.meat     = 0;
    if (r.food     === undefined) r.food     = 0;
    if (r.animalSkin === undefined) r.animalSkin = 0;
    return r;
  }

  function _getTools() {
    if (!_saveData) return null;
    if (!_saveData.harvestingTools) {
      _saveData.harvestingTools = {
        axe: false, sledgehammer: false, pickaxe: false, magicTool: false,
        epicAxe: false, epicSledgehammer: false, epicPickaxe: false, epicMagicTool: false
      };
    }
    return _saveData.harvestingTools;
  }

  function _hasTool(toolId) {
    const tools = _getTools();
    return tools && (tools[toolId] || tools['epic' + toolId.charAt(0).toUpperCase() + toolId.slice(1)]);
  }

  function _getGatheringSkills() {
    if (!_saveData) return null;
    if (!_saveData.gatheringSkills) {
      _saveData.gatheringSkills = {};
      for (const key of Object.keys(GATHERING_SKILLS)) {
        _saveData.gatheringSkills[key] = 0;
      }
    }
    return _saveData.gatheringSkills;
  }

  function upgradeGatheringSkill(skillKey) {
    const skills = _getGatheringSkills();
    if (!skills) return false;
    const def = GATHERING_SKILLS[skillKey];
    if (!def) return false;
    if ((skills[skillKey] || 0) >= def.maxLevel) return false;
    if (!_saveData || _saveData.gold < 50) return false;
    _saveData.gold -= 50;
    skills[skillKey] = (skills[skillKey] || 0) + 1;
    return true;
  }

  function _getToolForNode(nodeType) {
    const def = NODE_DEFS[nodeType];
    return def ? def.toolRequired : null;
  }

  // ── Build 3-D mesh for a resource node ──────────────────────
  function _buildNodeMesh(nodeType, pos) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const def = NODE_DEFS[nodeType];
    if (!def) return null;

    let mesh;
    if (nodeType === 'tree') {
      // Simple cartoon tree: trunk + canopy
      const group = new THREE.Group();
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.4, 7);
      const trunkMat = new THREE.MeshToonMaterial({ color: 0x5C3A1E });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.7;
      trunk.castShadow = true;
      group.add(trunk);
      // Canopy layers
      const canopyColors = [0x2D6A2D, 0x3A8A3A, 0x246824];
      const sizes = [[1.4, 1.1], [1.1, 0.9], [0.75, 0.7]];
      sizes.forEach(([r, h], i) => {
        const cGeo = new THREE.ConeGeometry(r, h + 0.3, 7);
        const cMat = new THREE.MeshToonMaterial({ color: canopyColors[i] });
        const canopy = new THREE.Mesh(cGeo, cMat);
        canopy.position.y = 1.4 + i * 0.65;
        canopy.castShadow = true;
        group.add(canopy);
      });
      mesh = group;
    } else if (nodeType === 'rock' || nodeType === 'iron') {
      // Irregular rock shape
      const geo = new THREE.DodecahedronGeometry(def.radius * 0.9, 0);
      const mat = new THREE.MeshToonMaterial({ color: def.color });
      mesh = new THREE.Mesh(geo, mat);
      mesh.scale.y = 0.65;
    } else if (nodeType === 'coal') {
      const geo = new THREE.DodecahedronGeometry(def.radius * 0.85, 0);
      const mat = new THREE.MeshToonMaterial({ color: def.color });
      mesh = new THREE.Mesh(geo, mat);
      mesh.scale.y = 0.55;
    } else if (nodeType === 'crystal') {
      // Tall crystal cluster
      const group = new THREE.Group();
      const mat = new THREE.MeshToonMaterial({ color: def.color, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 3; i++) {
        const h = 1.5 + Math.random() * 1.5;
        const r = 0.25 + Math.random() * 0.2;
        const geo = new THREE.ConeGeometry(r, h, 5);
        const spike = new THREE.Mesh(geo, mat.clone());
        spike.position.set(
          (Math.random() - 0.5) * 1.2,
          h / 2,
          (Math.random() - 0.5) * 1.2
        );
        spike.rotation.z = (Math.random() - 0.5) * 0.5;
        group.add(spike);
      }
      mesh = group;
    } else if (nodeType === 'magic') {
      // Floating orb with glow
      const geo = new THREE.SphereGeometry(def.radius * 0.7, 10, 10);
      const mat = new THREE.MeshToonMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.4 });
      mesh = new THREE.Mesh(geo, mat);
    } else if (nodeType === 'berryBush') {
      // Berry bush with visible berries — organic icosahedron body
      const group = new THREE.Group();
      const bushGeo = new THREE.IcosahedronGeometry(0.55, 1);
      const bushMat = new THREE.MeshToonMaterial({ color: 0x2E8B2E });
      const bush = new THREE.Mesh(bushGeo, bushMat);
      bush.position.y = 0.4;
      bush.scale.set(1.1, 0.8, 1.0);
      group.add(bush);
      // Berry clusters — 12 berries at varied heights
      for (let i = 0; i < 12; i++) {
        const berryGeo = new THREE.SphereGeometry(0.06, 5, 5);
        const berryMat = new THREE.MeshToonMaterial({ color: 0x4B0082 });
        const b = new THREE.Mesh(berryGeo, berryMat);
        const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
        const radius = 0.35 + Math.random() * 0.15;
        const heightVariance = (i % 3) * 0.12;
        b.position.set(Math.cos(angle) * radius, 0.25 + heightVariance + Math.random() * 0.2, Math.sin(angle) * radius);
        b.userData.isBerry = true;
        group.add(b);
      }
      // Small branch stubs poking out at random angles
      const branchCount = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < branchCount; i++) {
        const branchGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.2, 4);
        const branchMat = new THREE.MeshToonMaterial({ color: 0x5C3A1E });
        const branch = new THREE.Mesh(branchGeo, branchMat);
        const bAngle = (i / branchCount) * Math.PI * 2 + Math.random() * 0.5;
        branch.position.set(Math.cos(bAngle) * 0.45, 0.3 + Math.random() * 0.2, Math.sin(bAngle) * 0.45);
        branch.rotation.set((Math.random() - 0.5) * 1.2, bAngle, (Math.random() - 0.5) * 0.8);
        group.add(branch);
      }
      mesh = group;
    } else if (nodeType === 'flowerPatch') {
      // Flower patch with colorful petals
      const group = new THREE.Group();
      const flowerColors = [0xFF69B4, 0xFFD700, 0xFF6347, 0xDA70D6, 0x87CEEB];
      for (let i = 0; i < 5; i++) {
        const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4);
        const stemMat = new THREE.MeshToonMaterial({ color: 0x228B22 });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        const fx = (Math.random() - 0.5) * 0.8;
        const fz = (Math.random() - 0.5) * 0.8;
        stem.position.set(fx, 0.15, fz);
        group.add(stem);
        const petalGeo = new THREE.SphereGeometry(0.08, 5, 5);
        const petalMat = new THREE.MeshToonMaterial({ color: flowerColors[i % flowerColors.length] });
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.position.set(fx, 0.32, fz);
        group.add(petal);
      }
      mesh = group;
    } else if (nodeType === 'vegetablePatch') {
      // Vegetable patch with carrots/roots poking out
      const group = new THREE.Group();
      const soilGeo = new THREE.BoxGeometry(0.8, 0.1, 0.8);
      const soilMat = new THREE.MeshToonMaterial({ color: 0x3E2723 });
      const soil = new THREE.Mesh(soilGeo, soilMat);
      soil.position.y = 0.05;
      group.add(soil);
      for (let i = 0; i < 4; i++) {
        const leafGeo = new THREE.ConeGeometry(0.08, 0.2, 4);
        const leafMat = new THREE.MeshToonMaterial({ color: 0x228B22 });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set((i - 1.5) * 0.2, 0.2, (Math.random() - 0.5) * 0.3);
        group.add(leaf);
        const rootGeo = new THREE.ConeGeometry(0.04, 0.12, 4);
        const rootMat = new THREE.MeshToonMaterial({ color: 0xFF8C00 });
        const root = new THREE.Mesh(rootGeo, rootMat);
        root.position.set((i - 1.5) * 0.2, 0.12, (Math.random() - 0.5) * 0.3);
        root.rotation.x = Math.PI;
        group.add(root);
      }
      mesh = group;
    } else if (nodeType === 'metalOre') {
      // Metal ore: dark grey angular rock with metallic sheen
      const geo = new THREE.DodecahedronGeometry(def.radius * 0.88, 0);
      const mat = new THREE.MeshToonMaterial({ color: 0x7B8999 });
      mesh = new THREE.Mesh(geo, mat);
      mesh.scale.y = 0.6;
      mesh.rotation.y = Math.random() * Math.PI;
    } else if (nodeType === 'animal_carcass') {
      // Animal carcass: simple low-poly dead creature lying on its side
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshToonMaterial({ color: 0xCC9966 });
      const bodyGeo = new THREE.SphereGeometry(0.32, 7, 5);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.scale.set(1.4, 0.55, 0.9);
      body.position.y = 0.18;
      group.add(body);
      // Four limp legs
      const legMat = new THREE.MeshToonMaterial({ color: 0xAA8855 });
      for (let i = 0; i < 4; i++) {
        const legGeo = new THREE.CylinderGeometry(0.035, 0.025, 0.3, 4);
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set((i < 2 ? -0.22 : 0.22), 0.08, (i % 2 === 0 ? -0.14 : 0.14));
        leg.rotation.z = (Math.PI * 0.5) + (Math.random() - 0.5) * 0.6;
        group.add(leg);
      }
      mesh = group;
    }

    if (!mesh) return null;
    mesh.position.copy(pos);
    mesh.castShadow = true;
    _scene.add(mesh);
    return mesh;
  }

  // ── Spawn resource node ──────────────────────────────────────
  function _spawnNode(nodeType, x, z) {
    const THREE = window.THREE;
    if (!THREE || !_scene) return;
    const pos = new THREE.Vector3(x, 0, z);
    const mesh = _buildNodeMesh(nodeType, pos);
    if (!mesh) return;
    const def = NODE_DEFS[nodeType];
    harvestNodes.push({
      type: nodeType,
      mesh,
      hp: def.hp,
      maxHp: def.hp,
      depleted: false,
      _lastHarvestTime: 0,
      _wobbleTime: 0,
      _wobbleDir: { x: 1, z: 0 }
    });
  }

  // ── World population ─────────────────────────────────────────
  function populateWorld() {
    const rng = () => (Math.random() - 0.5) * 140;
    const avoid = (x, z) => Math.abs(x) < 18 && Math.abs(z) < 18; // near player start

    // Trees — 35 nodes scattered around
    for (let i = 0; i < 35; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('tree', x, z);
    }
    // Rocky outcrops — 40 nodes
    for (let i = 0; i < 40; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('rock', x, z);
    }
    // Coal veins — 25 nodes (clustered around mine area)
    for (let i = 0; i < 25; i++) {
      const x = -30 + (Math.random() - 0.5) * 50;
      const z = 18 + (Math.random() - 0.5) * 50;
      if (avoid(x, z)) continue;
      _spawnNode('coal', x, z);
    }
    // Iron deposits — 20 nodes
    for (let i = 0; i < 20; i++) {
      const x = 36 + (Math.random() - 0.5) * 40;
      const z = -36 + (Math.random() - 0.5) * 40;
      if (avoid(x, z)) continue;
      _spawnNode('iron', x, z);
    }
    // Crystal formations — 15 nodes
    for (let i = 0; i < 15; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('crystal', x, z);
    }
    // Magic structures — 8 nodes
    for (let i = 0; i < 8; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('magic', x, z);
    }
    // Berry bushes — 30 nodes (forest region, near center)
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() - 0.5) * 100;
      const z = (Math.random() - 0.5) * 100;
      if (avoid(x, z)) continue;
      _spawnNode('berryBush', x, z);
    }
    // Flower patches — 25 nodes (scattered everywhere — gatherable resource)
    for (let i = 0; i < 25; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('flowerPatch', x, z);
    }
    // Vegetable patches — 15 nodes (near camp area)
    for (let i = 0; i < 15; i++) {
      const x = (Math.random() - 0.5) * 65;
      const z = 12 + (Math.random() - 0.5) * 50;
      if (avoid(x, z)) continue;
      _spawnNode('vegetablePatch', x, z);
    }
    // Metal ore deposits — 18 nodes (scattered in a mid-zone, requires pickaxe)
    for (let i = 0; i < 18; i++) {
      const x = (Math.random() - 0.5) * 100;
      const z = -50 + (Math.random() - 0.5) * 75;
      if (avoid(x, z)) continue;
      _spawnNode('metalOre', x, z);
    }
  }

  // ── Harvesting logic ─────────────────────────────────────────
  function _tryHarvest(node, playerPos, now) {
    if (node.depleted) return;
    const dx = playerPos.x - node.mesh.position.x;
    const dz = playerPos.z - node.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > HARVEST_RANGE) {
      // Player left the range — reset wind-up timer
      node._harvestEnterTime = null;
      return;
    }

    // Wind-up delay: player must remain in range for HARVEST_WINDUP_MS before harvesting
    if (!node._harvestEnterTime) node._harvestEnterTime = now;
    if (now - node._harvestEnterTime < HARVEST_WINDUP_MS) return;

    const requiredTool = _getToolForNode(node.type);
    if (!_hasTool(requiredTool)) {
      // Show "need tool" hint once per approach
      if (!node._shownNoToolHint || (now - node._shownNoToolHint) > 5000) {
        node._shownNoToolHint = now;
        const toolDef = TOOL_DEFS[requiredTool];
        _showFloatingText(
          node.mesh.position,
          `Need ${toolDef ? toolDef.icon + ' ' + toolDef.name : 'tool'}`,
          '#FFD700'
        );
      }
      return;
    }

    // Apply speed bonus from gathering skills
    const skills = _getGatheringSkills() || {};
    let speedSkillKey = 'gatherSpeed';
    if (node.type === 'tree') speedSkillKey = 'chopSpeed';
    else if (node.type === 'rock' || node.type === 'coal' || node.type === 'iron') speedSkillKey = 'mineSpeed';
    const skillLevel = skills[speedSkillKey] || 0;
    const speedBonus = 1 - (skillLevel * 0.08);
    const effectiveCooldown = HARVEST_COOLDOWN_MS * Math.max(0.2, speedBonus);
    if (now - node._lastHarvestTime < effectiveCooldown) return;

    node._lastHarvestTime = now;

    // Start swing animation
    const toolDef = TOOL_DEFS[requiredTool];
    _swingAnim = { toolId: requiredTool, endTime: now + (toolDef ? toolDef.swingDurationMs : 600), nodeRef: node, startTime: now };

    // Apply damage to node
    const dmg = 20;
    node.hp -= dmg;
    node._wobbleTime = 0.6;
    node._wobbleDir = { x: dx / (dist + 0.001), z: dz / (dist + 0.001) };

    // Tree shake: spawn wood chip particles that fly outward and fall with gravity
    if (node.type === 'tree') {
      if (_spawnParticlesFn) _spawnParticlesFn(node.mesh.position, 0x8B4513, 4);
      // Wood chips via managedAnimations if available
      if (typeof managedAnimations !== 'undefined' && typeof MAX_MANAGED_ANIMATIONS !== 'undefined' &&
          typeof THREE !== 'undefined' && typeof scene !== 'undefined') {
        const chipCount = 5 + Math.floor(Math.random() * 4);
        for (let _ci = 0; _ci < chipCount && managedAnimations.length < MAX_MANAGED_ANIMATIONS; _ci++) {
          const chipGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
          const chipMat = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
          const chip = new THREE.Mesh(chipGeo, chipMat);
          chip.position.copy(node.mesh.position);
          chip.position.y += 0.8 + Math.random() * 0.5;
          scene.add(chip);
          const cvx = (dx / dist) * (0.05 + Math.random() * 0.1) + (Math.random() - 0.5) * 0.12;
          const cvz = (dz / dist) * (0.05 + Math.random() * 0.1) + (Math.random() - 0.5) * 0.12;
          let cvy = 0.08 + Math.random() * 0.12;
          let _chipLife = 0;
          managedAnimations.push({ update(cdt) {
            _chipLife += cdt;
            cvy -= 0.015;
            chip.position.x += cvx;
            chip.position.y += cvy;
            chip.position.z += cvz;
            chip.rotation.x += 0.15;
            chip.rotation.z += 0.1;
            if (_chipLife > 0.8 || chip.position.y < 0) {
              scene.remove(chip);
              chipGeo.dispose();
              chipMat.dispose();
              return false;
            }
            return true;
          }});
        }
      }
      // Screen flash on swing overlay
      _swingAnim._flashPending = true;
    }

    // Particles
    if (_spawnParticlesFn) {
      const nodeDef = NODE_DEFS[node.type];
      _spawnParticlesFn(node.mesh.position, nodeDef ? nodeDef.color : 0x888888, 8);
    }

    if (node.hp <= 0) {
      _depleteNode(node, requiredTool);
    }
  }

  function _depleteNode(node, toolId) {
    node.depleted = true;

    const nodeDef = NODE_DEFS[node.type];
    const toolDef = TOOL_DEFS[toolId] || {};
    const yieldRes = nodeDef ? nodeDef.yield : 'stone';

    // Work out amount based on tool rarity
    const tools = _getTools();
    const epicKey = 'epic' + toolId.charAt(0).toUpperCase() + toolId.slice(1);
    const isEpic = tools && tools[epicKey];
    const baseMin = toolDef.amountMin || 1;
    const baseMax = toolDef.amountMax || 3;
    const mult = isEpic ? 2.5 : 1;
    let amount = Math.round((baseMin + Math.random() * (baseMax - baseMin)) * mult);

    // Apply gathering skill bonuses
    const skills = _getGatheringSkills() || {};
    const yieldLevel = skills.yieldBonus || 0;
    const yieldMult = 1 + yieldLevel * 0.1;
    amount = Math.round(amount * yieldMult);
    if (Math.random() < (skills.critGather || 0) * 0.1) amount *= 2;

    // Grant resources
    const res = _getResources();
    if (res && yieldRes) {
      res[yieldRes] = (res[yieldRes] || 0) + amount;
    }

    // Bonus yield for animal carcass: also grant meat
    if (node.type === 'animal_carcass' && res) {
      const meatAmount = 1 + Math.floor(Math.random() * 2);
      res.meat = (res.meat || 0) + meatAmount;
      _showFloatingText(
        { x: node.mesh.position.x, y: (node.mesh.position.y || 0) + 0.5, z: node.mesh.position.z },
        `+${meatAmount} ${RESOURCE_TYPES.meat.icon} ${RESOURCE_TYPES.meat.label}`,
        RESOURCE_TYPES.meat.color
      );
    }

    // Visual & audio feedback
    if (_spawnParticlesFn) {
      _spawnParticlesFn(node.mesh.position, nodeDef ? nodeDef.color : 0x888888, 20);
    }
    _showFloatingText(
      node.mesh.position,
      `+${amount} ${RESOURCE_TYPES[yieldRes] ? RESOURCE_TYPES[yieldRes].icon + ' ' + RESOURCE_TYPES[yieldRes].label : yieldRes}`,
      RESOURCE_TYPES[yieldRes] ? RESOURCE_TYPES[yieldRes].color : '#FFFFFF'
    );

    // Show slide-in collection notification (upper-right corner)
    _showCollectionNotification(yieldRes, amount);

    // Tree fall animation variation
    if (node.type === 'tree') {
      node._fallVariation = Math.floor(Math.random() * 5);
    }

    // Stone/ore break effect
    if (node.type === 'rock' || node.type === 'coal' || node.type === 'iron') {
      node._breakEffect = true;
    }

    // Collapse animation — scale to 0 over ~0.5s then hide
    node._collapseStart = Date.now();
    node._collapseFrom = node.mesh.scale.clone ? node.mesh.scale.clone() : { x: 1, y: 1, z: 1 };

    // Update HUD
    _updateHUD();

    // Fire quest progress hooks
    if (window.GameHarvesting && window.GameHarvesting._onHarvest) {
      window.GameHarvesting._onHarvest(yieldRes, amount);
    }
  }

  // ── Enemy flesh drop ─────────────────────────────────────────
  // Called on any enemy kill. Animal-type enemies (types 15=DaddyLonglegs, 16=Swarm
  // and a random chance on others) leave a skinnable carcass node behind.
  function onEnemyKilled(enemyPos, enemyType) {
    if (Math.random() < 0.25) {   // 25% chance to drop flesh
      const res = _getResources();
      if (res) {
        res.flesh = (res.flesh || 0) + 1;
        _showFloatingText(enemyPos, '+1 🩸 Flesh', '#CC2200');
        _updateHUD();
      }
    }
    // Animal-type enemies always drop a carcass; others have a 15% chance
    const isAnimal = (enemyType === 15 || enemyType === 16);
    if (isAnimal || Math.random() < 0.15) {
      // Spawn a skinnable carcass node at the kill site (requires Knife to skin)
      _spawnNode('animal_carcass', enemyPos.x + (Math.random() - 0.5) * 0.5, enemyPos.z + (Math.random() - 0.5) * 0.5);
    }
  }

  // ── Crafting helpers ─────────────────────────────────────────

  /**
   * Craft Leather from Animal Skin.
   * 2 Animal Skin → 1 Leather
   * @returns {boolean} true if craft succeeded
   */
  function craftLeather() {
    const res = _getResources();
    if (!res || (res.animalSkin || 0) < 2) return false;
    res.animalSkin -= 2;
    res.leather = (res.leather || 0) + 1;
    _showCollectionNotification('leather', 1);
    _updateHUD();
    return true;
  }

  /**
   * Craft Food (a meal) from Meat.
   * 1 Meat → 1 Food
   * @returns {boolean} true if craft succeeded
   */
  function craftMeal() {
    const res = _getResources();
    if (!res || (res.meat || 0) < 1) return false;
    res.meat -= 1;
    res.food = (res.food || 0) + 1;
    _showCollectionNotification('food', 1);
    _updateHUD();
    return true;
  }

  /**
   * Recycle a weapon / gear piece into Metal.
   * Accepts a weaponId string (any truthy value in practice — the UI provides it).
   * Each recycle yields 1-3 Metal depending on weapon rarity tier.
   * @param {string} weaponId  - ID of the gear to recycle (checked vs saveData.inventory)
   * @param {number} [metalYield=1] - How many metal to grant (caller can pass rarity-based value)
   * @returns {boolean} true if recycle succeeded
   */
  function recycleToMetal(weaponId, metalYield) {
    const res = _getResources();
    if (!res) return false;
    const recycleYield = Math.max(1, Math.floor(metalYield || 1));
    res.metal = (res.metal || 0) + recycleYield;
    _showCollectionNotification('metal', recycleYield);
    _updateHUD();
    return true;
  }

  // ── Resource collection notification (slide-in from upper-right) ──
  let _notifContainer = null;
  let _notifHideTimer = null;

  function _hideAllNotifs() {
    if (!_notifContainer) return;
    Array.from(_notifContainer.children).forEach(c => {
      c.style.transform = 'translateX(120%)';
      c.style.opacity = '0';
    });
    setTimeout(() => { if (_notifContainer) _notifContainer.innerHTML = ''; }, 280);
  }

  function _showCollectionNotification(resourceKey, amount) {
    if (!_notifContainer) {
      _notifContainer = document.createElement('div');
      _notifContainer.id = 'harvest-notif-container';
      _notifContainer.style.cssText = 'position:fixed;top:60px;right:10px;z-index:350;display:flex;flex-direction:column;gap:3px;pointer-events:none;max-width:140px;';
      document.body.appendChild(_notifContainer);
    }
    const rt = RESOURCE_TYPES[resourceKey];
    if (!rt) return;

    // Merge into existing toast for same resource
    const existing = Array.from(_notifContainer.children).find(c => c.dataset.resKey === resourceKey);
    if (existing) {
      const countEl = existing.querySelector('[data-total]');
      if (countEl) {
        const newTotal = parseInt(countEl.dataset.total || '0', 10) + amount;
        countEl.dataset.total = newTotal;
        countEl.textContent = `+${newTotal}`;
      }
    } else {
      const el = document.createElement('div');
      el.dataset.resKey = resourceKey;
      el.style.cssText = `background:rgba(0,0,0,0.82);border:1px solid ${rt.color};border-radius:5px;padding:2px 7px;color:#fff;font-size:11px;font-weight:bold;font-family:'Bangers',cursive;letter-spacing:1px;display:flex;align-items:center;gap:4px;transform:translateX(120%);transition:transform 0.25s ease-out,opacity 0.25s;opacity:0;white-space:nowrap;`;
      el.innerHTML = `<span style="font-size:12px;">${rt.icon}</span><span data-total="${amount}">+${amount}</span><span style="opacity:0.75;font-size:10px;">${rt.label}</span>`;
      _notifContainer.appendChild(el);
      // Slide in
      requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; el.style.opacity = '1'; });
    }

    // Reset auto-hide timer – fade everything out after 2.5s of no activity
    if (_notifHideTimer) clearTimeout(_notifHideTimer);
    _notifHideTimer = setTimeout(_hideAllNotifs, 2500);
  }

  // ── Floating text helper ─────────────────────────────────────
  function _showFloatingText(worldPos, text, color) {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute', 'pointer-events:none', 'z-index:200',
      `color:${color || '#FFF'}`, 'font-size:16px', 'font-weight:bold',
      'text-shadow:0 1px 4px #000', 'transition:none',
      'white-space:nowrap', 'font-family:"Bangers",cursive', 'letter-spacing:1px'
    ].join(';');
    el.textContent = text;
    document.getElementById('game-container')?.appendChild(el) || document.body.appendChild(el);

    // Project 3D pos to screen (requires camera on window)
    const cam = window._gameCamera;
    if (cam && worldPos && window.THREE) {
      const v = new window.THREE.Vector3(worldPos.x, (worldPos.y || 0) + 2.5, worldPos.z);
      v.project(cam);
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-(v.y * 0.5) + 0.5) * window.innerHeight;
      el.style.left = sx + 'px';
      el.style.top = sy + 'px';
    } else {
      el.style.left = '50%';
      el.style.top = '40%';
    }

    _floatingTexts.push({ el, startTime: Date.now(), duration: 1800 });
  }

  // ── HUD helpers ───────────────────────────────────────────────
  function _buildHUD() {
    if (document.getElementById('harvest-hud')) return;
    const hud = document.createElement('div');
    hud.id = 'harvest-hud';
    hud.className = 'harvest-hud';
    document.body.appendChild(hud);
    _updateHUD();
  }

  // Building material resource keys shown in camp HUD
  const BUILD_MATERIAL_KEYS = ['wood', 'stone'];

  function _updateHUD() {
    const hud = document.getElementById('harvest-hud');
    if (!hud) return;

    // In game mode, hide the persistent HUD entirely – resources are shown
    // only as temporary toasts when actively collected.
    const isCamp = hud.classList.contains('camp-mode');
    if (!isCamp) { hud.style.display = 'none'; return; }

    const res = _getResources();
    if (!res) { hud.innerHTML = ''; hud.style.display = 'none'; return; }

    // Camp mode: always show building materials (wood/stone) even at 0
    // hidden: true resources are always excluded — even if the player has leftover amounts from legacy saves
    const entries = Object.entries(RESOURCE_TYPES)
      .filter(([k, v]) => k !== 'flesh' && !v.hidden && (res[k] > 0 || (isCamp && BUILD_MATERIAL_KEYS.includes(k))))
      .map(([k, v]) => `<span class="harvest-res-item"><span class="harvest-res-icon">${v.icon}</span><span class="harvest-res-count">x${(res[k] || 0)}</span></span>`)
      .join('');
    hud.innerHTML = entries || '';
    hud.style.display = entries ? 'flex' : 'none';
  }

  // ── Tool-swing HUD overlay (brief visual on-screen when harvesting) ──
  function _drawSwingOverlay(playerPos) {
    let el = document.getElementById('harvest-swing-overlay');
    if (_swingAnim && Date.now() < _swingAnim.endTime) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'harvest-swing-overlay';
        el.className = 'harvest-swing-overlay';
        document.body.appendChild(el);
      }
      const tool = TOOL_DEFS[_swingAnim.toolId];
      el.textContent = tool ? tool.icon : '⛏️';
      el.style.display = 'block';

      // Project player world position to screen, offset upward above their head
      if (playerPos && window._gameCamera && typeof THREE !== 'undefined') {
        const worldPos = new THREE.Vector3(playerPos.x, SWING_OVERLAY_HEIGHT_OFFSET, playerPos.z);
        worldPos.project(window._gameCamera);
        const screenX = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-worldPos.y * 0.5 + 0.5) * window.innerHeight;
        el.style.left = screenX + 'px';
        el.style.top  = screenY + 'px';
      }

      // Arc animation: rotate from -40deg to 120deg over swingDurationMs
      const swingDuration = tool ? tool.swingDurationMs : 600;
      const pct = 1 - ((_swingAnim.endTime - Date.now()) / swingDuration);
      const rotateDeg = -40 + pct * 160; // -40deg → 120deg
      let scaleVal = 1.0;
      // Flash: scale to 1.5x at start then fade back
      if (_swingAnim._flashPending) {
        _swingAnim._flashPending = false;
        _swingAnim._flashStart = Date.now();
      }
      if (_swingAnim._flashStart) {
        const flashAge = Date.now() - _swingAnim._flashStart;
        if (flashAge < 80) {
          scaleVal = 1.5 - (flashAge / 80) * 0.5;
        } else {
          scaleVal = 1.0;
          delete _swingAnim._flashStart;
        }
      }
      el.style.transform = `translate(-50%,-50%) rotate(${rotateDeg}deg) scale(${scaleVal})`;
    } else if (el) {
      el.style.display = 'none';
      if (_swingAnim && Date.now() >= _swingAnim.endTime) _swingAnim = null;
    }
  }

  // ── Per-frame update ─────────────────────────────────────────
  function update(dt, playerPos, now) {
    if (!playerPos) return;
    now = now || Date.now();

    // Harvest is triggered simply by being near a node (no stand-still required)
    const canHarvest = true;
    if (_lastPlayerPos === null) {
      _lastPlayerPos = { x: playerPos.x, z: playerPos.z };
    } else {
      _lastPlayerPos.x = playerPos.x;
      _lastPlayerPos.z = playerPos.z;
    }

    // Animate wobble on nodes
    for (const node of harvestNodes) {
      if (node.depleted) {
        // Tree fall animation (5 variations)
        if (node._fallVariation !== undefined && node._collapseStart !== undefined) {
          const elapsed = Date.now() - node._collapseStart;
          const fallDuration = 800;
          const fadeDuration = 400;
          if (elapsed < fallDuration) {
            const t = elapsed / fallDuration;
            const angle = t * (Math.PI / 2);
            switch (node._fallVariation) {
              case 0: node.mesh.rotation.x = angle; break;
              case 1: node.mesh.rotation.z = angle; break;
              case 2: node.mesh.rotation.z = -angle; break;
              case 3: node.mesh.rotation.x = -angle; break;
              case 4:
                node.mesh.rotation.y = t * Math.PI * 2;
                node.mesh.rotation.x = angle;
                break;
            }
          } else if (elapsed < fallDuration + fadeDuration) {
            const fadeT = (elapsed - fallDuration) / fadeDuration;
            if (node.mesh.scale && typeof node.mesh.scale.setScalar === 'function') {
              node.mesh.scale.setScalar(Math.max(0, 1 - fadeT));
            }
          } else {
            node.mesh.visible = false;
            delete node._collapseStart;
            delete node._fallVariation;
          }
          continue;
        }
        // Stone/ore break animation
        if (node._breakEffect && node._collapseStart !== undefined) {
          const elapsed = Date.now() - node._collapseStart;
          const breakDuration = 300;
          if (elapsed === 0 || (elapsed > 0 && !node._breakParticlesSpawned)) {
            node._breakParticlesSpawned = true;
            if (_spawnParticlesFn) {
              const nodeDef = NODE_DEFS[node.type];
              _spawnParticlesFn(node.mesh.position, nodeDef ? nodeDef.color : 0x888888, 3 + Math.floor(Math.random() * 3));
            }
          }
          const t = Math.min(1, elapsed / breakDuration);
          if (node.mesh.scale && typeof node.mesh.scale.setScalar === 'function') {
            node.mesh.scale.setScalar(Math.max(0, 1 - t));
          }
          if (t >= 1) {
            node.mesh.visible = false;
            delete node._collapseStart;
            delete node._breakEffect;
            delete node._breakParticlesSpawned;
          }
          continue;
        }
        // Default collapse animation
        if (node._collapseStart !== undefined) {
          const elapsed = (Date.now() - node._collapseStart) / 400;
          const s = Math.max(0, 1 - elapsed);
          if (node.mesh.scale && typeof node.mesh.scale.setScalar === 'function') {
            node.mesh.scale.setScalar(s);
          }
          if (s <= 0) {
            node.mesh.visible = false;
            delete node._collapseStart;
          }
        }
        continue;
      }

      if (node._wobbleTime > 0) {
        node._wobbleTime -= dt;
        const w = Math.sin(node._wobbleTime * 20) * node._wobbleTime * 0.25;
        node.mesh.rotation.x = node._wobbleDir.x * w;
        node.mesh.rotation.z = node._wobbleDir.z * w;
        if (node._wobbleTime <= 0) {
          node.mesh.rotation.x = 0;
          node.mesh.rotation.z = 0;
        }
      }

      // Slight idle bob for magic / crystal nodes
      if (node.type === 'magic' || node.type === 'crystal') {
        node.mesh.rotation.y = (node.mesh.rotation.y || 0) + dt * 0.8;
        node.mesh.position.y = 0.3 + Math.sin(now * 0.001 + node.mesh.position.x) * 0.15;
      }

      // Try harvesting if player is nearby
      if (canHarvest) {
        _tryHarvest(node, playerPos, now);
      }
    }

    // Update floating texts
    for (let i = _floatingTexts.length - 1; i >= 0; i--) {
      const ft = _floatingTexts[i];
      const age = Date.now() - ft.startTime;
      const frac = age / ft.duration;
      if (frac >= 1) {
        ft.el.remove();
        _floatingTexts.splice(i, 1);
        continue;
      }
      ft.el.style.opacity = String(1 - frac * frac);
      ft.el.style.transform = `translateY(${-frac * 40}px)`;
    }

    _drawSwingOverlay(playerPos);
    _updateRoboticBackpack(playerPos, now);
  }

// ── Robotic Backpack Harvesting System ─────────────────────
  // State for the robotic arm harvest sequence
  const ROBOTIC_STILL_MS   = 1500;  // ms standing still near node to trigger arm
  const ROBOTIC_COLLECT_MS = 2000;  // ms standing near fallen node to collect
  let _roboticState = null; // { phase:'arming'|'animating'|'fallen'|'collecting', nodeRef, startTime, ... }
  let _roboticPlayerLastX = null;
  let _roboticPlayerLastZ = null;
  let _roboticStillStart  = null;
  let _roboticCSSInjected = false;

  function _injectRoboticCSS() {
    if (_roboticCSSInjected) return;
    _roboticCSSInjected = true;
    const s = document.createElement('style');
    s.id = '_robotic-arm-style';
    s.textContent = [
      '@keyframes _ra-extend{0%{transform:translateX(-50%) scaleX(0);opacity:0;}',
      '40%{transform:translateX(-50%) scaleX(1.1);opacity:1;}',
      '100%{transform:translateX(-50%) scaleX(1);opacity:1;}}',
      '@keyframes _ra-chop{0%,100%{transform:translateX(-50%) rotate(0deg);}',
      '50%{transform:translateX(-50%) rotate(-30deg);}}',
      '@keyframes _ra-retract{0%{opacity:1;transform:translateX(-50%) scaleX(1);}',
      '100%{opacity:0;transform:translateX(-50%) scaleX(0);}}',
      '@keyframes _ra-circle{0%{stroke-dashoffset:157;}100%{stroke-dashoffset:0;}}',
      '@keyframes _ra-leaf{0%{transform:translate(0,0) rotate(0deg);opacity:1;}',
      '100%{transform:translate(var(--ra-lx),var(--ra-ly)) rotate(360deg);opacity:0;}}',
      '._ra-arm{position:fixed;bottom:30%;left:50%;',
      'transform:translateX(-50%);',
      'z-index:5000;pointer-events:none;',
      'font-size:clamp(28px,5vw,44px);',
      'transform-origin:left center;',
      'animation:_ra-extend 0.35s ease-out forwards;}',
      '._ra-arm.chopping{animation:_ra-chop 0.3s ease-in-out 3;}',
      '._ra-arm.retracting{animation:_ra-retract 0.4s ease-in forwards;}',
      '._ra-collect-ring{position:fixed;z-index:5001;pointer-events:none;',
      'transform:translate(-50%,-50%);}',
      '._ra-leaf-particle{position:fixed;z-index:5002;pointer-events:none;font-size:14px;',
      'animation:_ra-leaf var(--ra-dur,1s) ease-out forwards;}'
    ].join('');
    document.head.appendChild(s);
  }

  function _hasBackpack() {
    const t = _getTools();
    return !!(t && t.harvesterBackpack);
  }
  function _hasRoboticArm(nodeType) {
    const t = _getTools();
    if (!t) return false;
    if (nodeType === 'tree')  return !!t.woodAxeArm;
    if (nodeType === 'rock')  return !!t.stonePickaxeArm;
    return false;
  }

  function _spawnLeafParticle(screenX, screenY, isStone) {
    const icons = isStone ? ['🪨','💥','⚡','✨'] : ['🍃','🌿','🍀','✨','🌱'];
    const p = document.createElement('div');
    p.className = '_ra-leaf-particle';
    p.textContent = icons[Math.floor(Math.random() * icons.length)];
    const lx = ((Math.random() - 0.5) * 120).toFixed(0) + 'px';
    const ly = (-40 - Math.random() * 80).toFixed(0) + 'px';
    const dur = (0.6 + Math.random() * 0.6).toFixed(2) + 's';
    p.style.cssText = 'left:' + (screenX + (Math.random()-0.5)*30) + 'px;top:' + screenY + 'px;--ra-lx:' + lx + ';--ra-ly:' + ly + ';--ra-dur:' + dur + ';opacity:0;animation-delay:' + (Math.random() * 0.15).toFixed(2) + 's;';
    document.body.appendChild(p);
    setTimeout(function() { if (p.parentNode) p.parentNode.removeChild(p); }, 1800);
  }

  function _worldToScreen(worldX, worldY, worldZ) {
    const cam = window._gameCamera;
    if (!cam || typeof THREE === 'undefined') return { x: window.innerWidth/2, y: window.innerHeight/2 };
    const v = new THREE.Vector3(worldX, worldY, worldZ);
    v.project(cam);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-(v.y * 0.5) + 0.5) * window.innerHeight
    };
  }

  function _showCollectRing(node) {
    let ring = document.getElementById('_ra-collect-ring');
    if (ring) ring.parentNode && ring.parentNode.removeChild(ring);
    ring = document.createElement('div');
    ring.id = '_ra-collect-ring';
    ring.className = '_ra-collect-ring';
    const isStone = node.type === 'rock';
    const icon = isStone ? '🪨' : '🪵';
    const col  = isStone ? '#9966ff' : '#00cc88';
    ring.innerHTML = [
      '<svg width="60" height="60" viewBox="0 0 60 60">',
        '<circle cx="30" cy="30" r="25" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="5"/>',
        '<circle id="_ra-ring-arc" cx="30" cy="30" r="25" fill="none" stroke="' + col + '" stroke-width="5"',
        ' stroke-dasharray="157" stroke-dashoffset="157" stroke-linecap="round" transform="rotate(-90 30 30)"/>',
      '</svg>',
      '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;">' + icon + '</div>'
    ].join('');
    document.body.appendChild(ring);
    node._collectRingEl = ring;
    node._collectRingArc = ring.querySelector('#_ra-ring-arc');
    node._collectStartTime = Date.now();
  }

  function _hideCollectRing(node) {
    if (node._collectRingEl) {
      if (node._collectRingEl.parentNode) node._collectRingEl.parentNode.removeChild(node._collectRingEl);
      node._collectRingEl = null;
      node._collectRingArc = null;
    }
  }

  function _updateCollectRing(node, progress) {
    if (!node._collectRingEl) return;
    // Position over node
    const sp = _worldToScreen(node.mesh.position.x, (node.mesh.position.y || 0) + 1.5, node.mesh.position.z);
    node._collectRingEl.style.left = sp.x + 'px';
    node._collectRingEl.style.top  = sp.y + 'px';
    if (node._collectRingArc) {
      const offset = 157 * (1 - Math.min(1, progress));
      node._collectRingArc.setAttribute('stroke-dashoffset', offset.toFixed(1));
    }
  }

  function _triggerRoboticHarvest(node) {
    _injectRoboticCSS();
    const isStone = node.type === 'rock';

    // Remove any leftover arm
    let oldArm = document.getElementById('_ra-arm');
    if (oldArm && oldArm.parentNode) oldArm.parentNode.removeChild(oldArm);

    const arm = document.createElement('div');
    arm.id = '_ra-arm';
    arm.className = '_ra-arm';
    arm.textContent = isStone ? '⚙️🔨' : '🦾🪓';
    document.body.appendChild(arm);

    // Chop 3 times with wobble + particle burst
    const sp = _worldToScreen(node.mesh.position.x, (node.mesh.position.y || 0) + 1.5, node.mesh.position.z);
    let chopsDone = 0;
    const chopsTotal = 3;
    function _doChop() {
      if (!arm.parentNode) return;
      arm.classList.remove('chopping');
      void arm.offsetWidth;
      arm.classList.add('chopping');
      // Damage the node visually
      node._wobbleTime = 0.5;
      node._wobbleDir = { x: 0.5, z: 0.5 };
      // Spawn leaf/rock particles at node screen position
      for (let i = 0; i < 5; i++) _spawnLeafParticle(sp.x, sp.y, isStone);
      if (_spawnParticlesFn && node.mesh) {
        const nd = NODE_DEFS[node.type];
        _spawnParticlesFn(node.mesh.position, nd ? nd.color : 0x888888, 3);
      }
      chopsDone++;
      if (chopsDone < chopsTotal) {
        setTimeout(_doChop, 350);
      } else {
        // Retract arm
        arm.classList.remove('chopping');
        arm.classList.add('retracting');
        setTimeout(function() { if (arm.parentNode) arm.parentNode.removeChild(arm); }, 450);

        // Deplete node and show collection ring
        node.depleted = true;
        node.hp = 0;
        if (node.type === 'tree') {
          node._fallVariation = Math.floor(Math.random() * 5);
          node._collapseStart = Date.now() + 200; // short delay for drama
        } else {
          node._breakEffect = true;
          node._collapseStart = Date.now() + 200;
        }
        // Set as "fallen" — ready to collect
        node._roboticFallen = true;
        node._fallenPos = { x: node.mesh.position.x, y: 0, z: node.mesh.position.z };
        _roboticState = { phase: 'fallen', nodeRef: node };
        _showCollectRing(node);
      }
    }
    setTimeout(_doChop, 350);
    _roboticState = { phase: 'animating', nodeRef: node };
  }

  function _updateRoboticBackpack(playerPos, now) {
    if (!_hasBackpack()) return;

    // Phase: fallen — show collection ring, detect 2s near fallen node
    if (_roboticState && _roboticState.phase === 'fallen') {
      const node = _roboticState.nodeRef;
      if (!node || !node._roboticFallen) { _roboticState = null; return; }
      const fp = node._fallenPos || (node.mesh ? node.mesh.position : null);
      if (!fp) return;
      const dx = playerPos.x - fp.x;
      const dz = playerPos.z - fp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 4.5) {
        // Left area — hide ring, reset timer
        _hideCollectRing(node);
        node._collectStartTime = null;
        return;
      }
      if (!node._collectStartTime) {
        _showCollectRing(node);
        node._collectStartTime = now;
      }
      const elapsed = now - node._collectStartTime;
      _updateCollectRing(node, elapsed / ROBOTIC_COLLECT_MS);
      if (elapsed >= ROBOTIC_COLLECT_MS) {
        // Grant resource
        const res = _getResources();
        if (res) {
          const yld = node.type === 'tree' ? 'wood' : 'stone';
          res[yld] = (res[yld] || 0) + 1;
          _showResourceNotif(yld, 1);
          _showFloatingText(fp, '+1 ' + (node.type === 'tree' ? '🪵' : '🪨'), node.type === 'tree' ? '#00cc88' : '#9966ff');
          if (typeof window.updateGoldDisplays === 'function') window.updateGoldDisplays();
          if (window.GameHarvesting && window.GameHarvesting._onHarvest) {
            window.GameHarvesting._onHarvest(yld, 1);
          }
        }
        _hideCollectRing(node);
        delete node._roboticFallen;
        delete node._fallenPos;
        _roboticState = null;
      }
      return;
    }

    // Phase: animating — wait for it to finish (handled by _triggerRoboticHarvest callbacks)
    if (_roboticState && _roboticState.phase === 'animating') return;

    // Phase: idle — check for proximity and stillness
    const moved = _roboticPlayerLastX !== null &&
      (Math.abs(playerPos.x - _roboticPlayerLastX) > 0.15 || Math.abs(playerPos.z - _roboticPlayerLastZ) > 0.15);
    if (moved) {
      _roboticStillStart = null;
    }
    _roboticPlayerLastX = playerPos.x;
    _roboticPlayerLastZ = playerPos.z;

    if (!_roboticStillStart) { _roboticStillStart = now; return; }
    const stillMs = now - _roboticStillStart;
    if (stillMs < ROBOTIC_STILL_MS) return;

    // Find closest valid node that robotic arm can harvest
    let closest = null;
    let closestDist = 3.5;
    for (const node of harvestNodes) {
      if (node.depleted || node._roboticFallen) continue;
      if (node.type !== 'tree' && node.type !== 'rock') continue;
      if (!_hasRoboticArm(node.type)) continue;
      const dx = playerPos.x - node.mesh.position.x;
      const dz = playerPos.z - node.mesh.position.z;
      const d  = Math.sqrt(dx * dx + dz * dz);
      if (d < closestDist) { closestDist = d; closest = node; }
    }
    if (!closest) return;

    // Trigger robotic harvest
    _roboticStillStart = null; // reset so we don't re-trigger immediately
    _triggerRoboticHarvest(closest);
  }

  // Public helpers for crafting the backpack/arms at the Forge
  function craftRoboticItem(itemId) {
    const def = TOOL_DEFS[itemId];
    if (!def || (!def.isBackpack && !def.isRoboticArm)) return { ok: false, reason: 'Unknown item' };
    const tools = _getTools();
    if (!tools) return { ok: false, reason: 'No save data' };
    if (tools[itemId]) return { ok: false, reason: 'Already owned' };
    // Require backpack first for arms
    if (def.isRoboticArm && !tools.harvesterBackpack) return { ok: false, reason: 'Requires Harvester Backpack first' };
    const cost = def.craftCost || {};
    const res = _getResources();
    const saveData = _saveData;
    // Check gold
    if ((cost.gold || 0) > 0 && (!saveData || saveData.gold < cost.gold)) return { ok: false, reason: 'Not enough gold' };
    // Check resources
    if (res) {
      for (const [mat, qty] of Object.entries(cost)) {
        if (mat === 'gold') continue;
        if ((res[mat] || 0) < qty) return { ok: false, reason: 'Not enough ' + mat };
      }
    }
    // Deduct costs
    if (saveData && cost.gold) saveData.gold -= cost.gold;
    if (res) {
      for (const [mat, qty] of Object.entries(cost)) {
        if (mat === 'gold') continue;
        res[mat] = (res[mat] || 0) - qty;
      }
    }
    tools[itemId] = true;
    _updateHUD();
    return { ok: true };
  }

  // ── Clear all resource nodes from scene ──────────────────────
  // Removes every node mesh from the Three.js scene and disposes its geometry/
  // material, then empties the harvestNodes array. Call this from resetGame so
  // stale node meshes and depleted/fallen trees don't carry over between runs.
  function clearNodes() {
    for (const node of harvestNodes) {
      if (node.mesh && _scene) {
        _scene.remove(node.mesh);
        node.mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
      }
    }
    harvestNodes.length = 0;
  }

  // ── Solid collision resolver ──────────────────────────────────
  // Push the player position out of any non-depleted resource node's radius.
  // The player movement system should call this after applying movement each frame.
  // @param {object} pos    - { x, z } player position (mutated in place)
  // @param {number} radius - player collision radius (default 0.55)
  function resolveNodeCollisions(pos, radius) {
    const pr = (radius !== undefined) ? radius : 0.55;
    for (let i = 0; i < harvestNodes.length; i++) {
      const node = harvestNodes[i];
      if (node.depleted || !node.mesh || !node.mesh.visible) continue;
      const def = NODE_DEFS[node.type];
      if (!def) continue;
      const nodeR = def.radius * NODE_COLLISION_RADIUS_SCALE;
      const combined = pr + nodeR;
      const dx = pos.x - node.mesh.position.x;
      const dz = pos.z - node.mesh.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < combined * combined && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const push = combined - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
        // Wobble the node away from the player on collision
        node._wobbleTime = 0.4;
        node._wobbleDir = { x: -dx / dist, z: -dz / dist };
      }
    }
  }

  // ── Store helpers (called from camp UI) ─────────────────────
  function buyTool(toolId) {
    const def = TOOL_DEFS[toolId];
    if (!def) return false;
    const tools = _getTools();
    if (!tools || tools[toolId]) return false; // already owned
    const saveData = _saveData;
    if (!saveData) return false;
    if (saveData.gold < def.buyCost) return false;
    saveData.gold -= def.buyCost;
    tools[toolId] = true;
    _updateHUD();
    return true;
  }

  function forgeTool(toolId) {
    const def = TOOL_DEFS[toolId];
    if (!def || !def.epicForgeReq) return false;
    const tools = _getTools();
    const epicKey = 'epic' + toolId.charAt(0).toUpperCase() + toolId.slice(1);
    if (!tools || !tools[toolId] || tools[epicKey]) return false; // need base, not yet epic
    const res = _getResources();
    if (!res) return false;
    // Check requirements
    for (const [mat, qty] of Object.entries(def.epicForgeReq)) {
      if ((res[mat] || 0) < qty) return false;
    }
    // Consume resources
    for (const [mat, qty] of Object.entries(def.epicForgeReq)) {
      res[mat] -= qty;
    }
    tools[epicKey] = true;
    _updateHUD();
    return true;
  }

  function getToolList() {
    return Object.values(TOOL_DEFS);
  }

  function hasOwnedTools() {
    const t = _getTools();
    if (!t) return false;
    return Object.values(TOOL_DEFS).some(d => t[d.id]);
  }

  // ── Public API ────────────────────────────────────────────────
  window.GameHarvesting = {
    RESOURCE_TYPES,
    TOOL_DEFS,
    NODE_DEFS,
    GATHERING_SKILLS,
    harvestNodes,

    init(scene, saveData, spawnParticlesFn) {
      _scene = scene;
      _saveData = saveData;
      _spawnParticlesFn = spawnParticlesFn;
      // Ensure save-data fields exist
      _getResources();
      _getTools();
      // Build HUD
      _buildHUD();
      // Populate world with resource nodes
      populateWorld();
    },

    update,
    onEnemyKilled,
    buyTool,
    forgeTool,
    getToolList,
    hasOwnedTools,
    resolveNodeCollisions,
    craftLeather,
    craftMeal,
    recycleToMetal,
    craftRoboticItem,

    // Remove all node meshes from scene, dispose GPU resources, and repopulate
    // with a fresh set of nodes. Call from resetGame at the start of each new run.
    resetNodes() {
      clearNodes();
      populateWorld();
    },

    getResources() { return _getResources(); },
    getTools()    { return _getTools(); },
    getGatheringSkills() { return _getGatheringSkills(); },
    upgradeGatheringSkill,

    // Spawn a harvestable animal_carcass node at given position (called when animal is killed)
    spawnCarcassNode(x, z, animalData) {
      _spawnNode('animal_carcass', x, z);
    },

    // Return the solid collision radius for a node type (used by player-class.js)
    _nodeRadius(nodeType) {
      const def = NODE_DEFS[nodeType];
      return def ? def.radius * NODE_COLLISION_RADIUS_SCALE : 0.9;
    },

    // Called when a resource is harvested (hook for quest system)
    _onHarvest: null,

    refreshHUD() { _updateHUD(); },

    // Call from camp to build/show the resource HUD in camp mode (shows 0-count materials)
    showCampHUD(saveData) {
      if (saveData) _saveData = saveData;
      _getResources();
      _buildHUD();
      const hud = document.getElementById('harvest-hud');
      if (hud) {
        hud.classList.add('camp-mode');
        _updateHUD();
      }
    },

    // Remove camp mode from HUD (revert to game mode)
    hideCampHUD() {
      const hud = document.getElementById('harvest-hud');
      if (hud) {
        hud.classList.remove('camp-mode');
        _updateHUD();
      }
    }
  };
}());
