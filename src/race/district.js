// Districts.
//
// The first circuit had houses all the way round, and it read as one street
// bent into a loop: you could not tell the second corner from the fourth, and
// there was nothing to remember a lap BY. These are the buildings that make
// each stretch somewhere different — a chapel, a mill, a goods yard, a farm.
//
// They are built for a car at eighty in the dark, which sets the rules:
//
//   1. SILHOUETTE FIRST. A spire, a chimney, a gambrel roof and a gantry read
//      at 300 voxels; clapboard banding does not. Detail below about six
//      voxels is invisible at this speed and costs the same as detail you see.
//   2. LIT WINDOWS ARE THE LIFE. An unlit mass at night is a hole in the fog.
//      One warm rectangle in a wall does more than any amount of geometry.
//   3. SHELLS, NOT SOLIDS. These are big, and a solid mill is a quarter of a
//      million voxels of brick nobody can ever see the inside of.
import { VoxWorld, hash3 } from '../voxel.js';
import { cyl, ball, tree, treePoplar, treeBare } from '../props.js';

// A horizontal course round a building: a plinth, a sill band, a parapet.
//
// This exists because writing one as a solid box is the single most expensive
// mistake in this file and it is invisible from the outside. The mill's five
// brick bands were 122 x 2 x 152 slabs — 185,000 voxels, more than the walls
// they sit on, for a two-voxel visible edge. Always rim, never fill.
function rim(w, x, y, z, wid, h, dep, t, c) {
  w.box(x, y, z, wid, h, t, c);
  w.box(x, y, z + dep - t, wid, h, t, c);
  w.box(x, y, z + t, t, h, dep - t * 2, c);
  w.box(x + wid - t, y, z + t, t, h, dep - t * 2, c);
}

// A seeded pick, so a district's clutter is varied but the same every build.
const pick = (arr, x, z, salt) => arr[Math.floor(hash3(x, salt || 0, z) * arr.length) % arr.length];

// A lit window. Two thirds of the time it is on — a terrace where every pane
// is burning reads as an office block.
function pane(w, x, y, z, wid, h, dir, seed, always, warmOnly) {
  const r = hash3(x + seed, y, z);
  // warmOnly exists because winTV in a chapel is a television in a church.
  const lit = warmOnly
    ? (r > 0.6 ? 'winWarm' : 'winWarmDim')
    : (r > 0.72 ? 'winWarm' : (r > 0.44 ? 'winWarmDim' : 'winTV'));
  const c = always || r > 0.34 ? lit : 'glassDark';
  if (dir === 'x') w.box(x, y, z, wid, h, 1, c);
  else w.box(x, y, z, 1, h, wid, c);
}

// ------------------------------------------------------------------ chapel
// The one landmark on the circuit. A spire is the only thing on this track
// visible from the far side of it, which is what a landmark is for.
export function chapel(w, x, y, z) {
  const NAVE_W = 46, NAVE_D = 96, WALL = 54;

  w.shell(x, y, z, NAVE_W, WALL, NAVE_D, 2, 'concreteOld', { top: false, bottom: false });
  // Pitched roof, gable running along z — the two SLOPES only. Filling the
  // triangle is a couple of thousand voxels of roof void per building, and on
  // this circuit that is the difference between a district and a stall.
  for (let k = 0; k <= NAVE_W >> 1; k++) {
    const c = k % 3 ? 'shingleDark' : 'shingle';
    w.box(x + k, y + WALL + k, z, 2, 1, NAVE_D, c);
    w.box(x + NAVE_W - k - 2, y + WALL + k, z, 2, 1, NAVE_D, c);
  }
  // lancet windows down both flanks, tall and narrow
  for (let k = 14; k < NAVE_D - 14; k += 22) {
    for (const wx of [x - 1, x + NAVE_W]) {
      // A lancet is a TALL SLOT. The extra ball on top was a second emitter
      // sitting on the first, and under the bloom pass the pair came out as a
      // glowing orb bigger than the window it was meant to be part of.
      pane(w, wx, y + 12, z + k, 4, 30, 'z', k, false, true);
      w.box(wx, y + 42, z + k + 1, 1, 2, 2, 'winWarmDim');       // the arch head
    }
  }

  // tower at the near end, then the spire
  const TW = 30, tx = x + ((NAVE_W - TW) >> 1), tz = z + NAVE_D - 6;
  w.shell(tx, y, tz, TW, 96, TW, 3, 'concreteOld', { top: false, bottom: false });
  for (const [ox, oz, d] of [[-1, 4, 'z'], [TW, 4, 'z'], [4, -1, 'x'], [4, TW, 'x']])
    pane(w, tx + ox, y + 60, tz + oz, 6, 16, d === 'x' ? 'x' : 'z', 7, true, true);
  // clock face
  w.box(tx + 9, y + 76, tz - 1, 12, 12, 1, 'paper');
  w.box(tx + 14, y + 80, tz - 2, 2, 5, 1, 'metalDark');
  w.box(tx + 14, y + 82, tz - 2, 5, 2, 1, 'metalDark');
  for (let k = 0; k < 40; k++) {                 // the spire, as a skin
    const r = Math.max(1, 15 - Math.round(k * 0.36));
    const c = k % 4 === 3 ? 'metalDark' : 'shingleDark';
    const d = r * 2;
    w.box(tx + 15 - r, y + 96 + k, tz + 15 - r, d, 1, 2, c);
    w.box(tx + 15 - r, y + 96 + k, tz + 13 + r, d, 1, 2, c);
    w.box(tx + 15 - r, y + 96 + k, tz + 15 - r, 2, 1, d, c);
    w.box(tx + 13 + r, y + 96 + k, tz + 15 - r, 2, 1, d, c);
  }
  w.box(tx + 14, y + 136, tz + 15, 2, 9, 1, 'chrome');
  w.box(tx + 12, y + 140, tz + 15, 6, 2, 1, 'chrome');
}

