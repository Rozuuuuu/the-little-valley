/**
 * The Little Valley palette. Every sprite and terrain pixel comes from here,
 * which keeps the look cohesive. See docs/ART_GUIDE.md for the rules.
 */
export const P = {
  outline: '#2b2033',
  shadow: 'rgba(30, 20, 40, 0.28)',

  grass0: '#467f39',
  grass1: '#56913f',
  grass2: '#63a045',
  grass3: '#85bd55',
  grassTip: '#a7d56a',

  meadow0: '#5a9c43',
  meadow1: '#6aac4a',
  meadow2: '#7aba52',
  meadow3: '#98cc62',

  forest0: '#2f5a2f',
  forest1: '#3a6a36',
  forest2: '#44773c',
  forestLeaf: '#7a6a3a',

  sand0: '#c9ae6c',
  sand1: '#dbc284',
  sand2: '#e8d49a',
  sand3: '#b89a5c',

  rock0: '#7d786a',
  rock1: '#908a79',
  rock2: '#a59f8b',
  rock3: '#6a6558',

  dirt0: '#9c7449',
  dirt1: '#b18555',
  dirt2: '#c39a66',
  dirt3: '#84603c',

  water0: '#2f6a9a',
  water1: '#3b82b4',
  water2: '#4d9dc9',
  water3: '#6fbad9',
  foam: '#d8f1f4',
  deep0: '#244f7e',
  deep1: '#2b5d8e',

  soil0: '#6a4a2e',
  soil1: '#7d5836',
  soil2: '#8e6841',
  soilWet: '#4f3622',
  soilWet2: '#5c4029',

  wood0: '#5c3a22',
  wood1: '#7a4e2c',
  wood2: '#9a6538',
  wood3: '#b98049',
  wood4: '#d49c5e',

  stone0: '#5f646b',
  stone1: '#80868c',
  stone2: '#a3a8ab',
  stone3: '#c8cccc',

  leaf0: '#2c5a2e',
  leaf1: '#3b7536',
  leaf2: '#4f9040',
  leaf3: '#6cab4c',
  leaf4: '#94c863',

  pine0: '#1f4a3a',
  pine1: '#2b5f47',
  pine2: '#387656',
  pine3: '#4f9068',

  roof0: '#7e3428',
  roof1: '#a4452f',
  roof2: '#c35b3b',
  roof3: '#de7b4e',

  slate0: '#34496a',
  slate1: '#445e86',
  slate2: '#5877a0',
  slate3: '#7897bd',

  wall0: '#c9ac80',
  wall1: '#e2c898',
  wall2: '#f2e0b6',

  canvas0: '#b9a57c',
  canvas1: '#d7c69a',
  canvas2: '#ece0b8',

  glass: '#7d97a8',
  glassLit: '#ffd77a',
  glassLit2: '#fff0b8',

  fire0: '#d9481f',
  fire1: '#f28a2e',
  fire2: '#ffc947',
  fire3: '#fff3a8',

  berry: '#d9435a',
  berryDark: '#9c2640',
  flowerY: '#f4dc5c',
  flowerW: '#f6f1e4',
  flowerP: '#ec8fb0',
  flowerV: '#a98bdc',
  flowerR: '#e0584a',

  skin: ['#f3cfa6', '#e0aa7e', '#b87a52', '#7c4e35'],
  hair: ['#3a2820', '#7a4a2a', '#d9a441', '#b0472a', '#2e2e3e', '#e6dcc6'],
  shirt: ['#c9544b', '#4f7fb8', '#5f9e52', '#d9a441', '#8e62b0', '#df8446'],
  shirtDark: ['#9a3a36', '#3a5f8c', '#44773c', '#a87b2c', '#6a4686', '#aa5f2c'],
  pants: ['#4a4a6a', '#5a4636', '#3d5a5a'],
  shoe: '#3b2a22',
  blush: '#e79a8a',

  uiGood: '#8ee07a',
  uiBad: '#ff6f5e',
  uiWarn: '#ffcf5a',
  select: '#fff6c2',
} as const;
