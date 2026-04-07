// js/save-system.js — Notification/inbox system, save/load (localStorage), achievements, super-stat bar (SSB),
// player attributes, and gear/equipment system.
// Depends on: variables from main.js (playerStats, saveData, etc.)

    // --- NOTIFICATION/INBOX SYSTEM ---
    const notifications = [];
    const inventory = [];
    const RARITY = {
      COMMON:   { name: 'Common',   color: 0xAAAAAA, multiplier: 1.0  },
      UNCOMMON: { name: 'Uncommon', color: 0x55CC55, multiplier: 1.15 },
      RARE:     { name: 'Rare',     color: 0x5DADE2, multiplier: 1.25 },
      EPIC:     { name: 'Epic',     color: 0x9B59B6, multiplier: 1.5  },
      LEGENDARY:{ name: 'Legendary',color: 0xF39C12, multiplier: 2.0  },
      MYTHIC:   { name: 'Mythic',   color: 0xE74C3C, multiplier: 3.0  }
    };

    // --- SAVE SYSTEM ---
    // FRESH START - Changed save key to force reset after comprehensive re-implementation
    const SAVE_KEY = 'waterDropSurvivorSave_v2_FreshStart';
    const SETTINGS_KEY = 'waterDropSurvivorSettings';

    const defaultSaveData = {
      gold: 0,
      totalGoldEarned: 0,
      totalRuns: 0,
      totalKills: 0, // Track cumulative kills for quest progression
      bestTime: 0,
      bestKills: 0,
      gearTierLimit: 'rare', // Max gear tier before Prestige (common/uncommon/rare only)
      upgrades: {
        maxHp: 0,
        hpRegen: 0,
        moveSpeed: 0,
        attackDamage: 0,
        attackSpeed: 0,
        critChance: 0,
        critDamage: 0,
        armor: 0,
        cooldownReduction: 0,
        goldEarned: 0,
        expEarned: 0,
        maxWeapons: 0
      },
      achievements: [],
      achievementQuests: { kill7Unlocked: false, kill7Quest: 'none' }, // 'none'|'active'|'complete'
      // Achievement tracking stats
      stats: {
        itemsCrafted: 0,        // Total items crafted at Artisan's Workshop
        weaponsUpgraded: 0,     // Total weapon upgrades purchased
        statCardsUsed: 0,       // Total stat cards used at Warehouse
        spinWheelSpins: 0,      // Total weapon spin wheel spins
        companionsLeveled: 0,   // Total companion levels gained
        buildingsUpgraded: 0,   // Total camp buildings upgraded
        questsCompleted: 0,     // Total quests completed
        skillsUnlocked: 0,      // Total skills unlocked in skill tree
        gearsEquipped: 0        // Total times gear equipped
      },
      accountLevel: 1,          // Player's account profile level
      accountXP: 0,             // Account XP for leveling
      // Achievement-based attribute points
      attributes: {
        dexterity: 0,
        strength: 0,
        vitality: 0,
        luck: 0,
        wisdom: 0,
        // New training hall attributes
        endurance: 0,
        flexibility: 0
      },
      unspentAttributePoints: 0,
      // Gear system
      // Phase 1: Expand gear system to 6 slots with enhanced RPG stats
      equippedGear: {
        weapon: null,        // Main weapon slot
        armor: null,         // Body armor slot  
        helmet: null,        // Head slot (Phase 1)
        boots: null,         // Feet slot (Phase 1)
        ring: null,          // Accessory ring slot (Phase 1)
        amulet: null         // Accessory amulet slot (Phase 1)
      },
      inventory: [],
      consumables: [], // Single-use consumable items (e.g. Crimson Eclipse Core)
      hasSeenCrimsonCoreDialogue: false, // AIDA dialogue flag for first CEC obtain
      // Artifact System
      artifacts: [],
      equippedArtifacts: [null, null, null],
      // Phase 5: Companion System
      companions: {
        greyAlien: { unlocked: true, level: 1, xp: 0, skills: {} },
        stormWolf: { unlocked: false, level: 1, xp: 0, skills: {} },
        skyFalcon: { unlocked: false, level: 1, xp: 0, skills: {} },
        waterSpirit: { unlocked: false, level: 1, xp: 0, skills: {} }
      },
      selectedCompanion: 'greyAlien', // Default companion — Grey Alien from UFO crash site
      hasCompanionEgg: false, // Companion egg found at UFO sight (Area 51)
      companionEggHatched: false, // Whether the UFO companion egg has been hatched
      companionEggHatchProgress: 0, // 0-100 hatching progress
      companionSkillPoints: 0, // Skill points for companion skill tree
      companionGrowthStage: 'egg', // Growth stages: egg, newborn, juvenile, adult
      alienBiomatter: 0, // Alien Biomatter collected — deposit 50 at the Incubator to hatch companion
      alienIncubatorHatched: false, // Grey Alien companion hatched from Incubator pod
      // Companion Exploration System
      exploration: {
        level: 1,
        xp: 0,
        activeExpedition: null,
        history: []
      },
      // Camp System - Quest-Driven Building Unlock System
      campBuildings: {
        questMission: { level: 1, maxLevel: 1, unlocked: true },
        inventory: { level: 0, maxLevel: 1, unlocked: false },
        campHub: { level: 0, maxLevel: 1, unlocked: false },
        loreMaster: { level: 0, maxLevel: 1, unlocked: false },
        campBoard: { level: 0, maxLevel: 1, unlocked: false },
        skillTree: { level: 0, maxLevel: 1, unlocked: false },
        companionHouse: { level: 0, maxLevel: 1, unlocked: false },
        forge: { level: 0, maxLevel: 1, unlocked: false },
        armory: { level: 0, maxLevel: 1, unlocked: false },
        trainingHall: { level: 0, maxLevel: 1, unlocked: false },
        trashRecycle: { level: 0, maxLevel: 1, unlocked: false },
        tempShop: { level: 0, maxLevel: 1, unlocked: false },
        achievementBuilding: { level: 0, maxLevel: 1, unlocked: false },
        accountBuilding: { level: 0, maxLevel: 1, unlocked: false },
        idleMenu: { level: 0, maxLevel: 1, unlocked: false },
        characterVisuals: { level: 0, maxLevel: 1, unlocked: false },
        codex: { level: 0, maxLevel: 1, unlocked: false },
        // Legacy buildings (for compatibility)
        trainingGrounds: { level: 0, maxLevel: 1, unlocked: false },
        library: { level: 0, maxLevel: 1, unlocked: false },
        workshop: { level: 0, maxLevel: 1, unlocked: false },
        shrine: { level: 0, maxLevel: 3, unlocked: false },
        specialAttacks: { level: 0, maxLevel: 1, unlocked: false },
        warehouse: { level: 0, maxLevel: 1, unlocked: false },
        tavern:    { level: 0, maxLevel: 1, unlocked: false },
        shop:      { level: 0, maxLevel: 1, unlocked: false },
        prestige:  { level: 0, maxLevel: 1, unlocked: false },
        campfireKitchen: { level: 0, maxLevel: 1, unlocked: false },
        weaponsmith: { level: 0, maxLevel: 1, unlocked: false },
        prismReliquary: { level: 0, maxLevel: 1, unlocked: false },
        neuralMatrix:   { level: 0, maxLevel: 1, unlocked: false },
        astralGateway:  { level: 0, maxLevel: 1, unlocked: false },
        droppletShop:   { level: 0, maxLevel: 1, unlocked: false }  // The Dropplet Shop
      },
      // Neural Matrix unlock state (which nodes the player has activated)
      neuralMatrix: {},
      // COMPREHENSIVE SKILL TREE - 48 Skills Total (Fresh Implementation)
      skillTree: {
        // COMBAT PATH (12 skills)
        combatMastery: { unlocked: false, level: 0, maxLevel: 5 },
        bladeDancer: { unlocked: false, level: 0, maxLevel: 3 },
        heavyStrike: { unlocked: false, level: 0, maxLevel: 3 },
        rapidFire: { unlocked: false, level: 0, maxLevel: 3 },
        criticalFocus: { unlocked: false, level: 0, maxLevel: 5 },
        armorPierce: { unlocked: false, level: 0, maxLevel: 3 },
        multiHit: { unlocked: false, level: 0, maxLevel: 3 },
        executioner: { unlocked: false, level: 0, maxLevel: 3 },
        bloodlust: { unlocked: false, level: 0, maxLevel: 3 },
        berserker: { unlocked: false, level: 0, maxLevel: 3 },
        weaponSpecialist: { unlocked: false, level: 0, maxLevel: 5 },
        combatVeteran: { unlocked: false, level: 0, maxLevel: 3 },
        
        // DEFENSE PATH (12 skills)
        survivalist: { unlocked: false, level: 0, maxLevel: 5 },
        ironSkin: { unlocked: false, level: 0, maxLevel: 3 },
        quickReflex: { unlocked: false, level: 0, maxLevel: 3 },
        fortification: { unlocked: false, level: 0, maxLevel: 5 },
        regeneration: { unlocked: false, level: 0, maxLevel: 3 },
        lastStand: { unlocked: false, level: 0, maxLevel: 3 },
        toughness: { unlocked: false, level: 0, maxLevel: 3 },
        guardian: { unlocked: false, level: 0, maxLevel: 3 },
        resilience: { unlocked: false, level: 0, maxLevel: 3 },
        secondWind: { unlocked: false, level: 0, maxLevel: 3 },
        endurance: { unlocked: false, level: 0, maxLevel: 5 },
        immortal: { unlocked: false, level: 0, maxLevel: 3 },
        
        // UTILITY PATH (12 skills)
        wealthHunter: { unlocked: false, level: 0, maxLevel: 5 },
        quickLearner: { unlocked: false, level: 0, maxLevel: 5 },
        magnetism: { unlocked: false, level: 0, maxLevel: 3 },
        efficiency: { unlocked: false, level: 0, maxLevel: 3 },
        scavenger: { unlocked: false, level: 0, maxLevel: 3 },
        fortuneFinder: { unlocked: false, level: 0, maxLevel: 3 },
        speedster: { unlocked: false, level: 0, maxLevel: 3 },
        dashMaster: { unlocked: false, level: 0, maxLevel: 3 },
        cooldownExpert: { unlocked: false, level: 0, maxLevel: 3 },
        auraExpansion: { unlocked: false, level: 0, maxLevel: 3 },
        resourceful: { unlocked: false, level: 0, maxLevel: 5 },
        treasureHunter: { unlocked: false, level: 0, maxLevel: 3 },
        
        // ELEMENTAL PATH (12 skills)
        fireMastery: { unlocked: false, level: 0, maxLevel: 3 },
        iceMastery: { unlocked: false, level: 0, maxLevel: 3 },
        lightningMastery: { unlocked: false, level: 0, maxLevel: 3 },
        elementalFusion: { unlocked: false, level: 0, maxLevel: 3 },
        pyromaniac: { unlocked: false, level: 0, maxLevel: 3 },
        frostbite: { unlocked: false, level: 0, maxLevel: 3 },
        stormCaller: { unlocked: false, level: 0, maxLevel: 3 },
        elementalChain: { unlocked: false, level: 0, maxLevel: 3 },
        manaOverflow: { unlocked: false, level: 0, maxLevel: 3 },
        spellEcho: { unlocked: false, level: 0, maxLevel: 3 },
        arcaneEmpowerment: { unlocked: false, level: 0, maxLevel: 5 },
        elementalOverload: { unlocked: false, level: 0, maxLevel: 3 },
        
        // NEW SKILLS (Feature 1)
        dash: { unlocked: false, level: 0, maxLevel: 5 },
        headshot: { unlocked: false, level: 0, maxLevel: 5 },
        autoAim: { unlocked: false, level: 0, maxLevel: 1 },
        // Special Attack unlock/upgrade nodes (maxLevel: 3 = 3 upgrade tiers)
        specialKnifeTakedown: { unlocked: false, level: 0, maxLevel: 3 },
        specialShockwave:    { unlocked: false, level: 0, maxLevel: 3 },
        specialFrozenStorm:  { unlocked: false, level: 0, maxLevel: 3 },
        specialDeathBlossom: { unlocked: false, level: 0, maxLevel: 3 },
        specialThunderStrike: { unlocked: false, level: 0, maxLevel: 3 },
        specialVoidPulse:    { unlocked: false, level: 0, maxLevel: 3 },
        specialInfernoRing:  { unlocked: false, level: 0, maxLevel: 3 },
        specialAcidCloud:    { unlocked: false, level: 0, maxLevel: 3 },
        specialGravityWell:  { unlocked: false, level: 0, maxLevel: 3 },
        specialSonicBoom:    { unlocked: false, level: 0, maxLevel: 3 },
        specialBloodRain:    { unlocked: false, level: 0, maxLevel: 3 },
        specialTimeFracture: { unlocked: false, level: 0, maxLevel: 3 },
        specialChainLightning: { unlocked: false, level: 0, maxLevel: 3 },
        specialMirrorField:  { unlocked: false, level: 0, maxLevel: 3 },
        specialMeteorStrike: { unlocked: false, level: 0, maxLevel: 3 },
        specialShadowClone:  { unlocked: false, level: 0, maxLevel: 3 },
        specialForceBarrier: { unlocked: false, level: 0, maxLevel: 3 },
        specialPlasmaBurst:  { unlocked: false, level: 0, maxLevel: 3 },
        specialEarthquake:   { unlocked: false, level: 0, maxLevel: 3 },
        specialAdrenalineRush: { unlocked: false, level: 0, maxLevel: 3 },
        // Melee Takedown unlock node (legacy — keep for backward compatibility)
        meleeTakedown:       { unlocked: false, level: 0, maxLevel: 1 }
      },
      // Special attacks loadout (max 4 equipped at once; populated after unlocking)
      equippedSpecials: [],
      specialAtkPoints: 0, // Points earned to unlock/upgrade special attacks
      specialBranch: null, // 'upper' | 'lower' — chosen after knife is unlocked
      specialSlotsUnlocked: 1, // Number of active SA slots (1–4, unlocked via Special Attacks building)
      skillPoints: 0, // Start with 0 skill points - earn through quests
      // Account Level System - Persistent across all runs
      accountLevel: 1, // Persistent character level
      accountXP: 0,    // Total XP earned (quests + kills)
      // Passive Skills System
      passiveSkills: {},       // Object: skillId → level
      passiveSkillPoints: 0,   // Points to spend on passive skills
      // ── Profile Account Deep Stats — individually upgradeable per-stat levels ─
      // Unlocked/upgraded in the Profile & Records building. Each key stores the
      // number of upgrade levels purchased. The stat-aggregator reads these and
      // applies them on top of all other bonuses when a run starts.
      profileAccount: {
        // Movement & Control
        topSpeed:             0,  // +0.3 world-units/s per level  (base 6.5)
        acceleration:         0,  // +1.5 wu/s² per level          (base 22)
        friction:             0,  // +0.8 wu/s² per level          (base 18)
        turnSpeed:            0,  // +0.05× per level              (base 1.0×)
        inputResponsiveness:  0,  // +0.01 per level               (base 0.12)
        // Gunplay / Ranged
        fireRate:             0,  // +0.08× per level              (base 1.0×)
        reloadSpeed:          0,  // +0.10× per level              (base 1.0×)
        aimSpeed:             0,  // +0.08× per level              (base 1.0×)
        projectileSpeed:      0,  // +0.08× per level              (base 1.0×)
        magazineCapacity:     0,  // +1 bullet per level           (base 5)
        // Melee / Close Combat
        meleeAttackSpeed:     0,  // +0.07× per level              (base 1.0×)
        cleaveAngle:          0,  // +5 degrees per level          (base 60°)
        knockbackPower:       0,  // +0.10× per level              (base 1.0×)
        meleeRange:           0,  // +0.08× per level              (base 1.0×)
        // Survivability
        maxHp:                0,  // +20 HP per level
        hpRegen:              0,  // +0.5 HP/s per level
        flatArmor:            0,  // +4 flat armor per level
        evadeChance:          0,  // +0.02 (2%) per level          (cap 0.60)
        staggerResistance:    0,  // +0.03 per level               (cap 0.75)
        // Offense (granular)
        meleeDamage:          0,  // +3 flat melee damage per level
        projectileDamage:     0,  // +3 flat projectile damage per level
        critChance:           0,  // +0.02 per level               (cap 0.85)
        critDamage:           0,  // +0.10× per level
        armorPiercing:        0,  // +0.05 per level               (cap 0.80)
        // Utility
        luck:                 0,  // +0.03 per level               (cap 1.0)
        xpCollectionRadius:   0,  // +0.08× per level
        goldDropBonus:        0,  // +0.05 (5%) per level
        expGainBonus:         0,  // +0.05 (5%) per level
        // Elemental
        fireDamage:           0,  // +0.05 (5%) per level
        iceDamage:            0,  // +0.05 (5%) per level
        lightningDamage:      0,  // +0.05 (5%) per level
        // Cooldowns
        dashCooldown:         0,  // -0.05 (5% faster) per level  (cap -0.60)
        skillCooldown:        0   // -0.05 (5% faster) per level  (cap -0.60)
      },
      // Camp state
      hasVisitedCamp: false, // Track first camp visit
      nextRunTimeOfDay: 'day', // 'day' or 'night' - chosen from sleep option
      lastDeathHour: 6, // Track hour of day for time progression (0-23, starts at 6 AM)
      runCount: 0, // Track total number of runs for time progression
      // Training Hall system
      trainingPoints: 0,
      lastTrainingPointTime: 0, // Timestamp of last training point awarded
      // Tutorial Quest System - 8-Quest Tutorial Flow
      tutorialQuests: {
        currentQuest: null, // Current active quest ID
        completedQuests: [], // Array of completed quest IDs
        questProgress: {}, // Object tracking progress for each quest
        readyToClaim: [], // Array of quest IDs ready to claim
        firstDeathShown: false,
        secondRunCompleted: false, // For achievements building unlock
        killsThisRun: 0, // Track kills per run (reset on new run)
        survivalTimeThisRun: 0, // Track survival time per run
        mysteriousEggFound: false, // quest_eggHunt: found the egg during a run
        firstBossDefeated: false, // quest_pushingLimits: defeated boss at wave 10
        stonengengeChestFound: false, // Quest 6 specific
        landmarksFound: {          // Track landmarks found for quest11_findAllLandmarks
          stonehenge: false,
          pyramid: false,
          montana: false,
          teslaTower: false,
          eiffel: false,
          ufoSight: false
        },
        lastShownQuestReminder: null // Track last shown quest reminder on run start
      },
      // Story achievements earned via tutorial quests
      storyAchievements: [],
      // Legacy quest data (keep for backward compatibility)
      storyQuests: {
        welcomeShown: false,
        mainBuildingUnlocked: false,
        currentQuest: null,
        completedQuests: [],
        readyToClaimQuests: [],
        questProgress: {},
        buildingFirstUse: {
          skillTree: false,
          forge: false,
          armory: false,
          trashRecycle: false,
          companionHouse: false,
          trainingHall: false,
          tempShop: false
        },
        questNotifications: {}
      },
      // Tutorial/Onboarding system (comic book style)
      tutorial: {
        completed: false,
        firstDeath: false,
        campVisited: false,
        dashUnlocked: false,
        headshotUnlocked: false,
        currentStep: 'waiting_first_death' // Steps: waiting_first_death, show_death_tutorial, go_to_camp, unlock_dash, unlock_headshot, completed
      },
      // Lore Collection system
      loreUnlocked: {
        landmarks: [],
        enemies: [],
        bosses: [],
        buildings: []
      },
      // Extended milestone quests
      extendedQuests: {
        legendaryCigar: { started: false, completed: false, foundCigar: false },
        companionEgg: { started: false, completed: false, eggHatched: false, ceremonyDone: false }
      },
      // Side challenges
      sideChallenges: {
        kill10Enemies: { completed: false, progress: 0, target: 10 }
      },
      // Quest Hall challenge & achievement claim tracking
      questHallChallenges: {},
      questHallAchievements: {},
      // First-Run Tutorial System (speech bubble tutorial)
      firstRunTutorial: {
        step: 0,       // 0=not started, 1-16=active steps (see TUT_STEP constants), 17=complete
        completed: false
      },
      // Harvesting & Resource System
      resources: {
        wood: 0, stone: 0, coal: 0, iron: 0,
        crystal: 0, magicEssence: 0, gem: 0, flesh: 0,
        fur: 0, leather: 0, feather: 0, chitin: 0, venom: 0,
        berry: 0, flower: 0, vegetable: 0,
        voidEssence: 0,
        waterdropEnergy: 0   // Waterdrop Energy — used in Artifact Resonance Grid merges
      },
      harvestingTools: {
        axe: false, sledgehammer: false, pickaxe: false, magicTool: false,
        epicAxe: false, epicSledgehammer: false, epicPickaxe: false, epicMagicTool: false,
        knife: false, berryScoop: false, tranquilizerRifle: false
      },
      // Cooking system
      cookedMeals: {},
      craftedWeapons: {},
      // Weapon building permanent upgrades (per weapon)
      weaponUpgrades: {},
      // Wildlife tracking
      tranquilizedAnimals: [],
      wolfBreedingProgress: 0, // 0-100 progress toward breeding storm wolf
      // ── Prism Reliquary — Gem System ──────────────────────────
      // Raw Gems: premium dual-purpose currency
      rawGems: { ruby: 0, sapphire: 0, emerald: 0, void: 0 },
      // Cut Gems: slottable items with rarities
      cutGems: [],
      // Per-weapon gem slots: { weaponId: [gemId|null, ...] }
      weaponGemSlots: {},
      // Per-companion gem slots: { companionId: [gemId|null, ...] }
      companionGemSlots: {},
      // ── Astral Dive rewards ──────────────────────────────────
      astralEssence: 0,  // Collected inside Astral Dive — used in Neural Matrix
      neuralCores:   0,  // Rare drops from Firewall bosses inside the Dive
      // ── 1945 Striker minigame ─────────────────────────────
      neural1945: {
        highScore: 0,
        credits: 0,
        mapLevel: 1,
        upgrades: { fireRate: 0, spread: 0, damage: 0, missile: 0, shield: 0 },
        meta: {
          skillPoints: 0,
          nodes: { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 }
        },
        supers: { fluxCharges: 0 }
      },
      // ── Void Rift Expeditions ───────────────────────────────
      voidRifts: {
        active: [],
        pendingRewards: [],
        artifacts: [],
        history: []
      },
      // ── Advanced Idle Clicker (Idle House) ────────────────
      advancedClicker: null,  // Initialised lazily by AdvancedClicker.getDefaults()
      // ── AIDA Dark Pacts ──────────────────────────────────────
      aidaDarkPacts: {
        hpReduction:      1.0,  // Multiplicative HP cap (e.g. 0.85 = −15%)
        bossSpeedCharges: 0     // Remaining boss encounters that spawn at 200% speed
      }
    };

    let saveData = JSON.parse(JSON.stringify(defaultSaveData));

    function loadSaveData() {
      let saved = null;
      try {
        saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
          saveData = JSON.parse(saved);
          // Ensure all fields exist
          saveData.upgrades = { ...defaultSaveData.upgrades, ...saveData.upgrades };
          saveData.attributes = { ...defaultSaveData.attributes, ...(saveData.attributes || {}) };
          saveData.unspentAttributePoints = saveData.unspentAttributePoints || 0;
          saveData.equippedGear = { ...defaultSaveData.equippedGear, ...(saveData.equippedGear || {}) };
          saveData.inventory = saveData.inventory || [];
          saveData.consumables = saveData.consumables || [];
          saveData.hasSeenCrimsonCoreDialogue = saveData.hasSeenCrimsonCoreDialogue || false;
          saveData.resources = { ...defaultSaveData.resources, ...(saveData.resources || {}) };
          saveData.artifacts = saveData.artifacts || [];
          saveData.equippedArtifacts = saveData.equippedArtifacts || [null, null, null];
          saveData.campBuildings = { ...defaultSaveData.campBuildings, ...(saveData.campBuildings || {}) };
          saveData.skillTree = { ...defaultSaveData.skillTree, ...(saveData.skillTree || {}) };
          saveData.companions = { ...defaultSaveData.companions, ...(saveData.companions || {}) };
          saveData.hasVisitedCamp = saveData.hasVisitedCamp || false;
          saveData.nextRunTimeOfDay = saveData.nextRunTimeOfDay || 'day';
          saveData.lastDeathHour = saveData.lastDeathHour || 6; // Default to 6 AM
          saveData.runCount = saveData.runCount || 0;
          saveData.trainingPoints = saveData.trainingPoints || 0;
          saveData.lastTrainingPointTime = saveData.lastTrainingPointTime || 0;
          saveData.skillPoints = saveData.skillPoints || 0;
          saveData.selectedCompanion = saveData.selectedCompanion || 'greyAlien';
          // Migrate old saves that defaulted to stormWolf (now locked by default)
          if (saveData.selectedCompanion === 'stormWolf' && saveData.companions && saveData.companions.stormWolf && !saveData.companions.stormWolf.unlocked) {
            saveData.selectedCompanion = 'greyAlien';
          }
          saveData.hasCompanionEgg = saveData.hasCompanionEgg || false;
          saveData.companionEggHatched = saveData.companionEggHatched || false;
          saveData.companionEggHatchProgress = saveData.companionEggHatchProgress || 0;
          saveData.companionSkillPoints = saveData.companionSkillPoints || 0;
          // Migrate companionGrowthStage for older saves
          if (!saveData.companionGrowthStage) {
            saveData.companionGrowthStage = saveData.companionEggHatched ? 'adult' : 'egg';
          }
          // Ensure companion skill data fields exist
          if (saveData.companions) {
            Object.keys(saveData.companions).forEach(cId => {
              if (saveData.companions[cId] && !saveData.companions[cId].skills) {
                saveData.companions[cId].skills = {};
              }
            });
          }
          // Companion Exploration System migration
          if (!saveData.exploration) {
            saveData.exploration = { level: 1, xp: 0, activeExpedition: null, history: [] };
          }
          if (!saveData.exploration.history)               saveData.exploration.history = [];
          if (saveData.exploration.level == null)          saveData.exploration.level = 1;
          if (saveData.exploration.xp == null)             saveData.exploration.xp = 0;
          // Account level system
          saveData.accountLevel = saveData.accountLevel || 1;
          saveData.accountXP = saveData.accountXP || 0;
          // Passive skills system
          saveData.passiveSkills = saveData.passiveSkills || {};
          saveData.passiveSkillPoints = saveData.passiveSkillPoints || 0;
          // Profile Account deep stats (merge with defaults to pick up newly added keys)
          saveData.profileAccount = Object.assign(
            JSON.parse(JSON.stringify(defaultSaveData.profileAccount)),
            saveData.profileAccount || {}
          );
          // Story quest system (legacy fields)
          saveData.storyQuests = { ...defaultSaveData.storyQuests, ...(saveData.storyQuests || {}) };
          saveData.storyQuests.buildingFirstUse = { ...defaultSaveData.storyQuests.buildingFirstUse, ...(saveData.storyQuests.buildingFirstUse || {}) };
          // Tutorial quest system (new)
          saveData.tutorialQuests = { ...defaultSaveData.tutorialQuests, ...(saveData.tutorialQuests || {}) };
          saveData.tutorialQuests.landmarksFound = { ...defaultSaveData.tutorialQuests.landmarksFound, ...(saveData.tutorialQuests.landmarksFound || {}) };
          saveData.sideChallenges = { ...defaultSaveData.sideChallenges, ...(saveData.sideChallenges || {}) };
          // Quest Hall challenges & achievements tracking (new fields — safe defaults)
          saveData.questHallChallenges = saveData.questHallChallenges || {};
          saveData.questHallAchievements = saveData.questHallAchievements || {};
          // Tutorial system (new fields)
          saveData.tutorial = { ...defaultSaveData.tutorial, ...(saveData.tutorial || {}) };
          // First-run tutorial system
          saveData.firstRunTutorial = { ...defaultSaveData.firstRunTutorial, ...(saveData.firstRunTutorial || {}) };
          // A.I.D.A intro state — must be preserved strictly (chip/insert flags must survive page reloads)
          saveData.aidaIntroState = saveData.aidaIntroState || {};
          // Destructibles info shown flag
          saveData.shownDestructiblesInfo = saveData.shownDestructiblesInfo || false;
          // Character visuals customization
          saveData.characterVisuals = saveData.characterVisuals || { accessory: 'none', animation: 'idle', outfit: 'default' };
          // Harvesting system (new fields)
          saveData.resources = { ...defaultSaveData.resources, ...(saveData.resources || {}) };
          saveData.harvestingTools = { ...defaultSaveData.harvestingTools, ...(saveData.harvestingTools || {}) };
          // Special attacks loadout (new field)
          saveData.equippedSpecials = saveData.equippedSpecials || [];
          // Special attack points (new field)
          saveData.specialAtkPoints = saveData.specialAtkPoints || 0;
          // Special branch choice (new field)
          if (saveData.specialBranch === undefined) saveData.specialBranch = null;
          // Special attack slots unlock progression (new field)
          if (saveData.specialSlotsUnlocked === undefined) saveData.specialSlotsUnlocked = 1;
          // Weapon building permanent upgrades
          saveData.weaponUpgrades = saveData.weaponUpgrades || {};
          // New buildings migration
          saveData.campBuildings = saveData.campBuildings || {};
          ['warehouse', 'tavern', 'shop', 'prestige'].forEach(bld => {
            if (!saveData.campBuildings[bld]) {
              saveData.campBuildings[bld] = { level: 0, maxLevel: 1, unlocked: false };
            }
          });
          // ── Building level migration v2 ──
          // Previous code paths could leave non-core buildings with level > 0 without
          // the player actually building them.  Reset any non-core building that has
          // level > 0 back to level 0 (keep unlocked flag) so the BUILD step is
          // required.  NOTE: questMission was exempted here but is corrected in V4.
          if (!saveData._buildingMigrationV2) {
            var coreBuildings = ['questMission', 'inventory', 'accountBuilding', 'idleMenu'];
            Object.keys(saveData.campBuildings).forEach(function(bId) {
              if (coreBuildings.indexOf(bId) !== -1) return; // skip core buildings
              var b = saveData.campBuildings[bId];
              if (b && typeof b.level === 'number' && b.level > 0) {
                b.level = 0; // require BUILD step
              }
            });
            saveData._buildingMigrationV2 = true;
          }
          // ── Building level migration v3 ──
          // Simplify building levels: buildings are either built (1) or not (0).
          // Cap all levels at 1 and set maxLevel to 1. UI-only buildings
          // (accountBuilding, idleMenu) keep their level since they have no 3D
          // representation and don't use the BUILD/ENTER flow.
          if (!saveData._buildingMigrationV3) {
            var uiOnlyBuildings = ['accountBuilding', 'idleMenu'];
            // Buildings that intentionally have maxLevel > 1 are exempted from the cap
            var multiLevelBuildings = ['shrine'];
            Object.keys(saveData.campBuildings).forEach(function(bId) {
              var b = saveData.campBuildings[bId];
              if (!b) return;
              if (multiLevelBuildings.indexOf(bId) === -1) {
                b.maxLevel = 1;
              }
              if (uiOnlyBuildings.indexOf(bId) !== -1) return;
              if (typeof b.level === 'number' && b.level > 1 && multiLevelBuildings.indexOf(bId) === -1) {
                b.level = 1; // cap at 1 (built)
              }
            });
            saveData._buildingMigrationV3 = true;
          }
          // ── Building level migration v4 ──
          // Migration V2 exempted questMission (core building) from the level
          // reset, so old saves kept questMission.level = 1 from before the
          // BUILD-flow was introduced.  Reset questMission to level 0 so that
          // existing saves also go through the BUILD step before ENTER is shown.
          // accountBuilding and idleMenu remain at level 1 (UI-only).
          if (!saveData._buildingMigrationV4) {
            // V4 reset questMission to level 0 to enforce the BUILD-flow step.
            // The flag is still set so V4 does not run again on future loads.
            saveData._buildingMigrationV4 = true;
          }
          // ── Building migration v5 ──
          // Inventory is a core free building (isFree + isCore) that should always
          // be built and available.  Older saves may have it at level 0 / unlocked
          // false.  Set it to built so players can access inventory without a quest.
          if (!saveData._buildingMigrationV5) {
            var bldInv = saveData.campBuildings && saveData.campBuildings.inventory;
            if (bldInv && bldInv.level === 0) {
              bldInv.level = 1;
              bldInv.unlocked = true;
            }
            saveData._buildingMigrationV5 = true;
          }
          // ── Building migration v6 ──
          // Quest Hall must be unlocked but NOT pre-built so the player goes
          // through the build step in the intro sequence.
          if (!saveData._buildingMigrationV6) {
            var bldQMv6 = saveData.campBuildings && saveData.campBuildings.questMission;
            if (bldQMv6) {
              bldQMv6.level = 0;
              bldQMv6.unlocked = true;
            }
            saveData._buildingMigrationV6 = true;
          }
          // ── Building migration v7 ──
          // V6 previously set questMission.level = 1 which broke the intro
          // build sequence for existing saves.  Reset questMission to level 0
          // only for saves that are still in the intro flow: the player must
          // not have completed quest_buildQuesthall AND must not have advanced
          // past the intro (firstRunDeath not yet completed).
          if (!saveData._buildingMigrationV7) {
            var bldQMv7 = saveData.campBuildings && saveData.campBuildings.questMission;
            var tqV7 = saveData.tutorialQuests;
            var completedV7 = (tqV7 && tqV7.completedQuests) || [];
            var hasBuildQuesthallV7 = completedV7.indexOf('quest_buildQuesthall') !== -1;
            var hasAdvancedIntroProgressV7 = completedV7.indexOf('firstRunDeath') !== -1;
            if (bldQMv7 && !hasBuildQuesthallV7 && !hasAdvancedIntroProgressV7) {
              bldQMv7.level = 0;
              bldQMv7.unlocked = true;
            }
            saveData._buildingMigrationV7 = true;
          }

          // ── Quest migration: questGather0_materials → questForge0_unlock ──
          // Old quest required gathering resources before tools existed.
          // Replace with forge unlock quest in existing saves.
          if (!saveData._questMigrationForge0) {
            var tq = saveData.tutorialQuests;
            if (tq) {
              // If current quest is the old gather quest, switch to forge quest
              if (tq.currentQuest === 'questGather0_materials') {
                tq.currentQuest = 'questForge0_unlock';
              }
              // If gather quest was completed, mark forge quests as completed too
              var completed = tq.completedQuests || [];
              if (completed.indexOf('questGather0_materials') !== -1) {
                if (completed.indexOf('questForge0_unlock') === -1) completed.push('questForge0_unlock');
                if (completed.indexOf('questForge0b_craftTools') === -1) completed.push('questForge0b_craftTools');
              }
              // Remove old quest from readyToClaim if present
              var rtc = tq.readyToClaim || [];
              var gatherIdx = rtc.indexOf('questGather0_materials');
              if (gatherIdx !== -1) {
                rtc.splice(gatherIdx, 1);
                if (rtc.indexOf('questForge0_unlock') === -1) rtc.push('questForge0_unlock');
              }
            }
            saveData._questMigrationForge0 = true;
          }

          // ── Quest migration: Old quest chain → New slow-burn chain ──
          // For fresh saves that haven't progressed past firstRunDeath,
          // redirect to the new chain (quest_dailyRoutine).
          // Existing saves deep in the old chain keep their progress.
          if (!saveData._questMigrationSlowBurn) {
            var tqSb = saveData.tutorialQuests;
            if (tqSb) {
              // Initialize new quest tracking fields
              if (tqSb.mysteriousEggFound === undefined) tqSb.mysteriousEggFound = false;
              if (tqSb.firstBossDefeated === undefined) tqSb.firstBossDefeated = false;
              
              // If current quest is the old forge unlock chain (not yet started on new chain),
              // and firstRunDeath is done, redirect to new chain
              var oldEarlyQuests = ['questForge0_unlock', 'questForge0b_craftTools'];
              if (tqSb.currentQuest && oldEarlyQuests.indexOf(tqSb.currentQuest) !== -1) {
                // Check if player hasn't claimed any old chain quests beyond firstRunDeath
                var completed = tqSb.completedQuests || [];
                var hasOldProgress = completed.indexOf('quest1_kill3') !== -1 ||
                                     completed.indexOf('quest2_spendSkills') !== -1;
                if (!hasOldProgress) {
                  // Safe to redirect to new chain
                  tqSb.currentQuest = 'quest_dailyRoutine';
                  // Remove old quests from readyToClaim
                  var rtcSb = tqSb.readyToClaim || [];
                  oldEarlyQuests.forEach(function(q) {
                    var idx = rtcSb.indexOf(q);
                    if (idx !== -1) rtcSb.splice(idx, 1);
                  });
                }
              }
              
              // Ensure gear tier restriction flag exists
              if (saveData.gearTierLimit === undefined) {
                saveData.gearTierLimit = 'rare'; // Max tier before prestige
              }
            }
            saveData._questMigrationSlowBurn = true;
          }
          // ── Prism Reliquary / Gem System migration ──
          saveData.rawGems = saveData.rawGems || { ruby: 0, sapphire: 0, emerald: 0, void: 0 };
          saveData.rawGems.ruby    = saveData.rawGems.ruby    || 0;
          saveData.rawGems.sapphire= saveData.rawGems.sapphire|| 0;
          saveData.rawGems.emerald = saveData.rawGems.emerald || 0;
          saveData.rawGems.void    = saveData.rawGems.void    || 0;
          saveData.cutGems         = saveData.cutGems         || [];
          saveData.weaponGemSlots  = saveData.weaponGemSlots  || {};
          saveData.companionGemSlots = saveData.companionGemSlots || {};
          if (!saveData.campBuildings.prismReliquary) {
            saveData.campBuildings.prismReliquary = { level: 0, maxLevel: 1, unlocked: false };
          }
          // ── Late-game quest / Annunaki arc migration ──
          // Ensure chestOpenCount exists (used by quest36_blackMarket)
          saveData.chestOpenCount = saveData.chestOpenCount || 0;
          // ── Astral Dive rewards migration ──
          saveData.astralEssence = saveData.astralEssence || 0;
          saveData.neuralCores   = saveData.neuralCores   || 0;
          // ── 1945 Striker save migration ──
          if (!saveData.neural1945) {
            saveData.neural1945 = {
              highScore: 0,
              credits: 0,
              mapLevel: 1,
              upgrades: { fireRate: 0, spread: 0, damage: 0, missile: 0, shield: 0 },
              meta: { skillPoints: 0, nodes: { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 } },
              supers: { fluxCharges: 0 }
            };
          }
          saveData.neural1945.credits   = saveData.neural1945.credits   || 0;
          saveData.neural1945.highScore = saveData.neural1945.highScore || 0;
          saveData.neural1945.upgrades  = saveData.neural1945.upgrades  || { fireRate: 0, spread: 0, damage: 0, missile: 0, shield: 0 };
          saveData.neural1945.meta      = saveData.neural1945.meta      || { skillPoints: 0, nodes: { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 } };
          if (!saveData.neural1945.meta.nodes) saveData.neural1945.meta.nodes = { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 };
          if (saveData.neural1945.meta.skillPoints === undefined) saveData.neural1945.meta.skillPoints = 0;
          saveData.neural1945.supers    = saveData.neural1945.supers    || { fluxCharges: 0 };
          if (saveData.neural1945.supers.fluxCharges === undefined) saveData.neural1945.supers.fluxCharges = 0;
          // ── Neural Matrix migration ──
          saveData.neuralMatrix = saveData.neuralMatrix || {};
          // Ensure parasiteSeenThisSession starts as false (re-rolls once per session)
          if (saveData.neuralMatrix.parasiteSeenThisSession === undefined) {
            saveData.neuralMatrix.parasiteSeenThisSession = false;
          }
          // Forbidden Protocol flag (persists between sessions once activated)
          if (saveData.neuralMatrix.forbiddenProtocol === undefined) {
            saveData.neuralMatrix.forbiddenProtocol = false;
          }
          if (!saveData.campBuildings.neuralMatrix) {
            saveData.campBuildings.neuralMatrix = { level: 0, maxLevel: 1, unlocked: false };
          }
          if (!saveData.campBuildings.astralGateway) {
            saveData.campBuildings.astralGateway = { level: 0, maxLevel: 1, unlocked: false };
          }
          if (!saveData.campBuildings.droppletShop) {
            saveData.campBuildings.droppletShop = { level: 0, maxLevel: 1, unlocked: false };
          }
          // Ensure waterdropEnergy resource key exists on old saves
          if (!saveData.resources) saveData.resources = {};
          if (saveData.resources.waterdropEnergy === undefined) {
            saveData.resources.waterdropEnergy = 0;
          }
          // ── Void Rift migration ──
          if (!saveData.voidRifts) {
            saveData.voidRifts = { active: [], pendingRewards: [], artifacts: [], history: [] };
          } else {
            saveData.voidRifts.active = saveData.voidRifts.active || [];
            saveData.voidRifts.pendingRewards = saveData.voidRifts.pendingRewards || [];
            saveData.voidRifts.artifacts = saveData.voidRifts.artifacts || [];
            saveData.voidRifts.history = saveData.voidRifts.history || [];
          }
          // ── AIDA Dark Pacts migration ──
          if (!saveData.aidaDarkPacts) saveData.aidaDarkPacts = {};
          if (saveData.aidaDarkPacts.hpReduction === undefined)   saveData.aidaDarkPacts.hpReduction   = 1.0;
          if (saveData.aidaDarkPacts.bossSpeedCharges === undefined) saveData.aidaDarkPacts.bossSpeedCharges = 0;
        }
      } catch (e) {

        console.error('Failed to load save data:', e);
        saveData = { ...defaultSaveData };

        // Preserve raw save as a backup so progress is not permanently lost
        if (typeof saved === 'string' && saved.length > 0) {
          try { localStorage.setItem(SAVE_KEY + '_corrupt_backup', saved); } catch (_) {}
        }

        // Store error globally so other modules can inspect it
        window._saveLoadError = e;

        // Show a visible warning banner on screen (dismissed by tap / auto-dismissed after 12s).
        // Uses a short delay so the banner is injected after the DOM is fully set up by init().
        setTimeout(function() {
          var banner = document.createElement('div');
          banner.id = 'save-load-error-banner';
          banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(180,90,0,0.97);color:#fff;padding:10px 12px;font-family:monospace;font-size:11px;z-index:99999;max-height:25vh;overflow-y:auto;border-top:3px solid #ffd700;';
          var titleEl = document.createElement('div');
          titleEl.style.cssText = 'font-size:13px;font-weight:bold;color:#ffd700;margin-bottom:4px;';
          titleEl.textContent = '⚠️ Save data could not be loaded — starting fresh (tap to dismiss)';
          var msgEl = document.createElement('div');
          msgEl.style.cssText = 'white-space:pre-wrap;word-break:break-all;max-height:14vh;overflow-y:auto;';
          msgEl.textContent = (e && e.stack) ? String(e.stack) : String(e);
          banner.appendChild(titleEl);
          banner.appendChild(msgEl);
          var autoDismiss = setTimeout(function() { if (banner.parentNode) banner.style.display = 'none'; }, 12000);
          banner.onclick = function() { clearTimeout(autoDismiss); banner.style.display = 'none'; };
          document.body.appendChild(banner);
        }, 500);
      }

      // Ensure buildings not present in defaultSaveData are explicitly initialized
      if (!saveData.campBuildings) saveData.campBuildings = {};
      ['astralGateway', 'neuralMatrix', 'prismReliquary', 'droppletShop'].forEach(function(key) {
        if (!saveData.campBuildings[key]) {
          saveData.campBuildings[key] = { level: 0, maxLevel: 1, unlocked: false };
        }
      });

      // Ensure all default resource keys are present (including waterdropEnergy)
      saveData.resources = Object.assign({}, defaultSaveData.resources, saveData.resources);
      if (!saveData.rawGems) saveData.rawGems = {};
      if (!saveData.rawGems.ruby) saveData.rawGems.ruby = 0;
      if (!saveData.rawGems.sapphire) saveData.rawGems.sapphire = 0;
      if (!saveData.rawGems.emerald) saveData.rawGems.emerald = 0;
      if (!saveData.rawGems.void) saveData.rawGems.void = 0;
    }

    // Throttle saves to avoid excessive localStorage writes (max once per 500ms)
    let _saveScheduled = false;
    let _lastSaveTime = 0;
    const _SAVE_MIN_INTERVAL = 500; // ms

    function saveSaveData() {
      const now = Date.now();
      if (now - _lastSaveTime >= _SAVE_MIN_INTERVAL) {
        _lastSaveTime = now;
        _saveScheduled = false;
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        } catch (e) {
          console.error('Failed to save data:', e);
        }
      } else if (!_saveScheduled) {
        _saveScheduled = true;
        setTimeout(() => {
          _saveScheduled = false;
          _lastSaveTime = Date.now();
          try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
          } catch (e) {
            console.error('Failed to save data:', e);
          }
        }, _SAVE_MIN_INTERVAL - (now - _lastSaveTime));
      }
    }
    
    // Settings persistence
    function saveSettings() {
      try {
        const settings = {
          graphicsMode: gameSettings.graphicsMode || 'auto',
          graphicsQuality: gameSettings.graphicsQuality || 'auto',
          particleEffects: gameSettings.particleEffects !== false,
          autoAim: gameSettings.autoAim,
          controlType: gameSettings.controlType,
          soundEnabled: gameSettings.soundEnabled,
          musicEnabled: gameSettings.musicEnabled
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (e) {
        console.error('Failed to save settings:', e);
      }
    }

    function loadSettings() {
      try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
          const settings = JSON.parse(saved);
          // Apply saved settings to gameSettings
          if (settings.graphicsMode) gameSettings.graphicsMode = settings.graphicsMode;
          if (settings.graphicsQuality) gameSettings.graphicsQuality = settings.graphicsQuality;
          if (settings.particleEffects !== undefined) gameSettings.particleEffects = settings.particleEffects;
          if (settings.autoAim !== undefined) gameSettings.autoAim = settings.autoAim;
          if (settings.controlType) gameSettings.controlType = settings.controlType;
          if (settings.soundEnabled !== undefined) gameSettings.soundEnabled = settings.soundEnabled;
          if (settings.musicEnabled !== undefined) gameSettings.musicEnabled = settings.musicEnabled;
        } else {
          // No saved settings — auto-detect best control type.
          // Touch events + no fine pointer = mobile/tablet → 'touch' (on-screen joystick).
          // Everything else (desktop, laptop) → 'keyboard' so WASD works immediately.
          const isTouchOnly = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
          const hasFinePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
          gameSettings.controlType = (isTouchOnly && !hasFinePointer) ? 'touch' : 'keyboard';
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
    
    // Expose saveData to window scope for loading screen access (FRESH IMPLEMENTATION)
    window.saveData = saveData;
    window.GameState.saveData = saveData;
    // Bootstrap idle systems now that saveData is available
    if (window.GameState.initIdleSystems) window.GameState.initIdleSystems(saveData);

    // --- ACHIEVEMENTS SYSTEM ---
    const ACHIEVEMENTS = {
      // KILL ACHIEVEMENTS - Extended progression
      kill5: { id: 'kill5', name: 'First Enemy', desc: 'Kill your first 5 enemies', reward: 5, skillPoints: 0, attributePoints: 0, check: () => playerStats.kills >= 5, claimed: false },
      kill7: { id: 'kill7', name: 'First Steps', desc: 'Kill 7 enemies', reward: 10, skillPoints: 0, attributePoints: 0, check: () => playerStats.kills >= 7, claimed: false },
      kills10: { id: 'kills10', name: 'First Blood', desc: 'Kill 10 enemies', reward: 25, skillPoints: 1, attributePoints: 1, check: () => playerStats.kills >= 10, claimed: false },
      kills25: { id: 'kills25', name: 'Getting Started', desc: 'Kill 25 enemies', reward: 40, skillPoints: 1, attributePoints: 1, check: () => playerStats.kills >= 25, claimed: false },
      kills50: { id: 'kills50', name: 'Killer Instinct', desc: 'Kill 50 enemies', reward: 50, skillPoints: 1, attributePoints: 1, check: () => playerStats.kills >= 50, claimed: false },
      kills100: { id: 'kills100', name: 'Century Slayer', desc: 'Kill 100 enemies', reward: 100, skillPoints: 2, attributePoints: 2, check: () => playerStats.kills >= 100, claimed: false },
      kills250: { id: 'kills250', name: 'Destroyer', desc: 'Kill 250 enemies', reward: 200, skillPoints: 2, attributePoints: 2, check: () => playerStats.kills >= 250, claimed: false },
      kills500: { id: 'kills500', name: 'Mass Destroyer', desc: 'Kill 500 enemies', reward: 250, skillPoints: 2, attributePoints: 2, check: () => playerStats.kills >= 500, claimed: false },
      kills1000: { id: 'kills1000', name: 'Legendary Warrior', desc: 'Kill 1000 enemies', reward: 500, skillPoints: 3, attributePoints: 3, check: () => playerStats.kills >= 1000, claimed: false },
      kills2500: { id: 'kills2500', name: 'Elite Slayer', desc: 'Kill 2500 enemies', reward: 750, skillPoints: 3, attributePoints: 3, check: () => playerStats.kills >= 2500, claimed: false },
      kills5000: { id: 'kills5000', name: 'God of War', desc: 'Kill 5000 enemies', reward: 1000, skillPoints: 4, attributePoints: 4, check: () => playerStats.kills >= 5000, claimed: false },
      kills10000: { id: 'kills10000', name: 'Annihilator', desc: 'Kill 10,000 enemies', reward: 1500, skillPoints: 4, attributePoints: 4, check: () => playerStats.kills >= 10000, claimed: false },
      kills25000: { id: 'kills25000', name: 'Death Incarnate', desc: 'Kill 25,000 enemies', reward: 2000, skillPoints: 5, attributePoints: 5, check: () => playerStats.kills >= 25000, claimed: false },
      kills50000: { id: 'kills50000', name: 'Apocalypse', desc: 'Kill 50,000 enemies', reward: 3000, skillPoints: 5, attributePoints: 5, check: () => playerStats.kills >= 50000, claimed: false },
      kills100000: { id: 'kills100000', name: 'World Ender', desc: 'Kill 100,000 enemies', reward: 5000, skillPoints: 6, attributePoints: 6, check: () => playerStats.kills >= 100000, claimed: false },

      // GOLD ACHIEVEMENTS - Extended progression
      gold100: { id: 'gold100', name: 'Small Fortune', desc: 'Collect 100 gold in one run', reward: 50, skillPoints: 1, attributePoints: 1, check: () => playerStats.gold >= 100, claimed: false },
      gold250: { id: 'gold250', name: 'Gold Gatherer', desc: 'Collect 250 gold in one run', reward: 100, skillPoints: 1, attributePoints: 1, check: () => playerStats.gold >= 250, claimed: false },
      gold500: { id: 'gold500', name: 'Treasure Hunter', desc: 'Collect 500 gold in one run', reward: 150, skillPoints: 1, attributePoints: 1, check: () => playerStats.gold >= 500, claimed: false },
      gold1000: { id: 'gold1000', name: 'Gold Baron', desc: 'Collect 1000 gold in one run', reward: 300, skillPoints: 2, attributePoints: 2, check: () => playerStats.gold >= 1000, claimed: false },
      gold2500: { id: 'gold2500', name: 'Wealth Magnet', desc: 'Collect 2500 gold in one run', reward: 500, skillPoints: 2, attributePoints: 2, check: () => playerStats.gold >= 2500, claimed: false },
      gold5000: { id: 'gold5000', name: 'Golden Legend', desc: 'Collect 5000 gold in one run', reward: 750, skillPoints: 3, attributePoints: 3, check: () => playerStats.gold >= 5000, claimed: false },
      gold10000: { id: 'gold10000', name: 'Midas Touch', desc: 'Collect 10,000 gold in one run', reward: 1200, skillPoints: 3, attributePoints: 3, check: () => playerStats.gold >= 10000, claimed: false },

      // DASH ACHIEVEMENTS - Extended progression
      dasher25: { id: 'dasher25', name: 'Swift Mover', desc: 'Perform 25 dashes in one run', reward: 50, skillPoints: 0, attributePoints: 1, check: () => playerStats.dashesPerformed >= 25, claimed: false },
      dasher50: { id: 'dasher50', name: 'Dash Master', desc: 'Perform 50 dashes in one run', reward: 100, skillPoints: 1, attributePoints: 1, check: () => playerStats.dashesPerformed >= 50, claimed: false },
      dasher100: { id: 'dasher100', name: 'Speed Demon', desc: 'Perform 100 dashes in one run', reward: 200, skillPoints: 2, attributePoints: 2, check: () => playerStats.dashesPerformed >= 100, claimed: false },
      dasher250: { id: 'dasher250', name: 'Flash Incarnate', desc: 'Perform 250 dashes in one run', reward: 400, skillPoints: 2, attributePoints: 2, check: () => playerStats.dashesPerformed >= 250, claimed: false },

      // SURVIVAL ACHIEVEMENTS - Extended progression
      survivor: { id: 'survivor', name: 'Time Warrior', desc: 'Survive for 10 minutes', reward: 200, skillPoints: 2, attributePoints: 2, check: () => playerStats.survivalTime >= 600, claimed: false },
      survivor20: { id: 'survivor20', name: 'Endurance Master', desc: 'Survive for 20 minutes', reward: 400, skillPoints: 3, attributePoints: 3, check: () => playerStats.survivalTime >= 1200, claimed: false },
      survivor30: { id: 'survivor30', name: 'Immortal Legend', desc: 'Survive for 30 minutes', reward: 600, skillPoints: 4, attributePoints: 4, check: () => playerStats.survivalTime >= 1800, claimed: false },
      survivor45: { id: 'survivor45', name: 'Eternal Survivor', desc: 'Survive for 45 minutes', reward: 900, skillPoints: 4, attributePoints: 4, check: () => playerStats.survivalTime >= 2700, claimed: false },
      survivor60: { id: 'survivor60', name: 'Time Master', desc: 'Survive for 1 hour', reward: 1200, skillPoints: 5, attributePoints: 5, check: () => playerStats.survivalTime >= 3600, claimed: false },

      // WEAPON & COMBAT ACHIEVEMENTS
      weaponMaster: { id: 'weaponMaster', name: 'Weapon Master', desc: 'Unlock all 3 weapons', reward: 150, skillPoints: 1, attributePoints: 1, check: () => playerStats.weaponsUnlocked >= 3, claimed: false },
      untouchable: { id: 'untouchable', name: 'Untouchable', desc: 'Take no damage for 3 minutes', reward: 300, skillPoints: 3, attributePoints: 3, check: () => playerStats.survivalTime >= 180 && playerStats.damageTaken === 0, claimed: false },

      // MINI-BOSS ACHIEVEMENTS - Extended progression
      miniBoss1: { id: 'miniBoss1', name: 'Boss Slayer I', desc: 'Defeat your first mini-boss', reward: 150, skillPoints: 2, attributePoints: 2, check: () => playerStats.miniBossesDefeated >= 1, claimed: false },
      miniBoss3: { id: 'miniBoss3', name: 'Boss Slayer II', desc: 'Defeat 3 mini-bosses', reward: 300, skillPoints: 2, attributePoints: 2, check: () => playerStats.miniBossesDefeated >= 3, claimed: false },
      miniBoss5: { id: 'miniBoss5', name: 'Boss Slayer III', desc: 'Defeat 5 mini-bosses', reward: 500, skillPoints: 3, attributePoints: 3, check: () => playerStats.miniBossesDefeated >= 5, claimed: false },
      miniBoss10: { id: 'miniBoss10', name: 'Boss Hunter', desc: 'Defeat 10 mini-bosses', reward: 800, skillPoints: 4, attributePoints: 4, check: () => playerStats.miniBossesDefeated >= 10, claimed: false },
      miniBoss25: { id: 'miniBoss25', name: 'Boss Destroyer', desc: 'Defeat 25 mini-bosses', reward: 1200, skillPoints: 4, attributePoints: 4, check: () => playerStats.miniBossesDefeated >= 25, claimed: false },
      miniBoss50: { id: 'miniBoss50', name: 'Boss Nemesis', desc: 'Defeat 50 mini-bosses', reward: 2000, skillPoints: 5, attributePoints: 5, check: () => playerStats.miniBossesDefeated >= 50, claimed: false },

      // LEVEL ACHIEVEMENTS - Extended progression
      level10: { id: 'level10', name: 'Rising Star', desc: 'Reach Level 10', reward: 100, skillPoints: 1, attributePoints: 1, check: () => playerStats.lvl >= 10, claimed: false },
      level25: { id: 'level25', name: 'Experienced Fighter', desc: 'Reach Level 25', reward: 250, skillPoints: 2, attributePoints: 2, check: () => playerStats.lvl >= 25, claimed: false },
      level50: { id: 'level50', name: 'Master Champion', desc: 'Reach Level 50', reward: 500, skillPoints: 3, attributePoints: 3, check: () => playerStats.lvl >= 50, claimed: false },
      level75: { id: 'level75', name: 'Elite Warrior', desc: 'Reach Level 75', reward: 750, skillPoints: 3, attributePoints: 3, check: () => playerStats.lvl >= 75, claimed: false },
      level100: { id: 'level100', name: 'Legendary Hero', desc: 'Reach Level 100', reward: 1000, skillPoints: 4, attributePoints: 4, check: () => playerStats.lvl >= 100, claimed: false },
      level125: { id: 'level125', name: 'Unstoppable Force', desc: 'Reach Level 125', reward: 1250, skillPoints: 4, attributePoints: 4, check: () => playerStats.lvl >= 125, claimed: false },
      level150: { id: 'level150', name: 'Ascended Champion', desc: 'Reach Level 150', reward: 1500, skillPoints: 5, attributePoints: 5, check: () => playerStats.lvl >= 150, claimed: false },

      // CRAFTING ACHIEVEMENTS - Artisan's Workshop
      craft1: { id: 'craft1', name: 'First Creation', desc: 'Craft your first item', reward: 10, skillPoints: 0, attributePoints: 0, check: () => saveData.stats && saveData.stats.itemsCrafted >= 1, claimed: false },
      craft5: { id: 'craft5', name: 'Novice Artisan', desc: 'Craft 5 items', reward: 25, skillPoints: 1, attributePoints: 0, check: () => saveData.stats && saveData.stats.itemsCrafted >= 5, claimed: false },
      craft10: { id: 'craft10', name: 'Apprentice Crafter', desc: 'Craft 10 items', reward: 50, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.itemsCrafted >= 10, claimed: false },
      craft25: { id: 'craft25', name: 'Skilled Craftsman', desc: 'Craft 25 items', reward: 100, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.itemsCrafted >= 25, claimed: false },
      craft50: { id: 'craft50', name: 'Master Artisan', desc: 'Craft 50 items', reward: 200, skillPoints: 2, attributePoints: 2, check: () => saveData.stats && saveData.stats.itemsCrafted >= 50, claimed: false },
      craft100: { id: 'craft100', name: 'Legendary Smith', desc: 'Craft 100 items', reward: 400, skillPoints: 2, attributePoints: 2, check: () => saveData.stats && saveData.stats.itemsCrafted >= 100, claimed: false },
      craft250: { id: 'craft250', name: 'Grand Artificer', desc: 'Craft 250 items', reward: 750, skillPoints: 3, attributePoints: 3, check: () => saveData.stats && saveData.stats.itemsCrafted >= 250, claimed: false },
      craft500: { id: 'craft500', name: 'Divine Creator', desc: 'Craft 500 items', reward: 1200, skillPoints: 4, attributePoints: 4, check: () => saveData.stats && saveData.stats.itemsCrafted >= 500, claimed: false },

      // STAT CARD ACHIEVEMENTS - Warehouse Slot Machine
      statCard1: { id: 'statCard1', name: 'Lucky Spin', desc: 'Use your first stat card', reward: 15, skillPoints: 0, attributePoints: 0, check: () => saveData.stats && saveData.stats.statCardsUsed >= 1, claimed: false },
      statCard5: { id: 'statCard5', name: 'Card Collector', desc: 'Use 5 stat cards', reward: 30, skillPoints: 1, attributePoints: 0, check: () => saveData.stats && saveData.stats.statCardsUsed >= 5, claimed: false },
      statCard10: { id: 'statCard10', name: 'Fortune Seeker', desc: 'Use 10 stat cards', reward: 60, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.statCardsUsed >= 10, claimed: false },
      statCard25: { id: 'statCard25', name: 'Slot Master', desc: 'Use 25 stat cards', reward: 120, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.statCardsUsed >= 25, claimed: false },
      statCard50: { id: 'statCard50', name: 'Jackpot Hunter', desc: 'Use 50 stat cards', reward: 250, skillPoints: 2, attributePoints: 2, check: () => saveData.stats && saveData.stats.statCardsUsed >= 50, claimed: false },
      statCard100: { id: 'statCard100', name: 'High Roller', desc: 'Use 100 stat cards', reward: 450, skillPoints: 3, attributePoints: 3, check: () => saveData.stats && saveData.stats.statCardsUsed >= 100, claimed: false },
      statCard250: { id: 'statCard250', name: 'Casino Legend', desc: 'Use 250 stat cards', reward: 800, skillPoints: 3, attributePoints: 3, check: () => saveData.stats && saveData.stats.statCardsUsed >= 250, claimed: false },

      // WEAPON UPGRADE ACHIEVEMENTS - Weapon Building
      weaponUpg1: { id: 'weaponUpg1', name: 'First Upgrade', desc: 'Purchase your first weapon upgrade', reward: 10, skillPoints: 0, attributePoints: 0, check: () => saveData.stats && saveData.stats.weaponsUpgraded >= 1, claimed: false },
      weaponUpg5: { id: 'weaponUpg5', name: 'Arsenal Builder', desc: 'Purchase 5 weapon upgrades', reward: 25, skillPoints: 1, attributePoints: 0, check: () => saveData.stats && saveData.stats.weaponsUpgraded >= 5, claimed: false },
      weaponUpg10: { id: 'weaponUpg10', name: 'Weapon Specialist', desc: 'Purchase 10 weapon upgrades', reward: 50, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.weaponsUpgraded >= 10, claimed: false },
      weaponUpg25: { id: 'weaponUpg25', name: 'Arms Dealer', desc: 'Purchase 25 weapon upgrades', reward: 100, skillPoints: 2, attributePoints: 2, check: () => saveData.stats && saveData.stats.weaponsUpgraded >= 25, claimed: false },
      weaponUpg50: { id: 'weaponUpg50', name: 'Military Expert', desc: 'Purchase 50 weapon upgrades', reward: 200, skillPoints: 2, attributePoints: 2, check: () => saveData.stats && saveData.stats.weaponsUpgraded >= 50, claimed: false },
      weaponUpg100: { id: 'weaponUpg100', name: 'Weapons Master', desc: 'Purchase 100 weapon upgrades', reward: 400, skillPoints: 3, attributePoints: 3, check: () => saveData.stats && saveData.stats.weaponsUpgraded >= 100, claimed: false },

      // SPIN WHEEL ACHIEVEMENTS - Weapon Building Spin Wheel
      spin1: { id: 'spin1', name: 'First Spin', desc: 'Spin the weapon wheel once', reward: 10, skillPoints: 0, attributePoints: 0, check: () => saveData.stats && saveData.stats.spinWheelSpins >= 1, claimed: false },
      spin10: { id: 'spin10', name: 'Wheel Enthusiast', desc: 'Spin the wheel 10 times', reward: 50, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.spinWheelSpins >= 10, claimed: false },
      spin25: { id: 'spin25', name: 'Lucky Spinner', desc: 'Spin the wheel 25 times', reward: 100, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.spinWheelSpins >= 25, claimed: false },
      spin50: { id: 'spin50', name: 'Wheel Addict', desc: 'Spin the wheel 50 times', reward: 200, skillPoints: 2, attributePoints: 2, check: () => saveData.stats && saveData.stats.spinWheelSpins >= 50, claimed: false },
      spin100: { id: 'spin100', name: 'Spin Champion', desc: 'Spin the wheel 100 times', reward: 350, skillPoints: 3, attributePoints: 3, check: () => saveData.stats && saveData.stats.spinWheelSpins >= 100, claimed: false },

      // ACCOUNT LEVEL ACHIEVEMENTS - Profile Building
      account5: { id: 'account5', name: 'Growing Legend', desc: 'Reach Account Level 5', reward: 100, skillPoints: 1, attributePoints: 1, check: () => saveData.accountLevel >= 5, claimed: false },
      account10: { id: 'account10', name: 'Rising Hero', desc: 'Reach Account Level 10', reward: 200, skillPoints: 2, attributePoints: 2, check: () => saveData.accountLevel >= 10, claimed: false },
      account25: { id: 'account25', name: 'Experienced Veteran', desc: 'Reach Account Level 25', reward: 400, skillPoints: 2, attributePoints: 2, check: () => saveData.accountLevel >= 25, claimed: false },
      account50: { id: 'account50', name: 'Elite Champion', desc: 'Reach Account Level 50', reward: 700, skillPoints: 3, attributePoints: 3, check: () => saveData.accountLevel >= 50, claimed: false },
      account75: { id: 'account75', name: 'Master Survivor', desc: 'Reach Account Level 75', reward: 1000, skillPoints: 4, attributePoints: 4, check: () => saveData.accountLevel >= 75, claimed: false },
      account100: { id: 'account100', name: 'Legendary Account', desc: 'Reach Account Level 100', reward: 1500, skillPoints: 5, attributePoints: 5, check: () => saveData.accountLevel >= 100, claimed: false },

      // SKILL TREE ACHIEVEMENTS
      skill1: { id: 'skill1', name: 'First Skill', desc: 'Unlock your first skill', reward: 15, skillPoints: 0, attributePoints: 0, check: () => saveData.stats && saveData.stats.skillsUnlocked >= 1, claimed: false },
      skill5: { id: 'skill5', name: 'Skill Learner', desc: 'Unlock 5 skills', reward: 40, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.skillsUnlocked >= 5, claimed: false },
      skill10: { id: 'skill10', name: 'Skill Collector', desc: 'Unlock 10 skills', reward: 75, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.skillsUnlocked >= 10, claimed: false },
      skill25: { id: 'skill25', name: 'Skill Master', desc: 'Unlock 25 skills', reward: 150, skillPoints: 2, attributePoints: 2, check: () => saveData.stats && saveData.stats.skillsUnlocked >= 25, claimed: false },
      skill48: { id: 'skill48', name: 'Complete Mastery', desc: 'Unlock all 48 skills', reward: 500, skillPoints: 5, attributePoints: 5, check: () => saveData.stats && saveData.stats.skillsUnlocked >= 48, claimed: false },

      // QUEST ACHIEVEMENTS
      quest1: { id: 'quest1', name: 'Quest Beginner', desc: 'Complete your first quest', reward: 20, skillPoints: 0, attributePoints: 0, check: () => saveData.stats && saveData.stats.questsCompleted >= 1, claimed: false },
      quest5: { id: 'quest5', name: 'Quest Adventurer', desc: 'Complete 5 quests', reward: 50, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.questsCompleted >= 5, claimed: false },
      quest10: { id: 'quest10', name: 'Quest Hero', desc: 'Complete 10 quests', reward: 100, skillPoints: 1, attributePoints: 1, check: () => saveData.stats && saveData.stats.questsCompleted >= 10, claimed: false },
      quest25: { id: 'quest25', name: 'Quest Master', desc: 'Complete 25 quests', reward: 200, skillPoints: 2, attributePoints: 2, check: () => saveData.stats && saveData.stats.questsCompleted >= 25, claimed: false },
      quest50: { id: 'quest50', name: 'Quest Legend', desc: 'Complete 50 quests', reward: 400, skillPoints: 3, attributePoints: 3, check: () => saveData.stats && saveData.stats.questsCompleted >= 50, claimed: false }
    };

    function updateAchievementsScreen() {
      const content = document.getElementById('achievements-content');
      if (!content) return;

      // Inject dark premium achievement styles once
      if (!document.getElementById('ach-dark-styles')) {
        const s = document.createElement('style');
        s.id = 'ach-dark-styles';
        s.textContent = `
          .ach-dark-header { font-family:'Bangers',cursive; font-size:28px; letter-spacing:3px;
            color:#FFD700; text-align:center; margin:0 0 16px;
            text-shadow:0 0 16px rgba(255,215,0,0.6); }
          .ach-dark-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:10px; }
          .ach-dark-card { background:#0d0d0d; border:1.5px solid #1a1a1a; border-radius:12px;
            padding:12px 10px 10px; display:flex; flex-direction:column; align-items:center;
            text-align:center; position:relative; overflow:hidden; transition:transform 0.12s, box-shadow 0.15s; }
          .ach-dark-card.ach-state-locked { filter:brightness(0.55) saturate(0.3); }
          .ach-dark-card.ach-state-claimed { background:#0d1a0d; border-color:#2d7a2d;
            box-shadow:0 0 12px rgba(76,175,80,0.3); }
          .ach-dark-card.ach-state-claimable { border-color:#FFD700;
            animation:achPulse 1.5s infinite; cursor:pointer; }
          .ach-dark-card.ach-state-claimable:hover { transform:scale(1.05); }
          @keyframes achPulse {
            0%,100% { box-shadow:0 0 10px rgba(255,215,0,0.4); }
            50%      { box-shadow:0 0 24px rgba(255,215,0,0.85); }
          }
          .ach-dark-icon { font-size:26px; margin-bottom:5px; }
          .ach-dark-name { font-size:11px; font-weight:bold; color:#e0e0e0; margin-bottom:3px; line-height:1.2; }
          .ach-dark-name.dim { color:#333; }
          .ach-dark-desc { font-size:9.5px; color:#666; line-height:1.3; margin-bottom:5px; }
          .ach-dark-desc.dim { color:#1a1a1a; }
          .ach-dark-reward { font-size:10px; color:#FFD700; margin-top:auto; }
          .ach-dark-reward.dim { color:#222; }
          .ach-dark-claim-btn { margin-top:6px; background:linear-gradient(135deg,#3a2800,#5a3d00);
            border:1.5px solid #FFD700; color:#FFD700; border-radius:6px;
            padding:3px 10px; font-size:10px; font-weight:bold; cursor:pointer;
            font-family:'Bangers',cursive; letter-spacing:0.5px; }
          .ach-dark-claimed-badge { position:absolute; top:6px; right:6px; background:#1a4a1a;
            color:#4CAF50; font-size:8px; font-weight:bold; border-radius:4px; padding:1px 5px;
            border:1px solid #2d7a2d; }
          .ach-dark-card-green { background:#0d1a0d !important; border-color:#4CAF50 !important;
            box-shadow:0 0 18px rgba(76,175,80,0.6) !important; animation:none !important; }
        `;
        document.head.appendChild(s);
      }

      let unclaimedCount = 0;
      let html = `<div class="ach-dark-header">🏆 ACHIEVEMENT HALL</div><div class="ach-dark-grid">`;

      for (const key in ACHIEVEMENTS) {
        const achievement = ACHIEVEMENTS[key];
        const isClaimed = saveData.achievements && saveData.achievements.includes(achievement.id);
        const canClaim  = !isClaimed && achievement.check();
        if (canClaim) unclaimedCount++;

        const stateClass = isClaimed ? 'ach-state-claimed' : canClaim ? 'ach-state-claimable' : 'ach-state-locked';
        const icon        = isClaimed ? '🏆' : canClaim ? '🔓' : '🔒';
        const dimCls      = (!isClaimed && !canClaim) ? ' dim' : '';
        const rewardParts = [`+${achievement.reward} 💰`];
        if (achievement.skillPoints)    rewardParts.push(`+${achievement.skillPoints} 🔮`);
        if (achievement.attributePoints) rewardParts.push(`+${achievement.attributePoints} ⭐`);

        html += `<div class="ach-dark-card ${stateClass}" id="ach-card-${achievement.id}">
          ${isClaimed ? '<div class="ach-dark-claimed-badge">✓ CLAIMED</div>' : ''}
          <div class="ach-dark-icon">${icon}</div>
          <div class="ach-dark-name${dimCls}">${achievement.name}</div>
          <div class="ach-dark-desc${dimCls}">${achievement.desc}</div>
          <div class="ach-dark-reward${dimCls}">${rewardParts.join(' · ')}</div>
          ${canClaim ? `<button class="ach-dark-claim-btn" onclick="claimAchievement('${achievement.id}')">CLAIM</button>` : ''}
        </div>`;
      }

      html += `</div>`;
      content.innerHTML = html;

      // Update notification badge on achievements button
      updateAchievementBadge(unclaimedCount);
    }

    // Alias so Achievement Hall button can call a named function
    function renderAchievementsContent(containerEl) {
      updateAchievementsScreen();
      // Also render idle achievements panel (from idle-achievements.js) if available
      if (containerEl && window.GameAchievements) {
        let idleAchWrap = containerEl.querySelector('#idle-achievements-wrap');
        if (!idleAchWrap) {
          idleAchWrap = document.createElement('div');
          idleAchWrap.id = 'idle-achievements-wrap';
          idleAchWrap.style.cssText = 'margin-top:18px;border-top:2px solid rgba(255,215,0,0.3);padding-top:14px;';
          containerEl.appendChild(idleAchWrap);
        }
        // Use idle-bootstrap's internal render if available, otherwise basic display
        if (typeof window.GameIdleBootstrap !== 'undefined' && window.GameState && window.GameState.saveData) {
          var GA = window.GameAchievements;
          var sd = window.GameState.saveData;
          var ach = sd.achievements || GA.getAchievementsDefaults();
          var defs = GA.ACHIEVEMENTS;
          if (defs && defs.length) {
            // Playing-card style for idle achievements
            var h = '<h3 style="font-family:\'Bangers\',cursive;color:#FFD700;font-size:1.4em;margin:0 0 10px;letter-spacing:1px;">⚙️ IDLE ACHIEVEMENTS</h3>';
            h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;">';
            defs.forEach(function(def) {
              var unlocked = ach.unlocked && !!ach.unlocked[def.id];
              var cardBg  = unlocked ? 'linear-gradient(160deg,#1a1200,#0d0900)' : '#050505';
              var border  = unlocked ? '2px solid #FFD700' : '2px solid #1a1a1a';
              var shadow  = unlocked ? '0 0 14px rgba(255,215,0,0.3)' : 'none';
              var icon    = unlocked ? '🏆' : '🔒';
              var nameCol = unlocked ? '#FFD700' : 'transparent';
              var nameFilter = unlocked ? '' : 'filter:blur(3px);user-select:none;';
              var descFilter = unlocked ? '' : 'filter:blur(4px);user-select:none;';
              var nameStyle = 'font-family:\'Bangers\',cursive;font-size:12px;letter-spacing:1px;' + (unlocked ? 'color:#FFD700;' : 'color:#222;' + nameFilter);
              var descStyle = 'font-size:9px;line-height:1.3;margin-top:2px;' + (unlocked ? 'color:#b89030;' : 'color:#111;' + descFilter);
              var bonusStyle = 'font-family:\'Bangers\',cursive;font-size:12px;color:#FFD700;margin-top:auto;' + (unlocked ? '' : 'opacity:0.1;');
              h += '<div style="background:' + cardBg + ';border:' + border + ';border-radius:10px;padding:12px 8px 10px;'
                 + 'display:flex;flex-direction:column;align-items:center;gap:4px;min-height:140px;text-align:center;'
                 + 'box-shadow:' + shadow + ';">'
                 + '<div style="font-size:24px;line-height:1;' + (unlocked ? '' : 'filter:brightness(0.3);') + '">' + icon + '</div>'
                 + '<div style="' + nameStyle + '">' + def.name + '</div>'
                 + '<div style="' + descStyle + '">' + def.description + '</div>'
                 + '<div style="' + bonusStyle + '">+' + def.bonus.pct + '% ' + def.bonus.type + '</div>'
                 + '</div>';
            });
            h += '</div>';
            idleAchWrap.innerHTML = h;
          }
        }
      }
    }

    function updateAchievementBadge(count) {
      let badge = document.getElementById('achievement-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'achievement-badge';
          badge.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: #FF0000;
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 0 10px rgba(255, 0, 0, 0.8);
            z-index: 100;
          `;
          const achievementsBtn = document.getElementById('achievements-btn') || document.getElementById('options-achievements-btn');
          if (achievementsBtn) achievementsBtn.appendChild(badge);
        }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    }

    // Track notification text to allow temporary override in the live stat rectangle
    let _liveStatNotification = '';
    let _liveStatNotificationTimer = null;

    function updateStatBar() {
      const liveStatEl = document.getElementById('live-stat-display');
      if (!liveStatEl || !isGameActive || isGameOver) { 
        if (liveStatEl) liveStatEl.style.display = 'none';
        return; 
      }
      
      // Build live game info for the rectangle (no full quest details)
      const parts = [];
      
      // Wave
      parts.push('⚔️ Wave ' + (waveCount || 0));
      
      // Kills
      const kills = playerStats ? playerStats.kills : 0;
      parts.push('💀 ' + kills);
      
      // Combo
      const combo = window.currentCombo || 0;
      if (combo > 1) parts.push('🔥 x' + combo);
      
      // Region
      const regionName = document.getElementById('region-name')?.textContent || 'Forest';
      parts.push('📍 ' + regionName);
      
      // Quest completion count (brief, not full quest details)
      const completedQuests = (saveData.tutorialQuests && saveData.tutorialQuests.completedQuests) || [];
      const totalQuests = Object.keys(TUTORIAL_QUESTS).length;
      if (completedQuests.length > 0) {
        parts.push('📋 ' + completedQuests.length + '/' + totalQuests);
      }
      
      // Side quest indicator
      if (saveData.achievementQuests && saveData.achievementQuests.kill7Quest === 'active') {
        parts.push('⭐ Side Quest');
      }

      // Update the live stat rectangle
      if (liveStatEl) {
        // If a notification is active, show it; otherwise show the stat bar
        if (_liveStatNotification) {
          liveStatEl.textContent = _liveStatNotification;
          liveStatEl.style.color = '#FFD700';
        } else {
          liveStatEl.textContent = parts.join('  ·  ');
          liveStatEl.style.color = '#e0e0e0';
        }
        liveStatEl.style.display = 'block';
      }
      
      // Build quest text for the left-side tracker
      let questText = '';
      const currentQuest = getCurrentQuest();
      if (currentQuest) {
        if (currentQuest.id === 'quest1_kill3') questText = Math.min(kills, 3) + '/3';
        else if (currentQuest.id === 'quest8_kill10') questText = Math.min(kills,10) + '/10';
        else if (currentQuest.id === 'quest10_kill15') questText = Math.min(kills,15) + '/15';
        else if (currentQuest.id === 'quest14_kill25') questText = Math.min(kills,25) + '/25';
        else if (currentQuest.id === 'quest26_kill20') questText = Math.min(kills,20) + '/20';
        else if (currentQuest.id === 'quest13_windmill') questText = 'Active';
        else if (currentQuest.id === 'quest15_accountVisit') questText = 'Go to Camp';
        else if (currentQuest.id === 'quest18_findCompanionEgg') questText = '→ Area 51';
        else if (currentQuest.id === 'quest19_hatchEgg') questText = 'Go to Camp';
        else if (currentQuest.id === 'quest20_trainCompanion') questText = 'Train Companion';
        else if (currentQuest.id === 'quest11_findAllLandmarks') {
          const lf = saveData.tutorialQuests.landmarksFound || {};
          const found = Object.values(LANDMARK_CONFIGS).filter(cfg => lf[cfg.key]).length;
          questText = `${found}/${Object.keys(LANDMARK_CONFIGS).length}`;
        }
        else questText = 'Active';
      }
      if (!questText && saveData.achievementQuests && saveData.achievementQuests.kill7Quest === 'active') {
        questText = 'Visit Camp';
      }
      
      // Update quest tracker (left-side overlay) — simplified: show only progress number
      const questTrackerEl = document.getElementById('quest-tracker');
      if (questTrackerEl) {
        if (currentQuest && questText) {
          // Simplified: just show icon + short progress (full name visible in stat box)
          questTrackerEl.textContent = '📜 ' + questText;
          questTrackerEl.style.display = 'block';
        } else if (currentQuest) {
          questTrackerEl.textContent = '📜 ' + (currentQuest.name || 'Quest');
          questTrackerEl.style.display = 'block';
        } else {
          questTrackerEl.style.display = 'none';
        }
      }
      // Keep super stat bar context rows in sync every frame
      _ssbUpdateContext();
    }
    window.updateStatBar = updateStatBar;
    
    // Show a notification in the live stat rectangle temporarily, then revert to stat bar
    function showLiveStatNotification(text) {
      _liveStatNotification = text;
      if (_liveStatNotificationTimer) clearTimeout(_liveStatNotificationTimer);
      _liveStatNotificationTimer = setTimeout(() => {
        _liveStatNotification = '';
        _liveStatNotificationTimer = null;
      }, 3000);
    }
    window.showLiveStatNotification = showLiveStatNotification;

    // =====================================================================
    //  SUPER STAT BAR — real-time event history with rarity color coding
    // =====================================================================
    const SSB_COLORS = {
      common:    { text: '#b0b0b0', border: 'rgba(80,80,90,0.9)',  bg: 'rgba(25,25,30,0.92)'  },
      uncommon:  { text: '#2ecc71', border: 'rgba(30,140,80,0.9)', bg: 'rgba(12,35,20,0.92)'  },
      rare:      { text: '#5dade2', border: 'rgba(30,100,180,0.9)',bg: 'rgba(12,25,50,0.92)'  },
      epic:      { text: '#c39bd3', border: 'rgba(120,50,170,0.9)',bg: 'rgba(28,12,48,0.92)'  },
      legendary: { text: '#ec7063', border: 'rgba(180,50,40,0.9)', bg: 'rgba(48,10,8,0.92)'   },
      mythic:    { text: '#FFD700', border: 'rgba(180,140,10,0.9)',bg: 'rgba(42,32,4,0.92)'   },
      gold:      { text: '#FFD700', border: 'rgba(180,140,10,0.9)',bg: 'rgba(42,32,4,0.92)'   },
      region:    { text: '#85c1e9', border: 'rgba(30,110,180,0.9)',bg: 'rgba(12,26,46,0.92)'  },
      quest:     { text: '#f9e79f', border: 'rgba(200,150,10,0.9)',bg: 'rgba(45,35,4,0.92)'   },
      death:     { text: '#ff6b6b', border: 'rgba(150,10,10,0.9)', bg: 'rgba(48,4,4,0.92)'    },
      countdown: { text: '#FFD700', border: 'rgba(180,140,10,0.9)',bg: 'rgba(42,32,4,0.92)'   }
    };

    const _ssbHistory = [];
    const SSB_MAX_HIST = 3;
    const SSB_MAX_TEXT_LEN       = 21;   // characters before truncation
    const SSB_FLASH_DURATION_MS  = 350;  // must match .ssb-new-event animation (0.35s)
    const SSB_COMBO_CHEST_MILESTONES = [5, 7, 9, 10, 12, 15, 20]; // combo→chest thresholds
    const SSB_TIMER_CRITICAL     = 5;    // quest timer seconds — red warning
    const SSB_TIMER_WARNING      = 15;   // quest timer seconds — yellow warning

    function _ssbApply(el, rarity) {
      const c = SSB_COLORS[rarity] || SSB_COLORS.common;
      el.style.color       = c.text;
      el.style.borderColor = c.border;
      el.style.background  = c.bg;
      // Mythic gets extra strong glow per spec
      if (rarity === 'mythic') {
        el.style.boxShadow  = `0 0 10px ${c.border}AA, 0 0 20px ${c.text}55, inset 0 0 6px ${c.border}33`;
        el.style.textShadow = `0 0 8px ${c.text}CC, 0 0 18px ${c.text}88, 1px 1px 2px rgba(0,0,0,0.9)`;
      } else {
        el.style.boxShadow  = `0 0 5px ${c.border}55, inset 0 0 4px ${c.border}22`;
        el.style.textShadow = `0 0 6px ${c.text}88, 1px 1px 2px rgba(0,0,0,0.9)`;
      }
    }

    function pushSuperStatEvent(text, rarity, icon, status) {
      if (!text) return;
      rarity = rarity || 'common';
      icon   = icon   || '';
      const disp = text.length > SSB_MAX_TEXT_LEN ? text.slice(0, SSB_MAX_TEXT_LEN - 1) + '\u2026' : text;
      const suffix = status === 'success' ? ' \u2705' : status === 'fail' ? ' \u274C' : status === 'death' ? ' \uD83D\uDC80' : '';
      _ssbHistory.unshift({ text: disp + suffix, rarity, icon });
      if (_ssbHistory.length > SSB_MAX_HIST) _ssbHistory.length = SSB_MAX_HIST;
      _ssbRenderEvents();
    }
    window.pushSuperStatEvent = pushSuperStatEvent;

    // Show an animated countdown step in the dedicated SSB countdown row
    function _ssbShowCountdown(message, step) {
      const el = document.getElementById('ssb-countdown');
      if (!el) return;
      // Determine urgency class from step (0=get ready/yellow, 1=3/yellow, 2=2/orange, 3=1/red, 4=survive/green)
      el.classList.remove('ssb-cd-orange', 'ssb-cd-red', 'ssb-cd-green');
      if      (step === 3) el.classList.add('ssb-cd-red');
      else if (step === 2) el.classList.add('ssb-cd-orange');
      else if (step >= 4)  el.classList.add('ssb-cd-green'); // step 4 = "Survive!"
      // else default yellow styling
      // Build display text
      let displayText;
      if (step >= 4)      displayText = '⚔️ SURVIVE!';
      else if (step === 0) displayText = '🎮 GET READY!';
      else                 displayText = `⏱️ ${message}`;
      el.textContent = displayText;
      el.style.display = 'block';
      // Pulse animation on each step
      el.classList.remove('ssb-countdown-pulse');
      void el.offsetWidth; // force reflow
      el.classList.add('ssb-countdown-pulse');
      // super-stat-bar removed from UI — skip showing parent bar
    }

    function _ssbHideCountdown() {
      const el = document.getElementById('ssb-countdown');
      if (el) el.style.display = 'none';
    }
    window._ssbHideCountdown = _ssbHideCountdown;

    function _ssbRenderEvents() {
      ['ssb-current', 'ssb-prev1', 'ssb-prev2'].forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (_ssbHistory.length > i) {
          const ev = _ssbHistory[i];
          el.innerHTML = `<span class="ssb-icon">${ev.icon}</span><span class="ssb-text">${ev.text}</span>`;
          _ssbApply(el, ev.rarity);
          el.style.display = 'flex';
        } else {
          el.innerHTML = '';
          el.style.display = 'none';
        }
      });
      // Flash animation on the current (newest) row
      const cur = document.getElementById('ssb-current');
      if (cur && _ssbHistory.length > 0) {
        cur.classList.add('ssb-new-event');
        setTimeout(() => cur.classList.remove('ssb-new-event'), SSB_FLASH_DURATION_MS);
      }
    }

    // Called every frame from updateStatBar() to keep context rows fresh
    function _ssbUpdateContext() {
      return; // super-stat-bar removed from UI

      // ---- Header: Wave · Kills · Combo ----
      const hdr = document.getElementById('ssb-header');
      if (hdr) {
        const wave  = waveCount  || 0;
        const kills = playerStats ? playerStats.kills : 0;
        const cbo   = (comboState && comboState.count >= 5) ? ` \uD83D\uDD25x${comboState.count}` : '';
        hdr.textContent = `\u2694\uFE0F${wave}  \uD83D\uDC80${kills}${cbo}`;
      }

      // ---- Region ----
      const rEl = document.getElementById('ssb-region');
      if (rEl) {
        const rname = document.getElementById('region-name')?.textContent || 'Forest';
        rEl.innerHTML = `<span class="ssb-icon">\uD83D\uDCCD</span><span class="ssb-text">${rname}</span>`;
        _ssbApply(rEl, 'region');
        rEl.style.display = 'flex';
      }

      // ---- Active Quest ----
      const qEl = document.getElementById('ssb-quest');
      if (qEl) {
        const cq = getCurrentQuest();
        const k  = playerStats ? playerStats.kills : 0;
        if (cq) {
          let prog = '';
          if      (cq.id === 'quest1_kill3')   prog = `${Math.min(k,3)}/3`;
          else if (cq.id === 'quest8_kill10')  prog = `${Math.min(k,10)}/10`;
          else if (cq.id === 'quest10_kill15') prog = `${Math.min(k,15)}/15`;
          else if (cq.id === 'quest14_kill25') prog = `${Math.min(k,25)}/25`;
          else if (cq.id === 'quest26_kill20') prog = `${Math.min(k,20)}/20`;
          else if (cq.id === 'quest11_findAllLandmarks') {
            const lf = saveData.tutorialQuests.landmarksFound || {};
            const found = Object.values(LANDMARK_CONFIGS).filter(cfg => lf[cfg.key]).length;
            prog = `${found}/${Object.keys(LANDMARK_CONFIGS).length}`;
          }
          // Timer overlay for timed quests (red when <SSB_TIMER_CRITICAL s, yellow when <SSB_TIMER_WARNING s)
          const chkT = (q) => {
            if (!q || !q.active) return '';
            const t = Math.max(0, Math.ceil(q.timeRemaining));
            return ` ${t <= SSB_TIMER_CRITICAL ? '\uD83D\uDD34' : t <= SSB_TIMER_WARNING ? '\uD83D\uDFE1' : '\u23F1'}${t}s`;
          };
          const timer = chkT(windmillQuest) || chkT(montanaQuest) || chkT(eiffelQuest);
          qEl.innerHTML = `<span class="ssb-icon">\uD83D\uDCCB</span><span class="ssb-text">${cq.name || 'Quest'}${prog ? ' ' + prog : ''}${timer}</span>`;
          _ssbApply(qEl, 'quest');
          qEl.style.display = 'flex';
        } else if (saveData.achievementQuests && saveData.achievementQuests.kill7Quest === 'active') {
          qEl.innerHTML = `<span class="ssb-icon">\u2B50</span><span class="ssb-text">Side: Visit Camp</span>`;
          _ssbApply(qEl, 'quest');
          qEl.style.display = 'flex';
        } else {
          qEl.style.display = 'none';
        }
      }

      // ---- Next Goal hint ----
      const nEl = document.getElementById('ssb-next');
      if (nEl) {
        const cbo = comboState ? comboState.count : 0;
        let goal = '';
        if (cbo >= 5) {
          const nm = SSB_COMBO_CHEST_MILESTONES.find(m => m > cbo);
          if (nm) goal = `\uD83C\uDFAF x${nm} Chest`;
        }
        if (!goal && playerStats && playerStats.xpToNextLevel > 0) {
          const left = Math.max(0, playerStats.xpToNextLevel - playerStats.xp);
          if (left > 0) goal = `\u2B06 LvlUp: ${left > 1000 ? Math.ceil(left / 1000) + 'k' : left}xp`;
        }
        if (goal) {
          nEl.innerHTML = `<span class="ssb-text">${goal}</span>`;
          _ssbApply(nEl, 'common');
          nEl.style.display = 'flex';
        } else {
          nEl.style.display = 'none';
        }
      }

      // ---- Game timer removed per UI overhaul (yellow timer stat bar) ----
      // The elapsed-time display is hidden; ssb-countdown only shows during the
      // initial 3-2-1 countdown (handled by _ssbShowCountdown, not here).
      const cdEl = document.getElementById('ssb-countdown');
      if (cdEl && !countdownActive) {
        cdEl.style.display = 'none';
      }
    }
    window._ssbUpdateContext = _ssbUpdateContext;

    function claimAchievement(achievementId) {
      const achievement = Object.values(ACHIEVEMENTS).find(a => a.id === achievementId);
      if (!achievement) return;
      
      const isClaimed = saveData.achievements && saveData.achievements.includes(achievement.id);
      const canClaim = !isClaimed && achievement.check();
      
      if (!canClaim) return;
      
      // Mark as claimed
      if (!saveData.achievements) saveData.achievements = [];
      saveData.achievements.push(achievement.id);
      
      // Award gold
      addGold(achievement.reward);
      
      // Award attribute points (with safety check)
      const attributePoints = achievement.attributePoints || 0;
      saveData.unspentAttributePoints += attributePoints;
      
      // Award skill points (with safety check)
      const skillPoints = achievement.skillPoints || 0;
      saveData.skillPoints += skillPoints;
      
      // Play sound
      playSound('coin');
      
      // Show dopamine achievement notification (replaces old gold bag + enhanced notification)
      showAchievementNotification(achievement, skillPoints, attributePoints);
      
      // ── Dopamine Boost: screen flash + card turn green ──
      // Screen white flash
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;pointer-events:none;z-index:99999;opacity:0.7;transition:opacity 0.35s ease-out;';
      document.body.appendChild(flash);
      requestAnimationFrame(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 380);
      });

      // Spawn sparkle particles around the card
      const cardEl = document.getElementById('ach-card-' + achievement.id);
      if (cardEl) {
        // Float "+reward 💰" text up from card
        const rect = cardEl.getBoundingClientRect();
        const float = document.createElement('div');
        float.textContent = `+${achievement.reward} 💰`;
        float.style.cssText = `position:fixed;left:${rect.left + rect.width/2 - 30}px;top:${rect.top}px;
          color:#FFD700;font-family:'Bangers',cursive;font-size:18px;font-weight:bold;
          pointer-events:none;z-index:99998;text-shadow:0 0 8px rgba(255,215,0,0.8);
          transition:transform 0.8s ease-out,opacity 0.8s ease-out;`;
        document.body.appendChild(float);
        requestAnimationFrame(() => {
          float.style.transform = 'translateY(-60px)';
          float.style.opacity = '0';
          setTimeout(() => float.remove(), 820);
        });

        // Sparkle burst
        for (let i = 0; i < 10; i++) {
          const spark = document.createElement('div');
          const angle = (i / 10) * Math.PI * 2;
          const dist  = 30 + Math.random() * 40;
          spark.textContent = ['✨','⭐','💫','🌟'][i % 4];
          spark.style.cssText = `position:fixed;left:${rect.left + rect.width/2}px;top:${rect.top + rect.height/2}px;
            font-size:14px;pointer-events:none;z-index:99997;
            transition:transform 0.6s ease-out,opacity 0.6s ease-out;`;
          document.body.appendChild(spark);
          requestAnimationFrame(() => {
            spark.style.transform = `translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px)`;
            spark.style.opacity = '0';
            setTimeout(() => spark.remove(), 650);
          });
        }
      }

      // Save
      saveSaveData();
      
      // Refresh screen (card will now be green/claimed in re-render)
      updateAchievementsScreen();
    }
    
    // Expose to global scope for onclick handlers
    window.claimAchievement = claimAchievement;
    window.checkAchievements = checkAchievements;

    // ── FEATURE 4: Hall of Fame Screen ───────────────────────────────────────
    function showHallOfFameScreen() {
      // Mark tutorial quest if applicable
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest12_visitAchievements') {
        if (typeof progressTutorialQuest === 'function') progressTutorialQuest('quest12_visitAchievements', true);
        if (typeof saveSaveData === 'function') saveSaveData();
      }

      const existing = document.getElementById('hall-of-fame-overlay');
      if (existing) existing.remove();

      // Format time helper
      const fmtTime = (ms) => {
        if (!ms || ms <= 0) return '—';
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        if (h > 0) return `${h}h ${m % 60}m`;
        if (m > 0) return `${m}m ${s % 60}s`;
        return `${s}s`;
      };

      const bestWave   = saveData.bestWave   || saveData.highestWave   || 0;
      const totalKills = saveData.totalKills  || 0;
      const totalRuns  = saveData.totalRuns   || saveData.runCount      || 0;
      const bestKills  = saveData.bestKills   || 0;
      const bestTime   = saveData.bestTime    || 0;
      const totalTime  = saveData.totalTimePlayed || 0;
      const bestGold   = saveData.bestGoldRun || 0;
      const runHistory = saveData.runHistory  || [];

      const statCards = [
        { icon:'🏆', label:'Best Wave',       value: bestWave  || '—', color:'#FFD700' },
        { icon:'💀', label:'Total Kills',      value: totalKills.toLocaleString(), color:'#ff6644' },
        { icon:'🔄', label:'Total Runs',       value: totalRuns.toLocaleString(),  color:'#5DADE2' },
        { icon:'⏱️', label:'Total Time',       value: fmtTime(totalTime),          color:'#aa44ff' },
        { icon:'⚡', label:'Best Run Time',    value: fmtTime(bestTime),           color:'#44dd88' },
        { icon:'💥', label:'Best Run Kills',   value: bestKills.toLocaleString(),  color:'#ff4444' },
        ...(bestGold > 0 ? [{ icon:'💰', label:'Best Run Gold', value: bestGold.toLocaleString(), color:'#FFD700' }] : [])
      ];

      let statsHTML = statCards.map(c => `
        <div style="background:rgba(255,255,255,0.04);border:1.5px solid ${c.color}33;border-radius:12px;
          padding:14px 10px;text-align:center;min-width:100px;flex:1;">
          <div style="font-size:28px;margin-bottom:4px;">${c.icon}</div>
          <div style="font-size:20px;font-weight:bold;color:${c.color};font-family:'Bangers',cursive;letter-spacing:1px;">${c.value}</div>
          <div style="font-size:10px;color:#888;margin-top:2px;">${c.label}</div>
        </div>`).join('');

      let historyHTML = '';
      if (runHistory.length > 0) {
        const recent = runHistory.slice(-5).reverse();
        historyHTML = `<div style="margin-top:20px;">
          <div style="font-family:'Bangers',cursive;font-size:18px;color:#FFD700;letter-spacing:1px;margin-bottom:10px;">📜 Recent Runs</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
          ${recent.map((r,i) => `
            <div style="background:rgba(255,255,255,0.03);border:1px solid #222;border-radius:8px;
              padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
              <span style="color:#555;">#${i + 1}</span>
              <span>Wave <b style="color:#FFD700;">${r.wave||'?'}</b></span>
              <span>💀 ${(r.kills||0).toLocaleString()}</span>
              <span>💰 ${(r.gold||0).toLocaleString()}</span>
              <span style="color:#888;">${fmtTime(r.time)}</span>
            </div>`).join('')}
          </div>
        </div>`;
      }

      const overlay = document.createElement('div');
      overlay.id = 'hall-of-fame-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.97);z-index:9000;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:20px 16px 40px;box-sizing:border-box;';

      overlay.innerHTML = `
        <div style="max-width:700px;width:100%;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="font-size:48px;margin-bottom:6px;">🏛️</div>
            <div style="font-family:'Bangers',cursive;font-size:36px;color:#FFD700;letter-spacing:3px;text-shadow:0 0 20px rgba(255,215,0,0.6);">HALL OF FAME</div>
            <div style="color:#555;font-size:12px;margin-top:4px;">Your legacy as a Waterdrop Survivor</div>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:8px;">
            ${statsHTML}
          </div>

          ${historyHTML}

          <div style="margin-top:28px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button onclick="window.openAchievementsFromHallOfFame()" style="background:linear-gradient(135deg,#1a1200,#2a2000);border:2px solid #FFD700;color:#FFD700;padding:10px 22px;border-radius:8px;font-family:'Bangers',cursive;font-size:16px;letter-spacing:1px;cursor:pointer;">🏆 View Achievements</button>
            <button onclick="window.closeHallOfFame()"
              style="background:rgba(255,255,255,0.05);border:1.5px solid #333;color:#aaa;padding:10px 22px;border-radius:8px;font-size:14px;cursor:pointer;">← Back to Camp</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      // Hide camp screen while overlay is open
      const campScreen = document.getElementById('camp-screen');
      if (campScreen) campScreen.style.display = 'none';
    }

    window.showHallOfFameScreen = showHallOfFameScreen;

    window.openAchievementsFromHallOfFame = function() {
      const hof = document.getElementById('hall-of-fame-overlay');
      if (hof) hof.remove();
      const achScreen = document.getElementById('achievements-screen');
      if (achScreen) {
        achScreen.style.display = 'flex';
        const c = document.getElementById('achievements-content');
        if (c && typeof renderAchievementsContent === 'function') renderAchievementsContent(c);
      }
    };

    window.closeHallOfFame = function() {
      const hof = document.getElementById('hall-of-fame-overlay');
      if (hof) hof.remove();
      const cs = document.getElementById('camp-screen');
      if (cs) cs.style.display = 'flex';
    };

    // ── Achievement Dopamine Notification ────────────────────────────────────
    // Slides up from the bottom: achievement logo, slot-machine reward reveal,
    // rolling gold counter, then rarity confetti + rays burst.

    // Full 6-tier rarity colours (matching CSS rarity classes)
    const _ACH_RARITY_COLORS = {
      common:    '#aaaaaa',
      uncommon:  '#55cc55',
      rare:      '#44aaff',
      epic:      '#aa44ff',
      legendary: '#ffaa00',
      mythic:    '#ff4444'
    };

    // Weighted spin pool — [ label, rarityKey, weight ]
    // Higher rarity → lower weight → rarer appearance during the spin
    const _ACH_SPIN_POOL = [
      // Common (grey) — very frequent
      ['🥉 50 Gold',          'common',   40],
      ['🌿 Herb Bundle',      'common',   38],
      ['🔩 Iron Scrap',       'common',   36],
      ['🪵 Wood Bundle',      'common',   34],
      ['🪨 Stone Chunk',      'common',   32],
      // Uncommon (green)
      ['💰 200 Gold',         'uncommon', 22],
      ['🗺️ Explorer Map',    'uncommon', 20],
      ['🌀 Essence Vial',     'uncommon', 20],
      ['🍀 Lucky Charm',      'uncommon', 18],
      ['🌱 Growth Tonic',     'uncommon', 16],
      // Rare (blue)
      ['🔮 +1 Skill Point',   'rare',     12],
      ['⭐ +1 Attr Point',    'rare',     11],
      ['💠 Sapphire Gem',     'rare',     10],
      ['🏹 Swift Bow',        'rare',      9],
      ['🗡️ Fine Dagger',     'rare',      8],
      // Epic (purple)
      ['🔮 +2 Skill Pts',     'epic',      7],
      ['⭐ +2 Attr Pts',      'epic',      6],
      ['💎 Amethyst Crystal', 'epic',      5],
      ['🛡️ Enchanted Shield','epic',      5],
      ['🗡️ Epic Blade',      'epic',      4],
      // Legendary (orange/gold)
      ['⚔️ Legendary Sword',  'legendary', 3],
      ['👑 Golden Crown',      'legendary', 3],
      ['✨ +3 Skill Pts',      'legendary', 2],
      ['🔱 Golden Trident',    'legendary', 2],
      ['🌟 Sunfire Relic',     'legendary', 2],
      // Mythic (red) — rarest
      ['🔴 Mythic Blade',      'mythic',    1],
      ['💎 Dragon Gem',        'mythic',    1],
      ['👁️ Eye of the Gods',  'mythic',    1],
      ['⚡ Godly Power Shard', 'mythic',    1],
      ['🐉 Dragon Soul',       'mythic',    1]
    ];

    function _weightedSpinPick(pool) {
      let total = 0;
      for (let i = 0; i < pool.length; i++) total += pool[i][2];
      let r = Math.random() * total;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i][2];
        if (r < 0) return pool[i];
      }
      return pool[pool.length - 1];
    }

    function _achievementRarity(skillPts, attrPts, gold) {
      const sp = skillPts || 0;
      const ap = attrPts  || 0;
      const g  = gold     || 0;
      if (sp >= 5 || ap >= 5 || g >= 1500) return 'mythic';
      if (sp >= 4 || ap >= 4 || g >= 1000) return 'legendary';
      if (sp >= 3 || ap >= 3 || g >= 750)  return 'epic';
      if (sp >= 2 || ap >= 2 || g >= 500)  return 'rare';
      if (sp >= 1 || ap >= 1 || g >= 200)  return 'uncommon';
      return 'common';
    }

    // Helper: set spinEl content safely using DOM (avoids innerHTML XSS)
    function _setSpinLabel(el, text, color) {
      el.textContent = '';
      const span = document.createElement('span');
      span.textContent = text;
      span.style.color = color;
      span.style.textShadow = '0 0 10px ' + color + '88, 0 1px 3px #000';
      el.appendChild(span);
    }

    function showAchievementNotification(achievement, skillPoints, attributePoints) {
      const gold     = achievement.reward || 0;
      const skillPts = skillPoints  || 0;
      const attrPts  = attributePoints || 0;
      const rarity   = _achievementRarity(skillPts, attrPts, gold);
      const rarityColor = _ACH_RARITY_COLORS[rarity] || _ACH_RARITY_COLORS.common;

      // Zoom scale for spin reveal: mythic > legendary > epic/rare > others
      const isHighRarity = rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic';
      const isTopTier    = rarity === 'legendary' || rarity === 'mythic';
      const logoSizePx   = rarity === 'mythic' ? 64 : isTopTier ? 52 : isHighRarity ? 44 : 40;

      // Build final reward label (shown when spin lands)
      const rewardParts = [];
      if (gold > 0)     rewardParts.push('🪙 +' + gold + ' GOLD');
      if (skillPts > 0) rewardParts.push('🔮 +' + skillPts + ' Skill Point' + (skillPts > 1 ? 's' : ''));
      if (attrPts > 0)  rewardParts.push('⭐ +' + attrPts + ' Attribute Point' + (attrPts > 1 ? 's' : ''));
      const finalLabel = rewardParts.join('  ');

      // Panel element
      const panel = document.createElement('div');
      panel.className = 'ach-notif-panel';
      panel.style.cssText = [
        'position:fixed',
        'bottom:0',
        'left:50%',
        'transform:translateX(-50%) translateY(110%)',
        'z-index:100000',
        'background:#0a0a0a',
        'border:2px solid ' + rarityColor,
        'border-radius:16px 16px 0 0',
        'padding:20px 28px 24px',
        'min-width:300px',
        'max-width:420px',
        'text-align:center',
        'pointer-events:none',
        'box-shadow:0 -6px 40px rgba(0,0,0,0.9), 0 0 30px ' + rarityColor + '55',
        'will-change:transform'
      ].join(';');

      panel.innerHTML = [
        '<div class="ach-notif-logo" style="font-size:' + logoSizePx + 'px;filter:drop-shadow(0 0 12px ' + rarityColor + ')">🏆</div>',
        '<div class="ach-notif-title" style="color:' + rarityColor + '">ACHIEVEMENT UNLOCKED!</div>',
        '<div class="ach-notif-name">' + (achievement.name || '') + '</div>',
        '<div class="ach-notif-spin-wrap' + (isHighRarity ? ' ach-notif-spin-zoom' : '') + '">',
        '  <div class="ach-notif-spin" id="ach-spin-text">🌀 ???</div>',
        '</div>',
        '<div class="ach-notif-gold" id="ach-gold-counter" style="display:none">',
        '  <span class="ach-gold-icon">🪙</span>',
        '  <span class="ach-gold-num" id="ach-gold-num">0</span>',
        '  <span class="ach-gold-label"> GOLD</span>',
        '</div>',
        '<div class="ach-notif-claim-hint" style="margin-top:12px;font-size:11px;color:#ffaa00;text-transform:uppercase;letter-spacing:1px;opacity:0.85">',
        '  🏆 Claim rewards in Achievement Building',
        '</div>'
      ].join('');

      document.body.appendChild(panel);

      // Slide up
      requestAnimationFrame(() => {
        panel.style.transition = 'transform 0.5s cubic-bezier(0.22,1,0.36,1)';
        panel.style.transform  = 'translateX(-50%) translateY(0)';
      });

      // Slot-machine spin: cycle through weighted pool with colored labels, decelerate, land
      const spinEl  = panel.querySelector('#ach-spin-text');
      const spinIntervals = [70, 70, 80, 80, 100, 120, 150, 190, 250, 320];
      let spinIdx = 0;
      function _nextSpin() {
        if (spinIdx < spinIntervals.length) {
          const picked = _weightedSpinPick(_ACH_SPIN_POOL);
          const pColor = _ACH_RARITY_COLORS[picked[1]] || _ACH_RARITY_COLORS.common;
          _setSpinLabel(spinEl, picked[0], pColor);
          spinEl.style.transform = isHighRarity ? 'scale(1.15)' : 'scale(1.0)';
          setTimeout(() => { spinEl.style.transform = ''; }, spinIntervals[spinIdx] * 0.5);
          setTimeout(_nextSpin, spinIntervals[spinIdx++]);
        } else {
          // Land on actual reward — render with rarity colour via DOM
          _setSpinLabel(spinEl, finalLabel, rarityColor);
          spinEl.classList.add('ach-notif-spin-landed');

          // If gold reward: start rolling counter
          if (gold > 0) {
            const goldRow   = panel.querySelector('#ach-gold-counter');
            const goldNumEl = panel.querySelector('#ach-gold-num');
            goldRow.style.display = 'flex';
            // Duration: 400ms base + up to 800ms extra for large amounts, capped at 1200ms
            const dur = Math.min(1200, 400 + gold * 0.4);
            const t0  = performance.now();
            function _rollGold(now) {
              const progress = Math.min((now - t0) / dur, 1);
              goldNumEl.textContent = Math.floor(progress * gold);
              if (progress < 1) requestAnimationFrame(_rollGold);
              else goldNumEl.textContent = gold;
            }
            requestAnimationFrame(_rollGold);
          }

          // Fireworks burst after spin settles
          setTimeout(() => {
            if (typeof window.spawnRarityEffects === 'function') {
              window.spawnRarityEffects(panel, rarity);
            }
          }, 200);
        }
      }
      // Wait ~400ms for panel to slide into position before spinning
      const PANEL_SLIDE_DURATION_MS = 400;
      setTimeout(_nextSpin, PANEL_SLIDE_DURATION_MS);

      // Auto-dismiss after 5.2 seconds
      const ACHIEVEMENT_DISPLAY_DURATION_MS = 5200;
      setTimeout(() => {
        panel.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
        panel.style.transform  = 'translateX(-50%) translateY(110%)';
        panel.style.opacity    = '0';
        setTimeout(() => { if (panel.parentNode) panel.parentNode.removeChild(panel); }, 450);
      }, ACHIEVEMENT_DISPLAY_DURATION_MS);
    }

    function checkAchievements() {
      // This function just checks if achievements are unlocked (not auto-claiming)
      // Players must click to claim in the achievements menu
      let hasNewAchievement = false;
      let unclaimedCount = 0;
      
      for (const key in ACHIEVEMENTS) {
        const achievement = ACHIEVEMENTS[key];
        
        // Skip if already claimed - achievements are permanent once unlocked
        if (saveData.achievements && saveData.achievements.includes(achievement.id)) {
          continue;
        }
        
        // Check if achieved - mark internally but don't auto-claim
        if (achievement.check()) {
          hasNewAchievement = true;
          unclaimedCount++;
          
          // Show notification only the FIRST TIME it's unlocked (not on every run)
          // Check if this specific achievement has been notified before by storing in localStorage
          // Note: Notification state is tracked separately from claim state to avoid re-showing
          // notifications in new runs before claiming. If localStorage is cleared, notifications
          // may re-appear but will still respect the saveData.achievements claim status.
          const notifyKey = `achievement_notified_${achievement.id}`;
          let hasBeenNotified = false;
          
          try {
            hasBeenNotified = localStorage.getItem(notifyKey);
          } catch (e) {
            // localStorage may fail in private browsing or when quota exceeded
            console.warn('localStorage not available for achievement tracking');
          }
          
          if (!hasBeenNotified) {
            try {
              localStorage.setItem(notifyKey, 'true');
            } catch (e) {
              // Ignore storage errors - notification will show again next time
            }
            // Use showStatChange style for first-time achievements
            showStatChange(`🏆 ${achievement.name} - Check Achievements Menu!`);
            playSound('levelup');
          }
        }
      }
      
      // Update achievement badge - only do full DOM rebuild when screen is visible.
      // Calling updateAchievementsScreen() on every kill (after level 10 achievement
      // becomes active) caused severe lag: the heavy innerHTML rebuild ran on every
      // enemy kill. Now we update only the lightweight badge during gameplay and
      // defer the full rebuild until the player actually opens the achievements screen.
      if (hasNewAchievement) {
        const achScreen = document.getElementById('achievements-screen');
        if (achScreen && achScreen.style.display === 'flex') {
          updateAchievementsScreen();
        } else {
          updateAchievementBadge(unclaimedCount);
        }
      }
    }

    // --- ATTRIBUTES SYSTEM ---
    const ATTRIBUTE_INFO = {
      dexterity: {
        name: 'Dexterity',
        icon: '🎯',
        description: 'Improves attack speed and critical chance',
        effects: {
          attackSpeed: 0.03, // +3% per point
          critChance: 0.01   // +1% per point
        }
      },
      strength: {
        name: 'Strength',
        icon: '💪',
        description: 'Increases damage output',
        effects: {
          damage: 0.05 // +5% per point
        }
      },
      vitality: {
        name: 'Vitality',
        icon: '❤️',
        description: 'Boosts maximum health and health regeneration',
        effects: {
          maxHp: 10,      // +10 HP per point
          hpRegen: 0.25   // +0.25 HP/sec per point
        }
      },
      luck: {
        name: 'Luck',
        icon: '🍀',
        description: 'Increases critical damage and treasure find chance',
        effects: {
          critDamage: 0.05,       // +5% crit damage per point
          goldEarned: 0.03        // +3% gold find per point
        }
      },
      wisdom: {
        name: 'Wisdom',
        icon: '🧠',
        description: 'Reduces cooldowns and increases experience gain',
        effects: {
          cooldownReduction: 0.02, // +2% per point
          expEarned: 0.03          // +3% per point
        }
      }
    };

    function updateAttributesScreen() {
      const content = document.getElementById('attributes-content');
      const pointsDisplay = document.getElementById('attr-points-display');
      
      if (!content || !pointsDisplay) return;
      
      const unspent = saveData.unspentAttributePoints || 0;
      pointsDisplay.textContent = `Unspent Points: ${unspent}`;
      
      // Update badge on attributes button if there are unspent points
      updateAttributesBadge(unspent);
      
      let html = '';
      
      for (const attrKey in ATTRIBUTE_INFO) {
        const attr = ATTRIBUTE_INFO[attrKey];
        const currentLevel = saveData.attributes[attrKey] || 0;
        const canIncrease = unspent > 0;
        
        // Build effects display
        let effectsHtml = '';
        for (const effectKey in attr.effects) {
          const value = attr.effects[effectKey];
          const effectName = effectKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          const displayValue = effectKey.includes('Hp') ? `+${value}` : `+${(value * 100).toFixed(0)}%`;
          effectsHtml += `<div style="color: #90ee90; font-size: 13px;">• ${effectName}: ${displayValue} per point</div>`;
        }
        
        html += `
          <div style="
            background: linear-gradient(to bottom, #2a3a4a, #1a2a3a);
            border: 3px solid #5DADE2;
            border-radius: 15px;
            padding: 20px;
            text-align: left;
            position: relative;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 32px;">${attr.icon}</span>
                <div>
                  <div style="color: #5DADE2; font-size: 22px; font-weight: bold;">${attr.name}</div>
                  <div style="color: #aaa; font-size: 14px;">Level: ${currentLevel}</div>
                </div>
              </div>
              <button 
                onclick="increaseAttribute('${attrKey}')" 
                style="
                  padding: 10px 20px;
                  font-size: 24px;
                  background: ${canIncrease ? 'linear-gradient(to bottom, #3498DB, #2C3E50)' : '#555'};
                  color: white;
                  border: 2px solid ${canIncrease ? '#5DADE2' : '#777'};
                  border-radius: 10px;
                  cursor: ${canIncrease ? 'pointer' : 'not-allowed'};
                  opacity: ${canIncrease ? '1' : '0.5'};
                "
                ${!canIncrease ? 'disabled' : ''}
              >+</button>
            </div>
            <div style="color: #ddd; font-size: 14px; margin-bottom: 10px;">${attr.description}</div>
            <div style="margin-top: 10px;">
              ${effectsHtml}
            </div>
          </div>
        `;
      }
      
      content.innerHTML = html;
    }

    function updateAttributesBadge(count) {
      let badge = document.getElementById('attributes-badge');
      const attrBtn = document.getElementById('attributes-btn');
      
      if (count > 0 && attrBtn) {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'attributes-badge';
          badge.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: #FF0000;
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 0 10px rgba(255, 0, 0, 0.8);
            z-index: 100;
          `;
          attrBtn.appendChild(badge);
        }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    }

    function increaseAttribute(attrKey) {
      if (!saveData.attributes[attrKey]) saveData.attributes[attrKey] = 0;
      
      if (saveData.unspentAttributePoints > 0) {
        saveData.attributes[attrKey]++;
        saveData.unspentAttributePoints--;
        
        playSound('levelup');
        saveSaveData();
        updateAttributesScreen();
      }
    }
    
    // Expose to global scope for onclick handlers
    window.increaseAttribute = increaseAttribute;
    window.saveSaveData = saveSaveData;

    // --- GEAR SYSTEM ---
    const GEAR_ATTRIBUTES = {
      flexibility: { name: 'Flexibility', icon: '🤸', color: '#9B59B6' },
      movementSpeed: { name: 'Movement Speed', icon: '💨', color: '#3498DB' },
      attackSpeed: { name: 'Attack Speed', icon: '⚡', color: '#F39C12' },
      attackPrecision: { name: 'Attack Precision', icon: '🎯', color: '#E74C3C' },
      critChance: { name: 'Crit Chance', icon: '✨', color: '#E67E22' },
      elementalMagic: { name: 'Elemental Magic', icon: '🔮', color: '#8E44AD' }
    };

    // Phase 1: Define starter gear for all 6 slots
    const STARTER_GEAR = [
      {
        id: 'starter_weapon',
        name: 'Worn Sword',
        type: 'weapon',
        rarity: 'common',
        stats: { attackSpeed: 1, attackPrecision: 1 },
        description: 'A basic weapon'
      },
      {
        id: 'starter_armor',
        name: 'Leather Vest',
        type: 'armor',
        rarity: 'common',
        stats: { flexibility: 2, movementSpeed: 1 },
        description: 'Basic protection'
      },
      {
        id: 'starter_helmet',
        name: 'Cloth Cap',
        type: 'helmet',
        rarity: 'common',
        stats: { flexibility: 1 },
        description: 'Simple head covering'
      },
      {
        id: 'starter_boots',
        name: 'Worn Boots',
        type: 'boots',
        rarity: 'common',
        stats: { movementSpeed: 1 },
        description: 'Weathered footwear'
      },
      {
        id: 'starter_ring',
        name: 'Brass Ring',
        type: 'ring',
        rarity: 'common',
        stats: { critChance: 1 },
        description: 'Simple metal band'
      },
      {
        id: 'starter_amulet',
        name: 'Wooden Pendant',
        type: 'amulet',
        rarity: 'common',
        stats: { elementalMagic: 1 },
        description: 'Carved charm'
      }
    ];

    // Additional gear that can be obtained (for future expansion)
    const GEAR_POOL = [
      {
        id: 'blazing_sword',
        name: 'Blazing Sword',
        type: 'weapon',
        rarity: 'rare',
        stats: { attackSpeed: 2, attackPrecision: 2, elementalMagic: 1 },
        description: 'A sword wreathed in flames'
      },
      {
        id: 'frost_blade',
        name: 'Frost Blade',
        type: 'weapon',
        rarity: 'epic',
        stats: { attackSpeed: 3, attackPrecision: 3, elementalMagic: 2 },
        description: 'Freezes enemies on hit'
      },
      {
        id: 'shadow_cloak',
        name: 'Shadow Cloak',
        type: 'armor',
        rarity: 'rare',
        stats: { flexibility: 3, movementSpeed: 2 },
        description: 'Move like a shadow'
      },
      {
        id: 'dragon_plate',
        name: 'Dragon Plate',
        type: 'armor',
        rarity: 'legendary',
        stats: { flexibility: 2, movementSpeed: 1, attackPrecision: 2 },
        description: 'Forged from dragon scales'
      },
      // Phase 1: Helmets
      {
        id: 'iron_helmet',
        name: 'Iron Helmet',
        type: 'helmet',
        rarity: 'uncommon',
        stats: { flexibility: 2 },
        description: 'Sturdy head protection'
      },
      {
        id: 'crown_of_wisdom',
        name: 'Crown of Wisdom',
        type: 'helmet',
        rarity: 'epic',
        stats: { flexibility: 2, elementalMagic: 2 },
        description: 'Enhances magical abilities'
      },
      // Phase 1: Boots
      {
        id: 'speed_boots',
        name: 'Winged Boots',
        type: 'boots',
        rarity: 'epic',
        stats: { movementSpeed: 4, flexibility: 1 },
        description: 'Swift as the wind'
      },
      {
        id: 'shadow_steps',
        name: 'Shadow Steps',
        type: 'boots',
        rarity: 'rare',
        stats: { movementSpeed: 3 },
        description: 'Silent and swift'
      },
      // Phase 1: Rings
      {
        id: 'crit_ring',
        name: 'Ring of Critical Strikes',
        type: 'ring',
        rarity: 'rare',
        stats: { critChance: 3, attackPrecision: 1 },
        description: 'Increases critical hit chance'
      },
      {
        id: 'power_ring',
        name: 'Ring of Power',
        type: 'ring',
        rarity: 'legendary',
        stats: { attackSpeed: 2, attackPrecision: 2, critChance: 1 },
        description: 'Overwhelming offensive power'
      },
      // Phase 1: Amulets
      {
        id: 'magic_amulet',
        name: 'Arcane Amulet',
        type: 'amulet',
        rarity: 'legendary',
        stats: { elementalMagic: 4, attackSpeed: 2 },
        description: 'Channels magical energy'
      },
      {
        id: 'life_amulet',
        name: 'Amulet of Life',
        type: 'amulet',
        rarity: 'epic',
        stats: { flexibility: 3, elementalMagic: 1 },
        description: 'Grants vitality and resilience'
      }
    ];

    function initializeGear() {
      // Phase 1: Give players starter gear for all 6 slots if they don't have any
      if (!saveData.inventory || saveData.inventory.length === 0) {
        saveData.inventory = [...STARTER_GEAR];
        
        // Auto-equip all 6 starter items
        saveData.equippedGear.weapon = 'starter_weapon';
        saveData.equippedGear.armor = 'starter_armor';
        saveData.equippedGear.helmet = 'starter_helmet';
        saveData.equippedGear.boots = 'starter_boots';
        saveData.equippedGear.ring = 'starter_ring';
        saveData.equippedGear.amulet = 'starter_amulet';
        
        saveSaveData();
      }
    }

    function updateGearScreen() {
      const content = document.getElementById('gear-content');
      const statsContent = document.getElementById('gear-stats-content');
      
      if (!content || !statsContent) return;
      
      // Calculate total gear bonuses
      const gearStats = calculateGearStats();
      
      // Update stats display
      let statsHtml = '';
      for (const statKey in GEAR_ATTRIBUTES) {
        const stat = GEAR_ATTRIBUTES[statKey];
        const value = gearStats[statKey] || 0;
        statsHtml += `
          <div style="display: flex; align-items: center; gap: 10px; padding: 5px;">
            <span style="font-size: 24px;">${stat.icon}</span>
            <div>
              <div style="color: ${stat.color}; font-size: 14px; font-weight: bold;">${stat.name}</div>
              <div style="color: #FFD700; font-size: 16px; font-weight: bold;">+${value}</div>
            </div>
          </div>
        `;
      }
      statsContent.innerHTML = statsHtml;
      
      // Phase 1: Build gear slots display for all 6 slots
      let html = '';
      
      const slots = [
        { key: 'weapon', name: 'Weapon', icon: '⚔️' },
        { key: 'armor', name: 'Armor', icon: '🛡️' },
        { key: 'helmet', name: 'Helmet', icon: '⛑️' },
        { key: 'boots', name: 'Boots', icon: '👢' },
        { key: 'ring', name: 'Ring', icon: '💍' },
        { key: 'amulet', name: 'Amulet', icon: '📿' }
      ];
      
      for (const slot of slots) {
        const equippedId = saveData.equippedGear[slot.key];
        const equippedGear = equippedId ? saveData.inventory.find(g => g.id === equippedId) : null;
        
        html += `
          <div style="background: linear-gradient(to bottom, #2a3a4a, #1a2a3a); border: 3px solid #F39C12; border-radius: 15px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 32px;">${slot.icon}</span>
                <div style="color: #F39C12; font-size: 20px; font-weight: bold;">${slot.name}</div>
              </div>
            </div>
            ${equippedGear ? `
              <div style="background: rgba(0,0,0,0.3); border: 2px solid ${getRarityColor(equippedGear.rarity)}; border-radius: 10px; padding: 15px;">
                <div style="color: ${getRarityColor(equippedGear.rarity)}; font-size: 18px; font-weight: bold; margin-bottom: 5px;">
                  ${equippedGear.name}
                </div>
                <div style="color: #aaa; font-size: 13px; margin-bottom: 10px;">${equippedGear.description}</div>
                <div style="margin-bottom: 10px;">
                  ${Object.entries(equippedGear.stats).map(([stat, val]) => GEAR_ATTRIBUTES[stat] ? `
                    <div style="color: #90ee90; font-size: 13px;">• ${GEAR_ATTRIBUTES[stat].name}: +${val}</div>
                  ` : '').join('')}
                </div>
                <button onclick="unequipGear('${slot.key}')" style="padding: 8px 15px; background: linear-gradient(to bottom, #c0392b, #a93226); color: white; border: 2px solid #e74c3c; border-radius: 8px; cursor: pointer; font-weight: bold;">UNEQUIP</button>
              </div>
            ` : `
              <div style="color: #777; font-size: 14px; text-align: center; padding: 20px;">
                Empty Slot
              </div>
            `}
            <div style="margin-top: 15px;">
              <div style="color: #5DADE2; font-size: 16px; font-weight: bold; margin-bottom: 10px;">Available Gear:</div>
              <div style="display: grid; gap: 10px; max-height: 200px; overflow-y: auto;">
                ${saveData.inventory.filter(g => {
                  const gearType = g.type === 'accessory' ? (slot.key === 'accessory1' || slot.key === 'accessory2') : g.type === slot.key;
                  const notEquipped = g.id !== equippedId;
                  return gearType && notEquipped;
                }).map(gear => `
                  <div class="gear-inventory-item" data-slot="${slot.key}" data-gearid="${gear.id}" style="background: rgba(0,0,0,0.4); border: 2px solid ${getRarityColor(gear.rarity)}; border-radius: 8px; padding: 10px; cursor: pointer; user-select: none;">
                    <div style="color: ${getRarityColor(gear.rarity)}; font-size: 14px; font-weight: bold;">${gear.name}</div>
                    <div style="color: #999; font-size: 11px;">${gear.description}</div>
                    <div style="margin-top: 5px;">
                      ${Object.entries(gear.stats).map(([stat, val]) => GEAR_ATTRIBUTES[stat] ? `
                        <span style="color: #90ee90; font-size: 11px; margin-right: 10px;">+${val} ${GEAR_ATTRIBUTES[stat].icon}</span>
                      ` : '').join('')}
                    </div>
                    <div style="color:#555;font-size:10px;margin-top:4px;">Tap to preview · Hold to equip</div>
                  </div>
                `).join('') || '<div style="color: #777; font-size: 12px; padding: 10px;">No available gear for this slot</div>'}
              </div>
            </div>
          </div>
        `;
      }
      
      content.innerHTML = html;

      // Attach fast-click (preview) + long-press (equip) to each inventory item
      content.querySelectorAll('.gear-inventory-item').forEach(function (el) {
        var slotKey = el.getAttribute('data-slot');
        var gearId  = el.getAttribute('data-gearid');
        var gear    = saveData.inventory.find(function (g) { return g.id === gearId; });
        if (!gear) return;
        var typeIcons = { weapon: '⚔️', armor: '🛡️', helmet: '⛑️', boots: '👢', ring: '💍', amulet: '📿' };
        attachPressHandler(
          el,
          function preview() {
            showItemInfoPanel(
              { name: gear.name, rarity: gear.rarity, icon: typeIcons[gear.type] || '📦', stats: gear.stats, description: gear.description },
              function () { equipGear(slotKey, gearId); },
              { equipLabel: '⚔️ Equip', hint: 'Long press item to equip directly.' }
            );
          },
          function action() { equipGear(slotKey, gearId); }
        );
      });
    }


    // Phase 1: Gear drop system - procedurally generate gear with rarity tiers
    function generateRandomGear() {
      // Rarity chances: common 50%, uncommon 25%, rare 15%, epic 8%, legendary 2%
      const rarityRoll = Math.random();
      let rarity;
      if (rarityRoll < 0.50) rarity = 'common';
      else if (rarityRoll < 0.75) rarity = 'uncommon';
      else if (rarityRoll < 0.90) rarity = 'rare';
      else if (rarityRoll < 0.98) rarity = 'epic';
      else rarity = 'legendary';
      
      // Gear tier restriction: before Prestige, cap at 'rare'
      if (!saveData.hasPrestiged && saveData.gearTierLimit === 'rare') {
        const tierOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        const limitIdx = tierOrder.indexOf(saveData.gearTierLimit);
        const rarityIdx = tierOrder.indexOf(rarity);
        if (rarityIdx > limitIdx) {
          rarity = saveData.gearTierLimit;
        }
      }
      
      // Choose random gear type from all 6 slots
      const types = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      // Base stats by rarity
      const rarityStatMult = {
        common: 1,
        uncommon: 1.5,
        rare: 2,
        epic: 3,
        legendary: 4
      };
      const mult = rarityStatMult[rarity];
      
      // Generate random stats (1-3 random attributes)
      const statCount = Math.floor(Math.random() * 3) + 1;
      const stats = {};
      const availableStats = Object.keys(GEAR_ATTRIBUTES);
      const chosenStats = [];
      
      for (let i = 0; i < statCount; i++) {
        const stat = availableStats[Math.floor(Math.random() * availableStats.length)];
        if (!chosenStats.includes(stat)) {
          chosenStats.push(stat);
          stats[stat] = Math.floor((Math.random() * 2 + 1) * mult);
        }
      }
      
      // Generate unique ID
      const id = `gear_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      // Generate name
      const prefixes = ['Worn', 'Simple', 'Fine', 'Superior', 'Masterwork', 'Legendary'];
      const typeNames = {
        weapon: ['Blade', 'Sword', 'Axe', 'Dagger', 'Mace'],
        armor: ['Vest', 'Plate', 'Mail', 'Cuirass', 'Armor'],
        helmet: ['Cap', 'Helm', 'Crown', 'Mask', 'Circlet'],
        boots: ['Boots', 'Shoes', 'Greaves', 'Treads', 'Steps'],
        ring: ['Ring', 'Band', 'Loop', 'Circle', 'Hoop'],
        amulet: ['Amulet', 'Pendant', 'Charm', 'Talisman', 'Necklace']
      };
      
      const prefix = prefixes[Math.min(Math.floor(mult), prefixes.length - 1)];
      const typeName = typeNames[type][Math.floor(Math.random() * typeNames[type].length)];
      const name = `${prefix} ${typeName}`;
      
      return {
        id,
        name,
        type,
        rarity,
        stats,
        description: `A ${rarity} ${type}`
      };
    }

    function calculateGearStats() {
      const stats = {};
      
      for (const statKey in GEAR_ATTRIBUTES) {
        stats[statKey] = 0;
      }
      
      // Sum up stats from all equipped gear
      for (const slotKey in saveData.equippedGear) {
        const gearId = saveData.equippedGear[slotKey];
        if (gearId) {
          const gear = saveData.inventory.find(g => g.id === gearId);
          if (gear && gear.stats) {
            for (const statKey in gear.stats) {
              stats[statKey] += gear.stats[statKey];
            }
          }
        }
      }
      
      return stats;
    }

    // ── Item Info / Preview Panel ─────────────────────────────────────────────
    // showItemInfoPanel(itemData, onEquip, opts)
    //   itemData : { name, rarity, icon, stats, description, requirements }
    //   onEquip  : callback called when user confirms equip (null = hide equip btn)
    //   opts     : { equipLabel, hint }
    function showItemInfoPanel(itemData, onEquip, opts) {
      opts = opts || {};
      // Remove any existing overlay
      var old = document.getElementById('item-info-overlay');
      if (old && old.parentNode) old.parentNode.removeChild(old);

      var rarityColor = (typeof getRarityColor === 'function' ? getRarityColor : function(r) { return '#ffffff'; })(itemData.rarity);

      var overlay = document.createElement('div');
      overlay.id = 'item-info-overlay';

      var panel = document.createElement('div');
      panel.id = 'item-info-panel';

      // Icon
      if (itemData.icon) {
        var iconDiv = document.createElement('div');
        iconDiv.className = 'iip-icon';
        iconDiv.textContent = itemData.icon;
        panel.appendChild(iconDiv);
      }

      // Name
      var nameDiv = document.createElement('div');
      nameDiv.className = 'iip-name';
      nameDiv.style.color = rarityColor;
      nameDiv.textContent = itemData.name || '';
      panel.appendChild(nameDiv);

      // Rarity
      if (itemData.rarity) {
        var rarDiv = document.createElement('div');
        rarDiv.className = 'iip-rarity rarity-' + itemData.rarity;
        rarDiv.textContent = itemData.rarity;
        panel.appendChild(rarDiv);
      }

      // Description
      if (itemData.description) {
        var descDiv = document.createElement('div');
        descDiv.className = 'iip-desc';
        descDiv.textContent = itemData.description;
        panel.appendChild(descDiv);
      }

      // Stats
      if (itemData.stats && Object.keys(itemData.stats).length > 0) {
        var statsDiv = document.createElement('div');
        statsDiv.className = 'iip-stats';
        for (var s in itemData.stats) {
          var attr = (typeof GEAR_ATTRIBUTES !== 'undefined' && GEAR_ATTRIBUTES[s]) ? GEAR_ATTRIBUTES[s] : null;
          var label = attr ? (attr.icon + ' ' + attr.name) : s;
          var row = document.createElement('div');
          row.className = 'iip-stat-row';
          row.innerHTML = '<span>' + label + '</span><span>+' + itemData.stats[s] + '</span>';
          statsDiv.appendChild(row);
        }
        panel.appendChild(statsDiv);
      }

      // Requirements
      if (itemData.requirements) {
        var reqDiv = document.createElement('div');
        reqDiv.className = 'iip-desc';
        reqDiv.style.color = '#F39C12';
        reqDiv.textContent = itemData.requirements;
        panel.appendChild(reqDiv);
      }

      // Action buttons
      var actions = document.createElement('div');
      actions.className = 'iip-actions';

      if (typeof onEquip === 'function') {
        var equipBtn = document.createElement('button');
        equipBtn.className = 'iip-btn-equip';
        equipBtn.textContent = opts.equipLabel || '⚔️ Equip';
        equipBtn.addEventListener('click', function () {
          closePanel();
          onEquip();
        });
        actions.appendChild(equipBtn);
      }

      var closeBtn = document.createElement('button');
      closeBtn.className = 'iip-btn-close';
      closeBtn.textContent = '✕ Close';
      closeBtn.addEventListener('click', closePanel);
      actions.appendChild(closeBtn);
      panel.appendChild(actions);

      // Hint
      if (opts.hint !== false) {
        var hint = document.createElement('div');
        hint.className = 'iip-hint';
        hint.textContent = opts.hint || (typeof onEquip === 'function' ? 'Tap Equip or long-press item to equip.' : '');
        panel.appendChild(hint);
      }

      overlay.appendChild(panel);
      // Tap outside to close
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closePanel(); });
      document.body.appendChild(overlay);

      function closePanel() {
        var el = document.getElementById('item-info-overlay');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    }
    window.showItemInfoPanel = showItemInfoPanel;

    // ── Long-press / double-tap helper ────────────────────────────────────────
    // Attaches fast-click (preview) + long-press & double-tap (action) to an element.
    // onPreview() called on fast single click
    // onAction() called on long-press (>400ms) or double-tap (<400ms gap)
    function attachPressHandler(el, onPreview, onAction) {
      var LONG_MS = 400;
      var DOUBLE_TAP_MS = 400;
      var pressTimer = null;
      var lastTap = 0;
      var fired = false;

      function startPress(e) {
        fired = false;
        pressTimer = setTimeout(function () {
          fired = true;
          onAction();
        }, LONG_MS);
      }
      function endPress(e) {
        clearTimeout(pressTimer);
        if (fired) return;
        // Double-tap detection
        var now = Date.now();
        if (now - lastTap < DOUBLE_TAP_MS) {
          lastTap = 0;
          onAction();
        } else {
          lastTap = now;
          onPreview();
        }
      }
      function cancelPress() { clearTimeout(pressTimer); }

      el.addEventListener('mousedown', startPress);
      el.addEventListener('mouseup', endPress);
      el.addEventListener('mouseleave', cancelPress);
      el.addEventListener('touchstart', startPress, { passive: true });
      el.addEventListener('touchend', endPress);
      el.addEventListener('touchcancel', cancelPress);
    }
    window.attachPressHandler = attachPressHandler;

    function equipGear(slotKey, gearId) {
      saveData.equippedGear[slotKey] = gearId;
      playSound('coin');
      saveSaveData();
      // Recalculate stats if the function exists
      if (typeof window.recalculateAllStats === 'function') window.recalculateAllStats();
      updateGearScreen();
      
      // Quest progression: first time equipping gear (legacy)
      if (saveData.storyQuests.currentQuest === 'equipGear') {
        progressQuest('equipGear', true);
      }
      // Quest 4: Equip the Cigar
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest4_equipCigar') {
        progressTutorialQuest('quest4_equipCigar', true);
      }
      // Quest 6: Equip the Cigarr from armory → advance quest chain to quest7
      if (saveData.tutorialQuests && gearId === 'cigarr_quest' &&
          saveData.tutorialQuests.currentQuest === 'quest6_stonehengeChest') {
        progressTutorialQuest('quest6_stonehengeChest', true);
      }
    }

    function unequipGear(slotKey) {
      saveData.equippedGear[slotKey] = null;
      playSound('waterdrop');
      saveSaveData();
      updateGearScreen();
    }

    // Expose to global scope for onclick handlers
    window.equipGear = equipGear;
    window.unequipGear = unequipGear;

    // ── Crimson Eclipse Core grant helper ──────────────────────────────────────
    // Call window.grantCrimsonEclipseCore(qty) from minigame rewards or boss drops.
    window.grantCrimsonEclipseCore = function(qty) {
      qty = Math.floor(Number(qty));
      if (!isFinite(qty) || qty <= 0) qty = 1;
      if (!saveData.consumables) saveData.consumables = [];
      const existing = saveData.consumables.find(function(c) { return c.id === 'crimsonEclipseCore'; });
      if (existing) {
        const currentQuantity = Math.floor(Number(existing.quantity));
        existing.quantity = (isFinite(currentQuantity) && currentQuantity >= 0 ? currentQuantity : 0) + qty;
      } else {
        saveData.consumables.push({
          id:          'crimsonEclipseCore',
          name:        'Crimson Eclipse Core',
          rarity:      'mythic',
          quantity:    qty,
          icon:        '🔴',
          description: 'A volatile orb torn from the dying heart of a void star. Pulsates with dangerous crimson energy.',
          lore:        '"The Annunaki called it the Zar\'ul Stone — the eye of a slain god. Its consumption guarantees power, and promises ruin." — Fragment of the Ninth Codex',
          stats:       { effect: 'Queues a Blood Moon at Wave 10 of your next run' },
          consumable:  true
        });
        // First-time AIDA cinematic dialogue
        if (!saveData.hasSeenCrimsonCoreDialogue) {
          saveData.hasSeenCrimsonCoreDialogue = true;
          setTimeout(function() {
            if (window.showCrimsonCoreDialogue) window.showCrimsonCoreDialogue();
          }, 800);
        }
      }
      saveSaveData();
    };

    // Upgrade definitions for the progression shop
    const PERMANENT_UPGRADES = {
      maxHp: {
        name: 'Max HP',
        description: '+25 HP per level',
        maxLevel: 30,
        baseCost: 150,
        costIncrease: 75,
        effect: (level) => 25 * level
      },
      hpRegen: {
        name: 'HP Regen',
        description: '+0.5 HP/sec per level',
        maxLevel: 15,
        baseCost: 250,
        costIncrease: 100,
        effect: (level) => 0.5 * level
      },
      moveSpeed: {
        name: 'Move Speed',
        description: '+5% per level',
        maxLevel: 15,
        baseCost: 200,
        costIncrease: 75,
        effect: (level) => 0.05 * level
      },
      attackDamage: {
        name: 'Attack Damage',
        description: '+10% per level',
        maxLevel: 25,
        baseCost: 250,
        costIncrease: 100,
        effect: (level) => 0.1 * level
      },
      attackSpeed: {
        name: 'Attack Speed',
        description: '+5% per level',
        maxLevel: 15,
        baseCost: 250,
        costIncrease: 100,
        effect: (level) => 0.05 * level
      },
      critChance: {
        name: 'Crit Chance',
        description: '+2% per level',
        maxLevel: 15,
        baseCost: 350,
        costIncrease: 100,
        effect: (level) => 0.02 * level
      },
      critDamage: {
        name: 'Crit Damage',
        description: '+10% per level',
        maxLevel: 15,
        baseCost: 350,
        costIncrease: 100,
        effect: (level) => 0.1 * level
      },
      armor: {
        name: 'Armor',
        description: '+3% per level',
        maxLevel: 20,
        baseCost: 250,
        costIncrease: 100,
        effect: (level) => 3 * level
      },
      cooldownReduction: {
        name: 'Cooldown Reduction',
        description: '-3% per level',
        maxLevel: 15,
        baseCost: 400,
        costIncrease: 100,
        effect: (level) => 0.03 * level
      },
      goldEarned: {
        name: 'Gold Earned',
        description: '+10% per level',
        maxLevel: 15,
        baseCost: 500,
        costIncrease: 150,
        effect: (level) => 0.1 * level
      },
      expEarned: {
        name: 'EXP Earned',
        description: '+10% per level',
        maxLevel: 15,
        baseCost: 450,
        costIncrease: 150,
        effect: (level) => 0.1 * level
      },
      maxWeapons: {
        name: 'Max Weapons',
        description: '+1 weapon slot',
        maxLevel: 3,
        baseCost: 800,
        costIncrease: 600,
        effect: (level) => level
      }
    };

    function getCost(upgradeKey) {
      const upgrade = PERMANENT_UPGRADES[upgradeKey];
      const currentLevel = saveData.upgrades[upgradeKey];
      return upgrade.baseCost + (currentLevel * upgrade.costIncrease);
    }
    