export function gravestones(w, x, y, z, wid, dep, seed) {
  for (let a = 6; a < wid; a += 17) for (let b = 6; b < dep; b += 21) {
    const r = hash3(x + a, seed, z + b);
    if (r < 0.28) continue;
    const h = 7 + Math.round(r * 7);
    w.box(x + a, y, z + b, 5, h, 2, r > 0.7 ? 'concrete' : 'concreteOld');
    if (r > 0.86) {                              // a cross, for a couple of them
      w.box(x + a + 1, y + h, z + b, 3, 6, 2, 'concreteOld');
      w.box(x + a - 1, y + h + 2, z + b, 7, 2, 2, 'concreteOld');
    }
  }
}

// -------------------------------------------------------------------- mill
// Brick, sawtooth roof, one stack. Deliberately the largest single mass on the
// circuit: mill lane is unlit, and a shape that big going past in the dark is
// most of what that stretch has.
export function mill(w, x, y, z) {
  const MW = 120, MD = 150, WALL = 76;
  w.shell(x, y, z, MW, WALL, MD, 2, 'brickDark', { top: false, bottom: false });
  // brick banding, so it is not one flat value
  for (let k = 12; k < WALL; k += 14)
    rim(w, x - 1, y + k, z - 1, MW + 2, 2, MD + 2, 2, 'brick');

  // sawtooth roof — north lights, which is what a mill has and what makes the
  // roofline read as industrial instead of as a warehouse box
  for (let k = 0; k < MD - 8; k += 30) {
    w.box(x, y + WALL, z + k, MW, 2, 30, 'metalDark');
    for (let j = 0; j < 16; j++)
      w.box(x, y + WALL + j, z + k + 16 + Math.round(j * 0.85), MW, 1, 1, 'metalDark');
    w.box(x + 2, y + WALL + 2, z + k + 14, MW - 4, 13, 1, 'winWarmDim');
  }

  // windows: big industrial grids, mostly dark, a couple still working
  for (let k = 16; k < MD - 16; k += 26) {
    for (const wx of [x - 1, x + MW]) {
      pane(w, wx, y + 16, z + k, 16, 20, 'z', k, false);
      for (let m = 0; m < 16; m += 5) w.box(wx, y + 16, z + k + m, 1, 20, 1, 'metalDark');
      pane(w, wx, y + 44, z + k, 16, 20, 'z', k + 3, false);
    }
  }

  // the stack
  const sx = x + MW + 14, sz = z + 24;
  cyl(w, sx, y, sz, 13, 6, 'brick');
  cyl(w, sx, y + 6, sz, 11, 150, 'brickDark', true);
  for (let k = 20; k < 150; k += 26) cyl(w, sx, y + k, sz, 12, 2, 'brick');
  cyl(w, sx, y + 156, sz, 12, 3, 'metalDark');

  // loading bay, so the ground floor is not a blank wall
  w.box(x + 30, y, z - 2, 34, 30, 3, 'metalDark');
  w.box(x + 30, y + 30, z - 3, 34, 3, 5, 'rust');
  w.box(x + 44, y + 2, z - 4, 6, 14, 1, 'winWarm');

  // Yard lamps on the road-facing wall. Mill lane has no streetlights, and
  // without these the biggest mass on the circuit is a darker patch of nothing
  // — you drive the whole leg without ever knowing the mill is there. The
  // absence of STREET lighting is the mechanic; a building being invisible is
  // just a building nobody drew.
  for (const ox of [16, 60, 104]) {
    w.box(x + ox, y + 46, z - 4, 3, 3, 4, 'metalDark');
    w.box(x + ox - 3, y + 42, z - 6, 9, 4, 7, 'metalDark');
    w.box(x + ox - 2, y + 42, z - 6, 7, 1, 6, 'sodium');
  }
  // and a lit sign over the bay
  w.box(x + 28, y + 36, z - 5, 38, 8, 1, 'metalDark');
  w.box(x + 31, y + 38, z - 6, 32, 4, 1, 'winWarm');   // amber: neonSign is shop-pink and reads as a nightclub
}

