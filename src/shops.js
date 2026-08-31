// A parade of two shops, and the one building on the street you can walk into.
//
// Structurally these are the opposite of the houses on purpose: brick instead
// of clapboard, a flat roof with a parapet instead of a gable, a full-height
// glazed front instead of punched windows. A street where every building is
// built the same way reads as a texture rather than a place — the shops are
// what stop the row of houses being the only idea in the world.
//
// The store is the first building with a real interior, which needs three
// things the houses never did: a floor inside, a doorway that is a HOLE rather
// than a door slab, and a lintel high enough to clear the walk field's
// headroom band (see walk.js).
import { hash3 } from './voxel.js';

const brickFn = (px, py, pz) => (hash3(px, py, pz) > 0.84 ? 'brickDark' : 'brick');

// Fascia lettering, blocked out one voxel per stroke. Deliberately crude —
// at this scale a shop sign is a shape you recognise, not text you read.
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

function sign(w, text, x, y, z, colour) {
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) { cx += 4; continue; }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++)
      if (g[r][c] === '#') w.set(cx + c, y + (4 - r), z, colour);
    cx += 7;
  }
  return cx - x;
}

// Shelving that reads as stocked: a dark carcass with a band of mixed colour
// on each shelf. It also blocks, which is what makes the inside of the store
// somewhere to move around rather than an empty box.
function shelfRun(w, x, y, z, len, dir) {
  const H = 20;
  const wid = dir === 'x' ? len : 8, dep = dir === 'x' ? 8 : len;
  w.box(x, y + 1, z, wid, H, dep, 'metalDark');
  for (let sh = 4; sh < H; sh += 5) {
    for (let i = 1; i < wid - 1; i++) for (let k = 1; k < dep - 1; k++) {
      const r = hash3(x + i, sh, z + k);
      if (r < 0.25) continue;
      const c = r > 0.88 ? 'plasticRed' : r > 0.72 ? 'plasticBlue'
        : r > 0.56 ? 'flowerB' : r > 0.4 ? 'binGreen' : 'paper';
      w.set(x + i, y + sh, z + k, c);
      if (r > 0.7) w.set(x + i, y + sh + 1, z + k, c);
    }
  }
}

