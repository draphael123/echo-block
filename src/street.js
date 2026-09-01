// Street furniture — the things that belong to the council rather than to a
// household. Once the block became a street it needed these, or every lot
// reads as a variation on the same lot.
import { hash3 } from './voxel.js';
import { cyl } from './props.js';

// Returns the position of the strip light inside, so the rig can hang a bulb.
export function busShelter(w, x, y, z, dir = 1) {
  const W = 34, D = 14, H = 26;
  w.box(x, y, z, W, 1, D, 'concreteOld');
  for (const cx of [x, x + W - 2]) {
    w.box(cx, y, z, 2, H, 2, 'metalDark');
    w.box(cx, y, z + D - 2, 2, H, 2, 'metalDark');
  }
  // back wall and one end glazed, the street side left open
  const back = dir > 0 ? z : z + D - 1;
  w.box(x + 2, y + 3, back, W - 4, H - 6, 1, 'glassDark');
  w.box(x, y + 3, z + 1, 1, H - 6, D - 2, 'glassDark');
  w.box(x - 1, y + H, z - 1, W + 2, 2, D + 2, 'metal');            // roof
  w.box(x + 6, y + H - 2, z + 3, W - 12, 1, 2, 'shelterTube');     // strip light
  w.box(x + 3, y + 8, back + dir * 2, W - 6, 2, 4, 'slatWood');    // bench
  w.box(x + 3, y + 1, back + dir * 3, 2, 7, 2, 'metalDark');
  w.box(x + W - 5, y + 1, back + dir * 3, 2, 7, 2, 'metalDark');
  w.box(x + 1, y + 12, back + dir, 8, 10, 1, 'paper');             // timetable
  return [x + W / 2, y + H - 3, z + D / 2];
}

// A 1986 phone box, lit from inside. It reads at any distance because it is
// the only tall saturated red thing on the street.
export function phoneBox(w, x, y, z) {
  const W = 11, D = 11, H = 30;
  w.shell(x, y, z, W, H, D, 1, 'phoneRed', { top: false, bottom: false });
  // lit from inside — at night the iconic thing about a phone box IS the
  // glow through its glazing; dark glass made it a monolith at the kerb
  w.box(x + 2, y + 5, z, W - 4, H - 12, 1, 'winWarmDim');
  w.box(x + 2, y + 5, z + D - 1, W - 4, H - 12, 1, 'winWarmDim');
  w.box(x, y + 5, z + 2, 1, H - 12, D - 4, 'winWarmDim');
  w.box(x + W - 1, y + 5, z + 2, 1, H - 12, D - 4, 'winWarmDim');
  w.box(x - 1, y + H, z - 1, W + 2, 3, D + 2, 'phoneRed');
  w.box(x + 1, y + H + 1, z - 2, W - 2, 2, 1, 'phoneGlow');        // sign panels
  w.box(x + 1, y + H + 1, z + D + 1, W - 2, 2, 1, 'phoneGlow');
  w.box(x + 3, y + 20, z + 2, 5, 5, 3, 'metalDark');               // the handset
  w.box(x + 2, y + H - 3, z + 2, W - 4, 1, D - 4, 'phoneGlow');
  return [x + W / 2, y + H - 5, z + D / 2];
}

export function bench(w, x, y, z, dir = 1) {
  for (let i = 0; i < 26; i++) {
    if (i % 4 === 3) continue;                                     // slat gaps
    w.box(x + i, y + 7, z, 1, 2, 9, 'slatWood');
    w.box(x + i, y + 9, z + (dir > 0 ? 8 : 0), 1, 9, 1, 'slatWood');
  }
  for (const cx of [x + 1, x + 22]) {
    w.box(cx, y, z + 1, 2, 7, 2, 'metalDark');
    w.box(cx, y, z + 6, 2, 7, 2, 'metalDark');
  }
}

