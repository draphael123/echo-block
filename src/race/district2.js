// Districts for the other three areas of the city.
//
// Same rules as the first set: silhouette first, lit windows are the life,
// shells never solids. What changes is the material each area is made of —
// stone and render in the old town, steel and concrete at the docks, concrete
// and sodium on the ring road — because "a different part of town" has to be
// something you can see at eighty in the dark, not a label in the corner.
import { hash3 } from '../voxel.js';
import { cyl, ball } from '../props.js';

const pick = (arr, x, z, salt) => arr[Math.floor(hash3(x, salt || 0, z) * arr.length) % arr.length];

function pane(w, x, y, z, wid, h, dir, seed, warm) {
  const r = hash3(x + seed, y, z);
  const lit = warm ? (r > 0.6 ? 'winWarm' : 'winWarmDim')
    : (r > 0.72 ? 'winWarm' : (r > 0.44 ? 'winWarmDim' : 'winTV'));
  const c = r > 0.34 ? lit : 'glassDark';
  if (dir === 'x') w.box(x, y, z, wid, h, 1, c);
  else w.box(x, y, z, 1, h, wid, c);
}

function rim(w, x, y, z, wid, h, dep, t, c) {
  w.box(x, y, z, wid, h, t, c);
  w.box(x, y, z + dep - t, wid, h, t, c);
  w.box(x, y, z + t, t, h, dep - t * 2, c);
  w.box(x + wid - t, y, z + t, t, h, dep - t * 2, c);
}

// ======================================================== THE OLD TOWN
// Render over stone, shallow-pitched pantiles, shutters, and buildings that
// come right out to the kerb — which is the whole point of the place. On a
// 120-voxel road a frontage this close is most of what you can see.
const RENDER = ['concreteOld', 'concrete', 'sidingBdark', 'brickDark'];

export function stoneRow(w, x, y, z, units, seed = 0) {
  const UW = 38, DEP = 44, H1 = 30, H2 = 26, TOP = H1 + H2;
  const run = units * UW;
  w.shell(x, y, z, run, TOP, DEP, 1, 'concreteOld', { top: false, bottom: false });
  // a stone plinth, because old buildings sit on something
  rim(w, x - 1, y, z - 1, run + 2, 7, DEP + 2, 2, 'brickDark');

  for (let u = 0; u < units; u++) {
    const bx = x + u * UW;
    const r = hash3(bx + seed, u, z);
    const face = pick(RENDER, bx, z, seed);
    // each house is rendered a slightly different colour, which is exactly
    // what a row of old houses looks like and costs one box
    w.box(bx, y + 7, z - 1, UW - 1, TOP - 7, 1, face);
    // a door, and shuttered windows over it
    w.box(bx + 14, y + 7, z - 2, 10, 20, 1, r > 0.5 ? 'doorGreen' : 'doorRed');
    pane(w, bx + 5, y + 32, z - 2, 9, 13, 'x', u, true);
    pane(w, bx + 24, y + 32, z - 2, 9, 13, 'x', u + 3, true);
    if (r > 0.45) {                                   // shutters, thrown back
      w.box(bx + 3, y + 32, z - 3, 2, 13, 1, 'doorBlue');
      w.box(bx + 14, y + 32, z - 3, 2, 13, 1, 'doorBlue');
    }
    if (r > 0.7) {                                    // a lamp on a bracket
      w.box(bx + UW - 6, y + 40, z - 4, 2, 2, 4, 'metalDark');
      ball(w, bx + UW - 5, y + 39, z - 5, 3, 'sodium');
    }
  }
  // shallow pantile roof with a deep overhang, which is the southern-town tell
  for (let k = 0; k <= 8; k++)
    w.box(x - 3 + k, y + TOP + k, z - 3, run + 6 - k * 2, 1, DEP + 6, k % 3 ? 'shingleDark' : 'doorRed');
  for (let u = 0; u <= units; u += 2)
    w.box(x + u * UW - 2, y + TOP + 9, z + DEP - 16, 7, 13, 9, 'brickDark');
}

