// THE DOCKS — the river end of the city, and the flattest thing in it.
//
// The question here is CAN YOU TRUST THE SURFACE. It is permanently wet, which
// turns the weather system from a toggle into a track identity: grip is down a
// fifth, braking down nearly a third, and your beam does not reach as far
// through the rain. Everything you learned about braking points on the Parade
// is wrong here by about a car length, which is the whole idea.
//
// Big open radii to suit it — you brake in straight lines and carry the corner
// on faith — and the widest sky in the city, which the wet reflections want.
// 116. A dock road is a wide open thing and this was NARROWER than the
// Parade, which made 'open' a word in the blurb rather than something you
// could see out of the windscreen.
// the widest open road in the city, as a dock should be
// 300, roughly doubled from 164 (playtest, 2026-09-01).
const HALF = 300;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'docks',
  name: 'The Docks',
  blurb: 'flat, open and always wet',
  heading: 270,

  asks: 'grip',
  lapMetres: 701,
  road: { half: HALF, kerb: 5, pave: 34, verge: 20, apron: 8 },

  // Four long sweeps and two kinks: quays are straight and the corners are
  // where the water makes them.
  shape: {
    free: [2, 8],
    ops: [
      { straight: 1700 }, { arc: -80, r: 460 },
      { straight: 0 }, { arc: -55, r: 620 },
      { straight: 900 }, { arc: -75, r: 380 },
      { straight: 1250 }, { arc: -60, r: 540 },
      { straight: 0 }, { arc: -90, r: 300 },
    ],
  },

  legs: [
    { lit: true, name: 'the long quay', district: 'quay' },
    { lit: false, name: 'the reach', district: 'containers' },
    { lit: false, name: 'coal wharf', district: 'containers' },
    { lit: false, name: 'the swing', district: 'quay' },
    { lit: true, name: 'the mv arkwright', district: 'ship', deck: -34 },
    { lit: true, name: 'the basin', district: 'quay' },
    { lit: false, name: 'the cut', district: 'yard' },
    { lit: false, name: 'scrubland', district: 'wood' },
    { lit: true, name: 'the mill road', district: 'mill' },
    { lit: false, name: 'dock gate', district: 'sheds' },
  ],

  // Almost flat. A dock is built on silt, and the one rise is the bridge.
  profile: [
    [0, 0], [1100, -3], [2200, 4], [3100, 1],
    // Up onto the deck and off again. The climb STARTS on the leg before, so
    // the ramp is 400 voxels rather than 160 -- at 160 it measured a 35% grade,
    // which is not a ro-ro ramp, it is a wall with a slope painted on it.
    [3500, 0], [3960, 34], [4300, 36], [4700, 34], [5150, 0],
    [6000, -4], [7000, 3], [8000, -2], [8500, 1],
  ],

  hazards: [
    { s: 620, u: H(0.5), r: 30, kind: 'crate' },
    { s: 1500, u: H(-0.42), r: 30, kind: 'works' },
    { s: 2300, u: H(0.44), r: 34, kind: 'broken' },
    { s: 3050, u: H(-0.48), r: 30, kind: 'works' },
    { s: 4100, u: H(0.4), r: 32, kind: 'crate' },
    { s: 4900, u: H(-0.44), r: 34, kind: 'broken' },
    { s: 5700, u: H(0.46), r: 30, kind: 'crate' },
  ],

  crossings: [1100, 3000, 4400, 6200, 7700],
  parked: [
    [500, 1], [800, -1], [1400, 1], [2000, -1], [2600, 1], [3200, -1],
    [3900, 1], [4600, -1], [5300, 1], [5900, -1], [6600, 1], [7400, -1],
  ],

  life: [
    { s: 400, side: -1, dir: 1, span: 200 },
    { s: 700, side: 1, dir: 1, span: 220 },
    { s: 1150, side: -1, dir: 1, idle: true },
    { s: 1190, side: -1, dir: 1, idle: true },
    { s: 1600, side: 1, dir: -1, span: 240 },
    { s: 2200, side: -1, dir: 1, span: 220 },
    { s: 2800, side: -1, dir: -1, span: 200 },
    { s: 3400, side: 1, dir: 1, span: 240, pace: 46 },
    { s: 3900, side: -1, dir: -1, span: 210 },
    { s: 4300, side: 1, dir: 1, span: 240 },
    { s: 4450, side: 1, dir: -1, span: 180 },
    { s: 5100, side: -1, dir: 1, span: 220 },
    { s: 5800, side: -1, dir: -1, span: 200 },
    { s: 6400, side: 1, dir: 1, span: 230 },
    { s: 7100, side: -1, dir: -1, span: 200 },
    { s: 7900, side: 1, dir: 1, span: 220 },
  ],

  traffic: [
    { s: 900, u: 113, speed: 84, dir: 1 },
    { s: 2100, u: -113, speed: 72, dir: -1 },
    { s: 3300, u: 106, speed: 96, dir: 1 },
    { s: 4600, u: -106, speed: 66, dir: -1 },
    { s: 5900, u: 117, speed: 88, dir: 1 },
    { s: 7200, u: -117, speed: 78, dir: -1 },
  ],

  furniture: {
    phone: [3300], shelters: [[1200, 1], [5600, -1]],
    benches: [[900, -1], [2400, 1], [4500, 1], [6300, -1], [7600, 1]],
    drains: [700, 1800, 2200, 3200, 3800, 4900, 5400, 6700, 7800],
    signs: [[500, 1, 'sign'], [1900, -1, 'sign'], [3000, -1, 'stop'],
            [4700, 1, 'sign'], [5200, 1, 'sign'], [7000, -1, 'stop']],
  },

  landmarks: { gasholder: [-40, 90, 52, 150], pylons: 5 },
  // Dawn at the river, an hour before anyone else is up. The wet road is this
  // circuit's one mechanic and at midnight it was reflecting almost nothing --
  // a wet surface needs a BRIGHT sky to be worth having.
  sky: 'dawn',
  laps: 3,
  // the measured clean racing-policy lap, which the purse pays pace against
  // the road's own face and the streetlight's own colour -- see ribbon()
  surface: 'concrete',
  lampColor: '#cfe2ff',
  // boost pads — one of them on the ship's deck, because of course it is
  pads: [{ s: 1850 }, { s: 4400 }, { s: 6350 }],
  refLap: 41,
  wet: 0.85,
};