export function swingSet(w, x, y, z) {
  const W = 30, H = 26;
  for (const cx of [x, x + W - 2]) {                               // A-frames
    for (let j = 0; j < H; j++) {
      const spread = Math.round((1 - j / H) * 5);
      w.box(cx, y + j, z + 4 - spread, 2, 1, 2, 'metal');
      w.box(cx, y + j, z + 4 + spread, 2, 1, 2, 'metal');
    }
  }
  w.box(x, y + H, z + 4, W, 2, 2, 'metal');
  for (const sx of [x + 7, x + 19]) {
    const drop = 15 + Math.round(hash3(sx, 0, z) * 4);
    for (let j = 0; j < drop; j++) {
      w.set(sx, y + H - j, z + 4, 'metalDark');
      w.set(sx + 4, y + H - j, z + 4, 'metalDark');
    }
    w.box(sx, y + H - drop, z + 3, 5, 1, 3, 'rubber');
  }
}

export function satelliteDish(w, x, y, z) {
  w.box(x + 2, y, z + 2, 2, 5, 2, 'metalDark');
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
    const d = Math.hypot(i, j);
    if (d > 5) continue;
    w.set(x + 3 + i, y + 8 + j, z + 3 + Math.round((d * d) / 12), 'paper');
  }
  w.box(x + 3, y + 8, z, 1, 1, 4, 'metalDark');
}

export function clothesline(w, x, y, z, len) {
  for (const cx of [x, x + len]) {
    w.box(cx, y, z, 2, 24, 2, 'wood');
    w.box(cx - 4, y + 22, z, 10, 2, 2, 'wood');
  }
  for (const oz of [0, 1])
    for (let i = 0; i <= len; i++) {
      const sag = Math.round(Math.sin((i / len) * Math.PI) * 3);
      w.set(x + i, y + 22 - sag, z + oz, 'metalDark');
    }
  let i = 8;
  while (i < len - 12) {
    const wd = 5 + Math.round(hash3(x + i, 3, z) * 5);
    const ht = 8 + Math.round(hash3(x + i, 7, z) * 8);
    const sag = Math.round(Math.sin((i / len) * Math.PI) * 3);
    w.box(x + i, y + 21 - sag - ht, z, wd, ht, 1,
      hash3(x + i, 11, z) > 0.5 ? 'fabricPale' : 'fabricBlue');
    i += wd + 4 + Math.round(hash3(x + i, 13, z) * 8);
  }
}

export function skip(w, x, y, z) {
  const W = 44, D = 20, H = 15;
  w.shell(x, y, z, W, H, D, 1, (px, py, pz) =>
    (hash3(px, py, pz) > 0.86 ? 'skipRust' : 'skipSteel'), { top: false });
  w.box(x - 1, y + H - 2, z - 1, W + 2, 2, D + 2, 'skipSteel');
  for (let i = 3; i < W - 3; i++) for (let k = 3; k < D - 3; k++) {
    const hh = Math.round((1 - Math.abs(i - W / 2) / (W / 2)) * 5 * hash3(x + i, 2, z + k));
    for (let j = 0; j < hh; j++)
      w.set(x + i, y + H - 3 + j, z + k, hash3(x + i, j, z + k) > 0.6 ? 'wood' : 'brickDark');
  }
}

export function roadCone(w, x, y, z) {
  for (let j = 0; j < 9; j++)
    cyl(w, x, y + j, z, j < 2 ? 3 : (j < 6 ? 2 : 1),
      1, (j > 3 && j < 6) ? 'paper' : 'coneOrange');
}

export function barrier(w, x, y, z, len) {
  for (const cx of [x, x + len - 2]) w.box(cx, y, z, 2, 12, 2, 'metalDark');
  for (let i = 0; i < len; i++)
    w.box(x + i, y + 9, z, 1, 3, 2, ((i >> 2) % 2) ? 'coneOrange' : 'paper');
}