export function marketStalls(w, x, y, z, n, seed = 0) {
  const AWN = ['plasticRed', 'fabricBlue', 'doorGreen', 'shirtCream'];
  for (let i = 0; i < n; i++) {
    const sx = x + i * 30, r = hash3(sx, seed, z);
    for (const [ox, oz] of [[0, 0], [22, 0], [0, 16], [22, 16]])
      w.box(sx + ox, y, z + oz, 2, 22, 2, 'wood');
    w.box(sx - 2, y + 22, z - 2, 28, 2, 22, pick(AWN, sx, z, seed));
    w.box(sx + 1, y + 12, z + 2, 22, 3, 14, 'woodPale');       // the table
    // crates and produce, which is all anyone sees of a stall at speed
    for (let k = 0; k < 3; k++)
      w.box(sx + 2 + k * 7, y + 15, z + 4, 5, 4, 5,
        r > 0.5 ? (k % 2 ? 'flowerA' : 'flowerC') : (k % 2 ? 'grassDry' : 'flowerB'));
    if (r > 0.6) ball(w, sx + 11, y + 21, z + 8, 2, 'porchBulb');
  }
}

// The town wall, with a gate you drive through. A wall that runs beside the
// road is scenery; a wall the road goes THROUGH is a place.
export function townWall(w, x, y, z, len, dir, h = 46) {
  for (let i = 0; i < len; i++) {
    const px = dir === 'x' ? x + i : x, pz = dir === 'x' ? z : z + i;
    const t = dir === 'x' ? 8 : 8;
    for (let k = 0; k < h; k++)
      for (let d = 0; d < t; d++)
        if (d === 0 || d === t - 1 || k > h - 3)
          w.set(dir === 'x' ? px : px + d, y + k, dir === 'x' ? pz + d : pz,
            (k >> 2) % 2 ? 'concreteOld' : 'brickDark');
    if (i % 9 < 5) for (let d = 0; d < t; d++)                 // crenellations
      w.set(dir === 'x' ? px : px + d, y + h, dir === 'x' ? pz + d : pz, 'concreteOld');
  }
}

export function mewsYard(w, x, y, z, seed = 0) {
  // a walled yard with washing across it and one lit window looking in
  w.shell(x, y, z, 64, 26, 52, 2, 'brickDark', { top: false, bottom: false });
  w.cut(x + 24, y, z, 16, 22, 3);
  for (let k = 0; k < 3; k++) {
    const zz = z + 12 + k * 14;
    for (let i = 4; i < 60; i += 3) w.set(x + i, y + 22, zz, 'fence');
    for (let i = 6; i < 58; i += 11)
      w.box(x + i, y + 15, zz - 1, 6, 7, 2, pick(['fabricPale', 'shirtBlue', 'shirtCream'], x + i, zz, seed));
  }
  pane(w, x + 14, y + 10, z + 51, 10, 12, 'x', seed, true);
  ball(w, x + 32, y + 24, z + 26, 2, 'porchBulb');
}

// ============================================================ THE DOCKS
export function crane(w, x, y, z, h, reach) {
  for (const [ox, oz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]])
    for (let j = 0; j < h; j++) w.set(x + ox, y + j, z + oz, 'metalDark');
  for (let j = 10; j < h; j += 12)
    for (let i = -10; i <= 10; i++) { w.set(x + i, y + j, z - 10, 'metal'); w.set(x + i, y + j, z + 10, 'metal'); }
  // the jib, out over the water, with a hook on a wire
  w.box(x - 12, y + h, z - 4, 24, 6, 8, 'rust');
  for (let i = 0; i < reach; i++) {
    const yy = y + h + 4 + Math.round(i * 0.22);
    w.box(x + 10 + i, yy, z - 2, 1, 3, 4, 'rust');
    if (i % 14 === 0) w.set(x + 10 + i, yy + 3, z, 'metalDark');
  }
  for (let j = 0; j < 26; j++) w.set(x + 10 + reach - 4, y + h + Math.round(reach * 0.22) - j, z, 'metalDark');
  w.box(x + 8 + reach - 8, y + h + Math.round(reach * 0.22) - 30, z - 2, 6, 5, 5, 'metalDark');
  ball(w, x + 10 + reach - 6, y + h + Math.round(reach * 0.22) + 6, z, 2, 'tailLight');
}

