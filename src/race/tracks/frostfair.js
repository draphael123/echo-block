// THE FROST FAIR — Echo Block's river froze, so the town moved onto it.
//
// The first of the winter circuits, and the continuity play: this is the
// same town you race through all season, in a cold snap hard enough that
// the river is a road. Market stalls and braziers line the banks, the
// town's windows glow above the embankment walls, stone bridges carry the
// streets overhead — and the racing surface is RIVER ICE with one gritted
// line of ash down the middle. The ask: CAN YOU PLACE THE CAR when the
// only grip is a strip five metres wide and every shortcut is glass.
//
// Cold first light — the fair ran all night and you are racing before the
// town wakes. The one circuit in the game with a sky you can see by.
const HALF = 210;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'frostfair',
  name: 'The Frost Fair',
  blurb: 'the river froze, the town moved onto it — grip lives on the grit',
  heading: 135,
  reqTier: 2,

  asks: 'width',
  lapMetres: 620,
  road: { half: HALF, kerb: 4, pave: 24, verge: 12, apron: 6 },
  field: 5,
  ground: 'snow',
  groundOuter: 'snow',

  // A river's loop: one-directional, radii wandering the way water does.
  shape: {
    free: [0, 8],
    ops: [
      { straight: 700 }, { arc: -55, r: 420 },
      { straight: 500 }, { arc: -35, r: 560 },
      { straight: 800 }, { arc: -70, r: 360 },
      { straight: 600 }, { arc: -45, r: 500 },
      { straight: 900 }, { arc: -65, r: 380 },
      { straight: 500 }, { arc: -50, r: 460 },
      { straight: 600 }, { arc: -40, r: 520 },
    ],
  },

  legs: [
    { lit: true, name: 'the old quay', district: 'quayside' },
    { lit: true, name: 'mill bend', district: 'quayside' },
    { lit: true, name: 'the fair', district: 'fairstalls' },
    { lit: true, name: 'lantern turn', district: 'fairstalls' },
    { lit: false, name: 'the long reach', district: 'quayside' },
    { lit: true, name: 'bridge bend', district: 'span' },
    { lit: true, name: 'the rink', district: 'fairstalls' },
    { lit: false, name: "skater's corner", district: 'quayside' },
    { lit: false, name: 'the frozen mile', district: 'quayside' },
    { lit: true, name: 'chapel bend', district: 'quayside' },
    { lit: true, name: 'the second fair', district: 'fairstalls' },
    { lit: true, name: 'brazier turn', district: 'fairstalls' },
    { lit: true, name: 'home water', district: 'quayside' },
    { lit: true, name: 'the weir', district: 'span' },
  ],

  // A river is flat. That IS the profile.
  profile: [[0, 0], [2000, 3], [4000, -2], [6000, 2], [7400, 0]],

  // THE GRIT LINE: |u| beyond 50 is glass — runtime in main.js
  iceRoad: { gritHalf: 50 },

  hazards: [
    { s: 800, u: H(0.5), r: 28, kind: 'stall' },      // chestnuts, on the ice
    { s: 1900, u: H(-0.44), r: 30, kind: 'broken' },  // rough refreeze
    { s: 3100, u: H(0.46), r: 30, kind: 'crate' },    // the fair's stores
    { s: 4400, u: H(-0.5), r: 28, kind: 'stall' },
    { s: 5600, u: H(0.44), r: 30, kind: 'broken' },
    { s: 6700, u: H(-0.46), r: 30, kind: 'crate' },
  ],

  crossings: [],
  parked: [],
  life: [],                        // the fair's people are the SKATERS
  traffic: [],

  moving: [
    { kind: 'skaters', s: 3550 },
    { kind: 'skaters', s: 6250 },
  ],

  flair: {
    lanterns: [900, 2400, 4600, 6500],
    embers: 'fairstalls',          // sparks off every brazier
    bell: true,                    // the town's church, over the water
  },

  sky: 'dawn',
  // pale ice-morning stock: barely-warm highs, blue shadow, clean grain
  grade: { exposure: 1.35, highTint: [1.04, 1.00, 0.96], shadowTint: [0.72, 0.84, 1.08], grain: 0.030, bloom: 0.9 },
  ambience: 'crowd',
  music: './music/frostfair.mp3',  // Dance of the Sugar Plum Fairy — K. MacLeod, CC BY 4.0
  laps: 3,

  landmarks: { pylons: 0 },
  surface: 'rink',
  lampColor: '#ffd9a0',
  pads: [{ s: 1200 }, { s: 5200 }],
  ramps: [],                       // nobody builds a ramp on a river
  refLap: 40,                      // measured: racing laps 39.6 clean
  wet: 0,
};
