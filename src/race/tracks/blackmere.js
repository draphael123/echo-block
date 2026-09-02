// BLACKMERE — a frozen lake at full throttle, where braking is a rumor.
//
// The third winter circuit and the speed circuit: a huge, nearly wall-less
// bowl of black ice under the aurora. The whole surface rides the wet
// system at 0.75 (spec.iceGrip — same grip and brake penalties, glossy
// reflection, NO rain: it does not rain at minus twenty), so the ask is
// HOW EARLY DO YOU BRAKE WHEN BRAKES BARELY WORK. Spinning off costs
// time, not a crash — the snow banks are soft — and the lake answers
// with THE CRACKS: zones of ice that give way as the race wears it, one
// more each lap, so lap three's line cannot be lap one's.
//
// An icebreaker sits frozen mid-lake: the one landmark, the one narrows.
const HALF = 340;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'blackmere',
  name: 'Blackmere',
  blurb: 'black ice under the aurora — braking is a rumor, the cracks are a clock',
  heading: 200,
  reqTier: 2,

  asks: 'grip',
  lapMetres: 929,
  road: { half: HALF, kerb: 4, pave: 10, verge: 14, apron: 8 },
  field: 6,
  ground: 'ice',
  groundOuter: 'ice',

  shape: {
    free: [0, 6],
    ops: [
      { straight: 800 }, { arc: -70, r: 900 },
      { straight: 1100 }, { arc: -50, r: 800 },
      { straight: 900 }, { arc: -90, r: 700 },
      { straight: 700 }, { arc: -60, r: 860 },
      { straight: 800 }, { arc: -90, r: 740 },
    ],
  },

  legs: [
    { lit: false, name: 'the open mere', district: 'floe' },
    { lit: false, name: 'north sweep', district: 'floe' },
    { lit: false, name: 'the shallows', district: 'floe' },
    { lit: false, name: 'shoreline run', district: 'shoreline' },
    { lit: false, name: 'the icebreaker', district: 'floe' },
    { lit: false, name: 'far turn', district: 'shoreline' },
    { lit: false, name: 'the black mile', district: 'floe' },
    { lit: false, name: 'reed bend', district: 'floe' },
    { lit: false, name: 'home ice', district: 'floe' },
    { lit: false, name: 'last sweep', district: 'shoreline' },
  ],

  // a lake is the flattest thing there is
  profile: [[0, 0], [4000, 2], [8000, -2], [9200, 0]],

  // the whole surface is ice — grip via the wet system, no rain visuals
  iceGrip: 0.75,

  hazards: [
    { s: 1500, u: H(0.4), r: 34, kind: 'broken' },    // a pressure ridge on the line
    { s: 5900, u: H(-0.42), r: 34, kind: 'broken' },
    { s: 7800, u: H(0.44), r: 34, kind: 'broken' },
  ],

  // the icebreaker's flanks — its leg measures 4650-5550
  narrows: [{ from: 4950, to: 5210, width: 180 }],

  // THE CRACKS: one more wakes every lap (lap N opens crack N)
  cracks: [
    { s: 2400, u: -60, r: 50, lap: 1 },
    { s: 6300, u: 80, r: 54, lap: 1 },
    { s: 3700, u: 40, r: 50, lap: 2 },
    { s: 8300, u: -70, r: 56, lap: 2 },
  ],

  crossings: [],
  parked: [],
  life: [],
  traffic: [],
  moving: [],

  flair: { aurora: true, snow: true },

  sky: 'aurora',
  // aurora stock: greens bleeding into the highs, steel-blue shadow, the
  // cleanest grain — cold air holds no dust
  grade: { exposure: 1.50, highTint: [0.94, 1.06, 1.00], shadowTint: [0.70, 0.90, 1.05], grain: 0.024, bloom: 0.85 },
  ambience: 'wind',
  music: './music/blackmere.mp3',  // Silver Blue Light — K. MacLeod, CC BY 4.0
  laps: 3,

  landmarks: { pylons: 0 },
  surface: 'blackice',
  lampColor: '#bcd2ff',
  rivalBeam: 1.3,
  pads: [{ s: 1000 }, { s: 6800 }],
  ramps: [{ s: 3200, u: 50 }],     // one lip of shoved-up plate ice
  refLap: 45,                      // measured: racing laps 44.7 clean
  wet: 0,
};
