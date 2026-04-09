// js/dopamine-system.js — Dopamine-driven level-up, fever mode & elastic damage numbers
// Loaded as a regular <script> before level-up-system.js.  Exposes window.DopamineSystem.

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Time-dilation controller
  // -----------------------------------------------------------------------
  const TimeDilation = {
    _scale:       1.0,
    _targetScale: 1.0,
    _lerpSpeed:   4.0,

    /** Set the target time scale (0 = frozen, 1 = normal). */
    set(target, lerpSpeed) {
      this._targetScale = Math.max(0, Math.min(target, 2.0));
      if (lerpSpeed !== undefined) this._lerpSpeed = lerpSpeed;
    },

    /** Instantly snap time scale. */
    snap(value) {
      this._scale = this._targetScale = value;
    },

    /** Tick — returns the current time scale (call once per frame). */
    update(dt) {
      const diff = this._targetScale - this._scale;
      if (Math.abs(diff) < 0.001) {
        this._scale = this._targetScale;
      } else {
        this._scale += diff * Math.min(1, this._lerpSpeed * dt);
      }
      return this._scale;
    },

    get scale() { return this._scale; }
  };

  // -----------------------------------------------------------------------
  // Camera FX — zoom, DOF-like blur, chromatic aberration, shake
  // -----------------------------------------------------------------------
  const CameraFX = {
    _baseZoom:    null,   // captured once
    _targetZoom:  null,
    _zoomLerp:    3.0,
    _aberration:  0,      // 0 – 1
    _dofBlur:     0,      // px for CSS backdrop-filter
    _overlay:     null,   // DOM overlay for post-fx
    _active:      false,
    _shakeIntensity: 0,
    _shakeDuration:  0,
    _shakeMs:        0,

    /**
     * Initialise — call once from init() after camera is created.
     * @param {THREE.OrthographicCamera} camera
     */
    init(camera) {
      this._camera   = camera;
      this._baseZoom = camera.zoom;
      this._targetZoom = camera.zoom;

      // Create a transparent overlay for screen-space effects
      let overlay = document.getElementById('dopamine-fx-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dopamine-fx-overlay';
        overlay.style.cssText =
          'position:fixed;top:0;left:0;width:100%;height:100%;' +
          'pointer-events:none;z-index:9998;transition:backdrop-filter 0.3s;';
        document.body.appendChild(overlay);
      }
      this._overlay = overlay;
      this._active = true;
    },

    /** Trigger a zoom-punch: quickly zoom out then smoothly return. */
    zoomPunch(factor, durationMs) {
      if (!this._camera) return;
      const cam = this._camera;
      this._targetZoom = this._baseZoom * factor;
      setTimeout(() => {
        this._targetZoom = this._baseZoom;
      }, durationMs || 400);
    },

    /** Apply chromatic aberration (0-1). Auto-fades out. */
    chromaticPulse(intensity, fadeMs) {
      this._aberration = Math.min(intensity, 1);
      const fadeStep = 16 / (fadeMs || 600);
      const fadeAberration = () => {
        this._aberration -= fadeStep;
        if (this._aberration > 0.01) requestAnimationFrame(fadeAberration);
        else this._aberration = 0;
      };
      requestAnimationFrame(fadeAberration);
    },

    /** Apply DOF-style blur (0 = none). Auto-fades. */
    dofPulse(blurPx, fadeMs) {
      this._dofBlur = blurPx;
      const fadeStep = 16 / (fadeMs || 500);
      const initial = blurPx;
      const fadeDOF = () => {
        this._dofBlur -= initial * fadeStep;
        if (this._dofBlur > 0.1) requestAnimationFrame(fadeDOF);
        else this._dofBlur = 0;
      };
      requestAnimationFrame(fadeDOF);
    },

    /**
     * Trigger a camera shake.
     * @param {number} intensity  Shake radius in pixels (e.g. 6).
     * @param {number} durationMs Shake duration.
     */
    shake(intensity, durationMs) {
      this._shakeIntensity = intensity || 6;
      this._shakeDuration  = durationMs || 180;
      this._shakeMs        = performance.now();
    },

    /** Per-frame update. */
    update(dt) {
      if (!this._active) return;

      // Smooth zoom
      const cam = this._camera;
      if (cam && this._targetZoom !== null) {
        cam.zoom += (this._targetZoom - cam.zoom) * Math.min(1, this._zoomLerp * dt);
        cam.updateProjectionMatrix();
      }

      // Camera shake
      const shakeElapsed = performance.now() - this._shakeMs;
      if (this._shakeIntensity > 0 && shakeElapsed < this._shakeDuration) {
        const t = 1 - shakeElapsed / this._shakeDuration;
        const r = this._shakeIntensity * t;
        if (cam) {
          cam.position.x += (Math.random() - 0.5) * r * 0.05;
          cam.position.z += (Math.random() - 0.5) * r * 0.05;
        }
      } else {
        this._shakeIntensity = 0;
      }

      // Overlay effects
      if (this._overlay) {
        const filters = [];
        if (this._dofBlur > 0.1) {
          filters.push('blur(' + this._dofBlur.toFixed(1) + 'px)');
        }
        this._overlay.style.backdropFilter = filters.length ? filters.join(' ') : 'none';
        this._overlay.style.webkitBackdropFilter = this._overlay.style.backdropFilter;

        // Chromatic aberration via box-shadow colour split
        if (this._aberration > 0.01) {
          const px = (this._aberration * 3).toFixed(1);
          this._overlay.style.boxShadow =
            'inset ' + px + 'px 0 0 rgba(255,0,0,0.15), ' +
            'inset -' + px + 'px 0 0 rgba(0,0,255,0.15)';
        } else {
          this._overlay.style.boxShadow = 'none';
        }
      }
    },

    reset() {
      if (this._camera) {
        this._camera.zoom = this._baseZoom || 1;
        this._camera.updateProjectionMatrix();
      }
      this._targetZoom = this._baseZoom;
      this._aberration = 0;
      this._dofBlur    = 0;
      this._shakeIntensity = 0;
      if (this._overlay) {
        this._overlay.style.backdropFilter = 'none';
        this._overlay.style.boxShadow      = 'none';
      }
    }
  };

  // -----------------------------------------------------------------------
  // Level-up FX — cinematic camera + time dilation + shockwave on level-up
  // -----------------------------------------------------------------------
  const LevelUpFX = {
    /**
     * Play the level-up cinematic.
     * Call this BEFORE showing the upgrade modal.
     * @param {Function} onComplete  Called when the intro is done and modal should appear.
     */
    play(onComplete) {
      // Slow time dramatically to 0.1x; lerpSpeed=8 means the scale reaches 0.1x in ~0.12s.
      // After 1 second, restore to normal at lerpSpeed=3 (~0.33s to fully return to 1x.
      // lerpSpeed is a unitless exponential decay rate: higher = snappier transition.
      TimeDilation.set(0.1, 8);
      setTimeout(() => { TimeDilation.set(1.0, 3); }, 1000);

      // Camera zoom-out + chromatic aberration + shake
      CameraFX.zoomPunch(0.85, 600);
      CameraFX.chromaticPulse(0.6, 800);
      CameraFX.dofPulse(2.5, 1000);
      CameraFX.shake(8, 350);

      // Screen flash
      const flash = document.getElementById('dopamine-fx-overlay');
      if (flash) {
        flash.style.background = 'radial-gradient(circle, rgba(255,255,200,0.45) 0%, transparent 70%)';
        setTimeout(() => { flash.style.background = 'none'; }, 350);
      }

      // Physics shockwave — push nearby enemies away from the player
      setTimeout(() => {
        try {
          if (window.enemies && window.player && window.player.mesh) {
            const px = window.player.mesh.position.x;
            const pz = window.player.mesh.position.z;
            const SHOCKWAVE_RADIUS = 8;
            const SHOCKWAVE_FORCE  = 12;
            for (let i = 0; i < window.enemies.length; i++) {
              const e = window.enemies[i];
              if (!e || e.isDead || !e.mesh) continue;
              const dx = e.mesh.position.x - px;
              const dz = e.mesh.position.z - pz;
              const distSq = dx * dx + dz * dz;
              if (distSq < SHOCKWAVE_RADIUS * SHOCKWAVE_RADIUS && distSq > 0.01) {
                const dist  = Math.sqrt(distSq);
                const force = SHOCKWAVE_FORCE * (1 - dist / SHOCKWAVE_RADIUS);
                if (e.knockbackX !== undefined) {
                  e.knockbackX = (e.knockbackX || 0) + (dx / dist) * force;
                  e.knockbackZ = (e.knockbackZ || 0) + (dz / dist) * force;
                } else {
                  e.mesh.position.x += (dx / dist) * force * 0.05;
                  e.mesh.position.z += (dz / dist) * force * 0.05;
                }
              }
            }
          }
        } catch (_) {}
      }, 80);

      // Restore time after a delay, then show modal
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 500);
    }
  };

  // -----------------------------------------------------------------------
  // Animated Collector Cards — improved upgrade card presentation
  // -----------------------------------------------------------------------
  const CollectorCards = {
    /**
     * Enhance upgrade card elements with collector-card animations.
     * Call after the upgrade modal DOM is populated.
     * @param {NodeList|Array} cardElements  The upgrade option DOM elements.
     */
    animateEntrance(cardElements) {
      if (!cardElements || cardElements.length === 0) return;

      const cards = Array.from(cardElements);
      cards.forEach((card, i) => {
        // Initial state
        card.style.opacity   = '0';
        card.style.transform = 'scale(0.6) rotateY(15deg) translateY(40px)';
        card.style.transition = 'none';

        // Stagger reveal
        setTimeout(() => {
          card.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
          card.style.opacity   = '1';
          card.style.transform = 'scale(1) rotateY(0deg) translateY(0)';
        }, 80 + i * 120);
      });
    },

    /**
     * Play a "selected" animation on a card and dim others.
     * @param {HTMLElement} selected  The chosen card element.
     * @param {NodeList|Array} allCards
     * @param {Function} onComplete
     */
    animateSelection(selected, allCards, onComplete) {
      const cards = Array.from(allCards);
      cards.forEach(card => {
        if (card === selected) {
          card.style.transition = 'all 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
          card.style.transform  = 'scale(1.15)';
          card.style.boxShadow  = '0 0 30px rgba(255,215,0,0.8)';
          card.style.zIndex     = '10';
        } else {
          card.style.transition = 'all 0.25s ease-out';
          card.style.opacity    = '0.3';
          card.style.transform  = 'scale(0.9) translateY(10px)';
          card.style.filter     = 'grayscale(0.6)';
        }
      });

      setTimeout(() => {
        if (onComplete) onComplete();
      }, 400);
    }
  };

  // -----------------------------------------------------------------------
  // Elastic Damage Numbers — spring-physics floating text for crits
  // -----------------------------------------------------------------------
  // Named constants for spring-physics tuning
  const _EN_CRIT_INITIAL_SCALE   = 2.0;   // scale crits start at (pops from big → 1x)
  const _EN_CRIT_SPRING_VEL      = -3.0;  // initial spring velocity (negative = moving toward 1x)
  const _EN_SPRING_STIFFNESS     = 220;   // spring k (how fast scale snaps back)
  const _EN_SPRING_DAMPING       = 14;    // spring damping (prevents endless oscillation)
  const _EN_CRIT_FLOAT_SPEED     = -220;  // upward screen velocity for crits (px/s)
  const _EN_NORMAL_FLOAT_SPEED   = -150;  // upward screen velocity for normal hits
  // Hard cap on simultaneous elastic damage-number DOM elements.
  const MAX_ELASTIC_NUMBERS      = 15;
  const ElasticNumbers = {
    _numbers: [],

    /**
     * Spawn an elastic damage number.
     * Crits start at 2x scale and elastic-bounce down to 1x before floating up.
     * When at the pool cap, the oldest entry's DOM element is recycled instead of
     * allocating a new one, preventing unbounded DOM growth during rapid-fire bursts.
     * @param {number} amount     Damage value.
     * @param {{ x: number, y: number, z: number }} worldPos  3D position.
     * @param {THREE.Camera}  camera
     * @param {boolean}       isCrit
     * @param {boolean}       isHeadshot
     */
    spawn(amount, worldPos, camera, isCrit, isHeadshot) {
      const entry = {
        amount:    Math.floor(amount),
        x:         0, y: 0,        // screen coords (set below)
        vy:        isCrit ? _EN_CRIT_FLOAT_SPEED : _EN_NORMAL_FLOAT_SPEED,
        scaleVel:  isCrit ? _EN_CRIT_SPRING_VEL : 0,  // bounce from 2x→1x for crits
        scale:     isCrit ? _EN_CRIT_INITIAL_SCALE : 1.0,
        targetScale: 1.0,
        opacity:   1,
        life:      0,
        maxLife:   isCrit ? 1.2 : 0.9,
        isCrit:    isCrit,
        isHeadshot: isHeadshot,
        el:        null
      };

      // Project 3D → 2D; crits/headshots spawn directly above the enemy head (lower Y offset)
      const _yOffset = (isCrit || isHeadshot) ? 0.8 : 1.5;
      const pos = new THREE.Vector3(worldPos.x, worldPos.y + _yOffset, worldPos.z);
      pos.project(camera);
      entry.x = (pos.x *  0.5 + 0.5) * window.innerWidth;
      entry.y = (pos.y * -0.5 + 0.5) * window.innerHeight;

      // Quick camera shake on crits/headshots
      if ((isCrit || isHeadshot) && window._triggerCameraShake) {
        window._triggerCameraShake(isHeadshot ? 0.18 : 0.12, 200);
      }

      let el;
      if (this._numbers.length >= MAX_ELASTIC_NUMBERS) {
        // Recycle the oldest entry's DOM element to avoid unbounded allocation.
        const oldest = this._numbers.shift();
        el = oldest.el;
        // Reset classes and content for the new hit.
        el.className = 'elastic-damage-number';
      } else {
        el = document.createElement('div');
        el.className = 'elastic-damage-number';
      }

      const _fmt = window.formatDamageValue ? window.formatDamageValue(entry.amount) : String(entry.amount);
      el.textContent = entry.isCrit
        ? (entry.isHeadshot ? '💀 ' : '⚡ ') + _fmt
        : _fmt;

      if (isHeadshot)   el.classList.add('headshot');
      else if (isCrit)  el.classList.add('critical');

      el.style.left = entry.x + 'px';
      el.style.top  = entry.y + 'px';
      el.style.opacity = '1';
      el.style.transform = '';
      if (!el.parentNode) document.body.appendChild(el);
      entry.el = el;

      this._numbers.push(entry);
    },

    /** Per-frame update — spring physics on scale, float up, fade out.
     *  Crits shake (offset x randomly) while scale > 1.2. */
    update(dt) {
      for (let i = this._numbers.length - 1; i >= 0; i--) {
        const n = this._numbers[i];
        n.life += dt;

        if (n.life >= n.maxLife) {
          if (n.el && n.el.parentNode) n.el.parentNode.removeChild(n.el);
          this._numbers.splice(i, 1);
          continue;
        }

        // Float up
        n.y += n.vy * dt;
        n.vy *= 0.97; // drag

        // Spring physics for scale (crits bounce from 2x → 1x)
        if (n.isCrit) {
          const force = _EN_SPRING_STIFFNESS * (n.targetScale - n.scale) - _EN_SPRING_DAMPING * n.scaleVel;
          n.scaleVel += force * dt;
          n.scale    += n.scaleVel * dt;
          // Shake horizontally while big (scale > 1.15)
          if (n.scale > 1.15) {
            n.x += (Math.random() - 0.5) * 4;
          }
        }

        // Fade out in last 30%
        const t = n.life / n.maxLife;
        n.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;

        // Apply to DOM
        if (n.el) {
          n.el.style.transform = 'translate(-50%, -50%) scale(' + Math.max(0.1, n.scale).toFixed(2) + ')';
          n.el.style.left    = n.x + 'px';
          n.el.style.top     = n.y + 'px';
          n.el.style.opacity = n.opacity.toFixed(2);
        }
      }
    },

    /** Clear all active numbers (e.g. on reset). */
    clear() {
      for (let i = 0; i < this._numbers.length; i++) {
        const n = this._numbers[i];
        if (n.el && n.el.parentNode) n.el.parentNode.removeChild(n.el);
      }
      this._numbers.length = 0;
    }
  };

  // -----------------------------------------------------------------------
  // Reward Juice — resource icons flying to UI + confetti on quest/chest reward
  // -----------------------------------------------------------------------
  const RewardJuice = {
    _confettiPool: [],
    /** Maximum confetti DOM elements spawned per confetti burst. */
    _MAX_CONFETTI: 40,

    /**
     * Animate resource/item icons flying from a world position into the HUD.
     * @param {Array<{icon:string, label:string}>} items  e.g. [{icon:'🪵', label:'+20 Wood'}]
     * @param {{ x: number, y: number }} screenOrigin  Source position in screen px.
     */
    flyResourcesIn(items, screenOrigin) {
      if (!items || items.length === 0) return;
      const origin = screenOrigin || { x: window.innerWidth / 2, y: window.innerHeight / 2 };

      // Target: top-left HUD area
      const targetX = 60;
      const targetY = 60;

      items.forEach((item, idx) => {
        setTimeout(() => {
          const el = document.createElement('div');
          el.className = 'reward-fly-icon';
          el.textContent = item.icon || '⭐';
          el.style.cssText = [
            'position:fixed',
            'left:' + origin.x + 'px',
            'top:' + origin.y + 'px',
            'font-size:28px',
            'z-index:10001',
            'pointer-events:none',
            'transition:none',
            'transform:translate(-50%,-50%) scale(1.4)',
            'filter:drop-shadow(0 0 6px gold)'
          ].join(';');
          document.body.appendChild(el);

          // Brief pause, then animate to HUD
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.transition = 'all 0.55s cubic-bezier(0.22,1,0.36,1)';
              el.style.left   = targetX + 'px';
              el.style.top    = targetY + 'px';
              el.style.transform = 'translate(-50%,-50%) scale(0.7)';
              el.style.opacity = '0';
            });
          });

          setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
            // Show stat-change text
            if (item.label && typeof window.showStatChange === 'function') {
              window.showStatChange(item.label);
            }
          }, 600);
        }, idx * 90);
      });
    },

    /**
     * Show a spinning sunburst behind a DOM element (reward popup).
     * @param {HTMLElement} container  The popup element to add sunburst behind.
     */
    addSunburst(container) {
      if (!container) return;
      const sb = document.createElement('div');
      sb.className = 'reward-sunburst';
      sb.style.cssText = [
        'position:absolute',
        'top:50%',
        'left:50%',
        'width:280px',
        'height:280px',
        'transform:translate(-50%,-50%) rotate(0deg)',
        'pointer-events:none',
        'z-index:0',
        'background:conic-gradient(from 0deg,transparent 0deg,rgba(255,220,0,0.18) 10deg,transparent 20deg,rgba(255,180,0,0.12) 30deg,transparent 40deg)',
        'border-radius:50%',
        'animation:sunburst-spin 4s linear infinite'
      ].join(';');
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
      container.insertBefore(sb, container.firstChild);
    },

    /**
     * Spawn UI confetti particles centred on a DOM element.
     * @param {HTMLElement} [anchor]  Optional anchor element; defaults to screen centre.
     */
    spawnConfetti(anchor) {
      const rect = anchor ? anchor.getBoundingClientRect() : null;
      const cx = rect ? (rect.left + rect.right) / 2 : window.innerWidth / 2;
      const cy = rect ? rect.top + 20 : window.innerHeight * 0.35;

      const colours = ['#FFD700','#FF6B6B','#4FC3F7','#69F0AE','#CE93D8','#FFA726','#ffffff'];
      const count = this._MAX_CONFETTI;

      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'reward-confetti';
        const size  = 6 + Math.random() * 6;
        const angle = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 160;
        const vx = Math.cos(angle) * speed;
        const vy = -Math.abs(Math.sin(angle) * speed) - 60; // always upward
        const colour = colours[Math.floor(Math.random() * colours.length)];
        const rot = Math.random() * 360;

        el.style.cssText = [
          'position:fixed',
          'left:' + cx + 'px',
          'top:' + cy + 'px',
          'width:' + size + 'px',
          'height:' + size + 'px',
          'background:' + colour,
          'border-radius:' + (Math.random() > 0.5 ? '50%' : '2px'),
          'pointer-events:none',
          'z-index:10002',
          'transform:rotate(' + rot + 'deg)',
          'opacity:1'
        ].join(';');
        document.body.appendChild(el);

        const start = performance.now();
        const dur   = 900 + Math.random() * 400;

        const tick = (now) => {
          const t  = (now - start) / dur;
          if (t >= 1) { if (el.parentNode) el.parentNode.removeChild(el); return; }
          const ease = 1 - t * t;
          const x  = cx + vx * t;
          const y  = cy + vy * t + 200 * t * t; // gravity
          el.style.left    = x + 'px';
          el.style.top     = y + 'px';
          el.style.opacity = (ease * 0.9).toFixed(2);
          el.style.transform = 'rotate(' + (rot + t * 360) + 'deg)';
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }
  };

  // -----------------------------------------------------------------------
  // Fever Mode — pulsing HUD + lighting when combo is high
  // -----------------------------------------------------------------------
  const FeverMode = {
    _active:    false,
    _intensity: 0,      // 0 – 1
    _hue:       0,
    _overlay:   null,

    /** Activate fever mode at a given intensity (0 – 1). */
    activate(intensity) {
      this._active    = true;
      this._intensity = Math.min(1, intensity);
      if (!this._overlay) {
        let el = document.getElementById('fever-overlay');
        if (!el) {
          el = document.createElement('div');
          el.id = 'fever-overlay';
          el.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:9990;opacity:0;' +
            'transition:opacity 0.3s;mix-blend-mode:screen;';
          document.body.appendChild(el);
        }
        this._overlay = el;
      }
    },

    /** Deactivate fever mode (smooth fade-out). */
    deactivate() {
      this._active = false;
    },

    /** Per-frame update. */
    update(dt) {
      if (this._active) {
        this._hue = (this._hue + dt * 120) % 360;  // rotate hue
        const alpha = (0.06 * this._intensity).toFixed(3);
        if (this._overlay) {
          this._overlay.style.opacity = '1';
          this._overlay.style.background =
            'radial-gradient(circle at 50% 50%, ' +
            'hsla(' + Math.round(this._hue) + ',100%,60%,' + alpha + ') 0%, transparent 70%)';
        }
        // Pulse HUD elements
        const hud = document.getElementById('hud');
        if (hud) {
          const pulse = Math.sin(performance.now() * 0.008) * 0.5 + 0.5;
          hud.style.filter = 'brightness(' + (1 + pulse * 0.15 * this._intensity).toFixed(2) + ')';
        }
      } else {
        // Fade out
        if (this._overlay) this._overlay.style.opacity = '0';
        const hud = document.getElementById('hud');
        if (hud) hud.style.filter = 'none';
        this._intensity *= 0.95;
      }
    },

    reset() {
      this._active = false;
      this._intensity = 0;
      if (this._overlay) this._overlay.style.opacity = '0';
      const hud = document.getElementById('hud');
      if (hud) hud.style.filter = 'none';
    }
  };

  // -----------------------------------------------------------------------
  // Reward Blast — extreme visual sequence for Astral Dive extraction /
  // major Neural Matrix loop completions.
  //
  // Usage:
  //   window.triggerRewardBlast({ essence: 50, cores: 3, gold: 200 });
  //
  // Steps:
  //  1. Screen dims with a dark overlay.
  //  2. A massive 3D-styled title slams onto the screen.
  //  3. Physics-based DOM particles (gems 💎, gold 🪙, essence ⚡) erupt from
  //     the centre and fly toward the matching UI element (or top-left corner
  //     as a sensible default).
  //  4. The reward numbers in the title roll up rapidly (slot-machine style),
  //     flashing green and shaking.
  //  5. Everything fades out after ~2.5 s.
  // -----------------------------------------------------------------------
  (function _installRewardBlast() {
    const CSS_ID = '_reward-blast-style';
    if (!document.getElementById(CSS_ID)) {
      const st = document.createElement('style');
      st.id = CSS_ID;
      st.textContent = [
        '@keyframes _rb-slam{0%{transform:scale(3) translateY(-60px);opacity:0;}',
        '40%{transform:scale(0.92) translateY(4px);opacity:1;}',
        '60%{transform:scale(1.06) translateY(-2px);}',
        '100%{transform:scale(1) translateY(0);}}',
        '@keyframes _rb-shake{0%,100%{transform:translateX(0);}',
        '20%{transform:translateX(-6px);}40%{transform:translateX(6px);}',
        '60%{transform:translateX(-4px);}80%{transform:translateX(4px);}}',
        '@keyframes _rb-roll{0%{color:#fff;}50%{color:#00ff88;}100%{color:#00ff88;}}',
        '@keyframes _rb-particle-fly{0%{transform:translate(0,0) scale(1);opacity:1;}',
        '100%{transform:translate(var(--rb-tx),var(--rb-ty)) scale(0.3);opacity:0;}}',
        '._rb-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.72);',
        'pointer-events:none;transition:opacity 0.5s;}',
        '._rb-banner{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);',
        'z-index:9999;text-align:center;pointer-events:none;',
        'font-family:\'Bangers\',\'Impact\',cursive;letter-spacing:4px;',
        'text-shadow:0 0 40px #00ffff,0 6px 0 rgba(0,0,0,0.8),4px 4px 0 #003344;',
        'color:#00ffff;animation:_rb-slam 0.55s cubic-bezier(0.22,1,0.36,1) forwards;}',
        '._rb-title{font-size:clamp(36px,8vw,80px);display:block;}',
        '._rb-rewards{font-size:clamp(18px,4vw,36px);margin-top:12px;',
        'color:#FFD700;text-shadow:0 0 20px #FFD700,2px 2px 0 #000;}',
        '._rb-num{display:inline-block;animation:_rb-roll 0.4s ease-out forwards,',
        '_rb-shake 0.6s ease-in-out forwards;font-weight:bold;color:#00ff88;}',
        '._rb-particle{position:fixed;z-index:9998;pointer-events:none;font-size:22px;',
        'animation:_rb-particle-fly var(--rb-dur,1.2s) cubic-bezier(0.22,1,0.36,1) forwards;}'
      ].join('');
      document.head.appendChild(st);
    }

    function triggerRewardBlast(rewards) {
      rewards = rewards || {};
      const essence   = Math.floor(rewards.essence || 0);
      const cores     = Math.floor(rewards.cores   || 0);
      const gold      = Math.floor(rewards.gold    || 0);
      const nodeLabel = rewards._nodeLabel || null;
      if (essence === 0 && cores === 0 && gold === 0 && !nodeLabel) return;

      // 1 — Dim overlay
      const overlay = document.createElement('div');
      overlay.className = '_rb-overlay';
      document.body.appendChild(overlay);

      // 2 — Banner
      const banner = document.createElement('div');
      banner.className = '_rb-banner';
      const titleText = nodeLabel
        ? '🧠 NODE UNLOCKED 🧠'
        : '⚡ REWARDS EXTRACTED ⚡';
      const rewardHtml = nodeLabel
        ? '<div class="_rb-rewards" style="color:#aa44ff;text-shadow:0 0 20px #aa44ff,2px 2px 0 #000;">' +
            '<span class="_rb-num" style="color:#cc88ff;">' + nodeLabel + '</span></div>'
        : '<div class="_rb-rewards">' +
            (essence ? '⚡ Essence: <span class="_rb-num">+' + essence + '</span>  ' : '') +
            (cores   ? '🔷 Cores: <span class="_rb-num">+' + cores   + '</span>  ' : '') +
            (gold    ? '💰 Gold: <span class="_rb-num">+'  + gold    + '</span>'   : '') +
          '</div>';
      banner.innerHTML = '<span class="_rb-title">' + titleText + '</span>' + rewardHtml;
      document.body.appendChild(banner);

      // 3 — Physics particles
      const PARTICLE_ICONS = ['💎','🪙','⚡','🔷','✨','💛'];
      const RB_MIN_PARTICLES   = 80;
      const RB_PARTICLE_SCALE  = 0.05;
      const RB_MAX_PARTICLES   = 150;
      const CX = window.innerWidth  / 2;
      const CY = window.innerHeight / 2;
      const COUNT = Math.min(RB_MIN_PARTICLES + (essence + cores + gold) * RB_PARTICLE_SCALE, RB_MAX_PARTICLES);
      for (let i = 0; i < COUNT; i++) {
        const p = document.createElement('div');
        p.className = '_rb-particle';
        p.textContent = PARTICLE_ICONS[Math.floor(Math.random() * PARTICLE_ICONS.length)];
        // Random angle, distance trajectory
        const angle = Math.random() * Math.PI * 2;
        const dist  = 180 + Math.random() * (window.innerWidth * 0.38);
        const tx    = Math.cos(angle) * dist;
        const ty    = Math.sin(angle) * dist - window.innerHeight * 0.3; // bias upward toward HUD
        const dur   = (0.7 + Math.random() * 0.8).toFixed(2);
        const delay = (Math.random() * 0.4).toFixed(2);
        p.style.cssText = [
          'left:' + (CX + (Math.random()-0.5)*60) + 'px;',
          'top:'  + (CY + (Math.random()-0.5)*60) + 'px;',
          '--rb-tx:' + tx.toFixed(0) + 'px;',
          '--rb-ty:' + ty.toFixed(0) + 'px;',
          '--rb-dur:' + dur + 's;',
          'animation-delay:' + delay + 's;',
          'opacity:0;' // starts hidden until animation kicks in
        ].join('');
        document.body.appendChild(p);
        // Clean up after animation
        setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); },
          (parseFloat(dur) + parseFloat(delay) + 0.2) * 1000);
      }

      // 4 — Slot-machine number roll for numeric _rb-num spans
      // Non-numeric spans (e.g. node label text) just flash colour instead.
      const ROLL_STEPS   = 18;
      const ROLL_STEP_MS = 60;
      const numEls = banner.querySelectorAll('._rb-num');
      numEls.forEach(el => {
        const raw    = el.textContent.replace(/[^0-9]/g, '');
        const target = raw ? parseInt(raw, 10) : NaN;
        if (isNaN(target)) {
          // Non-numeric label — just do a colour flash
          let flash = 0;
          const flashIv = setInterval(() => {
            flash++;
            el.style.color = flash % 2 === 0 ? '#cc88ff' : '#ffffff';
            if (flash >= ROLL_STEPS) { clearInterval(flashIv); el.style.color = '#cc88ff'; }
          }, ROLL_STEP_MS);
          return;
        }
        const prefix = el.textContent.includes('+') ? '+' : '';
        let current  = 0;
        let step     = 0;
        const iv = setInterval(() => {
          step++;
          current = step < ROLL_STEPS ? Math.floor(target * (step / ROLL_STEPS)) : target;
          el.textContent = prefix + current;
          el.style.color = step % 2 === 0 ? '#00ff88' : '#ffffff';
          if (step >= ROLL_STEPS) {
            clearInterval(iv);
            el.style.color = '#00ff88';
          }
        }, ROLL_STEP_MS);
      });

      // 5 — Fade out everything after 2.6 s
      setTimeout(() => {
        overlay.style.opacity = '0';
        banner.style.opacity  = '0';
        banner.style.transition = 'opacity 0.5s';
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (banner.parentNode)  banner.parentNode.removeChild(banner);
        }, 550);
      }, 2600);
    }

    window.triggerRewardBlast = triggerRewardBlast;
  })();

  // -----------------------------------------------------------------------
  // Universal Dopamine Reward Modal — casino-style "REWARD CLAIMED" popup
  //
  // Usage:
  //   window.DopamineReward.show({
  //     title: 'Quest Complete!',          // optional headline
  //     items: ['+500 Gold', '+1 Wood Axe Arm'],  // array of reward strings
  //     onClaim: function() {}             // optional callback on CLAIM click
  //   });
  //
  // The modal drops from the top, shows confetti particles, neon borders,
  // and requires an active CLAIM button click to dismiss.
  // -----------------------------------------------------------------------
  (function _installDopamineRewardModal() {
    const CSS_ID = '_drm-style';
    if (!document.getElementById(CSS_ID)) {
      const st = document.createElement('style');
      st.id = CSS_ID;
      st.textContent = [
        '@keyframes _drm-drop{0%{transform:translateX(-50%) translateY(-120%);opacity:0;}',
        '60%{transform:translateX(-50%) translateY(8px);opacity:1;}',
        '80%{transform:translateX(-50%) translateY(-4px);}',
        '100%{transform:translateX(-50%) translateY(0);opacity:1;}}',
        '@keyframes _drm-border-glow{0%,100%{box-shadow:0 0 18px #00ffff,0 0 40px rgba(0,255,255,0.35),',
        'inset 0 0 20px rgba(0,0,0,0.9),0 20px 80px rgba(0,0,0,0.9);}',
        '50%{box-shadow:0 0 32px #aa44ff,0 0 70px rgba(170,68,255,0.45),',
        'inset 0 0 20px rgba(0,0,0,0.9),0 20px 80px rgba(0,0,0,0.9);}}',
        '@keyframes _drm-title-pulse{0%,100%{text-shadow:0 0 12px #00ffff,0 0 30px rgba(0,255,255,0.5);}',
        '50%{text-shadow:0 0 24px #aa44ff,0 0 60px rgba(170,68,255,0.6);}}',
        '@keyframes _drm-item-pop{0%{transform:scale(0.6) translateX(-20px);opacity:0;}',
        '70%{transform:scale(1.08) translateX(2px);}',
        '100%{transform:scale(1) translateX(0);opacity:1;}}',
        '@keyframes _drm-confetti-fly{0%{transform:translate(0,0) rotate(0deg) scale(1);opacity:1;}',
        '100%{transform:translate(var(--drm-tx),var(--drm-ty)) rotate(var(--drm-rot)) scale(0.2);opacity:0;}}',
        '@keyframes _drm-claim-pulse{0%,100%{box-shadow:0 0 10px #00ffcc,0 4px 0 #006644;}',
        '50%{box-shadow:0 0 24px #00ffcc,0 0 50px rgba(0,255,200,0.4),0 4px 0 #006644;}}',
        '@keyframes _drm-sweep{0%{left:-100%;}100%{left:110%;}}',
        '._drm-overlay{position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,0.7);',
        'pointer-events:all;}',
        '._drm-modal{position:fixed;top:60px;left:50%;',
        'transform:translateX(-50%) translateY(-120%);',
        'z-index:30001;width:clamp(280px,90vw,480px);',
        'background:#06000f;',
        'border:2px solid #00ffff;border-radius:6px;overflow:hidden;',
        'animation:_drm-drop 0.65s cubic-bezier(0.22,1,0.36,1) forwards,',
        '_drm-border-glow 3s ease-in-out 0.65s infinite;',
        'font-family:\'Bangers\',cursive;}',
        '._drm-header{padding:18px 20px 10px;text-align:center;position:relative;overflow:hidden;}',
        '._drm-header-line{width:60%;height:1px;background:linear-gradient(90deg,transparent,#00ffff,transparent);',
        'margin:6px auto 0;}',
        '._drm-eyebrow{font-size:11px;letter-spacing:5px;color:#00ffcc;',
        'text-transform:uppercase;font-family:\'Segoe UI\',sans-serif;}',
        '._drm-title{font-size:clamp(22px,5vw,34px);color:#00ffff;letter-spacing:4px;',
        'animation:_drm-title-pulse 2s ease-in-out 0.65s infinite;display:block;margin:4px 0;}',
        '._drm-sweep{position:absolute;top:0;left:-100%;width:40%;height:100%;',
        'background:linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent);',
        'animation:_drm-sweep 2s ease-in-out 0.8s infinite;}',
        '._drm-items{padding:0 20px 12px;list-style:none;margin:0;}',
        '._drm-item{font-size:clamp(16px,3.5vw,22px);color:#FFD700;',
        'padding:7px 14px;margin:5px 0;border-radius:3px;',
        'background:rgba(255,215,0,0.07);border-left:3px solid #FFD700;',
        'opacity:0;animation:_drm-item-pop 0.4s ease-out forwards;}',
        '._drm-footer{padding:12px 20px 18px;text-align:center;}',
        '._drm-claim-btn{display:inline-block;font-family:\'Bangers\',cursive;',
        'font-size:clamp(18px,4vw,26px);letter-spacing:4px;padding:10px 40px;',
        'background:linear-gradient(to bottom,#00ffcc,#00aa88);color:#001a12;',
        'border:none;border-radius:4px;cursor:pointer;position:relative;',
        'box-shadow:0 0 10px #00ffcc,0 4px 0 #006644;',
        'animation:_drm-claim-pulse 1.5s ease-in-out 1s infinite;',
        'transition:transform 0.1s,filter 0.1s;}',
        '._drm-claim-btn:active{transform:translateY(3px);filter:brightness(0.85);',
        'box-shadow:0 0 4px #00ffcc,0 1px 0 #006644;animation:none;}',
        '._drm-confetti{position:fixed;z-index:30002;pointer-events:none;font-size:18px;',
        'animation:_drm-confetti-fly var(--drm-dur,1.4s) ease-out forwards;}'
      ].join('');
      document.head.appendChild(st);
    }

    var _queue = [];
    var _showing = false;

    function _spawnConfetti(cx, cy) {
      var ICONS = ['🎊','✨','💎','🌟','💛','🟣','🔵','🟢','🟡'];
      for (var i = 0; i < 60; i++) {
        (function(i) {
          var p = document.createElement('div');
          p.className = '_drm-confetti';
          p.textContent = ICONS[Math.floor(Math.random() * ICONS.length)];
          var angle = Math.random() * Math.PI * 2;
          var dist  = 80 + Math.random() * 260;
          var tx    = Math.cos(angle) * dist;
          var ty    = Math.sin(angle) * dist - 60;
          var dur   = (0.8 + Math.random() * 0.9).toFixed(2);
          var delay = (i * 0.012).toFixed(2);
          var rot   = ((Math.random() - 0.5) * 720).toFixed(0) + 'deg';
          p.style.cssText = [
            'left:' + (cx + (Math.random()-0.5)*40) + 'px;',
            'top:'  + (cy + (Math.random()-0.5)*20) + 'px;',
            '--drm-tx:' + tx.toFixed(0) + 'px;',
            '--drm-ty:' + ty.toFixed(0) + 'px;',
            '--drm-rot:' + rot + ';',
            '--drm-dur:' + dur + 's;',
            'animation-delay:' + delay + 's;opacity:0;'
          ].join('');
          document.body.appendChild(p);
          setTimeout(function() { if (p.parentNode) p.parentNode.removeChild(p); },
            (parseFloat(dur) + parseFloat(delay) + 0.2) * 1000);
        })(i);
      }
    }

    function _showNext() {
      if (_showing || _queue.length === 0) return;
      _showing = true;
      var opts = _queue.shift();

      var overlay = document.createElement('div');
      overlay.className = '_drm-overlay';

      var modal = document.createElement('div');
      modal.className = '_drm-modal';

      var title = opts.title || 'REWARD CLAIMED';
      var eyebrow = opts.eyebrow || '🎉 CLAIM YOUR REWARDS 🎉';

      modal.innerHTML = [
        '<div class="_drm-header">',
          '<div class="_drm-sweep"></div>',
          '<div class="_drm-eyebrow">' + eyebrow + '</div>',
          '<span class="_drm-title">' + title + '</span>',
          '<div class="_drm-header-line"></div>',
        '</div>',
        '<ul class="_drm-items" id="_drm-items-list"></ul>',
        '<div class="_drm-footer">',
          '<button class="_drm-claim-btn">✅ CLAIM</button>',
        '</div>'
      ].join('');

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Animate items in sequentially
      var list = modal.querySelector('#_drm-items-list');
      var items = opts.items || [];
      items.forEach(function(item, i) {
        var li = document.createElement('li');
        li.className = '_drm-item';
        li.textContent = item;
        li.style.animationDelay = (0.65 + i * 0.12) + 's';
        list.appendChild(li);
      });

      // Confetti burst from modal centre
      setTimeout(function() {
        var rect = modal.getBoundingClientRect();
        _spawnConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }, 700);

      // Claim button
      var claimBtn = modal.querySelector('._drm-claim-btn');
      function _dismiss() {
        claimBtn.removeEventListener('click', _dismiss);
        overlay.style.transition = 'opacity 0.3s';
        overlay.style.opacity = '0';
        modal.style.transition = 'transform 0.3s ease-in,opacity 0.3s';
        modal.style.transform = 'translateX(-50%) translateY(-110%)';
        modal.style.opacity = '0';
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (typeof opts.onClaim === 'function') opts.onClaim();
          _showing = false;
          _showNext(); // process next queued reward
        }, 320);
      }
      claimBtn.addEventListener('click', _dismiss);

      // Play a click-chime if GameAudio is available
      if (typeof playSound === 'function') {
        try { playSound('levelup'); } catch(e) {}
      }
    }

    window.DopamineReward = {
      /**
       * Queue and show a casino-style "REWARD CLAIMED" modal.
       * @param {{ title?: string, eyebrow?: string, items: string[], onClaim?: function }} opts
       */
      show: function(opts) {
        _queue.push(opts || {});
        _showNext();
      }
    };
  })();

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.DopamineSystem = {
    TimeDilation:   TimeDilation,
    CameraFX:       CameraFX,
    LevelUpFX:      LevelUpFX,
    CollectorCards:  CollectorCards,
    ElasticNumbers:  ElasticNumbers,
    RewardJuice:     RewardJuice,
    FeverMode:       FeverMode
  };
})();
