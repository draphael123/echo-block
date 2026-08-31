// A parade of two shops — the buildings on this street you can walk into.
//
// Structurally these are the opposite of the houses on purpose: brick not
// clapboard, a flat roof with a parapet not a gable, a full-height glazed front
// not punched windows. A street where every building is built the same way
// reads as a texture rather than a place.
//
// Interiors need three things the houses never did — a floor inside, a doorway
// that is a HOLE rather than a door slab, and a lintel high enough to clear the
// walk field's headroom band (see walk.js). They also need to be big enough to
// walk AROUND in: a room you cross in two paces is a cupboard, and the first
// version of this was a cupboard.
import { hash3 } from './voxel.js';

const brickFn = (px, py, pz) => (hash3(px, py, pz) > 0.84 ? 'brickDark' : 'brick');

// Fascia lettering, one voxel per stroke. Deliberately crude — at this scale a
// shop sign is a shape you recognise, not text you read.
const GLYPHS = {
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  E: ['#####', '#....', '###..', '#....', '#####'],
  ' ': ['.....', '.....', '.....', '.....', '.....'],
};

function sign(w, text, x, y, z, colour, scale = 1) {
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) { cx += 4 * scale; continue; }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (g[r][c] !== '#') continue;
      for (let sx = 0; sx < scale; sx++) for (let sy = 0; sy < scale; sy++)
        w.set(cx + c * scale + sx, y + (4 - r) * scale + sy, z, colour);
    }
    cx += 6 * scale + scale;
  }
  return cx - x;
}

// A gondola: shelving that reads as stocked, and blocks — which is what turns
// the inside of the store into somewhere to move around rather than a box.
function gondola(w, x, y, z, wid, dep) {
  const H = 22;
  w.box(x, y + 1, z, wid, H, dep, 'metalDark');
  w.box(x, y + 1, z, wid, 2, dep, 'concreteOld');                  // kick plate
  for (let sh = 5; sh < H; sh += 5) {
    w.box(x, y + sh - 1, z, wid, 1, dep, 'metal');
    for (let i = 1; i < wid - 1; i++) for (let k = 1; k < dep - 1; k++) {
      const r = hash3(x + i, sh, z + k);
      if (r < 0.22) continue;
      const c = r > 0.9 ? 'plasticRed' : r > 0.76 ? 'plasticBlue'
        : r > 0.6 ? 'flowerB' : r > 0.44 ? 'binGreen' : 'paper';
      w.set(x + i, y + sh, z + k, c);
      if (r > 0.66) w.set(x + i, y + sh + 1, z + k, c);
    }
  }
  w.box(x + (wid >> 1) - 3, y + 34, z + (dep >> 1), 7, 4, 1, 'paper');   // aisle marker
}

