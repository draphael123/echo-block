// The clutter. This file is the actual cost of the look — a technically
// perfect empty street reads as cheap, a scrappy street with forty things on
// it reads like the game. Everything here is built from the same voxel size
// as the houses.
//
// Irregular silhouettes use the string DSL; anything that is really a stack of
// boxes and discs is cheaper to write as a loop.
import { hash3 } from './voxel.js';
import { tint } from './palette.js';

// ---------------------------------------------------------------- helpers
export function cyl(w, x, y, z, r, h, c, hollow = false) {
  const r2 = r * r, inner = (r - 1) * (r - 1);
  for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++) {
    const d = i * i + k * k;
    if (d > r2) continue;
    if (hollow && d < inner) continue;
    for (let j = 0; j < h; j++) w.set(x + i, y + j, z + k, typeof c === 'function' ? c(x + i, y + j, z + k) : c);
  }
}
export function ball(w, x, y, z, r, c, ragged = 0) {
  const r2 = r * r;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
    const d = i * i + j * j + k * k;
    if (d > r2) continue;
    if (ragged && d > r2 * 0.55 && hash3(x + i, y + j, z + k) < ragged) continue;
    w.set(x + i, y + j, z + k, typeof c === 'function' ? c(x + i, y + j, z + k) : c);
  }
}

// ---------------------------------------------------------------- the DSL
// layers[y][z][x] — bottom layer first, '.' is empty.
const rep = (n, row) => Array.from({ length: n }, () => row);

export const MAILBOX = {
  pal: { p: 'wood', m: 'metal', f: 'plasticRed' },
  layers: [
    ...rep(11, ['..', '.p', '.p', '..']),
    ['..', 'mm', 'mm', '..'],
    ['mm', 'mm', 'mm', 'm.'],
    ['mm', 'mm', 'mm', 'm.'],
    ['mm', 'mm', 'mm', 'm.'],
    ['.f', 'mm', 'mm', '..'],
    ['..', '.m', '.m', '..'],
  ],
};

export const GNOME = {
  pal: { r: 'plasticRed', b: 'plasticBlue', s: 'paper', g: 'grassDry' },
  layers: [
    ['.bb.', '.bb.', '....'],
    ['.bb.', 'bbbb', '.bb.'],
    ['bbbb', 'bbbb', 'bbbb'],
    ['bbbb', 'bbbb', 'bbbb'],
    ['.ss.', 'ssss', '.ss.'],
    ['.ss.', 'ssss', '.ss.'],
    ['.rr.', 'rrrr', '.rr.'],
    ['....', '.rr.', '....'],
    ['....', '.r..', '....'],
  ],
};

export const NEWSPAPER = {
  pal: { p: 'paper', t: tint('paper', 0.8) },
  layers: [['ppppp', 'ptttp', 'ppppp'], ['..p..', '.ppp.', '..p..']],
};

// ---------------------------------------------------------------- props
export function trashBin(w, x, y, z, { lidOff = false } = {}) {
  cyl(w, x, y, z, 4, 12, (px, py) => (py > y + 9 ? 'binLid' : 'binGreen'));
  if (lidOff) {
    // lid leaning against the base — a bin with its lid on is furniture,
    // a bin with its lid off is a story
    w.box(x + 5, y, z - 4, 1, 8, 8, 'binLid');
    w.box(x - 4, y + 12, z - 4, 8, 1, 8, null);
  }
  w.set(x - 4, y + 10, z, 'metalDark');
  w.set(x + 4, y + 10, z, 'metalDark');
}

export function hydrant(w, x, y, z) {
  cyl(w, x, y, z, 2, 8, 'hydrant');
  cyl(w, x, y + 8, z, 1, 2, 'hydrant');
  w.box(x - 3, y + 4, z - 1, 7, 2, 2, 'hydrant');
  cyl(w, x, y, z, 3, 1, 'hydrant');
}

export function bikeDown(w, x, y, z, rot = 0) {
  // fallen flat on the lawn. Wheels are rings so the grass shows through.
  const put = (i, j, k, c) => { rot ? w.set(x + k, y + j, z + i, c) : w.set(x + i, y + j, z + k, c); };
  const ring = (cx, cz, r) => {
    for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++) {
      const d = Math.sqrt(i * i + k * k);
      if (d > r || d < r - 1.1) continue;
      put(cx + i, 0, cz + k, 'rubber');
    }
  };
  ring(6, 0, 5); ring(20, 0, 5);
  for (let i = 8; i <= 18; i++) put(i, 1, 0, 'plasticBlue');
  for (let i = 9; i <= 14; i++) put(i, 1, i - 12, 'plasticBlue');
  put(19, 1, 0, 'chrome'); put(19, 2, 0, 'chrome');
  put(19, 2, -2, 'chrome'); put(19, 2, 2, 'chrome');
  put(10, 2, 0, 'rubber');
}

