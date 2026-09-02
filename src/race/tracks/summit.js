// THE SUMMIT — the Midnight League's own road.
//
// The fifth circuit is not another quarter of the town; it is the mountain
// ABOVE it. The interview verdict on the old fifth track was that a remix of
// the same city amplifies sameness — so this one trades everything the town
// circuits have: no buildings, no crowds, no traffic to speak of. What it has
// is ALTITUDE — a 130-voxel climb to a beacon and back down through the
// scree — the longest sight-lines in the game under the thinnest sky, and
// black ice where the road stops caring how good your tyres are.
//
// It unlocks with the midnight league (tier 2): the ladder's destination,
// not its first rung. It is deliberately NOT a Grand Prix round — seasons
// stay a four-round tour of the town; the mountain is what you drive when
// the town is finished with you.
const HALF = 240;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'summit',
  name: 'The Summit',
  blurb: 'the mountain above the town — thin air, black ice, one beacon',
  heading: 45,
  reqTier: 2,                       // midnight league only — the ladder's view

  asks: 'sight',
  lapMetres: 640,
  road: { half: HALF, kerb: 4, pave: 18, verge: 16, apron: 8 },
  field: 5,

  // A ridge loop: up one shoulder, across the crown, down through the scree.
  // Every arc keeps r >= 400 — the cross-section reaches ~290 and an arc
  // tighter than its own cross-section folds the inside lines (the grand
  // circuit's market hole taught that the hard way).
  shape: {
    free: [0, 8],
    ops: [
      { straight: 900 }, { arc: -70, r: 420 },
      { straight: 700 }, { arc: -55, r: 480 },
      { straight: 1100 }, { arc: -80, r: 400 },
      { straight: 600 }, { arc: -45, r: 520 },
      { straight: 800 }, { arc: -60, r: 440 },
      { straight: 500 }, { arc: -50, r: 460 },
    ],
  },

  legs: [
    { lit: true, name: 'the valley road', district: 'farm' },
    { lit: false, name: 'first climb', district: 'wood' },
    { lit: false, name: 'the pines', district: 'wood' },
    { lit: false, name: 'the elbow', district: 'wood' },
    { lit: false, name: 'the ramparts', district: 'crag' },
    { lit: false, name: 'the shoulder', district: 'crag' },
    { lit: false, name: 'the crown', district: 'crag' },
    { lit: true, name: 'the col', district: 'park' },
    { lit: false, name: 'the scree', district: 'dunes' },
    { lit: false, name: 'the moor', district: 'dunes' },
    { lit: false, name: 'the hollow', district: 'wood' },
    { lit: true, name: 'home bend', district: 'farm' },
  ],

  // THE CLIMB is the circuit. 130 voxels to the crown — every segment's
  // average grade stays near 5% so the cosine peaks (pi/2 times the average)
  // clear the 22% audit with room, and the descent falls in longer, faster
  // pitches than the climb, because coming down IS the reward.
  profile: [
    [0, 0], [800, 14], [1500, 38],
    [2300, 68], [3000, 96],
    [3700, 122], [4200, 130],      // THE CROWN — the beacon stands here
    [4700, 118],                   // the col holds the height a moment
    [5400, 84], [6200, 44],        // the scree falls away fast
    [7000, 14], [7600, 0],
  ],

  // Sparse by design: rockfall debris and scree spills, and the ICE — the
  // slicks read as frozen melt here, and the high ones sit exactly where
  // the racing line wants to be.
  hazards: [
    { s: 1500, u: H(0.5), r: 34, kind: 'broken' },     // rockfall off the pines
    { s: 3100, u: H(-0.48), r: 34, kind: 'spill' },    // scree across the ramparts
    { s: 5600, u: H(0.5), r: 36, kind: 'broken' },     // the scree's own debris
    { s: 6600, u: H(-0.46), r: 34, kind: 'spill' },
  ],
  // black ice: two on the crown where the melt refreezes, one in the hollow
  slicks: [
    { s: 3900, u: -40, r: 46 },
    { s: 4450, u: 50, r: 44 },
    { s: 6900, u: 0, r: 40 },
  ],

  crossings: [],
  parked: [],
  life: [],                        // nobody walks the mountain at midnight
  traffic: [
    { s: 2400, u: -90, speed: 70, dir: -1 },           // one lonely descent
  ],

  moving: [],
  // the AVIATION BEACON on the crown — the lighthouse builder wearing its
  // mountain uniform, twin beams sweeping the whole valley — and the col's
  // little viewpoint strings
  flair: {
    lighthouse: { s: 4200, u: -340 },
    lanterns: [4680],
  },

  sky: 'moonhigh',
  ambience: 'wind',
  music: './music/summit.mp3',     // Frozen Star — K. MacLeod, CC BY 4.0
  laps: 2,

  landmarks: { waterTower: [-260, 210], pylons: 5 },
  surface: 'street',
  lampColor: '#bcd2ff',            // cold high-altitude white, not the town's amber
  pads: [{ s: 900 }, { s: 5200 }],
  ramps: [{ s: 6100, u: 60 }],     // the scree's launch — downhill, flat out
  refLap: 35,                      // measured: racing policy laps 34.7 clean
  wet: 0,
};
