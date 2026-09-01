// The palette. Deliberately small and mostly desaturated, because the colour
// in this look comes from LIGHT, not from albedo. Surfaces are muddy browns,
// greens and greys; the saturated hues are all emitters.
//
//   jitter — per-voxel value noise, keeps big flats from reading as polygons
//   gain   — albedo multiplier, lets one hex serve as a family of tones
//   emit   — >0 routes the voxel into the unlit glow mesh (feeds bloom)
import * as THREE from '../vendor/three/three.module.js';

const RAW = {
  // --- ground ------------------------------------------------------------
  asphalt:      ['#2a2c33', 0.16],
  asphaltWorn:  ['#33353d', 0.14],
  asphaltPatch: ['#232429', 0.20],
  roadLine:     ['#8a8259', 0.10],
  concrete:     ['#45464a', 0.13],
  concreteOld:  ['#3c3d40', 0.16],
  curb:         ['#54555a', 0.10],
  grass:        ['#27351f', 0.24],
  grassDry:     ['#333a22', 0.22],
  dirt:         ['#3a2f24', 0.22],
  gravel:       ['#43423e', 0.28],
  leafLitter:   ['#5a4026', 0.30],
  leafLitter2:  ['#46381f', 0.30],

  // --- house A: mint green, the 70s repaint ------------------------------
  sidingA:      ['#4f6b5d', 0.10],
  sidingAdark:  ['#41594d', 0.10],
  trimA:        ['#b0aa9a', 0.08],
  // --- house B: cream, cheaper, further back -----------------------------
  sidingB:      ['#7a705d', 0.10],
  sidingBdark:  ['#655c4c', 0.10],
  trimB:        ['#9c9384', 0.08],
  // --- and four more, so seven houses are not two houses ------------------
  sidingC:      ['#6a5148', 0.10],   // faded barn red
  sidingCdark:  ['#57423b', 0.10],
  trimC:        ['#a89f8c', 0.08],
  sidingD:      ['#4c5a6b', 0.10],   // dusty blue
  sidingDdark:  ['#3f4b59', 0.10],
  trimD:        ['#b3ab98', 0.08],
  sidingE:      ['#7c7458', 0.10],   // ochre
  sidingEdark:  ['#66604a', 0.10],
  trimE:        ['#9a9182', 0.08],
  sidingF:      ['#5e6156', 0.10],   // sage grey
  sidingFdark:  ['#4e514a', 0.10],
  trimF:        ['#ada492', 0.08],
  doorGreen:    ['#3c5240', 0.10],
  doorYellow:   ['#7d6a35', 0.10],

  brick:        ['#6b4038', 0.18],
  brickDark:    ['#57332d', 0.18],
  shingle:      ['#38323a', 0.20],
  shingleDark:  ['#2e292f', 0.20],
  doorRed:      ['#7d3b32', 0.10],
  doorBlue:     ['#33465e', 0.10],
  screen:       ['#22262b', 0.12],
  glassDark:    ['#1b222c', 0.10],
  wood:         ['#4a3a2b', 0.20],
  woodPale:     ['#5d4b38', 0.20],
  fence:        ['#6a6252', 0.22],

  // --- plants ------------------------------------------------------------
  hedge:        ['#243420', 0.30],
  leafDark:     ['#22301e', 0.30],
  leafMid:      ['#2c3c24', 0.28],
  trunk:        ['#392c22', 0.24],

  // --- metal / props -----------------------------------------------------
  metal:        ['#3d4046', 0.14],
  metalDark:    ['#2c2e33', 0.14],
  chrome:       ['#7e838c', 0.12],
  rust:         ['#5a3527', 0.24],
  binGreen:     ['#3b4a38', 0.16],
  binLid:       ['#32402f', 0.16],
  hydrant:      ['#7e3a2c', 0.14],
  plasticBlue:  ['#2f4a68', 0.14],
  plasticRed:   ['#743029', 0.14],
  paper:        ['#7a7566', 0.14],
  rubber:       ['#1e1f22', 0.16],

  // --- the wagon ---------------------------------------------------------
  carBody:      ['#5e2f2b', 0.10],
  carPanel:     ['#6a5335', 0.14],
  carGlass:     ['#1e262f', 0.10],
  carTrim:      ['#8a8d92', 0.10],

  // --- people ------------------------------------------------------------
  // Skin reads very dark at night, so these are pitched lighter than they
  // would be in daylight; the lamp does the rest.
  skinLight:    ['#8a6046', 0.08],
  skinMid:      ['#70472f', 0.08],
  skinDeep:     ['#4e2f20', 0.08],
  hairDark:     ['#2a2119', 0.10],
  hairBrown:    ['#4a3423', 0.10],
  hairGrey:     ['#767370', 0.10],
  hairGinger:   ['#7a4326', 0.10],
  shirtRed:     ['#79352d', 0.09],
  shirtBlue:    ['#32475f', 0.09],
  shirtGreen:   ['#37513e', 0.09],
  shirtCream:   ['#6b6455', 0.09],
  shirtPlaid:   ['#6d4a3c', 0.14],
  jeans:        ['#3b4a63', 0.10],
  trouserTan:   ['#6a5c46', 0.10],
  trouserGrey:  ['#4a4a50', 0.10],
  shoe:         ['#2c2724', 0.10],
  dogFur:       ['#5b4630', 0.16],
  dogFurDark:   ['#3a2c1f', 0.16],
  torchBody:    ['#5c4f3a', 0.10],
  catFur:       ['#2f2a26', 0.14],

  // --- street furniture ---------------------------------------------------
  signRed:      ['#7c2f28', 0.10],
  signWhite:    ['#8f8a7e', 0.10],
  signGreen:    ['#2f4a3a', 0.10],
  phoneRed:     ['#7e2b26', 0.10],
  coneOrange:   ['#8a4526', 0.12],
  skipSteel:    ['#3f4a52', 0.16],
  skipRust:     ['#5c3a28', 0.24],
  fabricPale:   ['#7d786a', 0.14],
  fabricBlue:   ['#42586e', 0.14],
  flowerA:      ['#6e3a4a', 0.22],
  flowerB:      ['#6a5a2e', 0.22],
  flowerC:      ['#55406a', 0.22],
  slatWood:     ['#57452f', 0.20],

  // --- night sky / far --------------------------------------------------
  hillFar:      ['#2b3448', 0.10],
};

