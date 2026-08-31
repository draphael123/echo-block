// THE RING ROAD — the city's bypass, and the only place you use all of the car.
//
// The question is WILL YOU COMMIT BLIND. Few corners and all of them fast, but
// the relief is savage: crests hide the road the way the dark does on the
// Parade, and that is the point — it is a variation on the sight mechanic
// rather than a repeat of it, because a crest hides things in daylight too.
//
// It is also where the lamps upgrade finally earns its money, and where the
// tunnels give the only sodium-lit stretch in the city.
const HALF = 124;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'ring',
  name: 'The Ring Road',
  blurb: 'fast, blind crests, two tunnels',
  heading: 0,

  road: { half: HALF, kerb: 6, pave: 22, verge: 26, apron: 8 },

  shape: {
    free: [0, 4],
    ops: [
      { straight: 0 }, { arc: -60, r: 900 },
      { straight: 700 }, { arc: -40, r: 900 },
      { straight: 0 }, { arc: -95, r: 520 },
      { straight: 1500 }, { arc: -75, r: 700 },
      { straight: 1000 }, { arc: -90, r: 460 },
    ],
  },

  legs: [
    { lit: false, name: 'the bypass', district: 'motorway' },
    { lit: false, name: 'north sweep', district: 'motorway' },
    { lit: true, name: 'the services', district: 'services' },
    { lit: false, name: 'the long right', district: 'wood' },
    { lit: true, name: 'hill tunnel', district: 'tunnel' },
    { lit: false, name: 'the drop', district: 'motorway' },
    { lit: false, name: 'the flats', district: 'farm' },
    { lit: false, name: 'east sweep', district: 'motorway' },
    { lit: true, name: 'gate tunnel', district: 'tunnel' },
    { lit: false, name: 'the run in', district: 'yard' },
  ],

  // The big one. Nearly ten metres top to bottom, so crests genuinely hide the
  // road over them, which is the whole mechanic of this circuit.
  profile: [
    [0, 0], [1000, 42], [2000, 76], [2900, 40],
    [3800, -18], [4700, -46], [5600, -10],
    [6500, 48], [7300, 80], [8100, 36], [8560, 6],
  ],

  hazards: [
    { s: 1200, u: H(0.5), r: 34, kind: 'works' },
    { s: 2600, u: H(-0.46), r: 36, kind: 'broken' },
    { s: 4200, u: H(0.44), r: 34, kind: 'skip' },
    { s: 5400, u: H(-0.5), r: 36, kind: 'works' },
    { s: 6900, u: H(0.42), r: 36, kind: 'broken' },
  ],

  crossings: [],
  parked: [],

  life: [
    { s: 3050, side: 1, dir: 1, span: 160 },
    { s: 3200, side: -1, dir: -1, span: 140 },
  ],

  traffic: [
    { s: 500, u: 60, speed: 120, dir: 1 },
    { s: 2200, u: -60, speed: 104, dir: -1 },
    { s: 3900, u: 56, speed: 132, dir: 1 },
    { s: 5500, u: -56, speed: 96, dir: -1 },
    { s: 7000, u: 62, speed: 116, dir: 1 },
  ],

  furniture: {
    drains: [800, 3000, 5200, 7400],
    signs: [[1000, 1, 'sign'], [4000, -1, 'sign'], [6600, 1, 'sign']],
  },

  landmarks: { gasholder: [120, -60, 50, 140], waterTower: [-260, 220], pylons: 6 },
  wet: 0,
};
