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
// 76.
//
// This has now been 60 (measured as set dressing), then 46 (measured as "you
// have to aim it"), and 46 is WRONG -- it drove like a corridor. The assay was
// right that 60 asked nothing and wrong about what to do next, because its
// threshold was a number I invented rather than one anybody had driven. A
// playtest beats an instrument whose scale has never been calibrated.
//
// 152 voxels is 12.2 metres: narrower than the Parade's 17 by enough to feel
// like an old town, wide enough to race two cars down.
// NARROWED BACK, deliberately, and at the cost of the field.
//
// 108 came from one decision -- double every road so six cars fit -- applied to
// four tracks without asking what each of them was for. On three it was right.
// Here it took the circuit's only mechanic away: the assay measured 8.4 car
// widths and called the narrowness set dressing, which is exactly what it said
// about 60 two revisions ago. A road that fits six abreast with room to fight
// is not a medieval street, and no amount of stonework makes it one.
//
// So the width goes back and the ENTRY LIST shrinks instead. Four cars on a
// 152-voxel road is close racing; six is a queue. That is the honest trade and
// it is a per-track one -- see `field` below.
// 130, up from 76 (playtest, 2026-09-01): the whole city's roads widened
// roughly 2x; the Old Town keeps LESS than the full doubling so it is
// still visibly the narrow one -- 130 against the Parade's 280. The width
// assay's calibration moved with it (see assay.js).
const HALF = 130;
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
  road: { half: HALF, kerb: 4, pave: 34, verge: 8, apron: 5 },

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
    { lit: true, name: 'market row', district: 'markethall' },
    { lit: true, name: 'the shambles', district: 'stone' },
    { lit: true, name: 'wall street', district: 'wall' },
    { lit: false, name: 'the mews', district: 'mews' },
    { lit: true, name: 'chapel hill', district: 'chapel' },
    { lit: true, name: 'the steps', district: 'stone' },
    { lit: false, name: 'back lane', district: 'mews' },
    { lit: true, name: 'the green', district: 'park' },
    { lit: true, name: 'the gatehouse', district: 'gatehouse' },
    { lit: true, name: 'the descent', district: 'stone' },
  ],

  // Twice the Parade's relief over a third of the distance. A hill town.
  profile: [
    [0, 0], [420, 30], [860, 60], [1300, 78],
    [1800, 62], [2300, 26], [2800, -14], [3250, -30],
    [3700, -12], [4050, 10], [4330, 6],
  ],

  hazards: [
    { s: 520, u: H(0.6), r: 26, kind: 'works' },
    { s: 1180, u: H(-0.58), r: 28, kind: 'broken' },
    { s: 1900, u: H(0.56), r: 26, kind: 'stall' },
    { s: 2600, u: H(-0.6), r: 26, kind: 'chicane' },
    { s: 3320, u: H(0.58), r: 28, kind: 'broken' },
    { s: 4050, u: H(-0.56), r: 26, kind: 'stall' },
  ],

  crossings: [700, 1560, 2400, 3240, 4020],
  parked: [
    [240, 1], [340, -1], [620, 1], [900, -1], [1180, 1], [1460, -1],
    [1780, 1], [1920, -1], [2280, 1], [2600, -1], [2900, 1], [3180, -1],
    [3460, 1], [3760, -1], [4080, 1], [4340, 1], [4520, -1],
  ],

  life: [
    { s: 180, side: 1, dir: 1, span: 140 },
    { s: 300, side: -1, dir: -1, span: 120 },
    { s: 430, side: 1, dir: -1, span: 110 },
    { s: 560, side: -1, dir: 1, idle: true },
    { s: 600, side: -1, dir: 1, idle: true },
    { s: 720, side: 1, dir: 1, span: 130 },
    { s: 880, side: 1, dir: 1, span: 130 },
    { s: 1010, side: -1, dir: -1, span: 150 },
    { s: 1180, side: -1, dir: -1, span: 140 },
    { s: 1340, side: 1, dir: 1, span: 120 },
    { s: 1600, side: 1, dir: 1, span: 120, pace: 44 },
    { s: 1820, side: -1, dir: 1, span: 140 },
    { s: 2100, side: -1, dir: 1, span: 130 },
    { s: 2320, side: 1, dir: -1, span: 150 },
    { s: 2500, side: 1, dir: -1, span: 120 },
    { s: 2680, side: -1, dir: 1, idle: true },
    { s: 2900, side: -1, dir: -1, span: 140 },
    { s: 3150, side: 1, dir: 1, span: 130, pace: 50 },
    { s: 3400, side: -1, dir: -1, span: 140 },
    { s: 3700, side: 1, dir: 1, span: 120 },
    { s: 3980, side: -1, dir: 1, span: 130 },
    { s: 4250, side: 1, dir: -1, span: 140 },
  ],

  traffic: [
    { s: 400, u: 72, speed: 64, dir: 1 },
    { s: 1300, u: -72, speed: 58, dir: -1 },
    { s: 2400, u: 68, speed: 70, dir: 1 },
    { s: 3200, u: -68, speed: 66, dir: -1 },
    { s: 4100, u: 75, speed: 72, dir: 1 },
  ],

  furniture: {
    phone: [700, 3100], shelters: [[1900, -1], [3600, 1]],
    benches: [[520, 1], [980, -1], [1620, -1], [2160, 1], [2720, 1], [3400, -1], [4100, 1]],
    drains: [400, 1100, 1500, 2200, 2600, 3300, 4000, 4400],
    signs: [[300, 1, 'stop'], [1400, -1, 'sign'], [2200, 1, 'sign'], [2800, 1, 'stop'], [3900, -1, 'sign']],
  },

  landmarks: { waterTower: [40, 20], pylons: 0 },
  // Dusk over the medieval quarter. The narrow streets read as silhouettes cut
  // out of a bright western sky -- which is what an old town at sunset looks
  // like and nothing like the Parade, on the same palette and the same props.
  sky: 'dusk',
  // The shortest lap in the city, so it gets an extra one. Three laps of 359
  // metres is over in ninety seconds; four makes it a race rather than a lap.
  laps: 4,
  // Four, not six. The other three circuits take the full grid.
  field: 4,
  // the measured clean racing-policy lap, which the purse pays pace against
  // the road's own face and the streetlight's own colour -- see ribbon()
  surface: 'cobble',
  lampColor: '#ffc776',
  // boost pads
  pads: [{ s: 980 }, { s: 2950 }],
  refLap: 34,
  wet: 0,
};
