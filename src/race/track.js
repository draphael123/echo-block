// The circuit: a closed loop through the estate, ~652 metres, about 24 seconds
// a lap at 80 km/h.
//
// It is a rounded rectangle rather than something more characterful because a
// loop has to CLOSE, and closing an arbitrary polyline exactly is a solver, not
// a level. Variety comes from what is beside the road instead: two lit
// residential stretches with real houses, and two unlit ones with nothing but
// hedges and whatever the headlights find.
//
// Everything is placed in track coordinates (s along, u across), and the houses
// are BLITTED from the hub's own builder, rotated to face the road. The
// previous track grew its own roadside geometry and it came out as nine-voxel
// slabs painted in the backdrop colour — walls with a window, which is exactly
// what they looked like.
import * as THREE from 'three';
import { VoxWorld, meshWorld, hash3 } from '../voxel.js';
import { PALETTE } from '../palette.js';
import { FLOOR_MAX, HEAD } from '../walk.js';
import { house } from '../block.js';
import * as P from '../props.js';
import * as S from '../street.js';
import { Path, frame } from './path.js';

// 128 voxels, 10.2m. It was 88, which is a residential street: correct for the
// hub and too tight to race on, because the only line through a skip was the
// one the parked cars were sitting in. Everything else about the cross-section
// is derived from this, so the kerbs, verges, pavements, houses, lamps, start
// gantry and hazard lanes all move with it.
export const ROAD_HALF = 64;
const KERB = 5;
const VERGE = 22;
const APRON = 14;
export const GROUND_Y = 2;

// The rounded rectangle. Straights and radius chosen so it closes exactly.
// Sized down from 1840/1040/380 for cost: a 652m lap came to 4.4M voxels and
// an 11-second build, which is the chunking finding arriving a second time.
const LONG = 1300, SHORT = 800, RAD = 340;
const ARC = Math.PI / 2 * RAD;

export const SECTIONS = [
  { from: 0, to: LONG, lit: true, name: 'the parade' },
  { from: LONG, to: LONG + ARC, lit: true, name: 'chapel corner' },
  { from: LONG + ARC, to: LONG + ARC + SHORT, lit: false, name: 'mill lane' },
  { from: LONG + ARC + SHORT, to: LONG + 2 * ARC + SHORT, lit: false, name: 'the dark bend' },
  { from: LONG + 2 * ARC + SHORT, to: 2 * LONG + 2 * ARC + SHORT, lit: true, name: 'the crescent' },
  { from: 2 * LONG + 2 * ARC + SHORT, to: 2 * LONG + 3 * ARC + SHORT, lit: true, name: 'the top' },
  { from: 2 * LONG + 3 * ARC + SHORT, to: 2 * LONG + 3 * ARC + 2 * SHORT, lit: false, name: 'the cut' },
  { from: 2 * LONG + 3 * ARC + 2 * SHORT, to: 2 * LONG + 4 * ARC + 2 * SHORT, lit: false, name: 'the last bend' },
];
export const isLit = (s) => {
  const sec = SECTIONS.find(x => s >= x.from && s < x.to);
  return sec ? sec.lit : true;
};
export const sectionAt = (s) => SECTIONS.find(x => s >= x.from && s < x.to) || SECTIONS[0];

export function buildPath() {
  return new Path(0, 0, 180)
    .straight(LONG).arc(-90, RAD)
    .straight(SHORT).arc(-90, RAD)
    .straight(LONG).arc(-90, RAD)
    .straight(SHORT).arc(-90, RAD)
    .build();
}

// Everything is built facing +Z. This is the quarter turn that points it at
// a given direction.
function rotToward(dx, dz) {
  if (Math.abs(dz) > Math.abs(dx)) return dz > 0 ? 0 : 180;
  return dx < 0 ? 90 : 270;
}
// A house faces the road: along the inward normal.
const facingRot = (nx, nz, side) => rotToward(-side * nx, -side * nz);
// A parked car does NOT. It lies along the kerb — using the house rotation
// parked every car broadside across the carriageway, which the harness found
// as 'nobody can complete a lap' rather than as anything that looked wrong.
const alongRot = (tx, tz) => rotToward(tx, tz);

