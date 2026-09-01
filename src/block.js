// The block. A street running along X with houses down both sides.
//
// Coordinates: 1 unit = 1 voxel ~= 8cm. Road surface sits at y=0; kerbs,
// walks and lawns are raised to GROUND=2.
//
//   z <  -30   far row of houses, fronts facing +Z (toward the road)
//   z  -30..42 far lawns, then the pavement, then the kerb
//   z   46..118 the road
//   z  118..140 near kerb and pavement
//   z  140..206 near lawns
//   z >  206   near row of houses, fronts facing -Z
//
// The ground plate is ONE voxel thick. Its underside is never visible from any
// camera above it, so the mesher drops those faces (`noFloorBelow`) rather
// than the plate being four courses deep — at this street's size that is the
// difference between a one-million-voxel scene and a three-million one.
import * as THREE from 'three';
import { VoxWorld, meshWorld, hash3 } from './voxel.js';
import { PALETTE, tint } from './palette.js';
import { FLOOR_MAX, HEAD } from './walk.js';
import * as P from './props.js';
import * as S from './street.js';
import { shopParade } from './shops.js';
import { BODIES } from './race/car.js';

export const GROUND = 2;
export const ROAD = { z0: 46, z1: 118 };
export const BOUNDS = { x0: -400, x1: 470, z0: -152, z1: 268 };

const rnd = (x, z, s = 0) => hash3(x, s, z);
const shingleFn = (px, py, pz) => (rnd(px, pz, py) > 0.8 ? 'shingleDark' : 'shingle');
const brickFn = (px, py, pz) => (rnd(px, pz, py) > 0.85 ? 'brickDark' : 'brick');

// --------------------------------------------------------------- ground
// Driveways are declared up front so the ground can pave them.
const DRIVES = [
  { x0: -12, x1: 26, z0: -30, z1: 46 },      // between the hero and house B
  { x0: -206, x1: -172, z0: -30, z1: 46 },
  { x0: 276, x1: 310, z0: -30, z1: 46 },
  { x0: -160, x1: -126, z0: 118, z1: 206 },  // near side
  { x0: 8, x1: 42, z0: 118, z1: 206 },
];
const WALKS = [
  { x0: -76, x1: -62, z0: -30, z1: 42 },     // the hero's front walk
  { x0: -224, x1: -212, z0: -30, z1: 42 },
  { x0: 218, x1: 230, z0: -30, z1: 42 },
  { x0: -60, x1: -48, z0: 122, z1: 206 },
  { x0: 96, x1: 108, z0: 122, z1: 206 },
  { x0: 168, x1: 434, z0: -32, z1: 32 },      // the shop forecourt
];
const inAny = (list, x, z) => list.some(d => x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1);

function ground(w) {
  const { x0, x1, z0, z1 } = BOUNDS;
  const paved = (x, z, r) => {
    const joint = (x + 900) % 17 === 0 || (z + 900) % 21 === 0;
    return joint ? 'concreteOld' : (r > 0.9 ? 'concreteOld' : 'concrete');
  };
  for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
    const r = rnd(x, z);
    const edge = x < x0 + 2 || x >= x1 - 2 || z < z0 + 2 || z >= z1 - 2;

    if (z >= ROAD.z0 && z < ROAD.z1) {                       // the road
      let c = r > 0.86 ? 'asphaltWorn' : (r < 0.10 ? 'asphaltPatch' : 'asphalt');
      if (z < ROAD.z0 + 2 || z >= ROAD.z1 - 2) c = 'asphaltPatch';   // gutters
      const mid = (ROAD.z0 + ROAD.z1) >> 1;
      if (z >= mid && z < mid + 2 && (x + 900) % 26 < 14) c = 'roadLine';
      w.set(x, -1, z, c);
      // a driveway apron cuts the kerb down to the road
      if (inAny(DRIVES, x, z)) w.set(x, -1, z, 'concreteOld');
    } else if ((z >= ROAD.z0 - 4 && z < ROAD.z0) || (z >= ROAD.z1 && z < ROAD.z1 + 4)) {
      const drive = inAny(DRIVES, x, z);
      for (let y = -1; y <= GROUND; y++)
        w.set(x, y, z, y === GROUND ? (drive ? 'concreteOld' : 'curb') : 'concreteOld');
      if (drive) w.set(x, GROUND, z, 'concreteOld');
    } else {
      const walk = (z >= ROAD.z0 - 22 && z < ROAD.z0 - 4) || (z >= ROAD.z1 + 4 && z < ROAD.z1 + 22);
      const hard = walk || inAny(DRIVES, x, z) || inAny(WALKS, x, z);
      const c = hard ? paved(x, z, r)
        : (r > 0.85 ? 'grassDry' : (r < 0.03 ? 'dirt' : 'grass'));
      w.set(x, GROUND, z, c);
      // a skirt at the plate's outer boundary so it is not a floating sheet
      if (edge) for (let y = -1; y < GROUND; y++) w.set(x, y, z, 'dirt');
    }
  }
}