export function silo(w, x, y, z, r, h) {
  cyl(w, x, y, z, r + 1, 3, 'concreteOld');
  cyl(w, x, y + 3, z, r, h, 'metal', true);
  for (let k = 10; k < h; k += 16) cyl(w, x, y + 3 + k, z, r + 1, 2, 'metalDark');
  for (let k = 0; k <= r; k++) cyl(w, x, y + 3 + h + k, z, r - k, 1, 'rust');
  // the ladder, which is the thing that says "this is a silo, not a tank"
  for (let k = 4; k < h; k += 3) w.box(x + r, y + k, z - 1, 1, 1, 3, 'metalDark');
}

// Sparse enough to read as mesh, CONTINUOUS enough to be a fence.
//
// The first version wrote its wires only on every second column and its top
// rail at 22 — above the 19-voxel head height the collision field checks — so
// half the columns contained nothing it could catch and you could drive a car
// straight between the wires. It looked like a fence and behaved like a row of
// posts. Every column now carries two rails low enough to count.
export function chainFence(w, x, y, z, len, dir, h = 22) {
  for (let i = 0; i < len; i++) {
    const px = dir === 'x' ? x + i : x, pz = dir === 'x' ? z : z + i;
    if (i % 22 === 0) { w.box(px, y, pz, 2, h + 3, 2, 'metalDark'); continue; }
    w.set(px, y + 3, pz, 'metalDark');            // bottom rail, every column
    w.set(px, y + 13, pz, 'metalDark');           // mid rail, every column
    if (i % 2 === 0) for (let k = 5; k < h; k += 4) w.set(px, y + k, pz, 'metal');
    w.set(px, y + h, pz, 'metalDark');            // top rail
  }
}

export function pallets(w, x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const r = hash3(x, i, z);
    const h = 3 + Math.round(r * 3);
    for (let k = 0; k < h; k++)
      w.box(x + Math.round(r * 4), y + k * 4, z + i * 16, 24, 3, 14, k % 2 ? 'wood' : 'woodPale');
  }
}

export function oilDrums(w, x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const r = hash3(x + i, 3, z);
    cyl(w, x + (i % 3) * 14, y, z + ((i / 3) | 0) * 14, 6, 16, r > 0.5 ? 'rust' : 'plasticBlue');
  }
}

// --------------------------------------------------------------- the yard
// A goods yard behind a retaining wall: the road is in a cutting here, which
// is why the section is called the cut and why it has no streetlights.
export function retainingWall(w, x, y, z, len, dir, h = 40) {
  for (let i = 0; i < len; i++) {
    const px = dir === 'x' ? x + i : x, pz = dir === 'x' ? z : z + i;
    for (let k = 0; k < h; k++)
      w.set(px, y + k, pz, (k >> 2) % 2 ? 'brickDark' : 'brick');
    w.set(px, y + h, pz, 'concreteOld');
    // buttresses, so a 600-voxel wall is not one unbroken slab
    if (i % 60 < 6) for (let k = 0; k < h; k++) {
      if (dir === 'x') w.box(px, y + k, pz - 4, 1, 1, 4, 'brickDark');
      else w.box(px - 4, y + k, pz, 4, 1, 1, 'brickDark');
    }
  }
}

