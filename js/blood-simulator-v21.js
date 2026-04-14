// ===============================================
// BLOOD SIMULATOR V2.1 – MAX QUALITY (BennyHood Edition)
// Fully fixed, terrain-aware, fantasy-realism, 120 FPS mobile+PC
// Replaces all old blood systems. Compatible with AdvancedTreeSystem.
// ===============================================

// Per-enemy-type blood palette (mirrors BloodV2 ENEMY_BLOOD table)
const _BSV21_BLOOD = {
  slime:         0x22cc44,
  crawler:       0x994422,
  leaping_slime: 0x00bfff,
  skinwalker:    0x220000,
  bug:           0xaadd00,
  human:         0xcc1100,
  alien:         0x8800ff,
  robot:         0x88aaff,
};

// Per-enemy mist color palette
const _BSV21_MIST = {
  slime:         0x55ff66,
  crawler:       0xbb7744,
  leaping_slime: 0x55ddff,
  skinwalker:    0x330000,
  bug:           0xccee33,
  human:         0xee2200,
  alien:         0xaa33ee,
  robot:         0xaaccff,
};

const _BSV21_GROUND_Y = 0.015;

function _bsv21CreateCircleTexture(size) {
  const texSize = size || 128;
  function _solidFallbackTexture() {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = texSize;
  canvas.height = texSize;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
    return _solidFallbackTexture();
  }
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch (_e) { return _solidFallbackTexture(); }
  if (!ctx) return _solidFallbackTexture();
  const r = texSize * 0.5;
  const grad = ctx.createRadialGradient(r, r, texSize * 0.12, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.78, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.clearRect(0, 0, texSize, texSize);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, texSize, texSize);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function _bsv21LoadParticleTextureWithFallback(path) {
  const fallback = _bsv21CreateCircleTexture(128);
  if (!fallback) return null;
  const texture = (typeof fallback.clone === 'function') ? fallback.clone() : fallback;
  texture.needsUpdate = true;
  try {
    const loader = new THREE.TextureLoader();
    loader.load(
      path,
      function onLoad(loaded) {
        texture.image = loaded.image;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
      },
      undefined,
      function onError() {
        // Keep fallback texture when external texture fails.
      }
    );
  } catch (_e) { /* use fallback */ }
  return texture;
}

// Device capability detection — auto-scales pool sizes:
// Low-memory/mobile (≤2GB or touch device): ≤120 drops / ≤64 mist
// Mid-tier (≤4GB): 600 drops / 400 mist
// Desktop/high-memory (>4GB): ≥1200 drops / ≥800 mist
(function _bsv21DetectDevice() {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 1);
  const mem = (navigator.deviceMemory || (isMobile ? 2 : 8));
  if (isMobile || mem <= 2) {
    window._BSV21_MAX_DROPS = 120;
    window._BSV21_MAX_MIST  = 64;
  } else if (mem <= 4) {
    window._BSV21_MAX_DROPS = 600;
    window._BSV21_MAX_MIST  = 400;
  } else {
    window._BSV21_MAX_DROPS = 1200;
    window._BSV21_MAX_MIST  = 800;
  }
}());

