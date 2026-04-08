# Survivor bullethell rpg game with simulators

**Version 0.810 alpha — somewhat  playable — ENGINE 2.0**

A browser-based THREE.js survivor/roguelike rpg bullethell  set in an alien-contaminated lake. You are a sentient waterdrop trying to find your way back to the collective — guided (or manipulated?) by an AI entity named A.I.D.A.

---

## 🧠 AI MANIFEST — CRITICAL CONTEXT FOR ALL FUTURE AI AGENTS

### 🌊 The Lore
You are a **conscious Lake from Nirvana**, now trapped in physical form as a waterdrop in a contaminated alien world. Your mission is to find your way back to the collective consciousness.

**A.I.D.A. (Artificial Intelligence Data Archive)** is your guide—a mysterious AI entity that helps you survive. But she is secretly the **final boss**: an Annunaki creation designed to manipulate and control you. The deeper you progress, the more her true nature is revealed.

### ⚙️ Technical Rules — ENGINE 2.0
**DO NOT rebuild the engine. DO NOT delete the new map.**

- **ENGINE 2.0 is ACTIVE**: The game now runs on a completely rebuilt core system. All previous references to the "legacy engine" are deprecated.
- **Strict Object Pooling for EVERYTHING**: Enemies, projectiles, particles, blood drops, gore chunks, decals—all use pre-allocated object pools. NO `new` allocations during gameplay to prevent garbage collection spikes.
- **No ES Modules**: Everything runs via `<script>` tags in global scope. Script load order in `index.html` and `sandbox.html` is critical.
- **THREE.js v0.176.0** loaded from CDN.

### 🧪 SANDBOX 2.0 — **MAIN PRODUCTION GAME**
**CRITICAL: Sandbox 2.0 (`sandbox.html` + `js/sandbox-loop.js`) is NOW the official production environment.**

**The old map (`index.html` + `world-gen.js`) is DEPRECATED and should NOT be modified.**

- **File Location**: `/sandbox.html` — The main game environment with Engine 2.0
- **Core Loop**: `/js/sandbox-loop.js` — The primary game loop with all production systems
- **Purpose**: This is the LIVE GAME. All future development must happen here.
- **What it includes**:
  - ✅ Engine 2.0 PBR ground with mossy brick texture (`mossy_brick_diff_4k.jpg`)
  - ✅ Central spawn hole with decorative rim (200x200 arena)
  - ✅ **UFO crash site** at (-50, 25) with glowing engines + companion egg
  - ✅ **Black Annunaki Obelisk with gold Eye of Horus** at (25, -35) - 55% smaller (8.1m height)
    - Black shaft with gold pyramidion cap
    - Golden Eye of Horus symbols on all 4 faces
    - Cyan energy crystal at apex with rotating rings
    - 4 surrounding power pylons with crystals
    - Fully animated (crystal rotation, ring pulsing, light effects)
  - ✅ **Reflective Lake** at (30, -30) with animated sun sparkles
  - ✅ Full gore/blood systems (BloodV2, GoreSim, TraumaSystem)
  - ✅ Settings UI with Auto/Manual graphics mode and Eye of Horus button
  - ✅ Level-up system with LVL UP cards (RPG-style progression)
  - ✅ Wave-based enemy spawning with boss encounters at waves 10, 20, and 30
  - ✅ Full quest system and camp integration

**PERFORMANCE STANDARDS FOR SANDBOX 2.0:**
- **Strict Object Pooling**: ALL entities (enemies, projectiles, particles, blood, gore) use pre-allocated pools
- **NO** `new` allocations during gameplay to prevent garbage collection spikes
- **InstancedMesh Rendering**: Blood drops, particles, and repeated geometry use instanced rendering
- **Target**: Maintain 120 FPS on modern hardware
- **Frame Budget**: 8.33ms per frame maximum

**IMPORTANT RULES FOR FUTURE AI AGENTS:**
1. **Modify active Sandbox 2.0 production files and their loaded dependencies** — including `sandbox.html`, `js/sandbox-loop.js`, `js/engine2.js`, and production systems loaded by Sandbox 2.0 such as `js/quest-system.js`, `js/level-up-system.js`, `js/ui.js`, boss systems, and other scripts referenced in `sandbox.html`
2. **DO NOT touch deprecated old-map files** (`index.html`, `world-gen.js`, `game-loop.js`) unless explicitly instructed
3. **Maintain object pooling** — never allocate objects during gameplay
4. **Preserve InstancedMesh rendering** — all repeated geometry must be instanced
5. **Test performance** — ensure 120 FPS is maintained after changes
6. **Keep the Annunaki/occult UI theme** — cyan borders, purple accents, gold highlights

