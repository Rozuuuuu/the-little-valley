# Adventure mode: wanderer to ruler

Status: expanded proposal for review; not implemented. Updated: 2026-10-11. Includes the owner's requested inventory, monster loot, rarity tiers and wandering-warrior recruitment.

## Intent

Add a selectable Adventure mode to Little Valley's Godot game. Begin as a capable wandering knight, explore an initially unknown pixel world, fight monsters, develop attributes, undertake quests and earn the leadership of a kingless village. Continue adventuring after becoming ruler. Preserve Settlement mode and existing saves. The unrelated proposed 3D RPG in this repository is outside this feature.

## Approach

Recommended: integrate a hero adventure subsystem with the existing simulation, fog, navigation, rendering and settlement management. A separate RPG scene would simplify initial combat but make transferring the same village and hero into settlement play harder. Merely adding a hero to the current camp start would fail the requested journey from wanderer to ruler.

Assumptions: single player, top-down click-to-move and right-click contextual interaction, original pixel characters and monsters. Warcraft III is a reference for hero progression and readable combat, not an asset source. No online services required.

## Playable journey

1. New game offers Settlement and Adventure. Adventure requests a name and starting discipline: Knight (Strength), Scout (Agility), or Scholar-knight (Intelligence). These are starting stat spreads, not permanent restrictions.
2. Start alone at a roadside refuge with basic equipment, a heal charge and one active skill. No owned settlement, villagers or building economy yet. A short live guide teaches movement, interaction, combat and spending the first attribute point.
3. Explore roads, ruins and settlements through fog. Generate several ruled villages and at least one reachable kingless village. Validate connectivity, spacing and safe starting ground; regenerate candidates that fail. Do not reveal village coordinates on the initial map. Rumours offer direction and landmarks, never require blind unlimited searching.
4. Ruled villages offer named quest givers, recovery and rumours. Their ruler status is explicit. Friendly villagers are not attack targets.
5. At a kingless village meet its elder or senior steward. A brief portrait conversation explains the vacancy and offers a practical trial: resolve a nearby threat and help recover village supplies. Dialogue leads to playable objectives with a pinned tracker; it is not a long reading tutorial.
6. Complete the trial, return to the elder and choose: accept the village's leadership, help as its protector without ruling, or decline for now. Declining is reversible. Acceptance transfers the actual village, residents and stock into player management, preserving the hero, discoveries and quests. Becoming its leader is distinct from the existing later coronation milestone.
7. The main quest continues through village recovery and the existing settlement milestones. The hero can leave on expeditions while settlement simulation continues.

## Hero progression and combat

Experience comes from monsters, first discoveries and quests. Each level grants three freely assigned points. Preview every allocation's numerical effect. Strength increases health and melee damage; Agility increases armour and bounded attack speed; Intelligence increases mana and skill effectiveness. All builds retain usable basic attacks. Centralize formulas and cap attack speed; initial numbers are tuning values, not tested balance claims.

Provide attack, move, stop, a short-range cleave, a defensive ward and a recover action with visible cooldown/resource feedback. Unlock later abilities by level. Combat resolves at simulation ticks, independent of animation frames. Windup, hit, recovery and defeat animations communicate attack timing; damage happens once per resolved strike. Targets must be alive, hostile, reachable and in range.

Initial monsters: melee mosslings, ranged hexlings and a slower stone brute guarding the quest site. Use distinct original silhouettes, attack tells and death feedback. Monsters leash to camps, avoid settlement safety zones and grant rewards once. Encounter difficulty rises with distance; the first mandatory trial remains solvable by a starting hero.

Defeat returns the hero to the last safe refuge with a short recovery penalty. Preserve levels, equipment, discoveries and completed quests; no permanent hero death or progression softlock. Clear combat targets and held input on return.

## Quests and presentation

Main chain: First Steps → Rumours of an Empty Throne → Find the Kingless Village → An Elder's Trial → A Choice of Duty → A Home Worth Defending.

Initial side quests: deliver a letter between discovered settlements, recover a lost medicine satchel, clear a roadside monster camp, investigate a ruined watchtower. Each has a named giver, acceptance, objective progress, return/claim phase and useful reward. Stable IDs and transactional claims prevent duplicate experience or items after reload. Persist choices and optional quest completion.

Adventure HUD: hero portrait/health/mana/experience bottom-centre; actions bottom-right; minimap bottom-left; compact objective tracker top-left. Hide irrelevant settlement resource panels before leadership. Character details show all three attributes, derived stats and unspent points. Journal separates main and side quests; show only discovered locations. Use readable existing fonts, meaningful icons and existing sound/effects preferences. Reduced motion suppresses decorative motion without concealing attack tells.

