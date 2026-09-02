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
  lapMetres: 935,
  road: { half: HALF, kerb: 5, pave: 34, verge: 20, apron: 8 },

  // Four long sweeps and two kinks: quays are straight and the corners are
  // where the water makes them.
  // STRETCHED (playtest, 2026-09-01): +13% of coastline — the anchors below
  // are re-measured against the rebuilt sections.
  shape: {
    free: [2, 8],
    ops: [
      { straight: 2100 }, { arc: -80, r: 460 },
      { straight: 0 }, { arc: -55, r: 620 },
      { straight: 1200 }, { arc: -75, r: 380 },
      { straight: 1650 }, { arc: -60, r: 540 },
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

  // Almost flat. A dock is built on silt, and the one rise is the wreck.
  // Re-laid for the stretched lap (total 11682; sections: esplanade 0-2100,
  // pier 2100-2742, funfair 2742-4616, cliff 4616-5211, wreck 5211-6411,
  // harbour 6411-6908, cut 6908-8558, dunes 8558-9124, mill 9124-11211,
  // boatyard 11211-11683).
  profile: [
    [0, 0], [1400, -3], [2500, 4], [3600, 1], [4400, 0],
    // up onto the wreck's deck across the whole cliff-road approach
    [4820, 0], [5211, 34], [5800, 36], [6411, 34], [6700, 0],
    [7800, -4], [9200, 3], [10400, -2], [11400, 1],
  ],

  hazards: [
    { s: 700, u: H(0.5), r: 30, kind: 'stall' },      // a chip stand on the prom
    { s: 1800, u: H(-0.42), r: 30, kind: 'barrels' },
    { s: 2400, u: H(0.44), r: 34, kind: 'broken' },   // rotten planks, the pier
    { s: 3600, u: H(-0.48), r: 30, kind: 'stall' },   // candy floss, mid-funfair
    { s: 4900, u: H(-0.44), r: 34, kind: 'broken' },  // the cliff road
    { s: 7500, u: H(0.4), r: 32, kind: 'crate' },     // the cut
    { s: 7800, u: H(0.46), r: 30, kind: 'crate' },    // the cut
  ],

  crossings: [1300, 3400, 9800, 10600],
  parked: [
    [500, 1], [900, -1], [1500, 1], [2300, -1], [3000, 1], [3800, -1],
    [4300, 1], [6500, -1], [6750, 1], [9400, -1], [10000, 1], [10700, -1],
  ],

  life: [
    { s: 400, side: -1, dir: 1, span: 200 },
    { s: 700, side: 1, dir: 1, span: 220 },
    { s: 1150, side: -1, dir: 1, idle: true },
    { s: 1190, side: -1, dir: 1, idle: true },
    { s: 1900, side: 1, dir: -1, span: 240 },
    { s: 2900, side: -1, dir: 1, span: 220 },
    { s: 3300, side: -1, dir: -1, span: 200 },
    { s: 3900, side: 1, dir: 1, span: 240, pace: 46 },
    { s: 4300, side: -1, dir: -1, span: 210 },
    { s: 6500, side: 1, dir: 1, span: 180 },
    { s: 6700, side: -1, dir: 1, span: 160 },
    { s: 9300, side: -1, dir: 1, span: 220 },
    { s: 9900, side: 1, dir: -1, span: 230 },
    { s: 10500, side: -1, dir: -1, span: 200 },
    { s: 10900, side: 1, dir: 1, span: 220 },
  ],

  traffic: [
    { s: 900, u: 113, speed: 84, dir: 1 },
    { s: 2400, u: -113, speed: 72, dir: -1 },
    { s: 3600, u: 106, speed: 96, dir: 1 },
    { s: 5600, u: -106, speed: 66, dir: -1 },
    { s: 7600, u: 117, speed: 88, dir: 1 },
    { s: 10200, u: -117, speed: 78, dir: -1 },
  ],

  furniture: {
    phone: [3900], shelters: [[1200, 1], [9700, -1]],
    benches: [[900, -1], [2500, 1], [4200, 1], [9500, -1], [10600, 1]],
    drains: [700, 1900, 2500, 3600, 4400, 6600, 7800, 9600, 10800],
    signs: [[500, 1, 'sign'], [2300, -1, 'sign'], [3500, -1, 'stop'],
            [6500, 1, 'sign'], [9300, 1, 'sign'], [10400, -1, 'stop']],
  },

  landmarks: { gasholder: [-40, 90, 52, 150], waterTower: [-220, -140], pylons: 5 },

  // THE NARROWS: the harbour squeezes the road between two moored hulls —
  // half the carriageway, nav lights on the bows, and a slick dead centre.
  // The playtest asked for exactly this.
  // TWO between-ships moments now: the harbour's moored hulls, and the
  // boatyard's dry-docked pair right before the line — the playtest asked
  // for more of exactly this.
  // the first pinch sat ON the wreck's exit ramp — cars came down the ro-ro
  // straight into a hull wall at 140. It lives past the descent now.
  narrows: [
    { from: 6790, to: 7050, width: 160 },
    { from: 11280, to: 11520, width: 170 },
  ],

  // SLICKS — the Seafront's own hazard mechanic: seaweed and spray on the
  // surface. Hit one and the wheel goes light: grip drops for a beat.
  slicks: [
    { s: 1350, u: -60, r: 34 },    // where the wave keeps landing
    { s: 2400, u: 40, r: 30 },     // wet planks on the pier
    { s: 5000, u: 80, r: 34 },     // spray on the cliff road
    { s: 6920, u: 0, r: 26 },      // dead centre of the harbour narrows
    { s: 11400, u: 0, r: 26 },     // and of the boatyard's
  ],

  // THE FERRIS WHEEL turns all night beside the funfair, a sailboat works
  // the bay, the harbour keeps one crane load swinging over the road — and
  // the sea workers drag the night's catch across it on their own clock.
  moving: [
    { kind: 'ferris', s: 3600, u: -400 },
    { kind: 'boat', s: 900, u: 620 },
    { kind: 'craneload', s: 6760 },
    { kind: 'haul', s: 7180 },
  ],
  // A clear night over the sea, moon on the water — see skies.js 'pier'.
  // The wet stays: rain off the sea is the circuit's grip identity, and the
  // funfair's neon has a dark sky to burn against.
  sky: 'pier',
  // the earth of this circuit is SHINGLE, and everything beyond the loop is
  // the SEA — a coast should never have read as parkland
  ground: 'sand',
  groundOuter: 'sea',
  // wet teal stock: highs washed toward sea-green, deep blue shadows, and
  // the bloom up because every light on the front is doubled in the rain
  grade: { highTint: [0.96, 1.05, 1.02], shadowTint: [0.75, 0.95, 1.15], bloom: 1.06, grain: 0.033 },
  ambience: 'surf',
  music: './music/docks.mp3',       // Floating Cities — K. MacLeod, CC BY 4.0
  // two laps of 935 metres — the endurance round of the town tour
  laps: 2,
  // the measured clean racing-policy lap, which the purse pays pace against
  // the road's own face and the streetlight's own colour -- see ribbon()
  surface: 'concrete',
  lampColor: '#ffd9a0',
  // boost pads — one of them on the ship's deck, because of course it is
  pads: [{ s: 2200 }, { s: 5700 }, { s: 8000 }],
  // the lighthouse on the cliff run, beams sweeping the whole bay
  flair: { lighthouse: { s: 4900, u: 340 } },
  // THE WAVE: the sea takes the low stretch of the esplanade back on a
  // 17-second cycle — foam warns, water sweeps the road, grease follows.
  // Runtime lives in main.js; the zone is the lap's lowest ground.
  wave: { from: 1300, to: 1580 },
  ramps: [{ s: 1150, u: -80 }, { s: 8100, u: 60 }],
  refLap: 64,                      // measured: racing laps 64.4 clean
  wet: 0.85,
};
