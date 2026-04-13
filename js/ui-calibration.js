// ============================================================
// ui-calibration.js  —  HUD UI Calibration / Customisation Mode
// ============================================================
// Lets the player drag-reposition and corner-resize every gameplay
// HUD element, then save or reset the layout.
//
// Usage (called from main.js):
//   window.UICalibration.enter()   — activates calibration mode
//   window.UICalibration.exit()    — closes calibration mode
//   window.UICalibration.applyLayout() — re-applies saved layout on startup
// ============================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'wd_hud_layout_v2';
  const USER_DEFAULT_KEY = 'wd_hud_layout_user_default_v2';
  const MIN_W = 40;
  const MIN_H = 20;
  const DRAG_THRESHOLD = 6; // px movement before a drag is recognised (prevents accidental drags on click)

  // HUD elements that can be repositioned / resized.
  // Each entry specifies:
  //   selector   – CSS selector (first match used)
  //   label      – friendly name shown in calibration overlay
  //   defaultPos – {left, top, right, bottom} using the same side the element
  //                normally anchors to (px strings, null = not set)
  //   defaultScale – initial transform scale (1 = unchanged)
  const HUD_DEFS = [
    {
      selector: '#rage-hud',
      label: '⚡ Rage Meter',
      defaultPos: { left: '10px', bottom: '80px', right: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#special-attacks-hud',
      label: '🔥 Special Attacks',
      defaultPos: { left: '10px', bottom: '10px', right: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#revolver-ui',
      label: '🔫 Revolver Cylinder',
      defaultPos: { left: '20px', bottom: '20px', right: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#melee-takedown-btn',
      label: '🔪 Melee Button',
      defaultPos: { right: '155px', bottom: '10px', left: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '.hud-top',
      label: '❤️ Stat Bars',
      defaultPos: { left: '8px', top: '8px', right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#stat-notifications',
      label: '📊 Stat Notifications',
      defaultPos: { left: null, top: '70px', right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#super-stat-bar',
      label: '📈 Stat Bar Panel',
      defaultPos: { right: '0px', top: '0px', left: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#region-display',
      label: '🌍 Region Strip',
      defaultPos: { right: '8px', bottom: '90px', left: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#combo-counter',
      label: '💥 Combo Counter',
      defaultPos: { right: '8px', bottom: null, left: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#quest-tracker',
      label: '📜 Quest Tracker',
      defaultPos: { left: '12px', top: '86px', right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '.modal-content',
      label: '⬆️ Level Up Box',
      // null values mean: clear inline styles on reset so CSS-defined centering takes over
      defaultPos: { left: null, top: null, right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '.settings-container',
      label: '⚙️ Settings Box',
      // null values mean: clear inline styles on reset so CSS-defined centering takes over
      defaultPos: { left: null, top: null, right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#bottom-bars-container',
      label: '💧 Level / EXP Bar',
      defaultPos: { left: null, bottom: '0px', right: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#day-night-clock',
      label: '🕐 Day/Night Clock',
      defaultPos: { left: null, top: '6px', right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#skill-icons-panel',
      label: '🎯 Skill Icons',
      defaultPos: { right: '8px', top: '60px', left: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#settings-btn',
      label: '⚙️ Settings Button',
      defaultPos: { right: '8px', top: '8px', left: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#hud-top-right-row',
      label: '💀 Kill Count + XP Row',
      defaultPos: { right: '10px', top: '10px', left: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#hud-skull-icon',
      label: '💀 Skull Icon',
      defaultPos: { right: null, top: null, left: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#hud-kill-count',
      label: '🗡️ Kill Count Text',
      defaultPos: { right: null, top: null, left: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#hud-xp-mini-bar-wrap',
      label: '🔵 XP Mini Bar',
      defaultPos: { right: null, top: null, left: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#joystick-zone',
      label: '🕹️ Joystick Zone',
      defaultPos: { left: '0px', bottom: '0px', right: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#companion-skills-panel',
      label: '👽 Companion Skills',
      defaultPos: { left: '10px', bottom: '140px', right: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#special-attacks-panel',
      label: '⚡ Special Attacks Panel',
      defaultPos: { right: '10px', bottom: '80px', left: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#endless-wave-display',
      label: '🌊 Wave Display',
      defaultPos: { left: null, top: '50%', right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#wave-complete-banner',
      label: '🏆 Wave Complete Banner',
      defaultPos: { left: null, top: '30%', right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#challenge-complete-board',
      label: '🏅 Challenge Complete Board',
      defaultPos: { left: null, top: null, right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '#tutorial-text-wrap',
      label: '📖 Tutorial / Countdown Text',
      defaultPos: { left: null, top: null, right: null, bottom: null },
      defaultScale: 1,
    },
    {
      selector: '.hud-top .bar-container',
      label: '💚 Individual Stat Bars',
      defaultPos: { left: null, top: null, right: null, bottom: null },
      defaultScale: 1,
    },
  ];

  let _active = false;
  let _overlay = null;
  let _handles = []; // { el, def, badge, rh, mh } per active HUD element
  let _onExit = null; // optional callback when calibration is closed

  // ──────────────────────────────────────────────────────────
  // Public: enter calibration mode
  // ──────────────────────────────────────────────────────────
  function enter(onExitCb) {
    if (_active) return;
    _active = true;
    _onExit = typeof onExitCb === 'function' ? onExitCb : null;

    _buildOverlay();
    _attachHandles();
  }

  // ──────────────────────────────────────────────────────────
  // Public: exit calibration mode
  // ──────────────────────────────────────────────────────────
  function exit() {
    if (!_active) return;
    _active = false;

    _detachHandles();
    _removeOverlay();

    if (_onExit) { _onExit(); _onExit = null; }
  }

  // ──────────────────────────────────────────────────────────
  // Public: apply saved layout (called at game startup)
  // ──────────────────────────────────────────────────────────
  function applyLayout() {
    const saved = _loadLayout();
    if (!saved) return;

    for (const def of HUD_DEFS) {
      const entry = saved[def.selector];
      if (!entry) continue;
      const el = document.querySelector(def.selector);
      if (!el) continue;
      _applyEntryToElement(el, entry);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Overlay: collapsible tab panel for buttons (movable tab)
  // ──────────────────────────────────────────────────────────
  function _buildOverlay() {
    _overlay = document.createElement('div');
    _overlay.id = 'ui-calibration-overlay';
    _overlay.className = 'ui-cal-overlay';

    // ── Tab toggle button (draggable, always visible) ────────
    const tabBtn = document.createElement('button');
    tabBtn.id = 'ui-cal-tab-toggle';
    tabBtn.className = 'ui-cal-tab-toggle';
    tabBtn.textContent = '🎛️ UI CAL';
    tabBtn.title = 'Drag to move · Click to open/close panel';

    // ── Collapsible panel ────────────────────────────────────
    const panel = document.createElement('div');
    panel.id = 'ui-cal-panel';
    panel.className = 'ui-cal-panel';
    panel.style.display = 'none';

    const title = document.createElement('div');
    title.className = 'ui-cal-title';
    title.textContent = '🎛️ UI CALIBRATION — Drag ✥ to move · Drag ◤ to resize';

    const btnRow = document.createElement('div');
    btnRow.className = 'ui-cal-btn-row';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'ui-cal-btn ui-cal-save-btn';
    saveBtn.textContent = '💾 Save Layout';
    saveBtn.addEventListener('click', _saveAndExit);

    const saveDefaultBtn = document.createElement('button');
    saveDefaultBtn.id = 'ui-cal-save-default-btn';
    saveDefaultBtn.className = 'ui-cal-btn ui-cal-save-btn';
    saveDefaultBtn.textContent = '⭐ Save as Default';
    saveDefaultBtn.title = 'Save current layout as your personal default (Reset will restore this)';
    saveDefaultBtn.addEventListener('click', _saveAsDefault);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'ui-cal-btn ui-cal-reset-btn';
    resetBtn.textContent = '↩️ Reset to Default';
    resetBtn.title = 'Restore your saved default layout (or factory settings if none saved)';
    resetBtn.addEventListener('click', _resetAndExit);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ui-cal-btn ui-cal-close-btn';
    closeBtn.textContent = '✕ Cancel';
    closeBtn.addEventListener('click', exit);

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(saveDefaultBtn);
    btnRow.appendChild(resetBtn);
    btnRow.appendChild(closeBtn);

    panel.appendChild(title);
    panel.appendChild(btnRow);

    // Toggle panel visibility on tab button click
    let _panelVisible = false;
    tabBtn.addEventListener('click', () => {
      _panelVisible = !_panelVisible;
      panel.style.display = _panelVisible ? 'block' : 'none';
    });

    _overlay.appendChild(tabBtn);
    _overlay.appendChild(panel);
    document.body.appendChild(_overlay);

    // Make tab button draggable
    _bindTabDrag(tabBtn);
  }

  // Make the tab toggle button draggable
  function _bindTabDrag(tabBtn) {
    let startX, startY, startLeft, startTop, dragging = false;
    function onDown(e) {
      // Only start drag on long-press or direct drag (not click)
      dragging = false;
      const pt = _getPointer(e);
      startX = pt.x; startY = pt.y;
      const rect = tabBtn.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }
    function onMove(e) {
      e.preventDefault();
      const pt = _getPointer(e);
      const dx = pt.x - startX;
      const dy = pt.y - startY;
      if (!dragging && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) dragging = true;
      if (!dragging) return;
      tabBtn.style.left = Math.max(0, startLeft + dx) + 'px';
      tabBtn.style.top  = Math.max(0, startTop  + dy) + 'px';
      tabBtn.style.right  = 'auto';
      tabBtn.style.bottom = 'auto';
    }
    function onUp(e) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      if (dragging) {
        // Prevent the click from firing after a drag
        e.stopPropagation();
        dragging = false;
      }
    }
    tabBtn.addEventListener('mousedown', onDown);
    tabBtn.addEventListener('touchstart', onDown, { passive: false });
  }

  function _removeOverlay() {
    if (_overlay && _overlay.parentNode) {
      _overlay.parentNode.removeChild(_overlay);
    }
    _overlay = null;
  }

  // ──────────────────────────────────────────────────────────
  // Attach drag + resize handles to each HUD element
  // ──────────────────────────────────────────────────────────
  function _attachHandles() {
    _handles = [];
    const saved = _loadLayout();

    for (const def of HUD_DEFS) {
      const el = document.querySelector(def.selector);
      if (!el) continue;

      // Skip elements that are currently hidden (display:none) — user can open the
      // relevant panel first and then re-enter calibration to position it.
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;

      // Prevent duplicate handles if somehow _attachHandles is called twice
      if (_handles.find(h => h.el === el)) continue;

      // Ensure element is fixed-position so it can be freely moved
      _makeFixed(el, def);

      // Apply any previously-saved position/scale
      if (saved && saved[def.selector]) {
        _applyEntryToElement(el, saved[def.selector]);
      }

      // ── Label badge ──────────────────────────────────────
      const badge = document.createElement('div');
      badge.className = 'ui-cal-label-badge';
      badge.textContent = def.label;
      el.appendChild(badge);

      // ── Scale slider ──────────────────────────────────────
      const scaleWrap = document.createElement('div');
      scaleWrap.className = 'ui-cal-scale-wrap';
      const scaleLabel = document.createElement('span');
      scaleLabel.className = 'ui-cal-scale-label';
      const currentScale = el._uiCalScale !== undefined ? el._uiCalScale : 1;
      scaleLabel.textContent = '×' + currentScale.toFixed(2);
      const scaleSlider = document.createElement('input');
      scaleSlider.type = 'range';
      scaleSlider.min = '0.4';
      scaleSlider.max = '2.5';
      scaleSlider.step = '0.05';
      scaleSlider.value = String(currentScale);
      scaleSlider.className = 'ui-cal-scale-slider';
      scaleSlider.addEventListener('input', function() {
        const s = parseFloat(this.value);
        el.style.transform = 'scale(' + s + ')';
        el.style.transformOrigin = 'top left';
        el._uiCalScale = s;
        scaleLabel.textContent = '×' + s.toFixed(2);
      });
      scaleWrap.appendChild(scaleLabel);
      scaleWrap.appendChild(scaleSlider);
      el.appendChild(scaleWrap);

      // ── Move handle (center drag zone) ──────────────────
      const mh = document.createElement('div');
      mh.className = 'ui-cal-move-handle';
      mh.title = 'Drag to move';
      mh.textContent = '✥';
      el.appendChild(mh);

      // ── Resize handle (upper-left corner ◤) ─────────────
      const rh = document.createElement('div');
      rh.className = 'ui-cal-resize-handle';
      rh.title = 'Drag to resize';
      rh.textContent = '◤';
      el.appendChild(rh);

      // ── Additional corner resize handles ─────────────────
      const rhBR = document.createElement('div');
      rhBR.className = 'ui-cal-resize-br'; rhBR.title = 'Drag to resize'; rhBR.textContent = '◢';
      el.appendChild(rhBR);
      const rhBL = document.createElement('div');
      rhBL.className = 'ui-cal-resize-bl'; rhBL.title = 'Drag to resize'; rhBL.textContent = '◣';
      el.appendChild(rhBL);
      const rhTR = document.createElement('div');
      rhTR.className = 'ui-cal-resize-tr'; rhTR.title = 'Drag to resize'; rhTR.textContent = '◥';
      el.appendChild(rhTR);

      // ── Edge resize handles ───────────────────────────────
      const rhT = document.createElement('div');
      rhT.className = 'ui-cal-resize-t'; rhT.title = 'Drag to resize height'; rhT.textContent = '⬆';
      el.appendChild(rhT);
      const rhB = document.createElement('div');
      rhB.className = 'ui-cal-resize-b'; rhB.title = 'Drag to resize height'; rhB.textContent = '⬇';
      el.appendChild(rhB);
      const rhL = document.createElement('div');
      rhL.className = 'ui-cal-resize-l'; rhL.title = 'Drag to resize width'; rhL.textContent = '⬅';
      el.appendChild(rhL);
      const rhR = document.createElement('div');
      rhR.className = 'ui-cal-resize-r'; rhR.title = 'Drag to resize width'; rhR.textContent = '➡';
      el.appendChild(rhR);

      // Add edit-mode class for border highlight
      el.classList.add('ui-cal-active-element');

      const handle = { el, def, badge, scaleWrap, mh, rh, rhBR, rhBL, rhTR, rhT, rhB, rhL, rhR };
      _handles.push(handle);

      _bindDrag(mh, el, handle);
      _bindResize(rh, el, handle);
      // Bottom-right: drag right/down grows element
      _bindResizeCorner(rhBR, el, 1, 1);
      // Bottom-left: drag left/down grows element (left edge moves)
      _bindResizeCorner(rhBL, el, -1, 1);
      // Top-right: drag right shrinks/grows width; drag up moves top edge up (height grows)
      _bindResizeCorner(rhTR, el, 1, -1);
      // Edge handles
      _bindResizeEdge(rhT, el, 'top');
      _bindResizeEdge(rhB, el, 'bottom');
      _bindResizeEdge(rhL, el, 'left');
      _bindResizeEdge(rhR, el, 'right');
    }
  }

  function _detachHandles() {
    for (const h of _handles) {
      h.el.classList.remove('ui-cal-active-element');
      if (h.badge && h.badge.parentNode) h.badge.parentNode.removeChild(h.badge);
      if (h.scaleWrap && h.scaleWrap.parentNode) h.scaleWrap.parentNode.removeChild(h.scaleWrap);
      if (h.mh && h.mh.parentNode) h.mh.parentNode.removeChild(h.mh);
      if (h.rh && h.rh.parentNode) h.rh.parentNode.removeChild(h.rh);
      for (const key of ['rhBR','rhBL','rhTR','rhT','rhB','rhL','rhR']) {
        if (h[key] && h[key].parentNode) h[key].parentNode.removeChild(h[key]);
      }
    }
    _handles = [];
  }

  // ──────────────────────────────────────────────────────────
  // Convert an element to position: fixed if it isn't already
  // ──────────────────────────────────────────────────────────
  function _makeFixed(el, def) {
    const cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed') {
      const rect = el.getBoundingClientRect();
      el.style.position = 'fixed';
      el.style.left = rect.left + 'px';
      el.style.top  = rect.top  + 'px';
      el.style.right  = '';
      el.style.bottom = '';
      el.style.margin = '0';
    }
  }

  // ──────────────────────────────────────────────────────────
  // Drag to reposition — triggerEl is the move handle; el is the HUD element to move
  // ──────────────────────────────────────────────────────────
  function _bindDrag(triggerEl, el, handle) {
    let startX, startY, startLeft, startTop;
    let dragging = false;

    function onDown(e) {
      e.stopPropagation();
      e.preventDefault();
      dragging = true;
      const rect = el.getBoundingClientRect();
      const pt = _getPointer(e);
      startX    = pt.x;
      startY    = pt.y;
      startLeft = rect.left;
      startTop  = rect.top;
      // Clear any CSS centering transform so pixel position is absolute;
      // preserve any user-set scale so dragging doesn't lose it.
      const existingScale = el._uiCalScale !== undefined ? el._uiCalScale : 1;
      if (existingScale !== 1) {
        el.style.transform = 'scale(' + existingScale + ')';
        el.style.transformOrigin = 'top left';
      } else {
        el.style.transform = '';
      }
      el.style.cursor = 'grabbing';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend',  onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const pt = _getPointer(e);
      const dx = pt.x - startX;
      const dy = pt.y - startY;
      el.style.left   = (startLeft + dx) + 'px';
      el.style.top    = (startTop  + dy) + 'px';
      el.style.right  = '';
      el.style.bottom = '';
    }

    function onUp() {
      dragging = false;
      el.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    }

    triggerEl.addEventListener('mousedown', onDown);
    triggerEl.addEventListener('touchstart', onDown, { passive: false });
  }

  // ──────────────────────────────────────────────────────────
  // Resize from upper-left corner handle — alters width/height only
  // ──────────────────────────────────────────────────────────
  function _bindResize(rh, el) {
    let startX, startY, startW, startH;
    let resizing = false;

    function onDown(e) {
      e.stopPropagation();
      e.preventDefault();
      resizing = true;
      const pt = _getPointer(e);
      startX = pt.x;
      startY = pt.y;
      // Capture current rendered size (not affected by scale)
      startW = el.offsetWidth;
      startH = el.offsetHeight;

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend',  onUp);
    }

    function onMove(e) {
      if (!resizing) return;
      e.preventDefault();
      const pt = _getPointer(e);
      // Dragging left/up increases size; use the axis with greater movement
      const dx = startX - pt.x;
      const dy = startY - pt.y;
      const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      el.style.width  = Math.max(MIN_W, startW + delta) + 'px';
      el.style.height = Math.max(MIN_H, startH + delta) + 'px';
    }

    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    }

    rh.addEventListener('mousedown', onDown);
    rh.addEventListener('touchstart', onDown, { passive: false });
  }

  // Resize from any corner — signX/signY: +1 = right/bottom grows, -1 = left/top grows
  function _bindResizeCorner(handle, el, signX, signY) {
    let startX, startY, startW, startH, startLeft, startTop;
    let resizing = false;
    function onDown(e) {
      e.stopPropagation(); e.preventDefault();
      resizing = true;
      const pt = _getPointer(e);
      startX = pt.x; startY = pt.y;
      startW = el.offsetWidth; startH = el.offsetHeight;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }
    function onMove(e) {
      if (!resizing) return; e.preventDefault();
      const pt = _getPointer(e);
      const dx = (pt.x - startX) * signX;
      const dy = (pt.y - startY) * signY;
      const newW = Math.max(MIN_W, startW + dx);
      const newH = Math.max(MIN_H, startH + dy);
      el.style.width = newW + 'px';
      el.style.height = newH + 'px';
      // For left/top-moving corners, reposition the element
      if (signX < 0) el.style.left = (startLeft + (startW - newW)) + 'px';
      if (signY < 0) el.style.top  = (startTop  + (startH - newH)) + 'px';
    }
    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    }
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
  }

  // Resize from an edge — edge: 'top'|'bottom'|'left'|'right'
  function _bindResizeEdge(handle, el, edge) {
    let startX, startY, startW, startH, startLeft, startTop;
    let resizing = false;
    function onDown(e) {
      e.stopPropagation(); e.preventDefault();
      resizing = true;
      const pt = _getPointer(e);
      startX = pt.x; startY = pt.y;
      startW = el.offsetWidth; startH = el.offsetHeight;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }
    function onMove(e) {
      if (!resizing) return; e.preventDefault();
      const pt = _getPointer(e);
      if (edge === 'bottom') {
        el.style.height = Math.max(MIN_H, startH + (pt.y - startY)) + 'px';
      } else if (edge === 'top') {
        const dy = pt.y - startY;
        const newH = Math.max(MIN_H, startH - dy);
        el.style.height = newH + 'px';
        el.style.top = (startTop + (startH - newH)) + 'px';
      } else if (edge === 'right') {
        el.style.width = Math.max(MIN_W, startW + (pt.x - startX)) + 'px';
      } else if (edge === 'left') {
        const dx = pt.x - startX;
        const newW = Math.max(MIN_W, startW - dx);
        el.style.width = newW + 'px';
        el.style.left = (startLeft + (startW - newW)) + 'px';
      }
    }
    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    }
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
  }
  // ──────────────────────────────────────────────────────────
  function _captureLayout() {
    const layout = {};
    for (const h of _handles) {
      const el = h.el;
      // Read current transform scale (if set via calibration)
      const scale = el._uiCalScale !== undefined ? el._uiCalScale : 1;
      layout[h.def.selector] = {
        left:   el.style.left   || null,
        top:    el.style.top    || null,
        right:  el.style.right  || null,
        bottom: el.style.bottom || null,
        width:  el.style.width  || null,
        height: el.style.height || null,
        scale:  scale !== 1 ? scale : undefined,
      };
    }
    return layout;
  }

  function _saveAndExit() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_captureLayout()));
    } catch (e) {
      console.warn('[UICalibration] Could not save layout:', e);
    }
    exit();
  }

  function _saveAsDefault() {
    const layout = _captureLayout();
    try {
      localStorage.setItem(USER_DEFAULT_KEY, JSON.stringify(layout));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch (e) {
      console.warn('[UICalibration] Could not save default:', e);
    }
    // Visual feedback
    const saveDefaultBtn = document.getElementById('ui-cal-save-default-btn');
    if (saveDefaultBtn) {
      const orig = saveDefaultBtn.textContent;
      saveDefaultBtn.textContent = '✅ Saved!';
      setTimeout(() => { saveDefaultBtn.textContent = orig; }, 1500);
    }
  }

  function _resetAndExit() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    // Restore user's saved default, or factory defaults if none
    const userDefault = _loadUserDefault();
    for (const h of _handles) {
      const el = h.el;
      if (userDefault && userDefault[h.def.selector]) {
        _applyEntryToElement(el, userDefault[h.def.selector]);
      } else {
        const d = h.def.defaultPos;
        el.style.left      = d.left   || '';
        el.style.top       = d.top    || '';
        el.style.right     = d.right  || '';
        el.style.bottom    = d.bottom || '';
        el.style.width     = '';
        el.style.height    = '';
        el.style.transform = '';
        el.style.transformOrigin = '';
      }
    }
    exit();
  }

  // ──────────────────────────────────────────────────────────
  // Persistence helpers
  // ──────────────────────────────────────────────────────────
  function _loadLayout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _loadUserDefault() {
    try {
      const raw = localStorage.getItem(USER_DEFAULT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _applyEntryToElement(el, entry) {
    // Apply horizontal position — clear the opposing anchor to avoid conflicts
    if (entry.left !== undefined && entry.left !== null) {
      el.style.left  = entry.left;
      el.style.right = '';
    } else if (entry.right !== undefined && entry.right !== null) {
      el.style.right = entry.right;
      el.style.left  = '';
    }
    // Apply vertical position — clear the opposing anchor to avoid conflicts
    if (entry.top !== undefined && entry.top !== null) {
      el.style.top    = entry.top;
      el.style.bottom = '';
    } else if (entry.bottom !== undefined && entry.bottom !== null) {
      el.style.bottom = entry.bottom;
      el.style.top    = '';
    }
    if (entry.width)  el.style.width  = entry.width;
    if (entry.height) el.style.height = entry.height;
    // Apply saved scale transform, or clear any prior scale when omitted/default
    if (entry.scale !== undefined && entry.scale !== null && entry.scale !== 1) {
      el.style.transform = 'scale(' + entry.scale + ')';
      el.style.transformOrigin = 'top left';
      el._uiCalScale = entry.scale;
    } else {
      el.style.transform = '';
      el.style.transformOrigin = '';
      el._uiCalScale = 1;
    }
    // Ensure position is fixed so saved coords work regardless of which
    // anchoring side (left/top/right/bottom) was saved.
    if (entry.left || entry.top || entry.right || entry.bottom) {
      el.style.position = 'fixed';
    }
  }

  // ──────────────────────────────────────────────────────────
  // Utility
  // ──────────────────────────────────────────────────────────
  function _getPointer(e) {
    if (e.touches && e.touches.length) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  // ──────────────────────────────────────────────────────────
  // Expose public API
  // ──────────────────────────────────────────────────────────
  window.UICalibration = {
    enter,
    exit,
    applyLayout,
    get isActive() { return _active; },
  };

})();
