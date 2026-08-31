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
export const SKIES = {
  // 11pm. The original, and still the Parade's -- the sight mechanic needs the
  // dark to be genuinely dark.
  midnight: {
    top: '#141d38', horizon: '#33456e', haze: '#7a4a1f', below: '#151d2e', ridge: '#0d1322',
    fog: '#161f33', fogD: 0.00135, clear: '#141d38',
    hemiSky: '#3b537f', hemiGround: '#2c2119', hemi: 0.68,
    key: '#bdd2f2', keyI: 1.6, sun: [-320, 470, -240],
    disc: [0.86, 0.90, 1.00], stars: 1,
    exposure: 1.42, threshold: 0.72,
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
    hemiSky: '#6f6a92', hemiGround: '#3a2a20', hemi: 0.50,
    key: '#ffb072', keyI: 0.95, sun: [520, 190, -300],
    disc: [1.00, 0.72, 0.42], stars: 0.25,
    exposure: 1.10, threshold: 0.90,
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
    fog: "#7d90a0", fogD: 0.00170, clear: "#2b4a70",
    hemiSky: '#93aec6', hemiGround: '#4a4238', hemi: 0.62,
    key: '#e8d8c4', keyI: 0.80, sun: [-460, 130, 340],
    disc: [1.00, 0.93, 0.84], stars: 0.15,
    exposure: 1.05, threshold: 0.94,
  },

  // The small hours on the bypass, under sodium. Everything is orange except
  // the sky, the fog is thicker than anywhere else in the city, and that thick
  // warm murk is doing the same job as the crests: it takes the distance away.
  sodium: {
    top: '#191a2c', horizon: '#4a3a3c', haze: '#9a5a1c', below: '#322a38', ridge: '#26212d',
    fog: '#2b2430', fogD: 0.00170, clear: '#191a2c',
    hemiSky: '#5a4660', hemiGround: '#33251a', hemi: 0.58,
    key: '#c9b9d8', keyI: 1.05, sun: [280, 520, 300],
    disc: [0.88, 0.84, 0.96], stars: 0.6,
    exposure: 1.30, threshold: 0.80,
  },
};

export const skyOf = (id) => SKIES[id] || SKIES.midnight;
