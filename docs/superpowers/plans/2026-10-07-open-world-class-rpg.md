# Open-world class RPG: design and implementation plan

Date: 2026-10-07. Status: proposed plan for review; implementation has not started.

## 1. Intent and assumptions

Build a browser-playable action RPG where players choose a starting class, begin with modest equipment, gather resources and fight manageable enemies, and earn distinct class techniques through practice and trials. Combat should reward timing, positioning, weapon reach and stamina management. Samurai players eventually choose an elemental sword discipline.

The intended fantasy is an ordinary adventurer becoming a skilled specialist. Use AdventureQuest as inspiration for readable class tiers and Elden Ring as inspiration for deliberate combat and exploration. Create original characters, world, terminology, animation and techniques.

Planning assumptions, subject to revision:

- Single-player first, with local saves and no account requirement.
- Third-person 3D, stylized low-poly art, desktop browsers and keyboard/mouse first; gamepad support before public alpha.
- Resource farming means gathering, hunting and combat rewards. A small garden may come later; a settlement simulator is outside this game's initial scope.
- One handcrafted, connected region before a large world. No procedural infinity requirement.
- Samurai is an advanced Fighter route; players selecting Fighter can declare Samurai as their goal immediately.
- Current Little Valley is a separate farming/settlement game with browser and Godot implementations. Do not repurpose its existing game or saves. Proposed code belongs in a separate `rpg/` project if kept in this repository.

Success means players enjoy movement and basic sword combat before they see powerful visual effects, understand their next class milestone, and voluntarily continue exploring after their first upgrade.

## 2. Approach and scope

Three viable approaches:

| Approach | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Godot, stylized third-person 3D | Scene/animation/navigation tools; web and native export path | Browser renderer and payload constraints; asset production | Recommended provisional choice |
| Babylon.js + TypeScript | Browser-first integration, built-in 3D capabilities, familiar web tooling | More custom gameplay/editor tooling | Fallback if browser spike favors it |
| Top-down 2D action RPG | Lower asset cost and easier performance | Different camera and combat feel from the requested reference | Scope-reduction option |

Use Godot GDScript, Compatibility renderer and a single-threaded web export initially. Verify the engine version and export templates at execution time; do not inherit a version from Little Valley without checking. Godot's official web documentation describes WebGL 2.0, Compatibility rendering and current C# export limitations. Babylon's official specifications list Havok physics and a character controller. Engine choice remains gated on an actual browser prototype.

Do not build an MMO, multiplayer trading, PvP, housing, mounts or a large procedural world in the first release. Multiplayer would require separate authoritative simulation, persistence and economy designs; it is not a switch that can be added to local saves.

### Deliverable stages

1. **Combat prototype:** one arena, Fighter, short sword, training dummy, one enemy; no progression economy needed yet.
2. **Playable vertical slice:** one village, forest, cave and shrine; Fighter into Samurai; Ember and Tide styles; 45–90 minutes of purposeful content.
3. **Public web alpha:** four starting classes, expanded first region, three playable Samurai styles, accessibility and browser polish.
4. **Expanded RPG:** more regions, remaining advanced classes and disciplines, prestige trials and endgame encounters. Prioritize using alpha evidence.

## 3. Core loop and opening

Choose class and preview its future routes → leave the village → explore, gather and fight → return with materials and experience → upgrade gear and train → complete a class trial → unlock a technique → use that technique to tackle a new encounter or optional route.

Every outing should offer at least two useful rewards: resources plus mastery, a discovery plus gear, or a quest plus a combat lesson. Do not require hundreds of identical kills to reach the first interesting ability.

Opening pacing targets, not measured results:

| Time | Experience |
| --- | --- |
| 0–3 minutes | Choose class, receive modest gear, move and practice attacks |
| 3–10 minutes | Learn stamina and dodge timing; collect materials on a short outing |
| 10–20 minutes | First level, meaningful class technique and affordable weapon upgrade |
| 20–45 minutes | Explore cave, meet trainer, face a mini-boss and pursue Samurai trial |
| 45–90 minutes | Unlock advanced route, choose Ember or Tide, challenge regional boss |

