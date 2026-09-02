// THE SUMMIT, v2 — the mountain that earns its name.
//
// The first cut was a polite ridge loop: fast sweepers, gentle grades, grass
// past the verges, and a lighthouse that had wandered up from the coast. The
// playtest called it boring and it was. This is the rework: SWITCHBACKS —
// three genuine hairpins stacked up the face — a climb that takes most of
// the lap to 214 voxels of altitude, then a descent that gives it all back
// in two fast pitches. Snow everywhere the road isn't (spec.ground does the
// verges and the far field). And the mountain's own set pieces: snowmen at
// the roadside, blue ice pillars, ICE boulders coming off the ramparts, a
// weather mast blinking red on the crown.
//
// It unlocks with the midnight league (tier 2) and never appears in GP
// seasons — the ladder's destination, not its fourth lap.
const HALF = 190;                  // a real mountain road: narrow
const H = (f) => Math.round(HALF * f);

export default {
  id: 'summit',
  name: 'The Summit',
  blurb: 'switchbacks up the mountain, then the long fall home',
  heading: 45,
  reqTier: 2,

  asks: 'sight',
  lapMetres: 626,
  road: { half: HALF, kerb: 4, pave: 12, verge: 16, apron: 8 },
  field: 5,
  ground: 'snow',

  // Three hairpins up (the switchbacks), the crown, then a fast fall: the
  // arcs alternate sign like a real pass road and still sum to -360. Every
  // hairpin keeps r >= 270 against a ~240 cross-section reach, which is the
  // margin that stops inside lines folding.
  // THE "D". The hairpin ladder climbs the flat side — three switchbacks
  // stacked, parallel, never crossing — and the descent swings around the
  // round side in two huge fast arcs that stay geometrically wide of the
  // ladder's whole rectangle. Two earlier drafts let the descent cross back
  // over the climb (a 52-voxel pit in the carriageway, 42 wedges a lap);
  // this topology cannot.
  shape: {
    free: [0, 8],
    ops: [
      { straight: 800 }, { arc: -160, r: 280 },    // first switchback
      { straight: 500 }, { arc: 150, r: 280 },     // second, the other way
      { straight: 500 }, { arc: -160, r: 280 },    // third, the steepest
      { straight: 900 }, { arc: -95, r: 520 },     // the crown curve
      { straight: 1600 }, { arc: -95, r: 560 },    // the long fall home
    ],
  },

  legs: [
    { lit: true, name: 'the valley road', district: 'firs' },
    { lit: false, name: 'first switchback', district: 'crag' },
    { lit: false, name: 'the ramp', district: 'snowfield' },
    { lit: false, name: 'second switchback', district: 'crag' },
    { lit: false, name: 'the ladder', district: 'firs' },
    { lit: false, name: 'third switchback', district: 'crag' },
    { lit: false, name: 'the crown', district: 'snowfield' },
    { lit: false, name: 'the shoulder', district: 'crag' },
    { lit: false, name: 'the long fall', district: 'firs' },
    { lit: true, name: 'home sweep', district: 'snowfield' },
  ],

  // UP the ladder for four legs, the crown holds the height, then the long
  // fall gives back all 214 voxels in two fast pitches. Measured against the
  // built sections (climb 0-4150, crown 4150-5050, fall 5050-7820).
  profile: [
    [0, 0], [850, 52], [1640, 106], [2450, 152], [3100, 184], [3900, 210],
    [4450, 214], [5050, 204],
    [5600, 168], [6200, 104], [6900, 36], [7500, 4], [7820, 0],
  ],

  hazards: [
    { s: 1750, u: H(0.5), r: 34, kind: 'broken' },     // rockfall debris on the ramp
    { s: 3150, u: H(-0.48), r: 34, kind: 'spill' },    // scree across the ladder
    { s: 6100, u: H(0.5), r: 36, kind: 'broken' },     // the fall's own debris
    { s: 6600, u: H(-0.46), r: 34, kind: 'spill' },
  ],
  // black ice: the crown's refrozen melt, and one in the fall's shade
  slicks: [
    { s: 4400, u: -30, r: 44 },
    { s: 4850, u: 40, r: 46 },
    { s: 6350, u: 0, r: 40 },
  ],

  // the col pinches between rock retaining walls at the top of the world
  narrows: [{ from: 4600, to: 4840, width: 128, style: 'rock' }],
  whiteout: { from: 3900, to: 4900 },

  crossings: [],
  parked: [],
  life: [],
  traffic: [
    { s: 400, u: -70, speed: 70, dir: -1 },
  ],

  // TWO ice falls: one off the second switchback's face, one off the
  // shoulder — the mountain throwing things at both halves of the lap
  moving: [
    { kind: 'rockfall', s: 2500, ice: true },
    { kind: 'rockfall', s: 5500, ice: true },
  ],

  flair: {
    mast: { s: 4450, u: -300 },    // the crown's blinking red heartbeat
    lanterns: [4700],              // the col's hut strings
    snow: true,
  },

  sky: 'moonhigh',
  grade: { exposure: 1.50, highTint: [0.99, 1.03, 1.10], shadowTint: [0.70, 0.87, 1.16], grain: 0.022, bloom: 0.72 },
  ambience: 'wind',
  music: './music/summit.mp3',     // Frozen Star — K. MacLeod, CC BY 4.0
  laps: 2,

  landmarks: { pylons: 5 },
  surface: 'alpine',
  lampColor: '#bcd2ff',
  pads: [{ s: 900 }, { s: 5950 }],
  ramps: [{ s: 6300, u: 55 }],     // the long fall's launch
  refLap: 44,                      // measured: racing laps 43.5 clean
  wet: 0,
};