export function signalGantry(w, x, y, z, span) {
  w.box(x, y, z, 4, 74, 4, 'metalDark');
  w.box(x + span, y, z, 4, 74, 4, 'metalDark');
  w.box(x, y + 74, z, span + 4, 4, 4, 'metalDark');
  for (let i = 0; i < span; i += 8) w.box(x + i, y + 66, z + 1, 2, 10, 2, 'metalDark');
  for (const [ox, c] of [[14, 'signRed'], [span - 20, 'winWarmDim']]) {
    w.box(x + ox, y + 56, z - 2, 8, 18, 3, 'metalDark');
    ball(w, x + ox + 4, y + 66, z - 3, 3, c);
  }
}

// ------------------------------------------------------------------- farm
export function barn(w, x, y, z) {
  const BW = 78, BD = 104, WALL = 44;
  w.shell(x, y, z, BW, WALL, BD, 2, 'doorRed', { top: false, bottom: false });
  rim(w, x - 1, y, z - 1, BW + 2, 5, BD + 2, 3, 'concreteOld');
  // gambrel roof: two pitches, which is the shape that says barn
  let wid = BW, ry = y + WALL;
  const slope = (k, wd, c) => {
    const ox = x + ((BW - wd) >> 1);
    w.box(ox, ry + k, z, 3, 1, BD, c);
    w.box(ox + wd - 3, ry + k, z, 3, 1, BD, c);
  };
  for (let k = 0; k < 10; k++) { slope(k, wid, 'shingleDark'); wid -= 2; }
  ry += 10;
  for (let k = 0; wid > 6; k++) { slope(k, wid, k % 3 ? 'shingleDark' : 'shingle'); wid -= 5; }
  w.box(x + ((BW - wid) >> 1), ry + 8, z, wid + 2, 2, BD, 'shingleDark');   // ridge
  // the big door, half open, with the light on inside
  w.box(x + 22, y + 3, z - 2, 34, 34, 2, 'wood');
  w.box(x + 22, y + 3, z - 2, 16, 34, 2, 'winWarmDim');
  w.box(x + 20, y + 37, z - 3, 38, 3, 3, 'woodPale');
  for (const k of [14, 26]) w.box(x + 2, y + 16, z + k, 1, 12, 10, 'winWarmDim');
  // hay door in the gable
  w.box(x + 34, y + WALL + 4, z - 2, 12, 12, 2, 'wood');
}

export function haybales(w, x, y, z, n, seed) {
  for (let i = 0; i < n; i++) {
    const r = hash3(x + i, seed, z);
    const bx = x + (i % 3) * 22, bz = z + ((i / 3) | 0) * 20, h = r > 0.6 ? 2 : 1;
    for (let k = 0; k < h; k++)
      cyl(w, bx + 9, y + 9 + k * 18, bz + 9, 9, 18, r > 0.5 ? 'grassDry' : 'dirt');
  }
}

export function fieldGate(w, x, y, z, dir) {
  const L = 40;
  for (const i of [0, L]) {
    if (dir === 'x') w.box(x + i, y, z, 3, 26, 3, 'wood');
    else w.box(x, y, z + i, 3, 3, 26, 'wood');
  }
  for (const k of [6, 13, 20]) {
    if (dir === 'x') w.box(x, y + k, z, L, 2, 2, 'woodPale');
    else w.box(x, y + k, z, 2, 2, L, 'woodPale');
  }
}

// ------------------------------------------------------------------- park
export function goalposts(w, x, y, z) {
  w.box(x, y, z, 2, 46, 2, 'paper');
  w.box(x + 56, y, z, 2, 46, 2, 'paper');
  w.box(x, y + 46, z, 58, 2, 2, 'paper');
  for (let i = 2; i < 56; i += 4) w.box(x + i, y + 8, z + 1, 1, 38, 1, 'fabricPale');
}