All classes carry a small utility blade, but their primary starting weapon expresses their class: Fighter short sword, Mage apprentice focus, Rogue dagger, Scholar staff. Each has a useful signature action immediately. Fighter can equip a practice katana early, before earning Samurai status.

## 4. Progression and statistics

Keep four progression systems separate and visible:

- **Character level:** earned from combat, quests and discoveries; grants attribute points.
- **Class mastery:** earned from meaningful class actions and trainer objectives; unlocks class nodes.
- **Weapon proficiency:** earned from relevant encounters; grants limited handling bonuses and weapon techniques.
- **Equipment quality:** improved through exploration and crafting; affects reach, damage, defense and handling.

Proposed attributes: Vitality (health), Endurance (stamina/load), Strength (heavy weapons), Dexterity (precision weapons), Intellect (spells) and Spirit (focus/support). Each weapon and skill declares its scaling. Dexterity does not silently improve every parry window; core timing stays learnable.

Initial tuning example: 100 stamina, light attack costs 18, heavy 30, dodge 24. Regeneration begins after a 0.6-second expenditure delay at 25 per second. These are prototype values, to be revised after combat tests. Players can dodge from full stamina but cannot chain offense and unlimited evasions.

Use additive bounded bonuses and soft caps to prevent exponential stacking. Character stats, gear, proficiency and skill multipliers pass through one documented calculation pipeline. Avoid allocating different damage formulas to individual classes.

Unlock rule: required class rank + training objective + trainer trial. Character attributes can influence performance, but do not hide class routes behind irreversible stat choices. Preview requirements and allow inexpensive early attribute respec at the trainer.

Award mastery for completing encounters and objectives, not for repeatedly striking a dummy or using a skill against an invulnerable target. Gathering improves gathering rewards, not sword mastery. Early gathering bonuses must not become a mandatory leveling detour.

## 5. Class system

Use tiers to represent specialization depth. The 5/10/20 structure is a content budget of active techniques, passives and modifiers combined—not 20 combat hotkeys. Target two equipped actives in the slice and four later, plus one ultimate and a small passive loadout. Advanced tiers extend the selected route; they do not erase its identity.

| Starting class: 5 nodes | Proposed advanced routes: 10 additional nodes | Possible prestige routes: 20 additional nodes |
| --- | --- | --- |
| Fighter | Samurai, Knight, Berserker, Martial Artist | Sword Saint, Paladin, Warlord |
| Mage | Wizard, Elementalist, Summoner | Archmage, Necromancer |
| Rogue | Ninja, Ranger, Pirate | Assassin, Shadow Warden |
| Scholar | Alchemist, Warden, Beastmaster | Sage, Spirit Keeper |

This is the long-term route map, not a launch checklist. Prestige prerequisites may require a secondary training quest, but avoid forcing players to replay an entire unrelated class. Dragon-focused classes can be added when dragon encounters exist.

Fighter's first five nodes: Guard Counter, Endurance Training, Charged Cleave, Weapon Handling and Resolute Stance. First node unlock target: within 10–20 minutes. Samurai unlock target in slice: mastery rank 5 plus dojo trial; no random drop gate.

Changing advanced class occurs at a trainer outside combat. Preserve previously earned mastery; activate only the selected class's legal loadout. Switching a Samurai discipline at the dojo is free during testing. Later costs must not punish experimentation.

## 6. Samurai disciplines

Use original disciplines with the elemental themes the player requested. Breathing/focus controls execution and recovery; cinematic effects support physical sword strikes. Avoid recreating named characters or exact moves from the reference.

| Theme | Proposed discipline | Play identity | Counterweight |
| --- | --- | --- | --- |
| Flame | Ember | Pressure, finishing cuts, burn buildup | Expensive committed attacks |
| Water | Tide | Parries, flowing counters, stance transitions | Relies on timing |
| Beast | Fang | Dual blades, pursuit, close-range pressure | Reduced guard strength |
| Thunder | Storm | Draw-cut bursts and gap closing | Vulnerable recovery |
| Love | Heart | Support aura, flexible reach and rally effects | Lower solo burst; unusual weapon needs later assets |
| Insect | Venom | Precise thrusts and poison buildup | Weak stagger; resistance-aware encounters |
| Snake | Coil | Angled attacks, evasive steps and flanking | Positioning demands |
| Wind | Gale | Sweeping cuts, crowd control and spacing | Weak in cramped spaces |
| Mist | Veil | Feints, repositioning and threat disruption | Weak direct defense; no permanent invisibility |

