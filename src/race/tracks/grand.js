// THE GRAND CIRCUIT — every quarter of town in one lap, and the season finale.
//
// The other four circuits each own one question: sight, width, grip, crests.
// This one asks WHOLE-LAP JUDGEMENT: a kilometre of road that climbs through
// the town, falls to the harbour, and comes back over the highest crest in
// the game — so the question is not one corner, it is whether you can hold a
// plan across two minutes of changing road. Two laps, because the lap is the
// event; you should finish it knowing the names of the places it went.
//
// Fourteen legs. The tour: the boulevard up through the lit town, the chapel
// on its rise, the market, an S through the old wall, then the long dark
// FALLING to the water — the quay with its cranes and the swinging load, the
// hull canyon of the reach, the coal wharf — then the climb, the moor road
// with its level crossing, a sodium tunnel boring up through the hill, and
// THE CREST: the highest point in the city, blind, with a spill on the far
// side for anyone who commits without thinking. Services, gantry bend, line.
const HALF = 300;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'grand',
  name: 'The Grand Circuit',
  blurb: 'the whole town in one lap — the season finale',
  heading: 180,

  // Crests gate the finale and the reach narrows the middle, but the honest
  // answer is "everything": the assay's crest question is the closest fit.
  asks: 'crests',
  lapMetres: 984,
  road: { half: HALF, kerb: 5, pave: 52, verge: 14, apron: 6 },

  // The wall's arc is r420, not r240: the cross-section reaches 377 voxels
  // from the centreline, and an arc tighter than that FOLDS its inside
  // offsets past the arc centre — the ribbon writes a pitted mess and the
  // scrub digs holes cleaning it up. The radius must exceed the reach of
  // the widest thing built beside the road.
  shape: {
    free: [5, 10],
    ops: [
      { straight: 1200 }, { arc: -90, r: 320 },
      { straight: 650 }, { arc: 70, r: 420 },
      { arc: -80, r: 340 },
      { straight: 0 }, { arc: -60, r: 420 },
      { straight: 700 }, { arc: -90, r: 360 },
      { straight: 1800 }, { straight: 0 },
      { arc: -60, r: 500 },
      { straight: 620 }, { arc: -50, r: 560 },
    ],
  },

  legs: [
    { lit: true, name: 'the boulevard', district: 'parade' },
    { lit: true, name: 'chapel rise', district: 'chapel' },
    { lit: true, name: 'market row', district: 'market' },
    { lit: true, name: 'the wall', district: 'wall' },
    { lit: false, name: 'the long dark', district: 'wood' },
    { lit: true, name: 'the quay', district: 'quay' },
    // the ARC is the harbour bend and the STRAIGHT is the reach — the hull
    // canyon marches offset lines at ±344, and on an r420 arc the inside
    // line degenerates (scale 0.18, under the run() guard's 0.33) while the
    // outside one gaps. Hulls belong on straights; the docks' reach is one.
    { lit: false, name: 'harbour bend', district: 'sheds' },
    { lit: false, name: 'the reach', district: 'containers' },
    { lit: false, name: 'the climb', district: 'farm' },
    { lit: false, name: 'the moor road', district: 'farm' },
    { lit: true, name: 'hill tunnel', district: 'tunnel' },
    { lit: false, name: 'the crest', district: 'wood' },
    { lit: true, name: 'the services', district: 'services' },
    { lit: false, name: 'gantry bend', district: 'motorway' },
  ],

  // The relief showcase: 156 voxels — twelve and a half metres — from the
  // quay at water level to the crest above the tunnel. Town on the hill,
  // harbour below, and the finale climbs back over the top. Every pitch
  // stays under the 22% grade audit (cosine between knots peaks at pi/2
  // times the average slope).
  profile: [
    [0, 0], [600, 14], [1100, 30],
    [1500, 44],                    // chapel rise crests its knoll
    [2000, 34], [2350, 26],
    [2750, 18],                    // through the wall
    [3100, 0], [3340, -20],        // the long dark FALLS toward the water
    [3700, -52], [4400, -60], [5400, -56],   // the quay: water level
    [5800, -58],                   // the reach stays low
    [6400, -48],                   // coal wharf
    [7150, 4],                     // the climb
    [7800, 24], [8400, 38], [9000, 52],      // the moor road rises steadily
    [9700, 64], [10400, 88],       // the tunnel bores UP through the hill
    [10980, 96],                   // THE CREST — highest point in the game
    [11520, 40],                   // and the blind fall off it
    [11950, 16], [12200, 4],
  ],

  // Twelve, one of nearly every kind in the game — it is the finale — and
  // the cruellest one just past the crest, where only a lifted throttle
  // saves you. Opposite-side pairs keep 500+, the Parade's lesson; the
  // chicane is a PAIR of gates by design (see hazards() in track.js).
  hazards: [
    { s: 500, u: H(0.55), r: 32, kind: 'works' },
    { s: 1000, u: H(0.4), r: 30, kind: 'chicane' },
    { s: 1360, u: H(-0.4), r: 30, kind: 'chicane' },
    { s: 2050, u: H(-0.5), r: 28, kind: 'stall' },
    { s: 3100, u: H(0.45), r: 34, kind: 'broken' },
    { s: 3900, u: H(-0.45), r: 32, kind: 'crate' },
    { s: 4800, u: H(0.42), r: 32, kind: 'barrels' },
    { s: 6400, u: H(-0.42), r: 32, kind: 'crate' },
    { s: 8000, u: H(0.44), r: 34, kind: 'spill' },
    { s: 8700, u: H(-0.44), r: 36, kind: 'broken' },
    { s: 11090, u: H(0.4), r: 34, kind: 'spill' },      // just over the crest
    { s: 11600, u: H(-0.5), r: 32, kind: 'works' },
  ],

  crossings: [420, 1950, 2450, 11950],
  parked: [
    [300, 1], [540, -1], [820, 1],
    [1950, -1], [2150, 1], [2320, -1],
    [11350, 1], [11550, -1],
  ],

  life: [
    { s: 200, side: 1, dir: 1, span: 240 },
    { s: 480, side: -1, dir: -1, span: 260 },
    { s: 760, side: 1, dir: 1, span: 220 },
    { s: 1000, side: -1, dir: 1, idle: true },
    { s: 1060, side: -1, dir: 1, idle: true },
    { s: 1900, side: 1, dir: -1, span: 200 },
    { s: 2100, side: -1, dir: 1, span: 220 },
    { s: 2300, side: 1, dir: 1, span: 180 },
    { s: 2500, side: -1, dir: -1, span: 160 },
    { s: 3800, side: 1, dir: 1, span: 260 },     // dockers on the quay
    { s: 4300, side: 1, dir: -1, span: 240 },
    { s: 4800, side: -1, dir: 1, span: 220 },
    { s: 5100, side: 1, dir: 1, idle: true },
    { s: 11400, side: 1, dir: 1, span: 180 },    // the services forecourt
    { s: 11600, side: -1, dir: -1, span: 160 },
  ],

  traffic: [
    { s: 600, u: 110, speed: 96, dir: 1 },
    { s: 2200, u: -110, speed: 80, dir: -1 },
    { s: 4200, u: 115, speed: 108, dir: 1 },
    { s: 6300, u: -115, speed: 92, dir: -1 },
    { s: 8200, u: 110, speed: 118, dir: 1 },
    { s: 9900, u: -110, speed: 102, dir: -1 },
    { s: 11700, u: 115, speed: 88, dir: 1 },
  ],

  furniture: {
    phone: [700, 2250],
    shelters: [[900, -1], [2400, 1]],
    benches: [[350, 1], [1100, -1], [2050, 1], [11400, -1]],
    drains: [500, 1600, 2700, 4200, 6300, 8400, 11000, 12000],
    signs: [[1300, 1, 'sign'], [2800, -1, 'stop'], [6800, 1, 'sign'],
            [10550, 1, 'sign'], [12050, -1, 'sign']],
  },

  landmarks: { gasholder: [180, -80, 54, 160], waterTower: [-320, 260], pylons: 8 },

  // BOTH moving set pieces, because the finale earns them: the crane load
  // swings over the quay, and the moor road has its level crossing.
  moving: [{ kind: 'craneload', s: 4400 }, { kind: 'crossing', s: 8200 }],

  // A high full moon and the clearest air in the city — a kilometre of road
  // you are allowed to read all the way down. See skies.js.
  sky: 'moonhigh',
  // Two laps of 984 metres. The lap is the event.
  laps: 2,

  surface: 'street',
  lampColor: '#dce6ff',
  pads: [{ s: 1150 }, { s: 5200 }, { s: 8900 }, { s: 12100 }],
  // measured: racing policy lapped 59.9 with two hits on the first build;
  // 58 is the clean reference the purse and medals pay against
  refLap: 58,
  wet: 0,
};