// --------------------------------------------------------------- windows
// A window that is actually recessed: cut through the wall, set the glass on
// the outer face, and frame it. Flat windows painted on a wall look like
// stickers, and at this voxel size the 2-voxel reveal is very visible.
// Mullions matter more than they sound like they should: a lit rectangle with
// nothing crossing it reads as a sticker no matter how good the colour is.
// The cross sits one voxel PROUD of the glass, and the curtain band keeps the
// pane from being one flat value.
//
// `dir` is +1 when the wall's outward direction is +Z, -1 when it is -Z, so
// one routine serves both rows of houses.
function pane(w, x, y, z, ww, hh, glass, curtain) {
  if (!glass) return;
  w.box(x, y, z, ww, hh, 1, glass);
  if (!curtain) return;
  w.box(x, y + hh - 5, z, ww, 5, 1, tint(glass, 0.42));      // pelmet
  w.box(x, y, z, 3, hh - 5, 1, tint(glass, 0.55));           // curtains, drawn back
  w.box(x + ww - 3, y, z, 3, hh - 5, 1, tint(glass, 0.55));
  w.box(x + 4, y, z, ww - 8, 2, 1, tint(glass, 0.30));       // something on the sill
}

function windowZ(w, x, y, fz, ww, hh, glass, trim, opts) {
  const { curtain = false, mullions = true, dir = 1 } = opts || {};
  w.cut(x, y, dir > 0 ? fz : fz - 1, ww, hh, 2);
  pane(w, x, y, fz + 2 * dir, ww, hh, glass, curtain);
  if (mullions) {
    w.box(x + (ww >> 1), y, fz + dir, 1, hh, 1, trim);
    w.box(x, y + (hh >> 1), fz + dir, ww, 1, 1, trim);
  }
  w.box(x - 1, y - 1, fz, ww + 2, 1, 1, trim);
  w.box(x - 1, y + hh, fz, ww + 2, 1, 1, trim);
  w.box(x - 1, y, fz, 1, hh, 1, trim);
  w.box(x + ww, y, fz, 1, hh, 1, trim);
  w.box(x - 2, y - 2, fz, ww + 4, 1, 1, trim);       // sill
}

function windowX(w, x, y, z, dd, hh, glass, trim, opts) {
  const { curtain = false } = opts || {};
  w.cut(x, y, z, 2, hh, dd);
  if (glass) {
    w.box(x - 1, y, z, 1, hh, dd, glass);
    if (curtain) {
      w.box(x - 1, y + hh - 5, z, 1, 5, dd, tint(glass, 0.42));
      w.box(x - 1, y, z, 1, hh - 5, 3, tint(glass, 0.55));
      w.box(x - 1, y, z + dd - 3, 1, hh - 5, 3, tint(glass, 0.55));
    }
  }
  w.box(x, y, z + (dd >> 1), 1, hh, 1, trim);
  w.box(x, y + (hh >> 1), z, 1, 1, dd, trim);
  w.box(x + 1, y - 1, z - 1, 1, 1, dd + 2, trim);
  w.box(x + 1, y + hh, z - 1, 1, 1, dd + 2, trim);
  w.box(x + 1, y, z - 1, 1, hh, 1, trim);
  w.box(x + 1, y, z + dd, 1, hh, 1, trim);
}

function doorZ(w, x, y, fz, ww, hh, colour, trim, dir) {
  w.cut(x, y, dir > 0 ? fz : fz - 1, ww, hh, 2);
  w.box(x, y, fz + dir, ww, hh, 1, colour);
  w.box(x + (ww >> 1) - 2, y + hh - 10, fz + dir, 4, 6, 1, 'winWarmDim');
  w.set(x + ww - 3, y + hh - 12, fz + dir, 'chrome');
  w.box(x - 2, y - 1, fz, ww + 4, 1, 3, trim);
}

// Fill the triangular gable ends left open by a ridge-along-X roof.
function gableEnds(w, x, y, z, wid, dep, c) {
  const half = Math.ceil(dep / 2);
  for (let k = 0; k < dep; k++) {
    const rise = Math.min(half, Math.min(k, dep - 1 - k));
    for (let j = 0; j < rise; j++) for (let t = 0; t < 2; t++) {
      // `c` may be a banding function, like everywhere else — set() stores it
      // raw, which is how every gable end shipped as invisible collision.
      const nA = typeof c === 'function' ? c(x + t, y + j, z + k) : c;
      const nB = typeof c === 'function' ? c(x + wid - 1 - t, y + j, z + k) : c;
      w.set(x + t, y + j, z + k, nA);
      w.set(x + wid - 1 - t, y + j, z + k, nB);
    }
  }
}