Build Ember and Tide first because they test offensive and defensive play with the same katana asset. Add Storm at alpha. Fang and Heart need additional weapon/animation work, so they come later.

Samurai's ten additional nodes: draw cut, katana handling passive, focus stance, discipline identity passive, technique A, technique A modifier, counter technique, technique B, resource passive and finisher. Each discipline supplies different effects through this shared structure.

Ember example: Rising Ember is an advancing slash; Furnace Arc is a committed sweep; successful aggression builds Heat, while whiffs waste stamina. Tide example: Stillwater Guard converts a correctly timed defense into Focus; Returning Current is a directional counter. Both can beat the same boss using different decisions.

## 7. Combat specification

Implement light attacks, charged heavy attacks, dodge, guard, parry, stagger, lock-on, limited healing and weapon-specific skills. Movement, camera and hit feedback take priority over content volume.

- Attacks have startup, active and recovery phases. Use authored animation events for weapon hit windows; use swept collision checks to avoid missing fast movement between physics frames.
- One attack instance can hit each target only once unless the skill explicitly declares multiple hits.
- Hit resolution owns team filtering, invulnerability, damage, status buildup, stagger and death. Visual effects never independently apply damage.
- Stamina and focus spend atomically when an action starts. Reject insufficient-resource actions; never permit negative values.
- Dodge invulnerability exists only in its declared window. Tune a starting 0.15–0.22 seconds at 60 Hz; confirm with frame-level tests before promising fairness.
- Buffer one next action for roughly 120–180 ms. Define allowed transitions; prevent accidental duplicate attacks and universal animation cancellation.
- Guard drains stamina; guard break exposes the defender. Parry applies only to attacks flagged parryable and uses distinct feedback.
- Enemies telegraph attacks using motion and sound; include clear non-color indicators for unblockable attacks.
- Camera handles wall obstruction, target visibility, sensible lock-on switching and optional reduced camera shake.
- Restrict simultaneous enemy aggression to keep early groups readable. Enemies can flank without every nearby actor attacking at once.

Player states: idle, move, attack, dodge, guard, parry, skill, stagger, heal and dead. All gameplay transitions belong to the action state machine; animation playback reflects those states.

Aim for believable consequences: short weapons have shorter reach, heavy equipment affects mobility, healing leaves an opening, and weapon commitment matters. Avoid survival chores or permanent equipment loss in the slice.

Death returns the player to a shrine. Keep equipment, mastery and completed quests; drop unspent experience into one recoverable cache. A second death replaces the old cache. Provide a forgiving mode that preserves experience, and prevent caches appearing outside reachable terrain. Shrines restore health/healing and respawn ordinary enemies, with boss and quest exceptions.

## 8. World, enemies and quests

The slice contains one handcrafted connected region, roughly a 5–8 minute walk across, with deliberate shortcuts. The village anchors a forest loop, abandoned quarry cave and ruined shrine. Geography communicates danger through enemy presence, terrain and environmental cues.

Slice content budget:

- One village with trainer, smith and healer; six named NPCs total.
- Three resource types, six crafting recipes and about twelve meaningful gear items.
- Five enemy archetypes: scavenger, wolf, bandit melee, bandit ranged and shrine guardian.
- One mini-boss and one regional boss, each with multiple readable attacks.
- Eight quests including tutorial outing, first upgrade, exploration rescue, dojo trial and boss quest.
- Four shrines/checkpoints and three optional discoveries with useful rewards.

Mix quests: investigate, escort over a short safe route, recover, duel, discover and gather during exploration. Avoid eight variations of kill-ten-enemies. Quest state uses stable IDs and explicit prerequisites; rewards are transactional and cannot be collected twice.

