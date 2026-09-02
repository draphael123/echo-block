// THE RING ROAD — the city's bypass, and the only place you use all of the car.
//
// The question is WILL YOU COMMIT BLIND. Few corners and all of them fast, but
// the relief is savage: crests hide the road the way the dark does on the
// Parade, and that is the point — it is a variation on the sight mechanic
// rather than a repeat of it, because a crest hides things in daylight too.
//
// It is also where the lamps upgrade finally earns its money, and where the
// tunnels give the only sodium-lit stretch in the city.
// 140. It is the bypass; it should be the widest thing in the city and it
// was only sixteen voxels wider than the town road.
// the bypass, and it should feel like one
// 360, roughly doubled from 196 (playtest, 2026-09-01).
const HALF = 360;
const H = (f) => Math.round(HALF * f);

export default {
  // The id stays 'ring' — saves live against it — but the PLACE is heavy
  // industry now (interview, 2026-09-01): flare stacks, pipe bridges, a
  // tank farm, slag flats. Sodium was always this circuit's colour; now it
  // has the town to match. Same geometry, same crests, different world.
  id: 'ring',
  name: 'The Works',
  blurb: 'flare stacks and blind crests — the industry shift',
  heading: 0,

  asks: 'crests',
  lapMetres: 811,
  road: { half: HALF, kerb: 6, pave: 22, verge: 26, apron: 8 },

  // STRETCHED (playtest, 2026-09-01): the lap gains ~2.4km of road — a
  // bypass should be the LONG circuit, and the extra length is where the
  // new industry lives. Anchors below are re-measured against the rebuild.
  shape: {
    free: [0, 4],
    ops: [
      { straight: 0 }, { arc: -60, r: 900 },
      { straight: 1000 }, { arc: -40, r: 900 },
      { straight: 0 }, { arc: -95, r: 520 },
      { straight: 1900 }, { arc: -75, r: 700 },
      { straight: 1300 }, { arc: -90, r: 460 },
    ],
  },

  legs: [
    { lit: false, name: 'the pipeline', district: 'pipeline' },
    { lit: false, name: 'north sweep', district: 'pipeline' },
    { lit: true, name: 'the services', district: 'services' },
    { lit: false, name: 'the tank farm', district: 'tankfarm' },
    { lit: true, name: 'hill tunnel', district: 'tunnel' },
    { lit: false, name: 'the viaduct', district: 'viaduct', deck: -240, deckRamp: 260 },
    { lit: false, name: 'the slag flats', district: 'slagflats' },
    { lit: false, name: 'east sweep', district: 'pipeline' },
    { lit: true, name: 'gate tunnel', district: 'tunnel' },
    { lit: false, name: 'the run in', district: 'yard' },
  ],

  // The big one. Nearly ten metres top to bottom, so crests genuinely hide the
  // road over them, which is the whole mechanic of this circuit.
  profile: [
    // SHARP, not swelling. The first version put 80 voxels of rise across a
    // thousand, which is a hill you can see over the whole way up; the assay
    // measured 3% of the lap as blind and called the crests scenery. These are
    // the same total relief gathered into shorter brows -- rise 40-ish over 400
    // -- which is what actually hides a road from a driver sitting 1.6m up.
    // Re-laid for the stretched lap (total 10134; sections: pipeline 0-1259,
    // north sweep 1259-2202, services 2202-3202, tankfarm 3202-3830, hill
    // tunnel 3830-4433, viaduct 4433-5295, slagflats 5295-7195, east sweep
    // 7195-8111, gate tunnel 8111-9411, run in 9411-10134). Five brows —
    // and the new one is on the RUN IN: a blind crest right before the line.
    [0, 0], [420, 8], [820, 52], [1220, 16],
    [1600, 30], [2000, 78], [2400, 28],
    [2800, 10], [3500, -16], [3900, -44], [4300, -16],
    [4900, 20], [5600, 30], [6000, 76], [6400, 28],
    [6800, 40], [7150, 86], [7500, 38],
    [7900, 12], [8600, 4], [9200, 24],
    [9600, 60], [9950, 16], [10100, 2],
  ],

  // Half of these sit JUST PAST a brow, inside the measured blind zones
  // (348-600, 1824-2088, 4908-5196, 6432-6684 — where stopping distance
  // exceeds sight over the crest). The first set all sat on open road, so the
  // crests hid nothing that mattered and the sim called committing blind free:
  // RACING WON by 11 seconds. A crest is only a question if the answer can be
  // behind it. Same-side neighbours may sit close; opposite-side pairs keep
  // 420+ so the S-flick stays drivable (the Parade's lesson).
  hazards: [
    { s: 1050, u: H(0.45), r: 34, kind: 'works' },     // past the first brow
    { s: 2280, u: H(0.5), r: 34, kind: 'barrels' },    // past the second, at the services
    { s: 2950, u: H(-0.46), r: 34, kind: 'spill' },
    { s: 3600, u: H(-0.46), r: 36, kind: 'broken' },   // the tank farm
    { s: 6150, u: H(0.44), r: 34, kind: 'spill' },     // past the flats' brow
    { s: 6550, u: H(-0.44), r: 36, kind: 'broken' },
    { s: 7350, u: H(-0.5), r: 36, kind: 'works' },     // past the second flats brow
    { s: 9750, u: H(0.44), r: 34, kind: 'spill' },     // past the RUN-IN crest
    { s: 9920, u: H(0.42), r: 36, kind: 'broken' },
  ],

  crossings: [],
  // in the SERVICES (1940–2640), not strewn down the long right — the old
  // values were authored before the legs were measured and half of them
  // landed in the woods and the tunnel mouth, which is where the playtest
  // met them. The build-time validator drops strays now, but the data
  // should be right, not merely caught.
  parked: [[2350, 1], [2530, 1], [2710, 1], [2850, -1], [2990, -1]],

  // A bypass has nobody walking on it, and that is right -- but the SERVICES
  // does, and it was empty. This is the only place on the circuit with people.
  life: [
    { s: 2400, side: 1, dir: 1, span: 120 },
    { s: 2500, side: 1, dir: 1, span: 160 },
    { s: 2580, side: -1, dir: 1, idle: true },
    { s: 2660, side: -1, dir: -1, span: 140 },
    { s: 2750, side: 1, dir: -1, span: 130 },
    { s: 2850, side: -1, dir: 1, span: 150 },
  ],

  traffic: [
    { s: 500, u: 136, speed: 120, dir: 1 },
    { s: 1600, u: -136, speed: 104, dir: -1 },
    { s: 2800, u: 129, speed: 132, dir: 1 },
    { s: 4200, u: -129, speed: 96, dir: -1 },
    { s: 5600, u: 140, speed: 126, dir: 1 },
    { s: 6900, u: -140, speed: 110, dir: -1 },
    { s: 8400, u: 132, speed: 138, dir: 1 },
    { s: 9600, u: -132, speed: 100, dir: -1 },
  ],

  furniture: {
    drains: [800, 1900, 3000, 4300, 5600, 6800, 8000, 9300],
    signs: [[1000, 1, 'sign'], [2700, -1, 'sign'], [4200, -1, 'sign'],
            [6300, 1, 'sign'], [7700, 1, 'sign'], [9500, -1, 'sign']],
    benches: [[3000, 1], [3150, -1]],
  },

  landmarks: { gasholder: [120, -60, 50, 140], waterTower: [-260, 220], pylons: 6 },

  // THE LEVEL CROSSING on the flats: barriers cycle on the race clock, red
  // lamps blinking while they are down. Read the lamps from distance and
  // lift, or arrive on the wrong beat and wear the arm.
  // STEAM VENTS — the Works' own hazard mechanic: grates that blow on a
  // cycle. Drive through the plume and it shoves the car and whites the
  // screen for a beat; read the hiss and the rhythm, or wear it.
  vents: [
    { s: 900, u: -120 },
    { s: 3050, u: 100 },
    { s: 6250, u: -140 },
    { s: 9550, u: 120 },
  ],

  // — and A WIDE LOAD with escorts and amber beacons crawling the whole
  // bypass: you catch it every lap somewhere new. The Works' parade.
  moving: [{ kind: 'crossing', s: 6000 }, { kind: 'convoy', s: 0, u: 150 }],
  // arc welders stuttering in the yards — the only cold light on the circuit
  flair: {
    welders: [{ s: 2150, u: -230 }, { s: 6500, u: 240 }, { s: 7700, u: -260 }],
    embers: 'tankfarm',            // sparks rising off the flare stacks' legs
    slagpour: 'slagflats',         // the ladle tips on a cycle — molten light
  },
  // Sodium, in the small hours. Everything orange except the sky, and the
  // thickest fog in the city -- which does the same job as the crests do:
  // it takes the distance away from you.
  // the field carries lamps worth having here — without them the cautious
  // half finished 45 seconds back and the race had four cars, not six
  rivalBeam: 1.5,
  sky: 'sodium',
  // the sodium bath: everything bright goes orange, the shadows barely stay
  // blue, hard rolloff, the dirtiest grain — industry's own colour of night
  grade: { highTint: [1.20, 1.00, 0.70], shadowTint: [0.86, 0.88, 1.00], grain: 0.042, rolloff: 3.0, bloom: 0.92, exposure: 1.36 },
  ambience: 'industry',
  music: './music/ring.mp3',        // Neon Laser Horizon — K. MacLeod, CC BY 4.0
  // The longest lap in the city at 698 metres — but also the fastest: two laps
  // was over in 68 seconds, half the length of any other race. "Three is a
  // slog" was written before there was a field to work through; with five cars
  // to pass, three is a race.
  laps: 3,
  // the measured clean racing-policy lap, which the purse pays pace against
  // the road's own face and the streetlight's own colour -- see ribbon()
  surface: 'motorway',
  lampColor: '#ff9226',
  // boost pads — one inside the sodium tunnel, because that IS the circuit
  pads: [{ s: 1500 }, { s: 4600 }, { s: 8600 }],
  // at bypass speeds these buy the longest air in the game
  ramps: [{ s: 1900, u: -100 }, { s: 6700, u: 80 }],
  refLap: 45,
  wet: 0,
};