// A porch light, and the anchor the rig hangs a bulb on.
function porchLamp(w, anchors, x, y, fz, dir, on = true) {
  w.box(x, y + 1, fz, 2, 2, 1, 'metalDark');
  if (on) {
    w.box(x, y, fz + dir, 2, 1, 1, 'porchBulb');
    anchors.porches.push({ pos: [x + 1, y + 1, fz + 2 * dir], power: 4200, dist: 95 });
  }
}

// --------------------------------------------------------------- houses
// The hero. Kept as a bespoke recipe rather than folded into the generic
// builder — its porch, its television and its window rhythm are the framing
// that the whole look was tuned against, and they are worth not regressing.
function heroHouse(w, anchors) {
  const x = -122, z = -88, wid = 104, dep = 58, wallTop = 46;
  const siding = (px, py) => (py % 4 === 0 ? 'sidingAdark' : 'sidingA');
  w.box(x, GROUND + 1, z, wid, 6, dep, brickFn);
  w.shell(x, GROUND + 7, z, wid, wallTop, dep, 2, siding, { top: false, bottom: false });
  gableEnds(w, x, GROUND + 7 + wallTop, z, wid, dep, siding);
  w.gable(x, GROUND + 7 + wallTop, z, wid, dep, shingleFn, { eave: 3, thick: 3 });

  const fz = z + dep - 2, y0 = GROUND + 7;

  doorZ(w, x + 40, y0, fz, 12, 22, 'doorRed', 'trimA', 1);
  windowZ(w, x + 14, y0 + 12, fz, 18, 20, 'winWarm', 'trimA', { curtain: true });
  windowZ(w, x + 66, y0 + 12, fz, 18, 20, null, 'trimA');
  windowZ(w, x + 88, y0 + 14, fz, 12, 14, 'winWarmDim', 'trimA', { curtain: true });
  windowX(w, x + wid - 2, y0 + wallTop + 4, z + 24, 10, 12, 'glassDark', 'trimA');
  windowX(w, x, y0 + 16, z + 16, 12, 16, 'winWarmDim', 'trimA', { curtain: true });
  windowX(w, x, y0 + 16, z + 36, 12, 16, 'glassDark', 'trimA');

  anchors.tv = { x: x + 66, y: y0 + 12, z: fz + 2.5, w: 18, h: 20 };
  anchors.spills.push(
    { pos: [x + 23, y0 + 22, fz + 8], power: 7000, dist: 110 },
    { pos: [x + 94, y0 + 21, fz + 8], power: 3000, dist: 80 },
    { pos: [x - 8, y0 + 24, z + 22], power: 3400, dist: 75 },
  );

  // ---- porch
  const px0 = x + 24, px1 = x + 74, pz0 = fz + 2, pz1 = fz + 20;
  w.box(px0, GROUND + 1, pz0, px1 - px0, 6, pz1 - pz0, 'brickDark');
  w.box(px0, y0, pz0, px1 - px0, 1, pz1 - pz0, 'woodPale');
  for (const cx of [px0 + 1, px1 - 4]) {
    w.box(cx, y0 + 1, pz1 - 5, 4, 30, 4, 'trimA');
    w.box(cx - 1, y0 + 30, pz1 - 6, 6, 2, 6, 'trimA');
  }
  w.box(px0 - 2, y0 + 32, pz0 - 2, px1 - px0 + 4, 3, pz1 - pz0 + 4, shingleFn);
  for (let s = 0; s < 3; s++)
    w.box(x + 40, GROUND + 1 + s * 2, pz1 + s * 3, 14, 2, 3, 'concreteOld');
  for (const rz of [pz1 - 1]) {
    for (let i = px0; i < x + 40; i += 3) w.box(i, y0 + 1, rz, 1, 10, 1, 'trimA');
    for (let i = x + 54; i < px1; i += 3) w.box(i, y0 + 1, rz, 1, 10, 1, 'trimA');
    w.box(px0, y0 + 11, rz, x + 40 - px0, 1, 2, 'trimA');
    w.box(x + 54, y0 + 11, rz, px1 - (x + 54), 1, 2, 'trimA');
  }
  porchLamp(w, anchors, x + 56, y0 + 19, fz, 1);

  w.box(x + 16, GROUND + 7, z + 20, 12, wallTop + 34, 10, brickFn);
  w.box(x + 14, GROUND + 7 + wallTop + 34, z + 18, 16, 2, 14, 'brickDark');
  anchors.chimneys.push([x + 22, GROUND + 9 + wallTop + 34, z + 25]);
  w.box(x - 3, GROUND + 7 + wallTop - 1, fz + 3, wid + 6, 2, 2, 'trimA');
  w.box(x + wid - 4, y0, fz + 3, 2, wallTop, 2, 'trimA');
  return { x, z, wid, dep, fz };
}