const BOX_COLOURS = ['doorRed', 'doorBlue', 'doorGreen', 'rust', 'skipRust', 'doorYellow'];
export function containers(w, x, y, z, cols, rows, high, seed = 0) {
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const n = 1 + Math.floor(hash3(x + c * 7, seed, z + r * 5) * high);
    for (let k = 0; k < n; k++) {
      const bx = x + c * 62, by = y + k * 26, bz = z + r * 30;
      const col = pick(BOX_COLOURS, bx + k, bz, seed);
      w.shell(bx, by, bz, 60, 25, 28, 1, col, { bottom: false });
      for (let i = 2; i < 58; i += 4) w.box(bx + i, by + 2, bz - 1, 2, 21, 1, col);
      w.box(bx + 2, by + 8, bz - 2, 14, 6, 1, 'paper');       // the shipping line
    }
  }
}

export function shed(w, x, y, z, wid, dep) {
  const WALL = 46;
  w.shell(x, y, z, wid, WALL, dep, 2, 'metal', { top: false, bottom: false });
  for (let i = 0; i < wid; i += 4) w.box(x + i, y, z - 1, 2, WALL, 1, 'metalDark');
  // a shallow curved roof, which is what a dock shed has
  for (let k = 0; k <= 14; k++) {
    const inset = Math.round(k * k * 0.16);
    w.box(x + inset, y + WALL + k, z, wid - inset * 2, 1, dep, k % 4 ? 'metalDark' : 'rust');
  }
  for (let i = 14; i < wid - 14; i += 34) {
    w.box(x + i, y + 4, z - 2, 24, 26, 2, 'metalDark');       // roller doors
    w.box(x + i + 3, y + 6, z - 3, 18, 3, 1, 'winWarmDim');
    w.box(x + i + 9, y + 34, z - 3, 6, 2, 1, 'sodium');       // wall pack over the door
  }
  w.box(x + 6, y + WALL - 12, z - 2, wid - 12, 8, 1, 'winWarmDim');
  // Glazing on the FLANKS too. The front had a clerestory and the sides had
  // nothing, and from the road you mostly see a shed's side — an unlit metal
  // box at night reads as a hole in the fog, not a sleeping building. Mostly
  // dark panes, a few dim-warm, no grid: broken symmetry is what makes a flat
  // box read as built rather than generated.
  for (const fx of [x - 1, x + wid]) {
    for (let k = 8; k < dep - 10; k += 14) {
      const r = hash3(fx, k, z);
      w.box(fx, y + WALL - 13, z + k, 1, 9, 8, r > 0.68 ? 'winWarmDim' : (r > 0.3 ? 'glassDark' : 'metalDark'));
    }
  }
}

export function bollards(w, x, y, z, len, dir) {
  for (let i = 0; i < len; i += 26) {
    const px = dir === 'x' ? x + i : x, pz = dir === 'x' ? z : z + i;
    cyl(w, px, y, pz, 4, 9, 'metalDark');
    cyl(w, px, y + 9, pz, 5, 2, 'rust');
  }
}

// ========================================================= THE RING ROAD
// Overhead gantry signs, the thing that says motorway more than anything else.
export function gantrySign(w, x, y, z, span, dir) {
  const t = dir === 'x' ? [1, 0] : [0, 1];
  for (const end of [0, span]) {
    const px = x + t[0] * end, pz = z + t[1] * end;
    w.box(px - 2, y, pz - 2, 5, 62, 5, 'metalDark');
  }
  for (let i = 0; i <= span; i++)
    w.box(x + t[0] * i - 1, y + 62, z + t[1] * i - 1, 3, 5, 3, 'metalDark');
  const sx = x + t[0] * Math.round(span * 0.25), sz = z + t[1] * Math.round(span * 0.25);
  const wid = Math.round(span * 0.5);
  if (dir === 'x') {
    w.box(sx, y + 40, sz - 3, wid, 20, 2, 'signGreen');
    for (let i = 4; i < wid - 4; i += 9) w.box(sx + i, y + 46, sz - 4, 5, 3, 1, 'signWhite');
    w.box(sx, y + 38, sz - 4, wid, 2, 3, 'metalDark');
  } else {
    w.box(sx - 3, y + 40, sz, 2, 20, wid, 'signGreen');
    for (let i = 4; i < wid - 4; i += 9) w.box(sx - 4, y + 46, sz + i, 1, 3, 5, 'signWhite');
  }
}

