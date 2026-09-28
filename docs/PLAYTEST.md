# Playtest script: Hamlet → Village

**Status:** prepared, **not yet run**. No human playtest has taken place for this
milestone.

## Setup (before each session)

- 5–8 people who have never played Little Valley, one at a time, 45–60 minutes each.
- Laptop with a mouse, sound on at a comfortable level, the production build
  (`npm run build && npm run preview`), a fresh browser profile.
- Start them from a **prepared Hamlet save**: play a new valley to Hamlet (about 15
  minutes), save, and copy that browser profile for each participant. They then all
  start at the same point: first house and workshop built, about 6–7 settlers, wheat
  planted.
- Screen and voice recording (with consent), plus the observer sheet below.

## What you say (read aloud, then stay quiet)

> "This is a cozy settlement game. You're continuing someone's small hamlet. Please
> think aloud: say what you're looking at, what you're trying to do and what
> surprises you. There are no wrong answers. I can't help during play, but I'll
> answer everything afterwards. Play until I say time, or stop whenever you like."

**Don't coach.** If they're stuck for more than 3 minutes, note it and say only: "What
would you try next?"

## Tasks (never read these out; only watch whether they happen)

| # | Watch for | Success looks like |
| --- | --- | --- |
| 1 | Understanding the next goal after Hamlet | Reads Valley today or the Goals tab and names a Village project in their own words |
| 2 | Creating and assigning a work area | Draws a farm, woodlot or quarry area and gets at least one settler working in it |
| 3 | Diagnosing a stopped production building | Finds out why the mill or bakery stopped (no wheat, no worker, storage full) and fixes it |
| 4 | Understanding the bridge | Explains why they'd cross the river, plans a bridge that places successfully, and sees it finished |
| 5 | Reaching Village | Reaches Village and names something they want to do next |

Also watch, specifically:

- **Newcomers:** can they say why new villagers have or haven't arrived? (Beds, food,
  the camp bedrolls.)
- **Sleep:** do they notice where villagers sleep (lit windows, "Asleep at home",
  "resting by the campfire")?
- **Housing:** do they realise when they need another home?

## Observer sheet (one per participant)

| Time | What happened | Quote | Tag |
| --- | --- | --- | --- |
| | | | confusion / failed click / delight / wish |

Record especially:

- **Points of confusion:** what they were looking at, and what they expected instead.
- **Repeated failed clicks:** the same click three or more times with no result. Note
  the exact screen spot (e.g. right-clicking a house expecting a menu).
- **What they say they want to build.**
- Time to first work area, to the first bridge placement, and to Village.
- Whether they opened: Valley today, the Areas tab, the work-order editor, the
  minimap find buttons.

## Short feedback form (after play, 5 minutes)

Scale: 1 = strongly disagree … 5 = strongly agree.

1. **Clarity:** I understood what I could do next. (1–5)
2. **Clarity:** When something stopped working, the game told me why. (1–5)
3. **Controls:** Selecting, ordering and drawing areas felt easy. (1–5)
4. **Visual appeal:** The valley looked charming and readable. (1–5)
5. **Pacing:** Things happened at a comfortable pace; I was rarely bored or rushed. (1–5)
6. **Continuing:** I'd like to come back to this same valley tomorrow. (1–5)
7. What was the most confusing moment?
8. What would you build next if you kept playing?
9. Anything you expected to be able to do but couldn't?

## After the sessions

Group notes by task. Treat anything that stopped 2 or more players as a must-fix, and
file the rest as candidates. Compare against the telemetry-free signals above: times,
failed clicks, and panels opened.


For the kingdom systems (mining, trade, crown, diplomacy, war) see
[KINGDOM_PLAYTEST.md](KINGDOM_PLAYTEST.md).

## The Town Hall update (HUD, ruler, habitats, animals, levels)

**Status:** prepared, **not yet run**. Start from a **new** world. Without coaching, watch
whether players:

1. Type their name and pick a habitat, and can later say why they chose it.
2. Find themselves on the map (the crowned figure, K) and notice that people near them
   work faster; use Rally.
3. Build from the command card: open a category, place a building, and use the hotkeys
   or the mouse without getting lost (Esc goes back).
4. Read a building through **See more**, and upgrade the Town Hall or a house, saying
   what the upgrade adds before paying.
5. Spot wild animals, build a hunter's lodge or a chicken coop, and explain where the
   food, hides or eggs went.
6. Draw a work area and see it staff itself; change the wanted number and the crop.
7. Find the mountains without being told.

At 1366×768 and 1920×1080, note anything cut off, overlapping or hard to click. Record
whether the command card felt quicker than the old build grid.

## Families and orchards (deliberate growth)

**Status:** prepared, **not yet run**. Start 5–8 unfamiliar players from a **new**
valley (not a prepared save). Without coaching, watch whether they:

1. Notice the visitor toast or the Families tab badge, and say what the visitor wants.
2. Grow food (fields, berries, a hunter's lodge or a pen), and see the store rise.
3. Welcome the visitor, and explain why a welcome was refused when it was (food or
   bed).
4. Start a household, ask for a child, and explain a pause (usually a missing bed).
5. Explain in their own words why the child doesn't work yet.

Record failed clicks on the Families window, confusion between Town Hall bunks and
home beds, and whether waiting for food or the child felt slow or satisfying. Rate
pacing of growth 1–5 separately from the rest. For a legacy save, ask them to find
and explain the "Adopt deliberate growth" choice before pressing it.

## Seasons and settlements continuation

For 5–8 unfamiliar players, use a separate test save at Village near autumn. Ask them to prepare for winter and establish a second settlement without coaching. Observe whether they discover Towns, understand food targets versus current stock, assign settlers, provide beds and connect roads. Ask them to save and resume, then explain winter crop behavior and their next goal. Record stalled production, failed clicks, inaccessible routes and confusion about home versus settlement membership. Rate clarity, controls, art, pacing and desire to resume this same world from 1–5, with one desired improvement. No human testing has been performed for this continuation.