// The one with the garage. Its front used to be a dead wall; it now carries a
// lit room, a lit hall behind the door and a porch bulb, because it holds the
// right-hand third of most framings and a black rectangle there kills them.
function garageHouse(w, anchors) {
  const x = 34, z = -88, wid = 108, dep = 58, wallTop = 40;
  const siding = (px, py) => (py % 5 === 0 ? 'sidingBdark' : 'sidingB');
  w.box(x, GROUND + 1, z, wid, 5, dep, 'brickDark');
  w.shell(x, GROUND + 6, z, wid, wallTop, dep, 2, siding, { top: false, bottom: false });
  gableEnds(w, x, GROUND + 6 + wallTop, z, wid, dep, siding);
  w.gable(x, GROUND + 6 + wallTop, z, wid, dep, shingleFn, { eave: 3, thick: 3 });

  const fz = z + dep - 2, y0 = GROUND + 6;
  w.cut(x, y0, z + 26, 2, 26, 28);
  w.box(x + 1, y0, z + 26, 1, 26, 28, (px, py) => (py % 3 === 0 ? 'metalDark' : 'metal'));
  w.box(x - 1, y0 + 26, z + 24, 3, 2, 32, 'trimB');

  windowZ(w, x + 20, y0 + 12, fz, 16, 16, 'winWarm', 'trimB', { curtain: true });
  windowZ(w, x + 56, y0 + 12, fz, 16, 16, 'winWarmDim', 'trimB', { curtain: true });
  windowX(w, x + wid - 2, y0 + 14, z + 20, 10, 14, 'winWarmDim', 'trimB', { curtain: true });
  windowZ(w, x + 46, y0 + wallTop + 6, fz, 12, 12, 'winWarm', 'trimB', { curtain: true });

  doorZ(w, x + 84, y0, fz, 10, 20, 'doorBlue', 'trimB', 1);
  // a stoop, so the door is not a hole in a wall
  for (let s = 0; s < 2; s++) w.box(x + 82, GROUND + 1 + s * 2, fz + 2 + s * 3, 14, 2, 3, 'concreteOld');
  w.box(x + 78, y0 + 24, fz + 1, 22, 2, 6, 'trimB');              // door hood
  w.box(x + 78, y0 + 22, fz + 6, 1, 2, 1, 'trimB');
  w.box(x + 99, y0 + 22, fz + 6, 1, 2, 1, 'trimB');
  porchLamp(w, anchors, x + 80, y0 + 21, fz, 1);

  anchors.spills.push(
    { pos: [x + 28, y0 + 20, fz + 9], power: 6200, dist: 105 },
    { pos: [x + 64, y0 + 20, fz + 9], power: 3200, dist: 85 },
    { pos: [x + 52, y0 + wallTop + 12, fz + 9], power: 5000, dist: 100 },
    { pos: [x + wid + 8, y0 + 21, z + 26], power: 2600, dist: 70 },
  );
  return { x, z, wid, dep, fz };
}