// ---------------------------------------------------------------- surface
function ribbon(w, path) {
  const f = frame();
  const half = ROAD_HALF, edge = half + KERB + VERGE + APRON;
  // Over-cover the ARCS only. On the outside of a corner the ribbon stretches
  // and a one-voxel step leaves pinholes a body's probe ring finds; on a
  // straight it is wasted work, and two thirds of this circuit is straight.
  const prev = frame();
  for (let s = 0; s <= path.total; ) {
    path.at(s, f);
    path.at(Math.min(path.total, s + 30), prev);
    const turning = Math.abs(f.tx - prev.tx) + Math.abs(f.tz - prev.tz) > 0.02;
    const stepS = turning ? 0.55 : 1;
    const lit = isLit(s);
    for (let u = -edge; u <= edge; u += 1) {
      const x = Math.round(f.x + f.nx * u), z = Math.round(f.z + f.nz * u);
      const a = Math.abs(u), r = hash3(x, 0, z);
      if (a <= half) {
        let c = r > 0.86 ? 'asphaltWorn' : (r < 0.10 ? 'asphaltPatch' : 'asphalt');
        if (a > half - 3) c = 'asphaltPatch';
        if (a > half - 9 && a < half - 5) c = 'roadLine';       // edge lines
        if (a < 2 && (s % 70) < 40) c = 'roadLine';             // centre dashes
        w.set(x, -1, z, c);
      } else if (a <= half + KERB) {
        // only the road-facing lip needs a full-height face; the rest of the
        // kerb band is a top surface nobody ever sees the side of
        const lip = a <= half + 2;
        for (let y = lip ? -1 : GROUND_Y; y <= GROUND_Y; y++)
          w.set(x, y, z, y === GROUND_Y ? 'curb' : 'concreteOld');
      } else if (a <= half + KERB + 14) {              // pavement
        w.set(x, GROUND_Y, z, ((x >> 3) + (z >> 3)) % 2 ? 'concrete' : 'concreteOld');
      } else if (a <= half + KERB + VERGE) {
        w.set(x, GROUND_Y, z, r > 0.84 ? 'grassDry' : 'grass');
      } else {
        if ((x + z) % 3) continue;
        w.set(x, GROUND_Y, z, lit ? 'grass' : 'leafDark');
      }
    }
    s += stepS;
  }
}

// ---------------------------------------------------------------- houses
// Four prototypes, built once at the origin facing +Z, then blitted round the
// circuit. Building each in place would be eighteen times the work for the
// same result — and these are the hub's houses, with its clapboard banding,
// recessed mullioned windows, gutters and porches.
const RECIPES = [
  { wid: 104, dep: 58, wallTop: 44, band: 4, seed: 3, siding: 'sidingA', sidingDark: 'sidingAdark', trim: 'trimA', door: 'doorRed', base: 'brick' },
  { wid: 96, dep: 56, wallTop: 40, band: 5, seed: 11, siding: 'sidingC', sidingDark: 'sidingCdark', trim: 'trimC', door: 'doorBlue' },
  { wid: 100, dep: 60, wallTop: 46, band: 4, seed: 23, siding: 'sidingD', sidingDark: 'sidingDdark', trim: 'trimD', door: 'doorYellow', base: 'brick' },
  { wid: 92, dep: 54, wallTop: 42, band: 5, seed: 31, siding: 'sidingE', sidingDark: 'sidingEdark', trim: 'trimE', door: 'doorGreen' },
];

