# Adventure mode implementation plan

User approved combining and implementing today's design on 2026-10-11.

**Goal:** Play a colourful wanderer-to-ruler adventure with loot, companions and consequential faction encounters in the existing Godot game.
**Architecture:** AdventureMode owns versioned JSON-compatible state inside Simulation.passthrough.adventure. Independent item/social modules supply validated transactions. AdventureHud and AdventureView render it; Game routes commands. Existing settlement simulation activates after leadership.
**Tech stack:** Godot 4.7.2, typed GDScript, existing pixel sprites and original code-drawn additions. No installed dependencies or services.
**Spec:** ../specs/2026-10-11-adventure-mode-design.md

## Constraints

- Preserve normal Settlement mode and browser source; never push.
- Use current godot-migration checkout and disjoint file ownership for parallel agents.
- Keep local saves; reject unsupported adventure versions explicitly.
- Reference foliage/palette without copying depicted franchise characters.
- Report actual implemented scope, tests and remaining gaps rather than equating this plan with completion.

## Work packages

- [ ] Inventory: adventure_items.gd and isolated regression tests. Catalogue, eight tiers, equipment, stack/overflow, use, sell, salvage, buy/craft and unique reward claims. Test full bag, duplicate rewards and equipment conflicts.
- [ ] Social: adventure_social.gd and tests. Main/side quests, elf/human/orc dialogue, recruitment, party roles/orders and saved decisions. Test refusal alternatives and repeat claims.
- [ ] World/core: adventure_mode.gd. Seeded reachable villages, refuge, enemy camps and connective paths; hero tick movement/combat, progression, skills, companion combat, encounter respawn, discoveries, dialogue effects and atomic leadership. Exercise seeded routes, combat defeat, reward conservation and transition.
- [ ] Rendering: adventure_view.gd and sprite helper. Original knight, undead/orc/elf actors, animated movement/attack tells, colourful landmarks and flowers, fog-aware visibility.
- [ ] Interface: adventure_hud.gd. Floating objective/hero/actions; paged inventory, stats, quests, companions, dialogue. Inputs must not leak through panels. Test 1280×720 fit and visible consequences.
- [ ] Integration: Game/new-game UI, simulation tick, fog sight, SaveCodec validation. Adventure starts without an owned settlement and loads before/after leadership. Menu/save failures retain live game. Capture options permit visual review.
- [ ] Verification: targeted tests, script checker, existing suite, input-driven adventure scene smoke and visual captures; fix failures. Rebuild Windows game/Studio and web, check local web errors when available. Update HANDOFF with results and commit verified changes locally.

## Review focus

1. Empty settlements before leadership: no implicit home indexing or normal villager hunger/job logic for hero.
2. Saved Dictionary numeric values become floats: compare/cast stable IDs consistently.
3. Full bags and repeated dialogue: no lost/duplicated loot or followers.
4. Blocked paths and refused negotiations: an accessible alternative remains.
5. Modal focus, resize and title return: no unintended combat or active hidden adventure overlay.

## Execution

Inventory, social and rendering/UI workers own distinct files. Parent owns core/integration and validates APIs together. Tests run after class import so new global classes resolve. Use workspace log paths, preserve export preset placeholders and do not mutate real saves during checks.