export function signPost(w, x, y, z, kind) {
  w.box(x, y, z, 2, 30, 2, 'metalDark');
  if (kind === 'stop') {
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
      if (Math.abs(i) + Math.abs(j) > 7) continue;                 // octagon
      w.set(x + i, y + 30 + j, z, 'signRed');
    }
    w.box(x - 3, y + 29, z - 1, 7, 2, 1, 'signWhite');
  } else {
    w.box(x - 10, y + 28, z, 22, 5, 1, 'signGreen');
    w.box(x - 8, y + 30, z - 1, 18, 1, 1, 'signWhite');
  }
}

export function drain(w, x, y, z) {
  w.box(x, y, z, 8, 1, 5, 'metalDark');
  for (let i = 1; i < 7; i += 2) w.box(x + i, y, z + 1, 1, 1, 3, 'asphaltPatch');
}

export function flowerBed(w, x, y, z, wid, dep) {
  for (let i = 0; i < wid; i++) for (let k = 0; k < dep; k++) {
    if (i === 0 || k === 0 || i === wid - 1 || k === dep - 1) {
      w.box(x + i, y, z + k, 1, 2, 1, 'brickDark');
      continue;
    }
    w.set(x + i, y, z + k, 'dirt');
    const r = hash3(x + i, 5, z + k);
    if (r > 0.62) {
      w.set(x + i, y + 1, z + k, 'leafDark');
      if (r > 0.86) w.set(x + i, y + 2, z + k,
        r > 0.95 ? 'flowerC' : (r > 0.9 ? 'flowerA' : 'flowerB'));
    }
  }
}

// A platform wedged in a tree, which is the most 1986 thing on the street.
export function treehouse(w, x, y, z) {
  const W = 22, D = 20;
  w.box(x, y, z, W, 2, D, 'slatWood');
  for (let i = 0; i < W; i++) if (i % 5 !== 4) w.box(x + i, y + 2, z, 1, 8, 1, 'slatWood');
  for (let k = 0; k < D; k++) if (k % 5 !== 4) {
    w.box(x, y + 2, z + k, 1, 8, 1, 'slatWood');
    w.box(x + W - 1, y + 2, z + k, 1, 8, 1, 'slatWood');
  }
  w.box(x + 2, y + 10, z + 2, W - 4, 12, D - 4, 'slatWood');
  w.box(x + 6, y + 14, z + D - 3, 8, 7, 1, 'winWarmDim');          // a lit window
  w.gable(x + 1, y + 22, z + 1, W - 2, D - 2, 'shingleDark', { eave: 2, thick: 2 });
  for (let j = 0; j < 22; j++) {                                    // the ladder
    w.set(x + 3, y - j, z + D + 1, 'wood');
    w.set(x + 8, y - j, z + D + 1, 'wood');
    if (j % 3 === 0) w.box(x + 3, y - j, z + D + 1, 6, 1, 1, 'wood');
  }
  return [x + W / 2, y + 17, z + D];
}

export function wheelbarrow(w, x, y, z) {
  w.box(x, y + 3, z, 14, 5, 9, 'rust');
  w.box(x + 1, y + 8, z + 1, 12, 1, 7, 'dirt');
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++)
    if (Math.hypot(i, j) <= 3) w.set(x + 13 + i, y + 3 + j, z + 4, 'rubber');
  w.box(x - 6, y + 5, z + 1, 7, 1, 1, 'wood');
  w.box(x - 6, y + 5, z + 7, 7, 1, 1, 'wood');
  w.box(x + 2, y, z + 1, 1, 4, 1, 'metalDark');
  w.box(x + 2, y, z + 7, 1, 4, 1, 'metalDark');
}

export function milkCrates(w, x, y, z, n) {
  for (let c = 0; c < n; c++)
    w.shell(x + Math.round(hash3(x, c, z) * 3), y + c * 8, z + Math.round(hash3(z, c, x) * 3),
      10, 8, 10, 1, c % 2 ? 'plasticBlue' : 'plasticRed', { top: false, bottom: false });
}
