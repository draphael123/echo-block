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
const HALF = 96;
const H = (f) => Math.round(HALF * f);

export default {
  id: 'docks',
  name: 'The Docks',
  blurb: 'flat, open and always wet',
  heading: 270,

  road: { half: HALF, kerb: 5, pave: 30, verge: 20, apron: 8 },

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
    { lit: true, name: 'transit sheds', district: 'sheds' },
    { lit: true, name: 'the basin', district: 'quay' },
    { lit: false, name: 'the cut', district: 'yard' },
    { lit: false, name: 'scrubland', district: 'wood' },
    { lit: true, name: 'the mill road', district: 'mill' },
    { lit: false, name: 'dock gate', district: 'sheds' },
  ],

  // Almost flat. A dock is built on silt, and the one rise is the bridge.
  profile: [
    [0, 0], [1100, -3], [2200, 4], [3100, 1],
    [4000, 18], [4500, 24], [5000, 8],     // over the swing bridge
    [6000, -4], [7000, 3], [8000, -2], [8500, 1],
  ],

  hazards: [
    { s: 620, u: H(0.5), r: 30, kind: 'skip' },
    { s: 1500, u: H(-0.42), r: 30, kind: 'works' },
    { s: 2300, u: H(0.44), r: 34, kind: 'broken' },
    { s: 3050, u: H(-0.48), r: 30, kind: 'works' },
    { s: 4100, u: H(0.4), r: 32, kind: 'skip' },
    { s: 4900, u: H(-0.44), r: 34, kind: 'broken' },
    { s: 5700, u: H(0.46), r: 30, kind: 'works' },
  ],

  crossings: [1100, 4400],
  parked: [[800, 1], [2600, -1], [4600, 1], [5900, -1]],

  life: [
    { s: 700, side: 1, dir: 1, span: 220 },
    { s: 1150, side: -1, dir: 1, idle: true },
    { s: 2800, side: -1, dir: -1, span: 200 },
    { s: 4300, side: 1, dir: 1, span: 240 },
    { s: 4450, side: 1, dir: -1, span: 180 },
    { s: 5800, side: -1, dir: -1, span: 200 },
  ],

  traffic: [
    { s: 900, u: 48, speed: 84, dir: 1 },
    { s: 2600, u: -48, speed: 72, dir: -1 },
    { s: 4200, u: 44, speed: 96, dir: 1 },
    { s: 5600, u: -44, speed: 66, dir: -1 },
  ],

  furniture: {
    shelters: [[1200, 1]],
    benches: [[900, -1], [4500, 1]],
    drains: [700, 2200, 3800, 5400],
    signs: [[500, 1, 'sign'], [3000, -1, 'stop'], [5200, 1, 'sign']],
  },

  landmarks: { gasholder: [-40, 90, 52, 150], pylons: 5 },
  wet: 0.85,
};
