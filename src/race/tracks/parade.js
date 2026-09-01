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
// a grand prix grid needs six cars abreast, and a car is 26 voxels
// 280, roughly doubled from 150 (playtest, 2026-09-01): from the seat the
// road read narrow at speed. The dodge maths scale with it; the two
// opposite-side hazard pairs moved apart below because crossing distance
// scales with the road while the driver's lateral ratio does not.
const HALF = 280;

export default {
  id: 'parade',
  name: 'The Parade',
  blurb: 'the town edge, wide and half-lit',
  heading: 180,

  asks: 'sight',
  lapMetres: 515,
  road: { half: HALF, kerb: 5, pave: 52, verge: 14, apron: 6 },

  // Two straights left free; shape.js solves them so the loop closes exactly.
  // THE HOOK (2026-09-01): the unlit sweeper used to be one constant-radius
  // ninety — a corner you learn once and never think about again. It is now a
  // 50-degree r560 entry that TIGHTENS into a 45-degree r300 exit, all of it
  // in the dark, all of it in a hollow: the one corner on the circuit that
  // keeps coming after you have committed. Every circuit needs a corner with
  // a name; this is the Parade's.
  shape: {
    free: [5, 7],
    ops: [
      { straight: 1500 }, { arc: -90, r: 260 },
      { straight: 620 }, { arc: -50, r: 560 },
      { arc: -45, r: 300 },
      { straight: 0 }, { arc: -90, r: 340 },
      { straight: 0 }, { arc: -85, r: 440 },
    ],
  },

  // One district per leg, and no two legs share one.
  legs: [
    { lit: true, name: 'the parade', district: 'parade' },
    { lit: true, name: 'chapel corner', district: 'chapel' },
    { lit: false, name: 'mill lane', district: 'millyard' },
    { lit: false, name: 'the long dark', district: 'wood' },
    { lit: false, name: 'the hook', district: 'wood' },
    { lit: true, name: 'the crescent', district: 'crescent' },
    { lit: true, name: 'the top', district: 'park' },
    { lit: false, name: 'the cut', district: 'yard' },
    { lit: false, name: 'the last bend', district: 'farm' },
  ],

  // (s, voxels). A cosine between knots, so every knot is a crest or a dip
  // rather than a corner you can feel through the wheel. About 4.3 metres.
  // RELIEF PASS (2026-09-01): eight metres top to bottom, up from four, and
  // gathered into brows the way the Ring's lesson demands — rise 40-over-400
  // hides a road; rise 80-over-1000 is a hill you can see over the whole way
  // up. The long dark and the hook sit in a HOLLOW (the dark corner is also
  // the low corner), THE TOP is now literally that — a 74-voxel crest with
  // the park arc blind over its brow — and the cut plunges below grade the
  // way a cutting should.
  profile: [
    [0, 0], [700, 10], [1240, 22],
    [1700, 40],                  // the chapel on its knoll
    [2200, 8], [2520, -6],       // mill lane runs down off it
    [2850, -26],                 // the long dark, in the hollow
    [3150, -10],                 // the hook climbs as it tightens
    [3600, 18], [4100, 2], [4500, 20],   // the crescent rolls
    [4900, 64], [5170, 66],      // THE TOP — the big blind crest
    [5480, 30], [5790, -8],      // the cut falls away in two pitches, each
                                 // under the 22% grade audit (cosine peaks
                                 // at pi/2 times the average — knot maths)
    [5990, -8], [6250, 4], [6420, 0],
  ],

  // Six of nine on unlit legs, one of those mid-corner on the long dark.
  hazards: [
    { s: 700, u: H(HALF, 0.62), r: 30, kind: 'works' },
    // the chicane: two gates, a weave — see hazards() on why it is two entries
    { s: 1080, u: H(HALF, 0.42), r: 30, kind: 'chicane' },
    { s: 1440, u: H(HALF, -0.42), r: 30, kind: 'chicane' },
    { s: 2060, u: H(HALF, -0.30), r: 32, kind: 'skip' },
    { s: 2480, u: H(HALF, 0.34), r: 30, kind: 'works' },
    { s: 2900, u: H(HALF, -0.34), r: 34, kind: 'broken' },
    { s: 3320, u: H(HALF, 0.30), r: 30, kind: 'works' },
    { s: 4300, u: H(HALF, -0.55), r: 32, kind: 'skip' },
    { s: 5430, u: H(HALF, 0.34), r: 30, kind: 'works' },
    { s: 5850, u: H(HALF, -0.34), r: 34, kind: 'broken' },
    // 6180, not 6250: the new lap is 6435 long and a works barrier runs
    // span/2 past its anchor — at 6250 the tail wrapped the seam and lay
    // across the start straight
    { s: 6180, u: H(HALF, 0.28), r: 30, kind: 'works' },
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
    { s: 600, u: 100, speed: 92, dir: 1 },
    { s: 1750, u: -100, speed: 78, dir: -1 },
    { s: 2700, u: 94, speed: 104, dir: 1 },
    { s: 3900, u: -94, speed: 88, dir: -1 },
    { s: 4900, u: 104, speed: 112, dir: 1 },
    { s: 6050, u: -104, speed: 70, dir: -1 },
  ],

  // Street furniture, in track coordinates.
  furniture: {
    phone: [430], shelters: [[900, -1], [4100, 1]],
    benches: [[260, 1], [700, -1], [1150, 1], [3600, 1], [4400, -1], [4900, 1]],
    drains: [520, 1240, 3500, 4200, 5400],
    signs: [[1380, 1, 'stop'], [2480, -1, 'sign'], [5150, 1, 'sign'], [5790, -1, 'stop']],
  },

  // 11pm. This is the circuit the sight mechanic belongs to, so its dark has
  // to be genuinely dark; every other track moved off midnight, this one owns it.
  sky: 'midnight',
  laps: 3,

  landmarks: { gasholder: [60, -40, 46, 132], waterTower: [-210, 190], pylons: 4 },
  // the measured clean racing-policy lap, which the purse pays pace against
  // the road's own face and the streetlight's own colour -- see ribbon()
  surface: 'street',
  lampColor: '#ffa23c',
  // boost pads: neon chevrons on the straights — a reward line, not a shortcut
  pads: [{ s: 950 }, { s: 3550 }, { s: 4780 }],
  refLap: 40,
  wet: 0,
};