// `w` is the building; `lid` is everything the camera has to be able to take
// away to see inside — roof, parapet, fascia, awning and the glazed front.
// None of it is ever within the walk field's headroom band, so pulling it into
// a second mesh costs nothing in collision terms and buys a clean cutaway.
export function shopParade(w, lid, neon, anchors, x, z) {
  const W = 126, D = 64, WALL = 34, LIFT = 3;
  const y = 2;                                  // GROUND — the pavement level
  const fz = z;                                 // front face, looking -Z
  const top = y + 1 + WALL;
  const STORE_W = 78;

  // ---- carcass: brick box, flat roof, parapet
  w.shell(x, y + 1, z, W, WALL, D, 2, brickFn, { top: false, bottom: false });
  // lift the whole front wall above the stall riser into the lid, so taking
  // the lid away leaves the shop open to the camera
  for (let i = 0; i < W; i++) for (let j = LIFT; j < WALL; j++) for (let k = 0; k < 2; k++) {
    const c = w.get(x + i, y + 1 + j, z + k);
    if (c) { lid.set(x + i, y + 1 + j, z + k, c); w.clear(x + i, y + 1 + j, z + k); }
  }
  lid.box(x, top, z, W, 2, D, 'concreteOld');
  lid.shell(x - 1, top + 2, z - 1, W + 2, 5, D + 2, 2, 'brickDark', { top: false, bottom: false });
  lid.box(x - 2, top + 6, z - 2, W + 4, 1, D + 4, 'concreteOld');   // coping
  // a party wall between the two units, so it reads as two shops not one
  w.box(x + STORE_W, y + 1, z, 2, WALL, D, brickFn);
  // plant on the roof
  lid.box(x + 20, top + 2, z + 24, 22, 10, 18, 'metal');
  lid.box(x + 24, top + 12, z + 28, 14, 2, 10, 'metalDark');
  lid.box(x + 92, top + 2, z + 30, 10, 12, 10, 'metalDark');

  // ---- shopfronts: glazed from a low stall riser up to the fascia
  const GY0 = y + 4, GY1 = y + 27;
  const glaze = (gx, gw) => {
    w.cut(gx, GY0, fz, gw, GY1 - GY0, 2);
    lid.box(gx, GY0, fz - 1, gw, GY1 - GY0, 1, 'glassDark');
    for (let i = 0; i <= gw; i += 13) lid.box(gx + i, GY0, fz, 1, GY1 - GY0, 1, 'metalDark');
    lid.box(gx - 1, GY1, fz, gw + 2, 2, 1, 'metalDark');
    w.box(gx - 1, GY0 - 1, fz, gw + 2, 1, 1, 'concreteOld');
  };
  glaze(x + 4, 40);
  glaze(x + 64, 10);
  glaze(x + STORE_W + 6, 20);

  // ---- the door: a HOLE, not a slab. Cut through the stall riser as well or
  // the walk field finds a 3-voxel step in the threshold and refuses it.
  const DX_OFF = 54;
  const DX = x + DX_OFF - 8, DW = 16, DH = 27;
  w.cut(DX, y + 1, fz, DW, DH, 2);
  lid.box(DX - 2, y + DH + 1, fz, DW + 4, 2, 2, 'metalDark');     // lintel
  w.box(DX - 1, y + 1, fz, 1, DH, 2, 'metalDark');                // jambs
  w.box(DX + DW, y + 1, fz, 1, DH, 2, 'metalDark');
  w.box(DX, y, fz - 1, DW, 1, 3, 'concreteOld');                  // threshold
  // the open leaf, folded back against the inside of the jamb
  w.box(DX + 1, y + 2, fz + 3, 1, DH - 3, 12, 'doorBlue');

  // ---- fascia and sign
  lid.box(x - 1, y + 28, fz - 1, W + 2, 9, 2, 'doorBlue');
  // the sign goes in its own world so its material can flicker; a voxel
  // baked into the shared mesh can never change colour on its own
  const nameW = sign(neon, 'MARLOWS', x + 8, y + 30, fz - 2, 'neonSign');
  sign(lid, 'LAUNDRY', x + STORE_W + 4, y + 30, fz - 2, 'shelterTube');
  // awning over the pavement, striped
  for (let i = 0; i < W; i++)
    lid.box(x + i, y + 27, fz - 8, 1, 1, 8, ((i / 7) | 0) % 2 ? 'phoneRed' : 'paper');
  lid.box(x, y + 27, fz - 9, W, 3, 1, 'metalDark');
  // NOT x + W - 4: that lands the post inside the laundromat doorway
  for (const px of [x + 2, x + STORE_W - 4, x + STORE_W + 26])
    w.box(px, y + 1, fz - 9, 2, 26, 2, 'metalDark');

  // ---- inside the store
  const ix0 = x + 3, ix1 = x + STORE_W - 1, iz0 = fz + 3, iz1 = z + D - 3;
  for (let i = ix0; i < ix1; i++) for (let k = iz0; k < iz1; k++)
    w.set(i, y, k, ((i >> 2) + (k >> 2)) % 2 ? 'concrete' : 'paper');

  shelfRun(w, x + 12, y, fz + 20, 30, 'z');
  shelfRun(w, x + 34, y, fz + 20, 30, 'z');
  shelfRun(w, x + 56, y, fz + 20, 30, 'z');
  // the counter, beside the door where it always is
  w.box(x + 6, y + 1, fz + 8, 30, 12, 9, 'woodPale');
  w.box(x + 5, y + 13, fz + 7, 32, 2, 11, 'slatWood');
  w.box(x + 26, y + 15, fz + 10, 7, 6, 5, 'metalDark');           // the till
  w.set(x + 29, y + 21, fz + 10, 'radioDial');
  // chiller cabinet along the back, its own cold light
  w.box(ix0, y + 1, iz1 - 9, ix1 - ix0, 26, 9, 'metalDark');
  w.box(ix0 + 2, y + 5, iz1 - 10, ix1 - ix0 - 4, 18, 1, 'chillGlow');
  // ceiling strips, well above the headroom band so they never block anything
  for (const sz of [fz + 16, fz + 34, fz + 50])
    w.box(x + 8, y + 32, sz, STORE_W - 18, 1, 3, 'stripLight');

  anchors.door = [x + DX_OFF, y, fz - 6];
  anchors.shopLights = [
    [x + STORE_W / 2, y + 26, fz + 20],
    [x + STORE_W / 2, y + 26, fz + 46],
  ];
  anchors.signLights = [
    [x + 8 + nameW / 2, y + 32, fz - 6],
    [x + STORE_W + 22, y + 32, fz - 6],
  ];

  // ---- the laundromat gets a door of its own
  const LX = x + STORE_W + 30, LW = 15;
  w.cut(LX, y + 1, fz, LW, DH, 2);
  lid.box(LX - 2, y + DH + 1, fz, LW + 4, 2, 2, 'metalDark');
  w.box(LX - 1, y + 1, fz, 1, DH, 2, 'metalDark');
  w.box(LX + LW, y + 1, fz, 1, DH, 2, 'metalDark');
  w.box(LX, y, fz - 1, LW, 1, 3, 'concreteOld');
  w.box(LX + LW - 2, y + 2, fz + 3, 1, DH - 3, 11, 'doorBlue');

  // ---- the laundromat: lit, glazed, and now open. Machines in a row.
  const lx = x + STORE_W + 4;
  for (let i = lx; i < x + W - 3; i++) for (let k = fz + 3; k < z + D - 3; k++)
    w.set(i, y, k, 'concreteOld');
  for (let i = 0; i < 4; i++) {
    w.box(lx + 2 + i * 10, y + 1, fz + 26, 9, 16, 9, 'paper');
    w.box(lx + 4 + i * 10, y + 7, fz + 25, 5, 5, 1, 'glassDark');
    if (i === 1) w.box(lx + 4 + i * 10, y + 7, fz + 25, 5, 5, 1, 'chillGlow');
  }
  for (let i = 0; i < 3; i++)                                     // dryers opposite
    w.box(lx + 4 + i * 11, y + 1, fz + D - 22, 10, 17, 9, 'metal');
  w.box(lx, y + 1, fz + 10, 16, 8, 5, 'slatWood');                // the bench
  w.box(lx, y + 9, fz + 10, 16, 8, 1, 'slatWood');
  w.box(lx + 2, y + 1, fz + 40, 7, 12, 7, 'plasticBlue');         // a basket
  w.box(lx + 20, y + 34, fz + 6, 4, 1, 44, 'stripLight');
  anchors.laundryLight = [lx + 20, y + 26, fz + 26];
  anchors.laundryDoor = [LX + LW / 2, y, fz - 6];

  return { x, z, W, D, front: fz };
}