// Everything else on the street. One recipe, seeded: the point of the row is
// rhythm and variation, not seven bespoke houses.
// Exported so the race track can build the SAME houses rather than growing its
// own worse ones. Called into a temp world at the origin and blitted in
// rotated — see VoxWorld.merge.
export function house(w, anchors, s) {
  const { x, z, wid, dep, wallTop, dir, siding, sidingDark, trim, door, seed } = s;
  const y0 = GROUND + 6;
  const sidingFn = (px, py) => (py % (s.band || 4) === 0 ? sidingDark : siding);
  const fz = dir > 0 ? z + dep - 2 : z + 1;
  const R = (k) => rnd(seed * 7, k * 13, 3);

  // A shell, not a solid: the foundation's interior is under the house and its
  // top is under the floor, so 30k voxels per house were being spent on
  // something nobody can ever see. Matters most on the race track, which blits
  // eighteen of these.
  w.shell(x, GROUND + 1, z, wid, 5, dep, 2, s.base === 'brick' ? brickFn : 'brickDark',
    { top: false, bottom: false });
  w.shell(x, y0, z, wid, wallTop, dep, 2, sidingFn, { top: false, bottom: false });
  gableEnds(w, x, y0 + wallTop, z, wid, dep, sidingFn);
  w.gable(x, y0 + wallTop, z, wid, dep, shingleFn, { eave: 3, thick: 3 });

  // Which rooms are awake. Every house gets at least one, or the row reads as
  // abandoned rather than asleep.
  const glass = (k) => (R(k) > 0.62 ? 'winWarm' : R(k) > 0.34 ? 'winWarmDim' : 'glassDark');
  const g1 = glass(1), g2 = R(2) > 0.5 ? glass(2) : 'glassDark';
  const gUp = R(3) > 0.55 ? 'winWarm' : 'glassDark';
  const anyLit = [g1, g2, gUp].some(g => g !== 'glassDark');
  const gFix = anyLit ? g1 : 'winWarmDim';

  const doorX = x + Math.round(wid * 0.5) - 6;
  doorZ(w, doorX, y0, fz, 12, 22, door, trim, dir);
  for (let st = 0; st < 2; st++)
    w.box(doorX - 2, GROUND + 1 + st * 2, fz + (2 + st * 3) * dir - (dir < 0 ? 2 : 0), 16, 2, 3, 'concreteOld');
  w.box(doorX - 5, y0 + 24, fz + dir, 22, 2, 6 * (dir > 0 ? 1 : -1) + (dir < 0 ? -1 : 0), trim);
  porchLamp(w, anchors, doorX - 6, y0 + 21, fz, dir, R(4) > 0.25);

  windowZ(w, x + 12, y0 + 12, fz, 18, 18, gFix, trim, { curtain: true, dir });
  windowZ(w, x + wid - 30, y0 + 12, fz, 18, 18, g2, trim, { curtain: g2 !== 'glassDark', dir });
  windowZ(w, x + (wid >> 1) - 6, y0 + wallTop + 6, fz, 12, 12, gUp, trim, { curtain: gUp !== 'glassDark', dir });
  // flanks
  windowX(w, x, y0 + 16, z + 16, 12, 14, R(5) > 0.6 ? 'winWarmDim' : 'glassDark', trim, { curtain: true });
  windowX(w, x + wid - 2, y0 + 16, z + dep - 30, 12, 14, R(6) > 0.6 ? 'winWarmDim' : 'glassDark', trim, { curtain: true });

  if (R(7) > 0.45) {                                    // a chimney
    const cx = x + 10 + Math.round(R(8) * (wid - 30));
    w.box(cx, y0, z + 20, 11, wallTop + 30, 9, brickFn);
    w.box(cx - 2, y0 + wallTop + 30, z + 18, 15, 2, 13, 'brickDark');
    anchors.chimneys.push([cx + 5, y0 + wallTop + 33, z + 24]);
  }
  // gutter along the street-facing eave
  w.box(x - 3, y0 + wallTop - 1, fz + 3 * dir, wid + 6, 2, 2, trim);

  const spillZ = fz + 9 * dir;
  if (g1 !== 'glassDark') anchors.spills.push({ pos: [x + 21, y0 + 20, spillZ], power: 5200, dist: 100 });
  if (g2 !== 'glassDark') anchors.spills.push({ pos: [x + wid - 21, y0 + 20, spillZ], power: 4200, dist: 92 });
  if (gUp !== 'glassDark') anchors.spills.push({ pos: [x + (wid >> 1), y0 + wallTop + 12, spillZ], power: 4200, dist: 92 });
  return { x, z, wid, dep, fz };
}

const FAR_Z = -88, NEAR_Z = 206, HOUSE_DEP = 58;
const ROSTER = [
  { x: -266, wid: 96, wallTop: 40, dir: 1, seed: 3, band: 5,
    siding: 'sidingC', sidingDark: 'sidingCdark', trim: 'trimC', door: 'doorBlue', base: 'brick' },
  { x: -410, wid: 92, wallTop: 44, dir: 1, seed: 11, band: 4,
    siding: 'sidingE', sidingDark: 'sidingEdark', trim: 'trimE', door: 'doorGreen' },
  // near side, fronts facing -Z
  { x: -262, wid: 100, wallTop: 42, dir: -1, seed: 5, band: 4, near: true,
    siding: 'sidingC', sidingDark: 'sidingCdark', trim: 'trimC', door: 'doorYellow' },
  { x: -116, wid: 96, wallTop: 46, dir: -1, seed: 23, band: 5, near: true,
    siding: 'sidingD', sidingDark: 'sidingDdark', trim: 'trimD', door: 'doorRed', base: 'brick' },
  { x: 54, wid: 104, wallTop: 40, dir: -1, seed: 31, band: 4, near: true,
    siding: 'sidingF', sidingDark: 'sidingFdark', trim: 'trimF', door: 'doorBlue' },
];

