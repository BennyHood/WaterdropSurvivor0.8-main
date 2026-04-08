// js/stat-aggregator.js — Deep Stat Aggregator (Engine 2.0 Bridge)
// Reads every source of permanent stat upgrades in the Camp and calculates
// the TRUE base playerStats object for the current run.
//
// Sources aggregated (in order):
//   1. Base defaults (getDefaultPlayerStats from player.js)
//   2. Camp Building bonuses (saveData.campBuildings via CAMP_BUILDINGS defs)
//   3. Permanent upgrade purchases (saveData.upgrades — progressionCenter shop)
//   4. Attribute points (saveData.attributes — Training Hall / Achievements)
//   5. Skill Tree (saveData.skillTree via window.SKILL_TREE)
//   6. Equipped Gear (saveData.equippedGear from inventory)
//   7. Neural Matrix nodes (saveData.neuralMatrix._statBonuses)
//
// Exposes:
//   window.calculateTotalPlayerStats()   → returns a complete, ready-to-use stats object
//   window.hardResetGame()               → full wipe + page reload
//   window.recalculateAllStats()         → recalcs and writes into window.playerStats (called after gear change)

(function () {
  'use strict';

  // ── Save key (must match save-system.js) ────────────────────────────────────
  var SAVE_KEY     = 'waterDropSurvivorSave_v2_FreshStart';
  var SETTINGS_KEY = 'waterDropSurvivorSettings';

  // ── Gear stat → playerStats mapping ─────────────────────────────────────────
  // Each entry is [gearStatKey, applierFn(stats, value)]
  var GEAR_MAP = {
    movementSpeed:   function (s, v) {
      s.walkSpeed  = (s.walkSpeed  || 25) * (1 + v * 0.05);
      s.topSpeed   = (s.topSpeed   || 6.5) * (1 + v * 0.05);
      s.baseMovementSpeed = (s.baseMovementSpeed || 1.0) * (1 + v * 0.05);
    },
    attackSpeed: function (s, v) {
      s.atkSpeed          = (s.atkSpeed          || 1.0) * (1 + v * 0.05);
      s.meleeAttackSpeed  = (s.meleeAttackSpeed  || 1.0) * (1 + v * 0.05);
      s.projectileFireRate= (s.projectileFireRate|| 1.0) * (1 + v * 0.05);
      s.fireRate          = (s.fireRate          || 1.0) * (1 + v * 0.05);
    },
    critChance: function (s, v) {
      s.critChance = Math.min(0.95, (s.critChance || 0.10) + v * 0.02);
    },
    flexibility: function (s, v) {
      s.inputResponsiveness = Math.min(0.50, (s.inputResponsiveness || 0.12) + v * 0.02);
      s.turnSpeed           = (s.turnSpeed || 1.0) * (1 + v * 0.05);
    },
    attackPrecision: function (s, v) {
      s.aimSpeed     = (s.aimSpeed     || 1.0) * (1 + v * 0.05);
      s.recoilRecovery = (s.recoilRecovery || 1.0) * (1 + v * 0.03);
    },
    elementalMagic: function (s, v) {
      s.elementalDamage = (s.elementalDamage || 0) + v * 0.05;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // calculateTotalPlayerStats()
  // Returns a fresh stats object with ALL camp upgrades folded in.
  // Does NOT mutate any global — caller must assign to playerStats.
  // ─────────────────────────────────────────────────────────────────────────────
  function calculateTotalPlayerStats() {
    // ── 1. Base defaults ─────────────────────────────────────────────────────
    var stats;
    if (typeof window !== 'undefined' &&
        window.GamePlayer &&
        typeof window.GamePlayer.getDefaultPlayerStats === 'function') {
      stats = window.GamePlayer.getDefaultPlayerStats(30);
    } else if (typeof getDefaultPlayerStats === 'function') {
      stats = getDefaultPlayerStats(30);
    } else {
      // Absolute fallback — Level 1 baseline: weak, sluggish, limited
      stats = {
        lvl: 1, exp: 0, expReq: 30, hp: 100, maxHp: 100,
        strength: 1, armor: 0, speed: 1, critChance: 0.10, critDmg: 1.5,
        damage: 1, atkSpeed: 1, walkSpeed: 25, kills: 0, hpRegen: 0,
        hpRegenPerSecond: 0, gold: 0, survivalTime: 0, pickupRange: 1.0,
        dropRate: 1.0, auraRange: 1.0, perks: {},

        // ── Kinematics ──────────────────────────────────────────────────────
        topSpeed: 6.5,             // world-units/s (upgradeable)
        acceleration: 22.0,        // world-units/s² (upgradeable)
        friction: 18.0,            // legacy world-units/s² alias
        frictionGrip: 0.035,       // lerp factor for stopping (0=slip, 1=snap)
        turnSpeed: 1.0,            // multiplier for facing updates
        inputResponsiveness: 0.07, // lerp factor for acceleration (sluggish at L1)
        mobilityScore: 1.0, turnResponse: 1.0, stopResponse: 1.0,
        baseMovementSpeed: 1.0, sprintDashSpeed: 1.0,

        // ── Dash Dynamics ───────────────────────────────────────────────────
        dashUnlocked: false,       // Must be unlocked via skill tree
        dashDistance: 5.0,         // world-units per dash
        dashCooldown: 1.0,         // seconds
        dashIframes: 8,            // invincibility frames during dash
        dashInvincibilityFrames: 8,// alias

        // ── Melee Dynamics ──────────────────────────────────────────────────
        meleeSwingSpeed: 1.0,      // multiplier (higher = faster swings)
        meleeRecoveryTime: 1.0,    // seconds between swings (lower = faster)
        meleeCleaveAngle: 60,      // degrees of AoE arc
        meleeStaggerPower: 1.0,    // knockback force multiplier
        meleeAttackSpeed: 1.0,     // legacy alias for meleeSwingSpeed
        meleeRange: 1.0,
        meleeKnockbackPower: 1.0,  // legacy alias for meleeStaggerPower
        cleaveAngle: 60,           // legacy alias for meleeCleaveAngle
        meleeDamage: 0,
        meleeCooldown: 1.0,

        // ── Ranged Ballistics ────────────────────────────────────────────────
        gunFireRate: 1.0,          // shots per second multiplier
        gunReloadSpeed: 1.0,       // reload speed multiplier
        gunAimSpeed: 1.0,          // how fast gun tracks target
        projectileVelocity: 1.0,   // projectile travel speed multiplier
        recoilRecovery: 1.0,       // spread reduction rate multiplier
        pierceCount: 0,            // extra enemies a bullet passes through
        fireRate: 1.0,             // legacy alias for gunFireRate
        reloadSpeed: 1.0,          // legacy alias for gunReloadSpeed
        aimSpeed: 1.0,             // legacy alias for gunAimSpeed
        projectileSpeed: 1.0,      // legacy alias for projectileVelocity
        projectileFireRate: 1.0,
        projectileSize: 1.0,
        projectileDamage: 0,
        magazineCapacity: 5,
        armorPiercing: 0,
        skillCooldown: 1.0,

        // ── Resilience (Defense) ─────────────────────────────────────────────
        hpRegenAmount: 0,          // HP restored per tick
        hpRegenTickRate: 1.0,      // seconds per regen tick
        flatArmor: 0,              // flat damage reduction
        percentDamageReduction: 0, // % damage reduction (0–1)
        evadeChance: 0,            // chance to fully negate a hit (0–1)
        staggerResistance: 0,      // reduces knockback (0–1)
        damageReduction: 0,        // legacy alias for percentDamageReduction
        dodgeChance: 0,
        healOnKill: 0,
        dodgeChanceBonus: 0, hpRegenRate: 0,

        // ── Spiritual & Elemental ────────────────────────────────────────────
        fireDamage: 0, burnChance: 0,
        iceDamage: 0, freezeChance: 0,
        lightningChainCount: 0,    // how many times lightning chains
        lightningDamage: 0,
        spiritualEcho: 0,          // chance to double-cast (0–1)
        spellEchoChance: 0,        // legacy alias for spiritualEcho
        lifeSteal: 0,              // % of damage dealt restored as HP
        lifesteal: 0,              // legacy alias
        elementalDamage: 0,
        slowChance: 0, chainChance: 0, chainCount: 0,
        burnSpread: false, elementalChain: 0, elementalGuaranteed: false,

        // ── Utility ──────────────────────────────────────────────────────────
        luck: 0,                   // general luck factor (0–1)
        xpCollectionRadius: 1.0,   // pickup radius multiplier
        critDamageMultiplier: 1.5, // crit damage multiplier
        goldDropMultiplier: 1.0,   // gold drop rate multiplier
        goldDropBonus: 0,          // legacy additive bonus
        expGainBonus: 0, itemDropRate: 1.0,
        criticalHitChance: 0.10, criticalHitDamageMulti: 1.5,

        // ── Stamina ──────────────────────────────────────────────────────────
        stamina: 100, maxStamina: 100, staminaRegen: 8, dashStaminaCost: 49,
      };
    }

    // Grab saveData from global scope (set by main.js / save-system.js)
    var sd = (typeof window !== 'undefined' && window.saveData) ||
             (typeof saveData !== 'undefined' ? saveData : null);

    if (!sd) return stats; // No save data yet — return base stats

    // ── 1b. Sync dashUnlocked from saveData.tutorial (existing mechanism) ────
    if (sd.tutorial && sd.tutorial.dashUnlocked) {
      stats.dashUnlocked = true;
    }


    if (sd.campBuildings) {
      var bldgs = sd.campBuildings;

      // Armory: +20 HP / level, +5 flat armor / level
      if (bldgs.armory && bldgs.armory.level > 0) {
        var aLvl = bldgs.armory.level;
        stats.maxHp   += 20 * aLvl;
        stats.flatArmor = (stats.flatArmor || 0) + 5 * aLvl;
        stats.armor     = (stats.armor     || 0) + 5 * aLvl;
      }

      // Weaponsmith: +3% weapon damage / level (crafQuality bonus included)
      if (bldgs.weaponsmith && bldgs.weaponsmith.level > 0) {
        var wsLvl = bldgs.weaponsmith.level;
        stats.strength = (stats.strength || 1) * (1 + 0.03 * wsLvl);
        stats.weaponDamage = (stats.weaponDamage || 0) + 0.03 * wsLvl;
      }

      // Shrine: Artifact Shrine — artifact slots + critDamage + voidLifesteal + hpRegen per level
      if (bldgs.shrine && bldgs.shrine.level > 0) {
        var shLvl = bldgs.shrine.level;
        // +10% crit damage per level
        stats.critDamage = (stats.critDamage || 1.0) + 0.1 * shLvl;
        // +2% void lifesteal per level
        stats.voidLifesteal = (stats.voidLifesteal || 0) + 0.02 * shLvl;
        // +0.5 HP regen per second per level
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + 0.5 * shLvl;
        // Expose unlocked artifact slot count for the UI
        stats.artifactSlots = shLvl;
      }

      // Training Grounds (legacy): +5% damage / level, +3% attack speed / level
      if (bldgs.trainingGrounds && bldgs.trainingGrounds.level > 0) {
        var tgLvl = bldgs.trainingGrounds.level;
        stats.strength         = (stats.strength         || 1)   * (1 + 0.05 * tgLvl);
        var tgAsm = 1 + 0.03 * tgLvl;
        stats.atkSpeed         = (stats.atkSpeed         || 1.0) * tgAsm;
        stats.meleeAttackSpeed = (stats.meleeAttackSpeed || 1.0) * tgAsm;
        stats.fireRate         = (stats.fireRate         || 1.0) * tgAsm;
      }

      // Library: +10% XP gain / level
      if (bldgs.library && bldgs.library.level > 0) {
        var libLvl = bldgs.library.level;
        stats.xpMultiplier = (stats.xpMultiplier || 1.0) + 0.10 * libLvl;
        stats.expGainBonus = (stats.expGainBonus || 0)   + 0.10 * libLvl;
      }

      // Campfire Kitchen: mealPotency → +5% HP regen & +3% damage / level
      if (bldgs.campfireKitchen && bldgs.campfireKitchen.level > 0) {
        var ckLvl = bldgs.campfireKitchen.level;
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + 0.5 * ckLvl;
        stats.hpRegen          = (stats.hpRegen          || 0) + 0.5 * ckLvl;
        stats.strength         = (stats.strength         || 1)  * (1 + 0.03 * ckLvl);
      }

      // Training Hall: +5% attribute training efficiency → flat +1 bonus to all attributes per level
      if (bldgs.trainingHall && bldgs.trainingHall.level > 0) {
        var thLvl = bldgs.trainingHall.level;
        // Each training hall level gives a small permanent stat bonus reflecting improved training
        stats.maxHp            += 5 * thLvl;
        stats.strength          = (stats.strength || 1) * (1 + 0.01 * thLvl);
        stats.atkSpeed          = (stats.atkSpeed || 1.0) * (1 + 0.01 * thLvl);
        var thMsm = 1 + 0.01 * thLvl;
        stats.walkSpeed         = (stats.walkSpeed || 25)  * thMsm;
        stats.topSpeed          = (stats.topSpeed  || 6.5) * thMsm;
        stats.baseMovementSpeed = (stats.baseMovementSpeed || 1.0) * thMsm;
      }

      // Forge: +5% weapon damage / level
      if (bldgs.forge && bldgs.forge.level > 0) {
        var fgLvl = bldgs.forge.level;
        stats.strength      = (stats.strength || 1) * (1 + 0.05 * fgLvl);
        stats.weaponDamage  = (stats.weaponDamage || 0) + 0.05 * fgLvl;
      }

      // Warehouse: +5% gold multiplier / level
      if (bldgs.warehouse && bldgs.warehouse.level > 0) {
        var whLvl = bldgs.warehouse.level;
        stats.goldMultiplier = (stats.goldMultiplier || 1.0) + 0.05 * whLvl;
      }

      // Companion House: +10% companion damage / level
      if (bldgs.companionHouse && bldgs.companionHouse.level > 0) {
        var chLvl = bldgs.companionHouse.level;
        stats.companionDamageMult = (stats.companionDamageMult || 1.0) * (1 + 0.10 * chLvl);
      }

      // Skill Tree building: +1 skill point available per level (tracked separately)
      if (bldgs.skillTree && bldgs.skillTree.level > 0) {
        stats.bonusSkillPoints = (stats.bonusSkillPoints || 0) + bldgs.skillTree.level;
      }

      // Tavern: +0.1 HP regen per second per level
      if (bldgs.tavern && bldgs.tavern.level > 0) {
        var tavLvl = bldgs.tavern.level;
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + 0.1 * tavLvl;
        stats.hpRegen          = (stats.hpRegen          || 0) + 0.1 * tavLvl;
      }

      // Prism Reliquary: +0.03 crit chance and +0.15 crit damage per level
      if (bldgs.prismReliquary && bldgs.prismReliquary.level > 0) {
        var prLvl = bldgs.prismReliquary.level;
        stats.critChance  = (stats.critChance  || 0.05) + 0.03 * prLvl;
        stats.critDmg     = (stats.critDmg     || 1.5)  + 0.15 * prLvl;
      }

      // Progression House: +5% XP gain per level
      if (bldgs.progressionHouse && bldgs.progressionHouse.level > 0) {
        var phLvl = bldgs.progressionHouse.level;
        stats.xpMultiplier = (stats.xpMultiplier || 1.0) + 0.05 * phLvl;
        stats.expGainBonus = (stats.expGainBonus || 0)   + 0.05 * phLvl;
      }

      // Slot Machine building: +1% luck/dropRate per level
      if (bldgs.slotMachine && bldgs.slotMachine.level > 0) {
        var smLvl = bldgs.slotMachine.level;
        var slotBonus = 0.01 * smLvl;
        // Apply to canonical runtime stats so the bonus affects gameplay systems.
        stats.luck         = (stats.luck         || 0)   + slotBonus;
        stats.dropRate     = (stats.dropRate     || 1.0) + slotBonus;
        stats.itemDropRate = (stats.itemDropRate || 1.0) + slotBonus;
        // Preserve legacy/bridge fields for compatibility with any older readers.
        stats.luckBonus    = (stats.luckBonus    || 0)   + slotBonus;
        stats.dropRateMult = (stats.dropRateMult || 1.0) + slotBonus;
      }
    }

    // ── 3. Permanent Upgrade Shop bonuses (saveData.upgrades) ────────────────
    if (sd.upgrades) {
      var upg = sd.upgrades;
      if (upg.maxHp        > 0) { stats.maxHp += 25 * upg.maxHp; }
      if (upg.hpRegen      > 0) {
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + 0.5 * upg.hpRegen;
        stats.hpRegen          = (stats.hpRegen          || 0) + 0.5 * upg.hpRegen;
      }
      if (upg.moveSpeed    > 0) {
        var msm = 1 + 0.05 * upg.moveSpeed;
        stats.walkSpeed  = (stats.walkSpeed  || 25)  * msm;
        stats.topSpeed   = (stats.topSpeed   || 6.5) * msm;
        stats.baseMovementSpeed = (stats.baseMovementSpeed || 1.0) * msm;
      }
      if (upg.attackDamage > 0) {
        stats.strength = (stats.strength || 1) * (1 + 0.10 * upg.attackDamage);
      }
      if (upg.attackSpeed  > 0) {
        var asm = 1 + 0.05 * upg.attackSpeed;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * asm;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * asm;
        stats.projectileFireRate= (stats.projectileFireRate|| 1.0) * asm;
        stats.fireRate          = (stats.fireRate          || 1.0) * asm;
      }
      if (upg.critChance   > 0) {
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + 0.02 * upg.critChance);
      }
      if (upg.critDamage   > 0) {
        stats.critDmg = (stats.critDmg || 1.5) + 0.10 * upg.critDamage;
      }
      if (upg.armor        > 0) {
        stats.armor     = (stats.armor     || 0) + 3 * upg.armor;
        stats.flatArmor = (stats.flatArmor || 0) + 3 * upg.armor;
      }
      if (upg.cooldownReduction > 0) {
        var cdrm = Math.min(0.60, 0.03 * upg.cooldownReduction);
        stats.dashCooldown   = Math.max(0.2, (stats.dashCooldown   || 1.0) * (1 - cdrm));
        stats.meleeCooldown  = Math.max(0.2, (stats.meleeCooldown  || 1.0) * (1 - cdrm));
        stats.skillCooldown  = Math.max(0.2, (stats.skillCooldown  || 1.0) * (1 - cdrm));
        stats.reloadSpeed    = (stats.reloadSpeed || 1.0) * (1 + cdrm);
      }
      if (upg.goldEarned   > 0) {
        stats.goldDropBonus = (stats.goldDropBonus || 0) + 0.10 * upg.goldEarned;
      }
      if (upg.expEarned    > 0) {
        stats.expGainBonus  = (stats.expGainBonus  || 0) + 0.10 * upg.expEarned;
        stats.xpMultiplier  = (stats.xpMultiplier  || 1.0) + 0.10 * upg.expEarned;
      }
    }

    // ── 3b. Progression Center (Stat Forge) permanent upgrades ───────────────
    // saveData.progressionUpgrades is managed by progression-center.js.
    // Each entry is { level: N }. Stat increments mirror PROGRESSION_UPGRADES.perLevel.
    if (sd.progressionUpgrades) {
      var pu = sd.progressionUpgrades;

      // maxHealth: +15 HP / level
      if (pu.maxHealth && (pu.maxHealth.level || 0) > 0) {
        stats.maxHp += 15 * pu.maxHealth.level;
      }
      // healthRegen: +0.5 HP/s / level
      if (pu.healthRegen && (pu.healthRegen.level || 0) > 0) {
        stats.hpRegen          = (stats.hpRegen          || 0) + 0.5 * pu.healthRegen.level;
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + 0.5 * pu.healthRegen.level;
      }
      // armor: +3 flat armor / level
      if (pu.armor && (pu.armor.level || 0) > 0) {
        stats.armor     = (stats.armor     || 0) + 3 * pu.armor.level;
        stats.flatArmor = (stats.flatArmor || 0) + 3 * pu.armor.level;
      }
      // baseDamage: +8% damage / level (multiplicative)
      if (pu.baseDamage && (pu.baseDamage.level || 0) > 0) {
        var puBdMult = 1 + 0.08 * pu.baseDamage.level;
        stats.strength = (stats.strength || 1)   * puBdMult;
        stats.damage   = (stats.damage   || 1.0) * puBdMult;
      }
      // attackSpeed: +5% / level (multiplicative)
      if (pu.attackSpeed && (pu.attackSpeed.level || 0) > 0) {
        var puAsm = 1 + 0.05 * pu.attackSpeed.level;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * puAsm;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * puAsm;
        stats.projectileFireRate= (stats.projectileFireRate|| 1.0) * puAsm;
        stats.fireRate          = (stats.fireRate          || 1.0) * puAsm;
      }
      // criticalChance: +1.5% / level
      if (pu.criticalChance && (pu.criticalChance.level || 0) > 0) {
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + 0.015 * pu.criticalChance.level);
      }
      // criticalDamage: +10% crit multiplier / level
      if (pu.criticalDamage && (pu.criticalDamage.level || 0) > 0) {
        stats.critDmg = (stats.critDmg || 1.5) + 0.10 * pu.criticalDamage.level;
      }
      // moveSpeed: +4% / level
      if (pu.moveSpeed && (pu.moveSpeed.level || 0) > 0) {
        var puMsm = 1 + 0.04 * pu.moveSpeed.level;
        stats.walkSpeed         = (stats.walkSpeed         || 25)  * puMsm;
        stats.topSpeed          = (stats.topSpeed          || 6.5) * puMsm;
        stats.baseMovementSpeed = (stats.baseMovementSpeed || 1.0) * puMsm;
      }
      // dashCooldown: -5% per level (perLevel is -0.05)
      if (pu.dashCooldown && (pu.dashCooldown.level || 0) > 0) {
        var puDcRed = Math.min(0.60, 0.05 * pu.dashCooldown.level);
        stats.dashCooldown  = Math.max(0.2, (stats.dashCooldown  || 1.0) * (1 - puDcRed));
        stats.skillCooldown = Math.max(0.2, (stats.skillCooldown || 1.0) * (1 - puDcRed));
      }
      // goldFind: +10% gold drops / level
      if (pu.goldFind && (pu.goldFind.level || 0) > 0) {
        stats.goldDropBonus      = (stats.goldDropBonus || 0) + 0.10 * pu.goldFind.level;
      }
      // experienceGain: +8% XP / level
      if (pu.experienceGain && (pu.experienceGain.level || 0) > 0) {
        stats.expGainBonus = (stats.expGainBonus || 0)   + 0.08 * pu.experienceGain.level;
        stats.xpMultiplier = (stats.xpMultiplier || 1.0) + 0.08 * pu.experienceGain.level;
      }
      // lifeSteal: +2% per level
      if (pu.lifeSteal && (pu.lifeSteal.level || 0) > 0) {
        var puLs = 0.02 * pu.lifeSteal.level;
        stats.lifesteal        = Math.min(0.50, (stats.lifesteal        || 0) + puLs);
        stats.lifeSteal        = Math.min(0.50, (stats.lifeSteal        || 0) + puLs);
        stats.lifeStealPercent = (stats.lifeStealPercent || 0) + puLs;
      }
      // pickupRange: +15% / level
      if (pu.pickupRange && (pu.pickupRange.level || 0) > 0) {
        stats.pickupRange        = (stats.pickupRange        || 1.0) + 0.15 * pu.pickupRange.level;
        stats.xpCollectionRadius = (stats.xpCollectionRadius || 1.0) + 0.15 * pu.pickupRange.level;
      }
    }

    // ── 4. Attribute points (Training Hall / Achievements) ───────────────────
    if (sd.attributes) {
      var attr = sd.attributes;
      if ((attr.strength || 0) > 0) {
        stats.strength    = (stats.strength    || 1) * (1 + attr.strength * 0.03);
        stats.meleeDamage = (stats.meleeDamage || 0) + attr.strength * 2;
      }
      if ((attr.vitality || 0) > 0) {
        stats.maxHp              += attr.vitality * 15;
        stats.hpRegenPerSecond    = (stats.hpRegenPerSecond || 0) + attr.vitality * 0.5;
        stats.hpRegen             = (stats.hpRegen          || 0) + attr.vitality * 0.5;
      }
      if ((attr.dexterity || 0) > 0) {
        var dm = 1 + attr.dexterity * 0.03;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * dm;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * dm;
        stats.fireRate          = (stats.fireRate          || 1.0) * dm;
        stats.reloadSpeed       = (stats.reloadSpeed       || 1.0) * dm;
        stats.aimSpeed          = (stats.aimSpeed          || 1.0) * dm;
      }
      if ((attr.luck || 0) > 0) {
        stats.luck       = Math.min(1.0, (stats.luck       || 0) + attr.luck * 0.02);
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + attr.luck * 0.01);
        stats.itemDropRate = (stats.itemDropRate || 1.0) + attr.luck * 0.05;
      }
      if ((attr.wisdom || 0) > 0) {
        stats.xpMultiplier  = (stats.xpMultiplier  || 1.0) + attr.wisdom * 0.05;
        stats.goldDropBonus = (stats.goldDropBonus  || 0)   + attr.wisdom * 0.02;
      }
      if ((attr.endurance || 0) > 0) {
        stats.maxHp             += attr.endurance * 10;
        stats.staggerResistance  = Math.min(0.90, (stats.staggerResistance || 0) + attr.endurance * 0.03);
        stats.flatArmor          = (stats.flatArmor || 0) + attr.endurance * 1;
      }
      if ((attr.flexibility || 0) > 0) {
        stats.inputResponsiveness = Math.min(0.50, (stats.inputResponsiveness || 0.12) + attr.flexibility * 0.02);
        stats.turnSpeed           = (stats.turnSpeed  || 1.0) * (1 + attr.flexibility * 0.03);
        stats.acceleration        = (stats.acceleration || 22.0) * (1 + attr.flexibility * 0.02);
      }
    }

    // ── 5. Skill Tree bonuses ────────────────────────────────────────────────
    var TREE = (typeof window !== 'undefined' && window.SKILL_TREE) || null;
    if (sd.skillTree && TREE) {
      var hpFlat = 0, hpPct = 0, regenFlat = 0, armorFlat = 0;
      var dmgMult = 0, critChanceFlat = 0, critDmgFlat = 0;
      var atkSpeedMult = 0, moveSpeedMult = 0;
      var dashCdRed = 0, dashDistMult = 0, cdRed = 0;

      for (var skillId in sd.skillTree) {
        var skData = sd.skillTree[skillId];
        var skLvl  = (skData && skData.level) || 0;
        if (skLvl === 0) continue;

        var skDef = TREE[skillId];
        if (!skDef || typeof skDef.bonus !== 'function') continue;

        var bonus = skDef.bonus(skLvl);

        // Accumulated
        if (bonus.hp)            hpFlat        += bonus.hp;
        if (bonus.hpPercent)     hpPct         += bonus.hpPercent;
        if (bonus.regen)         regenFlat     += bonus.regen;
        if (bonus.armor)         armorFlat     += bonus.armor;
        if (bonus.damage)        dmgMult       += bonus.damage;
        if (bonus.weaponDamage)  dmgMult       += bonus.weaponDamage;
        if (bonus.critChance)    critChanceFlat += bonus.critChance;
        if (bonus.critDamage)    critDmgFlat   += bonus.critDamage;
        if (bonus.attackSpeed)   atkSpeedMult  += bonus.attackSpeed;
        if (bonus.moveSpeed)     moveSpeedMult += bonus.moveSpeed;
        if (bonus.dashCooldown)  { dashCdRed += bonus.dashCooldown; }
        if (bonus.dashDistance)  { dashDistMult += bonus.dashDistance; }
        if (bonus.dashUnlocked)  stats.dashUnlocked = true;
        if (bonus.cooldown)      cdRed         += bonus.cooldown;

        // Deep granular stats
        if (bonus.fireRate)           stats.fireRate          = (stats.fireRate || 1.0) * (1 + bonus.fireRate);
        if (bonus.reloadSpeed)        stats.reloadSpeed       = (stats.reloadSpeed || 1.0) * (1 + bonus.reloadSpeed);
        if (bonus.aimSpeed)           stats.aimSpeed          = (stats.aimSpeed || 1.0) * (1 + bonus.aimSpeed);
        if (bonus.projectileSpeed)    stats.projectileSpeed   = (stats.projectileSpeed || 1.0) * (1 + bonus.projectileSpeed);
        if (bonus.meleeAttackSpeed)   stats.meleeAttackSpeed  = (stats.meleeAttackSpeed || 1.0) * (1 + bonus.meleeAttackSpeed);
        if (bonus.cleaveAngle)        stats.cleaveAngle       = (stats.cleaveAngle || 60) + bonus.cleaveAngle;
        if (bonus.knockbackPower)     stats.meleeKnockbackPower= (stats.meleeKnockbackPower || 1.0) * (1 + bonus.knockbackPower);
        if (bonus.evadeChance)        stats.evadeChance       = (stats.evadeChance || 0) + bonus.evadeChance;
        if (bonus.staggerResistance)  stats.staggerResistance = Math.min(0.90, (stats.staggerResistance || 0) + bonus.staggerResistance);
        if (bonus.magazineCapacity)   stats.magazineCapacity  = Math.max(1, (stats.magazineCapacity || 5) + bonus.magazineCapacity);

        // Direct fields
        if (bonus.damageReduction)    stats.damageReduction   = Math.min(0.75, (stats.damageReduction || 0) + bonus.damageReduction);
        if (bonus.dodgeChance)        stats.dodgeChance       = Math.min(0.75, (stats.dodgeChance || 0) + bonus.dodgeChance);
        if (bonus.healOnKill)         stats.healOnKill        = (stats.healOnKill || 0) + bonus.healOnKill;
        if (bonus.lowHpDamage)        stats.lowHpDamage       = (stats.lowHpDamage || 0) + bonus.lowHpDamage;
        if (bonus.executeDamage)      stats.executeDamage     = (stats.executeDamage || 0) + bonus.executeDamage;
        if (bonus.armorPenetration)   stats.armorPenetration  = Math.min(0.90, (stats.armorPenetration || 0) + bonus.armorPenetration);
        if (bonus.multiHitChance)     stats.multiHitChance    = Math.min(0.75, (stats.multiHitChance || 0) + bonus.multiHitChance);
        if (bonus.lastStand)          stats.hasLastStand      = true;
        if (bonus.secondWind)         stats.hasSecondWind     = true;
        if (bonus.pickupRange)        stats.pickupRange       = (stats.pickupRange || 1.0) + bonus.pickupRange;
        if (bonus.dropRate)           stats.dropRate          = (stats.dropRate || 1.0) + bonus.dropRate;
        if (bonus.auraRange)          stats.auraRange         = (stats.auraRange || 1.0) + bonus.auraRange;
        if (bonus.fireDamage)         stats.fireDamage        = (stats.fireDamage || 0) + bonus.fireDamage;
        if (bonus.iceDamage)          stats.iceDamage         = (stats.iceDamage || 0) + bonus.iceDamage;
        if (bonus.lightningDamage)    stats.lightningDamage   = (stats.lightningDamage || 0) + bonus.lightningDamage;
        if (bonus.elementalDamage)    stats.elementalDamage   = (stats.elementalDamage || 0) + bonus.elementalDamage;
        if (bonus.burnChance)         stats.burnChance        = (stats.burnChance || 0) + bonus.burnChance;
        if (bonus.slowChance)         stats.slowChance        = (stats.slowChance || 0) + bonus.slowChance;
        if (bonus.chainChance)        stats.chainChance       = (stats.chainChance || 0) + bonus.chainChance;
        if (bonus.chainCount)         stats.chainCount        = (stats.chainCount || 0) + bonus.chainCount;
        if (bonus.freezeChance)       stats.freezeChance      = (stats.freezeChance || 0) + bonus.freezeChance;
        if (bonus.burnSpread)         stats.burnSpread        = true;
        if (bonus.spellEchoChance)    stats.spellEchoChance   = (stats.spellEchoChance || 0) + bonus.spellEchoChance;
        if (bonus.elementalChain)     stats.elementalChain    = (stats.elementalChain || 0) + bonus.elementalChain;
        if (bonus.elementalGuaranteed) stats.elementalGuaranteed = true;
        if (bonus.gold)  stats.goldMultiplier = (stats.goldMultiplier || 1.0) + bonus.gold;
        if (bonus.xp)    stats.xpMultiplier   = (stats.xpMultiplier   || 1.0) + bonus.xp;
      }

      // Apply accumulated skill bonuses
      stats.maxHp += hpFlat;
      if (hpPct > 0) stats.maxHp = Math.floor(stats.maxHp * (1 + hpPct));

      stats.hpRegen           = (stats.hpRegen          || 0) + regenFlat;
      stats.hpRegenPerSecond  = (stats.hpRegenPerSecond  || 0) + regenFlat;
      stats.armor             = (stats.armor             || 0) + armorFlat;
      stats.flatArmor         = (stats.flatArmor         || 0) + armorFlat;

      if (dmgMult       !== 0) stats.strength  = (stats.strength  || 1) * (1 + dmgMult);
      if (critChanceFlat !== 0) stats.critChance = (stats.critChance || 0.10) + critChanceFlat;
      if (critDmgFlat   !== 0) stats.critDmg    = (stats.critDmg   || 1.5)  + critDmgFlat;

      if (atkSpeedMult !== 0) {
        var am = 1 + atkSpeedMult;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * am;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * am;
        stats.projectileFireRate= (stats.projectileFireRate|| 1.0) * am;
        stats.fireRate          = (stats.fireRate          || 1.0) * am;
      }
      if (moveSpeedMult !== 0) {
        var mm = 1 + moveSpeedMult;
        stats.walkSpeed         = (stats.walkSpeed         || 25)  * mm;
        stats.topSpeed          = (stats.topSpeed          || 6.5) * mm;
        stats.baseMovementSpeed = (stats.baseMovementSpeed || 1.0) * mm;
      }
      var totalDashCd = Math.min(0.80, dashCdRed + cdRed);
      if (totalDashCd > 0) stats.dashCooldown = Math.max(0.2, (stats.dashCooldown || 1.0) * (1 - totalDashCd));
      if (dashDistMult > 0) stats.dashDistance = (stats.dashDistance || 5.0) * (1 + dashDistMult);
    }

    // ── 6. Equipped Gear bonuses ─────────────────────────────────────────────
    if (sd.equippedGear && sd.inventory && sd.inventory.length > 0) {
      for (var slotKey in sd.equippedGear) {
        var gearId = sd.equippedGear[slotKey];
        if (!gearId) continue;
        var gear = null;
        for (var gi = 0; gi < sd.inventory.length; gi++) {
          if (sd.inventory[gi].id === gearId) { gear = sd.inventory[gi]; break; }
        }
        if (!gear || !gear.stats) continue;
        for (var statKey in gear.stats) {
          var applier = GEAR_MAP[statKey];
          if (applier) applier(stats, gear.stats[statKey]);
        }
      }
    }

    // ── 7. Neural Matrix stat bonuses ─────────────────────────────────────────
    if (sd.neuralMatrix && sd.neuralMatrix._statBonuses) {
      var _sb = sd.neuralMatrix._statBonuses;
      if ((_sb.atk || 0) > 0) {
        stats.strength = (stats.strength || 1) * (1 + _sb.atk * 0.05);
      }
      if ((_sb.spd || 0) > 0) {
        var sm = 1 + _sb.spd * 0.03;
        stats.speed     = (stats.speed    || 1)   * sm;
        stats.topSpeed  = (stats.topSpeed || 6.5) * sm;
        stats.walkSpeed = (stats.walkSpeed|| 25)  * sm;
      }
      if ((_sb.meleeAtk || 0) > 0) {
        stats.meleeDamage     = (stats.meleeDamage     || 0) + _sb.meleeAtk * 3;
        stats.meleeAttackSpeed= (stats.meleeAttackSpeed|| 1.0) * (1 + _sb.meleeAtk * 0.03);
      }
      if ((_sb.rangedAtk || 0) > 0) {
        stats.projectileDamage = (stats.projectileDamage || 0) + _sb.rangedAtk * 3;
        stats.fireRate         = (stats.fireRate || 1.0) * (1 + _sb.rangedAtk * 0.03);
      }
      if ((_sb.headshotChance || 0) > 0) {
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + _sb.headshotChance * 0.05);
      }
      if ((_sb.sleepRegen || 0) > 0) {
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + _sb.sleepRegen * 0.5;
      }
      // Annunaki Protocol — double all damage output
      if (sd.neuralMatrix.annunakiProtocol) {
        stats.strength         = (stats.strength || 1) * 2;
        stats._annunakiActive  = true;
      }
    }

    // ── 7b. Neural Matrix skill-level bonuses (neuralReflex, synapticProcessing, etc.) ──
    if (sd.neuralMatrix) {
      var nm = sd.neuralMatrix;
      var nmReflex    = (nm.neuralReflex      || 0);
      var nmSynaptic  = (nm.synapticProcessing|| 0);
      var nmPain      = (nm.painSuppression   || 0);
      var nmTargeting = (nm.targetingMatrix   || 0);
      var nmShield    = (nm.adaptiveShielding || 0);
      if (nmReflex    > 0) {
        // neuralReflex: reduces weapon-related cooldowns (weaponCooldownMult < 1 = shorter cooldowns)
        var wcm = (stats.weaponCooldownMult || 1) * Math.pow(0.96, nmReflex);
        stats.weaponCooldownMult = wcm;
        if (wcm < 1) {
          if (stats.meleeCooldown) stats.meleeCooldown *= wcm;
          if (stats.skillCooldown) stats.skillCooldown *= wcm;
          if (stats.dashCooldown)  stats.dashCooldown  *= wcm;
          // fireRate (shots/sec) increases when cooldowns shorten
          if (stats.fireRate)      stats.fireRate      /= wcm;
        }
      }
      if (nmSynaptic  > 0) stats.xpMultiplier       = (stats.xpMultiplier || 1) * (1 + nmSynaptic * 0.06);
      if (nmPain      > 0) stats.maxHp              = (stats.maxHp || 100) * (1 + nmPain * 0.08);
      if (nmTargeting > 0) {
        stats.critChance = (stats.critChance || 0) + nmTargeting * 0.03;
        // Write to both critMultiplier and critDmg — sandbox uses critDmg for crit damage calculations
        var baseCritMulti = (stats.critMultiplier || stats.critDmg || 1.5);
        var newCritMulti  = baseCritMulti * (1 + nmTargeting * 0.10);
        stats.critMultiplier = newCritMulti;
        stats.critDmg        = newCritMulti;
      }
      if (nmShield    > 0) stats.damageReduction = (stats.damageReduction || 0) + nmShield * 0.03;
    }

    // ── 8. Profile Account deep stat upgrades ────────────────────────────────
    // Each key in saveData.profileAccount stores the number of upgrade levels
    // purchased in the Profile & Records building. Per-stat increments below.
    if (sd.profileAccount) {
      var pa = sd.profileAccount;

      // Movement & Control
      if ((pa.topSpeed || 0) > 0)
        stats.topSpeed = (stats.topSpeed || 6.5) + pa.topSpeed * 0.3;
      if ((pa.acceleration || 0) > 0)
        stats.acceleration = (stats.acceleration || 22.0) + pa.acceleration * 1.5;
      if ((pa.friction || 0) > 0)
        stats.friction = (stats.friction || 18.0) + pa.friction * 0.8;
      if ((pa.turnSpeed || 0) > 0)
        stats.turnSpeed = (stats.turnSpeed || 1.0) * (1 + pa.turnSpeed * 0.05);
      if ((pa.inputResponsiveness || 0) > 0)
        stats.inputResponsiveness = Math.min(0.5, (stats.inputResponsiveness || 0.12) + pa.inputResponsiveness * 0.01);

      // Gunplay / Ranged
      if ((pa.fireRate || 0) > 0)
        stats.fireRate = (stats.fireRate || 1.0) * (1 + pa.fireRate * 0.08);
      if ((pa.reloadSpeed || 0) > 0)
        stats.reloadSpeed = (stats.reloadSpeed || 1.0) * (1 + pa.reloadSpeed * 0.10);
      if ((pa.aimSpeed || 0) > 0)
        stats.aimSpeed = (stats.aimSpeed || 1.0) * (1 + pa.aimSpeed * 0.08);
      if ((pa.projectileSpeed || 0) > 0)
        stats.projectileSpeed = (stats.projectileSpeed || 1.0) * (1 + pa.projectileSpeed * 0.08);
      if ((pa.magazineCapacity || 0) > 0)
        stats.magazineCapacity = Math.max(1, (stats.magazineCapacity || 5) + pa.magazineCapacity);

      // Melee / Close Combat
      if ((pa.meleeAttackSpeed || 0) > 0)
        stats.meleeAttackSpeed = (stats.meleeAttackSpeed || 1.0) * (1 + pa.meleeAttackSpeed * 0.07);
      if ((pa.cleaveAngle || 0) > 0)
        stats.cleaveAngle = (stats.cleaveAngle || 60) + pa.cleaveAngle * 5;
      if ((pa.knockbackPower || 0) > 0)
        stats.meleeKnockbackPower = (stats.meleeKnockbackPower || 1.0) * (1 + pa.knockbackPower * 0.10);
      if ((pa.meleeRange || 0) > 0)
        stats.meleeRange = (stats.meleeRange || 1.0) * (1 + pa.meleeRange * 0.08);

      // Survivability
      if ((pa.maxHp || 0) > 0) {
        stats.maxHp += pa.maxHp * 20;
      }
      if ((pa.hpRegen || 0) > 0) {
        stats.hpRegen          = (stats.hpRegen          || 0) + pa.hpRegen * 0.5;
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + pa.hpRegen * 0.5;
      }
      if ((pa.flatArmor || 0) > 0) {
        stats.flatArmor = (stats.flatArmor || 0) + pa.flatArmor * 4;
        stats.armor     = (stats.armor     || 0) + pa.flatArmor * 4;
      }
      if ((pa.evadeChance || 0) > 0)
        stats.evadeChance = (stats.evadeChance || 0) + pa.evadeChance * 0.02;
      if ((pa.staggerResistance || 0) > 0)
        stats.staggerResistance = Math.min(0.75, (stats.staggerResistance || 0) + pa.staggerResistance * 0.03);

      // Offense (granular)
      if ((pa.meleeDamage || 0) > 0)
        stats.meleeDamage = (stats.meleeDamage || 0) + pa.meleeDamage * 3;
      if ((pa.projectileDamage || 0) > 0)
        stats.projectileDamage = (stats.projectileDamage || 0) + pa.projectileDamage * 3;
      if ((pa.critChance || 0) > 0)
        stats.critChance = Math.min(0.85, (stats.critChance || 0.10) + pa.critChance * 0.02);
      if ((pa.critDamage || 0) > 0)
        stats.critDmg = (stats.critDmg || 1.5) + pa.critDamage * 0.10;
      if ((pa.armorPiercing || 0) > 0)
        stats.armorPenetration = Math.min(0.80, (stats.armorPenetration || 0) + pa.armorPiercing * 0.05);

      // Utility
      if ((pa.luck || 0) > 0)
        stats.luck = Math.min(1.0, (stats.luck || 0) + pa.luck * 0.03);
      if ((pa.xpCollectionRadius || 0) > 0)
        stats.pickupRange = (stats.pickupRange || 1.0) + pa.xpCollectionRadius * 0.08;
      if ((pa.goldDropBonus || 0) > 0)
        stats.goldDropBonus = (stats.goldDropBonus || 0) + pa.goldDropBonus * 0.05;
      if ((pa.expGainBonus || 0) > 0) {
        stats.expGainBonus = (stats.expGainBonus || 0) + pa.expGainBonus * 0.05;
        stats.xpMultiplier = (stats.xpMultiplier || 1.0) + pa.expGainBonus * 0.05;
      }

      // Elemental
      if ((pa.fireDamage || 0) > 0)
        stats.fireDamage = (stats.fireDamage || 0) + pa.fireDamage * 0.05;
      if ((pa.iceDamage || 0) > 0)
        stats.iceDamage = (stats.iceDamage || 0) + pa.iceDamage * 0.05;
      if ((pa.lightningDamage || 0) > 0)
        stats.lightningDamage = (stats.lightningDamage || 0) + pa.lightningDamage * 0.05;
      if ((pa.burnChance || 0) > 0)
        stats.burnChance = Math.min(0.80, (stats.burnChance || 0) + pa.burnChance * 0.03);
      if ((pa.freezeChance || 0) > 0)
        stats.freezeChance = Math.min(0.80, (stats.freezeChance || 0) + pa.freezeChance * 0.03);
      if ((pa.lightningChainCount || 0) > 0) {
        stats.lightningChainCount = (stats.lightningChainCount || 0) + pa.lightningChainCount;
        stats.chainCount = Math.max(stats.chainCount || 0, stats.lightningChainCount);
      }
      if ((pa.spiritualEcho || 0) > 0)
        stats.spiritualEcho = Math.min(0.60, (stats.spiritualEcho || 0) + pa.spiritualEcho * 0.02);
      if ((pa.lifeSteal || 0) > 0)
        stats.lifeSteal = Math.min(0.40, (stats.lifeSteal || 0) + pa.lifeSteal * 0.02);

      // Dash unlock from profileAccount
      if (pa.dashUnlocked) stats.dashUnlocked = true;

      // Pierce count (ranged ballistics)
      if ((pa.pierceCount || 0) > 0)
        stats.pierceCount = (stats.pierceCount || 0) + pa.pierceCount;

      // Input responsiveness / frictionGrip
      if ((pa.inputResponsiveness || 0) > 0)
        stats.inputResponsiveness = Math.min(0.55, (stats.inputResponsiveness || 0.07) + pa.inputResponsiveness * 0.01);
      if ((pa.frictionGrip || 0) > 0)
        stats.frictionGrip = Math.min(0.25, (stats.frictionGrip || 0.035) + pa.frictionGrip * 0.01);

      // Cooldowns
      if ((pa.dashCooldown || 0) > 0) {
        var dcRed = Math.min(0.60, pa.dashCooldown * 0.05);
        stats.dashCooldown  = Math.max(0.2, (stats.dashCooldown  || 1.0) * (1 - dcRed));
        stats.skillCooldown = Math.max(0.2, (stats.skillCooldown || 1.0) * (1 - dcRed));
      }
      if ((pa.skillCooldown || 0) > 0) {
        var scRed = Math.min(0.60, pa.skillCooldown * 0.05);
        stats.skillCooldown = Math.max(0.2, (stats.skillCooldown || 1.0) * (1 - scRed));
      }
    }

    // ── 9. Account-level permanent bonuses ───────────────────────────────────
    // Applies coreAttributes (spent attribute points from the Profile panel) and
    // levelStatBonuses (random per-account-level-up bonuses) to the player stats.
    // These live in saveData.account and are managed by idle-account.js.
    if (sd.account) {
      var acc = sd.account;

      // 9a. Core attribute points (each costs 1 attribute point; 0.2% bonus per point)
      //     Mirrors the CORE_ATTRS mapping in idle-account.js.
      var _AP = 0.002; // bonus fraction per attribute point
      var cAttrs = acc.coreAttributes || {};

      if ((cAttrs.might || 0) > 0) {
        var mightMult = 1 + cAttrs.might * _AP;
        stats.strength  = (stats.strength  || 1)   * mightMult;
        stats.damage    = (stats.damage    || 1.0)  * mightMult;
        stats.weaponDamage = (stats.weaponDamage || 0) + cAttrs.might * _AP;
      }
      if ((cAttrs.swiftness || 0) > 0) {
        var swiftMult = 1 + cAttrs.swiftness * _AP;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * swiftMult;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * swiftMult;
        stats.projectileFireRate= (stats.projectileFireRate|| 1.0) * swiftMult;
        stats.fireRate          = (stats.fireRate          || 1.0) * swiftMult;
      }
      if ((cAttrs.agility || 0) > 0) {
        var agilMult = 1 + cAttrs.agility * _AP;
        stats.walkSpeed         = (stats.walkSpeed         || 25)  * agilMult;
        stats.topSpeed          = (stats.topSpeed          || 6.5) * agilMult;
        stats.baseMovementSpeed = (stats.baseMovementSpeed || 1.0) * agilMult;
      }
      if ((cAttrs.haste || 0) > 0) {
        var hasteCdr = Math.min(0.60, cAttrs.haste * _AP);
        stats.dashCooldown  = Math.max(0.2, (stats.dashCooldown  || 1.0) * (1 - hasteCdr));
        stats.meleeCooldown = Math.max(0.2, (stats.meleeCooldown || 1.0) * (1 - hasteCdr));
        stats.skillCooldown = Math.max(0.2, (stats.skillCooldown || 1.0) * (1 - hasteCdr));
        stats.reloadSpeed   = (stats.reloadSpeed || 1.0) * (1 + hasteCdr);
      }
      if ((cAttrs.precision || 0) > 0) {
        stats.aimSpeed   = (stats.aimSpeed  || 1.0) * (1 + cAttrs.precision * _AP);
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + cAttrs.precision * _AP * 0.5);
        stats.recoilRecovery = (stats.recoilRecovery || 1.0) * (1 + cAttrs.precision * _AP);
      }
      if ((cAttrs.fortitude || 0) > 0) {
        // 0.2% per point → fortitude * _AP is the fraction; armor is stored in %
        var fortArmor = cAttrs.fortitude * _AP * 100; // fraction → percent
        stats.armor     = (stats.armor     || 0) + fortArmor;
        stats.flatArmor = (stats.flatArmor || 0) + fortArmor;
        stats.maxHp     += cAttrs.fortitude * 0.5; // tiny HP boost per point
      }
      if ((cAttrs.lethality || 0) > 0) {
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + cAttrs.lethality * _AP);
        stats.critDmg    = (stats.critDmg  || 1.5)  + cAttrs.lethality * _AP * 0.5;
      }
      if ((cAttrs.potency || 0) > 0) {
        var potencyBonus = cAttrs.potency * _AP;
        stats.elementalDamage = (stats.elementalDamage || 0) + potencyBonus;
        stats.fireDamage      = (stats.fireDamage      || 0) + potencyBonus * 0.5;
        stats.iceDamage       = (stats.iceDamage       || 0) + potencyBonus * 0.5;
        stats.lightningDamage = (stats.lightningDamage || 0) + potencyBonus * 0.5;
        stats.spellEchoChance = Math.min(0.60, (stats.spellEchoChance || 0) + cAttrs.potency * _AP * 0.3);
      }

      // 9b. Level-up stat bonuses (random permanent bonus earned each account level-up)
      //     Keys match the getDefaultPlayerStats() field names exactly.
      var lvlBonuses = acc.levelStatBonuses || {};
      if ((lvlBonuses.damage || 0) > 0) {
        stats.strength  = (stats.strength  || 1)   * (1 + lvlBonuses.damage);
        stats.damage    = (stats.damage    || 1.0)  * (1 + lvlBonuses.damage);
      }
      if ((lvlBonuses.atkSpeed || 0) > 0) {
        var lbAsm = 1 + lvlBonuses.atkSpeed;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * lbAsm;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * lbAsm;
        stats.projectileFireRate= (stats.projectileFireRate|| 1.0) * lbAsm;
        stats.fireRate          = (stats.fireRate          || 1.0) * lbAsm;
      }
      if ((lvlBonuses.walkSpeed || 0) > 0) {
        var lbMsm = 1 + lvlBonuses.walkSpeed;
        stats.walkSpeed         = (stats.walkSpeed         || 25)  * lbMsm;
        stats.topSpeed          = (stats.topSpeed          || 6.5) * lbMsm;
        stats.baseMovementSpeed = (stats.baseMovementSpeed || 1.0) * lbMsm;
      }
      if ((lvlBonuses.critChance || 0) > 0) {
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + lvlBonuses.critChance);
      }
      if ((lvlBonuses.maxHp || 0) > 0) {
        stats.maxHp += lvlBonuses.maxHp * (stats.maxHp || 100);
      }
      if ((lvlBonuses.armor || 0) > 0) {
        stats.armor     = (stats.armor     || 0) + lvlBonuses.armor * 100;
        stats.flatArmor = (stats.flatArmor || 0) + lvlBonuses.armor * 100;
      }
      if ((lvlBonuses.hpRegen || 0) > 0) {
        stats.hpRegen          = (stats.hpRegen          || 0) + lvlBonuses.hpRegen * 5;
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + lvlBonuses.hpRegen * 5;
      }
      if ((lvlBonuses.pickupRange || 0) > 0) {
        stats.pickupRange       = (stats.pickupRange       || 1.0) * (1 + lvlBonuses.pickupRange);
        stats.xpCollectionRadius= (stats.xpCollectionRadius|| 1.0) * (1 + lvlBonuses.pickupRange);
      }
      if ((lvlBonuses.dropRate || 0) > 0) {
        stats.dropRate     = (stats.dropRate     || 1.0) * (1 + lvlBonuses.dropRate);
        stats.itemDropRate = (stats.itemDropRate || 1.0) * (1 + lvlBonuses.dropRate);
      }
      if ((lvlBonuses.lifeStealPercent || 0) > 0) {
        stats.lifeStealPercent = (stats.lifeStealPercent || 0) + lvlBonuses.lifeStealPercent;
        stats.lifesteal        = (stats.lifesteal        || 0) + lvlBonuses.lifeStealPercent;
        stats.lifeSteal        = (stats.lifeSteal        || 0) + lvlBonuses.lifeStealPercent;
      }
    }

    // ── Clamp ────────────────────────────────────────────────────────────────
    stats.armor    = Math.min(85,   stats.armor    || 0);
    stats.flatArmor= Math.min(85,   stats.flatArmor|| 0);
    stats.critChance = Math.min(0.95, stats.critChance || 0.10);
    stats.dodgeChance = Math.min(0.75, stats.dodgeChance || 0);
    stats.evadeChance = Math.min(0.75, stats.evadeChance || 0);
    stats.luck        = Math.min(1.0,  stats.luck       || 0);
    stats.staggerResistance = Math.min(0.90, stats.staggerResistance || 0);

    // percentDamageReduction is the canonical name; damageReduction is the legacy name.
    // Both accumulate independently during aggregation; take the higher of the two.
    var pdrMax = Math.max(stats.percentDamageReduction || 0, stats.damageReduction || 0);
    stats.percentDamageReduction = Math.min(0.75, pdrMax);
    stats.damageReduction        = stats.percentDamageReduction;

    // ── Unidirectional alias sync (legacy engine names are authoritative) ────
    // The engine uses legacy names everywhere. Canonical display names are kept
    // in sync as read-only copies for the Profile Stats panel.

    // Ranged: legacy names used by engine; canonical names are display aliases.
    stats.fireRate         = Math.max(stats.fireRate || 1.0, stats.gunFireRate || 1.0);
    stats.reloadSpeed      = Math.max(stats.reloadSpeed || 1.0, stats.gunReloadSpeed || 1.0);
    stats.aimSpeed         = Math.max(stats.aimSpeed || 1.0, stats.gunAimSpeed || 1.0);
    stats.projectileSpeed  = Math.max(stats.projectileSpeed || 1.0, stats.projectileVelocity || 1.0);
    stats.projectileFireRate = stats.fireRate;
    // Sync canonical display copies (read-only, engine ignores these)
    stats.gunFireRate        = stats.fireRate;
    stats.gunReloadSpeed     = stats.reloadSpeed;
    stats.gunAimSpeed        = stats.aimSpeed;
    stats.projectileVelocity = stats.projectileSpeed;

    // Melee: same pattern — legacy names used by engine.
    stats.meleeAttackSpeed   = Math.max(stats.meleeAttackSpeed || 1.0, stats.meleeSwingSpeed || 1.0);
    stats.cleaveAngle        = Math.max(stats.cleaveAngle || 60, stats.meleeCleaveAngle || 60);
    stats.meleeKnockbackPower= Math.max(stats.meleeKnockbackPower || 1.0, stats.meleeStaggerPower || 1.0);
    stats.meleeSwingSpeed    = stats.meleeAttackSpeed;   // canonical display copy
    stats.meleeCleaveAngle   = stats.cleaveAngle;        // canonical display copy
    stats.meleeStaggerPower  = stats.meleeKnockbackPower;// canonical display copy

    // Spiritual: legacy name is spellEchoChance; spiritualEcho is the display alias.
    stats.spellEchoChance    = Math.max(stats.spellEchoChance || 0, stats.spiritualEcho || 0);
    stats.spiritualEcho      = stats.spellEchoChance;    // canonical display copy
    stats.lifesteal          = Math.max(stats.lifesteal || 0, stats.lifeSteal || 0);
    stats.lifeSteal          = stats.lifesteal;           // canonical display copy

    // Dash: dashInvincibilityFrames is the engine name; dashIframes is the display alias.
    stats.dashInvincibilityFrames = Math.max(stats.dashInvincibilityFrames || 8, stats.dashIframes || 8);
    stats.dashIframes             = stats.dashInvincibilityFrames;

    // Lightning chain: chainCount is the engine name; lightningChainCount is display alias.
    stats.chainCount          = Math.max(stats.chainCount || 0, stats.lightningChainCount || 0);
    stats.lightningChainCount = stats.chainCount;

    // HP regen: hpRegen / hpRegenPerSecond are used by the engine.
    stats.hpRegen           = Math.max(stats.hpRegen || 0, stats.hpRegenPerSecond || 0, stats.hpRegenAmount || 0);
    stats.hpRegenPerSecond  = stats.hpRegen;
    stats.hpRegenAmount     = stats.hpRegen; // canonical display copy

    // Crit damage: critDmg is the engine name; critDamageMultiplier is the display alias.
    stats.critDmg             = Math.max(stats.critDmg || 1.5, stats.critDamageMultiplier || 1.5);
    stats.critDamageMultiplier = stats.critDmg; // canonical display copy

    // Gold: goldDropBonus is the engine additive; goldDropMultiplier is a display total.
    stats.goldDropBonus      = stats.goldDropBonus || 0;
    stats.goldDropMultiplier = Math.max(1.0, 1.0 + stats.goldDropBonus);

    // Pickup / XP radius: pickupRange is the engine name; xpCollectionRadius is display alias.
    stats.pickupRange        = Math.max(stats.pickupRange || 1.0, stats.xpCollectionRadius || 1.0);
    stats.xpCollectionRadius = stats.pickupRange; // canonical display copy

    // Friction: frictionGrip is the new lerp-based stat (used by player-class.js).
    // The legacy `friction` field stores the value in world-units/s² for any old code.
    // Conversion: lerp_per_frame ≈ physics_decel / max_speed; at max_speed=6.5 and
    // 60 fps the effective decel is frictionGrip * 60 * 6.5 ≈ frictionGrip * 390 ≈ ~500
    // so we approximate legacy friction = frictionGrip * 500.
    if (stats.frictionGrip > 0) {
      stats.friction = stats.frictionGrip * 500;
    } else {
      stats.frictionGrip = (stats.friction || 18.0) / 500;
    }

    stats.criticalHitChance       = stats.critChance;
    stats.criticalHitDamageMulti  = stats.critDmg;
    stats.mobilityScore           = stats.turnResponse || 1.0;

    // Sync hp to maxHp for fresh stats objects (initial player creation, stat preview).
    // recalculateAllStats() will clamp/preserve current HP for mid-run recalculations.
    stats.hp = stats.maxHp;

    return stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // recalculateAllStats()
  // Recalculates and injects into the global playerStats.
  // Called automatically whenever gear is changed (equipGear hook in save-system.js).
  // ─────────────────────────────────────────────────────────────────────────────
  function recalculateAllStats() {
    var fresh = calculateTotalPlayerStats();
    // Update the global playerStats object in-place (preserve run-time mutable
    // fields like kills, survivalTime, exp that accumulate during a run)
    if (typeof playerStats !== 'undefined' && playerStats !== null) {
      // Preserve volatile run-time fields
      var keepKills    = playerStats.kills        || 0;
      var keepExp      = playerStats.exp          || 0;
      var keepExpReq   = playerStats.expReq       || 30;
      var keepLvl      = playerStats.lvl          || 1;
      var keepGold     = playerStats.gold         || 0;
      var keepTime     = playerStats.survivalTime || 0;
      var keepHp       = playerStats.hp;  // keep current HP (don't force to maxHp mid-run)

      Object.assign(playerStats, fresh);

      // Restore volatile fields
      playerStats.kills        = keepKills;
      playerStats.exp          = keepExp;
      playerStats.expReq       = keepExpReq;
      playerStats.lvl          = keepLvl;
      playerStats.gold         = keepGold;
      playerStats.survivalTime = keepTime;
      // Clamp current HP to new maxHp
      if (keepHp !== undefined) {
        playerStats.hp = Math.min(keepHp, playerStats.maxHp);
      }
    } else if (typeof window !== 'undefined') {
      // No in-run playerStats — just write to window so sandbox can pick it up
      window.playerStats = fresh;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // hardResetGame()
  // Complete wipe: clears localStorage, resets saveData to defaults, reloads.
  // ─────────────────────────────────────────────────────────────────────────────
  function hardResetGame() {
    if (!confirm(
      '⚠️  HARD RESET — ARE YOU SURE?\n\n' +
      'This will PERMANENTLY delete:\n' +
      '• All camp buildings & upgrades\n' +
      '• All skill tree progress\n' +
      '• All gear, inventory & quests\n' +
      '• All gold, XP and achievements\n' +
      '• All account level & stats\n\n' +
      'The game will reload fresh from Level 0.\n\n' +
      'Click OK to wipe everything.'
    )) return;

    // Second safety confirm
    if (!confirm(
      'FINAL CONFIRMATION\n\n' +
      'All progress will be lost forever.\n' +
      'Proceed with Hard Reset?'
    )) return;

    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    } catch (e) {
      console.warn('[hardResetGame] localStorage error:', e);
    }

    // Reset in-memory saveData if accessible
    if (typeof window !== 'undefined') {
      if (typeof defaultSaveData !== 'undefined') {
        var fresh = JSON.parse(JSON.stringify(defaultSaveData));
        if (typeof saveData !== 'undefined') {
          try { window.saveData = fresh; } catch (_) {}
        }
        if (window.GameState) window.GameState.saveData = fresh;
      }
      // Re-save (writes fresh empty state) then reload
      if (typeof saveSaveData === 'function') {
        try { saveSaveData(); } catch (_) {}
      }
      window.location.reload();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Expose to global scope
  // ─────────────────────────────────────────────────────────────────────────────
  window.calculateTotalPlayerStats = calculateTotalPlayerStats;
  window.recalculateAllStats       = recalculateAllStats;
  window.hardResetGame             = hardResetGame;

  console.log('[StatAggregator] calculateTotalPlayerStats, recalculateAllStats, hardResetGame registered.');

}());
