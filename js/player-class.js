// js/player-class.js — Player class: water droplet character, movement, dash, recoil, shooting.
// Depends on: THREE (CDN), variables from main.js (scene, camera, enemies, playerStats, etc.)

    // ── Scene Helper (defensive access for both main game and sandbox) ────────
    /** Safely get the scene global, supporting both main game and sandbox mode. */
    function _getScene() {
      return (typeof scene !== 'undefined' && scene) ? scene : (typeof window !== 'undefined' ? window.scene : null);
    }

    // ── Evaporation helpers (Void/Alien gem mechanic) ────────────────────────
    /** Returns true if any equipped slot (weapon or companion) has a void gem. */
    function _playerHasVoidGem() {
      if (!saveData || !saveData.cutGems) return false;
      const _checkSlotStore = (store, id) => {
        if (!store || !store[id]) return false;
        return store[id].some(gemId => {
          if (!gemId) return false;
          const gem = saveData.cutGems.find(g => g.id === gemId);
          return gem && gem.type === 'void';
        });
      };
      const _weaponId = saveData.equippedGear && saveData.equippedGear.weapon;
      if (_weaponId && _checkSlotStore(saveData.weaponGemSlots, _weaponId)) return true;
      const companionId = saveData.selectedCompanion;
      if (companionId && _checkSlotStore(saveData.companionGemSlots, companionId)) return true;
      return false;
    }

    /** Trigger the Evaporation effect: negate damage, ghost player for 1.5 s, steam burst. */
    function _triggerEvaporation(playerInstance) {
      // Drop mesh opacity — player becomes semi-transparent
      if (playerInstance.mesh && playerInstance.mesh.material) {
        playerInstance.mesh.material.opacity = 0.2;
      }
      // Grant 1.5 s of invulnerability with special ghost flicker
      playerInstance.invulnerable = true;
      playerInstance.invulnerabilityTime = 0;
      playerInstance.invulnerabilityDuration = 1.5;
      playerInstance._isEvaporating = true;
      // Steam / smoke burst
      spawnParticles(playerInstance.mesh.position, 0xCCCCCC, 18); // grey steam
      spawnParticles(playerInstance.mesh.position, 0xFFFFFF, 8);  // white puff
      // Narrator flash
      if (typeof window.showNarratorLine === 'function') {
        window.showNarratorLine('Subject momentarily lost physical cohesion.');
      }
      // Floating status text
      if (typeof createFloatingText === 'function') {
        createFloatingText('EVAPORATION!', playerInstance.mesh.position, '#CC88FF');
      }
    }

    class Player {
      constructor() {
        // Create water droplet shape (chunky waterdrop matching spritesheet)
        const geometry = new THREE.SphereGeometry(0.5, 16, 16);
        
        // Modify geometry — wide bottom, pointed curved tip like spritesheet
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          let y = positions.getY(i);
          let x = positions.getX(i);
          let z = positions.getZ(i);
          
          if (y > 0) {
            // Stretch top into pointed tip
            positions.setY(i, y * 1.35);
            const t = y / 0.5; // 0..1
            const squeeze = 1 - t * 0.55;
            positions.setX(i, x * squeeze);
            positions.setZ(i, z * squeeze);
            // Bend the tip to one side (matching spritesheet curved point)
            if (t > 0.5) {
              const bend = (t - 0.5) * 2.0;
              positions.setX(i, positions.getX(i) + bend * 0.18);
              positions.setZ(i, positions.getZ(i) - bend * 0.06);
            }
          } else {
            // Widen the bottom for chunky squat shape
            const bulge = 1 + Math.abs(y / 0.5) * 0.15;
            positions.setX(i, x * bulge);
            positions.setZ(i, z * bulge);
          }
        }
        geometry.computeVertexNormals();
        
        // Use camp-style MeshPhongMaterial for better visuals and performance
        const material = new THREE.MeshPhongMaterial({
          color: 0x3A9FD8,             // Deeper sea-blue like water (was 0x4FC3F7 light blue)
          emissive: 0x0A3D5C,          // Deep ocean blue emissive glow (was 0x0d47a1)
          emissiveIntensity: 0.35,     // Slightly more glow
          shininess: 120,              // Higher shine like lake/sea water (was 90)
          specular: 0x88CCFF,          // Bright specular highlights for wet look
          transparent: true,
          opacity: 0.88,               // Slightly more opaque for better depth
          reflectivity: 0.6            // Add reflectivity for water-like appearance
        });

        // Annunaki Protocol: permanent gold/liquid-metal texture
        if (window._nmAnnunakiActive || (playerStats && playerStats._annunakiActive)) {
          material.color.setHex(0xD4AF37);
          material.emissive = new THREE.Color(0x7a5900);
          material.emissiveIntensity = 0.4;
          material.shininess = 100;   // High metallic shine
        }
        // Store original water color for resets
        window._playerOriginalColor = material.color.getHex();
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = 0.5;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        // Add to scene with defensive check for both global scene and window.scene (sandbox mode)
        const targetScene = _getScene();
        if (targetScene) {
          targetScene.add(this.mesh);
        } else {
          console.error('[Player] Cannot add player mesh: scene is not defined. Ensure scene is initialized before creating Player.');
        }
        
        // Add water shine effect (multiple layers for realistic water look)
        const shineGeo = new THREE.SphereGeometry(0.52, 16, 16);
        const shineMat = new THREE.MeshBasicMaterial({
          color: 0xCCEEFF,         // Light cyan shine (was 0xFFFFFF pure white)
          transparent: true,
          opacity: 0.28,           // Slightly stronger (was 0.25)
          side: THREE.BackSide
        });
        this.shine = new THREE.Mesh(shineGeo, shineMat);
        this.mesh.add(this.shine);

        // Add reflection highlight - primary glance
        const highlightGeo = new THREE.SphereGeometry(0.16, 16, 16);  // Slightly larger (was 0.15)
        const highlightMat = new THREE.MeshBasicMaterial({
          color: 0xDDFFFF,         // Bright cyan-white for water reflections (was 0xFFFFFF)
          transparent: true,
          opacity: 0.85            // Slightly stronger (was 0.8)
        });
        this.highlight = new THREE.Mesh(highlightGeo, highlightMat);
        this.highlight.position.set(-0.2, 0.3, 0.2);
        this.mesh.add(this.highlight);

        // Add secondary reflection - for realistic water glance
        const highlight2Geo = new THREE.SphereGeometry(0.10, 12, 12);
        const highlight2Mat = new THREE.MeshBasicMaterial({
          color: 0xAAEEFF,
          transparent: true,
          opacity: 0.6
        });
        this.highlight2 = new THREE.Mesh(highlight2Geo, highlight2Mat);
        this.highlight2.position.set(0.15, 0.25, 0.25);
        this.mesh.add(this.highlight2);

        // Add subtle blue shimmer effect for lake/sea appearance
        const shimmerGeo = new THREE.SphereGeometry(0.54, 16, 16);
        const shimmerMat = new THREE.MeshBasicMaterial({
          color: 0x2277AA,
          transparent: true,
          opacity: 0.15,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending  // Additive for glow effect
        });
        this.shimmer = new THREE.Mesh(shimmerGeo, shimmerMat);
        this.mesh.add(this.shimmer);
        
        // Eyes — large and prominent matching spritesheet character design
        const eyeWhiteGeo = new THREE.SphereGeometry(0.13, 8, 8);
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        
        this.leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        this.leftEyeWhite.position.set(-0.17, 0.10, 0.36);
        this.mesh.add(this.leftEyeWhite);
        
        this.rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        this.rightEyeWhite.position.set(0.17, 0.10, 0.36);
        this.mesh.add(this.rightEyeWhite);
        
        const eyeGeo = new THREE.SphereGeometry(0.10, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xCC2222 }); // Red eyes matching spritesheet
        
        this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.leftEye.position.set(-0.17, 0.10, 0.40);
        this.mesh.add(this.leftEye);
        
        this.rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.rightEye.position.set(0.17, 0.10, 0.40);
        this.mesh.add(this.rightEye);
        
        // Pupils (dark centers)
        const pupilGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x220000 }); // Very dark red/black
        
        this.leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        this.leftPupil.position.set(-0.17, 0.10, 0.44);
        this.mesh.add(this.leftPupil);
        
        this.rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        this.rightPupil.position.set(0.17, 0.10, 0.44);
        this.mesh.add(this.rightPupil);
        
        // Angry brow — thick and prominent matching spritesheet
        const browGeo = new THREE.BoxGeometry(0.14, 0.035, 0.04);
        const browMat = new THREE.MeshBasicMaterial({ color: 0x1565C0 }); // Darker blue brow
        this.leftBrow = new THREE.Mesh(browGeo, browMat);
        this.leftBrow.position.set(-0.17, 0.20, 0.38);
        this.leftBrow.rotation.z = 0.30; // Angled inward (angry)
        this.mesh.add(this.leftBrow);
        
        this.rightBrow = new THREE.Mesh(browGeo, browMat);
        this.rightBrow.position.set(0.17, 0.20, 0.38);
        this.rightBrow.rotation.z = -0.30;
        this.mesh.add(this.rightBrow);
        
        // Mouth — small determined frown
        const mouthGeo = new THREE.BoxGeometry(0.12, 0.025, 0.03);
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x1a3a5a });
        this.mouth = new THREE.Mesh(mouthGeo, mouthMat);
        this.mouth.position.set(0, -0.06, 0.42);
        this.mesh.add(this.mouth);
        
        // Cigar — brown cylinder body + orange ember end, matching spritesheet
        const cigarMat = new THREE.MeshPhongMaterial({ color: 0x8B6914, shininess: 20 });
        const cigarGeo = new THREE.CylinderGeometry(0.025, 0.022, 0.22, 8);
        this.cigar = new THREE.Mesh(cigarGeo, cigarMat);
        this.cigar.rotation.z = -0.3;
        this.cigar.rotation.x = Math.PI / 2;
        this.cigar.position.set(0.14, -0.04, 0.48);
        this.mesh.add(this.cigar);
        // Cigar lit tip (orange ember)
        const emberGeo = new THREE.SphereGeometry(0.028, 6, 6);
        const emberMat = new THREE.MeshBasicMaterial({ color: 0xFF6600 });
        this.cigarEmber = new THREE.Mesh(emberGeo, emberMat);
        this.cigarEmber.position.set(0.24, -0.01, 0.48);
        this.mesh.add(this.cigarEmber);
        
        // Head bandage wrap — positioned higher around curved tip matching spritesheet
        const bandageMat = new THREE.MeshPhongMaterial({
          color: 0xF5DEB3,
          emissive: 0x8B7355,
          emissiveIntensity: 0.1,
          shininess: 10
        });
        // Main wrap band around upper head
        const wrapGeo = new THREE.TorusGeometry(0.38, 0.06, 6, 16);
        this.bandageWrap = new THREE.Mesh(wrapGeo, bandageMat);
        this.bandageWrap.position.set(0.04, 0.35, 0);
        this.bandageWrap.rotation.x = Math.PI / 2;
        this.bandageWrap.rotation.z = 0.20;
        this.mesh.add(this.bandageWrap);
        // Second wrap band for thicker look
        const wrap2Geo = new THREE.TorusGeometry(0.34, 0.04, 6, 16);
        this.bandageWrap2 = new THREE.Mesh(wrap2Geo, bandageMat);
        this.bandageWrap2.position.set(0.06, 0.42, 0);
        this.bandageWrap2.rotation.x = Math.PI / 2;
        this.bandageWrap2.rotation.z = 0.10;
        this.mesh.add(this.bandageWrap2);
        
        // Bandage tail hanging from wrap
        const tailGeo = new THREE.BoxGeometry(0.08, 0.28, 0.04);
        this.bandageTail = new THREE.Mesh(tailGeo, bandageMat);
        this.bandageTail.position.set(-0.24, 0.22, -0.20);
        this.bandageTail.rotation.z = 0.35;
        this.mesh.add(this.bandageTail);
        
        // Eye blink animation timer
        this.blinkTimer = 0;
        this.blinkDuration = 0.1; // 100ms blink
        this.nextBlinkTime = 2 + Math.random() * 3; // Random 2-5 seconds
        this.isBlinking = false;
        
        // Arms — thick and stubby with fist ends matching spritesheet
        const armGeo = new THREE.CylinderGeometry(0.06, 0.10, 0.24, 8);
        const limbMaterial = new THREE.MeshPhongMaterial({
          color: 0x3A9FD8,             // Match deeper sea-blue body color
          emissive: 0x0A3D5C,          // Match deep ocean blue emissive
          emissiveIntensity: 0.35,     // Match body for consistent glow
          shininess: 120,              // Match body's enhanced water shine
          specular: 0x88CCFF,          // Bright specular highlights for wet look
          transparent: true,
          opacity: 0.88,               // Match body opacity
          reflectivity: 0.6            // Match body reflectivity for consistent water appearance
        });
        
        // Left arm
        this.leftArm = new THREE.Mesh(armGeo, limbMaterial);
        this.leftArm.position.set(-0.38, 0, 0.05);
        this.leftArm.rotation.z = Math.PI / 5; // Angled outward
        this.mesh.add(this.leftArm);
        // Left fist
        const fistGeo = new THREE.SphereGeometry(0.10, 8, 8);
        this.leftFist = new THREE.Mesh(fistGeo, limbMaterial);
        this.leftFist.position.set(-0.44, -0.16, 0.05);
        this.mesh.add(this.leftFist);
        
        // Right arm (holding gun)
        this.rightArm = new THREE.Mesh(armGeo, limbMaterial);
        this.rightArm.position.set(0.38, 0, 0.05);
        this.rightArm.rotation.z = -Math.PI / 5; // Angled outward
        this.mesh.add(this.rightArm);
        // Right fist
        this.rightFist = new THREE.Mesh(fistGeo, limbMaterial);
        this.rightFist.position.set(0.44, -0.16, 0.05);
        this.mesh.add(this.rightFist);
        
        // Gun visual (held by right arm) - enhanced for better visibility
        const gunBodyGeo = new THREE.BoxGeometry(0.12, 0.16, 0.35); // Larger gun body
        const gunMat = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 40 });
        this.gunBody = new THREE.Mesh(gunBodyGeo, gunMat);
        this.gunBody.position.set(0.42, -0.05, 0.35);
        this.mesh.add(this.gunBody);

        // Gun barrel - longer and thicker
        const barrelGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.3, 8);
        const barrelMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
        this.gunBarrel = new THREE.Mesh(barrelGeo, barrelMat);
        this.gunBarrel.rotation.x = Math.PI / 2;
        this.gunBarrel.position.set(0.42, -0.05, 0.56);
        this.mesh.add(this.gunBarrel);

        // Gun scope / sight for visibility
        const sightGeo = new THREE.BoxGeometry(0.04, 0.05, 0.06);
        const sightMat = new THREE.MeshPhongMaterial({ color: 0x666666, shininess: 60 });
        this.gunSight = new THREE.Mesh(sightGeo, sightMat);
        this.gunSight.position.set(0.42, 0.04, 0.35);
        this.mesh.add(this.gunSight);

        // Gun handle
        const handleGeo = new THREE.BoxGeometry(0.07, 0.18, 0.10);
        const handleMat = new THREE.MeshPhongMaterial({ color: 0x8B4513, shininess: 20 }); // Brown handle
        this.gunHandle = new THREE.Mesh(handleGeo, handleMat);
        this.gunHandle.position.set(0.42, -0.22, 0.25);
        this.gunHandle.rotation.z = -Math.PI / 6;
        this.mesh.add(this.gunHandle);
        
        // Legs — short and thick matching spritesheet's stubby legs
        const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.24, 8);
        
        // Left leg
        this.leftLeg = new THREE.Mesh(legGeo, limbMaterial);
        this.leftLeg.position.set(-0.17, -0.42, 0);
        this.mesh.add(this.leftLeg);
        // Left foot
        const footGeo = new THREE.SphereGeometry(0.09, 8, 6);
        this.leftFoot = new THREE.Mesh(footGeo, limbMaterial);
        this.leftFoot.position.set(-0.17, -0.54, 0.02);
        this.leftFoot.scale.set(1, 0.6, 1.2);
        this.mesh.add(this.leftFoot);
        
        // Right leg
        this.rightLeg = new THREE.Mesh(legGeo, limbMaterial);
        this.rightLeg.position.set(0.17, -0.42, 0);
        this.mesh.add(this.rightLeg);
        // Right foot
        this.rightFoot = new THREE.Mesh(footGeo, limbMaterial);
        this.rightFoot.position.set(0.17, -0.54, 0.02);
        this.rightFoot.scale.set(1, 0.6, 1.2);
        this.mesh.add(this.rightFoot);
        
        // Smoke particles timer
        this.smokeTimer = 0;
        
        // Breathing animation states (breath-in with cigar glow, breath-out with smoke)
        this.breathTimer = 0;
        this.breathCycle = 4.0; // 4 seconds per breath cycle
        this.isBreathingIn = false;
        
        // Pulsing glow
        const glowGeo = new THREE.SphereGeometry(0.55, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({ 
          color: 0x4FC3F7, 
          transparent: true, 
          opacity: 0.2,
          side: THREE.BackSide
        });
        this.glow = new THREE.Mesh(glowGeo, glowMat);
        this.mesh.add(this.glow);
        
        // Aura Force Field (visible when aura weapon is active) - spiritual yellow-white energy sphere
        // Solid dome sphere disabled — only the ground fog ring remains visible
        this.auraCircle = null;
        this.currentAuraRange = 2.0;
        // Inner pulsing fog ring at feet level
        const auraFogGeo = new THREE.TorusGeometry(1.8, 0.3, 8, 24);
        const auraFogMat = new THREE.MeshBasicMaterial({
          color: 0xFFFFCC,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        this.auraFogRing = new THREE.Mesh(auraFogGeo, auraFogMat);
        this.auraFogRing.rotation.x = -Math.PI / 2;
        this.auraFogRing.position.y = 0.15;
        this.auraFogRing.visible = false;
        const scn = _getScene();
        if (scn) {
          scn.add(this.auraFogRing);
        }
        
        // Fire Ring Orbs (visible when fireRing weapon is active)
        this.fireRingOrbs = [];
        this.fireRingAngle = 0;
        
        // Physics/Visuals
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.targetScale = new THREE.Vector3(1, 1, 1);
        this.trailTimer = 0;
        this.wobblePhase = 0;
        // Spring-damper for waterdrop deformation
        this.scaleYVel = 0;       // spring velocity for Y scale
        this.scaleXZVel = 0;      // spring velocity for XZ scale
        this.currentScaleY = 1.0;
        this.currentScaleXZ = 1.0;
        this.wobbleIntensity = 0; // spikes on direction change / dash
        this.prevVelDir = new THREE.Vector3(); // previous velocity direction for direction-change detection
        this.postDashSquish = 0;  // timer for post-dash bounce
        this.wasMoving = false;   // used to detect stopping transition for squish
        this._prevSpeedMag = 0;   // speed magnitude from the previous frame (for stop-wobble amplitude)
        // Dedicated stopping-wobble state for a properly damped sine-wave water-settling effect
        this._stopWobbleTimer   = 0; // elapsed time since stop (seconds)
        this._stopWobbleInitAmp = 0; // initial amplitude at moment of stop (0–1)
        // Movement feel: lean, bank, slide
        this.prevMoveAngle = 0;     // previous movement direction angle
        this.angularVelocity = 0;   // rate of turn (rad/sec)
        this.slideAmount = 0;       // visual slide intensity on sharp turns (0-1)
        this.forwardLean = 0;       // current forward lean angle
        this.bankLean = 0;          // current banking lean angle (for turns)
        
        // Phase 5: Low health water bleed timer
        this.waterBleedTimer = 0;
        // Low HP boil state — rapid scale/color pulse when HP < 25%
        this._lowHpBoilTime = 0;
        
        // Dash
        this.isDashing = false;
        this.dashTime = 0;
        this.dashDuration = 0.2;
        this.dashVec = new THREE.Vector3();
        
        // Invulnerability frames to prevent instant death
        this.invulnerable = false;
        this.invulnerabilityTime = 0;
        this.invulnerabilityDuration = 0.5; // 500ms of invulnerability after taking damage
        
        // X eyes effect when hit
        this.xEyesActive = false;
        this.xEyes = [];
        
        // Store base scale for breathing animation efficiency
        this.baseScale = 1.0;
        this._breathScale = 1.0; // Multiplier from breathing animation, applied on top of spring-damper

        // ─── New Visual Physics Systems — State Variables ──────────────────────
        // System 1 - Membrane
        this._membrane = null;
        this._membraneWobbleX = 0; this._membraneWobbleZ = 0;
        this._membraneWobbleVX = 0; this._membraneWobbleVZ = 0;
        // System 2 - Inner fluid
        this._innerFluid = null;
        this._fluidOffsetX = 0; this._fluidOffsetZ = 0; this._fluidOffsetY = 0;
        this._fluidVX = 0; this._fluidVZ = 0;
        this._prevVelX = 0; this._prevVelZ = 0;
        this._prevSpeedMagFluid = 0;
        // System 3 - Highlights
        this._highlightMain = null; this._highlightSub = null;
        // System 4 - Shadow
        this._dynamicShadow = null;
        // System 5 - Trail
        this._trailDropTimer = 0; this._trailPool = [];
        // System 6 - Enhanced deform
        this._breathLean = 0;
        // System 7 - Damage response
        this._damagePhase = 0; this._damagePhaseTimer = 0;
        // System 8 - Idle
        this._idleDropTimer = 2 + Math.random() * 2;
        this._gravitySettleY = 0;
        this._idleTipX = 0; this._idleTipZ = 0;
        this._eyeMicroTimer = 3 + Math.random() * 3;
        this._eyeBaseX = null;
        // Shared time accumulator
        this._localTime = 0;

        // ─── Create Visual Meshes for New Systems ─────────────────────────────
        try {
          const _newSysScene = _getScene();

          // System 1: Surface Tension Membrane Shell
          const _memGeo = new THREE.SphereGeometry(0.52, 20, 20);
          const _memPos = _memGeo.attributes.position;
          for (let _i = 0; _i < _memPos.count; _i++) {
            const _my = _memPos.getY(_i), _mx = _memPos.getX(_i), _mz = _memPos.getZ(_i);
            if (_my > 0) {
              _memPos.setY(_i, _my * 1.35);
              const _mt = _my / 0.52;
              const _ms = 1 - _mt * 0.55;
              _memPos.setX(_i, _mx * _ms);
              _memPos.setZ(_i, _mz * _ms);
              if (_mt > 0.5) {
                const _mb = (_mt - 0.5) * 2.0;
                _memPos.setX(_i, _memPos.getX(_i) + _mb * 0.18);
                _memPos.setZ(_i, _memPos.getZ(_i) - _mb * 0.06);
              }
            } else {
              const _mbg = 1 + Math.abs(_my / 0.52) * 0.15;
              _memPos.setX(_i, _mx * _mbg);
              _memPos.setZ(_i, _mz * _mbg);
            }
          }
          _memGeo.computeVertexNormals();
          // Use MeshPhysicalMaterial if available, fall back to MeshPhongMaterial
          const _memBaseOpts = {
            color: 0x88ddff, transparent: true, opacity: 0.18,
            side: THREE.FrontSide, depthWrite: false,
            blending: THREE.AdditiveBlending,
            emissive: new THREE.Color(0x1a88cc), emissiveIntensity: 0.08
          };
          const _memMat = (typeof THREE.MeshPhysicalMaterial === 'function')
            ? new THREE.MeshPhysicalMaterial(Object.assign({ roughness: 0.0, metalness: 0.1 }, _memBaseOpts))
            : new THREE.MeshPhongMaterial(Object.assign({ shininess: 80 }, _memBaseOpts));
          this._membrane = new THREE.Mesh(_memGeo, _memMat);
          this._membrane.position.copy(this.mesh.position);
          if (_newSysScene) _newSysScene.add(this._membrane);

          // System 2: Inner Fluid Core
          this._innerFluid = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 12, 12),
            new THREE.MeshBasicMaterial({
              color: 0xaaeeff, transparent: true, opacity: 0.55,
              depthWrite: false, blending: THREE.AdditiveBlending
            })
          );
          if (_newSysScene) _newSysScene.add(this._innerFluid);

          // System 3: Specular Highlight Spots
          this._highlightMain = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, depthWrite: false })
          );
          this._highlightSub = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xddeeff, transparent: true, opacity: 0.4, depthWrite: false })
          );
          if (_newSysScene) {
            _newSysScene.add(this._highlightMain);
            _newSysScene.add(this._highlightSub);
          }

          // System 4: Dynamic Ground Shadow
          this._dynamicShadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 32),
            new THREE.MeshBasicMaterial({
              color: 0x001122, transparent: true, opacity: 0.35,
              depthWrite: false, side: THREE.DoubleSide
            })
          );
          this._dynamicShadow.rotation.x = -Math.PI / 2;
          this._dynamicShadow.position.set(this.mesh.position.x, 0.01, this.mesh.position.z);
          if (_newSysScene) _newSysScene.add(this._dynamicShadow);

          // System 5: Build trail ring pool
          this._buildTrailPool();
        } catch (_initErr) {
          console.warn('[Player] Visual physics systems init error:', _initErr);
        }
      }

      _buildTrailPool() {
        try {
          const _scn = _getScene();
          if (!_scn) return;
          for (let _ti = 0; _ti < 12; _ti++) {
            const _tGeo = new THREE.RingGeometry(0.0, 0.3, 16);
            const _tMat = new THREE.MeshBasicMaterial({
              color: 0x44aacc, transparent: true, opacity: 0.0,
              depthWrite: false, side: THREE.DoubleSide
            });
            const _tMesh = new THREE.Mesh(_tGeo, _tMat);
            _tMesh.rotation.x = -Math.PI / 2;
            _tMesh.position.y = 0.02;
            _scn.add(_tMesh);
            this._trailPool.push({ active: false, life: 0, maxLife: 0.8, mesh: _tMesh });
          }
        } catch (_e) {
          console.warn('[Player] Trail pool build error:', _e);
        }
      }

      update(dt) {
        // ─── Local time accumulator (used by all new visual systems) ──────────
        try { this._localTime = (this._localTime || 0) + dt; } catch (_e) {}
        const _time = this._localTime || 0;
        // Store previous velocity for fluid inertia simulation (System 2)
        const _prevVelXStore = this._prevVelX || 0;
        const _prevVelZStore = this._prevVelZ || 0;

        // Update invulnerability timer
        const INVULNERABILITY_FLASH_FREQUENCY = 20; // Flash 20 times per second during invulnerability
        if (this.invulnerable) {
          this.invulnerabilityTime += dt;
          if (this.invulnerabilityTime >= this.invulnerabilityDuration) {
            this.invulnerable = false;
            this.invulnerabilityTime = 0;
            this._isEvaporating = false;
          }
          // Flash effect during invulnerability — ghostly low opacity during Evaporation
          if (this._isEvaporating) {
            this.mesh.material.opacity = Math.floor(this.invulnerabilityTime * INVULNERABILITY_FLASH_FREQUENCY) % 2 === 0 ? 0.15 : 0.3;
          } else if (Math.floor(this.invulnerabilityTime * INVULNERABILITY_FLASH_FREQUENCY) % 2 === 0) {
            this.mesh.material.opacity = 0.5;
          } else {
            this.mesh.material.opacity = 0.75;
          }
        } else {
          this.mesh.material.opacity = 0.75; // Normal opacity
        }
        
        // Phase 5: Water bleed effect when health < 30%
        const healthPercent = playerStats.hp / playerStats.maxHp;
        if (healthPercent < 0.3) {
          this.waterBleedTimer += dt;
          if (this.waterBleedTimer > 0.08) { // Fast drip
            this.waterBleedTimer = 0;
            spawnWaterDroplet(this.mesh.position);
            // Add blue water particles trailing behind
            if (Math.random() < 0.5) {
              spawnParticles(this.mesh.position, COLORS.player, 1);
            }
          }
        }

        // Low-HP boil: when HP < 25%, rapidly pulse scale and tint the mesh red
        // to visually communicate imminent death ("boiling water drop").
        // LOW_HP_BOIL_THRESHOLD = 0.25 (matches the 25% danger zone)
        if (healthPercent < 0.25 && healthPercent > 0) {
          this._lowHpBoilTime += dt;
          // Boil frequency ramps from 12 Hz (at 25 % HP) to 20 Hz (at 0 % HP)
          const boilDanger = (0.25 - healthPercent) / 0.25; // 0→1 as HP drops to 0
          const boilFreq   = 12 + boilDanger * 8; // 12–20 Hz
          const boilAmp    = 0.06 + boilDanger * 0.08; // 6–14 % scale deviation
          const boilPulse  = Math.sin(this._lowHpBoilTime * boilFreq * Math.PI * 2) * boilAmp;
          // Additively applied on top of the existing spring-damper scale each frame
          this.mesh.scale.y  *= (1 + boilPulse);
          this.mesh.scale.x  *= (1 - boilPulse * 0.6);
          this.mesh.scale.z  *= (1 - boilPulse * 0.6);
          // Tint mesh toward red: R ramps 0.3→1.0, G fixed 0.2, B ramps 0.3→0.0
          if (this.mesh.material && this.mesh.material.color) {
            this.mesh.material.color.setRGB(
              0.3 + boilDanger * 0.7, // R: near-normal tint → full red
              0.2,                     // G: slight blue-green dampened
              0.3 - boilDanger * 0.3   // B: fades out as danger peaks
            );
          }
        } else if (this._lowHpBoilTime > 0) {
          // Fade boil state — reset timer and restore normal colour
          this._lowHpBoilTime = 0;
          if (this.mesh.material && this.mesh.material.color) {
            this.mesh.material.color.setHex(COLORS.player);
          }
        }
        
        // Dash Logic
        if (this.isDashing) {
          this.dashTime -= dt;
          const t = 1 - (this.dashTime / this.dashDuration);
          // Dash distance uses the upgradeable dashDistance variable
          const dashSpeed = (dashDistance / this.dashDuration); // units per second
          const speed = Math.sin(t * Math.PI) * dashSpeed; // Slow-Fast-Slow curve
          this.mesh.position.x += this.dashVec.x * speed * dt;
          this.mesh.position.z += this.dashVec.z * speed * dt;
          
          // Enhanced splash effect trail during dash - MORE PARTICLES
          if (Math.random() < 0.7) { // Increased from 0.5
            spawnParticles(this.mesh.position, COLORS.player, 3); // Increased from 2
            spawnWaterDroplet(this.mesh.position);
            // Add white sparkle particles during dash
            if (Math.random() < 0.4) {
              spawnParticles(this.mesh.position, 0xFFFFFF, 2);
            }
          }
          
          // DASH DESTRUCTION: Destroy any destructible prop dashed into
          if (window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (prop.destroyed) continue;
              const ddx = this.mesh.position.x - prop.mesh.position.x;
              const ddz = this.mesh.position.z - prop.mesh.position.z;
              const ddist2 = ddx * ddx + ddz * ddz;
              if (ddist2 < 4) { // Within 2 units - destroy on dash
                prop.destroyed = true;
                // Big destruction effect
                const pPos = prop.mesh.position;
                if (prop.type === 'tree') {
                  spawnParticles(pPos, 0x8B4513, 25);
                  spawnParticles(pPos, 0x228B22, 20);
                  // Tree falls and remains as debris (does not disappear)
                  const fallDir = Math.random() < 0.5 ? 1 : -1;
                  const fallAxis = Math.random() < 0.5 ? 'x' : 'z';
                  const fallDuration = 500;
                  const fallStart = Date.now();
                  if (prop.mesh.userData.leaves) prop.mesh.userData.leaves.visible = false;
                  const treeMesh = prop.mesh;
                  if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                    let dashFallTimer = 0;
                    const dashFallFrames = Math.ceil(fallDuration / 16);
                    managedAnimations.push({ update(_dt) {
                      dashFallTimer++;
                      const progress = Math.min(dashFallTimer / dashFallFrames, 1);
                      if (fallAxis === 'x') treeMesh.rotation.x = (Math.PI / 2) * progress * fallDir;
                      else treeMesh.rotation.z = (Math.PI / 2) * progress * fallDir;
                      treeMesh.position.y = -progress * 1.5;
                      return progress < 1;
                    }});
                  }
                } else if (prop.type === 'barrel') {
                  spawnParticles(pPos, 0xFF4500, 30);
                  spawnParticles(pPos, 0xFFFF00, 15);
                  // Leave broken debris on ground instead of removing
                  prop.mesh.scale.set(0.8, 0.3, 0.8);
                  prop.mesh.position.y = 0.15;
                  prop.mesh.rotation.x = (Math.random() - 0.5) * 0.8;
                  prop.mesh.rotation.z = (Math.random() - 0.5) * 0.8;
                  if (prop.mesh.material) prop.mesh.material.color.setHex(0x654321);
                  if (prop.mesh.material) prop.mesh.material.opacity = 0.7;
                } else {
                  spawnParticles(pPos, 0xD2691E, 20);
                  // Leave broken crate debris on ground
                  prop.mesh.scale.set(0.7, 0.25, 0.7);
                  prop.mesh.position.y = 0.12;
                  prop.mesh.rotation.x = (Math.random() - 0.5) * 1.0;
                  prop.mesh.rotation.z = (Math.random() - 0.5) * 1.0;
                  if (prop.mesh.material) prop.mesh.material.color.setHex(0x8B6914);
                  if (prop.mesh.material) prop.mesh.material.opacity = 0.6;
                }
                // Screen shake on big destruction
                if (window.triggerScreenShake) window.triggerScreenShake(0.3);
              }
            }
          }
          
          // DASH DESTRUCTION: Destroy fences dashed into
          if (window.breakableFences) {
            for (let fence of window.breakableFences) {
              if (!fence.userData.isFence || fence.userData.hp <= 0) continue;
              const fdx = this.mesh.position.x - fence.position.x;
              const fdz = this.mesh.position.z - fence.position.z;
              if (fdx * fdx + fdz * fdz < 4) {
                fence.userData.hp = 0;
                spawnParticles(fence.position, 0x8B4513, 15);
                // Leave fence debris on ground instead of removing
                fence.scale.set(1, 0.2, 1);
                fence.position.y = 0.05;
                fence.rotation.x = (Math.random() - 0.5) * 1.5;
                if (fence.material) fence.material.opacity = 0.5;
              }
            }
          }
          // DASH DESTRUCTION: Break through trees and props when dashing
          if (window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (prop.destroyed) continue;
              const pdx = this.mesh.position.x - prop.mesh.position.x;
              const pdz = this.mesh.position.z - prop.mesh.position.z;
              if (pdx * pdx + pdz * pdz < 2.5) {
                prop.hp = 0;
                prop.destroyed = true;
                spawnParticles(prop.mesh.position, prop.type === 'tree' ? 0x228B22 : 0x8B4513, 20);
                prop.mesh.scale.set(1, 0.2, 1);
                prop.mesh.position.y = 0.05;
                prop.mesh.rotation.x = (Math.random() - 0.5) * 1.5;
                if (prop.mesh.material) {
                  prop.mesh.material.transparent = true;
                  prop.mesh.material.opacity = 0.5;
                }
              }
            }
          }
          
          if (this.dashTime <= 0) {
            this.isDashing = false;
            // Event Horizon: spawn a black hole at dash end position
            if (window._nmEventHorizon && window._spawnEventHorizon) {
              window._spawnEventHorizon(this.mesh.position.clone());
            }
          }
        }
        // Movement
        else {
          const targetVel = new THREE.Vector3(0, 0, 0);
        
          // Movement with LEFT stick
          if (joystickLeft.active) {
            const rageSpeedMult = this._rageSpeedMult || 1;
            // Stamina speed penalty: at 0 stamina player moves at 50%, scales linearly up to 100%
            const staminaPct = (typeof playerStats !== 'undefined' && playerStats.maxStamina > 0)
              ? Math.max(0, (playerStats.stamina || 0) / playerStats.maxStamina)
              : 1;
            const staminaSpeedMult = 0.5 + staminaPct * 0.5; // 50% at 0 stamina, 100% at full
            const speed = GAME_CONFIG.playerSpeedBase * (playerStats.walkSpeed / 25) * 60 * rageSpeedMult * staminaSpeedMult;
            targetVel.x = joystickLeft.x * speed * dt;
            targetVel.z = joystickLeft.y * speed * dt;
          }
          
          // Movement physics: attribute-scaled acceleration with direction-change awareness
          const turnResp = (playerStats.turnResponse || 1.0);
          const stopResp = (playerStats.stopResponse || 1.0);
          const mobility = (playerStats.mobilityScore || 1.0);
          
          // Detect direction change intensity for adaptive acceleration
          const currSpeed = this.velocity.length();
          let dirChangeAmount = 0;
          if (currSpeed > 0.03 && targetVel.lengthSq() > 0.0001) {
            const currDir = this.velocity.clone().normalize();
            const targetDir = targetVel.clone().normalize();
            dirChangeAmount = Math.max(0, 1 - currDir.dot(targetDir));
          }
          
          // Adaptive lerp: faster on direction change (snappier turns), normal on straight runs
          // inputResponsiveness is the per-frame lerp factor (0.07 at L1 = sluggish, 0.5 = instant)
          // frictionGrip is the stopping lerp factor (0.035 at L1 = slides, 0.25 = snaps to stop)
          const accelLerp = playerStats.inputResponsiveness || GAME_CONFIG.accelLerpFactor;
          const decelLerp = playerStats.frictionGrip        || GAME_CONFIG.decelLerpFactor;
          const isChangingDir = dirChangeAmount > 0.25;
          const isStopping = !joystickLeft.active;
          let baseLerp;
          if (isStopping) {
            baseLerp = decelLerp * stopResp;
          } else if (isChangingDir) {
            baseLerp = accelLerp * turnResp * (1.0 + dirChangeAmount * 0.4);
          } else {
            baseLerp = accelLerp * turnResp;
          }
          const lerpFactor = Math.min(baseLerp * (dt * 60), 1.0);
          this.velocity.lerp(targetVel, lerpFactor);
          
          // Track angular velocity of movement direction for banking/slide visuals
          if (currSpeed > 0.03) {
            const moveAngle = Math.atan2(this.velocity.x, this.velocity.z);
            let angleDelta = moveAngle - this.prevMoveAngle;
            while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
            while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
            const rawAngVel = (dt > 0.001) ? angleDelta / dt : 0;
            this.angularVelocity += (rawAngVel - this.angularVelocity) * Math.min(dt * 15, 0.8);
            this.prevMoveAngle = moveAngle;
            
            // Slide trigger: sharp turn at speed — unlocked by mobility upgrades
            const turnIntensity = Math.abs(this.angularVelocity) * currSpeed;
            const slideThreshold = Math.max(0.1, 0.5 - mobility * 0.12);
            if (turnIntensity > slideThreshold && mobility >= 1.0) {
              this.slideAmount = Math.min(1, this.slideAmount + dt * 6);
            }
          } else {
            this.angularVelocity *= 0.85;
          }
          this.slideAmount = Math.max(0, this.slideAmount - dt * 3);
          
          // Apply velocity with inertia — skipped in sandbox; SandboxLoop._movePlayer() owns position/collision
          if (!window._engine2SandboxMode) {
          this.mesh.position.x += this.velocity.x;
          this.mesh.position.z += this.velocity.z;
          
          // Solid collision with map objects (trees, barrels, crates) — player bounces off
          if (window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (prop.destroyed) continue;
              const collisionRadius = prop.type === 'tree' ? 1.0 : 0.7;
              const pdx = this.mesh.position.x - prop.mesh.position.x;
              const pdz = this.mesh.position.z - prop.mesh.position.z;
              const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
              if (pdist < collisionRadius && pdist > 0.001) {
                // Push player out of object
                const pushX = (pdx / pdist) * collisionRadius;
                const pushZ = (pdz / pdist) * collisionRadius;
                this.mesh.position.x = prop.mesh.position.x + pushX;
                this.mesh.position.z = prop.mesh.position.z + pushZ;
                // Kill inward velocity
                const dot = this.velocity.x * pdx + this.velocity.z * pdz;
                if (dot < 0) {
                  this.velocity.x -= (dot / (pdist * pdist)) * pdx;
                  this.velocity.z -= (dot / (pdist * pdist)) * pdz;
                }
                // Wobble the object on collision
                if (!prop._wobbleTime) prop._wobbleTime = 0;
                prop._wobbleTime = 1.0; // Start wobble for 1 second
                if (!prop._wobbleDir) prop._wobbleDir = { x: -pdx / pdist, z: -pdz / pdist };
                else { prop._wobbleDir.x = -pdx / pdist; prop._wobbleDir.z = -pdz / pdist; }
              }
            }
          }
          // Solid collision with fences — also wobble on contact
          if (window.breakableFences) {
            for (let fence of window.breakableFences) {
              if (!fence.userData || !fence.userData.isFence || fence.userData.hp <= 0) continue;
              const fdx = this.mesh.position.x - fence.position.x;
              const fdz = this.mesh.position.z - fence.position.z;
              const fdist = Math.sqrt(fdx * fdx + fdz * fdz);
              if (fdist < 0.6 && fdist > 0.001) {
                this.mesh.position.x = fence.position.x + (fdx / fdist) * 0.6;
                this.mesh.position.z = fence.position.z + (fdz / fdist) * 0.6;
                // Wobble fence on collision
                if (!fence.userData._wobbleTime) fence.userData._wobbleTime = 0;
                fence.userData._wobbleTime = 0.8;
                if (!fence.userData._wobbleDir) fence.userData._wobbleDir = { x: -fdx / fdist, z: -fdz / fdist };
                else { fence.userData._wobbleDir.x = -fdx / fdist; fence.userData._wobbleDir.z = -fdz / fdist; }
              }
            }
          }

          // Solid collision with resource rocks/crystals — player cannot walk through them
          if (window.GameHarvesting && window.GameHarvesting.harvestNodes) {
            for (let node of window.GameHarvesting.harvestNodes) {
              if (node.depleted || !node.mesh) continue;
              // Use per-type collision radius from NODE_DEFS scaled factor; bushes/grass are passable
              const passable = node.type === 'berryBush' || node.type === 'flowerPatch' || node.type === 'vegetablePatch';
              if (passable) continue;
              // Collision radius: use node's defined radius scaled by NODE_COLLISION_RADIUS_SCALE
              const nodeRadius = window.GameHarvesting._nodeRadius ? window.GameHarvesting._nodeRadius(node.type) : 0.9;
              const collRadius = nodeRadius;
              const ndx = this.mesh.position.x - node.mesh.position.x;
              const ndz = this.mesh.position.z - node.mesh.position.z;
              const ndist = Math.sqrt(ndx * ndx + ndz * ndz);
              if (ndist < collRadius && ndist > 0.001) {
                // Push player out
                this.mesh.position.x = node.mesh.position.x + (ndx / ndist) * collRadius;
                this.mesh.position.z = node.mesh.position.z + (ndz / ndist) * collRadius;
                const dot = this.velocity.x * ndx + this.velocity.z * ndz;
                if (dot < 0) {
                  this.velocity.x -= (dot / (ndist * ndist)) * ndx;
                  this.velocity.z -= (dot / (ndist * ndist)) * ndz;
                }
                // Wobble the rock on collision
                node._wobbleTime = 0.7;
                if (!node._wobbleDir) node._wobbleDir = { x: -ndx / ndist, z: -ndz / ndist };
                else { node._wobbleDir.x = -ndx / ndist; node._wobbleDir.z = -ndz / ndist; }
              }
            }
          }
          } // end !window._engine2SandboxMode (velocity application + collision)

          // Enhanced water droplet trail when moving - MORE PARTICLES
          if (this.velocity.length() > 0.01) {
            this.trailTimer += dt;
            if (this.trailTimer > 0.25) { // Trail frequency (was 0.15)
              this.trailTimer = 0;
              spawnWaterDroplet(this.mesh.position);
              // Add extra splash particles during movement
              if (Math.random() < 0.3) {
                spawnParticles(this.mesh.position, COLORS.player, 1);
              }
            }
          } else {
            // Idle
            this.trailTimer = 0;
          }
          
          // Physics-based lean: forward lean into movement, bank lean on turns
          // Replaces world-space velocity lean that caused 'rolling' on direction changes
          const leanSpd = this.velocity.length();
          const mobilityLean = (playerStats.mobilityScore || 1.0);
          
          if (leanSpd > 0.02) {
            // Forward lean: proportional to speed, character leans into movement direction
            // Since mesh.rotation.y faces movement dir, rotation.x = forward tilt
            const maxFwdLean = -(0.12 + Math.min(mobilityLean * 0.06, 0.18));
            const targetFwdLean = Math.max(maxFwdLean, -leanSpd * 2.0);
            
            // Bank lean: driven by angular velocity — lean INTO turns, not world-space roll
            // Higher mobility = more pronounced banking (looks agile)
            const maxBank = 0.18 + Math.min(mobilityLean * 0.08, 0.24);
            const bankInput = -this.angularVelocity * 0.025 * (1 + this.slideAmount * 0.6);
            const targetBank = Math.max(-maxBank, Math.min(maxBank, bankInput));
            
            // Responsive lean interpolation
            const leanDt = Math.min(dt * 14, 0.65);
            this.forwardLean += (targetFwdLean - this.forwardLean) * leanDt;
            this.bankLean += (targetBank - this.bankLean) * leanDt;
          } else {
            // Gravity-weighted settle back to upright
            const settleDt = Math.min(dt * 8, 0.45);
            this.forwardLean += (0 - this.forwardLean) * settleDt;
            this.bankLean += (0 - this.bankLean) * settleDt;
          }
          
          // rotation.x/z — skipped in sandbox; SandboxLoop._movePlayer() owns lean visuals
          if (!window._engine2SandboxMode) {
            this.mesh.rotation.x = this.forwardLean;
            this.mesh.rotation.z = this.bankLean;
          }
          
          // Rotation/Aiming with RIGHT stick (independent of movement) — skipped in sandbox;
          // SandboxLoop._movePlayer() owns facing via _aimJoy / mouse.
          if (!window._engine2SandboxMode) {
          if (joystickRight.active) {
            // Manual aim: Turn to face the direction of right stick
            let angle = Math.atan2(joystickRight.x, joystickRight.y);
            
            // FRESH: Precision aiming - 15% nudge toward nearest enemy when right joystick active
            if (enemies && enemies.length > 0) {
              let nearestEnemy = null;
              let minDist = Infinity;
              enemies.forEach(e => {
                if (e && !e.isDead) {
                  const dist = this.mesh.position.distanceTo(e.mesh.position);
                  if (dist < minDist && dist < 15) { // Only nudge if enemy within reasonable range
                    minDist = dist;
                    nearestEnemy = e;
                  }
                }
              });
              
              if (nearestEnemy) {
                const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
                const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
                const enemyAngle = Math.atan2(dx, dz);
                
                // Blend 85% player input + 15% toward enemy (subtle magnetism)
                let angleDiff = enemyAngle - angle;
                // Normalize angle difference to -PI to PI
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                angle = angle + angleDiff * 0.15; // 15% nudge
              }
            }
            
            this.mesh.rotation.y = angle;
          } else if (gameSettings.autoAim && enemies && enemies.length > 0) {
            // Auto-aim when enabled (works in any orientation)
            // Accuracy starts low and improves with dexterity/upgrades via autoAimAccuracy stat
            let nearestEnemy = null;
            let minDist = Infinity;
            enemies.forEach(e => {
              if (e && !e.isDead) {
                const dist = this.mesh.position.distanceTo(e.mesh.position);
                if (dist < minDist) {
                  minDist = dist;
                  nearestEnemy = e;
                }
              }
            });
            if (nearestEnemy) {
              const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
              const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
              const perfectAngle = Math.atan2(dx, dz);
              // Apply accuracy: low accuracy adds a stable offset (updated every 150ms, not every frame)
              // This prevents per-frame random jitter that causes the character to wobble rapidly
              const accuracy = playerStats.autoAimAccuracy || 0.3;
              const maxError = (1 - accuracy) * (Math.PI / 4); // up to 45° off at 0% accuracy
              // Recalculate aim error every 150ms (not every frame) to prevent per-frame jitter
              if (!this._nextAimErrorUpdate || gameTime >= this._nextAimErrorUpdate) {
                this._nextAimErrorUpdate = gameTime + 0.15; // 150ms between aim-error updates
                this._currentAimError = (Math.random() - 0.5) * 2 * maxError;
              }
              const targetAngle = perfectAngle + (this._currentAimError || 0);
              // Lerp toward target angle to avoid snapping
              let angleDiff = targetAngle - this.mesh.rotation.y;
              while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
              while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
              this.mesh.rotation.y += angleDiff * Math.min(10 * dt, 1);
            }
          } else if (joystickLeft.active) {
            // If no right stick input and no auto-aim, rotate to face movement direction
            // Only update rotation if joystick has meaningful input (prevents jitter near center)
            if (targetVel.lengthSq() > 0.000001) {
              const angle = Math.atan2(targetVel.x, targetVel.z);
              // Smooth rotation with responsiveness scaling (starts slow at level 1, gets faster with upgrades)
              const rotationSpeed = 8 + (playerStats.inputResponsiveness || 1.0) * 2; // 8-10+ rad/s
              let angleDiff = angle - this.mesh.rotation.y;
              // Normalize angle difference to [-PI, PI]
              while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
              while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
              // Lerp rotation smoothly
              this.mesh.rotation.y += angleDiff * Math.min(rotationSpeed * dt, 1);
            }
          }
          } // end !window._engine2SandboxMode (rotation.y aim writes)
        }
        
        const speedMag = this.velocity.length();
        
        // Waterdrop physics: spring-damper squish/bounce/wobble
        const dt2 = Math.min(dt, 0.05);
        
        // Detect direction changes to spike wobble intensity
        if (speedMag > 0.04) {
          const velDir = this.velocity.clone().normalize();
          const dirDot = velDir.dot(this.prevVelDir);
          const dirChange = 1 - dirDot;
          if (dirChange > 0.2) {
            // Over-exaggerate wobble on direction changes for dynamic feel
            this.wobbleIntensity = Math.min(1, this.wobbleIntensity + dirChange * 4.0);
            // System 6: Jiggle physics on sharp turns — widening body during angular impulses
            try {
              if (Math.abs(this.angularVelocity) > 0.5) {
                this.scaleXZVel += Math.abs(this.angularVelocity) * 0.4;
              }
            } catch (_e) {}
            // Full reversal (dot < -0.5): dramatic stretch + water trail
            if (dirDot < -0.5 && speedMag > 0.06) {
              this.postDashSquish = Math.max(this.postDashSquish, 0.9);
              this.wobbleIntensity = 1;
              // Spawn water trail particles to show sliding
              for (let i = 0; i < 4; i++) spawnWaterParticle(this.mesh.position);
            }
          }
          this.prevVelDir.copy(velDir);
        }
        // Decay wobble intensity
        this.wobbleIntensity = Math.max(0, this.wobbleIntensity - dt2 * 3);
        
        // Stopping squish: detect transition from moving to fully stopped
        if (this.wasMoving && speedMag < 0.02 && !this.isDashing) {
          this.postDashSquish = Math.max(this.postDashSquish, 0.7);
          this.wobbleIntensity = Math.min(1, this.wobbleIntensity + 0.5);
          // Kick off dedicated stopping-wobble — amplitude scales with pre-stop speed
          this._stopWobbleInitAmp = Math.min(0.55, 0.2 + this._prevSpeedMag * 2.0);
          this._stopWobbleTimer = 0;
        }
        this._prevSpeedMag = speedMag;
        this.wasMoving = speedMag > 0.02;
        // Advance stopping-wobble timer only when an active wobble is running
        if (this._stopWobbleInitAmp > 0) this._stopWobbleTimer += dt2;

        // Post-dash / post-stop squish bounce timer
        if (!this.isDashing && this.postDashSquish > 0) {
          this.postDashSquish = Math.max(0, this.postDashSquish - dt2 * 4);
        }
        if (this.isDashing) {
          this.postDashSquish = 1.0;
          this.wobbleIntensity = Math.min(1, this.wobbleIntensity + 0.8);
        }
        
        // Compute target scales
        let targetScaleY, targetScaleXZ;
        if (this.isDashing) {
          // Dash START: quick squish then elongate (gives a "push-off" feel)
          const dashProg = 1 - (this.dashTime / this.dashDuration);
          if (dashProg < 0.2) {
            const t = dashProg / 0.2;
            targetScaleY = 1.0 - t * 0.55;   // 1.0 → 0.45 squish
            targetScaleXZ = 1.0 + t * 0.5;   // 1.0 → 1.5 expand
          } else {
            // Dash BODY: fully elongated in travel direction
            targetScaleY = 0.45;
            targetScaleXZ = 1.5;
          }
        } else if (this.postDashSquish > 0.01) {
          // Post-dash/stop/turn oscillating bounce — over-exaggerated for comic waterdrop feel
          const bounce = Math.sin(this.postDashSquish * Math.PI * 3.0) * 0.45 * this.postDashSquish;
          targetScaleY = 1.0 + bounce;
          targetScaleXZ = 1.0 - bounce * 0.6;
        } else if (this._stopWobbleInitAmp > 0 && this._stopWobbleTimer < 1.2) {
          // System 6: Upgraded multi-axis stop wobble — XZ 90° out of phase with Y
          // Creates the "water settling" effect where vertical and horizontal bounce alternate
          const _sw6Decay = Math.exp(-4.0 * this._stopWobbleTimer);
          const _sw6Phase = this._stopWobbleTimer * 18;
          const stopWobbleY  = Math.sin(_sw6Phase) * this._stopWobbleInitAmp * _sw6Decay;
          const stopWobbleXZ = Math.sin(_sw6Phase + Math.PI / 2) * this._stopWobbleInitAmp * 0.6 * _sw6Decay;
          targetScaleY  = 1.0 + stopWobbleY;
          targetScaleXZ = 1.0 - stopWobbleXZ;
          // Fade out once energy is negligible
          if (_sw6Decay < 0.02) this._stopWobbleInitAmp = 0;
        } else if (speedMag > 0.05) {
          // Moving: squash Y and expand XZ proportional to speed (stretching in direction of travel),
          // plus a vertical bounce oscillation for a jelly-drop feel.
          this.wobblePhase += dt2 * speedMag * 120;
          // Velocity stretch: faster = more horizontal squash
          const velSquash = Math.min(speedMag * 2.2, 0.38);
          const bounce = Math.sin(this.wobblePhase) * (0.14 + this.wobbleIntensity * 0.18);
          targetScaleY  = 1.0 - velSquash + bounce; // squashed vertically at speed
          const squishAmt = Math.min(speedMag * 1.8, 0.30);
          targetScaleXZ = 1.0 + squishAmt + Math.cos(this.wobblePhase) * (0.06 + this.wobbleIntensity * 0.10);
        } else {
          // Idle breathing
          this.wobblePhase += dt2 * 2.5;
          targetScaleY = 1.0 + Math.sin(this.wobblePhase) * 0.03;
          targetScaleXZ = 1.0 - Math.sin(this.wobblePhase) * 0.015;
        }
        
        // Spring-damper integration (k=200 stiffness, c=18 damping)
        const springK = 200, springC = 18;
        const forceY = springK * (targetScaleY - this.currentScaleY) - springC * this.scaleYVel;
        const forceXZ = springK * (targetScaleXZ - this.currentScaleXZ) - springC * this.scaleXZVel;
        this.scaleYVel += forceY * dt2;
        this.scaleXZVel += forceXZ * dt2;
        this.currentScaleY += this.scaleYVel * dt2;
        this.currentScaleXZ += this.scaleXZVel * dt2;
        // Clamp to sane range
        this.currentScaleY = Math.max(0.3, Math.min(2.0, this.currentScaleY));
        this.currentScaleXZ = Math.max(0.5, Math.min(2.0, this.currentScaleXZ));
        // Note: mesh.scale is applied after breathing section, combined with _breathScale
        
        // Shed water particles when moving fast
        if (speedMag > 0.4 && Math.random() < dt2 * speedMag * 3 && !this.isDashing) {
          const n = Math.floor(Math.random() * 2) + 1;
          for (let i = 0; i < n; i++) spawnWaterParticle(this.mesh.position);
        }
        
        // Animate water shine
        this.shine.rotation.y += 0.05;
        this.shine.rotation.x += 0.03;
        
        // Pulse highlight
        this.highlight.material.opacity = 0.6 + Math.sin(gameTime * 3) * 0.2;
        
        // Pulse glow effect
        this.glow.material.opacity = 0.15 + Math.sin(gameTime * 2) * 0.1;
        this.glow.scale.set(
          1 + Math.sin(gameTime * 2) * 0.05,
          1 + Math.sin(gameTime * 2) * 0.05,
          1 + Math.sin(gameTime * 2) * 0.05
        );
        
        // Animate arms and legs — speed-proportional, turn-aware
        if (speedMag > 0.1) {
          // Phase speed scales with velocity — faster movement = faster limb swing
          const walkRate = 6 + Math.min(speedMag * 25, 14);
          const walkPhase = gameTime * walkRate;
          // Amplitude scales with speed — faster = wider swing
          const armAmp = Math.min(0.2 + speedMag * 1.2, 0.55);
          const legAmp = Math.min(0.25 + speedMag * 1.5, 0.65);
          this.leftArm.rotation.x = Math.sin(walkPhase) * armAmp;
          this.rightArm.rotation.x = -Math.sin(walkPhase) * armAmp;
          this.leftLeg.rotation.x = -Math.sin(walkPhase) * legAmp;
          this.rightLeg.rotation.x = Math.sin(walkPhase) * legAmp;
          // Bank-aware arm offset — arms shift during turns for balance
          const armBankOffset = this.bankLean * 0.5;
          this.leftArm.rotation.z = armBankOffset;
          this.rightArm.rotation.z = -armBankOffset;
        } else {
          // Idle - gentle sway
          const idlePhase = gameTime * 2;
          this.leftArm.rotation.x = Math.sin(idlePhase) * 0.1;
          this.rightArm.rotation.x = Math.sin(idlePhase + Math.PI) * 0.1;
          this.leftLeg.rotation.x = 0;
          this.rightLeg.rotation.x = 0;
          this.leftArm.rotation.z = 0;
          this.rightArm.rotation.z = 0;
        }
        
        // Bandage tail sway — physics-like trailing motion
        if (this.bandageTail) {
          this.bandageTail.rotation.x = Math.sin(gameTime * 4 + speedMag * 2) * 0.2 * (1 + speedMag * 0.5);
        }
        
        // Breathing animation (subtle body scaling)
        this._breathScale = 1.0;
        this.breathTimer += dt;
        const breathPhase = (this.breathTimer % this.breathCycle) / this.breathCycle;
        if (breathPhase < 0.4) {
          const inhaleProgress = breathPhase / 0.4;
          this._breathScale = 1 + inhaleProgress * 0.05;
        } else if (breathPhase < 0.5) {
          this._breathScale = 1.05;
        } else {
          const exhaleProgress = (breathPhase - 0.5) / 0.5;
          this._breathScale = 1.05 - exhaleProgress * 0.05;
        }
        
        // Apply spring-damper scale combined with breathing multiplier
        // Directional stretch: mesh local Z = forward, local X = sideways
        // Character reaches/elongates toward destination — cool and dynamic
        const mobilityStretch = (playerStats.mobilityScore || 1.0);
        const baseStretch = this.isDashing
          ? 0.5
          : Math.min(speedMag * (1.8 + mobilityStretch * 0.4), 0.32);
        // Slide adds extra sideways compression (body narrows during slide turns)
        const slideStretch = this.slideAmount * 0.12;
        const dirStretch = baseStretch + slideStretch;

        // AdvancedPhysics velocity-coupled squash/stretch enhancement
        let velStretchY = 1, velStretchXZ = 1;
        if (window.AdvancedPhysics && window.AdvancedPhysics.SquashStretch && speedMag > 0.3) {
          const ss = window.AdvancedPhysics.SquashStretch.compute(speedMag, 12, 0.3);
          velStretchY  = ss.sy;
          velStretchXZ = ss.sx;
        }

        const _scaleY  = this.currentScaleY * this._breathScale * velStretchY;
        const _scaleXZ = this.currentScaleXZ * this._breathScale * velStretchXZ;
        const _scaleX  = _scaleXZ * (1.0 - dirStretch * 0.6);
        const _scaleZ  = _scaleXZ * (1.0 + dirStretch * 0.5);
        this.mesh.scale.y = Math.max(0.1, Math.min(3.0, isNaN(_scaleY) ? 1.0 : _scaleY));
        this.mesh.scale.x = Math.max(0.1, Math.min(3.0, isNaN(_scaleX) ? 1.0 : _scaleX));
        this.mesh.scale.z = Math.max(0.1, Math.min(3.0, isNaN(_scaleZ) ? 1.0 : _scaleZ));

        // ─── New Visual Physics Systems Update ────────────────────────────────

        // System 7: Damage phase multi-phase water response
        try {
          if (this._damagePhase > 0) {
            this._damagePhaseTimer += dt;
            if (this._damagePhase === 1) {
              // Phase 1 (0–80 ms): Impact compression — body squashes flat
              if (this._membrane) {
                this._membraneWobbleVX += (Math.random() - 0.5) * 6;
                this._membraneWobbleVZ += (Math.random() - 0.5) * 6;
              }
              if (this._innerFluid) this._fluidOffsetY = Math.min(0.18, this._fluidOffsetY + dt * 3.0);
              if (this._damagePhaseTimer >= 0.08) { this._damagePhase = 2; this._damagePhaseTimer = 0; }
            } else if (this._damagePhase === 2) {
              // Phase 2 (80–200 ms): Rebound overshoot — pulse highlights to max
              if (this._highlightMain && this._highlightMain.material) this._highlightMain.material.opacity = 0.9;
              if (this._highlightSub && this._highlightSub.material) {
                // Cache base opacity once so we can restore it after the damage pulse
                if (typeof this._highlightSubBaseOpacity !== 'number') {
                  this._highlightSubBaseOpacity = this._highlightSub.material.opacity;
                }
                this._highlightSub.material.opacity = 0.8;
              }
              if (this._damagePhaseTimer >= 0.12) {
                this._damagePhase = 3;
                this._damagePhaseTimer = 0;
                // Restore sub highlight opacity when leaving phase 2
                if (this._highlightSub && this._highlightSub.material &&
                    typeof this._highlightSubBaseOpacity === 'number') {
                  this._highlightSub.material.opacity = this._highlightSubBaseOpacity;
                }
              }
            } else if (this._damagePhase === 3) {
              // Phase 3 (200–500 ms): Settling oscillation — let spring-damper handle it
              if (this._damagePhaseTimer >= 0.3) { this._damagePhase = 0; this._damagePhaseTimer = 0; }
            }
          }
        } catch (_e) {}

        // System 6: Subtle asymmetric breathing lean (additive to existing forward lean)
        try {
          const _blTarget = Math.sin(_time * 1.1) * 0.008;
          this._breathLean = (this._breathLean || 0) + (_blTarget - (this._breathLean || 0)) * Math.min(dt * 5, 1);
          if (this.mesh && !isNaN(this._breathLean)) this.mesh.rotation.x += this._breathLean;
        } catch (_e) {}

        // System 1: Fluid Surface Tension Membrane update
        try {
          if (this._membrane) {
            // Spring-damper for independent membrane wobble (k=18, d=4)
            const _mForceX = -18 * this._membraneWobbleX - 4 * this._membraneWobbleVX;
            const _mForceZ = -18 * this._membraneWobbleZ - 4 * this._membraneWobbleVZ;
            this._membraneWobbleVX += _mForceX * dt;
            this._membraneWobbleVZ += _mForceZ * dt;
            this._membraneWobbleX  += this._membraneWobbleVX * dt;
            this._membraneWobbleZ  += this._membraneWobbleVZ * dt;
            // Direction-change impulse when sliding
            if (this.slideAmount > 0.3) {
              const _mSign = this.slideAmount * dt * 20;
              this._membraneWobbleVX += (this.velocity.x > 0 ? 1 : -1) * _mSign * 0.8;
              this._membraneWobbleVZ += (this.velocity.z > 0 ? 1 : -1) * _mSign * 0.8;
            }
            // Position — offset from body by wobble
            this._membrane.position.copy(this.mesh.position);
            this._membrane.position.x += this._membraneWobbleX * 0.06;
            this._membrane.position.z += this._membraneWobbleZ * 0.06;
            // Scale with body + independent ripple
            const _mScaleXZ = this.currentScaleXZ + Math.sin(_time * 8)  * 0.015 * this.wobbleIntensity;
            const _mScaleY  = this.currentScaleY  + Math.cos(_time * 11) * 0.01  * this.wobbleIntensity;
            this._membrane.scale.set(
              Math.max(0.1, _mScaleXZ * this._breathScale),
              Math.max(0.1, _mScaleY  * this._breathScale),
              Math.max(0.1, _mScaleXZ * this._breathScale)
            );
            // Rotate slightly out of sync with body
            this._membrane.rotation.y = this.mesh.rotation.y + this._membraneWobbleX * 0.15;
            // Idle shimmer (System 8 integration)
            if (this._membrane.material) {
              this._membrane.material.opacity = (speedMag < 0.02)
                ? 0.14 + Math.sin(_time * Math.PI * 2) * 0.04
                : 0.18;
            }
          }
        } catch (_e) {}

        // System 2: Internal Fluid Sloshing Core update
        try {
          if (this._innerFluid) {
            // Acceleration of body this frame (clamped ±5)
            let _accelX = dt > 0.001 ? (this.velocity.x - _prevVelXStore) / dt : 0;
            let _accelZ = dt > 0.001 ? (this.velocity.z - _prevVelZStore) / dt : 0;
            _accelX = Math.max(-5, Math.min(5, _accelX));
            _accelZ = Math.max(-5, Math.min(5, _accelZ));
            // Fluid pushed opposite to acceleration (sloshing) — scaled by dt for frame-rate independence
            this._fluidVX += -_accelX * 0.12 * dt;
            this._fluidVZ += -_accelZ * 0.12 * dt;
            // Spring back to center (k=22, d=5)
            this._fluidVX += (-22 * this._fluidOffsetX - 5 * this._fluidVX) * dt;
            this._fluidVZ += (-22 * this._fluidOffsetZ - 5 * this._fluidVZ) * dt;
            this._fluidOffsetX += this._fluidVX * dt;
            this._fluidOffsetZ += this._fluidVZ * dt;
            // Vertical slosh: up when stopping, down when accelerating
            const _speedChange = speedMag - (this._prevSpeedMagFluid || 0);
            this._fluidOffsetY = Math.max(-0.12, Math.min(0.18, this._fluidOffsetY - _speedChange * 0.5));
            this._fluidOffsetY *= 0.92;
            this._prevSpeedMagFluid = speedMag;
            // Clamp offset inside body (max radius 0.14)
            const _fLen = Math.sqrt(this._fluidOffsetX * this._fluidOffsetX + this._fluidOffsetZ * this._fluidOffsetZ);
            if (_fLen > 0.14) {
              this._fluidOffsetX = (this._fluidOffsetX / _fLen) * 0.14;
              this._fluidOffsetZ = (this._fluidOffsetZ / _fLen) * 0.14;
            }
            // Apply world position
            this._innerFluid.position.set(
              this.mesh.position.x + this._fluidOffsetX,
              this.mesh.position.y + 0.05 + this._fluidOffsetY,
              this.mesh.position.z + this._fluidOffsetZ
            );
            // Scale: squishes when moving fast, swells when stopping
            const _fScale = 0.95 + this._fluidOffsetY * 0.8 + speedMag * 0.15;
            this._innerFluid.scale.setScalar(Math.max(0.6, Math.min(1.4, _fScale)));
            // Opacity pulses with heartbeat rhythm
            if (this._innerFluid.material) {
              this._innerFluid.material.opacity = 0.45 + Math.sin(_time * 2.2) * 0.08 + Math.min(speedMag * 0.15, 0.2);
            }
          }
        } catch (_e) {}

        // System 3: Specular Highlight Simulation update
        try {
          if (this._highlightMain && this._highlightSub) {
            const _hlAngle = _time * 0.4 + (this._membraneWobbleX || 0) * 0.5;
            this._highlightMain.position.set(
              this.mesh.position.x - 0.14 + Math.sin(_hlAngle) * 0.04,
              this.mesh.position.y + 0.22 + this.currentScaleY * 0.08,
              this.mesh.position.z + 0.32
            );
            if (this._damagePhase !== 2) {
              if (this._highlightMain.material) {
                this._highlightMain.material.opacity = Math.max(0, Math.min(1, 0.55 + (this._fluidOffsetY || 0) * 0.3));
              }
              this._highlightMain.scale.setScalar(Math.max(0.5, 1 + speedMag * 0.3));
            }
            this._highlightSub.position.set(
              this.mesh.position.x - 0.22,
              this.mesh.position.y + 0.28 + this.currentScaleY * 0.1,
              this.mesh.position.z + 0.28
            );
          }
        } catch (_e) {}

        // System 4: Gravity-Responsive Ground Shadow update
        try {
          if (this._dynamicShadow) {
            this._dynamicShadow.position.x += (this.mesh.position.x - this._dynamicShadow.position.x) * 0.3;
            this._dynamicShadow.position.z += (this.mesh.position.z - this._dynamicShadow.position.z) * 0.3;
            const _shScaleX = Math.max(0.1, this.currentScaleXZ * (1 + this.slideAmount * 0.4));
            const _shScaleZ = Math.max(0.1, this.currentScaleXZ * (1 + speedMag * 0.2));
            this._dynamicShadow.scale.set(_shScaleX, 1, _shScaleZ);
            if (this._dynamicShadow.material) {
              this._dynamicShadow.material.opacity = Math.max(0, Math.min(0.6, 0.25 + (1 - this.currentScaleY) * 0.3));
            }
          }
        } catch (_e) {}

        // System 5: Water Trail Footprint ripples update
        try {
          if (this._trailPool && this._trailPool.length > 0) {
            // Spawn a new trail ring when moving
            this._trailDropTimer += dt;
            if (speedMag > 0.1 && this._trailDropTimer > 0.12) {
              this._trailDropTimer = 0;
              for (let _ti = 0; _ti < this._trailPool.length; _ti++) {
                const _ts = this._trailPool[_ti];
                if (!_ts.active) {
                  _ts.active = true;
                  _ts.life = 0;
                  _ts.maxLife = 0.8;
                  _ts.mesh.position.x = this.mesh.position.x;
                  _ts.mesh.position.z = this.mesh.position.z;
                  if (_ts.mesh.material) _ts.mesh.material.color.setHex(0x44aacc);
                  break;
                }
              }
            }
            // Update all active trail ripples (expand and fade)
            for (let _ti = 0; _ti < this._trailPool.length; _ti++) {
              const _ts = this._trailPool[_ti];
              if (!_ts.active) continue;
              _ts.life += dt;
              const _tt = Math.min(_ts.life / _ts.maxLife, 1.0);
              _ts.mesh.scale.set(Math.max(0.001, _tt * 2), 1, Math.max(0.001, _tt * 2));
              if (_ts.mesh.material) _ts.mesh.material.opacity = Math.max(0, 0.3 * (1 - _tt));
              if (_ts.life >= _ts.maxLife) {
                _ts.active = false;
                if (_ts.mesh.material) _ts.mesh.material.opacity = 0;
                _ts.mesh.scale.set(0.001, 1, 0.001);
              }
            }
          }
        } catch (_e) {}

        // System 8: Idle Ambient Water Animations
        try {
          // Ground-level check: skip Y settle while spawn intro animates the player up from depth
          const _nearGround = this.mesh && this.mesh.position.y >= 0.4 && this.mesh.position.y <= 0.7;
          if (speedMag < 0.02) {
            // Slow gravity settle — water sinks slightly over 2 seconds
            // Only applies when player is already at/near ground (not during spawn intro)
            if (_nearGround) {
              this._gravitySettleY = Math.min(this._gravitySettleY + dt * 0.01, 0.02);
              this.mesh.position.y = 0.5 - this._gravitySettleY;
            }
            // Micro-oscillation tipple (very subtle side-to-side)
            this._idleTipX = Math.sin(_time * 0.7 + 0.3) * 0.005;
            this._idleTipZ = Math.cos(_time * 0.9) * 0.004;
            if (this.mesh) {
              this.mesh.rotation.x += this._idleTipX;
              this.mesh.rotation.z += this._idleTipZ;
            }
            // Random droplet bead falling off the character — only when injured (below 50% HP)
            this._idleDropTimer -= dt;
            if (this._idleDropTimer <= 0) {
              this._idleDropTimer = 2 + Math.random() * 2;
              if (typeof spawnWaterDroplet === 'function' && this.mesh &&
                  typeof playerStats !== 'undefined' && playerStats.hp < playerStats.maxHp * 0.5) {
                const _dropPos = this.mesh.position.clone();
                _dropPos.y -= 0.3;
                spawnWaterDroplet(_dropPos);
              }
            }
            // Eye micro-movements — use dedicated timer to avoid frame-rate dependence
            try {
              if (this.leftEye && this.rightEye) {
                if (!this._eyeMicroTimer) this._eyeMicroTimer = 3 + Math.random() * 3;
                this._eyeMicroTimer -= dt;
                if (this._eyeMicroTimer <= 0) {
                  this._eyeMicroTimer = 3 + Math.random() * 3;
                  // Apply micro-offset relative to original position (bounded ±0.01)
                  if (!this._eyeBaseX) this._eyeBaseX = this.leftEye.position.x;
                  const _eyeOff = (Math.random() - 0.5) * 0.01;
                  this.leftEye.position.x  = this._eyeBaseX + _eyeOff;
                  this.rightEye.position.x = -this._eyeBaseX - _eyeOff;
                }
              }
            } catch (_e2) {}
          } else {
            // Restore settle offset when moving — only adjust Y when near ground
            this._gravitySettleY = Math.max(0, this._gravitySettleY - dt * 0.05);
            if (_nearGround && this.mesh) {
              const _targetY = 0.5 - this._gravitySettleY;
              if (Math.abs(this.mesh.position.y - _targetY) > 0.001) {
                this.mesh.position.y += (_targetY - this.mesh.position.y) * Math.min(dt * 3, 1);
              }
            }
          }
        } catch (_e) {}

        // Blinking eyes animation
        this.blinkTimer += dt;
        if (this.blinkTimer >= this.nextBlinkTime) {
          this.isBlinking = true;
          this.blinkTimer = 0;
          this.nextBlinkTime = 2 + Math.random() * 3; // Next blink in 2-5 seconds
        }
        
        if (this.isBlinking) {
          // Scale eyes down vertically for blink effect
          const blinkProgress = Math.min(1, this.blinkTimer / this.blinkDuration);
          if (blinkProgress < 0.5) {
            // Closing
            const scale = 1 - (blinkProgress * 2);
            this.leftEye.scale.y = scale;
            this.rightEye.scale.y = scale;
            this.leftPupil.scale.y = scale;
            this.rightPupil.scale.y = scale;
            if (this.leftEyeWhite) this.leftEyeWhite.scale.y = scale;
            if (this.rightEyeWhite) this.rightEyeWhite.scale.y = scale;
          } else {
            // Opening
            const scale = (blinkProgress - 0.5) * 2;
            this.leftEye.scale.y = scale;
            this.rightEye.scale.y = scale;
            this.leftPupil.scale.y = scale;
            this.rightPupil.scale.y = scale;
            if (this.leftEyeWhite) this.leftEyeWhite.scale.y = scale;
            if (this.rightEyeWhite) this.rightEyeWhite.scale.y = scale;
          }
          
          if (blinkProgress >= 1) {
            this.isBlinking = false;
            this.blinkTimer = 0;
            // Reset scale
            this.leftEye.scale.y = 1;
            this.rightEye.scale.y = 1;
            this.leftPupil.scale.y = 1;
            this.rightPupil.scale.y = 1;
            if (this.leftEyeWhite) this.leftEyeWhite.scale.y = 1;
            if (this.rightEyeWhite) this.rightEyeWhite.scale.y = 1;
          }
        }
        
        // Update aura force field — REDESIGNED: Heartbeat pulsing waves expanding outward
        if (weapons.aura.active) {
          // Initialize aura wave system if needed
          if (!this.auraPulseWaves) {
            this.auraPulseWaves = [];
            this.auraPulseTimer = 0;
          }

          // Hide old static fog ring
          this.auraFogRing.visible = false;

          // Heartbeat pulse timing: Create new wave every 600ms (100 BPM heartbeat)
          this.auraPulseTimer -= dt * 1000;
          if (this.auraPulseTimer <= 0) {
            this.auraPulseTimer = 600; // 100 BPM heartbeat rhythm

            // Create new expanding wave ring from player
            const waveGeo = new THREE.RingGeometry(0.1, 0.3, 24);
            const waveMat = new THREE.MeshBasicMaterial({
              color: 0xFFEE88, // Golden-yellow spiritual energy
              transparent: true,
              opacity: 0.6,
              side: THREE.DoubleSide,
              depthWrite: false
            });
            const wave = new THREE.Mesh(waveGeo, waveMat);
            wave.rotation.x = -Math.PI / 2; // Lay flat on ground
            wave.position.set(this.mesh.position.x, 0.05, this.mesh.position.z);

            const targetScene = _getScene();
            if (targetScene) {
              targetScene.add(wave);

              // Track wave data for animation
              this.auraPulseWaves.push({
                mesh: wave,
                life: 1.0, // Normalized life 1.0 → 0.0
                maxRadius: weapons.aura.range * 1.2 // Wave expands to aura range
              });
            }
          }

          // Update all active waves
          for (let i = this.auraPulseWaves.length - 1; i >= 0; i--) {
            const wave = this.auraPulseWaves[i];
            wave.life -= dt * 1.2; // Wave lasts ~0.83 seconds

            if (wave.life <= 0) {
              // Wave expired, remove it
              const targetScene = _getScene();
              if (targetScene) {
                targetScene.remove(wave.mesh);
              }
              wave.mesh.geometry.dispose();
              wave.mesh.material.dispose();
              this.auraPulseWaves.splice(i, 1);
            } else {
              // Wave expands outward and fades
              const progress = 1 - wave.life; // 0.0 → 1.0
              const currentRadius = progress * wave.maxRadius;

              // Update ring geometry to expand
              wave.mesh.geometry.dispose();
              wave.mesh.geometry = new THREE.RingGeometry(
                currentRadius * 0.85, // Inner radius
                currentRadius * 1.0,  // Outer radius (creates thin ring)
                24
              );

              // Fade out as wave expands
              wave.mesh.material.opacity = wave.life * 0.5; // Fades from 0.5 to 0

              // Slight color shift: yellow → white as it expands
              const colorLerp = progress * 0.3;
              wave.mesh.material.color.setRGB(
                1.0,
                0.93 + colorLerp, // Slightly whiter
                0.55 + colorLerp
              );

              // Keep wave centered on player (player can move while waves expand)
              wave.mesh.position.x = this.mesh.position.x;
              wave.mesh.position.z = this.mesh.position.z;
            }
          }
        } else {
          // Aura inactive: clean up any remaining waves
          this.auraFogRing.visible = false;
          if (this.auraPulseWaves && this.auraPulseWaves.length > 0) {
            const targetScene = _getScene();
            for (const wave of this.auraPulseWaves) {
              if (targetScene) {
                targetScene.remove(wave.mesh);
              }
              wave.mesh.geometry.dispose();
              wave.mesh.material.dispose();
            }
            this.auraPulseWaves = [];
          }
        }
        
        // Update fire ring orbs
        if (weapons.fireRing.active) {
          const currentOrbCount = weapons.fireRing.orbs;
          
          // Add orbs if needed
          while (this.fireRingOrbs.length < currentOrbCount) {
            const geo = new THREE.SphereGeometry(0.3, 8, 8);
            const mat = new THREE.MeshBasicMaterial({
              color: 0xFF4500,
              transparent: true,
              opacity: 0.8
            });
            const orb = new THREE.Mesh(geo, mat);
            const targetScene = _getScene();
            if (targetScene) {
              targetScene.add(orb);
            }
            this.fireRingOrbs.push(orb);
          }

          // Remove extra orbs if downgraded (shouldn't happen but safety)
          while (this.fireRingOrbs.length > currentOrbCount) {
            const orb = this.fireRingOrbs.pop();
            const targetScene = _getScene();
            if (targetScene) {
              targetScene.remove(orb);
            }
            orb.geometry.dispose();
            orb.material.dispose();
          }
          
          // Update orb positions (orbit around player)
          this.fireRingAngle += weapons.fireRing.rotationSpeed * dt;
          const radius = weapons.fireRing.range;
          
          for (let i = 0; i < this.fireRingOrbs.length; i++) {
            const angle = this.fireRingAngle + (i * Math.PI * 2 / currentOrbCount);
            const orb = this.fireRingOrbs[i];
            orb.position.x = this.mesh.position.x + Math.cos(angle) * radius;
            orb.position.z = this.mesh.position.z + Math.sin(angle) * radius;
            orb.position.y = this.mesh.position.y + Math.sin(gameTime * 5 + i) * 0.3; // Bob up and down
            
            // Glow effect
            orb.material.opacity = 0.7 + Math.sin(gameTime * 8 + i) * 0.2;
            
            // Fire particles around each orb (throttled: every 3 frames)
            if (Math.floor(gameTime * 60) % 3 === i % 3) {
              spawnParticles(orb.position, 0xFF4500, 1);
            }
            if (Math.floor(gameTime * 60) % 7 === i % 7) {
              spawnParticles(orb.position, 0xFF8C00, 1);
            }
          }
        } else {
          // Hide orbs when weapon not active
          for (let orb of this.fireRingOrbs) {
            orb.visible = false;
          }
        }

        // Camera Follow — frame-rate independent lerp + look-ahead + Y height bob
        const dtMs = dt * 1000;
        // Smoothing constant: 0.12/frame @ 60fps → frame-rate independent
        const camLerpFactor = 1 - Math.pow(0.88, dtMs / 16.67);
        // Look-ahead: peek slightly in the movement direction
        const targetCamX = this.mesh.position.x + this.velocity.x * 2.5;
        const targetCamZ = this.mesh.position.z + 16 + this.velocity.z * 2.5;
        camera.position.x += (targetCamX - camera.position.x) * camLerpFactor;
        camera.position.z += (targetCamZ - camera.position.z) * camLerpFactor;
        // Y height bob: rise 0.3 units when sprinting/dashing, settle at base
        const _camBaseY = (typeof RENDERER_CONFIG !== 'undefined' && RENDERER_CONFIG.cameraPositionY) || 13;
        const speedMagCam = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
        const _camBobMax = this.isDashing ? 0.3 : 0.15; // Dash rises 0.3, sprint rises 0.15
        const targetCamY = _camBaseY + Math.min(speedMagCam / 0.1, 1) * _camBobMax;
        const camYLerp = 1 - Math.pow(0.95, dtMs / 16.67); // ~0.05 per frame at 60fps
        camera.position.y += (targetCamY - camera.position.y) * camYLerp;
        camera.lookAt(this.mesh.position);

        // Bounds (Compact map is 240x240, from -120 to 120)
        this.mesh.position.x = Math.max(-120, Math.min(120, this.mesh.position.x));
        this.mesh.position.z = Math.max(-120, Math.min(120, this.mesh.position.z));

        // Persist previous velocity for next frame's fluid inertia calculation (System 2)
        try {
          this._prevVelX = this.velocity.x;
          this._prevVelZ = this.velocity.z;
        } catch (_e) {}
      }

      dash(dx, dz) {
        if (this.isDashing) return;
        // Dash must be unlocked via skill tree (set by calculateTotalPlayerStats).
        // Check for explicit false only: undefined (old saves without the aggregator) still allow dash
        // for backward compatibility; new saves start with dashUnlocked=false and unlock via skill tree.
        if (typeof playerStats !== 'undefined' && playerStats !== null && playerStats.dashUnlocked === false) return;

        // Stamina check: need enough stamina to dash (dashStaminaCost% of maxStamina)
        if (typeof playerStats !== 'undefined' && playerStats !== null) {
          const maxSta  = playerStats.maxStamina  || 100;
          const costPct = playerStats.dashStaminaCost || 49;
          const cost    = maxSta * costPct / 100;
          if ((playerStats.stamina || 0) < cost) return; // not enough stamina
          playerStats.stamina = Math.max(0, (playerStats.stamina || 0) - cost);
        }

        this.isDashing = true;
        this.dashTime = this.dashDuration;

        
        // Splash effect on dash start - more dramatic
        spawnParticles(this.mesh.position, COLORS.player, 10); // Reduced for performance
        for(let i=0; i<8; i++) {
          spawnWaterDroplet(this.mesh.position);
        }

        // System 5: Spawn 3 large dash-burst ripples
        try {
          if (this._trailPool && this._trailPool.length > 0) {
            let _spawned = 0;
            for (let _dti = 0; _dti < this._trailPool.length && _spawned < 3; _dti++) {
              const _dts = this._trailPool[_dti];
              if (!_dts.active) {
                _dts.active = true;
                _dts.life = 0;
                _dts.maxLife = 0.5;
                _dts.mesh.position.x = this.mesh.position.x;
                _dts.mesh.position.z = this.mesh.position.z;
                if (_dts.mesh.material) _dts.mesh.material.color.setHex(0x88ddff);
                _spawned++;
              }
            }
          }
        } catch (_e) {}
        
        // Direct mapping: Screen coordinates to World coordinates
        // Screen X-axis maps to World X-axis
        // Screen Y-axis maps to World Z-axis
        this.dashVec.set(dx, 0, dz).normalize();
        
        // Add dramatic lean/tilt in dash direction
        const dashAngleX = -dz * GAME_CONFIG.dashLeanFactor;
        const dashAngleZ = dx * GAME_CONFIG.dashLeanFactor;
        
        // Animate tilt during dash
        const originalRotX = this.mesh.rotation.x;
        const originalRotZ = this.mesh.rotation.z;
        
        // Quick tilt into dash
        this.mesh.rotation.x = dashAngleX;
        this.mesh.rotation.z = dashAngleZ;
        
        // Return to normal after dash with smooth animation
        setTimeout(() => {
          let returnProgress = 0;
          const returnDuration = GAME_CONFIG.dashLeanReturnDuration;
          const returnAnim = () => {
            returnProgress += 16; // ~16ms per frame
            const t = Math.min(returnProgress / returnDuration, 1);
            this.mesh.rotation.x = dashAngleX * (1 - t);
            this.mesh.rotation.z = dashAngleZ * (1 - t);
            if (t < 1) {
              requestAnimationFrame(returnAnim);
            }
          };
          returnAnim();
        }, this.dashDuration * 1000);
        
        // Water splash sound
        playSound('splash');
      }

      takeDamage(amount) {
        // Safety: do not process damage when game is not active or already over
        // Use typeof guards to avoid ReferenceError in sandbox mode where main.js
        // lexical vars (isGameActive, isGameOver) are not in scope.
        const gameActive = (typeof isGameActive !== 'undefined' ? isGameActive : false) || window.isGameActive;
        const gameOver   = (typeof isGameOver !== 'undefined' ? isGameOver : false)   || window.isGameOver;
        if (!gameActive || gameOver) return;
        // Prevent stray hits during boss kill-cam cinematics
        if (killCamActive) return;
        // Check invulnerability frames (hit-stun + dash invulnerability)
        if (this.invulnerable || dashInvulnerable) return;
        // Safety: ignore zero or negative damage to prevent phantom kills
        if (!amount || amount <= 0) return;

        // Dodge chance — chance to fully negate the hit
        if (playerStats.dodgeChance > 0 && Math.random() < playerStats.dodgeChance) {
          createFloatingText('DODGE!', this.mesh.position, '#00FFFF');
          spawnParticles(this.mesh.position, 0x00FFFF, 6);
          return;
        }

        // ── EVAPORATION: 5% chance when a Void/Alien gem is slotted ──────────────
        if (Math.random() < 0.05 && _playerHasVoidGem()) {
          _triggerEvaporation(this);
          return;
        }
        // ─────────────────────────────────────────────────────────────────────────

        // Armor reduction — delegated to GameCombat
        let reduced = calculateArmorReduction(amount, playerStats.armor);

        // Extra damage reduction from skill tree (additive with armor, after it)
        if (playerStats.damageReduction > 0) {
          reduced = Math.max(1, reduced * (1 - playerStats.damageReduction));
        }

        // Surface Tension: flat damage reduction per hit
        if (playerStats.surfaceTension > 0) {
          reduced = Math.max(0, reduced - playerStats.surfaceTension);
          if (reduced <= 0) {
            createFloatingText('ABSORBED!', this.mesh.position, '#5DADE2');
            return;
          }
        }

        // Last Stand — survive a fatal hit once per run
        if (playerStats.hasLastStand && !playerStats.lastStandUsed && playerStats.hp - reduced <= 0) {
          playerStats.lastStandUsed = true;
          playerStats.hp = 1;
          createFloatingText('LAST STAND!', this.mesh.position, '#FFD700');
          spawnParticles(this.mesh.position, 0xFFD700, 20);
          updateHUD();
          playSound('levelup');
          return;
        }

        playerStats.hp -= reduced;

        // ── IMMORTALITY BUG FIX: Check if player died ──
        if (playerStats.hp <= 0) {
          if (typeof gameOver === 'function') {
            gameOver();
          } else if (typeof window.gameOver === 'function') {
            window.gameOver();
          }
          return;
        }

        if (window.GameMilestones) window.GameMilestones.recordDamageTaken(reduced);
        // Add rage when taking damage (rage builds from combat)
        if (window.GameRageCombat && typeof window.GameRageCombat.addRage === 'function') {
          window.GameRageCombat.addRage(Math.ceil(reduced * 0.5)); // 50% of damage taken as rage
        }
        updateHUD();
        playSound('hit');
        
        // Trigger waterdrop UI attack animation
        const waterdropContainer = document.getElementById('waterdrop-container');
        if (waterdropContainer) {
          waterdropContainer.classList.add('attacked');
          setTimeout(() => {
            waterdropContainer.classList.remove('attacked');
          }, 400);
        }
        
        // Show "X" eyes when hit
        if (!this.xEyesActive) {
          this.xEyesActive = true;
          // Hide normal eyes
          this.leftEye.visible = false;
          this.rightEye.visible = false;
          this.leftPupil.visible = false;
          this.rightPupil.visible = false;
          if (this.leftEyeWhite) this.leftEyeWhite.visible = false;
          if (this.rightEyeWhite) this.rightEyeWhite.visible = false;
          
          // Create X shapes for eyes
          const xMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
          this.xEyes = [];
          
          // Left X
          const leftX1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          leftX1.position.set(-0.12, 0.1, 0.4);
          leftX1.rotation.z = Math.PI / 4;
          this.mesh.add(leftX1);
          this.xEyes.push(leftX1);
          
          const leftX2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          leftX2.position.set(-0.12, 0.1, 0.4);
          leftX2.rotation.z = -Math.PI / 4;
          this.mesh.add(leftX2);
          this.xEyes.push(leftX2);
          
          // Right X
          const rightX1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          rightX1.position.set(0.12, 0.1, 0.4);
          rightX1.rotation.z = Math.PI / 4;
          this.mesh.add(rightX1);
          this.xEyes.push(rightX1);
          
          const rightX2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          rightX2.position.set(0.12, 0.1, 0.4);
          rightX2.rotation.z = -Math.PI / 4;
          this.mesh.add(rightX2);
          this.xEyes.push(rightX2);
          
          // Remove X eyes after 300ms and restore normal eyes
          setTimeout(() => {
            this.xEyesActive = false;
            this.xEyes.forEach(x => this.mesh.remove(x));
            this.xEyes = [];
            this.leftEye.visible = true;
            this.rightEye.visible = true;
            this.leftPupil.visible = true;
            this.rightPupil.visible = true;
            if (this.leftEyeWhite) this.leftEyeWhite.visible = true;
            if (this.rightEyeWhite) this.rightEyeWhite.visible = true;
          }, 300);
        }
        
        // Show damage number for player (red color)
        const div = document.createElement('div');
        div.className = 'damage-number player-damage';
        div.innerText = `-${Math.floor(reduced)}`;
        div.style.color = '#FF4444';
        div.style.fontSize = '24px';
        div.style.fontWeight = 'bold';
        div.style.textShadow = '0 0 8px rgba(255,68,68,0.8), 2px 2px 4px #000';
        
        // Project 3D pos to 2D screen
        const vec = this.mesh.position.clone();
        vec.y += 2;
        vec.project(camera);
        
        const x = (vec.x * .5 + .5) * window.innerWidth;
        const y = (-(vec.y * .5) + .5) * window.innerHeight;
        
        div.style.position = 'absolute';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.transform = 'translate(-50%, -50%)';
        div.style.pointerEvents = 'none';
        div.style.zIndex = '1000';
        
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 1000);
        
        // Set invulnerability
        this.invulnerable = true;
        this.invulnerabilityTime = 0;
        
        // Visual flash
        this.mesh.material.color.setHex(0xFF0000);
        setTimeout(() => {
          this.mesh.material.color.setHex(COLORS.player);
        }, 100);
        
        // Water-themed blood effects for player (blue water droplets)
        // Spawn blue water particles (player's "blood")
        spawnParticles(this.mesh.position, COLORS.player, 8); // Blue water
        spawnParticles(this.mesh.position, 0x87CEEB, 5); // Light blue splash
        spawnParticles(this.mesh.position, 0xFFFFFF, 3); // White foam
        
        // Water droplets as player blood
        for(let i=0; i<5; i++) {
          spawnWaterDroplet(this.mesh.position);
        }
        
        // Advanced water blood system for player
        if (window.BloodSystem) {
          window.BloodSystem.emitWaterBurst(this.mesh.position, Math.min(Math.floor(8 + reduced * 0.5), 30), { 
            spreadXZ: 0.8, spreadY: 0.25, minSize: 0.02, maxSize: 0.08 
          });
          // Heavy hit: pulsating water leak
          if (reduced > 15) {
            window.BloodSystem.emitWaterPulse(this.mesh.position, { 
              pulses: 3, perPulse: 80, interval: 200, spreadXZ: 0.5 
            });
          }
        }
        
        // Squishy deformation on hit - drive spring-damper directly for smooth recovery
        this.currentScaleXZ = 1.4;
        this.currentScaleY = 0.6;
        this.scaleXZVel = 0;
        this.scaleYVel = 0;
        // Cancel any active stopping-wobble — the hit deformation takes priority
        this._stopWobbleInitAmp = 0;

        // System 7: Trigger multi-phase damage physics response
        try {
          this._damagePhase = 1;
          this._damagePhaseTimer = 0;
          if (this._membrane) {
            this._membraneWobbleVX = (Math.random() - 0.5) * 4;
            this._membraneWobbleVZ = (Math.random() - 0.5) * 4;
          }
          if (this._innerFluid) this._fluidOffsetY = 0.18;
        } catch (_e) {}
        
        // FRESH IMPLEMENTATION: Screen shake scales with damage amount
        // Cancel any previous shake to prevent stacked RAF loops
        if (_cameraShakeRAF) {
          cancelAnimationFrame(_cameraShakeRAF);
          _cameraShakeRAF = null;
        }
        const originalCameraPos = { 
          x: camera.position.x, 
          y: camera.position.y, 
          z: camera.position.z 
        };
        let shakeTime = 0;
        const shakeDuration = 0.25 + (reduced / 100) * 0.15; // Duration scales with damage
        
        const shakeAnim = () => {
          shakeTime += 0.016;
          if (shakeTime < shakeDuration) {
            // Intensity scales with damage (0.5 base + up to 0.5 more based on damage)
            const baseIntensity = 0.5 + Math.min(reduced / 50, 1) * 0.5;
            const intensity = (1 - shakeTime / shakeDuration) * baseIntensity;
            camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * intensity;
            camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * intensity;
            camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * intensity;
            _cameraShakeRAF = requestAnimationFrame(shakeAnim);
          } else {
            _cameraShakeRAF = null;
            camera.position.x = originalCameraPos.x;
            camera.position.y = originalCameraPos.y;
            camera.position.z = originalCameraPos.z;
          }
        };
        shakeAnim();

        if (playerStats.hp <= 0 && !((typeof isGameOver !== 'undefined' ? isGameOver : false) || window.isGameOver)) {
          // ENHANCED Death splash: more particles + ground pool with fade
          spawnParticles(this.mesh.position, COLORS.player, 25); // Reduced for performance
          spawnParticles(this.mesh.position, 0xFFFFFF, 8); // Reduced for performance
          
          // Advanced water death: massive water burst + pulsating leak + growing pool
          if (window.BloodSystem) {
            window.BloodSystem.emitWaterBurst(this.mesh.position, 300, { 
              spreadXZ: 2.0, spreadY: 0.5, minSize: 0.03, maxSize: 0.14 
            });
            window.BloodSystem.emitWaterPulse(this.mesh.position, { 
              pulses: 8, perPulse: 200, interval: 180, spreadXZ: 1.5 
            });
          }
          
          // Create ground pool (flat circle that fades out)
          const poolGeo = new THREE.CircleGeometry(1.5, 16);
          const poolMat = new THREE.MeshBasicMaterial({
            color: COLORS.player,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
          });
          const pool = new THREE.Mesh(poolGeo, poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(this.mesh.position.x, 0.05, this.mesh.position.z);
          const targetScene = _getScene();
          if (targetScene) {
            targetScene.add(pool);
          }

          // Fade out pool over time
          const fadePool = () => {
            poolMat.opacity -= 0.01;
            if (poolMat.opacity > 0) {
              setTimeout(fadePool, 50);
            } else {
              const targetScene = _getScene();
              if (targetScene) {
                targetScene.remove(pool);
              }
              poolGeo.dispose();
              poolMat.dispose();
            }
          };
          setTimeout(fadePool, 500);
          
          gameOver();
        }
      }
    }

    // Cached deformed geometry for Hard Tank (performance optimization)
    // Note: All Hard Tank enemies share the same deformed shape for performance.
    // This is intentional - visual variety comes from animations and positioning.