function prototypes() {
  return RECIPES.map(r => {
    const w = new VoxWorld();
    // house() pushes porches, window spill AND chimneys — all three have to
    // exist or the builder throws where the hub never would
    const anchors = { porches: [], spills: [], chimneys: [] };
    // built so the FRONT face lands on local z = 0, centred on x
    house(w, anchors, { ...r, x: -(r.wid >> 1), z: -(r.dep - 2), dir: 1 });
    return { w, anchors, ...r };
  });
}

// ---------------------------------------------------------------- dressing
function dress(w, path, anchors, protos) {
  const f = frame();
  const put = (s, u, fn) => { path.place(s, u, f); fn(Math.round(f.x), Math.round(f.z), f); };

  // Streetlights on the lit sections only. Their absence is the level design
  // everywhere else: on an unlit stretch the beam is all you have.
  for (const sec of SECTIONS) {
    if (!sec.lit) continue;
    for (let s = sec.from + 120; s < sec.to - 70; s += 260) {
      const side = ((s / 300) | 0) % 2 ? 1 : -1;
      put(s, side * (ROAD_HALF + KERB + 10), (x, z) => {
        anchors.lamps.push(P.streetLamp(w, x, GROUND_Y, z, 54, -side * 16));
      });
    }
  }

  // Lots. Real houses on the lit stretches, hedges and trees on the dark ones.
  const LOT = 190, SETBACK = ROAD_HALF + KERB + VERGE + 30;
  let n = 0;
  for (let s = 96; s < path.total - 96; s += LOT) {
    const lit = isLit(s);
    for (const side of [-1, 1]) {
      const r = hash3(Math.round(s), side, 5);
      path.place(s, side * SETBACK, f);
      const x = Math.round(f.x), z = Math.round(f.z);
      const rot = facingRot(f.nx, f.nz, side);
      if (lit && r > 0.22) {
        w.merge(protos[(n++) % protos.length].w, { ox: x, oz: z, rotY: rot });
        path.place(s, side * (ROAD_HALF + KERB + 9), f);
        // a boundary hedge, not a 48x48 thicket: the block version was 25k
        // voxels of foliage per lot for something you see edge-on at 80
        const along = Math.abs(f.nz) > Math.abs(f.nx) ? 'x' : 'z';
        P.hedge(w, Math.round(f.x) - (along === 'x' ? 26 : 4), GROUND_Y,
          Math.round(f.z) - (along === 'x' ? 4 : 26), 52, 8, 9 + Math.round(r * 3), along);
        if (r > 0.62) put(s + 44, side * (ROAD_HALF + KERB + 13), (hx, hz) =>
          w.stamp(P.MAILBOX, hx, GROUND_Y, hz));
      } else if (!lit) {
        put(s, side * (ROAD_HALF + KERB + 16), (hx, hz, ff) => {
          const along = Math.abs(ff.nz) > Math.abs(ff.nx) ? 'x' : 'z';
          if (r > 0.8) P.tree(w, hx, GROUND_Y, hz, 36 + Math.round(r * 10), 12 + Math.round(r * 4));
          else P.hedge(w, hx - (along === 'x' ? 26 : 5), GROUND_Y,
            hz - (along === 'x' ? 5 : 26), 52, 10, 13, along);
        });
      }
    }
  }

  // start/finish gantry
  for (const side of [-1, 1])
    put(30, side * (ROAD_HALF + 4), (x, z) => w.box(x - 2, GROUND_Y, z - 2, 4, 64, 4, 'metalDark'));
  put(30, 0, (x, z) => {
    w.box(x - ROAD_HALF - 4, GROUND_Y + 60, z - 3, ROAD_HALF * 2 + 8, 6, 5, 'metalDark');
    w.box(x - ROAD_HALF + 6, GROUND_Y + 62, z - 4, ROAD_HALF * 2 - 12, 2, 1, 'neonSign');
  });
  for (let u = -ROAD_HALF; u <= ROAD_HALF; u++)
    put(30, u, (x, z) => w.set(x, -1, z, ((u >> 2) % 2) ? 'roadLine' : 'asphaltPatch'));

  // council property, because a street has some
  put(430, ROAD_HALF + KERB + 12, (x, z) => S.phoneBox(w, x - 5, GROUND_Y, z - 5));
  put(940, -(ROAD_HALF + KERB + 16), (x, z) => S.busShelter(w, x - 17, GROUND_Y, z - 7, 1));
  for (const [s, side] of [[260, 1], [700, -1], [3300, 1], [3900, -1]]) {
    put(s, side * (ROAD_HALF + KERB + 12), (x, z) => S.bench(w, x - 13, GROUND_Y, z - 4, 1));
    put(s + 70, side * (ROAD_HALF + KERB + 12), (x, z) => P.trashBin(w, x, GROUND_Y, z));
  }
  for (const s of [2000, 2400, 5100, 5500])
    put(s, ROAD_HALF - 3, (x, z) => S.drain(w, x - 4, -1, z - 2));
}