Enemy AI: idle → investigate → pursue → choose attack → windup → strike → recover → retreat/leash, with stagger/death interrupts. Navigation operates locally. Bosses use authored phase rules; constrain turning during committed attacks to avoid unavoidable last-frame tracking.

Use authored terrain and points of interest; seeded placement is acceptable for resource variation. Distant areas unload active AI and expensive effects. Save persistent changes by entity ID rather than entire scene snapshots.

## 9. Economy and gathering

Gather herbs, ore and hides during expeditions. Early gathering should take seconds with readable feedback. The first sword upgrade needs a short outing's materials, not an hour of repetitive harvesting.

Crafting is deterministic and previews exact input/output. No upgrade failure chance. Upgrade levels are capped by regional materials; bosses and discoveries offer alternatives to repeated farming. Recipes must never consume a progression-critical quest item accidentally.

Currency buys consumables and ordinary gear; experience buys levels at shrines. Healing charges refill at shrines, so defeat cannot leave a player unable to afford recovery. Optional food grants temporary modest bonuses; no hunger meter initially.

Content validation checks acquisition routes, prices, crafting cycles and reward frequency. Balance using median time to first upgrade and technique; do not assume theoretical resource rates match player behavior.

## 10. Presentation and accessibility

Stylized silhouettes, readable weapons and restrained effects. Use one humanoid rig initially, with shared locomotion and carefully authored attack animations. Audio and impacts distinguish hit, block, parry, stagger and miss.

Screens: start/load, class selection with previews, HUD, inventory/equipment, class tree, quest journal, map, trainer, crafting, settings and death/recovery. HUD displays health, stamina, class resource, equipped techniques and immediate objective.

Keyboard/mouse default proposal: WASD movement, mouse camera, left click light, right click guard, Shift dodge, Q/E skills, R healing, F interaction, Tab lock-on, I inventory, Escape pause. Charged heavy can be hold-left-click, but test whether this delays light attacks; use a separate binding if it does. Remappable controls and gamepad layouts are required before alpha.

Provide text scaling, subtitles, reduced shake, adjustable aim/lock-on assistance, distinct status icons, audio sliders, hold/toggle guard options and difficulty assists. True pause in single-player. Pause on focus loss and clear held inputs before resuming.

## 11. Architecture and file ownership

Proposed new project structure; these files do not exist yet:

```text
rpg/
  project.godot
  export_presets.cfg
  scenes/boot.tscn
  scenes/player/player.tscn
  scenes/world/region_one.tscn
  scenes/combat/test_arena.tscn
  scenes/ui/                         # Screens and HUD
  src/core/session.gd                # Session lifecycle and pause
  src/player/controller.gd           # Input intents and locomotion
  src/player/action_state.gd         # Allowed action transitions
  src/player/camera_rig.gd           # Camera, lock-on and obstruction
  src/combat/attack_executor.gd      # Attack instances and event timing
  src/combat/hit_resolver.gd         # Single authoritative hit pipeline
  src/combat/resources.gd            # Stamina/focus, regen and costs
  src/combat/status_effects.gd       # Stacking, buildup and expiration
  src/progression/character.gd       # XP, level and attributes
  src/progression/class_mastery.gd   # Route requirements and node unlocks
  src/progression/loadout.gd         # Equipment and legal skills
  src/world/region_manager.gd        # Region loading and entity lifecycle
  src/world/checkpoints.gd           # Rest, death and respawn
  src/ai/enemy_brain.gd              # Enemy state machine
  src/quests/quest_service.gd        # Objective state and reward transactions
  src/economy/inventory.gd           # Item operations
  src/economy/crafting.gd            # Validated recipe transactions
  src/persistence/save_service.gd    # Versioned saves, backup and migration
  data/classes/ data/skills/ data/weapons/ data/enemies/ data/quests/
  assets/models/ assets/animations/ assets/audio/ assets/vfx/
  tests/unit/ tests/integration/ tests/scenes/
  tools/run_tests.gd
  tools/validate_content.gd
  web/                              # Export shell and JS save/download bridge
```

Definitions use stable IDs and typed Godot Resources. Runtime state references definitions without modifying them. Events carry IDs and values; UI observes state and issues commands rather than editing stats directly. No requirement for a full ECS framework.