// A tunnel is not new geometry — it is a roof over a road that already exists.
// The collision field only calls something blocked if it sits within head
// height of the floor, so a ceiling four metres up is free.
export function tunnelBore(w, x, y, z, halfWide, dir, lit) {
  const t = dir === 'x' ? [1, 0] : [0, 1], n = dir === 'x' ? [0, 1] : [1, 0];
  for (let u = -halfWide; u <= halfWide; u++) {
    const px = x + n[0] * u, pz = z + n[1] * u;
    const a = Math.abs(u);
    // the arch: springs from the walls and closes over the middle
    const top = Math.round(46 + Math.cos((a / halfWide) * Math.PI * 0.5) * 16);
    if (a > halfWide - 5) for (let k = 0; k < top; k++)
      w.set(px, y + k, pz, (k >> 2) % 2 ? 'concreteOld' : 'concrete');
    w.set(px, y + top, pz, 'concreteOld');
    w.set(px, y + top + 1, pz, 'concrete');
  }
  // a sodium tube down the crown, which is the whole look of a tunnel at night
  if (lit) w.box(x - t[0] * 3, y + 58, z - t[1] * 3, t[0] * 6 + 1, 1, t[1] * 6 + 1, 'sodium');
}

export function services(w, x, y, z) {
  const W = 120, D = 70;
  w.shell(x, y, z, W, 34, D, 2, 'concreteOld', { top: false, bottom: false });
  w.box(x - 3, y + 34, z - 3, W + 6, 4, D + 6, 'metalDark');
  w.box(x + 4, y + 6, z - 1, W - 8, 20, 1, 'carGlass');
  for (let i = 10; i < W - 10; i += 26) w.box(x + i, y + 6, z - 2, 12, 20, 1, 'winWarm');
  w.box(x + 20, y + 38, z - 2, W - 40, 8, 2, 'metalDark');
  w.box(x + 26, y + 40, z - 3, W - 52, 4, 1, 'neonSign');
  // the forecourt canopy and its pumps, lit like a stage
  const cx = x + W + 40;
  for (const [ox, oz] of [[0, 0], [56, 0], [0, 44], [56, 44]])
    w.box(cx + ox, y, z + oz, 5, 40, 5, 'metalDark');
  w.box(cx - 6, y + 40, z - 6, 73, 6, 61, 'concreteOld');
  w.box(cx - 4, y + 39, z - 4, 69, 1, 57, 'stripLight');
  for (const ox of [16, 40]) {
    w.box(cx + ox, y, z + 18, 8, 16, 12, 'metalDark');
    w.box(cx + ox + 1, y + 10, z + 17, 6, 4, 1, 'winWarmDim');
  }
}

export function embankment(w, x, y, z, len, dir, side, h = 30) {
  const n = dir === 'x' ? [0, 1] : [1, 0];
  for (let i = 0; i < len; i++) {
    const px = dir === 'x' ? x + i : x, pz = dir === 'x' ? z : z + i;
    for (let d = 0; d < h; d++) {
      const k = Math.round(d * 0.8);
      w.set(px + n[0] * d * side, y + k, pz + n[1] * d * side,
        hash3(px + d, k, pz) > 0.7 ? 'grassDry' : 'grass');
    }
  }
}