## Inventory and equipment

Adventure has a shared party backpack with 30 slots initially, expandable to 48 through a packmaker quest and purchases. Show a fixed 24-slot page with explicit page buttons, category filters, sorting and search. Equipment and the selected item's details stay visible beside the bag; avoid a long scrolling character panel. Equipment slots: main hand, off hand, head, chest, hands, boots, amulet and two rings. Two-handed weapons occupy both hands. Four quick-use slots reference backpack stacks rather than duplicating items.

Item categories: weapons, armour, accessories, consumables, crafting materials, trade goods and quest objects. Materials stack to 99 and consumables to 20; equipment has individual instances. Quest objects use a separate journal pouch without consuming bag space and cannot be sold, salvaged or dropped. Gold is a party balance, not a slot item. No weight or durability chores in the initial release.

Use an immutable item-definition catalogue and uniquely identified equipment instances. Instances store item level, rarity, rolled modifiers, upgrade rank and origin. Actions include equip, compare, split stack, use, move to stash, sell, salvage and lock as favourite. Preview net stat changes, including removal of conflicting equipment and two-handed/off-hand interactions. Reject incompatible actions without losing either item. Equip companions from the same bag while outside combat.

Full-bag rules are explicit: ground drops remain in persistent reachable loot containers; mandatory quest rewards go to a recoverable reward cache at the giver/refuge. Never silently delete overflow or force a quest restart. Lost-access containers can be recovered through the refuge steward. A settled village unlocks a shared stash, but stash items do not count as carried quest-delivery items until withdrawn. Batch selling/salvaging excludes equipped, favourite and quest items. Preview valuable-item destruction before confirming it.

## Rarity and item power

Rarity order, lowest to highest: **Common → Uncommon → Rare → Very Rare → Epic → Legendary → Mythic → Relic**. Rarity names appear as text and distinct border marks as well as colour, so sepia mode remains readable. Relic is the highest power-budget tier here, with historical identity as its theme; it is not a second independent rarity system.

| Tier | Identity and modifier budget | Acquisition |
| --- | --- | --- |
| Common | Reliable base equipment, no random modifier | Starter gear, ordinary creeps, merchants |
| Uncommon | One modest modifier | Common encounter rewards and introductory quests |
| Rare | Two compatible modifiers | Elites, named side quests, regional treasure |
| Very Rare | Three modifiers with stronger specialization | Camp leaders, difficult quests, dungeon guardians |
| Epic | Three modifiers plus a build-changing trait within the tier budget | Regional bosses, major companion quests, expert crafting |
| Legendary | Authored named item; three modifiers and one signature effect | A visible multi-step quest or a named boss reward track |
| Mythic | Higher-budget authored item with a signature effect and conditional bonus | Post-leadership challenges and regional threats |
| Relic | Highest-budget authored item with one defining power and supporting modifiers | Restoring fragments from several distinct late-game challenges |

Item level controls the base stat range; rarity controls modifier budget and special effects. A high-level Common item can improve raw defence over an obsolete Rare item. Compare actual effects rather than recommending solely by colour. Modifiers must fit the item and use bounded additive bonuses; prevent recursive on-hit effects, zero cooldown loops and incompatible rolls. Unique effects do not stack with themselves across rings or party auras. Higher rarity should create choices, not simply multiply all attributes.

Example items: Roadworn Sword (Common), Trailguard Boots (Uncommon), Wayfinder Bow (Rare), Oathbound Shield (Very Rare), Stormwatch Blade (Epic), Elder's Promise (Legendary), Dawnwarden Aegis (Mythic), and Crownless King's Standard (Relic). These are proposed original item identities. Each starting discipline needs appropriate rewards; item pools must not overwhelmingly favour swords.

## Monster farming, drops and economy

Every encounter has a stable spawn identity and a new life-generation number on legitimate respawn. Loot and experience are claimed once per life, with the roll outcome persisted when the enemy dies. Reloading or reopening a container cannot reroll or duplicate rewards. Record the generator version so balancing changes do not rewrite existing equipment.

Ordinary monsters supply gold, useful materials and occasional gear. Elites have better pools; named bosses have authored pools and first-clear rewards. Supply non-random paths to important upgrades: quest reward choices, merchant equipment and boss tokens. After five eligible clears of a named boss, its tokens must purchase one selectable signature reward; this is a proposed balance target requiring playtesting. Relic fragments come from distinct challenges, not repeatedly killing the starting creatures.