// A silhouette of the rest of the town behind each row.
function backdrop(w) {
  for (const [zBase, side] of [[-216, 1], [336, -1]]) {
    let x = -430;
    while (x < 500) {
      const wid = 46 + Math.round(rnd(x, 7 * side) * 44);
      const h = 40 + Math.round(rnd(x, 11 * side) * 28);
      const z = zBase - side * Math.round(rnd(x, 3) * 30);
      w.box(x, GROUND, z, wid, h, 10, 'hillFar');
      w.gable(x, GROUND + h, z, wid, 10, 'hillFar', { eave: 2, thick: 3 });
      if (rnd(x, 5 * side) > 0.45) {
        const wy = GROUND + 12 + Math.round(rnd(x, 9) * (h - 24));
        w.box(x + 8 + Math.round(rnd(x, 13) * (wid - 20)), wy, side > 0 ? z + 39 : z, 6, 7, 1,
          rnd(x, 17) > 0.6 ? 'winWarmDim' : 'winWarm');
      }
      x += wid + 14 + Math.round(rnd(x, 19) * 22);
    }
  }
  for (let i = 0; i < 26; i++) {
    const tx = -410 + i * 27 + Math.round(rnd(i, 23) * 12);
    const r = 13 + Math.round(rnd(i, 31) * 6);
    P.ball(w, tx, GROUND + Math.round(r * 0.75) + Math.round(rnd(i, 29) * 8), -266, r, 'hillFar', 0.35);
  }
}

// --------------------------------------------------------------- clutter
function wire(w, x0, y0, x1, y1, z, sag) {
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const y = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * sag;
    w.set(x, Math.round(y), z, 'metalDark');
  }
}

