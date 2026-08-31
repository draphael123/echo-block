// The block itself. One street, two houses, a driveway between them.
//
// Coordinates: 1 unit = 1 voxel ~= 8cm. +Z is toward the camera (the road),
// -Z is back into the lots. Road surface sits at y=0; kerbs, walks and lawns
// are raised to y=2.
import * as THREE from 'three';
import { VoxWorld, meshWorld, hash3 } from './voxel.js';
import { PALETTE, tint } from './palette.js';
import * as P from './props.js';

export const GROUND = 2;          // top of the raised ground (lawn / walk)
export const BOUNDS = { x0: -224, x1: 172, z0: -112, z1: 132 };

const rnd = (x, z, s = 0) => hash3(x, s, z);

// --------------------------------------------------------------- ground
function ground(w) {
  const { x0, x1, z0, z1 } = BOUNDS;
  for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
    const r = rnd(x, z);
    if (z >= 46) {                                   // the road
      let c = r > 0.86 ? 'asphaltWorn' : (r < 0.10 ? 'asphaltPatch' : 'asphalt');
      // gutter line and a long tar seam down the middle of the lane
      if (z === 46 || z === 47) c = 'asphaltPatch';
      if (z === 68 && (x + 200) % 26 < 14) c = 'roadLine';
      w.set(x, -1, z, c);
    } else if (z >= 42) {                            // kerb
      for (let y = -1; y <= GROUND; y++) w.set(x, y, z, y === GROUND ? 'curb' : 'concreteOld');
    } else {                                         // everything behind it
      const walk = z >= 26 && z < 42;
      const drive = x >= -12 && x < 26 && z < 26;
      let c;
      if (walk || drive) {
        // slabs, with a crack every few joints
        const joint = walk ? ((x + 300) % 17 === 0) : ((z + 300) % 21 === 0);
        c = joint ? 'concreteOld' : (r > 0.9 ? 'concreteOld' : 'concrete');
      } else if (z >= 26) {
        c = r > 0.84 ? 'grassDry' : 'grass';
      } else {
        c = r > 0.86 ? 'grassDry' : (r < 0.03 ? 'dirt' : 'grass');
      }
      // the y=-1 course is never seen; it exists so the plate's underside is
      // culled by solidBelow instead of emitting a face per ground voxel
      for (let y = -1; y <= GROUND; y++) w.set(x, y, z, y === GROUND ? c : 'dirt');
    }
  }
  // the front walk, from house A's steps out to the pavement
  for (let x = -76; x < -62; x++) for (let z = -12; z < 30; z++)
    w.set(x, GROUND, z, (z + 300) % 19 === 0 ? 'concreteOld' : 'concrete');
}

// --------------------------------------------------------------- houses
// A window that is actually recessed: cut through the wall, set the glass on
// the inner face, and frame it. Flat windows painted on a wall look like
// stickers, and at this voxel size the 2-voxel reveal is very visible.
// Mullions matter more than they sound like they should: a lit rectangle with
// nothing crossing it reads as a sticker on the wall no matter how good the
// colour is. The cross sits one voxel PROUD of the glass so it casts into the
// reveal, and the curtain band keeps the pane from being one flat value.
function pane(w, x, y, z, ww, hh, glass, curtain) {
  if (!glass) return;
  w.box(x, y, z, ww, hh, 1, glass);
  if (!curtain) return;
  w.box(x, y + hh - 5, z, ww, 5, 1, tint(glass, 0.42));      // pelmet
  w.box(x, y, z, 3, hh - 5, 1, tint(glass, 0.55));           // curtains, drawn back
  w.box(x + ww - 3, y, z, 3, hh - 5, 1, tint(glass, 0.55));
  w.box(x + 4, y, z, ww - 8, 2, 1, tint(glass, 0.30));       // something on the sill
}