Monster families have recognizable rewards: mosslings yield resin and fibres, hexlings yield focus shards, and stone brutes yield ore and carved cores. Expand with thorn prowlers (mobile melee), marsh wisps (ranged hazards) and ruin sentinels (armoured guardians). Visual tells and loot identities should make choosing a farming route meaningful. Safeguard critical quest drops from random chance.

Cleared camps respawn only after an in-game cooldown and while the party is outside their safety radius; no spawning onto the player, inside villages or while the application is closed. Use encounter budgets and bounded active AI around the party. Repeatable bounties reward varied camps; one-off quests and exploration XP remain one-off. Journal entries reveal known monster drops and reset conditions after discovery.

Merchant stock, quest rewards, crafting costs and sale values share one catalogue. Buyback retains a limited recent sale history. Salvage converts unwanted gear into materials; deterministic crafting and upgrades preview exact costs. Upgrade ranks improve an item's level-bounded stats without silently changing its rarity. Unique Legendary/Mythic/Relic advancement uses authored restoration quests. No random upgrade destruction or mandatory endless kill grind. Settlement resources and adventure materials use explicit recipes/transfers, never an implicit unlimited conversion into kingdom wealth.

## Recruitment and travelling companions

Find lone warriors on roads, in taverns, at camps or needing rescue. Recruitment encounters have persistent named characters, a role, a short history, current equipment, personality and a clear joining condition. Provide at least one guaranteed reachable potential recruit early; other travellers vary by seed. An NPC already recruited, dismissed or wounded cannot spawn as a duplicate.

Initial companion roles: Vanguard (shield and protection), Ranger (ranged damage and scouting), Arcanist (mana support and area attacks), Medic (healing and recovery), and Skirmisher (flanking and interrupts). Roles guide behaviour, not inventory rarity. Each recruit has a useful active skill and a small progression track. Never rate people using the equipment rarity labels.

Joining conditions vary: pay a disclosed one-time contract, rescue the warrior, win a friendly nonlethal trial, finish their personal errand, or earn sufficient village reputation. Preview costs, role and any ongoing wage before acceptance. A full party can send a willing recruit to the refuge reserve. Before owning a village, reserves stay at the refuge; afterwards they move to the village barracks/inn through an explicit reassignment.

Start with the hero and two active companions. A leadership quest increases capacity to the hero plus four; reserve capacity starts at eight. These are tuning limits. A reserve roster is not an army company: conversion or reassignment into existing military systems must be explicit and conserve people and equipment.

Controls: select an individual or the group, follow, hold position, defend hero, focus target, retreat and choose aggressive/defensive/passive stance. Stances have visible descriptions. Companions path around allies, leash back safely, avoid chasing through unexplored danger by default, and regroup at reachable positions. A stuck companion reports its state and receives a bounded repath; never teleport it through undiscovered terrain during combat. Active abilities support manual use and an optional clearly labelled automatic mode.

Active companions receive shared encounter XP without kill stealing. Reserve training keeps returning companions usable but never awards combat loot. Show level, skills, equipment, morale, contract and personal quest in a dedicated paged dossier. Loyalty advances from shared victories and personal quests; warn before a contract lapse and send unpaid mercenaries to reserves rather than silently deleting them or their equipment.

Defeated companions become downed, then wounded at the refuge if the party retreats or loses. Recovery uses rest or supplies; no default permanent loss. Dismissal clearly returns player-assigned equipment to backpack/cache, preserves the recruit's identity and states where they may be found again. Party-wide defeat preserves quest state and recoverable loot ownership.

## Expanded quests and long-term adventure

Extend the main chain after A Home Worth Defending: reopen a safe trade route, form a council, investigate the source of regional monster attacks, defeat a regional threat and earn recognition from neighbouring rulers. Leadership remains an optional path: protector players can undertake regional adventures without accepting a crown. Later kingdom-specific objectives are labelled as requiring leadership rather than blocking all adventure progression.

Add authored side-quest templates with distinct actions: rescue a stranded recruit, escort a merchant on a short route, gather medicine from a dangerous grove, investigate missing patrols, recover a stolen banner, defend a hamlet, settle a nonviolent dispute, and restore an old weapon. Select quests by discovered region and progression; names alone do not count as different content. Escort and defence failures offer retry/recovery paths and never permanently remove the only elder or critical quest giver.

Personal companion quests develop trust and unlock a skill variant or named item. Sample: a Vanguard asks to recover a former company's banner and can choose a defensive rally upgrade; a Ranger investigates missing scouts and gains a tracking technique. Choices show their consequence and persist across reloads.