// ===================================================== SET PIECE: THE SHIP
// The road runs out onto a moored container ship and off the other end.
//
// This is the thing the Docks was missing. It had cranes and containers beside
// the road, which makes it the Parade with dock scenery on the verge — you
// drive PAST a dock. Driving ACROSS the deck of a ship is somewhere you can
// only be on this circuit, and it is the one bit of the lap anybody will
// describe to someone else afterwards.
//
// Built as a hull hanging BELOW the road rather than as a road laid on top of
// a hull, because the ribbon has already put the deck exactly where the
// elevation profile says it goes. All this has to do is make it look like the
// deck of something floating.
export function shipHull(w, x, y, z, halfWide, dir, depth) {
  const n = dir === 'x' ? [0, 1] : [1, 0];
  for (let u = -halfWide; u <= halfWide; u++) {
    const px = x + n[0] * u, pz = z + n[1] * u;
    const a = Math.abs(u);
    if (a < halfWide - 3) {
      // the deck plate, and the shadow under it
      w.set(px, y - 1, pz, 'metalDark');
      continue;
    }
    // the sheer: sides fall away and tuck in toward the waterline
    for (let k = 0; k < depth; k++) {
      const tuck = Math.round(Math.pow(k / depth, 2.2) * 9);
      const uu = u > 0 ? u - tuck : u + tuck;
      w.set(x + n[0] * uu, y - 1 - k, z + n[1] * uu,
        k < 3 ? 'rust' : ((k >> 2) % 2 ? 'skipSteel' : 'skipRust'));
    }
    // gunwale rail along the top
    w.set(px, y + 1, pz, 'metalDark');
    if (a === halfWide) for (let k = 2; k < 7; k += 2) w.set(px, y + k, pz, 'metal');
  }
}

// Stacks either side of the deck lane, which is what makes it a corridor.
export function deckCargo(w, x, y, z, off, dir, seed) {
  const n = dir === 'x' ? [0, 1] : [1, 0];
  for (const side of [-1, 1]) {
    const bx = x + n[0] * off * side, bz = z + n[1] * off * side;
    const high = 1 + Math.floor(hash3(bx, seed, bz) * 3);
    for (let k = 0; k < high; k++) {
      const col = pick(BOX_COLOURS, bx + k, bz, seed);
      if (dir === 'x') w.shell(bx - 14, y + k * 26, bz - 30, 28, 25, 60, 1, col, { bottom: false });
      else w.shell(bx - 30, y + k * 26, bz - 14, 60, 25, 28, 1, col, { bottom: false });
    }
  }
}

// The island: bridge, funnel, lit windows. Set to ONE side so the lane stays
// clear, and tall, because it is the thing you see from the far quay.
export function shipIsland(w, x, y, z) {
  w.shell(x, y, z, 46, 62, 40, 2, 'paper', { top: false, bottom: false });
  for (let k = 10; k < 58; k += 12)
    for (let i = 3; i < 43; i += 9) w.box(x + i, y + k, z - 1, 6, 5, 1, 'winWarmDim');
  // the wheelhouse, glazed the whole way round
  w.shell(x - 3, y + 62, z - 3, 52, 12, 46, 2, 'paper', { top: false, bottom: false });
  w.box(x - 2, y + 66, z - 4, 50, 7, 1, 'winWarm');
  w.box(x - 4, y + 74, z - 4, 54, 2, 48, 'metalDark');
  // funnel and mast
  cyl(w, x + 23, y + 76, z + 20, 9, 26, 'doorRed', true);
  cyl(w, x + 23, y + 96, z + 20, 10, 3, 'metalDark');
  for (let k = 0; k < 30; k++) w.set(x + 23, y + 78 + k, z + 6, 'metalDark');
  ball(w, x + 23, y + 110, z + 6, 2, 'tailLight');
}

// The ramp you drive up, with its side rails and a hinge at the quay.
export function roRoRamp(w, x, y, z, halfWide, dir, drop) {
  const n = dir === 'x' ? [0, 1] : [1, 0];
  for (const side of [-1, 1]) {
    const px = x + n[0] * halfWide * side, pz = z + n[1] * halfWide * side;
    for (let k = 0; k < 9; k++) w.set(px, y + k, pz, k > 6 ? 'coneOrange' : 'metalDark');
  }
  for (let u = -halfWide; u <= halfWide; u += 1) {
    const px = x + n[0] * u, pz = z + n[1] * u;
    for (let k = 1; k <= drop; k++) w.set(px, y - k, pz, 'metalDark');
  }
}

