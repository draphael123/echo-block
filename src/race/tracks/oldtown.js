// THE OLD TOWN — the city's medieval quarter, up the hill behind the parade.
//
// The direct inverse of the Parade, and deliberately so. That track asks CAN
// YOU SEE FAR ENOUGH and answers it with a 216-voxel road; this one asks CAN
// YOU PLACE THE CAR and answers it with 120. Buildings come out to the kerb,
// the corners are tight and out of sequence, and the hill is steep enough that
// you arrive at things faster than you meant to.
//
// Lit throughout, because darkness is not the constraint here — width is. Using
// the same trick twice would make the second track a re-run of the first.
// 46, not 60. The assay measured the first version at 4.7 car widths of usable
// corridor -- wider than it sounds, because a car is only 26 voxels -- and
// reported the narrowness as set dressing, which it was. This is 3.5.
const HALF = 46;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'oldtown',
  name: 'The Old Town',
  blurb: 'narrow, steep, lit — the walls are the hazard',
  heading: 90,

  // A tighter cross-section all the way through: a real footway, but half of
  // what the Parade has, and almost no verge before the buildings start.
  asks: 'width',
  lapMetres: 359,
  road: { half: HALF, kerb: 4, pave: 30, verge: 6, apron: 4 },

  // Six legs and six corners, none of them ninety degrees. The closure solver
  // makes this shape possible at all — it could not be hand-derived the way
  // the rectangle was.
  shape: {
    free: [0, 6],
    ops: [
      { straight: 0 }, { arc: -70, r: 240 },
      { straight: 700 }, { arc: -55, r: 330 },
      { straight: 520 }, { arc: -95, r: 130 },    // the tightest corner in the city
      { straight: 0 }, { arc: -60, r: 290 },
      { straight: 640 }, { arc: -80, r: 205 },
    ],
  },

  legs: [
    { lit: true, name: 'market row', district: 'market' },
    { lit: true, name: 'the shambles', district: 'stone' },
    { lit: true, name: 'wall street', district: 'wall' },
    { lit: false, name: 'the mews', district: 'mews' },
    { lit: true, name: 'chapel hill', district: 'chapel' },
    { lit: true, name: 'the steps', district: 'stone' },
    { lit: false, name: 'back lane', district: 'mews' },
    { lit: true, name: 'the green', district: 'park' },
    { lit: true, name: 'gate hill', district: 'wall' },
    { lit: true, name: 'the descent', district: 'stone' },
  ],

  // Twice the Parade's relief over a third of the distance. A hill town.
  profile: [
    [0, 0], [420, 30], [860, 60], [1300, 78],
    [1800, 62], [2300, 26], [2800, -14], [3250, -30],
    [3700, -12], [4050, 10], [4330, 6],
  ],

  hazards: [
    { s: 520, u: H(0.62), r: 18, kind: 'works' },
    { s: 1420, u: H(-0.6), r: 20, kind: 'broken' },
    { s: 2280, u: H(0.58), r: 18, kind: 'skip' },
    { s: 3120, u: H(-0.62), r: 18, kind: 'works' },
    { s: 3900, u: H(0.6), r: 20, kind: 'broken' },
    { s: 4400, u: H(-0.58), r: 18, kind: 'works' },
  ],

  crossings: [960, 2640, 4180],
  parked: [[340, 1], [1180, -1], [1920, 1], [2900, -1], [3760, 1], [4520, -1]],

  life: [
    { s: 180, side: 1, dir: 1, span: 140 },
    { s: 300, side: -1, dir: -1, span: 120 },
    { s: 430, side: 1, dir: -1, span: 110 },
    { s: 560, side: -1, dir: 1, idle: true },
    { s: 880, side: 1, dir: 1, span: 130 },
    { s: 1180, side: -1, dir: -1, span: 140 },
    { s: 1600, side: 1, dir: 1, span: 120, pace: 44 },
    { s: 2100, side: -1, dir: 1, span: 130 },
    { s: 2500, side: 1, dir: -1, span: 120 },
    { s: 2900, side: -1, dir: -1, span: 140 },
  ],

  traffic: [
    { s: 400, u: 30, speed: 64, dir: 1 },
    { s: 1300, u: -30, speed: 58, dir: -1 },
    { s: 2400, u: 28, speed: 70, dir: 1 },
  ],

  furniture: {
    phone: [700], shelters: [[1900, -1]],
    benches: [[520, 1], [1620, -1], [2720, 1]],
    drains: [400, 1500, 2600],
    signs: [[300, 1, 'stop'], [1400, -1, 'sign'], [2800, 1, 'stop']],
  },

  landmarks: { waterTower: [40, 20], pylons: 0 },
  wet: 0,
};
