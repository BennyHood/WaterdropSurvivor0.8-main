// js/run-end-screen.js — Cinematic end-of-run dopamine screen
// Replaces the plain #gameover-screen with a staged tally → XP-bar fill animation.
// Shows: kill tally, combo multiplier, XP smash, XP bar animation, rank-up explosion,
//        loot summary, and quest status.
// Dependencies: addAccountXP (quest-system.js), getAccountLevelXPRequired (utils.js),
//               GameAccount (idle-account.js), getCurrentQuest (camp-skill-system.js)

window.RunEndScreen = (function () {
  'use strict';

  var _overlay  = null;
  var _active   = false;
  var _cssReady = false;
  var _callbacks = null; // { onCamp, onNewRun }

  // ─────────────────────────────────────────────────────────────
  //  CSS  (injected once on first call)
  // ─────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (_cssReady) return;
    _cssReady = true;
    var s = document.createElement('style');
    s.id = 'run-end-screen-css';
    s.textContent = [
      /* === overlay === */
      '#res-overlay{',
        'position:fixed;top:0;left:0;width:100%;height:100%;',
        'background:radial-gradient(ellipse at 50% 30%,#08001a 0%,#040008 60%,#000 100%);',
        'z-index:20000;display:flex;flex-direction:column;align-items:center;',
        'justify-content:flex-start;overflow-y:auto;overflow-x:hidden;',
        'padding:20px 0 40px;box-sizing:border-box;',
        'opacity:0;transition:opacity 0.5s ease-out;',
        'font-family:"Bangers",cursive;',
      '}',

      /* === header === */
      '#res-header{',
        'font-size:clamp(38px,8vw,72px);color:#ff3333;letter-spacing:8px;',
        'text-shadow:0 0 20px #ff3333,0 0 50px rgba(255,50,50,0.5);',
        'margin-bottom:4px;text-align:center;',
        'animation:res-header-shake 0.4s ease-out;',
      '}',
      '#res-subheader{',
        'font-size:clamp(14px,2.5vw,18px);color:#C9A227;letter-spacing:4px;',
        'text-shadow:0 0 8px rgba(201,162,39,0.6);',
        'margin-bottom:18px;text-align:center;font-family:"Segoe UI",sans-serif;',
      '}',

      /* === tally section === */
      '#res-tally{',
        'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;',
        'margin-bottom:16px;max-width:600px;width:90%;',
        'opacity:0;transition:opacity 0.4s;',
      '}',
      '.res-tally-card{',
        'background:rgba(0,0,0,0.7);border:1px solid rgba(201,162,39,0.4);',
        'border-radius:6px;padding:10px 18px;min-width:110px;text-align:center;',
        'box-shadow:0 0 12px rgba(0,0,0,0.8);',
        'transform:translateY(20px);transition:transform 0.3s,opacity 0.3s;opacity:0;',
      '}',
      '.res-tally-card.res-visible{transform:translateY(0);opacity:1;}',
      '.res-tally-icon{font-size:22px;margin-bottom:4px;}',
      '.res-tally-label{font-size:10px;color:#888;letter-spacing:2px;font-family:"Segoe UI",sans-serif;text-transform:uppercase;}',
      '.res-tally-value{font-size:clamp(24px,5vw,38px);color:#fff;letter-spacing:2px;',
        'transition:color 0.2s;text-shadow:0 0 10px rgba(255,255,255,0.3);}',
      '.res-tally-value.res-tick-flash{color:#FFD700;text-shadow:0 0 20px #FFD700;}',

      /* === XP smash === */
      '#res-xp-smash{',
        'text-align:center;margin:8px 0 16px;opacity:0;',
        'transform:scale(0.5);transition:opacity 0.3s,transform 0.4s cubic-bezier(0.15,1.5,0.5,1);',
      '}',
      '#res-xp-smash.res-visible{opacity:1;transform:scale(1);}',
      '#res-xp-label{font-size:12px;color:#888;letter-spacing:3px;',
        'font-family:"Segoe UI",sans-serif;text-transform:uppercase;margin-bottom:4px;}',
      '#res-xp-total{font-size:clamp(36px,8vw,64px);color:#FFD700;letter-spacing:4px;',
        'text-shadow:0 0 20px #FFD700,0 0 60px rgba(255,215,0,0.4);',
        'animation:res-pulse-glow 2s ease-in-out infinite;}',
      '#res-combo-note{font-size:13px;color:#ff8c00;letter-spacing:2px;',
        'font-family:"Segoe UI",sans-serif;margin-top:4px;}',

      /* === XP bar === */
      '#res-bar-section{width:90%;max-width:560px;margin:0 auto 16px;opacity:0;transition:opacity 0.4s;}',
      '#res-bar-section.res-visible{opacity:1;}',
      '#res-bar-level-row{display:flex;justify-content:space-between;align-items:center;',
        'margin-bottom:6px;color:#C9A227;font-size:14px;letter-spacing:2px;',
        'font-family:"Segoe UI",sans-serif;}',
      '#res-bar-track{',
        'height:22px;background:rgba(0,0,0,0.6);border:1px solid rgba(201,162,39,0.4);',
        'border-radius:11px;overflow:hidden;position:relative;',
        'box-shadow:inset 0 0 8px rgba(0,0,0,0.8),0 0 10px rgba(201,162,39,0.2);',
      '}',
      '#res-bar-fill{',
        'height:100%;width:0%;border-radius:11px;',
        'background:linear-gradient(90deg,#FFD700,#ff8c00,#ff4400);',
        'box-shadow:0 0 12px #FFD700,0 0 24px rgba(255,140,0,0.5);',
        'transition:width 0.05s linear;',
      '}',
      '#res-bar-pct{',
        'position:absolute;right:10px;top:50%;transform:translateY(-50%);',
        'font-size:11px;color:rgba(255,255,255,0.8);font-family:"Segoe UI",sans-serif;',
      '}',
      '#res-level-up-flash{',
        'display:none;text-align:center;',
        'font-size:clamp(28px,6vw,48px);color:#FFD700;letter-spacing:6px;',
        'text-shadow:0 0 30px #FFD700,0 0 60px rgba(255,215,0,0.6);',
        'animation:res-levelup-boom 0.6s ease-out;',
        'margin:8px 0;',
      '}',

      /* === rank up === */
      '#res-rank-up{',
        'display:none;text-align:center;margin:10px 0;',
        'animation:res-rank-slam 0.5s cubic-bezier(0.15,1.5,0.5,1);',
      '}',
      '#res-rank-title{',
        'font-size:clamp(18px,4vw,28px);letter-spacing:4px;',
        'text-shadow:0 0 20px currentColor;',
        'font-family:"Bangers",cursive;',
      '}',
      '#res-rank-badge{',
        'font-size:clamp(30px,6vw,52px);letter-spacing:6px;',
        'text-shadow:0 0 30px currentColor,0 0 60px rgba(255,136,255,0.4);',
        'font-family:"Bangers",cursive;margin:4px 0;',
      '}',

      /* === loot === */
      '#res-loot{',
        'width:90%;max-width:560px;margin:0 auto 16px;',
        'background:rgba(0,0,0,0.6);border:1px solid rgba(201,162,39,0.3);',
        'border-radius:6px;padding:14px;opacity:0;transition:opacity 0.4s;',
      '}',
      '#res-loot.res-visible{opacity:1;}',
      '#res-loot-header{',
        'font-size:13px;color:#C9A227;letter-spacing:3px;text-align:center;',
        'margin-bottom:10px;font-family:"Segoe UI",sans-serif;text-transform:uppercase;',
      '}',
      '#res-loot-items{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}',
      '.res-loot-item{',
        'background:rgba(201,162,39,0.1);border:1px solid rgba(201,162,39,0.3);',
        'border-radius:4px;padding:6px 12px;font-size:13px;color:#E8D5A3;',
        'font-family:"Segoe UI",sans-serif;',
        'transform:scale(0);transition:transform 0.3s cubic-bezier(0.15,1.5,0.5,1);',
      '}',
      '.res-loot-item.res-visible{transform:scale(1);}',

      /* === quest box === */
      '#res-quest-box{',
        'width:90%;max-width:560px;margin:0 auto 16px;',
        'border-radius:6px;padding:12px 16px;opacity:0;transition:opacity 0.4s;',
        'font-family:"Segoe UI",sans-serif;',
      '}',
      '#res-quest-box.res-visible{opacity:1;}',
      '#res-quest-box.quest-complete{',
        'background:rgba(0,60,0,0.7);border:2px solid #00cc44;',
        'box-shadow:0 0 20px rgba(0,204,68,0.3);',
      '}',
      '#res-quest-box.quest-incomplete{',
        'background:rgba(60,0,0,0.7);border:2px solid #cc2200;',
        'box-shadow:0 0 20px rgba(204,34,0,0.3);',
      '}',
      '#res-quest-status{font-size:clamp(14px,3vw,18px);font-weight:bold;letter-spacing:2px;}',
      '#res-quest-name{font-size:12px;color:#aaa;margin-top:4px;letter-spacing:1px;}',

      /* === buttons === */
      '#res-buttons{',
        'display:flex;gap:14px;flex-wrap:wrap;justify-content:center;',
        'margin-top:8px;padding:0 20px;opacity:0;transition:opacity 0.4s;',
      '}',
      '#res-buttons.res-visible{opacity:1;}',
      '.res-btn{',
        'padding:14px 28px;font-size:clamp(15px,3vw,20px);letter-spacing:2px;',
        'font-family:"Bangers",cursive;cursor:pointer;border-radius:6px;',
        'border:2px solid;transition:transform 0.15s,box-shadow 0.15s;',
        'min-width:140px;',
      '}',
      '.res-btn:hover{transform:scale(1.06);}',
      '.res-btn-camp{',
        'background:linear-gradient(135deg,#6b3010,#3d1a08);',
        'border-color:#C9A227;color:#fff;',
        'box-shadow:0 0 12px rgba(201,162,39,0.4);',
      '}',
      '.res-btn-camp:hover{box-shadow:0 0 28px rgba(201,162,39,0.8);}',
      '.res-btn-run{',
        'background:linear-gradient(135deg,#1a5c2a,#0d3316);',
        'border-color:#C9A227;color:#fff;',
        'box-shadow:0 0 12px rgba(201,162,39,0.3);',
      '}',
      '.res-btn-run:hover{box-shadow:0 0 28px rgba(201,162,39,0.7);}',
      '.res-btn-quest{',
        'background:linear-gradient(135deg,#004420,#002210);',
        'border-color:#00cc44;color:#00ff66;',
        'box-shadow:0 0 18px rgba(0,204,68,0.5);',
        'font-size:clamp(13px,2.5vw,17px);',
      '}',
      '.res-btn-quest:hover{box-shadow:0 0 36px rgba(0,204,68,0.9);}',

      /* === keyframes === */
      '@keyframes res-header-shake{',
        '0%{transform:translateX(-6px) scale(1.1);}',
        '20%{transform:translateX(5px);}',
        '40%{transform:translateX(-4px);}',
        '60%{transform:translateX(3px);}',
        '80%{transform:translateX(-2px);}',
        '100%{transform:translateX(0) scale(1);}',
      '}',
      '@keyframes res-pulse-glow{',
        '0%,100%{text-shadow:0 0 20px #FFD700,0 0 60px rgba(255,215,0,0.4);}',
        '50%{text-shadow:0 0 40px #FFD700,0 0 100px rgba(255,215,0,0.7);}',
      '}',
      '@keyframes res-levelup-boom{',
        '0%{transform:scale(0.3);opacity:0;}',
        '60%{transform:scale(1.2);}',
        '80%{transform:scale(0.95);}',
        '100%{transform:scale(1);opacity:1;}',
      '}',
      '@keyframes res-rank-slam{',
        '0%{transform:scale(0.3) rotate(-5deg);opacity:0;}',
        '70%{transform:scale(1.08) rotate(1deg);}',
        '100%{transform:scale(1) rotate(0);opacity:1;}',
      '}',
      '@keyframes res-screen-shake{',
        '0%,100%{transform:translate(0,0);}',
        '20%{transform:translate(-8px,4px);}',
        '40%{transform:translate(8px,-4px);}',
        '60%{transform:translate(-6px,3px);}',
        '80%{transform:translate(6px,-3px);}',
      '}',
      '.res-screen-shake{animation:res-screen-shake 0.4s ease-out;}',
    ].join('');
    document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────
  function show(stats, callbacks) {
    if (_active) return;
    _active   = true;
    _callbacks = callbacks || {};
    _injectCSS();

    // Hide the legacy gameover div so there's no overlap
    var legacyScreen = document.getElementById('gameover-screen');
    if (legacyScreen) legacyScreen.style.display = 'none';

    _buildOverlay(stats);
    _runSequence(stats);
  }

  function hide() {
    if (!_active) return;
    _active = false;
    if (_overlay && _overlay.parentNode) {
      _overlay.style.opacity = '0';
      setTimeout(function () {
        if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
        _overlay = null;
      }, 600);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Build DOM
  // ─────────────────────────────────────────────────────────────
  function _buildOverlay(stats) {
    _overlay = document.createElement('div');
    _overlay.id = 'res-overlay';

    _overlay.innerHTML = [
      // Header
      '<div id="res-header">💀 RUN OVER</div>',
      '<div id="res-subheader">— AFTER-ACTION REPORT —</div>',

      // Tally cards
      '<div id="res-tally">',
        '<div class="res-tally-card" id="res-card-kills">',
          '<div class="res-tally-icon">⚔️</div>',
          '<div class="res-tally-label">Kills</div>',
          '<div class="res-tally-value" id="res-val-kills">0</div>',
        '</div>',
        '<div class="res-tally-card" id="res-card-elites">',
          '<div class="res-tally-icon">👹</div>',
          '<div class="res-tally-label">Elites</div>',
          '<div class="res-tally-value" id="res-val-elites">0</div>',
        '</div>',
        '<div class="res-tally-card" id="res-card-time">',
          '<div class="res-tally-icon">⏱️</div>',
          '<div class="res-tally-label">Survived</div>',
          '<div class="res-tally-value" id="res-val-time">0s</div>',
        '</div>',
        '<div class="res-tally-card" id="res-card-combo">',
          '<div class="res-tally-icon">🔥</div>',
          '<div class="res-tally-label">Max Combo</div>',
          '<div class="res-tally-value" id="res-val-combo">0</div>',
        '</div>',
      '</div>',

      // XP smash
      '<div id="res-xp-smash">',
        '<div id="res-xp-label">Total Account XP Earned</div>',
        '<div id="res-xp-total">+0</div>',
        '<div id="res-combo-note"></div>',
      '</div>',

      // XP bar
      '<div id="res-bar-section">',
        '<div id="res-bar-level-row">',
          '<span id="res-bar-level-label">Account Level <span id="res-bar-lvl-num">1</span></span>',
          '<span id="res-bar-xp-text">0 / 0 XP</span>',
        '</div>',
        '<div id="res-bar-track">',
          '<div id="res-bar-fill"></div>',
          '<div id="res-bar-pct">0%</div>',
        '</div>',
        '<div id="res-level-up-flash">⬆️ LEVEL UP!</div>',
      '</div>',

      // Rank-up panel
      '<div id="res-rank-up">',
        '<div id="res-rank-title"></div>',
        '<div id="res-rank-badge"></div>',
      '</div>',

      // Loot
      '<div id="res-loot">',
        '<div id="res-loot-header">🎁 Loot Gained</div>',
        '<div id="res-loot-items"></div>',
      '</div>',

      // Quest status
      '<div id="res-quest-box"></div>',

      // Buttons
      '<div id="res-buttons"></div>',
    ].join('');

    document.body.appendChild(_overlay);
    // Trigger fade-in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (_overlay) _overlay.style.opacity = '1';
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  Animation sequence
  // ─────────────────────────────────────────────────────────────
  function _runSequence(stats) {
    var runStats = window.currentRunStats || {};
    // Use pre-run account state so bar animates from where the player started this run
    var accountLevel = runStats.startAccountLevel || (window.saveData && window.saveData.accountLevel) || 1;
    var accountXP    = runStats.startAccountXP    || (window.saveData && window.saveData.accountXP)    || 0;
    var xpRequired   = (typeof getAccountLevelXPRequired === 'function')
                       ? getAccountLevelXPRequired(accountLevel) : (accountLevel * 100);

    // Compute combo multiplier (max combo ≥20 → 2×, ≥10 → 1.5×, else 1×)
    var maxCombo   = stats.maxCombo || 0;
    var comboMult  = maxCombo >= 20 ? 2.0 : (maxCombo >= 10 ? 1.5 : 1.0);
    // XP already accumulated this run (kills + completion bonus, granted per event)
    var baseXP     = stats.xpAccumulated || 0;
    // Visual combo bonus shown on screen (XP was granted at 1× per kill; show the diff)
    var bonusXP    = Math.round(baseXP * (comboMult - 1));
    var totalXP    = baseXP; // Do NOT re-award — XP is already in saveData

    // Step 0: screen slams in (handled by fade-in) — show tally after 300 ms
    setTimeout(function () {
      _step1_tally(stats, totalXP, comboMult, bonusXP, accountLevel, accountXP, xpRequired);
    }, 400);
  }

  // STEP 1 — Tally cards count up with casino tick
  function _step1_tally(stats, totalXP, comboMult, bonusXP, accountLevel, accountXP, xpRequired) {
    var tallyDiv = document.getElementById('res-tally');
    if (tallyDiv) tallyDiv.style.opacity = '1';

    var cards = [
      { id: 'kills',  target: stats.kills  || 0,       suffix: '',  delay: 0   },
      { id: 'elites', target: stats.eliteKills || 0,   suffix: '',  delay: 100 },
      { id: 'time',   target: stats.timeSurvived || 0, suffix: 's', delay: 200 },
      { id: 'combo',  target: stats.maxCombo || 0,     suffix: 'x', delay: 300 }
    ];

    var cardsReady = 0;
    cards.forEach(function (card) {
      setTimeout(function () {
        var cardEl = document.getElementById('res-card-' + card.id);
        if (cardEl) cardEl.classList.add('res-visible');
        _tickUp('res-val-' + card.id, card.target, card.suffix, 800, function () {
          cardsReady++;
          if (cardsReady === cards.length) {
            // All cards done → step 2
            setTimeout(function () {
              _step2_smash(totalXP, comboMult, bonusXP, accountLevel, accountXP, xpRequired);
            }, 400);
          }
        });
      }, card.delay);
    });
  }

  // STEP 2 — XP smash reveal
  function _step2_smash(totalXP, comboMult, bonusXP, accountLevel, accountXP, xpRequired) {
    var smash = document.getElementById('res-xp-smash');
    if (smash) smash.classList.add('res-visible');

    // Tick up the XP total
    _tickUp('res-xp-total', totalXP, '', 700, function () {
      // Prefix with '+'
      var el = document.getElementById('res-xp-total');
      if (el) el.textContent = '+' + totalXP;
    }, function (val) { return '+' + val; });

    if (comboMult > 1.0) {
      var note = document.getElementById('res-combo-note');
      if (note) note.textContent = '🔥 Combo ×' + comboMult + ' Bonus: +' + bonusXP + ' XP';
    }

    if (typeof playSound === 'function') {
      try { playSound('levelup'); } catch (e) { /* ignore */ }
    }

    // Shake the screen on the smash
    if (_overlay) {
      _overlay.classList.add('res-screen-shake');
      setTimeout(function () {
        if (_overlay) _overlay.classList.remove('res-screen-shake');
      }, 450);
    }

    // XP is already in saveData (awarded per-kill + completion bonus during the run)
    // Re-read post-award state for bar animation
    var newLevel = (window.saveData && window.saveData.accountLevel) || 1;
    var newXP    = (window.saveData && window.saveData.accountXP)    || 0;

    setTimeout(function () {
      _step3_barFill(accountLevel, accountXP, xpRequired, newLevel, newXP, totalXP);
    }, 700);
  }

  // STEP 3 — XP bar fill animation
  function _step3_barFill(startLevel, startXP, startRequired, finalLevel, finalXP, totalXP) {
    var barSection = document.getElementById('res-bar-section');
    if (barSection) barSection.classList.add('res-visible');

    var currentLevel = startLevel;
    var currentXP    = startXP;
    var xpRequired   = startRequired;
    var xpToAdd      = totalXP;

    function _fillChunk(lvl, xpNow, xpReq, remaining, onDone) {
      _updateBarUI(lvl, xpNow, xpReq);

      if (remaining <= 0) { onDone(); return; }

      var fillable   = xpReq - xpNow;    // XP needed to fill current bar
      var thisChunk  = Math.min(remaining, fillable);
      var fillMs     = Math.max(600, Math.min(1800, thisChunk * 8));

      _animateBarFromTo(xpNow, xpNow + thisChunk, xpReq, lvl, fillMs, function () {
        if (remaining >= fillable) {
          // Level up!
          var nextLvl    = lvl + 1;
          var nextReq    = (typeof getAccountLevelXPRequired === 'function')
                           ? getAccountLevelXPRequired(nextLvl) : (nextLvl * 100);
          _showLevelUpFlash(nextLvl, function () {
            _fillChunk(nextLvl, 0, nextReq, remaining - fillable, onDone);
          });
        } else {
          onDone();
        }
      });
    }

    _fillChunk(currentLevel, currentXP, xpRequired, xpToAdd, function () {
      // Check for rank-up
      setTimeout(function () {
        _step4_rankUp(startLevel, finalLevel, function () {
          _step5_loot();
        });
      }, 400);
    });
  }

  function _animateBarFromTo(from, to, total, level, durationMs, onDone) {
    var barFill  = document.getElementById('res-bar-fill');
    var barPct   = document.getElementById('res-bar-pct');
    var xpText   = document.getElementById('res-bar-xp-text');

    var start    = null;
    var fromPct  = (from / total) * 100;
    var toPct    = Math.min((to / total) * 100, 100);

    function tick(now) {
      if (!start) start = now;
      var progress = Math.min((now - start) / durationMs, 1);
      var ease     = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      var pct      = fromPct + (toPct - fromPct) * ease;
      var curXP    = Math.round(from + (to - from) * ease);

      if (barFill) barFill.style.width = pct + '%';
      if (barPct)  barPct.textContent  = Math.round(pct) + '%';
      if (xpText)  xpText.textContent  = curXP + ' / ' + total + ' XP';

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(tick);
  }

  function _updateBarUI(level, xp, required) {
    var lvlNum = document.getElementById('res-bar-lvl-num');
    var xpText = document.getElementById('res-bar-xp-text');
    var fill   = document.getElementById('res-bar-fill');
    var pct    = document.getElementById('res-bar-pct');
    if (lvlNum) lvlNum.textContent = level;
    var p = Math.min(100, Math.round((xp / required) * 100));
    if (fill)   fill.style.width = p + '%';
    if (pct)    pct.textContent  = p + '%';
    if (xpText) xpText.textContent = xp + ' / ' + required + ' XP';
  }

  function _showLevelUpFlash(newLevel, onDone) {
    var flash = document.getElementById('res-level-up-flash');
    if (flash) {
      flash.style.display = 'block';
      flash.textContent   = '⬆️ LEVEL UP! › ' + newLevel;
      if (typeof playSound === 'function') {
        try { playSound('levelup'); } catch (e) { /* ignore */ }
      }
      // Screen shake on level-up
      if (_overlay) {
        _overlay.classList.add('res-screen-shake');
        setTimeout(function () {
          if (_overlay) _overlay.classList.remove('res-screen-shake');
        }, 450);
      }
      setTimeout(function () {
        if (flash) flash.style.display = 'none';
        if (onDone) onDone();
      }, 900);
    } else {
      if (onDone) onDone();
    }
  }

  // STEP 4 — Rank-up explosion (if applicable)
  function _step4_rankUp(oldLevel, newLevel, onDone) {
    var milestones = (window.GameAccount && window.GameAccount.getMilestones)
                     ? window.GameAccount.getMilestones() : [];

    // Find any milestone crossed between oldLevel and newLevel
    var rankUpMilestone = null;
    milestones.forEach(function (m) {
      if (m.level > oldLevel && m.level <= newLevel) {
        // Prefer the highest milestone crossed
        if (!rankUpMilestone || m.level > rankUpMilestone.level) {
          rankUpMilestone = m;
        }
      }
    });

    if (!rankUpMilestone) {
      if (onDone) onDone();
      return;
    }

    var rankColor = (window.GameAccount && window.GameAccount.getRankColor)
                    ? window.GameAccount.getRankColor(rankUpMilestone.title)
                    : '#FFD700';

    var rankPanel = document.getElementById('res-rank-up');
    var rankTitle = document.getElementById('res-rank-title');
    var rankBadge = document.getElementById('res-rank-badge');

    if (rankTitle) {
      rankTitle.textContent = 'RANK UP — Level ' + rankUpMilestone.level;
      rankTitle.style.color = rankColor;
    }
    if (rankBadge) {
      rankBadge.textContent = rankUpMilestone.title;
      rankBadge.style.color = rankColor;
    }
    if (rankPanel) rankPanel.style.display = 'block';

    // Massive screen shake for rank-up
    if (_overlay) {
      _overlay.classList.add('res-screen-shake');
      setTimeout(function () {
        if (_overlay) _overlay.classList.remove('res-screen-shake');
      }, 450);
    }
    setTimeout(function () {
      if (_overlay) {
        _overlay.classList.add('res-screen-shake');
        setTimeout(function () {
          if (_overlay) _overlay.classList.remove('res-screen-shake');
        }, 450);
      }
    }, 500);

    _spawnRankUpParticles(rankColor);

    if (typeof playSound === 'function') {
      try { playSound('levelup'); } catch (e) { /* ignore */ }
    }

    setTimeout(function () { if (onDone) onDone(); }, 1500);
  }

  function _spawnRankUpParticles(color) {
    var count = 60;
    var cx = window.innerWidth  / 2;
    var cy = window.innerHeight / 2;
    for (var i = 0; i < count; i++) {
      (function (idx) {
        var p = document.createElement('div');
        p.style.cssText = 'position:fixed;width:8px;height:8px;border-radius:50%;' +
          'background:' + color + ';box-shadow:0 0 10px ' + color + ';' +
          'pointer-events:none;z-index:20001;';
        var angle    = (Math.PI * 2 * idx) / count;
        var distance = 80 + Math.random() * 350;
        p.style.left = cx + 'px';
        p.style.top  = cy + 'px';
        document.body.appendChild(p);
        var dur = 900 + Math.random() * 600;
        var start = performance.now();
        (function animP(now) {
          var t   = Math.min((now - start) / dur, 1);
          var d   = distance * t;
          p.style.left    = (cx + Math.cos(angle) * d) + 'px';
          p.style.top     = (cy + Math.sin(angle) * d) + 'px';
          p.style.opacity = 1 - t;
          if (t < 1) requestAnimationFrame(animP);
          else if (p.parentNode) p.parentNode.removeChild(p);
        })(performance.now());
      })(i);
    }
  }

  // STEP 5 — Loot + quest + buttons
  function _step5_loot() {
    var lootDiv = document.getElementById('res-loot');
    if (lootDiv) lootDiv.classList.add('res-visible');

    var items = _buildLootItems();
    var itemsDiv = document.getElementById('res-loot-items');
    if (itemsDiv && items.length > 0) {
      items.forEach(function (item, i) {
        setTimeout(function () {
          var el = document.createElement('div');
          el.className = 'res-loot-item';
          el.textContent = item.text;
          if (item.color) el.style.color = item.color;
          itemsDiv.appendChild(el);
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              el.classList.add('res-visible');
            });
          });
        }, i * 160);
      });
    } else if (itemsDiv) {
      var empty = document.createElement('div');
      empty.className = 'res-loot-item';
      empty.style.transform = 'scale(1)';
      empty.textContent = 'No loot this run';
      itemsDiv.appendChild(empty);
    }

    // Show quest status after loot
    setTimeout(function () {
      _showQuestStatus();
      // Buttons appear last
      setTimeout(function () {
        _showButtons();
      }, 500);
    }, items.length * 160 + 300);
  }

  function _buildLootItems() {
    var RARITY_COLORS = { Common: '#aaa', Uncommon: '#1EFF00', Rare: '#0070DD', Epic: '#A335EE', Legendary: '#FF8000', Mythic: '#E6CC80' };
    var items = [];
    // Gold
    var goldEarned = (window.saveData && window._resGoldEarned) || 0;
    if (goldEarned > 0) items.push({ text: '💰 +' + goldEarned + ' Gold', color: '#FFD700' });
    // Run loot — colored by rarity
    if (window.runLootGained && window.runLootGained.length > 0) {
      window.runLootGained.slice(0, 6).forEach(function (item) {
        var rarity = item.rarity || 'Common';
        items.push({ text: (item.name || 'Item') + ' (' + rarity + ')', color: RARITY_COLORS[rarity] || '#aaa' });
      });
    }
    // Skill points if any
    if (window.saveData && window.saveData.skillPoints > 0) {
      items.push({ text: '🌟 Skill Points: ' + window.saveData.skillPoints, color: '#FFD700' });
    }
    return items;
  }

  function _showQuestStatus() {
    var questBox = document.getElementById('res-quest-box');
    if (!questBox) return;

    var stats      = window._resCurrentStats;
    if (!stats) return;

    var questStatus   = document.getElementById('res-quest-status');
    var questNameEl   = document.getElementById('res-quest-name');

    if (stats.questCompleted && stats.questName) {
      questBox.className = 'res-visible quest-complete';
      questBox.innerHTML =
        '<div id="res-quest-status" style="color:#00ff66;">✅ QUEST COMPLETE</div>' +
        '<div id="res-quest-name" style="color:#88ffaa;margin-top:4px;">' + _esc(stats.questName) + '</div>';
      questBox.classList.add('res-visible');
    } else if (stats.questActive && stats.questName) {
      questBox.className = 'quest-incomplete';
      questBox.innerHTML =
        '<div id="res-quest-status" style="color:#ff4422;">❌ QUEST INCOMPLETE</div>' +
        '<div id="res-quest-name" style="color:#ff8866;margin-top:4px;">' + _esc(stats.questName) + '</div>';
      questBox.classList.add('res-visible');
    }
  }

  function _showButtons() {
    var btnDiv  = document.getElementById('res-buttons');
    if (!btnDiv) return;
    btnDiv.classList.add('res-visible');

    var stats = window._resCurrentStats || {};

    // CONTINUE QUESTLINE button for completed quests
    if (stats.questCompleted) {
      var questBtn = document.createElement('button');
      questBtn.className = 'res-btn res-btn-quest';
      questBtn.textContent = '📜 CONTINUE QUESTLINE';
      questBtn.onclick = function () { _goToCamp(true); };
      btnDiv.appendChild(questBtn);
    }

    // GO TO CAMP
    var campBtn = document.createElement('button');
    campBtn.className = 'res-btn res-btn-camp';
    campBtn.textContent = '⛺ GO TO CAMP';
    campBtn.onclick = function () { _goToCamp(false); };
    btnDiv.appendChild(campBtn);

    // NEW RUN / RETRY
    var runBtn = document.createElement('button');
    runBtn.className = 'res-btn res-btn-run';
    runBtn.textContent = stats.questActive && !stats.questCompleted ? '🔄 RETRY QUEST' : '🔄 NEW RUN';
    runBtn.onclick = function () { _startNewRun(); };
    btnDiv.appendChild(runBtn);
  }

  // ─────────────────────────────────────────────────────────────
  //  Ticker helper — counts a number up with casino-like ticking
  // ─────────────────────────────────────────────────────────────
  function _tickUp(elId, target, suffix, durationMs, onDone, formatter) {
    var el = document.getElementById(elId);
    if (!el) { if (onDone) onDone(); return; }
    if (target === 0) {
      el.textContent = (formatter ? formatter(0) : '0') + suffix;
      if (onDone) onDone();
      return;
    }

    var steps       = Math.min(target, 40);
    var intervalMs  = durationMs / steps;
    var increment   = target / steps;
    var current     = 0;
    var step        = 0;

    var timer = setInterval(function () {
      step++;
      current = step >= steps ? target : Math.round(increment * step);
      el.textContent = (formatter ? formatter(current) : current) + suffix;

      // Flash effect
      el.classList.add('res-tick-flash');
      setTimeout(function () { el.classList.remove('res-tick-flash'); }, 80);

      // Play tick sound (coin sound repurposed)
      if (step % Math.max(1, Math.floor(steps / 10)) === 0) {
        if (typeof playSound === 'function') {
          try { playSound('coin'); } catch (e) { /* ignore */ }
        }
      }

      if (step >= steps) {
        clearInterval(timer);
        if (onDone) onDone();
      }
    }, intervalMs);
  }

  // ─────────────────────────────────────────────────────────────
  //  Button actions
  // ─────────────────────────────────────────────────────────────
  function _goToCamp(fromQuestComplete) {
    hide();
    window._campFromRun = true;
    if (fromQuestComplete) {
      // Trigger AIDA dialogue on arrival at camp
      window._pendingAIDADialogueOnCamp = true;
    }
    setTimeout(function () {
      if (typeof showCamp === 'function') {
        showCamp();
      } else if (typeof showCampScreen === 'function') {
        showCampScreen();
      } else if (typeof returnToLobby === 'function') {
        returnToLobby();
      }
    }, 600);
  }

  function _startNewRun() {
    hide();
    setTimeout(function () {
      if (typeof resetGame === 'function') {
        // Show gameover screen briefly (with only the restart button) and click it
        var go = document.getElementById('gameover-screen');
        if (go) {
          go.style.display = 'flex';
          var rb = document.getElementById('restart-btn');
          if (rb) {
            rb.click();
            go.style.display = 'none';
            return;
          }
          go.style.display = 'none';
        }
        // Direct reset fallback
        resetGame();
      } else {
        _goToCamp(false);
      }
    }, 600);
  }

  // ─────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────
  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  return { show: show, hide: hide };
}());