export function hose(w, x, y, z) {
  for (let t = 0; t < 3; t++)
    for (let a = 0; a < 40; a++) {
      const th = a / 40 * Math.PI * 2, r = 5 - t * 1.2;
      w.set(x + Math.round(Math.cos(th) * r), y + t, z + Math.round(Math.sin(th) * r), 'binGreen');
    }
}

export function leafPile(w, x, y, z, r) {
  for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++) {
    const d = Math.hypot(i, k);
    if (d > r) continue;
    const h = Math.max(1, Math.round((1 - d / r) * 3));
    for (let j = 0; j < h; j++)
      w.set(x + i, y + j, z + k, hash3(x + i, j, z + k) > 0.5 ? 'leafLitter' : 'leafLitter2');
  }
}

export function hedge(w, x, y, z, len, depth, h, dir = 'x') {
  const wid = dir === 'x' ? len : depth, dep = dir === 'x' ? depth : len;
  for (let i = 0; i < wid; i++) for (let k = 0; k < dep; k++) {
    const edge = Math.min(i, wid - 1 - i, k, dep - 1 - k);
    const top = h - (edge < 1 ? 1 : 0) - Math.round(hash3(x + i, 0, z + k) * 2);
    for (let j = 0; j < top; j++)
      w.set(x + i, y + j, z + k, hash3(x + i, j, z + k) > 0.35 ? 'hedge' : 'leafDark');
  }
}

export function tree(w, x, y, z, h, r) {
  for (let j = 0; j < h; j++) {
    const lean = Math.round(Math.sin(j * 0.22) * 1.2);
    cyl(w, x + lean, y + j, z, j < h * 0.3 ? 2 : 1, 1, 'trunk');
  }
  const top = y + h;
  const blobs = [[0, 0, 0, r], [-r * 0.7, -r * 0.35, r * 0.4, r * 0.72],
                 [r * 0.75, -r * 0.2, -r * 0.3, r * 0.68], [r * 0.1, r * 0.5, r * 0.6, r * 0.6],
                 [-r * 0.2, r * 0.35, -r * 0.7, r * 0.6]];
  for (const [bx, by, bz, br] of blobs)
    ball(w, Math.round(x + bx), Math.round(top + by), Math.round(z + bz), Math.round(br),
      (px, py, pz) => (hash3(px, py, pz) > 0.55 ? 'leafMid' : 'leafDark'), 0.45);
  // branches poking out of the canopy so it is not a lollipop
  for (let a = 0; a < 4; a++) {
    const th = a * 1.7 + 0.4;
    for (let t = 0; t < r * 0.9; t++)
      w.set(Math.round(x + Math.cos(th) * t), Math.round(top - 2 + t * 0.35), Math.round(z + Math.sin(th) * t), 'trunk');
  }
}

export function picketFence(w, x, y, z, len, dir = 'x') {
  for (let i = 0; i < len; i++) {
    const ax = dir === 'x' ? x + i : x, az = dir === 'x' ? z : z + i;
    if (i % 3 !== 2) {
      const lean = hash3(ax, 0, az) > 0.9 ? 1 : 0;   // a couple of sprung boards
      for (let j = 0; j < 9 - lean; j++) w.set(ax, y + j, az, 'fence');
      w.set(ax, y + 9 - lean, az, 'fence');
    }
    if (i % 3 === 2) { w.set(ax, y + 3, az, 'fence'); w.set(ax, y + 7, az, 'fence'); }
  }
}

// Returns the world position of the bulb so main.js can hang a light there.
export function streetLamp(w, x, y, z, h = 62, armLen = 14) {
  cyl(w, x, y, z, 2, 4, 'concreteOld');
  for (let j = 4; j < h; j++) cyl(w, x, y + j, z, j > h - 12 ? 1 : 1, 1, 'metalDark');
  cyl(w, x, y, z, 1, h, 'metalDark');
  for (let i = 1; i <= armLen; i++) {
    const j = h + Math.round(Math.sqrt(i) * 1.4);
    w.set(x, y + j, z + i, 'metalDark');
    if (i > armLen - 3) w.set(x, y + j - 1, z + i, 'metalDark');
  }
  const hy = y + h + Math.round(Math.sqrt(armLen) * 1.4) - 2, hz = z + armLen;
  w.box(x - 2, hy - 1, hz - 3, 5, 2, 6, 'metal');
  w.box(x - 1, hy - 2, hz - 2, 3, 1, 4, 'sodium');
  return [x, hy - 2, hz];
}

export function utilityPole(w, x, y, z, h = 78) {
  for (let j = 0; j < h; j++) cyl(w, x, y + j, z, j < 6 ? 3 : 2, 1, 'trunk');
  w.box(x - 11, y + h - 6, z - 1, 23, 2, 2, 'wood');
  w.box(x - 9, y + h - 12, z - 1, 19, 2, 2, 'wood');
  for (const ox of [-9, -4, 4, 9]) w.box(x + ox, y + h - 4, z - 1, 1, 2, 2, 'glassDark');
  return [x, y + h - 5, z];
}

