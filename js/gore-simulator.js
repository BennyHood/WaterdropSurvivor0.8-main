// ── Slime gel color palette (mirrors _BSV21_BLOOD / _BSV21_MIST tables) ────────
const _GORE_GEL = {
  slime:         { base: 0x22cc44, mist: 0x55ff66 },
  leaping_slime: { base: 0x00bfff, mist: 0x55ddff },
};

const GoreSimulator = {
  debug: false,

  // Returns true for any slime enemy type
  _isSlime(enemy) {
    return !!(enemy && (enemy.enemyType === 'slime' || enemy.enemyType === 'leaping_slime'));
  },

  // Returns gel colors for a slime enemy (with safe default)
  _gelColors(enemy) {
    return _GORE_GEL[enemy.enemyType] || _GORE_GEL.slime;
  },

  onHit(enemy, weapon, hitPoint, hitNormal) {
    if (!enemy || enemy.dead) return;
    if (this._isSlime(enemy)) {
      this._slimeHit(enemy, weapon, hitPoint);
      return;
    }
    if (window.BloodSimulatorV21) {
      window.BloodSimulatorV21.onEnemyHit(enemy, hitPoint, weapon.type);
    } else if (window.BloodV2) {
      window.BloodV2.hit(enemy, weapon.type, hitPoint, hitNormal);
    }
    if (weapon.type === 'sword' && Math.random() < 0.65) this.sliceEnemy(enemy, hitPoint, hitNormal);
  },

  onKill(enemy, weapon, killVX = 0, killVZ = 0) {
    if (!enemy) return;
    const pos = enemy.mesh ? enemy.mesh.position : enemy.position;
    if (window.BloodSimulatorV21) {
      window.BloodSimulatorV21.onEnemyDeath(enemy, pos);
    } else if (window.BloodV2) {
      window.BloodV2.kill(enemy, weapon.type);
    }
    // Extra weapon-specific effects layered on top of the base death burst
    if (this._isSlime(enemy)) {
      this._slimeWeaponDeath(enemy, weapon);
    } else if (weapon.type === 'sword') {
      this.dismemberEnemy(enemy, killVX, killVZ);
    } else if (weapon.type === 'boomerang') {
      this.boomerangKill(enemy);
    } else if (weapon.type === 'shuriken') {
      this.shurikenKill(enemy);
    }
  },

  // ── Slime hit reaction — gel splat at hit point ──────────────────────────────
  _slimeHit(enemy, weapon, hitPoint) {
    const gel = this._gelColors(enemy);
    const bx = hitPoint.x, by = hitPoint.y, bz = hitPoint.z;
    if (window.BloodSimulatorV21) {
      BloodSimulatorV21.rawBurst(bx, by + 0.3, bz, 22, {spreadXZ: 8, spreadY: 10, viscosity: 0.72, color: gel.base});
      BloodSimulatorV21.spawnMist(bx, by + 0.2, bz, 3, gel.mist);
      BloodSimulatorV21.addWoundPulse(bx, by, bz, gel.base, 1.8);
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(bx, by + 0.3, bz, 22, {spdMin: 2, spdMax: 8, visc: 0.72, color: gel.base});
    }
    if (weapon.type === 'sword' && Math.random() < 0.65) this._slimeSliceHit(enemy, hitPoint);
  },

  // Extra wide gel slice reaction on sword hit
  _slimeSliceHit(enemy, hitPoint) {
    const gel = this._gelColors(enemy);
    const bx = hitPoint.x, by = hitPoint.y, bz = hitPoint.z;
    if (window.BloodSimulatorV21) {
      BloodSimulatorV21.rawBurst(bx, by + 0.5, bz, 18, {spreadXZ: 16, spreadY: 4, viscosity: 0.65, color: gel.base});
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(bx, by + 0.5, bz, 18, {spdMin: 3, spdMax: 12, visc: 0.65, color: gel.base});
    }
  },

  // ── Unique slime deaths per weapon ───────────────────────────────────────────
  _slimeWeaponDeath(enemy, weapon) {
    const pos = (enemy.mesh ? enemy.mesh.position : enemy.position);
    if (!pos) return;
    const gel = this._gelColors(enemy);
    switch (weapon.type) {
      case 'sword':     this._slimeSwordDeath(pos, gel);     break;
      case 'boomerang': this._slimeBoomerangDeath(pos, gel); break;
      case 'shuriken':  this._slimeShurikenDeath(pos, gel);  break;
      case 'rocket':    this._slimeRocketDeath(pos, gel);    break;
      default:          this._slimeBulletDeath(pos, gel);    break;
    }
  },

  // Sword: wide flat gel slice — body halved horizontally, gel sheets outward
  _slimeSwordDeath(pos, gel) {
    if (window.BloodSimulatorV21) {
      // Wide flat radial sheet at mid-body height (low Y spread = horizontal sheet)
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 0.6, pos.z, 160,
        {spreadXZ: 28, spreadY: 3, viscosity: 0.68, color: gel.base});
      // Tall thin central geyser (severed core)
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 0.8, pos.z, 40,
        {spreadXZ: 4, spreadY: 24, viscosity: 0.52, color: gel.base});
      BloodSimulatorV21.spawnMist(pos.x, pos.y + 0.5, pos.z, 14, gel.mist);
      BloodSimulatorV21.addWoundPulse(pos.x, pos.y + 0.4, pos.z, gel.base, 4.0);
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(pos.x, pos.y + 0.6, pos.z, 160, {spdMin: 4, spdMax: 28, visc: 0.68, color: gel.base});
    }
  },

  // Boomerang: spinning disc through the body — circular ring spray of gel
  _slimeBoomerangDeath(pos, gel) {
    if (window.BloodSimulatorV21) {
      // Wide ring burst — very high XZ spread, low Y (stays flat like a disc)
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 0.9, pos.z, 130,
        {spreadXZ: 32, spreadY: 6, viscosity: 0.58, color: gel.base});
      // Second ring slightly above for full body coverage
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 1.3, pos.z, 70,
        {spreadXZ: 24, spreadY: 4, viscosity: 0.62, color: gel.base});
      BloodSimulatorV21.spawnMist(pos.x, pos.y + 0.8, pos.z, 18, gel.mist);
      BloodSimulatorV21.addWoundPulse(pos.x, pos.y + 0.6, pos.z, gel.base, 3.5);
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(pos.x, pos.y + 0.9, pos.z, 130, {spdMin: 6, spdMax: 32, visc: 0.58, color: gel.base});
    }
  },

  // Shuriken: precision puncture — tall narrow gel fountain with arterial jets
  _slimeShurikenDeath(pos, gel) {
    if (window.BloodSimulatorV21) {
      // Narrow high-pressure vertical fountain
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 1.0, pos.z, 80,
        {spreadXZ: 5, spreadY: 36, viscosity: 0.44, color: gel.base});
      // Fine mist cloud at entry point
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 0.4, pos.z, 30,
        {spreadXZ: 10, spreadY: 8, viscosity: 0.70, color: gel.base});
      // Three evenly-spaced arterial gel jets radiating outward in XZ plane
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2;
        BloodSimulatorV21.arterialJet(pos.x, pos.y + 1.0, pos.z, Math.cos(ang), Math.sin(ang), gel.base);
      }
      BloodSimulatorV21.spawnMist(pos.x, pos.y + 0.6, pos.z, 10, gel.mist);
      BloodSimulatorV21.addWoundPulse(pos.x, pos.y + 0.5, pos.z, gel.base, 3.0);
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(pos.x, pos.y + 1.0, pos.z, 80, {spdMin: 8, spdMax: 36, visc: 0.44, color: gel.base});
    }
  },

  // Bullet/pistol: explosive gel burst with heavy atomised misting
  _slimeBulletDeath(pos, gel) {
    if (window.BloodSimulatorV21) {
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 0.8, pos.z, 110,
        {spreadXZ: 18, spreadY: 22, viscosity: 0.55, color: gel.base});
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 0.3, pos.z, 50,
        {spreadXZ: 12, spreadY: 8, viscosity: 0.70, color: gel.base});
      BloodSimulatorV21.spawnMist(pos.x, pos.y + 0.6, pos.z, 20, gel.mist);
      BloodSimulatorV21.addWoundPulse(pos.x, pos.y + 0.5, pos.z, gel.base, 3.0);
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(pos.x, pos.y + 0.8, pos.z, 110, {spdMin: 5, spdMax: 22, visc: 0.55, color: gel.base});
    }
  },

  // Rocket: massive gel explosion — full body vaporised into gel rain
  _slimeRocketDeath(pos, gel) {
    if (window.BloodSimulatorV21) {
      // Primary massive burst
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 1.0, pos.z, 240,
        {spreadXZ: 36, spreadY: 40, viscosity: 0.40, color: gel.base});
      // Secondary ground-level splatter ring
      BloodSimulatorV21.rawBurst(pos.x, pos.y + 0.2, pos.z, 80,
        {spreadXZ: 28, spreadY: 6, viscosity: 0.72, color: gel.base});
      // Heavy mist cloud
      BloodSimulatorV21.spawnMist(pos.x, pos.y + 1.2, pos.z, 28, gel.mist);
      BloodSimulatorV21.addWoundPulse(pos.x, pos.y + 0.6, pos.z, gel.base, 5.0);
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(pos.x, pos.y + 1.0, pos.z, 240, {spdMin: 10, spdMax: 40, visc: 0.40, color: gel.base});
    }
  },

  sliceEnemy(enemy, hitPoint, hitNormal) {
    if (this.debug) console.log('🩸 BRUTAL SLICE');
    // NOTE: do NOT squash enemy.mesh.scale here — it permanently distorts the mesh and
    // causes visible artifacts on every subsequent sword hit.
    const bx = hitPoint.x, by = hitPoint.y, bz = hitPoint.z;
    if (window.BloodSimulatorV21) {
      window.BloodSimulatorV21.rawBurst(bx, by + 0.4, bz, 28, {viscosity: 0.45});
      window.BloodSimulatorV21.rawBurst(bx, by + 0.8, bz, 12, {viscosity: 0.35});
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(bx, by + 0.4, bz, 28, {spdMin: 2, spdMax: 8, visc: 0.45});
      window.BloodV2.rawBurst(bx, by + 0.8, bz, 12, {spdMin: 1, spdMax: 5, visc: 0.35});
    }
  },
  dismemberEnemy(enemy, vx, vz) {
    if (this.debug) console.log('💀 DISMEMBER');
    const pos = enemy.mesh.position;
    if (window.BloodSimulatorV21) {
      window.BloodSimulatorV21.rawBurst(pos.x, pos.y + 1.8, pos.z, 220, {spreadXZ: 22, spreadY: 32, viscosity: 0.38});
    } else if (window.BloodV2) {
      // BloodV2.rawBurst is radial (no separate Y spread); spdMax=32 matches spreadY (the larger axis)
      // BloodV2.rawBurst is radial (no separate Y spread); use the larger of spreadXZ/spreadY as spdMax
      window.BloodV2.rawBurst(pos.x, pos.y + 1.8, pos.z, 220, {spdMin: 8, spdMax: 32, visc: 0.38});
    }
  },
  boomerangKill(enemy) {
    if (this.debug) console.log('🌀 BOOMERANG KILL');
    const pos = enemy.mesh ? enemy.mesh.position : enemy.position;
    if (!pos) return;
    // Spinning decapitation — wide radial burst + mist
    if (window.BloodSimulatorV21) {
      window.BloodSimulatorV21.rawBurst(pos.x, pos.y + 1.2, pos.z, 80, {spreadXZ: 18, spreadY: 20, viscosity: 0.45});
      window.BloodSimulatorV21.spawnMist(pos.x, pos.y + 0.8, pos.z, 10);
      window.BloodSimulatorV21.addWoundPulse(pos.x, pos.y + 0.5, pos.z, 0xcc1100, 3);
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(pos.x, pos.y + 1.2, pos.z, 80, {spdMin: 5, spdMax: 18, visc: 0.45});
    }
  },
  shurikenKill(enemy) {
    if (this.debug) console.log('⭐ SHURIKEN KILL');
    const pos = enemy.mesh ? enemy.mesh.position : enemy.position;
    if (!pos) return;
    // Precision puncture — twin arterial jets forward + fine mist
    if (window.BloodSimulatorV21) {
      window.BloodSimulatorV21.arterialJet(pos.x, pos.y + 1.0, pos.z, 1, 0, 0xcc1100);
      window.BloodSimulatorV21.spawnMist(pos.x, pos.y + 0.6, pos.z, 6, 0xee2200);
    } else if (window.BloodV2) {
      window.BloodV2.rawBurst(pos.x, pos.y + 1.0, pos.z, 40, {spdMin: 6, spdMax: 14, visc: 0.50});
    }
  }
};
window.GoreSimulator = GoreSimulator;

// ── Backward-compat shim: existing callers use window.GoreSim with string weapon keys ──
// GoreSimulator expects weapon as {type: string}; legacy callers pass a plain string.
// Also stubs init/update/reset so guarded call-sites don't skip silently.
window.GoreSim = {
  init() {},
  update() {},
  reset() {},
  onHit(enemy, weaponKeyOrObj, hitPoint, hitNormal) {
    var w = (typeof weaponKeyOrObj === 'string') ? { type: weaponKeyOrObj } : weaponKeyOrObj;
    GoreSimulator.onHit(enemy, w, hitPoint, hitNormal);
  },
  onKill(enemy, weaponKeyOrObj, projectile) {
    var w = (typeof weaponKeyOrObj === 'string') ? { type: weaponKeyOrObj } : weaponKeyOrObj;
    GoreSimulator.onKill(enemy, w, 0, 0);
  }
};