Core contracts: action request → validated action instance; hit candidate → HitResult; reward bundle → single committed inventory/progression transaction; unlock request → eligibility result; save request → validated versioned snapshot.

Save character identity, class mastery, attributes, equipment, inventory, quest states, discoveries, checkpoint and recoverable cache. Keep settings separate. Save on milestones and periodically while safe; never resume halfway through an attack. Version schemas, preserve a previous valid backup and reject malformed imports. Browser persistence must be tested for actual reload survival, not just successful write calls. Offer downloadable save export/import; explain when storage is unavailable.

## 12. Browser and asset budgets

Provisional goals to measure on named devices, not guarantees:

- 60 fps at 1080p on the chosen reference desktop; 30 fps at 720p on a selected integrated-GPU laptop.
- P95 frame time under 33 ms on the lower-spec device during normal fights; measure boss effects separately.
- First playable load under 15 seconds on a controlled 20 Mbps connection. Start with a compressed initial-download budget of 25 MB and revise after measuring engine overhead.
- No unbounded memory growth during a 30-minute traversal/combat session. Initial total browser memory target under 400 MB, measured consistently.
- First region supports 8–12 active combatants; dormant enemies do not tick full AI.

Use shared rigs, texture atlases, modest material counts, pooled effects, capped particles, simple collisions, distance culling and restricted dynamic shadows. Profile before adding elaborate elemental effects. Test current Chrome, Edge and Firefox; evaluate Safari explicitly before claiming support. Touch mobile is a separate later milestone.

Maintain an asset manifest with source, permission/license, file size, rig compatibility and optimization status. Commission or license animations early: combat feel depends on them. Lock-on and combat remain legible when effects are reduced.

## 13. Implementation tasks and acceptance gates

Tasks below describe deliverable units. During execution, break each into short edit/test steps, add meaningful regression tests for stateful mechanics, run appropriate checks and commit coherent changes. Do not pretend a whole open-world RPG is a sequence of five-minute tasks.

| Task | Files/ownership | Dependencies | Acceptance |
| --- | --- | --- | --- |
| 1. Browser feasibility | project/export settings, boot scene, test arena, web shell | None | 3D scene, character and input run in browser; reload, focus and memory measured; engine decision recorded |
| 2. Movement and camera | controller, camera rig, player scene | 1 | Slopes/steps work; camera avoids walls; lock-on switches predictably; no stuck input after focus loss |
| 3. Combat kernel | action state, resources, attack executor, hit resolver | 2 | Dummy takes exactly one hit per attack; stamina costs, recovery, dodge windows and transitions pass tests |
| 4. Enemy and duel | enemy brain, enemy definitions, arena enemy scene | 3 | One enemy is enjoyable with basic gear; readable attacks; no wall hits or unfair turn tracking |
| 5. Combat feedback | animation events, audio, impact VFX, HUD | 4 | Hit/block/parry/miss distinguished; reduced effects remain readable; testers understand why they were hit |
| 6. Progression foundation | character, mastery, loadout, class/skill definitions | 3 | Five Fighter nodes; XP and unlock eligibility verified; dummy farming earns no mastery |
| 7. Inventory and crafting | inventory, crafting, items/recipes, UI | 6 | Equip/unequip updates stats correctly; first upgrade affordable; failed craft consumes nothing |
| 8. Save and recovery | save service, checkpoints, browser bridge | 6–7 | Reload restores progress; corrupted save uses backup; migration/import tested; cache reachable and claimable once |
| 9. First region | region manager, world scenes, checkpoints, navigation | 4, 8 | Village/forest/cave/shrine connected; short loop and shortcut; enemies reset correctly |
| 10. Quests and trainers | quest service, NPC/dialogue scenes, quest definitions | 6–9 | Eight quests; rewards once; objectives survive reload; class trainer explains requirements |
| 11. Samurai route | class data, dojo trial, katana animations, Ember/Tide skills | 5–10 | Trial unlocks route; distinct styles beat same encounter; legal loadouts survive save/switch |
| 12. Boss and slice balance | boss AI/scenes, loot, economy tuning | 11 | Boss tests learned mechanics; complete 45–90 minute progression loop; no mandatory repetitive grind |
| 13. Web release readiness | settings, gamepad input, asset optimization, export tests | 12 | Performance/browser gates; controls/accessibility; save export; no critical blockers in complete playthrough |
| 14. Alpha expansion | Mage/Rogue/Scholar, Storm, additional encounters | Slice approved by playtests | Each base class works from start to boss; class identity measured before adding more routes |