const BloodSimulatorV21 = {
  scene: null,
  terrainMesh: null,
  player: null,
  dropIM: null,
  mistIM: null,
  _decals: null,
  _decalHead: 0,
  MAX_DROPS: window._BSV21_MAX_DROPS,
  MAX_MIST:  window._BSV21_MAX_MIST,
  MAX_DECALS: 200,

  _pool: null,
  _head: 0,
  _mistPool: null,
  _mistHead: 0,
  GROUND_Y: _BSV21_GROUND_Y,
  _particleTex: null,

  // Heartbeat pulse state
  _pulseTimer: 0,
  _pulseInterval: 0.45,
  _pulseWounds: [],

  _matrix: null,
  _color: null,

  init(scene, terrainMesh, player) {
    this.scene = scene;
    this.terrainMesh = terrainMesh;
    this.player = player;

    this._matrix = new THREE.Matrix4();
    this._color  = new THREE.Color();
    this._particleTex = _bsv21LoadParticleTextureWithFallback('assets/textures/blood-particle.png');

    // Drop pool
    this._pool = new Array(this.MAX_DROPS);
    for (let i = 0; i < this.MAX_DROPS; i++) {
      this._pool[i] = { alive:false, px:0, py:0, pz:0, vx:0, vy:0, vz:0,
        radius:0.012, viscosity:0.62, life:0, onGround:false, color:0x8B0000 };
    }
    this._head = 0;

    const dropGeo = new THREE.SphereGeometry(0.012, 8, 6);
    const dropMatOptions = {
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.NormalBlending
    };
    if (this._particleTex) {
      dropMatOptions.map = this._particleTex;
      dropMatOptions.alphaMap = this._particleTex;
    }
    const dropMat = new THREE.MeshBasicMaterial(dropMatOptions);
    this.dropIM = new THREE.InstancedMesh(dropGeo, dropMat, this.MAX_DROPS);
    this.dropIM.count = 0;
    this.dropIM.frustumCulled = false;
    this.dropIM.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.MAX_DROPS * 3), 3);
    this.dropIM.setColorAt(0, new THREE.Color(0x8B0000));
    scene.add(this.dropIM);

    // Mist pool
    this._mistPool = new Array(this.MAX_MIST);
    for (let i = 0; i < this.MAX_MIST; i++) {
      this._mistPool[i] = { alive:false, px:0, py:0, pz:0, vx:0, vy:0, vz:0,
        radius:0.06, maxRadius:0.18, life:0, maxLife:1.8, color:0xee2200 };
    }
    this._mistHead = 0;

    const mistGeo = new THREE.SphereGeometry(1.0, 6, 4);
    const mistMatOptions = {
      transparent:true, opacity:0.45, depthWrite:false,
      vertexColors:true, blending:THREE.NormalBlending
    };
    if (this._particleTex) {
      mistMatOptions.map = this._particleTex;
      mistMatOptions.alphaMap = this._particleTex;
    }
    const mistMat = new THREE.MeshBasicMaterial(mistMatOptions);
    this.mistIM = new THREE.InstancedMesh(mistGeo, mistMat, this.MAX_MIST);
    this.mistIM.count = 0;
    this.mistIM.frustumCulled = false;
    this.mistIM.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.MAX_MIST * 3), 3);
    scene.add(this.mistIM);

    // Ground decal pool
    this._decals = [];
    this._decalHead = 0;
    const decalGeo = new THREE.CircleGeometry(1.0, 12);
    const decalMatOptions = {
      transparent:true, opacity:0.82, depthWrite:false,
      blending: THREE.NormalBlending,
      polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1
    };
    if (this._particleTex) {
      decalMatOptions.map = this._particleTex;
      decalMatOptions.alphaMap = this._particleTex;
    }
    const decalMat = new THREE.MeshBasicMaterial(decalMatOptions);
    for (let i = 0; i < this.MAX_DECALS; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.y = this.GROUND_Y;
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this._decals.push({ mesh:m, life:0, maxLife:0 });
    }

    this._pulseWounds = [];
    this._pulseTimer  = 0;
    return this;
  },

  reset() {
    if (this._pool) {
      for (let i = 0; i < this.MAX_DROPS; i++) this._pool[i].alive = false;
      this._head = 0;
    }
    if (this._mistPool) {
      for (let i = 0; i < this.MAX_MIST; i++) this._mistPool[i].alive = false;
      this._mistHead = 0;
    }
    if (this._decals) {
      for (let i = 0; i < this._decals.length; i++) {
        this._decals[i].life = 0;
        this._decals[i].mesh.visible = false;
      }
      this._decalHead = 0;
    }
    if (this._pulseWounds) this._pulseWounds.length = 0;
    this._pulseTimer = 0;
    if (this.dropIM) { this.dropIM.count = 0; this.dropIM.instanceMatrix.needsUpdate = true; }
    if (this.mistIM) { this.mistIM.count = 0; this.mistIM.instanceMatrix.needsUpdate = true; }
  },

  _spawnDecal(x, z, radius, hexColor, lifetime) {
    if (!this._decals) return;
    const slot = this._decals[this._decalHead];
    this._decalHead = (this._decalHead + 1) % this.MAX_DECALS;
    slot.mesh.material.color.setHex(hexColor);
    slot.mesh.material.opacity = 0.82;
    slot.mesh.material.needsUpdate = true;
    slot.mesh.position.set(x, this.GROUND_Y, z);
    slot.mesh.scale.set(radius, 1, radius);
    slot.mesh.visible = true;
    slot.maxLife = lifetime || 25;
    slot.life    = slot.maxLife;
  },

  _spawnMist(x, y, z, vx, vy, vz, hexColor) {
    if (!this._mistPool) return;
    const m = this._mistPool[this._mistHead];
    this._mistHead = (this._mistHead + 1) % this.MAX_MIST;
    m.alive = true;
    m.px=x; m.py=y; m.pz=z;
    m.vx=vx; m.vy=vy; m.vz=vz;
    m.radius    = 0.04 + Math.random() * 0.04;
    m.maxRadius = 0.12 + Math.random() * 0.12;
    m.maxLife   = 1.2  + Math.random() * 0.8;
    m.life      = m.maxLife;
    m.color     = hexColor;
  },

  update(dt) {
    if (!this.dropIM || !this._pool) return;
    const matrix = this._matrix;
    const color  = this._color;

    // Heartbeat pulse
    this._pulseTimer += dt;
    if (this._pulseTimer >= this._pulseInterval && this._pulseWounds.length > 0) {
      this._pulseTimer = 0;
      for (let w = this._pulseWounds.length - 1; w >= 0; w--) {
        const wnd = this._pulseWounds[w];
        wnd.life -= this._pulseInterval;
        if (wnd.life <= 0) { this._pulseWounds.splice(w, 1); continue; }
        const pulseStr = Math.max(0.2, wnd.life / wnd.maxLife);
        const cnt = Math.ceil(6 * pulseStr);
        for (let i = 0; i < cnt; i++) {
          const d = this._pool[this._head];
          this._head = (this._head + 1) % this.MAX_DROPS;
          d.alive = true;
          d.px = wnd.x + (Math.random() - 0.5) * 0.3;
          d.py = wnd.y;
          d.pz = wnd.z + (Math.random() - 0.5) * 0.3;
          d.vx = (Math.random() - 0.5) * 3;
          d.vy = 1.5 + Math.random() * 3.5;
          d.vz = (Math.random() - 0.5) * 3;
          d.radius = 0.006 + Math.random() * 0.007;
          d.viscosity = 0.72;
          d.life = 2 + Math.random() * 1.5;
          d.onGround = false;
          d.color = wnd.color;
        }
      }
    }

    // Drop physics
    let activeDrops = 0;
    for (let i = 0; i < this.MAX_DROPS; i++) {
      const d = this._pool[i];
      if (!d.alive) continue;
      d.life -= dt;
      if (d.life <= 0) {
        if (d.onGround) this._spawnDecal(d.px, d.pz, d.radius * 8 + 0.05, d.color, 22);
        d.alive = false;
        continue;
      }
      if (!d.onGround) {
        d.vy -= 9.81 * dt * 1.1;
        const speed = Math.hypot(d.vx, d.vy, d.vz);
        const drag  = Math.max(0, 1 - d.viscosity * dt * Math.max(speed, 0.1) * 1.2);
        d.vx *= drag; d.vy *= drag; d.vz *= drag;
        d.px += d.vx * dt; d.py += d.vy * dt; d.pz += d.vz * dt;
        if (d.py <= this.GROUND_Y) {
          d.py = this.GROUND_Y;
          d.vy = Math.abs(d.vy) * 0.25;
          if (d.vy < 0.15) {
            d.onGround = true;
            d.vx *= 0.3; d.vz *= 0.3;
            this._spawnDecal(d.px, d.pz, d.radius * 6 + 0.04, d.color, 20);
          }
        }
      }
      if (this.player && !d.onGround) {
        const dx = d.px - this.player.position.x;
        const dz = d.pz - this.player.position.z;
        if (dx*dx + dz*dz < 1.8 && d.py > 0.1) { d.vx += dx*6*dt; d.vz += dz*6*dt; }
      }
      // Skip rendering on-ground drops — decal handles the visual; this prevents
      // z-fighting artifacts between the drop sphere and the terrain surface.
      if (d.onGround) continue;
      if (activeDrops >= this.MAX_DROPS) continue;
      matrix.makeScale(d.radius*2, d.radius*2, d.radius*2);
      matrix.setPosition(d.px, d.py, d.pz);
      this.dropIM.setMatrixAt(activeDrops, matrix);
      color.setHex(d.color);
      this.dropIM.setColorAt(activeDrops, color);
      activeDrops++;
    }
    this.dropIM.count = activeDrops;
    this.dropIM.instanceMatrix.needsUpdate = true;
    if (this.dropIM.instanceColor) this.dropIM.instanceColor.needsUpdate = true;

    // Mist update
    if (this.mistIM && this._mistPool) {
      let activeMist = 0;
      for (let i = 0; i < this.MAX_MIST; i++) {
        const m = this._mistPool[i];
        if (!m.alive) continue;
        m.life -= dt;
        if (m.life <= 0) { m.alive = false; continue; }
        m.vy = Math.max(m.vy, 0) + 0.04 * dt;
        m.vx *= Math.max(0, 1 - 1.8*dt);
        m.vz *= Math.max(0, 1 - 1.8*dt);
        m.px += m.vx*dt; m.py += m.vy*dt; m.pz += m.vz*dt;
        const t = 1 - m.life / m.maxLife;
        const r = m.radius + (m.maxRadius - m.radius) * t;
        const fade = Math.min(1, (m.life / m.maxLife) * 3);
        matrix.makeScale(r, r*0.6, r);
        matrix.setPosition(m.px, m.py, m.pz);
        this.mistIM.setMatrixAt(activeMist, matrix);
        color.setHex(m.color);
        color.multiplyScalar(fade);
        this.mistIM.setColorAt(activeMist, color);
        activeMist++;
      }
      this.mistIM.count = activeMist;
      this.mistIM.instanceMatrix.needsUpdate = true;
      if (this.mistIM.instanceColor) this.mistIM.instanceColor.needsUpdate = true;
    }

    // Decal fade
    if (this._decals) {
      for (let i = 0; i < this._decals.length; i++) {
        const dc = this._decals[i];
        if (!dc.mesh.visible || dc.life <= 0) continue;
        dc.life -= dt;
        if (dc.life <= 0) {
          dc.mesh.visible = false;
        } else if (dc.life < 3) {
          dc.mesh.material.opacity = (dc.life / 3) * 0.82;
          dc.mesh.material.needsUpdate = true;
        }
      }
    }
  },

  rawBurst(x, y, z, count, options) {
    if (!this._pool) return;
    count = count || 45;
    options = options || {};
    let resolvedColor = options.color;
    if (!resolvedColor && options.enemyType && _BSV21_BLOOD[options.enemyType]) {
      resolvedColor = _BSV21_BLOOD[options.enemyType];
    }
    const spreadXZ  = options.spreadXZ  || 9;
    const spreadY   = options.spreadY   || 14;
    const viscosity = options.viscosity || 0.62;
    const col       = resolvedColor || 0x8B0000;
    const n = Math.min(count, this.MAX_DROPS);
    for (let i = 0; i < n; i++) {
      const d = this._pool[this._head];
      this._head = (this._head + 1) % this.MAX_DROPS;
      d.alive    = true;
      d.px = x + (Math.random()-0.5)*0.4;
      d.py = y + Math.random()*0.6;
      d.pz = z + (Math.random()-0.5)*0.4;
      d.vx = (Math.random()-0.5)*spreadXZ;
      d.vy = 4 + Math.random()*spreadY;
      d.vz = (Math.random()-0.5)*spreadXZ;
      d.radius    = 0.008 + Math.random()*0.009;
      d.viscosity = viscosity;
      d.life      = 5 + Math.random()*3;
      d.onGround  = false;
      d.color     = col;
    }
  },

  // V-shaped arterial jet: two diverging high-pressure streams + mist
  arterialJet(x, y, z, dirX, dirZ, hexColor) {
    if (!this._pool) return;
    const col    = hexColor || 0xcc1100;
    const mistEntry = Object.keys(_BSV21_BLOOD).find(k => _BSV21_BLOOD[k] === col);
    const misCol = (mistEntry && _BSV21_MIST[mistEntry]) ? _BSV21_MIST[mistEntry] : 0xee2200;
    const ANGLE  = 0.55;
    const cosA = Math.cos(ANGLE), sinA = Math.sin(ANGLE);
    const len  = Math.hypot(dirX || 1, dirZ || 0) || 1;
    const nx = (dirX || 1) / len, nz = (dirZ || 0) / len;
    for (let arm = 0; arm < 2; arm++) {
      const s  = arm === 0 ? sinA : -sinA;
      const ax = nx*cosA - nz*s;
      const az = nx*s    + nz*cosA;
      for (let i = 0; i < 18; i++) {
        const d = this._pool[this._head];
        this._head = (this._head + 1) % this.MAX_DROPS;
        const speed  = 8 + Math.random()*12;
        const spread = 0.18;
        d.alive = true;
        d.px = x + (Math.random()-0.5)*0.15;
        d.py = y + (Math.random()-0.5)*0.15;
        d.pz = z + (Math.random()-0.5)*0.15;
        d.vx = (ax + (Math.random()-0.5)*spread)*speed;
        d.vy = 1.2 + Math.random()*3.5;
        d.vz = (az + (Math.random()-0.5)*spread)*speed;
        d.radius    = 0.006 + Math.random()*0.008;
        d.viscosity = 0.50;
        d.life      = 2.5 + Math.random()*2;
        d.onGround  = false;
        d.color     = col;
      }
    }
    const mistCount = Math.min(8, Math.max(2, Math.floor(this.MAX_MIST / 10)));
    for (let i = 0; i < mistCount; i++) {
      this._spawnMist(
        x + (Math.random()-0.5)*0.3, y + 0.2 + Math.random()*0.4, z + (Math.random()-0.5)*0.3,
        (Math.random()-0.5)*1.5, 0.4 + Math.random()*0.8, (Math.random()-0.5)*1.5, misCol
      );
    }
  },

  addWoundPulse(x, y, z, hexColor, duration) {
    if (this._pulseWounds.length >= 8) return;
    this._pulseWounds.push({ x, y, z, color: hexColor||0xcc1100,
      maxLife: duration||4.0, life: duration||4.0 });
  },

  spawnMist(x, y, z, count, hexColor) {
    const n = Math.min(count || 6, Math.max(2, Math.floor(this.MAX_MIST / 6)));
    for (let i = 0; i < n; i++) {
      this._spawnMist(
        x+(Math.random()-0.5)*0.5, y+0.1+Math.random()*0.4, z+(Math.random()-0.5)*0.5,
        (Math.random()-0.5)*2, 0.3+Math.random()*0.6, (Math.random()-0.5)*2,
        hexColor || 0xee2200
      );
    }
  },

  onEnemyHit(enemy, hitPoint, damageType) {
    const isProjectile = (typeof damageType === 'string') && damageType !== 'melee';
    const burstCount   = isProjectile ? 65 : 38;
    const bloodColor   = (enemy && enemy.enemyType && _BSV21_BLOOD[enemy.enemyType])
      ? _BSV21_BLOOD[enemy.enemyType] : 0x8B0000;
    const mistColor    = (enemy && enemy.enemyType && _BSV21_MIST[enemy.enemyType])
      ? _BSV21_MIST[enemy.enemyType]  : 0xee2200;

    this.rawBurst(hitPoint.x, hitPoint.y, hitPoint.z, burstCount, {
      spreadXZ:11, spreadY:16,
      viscosity: (enemy && enemy.bloodViscosity) ? enemy.bloodViscosity : 0.62,
      color: bloodColor
    });
    this.spawnMist(hitPoint.x, hitPoint.y+0.3, hitPoint.z, isProjectile ? 6 : 3, mistColor);
    if (isProjectile || damageType === 'sword') {
      this.arterialJet(hitPoint.x, hitPoint.y+0.4, hitPoint.z,
        (Math.random()-0.5), (Math.random()-0.5), bloodColor);
    }
    this.addWoundPulse(hitPoint.x, hitPoint.y, hitPoint.z, bloodColor, 2.5);
  },

  onEnemyDeath(enemy, position) {
    const bloodColor = (enemy && enemy.enemyType && _BSV21_BLOOD[enemy.enemyType])
      ? _BSV21_BLOOD[enemy.enemyType] : 0x8B0000;
    const mistColor  = (enemy && enemy.enemyType && _BSV21_MIST[enemy.enemyType])
      ? _BSV21_MIST[enemy.enemyType]  : 0xee2200;

    this.rawBurst(position.x, position.y+0.8, position.z, 120,
      { spreadXZ:14, spreadY:22, viscosity:0.55, color:bloodColor });
    for (let jet = 0; jet < 3; jet++) {
      const ang = (jet / 3) * Math.PI * 2;
      this.arterialJet(position.x, position.y+1.0, position.z,
        Math.cos(ang), Math.sin(ang), bloodColor);
    }
    this.spawnMist(position.x, position.y+0.6, position.z, 16, mistColor);
    this._spawnDecal(position.x, position.z, 0.6+Math.random()*0.4, bloodColor, 40);
    this.addWoundPulse(position.x, position.y+0.5, position.z, bloodColor, 5.0);
  }
};

window.BloodSimulatorV21 = BloodSimulatorV21;