// ---------------------------------------------------------------- parked
// Parked cars at the kerb — blitted like the houses, and into the VOXEL world
// rather than as scene objects, so they are solid for free.
function parked(w, path) {
  const proto = new VoxWorld();
  P.wagon(proto, -11, 0, -25);                        // centred, facing +Z
  const f = frame();
  const spots = [
    [340, 1], [640, -1], [1000, 1], [1180, -1],
    [2050, -1], [2350, 1],
    [3200, 1], [3600, -1], [4000, 1],
    [5150, -1], [5500, 1],
  ];
  for (const [s, side] of spots) {
    // Half on the kerb. Parked at ROAD_HALF - 13 a 26-wide car spans u 18..44,
    // which is exactly where a driver dodging a skip goes — the harness found
    // it as two crashes on clear road with nothing to hit.
    path.place(s, side * (ROAD_HALF + 8), f);
    const rot = (alongRot(f.tx, f.tz) + (hash3(Math.round(s), 1, 2) > 0.5 ? 180 : 0)) % 360;
    w.merge(proto, { ox: Math.round(f.x), oz: Math.round(f.z), rotY: rot });
  }
}

// ---------------------------------------------------------------- hazards
// Bigger than a bike's. At 80 km/h a wheelie bin is not an event, so these are
// roadworks, skips and a broken-down car — and most of them are where the
// streetlights are not.
// Placed as a fraction of the carriageway, not in absolute voxels: on a wider
// road the same numbers would leave a clear lane past every one of them, and
// a hazard you can ignore is scenery.
const H = (f) => Math.round(ROAD_HALF * f);
export const HAZARDS = [
  { s: 800, u: H(0.55), r: 30, kind: 'works' },
  { s: 1950, u: H(-0.30), r: 32, kind: 'skip' },
  { s: 2200, u: H(0.34), r: 30, kind: 'works' },
  { s: 2460, u: H(-0.30), r: 34, kind: 'broken' },
  { s: 3620, u: H(-0.60), r: 32, kind: 'skip' },
  { s: 5050, u: H(0.34), r: 30, kind: 'works' },
  { s: 5320, u: H(-0.34), r: 34, kind: 'broken' },
  { s: 5600, u: H(0.28), r: 30, kind: 'works' },
];

function hazards(w, path) {
  const f = frame();
  const wagon = new VoxWorld();
  P.wagon(wagon, -11, 0, -25);
  for (const h of HAZARDS) {
    path.place(h.s, h.u, f);
    const x = Math.round(f.x), z = Math.round(f.z);
    h.x = x; h.z = z;
    const rot = facingRot(f.nx, f.nz, Math.sign(h.u) || 1);
    if (h.kind === 'works') {
      for (let i = -2; i <= 2; i++)
        S.roadCone(w, x + Math.round(f.nx * i * 9), -2, z + Math.round(f.nz * i * 9));
      const bar = new VoxWorld();
      S.barrier(bar, -14, -1, -1, 28);
      w.merge(bar, { ox: x, oz: z, rotY: rot });
    } else if (h.kind === 'skip') {
      const sk = new VoxWorld();
      S.skip(sk, -22, -1, -10);
      w.merge(sk, { ox: x, oz: z, rotY: rot });
    } else {
      // broken down, so it is pointing where it was going, not at the kerb
      w.merge(wagon, { ox: x, oz: z, rotY: alongRot(f.tx, f.tz) });
      for (let i = -1; i <= 1; i++)
        S.roadCone(w,
          x + Math.round(f.nx * i * 10 + f.tx * 36), -2,
          z + Math.round(f.nz * i * 10 + f.tz * 36));
    }
  }
}

