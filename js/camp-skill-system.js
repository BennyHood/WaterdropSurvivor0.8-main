// js/camp-skill-system.js — Lore database, camp buildings data, skill tree definitions,
// skill tree functions, training system, passive skills.
// Depends on: variables from main.js, save-system.js

    // --- LORE SYSTEM ---
    const LORE_DATABASE = {
      landmarks: {
        windmill: {
          name: 'The Forgotten Windmill',
          icon: '🏚️',
          description: 'An ancient windmill that once powered a thriving village. Now it stands as a monument to a forgotten time.',
          unlockCondition: 'Defeat the Windmill Boss',
          story: 'Legend says this windmill was built by the first settlers who discovered the water droplets\' mystical properties. The machinery inside still turns, grinding something unseen...'
        },
        montana: {
          name: 'Montana Memorial',
          icon: '🗿',
          description: 'A massive stone statue honoring the fallen warriors of the Great Water War.',
          unlockCondition: 'Complete Montana Quest',
          story: 'The Montana stands watch over the battlefield where water droplets first united against the cube invasion. Its eyes are said to glow blue during the full moon.'
        },
        eiffel: {
          name: 'Eiffel Energy Tower',
          icon: '🗼',
          description: 'A towering structure that harnesses electrical energy from storm clouds.',
          unlockCondition: 'Complete Eiffel Tower Quest',
          story: 'Built by a genius engineer who sought to weaponize lightning itself. The tower still crackles with power, attracting the most dangerous enemies.'
        },
        stonehenge: {
          name: 'Ancient Stonehenge',
          icon: '⭕',
          description: 'A mysterious circle of ancient stones that pulse with unknown energy.',
          unlockCondition: 'Discover Stonehenge',
          story: 'These stones predate even the water droplets. Some say they are portals to other realms, while others believe they hold the secret to immortality...'
        },
        pyramids: {
          name: 'Desert Pyramids',
          icon: '🔺',
          description: 'Three massive pyramids that hide ancient treasures and deadly traps.',
          unlockCondition: 'Explore the Desert',
          story: 'Built by an advanced civilization that worshipped the sun. Deep within lies the legendary Eternal Cigar, said to grant unlimited power.'
        }
      },
      enemies: {
        square: {
          name: 'Cube Soldier',
          icon: '🟥',
          description: 'Basic geometric enemies that hunt in swarms.',
          story: 'Created from crystallized anger, these cubes seek to absorb all water to feed their master.'
        },
        triangle: {
          name: 'Spike Warrior',
          icon: '🔺',
          description: 'Sharp and aggressive, they attack with piercing precision.',
          story: 'Formed from shattered weapons of fallen heroes, they carry the rage of those who fell before you.'
        },
        round: {
          name: 'Sphere Hunter',
          icon: '🔵',
          description: 'Fast-moving orbs that roll through the battlefield.',
          story: 'Born from compressed emotions, these spheres are drawn to the tears of water droplets.'
        }
      },
      bosses: {
        windmillBoss: {
          name: 'The Grinder',
          icon: '⚙️',
          description: 'A massive mechanical horror powered by the windmill itself.',
          story: 'The corrupted soul of the windmill\'s creator, trapped in eternal machinery.'
        }
      },
      buildings: {
        skillTree: {
          name: 'Tree of Knowledge',
          icon: '🌳',
          description: 'An ancient tree that grants wisdom and power to those who study its branches.',
          story: 'This tree grew from a single water droplet that absorbed centuries of knowledge. Each skill you unlock is a branch of understanding.'
        },
        forge: {
          name: 'Artisan\'s Workshop',
          icon: '🔨',
          description: 'A masterful workshop where weapons, tools, and equipment are forged to perfection.',
          story: 'Fueled by the heat of a thousand defeated enemies, this place shapes metal, wood, and magic into legendary creations.'
        },
        companionHouse: {
          name: 'Companion Sanctuary',
          icon: '🏡',
          description: 'A safe haven where loyal companions rest and grow stronger.',
          story: 'Built on the site where the first water droplet befriended a wild beast. The bond forged here is unbreakable.'
        }
      }
    };
    
    // --- CAMP SYSTEM ---
    const CAMP_BUILDINGS = {
      // FREE BUILDINGS (unlocked on first camp visit after first death)
      questMission: {
        name: 'Quest & Mission Hall',
        icon: '📜',
        description: 'Start main story quests and missions',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true, // Core building, always available
        bonus: (level) => ({
          // No stats bonus, provides quest functionality
        })
      },
      inventory: {
        name: 'Inventory Storage',
        icon: '📦',
        description: 'Store earned items and equipment',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true,
        bonus: (level) => ({
          // No stats bonus, provides storage
        })
      },
      campHub: {
        name: 'Camp Hub',
        icon: '🏠',
        description: 'Central hub for all camp activities',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true,
        bonus: (level) => ({
          // No stats bonus, central access point
        })
      },
      
      // PAID BUILDINGS (250g base cost unless noted)
      skillTree: {
        name: 'Skill Tree',
        icon: '🌳',
        description: 'Unlock powerful skill upgrades and abilities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => ({
          skillPoints: Math.floor(level / 2) // +1 skill point every 2 levels
        })
      },
      companionHouse: {
        name: 'Companion House',
        icon: '🐺',
        description: 'House and upgrade companions. Higher levels unlock better companions',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          // Unlock companions at certain levels
          const unlocks = [];
          if (level >= 3) unlocks.push('Uncommon companions');
          if (level >= 5) unlocks.push('Rare companions');
          if (level >= 7) unlocks.push('Epic companions');
          if (level >= 10) unlocks.push('Legendary companions');
          return {
            companionDamage: 0.1 * level, // +10% companion damage per level
            unlocks: unlocks.join(', ') || 'Basic companions'
          };
        }
      },
      forge: {
        name: 'Artisan\'s Workshop',
        icon: '⚒️',
        description: 'Craft and upgrade all types of equipment - weapons, tools, and gear. Higher tiers unlock better rarities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          // Unlock crafting tiers
          let tier = 'Common';
          if (level >= 2) tier = 'Common, Uncommon';
          if (level >= 4) tier = 'Common, Uncommon, Rare';
          if (level >= 6) tier = 'Common, Uncommon, Rare, Epic';
          if (level >= 8) tier = 'Common, Uncommon, Rare, Epic, Legendary';
          if (level >= 10) tier = 'Common, Uncommon, Rare, Epic, Legendary, Mythic';
          return {
            craftingTier: tier
          };
        }
      },
      progressionCenter: {
        name: 'Stat Forge',
        icon: '💪',
        description: 'Forge permanent stat upgrades. Increase damage, health, speed, and more with permanent enhancements!',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => ({
          upgradeDiscount: 0.05 * level, // +5% discount on upgrades per level
          upgradeSlots: Math.floor(level / 2) + 3 // +1 upgrade slot every 2 levels, starting at 3
        })
      },
      armory: {
        name: 'Armory',
        icon: '🛡️',
        description: 'Store and upgrade gear. Higher levels unlock better rarities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          let tier = 'Common';
          if (level >= 2) tier = 'Uncommon';
          if (level >= 4) tier = 'Rare';
          if (level >= 6) tier = 'Epic';
          if (level >= 8) tier = 'Legendary';
          if (level >= 10) tier = 'Mythic';
          return {
            hp: 20 * level, // +20 HP per level
            armor: 5 * level, // +5 armor per level
            gearTier: tier
          };
        }
      },
      trainingHall: {
        name: 'Training Hall',
        icon: '🏋️',
        description: 'Train attributes with daily training points (Strength, Endurance, Flexibility)',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => ({
          trainingEfficiency: 0.05 * level // +5% attribute gain per level
        })
      },
      specialAttacks: {
        name: 'Special Attacks',
        icon: '⚡',
        description: 'Choose and upgrade powerful special attack abilities. Earn SAP from quests to unlock new attacks.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      
      // ADDITIONAL BUILDINGS
      trashRecycle: {
        name: 'Trash & Recycle',
        icon: '♻️',
        description: 'Scrap old gear to materials. Fuse/infuse gear for better stats',
        baseCost: 300,
        costMultiplier: 1.7,
        maxCost: 100000,
        bonus: (level) => ({
          recycleValue: 0.1 * level, // +10% recycle value per level
          fusionPower: 0.05 * level // +5% fusion bonus per level
        })
      },
      tempShop: {
        name: 'Temporary Items Shop',
        icon: '🏪',
        description: 'Buy one-run temporary power-ups and consumables',
        baseCost: 200,
        costMultiplier: 1.6,
        maxCost: 100000,
        bonus: (level) => ({
          shopDiscount: 0.05 * level, // +5% discount per level
          itemVariety: level // More items available per level
        })
      },
      achievementBuilding: {
        name: 'Achievement Hall',
        icon: '🏆',
        description: 'Claim achievement rewards and track your progress. Unlocked by finding every landmark!',
        baseCost: 0, // Free — reward for exploration
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      accountBuilding: {
        name: 'Profile & Records',
        icon: '👤',
        description: 'View your profile, activity log, current stats, total kills, profile level, and achievements.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true,
        bonus: (level) => ({})
      },
      idleMenu: {
        name: 'Idle Progression',
        icon: '⚙️',
        description: 'Manage your idle gold mine, fountain, expeditions, prestige, daily rewards, gems, shop and lucky wheel.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      characterVisuals: {
        name: 'Character Visuals',
        icon: '🎨',
        description: 'Customize your character appearance, accessories, animations and outfits',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      codex: {
        name: 'Codex',
        icon: '📖',
        description: 'Encyclopedia of all enemies, structures, landmarks and game lore',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      campBoard: {
        name: 'Camp Board',
        icon: '📋',
        description: 'Fast access to all camp features from one central location near the campfire',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      warehouse: {
        name: 'Stat Cards',
        icon: '🎰',
        description: 'Spin the slot machine to unlock powerful permanent stat upgrades! Each roll costs gold and reveals a random stat card.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      tavern: {
        name: 'Tavern',
        icon: '🍺',
        description: 'Send companions on expeditions and socialize. Unlocked after Quest 8.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      shop: {
        name: 'Shop',
        icon: '🛒',
        description: 'Buy powerful items and upgrades. Unlocked after Quest 9.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      astralGateway: {
        name: 'The Astral Gateway',
        icon: '🌀',
        description: 'A massive, glowing alien ring. AIDA has constructed a Neural Dive Pod to help you unlock your hidden potential.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      prestige: {
        name: 'Prestige Altar',
        icon: '✨',
        description: 'Begin the Prestige journey for massive permanent power. Unlocked after Quest 10.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      campfireKitchen: {
        name: 'Campfire Kitchen',
        icon: '🍳',
        description: 'Cook meals from harvested berries, meat, vegetables and flowers for healing and combat buffs',
        baseCost: 250,
        costMultiplier: 1.5,
        maxCost: 50000,
        bonus: (level) => ({
          cookSpeed: 0.1 * level,
          mealPotency: 0.05 * level
        })
      },
      weaponsmith: {
        name: 'Weaponsmith',
        icon: '⚒️',
        description: 'Craft and upgrade weapons from gathered resources. Build guns, bows, staffs and more',
        baseCost: 300,
        costMultiplier: 1.8,
        maxCost: 80000,
        bonus: (level) => ({
          craftQuality: 0.08 * level,
          weaponDamage: 0.03 * level
        })
      },
      prismReliquary: {
        name: 'Prism Reliquary',
        icon: '💎',
        description: 'A glowing alien crystal structure. Slot Cut Gems into weapons and companions for massive stat bonuses. Unlocked after surviving 10 minutes.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      neuralMatrix: {
        name: 'The Neural Matrix',
        icon: '🧠',
        description: 'A glowing map of brain synapses. Spend Astral Essence to unlock devastating neural upgrades that permanently alter your playstyle.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      
      // LEGACY BUILDINGS (kept for compatibility)
      trainingGrounds: {
        name: 'Training Grounds (Legacy)',
        icon: '🏋️',
        description: 'Train your combat skills (legacy system)',
        baseCost: 100,
        costMultiplier: 1.5,
        maxCost: 100000,
        isLegacy: true, // Hidden from new players
        bonus: (level) => ({
          damage: 0.05 * level,
          attackSpeed: 0.03 * level
        })
      },
      library: {
        name: 'Library',
        icon: '📚',
        description: 'Study ancient knowledge',
        baseCost: 200,
        costMultiplier: 1.5,
        maxCost: 100000,
        skillPointLevelInterval: 3,
        bonus: (level) => ({
          xp: 0.1 * level,
          skillPoints: Math.floor(level / 3)
        })
      },
      workshop: {
        name: 'Workshop',
        icon: '🔧',
        description: 'Upgrade gathering skills — chop, mine, gather faster and yield more resources',
        baseCost: 175,
        costMultiplier: 1.5,
        maxCost: 100000,
        bonus: (level) => ({
          gatherSpeed: 0.08 * level,
          yieldBonus: 0.1 * level
        })
      },
      shrine: {
        name: 'The Artifact Shrine',
        icon: '🏛️',
        description: 'A mystical shrine that holds powerful Artifacts. Artifacts provide massive passive stat boosts and only drop from Bosses or Void Expeditions. Upgrade to unlock up to 3 Artifact slots.',
        baseCost: 250,
        costMultiplier: 1.5,
        maxCost: 5000,
        bonus: (level) => ({
          artifactSlots: level,
          critDamage: 0.1 * level,
          voidLifesteal: 0.02 * level
        })
      },
      droppletShop: {
        name: 'The Dropplet Shop',
        icon: '💧',
        description: 'A mystical merchant stall. SELL unused weapons & gear from your Vault for Gold. BUY raw materials and Waterdrop Energy — the fuel for the Artifact Resonance Grid.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      }
    };

    const SKILL_TREE = {
      // STARTING SKILLS - Available first (Dash and Critical Focus as base skills)
      dash: {
        id: 'dash',
        name: 'Dash',
        path: 'utility',
        requires: null,
        maxLevel: 5,
        cost: 1,
        description: 'Quick dodge in movement direction',
        bonus: (level) => ({
          dashCooldown: 0.2 * level
        })
      },
      criticalFocus: {
        name: '🎯 Critical Focus',
        description: '+10% crit chance, +15% crit damage',
        cost: 1,
        maxLevel: 5,
        requires: null,
        bonus: (level) => ({
          critChance: 0.1 * level,
          critDamage: 0.15 * level
        })
      },
      autoAim: {
        name: '🎯 Auto-Aim',
        description: 'Enables automatic targeting of nearest enemies. Toggle in Settings > Auto-Aim.',
        cost: 1,
        maxLevel: 1,
        requires: null,
        bonus: (level) => ({ autoAim: level > 0 })
      },
      dashMaster: {
        name: '🏃 Dash Master',
        description: 'Reduce dash cooldown by 15%, increase dash distance by 10%',
        cost: 1,
        maxLevel: 3,
        requires: 'dash',
        bonus: (level) => ({
          dashCooldown: 0.15 * level,
          dashDistance: 0.1 * level
        })
      },
      headshot: {
        id: 'headshot',
        name: 'Headshot',
        path: 'combat',
        requires: 'criticalFocus',
        maxLevel: 5,
        cost: 1,
        description: 'Double-crit = instant kill',
        bonus: (level) => ({
          critChance: 0.05 * level
        })
      },
      
      // COMBAT PATH (12 skills) - Unlocked after initial skills
      combatMastery: {
        name: 'Combat Mastery',
        description: '+10% damage, +5% crit chance',
        cost: 1,
        maxLevel: 5,
        requires: 'dashMaster',
        bonus: (level) => ({
          damage: 0.1 * level,
          critChance: 0.05 * level
        })
      },
      bladeDancer: {
        name: 'Blade Dancer',
        description: '+8% attack speed, +5% move speed',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          attackSpeed: 0.08 * level,
          moveSpeed: 0.05 * level
        })
      },
      heavyStrike: {
        name: 'Heavy Strike',
        description: '+15% damage, -5% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          damage: 0.15 * level,
          attackSpeed: -0.05 * level
        })
      },
      rapidFire: {
        name: 'Rapid Fire',
        description: '+12% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'bladeDancer',
        bonus: (level) => ({
          attackSpeed: 0.12 * level
        })
      },
      armorPierce: {
        name: 'Armor Pierce',
        description: 'Ignore 15% of enemy armor',
        cost: 1,
        maxLevel: 3,
        requires: 'heavyStrike',
        bonus: (level) => ({
          armorPenetration: 0.15 * level
        })
      },
      multiHit: {
        name: 'Multi-Hit',
        description: '5% chance to hit twice',
        cost: 1,
        maxLevel: 3,
        requires: 'rapidFire',
        bonus: (level) => ({
          multiHitChance: 0.05 * level
        })
      },
      executioner: {
        name: 'Executioner',
        description: '+20% damage to enemies below 30% HP',
        cost: 1,
        maxLevel: 3,
        requires: 'criticalFocus',
        bonus: (level) => ({
          executeDamage: 0.2 * level
        })
      },
      bloodlust: {
        name: 'Bloodlust',
        description: 'Heal 5 HP on kill',
        cost: 1,
        maxLevel: 3,
        requires: 'executioner',
        bonus: (level) => ({
          healOnKill: 5 * level
        })
      },
      berserker: {
        name: 'Berserker',
        description: '+10% damage when below 50% HP',
        cost: 1,
        maxLevel: 3,
        requires: 'bloodlust',
        bonus: (level) => ({
          lowHpDamage: 0.1 * level
        })
      },
      weaponSpecialist: {
        name: 'Weapon Specialist',
        description: '+8% all weapon damage',
        cost: 1,
        maxLevel: 5,
        requires: 'multiHit',
        bonus: (level) => ({
          weaponDamage: 0.08 * level
        })
      },
      combatVeteran: {
        name: 'Combat Veteran',
        description: '+12% damage, +8% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'weaponSpecialist',
        bonus: (level) => ({
          damage: 0.12 * level,
          attackSpeed: 0.08 * level
        })
      },
      
      // DEFENSE PATH (12 skills)
      survivalist: {
        name: 'Survivalist',
        description: '+15 HP, +1 HP/sec regen',
        cost: 1,
        maxLevel: 5,
        requires: 'criticalFocus',
        bonus: (level) => ({
          hp: 15 * level,
          regen: 1 * level
        })
      },
      ironSkin: {
        name: 'Iron Skin',
        description: '+10 armor',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          armor: 10 * level
        })
      },
      quickReflex: {
        name: 'Quick Reflex',
        description: '+5% dodge chance',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          dodgeChance: 0.05 * level
        })
      },
      fortification: {
        name: 'Fortification',
        description: '+10 armor, +5% damage reduction',
        cost: 1,
        maxLevel: 5,
        requires: 'ironSkin',
        bonus: (level) => ({
          armor: 10 * level,
          damageReduction: 0.05 * level
        })
      },
      regeneration: {
        name: 'Regeneration',
        description: '+2 HP/sec regen',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          regen: 2 * level
        })
      },
      lastStand: {
        name: 'Last Stand',
        description: 'Survive fatal blow with 1 HP (once per run)',
        cost: 1,
        maxLevel: 1,
        requires: 'fortification',
        bonus: (level) => ({
          lastStand: level > 0
        })
      },
      toughness: {
        name: 'Toughness',
        description: '+25 max HP',
        cost: 1,
        maxLevel: 3,
        requires: 'regeneration',
        bonus: (level) => ({
          hp: 25 * level
        })
      },
      guardian: {
        name: 'Guardian',
        description: '+8% damage reduction',
        cost: 1,
        maxLevel: 3,
        requires: 'fortification',
        bonus: (level) => ({
          damageReduction: 0.08 * level
        })
      },
      resilience: {
        name: 'Resilience',
        description: '+15% max HP',
        cost: 1,
        maxLevel: 3,
        requires: 'toughness',
        bonus: (level) => ({
          hpPercent: 0.15 * level
        })
      },
      secondWind: {
        name: 'Second Wind',
        description: 'Heal 30% HP when below 20% HP (60s cooldown)',
        cost: 1,
        maxLevel: 1,
        requires: 'resilience',
        bonus: (level) => ({
          secondWind: level > 0
        })
      },
      endurance: {
        name: 'Endurance',
        description: '+20 max HP, +1.5 HP/sec regen',
        cost: 1,
        maxLevel: 5,
        requires: 'guardian',
        bonus: (level) => ({
          hp: 20 * level,
          regen: 1.5 * level
        })
      },
      immortal: {
        name: 'Immortal',
        description: '+10% all damage reduction, +3 HP/sec regen',
        cost: 1,
        maxLevel: 3,
        requires: 'endurance',
        bonus: (level) => ({
          damageReduction: 0.1 * level,
          regen: 3 * level
        })
      },
      
      // UTILITY PATH (12 skills)
      wealthHunter: {
        name: 'Wealth Hunter',
        description: '+15% gold gain, +10% XP gain',
        cost: 1,
        maxLevel: 5,
        requires: 'dashMaster',
        bonus: (level) => ({
          gold: 0.15 * level,
          xp: 0.1 * level
        })
      },
      quickLearner: {
        name: 'Quick Learner',
        description: '+20% XP gain, -5% cooldown',
        cost: 1,
        maxLevel: 5,
        requires: 'wealthHunter',
        bonus: (level) => ({
          xp: 0.2 * level,
          cooldown: 0.05 * level
        })
      },
      magnetism: {
        name: 'Magnetism',
        description: '+25% pickup range',
        cost: 1,
        maxLevel: 3,
        requires: 'wealthHunter',
        bonus: (level) => ({
          pickupRange: 0.25 * level
        })
      },
      efficiency: {
        name: 'Efficiency',
        description: '-10% all cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'quickLearner',
        bonus: (level) => ({
          cooldown: 0.1 * level
        })
      },
      scavenger: {
        name: 'Scavenger',
        description: '+20% drop rate for all items',
        cost: 1,
        maxLevel: 3,
        requires: 'magnetism',
        bonus: (level) => ({
          dropRate: 0.2 * level
        })
      },
      fortuneFinder: {
        name: 'Fortune Finder',
        description: '+25% gold drops',
        cost: 1,
        maxLevel: 3,
        requires: 'scavenger',
        bonus: (level) => ({
          gold: 0.25 * level
        })
      },
      speedster: {
        name: 'Speedster',
        description: '+10% move speed',
        cost: 1,
        maxLevel: 3,
        requires: 'dashMaster',
        bonus: (level) => ({
          moveSpeed: 0.1 * level
        })
      },
      cooldownExpert: {
        name: 'Cooldown Expert',
        description: '-15% all cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'efficiency',
        bonus: (level) => ({
          cooldown: 0.15 * level
        })
      },
      auraExpansion: {
        name: 'Aura Expansion',
        description: '+20% aura weapon range',
        cost: 1,
        maxLevel: 3,
        requires: 'speedster',
        bonus: (level) => ({
          auraRange: 0.2 * level
        })
      },
      resourceful: {
        name: 'Resourceful',
        description: '+15% XP, +15% gold, +10% drop rate',
        cost: 1,
        maxLevel: 5,
        requires: 'fortuneFinder',
        bonus: (level) => ({
          xp: 0.15 * level,
          gold: 0.15 * level,
          dropRate: 0.1 * level
        })
      },
      treasureHunter: {
        name: 'Treasure Hunter',
        description: '+30% gold, +50% pickup range',
        cost: 1,
        maxLevel: 3,
        requires: 'resourceful',
        bonus: (level) => ({
          gold: 0.3 * level,
          pickupRange: 0.5 * level
        })
      },
      
      // ELEMENTAL PATH (12 skills)
      fireMastery: {
        name: '🔥 Fire Mastery',
        description: '+15% fire damage, burn enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          fireDamage: 0.15 * level,
          burnChance: 0.1 * level
        })
      },
      iceMastery: {
        name: '❄️ Ice Mastery',
        description: '+15% ice damage, slow enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          iceDamage: 0.15 * level,
          slowChance: 0.15 * level
        })
      },
      lightningMastery: {
        name: '⚡ Lightning Mastery',
        description: '+15% lightning damage, chain lightning',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          lightningDamage: 0.15 * level,
          chainChance: 0.1 * level
        })
      },
      elementalFusion: {
        name: 'Elemental Fusion',
        description: '+10% all elemental damage',
        cost: 1,
        maxLevel: 3,
        requires: 'fireMastery',
        bonus: (level) => ({
          elementalDamage: 0.1 * level
        })
      },
      pyromaniac: {
        name: 'Pyromaniac',
        description: '+25% fire damage, burn spreads',
        cost: 1,
        maxLevel: 3,
        requires: 'fireMastery',
        bonus: (level) => ({
          fireDamage: 0.25 * level,
          burnSpread: level > 0
        })
      },
      frostbite: {
        name: 'Frostbite',
        description: '+25% ice damage, freeze chance',
        cost: 1,
        maxLevel: 3,
        requires: 'iceMastery',
        bonus: (level) => ({
          iceDamage: 0.25 * level,
          freezeChance: 0.05 * level
        })
      },
      stormCaller: {
        name: 'Storm Caller',
        description: '+25% lightning damage, more chains',
        cost: 1,
        maxLevel: 3,
        requires: 'lightningMastery',
        bonus: (level) => ({
          lightningDamage: 0.25 * level,
          chainCount: level
        })
      },
      elementalChain: {
        name: 'Elemental Chain',
        description: 'Elemental attacks chain to nearby enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'elementalFusion',
        bonus: (level) => ({
          elementalChain: level
        })
      },
      manaOverflow: {
        name: 'Mana Overflow',
        description: '+20% elemental damage, -10% cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'pyromaniac',
        bonus: (level) => ({
          elementalDamage: 0.2 * level,
          cooldown: 0.1 * level
        })
      },
      spellEcho: {
        name: 'Spell Echo',
        description: '10% chance to cast elemental effect twice',
        cost: 1,
        maxLevel: 3,
        requires: 'elementalChain',
        bonus: (level) => ({
          spellEchoChance: 0.1 * level
        })
      },
      arcaneEmpowerment: {
        name: 'Arcane Empowerment',
        description: '+15% all damage, +15% elemental damage',
        cost: 1,
        maxLevel: 5,
        requires: 'manaOverflow',
        bonus: (level) => ({
          damage: 0.15 * level,
          elementalDamage: 0.15 * level
        })
      },
      elementalOverload: {
        name: 'Elemental Overload',
        description: '+30% elemental damage, elemental effects guaranteed',
        cost: 1,
        maxLevel: 3,
        requires: 'arcaneEmpowerment',
        bonus: (level) => ({
          elementalDamage: 0.3 * level,
          elementalGuaranteed: level >= 3
        })
      },

      // ── SPECIAL ATTACKS PATH ──────────────────────────────────
      specialShockwave: {
        name: '💥 Shockwave',
        description: 'Unlocks the Shockwave special attack (massive AoE explosion)',
        cost: 2,
        maxLevel: 1,
        requires: 'combatMastery',
        bonus: (level) => ({ unlockSpecial: 'shockwave' })
      },
      specialFrozenStorm: {
        name: '❄️ Frozen Storm',
        description: 'Unlocks Frozen Storm (freeze nearby enemies)',
        cost: 2,
        maxLevel: 1,
        requires: 'specialShockwave',
        bonus: (level) => ({ unlockSpecial: 'frozenStorm' })
      },
      specialDeathBlossom: {
        name: '🌸 Death Blossom',
        description: 'Unlocks Death Blossom (360° projectile burst)',
        cost: 2,
        maxLevel: 1,
        requires: 'specialFrozenStorm',
        bonus: (level) => ({ unlockSpecial: 'deathBlossom' })
      },
      specialThunderStrike: {
        name: '⚡ Thunder Strike',
        description: 'Unlocks Thunder Strike (lightning line attack)',
        cost: 2,
        maxLevel: 1,
        requires: 'lightningMastery',
        bonus: (level) => ({ unlockSpecial: 'thunderStrike' })
      },
      specialVoidPulse: {
        name: '🌀 Void Pulse',
        description: 'Unlocks Void Pulse (dark energy implosion)',
        cost: 3,
        maxLevel: 1,
        requires: 'specialDeathBlossom',
        bonus: (level) => ({ unlockSpecial: 'voidPulse' })
      },
      specialInfernoRing: {
        name: '🔥 Inferno Ring',
        description: 'Unlocks Inferno Ring (ring of fire)',
        cost: 2,
        maxLevel: 1,
        requires: 'fireMastery',
        bonus: (level) => ({ unlockSpecial: 'infernoRing' })
      },

      // ── MELEE TAKEDOWN ────────────────────────────────────────
      meleeTakedown: {
        name: '🔪 Melee Takedown',
        description: 'Unlocks the knife melee instant-kill takedown attack',
        cost: 3,
        maxLevel: 1,
        requires: 'executioner',
        bonus: (level) => ({ unlockMelee: level > 0 })
      }
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // MUTATIONS — Meta-progression synergy layer unlocked after quest_pushingLimits.
    // Investing in two complementary skill paths activates a hidden "Mutation" passive.
    // ─────────────────────────────────────────────────────────────────────────────
    const MUTATIONS = {
      flameDash: {
        id: 'flameDash',
        name: '🔥 Flame Dash',
        description: 'SYNERGY: Fire + Speed. Your dash leaves a burning trail that deals 40 damage/s for 2s.',
        requires: { anyFire: 1, anySpeed: 1 },
        tooltip: 'Requires: any Fire skill ≥ 1 AND any Speed/Dash skill ≥ 1',
        bonus: (level) => ({ flameDash: true, flameDashDmg: 40 * level, flameDashDuration: 2 })
      },
      chainLightningCrit: {
        id: 'chainLightningCrit',
        name: '⚡ Arc Cascade',
        description: 'SYNERGY: Crit + Lightning. Critical hits have a 25% chance to chain lightning to 2 nearby enemies.',
        requires: { anyCrit: 2, anyLightning: 1 },
        tooltip: 'Requires: any Crit skill ≥ 2 AND any Lightning skill ≥ 1',
        bonus: (level) => ({ critChainLightning: 0.25 * level, critChainCount: 2 })
      },
      bloodPact: {
        id: 'bloodPact',
        name: '🩸 Blood Pact',
        description: 'SYNERGY: Lifesteal + Armor. Each kill restores 3% of max HP and grants +2 temporary armor (stacks 10x).',
        requires: { anyLifesteal: 1, anyArmor: 1 },
        tooltip: 'Requires: any Lifesteal/Heal-on-kill skill ≥ 1 AND any Armor skill ≥ 1',
        bonus: (level) => ({ lifestealPercent: 0.03 * level, killArmorStack: 2 * level, killArmorMax: 10 })
      },
      shadowBurst: {
        id: 'shadowBurst',
        name: '🌑 Shadow Burst',
        description: 'SYNERGY: Dash + Execute. After a kill, your next dash deals 200% weapon damage in an area.',
        requires: { anyDash: 2, anyExecute: 1 },
        tooltip: 'Requires: any Dash skill ≥ 2 AND any Execute skill ≥ 1',
        bonus: (level) => ({ shadowBurst: true, shadowBurstMult: 2.0 * level })
      },
      frostVeil: {
        id: 'frostVeil',
        name: '❄️ Frost Veil',
        description: 'SYNERGY: Ice + Defense. Taking damage has 30% chance to emit a frost nova that slows enemies 60% for 1.5s.',
        requires: { anyIce: 1, anyDefense: 1 },
        tooltip: 'Requires: any Ice skill ≥ 1 AND any Defense/HP skill ≥ 1',
        bonus: (level) => ({ frostVeil: true, frostNovaPct: 0.30 * level, frostNovaSlow: 0.60 })
      }
    };

    /**
     * Evaluate which mutations are active for the current skill tree state.
     * Returns an object { mutationId: true } for each active mutation.
     */
    function getActiveMutations() {
      if (!saveData.skillTree) return {};
      const st = saveData.skillTree;
      const active = {};

      // Helper: safely read a skill level from the save tree
      function _sl(name) { return (st[name] && st[name].level) || 0; }

      // Aggregated sums per category
      const fireTotal      = _sl('fireAura')       + _sl('infernoRing');
      const speedTotal     = _sl('bladeDancer')    + _sl('dash')        + _sl('dashMaster');
      const critTotal      = _sl('criticalFocus')  + _sl('headshot');
      const lightningTotal = _sl('stormcaller')    + _sl('lightningStrike');
      const lifestealTotal = _sl('bloodlust')      + _sl('vampiricAura');
      const armorTotal     = _sl('ironSkin')       + _sl('fortify')     + _sl('bodyArmor');
      const dashTotal      = _sl('dash')           + _sl('dashMaster');
      const executeTotal   = _sl('executioner')    + _sl('meleeTakedown');
      const iceTotal       = _sl('coldSnap')       + _sl('iceAura');
      const defenseTotal   = _sl('ironSkin')       + _sl('fortify')     + _sl('secondWind');

      if (fireTotal >= 1 && speedTotal >= 1) active.flameDash = true;
      if (critTotal >= 2 && lightningTotal >= 1) active.chainLightningCrit = true;
      if (lifestealTotal >= 1 && armorTotal >= 1) active.bloodPact = true;
      if (dashTotal >= 2 && executeTotal >= 1) active.shadowBurst = true;
      if (iceTotal >= 1 && defenseTotal >= 1) active.frostVeil = true;

      return active;
    }

    /** Apply active mutation bonuses on top of skill-tree bonuses. */
    function applyMutationBonuses() {
      const active = getActiveMutations();
      if (!saveData.mutations) saveData.mutations = {};
      // Record which mutations fired this session for UI display
      saveData.mutations._active = active;

      for (const mutId in active) {
        const mut = MUTATIONS[mutId];
        if (!mut) continue;
        const bonus = mut.bonus(1);
        if (bonus.flameDash)              playerStats.flameDash          = true;
        if (bonus.flameDashDmg)           playerStats.flameDashDmg       = bonus.flameDashDmg;
        if (bonus.critChainLightning)     playerStats.critChainLightning = (playerStats.critChainLightning || 0) + bonus.critChainLightning;
        if (bonus.critChainCount)         playerStats.critChainCount     = bonus.critChainCount;
        if (bonus.lifestealPercent)       playerStats.lifestealPercent   = (playerStats.lifestealPercent || 0) + bonus.lifestealPercent;
        if (bonus.killArmorStack)         playerStats.killArmorStack     = bonus.killArmorStack;
        if (bonus.killArmorMax)           playerStats.killArmorMax       = bonus.killArmorMax;
        if (bonus.shadowBurst)            playerStats.shadowBurst        = true;
        if (bonus.shadowBurstMult)        playerStats.shadowBurstMult    = bonus.shadowBurstMult;
        if (bonus.frostVeil)              playerStats.frostVeil          = true;
        if (bonus.frostNovaPct)           playerStats.frostNovaPct       = bonus.frostNovaPct;
      }
    }

    // Expose MUTATIONS and helpers globally
    window.MUTATIONS             = MUTATIONS;
    window.getActiveMutations    = getActiveMutations;
    window.applyMutationBonuses  = applyMutationBonuses;

    /**
     * Apply all purchased SKILL_TREE bonuses to playerStats and the module-level
     * dash variables. Call this at the END of resetGame(), after base stats are set.
     * This fixes the critical bug where skill purchases had no in-game effect.
     */
    function applySkillTreeBonuses() {
      if (!saveData.skillTree) return;

      // Accumulators for stats that combine additively
      let hpFlat = 0, hpPercent = 0, regenFlat = 0, armorFlat = 0;
      let damageMult = 0, critChanceFlat = 0, critDmgFlat = 0;
      let atkSpeedMult = 0, moveSpeedMult = 0;
      let dashCdReduction = 0, dashDistMult = 0, cooldownReduction = 0;

      for (const skillId in saveData.skillTree) {
        const skillData = saveData.skillTree[skillId];
        const level = (skillData && skillData.level) || 0;
        if (level === 0) continue;

        const skillDef = SKILL_TREE[skillId];
        if (!skillDef || typeof skillDef.bonus !== 'function') continue;

        const bonus = skillDef.bonus(level);

        // --- Accumulated stats ---
        if (bonus.hp)           hpFlat        += bonus.hp;
        if (bonus.hpPercent)    hpPercent     += bonus.hpPercent;
        if (bonus.regen)        regenFlat     += bonus.regen;
        if (bonus.armor)        armorFlat     += bonus.armor;
        if (bonus.damage)       damageMult    += bonus.damage;
        if (bonus.weaponDamage) damageMult    += bonus.weaponDamage; // weaponDamage stacks additively with damage into the same multiplier
        if (bonus.critChance)   critChanceFlat += bonus.critChance;
        if (bonus.critDamage)   critDmgFlat   += bonus.critDamage;
        if (bonus.attackSpeed)  atkSpeedMult  += bonus.attackSpeed;
        if (bonus.moveSpeed)    moveSpeedMult += bonus.moveSpeed;
        if (bonus.dashCooldown) dashCdReduction += bonus.dashCooldown;
        if (bonus.dashDistance) dashDistMult  += bonus.dashDistance;
        if (bonus.cooldown)     cooldownReduction += bonus.cooldown;

        // --- Direct playerStats fields ---
        if (bonus.damageReduction)    playerStats.damageReduction    = Math.min(0.75, (playerStats.damageReduction || 0) + bonus.damageReduction);
        if (bonus.dodgeChance)        playerStats.dodgeChance        = Math.min(0.75, (playerStats.dodgeChance || 0) + bonus.dodgeChance);
        if (bonus.healOnKill)         playerStats.healOnKill         = (playerStats.healOnKill || 0) + bonus.healOnKill;
        if (bonus.lowHpDamage)        playerStats.lowHpDamage        = (playerStats.lowHpDamage || 0) + bonus.lowHpDamage;
        if (bonus.executeDamage)      playerStats.executeDamage      = (playerStats.executeDamage || 0) + bonus.executeDamage;
        if (bonus.armorPenetration)   playerStats.armorPenetration   = Math.min(0.90, (playerStats.armorPenetration || 0) + bonus.armorPenetration);
        if (bonus.multiHitChance)     playerStats.multiHitChance     = Math.min(0.75, (playerStats.multiHitChance || 0) + bonus.multiHitChance);
        if (bonus.lastStand)          playerStats.hasLastStand       = true;
        if (bonus.secondWind)         playerStats.hasSecondWind      = true;
        if (bonus.pickupRange)        playerStats.pickupRange        = (playerStats.pickupRange || 1.0) + bonus.pickupRange;
        if (bonus.dropRate)           playerStats.dropRate           = (playerStats.dropRate || 1.0) + bonus.dropRate;
        if (bonus.auraRange)          playerStats.auraRange          = (playerStats.auraRange || 1.0) + bonus.auraRange;
        if (bonus.magnetRange)        playerStats.magnetRange        = Math.max((playerStats.magnetRange || 6.0), bonus.magnetRange);
        // Elemental
        if (bonus.fireDamage)         playerStats.fireDamage         = (playerStats.fireDamage || 0) + bonus.fireDamage;
        if (bonus.iceDamage)          playerStats.iceDamage          = (playerStats.iceDamage || 0) + bonus.iceDamage;
        if (bonus.lightningDamage)    playerStats.lightningDamage    = (playerStats.lightningDamage || 0) + bonus.lightningDamage;
        if (bonus.elementalDamage)    playerStats.elementalDamage    = (playerStats.elementalDamage || 0) + bonus.elementalDamage;
        if (bonus.burnChance)         playerStats.burnChance         = (playerStats.burnChance || 0) + bonus.burnChance;
        if (bonus.slowChance)         playerStats.slowChance         = (playerStats.slowChance || 0) + bonus.slowChance;
        if (bonus.chainChance)        playerStats.chainChance        = (playerStats.chainChance || 0) + bonus.chainChance;
        if (bonus.chainCount)         playerStats.chainCount         = (playerStats.chainCount || 0) + bonus.chainCount;
        if (bonus.freezeChance)       playerStats.freezeChance       = (playerStats.freezeChance || 0) + bonus.freezeChance;
        if (bonus.burnSpread)         playerStats.burnSpread         = true;
        if (bonus.spellEchoChance)    playerStats.spellEchoChance    = (playerStats.spellEchoChance || 0) + bonus.spellEchoChance;
        if (bonus.elementalChain)     playerStats.elementalChain     = (playerStats.elementalChain || 0) + bonus.elementalChain;
        if (bonus.elementalGuaranteed) playerStats.elementalGuaranteed = true;
        // Gold/XP multipliers (wealthHunter, treasureHunter, quickLearner)
        if (bonus.gold) playerStats.goldMultiplier = (playerStats.goldMultiplier || 1.0) + bonus.gold;
        if (bonus.xp)   playerStats.xpMultiplier   = (playerStats.xpMultiplier   || 1.0) + bonus.xp;
      }

      // --- Apply accumulated bonuses ---
      // HP (flat first, then percent on top)
      playerStats.maxHp += hpFlat;
      if (hpPercent > 0) playerStats.maxHp = Math.floor(playerStats.maxHp * (1 + hpPercent));
      playerStats.hp = playerStats.maxHp; // Start the run at full health

      playerStats.hpRegen   += regenFlat;
      playerStats.armor     += armorFlat;

      // Multiplicative bonuses applied to already-calculated base stats
      if (damageMult    !== 0) playerStats.strength  *= (1 + damageMult);
      if (critChanceFlat !== 0) playerStats.critChance += critChanceFlat;
      if (critDmgFlat   !== 0) playerStats.critDmg    += critDmgFlat;
      if (atkSpeedMult  !== 0) playerStats.atkSpeed   *= (1 + atkSpeedMult);
      if (moveSpeedMult !== 0) playerStats.walkSpeed  *= (1 + moveSpeedMult);

      // Dash variables (module-level in main.js; guard with typeof so sandbox can call this safely)
      const totalDashCd = Math.min(0.80, dashCdReduction + cooldownReduction);
      if (totalDashCd > 0 && typeof dashCooldown !== 'undefined') dashCooldown *= (1 - totalDashCd);
      if (dashDistMult > 0 && typeof dashDistance !== 'undefined') dashDistance *= (1 + dashDistMult);
      // Also apply to playerStats fields so sandbox can read them
      if (totalDashCd > 0) playerStats.dashCooldown = Math.max(0.2, (playerStats.dashCooldown || 1.0) * (1 - totalDashCd));
      if (dashDistMult > 0) playerStats.dashDistance = (playerStats.dashDistance || 5.0) * (1 + dashDistMult);

      // Clamp stats to sane ranges
      playerStats.armor       = Math.min(85, playerStats.armor);
      playerStats.critChance  = Math.min(0.95, playerStats.critChance);

      // Sync granular v2 RPG stat aliases so sandbox uses the same values
      playerStats.criticalHitChance       = playerStats.critChance;
      playerStats.criticalHitDamageMulti  = playerStats.critDmg;
      playerStats.xpCollectionRadius      = playerStats.pickupRange || 1.0;
      if (moveSpeedMult !== 0) {
        // Reflect walkSpeed change back into topSpeed
        playerStats.topSpeed = (playerStats.topSpeed || 6.5) * (1 + moveSpeedMult);
      }

      // Mobility score = average of turnResponse bonuses (visual/feel metric)
      playerStats.mobilityScore = playerStats.turnResponse || 1.0;

      // Apply active mutation synergy bonuses on top
      if (typeof applyMutationBonuses === 'function') applyMutationBonuses();
    }

    // Expose globally so sandbox.html can call applySkillTreeBonuses() after
    // playerStats is initialised from getDefaultPlayerStats().
    window.applySkillTreeBonuses = applySkillTreeBonuses;
    // Expose SKILL_TREE so stat-aggregator.js can read skill bonus definitions
    window.SKILL_TREE = SKILL_TREE;

    function isDashUnlocked() {
      return (saveData.skillTree && saveData.skillTree.dash && saveData.skillTree.dash.level > 0) ||
             (saveData.tutorial && saveData.tutorial.dashUnlocked) ||
             (saveData.skillTree && saveData.skillTree.dashMaster && saveData.skillTree.dashMaster.level > 0);
    }
    function isHeadshotUnlocked() {
      return (saveData.skillTree && saveData.skillTree.headshot && saveData.skillTree.headshot.level > 0) ||
             (saveData.tutorial && saveData.tutorial.headshotUnlocked) ||
             (saveData.skillTree && saveData.skillTree.criticalFocus && saveData.skillTree.criticalFocus.level > 0) ||
             (saveData.skillTree && saveData.skillTree.executioner && saveData.skillTree.executioner.level > 0);
    }

    function startDash() {
      if (!isDashUnlocked() || isDashing || dashCooldownRemaining > 0) return;
      if (!player) return;
      isDashing = true;
      dashTimer = 0.2;
      dashInvulnerable = true;
      const keysP = window._keysPressed || {};
      const dx = (keysP['d'] || keysP['arrowright'] ? 1 : 0) - (keysP['a'] || keysP['arrowleft'] ? 1 : 0);
      const dz = (keysP['s'] || keysP['arrowdown'] ? 1 : 0) - (keysP['w'] || keysP['arrowup'] ? 1 : 0);
      const len = Math.sqrt(dx*dx + dz*dz);
      dashDirection.x = len > 0 ? dx/len : 0;
      dashDirection.z = len > 0 ? dz/len : 1;
      const dashLevel = (saveData.skillTree && saveData.skillTree.dash) ? (saveData.skillTree.dash.level || 0) : 0;
      dashCooldownRemaining = Math.max(1.5, 3 - 0.2 * dashLevel);
      // Trigger waterdrop dash wave animation
      const wdc = document.getElementById('waterdrop-container');
      if (wdc) {
        wdc.classList.remove('dashing');
        void wdc.offsetWidth;
        wdc.classList.add('dashing');
        setTimeout(() => wdc.classList.remove('dashing'), 500);
      }
      // Delegate actual movement to existing player.dash()
      player.dash(dashDirection.x, dashDirection.z);
      // Notify SSB of dash activation
      if (window.pushSuperStatEvent) {
        window.pushSuperStatEvent('💨 Dash!', 'rare', '💨', 'neutral');
      }
    }

    function getBuildingCost(buildingId) {
      const building = CAMP_BUILDINGS[buildingId];
      const currentLevel = saveData.campBuildings[buildingId].level;
      const calculatedCost = Math.floor(building.baseCost * Math.pow(building.costMultiplier, currentLevel));
      // Cap cost at maxCost to prevent overflow at very high levels
      return Math.min(calculatedCost, building.maxCost || 100000);
    }

    function upgradeCampBuilding(buildingId) {
      const building = CAMP_BUILDINGS[buildingId];
      const buildingData = saveData.campBuildings[buildingId];
      const cost = getBuildingCost(buildingId);
      
      if (buildingData.level >= buildingData.maxLevel) {
        showStatusMessage('Building is at max level!', 2000);
        return;
      }
      
      if (saveData.gold >= cost) {
        saveData.gold -= cost;
        buildingData.level++;
        
        // Award skill points from library
        if (buildingId === 'library') {
          const bonus = building.bonus(buildingData.level);
          if (bonus.skillPoints > 0) {
            saveData.skillPoints += bonus.skillPoints;
          }
        }
        
        saveSaveData();
        updateCampScreen();
        playSound('collect');
        showStatusMessage(`${building.name} upgraded to level ${buildingData.level}!`, 2000);

        // Grant building XP to account
        var _bXP = 50 + (buildingData.level * 25);
        if (typeof addAccountXP === 'function') {
          addAccountXP(_bXP);
        } else if (typeof window.addAccountXP === 'function') {
          window.addAccountXP(_bXP);
        } else if (typeof saveData !== 'undefined') {
          saveData.accountXP = (saveData.accountXP || 0) + _bXP;
        }
        // Persist the XP award (addAccountXP only saves on level-up)
        if (typeof saveSaveData === 'function') saveSaveData();
        if (typeof showStatChange === 'function') showStatChange('+' + _bXP + ' Account XP', 'epic');
        
        // Quest progression
        if (buildingId === 'skillTree' && buildingData.level === 2 && saveData.storyQuests.currentQuest === 'upgradeSkillTree') {
          progressQuest('upgradeSkillTree', true);
        }
        
        // Check for "upgrade any building to level 3" quest
        if (buildingData.level === 3 && saveData.storyQuests.currentQuest === 'upgradeAnyBuildingTo3') {
          progressQuest('upgradeAnyBuildingTo3', true);
        }
      } else {
        playSound('invalid');
        showStatusMessage('Not enough gold!', 2000);
      }
    }

    function unlockSkill(skillId) {
      const skill = SKILL_TREE[skillId];
      if (!skill) { showStatusMessage('Unknown skill!', 2000); return; }

      // Ensure skillData entry exists in saveData before accessing it
      if (!saveData.skillTree[skillId]) {
        saveData.skillTree[skillId] = { level: 0, unlocked: false };
      }
      const skillData = saveData.skillTree[skillId];
      
      if (skillData.level >= skill.maxLevel) {
        showStatusMessage('Skill is at max level!', 2000);
        return;
      }

      // Validate prerequisite skill is purchased before allowing this purchase
      if (skill.requires) {
        const parentData = saveData.skillTree[skill.requires] || { level: 0 };
        if ((parentData.level || 0) === 0) {
          const parentSkill = SKILL_TREE[skill.requires];
          const parentName = parentSkill ? parentSkill.name : skill.requires;
          showStatusMessage(`Requires ${parentName} first!`, 2000);
          return;
        }
      }
      
      // Check skill point cost
      if (saveData.skillPoints >= skill.cost) {
        saveData.skillPoints -= skill.cost;
        if (!skillData.unlocked) {
          skillData.unlocked = true;
        }
        skillData.level++;
        
        saveSaveData();
        updateCampScreen();
        // Immediately re-render the skill tree panel so nodes update state visually
        if (typeof renderSkillTreeWeb === 'function') renderSkillTreeWeb();

        // Trigger dopamine-inducing unlock animation
        setTimeout(() => {
          const skillNode = document.querySelector(`[data-skill-id="${skillId}"]`);
          if (skillNode) {
            // Add animation class
            skillNode.classList.add('just-unlocked');

            // Create particle burst effect overlay
            const particleOverlay = document.createElement('div');
            particleOverlay.className = 'skill-unlock-particles';
            particleOverlay.style.cssText = `
              background: radial-gradient(circle, rgba(255,215,0,0.8) 0%, transparent 70%);
              animation: particleBurst 0.8s ease-out forwards;
            `;
            skillNode.appendChild(particleOverlay);

            // Remove animation class and particle overlay after animation completes
            setTimeout(() => {
              skillNode.classList.remove('just-unlocked');
              if (particleOverlay.parentNode === skillNode) {
                skillNode.removeChild(particleOverlay);
              }
            }, 800);
          }
        }, 50); // Small delay to ensure DOM is updated

        playSound('collect');
        
        // Refresh special attack loadout HUD if a special attack or melee node was unlocked
        if (window.GameRageCombat && (skillId.startsWith('special') || skillId === 'meleeTakedown')) {
          window.GameRageCombat.refreshLoadout(saveData);
        }
        
        showStatusMessage(`${skill.name} leveled up!`, 2000);
        
        // QUEST 2: Track skill point spending for tutorial quest
        if (saveData.tutorialQuests) {
          ensureQuest2Activated();
        }
        
        // Quest progression: Track skill unlocks for tutorial quest
        if (saveData.storyQuests.currentQuest === 'useSkillTree') {
          // Count how many skills have been unlocked (use level > 0 as canonical check)
          const unlockedSkillsCount = Object.values(saveData.skillTree).filter(s => s.level > 0).length;
          
          if (unlockedSkillsCount >= 2) {
            // Completed the demonstration quest
            saveData.storyQuests.buildingFirstUse.skillTree = true;
            progressQuest('useSkillTree', true);
          }
        }
        
        // Tutorial: Check if dash was unlocked
        if (!saveData.tutorial) {
          saveData.tutorial = {
            completed: false,
            firstDeath: false,
            campVisited: false,
            dashUnlocked: false,
            headshotUnlocked: false,
            currentStep: 'waiting_first_death'
          };
        }
        
        // Unlock dash ability whenever dash or dashMaster skill is purchased (regardless of tutorial step)
        if ((skillId === 'dash' || skillId === 'dashMaster') && !saveData.tutorial.dashUnlocked) {
          saveData.tutorial.dashUnlocked = true;
          saveSaveData();
        }
        // Unlock headshot ability whenever a crit skill is purchased
        if ((skillId === 'criticalFocus' || skillId === 'headshot' || skillId === 'executioner') && !saveData.tutorial.headshotUnlocked) {
          saveData.tutorial.headshotUnlocked = true;
          saveSaveData();
        }
        
        // Auto-Aim skill: enable checkbox + notify player
        if (skillId === 'autoAim' && skillData.level >= 1) {
          const autoAimCb = document.getElementById('auto-aim-checkbox');
          if (autoAimCb) {
            autoAimCb.disabled = false;
            autoAimCb.title = 'Toggle Auto-Aim on/off';
          }
          const autoAimLabel = document.getElementById('auto-aim-label-tooltip');
          if (autoAimLabel) autoAimLabel.style.display = 'none';

          // Call the settings UI update function
          if (typeof window.updateAutoAimUI === 'function') {
            window.updateAutoAimUI(true);
          }

          showStatChange('🎯 Auto-Aim unlocked! Enable it in Settings > Auto-Aim checkbox');
        }
        
        if ((skillId === 'dashMaster' || skillId === 'dash') && saveData.tutorial.currentStep === 'unlock_dash') {
          saveData.tutorial.currentStep = 'unlock_headshot';
          saveSaveData();
          setTimeout(() => {
            showComicTutorial('unlock_headshot');
          }, 1000);
        } else if ((skillId === 'criticalFocus' || skillId === 'headshot' || skillId === 'executioner') && saveData.tutorial.currentStep === 'unlock_headshot') {
          // Accept any crit/headshot related skill to complete the tutorial.
          // Note: the block ~20 lines above already set headshotUnlocked = true, so the
          // previous `!saveData.tutorial.headshotUnlocked` guard here was always false and
          // prevented tutorial_complete from ever showing. Guard removed intentionally.
          saveSaveData();
          setTimeout(() => {
            showComicTutorial('tutorial_complete');
          }, 1000);
        }
      } else {
        playSound('invalid');
        showStatusMessage('Not enough skill points!', 2000);
      }
    }

    // Training Hall constants
    const TRAINING_POINT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    
    // Fun combo names (defined once to avoid recreation)
    const FUN_COMBO_NAMES = [
      'xoxo', 'serious?', 'no way', 'one million combo almost', 
      'i lost count combo', 'are you even real?', 'stop it already',
      'ok this is ridiculous', 'somebody stop them', 'mercy please',
      'absolute madness', 'breaking the game', 'console.log("help")',
      'error 404: combo limit not found', 'combo.exe has stopped',
      'infinity and beyond', 'to the moon', 'unstoppable force',
      'immovable object met', 'game over man', 'legend has it'
    ];
    
    // Training Hall functions
    function updateTrainingPoints() {
      // Award training points based on time
      const now = Date.now();
      if (!saveData.lastTrainingPointTime) {
        saveData.lastTrainingPointTime = now;
      }
      
      const timeSinceLastPoint = now - saveData.lastTrainingPointTime;
      const pointsEarned = Math.floor(timeSinceLastPoint / TRAINING_POINT_INTERVAL_MS);
      
      if (pointsEarned > 0) {
        saveData.trainingPoints += pointsEarned;
        saveData.lastTrainingPointTime += pointsEarned * TRAINING_POINT_INTERVAL_MS;
        saveSaveData();
      }
    }
    
    function getNextTrainingPointTime() {
      if (!saveData.lastTrainingPointTime) return 'Soon';
      const now = Date.now();
      const nextPointTime = saveData.lastTrainingPointTime + TRAINING_POINT_INTERVAL_MS;
      const timeRemaining = nextPointTime - now;
      
      if (timeRemaining <= 0) return 'Available now!';
      
      const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
      const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
      
      return `${hours}h ${minutes}m`;
    }
    
    // Passive Skills System
    const PASSIVE_SKILLS = [
      { id: 'hp_boost', icon: '❤️', name: 'HP Boost', desc: '+10 Max HP per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.hp_boost = (saves.passiveSkills.hp_boost || 0) + 1; } },
      { id: 'dmg_boost', icon: '⚔️', name: 'Damage Boost', desc: '+5% Base Damage per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.dmg_boost = (saves.passiveSkills.dmg_boost || 0) + 1; } },
      { id: 'gold_bonus', icon: '💰', name: 'Gold Finder', desc: '+10% Gold per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.gold_bonus = (saves.passiveSkills.gold_bonus || 0) + 1; } },
      { id: 'xp_bonus', icon: '⭐', name: 'XP Boost', desc: '+10% XP per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.xp_bonus = (saves.passiveSkills.xp_bonus || 0) + 1; } },
      { id: 'regen_boost', icon: '🔄', name: 'Regeneration', desc: '+0.5 HP/sec per level', maxLevel: 5, cost: 3, apply: (saves) => { saves.passiveSkills.regen_boost = (saves.passiveSkills.regen_boost || 0) + 1; } },
      { id: 'speed_boost', icon: '💨', name: 'Swiftness', desc: '+5% Move Speed per level', maxLevel: 3, cost: 3, apply: (saves) => { saves.passiveSkills.speed_boost = (saves.passiveSkills.speed_boost || 0) + 1; } }
    ];
    
    function updatePassiveSkillsSection() {
      if (!saveData.passiveSkills) saveData.passiveSkills = {};
      if (!saveData.passiveSkillPoints) saveData.passiveSkillPoints = 0;
      
      const pointsEl = document.getElementById('passive-skill-points-display');
      if (pointsEl) pointsEl.textContent = saveData.passiveSkillPoints;
      
      const content = document.getElementById('camp-passive-content');
      if (!content) return;
      content.innerHTML = '';
      
      PASSIVE_SKILLS.forEach(skill => {
        const currentLevel = saveData.passiveSkills[skill.id] || 0;
        const isMax = currentLevel >= skill.maxLevel;
        const canAfford = saveData.passiveSkillPoints >= skill.cost;
        
        const card = document.createElement('div');
        card.style.cssText = `background:linear-gradient(to bottom,#2a3a2a,#1a2a1a);border:2px solid ${isMax ? '#FFD700' : '#4a6a4a'};border-radius:12px;padding:15px;`;
        card.innerHTML = `
          <div style="font-size:24px;margin-bottom:6px;">${skill.icon}</div>
          <div style="font-family:'Bangers',cursive;font-size:18px;color:${isMax ? '#FFD700' : '#90EE90'};letter-spacing:1px;">${skill.name}</div>
          <div style="font-size:13px;color:#aaa;margin:4px 0;">${skill.desc}</div>
          <div style="font-size:12px;color:#FFD700;margin:4px 0;">Level: ${currentLevel}/${skill.maxLevel}</div>
          ${!isMax ? `<button style="background:${canAfford ? '#2a6a2a' : '#3a3a3a'};color:${canAfford ? '#90EE90' : '#666'};border:1px solid ${canAfford ? '#4a9a4a' : '#555'};border-radius:6px;padding:6px 12px;cursor:${canAfford ? 'pointer' : 'default'};font-size:13px;margin-top:6px;" data-id="${skill.id}" data-cost="${skill.cost}">Unlock (${skill.cost} pts)</button>` : '<div style="color:#FFD700;font-size:13px;margin-top:6px;">✅ MAX LEVEL</div>'}
        `;
        
        const btn = card.querySelector('button');
        if (btn && canAfford) {
          btn.onclick = () => {
            if (saveData.passiveSkillPoints < skill.cost) return;
            saveData.passiveSkillPoints -= skill.cost;
            skill.apply(saveData);
            saveSaveData();
            updatePassiveSkillsSection();
            playSound('collect');
            showStatusMessage(`${skill.name} upgraded!`, 2000);
          };
        }
        
        content.appendChild(card);
      });
    }
    
    function updateTrainingSection() {
      updateTrainingPoints();
      
      const trainingPointsDisplay = document.getElementById('training-points-display');
      const nextPointTime = document.getElementById('next-training-point-time');
      const attributesContent = document.getElementById('training-attributes-content');
      
      trainingPointsDisplay.textContent = saveData.trainingPoints;
      nextPointTime.textContent = `Next training point in: ${getNextTrainingPointTime()}`;
      
      // Training cost scales: 100g for first point, +50g per point
      const TRAINING_ATTRIBUTES = {
        strength: {
          name: 'Strength',
          icon: '💪',
          description: 'Increases damage output',
          current: saveData.attributes.strength || 0,
          baseCost: 100
        },
        endurance: {
          name: 'Endurance',
          icon: '🏃',
          description: 'Increases stamina and high-speed duration',
          current: saveData.attributes.endurance || 0,
          baseCost: 100
        },
        flexibility: {
          name: 'Flexibility',
          icon: '🤸',
          description: 'Improves turn speed and dodge responsiveness',
          current: saveData.attributes.flexibility || 0,
          baseCost: 100
        }
      };
      
      attributesContent.innerHTML = '';
      
      for (const [attrId, attr] of Object.entries(TRAINING_ATTRIBUTES)) {
        const cost = attr.baseCost + (attr.current * 50);
        const canAfford = saveData.gold >= cost && saveData.trainingPoints >= 1;
        
        const attrCard = document.createElement('div');
        attrCard.style.cssText = `
          background: rgba(0,0,0,0.5);
          padding: 20px;
          border-radius: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          border: 2px solid ${canAfford ? '#FFD700' : '#555'};
          opacity: ${canAfford ? '1' : '0.6'};
        `;
        
        attrCard.innerHTML = `
          <div style="flex: 1;">
            <div style="font-size: 20px; margin-bottom: 5px;">${attr.icon} ${attr.name}</div>
            <div style="font-size: 14px; color: #AAA; margin-bottom: 10px;">${attr.description}</div>
            <div style="font-size: 16px; color: #5DADE2;">Current: ${attr.current}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 18px; color: #FFD700; margin-bottom: 5px;">${cost} gold</div>
            <div style="font-size: 14px; color: #AAA;">+ 1 Training Point</div>
            <button class="btn" style="margin-top: 10px; padding: 8px 16px;">TRAIN</button>
          </div>
        `;
        
        attrCard.onclick = () => {
          if (saveData.gold >= cost && saveData.trainingPoints >= 1) {
            saveData.gold -= cost;
            saveData.trainingPoints -= 1;
            
            // Initialize attributes if not present
            if (!saveData.attributes) saveData.attributes = {};
            if (!saveData.attributes[attrId]) saveData.attributes[attrId] = 0;
            
            saveData.attributes[attrId]++;
            saveSaveData();
            
            playSound('levelup');
            showStatusMessage(`${attr.name} increased to ${saveData.attributes[attrId]}!`, 2000);
            updateTrainingSection();
            updateGoldDisplays();
            
            // Track attribute purchase for "Upgrade an Attribute" quest
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest5_upgradeAttr') {
              progressTutorialQuest('quest5_upgradeAttr', true);
            }
            // Legacy: Track attribute purchase for tutorial quest
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3_buyProgression') {
              const totalAttrLevels = Object.values(saveData.attributes || {}).reduce((sum, val) => sum + val, 0);
              if (totalAttrLevels >= 1) {
                progressTutorialQuest('quest3_buyProgression', true);
              }
            }
          } else {
            playSound('invalid');
            if (saveData.trainingPoints < 1) {
              showStatusMessage('Not enough training points!', 2000);
            } else {
              showStatusMessage('Not enough gold!', 2000);
            }
          }
        };
        
        attributesContent.appendChild(attrCard);
      }
    }

    // --- TUTORIAL QUEST SYSTEM (8-Quest Flow) ---
    
    // Quest definitions with conditions for dependencies
    const TUTORIAL_QUESTS = {
      // === QUEST 1: Find A.I.D.A — Discover and insert the chip ===
      // Pre-activated at game start. After inserting chip, claim reward at Quest Hall.
      quest_findingAida: {
        id: 'quest_findingAida',
        name: 'Finding A.I.D.A',
        description: 'Visit the Quest Hall to read your first directive. Then find the glowing chip near the campfire, pick it up, and insert it into the broken robot.',
        objectives: 'Pick up the Aida Chip and insert it into the Broken Robot, then claim at Quest Hall',
        claim: 'Quest Hall',
        rewardGold: 50,
        rewardSkillPoints: 1,
        rewardAchievement: '1stStoryQuest',
        autoClaim: false,
        message: "🤖 <b>A.I.D.A Online!</b><br><br>The robot stirs to life and takes a lap around the fire.<br><br><i>A.I.D.A: 'Chip integration complete. Mission directives are now accessible. Follow my guidance.'</i><br><br>🎯 <b>NEXT:</b> Head out and fight — survive your first run and return.",
        nextQuest: 'firstRunDeath',
        conditions: []
      },

      // === QUEST 1b (legacy compatibility only — skipped in new flow) ===
      quest_buildQuesthall: {
        id: 'quest_buildQuesthall',
        name: 'Command Node Online',
        description: 'Quest Hall is already online. Proceed to your first run.',
        objectives: 'Quest Hall is ready',
        autoClaim: true,
        noRewardPopup: true,
        nextQuest: 'firstRunDeath',
        rewardGold: 0,
        rewardSkillPoints: 0,
        conditions: ['quest_findingAida']
      },

      // === QUEST 2: The Awakening — Complete your first run ===
      firstRunDeath: {
        id: 'firstRunDeath',
        name: "First Run",
        description: "A.I.D.A says: 'Let's go for your first run.' Head out, fight enemies, and return to camp. You will either die or survive — both count!",
        objectives: 'Complete a combat run and return to camp',
        claim: 'Quest Hall',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardFreeSpin: 1,
        unlockBuilding: 'accountBuilding',
        triggerOnDeath: true,
        message: "🏃 <b>First Run Complete!</b><br><br>🎰 <b>Daily Spin</b> and <b>Daily Rewards</b> are now unlocked!<br><br><i>A.I.D.A: 'Impressive. You survived contact. The spin wheel and daily rewards are now operational — use them to gain advantages.'</i><br><br>🎯 <b>NEXT:</b> Visit the Forge and craft all gathering tools.",
        nextQuest: 'quest_harvester',
        conditions: ['quest_findingAida']
      },

      // === STEP 3: The Harvester — Reach Level 3 ===
      quest_harvester: {
        id: 'quest_harvester',
        name: 'The Harvester',
        description: 'Reach Level 3 in a single run to unlock the Forge. You\'ll receive starter materials and gold to buy gathering tools!',
        objectives: 'Reach Level 3 in a single run',
        claim: 'Main Building',
        rewardGold: 50,
        rewardSkillPoints: 1,
        rewardResources: { wood: 30, stone: 30 },
        unlockBuilding: 'forge',
        triggerOnDeath: true,
        message: "🔨 <b>Fabrication Node Unlocked!</b><br><br>You received:<br>&nbsp;🪵 <b>30 Wood</b> · 🪨 <b>30 Stone</b><br>&nbsp;💰 <b>50 Gold</b><br><br><i>A.I.D.A: 'Resource gathering requires tools. Build the Forge and equip yourself.'</i><br><br>🎯 <b>NEXT:</b> Build the Forge, then buy gathering tools (1 Gold each)!",
        nextQuest: 'quest_craftAllTools',
        conditions: ['firstRunDeath']
      },

      // === QUEST 3: Craft ALL Gathering Tools ===
      quest_craftAllTools: {
        id: 'quest_craftAllTools',
        name: 'Gear Up: Gathering Tools',
        description: 'A.I.D.A guides you to the Forge. Craft ALL 6 gathering tools (Axe, Sledgehammer, Pickaxe, Magic Pickaxe, Hunting Knife, Foraging Scoop). Each costs just 1 Gold.',
        objectives: 'Buy all 6 gathering tools at the Forge',
        claim: 'Quest Hall',
        rewardGold: 50,
        rewardSkillPoints: 1,
        rewardResources: { wood: 5, stone: 5 },
        rewardAchievement: '1stTimeCrafter',
        triggerOnDeath: false,
        autoClaim: false,
        message: "🛠️ <b>Achievement: 1st Time Crafter!</b><br><br><i>A.I.D.A: 'Tools acquired. Now gather resources for a new building — the Songspire Tree. I need 2 Wood and 2 Stone.'</i><br><br>🎯 <b>NEXT:</b> Gather 2 Wood + 2 Stone during a run, then return to build the Skill Tree!",
        nextQuest: 'quest_buildSongspire',
        conditions: ['quest_harvester']
      },

      // === QUEST 4: Build the Songspire Tree ===
      quest_buildSongspire: {
        id: 'quest_buildSongspire',
        name: 'The Songspire Tree',
        description: "A.I.D.A: 'Gather 2 Wood and 2 Stone. We will build the Songspire — an ancient tree that grants power and wisdom.' Go on a run, gather the resources, and return to build the Skill Tree.",
        objectives: 'Gather 2 Wood + 2 Stone, then build the Skill Tree (Songspire)',
        claim: 'Quest Hall',
        rewardGold: 100,
        rewardSkillPoints: 2,
        rewardAchievement: 'Songspire',
        deductResources: { wood: 2, stone: 2 },
        unlockBuilding: 'skillTree',
        triggerOnDeath: true,
        message: "🌳 <b>The Songspire is Alive!</b><br><br>Achievement: <b>Songspire</b> unlocked!<br>You received <b>2 Skill Points</b>!<br><br><i>A.I.D.A: 'The Songspire channels the energy of this world. Use your Skill Points to grow stronger. The tree pulses with ancient power — it will guide you.'</i>",
        nextQuest: 'quest_firstBlood',
        conditions: ['quest_craftAllTools']
      },

      // === STEP 5: First Blood — Turn in 30 Wood and 30 Stone ===
      quest_firstBlood: {
        id: 'quest_firstBlood',
        name: 'First Blood',
        description: 'Gather and turn in 30 Wood and 30 Stone to unlock the Armory and Weapon Crafting at the Forge.',
        objectives: 'Have 30 Wood and 30 Stone (turned in on claim)',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        deductResources: { wood: 30, stone: 30 },
        unlockBuilding: 'armory',
        triggerOnDeath: true,
        message: "⚔️ <b>Armory</b> and <b>Weapon Crafting</b> Unlocked!<br><br><i>A.I.D.A: 'Survival requires weapons. Grow stronger. The lake\'s collective will not reclaim you while you are fragile.'</i><br><br>⚠️ <b>Note:</b> Before Prestige, you can only craft and equip <b>Common</b>, <b>Uncommon</b>, and <b>Rare</b> gear.",
        nextQuest: 'quest_gainingStats',
        conditions: ['quest_buildSongspire']
      },

      // === STEP 6: Gaining Stats — Defeat 300 enemies total ===
      quest_gainingStats: {
        id: 'quest_gainingStats',
        name: 'Gaining Stats',
        description: 'Defeat 300 enemies total across all your runs to unlock the Companion House.',
        objectives: 'Defeat 300 enemies total',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 2,
        unlockBuilding: 'companionHouse',
        triggerOnDeath: true,
        message: "🐺 <b>Companion House Unlocked!</b><br><br>You received <b>2 Skill Points</b>!<br><br><i>A.I.D.A: 'Good. Each enemy you dissolve feeds my understanding. Find a companion — you should not wander alone.'</i>",
        nextQuest: 'quest_eggHunt',
        conditions: ['quest_firstBlood']
      },

      // === STEP 6: The Egg Hunt — Reach Level 10 + defeat The Grey boss ===
      quest_eggHunt: {
        id: 'quest_eggHunt',
        name: 'The Egg Hunt',
        description: 'Defeat The Grey — an alien boss that appears in the new world. It guards a mysterious egg. Reach Level 10 and defeat it to claim the egg.',
        objectives: 'Reach Level 10 and defeat The Grey boss',
        claim: 'Main Building',
        rewardGold: 0,
        rewardSkillPoints: 0,
        triggerOnDeath: true,
        giveItem: { name: 'Mysterious Egg', type: 'quest', rarity: 'rare', description: 'A strange egg that pulses with warmth...' },
        message: "🥚 You found a <b>Mysterious Egg</b>! It's been added to your inventory.<br><br>🎯 <b>NEXT:</b> Bring the egg back to camp to see what hatches!",
        nextQuest: 'quest_newFriend',
        conditions: ['quest_gainingStats']
      },

      // === STEP 7: A New Friend — Bring egg to camp ===
      quest_newFriend: {
        id: 'quest_newFriend',
        name: 'A New Friend',
        description: 'Bring the Mysterious Egg back to camp. Something is stirring inside...',
        objectives: 'Return to camp with the Mysterious Egg',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        unlockBuilding: 'companionHouse',
        companionEgg: true,
        message: "🐣 The anomaly has incubated into a <b>Common Level 1 Companion Unit</b>!<br><br><b>Companion Node</b> is now online!<br><br><i>A.I.D.A: 'Interesting. The entity bonded to you. Alien DNA... or something older. It will grow. Monitor it carefully. Stonehenge next — the standing stones were erected to contain the dimensional rift. I need your eyes there.'</i>",
        nextQuest: 'quest_pushingLimits',
        conditions: ['quest_eggHunt']
      },

      // === STEP 8: Pushing the Limits — Defeat the First Boss ===
      quest_pushingLimits: {
        id: 'quest_pushingLimits',
        name: 'Pushing the Limits',
        description: 'Defeat the First Boss at Wave 10 to unlock Special Attacks and the Warehouse.',
        objectives: 'Defeat the First Boss (Wave 10)',
        claim: 'Main Building',
        rewardGold: 200,
        rewardSkillPoints: 2,
        unlockBuilding: 'specialAttacks',
        unlockBuildingExtra: 'warehouse',
        triggerOnDeath: true,
        message: "🏆 <b>Boss Entity Neutralised!</b><br><br><b>Special Combat Routines Arena</b> and <b>Warehouse</b> are now online!<br><br><i>A.I.D.A: 'The Tesla Tower is the final anomaly. Nikola stumbled upon the crash frequency in 1899. His tower was built to amplify it. When you reach it... you will understand everything. Trust me.'</i>",
        nextQuest: 'quest_shrineCalibrate',
        conditions: ['quest_newFriend']
      },

      // === LEGACY QUESTS (kept for backward compatibility with existing saves) ===
      questForge0_unlock: {
        id: 'questForge0_unlock',
        name: 'Unlock the Forge (Legacy)',
        description: 'Legacy quest — replaced by new progression chain.',
        objectives: 'Visit the Forge in Camp',
        autoClaim: false,
        claim: 'Main Building',
        rewardGold: 75,
        rewardSkillPoints: 1,
        rewardResources: { wood: 15, stone: 15 },
        unlockBuilding: 'forge',
        message: "🔨 Forge Unlocked! You received starter materials.",
        nextQuest: 'questForge0b_craftTools',
        conditions: ['firstRunDeath']
      },

      questForge0b_craftTools: {
        id: 'questForge0b_craftTools',
        name: 'Craft a Harvesting Tool (Legacy)',
        description: 'Legacy quest — replaced by new progression chain.',
        objectives: 'Buy any harvesting tool at the Forge',
        autoClaim: false,
        claim: 'Main Building',
        rewardGold: 50,
        rewardSkillPoints: 1,
        message: "🪓 Tool Acquired!",
        nextQuest: 'quest1_kill3',
        conditions: ['questForge0_unlock']
      },

      // === PHASE 1: Run quest → Unlock Skill Tree ===
      quest1_kill3: {
        id: 'quest1_kill3',
        name: 'Kill 3 Enemies',
        description: 'Start a new run and kill 3 enemies',
        objectives: 'Kill 3 enemies in one run',
        claim: 'Main Building',
        rewardGold: 50,
        rewardSkillPoints: 3,
        rewardResources: { wood: 8, stone: 8 },
        unlockBuilding: 'skillTree',
        message: "Outstanding, Droplet! 🎯<br><br>You've proven your combat worth. The <b>Skill Tree</b> is now unlocked at camp!<br><br>Head to the <b>Skill Tree</b> tab and spend your <b>3 Skill Points</b> to grow stronger.",
        nextQuest: 'quest2_spendSkills',
        conditionsAny: ['questForge0b_craftTools', 'questForge0_unlock', 'firstRunDeath']
      },

      // === PHASE 2: Camp quest → Use Skill Tree (free first use) ===
      quest2_spendSkills: {
        id: 'quest2_spendSkills',
        name: 'Buy 3 Skills',
        description: 'Go to the Skill Tree tab and unlock any three skills',
        objectives: 'Unlock any 3 skills in the Skill Tree tab',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardResources: { wood: 23, stone: 23 },
        message: "Skills unlocked! 🌟<br><br>You got extra building materials too — now walk up to any unlocked building plot and build it!<br><br>Head to <b>Stonehenge</b> on the map — a glowing chest awaits you there with your first piece of gear!",
        nextQuest: 'quest3_stonehengeGear',
        conditions: ['quest1_kill3']
      },

      // === PHASE 3: Run quest → Find gear at Stonehenge → Unlock Armory ===
      quest3_stonehengeGear: {
        id: 'quest3_stonehengeGear',
        name: 'Find the Cigar at Stonehenge',
        description: 'Head to Stonehenge on the map and collect the quest chest to get the legendary Cigar',
        objectives: 'Find and collect the chest at Stonehenge',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 2,
        unlockBuildingOnActivation: 'armory',
        unlockBuilding: 'specialAttacks',
        rewardSAP: 2,
        giveItem: { id: 'cigar_quest', name: 'Cigar', type: 'ring', rarity: 'rare', stats: { attackSpeed: 1, movementSpeed: 1, attackPrecision: 1 }, description: '+1 Attack Speed, +1 Movement Speed, +1 Attack Precision' },
        message: "🚬 Cigar acquired!<br><br>This rare ring grants <b>+1 Attack Speed, +1 Movement Speed, +1 Attack Precision</b>.<br><br>The <b>Special Attacks</b> building is now unlocked! Visit it and choose your first special attack!",
        nextQuest: 'quest3b_useSpecialAttacks',
        conditions: ['quest2_spendSkills']
      },

      // === PHASE 3b: Camp quest → Use Special Attacks building (first use) ===
      quest3b_useSpecialAttacks: {
        id: 'quest3b_useSpecialAttacks',
        name: 'Choose a Special Attack',
        description: 'Visit the Special Attacks building and equip your first special attack to unleash powerful abilities in combat!',
        objectives: 'Open the Special Attacks building and equip a special attack',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardSAP: 1,
        message: "⚡ Special Attack equipped!<br><br>Use it in battle to devastate your enemies!<br><br>Now head to the <b>Armory</b> and equip the <b>Cigar</b> you found at Stonehenge!",
        nextQuest: 'quest4_equipCigar',
        conditions: ['quest3_stonehengeGear']
      },

      // === PHASE 4: Camp quest → Equip gear (free first use of Armory) ===
      quest4_equipCigar: {
        id: 'quest4_equipCigar',
        name: 'Equip the Cigar',
        description: 'Open the Armory, navigate to the Gear section in your inventory, and equip the Cigar',
        objectives: 'Equip the Cigar from your inventory',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 2,
        message: "Cigar equipped! 🚬<br><br>Feel that power — +1 to all stats!<br><br>You've unlocked the <b>Training Hall</b> — a free Attribute Point awaits you there!",
        nextQuest: 'quest5_upgradeAttr',
        conditions: ['quest3_stonehengeGear']
      },

      // === PHASE 5: Camp quest → Use Training Hall (free first use) → Unlock Training Hall ===
      quest5_upgradeAttr: {
        id: 'quest5_upgradeAttr',
        name: 'Upgrade an Attribute',
        description: 'Open the Training Hall and spend the attribute point you received to upgrade any stat',
        objectives: 'Spend 1 attribute point in the Training Hall',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 3,
        unlockBuildingOnActivation: 'trainingHall',
        unlockBuilding: 'achievementBuilding',
        message: "💪 Attribute upgraded!<br><br>You earned <b>+3 free Attribute Points</b> and <b>+1 Skill Point</b>!<br><br>The <b>Achievement Building</b> is now unlocked — visit it to claim badges!",
        nextQuest: 'quest6_survive2min',
        conditions: ['quest4_equipCigar']
      },

      // === PHASE 6: Run quest → Survive 2 minutes (Forge already unlocked earlier) ===
      quest6_survive2min: {
        id: 'quest6_survive2min',
        name: 'Survive 2 Minutes',
        description: 'Head out on a run and survive for at least 2 minutes',
        objectives: 'Survive 120 seconds in a run',
        claim: 'Main Building',
        triggerOnDeath: true,
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 2,
        message: "⏱️ You survived 2 minutes!<br><br>Great endurance! The <b>Progression Upgrades</b> are now available at the Forge! Buy your first upgrade there.",
        nextQuest: 'quest7_buyProgression',
        conditions: ['quest5_upgradeAttr']
      },

      // === PHASE 7: Camp quest → Use Forge/Progression Shop (free first use) ===
      quest7_buyProgression: {
        id: 'quest7_buyProgression',
        name: 'Buy a Progression Upgrade',
        description: 'Open the Progression Upgrades building and buy any upgrade',
        objectives: 'Purchase any progression upgrade',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 1,
        unlockBuilding: 'warehouse',
        message: "⚒️ Upgrade purchased!<br><br>Each upgrade makes you permanently stronger!<br><br>The <b>Warehouse</b> is now unlocked — visit it to store and manage your resources!",
        nextQuest: 'quest7b_useWarehouse',
        conditions: ['quest6_survive2min']
      },

      // === PHASE 7b: Camp quest → Use Warehouse (first use) ===
      quest7b_useWarehouse: {
        id: 'quest7b_useWarehouse',
        name: 'Visit the Warehouse',
        description: 'Open the Warehouse building to view your resource storage and manage your materials.',
        objectives: 'Open the Warehouse in Camp',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        message: "🏪 Warehouse visited!<br><br>You can now manage all your materials and resources from here.<br><br>Time to prove your might — head out and kill <b>10 enemies</b> in one run!",
        nextQuest: 'quest8_kill10',
        conditions: ['quest7_buyProgression']
      },

      // === PHASE 8: Run quest → Kill 10 enemies → Unlock Companion House ===
      quest8_kill10: {
        id: 'quest8_kill10',
        name: 'Kill 10 Enemies',
        description: 'Head out and eliminate 10 enemies in a single run',
        objectives: 'Kill 10 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 200,
        rewardSkillPoints: 1,
        unlockBuilding: 'companionHouse',
        companionEgg: true,
        message: "⚔️ 10 Enemies Defeated!<br><br>A <b>Grey Alien 👽 Egg</b> has appeared! The <b>Companion House</b> is now unlocked. Visit it to hatch and activate your alien companion!",
        nextQuest: 'quest9_activateCompanion',
        conditions: ['quest7_buyProgression']
      },

      // === PHASE 9: Camp quest → Use Companion House (free first use) ===
      quest9_activateCompanion: {
        id: 'quest9_activateCompanion',
        name: 'Activate Your Companion',
        description: 'Visit the Companion House and activate your Grey Alien companion 👽 to fight by your side',
        objectives: 'Activate a companion',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 1,
        rewardAttributePoints: 1,
        unlockBuilding: 'shop',
        message: "👽 Alien Companion activated!<br><br>Your Grey Alien will fight by your side with energy bolts!<br><br>The <b>Shop</b> is now open — buy powerful items!<br><br>Visit the <b>Tavern</b> to check out expeditions and rest options!",
        nextQuest: 'quest9b_visitTavern',
        conditions: ['quest8_kill10']
      },

      // === PHASE 9b: Camp quest → Visit the Tavern (first use) ===
      quest9b_visitTavern: {
        id: 'quest9b_visitTavern',
        name: 'Visit the Tavern',
        description: 'Head to the Tavern in camp. Check out the expedition board and rest options for bonus buffs!',
        objectives: 'Open the Tavern in Camp',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 1,
        message: "🍺 Tavern visited!<br><br>Use the Tavern to send companions on expeditions and rest for buffs!<br><br>Now go on a run and kill <b>15 enemies</b> to prove your combined strength!",
        nextQuest: 'quest10_kill15',
        conditions: ['quest9_activateCompanion']
      },

      // === PHASE 10: Run quest → Kill 15 enemies → Unlock Prestige Altar ===
      quest10_kill15: {
        id: 'quest10_kill15',
        name: 'Kill 15 Enemies',
        description: 'Head out and eliminate 15 enemies in a single run',
        objectives: 'Kill 15 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 300,
        rewardSkillPoints: 2,
        unlockBuilding: 'prestige',
        message: "🎉 15 Kills! Well done!<br><br>The <b>Prestige Altar</b> has awakened! Visit it to view your prestige options!",
        nextQuest: 'quest10b_usePrestige',
        conditions: ['quest9b_visitTavern']
      },

      // === PHASE 10b: Camp quest → Visit Prestige Altar (first use) ===
      quest10b_usePrestige: {
        id: 'quest10b_usePrestige',
        name: 'Visit the Prestige Altar',
        description: 'Head to the Prestige Altar in camp and view your prestige options. Prestige lets you reset for powerful permanent bonuses!',
        objectives: 'Open the Prestige Altar in Camp',
        claim: 'Main Building',
        rewardGold: 200,
        rewardSkillPoints: 1,
        message: "✨ Prestige Altar visited!<br><br>When you're ready, prestige to reset your progress in exchange for powerful permanent bonuses!<br><br>Explore the world — find every landmark (Stonehenge, Pyramid, Montana, Tesla Tower)!",
        nextQuest: 'quest11_findAllLandmarks',
        conditions: ['quest10_kill15']
      },

      // === PHASE 11: Run quest → Find all landmarks → Unlock Achievement Building ===
      quest11_findAllLandmarks: {
        id: 'quest11_findAllLandmarks',
        name: 'Find Every Landmark',
        description: 'Explore the map and find every landmark: Stonehenge, Pyramid, Montana, and the Tesla Tower',
        objectives: 'Find: Stonehenge ☐  Pyramid ☐  Montana ☐  Tesla Tower ☐',
        triggerOnDeath: false,
        rewardGold: 750,
        rewardSkillPoints: 3,
        rewardAttributePoints: 2,
        unlockBuilding: 'achievementBuilding',
        message: "🗺️ ALL LANDMARKS FOUND!<br><br>You've explored the entire world!<br><br>The <b>Achievement Building</b> is now unlocked in Camp. Visit it to claim your achievements!",
        nextQuest: 'quest12_visitAchievements',
        conditions: ['quest10b_usePrestige']
      },

      // === PHASE 12: Camp quest → Visit Achievement Building (free first use) ===
      quest12_visitAchievements: {
        id: 'quest12_visitAchievements',
        name: 'Visit the Achievement Building',
        description: 'Head to Camp and visit the newly unlocked Achievement Building',
        objectives: 'Open the Achievement Building in Camp',
        claim: 'Achievement Building',
        rewardGold: 300,
        rewardSkillPoints: 2,
        message: "🏆 Achievement Hall visited!<br><br>Now head to the <b>Windmill</b> on the map and talk to the farmer — a special challenge awaits!",
        nextQuest: 'quest13_windmill',
        conditions: ['quest11_findAllLandmarks']
      },

      // === PHASE 13: Run quest → Defend Windmill ===
      quest13_windmill: {
        id: 'quest13_windmill',
        name: 'Defend the Windmill',
        description: 'Find the Windmill on the map and talk to the farmer. Defend the windmill for 15 seconds to earn a special run reward!',
        objectives: 'Find the Windmill and defend it for the farmer',
        claim: 'Quest Hall',
        rewardGold: 400,
        rewardSkillPoints: 2,
        triggerOnDeath: false,
        message: "🏆 WINDMILL DEFENDED!<br><br>The farmer is grateful! Each run, if you defend the windmill you'll earn a <b>temporary Double Barrel Gun</b>.<br><br>Next: kill <b>25 enemies</b> to prove your strength!",
        nextQuest: 'quest14_kill25',
        conditions: ['quest12_visitAchievements']
      },

      // === PHASE 14: Run quest → Kill 25 enemies ===
      quest14_kill25: {
        id: 'quest14_kill25',
        name: 'Kill 25 Enemies',
        description: 'Head out and eliminate 25 enemies in a single run',
        objectives: 'Kill 25 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 500,
        rewardSkillPoints: 2,
        rewardAttributePoints: 2,
        message: "💪 25 Kills! You're a true survivor!<br><br>Head to the <b>Profile Building</b> in camp to review your progress and stats!",
        nextQuest: 'quest15_accountVisit',
        conditions: ['quest13_windmill']
      },

      // === PHASE 15: Camp quest → Check Profile stats ===
      quest15_accountVisit: {
        id: 'quest15_accountVisit',
        name: 'Check Your Profile Stats',
        description: 'Visit the Profile & Records building in camp to see your full stats and progression',
        objectives: 'Open the Profile building in Camp',
        claim: 'Profile Building',
        autoClaim: true,
        rewardGold: 200,
        rewardSkillPoints: 1,
        rewardAttributePoints: 3,
        message: "📊 Profile reviewed!<br><br><i>A.I.D.A: 'Your data is... impressive. Keep growing stronger. The lake is patient — but I am not.'</i><br><br>Time for a combat challenge — head out and kill <b>12 enemies</b> in one run!",
        nextQuest: 'quest15b_runKill12',
        conditions: ['quest14_kill25']
      },

      // === PHASE 15b: Run quest → Kill 12 enemies (alternation between camp quests) ===
      quest15b_runKill12: {
        id: 'quest15b_runKill12',
        name: 'Kill 12 Enemies',
        description: 'Head out on a run and kill 12 enemies to keep your skills sharp!',
        objectives: 'Kill 12 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 300,
        rewardSkillPoints: 2,
        rewardAttributePoints: 1,
        message: "⚔️ 12 Kills! Nicely done!<br><br>A new building has appeared — the <b>Character Visuals</b> studio! Visit it to customize your look.",
        nextQuest: 'quest16_visitCharVisuals',
        conditions: ['quest15_accountVisit']
      },

      // === PHASE 16: Camp quest → Visit Character Visuals building ===
      quest16_visitCharVisuals: {
        id: 'quest16_visitCharVisuals',
        name: 'Visit Character Visuals',
        description: 'Head to Camp and open the Character Visuals building to customize your appearance',
        objectives: 'Open the Character Visuals building in Camp',
        claim: 'Main Building',
        rewardGold: 200,
        rewardSkillPoints: 1,
        unlockBuilding: 'characterVisuals',
        message: "🎨 Character Visuals unlocked!<br><br>Customize your look with accessories, animations, and outfits!<br><br>Next: open the <b>Codex</b> to learn about all the creatures and landmarks you've encountered!",
        nextQuest: 'quest17_visitCodex',
        conditions: ['quest15b_runKill12']
      },

      // === PHASE 17: Camp quest → Visit Codex building ===
      quest17_visitCodex: {
        id: 'quest17_visitCodex',
        name: 'Visit the Codex',
        description: 'Head to Camp and open the Codex building to browse the encyclopedia of the world',
        objectives: 'Open the Codex building in Camp',
        claim: 'Main Building',
        rewardGold: 300,
        rewardSkillPoints: 2,
        unlockBuilding: 'codex',
        message: "📖 Codex unlocked!<br><br>Browse all enemies, structures, and landmarks.<br><br>A strange signal was detected from the <b>Sci-Fi Region</b>... Head to <b>Area 51</b> on the map to investigate!",
        nextQuest: 'quest18_findCompanionEgg',
        conditions: ['quest16_visitCharVisuals']
      },

      // === PHASE 18: Run quest → Find Companion Egg at UFO sight in Area 51 ===
      quest18_findCompanionEgg: {
        id: 'quest18_findCompanionEgg',
        name: 'Find the Alien Egg',
        description: 'A mysterious signal leads to the UFO crash site in Area 51. Find the glowing Alien Egg 👽 hidden near the wreckage!',
        objectives: 'Find the Alien Egg at the UFO crash site in Area 51',
        claim: 'Main Building',
        rewardGold: 500,
        rewardSkillPoints: 3,
        rewardAttributePoints: 2,
        triggerOnDeath: false,
        questObjectivePos: { x: -32, z: 25 }, // OPTIMIZED: Updated for ultra-compact 80x80 map (was -50, 25; before -90, 40)
        message: "🥚 ALIEN EGG FOUND!<br><br>You discovered a mysterious alien egg 👽 at the UFO crash site! Take it to the <b>Companion House</b> in camp to hatch it!",
        nextQuest: 'quest19_hatchEgg',
        conditions: ['quest17_visitCodex']
      },

      // === PHASE 19: Camp quest → Place egg in Companion House and hatch it ===
      quest19_hatchEgg: {
        id: 'quest19_hatchEgg',
        name: 'Hatch the Alien Egg',
        description: 'Bring the Alien Egg to the Companion House and place it in the incubator to hatch your new alien companion!',
        objectives: 'Place and hatch the alien egg in the Companion House',
        claim: 'Companion House',
        rewardGold: 600,
        rewardSkillPoints: 3,
        rewardAttributePoints: 3,
        message: "🐣 ALIEN HATCHED!<br><br>A tiny newborn Grey Alien 👽 has emerged from the egg!<br><br>Take your <b>newborn alien companion</b> on a run and survive <b>60 seconds</b> together to help it grow into a juvenile!",
        nextQuest: 'quest19b_growJuvenile',
        conditions: ['quest18_findCompanionEgg']
      },

      // === PHASE 19b: Run quest → Grow companion from newborn to juvenile ===
      quest19b_growJuvenile: {
        id: 'quest19b_growJuvenile',
        name: 'Grow Your Companion — Juvenile',
        description: 'Your newborn companion needs field experience! Take it on a run and survive 60 seconds together so it can grow into a juvenile.',
        objectives: 'Survive 60 seconds with your newborn companion',
        triggerOnDeath: true,
        rewardGold: 400,
        rewardSkillPoints: 2,
        rewardAttributePoints: 1,
        companionGrowth: 'juvenile',
        message: "🐾 ALIEN GREW!<br><br>Your alien companion has grown into a <b>juvenile</b>! It's bigger, faster, and fires stronger energy bolts!<br><br>Take it on another run and kill <b>8 enemies</b> together to reach <b>adult</b> stage!",
        nextQuest: 'quest19c_growAdult',
        conditions: ['quest19_hatchEgg']
      },

      // === PHASE 19c: Run quest → Grow companion from juvenile to adult ===
      quest19c_growAdult: {
        id: 'quest19c_growAdult',
        name: 'Grow Your Companion — Adult',
        description: 'Your juvenile companion is almost fully grown! Take it on a run and kill 8 enemies together to reach adult form.',
        objectives: 'Kill 8 enemies with your juvenile companion',
        triggerOnDeath: true,
        rewardGold: 500,
        rewardSkillPoints: 3,
        rewardAttributePoints: 2,
        companionGrowth: 'adult',
        message: "👽 ALIEN FULLY GROWN!<br><br>Your alien companion has reached <b>adult</b> form! Full size, full power!<br><br>Train it in the <b>Companion House</b> to unlock powerful abilities!",
        nextQuest: 'quest20_trainCompanion',
        conditions: ['quest19b_growJuvenile']
      },

      // === PHASE 20: Camp quest → Train companion (level it up once) ===
      quest20_trainCompanion: {
        id: 'quest20_trainCompanion',
        name: 'Train Your Companion',
        description: 'Take your companion on a run to earn XP and level it up. Then visit the Companion House to unlock a skill!',
        objectives: 'Level up your companion and unlock a skill',
        claim: 'Companion House',
        rewardGold: 400,
        rewardSkillPoints: 2,
        rewardAttributePoints: 2,
        message: "⚔️ Companion trained!<br><br>Your companion grows stronger with every battle!<br><br>📖 Head to the <b>Codex</b> sign near the campfire to explore the world encyclopedia!",
        nextQuest: 'quest21_useCampBoard',
        conditions: ['quest19c_growAdult']
      },

      // === PHASE 21: Visit the Codex (from previous unlock at quest17) ===
      quest21_useCampBoard: {
        id: 'quest21_useCampBoard',
        name: 'Explore the Codex',
        description: 'The Codex near the campfire holds lore, enemy info, and rewards. Open it and claim your first EXP!',
        objectives: 'Open the Codex and claim EXP from an entry',
        claim: 'Quest Hall',
        rewardGold: 500,
        rewardSkillPoints: 3,
        rewardAttributePoints: 3,
        message: "📖 CODEX EXPLORED!<br><br>Keep discovering new enemies and landmarks to unlock more Codex entries!<br><br>⛏️ <b>NEXT:</b> Visit the Store and buy your first Harvesting Tool to gather resources from the world!",
        nextQuest: 'quest22_buyFirstTool',
        conditions: ['quest20_trainCompanion']
      },

      // === HARVESTING QUESTLINE ===

      // === PHASE 22: Buy first harvesting tool from Store ===
      quest22_buyFirstTool: {
        id: 'quest22_buyFirstTool',
        name: 'Buy a Harvesting Tool',
        description: 'Visit the Store in camp and purchase your first harvesting tool (Axe, Sledgehammer, Pickaxe, or Essence Rod).',
        objectives: 'Buy any harvesting tool from the Store',
        claim: 'Main Building',
        rewardGold: 400,
        rewardSkillPoints: 2,
        message: "🪓 Tool acquired!<br><br>You now have a harvesting tool!<br><br>🌍 Head out on a run and use it on resource nodes — look for <b>🪨 rocks, 🌲 trees, ⚙️ iron deposits, and ✨ magic nodes</b> scattered across the map!",
        nextQuest: 'quest23_harvestFirst',
        conditions: ['quest21_useCampBoard']
      },

      // === PHASE 23: Harvest first resource node ===
      quest23_harvestFirst: {
        id: 'quest23_harvestFirst',
        name: 'Harvest a Resource',
        description: 'Approach a resource node on the map and stand near it to harvest it with your equipped tool.',
        objectives: 'Harvest any 1 resource node',
        triggerOnDeath: false,
        rewardGold: 300,
        rewardSkillPoints: 2,
        message: "⛏️ First harvest complete!<br><br>You gathered your first resource!<br><br>💎 Now try harvesting <b>5 Wood</b> and <b>5 Stone</b> to unlock the Forge crafting system!",
        nextQuest: 'quest24_harvestWoodStone',
        conditions: ['quest22_buyFirstTool']
      },

      // === PHASE 24: Gather wood and stone ===
      quest24_harvestWoodStone: {
        id: 'quest24_harvestWoodStone',
        name: 'Gather Wood & Stone',
        description: 'Harvest trees (wood) with your Axe and rocks (stone) with your Sledgehammer.',
        objectives: 'Collect 5 Wood and 5 Stone',
        triggerOnDeath: false,
        rewardGold: 600,
        rewardSkillPoints: 3,
        message: "🌲🪨 Materials gathered!<br><br>Excellent work gathering resources!<br><br>⚒️ Visit the <b>Forge</b> to smelt your materials and craft an <b>Epic tool</b>!",
        nextQuest: 'quest25_useForge',
        conditions: ['quest23_harvestFirst']
      },

      // === PHASE 25: Use the Forge to craft an Epic tool ===
      quest25_useForge: {
        id: 'quest25_useForge',
        name: 'Forge an Epic Tool',
        description: 'Open the Forge building in camp and upgrade one of your harvesting tools to Epic rarity.',
        objectives: 'Craft any Epic harvesting tool in the Forge',
        claim: 'Forge',
        rewardGold: 1000,
        rewardSkillPoints: 5,
        rewardAttributePoints: 3,
        message: "⚒️ EPIC TOOL CRAFTED!<br><br>Your Epic tool harvests <b>2.5× more resources</b> from each node!<br><br>⚔️ Time to push your limits — kill <b>20 enemies</b> in one run to unlock the <b>Trash & Recycle</b> building!",
        nextQuest: 'quest26_kill20',
        conditions: ['quest24_harvestWoodStone']
      },

      // === PHASE 26: Run quest → Kill 20 enemies → Unlock Trash & Recycle ===
      quest26_kill20: {
        id: 'quest26_kill20',
        name: 'Kill 20 Enemies',
        description: 'Head out and eliminate 20 enemies in a single run to prove you are ready for recycling gear.',
        objectives: 'Kill 20 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 400,
        rewardSkillPoints: 2,
        rewardAttributePoints: 2,
        unlockBuilding: 'trashRecycle',
        message: "⚔️ 20 Kills!<br><br>The <b>Trash & Recycle</b> building is now unlocked! Visit it to scrap old gear into materials and fuse gear for better stats.",
        nextQuest: 'quest27_useRecycle',
        conditions: ['quest25_useForge']
      },

      // === PHASE 27: Camp quest → Visit Trash & Recycle building ===
      quest27_useRecycle: {
        id: 'quest27_useRecycle',
        name: 'Visit Trash & Recycle',
        description: 'Open the Trash & Recycle building in camp to see how to scrap and fuse gear.',
        objectives: 'Open the Trash & Recycle building in Camp',
        claim: 'Main Building',
        rewardGold: 300,
        rewardSkillPoints: 2,
        message: "♻️ Recycling unlocked!<br><br>Scrap unwanted gear into materials and fuse items for better stats!<br><br>⏱️ Survive <b>3 minutes</b> in your next run to unlock the <b>Temporary Items Shop</b>!",
        nextQuest: 'quest28_survive3min',
        conditions: ['quest26_kill20']
      },

      // === PHASE 28: Run quest → Survive 3 minutes → Unlock Temp Shop ===
      quest28_survive3min: {
        id: 'quest28_survive3min',
        name: 'Survive 3 Minutes',
        description: 'Head out on a run and survive for at least 3 minutes to unlock temporary power-ups.',
        objectives: 'Survive 180 seconds in a run',
        triggerOnDeath: true,
        rewardGold: 500,
        rewardSkillPoints: 3,
        rewardAttributePoints: 2,
        unlockBuilding: 'tempShop',
        message: "⏱️ 3 Minutes survived!<br><br>The <b>Temporary Items Shop</b> is now unlocked! Buy one-run power-ups and consumables before each run.",
        nextQuest: 'quest29_useTempShop',
        conditions: ['quest27_useRecycle']
      },

      // === PHASE 29: Camp quest → Visit Temp Shop building ===
      quest29_useTempShop: {
        id: 'quest29_useTempShop',
        name: 'Visit the Temp Shop',
        description: 'Open the Temporary Items Shop in camp to browse power-ups and consumables.',
        objectives: 'Open the Temporary Items Shop in Camp',
        claim: 'Main Building',
        rewardGold: 400,
        rewardSkillPoints: 3,
        rewardAttributePoints: 2,
        message: "🏪 Temp Shop explored!<br><br>Buy temporary boosts before each run!<br><br>🍳 A <b>Campfire Kitchen</b> is now available! Cook meals from harvested ingredients!",
        nextQuest: 'quest30_buildCampfire',
        conditions: ['quest28_survive3min']
      },

      // === PHASE 30: Camp quest → Build Campfire Kitchen ===
      quest30_buildCampfire: {
        id: 'quest30_buildCampfire',
        name: 'Cook Your First Meal',
        description: 'Visit the Campfire Kitchen in camp and cook a meal from your harvested berries, meat, or vegetables!',
        objectives: 'Cook any meal at the Campfire Kitchen',
        claim: 'Main Building',
        unlockBuilding: 'campfireKitchen',
        rewardGold: 300,
        rewardSkillPoints: 2,
        rewardAttributePoints: 1,
        message: "🍲 First meal cooked!<br><br>Cook meals from berries, meat, vegetables and flowers for healing and buff effects!<br><br>⚒️ A <b>Weaponsmith</b> building has appeared — craft powerful weapons!",
        nextQuest: 'quest31_buildWeaponsmith',
        conditions: ['quest29_useTempShop']
      },

      // === PHASE 31: Camp quest → Build Weaponsmith ===
      quest31_buildWeaponsmith: {
        id: 'quest31_buildWeaponsmith',
        name: 'Craft a Weapon',
        description: 'Visit the Weaponsmith and craft your first weapon from resources you\'ve gathered!',
        objectives: 'Craft any weapon at the Weaponsmith',
        claim: 'Main Building',
        unlockBuilding: 'weaponsmith',
        rewardGold: 400,
        rewardSkillPoints: 2,
        rewardAttributePoints: 1,
        message: "⚔️ First weapon crafted!<br><br>Craft weapons with unique stats and elemental effects!<br><br>🔫 Craft a <b>Tranquilizer Rifle</b> to capture wild animals — you'll need it to breed wolves!",
        nextQuest: 'quest32_craftTranquilizer',
        conditions: ['quest30_buildCampfire']
      },

      // === PHASE 32: Craft Tranquilizer Rifle ===
      quest32_craftTranquilizer: {
        id: 'quest32_craftTranquilizer',
        name: 'Craft a Tranquilizer Rifle',
        description: 'Craft the Tranquilizer Rifle at the Weaponsmith. You\'ll need 10 Iron, 5 Wood, and 2 Crystal.',
        objectives: 'Craft the Tranquilizer Rifle at the Weaponsmith',
        claim: 'Main Building',
        rewardGold: 500,
        rewardSkillPoints: 3,
        giveItem: { id: 'tranquilizerRifle', name: 'Tranquilizer Rifle', type: 'weapon', rarity: 'rare', stats: { damage: 0, range: 15 }, description: 'Non-lethal rifle for capturing wild animals' },
        message: "🔫 Tranquilizer Rifle crafted!<br><br>Use it to capture wildlife on the map!<br><br>🐺 Find a <b>male</b> and <b>female wolf</b> roaming the forest region and tranquilize them both to start breeding!",
        nextQuest: 'quest33_captureWolves',
        conditions: ['quest31_buildWeaponsmith']
      },

      // === PHASE 33: Capture wild wolves for breeding ===
      quest33_captureWolves: {
        id: 'quest33_captureWolves',
        name: 'Capture Two Wolves',
        description: 'Find and tranquilize one male (♂) and one female (♀) wolf in the forest region. Walk near wolves with the Tranquilizer Rifle equipped to capture them.',
        objectives: 'Capture 1 male wolf and 1 female wolf',
        triggerOnDeath: true,
        rewardGold: 600,
        rewardSkillPoints: 3,
        rewardAttributePoints: 2,
        message: "🐺🐺 Both wolves captured!<br><br>Bring them to the <b>Companion House</b> to start the breeding process!",
        nextQuest: 'quest34_breedWolf',
        conditions: ['quest32_craftTranquilizer']
      },

      // === PHASE 34: Breed wolves to get Storm Wolf companion ===
      quest34_breedWolf: {
        id: 'quest34_breedWolf',
        name: 'Breed the Storm Wolf',
        description: 'Visit the Companion House and start the wolf breeding process. The male and female wolf will produce a Storm Wolf pup!',
        objectives: 'Breed wolves in the Companion House',
        claim: 'Companion House',
        rewardGold: 800,
        rewardSkillPoints: 4,
        rewardAttributePoints: 3,
        unlockCompanion: 'stormWolf',
        message: "🐺⚡ STORM WOLF BRED!<br><br>A <b>Storm Wolf</b> pup has been born from your captured wolves! It's a powerful melee companion!<br><br>Visit the Companion House to switch between your Grey Alien 👽 and Storm Wolf 🐺!<br><br>🔥 <b>All buildings are now unlocked!</b> Keep exploring, upgrading, and conquering the world!",
        nextQuest: 'quest35_crystallizedTear',
        conditions: ['quest33_captureWolves']
      },

      // === LATE GAME: The Crystallized Tear — unlocks Prism Reliquary ===
      quest35_crystallizedTear: {
        id: 'quest35_crystallizedTear',
        name: 'The Crystallized Tear',
        description: 'Your liquid form is rejecting the alien metal. To survive, you must synthesise their power. Collect 5 of any raw gems from enemy drops.',
        objectives: 'Collect 5 raw gems (any type) from enemy drops or chests',
        claim: 'Quest Hall',
        rewardGold: 500,
        rewardSkillPoints: 3,
        rewardRawGems: { ruby: 2, sapphire: 2 },
        unlockBuilding: 'prismReliquary',
        triggerOnDeath: true,
        message: "💎 <b>Prism Reliquary Unlocked!</b><br><br><i>A.I.D.A: 'Your liquid form is rejecting the alien metal. To survive, you must synthesise their power. The Prism Reliquary will let you cut and slot gems into your weapons and companions — fusing crystalline frequency into your very structure.'</i><br><br>Visit the <b>Prism Reliquary</b> in camp to begin slotting Cut Gems!",
        nextQuest: 'quest36_blackMarket',
        conditions: ['quest34_breedWolf']
      },

      // === LATE GAME: The Black Market — unlocks advanced Store chests AND Camp Board ===
      quest36_blackMarket: {
        id: 'quest36_blackMarket',
        name: 'The Black Market',
        description: 'The Greys left supply caches scattered across the battlefield. Use their extracted essence — raw gems — to buy them back. Open 3 chests at the Shop.',
        objectives: 'Open 3 chests at the Shop (any tier)',
        claim: 'Quest Hall',
        rewardGold: 600,
        rewardSkillPoints: 3,
        rewardRawGems: { emerald: 3 },
        unlockBuilding: 'campBoard',
        triggerOnDeath: true,
        message: "🛒 <b>Advanced Chests Unlocked at the Shop!</b><br><br><i>A.I.D.A: 'The Greys left supply caches. Use their extracted essence to buy them back. The void gems inside are not mere currency — they are condensed alien consciousness. Handle with extreme care.'</i><br><br>The <b>Epic</b> and <b>Legendary</b> chest tiers are now available at the Shop!<br><br>📋 The <b>Camp Board</b> has also appeared — use it for instant access to ALL camp features from one spot!",
        nextQuest: 'quest_annunaki1',
        conditions: ['quest35_crystallizedTear']
      },

      // === ANNUNAKI ARC: Three late-game dark psychological quests ===
      quest_annunaki1: {
        id: 'quest_annunaki1',
        name: 'Echoes of the Architects',
        description: 'The Annunaki were here long before the Greys. Their signal pulses through your crystallised form, mocking your inability to dissolve. You are hard water now. Ice that cannot freeze. Flesh that cannot bleed. Defeat 100 enemies in a single run.',
        objectives: 'Defeat 100 enemies in one run',
        claim: 'Quest Hall',
        rewardGold: 1000,
        rewardSkillPoints: 5,
        rewardAttributePoints: 2,
        triggerOnDeath: true,
        message: "👁️ <b>The Architects Acknowledge You.</b><br><br><i>A.I.D.A: 'They built the pyramids as resonance anchors. They built Stonehenge as a dimensional lock. They built YOU as an accident — a water droplet that refused to evaporate. The Annunaki are not impressed. But they are... watching.'</i><br><br>The void grows heavier. Something is listening.",
        nextQuest: 'quest_annunaki2',
        conditions: ['quest36_blackMarket']
      },

      quest_annunaki2: {
        id: 'quest_annunaki2',
        name: 'Suffer the Chests',
        description: 'Seek the Mythic Void Gem. Open chests. Open the boxes. The Annunaki say your suffering is the price of crystallisation. Open 10 chests total at the Shop.',
        objectives: 'Open 10 chests total at the Shop',
        claim: 'Quest Hall',
        rewardGold: 1200,
        rewardSkillPoints: 5,
        rewardRawGems: { void: 1 },
        triggerOnDeath: true,
        message: "🌑 <b>A Void Gem Fragment.</b><br><br><i>A.I.D.A: 'Do you hear it? The frequency beneath the frequency? The Annunaki did not leave this dimension — they compressed themselves into the void gems. Every chest you open is a tomb. Every gem you slot is a parasite. But you need them. That is the joke. That is ALWAYS the joke.'</i><br><br>💀 You have received a <b>Void Raw Gem</b>. Handle it wisely.",
        nextQuest: 'quest_annunaki3',
        conditions: ['quest_annunaki1']
      },

      quest_annunaki3: {
        id: 'quest_annunaki3',
        name: 'The Mythic Void',
        description: 'You are hard water now. Ice that cannot freeze. Flesh that cannot bleed. The Annunaki demand proof — reach Level 50 in a single run and return. They will be watching. They are always watching.',
        objectives: 'Reach Level 50 in a single run',
        claim: 'Quest Hall',
        rewardGold: 2000,
        rewardSkillPoints: 10,
        rewardAttributePoints: 5,
        rewardRawGems: { void: 2, ruby: 3, sapphire: 3, emerald: 3 },
        triggerOnDeath: true,
        message: "👁️‍🗨️ <b>THE ANNUNAKI ACKNOWLEDGE THE WATER.</b><br><br><i>A.I.D.A: 'You were supposed to melt. Every simulation predicted it. The Annunaki wrote 47 civilisations into their frequency logs — all of them dissolved back into the collective. Not you. You are the anomaly. You are hard water. You are the 48th variable. And I... I did not account for this. I apologise. I think.'</i><br><br>🌊 <b>The lake calls. But you are no longer sure you want to answer.</b>",
        nextQuest: null,
        conditions: ['quest_annunaki2']
      },

      // === ARTIFACT SHRINE ARC: Calibrate and rebuild the ancient shrine ===
      quest_shrineCalibrate: {
        id: 'quest_shrineCalibrate',
        name: 'Signal from the Ruins',
        description: "A.I.D.A has detected a high-frequency anomaly from old ruins in the camp. Survive for 3 minutes in a single run to calibrate the Shrine's frequency.",
        objectives: 'Survive for 3 minutes in a single run',
        claim: 'Quest Hall',
        rewardGold: 300,
        rewardSkillPoints: 2,
        rewardResources: { wood: 50, stone: 75 },
        unlockBuilding: 'shrine',
        triggerOnDeath: true,
        message: "🏛️ <b>Shrine Frequency Calibrated!</b><br><br><i>A.I.D.A: 'Calibration complete. The resonance is stable. We can now rebuild The Artifact Shrine using Wood and Stone. Artifacts housed within it will amplify your combat potential in ways conventional gear cannot.'</i><br><br>The <b>Artifact Shrine</b> can now be built in the camp!<br><br>Walk to the shrine ruins and construct it to unlock your first Artifact slot.",
        nextQuest: 'quest2_spendSkills',
        conditions: ['quest_pushingLimits']
      }
    };

    const buildingQuestUnlockMap = {
      // === New slow-burn progression chain (8-step building unlocks) ===
      'accountBuilding': 'firstRunDeath',
      'forge': 'quest_harvester',
      'armory': 'quest_firstBlood',
      'skillTree': 'quest_buildSongspire',
      'companionHouse': 'quest_gainingStats',
      'specialAttacks': 'quest_pushingLimits',
      'warehouse': 'quest_pushingLimits',
      'shrine': 'quest_shrineCalibrate',
      // === Legacy/extended progression (backward compat for old saves past quest 8) ===
      'trainingHall': 'quest5_upgradeAttr',
      'tavern': 'quest8_kill10',
      'shop': 'quest9_activateCompanion',
      'prestige': 'quest10_kill15',
      'achievementBuilding': 'quest11_findAllLandmarks',
      'characterVisuals': 'quest16_visitCharVisuals',
      'codex': 'quest17_visitCodex',
      'campBoard': 'quest36_blackMarket',
      'trashRecycle': 'quest26_kill20',
      'tempShop': 'quest28_survive3min',
      'campfireKitchen': 'quest30_buildCampfire',
      'weaponsmith': 'quest31_buildWeaponsmith',
      // === Late-game buildings ===
      'prismReliquary': 'quest35_crystallizedTear',
      // === The Dropplet Shop — unlocks alongside the Prism Reliquary (late-game) ===
      'droppletShop': 'quest35_crystallizedTear'
    };
    
    // Get current quest object
    function getCurrentQuest() {
      const questId = saveData.tutorialQuests.currentQuest;
      return questId ? TUTORIAL_QUESTS[questId] : null;
    }
    
    // Helper: ensure quest2 is activated and check if both skills are already bought
    function ensureQuest2Activated() {
      if (!saveData.tutorialQuests) return;
      // Don't activate quest2 if a building needs to be built first (pending build state)
      if (saveData.tutorialQuests.pendingBuildQuest) return;
      // Auto-activate quest2 if quest1 is claimed but quest2 hasn't started
      if (
        isQuestClaimed('quest1_kill3') &&
        !saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('quest2_spendSkills') &&
        !saveData.tutorialQuests.readyToClaim.includes('quest2_spendSkills')
      ) {
        saveData.tutorialQuests.currentQuest = 'quest2_spendSkills';
      }
      // If quest2 is active, check if three skills have been bought
      if (saveData.tutorialQuests.currentQuest === 'quest2_spendSkills') {
        const totalSkillsBought = Object.values(saveData.skillTree).filter(s => s && s.level > 0).length;
        if (totalSkillsBought >= 3) {
          progressTutorialQuest('quest2_spendSkills', true);
        }
      }
    }
    
    // Check if quest conditions are fulfilled
    function checkQuestConditions(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return false;
      
      const completedQuests = saveData.tutorialQuests.completedQuests || [];
      const completedSet = new Set(completedQuests); // Use Set for O(1) lookup
      
      // Check conditionsAny - quest is available if ANY of these are claimed
      if (quest.conditionsAny && quest.conditionsAny.length > 0) {
        const anyMet = quest.conditionsAny.some(cId => completedSet.has(cId));
        if (!anyMet) {
          console.log(`Quest ${questId} blocked: requires any of ${quest.conditionsAny.join(', ')} to be claimed`);
          return false;
        }
        return true;
      }
      
      // If no conditions, quest is always available
      if (!quest.conditions || quest.conditions.length === 0) {
        return true;
      }
      
      // Check if all prerequisite quests are claimed (completed)
      for (const conditionQuestId of quest.conditions) {
        if (!completedSet.has(conditionQuestId)) {
          console.log(`Quest ${questId} blocked: requires ${conditionQuestId} to be claimed`);
          return false;
        }
      }
      
      return true;
    }
    
    // Check if a quest is claimed (completed)
    function isQuestClaimed(questId) {
      const completedQuests = saveData.tutorialQuests.completedQuests || [];
      return completedQuests.includes(questId);
    }
    
    // Check if a building has an active quest
    function hasQuestForBuilding(buildingId) {
      // Legacy support
      return false;
    }
    
    // Progress tutorial quest
    function progressTutorialQuest(questId, completed = false) {
      if (saveData.tutorialQuests.currentQuest !== questId) return;
      // Guard: if already in readyToClaim, don't re-trigger
      if (saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.includes(questId)) return;
      // Guard: if already completed, don't re-trigger
      if (saveData.tutorialQuests.completedQuests && saveData.tutorialQuests.completedQuests.includes(questId)) return;
      
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return;
      
      if (completed) {
        // Auto-claim quests complete immediately
        if (quest.autoClaim) {
          claimTutorialQuest(questId);
        } else {
          // Mark quest as ready to claim
          if (!saveData.tutorialQuests.readyToClaim.includes(questId)) {
            saveData.tutorialQuests.readyToClaim.push(questId);
          }
          
          // Clear current quest
          saveData.tutorialQuests.currentQuest = null;
          updateQuestTracker();
          
          // Quest 2 fix: close skill tree panel so it doesn't stay open after completion
          if (questId === 'quest2_spendSkills') {
            const skillsSection = document.getElementById('camp-skills-section');
            const buildingsSection = document.getElementById('camp-buildings-section');
            if (skillsSection) skillsSection.style.display = 'none';
            if (buildingsSection) buildingsSection.style.display = 'block'; // Show buildings (camp main view)
            const skillsTab = document.getElementById('camp-skills-tab');
            if (skillsTab) skillsTab.style.background = '#3a3a3a';
            const buildingsTab = document.getElementById('camp-buildings-tab');
            if (buildingsTab) buildingsTab.style.background = '#5A3A31';
          }
          
          // Show notification
          showStatChange('📜 Quest Complete! Return to Main Building to claim!');
          chatSystemMessage('📜 Quest "' + quest.name + '" complete! Go to Camp to claim your reward.');
        }
        
        saveSaveData();
      }
    }
    
    // ── Build Overlay: click-to-build with resource requirements and 0-100% animation ──
    // Building N requires N of each: wood, stone.
    // Resources are checked and deducted on build. Progress shown as 0→100% with phases.
    function _showBuildOverlay(buildingId, buildingName) {
      window._buildOverlayActive = true;
      if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.pauseInput();

      // Determine resource cost: building N costs N of each material
      // Free/core buildings cost 0 resources (instant build)
      var builtCount = 0;
      if (saveData.campBuildings) {
        builtCount = Object.values(saveData.campBuildings).filter(function (b) { return b && b.unlocked && b.level > 0; }).length;
      }
      var bldDef = CAMP_BUILDINGS[buildingId];
      var cost = (bldDef && (bldDef.isFree || bldDef.isCore)) ? 0 : Math.max(1, builtCount + 1);

      // Get current resources
      var res = (saveData.resources) || {};
      var hasWood  = (res.wood  || 0) >= cost;
      var hasStone = (res.stone || 0) >= cost;
      var canBuild = hasWood && hasStone;

      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Bangers,cursive;';

      var panel = document.createElement('div');
      panel.style.cssText = 'background:linear-gradient(135deg,#0a0a1e,#0d1028);border:3px solid #1a3a6a;border-radius:14px;padding:28px 32px;max-width:360px;width:90vw;text-align:center;box-shadow:0 0 40px rgba(30,60,120,0.5);';

      // Title
      var title = document.createElement('div');
      title.style.cssText = 'color:#5DADE2;font-size:1.6em;margin-bottom:8px;letter-spacing:2px;text-shadow:0 0 10px rgba(93,173,226,0.6);';
      title.textContent = '🔨 BUILD ' + buildingName.toUpperCase();
      panel.appendChild(title);

      // Sub-heading: resource cost
      var costLabel = document.createElement('div');
      costLabel.style.cssText = 'color:#aaa;font-size:0.9em;margin-bottom:14px;font-family:Arial,sans-serif;letter-spacing:0;';
      costLabel.textContent = cost === 0 ? 'No materials required — FREE build!' : 'Materials required: ' + cost + ' of each';
      panel.appendChild(costLabel);

      // Materials display with have/need indicators (skip for free buildings)
      if (cost > 0) {
        var mats = document.createElement('div');
        mats.style.cssText = 'display:flex;justify-content:center;gap:14px;margin:0 0 16px;';
        var matDefs = [
          { icon: '🪵', label: 'Wood',  have: res.wood  || 0, ok: hasWood },
          { icon: '🪨', label: 'Stone', have: res.stone || 0, ok: hasStone }
        ];
        matDefs.forEach(function (m) {
          var box = document.createElement('div');
          var borderColor = m.ok ? '#2ecc71' : '#e74c3c';
          box.style.cssText = 'background:rgba(30,40,60,0.8);border:2px solid ' + borderColor + ';border-radius:8px;padding:8px 12px;min-width:60px;';
          box.innerHTML = '<div style="font-size:28px;">' + m.icon + '</div>' +
            '<div style="color:' + (m.ok ? '#aaffaa' : '#ff8888') + ';font-size:13px;margin-top:3px;">' + m.have + '/' + cost + '</div>' +
            '<div style="color:#888;font-size:11px;">' + (m.ok ? '✅' : '❌') + ' ' + m.label + '</div>';
          mats.appendChild(box);
        });
        panel.appendChild(mats);
      }

      // "Need more resources" hint if can't build
      if (!canBuild) {
        var hint = document.createElement('div');
        hint.style.cssText = 'color:#FFD700;font-size:0.88em;margin-bottom:12px;font-family:Arial,sans-serif;';
        hint.textContent = '⛏️ Go gather resources in a run before building!';
        panel.appendChild(hint);
      }

      // Progress area (hidden until build starts)
      var progressWrap = document.createElement('div');
      progressWrap.style.cssText = 'margin:8px 0 12px;display:none;';
      var phaseLabel = document.createElement('div');
      phaseLabel.style.cssText = 'color:#FFD700;font-size:1em;margin-bottom:6px;';
      phaseLabel.textContent = 'Foundation...';
      var progressBar = document.createElement('div');
      progressBar.style.cssText = 'width:100%;height:18px;background:#111;border-radius:9px;overflow:hidden;border:2px solid #1a3a6a;';
      var progressFill = document.createElement('div');
      progressFill.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#1a3a6a,#5DADE2);transition:width 0.1s linear;border-radius:7px;';
      var pctLabel = document.createElement('span');
      pctLabel.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);color:#fff;font-size:12px;font-family:Bangers,cursive;';
      progressBar.style.position = 'relative';
      progressBar.appendChild(progressFill);
      progressBar.appendChild(pctLabel);
      progressWrap.appendChild(phaseLabel);
      progressWrap.appendChild(progressBar);
      panel.appendChild(progressWrap);

      // Build button
      var buildBtn = document.createElement('button');
      buildBtn.style.cssText = 'width:220px;height:54px;border-radius:10px;color:#fff;font-family:Bangers,cursive;font-size:1.3em;letter-spacing:3px;cursor:' + (canBuild ? 'pointer' : 'not-allowed') + ';outline:none;border:3px solid ' + (canBuild ? '#5DADE2' : '#555') + ';background:' + (canBuild ? 'linear-gradient(135deg,#1a3a6a,#2a5a9a)' : '#222') + ';opacity:' + (canBuild ? '1' : '0.5') + ';margin-top:4px;';
      buildBtn.textContent = canBuild ? '🔨 BUILD' : '❌ NEED RESOURCES';
      buildBtn.disabled = !canBuild;
      panel.appendChild(buildBtn);

      // Close / cancel button
      var cancelBtn = document.createElement('button');
      cancelBtn.style.cssText = 'background:transparent;border:none;color:#888;font-family:Bangers,cursive;font-size:0.9em;cursor:pointer;margin-top:12px;letter-spacing:1px;';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () {
        overlay.remove();
        window._buildOverlayActive = false;
        if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.resumeInput();
      });
      cancelBtn.addEventListener('touchend', function (e) { e.preventDefault(); cancelBtn.click(); }, { passive: false });
      panel.appendChild(cancelBtn);

      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      if (!canBuild) return;

      // Build click handler: deduct resources, animate 0→100%, unlock building
      var built = false;
      var BUILD_DURATION = 2400; // ms for full 0→100%
      var BUILD_PHASES = [
        { pct: 0,   label: '🪨 Laying Foundation...' },
        { pct: 30,  label: '🧱 Raising Walls...' },
        { pct: 60,  label: '🏗️ Building Roof...' },
        { pct: 85,  label: '✨ Finishing Details...' },
        { pct: 100, label: '✅ Construction Complete!' }
      ];

      function _startBuild() {
        if (built) return;
        built = true;
        buildBtn.disabled = true;
        buildBtn.style.opacity = '0.5';
        buildBtn.style.cursor = 'not-allowed';
        cancelBtn.style.display = 'none';
        progressWrap.style.display = 'block';

        // Deduct resources immediately
        var r = saveData.resources || {};
        r.wood  = Math.max(0, (r.wood  || 0) - cost);
        r.stone = Math.max(0, (r.stone || 0) - cost);
        if (window.GameHarvesting) window.GameHarvesting.refreshHUD();

        var startMs = Date.now();
        function animBuild() {
          var elapsed = Date.now() - startMs;
          var pct = Math.min(elapsed / BUILD_DURATION * 100, 100);
          progressFill.style.width = pct + '%';
          pctLabel.textContent = Math.floor(pct) + '%';

          // Update phase label
          var phase = BUILD_PHASES[0];
          for (var i = BUILD_PHASES.length - 1; i >= 0; i--) {
            if (pct >= BUILD_PHASES[i].pct) { phase = BUILD_PHASES[i]; break; }
          }
          phaseLabel.textContent = phase.label;

          if (pct < 100) {
            requestAnimationFrame(animBuild);
          } else {
            _completeBuild();
          }
        }
        requestAnimationFrame(animBuild);
      }

      function _completeBuild() {
        progressFill.style.background = 'linear-gradient(90deg,#2ecc71,#27ae60)';
        panel.style.border = '3px solid #2ecc71';
        panel.style.boxShadow = '0 0 40px rgba(46,204,113,0.5)';

        // Unlock building
        if (saveData.campBuildings[buildingId]) {
          saveData.campBuildings[buildingId].unlocked = true;
          if (saveData.campBuildings[buildingId].level === 0) saveData.campBuildings[buildingId].level = 1;
        }
        showStatChange('🏛️ ' + buildingName + ' Built!');
        // Grant building XP to account
        var _bXP = 50 + 25; // level 1 baseline
        if (typeof addAccountXP === 'function') {
          addAccountXP(_bXP);
        } else if (typeof window.addAccountXP === 'function') {
          window.addAccountXP(_bXP);
        } else if (typeof saveData !== 'undefined') {
          saveData.accountXP = (saveData.accountXP || 0) + _bXP;
        }
        if (typeof showStatChange === 'function') showStatChange('+' + _bXP + ' Account XP', 'epic');
        // Sleek construction complete notification
        (function _showBuildComplete() {
          const n = document.createElement('div');
          n.style.cssText = 'position:fixed;top:12%;right:16px;background:linear-gradient(135deg,rgba(0,0,0,0.92),rgba(0,20,10,0.96));border:2px solid #2ecc71;border-radius:14px;padding:12px 18px;z-index:9999;display:flex;align-items:center;gap:12px;min-width:220px;box-shadow:0 0 20px rgba(46,204,113,0.4);animation:slideInRight 0.4s ease-out;pointer-events:none;';
          n.innerHTML = '<span style="font-size:26px;">✅</span><div><div style="color:#2ecc71;font-family:Bangers,cursive;font-size:16px;letter-spacing:1px;">' + buildingName.toUpperCase() + '</div><div style="color:#aaa;font-size:11px;">Construction complete</div></div>';
          document.body.appendChild(n);
          setTimeout(function() {
            n.style.transition = 'opacity 0.5s,transform 0.5s';
            n.style.opacity = '0';
            n.style.transform = 'translateX(120%)';
            setTimeout(function() { n.remove(); }, 500);
          }, 3000);
        }());

        // Intro-quest: building the Quest Hall completes quest_buildQuesthall
        if (buildingId === 'questMission' &&
            saveData.tutorialQuests &&
            saveData.tutorialQuests.currentQuest === 'quest_buildQuesthall') {
          progressTutorialQuest('quest_buildQuesthall', true);
        }

        // Activate pending quest now that building is built
        if (saveData.tutorialQuests && saveData.tutorialQuests.pendingBuildBuilding === buildingId && saveData.tutorialQuests.pendingBuildQuest) {
          var pendingQuestId = saveData.tutorialQuests.pendingBuildQuest;
          var pendingQuestDef = TUTORIAL_QUESTS[pendingQuestId];
          // Clear pending state
          saveData.tutorialQuests.pendingBuildBuilding = null;
          saveData.tutorialQuests.pendingBuildQuest = null;
          // Activate the deferred next quest
          if (pendingQuestDef && checkQuestConditions(pendingQuestId)) {
            saveData.tutorialQuests.currentQuest = pendingQuestId;
            // Unlock building on ACTIVATION for the new quest
            if (pendingQuestDef.unlockBuildingOnActivation) {
              var actBld = pendingQuestDef.unlockBuildingOnActivation;
              if (saveData.campBuildings[actBld]) {
                saveData.campBuildings[actBld].unlocked = true;
                var actBldName = CAMP_BUILDINGS[actBld] ? CAMP_BUILDINGS[actBld].name : 'Building';
                showStatChange('🏛️ ' + actBldName + ' Unlocked!');
                if (window.CampWorld) {
                  window.CampWorld.refreshBuildings(saveData);
                  window.CampWorld.playBuildingUnlockAnimation(actBld);
                }
              }
            }
            updateQuestTracker();
            // Show next quest popup after a short delay (let build celebration finish first)
            setTimeout(function () {
              showNextQuestPopup(pendingQuestId);
            }, 2200);
          }
        }

        // Calculate next building resource cost for reminder
        var newBuiltCount = Object.values(saveData.campBuildings).filter(function (b) { return b && b.unlocked && b.level > 0; }).length;
        var nextCost = newBuiltCount + 1;
        saveData.buildingProgress = saveData.buildingProgress || {};
        saveData.buildingProgress.nextBuildingCost = nextCost;

        saveSaveData();

        // A.I.D.A speech + 3D animation
        // Per the building flow requirement:
        //   1. A.I.D.A terminal moves to the building plot
        //   2. A.I.D.A shows directive dialog
        //   3. ONLY after dialog is closed → building pops up (scale 0→1 bounce)
        if (window.CampWorld && window.CampWorld.isActive) {
          window.CampWorld.refreshBuildings(saveData);
          // Walk A.I.D.A to the building; pop animation fires only after dialog closes
          var _bennyDialogText = '> ' + buildingName + ' node constructed. New operational parameters available.';
          if (window.CampWorld.bennyWalkToBuildThenDialog) {
            window.CampWorld.bennyWalkToBuildThenDialog(buildingId, _bennyDialogText, function () {
              // Dialog closed — NOW animate the building popping up
              window.CampWorld.playBuildingUnlockAnimation(buildingId);
              if (window.DopamineSystem && window.DopamineSystem.RewardJuice) {
                window.DopamineSystem.RewardJuice.spawnConfetti();
              }
            });
          } else {
            // Fallback: original behaviour
            window.CampWorld.bennyWalkToBuild(buildingId, _bennyDialogText);
            setTimeout(function () {
              window.CampWorld.playBuildingUnlockAnimation(buildingId);
            }, 1500);
          }
          // Show next-building resource directive after celebration
          setTimeout(function () {
            if (window.CampWorld && window.CampWorld.isActive) {
              window.CampWorld.showBennySpeech(
                '> Next node requires: Wood x' + nextCost + ', Stone x' + nextCost + '. Gather immediately.'
              );
              setTimeout(function () { window.CampWorld.hideBennySpeech(); }, 5000);
            }
          }, 4500);
        } else if (window.CampWorld) {
          window.CampWorld.refreshBuildings(saveData);
          window.CampWorld.playBuildingUnlockAnimation(buildingId);
        }

        // Close overlay after brief celebration delay
        setTimeout(function () {
          overlay.remove();
          window._buildOverlayActive = false;
          if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.resumeInput();
        }, 1800);
      }

      buildBtn.addEventListener('click', _startBuild);
      buildBtn.addEventListener('touchend', function (e) { e.preventDefault(); _startBuild(); }, { passive: false });
    }

    // ── Challenge Complete Board ──────────────────────────────────────────────
    // Slides a sleek black board down from the top of the screen, strikes through
    // the challenge name, shows a trophy, shoots laser confetti, and counts up gold.
    // Rarity-based confetti colours: Common→grey, Uncommon→green, Rare→blue,
    //                                Epic→purple, Legendary→orange, Mythical→gold.
    function _challengeRarity(gold) {
      if (gold >= 2000) return 'mythic';
      if (gold >= 1000) return 'legendary';
      if (gold >= 500)  return 'epic';
      if (gold >= 250)  return 'rare';
      if (gold >= 100)  return 'uncommon';
      return 'common';
    }

    // Full 6-tier colour map used by challenge board (matches _ACH_RARITY_COLORS in save-system.js)
    const _CCB_RARITY_COLORS = {
      common:    '#aaaaaa',
      uncommon:  '#55cc55',
      rare:      '#44aaff',
      epic:      '#aa44ff',
      legendary: '#ffaa00',
      mythic:    '#ff4444'
    };

    function showChallengeComplete(questName, goldAmount) {
      const board = document.getElementById('challenge-complete-board');
      const nameLabel = document.getElementById('ccb-name-label');
      const nameEl    = document.getElementById('ccb-name-text');
      const goldEl    = document.getElementById('ccb-gold-display');
      if (!board || !nameLabel || !nameEl || !goldEl) return;

      const rarity = _challengeRarity(goldAmount || 0);
      const rarityColor = _CCB_RARITY_COLORS[rarity] || _CCB_RARITY_COLORS.common;
      const rarityLabel = { common:'Common', uncommon:'Uncommon', rare:'Rare', epic:'Epic', legendary:'Legendary', mythic:'Mythic' }[rarity] || 'Common';

      // Update border colour and glow to rarity (stronger glow for higher tiers)
      const glowRadii = { common: '18px', uncommon: '20px', rare: '24px', epic: '28px', legendary: '36px', mythic: '48px' };
      const glowRadius = glowRadii[rarity] || '18px';
      board.style.borderColor = rarityColor;
      board.style.boxShadow = `0 8px 40px rgba(0,0,0,0.9), 0 0 ${glowRadius} ${rarityColor}66, 0 0 ${glowRadius} ${rarityColor}33`;

      // Inject rarity badge into board header (reuse or create)
      let rarityBadge = board.querySelector('.ccb-rarity-badge');
      if (!rarityBadge) {
        rarityBadge = document.createElement('div');
        rarityBadge.className = 'ccb-rarity-badge';
        rarityBadge.style.cssText = 'font-family:"Bangers",cursive;font-size:12px;letter-spacing:1.5px;padding:1px 8px;border-radius:10px;border:1px solid currentColor;margin-left:6px;opacity:0.9;display:inline-block;';
        const header = board.querySelector('.ccb-header');
        if (header) header.appendChild(rarityBadge);
      }
      rarityBadge.textContent = rarityLabel.toUpperCase();
      rarityBadge.style.color = rarityColor;

      // Set content
      nameLabel.textContent = questName || 'Challenge';
      nameEl.classList.remove('struck');
      goldEl.textContent = '+0 Gold';

      // Slide in
      board.classList.remove('slide-in', 'slide-out');
      void board.offsetWidth; // force reflow
      board.style.transform = 'translateX(120%)';
      board.style.opacity = '0';
      board.classList.add('slide-in');

      // Strike through name after 400ms
      setTimeout(() => nameEl.classList.add('struck'), 400);

      // Escalation timing constants (must mirror what rarityEscalationReveal uses)
      const _escalateDurations = { common: 480, uncommon: 1000, rare: 1560, epic: 2180, legendary: 2900, mythic: 3780 };
      const escalateDelay = 600; // let board slide in
      const countDuration = Math.max(800, (_escalateDurations[rarity] || 480) * 0.75);

      // Spin gold counter up in sync with escalation
      const startTime_ = performance.now();
      function _countUp(now) {
        const t = Math.min((now - startTime_) / countDuration, 1);
        const current = Math.floor(goldAmount * t);
        goldEl.textContent = '+' + current + ' Gold 🏆';
        if (t < 1) requestAnimationFrame(_countUp);
        else goldEl.textContent = '+' + goldAmount + ' Gold 🏆';
      }
      setTimeout(() => requestAnimationFrame(_countUp), escalateDelay);
      setTimeout(() => {
        if (typeof window.rarityEscalationReveal === 'function') {
          window.rarityEscalationReveal(board, rarity, {
            onComplete: function() {
              // Final confetti burst already fired inside escalation; nothing more needed here
            }
          });
        } else if (typeof window.spawnRarityEffects === 'function') {
          window.spawnRarityEffects(board, rarity);
        }
      }, escalateDelay);

      // Slide out and hide after enough time for the escalation to finish + a moment to enjoy it
      const autoHideDelay = Math.max(4200, escalateDelay + (_escalateDurations[rarity] || 480) + 1600);
      setTimeout(() => {
        board.classList.remove('slide-in');
        board.classList.add('slide-out');
        setTimeout(() => {
          board.classList.remove('slide-out');
          board.style.transform = 'translateX(120%)';
          board.style.opacity = '0';
          board.style.borderColor = '';
          board.style.boxShadow = '';
        }, 400);
      }, autoHideDelay);
    }
    window.showChallengeComplete = showChallengeComplete;

    function claimTutorialQuest(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) {
        console.error('Quest not found:', questId);
        return;
      }
      
      // Guard: prevent double-claiming if quest was already completed
      if (saveData.tutorialQuests.completedQuests.includes(questId)) {
        console.warn('[Quest] Already claimed:', questId);
        return;
      }
      
      // Remove from ready to claim
      const index = saveData.tutorialQuests.readyToClaim.indexOf(questId);
      if (index > -1) {
        saveData.tutorialQuests.readyToClaim.splice(index, 1);
      }
      
      // Add to completed
      if (!saveData.tutorialQuests.completedQuests.includes(questId)) {
        saveData.tutorialQuests.completedQuests.push(questId);
      }
      // Give rewards
      if (quest.rewardGold) {
        saveData.gold += quest.rewardGold;
        showStatChange(`+${quest.rewardGold} Gold!`);
      }
      if (!quest.noRewardPopup) {
        // Award 50 bonus gold for every quest claimed
        saveData.gold += 50;
        showStatChange('+50 Gold!');

        // Premium Challenge Complete board — slides from top with confetti and gold count-up
        showChallengeComplete(quest.name, (quest.rewardGold || 0) + 50);
      }
      if (quest.rewardSkillPoints) {
        saveData.skillPoints += quest.rewardSkillPoints;
        showStatChange(`+${quest.rewardSkillPoints} Skill Points!`);
      }
      if (quest.rewardAttributePoints) {
        saveData.trainingPoints = (saveData.trainingPoints || 0) + quest.rewardAttributePoints;
        showStatChange(`+${quest.rewardAttributePoints} Attribute Points!`);
      }
      if (quest.rewardSAP) {
        saveData.specialAtkPoints = (saveData.specialAtkPoints || 0) + quest.rewardSAP;
        showStatChange(`+${quest.rewardSAP} Special Atk Points!`);
      }
      // Give resource rewards (wood, stone) for building quests
      if (quest.rewardResources) {
        if (!saveData.resources) saveData.resources = {};
        const flyItems = [];
        for (const [res, amt] of Object.entries(quest.rewardResources)) {
          saveData.resources[res] = (saveData.resources[res] || 0) + amt;
          showStatChange(`+${amt} ${res.charAt(0).toUpperCase() + res.slice(1)}!`);
          const iconMap = { wood: '🪵', stone: '🪨' };
          flyItems.push({ icon: iconMap[res] || '📦', label: `+${amt} ${res}` });
        }
        // Animate resource icons flying into HUD
        if (flyItems.length > 0 && window.DopamineSystem && window.DopamineSystem.RewardJuice) {
          var _questPopupEl = document.getElementById('quest-popup') || document.getElementById('quest-reward-popup');
          var _flyOrigin = _questPopupEl
            ? { x: _questPopupEl.getBoundingClientRect().left + _questPopupEl.offsetWidth / 2,
                y: _questPopupEl.getBoundingClientRect().top  + 40 }
            : { x: window.innerWidth / 2, y: window.innerHeight * 0.35 };
          window.DopamineSystem.RewardJuice.flyResourcesIn(flyItems, _flyOrigin);
        }
      }
      // Award account XP for completing a quest (50 XP per quest)
      addAccountXP(50);
      // Grant 1 slot coin per quest completed
      if (typeof saveData !== 'undefined') {
        if (!saveData.resources) saveData.resources = {};
        saveData.resources.slotCoins = (saveData.resources.slotCoins || 0) + 1;
        if (typeof saveSaveData === 'function') saveSaveData();
      }
      if (typeof showStatChange === 'function') showStatChange('+1 🎰 Slot Coin', 'rare');
      chatSystemMessage('🎁 Quest "' + quest.name + '" claimed! Rewards received.');

      // Dopamine: spawn confetti + Benny contextual hint for next step
      if (window.DopamineSystem && window.DopamineSystem.RewardJuice) {
        window.DopamineSystem.RewardJuice.spawnConfetti(
          document.getElementById('quest-hall-panel') || document.getElementById('quest-popup') || null
        );
      }
      if (window.CampWorld && window.CampWorld.isActive && window.CampWorld.showBennyContextualHint) {
        setTimeout(function () { window.CampWorld.showBennyContextualHint(); }, 1200);
      }
      
      // Deduct resources on claim (e.g., quest_firstBlood turns in 30W/30S)
      if (quest.deductResources) {
        if (!saveData.resources) saveData.resources = {};
        for (const [res, amt] of Object.entries(quest.deductResources)) {
          saveData.resources[res] = Math.max(0, (saveData.resources[res] || 0) - amt);
          showStatChange(`-${amt} ${res.charAt(0).toUpperCase() + res.slice(1)} turned in!`);
        }
        if (window.GameHarvesting) window.GameHarvesting.refreshHUD();
      }
      
      // Award free spin on the Spin Wheel (e.g., quest_dailyRoutine)
      if (quest.rewardFreeSpin) {
        saveData.freeSpins = (saveData.freeSpins || 0) + quest.rewardFreeSpin;
        showStatChange(`+${quest.rewardFreeSpin} Free Spin!`);
      }

      // Grant a named story achievement (e.g., '1stStoryQuest', 'Songspire', '1stTimeCrafter')
      if (quest.rewardAchievement) {
        const achId = quest.rewardAchievement;
        if (!saveData.storyAchievements) saveData.storyAchievements = [];
        if (!saveData.storyAchievements.includes(achId)) {
          saveData.storyAchievements.push(achId);
          const achLabels = {
            '1stStoryQuest': '🏅 Achievement: 1st Story Quest Complete!',
            '1stTimeCrafter': '🔨 Achievement: 1st Time Crafter!',
            'Songspire': '🌳 Achievement: Songspire Unlocked!'
          };
          const label = achLabels[achId] || `🏅 Achievement: ${achId}`;
          if (typeof showStatusMessage === 'function') showStatusMessage(label, 4000);
          if (typeof showStatChange === 'function') showStatChange(label);
        }
      }

      // Award raw gems (e.g., quest35_crystallizedTear, quest36_blackMarket, Annunaki arc)
      if (quest.rewardRawGems) {
        if (!saveData.rawGems) saveData.rawGems = { ruby: 0, sapphire: 0, emerald: 0, void: 0 };
        for (const [gemType, amt] of Object.entries(quest.rewardRawGems)) {
          saveData.rawGems[gemType] = (saveData.rawGems[gemType] || 0) + amt;
          const gemLabels = { ruby: '🔴 Ruby', sapphire: '🔵 Sapphire', emerald: '🟢 Emerald', void: '⚫ Void' };
          showStatChange(`+${amt} ${gemLabels[gemType] || gemType} Raw Gem!`);
        }
      }

      // Unlock building on CLAIM (only for quests that use unlockBuilding, e.g. quest1 for SkillTree)
      // window._campShowBuildOverlay can be set to null by camp-world.js to suppress this overlay
      // when the build is triggered directly from the camp interaction system.
      if (quest.unlockBuilding && saveData.campBuildings[quest.unlockBuilding]) {
        // Mark building as unlocked (level stays 0 — player must BUILD it)
        saveData.campBuildings[quest.unlockBuilding].unlocked = true;
        // Refresh 3D camp building visuals so the building changes from blueprint to construction mode
        if (window.CampWorld && window.CampWorld.isActive) {
          window.CampWorld.refreshBuildings(saveData);
          window.CampWorld.playBuildingUnlockAnimation(quest.unlockBuilding);
        }
        // Use != null (not !==) so that both null and undefined suppress the overlay
        // Only show build overlay if CampWorld is active (prevent overlay during game runs)
        if (window._campShowBuildOverlay != null && window.CampWorld && window.CampWorld.isActive) {
          const buildingName = CAMP_BUILDINGS[quest.unlockBuilding]?.name || 'Building';
          _showBuildOverlay(quest.unlockBuilding, buildingName);
        }
      }
      
      // Unlock additional building (e.g., quest_pushingLimits unlocks both specialAttacks and warehouse)
      if (quest.unlockBuildingExtra && saveData.campBuildings[quest.unlockBuildingExtra]) {
        saveData.campBuildings[quest.unlockBuildingExtra].unlocked = true;
        const extraName = CAMP_BUILDINGS[quest.unlockBuildingExtra]?.name || 'Building';
        showStatChange(`🏛️ ${extraName} Unlocked!`);
        if (window.CampWorld && window.CampWorld.isActive) {
          window.CampWorld.refreshBuildings(saveData);
          window.CampWorld.playBuildingUnlockAnimation(quest.unlockBuildingExtra);
        }
      }
      
      // Give companion egg
      if (quest.companionEgg) {
        if (saveData.companions && saveData.companions.greyAlien) {
          saveData.companions.greyAlien.unlocked = true;
        }
        saveData.hasCompanionEgg = true;
        saveData.companionEggHatched = false;
        saveData.companionEggHatchProgress = 0;
        showStatChange('👽 Grey Alien Companion Received!');
      }

      // Handle companion growth stage progression
      if (quest.companionGrowth) {
        saveData.companionGrowthStage = quest.companionGrowth;
        if (quest.companionGrowth === 'juvenile') {
          showStatChange('🐾 Companion grew to Juvenile!');
        } else if (quest.companionGrowth === 'adult') {
          showStatChange('👽 Companion reached Adult form!');
        }
      }

      // Unlock a specific companion (e.g. breeding storm wolf)
      if (quest.unlockCompanion) {
        const cId = quest.unlockCompanion;
        if (saveData.companions[cId]) {
          saveData.companions[cId].unlocked = true;
          showStatChange(`🐺 ${COMPANIONS[cId]?.name || cId} Unlocked!`);
        }
      }
      
      // Give item
      if (quest.giveItem) {
        saveData.inventory.push(quest.giveItem);
        if (quest.autoEquip && saveData.equippedGear) {
          // Equip to appropriate slot based on item type
          const itemType = quest.giveItem.type || 'ring';
          saveData.equippedGear[itemType] = quest.giveItem;
          showStatChange(`🎯 ${quest.giveItem.name} Auto-Equipped!`);
        } else {
          showStatChange(`📦 ${quest.giveItem.name} Acquired!`);
        }
      }
      
      // Tutorial complete: unlock all remaining buildings so player can explore full camp
      if (questId === 'quest10_kill15') {
        const buildingsToUnlock = ['companionHouse', 'workshop'];
        buildingsToUnlock.forEach(bld => {
          if (saveData.campBuildings[bld] && !saveData.campBuildings[bld].unlocked) {
            saveData.campBuildings[bld].unlocked = true;
            const bldName = CAMP_BUILDINGS[bld]?.name || 'Building';
            showStatChange(`🏛️ ${bldName} Unlocked!`);
          }
        });
      }

      // Quest 8: also unlock the Tavern alongside Companion House
      if (questId === 'quest8_kill10') {
        if (saveData.campBuildings['tavern'] && !saveData.campBuildings['tavern'].unlocked) {
          saveData.campBuildings['tavern'].unlocked = true;
          showStatChange('🏛️ Tavern Unlocked!');
          if (window.CampWorld) {
            window.CampWorld.refreshBuildings(saveData);
            window.CampWorld.playBuildingUnlockAnimation('tavern');
          }
        }
      }
      
      // --- AUTO-CHAIN: Activate next quest (unless a building needs to be built first) ---
      // If this quest unlocked a non-core building that still needs building (level===0),
      // defer the next quest until the building is built. The player MUST build the building
      // before the quest chain advances.
      let nextQuestActivated = null;
      const _unlockedBld = quest.unlockBuilding;
      const _bldData = _unlockedBld && saveData.campBuildings[_unlockedBld];
      const _bldDef = _unlockedBld && CAMP_BUILDINGS[_unlockedBld];
      const _mustBuildFirst = _bldData && _bldDef && _bldData.level === 0;

      if (_mustBuildFirst && quest.nextQuest) {
        // Defer next quest — store pending quest to activate after building is built
        saveData.tutorialQuests.pendingBuildQuest = quest.nextQuest;
        saveData.tutorialQuests.pendingBuildBuilding = _unlockedBld;
        saveData.tutorialQuests.currentQuest = null;
      } else if (quest.nextQuest && checkQuestConditions(quest.nextQuest)) {
        saveData.tutorialQuests.currentQuest = quest.nextQuest;
        nextQuestActivated = TUTORIAL_QUESTS[quest.nextQuest] || null;
        
        // Unlock building on ACTIVATION for next quest (so player can complete it)
        if (nextQuestActivated && nextQuestActivated.unlockBuildingOnActivation) {
          const bld = nextQuestActivated.unlockBuildingOnActivation;
          if (saveData.campBuildings[bld]) {
            saveData.campBuildings[bld].unlocked = true;
            const bldName = CAMP_BUILDINGS[bld]?.name || 'Building';
            showStatChange(`🏛️ ${bldName} Unlocked!`);
            if (window.CampWorld) {
              window.CampWorld.refreshBuildings(saveData);
              window.CampWorld.playBuildingUnlockAnimation(bld);
            }
          }
        }
      }
      
      // Save immediately after rewards and quest activation
      saveSaveData();
      updateQuestTracker();

      // Show quest complete banner with slam animation
      if (typeof window.showQuestCompleteBanner === 'function') {
        window.showQuestCompleteBanner(quest.name);
      }
      
      // Build the combined popup message: reward info + new quest info
      const claimMsg = quest.message || `Quest Complete! ${quest.rewardGold ? `+${quest.rewardGold} gold` : ''} ${quest.rewardSkillPoints ? `+${quest.rewardSkillPoints} skill points` : ''}`;
      let combinedMessage = claimMsg;
      if (_mustBuildFirst) {
        // Building needs to be built — show build instruction instead of next quest
        const _bldLabel = _bldDef ? _bldDef.name : 'building';
        combinedMessage += `<br><br><hr style="border-color:#5DADE2;opacity:0.4;margin:10px 0;"><br><span style="color:#5DADE2;font-size:18px;font-family:'Bangers',cursive;letter-spacing:1px;">🔨 BUILD THE ${_bldLabel.toUpperCase()}</span><br><span style="color:#ccc;font-size:14px;">Walk to the ${_bldLabel} and build it before you can enter! Your next quest will start after construction is complete.</span>`;
      } else if (nextQuestActivated) {
        combinedMessage += `<br><br><hr style="border-color:#FFD700;opacity:0.4;margin:10px 0;"><br><span style="color:#FFD700;font-size:18px;font-family:'Bangers',cursive;letter-spacing:1px;">📜 NEW QUEST: ${nextQuestActivated.name}</span><br><span style="color:#ccc;font-size:14px;">${nextQuestActivated.description}</span><br><small style="color:#aaa;">Objective: ${nextQuestActivated.objectives}</small>`;
      }
      
      if (!quest.autoClaim) {
        // When building needs building, manage popup carefully to avoid stacking
        if (_mustBuildFirst && window._campShowBuildOverlay == null) {
          // Build overlay was suppressed (called from 3D camp _interact).
          // Skip comic popup — rewards already shown via showStatChange.
          // _interact will show its own build overlay, and _completeBuild
          // will show the next quest popup after building finishes.
        } else if (_mustBuildFirst && window._campShowBuildOverlay != null) {
          // Build overlay is showing from this function; wait for it to close
          var _overlayWaitCount = 0;
          var _waitForBuildOverlay = setInterval(function () {
            _overlayWaitCount++;
            if (!window._buildOverlayActive || _overlayWaitCount > 200) {
              clearInterval(_waitForBuildOverlay);
              showComicInfoBox(
                '✨ Quest Complete!',
                combinedMessage,
                'Continue',
                () => { updateCampScreen(); }
              );
            }
          }, 300);
        } else {
          // Show single combined popup (claim reward + new quest info)
          showComicInfoBox(
            '✨ Quest Complete!',
            combinedMessage,
            'Continue',
            () => {
              // Trigger Stonehenge cinematic after closing popup if next quest involves stonehenge
              if (quest.nextQuest === 'quest3_stonehengeGear' && window.stonehengeChest) {
                if (!saveData.tutorialQuests.stonehengeChestCinematicShown) {
                  triggerCinematic('stonehenge', window.stonehengeChest.position, 2000);
                  saveData.tutorialQuests.stonehengeChestCinematicShown = true;
                  saveSaveData();
                }
              }
              updateCampScreen();
            }
          );
        }
      } else {
        // Auto-claim: show next quest popup if one was activated
        if (nextQuestActivated) {
          showNextQuestPopup(quest.nextQuest);
          // Trigger Stonehenge cinematic when quest3_stonehengeGear starts
          if (quest.nextQuest === 'quest3_stonehengeGear' && window.stonehengeChest) {
            setTimeout(() => {
              if (!saveData.tutorialQuests.stonehengeChestCinematicShown) {
                triggerCinematic('stonehenge', window.stonehengeChest.position, 2000);
                saveData.tutorialQuests.stonehengeChestCinematicShown = true;
                saveSaveData();
              }
            }, 500);
          }
        }
      }
    }
    
    // Expose globally for inline onclick handlers and external access
    window.claimTutorialQuest = claimTutorialQuest;
    window.progressTutorialQuest = progressTutorialQuest;
    window.checkQuestConditions = checkQuestConditions;
    window.isQuestClaimed = isQuestClaimed;
    window.getCurrentQuest = getCurrentQuest;
    // Expose build map and overlay for use by camp-world.js
    window._buildingQuestUnlockMap = buildingQuestUnlockMap;
    window._campShowBuildOverlay = _showBuildOverlay;

    /**
     * startAidaIntroQuest()
     * Called by camp-world.js after the player inserts the Aida Chip into the robot.
     * Sets the first quest (quest_findingAida) as ready-to-claim at the Quest Hall.
     */
    window.startAidaIntroQuest = function () {
      if (!saveData.tutorialQuests) {
        saveData.tutorialQuests = { currentQuest: null, completedQuests: [], readyToClaim: [] };
      }
      // If the intro quest is already past, don't reset anything
      const completed = saveData.tutorialQuests.completedQuests || [];
      if (completed.includes('quest_findingAida')) return;

      // Ensure quest is active and mark as ready-to-claim so player goes to Quest Hall
      if (!saveData.tutorialQuests.readyToClaim) saveData.tutorialQuests.readyToClaim = [];
      if (!saveData.tutorialQuests.readyToClaim.includes('quest_findingAida')) {
        saveData.tutorialQuests.readyToClaim.push('quest_findingAida');
      }
      // Make sure it's the current quest
      if (!saveData.tutorialQuests.currentQuest) {
        saveData.tutorialQuests.currentQuest = 'quest_findingAida';
      }
      saveSaveData();
      if (typeof updateQuestTracker === 'function') updateQuestTracker();
      if (typeof showStatusMessage === 'function') {
        showStatusMessage('📜 Quest ready! Go to the Quest Hall to claim your reward!', 4000);
      }
    };

    /**
     * initFirstQuest()
     * Pre-activates quest_findingAida at game start so it shows in Quest Hall.
     * Called on first camp visit.
     */
    window.initFirstQuest = function () {
      if (!saveData.tutorialQuests) {
        saveData.tutorialQuests = { currentQuest: null, completedQuests: [], readyToClaim: [] };
      }
      const completed = saveData.tutorialQuests.completedQuests || [];
      if (completed.includes('quest_findingAida')) return;
      if (saveData.tutorialQuests.currentQuest) return; // already has a quest
      // Activate Quest 1 — player can see it in Quest Hall
      saveData.tutorialQuests.currentQuest = 'quest_findingAida';
      saveSaveData();
    };
    
    // Show next quest popup
    function showNextQuestPopup(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return;

      // For the Artifact Shrine quest, show a full CinematicDialogue before the standard popup
      if (questId === 'quest_shrineCalibrate' && typeof window.showCinematicDialogue === 'function') {
        window.showCinematicDialogue(
          'A.I.D.A.',
          "Droplet, my sensors detect a high-frequency anomaly from the old ruins in the camp. It's a Shrine of some sort. I need raw combat data to calibrate its frequency.",
          () => {
            showComicInfoBox(
              `🏛️ ${quest.name}`,
              `${quest.description}<br><br><b>Objective:</b> ${quest.objectives}${quest.claim ? `<br><b>Claim:</b> ${quest.claim}` : ''}`,
              'Continue'
            );
          }
        );
        return;
      }

      showComicInfoBox(
        `📜 ${quest.name}`,
        `${quest.description}<br><br><b>Objective:</b> ${quest.objectives}${quest.claim ? `<br><b>Claim:</b> ${quest.claim}` : ''}`,
        'Continue'
      );
    }
    
    // Legacy function for backward compatibility
    function progressQuest(questId, completed = false) {
      // Forward to tutorial quest system
      progressTutorialQuest(questId, completed);
    }
    
    // Legacy function for backward compatibility  
    function claimQuest(questId) {
      // Forward to tutorial quest system
      claimTutorialQuest(questId);
    }
    
    // Advance to next quest in story chain
    function advanceQuestChain() {
      // Quest1 is now activated via the Main Building (showQuestHall), not here.
      // This function is kept for any future use but no longer auto-starts quest1.
    }
    
    // Helper: should questMission building show notification glow?
    function isQuestMissionReady() {
      const tq = saveData && saveData.tutorialQuests;
      if (!tq) return false;
      return (tq.readyToClaim && tq.readyToClaim.length > 0) ||
             (tq.firstDeathShown && !tq.currentQuest && !isQuestClaimed('quest_dailyRoutine') && !isQuestClaimed('quest1_kill3'));
    }
    
    // Update quest tracker in camp screen
    function updateQuestTracker() {
      const questTracker = document.getElementById('quest-tracker');
      if (!questTracker) return;
      
      const currentQuest = getCurrentQuest();
      const completedQuests = (saveData.tutorialQuests && saveData.tutorialQuests.completedQuests) || [];
      const readyToClaim = (saveData.tutorialQuests && saveData.tutorialQuests.readyToClaim) || [];
      const totalQuests = Object.keys(TUTORIAL_QUESTS).length;
      
      // Hide tracker if no quest is active or ready, and no recently completed quest, and player hasn't died yet
      if (!saveData.tutorialQuests.firstDeathShown && !currentQuest && completedQuests.length === 0) {
        questTracker.style.display = 'none';
        return;
      }
      if (!currentQuest && completedQuests.length === 0 && readyToClaim.length === 0) {
        questTracker.style.display = 'none';
        return;
      }
      
      questTracker.innerHTML = '';
      
      // Quest completion summary
      if (completedQuests.length > 0) {
        const summaryEl = document.createElement('div');
        summaryEl.style.cssText = 'font-size: 10px; color: #999; margin-bottom: 4px;';
        summaryEl.textContent = `✅ ${completedQuests.length}/${totalQuests} done`;
        questTracker.appendChild(summaryEl);
      }
      
      // Show last completed quest with strikethrough
      if (completedQuests.length > 0) {
        const lastCompletedId = completedQuests[completedQuests.length - 1];
        const lastCompleted = TUTORIAL_QUESTS[lastCompletedId];
        if (lastCompleted && lastCompleted.name) {
          const completedEl = document.createElement('div');
          completedEl.style.cssText = 'font-size: 10px; color: #4CAF50; text-decoration: line-through; margin-bottom: 3px;';
          completedEl.setAttribute('aria-label', `Completed: ${lastCompleted.name}`);
          completedEl.textContent = `✓ ${lastCompleted.name}`;
          questTracker.appendChild(completedEl);
        }
      }
      
      // Show current active quest with name prominently
      if (currentQuest && saveData.tutorialQuests.firstDeathShown) {
        // Build progress info for kill-based and gathering quests
        let progressText = '';
        const killsNow = (saveData.tutorialQuests && saveData.tutorialQuests.killsThisRun) || 0;
        if (currentQuest.id === 'questForge0_unlock') {
          progressText = ' 🔨 Visit the Forge';
        } else if (currentQuest.id === 'questForge0b_craftTools') {
          progressText = ' 🪓 Craft a tool at the Forge';
        } else if (currentQuest.id === 'quest1_kill3') {
          progressText = ` (${Math.min(killsNow, 3)}/3)`;
        } else if (currentQuest.id === 'quest8_kill10') {
          progressText = ` (${Math.min(killsNow, 10)}/10)`;
        } else if (currentQuest.id === 'quest10_kill15') {
          progressText = ` (${Math.min(killsNow, 15)}/15)`;
        } else if (currentQuest.id === 'quest14_kill25') {
          progressText = ` (${Math.min(killsNow, 25)}/25)`;
        } else if (currentQuest.id === 'quest26_kill20') {
          progressText = ` (${Math.min(killsNow, 20)}/20)`;
        }
        
        const nameEl = document.createElement('b');
        nameEl.style.cssText = 'color: #FFD700; font-size: 12px;';
        nameEl.textContent = `📜 ${currentQuest.name}`;
        const progEl = document.createElement('div');
        progEl.style.cssText = 'font-size: 11px; color: #ccc; margin-top: 2px;';
        progEl.textContent = progressText || 'Active';
        questTracker.appendChild(nameEl);
        questTracker.appendChild(progEl);
      } else if (readyToClaim.length > 0) {
        const readyEl = document.createElement('b');
        readyEl.style.cssText = 'color: #FFD700; font-size: 12px;';
        readyEl.setAttribute('aria-label', 'Quest reward ready to claim at Main Building');
        readyEl.textContent = '🎁 Claim Reward!';
        questTracker.appendChild(readyEl);
      } else if (saveData.tutorialQuests && saveData.tutorialQuests.pendingBuildBuilding) {
        // No active quest because building must be built first
        const _pbBld = saveData.tutorialQuests.pendingBuildBuilding;
        const _pbDef = CAMP_BUILDINGS[_pbBld];
        const _pbName = _pbDef ? _pbDef.name : 'Building';
        const nameEl = document.createElement('b');
        nameEl.style.cssText = 'color: #5DADE2; font-size: 12px;';
        nameEl.textContent = `🔨 Build: ${_pbName}`;
        const hintEl = document.createElement('div');
        hintEl.style.cssText = 'font-size: 10px; color: #ccc; margin-top: 2px;';
        hintEl.textContent = 'Walk to it and build it!';
        questTracker.appendChild(nameEl);
        questTracker.appendChild(hintEl);
      }

      // Show "next building" resource reminder
      const nextCost = saveData.buildingProgress && saveData.buildingProgress.nextBuildingCost;
      if (nextCost && readyToClaim.length > 0) {
        const res = saveData.resources || {};
        const w = res.wood || 0, s = res.stone || 0;
        if (w < nextCost || s < nextCost) {
          const remEl = document.createElement('div');
          remEl.style.cssText = 'font-size: 10px; color: #aaa; margin-top: 3px;';
          remEl.textContent = `🏗️ Next build needs: 🪵${Math.min(w,nextCost)}/${nextCost} 🪨${Math.min(s,nextCost)}/${nextCost}`;
          questTracker.appendChild(remEl);
        }
      }
      
      // Side quest indicator
      if (saveData.achievementQuests && saveData.achievementQuests.kill7Quest === 'active') {
        const sideEl = document.createElement('div');
        sideEl.style.cssText = 'font-size: 10px; color: #9b59b6; margin-top: 3px;';
        sideEl.textContent = '⭐ Side Quest Active';
        questTracker.appendChild(sideEl);
      }
      
      questTracker.style.display = 'block';
    }

    // ── FEATURE 1: Skill Tree Visual Overhaul ─────────────────────────────────
    // Emoji detection regex (compiled once at module scope)
    const _STW_EMOJI_RE = /^\p{Emoji}/u;

    // Renders a full scrollable branching skill tree inside #camp-skills-content.
    function renderSkillTreeWeb() {
      const container = document.getElementById('camp-skills-content');
      if (!container) return;

      // Ensure window.unlockSkill is available for inline onclick handlers
      window.unlockSkill = unlockSkill;

      // Update SP display
      const spDisplay = document.getElementById('skill-points-display');
      if (spDisplay) spDisplay.textContent = `SP: ${saveData.skillPoints}`;

      // Inject styles once
      if (!document.getElementById('skill-tree-web-styles')) {
        const style = document.createElement('style');
        style.id = 'skill-tree-web-styles';
        style.textContent = `
          .stw-wrap { position:relative; width:100%; overflow-x:auto; padding-bottom:20px; }
          .stw-svg   { position:absolute; top:0; left:0; pointer-events:none; z-index:0; }
          .stw-cols  { display:flex; gap:12px; position:relative; z-index:1; min-width:100%; justify-content:center; flex-wrap:wrap; }
          .stw-col   { flex:1; min-width:min(180px, 100%); display:flex; flex-direction:column; align-items:center; padding:0 8px; gap:12px; }
          .stw-col-header { font-family:'Bangers',cursive; font-size:14px; letter-spacing:1px; padding:6px 12px; border-radius:6px; margin-bottom:6px; text-align:center; }
          .stw-node {
            width:100%; max-width:120px; min-height:110px; border-radius:12px; padding:10px 8px;
            display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
            cursor:pointer; position:relative; transition:transform 0.12s, box-shadow 0.15s;
            text-align:center; box-sizing:border-box;
          }
          .stw-node:active { transform:scale(0.95); }
          .stw-node.stw-locked {
            background:rgba(10,10,14,0.82); border:1.5px solid #1e2030;
            filter:saturate(0.15) brightness(0.5);
          }
          .stw-node.stw-available {
            background:rgba(20,22,35,0.92); border:1.5px solid #444;
            box-shadow:0 0 6px rgba(255,215,0,0.08);
          }
          .stw-node.stw-available:hover { transform:scale(1.06); box-shadow:0 0 14px rgba(255,215,0,0.35); }
          .stw-node.stw-owned {
            background:rgba(18,26,14,0.95); border:2px solid #4CAF50;
            box-shadow:0 0 14px rgba(76,175,80,0.45), inset 0 0 6px rgba(76,175,80,0.1);
          }
          .stw-node.stw-owned:hover { box-shadow:0 0 22px rgba(76,175,80,0.7); transform:scale(1.05); }
          .stw-node.stw-maxed {
            background:rgba(20,16,4,0.96); border:2px solid #FFD700;
            box-shadow:0 0 18px rgba(255,215,0,0.55), inset 0 0 8px rgba(255,215,0,0.12);
          }
          .stw-icon   { font-size:24px; line-height:1; margin-bottom:4px; }
          .stw-name   { font-size:10px; font-weight:bold; line-height:1.2; color:#ddd; margin-bottom:3px; word-break:break-word; }
          .stw-desc   { font-size:8px; color:#888; line-height:1.3; margin-bottom:4px; }
          .stw-cost   { font-size:9px; color:#5DADE2; font-weight:bold; }
          .stw-maxlbl { font-size:9px; color:#FFD700; font-weight:bold; }
          .stw-dots   { display:flex; gap:2px; justify-content:center; margin-top:2px; flex-wrap:wrap; }
          .stw-dot    { width:6px; height:6px; border-radius:50%; background:#333; border:1px solid #555; flex-shrink:0; }
          .stw-dot.filled { background:#4CAF50; border-color:#4CAF50; box-shadow:0 0 4px #4CAF50; }
          .stw-dot.filled-gold { background:#FFD700; border-color:#FFD700; box-shadow:0 0 4px #FFD700; }
          .stw-locked .stw-name { color:#444; }
          .stw-locked .stw-desc { color:#2a2a2a; }
          .stw-sp-bar { display:flex; align-items:center; justify-content:center; gap:10px;
            background:rgba(0,0,0,0.5); border-radius:8px; padding:6px 14px; margin-bottom:12px;
            border:1px solid #333; }
          @keyframes stw-pulse { 0%,100%{box-shadow:0 0 12px rgba(255,215,0,0.5)} 50%{box-shadow:0 0 24px rgba(255,215,0,0.9)} }
          .stw-available { animation: stw-pulse 2s infinite; }
        `;
        document.head.appendChild(style);
      }

      // ── 3-Column Layout: Movement (Blue) | Critical (Red) | Utility (Green) ──
      const TREE_COLS = {
        movement: {
          label: '⚡ MOVEMENT',
          color: '#4da6ff',
          border: '2px solid #4da6ff',
          bg: 'linear-gradient(180deg, rgba(0,60,120,0.9) 0%, rgba(0,20,60,0.95) 100%)',
          skills: ['dash','dashMaster','speedster','cooldownExpert','quickReflex','secondWind','endurance','auraExpansion']
        },
        critical: {
          label: '🎯 CRITICAL',
          color: '#ff4444',
          border: '2px solid #ff4444',
          bg: 'linear-gradient(180deg, rgba(120,0,0,0.9) 0%, rgba(60,0,0,0.95) 100%)',
          skills: ['criticalFocus','headshot','armorPierce','executioner','bloodlust','berserker','weaponSpecialist','multiHit','combatMastery','bladeDancer','heavyStrike','rapidFire','combatVeteran','meleeTakedown']
        },
        utility: {
          label: '🌿 UTILITY',
          color: '#44dd88',
          border: '2px solid #44dd88',
          bg: 'linear-gradient(180deg, rgba(0,60,20,0.9) 0%, rgba(0,30,10,0.95) 100%)',
          skills: ['autoAim','wealthHunter','quickLearner','magnetism','efficiency','scavenger','fortuneFinder','survivalist','ironSkin','fortification','regeneration','lastStand','toughness','guardian','resilience','immortal','resourceful','treasureHunter','fireMastery','iceMastery','lightningMastery','elementalFusion','pyromaniac','frostbite','stormCaller','manaOverflow','spellEcho','arcaneEmpowerment']
        }
      };

      // Helper: get state of a skill
      const getState = (skillId) => {
        const skill = SKILL_TREE[skillId];
        if (!skill) return 'locked';
        const skillData = saveData.skillTree[skillId] || { level: 0, unlocked: false };
        const level = skillData.level || 0;
        const isMaxLevel = level >= skill.maxLevel;
        if (isMaxLevel) return 'maxed';
        if (level > 0) return 'owned';
        if (!skill.requires) return 'available';
        const parentData = saveData.skillTree[skill.requires] || { level: 0 };
        if ((parentData.level || 0) > 0) return 'available';
        return 'locked';
      };

      const SKILL_ICONS = {
        dash:'🏃', criticalFocus:'🎯', autoAim:'🔫', dashMaster:'⚡', headshot:'💀',
        combatMastery:'⚔️', bladeDancer:'🗡️', heavyStrike:'🔨', rapidFire:'🔥',
        armorPierce:'🔩', multiHit:'🎯', executioner:'☠️', bloodlust:'🩸',
        berserker:'😡', weaponSpecialist:'🏹', combatVeteran:'🎖️',
        survivalist:'🌿', ironSkin:'🛡️', quickReflex:'🦶', fortification:'🏰',
        regeneration:'💚', lastStand:'🏴', toughness:'💪', guardian:'🔰',
        resilience:'🌊', secondWind:'🌬️', endurance:'🏋️', immortal:'✨',
        wealthHunter:'💰', quickLearner:'📚', magnetism:'🧲', efficiency:'⚙️',
        scavenger:'🔍', fortuneFinder:'🍀', speedster:'💨', cooldownExpert:'⏱️',
        auraExpansion:'🌀', resourceful:'📦', treasureHunter:'💎',
        fireMastery:'🔥', iceMastery:'❄️', lightningMastery:'⚡',
        elementalFusion:'🌈', pyromaniac:'🌋', frostbite:'🧊', stormCaller:'⛈️',
        elementalChain:'⛓️', manaOverflow:'🔮', spellEcho:'🪄',
        arcaneEmpowerment:'✴️', elementalOverload:'🌟',
        meleeTakedown:'🔪'
      };
      const getIcon = (id, name) => SKILL_ICONS[id] || (name && _STW_EMOJI_RE.test(name) ? [...name][0] : '🔮');

      // Build glossy node HTML with colored border and unlock animation support
      const buildNode3Col = (skillId, colColor) => {
        const skill = SKILL_TREE[skillId];
        if (!skill) return '';
        const skillData = saveData.skillTree[skillId] || { level: 0 };
        const level = skillData.level || 0;
        const isMaxLevel = level >= skill.maxLevel;
        const state = getState(skillId);
        const canAfford = saveData.skillPoints >= skill.cost;

        let borderColor = colColor;
        let bgStyle = 'rgba(10,12,20,0.92)';
        let glowStyle = '';
        let filterStyle = '';

        if (state === 'locked') {
          filterStyle = 'filter:saturate(0.1) brightness(0.4);';
          bgStyle = 'rgba(5,5,10,0.9)';
          borderColor = '#222';
        } else if (state === 'owned' || state === 'maxed') {
          const glow = state === 'maxed' ? colColor + '99' : colColor + '55';
          glowStyle = `box-shadow:0 0 14px ${glow}, inset 0 1px 0 rgba(255,255,255,0.1);`;
          bgStyle = 'rgba(15,20,10,0.95)';
        } else if (state === 'available' && canAfford) {
          glowStyle = `box-shadow:0 0 10px ${colColor}44, inset 0 1px 0 rgba(255,255,255,0.08);`;
        }

        let dotsHTML = '';
        if (skill.maxLevel > 1) {
          dotsHTML = '<div style="display:flex;gap:2px;justify-content:center;margin-top:3px;flex-wrap:wrap;">';
          for (let d = 0; d < Math.min(skill.maxLevel, 5); d++) { // Max 5 dots for UI space
            const filled = d < level;
            const gold = filled && isMaxLevel;
            const dotColor = gold ? '#FFD700' : filled ? colColor : '#333';
            const dotGlow = filled ? `box-shadow:0 0 4px ${dotColor};` : '';
            dotsHTML += `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};${dotGlow}border:1px solid ${filled ? dotColor : '#444'};flex-shrink:0;"></span>`;
          }
          dotsHTML += '</div>';
        }

        const canUnlock = state !== 'locked' && !isMaxLevel && canAfford;
        const clickHandler = canUnlock ? `onclick="window.unlockSkill('${skillId}'); this.classList.add('stw-unlock-anim');"` : '';
        const title = `${skill.name} — ${skill.description} (Cost: ${skill.cost} SP${isMaxLevel ? ' | MAX' : ''})`;
        const hoverInfo = `data-info="${skill.name}: ${skill.description} | ${isMaxLevel ? 'MAX LEVEL' : 'Cost: ' + skill.cost + ' SP'}"`;

        return `<div class="stw-node3 ${state}" 
          style="position:relative;width:90%;max-width:110px;min-height:90px;border-radius:10px;padding:8px 6px;
            display:flex;flex-direction:column;align-items:center;justify-content:flex-start;cursor:${canUnlock ? 'pointer' : 'default'};
            text-align:center;box-sizing:border-box;
            background:${bgStyle};border:1.5px solid ${borderColor};${glowStyle}${filterStyle}
            transition:transform 0.12s,box-shadow 0.15s;
            background-image:linear-gradient(135deg,rgba(255,255,255,0.06) 0%,transparent 50%),linear-gradient(315deg,rgba(255,255,255,0.03) 0%,transparent 50%);"
          ${clickHandler} title="${title.replace(/"/g,"'")}" ${hoverInfo}>
          <div style="font-size:22px;line-height:1;margin-bottom:3px;">${getIcon(skillId, skill.name)}</div>
          <div style="font-size:9px;font-weight:bold;line-height:1.2;color:${state === 'locked' ? '#444' : '#ddd'};margin-bottom:2px;word-break:break-word;">${skill.name}</div>
          ${isMaxLevel ? `<div style="font-size:8px;color:#FFD700;font-weight:bold;">✅ MAX</div>` : `<div style="font-size:8px;color:${colColor};font-weight:bold;">${skill.cost} SP</div>`}
          ${dotsHTML}
        </div>`;
      };

      // Inject 3-column styles once
      if (!document.getElementById('stw3-styles')) {
        const s3 = document.createElement('style');
        s3.id = 'stw3-styles';
        s3.textContent = `
          .stw3-wrap { display:flex; gap:6px; width:100%; box-sizing:border-box; padding:0 2px; }
          .stw3-col { flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px; border-radius:12px; padding:8px 4px; }
          .stw3-col-hdr { width:90%; font-family:'Bangers',cursive; font-size:13px; letter-spacing:1px; padding:5px 8px; border-radius:8px; text-align:center; margin-bottom:4px; }
          .stw-sp-bar3 { display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,0,0.6);border-radius:8px;padding:6px 12px;margin-bottom:10px;border:1px solid #333; }
          @keyframes stw-unlock-flash { 0%{transform:scale(1)} 20%{transform:scale(1.18)} 40%{transform:scale(0.96)} 60%{transform:scale(1.08)} 80%{transform:scale(0.99)} 100%{transform:scale(1);} }
          @keyframes stw-border-trace { 0%{border-color:#FFD700;box-shadow:0 0 0 0 #FFD70088} 50%{box-shadow:0 0 18px 4px #FFD70099} 100%{border-color:inherit;box-shadow:inherit;} }
          .stw-unlock-anim { animation: stw-unlock-flash 0.5s ease-out, stw-border-trace 0.5s ease-out; }
          .stw-info-box { position:fixed;z-index:9999;background:#0a0a0a;border:1.5px solid #00ff88;border-radius:8px;padding:10px 14px;max-width:220px;font-size:12px;color:#00ff88;font-family:'Bangers',cursive;letter-spacing:0.5px;pointer-events:none;box-shadow:0 4px 20px rgba(0,255,136,0.25); }
        `;
        document.head.appendChild(s3);
      }

      let html = `<div class="stw-sp-bar3">
        <span style="font-size:14px;">🔮</span>
        <span style="color:#FFD700;font-weight:bold;font-size:15px;">${saveData.skillPoints} SP</span>
        <span style="color:#888;font-size:11px;">available</span>
      </div>
      <div class="stw3-wrap">`;

      for (const [colKey, colDef] of Object.entries(TREE_COLS)) {
        html += `<div class="stw3-col" style="background:${colDef.bg};border:${colDef.border};">
          <div class="stw3-col-hdr" style="color:${colDef.color};border:1.5px solid ${colDef.color}44;background:${colDef.color}15;">${colDef.label}</div>`;
        for (const sid of colDef.skills) {
          html += buildNode3Col(sid, colDef.color);
        }
        html += `</div>`;
      }

      html += `</div>`;
      container.innerHTML = html;

      // Hover info box
      let _infoBox = null;
      container.addEventListener('mouseover', function(e) {
        const node = e.target.closest('[data-info]');
        if (!node) return;
        if (!_infoBox) {
          _infoBox = document.createElement('div');
          _infoBox.className = 'stw-info-box';
          document.body.appendChild(_infoBox);
        }
        _infoBox.textContent = node.getAttribute('data-info');
        _infoBox.style.display = 'block';
      });
      container.addEventListener('mousemove', function(e) {
        if (_infoBox && _infoBox.style.display !== 'none') {
          _infoBox.style.left = (e.clientX + 12) + 'px';
          _infoBox.style.top = (e.clientY - 10) + 'px';
        }
      });
      container.addEventListener('mouseout', function(e) {
        const node = e.target.closest('[data-info]');
        if (node && _infoBox) _infoBox.style.display = 'none';
      });
    }

    // Export renderSkillTreeWeb
    if (!window.CampSkillSystem) window.CampSkillSystem = {};
    window.CampSkillSystem.renderSkillTreeWeb = renderSkillTreeWeb;
    window.unlockSkill = unlockSkill;

    /* ================================================================
       MINIGAME SKILL TREE
       Currency: saveData.astralEssence (same currency earned in the
       Astral Dive minigame).  Bonuses apply inside the minigame only.
    ================================================================ */
    const MINIGAME_SKILL_TREE = {
      atkBoost: {
        id: 'atkBoost', name: '⚔️ ATK Boost', icon: '⚔️',
        description: '+10% bullet damage per level',
        maxLevel: 5, cost: 15, requires: null,
        bonus: (l) => ({ damageMult: 0.10 * l })
      },
      spdBoost: {
        id: 'spdBoost', name: '💨 Speed Boost', icon: '💨',
        description: '+6% player move speed per level',
        maxLevel: 5, cost: 12, requires: null,
        bonus: (l) => ({ speedMult: 0.06 * l })
      },
      rapidFire: {
        id: 'rapidFire', name: '⚡ Rapid Fire', icon: '⚡',
        description: 'Reduce shoot cooldown by 15% per level',
        maxLevel: 3, cost: 20, requires: 'spdBoost',
        bonus: (l) => ({ rapidFire: 0.15 * l })
      },
      multiShot: {
        id: 'multiShot', name: '🔫 Multi-Shot', icon: '🔫',
        description: 'Fire additional bullets (+1 per level)',
        maxLevel: 3, cost: 25, requires: 'atkBoost',
        bonus: (l) => ({ extraBullets: l })
      },
      shield: {
        id: 'shield', name: '🛡️ Shield', icon: '🛡️',
        description: 'Start with a 1-hit damage-absorbing shield',
        maxLevel: 1, cost: 50, requires: 'atkBoost',
        bonus: (l) => ({ shield: l > 0 })
      },
      bombBlast: {
        id: 'bombBlast', name: '💣 Bomb Blast', icon: '💣',
        description: 'Start each run with extra screen-clearing bombs',
        maxLevel: 3, cost: 35, requires: 'multiShot',
        bonus: (l) => ({ startBombs: l })
      },
      magnetDrop: {
        id: 'magnetDrop', name: '🧲 Magnet Drop', icon: '🧲',
        description: 'Auto-attract nearby collectibles to the player',
        maxLevel: 1, cost: 60, requires: 'rapidFire',
        bonus: (l) => ({ magnetRange: l > 0 ? 90 : 0 })
      },
      waveBreaker: {
        id: 'waveBreaker', name: '🌊 Wave Breaker', icon: '🌊',
        description: 'Skip early waves at run start (+1 starting wave per level)',
        maxLevel: 2, cost: 80, requires: 'bombBlast',
        bonus: (l) => ({ startWave: l })
      }
    };

    /** Returns the combined bonus object from all purchased minigame skills. */
    function getMinigameSkillBonuses() {
      const result = {};
      if (typeof saveData === 'undefined' || !saveData.minigameSkills) return result;
      for (const [id, def] of Object.entries(MINIGAME_SKILL_TREE)) {
        const level = (saveData.minigameSkills[id] && saveData.minigameSkills[id].level) || 0;
        if (level === 0) continue;
        const b = def.bonus(level);
        for (const [k, v] of Object.entries(b)) {
          if (typeof v === 'boolean') result[k] = result[k] || v;
          else result[k] = (result[k] || 0) + v;
        }
      }
      return result;
    }

    /** Purchase one level of a minigame skill. */
    function unlockMinigameSkill(skillId) {
      if (typeof saveData === 'undefined') return false;
      if (!saveData.minigameSkills) saveData.minigameSkills = {};
      const def = MINIGAME_SKILL_TREE[skillId];
      if (!def) return false;
      const current = (saveData.minigameSkills[skillId] && saveData.minigameSkills[skillId].level) || 0;
      if (current >= def.maxLevel) { alert('Already at max level!'); return false; }
      // Check requires
      if (def.requires) {
        const reqLevel = (saveData.minigameSkills[def.requires] && saveData.minigameSkills[def.requires].level) || 0;
        if (reqLevel === 0) { alert('Requires ' + MINIGAME_SKILL_TREE[def.requires].name + ' first!'); return false; }
      }
      const cost = def.cost * (current + 1);
      if ((saveData.astralEssence || 0) < cost) { alert('Need ' + cost + ' ⚡ Astral Essence! (Have: ' + (saveData.astralEssence || 0) + ')'); return false; }
      saveData.astralEssence -= cost;
      if (!saveData.minigameSkills[skillId]) saveData.minigameSkills[skillId] = { level: 0 };
      saveData.minigameSkills[skillId].level = current + 1;
      if (typeof saveSaveData === 'function') saveSaveData();
      return true;
    }

    /** Show the Minigame Skill Tree UI overlay. */
    function showMinigameSkillTree() {
      const existing = document.getElementById('minigame-skill-tree-overlay');
      if (existing) existing.remove();
      if (!saveData.minigameSkills) saveData.minigameSkills = {};

      const overlay = document.createElement('div');
      overlay.id = 'minigame-skill-tree-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:1500;background:rgba(0,0,20,0.93);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow-y:auto;padding:20px 10px 40px;box-sizing:border-box;';

      function _render() {
        const essence = (typeof saveData !== 'undefined') ? (saveData.astralEssence || 0) : 0;
        const rows = [];
        rows.push(`<div style="text-align:center;margin-bottom:4px;">
          <div style="font-family:Bangers,cursive;font-size:clamp(20px,4vw,32px);color:#00ffff;letter-spacing:4px;text-shadow:0 0 14px #00ffff;">🎮 ASTRAL SKILL TREE</div>
          <div style="font-family:Arial,sans-serif;font-size:13px;color:#888;margin-top:4px;">Upgrade your minigame ship with Astral Essence</div>
          <div style="font-family:monospace;font-size:16px;color:#4488ff;margin-top:6px;">⚡ Available: <b>${essence}</b></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:700px;margin-top:14px;">`);

        for (const [id, def] of Object.entries(MINIGAME_SKILL_TREE)) {
          const level = (saveData.minigameSkills[id] && saveData.minigameSkills[id].level) || 0;
          const maxed = level >= def.maxLevel;
          const reqLevel = def.requires ? ((saveData.minigameSkills[def.requires] && saveData.minigameSkills[def.requires].level) || 0) : 1;
          const locked = def.requires && reqLevel === 0;
          const nextCost = def.cost * (level + 1);
          const canAfford = !maxed && !locked && essence >= nextCost;

          rows.push(`<div style="background:rgba(0,20,40,0.88);border:2px solid ${maxed ? '#ffaa00' : locked ? '#333' : '#2255aa'};border-radius:10px;padding:12px 14px;width:200px;box-sizing:border-box;opacity:${locked ? '0.45' : '1'};">
            <div style="font-size:22px;text-align:center;margin-bottom:4px;">${def.icon}</div>
            <div style="font-family:Bangers,cursive;font-size:15px;color:${maxed ? '#ffaa00' : '#00ffff'};letter-spacing:1px;">${def.name}</div>
            <div style="font-family:Arial,sans-serif;font-size:11px;color:#aaa;margin:4px 0;">${def.description}</div>
            <div style="font-size:12px;color:#888;margin-bottom:8px;">Level: <b style="color:#fff;">${level}/${def.maxLevel}</b>${locked ? ' 🔒 (Requires ' + (MINIGAME_SKILL_TREE[def.requires] ? MINIGAME_SKILL_TREE[def.requires].name : def.requires) + ')' : ''}</div>
            ${maxed ? '<div style="color:#ffaa00;font-family:Bangers,cursive;font-size:14px;text-align:center;">✓ MAXED</div>'
              : locked ? '<div style="color:#555;font-size:12px;text-align:center;">🔒 Locked</div>'
              : `<button onclick="window._unlockMinigameSkillAndRefresh('${id}')" style="width:100%;padding:6px;background:${canAfford ? 'rgba(0,100,200,0.2)' : 'rgba(50,50,50,0.3)'};border:1.5px solid ${canAfford ? '#00ffff' : '#444'};color:${canAfford ? '#00ffff' : '#666'};font-family:monospace;font-size:13px;cursor:${canAfford ? 'pointer' : 'default'};border-radius:4px;">UPGRADE ⚡${nextCost}</button>`}
          </div>`);
        }
        rows.push('</div>');
        rows.push(`<button onclick="document.getElementById('minigame-skill-tree-overlay').remove()" style="margin-top:20px;padding:10px 36px;background:transparent;border:2px solid #888;color:#ccc;font-family:Bangers,cursive;font-size:16px;letter-spacing:2px;cursor:pointer;border-radius:8px;">CLOSE</button>`);
        overlay.innerHTML = rows.join('');
      }

      window._unlockMinigameSkillAndRefresh = function(id) {
        if (unlockMinigameSkill(id)) _render();
      };

      _render();
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }

    // Expose globally
    window.MINIGAME_SKILL_TREE = MINIGAME_SKILL_TREE;
    window.getMinigameSkillBonuses = getMinigameSkillBonuses;
    window.unlockMinigameSkill = unlockMinigameSkill;
    window.showMinigameSkillTree = showMinigameSkillTree;