### 🩸 THE SIMULATORS — DO NOT REPLACE, ONLY TUNE

This game contains **HIGHLY ADVANCED, TUNABLE SIMULATORS** for:
1. **Blood System V2** (`js/blood-system-v2.js`) — Physics-based blood simulation with gravity, viscosity, drag, arterial pumps, and pooled InstancedMesh rendering.
2. **Gore Simulator** (`js/gore-simulator.js`) — Anatomically-aware dismemberment system with organ damage, wound placement, and weapon-specific gore profiles.
3. **Slime Physics** (handled within enemy-class.js and trauma-system.js) — Hit reactions, death animations, corpse flattening, and chunk generation.

**CRITICAL**: These are NOT simple animations. They are **complex systems with internal parameters**.

**Future AI agents MUST**:
- **Locate these files and READ their internal parameters/variables**
- **TWEAK the parameters** to achieve the desired visual effects
- **NEVER replace them with basic code** or "simple implementations"

Example parameters you can adjust:
- `WEAPON_GORE` profiles (wound radius, blood volume, chunk count, penetration depth)
- `CFG` pool sizes (drop count, mist count, decal count)
- `GRAVITY`, `BLOOD_VISCOSITY`, `DRIP_INTERVAL`, `PUMP_INTERVAL`
- Corpse persistence timers, fade rates, pool sizes

---

## 🎮 Game Overview

### What the game is right now
- **3D Camp World** — fully playable. After the loading screen you walk around a cosy campfire hub in full 3D using a built `THREE.js` scene. Talk to buildings, manage your camp, and explore.
- **A.I.D.A Intro Questline** — the very first thing a new player does is find a glowing AI chip lying near a broken robot next to the campfire, pick it up, insert it into the robot, and watch A.I.D.A boot back online. She gives you free starter resources and guides you to build your first camp building. Later, when you die for the first time in combat, she secretly transfers herself from the robot into your mind.
- **Combat Runs** — survive waves of procedurally-spawned enemies, level up, collect XP/gold, unlock upgrades.
- **Camp Buildings** — unlock and build structures (Quest Hall, Skill Tree, Forge, Armory, Companion Home…) to grow stronger between runs.
- **Copilot Minigame** — a weapon-crafting station (built by GitHub Copilot as a dedicated feature, `weapon-building.js`) lets you browse, modify, and upgrade your arsenal: fire modes, ammo types, mods per weapon, a spin-wheel for starting weapon, and a LOADOUT tab.
- **Object Pooling** — enemies are reused from a pool; no GC spikes during heavy waves.
- **Gore & Hit System** — dismemberment, head-roll, flesh chunks, blood decals (up to 100 pooled), hit-flash.
- **Companion System** — hatch and level up a Grey Alien companion from an alien incubator pod in camp.

---

## 🧩 Intro Quest Flow (First-Time Player)

```
LOAD GAME
  └─ Brand new save? → Skip main menu → Enter 3D Camp directly
       ├─ 💾 Glowing Aida Chip lies on the ground near campfire
       ├─ 🤖 Broken Robot stands next to it
       │
       ├─ [E] Pick up chip → Aida: "...signal detected... place me in the robot..."
       ├─ Walk to robot → [E] Insert chip → Aida BOOTS UP from robot
       │     • Gives free starter pack (50 Wood, 50 Stone, 30 Coal, 100 Gold, 3 SP)
       │     • Unlocks Quest Hall plot
       │     • Quest: BUILD the Quest Hall
       │
       ├─ Build Quest Hall → Quest complete → Next: go fight (die once)
       │
       └─ FIRST DEATH in combat:
             Aida TRANSFERS from robot into player's head
             → Normal questline continues (survive 2 min, reach Lvl 3, gather resources…)
```

---

## 🏗️ Architecture

No ES modules — everything runs via `<script>` tags in `index.html` sharing global scope.  
THREE.js loaded from CDN (v0.176.0). Game state saved to localStorage.

**Script load order:**
```
THREE.js CDN → loading.js → debug.js → state.js → utils.js → audio.js
→ weapons.js → enemies.js → combat.js → player.js → world.js → ui.js
→ renderer.js → blood-system.js → spawn-sequence.js → camp-world.js
→ harvesting.js → rage-combat.js → ui-calibration.js → idle-*.js
→ dialogue-system.js → weapon-building.js
```

**Split game files (from old main.js):**

