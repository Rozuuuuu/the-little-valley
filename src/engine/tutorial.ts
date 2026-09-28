import { builtCount } from '../game/sim/buildings';
import type { Simulation } from '../game/sim/Simulation';

export interface TutorialContext {
  sim: Simulation;
  selectedCount: number;
  saved: boolean;
}

export interface TutorialStep {
  title: string;
  text: string;
  done: (c: TutorialContext) => boolean;
}

const count = (sim: Simulation, type: string) => [...sim.buildings.values()].filter((b) => b.type === type).length;

/** The optional introduction. Each step completes through an action in the world. */
export const TUTORIAL: TutorialStep[] = [
  {
    title: 'Welcome to Little Valley',
    text: 'You (the one with the crown) and five settlers have raised a Town Hall in a quiet clearing. Left-click a settler to select them.',
    done: (c) => c.selectedCount >= 1,
  },
  {
    title: 'Gather the group',
    text: 'Hold the left button and drag a box around several settlers to select them together.',
    done: (c) => c.selectedCount >= 2,
  },
  {
    title: 'Chop some wood',
    text: 'With settlers selected, right-click a tree. They chop it, carry the wood back to the Town Hall and move on to nearby trees.',
    done: (c) => c.sim.stats.woodGathered >= 6,
  },
  {
    title: 'Gather stone',
    text: 'Select a settler and right-click a grey rock to mine stone.',
    done: (c) => c.sim.stats.stoneGathered >= 3,
  },
  {
    title: 'Lay out fields',
    text: 'Open Build (B), then Food (W), then Field, then drag across the flowery meadow west of the hall. Farmers till, plant and water fields by themselves.',
    done: (c) => count(c.sim, 'field') >= 3,
  },
  {
    title: 'Bring in the harvest',
    text: 'Crops grow through several stages. Press 2 or 3 to speed up time and wait for the first harvest to reach the Town Hall.',
    done: (c) => c.sim.stats.harvested >= 1,
  },
  {
    title: 'A real home',
    text: 'From Build → Town, place a House or Family Home near the hall. Visiting travellers settle for 40 food and a free bed: welcome them in the Families window.',
    done: (c) => builtCount(c.sim, 'house') + builtCount(c.sim, 'familyHome') >= 1,
  },
  {
    title: 'Set up a workshop',
    text: 'Place a Workshop (Build → Industry). Once it stands, select a settler and right-click it, or use Assign on the command card, to make them a Crafter who saws wood into planks.',
    done: (c) => count(c.sim, 'workshop') >= 1,
  },
  {
    title: 'Keep your valley safe',
    text: 'The game autosaves regularly. Press F5 or use the menu to save now.',
    done: (c) => c.saved,
  },
];

export const TUTORIAL_OUTRO = 'That covers the basics. Explore past the clearing, lay paths, and shape the valley however you like.';