export function shopParade(w, lid, neon, anchors, x, z) {
  // LIFT is where the front wall stops being collision and starts being lid.
  // It has to leave a stall riser TALLER than the walk field step height, or
  // the riser is just a kerb you climb and the shop window is a doorway.
  const W = 250, D = 108, WALL = 42, LIFT = 7;
  const y = 2;                                   // GROUND — the pavement level
  const fz = z;                                  // front face, looking -Z
  const top = y + 1 + WALL;
  const STORE_W = 150;
  const DH = 32;                                 // door height: clears headroom

  // ---- carcass
  w.shell(x, y + 1, z, W, WALL, D, 2, brickFn, { top: false, bottom: false });
  // The whole front wall above the stall riser goes into the lid, so taking the
  // lid away leaves both shops open to the camera.
  for (let i = 0; i < W; i++) for (let j = LIFT; j < WALL; j++) for (let k = 0; k < 2; k++) {
    const c = w.get(x + i, y + 1 + j, z + k);
    if (c) { lid.set(x + i, y + 1 + j, z + k, c); w.clear(x + i, y + 1 + j, z + k); }
  }
  lid.box(x, top, z, W, 2, D, 'concreteOld');
  lid.shell(x - 1, top + 2, z - 1, W + 2, 6, D + 2, 2, 'brickDark', { top: false, bottom: false });
  lid.box(x - 2, top + 8, z - 2, W + 4, 1, D + 4, 'concreteOld');   // coping
  w.box(x + STORE_W, y + 1, z, 4, WALL, D, brickFn);                // party wall
  lid.box(x + 34, top + 2, z + 40, 26, 12, 22, 'metal');            // roof plant
  lid.box(x + 38, top + 14, z + 46, 18, 2, 12, 'metalDark');
  lid.box(x + 186, top + 2, z + 56, 14, 14, 14, 'metalDark');
  for (const vx of [x + 96, x + 214]) lid.box(vx, top + 2, z + 20, 8, 7, 8, 'metal');

  // ---- shopfronts
  const GY0 = y + 8, GY1 = y + 34;
  const glaze = (gx, gw) => {
    w.cut(gx, GY0, fz, gw, GY1 - GY0, 2);
    lid.box(gx, GY0, fz - 1, gw, GY1 - GY0, 1, 'glassDark');
    for (let i = 0; i <= gw; i += 15) lid.box(gx + i, GY0, fz, 1, GY1 - GY0, 1, 'metalDark');
    lid.box(gx - 1, GY1, fz, gw + 2, 2, 1, 'metalDark');
    w.box(gx - 1, GY0 - 1, fz, gw + 2, 1, 1, 'concreteOld');
  };
  glaze(x + 6, 54);                              // store, left of the doors
  glaze(x + 98, 46);                             // store, right of the doors
  glaze(x + STORE_W + 8, 22);                    // laundromat, left of its door
  glaze(x + STORE_W + 60, 34);                   // laundromat, right

  // ---- doorways. Cut through the stall riser too, or the walk field finds a
  // three-voxel step in the threshold and refuses it.
  const doorway = (dx, dw) => {
    w.cut(dx, y + 1, fz, dw, DH, 2);
    lid.box(dx - 2, y + DH + 1, fz, dw + 4, 3, 2, 'metalDark');     // lintel
    w.box(dx - 1, y + 1, fz, 1, DH, 2, 'metalDark');                // jambs
    w.box(dx + dw, y + 1, fz, 1, DH, 2, 'metalDark');
    w.box(dx, y, fz - 1, dw, 1, 4, 'concreteOld');                  // threshold
  };
  const SDX = x + 66, SDW = 26;
  doorway(SDX, SDW);
  w.box(SDX + 1, y + 2, fz + 3, 1, DH - 4, 14, 'doorBlue');         // leaves, folded back
  w.box(SDX + SDW - 2, y + 2, fz + 3, 1, DH - 4, 14, 'doorBlue');
  const LDX = x + STORE_W + 34, LDW = 22;
  doorway(LDX, LDW);
  w.box(LDX + LDW - 2, y + 2, fz + 3, 1, DH - 4, 12, 'doorBlue');

  // ---- fascia, signs, awning
  lid.box(x - 1, y + 35, fz - 1, W + 2, 13, 2, 'doorBlue');
  const nameW = sign(neon, 'MARLOWS', x + 14, y + 37, fz - 2, 'neonSign', 2);
  sign(lid, 'LAUNDRY', x + STORE_W + 14, y + 38, fz - 2, 'shelterTube', 1);
  for (let i = 0; i < W; i++)
    lid.box(x + i, y + 34, fz - 10, 1, 1, 10, ((i / 9) | 0) % 2 ? 'phoneRed' : 'paper');
  lid.box(x, y + 34, fz - 11, W, 3, 1, 'metalDark');
  // posts clear of BOTH doorways
  for (const px of [x + 2, x + 60, x + STORE_W - 8, x + STORE_W + 24, x + W - 6])
    w.box(px, y + 1, fz - 11, 2, 33, 2, 'metalDark');

  // ---- MARLOW'S, inside
  const ix0 = x + 4, ix1 = x + STORE_W - 2, iz1 = z + D - 3;
  for (let i = ix0; i < ix1; i++) for (let k = fz + 3; k < iz1; k++)
    w.set(i, y, k, ((i >> 2) + (k >> 2)) % 2 ? 'concrete' : 'paper');

  for (const gx of [x + 24, x + 56, x + 88, x + 120])
    gondola(w, gx, y, fz + 34, 12, 58);
  // checkout beside the door, where it always is
  w.box(x + 8, y + 1, fz + 8, 44, 13, 10, 'woodPale');
  w.box(x + 7, y + 14, fz + 7, 46, 2, 12, 'slatWood');
  w.box(x + 38, y + 16, fz + 11, 8, 7, 6, 'metalDark');            // the till
  w.set(x + 42, y + 23, fz + 11, 'radioDial');
  w.box(x + 8, y + 1, fz + 20, 6, 16, 6, 'plasticRed');            // bagging stand
  // chiller wall along the back, with its own cold light
  w.box(ix0, y + 1, iz1 - 10, ix1 - ix0, 30, 10, 'metalDark');
  w.box(ix0 + 3, y + 6, iz1 - 11, ix1 - ix0 - 6, 20, 1, 'chillGlow');
  for (let b = 0; b < 3; b++)                                      // produce bins
    w.box(x + 116 + b * 12, y + 1, fz + 8, 10, 9, 16, b === 1 ? 'binGreen' : 'slatWood');
  for (let t = 0; t < 3; t++)                                      // trolleys in the lobby
    w.box(x + 98 + t * 3, y + 1, fz + 28, 9, 13, 14, 'chrome');
  for (const sz of [fz + 16, fz + 38, fz + 60, fz + 82])
    w.box(x + 10, y + 40, sz, STORE_W - 24, 1, 4, 'stripLight');

  anchors.door = [SDX + SDW / 2, y, fz - 8];
  anchors.shopLights = [
    [x + Math.round(STORE_W * 0.32), y + 32, fz + 26],
    [x + Math.round(STORE_W * 0.68), y + 32, fz + 56],
    [x + Math.round(STORE_W * 0.4), y + 32, fz + 88],
  ];
  anchors.signLights = [
    [x + 14 + nameW / 2, y + 40, fz - 8],
    [x + STORE_W + 40, y + 40, fz - 8],
  ];
  anchors.keeper = [x + 30, y, fz + 22];          // behind the counter

  // ---- the laundromat, inside
  const lx0 = x + STORE_W + 6, lx1 = x + W - 3;
  for (let i = lx0; i < lx1; i++) for (let k = fz + 3; k < iz1; k++)
    w.set(i, y, k, ((i >> 3) + (k >> 3)) % 2 ? 'concreteOld' : 'concrete');
  for (let i = 0; i < 7; i++) {                                    // washers
    w.box(lx0 + 2 + i * 12, y + 1, fz + 34, 11, 18, 12, 'paper');
    w.box(lx0 + 5 + i * 12, y + 8, fz + 33, 5, 6, 1, i === 2 ? 'chillGlow' : 'glassDark');
    w.box(lx0 + 2 + i * 12, y + 19, fz + 34, 11, 1, 12, 'metal');
  }
  for (let i = 0; i < 6; i++) {                                    // dryers, facing them
    w.box(lx0 + 6 + i * 13, y + 1, fz + 72, 12, 20, 12, 'metal');
    w.box(lx0 + 9 + i * 13, y + 9, fz + 71, 6, 6, 1, 'glassDark');
  }
  w.box(lx0 + 24, y + 1, fz + 54, 44, 10, 12, 'slatWood');         // folding table
  w.box(lx0 + 26, y + 11, fz + 56, 12, 4, 8, 'fabricPale');
  // chairs at the window, with a gangway left in front of the door
  for (const cx of [6, 22, 70, 86]) {
    w.box(lx0 + cx, y + 1, fz + 10, 8, 8, 8, 'plasticBlue');
    w.box(lx0 + cx, y + 9, fz + 10, 8, 9, 2, 'plasticBlue');
  }
  w.box(lx0 + 2, y + 1, fz + 92, 9, 14, 9, 'plasticRed');          // a basket left out
  for (const sz of [fz + 20, fz + 54, fz + 88])
    w.box(lx0 + 4, y + 40, sz, 84, 1, 4, 'stripLight');
  anchors.laundryLight = [lx0 + 44, y + 32, fz + 52];
  anchors.laundryDoor = [LDX + LDW / 2, y, fz - 8];
  anchors.folder = [lx0 + 16, y, fz + 52];        // in the gangway, not on a machine

  return { x, z, W, D, front: fz, storeW: STORE_W };
}