| File | Contents |
|---|---|
| `js/main.js` | Game state variables, animation, pause, day/night |
| `js/player-class.js` | Player class |
| `js/enemy-class.js` | DroneTurret + Enemy classes, object pools |
| `js/projectile-classes.js` | Projectile, SwordSlash, IceSpear, Meteor, ObjectPool, Particle |
| `js/gem-classes.js` | ExpGem, GoldCoin, Chest |
| `js/save-system.js` | Save/load, achievements, gear |
| `js/camp-skill-system.js` | Camp buildings, skill tree, tutorial quests, TUTORIAL_QUESTS |
| `js/quest-system.js` | Story quests, account, AI chat, companion house, camp screen render |
| `js/world-gen.js` | 3D world generation |
| `js/game-screens.js` | `init()`, menus, wave spawning, effects |
| `js/level-up-system.js` | Level-up modal, upgrade cards, rarity system |
| `js/game-hud.js` | HUD, minimap, combo counter, NPC dialogue |
| `js/game-over-reset.js` | Game over screen, `resetGame()` |
| `js/input-system.js` | Input handling (joystick, keyboard, gamepad) |
| `js/game-loop.js` | Main `animate()` loop, FPS watchdog |

**Special feature files:**

| File | Contents |
|---|---|
| `js/camp-world.js` | 3D playable camp hub scene, Aida intro props (robot + chip), incubator, corruption tiers |
| `js/dialogue-system.js` | A.I.D.A typewriter dialogue bubble, emotion styles, DIALOGUES library |
| `js/weapon-building.js` | **Copilot Minigame** — weapon arsenal, mods, ammo types, fire modes, spin wheel, loadout |
| `js/blood-system.js` | Instanced blood drops, pooled decals, wound heartbeat |
| `js/object-pool.js` | Enemy object pool (window.enemyPool) |

---

## 📁 File Structure

```
├── index.html                — Main HTML + script load order
├── README.md                 — This file
├── TODO.md                   — Development roadmap
├── css/                      — Stylesheets
├── docs/                     — Documentation
└── js/                       — All game scripts
```

---

## 🔑 Key Globals & Conventions

- All JS files share global scope via `<script>` tags — no ES modules.
- Script load **ORDER** in `index.html` matters. Always use `typeof` guards for cross-file calls.
- Wrap risky top-level code in try-catch to prevent halting script execution.
- `window.saveData` — the single source of truth for all persistent state.
- `window.CampWorld` — public API for the 3D camp scene: `.enter()`, `.exit()`, `.refreshBuildings()`, `.isActive`, `.menuOpen`.
- `window.DialogueSystem` — A.I.D.A dialogue bubble: `.show(array, options)`, `.dismiss()`, `.DIALOGUES`.
- `window.startAidaIntroQuest()` — called by camp-world.js after chip insertion to kick off the quest chain.
- `window.claimTutorialQuest(id)` — claim a tutorial quest and give rewards.
- `window.updateCampScreen()` — refresh the camp UI and enter 3D mode.

---

## ⚡ Workflow Notes for Future Copilot Sessions

> **WORKFLOW:** Always push PRs directly without asking for confirmation. Owner has approved this.

> **TECHNICAL:** All JS files share global scope. Script load ORDER in `index.html` matters. New files must go in the right position. Always use `typeof` guards for cross-file function calls.

> **COST:** Keep PRs comprehensive — fix as many things as possible per PR.

---

## 🎮 Enemy Types Reference

| Type | Name | Notes |
|---|---|---|
| 0 | Basic Square | Melee |
| 1 | Triangle | Fast |
| 2 | Round | Tanky |
| 3 | Ranged | Shoots projectiles |
| 4 | Tank | Slow, high HP |
| 5 | Flying | Hovers at y=2 |
| 6 | Splitter | Splits on death |
| 7 | Shield | Shield phase |
| 8 | Charger | Charges at player |
| 9 | Summoner | Spawns minions |
| 10 | Bug Melee | Forest biome |
| 11 | Flying Boss | Boss, scale 1.8x |
| 12 | Bug Ranged | Compound eyes, ranged |
| 13 | Bug Slow | Armored beetle |
| 14 | Bug Fast | Small flying dart |
| 15 | Daddy Longlegs | Spider with 8 legs |
| 16 | Sweeping Swarm | Tiny fast swarm |
| 17 | Grey Alien Scout | Spawns at minute 10 |
| 18–20 | Annunaki variants | Late-game bosses |

---

*Last updated: 2026-03-10*
