// THE RING ROAD — the city's bypass, and the only place you use all of the car.
//
// The question is WILL YOU COMMIT BLIND. Few corners and all of them fast, but
// the relief is savage: crests hide the road the way the dark does on the
// Parade, and that is the point — it is a variation on the sight mechanic
// rather than a repeat of it, because a crest hides things in daylight too.
//
// It is also where the lamps upgrade finally earns its money, and where the
// tunnels give the only sodium-lit stretch in the city.
// 140. It is the bypass; it should be the widest thing in the city and it
// was only sixteen voxels wider than the town road.
// the bypass, and it should feel like one
// 360, roughly doubled from 196 (playtest, 2026-09-01).
const HALF = 360;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'ring',
  name: 'The Ring Road',
  blurb: 'fast, blind crests, two tunnels',
  heading: 0,

  asks: 'crests',
  lapMetres: 698,
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
    { lit: false, name: 'the viaduct', district: 'viaduct', deck: -240, deckRamp: 260 },
    { lit: false, name: 'the flats', district: 'farm' },
    { lit: false, name: 'east sweep', district: 'motorway' },
    { lit: true, name: 'gate tunnel', district: 'tunnel' },
    { lit: false, name: 'the run in', district: 'yard' },
  ],

  // The big one. Nearly ten metres top to bottom, so crests genuinely hide the
  // road over them, which is the whole mechanic of this circuit.
  profile: [
    // SHARP, not swelling. The first version put 80 voxels of rise across a
    // thousand, which is a hill you can see over the whole way up; the assay
    // measured 3% of the lap as blind and called the crests scenery. These are
    // the same total relief gathered into shorter brows -- rise 40-ish over 400
    // -- which is what actually hides a road from a driver sitting 1.6m up.
    [0, 0], [420, 8], [820, 52], [1220, 16],
    [1900, 34], [2300, 80], [2700, 30],
    [3400, -14], [4000, -44], [4500, -16],
    [5000, 26], [5400, 72], [5800, 26],
    [6500, 44], [6900, 88], [7300, 40],
    [7900, 12], [8400, 4],
  ],

  // Half of these sit JUST PAST a brow, inside the measured blind zones
  // (348-600, 1824-2088, 4908-5196, 6432-6684 — where stopping distance
  // exceeds sight over the crest). The first set all sat on open road, so the
  // crests hid nothing that mattered and the sim called committing blind free:
  // RACING WON by 11 seconds. A crest is only a question if the answer can be
  // behind it. Same-side neighbours may sit close; opposite-side pairs keep
  // 420+ so the S-flick stays drivable (the Parade's lesson).
  hazards: [
    { s: 520, u: H(0.45), r: 34, kind: 'works' },
    { s: 1200, u: H(0.5), r: 34, kind: 'works' },
    { s: 2000, u: H(-0.46), r: 34, kind: 'spill' },
    { s: 2600, u: H(-0.46), r: 36, kind: 'broken' },
    { s: 4200, u: H(0.44), r: 34, kind: 'spill' },
    { s: 5060, u: H(-0.44), r: 36, kind: 'broken' },
    { s: 5400, u: H(-0.5), r: 36, kind: 'works' },
    { s: 6550, u: H(0.44), r: 34, kind: 'spill' },
    { s: 6900, u: H(0.42), r: 36, kind: 'broken' },
  ],

  crossings: [],
  parked: [[2900, 1], [3080, 1], [3260, 1], [3440, -1], [3620, -1]],

  // A bypass has nobody walking on it, and that is right -- but the SERVICES
  // does, and it was empty. This is the only place on the circuit with people.
  life: [
    { s: 2950, side: 1, dir: 1, span: 120 },
    { s: 3050, side: 1, dir: 1, span: 160 },
    { s: 3120, side: -1, dir: 1, idle: true },
    { s: 3200, side: -1, dir: -1, span: 140 },
    { s: 3320, side: 1, dir: -1, span: 130 },
    { s: 3450, side: -1, dir: 1, span: 150 },
  ],

  traffic: [
    { s: 500, u: 136, speed: 120, dir: 1 },
    { s: 1600, u: -136, speed: 104, dir: -1 },
    { s: 2800, u: 129, speed: 132, dir: 1 },
    { s: 3900, u: -129, speed: 96, dir: -1 },
    { s: 5000, u: 140, speed: 126, dir: 1 },
    { s: 6100, u: -140, speed: 110, dir: -1 },
    { s: 7200, u: 132, speed: 138, dir: 1 },
    { s: 8100, u: -132, speed: 100, dir: -1 },
  ],

  furniture: {
    drains: [800, 1900, 3000, 4100, 5200, 6300, 7400, 8300],
    signs: [[1000, 1, 'sign'], [2400, -1, 'sign'], [4000, -1, 'sign'],
            [5600, 1, 'sign'], [6600, 1, 'sign'], [7900, -1, 'sign']],
    benches: [[3100, 1], [3400, -1]],
  },

  landmarks: { gasholder: [120, -60, 50, 140], waterTower: [-260, 220], pylons: 6 },
  // Sodium, in the small hours. Everything orange except the sky, and the
  // thickest fog in the city -- which does the same job as the crests do:
  // it takes the distance away from you.
  sky: 'sodium',
  // The longest lap in the city at 698 metres — but also the fastest: two laps
  // was over in 68 seconds, half the length of any other race. "Three is a
  // slog" was written before there was a field to work through; with five cars
  // to pass, three is a race.
  laps: 3,
  // the measured clean racing-policy lap, which the purse pays pace against
  // the road's own face and the streetlight's own colour -- see ribbon()
  surface: 'motorway',
  lampColor: '#ff9226',
  refLap: 36,
  wet: 0,
};
