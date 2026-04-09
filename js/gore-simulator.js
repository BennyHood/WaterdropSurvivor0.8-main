const GoreSimulator = { onHit(enemy, weapon, hitPoint, hitNormal) { if (!enemy || enemy.dead) return; BloodSimulatorV21.onEnemyHit(enemy, hitPoint, weapon.type); if (weapon.type === 'sword' && Math.random() < 0.65) this.sliceEnemy(enemy, hitPoint, hitNormal); }, onKill(enemy, weapon, killVX = 0, killVZ = 0) { if (!enemy) return; BloodSimulatorV21.onEnemyDeath(enemy, enemy.mesh.position); if (weapon.type === 'sword') this.dismemberEnemy(enemy, killVX, killVZ); else if (weapon.type === 'boomerang') this.boomerangKill(enemy); else if (weapon.type === 'shuriken') this.shurikenKill(enemy); }, sliceEnemy(enemy, hitPoint, hitNormal) { console.log('🩸 BRUTAL SLICE – fiende skärs itu realistiskt'); const body = enemy.mesh; body.scale.set(1, 0.5, 1); const bloodPos = hitPoint.clone(); for (let i = 0; i < 35; i++) { BloodSimulatorV21.rawBurst(bloodPos.x, bloodPos.y + Math.random() * 1.2, bloodPos.z, 12, {viscosity: 0.45}); } }, dismemberEnemy(enemy, vx, vz) { console.log('💀 DISMEMBER – huvud avskuret + kropp klyvs + tarmar sprutar'); const pos = enemy.mesh.position; BloodSimulatorV21.rawBurst(pos.x, pos.y + 1.8, pos.z, 220, {spreadXZ: 22, spreadY: 32, viscosity: 0.38}); }, boomerangKill(enemy) { console.log('🌀 BOOMERANG KILL – fiende skärs i cirkel + blodexplosion'); }, shurikenKill(enemy) { console.log('⭐ SHURIKEN KILL – fiende träffas i halsen + blodfontän'); } }; window.GoreSimulator = GoreSimulator;

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
