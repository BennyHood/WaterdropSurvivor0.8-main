// js/game-over-reset.js — Game-over screen (death screen), reset game state, debug stats toggle.
// Depends on: all previously loaded game files

    // Module-level flag: was a landmark quest active when the player last died?
    // Captured by gameOver() and consumed by resetGame() to set the correct day/night
    // start time. Declared here (not inside gameOver) so resetGame() can read it even
    // on the very first run when gameOver() has never been called.
    let _landmarkQuestWasActive = false;
    let _gameOverTransitionLocked = false;

    function gameOver() {
      if (_gameOverTransitionLocked || (typeof isGameOver !== 'undefined' && isGameOver) || window.isGameOver) return;
      _gameOverTransitionLocked = true;
      setGameOver(true);
      setGamePaused(true);
      setGameActive(false);
      // Hide combat HUD (Rage Bar + Special Attacks) on death/game over
      if (window.GameRageCombat) window.GameRageCombat.setCombatHUDVisible(false);
      // Close farmer speech bubble if open
      const farmerBubble = document.getElementById('farmer-speech-bubble');
      if (farmerBubble) farmerBubble.style.display = 'none';
      // Close any open modals and quest UIs
      ['levelup-modal','settings-modal','stats-modal','comic-tutorial-modal','story-quest-modal',
       'windmill-quest-ui','montana-quest-ui','eiffel-quest-ui'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      // Show "YOU DIED" banner for 3 seconds
      showYouDiedBanner(3000);
      // Push to super stat bar
      if (window.pushSuperStatEvent) window.pushSuperStatEvent('YOU DIED!', 'death', '\uD83D\uDC80', 'death');

      // Capture active landmark-quest state BEFORE resetting it so the day/night
      // starting time can be set correctly after the reset loop below.
      // Writes to the module-level _landmarkQuestWasActive so resetGame() can read it.
      // ── QUEST NULL ERROR FIX: Use optional chaining ──
      _landmarkQuestWasActive = (window.montanaQuest?.active) ||
                                (window.eiffelQuest?.active);

      // Reset all landmark quests on game over so each new run starts fresh.
      // This covers quests that were active, completed, or in a failed/cooldown state.
      if (window.windmillQuest) {
        windmillQuest.active = false;
        windmillQuest.failed = false;
        windmillQuest.hasCompleted = false;
        windmillQuest.rewardGiven = false;
        windmillQuest.rewardReady = false;
        windmillQuest.failedCooldown = false;
        windmillQuest.dialogueOpen = false;
        windmillQuest.timer = 0;
      }
      if (window.montanaQuest) {
        montanaQuest.active = false;
        montanaQuest.hasCompleted = false;
        montanaQuest.kills = 0;
        montanaQuest.timer = 0;
      }
      if (window.eiffelQuest) {
        eiffelQuest.active = false;
        eiffelQuest.hasCompleted = false;
        eiffelQuest.kills = 0;
        eiffelQuest.timer = 0;
      }
      // Reset pause counter
      pauseOverlayCount = 0;
      isPaused = false;
      window.isPaused = false;
      if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
      levelUpPending = false;
      // Close farmer dialogue if open when game ends to prevent UI malfunction
      if (window.windmillQuest?.dialogueOpen) {
        hideFarmerDialogue();
      }
      
      stopDroneHum(); // Stop drone sound
      
      // Calculate run stats
      const survivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
      const goldEarned = playerStats.gold - runStartGold;
      if (typeof playSound === 'function') {
        try { playSound('death'); } catch (e) { /* ignore */ }
      }
      
      // Track items gained this run (initialize if not present)
      if (!window.runLootGained) window.runLootGained = [];
      
      // Update save data
      saveData.totalRuns++;
      saveData.totalKills += playerStats.kills; // Track cumulative kills
      if (survivalTime > saveData.bestTime) saveData.bestTime = survivalTime;
      if (playerStats.kills > saveData.bestKills) saveData.bestKills = playerStats.kills;
      
      // ── Prism Reliquary: unlock after surviving 10 minutes (600s cumulative best) ──
      if (saveData.bestTime >= 600 &&
          saveData.campBuildings &&
          saveData.campBuildings.prismReliquary &&
          !saveData.campBuildings.prismReliquary.unlocked) {
        saveData.campBuildings.prismReliquary.unlocked = true;
        // Notify player when they reach camp
        window._prismReliquaryNewlyUnlocked = true;
      }
      // Run completion bonus XP (kills XP was already granted per-kill via addAccountXP)
      addAccountXP(25);
      
      // Tutorial Quest: Check for first death
      if (!saveData.tutorialQuests) {
        saveData.tutorialQuests = {
          currentQuest: null,
          completedQuests: [],
          questProgress: {},
          readyToClaim: [],
          firstDeathShown: false,
          secondRunCompleted: false,
          killsThisRun: 0,
          survivalTimeThisRun: 0,
          stonenhengeChestFound: false
        };
      }
      
      if (!saveData.tutorialQuests.firstDeathShown) {
        saveData.tutorialQuests.firstDeathShown = true;
        // Auto-claim firstRunDeath so quest1 conditions are satisfied when player enters main building
        if (!saveData.tutorialQuests.completedQuests.includes('firstRunDeath')) {
          saveData.tutorialQuests.completedQuests.push('firstRunDeath');
        }
        saveSaveData();
        // Show "A.I.D.A transfers from robot to head" dialogue on first death
        setTimeout(() => {
          window.DialogueSystem?.show(window.DialogueSystem?.DIALOGUES?.aidaChipInstalled);
        }, 1800);
        setTimeout(() => {
          showComicTutorial('first_death');
        }, 1000);
      }
      
      // Tutorial: Check for quest completion on death
      const currentQuest = getCurrentQuest();
      if (currentQuest && currentQuest.triggerOnDeath) {
        // === New slow-burn quest chain ===
        // Step 2: Daily Routine — Survive 2 minutes
        if (currentQuest.id === 'quest_dailyRoutine' && survivalTime >= 120) {
          progressTutorialQuest('quest_dailyRoutine', true);
        }
        // Step 3: The Harvester — Reach Level 3 in a single run
        if (currentQuest.id === 'quest_harvester' && playerStats.lvl >= 3) {
          progressTutorialQuest('quest_harvester', true);
        }
        // Step 4: First Blood — Have 30 Wood and 30 Stone gathered across runs
        if (currentQuest.id === 'quest_firstBlood') {
          if (!saveData.resources) saveData.resources = {};
          const r = saveData.resources;
          if ((r.wood || 0) >= 30 && (r.stone || 0) >= 30) {
            progressTutorialQuest('quest_firstBlood', true);
          }
        }
        // Step 5: Gaining Stats — 300 total kills
        if (currentQuest.id === 'quest_gainingStats' && (saveData.totalKills || 0) >= 300) {
          progressTutorialQuest('quest_gainingStats', true);
        }
        // Step 6: The Egg Hunt — Reach Level 10 + defeat The Grey boss
        if (currentQuest.id === 'quest_eggHunt' && playerStats.lvl >= 10 && saveData.tutorialQuests.mysteriousEggFound) {
          progressTutorialQuest('quest_eggHunt', true);
        }
        // Step 7: A New Friend — auto-completes on return to camp (handled below)
        // Step 8: Pushing the Limits — Defeat boss (wave 10+)
        if (currentQuest.id === 'quest_pushingLimits' && saveData.tutorialQuests.firstBossDefeated) {
          progressTutorialQuest('quest_pushingLimits', true);
        }
        // Artifact Shrine arc: quest_shrineCalibrate = survive 3 minutes in one run
        if (currentQuest.id === 'quest_shrineCalibrate' && survivalTime >= 180) {
          progressTutorialQuest('quest_shrineCalibrate', true);
        }

        // === Legacy quest checks (backward compatibility) ===
        if (currentQuest.id === 'quest4_kill10' && saveData.tutorialQuests.killsThisRun >= 10) {
          progressTutorialQuest('quest4_kill10', true);
        }
        if (currentQuest.id === 'quest6_survive2min' && survivalTime >= 120) {
          progressTutorialQuest('quest6_survive2min', true);
        }
        if (currentQuest.id === 'quest8_kill10' && saveData.tutorialQuests.killsThisRun >= 10) {
          progressTutorialQuest('quest8_kill10', true);
        }
        if (currentQuest.id === 'quest10_kill15' && saveData.tutorialQuests.killsThisRun >= 15) {
          progressTutorialQuest('quest10_kill15', true);
        }
        if (currentQuest.id === 'quest14_kill25' && saveData.tutorialQuests.killsThisRun >= 25) {
          progressTutorialQuest('quest14_kill25', true);
        }
        if (currentQuest.id === 'quest26_kill20' && saveData.tutorialQuests.killsThisRun >= 20) {
          progressTutorialQuest('quest26_kill20', true);
        }
        if (currentQuest.id === 'quest28_survive3min' && survivalTime >= 180) {
          progressTutorialQuest('quest28_survive3min', true);
        }
        if (currentQuest.id === 'quest15b_runKill12' && saveData.tutorialQuests.killsThisRun >= 12) {
          progressTutorialQuest('quest15b_runKill12', true);
        }
        // Annunaki arc: quest_annunaki1 = 100 kills in one run
        if (currentQuest.id === 'quest_annunaki1' && saveData.tutorialQuests.killsThisRun >= 100) {
          progressTutorialQuest('quest_annunaki1', true);
        }
        // Annunaki arc: quest_annunaki3 = reach level 50 in one run
        if (currentQuest.id === 'quest_annunaki3' && playerStats.lvl >= 50) {
          progressTutorialQuest('quest_annunaki3', true);
        }
        if (currentQuest.id === 'quest19b_growJuvenile' && survivalTime >= 60) {
          progressTutorialQuest('quest19b_growJuvenile', true);
        }
        if (currentQuest.id === 'quest19c_growAdult' && saveData.tutorialQuests.killsThisRun >= 8) {
          progressTutorialQuest('quest19c_growAdult', true);
        }
      }
      
      // Auto-complete quest_newFriend when returning to camp with the egg
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest_newFriend' && isQuestClaimed('quest_eggHunt')) {
        progressTutorialQuest('quest_newFriend', true);
      }
      
      // Legacy quest 3 (new chain): Reach Level 5
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3_reachLevel5' && playerStats.lvl >= 5) {
        if (!saveData.tutorialQuests.readyToClaim.includes('quest3_reachLevel5')) {
          saveData.tutorialQuests.readyToClaim.push('quest3_reachLevel5');
        }
      }
      
      // Mark second run completed (for achievements unlock)
      if (saveData.totalRuns >= 2) {
        saveData.tutorialQuests.secondRunCompleted = true;
      }

      // Neural Matrix: apply AIDA gold drain if path is infected, then save
      if (window.NeuralMatrix) window.NeuralMatrix.onRunEnd();

      saveSaveData();

      // Build run-end stats for the new dopamine screen
      const _runStats = window.currentRunStats || {};
      const _activeQuest = (typeof getCurrentQuest === 'function') ? getCurrentQuest() : null;
      const _questCompleted = _activeQuest && saveData.tutorialQuests &&
        ((saveData.tutorialQuests.readyToClaim || []).includes(_activeQuest.id) ||
         (saveData.tutorialQuests.completedQuests || []).includes(_activeQuest.id));

      // Store gold earned for loot display
      window._resGoldEarned = goldEarned;
      // Store stats on window so RunEndScreen helpers can access them
      window._resCurrentStats = {
        kills:        playerStats.kills,
        eliteKills:   _runStats.eliteKills  || playerStats.miniBossesDefeated || 0,
        bossKills:    _runStats.bossKills   || 0,
        timeSurvived: survivalTime,
        maxCombo:     window._runMaxCombo   || 0,
        xpAccumulated: _runStats.xpAccumulated || 0,
        questCompleted: !!_questCompleted,
        questActive:   !!_activeQuest,
        questName:     _activeQuest ? (_activeQuest.title || _activeQuest.id || '') : ''
      };

      // Ensure only one end-screen overlay exists.
      const staleResOverlay = document.getElementById('res-overlay');
      if (staleResOverlay && staleResOverlay.parentNode) staleResOverlay.parentNode.removeChild(staleResOverlay);

      // Use new dopamine end screen if available, fall back to legacy
      if (window.RunEndScreen) {
        // Hide the YOU DIED banner
        const youDiedBanner = document.getElementById('you-died-banner');
        if (youDiedBanner) youDiedBanner.style.display = 'none';
        if (typeof window.RunEndScreen.hide === 'function') window.RunEndScreen.hide();
        window.RunEndScreen.show(window._resCurrentStats);
        updateGoldDisplays();
      } else {
        // ── Legacy fallback gameover screen ──────────────────────────────────
        document.getElementById('gameover-screen').style.display = 'flex';
        const youDiedBanner = document.getElementById('you-died-banner');
        if (youDiedBanner) youDiedBanner.style.display = 'none';
        const isFirstRun = saveData.totalRuns === 1;
        document.getElementById('restart-btn').style.display = isFirstRun ? 'none' : '';
        document.getElementById('quit-to-menu-btn').style.display = isFirstRun ? 'none' : '';
        document.getElementById('goto-camp-btn').style.display = '';
        document.getElementById('final-score').innerText = `${survivalTime}s`;
        document.getElementById('final-kills').innerText = `${playerStats.kills}`;
        document.getElementById('final-level').innerText = `${playerStats.lvl}`;
        document.getElementById('gold-earned').innerText = `${goldEarned}`;
        document.getElementById('total-gold').innerText = `${saveData.gold}`;
        const lootItemsDiv = document.getElementById('loot-items');
        if (window.runLootGained && window.runLootGained.length > 0) {
          lootItemsDiv.innerHTML = window.runLootGained.map(item => {
            const rarityColors = {
              Common: '#AAA', Uncommon: '#1EFF00', Rare: '#0070DD',
              Epic: '#A335EE', Legendary: '#FF8000', Mythic: '#E6CC80'
            };
            const color = rarityColors[item.rarity] || '#FFF';
            return `<p style="margin: 5px 0; color: ${color};">• ${item.name} (${item.rarity})</p>`;
          }).join('');
        } else {
          lootItemsDiv.innerHTML = '<p style="margin: 5px 0;">No items gained this run</p>';
        }
        updateGoldDisplays();
      }
      
      // Show deferred mission notification after death (quest completed during run)
      if (saveData.tutorialQuests && saveData.tutorialQuests.pendingMissionNotification === 'quest1_kill3') {
        saveData.tutorialQuests.pendingMissionNotification = null;
        saveSaveData();
        setTimeout(() => {
          showComicInfoBox(
            '📋 MISSION REPORT',
            `<div style="text-align: left; padding: 10px;">
              <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">✅ 3 KILLS CONFIRMED!</p>
              <p style="line-height: 1.8; margin-bottom: 10px;">
                Excellent work, Droplet! You've eliminated 3 enemies.<br><br>
                <b>CURRENT MISSION:</b> Build your strength between runs. Use camp resources to upgrade your abilities and become unstoppable.<br><br>
                Return to the <b>⛺ Main Building</b> to claim your reward.
              </p>
              <p style="font-size: 13px; color: #FFD700;">💡 Tip: Head to Camp → Main Building to claim your reward.</p>
            </div>`,
            'UNDERSTOOD!'
          );
        }, 1500);
      }
    }

    function resetGame() {
      stopDroneHum(); // Stop drone sound on reset

      // Reset joystick state to prevent "stuck joystick" after camp/game-over
      if (typeof joystickLeft !== 'undefined') {
        joystickLeft.active = false;
        joystickLeft.x = 0;
        joystickLeft.y = 0;
        joystickLeft.id = null;
      }
      if (typeof joystickRight !== 'undefined') {
        joystickRight.active = false;
        joystickRight.x = 0;
        joystickRight.y = 0;
        joystickRight.id = null;
      }
      
      // Reset weapons to default state for each run (roguelite: all run upgrades are temporary)
      Object.assign(weapons, getDefaultWeapons());
      
      // Reset run loot tracking
      window.runLootGained = [];
      if (window.BloodV2 && typeof window.BloodV2.setParticleEffects === 'function') {
        const effectsEnabled = !window.gameSettings || window.gameSettings.particleEffects !== false;
        window.BloodV2.setParticleEffects(effectsEnabled);
      }
      
      // Time system: start at 18:00 (Evening) when a landmark quest was active
      // on the previous run, otherwise default to 06:00 (Morning).
      saveData.runCount = (saveData.runCount || 0) + 1;
      const startHour = _landmarkQuestWasActive ? 18 : 6;

      // Convert hour (0-23) to timeOfDay (0-1)
      // 0 = midnight, 6 = dawn, 12 = noon, 18 = dusk
      dayNightCycle.timeOfDay = startHour / 24;
      
      saveSaveData(); // Save the updated hour
      
      // Apply permanent upgrades from save data
      const baseHp = 100 + PERMANENT_UPGRADES.maxHp.effect(saveData.upgrades.maxHp);
      const baseRegen = PERMANENT_UPGRADES.hpRegen.effect(saveData.upgrades.hpRegen);
      const baseSpeed = 25 * (1 + PERMANENT_UPGRADES.moveSpeed.effect(saveData.upgrades.moveSpeed));
      const baseDamage = 1 + PERMANENT_UPGRADES.attackDamage.effect(saveData.upgrades.attackDamage);
      const baseAtkSpeed = 1 + PERMANENT_UPGRADES.attackSpeed.effect(saveData.upgrades.attackSpeed);
      const baseCritChance = 0.1 + PERMANENT_UPGRADES.critChance.effect(saveData.upgrades.critChance);
      const baseCritDmg = 1.5 + PERMANENT_UPGRADES.critDamage.effect(saveData.upgrades.critDamage);
      const baseArmor = PERMANENT_UPGRADES.armor.effect(saveData.upgrades.armor);
      const cdReduction = PERMANENT_UPGRADES.cooldownReduction.effect(saveData.upgrades.cooldownReduction);
      
      // Apply passive skill bonuses
      const passiveSkills = saveData.passiveSkills || {};
      const passiveHpBonus = (passiveSkills.hp_boost || 0) * 10;
      const passiveDmgBonus = (passiveSkills.dmg_boost || 0) * 0.05;
      const passiveRegenBonus = (passiveSkills.regen_boost || 0) * 0.5;
      const passiveSpeedBonus = (passiveSkills.speed_boost || 0) * 0.05;
      
      // Apply attribute bonuses from achievement system
      const dexterity = saveData.attributes.dexterity || 0;
      const strength = saveData.attributes.strength || 0;
      const vitality = saveData.attributes.vitality || 0;
      const luck = saveData.attributes.luck || 0;
      const wisdom = saveData.attributes.wisdom || 0;
      
      // Training hall attributes (new system)
      const trainingStrength = saveData.attributes.strength || 0; // Already included
      const trainingEndurance = saveData.attributes.endurance || 0;
      const trainingFlexibility = saveData.attributes.flexibility || 0;
      
      const attrHp = vitality * ATTRIBUTE_INFO.vitality.effects.maxHp;
      const attrRegen = vitality * ATTRIBUTE_INFO.vitality.effects.hpRegen;
      const attrAtkSpeed = dexterity * ATTRIBUTE_INFO.dexterity.effects.attackSpeed;
      const attrCritChance = dexterity * ATTRIBUTE_INFO.dexterity.effects.critChance;
      const attrDamage = strength * ATTRIBUTE_INFO.strength.effects.damage;
      const attrCritDmg = luck * ATTRIBUTE_INFO.luck.effects.critDamage;
      const attrCdReduction = wisdom * ATTRIBUTE_INFO.wisdom.effects.cooldownReduction;
      
      // Training hall bonuses
      // Endurance: Increases stamina and high-speed duration (implemented as +2% move speed per point)
      const enduranceMoveSpeed = trainingEndurance * 0.02;
      // Flexibility: Improves turn speed and dodge responsiveness (implemented as +2 flat armor per point)
      const flexibilityArmor = trainingFlexibility * 2;
      
      // Apply gear bonuses
      const gearStats = calculateGearStats();
      // Gear provides small, balanced bonuses (each point gives +1-2% depending on stat)
      const gearFlexibilityBonus = gearStats.flexibility * 0.01;  // +1% armor per point
      const gearMoveSpeedBonus = gearStats.movementSpeed * 0.02;  // +2% speed per point
      const gearAtkSpeedBonus = gearStats.attackSpeed * 0.02;     // +2% attack speed per point
      const gearPrecisionBonus = gearStats.attackPrecision * 0.01; // +1% crit chance per point
      const gearCritBonus = gearStats.critChance * 0.02;          // +2% crit chance per point
      const gearMagicBonus = gearStats.elementalMagic * 0.03;     // +3% damage per point
      
      // Reset Stats with permanent upgrades, attributes, and gear applied
      playerStats.lvl = 1;
      playerStats.exp = 0;
      playerStats.expReq = GAME_CONFIG.baseExpReq;
      playerStats.hp = baseHp + attrHp + passiveHpBonus;
      playerStats.maxHp = baseHp + attrHp + passiveHpBonus;
      
      // Apply legendary cigar bonus if unlocked
      const cigarBonus = (saveData.extendedQuests && saveData.extendedQuests.legendaryCigar && saveData.extendedQuests.legendaryCigar.completed) ? 1.5 : 1.0;
      playerStats.strength = baseDamage * (1 + attrDamage + gearMagicBonus + passiveDmgBonus) * cigarBonus;
      
      playerStats.walkSpeed = baseSpeed * (1 + gearMoveSpeedBonus + enduranceMoveSpeed + passiveSpeedBonus);
      playerStats.kills = 0;
      playerStats.miniBossesDefeated = 0; // Reset mini-boss tracking
      playerStats.atkSpeed = baseAtkSpeed * (1 + attrAtkSpeed + gearAtkSpeedBonus);
      playerStats.critChance = baseCritChance + attrCritChance + gearPrecisionBonus + gearCritBonus;
      playerStats.critDmg = baseCritDmg + attrCritDmg;
      playerStats.armor = baseArmor + gearStats.flexibility + flexibilityArmor; // Flexibility gives flat armor bonus
      playerStats.hpRegen = baseRegen + attrRegen + passiveRegenBonus;
      playerStats.gold = 0;

      // --- CORE ACCOUNT ATTRIBUTES (Might/Swiftness/Agility/etc.) ---
      if (saveData.account && window.GameAccount) {
        const coreAttrs = saveData.account.coreAttributes || {};
        const lvlBonuses = saveData.account.levelStatBonuses || {};
        const ABP = window.GameAccount.ATTR_BONUS_PER_POINT || 0.002;
        const mightBonus    = (coreAttrs.might     || 0) * ABP;
        const swiftnessBonus= (coreAttrs.swiftness || 0) * ABP;
        const agilityBonus  = (coreAttrs.agility   || 0) * ABP;
        const fortitudeBonus= (coreAttrs.fortitude || 0) * ABP;
        const lethalityBonus= (coreAttrs.lethality || 0) * ABP;
        playerStats.damage      = (playerStats.damage      || 1)    * (1 + mightBonus    + (lvlBonuses.damage     || 0));
        playerStats.atkSpeed    = (playerStats.atkSpeed    || 1)    * (1 + swiftnessBonus + (lvlBonuses.atkSpeed   || 0));
        playerStats.walkSpeed   = (playerStats.walkSpeed   || 25)   * (1 + agilityBonus   + (lvlBonuses.walkSpeed  || 0));
        playerStats.armor      += fortitudeBonus * 100; // fortitude adds flat armor percentage points (armor is 0-100 scale)
        playerStats.critChance  = Math.min(0.95, (playerStats.critChance || 0.1) + lethalityBonus + (lvlBonuses.critChance || 0));
        playerStats.maxHp       = (playerStats.maxHp       || 100)  * (1 + (lvlBonuses.maxHp      || 0));
        playerStats.hp          = playerStats.maxHp;
        playerStats.hpRegen    += lvlBonuses.hpRegen || 0;
        playerStats.lifeStealPercent = Math.min(0.5, (playerStats.lifeStealPercent || 0) + (lvlBonuses.lifeStealPercent || 0));
        playerStats.pickupRange     = (playerStats.pickupRange || 1.0)  * (1 + (lvlBonuses.pickupRange || 0));
        playerStats.dropRate        = (playerStats.dropRate   || 1.0)  * (1 + (lvlBonuses.dropRate    || 0));
      }

      // ── AIDA Dark Pact: permanent max-HP reduction ─────────────────────────
      const _aidaHpMult = (saveData.aidaDarkPacts && saveData.aidaDarkPacts.hpReduction != null)
        ? saveData.aidaDarkPacts.hpReduction : 1.0;
      if (_aidaHpMult < 1.0) {
        playerStats.maxHp = Math.max(10, Math.round(playerStats.maxHp * _aidaHpMult));
        playerStats.hp    = playerStats.maxHp;
      }

      // --- NEW STATS: connected to camp upgrades and attributes ---
      // dashPower: how far/fast dash goes — scales with strength (physical power) and endurance
      playerStats.dashPower = 1.0 + (strength * 0.04) + (trainingEndurance * 0.03);
      // autoAimAccuracy: 0=always miss, 1=perfect aim — starts low, improves with dexterity
      playerStats.autoAimAccuracy = Math.min(1.0, 0.30 + dexterity * 0.08 + (saveData.upgrades.attackSpeed || 0) * 0.02);
      // turnResponse/stopResponse: how quickly player pivots — scales with flexibility (agility)
      playerStats.turnResponse  = 1.0 + trainingFlexibility * 0.05 + dexterity * 0.02;
      playerStats.stopResponse  = 1.0 + trainingFlexibility * 0.05 + dexterity * 0.02;
      // manualAimAccuracy: similar to autoAim but for manual aiming — scales differently
      playerStats.manualAimAccuracy = Math.min(1.0, 0.60 + dexterity * 0.04 + trainingFlexibility * 0.02);
      // ── Waterdrop RPG Stats (reset each run) ─────────────────────────────────
      playerStats.surfaceTension  = 0;    // Flat damage reduction per hit
      playerStats.boilingPoint    = 0;    // Low-HP fury stacks (speed + fire rate)
      playerStats.viscosity       = 0;    // Knockback weight multiplier bonus
      playerStats.capillaryAction = 0;    // EXP/gold pickup range bonus stacks
      waveCount = 0;
      lastWaveEndTime = 0; // Reset wave timing
      _firstEnemyTutorialShown = false; // Reset first-enemy tutorial for each run
      miniBossesSpawned.clear(); // Reset mini-boss tracking
      gameStartTime = Date.now();
      runStartGold = saveData.gold;
      // Initialize per-run stats for end-of-run screen
      window.currentRunStats = {
        normalKills: 0, eliteKills: 0, bossKills: 0,
        xpFromKills: 0, xpAccumulated: 0,
        startAccountLevel: (window.saveData && window.saveData.accountLevel) || 1,
        startAccountXP:    (window.saveData && window.saveData.accountXP)    || 0
      };
      window._runMaxCombo = 0;
      _alienScoutSpawned  = false; // Reset alien spawn flags for new run
      _annunakiOrbSpawned = false;

      // Reset Waterdrop story quest state for this run
      if (window.resetLakeBounceQuest) window.resetLakeBounceQuest();
      
      // Reset tutorial quest progress for this run
      if (saveData.tutorialQuests) {
        saveData.tutorialQuests.killsThisRun = 0;
        saveData.tutorialQuests.survivalTimeThisRun = 0;
      }
      
      // Reset mysterious egg spawning flag for new run
      window._mysteriousEggSpawned = false;
      window._mysteriousEggObject = null;

      // Reset Annunaki endgame event flags for new run
      window._annunakiEventActive = false;
      window._annunakiWavesStopped = false;
      window._annunakiBoss = null;
      
      // Reset exp pickup combo for new run
      if (window.GameAudio && window.GameAudio.resetExpCombo) {
        window.GameAudio.resetExpCombo();
      }

      // Restore lighting to default in case Annunaki event changed it
      if (window.ambientLight) window.ambientLight.color.setRGB(1, 1, 1);
      if (window.dirLight)     window.dirLight.color.setRGB(1, 1, 1);
      
      // Reset player invulnerability state
      if (player) {
        player.invulnerable = false;
        player.invulnerabilityTime = 0;
      }
      
      const totalCdReduction = cdReduction + attrCdReduction;
      const gunCooldown = 1000 * (1 - totalCdReduction);
      weapons.gun = { active: true, level: 1, damage: 15, cooldown: gunCooldown, lastShot: 0, range: 12, barrels: 1, category: 1 };
      weapons.sword = { active: false, level: 0, damage: 30, cooldown: 1500, lastShot: 0, range: 3.5, category: 1 };
      weapons.aura = { active: false, level: 0, damage: 5, cooldown: 500, lastShot: 0, range: 3, category: 2 };
      weapons.meteor = { active: false, level: 0, damage: 60, cooldown: 2500, lastShot: 0, area: 5, category: 3 };
      weapons.droneTurret = { active: false, level: 0, damage: 8, cooldown: 200, lastShot: 0, range: 15, droneCount: 1, category: 2 };
      weapons.doubleBarrel = { active: false, level: 0, damage: 18, cooldown: 1500, lastShot: 0, range: 12, spread: 0.3, pellets: 2, category: 1 };
      weapons.iceSpear = { active: false, level: 0, damage: 20, cooldown: 1500, lastShot: 0, range: 15, slowPercent: 0.4, slowDuration: 2000, category: 2 };
      weapons.fireRing = { active: false, level: 0, damage: 8, cooldown: 800, lastShot: 0, range: 4, orbs: 3, rotationSpeed: 2, category: 3 };
      // New weapons — initialized upfront so weapon-selection code can always check .active
      weapons.lightning     = { active: false, level: 0, damage: 45, cooldown: 2000, lastShot: 0, range: 18, strikes: 1, chainRange: 5, category: 3 };
      weapons.poison        = { active: false, level: 0, damage: 6,  cooldown: 1500, lastShot: 0, range: 5,  dotDamage: 3, dotDuration: 4000, category: 3 };
      weapons.homingMissile = { active: false, level: 0, damage: 40, cooldown: 2200, lastShot: 0, range: 20, category: 2 };
      weapons.samuraiSword  = { active: false, level: 0, damage: 38, cooldown: 1200, lastShot: 0, range: 4.0, category: 1 };
      weapons.whip          = { active: false, level: 0, damage: 18, cooldown: 900,  lastShot: 0, range: 6.0, chainHits: 3, category: 1 };
      weapons.uzi           = { active: false, level: 0, damage: 8,  cooldown: 120,  lastShot: 0, range: 10, barrels: 1, category: 1 };
      weapons.sniperRifle   = { active: false, level: 0, damage: 95, cooldown: 3000, lastShot: 0, range: 30, piercing: 3, category: 1 };
      weapons.pumpShotgun   = { active: false, level: 0, damage: 14, cooldown: 1800, lastShot: 0, range: 8, spread: 0.7, pellets: 8, category: 1 };
      weapons.autoShotgun   = { active: false, level: 0, damage: 10, cooldown: 600,  lastShot: 0, range: 7, spread: 0.6, pellets: 6, category: 1 };
      weapons.minigun       = { active: false, level: 0, damage: 6,  cooldown: 60,   lastShot: 0, range: 12, barrels: 1, spinUp: 0, category: 1 };
      weapons.bow           = { active: false, level: 0, damage: 22, cooldown: 1400, lastShot: 0, range: 16, piercing: 1, category: 1 };
      weapons.teslaSaber    = { active: false, level: 0, damage: 28, cooldown: 800,  lastShot: 0, range: 3.5, chainLightning: true, category: 1 };
      weapons.boomerang     = { active: false, level: 0, damage: 20, cooldown: 1600, lastShot: 0, range: 12, returnHits: true, category: 2 };
      weapons.shuriken      = { active: false, level: 0, damage: 12, cooldown: 400,  lastShot: 0, range: 10, projectiles: 3, category: 2 };
      weapons.nanoSwarm     = { active: false, level: 0, damage: 4,  cooldown: 200,  lastShot: 0, range: 8, swarmCount: 6, category: 2 };
      weapons.fireball      = { active: false, level: 0, damage: 35, cooldown: 1800, lastShot: 0, range: 14, explosionRadius: 3, category: 3 };
      
      // Clean up any existing drone turrets
      droneTurrets.forEach(drone => drone.destroy());
      droneTurrets = [];
      
      // Reset perks (these are temporary and should not persist between runs)
      playerStats.perks = {
        vampire: 0,
        juggernaut: 0,
        swift: 0,
        lucky: 0,
        berserker: 0
      };
      
      // Reset temporary skills (these should not persist between runs)
      playerStats.dashCooldownReduction = 0;
      playerStats.dashDistanceBonus = 0;
      // Reset dashCooldown to base before applying permanent skill bonuses
      dashCooldown = 1500;
      // Apply dashPower from camp upgrades/attributes to base dash distance
      dashDistance = 1.8 * (playerStats.dashPower || 1.0);
      playerStats.hasSecondWind = false;
      playerStats.lifeStealPercent = 0;
      playerStats.thornsPercent = 0;
      playerStats.hasBerserkerRage = false;
      playerStats.treasureHunterChance = 0;
      playerStats.doubleCritChance = 0;
      playerStats.extraProjectiles = 0;
      playerStats.doubleCastChance = 0;
      playerStats.doubleUpgradeChance = 0;
      playerStats.pierceCount = 0;
      playerStats.survivalTime = 0;
      playerStats.dashesPerformed = 0;
      playerStats.damageTaken = 0;
      playerStats.weaponsUnlocked = 0;
      playerStats.damage = 1; // Reset dynamic damage multiplier (used for lowHpDamage)
      // Reset new RPG stats to defaults before skill-tree application
      playerStats.dodgeChance       = 0;
      playerStats.damageReduction   = 0;
      playerStats.hasLastStand      = false;
      playerStats.lastStandUsed     = false;
      playerStats.healOnKill        = 0;
      playerStats.lowHpDamage       = 0;
      playerStats.executeDamage     = 0;
      playerStats.armorPenetration  = 0;
      playerStats.multiHitChance    = 0;
      playerStats.weaponDamage      = 0;
      playerStats.pickupRange       = 1.0;
      playerStats.dropRate          = 1.0;
      playerStats.auraRange         = 1.0;
      playerStats.fireDamage        = 0;
      playerStats.iceDamage         = 0;
      playerStats.lightningDamage   = 0;
      playerStats.elementalDamage   = 0;
      playerStats.burnChance        = 0;
      playerStats.slowChance        = 0;
      playerStats.chainChance       = 0;
      playerStats.chainCount        = 0;
      playerStats.freezeChance      = 0;
      playerStats.burnSpread        = false;
      playerStats.spellEchoChance   = 0;
      playerStats.elementalChain    = 0;
      playerStats.elementalGuaranteed = false;
      playerStats.mobilityScore     = 1.0;
      playerStats.goldMultiplier    = 1.0;
      playerStats.xpMultiplier      = 1.0;
      // Cache headshot unlock status for this run
      playerStats.headshotUnlocked = isHeadshotUnlocked();

      // Apply ALL purchased SKILL_TREE bonuses to playerStats (fix: was never called before)
      applySkillTreeBonuses();

      // Apply pickupRange skill bonus to magnetRange (reset base first, then scale)
      magnetRange = 2 * (playerStats.pickupRange || 1.0);
      
      windmillQuest = { active: false, timer: 0, duration: 15, windmill: null, hasCompleted: false, dialogueOpen: false, rewardReady: false, rewardGiven: false, failed: false, failedCooldown: false };
      document.getElementById('windmill-quest-ui').style.display = 'none';
      hideFarmerDialogue();
      
      montanaQuest = { active: false, timer: 0, duration: 45, kills: 0, killsNeeded: 15, landmark: null, hasCompleted: false };
      document.getElementById('montana-quest-ui').style.display = 'none';
      
      eiffelQuest = { active: false, timer: 0, duration: 60, kills: 0, killsNeeded: 25, landmark: null, hasCompleted: false };
      document.getElementById('eiffel-quest-ui').style.display = 'none';
      
      // Reset windmill HP (optimized: use pre-cached animatedSceneObjects)
      for (const c of animatedSceneObjects.windmills) {
        c.userData.hp = 1000;
        c.userData.maxHp = 1000;
      }
      
      // Reset music (updateBackgroundMusic stops all oscillators and clears state)
      updateBackgroundMusic();

      // Clear Entities
      // With object pooling: active enemies are returned to the pool (mesh stays in scene,
      // hidden at Y=-100) instead of being disposed.  Pooled enemies from previous waves
      // survive across the reset so their GPU resources are reused in the next run.
      // Without pooling: full disposal as before.
      enemies.forEach(e => {
        if (e.mesh) {
          if (window.enemyPool && !e.isDead) {
            // Pool path: hide and park LIVING enemies (both instanced and non-instanced).
            // Previously only non-instanced enemies were pooled (_usesInstancing check was
            // wrong), causing living instanced enemies to be leaked on reset instead of
            // returned to the free list for the next run.
            // Dead enemies are handled by managedAnimations.forEach cleanup (below) so we
            // skip them here to prevent double-pooling the same enemy object.
            if (e.mesh.material && !e.mesh.material._isShared && !e.mesh.material._isSpiderHitbox) {
              // Material was cloned for a mid-animation opacity change — dispose the clone
              // and restore the original shared material from the cache.
              const origHexStr = e.mesh.material.color ? e.mesh.material.color.getHex().toString(16) : null;
              e.mesh.material.dispose();
              // Attempt to restore via SHARED_MAT_CACHE (accessed through the enemy's colour).
              if (origHexStr && window.SHARED_MAT_CACHE && window.SHARED_MAT_CACHE[origHexStr]) {
                e.mesh.material = window.SHARED_MAT_CACHE[origHexStr];
              }
            }
            if (e.bulletHoles) e.bulletHoles.forEach(h => { if (h.material && !h.material._isShared) h.material.dispose(); });
            if (e._bloodStains) e._bloodStains.forEach(s => { if (s.material && !s.material._isShared) s.material.dispose(); });
            e.bulletHoles = [];
            e._bloodStains = [];
            // Cancel any pending damage-display timer before parking so it cannot
            // fire against a recycled enemy in the next run.
            if (e._damageFlushTimer) { clearTimeout(e._damageFlushTimer); e._damageFlushTimer = null; }
            e._accumulatedDamage = 0;
            window.enemyPool._return(e);
          } else if (!window.enemyPool) {
            scene.remove(e.mesh); // no-op for instanced enemies; removes non-instanced ones
            if (!e._usesInstancing) {
              // Only dispose geometry/material for enemies that own their mesh exclusively
              // Never dispose shared cached geometry (flagged with _isShared) or shared cached material (SHARED_MAT_CACHE)
              if (e.mesh.geometry && !e.mesh.geometry._isShared) e.mesh.geometry.dispose();
              if (e.mesh.material) {
                if (Array.isArray(e.mesh.material)) {
                  e.mesh.material.forEach(m => { if (!m._isShared) m.dispose(); });
                } else {
                  if (!e.mesh.material._isShared) e.mesh.material.dispose();
                }
              }
            }
            // Dispose sub-mesh resources (bullet holes, blood stains, eyes) that are
            // children of the enemy mesh — they are removed from scene with the parent,
            // but their GPU resources must be explicitly freed.
            // Note: bullet holes, blood stains, and eyes use shared geometry/material — only dispose per-instance materials.
            if (e.bulletHoles) e.bulletHoles.forEach(h => { if (h.material && !h.material._isShared) h.material.dispose(); });
            if (e._bloodStains) e._bloodStains.forEach(s => { if (s.material && !s.material._isShared) s.material.dispose(); });
            // Eyes use shared geometry (SHARED_EYE_GEO) and shared material (SHARED_EYE_MAT) — never dispose
            // Also skip disposing shared cached body geometry (SHARED_GEO_TYPE) and materials (SHARED_MAT_CACHE)
            // Clean up ground shadow (blob shadow disc — not shared, must be removed/disposed)
            if (e.groundShadow) {
              if (e.groundShadow.parent) scene.remove(e.groundShadow);
              if (e.groundShadow.geometry) e.groundShadow.geometry.dispose();
              if (e.groundShadow.material) e.groundShadow.material.dispose();
            }
            // Clean up glitch submeshes for Source Glitch (type 20)
            if (e._glitchMeshes) {
              e._glitchMeshes.forEach(gm => {
                if (gm.geometry) gm.geometry.dispose();
                if (gm.material) gm.material.dispose();
              });
            }
            // Clean up anatomy sentinel mesh (unique geo+mat; child of enemy mesh)
            if (e._anatBaseMesh) {
              if (e._anatBaseMesh.geometry) e._anatBaseMesh.geometry.dispose();
              if (e._anatBaseMesh.material) e._anatBaseMesh.material.dispose();
              e._anatBaseMesh = null;
            }
          }
        }
      });
      enemies = [];

      // Immediately zero out instanced enemy batches so no ghost enemies appear on screen
      // before the next animate() frame rebuilds the batches from the (now empty) enemies array.
      // Explicit count=0 on each known batch to guarantee GPU state is cleared this frame.
      if (window._instancedRenderer && window._instancedRenderer.active) {
        const _ir = window._instancedRenderer;
        ['enemy_tank', 'enemy_fast', 'enemy_balanced', 'enemy_eye'].forEach(key => {
          const batch = _ir.getBatch(key);
          if (batch) {
            batch.mesh.count = 0;
            batch.mesh.instanceMatrix.needsUpdate = true;
            if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
          }
        });
        _ir.beginFrame();
        _ir.endFrame();
      }

      // Reset enemy spatial hash so the new run starts with a clean lookup structure.
      if (window._enemySpatialHash && typeof window._enemySpatialHash.clear === 'function') window._enemySpatialHash.clear();
      if (window._enemyQuadTree  && typeof window._enemyQuadTree.clear  === 'function') window._enemyQuadTree.clear();
      
      expGems.forEach(e => {
        scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        if (e._outlineMat) e._outlineMat.dispose(); // Dispose per-instance outline material
      });
      expGems = [];
      
      // Clean up blood decals (InstancedMesh path: park all slots; legacy array path: dispose)
      if (window._bloodDecalIM) {
        // Reset all slots by parking them below the floor
        for (let _ri = 0; _ri < MAX_BLOOD_DECALS; _ri++) {
          window._bdIMSpawnTime && (window._bdIMSpawnTime[_ri] = 0);
        }
        if (window._bloodDecalIM.instanceMatrix) window._bloodDecalIM.instanceMatrix.needsUpdate = true;
      }
      bloodDecals.forEach(d => {
        if (d.parent) scene.remove(d);
        if (d.geometry) d.geometry.dispose();
        if (d.material) d.material.dispose();
      });
      bloodDecals = [];
      
      // Reset advanced blood particle system
      if (window.BloodSystem) window.BloodSystem.reset();
      
      // Reset lava timers
      window._lavaDamageTimer = 0;
      window._lavaSpoutTimer = 0;
      
      // Clean up blood drips (return pooled meshes, dispose non-pooled)
      bloodDrips.forEach(d => {
        if (d._pool) {
          d._pool.release(d.mesh);
        } else {
          if (d.mesh.parent) scene.remove(d.mesh);
          if (d.mesh.geometry) d.mesh.geometry.dispose();
          if (d.mesh.material) d.mesh.material.dispose();
        }
      });
      bloodDrips = [];
      // Release all active pool entries so they are ready for next run
      if (window.meatChunkPool) window.meatChunkPool.releaseAll();
      if (window.bloodDropPool) window.bloodDropPool.releaseAll();
      // Clean up bullet tracer trails
      if (window.bulletTrails) {
        window.bulletTrails.forEach(t => {
          scene.remove(t.mesh);
          t.mesh.geometry.dispose();
          t.mesh.material.dispose();
        });
        window.bulletTrails = [];
      }
      // Call optional cleanup() on each managed animation before clearing, so any
      // Three.js objects they own (e.g. air blood pool meshes/geometries) are
      // properly removed from the scene and disposed instead of leaking across runs.
      managedAnimations.forEach(anim => { if (anim.cleanup) anim.cleanup(); });
      managedAnimations = [];

      // Neural Matrix: clean up Event Horizon holes on reset
      if (window._eventHorizonHoles) {
        window._eventHorizonHoles.forEach(hole => {
          if (hole.mesh) scene.remove(hole.mesh);
          if (hole.mesh && hole.mesh._glowRing) scene.remove(hole.mesh._glowRing);
        });
        window._eventHorizonHoles = [];
      }
      window._activeBloodPools = 0;
      // Re-apply Neural Matrix flags for the new run
      if (window.NeuralMatrix) window.NeuralMatrix.applyToRun(playerStats);
      
      goldCoins.forEach(g => {
        scene.remove(g.mesh);
        if (g.mesh.geometry) g.mesh.geometry.dispose();
        if (g.mesh.material) g.mesh.material.dispose();
      });
      goldCoins = [];
      
      goldDrops.forEach(g => {
        g.destroy();
      });
      goldDrops = [];
      
      chests.forEach(c => {
        if (c.glowLight) scene.remove(c.glowLight);
        scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
        if (c.lid) {
          c.lid.geometry.dispose();
          c.lid.material.dispose();
        }
      });
      chests = [];

      // Boss Chest cleanup on game reset
      if (window.bossChests && window.bossChests.length) {
        window.bossChests.forEach(bc => {
          if (bc.mesh) { try { scene.remove(bc.mesh); bc.mesh.geometry.dispose(); bc.mesh.material.dispose(); } catch(_){} bc.mesh = null; }
          bc.collected = true;
        });
        window.bossChests = [];
      }
      // Remove relic loot overlay if present
      const _rlo = document.getElementById('relic-loot-overlay');
      if (_rlo) _rlo.remove();

      // Projectile cleanup — pooled bullets share cached geometry so MUST NOT be disposed.
      // Return pooled projectiles to the pool; dispose only non-pooled ones.
      projectiles.forEach(p => {
        if (p._isPooled && window._projectilePool) {
          // p.destroy() hides mesh and removes it from scene without disposing shared geometry
          p.destroy();
          window._projectilePool.release(p);
        } else {
          // Non-pooled: safe to remove from scene and dispose
          scene.remove(p.mesh);
          if (p.glow) scene.remove(p.glow);
          if (p.mesh.material) p.mesh.material.dispose();
          if (p.glow && p.glow.material) p.glow.material.dispose();
          // Geometry is always from the shared cache — never dispose it
        }
      });
      projectiles = [];
      
      if (particlePool) {
        particles.forEach(p => {
          scene.remove(p.mesh);
          particlePool.release(p);
        });
        // Reset recycle cursor so the next spawn starts clean
        if (typeof _particleRecycleIdx !== 'undefined') _particleRecycleIdx = 0;
        particlePool.releaseAll();
      } else {
        particles.forEach(p => {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
        });
      }
      particles = [];
      
      // Clean up any active flash lights
      flashLights.forEach(light => {
        scene.remove(light);
      });
      flashLights = [];
      // Reset pooled flash lights (remain in scene with zero intensity)
      if (typeof _flashPool !== 'undefined' && _flashPool) {
        _flashPool.forEach(pl => { pl.intensity = 0; pl.position.set(0, -9999, 0); pl._poolExpireAt = 0; });
      }
      
      // Reset fountain/lightning spawn sequence for next run
      if (window.SpawnSequence) window.SpawnSequence.reset();

      // Reset new performance & visual systems
      if (window.DopamineSystem) {
        if (window.DopamineSystem.ElasticNumbers) window.DopamineSystem.ElasticNumbers.clear();
        if (window.DopamineSystem.FeverMode) window.DopamineSystem.FeverMode.reset();
        if (window.DopamineSystem.CameraFX) window.DopamineSystem.CameraFX.reset();
        if (window.DopamineSystem.TimeDilation) window.DopamineSystem.TimeDilation.snap(1.0);
      }
      // Remove all regular damage-number divs and cancel their cleanup timers.
      if (window.clearAllDamageNumbers) window.clearAllDamageNumbers();
      // Forcefully sweep any orphaned damage/flash elements that may have been missed.
      document.querySelectorAll('.damage-number, .elastic-damage-number, .lvlup-screen-flash').forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      if (window.AdvancedPhysics && window.AdvancedPhysics.KnockbackChain) {
        window.AdvancedPhysics.KnockbackChain.clear();
      }
      
      // Clear any pending timeouts
      activeTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      activeTimeouts = [];
      
      // Clean up managed smoke particles
      smokeParticles.forEach(sp => {
        scene.remove(sp.mesh);
        if (typeof _smokePool !== 'undefined' && _smokePool) {
          _smokePool.release(sp);
        } else if (sp.material) {
          sp.material.dispose();
        }
      });
      smokeParticles = [];
      if (typeof _smokePool !== 'undefined' && _smokePool) _smokePool.releaseAll && _smokePool.releaseAll();

      lavaParticles.forEach(lp => {
        scene.remove(lp.mesh);
        if (typeof _lavaPool !== 'undefined' && _lavaPool) {
          _lavaPool.release(lp);
        }
      });
      lavaParticles = [];
      if (typeof _lavaPool !== 'undefined' && _lavaPool && _lavaPool.releaseAll) _lavaPool.releaseAll();
      
      meteors.forEach(m => {
        scene.remove(m.mesh);
        scene.remove(m.shadow);
        m.mesh.geometry.dispose();
        m.mesh.material.dispose();
      });
      meteors = [];
      
      // Phase 5: Spawn companion if one is selected
      if (activeCompanion) {
        activeCompanion.destroy();
        activeCompanion = null;
      }
      
      // COMPANION UNLOCKS AFTER COMPANION ACTIVATION QUEST
      const companionQuestCompleted = saveData.tutorialQuests?.completedQuests?.includes('quest9_activateCompanion') ||
                                      saveData.tutorialQuests?.completedQuests?.includes('quest5_breedCompanion') ||
                                      saveData.alienIncubatorHatched === true || false; // also unlocked via Incubator pod
      
      if (saveData.selectedCompanion && 
          saveData.companions[saveData.selectedCompanion]?.unlocked &&
          companionQuestCompleted) {
        activeCompanion = new Companion(saveData.selectedCompanion);
        console.log('[Companion] Spawned companion:', saveData.selectedCompanion, 'after completing companion quest');
      } else if (!companionQuestCompleted) {
        console.log('[Companion] Hidden until companion activation quest is completed');
      }

      // Reset destructible environment — restore non-destroyed props to full health/visuals,
      // and respawn any that were destroyed so every run starts with a complete world.
      if (window.destructibleProps) {
        const toRespawn = [];
        for (const prop of window.destructibleProps) {
          if (prop.destroyed) {
            // Collect spawn info before discarding the dead entry
            if (prop.originalPosition) {
              toRespawn.push({ type: prop.type, position: prop.originalPosition.clone() });
            }
          } else {
            // Restore health and visual damage state
            prop.hp = prop.maxHp;
            prop._wobbleTime = 0;
            prop.darkenedStage1 = false;
            prop.darkenedStage2 = false;
            if (prop.type === 'tree') {
              if (prop.mesh.userData.trunk) prop.mesh.userData.trunk.material.color.copy(prop.originalColor.trunk);
              if (prop.mesh.userData.leaves) prop.mesh.userData.leaves.material.color.copy(prop.originalColor.leaves);
            } else {
              if (prop.mesh.material) prop.mesh.material.color.copy(prop.originalColor);
            }
            prop.mesh.scale.copy(prop.originalScale);
          }
        }
        // Remove dead entries, then recreate them if the factory is available
        window.destructibleProps = window.destructibleProps.filter(p => !p.destroyed);
        if (window._createDestructibleProp) {
          for (const { type, position } of toRespawn) {
            try {
              const newProp = window._createDestructibleProp(type, position);
              window.destructibleProps.push(newProp);
            } catch (e) { console.warn('[resetGame] Failed to respawn prop:', type, e); }
          }
        }
      }

      // Reset breakable fences — restore HP on surviving segments; discard disposed entries.
      if (window.breakableFences) {
        window.breakableFences = window.breakableFences.filter(fence => {
          if (!fence.userData) return false;
          if (fence.userData.hp <= 0) return false; // already disposed/removed
          fence.userData.hp = fence.userData.maxHp || fence.userData.hp;
          fence.userData._wobbleTime = 0;
          return true;
        });
      }

      // Clear and repopulate harvest resource nodes so each run starts with a fresh world.
      if (window.GameHarvesting) {
        window.GameHarvesting.resetNodes();
      }

      // Reset Player - Spawn right next to the fountain/statue
      if (player) {
        player.mesh.position.set(12, 0.5, 0); // Right next to fountain, outside rim
        player.mesh.material.color.setHex(COLORS.player);
      }

      setGameOver(false);
      _gameOverTransitionLocked = false;
      // Reset any accumulated pauses before starting a new game
      pauseOverlayCount = 0;
      window.pauseOverlayCount = 0;
      levelUpPending = false;
      pendingQuestLevels = 0;
      // Reset cinematic and kill-cam flags so stale state from a previous run can
      // never carry into the new run and freeze the camera on the first frame.
      cinematicActive = false;
      cinematicData = null;
      killCamActive = false;
      _roundStartCinematicActive = false;
      setGamePaused(true);  // Start paused, countdown will unpause (PR #70)
      setGameActive(false);  // Not active until countdown completes (PR #70)
      document.getElementById('gameover-screen').style.display = 'none';
      const resOverlay = document.getElementById('res-overlay');
      if (resOverlay && resOverlay.parentNode) resOverlay.parentNode.removeChild(resOverlay);
      updateHUD();
    }

    function toggleStats() {
      playSound('levelup'); // Add button sound
      const modal = document.getElementById('stats-modal');
      const levelUpModal = document.getElementById('levelup-modal');
      
      if (modal.style.display === 'flex') {
        modal.style.display = 'none';
        if (levelUpModal.style.display !== 'flex' && !isGameOver) {
          setGamePaused(false);
        }
      } else {
        // Calculate current run time
        const currentRunTime = isGameActive ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;
        const goldThisRun = playerStats.gold - runStartGold;
        
        // Update tutorial quest progress
        if (saveData.tutorialQuests && isGameActive) {
          saveData.tutorialQuests.survivalTimeThisRun = currentRunTime;
        }
        
        // Get permanent upgrade bonuses
        const permMaxHp = PERMANENT_UPGRADES.maxHp.effect(saveData.upgrades.maxHp);
        const permHpRegen = PERMANENT_UPGRADES.hpRegen.effect(saveData.upgrades.hpRegen);
        const permMoveSpeed = PERMANENT_UPGRADES.moveSpeed.effect(saveData.upgrades.moveSpeed);
        const permAttackDamage = PERMANENT_UPGRADES.attackDamage.effect(saveData.upgrades.attackDamage);
        const permAttackSpeed = PERMANENT_UPGRADES.attackSpeed.effect(saveData.upgrades.attackSpeed);
        const permCritChance = PERMANENT_UPGRADES.critChance.effect(saveData.upgrades.critChance);
        const permCritDamage = PERMANENT_UPGRADES.critDamage.effect(saveData.upgrades.critDamage);
        const permArmor = PERMANENT_UPGRADES.armor.effect(saveData.upgrades.armor);
        const permCooldownReduction = PERMANENT_UPGRADES.cooldownReduction.effect(saveData.upgrades.cooldownReduction);
        const permGoldEarned = PERMANENT_UPGRADES.goldEarned.effect(saveData.upgrades.goldEarned);
        const permExpEarned = PERMANENT_UPGRADES.expEarned.effect(saveData.upgrades.expEarned);
        const permMaxWeapons = saveData.upgrades.maxWeapons || 0;
        
        const content = document.getElementById('stats-content');
        content.innerHTML = `
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 600px;">
  <div>
    <span style="color: #5DADE2; font-size: 16px; font-weight: bold; display: block; margin-bottom: 10px;">═══ BASE STATS ═══</span>
    <div style="display: grid; grid-template-columns: auto auto; gap: 5px 10px;">
      <span style="color: #aaa;">Max HP:</span><span style="color: #fff; text-align: right;">${playerStats.maxHp}</span>
      <span style="color: #aaa;">Current HP:</span><span style="color: #fff; text-align: right;">${Math.floor(playerStats.hp)}</span>
      <span style="color: #aaa;">HP Regen:</span><span style="color: #fff; text-align: right;">${playerStats.hpRegen}/s</span>
      <span style="color: #aaa;">Move Speed:</span><span style="color: #fff; text-align: right;">${playerStats.walkSpeed.toFixed(1)}</span>
      <span style="color: #aaa;">Attack Dmg:</span><span style="color: #fff; text-align: right;">${playerStats.strength.toFixed(2)}x</span>
      <span style="color: #aaa;">Attack Spd:</span><span style="color: #fff; text-align: right;">${playerStats.atkSpeed.toFixed(2)}x</span>
      <span style="color: #aaa;">Crit Chance:</span><span style="color: #fff; text-align: right;">${(playerStats.critChance*100).toFixed(1)}%</span>
      <span style="color: #aaa;">Crit Damage:</span><span style="color: #fff; text-align: right;">${(playerStats.critDmg*100).toFixed(0)}%</span>
      <span style="color: #aaa;">Armor:</span><span style="color: #fff; text-align: right;">${playerStats.armor.toFixed(0)}%</span>
    </div>
  </div>
  
  <div>
    <span style="color: #27ae60; font-size: 16px; font-weight: bold; display: block; margin-bottom: 10px;">═══ RUN STATS ═══</span>
    <div style="display: grid; grid-template-columns: auto auto; gap: 5px 10px;">
      <span style="color: #aaa;">Level:</span><span style="color: #fff; text-align: right;">${playerStats.lvl}</span>
      <span style="color: #aaa;">Kills:</span><span style="color: #fff; text-align: right;">${playerStats.kills}</span>
      <span style="color: #aaa;">Time:</span><span style="color: #fff; text-align: right;">${currentRunTime}s</span>
      <span style="color: #aaa;">Gold Earned:</span><span style="color: #fff; text-align: right;">${goldThisRun}</span>
    </div>
  </div>
</div>

<div style="margin-top: 20px;">
  <span style="color: #FFD700; font-size: 16px; font-weight: bold; display: block; margin-bottom: 10px;">═══ PERMANENT UPGRADES ═══</span>
  <div style="display: grid; grid-template-columns: auto auto; gap: 5px 15px; max-width: 400px;">
    <span style="color: #aaa;">Max HP:</span><span style="color: #fff; text-align: right;">+${permMaxHp}</span>
    <span style="color: #aaa;">HP Regen:</span><span style="color: #fff; text-align: right;">+${permHpRegen}/s</span>
    <span style="color: #aaa;">Move Speed:</span><span style="color: #fff; text-align: right;">+${(permMoveSpeed*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Attack Damage:</span><span style="color: #fff; text-align: right;">+${(permAttackDamage*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Attack Speed:</span><span style="color: #fff; text-align: right;">+${(permAttackSpeed*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Crit Chance:</span><span style="color: #fff; text-align: right;">+${(permCritChance*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Crit Damage:</span><span style="color: #fff; text-align: right;">+${(permCritDamage*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Armor:</span><span style="color: #fff; text-align: right;">+${permArmor.toFixed(0)}%</span>
    <span style="color: #aaa;">Cooldown Reduction:</span><span style="color: #fff; text-align: right;">${(permCooldownReduction*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Gold Bonus:</span><span style="color: #fff; text-align: right;">+${(permGoldEarned*100).toFixed(1)}%</span>
    <span style="color: #aaa;">EXP Bonus:</span><span style="color: #fff; text-align: right;">+${(permExpEarned*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Max Weapons:</span><span style="color: #fff; text-align: right;">${permMaxWeapons}</span>
  </div>
</div>

<div style="margin-top: 20px;">
  <span style="color: #e74c3c; font-size: 16px; font-weight: bold; display: block; margin-bottom: 10px;">═══ LIFETIME STATS ═══</span>
  <div style="display: grid; grid-template-columns: auto auto; gap: 5px 15px; max-width: 300px;">
    <span style="color: #aaa;">Total Runs:</span><span style="color: #fff; text-align: right;">${saveData.totalRuns}</span>
    <span style="color: #aaa;">Best Time:</span><span style="color: #fff; text-align: right;">${saveData.bestTime}s</span>
    <span style="color: #aaa;">Best Kills:</span><span style="color: #fff; text-align: right;">${saveData.bestKills}</span>
    <span style="color: #aaa;">Total Gold:</span><span style="color: #fff; text-align: right;">${saveData.totalGoldEarned}</span>
  </div>
</div>
        `;
        modal.style.display = 'flex';
        setGamePaused(true);
      }
    }
