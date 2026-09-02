// THE PLOW ROAD — in a blizzard, the racing line is wherever the plows
// have been.
//
// The second winter circuit, and the novel one: a drifted-over bypass
// where two snowplows carve the only drivable channels and keep carving
// them, all race long. Off the channels you WADE — deep-snow drag, not a
// wall — so the ask is CAN YOU READ A LINE THAT MOVES: the channels are
// fixed but the PLOWS crawl them, and passing one means wading the white
// between the lanes and coming back on.
//
// The squall sky has no landmarks; the depot's sodium masts and the plows'
// own work lights are the only things that glow.
const HALF = 300;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'plowroad',
  name: 'The Plow Road',
  blurb: 'a blizzard, two carved channels, and the plows that own them',
  heading: 315,
  reqTier: 2,

  asks: 'crests',
  lapMetres: 1055,
  road: { half: HALF, kerb: 4, pave: 16, verge: 20, apron: 8 },
  field: 5,
  ground: 'snow',
  groundOuter: 'snow',

  // The free straights solve LARGE with sweeps this gentle — authored
  // lengths stay small or the lap balloons (the first cut hit 1.8km).
  shape: {
    free: [0, 6],
    ops: [
      { straight: 500 }, { arc: -60, r: 800 },
      { straight: 400 }, { arc: -50, r: 700 },
      { straight: 600 }, { arc: -80, r: 560 },
      { straight: 400 }, { arc: -70, r: 640 },
      { straight: 500 }, { arc: -100, r: 480 },
    ],
  },

  legs: [
    { lit: false, name: 'the white mile', district: 'drifts' },
    { lit: false, name: 'first sweep', district: 'drifts' },
    { lit: false, name: 'the firs', district: 'firs' },
    { lit: false, name: 'long bend', district: 'drifts' },
    { lit: true, name: 'the depot', district: 'depot' },
    { lit: true, name: 'depot curve', district: 'depot' },
    { lit: false, name: 'the moor', district: 'drifts' },
    { lit: false, name: 'far sweep', district: 'firs' },
    { lit: false, name: 'the home run', district: 'drifts' },
    { lit: false, name: 'last sweep', district: 'drifts' },
  ],

  // rolling ground under the snow — enough to hide a plow behind a rise.
  // (total 13194; white mile 0-3901, firs 4738-5138, depot 5749-7131,
  // the moor 7131-11074, home 11856-13194)
  profile: [
    [0, 0], [1200, 18], [2000, 4], [3400, 26], [4400, 8],
    [5700, 20], [6600, 2], [8200, 24], [9600, 6],
    [11000, 20], [12300, 8], [13000, 4],
  ],

  // THE CHANNELS: the only tarmac. Off them, runtime drag in main.js.
  snowRoad: { channels: [-80, 80], half: 38 },
  // the rivals drive the channels too, or they'd wade the whole race
  lineUs: [-80, 80],
  // one long gust corridor — the squall leaning hardest where the moor opens
  whiteout: { from: 8000, to: 10600 },

  hazards: [
    { s: 1800, u: H(0.44), r: 32, kind: 'broken' },   // something under the white
    { s: 3300, u: H(-0.46), r: 32, kind: 'spill' },
    { s: 6000, u: H(0.5), r: 30, kind: 'works' },     // the depot's own dig
    { s: 8600, u: H(-0.44), r: 32, kind: 'broken' },
    { s: 10200, u: H(0.46), r: 32, kind: 'spill' },
  ],

  crossings: [],
  parked: [],
  life: [],                        // the road is CLOSED; that is the point
  traffic: [],

  moving: [{ kind: 'plows', s: 0, us: [-80, 80] }],

  flair: { snow: true },

  sky: 'squall',
  // blizzard stock: white-grey everything, the heaviest grain in the game
  grade: { exposure: 1.42, highTint: [1.00, 1.00, 1.02], shadowTint: [0.80, 0.86, 1.00], grain: 0.050, bloom: 0.7 },
  ambience: 'wind',
  music: './music/plowroad.mp3',   // Firebrand — K. MacLeod, CC BY 4.0
  laps: 3,

  landmarks: { pylons: 4 },
  surface: 'plowed',
  lampColor: '#ff9226',
  rivalBeam: 1.4,
  pads: [{ s: 2500 }, { s: 9200 }],
  ramps: [],
  refLap: 54,                      // measured: racing laps 53.9
  wet: 0,
};
