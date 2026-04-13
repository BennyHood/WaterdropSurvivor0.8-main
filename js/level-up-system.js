// js/level-up-system.js — Level-up LVL UP modal (showUpgradeModal), LightningBolt class,
// floating level-up text, slow motion effect, LVL UP card rendering.
// Depends on: all previously loaded game files

// ── ARPG Deep Mechanics: LVL UP Rarities, Focus Path, Boss Chests ───────────

// Rarity table: Common(White)=45%, Uncommon(Green)=25%, Rare(Blue)=18%, Epic(Purple)=8%, Legendary(Gold)=3%, Mythic(Red)=1%
// Thresholds: roll > 0.55 = Common, > 0.30 = Uncommon, > 0.12 = Rare, > 0.04 = Epic, > 0.01 = Legendary, else = Mythic
const UPGRADE_RARITIES = [
  { name: 'common',    label: 'COMMON',    cssClass: 'rarity-common',    scale: 1.0, color: '#ffffff' },
  { name: 'uncommon',  label: 'UNCOMMON',  cssClass: 'rarity-uncommon',  scale: 1.3, color: '#55cc55' },
  { name: 'rare',      label: 'RARE',      cssClass: 'rarity-rare',      scale: 1.5, color: '#00aaff' },
  { name: 'epic',      label: 'EPIC',      cssClass: 'rarity-epic',      scale: 2.0, color: '#aa00ff' },
  { name: 'legendary', label: 'LEGENDARY', cssClass: 'rarity-legendary', scale: 3.0, color: '#ffd700' },
  // cssClass 'rarity-mythical' matches the existing CSS keyframe name (mythical-glow) intentionally
  { name: 'mythic',    label: 'MYTHIC',    cssClass: 'rarity-mythical',  scale: 5.0, color: '#ff0000' },
];

// Weapon unlock levels: Weapon 2 at Lv6, Weapon 3 at Lv18, Weapon 4 at Lv50
// Matches the new leveling curve (max level ~75) — all 4 weapons unlocked by level 50.
const WEAPON_UNLOCK_LEVELS = [6, 18, 50];

// Boss chest gold reward constants
const BOSS_CHEST_MIN_GOLD   = 150;
const BOSS_CHEST_GOLD_RANGE = 101; // 0–100 random bonus on top of minimum

function rollUpgradeRarity() {
  const r = Math.random();
  if (r > 0.55) return UPGRADE_RARITIES[0]; // Common    (45%)
  if (r > 0.30) return UPGRADE_RARITIES[1]; // Uncommon  (25%)
  if (r > 0.12) return UPGRADE_RARITIES[2]; // Rare      (18%)
  if (r > 0.04) return UPGRADE_RARITIES[3]; // Epic       (8%)
  if (r > 0.01) return UPGRADE_RARITIES[4]; // Legendary  (3%)
  return UPGRADE_RARITIES[5];               // Mythic      (1%)
}

// Returns a copy of a LVL UP with rarity applied — scaled stats and updated desc/apply
function makeRarityScaledUpgrade(u) {
  const rarity = rollUpgradeRarity();
  const s = rarity.scale;
  const scaled = Object.assign({}, u, {
    _rarity: rarity,
    rarityName: rarity.label,
    rarityColor: rarity.color,
  });
  try {
    switch (u.id) {
      case 'str':
      case 'atkPassive':
        scaled.desc = `Weapon Damage +${Math.round(6 * s)}%`;
        scaled.apply = () => {
          window._strLevel = (window._strLevel||0)+1;
          playerStats.strength += 0.06 * s;
          showStatChange(`[${rarity.label}] +${Math.round(6*s)}% Damage`);
        };
        break;
      case 'aspd':
        scaled.desc = `Attack Speed +${Math.round(3 * s)}%`;
        scaled.apply = () => {
          playerStats.atkSpeed += 0.03 * s;
          weapons.gun.cooldown       *= (1 - Math.min(0.5, 0.03 * s));
          weapons.doubleBarrel.cooldown *= (1 - Math.min(0.5, 0.03 * s));
          showStatChange(`[${rarity.label}] +${Math.round(3*s)}% Atk Speed`);
        };
        break;
      case 'aspdPassive':
        scaled.desc = `Attack Speed +${Math.round(4 * s)}%`;
        scaled.apply = () => {
          window._aspdPassiveLv = (window._aspdPassiveLv||0)+1;
          playerStats.atkSpeed += 0.04 * s;
          weapons.gun.cooldown       *= (1 - Math.min(0.5, 0.04 * s));
          weapons.doubleBarrel.cooldown *= (1 - Math.min(0.5, 0.04 * s));
          showStatChange(`[${rarity.label}] +${Math.round(4*s)}% Atk Speed`);
        };
        break;
      case 'armor':
        scaled.desc = `Armor +${Math.round(12 * s)}% Damage Reduction (Max 80%)`;
        scaled.apply = () => {
          playerStats.armor = Math.min(80, playerStats.armor + Math.round(12 * s));
          showStatChange(`[${rarity.label}] +${Math.round(12*s)}% Armor`);
        };
        break;
      case 'hp':
        scaled.desc = `Max HP +${Math.round(30 * s)} (Instant Heal)`;
        scaled.apply = () => {
          const amt = Math.round(30 * s);
          playerStats.maxHp += amt;
          playerStats.hp += amt;
          showStatChange(`[${rarity.label}] +${amt} Max HP`);
        };
        break;
      case 'crit':
        scaled.desc = `Critical Hit Chance +${(1.5 * s).toFixed(1)}%`;
        scaled.apply = () => {
          playerStats.critChance += 0.015 * s;
          showStatChange(`[${rarity.label}] +${(1.5*s).toFixed(1)}% Crit`);
        };
        break;
      case 'regen':
        scaled.desc = `HP Regeneration +${Math.round(2 * s)}/sec`;
        scaled.apply = () => {
          playerStats.hpRegen += Math.round(2 * s);
          showStatChange(`[${rarity.label}] +${Math.round(2*s)} HP/sec Regen`);
        };
        break;
      case 'speed':
        scaled.desc = `Movement Speed +${Math.round(3 * s)}%`;
        scaled.apply = () => {
          playerStats.walkSpeed *= (1 + 0.03 * s);
          showStatChange(`[${rarity.label}] +${Math.round(3*s)}% Move Speed`);
        };
        break;
      case 'critdmg':
        scaled.desc = `Critical Damage +${Math.round(6 * s)}%`;
        scaled.apply = () => {
          playerStats.critDmg += 0.06 * s;
          showStatChange(`[${rarity.label}] +${Math.round(6*s)}% Crit Damage`);
        };
        break;
      case 'cooldown':
        scaled.desc = `All Weapon Cooldowns -${Math.round(2 * s)}%`;
        scaled.apply = () => {
          const factor = 1 - Math.min(0.5, 0.02 * s);
          Object.values(weapons).forEach(w => { if (w && w.cooldown) w.cooldown *= factor; });
          showStatChange(`[${rarity.label}] All Cooldowns -${Math.round(2*s)}%`);
        };
        break;
      case 'life_steal':
        scaled.desc = `Heal ${Math.round(3 * s)}% of Damage Dealt (Stacks)`;
        scaled.apply = () => {
          playerStats.lifeStealPercent += 0.03 * s;
          showStatChange(`[${rarity.label}] Life Steal +${Math.round(3*s)}%`);
        };
        break;
      default:
        // For complex/conditional upgrades, just tag with rarity for visuals
        break;
    }
  } catch (_e) { /* scaling failed; keep base apply */ }
  return scaled;
}

// ── Focus-Path Prompt ─────────────────────────────────────────────────────────
function showFocusPathPrompt(onWeapons, onPassives) {
  const modal = document.getElementById('levelup-modal');
  const list  = document.getElementById('upgrade-list');
  const h2    = modal.querySelector('h2');
  if (h2) { h2.innerText = 'CHOOSE YOUR PATH'; h2.style.color = '#FFD700'; h2.style.fontSize = '28px'; }
  list.innerHTML = `
    <div class="focus-path-prompt">
      <div class="focus-path-btn focus-weapons" id="fp-weapons">
        <span class="fp-icon">⚔️</span>
        <span class="fp-title">[ FOCUS WEAPONS ]</span>
        <span class="fp-desc">Weapon upgrades only</span>
      </div>
      <div class="focus-path-btn focus-passives" id="fp-passives">
        <span class="fp-icon">📊</span>
        <span class="fp-title">[ FOCUS PASSIVES ]</span>
        <span class="fp-desc">Stat boosts only</span>
      </div>
    </div>`;
  modal.style.display = 'flex';
  document.getElementById('fp-weapons').addEventListener('pointerdown',  () => { modal.style.display='none'; onWeapons();  });
  document.getElementById('fp-passives').addEventListener('pointerdown', () => { modal.style.display='none'; onPassives(); });
}

