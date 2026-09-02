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
  // The id stays 'docks' — saves, bests and ghosts live against it — but
  // the PLACE is the Seafront now (interview, 2026-09-01: all four sameness
  // boxes ticked; a second harbour was one harbour too many). Esplanade,
  // pier, funfair, cliff, dunes — same geometry, different world.
  id: 'docks',
  name: 'The Seafront',
  blurb: 'esplanade, pier and funfair — rain off the sea',
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
    { lit: true, name: 'the esplanade', district: 'esplanade' },
    { lit: true, name: 'the pier', district: 'pier' },
    { lit: true, name: 'the funfair', district: 'funfair' },
    { lit: false, name: 'the cliff road', district: 'cliff' },
    { lit: true, name: 'the wreck of the arkwright', district: 'ship', deck: -34 },
    { lit: true, name: 'the harbour', district: 'quay' },
    { lit: false, name: 'the cut', district: 'yard' },
    { lit: false, name: 'the dunes', district: 'dunes' },
    { lit: true, name: 'the mill road', district: 'mill' },
    { lit: false, name: 'the boatyard', district: 'sheds' },
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
    { s: 620, u: H(0.5), r: 30, kind: 'stall' },      // a chip stand on the prom
    { s: 1500, u: H(-0.42), r: 30, kind: 'barrels' },
    { s: 2300, u: H(0.44), r: 34, kind: 'broken' },
    { s: 3050, u: H(-0.48), r: 30, kind: 'stall' },   // candy floss, mid-funfair
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

  landmarks: { gasholder: [-40, 90, 52, 150], waterTower: [-220, -140], pylons: 5 },

  // THE NARROWS: the harbour squeezes the road between two moored hulls —
  // half the carriageway, nav lights on the bows, and a slick dead centre.
  // The playtest asked for exactly this.
  narrows: [{ from: 4900, to: 5160, width: 150 }],

  // SLICKS — the Seafront's own hazard mechanic: seaweed and spray on the
  // surface. Hit one and the wheel goes light: grip drops for a beat.
  slicks: [
    { s: 950, u: -60, r: 34 },
    { s: 2050, u: 40, r: 30 },     // wet planks on the pier
    { s: 3620, u: 80, r: 34 },     // spray on the cliff road
    { s: 5100, u: 0, r: 26 },      // dead centre of the narrows
  ],

  // THE FERRIS WHEEL turns all night beside the pier, a sailboat works the
  // bay, and the harbour keeps one crane load swinging over the road.
  moving: [
    { kind: 'ferris', s: 2650, u: -400 },
    { kind: 'boat', s: 900, u: 620 },
    { kind: 'craneload', s: 5050 },
  ],
  // A clear night over the sea, moon on the water — see skies.js 'pier'.
  // The wet stays: rain off the sea is the circuit's grip identity, and the
  // funfair's neon has a dark sky to burn against.
  sky: 'pier',
  // wet teal stock: highs washed toward sea-green, deep blue shadows, and
  // the bloom up because every light on the front is doubled in the rain
  grade: { highTint: [0.96, 1.05, 1.02], shadowTint: [0.75, 0.95, 1.15], bloom: 1.06, grain: 0.033 },
  ambience: 'surf',
  music: './music/docks.mp3',       // Floating Cities — K. MacLeod, CC BY 4.0
  laps: 3,
  // the measured clean racing-policy lap, which the purse pays pace against
  // the road's own face and the streetlight's own colour -- see ribbon()
  surface: 'concrete',
  lampColor: '#ffd9a0',
  // boost pads — one of them on the ship's deck, because of course it is
  pads: [{ s: 1850 }, { s: 4400 }, { s: 6350 }],
  // the lighthouse on the cliff run, beams sweeping the whole bay
  flair: { lighthouse: { s: 3560, u: 340 } },
  // the second ramp lands you almost on the basin pad: chain them and the
  // quay is a flight path
  ramps: [{ s: 1000, u: -80 }, { s: 4250, u: 60 }],
  refLap: 41,
  wet: 0.85,
};