export function parkShelter(w, x, y, z) {
  for (const [ox, oz] of [[0, 0], [30, 0], [0, 22], [30, 22]])
    w.box(x + ox, y, z + oz, 3, 32, 3, 'wood');
  w.box(x - 3, y + 32, z - 3, 39, 3, 31, 'shingleDark');
  w.box(x, y + 8, z + 22, 33, 3, 3, 'woodPale');
  w.box(x, y + 30, z, 33, 2, 25, 'wood');
  ball(w, x + 16, y + 29, z + 12, 2, 'porchBulb');
}

export function allotment(w, x, y, z, wid, dep, seed) {
  // beds, then a shed and a greenhouse: the shapes are small but a regular
  // grid of them reads instantly as allotments rather than as waste ground
  for (let a = 0; a < wid - 20; a += 26) for (let b = 0; b < dep - 16; b += 20) {
    const r = hash3(x + a, seed, z + b);
    w.box(x + a, y, z + b, 20, 1, 14, r > 0.5 ? 'dirt' : 'leafLitter');
    if (r > 0.62) for (let k = 2; k < 18; k += 4)
      w.box(x + a + k, y + 1, z + b + 2, 2, 5, 10, r > 0.8 ? 'flowerA' : 'leafMid');
    if (r < 0.18) {                               // canes
      for (let k = 0; k < 4; k++) w.box(x + a + 3 + k * 4, y + 1, z + b + 4, 1, 16, 1, 'wood');
      w.box(x + a + 3, y + 16, z + b + 4, 14, 1, 1, 'wood');
    }
  }
  const sx = x + wid - 20, sz = z + 4;
  w.shell(sx, y, sz, 18, 22, 16, 1, 'slatWood', { top: false, bottom: false });
  for (let k = 0; k <= 9; k++) w.box(sx + k, y + 22 + k, sz, 18 - k * 2, 1, 16, 'shingleDark');
  w.box(sx + 6, y + 2, sz - 1, 6, 14, 1, 'wood');
  w.box(sx - 1, y + 8, sz + 4, 1, 8, 8, 'winWarmDim');
}

export function greenhouse(w, x, y, z) {
  const GW = 24, GD = 44;
  rim(w, x, y, z, GW, 2, GD, 2, 'concreteOld');
  w.shell(x, y + 2, z, GW, 26, GD, 1, 'glassDark', { top: false, bottom: false });
  for (let k = 0; k < GD; k += 8) w.box(x - 1, y + 2, z + k, GW + 2, 26, 1, 'metalDark');
  for (let k = 0; k <= GW >> 1; k++)
    w.box(x + k, y + 28 + k, z, GW - k * 2, 1, GD, k % 4 ? 'glassDark' : 'metalDark');
  w.box(x + 4, y + 6, z + 4, GW - 8, 6, GD - 8, 'leafMid');
  ball(w, x + GW / 2, y + 22, z + GD / 2, 2, 'winWarmDim');
}

