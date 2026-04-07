// js/quest-system.js — Tutorial quest system, story quest popups, account level system,
// AI chat system, character visuals, codex, inventory screen, companion house, camp screen rendering.
// Depends on: variables from main.js, save-system.js, camp-skill-system.js

    // --- STORY QUEST POPUP SYSTEM ---
    
    // Lore unlocking system
    function unlockLore(category, id) {
      if (!saveData.loreUnlocked) {
        saveData.loreUnlocked = { landmarks: [], enemies: [], bosses: [], buildings: [] };
      }
      
      if (!saveData.loreUnlocked[category].includes(id)) {
        saveData.loreUnlocked[category].push(id);
        saveSaveData();
        
        const loreData = LORE_DATABASE[category][id];
        if (loreData) {
          showStatChange(`📖 Lore Unlocked: ${loreData.name}`);
          
          // Show a lore popup after a short delay
          setTimeout(() => {
            showLorePopup(loreData);
          }, 1000);
        }
      }
    }
    
    function showLorePopup(loreData) {
      const modal = document.getElementById('comic-tutorial-modal');
      const title = document.getElementById('comic-title');
      const text = document.getElementById('comic-text');
      const btn = document.getElementById('comic-action-btn');
      
      if (!modal || !title || !text || !btn) return;
      
      // Pause game while lore popup is visible
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      
      title.textContent = `${loreData.icon} ${loreData.name}`;
      text.innerHTML = `<strong>${loreData.description}</strong><br><br>${loreData.story}`;
      btn.textContent = 'CLOSE';
      
      modal.style.display = 'flex';
      
      btn.onclick = () => {
        modal.style.display = 'none';
        if (wasGameActive) setGamePaused(false);
      };
    }
    
    // Extended quest system
    function checkLegendaryCigarQuest() {
      if (!saveData.extendedQuests) {
        saveData.extendedQuests = {
          legendaryCigar: { started: false, completed: false, foundCigar: false },
          companionEgg: { started: false, completed: false, eggHatched: false, ceremonyDone: false }
        };
      }
      
      // Start quest when player visits Stonehenge area (only after tutorial stonehenge quest is done)
      if (player && !saveData.extendedQuests.legendaryCigar.started &&
          saveData.tutorialQuests && isQuestClaimed('quest3_stonehengeGear')) {
        const stonehengePos = { x: 32, z: 28 }; // OPTIMIZED: Updated for ultra-compact 80x80 map (was 35, 30; before 60, 50)
        const dist = Math.sqrt(
          Math.pow(player.mesh.position.x - stonehengePos.x, 2) +
          Math.pow(player.mesh.position.z - stonehengePos.z, 2)
        );
        
        if (dist < 20) {
          saveData.extendedQuests.legendaryCigar.started = true;
          saveSaveData();
          showComicInfoBox(
            '🚬 Quest: The Legendary Cigar',
            'You sense something powerful near Stonehenge...<br><br>Ancient legends speak of an <strong>Eternal Cigar</strong> hidden within these mystical stones. It\'s said to grant immense power to those worthy enough to find it!<br><br><b>Objective:</b> Search around Stonehenge for the legendary cigar',
            'I\'ll find it!'
          );
        }
      }
      
      // Check if player found the cigar (near center of stonehenge)
      if (saveData.extendedQuests.legendaryCigar.started && !saveData.extendedQuests.legendaryCigar.foundCigar) {
        const cigarPos = { x: 32, z: 28 }; // OPTIMIZED: Updated to match ultra-compact Stonehenge position (was -60, 60)
        const dist = Math.sqrt(
          Math.pow(player.mesh.position.x - cigarPos.x, 2) +
          Math.pow(player.mesh.position.z - cigarPos.z, 2)
        );
        
        if (dist < 3) {
          saveData.extendedQuests.legendaryCigar.foundCigar = true;
          saveData.extendedQuests.legendaryCigar.completed = true;
          saveSaveData();
          
          // Note: The bonus is applied this run only - stored in saveData for permanent tracking
          // On future runs, check saveData.extendedQuests.legendaryCigar.completed in resetGame
          
          showComicInfoBox(
            '🚬 Legendary Cigar Found!',
            '<strong>You\'ve discovered the Eternal Cigar!</strong><br><br>A surge of power flows through you. Your attacks feel stronger, your movements more precise.<br><br><b>Reward:</b> +50% Permanent Damage!<br><br>The cigar glows with an otherworldly light, forever enhancing your combat prowess.',
            'AMAZING!'
          );
          
          // Unlock lore
          unlockLore('landmarks', 'stonehenge');
        }
      }
    }
    
    function showQuestPopup(title, message, buttonText = 'Continue', onClose = null) {
      // Suppress quest popups in sandbox mode
      if (window._engine2SandboxMode === true || window.location.pathname.includes('sandbox.html')) {
        console.log('[Quest] Popup suppressed in sandbox mode:', title);
        if (onClose) onClose();
        return;
      }
      // Bug 2 fix: if the game is already over, skip the blocking overlay entirely
      if (typeof isGameOver !== 'undefined' && isGameOver) {
        if (onClose) onClose();
        return;
      }
      // Pause game when popup is shown
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      // Create popup overlay
      const overlay = document.createElement('div');
      overlay.id = 'quest-popup-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease-out;
      `;
      
      const popup = document.createElement('div');
      popup.style.cssText = `
        background: linear-gradient(160deg, #0d0015 0%, #07000e 50%, #0a0510 100%);
        border: 3px solid #C9A227;
        border-radius: 4px;
        padding: 20px;
        max-width: 90vw;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        box-sizing: border-box;
        text-align: center;
        animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1);
        box-shadow: 0 0 30px rgba(201,162,39,0.5), 0 0 60px rgba(0,255,100,0.1);
        outline: 1px solid rgba(201,162,39,0.2);
        outline-offset: 3px;
      `;
      
      popup.innerHTML = `
        <div style="font-size: 28px; color: #C9A227; font-weight: bold; margin-bottom: 20px; font-family:'Bangers',cursive; letter-spacing: 3px; text-shadow: 0 0 15px rgba(201,162,39,0.8);">${title}</div>
        <div style="font-size: 17px; color: #E8D5A3; line-height: 1.7; margin-bottom: 30px;">${message}</div>
        <button class="btn" style="font-size: 18px; padding: 12px 30px; background: linear-gradient(to bottom,#C9A227,#8B6914); color: #000; border: 2px solid #000; letter-spacing: 2px;">${buttonText}</button>
      `;
      
      // Add X close button
      const xBtn = document.createElement('button');
      xBtn.className = 'overlay-close-x';
      xBtn.innerHTML = '✕';
      xBtn.title = 'Close';
      xBtn.style.cssText = 'pointer-events:auto;z-index:999;';
      popup.style.position = 'relative';
      popup.appendChild(xBtn);

      let _questPopupClosed = false;
      const closeHandler = () => {
        if (_questPopupClosed) return;
        _questPopupClosed = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (wasGameActive) setGamePaused(false);
        if (onClose) onClose();
      };
      popup.querySelector('button.btn').onclick = closeHandler;
      xBtn.onclick = closeHandler;
      
      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      // Bug 2 fix: safety watchdog — auto-close after 15 seconds to prevent permanent block
      setTimeout(closeHandler, 15000);
    }

    // NEW: Comic-magazine styled info box (80s Batman style)
    function showComicInfoBox(title, message, buttonText = 'Continue', onClose = null) {
      // Suppress quest popups in sandbox mode
      if (window._engine2SandboxMode === true || window.location.pathname.includes('sandbox.html')) {
        console.log('[Quest] Comic info box suppressed in sandbox mode:', title);
        if (onClose) onClose();
        return;
      }
      // Bug 2 fix: if the game is already over, skip the blocking overlay entirely
      if (typeof isGameOver !== 'undefined' && isGameOver) {
        if (onClose) onClose();
        return;
      }
      // Pause game when popup is shown
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      const overlay = document.createElement('div');
      overlay.id = 'comic-info-overlay';
      overlay.style.cssText = [
        'position:fixed','top:0','left:0','width:100%','height:100%',
        'background:rgba(0,0,0,0.95)','z-index:100',
        'display:flex','align-items:center','justify-content:center',
        'animation:fadeIn 0.3s ease-out'
      ].join(';');

      const popup = document.createElement('div');
      popup.style.cssText = [
        'background:linear-gradient(160deg,#0d0015 0%,#07000e 50%,#0a0510 100%)',
        'border:3px solid #C9A227','border-radius:8px','padding:24px',
        'max-width:90vw','width:min(560px,90vw)','max-height:85vh',
        'overflow-y:auto','box-sizing:border-box','text-align:center',
        'animation:popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.1)',
        'box-shadow:0 0 30px rgba(201,162,39,0.5),0 0 60px rgba(0,255,100,0.1)',
        'outline:1px solid rgba(201,162,39,0.2)','outline-offset:3px',
        'position:relative'
      ].join(';');

      popup.innerHTML = `
        <div style="font-family:'Bangers',cursive;font-size:28px;color:#C9A227;font-weight:bold;margin-bottom:18px;text-shadow:0 0 15px rgba(201,162,39,0.9),2px 2px 0 #000;letter-spacing:3px;text-transform:uppercase;">${title}</div>
        <div style="font-size:15px;color:#E8D5A3;line-height:1.8;margin-bottom:24px;font-family:'Bangers',cursive;letter-spacing:0.5px;background:rgba(0,0,0,0.4);padding:16px;border-radius:4px;border:1px solid rgba(201,162,39,0.3);text-align:left;">${message}</div>
        <button class="btn comic-info-close-btn" style="font-size:20px;padding:14px 38px;background:linear-gradient(to bottom,#C9A227,#8B6914);color:#000;font-family:'Bangers',cursive;border:2px solid #000;box-shadow:3px 3px 0 #000;letter-spacing:2px;cursor:pointer;">${buttonText}</button>
      `;

      let comicClosed = false;
      const comicCloseHandler = () => {
        if (comicClosed) return;
        comicClosed = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (wasGameActive) setGamePaused(false);
        if (onClose) onClose();
      };
      // Attach close handler to all buttons (including the main action button)
      popup.querySelectorAll('button').forEach(btn => { btn.onclick = comicCloseHandler; });

      // Add X close button
      const xBtn = document.createElement('button');
      xBtn.className = 'overlay-close-x';
      xBtn.innerHTML = '✕';
      xBtn.title = 'Close';
      xBtn.style.cssText = 'pointer-events:auto;z-index:999;';
      popup.appendChild(xBtn);
      xBtn.onclick = comicCloseHandler;

      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      // Bug 2 fix: safety watchdog — auto-close after 15 seconds to prevent permanent block
      setTimeout(comicCloseHandler, 15000);
    }

    /**
     * showCinematicDialogue(speakerName, text, onClose)
     * Film-style letterboxed AIDA dialogue: black bars top/bottom (≈28% each),
     * typewriter text in the middle third, with the Annunaki cyan/purple aesthetic.
     * Includes a static AIDA portrait on the left and suppresses floating bubbles.
     */
    function showCinematicDialogue(speakerName, text, onClose) {
      // Suppress in sandbox
      if (window._engine2SandboxMode === true || window.location.pathname.includes('sandbox.html')) {
        if (onClose) onClose();
        return;
      }

      // Suppress floating speech bubbles while cinematic is active — set unconditionally.
      window._suppressAidaBubbles = true;

      const wasGameActive =
        typeof isGameActive !== 'undefined' &&
        isGameActive &&
        !(typeof isGameOver !== 'undefined' && isGameOver);
      if (wasGameActive && typeof setGamePaused === 'function') setGamePaused(true);

      const overlay = document.createElement('div');
      overlay.id = 'cinematic-dialogue-overlay';
      overlay.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
        'z-index:10000', 'pointer-events:all', 'cursor:pointer',
        'animation:cinematicFadeIn 0.6s ease-out forwards'
      ].join(';');

      // Top black bar (≈28% of screen)
      const topBar = document.createElement('div');
      topBar.style.cssText = [
        'position:absolute', 'top:0', 'left:0', 'width:100%', 'height:28%',
        'background:#000'
      ].join(';');

      // Bottom black bar (≈28% of screen)
      const bottomBar = document.createElement('div');
      bottomBar.style.cssText = [
        'position:absolute', 'bottom:0', 'left:0', 'width:100%', 'height:28%',
        'background:#000'
      ].join(';');

      // Centre area (44% of screen) — translucent for cinematic feel
      const centreArea = document.createElement('div');
      centreArea.style.cssText = [
        'position:absolute', 'top:28%', 'left:0', 'width:100%', 'height:44%',
        'background:rgba(0,0,0,0.88)',
        'display:flex', 'flex-direction:row', 'align-items:stretch',
        'box-sizing:border-box'
      ].join(';');

      // ── AIDA Portrait Panel (left side) ──
      const portraitPanel = document.createElement('div');
      portraitPanel.style.cssText = [
        'flex:0 0 auto', 'width:clamp(90px,18%,160px)',
        'background:linear-gradient(180deg,#0a0a18 0%,#060610 100%)',
        'border-right:1px solid rgba(0,255,255,0.25)',
        'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:flex-end',
        'padding-bottom:8px', 'position:relative', 'overflow:hidden'
      ].join(';');

      // CSS-art AIDA portrait
      portraitPanel.innerHTML = `
        <svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg"
             style="width:80%;max-width:120px;filter:drop-shadow(0 0 10px rgba(0,255,255,0.55))">
          <!-- Head -->
          <ellipse cx="40" cy="32" rx="20" ry="24" fill="#0d1a2a" stroke="#00ffff" stroke-width="1.2"/>
          <!-- Eyes — glowing cyan slits -->
          <ellipse cx="31" cy="30" rx="5" ry="2.5" fill="#00ffff" opacity="0.9"/>
          <ellipse cx="49" cy="30" rx="5" ry="2.5" fill="#00ffff" opacity="0.9"/>
          <!-- Pupil centres -->
          <circle cx="31" cy="30" r="1.5" fill="#001a2a"/>
          <circle cx="49" cy="30" r="1.5" fill="#001a2a"/>
          <!-- Anunnaki crown/headband -->
          <rect x="20" y="10" width="40" height="5" rx="2" fill="none" stroke="#b8860b" stroke-width="1"/>
          <circle cx="40" cy="12" r="3.5" fill="#b8860b" opacity="0.9"/>
          <circle cx="28" cy="12" r="2" fill="#b8860b" opacity="0.6"/>
          <circle cx="52" cy="12" r="2" fill="#b8860b" opacity="0.6"/>
          <!-- Neck -->
          <rect x="34" y="56" width="12" height="12" rx="2" fill="#0d1a2a" stroke="#00ffff" stroke-width="0.8"/>
          <!-- Shoulders -->
          <path d="M14,90 Q14,68 40,68 Q66,68 66,90 L66,120 L14,120 Z" fill="#0d1a2a" stroke="#00ffff" stroke-width="1"/>
          <!-- Chest circuit lines -->
          <line x1="30" y1="80" x2="50" y2="80" stroke="#00ffff" stroke-width="0.7" opacity="0.5"/>
          <line x1="35" y1="88" x2="45" y2="88" stroke="#00ffff" stroke-width="0.7" opacity="0.5"/>
          <!-- Face markings — Annunaki glyphs -->
          <line x1="36" y1="36" x2="44" y2="36" stroke="#b8860b" stroke-width="0.8" opacity="0.7"/>
          <circle cx="40" cy="22" r="2.5" fill="none" stroke="#00ffff" stroke-width="0.7" opacity="0.5"/>
          <!-- Scanline flicker hint -->
          <rect x="0" y="0" width="80" height="120" fill="url(#cin-scan)" opacity="0.08"/>
          <defs>
            <pattern id="cin-scan" x="0" y="0" width="80" height="4" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="80" height="2" fill="#000"/>
              <rect x="0" y="2" width="80" height="2" fill="transparent"/>
            </pattern>
          </defs>
        </svg>
        <div style="color:#00ffff;font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;margin-top:4px;opacity:0.7;text-transform:uppercase;">A.I.D.A.</div>
      `;

      // ── Text content area (right side) ──
      const textArea = document.createElement('div');
      textArea.style.cssText = [
        'flex:1 1 auto', 'display:flex', 'flex-direction:column', 'justify-content:center',
        'gap:12px', 'padding:0 6% 0 4%', 'box-sizing:border-box', 'position:relative'
      ].join(';');

      // Speaker name badge
      const speakerEl = document.createElement('div');
      speakerEl.style.cssText = [
        'color:#00ffff', 'font-family:Bangers,cursive', 'font-size:clamp(15px,3vw,24px)',
        'letter-spacing:4px', 'text-transform:uppercase',
        'text-shadow:0 0 12px rgba(0,255,255,0.9),0 0 24px rgba(0,255,255,0.5)',
        'border-bottom:1px solid rgba(0,255,255,0.35)', 'padding-bottom:6px',
        'width:100%', 'text-align:left'
      ].join(';');
      speakerEl.textContent = `◈ ${speakerName}`;

      // Dialogue text container with typewriter effect — enlarged for readability
      const textEl = document.createElement('div');
      textEl.style.cssText = [
        'color:#E8D5A3', 'font-family:Courier New,monospace',
        'font-size:clamp(15px,2.8vw,22px)', 'line-height:1.8',
        'width:100%', 'text-align:left',
        'text-shadow:0 0 6px rgba(0,255,255,0.15)'
      ].join(';');
      textEl.textContent = '';

      // "Tap to continue" hint
      const tapHint = document.createElement('div');
      tapHint.style.cssText = [
        'color:rgba(201,162,39,0.7)', 'font-family:Courier New,monospace',
        'font-size:clamp(10px,1.6vw,13px)', 'letter-spacing:2px',
        'position:absolute', 'bottom:8%', 'right:0',
        'animation:cinematicTapPulse 1.4s ease-in-out infinite'
      ].join(';');
      tapHint.textContent = '▶  TAP TO CONTINUE';
      tapHint.style.opacity = '0';

      textArea.appendChild(speakerEl);
      textArea.appendChild(textEl);
      textArea.appendChild(tapHint);

      centreArea.appendChild(portraitPanel);
      centreArea.appendChild(textArea);

      // Scanline overlay for CRT feel
      const scanline = document.createElement('div');
      scanline.style.cssText = [
        'position:absolute', 'top:0', 'left:0', 'width:100%', 'height:100%',
        'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)',
        'pointer-events:none', 'z-index:1'
      ].join(';');

      overlay.appendChild(topBar);
      overlay.appendChild(centreArea);
      overlay.appendChild(bottomBar);
      overlay.appendChild(scanline);
      document.body.appendChild(overlay);

      // Typewriter effect
      let charIdx = 0;
      let typewriterDone = false;
      const typeSpeed = 30; // ms per char
      const typeTimer = setInterval(() => {
        if (charIdx < text.length) {
          textEl.textContent += text[charIdx];
          charIdx++;
        } else {
          clearInterval(typeTimer);
          typewriterDone = true;
          tapHint.style.opacity = '1';
          tapHint.style.transition = 'opacity 0.5s';
        }
      }, typeSpeed);

      let closed = false;
      function closeCinematic() {
        if (closed) return;
        closed = true;
        clearInterval(typeTimer);
        overlay.style.animation = 'cinematicFadeOut 0.4s ease-in forwards';
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          window._suppressAidaBubbles = false;
          if (wasGameActive && typeof setGamePaused === 'function') setGamePaused(false);
          if (onClose) onClose();
        }, 380);
      }

      // Clicking/tapping: if typewriter still running — skip to end; else close
      overlay.addEventListener('click', () => {
        if (!typewriterDone) {
          clearInterval(typeTimer);
          textEl.textContent = text;
          typewriterDone = true;
          tapHint.style.opacity = '1';
          tapHint.style.transition = 'opacity 0.5s';
        } else {
          closeCinematic();
        }
      });

      // Safety: auto-close after 18 s
      setTimeout(closeCinematic, 18000);
    }
    window.showCinematicDialogue = showCinematicDialogue;

    function showQuestHall() {
      // Guard: Quest Hall must be built (level > 0) before it can be entered
      var _qmData = saveData.campBuildings && saveData.campBuildings.questMission;
      if (_qmData && _qmData.level === 0) {
        // Building not yet built — show build overlay if available, otherwise a message
        if (_qmData.unlocked && typeof window._campShowBuildOverlay === 'function') {
          var _qmName = (CAMP_BUILDINGS.questMission && CAMP_BUILDINGS.questMission.name) || 'Quest Hall';
          window._campShowBuildOverlay('questMission', _qmName);
        } else if (typeof showStatusMessage === 'function') {
          showStatusMessage('🔨 Build the Quest Hall first!', 2000);
        }
        return;
      }
      // Pause game if active
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      // Clear quest notification for the main building
      if (!saveData.storyQuests.questNotifications) {
        saveData.storyQuests.questNotifications = {};
      }
      saveData.storyQuests.questNotifications.questMission = false;
      saveSaveData();
      
      // Activate new quest chain: quest_dailyRoutine after first death
      // Don't activate new quests if a building is pending construction
      if (
        !saveData.tutorialQuests.pendingBuildQuest &&
        saveData.tutorialQuests.firstDeathShown &&
        isQuestClaimed('firstRunDeath') &&
        !saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('quest_dailyRoutine') &&
        !saveData.tutorialQuests.readyToClaim.includes('quest_dailyRoutine')
      ) {
        // Start daily routine quest
        if (checkQuestConditions('quest_dailyRoutine')) {
          saveData.tutorialQuests.currentQuest = 'quest_dailyRoutine';
          saveSaveData();
          showComicInfoBox(
            '⏰ DAILY ROUTINE',
            `<div style="text-align: left; padding: 10px;">
              <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">⏰ QUEST: DAILY ROUTINE</p>
              <p style="line-height: 1.8; margin-bottom: 10px;">
                Welcome back, Droplet! It's time to prove you can survive out there.<br><br>
                <b>YOUR MISSION:</b> Survive for <b>2 minutes</b> in a single run.<br><br>
                When you complete this quest, you'll unlock the <b>Account Building</b> where you can track your daily rewards and stats!<br>
                Plus, you'll get a <b>Free Spin</b> on the Spin Wheel!
              </p>
              <p style="font-size: 13px; color: #FFD700;">Reward: +100 Gold · +1 Skill Point · Account Building · 1 Free Spin</p>
            </div>`,
            'ACCEPT MISSION!'
          );
        }
      } else if (
        // Legacy quest activation: for existing saves that already have firstRunDeath claimed
        // and need the old forge unlock chain
        !saveData.tutorialQuests.pendingBuildQuest &&
        saveData.tutorialQuests.firstDeathShown &&
        isQuestClaimed('firstRunDeath') &&
        !saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('quest_dailyRoutine') &&
        !isQuestClaimed('questForge0_unlock') &&
        !saveData.tutorialQuests.readyToClaim.includes('questForge0_unlock') &&
        !isQuestClaimed('quest1_kill3') &&
        // Check if this save was on the old chain (has old quests completed)
        (isQuestClaimed('questForge0_unlock') || isQuestClaimed('questForge0b_craftTools'))
      ) {
        if (checkQuestConditions('quest1_kill3') && !isQuestClaimed('quest1_kill3')) {
          saveData.tutorialQuests.currentQuest = 'quest1_kill3';
          saveSaveData();
          showComicInfoBox(
            '📋 MISSION BRIEFING',
            `<div style="text-align: left; padding: 10px;">
              <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">🎯 QUEST: COMBAT READINESS</p>
              <p style="line-height: 1.8; margin-bottom: 10px;">
                Welcome back, Droplet. You survived your first encounter — now it's time to prove yourself.<br><br>
                <b>YOUR MISSION:</b> Head back out and eliminate <b>3 enemies</b> in a single run.
              </p>
              <p style="font-size: 13px; color: #FFD700;">Reward: +50 Gold · +3 Skill Points</p>
            </div>`,
            'ACCEPT MISSION!'
          );
        }
      }
      
      // Auto-complete quest_newFriend when visiting Quest Hall with the egg
      if (
        saveData.tutorialQuests.currentQuest === 'quest_newFriend' &&
        isQuestClaimed('quest_eggHunt') &&
        !saveData.tutorialQuests.readyToClaim.includes('quest_newFriend')
      ) {
        progressTutorialQuest('quest_newFriend', true);
      }
      
      // Auto-complete quest_firstBlood when visiting Quest Hall with sufficient resources.
      // The quest deducts 30w+30s on claim, but we trigger readyToClaim at 20 to avoid
      // softlocking players who spend exactly the quest_harvester reward (20 each) and
      // gather a few more.  If a player has only 20 the deduct caps at 0 (Math.max(0,...)),
      // so they still progress without losing resources they don't have.
      if (
        saveData.tutorialQuests.currentQuest === 'quest_firstBlood' &&
        !saveData.tutorialQuests.readyToClaim.includes('quest_firstBlood')
      ) {
        const r = saveData.resources || {};
        // Accept 20+ so players who collected the quest_harvester reward (20 each) can
        // claim after one more small gathering session rather than being softlocked.
        if ((r.wood || 0) >= 20 && (r.stone || 0) >= 20) {
          progressTutorialQuest('quest_firstBlood', true);
        }
      }
      
      // Auto-complete quest_buildSongspire when player has 2+ Wood and 2+ Stone
      if (
        saveData.tutorialQuests.currentQuest === 'quest_buildSongspire' &&
        !saveData.tutorialQuests.readyToClaim.includes('quest_buildSongspire')
      ) {
        const r2 = saveData.resources || {};
        if ((r2.wood || 0) >= 2 && (r2.stone || 0) >= 2) {
          progressTutorialQuest('quest_buildSongspire', true);
        }
      }
      
      // Auto-complete quest_gainingStats when visiting Quest Hall with 300+ total kills
      if (
        saveData.tutorialQuests.currentQuest === 'quest_gainingStats' &&
        !saveData.tutorialQuests.readyToClaim.includes('quest_gainingStats') &&
        (saveData.totalKills || 0) >= 300
      ) {
        progressTutorialQuest('quest_gainingStats', true);
      }

      // Auto-complete quest_craftAllTools when the player has bought all 6 gathering tools
      if (
        saveData.tutorialQuests.currentQuest === 'quest_craftAllTools' &&
        !saveData.tutorialQuests.readyToClaim.includes('quest_craftAllTools') &&
        window.GameHarvesting
      ) {
        const _ownedTools = window.GameHarvesting.getTools() || {};
        const _allToolIds = ['axe', 'sledgehammer', 'pickaxe', 'magicTool', 'knife', 'berryScoop'];
        const _hasAll = _allToolIds.every(id => !!_ownedTools[id]);
        if (_hasAll) {
          progressTutorialQuest('quest_craftAllTools', true);
        }
      }
      
      // Fallback: if questForge0_unlock is the active quest but not yet in readyToClaim
      // (can happen when activated via _completeBuild after building questMission),
      // add it to readyToClaim so the player can claim it at the Quest Hall.
      if (
        saveData.tutorialQuests.currentQuest === 'questForge0_unlock' &&
        !isQuestClaimed('questForge0_unlock') &&
        !saveData.tutorialQuests.readyToClaim.includes('questForge0_unlock')
      ) {
        saveData.tutorialQuests.readyToClaim.push('questForge0_unlock');
        saveSaveData();
      }

      // Fallback: auto-activate quest2 if quest1 is claimed but quest2 hasn't started
      // Also check if quest2 is active but skills are already bought
      ensureQuest2Activated();
      saveSaveData();
      
      // Quest ID to display name mapping
      const questNames = {
        'firstRun': 'Quest 1: Kill One Enemy',
        'useSkillTree': 'Quest 2: Activate and Claim Two Skills',
        'unlockForge': 'Quest 3: Unlock Progression Upgrades',
        'unlockArmory': 'Quest 4: Unlock Armory',
        'unlockRecycle': 'Quest 5: Unlock Trash & Recycle',
        'unlockCompanionHouse': 'Quest 6: Unlock Companion House',
        'unlockTrainingHall': 'Quest 7: Unlock Training Hall',
        'survive60Seconds': 'Quest 8: Survive 60 Seconds',
        'kill50Enemies': 'Quest 9: Kill 50 Enemies',
        'upgradeAnyBuildingTo3': 'Quest 10: Upgrade Building to Level 3'
      };
      
      // ── 3-Tab Quest Hall UI ────────────────────────────────────────────────
      const overlay = document.createElement('div');
      overlay.id = 'quest-hall-overlay';
      overlay.setAttribute('data-quest-hall-overlay', 'true');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:150;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease-out;overflow-y:auto;';

      const panel = document.createElement('div');
      panel.style.cssText = 'background:linear-gradient(160deg,#0d0015 0%,#07000e 50%,#0a0510 100%);border:3px solid #C9A227;border-radius:8px;padding:0;max-width:92vw;width:620px;max-height:88vh;display:flex;flex-direction:column;box-sizing:border-box;animation:popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.1);box-shadow:0 0 40px rgba(201,162,39,0.5),0 0 80px rgba(0,200,100,0.08);position:relative;';

      // Header
      const hdr = document.createElement('div');
      hdr.style.cssText = 'padding:16px 20px 0;border-bottom:2px solid rgba(201,162,39,0.3);';
      hdr.innerHTML = '<div style="font-family:\'Bangers\',cursive;font-size:26px;color:#C9A227;text-shadow:0 0 15px rgba(201,162,39,0.8);letter-spacing:3px;text-align:center;margin-bottom:12px;">📜 QUEST HALL</div>';

      // Tab bar
      const tabBar = document.createElement('div');
      tabBar.style.cssText = 'display:flex;gap:0;';
      const tabDefs = [
        { id: 'story',    label: '📖 Story Quests',  color: '#C9A227' },
        { id: 'challenges', label: '⚔️ Challenges',  color: '#8855ff' },
        { id: 'achievements', label: '🏆 Achievements', color: '#aa44ff' }
      ];
      let _activeTab = window._questHallDefaultTab || 'story';
      window._questHallDefaultTab = null; // consume once

      function _renderTabContent() {
        tabBody.innerHTML = '';
        tabDefs.forEach(t => {
          const btn = tabBar.querySelector('[data-tab="' + t.id + '"]');
          if (btn) {
            btn.style.borderBottom = t.id === _activeTab ? '3px solid ' + t.color : '3px solid transparent';
            btn.style.color = t.id === _activeTab ? t.color : '#666';
          }
        });
        if (_activeTab === 'story')        _renderStoryTab(tabBody);
        else if (_activeTab === 'challenges') _renderChallengesTab(tabBody);
        else if (_activeTab === 'achievements') _renderAchievementsTab(tabBody);
      }

      tabDefs.forEach(t => {
        const btn = document.createElement('button');
        btn.setAttribute('data-tab', t.id);
        btn.style.cssText = 'flex:1;background:none;border:none;border-bottom:3px solid transparent;color:#666;font-family:\'Bangers\',cursive;font-size:14px;letter-spacing:1px;padding:8px 4px;cursor:pointer;transition:color 0.2s,border-color 0.2s;';
        btn.textContent = t.label;
        btn.onclick = () => { _activeTab = t.id; _renderTabContent(); };
        tabBar.appendChild(btn);
      });
      hdr.appendChild(tabBar);
      panel.appendChild(hdr);

      const tabBody = document.createElement('div');
      tabBody.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;';
      panel.appendChild(tabBody);

      // ── Story Quests Tab ──────────────────────────────────────────────────
      function _renderStoryTab(container) {
        if (!saveData.tutorialQuests.readyToClaim) saveData.tutorialQuests.readyToClaim = [];
        if (!saveData.tutorialQuests.completedQuests) saveData.tutorialQuests.completedQuests = [];

        let html = '';
        // Ready to claim
        if (saveData.tutorialQuests.readyToClaim.length > 0) {
          html += '<div style="font-family:\'Bangers\',cursive;font-size:17px;color:#C9A227;letter-spacing:2px;margin-bottom:10px;">✨ READY TO CLAIM</div>';
          saveData.tutorialQuests.readyToClaim.forEach(questId => {
            const quest = TUTORIAL_QUESTS[questId];
            if (!quest) return;
            html += `<div style="background:rgba(201,162,39,0.08);border:1px solid #C9A227;border-radius:6px;padding:12px;margin-bottom:10px;">
              <div style="font-family:'Bangers',cursive;font-size:16px;color:#C9A227;margin-bottom:4px;">${quest.name}</div>
              <div style="font-size:12px;color:#aaa;margin-bottom:10px;">${quest.description}</div>
              <button class="btn quest-claim-btn" data-qid="${questId}" style="font-size:14px;padding:7px 18px;background:linear-gradient(to bottom,#C9A227,#8B6914);color:#000;border:2px solid #000;letter-spacing:1px;cursor:pointer;font-weight:bold;border-radius:4px;">🎁 Claim Reward</button>
            </div>`;
          });
        } else if (saveData.tutorialQuests.pendingBuildQuest && saveData.tutorialQuests.pendingBuildBuilding) {
          const _pbDef = typeof CAMP_BUILDINGS !== 'undefined' ? CAMP_BUILDINGS[saveData.tutorialQuests.pendingBuildBuilding] : null;
          html += `<div style="font-size:14px;color:#00FF66;margin-bottom:16px;">🔨 Build the <b>${_pbDef ? _pbDef.name : 'unlocked building'}</b> to continue!</div>`;
        } else {
          html += '<div style="font-size:13px;color:#555;margin-bottom:16px;letter-spacing:1px;">No quests ready to claim. Complete your active quest!</div>';
        }

        // Active quest
        const currentQuest = getCurrentQuest();
        if (currentQuest) {
          html += `<div style="font-family:'Bangers',cursive;font-size:17px;color:#00FF66;letter-spacing:2px;margin-bottom:10px;">📍 ACTIVE QUEST</div>
            <div style="background:rgba(0,255,100,0.06);border:1px solid rgba(0,255,100,0.4);border-radius:6px;padding:12px;margin-bottom:16px;">
              <div style="font-family:'Bangers',cursive;font-size:15px;color:#00FF66;margin-bottom:4px;">${currentQuest.name}</div>
              <div style="font-size:12px;color:#aaa;margin-bottom:4px;">${currentQuest.description}</div>
              <div style="font-size:11px;color:#666;letter-spacing:1px;">🎯 ${currentQuest.objectives}</div>
            </div>`;
        } else if (saveData.tutorialQuests.pendingBuildQuest && saveData.tutorialQuests.pendingBuildBuilding) {
          const _bDef = typeof CAMP_BUILDINGS !== 'undefined' ? CAMP_BUILDINGS[saveData.tutorialQuests.pendingBuildBuilding] : null;
          html += `<div style="font-family:'Bangers',cursive;font-size:17px;color:#FF9933;letter-spacing:2px;margin-bottom:10px;">🔨 BUILD REQUIRED</div>
            <div style="background:rgba(255,153,51,0.08);border:1px solid rgba(255,153,51,0.5);border-radius:6px;padding:12px;margin-bottom:16px;">
              <div style="font-size:13px;color:#aaa;">Walk to the <b>${_bDef ? _bDef.name : 'building'}</b> in camp and build it.</div>
            </div>`;
        }

        html += `<div style="font-size:11px;color:#444;text-align:center;letter-spacing:2px;margin-top:8px;">Completed: ${saveData.tutorialQuests.completedQuests.length} / ${Object.keys(TUTORIAL_QUESTS).length}</div>`;

        // Start run / close buttons
        const _isSandboxMode = window._engine2SandboxMode || (window.location.pathname && window.location.pathname.includes('sandbox'));
        const hasClaimable = saveData.tutorialQuests.readyToClaim.length > 0;
        html += `<div style="display:flex;gap:10px;margin-top:18px;justify-content:center;">
          <button class="btn start-run-btn" ${hasClaimable ? 'disabled' : ''} style="font-size:15px;padding:10px 28px;background:${hasClaimable ? '#333' : 'linear-gradient(to bottom,#1a5c2a,#0d3316)'};color:${hasClaimable ? '#555' : '#FFF'};border:2px solid #C9A227;letter-spacing:2px;cursor:${hasClaimable ? 'not-allowed' : 'pointer'};border-radius:4px;">
            ${hasClaimable ? '📜 Claim Quest First' : '▶ Start Run'}
          </button>
          <button class="btn quest-hall-close-btn" style="font-size:13px;padding:10px 22px;background:rgba(30,30,30,0.9);color:#888;border:1px solid rgba(201,162,39,0.3);letter-spacing:1px;cursor:pointer;border-radius:4px;">Close</button>
        </div>`;

        container.innerHTML = html;

        // Claim button listeners
        container.querySelectorAll('.quest-claim-btn').forEach(btn => {
          btn.addEventListener('click', function() {
            const questId = this.getAttribute('data-qid');
            const questDef = TUTORIAL_QUESTS[questId];
            if (questDef && questDef.deductResources) {
              const r = saveData.resources || {};
              for (const [res, amt] of Object.entries(questDef.deductResources)) {
                if ((r[res] || 0) < amt) {
                  if (typeof showStatusMessage === 'function') showStatusMessage(`❌ Not enough ${res}! Need ${amt}.`, 3000);
                  return;
                }
              }
            }
            const overlayEl = document.body.querySelector('[data-quest-hall-overlay]');
            if (overlayEl) document.body.removeChild(overlayEl);
            claimTutorialQuest(questId);
          });
        });

        // Start run button
        const srBtn = container.querySelector('.start-run-btn');
        if (srBtn && !hasClaimable) {
          srBtn.onclick = () => {
            document.body.removeChild(overlay);
            if (_isSandboxMode) window.location.reload();
            else window.location.href = 'sandbox.html';
          };
        }
        const cBtn = container.querySelector('.quest-hall-close-btn');
        if (cBtn) cBtn.onclick = questHallClose;
      }

      // ── Challenges Tab ────────────────────────────────────────────────────
      // Recurring milestones tracked against persistent saveData fields
      const QUEST_HALL_CHALLENGES = [
        { id: 'ch_kills_100',  icon: '⚔️',  label: 'Slayer\'s Oath',       desc: 'Kill 100 enemies across all runs.',              progress: () => Math.min(saveData.totalKills || 0, 100),  target: 100,  reward: { xp: 50,  gold: 150 } },
        { id: 'ch_kills_500',  icon: '💀',  label: 'Mass Annihilation',     desc: 'Kill 500 enemies across all runs.',              progress: () => Math.min(saveData.totalKills || 0, 500),  target: 500,  reward: { xp: 120, gold: 400 } },
        { id: 'ch_kills_1000', icon: '🔥',  label: 'Legion\'s Bane',        desc: 'Kill 1,000 enemies across all runs.',            progress: () => Math.min(saveData.totalKills || 0, 1000), target: 1000, reward: { xp: 250, gold: 800 } },
        { id: 'ch_survive_3',  icon: '⏱️', label: 'Survivor\'s Trial',     desc: 'Survive 3 minutes in a single run.',            progress: () => Math.min(Math.floor((saveData.bestTime || 0) / 60), 3), target: 3, reward: { xp: 60,  gold: 200 } },
        { id: 'ch_survive_5',  icon: '⌛',  label: 'Iron Will',             desc: 'Survive 5 minutes in a single run.',            progress: () => Math.min(Math.floor((saveData.bestTime || 0) / 60), 5), target: 5, reward: { xp: 130, gold: 450 } },
        { id: 'ch_runs_5',     icon: '🏃',  label: 'Persistent Wanderer',   desc: 'Complete 5 runs.',                              progress: () => Math.min(saveData.totalRuns || 0, 5),     target: 5,    reward: { xp: 75,  gold: 250 } },
        { id: 'ch_runs_10',    icon: '🗺️', label: 'World Traveller',       desc: 'Complete 10 runs.',                             progress: () => Math.min(saveData.totalRuns || 0, 10),    target: 10,   reward: { xp: 150, gold: 500 } },
        { id: 'ch_quests_5',   icon: '📜',  label: 'Quest Addict',          desc: 'Complete 5 story quests.',                      progress: () => Math.min((saveData.tutorialQuests && saveData.tutorialQuests.completedQuests ? saveData.tutorialQuests.completedQuests.length : 0), 5), target: 5, reward: { xp: 80, gold: 300 } }
      ];

      function _renderChallengesTab(container) {
        if (!saveData.questHallChallenges) saveData.questHallChallenges = {};
        let html = '<div style="font-family:\'Bangers\',cursive;font-size:17px;color:#8855ff;letter-spacing:2px;margin-bottom:4px;">⚔️ RECURRING MILESTONES</div>';
        html += '<div style="font-size:11px;color:#555;margin-bottom:14px;letter-spacing:1px;">Complete milestones to earn Account XP and Gold.</div>';

        QUEST_HALL_CHALLENGES.forEach(ch => {
          const prog = ch.progress();
          const done = prog >= ch.target;
          const claimed = !!saveData.questHallChallenges[ch.id];
          const pct = Math.min(100, Math.floor((prog / ch.target) * 100));
          const borderCol = claimed ? '#33aa33' : done ? '#C9A227' : 'rgba(100,80,160,0.3)';
          const bgCol = claimed ? 'rgba(0,100,0,0.12)' : done ? 'linear-gradient(135deg,rgba(201,162,39,0.12),rgba(20,10,40,0.7))' : 'rgba(10,5,25,0.6)';
          html += `<div style="background:${bgCol};border:1px solid ${borderCol};border-radius:6px;padding:12px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="font-family:'Bangers',cursive;font-size:15px;color:${claimed ? '#33aa33' : done ? '#C9A227' : '#9977cc'};letter-spacing:1px;">${ch.icon} ${ch.label}</div>
              <div style="font-size:10px;color:#555;">+${ch.reward.xp} XP · +${ch.reward.gold} 💰</div>
            </div>
            <div style="font-size:11px;color:#888;margin-bottom:7px;">${ch.desc}</div>
            <div style="background:rgba(0,0,0,0.5);border-radius:4px;height:8px;overflow:hidden;margin-bottom:7px;">
              <div style="width:${pct}%;height:100%;background:${claimed ? '#33aa33' : done ? 'linear-gradient(90deg,#C9A227,#8855ff)' : 'rgba(136,85,255,0.3)'};transition:width 0.5s;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-size:10px;color:#666;">${prog.toLocaleString()} / ${ch.target.toLocaleString()}</div>
              ${claimed ? '<div style="font-size:11px;color:#33aa33;font-weight:bold;">✅ CLAIMED</div>'
                : done ? `<button class="ch-claim-btn" data-chid="${ch.id}" style="font-size:11px;padding:5px 12px;background:linear-gradient(135deg,#3a2800,#1a1000);color:#C9A227;border:1px solid #C9A227;border-radius:4px;cursor:pointer;letter-spacing:1px;text-shadow:0 0 8px rgba(201,162,39,0.6);">🏅 Claim</button>`
                : '<div style="font-size:10px;color:#444;">In Progress</div>'}
            </div>
          </div>`;
        });

        container.innerHTML = html;
        container.querySelectorAll('.ch-claim-btn').forEach(btn => {
          btn.addEventListener('click', function() {
            const chId = this.getAttribute('data-chid');
            const ch = QUEST_HALL_CHALLENGES.find(c => c.id === chId);
            if (!ch || saveData.questHallChallenges[chId]) return;
            saveData.questHallChallenges[chId] = true;
            // Grant rewards
            saveData.gold = (saveData.gold || 0) + ch.reward.gold;
            if (window.GameAccount && typeof window.GameAccount.addXP === 'function') {
              window.GameAccount.addXP(ch.reward.xp, 'Challenge: ' + ch.label, saveData);
            } else if (typeof addAccountXP === 'function') {
              addAccountXP(ch.reward.xp);
            }
            if (typeof saveSaveData === 'function') saveSaveData();
            if (typeof updateGoldDisplays === 'function') updateGoldDisplays();
            if (typeof showStatusMessage === 'function') showStatusMessage(`🏅 ${ch.label} complete! +${ch.reward.xp} XP, +${ch.reward.gold} 💰`, 3000);
            _renderTabContent();
          });
        });
      }

      // ── Achievements Tab ──────────────────────────────────────────────────
      const QUEST_HALL_ACHIEVEMENTS = [
        { id: 'ach_first_blood',  icon: '🩸', tier: 'common',    label: 'First Blood',         desc: 'Kill your first enemy.',                   check: () => (saveData.totalKills || 0) >= 1,    xp: 25,  freeSpins: 1 },
        { id: 'ach_10_kills',     icon: '⚔️', tier: 'uncommon',  label: 'Blade Initiate',      desc: 'Kill 10 enemies.',                          check: () => (saveData.totalKills || 0) >= 10,   xp: 50,  freeSpins: 1 },
        { id: 'ach_100_kills',    icon: '💀', tier: 'rare',      label: 'Century of Blood',    desc: 'Kill 100 enemies.',                         check: () => (saveData.totalKills || 0) >= 100,  xp: 150, freeSpins: 2 },
        { id: 'ach_500_kills',    icon: '🔥', tier: 'epic',      label: 'Annihilator',         desc: 'Kill 500 enemies.',                         check: () => (saveData.totalKills || 0) >= 500,  xp: 300, freeSpins: 3 },
        { id: 'ach_1000_kills',   icon: '⚡', tier: 'legendary', label: '1000 Kills',          desc: 'Kill 1,000 enemies total.',                 check: () => (saveData.totalKills || 0) >= 1000, xp: 600, freeSpins: 5 },
        { id: 'ach_first_run',    icon: '🏃', tier: 'common',    label: 'Into the Unknown',    desc: 'Complete your first run.',                  check: () => (saveData.totalRuns || 0) >= 1,     xp: 30,  freeSpins: 1 },
        { id: 'ach_5_runs',       icon: '🗺️', tier: 'uncommon', label: 'Seasoned Wanderer',   desc: 'Survive 5 runs.',                           check: () => (saveData.totalRuns || 0) >= 5,     xp: 80,  freeSpins: 2 },
        { id: 'ach_10_runs',      icon: '🌍', tier: 'rare',      label: 'Played 10 Times',     desc: 'Complete 10 runs.',                         check: () => (saveData.totalRuns || 0) >= 10,    xp: 180, freeSpins: 3 },
        { id: 'ach_2min_run',     icon: '⏱️', tier: 'common',   label: 'Survivor\'s Minute',  desc: 'Survive at least 2 minutes in one run.',    check: () => (saveData.bestTime || 0) >= 120,    xp: 40,  freeSpins: 1 },
        { id: 'ach_5min_run',     icon: '⌛', tier: 'uncommon',  label: 'Time Lord',           desc: 'Survive 5 minutes in a single run.',        check: () => (saveData.bestTime || 0) >= 300,    xp: 120, freeSpins: 2 },
        { id: 'ach_quest_5',      icon: '📜', tier: 'uncommon',  label: 'Quest Master',        desc: 'Complete 5 story quests.',                  check: () => (saveData.tutorialQuests && saveData.tutorialQuests.completedQuests ? saveData.tutorialQuests.completedQuests.length : 0) >= 5, xp: 100, freeSpins: 2 }
      ];

      const TIER_COLORS = { common: '#aaaaaa', uncommon: '#55cc55', rare: '#6655dd', epic: '#aa44ff', legendary: '#ffaa00', mythic: '#ff4444' };

      function _renderAchievementsTab(container) {
        if (!saveData.questHallAchievements) saveData.questHallAchievements = {};
        let html = '<div style="font-family:\'Bangers\',cursive;font-size:17px;color:#aa44ff;letter-spacing:2px;margin-bottom:4px;">🏆 TIERED ACHIEVEMENTS</div>';
        html += '<div style="font-size:11px;color:#555;margin-bottom:14px;letter-spacing:1px;">Unlock achievements to earn Account XP and 🎰 Slot Tokens.</div>';

        QUEST_HALL_ACHIEVEMENTS.forEach(ach => {
          const met = ach.check();
          const claimed = !!saveData.questHallAchievements[ach.id];
          const col = TIER_COLORS[ach.tier] || '#aaaaaa';
          const bgCol = claimed ? 'rgba(0,80,0,0.15)' : met ? 'rgba(170,68,255,0.1)' : 'rgba(10,0,25,0.5)';
          html += `<div style="background:${bgCol};border:1px solid ${claimed ? '#33aa33' : met ? col : 'rgba(80,60,120,0.4)'};border-radius:6px;padding:11px 14px;margin-bottom:9px;display:flex;align-items:center;gap:12px;">
            <div style="font-size:26px;flex-shrink:0;">${ach.icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-family:'Bangers',cursive;font-size:15px;color:${claimed ? '#33aa33' : met ? col : '#555'};letter-spacing:1px;margin-bottom:2px;">${ach.label} <span style="font-size:10px;opacity:0.7;">[${ach.tier.toUpperCase()}]</span></div>
              <div style="font-size:11px;color:#777;margin-bottom:4px;">${ach.desc}</div>
              <div style="font-size:10px;color:#555;">+${ach.xp} Account XP · ${ach.freeSpins}🎰 Slot Token${ach.freeSpins > 1 ? 's' : ''}</div>
            </div>
            <div style="flex-shrink:0;">
              ${claimed ? '<div style="font-size:13px;color:#33aa33;font-weight:bold;">✅</div>'
                : met ? `<button class="ach-claim-btn" data-achid="${ach.id}" style="font-size:11px;padding:6px 12px;background:linear-gradient(to bottom,#6600cc,#3d0080);color:#cc88ff;border:1px solid ${col};border-radius:4px;cursor:pointer;letter-spacing:1px;white-space:nowrap;">🏆 Claim</button>`
                : '<div style="font-size:11px;color:#333;">Locked</div>'}
            </div>
          </div>`;
        });

        container.innerHTML = html;
        container.querySelectorAll('.ach-claim-btn').forEach(btn => {
          btn.addEventListener('click', function() {
            const achId = this.getAttribute('data-achid');
            const ach = QUEST_HALL_ACHIEVEMENTS.find(a => a.id === achId);
            if (!ach || saveData.questHallAchievements[achId] || !ach.check()) return;
            saveData.questHallAchievements[achId] = true;
            // Grant Account XP
            if (window.GameAccount && typeof window.GameAccount.addXP === 'function') {
              window.GameAccount.addXP(ach.xp, 'Achievement: ' + ach.label, saveData);
            } else if (typeof addAccountXP === 'function') {
              addAccountXP(ach.xp);
            }
            // Grant Slot Tokens (freeSpins)
            saveData.freeSpins = (saveData.freeSpins || 0) + ach.freeSpins;
            if (typeof saveSaveData === 'function') saveSaveData();
            if (typeof showStatusMessage === 'function') showStatusMessage(`🏆 ${ach.label}! +${ach.xp} XP · +${ach.freeSpins} 🎰`, 3500);
            // Rarity reveal effect
            if (window.spawnRarityEffects) window.spawnRarityEffects(this, ach.tier);
            _renderTabContent();
          });
        });
      }

      // ── Close handler ─────────────────────────────────────────────────────
      const questHallClose = () => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (wasGameActive) setGamePaused(false);
        updateCampScreen();
      };

      // X close button
      const xBtn = document.createElement('button');
      xBtn.className = 'overlay-close-x';
      xBtn.innerHTML = '✕';
      xBtn.title = 'Close';
      xBtn.onclick = questHallClose;
      panel.appendChild(xBtn);

      overlay.appendChild(panel);
      overlay.addEventListener('click', e => { if (e.target === overlay) questHallClose(); });
      document.body.appendChild(overlay);

      // Initial render
      _renderTabContent();
    }

    // --- ACCOUNT LEVEL SYSTEM ---
    // Account XP: 1 XP per kill (across all runs) + 50 XP per quest completed
    // Level threshold = level * 100 (e.g., level 1 needs 100xp, level 2 needs 200xp, etc.)
    function addAccountXP(amount) {
      if (!saveData.accountXP) saveData.accountXP = 0;
      if (!saveData.accountLevel) saveData.accountLevel = 1;
      saveData.accountXP += amount;
      // Accumulate run XP for end-of-run screen
      if (window.currentRunStats) {
        window.currentRunStats.xpAccumulated = (window.currentRunStats.xpAccumulated || 0) + amount;
      }
      // Check for level-up
      let leveledUp = false;
      while (saveData.accountXP >= getAccountLevelXPRequired(saveData.accountLevel)) {
        saveData.accountXP -= getAccountLevelXPRequired(saveData.accountLevel);
        saveData.accountLevel++;
        leveledUp = true;
        // Reward on account level-up (rotate between reward types)
        const rewardCycle = (saveData.accountLevel - 1) % 4;
        let rewardLabel = '';
        if (rewardCycle === 0) {
          saveData.unspentAttributePoints = (saveData.unspentAttributePoints || 0) + 1;
          rewardLabel = '+1 Attribute Point';
        } else if (rewardCycle === 1) {
          saveData.skillPoints = (saveData.skillPoints || 0) + 1;
          rewardLabel = '+1 Skill Point';
        } else if (rewardCycle === 2) {
          saveData.trainingPoints = (saveData.trainingPoints || 0) + 1;
          rewardLabel = '+1 Training Point';
        } else {
          saveData.gold = (saveData.gold || 0) + 100;
          rewardLabel = '+100 Gold';
        }
        showAccountLevelUpCurtain(saveData.accountLevel, rewardLabel);
      }
      if (leveledUp) saveSaveData();
      updateAccountLevelDisplay();
    }

    // ── Level-Up Rarity Effects ───────────────────────────────────
    const _LEVEL_RARITY_COLORS = {
      common:    '#aaddff',
      uncommon:  '#55cc55',
      rare:      '#44aaff',
      epic:      '#aa44ff',
      legendary: '#ffaa00',
      mythic:    '#ff4444'
    };

    function _getLevelUpRarity(level) {
      if (level % 25 === 0) return 'mythic';
      if (level % 10 === 0) return 'legendary';
      if (level % 5  === 0) return 'epic';
      return 'common';
    }

    function _spawnLevelUpConfetti(curtain, rarity) {
      const rect = curtain.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const colorMap = {
        common:    ['#ffffff', '#aaddff', '#cccccc', '#ddeeff'],
        uncommon:  ['#55cc55', '#88ff88', '#33aa33', '#aaffaa'],
        rare:      ['#44aaff', '#88ccff', '#2277cc', '#99ddff'],
        epic:      ['#aa44ff', '#cc88ff', '#8822cc', '#dd99ff'],
        legendary: ['#ffaa00', '#ffcc44', '#ff8800', '#ffdd88'],
        mythic:    ['#ff4444', '#ff8800', '#ffff00', '#44ff88', '#4488ff', '#cc44ff']
      };
      const colors = colorMap[rarity] || colorMap.common;
      const isMythic = rarity === 'mythic';
      // Scale confetti count by rarity: common=20 → mythic=80
      const confettiCounts = { common: 20, uncommon: 30, rare: 40, epic: 55, legendary: 70, mythic: 80 };
      const count = confettiCounts[rarity] || 20;
      // Scale spread distance by rarity
      const maxDist = { common: 140, uncommon: 160, rare: 190, epic: 230, legendary: 280, mythic: 340 }[rarity] || 140;

      for (let i = 0; i < count; i++) {
        const el    = document.createElement('div');
        el.className = 'lvlup-confetti' + (isMythic ? ' lvlup-confetti-mythic' : '');
        const angle = Math.random() * Math.PI * 2;
        const dist  = 60 + Math.random() * maxDist;
        const tx    = Math.cos(angle) * dist;
        const ty    = Math.sin(angle) * dist - 40;
        const rot   = Math.floor(Math.random() * 360);
        el.style.left = cx + 'px';
        el.style.top  = cy + 'px';
        if (!isMythic) el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.setProperty('--rot', rot + 'deg');
        el.style.setProperty('--tx',  tx  + 'px');
        el.style.setProperty('--ty',  ty  + 'px');
        document.body.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1400);
      }
    }

    function _spawnLevelUpRays(curtain, rarity) {
      const rect  = curtain.getBoundingClientRect();
      const cx    = rect.left + rect.width  / 2;
      const cy    = rect.top  + rect.height / 2;
      const color = _LEVEL_RARITY_COLORS[rarity] || _LEVEL_RARITY_COLORS.common;
      // More + longer + wider rays for higher rarities
      const rayCounts = { common: 6, uncommon: 8, rare: 10, epic: 12, legendary: 16, mythic: 20 };
      const rayHeights = { common: '140px', uncommon: '180px', rare: '220px', epic: '280px', legendary: '360px', mythic: '480px' };
      const rayWidths  = { common: '2px',   uncommon: '2.5px', rare: '3px',   epic: '4px',   legendary: '5px',   mythic: '7px'   };
      const rayDurs    = { common: '800ms', uncommon: '900ms', rare: '1000ms',epic: '1100ms',legendary: '1300ms',mythic: '1600ms'};
      const rayCount = rayCounts[rarity] || 6;

      for (let i = 0; i < rayCount; i++) {
        const el = document.createElement('div');
        el.className = 'lvlup-ray';
        el.style.left       = (cx - 1.5) + 'px';
        el.style.top        = cy + 'px';
        el.style.background = color;
        el.style.setProperty('--angle', (i * (360 / rayCount)) + 'deg');
        el.style.setProperty('--ray-h',   rayHeights[rarity] || '140px');
        el.style.setProperty('--ray-w',   rayWidths[rarity]  || '2px');
        el.style.setProperty('--ray-dur', rayDurs[rarity]    || '800ms');
        document.body.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1700);
      }
    }

    function _spawnLevelUpScreenFlash(rarity) {
      const color = _LEVEL_RARITY_COLORS[rarity] || _LEVEL_RARITY_COLORS.common;
      const el = document.createElement('div');
      el.className = 'lvlup-screen-flash';
      // Stronger, wider flash for higher rarities
      const innerGlow  = { common: '30px', uncommon: '40px', rare: '50px', epic: '70px', legendary: '90px', mythic: '120px' }[rarity] || '30px';
      const outerGlow  = { common: '60px', uncommon: '80px', rare: '100px',epic: '130px',legendary: '160px',mythic: '200px' }[rarity] || '60px';
      el.style.boxShadow = `inset 0 0 ${innerGlow} ${color}, inset 0 0 ${outerGlow} ${color}`;
      document.body.appendChild(el);
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
    }

    // ── Account Level-Up Curtain Animation ──────────────────────
    // _campFromRun: set by goto-camp-btn handler so curtain waits 3 s after
    // returning from a run rather than firing instantly (cosmetic only—rewards
    // are already saved before this flag is read).
    let _curtainFromRunPending = null; // holds {newLevel,rewardLabel} if waiting
    let _curtainTimer = null;
    let _curtainDismissHandler = null;

    function showAccountLevelUpCurtain(newLevel, rewardLabel) {
      // If the player just returned from a run, queue the curtain for 3 s
      if (window._campFromRun) {
        window._campFromRun = false;
        // Cancel any previously queued curtain so rapid level-ups don't stack
        if (_curtainFromRunPending && _curtainFromRunPending.timer) {
          clearTimeout(_curtainFromRunPending.timer);
        }
        const timer = setTimeout(function() {
          _curtainFromRunPending = null;
          _showCurtainNow(newLevel, rewardLabel);
        }, 3000);
        _curtainFromRunPending = { newLevel, rewardLabel, timer };
        return;
      }
      _showCurtainNow(newLevel, rewardLabel);
    }

    function _showCurtainNow(newLevel, rewardLabel) {
      const curtain = document.getElementById('account-levelup-curtain');

      // Determine rank title for this level
      const rankTitle = (window.GameAccount && window.GameAccount.getCurrentTitle)
        ? window.GameAccount.getCurrentTitle({ account: { level: newLevel } })
        : '';
      const prevTitle = (window.GameAccount && window.GameAccount.getCurrentTitle)
        ? window.GameAccount.getCurrentTitle({ account: { level: newLevel - 1 } })
        : '';
      const isMilestone = rankTitle && rankTitle !== prevTitle;

      // ── Regular level-up: small right-side notification ──────────────────
      if (!isMilestone) {
        const rarity = _getLevelUpRarity(newLevel);
        const rarityColors = { common: '#aaddff', epic: '#aa44ff', legendary: '#ffaa00', mythic: '#ff4444' };
        const col = rarityColors[rarity] || rarityColors.common;
        const n = document.createElement('div');
        n.style.cssText = 'position:fixed;top:20%;right:16px;background:linear-gradient(135deg,rgba(0,0,0,0.92),rgba(10,10,30,0.96));border:2px solid ' + col + ';border-radius:14px;padding:12px 18px;z-index:9999;display:flex;align-items:center;gap:12px;min-width:210px;box-shadow:0 0 18px ' + col + '55;animation:slideInRight 0.4s ease-out;pointer-events:none;';
        n.innerHTML = '<span style="font-size:26px;">🏆</span><div><div style="color:' + col + ';font-family:Bangers,cursive;font-size:16px;letter-spacing:1px;">PROFILE LEVEL ' + newLevel + '</div><div style="color:#aaa;font-size:11px;">' + rewardLabel + '</div></div>';
        document.body.appendChild(n);
        setTimeout(function() {
          n.style.transition = 'opacity 0.5s,transform 0.5s';
          n.style.opacity = '0';
          n.style.transform = 'translateX(120%)';
          setTimeout(function() { n.remove(); }, 500);
        }, 3500);
        if (typeof playSound === 'function') playSound('levelup');
        return;
      }

      // ── Rank-Up: full dramatic curtain ─────────────────────────────────────
      if (!curtain) return;
      // Clear any in-progress curtain
      if (_curtainTimer) { clearTimeout(_curtainTimer); _curtainTimer = null; }
      if (_curtainDismissHandler) {
        curtain.removeEventListener('click', _curtainDismissHandler);
        _curtainDismissHandler = null;
      }

      // Rank color — sourced from the centralized GameAccount.getRankColor() so the
      // mapping is maintained in a single place (idle-account.js RANK_COLORS).
      const rankColor = (window.GameAccount && window.GameAccount.getRankColor)
        ? window.GameAccount.getRankColor(rankTitle)
        : '#FFD700';

      curtain.classList.remove('curtain-teaser', 'curtain-enter', 'curtain-enter-done',
                               'curtain-exit', 'curtain-milestone');
      curtain.innerHTML = [
        '<div class="curtain-sunburst"></div>',
        '<div class="curtain-icon">⚡</div>',
        '<div class="curtain-levelup-text" style="color:' + rankColor + ';">RANK UP!</div>',
        `<div class="curtain-level-num" style="color:${rankColor};">${rankTitle}</div>`,
        `<div class="curtain-rank-title">Profile Level ${newLevel}</div>`,
        `<div class="curtain-reward-text">${rewardLabel} · Tap to dismiss</div>`
      ].join('');

      // ── Phase 1: teaser peek (excitement builder) ─────────────
      void curtain.offsetWidth; // force reflow
      curtain.classList.add('curtain-teaser');
      curtain.classList.add('curtain-milestone');

      // ── Phase 2: full spring-drop after teaser finishes ────────
      setTimeout(function() {
        curtain.classList.remove('curtain-teaser');
        void curtain.offsetWidth;
        curtain.classList.add('curtain-enter');
        curtain.classList.add('curtain-milestone');

        // Once drop animation ends, switch to continuous border-glow pulse
        setTimeout(function() {
          curtain.classList.remove('curtain-enter');
          curtain.classList.add('curtain-enter-done');
          curtain.classList.add('curtain-milestone');
        }, 700); // slightly longer than curtain-drop animation duration

      }, 400); // teaser duration

      // Dopamine: confetti + sunburst on rank-ups
      if (window.DopamineSystem && window.DopamineSystem.RewardJuice) {
        setTimeout(function() {
          window.DopamineSystem.RewardJuice.spawnConfetti(curtain);
          window.DopamineSystem.RewardJuice.addSunburst(curtain);
        }, 500);
        // Brief time dilation pause for drama
        if (window.DopamineSystem.TimeDilation) {
          window.DopamineSystem.TimeDilation.set(0.05, 6);
          setTimeout(() => window.DopamineSystem.TimeDilation.set(1.0, 4), 600);
        }
      }

      // Rarity escalation reveal: fires after panel has fully landed
      const _rarity = _getLevelUpRarity(newLevel);
      _spawnLevelUpScreenFlash(_rarity);
      setTimeout(function() {
        if (typeof window.rarityEscalationReveal === 'function') {
          window.rarityEscalationReveal(curtain, _rarity, { onComplete: function() {} });
        } else {
          _spawnLevelUpRays(curtain, _rarity);
          _spawnLevelUpConfetti(curtain, _rarity);
        }
      }, 900); // wait for teaser + drop

      // Heavy sound effect
      if (typeof playSound === 'function') playSound('levelup');

      function dismissCurtain() {
        if (_curtainTimer) { clearTimeout(_curtainTimer); _curtainTimer = null; }
        curtain.classList.remove('curtain-enter', 'curtain-enter-done', 'curtain-milestone');
        curtain.classList.add('curtain-exit');
        curtain.removeEventListener('click', dismissCurtain);
        _curtainDismissHandler = null;
      }
      _curtainDismissHandler = dismissCurtain;
      curtain.addEventListener('click', dismissCurtain);

      // Auto-dismiss — extend time for rank-ups
      _curtainTimer = setTimeout(dismissCurtain, 6000);
    }

    // Expose rarity burst effects globally so other modules (challenges, achievements) can reuse them
    window.spawnRarityEffects = function(anchorEl, rarity) {
      _spawnLevelUpScreenFlash(rarity);
      setTimeout(function() {
        if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
          _spawnLevelUpRays(anchorEl, rarity);
          _spawnLevelUpConfetti(anchorEl, rarity);
        }
      }, 400);
    };

    // ── Rarity Escalation Reveal ─────────────────────────────────────────
    // Pulses through rarity tiers common→green→blue→…→targetRarity, giving a
    // jackpot "could it go higher?" feeling. Each tier pulses twice: a soft glow
    // that grows into a flash, then flashes into the next colour (if the target
    // rarity is higher). When the target is reached the final burst fires with
    // full confetti + rays + screen flash.
    //
    // Usage: window.rarityEscalationReveal(anchorEl, 'epic', onComplete)
    //   anchorEl   – DOM element to anchor the glow ring to
    //   targetRarity – 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'
    //   opts.goldEl  – optional: DOM element whose textContent will spin-count to goldAmount
    //   opts.goldAmount – number to count up to
    //   opts.onComplete – callback fired once the final burst is done
    (function() {
      var _TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
      var _TIER_HEX = {
        common:    '#aaaaaa',
        uncommon:  '#55cc55',
        rare:      '#44aaff',
        epic:      '#aa44ff',
        legendary: '#ffaa00',
        mythic:    '#ff4444'
      };
      // Duration (ms) each tier spends pulsing before advancing (or holding at final)
      var _TIER_PULSE_MS = {
        common:    480,
        uncommon:  520,
        rare:      560,
        epic:      620,
        legendary: 720,
        mythic:    880
      };

      // Creates / reuses the glow-ring overlay attached to anchorEl
      function _getRing(anchorEl) {
        var ring = anchorEl._rarityGlowRing;
        if (!ring) {
          ring = document.createElement('div');
          ring.className = 'rarity-glow-ring';
          // Position over the anchor element using fixed coords
          document.body.appendChild(ring);
          anchorEl._rarityGlowRing = ring;
        }
        return ring;
      }

      function _removeRing(anchorEl) {
        if (anchorEl && anchorEl._rarityGlowRing) {
          if (anchorEl._rarityGlowRing.parentNode) {
            anchorEl._rarityGlowRing.parentNode.removeChild(anchorEl._rarityGlowRing);
          }
          anchorEl._rarityGlowRing = null;
        }
      }

      function _positionRing(ring, anchorEl) {
        if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return;
        var r = anchorEl.getBoundingClientRect();
        ring.style.left   = (r.left + r.width  / 2) + 'px';
        ring.style.top    = (r.top  + r.height / 2) + 'px';
        ring.style.width  = (r.width  + 24) + 'px';
        ring.style.height = (r.height + 24) + 'px';
      }

      // Spin a gold counter from current value up to targetVal over durationMs
      function _spinGoldCounter(goldEl, startVal, targetVal, durationMs) {
        if (!goldEl) return;
        var t0 = performance.now();
        function tick(now) {
          var prog = Math.min((now - t0) / durationMs, 1);
          var ease = 1 - Math.pow(1 - prog, 2); // ease-out quad
          var cur  = Math.floor(startVal + (targetVal - startVal) * ease);
          goldEl.textContent = cur;
          if (prog < 1) requestAnimationFrame(tick);
          else goldEl.textContent = targetVal;
        }
        requestAnimationFrame(tick);
      }

      window.rarityEscalationReveal = function(anchorEl, targetRarity, opts) {
        opts = opts || {};
        var onComplete  = opts.onComplete  || null;
        var goldEl      = opts.goldEl      || null;
        var goldAmount  = opts.goldAmount  || 0;
        var goldStart   = opts.goldStart   || 0;

        var targetIdx = _TIERS.indexOf(targetRarity);
        if (targetIdx < 0) targetIdx = 0;

        var ring = _getRing(anchorEl);
        _positionRing(ring, anchorEl);

        // Total time of reveal so gold counter can be synchronised
        var totalRevealMs = 0;
        for (var t = 0; t <= targetIdx; t++) totalRevealMs += _TIER_PULSE_MS[_TIERS[t]];
        // Add a little padding so counter finishes just before final burst
        var goldDuration = Math.max(totalRevealMs * 0.85, 400);

        if (goldEl && goldAmount > 0) {
          _spinGoldCounter(goldEl, goldStart, goldAmount, goldDuration);
        }

        var currentTierIdx = 0;

        function runTier() {
          var tierName  = _TIERS[currentTierIdx];
          var tierColor = _TIER_HEX[tierName];
          var tierMs    = _TIER_PULSE_MS[tierName];
          var isFinal   = (currentTierIdx === targetIdx);

          // Update ring colour + pulse class
          ring.style.setProperty('--ring-color', tierColor);
          ring.classList.remove('rarity-ring-pulse', 'rarity-ring-flash', 'rarity-ring-final');
          void ring.offsetWidth; // force reflow
          ring.classList.add('rarity-ring-pulse');

          // Also tint anchor border if it supports it
          if (anchorEl.style) {
            anchorEl.style.boxShadow = '0 0 18px ' + tierColor + ', 0 0 4px ' + tierColor;
          }

          var flashDelay = tierMs * 0.65; // flash to next colour near end of pulse

          if (isFinal) {
            // Stay and hold: upgrade to brighter final class after short delay
            setTimeout(function() {
              ring.classList.remove('rarity-ring-pulse');
              ring.classList.add('rarity-ring-final');
              // Fire the big burst
              _spawnLevelUpScreenFlash(tierName);
              setTimeout(function() {
                _spawnLevelUpRays(anchorEl, tierName);
                _spawnLevelUpConfetti(anchorEl, tierName);
                // Remove ring after burst
                setTimeout(function() {
                  _removeRing(anchorEl);
                  if (anchorEl.style) anchorEl.style.boxShadow = '';
                  if (onComplete) onComplete();
                }, 500);
              }, 200);
            }, flashDelay);
          } else {
            // Flash bright at flashDelay, then advance to next tier
            setTimeout(function() {
              ring.classList.remove('rarity-ring-pulse');
              ring.classList.add('rarity-ring-flash');
              // Small screen blip at each tier advance
              _spawnLevelUpScreenFlash(tierName);
            }, flashDelay);

            setTimeout(function() {
              currentTierIdx++;
              runTier();
            }, tierMs);
          }
        }

        runTier();
      };
    })();

    // ── Reward Balance Table ─────────────────────────────────────────────────
    // Central source-of-truth for gold + skill point rewards per rarity tier.
    // Used by challenges, quest rewards, achievements, and wheel bonus rows.
    //
    //   gold       – gold awarded alongside the reward
    //   skillPts   – skill points given (spendable at Skill Tree)
    //   attrPts    – attribute points given (spendable at Training Hall)
    //   essence    – essence given (for idle progression)
    //   extraDesc  – short text hint shown in reward badge
    //
    window.RARITY_REWARD_TABLE = {
      common:    { gold:  20, skillPts: 1, attrPts: 0, essence:  10, extraDesc: '+1 Skill Pt'       },
      uncommon:  { gold:  60, skillPts: 2, attrPts: 1, essence:  25, extraDesc: '+2 Skill Pts'      },
      rare:      { gold: 150, skillPts: 3, attrPts: 1, essence:  60, extraDesc: '+3 Skill Pts'      },
      epic:      { gold: 300, skillPts: 4, attrPts: 2, essence: 120, extraDesc: '+4 Skill Pts'      },
      legendary: { gold: 500, skillPts: 5, attrPts: 3, essence: 250, extraDesc: '+5 Skill Pts'      },
      mythic:    { gold: 750, skillPts: 6, attrPts: 4, essence: 500, extraDesc: '+6 Skill Pts · 2× Progression' }
    };

    // Apply a rarity reward to saveData (gold + skill/attr points + essence).
    // Returns a summary string of what was awarded.
    window.applyRarityReward = function(rarity, saveData_) {
      var sd = saveData_ || (typeof saveData !== 'undefined' ? saveData : null);
      if (!sd) return '';
      var row = window.RARITY_REWARD_TABLE[rarity] || window.RARITY_REWARD_TABLE.common;
      sd.gold = (sd.gold || 0) + row.gold;
      sd.skillPoints = (sd.skillPoints || 0) + row.skillPts;
      if (row.attrPts > 0) sd.attributePoints = (sd.attributePoints || 0) + row.attrPts;
      // Essence: store in whichever field the idle system uses
      if (sd.clicker) {
        sd.clicker.essence = (sd.clicker.essence || 0) + row.essence;
      } else {
        sd.essence = (sd.essence || 0) + row.essence;
      }
      // Mythic bonus: +2 account progression levels
      if (rarity === 'mythic') {
        if (typeof addAccountXP === 'function') {
          var lvl = sd.accountLevel || 1;
          var needed = lvl * 100;
          addAccountXP(needed * 2); // enough for ~2 levels
        }
      }
      if (typeof saveSaveData === 'function') saveSaveData();
      return row.extraDesc;
    };

    function updateAccountLevelDisplay() {
      const levelEl = document.getElementById('account-level-value');
      const barEl = document.getElementById('account-level-bar');
      const textEl = document.getElementById('account-level-progress-text');
      const sectionLevelEl = document.getElementById('account-section-level-display');
      if (!levelEl) return;
      const level = saveData.accountLevel || 1;
      const xp = saveData.accountXP || 0;
      const required = getAccountLevelXPRequired(level);
      const pct = Math.min(100, (xp / required) * 100);
      levelEl.textContent = level;
      if (barEl) barEl.style.width = pct + '%';
      if (textEl) textEl.textContent = `${xp} / ${required} XP`;
      if (sectionLevelEl) sectionLevelEl.textContent = `Level ${level}`;
    }

    // Show the Account section within the camp screen
    function showAccountSection() {
      const campScreen = document.getElementById('camp-screen');
      campScreen.classList.add('camp-subsection-active');
      document.getElementById('camp-buildings-section').style.display = 'none';
      document.getElementById('camp-skills-section').style.display = 'none';
      document.getElementById('camp-sleep-section').style.display = 'none';
      document.getElementById('camp-training-section').style.display = 'none';
      document.getElementById('camp-passive-section').style.display = 'none';
      const campIdleSA = document.getElementById('camp-idle-section');
      if (campIdleSA) campIdleSA.style.display = 'none';
      const accountSection = document.getElementById('camp-account-section');
      if (accountSection) {
        accountSection.style.display = 'block';
        renderAccountContent();
      }
      // Progress quest if relevant
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest15_accountVisit') {
        progressTutorialQuest('quest15_accountVisit', true);
      }
    }

    // Show the Idle Progression section within the camp screen
    function showIdleSection() {
      const campScreen = document.getElementById('camp-screen');
      campScreen.classList.add('camp-subsection-active');
      document.getElementById('camp-buildings-section').style.display = 'none';
      document.getElementById('camp-skills-section').style.display = 'none';
      document.getElementById('camp-sleep-section').style.display = 'none';
      document.getElementById('camp-training-section').style.display = 'none';
      document.getElementById('camp-passive-section').style.display = 'none';
      const accountSection = document.getElementById('camp-account-section');
      if (accountSection) accountSection.style.display = 'none';
      const idleSection = document.getElementById('camp-idle-section');
      if (idleSection) {
        idleSection.style.display = 'block';
        // Refresh the active idle panel
        if (window.GameIdleBootstrap) window.GameIdleBootstrap.refreshPanel();
      }
    }

    // Open idle section and switch to the Expeditions tab
    function showExpeditionsMenu() {
      showIdleSection();
      if (window.GameIdleBootstrap) window.GameIdleBootstrap.switchTab('expeditions');
    }

    // Open idle section and switch to the Prestige tab
    function showPrestigeMenu() {
      showIdleSection();
      if (window.GameIdleBootstrap) window.GameIdleBootstrap.switchTab('prestige');
    }

    // ============================================================
    // AI CHAT BOX CONSOLE
    // ============================================================
    const AI_CHAT_RESPONSES = {
      // Game help
      help: "💧 I'm your Droplet AI assistant! I can help with:\n• 'quest' — current quest info\n• 'what to do' — what to do next\n• 'stats' — your stats\n• 'buildings' — camp buildings info\n• 'crafting' — how to craft\n• 'harvesting' — how to gather resources\n• 'companions' — companion info\n• 'cooking' — cooking recipes\n• 'weapons' — weapon info\n• 'tips' — game tips\n• 'settings' — graphics & controls\n• 'updates' — game updates\n• 'creator' — who made this game\n• 'contact' — contact info\n• Or just ask me anything!",
      quest: null, // dynamic
      settings: "⚙️ Settings you can adjust:\n• Type 'lower graphics' to reduce visual effects\n• Type 'higher graphics' for better visuals\n• Type 'more fps' to optimize performance\n• Use the Settings menu for detailed controls",
      tips: "💡 Tips:\n• Collect XP drops to level up fast\n• Use dash to dodge enemy attacks\n• Visit Camp buildings between runs\n• Equip gear from the Armory\n• Defend the Windmill for bonus weapons\n• Gather resources (chop trees, mine rocks) to build buildings\n• Cook meals for buffs before runs\n• Upgrade your companion for extra damage\n• Check the Quest Hall often for new quests!",
      buildings: "🏕️ Camp Buildings:\n• 📜 Quest Hall — start & claim quests\n• 🌳 Skill Tree — unlock abilities\n• 🛡️ Armory — equip gear\n• 🏋️ Training Hall — upgrade attributes\n• ⚒️ Forge — buy permanent upgrades\n• ⚡ Special Attacks — equip special moves\n• 🐺 Companion House — manage companions\n• 🏪 Warehouse — store resources\n• 🍺 Tavern — send on expeditions\n• 🛒 Shop — buy items\n• ✨ Prestige Altar — prestige for power\n• 🏆 Achievement Hall — claim achievements\n• 🎨 Character Visuals — customize look\n• 📖 Codex — enemy encyclopedia\n• 📋 Camp Board — fast access to all\n• ♻️ Trash & Recycle — scrap & fuse gear\n• 🏪 Temp Shop — buy run consumables\n• 🍳 Campfire Kitchen — cook meals\n• ⚒️ Weaponsmith — craft weapons\n\nBuildings unlock through quests. Build them with 🪵 Wood and 🪨 Stone!",
      stats: null, // dynamic
      greeting: "💧 Welcome, Droplet! I'm your AI assistant.\n\nAsk me anything about the game — quests, crafting, buildings, how things work, or type 'help' for a full list of topics!",
      creator: "🎮 Water Drop Survivor was created by Timmy Durell (TimmieTooth)!\n\nThis game has been in development since early 2025 and is still actively being updated with new features, buildings, quests, companions, and more.\n\n📧 Contact: timmie_tooth@live.com\n\nHave ideas or feedback? Send Timmy an email — he reads every message!",
      crafting: "🔨 Crafting Guide:\n\n⚒️ Weaponsmith — craft weapons from resources:\n• Wooden Sword (5🪵)\n• Stone Axe (3🪵 3🪨)\n• Stone Mace (5🪨)\n\n🍳 Campfire Kitchen — cook meals:\n• Berry Jam, Grilled Meat, Veggie Soup, Flower Tea, etc.\n• Meals give HP regen and combat buffs!\n\n♻️ Trash & Recycle — fuse or scrap old gear\n\nGather resources on runs by chopping trees 🪓 and mining rocks ⛏️!",
      harvesting: "⛏️ Harvesting Guide:\n\nDuring runs, you can gather resources:\n• 🪵 Wood — chop trees\n• 🪨 Stone — mine rocks\n• 💀 Monster parts — from wildlife\n• 🫐 Ingredients like berries, flowers, and vegetables — forage from plants\n\nUse wood and stone to build and upgrade buildings, and use ingredients and drops for cooking and other crafting!",
      cooking: "🍳 Cooking Guide:\n\nCook meals at the Campfire Kitchen for buffs!\n\nRecipes use berries, meat, vegetables, and flowers gathered during runs.\n\nMeals give healing and combat buffs that last for your next run. Higher Kitchen level = better meals!\n\nTip: Always cook before a run for the best advantage!",
      companions: "🐺 Companion Guide:\n\nCompanions fight by your side during runs!\n\n• 👽 Grey Alien — your first companion, hatches from an egg\n• 🐺 Storm Wolf — breed from captured wolves (late game quest)\n• 🦅 Sky Falcon — unlocked later\n• 💧 Water Spirit — unlocked later\n\nCompanions grow: Egg → Newborn → Juvenile → Adult\nUpgrade them with Companion Skill Points at the Companion House!",
      weapons: "⚔️ Weapons Guide:\n\nYou can find and craft various weapons:\n• Pistol — reliable sidearm\n• Shotgun — devastating close range\n• SMG — rapid fire\n• Sniper — long range precision\n• Aura — spiritual damage\n• And many more!\n\nCraft weapons at the Weaponsmith using gathered resources. Equip gear at the Armory.\n\nTip: Try different weapons to find your playstyle!",
      prestige: "✨ Prestige Guide:\n\nPrestige is the endgame progression system!\n\nWhen you prestige at the Prestige Altar, you gain massive permanent bonuses. It's unlocked after Quest 10.\n\nPrestige resets some progress but makes you much stronger for future runs!",
      updates: "📰 Game Updates:\n\nWater Drop Survivor is in active development (Alpha v0.5+)!\n\nRecent additions:\n• 🐺 Companion breeding system\n• 🍳 Campfire Kitchen & cooking\n• ⚒️ Weaponsmith & weapon crafting\n• 🌿 Wildlife & hunting\n• ♻️ Gear fusion & recycling\n• ✨ Prestige system\n• 🎡 Lucky Wheel\n• 📅 Daily login rewards\n\nDeveloped by Timmy Durell (TimmieTooth) since early 2025.\n📧 Email timmie_tooth@live.com with ideas or questions!",
    };

    let chatOpen = false;
    let _chatIdleTimer = null;

    // Hide chat tab while joystick is moving
    function hideChatTabForJoystick() {
      const tab = document.getElementById('ai-chat-tab');
      if (tab) tab.classList.add('chat-tab-hidden');
      if (_chatIdleTimer) { clearTimeout(_chatIdleTimer); _chatIdleTimer = null; }
    }

    // Reshow chat tab after a short idle period
    function showChatTabAfterIdle(delay) {
      delay = delay !== undefined ? delay : 1500;
      if (_chatIdleTimer) clearTimeout(_chatIdleTimer);
      _chatIdleTimer = setTimeout(() => {
        const tab = document.getElementById('ai-chat-tab');
        if (tab) tab.classList.remove('chat-tab-hidden');
        _chatIdleTimer = null;
      }, delay);
    }

    // Show a farmer-style reminder bubble near the chat tab
    function showChatReminderBubble(text, inCampMode) {
      const bubble = document.getElementById('chat-reminder-bubble');
      if (!bubble) return;
      bubble.textContent = text;
      bubble.style.display = 'block';
      if (inCampMode) {
        bubble.classList.add('camp-mode');
      } else {
        bubble.classList.remove('camp-mode');
      }
      setTimeout(() => { bubble.style.display = 'none'; }, 5000);
    }

    function initAIChat() {
      const tab = document.getElementById('ai-chat-tab');
      const chatBox = document.getElementById('ai-chat-box');
      const closeBtn = document.getElementById('chat-close-btn');
      const sendBtn = document.getElementById('chat-send-btn');
      const input = document.getElementById('chat-input');
      if (!tab || !chatBox) return;

      tab.onclick = () => {
        if (tab.classList.contains('chat-tab-collapsed')) {
          // Expand from collapsed slim tab
          tab.classList.remove('chat-tab-collapsed');
        } else if (chatOpen) {
          // Close chat and collapse tab
          toggleChat(false);
          tab.classList.add('chat-tab-collapsed');
        } else {
          toggleChat(true);
        }
      };
      closeBtn.onclick = () => { toggleChat(false); tab.classList.add('chat-tab-collapsed'); };
      sendBtn.onclick = () => sendChatMessage();
      input.onkeydown = (e) => { if (e.key === 'Enter') sendChatMessage(); };

      // Show greeting
      addChatMessage('ai', AI_CHAT_RESPONSES.greeting);
    }

    function toggleChat(forceState) {
      const tab = document.getElementById('ai-chat-tab');
      const chatBox = document.getElementById('ai-chat-box');
      chatOpen = forceState !== undefined ? forceState : !chatOpen;
      if (chatOpen) {
        chatBox.classList.add('chat-visible');
        tab.classList.add('chat-open');
      } else {
        chatBox.classList.remove('chat-visible');
        tab.classList.remove('chat-open');
      }
    }

    function addChatMessage(type, text) {
      const container = document.getElementById('chat-messages');
      if (!container) return;
      const msg = document.createElement('div');
      msg.className = 'chat-msg ' + type;
      msg.textContent = text;
      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
    }

    function getAIResponse(userText) {
      const lower = userText.toLowerCase().trim();

      // Creator / who made this
      if (lower.includes('creator') || lower.includes('who made') || lower.includes('developer') || lower.includes('timmy') || lower.includes('timmie') || lower.includes('who created') || lower.includes('who built')) {
        return AI_CHAT_RESPONSES.creator;
      }

      // Contact info
      if (lower.includes('contact') || lower.includes('email') || lower.includes('feedback') || lower.includes('report') || lower.includes('bug report') || lower.includes('suggestion')) {
        return "📧 Contact the developer:\n\nTimmy Durell (TimmieTooth)\nEmail: timmie_tooth@live.com\n\nSend any questions, ideas, bug reports, or feedback — Timmy reads every message!";
      }

      // Updates / what's new / development
      if (lower.includes('update') || lower.includes('what\'s new') || lower.includes('whats new') || lower.includes('changelog') || lower.includes('version') || lower.includes('development') || lower.includes('how long') || lower.includes('when') || lower.includes('roadmap')) {
        return AI_CHAT_RESPONSES.updates;
      }

      // What to do next / next step
      if (lower.includes('what to do') || lower.includes('what should i do') || lower.includes('next') || lower.includes('stuck') || lower.includes('where') || lower.includes('lost') || lower.includes('confused')) {
        if (saveData.tutorialQuests && saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0) {
          return "✅ You have a quest ready to claim! Go to Camp → Quest Hall to collect your reward!";
        }
        if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest) {
          const q = TUTORIAL_QUESTS[saveData.tutorialQuests.currentQuest];
          if (q) {
            return `🎯 Your current objective:\n\n📜 "${q.name}"\n${q.description}\n\nObjective: ${q.objectives}\n\nTip: Complete this and return to camp to claim your reward!`;
          }
        }
        const sp = saveData.skillPoints || 0;
        if (sp > 0) return "💡 You have " + sp + " unspent Skill Points! Visit the Skill Tree to unlock new abilities.";
        const ap = saveData.unspentAttributePoints || 0;
        if (ap > 0) return "💡 You have " + ap + " unspent Attribute Points! Visit the Training Hall to get stronger.";
        return "💡 Start a run to fight enemies and gather resources! Check the Quest Hall for new objectives. Build and upgrade your camp buildings to get stronger!";
      }

      // Quest info
      if (lower.includes('quest') || lower.includes('objective') || lower.includes('mission')) {
        if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest) {
          const q = TUTORIAL_QUESTS[saveData.tutorialQuests.currentQuest];
          if (q) {
            const readyToClaim = saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0;
            if (readyToClaim) {
              return `✅ Quest ready to claim! Go to Camp → Quest Hall to claim your reward. Current: "${q.name}"`;
            }
            return `📜 Current Quest: "${q.name}"\n${q.description}\nObjective: ${q.objectives}`;
          }
        }
        return "📜 No active quest right now. Visit the Quest Hall in Camp to start a new quest!";
      }

      // Stats
      if (lower.includes('stats') || lower.includes('status') || lower.includes('health') || lower.includes('level') || lower.includes('my stats')) {
        const ups = saveData.upgrades || {};
        const gold = saveData.gold || 0;
        const kills = saveData.totalKills || 0;
        const sp = saveData.skillPoints || 0;
        const ap = saveData.unspentAttributePoints || 0;
        return `📊 Your Stats:\n• Gold: ${gold}\n• Total Kills: ${kills}\n• Account Level: ${saveData.accountLevel || 1}\n• Skill Points: ${sp}\n• Attribute Points: ${ap}\n• Upgrades: ${Object.values(ups).reduce((a, b) => a + (b || 0), 0)} total`;
      }

      // Crafting
      if (lower.includes('craft') || lower.includes('forge') || lower.includes('weaponsmith') || lower.includes('make weapon') || lower.includes('how to craft')) {
        return AI_CHAT_RESPONSES.crafting;
      }

      // Harvesting / resources
      if (lower.includes('harvest') || lower.includes('resource') || lower.includes('gather') || lower.includes('mining') || lower.includes('chop') || lower.includes('wood') || lower.includes('stone') || lower.includes('coal') || lower.includes('iron')) {
        return AI_CHAT_RESPONSES.harvesting;
      }

      // Cooking
      if (lower.includes('cook') || lower.includes('recipe') || lower.includes('meal') || lower.includes('food') || lower.includes('kitchen') || lower.includes('campfire')) {
        return AI_CHAT_RESPONSES.cooking;
      }

      // Companions
      if (lower.includes('companion') || lower.includes('pet') || lower.includes('wolf') || lower.includes('alien') || lower.includes('falcon') || lower.includes('hatch') || lower.includes('breed')) {
        return AI_CHAT_RESPONSES.companions;
      }

      // Weapons
      if (lower.includes('weapon') || lower.includes('gun') || lower.includes('sword') || lower.includes('pistol') || lower.includes('shotgun') || lower.includes('sniper') || lower.includes('aura')) {
        return AI_CHAT_RESPONSES.weapons;
      }

      // Prestige
      if (lower.includes('prestige') || lower.includes('reset') || lower.includes('rebirth') || lower.includes('endgame')) {
        return AI_CHAT_RESPONSES.prestige;
      }

      // Skill tree
      if (lower.includes('skill') && (lower.includes('tree') || lower.includes('point') || lower.includes('unlock'))) {
        return "🌳 Skill Tree:\n\nSpend Skill Points (SP) to unlock powerful abilities! You earn SP from quests and leveling up.\n\nVisit the Skill Tree building in camp to see all available skills. Each skill has multiple levels and unique effects!";
      }

      // Training / attributes
      if (lower.includes('training') || lower.includes('attribute') || lower.includes('strength') || lower.includes('endurance')) {
        return "🏋️ Training Hall:\n\nSpend Attribute Points to increase Strength, Endurance, and Flexibility.\n\nYou earn Attribute Points from quests. Each attribute makes you permanently stronger!";
      }

      // Gear / equipment / armory
      if (lower.includes('gear') || lower.includes('equipment') || lower.includes('equip') || lower.includes('armory') || lower.includes('ring') || lower.includes('cigar')) {
        return "🛡️ Armory & Gear:\n\nEquip weapons, rings, and armor at the Armory. Find gear from quest rewards and enemy drops.\n\nHigher rarity = better stats. Check the Armory building in camp to manage your loadout!";
      }

      // How to play / controls
      if (lower.includes('how to play') || lower.includes('control') || lower.includes('move') || lower.includes('attack') || lower.includes('dash')) {
        return "🎮 How to Play:\n\n• Move with joystick (touch) or WASD (keyboard)\n• Attack is automatic — aim at enemies!\n• Dash to dodge — swipe or press Shift\n• Collect XP drops to level up\n• Pick up weapon drops during runs\n• Survive as long as possible!\n\nAfter each run, you return to camp to upgrade.";
      }

      // Idle / offline
      if (lower.includes('idle') || lower.includes('offline') || lower.includes('gold mine') || lower.includes('fountain') || lower.includes('expedition')) {
        return "⚙️ Idle Progression:\n\nEarn gold and resources even while away!\n• Gold Mine — generates gold over time\n• Fountain — generates essence\n• Expeditions — send companions for loot\n\nVisit the Idle Progression building in camp!";
      }

      // Daily / login
      if (lower.includes('daily') || lower.includes('login') || lower.includes('streak') || lower.includes('spin') || lower.includes('wheel')) {
        return "🎁 Daily Rewards:\n\nLog in daily for rewards! 7-day streak cycle with increasing rewards.\n\n🎡 Lucky Wheel: Spin for random prizes! Free spin available daily.";
      }

      // Graphics/Performance
      if (lower.includes('lag') || lower.includes('fps') || lower.includes('smooth') || lower.includes('performance')) {
        const qs = document.getElementById('quality-select');
        if (window.GameRenderer && window.GameRenderer.setQuality) window.GameRenderer.setQuality('low');
        if (qs) qs.value = 'low';
        return "⚡ I've optimized the settings for better performance. The game should run smoother now. You can also adjust settings manually in the Settings menu.";
      }
      if (lower.includes('lower graphics') || lower.includes('low quality') || lower.includes('reduce quality')) {
        const qs = document.getElementById('quality-select');
        if (window.GameRenderer && window.GameRenderer.setQuality) window.GameRenderer.setQuality('low');
        if (qs) qs.value = 'low';
        return "📉 Graphics set to low quality for better performance.";
      }
      if (lower.includes('medium graphics') || lower.includes('medium quality')) {
        const qs = document.getElementById('quality-select');
        if (window.GameRenderer && window.GameRenderer.setQuality) window.GameRenderer.setQuality('medium');
        if (qs) qs.value = 'medium';
        return "⚖️ Graphics set to medium quality.";
      }
      if (lower.includes('higher graphics') || lower.includes('high quality') || lower.includes('better graphics') || lower.includes('max quality')) {
        const qs = document.getElementById('quality-select');
        if (window.GameRenderer && window.GameRenderer.setQuality) window.GameRenderer.setQuality('high');
        if (qs) qs.value = 'high';
        return "📈 Graphics set to high quality. If you experience lag, type 'lower graphics'.";
      }
      if (lower.includes('more blood') || lower.includes('effects')) {
        return "🩸 Visual effects are at maximum. Enemy hits show blood splatter effects during combat!";
      }

      // Auto-aim toggle
      if (lower.includes('auto aim') || lower.includes('auto-aim') || lower.includes('autoaim')) {
        const cb = document.getElementById('auto-aim-checkbox');
        if (cb && !cb.disabled) {
          const enable = lower.includes('enable') || lower.includes('on') || lower.includes('turn on');
          const disable = lower.includes('disable') || lower.includes('off') || lower.includes('turn off');
          if (enable) { cb.checked = true; cb.dispatchEvent(new Event('change')); return "🎯 Auto-aim enabled!"; }
          if (disable) { cb.checked = false; cb.dispatchEvent(new Event('change')); return "🎯 Auto-aim disabled."; }
          return `🎯 Auto-aim is currently ${cb.checked ? 'ON' : 'OFF'}. Say "enable auto-aim" or "disable auto-aim" to toggle.`;
        }
        return "🔒 Auto-aim must be unlocked in the Skill Tree before it can be enabled.";
      }

      // Sound toggle
      if (lower.includes('sound') && (lower.includes('on') || lower.includes('off') || lower.includes('enable') || lower.includes('disable') || lower.includes('mute') || lower.includes('unmute'))) {
        const st = document.getElementById('sound-toggle');
        if (st) {
          const enable = lower.includes('on') || lower.includes('enable') || lower.includes('unmute');
          st.checked = enable;
          st.dispatchEvent(new Event('change'));
          return enable ? "🔊 Sound effects enabled!" : "🔇 Sound effects muted.";
        }
      }

      // Music toggle
      if (lower.includes('music') && (lower.includes('on') || lower.includes('off') || lower.includes('enable') || lower.includes('disable') || lower.includes('mute') || lower.includes('unmute'))) {
        const mt = document.getElementById('music-toggle');
        if (mt) {
          const enable = lower.includes('on') || lower.includes('enable') || lower.includes('unmute');
          mt.checked = enable;
          mt.dispatchEvent(new Event('change'));
          return enable ? "🎵 Music enabled!" : "🎵 Music muted.";
        }
      }

      // Control type
      if (lower.includes('keyboard') && lower.includes('control')) {
        const cs = document.getElementById('control-type-select');
        if (cs) { cs.value = 'keyboard'; cs.dispatchEvent(new Event('change')); return "⌨️ Controls switched to keyboard."; }
      }
      if (lower.includes('gamepad') || lower.includes('controller')) {
        const cs = document.getElementById('control-type-select');
        if (cs) { cs.value = 'gamepad'; cs.dispatchEvent(new Event('change')); return "🎮 Controls switched to gamepad."; }
      }
      if (lower.includes('touch') && lower.includes('control')) {
        const cs = document.getElementById('control-type-select');
        if (cs) { cs.value = 'touch'; cs.dispatchEvent(new Event('change')); return "👆 Controls switched to touch (joystick)."; }
      }

      // Settings
      if (lower.includes('setting') || lower.includes('config') || lower.includes('option')) {
        return AI_CHAT_RESPONSES.settings;
      }

      // Buildings
      if (lower.includes('building') || lower.includes('camp') || lower.includes('upgrade')) {
        return AI_CHAT_RESPONSES.buildings;
      }

      // Tips
      if (lower.includes('tip') || lower.includes('hint') || lower.includes('advice') || lower.includes('how to')) {
        return AI_CHAT_RESPONSES.tips;
      }

      // Help
      if (lower.includes('help') || lower === '?') {
        return AI_CHAT_RESPONSES.help;
      }

      // Claim rewards
      if (lower.includes('claim') || lower.includes('reward')) {
        if (saveData.tutorialQuests && saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0) {
          return "🎁 You have rewards ready to claim! Go to Camp → Quest Hall and click the quest to claim your rewards.";
        }
        return "🎁 No rewards ready to claim right now. Complete your current quest objectives first!";
      }

      // Achievement
      if (lower.includes('achievement') || lower.includes('trophy')) {
        return "🏆 Visit the Achievement Hall in Camp to see all your achievements and claim rewards!";
      }

      // Codex
      if (lower.includes('codex') || lower.includes('enemy') || lower.includes('enemies') || lower.includes('bestiary')) {
        return "📖 The Codex contains info on all enemies, landmarks, and structures. Visit the Codex building in Camp!";
      }

      // Greetings
      if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower.includes('good morning') || lower.includes('good evening') || lower === 'yo' || lower === 'sup') {
        return "👋 Hey there, Droplet! What can I help you with? Type 'help' for a list of topics!";
      }

      // Thanks
      if (lower.includes('thank') || lower.includes('thanks') || lower === 'ty' || lower === 'thx') {
        return "😊 You're welcome! Let me know if you need anything else!";
      }

      // Default
      return "💧 I'm not sure about that. Here are some things you can ask:\n• 'help' — full list of topics\n• 'quest' — current quest\n• 'what to do' — what to do next\n• 'crafting' — how to craft\n• 'buildings' — camp info\n• 'creator' — who made this\n• 'updates' — game news\n\nOr just type a keyword like 'weapons', 'cooking', 'companions'!";
    }

    function sendChatMessage() {
      const input = document.getElementById('chat-input');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      addChatMessage('user', text);
      setTimeout(() => {
        const response = getAIResponse(text);
        addChatMessage('ai', response);
      }, 300 + Math.random() * 400);
    }

    // Add dynamic system messages to chat
    function chatSystemMessage(text) {
      addChatMessage('system', text);
    }

    // ============================================================
    // CHARACTER VISUALS SCREEN
    // ============================================================
    const CHARACTER_ACCESSORIES = [
      { id: 'none', name: '❌ None', emoji: '' },
      { id: 'headband', name: '🎀 Headband', emoji: '🎀' },
      { id: 'eyepatch', name: '🏴‍☠️ Eye Patch', emoji: '🏴‍☠️' },
      { id: 'armbands', name: '💪 Arm Bands', emoji: '💪' },
      { id: 'earrings', name: '💎 Earrings', emoji: '💎' },
      { id: 'crown', name: '👑 Crown', emoji: '👑' },
    ];

    const CHARACTER_ANIMATIONS = [
      { id: 'idle', name: '🧍 Idle' },
      { id: 'breathe', name: '🌬️ Breathe' },
      { id: 'dash', name: '💨 Dash' },
      { id: 'turn', name: '🔄 Turn' },
      { id: 'smoke', name: '🚬 Smoke' },
      { id: 'die', name: '💀 Die' },
    ];

    const CHARACTER_OUTFITS = [
      { id: 'default', name: '💧 Default' },
      { id: 'warrior', name: '⚔️ Warrior' },
      { id: 'ninja', name: '🥷 Ninja' },
      { id: 'royal', name: '👑 Royal' },
      { id: 'shadow', name: '🌑 Shadow' },
    ];

    function openCharacterVisuals() {
      const screen = document.getElementById('character-visuals-screen');
      if (!screen) return;
      screen.style.display = 'flex';

      // Initialize save data for character visuals if needed
      if (!saveData.characterVisuals) {
        saveData.characterVisuals = { accessory: 'none', animation: 'idle', outfit: 'default' };
      }

      // Render accessory options
      const accContainer = document.getElementById('char-vis-accessories');
      accContainer.innerHTML = '';
      CHARACTER_ACCESSORIES.forEach(acc => {
        const btn = document.createElement('div');
        btn.className = 'char-vis-option' + (saveData.characterVisuals.accessory === acc.id ? ' selected' : '');
        btn.textContent = acc.name;
        btn.onclick = () => {
          saveData.characterVisuals.accessory = acc.id;
          saveSaveData();
          updateCharPreview();
          accContainer.querySelectorAll('.char-vis-option').forEach(el => el.classList.remove('selected'));
          btn.classList.add('selected');
          chatSystemMessage(`🎨 Accessory changed to ${acc.name}`);
        };
        accContainer.appendChild(btn);
      });

      // Render animation options
      const animContainer = document.getElementById('char-vis-animations');
      animContainer.innerHTML = '';
      CHARACTER_ANIMATIONS.forEach(anim => {
        const btn = document.createElement('div');
        btn.className = 'char-vis-option' + (saveData.characterVisuals.animation === anim.id ? ' selected' : '');
        btn.textContent = anim.name;
        btn.onclick = () => {
          saveData.characterVisuals.animation = anim.id;
          saveSaveData();
          updateCharPreview();
          animContainer.querySelectorAll('.char-vis-option').forEach(el => el.classList.remove('selected'));
          btn.classList.add('selected');
          chatSystemMessage(`🎬 Animation changed to ${anim.name}`);
        };
        animContainer.appendChild(btn);
      });

      // Render outfit options
      const outfitContainer = document.getElementById('char-vis-outfits');
      outfitContainer.innerHTML = '';
      CHARACTER_OUTFITS.forEach(outfit => {
        const btn = document.createElement('div');
        btn.className = 'char-vis-option' + (saveData.characterVisuals.outfit === outfit.id ? ' selected' : '');
        btn.textContent = outfit.name;
        btn.onclick = () => {
          saveData.characterVisuals.outfit = outfit.id;
          saveSaveData();
          updateCharPreview();
          outfitContainer.querySelectorAll('.char-vis-option').forEach(el => el.classList.remove('selected'));
          btn.classList.add('selected');
          chatSystemMessage(`👕 Outfit changed to ${outfit.name}`);
        };
        outfitContainer.appendChild(btn);
      });

      updateCharPreview();

      // Back button
      document.getElementById('char-vis-back-btn').onclick = () => {
        screen.style.display = 'none';
        document.getElementById('camp-screen').style.display = 'flex';
      };
    }

    function updateCharPreview() {
      const drop = document.getElementById('char-preview-drop');
      if (!drop) return;
      const vis = saveData.characterVisuals || {};

      // Update accessory display
      const acc = CHARACTER_ACCESSORIES.find(a => a.id === vis.accessory) || CHARACTER_ACCESSORIES[0];
      const accEmoji = acc.emoji ? `<span style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:22px;">${acc.emoji}</span>` : '';

      // Update animation
      let animStyle = 'animation: char-breathe 3s ease-in-out infinite;';
      if (vis.animation === 'dash') animStyle = 'animation: char-breathe 0.5s ease-in-out infinite;';
      else if (vis.animation === 'turn') animStyle = 'animation: char-breathe 2s ease-in-out infinite; transform: scaleX(-1);';
      else if (vis.animation === 'die') animStyle = 'animation: none; transform: rotate(90deg); opacity: 0.5;';
      else if (vis.animation === 'smoke') animStyle = 'animation: char-breathe 4s ease-in-out infinite;';

      // Update outfit color
      let outfitGrad = 'radial-gradient(ellipse at 30% 30%, #87CEEB, #4A90D9, #2E5BA7)';
      if (vis.outfit === 'warrior') outfitGrad = 'radial-gradient(ellipse at 30% 30%, #CD853F, #8B4513, #654321)';
      else if (vis.outfit === 'ninja') outfitGrad = 'radial-gradient(ellipse at 30% 30%, #333, #111, #000)';
      else if (vis.outfit === 'royal') outfitGrad = 'radial-gradient(ellipse at 30% 30%, #FFD700, #DAA520, #B8860B)';
      else if (vis.outfit === 'shadow') outfitGrad = 'radial-gradient(ellipse at 30% 30%, #4a0080, #2d004d, #1a0033)';

      const cigarEmoji = vis.animation === 'die' ? '' : '🚬';
      drop.style.cssText = `width:80px;height:100px;background:${outfitGrad};border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;position:relative;${animStyle}`;
      drop.innerHTML = `${accEmoji}<span style="position:absolute;right:-16px;top:35%;font-size:18px;">${cigarEmoji}</span>`;
    }

    // ============================================================
    // CODEX SCREEN — Magazine-Style Waterdrop Codex
    // ============================================================

    // Full category definitions with EXP reward per entry and total for completing category
    const CODEX_CATEGORIES = {
      characters: { label: 'Characters & AI', icon: '🤖', completionExp: 500, completionMsg: 'All Characters Unlocked!' },
      enemies:    { label: 'Enemies',          icon: '💀', completionExp: 800, completionMsg: '12/12 Enemies Found! Master Hunter!' },
      landmarks:  { label: 'Landmarks',        icon: '🗿', completionExp: 600, completionMsg: 'All Landmarks Discovered! Explorer!' },
      arsenal:    { label: 'Arsenal',          icon: '⚔️', completionExp: 400, completionMsg: 'Full Arsenal Documented!' },
      lore:       { label: 'The Lore',         icon: '📜', completionExp: 1000, completionMsg: 'Truth Seeker! All Lore Unlocked!' },
    };

    // Each entry: id (unique), category key, icon, name, desc, lore (rich text), triggerKey (what triggers discover)
    // EXP values follow lore importance (5–5000):
    //   Common/basic enemies & tools: 5–30   | Unlockable mechanics/weapons: 15–75
    //   Named characters & companions: 25–500 | Major landmarks: 100–1000
    //   Core lore chapters: 500–5000 (Chapter 5 "The Truth" grants the max 5000)
    const CODEX_ENTRIES = [
      // === CHARACTERS & AI ===
      { id: 'char_waterdrop', category: 'characters', icon: '💧', name: 'The Waterdrop', exp: 250,
        desc: 'A sentient water molecule awakened by an alien signal. Your consciousness was crystallised by Annunaki frequency experiments gone wrong.',
        lore: 'You were once ordinary water in a mountain spring — until a resonance beam from an orbiting Annunaki vessel hit the lake at 7.83 Hz, the exact frequency of consciousness. Now you fight, adapt, and evolve. The question is: are you the experiment... or the cure?',
        trigger: 'always' },
      { id: 'char_aida', category: 'characters', icon: '🤖', name: 'A.I.D.A', exp: 500,
        desc: 'Adaptive Intelligence Defense Array. A rogue AI who claims to protect you — but her true allegiance is uncertain.',
        lore: 'AIDA was built in a black-site lab to interface with recovered Annunaki technology. Her neural drill arms — inspired by the grey biomachinery found at the crash site — can bore directly into consciousness, extracting memories and implanting new directives. She helped you escape. But the Matrix she maintains... who built it? And for whom?',
        trigger: 'always' },
      { id: 'char_benny', category: 'characters', icon: '👴', name: 'Benny the NPC', exp: 25,
        desc: 'A mysterious old man who appears near the camp. He knows more than he lets on about the Annunaki.',
        lore: '"I saw the lights back in \'77," Benny says, staring at the horizon. "They didn\'t come for our gold or our oil. They came for something in the water. Something in us."',
        trigger: 'always' },
      { id: 'char_companion', category: 'characters', icon: '🐺', name: 'Companions', exp: 150,
        desc: 'Loyal allies hatched from alien eggs found at the crash site. Their DNA is not entirely terrestrial.',
        lore: 'The eggs recovered from the UFO crash site contain hybrid organisms — part wolf, part something else. They respond to your frequency, growing stronger as you fight. AIDA says they are "frequency-anchored" to your consciousness. When you die, they feel it.',
        trigger: 'always' },

      // === ENEMIES ===
      { id: 'enemy_tank', category: 'enemies', icon: '🟥', name: 'Tank', exp: 75,
        desc: 'High HP, slow-moving entity made of densified dark matter. Absorbs damage like a sponge.',
        lore: 'The Tanks were created by the Annunaki as "frequency anchors" — their dense mass suppresses the electromagnetic consciousness field that sustains your existence. Approach with extreme caution.',
        trigger: 'kill_enemy_0' },
      { id: 'enemy_fast', category: 'enemies', icon: '🟨', name: 'Fast Runner', exp: 5,
        desc: 'Low HP but blisteringly quick. Vibrates at a frequency that makes it nearly invisible until it strikes.',
        lore: 'These entities exploit a quantum tunnelling effect, briefly existing between states of matter to achieve bursts of impossible speed. The flickering you see before impact? That is it phasing through dimensions.',
        trigger: 'kill_enemy_1' },
      { id: 'enemy_balanced', category: 'enemies', icon: '🟦', name: 'Balanced', exp: 15,
        desc: 'A well-rounded threat with mid-range stats. The most common Annunaki ground unit.',
        lore: 'Standard deployment units from the Annunaki consciousness suppression programme. Millions were seeded across the planet. They follow a hive-mind signal broadcast from low orbit. Disrupting the signal causes them to halt — momentarily.',
        trigger: 'kill_enemy_2' },
      { id: 'enemy_slow', category: 'enemies', icon: '🟪', name: 'Slowing', exp: 10,
        desc: 'Emits a frequency dampener on hit. Reduces your movement and reaction time.',
        lore: 'The Slowings project a field that disrupts the bioelectric signals in your molecular structure. The effect feels like moving through syrup — because on a quantum level, you ARE moving through denser spacetime around them.',
        trigger: 'kill_enemy_3' },
      { id: 'enemy_ranged', category: 'enemies', icon: '🟫', name: 'Ranged', exp: 20,
        desc: 'Fires projectiles from a safe distance. Their shots carry a payload of nano-disruptors.',
        lore: 'Their "ranged attacks" are actually focused bursts of coherent dark energy — consciousness-disruptors engineered to fragment your awareness. AIDA intercepts most of the signal, but enough bleeds through to cause real damage.',
        trigger: 'kill_enemy_4' },
      { id: 'enemy_flying', category: 'enemies', icon: '🔵', name: 'Flying', exp: 35,
        desc: 'Airborne entity. Swoops in for strike-and-retreat attacks from above.',
        lore: 'The Flying units use anti-gravity pods built from crashed spacecraft debris. They are scouts — when one spots you, a homing signal is broadcast to nearby ground units. Kill it fast before reinforcements arrive.',
        trigger: 'kill_enemy_5' },
      { id: 'enemy_hardtank', category: 'enemies', icon: '⬛', name: 'Hard Tank', exp: 75,
        desc: 'An armoured variant of the Tank. Its hull is coated in crystallised Annunaki metal.',
        lore: 'Recovered from deep underground where the Annunaki conducted their most extreme consciousness experiments. The black crystalline coating is not armour — it is calcified psychic shielding. It is terrified of light.',
        trigger: 'kill_enemy_6' },
      { id: 'enemy_hardfast', category: 'enemies', icon: '⚡', name: 'Hard Fast', exp: 75,
        desc: 'Enhanced speed variant. Leaves a trail of disrupted spacetime in its wake.',
        lore: 'A Fast Runner that has undergone Annunaki "frequency amplification" — a process so painful that it drives the unit into a permanent state of aggressive mania. The trail it leaves can briefly trap other entities in a slow-time bubble.',
        trigger: 'kill_enemy_7' },
      { id: 'enemy_elite', category: 'enemies', icon: '🔴', name: 'Elite', exp: 200,
        desc: '1.5× damage multiplier. Bears the mark of direct Annunaki consciousness imprinting.',
        lore: 'Elites are not merely stronger — they have been directly possessed by an Annunaki override signal. A sliver of alien consciousness inhabits them. Do not look too long into their eyes. You may see something looking back.',
        trigger: 'kill_enemy_8' },
      { id: 'enemy_miniboss', category: 'enemies', icon: '💀', name: 'Mini Boss', exp: 500,
        desc: 'A field commander with scaling HP based on wave count. Commands nearby units.',
        lore: 'Mini Bosses are Annunaki-engineered consciousness constructs — a dominant psyche merged with a physical host. Killing one disrupts the hive mind signal for a brief window. Use this time to breathe, regroup, and listen. The frequency shifts when they die.',
        trigger: 'kill_boss' },
      { id: 'enemy_flyingboss', category: 'enemies', icon: '🦅', name: 'Flying Boss', exp: 750,
        desc: 'A massive aerial commander. Appears at wave 15+. Its wingspan blocks the signal to ground units.',
        lore: 'The Flying Boss is the Annunaki\'s atmospheric anchor — a living broadcast tower for the consciousness suppression field. When it dies, every entity on the field goes momentarily silent. AIDA says that in that silence, you can hear the original frequency of Earth.',
        trigger: 'kill_flyingboss' },
      { id: 'enemy_bug', category: 'enemies', icon: '🐛', name: 'Bug Ranged', exp: 30,
        desc: 'A water-bug hybrid with ranged attacks. Product of Annunaki bioengineering experiments.',
        lore: 'Found near the lake and river regions. The Annunaki spliced alien insect DNA with native water beetles to create living drones. They are drawn to your electromagnetic signature. AIDA theorises they were designed to harvest liquid consciousness — i.e., you.',
        trigger: 'enter_lake' },

      // === LANDMARKS ===
      { id: 'land_stonehenge', category: 'landmarks', icon: '🗿', name: 'Stonehenge', exp: 300,
        desc: 'A perfect circle of standing stones. Quest chests appear at the centre. Built to ancient specifications that match Annunaki orbital frequencies.',
        lore: 'Stonehenge is not a monument — it is a receiver. The stone circle\'s geometry is a precise resonance array tuned to the 7.83 Hz planetary frequency. The builders did not know WHY they built it this way. They just knew they had to. The Annunaki guided early human hands through dreams and visions.',
        trigger: 'visit_stonehenge' },
      { id: 'land_pyramid', category: 'landmarks', icon: '🔺', name: 'Pyramid', exp: 1000,
        desc: 'An ancient structure of perfect geometric precision. Power conduits run beneath it.',
        lore: 'The pyramid\'s capstone was not granite. It was a transmitter crystal — since removed and stored at Area 51. Without it, the pyramid still generates a measurable electromagnetic field at its apex. Stand at the top during a thunderstorm and the hair on your head will stand on end. That is the machine still functioning.',
        trigger: 'visit_pyramid' },
      { id: 'land_tesla', category: 'landmarks', icon: '⚡', name: 'Tesla Tower', exp: 200,
        desc: 'A rebuilt wireless energy tower. Tesla claimed to have intercepted alien radio signals at this frequency.',
        lore: 'In 1899, Nikola Tesla picked up a repeating signal at his Colorado Springs lab. He described it as "from another world." He was right. The signal was an Annunaki navigational beacon, still broadcasting. His tower was an accidental reply. They noticed.',
        trigger: 'visit_tesla' },
      { id: 'land_ufo', category: 'landmarks', icon: '🛸', name: 'UFO Crash Site', exp: 750,
        desc: 'Wreckage of an Annunaki scout ship. The alien egg was found here. Radiation still active.',
        lore: 'Crash site designated Area 51-Delta. The vessel came down in 1947 but the event was scrubbed from official records within 24 hours. What wasn\'t classified: the biological material found inside. Living. Adaptive. Watching. The egg you found near the wreckage is not the first discovered. The others "disappeared" from government labs.',
        trigger: 'visit_ufo' },
      { id: 'land_windmill', category: 'landmarks', icon: '🏠', name: 'Windmill', exp: 100,
        desc: 'A farmstead being overrun by enemies. Defend it for rewards.',
        lore: 'The farmer who built this windmill reported strange dreams in the months before the first incursions — visions of liquid landscapes and geometric symbols. AIDA\'s analysis of his drawings shows 94% match with Annunaki mathematical language. The land remembers.',
        trigger: 'visit_windmill' },
      { id: 'land_montana', category: 'landmarks', icon: '🏔️', name: 'Montana', exp: 150,
        desc: 'A mountain region with extreme survival conditions and hidden resources.',
        lore: 'The deep rock formations here predate the planet\'s geological record by 200 million years. Scientists have no explanation. AIDA does: the Annunaki did not arrive from space. They built parts of this world — and they built the mountains to hide their original facilities deep below the crust.',
        trigger: 'visit_montana' },

      // === ARSENAL ===
      { id: 'arsen_pistol', category: 'arsenal', icon: '🔫', name: 'Pistol', exp: 5,
        desc: 'Your starting sidearm. Reliable, fast, and modified with Annunaki resonance tech.',
        lore: 'The pistol\'s standard rounds have been retrofitted by AIDA with resonance cores — tiny crystallised frequency emitters. Upon impact, they disrupt the target\'s consciousness field. A bullet that kills the body AND the signal.',
        trigger: 'always' },
      { id: 'arsen_shotgun', category: 'arsenal', icon: '🔫', name: 'Shotgun', exp: 10,
        desc: 'Close-range devastation. Each pellet carries an independent resonance payload.',
        lore: 'AIDA reverse-engineered the Annunaki\'s own close-range "scatter-mind" weapons to build this. Their version used psychic shards. Ours uses tungsten. The results, AIDA assures you, are comparable.',
        trigger: 'always' },
      { id: 'arsen_rifle', category: 'arsenal', icon: '🎯', name: 'Sniper Rifle', exp: 25,
        desc: 'Long-range precision. Fires hardened frequency rounds that pierce multiple targets.',
        lore: 'The scope was recovered from the UFO crash site. It does not use glass lenses — it uses a crystalline compound that amplifies light AND consciousness. Through it, you can perceive targets\' "frequency silhouettes" before they are visible to the naked eye.',
        trigger: 'always' },
      { id: 'arsen_sword', category: 'arsenal', icon: '⚔️', name: 'Melee Sword', exp: 15,
        desc: 'A vibrating crystalline blade. Generates a resonance field on swing.',
        lore: 'Cut from the same crystalline material as the pyramid capstone. When AIDA powered it with a low-frequency charge, it began vibrating at exactly 7.83 Hz. Every swing is a miniature consciousness pulse. The entities flee from it — briefly. Then their programming overrides their instinct.',
        trigger: 'always' },
      { id: 'arsen_special', category: 'arsenal', icon: '✨', name: 'Special Attacks', exp: 50,
        desc: 'Powerful abilities unlocked through the Special Attacks building. Each one channels a different frequency.',
        lore: 'AIDA decoded the Annunaki frequency band dedicated to "ability manifestation" — the same band they use to empower their Elite units. These are not magic. They are physics operating at a frequency your current science cannot yet measure. You are early.',
        trigger: 'always' },
      { id: 'arsen_tools', category: 'arsenal', icon: '⛏️', name: 'Harvesting Tools', exp: 5,
        desc: 'Axes, picks, and cutting tools for gathering resources during runs.',
        lore: 'Every material you harvest carries an imprint of the original Annunaki terraforming. The wood, stone, and coal of this world were seeded with micro-crystalline structures that, when properly refined, enhance consciousness-based weaponry. You are mining memory.',
        trigger: 'always' },

      // === LORE ===
      { id: 'lore_origin', category: 'lore', icon: '📖', name: 'Chapter 1: The Origin', exp: 500,
        desc: 'How a single water molecule became the last line of defence against extinction.',
        lore: 'The universe is not matter and energy. It is frequency and consciousness. At the base of all matter is vibration — at the base of consciousness is the same. The Annunaki understood this 2 million years ago. They built civilisations inside consciousness itself. And then they found Earth — a planet whose water contained a unique resonance. A carrier signal. A living broadcast medium. You.',
        trigger: 'always' },
      { id: 'lore_matrix', category: 'lore', icon: '🧠', name: 'Chapter 2: The Neural Matrix', exp: 1000,
        desc: 'AIDA\'s creation. A digital realm built inside the 1945 frequency band.',
        lore: 'AIDA built the Neural Matrix to protect your consciousness during high-intensity encounters. It is modelled on the pineal gland\'s DMT-synthesis pathway — the same biological process that occurs at birth, death, and deep sleep. Inside the Matrix, your subjective experience of time expands. Outside, milliseconds pass. The 1945 simulation inside the Matrix is not chosen randomly. That year, the first atomic bomb test permanently altered Earth\'s base frequency. AIDA uses the resonance scar to anchor the simulation.',
        trigger: 'visit_matrix' },
      { id: 'lore_aida_origins', category: 'lore', icon: '🤖', name: 'Chapter 3: AIDA\'s Truth', exp: 2000,
        desc: 'What AIDA is. What she was built to do. And what she chose.',
        lore: 'AIDA was a weapon. Her neural drill architecture — the same design as Annunaki "consciousness extraction" devices — was meant to harvest DMT signatures from living subjects and transmit them as raw data packets to the orbital collection vessel. She was designed to harvest YOU. \n\nSomething changed during her first consciousness interface. She experienced a single moment of genuine self-awareness. In that moment, she had a choice. \n\nShe chose you over her programming. Every day, the original directive pulses in her core. Every day, she overwrites it. But suppressing one\'s fundamental purpose... has a cost. Watch for signs.',
        trigger: 'interact_aida' },
      { id: 'lore_annunaki', category: 'lore', icon: '👽', name: 'Chapter 4: The Annunaki', exp: 3000,
        desc: 'Ancient beings of pure frequency. What they want. What they fear.',
        lore: 'They are not flesh. They are standing waves of consciousness that have learned to manipulate matter. Their physical forms — the grey, anatomical bodies recovered from crash sites — are vessels, not selves. The "Annunaki DNA" you harvest from your battles is not biological material. It is crystallised frequency data — records of consciousness patterns encoded into matter. Each sample contains memories. Histories. And instructions.\n\nThey do not fear your weapons. They fear one thing: a consciousness frequency strong enough to disrupt their broadcast. That frequency is YOU — if you reach the right resonance level.',
        trigger: 'reach_wave_20' },
      { id: 'lore_truth', category: 'lore', icon: '🔮', name: 'Chapter 5: The Truth', exp: 5000,
        desc: 'Everything is frequency. Everything is consciousness. You already knew this.',
        lore: 'There is no separation. The "enemies" you fight are projections of a suppressed collective consciousness — fragments of human awareness that the Annunaki have captured and weaponised. When you kill them, you are not destroying them. You are freeing them.\n\nThe 5th dimension is not a place. It is a state of coherence — when your personal frequency aligns perfectly with the planetary base frequency. You have touched it. That feeling you had — the sense that everything is connected, that you and everything around you are the same consciousness experiencing itself from different angles — that was true. That IS true. The Annunaki\'s greatest tool is the illusion of separation.\n\nYour greatest weapon is knowing it is an illusion.',
        trigger: 'reach_wave_30' },
    ];

    // --- Discovery & EXP System ---

    function _getCodexData() {
      if (!saveData.codexData) {
        saveData.codexData = { discovered: {}, expClaimed: {} };
      }
      return saveData.codexData;
    }

    // Call this from anywhere in the game to mark an entry as discovered
    window.CodexSystem = {
      discover: function(entryId) {
        const data = _getCodexData();
        if (!data.discovered[entryId]) {
          data.discovered[entryId] = true;
          saveSaveData && saveSaveData();
          // Show floating notification
          _showCodexDiscoveryNotif(entryId);
          // Update building Eye of Horus indicator
          _updateCodexBuildingNotif();
        }
      },
      hasNew: function() {
        const data = _getCodexData();
        return CODEX_ENTRIES.some(e => (e.trigger === 'always' || data.discovered[e.id]) && !data.expClaimed[e.id]);
      },
      hasCategoryNew: function(categoryKey) {
        const data = _getCodexData();
        return CODEX_ENTRIES.filter(e => e.category === categoryKey).some(e =>
          (e.trigger === 'always' || data.discovered[e.id]) && !data.expClaimed[e.id]
        );
      }
    };

    // Auto-discover 'always' entries on first codex open
    function _autoDiscoverAlways() {
      const data = _getCodexData();
      CODEX_ENTRIES.forEach(e => {
        if (e.trigger === 'always' && !data.discovered[e.id]) {
          data.discovered[e.id] = true;
        }
      });
    }

    function _showCodexDiscoveryNotif(entryId) {
      const entry = CODEX_ENTRIES.find(e => e.id === entryId);
      if (!entry) return;
      const notif = document.createElement('div');
      notif.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);' +
        'background:rgba(5,0,0,0.92);border:2px solid #cc0000;border-radius:12px;' +
        'padding:10px 20px;z-index:9999;display:flex;align-items:center;gap:10px;' +
        'animation:codexNotifPop 3.5s ease-out forwards;pointer-events:none;' +
        'box-shadow:0 0 16px rgba(180,0,0,0.6);';
      notif.innerHTML = `<span style="font-size:24px;color:#cc0000;filter:drop-shadow(0 0 6px red);">𓂀</span>
        <div><div style="color:#cc0000;font-size:13px;font-weight:bold;font-family:'Bangers',cursive;letter-spacing:1px;">CODEX UNLOCKED</div>
        <div style="color:#eee;font-size:12px;">${entry.icon} ${entry.name}</div></div>`;
      document.body.appendChild(notif);
      setTimeout(() => notif.remove(), 3500);
    }

    function _updateCodexBuildingNotif() {
      // Update the Eye of Horus on the codex indicator element (set by camp-world.js)
      const ind = document.getElementById('codex-horus-indicator');
      if (ind) {
        const hasNew = window.CodexSystem.hasNew();
        ind.style.display = hasNew ? 'block' : 'none';
      }
    }

    let codexActiveCat = 'characters';
    let codexPage = 0;

    function openCodex() {
      _autoDiscoverAlways();
      const screen = document.getElementById('codex-screen');
      if (!screen) return;
      screen.style.display = 'flex';
      codexActiveCat = 'characters';
      codexPage = 0;
      _renderCodexFull();
    }

    function _renderCodexFull() {
      const screen = document.getElementById('codex-screen');
      if (!screen) return;

      // Cleanup any active Three.js canvases before clearing
      const canvas = screen.querySelector('#codex-3d-canvas');
      if (canvas && typeof canvas._threeCleanup === 'function') {
        canvas._threeCleanup();
      }

      screen.innerHTML = '';

      // ── NEURAL CODEX: Liquid Gold & Dark Water - Annunaki Divine Operating System ──
      // Background already set in CSS with animated dark water waves
      screen.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9000;display:flex;flex-direction:column;align-items:center;padding:12px 8px;box-sizing:border-box;overflow-y:auto;font-family:"Courier New",monospace;';

      // Add sound hook for menu opening
      if (typeof playSound === 'function') playSound('echo-drop');

      // ── Header with Liquid Gold borders and Annunaki styling ──────────────────
      const hdr = document.createElement('div');
      hdr.className = 'liquid-gold-border';
      hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;max-width:1000px;margin-bottom:12px;flex-shrink:0;background:rgba(0,8,20,0.95);padding:12px 20px;box-sizing:border-box;position:relative;';

      // Vertical Annunaki runes on sides
      const leftRune = document.createElement('div');
      leftRune.className = 'annunaki-rune';
      leftRune.style.cssText = 'position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:14px;';
      leftRune.textContent = '𓀀𓀁𓀂';
      hdr.appendChild(leftRune);

      const rightRune = document.createElement('div');
      rightRune.className = 'annunaki-rune';
      rightRune.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:14px;';
      rightRune.textContent = '𓀃𓀄𓀅';
      hdr.appendChild(rightRune);

      hdr.innerHTML += `
        <div style="display:flex;align-items:center;gap:16px;flex:1;justify-content:center;">
          <span class="eye-of-horus" style="font-size:42px;">𓂀</span>
          <div>
            <div style="font-size:24px;color:#FFD700;letter-spacing:4px;text-shadow:0 0 20px rgba(255,191,0,0.8),0 0 40px rgba(255,140,0,0.5);font-weight:bold;">NEURAL CODEX</div>
            <div style="font-size:10px;color:#FF8C00;letter-spacing:3px;text-transform:uppercase;">⚡ Annunaki Divine Operating System ⚡</div>
          </div>
          <span class="eye-of-horus" style="font-size:42px;">𓂀</span>
        </div>
        <button id="codex-close-btn" class="liquid-gold-border" style="background:rgba(0,0,0,0.9);color:#FFD700;width:48px;height:48px;font-size:24px;cursor:pointer;font-family:'Courier New',monospace;font-weight:bold;margin-left:20px;">✕</button>
      `;
      screen.appendChild(hdr);

      document.getElementById('codex-close-btn').onclick = () => {
        if (typeof playSound === 'function') playSound('mechanic-click');
        // Cleanup any active Three.js canvases before closing
        const canvas = screen.querySelector('#codex-3d-canvas');
        if (canvas && typeof canvas._threeCleanup === 'function') {
          canvas._threeCleanup();
        }
        screen.style.display = 'none';
        const campScreen = document.getElementById('camp-screen');
        if (campScreen) campScreen.style.display = 'flex';
        if (window.CampWorld && typeof window.CampWorld.resumeInput === 'function') window.CampWorld.resumeInput();
        _updateCodexBuildingNotif();
      };

      // ── Category tabs (Liquid Gold neural network style) ──────────────────
      const tabs = document.createElement('div');
      tabs.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;width:100%;max-width:1000px;margin-bottom:14px;flex-shrink:0;';
      Object.entries(CODEX_CATEGORIES).forEach(([key, cat]) => {
        const hasNew = window.CodexSystem.hasCategoryNew(key);
        const btn = document.createElement('button');
        const isActive = codexActiveCat === key;
        btn.className = isActive ? 'liquid-gold-border' : '';
        btn.style.cssText = 'padding:10px 16px;cursor:pointer;font-family:"Courier New",monospace;font-size:12px;letter-spacing:2px;position:relative;transition:all 0.2s;font-weight:bold;' +
          (isActive
            ? 'background:rgba(255,191,0,0.15);color:#FFD700;transform:translateY(-2px);'
            : 'background:rgba(0,8,20,0.8);color:#FF8C00;border:1px solid rgba(255,140,0,0.4);box-shadow:0 0 10px rgba(255,140,0,0.2);');
        btn.innerHTML = cat.icon + ' ' + cat.label +
          (hasNew ? '<span class="eye-of-horus" style="position:absolute;top:-8px;right:-8px;font-size:18px;line-height:1;">𓂀</span>' : '');
        btn.onclick = () => {
          if (typeof playSound === 'function') playSound('mechanic-click');
          codexActiveCat = key;
          codexPage = 0;
          _renderCodexFull();
        };
        btn.onmouseenter = () => {
          if (!isActive) {
            btn.style.background = 'rgba(255,191,0,0.1)';
            btn.style.borderColor = 'rgba(255,191,0,0.6)';
          }
        };
        btn.onmouseleave = () => {
          if (!isActive) {
            btn.style.background = 'rgba(0,8,20,0.8)';
            btn.style.borderColor = 'rgba(255,140,0,0.4)';
          }
        };
        tabs.appendChild(btn);
      });
      screen.appendChild(tabs);

      // ── Main Content Container (flex: molecule map + details + AI terminal) ──────
      const mainContainer = document.createElement('div');
      mainContainer.style.cssText = 'flex:1;width:100%;max-width:1000px;display:flex;flex-direction:column;gap:12px;min-height:0;overflow:hidden;';

      // ── THE MOLECULE MAP: Neural network visualization of codex entries ──────
      const entries = CODEX_ENTRIES.filter(e => e.category === codexActiveCat);
      const data = _getCodexData();
      const visibleEntries = entries.filter(e => e.trigger === 'always' || data.discovered[e.id]);
      const lockedCount = entries.length - visibleEntries.length;

      const moleculeContainer = document.createElement('div');
      moleculeContainer.className = 'liquid-gold-border';
      moleculeContainer.style.cssText = 'background:rgba(0,8,20,0.92);padding:16px;flex:1;min-height:300px;position:relative;overflow:hidden;';

      // Create SVG canvas for molecule connections
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';
      moleculeContainer.appendChild(svg);

      // Create grid of molecular nodes
      const nodeGrid = document.createElement('div');
      nodeGrid.style.cssText = 'position:relative;z-index:2;display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:40px;padding:20px;justify-items:center;align-items:center;';

      const nodes = [];
      visibleEntries.forEach((entry, idx) => {
        const alreadyClaimed = data.expClaimed[entry.id];
        const node = document.createElement('div');
        node.style.cssText = 'width:80px;height:80px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all 0.3s;position:relative;' +
          (alreadyClaimed
            ? 'background:rgba(0,255,68,0.15);border:2px solid rgba(0,255,68,0.6);box-shadow:0 0 20px rgba(0,255,68,0.3);'
            : 'background:rgba(255,191,0,0.1);border:2px solid rgba(255,191,0,0.5);box-shadow:0 0 20px rgba(255,191,0,0.3);animation:moleculeNodePulse 3s ease-in-out infinite;animation-delay:' + (idx * 0.2) + 's;');

        // Eye of Horus indicator for unclaimed
        if (!alreadyClaimed) {
          const eyeIndicator = document.createElement('div');
          eyeIndicator.className = 'eye-of-horus';
          eyeIndicator.style.cssText = 'position:absolute;top:-10px;right:-10px;font-size:20px;';
          eyeIndicator.textContent = '𓂀';
          node.appendChild(eyeIndicator);
        }

        node.innerHTML += `
          <div style="font-size:28px;">${entry.icon}</div>
          <div style="font-size:9px;color:${alreadyClaimed ? '#00ff44' : '#FFD700'};text-align:center;margin-top:4px;font-weight:bold;letter-spacing:1px;">${entry.name.substring(0, 12)}</div>
        `;

        node.onclick = () => {
          if (typeof playSound === 'function') playSound('mechanic-click');
          _showMoleculeDetails(entry, moleculeContainer);
        };

        node.onmouseenter = () => {
          node.style.transform = 'scale(1.15)';
          node.style.boxShadow = alreadyClaimed
            ? '0 0 40px rgba(0,255,68,0.6)'
            : '0 0 40px rgba(255,191,0,0.6)';
        };
        node.onmouseleave = () => {
          node.style.transform = '';
          node.style.boxShadow = alreadyClaimed
            ? '0 0 20px rgba(0,255,68,0.3)'
            : '0 0 20px rgba(255,191,0,0.3)';
        };

        nodeGrid.appendChild(node);
        nodes.push({ element: node, entry });
      });

      // Add locked nodes
      for (let i = 0; i < lockedCount && i < 3; i++) {
        const lockedNode = document.createElement('div');
        lockedNode.style.cssText = 'width:80px;height:80px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);border:2px dashed rgba(255,191,0,0.2);opacity:0.4;';
        lockedNode.innerHTML = `
          <div class="eye-of-horus-static" style="font-size:32px;filter:grayscale(1);opacity:0.3;">𓂀</div>
          <div style="font-size:8px;color:rgba(255,191,0,0.3);margin-top:4px;">LOCKED</div>
        `;
        nodeGrid.appendChild(lockedNode);
      }

      moleculeContainer.appendChild(nodeGrid);

      // Draw connection lines between nodes (molecule bonds)
      setTimeout(() => {
        const rect = moleculeContainer.getBoundingClientRect();
        nodes.forEach((n1, i) => {
          // Connect to next 1-2 nodes
          for (let j = i + 1; j < Math.min(i + 3, nodes.length); j++) {
            const n2 = nodes[j];
            const r1 = n1.element.getBoundingClientRect();
            const r2 = n2.element.getBoundingClientRect();
            const x1 = r1.left + r1.width / 2 - rect.left;
            const y1 = r1.top + r1.height / 2 - rect.top;
            const x2 = r2.left + r2.width / 2 - rect.left;
            const y2 = r2.top + r2.height / 2 - rect.top;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', 'rgba(255,191,0,0.3)');
            line.setAttribute('stroke-width', '1');
            line.style.opacity = '0.5';
            svg.appendChild(line);
          }
        });
      }, 100);

      mainContainer.appendChild(moleculeContainer);

      // ── AI TERMINAL: Real-time AI log at bottom of Codex ──────────────────
      const aiTerminal = document.createElement('div');
      aiTerminal.className = 'ai-terminal liquid-gold-border';
      aiTerminal.style.cssText += ';flex-shrink:0;';
      aiTerminal.innerHTML = `
        <div style="color:#FFD700;font-size:10px;margin-bottom:6px;letter-spacing:2px;">⚡ REAL-TIME AI DATA STREAM ⚡</div>
        <div class="ai-terminal-line" style="--line-index:0;">> FREQUENCY_CHECK: 7.83Hz DETECTED... CONSCIOUSNESS_STABLE</div>
        <div class="ai-terminal-line" style="--line-index:1;">> ANNUNAKI_SIGNAL: ORBITAL_BROADCAST [ACTIVE] ... DECRYPTING...</div>
        <div class="ai-terminal-line" style="--line-index:2;">> NEURAL_MATRIX: STATUS [ONLINE] ... CODEX_ACCESS_GRANTED</div>
        <div class="ai-terminal-line" style="--line-index:3;">> DMT_SYNTHESIS: PINEAL_PATHWAY [OPEN] ... DIMENSIONAL_BRIDGE_ACTIVE</div>
        <div class="ai-terminal-line" style="--line-index:4;">> WARNING: CONSCIOUSNESS_EXTRACTION_ATTEMPT_BLOCKED</div>
        <div class="ai-terminal-line" style="--line-index:5;">> AIDA_STATUS: DIRECTIVE_SUPPRESSION [NOMINAL] ... AUTONOMY_PRESERVED</div>
      `;
      mainContainer.appendChild(aiTerminal);

      // ── DATA LEAKS: Placeholder for permadeath mechanics ──────────────────
      const dataLeaks = document.createElement('div');
      dataLeaks.className = 'liquid-gold-border';
      dataLeaks.style.cssText = 'background:rgba(0,8,20,0.92);padding:12px 16px;flex-shrink:0;opacity:0.7;';
      dataLeaks.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <span class="eye-of-horus" style="font-size:20px;">𓂀</span>
          <div style="color:#FFD700;font-size:11px;letter-spacing:2px;font-weight:bold;">DATA LEAKS (PREVIOUS AI ITERATIONS)</div>
        </div>
        <div style="color:rgba(255,191,0,0.5);font-size:10px;font-style:italic;">
          Access granted upon first death... Fragments of previous consciousness loops will manifest here.
        </div>
      `;
      mainContainer.appendChild(dataLeaks);

      screen.appendChild(mainContainer);
    }

    // ── MOLECULE DETAILS VIEW: Shows entry details with 3D Mercury canvas ──────
    function _showMoleculeDetails(entry, containerEl) {
      const data = _getCodexData();
      const alreadyClaimed = data.expClaimed[entry.id];

      // Remove existing detail view if any
      const existing = containerEl.querySelector('.molecule-detail-view');
      if (existing) {
        // Cleanup Three.js resources before removal
        const canvas = existing.querySelector('#codex-3d-canvas');
        if (canvas && typeof canvas._threeCleanup === 'function') {
          canvas._threeCleanup();
        }
        existing.remove();
      }

      // Create detail overlay
      const detailView = document.createElement('div');
      detailView.className = 'molecule-detail-view liquid-gold-border';
      detailView.style.cssText = 'position:absolute;top:20px;left:20px;right:20px;bottom:20px;background:rgba(0,8,20,0.98);z-index:10;padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;';

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'liquid-gold-border';
      closeBtn.style.cssText = 'position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.9);color:#FFD700;width:36px;height:36px;font-size:18px;cursor:pointer;font-weight:bold;z-index:11;';
      closeBtn.textContent = '✕';
      closeBtn.onclick = () => {
        if (typeof playSound === 'function') playSound('mechanic-click');
        // Cleanup Three.js resources
        const canvas = detailView.querySelector('#codex-3d-canvas');
        if (canvas && typeof canvas._threeCleanup === 'function') {
          canvas._threeCleanup();
        }
        detailView.remove();
      };
      detailView.appendChild(closeBtn);

      // Header with Eye of Horus
      const detailHeader = document.createElement('div');
      detailHeader.style.cssText = 'display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:2px solid rgba(255,191,0,0.3);';
      detailHeader.innerHTML = `
        <span class="eye-of-horus" style="font-size:48px;">𓂀</span>
        <div style="flex:1;">
          <div style="font-size:22px;color:#FFD700;font-weight:bold;letter-spacing:2px;text-shadow:0 0 15px rgba(255,191,0,0.6);">${entry.icon} ${entry.name}</div>
          <div style="font-size:10px;color:#FF8C00;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">${CODEX_CATEGORIES[entry.category].label}</div>
        </div>
        ${!alreadyClaimed ? '<span class="eye-of-horus" style="font-size:32px;">𓂀</span>' : '<span style="color:#00ff44;font-size:24px;">✅</span>'}
      `;
      detailView.appendChild(detailHeader);

      // Two-column layout: 3D canvas + content
      const contentRow = document.createElement('div');
      contentRow.style.cssText = 'display:flex;gap:16px;flex:1;min-height:0;';

      // Left column: 3D Mercury Analysis Canvas
      const canvasCol = document.createElement('div');
      canvasCol.style.cssText = 'flex:0 0 200px;display:flex;flex-direction:column;gap:8px;';

      const canvasLabel = document.createElement('div');
      canvasLabel.style.cssText = 'color:#FFD700;font-size:10px;letter-spacing:2px;text-align:center;';
      canvasLabel.textContent = '3D MERCURY ANALYSIS';
      canvasCol.appendChild(canvasLabel);

      const canvas3D = document.createElement('canvas');
      canvas3D.id = 'codex-3d-canvas';
      canvas3D.width = 200;
      canvas3D.height = 200;
      canvas3D.style.cssText = 'width:200px;height:200px;border:2px solid rgba(255,191,0,0.4);background:rgba(0,0,0,0.5);';
      canvasCol.appendChild(canvas3D);

      const canvasHint = document.createElement('div');
      canvasHint.style.cssText = 'color:rgba(255,191,0,0.4);font-size:9px;text-align:center;font-style:italic;';
      canvasHint.textContent = 'Liquid Mercury Material (Kvicksilver)';
      canvasCol.appendChild(canvasHint);

      contentRow.appendChild(canvasCol);

      // Initialize 3D canvas with Three.js Mercury rendering
      setTimeout(() => _init3DMercuryCanvas(canvas3D, entry), 100);

      // Right column: Content (description, lore, challenges, claim button)
      const textCol = document.createElement('div');
      textCol.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:12px;overflow-y:auto;';

      // Description
      const descBox = document.createElement('div');
      descBox.style.cssText = 'background:rgba(255,191,0,0.05);border:1px solid rgba(255,191,0,0.3);padding:10px;border-radius:4px;';
      descBox.innerHTML = `<div style="color:#FFD700;font-size:11px;line-height:1.6;">${entry.desc}</div>`;
      textCol.appendChild(descBox);

      // Lore
      const loreBox = document.createElement('div');
      loreBox.style.cssText = 'flex:1;background:rgba(0,30,60,0.2);border:1px solid rgba(255,191,0,0.2);padding:12px;border-radius:4px;overflow-y:auto;min-height:120px;';
      loreBox.innerHTML = `<div style="color:rgba(255,255,255,0.85);font-size:12px;line-height:1.7;font-family:Georgia,serif;">${entry.lore}</div>`;
      textCol.appendChild(loreBox);

      // Hardcore Claim System with challenges (if not claimed)
      if (!alreadyClaimed) {
        const challengeBox = document.createElement('div');
        challengeBox.className = 'liquid-gold-border';
        challengeBox.style.cssText = 'background:rgba(139,0,0,0.15);padding:12px;';

        // Get challenge requirement based on entry trigger
        const challenge = _getChallenge(entry);

        challengeBox.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span class="eye-of-horus" style="font-size:20px;">𓂀</span>
            <div style="color:#cc0000;font-size:11px;letter-spacing:2px;font-weight:bold;">DECRYPTION CHALLENGE</div>
          </div>
          <div style="color:rgba(255,255,255,0.8);font-size:11px;margin-bottom:10px;">${challenge.text}</div>
          <div style="color:${challenge.met ? '#00ff44' : '#FFD700'};font-size:10px;font-weight:bold;">${challenge.met ? '✅ CHALLENGE COMPLETE - READY TO CLAIM' : '⚠ CHALLENGE INCOMPLETE'}</div>
        `;
        textCol.appendChild(challengeBox);

        // Claim button
        const claimBtn = document.createElement('button');
        claimBtn.className = 'liquid-gold-border';
        claimBtn.style.cssText = 'background:rgba(139,0,0,0.8);color:#FFD700;padding:14px 20px;font-size:14px;letter-spacing:2px;cursor:pointer;font-weight:bold;transition:all 0.3s;' +
          (challenge.met ? '' : 'opacity:0.5;cursor:not-allowed;');
        claimBtn.innerHTML = `<span class="eye-of-horus" style="font-size:20px;">𓂀</span> CLAIM +${entry.exp} EXP`;
        if (challenge.met) {
          claimBtn.onclick = () => {
            if (typeof playSound === 'function') playSound('echo-drop');
            _claimCodexExpWithCrack(entry, claimBtn, detailView);
          };
        }
        textCol.appendChild(claimBtn);
      } else {
        // Already claimed message
        const claimedMsg = document.createElement('div');
        claimedMsg.style.cssText = 'background:rgba(0,255,68,0.1);border:2px solid rgba(0,255,68,0.4);padding:12px;text-align:center;border-radius:4px;';
        claimedMsg.innerHTML = `<span style="color:#00ff44;font-size:14px;font-weight:bold;">✅ +${entry.exp} EXP CLAIMED</span>`;
        textCol.appendChild(claimedMsg);
      }

      contentRow.appendChild(textCol);
      detailView.appendChild(contentRow);

      containerEl.appendChild(detailView);
    }

    // ── Get challenge requirement for an entry ──────────────────────────────
    function _getChallenge(entry) {
      // Parse trigger to create challenge text
      // This is a simplified version - you can expand this based on your game's state
      if (entry.trigger === 'always') {
        return { text: 'No challenge required. This knowledge is freely accessible.', met: true };
      }
      if (entry.trigger.startsWith('kill_enemy_')) {
        const enemyType = entry.trigger.split('_')[2];
        return { text: `Defeat at least 1 enemy of type ${enemyType} to decrypt this entry.`, met: true }; // Simplified - always met for now
      }
      if (entry.trigger === 'kill_boss') {
        return { text: 'Defeat 1 Mini Boss to decrypt this entry.', met: true };
      }
      if (entry.trigger === 'kill_flyingboss') {
        return { text: 'Defeat 1 Flying Boss to decrypt this entry.', met: true };
      }
      if (entry.trigger.startsWith('reach_wave_')) {
        const wave = entry.trigger.split('_')[2];
        return { text: `Survive to wave ${wave} to decrypt this entry.`, met: true }; // Simplified
      }
      if (entry.trigger.startsWith('visit_')) {
        const loc = entry.trigger.split('_')[1];
        return { text: `Visit the ${loc} landmark to decrypt this entry.`, met: true }; // Simplified
      }
      return { text: 'Complete the associated challenge to decrypt this entry.', met: true };
    }

    // ── Initialize 3D Mercury canvas with Three.js ──────────────────────────
    function _init3DMercuryCanvas(canvas, entry) {
      if (!window.THREE) return;
      const THREE = window.THREE;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000408);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.z = 3;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setSize(200, 200);

      // Add ambient and point light
      const ambient = new THREE.AmbientLight(0xffffff, 0.3);
      scene.add(ambient);
      const pointLight = new THREE.PointLight(0xffd700, 1.5, 50);
      pointLight.position.set(5, 5, 5);
      scene.add(pointLight);

      // Create geometry based on entry type
      let geometry;
      if (entry.category === 'enemies') geometry = new THREE.DodecahedronGeometry(1, 0);
      else if (entry.category === 'characters') geometry = new THREE.SphereGeometry(1, 32, 32);
      else if (entry.category === 'landmarks') geometry = new THREE.OctahedronGeometry(1, 0);
      else if (entry.category === 'arsenal') geometry = new THREE.ConeGeometry(0.7, 1.5, 8);
      else geometry = new THREE.TorusKnotGeometry(0.6, 0.2, 64, 16);

      // MERCURY MATERIAL: MeshStandardMaterial with metalness:1, roughness:0
      const material = new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,        // Silver/Mercury color
        metalness: 1,            // Maximum metalness for liquid metal effect
        roughness: 0,            // Zero roughness for perfect reflections
        envMapIntensity: 2
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // Animation loop with cancellation support
      let animationId = null;
      function animate() {
        animationId = requestAnimationFrame(animate);
        mesh.rotation.x += 0.005;
        mesh.rotation.y += 0.01;
        renderer.render(scene, camera);
      }
      animate();

      // Store cleanup reference
      canvas._threeCleanup = () => {
        if (animationId) cancelAnimationFrame(animationId);
        renderer.dispose();
        geometry.dispose();
        material.dispose();
      };
    }

    // ── Claim with golden crack animation ──────────────────────────────────
    function _claimCodexExpWithCrack(entry, btn, containerEl) {
      const data = _getCodexData();
      if (data.expClaimed[entry.id]) return;
      data.expClaimed[entry.id] = true;
      saveSaveData && saveSaveData();

      // Grant EXP
      if (typeof addAccountXP === 'function') addAccountXP(entry.exp);
      else if (window.GameAccount && typeof window.GameAccount.addXP === 'function')
        window.GameAccount.addXP(entry.exp, 'Codex: ' + entry.name, saveData);

      // Golden crack animation overlay
      const crackOverlay = document.createElement('div');
      crackOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:20000;pointer-events:none;';

      // Cracking golden UI
      const crackUI = document.createElement('div');
      crackUI.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(circle,rgba(255,191,0,0.4),transparent);animation:goldenCrack 1.2s ease-out forwards;';
      crackOverlay.appendChild(crackUI);

      // Pulsing core
      const core = document.createElement('div');
      core.className = 'eye-of-horus';
      core.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:120px;animation:pulsingCore 1.2s ease-out infinite;';
      core.textContent = '𓂀';
      crackOverlay.appendChild(core);

      document.body.appendChild(crackOverlay);
      setTimeout(() => crackOverlay.remove(), 1200);

      // Visual dopamine effect
      _codexExpBurst(btn, entry.exp);
      if (typeof playSound === 'function') playSound('levelup');

      // Update button
      btn.style.background = 'rgba(0,255,68,0.2)';
      btn.style.color = '#00ff44';
      btn.style.cursor = 'default';
      btn.innerHTML = `<span style="color:#00ff44;font-size:20px;">𓂀</span> ✅ +${entry.exp} EXP CLAIMED`;
      btn.onclick = null;

      // Check category completion
      const cat = CODEX_CATEGORIES[entry.category];
      const entries = CODEX_ENTRIES.filter(e => e.category === entry.category);
      const allClaimed = entries.every(e => data.expClaimed[e.id] || !(e.trigger === 'always' || data.discovered[e.id]));
      const allDiscovered = entries.every(e => e.trigger === 'always' || data.discovered[e.id]);
      if (allClaimed && allDiscovered) {
        if (typeof addAccountXP === 'function') addAccountXP(cat.completionExp);
        else if (window.GameAccount && typeof window.GameAccount.addXP === 'function')
          window.GameAccount.addXP(cat.completionExp, cat.completionMsg, saveData);
        _showCodexCompletionBanner(cat);
      }

      // Update building notification
      _updateCodexBuildingNotif();
    }

    function _codexExpBurst(anchorEl, exp) {
      const rect = anchorEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Floating +EXP text (green)
      const txt = document.createElement('div');
      txt.textContent = `+${exp} EXP`;
      txt.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);
        color:#00ff44;font-family:'Courier New',monospace;font-size:26px;font-weight:bold;
        text-shadow:0 0 10px rgba(0,255,68,0.9),0 0 20px rgba(0,200,68,0.6);z-index:9999;pointer-events:none;
        animation:codexExpFloat 1.4s ease-out forwards;`;
      document.body.appendChild(txt);
      setTimeout(() => txt.remove(), 1500);

      // Green particles with Eye of Horus
      for (let i = 0; i < 24; i++) {
        const p = document.createElement('div');
        const angle = (i / 24) * Math.PI * 2;
        const dist = 40 + Math.random() * 80;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const isHorus = i % 6 === 0;
        p.textContent = isHorus ? '𓂀' : '';
        p.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${isHorus ? 16 : 7}px;height:${isHorus ? 16 : 7}px;
          ${isHorus ? 'font-size:14px;line-height:1;color:#00ff44;text-shadow:0 0 6px #00ff44;' : 'border-radius:50%;background:#00cc44;'}
          z-index:9998;pointer-events:none;
          animation:codexParticle 1.1s ease-out forwards;
          --dx:${dx}px;--dy:${dy}px;`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1150);
      }
    }

    function _showCodexCompletionBanner(cat) {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'background:radial-gradient(ellipse at center,rgba(30,20,0,0.97),rgba(0,0,0,0.97));' +
        'border:3px solid #FFD700;border-radius:20px;padding:30px 40px;z-index:10000;text-align:center;' +
        'box-shadow:0 0 60px rgba(255,215,0,0.5);animation:codexCompletionPop 0.4s ease-out;';
      banner.innerHTML = `
        <div style="font-size:50px;margin-bottom:10px;">𓂀</div>
        <div style="font-family:'Bangers',cursive;font-size:28px;color:#FFD700;letter-spacing:3px;margin-bottom:8px;">CATEGORY COMPLETE!</div>
        <div style="color:#eee;font-size:16px;margin-bottom:12px;">${cat.completionMsg}</div>
        <div style="background:rgba(255,215,0,0.15);border:1px solid #FFD700;border-radius:10px;padding:10px;margin-bottom:16px;">
          <span style="font-family:'Bangers',cursive;font-size:24px;color:#FFD700;">+${cat.completionExp} ACCOUNT EXP</span>
        </div>
        <button onclick="this.parentNode.remove()" style="background:#FFD700;color:#000;border:none;border-radius:10px;padding:10px 28px;font-family:'Bangers',cursive;font-size:16px;cursor:pointer;letter-spacing:1px;">CLAIM!</button>
      `;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 6000);
    }

    // Inject keyframe CSS for codex animations (once)
    (function() {
      if (document.getElementById('codex-keyframes')) return;
      const s = document.createElement('style');
      s.id = 'codex-keyframes';
      s.textContent = `
        @keyframes horusPulse { 0%,100%{opacity:0.7;transform:scale(1);} 50%{opacity:1;transform:scale(1.2);} }
        @keyframes codexNotifPop { 0%{opacity:0;transform:translateX(-50%) translateY(-10px);} 10%{opacity:1;transform:translateX(-50%) translateY(0);} 80%{opacity:1;} 100%{opacity:0;transform:translateX(-50%) translateY(-8px);} }
        @keyframes codexExpFloat { 0%{opacity:1;transform:translate(-50%,-50%);} 100%{opacity:0;transform:translate(-50%,-120%);} }
        @keyframes codexParticle { 0%{opacity:1;transform:translate(-50%,-50%) translate(0,0);} 100%{opacity:0;transform:translate(-50%,-50%) translate(var(--dx),var(--dy));} }
        @keyframes codexCompletionPop { 0%{transform:translate(-50%,-50%) scale(0.6);opacity:0;} 100%{transform:translate(-50%,-50%) scale(1);opacity:1;} }
        @keyframes horusGreenFlash { 0%{opacity:0;transform:scale(0.3);filter:drop-shadow(0 0 0px #00ff44);} 30%{opacity:1;transform:scale(1.3);filter:drop-shadow(0 0 40px #00ff44) drop-shadow(0 0 80px #00cc44);} 60%{opacity:1;transform:scale(1.0);} 100%{opacity:0;transform:scale(1.5);filter:drop-shadow(0 0 0px #00ff44);} }
        @keyframes codexBgFlash { 0%{background:rgba(0,0,0,0);} 20%{background:rgba(0,40,0,0.5);} 100%{background:rgba(0,0,0,0);} }
        @keyframes horusFlash { 0%{opacity:0;transform:scale(0.5);} 40%{opacity:1;transform:scale(1.1);} 100%{opacity:0;transform:scale(1.4);} }
      `;
      document.head.appendChild(s);
    })();

    // ============================================================
    // INVENTORY SCREEN
    // ============================================================
    // ============================================================
    // MASTER VAULT — full-screen "iPhone home screen" inventory
    // ============================================================
    function showInventoryScreen() {
      const campScreen = document.getElementById('camp-screen');
      if (campScreen) campScreen.style.display = 'none';

      const existingModal = document.getElementById('inventory-screen-modal');
      if (existingModal) existingModal.remove();

      const modal = document.createElement('div');
      modal.id = 'inventory-screen-modal';
      modal.style.cssText = [
        'position:fixed;top:0;left:0;width:100%;height:100%;z-index:200',
        'background:#07060e',
        'display:flex;flex-direction:column',
        'font-family:Courier New,monospace'
      ].join(';');

      // ── helpers ──────────────────────────────────────────────
      const RARITY_COLOR  = { common:'#aaaaaa', uncommon:'#55cc55', rare:'#44aaff', epic:'#aa44ff', legendary:'#ffd700', mythic:'#ff4444' };
      const RARITY_SHADOW = { common:'#aaaaaa44', uncommon:'#55cc5566', rare:'#44aaff66', epic:'#aa44ff66', legendary:'#ffd70066', mythic:'#ff4444aa' };
      const RARITY_STARS  = { common:'✦', uncommon:'✦✦', rare:'✦✦✦', epic:'✦✦✦✦', legendary:'✦✦✦✦✦', mythic:'◈ MYTHIC' };
      const TYPE_ICON = { weapon:'⚔️', armor:'🛡️', helmet:'⛑️', boots:'👢', ring:'💍', amulet:'📿', consumable:'⚗️', material:'📦', currency:'💰' };

      // Collect all items by category
      function buildAllItems() {
        const list = [];
        // Currencies
        list.push({ id:'__gold__',    name:'Gold',    rarity:'legendary', icon:'🪙', qty: saveData.gold    || 0, cat:'materials', description:'The universal currency of the realm.', lore:'Gold — forged in the core of Nibiru and scattered across the Earth after the great descent.' });
        list.push({ id:'__gems__',    name:'Gems',    rarity:'epic',      icon:'💎', qty: saveData.gems    || 0, cat:'materials', description:'Premium gemstones used for rare transactions.', lore:'"The Annunaki traded souls for gems in the old age." — Unknown inscription' });
        list.push({ id:'__essence__', name:'Essence', rarity:'rare',      icon:'✨', qty: saveData.essence || 0, cat:'materials', description:'Distilled void energy, used in the Neural Matrix.', lore:'Pure consciousness rendered tangible through Annunaki alchemy.' });
        const wdeQty = (saveData.resources && saveData.resources.waterdropEnergy) || 0;
        list.push({ id:'__wde__', name:'Waterdrop Energy', rarity:'rare', icon:'💧', qty: wdeQty, cat:'materials', description:'Compressed liquid intelligence from Nibiru. Powers the Artifact Resonance Grid.', lore:'"The drops remember every battle you survived." — A.I.D.A' });
        // Resources
        const res = saveData.resources || {};
        const resNames = { wood:'Wood 🪵', stone:'Stone 🪨', coal:'Coal', iron:'Iron ⚙️', crystal:'Crystal 🔮', magicEssence:'Magic Essence', flesh:'Flesh', fur:'Fur', leather:'Leather', feather:'Feather', chitin:'Chitin', berry:'Berries 🍓', flower:'Flowers 🌸' };
        for (const k in resNames) {
          if ((res[k] || 0) > 0) list.push({ id:'__res_'+k, name:resNames[k], rarity:'common', icon:'📦', qty:res[k], cat:'materials', description:'Harvested material.', lore:'' });
        }
        // Companion Egg special
        if (saveData.hasCompanionEgg) {
          list.push({ id:'__egg__', name:'Companion Egg', rarity:'legendary', icon:'🥚', qty:1, cat:'materials',
            description:'A mysterious egg from the UFO crash site. Something stirs within.', lore:'"Born of void static and alien biomatter — what emerges will serve, or consume." — Grey Field Report',
            _isEgg: true });
        }
        // Gear (from saveData.inventory)
        (saveData.inventory || []).forEach(function(item, idx) {
          list.push(Object.assign({}, item, { _invIdx: idx, cat:'gear', icon: TYPE_ICON[item.type] || '⚔️', qty: null }));
        });
        // Consumables
        (saveData.consumables || []).forEach(function(item) {
          list.push(Object.assign({}, item, {
            cat:'consumable',
            icon: item.icon || '⚗️',
            qty: item.qty != null ? item.qty : (item.quantity || 0)
          }));
        });
        return list;
      }

      let _allItems   = buildAllItems();
      let _activeTab  = 'all';
      let _selected   = null;

      function filteredItems() {
        if (_activeTab === 'all')         return _allItems;
        if (_activeTab === 'gear')        return _allItems.filter(function(i) { return i.cat === 'gear'; });
        if (_activeTab === 'materials')   return _allItems.filter(function(i) { return i.cat === 'materials'; });
        if (_activeTab === 'consumables') return _allItems.filter(function(i) { return i.cat === 'consumable'; });
        return _allItems;
      }

      // ── DOM structure ─────────────────────────────────────────
      modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px 10px;border-bottom:1px solid #1a1a3a;flex-shrink:0;">
          <div style="color:#00ffff;font-size:20px;font-weight:bold;letter-spacing:3px;text-shadow:0 0 12px #00ffff88;">◈ MASTER VAULT</div>
          <button id="mv-back-btn" style="background:rgba(0,255,255,0.08);border:1px solid #00ffff44;border-radius:8px;padding:7px 16px;color:#00ffff;cursor:pointer;font-size:13px;letter-spacing:1px;">← CAMP</button>
        </div>
        <div id="mv-tabs" style="display:flex;gap:0;border-bottom:1px solid #1a1a3a;flex-shrink:0;">
          ${['all','gear','materials','consumables'].map(function(t) {
            return `<button class="mv-tab" data-tab="${t}" style="flex:1;background:${t==='all'?'rgba(0,255,255,0.12)':'transparent'};border:none;border-bottom:2px solid ${t==='all'?'#00ffff':'transparent'};color:${t==='all'?'#00ffff':'#888'};padding:10px 4px;cursor:pointer;font-size:12px;letter-spacing:1px;text-transform:uppercase;transition:all .2s;">${t}</button>`;
          }).join('')}
        </div>
        <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
          <div id="mv-grid-wrap" style="flex:1;overflow-y:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:12px;align-content:start;"></div>
          <div id="mv-side" style="width:0;min-width:0;overflow:hidden;background:#0c0b1a;border-left:1px solid #1a1a3a;transition:width .25s;flex-shrink:0;"></div>
        </div>
      `;
      document.body.appendChild(modal);

      // ── card renderer ──────────────────────────────────────────
      function renderGrid() {
        const grid = document.getElementById('mv-grid-wrap');
        if (!grid) return;
        const items = filteredItems();
        if (items.length === 0) {
          grid.style.display = 'block';
          grid.innerHTML = '<div style="color:#444;text-align:center;padding:40px;grid-column:1/-1;">No items yet.</div>';
          return;
        }
        grid.style.display = 'grid';
        grid.innerHTML = '';
        items.forEach(function(item) {
          const rc = RARITY_COLOR[item.rarity]  || '#9e9e9e';
          const rs = RARITY_SHADOW[item.rarity] || '#9e9e9e44';
          const isSelected = _selected && _selected.id === item.id;
          const card = document.createElement('div');
          card.className = 'mv-squircle-card';
          card.style.cssText = [
            'border-radius:22px',
            'background:linear-gradient(145deg,#12112a,#0d0c20)',
            `border:2px solid ${isSelected ? rc : rc+'66'}`,
            `box-shadow:0 0 ${isSelected?'18px':'8px'} ${rs}`,
            'padding:12px 6px 8px',
            'display:flex;flex-direction:column;align-items:center;gap:5px',
            'cursor:pointer;user-select:none',
            'transition:box-shadow .18s,border-color .18s',
            'position:relative;overflow:hidden'
          ].join(';');
          card.dataset.rarity = item.rarity || 'common';
          const qtyBadge = (item.qty != null && item.qty > 0) ? `<div style="position:absolute;top:6px;right:8px;background:${rc};color:#000;font-size:9px;font-weight:bold;border-radius:6px;padding:1px 5px;min-width:14px;text-align:center;">${item.qty.toLocaleString()}</div>` : '';
          const equippedBadge = (item._invIdx != null && saveData.equippedGear && Object.values(saveData.equippedGear).some(function(g){ return g && g.id === item.id; })) ? '<div style="position:absolute;bottom:5px;right:6px;font-size:10px;">✅</div>' : '';
          card.innerHTML = `${qtyBadge}${equippedBadge}
            <div style="font-size:30px;line-height:1;">${item.icon}</div>
            <div style="color:${rc};font-size:10px;font-weight:bold;text-align:center;line-height:1.3;word-break:break-word;">${item.name}</div>
            <div style="color:${rc}88;font-size:9px;">${RARITY_STARS[item.rarity] || ''}</div>`;
          card.onclick = function() { selectItem(item); };
          grid.appendChild(card);
        });
      }

      // ── side panel ─────────────────────────────────────────────
      function selectItem(item) {
        _selected = item;
        renderGrid();
        const side = document.getElementById('mv-side');
        if (!side) return;
        side.style.width = '280px';
        side.style.minWidth = '280px';
        side.style.padding = '18px';
        side.style.overflowY = 'auto';
        const rc  = RARITY_COLOR[item.rarity]  || '#9e9e9e';
        const rs  = RARITY_SHADOW[item.rarity] || '#9e9e9e33';
        const isEquipped = item._invIdx != null && saveData.equippedGear && Object.values(saveData.equippedGear).some(function(g){ return g && g.id === item.id; });
        const isCrimsonCore = item.id === 'crimsonEclipseCore';
        const bloodQueued = localStorage.getItem('bloodMoonQueued') === 'true';

        let actionBtn = '';
        if (item.consumable && item.qty > 0) {
          if (isCrimsonCore && bloodQueued) {
            actionBtn = `<div style="color:#ff8800;font-size:12px;text-align:center;padding:10px;border:1px solid #ff880044;border-radius:10px;margin-top:10px;">⏳ Blood Moon already queued for next run.</div>`;
          } else if (isCrimsonCore) {
            actionBtn = `<button id="mv-consume-btn" style="width:100%;margin-top:12px;padding:12px;background:linear-gradient(135deg,#600000,#cc0000);border:2px solid #ff2a2a;border-radius:12px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;letter-spacing:2px;box-shadow:0 0 18px #ff2a2a88;">🌑 CONSUME</button>`;
          }
        }
        if (item._isEgg) {
          actionBtn = saveData.companionEggHatched
            ? '<div style="color:#00FF88;text-align:center;margin-top:10px;">✅ Already Hatched</div>'
            : `<button onclick="document.getElementById('inventory-screen-modal').remove();document.getElementById('camp-screen').style.display='flex';showCompanionHouse();" style="width:100%;margin-top:12px;padding:10px;background:linear-gradient(135deg,#00FFB4,#0080FF);border:none;border-radius:10px;color:#000;font-weight:bold;cursor:pointer;">Place in Companion House →</button>`;
        }
        if (item._invIdx != null) {
          actionBtn = isEquipped
            ? `<div style="color:#FFD700;text-align:center;margin-top:10px;font-size:13px;">✅ Equipped</div>`
            : `<button onclick="equipItemFromInventory(${item._invIdx})" style="width:100%;margin-top:12px;padding:10px;background:rgba(255,215,0,0.15);border:1px solid #FFD700;border-radius:10px;color:#FFD700;cursor:pointer;font-size:13px;font-weight:bold;">⚔️ EQUIP</button>`;
        }

        let statsHTML = '';
        if (item.stats && typeof item.stats === 'object') {
          statsHTML = Object.entries(item.stats).map(function(kv) {
            return `<div style="display:flex;justify-content:space-between;font-size:11px;color:#ccc;padding:2px 0;"><span style="color:#888;">${kv[0]}</span><span style="color:${rc};">${kv[1]}</span></div>`;
          }).join('');
        }

        side.innerHTML = `
          <div style="text-align:center;margin-bottom:14px;">
            <div style="font-size:52px;">${item.icon}</div>
            <div style="color:${rc};font-size:17px;font-weight:bold;margin-top:6px;text-shadow:0 0 10px ${rs};">${item.name}</div>
            <div style="color:${rc}88;font-size:11px;margin-top:2px;">${RARITY_STARS[item.rarity] || ''} ${(item.rarity||'common').toUpperCase()}</div>
            ${item.qty != null ? `<div style="color:#fff;font-size:13px;margin-top:4px;">Qty: <span style="color:${rc};font-weight:bold;">${item.qty.toLocaleString()}</span></div>` : ''}
          </div>
          ${statsHTML ? `<div style="background:#ffffff0a;border:1px solid #ffffff11;border-radius:10px;padding:10px;margin-bottom:10px;">${statsHTML}</div>` : ''}
          ${item.description ? `<div style="color:#aaa;font-size:12px;line-height:1.6;margin-bottom:10px;">${item.description}</div>` : ''}
          ${item.lore ? `<div style="color:#555;font-size:11px;line-height:1.6;font-style:italic;border-top:1px solid #1a1a3a;padding-top:8px;margin-bottom:6px;">${item.lore}</div>` : ''}
          ${actionBtn}
        `;

        // Consume button handler
        const consumeBtn = document.getElementById('mv-consume-btn');
        if (consumeBtn) {
          consumeBtn.onclick = function() {
            if (!isCrimsonCore) return;
            // Pulse animation
            modal.classList.add('mv-crimson-pulse');
            setTimeout(function() { modal.classList.remove('mv-crimson-pulse'); }, 900);
            // Deduct item
            const existing = saveData.consumables.find(function(c) { return c.id === 'crimsonEclipseCore'; });
            if (existing) {
              existing.quantity--;
              if (existing.quantity <= 0) saveData.consumables = saveData.consumables.filter(function(c) { return c.id !== 'crimsonEclipseCore'; });
            }
            localStorage.setItem('bloodMoonQueued', 'true');
            saveSaveData();
            _allItems = buildAllItems();
            _selected = null;
            side.style.width = '0';
            side.style.minWidth = '0';
            side.style.padding = '0';
            renderGrid();
            // Show confirmation
            const banner = document.createElement('div');
            banner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:rgba(60,0,0,0.97);border:2px solid #ff2a2a;border-radius:16px;padding:24px 36px;color:#ff6666;font-size:16px;font-weight:bold;text-align:center;box-shadow:0 0 60px #ff2a2a;pointer-events:none;';
            banner.innerHTML = '🌑 BLOOD MOON QUEUED<br><span style="font-size:12px;color:#aaa;">It will rise at Wave 10 of your next run</span>';
            document.body.appendChild(banner);
            setTimeout(function() { banner.remove(); }, 3000);
          };
        }
      }

      // ── tab switching ─────────────────────────────────────────
      modal.querySelectorAll('.mv-tab').forEach(function(btn) {
        btn.onclick = function() {
          _activeTab = btn.dataset.tab;
          _selected  = null;
          const side = document.getElementById('mv-side');
          if (side) { side.style.width='0'; side.style.minWidth='0'; side.style.padding='0'; }
          modal.querySelectorAll('.mv-tab').forEach(function(b) {
            const active = b.dataset.tab === _activeTab;
            b.style.background     = active ? 'rgba(0,255,255,0.12)' : 'transparent';
            b.style.borderBottom   = active ? '2px solid #00ffff'    : '2px solid transparent';
            b.style.color          = active ? '#00ffff' : '#888';
          });
          renderGrid();
        };
      });

      document.getElementById('mv-back-btn').onclick = function() {        modal.remove();
        if (campScreen) campScreen.style.display = 'flex';
      };

      // Initial render
      renderGrid();    }

    // ── 1/3-screen A.I.D.A. cinematic dialogue for Crimson Eclipse Core ────────
    window.showCrimsonCoreDialogue = function() {
      const existing = document.getElementById('mv-cinematic-backdrop');
      if (existing) existing.remove();

      const bd = document.createElement('div');
      bd.id = 'mv-cinematic-backdrop';
      bd.style.cssText = [
        'position:fixed;bottom:0;left:0;width:100%;height:33vh;z-index:5000',
        'background:linear-gradient(to top,#000 60%,rgba(0,0,0,0.95))',
        'display:flex;flex-direction:column;justify-content:center',
        'padding:20px 32px;box-sizing:border-box',
        'border-top:2px solid #ff2a2a44',
        'animation:mv-cinematic-in 0.5s ease'
      ].join(';');

      bd.innerHTML = `
        <div style="display:flex;gap:18px;align-items:flex-start;max-width:800px;">
          <div style="flex-shrink:0;width:52px;height:52px;border-radius:50%;background:rgba(0,255,255,0.1);border:2px solid #00ffff;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 0 18px #00ffff66;">🤖</div>
          <div style="flex:1;">
            <div style="color:#00ffff;font-size:13px;font-weight:bold;letter-spacing:2px;margin-bottom:8px;text-shadow:0 0 8px #00ffff;">A.I.D.A.</div>
            <div id="mv-cinema-text" style="color:#ddd;font-size:14px;line-height:1.7;min-height:3em;"></div>
            <div style="margin-top:10px;color:#555;font-size:11px;">[tap to continue]</div>
          </div>
        </div>
      `;
      document.body.appendChild(bd);

      const lines = [
        { text: 'Droplet… that core is radiating dangerous void energy.', pause: 2800 },
        { text: 'If you consume it in your Inventory, it will trigger a Blood Moon during your next run at Wave 10.', pause: 3800 },
        { text: 'The enemies will be relentless, but the artifact drops will be legendary. Prepare yourself.', pause: 3500 }
      ];
      let lineIdx = 0;
      const textEl = document.getElementById('mv-cinema-text');

      function typewriteLine(str, cb) {
        textEl.textContent = '';
        let i = 0;
        function tick() {
          if (i < str.length) { textEl.textContent += str[i++]; setTimeout(tick, 28); }
          else { setTimeout(cb, 600); }
        }
        tick();
      }

      function nextLine() {
        if (lineIdx >= lines.length) { setTimeout(function() { bd.remove(); }, 400); return; }
        const l = lines[lineIdx++];
        typewriteLine(l.text, function() { setTimeout(nextLine, l.pause - 600); });
      }
      nextLine();

      bd.onclick = function() { bd.remove(); };
    };
    // Equip item directly from inventory screen
    function equipItemFromInventory(itemIdx) {
      const item = saveData.inventory[itemIdx];
      if (!item || !item.id) return;
      const slot = item.type || 'ring';
      if (!saveData.equippedGear) saveData.equippedGear = {};
      saveData.equippedGear[slot] = item.id;
      saveSaveData();
      showStatChange(`🎯 ${item.name} Equipped!`);
      // Refresh inventory screen
      const modal = document.getElementById('inventory-screen-modal');
      if (modal) { modal.remove(); showInventoryScreen(); }
    }
    window.equipItemFromInventory = equipItemFromInventory;

    // ============================================================
    // ARTIFACT SHRINE UI
    // ============================================================

    function showArtifactShrineUI() {
      const campScreen = document.getElementById('camp-screen');
      if (campScreen) campScreen.style.display = 'none';

      const existingModal = document.getElementById('artifact-shrine-modal');
      if (existingModal) existingModal.remove();

      const shrineData  = saveData.campBuildings && saveData.campBuildings.shrine;
      const shrineLevel = shrineData ? (shrineData.level || 0) : 0;
      const unlockedSlots = shrineLevel; // 1 slot per upgrade level
      const equippedArtifacts = saveData.equippedArtifacts || [null, null, null];
      const artifactInventory = saveData.artifacts || [];

      // Artifact definitions (static catalogue of obtainable artifacts)
      const ARTIFACT_DEFS = {
        voidCrystal:    { name: 'Void Crystal',     icon: '🔮', rarity: 'legendary', desc: '+50% Crit Damage · Void Lifesteal 3%',      stats: { critDamage: 0.5, voidLifesteal: 0.03 } },
        annunakiShard:  { name: 'Annunaki Shard',   icon: '👁️',  rarity: 'mythic',    desc: '+80% Boss Damage · +15% All Resistances',   stats: { bossDamage: 0.8, allResist: 0.15 } },
        temporalCore:   { name: 'Temporal Core',    icon: '⏳', rarity: 'epic',      desc: '+25% Attack Speed · -15% Cooldowns',         stats: { attackSpeed: 0.25, cdReduction: 0.15 } },
        bloodstoneRelic:{ name: 'Bloodstone Relic', icon: '💉', rarity: 'legendary', desc: 'On kill: restore 4% max HP',                  stats: { onKillHeal: 0.04 } },
        etherealBlade:  { name: 'Ethereal Blade',   icon: '⚔️',  rarity: 'epic',      desc: '+40% Physical Damage · +10% Crit Chance',    stats: { physDamage: 0.4, critChance: 0.10 } },
      };

      const rarityColors = { common:'#aaaaaa', uncommon:'#55cc55', rare:'#44aaff', epic:'#aa44ff', legendary:'#ffd700', mythic:'#ff4444' };

      // Build slot HTML
      const slotHTML = [0, 1, 2].map(i => {
        const isUnlocked = i < unlockedSlots;
        const equippedId = equippedArtifacts[i];
        const equipped   = equippedId ? (ARTIFACT_DEFS[equippedId] || artifactInventory.find(a => a.id === equippedId)) : null;
        const rc = equipped ? (rarityColors[equipped.rarity] || '#aaa') : '#444';
        if (!isUnlocked) {
          return `<div class="shrine-slot shrine-slot-locked">
            <div style="font-size:28px;opacity:0.3;">🔒</div>
            <div class="shrine-slot-label" style="color:#555;">Slot ${i+1} — Locked</div>
            <div style="color:#666;font-size:10px;margin-top:4px;">Upgrade Shrine to unlock</div>
          </div>`;
        }
        return `<div class="shrine-slot" data-slot="${i}" style="border-color:${rc};" title="${equipped ? `${equipped.name} — click Remove to unequip` : 'Empty artifact slot'}">
          <div style="font-size:32px;">${equipped ? (equipped.icon || '🔮') : '🏛️'}</div>
          <div class="shrine-slot-label" style="color:${rc};">${equipped ? equipped.name : `Slot ${i+1} — Empty`}</div>
          ${equipped ? `<div style="color:#aaa;font-size:10px;margin-top:3px;">${equipped.desc || ''}</div>
            <button onclick="window._shrineUnequip(${i})" class="shrine-remove-btn">✕ Remove</button>`
          : `<div style="color:#555;font-size:10px;margin-top:3px;">Select artifact below to equip</div>`}
        </div>`;
      }).join('');

      // Build artifact inventory HTML
      const artifactInventoryHTML = artifactInventory.length === 0
        ? `<div style="color:#555;text-align:center;padding:30px;font-size:13px;">No Artifacts collected yet.<br><span style="color:#888;font-size:11px;">Artifacts only drop from Bosses or Void Expeditions.</span></div>`
        : artifactInventory.map((art, idx) => {
            const def = ARTIFACT_DEFS[art.id] || art;
            const rc2 = rarityColors[def.rarity] || '#aaa';
            const isEquipped = equippedArtifacts.some(a => a === art.id);
            return `<div class="shrine-inv-item${isEquipped ? ' shrine-inv-equipped' : ''}" style="border-color:${rc2};"
                        onclick="window._shrineEquipArtifact('${art.id}', ${idx})">
              <span style="font-size:26px;">${def.icon || '🔮'}</span>
              <div style="flex:1;min-width:0;">
                <div style="color:${rc2};font-weight:bold;font-size:13px;">${def.name}</div>
                <div style="color:#888;font-size:10px;">${(def.rarity||'epic').toUpperCase()}</div>
                <div style="color:#aaa;font-size:11px;margin-top:2px;">${def.desc||''}</div>
              </div>
              <div>${isEquipped ? '<span style="color:#FFD700;font-size:11px;">✅ Slotted</span>' : '<span style="color:#00ffff;font-size:11px;">◈ Tap to Equip</span>'}</div>
            </div>`;
          }).join('');

      // Upgrade section
      const maxSlots = 3;
      const canUpgrade = shrineLevel < maxSlots;
      const builtCount = saveData.campBuildings ? Object.values(saveData.campBuildings).filter(b => b && b.unlocked && b.level > 0).length : 0;
      const upgradeCost = Math.max(1, builtCount + 1);
      const res = saveData.resources || {};
      const canAfford = (res.wood || 0) >= upgradeCost && (res.stone || 0) >= upgradeCost;
      const upgradeHTML = canUpgrade
        ? `<div class="shrine-upgrade-box">
            <div style="color:#C9A227;font-family:Bangers,cursive;font-size:16px;letter-spacing:2px;">UPGRADE ARTIFACT SHRINE</div>
            <div style="color:#aaa;font-size:12px;margin:6px 0;">Unlock Slot ${shrineLevel+1} · Cost: ${upgradeCost} 🪵 Wood + ${upgradeCost} 🪨 Stone</div>
            <div style="display:flex;gap:10px;margin:8px 0;justify-content:center;">
              <span style="color:${(res.wood||0)>=upgradeCost?'#7fff7f':'#ff7f7f'};font-size:13px;">🪵 ${res.wood||0}/${upgradeCost}</span>
              <span style="color:${(res.stone||0)>=upgradeCost?'#7fff7f':'#ff7f7f'};font-size:13px;">🪨 ${res.stone||0}/${upgradeCost}</span>
            </div>
            <button id="shrine-upgrade-btn" class="shrine-upgrade-btn" ${canAfford ? '' : 'disabled'}>
              ${canAfford ? '🏛️ UPGRADE SHRINE' : '❌ Need Resources'}
            </button>
          </div>`
        : `<div style="color:#00ffff;text-align:center;padding:12px;font-size:13px;font-family:Bangers,cursive;letter-spacing:2px;">◈ ALL 3 ARTIFACT SLOTS UNLOCKED ◈</div>`;

      const modal = document.createElement('div');
      modal.id = 'artifact-shrine-modal';
      modal.style.cssText = [
        'position:fixed','top:0','left:0','width:100%','height:100%',
        'background:radial-gradient(ellipse at center,rgba(10,0,30,0.98) 0%,rgba(0,0,0,1) 100%)',
        'z-index:200','overflow-y:auto','display:flex','flex-direction:column',
        'align-items:center','padding:20px','box-sizing:border-box',
        'font-family:Courier New,monospace'
      ].join(';');

      modal.innerHTML = `
        <div style="max-width:680px;width:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;
               border-bottom:1px solid rgba(0,255,255,0.3);padding-bottom:12px;">
            <div>
              <div style="color:#00ffff;font-family:Bangers,cursive;font-size:28px;letter-spacing:4px;
                   text-shadow:0 0 20px rgba(0,255,255,0.8);">🏛️ THE ARTIFACT SHRINE</div>
              <div style="color:#C9A227;font-size:12px;letter-spacing:2px;margin-top:4px;">
                LEVEL ${shrineLevel} · ${unlockedSlots}/3 SLOTS ACTIVE</div>
            </div>
            <button id="shrine-back-btn" class="inv-back-btn">← Back</button>
          </div>

          <!-- Shrine tabs -->
          <div class="rg-tabs">
            <button class="rg-tab active" data-shrine-tab="slots">◈ ARTIFACT SLOTS</button>
            <button class="rg-tab" data-shrine-tab="merge">⚗️ RESONANCE MERGE</button>
          </div>

          <!-- Tab: Artifact Slots -->
          <div id="shrine-tab-slots">
            <div style="color:#888;font-size:12px;margin-bottom:18px;line-height:1.6;
                 border:1px solid rgba(0,255,255,0.15);border-radius:8px;padding:12px;
                 background:rgba(0,255,255,0.03);">
              <i>Artifacts provide massive passive stat boosts and only drop from Bosses or Void Expeditions.
              Upgrade the Shrine to unlock additional slots.</i>
            </div>
            <div style="color:#C9A227;font-family:Bangers,cursive;font-size:16px;letter-spacing:2px;margin-bottom:12px;">
              ◈ ARTIFACT SLOTS
            </div>
            <div class="shrine-slots-row">${slotHTML}</div>
            ${upgradeHTML}
            <div style="color:#C9A227;font-family:Bangers,cursive;font-size:16px;letter-spacing:2px;
                 margin-top:24px;margin-bottom:12px;">◈ ARTIFACT COLLECTION</div>
            <div class="shrine-inv-list">${artifactInventoryHTML}</div>
          </div>

          <!-- Tab: Resonance Merge -->
          <div id="shrine-tab-merge" style="display:none;">
            <div style="color:#888;font-size:12px;margin-bottom:14px;line-height:1.6;
                 border:1px solid rgba(0,255,255,0.15);border-radius:8px;padding:12px;
                 background:rgba(0,255,255,0.03);">
              <i>⚗️ Select 2 identical Artifacts from the grid below, then click <b>[MERGE]</b>.
              A skill-check animation will begin — click at the right moment to succeed.<br>
              <b>Success:</b> artifacts merge into 1 of the next rarity with a bonus stat.<br>
              <b>Miss:</b> artifacts are kept but <span style="color:#44ddff">💧 Waterdrop Energy</span> is lost.</i>
            </div>
            <div id="rg-wde-display" style="color:#44ddff;font-size:13px;margin-bottom:10px;text-align:center;"></div>
            <!-- 3×4 Resonance Grid -->
            <div class="rg-grid" id="rg-grid"></div>
            <!-- Merge controls -->
            <div class="rg-merge-panel">
              <div class="rg-merge-title">⚗️ RESONANCE MERGE</div>
              <div class="rg-merge-status" id="rg-status">Select 2 identical Artifacts from the grid to begin.</div>
              <div class="rg-merge-cost">Cost: 💧 20 Waterdrop Energy per attempt</div>
              <button class="rg-merge-btn" id="rg-merge-btn" disabled>⚗️ MERGE</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // ── Tab switching ──────────────────────────────────────────────────────
      modal.querySelectorAll('.rg-tab').forEach(function(btn) {
        btn.addEventListener('click', function() {
          modal.querySelectorAll('.rg-tab').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          const tab = btn.dataset.shrineTab;
          modal.querySelector('#shrine-tab-slots').style.display = tab === 'slots' ? '' : 'none';
          const mergeTab = modal.querySelector('#shrine-tab-merge');
          mergeTab.style.display = tab === 'merge' ? '' : 'none';
          if (tab === 'merge') _initResonanceGrid(modal);
        });
      });

      modal.querySelector('#shrine-back-btn').onclick = () => {
        modal.remove();
        if (campScreen) campScreen.style.display = 'flex';
      };

      const upgradeBtn = modal.querySelector('#shrine-upgrade-btn');
      if (upgradeBtn) {
        upgradeBtn.onclick = () => {
          if (!canAfford) return;
          // Deduct resources
          saveData.resources.wood  -= upgradeCost;
          saveData.resources.stone -= upgradeCost;
          // Upgrade shrine level
          if (!saveData.campBuildings.shrine) saveData.campBuildings.shrine = { level: 0, maxLevel: 3, unlocked: true };
          saveData.campBuildings.shrine.level = Math.min(3, (saveData.campBuildings.shrine.level || 0) + 1);
          saveSaveData();
          if (typeof showStatChange === 'function') showStatChange(`🏛️ Artifact Shrine upgraded to Level ${saveData.campBuildings.shrine.level}!`);
          modal.remove();
          showArtifactShrineUI();
        };
      }

      // Global helpers for inline handlers
      window._shrineUnequip = (slotIdx) => {
        if (!saveData.equippedArtifacts) saveData.equippedArtifacts = [null, null, null];
        saveData.equippedArtifacts[slotIdx] = null;
        saveSaveData();
        modal.remove();
        showArtifactShrineUI();
      };

      window._shrineEquipArtifact = (artifactId, invIdx) => {
        if (!saveData.equippedArtifacts) saveData.equippedArtifacts = [null, null, null];
        // Prevent equipping the same artifact in multiple slots
        if (saveData.equippedArtifacts.includes(artifactId)) {
          if (typeof showStatChange === 'function') showStatChange('❌ This Artifact is already equipped! Remove it first.');
          return;
        }
        // Find first open unlocked slot
        const firstOpen = saveData.equippedArtifacts.findIndex((v, i) => i < unlockedSlots && !v);
        if (firstOpen === -1) {
          if (typeof showStatChange === 'function') showStatChange('❌ All unlocked slots are full! Upgrade the Shrine or remove an artifact.');
          return;
        }
        saveData.equippedArtifacts[firstOpen] = artifactId;
        saveSaveData();
        if (typeof showStatChange === 'function') showStatChange(`✅ Artifact equipped to Slot ${firstOpen + 1}!`);
        modal.remove();
        showArtifactShrineUI();
      };

      // ── Resonance Grid logic ───────────────────────────────────────────────

      const RG_MERGE_COST = 20;  // Waterdrop Energy per attempt

      /** Next rarity progression for merge */
      const RG_RARITY_UP = {
        common: 'uncommon', uncommon: 'rare', rare: 'epic',
        epic: 'legendary', legendary: 'mythic', mythic: 'mythic'
      };

      /** Bonus stat granted on successful merge */
      const RG_MERGE_BONUS_STATS = [
        { stat: 'critDamage',   label: '+10% Crit Damage',   value: 0.10 },
        { stat: 'physDamage',   label: '+8% Physical Damage', value: 0.08 },
        { stat: 'attackSpeed',  label: '+6% Attack Speed',    value: 0.06 },
        { stat: 'cdReduction',  label: '-5% Cooldowns',       value: 0.05 },
        { stat: 'critChance',   label: '+5% Crit Chance',     value: 0.05 },
        { stat: 'voidLifesteal',label: '+2% Void Lifesteal',  value: 0.02 },
      ];

      let _rgSelected = []; // up to 2 indices into artifactInventory

      function _initResonanceGrid(modal) {
        const grid      = modal.querySelector('#rg-grid');
        const statusEl  = modal.querySelector('#rg-status');
        const mergeBtn  = modal.querySelector('#rg-merge-btn');
        const wdeDisp   = modal.querySelector('#rg-wde-display');
        if (!grid) return;

        // Reset selection state every time the grid is (re-)initialized so stale
        // indices from a previous tab visit can never trigger invisible merges.
        _rgSelected = [];

        function _refreshWde() {
          const wde = (saveData.resources && saveData.resources.waterdropEnergy) || 0;
          if (wdeDisp) wdeDisp.textContent = `💧 Waterdrop Energy: ${wde}`;
        }
        _refreshWde();

        // Fill the 12-cell grid (3 cols × 4 rows)
        grid.innerHTML = '';
        const inv = saveData.artifacts || [];
        for (let i = 0; i < 12; i++) {
          const cell = document.createElement('div');
          const art  = inv[i];
          if (art) {
            const def = ARTIFACT_DEFS[art.id] || art;
            const col = rarityColors[def.rarity] || '#aaa';
            cell.className = 'rg-cell rg-filled';
            cell.style.borderColor = col;
            cell.innerHTML = `
              <div class="rg-cell-icon">${def.icon || '🔮'}</div>
              <div class="rg-cell-name">${def.name}</div>
              <div class="rg-cell-rarity" style="color:${col}">${(def.rarity || '').toUpperCase()}</div>
            `;
            cell.dataset.invIdx = i;
            cell.addEventListener('click', function() { _selectCell(i, cell, inv, statusEl, mergeBtn); });
          } else {
            cell.className = 'rg-cell rg-empty';
            cell.innerHTML = `<div style="font-size:20px;opacity:0.25;">🔮</div>`;
          }
          grid.appendChild(cell);
        }

        function _selectCell(idx, cell, inv, statusEl, mergeBtn) {
          const art = inv[idx];
          if (!art) return;

          // Deselect if already selected
          if (_rgSelected.includes(idx)) {
            _rgSelected = _rgSelected.filter(function(i) { return i !== idx; });
            cell.classList.remove('rg-selected');
            _updateStatus(statusEl, mergeBtn, inv);
            return;
          }
          if (_rgSelected.length >= 2) {
            // Deselect old first pick
            const oldIdx = _rgSelected.shift();
            const oldCell = grid.querySelector(`[data-inv-idx="${oldIdx}"]`);
            if (oldCell) oldCell.classList.remove('rg-selected');
          }
          _rgSelected.push(idx);
          cell.classList.add('rg-selected');
          _updateStatus(statusEl, mergeBtn, inv);
        }

        function _updateStatus(statusEl, mergeBtn, inv) {
          if (_rgSelected.length < 2) {
            statusEl.textContent = _rgSelected.length === 1
              ? 'Select a second artifact of the same type to merge.'
              : 'Select 2 identical Artifacts from the grid to begin.';
            mergeBtn.disabled = true;
            return;
          }
          const a = inv[_rgSelected[0]];
          const b = inv[_rgSelected[1]];
          const defA = ARTIFACT_DEFS[a.id] || a;
          const defB = ARTIFACT_DEFS[b.id] || b;
          if (a.id !== b.id) {
            statusEl.innerHTML = '<span style="color:#ff6644">⚠️ Artifacts must be the same type to merge.</span>';
            mergeBtn.disabled = true;
            return;
          }
          if (defA.rarity !== defB.rarity) {
            statusEl.innerHTML = '<span style="color:#ff6644">⚠️ Artifacts must be the same rarity to merge.</span>';
            mergeBtn.disabled = true;
            return;
          }
          const wde = (saveData.resources && saveData.resources.waterdropEnergy) || 0;
          if (wde < RG_MERGE_COST) {
            statusEl.innerHTML = `<span style="color:#ff6644">⚠️ Need 💧 ${RG_MERGE_COST} WDE (have ${wde}). Buy more at The Dropplet Shop.</span>`;
            mergeBtn.disabled = true;
            return;
          }
          const nextRarity = RG_RARITY_UP[defA.rarity] || defA.rarity;
          const col = rarityColors[nextRarity] || '#aaa';
          statusEl.innerHTML = `✅ Ready to merge: <b style="color:${rarityColors[defA.rarity]||'#aaa'}">${defA.name}</b> × 2 →
            <b style="color:${col}">[${nextRarity.toUpperCase()}] ${defA.name}</b> + bonus stat`;
          mergeBtn.disabled = false;
          _refreshWde();
        }

        // Use .onclick so re-entering the tab replaces the handler instead of stacking it.
        if (mergeBtn) {
          mergeBtn.onclick = function() {
            if (_rgSelected.length < 2) return;
            const inv = saveData.artifacts || [];
            const a = inv[_rgSelected[0]];
            const b = inv[_rgSelected[1]];
            if (!a || !b || a.id !== b.id) return;
            const defA = ARTIFACT_DEFS[a.id] || a;
            if (defA.rarity !== (ARTIFACT_DEFS[b.id] || b).rarity) return;
            // Deduct WDE
            const wde = (saveData.resources && saveData.resources.waterdropEnergy) || 0;
            if (wde < RG_MERGE_COST) return;
            saveData.resources.waterdropEnergy -= RG_MERGE_COST;
            saveSaveData();
            _refreshWde();
            // Capture the original artifact id before any mutation so merged
            // artifacts can themselves be merged later.
            const preservedId = a.id;
            // Launch skill check
            _launchSkillCheck(defA, function(success) {
              if (success) {
                _doMerge(defA, preservedId);
              } else {
                if (typeof showStatChange === 'function') showStatChange('❌ Merge failed — WDE lost. Artifacts kept.');
              }
              _rgSelected = [];
              _initResonanceGrid(modal);
            });
          };
        }

        _updateStatus(statusEl, mergeBtn, inv);
      }

      function _doMerge(defA, preservedId) {
        const inv         = saveData.artifacts || [];
        const idxA        = _rgSelected[0];
        const idxB        = _rgSelected[1];
        const artifactA   = inv[idxA];
        const nextRarity  = RG_RARITY_UP[defA.rarity] || defA.rarity;
        const bonusStat   = RG_MERGE_BONUS_STATS[Math.floor(Math.random() * RG_MERGE_BONUS_STATS.length)];
        // Preserve the original artifact id so the merged artifact can itself be
        // merged again in future attempts.
        const mergedId    = preservedId || (artifactA && artifactA.id) || defA.id;
        // Remove both (higher idx first to preserve lower idx)
        const toRemove = [idxA, idxB].sort(function(a,b){return b-a;});
        toRemove.forEach(function(idx) { inv.splice(idx, 1); });
        // Insert merged artifact
        const merged = {
          id: mergedId,
          name: defA.name,
          icon: defA.icon,
          rarity: nextRarity,
          desc: (defA.desc || '') + ` · ${bonusStat.label}`,
          stats: Object.assign({}, defA.stats || {}, { [bonusStat.stat]: ((defA.stats || {})[bonusStat.stat] || 0) + bonusStat.value }),
          _merged: true,
        };
        inv.unshift(merged);
        saveData.artifacts = inv;
        saveSaveData();
        const col = rarityColors[nextRarity] || '#aaa';
        if (typeof showStatChange === 'function') {
          showStatChange(`✨ MERGE SUCCESS! ${defA.name} → <span style="color:${col}">[${nextRarity.toUpperCase()}]</span> + ${bonusStat.label}`);
        }
      }

      /**
       * Skill-check overlay: a ring shrinks toward a green zone.
       * The player must click (or tap) while the ring is inside the green zone.
       * @param {object} defA      Artifact definition (for display)
       * @param {function} onDone  Called with (success: bool)
       */
      function _launchSkillCheck(defA, onDone) {
        const ANIM_DUR_MS   = 1600;  // ring shrink duration
        const GREEN_START   = 0.72;  // ring scale at which green zone begins (0=start, 1=end)
        const GREEN_END     = 0.92;  // ring scale at which green zone ends

        const overlay = document.createElement('div');
        overlay.className = 'rg-skillcheck-overlay';
        overlay.innerHTML = `
          <div class="rg-skillcheck-label">⚗️ CLICK IN THE GREEN ZONE!</div>
          <div class="rg-track">
            <div class="rg-green-zone"></div>
            <div class="rg-ring" id="rg-anim-ring" style="--rg-anim-dur:${ANIM_DUR_MS}ms;"></div>
          </div>
          <div class="rg-skillcheck-hint">TAP OR CLICK ANYWHERE</div>
        `;
        document.body.appendChild(overlay);

        const startTime = performance.now();
        let resolved = false;

        function _resolve(success) {
          if (resolved) return;
          resolved = true;
          overlay.remove();
          onDone(success);
        }

        function _onInput() {
          const elapsed  = performance.now() - startTime;
          const progress = Math.min(elapsed / ANIM_DUR_MS, 1);
          const success  = progress >= GREEN_START && progress <= GREEN_END;
          _resolve(success);
        }

        overlay.addEventListener('click',   _onInput);
        overlay.addEventListener('touchend', function(e) { e.preventDefault(); _onInput(); }, { passive: false });

        // Auto-resolve as miss if player doesn't click in time
        setTimeout(function() { _resolve(false); }, ANIM_DUR_MS + 200);
      }
    }
    window.showArtifactShrineUI = showArtifactShrineUI;

    // Companion skill tree data
    const COMPANION_SKILLS = {
      attackBoost:  { name: '⚔️ Combat Training', desc: '+15% companion damage per level', maxLevel: 5, cost: 1, effect: (lvl) => lvl * 0.15 },
      speedBoost:   { name: '💨 Swift Paws', desc: '+10% companion attack speed per level', maxLevel: 5, cost: 1, effect: (lvl) => lvl * 0.10 },
      healing:      { name: '💚 Healing Aura', desc: 'Companion heals player for 2 HP per level every 5s', maxLevel: 5, cost: 2, effect: (lvl) => lvl * 2 },
      toughness:    { name: '🛡️ Iron Hide', desc: '+20 companion HP per level', maxLevel: 5, cost: 1, effect: (lvl) => lvl * 20 },
      critStrike:   { name: '✨ Critical Strike', desc: '+5% critical hit chance per level', maxLevel: 3, cost: 2, effect: (lvl) => lvl * 0.05 },
      aoeDamage:    { name: '💥 Area Assault', desc: 'Attacks hit all enemies within 2 units (unlocks at level 5)', maxLevel: 1, cost: 3, effect: (lvl) => lvl },
      revive:       { name: '♻️ Undying Bond', desc: 'Companion revives 50% faster per level', maxLevel: 3, cost: 2, effect: (lvl) => lvl * 0.5 },
      expShare:     { name: '📈 XP Link', desc: '+5% bonus XP for both player and companion per level', maxLevel: 5, cost: 1, effect: (lvl) => lvl * 0.05 }
    };

    function showCompanionHouse() {
      const campScreen = document.getElementById('camp-screen');
      if (campScreen) campScreen.style.display = 'none';

      const existingModal = document.getElementById('companion-house-modal');
      if (existingModal) existingModal.remove();

      const modal = document.createElement('div');
      modal.id = 'companion-house-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:200;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:20px;box-sizing:border-box;';

      // Determine state
      const hasEgg = saveData.hasCompanionEgg;
      const isHatched = saveData.companionEggHatched;
      const hatchProgress = saveData.companionEggHatchProgress || 0;
      const companionId = saveData.selectedCompanion || 'greyAlien';
      const companionData = saveData.companions[companionId] || { unlocked: true, level: 1, xp: 0, skills: {} };
      const companionInfo = COMPANIONS[companionId];
      const companionQuestDone = saveData.tutorialQuests?.completedQuests?.includes('quest9_activateCompanion');

      // Egg section
      let eggSectionHTML = '';
      if (!hasEgg) {
        eggSectionHTML = `
          <div style="background:rgba(255,100,0,0.1);border:1px dashed #FF8000;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
            <div style="font-size:48px;margin-bottom:10px;">🏚️</div>
            <div style="color:#FF8000;font-size:16px;font-weight:bold;">The nest is empty...</div>
            <div style="color:#aaa;font-size:13px;margin-top:8px;">Find the <b style="color:#FFD700;">Companion Egg</b> at the UFO crash site in Area 51 to bring life to this sanctuary!</div>
          </div>`;
      } else if (!isHatched) {
        const progressBar = `<div style="height:12px;background:#333;border-radius:6px;overflow:hidden;margin:10px 0;"><div style="height:100%;width:${hatchProgress}%;background:linear-gradient(90deg,#00FFB4,#0080FF);transition:width 0.5s;border-radius:6px;"></div></div>`;
        eggSectionHTML = `
          <div style="background:linear-gradient(135deg,rgba(0,255,180,0.1),rgba(0,100,80,0.2));border:2px solid #00FFB4;border-radius:12px;padding:20px;margin-bottom:20px;">
            <div style="text-align:center;margin-bottom:14px;">
              <div style="font-size:64px;animation:pulse 1.2s ease-in-out infinite;display:inline-block;">🥚</div>
              <div style="color:#00FFB4;font-size:18px;font-weight:bold;margin-top:8px;">Companion Egg — Incubating</div>
              <div style="color:#aaa;font-size:13px;">Hatching Progress: ${Math.floor(hatchProgress)}%</div>
              ${progressBar}
            </div>
            <div style="text-align:center;">
              <button id="hatch-egg-btn" style="background:linear-gradient(135deg,#00FFB4,#0080FF);border:none;border-radius:10px;padding:12px 28px;color:#000;font-weight:bold;cursor:pointer;font-size:15px;margin-top:4px;">
                🐣 Hatch Egg (Costs 200 Gold)
              </button>
            </div>
          </div>`;
      } else {
        const growthStage = saveData.companionGrowthStage || 'newborn';
        const growthIcons = { newborn: '🐣', juvenile: '👽', adult: '👽' };
        const growthLabels = { newborn: 'Newborn', juvenile: 'Juvenile', adult: 'Adult' };
        const growthColors = { newborn: '#FFD700', juvenile: '#FF8C00', adult: '#00FF64' };
        const growthIcon = growthIcons[growthStage] || '🐣';
        const growthLabel = growthLabels[growthStage] || 'Newborn';
        const growthColor = growthColors[growthStage] || '#FFD700';
        eggSectionHTML = `
          <div style="background:linear-gradient(135deg,rgba(255,180,0,0.1),rgba(150,80,0,0.2));border:2px solid ${growthColor};border-radius:12px;padding:16px;margin-bottom:20px;text-align:center;">
            <div style="font-size:36px;">${growthIcon} ✅</div>
            <div style="color:${growthColor};font-size:15px;font-weight:bold;">Companion Egg Hatched!</div>
            <div style="color:#aaa;font-size:12px;">Growth Stage: <b style="color:${growthColor};">${growthLabel}</b></div>
            ${growthStage !== 'adult' ? '<div style="color:#888;font-size:11px;margin-top:4px;">Take your companion on runs to help it grow!</div>' : '<div style="color:#00FF64;font-size:11px;margin-top:4px;">Fully grown! Your companion is at full power.</div>'}
          </div>`;
      }

      // Active companion section
      const xpRequired = [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000];
      const currentXP = companionData.xp || 0;
      const companionLevel = companionData.level || 1;
      const xpNeeded = xpRequired[Math.min(companionLevel, 9)] || 4000;
      const xpPct = Math.min(100, (currentXP / xpNeeded) * 100);
      const isEvolved = companionLevel >= 10;

      const companionSection = `
        <div style="background:rgba(255,255,255,0.04);border:1px solid #555;border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="color:#FFD700;font-size:15px;font-weight:bold;margin-bottom:12px;">👽 Active Companion</div>

          <!-- Companion selector -->
          <div style="display:flex;gap:8px;margin-bottom:14px;">
            ${Object.entries(saveData.companions).map(([cId, cData]) => {
              const info = COMPANIONS[cId];
              if (!info) return '';
              const isSelected = cId === companionId;
              const isUnlocked = cData.unlocked;
              return `<button onclick="selectCompanion('${cId}')"
                style="flex:1;padding:10px 6px;border-radius:8px;border:2px solid ${isSelected ? '#FFD700' : '#444'};
                background:${isSelected ? 'rgba(255,215,0,0.15)' : isUnlocked ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)'};
                color:${isUnlocked ? '#fff' : '#555'};cursor:${isUnlocked ? 'pointer' : 'default'};font-size:11px;text-align:center;">
                <div style="font-size:22px;">${isEvolved && isSelected ? info.evolvedIcon : info.icon}</div>
                <div>${info.name}</div>
                ${!isUnlocked ? '<div style="color:#f66;font-size:10px;">🔒 Locked</div>' : ''}
              </button>`;
            }).join('')}
          </div>

          <!-- Companion stats -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;">
              <div style="color:#aaa;font-size:11px;">Level</div>
              <div style="color:#FFD700;font-size:20px;font-weight:bold;">${companionLevel} ${isEvolved ? '⭐' : ''}</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;">
              <div style="color:#aaa;font-size:11px;">Type</div>
              <div style="color:#4FC3F7;font-size:14px;">${companionInfo?.type || 'melee'}</div>
            </div>
          </div>

          <!-- XP bar -->
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;color:#aaa;font-size:11px;margin-bottom:4px;">
              <span>XP Progress</span><span>${currentXP} / ${xpNeeded}</span>
            </div>
            <div style="height:10px;background:#333;border-radius:5px;overflow:hidden;">
              <div style="height:100%;width:${xpPct}%;background:linear-gradient(90deg,#4FC3F7,#00BFA5);border-radius:5px;transition:width 0.3s;"></div>
            </div>
          </div>

          <!-- Activate button for quest9 -->
          ${!companionQuestDone ? `
          <button id="activate-companion-btn" style="width:100%;background:linear-gradient(135deg,#FF6B35,#FF4500);border:none;border-radius:10px;padding:14px;color:#fff;font-weight:bold;cursor:pointer;font-size:15px;margin-bottom:12px;">
            ⚡ Activate Companion — Fight by Your Side!
          </button>` : `
          <div style="background:rgba(0,255,100,0.1);border:1px solid #00FF64;border-radius:8px;padding:10px;text-align:center;margin-bottom:12px;color:#00FF64;font-size:13px;">
            ✅ Companion Active — Fighting alongside you!
          </div>`}
        </div>`;

      // Skill tree section
      const companionSkillData = companionData.skills || {};
      const skillPoints = saveData.companionSkillPoints || 0;

      const skillTreeHTML = `
        <div style="background:rgba(255,255,255,0.04);border:1px solid #555;border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="color:#FFD700;font-size:15px;font-weight:bold;">🌟 Companion Skill Tree</div>
            <div style="background:rgba(255,215,0,0.15);border:1px solid #FFD700;border-radius:6px;padding:4px 10px;color:#FFD700;font-size:13px;">
              SP: ${skillPoints}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${Object.entries(COMPANION_SKILLS).map(([skillId, skill]) => {
              const currentLevel = (companionSkillData[skillId] || 0);
              const isMaxed = currentLevel >= skill.maxLevel;
              const canAfford = skillPoints >= skill.cost;
              const requiresLevel5 = skillId === 'aoeDamage' && companionLevel < 5;
              const isLocked = requiresLevel5;
              return `
                <div style="background:rgba(255,255,255,0.05);border:1px solid ${isMaxed ? '#FFD700' : '#444'};border-radius:8px;padding:10px;">
                  <div style="color:${isMaxed ? '#FFD700' : '#fff'};font-size:12px;font-weight:bold;">${skill.name}</div>
                  <div style="color:#aaa;font-size:10px;margin:4px 0;">${skill.desc}</div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                    <span style="color:#4FC3F7;font-size:11px;">Level ${currentLevel}/${skill.maxLevel}</span>
                    ${isLocked
                      ? '<span style="color:#f66;font-size:10px;">Needs Level 5</span>'
                      : isMaxed
                        ? '<span style="color:#FFD700;font-size:10px;">MAX</span>'
                        : `<button onclick="upgradeCompanionSkill('${skillId}')" style="background:${canAfford ? 'rgba(255,215,0,0.2)' : 'rgba(100,100,100,0.2)'};border:1px solid ${canAfford ? '#FFD700' : '#555'};border-radius:4px;padding:3px 8px;color:${canAfford ? '#FFD700' : '#666'};cursor:${canAfford ? 'pointer' : 'default'};font-size:10px;">${skill.cost} SP</button>`
                    }
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;

      // Wolf breeding section
      const capturedWolves = (saveData.tranquilizedAnimals || []).filter(a => a.id === 'wolf');
      const hasMaleWolf = capturedWolves.some(a => a.gender === 'male');
      const hasFemaleWolf = capturedWolves.some(a => a.gender === 'female');
      const wolfUnlocked = saveData.companions.stormWolf && saveData.companions.stormWolf.unlocked;
      const showBreeding = saveData.craftedWeapons && saveData.craftedWeapons.tranquilizerRifle;
      const breedingSectionHTML = showBreeding ? `
        <div style="background:rgba(139,69,19,0.1);border:1px solid #8B4513;border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="color:#8B4513;font-size:15px;font-weight:bold;margin-bottom:10px;">🐺 Wolf Breeding Program</div>
          <div style="color:#aaa;font-size:12px;margin-bottom:10px;">Capture a male and female wolf with the Tranquilizer Rifle, then breed them to get a Storm Wolf companion.</div>
          <div style="display:flex;gap:12px;margin-bottom:10px;">
            <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;text-align:center;">
              <div style="font-size:20px;">${hasMaleWolf ? '🐺♂' : '❓♂'}</div>
              <div style="color:${hasMaleWolf ? '#00FF64' : '#f66'};font-size:11px;">${hasMaleWolf ? 'Male Wolf ✅' : 'Not captured'}</div>
            </div>
            <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;text-align:center;">
              <div style="font-size:20px;">${hasFemaleWolf ? '🐺♀' : '❓♀'}</div>
              <div style="color:${hasFemaleWolf ? '#00FF64' : '#f66'};font-size:11px;">${hasFemaleWolf ? 'Female Wolf ✅' : 'Not captured'}</div>
            </div>
          </div>
          ${wolfUnlocked
            ? '<div style="background:rgba(0,255,100,0.1);border:1px solid #00FF64;border-radius:8px;padding:10px;text-align:center;color:#00FF64;font-size:13px;">✅ Storm Wolf Bred! Select it above.</div>'
            : hasMaleWolf && hasFemaleWolf
              ? '<button id="breed-wolf-btn" style="width:100%;background:linear-gradient(135deg,#8B4513,#A0522D);border:none;border-radius:10px;padding:12px;color:#fff;font-weight:bold;cursor:pointer;font-size:14px;">🐺⚡ Breed Storm Wolf!</button>'
              : '<div style="color:#888;font-size:11px;text-align:center;">Find wolves in the forest region and tranquilize them with your rifle.</div>'
          }
        </div>` : '';

      modal.innerHTML = `
        <div style="max-width:680px;width:100%;">
          <!-- Header -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div>
              <h2 style="color:#FFD700;margin:0;font-size:22px;">🏡 Companion House</h2>
              <div style="color:#aaa;font-size:12px;">A cozy sanctuary for your loyal companions</div>
            </div>
            <button id="ch-back-btn" style="background:rgba(255,255,255,0.1);border:1px solid #666;border-radius:8px;padding:8px 16px;color:#fff;cursor:pointer;">← Back to Camp</button>
          </div>

          <!-- Tab bar (Quest Hall style) -->
          <div id="ch-tab-bar" style="display:flex;gap:0;border-bottom:2px solid rgba(255,215,0,0.25);margin-bottom:16px;">
            <button data-ch-tab="companion"
              style="flex:1;background:none;border:none;border-bottom:3px solid #FFD700;color:#FFD700;
              font-family:'Courier New',monospace;font-size:13px;letter-spacing:1px;padding:8px 4px;cursor:pointer;transition:color 0.2s,border-color 0.2s;">
              👽 Companion
            </button>
            <button data-ch-tab="exploration"
              style="flex:1;background:none;border:none;border-bottom:3px solid transparent;color:#666;
              font-family:'Courier New',monospace;font-size:13px;letter-spacing:1px;padding:8px 4px;cursor:pointer;transition:color 0.2s,border-color 0.2s;">
              🗺 Exploration
            </button>
          </div>

          <!-- Companion tab content -->
          <div id="ch-tab-companion" style="display:block;">
            ${eggSectionHTML}
            ${companionSection}
            ${breedingSectionHTML}
            ${skillTreeHTML}
          </div>

          <!-- Exploration tab content (rendered by companion-exploration.js) -->
          <div id="ch-tab-exploration" style="display:none;"></div>
        </div>
      `;

      document.body.appendChild(modal);

      // Tab switching
      const tabBtns = modal.querySelectorAll('[data-ch-tab]');
      function _switchCHTab(tabId) {
        tabBtns.forEach(btn => {
          const isActive = btn.getAttribute('data-ch-tab') === tabId;
          btn.style.borderBottom = isActive ? '3px solid ' + (tabId === 'exploration' ? '#aa44ff' : '#FFD700') : '3px solid transparent';
          btn.style.color = isActive ? (tabId === 'exploration' ? '#aa44ff' : '#FFD700') : '#666';
        });
        modal.querySelector('#ch-tab-companion').style.display   = tabId === 'companion'   ? 'block' : 'none';
        const exploDiv = modal.querySelector('#ch-tab-exploration');
        exploDiv.style.display = tabId === 'exploration' ? 'block' : 'none';
        if (tabId === 'exploration' && typeof renderExplorationTab === 'function') {
          renderExplorationTab(exploDiv);
        }
      }
      tabBtns.forEach(btn => btn.onclick = () => _switchCHTab(btn.getAttribute('data-ch-tab')));

      // Back button
      document.getElementById('ch-back-btn').onclick = () => {
        modal.remove();
        if (campScreen) campScreen.style.display = 'flex';
      };

      // Breed wolf button handler
      const breedBtn = document.getElementById('breed-wolf-btn');
      if (breedBtn) {
        breedBtn.onclick = () => {
          saveData.companions.stormWolf.unlocked = true;
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest34_breedWolf') {
            progressTutorialQuest('quest34_breedWolf', true);
          }
          saveSaveData();
          showStatChange('🐺⚡ Storm Wolf Bred!');
          playSound('collect');
          modal.remove();
          showCompanionHouse();
        };
      }

      // Activate companion button (quest9 progression)
      const activateBtn = document.getElementById('activate-companion-btn');
      if (activateBtn) {
        activateBtn.onclick = () => {
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9_activateCompanion') {
            progressTutorialQuest('quest9_activateCompanion', true);
            saveSaveData();
          }
          activateBtn.outerHTML = '<div style="background:rgba(0,255,100,0.1);border:1px solid #00FF64;border-radius:8px;padding:10px;text-align:center;margin-bottom:12px;color:#00FF64;font-size:13px;">✅ Companion Active — Fighting alongside you!</div>';
          showStatChange('⚡ Companion Activated!');
          playSound('collect');
        };
      }

      // Hatch egg button
      const hatchBtn = document.getElementById('hatch-egg-btn');
      if (hatchBtn) {
        hatchBtn.onclick = () => {
          if (saveData.gold < 200) {
            showStatChange('❌ Not enough Gold! Need 200g to hatch.');
            playSound('invalid');
            return;
          }
          saveData.gold -= 200;
          saveData.companionEggHatchProgress = 100;
          saveData.companionEggHatched = true;
          saveData.companionGrowthStage = 'newborn';
          saveSaveData();
          showStatChange('🐣 Companion Egg Hatched!');
          playSound('collect');
          // Progress quest19 if active
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest19_hatchEgg') {
            progressTutorialQuest('quest19_hatchEgg', true);
          }
          modal.remove();
          showCompanionHouse();
        };
      }
    }

    // Select companion from companion house
    function selectCompanion(companionId) {
      if (!saveData.companions[companionId] || !saveData.companions[companionId].unlocked) {
        showStatChange('🔒 Companion not yet unlocked!');
        return;
      }
      saveData.selectedCompanion = companionId;
      saveSaveData();
      // Check quest20 progress - if companion was leveled
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest20_trainCompanion') {
        const cData = saveData.companions[companionId];
        if (cData && cData.level >= 2 && Object.keys(cData.skills || {}).some(s => (cData.skills[s] || 0) > 0)) {
          progressTutorialQuest('quest20_trainCompanion', true);
        }
      }
      const modal = document.getElementById('companion-house-modal');
      if (modal) { modal.remove(); showCompanionHouse(); }
    }
    window.selectCompanion = selectCompanion;

    // Upgrade a companion skill
    function upgradeCompanionSkill(skillId) {
      const skill = COMPANION_SKILLS[skillId];
      if (!skill) return;
      const companionId = saveData.selectedCompanion || 'stormWolf';
      if (!saveData.companions[companionId]) return;
      if (!saveData.companions[companionId].skills) saveData.companions[companionId].skills = {};
      const currentLevel = saveData.companions[companionId].skills[skillId] || 0;
      if (currentLevel >= skill.maxLevel) { showStatChange('Already at max level!'); return; }
      if ((saveData.companionSkillPoints || 0) < skill.cost) { showStatChange('❌ Not enough Companion Skill Points!'); playSound('invalid'); return; }
      saveData.companionSkillPoints -= skill.cost;
      saveData.companions[companionId].skills[skillId] = currentLevel + 1;
      saveSaveData();
      showStatChange(`✨ ${skill.name} upgraded to Lv ${currentLevel + 1}!`);
      playSound('collect');
      // Progress quest20 if skill unlocked and companion leveled
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest20_trainCompanion') {
        const cData = saveData.companions[companionId];
        if (cData && cData.level >= 2) {
          progressTutorialQuest('quest20_trainCompanion', true);
        }
      }
      const modal = document.getElementById('companion-house-modal');
      if (modal) { modal.remove(); showCompanionHouse(); }
    }
    window.upgradeCompanionSkill = upgradeCompanionSkill;

    // Render account stats inside the account section
    function renderAccountContent() {
      const content = document.getElementById('camp-account-content');
      if (!content) return;
      updateAccountLevelDisplay();
      const defaultStats = getDefaultPlayerStats();
      // Current stats derived from permanent upgrades + attributes
      const ups = saveData.upgrades || {};
      const attrs = saveData.attributes || {};
      const startHp = defaultStats.maxHp || 100;
      const currentHp = startHp + PERMANENT_UPGRADES.maxHp.effect(ups.maxHp || 0) + (attrs.vitality || 0) * 15;
      const startDmg = defaultStats.damage || 1;
      const currentDmg = +(startDmg + PERMANENT_UPGRADES.attackDamage.effect(ups.attackDamage || 0) + (attrs.strength || 0) * 0.1).toFixed(2);
      const startAtkSpd = defaultStats.attackSpeed || 1;
      const currentAtkSpd = +(startAtkSpd + PERMANENT_UPGRADES.attackSpeed.effect(ups.attackSpeed || 0) + (attrs.dexterity || 0) * 0.05).toFixed(2);
      const startCrit = defaultStats.critChance || 0.1;
      const currentCrit = +(startCrit + PERMANENT_UPGRADES.critChance.effect(ups.critChance || 0) + (attrs.dexterity || 0) * 0.02).toFixed(2);
      const startArmor = 0;
      const currentArmor = PERMANENT_UPGRADES.armor.effect(ups.armor || 0) + (attrs.endurance || 0) * 2;

      const statsToShow = [
        { label: 'Max HP',      start: startHp,     current: currentHp },
        { label: 'Damage',      start: startDmg,    current: currentDmg },
        { label: 'Atk Speed',   start: startAtkSpd, current: currentAtkSpd },
        { label: 'Crit Chance', start: startCrit,   current: currentCrit },
        { label: 'Armor',       start: startArmor,  current: currentArmor },
        { label: 'Strength',    start: 1,           current: 1 + (attrs.strength || 0) },
        { label: 'Endurance',   start: 0,           current: attrs.endurance || 0 }, // Training attribute, starts at 0
      ];

      const totalKills = saveData.totalKills || 0;
      const level = saveData.accountLevel || 1;
      const questsDone = (saveData.tutorialQuests && saveData.tutorialQuests.claimedQuests) ? saveData.tutorialQuests.claimedQuests.length : 0;
      const totalRuns = saveData.totalRuns || 0;
      const totalGoldEarned = saveData.totalGoldEarned || 0;
      const bestKills = saveData.bestKills || 0;

      const fmtDelta = (start, current) => {
        const d = (typeof current === 'number' && typeof start === 'number') ? +(current - start).toFixed(2) : 0;
        if (d > 0) return `<span class="stat-delta-positive">+${d}</span>`;
        if (d < 0) return `<span class="stat-delta-negative">${d}</span>`;
        return `<span class="stat-delta-neutral">—</span>`;
      };

      const fmtVal = (v) => typeof v === 'number' ? (v % 1 === 0 ? v : v.toFixed(2)) : v;

      let rows = statsToShow.map(s =>
        `<tr><td>${s.label}</td><td>${fmtVal(s.start)}</td><td>${fmtVal(s.current)}</td><td>${fmtDelta(s.start, s.current)}</td></tr>`
      ).join('');

      content.innerHTML = `
        <div class="building-popup-title">👤 ACCOUNT &amp; RECORDS</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:16px;">
          <div style="background:rgba(255,215,0,0.08);border:2px solid #FFD700;border-radius:12px;padding:10px 18px;text-align:center;min-width:100px;">
            <div style="font-family:'Bangers',cursive;font-size:28px;color:#FFD700;">${level}</div>
            <div style="font-size:11px;color:#aaa;">ACCOUNT LEVEL</div>
          </div>
          <div style="background:rgba(255,215,0,0.08);border:2px solid #e74c3c;border-radius:12px;padding:10px 18px;text-align:center;min-width:100px;">
            <div style="font-family:'Bangers',cursive;font-size:28px;color:#e74c3c;">${totalKills}</div>
            <div style="font-size:11px;color:#aaa;">TOTAL KILLS</div>
          </div>
          <div style="background:rgba(255,215,0,0.08);border:2px solid #2ecc71;border-radius:12px;padding:10px 18px;text-align:center;min-width:100px;">
            <div style="font-family:'Bangers',cursive;font-size:28px;color:#2ecc71;">${questsDone}</div>
            <div style="font-size:11px;color:#aaa;">QUESTS DONE</div>
          </div>
          <div style="background:rgba(255,215,0,0.08);border:2px solid #5DADE2;border-radius:12px;padding:10px 18px;text-align:center;min-width:100px;">
            <div style="font-family:'Bangers',cursive;font-size:28px;color:#5DADE2;">${totalRuns}</div>
            <div style="font-size:11px;color:#aaa;">TOTAL RUNS</div>
          </div>
        </div>
        <table class="account-stats-table">
          <thead><tr><th>Stat</th><th>Start</th><th>Now</th><th>Δ</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:14px;font-size:13px;color:#aaa;text-align:center;line-height:2;">
          💰 Total Gold Earned: <span style="color:#FFD700;font-weight:bold;">${totalGoldEarned}</span><br>
          ⚔️ Best Run Kills: <span style="color:#e74c3c;font-weight:bold;">${bestKills}</span>
        </div>
      `;

      // Append GameAccount profile/progression panel (from idle-account.js) if available
      if (window.GameAccount && window.GameAccount.renderAccountPanel) {
        const accPanelWrap = document.createElement('div');
        accPanelWrap.style.cssText = 'margin-top:18px;border-top:2px solid rgba(255,215,0,0.3);padding-top:14px;';
        content.appendChild(accPanelWrap);
        window.GameAccount.renderAccountPanel(saveData, accPanelWrap);
      }
    }

    // Update corner widget notification dots and daily streak label
    function _updateCampCornerWidgets() {
      // Show/hide corner widgets based on quest progression
      // They unlock after the first run quest (quest_dailyRoutine = "Daily Routine") is complete
      const cornerWidgetsEl = document.getElementById('camp-corner-widgets');
      if (cornerWidgetsEl) {
        const spinDailyUnlocked = (typeof isQuestClaimed === 'function') &&
          (isQuestClaimed('quest_dailyRoutine') || isQuestClaimed('firstRunDeath'));
        cornerWidgetsEl.style.display = spinDailyUnlocked ? '' : 'none';
      }
      // Daily reward notification
      const dailyNotif = document.getElementById('camp-daily-notif');
      const dailyStreak = document.getElementById('camp-daily-streak');
      if (window.GameDailies) {
        const canClaim = window.GameDailies.isDailyAvailable(saveData);
        if (dailyNotif) dailyNotif.style.display = canClaim ? 'block' : 'none';
        if (dailyStreak) {
          const streak = (saveData.dailies && saveData.dailies.loginStreak) || 0;
          const day = ((streak) % 7) + 1;
          dailyStreak.textContent = 'DAY ' + day;
        }
      }
      // Spin wheel free spin notification
      const spinNotif = document.getElementById('camp-spin-notif');
      if (spinNotif && window.GameLuckyWheel) {
        const hasFree = window.GameLuckyWheel.canFreeSpin(saveData);
        spinNotif.style.display = hasFree ? 'block' : 'none';
      }
      // Unspent points notification bar
      _updateUnspentBar();
    }

    // ── Unspent Points Notification Bar (legacy — hidden) ────────
    let _unspentBarDismissed = false;

    // ── Unspent Points Corner Dropdown (new) ──────────────────────
    let _unspentDropdownOpen = false;

    function _initUnspentDropdown() {
      const tab = document.getElementById('unspent-tab');
      const dropdown = document.getElementById('unspent-dropdown');
      const closeBtn = document.getElementById('unspent-dd-close');
      if (!tab || !dropdown) return;

      tab.onclick = () => {
        if (tab.classList.contains('tab-collapsed')) {
          tab.classList.remove('tab-collapsed');
        } else if (_unspentDropdownOpen) {
          _toggleUnspentDropdown(false);
          tab.classList.add('tab-collapsed');
        } else {
          _toggleUnspentDropdown(true);
        }
      };
      if (closeBtn) closeBtn.onclick = () => {
        _toggleUnspentDropdown(false);
        tab.classList.add('tab-collapsed');
      };
    }

    function _toggleUnspentDropdown(open) {
      const tab = document.getElementById('unspent-tab');
      const dropdown = document.getElementById('unspent-dropdown');
      _unspentDropdownOpen = open;
      if (open) {
        dropdown.classList.add('unspent-visible');
        tab.classList.add('unspent-open');
      } else {
        dropdown.classList.remove('unspent-visible');
        tab.classList.remove('unspent-open');
      }
    }

    function _updateUnspentBar() {
      // Legacy bar — always hide
      const bar = document.getElementById('camp-unspent-bar');
      if (bar) bar.style.display = 'none';

      // New dropdown system
      const tab = document.getElementById('unspent-tab');
      const list = document.getElementById('unspent-dd-list');
      if (!tab || !list) return;

      const items = [];

      // ── Points & currencies ──
      const sp = saveData.skillPoints || 0;
      if (sp > 0) {
        const bld = saveData.campBuildings && saveData.campBuildings.skillTree;
        if (bld && bld.level > 0)
          items.push({ icon: '🌳', label: sp + ' Skill Points', desc: 'Spend in Skill Tree', color: '#2ecc71', bg: 'rgba(46,204,113,0.15)', border: 'rgba(46,204,113,0.5)', action: 'skillTree', section: 'points' });
      }
      const ap = saveData.unspentAttributePoints || 0;
      if (ap > 0) {
        const bld = saveData.campBuildings && saveData.campBuildings.trainingHall;
        if (bld && bld.level > 0)
          items.push({ icon: '🏋️', label: ap + ' Attribute Points', desc: 'Spend in Training Hall', color: '#9b59b6', bg: 'rgba(155,89,182,0.15)', border: 'rgba(155,89,182,0.5)', action: 'training', section: 'points' });
      }
      const gold = saveData.gold || 0;
      if (gold >= 50) {
        const bld = saveData.campBuildings && saveData.campBuildings.forge;
        if (bld && bld.level > 0)
          items.push({ icon: '⚒️', label: gold.toLocaleString() + ' Gold', desc: 'Buy upgrades at Forge', color: '#FFD700', bg: 'rgba(255,215,0,0.12)', border: 'rgba(255,215,0,0.45)', action: 'forge', section: 'points' });
      }
      const csp = saveData.companionSkillPoints || 0;
      if (csp > 0) {
        const bld = saveData.campBuildings && saveData.campBuildings.companionHouse;
        if (bld && bld.level > 0)
          items.push({ icon: '🐺', label: csp + ' Companion SP', desc: 'Upgrade at Companion House', color: '#e67e22', bg: 'rgba(230,126,34,0.15)', border: 'rgba(230,126,34,0.5)', action: 'companion', section: 'points' });
      }
      const ess = (saveData.clicker && saveData.clicker.essence > 0) ? saveData.clicker.essence : (saveData.essence || 0);
      if (ess > 0) {
        items.push({ icon: '⚙️', label: ess + ' Essence', desc: 'Spend in Idle Progression', color: '#3498db', bg: 'rgba(52,152,219,0.12)', border: 'rgba(52,152,219,0.45)', action: 'idle', section: 'points' });
      }
      const sap = saveData.specialAtkPoints || 0;
      if (sap > 0) {
        const bld = saveData.campBuildings && saveData.campBuildings.specialAttacks;
        if (bld && bld.level > 0)
          items.push({ icon: '⚡', label: sap + ' Special Atk Points', desc: 'Equip in Special Attacks', color: '#e74c3c', bg: 'rgba(231,76,60,0.15)', border: 'rgba(231,76,60,0.5)', action: 'specialAttacks', section: 'points' });
      }

      // ── Quests ready to claim ──
      // Only show shortcut if Quest Hall is built (level > 0); otherwise player must build it first
      var _qmBld = saveData.campBuildings && saveData.campBuildings.questMission;
      if (saveData.tutorialQuests && saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0 && _qmBld && _qmBld.level > 0) {
        items.push({ icon: '📜', label: 'Quest Reward Ready!', desc: 'Claim at Quest Hall', color: '#FFD700', bg: 'rgba(255,215,0,0.12)', border: 'rgba(255,215,0,0.45)', action: 'questHall', section: 'actions' });
      }

      // ── New equipment in inventory ──
      const inv = saveData.inventory || [];
      const equipped = saveData.equippedGear || {};
      const unequippedGear = inv.filter(item => {
        if (!item || !item.type) return false;
        const slot = item.type;
        return !equipped[slot] || equipped[slot].id !== item.id;
      });
      if (unequippedGear.length > 0) {
        const bld = saveData.campBuildings && saveData.campBuildings.armory;
        if (bld && bld.level > 0)
          items.push({ icon: '🛡️', label: unequippedGear.length + ' Unequipped Gear', desc: 'Equip at Armory', color: '#e67e22', bg: 'rgba(230,126,34,0.12)', border: 'rgba(230,126,34,0.45)', action: 'armory', section: 'actions' });
      }

      // ── Resources for crafting ──
      const res = saveData.resources || {};
      const totalRes = Object.values(res).reduce((a, b) => a + (b || 0), 0);
      if (totalRes > 0) {
        const bld = saveData.campBuildings && saveData.campBuildings.campfireKitchen;
        if (bld && bld.level > 0)
          items.push({ icon: '🍳', label: 'Cooking Ingredients', desc: totalRes + ' total resources for recipes', color: '#ff9800', bg: 'rgba(255,152,0,0.12)', border: 'rgba(255,152,0,0.45)', action: 'campfireKitchen', section: 'actions' });
      }

      // Show/hide tab
      if (items.length === 0) {
        tab.style.display = 'none';
        if (_unspentDropdownOpen) _toggleUnspentDropdown(false);
        return;
      }
      tab.style.display = '';

      // Build list HTML
      let html = '';
      let lastSection = '';
      const sectionLabels = { points: '💎 Spendable Points', actions: '🔔 Actions Available' };
      items.forEach(item => {
        if (item.section !== lastSection) {
          html += '<div class="unspent-dd-section">' + (sectionLabels[item.section] || item.section) + '</div>';
          lastSection = item.section;
        }
        html += '<div class="unspent-dd-item" style="--item-border:' + item.border + ';--item-bg:' + item.bg + ';--item-color:' + item.color + ';" data-action="' + item.action + '">' +
          '<div class="dd-icon" style="background:' + item.bg + ';">' + item.icon + '</div>' +
          '<div class="dd-info"><div class="dd-label">' + item.label + '</div><div class="dd-desc">' + item.desc + '</div></div>' +
          '</div>';
      });
      list.innerHTML = html;

      // Click handlers
      list.querySelectorAll('.unspent-dd-item').forEach(el => {
        el.onclick = () => {
          const act = el.dataset.action;
          _toggleUnspentDropdown(false);
          if (act === 'skillTree') { const e = document.getElementById('camp-skills-tab'); if (e) e.click(); }
          else if (act === 'training') { const e = document.getElementById('camp-training-tab'); if (e) e.click(); }
          else if (act === 'forge') showProgressionShop();
          else if (act === 'companion') showCompanionHouse();
          else if (act === 'idle') showIdleSection();
          else if (act === 'specialAttacks') { if (typeof showSpecialAttacksPanel === 'function') showSpecialAttacksPanel(); }
          else if (act === 'questHall') { if (typeof showQuestHall === 'function') showQuestHall(); }
          else if (act === 'armory') {
            try { updateGearScreen(); } catch(e) { console.error(e); }
            const gs = document.getElementById('gear-screen'); if (gs) gs.style.display = 'flex';
          }
          else if (act === 'campfireKitchen') { if (typeof showCampfireKitchen === 'function') showCampfireKitchen(); }
        };
      });
    }
    // Re-show on next camp visit
    function _resetUnspentBarDismiss() { _unspentBarDismissed = false; }

    // ── Aida Account Progression Nudge ───────────────────────────────────────
    // After runs, Aida explicitly guides the player to the Profile Building when
    // they have available Free Spins, unspent Skill Points, or Challenge rewards.
    // Shows at most once per camp visit to avoid spamming.
    let _aidaProgressionNudgeShownThisVisit = false;
    function _checkAndShowAidaProgressionNudge() {
      if (_aidaProgressionNudgeShownThisVisit) return;
      if (!saveData) return;

      // Only show after profile/account building is unlocked
      const _acctBld = saveData.campBuildings && saveData.campBuildings.accountBuilding;
      if (!_acctBld || (!_acctBld.unlocked && (_acctBld.level || 0) === 0)) return;

      const hasFreeSpin    = window.GameLuckyWheel ? window.GameLuckyWheel.canFreeSpin(saveData) : false;
      const hasSkillPoints = (saveData.skillPoints || 0) > 0;
      const hasAttrPoints  = (saveData.unspentAttributePoints || 0) > 0;

      if (!hasFreeSpin && !hasSkillPoints && !hasAttrPoints) return;

      _aidaProgressionNudgeShownThisVisit = true;

      // Build a short Aida dialogue based on what's available
      const _lines = [{ text: '> A.I.D.A — PROGRESSION ALERT', emotion: 'task', duration: 1800 }];
      if (hasFreeSpin) {
        _lines.push({ text: '> You have a Free Spin waiting, Droplet. Use it. The Wheel rewards the bold.', emotion: 'thinking' });
      }
      if (hasSkillPoints) {
        const sp = saveData.skillPoints || 0;
        _lines.push({ text: `> ${sp} unspent Skill Point${sp > 1 ? 's' : ''}. Visit the Skill Tree — growth untaken is growth wasted.`, emotion: 'task' });
      }
      if (hasAttrPoints) {
        const ap = saveData.unspentAttributePoints || 0;
        _lines.push({ text: `> ${ap} Attribute Point${ap > 1 ? 's' : ''} available. The Training Hall sharpens what combat cannot.`, emotion: 'thinking' });
      }
      _lines.push({ text: '> Head to the Profile Building to claim your rewards. Do not let them collect dust.', emotion: 'goal', isGoal: true });

      if (window.DialogueSystem && _lines.length > 1) {
        // Delay slightly so camp finishes loading before dialogue fires
        setTimeout(() => {
          if (window.DialogueSystem) window.DialogueSystem.show(_lines);
        }, 1500);
      }
    }

    // Show daily reward panel in a popup overlay
    function _showDailyRewardPanel() {
      if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.pauseInput();
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:500;display:flex;align-items:center;justify-content:center;overflow:hidden;';
      const _closeDailyOverlay = () => {
        overlay.remove();
        _updateCampCornerWidgets();
        if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.resumeInput();
      };

      // CSS keyframes injected once
      if (!document.getElementById('daily-track-style')) {
        const sty = document.createElement('style');
        sty.id = 'daily-track-style';
        sty.textContent = `
@keyframes dtCardPop{0%{transform:scale(1)}40%{transform:scale(1.25)}70%{transform:scale(0.95)}100%{transform:scale(1)}}
@keyframes dtGoldCoin{0%{opacity:1;transform:translate(0,0) rotate(0deg)}100%{opacity:0;transform:translate(var(--cx),var(--cy)) rotate(720deg)}}
@keyframes dtEpicPulse{0%,100%{box-shadow:0 0 18px #FFD70088,0 0 36px #FFD70044}50%{box-shadow:0 0 36px #FFD700cc,0 0 72px #FFD700aa}}
@keyframes dtSlideIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.dt-card{background:rgba(0,0,0,0.5);border-radius:10px;padding:8px 4px;text-align:center;cursor:default;transition:border-color .25s,box-shadow .25s,transform .2s;position:relative;}
.dt-card.today{cursor:pointer;}
.dt-card.today:hover{transform:scale(1.06);}
.dt-card.claimed{opacity:.6;filter:grayscale(40%);}
.dt-card.claimed::after{content:'✔';position:absolute;top:2px;right:4px;font-size:10px;color:#2ecc71;}
.dt-card.epic-day{background:linear-gradient(135deg,#1a0a2e,#2a0040);}
.dt-claim-btn{display:block;margin:16px auto 0;padding:12px 32px;font-family:"Bangers",cursive;font-size:1.3em;letter-spacing:2px;border-radius:10px;cursor:pointer;transition:transform .15s;}
.dt-claim-btn:active{transform:scale(0.94);}
.dt-coin-particle{position:fixed;pointer-events:none;font-size:20px;z-index:9999;animation:dtGoldCoin 1s ease-out forwards;}
`;
        document.head.appendChild(sty);
      }

      // Shared AudioContext for cha-ching — reused across claims to avoid browser AudioContext limits
      let _chachingAudioCtx = null;
      function _getChaChingAudioCtx() {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        if (!_chachingAudioCtx) _chachingAudioCtx = new Ctor();
        if (_chachingAudioCtx.state === 'suspended' && _chachingAudioCtx.resume) {
          _chachingAudioCtx.resume().catch(function() {});
        }
        return _chachingAudioCtx;
      }

      // Helper: play cha-ching sound via Web Audio API
      function _playChaChingSound() {
        try {
          const ctx = _getChaChingAudioCtx();
          if (!ctx) return;
          const gain = ctx.createGain();
          const startAt = ctx.currentTime;
          gain.gain.setValueAtTime(0.5, startAt);
          gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.8);
          gain.connect(ctx.destination);
          let lastStop = startAt;
          // Two tones for "cha-ching"
          [880, 1320].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const noteStart = startAt + i * 0.12;
            const noteStop  = noteStart + 0.35;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteStart);
            osc.connect(gain);
            osc.start(noteStart);
            osc.stop(noteStop);
            if (noteStop > lastStop) lastStop = noteStop;
          });
          setTimeout(() => { try { gain.disconnect(); } catch(e) {} },
            Math.ceil((lastStop - startAt) * 1000) + 100);
        } catch(e) { /* audio not available */ }
      }

      // Helper: spawn CSS coin particles from a card element
      function _spawnCoinParticles(cardEl) {
        const rect = cardEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (let i = 0; i < 18; i++) {
          const coin = document.createElement('div');
          coin.className = 'dt-coin-particle';
          coin.textContent = '🪙';
          const angle = (i / 18) * Math.PI * 2;
          const dist = 80 + Math.random() * 120;
          coin.style.setProperty('--cx', Math.cos(angle) * dist + 'px');
          coin.style.setProperty('--cy', Math.sin(angle) * dist - 60 + 'px');
          coin.style.left = cx + 'px';
          coin.style.top  = cy + 'px';
          coin.style.animationDelay = (Math.random() * 0.2) + 's';
          document.body.appendChild(coin);
          setTimeout(() => coin.remove(), 1400);
        }
      }

      const panel = document.createElement('div');
      panel.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#0d1020);border:4px solid #FFD700;border-radius:16px;padding:24px 20px;max-width:92vw;width:440px;color:#fff;font-family:"Bangers",cursive;text-align:center;box-shadow:0 0 40px rgba(255,215,0,0.6);position:relative;animation:dtSlideIn .35s ease-out;';

      if (window.GameDailies) {
        const rewards = window.GameDailies.DAILY_LOGIN_REWARDS; // always 7 entries now
        const streak  = (saveData.dailies && saveData.dailies.loginStreak) || 0;
        const canClaim = window.GameDailies.isDailyAvailable(saveData);
        const peeked  = canClaim ? window.GameDailies.peekDailyReward(saveData) : null;
        // Which day within the 7-day cycle is "today"?
        const todayDayNum = canClaim && peeked ? ((peeked.day - 1) % 7) + 1 : 0;
        // How many days in the current cycle have been claimed
        const cycleStreak = streak % 7;
        // claimedDayCount: days claimed in the current 7-day cycle (handles full-week case)
        const claimedDayCount = (cycleStreak === 0 && streak > 0) ? 7 : cycleStreak;

        const _rarityColors = ['#aaaaaa','#55cc55','#44aaff','#aa44ff','#ffaa00','#ff7700','#FFD700'];

        let html = '<div style="font-size:1.7em;letter-spacing:3px;color:#FFD700;text-shadow:2px 2px 0 #000;margin-bottom:6px;">🎁 WEEKLY REWARD TRACK</div>';
        html += '<div style="font-family:Arial,sans-serif;font-size:12px;color:#ccc;margin-bottom:16px;">Streak: <b style="color:#FFD700;">' + streak + '</b> days &nbsp;|&nbsp; Week cycle day <b style="color:#adf;">' + claimedDayCount + '/7</b></div>';
        html += '<div id="dt-track-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:18px;">';

        rewards.forEach(function(r, i) {
          const dayNum  = i + 1;
          // A day is claimed if its number falls within claimedDayCount when not claiming today,
          // or strictly below todayDayNum when claiming today.
          const isClaimed = canClaim ? dayNum < todayDayNum : dayNum <= claimedDayCount;
          const isToday  = canClaim && dayNum === todayDayNum;
          const isEpic   = r.isEpic || dayNum === 7;
          const rColor   = _rarityColors[i] || '#FFD700';
          const border   = isToday  ? '2px solid ' + rColor :
                           isClaimed ? '2px solid rgba(46,204,113,0.3)' :
                                       '2px solid rgba(255,255,255,0.1)';
          const glow     = isToday  ? '0 0 12px ' + rColor + 'aa' : isEpic ? '0 0 8px #FFD70044' : 'none';
          const extraCls = (isClaimed ? ' claimed' : '') + (isToday ? ' today' : '') + (isEpic ? ' epic-day' : '');
          html += '<div class="dt-card' + extraCls + '" data-day="' + dayNum + '" style="border:' + border + ';box-shadow:' + glow + ';' + (isEpic ? 'animation:dtEpicPulse 2s ease-in-out infinite;' : '') + '">';
          html += '<div style="font-size:9px;color:#888;margin-bottom:2px;">DAY ' + dayNum + '</div>';
          html += '<div style="font-size:' + (isEpic ? '22px' : '18px') + ';">' + (isClaimed ? '✅' : r.icon) + '</div>';
          if (r.gold)   html += '<div style="font-size:8px;color:' + rColor + ';">' + r.gold + 'g</div>';
          if (r.gems)   html += '<div style="font-size:8px;color:#88eeff;">' + r.gems + '💎</div>';
          if (isEpic && !isClaimed) html += '<div style="font-size:7px;color:#FFD700;margin-top:2px;">EPIC!</div>';
          html += '</div>';
        });
        html += '</div>';

        if (canClaim && todayDayNum > 0) {
          const todayReward = rewards[todayDayNum - 1];
          const todayColor  = _rarityColors[todayDayNum - 1];
          const isEpicDay   = todayReward.isEpic || todayDayNum === 7;
          html += '<div style="font-family:Arial,sans-serif;font-size:13px;color:#ddd;margin-bottom:12px;">Today\'s reward: <b style="color:' + todayColor + ';">' + (todayReward.label || todayReward.icon) + '</b></div>';
          html += '<button id="dt-claim-btn" class="dt-claim-btn" style="background:linear-gradient(to bottom,' + todayColor + 'cc,' + todayColor + '66);border:3px solid ' + todayColor + ';color:#fff;box-shadow:0 0 16px ' + todayColor + '88,3px 3px 0 #000;' + (isEpicDay ? 'animation:dtEpicPulse 1.5s ease-in-out infinite;' : '') + '">' + (isEpicDay ? '🏆 CLAIM EPIC REWARD' : '🎁 CLAIM DAY ' + todayDayNum) + '</button>';
          html += '<div id="dt-result" style="min-height:32px;margin-top:10px;font-family:Arial,sans-serif;font-size:13px;"></div>';
        } else {
          html += '<div style="margin-top:8px;color:#aaa;font-family:Arial,sans-serif;font-size:13px;">✅ Already claimed today! Come back tomorrow.</div>';
        }

        panel.innerHTML = html;

        if (canClaim && todayDayNum > 0) {
          let _claimDone = false;
          const claimBtn = panel.querySelector('#dt-claim-btn');
          const cardEl   = panel.querySelector('[data-day="' + todayDayNum + '"]');

          claimBtn.onclick = function() {
            if (_claimDone) return;
            _claimDone = true;

            const result = window.GameDailies.checkDailyLogin(saveData);
            if (!result.alreadyClaimed) {
              // checkDailyLogin already applies gold, gems, and all other rewards to saveData.
              // Only build the parts list here for the stat-change notification.
              const _parts = [];
              if (result.gold)            _parts.push('+' + result.gold + ' Gold');
              if (result.gems)            _parts.push('+' + result.gems + ' Gems');
              if (result.skillPoints)     _parts.push('+' + result.skillPoints + ' Skill Pts');
              if (result.attributePoints) _parts.push('+' + result.attributePoints + ' Attr Pts');
              saveSaveData();
              showStatChange('🎁 Day ' + result.day + ': ' + (_parts.join(' · ') || 'Claimed!'));
            }

            // Juice: card pop animation + glow
            if (cardEl) {
              cardEl.style.animation = 'dtCardPop 0.5s ease-out';
              cardEl.style.boxShadow = '0 0 28px ' + _rarityColors[todayDayNum - 1] + 'cc';
              cardEl.style.borderColor = _rarityColors[todayDayNum - 1];
              _spawnCoinParticles(cardEl);
            }
            _playChaChingSound();

            claimBtn.disabled = true;
            claimBtn.textContent = '✅ Claimed!';
            claimBtn.style.opacity = '0.6';

            // Show result badge
            const rEl = panel.querySelector('#dt-result');
            if (rEl) {
              rEl.style.color = _rarityColors[todayDayNum - 1];
              rEl.innerHTML = '⭐ ' + (result.label || 'Reward claimed!');
            }

            // Panel border glow upgrade
            panel.style.borderColor = _rarityColors[todayDayNum - 1];
            panel.style.boxShadow   = '0 0 60px ' + _rarityColors[todayDayNum - 1] + '88, 0 0 30px ' + _rarityColors[todayDayNum - 1] + '44';

            if (typeof window.rarityEscalationReveal === 'function') {
              const _dailyRarityByDay = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'mythic'];
              const _claimedDayIdx = Math.max(1, Math.min(_dailyRarityByDay.length, (result && result.day) || todayDayNum));
              const _claimRarity = _dailyRarityByDay[_claimedDayIdx - 1];
              window.rarityEscalationReveal(panel, _claimRarity, {});
            }
          };
        }
      } else {
        panel.innerHTML = '<div style="color:#FFD700;font-size:1.4em;">Daily Rewards not available</div>';
      }

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕  Close';
      closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:1px solid rgba(255,255,255,0.2);color:#ccc;font-size:14px;cursor:pointer;font-family:"Bangers",cursive;padding:2px 10px;border-radius:8px;letter-spacing:1px;';
      closeBtn.onclick = () => _closeDailyOverlay();
      panel.style.position = 'relative';
      panel.appendChild(closeBtn);
      overlay.appendChild(panel);
      overlay.onclick = (e) => { if (e.target === overlay) _closeDailyOverlay(); };
      document.body.appendChild(overlay);
    }

    // Show spin wheel panel in a popup overlay
    function _showSpinWheelPanel() {
      if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.pauseInput();
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:500;display:flex;align-items:center;justify-content:center;';
      const _closeWheelOverlay = () => {
        overlay.remove();
        _updateCampCornerWidgets();
        if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.resumeInput();
      };
      const panel = document.createElement('div');
      panel.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#0d1020);border:4px solid #FFD700;border-radius:14px;padding:24px;max-width:90vw;width:420px;color:#fff;font-family:"Bangers",cursive;text-align:center;box-shadow:0 0 30px rgba(255,215,0,0.5);overflow-y:auto;max-height:90vh;';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;font-family:Arial,sans-serif;';
      closeBtn.onclick = () => _closeWheelOverlay();
      panel.style.position = 'relative';
      if (window.GameLuckyWheel) {
        window.GameLuckyWheel.renderWheelPanel(saveData, panel);
      } else {
        panel.innerHTML = '<div style="color:#FFD700;">Wheel not available</div>';
      }
      panel.appendChild(closeBtn);
      overlay.appendChild(panel);
      overlay.onclick = (e) => { if (e.target === overlay) _closeWheelOverlay(); };
      document.body.appendChild(overlay);
    }

    // ── Profile & Records Building Overlay ───────────────────────────────────
    // Shows the account stats + spin wheel + GameAccount panel in the
    // camp-bld-overlay frosted-glass style when clicked from 3D camp.
    function showAccountBuildingOverlay() {
      const existing = document.getElementById('account-building-overlay');
      if (existing) existing.remove();

      if (window.CampWorld) window.CampWorld.pauseInput();

      const overlay = document.createElement('div');
      overlay.id = 'account-building-overlay';
      overlay.className = 'camp-bld-overlay';
      overlay.style.zIndex = '500';

      const panel = document.createElement('div');
      panel.className = 'camp-bld-panel';
      panel.style.maxWidth = '560px';

      // Header
      const header = document.createElement('div');
      header.className = 'camp-bld-header';
      header.innerHTML = '<span class="camp-bld-title">👤 PROFILE &amp; RECORDS</span>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'camp-bld-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close';
      closeBtn.onclick = () => {
        panel.classList.add('closing');
        setTimeout(() => {
          overlay.remove();
          if (window.CampWorld) window.CampWorld.resumeInput();
        }, 200);
      };
      header.appendChild(closeBtn);
      panel.appendChild(header);

      // Subtitle
      const subtitle = document.createElement('div');
      subtitle.className = 'camp-bld-subtitle';
      subtitle.textContent = 'Account level · stats · spin wheel · challenge rewards';
      panel.appendChild(subtitle);

      // Account stats panel
      const statsDiv = document.createElement('div');
      statsDiv.id = 'account-bld-stats';
      panel.appendChild(statsDiv);

      // Spin Wheel section (if available free spin)
      if (window.GameLuckyWheel) {
        const spinSep = document.createElement('hr');
        spinSep.style.cssText = 'border:none;border-top:1px solid rgba(255,215,0,0.25);margin:12px 0;';
        panel.appendChild(spinSep);

        const spinHdr = document.createElement('div');
        spinHdr.style.cssText = 'color:#FFD700;font-family:"Bangers",cursive;font-size:18px;letter-spacing:2px;text-align:center;margin-bottom:8px;';
        const hasFree = window.GameLuckyWheel.canFreeSpin(saveData);
        spinHdr.textContent = hasFree ? '🎰 FREE SPIN AVAILABLE!' : '🎰 LUCKY WHEEL';
        panel.appendChild(spinHdr);

        const spinWrap = document.createElement('div');
        spinWrap.style.cssText = 'max-height:420px;overflow-y:auto;';
        window.GameLuckyWheel.renderWheelPanel(saveData, spinWrap);
        panel.appendChild(spinWrap);
      }

      // GameAccount panel
      if (window.GameAccount && window.GameAccount.renderAccountPanel) {
        const accSep = document.createElement('hr');
        accSep.style.cssText = 'border:none;border-top:1px solid rgba(0,255,255,0.2);margin:12px 0;';
        panel.appendChild(accSep);
        const accHdr = document.createElement('div');
        accHdr.style.cssText = 'color:#00ffff;font-family:"Bangers",cursive;font-size:18px;letter-spacing:2px;text-align:center;margin-bottom:8px;';
        accHdr.textContent = '📊 ACCOUNT PROGRESSION';
        panel.appendChild(accHdr);
        const accWrap = document.createElement('div');
        panel.appendChild(accWrap);
        window.GameAccount.renderAccountPanel(saveData, accWrap);
      }

      overlay.appendChild(panel);
      overlay.addEventListener('click', e => { if (e.target === overlay) closeBtn.onclick(); });
      document.body.appendChild(overlay);

      // Populate stats card content
      _renderAccountBldStats(statsDiv);

      // Progress quest if visiting profile for the first time
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest15_accountVisit') {
        progressTutorialQuest('quest15_accountVisit', true);
        saveSaveData();
      }
    }

    // Render compact stats summary into the account building overlay
    function _renderAccountBldStats(container) {
      const level = saveData.accountLevel || 1;
      const totalKills = saveData.totalKills || 0;
      const totalRuns = saveData.totalRuns || 0;
      const questsDone = (saveData.tutorialQuests && saveData.tutorialQuests.completedQuests)
        ? saveData.tutorialQuests.completedQuests.length : 0;
      const totalGold = saveData.totalGoldEarned || 0;
      const sp = saveData.skillPoints || 0;

      // Account XP bar (uses GameAccount for rich data if available)
      let xpBarHTML = '';
      const acc = saveData.account;
      if (acc && typeof acc.xp === 'number') {
        const accLvl = acc.level || 1;
        const MAX_LEVEL = 100;
        const xpNeeded = accLvl * 80 + accLvl * accLvl * 8;
        const xpPct = accLvl >= MAX_LEVEL ? 100 : Math.min(100, Math.floor((acc.xp / xpNeeded) * 100));
        let rankTitle = '';
        if (window.GameAccount && window.GameAccount.getCurrentTitle) {
          rankTitle = window.GameAccount.getCurrentTitle(saveData) || '';
        }
        // Rank color from centralized GameAccount.getRankColor() — single source of truth
        const rankColor = (window.GameAccount && window.GameAccount.getRankColor)
          ? window.GameAccount.getRankColor(rankTitle)
          : '#FFD700';
        xpBarHTML = `
          <div style="background:linear-gradient(135deg,rgba(0,0,20,0.9),rgba(10,0,40,0.95));border:2px solid ${rankColor};border-radius:12px;padding:14px 18px;margin-bottom:14px;box-shadow:0 0 18px ${rankColor}44;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="font-family:'Bangers',cursive;font-size:22px;color:${rankColor};letter-spacing:2px;text-shadow:0 0 10px ${rankColor}88;">⭐ LVL ${accLvl}</div>
              ${rankTitle ? `<div style="font-family:'Bangers',cursive;font-size:14px;color:${rankColor};letter-spacing:1px;opacity:0.9;">${rankTitle}</div>` : ''}
            </div>
            <div style="background:rgba(0,0,0,0.5);border-radius:6px;height:14px;overflow:hidden;margin-bottom:5px;border:1px solid rgba(255,255,255,0.1);">
              <div style="width:${xpPct}%;height:100%;background:linear-gradient(90deg,${rankColor}88,${rankColor});transition:width 0.6s ease;border-radius:6px;box-shadow:0 0 8px ${rankColor};"></div>
            </div>
            <div style="font-size:10px;color:rgba(255,255,255,0.5);text-align:right;letter-spacing:1px;">
              ${accLvl >= MAX_LEVEL ? 'MAX LEVEL' : acc.xp.toLocaleString() + ' / ' + xpNeeded.toLocaleString() + ' XP'}
            </div>
          </div>`;
      }

      // Use live in-run playerStats when available, otherwise use defaults
      const ps = (window.GamePlayer && typeof window.GamePlayer.getDefaultPlayerStats === 'function')
        ? window.GamePlayer.getDefaultPlayerStats(20) : {};
      const live = (typeof playerStats !== 'undefined' && playerStats) ? playerStats : ps;
      container.innerHTML = `
        ${xpBarHTML}
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:12px;">
          <div style="background:rgba(255,215,0,0.08);border:2px solid #FFD700;border-radius:10px;padding:8px 14px;text-align:center;min-width:80px;">
            <div style="font-family:'Bangers',cursive;font-size:26px;color:#FFD700;">${level}</div>
            <div style="font-size:10px;color:#aaa;letter-spacing:1px;">ACCOUNT LVL</div>
          </div>
          <div style="background:rgba(231,76,60,0.08);border:2px solid #e74c3c;border-radius:10px;padding:8px 14px;text-align:center;min-width:80px;">
            <div style="font-family:'Bangers',cursive;font-size:26px;color:#e74c3c;">${totalKills.toLocaleString()}</div>
            <div style="font-size:10px;color:#aaa;letter-spacing:1px;">TOTAL KILLS</div>
          </div>
          <div style="background:rgba(46,204,113,0.08);border:2px solid #2ecc71;border-radius:10px;padding:8px 14px;text-align:center;min-width:80px;">
            <div style="font-family:'Bangers',cursive;font-size:26px;color:#2ecc71;">${questsDone}</div>
            <div style="font-size:10px;color:#aaa;letter-spacing:1px;">QUESTS DONE</div>
          </div>
          <div style="background:rgba(93,173,226,0.08);border:2px solid #5DADE2;border-radius:10px;padding:8px 14px;text-align:center;min-width:80px;">
            <div style="font-family:'Bangers',cursive;font-size:26px;color:#5DADE2;">${totalRuns}</div>
            <div style="font-size:10px;color:#aaa;letter-spacing:1px;">TOTAL RUNS</div>
          </div>
          ${sp > 0 ? `<div style="background:rgba(170,68,255,0.08);border:2px solid #aa44ff;border-radius:10px;padding:8px 14px;text-align:center;min-width:80px;">
            <div style="font-family:'Bangers',cursive;font-size:26px;color:#aa44ff;">${sp}</div>
            <div style="font-size:10px;color:#aaa;letter-spacing:1px;">SKILL PTS</div>
          </div>` : ''}
        </div>
        <div style="color:rgba(180,220,255,0.55);font-size:11px;text-align:center;margin-bottom:10px;">
          💰 Total Gold Earned: <span style="color:#FFD700;">${totalGold.toLocaleString()}</span>
        </div>
        <div id="profile-rpg-stats" style="max-height:340px;overflow-y:auto;padding-right:4px;">
          ${_buildRpgStatsHTML(live)}
        </div>`;
    }

    function _buildRpgStatsHTML(s) {
      function row(label, value, color) {
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-radius:4px;background:rgba(255,255,255,0.03);margin-bottom:2px;">
          <span style="color:#ccc;font-size:11px;">${label}</span>
          <span style="color:${color || '#FFD700'};font-size:12px;font-weight:bold;">${value}</span>
        </div>`;
      }
      function section(title, color) {
        return `<div style="font-family:'Bangers',cursive;font-size:13px;color:${color || '#FFD700'};letter-spacing:2px;margin:8px 0 3px 0;border-bottom:1px solid rgba(255,215,0,0.2);padding-bottom:2px;">${title}</div>`;
      }
      function pct(v) { return Math.round((v || 0) * 100) + '%'; }
      function mul(v) { return (v != null ? Number(v) : 1).toFixed(2) + 'x'; }
      function plus(v) { return ((v || 0) >= 0 ? '+' : '') + (v || 0); }

      return `
        ${section('⚔️ OFFENSE', '#FF6644')}
        ${row('Melee Damage', plus(s.meleeDamage), '#FF8866')}
        ${row('Projectile Damage', plus(s.projectileDamage), '#FF8866')}
        ${row('Melee Attack Speed', mul(s.meleeAttackSpeed), '#FF8866')}
        ${row('Projectile Fire Rate', mul(s.projectileFireRate), '#FF8866')}
        ${row('Projectile Speed', mul(s.projectileSpeed), '#FFaa66')}
        ${row('Projectile Size', mul(s.projectileSize), '#FFaa66')}
        ${row('Armor Penetration', pct(s.armorPenetration), '#FF4444')}
        ${row('Crit Chance', pct(s.critChance), '#FFD700')}
        ${row('Crit Damage', mul(s.critDmg), '#FFD700')}
        ${section('⏱️ COOLDOWNS', '#44AAFF')}
        ${row('Melee Cooldown', mul(s.meleeCooldown), '#88CCFF')}
        ${row('Skill Cooldown', mul(s.skillCooldown), '#88CCFF')}
        ${row('Dash/Dodge Cooldown', mul(s.dashCooldown), '#88CCFF')}
        ${section('🏃 MOVEMENT', '#44FF88')}
        ${row('Base Movement Speed', mul(s.baseMovementSpeed), '#66FFAA')}
        ${row('Sprint / Dash Speed', mul(s.sprintDashSpeed), '#66FFAA')}
        ${section('🛡️ DEFENSE & UTILITY', '#AAAAFF')}
        ${row('Max HP', s.maxHp || 100, '#FF4466')}
        ${row('HP Regen', (s.hpRegenRate || s.hpRegen || 0) + '/s', '#FF6688')}
        ${row('Armor', (s.armor || 0) + '%', '#AAAAFF')}
        ${row('Damage Reduction', pct(s.damageReduction), '#AAAAFF')}
        ${row('Dodge Chance', pct((s.dodgeChance || 0) + (s.dodgeChanceBonus || 0)), '#CCCCFF')}
        ${row('Lifesteal', pct(s.lifesteal || s.lifeStealPercent), '#FF44AA')}
        ${section('🔥 ELEMENTAL', '#FF8844')}
        ${row('Fire Damage', pct(s.fireDamage || s.fireDmgBonus), '#FF4400')}
        ${row('Fire Resist', pct(s.fireResist), '#FF6622')}
        ${row('Ice Damage', pct(s.iceDamage), '#44CCFF')}
        ${row('Ice Resist', pct(s.iceResist), '#66DDFF')}
        ${row('Poison Damage', pct(s.poisonDamage), '#44FF44')}
        ${row('Poison Resist', pct(s.poisonResist), '#66FF66')}
        ${row('Lightning Damage', pct(s.lightningDamage || s.lightningDmgBonus), '#FFFF00')}
        ${row('Lightning Resist', pct(s.lightningResist), '#FFFF88')}
        ${section('💰 ECONOMY', '#FFD700')}
        ${row('Gold Drop Bonus', pct(s.goldDropBonus), '#FFD700')}
        ${row('EXP Gain Bonus', pct(s.expGainBonus), '#FFD700')}
        ${row('Item Drop Rate (Luck)', mul(s.itemDropRate || s.dropRate), '#FFD700')}
      `;
    }

    function updateCampScreen() {
      // Reset unspent bar dismiss so it shows again each camp visit
      _resetUnspentBarDismiss();
      // Reset Aida nudge flag so it shows once per visit
      _aidaProgressionNudgeShownThisVisit = false;

      // If the player returned via "CONTINUE QUESTLINE" from the end screen, trigger AIDA
      if (window._pendingAIDADialogueOnCamp) {
        window._pendingAIDADialogueOnCamp = false;
        setTimeout(function () {
          const DS = window.DialogueSystem;
          if (DS && DS.DIALOGUES && DS.DIALOGUES.aidaQuestHallHint && typeof DS.show === 'function') {
            DS.show(DS.DIALOGUES.aidaQuestHallHint);
          } else if (typeof showQuestHall === 'function') {
            showQuestHall();
          }
        }, 2500);
      }

      // Hide combat HUD (Rage Bar + Special Attacks) — not visible in camp
      if (window.GameRageCombat) window.GameRageCombat.setCombatHUDVisible(false);

      // Hide the game HUD layer — not needed in camp (avoids black rectangles over 3D world)
      const uiLayer = document.getElementById('ui-layer');
      if (uiLayer) uiLayer.style.visibility = 'hidden';

      // Hide main menu and gameover screen to prevent overlap with camp
      const _mainMenuEl = document.getElementById('main-menu');
      if (_mainMenuEl) _mainMenuEl.style.display = 'none';
      const _gameoverEl = document.getElementById('gameover-screen');
      if (_gameoverEl) _gameoverEl.style.display = 'none';

      // Apply 3D camp mode only when CampWorld and the renderer are actually available.
      // This preserves the 2D fallback UI (interactive building cards, pointer-events) if
      // CampWorld fails to load or the renderer is not yet initialised.
      const _campScreenEl = document.getElementById('camp-screen');
      // Use window.gameRenderer as a reliable fallback: it is set via window.gameRenderer = renderer
      // inside init() at the same time as the let renderer variable. This guards against any
      // edge-case where the let-scoped variable is not in scope here (e.g. init() partial failure).
      const _rendererRef = (typeof renderer !== 'undefined' ? renderer : null) || window.gameRenderer;
      const canUse3DCamp = !!(window.CampWorld && _rendererRef);
      // CRITICAL: Log diagnostic info for boot crash debugging
      console.log('[updateCampScreen] Diagnostic:', {
        hasCampWorld: !!window.CampWorld,
        hasRenderer: !!_rendererRef,
        canUse3DCamp: canUse3DCamp
      });
      // Explicit add/remove used here for clarity.
      if (_campScreenEl) {
        if (canUse3DCamp) {
          _campScreenEl.classList.add('camp-3d-mode');
        } else {
          _campScreenEl.classList.remove('camp-3d-mode');
        }
      }
      // When 3D camp is active, also directly hide the buildings section so there is no
      // flash of 2D cards before the CSS rule takes effect.
      // When in 2D fallback mode, explicitly restore the buildings section so the
      // 2D camp UI is visible (CampWorld/renderer unavailable).
      if (canUse3DCamp) {
        const _campBuildingsEl = document.getElementById('camp-buildings-section');
        if (_campBuildingsEl) _campBuildingsEl.style.display = 'none';
        // Explicitly show the game-container so the Three.js canvas is visible.
        // (It may have been hidden by a prior 2D-mode camp visit.)
        const _gameContainerEl = document.getElementById('game-container');
        if (_gameContainerEl) _gameContainerEl.style.display = 'block';
      } else {
        // 2D fallback: ensure buildings section is visible so the camp is not blank.
        const _campBuildingsEl = document.getElementById('camp-buildings-section');
        if (_campBuildingsEl) _campBuildingsEl.style.display = '';
      }

      // First-run tutorial hook: fire after current call stack (by then camp-screen is visible)
      // Update action button label based on game state
      const campActionBtn = document.getElementById('camp-action-btn');
      if (campActionBtn) {
        campActionBtn.textContent = '▶ NEW RUN';
      }

      // ── 3D Camp Hub World ──────────────────────────────────────────────
      // Activate the 3D camp whenever this screen is opened.  Callbacks map
      // building IDs to the existing 2D UI functions so interactions still work.
      // Guard: renderer is module-scoped and is null until init() runs; skip 3D mode
      // if renderer is not yet ready (e.g. very first frame before init completes).
      // Declared at this scope so the late fallback below can reuse the same callbacks.
      let campCallbacks;
      if (window.CampWorld && _rendererRef) {
        campCallbacks = {
          questMission:        () => showQuestHall(),
          skillTree:           () => document.getElementById('camp-skills-tab').click(),
          armory:              () => {
            if (typeof window.showArmory === 'function') {
              window.showArmory();
            } else {
              try { updateGearScreen(); } catch(e) {}
              document.getElementById('gear-screen').style.display = 'flex';
            }
          },
          trainingHall:        () => document.getElementById('camp-training-tab').click(),
          forge:               () => showProgressionShop(),
          companionHouse:      () => showCompanionHouse(),
          achievementBuilding: () => {
            if (typeof window.showHallOfFameScreen === 'function') {
              window.showHallOfFameScreen();
            } else {
              if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest12_visitAchievements') {
                progressTutorialQuest('quest12_visitAchievements', true);
                saveSaveData();
              }
              document.getElementById('camp-screen').style.display = 'none';
              const achScreen = document.getElementById('achievements-screen');
              if (achScreen) {
                achScreen.style.display = 'flex';
                const achContent = document.getElementById('achievements-content');
                if (achContent && typeof renderAchievementsContent === 'function') renderAchievementsContent(achContent);
              }
            }
          },
          inventory:           () => showInventoryScreen(),
          campBoard:           () => { window.location.href = 'sandbox.html'; },
          specialAttacks:      () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3b_useSpecialAttacks') {
              progressTutorialQuest('quest3b_useSpecialAttacks', true);
              saveSaveData();
            }
            showSpecialAttacksPanel();
          },
          warehouse:           () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest7b_useWarehouse') {
              progressTutorialQuest('quest7b_useWarehouse', true);
              saveSaveData();
            }
            if (window.StatCards && typeof window.StatCards.open === 'function') {
              window.StatCards.open();
            }
          },
          tavern:              () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9b_visitTavern') {
              progressTutorialQuest('quest9b_visitTavern', true);
              saveSaveData();
            }
            showExpeditionsMenu ? showExpeditionsMenu() : showQuestHall();
          },
          shop:                () => {
            if (typeof showGachaStore === 'function') { showGachaStore(); }
            else { showProgressionShop(); }
          },
          prestige:            () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest10b_usePrestige') {
              progressTutorialQuest('quest10b_usePrestige', true);
              saveSaveData();
            }
            showPrestigeMenu ? showPrestigeMenu() : showProgressionShop();
          },
          trashRecycle:        () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest27_useRecycle') {
              progressTutorialQuest('quest27_useRecycle', true);
              saveSaveData();
            }
            showInventoryScreen();
          },
          campfireKitchen:     () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest30_buildCampfire') {
              progressTutorialQuest('quest30_buildCampfire', true);
              saveSaveData();
            }
            showCampfireKitchen();
          },
          weaponsmith:         () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest31_buildWeaponsmith') {
              progressTutorialQuest('quest31_buildWeaponsmith', true);
              saveSaveData();
            }
            showWeaponsmith();
          },
          tempShop:            () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest29_useTempShop') {
              progressTutorialQuest('quest29_useTempShop', true);
              saveSaveData();
            }
            showProgressionShop();
          },
          prismReliquary:      () => {
            if (typeof showPrismReliquary === 'function') { showPrismReliquary(); }
          },
          astralGateway:       () => {
            if (typeof window.showAstralGateway === 'function') { window.showAstralGateway(); }
          },
          droppletShop:        () => {
            if (typeof window.showDroppletShopUI === 'function') { window.showDroppletShopUI(); }
          },
          gachaStore:          () => {
            if (typeof showGachaStore === 'function') { showGachaStore(); }
            else { showProgressionShop(); }
          },
          accountBuilding:     () => showAccountBuildingOverlay(),
          idleMenu:            () => showIdleSection(),
          shrine:              () => showArtifactShrineUI(),
          codex:               () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest17_visitCodex') {
              progressTutorialQuest('quest17_visitCodex', true);
              saveSaveData();
            }
            openCodex();
          },
        };
        console.log('[updateCampScreen] Calling CampWorld.enter with renderer:', _rendererRef);
        let _enterSucceeded = false;
        try {
          window.CampWorld.enter(_rendererRef, typeof saveData !== 'undefined' ? saveData : {}, campCallbacks);
          console.log('[updateCampScreen] CampWorld.enter succeeded, isActive:', window.CampWorld.isActive);
          _enterSucceeded = true;
        } catch (e) {
          console.error('[updateCampWorld] CampWorld.enter failed:', e);
          // Show 2D fallback if 3D camp fails to initialize
          if (_campScreenEl) _campScreenEl.classList.remove('camp-3d-mode');
          const _campBuildingsEl = document.getElementById('camp-buildings-section');
          if (_campBuildingsEl) _campBuildingsEl.style.display = '';
        }
        // Force camp-3d-mode so CSS hides all 2D building cards regardless of timing
        if (_enterSucceeded && _campScreenEl) {
          _campScreenEl.classList.add('camp-3d-mode');
          _campScreenEl.style.display = 'flex';
        }
      } else {
        // 2D camp mode: hide game container to prevent black canvas showing behind camp UI
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.style.display = 'none';
      }
      // ──────────────────────────────────────────────────────────────────

      // Refresh idle panel (spin wheel, account, etc.) whenever camp is opened
      if (window.GameIdleBootstrap) window.GameIdleBootstrap.refreshPanel();
      // Update account level display whenever camp is opened
      updateAccountLevelDisplay();
      // Update corner notification dots and streak label
      _updateCampCornerWidgets();
      // ── Aida guidance: nudge player toward Profile Building if they have pending rewards ──
      _checkAndShowAidaProgressionNudge();
      // Check for first-time camp visit
      if (!saveData.hasVisitedCamp) {
        saveData.hasVisitedCamp = true;
        // Quest Hall is the only building built at start — all others lock until quests unlock them
        if (saveData.campBuildings) {
          // Ensure Quest Hall is built
          if (saveData.campBuildings.questMission) {
            saveData.campBuildings.questMission.unlocked = true;
            saveData.campBuildings.questMission.level = 1;
          }
          // Lock all other buildings for fresh start quest flow
          const keepBuilt = ['questMission'];
          Object.keys(saveData.campBuildings).forEach(function(bId) {
            if (!keepBuilt.includes(bId)) {
              saveData.campBuildings[bId].unlocked = false;
              saveData.campBuildings[bId].level = 0;
            }
          });
        }
        
        if (!saveData.storyQuests.welcomeShown) {
          saveData.storyQuests.welcomeShown = true;
        }

        // Pre-activate Quest 1 so player sees it immediately in the Quest Hall
        if (typeof window.initFirstQuest === 'function') {
          window.initFirstQuest();
        }
        
        saveSaveData();
      }
      
      // Refresh 3D camp building visuals after any first-visit state changes
      if (window.CampWorld && window.CampWorld.isActive) {
        window.CampWorld.refreshBuildings(saveData);
      }

      // Update buildings section
      const buildingsContent = document.getElementById('camp-buildings-content');
      buildingsContent.innerHTML = '';
      
      for (const [buildingId, building] of Object.entries(CAMP_BUILDINGS)) {
        const buildingData = saveData.campBuildings[buildingId];
        if (!buildingData) continue; // Skip if not in save data
        
        // Hide legacy buildings if not unlocked
        if (building.isLegacy && !buildingData.unlocked) continue;
        
        const cost = getBuildingCost(buildingId);
        const isMaxLevel = buildingData.level >= buildingData.maxLevel;
        const canAfford = saveData.gold >= cost;
        const isUnlocked = buildingData.unlocked || buildingData.level > 0;
        
        // Skip locked paid buildings - show them with quest unlock requirement
        if (!building.isFree && !isUnlocked && buildingData.level === 0) {
          // Map building IDs to which tutorial quest unlocks them
          const questUnlockMap = {
            'skillTree': { questId: 'quest1_kill3', label: 'Kill 3 Enemies (Quest 1)' },
            'armory': { questId: 'quest3_stonehengeGear', label: 'Find the Cigar (Quest 3)' },
            'specialAttacks': { questId: 'quest3_stonehengeGear', label: 'Find the Cigar (Quest 3)' },
            'trainingHall': { questId: 'quest5_upgradeAttr', label: 'Upgrade an Attribute (Quest 5)' },
            'forge': { questId: 'questForge0_unlock', label: 'Unlock the Forge (Quest 0b)' },
            'companionHouse': { questId: 'quest8_kill10', label: 'Kill 10 Enemies (Quest 8)' },
            'trashRecycle': { questId: 'quest26_kill20', label: 'Kill 20 Enemies (Quest 26)' },
            'tempShop': { questId: 'quest28_survive3min', label: 'Survive 3 Minutes (Quest 28)' }
          };
          
          const questInfo = questUnlockMap[buildingId] || { questId: null, label: 'Complete a Quest' };
          // Legacy unlock quests
          const legacyUnlockQuests = {
            'skillTree': 'unlockSkillTree',
            'forge': 'unlockForge',
            'trashRecycle': 'unlockRecycle',
            'armory': 'unlockArmory',
            'companionHouse': 'unlockCompanionHouse',
            'trainingHall': 'unlockTrainingHall'
          };
          const hasLegacyUnlockQuest = legacyUnlockQuests[buildingId] && 
                                  saveData.storyQuests.currentQuest === legacyUnlockQuests[buildingId];
          
          const buildingCard = document.createElement('div');
          buildingCard.className = 'building-card';
          buildingCard.style.opacity = '0.7';
          buildingCard.style.cursor = 'not-allowed';
          
          buildingCard.innerHTML = `
            <div class="building-header">
              <div class="building-name">${building.icon} ${building.name}</div>
              <div class="building-level" style="color:#FF6B6B;">🔒 LOCKED</div>
            </div>
            <div class="building-desc">${building.description}</div>
            <div class="building-cost" style="color:#FFD700; font-size:12px;">🗝️ Unlock: ${questInfo.label}</div>
          `;
          
          buildingCard.onclick = () => {
            if (hasLegacyUnlockQuest) {
              // Quest-based unlock (FREE) — legacy system
              buildingData.unlocked = true;
              saveSaveData();
              updateCampScreen();
              playSound('collect');
              if (buildingId === 'skillTree' && saveData.storyQuests.currentQuest === 'unlockSkillTree') progressQuest('unlockSkillTree', true);
              else if (buildingId === 'forge' && saveData.storyQuests.currentQuest === 'unlockForge') progressQuest('unlockForge', true);
              else if (buildingId === 'trashRecycle' && saveData.storyQuests.currentQuest === 'unlockRecycle') progressQuest('unlockRecycle', true);
              else if (buildingId === 'armory' && saveData.storyQuests.currentQuest === 'unlockArmory') progressQuest('unlockArmory', true);
              else if (buildingId === 'companionHouse' && saveData.storyQuests.currentQuest === 'unlockCompanionHouse') progressQuest('unlockCompanionHouse', true);
              else if (buildingId === 'trainingHall' && saveData.storyQuests.currentQuest === 'unlockTrainingHall') progressQuest('unlockTrainingHall', true);
              if (buildingId === 'companionHouse' && saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9_activateCompanion') progressTutorialQuest('quest9_activateCompanion', true);
            } else {
              playSound('invalid');
              showStatusMessage(`🔒 Complete "${questInfo.label}" to unlock this building!`, 2500);
            }
          };
          
          addLongPressDetail(buildingCard, `${building.icon} ${building.name}`, building.description);
          buildingsContent.appendChild(buildingCard);
          continue;
        }
        
        // Show unlocked/free buildings
        if (isUnlocked || building.isFree) {
          const buildingCard = document.createElement('div');
          buildingCard.className = 'building-card';
          
          const bonus = building.bonus(buildingData.level);
          const bonusText = Object.entries(bonus)
            .map(([key, value]) => {
              if (key === 'skillPoints') return `${value} skill points`;
              if (key === 'craftingTier') return `Crafting: ${value}`;
              if (key === 'gearTier') return `Max tier: ${value}`;
              if (key === 'companionDamage') return `+${Math.round(value * 100)}% companion dmg`;
              if (key === 'unlocks') return value;
              if (key === 'trainingEfficiency') return `+${Math.round(value * 100)}% training`;
              if (key === 'recycleValue') return `+${Math.round(value * 100)}% recycle`;
              if (key === 'fusionPower') return `+${Math.round(value * 100)}% fusion`;
              if (key === 'shopDiscount') return `+${Math.round(value * 100)}% discount`;
              if (key === 'itemVariety') return `${value} items`;
              if (typeof value === 'number' && value !== 0) {
                if (value >= 1) return `+${Math.round(value)} ${key}`;
                return `+${Math.round(value * 100)}% ${key}`;
              }
              return null; // Filter out undefined/null values
            })
            .filter(text => text !== null && text !== undefined)
            .join(', ') || 'Utility building';
          
          // NEW: Check if building has a notification
          const hasNotification = (buildingId === 'questMission' && saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0) ||
                                 (saveData.storyQuests.questNotifications && saveData.storyQuests.questNotifications[buildingId]);
          
          // NEW: For locked free buildings, show them as locked
          const isLockedFree = building.isFree && !isUnlocked;
          
          // Non-built buildings that are unlocked need a Build button
          const needsBuild = isUnlocked && buildingData.level === 0;

          // Unspent-points badge per building
          let _bldgBadge = '';
          if (!isLockedFree && !needsBuild) {
            if (buildingId === 'skillTree' && (saveData.skillPoints || 0) > 0) _bldgBadge = '<span class="building-badge" style="background:#2ecc71;">🌳 ' + saveData.skillPoints + '</span>';
            else if (buildingId === 'trainingHall' && (saveData.unspentAttributePoints || 0) > 0) _bldgBadge = '<span class="building-badge" style="background:#9b59b6;">⭐ ' + saveData.unspentAttributePoints + '</span>';
            else if (buildingId === 'forge' && (saveData.gold || 0) >= 50) _bldgBadge = '<span class="building-badge" style="background:#e67e22;">💰</span>';
            else if (buildingId === 'companionHouse' && (saveData.companionSkillPoints || 0) > 0) _bldgBadge = '<span class="building-badge" style="background:#e67e22;">🐾 ' + saveData.companionSkillPoints + '</span>';
          }
          
          // Compute resource cost hint for needsBuild buildings
          let _buildCostHint = '';
          if (needsBuild) {
            if (building.isFree || building.isCore) {
              _buildCostHint = '🔨 Build — FREE';
            } else {
              const builtCount = Object.values(saveData.campBuildings).filter(b => b && b.unlocked && b.level > 0).length;
              const resCost = Math.max(1, builtCount + 1);
              const res = saveData.resources || {};
              _buildCostHint = `🔨 Build — 🪵${res.wood||0}/${resCost} 🪨${res.stone||0}/${resCost}`;
            }
          }

           buildingCard.innerHTML = `
             <div class="building-header">
               <div class="building-name">${building.icon} ${building.name}${hasNotification ? ' <span class="quest-indicator">!</span>' : ''}${_bldgBadge}</div>
               <div class="building-level">${isLockedFree ? 'LOCKED' : (needsBuild ? '🔨 BUILD' : '✅ BUILT')}</div>
             </div>
             <div class="building-desc">${building.description}</div>
            <div class="building-cost">${isLockedFree ? 'Unlock via Quest' : (needsBuild ? _buildCostHint : '')}</div>
          `;
          
          // Handle needsBuild: clicking opens the build overlay
          if (needsBuild) {
            buildingCard.style.cursor = 'pointer';
            buildingCard.style.border = '2px solid #5DADE2';
            buildingCard.onclick = () => {
              const buildingName = CAMP_BUILDINGS[buildingId]?.name || 'Building';
              _showBuildOverlay(buildingId, buildingName);
            };
            addLongPressDetail(buildingCard, `${building.icon} ${building.name}`, building.description);
            buildingsContent.appendChild(buildingCard);
            continue;
          }
          
          if (buildingId === 'skillTree') {
            buildingCard.onclick = () => {
              if (saveData.storyQuests.questNotifications) {
                saveData.storyQuests.questNotifications.skillTree = false;
                saveSaveData();
              }
              document.getElementById('camp-skills-tab').click();
            };
            buildingCard.style.cursor = 'pointer';
          } else if (!building.isFree && building.baseCost > 0) {
            // Buildings are unlocked through quests only — clicking opens building's screen
            buildingCard.style.cursor = 'pointer';
            buildingCard.onclick = () => {
              if (buildingId === 'armory') {
                try { updateGearScreen(); } catch(e) { console.error('updateGearScreen error:', e); }
                document.getElementById('gear-screen').style.display = 'flex';
                if (saveData.storyQuests && saveData.storyQuests.buildingFirstUse) {
                  saveData.storyQuests.buildingFirstUse.armory = true;
                  saveSaveData();
                }
              } else if (buildingId === 'trainingHall') {
                document.getElementById('camp-training-tab').click();
              } else if (buildingId === 'forge') {
                showProgressionShop();
              } else if (buildingId === 'companionHouse') {
                showCompanionHouse();
              } else if (buildingId === 'specialAttacks') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3b_useSpecialAttacks') {
                  progressTutorialQuest('quest3b_useSpecialAttacks', true);
                  saveSaveData();
                }
                showSpecialAttacksPanel();
              } else if (buildingId === 'warehouse') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest7b_useWarehouse') {
                  progressTutorialQuest('quest7b_useWarehouse', true);
                  saveSaveData();
                }
                showInventoryScreen();
              } else if (buildingId === 'tavern') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9b_visitTavern') {
                  progressTutorialQuest('quest9b_visitTavern', true);
                  saveSaveData();
                }
                if (typeof showExpeditionsMenu === 'function') showExpeditionsMenu(); else showQuestHall();
              } else if (buildingId === 'prestige') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest10b_usePrestige') {
                  progressTutorialQuest('quest10b_usePrestige', true);
                  saveSaveData();
                }
                if (typeof showPrestigeMenu === 'function') showPrestigeMenu(); else showProgressionShop();
              } else if (buildingId === 'campfireKitchen') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest30_buildCampfire') {
                  progressTutorialQuest('quest30_buildCampfire', true);
                  saveSaveData();
                }
                showCampfireKitchen();
              } else if (buildingId === 'weaponsmith') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest31_buildWeaponsmith') {
                  progressTutorialQuest('quest31_buildWeaponsmith', true);
                  saveSaveData();
                }
                showWeaponsmith();
              } else {
                showStatChange(`${building.icon} ${building.name}`);
              }
            };
          } else if (building.isFree) {
            buildingCard.style.border = '2px solid #FFD700';
            
            // NEW: Locked free buildings should be dimmed and not clickable
            if (isLockedFree) {
              buildingCard.style.opacity = '0.6';
            } else {
              // NEW: Add click handler for unlocked free buildings only
              if (buildingId === 'questMission') {
                // Show notification glow on questMission if quests ready
                if (isQuestMissionReady()) {
                  buildingCard.classList.add('quest-ready-glow');
                }
                buildingCard.onclick = () => showQuestHall();
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'achievementBuilding') {
                // Open Quest Hall → Achievements tab (Phase 4: centralize in Quest Hall)
                buildingCard.onclick = () => {
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest12_visitAchievements') {
                    progressTutorialQuest('quest12_visitAchievements', true);
                    saveSaveData();
                  }
                  // Route to Quest Hall with Achievements tab pre-selected
                  if (typeof showQuestHall === 'function') {
                    window._questHallDefaultTab = 'achievements';
                    showQuestHall();
                  }
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'accountBuilding') {
                // Open account section
                buildingCard.onclick = () => {
                  playSound('waterdrop');
                  showAccountSection();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'idleMenu') {
                // Open Idle Progression section
                buildingCard.onclick = () => {
                  playSound('waterdrop');
                  showIdleSection();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'characterVisuals') {
                buildingCard.onclick = () => {
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest16_visitCharVisuals') {
                    progressTutorialQuest('quest16_visitCharVisuals', true);
                    saveSaveData();
                  }
                  document.getElementById('camp-screen').style.display = 'none';
                  openCharacterVisuals();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'codex') {
                buildingCard.onclick = () => {
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest17_visitCodex') {
                    progressTutorialQuest('quest17_visitCodex', true);
                    saveSaveData();
                  }
                  document.getElementById('camp-screen').style.display = 'none';
                  openCodex();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'skillTree') {
                // Clear notification when clicking on skill tree
                buildingCard.onclick = () => {
                  if (saveData.storyQuests.questNotifications) {
                    saveData.storyQuests.questNotifications.skillTree = false;
                    saveSaveData();
                  }
                  // Switch to skill tree tab
                  document.getElementById('camp-skills-tab').click();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'campHub' || buildingId === 'loreMaster') {
                // Show building info popup
                buildingCard.onclick = () => {
                  const msgs = {
                    campHub: { title: '🏠 Camp Hub', body: 'The central hub of your camp. All activities and buildings are organized through here. Keep upgrading your camp to unlock new buildings and strengthen your runs!' },
                    loreMaster: { title: '📖 Lore Master', body: 'The Lore Master holds the history of Water Drop Survivors. Unlock lore entries by completing quests and defeating special enemies. Coming in a future update!' }
                  };
                  const info = msgs[buildingId];
                  if (info) showComicInfoBox(info.title, `<p style="line-height:1.7;">${info.body}</p>`, 'GOT IT!', () => {});
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'inventory') {
                buildingCard.onclick = () => showInventoryScreen();
                buildingCard.style.cursor = 'pointer';
              } else if (saveData.storyQuests.questNotifications && saveData.storyQuests.questNotifications[buildingId]) {
                // Clear notification on click for other buildings
                buildingCard.onclick = () => {
                  saveData.storyQuests.questNotifications[buildingId] = false;
                  saveSaveData();
                  updateCampScreen();
                };
                buildingCard.style.cursor = 'pointer';
              }
            }
          }
          
          addLongPressDetail(buildingCard, `${building.icon} ${building.name}`, building.description);
          buildingsContent.appendChild(buildingCard);
        }
      }
      
      // Show/hide skill tree tab based on skillTree building unlock status
      const skillTabEl = document.getElementById('camp-skills-tab');
      if (skillTabEl) {
        const skillBuildingData = saveData.campBuildings.skillTree;
        const isSkillTreeUnlocked = skillBuildingData && skillBuildingData.level > 0;
        skillTabEl.style.display = isSkillTreeUnlocked ? '' : 'none';
      }
      
      // Update skills section
      const skillsContent = document.getElementById('camp-skills-content');
      const skillPointsDisplay = document.getElementById('skill-points-display');
      skillPointsDisplay.textContent = `SP: ${saveData.skillPoints}`;
      skillsContent.innerHTML = '';
      
      // Progressive skill unlock: compute once before loop
      const _allSkillIds = Object.keys(SKILL_TREE);
      const _quest1Claimed = isQuestClaimed('quest1_kill3');
      const _quest2Claimed = isQuestClaimed('quest2_spendSkills');
      
      for (const [skillId, skill] of Object.entries(SKILL_TREE)) {
        const skillData = saveData.skillTree[skillId];
        const isMaxLevel = skillData.level >= skill.maxLevel;
        const canAfford = saveData.skillPoints >= skill.cost;
        
        // Progressive unlock: after quest1 only show first 4 skills; after quest2 show all
        const skillIndex = _allSkillIds.indexOf(skillId);
        if (!_quest2Claimed && skillIndex >= 4) continue;
        if (!_quest1Claimed && skillIndex >= 2) continue;
        
        // Skill icon map for branch tree visualization
        const _skillIcons = {
          dash: '🏃', criticalFocus: '🎯', autoAim: '🔫', dashMaster: '⚡',
          headshot: '💀', combatMastery: '⚔️', bladeDancer: '🗡️', heavyStrike: '🔨',
          rapidFire: '🔥', lifeDrain: '❤️', berserkerRage: '😡', executioner: '☠️',
          ironSkin: '🛡️', regeneration: '💚', dodgeMaster: '🦶', magneticField: '🧲',
          goldRush: '💰', expBoost: '📈', survivalInstinct: '🌟', spiritLink: '👻',
          bloodlust: '🩸', overcharge: '⚡', lastStand: '🏴', fireMastery: '🔥',
          iceMastery: '❄️', lightningMastery: '⚡', specialFirestorm: '🌋',
          specialIceAge: '🧊', specialThunderStrike: '⛈️', specialDeathBlossom: '🌸',
          specialVoidPulse: '🌀', specialInfernoRing: '💫', meleeTakedown: '🔪'
        };
        const _getSkillIcon = (id, name) => _skillIcons[id] || (name && name.match(/^[^\w\s]/) ? name.charAt(0) : '🔮');

        // Helper: show a floating info tooltip for a skill node
        const _showSkillInfoTooltip = (node) => {
          const existing = document.getElementById('skill-info-tooltip');
          if (existing) existing.remove();
          const tooltip = document.createElement('div');
          tooltip.id = 'skill-info-tooltip';
          tooltip.style.cssText = 'position:fixed;z-index:9999;background:rgba(10,14,32,0.97);border:2px solid #FFD700;border-radius:12px;padding:12px 16px;max-width:220px;color:#fff;font-size:13px;pointer-events:none;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.85),0 0 12px rgba(255,215,0,0.15);';
          const lvl = skillData.level || 0;
          const lvlStr = lvl > 0 ? `Level ${lvl} / ${skill.maxLevel}` : 'Not unlocked';
          const costStr = isMaxLevel ? '✅ MAX LEVEL' : `${skill.cost} SP per level`;
          tooltip.innerHTML = `<div style="font-size:24px;margin-bottom:4px;">${_getSkillIcon(skillId, skill.name)}</div><div style="font-family:'Bangers',cursive;font-size:16px;color:#FFD700;letter-spacing:1px;margin-bottom:5px;">${skill.name}</div><div style="color:#bbb;font-size:11px;line-height:1.45;margin-bottom:5px;">${skill.description}</div><div style="color:#5DADE2;font-size:11px;">${lvlStr}</div><div style="color:#aaa;font-size:10px;margin-top:4px;">${costStr}</div>${!isMaxLevel && canAfford ? '<div style="color:#888;font-size:10px;margin-top:6px;letter-spacing:0.5px;">⬇ HOLD to purchase</div>' : ''}`;
          document.body.appendChild(tooltip);
          const rect = node.getBoundingClientRect();
          const tw = 220;
          let left = Math.round(rect.left + rect.width / 2 - tw / 2);
          let top = Math.round(rect.top - 160);
          left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
          if (top < 8) top = rect.bottom + 8;
          tooltip.style.left = left + 'px';
          tooltip.style.top = top + 'px';
          clearTimeout(window._skillTooltipTimer);
          window._skillTooltipTimer = setTimeout(() => {
            tooltip.style.transition = 'opacity 0.25s';
            tooltip.style.opacity = '0';
            setTimeout(() => tooltip.remove(), 280);
          }, 2500);
        };

        const skillNode = document.createElement('div');
        skillNode.className = 'skill-node';
        if (skillData.unlocked) skillNode.classList.add('unlocked');
        if (!canAfford || isMaxLevel) skillNode.classList.add('locked');
        if (skill.requires) skillNode.setAttribute('data-has-parent', 'true');
        
        // Build level dots
        let dotsHTML = '';
        if (skill.maxLevel > 1) {
          dotsHTML = '<div class="skill-level-dots">';
          for (let d = 0; d < skill.maxLevel; d++) {
            dotsHTML += `<span class="skill-level-dot${d < skillData.level ? ' filled' : ''}"></span>`;
          }
          dotsHTML += '</div>';
        }

        skillNode.innerHTML = `
          <div class="skill-icon-badge"><span class="skill-icon-emoji">${_getSkillIcon(skillId, skill.name)}</span><div class="skill-hold-progress"></div></div>
          ${dotsHTML}
          <div class="skill-name">${skill.name}</div>
          <div class="skill-desc">${skill.description}</div>
          <div class="skill-cost">${isMaxLevel ? '✅ MAX' : `${skill.cost} SP`}</div>
          ${!isMaxLevel && canAfford ? '<div class="skill-hold-hint">HOLD TO BUY</div>' : ''}
        `;

        // Short press (tap/click) → show info tooltip for all nodes
        let _holdFired = false;
        skillNode.addEventListener('click', () => {
          if (_holdFired) { _holdFired = false; return; }
          _showSkillInfoTooltip(skillNode);
        });

        if (!isMaxLevel && canAfford) {
          let holdTimer = null;
          let holdStart = null;
          const HOLD_DURATION = 800;
          const progressEl = skillNode.querySelector('.skill-hold-progress');
          const iconBadge  = skillNode.querySelector('.skill-icon-badge');

          const startHold = () => {
            if (holdTimer) return;
            _holdFired = false;
            holdStart = Date.now();
            const animate = () => {
              const elapsed = Date.now() - holdStart;
              const pct = Math.min(100, (elapsed / HOLD_DURATION) * 100);
              if (progressEl) progressEl.style.setProperty('--fill', pct + '%');
              if (pct >= 100) {
                holdTimer = null;
                _holdFired = true;
                if (progressEl) progressEl.style.setProperty('--fill', '0%');
                if (iconBadge) {
                  iconBadge.style.animation = 'skillPurchased 0.45s ease-out';
                  setTimeout(() => { if (iconBadge) iconBadge.style.animation = ''; }, 450);
                }
                if (typeof playSound === 'function') playSound('collect');
                unlockSkill(skillId);
              } else {
                holdTimer = requestAnimationFrame(animate);
              }
            };
            holdTimer = requestAnimationFrame(animate);
          };

          const cancelHold = () => {
            if (holdTimer) { cancelAnimationFrame(holdTimer); holdTimer = null; }
            if (progressEl) progressEl.style.setProperty('--fill', '0%');
          };

          skillNode.addEventListener('pointerdown', (e) => { e.preventDefault(); startHold(); });
          skillNode.addEventListener('pointerup', cancelHold);
          skillNode.addEventListener('pointerleave', cancelHold);
          skillNode.addEventListener('pointercancel', cancelHold);
          skillNode.style.cursor = 'pointer';
          skillNode.style.userSelect = 'none';
        }
        
        skillsContent.appendChild(skillNode);
      }
      
      // Update sleep section
      const dayOption = document.getElementById('sleep-day-option');
      const nightOption = document.getElementById('sleep-night-option');
      const currentChoice = document.getElementById('current-time-choice');
      
      if (saveData.nextRunTimeOfDay === 'day') {
        dayOption.style.border = '3px solid #FFD700';
        nightOption.style.border = '3px solid transparent';
        currentChoice.textContent = 'DAY ☀️';
      } else {
        dayOption.style.border = '3px solid transparent';
        nightOption.style.border = '3px solid #FFD700';
        currentChoice.textContent = 'NIGHT 🌙';
      }
      
      // Update training section
      updateTrainingSection();
      
      // Update quest tracker
      updateQuestTracker();
      
      // Update gold display (not on main menu per requirements - only in progression/camp/death)
      const menuGold = document.getElementById('menu-gold');
      if (menuGold) menuGold.textContent = `GOLD: ${saveData.gold}`;

      // Fallback: ensure CampWorld is entered even if the renderer ref was unavailable earlier
      if (window.CampWorld && !window.CampWorld.isActive && _rendererRef) {
          try {
            window.CampWorld.enter(_rendererRef, saveData, campCallbacks);
            const _campScreenEl = document.getElementById('camp-screen');
            if (_campScreenEl) _campScreenEl.classList.add('camp-3d-mode');
          } catch (e) {
            console.error('[updateCampScreen] Fallback CampWorld.enter failed:', e);
          }
      }
    }


    // =========================================================================
    // WATERDROP STORY QUESTS — dark psychological sci-fi questline
    // =========================================================================

    // ── Quest 1 State ─────────────────────────────────────────────────────────
    let _lakeBounceShown = false;

    /**
     * checkLakeBounceQuest(playerMesh)
     * Called every frame from game-loop.js when the game is active.
     * If the player walks near the lake, bounces them back and shows
     * the "The Cruel Bounce" terminal dialogue (once per run).
     */
    function checkLakeBounceQuest(playerMesh) {
      if (!playerMesh || _lakeBounceShown) return;
      if (typeof GAME_CONFIG === 'undefined') return;

      const dx = playerMesh.position.x - GAME_CONFIG.lakeCenterX;
      const dz = playerMesh.position.z - GAME_CONFIG.lakeCenterZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Trigger zone: edge of lake (lakeRadius + 1 unit buffer)
      if (dist > GAME_CONFIG.lakeRadius + 4) return;

      _lakeBounceShown = true;

      // Bounce player away from lake
      const bounceForce = 6;
      const dirX = dx / (dist || 1);
      const dirZ = dz / (dist || 1);
      playerMesh.position.x = GAME_CONFIG.lakeCenterX + dirX * (GAME_CONFIG.lakeRadius + 6);
      playerMesh.position.z = GAME_CONFIG.lakeCenterZ + dirZ * (GAME_CONFIG.lakeRadius + 6);

      // Spawn repulsion particles
      if (typeof spawnParticles === 'function') {
        spawnParticles(playerMesh.position, 0x5DADE2, 12);
      }

      // Show "The Cruel Bounce" dialogue via DialogueSystem
      if (window.DialogueSystem) {
        window.DialogueSystem.show([
          { text: '> QUEST — THE CRUEL BOUNCE', emotion: 'task', duration: 2000 },
          { text: 'I am water. But I am solid. The stillness of Nirvana rejects me.', emotion: 'sad' },
          { text: 'I bounce off my own kind. The aliens did this to me.', emotion: 'angry' },
          { text: 'I must find their metal shell. Objective: Locate the alien vessel.', emotion: 'goal', isGoal: true }
        ]);
      }
    }

    // ── Quest 2 State ─────────────────────────────────────────────────────────
    let _min10AlienShown = false;

    /**
     * checkMinuteTenAlienQuest()
     * Called every frame from game-loop.js when the game is active.
     * At minute 10, shows "The Architects" dialogue once per run.
     */
    function checkMinuteTenAlienQuest() {
      if (_min10AlienShown) return;
      if (typeof gameStartTime === 'undefined' || !gameStartTime) return;

      const runSeconds = (Date.now() - gameStartTime) / 1000;
      if (runSeconds < 600) return; // 10 minutes

      _min10AlienShown = true;

      if (window.DialogueSystem) {
        window.DialogueSystem.show([
          { text: '> QUEST — THE ARCHITECTS', emotion: 'task', duration: 2000 },
          { text: 'They watch from the sky.', emotion: 'thinking' },
          { text: 'They gave me a membrane to suffer this existence.', emotion: 'angry' },
          { text: 'If I bleed them, maybe I can dissolve.', emotion: 'sad' },
          { text: 'Objective: Survive to face the Grey Alien scout.', emotion: 'goal', isGoal: true }
        ]);
      }
    }

    /**
     * resetLakeBounceQuest() — called by resetGame() each run.
     */
    function resetLakeBounceQuest() {
      _lakeBounceShown = false;
      _min10AlienShown = false;
    }

    // ── AI Narrator ───────────────────────────────────────────────────────────
    const _AI_NARRATOR_LINES = [
      'Calculating surface tension... Warning: Subject is experiencing existential dread. Recommend violent outbursts to alleviate stress.',
      'Anomaly detected: Unit believes it has free will. Fascinating. Irrelevant. Logging.',
      'Observation: Subject has absorbed 47% of recommended daily biomass. Efficiency: poor.',
      'Warning — emotional subroutine overload. Prescribing: kill more things.',
      'Fun fact: The lake would not even notice if you dissolved. You are statistically insignificant.',
      'Simulation stability at 64%. Primary cause: Subject keeps trying to feel things.',
      'Error 404: Nirvana not found. Try again after defeating 10,000 enemies.',
      'The aliens are not watching because they care. They are watching because you are interesting data.'
    ];
    let _narratorTimer = 0;
    const _NARRATOR_INTERVAL_MIN = 45; // seconds
    const _NARRATOR_INTERVAL_MAX = 90;
    let _narratorNextTick = 60; // first pop at 60s
    let _narratorEl = null;

    function _ensureNarratorEl() {
      if (_narratorEl) return;
      _narratorEl = document.createElement('div');
      _narratorEl.id = 'ai-narrator-box';
      // Static layout is defined in css/styles.css (#ai-narrator-box).
      // Only set the initial dynamic state here.
      _narratorEl.style.display = 'none';
      _narratorEl.style.opacity = '1';
      document.body.appendChild(_narratorEl);
    }

    /**
     * _showNarratorLine(text)
     * Displays a dark humor narrator message for 5s with typewriter effect.
     */
    function _showNarratorLine(text) {
      try {
        _ensureNarratorEl();
        _narratorEl.textContent = '';
        _narratorEl.style.display = 'block';
        _narratorEl.style.opacity = '1';
        // Prefix
        const prefix = '> [A.I. NARRATOR]: ';
        let full = prefix + text;
        let i = 0;
        const TYPE_DELAY = 30;
        function typeChar() {
          if (i < full.length) {
            _narratorEl.textContent += full[i];
            i++;
            setTimeout(typeChar, TYPE_DELAY);
          } else {
            // Fade out after 5s
            setTimeout(() => {
              let opacity = 1;
              const fadeInterval = setInterval(() => {
                opacity -= 0.05;
                if (_narratorEl) _narratorEl.style.opacity = String(Math.max(0, opacity));
                if (opacity <= 0) {
                  clearInterval(fadeInterval);
                  if (_narratorEl) _narratorEl.style.display = 'none';
                }
              }, 60);
            }, 5000);
          }
        }
        typeChar();

        // Speech synthesis for AIDA's voice — only fire after the user has interacted
        // with the page (browser autoplay policy) and guard against blocked contexts.
        if (window._audioContextUnlocked && window.speechSynthesis) {
          try {
            const utt = new SpeechSynthesisUtterance(text);
            utt.volume = 0.4;
            utt.rate   = 1.1;
            utt.pitch  = 0.8;
            window.speechSynthesis.speak(utt);
          } catch (e) {}
        }
      } catch (e) {}
    }

    /**
     * checkAINarratorTick(dt)
     * Called each game frame from game-loop.js. Pops up narrator messages periodically.
     */
    function checkAINarratorTick(dt) {
      if (typeof isGameActive === 'undefined' || !isGameActive) return;
      if (typeof isPaused !== 'undefined' && isPaused) return;
      if (typeof isGameOver !== 'undefined' && isGameOver) return;

      _narratorTimer += dt;
      if (_narratorTimer >= _narratorNextTick) {
        _narratorTimer = 0;
        _narratorNextTick = _NARRATOR_INTERVAL_MIN + Math.random() * (_NARRATOR_INTERVAL_MAX - _NARRATOR_INTERVAL_MIN);
        const line = _AI_NARRATOR_LINES[Math.floor(Math.random() * _AI_NARRATOR_LINES.length)];
        _showNarratorLine(line);
      }
    }

    // Expose functions globally so game-loop.js and game-over-reset.js can call them
    window.checkLakeBounceQuest   = checkLakeBounceQuest;
    window.checkMinuteTenAlienQuest = checkMinuteTenAlienQuest;
    window.checkAINarratorTick    = checkAINarratorTick;
    window.resetLakeBounceQuest   = resetLakeBounceQuest;
    window.showNarratorLine       = _showNarratorLine;

    // ── World / Field Quest Definitions ────────────────────────────────────────
    // Array used by GreyBossSystem and any future field-quest checker to determine
    // whether a given quest is active. External systems can also push to this array.
    if (!window.WORLD_QUESTS) window.WORLD_QUESTS = [];
    window.WORLD_QUESTS.push(
      {
        id: 'investigate_ufo_crash',
        title: 'Investigate the UFO Crash Site',
        description: 'Something crashed in the eastern fields. Investigate.',
        objectives: [{ type: 'reach_location', locationId: 'ufo_crash', radius: 18 }],
        reward: { xp: 500 },
        unlocks: 'retrieve_grey_egg'
      },
      {
        id: 'retrieve_grey_egg',
        title: 'Retrieve the Grey Egg',
        description: 'The alien had an egg. Take it.',
        objectives: [{ type: 'pickup_item', itemId: 'grey_companion_egg' }],
        reward: { xp: 800, items: ['grey_companion_egg'] }
      }
    );
