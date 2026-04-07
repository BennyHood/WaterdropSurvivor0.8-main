// js/projectile-classes.js — Companion, Projectile, SwordSlash, IceSpear, Meteor, ObjectPool, and Particle classes.
// Handles all projectile movement, collision setup, and visual effects.
// Depends on: THREE (CDN), variables from main.js

    // Module-scoped temp vector — avoids per-frame allocation in Projectile.update()
    const _tmpEnemyProjMove = new THREE.Vector3();

    // Companion skill tuning constants
    const _COMPANION_MIN_FIRE_RATE_MULT = 0.30; // Minimum fire rate multiplier after skills
    const _COMPANION_MULTI_SHOT_RANGE_SQ = 100;  // 10 units squared — range for multi-shot targeting

    // ── Gem type helpers ─────────────────────────────────────────────────────
    /** Returns true if the currently equipped weapon has a slotted gem of the given type. */
    function _weaponHasGemType(type) {
      if (!saveData || !saveData.cutGems || !saveData.equippedGear) return false;
      const weaponId = saveData.equippedGear.weapon;
      if (!weaponId || !saveData.weaponGemSlots || !saveData.weaponGemSlots[weaponId]) return false;
      for (const gemId of saveData.weaponGemSlots[weaponId]) {
        if (!gemId) continue;
        const gem = saveData.cutGems.find(g => g.id === gemId);
        if (gem && gem.type === type) return true;
      }
      return false;
    }

    /** Returns the first slotted gem type for the given companion, or null. */
    function _companionFirstGemType(companionId) {
      if (!saveData || !saveData.cutGems || !saveData.companionGemSlots) return null;
      const slots = saveData.companionGemSlots[companionId];
      if (!slots) return null;
      for (const gemId of slots) {
        if (!gemId) continue;
        const gem = saveData.cutGems.find(g => g.id === gemId);
        if (gem) return gem.type;
      }
      return null;
    }

    /** Counts how many gems are slotted in a companion (for scale boost). */
    function _companionGemCount(companionId) {
      if (!saveData || !saveData.companionGemSlots) return 0;
      const slots = saveData.companionGemSlots[companionId];
      if (!slots) return 0;
      return slots.filter(id => !!id).length;
    }

    /** Maps gem type to a particle colour hex. */
    const _GEM_PARTICLE_COLORS = {
      ruby:    0xFF3322,
      sapphire:0x4488FF,
      emerald: 0x22EE66,
      void:    0xCC44FF
    };

    class Companion {
      constructor(companionId) {
        this.companionId = companionId;
        this.data = COMPANIONS[companionId];
        this.companionData = saveData.companions[companionId];
        
        // Stats based on level
        const isEvolved = this.companionData.level >= 10;
        const stats = isEvolved ? this.data.evolvedStats : this.data.baseStats;
        
        this.damage = stats.damage;
        this.attackSpeed = stats.attackSpeed;
        this.maxHp = stats.health;
        this.hp = this.maxHp;
        this.isDead = false;
        this.respawnTimer = 0;
        this.lastAttackTime = 0;
        
        // Animation state
        this._animState = 'idle'; // idle, walk, attack
        this._animTime = 0;
        this._attackAnimTimer = 0;
        this._baseScale = 1;
        
        // Growth stage scaling: newborn=0.5, juvenile=0.7, adult/default=1.0
        const growthStage = saveData.companionGrowthStage || 'adult';
        if (growthStage === 'newborn') {
          this._baseScale = 0.5;
        } else if (growthStage === 'juvenile') {
          this._baseScale = 0.7;
        } else {
          this._baseScale = 1.0;
        }

        // Gem enhancement: each slotted gem grows the companion slightly (+0.1 per gem, capped at +0.3)
        const _gemBoost = Math.min(_companionGemCount(companionId) * 0.1, 0.3);
        this._baseScale += _gemBoost;
        // Store the dominant gem type for plasma colour changes
        this._slottedGemType = _companionFirstGemType(companionId);

        // Create visual representation — shape and color based on companion type
        const size = 0.8 * this._baseScale;
        let mesh;
        if (this.companionId === 'greyAlien') {
          // Grey Alien — tall head, small body, green-grey
          const group = new THREE.Group();
          const headGeo = new THREE.SphereGeometry(size * 0.5, 8, 8);
          headGeo.scale(1, 1.3, 0.9);
          const headMat = new THREE.MeshPhongMaterial({
            color: 0x90A090,
            emissive: 0x485048,
            emissiveIntensity: 0.15,
            shininess: 30
          });
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.y = size * 0.5;
          head.castShadow = false;
          group.add(head);
          // Eyes (large black)
          const eyeGeo = new THREE.SphereGeometry(size * 0.12, 6, 6);
          const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
          const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
          eyeL.position.set(-size * 0.15, size * 0.55, size * 0.3);
          eyeL.scale.set(1, 1.4, 0.6);
          group.add(eyeL);
          const eyeR = eyeL.clone();
          eyeR.position.x = size * 0.15;
          group.add(eyeR);
          // Small body
          const bodyGeo = new THREE.CylinderGeometry(size * 0.2, size * 0.15, size * 0.5, 6);
          const bodyMat = new THREE.MeshPhongMaterial({
            color: 0x708070,
            emissive: 0x384038,
            emissiveIntensity: 0.15,
            shininess: 30
          });
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = size * 0.05;
          body.castShadow = false;
          group.add(body);
          mesh = group;
          mesh._isGroup = true;
          mesh.castShadow = false;
        } else if (this.companionId === 'stormWolf') {
          // Storm Wolf — brown blocky wolf shape
          const group = new THREE.Group();
          const bodyGeo = new THREE.BoxGeometry(size * 1.2, size * 0.6, size * 0.5);
          const bodyMat = new THREE.MeshPhongMaterial({
            color: 0x8B4513,
            emissive: 0x452309,
            emissiveIntensity: 0.15,
            shininess: 25
          });
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = size * 0.3;
          body.castShadow = false;
          group.add(body);
          const headGeo = new THREE.BoxGeometry(size * 0.4, size * 0.35, size * 0.35);
          const head = new THREE.Mesh(headGeo, bodyMat);
          head.position.set(size * 0.6, size * 0.45, 0);
          head.castShadow = false;
          group.add(head);
          mesh = group;
          mesh._isGroup = true;
          mesh.castShadow = false;
        } else {
          // Default fallback — colored box
          const geo = new THREE.BoxGeometry(size, size, size);
          const matColor = this.data.type === 'melee' ? 0x8B4513 :
                   this.data.type === 'ranged' ? 0x4169E1 : 0x00CED1;
          const mat = new THREE.MeshPhongMaterial({
            color: matColor,
            emissive: matColor,
            emissiveIntensity: 0.15,
            shininess: 30
          });
          mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        }
        this.mesh = mesh;
        scene.add(this.mesh);
        
        // Position near player
        this.mesh.position.copy(player.mesh.position);
        this.mesh.position.x += 2;
      }
      
      update(dt) {
        if (this.isDead) {
          this.respawnTimer -= dt;
          if (this.respawnTimer <= 0) {
            this.respawn();
          }
          return;
        }
        
        if (!player || !player.mesh) return;
        
        this._animTime += dt;
        
        // Follow player with simple AI
        const dx = player.mesh.position.x - this.mesh.position.x;
        const dz = player.mesh.position.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // Keep distance from player (melee closer, others farther)
        const targetDist = this.data.type === 'melee' ? 2 : 3;
        let isMoving = false;
        
        if (dist > targetDist + 0.5) {
          // Move toward player
          const moveSpeed = 0.15;
          this.mesh.position.x += (dx / dist) * moveSpeed;
          this.mesh.position.z += (dz / dist) * moveSpeed;
          isMoving = true;
        } else if (dist < targetDist - 0.5) {
          // Move away from player
          const moveSpeed = 0.1;
          this.mesh.position.x -= (dx / dist) * moveSpeed;
          this.mesh.position.z -= (dz / dist) * moveSpeed;
          isMoving = true;
        }
        
        // Attack nearest enemy
        const now = Date.now();
        // FireRate skill reduces cooldown: each level = -15% attack speed
        const fireRateLevel = (this.companionData.skills && this.companionData.skills.fireRate) || 0;
        const fireRateMult = 1 - fireRateLevel * 0.15;
        if (enemies.length > 0 && now - this.lastAttackTime > this.attackSpeed * 1000 * Math.max(_COMPANION_MIN_FIRE_RATE_MULT, fireRateMult)) {
          let nearest = null;
          let nearestDist = Infinity;
          
          for (const enemy of enemies) {
            if (enemy.isDead) continue; // Skip dead enemies
            if (!enemy.mesh) continue; // Skip enemies with no mesh (cleaned up)
            // Use mesh position (root/center of enemy) to avoid targeting severed segments
            const _ePos = enemy.mesh.position;
            const ex = _ePos.x - this.mesh.position.x;
            const ez = _ePos.z - this.mesh.position.z;
            const d = ex*ex + ez*ez;
            if (d < nearestDist && d < _COMPANION_MULTI_SHOT_RANGE_SQ) { // Range check
              nearestDist = d;
              nearest = enemy;
            }
          }
          
          if (nearest) {
            // Attack — apply Damage skill: each level = +20% damage
            const damageLevel = (this.companionData.skills && this.companionData.skills.damage) || 0;
            const damageMultiplier = (1 + (this.companionData.level - 1) * 0.1) * (1 + damageLevel * 0.20);
            const finalDamage = Math.floor(this.damage * damageMultiplier * playerStats.strength);
            nearest.takeDamage(finalDamage, false, 'physical');
            // Plasma bolt colour: use gem tint when a gem is slotted, otherwise default green
            const _plasmaColor = (_GEM_PARTICLE_COLORS[this._slottedGemType] ?? 0x00FF88);
            spawnParticles(nearest.mesh.position, _plasmaColor, 3);
            this.lastAttackTime = now;
            this._animState = 'attack';
            this._attackAnimTimer = 0.25;

            // MultiShot skill: each level fires 1 additional bolt at a nearby enemy
            const multiShotLevel = (this.companionData.skills && this.companionData.skills.multiShot) || 0;
            if (multiShotLevel > 0 && this.companionId === 'greyAlien') {
              let shotsFired = 0;
              for (const enemy of enemies) {
                if (enemy.isDead || enemy === nearest || shotsFired >= multiShotLevel) continue;
                if (!enemy.mesh) continue; // Skip enemies with no mesh
                const ex = enemy.mesh.position.x - this.mesh.position.x;
                const ez = enemy.mesh.position.z - this.mesh.position.z;
                if (ex*ex + ez*ez < _COMPANION_MULTI_SHOT_RANGE_SQ) {
                  enemy.takeDamage(Math.floor(finalDamage * 0.6), false, 'physical');
                  spawnParticles(enemy.mesh.position, _plasmaColor, 2);
                  shotsFired++;
                }
              }
            }
          }
        }
        
        // Update animation state
        if (this._attackAnimTimer > 0) {
          this._attackAnimTimer -= dt;
          this._animState = 'attack';
        } else if (isMoving) {
          this._animState = 'walk';
        } else {
          this._animState = 'idle';
        }
        
        // Apply animation based on state
        const baseY = 0.4 * this._baseScale;
        const s = this._baseScale;
        const hasMaterial = this.mesh.material && this.mesh.material.emissive;
        if (this._animState === 'attack') {
          // Attack animation: quick scale pulse and slight lunge
          const t = this._attackAnimTimer / 0.25;
          const pulse = 1 + Math.sin(t * Math.PI) * 0.3;
          this.mesh.scale.set(s * pulse, s * pulse, s * pulse);
          this.mesh.position.y = baseY + 0.1;
          if (hasMaterial) {
            this.mesh.material.emissive.setHex(0xFF4400);
            this.mesh.material.emissiveIntensity = t * 0.8;
          }
        } else if (this._animState === 'walk') {
          // Walk animation: bouncy hop movement
          const bounce = Math.abs(Math.sin(this._animTime * 8)) * 0.2;
          const tilt = Math.sin(this._animTime * 8) * 0.15;
          this.mesh.position.y = baseY + bounce;
          this.mesh.scale.set(s, s * (1 + bounce * 0.3), s);
          this.mesh.rotation.z = tilt;
          if (hasMaterial) this.mesh.material.emissiveIntensity = 0;
        } else {
          // Idle animation: gentle bob and breathe
          const bob = Math.sin(this._animTime * 2.5) * 0.08;
          const breathe = 1 + Math.sin(this._animTime * 2) * 0.04;
          this.mesh.position.y = baseY + bob;
          this.mesh.scale.set(s * breathe, s / breathe, s * breathe);
          this.mesh.rotation.z = 0;
          if (hasMaterial) this.mesh.material.emissiveIntensity = 0;
        }
      }
      
      takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
          this.die();
        }
      }
      
      die() {
        this.isDead = true;
        this.mesh.visible = false;
        this.respawnTimer = 10; // 10 second respawn
        createFloatingText('Companion down!', this.mesh.position, '#FF6347');
      }
      
      respawn() {
        this.isDead = false;
        this.hp = this.maxHp;
        this.mesh.visible = true;
        this.mesh.position.copy(player.mesh.position);
        this.mesh.position.x += 2;
        createFloatingText('Companion respawned!', this.mesh.position, '#00FF00');
      }
      
      addXP(amount) {
        // Companions gain 10% of all XP awarded to the player
        const companionXP = Math.floor(amount * 0.1);
        this.companionData.xp += companionXP;
        
        // Level up check (simplified progression)
        const xpRequired = [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000];
        if (this.companionData.level < 10 && this.companionData.xp >= xpRequired[this.companionData.level]) {
          this.companionData.level++;
          saveData.companions[this.companionId] = this.companionData;
          // Award companion skill point on level up
          saveData.companionSkillPoints = (saveData.companionSkillPoints || 0) + 1;
          saveSaveData();
          
          if (this.companionData.level === 10) {
            createFloatingText('⭐ COMPANION EVOLVED! ⭐', this.mesh.position, '#FFD700');
            // Update stats to evolved form
            const stats = this.data.evolvedStats;
            this.damage = stats.damage;
            this.attackSpeed = stats.attackSpeed;
            this.maxHp = stats.health;
            this.hp = this.maxHp;
          } else {
            createFloatingText(`Level ${this.companionData.level}! +1 SP`, this.mesh.position, '#00FF00');
          }
        }
      }
      
      destroy() {
        scene.remove(this.mesh);
        if (this.mesh._isGroup) {
          this.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        } else {
          if (this.mesh.geometry) this.mesh.geometry.dispose();
          if (this.mesh.material) this.mesh.material.dispose();
        }
      }

      // Companion special skills — each companion has unique skills
      static COMPANION_SKILLS = {
        greyAlien: [
          { id: 'energy_burst', icon: '💫', name: 'Energy Burst', cooldown: 8000, desc: 'AoE energy blast around companion' },
          { id: 'phase_shift', icon: '👻', name: 'Phase Shift', cooldown: 15000, desc: 'Companion becomes invulnerable 3s' },
          { id: 'mind_control', icon: '🧠', name: 'Mind Control', cooldown: 20000, desc: 'Confuses nearest enemy for 5s' }
        ],
        stormWolf: [
          { id: 'howl', icon: '🌙', name: 'Battle Howl', cooldown: 10000, desc: 'Buffs player damage 20% for 5s' },
          { id: 'pounce', icon: '🐾', name: 'Pounce', cooldown: 6000, desc: 'Leaps to nearest enemy, heavy damage' },
          { id: 'pack_call', icon: '🐺', name: 'Pack Call', cooldown: 25000, desc: 'Summons ghost wolves to fight 8s' }
        ],
        skyFalcon: [
          { id: 'dive_bomb', icon: '💨', name: 'Dive Bomb', cooldown: 7000, desc: 'Dives at enemy for 3x damage' },
          { id: 'wind_gust', icon: '🌪️', name: 'Wind Gust', cooldown: 12000, desc: 'Pushes enemies away from player' },
          { id: 'eagle_eye', icon: '👁️', name: 'Eagle Eye', cooldown: 18000, desc: 'Marks all enemies, +25% crit 6s' }
        ],
        waterSpirit: [
          { id: 'heal_wave', icon: '💚', name: 'Heal Wave', cooldown: 10000, desc: 'Heals player for 30% max HP' },
          { id: 'frost_nova', icon: '❄️', name: 'Frost Nova', cooldown: 14000, desc: 'Freezes all nearby enemies 3s' },
          { id: 'tidal_shield', icon: '🛡️', name: 'Tidal Shield', cooldown: 20000, desc: 'Absorbs next 50 damage for 8s' }
        ]
      };

      // Update the companion skill buttons in HUD
      static MAX_COMPANION_SKILLS = 2;

      static updateCompanionSkillsUI(companionId) {
        var skills = Companion.COMPANION_SKILLS[companionId] || [];
        for (var i = 0; i < Companion.MAX_COMPANION_SKILLS; i++) {
          var btn = document.getElementById('comp-skill-' + (i + 1));
          if (!btn) continue;
          if (i < skills.length) {
            btn.textContent = skills[i].icon;
            btn.title = skills[i].name + ': ' + skills[i].desc;
            btn.style.display = '';
            btn.classList.remove('comp-empty');
          } else {
            btn.textContent = '⬡';
            btn.title = 'Empty companion slot';
            btn.style.display = '';
            btn.classList.add('comp-empty');
          }
        }
      }
    }

    class Projectile {
      constructor(x, z, target) {
        // Use globally shared geometry to prevent VRAM exhaustion from per-bullet allocations.
        // The bullet pool creates a fixed number of these (60 slots), not one per shot.
        // SHARED_GEO.sphere and SHARED_MAT.bullet are defined in enemy-class.js and exposed
        // on window for cross-module access.
        const _sharedGeo = (window.SHARED_GEO && window.SHARED_GEO.sphere) || new THREE.SphereGeometry(0.12, 6, 6);
        const _sharedBulletMat = (window.SHARED_MAT && window.SHARED_MAT.bullet) || new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.mesh = new THREE.Mesh(_sharedGeo, _sharedBulletMat.clone()); // clone for per-bullet opacity

        // Glow uses the same shared sphere geometry with a separate cloned material
        // so that glow opacity fades independently from the bullet core.
        const _glowMat = _sharedBulletMat.clone();
        _glowMat.opacity = 0.4;
        this.glow = new THREE.Mesh(_sharedGeo, _glowMat);

        this.speed = 1.8 * (window._projSpeedMultiplier || 1.0); // increased base speed for snappy feel
        // active starts false; reinit() sets it true.  Pool createFn creates with no args so
        // the projectile stays inactive until _spawnProjectile() calls reinit().
        this.active = false;
        this._usesInstancing = false;
        this._isPooled = false; // Set true by the projectile pool's createFn
        
        // hitEnemies is allocated once per pool slot and cleared in reinit() — NOT recreated
        // per shot.  This is intentional: creating it here (constructor) is the correct place
        // so pooled objects always have a reusable Set.
        this.hitEnemies = new Set();
        this.maxHits = 1;

        // Initialise immediately when coordinates are provided (non-pooled path)
        if (x !== undefined) {
          this.reinit(x, z, target);
        }
      }

      /**
       * (Re)initialise a projectile for a new shot.  Called by the pool helper
       * _spawnProjectile() and also by the constructor when used directly.
       * @param {number} x  - Start X world position
       * @param {number} z  - Start Z world position
       * @param {{x:number, z:number}} target - Direction target
       * @returns {Projectile} this (for chaining)
       */
      reinit(x, z, target) {
        this.active = true;
        this.life = 60;
        this.maxLife = 60;
        this.hitEnemies.clear();
        this.maxHits = (playerStats.pierceCount || 0) + 1;
        // Reset per-shot flags so pooled objects don't carry stale state
        this.isDoubleBarrel = false;
        this.isDroneTurret = false;
        this.isSniperRifle = false;
        this.isEnemyProjectile = false;
        this.isBoomerang = false;
        this.returnPhase = false;
        this.isShuriken = false;
        this.isBow = false;
        this.isFireball = false;
        this.pierceCount = 0;
        this.explosionRadius = 0;
        this.hitRadius = 0.3; // Radius used for collision detection

        // Reset mesh state — use the cached material colour (soft yellow/white glow).
        this.mesh.position.set(x, 0.5, z);
        // Compact elongated scale for a tight, fast-looking bullet
        this.mesh.scale.set(0.3, 0.3, 0.5);
        this.mesh.material.opacity = 0.95;
        this.mesh.visible = true;
        // Trail frame counter — emit a tracer every 2-3 frames
        this._trailFrame = 0;

        if (this.glow) {
          this.glow.position.copy(this.mesh.position);
          this.glow.scale.set(1, 1, 1);
          this.glow.material.opacity = 0.4;
          this.glow.visible = true;
        }

        // Determine rendering mode: instanced renderer handles the draw call,
        // so the individual mesh must NOT be added to the scene as well.
        if (window._instancedRenderer && window._instancedRenderer.active) {
          this._usesInstancing = true;
        } else {
          this._usesInstancing = false;
          scene.add(this.mesh);
          if (this.glow) scene.add(this.glow);
        }

        // Calculate direction
        const dx = target.x - x;
        const dz = target.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        // Re-apply speed multiplier each shot so pooled projectiles pick up upgrades
        // Base speed 1.8 — fast, snappy bullets that feel responsive; upgrade multiplier stacks on top
        this.speed = 1.8 * (window._projSpeedMultiplier || 1.0);
        this.vx = (dx / dist) * this.speed;
        this.vz = (dz / dist) * this.speed;

        // Orient the cylinder to face the travel direction
        // The geometry is pre-rotated 90° around Z so it lies along +X.
        // Setting rotation.y = atan2(vx, vz) points +X toward the velocity vector.
        this.mesh.rotation.y = Math.atan2(this.vx, this.vz);

        return this;
      }

      update() {
        if (!this.active) return false;
        
        // Handle enemy projectiles separately
        if (this.isEnemyProjectile) {
          // Zero-allocation move: reuse module-scoped temp vector
          _tmpEnemyProjMove.copy(this.direction).multiplyScalar(this.speed);
          this.mesh.position.add(_tmpEnemyProjMove);
          this.lifetime--;
          
          if (this.lifetime <= 0) {
            this.destroy();
            return false;
          }
          
          // Check collision with player
          const dx = this.mesh.position.x - player.mesh.position.x;
          const dz = this.mesh.position.z - player.mesh.position.z;
          if (dx*dx + dz*dz < 0.8) { // Hit radius
            // Kinetic Mirror: 10% chance to reflect back at 300% speed
            if (window._nmKineticMirror && !this._reflected && Math.random() < 0.10) {
              this._reflected = true;
              this.isEnemyProjectile = false; // Now a player-owned projectile
              // Reverse direction at 3× speed
              this.vx = -this.direction.x * this.speed * 3.0;
              this.vz = -this.direction.z * this.speed * 3.0;
              this.speed *= 3.0;
              // Tint mesh cyan to signal reflection
              if (this.mesh && this.mesh.material) {
                this.mesh.material.color && this.mesh.material.color.setHex(0x00ffcc);
              }
              if (typeof spawnParticles === 'function') {
                spawnParticles(this.mesh.position, 0x00ffcc, 6);
              }
              return true;
            }
            player.takeDamage(this.damage);
            spawnParticles(player.mesh.position, 0xFF6347, 5);
            this.destroy();
            playSound('hit');
            return false;
          }
          return true;
        }
        
        // Player projectiles
        this.mesh.position.x += this.vx;
        this.mesh.position.z += this.vz;
        
        // Keep hot static color — no transition; bullets are lethal and fast.
        // Glow fades out gently as the bullet ages.
        if (this.glow) {
          this.glow.position.copy(this.mesh.position);
          this.glow.material.opacity = 0.4 * (this.life / (this.maxLife || 60));
        }

        // TRACER TRAIL: every 2-3 frames, drop a tiny fading sphere at current position.
        this._trailFrame = (this._trailFrame || 0) + 1;
        if (this._trailFrame % 3 === 0 && window.bulletTrails) {
          // Red gem: override trail colour with fiery red
          const trailColor = _weaponHasGemType('ruby')
            ? 0xFF2200
            : this.mesh.material.color.getHex();
          // Use the global object pool to avoid per-frame geometry/material allocation.
          let trailMesh;
          if (window.GameObjectPool) {
            const _poolEntry = window.GameObjectPool.getTrail(trailColor, this.mesh.position);
            trailMesh = _poolEntry.mesh;
            trailMesh._poolEntry = _poolEntry;
          } else {
            const trailGeo = new THREE.SphereGeometry(0.035, 4, 4);
            const trailMat = new THREE.MeshBasicMaterial({ color: trailColor, transparent: true, opacity: 0.55 });
            trailMesh = new THREE.Mesh(trailGeo, trailMat);
            trailMesh.position.copy(this.mesh.position);
          }
          scene.add(trailMesh);
          // Expire after ~150ms (≈9 frames at 60fps)
          window.bulletTrails.push({ mesh: trailMesh, life: 9 });
        }
        
        this.life--;

        if (this.life <= 0) {
          this.destroy();
          return false;
        }

        // Collision Check - with piercing support
        // Brute-force distance check: bullets move fast (tunneling prevention via hitRadius)
        for (let i = 0; i < enemies.length; i++) {
          const enemy = enemies[i];
          if (!enemy) continue;
          if (!enemy.active || enemy.isDead) continue;
          if (!enemy.mesh) continue; // Guard: mesh disposed or instancing active
          if (this.hitEnemies.has(enemy)) continue; // Skip already-hit enemies

          const distSq = (this.mesh.position.x - enemy.mesh.position.x) ** 2 + (this.mesh.position.z - enemy.mesh.position.z) ** 2;
          const hitThreshold = (enemy.hitRadius || 0.7) * (enemy.hitRadius || 0.7) + (this.hitRadius || 0.3) * (this.hitRadius || 0.3);
          if (distSq < hitThreshold) {
            // Calculate Damage
            // Reflected projectiles deal their original damage (stored in this.damage)
            let dmg = this._reflected
              ? (this.damage || 15)
              : weapons.gun.damage * playerStats.damage * playerStats.strength;
            
            // Double barrel uses its own damage
            if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
              dmg = weapons.doubleBarrel.damage * playerStats.damage * playerStats.strength;
            }
            
            // Drone turret uses its own damage
            if (weapons.droneTurret.active && this.isDroneTurret) {
              dmg = weapons.droneTurret.damage * playerStats.damage * playerStats.strength;
            }

            // Rage Mode damage boost
            if (player && player._rageDamageMult && player._rageDamageMult > 1) {
              dmg *= player._rageDamageMult;
            }
            
            // HEADSHOT SYSTEM: Double-crit check for headshot (instant kill)
            const isCrit = Math.random() < playerStats.critChance;
            const isDoubleCrit = isCrit && Math.random() < playerStats.critChance; // Second crit check
            
            if (isDoubleCrit && playerStats.headshotUnlocked) {
              // HEADSHOT! Instant kill — set hp to 1 then call takeDamage with 'headshot' type
              // so die() triggers with correct damageType for headshot death animation
              enemy.hp = 1;
              enemy.takeDamage(9999, true, 'headshot');
              // Hit-stop: headshots deserve the longest freeze
              if (window.triggerHitStop) window.triggerHitStop(80);
              
              // Create floating HEADSHOT text - THINNER FONT
              const div = document.createElement('div');
              div.style.position = 'absolute';
              div.style.color = '#FF0000';
              div.style.fontSize = '32px';
              div.style.fontWeight = '500'; // Reduced from 600 to 500 for thinner font
              div.style.fontFamily = 'Bangers, cursive';
              div.style.textShadow = '0 0 20px #FF0000, 2px 2px 4px #000';
              div.style.pointerEvents = 'none';
              div.style.zIndex = '1000';
              div.innerText = 'HEADSHOT!';
              if (window.pushSuperStatEvent) window.pushSuperStatEvent('HEADSHOT!', 'legendary', '\uD83C\uDFAF', 'success');
              
              const vec = enemy.mesh.position.clone();
              vec.y += 2;
              vec.project(camera);
              
              // Convert NDC (-1 to 1) to screen coordinates (0 to width/height)
              const NDC_CENTER_OFFSET = 0.5; // Offset to center NDC coordinates
              const x = (vec.x * NDC_CENTER_OFFSET + NDC_CENTER_OFFSET) * window.innerWidth;
              const y = (-(vec.y * NDC_CENTER_OFFSET) + NDC_CENTER_OFFSET) * window.innerHeight;
              
              div.style.left = `${x}px`;
              div.style.top = `${y}px`;
              div.style.transform = 'translate(-50%, -50%)';
              
              document.body.appendChild(div);
              setTimeout(() => div.remove(), 1500);
              
              // Blood particle effect
              spawnParticles(enemy.mesh.position, 0x8B0000, 30); // Dark red blood
              spawnParticles(enemy.mesh.position, 0xFF0000, 20); // Bright red blood
              // Advanced headshot: pulsating blood spray (zero knockback, 180° spread)
              if (window.BloodSystem) {
                const headPos = enemy.mesh.position.clone();
                headPos.y += 0.7;
                window.BloodSystem.emitPulse(headPos, { pulses: 4, perPulse: 400, interval: 200, spreadXZ: 1.6 });
              }
              
              // Flash effect disabled — PointLights on standard projectiles are too expensive
              // (only explosions cast temporary light)
            } else if (isCrit) {
              // Normal crit
              dmg *= playerStats.critDmg;
              const critDmgType = this.isSniperRifle ? 'sniperRifle' : (this.isDroneTurret ? 'drone' : (this.isDoubleBarrel ? 'doubleBarrel' : 'gun'));
              enemy.takeDamage(Math.floor(dmg), isCrit, critDmgType, { vx: this.vx, vz: this.vz });
              // Hit-stop: critical hits get a short freeze for impact weight
              if (window.triggerHitStop) window.triggerHitStop(55);
              
              // FRESH: Critical hit effects - gold particles, brief light flash
              spawnParticles(enemy.mesh.position, 0xFFD700, 15); // Gold particles
              spawnParticles(enemy.mesh.position, 0xFFA500, 10); // Orange particles
              
              // Brief golden light flash disabled — PointLights on standard projectiles are too expensive
              // (only explosions cast temporary light)
            } else {
              // Normal hit — pass weapon-specific damageType for downstream effects
              const hitDmgType = this.isSniperRifle ? 'sniperRifle' : (this.isDroneTurret ? 'drone' : (this.isDoubleBarrel ? 'doubleBarrel' : 'gun'));
              enemy.takeDamage(Math.floor(dmg), false, hitDmgType, { vx: this.vx, vz: this.vz });
            }

            // ── Blue Gem (Sapphire): icy shatter particles replace standard sparks ──
            if (_weaponHasGemType('sapphire') && !enemy.isDead) {
              spawnParticles(enemy.mesh.position, 0x5588FF, 6); // Icy blue shards
              spawnParticles(enemy.mesh.position, 0xAADDFF, 4); // Frost glitter
            }

            // ── Corrupted Source Code: 1% chance to instantly delete a non-boss enemy ──
            if (_weaponHasGemType('corruptedSource') && !enemy.isDead &&
                !enemy.isMiniBoss && !enemy.isFlyingBoss && enemy.type !== 19 &&
                Math.random() < 0.01) {
              // Capture position before mesh removal to avoid null-ref in particle/text calls
              const _delPos = enemy.mesh ? enemy.mesh.position.clone() : null;
              // Instant deletion — no death animation, no blood, just gone with a BEEP
              enemy.isDead = true;
              enemy._deathTimestamp = Date.now();
              enemy._skipMainDeathAnim = true;
              if (enemy.mesh) scene.remove(enemy.mesh);
              if (enemy.groundShadow) { scene.remove(enemy.groundShadow); enemy.groundShadow = null; }
              if (_delPos) {
                if (typeof spawnParticles === 'function') {
                  spawnParticles(_delPos, 0x00FFFF, 6);
                }
                if (typeof createFloatingText === 'function') {
                  createFloatingText('DELETED', _delPos, '#00FFFF');
                }
              }
              if (typeof playSound === 'function') {
                try { playSound('glitch_delete'); } catch (e) { /* ignore */ }
              }
              // Count as a kill for stats
              if (typeof playerStats !== 'undefined') playerStats.kills = (playerStats.kills || 0) + 1;
              return false; // Destroy the projectile
            }
            
            // ── SNIPER: hit-stop for weight, no separate exit wound here
            // (exit wound is emitted via takeDamage() in enemy-class.js using the hitDir param)
            if (this.isSniperRifle && !enemy.isDead) {
              if (window.triggerHitStop) window.triggerHitStop(45);
            }
            
            // Knockback effect — drone: near zero; gun: reduced with level scaling; double barrel: heavy
            let knockbackForce;
            if (this.isDroneTurret) {
              const droneLevel = weapons.droneTurret ? (weapons.droneTurret.level || 1) : 1;
              // Drone L1/L2: near-zero knockback. L3: slight knockback (bullet penetration)
              knockbackForce = droneLevel >= 3 ? 0.12 : 0.02;
              // Level-based drone hit effects
              if (droneLevel === 1) {
                // L1: Slow enemy movement, fast wobble animation
                if (!enemy.isDead && !enemy.isFrozen) {
                  if (!enemy.originalSpeed) enemy.originalSpeed = enemy.speed;
                  // Always calculate from originalSpeed to prevent compounding slowdown
                  enemy.speed = (enemy.originalSpeed) * 0.5;
                  if (!enemy.slowedUntil || enemy.slowedUntil < Date.now() + 500) {
                    enemy.slowedUntil = Date.now() + 800; // Brief slow
                  }
                }
                // Small blood pools in front
                spawnBloodDecal({ x: enemy.mesh.position.x + this.vx * 0.5, y: 0, z: enemy.mesh.position.z + this.vz * 0.5 });
              } else if (droneLevel === 2) {
                // L2: Stop the enemy completely, fast shaking
                if (!enemy.isDead && !enemy.isFrozen) {
                  if (!enemy.originalSpeed) enemy.originalSpeed = enemy.speed;
                  enemy.slowedUntil = Date.now() + 400; // Brief full stop
                  enemy.speed = 0;
                  setTimeout(() => { if (enemy && !enemy.isDead) enemy.speed = enemy.originalSpeed || enemy.speed; }, 400);
                }
                // Rapid shaking animation
                if (enemy.mesh) {
                  // Clear any existing shake interval to prevent concurrent animations
                  if (enemy._droneShakeTimer) { clearInterval(enemy._droneShakeTimer); enemy._droneShakeTimer = null; }
                  let shakes = 0;
                  const sx = enemy.mesh.position.x, sz = enemy.mesh.position.z;
                  enemy._droneShakeTimer = setInterval(() => {
                    shakes++;
                    if (enemy.mesh) {
                      enemy.mesh.position.x = sx + (Math.random()-0.5)*0.08;
                      enemy.mesh.position.z = sz + (Math.random()-0.5)*0.08;
                    }
                    if (shakes >= 6) {
                      clearInterval(enemy._droneShakeTimer);
                      enemy._droneShakeTimer = null;
                      if (enemy.mesh) { enemy.mesh.position.x = sx; enemy.mesh.position.z = sz; }
                    }
                  }, 30);
                }
                // Large compact blood pool directly under enemy
                if (window.BloodSystem) {
                  window.BloodSystem.emitBurst(enemy.mesh.position, 25, { spreadXZ: 0.2, spreadY: 0.1, minLife: 15, maxLife: 25 });
                }
              } else if (droneLevel >= 3) {
                // L3: Slight knockback + penetration, rapid tiny exit spray
                const exitPos2 = new THREE.Vector3(
                  enemy.mesh.position.x + this.vx * 0.8,
                  enemy.mesh.position.y,
                  enemy.mesh.position.z + this.vz * 0.8
                );
                const bulletDir2 = new THREE.Vector3(this.vx, 0, this.vz).normalize();
                if (window.BloodSystem) {
                  window.BloodSystem.emitExitWound(exitPos2, bulletDir2, 15, { spread: 0.3, speed: 0.25 });
                }
              }
            } else if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
              // Double barrel: distance-based knockback — close range can send enemies flying/gliding
              const distToPlayer = Math.sqrt(
                (enemy.mesh.position.x - player.mesh.position.x) ** 2 +
                (enemy.mesh.position.z - player.mesh.position.z) ** 2
              );
              const closeRange = distToPlayer < 3.5;
              const medRange = distToPlayer < 7;
              knockbackForce = closeRange ? 0.9 : (medRange ? 0.48 : 0.24);
              knockbackForce *= (1 + (weapons.doubleBarrel.level - 1) * 0.15);
              
              if (closeRange && !enemy.isDead) {
                // Close range: enemy pushed back with realistic force
                const slideVX = this.vx * knockbackForce * 0.4;
                const slideVZ = this.vz * knockbackForce * 0.4;
                enemy._shotgunSlide = { vx: slideVX, vz: slideVZ, frames: 12, frame: 0 };
                // Topple/fall back animation
                enemy.mesh.rotation.x = -0.8 * Math.sign(this.vz || 0.5);
                enemy.mesh.scale.y = 0.5;
                setTimeout(() => {
                  if (enemy.mesh && !enemy.isDead) {
                    enemy.mesh.rotation.x = 0; enemy.mesh.rotation.z = 0;
                    enemy.mesh.scale.y = 1;
                  }
                }, 500);
              } else {
                // Mid/long range: stumble and topple
                const toppleAngle = (Math.random() - 0.5) * 0.6;
                enemy.mesh.rotation.x = toppleAngle;
                enemy.mesh.rotation.z = toppleAngle * 0.5;
                setTimeout(() => {
                  if (enemy.mesh && !enemy.isDead) { enemy.mesh.rotation.x = 0; enemy.mesh.rotation.z = 0; }
                }, 300);
              }
            } else {
              // Standard gun: reduced base force, scales up with weapon level
              knockbackForce = 0.3 * (1 + (weapons.gun.level - 1) * 0.2);
            }
            enemy.mesh.position.x += this.vx * knockbackForce * (1 + (playerStats.viscosity || 0));
            enemy.mesh.position.z += this.vz * knockbackForce * (1 + (playerStats.viscosity || 0));
            
            // ── Weapon-specific hit effects ──────────────────────────────────────
            if (this.isDroneTurret) {
              // Drone: constant tiny impacts — mesh twitches and small drips fall below
              const droneLevel = weapons.droneTurret.level || 1;
              // Twitching wobble (brief offset that snaps back)
              const twitch = 0.04 + droneLevel * 0.02;
              enemy.mesh.position.x += (Math.random() - 0.5) * twitch;
              enemy.mesh.position.z += (Math.random() - 0.5) * twitch;
              
              if (droneLevel >= 2) {
                // Level 2+: enemy freezes in place, violent shaking; rapid blood stream down front
                // Freeze in place briefly (handled via near-zero knockback)
                // Add 10-20 tiny entry holes rapidly
                const nowDrone = Date.now();
                if (!enemy._lastDroneHoleTime || nowDrone - enemy._lastDroneHoleTime > 60) {
                  enemy._lastDroneHoleTime = nowDrone;
                  if (!enemy.bulletHoles) enemy.bulletHoles = [];
                  ensureBulletHoleMaterials();
                  if (bulletHoleGeo && bulletHoleMat) {
                  const holesToAdd = droneLevel >= 3 ? 2 : 1;
                  for (let dh = 0; dh < holesToAdd && enemy.bulletHoles.length < 20; dh++) {
                    const dHole = new THREE.Mesh(bulletHoleGeo, bulletHoleMat.clone());
                    const th = Math.random() * Math.PI * 2;
                    const ph = Math.random() * Math.PI;
                    dHole.position.set(Math.sin(ph)*Math.cos(th)*0.51, Math.sin(ph)*Math.sin(th)*0.51, Math.cos(ph)*0.51);
                    dHole.lookAt(dHole.position.clone().multiplyScalar(2));
                    enemy.mesh.add(dHole);
                    enemy.bulletHoles.push(dHole);
                  }
                  }
                }
                // Blood streaming continuously down front of enemy
                if (bloodDrips.length < MAX_BLOOD_DRIPS) {
                  const streamDrop = new THREE.Mesh(
                    new THREE.SphereGeometry(0.025 + Math.random()*0.025, 4, 4),
                    new THREE.MeshBasicMaterial({ color: 0xAA0000 })
                  );
                  streamDrop.position.set(
                    enemy.mesh.position.x + (Math.random()-0.5)*0.3,
                    enemy.mesh.position.y + 0.4,
                    enemy.mesh.position.z + 0.45 // front face
                  );
                  scene.add(streamDrop);
                  bloodDrips.push({ mesh: streamDrop, velX: 0, velZ: 0, velY: -0.05, life: 35 + Math.floor(Math.random()*15) });
                }
                // Rapidly expanding blood pool
                spawnBloodDecal(enemy.mesh.position);
                // Fine blood mist along bullet line (simulates 15-20 tiny entry holes)
                if (window.BloodSystem) {
                  const _droneDir = new THREE.Vector3(this.vx, 0, this.vz).normalize();
                  window.BloodSystem.emitDroneMist(enemy.mesh.position, _droneDir, 40);
                }
              } else {
                // Level 1: small continuous drips fall directly below enemy, slowly pooling
                if (bloodDrips.length < MAX_BLOOD_DRIPS) {
                  const drip1 = new THREE.Mesh(
                    new THREE.SphereGeometry(0.02 + Math.random()*0.02, 4, 4),
                    new THREE.MeshBasicMaterial({ color: 0x8B0000 })
                  );
                  drip1.position.set(enemy.mesh.position.x + (Math.random()-0.5)*0.2, enemy.mesh.position.y, enemy.mesh.position.z + (Math.random()-0.5)*0.2);
                  scene.add(drip1);
                  bloodDrips.push({ mesh: drip1, velX: 0, velZ: 0, velY: -0.04, life: 30 + Math.floor(Math.random()*10) });
                }
              }
              
              if (droneLevel >= 3) {
                // Level 3: exit-wound penetration — fine blood mist out back, coats ground behind
                const exitMistX = enemy.mesh.position.x - this.vx * 1.0;
                const exitMistZ = enemy.mesh.position.z - this.vz * 1.0;
                spawnParticles({ x: exitMistX, y: enemy.mesh.position.y, z: exitMistZ }, 0xCC0000, 3);
                spawnParticles({ x: exitMistX, y: enemy.mesh.position.y, z: exitMistZ }, 0x8B0000, 2);
                // Fine mist droplets coat the ground behind enemy
                for (let fm = 0; fm < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; fm++) {
                  const mist = new THREE.Mesh(
                    new THREE.SphereGeometry(0.015 + Math.random()*0.015, 3, 3),
                    new THREE.MeshBasicMaterial({ color: 0xCC0000 })
                  );
                  mist.position.set(exitMistX + (Math.random()-0.5)*0.5, enemy.mesh.position.y + 0.3, exitMistZ + (Math.random()-0.5)*0.5);
                  scene.add(mist);
                  // High-velocity along bullet direction
                  bloodDrips.push({
                    mesh: mist,
                    velX: -this.vx * 0.25 + (Math.random()-0.5)*0.04,
                    velZ: -this.vz * 0.25 + (Math.random()-0.5)*0.04,
                    velY: 0.05 + Math.random()*0.08,
                    life: 30 + Math.floor(Math.random()*20)
                  });
                }
                spawnBloodDecal({ x: exitMistX + (Math.random()-0.5)*0.6, y: 0, z: exitMistZ + (Math.random()-0.5)*0.6 });
              }
            } else if (this.isDoubleBarrel) {
              // Double barrel: varied brutal hit effects based on range
              const distDB = Math.sqrt(
                (enemy.mesh.position.x - player.mesh.position.x) ** 2 +
                (enemy.mesh.position.z - player.mesh.position.z) ** 2
              );
              const hitVariation = Math.random();
              
              if (distDB < 3.5) {
                // CLOSE RANGE — devastating: flesh rip, guts spill, half head blown off
                if (hitVariation < 0.3) {
                  // Guts spill from stomach
                  for (let gc = 0; gc < 4 && bloodDrips.length < MAX_BLOOD_DRIPS; gc++) {
                    const gutSize = 0.06 + Math.random() * 0.08;
                    const gut = new THREE.Mesh(
                      new THREE.DodecahedronGeometry(gutSize, 0),
                      new THREE.MeshBasicMaterial({ color: [0xFF69B4, 0xCC2244, 0x8B1A1A, 0x6B0000][gc % 4] })
                    );
                    gut.position.copy(enemy.mesh.position);
                    scene.add(gut);
                    bloodDrips.push({
                      mesh: gut,
                      velX: (Math.random() - 0.5) * 0.4 + this.vx * 0.3,
                      velZ: (Math.random() - 0.5) * 0.4 + this.vz * 0.3,
                      velY: 0.05 + Math.random() * 0.15,
                      life: 60 + Math.floor(Math.random() * 30)
                    });
                  }
                  if (window.BloodSystem) window.BloodSystem.emitGuts(enemy.mesh.position);
                } else if (hitVariation < 0.6) {
                  // Flesh chunks ripped off
                  for (let fc = 0; fc < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; fc++) {
                    const flesh = new THREE.Mesh(
                      new THREE.DodecahedronGeometry(0.05 + Math.random() * 0.08, 0),
                      new THREE.MeshBasicMaterial({ color: [0xCC4444, 0xAA2222, 0x882222][fc % 3] })
                    );
                    flesh.position.copy(enemy.mesh.position);
                    flesh.position.y += 0.3;
                    scene.add(flesh);
                    bloodDrips.push({
                      mesh: flesh,
                      velX: (Math.random() - 0.5) * 0.6 + this.vx * 0.5,
                      velZ: (Math.random() - 0.5) * 0.6 + this.vz * 0.5,
                      velY: 0.2 + Math.random() * 0.4,
                      life: 50 + Math.floor(Math.random() * 25)
                    });
                  }
                }
                // Massive close-range blood burst
                spawnParticles(enemy.mesh.position, 0x8B0000, 8);
                spawnParticles(enemy.mesh.position, 0xCC0000, 6);
                spawnParticles(enemy.mesh.position, 0xFF2200, 4);
                if (window.BloodSystem) {
                  window.BloodSystem.emitBurst(enemy.mesh.position, 200, { spreadXZ: 1.5, spreadY: 0.3 });
                }
              } else {
                // MID/LONG RANGE — many small pellet holes bleeding
                spawnParticles(enemy.mesh.position, 0x8B0000, 4);
                spawnParticles(enemy.mesh.position, 0xCC0000, 3);
                // Directional spray along bullet path  
                for (let bs = 0; bs < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; bs++) {
                  const sp = new THREE.Mesh(
                    new THREE.SphereGeometry(0.03 + Math.random()*0.04, 4, 4),
                    new THREE.MeshBasicMaterial({ color: [0xAA0000, 0x880000, 0xCC0000][bs % 3] })
                  );
                  sp.position.copy(enemy.mesh.position);
                  scene.add(sp);
                  bloodDrips.push({
                    mesh: sp,
                    velX: this.vx * (0.2 + Math.random()*0.3) + (Math.random()-0.5)*0.1,
                    velZ: this.vz * (0.2 + Math.random()*0.3) + (Math.random()-0.5)*0.1,
                    velY: 0.08 + Math.random() * 0.2,
                    life: 35 + Math.floor(Math.random() * 15)
                  });
                }
              }
              // Large gore drops directly beneath enemy
              for (let gd = 0; gd < 3; gd++) {
                spawnBloodDecal({ x: enemy.mesh.position.x + (Math.random()-0.5)*0.6, y: 0, z: enemy.mesh.position.z + (Math.random()-0.5)*0.6 });
              }
            } else {
              // Standard gun hit — varied hit effects
              const gunHitVar = Math.floor(Math.random() * 5);
              const entryX = enemy.mesh.position.x - this.vx * 0.5;
              const entryZ = enemy.mesh.position.z - this.vz * 0.5;
              
              if (gunHitVar === 0) {
                // Clean entry — small back-spatter
                for (let es = 0; es < 2 && bloodDrips.length < MAX_BLOOD_DRIPS; es++) {
                  const ep = new THREE.Mesh(
                    new THREE.SphereGeometry(0.02 + Math.random()*0.02, 4, 4),
                    new THREE.MeshBasicMaterial({ color: 0xAA0000 })
                  );
                  ep.position.set(entryX + (Math.random()-0.5)*0.2, enemy.mesh.position.y + 0.1, entryZ + (Math.random()-0.5)*0.2);
                  scene.add(ep);
                  bloodDrips.push({ mesh: ep, velX: -this.vx*0.1, velZ: -this.vz*0.1, velY: 0.05 + Math.random()*0.08, life: 18 + Math.floor(Math.random()*10) });
                }
              } else if (gunHitVar === 1) {
                // Spray hit — blood flies sideways
                for (let es = 0; es < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; es++) {
                  const ep = new THREE.Mesh(
                    new THREE.SphereGeometry(0.025 + Math.random()*0.025, 4, 4),
                    new THREE.MeshBasicMaterial({ color: [0xAA0000, 0x880000, 0xCC0000][es%3] })
                  );
                  ep.position.set(enemy.mesh.position.x, enemy.mesh.position.y + 0.2, enemy.mesh.position.z);
                  scene.add(ep);
                  bloodDrips.push({ mesh: ep, velX: (Math.random()-0.5)*0.2, velZ: (Math.random()-0.5)*0.2, velY: 0.1 + Math.random()*0.15, life: 25 + Math.floor(Math.random()*12) });
                }
              } else if (gunHitVar === 2) {
                // Heavy entry — bigger drops falling down
                spawnParticles(enemy.mesh.position, 0x8B0000, 3);
                spawnBloodDecal(enemy.mesh.position);
              } else if (gunHitVar === 3) {
                // Through-and-through — small entry, blood mist behind
                spawnParticles({ x: entryX, y: enemy.mesh.position.y, z: entryZ }, 0x8B0000, 2);
                if (window.BloodSystem) {
                  const dir = new THREE.Vector3(this.vx, 0, this.vz).normalize();
                  window.BloodSystem.emitExitWound(enemy.mesh.position, dir, 15, { spread: 0.2, speed: 0.15 });
                }
              } else {
                // Standard entry spray
                for (let es = 0; es < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; es++) {
                  const ep = new THREE.Mesh(
                    new THREE.SphereGeometry(0.02 + Math.random()*0.025, 4, 4),
                    new THREE.MeshBasicMaterial({ color: 0xAA0000 })
                  );
                  ep.position.set(entryX + (Math.random()-0.5)*0.25, enemy.mesh.position.y + 0.1 + (Math.random()-0.5)*0.3, entryZ + (Math.random()-0.5)*0.25);
                  scene.add(ep);
                  bloodDrips.push({ mesh: ep, velX: -this.vx*(0.1+Math.random()*0.12), velZ: -this.vz*(0.1+Math.random()*0.12), velY: 0.06+Math.random()*0.1, life: 20+Math.floor(Math.random()*12) });
                }
              }
              // Exit wound for gun level 3+ — large hole on back, massive high-velocity exit spray
              if (weapons.gun.level >= 3) {
                const exitX = enemy.mesh.position.x + this.vx * 1.2;
                const exitZ = enemy.mesh.position.z + this.vz * 1.2;
                const exitPos = { x: exitX, y: enemy.mesh.position.y, z: exitZ };
                // Large exit blood burst
                spawnParticles(exitPos, 0x8B0000, 5);
                spawnParticles(exitPos, 0xCC0000, 4);
                spawnBloodDecal(exitPos);
                // 2-4 meter trail of high-velocity droplets behind enemy
                const trailLen = 2 + Math.floor(Math.random() * 3); // 2-4 meters (segments)
                for (let tl = 0; tl < trailLen && bloodDrips.length < MAX_BLOOD_DRIPS; tl++) {
                  const trailFrac = (tl + 1) / trailLen;
                  const tvx = this.vx * (0.35 + trailFrac * 0.35);
                  const tvz = this.vz * (0.35 + trailFrac * 0.35);
                  const tp = new THREE.Mesh(
                    new THREE.SphereGeometry(0.03 + Math.random()*0.035, 4, 4),
                    new THREE.MeshBasicMaterial({ color: tl % 2 === 0 ? 0xAA0000 : 0x880000 })
                  );
                  tp.position.set(exitX + (Math.random()-0.5)*0.3, enemy.mesh.position.y + 0.15, exitZ + (Math.random()-0.5)*0.3);
                  scene.add(tp);
                  bloodDrips.push({
                    mesh: tp,
                    velX: tvx + (Math.random()-0.5)*0.08,
                    velZ: tvz + (Math.random()-0.5)*0.08,
                    velY: 0.12 + Math.random() * 0.2,
                    life: 35 + Math.floor(Math.random()*20)
                  });
                  // Medium blood pools along the trail
                  if (tl % 2 === 0) spawnBloodDecal({ x: exitX + this.vx*(tl*0.7), y: 0, z: exitZ + this.vz*(tl*0.7) });
                }
                // Larger exit hole decal on back face
                if (!enemy.bulletHoles) enemy.bulletHoles = [];
                if (enemy.bulletHoles.length < 12) {
                  const exitHole = new THREE.Mesh(
                    new THREE.CircleGeometry(0.12 + Math.random()*0.08, 8),
                    new THREE.MeshBasicMaterial({ color: 0x1A0000, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
                  );
                  // Place on the exit (back) face
                  const bMag = Math.sqrt(this.vx*this.vx + this.vz*this.vz);
                  const backNx = this.vx / bMag;
                  const backNz = this.vz / bMag;
                  exitHole.position.set(backNx*0.52, (Math.random()-0.5)*0.3, backNz*0.52);
                  exitHole.lookAt(new THREE.Vector3(backNx*2, exitHole.position.y*2, backNz*2));
                  enemy.mesh.add(exitHole);
                  enemy.bulletHoles.push(exitHole);
                }
              }
            }
            // ── End weapon-specific hit effects ──────────────────────────────────
            
            // Water splash effect on hit
            spawnParticles(enemy.mesh.position, COLORS.player, 5);
            spawnParticles(enemy.mesh.position, 0xFFFFFF, 3);
            
            // Mark this enemy as hit
            this.hitEnemies.add(enemy);

            // ── Projectile Pinning (Bow & Shuriken) ───────────────────────────
            // Clone the projectile mesh and parent it to the enemy so it looks
            // visually "pinned" into the body. The pinned mesh persists until the
            // enemy is removed from the scene.
            if ((this.isBow || this.isShuriken) && !enemy.isDead && enemy.mesh) {
              try {
                const pinnedMesh = this.mesh.clone();
                // Convert projectile world-space position into the enemy's local space
                const localPos = enemy.mesh.worldToLocal(this.mesh.position.clone());
                // Vary penetration depth: arrows go deeper (sometimes tip pokes through),
                // shurikens lodge near the surface.
                let depthOffset;
                if (this.isBow) {
                  // 35% chance the tip exits the other side (full penetration); otherwise half-in
                  depthOffset = Math.random() < 0.35 ? 0.0 : 0.3;
                } else {
                  // Shuriken: lodges at the surface
                  depthOffset = 0.45;
                }
                localPos.x += (Math.random() - 0.5) * 0.15;
                localPos.y += (Math.random() - 0.5) * 0.2;
                // Align the pinned mesh along the projectile travel direction
                const yawAngle = Math.atan2(this.vz, this.vx);
                pinnedMesh.rotation.set(0, -yawAngle, 0);
                // Move slightly along travel direction for penetration depth
                localPos.x += Math.cos(yawAngle) * depthOffset;
                localPos.z += Math.sin(yawAngle) * depthOffset;
                pinnedMesh.position.copy(localPos);
                pinnedMesh.scale.copy(this.mesh.scale);
                // Shurikens lodge flat; arrows point along travel axis
                if (this.isShuriken) pinnedMesh.rotation.z = Math.random() * Math.PI;
                enemy.mesh.add(pinnedMesh);
                // Track pinned meshes for cleanup on enemy death
                if (!enemy._pinnedProjectiles) enemy._pinnedProjectiles = [];
                enemy._pinnedProjectiles.push(pinnedMesh);
                // Localised blood drip at entry wound
                if (bloodDrips.length < MAX_BLOOD_DRIPS && window.THREE) {
                  const woundDrop = new THREE.Mesh(
                    new THREE.SphereGeometry(0.025 + Math.random() * 0.02, 4, 4),
                    new THREE.MeshBasicMaterial({ color: 0x8B0000 })
                  );
                  woundDrop.position.copy(this.mesh.position);
                  woundDrop.position.y += 0.15 + Math.random() * 0.2;
                  scene.add(woundDrop);
                  bloodDrips.push({
                    mesh: woundDrop,
                    velX: (Math.random() - 0.5) * 0.06,
                    velZ: (Math.random() - 0.5) * 0.06,
                    velY: -0.03 - Math.random() * 0.03,  // drips downward
                    life: 60 + Math.floor(Math.random() * 40),
                    _sharedGeo: false
                  });
                }
              } catch (_e) { /* non-critical visual — silently ignore */ }
            }
            // ── End Projectile Pinning ────────────────────────────────────────

            // Check if bullet should be destroyed or continue piercing
            if (this.hitEnemies.size >= this.maxHits) {
              // Hit maximum number of enemies, destroy bullet
              this.destroy();
              playSound('hit');
              break;
            } else {
              // Continue piercing (haven't reached max hits yet)
              // Exit blood spray — blood flies out from the exit side
              const exitX = enemy.mesh.position.x + this.vx * 0.8;
              const exitZ = enemy.mesh.position.z + this.vz * 0.8;
              const exitPos = { x: exitX, y: enemy.mesh.position.y, z: exitZ };
              spawnParticles(exitPos, 0x8B0000, 6);
              spawnParticles(exitPos, 0xCC0000, 4);
              spawnBloodDecal(exitPos);
              // Level 3+ gun: massive exit wound with spray and stacking pools
              const gunLevel = weapons.gun ? (weapons.gun.level || 1) : 1;
              if (gunLevel >= 3 && window.BloodSystem) {
                const exitVec = new THREE.Vector3(exitPos.x, exitPos.y, exitPos.z);
                const bulletDir = new THREE.Vector3(this.vx, 0, this.vz).normalize();
                // Blood rapidly sprays out the back (exit hole) in drops, 2-4m trails
                const exitCount = 40 + (gunLevel - 3) * 20; // Scales with level: 40/60/80
                window.BloodSystem.emitExitWound(exitVec, bulletDir, exitCount, { spread: 0.6, speed: 0.4 });
                // Track hit count on enemy for stacking (each hit adds more spray, capped at 3)
                enemy._exitWoundCount = Math.min((enemy._exitWoundCount || 0) + 1, 3);
                if (enemy._exitWoundCount > 1 && window.BloodSystem) {
                  // Stacking: additional burst per wound, using fixed multiplier (no unbounded growth)
                  window.BloodSystem.emitExitWound(exitVec, bulletDir, exitCount, { spread: 0.5, speed: 0.35 });
                }
                // Extra blood decals for 2-4m trail scatter
                for (let tl = 0; tl < 6; tl++) {
                  const trailDist = 0.5 + Math.random() * 3.5; // 0.5-4m range
                  spawnBloodDecal({ x: exitX + this.vx * trailDist + (Math.random()-0.5)*0.4, y: 0, z: exitZ + this.vz * trailDist + (Math.random()-0.5)*0.4 });
                }
              } else {
                // Airborne exit blood (standard gun <3)
                for (let eb = 0; eb < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; eb++) {
                  const bp = new THREE.Mesh(
                    new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 4, 4),
                    new THREE.MeshBasicMaterial({ color: 0xAA0000 })
                  );
                  bp.position.set(exitX + (Math.random() - 0.5) * 0.3, enemy.mesh.position.y + 0.1, exitZ + (Math.random() - 0.5) * 0.3);
                  scene.add(bp);
                  bloodDrips.push({ mesh: bp, velY: 0.12 + Math.random() * 0.15, life: 25 + Math.floor(Math.random() * 10) });
                }
              }
              playSound('hit');
              // Don't break - allow bullet to continue
            }
          }
        }

        // ── Wildlife hit detection — animals take damage from bullets ──────────
        if (window._wildlifeAnimals) {
          for (const animalGroup of window._wildlifeAnimals) {
            const ud = animalGroup.userData;
            if (!ud || !ud.alive) continue;
            const dx = this.mesh.position.x - animalGroup.position.x;
            const dz = this.mesh.position.z - animalGroup.position.z;
            if (dx * dx + dz * dz < 0.8) { // Hit radius for animals
              let dmg = weapons.gun.damage * playerStats.damage * playerStats.strength;
              ud.hp = (ud.hp || 1) - dmg;
              spawnParticles(animalGroup.position, 0xAA0000, 5);
              spawnBloodDecal({ x: animalGroup.position.x, y: 0, z: animalGroup.position.z });
              if (ud.hp <= 0 && ud.alive) {
                ud.alive = false;
                // ── Flayed texture: dark red "skinned" look ──
                animalGroup.traverse(child => {
                  if (child.isMesh && child.material) {
                    child.material = new THREE.MeshToonMaterial({
                      color: 0x8B0000,
                      emissive: 0x3A0000,
                      emissiveIntensity: 0.3
                    });
                  }
                });
                // Lay the animal on its side
                animalGroup.rotation.z = Math.PI / 2;
                // Spawn animal_carcass harvest node for skinning
                if (window.GameHarvesting && window.GameHarvesting.spawnCarcassNode) {
                  window.GameHarvesting.spawnCarcassNode(
                    animalGroup.position.x, animalGroup.position.z,
                    ud.animalData
                  );
                }
                // Stat notification
                if (typeof showStatChange === 'function') {
                  showStatChange('🔪 Animal Downed! Skin it for Meat & Hide!');
                }
                // Account XP for hunting
                if (typeof addAccountXP === 'function') addAccountXP(25);
                else if (window.addAccountXP) window.addAccountXP(25);
              }
              this.hitEnemies.add(animalGroup); // Prevent multi-hit on same animal
              this.destroy();
              return false;
            }
          }
        }
        
        // FRESH IMPLEMENTATION: Destructible Props Collision
        if (window.destructibleProps) {
          for (let prop of window.destructibleProps) {
            if (prop.destroyed) continue;
            const dx = this.mesh.position.x - prop.mesh.position.x;
            const dz = this.mesh.position.z - prop.mesh.position.z;
            if (dx*dx + dz*dz < 1.5) { // Hit radius for props
              // Calculate damage (use base weapon damage)
              let dmg = weapons.gun.damage * playerStats.damage * playerStats.strength * 0.5; // Half damage to props
              
              if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
                dmg = weapons.doubleBarrel.damage * playerStats.damage * playerStats.strength * 0.5;
              }
              
              if (weapons.droneTurret.active && this.isDroneTurret) {
                dmg = weapons.droneTurret.damage * playerStats.damage * playerStats.strength * 0.5;
              }
              
              prop.hp -= dmg;
              
              // Visual damage stages (5 stages for better destruction feel)
              const hpPercent = prop.hp / prop.maxHp;
              
              if (hpPercent <= 0.8 && hpPercent > 0.6 && !prop.damageStage1) {
                // Stage 1 (80% HP): Slight crack — small lean and sway increase
                prop.damageStage1 = true;
                if (prop.type === 'tree') {
                  prop.mesh.userData.swayAmount = Math.min(0.2, (prop.mesh.userData.swayAmount || 0.05) + 0.08);
                  prop.mesh.rotation.z = 0.05;
                }
              } else if (hpPercent <= 0.6 && hpPercent > 0.4 && !prop.darkenedStage1) {
                // Stage 2 (60% HP): Visible damage — darken slightly
                prop.darkenedStage1 = true;
                if (prop.type === 'tree') {
                  prop.mesh.userData.trunk.material.color.copy(prop.originalColor.trunk).multiplyScalar(0.85);
                  prop.mesh.userData.leaves.material.color.copy(prop.originalColor.leaves).multiplyScalar(0.75);
                  prop.mesh.userData.swayAmount = Math.min(0.3, (prop.mesh.userData.swayAmount || 0.05) + 0.12);
                } else {
                  prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.8);
                }
              } else if (hpPercent <= 0.4 && hpPercent > 0.2 && !prop.damageStage3) {
                // Stage 3 (40% HP): Heavy damage — major lean, lose leaves
                prop.damageStage3 = true;
                if (prop.type === 'tree') {
                  prop.mesh.userData.trunk.material.color.copy(prop.originalColor.trunk).multiplyScalar(0.65);
                  if (prop.mesh.userData.leaves) prop.mesh.userData.leaves.scale.set(0.6, 0.6, 0.6);
                  prop.mesh.rotation.z = 0.15 * (Math.random() < 0.5 ? 1 : -1);
                } else {
                  prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.6);
                  prop.mesh.scale.copy(prop.originalScale).multiplyScalar(0.85);
                }
                spawnParticles(prop.mesh.position, 0x8B4513, 6);
              } else if (hpPercent <= 0.2 && hpPercent > 0 && !prop.darkenedStage2) {
                // Stage 4 (20% HP): Near destruction — major shrink, very dark
                prop.darkenedStage2 = true;
                if (prop.type === 'tree') {
                  prop.mesh.userData.trunk.material.color.copy(prop.originalColor.trunk).multiplyScalar(0.4);
                  if (prop.mesh.userData.leaves) prop.mesh.userData.leaves.visible = false;
                  prop.mesh.rotation.z = 0.3 * (prop.mesh.rotation.z >= 0 ? 1 : -1);
                } else {
                  prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.4);
                }
                prop.mesh.scale.copy(prop.originalScale).multiplyScalar(0.8);
                spawnParticles(prop.mesh.position, 0x8B4513, 10);
              } else if (prop.hp <= 0) {
                // Stage 5 (0 HP): Destroy with debris
                prop.destroyed = true;
                
                // Explosion effect based on type
                if (prop.type === 'barrel') {
                  // Barrel explodes
                  spawnParticles(prop.mesh.position, 0xFF4500, 30); // Orange explosion
                  spawnParticles(prop.mesh.position, 0xFFFF00, 15); // Yellow fire
                  playSound('hit');
                  // Barrel removed from scene
                  scene.remove(prop.mesh);
                  prop.mesh.geometry.dispose();
                  prop.mesh.material.dispose();
                } else if (prop.type === 'tree') {
                  // Tree falls and remains as debris (does not disappear)
                  spawnParticles(prop.mesh.position, 0x8B4513, 20); // Brown wood
                  spawnParticles(prop.mesh.position, 0x228B22, 15); // Green leaves
                  // Animate tree falling — rotate to ground and stay as debris
                  const fallDir = Math.random() < 0.5 ? 1 : -1;
                  const fallAxis = Math.random() < 0.5 ? 'x' : 'z';
                  const fallDuration = 600;
                  const fallStart = Date.now();
                  // Hide leaves to simulate them scattering, trunk remains as log
                  if (prop.mesh.userData.leaves) {
                    prop.mesh.userData.leaves.visible = false;
                  }
                  const treeMesh = prop.mesh;
                  if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                    let treeFallTimer = 0;
                    const treeFallFrames = Math.ceil(fallDuration / 16); // ~37 frames
                    managedAnimations.push({ update(_dt) {
                      treeFallTimer++;
                      const progress = Math.min(treeFallTimer / treeFallFrames, 1);
                      const angle = (Math.PI / 2) * progress * fallDir;
                      if (fallAxis === 'x') {
                        treeMesh.rotation.x = angle;
                      } else {
                        treeMesh.rotation.z = angle;
                      }
                      treeMesh.position.y = -progress * 1.5; // Sink slightly into ground
                      if (progress >= 1) {
                        // Tree stays as fallen log debris — never removed
                        return false;
                      }
                      return true;
                    }});
                  }
                } else if (prop.type === 'crate') {
                  // Crate breaks apart and is removed
                  spawnParticles(prop.mesh.position, 0xD2691E, 20); // Wood particles
                  scene.remove(prop.mesh);
                  prop.mesh.geometry.dispose();
                  prop.mesh.material.dispose();
                }
              } else {
                // Tree movement on hit (shake/sway from impact)
                if (prop.type === 'tree' && prop.mesh.userData.swayPhase !== undefined) {
                  // Add extra sway from bullet impact
                  prop.mesh.userData.swayAmount = Math.min(0.3, prop.mesh.userData.swayAmount + 0.1);
                  // Gradually reduce sway back to normal
                  setTimeout(() => {
                    if (!prop.destroyed && prop.mesh.userData.swayAmount) {
                      prop.mesh.userData.swayAmount = Math.max(0.05, prop.mesh.userData.swayAmount - 0.05);
                    }
                  }, 500);
                }
              }
              
              // Small particle effect on hit
              spawnParticles(prop.mesh.position, 0x888888, 3);
              
              this.destroy();
              break;
            }
          }
        }
        
        // FRESH: Fence collision - fences can be damaged and broken by bullets
        if (window.breakableFences) {
          for (let fence of window.breakableFences) {
            if (!fence.userData.isFence || fence.userData.hp <= 0) continue;
            const dx = this.mesh.position.x - fence.position.x;
            const dz = this.mesh.position.z - fence.position.z;
            if (dx*dx + dz*dz < 1.5) { // Hit radius
              // Damage fence
              const dmg = weapons.gun.damage * 0.3; // Fences take less damage
              fence.userData.hp -= dmg;
              
              // Shake effect on hit
              fence.rotation.x = (Math.random() - 0.5) * 0.3;
              fence.rotation.z = (Math.random() - 0.5) * 0.3;
              
              // Visual damage
              const hpPercent = fence.userData.hp / fence.userData.maxHp;
              if (hpPercent < 0.5) {
                fence.material.color.setHex(0x654321); // Darken when damaged
              }
              
              if (fence.userData.hp <= 0) {
                // Fence broken! Create debris
                spawnParticles(fence.position, 0x8B4513, 15); // Brown wood debris
                spawnParticles(fence.position, 0x654321, 10);
                
                // Animate fence falling
                const fallDirection = Math.random() < 0.5 ? 1 : -1;
                const startRotX = fence.rotation.x;
                const fallDuration = 500;
                const fallStart = Date.now();
                
                const fenceFallFrames = Math.ceil(fallDuration / 16); // ~31 frames
                const fenceRef = fence;
                if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                  let fenceFallTimer = 0;
                  managedAnimations.push({ update(_dt) {
                    fenceFallTimer++;
                    const progress = Math.min(fenceFallTimer / fenceFallFrames, 1);
                    fenceRef.rotation.x = startRotX + (Math.PI / 2) * progress * fallDirection;
                    fenceRef.position.y = 1 - progress * 0.8; // Sink down
                    
                    if (progress >= 1) {
                      scene.remove(fenceRef);
                      fenceRef.geometry.dispose();
                      fenceRef.material.dispose();
                      return false;
                    }
                    return true;
                  }});
                } else {
                  scene.remove(fenceRef);
                  fenceRef.geometry.dispose();
                  fenceRef.material.dispose();
                }
              }
              
              // Bullet destroyed on fence hit
              this.destroy();
              playSound('hit');
              break;
            }
          }
        }
        return this.active;
      }

      destroy() {
        this.active = false;
        this.mesh.visible = false;
        if (this.glow) this.glow.visible = false;

        if (!this._usesInstancing) {
          scene.remove(this.mesh);
          if (this.glow) scene.remove(this.glow);
          // Dispose cloned materials only for non-pooled projectiles.
          // Pooled projectiles keep their mesh/material alive for reuse.
          if (!this._isPooled) {
            if (this.mesh.material) this.mesh.material.dispose();
            if (this.glow && this.glow.material) this.glow.material.dispose();
          }
        }
      }
    }

    class SwordSlash {
      constructor(x, z, angle) {
        // Thinner arc geometry for flowing blade effect
        const geometry = new THREE.RingGeometry(1.8, 2.2, 12, 1, -Math.PI/4, Math.PI/2);
        const material = new THREE.MeshBasicMaterial({ color: 0xCCDDFF, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.rotation.z = angle - Math.PI/4;
        this.mesh.position.set(x, 0.6, z);
        scene.add(this.mesh);
        
        this.life = 12; // frames — slightly longer for smoother fade
        this.maxLife = 12;
        
        // Deal damage immediately
        const dmg = weapons.sword.damage * playerStats.strength * playerStats.damage;
        
        enemies.forEach(e => {
          const dx = e.mesh.position.x - x;
          const dz = e.mesh.position.z - z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          
          if (dist < 3.5) {
            // Check angle
            const eAngle = Math.atan2(dz, dx); // -PI to PI
            // Normalize angles
            let diff = eAngle - angle;
            while (diff < -Math.PI) diff += Math.PI*2;
            while (diff > Math.PI) diff -= Math.PI*2;
            
            if (Math.abs(diff) < Math.PI/3) {
              e.takeDamage(dmg, false, 'sword');
            }
          }
        });
      }
      
      update() {
        this.life--;
        const progress = 1 - (this.life / this.maxLife);
        // Smooth ease-out fade with slight scale expansion for flowing feel
        this.mesh.material.opacity = 0.9 * Math.pow(this.life / this.maxLife, 1.5);
        this.mesh.scale.set(1 + progress * 0.15, 1 + progress * 0.15, 1);
        if (this.life <= 0) {
          scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          return false;
        }
        return true;
      }
    }

    class IceSpear {
      constructor(x, z, target) {
        // Ice shard — elongated octahedron for a crystalline look (4-sided cone approximation)
        const geometry = new THREE.ConeGeometry(0.12, 0.7, 4);
        // Bright ice-blue material — using MeshPhongMaterial for camp-style visuals
        const material = new THREE.MeshPhongMaterial({
          color: 0xAEEEFF,
          emissive: 0x005577,
          emissiveIntensity: 0.8,
          shininess: 100,  // High shininess for ice/crystal
          transparent: true,
          opacity: 0.95
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.set(1, 3, 1); // Elongated ice shard
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.mesh.position.set(x, 0.5, z);
        scene.add(this.mesh);

        this.speed = 0.42 * (window._projSpeedMultiplier || 1.0); // Slightly faster — ice shards fly fast
        this.active = true;
        this.life = 70; // Frames - longer range than normal projectile
        this.hitRadius = 0.3; // Radius used for collision detection

        // Calculate direction — keep flat on XZ plane (no vertical component)
        const dx = target.x - x;
        const dz = target.z - z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        this.vx = (dx / dist) * this.speed;
        this.vy = 0; // Explicit zero — shard travels horizontally
        this.vz = (dz / dist) * this.speed;
        
        // Rotate shard to face direction of travel
        this.mesh.rotation.z = -Math.atan2(dz, dx) + Math.PI/2;
        this.mesh.rotation.x = Math.PI/2;
        
        // Trailing particles
        this.particleTimer = 0;

        // Spawn initial burst of ice chips from the "firing" point
        spawnParticles(this.mesh.position, 0xCCEEFF, 4);
        spawnParticles(this.mesh.position, 0xFFFFFF, 2);
      }

      update() {
        if (!this.active) return false;
        
        this.mesh.position.x += this.vx;
        this.mesh.position.y = 0.5; // Lock height — shard travels flat on ground plane
        this.mesh.position.z += this.vz;
        this.life--;
        
        // Denser ice trail — small ice chips flying off
        this.particleTimer++;
        if (this.particleTimer % 2 === 0) {
          spawnParticles(this.mesh.position, 0xAEEEFF, 1);
        }
        if (this.particleTimer % 5 === 0) {
          spawnParticles(this.mesh.position, 0xFFFFFF, 1); // White frost fleck
        }

        if (this.life <= 0) {
          this.destroy();
          return false;
        }

        // Collision Check — brute-force scan (no spatial hash to avoid tunneling)
        for (let i = 0; i < enemies.length; i++) {
          const enemy = enemies[i];
          if (!enemy) continue;
          if (!enemy.active || enemy.isDead) continue;
          if (!enemy.mesh) continue; // Guard: mesh disposed or instancing active
          const distSq = (this.mesh.position.x - enemy.mesh.position.x) ** 2 + (this.mesh.position.z - enemy.mesh.position.z) ** 2;
          const hitThreshold = (enemy.hitRadius || 0.7) * (enemy.hitRadius || 0.7) + (this.hitRadius || 0.3) * (this.hitRadius || 0.3);
          if (distSq < hitThreshold) {
            let dmg = weapons.iceSpear.damage * playerStats.damage * playerStats.strength;
            // Apply ice damage bonus from skills
            if (playerStats.iceDamage > 0 || playerStats.elementalDamage > 0) {
              dmg *= (1 + (playerStats.iceDamage || 0) + (playerStats.elementalDamage || 0));
            }
            const isCrit = Math.random() < playerStats.critChance;
            if (isCrit) dmg *= playerStats.critDmg;
            
            // Ice Spear: if enemy is already frozen, deal +100% bonus damage and shatter ice
            const wasAlreadyFrozen = enemy.isFrozen;
            if (wasAlreadyFrozen) {
              dmg *= 2; // +100% damage on frozen enemy
              // Shatter: large ice chunks fly outward and water pools form on ground
              spawnParticles(enemy.mesh.position, 0xAEEEFF, 6);
              spawnParticles(enemy.mesh.position, 0xCCEEFF, 5);
              spawnParticles(enemy.mesh.position, 0xFFFFFF, 4);
              // Large ice chunk blobs flying outward
              for (let ic = 0; ic < 5 && bloodDrips.length < MAX_BLOOD_DRIPS; ic++) {
                const chunkSize = 0.07 + Math.random() * 0.09;
                const chunk = new THREE.Mesh(
                  new THREE.DodecahedronGeometry(chunkSize, 0),
                  new THREE.MeshBasicMaterial({ color: 0xAEEEFF, transparent: true, opacity: 0.85 })
                );
                chunk.position.copy(enemy.mesh.position);
                scene.add(chunk);
                bloodDrips.push({
                  mesh: chunk,
                  velX: (Math.random() - 0.5) * 0.3,
                  velZ: (Math.random() - 0.5) * 0.3,
                  velY: 0.18 + Math.random() * 0.25,
                  life: 40 + Math.floor(Math.random() * 20),
                  isIce: true
                });
              }
              // Water pool from melting ice at enemy feet
              spawnBloodDecal({ x: enemy.mesh.position.x + (Math.random()-0.5)*0.5, y: 0, z: enemy.mesh.position.z + (Math.random()-0.5)*0.5 });
              spawnBloodDecal({ x: enemy.mesh.position.x + (Math.random()-0.5)*0.8, y: 0, z: enemy.mesh.position.z + (Math.random()-0.5)*0.8 });
            }
            
            enemy.takeDamage(Math.floor(dmg), isCrit, 'ice');
            
            // Freeze duration scales with ice spear level (base 2.5s, +0.5s per extra level)
            const freezeDur = 2500 + (weapons.iceSpear.level - 1) * 500;
            if (!enemy.isFrozen) {
              // Store original speed and color before first freeze
              if (!enemy._originalColor && enemy.mesh && enemy.mesh.material) {
                enemy._originalColor = enemy.mesh.material.color.clone();
              }
              if (!enemy.originalSpeed) enemy.originalSpeed = enemy.speed;
            }
            enemy.isFrozen = true;
            enemy.frozenUntil = Date.now() + freezeDur;
            enemy._freezeDuration = freezeDur; // Store for gradual visual transition
            // Freeze stops movement entirely — originalSpeed preserved for thaw
            enemy.speed = 0;
            // Visual: turn enemy icy blue with bright emissive; track freeze progress (0–1)
            if (enemy.mesh && enemy.mesh.material) {
              // Clone shared material before modifying per-enemy color to avoid
              // affecting all enemies that share the same material instance.
              if (enemy.mesh.material._isShared) {
                enemy.mesh.material = enemy.mesh.material.clone();
                // Re-capture originalColor from the just-cloned material
                if (!enemy._originalColor) {
                  enemy._originalColor = enemy.mesh.material.color.clone();
                }
              }
              if (!enemy._freezeProgress) enemy._freezeProgress = 0;
              enemy._freezeProgress = Math.min(1, enemy._freezeProgress + 0.35);
              // Lerp from original color toward icy blue based on freeze progress
              const baseColor = enemy._originalColor || new THREE.Color(0xFFFFFF);
              const iceColor = new THREE.Color(0xB0E8FF);
              enemy.mesh.material.color.copy(baseColor).lerp(iceColor, enemy._freezeProgress);
              if (enemy.mesh.material.emissive !== undefined) {
                enemy.mesh.material.emissive = new THREE.Color(0x4488AA);
                enemy.mesh.material.emissiveIntensity = 0.3 + enemy._freezeProgress * 0.4;
              }
              // Ice crack overlay on body (small white/blue angular shapes)
              if (!enemy._iceCracks) enemy._iceCracks = [];
              if (enemy._iceCracks.length < 6) {
                const crackGeo = new THREE.PlaneGeometry(0.08 + Math.random()*0.12, 0.02 + Math.random()*0.04);
                const crackMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.55 + enemy._freezeProgress * 0.3, side: THREE.DoubleSide });
                const crack = new THREE.Mesh(crackGeo, crackMat);
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                crack.position.set(Math.sin(phi)*Math.cos(theta)*0.51, Math.sin(phi)*Math.sin(theta)*0.51, Math.cos(phi)*0.51);
                crack.lookAt(crack.position.clone().multiplyScalar(2));
                crack.rotation.z = Math.random() * Math.PI;
                enemy.mesh.add(crack);
                enemy._iceCracks.push(crack);
              }
              enemy.mesh.material.needsUpdate = true;
            }
            // Clear separate slow effect — freeze supersedes it
            enemy.slowedUntil = null;
            
            // Ice impact: shattered ice particles (not blood) on impact
            spawnParticles(enemy.mesh.position, 0xAEEEFF, 6);
            spawnParticles(enemy.mesh.position, 0xCCEEFF, 4);
            spawnParticles(enemy.mesh.position, 0xFFFFFF, 3);
            // Tiny ice shard fragments fly outward
            for (let is = 0; is < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; is++) {
              const shardSize = 0.03 + Math.random() * 0.04;
              const shard = new THREE.Mesh(
                new THREE.TetrahedronGeometry(shardSize, 0),
                new THREE.MeshBasicMaterial({ color: 0xCCEEFF, transparent: true, opacity: 0.75 })
              );
              shard.position.copy(enemy.mesh.position);
              scene.add(shard);
              bloodDrips.push({
                mesh: shard,
                velX: (Math.random() - 0.5) * 0.18,
                velZ: (Math.random() - 0.5) * 0.18,
                velY: 0.1 + Math.random() * 0.15,
                life: 25 + Math.floor(Math.random() * 15),
                isIce: true
              });
            }
            
            // Minimal knockback (freeze compensates — less push than gun)
            const kbForce = 0.15;
            enemy.mesh.position.x += this.vx * kbForce;
            enemy.mesh.position.z += this.vz * kbForce;
            
            this.destroy();
            playSound('hit');
            break;
          }
        }
        return true;
      }

      destroy() {
        this.active = false;
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
      }
    }

    class Meteor {
      constructor(targetX, targetZ) {
        this.target = new THREE.Vector3(targetX, 0, targetZ);
        
        // Falling sphere
        const geo = new THREE.DodecahedronGeometry(1.5);
        const mat = new THREE.MeshToonMaterial({ color: 0xFF4500, emissive: 0x8B0000 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(targetX, 20, targetZ);
        scene.add(this.mesh);
        
        // Shadow indicator
        const shadowGeo = new THREE.CircleGeometry(2.5, 16);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.3, transparent: true });
        this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadow.rotation.x = -Math.PI/2;
        this.shadow.position.set(targetX, 0.1, targetZ);
        scene.add(this.shadow);
        
        this.speed = 0.5;
        this.active = true;
      }
      
      update() {
        if (!this.active) return false;
        
        this.mesh.position.y -= this.speed;
        this.speed += 0.05; // Gravity
        
        if (this.mesh.position.y <= 0) {
          this.explode();
          return false;
        }
        return true;
      }
      
      explode() {
        this.active = false;
        scene.remove(this.mesh);
        scene.remove(this.shadow);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.shadow.geometry.dispose();
        this.shadow.material.dispose();
        
        // AOE Damage with knockback
        const range = weapons.meteor.area;
        const dmg = weapons.meteor.damage * playerStats.strength;
        
        enemies.forEach(e => {
          if (!e) return; // Guard: sparse array slots
          if (e.isDead || !e.mesh) return; // Guard: skip dead or mesh-less enemies
          const d = e.mesh.position.distanceTo(this.target);
          if (d < range) {
            e.takeDamage(dmg, false, 'fire');
            
            // Apply knockback to enemies
            const knockbackDir = new THREE.Vector3(
              e.mesh.position.x - this.target.x,
              0,
              e.mesh.position.z - this.target.z
            ).normalize();
            
            // Knockback strength inversely proportional to distance
            const knockbackStrength = (1 - d / range) * GAME_CONFIG.meteorKnockbackMultiplier;
            e.mesh.position.x += knockbackDir.x * knockbackStrength;
            e.mesh.position.z += knockbackDir.z * knockbackStrength;
            
            // Add visual bounce effect
            const originalY = e.mesh.position.y;
            e.mesh.position.y = originalY + 0.5 * (1 - d / range);
            setTimeout(() => {
              e.mesh.position.y = originalY;
            }, 200);
          }
        });
        
        // Enhanced visuals — visible explosion ring + debris
        spawnParticles(this.target, 0xFF4500, 8);
        spawnParticles(this.target, 0xFFFF00, 4);
        spawnParticles(this.target, 0xFF8C00, 6);
        spawnMuzzleSmoke(this.target, 10);

        // Explosion shockwave ring — expands outward and fades
        const ringGeo = new THREE.RingGeometry(0.2, 0.6, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xFF6600, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(this.target.x, 0.08, this.target.z);
        scene.add(ring);
        let ringLife = 25;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            ringLife--;
            const scale = 1 + (1 - ringLife / 25) * (weapons.meteor.area / 1.5);
            ring.scale.set(scale, scale, scale);
            ring.material.opacity = (ringLife / 25) * 0.9;
            if (ringLife <= 0) { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); return false; }
            return true;
          }});
        } else {
          scene.remove(ring); ring.geometry.dispose(); ring.material.dispose();
        }
        
        // Camera shake for explosion
        const shakeIntensity = GAME_CONFIG.explosionShakeIntensity;
        const originalCameraPos = camera.position.clone();
        let shakeTime = 0;
        const shakeDuration = 0.3;
        
        const shakeAnim = () => {
          shakeTime += 0.016;
          if (shakeTime < shakeDuration) {
            const intensity = (1 - shakeTime / shakeDuration) * shakeIntensity;
            camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * intensity;
            camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * intensity;
            camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * intensity;
            requestAnimationFrame(shakeAnim);
          } else {
            camera.position.copy(originalCameraPos);
          }
        };
        shakeAnim();
        
        playSound('meteor'); // Explosive boom sound
      }
    }

    class Particle {
      static MAX_LIFETIME = 28; // Lifetime in frames before removal
      static INITIAL_OPACITY = 0.92; // Maximum opacity for particles
      static VEL_XZ_RANGE = 0.35; // Horizontal velocity spread
      static VEL_Y_MIN = 0.08;    // Minimum upward velocity
      static VEL_Y_RANGE = 0.5;   // Additional random upward velocity
      
      constructor(pos, color) {
        const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
        const mat = new THREE.MeshPhongMaterial({
          color: color,
          transparent: true,
          opacity: Particle.INITIAL_OPACITY,
          emissive: color,
          emissiveIntensity: 0.5,
          shininess: 40
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = false;
        this.mesh.position.copy(pos);
        this.mesh.visible = false;
        
        this.vel = new THREE.Vector3(
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE,
          Particle.VEL_Y_MIN + Math.random() * Particle.VEL_Y_RANGE,
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE
        );
        this.life = 0;
      }
      
      reset(pos, color) {
        // Reuse existing particle
        this.mesh.position.copy(pos);
        this.mesh.material.color.setHex(color);
        this.mesh.material.emissive.setHex(color);
        // Blood particles (dark red) get smaller, faster, more splatter-like behavior
        const isBlood = (color === 0x8B0000 || color === 0x6B0000);
        const velScale = isBlood ? 1.5 : 1.0;
        this.vel.set(
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE * velScale,
          (isBlood ? 0.05 : Particle.VEL_Y_MIN) + Math.random() * Particle.VEL_Y_RANGE * (isBlood ? 0.5 : 1.0),
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE * velScale
        );
        // Blood particles should be smaller scale
        const sizeScale = isBlood ? 0.4 + Math.random() * 0.4 : 1.0;
        this.mesh.scale.setScalar(sizeScale);
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.visible = true;
        scene.add(this.mesh);
        this.life = isBlood ? Math.floor(Particle.MAX_LIFETIME * 0.6) : Particle.MAX_LIFETIME;
      }
      
      update() {
        this.life--;
        this.mesh.position.add(this.vel);
        this.vel.y -= 0.02; // Gravity
        this.mesh.rotation.x += 0.1;
        this.mesh.rotation.y += 0.1;
        
        // Fade out based on life remaining (more realistic smoke/fog effect)
        this.mesh.material.opacity = (this.life / Particle.MAX_LIFETIME) * Particle.INITIAL_OPACITY;
        
        if (this.mesh.position.y < 0) {
          this.mesh.position.y = 0;
          this.vel.y = 0;
          this.vel.x *= 0.8;
          this.vel.z *= 0.8;
        }
        
        if (this.life <= 0) {
          scene.remove(this.mesh);
          this.mesh.visible = false;
          this.mesh.scale.setScalar(1); // Reset scale for pool reuse
          return false;
        }
        return true;
      }
      
      dispose() {
        // Only called on final cleanup
        if (this.mesh) {
          scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
        }
      }
    }
    window.Particle = Particle;