function windowZ(w, x, y, z, ww, hh, glass, trim, opts) {
  const { curtain = false, mullions = true } = opts || {};
  w.cut(x, y, z, ww, hh, 2);
  pane(w, x, y, z + 2, ww, hh, glass, curtain);
  if (mullions) {
    w.box(x + (ww >> 1), y, z + 1, 1, hh, 1, trim);
    w.box(x, y + (hh >> 1), z + 1, ww, 1, 1, trim);
  }
  w.box(x - 1, y - 1, z, ww + 2, 1, 1, trim);
  w.box(x - 1, y + hh, z, ww + 2, 1, 1, trim);
  w.box(x - 1, y, z, 1, hh, 1, trim);
  w.box(x + ww, y, z, 1, hh, 1, trim);
  w.box(x - 2, y - 2, z, ww + 4, 1, 1, trim);       // sill
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

// Fill the triangular gable ends left open by a ridge-along-X roof.
function gableEnds(w, x, y, z, wid, dep, c) {
  const half = Math.ceil(dep / 2);
  for (let k = 0; k < dep; k++) {
    const rise = Math.min(half, Math.min(k, dep - 1 - k));
    for (let j = 0; j < rise; j++) {
      for (let t = 0; t < 2; t++) {
        w.set(x + t, y + j, z + k, c);
        w.set(x + wid - 1 - t, y + j, z + k, c);
      }
    }
  }
}

function houseA(w, anchors) {
  const x = -122, z = -86, wid = 104, dep = 56, wallTop = 46;
  const siding = (px, py) => (py % 4 === 0 ? 'sidingAdark' : 'sidingA');
  w.box(x, GROUND + 1, z, wid, 6, dep, (px, py, pz) =>
    (rnd(px, pz, py) > 0.85 ? 'brickDark' : 'brick'));
  w.shell(x, GROUND + 7, z, wid, wallTop, dep, 2, siding, { top: false, bottom: false });
  gableEnds(w, x, GROUND + 7 + wallTop, z, wid, dep, siding);
  w.gable(x, GROUND + 7 + wallTop, z, wid, dep, (px, py, pz) =>
    (rnd(px, pz, py) > 0.8 ? 'shingleDark' : 'shingle'), { eave: 3, thick: 3 });

  const fz = z + dep - 2;                            // front face
  const y0 = GROUND + 7;

  // door, under the porch roof
  w.cut(x + 40, y0, fz, 12, 22, 2);
  w.box(x + 40, y0, fz + 1, 12, 22, 1, 'doorRed');
  w.box(x + 44, y0 + 12, fz, 4, 6, 1, 'winWarmDim');   // the glass in the door
  w.set(x + 49, y0 + 10, fz, 'chrome');
  w.box(x + 38, y0 - 1, fz - 1, 16, 1, 3, 'trimA');

  // front windows: one warm behind a curtain, one dark, one is the television
  windowZ(w, x + 14, y0 + 12, fz, 18, 20, 'winWarm', 'trimA', { curtain: true });
  windowZ(w, x + 66, y0 + 12, fz, 18, 20, null, 'trimA');
  windowZ(w, x + 88, y0 + 14, fz, 12, 14, 'winWarmDim', 'trimA', { curtain: true });
  // upstairs, in the gable end on the right
  windowX(w, x + wid - 2, y0 + wallTop + 4, z + 24, 10, 12, 'glassDark', 'trimA');
  // side windows so the flank is not a blank wall
  windowX(w, x, y0 + 16, z + 16, 12, 16, 'winWarmDim', 'trimA', { curtain: true });
  windowX(w, x, y0 + 16, z + 36, 12, 16, 'glassDark', 'trimA');

  // the television window — cut here, filled by an animated mesh in main.js
  const tv = { x: x + 66, y: y0 + 12, z: fz + 2.5, w: 18, h: 20 };
  anchors.tv = tv;

  // ---- porch
  const px0 = x + 24, px1 = x + 74, pz0 = fz + 2, pz1 = fz + 20;
  w.box(px0, GROUND + 1, pz0, px1 - px0, 6, pz1 - pz0, 'brickDark');
  w.box(px0, y0, pz0, px1 - px0, 1, pz1 - pz0, 'woodPale');
  for (const cx of [px0 + 1, px1 - 4]) {
    w.box(cx, y0 + 1, pz1 - 5, 4, 30, 4, 'trimA');
    w.box(cx - 1, y0 + 30, pz1 - 6, 6, 2, 6, 'trimA');
  }
  w.box(px0 - 2, y0 + 32, pz0 - 2, px1 - px0 + 4, 3, pz1 - pz0 + 4, (pxx, pyy, pzz) =>
    (rnd(pxx, pzz, pyy) > 0.8 ? 'shingleDark' : 'shingle'));
  // steps down to the walk
  for (let s = 0; s < 3; s++)
    w.box(x + 40, GROUND + 1 + s * 2, pz1 + s * 3, 14, 2, 3, 'concreteOld');
  // railing
  for (const rz of [pz1 - 1]) {
    for (let i = px0; i < x + 40; i += 3) w.box(i, y0 + 1, rz, 1, 10, 1, 'trimA');
    for (let i = x + 54; i < px1; i += 3) w.box(i, y0 + 1, rz, 1, 10, 1, 'trimA');
    w.box(px0, y0 + 11, rz, x + 40 - px0, 1, 2, 'trimA');
    w.box(x + 54, y0 + 11, rz, px1 - (x + 54), 1, 2, 'trimA');
  }
  // porch bulb beside the door
  w.box(x + 56, y0 + 20, fz, 2, 3, 1, 'metalDark');
  w.box(x + 56, y0 + 19, fz + 1, 2, 1, 1, 'porchBulb');
  anchors.porchA = [x + 57, y0 + 20, fz + 2];

  // chimney
  w.box(x + 16, GROUND + 7, z + 20, 12, wallTop + 34, 10, (pxx, pyy, pzz) =>
    (rnd(pxx, pzz, pyy) > 0.82 ? 'brickDark' : 'brick'));
  w.box(x + 14, GROUND + 7 + wallTop + 34, z + 18, 16, 2, 14, 'brickDark');

  // gutter along the eave, with a downpipe
  w.box(x - 3, GROUND + 7 + wallTop - 1, fz + 3, wid + 6, 2, 2, 'trimA');
  w.box(x + wid - 4, y0, fz + 3, 2, wallTop, 2, 'trimA');
  return { x, z, wid, dep, front: fz };
}

function houseB(w, anchors) {
  const x = 34, z = -88, wid = 108, dep = 58, wallTop = 40;
  const siding = (px, py) => (py % 5 === 0 ? 'sidingBdark' : 'sidingB');
  w.box(x, GROUND + 1, z, wid, 5, dep, 'brickDark');
  w.shell(x, GROUND + 6, z, wid, wallTop, dep, 2, siding, { top: false, bottom: false });
  gableEnds(w, x, GROUND + 6 + wallTop, z, wid, dep, siding);
  w.gable(x, GROUND + 6 + wallTop, z, wid, dep, (px, py, pz) =>
    (rnd(px, pz, py) > 0.8 ? 'shingleDark' : 'shingle'), { eave: 3, thick: 3 });

  const fz = z + dep - 2, y0 = GROUND + 6;
  // the garage door faces the driveway, on the -X flank
  w.cut(x, y0, z + 26, 2, 26, 28);
  w.box(x + 1, y0, z + 26, 1, 26, 28, (px, py) => (py % 3 === 0 ? 'metalDark' : 'metal'));
  w.box(x - 1, y0 + 26, z + 24, 3, 2, 32, 'trimB');
  windowZ(w, x + 20, y0 + 12, fz, 16, 16, 'glassDark', 'trimB');
  windowZ(w, x + 56, y0 + 12, fz, 16, 16, 'winWarmDim', 'trimB', { curtain: true });
  windowX(w, x + wid - 2, y0 + 14, z + 20, 10, 14, 'glassDark', 'trimB');
  // one lit room upstairs in the gable
  windowZ(w, x + 46, y0 + wallTop + 6, fz, 12, 12, 'winWarm', 'trimB', { curtain: true });

  w.cut(x + 84, y0, fz, 10, 20, 2);
  w.box(x + 84, y0, fz + 1, 10, 20, 1, 'doorBlue');
  w.box(x + 80, y0 + 22, fz, 2, 2, 1, 'metalDark');
  w.box(x + 80, y0 + 21, fz + 1, 2, 1, 1, 'porchBulb');
  anchors.porchB = [x + 81, y0 + 22, fz + 2];
  return { x, z, wid, dep, front: fz };
}

// A silhouette of the rest of the street, so the block does not end in fog.
function farBlock(w) {
  let x = -150;
  while (x < 150) {
    const wid = 40 + Math.round(rnd(x, 7) * 40);
    const h = 40 + Math.round(rnd(x, 11) * 26);
    const z = -178 - Math.round(rnd(x, 3) * 26);
    w.box(x, GROUND, z, wid, h, 40, 'hillFar');
    w.gable(x, GROUND + h, z, wid, 40, 'hillFar', { eave: 2, thick: 3 });
    if (rnd(x, 5) > 0.45) {                       // a lit window or two
      const wy = GROUND + 12 + Math.round(rnd(x, 9) * (h - 24));
      w.box(x + 8 + Math.round(rnd(x, 13) * (wid - 20)), wy, z + 39, 6, 7, 1,
        rnd(x, 17) > 0.6 ? 'winWarmDim' : 'winWarm');
    }
    x += wid + 12 + Math.round(rnd(x, 19) * 20);
  }
  // treeline behind them
  for (let i = 0; i < 26; i++) {
    const tx = -160 + i * 12 + Math.round(rnd(i, 23) * 8);
    P.ball(w, tx, GROUND + 30 + Math.round(rnd(i, 29) * 20), -230, 14 + Math.round(rnd(i, 31) * 8),
      'hillFar', 0.35);
  }
}

// --------------------------------------------------------------- clutter
function dressing(w, anchors) {
  // street furniture on the verge
  anchors.lamp = P.streetLamp(w, -66, GROUND, 18, 54, 16);
  anchors.pole = P.utilityPole(w, 86, GROUND, 18, 80);
  P.utilityPole(w, -178, GROUND, 18, 80);
  P.hydrant(w, 40, GROUND, 32);

  // overhead wires. A sagging parabola between the two poles; these cross the
  // frame and do more for "1986 suburb" than any single prop.
  const wire = (x0, y0, x1, y1, z, sag) => {
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      const y = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * sag;
      w.set(x, Math.round(y), z, 'metalDark');
    }
  };
  for (const [dz, sag] of [[-4, 9], [0, 10], [4, 11]]) {
    wire(-178, GROUND + 76, 86, GROUND + 76, 18 + dz, sag);
    wire(86, GROUND + 76, 250, GROUND + 70, 18 + dz, sag);
  }
  // a service drop from the pole to house B's eave
  wire(60, GROUND + 66, 86, GROUND + 74, 20, 4);

  // house A's lot
  P.tree(w, -132, GROUND, -6, 46, 22);
  P.hedge(w, -122, GROUND, -26, 104, 8, 12, 'x');
  P.picketFence(w, 28, GROUND, -30, 56, 'z');
  P.mailbox && w.stamp(P.MAILBOX, -74, GROUND, 22);
  w.stamp(P.GNOME, -96, GROUND, -18);
  w.stamp(P.NEWSPAPER, -70, GROUND, 6);
  P.bikeDown(w, -104, GROUND, 4);
  P.hose(w, -110, GROUND, -14);
  P.leafPile(w, -50, GROUND, -4, 9);
  P.leafPile(w, -30, GROUND, 12, 6);
  P.lawnChair(w, -60, GROUND + 4, -22);
  P.trashBin(w, -30, GROUND, 30);
  P.trashBin(w, -18, GROUND, 30, { lidOff: true });
  P.ball(w, -44, GROUND + 3, 8, 3, 'plasticRed');

  // the driveway
  P.wagon(w, -8, GROUND, -18);
  P.basketballHoop(w, 30, GROUND, -6);
  P.trashBin(w, 30, GROUND, 34);
  w.stamp(P.MAILBOX, 62, GROUND, 22);

  // house B's lot
  P.hedge(w, 34, GROUND, -28, 108, 7, 10, 'x');
  P.tree(w, 120, GROUND, -14, 38, 17);
  P.leafPile(w, 74, GROUND, -12, 7);

  // scattered leaf litter in the gutter, where the wind puts it
  for (let i = 0; i < 340; i++) {
    const x = -140 + Math.round(rnd(i, 41) * 280);
    const z = 46 + Math.round(rnd(i, 43) * 3);
    w.set(x, 0, z, rnd(i, 47) > 0.5 ? 'leafLitter' : 'leafLitter2');
  }
}

// --------------------------------------------------------------- assemble
export function buildBlock() {
  const w = new VoxWorld();
  const anchors = {};
  ground(w);
  farBlock(w);
  houseA(w, anchors);
  houseB(w, anchors);
  dressing(w, anchors);

  const group = new THREE.Group();
  group.name = 'block';
  group.add(meshWorld(w, PALETTE, { name: 'block', solidBelow: 0 }));

  // The television. Its own mesh because emissive is a per-material uniform:
  // to flicker it, it has to be a material of its own.
  const tv = anchors.tv;
  const tvMat = new THREE.MeshBasicMaterial({ color: 0x79b4ff, toneMapped: false });
  const tvMesh = new THREE.Mesh(new THREE.PlaneGeometry(tv.w, tv.h), tvMat);
  tvMesh.position.set(tv.x + tv.w / 2, tv.y + tv.h / 2, tv.z);
  tvMesh.name = 'tv';
  group.add(tvMesh);

  return { group, anchors, tvMaterial: tvMat, voxels: w.size };
}