function dressing(w, anchors) {
  // Streetlights alternate sides down the road. Their pools are the rhythm of
  // the whole street shot, so they are evenly spaced rather than scattered.
  for (const [lx, lz, arm] of [[-66, 18, 16], [-330, 18, 16], [186, 18, 16],
                               [396, 18, 16], [-190, 146, -16], [30, 146, -16]]) {
    anchors.lamps.push(P.streetLamp(w, lx, GROUND, lz, 54, arm));
  }
  for (const px of [-390, 86, 300]) anchors.poles.push(P.utilityPole(w, px, GROUND, 18, 80));
  P.hydrant(w, 40, GROUND, 32);
  P.hydrant(w, -240, GROUND, 132);

  for (const [dz, sag] of [[-4, 9], [0, 10], [4, 11]]) {
    wire(w, -390, GROUND + 76, 86, GROUND + 76, 18 + dz, sag);
    wire(w, 86, GROUND + 76, 300, GROUND + 74, 18 + dz, sag);
    wire(w, 300, GROUND + 74, 500, GROUND + 70, 18 + dz, sag);
    wire(w, -420, GROUND + 74, -390, GROUND + 76, 18 + dz, 2);
  }
  wire(w, 60, GROUND + 66, 86, GROUND + 74, 20, 4);

  // ---- the hero's lot
  P.tree(w, -132, GROUND, -6, 46, 22);
  P.hedge(w, -122, GROUND, -26, 104, 8, 12, 'x');
  P.picketFence(w, 28, GROUND, -30, 56, 'z');
  const post = (px, pz, rot) => {
    w.stamp(P.MAILBOX, px, GROUND, pz, { rot });
    anchors.mailboxes.push([px + 1, GROUND + 12, pz + 2]);
  };
  post(-74, 22, 0);
  w.stamp(P.GNOME, -96, GROUND, -18);
  w.stamp(P.NEWSPAPER, -70, GROUND, 6);
  P.bikeDown(w, -104, GROUND, 4);
  P.hose(w, -110, GROUND, -14);
  P.leafPile(w, -50, GROUND, -4, 9);
  P.leafPile(w, -30, GROUND, 12, 6);
  P.lawnChair(w, -76, GROUND + 4, -26);
  P.trashBin(w, -30, GROUND, 30);
  P.trashBin(w, -18, GROUND, 30, { lidOff: true });
  P.ball(w, -44, GROUND + 3, 8, 3, 'plasticRed');

  P.wagon(w, -8, GROUND, -18);
  P.basketballHoop(w, 30, GROUND, -6);
  P.trashBin(w, 30, GROUND, 34);
  post(62, 22, 0);
  P.hedge(w, 34, GROUND, -28, 108, 7, 10, 'x');
  P.tree(w, 152, GROUND, -14, 38, 17);
  P.leafPile(w, 74, GROUND, -12, 7);

  // ---- the rest of the row, dressed off a seed so no two lots match
  for (const h of ROSTER) {
    const front = h.dir > 0 ? FAR_Z + HOUSE_DEP : NEAR_Z;
    const out = h.dir;                                   // toward the road
    const R = (k) => rnd(h.seed * 5, k * 17, 7);
    const lawnZ = front + out * 22;
    P.hedge(w, h.x, GROUND, front + out * 6, h.wid, 7, 8 + Math.round(R(1) * 5), 'x');
    if (R(2) > 0.3) P.tree(w, h.x + Math.round(R(3) * h.wid), GROUND, lawnZ + out * 10,
      34 + Math.round(R(4) * 16), 15 + Math.round(R(5) * 7));
    post(h.x + Math.round(h.wid * 0.5), front + out * 62, out > 0 ? 0 : 180);
    if (R(6) > 0.4) P.trashBin(w, h.x + 14, GROUND, front + out * 66);
    if (R(6) > 0.7) P.trashBin(w, h.x + 26, GROUND, front + out * 66, { lidOff: true });
    if (R(7) > 0.5) P.leafPile(w, h.x + Math.round(R(8) * h.wid), GROUND, lawnZ, 6 + Math.round(R(9) * 4));
    if (R(9) > 0.6) P.lawnChair(w, h.x + 20, GROUND + 4, lawnZ - out * 6);
    if (R(3) > 0.55) w.stamp(P.GNOME, h.x + 8, GROUND, lawnZ);
  }

  // ---- council property. Anchors are returned so the rig can light the
  // shelter's strip and the phone box's interior.
  anchors.shelter = S.busShelter(w, -166, GROUND, 24, 1);
  anchors.phone = S.phoneBox(w, 108, GROUND, 26);
  S.bench(w, -244, GROUND, 26, 1);
  // clear of the shop door (x 218-233) — a bench across a doorway is a wall
  S.bench(w, 182, GROUND, -18, 1);
  S.bench(w, 296, GROUND, -18, 1);
  S.bench(w, 396, GROUND, -18, 1);
  // clear of the store doors (x 242-268)
  P.trashBin(w, 300, GROUND, -16);
  P.trashBin(w, 310, GROUND, -16, { lidOff: true });
  S.milkCrates(w, 444, GROUND, -18, 3);   // clear of the laundromat door
  P.hydrant(w, 340, GROUND, -14);
  S.signPost(w, 452, GROUND, 30, 'stop');
  S.signPost(w, -352, GROUND, 30, 'street');
  S.signPost(w, 4, GROUND, 130, 'street');
  for (const dx of [-300, -120, 60, 220]) S.drain(w, dx, 0, ROAD.z0 + 1);
  for (const dx of [-250, -40, 170]) S.drain(w, dx, 0, ROAD.z1 - 6);
  // a bit of roadworks: something for the cars to swerve round
  S.barrier(w, 356, GROUND, ROAD.z0 + 8, 30);
  for (const cx of [348, 388, 368]) S.roadCone(w, cx, 0, ROAD.z0 + 4);
  S.skip(w, -238, GROUND, -22);

  // ---- back-of-lot life
  S.swingSet(w, -196, GROUND, 150);
  S.clothesline(w, 60, GROUND, 176, 46);
  S.clothesline(w, -300, GROUND, -60, 40);
  S.satelliteDish(w, 88, GROUND + 52, -40);
  S.satelliteDish(w, 62, GROUND + 50, 250);
  S.satelliteDish(w, -232, GROUND + 48, -44);
  S.treehouse(w, -146, GROUND + 30, -8);
  S.wheelbarrow(w, -288, GROUND, -14);
  S.milkCrates(w, 122, GROUND, 132, 3);
  S.milkCrates(w, -180, GROUND, 132, 2);
  S.flowerBed(w, -60, GROUND, -22, 26, 8);
  S.flowerBed(w, 74, GROUND, 148, 30, 9);
  S.flowerBed(w, -286, GROUND, -20, 22, 8);
  P.tree(w, -196, GROUND, -12, 42, 19);
  P.tree(w, 156, GROUND, 6, 36, 16);
  P.tree(w, 448, GROUND, 8, 34, 15);
  P.tree(w, -78, GROUND, 176, 40, 18);
  P.tree(w, 178, GROUND, 178, 34, 15);
  P.hedge(w, -320, GROUND, 130, 60, 7, 10, 'x');
  P.picketFence(w, -66, GROUND, 138, 54, 'z');

  // two cars parked at the kerb, one each side, laid along the street
  P.wagon(P.transposeXZ(w), ROAD.z0 + 5, GROUND - 2, -300);
  P.wagon(P.transposeXZ(w), ROAD.z1 - 27, GROUND - 2, 120);
  P.wagon(w, -142, GROUND, 150);                          // in a near-side drive

  // leaf litter in both gutters, where the wind puts it
  for (let i = 0; i < 900; i++) {
    const x = -420 + Math.round(rnd(i, 41) * 730);
    const near = rnd(i, 53) > 0.5;
    const z = (near ? ROAD.z1 - 4 : ROAD.z0) + Math.round(rnd(i, 43) * 3);
    w.set(x, 0, z, rnd(i, 47) > 0.5 ? 'leafLitter' : 'leafLitter2');
  }
}