// ------------------------------------------------------------------ parade
// A terrace: shopfronts at street level with flats over them, built as ONE run
// rather than as separate buildings, because that party-wall continuity is the
// whole difference between a high street and a row of detached boxes.
const AWNING = ['plasticRed', 'plasticBlue', 'doorGreen', 'fabricBlue', 'signRed'];
export function terrace(w, x, y, z, units, dir = 'x', seed = 0) {
  const UW = 46, DEP = 48, GROUND_H = 34, UPPER = 30, TOP = GROUND_H + UPPER;
  const run = units * UW;
  const isX = dir === 'x';
  const W = isX ? run : DEP, Dp = isX ? DEP : run;

  // ONE shell for the whole run, not one per unit. A terrace HAS shared party
  // walls — building each unit as its own box both costs the shared walls twice
  // and quietly turns the row back into detached houses.
  w.shell(x, y, z, W, TOP, Dp, 1, 'brickDark', { top: false, bottom: false });

  for (let u = 0; u < units; u++) {
    const [bx, bz] = isX ? [x + u * UW, z] : [x, z + u * UW];
    const r = hash3(bx + seed, u, bz);
    const awn = pick(AWNING, bx, bz, seed);
    // a pilaster between units, in the other brick, standing in for the party
    // wall you would see on a real frontage
    if (isX) {
      w.box(bx, y, bz - 1, 3, TOP, 1, r > 0.5 ? 'brick' : 'brickDark');
      w.box(bx + 4, y + 5, bz - 1, UW - 8, 24, 1, 'carGlass');
      w.box(bx + 4, y, bz - 1, UW - 8, 5, 1, 'wood');
      w.box(bx + 4, y + 29, bz - 2, UW - 8, 5, 2, awn);
      if (r > 0.5) w.box(bx + 6, y + 30, bz - 3, UW - 12, 2, 1, 'neonSign');
      w.box(bx + 18, y + 5, bz - 2, 10, 22, 1, r > 0.4 ? 'winWarm' : 'glassDark');
      pane(w, bx + 7, y + GROUND_H + 6, bz - 1, 12, 16, 'x', u, false);
      pane(w, bx + 27, y + GROUND_H + 6, bz - 1, 12, 16, 'x', u + 5, false);
      w.box(bx + 5, y + GROUND_H + 4, bz - 2, 16, 1, 1, 'concrete');
      w.box(bx + 25, y + GROUND_H + 4, bz - 2, 16, 1, 1, 'concrete');
    } else {
      w.box(bx - 1, y, bz, 1, TOP, 3, r > 0.5 ? 'brick' : 'brickDark');
      w.box(bx - 1, y + 5, bz + 4, 1, 24, UW - 8, 'carGlass');
      w.box(bx - 1, y, bz + 4, 1, 5, UW - 8, 'wood');
      w.box(bx - 2, y + 29, bz + 4, 2, 5, UW - 8, awn);
      if (r > 0.5) w.box(bx - 3, y + 30, bz + 6, 1, 2, UW - 12, 'neonSign');
      w.box(bx - 2, y + 5, bz + 18, 1, 22, 10, r > 0.4 ? 'winWarm' : 'glassDark');
      pane(w, bx - 1, y + GROUND_H + 6, bz + 7, 12, 16, 'z', u, false);
      pane(w, bx - 1, y + GROUND_H + 6, bz + 27, 12, 16, 'z', u + 5, false);
      w.box(bx - 2, y + GROUND_H + 4, bz + 5, 1, 1, 16, 'concrete');
      w.box(bx - 2, y + GROUND_H + 4, bz + 25, 1, 1, 16, 'concrete');
    }
  }

  // The roofline is what makes it a terrace: one sill course between the
  // floors, one parapet, and a chimney stack on every party wall.
  rim(w, x - 1, y + GROUND_H, z - 1, W + 2, 2, Dp + 2, 2, 'concreteOld');
  rim(w, x - 1, y + TOP, z - 1, W + 2, 5, Dp + 2, 3, 'brickDark');
  rim(w, x - 1, y + TOP + 5, z - 1, W + 2, 1, Dp + 2, 3, 'concreteOld');
  for (let u = 0; u <= units; u++) {
    if (isX) w.box(x + u * UW - 3, y + TOP + 6, z + DEP - 20, 8, 16, 11, 'brickDark');
    else w.box(x + DEP - 20, y + TOP + 6, z + u * UW - 3, 11, 16, 8, 'brickDark');
  }
}

// ------------------------------------------------------------------- wood
// The unlit sweeper. No buildings at all: whatever the headlights find, which
// on this stretch is trunks going past and nothing behind them.
// FOUR trees, and small ones. A canopy is a ball, so its cost goes as the CUBE
// of the radius: dropping r from 16 to 11 is a third of the voxels for a shape
// that, going past at eighty in the dark, is a silhouette either way. Seven
// big ones per copse came to a million voxels of leaf across this leg alone.
export function copse(w, x, y, z, spread, seed) {
  for (let i = 0; i < 4; i++) {
    const r = hash3(x + i * 13, seed, z);
    const ox = Math.round((r - 0.5) * spread), oz = Math.round((hash3(z, i, x) - 0.5) * spread);
    const h = 32 + Math.round(r * 20);
    // three silhouettes rather than one, picked by the same seed everything
    // else in the district uses
    if (r > 0.72) treePoplar(w, x + ox, y, z + oz, h + 14, 7 + Math.round(r * 3));
    else if (r < 0.22) treeBare(w, x + ox, y, z + oz, h);
    else tree(w, x + ox, y, z + oz, h, 9 + Math.round(r * 5));
  }
}

// A prototype cache: these are blitted many times and building a mill from
// scratch at eight places round the circuit is eight times the work for the
// same voxels. Same trick the houses use.
export function proto(fn, ...args) {
  const w = new VoxWorld();
  fn(w, 0, 0, 0, ...args);
  return w;
}