Combat gate is mandatory before tasks 6–14 become a large content investment. If basic sword fighting is weak, revise movement, camera, animation and enemy design first.

## 14. Verification and playtesting

Unit tests: damage/scaling bounds, resource spend/regeneration, status expiration, unlock prerequisites, loadout legality, inventory transactions, quest idempotency and save migrations.

Scene/integration tests: attack event windows at different render rates, fast weapon sweep hits, duplicate hit rejection, parry/unparryable attacks, interrupted healing, death during rewards, shrine respawn, boss persistence, class switch and save/reload.

Browser checks: real production export over HTTP/HTTPS; reload persistence, focus loss, audio after user gesture, fullscreen/cursor capture, gamepad reconnection, unavailable storage, resize and low-quality graphics. Headless simulation alone does not validate animation or browser presentation.

Manual sessions: first with 5 players for major usability problems; then 10–20 for pacing and route comparisons. These samples guide iteration and are not reliable market validation. Record observations and optional local session metrics, with consent before transmitting analytics.

Initial playtest targets:

- At least 4 of 5 testers understand the immediate objective and stamina behavior without coaching.
- Median first meaningful unlock under 20 minutes.
- Most testers can explain one difference between Ember and Tide after trying both.
- No player becomes unable to progress because of lost gear, resource poverty or a broken quest.
- At least 70% of the 10–20 player group rate combat 4/5 or above; inspect written feedback rather than treating the percentage alone as proof.
- Boss failures reveal a learnable cause; avoid judging fairness only by completion rate.

## 15. Staffing, sequence and risk

Planning estimate for one experienced developer using usable purchased/original assets: 1–2 weeks for feasibility, 3–5 additional weeks for combat, 5–8 for progression/world, and 3–5 for Samurai/boss/polish. That is approximately 12–20 full-time weeks for a modest slice, with overlapping art work; add 25–40% contingency. Beginners, part-time schedules and custom animation production can extend this substantially. This is an estimate, not a delivery promise.

Public alpha may need another 8–16 weeks for three new classes, encounters, browser support and balancing. A large polished open-world RPG is a multi-year production; the expanded roadmap is not a committed scope or date.

Primary risks and responses:

- Scope explosion: require a playable milestone before approving another class/region.
- Weak combat: invest first in animation, camera and readable enemies.
- Browser limits: validate exported 3D performance before asset production; reduce detail or use the 2D option if needed.
- Grind: measure first upgrades/unlocks, add quest/discovery rewards and alternative material sources.
- Dominant style: preserve tradeoffs and test the same encounters with multiple routes.
- Content workload: reuse compatible rigs and systems without making every class play identically.
- Save loss: backups, validated imports and visible export controls.

Definition of slice completion: class selection through Fighter→Samurai, two styles, full region and boss are playable in a hosted web build; saves work across reloads; browser/performance gates pass on recorded devices; no progression blockers; playtest findings and remaining issues documented.

## 16. Review decisions and sources

The proposed defaults are single-player, third-person 3D, resource/combat farming, Fighter→Samurai progression and a separate project. Before implementation, review those defaults and decide whether the ambition is a compact indie action RPG or a broader production with a team. The first task remains the browser/combat feasibility build, not nine disciplines at once.

Sources consulted for reference and engine constraints:

- AdventureQuest class design discussion: https://www.battleon.com/gamedesignnotes/Class-News-8697
- AdventureQuest official class overview: https://www.battleon.com/Classes
- Godot web export documentation: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- Babylon.js capabilities: https://www.babylonjs.com/specifications/

The game's proposed systems, balance values, scope, goals and schedule are design recommendations rather than facts established by those sources.