// Emitters. Values above 1 are intentional: the render target is half-float
// and the composite tone-maps at the end, so these have headroom to bloom.
const RAW_EMIT = {
  winWarm:      ['#ffb45c', 2.6],   // lamp behind a curtain
  winWarmDim:   ['#e09a52', 1.5],
  winTV:        ['#79b4ff', 2.2],   // the television, animated separately
  porchBulb:    ['#ffd8a2', 2.1],
  sodium:       ['#ffa947', 3.0],   // 5.0 whited out the lens and everything under it
  neonSign:     ['#ff6a8a', 3.0],
  tailLight:    ['#ff4030', 1.4],   // 2.2 blew out the whole rear of the car
  bugZapper:    ['#8affd0', 2.4],
  moonGlass:    ['#9fd0ff', 1.2],
  torchLens:    ['#fff0c4', 2.6],
  radioDial:    ['#ff9a5c', 1.8],
  cigarette:    ['#ff6a3c', 2.0],
  phoneGlow:    ['#ffe0a8', 1.7],
  // Just the lens. It was 6.0, and above about 1.5 the bloom pass smears it into
  // a blob wider than the car carrying it, so an oncoming Cortina arrived as a
  // white hole. The spotlight does the lighting; this only has to say "lamp".
  headLight:    ['#fff4d6', 1.5],
  shelterTube:  ['#cfe4ff', 2.2],
  stripLight:   ['#dfeaff', 0.95],
  chillGlow:    ['#bcd8f2', 0.8],
};

function toLinear(hex) {
  const c = new THREE.Color();
  c.setStyle(hex, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}

export const PALETTE = {};
for (const [name, [hex, jitter]] of Object.entries(RAW))
  PALETTE[name] = { rgb: toLinear(hex), jitter, gain: 1, emit: 0 };
for (const [name, [hex, emit]] of Object.entries(RAW_EMIT))
  PALETTE[name] = { rgb: toLinear(hex).map(v => v * emit), jitter: 0.04, gain: 1, emit };

// A darker/lighter sibling without adding another hex to the table.
export function tint(name, gain) {
  const k = `${name}@${gain}`;
  if (!PALETTE[k]) PALETTE[k] = { ...PALETTE[name], gain };
  return k;
}