// ── Dynamic Focus-Weapon Pool ─────────────────────────────────────────────────
// Generates 3 LVL UP cards per owned weapon: +Damage, -Cooldown, +Special.
// Rarity is rolled immediately so each card already carries _rarity/rarityName/
// rarityColor and will be skipped by makeRarityScaledUpgrade (which checks _rarity).
function buildFocusWeaponPool() {
  // Per-weapon metadata: base stat increments and a "special" upgrade factory.
  const META = {
    gun:          { icon:'🔫', name:'GUN',          dmgBase:10, cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Projectile`,   fn:()=>{ w.barrels = (w.barrels||1)+Math.round(1*s); } }) },
    sword:        { icon:'⚔️',  name:'SWORD',        dmgBase:15, cdBase:0.10, special:(w,s)=>({ label:`+${(0.5*s).toFixed(1)} Range`,     fn:()=>{ w.range = (w.range||3.5)+0.5*s; } }) },
    samuraiSword: { icon:'⚔️',  name:'SAMURAI',      dmgBase:18, cdBase:0.10, special:(w,s)=>({ label:`+${(0.5*s).toFixed(1)} Range`,     fn:()=>{ w.range = (w.range||4.0)+0.5*s; } }) },
    whip:         { icon:'🪢', name:'WHIP',          dmgBase:8,  cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Chain`,        fn:()=>{ w.chainHits = (w.chainHits||3)+Math.round(1*s); } }) },
    uzi:          { icon:'🔫', name:'UZI',           dmgBase:4,  cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Barrel`,       fn:()=>{ w.barrels = (w.barrels||1)+Math.round(1*s); } }) },
    sniperRifle:  { icon:'🎯', name:'SNIPER',        dmgBase:25, cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Pierce`,       fn:()=>{ w.piercing = (w.piercing||3)+Math.round(1*s); } }) },
    pumpShotgun:  { icon:'💥', name:'PUMP SHOTGUN',  dmgBase:6,  cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(2*s)} Pellets`,      fn:()=>{ w.pellets = (w.pellets||8)+Math.round(2*s); } }) },
    autoShotgun:  { icon:'💥', name:'AUTO SHOTGUN',  dmgBase:5,  cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(2*s)} Pellets`,      fn:()=>{ w.pellets = (w.pellets||6)+Math.round(2*s); } }) },
    minigun:      { icon:'🔥', name:'MINIGUN',       dmgBase:3,  cdBase:0.08, special:(w,s)=>({ label:`+${Math.round(1*s)} Barrel`,       fn:()=>{ w.barrels = (w.barrels||1)+Math.round(1*s); } }) },
    bow:          { icon:'🏹', name:'BOW',           dmgBase:10, cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Pierce`,       fn:()=>{ w.piercing = (w.piercing||1)+Math.round(1*s); } }) },
    teslaSaber:   { icon:'⚡', name:'TESLA SABER',   dmgBase:12, cdBase:0.10, special:(w,s)=>({ label:`+${(0.5*s).toFixed(1)} Range`,     fn:()=>{ w.range = (w.range||3.5)+0.5*s; } }) },
    doubleBarrel: { icon:'🔫', name:'DOUBLE BARREL', dmgBase:12, cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(2*s)} Pellets`,      fn:()=>{ w.pellets = (w.pellets||12)+Math.round(2*s); } }) },
    droneTurret:  { icon:'🤖', name:'DRONE',         dmgBase:3,  cdBase:0.10, special:(w,s)=>({ label:`+${(0.5*s).toFixed(1)} Range`,     fn:()=>{ w.range = (w.range||15)+0.5*s; } }) },
    aura:         { icon:'🌀', name:'AURA',          dmgBase:3,  cdBase:0.10, special:(w,s)=>({ label:`+${(0.3*s).toFixed(1)} Range`,     fn:()=>{ w.range = Math.min(8,(w.range||3)+0.3*s); } }) },
    boomerang:    { icon:'🪃', name:'BOOMERANG',     dmgBase:10, cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Range`,        fn:()=>{ w.range = (w.range||12)+Math.round(1*s); } }) },
    shuriken:     { icon:'✦',  name:'SHURIKEN',      dmgBase:5,  cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Star`,         fn:()=>{ w.projectiles = (w.projectiles||3)+Math.round(1*s); } }) },
    nanoSwarm:    { icon:'🤖', name:'NANO SWARM',    dmgBase:2,  cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(2*s)} Nanobots`,     fn:()=>{ w.swarmCount = (w.swarmCount||6)+Math.round(2*s); } }) },
    homingMissile:{ icon:'🚀', name:'MISSILE',       dmgBase:15, cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Lock-On`,      fn:()=>{ w.projectiles = (w.projectiles||1)+Math.round(1*s); } }) },
    iceSpear:     { icon:'❄️', name:'ICE SPEAR',     dmgBase:10, cdBase:0.10, special:(w,s)=>({ label:`+${(0.5*s).toFixed(1)}s Slow`,    fn:()=>{ w.slowDuration = (w.slowDuration||2000)+Math.round(500*s); } }) },
    meteor:       { icon:'☄️', name:'METEOR',        dmgBase:20, cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Area`,         fn:()=>{ w.area = (w.area||5)+Math.round(1*s); } }) },
    fireRing:     { icon:'🔥', name:'FIRE RING',     dmgBase:5,  cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Orb`,          fn:()=>{ w.orbs = (w.orbs||3)+Math.round(1*s); } }) },
    lightning:    { icon:'⚡', name:'LIGHTNING',     dmgBase:15, cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(1*s)} Strike`,       fn:()=>{ w.strikes = (w.strikes||1)+Math.round(1*s); } }) },
    poison:       { icon:'☠️', name:'POISON',        dmgBase:2,  cdBase:0.10, special:(w,s)=>({ label:`+${Math.round(2*s)} DoT Dmg`,      fn:()=>{ w.dotDamage = (w.dotDamage||3)+Math.round(2*s); } }) },
    fireball:     { icon:'🔥', name:'FIREBALL',      dmgBase:12, cdBase:0.10, special:(w,s)=>({ label:`+${(0.5*s).toFixed(1)} Blast Radius`, fn:()=>{ w.explosionRadius = (w.explosionRadius||3)+0.5*s; } }) }
  };

  const pool = [];
  Object.entries(weapons).forEach(([key, w]) => {
    if (!w || !w.active) return;
    const meta = META[key];
    if (!meta) return;

    // 1) +Damage card (rarity-scaled flat damage bonus)
    const rDmg = rollUpgradeRarity();
    const dmgAmt = Math.round(meta.dmgBase * rDmg.scale);
    pool.push({
      id: `wfocus_${key}_dmg`, weaponKey: key,
      icon: meta.icon,
      title: `${meta.name}: +${dmgAmt} Damage`,
      desc: `${meta.name} Damage +${dmgAmt} flat`,
      _rarity: rDmg, rarityName: rDmg.label, rarityColor: rDmg.color,
      apply: () => { w.damage += dmgAmt; showStatChange(`[${rDmg.label}] ${meta.name} +${dmgAmt} Damage`); }
    });

    // 2) -Cooldown card (rarity-scaled fire-rate boost)
    // cdPct is at most meta.cdBase*100*5 (Mythic scale); the 50% cap below prevents
    // a single card from halving the cooldown even at very high rarity scales.
    const rCd = rollUpgradeRarity();
    const cdPct = Math.round(meta.cdBase * 100 * rCd.scale);
    const cdFactor = 1 - Math.min(0.5, cdPct / 100); // cap reduction at 50%
    pool.push({
      id: `wfocus_${key}_cd`, weaponKey: key,
      icon: meta.icon,
      title: `${meta.name}: -${cdPct}% Cooldown`,
      desc: `${meta.name} Fire Rate +${cdPct}%`,
      _rarity: rCd, rarityName: rCd.label, rarityColor: rCd.color,
      apply: () => {
        w.cooldown = Math.max(50, Math.round(w.cooldown * cdFactor));
        showStatChange(`[${rCd.label}] ${meta.name} -${cdPct}% Cooldown`);
      }
    });

    // 3) Special LVL UP card (weapon-specific stat; e.g. +1 Projectile for gun)
    const rSp = rollUpgradeRarity();
    const sp   = meta.special(w, rSp.scale);
    pool.push({
      id: `wfocus_${key}_special`, weaponKey: key,
      icon: meta.icon,
      title: `${meta.name}: ${sp.label}`,
      desc: `${meta.name} ${sp.label}`,
      _rarity: rSp, rarityName: rSp.label, rarityColor: rSp.color,
      apply: () => { sp.fn(); showStatChange(`[${rSp.label}] ${meta.name}: ${sp.label}`); }
    });
  });
  return pool;
}

// ── Boss Chests & Relics ──────────────────────────────────────────────────────
window.bossChests = window.bossChests || [];

const RELICS = [
  { id:'relic_colossus',    icon:'🏛️', title:'COLOSSUS HEART',    desc:'+120 Max HP, +5 HP/sec Regen',         apply:()=>{ playerStats.maxHp+=120; playerStats.hp+=120; playerStats.hpRegen+=5; showStatChange('🏛️ Colossus Heart: +120 HP, +5 Regen'); } },
  { id:'relic_timelock',    icon:'⌛', title:'TIMELOCK SHARD',    desc:'All Cooldowns -30%, +10% Atk Speed',    apply:()=>{ Object.values(weapons).forEach(w=>{if(w&&w.cooldown)w.cooldown*=0.7;}); playerStats.atkSpeed+=0.10; showStatChange('⌛ Timelock Shard: -30% CD, +10% Atk Spd'); } },
  { id:'relic_companion',   icon:'🤖', title:'COMPANION MATRIX',  desc:'+2 Drone Turrets, Drone becomes active', apply:()=>{ weapons.droneTurret.active=true; weapons.droneTurret.level=Math.max(1,weapons.droneTurret.level); weapons.droneTurret.droneCount=(weapons.droneTurret.droneCount||0)+2; for(let _di=0;_di<2;_di++){try{const d=new DroneTurret(player);droneTurrets.push(d);}catch(e){console.warn('[Relic] DroneTurret spawn failed:',e);}} if(typeof startDroneHum==='function')startDroneHum(); showStatChange('🤖 Companion Matrix: +2 Drones'); } },
  { id:'relic_voidcrystal', icon:'💜', title:'VOID CRYSTAL',      desc:'+25% Crit Chance, +50% Crit Damage',    apply:()=>{ playerStats.critChance+=0.25; playerStats.critDmg+=0.50; showStatChange('💜 Void Crystal: +25% Crit, +50% Crit Dmg'); } },
  { id:'relic_soulflame',   icon:'🔥', title:'SOUL FLAME',        desc:'+8% Life Steal, +30% Damage',           apply:()=>{ playerStats.lifeStealPercent+=0.08; playerStats.strength+=0.30; showStatChange('🔥 Soul Flame: +8% Life Steal, +30% Damage'); } },
  { id:'relic_ironveil',    icon:'🛡️', title:'IRON VEIL',         desc:'+35% Armor, +30 Flat Damage Reduction', apply:()=>{ playerStats.armor=Math.min(80,playerStats.armor+35); playerStats.surfaceTension=(playerStats.surfaceTension||0)+30; showStatChange('🛡️ Iron Veil: +35% Armor, +30 Flat DR'); } },
  { id:'relic_goldmaw',     icon:'💰', title:'GOLD MAW',          desc:'+50% Gold Pickup Chance, +30% EXP Range',apply:()=>{ playerStats.treasureHunterChance=(playerStats.treasureHunterChance||0)+0.50; magnetRange*=1.30; showStatChange('💰 Gold Maw: +50% Gold Pickup, +30% EXP Range'); } },
  { id:'relic_berserkheart',icon:'😤', title:'BERSERK HEART',     desc:'+40% Damage below 40% HP, +20 Max HP',  apply:()=>{ playerStats.lowHpDamage=(playerStats.lowHpDamage||0)+0.40; playerStats.maxHp+=20; showStatChange('😤 Berserk Heart: +40% Low-HP Damage'); } },
  { id:'relic_stormcrown',  icon:'⚡', title:'STORM CROWN',       desc:'Lightning Strike active, +2 extra Strikes',apply:()=>{ weapons.lightning.active=true; weapons.lightning.level=Math.max(1,weapons.lightning.level); weapons.lightning.strikes=(weapons.lightning.strikes||1)+2; showStatChange('⚡ Storm Crown: Lightning +2 Strikes'); } },
];

function showRelicLootScreen(goldBonus) {
  const picks = RELICS.slice().sort(()=>0.5-Math.random()).slice(0,3);
  const overlay = document.createElement('div');
  overlay.id = 'relic-loot-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.87);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  const title = document.createElement('div');
  title.style.cssText = 'color:#FFD700;font-size:32px;font-weight:bold;text-shadow:0 0 24px #FFD700,0 0 48px #FF8800;margin-bottom:8px;letter-spacing:3px;font-family:inherit;';
  title.innerText = '⭐ BOSS DEFEATED ⭐';
  const sub = document.createElement('div');
  sub.style.cssText = 'color:#fff;font-size:16px;margin-bottom:32px;opacity:0.8;letter-spacing:1px;';
  sub.innerText = `+${goldBonus} GOLD  •  Choose 1 Relic`;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:28px;flex-wrap:wrap;justify-content:center;';
  picks.forEach((relic, idx) => {
    const card = document.createElement('div');
    card.className = 'relic-card';
    card.style.setProperty('--relic-delay', `${idx*0.18}s`);
    card.innerHTML = `<div class="relic-icon">${relic.icon}</div><div class="relic-title">${relic.title}</div><div class="relic-desc">${relic.desc}</div><div class="relic-pick-hint">Hold to choose</div>`;
    let holdT = null;
    const startPick = () => {
      if (holdT) return;
      card.classList.add('relic-holding');
      holdT = setTimeout(() => {
        holdT = null;
        try { relic.apply(); } catch(e) { console.error('[Relic]', e); }
        overlay.remove();
        if (typeof forceGameUnpause === 'function') forceGameUnpause();
        if (typeof addGold === 'function') addGold(goldBonus);
        if (window.pushSuperStatEvent) window.pushSuperStatEvent(`⭐ ${relic.title}`, 'legendary', '⭐', 'success');
      }, 500);
    };
    const cancelPick = () => { if (!holdT) return; clearTimeout(holdT); holdT=null; card.classList.remove('relic-holding'); };
    card.addEventListener('pointerdown', startPick);
    card.addEventListener('pointerup', cancelPick);
    card.addEventListener('pointercancel', cancelPick);
    row.appendChild(card);
  });
  overlay.appendChild(title);
  overlay.appendChild(sub);
  overlay.appendChild(row);
  document.body.appendChild(overlay);
}

class BossChest {
  constructor(x, z, goldBonus) {
    this.collected  = false;
    this.goldBonus  = goldBonus;
    this._spawnPos  = { x, z };
    this._radius    = 2.8;
    this._spawnTime = Date.now();
    this.mesh       = null;
    try {
      const geo = new THREE.BoxGeometry(1.2, 1.0, 0.9);
      const mat = new THREE.MeshPhongMaterial({
        color: 0xFFD700,
        emissive: new THREE.Color(0xFFAA00),
        emissiveIntensity: 1.2,
        shininess: 100  // High shininess for golden treasure effect
      });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.position.set(x, 0.5, z);
      this.mesh.castShadow = true;
      scene.add(this.mesh);
    } catch(_e) {}
  }

  update(playerPos) {
    if (this.collected) return;
    if (this.mesh) {
      const t = (Date.now() - this._spawnTime) / 1000;
      this.mesh.position.y = 0.5 + Math.sin(t * 2.5) * 0.15;
      this.mesh.rotation.y += 0.025;
      this.mesh.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.4;
      const dx = playerPos.x - this.mesh.position.x;
      const dz = playerPos.z - this.mesh.position.z;
      if (dx*dx + dz*dz < this._radius * this._radius) this.collect();
    } else {
      const dx = playerPos.x - this._spawnPos.x;
      const dz = playerPos.z - this._spawnPos.z;
      if (dx*dx + dz*dz < this._radius * this._radius) this.collect();
    }
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
    const pos = this.mesh ? { x: this.mesh.position.x, y: 0.5, z: this.mesh.position.z } : { x: this._spawnPos.x, y: 0.5, z: this._spawnPos.z };
    if (this.mesh) {
      try { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); } catch(_) {}
      this.mesh = null;
    }
    try { spawnParticles(pos, 0xFFD700, 20); } catch(_) {}
    if (typeof setGamePaused === 'function') setGamePaused(true);
    showRelicLootScreen(this.goldBonus);
  }
}

window.spawnBossChest = function(x, z) {
  const goldBonus = BOSS_CHEST_MIN_GOLD + Math.floor(Math.random() * BOSS_CHEST_GOLD_RANGE);
  window.bossChests.push(new BossChest(x, z, goldBonus));
  try { createFloatingText('💰 BOSS CHEST!', { x, y: 1.5, z }, '#FFD700'); } catch(_) {}
};

// ── End ARPG Deep Mechanics preamble ─────────────────────────────────────────

    // ─── Card Shard Explosion ─────────────────────────────────────────────────
    // Shatters a card into flying pieces — regular blast + confetti + toward-camera 3D pieces.
    function _explodeCardShards(cardEl) {
      if (!cardEl) return;
      const rect = cardEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Get the card's rarity color for shard tinting
      const rarityClass = Array.from(cardEl.classList).find(c => c.startsWith('rarity-')) || '';
      const rarityColors = {
        'rarity-common':    '#cccccc',
        'rarity-uncommon':  '#44cc44',
        'rarity-rare':      '#44aaff',
        'rarity-epic':      '#aa44ff',
        'rarity-legendary': '#ffd700',
        'rarity-mythical':  '#ff3300',
      };
      const shardColor = rarityColors[rarityClass] || '#cccccc';
      // Accent color: white/gold for premium look
      const accentColor = '#fff';

      // ── Toward-camera pieces: grow large as they "fly through the screen" ──
      const TOWARD_COUNT = 7;
      for (let _ti = 0; _ti < TOWARD_COUNT; _ti++) {
        const piece = document.createElement('div');
        const angle = (_ti / TOWARD_COUNT) * Math.PI * 2;
        const driftX = Math.cos(angle) * (30 + Math.random() * 80);
        const driftY = Math.sin(angle) * (30 + Math.random() * 60) - 30; // bias upward
        const baseSize = 8 + Math.random() * 14;
        const rot0 = Math.random() * 360;
        const startTime = performance.now();
        const dur = 380 + Math.random() * 160;

        piece.style.cssText = [
          'position:fixed',
          `left:${cx}px`, `top:${cy}px`,
          `width:${baseSize}px`, `height:${baseSize * 1.35}px`,
          `background:linear-gradient(135deg,${shardColor},${accentColor})`,
          'opacity:1', 'pointer-events:none', 'z-index:10600',
          `transform:translate(-50%,-50%) scale(0.15) rotate(${rot0}deg)`,
          'border-radius:2px',
          `box-shadow:0 0 8px ${shardColor},0 0 20px ${shardColor}88`,
          'will-change:transform,opacity',
        ].join(';');
        document.body.appendChild(piece);

        (function _animTow(el, _dx, _dy, _r0, _bs, _dur) {
          const elapsed = performance.now() - startTime;
          const t = Math.min(1, elapsed / _dur);
          // Scale from 0.15 → ~5 (comes toward camera), then past you
          const scale = 0.15 + t * 5.0;
          const curX = cx + _dx * t * 0.5;
          const curY = cy + _dy * t * 0.5;
          const curRot = _r0 + t * 90;
          const op = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
          el.style.left = curX + 'px';
          el.style.top = curY + 'px';
          el.style.transform = `translate(-50%,-50%) scale(${scale}) rotate(${curRot}deg)`;
          el.style.opacity = Math.max(0, op);
          if (t < 1) requestAnimationFrame(() => _animTow(el, _dx, _dy, _r0, _bs, _dur));
          else el.remove();
        })(piece, driftX, driftY, rot0, baseSize, dur);
      }

      // ── Regular blast shards in all directions ──
      const SHARD_COUNT = 36;
      for (let i = 0; i < SHARD_COUNT; i++) {
        const shard = document.createElement('div');
        const angle = (i / SHARD_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = 220 + Math.random() * 580;
        const size = 5 + Math.random() * 18;
        const aspectW = 0.4 + Math.random() * 2.4;
        const rot0 = Math.random() * 360;
        const rotSpeed = (Math.random() - 0.5) * 1000;
        // Alternate between rarity color, gold accent, and white
        const col = i % 3 === 0 ? shardColor : (i % 3 === 1 ? '#ffd700' : accentColor);

        shard.style.cssText = [
          'position:fixed',
          `left:${cx}px`, `top:${cy}px`,
          `width:${size * aspectW}px`, `height:${size}px`,
          `background:${col}`,
          'opacity:1', 'pointer-events:none', `z-index:10500`,
          `transform:translate(-50%,-50%) rotate(${rot0}deg)`,
          `border-radius:${Math.random() < 0.35 ? '50%' : '2px'}`,
          `box-shadow:0 0 5px ${col}`,
          'will-change:transform,opacity',
        ].join(';');
        document.body.appendChild(shard);

        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const startTime = performance.now();
        const duration = 550 + Math.random() * 450;

        (function _animShard(sEl, _vx, _vy, _vr, _dur, _r0) {
          const elapsed = performance.now() - startTime;
          const t = elapsed / _dur;
          if (t >= 1) { sEl.remove(); return; }
          const eased = 1 - t * t;
          const tSec = elapsed / 1000;
          const curX = cx + _vx * tSec * eased;
          const curY = cy + _vy * tSec * eased + 110 * tSec * tSec; // gravity
          const curRot = _r0 + _vr * tSec;
          const op = Math.max(0, 1 - t * 1.1);
          sEl.style.left = curX + 'px';
          sEl.style.top = curY + 'px';
          sEl.style.transform = `translate(-50%,-50%) rotate(${curRot}deg)`;
          sEl.style.opacity = op;
          requestAnimationFrame(() => _animShard(sEl, _vx, _vy, _vr, _dur, _r0));
        })(shard, vx, vy, rotSpeed, duration, rot0);
      }
    }

    function showUpgradeModal(isBonusRound = false, focusPath = null) {
      // Bail out if the game has ended; prevents stale setTimeout from showing modal post-death
      if (isGameOver || !isGameActive) {
        levelUpPending = false;
        return;
      }
      const modal = document.getElementById('levelup-modal');
      const list = document.getElementById('upgrade-list');
      list.innerHTML = '';
      // Reset header for two-press system
      const h2 = modal.querySelector('h2');
      if (h2) {
        h2.innerText = isBonusRound ? 'BONUS LEVEL UP!' : 'LEVEL UP!';
        h2.style.color = isBonusRound ? '#FFD700' : '#FFFFFF';
        h2.style.fontSize = isBonusRound ? '28px' : '36px';
        h2.style.fontFamily = 'Bangers, Impact, sans-serif';
        h2.style.fontWeight = 'bold';
        h2.style.letterSpacing = '6px';
        h2.style.textAlign = 'center';
        h2.style.textShadow = isBonusRound
          ? '0 0 20px #FFD700, 0 0 40px #FF8800, 2px 2px 0 #000'
          : '0 0 20px #FF4400, 0 0 40px #FF8800, 2px 2px 0 #000';
        h2.style.textTransform = 'uppercase';
        h2.style.animation = 'levelUpFly 1s ease-out forwards';
      }
      let choices = [];

      // --- POOL OF LVL UP OPTIONS ---
      const commonUpgrades = [
        { 
          id: 'str', 
          icon: '⚔️',
          title: `TIDAL FORCE Lv.${(window._strLevel||0)+1}`, 
          desc: `Weapon Damage +6% (Total: ${Math.round(((window._strLevel||0)+1)*6)}%)`, 
          apply: () => { 
            window._strLevel = (window._strLevel||0)+1;
            playerStats.strength += 0.06;
            showStatChange(`+6% Damage (Total +${Math.round(window._strLevel*6)}%)`);
          } 
        },
        { 
          id: 'aspd', 
          icon: '⚡',
          title: 'RAPID CURRENT', 
          desc: 'Attack Speed +3%', 
          apply: () => { 
            playerStats.atkSpeed += 0.03; // Reduced from 0.15 to 0.03 for level-100 balance
            weapons.gun.cooldown *= 0.97; // Adjusted from 0.85 to 0.97
            weapons.doubleBarrel.cooldown *= 0.97;
            showStatChange('+3% Attack Speed');
          } 
        },
        { 
          id: 'armor', 
          icon: '🛡️',
          title: 'HARDENED SHELL', 
          desc: 'Armor +12% (Damage Reduction, Max 80%)', 
          apply: () => { 
            playerStats.armor = Math.min(80, playerStats.armor + 12); 
            showStatChange('+12% Armor (Current: ' + playerStats.armor + '%)');
          } 
        },
        { 
          id: 'hp', 
          icon: '❤️',
          title: 'DEEP RESERVOIR', 
          desc: 'Max HP +30 (Instant Heal +30)', 
          apply: () => { 
            playerStats.maxHp += 30; 
            playerStats.hp += 30; 
            showStatChange('+30 Max HP');
          } 
        },
        { 
          id: 'crit', 
          icon: '🎯',
          title: 'PRECISION STRIKE', 
          desc: 'Critical Hit Chance +1.5%', 
          apply: () => { 
            playerStats.critChance += 0.015; // Reduced from 0.08 to 0.015 for level-100 balance
            showStatChange('+1.5% Crit Chance (Now: ' + Math.round(playerStats.critChance * 100) + '%)');
          } 
        },
        { 
          id: 'regen', 
          icon: '💚',
          title: 'SPRING WATER', 
          desc: 'HP Regeneration +2/sec (Passive Healing)', 
          apply: () => { 
            playerStats.hpRegen += 2; 
            showStatChange('+2 HP/sec Regen (Total: ' + playerStats.hpRegen + '/sec)');
          } 
        },
        { 
          id: 'speed', 
          icon: '🏃',
          title: 'SWIFT STREAM', 
          desc: 'Movement Speed +3%', 
          apply: () => { 
            playerStats.walkSpeed *= 1.03; // Reduced from 1.15 to 1.03 for level-100 balance
            showStatChange('+3% Move Speed');
          } 
        },
        { 
          id: 'critdmg', 
          icon: '💥',
          title: 'TORRENT POWER', 
          desc: 'Critical Damage +6%', 
          apply: () => { 
            playerStats.critDmg += 0.06; // Reduced from 0.3 to 0.06 for level-100 balance
            showStatChange('+6% Crit Damage (Now: ' + Math.round(playerStats.critDmg * 100) + '%)');
          } 
        },
        { 
          id: 'magnet', 
          icon: '🧲',
          title: 'WHIRLPOOL', 
          desc: 'EXP Pickup Range +25% (+1 unit)', 
          apply: () => { 
            magnetRange += 1; 
            showStatChange('EXP Magnet Range +25% (Now: ' + magnetRange + ' units)');
          } 
        },
        { 
          id: 'cooldown', 
          icon: '⏱️',
          title: 'FLOW STATE', 
          desc: 'All Weapon Cooldowns -2%', 
          apply: () => { 
            weapons.gun.cooldown *= 0.98; // Reduced from 0.95 to 0.98 for level-100 balance
            weapons.sword.cooldown *= 0.98;
            weapons.aura.cooldown *= 0.98;
            weapons.meteor.cooldown *= 0.98;
            weapons.droneTurret.cooldown *= 0.98;
            weapons.doubleBarrel.cooldown *= 0.98;
            weapons.iceSpear.cooldown *= 0.98;
            weapons.fireRing.cooldown *= 0.98;
            showStatChange('All Weapon Cooldowns -2%');
          } 
        },
        { 
          id: 'dash_mastery', 
          icon: '💨',
          title: 'DASH MASTERY', 
          desc: 'Dash Cooldown -20%, Distance +30%', 
          apply: () => { 
            playerStats.dashCooldownReduction += 0.2;
            playerStats.dashDistanceBonus += 0.3;
            dashCooldown *= 0.8;
            dashDistance *= 1.3;
            player.dashDuration *= 0.9; // Slightly faster dash
            showStatChange('Dash Improved! CD: -20%, Distance: +30%');
          } 
        },
        { 
          id: 'second_wind', 
          icon: '🛡️',
          title: 'SECOND WIND', 
          desc: 'Gain 30 Shield when HP drops below 30%', 
          apply: () => { 
            playerStats.hasSecondWind = true;
            showStatChange('Second Wind Unlocked!');
          } 
        },
        { 
          id: 'life_steal', 
          icon: '🩸',
          title: 'LIFE STEAL', 
          desc: 'Heal 3% of Damage Dealt (Stacks)', 
          apply: () => { 
            playerStats.lifeStealPercent += 0.03;
            showStatChange('Life Steal +3% (Total: ' + Math.round(playerStats.lifeStealPercent * 100) + '%)');
          } 
        },
        { 
          id: 'thorns', 
          icon: '🔱',
          title: 'THORNS', 
          desc: 'Reflect 15% Damage to Attackers (Stacks)', 
          apply: () => { 
            playerStats.thornsPercent += 0.15;
            showStatChange('Thorns +15% (Total: ' + Math.round(playerStats.thornsPercent * 100) + '%)');
          } 
        },
        { 
          id: 'berserker_rage', 
          icon: '😤',
          title: 'BERSERKER RAGE', 
          desc: 'Gain 25% Attack Speed when below 50% HP', 
          apply: () => { 
            playerStats.hasBerserkerRage = true;
            showStatChange('Berserker Rage Unlocked!');
          } 
        },
        { 
          id: 'treasure_hunter', 
          icon: '💰',
          title: 'TREASURE HUNTER', 
          desc: '20% Chance to Drop Extra Gold (Stacks)', 
          apply: () => { 
            playerStats.treasureHunterChance += 0.2;
            showStatChange('Treasure Hunter +20% (Total: ' + Math.round(playerStats.treasureHunterChance * 100) + '%)');
          } 
        },
        { 
          id: 'lucky_strikes', 
          icon: '✨',
          title: 'LUCKY STRIKES', 
          desc: 'Crits have 25% Chance to Strike Twice', 
          apply: () => { 
            playerStats.doubleCritChance += 0.25;
            showStatChange('Lucky Strikes +25% (Total: ' + Math.round(playerStats.doubleCritChance * 100) + '%)');
          } 
        },
        { 
          id: 'pierce', 
          icon: '🎯',
          title: 'PIERCING SHOTS', 
          desc: 'Bullets Hit +1 Additional Enemy (Stacks)', 
          apply: () => { 
            playerStats.pierceCount = (playerStats.pierceCount || 0) + 1;
            const totalHits = playerStats.pierceCount + 1;
            showStatChange('Piercing +1! (Total hits: ' + totalHits + ' enemies)');
          } 
        },
        { 
          id: 'double_cast', 
          icon: '🔀',
          title: 'DOUBLE CAST', 
          desc: 'Small chance to fire twice per shot (+20% per stack)', 
          apply: () => { 
            playerStats.doubleCastChance = (playerStats.doubleCastChance || 0) + 0.20;
            const pct = Math.round((playerStats.doubleCastChance || 0) * 100);
            showStatChange('Double Cast! (' + pct + '% chance to fire twice)');
          } 
        },
        {
          id: 'double_upgrade_chance',
          icon: '🎲',
          title: 'DOUBLE LVL UP CHANCE',
          desc: 'Chance to get one more LVL UP box after the original one (+25% per stack, max 100% at 4 stacks)',
          apply: () => {
            playerStats.doubleUpgradeChance = (playerStats.doubleUpgradeChance || 0) + 0.25;
            showStatChange('Double LVL UP Chance +25%! (Total: ' + Math.round(playerStats.doubleUpgradeChance * 100) + '%)');
          }
        },
        {
          id: 'atkPassive',
          icon: '🗡️',
          title: `ATTACK MASTERY Lv.${(window._atkPassiveLv||0)+1}`,
          desc: `Weapon Damage +6% (Total: ${Math.round(((window._atkPassiveLv||0)+1)*6)}%)`,
          apply: () => {
            window._atkPassiveLv = (window._atkPassiveLv||0)+1;
            playerStats.strength += 0.06;
            showStatChange(`+6% Damage (Total +${Math.round(window._atkPassiveLv*6)}%)`);
          }
        },
        {
          id: 'aspdPassive',
          icon: '💨',
          title: `SPEED MASTERY Lv.${(window._aspdPassiveLv||0)+1}`,
          desc: `Attack Speed +4% (Total: ${Math.round(((window._aspdPassiveLv||0)+1)*4)}%)`,
          apply: () => {
            window._aspdPassiveLv = (window._aspdPassiveLv||0)+1;
            playerStats.atkSpeed += 0.04;
            weapons.gun.cooldown *= 0.96;
            weapons.doubleBarrel.cooldown *= 0.96;
            showStatChange(`+4% Atk Speed (Total +${Math.round(window._aspdPassiveLv*4)}%)`);
          }
        },
        {
          id: 'projSize',
          icon: '🔴',
          title: 'BIGGER SHOTS',
          desc: 'Projectile Size +25%',
          apply: () => {
            window._projSizeMultiplier = (window._projSizeMultiplier || 1.0) * 1.25;
            showStatChange('+25% Projectile Size');
          }
        },
        {
          id: 'projSpeed',
          icon: '⚡',
          title: 'FASTER SHOTS',
          desc: 'Projectile Speed +30%',
          apply: () => {
            window._projSpeedMultiplier = (window._projSpeedMultiplier || 1.0) * 1.30;
            showStatChange('+30% Projectile Speed');
          }
        },
        {
          id: 'projAmount',
          icon: '🌟',
          title: 'MULTISHOT',
          rarity: 'legendary',
          desc: '+1 Extra Projectile per shot (Requires Mini-Boss Kill)',
          apply: () => {
            if (!window._miniBossDefeated) {
              showStatChange('❌ MULTISHOT requires defeating a Mini-Boss first!');
              return;
            }
            window._extraProjectiles = (window._extraProjectiles || 0) + 1;
            showStatChange(`+1 Projectile (Total: ${1 + window._extraProjectiles})`);
          }
        },
        // ── Waterdrop-Theme RPG Stats ────────────────────────────────────────
        {
          id: 'surface_tension',
          icon: '🫧',
          title: 'SURFACE TENSION',
          desc: 'Flat Damage Reduction: ignore 4 damage per hit (Stacks)',
          apply: () => {
            playerStats.surfaceTension = (playerStats.surfaceTension || 0) + 4;
            showStatChange(`Surface Tension +4 (Total: ${playerStats.surfaceTension} flat reduction)`);
          }
        },
        {
          id: 'boiling_point',
          icon: '🔥',
          title: 'BOILING POINT',
          desc: 'Low HP Fury: below 40% HP gain +25% Move Speed & +20% Fire Rate',
          apply: () => {
            playerStats.boilingPoint = (playerStats.boilingPoint || 0) + 1;
            showStatChange(`Boiling Point Lv.${playerStats.boilingPoint}! Low-HP rage activated`);
          }
        },
        {
          id: 'viscosity',
          icon: '💧',
          title: 'VISCOSITY',
          desc: 'Knockback Weight +30%: all weapons push enemies further (Stacks)',
          apply: () => {
            playerStats.viscosity = (playerStats.viscosity || 0) + 0.30;
            showStatChange(`+30% Knockback Weight (Total: ${Math.round(playerStats.viscosity * 100)}%)`);
          }
        },
        {
          id: 'capillary_action',
          icon: '⭐',
          title: 'CAPILLARY ACTION',
          desc: 'EXP & Gold Pickup Range ×1.5 (Stacks multiplicatively)',
          apply: () => {
            magnetRange *= 1.5;
            playerStats.capillaryAction = (playerStats.capillaryAction || 0) + 1;
            showStatChange(`Capillary Action Lv.${playerStats.capillaryAction}! EXP/Gold range ×1.5`);
          }
        },
        {
          id: 'secondShotChance',
          icon: '🔫',
          title: 'SECOND SHOT',
          desc: 'Second Shot Chance +10%',
          apply: () => {
            playerStats.secondShotChance = (playerStats.secondShotChance || 0) + 0.10;
            showStatChange(`+10% Second Shot Chance (Now: ${Math.round(playerStats.secondShotChance * 100)}%)`);
          }
        },
        {
          id: 'explosiveRounds',
          icon: '💥',
          title: 'EXPLOSIVE ROUNDS',
          desc: 'Explosive Rounds +8% chance',
          apply: () => {
            playerStats.explosiveRounds = (playerStats.explosiveRounds || 0) + 0.08;
            showStatChange(`+8% Explosive Rounds (Now: ${Math.round(playerStats.explosiveRounds * 100)}%)`);
          }
        },
        {
          id: 'freezeOnHit',
          icon: '❄️',
          title: 'FREEZE ON HIT',
          desc: 'Freeze on Hit +5% chance',
          apply: () => {
            playerStats.freezeOnHit = (playerStats.freezeOnHit || 0) + 0.05;
            showStatChange(`+5% Freeze on Hit (Now: ${Math.round(playerStats.freezeOnHit * 100)}%)`);
          }
        },
        {
          id: 'areaOfEffect',
          icon: '🌀',
          title: 'AREA OF EFFECT',
          desc: 'AoE +20% (explosive weapons)',
          apply: () => {
            playerStats.aoeBonus = (playerStats.aoeBonus || 1) * 1.20;
            showStatChange(`+20% AoE Radius`);
          }
        },
        {
          id: 'companionDamage',
          icon: '🤖',
          title: 'COMPANION BOOST',
          desc: 'Companion Dmg +20%',
          apply: () => {
            playerStats.companionDamageMult = (playerStats.companionDamageMult || 1) * 1.20;
            showStatChange(`+20% Companion Damage`);
          }
        },
        {
          id: 'xpMagnet',
          icon: '🧲',
          title: 'XP MAGNET',
          desc: 'XP Pickup Range +2.5 radius',
          apply: () => {
            window._sandboxXpMagnetRunStacks = (window._sandboxXpMagnetRunStacks || 0) + 1;
            playerStats.xpMagnetStacks = (playerStats.xpMagnetStacks || 0) + 1;
            showStatChange(`XP Magnet Lv.${playerStats.xpMagnetStacks}! +2.5 pickup radius`);
          }
        }
      ];

      // --- SPECIAL LEVELS ---
      
      // Quest 8: Force weapon choice when quest8_newWeapon is active (grant first new weapon).
      // STRICT LEVEL GATE: only trigger at level 4+ so levels 2-3 remain passive-only.
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon' &&
          !WEAPON_UNLOCK_LEVELS.includes(playerStats.lvl) && playerStats.lvl >= 4) {
        modal.querySelector('h2').innerText = 'NEW WEAPON!';
        modal.querySelector('h2').style.fontSize = '36px';
        const allWeaponChoicesQ8 = [
          { id: 'sword', title: 'TIDAL SLASH', desc: 'Slash enemies in front', active: () => weapons.sword.active, apply: () => { weapons.sword.active = true; weapons.sword.level = 1; showStatChange('New Weapon: Sword'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'aura', title: 'STORM SURGE', desc: 'Damage aura around you', active: () => weapons.aura.active, apply: () => { weapons.aura.active = true; weapons.aura.level = 1; showStatChange('New Weapon: Aura'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'meteor', title: 'HAILSTORM', desc: 'Call meteors from sky', active: () => weapons.meteor.active, apply: () => { weapons.meteor.active = true; weapons.meteor.level = 1; showStatChange('New Weapon: Meteor'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'icespear', title: 'ICE SPEAR', desc: 'Freezing projectile that slows enemies 40%', active: () => weapons.iceSpear.active, apply: () => { weapons.iceSpear.active = true; weapons.iceSpear.level = 1; showStatChange('New Weapon: Ice Spear'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'firering', title: 'FIRE RING', desc: 'Spinning fire orbs orbit around you', active: () => weapons.fireRing.active, apply: () => { weapons.fireRing.active = true; weapons.fireRing.level = 1; showStatChange('New Weapon: Fire Ring'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'samuraiSword', title: 'SAMURAI SWORD', desc: 'Swift katana strikes', active: () => weapons.samuraiSword.active, apply: () => { weapons.samuraiSword.active = true; weapons.samuraiSword.level = 1; showStatChange('New Weapon: Samurai Sword'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'whip', title: 'WHIP', desc: 'Chain through enemies', active: () => weapons.whip.active, apply: () => { weapons.whip.active = true; weapons.whip.level = 1; showStatChange('New Weapon: Whip'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'bow', title: 'BOW', desc: 'Long-range piercing arrows', active: () => weapons.bow.active, apply: () => { weapons.bow.active = true; weapons.bow.level = 1; showStatChange('New Weapon: Bow'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'boomerang', title: 'BOOMERANG', desc: 'Hits enemies both ways', active: () => weapons.boomerang.active, apply: () => { weapons.boomerang.active = true; weapons.boomerang.level = 1; showStatChange('New Weapon: Boomerang'); progressTutorialQuest('quest8_newWeapon', true); } }
        ];
        const availableQ8 = allWeaponChoicesQ8.filter(w => !w.active());
        choices = availableQ8.sort(() => 0.5 - Math.random()).slice(0, Math.min(3, availableQ8.length));
        if (choices.length < 3) {
          const fillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3 - choices.length);
          choices.push(...fillers);
        }
        choices.push(...commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3));
      }
      // Levels 5, 9, 17, 23: WEAPON LVL UP LEVELS (first weapon upgrade at level 5)
      else if ([5, 9, 17, 23].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'WEAPON LVL UP!';
        modal.querySelector('h2').style.fontSize = '36px';
        
        choices = [];
        
        // Phase 3: Weapon upgrades now go to level 5 (up from 4)
        // Offer weapon upgrades for active weapons
        if (weapons.gun.active) {
          const nextLevel = weapons.gun.level + 1;
          choices.push({ 
            id: 'gun_upgrade', 
            icon: '🔫',
            title: `GUN Level ${nextLevel}`, 
            desc: `Damage +10, Fire Rate +15%`, 
            apply: () => { 
              weapons.gun.level++;
              weapons.gun.damage += 10;
              weapons.gun.cooldown *= 0.85;
              showStatChange(`Gun Level ${weapons.gun.level}: +10 Dmg, +15% Fire Rate`);
            } 
          });
        }
        
        if (weapons.sword.active) {
          const nextLevel = weapons.sword.level + 1;
          choices.push({ 
            id: 'sword_upgrade', 
            icon: '⚔️',
            title: `SWORD Level ${nextLevel}`, 
            desc: `Damage +15, Range +0.5`, 
            apply: () => { 
              weapons.sword.level++;
              weapons.sword.damage += 15;
              weapons.sword.range += 0.5;
              showStatChange(`Sword Level ${weapons.sword.level}: +15 Dmg, +0.5 Range`);
            } 
          });
        }
        
        if (weapons.aura.active) {
          const nextLevel = weapons.aura.level + 1;
          const baseRange = 3; // Initial range
          const currentRange = weapons.aura.range;
          const nextRange = Math.min(5, baseRange * (1 + (nextLevel * 0.10))); // +10% per level, cap at 5
          const rangeIncrease = Math.round((nextRange - currentRange) * 10) / 10;
          
          choices.push({ 
            id: 'aura_upgrade', 
            icon: '🌀',
            title: `AURA Level ${nextLevel}`, 
            desc: `Damage +3, Range +${rangeIncrease.toFixed(1)}`, 
            apply: () => { 
              weapons.aura.level++;
              weapons.aura.damage += 3;
              weapons.aura.range = Math.min(5, baseRange * (1 + (weapons.aura.level * 0.10)));
              showStatChange(`Aura Level ${weapons.aura.level}: +3 Dmg, +${rangeIncrease.toFixed(1)} Range`);
            } 
          });
        }
        
        if (weapons.meteor.active) {
          const nextLevel = weapons.meteor.level + 1;
          choices.push({ 
            id: 'meteor_upgrade', 
            icon: '☄️',
            title: `METEOR Level ${nextLevel}`, 
            desc: `Damage +20, Area +1`, 
            apply: () => { 
              weapons.meteor.level++;
              weapons.meteor.damage += 20;
              weapons.meteor.area += 1;
              showStatChange(`Meteor Level ${weapons.meteor.level}: +20 Dmg, +1 Area`);
            } 
          });
        }
        
        if (weapons.droneTurret.active) {
          const nextLevel = weapons.droneTurret.level + 1;
          // Phase 3: Define levels where drones are added
          const DRONE_TURRET_SPAWN_LEVELS = [2, 4, 5];
          const addDrone = DRONE_TURRET_SPAWN_LEVELS.includes(nextLevel);
          choices.push({ 
            id: 'droneturret_upgrade', 
            title: `DRONE TURRET Level ${nextLevel}`, 
            desc: addDrone ? `Damage +8, Fire Rate +10%, +1 Drone` : `Damage +8, Fire Rate +10%`, 
            apply: () => { 
              weapons.droneTurret.level++;
              weapons.droneTurret.damage += 8;
              weapons.droneTurret.cooldown *= 0.9;
              if (addDrone) {
                // Create new drone first, then update count
                const drone = new DroneTurret(player);
                // Position offset for multiple drones
                const droneIndex = droneTurrets.length;
                const totalDrones = weapons.droneTurret.droneCount + 1; // Count after adding
                const angle = (droneIndex / totalDrones) * Math.PI * 2;
                drone.offset = new THREE.Vector3(
                  Math.cos(angle) * 2.5,
                  1.5,
                  Math.sin(angle) * 2.5
                );
                droneTurrets.push(drone);
                weapons.droneTurret.droneCount++;
                startDroneHum(); // Start continuous drone sound
                showStatChange(`Drone Turret Level ${weapons.droneTurret.level}: +8 Dmg, +10% Fire Rate, +1 Drone!`);
              } else {
                showStatChange(`Drone Turret Level ${weapons.droneTurret.level}: +8 Dmg, +10% Fire Rate`);
              }
            } 
          });
        }
        
        if (weapons.doubleBarrel.active) {
          const nextLevel = weapons.doubleBarrel.level + 1;
          choices.push({ 
            id: 'doublebarrel_upgrade', 
            icon: '🔫',
            title: `DOUBLE BARREL Level ${nextLevel}`, 
            desc: `+1 Shot, Damage +12, Fire Rate +10%`, 
            apply: () => { 
              weapons.doubleBarrel.level++;
              weapons.doubleBarrel.damage += 12;
              weapons.doubleBarrel.cooldown *= 0.9;
              weapons.doubleBarrel.pellets = (weapons.doubleBarrel.pellets || 2) + 1;
              showStatChange(`Double Barrel Level ${weapons.doubleBarrel.level}: +1 Shot, +12 Dmg`);
            } 
          });
        }
        
        if (weapons.iceSpear.active) {
          const nextLevel = weapons.iceSpear.level + 1;
          choices.push({ 
            id: 'icespear_upgrade', 
            icon: '❄️',
            title: `ICE SPEAR Level ${nextLevel}`, 
            desc: `Damage +10, Slow +10%, Duration +0.5s`, 
            apply: () => { 
              weapons.iceSpear.level++;
              weapons.iceSpear.damage += 10;
              weapons.iceSpear.slowPercent += 0.1;
              weapons.iceSpear.slowDuration += 500;
              showStatChange(`Ice Spear Level ${weapons.iceSpear.level}: +10 Dmg, +10% Slow, +0.5s Duration`);
            } 
          });
        }
        
        if (weapons.fireRing.active) {
          const nextLevel = weapons.fireRing.level + 1;
          choices.push({ 
            id: 'firering_upgrade', 
            icon: '🔥',
            title: `FIRE RING Level ${nextLevel}`, 
            desc: `Damage +5, +1 Orb, Range +0.5`, 
            apply: () => { 
              weapons.fireRing.level++;
              weapons.fireRing.damage += 5;
              weapons.fireRing.orbs += 1;
              weapons.fireRing.range += 0.5;
              showStatChange(`Fire Ring Level ${weapons.fireRing.level}: +5 Dmg, +1 Orb, +0.5 Range`);
            } 
          });
        }
        
        // Phase 3: Add more stat upgrades for diversity with weighted selection
        // ATK speed and damage have 3x higher probability (weighted random selection)
        const selectedUpgrades = [];
        for (let i = 0; i < 3; i++) {
          // Calculate weighted random selection
          const weights = commonUpgrades.map(u => 
            (u.id === 'str' || u.id === 'aspd') ? 3 : 1
          );
          const totalWeight = weights.reduce((sum, w) => sum + w, 0);
          let random = Math.random() * totalWeight;
          
          let selectedIndex = 0;
          for (let j = 0; j < weights.length; j++) {
            random -= weights[j];
            if (random <= 0) {
              selectedIndex = j;
              break;
            }
          }
          
          selectedUpgrades.push(commonUpgrades[selectedIndex]);
        }
        choices.push(...selectedUpgrades);
        
        // ALWAYS SHOW 6 CHOICES: Shuffle and ensure exactly 6 choices in 2×3 grid
        choices = choices.sort(() => 0.5 - Math.random()).slice(0, 6);
        // If we have less than 6, fill with common upgrades (use Set for O(n) lookup)
        if (choices.length < 6) {
          const existingIds = new Set(choices.map(c => c.id));
          const additionalUpgrades = commonUpgrades.filter(u => !existingIds.has(u.id));
          const needed = 6 - choices.length;
          choices.push(...additionalUpgrades.slice(0, needed));
        }
      }
      // WEAPON UNLOCK: Level 4, 8, 15, 20 — show ONLY 6 weapon choices (no stat upgrades)
      // WEAPON UNLOCK: Level 4 (Weapon 2), 12 (Weapon 3), 25 (Weapon 4)
      else if (WEAPON_UNLOCK_LEVELS.includes(playerStats.lvl)) {

        // ── Helper: count currently active weapons (gun is always active) ──
        const countActiveWeapons = () => Object.values(weapons).filter(w => w.active).length;
        const atWeaponCap = countActiveWeapons() >= 4; // Hard cap: max 4 active weapons

        modal.querySelector('h2').innerText = atWeaponCap ? 'WEAPON LVL UP!' : 'NEW WEAPON!';
        modal.querySelector('h2').style.fontSize = '36px';

        const questCheck = () => { if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); };

        // ── Weapon Evolution table: weapon key → Mythic evolved form ─────────
        // When a weapon reaches Level 10 it "Evolves" into a Mythic state with
        // drastically improved stats and a new identity.
        const WEAPON_EVOLUTIONS = {
          gun:          { name: 'RAILGUN',        icon: '🔵', desc: 'EVOLVED: Penetrating rail shot, 3× damage, infinite pierce' },
          sword:        { name: 'PLASMA SCYTHE',  icon: '🌀', desc: 'EVOLVED: 3× range arc, melts through armor' },
          samuraiSword: { name: 'VOID KATANA',    icon: '⚫', desc: 'EVOLVED: Void tears on hit, ignores 50% armor' },
          whip:         { name: 'CHAOS LASH',     icon: '🟣', desc: 'EVOLVED: Chains to 10 enemies, triple damage' },
          uzi:          { name: 'STORM NEEDLER',  icon: '💠', desc: 'EVOLVED: 4 barrels, high-velocity void rounds' },
          sniperRifle:  { name: 'DARK MATTER GUN',icon: '🌑', desc: 'EVOLVED: Collapses enemies into singularities' },
          pumpShotgun:  { name: 'FLAK CANNON',    icon: '💥', desc: 'EVOLVED: Explosive shrapnel burst, 2× radius' },
          autoShotgun:  { name: 'HELLSTORM',      icon: '🔥', desc: 'EVOLVED: Incendiary shells, burns on hit' },
          minigun:      { name: 'OBLITERATOR',    icon: '⚙️', desc: 'EVOLVED: No spin-up delay, void-tipped rounds' },
          bow:          { name: 'DIVINE LONGBOW', icon: '✨', desc: 'EVOLVED: Holy arrows split into 5 on hit' },
          teslaSaber:   { name: 'NOVA BLADE',     icon: '⚡', desc: 'EVOLVED: Full-screen lightning on each swing' },
          doubleBarrel: { name: 'VORTEX CANNON',  icon: '🌪️', desc: 'EVOLVED: Pellets orbit and spiral outward' },
          droneTurret:  { name: 'DEATH SPHERE',   icon: '🔴', desc: 'EVOLVED: 3 autonomous spheres, lock-on lasers' },
          aura:         { name: 'VOID CORONA',    icon: '🟤', desc: 'EVOLVED: 3× radius, ignores armor' },
          boomerang:    { name: 'PHASE BLADE',    icon: '🔷', desc: 'EVOLVED: Passes through walls, returns twice' },
          shuriken:     { name: 'STAR STORM',     icon: '💫', desc: 'EVOLVED: 8 stars + chain explosion on impact' },
          nanoSwarm:    { name: 'PLAGUE CLOUD',   icon: '☣️', desc: 'EVOLVED: Infects enemies, spreads on death' },
          homingMissile:{ name: 'NOVA TORPEDO',   icon: '🚀', desc: 'EVOLVED: Splits into 4 seeking warheads' },
          iceSpear:     { name: 'GLACIER SPIKE',  icon: '❄️', desc: 'EVOLVED: Permafrost — freezes on hit for 3s' },
          meteor:       { name: 'EXTINCTION EVENT',icon:'☄️', desc: 'EVOLVED: Carpet-bombs the entire arena' },
          fireRing:     { name: 'SOLAR HALO',     icon: '🌟', desc: 'EVOLVED: 8 orbital suns, each explodes on hit' },
          lightning:    { name: 'STORM GOD',      icon: '⚡', desc: 'EVOLVED: Chain reaction through every enemy' },
          poison:       { name: 'VOID DECAY',     icon: '🟢', desc: 'EVOLVED: Void corrosion — bypasses Divine Shield' },
          fireball:     { name: 'ARMAGEDDON',     icon: '🔥', desc: 'EVOLVED: Reality-warping fire — ignores resistances' }
        };

        // Apply evolution stats to a weapon when it reaches level 10
        function applyWeaponEvolution(weaponKey) {
          const w = weapons[weaponKey];
          if (!w || w.evolved) return;
          w.evolved = true;
          // Stat burst: damage 3×, cooldown halved, bonus multipliers
          w.damage   = Math.round(w.damage * 3);
          w.cooldown = Math.round(w.cooldown * 0.5);
          if (w.range)            w.range            = Math.round(w.range * 3 * 10) / 10;
          if (w.pellets)          w.pellets          += 6;
          if (w.piercing)         w.piercing         += 5;
          if (w.chainHits)        w.chainHits        += 4;
          if (w.projectiles)      w.projectiles      += 4;
          if (w.swarmCount)       w.swarmCount       *= 2;
          if (w.droneCount)       w.droneCount       += 2;
          if (w.orbs)             w.orbs             += 4;
          if (w.strikes)          w.strikes          += 4;
          if (w.explosionRadius)  w.explosionRadius  *= 2;
          if (w.area)             w.area             *= 2;
          if (w.dotDamage)        w.dotDamage        *= 3;
          if (w.slowPercent)      w.slowPercent       = Math.min(0.9, w.slowPercent * 2);
          const evo = WEAPON_EVOLUTIONS[weaponKey];
          showStatChange(`🌟 ${evo ? evo.name : weaponKey.toUpperCase()} EVOLVED into MYTHIC form!`);
          if (window.pushSuperStatEvent) window.pushSuperStatEvent(`🌟 ${evo ? evo.name : 'EVOLVED'}`, 'mythic', '⭐', 'success');
        }

        // Full weapon pool — inactive weapons first, then upgrades for active weapons
        // Cat 1 = Handheld, Cat 2 = Passive, Cat 3 = Elemental
        const newWeaponChoices = [
          // ── Category 1: Handheld Weapons ──
          { id: 'sword',        icon: '⚔️',  title: 'TIDAL SLASH',        desc: 'Slash enemies in front of you',                category: 1, active: () => weapons.sword.active,        apply: () => { weapons.sword.active = true; weapons.sword.level = 1; showStatChange('New Weapon: Sword'); questCheck(); } },
          { id: 'samuraiSword', icon: '⚔️',  title: 'SAMURAI SWORD',      desc: 'Swift katana — high damage, fast strikes',      category: 1, active: () => weapons.samuraiSword.active,  apply: () => { weapons.samuraiSword.active = true; weapons.samuraiSword.level = 1; showStatChange('New Weapon: Samurai Sword'); questCheck(); } },
          { id: 'whip',         icon: '🪢',  title: 'WHIP',               desc: 'Chain through 3 enemies with each crack',       category: 1, active: () => weapons.whip.active,          apply: () => { weapons.whip.active = true; weapons.whip.level = 1; showStatChange('New Weapon: Whip'); questCheck(); } },
          { id: 'uzi',          icon: '🔫',  title: 'UZI',                desc: 'Extreme fire rate — low damage, many bullets',   category: 1, active: () => weapons.uzi.active,           apply: () => { weapons.uzi.active = true; weapons.uzi.level = 1; showStatChange('New Weapon: Uzi'); questCheck(); } },
          { id: 'sniperRifle',  icon: '🎯',  title: '50 CAL SNIPER',      desc: 'Massive damage, pierces 3 enemies, slow fire',  category: 1, active: () => weapons.sniperRifle.active,   apply: () => { weapons.sniperRifle.active = true; weapons.sniperRifle.level = 1; showStatChange('New Weapon: 50 Cal Sniper'); questCheck(); } },
          { id: 'pumpShotgun',  icon: '💥',  title: 'PUMP SHOTGUN',       desc: 'Devastating close-range 8-pellet spread',       category: 1, active: () => weapons.pumpShotgun.active,   apply: () => { weapons.pumpShotgun.active = true; weapons.pumpShotgun.level = 1; showStatChange('New Weapon: Pump Shotgun'); questCheck(); } },
          { id: 'autoShotgun',  icon: '💥',  title: 'AUTO SHOTGUN',       desc: 'Rapid semi-auto shotgun bursts',                category: 1, active: () => weapons.autoShotgun.active,   apply: () => { weapons.autoShotgun.active = true; weapons.autoShotgun.level = 1; showStatChange('New Weapon: Auto Shotgun'); questCheck(); } },
          { id: 'minigun',      icon: '🔥',  title: 'MINIGUN',            desc: 'Rotary barrel — extreme fire rate, needs spin-up', category: 1, active: () => weapons.minigun.active,    apply: () => { weapons.minigun.active = true; weapons.minigun.level = 1; showStatChange('New Weapon: Minigun'); questCheck(); } },
          { id: 'bow',          icon: '🏹',  title: 'BOW',                desc: 'Long-range arrows that pierce enemies',         category: 1, active: () => weapons.bow.active,           apply: () => { weapons.bow.active = true; weapons.bow.level = 1; showStatChange('New Weapon: Bow'); questCheck(); } },
          { id: 'teslaSaber',   icon: '⚡',  title: 'TESLA SABER',        desc: 'Energy blade — chains lightning on hit',         category: 1, active: () => weapons.teslaSaber.active,    apply: () => { weapons.teslaSaber.active = true; weapons.teslaSaber.level = 1; showStatChange('New Weapon: Tesla Saber'); questCheck(); } },
          { id: 'doublebarrel', icon: '🔫',  title: 'DOUBLE BARREL',      desc: 'Devastating 12-pellet shotgun swarm',           category: 1, active: () => weapons.doubleBarrel.active, apply: () => { weapons.doubleBarrel.active = true; weapons.doubleBarrel.level = 1; showStatChange('New Weapon: Double Barrel'); questCheck(); } },
          // ── Category 2: Passive Non-Elemental Weapons ──
          { id: 'droneturret',  icon: '🤖',  title: 'DRONE TURRET',       desc: 'Automated drone that shoots enemies',           category: 2, active: () => weapons.droneTurret.active, apply: () => { weapons.droneTurret.active = true; weapons.droneTurret.level = 1; const drone = new DroneTurret(player); droneTurrets.push(drone); startDroneHum(); showStatChange('New Weapon: Drone Turret'); questCheck(); } },
          { id: 'aura',         icon: '🌀',  title: 'STORM SURGE',        desc: 'Damage aura — zaps nearby enemies',             category: 2, active: () => weapons.aura.active,         apply: () => { weapons.aura.active = true; weapons.aura.level = 1; showStatChange('New Weapon: Aura'); questCheck(); } },
          { id: 'boomerang',    icon: '🪃',  title: 'BOOMERANG',          desc: 'Returns to you — hits enemies both ways',        category: 2, active: () => weapons.boomerang.active,    apply: () => { weapons.boomerang.active = true; weapons.boomerang.level = 1; showStatChange('New Weapon: Boomerang'); questCheck(); } },
          { id: 'shuriken',     icon: '✦',   title: 'SHURIKEN',           desc: 'Throws 3 spinning stars at nearby enemies',     category: 2, active: () => weapons.shuriken.active,     apply: () => { weapons.shuriken.active = true; weapons.shuriken.level = 1; showStatChange('New Weapon: Shuriken'); questCheck(); } },
          { id: 'nanoSwarm',    icon: '🤖',  title: 'NANO SWARM',         desc: 'Cloud of nanobots shreds nearby enemies',       category: 2, active: () => weapons.nanoSwarm.active,    apply: () => { weapons.nanoSwarm.active = true; weapons.nanoSwarm.level = 1; showStatChange('New Weapon: Nano Swarm'); questCheck(); } },
          { id: 'homing',       icon: '🚀',  title: 'HOMING MISSILE',     desc: 'Heat-seeking missile — never misses',           category: 2, active: () => weapons.homingMissile.active, apply: () => { weapons.homingMissile.active = true; weapons.homingMissile.level = 1; showStatChange('New Weapon: Homing Missile'); questCheck(); } },
          { id: 'icespear',     icon: '❄️',  title: 'ICE SPEAR',          desc: 'Crystalline shard that slows enemies 40%',      category: 2, active: () => weapons.iceSpear.active,     apply: () => { weapons.iceSpear.active = true; weapons.iceSpear.level = 1; showStatChange('New Weapon: Ice Spear'); questCheck(); } },
          // ── Category 3: Elemental Weapons ──
          { id: 'meteor',       icon: '☄️',  title: 'HAILSTORM',          desc: 'Call meteors from the sky',                     category: 3, active: () => weapons.meteor.active,       apply: () => { weapons.meteor.active = true; weapons.meteor.level = 1; showStatChange('New Weapon: Meteor'); questCheck(); } },
          { id: 'firering',     icon: '🔥',  title: 'FIRE RING',          desc: 'Spinning fire orbs orbit around you',           category: 3, active: () => weapons.fireRing.active,     apply: () => { weapons.fireRing.active = true; weapons.fireRing.level = 1; showStatChange('New Weapon: Fire Ring'); questCheck(); } },
          { id: 'lightning',    icon: '⚡',  title: 'LIGHTNING STRIKE',   desc: 'Lightning from the heavens strikes enemies',    category: 3, active: () => weapons.lightning.active,    apply: () => { weapons.lightning.active = true; weapons.lightning.level = 1; showStatChange('New Weapon: Lightning Strike'); questCheck(); } },
          { id: 'poison',       icon: '☠️',  title: 'POISON CLOUD',       desc: 'Toxic cloud that damages over time',            category: 3, active: () => weapons.poison.active,       apply: () => { weapons.poison.active = true; weapons.poison.level = 1; showStatChange('New Weapon: Poison Cloud'); questCheck(); } },
          { id: 'fireball',     icon: '🔥',  title: 'FIREBALL',           desc: 'Fireballs explode on impact — area damage',     category: 3, active: () => weapons.fireball.active,     apply: () => { weapons.fireball.active = true; weapons.fireball.level = 1; showStatChange('New Weapon: Fireball'); questCheck(); } }
        ];

        // ── Weapon-upgrade entries (used both at cap and as padding) ─────────
        // Weapons at level 9 show an EVOLVE option that triggers their Mythic form.
        // After evolution, the regular LVL UP is always shown (no hard level cap).
        function makeUpgradeEntry(key, icon, label, regularApply) {
          const w = weapons[key];
          if (!w || !w.active) return null;
          if (w.level >= 10 && !w.evolved) {
            const evo = WEAPON_EVOLUTIONS[key] || { name: key.toUpperCase(), icon: '⭐', desc: 'Mythic Evolution' };
            return { id: `${key}_evo`, icon: evo.icon, title: `✨ EVOLVE: ${evo.name}`, desc: evo.desc, apply: () => { applyWeaponEvolution(key); } };
          }
          // No hard level cap — allow endless scaling for late-game
          return { id: `${key}_up`, icon, title: `${label} Lv.${w.level + 1}`, desc: `LVL UP ${label}`, apply: regularApply };
        }

        const upgradeWeapons = [
          makeUpgradeEntry('gun',           '🎯', 'GUN',          () => { weapons.gun.level++;          weapons.gun.damage += 10;          weapons.gun.cooldown *= 0.85;                                            showStatChange(`Gun Level ${weapons.gun.level}`); }),
          makeUpgradeEntry('sword',         '⚔️', 'SWORD',        () => { weapons.sword.level++;        weapons.sword.damage += 15;        weapons.sword.range += 0.5;                                              showStatChange(`Sword Level ${weapons.sword.level}`); }),
          makeUpgradeEntry('samuraiSword',  '⚔️', 'SAMURAI',      () => { weapons.samuraiSword.level++; weapons.samuraiSword.damage += 18; weapons.samuraiSword.cooldown *= 0.9;                                    showStatChange(`Samurai Level ${weapons.samuraiSword.level}`); }),
          makeUpgradeEntry('whip',          '🪢', 'WHIP',         () => { weapons.whip.level++;         weapons.whip.damage += 8;          weapons.whip.chainHits = (weapons.whip.chainHits || 3) + 1;              showStatChange(`Whip Level ${weapons.whip.level}`); }),
          makeUpgradeEntry('uzi',           '🔫', 'UZI',          () => { weapons.uzi.level++;          weapons.uzi.damage += 4;           weapons.uzi.cooldown *= 0.9;                                             showStatChange(`Uzi Level ${weapons.uzi.level}`); }),
          makeUpgradeEntry('sniperRifle',   '🎯', 'SNIPER',       () => { weapons.sniperRifle.level++;  weapons.sniperRifle.damage += 25;  weapons.sniperRifle.piercing = (weapons.sniperRifle.piercing || 3) + 1;  showStatChange(`Sniper Level ${weapons.sniperRifle.level}`); }),
          makeUpgradeEntry('pumpShotgun',   '💥', 'PUMP SHOTGUN', () => { weapons.pumpShotgun.level++;  weapons.pumpShotgun.damage += 6;   weapons.pumpShotgun.pellets += 2;                                        showStatChange(`Pump Shotgun Level ${weapons.pumpShotgun.level}`); }),
          makeUpgradeEntry('autoShotgun',   '💥', 'AUTO SHOTGUN', () => { weapons.autoShotgun.level++;  weapons.autoShotgun.damage += 5;   weapons.autoShotgun.cooldown *= 0.9;                                     showStatChange(`Auto Shotgun Level ${weapons.autoShotgun.level}`); }),
          makeUpgradeEntry('minigun',       '🔥', 'MINIGUN',      () => { weapons.minigun.level++;      weapons.minigun.damage += 3;       weapons.minigun.cooldown *= 0.92;                                        showStatChange(`Minigun Level ${weapons.minigun.level}`); }),
          makeUpgradeEntry('bow',           '🏹', 'BOW',          () => { weapons.bow.level++;          weapons.bow.damage += 10;          weapons.bow.piercing = (weapons.bow.piercing || 1) + 1;                  showStatChange(`Bow Level ${weapons.bow.level}`); }),
          makeUpgradeEntry('teslaSaber',    '⚡', 'TESLA SABER',  () => { weapons.teslaSaber.level++;   weapons.teslaSaber.damage += 12;                                                                            showStatChange(`Tesla Saber Level ${weapons.teslaSaber.level}`); }),
          makeUpgradeEntry('doubleBarrel',  '🔫', 'DOUBLE BARREL',() => { weapons.doubleBarrel.level++; weapons.doubleBarrel.damage += 12; weapons.doubleBarrel.cooldown *= 0.9; weapons.doubleBarrel.pellets = (weapons.doubleBarrel.pellets || 2) + 1; showStatChange(`Double Barrel Level ${weapons.doubleBarrel.level}`); }),
          makeUpgradeEntry('droneTurret',   '🤖', 'DRONE',        () => { weapons.droneTurret.level++;  weapons.droneTurret.damage += 3;   weapons.droneTurret.cooldown *= 0.88;                                    showStatChange(`Drone Level ${weapons.droneTurret.level}`); }),
          makeUpgradeEntry('aura',          '🌀', 'AURA',         () => { weapons.aura.level++;         weapons.aura.damage += 3;          weapons.aura.range = Math.min(5, weapons.aura.range * 1.1);              showStatChange(`Aura Level ${weapons.aura.level}`); }),
          makeUpgradeEntry('boomerang',     '🪃', 'BOOMERANG',    () => { weapons.boomerang.level++;    weapons.boomerang.damage += 10;    weapons.boomerang.range += 1;                                            showStatChange(`Boomerang Level ${weapons.boomerang.level}`); }),
          makeUpgradeEntry('shuriken',      '✦',  'SHURIKEN',     () => { weapons.shuriken.level++;     weapons.shuriken.damage += 5;      weapons.shuriken.projectiles = (weapons.shuriken.projectiles || 3) + 1;  showStatChange(`Shuriken Level ${weapons.shuriken.level}`); }),
          makeUpgradeEntry('nanoSwarm',     '🤖', 'NANO SWARM',   () => { weapons.nanoSwarm.level++;    weapons.nanoSwarm.damage += 2;     weapons.nanoSwarm.swarmCount += 2;                                       showStatChange(`Nano Swarm Level ${weapons.nanoSwarm.level}`); }),
          makeUpgradeEntry('homingMissile', '🚀', 'MISSILE',      () => { weapons.homingMissile.level++;weapons.homingMissile.damage += 15;weapons.homingMissile.cooldown *= 0.85;                                  showStatChange(`Missile Level ${weapons.homingMissile.level}`); }),
          makeUpgradeEntry('iceSpear',      '❄️', 'ICE SPEAR',    () => { weapons.iceSpear.level++;     weapons.iceSpear.damage += 10;     weapons.iceSpear.slowPercent += 0.1;                                     showStatChange(`Ice Spear Level ${weapons.iceSpear.level}`); }),
          makeUpgradeEntry('fireRing',      '🔥', 'FIRE RING',    () => { weapons.fireRing.level++;     weapons.fireRing.damage += 5;      weapons.fireRing.orbs += 1;                                              showStatChange(`Fire Ring Level ${weapons.fireRing.level}`); }),
          makeUpgradeEntry('meteor',        '☄️', 'METEOR',       () => { weapons.meteor.level++;       weapons.meteor.damage += 20;       weapons.meteor.area += 1;                                                showStatChange(`Meteor Level ${weapons.meteor.level}`); }),
          makeUpgradeEntry('lightning',     '⚡', 'LIGHTNING',    () => { weapons.lightning.level++;    weapons.lightning.damage += 15;    weapons.lightning.strikes = (weapons.lightning.strikes || 1) + 1;        showStatChange(`Lightning Level ${weapons.lightning.level}`); }),
          makeUpgradeEntry('poison',        '☠️', 'POISON',       () => { weapons.poison.level++;       weapons.poison.dotDamage += 2;     weapons.poison.range += 0.5;                                             showStatChange(`Poison Level ${weapons.poison.level}`); }),
          makeUpgradeEntry('fireball',      '🔥', 'FIREBALL',     () => { weapons.fireball.level++;     weapons.fireball.damage += 12;     weapons.fireball.explosionRadius += 0.5;                                 showStatChange(`Fireball Level ${weapons.fireball.level}`); })
        ].filter(Boolean); // remove null entries (inactive or maxed+evolved)

        // ── Build final choices ──────────────────────────────────────────────
        // If player is at the 4-weapon cap, skip new weapons and only offer upgrades/evolutions.
        const shuffledUp  = upgradeWeapons.sort(() => 0.5 - Math.random());
        let choices_new = [];
        if (!atWeaponCap) {
          const inactiveWeapons = newWeaponChoices.filter(w => !w.active());
          choices_new = inactiveWeapons.sort(() => 0.5 - Math.random());
        }
        choices = [...choices_new, ...shuffledUp].slice(0, 6);

        // If still < 6 (edge case: all weapons maxed), loop inactive weapons again or repeat upgrades
        if (choices.length < 6) {
          const filler = [...choices_new, ...shuffledUp];
          while (choices.length < 6 && filler.length) {
            const pick = filler.shift();
            if (!choices.find(c => c.id === pick.id)) choices.push(pick);
          }
        }
      }
      // Level 10: CLASS SELECTION - ALWAYS SHOW 6 CHOICES
      else if (playerStats.lvl === 10) {
        modal.querySelector('h2').innerText = 'CHOOSE YOUR CLASS';
        modal.querySelector('h2').style.fontSize = '42px';
        
        choices = [
          { 
            id: 'class_tank', 
            title: 'TANK', 
            desc: 'Survivability: +50 Max HP, +2 HP/sec Regen, +20% Armor, -15% Speed', 
            apply: () => { 
              playerStats.maxHp+=50; 
              playerStats.hp+=50; 
              playerStats.hpRegen+=2; 
              playerStats.armor+=20;
              playerStats.walkSpeed *= 0.85;
              showStatChange('Class: TANK (+50 HP, +2 Regen, +20% Armor)');
            } 
          },
          { 
            id: 'class_berserker', 
            title: 'BERSERKER', 
            desc: 'Str+30%, Crit+10%, Attack Speed+20%, Armor-10%', 
            apply: () => { 
              playerStats.strength+=0.3; 
              playerStats.critChance+=0.1; 
              playerStats.atkSpeed+=0.2;
              weapons.gun.cooldown *= 0.8;
              playerStats.armor = Math.max(0, playerStats.armor-10);
              showStatChange('Class: BERSERKER');
            } 
          },
          { 
            id: 'class_rogue', 
            title: 'ROGUE', 
            desc: 'Speed+25%, Crit+15%, Crit Dmg+30%, HP-20', 
            apply: () => { 
              playerStats.walkSpeed *= 1.25; 
              playerStats.critChance+=0.15; 
              playerStats.critDmg+=0.3;
              playerStats.maxHp = Math.max(50, playerStats.maxHp-20);
              playerStats.hp = Math.min(playerStats.hp, playerStats.maxHp);
              showStatChange('Class: ROGUE');
            } 
          },
          { 
            id: 'class_mage', 
            title: 'MAGE', 
            desc: 'Aura Range+2, Meteor CD-1s, Regen+3, Move Speed+10%', 
            apply: () => { 
              weapons.aura.range+=2; 
              weapons.meteor.cooldown = Math.max(500, weapons.meteor.cooldown-1000);
              playerStats.hpRegen+=3;
              playerStats.walkSpeed *= 1.1;
              showStatChange('Class: MAGE');
            } 
          },
          {
            id: 'class_vampire',
            icon: '🧛',
            title: 'VAMPIRE',
            rarity: 'rare',
            desc: 'Drain 8% of damage dealt as HP. +15% damage but -20% max HP.',
            apply: () => {
              window._vampireClass = true;
              playerStats.maxHp = Math.max(50, playerStats.maxHp * 0.80);
              playerStats.hp = Math.min(playerStats.hp, playerStats.maxHp);
              playerStats.strength += 0.15;
              playerStats.lifeStealPercent += 0.08;
              showStatChange('🧛 VAMPIRE! Drain life on hit!');
              // Apply crimson pulsing aura to player mesh
              if (player && player.mesh && player.mesh.material) {
                player.mesh.material.emissive = new THREE.Color(0x8B0000);
                const pulseAura = () => {
                  if (!window._vampireClass || !player || !player.mesh) return;
                  player.mesh.material.emissiveIntensity = 0.2 + Math.sin(performance.now() / 500) * 0.15;
                  window._vampireAuraRaf = requestAnimationFrame(pulseAura);
                };
                if (window._vampireAuraRaf) cancelAnimationFrame(window._vampireAuraRaf);
                pulseAura();
              }
            }
          }
        ];
        // Fill with common upgrades to reach 6 choices
        const classSelectionFillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 2);
        choices.push(...classSelectionFillers);
      } 
      // Level 12, 18, 25: PERK UNLOCKS - ALWAYS SHOW 6 CHOICES
      else if ([12, 18, 25].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'PERK UNLOCK!';
        modal.querySelector('h2').style.fontSize = '40px';
        
        // Create perk pool based on level
        const perkChoices = [
          { 
            id: 'perk_vampire', 
            icon: '🧛',
            title: 'VAMPIRE', 
            desc: `Life Steal: Heal 5% of damage dealt (Current: ${Math.round(playerStats.perks.vampire * 5)}%)`, 
            apply: () => { 
              playerStats.perks.vampire++;
              playerStats.lifeStealPercent += 0.05;
              showStatChange(`Vampire Level ${playerStats.perks.vampire}! (5% of damage heals you)`);
            } 
          },
          { 
            id: 'perk_juggernaut', 
            icon: '🛡️',
            title: 'JUGGERNAUT', 
            desc: `Damage Reduction +8% (Current: ${Math.round(playerStats.perks.juggernaut * 8)}%)`, 
            apply: () => { 
              playerStats.perks.juggernaut++;
              playerStats.armor = Math.min(80, playerStats.armor + 8);
              showStatChange(`Juggernaut Perk Level ${playerStats.perks.juggernaut}! (+8% Armor)`);
            } 
          },
          { 
            id: 'perk_swift', 
            icon: '⚡',
            title: 'SWIFT', 
            desc: `Movement Speed +15% (Current: Level ${playerStats.perks.swift})`, 
            apply: () => { 
              playerStats.perks.swift++;
              playerStats.walkSpeed *= 1.15;
              showStatChange(`Swift Perk Level ${playerStats.perks.swift}! (+15% Move Speed)`);
            } 
          },
          { 
            id: 'perk_lucky', 
            icon: '🍀',
            title: 'LUCKY', 
            desc: `Critical Chance +8% (Current: ${Math.round(playerStats.perks.lucky * 8)}%)`, 
            apply: () => { 
              playerStats.perks.lucky++;
              playerStats.critChance += 0.08;
              showStatChange(`Lucky Perk Level ${playerStats.perks.lucky}! (+8% Crit Chance)`);
            } 
          },
          { 
            id: 'perk_berserker', 
            icon: '💢',
            title: 'BERSERKER SOUL', 
            desc: `Low HP Bonus +10% Damage (Current: Level ${playerStats.perks.berserker})`, 
            apply: () => { 
              playerStats.perks.berserker++;
              playerStats.lowHpDamage = (playerStats.lowHpDamage || 0) + 0.10;
              showStatChange(`Berserker Soul Level ${playerStats.perks.berserker}! (Bonus when HP < 50%)`);
            } 
          }
        ];
        
        // ALWAYS SHOW 6 CHOICES: Select perks and fill with common upgrades
        choices = perkChoices.sort(() => 0.5 - Math.random()).slice(0, 3);
        const perkUnlockFillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3);
        choices.push(...perkUnlockFillers);
      }
      else {
        // ── Level 4: WEAPONS ONLY (first new weapon unlock) ────────────────────────
        if (playerStats.lvl === 4 && focusPath === null) {
          showUpgradeModal(isBonusRound, 'weapons');
          return;
        }

        // ── Level 6+: Auto-alternate weapon / passive each level ────────────────────
        // Even levels → weapon focus; odd levels → passive focus (no prompt needed)
        if (!isBonusRound && focusPath === null && playerStats.lvl >= 6) {
          const autoPath = (playerStats.lvl % 2 === 0) ? 'weapons' : 'passives';
          showUpgradeModal(isBonusRound, autoPath);
          return;
        }

        // ── Focus Path Prompt (levels 5 only after we gate 4 and 6+) ──────────────
        if (!isBonusRound && focusPath === null && playerStats.lvl === 5) {
          showFocusPathPrompt(
            () => showUpgradeModal(isBonusRound, 'weapons'),
            () => showUpgradeModal(isBonusRound, 'passives')
          );
          return;
        }

        // ALWAYS SHOW 3 CHOICES:
        // WEAPON focus (level 5+) → dynamic per-weapon upgrade cards
        // PASSIVE focus (level 5+) → stat boosts with rarity math
        // No path (level ≤ 4)     → mixed passives + basic weapon unlocks
        
        // Create weighted pool with Fisher-Yates shuffle for proper randomization
        const weightedPool = [];
        
        // Determine chosen focus path
        const isWeaponFocus  = focusPath === 'weapons';
        const isPassiveFocus = focusPath === 'passives';

        // Build dynamic per-weapon pool (3 cards per active weapon: Damage / Cooldown / Special)
        const focusWeaponPool = buildFocusWeaponPool();

        if (isWeaponFocus) {
          // WEAPON path: fully dynamic, per-weapon upgrade cards for all owned weapons
          focusWeaponPool.forEach(e => weightedPool.push({ upgrade: e, weight: 1 }));
        } else if (isPassiveFocus) {
          // PASSIVE path: ONLY stat boost entries (rarity math applied below)
          commonUpgrades.forEach(upgrade => {
            weightedPool.push({ upgrade, weight: 1 });
          });
        } else {
          // No path chosen (level ≤ 4): level 2-3 = passives only; level 4+ = mixed passives + weapon unlocks
          commonUpgrades.forEach(upgrade => {
            let w;
            if (upgrade.id === 'str' || upgrade.id === 'aspd') {
              w = 3;
            } else if (upgrade.id === 'atkPassive' || upgrade.id === 'aspdPassive' ||
                       upgrade.id === 'cooldown'   || upgrade.id === 'crit' || upgrade.id === 'critdmg') {
              w = 2;
            } else {
              w = 1;
            }
            weightedPool.push({ upgrade, weight: w });
          });
          // Basic weapon unlock options only available at level 4+
          // Levels 2-3 are passive-only to ease the player into the game.
          if (playerStats.lvl >= 4) {
            const basicWeaponUnlocks = [
              { id:'bwu_sword',     weaponKey:'sword',     icon:'⚔️',  title:'TIDAL SLASH',  desc:'New Weapon: Sword — slash enemies in front',   apply:()=>{ if(!weapons.sword.active){weapons.sword.active=true;weapons.sword.level=1;showStatChange('New Weapon: Sword!');} } },
              { id:'bwu_aura',      weaponKey:'aura',      icon:'🌀',  title:'STORM SURGE',  desc:'New Weapon: Aura — zap nearby enemies',        apply:()=>{ if(!weapons.aura.active){weapons.aura.active=true;weapons.aura.level=1;showStatChange('New Weapon: Aura!');} } },
              { id:'bwu_meteor',    weaponKey:'meteor',    icon:'☄️',  title:'HAILSTORM',    desc:'New Weapon: Meteor — call meteors from sky',   apply:()=>{ if(!weapons.meteor.active){weapons.meteor.active=true;weapons.meteor.level=1;showStatChange('New Weapon: Meteor!');} } },
              { id:'bwu_fireRing',  weaponKey:'fireRing',  icon:'🔥',  title:'FIRE RING',    desc:'New Weapon: Fire Ring — orbiting fire orbs',   apply:()=>{ if(!weapons.fireRing.active){weapons.fireRing.active=true;weapons.fireRing.level=1;showStatChange('New Weapon: Fire Ring!');} } },
              { id:'bwu_iceSpear',  weaponKey:'iceSpear',  icon:'❄️',  title:'ICE SPEAR',    desc:'New Weapon: Ice Spear — slows enemies 40%',    apply:()=>{ if(!weapons.iceSpear.active){weapons.iceSpear.active=true;weapons.iceSpear.level=1;showStatChange('New Weapon: Ice Spear!');} } },
              { id:'bwu_boomerang', weaponKey:'boomerang', icon:'🪃',  title:'BOOMERANG',    desc:'New Weapon: Boomerang — hits enemies both ways',apply:()=>{ if(!weapons.boomerang.active){weapons.boomerang.active=true;weapons.boomerang.level=1;showStatChange('New Weapon: Boomerang!');} } },
            ].filter(e => weapons[e.weaponKey] && !weapons[e.weaponKey].active);
            basicWeaponUnlocks.forEach(e => weightedPool.push({ upgrade: e, weight: 2 }));
            // Also include gun-specific dynamic upgrades for the always-active gun
            focusWeaponPool.filter(e => e.weaponKey === 'gun').forEach(e => weightedPool.push({ upgrade: e, weight: 1 }));
          }
        }
        
        // Expand weighted pool based on weights
        const expandedPool = [];
        weightedPool.forEach(item => {
          for (let i = 0; i < item.weight; i++) {
            expandedPool.push(item.upgrade);
          }
        });
        
        // Fisher-Yates shuffle for proper randomization
        for (let i = expandedPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [expandedPool[i], expandedPool[j]] = [expandedPool[j], expandedPool[i]];
        }
        
        // Pick 4 unique upgrades
        const unique = [];
        const seen = new Set();
        
        for (const upgrade of expandedPool) {
          if (!seen.has(upgrade.id)) {
            unique.push(upgrade);
            seen.add(upgrade.id);
          }
          if (unique.length >= 4) break;
        }
        
        choices = unique;
      }

      // SAFETY FALLBACK: ensure exactly 4 choices are always available
      if (!choices) choices = [];
      if (choices.length < 4) {
        const fallbackItems = [
          {
            id: 'fallback_hp', icon: '❤️', title: '+20 MAX HP', desc: 'Max HP +20 (Instant Heal +20)',
            apply: () => {
              playerStats.maxHp += 20;
              playerStats.hp = Math.min(playerStats.hp + 20, playerStats.maxHp);
              showStatChange('+20 Max HP');
            }
          },
          {
            id: 'fallback_heal', icon: '💊', title: 'HEAL 50%', desc: 'Instantly restore 50% of your max HP',
            apply: () => {
              playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + Math.floor(playerStats.maxHp * 0.5));
              showStatChange('Healed 50% HP!');
            }
          },
          {
            id: 'fallback_gold', icon: '💰', title: '+50 GOLD', desc: 'Gain 50 gold instantly',
            apply: () => {
              playerStats.gold += 50;
              showStatChange('+50 Gold');
            }
          }
        ];
        const usedIds = new Set(choices.map(c => c.id));
        for (const f of fallbackItems) {
          if (choices.length >= 4) break;
          if (!usedIds.has(f.id)) {
            choices.push(f);
            usedIds.add(f.id);
          }
        }
        // If still under 4, fill with shuffled common upgrades
        if (choices.length < 4) {
          const pool = commonUpgrades.filter(u => !usedIds.has(u.id));
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          choices.push(...pool.slice(0, 4 - choices.length));
        }
      }

      try {
      // Apply rarity scaling to all choices that don't already have a rarity assigned
      choices = choices.map(u => (u._rarity ? u : makeRarityScaledUpgrade(u)));

      // Shared active-hold state: only one card can be held at a time
      let activeHold = null; // { timer, card } or null
      choices.forEach((u, index) => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        
        // Determine rarity class: rolled _rarity takes priority for scalable upgrades
        if (u._rarity) {
          card.className += ' ' + u._rarity.cssClass;
          // Class/perk upgrades keep their type marker
          if (u.id && u.id.startsWith('class_')) card.classList.add('class');
          else if (u.id && u.id.startsWith('perk_')) card.classList.add('perk');
          else if (u.id && (u.id.includes('_up') || u.id.includes('_evo') || u.id.startsWith('wup_') ||
                   u.id.includes('gun_') || u.id.includes('sword_') || u.id.includes('aura_'))) {
            card.classList.add('weapon');
          }
        } else if (u.id) {
          // Fallback: legacy static rarity assignment
          if (u.id.startsWith('class_')) {
            card.className += ' class rarity-epic';
          }
          else if (u.id.startsWith('perk_')) {
            card.className += ' perk rarity-epic';
          }
          else if (u.id.includes('gun_') || u.id.includes('sword_') || u.id.includes('aura_') || 
                   u.id.includes('meteor_') || u.id.includes('doublebarrel_') ||
                   u.id.includes('droneturret_') || u.id.includes('icespear_') || u.id.includes('firering_')) {
            card.className += ' weapon rarity-rare';
          }
          else if (u.id === 'str' || u.id === 'aspd' || u.id === 'dmg' || u.id === 'atkspd' ||
                   u.id === 'atkPassive' || u.id === 'aspdPassive' ||
                   u.id.includes('damage') || u.id.includes('attack_speed') || u.id.includes('atk_speed')) {
            card.className += ' rarity-rare';
          }
          else {
            card.className += ' rarity-common';
          }
          
          if (u.id.includes('dash_mastery') || u.id.includes('second_wind') || 
              u.id.includes('berserker_rage') || u.id.includes('lucky_strikes') ||
              u.rarity === 'legendary') {
            card.classList.remove('rarity-common', 'rarity-rare', 'rarity-epic', 'rarity-legendary', 'rarity-mythical');
            card.classList.add('max-upgrade', 'rarity-legendary');
          }
          if (u.rarity === 'rare' && !card.classList.contains('rarity-rare') && !card.classList.contains('rarity-legendary')) {
            card.classList.remove('rarity-common', 'rarity-epic');
            card.classList.add('rarity-rare');
          }
        }
        
        // Resolve rarity display properties (color + label)
        const rarityInfo  = u._rarity || null;
        const cardColor   = u.rarityColor || (rarityInfo ? rarityInfo.color : '#ffffff') || '#ffffff';
        const cardRarityLabel = u.rarityName || (rarityInfo ? rarityInfo.label : 'COMMON');
        
        // Apply only the dynamic rarity-specific inline styles (border, box-shadow, overflow)
        const isMythic = rarityInfo && rarityInfo.name === 'mythic';
        card.style.borderColor = cardColor;
        card.style.boxShadow   = `0 0 20px ${cardColor}40`;
        if (isMythic) card.style.overflow = 'visible';

        // ── Card 3D flip structure: back face + front face ──
        const cardInner = document.createElement('div');
        cardInner.className = 'card-inner';

        // Set rarity colour CSS variable on the card for the back-face glow bleed
        card.style.setProperty('--rarity-color', cardColor);

        // ─── Back face: black/gold/silver Aida-style with Eye of Horus ───
        const cardBackFace = document.createElement('div');
        cardBackFace.className = 'card-face card-back-face';
        // Rarity glow bleeds through back edges, making rarity visible before flip
        cardBackFace.style.boxShadow = `inset 0 0 22px ${cardColor}30, inset 0 0 8px ${cardColor}18`;

        // Eye of Horus SVG — inline, no external asset, styled to match Aida cinematic
        const _backHorusEl = document.createElement('div');
        _backHorusEl.className = 'card-back-horus';
        _backHorusEl.innerHTML = [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140" width="96" height="67">',
          '<g fill="none" stroke="#C9A227" stroke-width="1.8">',
          '<path d="M10 70 Q100 10 190 70 Q100 130 10 70 Z" stroke-opacity="0.9"/>',
          '<circle cx="100" cy="70" r="28" stroke-opacity="0.85"/>',
          '<circle cx="100" cy="70" r="12" fill="#C9A227" fill-opacity="0.45"/>',
          '<circle cx="95" cy="64" r="4.5" fill="#FFD700" fill-opacity="0.65"/>',
          '<path d="M70 95 L58 118 L72 128" stroke-opacity="0.8"/>',
          '<path d="M130 88 L148 105 L138 115" stroke-opacity="0.8"/>',
          '<line x1="80" y1="50" x2="75" y2="38" stroke-opacity="0.7"/>',
          '<line x1="100" y1="44" x2="100" y2="30" stroke-opacity="0.7"/>',
          '<line x1="120" y1="50" x2="125" y2="38" stroke-opacity="0.7"/>',
          '<path d="M40 40 Q100 20 160 40" stroke-width="1.1" stroke-opacity="0.6"/>',
          '<path d="M72 70 Q86 58 100 70 Q114 82 128 70" stroke-width="0.9" stroke-opacity="0.45"/>',
          '</g>',
          '<g fill="#C0C0C0" fill-opacity="0.65">',
          '<circle cx="14" cy="14" r="2.2"/><circle cx="186" cy="14" r="2.2"/>',
          '<circle cx="14" cy="126" r="2.2"/><circle cx="186" cy="126" r="2.2"/>',
          '</g>',
          '<g fill="#C9A227" fill-opacity="0.72" font-family="serif" font-size="15">',
          '<text x="4" y="17">𓂀</text><text x="178" y="17">𓁿</text>',
          '<text x="4" y="136">𓆣</text><text x="178" y="136">𓃭</text>',
          '</g>',
          '</svg>',
        ].join('');
        cardBackFace.appendChild(_backHorusEl);

        // Hieroglyph border strip — top
        const _bhierTop = document.createElement('div');
        _bhierTop.className = 'card-back-hier-strip card-back-hier-top';
        _bhierTop.textContent = '𓂀 𓁿 𓆣 𓃭';
        cardBackFace.appendChild(_bhierTop);

        // Hieroglyph border strip — bottom
        const _bhierBot = document.createElement('div');
        _bhierBot.className = 'card-back-hier-strip card-back-hier-bot';
        _bhierBot.textContent = '𓃭 𓆣 𓁿 𓂀';
        cardBackFace.appendChild(_bhierBot);

        // CRT scan-line overlay (Aida-style)
        const _bScan = document.createElement('div');
        _bScan.className = 'card-back-scanline';
        cardBackFace.appendChild(_bScan);

        // Front face (revealed after flip)
        const cardFront = document.createElement('div');
        cardFront.className = 'card-face card-front';

        // LVL UP cards: rarity header + icon + title + desc (playing-card layout)
        const iconHtml = u.icon ? `<span class="upgrade-icon">${u.icon}</span>` : '';
        cardFront.innerHTML = `
          <div class="upgrade-rarity-header" style="color: ${cardColor}; text-shadow: 0 0 8px ${cardColor};">${cardRarityLabel}</div>
          <div style="text-align: center;">${iconHtml}<div class="upgrade-title">${u.title}</div></div>
          <div class="upgrade-desc">${u.desc}</div>`;
        
        // Mythic cards: add floating particle elements for dramatic effect
        if (rarityInfo && rarityInfo.name === 'mythic') {
          for (let _p = 0; _p < 6; _p++) {
            const pEl = document.createElement('div');
            pEl.className = 'mythic-particle';
            pEl.style.setProperty('--mp-x', `${Math.random() * 100}%`);
            pEl.style.setProperty('--mp-delay', `${(_p * 0.28).toFixed(2)}s`);
            cardFront.appendChild(pEl);
          }
        }

        cardInner.appendChild(cardBackFace);
        cardInner.appendChild(cardFront);
        card.appendChild(cardInner);

        // ── 6 different entry animations (different direction per card) ──
        const _cardEntryAnims = [
          'cardEnterFromTop',    // 0: slams from top
          'cardEnterFromLeft',   // 1: rockets from left
          'cardEnterFromRight',  // 2: blasts from right
          'cardEnterFromBottom', // 3: erupts from bottom
          'cardEnterZoomPop',    // 4: pops from center
          'cardEnterSpiral',     // 5: diagonal slam from top-right
        ];
        const _animName = _cardEntryAnims[index % _cardEntryAnims.length];
        const _animDur = 0.55;
        // Stagger: 0.3s wall delay + 0.24s between cards for dramatic sequential slams
        const cardDelay = 0.3 + (index * 0.24);
        card.style.opacity = '0';
        card.style.pointerEvents = 'none'; // Disable clicks until flipped
        card.style.animation = `${_animName} ${_animDur}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${cardDelay}s both`;

        // After entry animation completes, flash the thud effect
        card.addEventListener('animationend', (e) => {
          const _entryAnimSet = new Set(_cardEntryAnims);
          if (e.animationName && _entryAnimSet.has(e.animationName)) {
            card.style.animation = '';
            card.style.opacity = '1';
            card.style.transform = '';
            // Thud flash
            card.classList.add('card-thud-flash');
            setTimeout(() => card.classList.remove('card-thud-flash'), 420);
            document.body.classList.add('screen-shake-brief');
            setTimeout(() => document.body.classList.remove('screen-shake-brief'), 200);
          }
        }, { once: true });
        
        // Inject the melt-shadow hold-ring element
        const holdRingEl = document.createElement('div');
        holdRingEl.className = 'hold-ring';
        card.appendChild(holdRingEl);

        // Hold-progress indicator (border fills during 1.2s hold)
        const holdProgressEl = document.createElement('div');
        holdProgressEl.className = 'hold-progress';
        card.appendChild(holdProgressEl);

        // Animated spinning border glow (conic gradient sweep)
        const borderFlowEl = document.createElement('div');
        borderFlowEl.className = 'border-flow';
        card.appendChild(borderFlowEl);

        // Green selection edge (shown on card choice)
        const greenEdgeEl = document.createElement('div');
        greenEdgeEl.className = 'card-green-edge';
        card.appendChild(greenEdgeEl);

        // Melting drip drops hanging from the bottom border
        const _rarityDripCounts = { common: 2, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 };
        const _dripCount = rarityInfo ? (_rarityDripCounts[rarityInfo.name] || 2) : 2;
        for (let _d = 0; _d < _dripCount; _d++) {
          const dripEl = document.createElement('div');
          dripEl.className = 'card-drip';
          dripEl.style.setProperty('--drip-dur',   (1.6 + Math.random() * 1.4).toFixed(2) + 's');
          dripEl.style.setProperty('--drip-delay',  (_d * 0.3 + Math.random() * 0.6).toFixed(2) + 's');
          dripEl.style.left  = (8 + Math.random() * 84) + '%';
          dripEl.style.width = (4 + Math.random() * 5) + 'px';
          card.appendChild(dripEl);
        }

        // Side melt streaks on epic/legendary/mythic cards
        if (rarityInfo && (rarityInfo.name === 'epic' || rarityInfo.name === 'legendary' || rarityInfo.name === 'mythic')) {
          [['left', '-2px'], ['right', '-2px']].forEach(([side, val]) => {
            const stEl = document.createElement('div');
            stEl.className = 'card-streak';
            stEl.style.setProperty('--streak-dur',   (2.2 + Math.random() * 1.8).toFixed(2) + 's');
            stEl.style.setProperty('--streak-delay',  (Math.random() * 1.8).toFixed(2) + 's');
            stEl.style.top    = (20 + Math.random() * 40) + '%';
            stEl.style.height = (25 + Math.random() * 30) + 'px';
            stEl.style[side]  = val;
            card.appendChild(stEl);
          });
        }

        // Shared "apply and close" logic called when hold completes
        let _isApplying = false;
        const applyUpgradeAndClose = () => {
          if (_isApplying) return;
          _isApplying = true;
          const allCards = list.querySelectorAll('.upgrade-card');
          allCards.forEach(c => {
            c.style.pointerEvents = 'none';
            c.classList.remove('holding');
          });

          playSound('upgrade'); // "Wooooaaa" sound after picking LVL UP

          // ── Visual LVL UP Cue: screen flash + player mesh pulse with rarity colour ──
          try {
            const rarityFlashColors = {
              'rarity-common':    'rgba(255,255,255,0.25)',
              'rarity-uncommon':  'rgba(85,204,85,0.30)',
              'rarity-rare':      'rgba(0,170,255,0.35)',
              'rarity-epic':      'rgba(170,0,255,0.40)',
              'rarity-legendary': 'rgba(255,215,0,0.45)',
              'rarity-mythical':  'rgba(255,0,0,0.55)'
            };
            const rarityMeshColors = {
              'rarity-common':    0xFFFFFF,
              'rarity-uncommon':  0x55CC55,
              'rarity-rare':      0x00AAFF,
              'rarity-epic':      0xAA00FF,
              'rarity-legendary': 0xFFD700,
              'rarity-mythical':  0xFF0000
            };
            const rarityClass = Array.from(card.classList).find(c => c.startsWith('rarity-')) || 'rarity-common';
            const flashColor = rarityFlashColors[rarityClass] || rarityFlashColors['rarity-common'];
            const meshHex = rarityMeshColors[rarityClass] || rarityMeshColors['rarity-common'];
            // Screen flash
            const rarityFlash = document.createElement('div');
            rarityFlash.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${flashColor};pointer-events:none;z-index:999;transition:opacity 0.4s;`;
            document.body.appendChild(rarityFlash);
            setTimeout(() => { rarityFlash.style.opacity = '0'; setTimeout(() => rarityFlash.remove(), 400); }, 80);
            // Player mesh colour pulse
            if (typeof player !== 'undefined' && player && player.mesh && player.mesh.material) {
              const origColor = player.mesh.material.color.getHex();
              player.mesh.material.color.setHex(meshHex);
              setTimeout(() => {
                if (player && player.mesh && player.mesh.material) player.mesh.material.color.setHex(origColor);
              }, 220);
            }
          } catch (_ve) { /* non-critical visual — ignore */ }

          // ── Phase 1: Green glow edge sweeps around chosen card ──
          const greenEdge = card.querySelector('.card-green-edge');
          if (greenEdge) {
            greenEdge.classList.add('animating');
          }

          // Phase 2: After edge animation (1.0s), zoom card up
          setTimeout(() => {
            // Zoom chosen card up
            card.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s';
            card.style.transform = 'scale(1.35) translateY(-25px)';
            card.style.zIndex = '200';

            // Dim and suck other cards + modal bg into center hole
            allCards.forEach(c => {
              if (c !== card) {
                const rejectedCard = c;
                const randX = (Math.random() > 0.5 ? 1 : -1) * (50 + Math.random() * 150);
                const randY = (Math.random() > 0.5 ? 1 : -1) * (50 + Math.random() * 150);
                const randAngle = (Math.random() - 0.5) * 720;
                rejectedCard.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
                rejectedCard.style.transform = `translate(${randX}vw, ${randY}vh) scale(0) rotate(${randAngle}deg)`;
                rejectedCard.style.opacity = '0';
              }
            });
            // Suck the modal background out
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
              modalContent.style.transition = 'transform 0.5s ease-in, opacity 0.45s';
              modalContent.style.transform = 'translate(-50%,-50%) scale(0.05)';
              modalContent.style.opacity = '0';
            }

            // Phase 3: After zoom (0.5s), apply the upgrade and do shard explosion
            setTimeout(() => {
              // Apply upgrade
              try {
                u.apply();
                if (window.GameDebug) window.GameDebug.onUpgradeApplied(u.id, playerStats);
              } catch (error) {
                console.error('Error applying LVL UP:', error);
              }

              // Shard explosion of chosen card
              _explodeCardShards(card);

              // Hide chosen card after shards launched
              setTimeout(() => {
                card.style.opacity = '0';
                card.style.pointerEvents = 'none';
              }, 80);

              // Wait 0.2s after shards, then close everything with black-hole whirlpool
              setTimeout(() => {
                // ── Black hole whirlpool — spin → expand → suck → collapse → vanish ──
                try {
                  // Outer wrapper: positions at screen center, spins+expands during suck phase
                  const bhWrap = document.createElement('div');
                  bhWrap.style.cssText = [
                    'position:fixed','top:50%','left:50%',
                    'width:0px','height:0px',
                    'transform:translate(-50%,-50%)',
                    'z-index:99999','pointer-events:none',
                  ].join(';');

                  // Dark core — grows to swallow screen
                  const bhCore = document.createElement('div');
                  bhCore.style.cssText = [
                    'position:absolute','border-radius:50%',
                    'width:6px','height:6px',
                    'top:50%','left:50%',
                    'transform:translate(-50%,-50%)',
                    'background:radial-gradient(circle,#000 35%,#05000a 65%,transparent 100%)',
                    'animation:bhWhirlExpand 0.9s cubic-bezier(0.55,0,1,0.45) forwards',
                    'will-change:transform',
                  ].join(';');

                  // Spinning rings (whirlpool visual)
                  const bhRingDefs = [
                    // [size, borderWidth, color, spinDuration, direction]
                    ['90px',  '3px', 'rgba(255,255,255,0.55)', '0.35s', 'bhRingSpin'],
                    ['160px', '2px', 'rgba(180,120,255,0.4)',  '0.50s', 'bhRingSpinRev'],
                    ['250px', '2px', 'rgba(100,180,255,0.3)',  '0.70s', 'bhRingSpin'],
                    ['380px', '1px', 'rgba(255,200,80,0.2)',   '1.00s', 'bhRingSpinRev'],
                    ['550px', '1px', 'rgba(255,255,255,0.12)', '1.40s', 'bhRingSpin'],
                  ];
                  const bhRings = [];
                  bhRingDefs.forEach(([sz, bw, col, sd, anim]) => {
                    const r = document.createElement('div');
                    r.style.cssText = [
                      'position:absolute','border-radius:50%',
                      `width:${sz}`,`height:${sz}`,
                      'top:50%','left:50%',
                      'transform:translate(-50%,-50%) scale(0)',
                      `border:${bw} solid ${col}`,
                      `animation:${anim} ${sd} linear infinite`,
                      'opacity:0','will-change:transform,opacity',
                    ].join(';');
                    bhWrap.appendChild(r);
                    bhRings.push(r);
                  });

                  bhWrap.appendChild(bhCore);
                  document.body.appendChild(bhWrap);

                  // Step 1 (10ms): rings appear and grow while core expands
                  setTimeout(() => {
                    bhRings.forEach((r, _ri) => {
                      setTimeout(() => {
                        r.style.transition = `transform 0.6s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease-out`;
                        r.style.transform = 'translate(-50%,-50%) scale(1)';
                        r.style.opacity = '1';
                      }, _ri * 80);
                    });
                  }, 10);

                  // Step 2 (900ms): core has expanded — hold a moment so the whirlpool is visible
                  // then collapse everything back to nothing
                  setTimeout(() => {
                    bhCore.style.animation = 'bhWhirlContract 0.6s cubic-bezier(0.55,0,1,0.45) forwards';
                    bhRings.forEach((r, _ri) => {
                      setTimeout(() => {
                        r.style.transition = 'transform 0.5s ease-in, opacity 0.4s ease-in';
                        r.style.transform = 'translate(-50%,-50%) scale(0)';
                        r.style.opacity = '0';
                      }, _ri * 60);
                    });
                  }, 900);

                  // Step 3 (1550ms): remove DOM node
                  setTimeout(() => {
                    if (bhWrap.parentNode) bhWrap.parentNode.removeChild(bhWrap);
                  }, 1550);
                } catch (_bhe) { /* non-critical visual — ignore */ }

                // PERF FIX: Clean up DOM elements and event listeners to prevent memory leaks
                const upgradeList = document.getElementById('upgrade-list');
                if (upgradeList) upgradeList.innerHTML = ''; // Remove all cards and their event listeners

                // Always close modal
                modal.style.display = 'none';
                modal.style.transform = '';
                modal.style.opacity = '';
                if (modal.querySelector('.modal-content')) {
                  modal.querySelector('.modal-content').style.transform = '';
                  modal.querySelector('.modal-content').style.opacity = '';
                }
                modal.querySelector('h2').innerText = 'LEVEL UP!';
                modal.querySelector('h2').style.fontSize = '24px';
                modal.querySelector('h2').style.color = '';
                const skipBtn = document.getElementById('levelup-skip-btn');
                if (skipBtn) skipBtn.style.display = 'none';
                clearTimeout(window.levelupSkipTimeoutId);

                // Restore camera position and projection after level-up
                if (savedCameraPosition) {
                  camera.position.set(savedCameraPosition.x, savedCameraPosition.y, savedCameraPosition.z);
                  camera.left = savedCameraPosition.left;
                  camera.right = savedCameraPosition.right;
                  camera.top = savedCameraPosition.top;
                  camera.bottom = savedCameraPosition.bottom;
                  camera.updateProjectionMatrix();
                  savedCameraPosition = null; // Clear after restoration
                }

                // Check for Double Upgrade Chance bonus (only on the first pick, not on bonus rounds)
                if (!isBonusRound && playerStats.doubleUpgradeChance > 0) {
                  const bonusChance = Math.min(1.0, playerStats.doubleUpgradeChance);
                  if (Math.random() < bonusChance) {
                    showUpgradeModal(true);
                    if (comboState.pausedAt) {
                      const pauseDuration = Date.now() - comboState.pausedAt;
                      comboState.lastKillTime += pauseDuration;
                      comboState.pausedAt = null;
                    }
                    lastHudUpdateMs = 0;
                    updateHUD();
                    return;
                  }
                }

                forceGameUnpause();

                // Resume combo timer after level-up
                if (comboState.pausedAt) {
                  const pauseDuration = Date.now() - comboState.pausedAt;
                  comboState.lastKillTime += pauseDuration;
                  comboState.pausedAt = null;
                }

                lastHudUpdateMs = 0; // Force HUD refresh after level-up
                updateHUD();
              }, 200); // 0.2s after shards
            }, 350); // shard explosion duration
          }, 1100); // 1.0s green edge + 0.1s zoom
        };

        let holdTimer = null;

        // Hold interaction: press and hold for 450ms to confirm upgrade
        card.addEventListener('pointerdown', (e) => {
          if (e.button !== undefined && e.button !== 0) return; // Left-click/touch only
          e.preventDefault();

          // Cancel any in-progress hold on another card
          if (activeHold && activeHold.card !== card) {
            clearTimeout(activeHold.timer);
            activeHold.card.classList.remove('holding');
            activeHold.card.dataset.selected = '';
            activeHold.card.style.opacity = '0.5';
            activeHold.card.style.transform = 'scale(1)';
            activeHold = null;
          }
          if (holdTimer) return; // Already holding this card

          // Use pointer capture so pointerup fires even if pointer leaves the card
          card.setPointerCapture(e.pointerId);

          // Dim all other cards, highlight this one
          const allCards = list.querySelectorAll('.upgrade-card');
          allCards.forEach(c => {
            c.dataset.selected = '';
            c.style.opacity = '0.5';
            c.style.transform = 'scale(1)';
            c.classList.remove('holding');
          });
          card.dataset.selected = '1';
          card.style.opacity = '1';
          card.style.transform = 'scale(1.04)';

          // Start melt-shadow animation on this card
          card.classList.add('holding');

          // Confirm after 600ms hold duration
          holdTimer = setTimeout(() => {
            holdTimer = null;
            activeHold = null;
            // Guard: only apply if the modal is still visible and card is still selected
            if (card.dataset.selected === '1' && modal.style.display !== 'none') {
              applyUpgradeAndClose();
            }
          }, 400);
          activeHold = { timer: holdTimer, card };
        });

        // Cancel hold if released or interrupted before timer fires
        const cancelHold = () => {
          if (!holdTimer) return; // Timer already fired (hold completed) — nothing to cancel
          clearTimeout(holdTimer);
          holdTimer = null;
          if (activeHold && activeHold.card === card) activeHold = null;
          card.classList.remove('holding');
          // Restore this card's opacity (still selected, just not confirmed)
          if (card.dataset.selected === '1') {
            card.style.opacity = '1';
            card.style.transform = 'scale(1.04)';
          }
        };
        card.addEventListener('pointerup', cancelHold);
        card.addEventListener('pointercancel', cancelHold);
        list.appendChild(card);
      });
      } catch(cardErr) {
        console.error('[LevelUp] Card generation error:', cardErr);
        // Fallback: ensure game unpauses if card creation fails
        levelUpPending = false;
        setGamePaused(false);
        return;
      }

      // ── Helper: actually show the modal (called after explosion FX completes) ──
      function _doShowModal() {
        // Guard: bail if game ended during the FX delay (prevents post-death modal)
        if (isGameOver || !isGameActive) {
          levelUpPending = false;
          return;
        }
        modal.style.display = 'flex';
        modal.style.opacity = '0';
        const existingAnimation = modal.style.animation || (window.getComputedStyle ? window.getComputedStyle(modal).animation : '') || '';
        const wallFadeInAnim = 'wallFadeIn 0.32s cubic-bezier(0.22,1,0.36,1) forwards';
        modal.style.animation = existingAnimation
          ? existingAnimation + ', ' + wallFadeInAnim
          : wallFadeInAnim;
        // Trigger entrance animation on cards
        modal.classList.remove('lvl-entering');
        void modal.offsetHeight;
        modal.classList.add('lvl-entering');
        setTimeout(function() { modal.classList.remove('lvl-entering'); }, 700);

        // ── After all cards have landed, reveal face-up one by one ──
        const _numCards = choices.length;
        // Time for last card to land: 0.3s wall + (n-1)*0.24s stagger + 0.55s entry anim
        const _allEnteredMs = Math.round((0.3 + (_numCards - 1) * 0.24 + 0.55) * 1000) + 80;
        const _allCards = list.querySelectorAll('.upgrade-card');
        setTimeout(function() {
          for (let _fi = 0; _fi < _allCards.length; _fi++) {
            (function(_idx, _c) {
              // Stagger 450 ms between each card for clear one-by-one reveal
              setTimeout(function() {
                const _ci = _c.querySelector('.card-inner');
                if (!_ci) return;

                // Phase 1 — Lift toward camera (scales up, translateZ forward)
                _ci.style.transition = 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)';
                _ci.style.transform = 'scale(1.18) translateZ(55px)';

                setTimeout(function() {
                  // Phase 2 — Flip fast (Y-axis 180°, card face comes into view)
                  _ci.style.transition = 'transform 0.32s cubic-bezier(0.55, 0, 0.45, 1)';
                  _ci.style.transform = 'scale(1.14) translateZ(40px) rotateY(180deg)';

                  setTimeout(function() {
                    // Phase 3 — Smack hard back to resting position (squash on impact)
                    _ci.style.transition = 'transform 0.16s ease-in';
                    _ci.style.transform = 'scaleX(1.1) scaleY(0.9) rotateY(180deg)';

                    setTimeout(function() {
                      // Phase 4 — Bounce settle
                      _ci.style.transition = 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)';
                      _ci.style.transform = 'rotateY(180deg)';
                      _c.classList.add('card-flipped');

                      // Screen shake on smack
                      document.body.classList.add('screen-shake-brief');
                      setTimeout(() => document.body.classList.remove('screen-shake-brief'), 200);

                      // Enable clicks after settle
                      setTimeout(function() { _c.style.pointerEvents = 'auto'; }, 260);
                    }, 160);
                  }, 320);
                }, 280);
              }, _idx * 450);
            })(_fi, _allCards[_fi]);
          }
        }, _allEnteredMs);

        // Animate upgrade cards as collector cards
        if (window.DopamineSystem && window.DopamineSystem.CollectorCards) {
          const cards = list.querySelectorAll('.upgrade-option, .upgrade-card');
          window.DopamineSystem.CollectorCards.animateEntrance(cards);
        }

        // Show skip button after 5 seconds as safety valve if player can't select an upgrade
        const skipBtn = document.getElementById('levelup-skip-btn');
        if (skipBtn) {
          skipBtn.style.display = 'none';
          clearTimeout(window.levelupSkipTimeoutId);
          window.levelupSkipTimeoutId = setTimeout(() => {
            if (modal.style.display === 'flex') skipBtn.style.display = 'inline-block';
          }, 5000);
        }
      }

      // --- Dopamine level-up FX: explosion FIRST, then show modal ---
      if (window.DopamineSystem && window.DopamineSystem.LevelUpFX) {
        window.DopamineSystem.LevelUpFX.play(function() {
          _doShowModal();
        });
      } else {
        // No FX system — show immediately
        _doShowModal();
      }
    }

    // Waterdrop dimensions constants (match SVG viewBox - raised/rounded shape)