// Where to put someone back after they have come off. Assuming "a bit further
// back on the centreline" is clear is exactly how a crash becomes a permanent
// stop: the thing you hit is still there. So ASK the collision field — and
// insist on the CARRIAGEWAY, because canStand is relative to whatever height
// you hand it and will happily agree to standing on top of the skip.
export function safeSpot(path, ground, fromS) {
  const f = frame();
  // 150 voxels back, not 30: a skip has a radius of 28, so respawning 30 short
  // of the one you just hit puts you inside it again with no room to steer.
  for (let back = 150; back < 620; back += 16) {
    const s = Math.max(0, fromS - back);
    for (const u of [0, -32, 32, -48, 48]) {
      path.place(s, u, f);
      const fl = ground.ceilingAt(f.x, f.z, 2.6);
      if (fl <= 0 && !ground.isBlocked(f.x, f.z) && ground.canStand(f.x, f.z, fl, 2.6))
        return { x: f.x, z: f.z, heading: Math.atan2(f.tx, f.tz), s };
    }
  }
  return null;
}

// Pavement beats for the people who live here.
export function lifeSpots() {
  const pave = ROAD_HALF + KERB + 9;
  return [
    { s: 220, u: pave, dir: 1, span: 300 },
    { s: 600, u: -pave, dir: -1, span: 320 },
    { s: 950, u: pave, dir: -1, span: 260 },
    { s: 1180, u: -pave, dir: 1, span: 240 },
    { s: 3150, u: pave, dir: 1, span: 300 },
    { s: 3550, u: -pave, dir: -1, span: 300 },
    { s: 3950, u: pave, dir: -1, span: 280 },
    { s: 4300, u: -pave, dir: 1, span: 260 },
  ];
}

// ---------------------------------------------------------------- assemble
export function buildTrack() {
  const t0 = performance.now();
  const path = buildPath();
  const w = new VoxWorld();
  const anchors = { lamps: [] };
  const protos = prototypes();
  ribbon(w, path);
  dress(w, path, anchors, protos);
  parked(w, path);
  hazards(w, path);

  const group = new THREE.Group();
  group.name = 'track';
  group.add(meshWorld(w, PALETTE, { name: 'track', solidBelow: -2, noFloorBelow: GROUND_Y - 1 }));

  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (let i = 0; i < path.points.length; i += 2) {
    bx0 = Math.min(bx0, path.points[i]); bx1 = Math.max(bx1, path.points[i]);
    bz0 = Math.min(bz0, path.points[i + 1]); bz1 = Math.max(bz1, path.points[i + 1]);
  }
  const pad = ROAD_HALF + KERB + VERGE + APRON + 100;
  const field = w.walkField(
    Math.floor(bx0 - pad), Math.ceil(bx1 + pad),
    Math.floor(bz0 - pad), Math.ceil(bz1 + pad), FLOOR_MAX, HEAD);

  const start = frame();
  path.at(80, start);

  return {
    group, path, field, anchors, hazards: HAZARDS,
    start: { x: start.x, z: start.z, heading: Math.atan2(start.tx, start.tz) },
    voxels: w.size,
    buildMs: Math.round(performance.now() - t0),
    lapLength: path.total,
  };
}