// ===================================================== THE VARIETY PASS
// Civic buildings shared between circuits — a pub, a petrol station, a
// billboard, a bell tower, a lighthouse. A lap that only passes frontage
// reads as texture; a lap that passes PLACES reads as a town. All follow the
// prototype convention: corner at (x, z), face at z + dep.

// The one warm room on the street. Big lit ground-floor windows, a string of
// bulbs over the door, a hanging sign — every town has the same pub, which is
// why sharing it between circuits is right rather than lazy.
export function pub(w, x, y, z) {
  const W = 72, D = 52, H = 46, fz = z + D - 1;
  w.shell(x, y, z, W, H, D, 1, 'brick', { bottom: false });
  w.box(x, y + H, z, W, 2, D, 'brickDark');                       // parapet
  w.box(x + 2, y + H + 1, z + 2, W - 4, 1, D - 4, 'shingleDark'); // roof deck
  w.box(x + 6, y + H + 2, z + 8, 6, 13, 6, 'brickDark');          // chimney
  for (const wx of [x + 8, x + 46]) {                             // saloon glass
    w.box(wx, y + 8, fz, 18, 13, 1, 'winWarm');
    for (let k = 4; k < 18; k += 5) w.box(wx + k, y + 8, fz, 1, 13, 1, 'wood');
    w.box(wx - 1, y + 6, fz, 20, 2, 1, 'woodPale');
  }
  w.box(x + 31, y, fz, 10, 17, 1, 'doorGreen');                   // the door
  w.box(x + 33, y + 9, fz, 2, 2, 1, 'winWarmDim');                // its fanlight
  for (let k = 0; k < W - 8; k += 3)                              // bulb string
    w.set(x + 4 + k, y + 24, fz, k % 6 ? 'metalDark' : 'porchBulb');
  for (const wx of [x + 10, x + 31, x + 52])                      // rooms above
    w.box(wx, y + 30, fz, 10, 10, 1, wx === x + 31 ? 'winWarmDim' : 'glassDark');
  w.box(x + W - 3, y + 36, fz - 4, 1, 1, 5, 'metalDark');         // sign bracket
  w.box(x + W - 4, y + 27, fz + 2, 3, 9, 1, 'neonSign');          // the sign
}

// A petrol station: the brightest thing on any bypass. A flat canopy with a
// lit underside, two pump islands, a red totem — placed where the dark legs
// need one landmark you can steer by from half a kilometre out.
export function petrol(w, x, y, z) {
  const W = 120, D = 70, CH = 30;
  w.box(x, y - 1, z, W, 1, D, 'concrete');                        // apron slab
  for (const [px, pz] of [[x + 14, z + 10], [x + W - 18, z + 10], [x + 14, z + D - 18], [x + W - 18, z + D - 18]])
    w.box(px, y, pz, 4, CH, 4, 'metal');
  w.box(x + 4, y + CH + 1, z + 2, W - 8, 4, D - 4, 'paper');      // canopy
  w.box(x + 6, y + CH, z + 4, W - 12, 1, D - 8, 'stripLight');    // lit underside
  w.box(x + 4, y + CH + 2, z + D - 3, W - 8, 2, 1, 'tailLight');  // lit fascia band
  for (const px of [x + 30, x + 68]) {                            // pump islands
    w.box(px, y, z + 26, 18, 2, 8, 'concreteOld');
    for (const dx of [3, 12]) {
      w.box(px + dx, y + 2, z + 28, 4, 11, 4, 'signRed');
      w.set(px + dx + 1, y + 9, z + 28, 'screen');
    }
  }
  w.box(x + W - 8, y, z + D - 10, 4, 42, 4, 'metalDark');         // the totem
  w.box(x + W - 13, y + 42, z + D - 12, 14, 12, 4, 'signRed');
  w.box(x + W - 11, y + 45, z + D - 8, 10, 6, 1, 'stripLight');   // the lightbox
}

