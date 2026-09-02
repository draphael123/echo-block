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
  lapMetres: 510,
  road: { half: HALF, kerb: 4, pave: 34, verge: 8, apron: 5 },

  // Six legs and six corners, none of them ninety degrees. The closure solver
  // makes this shape possible at all — it could not be hand-derived the way
  // the rectangle was.
  // STRETCHED (playtest, 2026-09-01): more street between the walls —
  // anchors re-measured against the rebuild below.
  shape: {
    free: [0, 6],
    ops: [
      { straight: 0 }, { arc: -70, r: 240 },
      { straight: 1100 }, { arc: -55, r: 330 },
      { straight: 850 }, { arc: -95, r: 130 },    // the tightest corner in the city
      { straight: 0 }, { arc: -60, r: 290 },
      { straight: 1000 }, { arc: -80, r: 205 },
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
  // Re-laid for the stretched lap (total 6371; sections: market row 0-779
  // ROOFED, shambles 779-1072, wall street 1072-2172, mews 2172-2489,
  // chapel hill 2489-3339, THE STEPS 3339-3554, back lane 3554-4781,
  // green 4781-5084, gatehouse 5084-6084 ROOFED, descent 6084-6371).
  // The verticality stays: the crest tops wall street at 84 and THE STEPS
  // drop 30 voxels in 240 — segment ~12.5%, cosine peak ~20%, right at the
  // edge of the audit, which is what "steep" should mean.
  profile: [
    [0, 0], [600, 26], [1100, 52], [1700, 78], [2200, 84],
    [2700, 58], [3100, 28], [3320, 12], [3560, -18], [3900, -30],
    [4400, -24], [4900, -8], [5400, 8], [6000, 10], [6300, 4],
  ],

  hazards: [
    { s: 650, u: H(0.6), r: 26, kind: 'works' },     // market row
    { s: 1600, u: H(-0.58), r: 28, kind: 'broken' }, // wall street
    { s: 2700, u: H(0.56), r: 26, kind: 'stall' },   // chapel hill
    // no chicane here, deliberately: on a 130-half road the dodge line a
    // bollard gate demands IS the wall, and the walls are already this
    // circuit's hazard. The chicane lives on the wide roads instead.
    { s: 3900, u: H(-0.6), r: 26, kind: 'works' },   // back lane
    { s: 4500, u: H(0.58), r: 28, kind: 'broken' },
    { s: 4950, u: H(-0.56), r: 26, kind: 'stall' },  // the green
  ],

  crossings: [700, 1560, 2900, 4300, 4950],
  parked: [
    [240, 1], [340, -1], [620, 1], [1000, -1], [1400, 1], [1800, -1],
    [2100, 1], [2350, -1], [2700, 1], [3000, -1], [3700, 1], [4000, -1],
    [4300, 1], [4600, -1], [4900, 1], [6150, 1], [6300, -1],
  ],

  life: [
    { s: 180, side: 1, dir: 1, span: 140 },
    { s: 300, side: -1, dir: -1, span: 120 },
    { s: 430, side: 1, dir: -1, span: 110 },
    { s: 560, side: -1, dir: 1, idle: true },
    { s: 600, side: -1, dir: 1, idle: true },
    { s: 850, side: 1, dir: 1, span: 130 },
    { s: 1000, side: 1, dir: 1, span: 130 },
    { s: 1250, side: -1, dir: -1, span: 150 },
    { s: 1500, side: -1, dir: -1, span: 140 },
    { s: 1750, side: 1, dir: 1, span: 120 },
    { s: 2000, side: 1, dir: 1, span: 120, pace: 44 },
    { s: 2300, side: -1, dir: 1, span: 140 },
    { s: 2650, side: -1, dir: 1, span: 130 },
    { s: 2900, side: 1, dir: -1, span: 150 },
    { s: 3100, side: 1, dir: -1, span: 120 },
    { s: 3250, side: -1, dir: 1, idle: true },
    { s: 3800, side: -1, dir: -1, span: 140 },
    { s: 4100, side: 1, dir: 1, span: 130, pace: 50 },
    { s: 4400, side: -1, dir: -1, span: 140 },
    { s: 4650, side: 1, dir: 1, span: 120 },
    { s: 4900, side: -1, dir: 1, span: 130 },
    { s: 6200, side: 1, dir: -1, span: 120 },
  ],

  traffic: [
    { s: 400, u: 72, speed: 64, dir: 1 },
    { s: 1600, u: -72, speed: 58, dir: -1 },
    { s: 2900, u: 68, speed: 70, dir: 1 },
    { s: 4200, u: -68, speed: 66, dir: -1 },
    { s: 5600, u: 75, speed: 72, dir: 1 },
  ],

  furniture: {
    phone: [700, 4100], shelters: [[2300, -1], [4600, 1]],
    benches: [[520, 1], [1100, -1], [1900, -1], [2700, 1], [3700, 1], [4400, -1], [4950, 1]],
    drains: [400, 1200, 1800, 2600, 3100, 4000, 4700, 6200],
    signs: [[300, 1, 'stop'], [1700, -1, 'sign'], [2700, 1, 'sign'], [3400, 1, 'stop'], [4600, -1, 'sign']],
  },

  landmarks: { waterTower: [40, 20], pylons: 0 },

  // THE PORTCULLIS: the gatehouse bars its own gate on a rhythm — drops
  // fast, winches up slow, red lamps say which is coming.
  moving: [{ kind: 'portcullis', s: 5550 }],
  // festival bulbs sagging across the narrow streets — never in the roofed
  // legs (market row 0-779, gatehouse 5084-6084), where they'd hang in a ceiling
  flair: {
    lanterns: [900, 1600, 2700, 4900],
    // washing strung between the houses where the street is narrowest, and
    // the chapel bell tolling somewhere above it all — the two sounds and
    // sights of a town that lives upstairs from its own street
    washing: [1000, 2650, 4300],
    bell: true,
  },
  // Dusk over the medieval quarter. The narrow streets read as silhouettes cut
  // out of a bright western sky -- which is what an old town at sunset looks
  // like and nothing like the Parade, on the same palette and the same props.
  sky: 'dusk',
  // golden-hour stock: gold in the highs, violet-blue in the shadows, and
  // older grain — the town at sunset shot on expired film
  grade: { highTint: [1.17, 0.98, 0.78], shadowTint: [0.74, 0.86, 1.10], grain: 0.038, bloom: 0.78 },
  ambience: 'wind',
  music: './music/oldtown.mp3',     // Deep Haze — K. MacLeod, CC BY 4.0
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
  pads: [{ s: 1400 }, { s: 4200 }],
  // one ramp, on the wide side of wall street — the narrow town gets exactly
  // one moment of air, and you have to aim for it
  ramps: [{ s: 1300, u: 40 }],
  refLap: 40,                     // measured: racing laps 40.3 clean
  wet: 0,
};