// --------------------------------------------------------------- assemble
export function buildBlock(save) {
  const w = new VoxWorld();
  const anchors = { porches: [], spills: [], lamps: [], poles: [], mailboxes: [], chimneys: [] };
  ground(w);
  backdrop(w);
  heroHouse(w, anchors);
  garageHouse(w, anchors);
  // The parade is authored with its front at local z=0 facing -Z, then blitted
  // in MIRRORED so it fronts the road from the far side. It has to face away
  // from the follow camera: a doorway you enter by walking toward the lens is
  // a doorway the camera cannot follow you through.
  const SHOP_X = 176, SHOP_Z = -30;
  const parade = new VoxWorld(), paradeLid = new VoxWorld(), paradeNeon = new VoxWorld();
  const local = { porches: [], spills: [] };
  anchors.shop = shopParade(parade, paradeLid, paradeNeon, local, 0, 0);
  w.merge(parade, { ox: SHOP_X, oz: SHOP_Z, mirrorZ: true });
  // The lid is meshed on its own so it can be taken away when the player is
  // inside. All of it sits above the walk field's headroom band, so leaving it
  // out of the collision world changes nothing.
  const lidWorld = new VoxWorld().merge(paradeLid, { ox: SHOP_X, oz: SHOP_Z, mirrorZ: true });
  const neonWorld = new VoxWorld().merge(paradeNeon, { ox: SHOP_X, oz: SHOP_Z, mirrorZ: true });
  const flip = (p) => [p[0] + SHOP_X, p[1], SHOP_Z - p[2]];
  anchors.shopLights = (local.shopLights || []).map(flip);
  anchors.signLights = (local.signLights || []).map(flip);
  anchors.shopDoor = flip(local.door);
  anchors.laundryDoor = flip(local.laundryDoor);
  anchors.laundryLight = flip(local.laundryLight);
  anchors.keeper = flip(local.keeper);
  anchors.folder = flip(local.folder);
  for (const h of ROSTER)
    house(w, anchors, { ...h, z: h.dir > 0 ? FAR_Z : NEAR_Z, dep: HOUSE_DEP });
  dressing(w, anchors);

  // The player's car sleeps at the kerb outside the hero house — the racing
  // campaign made visible on the street you walk. The same wagon shell as
  // every parked car, wearing the paint from the save, and solid the same way
  // everything here is solid: it is voxels, so the walk field gets it free.
  // BEFORE the mesh is built, or it would be the classic invisible collider.
  if (save) {
    const b = BODIES[save.paint || 0] || BODIES[0];
    const tmp = new VoxWorld();
    P.wagon(P.transposeXZ(tmp), 0, 0, 0);
    for (const [k, name] of tmp.v)
      tmp.v.set(k, name === 'carBody' ? b.body : name === 'carTrim' ? b.trim : name);
    w.merge(tmp, { ox: -90, oy: GROUND - 2, oz: ROAD.z0 + 5 });
  }

  const group = new THREE.Group();
  group.name = 'block';
  group.add(meshWorld(w, PALETTE, { name: 'block', solidBelow: 0, noFloorBelow: GROUND - 1 }));
  const shopLid = meshWorld(lidWorld, PALETTE, { name: 'shopLid' });
  group.add(shopLid);
  // The neon is its own mesh with its own material so main.js can make it
  // stutter. Emissive baked into the shared geometry can never change.
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xff6a8a, toneMapped: false });
  const neonGeo = neonWorld.build(PALETTE, {}).glow;
  const neonMesh = neonGeo ? new THREE.Mesh(neonGeo, neonMat) : null;
  if (neonMesh) { neonMesh.name = 'neon'; shopLid.add(neonMesh); }

  // The television. Its own mesh because emissive is a per-material uniform:
  // to flicker it, it has to be a material of its own.
  const tv = anchors.tv;
  const tvMat = new THREE.MeshBasicMaterial({ color: 0x79b4ff, toneMapped: false });
  const tvMesh = new THREE.Mesh(new THREE.PlaneGeometry(tv.w, tv.h), tvMat);
  tvMesh.position.set(tv.x + tv.w / 2, tv.y + tv.h / 2, tv.z);
  tvMesh.name = 'tv';
  group.add(tvMesh);

  // The collision field is derived from the voxels that were actually built,
  // so nobody has to keep a parallel list of colliders honest. The ceiling
  // keeps tree canopies, porch roofs and overhead wires out of it — those are
  // things you walk UNDER.
  const field = w.walkField(BOUNDS.x0, BOUNDS.x1, BOUNDS.z0, BOUNDS.z1, FLOOR_MAX, HEAD);

  return {
    group, anchors, tvMaterial: tvMat, field, shopLid, neonMaterial: neonMesh ? neonMat : null,
    voxels: w.size + lidWorld.size + neonWorld.size,
  };
}