// A billboard: two posts and a lit hoarding. The ad is colour blocks, because
// at racing speed a poster is a palette, not a message.
export function billboard(w, x, y, z, seed = 0) {
  const W = 64, H = 26;
  // GLOW KEYS ONLY. The first palette used sign colours, which do not emit —
  // a hoarding that is not lit is a black slab at night, which the audit
  // found on every single one. An advert after dark is a lightbox.
  const CS = ['neonSign', 'chillGlow', 'stripLight', 'winTV', 'sodium'];
  for (const px of [x + 6, x + W - 9]) w.box(px, y, z + 4, 3, 32, 3, 'metalDark');
  w.box(x, y + 30, z + 3, W, H, 2, 'metalDark');                  // backing
  w.box(x + 2, y + 32, z + 5, W - 4, H - 4, 1, CS[seed % 5]);     // the ground
  w.box(x + 4 + (seed * 7) % 22, y + 38, z + 5, 26, 9, 1, CS[(seed + 2) % 5]);
  w.box(x + 8, y + 34, z + 5, 12, 2, 1, 'metalDark');             // small print
  w.box(x + W - 22, y + 48, z + 5, 12, 4, 1, CS[(seed + 4) % 5]);
}

// A bell tower for the Old Town: stone shaft, lit belfry arches, a clock, a
// pyramid cap. Tall enough to see over the roofs — the Old Town's answer to
// the Parade's spire, and a landmark the whole inner lap can steer by.
export function bellTower(w, x, y, z) {
  const W = 30, H = 118, fz = z + W - 1;
  w.box(x - 2, y, z - 2, W + 4, 8, W + 4, 'concreteOld');         // plinth
  w.box(x, y, z, W, H, W, (bx, by, bz) =>
    hash3(bx, by, bz) > 0.86 ? 'concreteOld' : 'brickDark');
  // the belfry: an arched lit opening on each face
  for (let k = 0; k < 16; k++) {
    const wd = k > 11 ? 8 - (k - 11) * 2 : 8;
    const at = y + H - 28 + k;
    w.box(x + 15 - (wd >> 1), at, fz, wd, 1, 1, 'winWarm');
    w.box(x + 15 - (wd >> 1), at, z, wd, 1, 1, 'winWarm');
    w.box(x, at, z + 15 - (wd >> 1), 1, 1, wd, 'winWarm');
    w.box(x + W - 1, at, z + 15 - (wd >> 1), 1, 1, wd, 'winWarm');
  }
  // the clock, on the road face
  w.box(x + 10, y + H - 48, fz, 10, 10, 1, 'paper');
  w.box(x + 14, y + H - 44, fz, 2, 5, 1, 'metalDark');            // hands
  w.box(x + 15, y + H - 44, fz, 3, 2, 1, 'metalDark');
  for (let k = 0; k < 13; k++)                                    // pyramid cap
    w.box(x + k, y + H + k, z + k, W - 2 * k, 1, W - 2 * k, 'shingleDark');
  w.set(x + 15, y + H + 14, z + 15, 'tailLight');                 // the finial
}

// A lighthouse for the Docks: banded drum, gallery, glowing lantern room —
// the thing the whole harbour is arranged around.
export function lighthouse(w, x, y, z) {
  const cx = x + 13, cz = z + 13, H = 92;
  for (let k = 0; k < H; k++) {
    const r = 11 - Math.round(k / 44);
    const band = ((k / 14) | 0) % 2 ? 'signRed' : 'paper';
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
      if (dx * dx + dz * dz <= r * r) w.set(cx + dx, y + k, cz + dz, band);
  }
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++)  // gallery
    if (dx * dx + dz * dz <= 150) w.set(cx + dx, y + H, cz + dz, 'metalDark');
  w.box(cx - 5, y + H + 1, cz - 5, 10, 9, 10, 'moonGlass');       // lantern room
  for (const [dx, dz] of [[-5, -5], [4, -5], [-5, 4], [4, 4]])
    w.box(cx + dx, y + H + 1, cz + dz, 1, 9, 1, 'metalDark');
  w.box(cx - 6, y + H + 10, cz - 6, 12, 2, 12, 'metalDark');
  w.box(cx - 4, y + H + 12, cz - 4, 8, 2, 8, 'signRed');          // the cap
  w.box(cx - 2, y + H + 14, cz - 2, 4, 2, 4, 'signRed');
  w.box(cx - 3, y, cz + 9, 6, 11, 3, 'doorGreen');                // keeper's door
}
