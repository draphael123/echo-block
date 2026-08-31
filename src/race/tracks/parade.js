// THE PARADE — the first circuit, and the town's own edge.
//
// 522 metres, wide and fast, half of it unlit. The question it asks is CAN YOU
// SEE FAR ENOUGH: your beam reaches 280 voxels and stopping from top speed
// takes 297, so on the lit half the streetlights do the seeing for you and on
// the unlit half they do not.
//
// Four different corners, because four identical ones is one braking decision
// learned once and repeated. R1 is a 260 hairpin, R2 a 520 sweeper that is
// unlit and therefore the one you commit to on faith.
const H = (half, f) => Math.round(half * f);
const HALF = 108;

export default {
  id: 'parade',
  name: 'The Parade',
  blurb: 'the town edge, wide and half-lit',
  heading: 180,

  asks: 'sight',
  lapMetres: 522,
  road: { half: HALF, kerb: 5, pave: 52, verge: 14, apron: 6 },

  // Two straights left free; shape.js solves them so the loop closes exactly.
  shape: {
    free: [4, 6],
    ops: [
      { straight: 1500 }, { arc: -90, r: 260 },
      { straight: 620 }, { arc: -90, r: 520 },
      { straight: 0 }, { arc: -90, r: 340 },
      { straight: 0 }, { arc: -90, r: 440 },
    ],
  },

  // One district per leg, and no two legs share one.
  legs: [
    { lit: true, name: 'the parade', district: 'parade' },
    { lit: true, name: 'chapel corner', district: 'chapel' },
    { lit: false, name: 'mill lane', district: 'mill' },
    { lit: false, name: 'the long dark', district: 'wood' },
    { lit: true, name: 'the crescent', district: 'crescent' },
    { lit: true, name: 'the top', district: 'park' },
    { lit: false, name: 'the cut', district: 'yard' },
    { lit: false, name: 'the last bend', district: 'farm' },
  ],

  // (s, voxels). A cosine between knots, so every knot is a crest or a dip
  // rather than a corner you can feel through the wheel. About 4.3 metres.
  profile: [
    [0, 0], [760, 12],
    [1500, 30], [1910, 34],     // the parade climbs to the chapel
    [2530, 4], [2950, -20],     // and drops away into a hollow on the sweeper
    [3350, -2], [4020, 26],     // a crest you cannot see the exit over
    [4690, 10], [5220, 22],
    [5700, -14], [5980, -8],    // the cut is a cutting, so it is below everything
    [6250, 8],
  ],

  // Six of nine on unlit legs, one of those mid-corner on the long dark.
  hazards: [
    { s: 700, u: H(HALF, 0.62), r: 30, kind: 'works' },
    { s: 2060, u: H(HALF, -0.30), r: 32, kind: 'skip' },
    { s: 2330, u: H(HALF, 0.34), r: 30, kind: 'works' },
    { s: 2900, u: H(HALF, -0.34), r: 34, kind: 'broken' },
    { s: 3190, u: H(HALF, 0.30), r: 30, kind: 'works' },
    { s: 4300, u: H(HALF, -0.55), r: 32, kind: 'skip' },
    { s: 5430, u: H(HALF, 0.34), r: 30, kind: 'works' },
    { s: 5700, u: H(HALF, -0.34), r: 34, kind: 'broken' },
    { s: 6150, u: H(HALF, 0.28), r: 30, kind: 'works' },
  ],

  // Kept clear of the parking bays, or a crosser baulks mid-road.
  crossings: [480, 1240, 3620, 4260, 5010],

  // On the parade and in the crescent, because those are the legs where
  // somebody lives. Nobody parks on the sweeper.
  parked: [
    [300, 1], [620, -1], [980, 1], [1120, -1], [1330, 1],
    [2170, -1],
    [3480, 1], [3760, -1], [4060, 1], [4380, -1], [4560, 1],
  ],

  // pace: how fast they walk. idle: standing, facing the road.
  life: [
    { s: 200, side: 1, dir: 1, span: 260 },
    { s: 520, side: -1, dir: -1, span: 280 },
    { s: 780, side: 1, dir: -1, span: 240 },
    { s: 900, side: -1, dir: 1, idle: true },
    { s: 935, side: -1, dir: 1, idle: true },
    { s: 1060, side: -1, dir: 1, span: 220 },
    { s: 1330, side: 1, dir: 1, span: 200, pace: 46 },
    { s: 1660, side: 1, dir: 1, span: 180 },
    { s: 1840, side: -1, dir: -1, span: 160 },
    { s: 2170, side: -1, dir: -1, span: 300 },      // walking home past the mill
    { s: 3460, side: 1, dir: 1, span: 280 },
    { s: 3780, side: -1, dir: -1, span: 300 },
    { s: 4080, side: 1, dir: -1, span: 260 },
    { s: 4110, side: 1, dir: 1, idle: true },
    { s: 4420, side: -1, dir: 1, span: 240 },
    { s: 4640, side: 1, dir: -1, span: 220, pace: 52 },
    { s: 4880, side: -1, dir: -1, span: 200 },
    { s: 5080, side: 1, dir: 1, span: 180 },
  ],

  traffic: [
    { s: 600, u: 54, speed: 92, dir: 1 },
    { s: 1750, u: -54, speed: 78, dir: -1 },
    { s: 2700, u: 50, speed: 104, dir: 1 },
    { s: 3900, u: -50, speed: 88, dir: -1 },
    { s: 4900, u: 56, speed: 112, dir: 1 },
    { s: 6050, u: -56, speed: 70, dir: -1 },
  ],

  // Street furniture, in track coordinates.
  furniture: {
    phone: [430], shelters: [[900, -1], [4100, 1]],
    benches: [[260, 1], [700, -1], [1150, 1], [3600, 1], [4400, -1], [4900, 1]],
    drains: [520, 1240, 3500, 4200, 5400],
    signs: [[1380, 1, 'stop'], [2480, -1, 'sign'], [5150, 1, 'sign'], [5790, -1, 'stop']],
  },

  landmarks: { gasholder: [60, -40, 46, 132], waterTower: [-210, 190], pylons: 4 },
  wet: 0,
};