export function lawnChair(w, x, y, z) {
  w.box(x, y, z, 9, 1, 9, 'metal');
  w.box(x + 1, y + 1, z + 1, 7, 1, 7, 'plasticBlue');
  w.box(x + 1, y + 2, z + 7, 7, 8, 1, 'plasticBlue');
  for (const [ox, oz] of [[0, 0], [8, 0], [0, 8], [8, 8]]) w.box(x + ox, y - 4, z + oz, 1, 4, 1, 'metal');
}

// The station wagon, backed into the driveway so its tail faces the street.
// Length runs along Z. Wood panelling, because it is 1986.
//
// A car is the hardest prop to make read at this voxel size: get the greenhouse
// wrong and it is a brick. What sells it is the STEP — body, then a narrower
// cabin inset on both sides, then a roof lighter than either.
export function wagon(w, x, y, z) {
  const L = 50, W = 22, sill = y + 9;

  // sills and lower body
  w.box(x, y + 5, z + 2, W, 4, L - 4, 'carBody');
  w.box(x, sill, z, W, 8, L, 'carBody');
  w.box(x + 1, sill + 8, z + 1, W - 2, 1, L - 2, 'carBody');

  // greenhouse: inset 3 on each side, starts behind the bonnet
  const cz = z + 8, cL = L - 20;
  w.box(x + 3, sill + 9, cz, W - 6, 9, cL, 'carGlass');
  w.box(x + 3, sill + 9, cz, 1, 9, cL, 'carBody');            // B-pillars
  w.box(x + W - 4, sill + 9, cz, 1, 9, cL, 'carBody');
  w.box(x + 3, sill + 9, cz + Math.round(cL * 0.45), W - 6, 9, 1, 'carBody');
  w.box(x + 2, sill + 18, cz - 1, W - 4, 2, cL + 2, 'carTrim');  // pale roof + drip rail
  w.box(x + 3, sill + 20, cz + 2, W - 6, 1, cL - 8, 'carBody');  // roof rack
  w.box(x + 4, sill + 21, cz + 3, 1, 1, cL - 10, 'metalDark');
  w.box(x + W - 5, sill + 21, cz + 3, 1, 1, cL - 10, 'metalDark');

  // bonnet and tailgate
  w.box(x + 1, sill + 8, z + L - 12, W - 2, 2, 12, 'carBody');
  w.box(x + 1, sill + 8, z, W - 2, 2, 8, 'carBody');

  // the wood
  w.box(x - 1, sill + 1, z + 6, 1, 6, L - 16, 'carPanel');
  w.box(x + W, sill + 1, z + 6, 1, 6, L - 16, 'carPanel');
  w.box(x + 1, sill + 1, z - 1, W - 2, 6, 1, 'carPanel');

  // chrome bumpers, tail lights, plate
  w.box(x - 1, sill, z - 1, W + 2, 3, 2, 'carTrim');
  w.box(x - 1, sill, z + L - 1, W + 2, 3, 2, 'carTrim');
  w.box(x + 1, sill + 3, z - 1, 5, 3, 1, 'tailLight');
  w.box(x + W - 6, sill + 3, z - 1, 5, 3, 1, 'tailLight');
  w.box(x + 8, sill + 3, z - 2, 6, 3, 1, 'paper');

  // wheels, in their arches
  for (const wz of [z + 9, z + L - 12]) for (const wx of [x - 1, x + W - 2]) {
    for (let k = -5; k <= 5; k++) for (let j = -5; j <= 5; j++) {
      const d = Math.hypot(k, j);
      if (d > 5) continue;
      for (let i = 0; i < 3; i++)
        w.set(wx + i, y + 6 + j, wz + k, d < 2.4 ? 'chrome' : 'rubber');
    }
    w.cut(wx - 1, y + 12, wz - 6, 4, 4, 13);        // the arch itself
  }
}

export function basketballHoop(w, x, y, z) {
  w.box(x, y, z, 2, 26, 2, 'metal');                 // pole against the garage
  w.box(x - 5, y + 19, z + 2, 12, 9, 1, 'woodPale');  // backboard
  for (let a = 0; a < 14; a++) {                     // the rim
    const th = a / 14 * Math.PI * 2;
    w.set(Math.round(x + 1 + Math.cos(th) * 5), y + 21, Math.round(z + 8 + Math.sin(th) * 5), 'plasticRed');
  }
  for (let a = 0; a < 14; a += 2) {                  // torn net
    const th = a / 14 * Math.PI * 2;
    const len = 2 + Math.round(hash3(a, 0, 0) * 4);
    for (let j = 1; j <= len; j++)
      w.set(Math.round(x + 1 + Math.cos(th) * 4), y + 21 - j, Math.round(z + 8 + Math.sin(th) * 4), 'paper');
  }
}