Exploration content includes shrines, ruined watchtowers, monster dens and treasure sites, with environmental clues and bounded generated layouts. Major dungeons have a landmark entrance, a safe exit, a distinct encounter mechanic and a guaranteed useful completion reward. Post-leadership expeditions offer Mythic and Relic goals while the village continues operating; surface urgent settlement events and allow a safe return route. No time pressure silently resolves a major dialogue decision offscreen.

## Integration and persistence

Add dedicated adventure state, world-placement, combat, quest and presentation modules; avoid growing the main HUD or simulation into a single implementation file. Simulation owns all authoritative adventure state; UI sends validated commands.

Existing integration points: NewGame, Simulation, Kingdoms/Regions, SaveCodec/SaveValidation, game lifecycle, world selection, WorldView and HUD. Kingdoms.know_of currently crowns every rival; adventure village generation must represent ruler absence explicitly without changing old-world defaults. Existing army Combat stays responsible for company warfare; hero combat is separate.

Adventure saves carry an explicit mode and adventure schema version. Persist hero identity, experience, allocations, cooldowns, item instances and ownership, equipment, stash/cache contents, loot rolls, encounter life counters and respawn times, merchant transactions, companion identities/contracts/loyalty/assignments, village ruler/elder identity, discovery, quest flags and leadership choice. Loading must validate references and reject unsupported newer adventure data clearly rather than loading it as a normal settlement. Unknown item definitions must be preserved and reported, not silently discarded. Rebuild derived navigation/visuals. Keep on-device storage and label save slots by mode. Test saving before any village is owned, since current flows assume a home settlement.

Inventory transactions and reward grants are atomic and idempotent: an item instance has exactly one owner/location at a time. Party recruitment, dismissal, death recovery and leadership transfer follow the same conservation rules. Add isolated modules for item catalogue/rolls, inventory transactions, encounter lifecycle and companion orders. Item/quest/recruit data needs validation for broken references, unobtainable requirements and circular progression gates.

Leadership acceptance is an atomic operation: validate eligibility, assign settlement ownership/residents, establish the player capital, unlock management and mark the quest transition once. Repeated dialogue and reload must not duplicate villagers or supplies. Never call NewGame.create_camp to implement this transition.

## Implementation order and acceptance

Build in integrated checkpoints: mode/state/save compatibility; wandering and reachable villages; hero combat and progression; inventory/equipment and Common–Very Rare encounter loot; recruitment and party orders; quests and elder decision; leadership transition; Epic–Relic authored progression, crafting and post-leadership expeditions; pixel presentation and release validation. Each checkpoint includes playable integration, not only isolated data scaffolding. All eight tiers need obtainable, tested content before claiming the expanded mode complete; rarity labels alone do not fulfil this design.

Required evidence before calling the mode complete:

- Existing settlement regression suite remains green.
- Seeded generation checks show a reachable kingless village and ruled villages, with no initial map spoilers.
- All starting disciplines can finish the first encounter and main quest trial.
- Movement/path failures, target death, cooldowns, defeat, repeated rewards and attribute spending have regression coverage.
- Inventory tests cover full bags, overflow recovery, stacking, conflicting equipment, sell/buyback, salvage, favourites, duplicate claims and exact item conservation across reloads.
- Loot tests cover persisted rolls, one reward per enemy life, legitimate respawn, safe spawning, boss-token guarantees and discipline-appropriate obtainable equipment at every tier.
- Recruitment tests cover party/reserve limits, fee validation, duplicate NPC prevention, path recovery, equipment return, shared XP, wounds, contract expiry and save/load during recruitment and dismissal.
- Play through one recruit's personal quest, a full-bag quest reward, a repeatable monster camp and an authored top-tier acquisition path. Check economy loops and runaway item/ability combinations.
- Save/reload at wanderer, quest-progress, elder-choice and ruler stages retains exact authoritative state.
- An actual input-driven playthrough completes the journey from new game through leadership and a subsequent expedition.
- Screenshots check title/mode choice, combat, hero details, paged inventory/item comparison, companion dossier, journal and elder dialogue at 1280×720 and 1600×900; inspect reduced motion and full-colour/sepia readability.
- Windows game and separate Asset Studio exports pass startup checks; web export passes local error checks. Update HANDOFF with results and remaining limits, then commit verified work without pushing.

## Scope boundaries

The expanded mode includes inventory, equipment, all eight rarity tiers, monster farming, deterministic crafting/upgrades, recruitable companions, personal quests and a post-leadership reward path. Build these in the checkpoints above; this document is a specification, not evidence they already work. Multiplayer, mounts, unrestricted generated dialogue and an unlimited authored campaign remain outside scope. Tune drop rates, prices, encounter pacing and roster limits from actual playthroughs before describing the economy as balanced.
