// What time it is, per circuit.
//
// Four tracks and every one of them was eleven o'clock at night. They share a
// palette, a prop set and a town, which is the point -- and it also meant the
// only thing separating them in a screenshot was which buildings went past.
// The cheapest honest distinctness available is the HOUR: the same geometry
// photographed at dusk and at dawn is two different places, and it costs four
// colours and a light direction rather than a district.
//
// Each entry drives the sky shader, the fog, the two scene lights and the clear
// colour together, because a warm sky over cool fog reads as a bug rather than
// as evening. `sun` is where the key light hangs, in the same frame the sky
// shader draws its disc in -- if those two disagree the shadows point somewhere
// the light visibly is not.
// A NOTE ON THE TWO DARKEST COLOURS. `below` and `ridge` paint everything
// under the horizon, which the camera sees a lot of because it looks DOWN --
// and at midnight both are near-black, so the seam where the ground mesh ends
// and the sky takes over is invisible. Copy that structure under a pale dawn
// and the same seam becomes a black bar straight across the middle of the
// frame. Under every sky these two have to sit just BELOW the horizon colour,
// not jump to black -- and `ridge` has to sit close to `below`, because the
// shader paints the ENTIRE lower hemisphere with it and any gap between the two
// shows up as a hard horizontal bar that no amount of fog will touch. The sky
// sphere is not fogged, which is how you tell that bar from distant ground.
// READABILITY PASS (playtest, 2026-09-01): the first human lap said the dark
// and the rain made the game hard to READ, not hard to drive. The mechanic
// lives in sightRange() and the lamp pools, not in raw exposure -- so the
// ambient floor and exposure come up, the fog thins, and the dark legs keep
// their contrast against the lit ones rather than their blackness.
export const SKIES = {
  // 11pm. The original, and still the Parade's -- the sight mechanic needs the
  // dark to be genuinely dark.
  midnight: {
    top: '#141d38', horizon: '#33456e', haze: '#7a4a1f', below: '#151d2e', ridge: '#0d1322',
    fog: '#161f33', fogD: 0.00058, clear: '#141d38',
    // second readability bump (playtest, 2026-09-01): the ambient floor and
    // exposure rise again — the dark legs keep their CONTRAST against the
    // lit ones, which is the mechanic; their absolute blackness was not.
    hemiSky: '#3b537f', hemiGround: '#2c2119', hemi: 1.38,
    key: '#bdd2f2', keyI: 2.05, sun: [-320, 470, -240],
    disc: [0.86, 0.90, 1.00], stars: 1,
    exposure: 1.92, threshold: 0.72,
  },

  // Just after sunset over the old town: the sky still has light in it, low and
  // orange in the west, and the streetlamps are already winning. The narrow
  // streets read as silhouettes cut out of a bright sky, which is exactly what
  // a medieval quarter at dusk looks like and nothing like the Parade.
  dusk: {
    top: '#243a63', horizon: '#8a5a48', haze: '#b8622a', below: '#4d3f48', ridge: '#3c313a',
    fog: '#39304a', fogD: 0.00120, clear: '#243a63',
    // DIMMER on the ground than midnight, not brighter. The sun is below the
    // ridge; what is left is a lit sky over unlit streets, which is the whole
    // look. Lifting these with the sky colour is what blew the first pass out.
    hemiSky: '#6f6a92', hemiGround: '#3a2a20', hemi: 0.80,
    key: '#ffb072', keyI: 0.95, sun: [520, 190, -300],
    disc: [1.00, 0.72, 0.42], stars: 0.25,
    exposure: 1.32, threshold: 0.90,
  },

  // Dawn at the river, an hour before anybody else is up. Cold, high, colourless
  // light with the sun still under the ridge -- which is what makes the wet road
  // read: a bright sky is what a wet surface has to reflect. At midnight the
  // Docks' one mechanic was reflecting almost nothing.
  dawn: {
    top: '#2b4a70', horizon: '#9fb0bd', haze: '#4d6d84', below: '#5f6e77', ridge: '#4d5c66',
    // Thicker and PALER than midnight, not thinner. The dark band across the
    // middle of the frame was not the sky at all -- it was the distant ground,
    // which is genuinely dark at dawn and had no fog to fade into. River mist
    // at first light is the honest fix and the pretty one.
    fog: "#7d90a0", fogD: 0.00064, clear: "#2b4a70",
    hemiSky: '#93aec6', hemiGround: '#4a4238', hemi: 0.88,
    key: '#e8d8c4', keyI: 0.80, sun: [-460, 130, 340],
    disc: [1.00, 0.93, 0.84], stars: 0.15,
    exposure: 1.30, threshold: 0.94,
  },

  // A high full moon over the whole town — the Grand Circuit's hour. The
  // clearest air in the city, because the flagship lap is a kilometre long
  // and its whole point is reading the road a long way ahead: the crest, the
  // drop to the harbour, the tunnel mouth. Cold silver key from nearly
  // overhead, thin fog, the most stars anywhere.
  moonhigh: {
    top: '#0d1526', horizon: '#40538a', haze: '#5a6a9a', below: '#1a2233', ridge: '#121a2a',
    fog: '#1c2740', fogD: 0.00038, clear: '#0d1526',
    hemiSky: '#4a5f8f', hemiGround: '#2a231c', hemi: 1.30,
    key: '#dfe8ff', keyI: 2.2, sun: [60, 700, -180],
    disc: [0.92, 0.95, 1.00], stars: 1.2,
    exposure: 1.85, threshold: 0.72,
  },

  // A clear night over the sea — the Seafront's hour. Deep blue-black, a
  // low bright moon laying a path on the water, and just enough violet
  // bleed in the haze for the funfair's neon to feel at home. Thin fog:
  // the sea is the horizon and you should see it.
  pier: {
    top: '#0b1322', horizon: '#31456e', haze: '#6a5a8a', below: '#131b2c', ridge: '#0e1524',
    fog: '#1a2438', fogD: 0.00052, clear: '#0b1322',
    hemiSky: '#42588a', hemiGround: '#2b241d', hemi: 1.24,
    key: '#d8e4ff', keyI: 1.85, sun: [-420, 300, 160],
    disc: [0.9, 0.94, 1.0], stars: 1.1,
    exposure: 1.78, threshold: 0.74,
  },

  // The small hours on the bypass, under sodium. Everything is orange except
  // the sky, the fog is thicker than anywhere else in the city, and that thick
  // warm murk is doing the same job as the crests: it takes the distance away.
  sodium: {
    top: '#191a2c', horizon: '#4a3a3c', haze: '#9a5a1c', below: '#322a38', ridge: '#26212d',
    // the murk thins (playtest: "still hard to see") — the crests are the
    // Ring's distance-taker; the fog only needs to dress them, not double them
    fog: '#2b2430', fogD: 0.00072, clear: '#191a2c',
    hemiSky: '#5a4660', hemiGround: '#33251a', hemi: 1.12,
    key: '#c9b9d8', keyI: 1.18, sun: [280, 520, 300],
    disc: [0.88, 0.84, 0.96], stars: 0.6,
    exposure: 1.60, threshold: 0.80,
  },
  // THE AURORA, over the frozen lake. Deep teal-black with green bleeding
  // into the haze — the sky shader can't draw the ribbons (the flair does),
  // but everything under an aurora is faintly green-lit, and that cast is
  // what sells it. The clearest air in the game: a lake at -20 has none.
  aurora: {
    top: '#081420', horizon: '#1e4a44', haze: '#2e6a52', below: '#101a1e', ridge: '#0b1418',
    fog: '#12241f', fogD: 0.00032, clear: '#081420',
    hemiSky: '#3a6a5c', hemiGround: '#22201c', hemi: 1.26,
    key: '#cfe8dc', keyI: 1.9, sun: [-100, 640, 220],
    disc: [0.85, 0.96, 0.9], stars: 1.35,
    exposure: 1.82, threshold: 0.74,
  },

  // THE SQUALL, on the plow road. A blizzard has no sky at all — a grey-white
  // dome, the thickest fog anywhere (double the sodium's), and a smeared
  // pale key from nowhere in particular. The plows' work lights are the
  // only landmarks, which is the level design.
  squall: {
    top: '#3a4450', horizon: '#6a7480', haze: '#7a828c', below: '#4a525c', ridge: '#414a54',
    fog: '#5a646e', fogD: 0.00150, clear: '#3a4450',
    hemiSky: '#8a94a0', hemiGround: '#3e4448', hemi: 1.05,
    key: '#dae2ea', keyI: 0.9, sun: [0, 500, 0],
    disc: [0.9, 0.92, 0.95], stars: 0,
    exposure: 1.45, threshold: 0.9,
  },
};

export const skyOf = (id) => SKIES[id] || SKIES.midnight;
