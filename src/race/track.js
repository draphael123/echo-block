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
import { VoxWorld, meshWorld, meshChunks, hash3 } from '../voxel.js';
import { PALETTE } from '../palette.js';
import { FLOOR_MAX, HEAD, STEP_UP, Ground } from '../walk.js';
import { house } from '../block.js';
import * as P from '../props.js';
import * as S from '../street.js';
import { Path, frame } from './path.js';
import * as D from './district.js';

// 192 voxels, 15.4m. It has been 88 (a residential street, too tight to race
// on) and 128 (two lanes, still one line through a skip). At 192 there are four
// lanes and a real choice of line, which is what a hazard needs to be a
// decision rather than a wall with a gap in it.
//
// Everything else about the cross-section derives from this — kerbs, verges,
// pavements, frontages, lamps, the start gantry, the hazard lanes and the
// sim's dodge target all move with it. That is deliberate: this number has now
// changed three times and each change has to stay a one-line change.
export const ROAD_HALF = 108;
const KERB = 5;
// The footway, and it is a real one now: 52 voxels is 4.2 metres, where it used
// to be 14 (1.1m — barely a kerb edge, and too narrow for two people to pass or
// for a bench to stand on without blocking it). Everything that lives on the
// pavement is placed relative to PAVE rather than by a hand-picked offset, so
// widening it again moves the benches, bins, boxes, hedges and walkers with it.
export const PAVE = 52;
const VERGE = 14;
const APRON = 6;

// The three lines everything on the footway is placed against.
export const KERBSIDE = ROAD_HALF + KERB + 8;         // lamps, signs, beacons
export const PAVE_MID = ROAD_HALF + KERB + PAVE / 2;  // where people walk
export const PAVE_BACK = ROAD_HALF + KERB + PAVE - 6; // benches, boxes, hedges
export const GROUND_Y = 2;

// ------------------------------------------------------------------ relief
// The circuit was dead flat, which cost it twice. Visually a flat ribbon has no
// silhouette of its own — every shot is buildings against fog with a grey band
// underneath. And mechanically, DARKNESS was the only thing that could ever
// hide the road from you, which made the whole lighting design carry a job it
// should have been sharing: a crest hides what is over it in broad daylight.
//
// Height is a function of s ALONE, so the road is level across its width. No
// camber, no banking, and no chance of two different s values disagreeing about
// how high the same patch of ground is.
//
// Control points are (s, voxels). 1 voxel is 8cm, so this spans about 4.3
// metres top to bottom. Between knots it is a cosine, which makes every knot a
// crest or a dip rather than a corner you can feel through the wheel.
const PROFILE = [
  [0, 0],        // the start line, and the value the lap has to come back to
  [760, 12],
  [1500, 30],    // the parade climbs to the chapel, which is on the high ground
  [1910, 34],
  [2530, 4],     // and drops away down mill lane
  [2950, -20],   // the long dark sits in a hollow: the beam swings up out of it
  [3350, -2],
  [4020, 26],    // a crest halfway down the crescent -- you cannot see the exit
  [4690, 10],
  [5220, 22],    // the top is the top
  [5700, -14],   // and the cut is a cutting, so it is BELOW everything
  [5980, -8],
  [6250, 8],
];

const smooth = (t) => (1 - Math.cos(t * Math.PI)) / 2;

// Height of the ground at arc-length s, in voxels, wrapping at the lap.
export function elev(s) {
  const total = LAP;
  s = ((s % total) + total) % total;
  let i = 0;
  while (i < PROFILE.length - 1 && PROFILE[i + 1][0] <= s) i++;
  const [s0, h0] = PROFILE[i];
  const [s1, h1] = i === PROFILE.length - 1 ? [total, PROFILE[0][1]] : PROFILE[i + 1];
  const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
  return Math.round(h0 + (h1 - h0) * smooth(t));
}

// The extremes, so the mesher and the collision field can be told where the
// world actually starts and stops rather than assuming y = 0 is the ground.
export const ELEV_MIN = PROFILE.reduce((m, p) => Math.min(m, p[1]), 0);
export const ELEV_MAX = PROFILE.reduce((m, p) => Math.max(m, p[1]), 0);

// FOUR DIFFERENT CORNERS. The first circuit had four ninety-degree bends at
// the same 340 radius, which meant one braking decision learned once and then
// repeated: there was nothing to remember a lap BY, and the harness could not
// tell the second corner from the fourth either.
//
// A closed loop of four 90-degree turns with axis-aligned straights closes
// exactly when the opposite spans match:
//
//     L3 = L1 + R1 + R4 - R2 - R3
//     L4 = L2 + R1 + R2 - R3 - R4
//
// so the RADII are free and only two of the straights are solved for. That is
// the whole reason the corners can differ at all. buildPath() then measures the
// closure rather than trusting the algebra.
//
// R1 is a 260 hairpin you brake hard for (38 km/h through it); R2 is a 520
// sweeper you take nearly flat and which is unlit, so it is the one corner you
// commit to on faith. The two in between give the lap its rhythm.
const R1 = 260, R2 = 520, R3 = 340, R4 = 440;
const L1 = 1500, L2 = 620;
const L3 = L1 + R1 + R4 - R2 - R3;
const L4 = L2 + R1 + R2 - R3 - R4;
const A = (r) => Math.PI / 2 * r;

// Each leg is a district as well as a section. The name is what the HUD says;
// the district is what stands beside the road, and no two legs share one.
const LEGS = [
  { len: L1, lit: true, name: 'the parade', district: 'parade' },
  { len: A(R1), lit: true, name: 'chapel corner', district: 'chapel' },
  { len: L2, lit: false, name: 'mill lane', district: 'mill' },
  { len: A(R2), lit: false, name: 'the long dark', district: 'wood' },
  { len: L3, lit: true, name: 'the crescent', district: 'crescent' },
  { len: A(R3), lit: true, name: 'the top', district: 'park' },
  { len: L4, lit: false, name: 'the cut', district: 'yard' },
  { len: A(R4), lit: false, name: 'the last bend', district: 'farm' },
];

export const SECTIONS = (() => {
  let at = 0;
  return LEGS.map(l => { const sec = { ...l, from: at, to: at + l.len }; at += l.len; return sec; });
})();
export const LAP = SECTIONS[SECTIONS.length - 1].to;

export const isLit = (s) => {
  const sec = SECTIONS.find(x => s >= x.from && s < x.to);
  return sec ? sec.lit : true;
};
export const sectionAt = (s) => SECTIONS.find(x => s >= x.from && s < x.to) || SECTIONS[0];

export function buildPath() {
  const p = new Path(0, 0, 180)
    .straight(L1).arc(-90, R1)
    .straight(L2).arc(-90, R2)
    .straight(L3).arc(-90, R3)
    .straight(L4).arc(-90, R4)
    .build();
  // A loop that does not quite close leaves a step in the road you only find by
  // driving into it, so say so here instead.
  const n = p.points.length;
  const gap = Math.hypot(p.points[0] - p.points[n - 2], p.points[1] - p.points[n - 1]);
  if (gap > 8) console.error('track: the loop is ' + Math.round(gap) + ' voxels from closing - check the L3/L4 solution in track.js');
  return p;
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
  const half = ROAD_HALF, edge = half + KERB + PAVE + VERGE + APRON;
  // Over-cover the ARCS only. On the outside of a corner the ribbon stretches
  // and a one-voxel step leaves pinholes a body's probe ring finds; on a
  // straight it is wasted work, and two thirds of this circuit is straight.
  const prev = frame();
  let gyPrev = elev(0);
  for (let s = 0; s <= path.total; ) {
    path.at(s, f);
    path.at(Math.min(path.total, s + 30), prev);
    const turning = Math.abs(f.tx - prev.tx) + Math.abs(f.tz - prev.tz) > 0.02;
    const stepS = turning ? 0.55 : 1;
    const lit = isLit(s);
    // The whole cross-section rises and falls together. Where the height
    // changes we also write the voxel BELOW, which turns what would be a
    // one-voxel-thick sheet with a diagonal gap in it into a proper staircase:
    // 80cm treads, 8cm risers, watertight, and under the car's 4-voxel step-up.
    const gy = elev(s);
    const riser = gy !== gyPrev ? Math.min(gy, gyPrev) : null;
    for (let u = -edge; u <= edge; u += 1) {
      const x = Math.round(f.x + f.nx * u), z = Math.round(f.z + f.nz * u);
      const a = Math.abs(u), r = hash3(x, 0, z);
      if (a <= half) {
        let c = r > 0.86 ? 'asphaltWorn' : (r < 0.10 ? 'asphaltPatch' : 'asphalt');
        if (a > half - 3) c = 'asphaltPatch';
        if (a > half - 9 && a < half - 5) c = 'roadLine';       // edge lines
        // Four lanes wants three sets of markings, not one: a 15-metre road
        // with a single stripe down it reads as an airstrip.
        if (a > half / 2 - 2 && a < half / 2 + 1 && (s % 96) < 52) c = 'roadLine';
        if (a < 2 && (s % 70) < 40) c = 'roadLine';             // centre dashes
        w.set(x, -1 + gy, z, c);
        if (riser !== null) w.set(x, -1 + riser, z, c);
      } else if (a <= half + KERB) {
        // only the road-facing lip needs a full-height face; the rest of the
        // kerb band is a top surface nobody ever sees the side of
        const lip = a <= half + 2;
        // iterate in LOCAL height and add gy at the write, so the kerb keeps
        // its shape and just moves with the road
        const from = (lip ? -1 : GROUND_Y) + (riser !== null ? riser - gy : 0);
        for (let y = from; y <= GROUND_Y; y++)
          w.set(x, y + gy, z, y === GROUND_Y ? 'curb' : 'concreteOld');
      } else if (a <= half + KERB + PAVE) {            // pavement
        const c = ((x >> 3) + (z >> 3)) % 2 ? 'concrete' : 'concreteOld';
        w.set(x, GROUND_Y + gy, z, c);
        if (riser !== null) w.set(x, GROUND_Y + riser, z, c);
      } else if (a <= half + KERB + PAVE + VERGE) {
        const c = r > 0.84 ? 'grassDry' : 'grass';
        w.set(x, GROUND_Y + gy, z, c);
        if (riser !== null) w.set(x, GROUND_Y + riser, z, c);
      } else {
        if ((x + z) % 4) continue;
        w.set(x, GROUND_Y + gy, z, lit ? 'grass' : 'leafDark');
        if (riser !== null) w.set(x, GROUND_Y + riser, z, lit ? 'grass' : 'leafDark');
      }
    }
    gyPrev = gy;
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
// One district per leg. Everything is blitted from a prototype built once at
// the origin, because a mill built in place at four spots is four times the
// work for the same voxels — the same trick the houses use.
//
// Convention, and it has to be ONE convention or nothing lines up: a prototype
// occupies local z in [-dep, 0] with its INTERESTING FACE at z = 0, centred on
// x. facingRot() then turns it to look at the road. Builders that put their
// face at their own minimum z (a terrace shopfront, a barn door, the mill
// loading bay) are built the other way up and mirrored back.
function protoOf(fn, wid, dep, faceMinZ, args = []) {
  const w = new VoxWorld();
  fn(w, -(wid >> 1), GROUND_Y, faceMinZ ? 0 : -dep, ...args);
  return { w, mirrorZ: !!faceMinZ };
}

function makeProtos() {
  return {
    chapel: protoOf(D.chapel, 46, 126, false),
    mill: protoOf(D.mill, 150, 150, true),
    barnA: protoOf(D.barn, 78, 104, true),
    terrace: protoOf(D.terrace, 184, 48, true, [4, 'x', 3]),
    terraceB: protoOf(D.terrace, 184, 48, true, [4, 'x', 19]),
    shed: protoOf(D.parkShelter, 36, 28, true),
    glass: protoOf(D.greenhouse, 24, 44, true),
  };
}

// Which world axis a straight leg runs along, asked of its own tangent rather
// than hardcoded, so changing a radius cannot silently rotate a district.
function legAxis(path, sec, f) {
  path.at((sec.from + sec.to) / 2, f);
  return Math.abs(f.tz) > Math.abs(f.tx) ? 'z' : 'x';
}

// Where a frontage starts: RIGHT BEHIND THE PAVEMENT.
//
// This was ROAD_HALF + KERB + VERGE + 12, which put the mill 260 voxels off the
// road — 21 metres — and a 76-voxel wall that far back at night is not a
// building, it is a slightly darker patch of nothing. Widening the road pushed
// everything out with it and made that worse. Buildings have to crowd the
// pavement or the district may as well not be there.
const SET = ROAD_HALF + KERB + PAVE + 6;

function makeCtx(w, path, anchors, houses) {
  const f = frame();
  const pr = makeProtos();
  // Every placement is handed the GROUND HEIGHT at its own s as `gy`, and uses
  // it instead of GROUND_Y. Nothing may assume the ground is at a fixed height
  // any more — a bench that does is a bench buried in a hill or floating over
  // one, and on a 4-metre profile that is most of the circuit.
  const put = (s, u, fn) => {
    path.place(s, u, f);
    fn(Math.round(f.x), Math.round(f.z), f, GROUND_Y + elev(s), s);
  };
  const blit = (s, u, proto, extraRot = 0) => {
    path.place(s, u, f);
    const rot = (facingRot(f.nx, f.nz, Math.sign(u) || 1) + extraRot) % 360;
    w.merge(proto.w, {
      ox: Math.round(f.x), oz: Math.round(f.z), oy: elev(s),
      mirrorZ: proto.mirrorZ, rotY: rot,
    });
  };
  // Something laid down ALONG the road: hedges, fences, walls. It gets the
  // frame so it can work out which way it is running at that point, because on
  // an arc that answer changes every few voxels.
  const run = (from, to, u, step, fn) => {
    for (let s = from; s < to; s += step) put(s, u, (x, z, ff, gy) => fn(x, z, ff, gy, s));
  };
  const along = (ff) => (Math.abs(ff.nz) > Math.abs(ff.nx) ? 'x' : 'z');
  return { w, path, anchors, houses, pr, f, put, blit, run, along };
}

// -------------------------------------------------------------- districts
const DISTRICT = {
  // The high street. Shopfronts at pavement level with flats over them, in a
  // continuous run — the party walls are the whole difference between a high
  // street and a row of detached boxes.
  parade(c, sec) {
    for (const side of [-1, 1]) {
      // A GAP every third block, which reads as a side road and stops the
      // parade being one 1300-voxel wall of shopfront.
      for (let s = sec.from + 150, i = 0; s < sec.to - 170; s += 196, i++) {
        if (i % 3 === 2) continue;
        c.blit(s, side * SET, i % 2 ? c.pr.terraceB : c.pr.terrace);
      }
    }
  },

  // The landmark. A spire is the only thing on this circuit you can see from
  // the far side of it, which is what a landmark is for.
  chapel(c, sec) {
    const mid = (sec.from + sec.to) / 2;
    c.blit(mid, SET + 6, c.pr.chapel);
    c.put(mid - 150, SET + 20, (x, z, ff, gy) => D.gravestones(c.w, x - 60, gy, z - 60, 120, 120, 5));
    c.put(mid + 160, SET + 20, (x, z, ff, gy) => D.gravestones(c.w, x - 50, gy, z - 50, 100, 100, 9));
    c.run(sec.from, sec.to, SET, 46, (x, z, ff, gy) =>
      P.hedge(c.w, x - (c.along(ff) === 'x' ? 24 : 5), gy,
        z - (c.along(ff) === 'x' ? 5 : 24), 48, 10, 20, c.along(ff)));
    // the opposite side stays open, so the spire has sky behind it
    c.run(sec.from, sec.to, -(SET + 40), 150, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 44, 15));
  },

  // Unlit, and the biggest single mass on the circuit. Going past a mill in the
  // dark is most of what this stretch has.
  mill(c, sec) {
    const ax = legAxis(c.path, sec, c.f);
    c.blit(sec.from + 320, SET - 4, c.pr.mill);
    for (const [ds, r, h] of [[70, 15, 76], [112, 15, 76], [152, 13, 62]])
      c.put(sec.from + ds, SET + 30, (x, z, ff, gy) => D.silo(c.w, x, gy, z, r, h));
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * SET, 40, (x, z, ff, gy) =>
        D.chainFence(c.w, ax === 'x' ? x - 20 : x, gy, ax === 'x' ? z : z - 20, 42, ax));
    c.put(sec.from + 470, -(SET + 20), (x, z, ff, gy) => D.pallets(c.w, x, gy, z, 4));
    c.put(sec.from + 250, -(SET + 26), (x, z, ff, gy) => D.oilDrums(c.w, x, gy, z, 7));
    c.put(sec.from + 545, SET + 12, (x, z, ff, gy) => S.skip(c.w, x - 22, gy, z - 10));
  },

  // The unlit sweeper. No buildings at all: whatever the headlights find, which
  // here is trunks going past and nothing behind them.
  wood(c, sec) {
    for (const side of [-1, 1]) {
      // Placed well back, because copse() scatters its trees in WORLD x and z
      // by up to half the spread — at SET + 16 with a spread of 116 that put
      // trunks at u = 75 on a road with a 96-voxel half-width, and canopies over
      // the racing line. The offset has to clear the road by more than the
      // scatter plus a canopy radius.
      c.run(sec.from, sec.to, side * (SET + 62), 124, (x, z, ff, gy, s) =>
        D.copse(c.w, x, gy, z, 88, Math.round(s)));
      c.run(sec.from, sec.to, side * (PAVE_BACK + 8), 54, (x, z, ff, gy) =>
        P.hedge(c.w, x - (c.along(ff) === 'x' ? 28 : 5), gy,
          z - (c.along(ff) === 'x' ? 5 : 28), 56, 9, 14, c.along(ff)));
    }
  },

  // The residential stretch, and the only leg that still gets the hub houses.
  // Keeping them to ONE leg is what makes them read as a neighbourhood rather
  // than as the texture of the whole circuit.
  crescent(c, sec) {
    let n = 0;
    for (let s = sec.from + 90; s < sec.to - 90; s += 190) {
      for (const side of [-1, 1]) {
        const r = hash3(Math.round(s), side, 5);
        c.path.place(s, side * (SET + 18), c.f);
        if (r > 0.2) {
          c.w.merge(c.houses[(n++) % c.houses.length].w, {
            ox: Math.round(c.f.x), oz: Math.round(c.f.z), oy: elev(s),
            rotY: facingRot(c.f.nx, c.f.nz, side),
          });
          c.put(s, side * (PAVE_BACK + 6), (x, z, ff, gy) =>
            P.hedge(c.w, x - (c.along(ff) === 'x' ? 26 : 4), gy,
              z - (c.along(ff) === 'x' ? 4 : 26), 52, 8, 9 + Math.round(r * 3), c.along(ff)));
          if (r > 0.6) c.put(s + 44, side * PAVE_BACK,
            (x, z, ff, gy) => c.w.stamp(P.MAILBOX, x, gy, z));
        } else {
          c.put(s, side * (PAVE_BACK + 14), (x, z, ff, gy) => P.tree(c.w, x, gy, z, 42, 15));
        }
      }
    }
  },

  // Allotments, a playing field and a shelter. Lit, and the one district with
  // no walls in it at all — after the crescent the eye wants the space.
  park(c, sec) {
    const mid = (sec.from + sec.to) / 2;
    c.put(sec.from + 130, SET + 46, (x, z, ff, gy) => D.goalposts(c.w, x - 28, gy, z));
    c.put(sec.to - 160, SET + 46, (x, z, ff, gy) => D.goalposts(c.w, x - 28, gy, z));
    c.blit(mid, SET + 8, c.pr.shed);
    c.blit(mid + 180, SET + 8, c.pr.glass);
    c.put(mid - 190, -(SET + 34), (x, z, ff, gy) => D.allotment(c.w, x - 70, gy, z - 50, 140, 100, 4));
    c.put(mid + 110, -(SET + 34), (x, z, ff, gy) => D.allotment(c.w, x - 70, gy, z - 50, 140, 100, 12));
    c.run(sec.from, sec.to, SET, 52, (x, z, ff, gy) =>
      P.picketFence(c.w, x - (c.along(ff) === 'x' ? 26 : 0), gy,
        z - (c.along(ff) === 'x' ? 0 : 26), 52, c.along(ff)));
    c.run(sec.from + 60, sec.to, -(SET + 14), 130, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 46, 16));
  },

  // The cut: the road runs between two retaining walls, which is WHY this leg
  // has no streetlights — there is nowhere on it for a lamp to stand.
  yard(c, sec) {
    const ax = legAxis(c.path, sec, c.f);
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (PAVE_BACK + 8), 40, (x, z, ff, gy) =>
        D.retainingWall(c.w, ax === 'x' ? x - 20 : x, gy, ax === 'x' ? z : z - 20, 42, ax, 38));
    c.put(sec.from + 250, -(PAVE_BACK + 8), (x, z, ff, gy) =>
      D.signalGantry(c.w, x - 2, gy + 38, z - 2, Math.round((PAVE_BACK + 8) * 2)));
    c.put(sec.from + 120, SET + 34, (x, z, ff, gy) => D.pallets(c.w, x, gy, z, 5));
    c.put(sec.from + 410, -(SET + 38), (x, z, ff, gy) => D.oilDrums(c.w, x, gy, z, 9));
    c.put(sec.from + 460, SET + 30, (x, z, ff, gy) => D.silo(c.w, x, gy, z, 12, 54));
  },

  // Open country on the last bend, so the lap ends somewhere with no walls and
  // then arrives back under the gantry.
  farm(c, sec) {
    c.blit(sec.from + 210, SET + 10, c.pr.barnA);
    c.blit(sec.to - 230, -(SET + 14), c.pr.barnA);
    c.put(sec.from + 340, SET + 38, (x, z, ff, gy) => D.haybales(c.w, x - 30, gy, z - 20, 6, 3));
    c.put(sec.to - 390, -(SET + 34), (x, z, ff, gy) => D.haybales(c.w, x - 30, gy, z - 20, 5, 8));
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (PAVE_BACK + 10), 46, (x, z, ff, gy, s) => {
        if (hash3(Math.round(s), side, 2) > 0.86)
          D.fieldGate(c.w, x - (c.along(ff) === 'x' ? 20 : 0), gy,
            z - (c.along(ff) === 'x' ? 0 : 20), c.along(ff));
        else
          P.hedge(c.w, x - (c.along(ff) === 'x' ? 23 : 5), gy,
            z - (c.along(ff) === 'x' ? 5 : 23), 46, 10, 16, c.along(ff));
      });
    c.run(sec.from + 80, sec.to, SET + 78, 210, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 52, 18));
  },
};

function dress(w, path, anchors, houses) {
  const c = makeCtx(w, path, anchors, houses);
  const { put } = c;

  // Streetlights on the lit sections only. Their absence IS the level design
  // everywhere else: on an unlit stretch the beam is all you have.
  for (const sec of SECTIONS) {
    if (!sec.lit) continue;
    for (let s = sec.from + 110; s < sec.to - 70; s += 240) {
      const side = ((s / 300) | 0) % 2 ? 1 : -1;
      put(s, side * KERBSIDE, (x, z, ff, gy) => {
        anchors.lamps.push(P.streetLamp(w, x, gy, z, 54, -side * 16));
      });
    }
  }

  for (const sec of SECTIONS) DISTRICT[sec.district](c, sec);

  // start/finish gantry
  for (const side of [-1, 1])
    put(30, side * (ROAD_HALF + 4), (x, z, ff, gy) => w.box(x - 2, gy, z - 2, 4, 64, 4, 'metalDark'));
  put(30, 0, (x, z, ff, gy) => {
    w.box(x - ROAD_HALF - 4, gy + 60, z - 3, ROAD_HALF * 2 + 8, 6, 5, 'metalDark');
    w.box(x - ROAD_HALF + 6, gy + 62, z - 4, ROAD_HALF * 2 - 12, 2, 1, 'neonSign');
  });
  for (let u = -ROAD_HALF; u <= ROAD_HALF; u++)
    put(30, u, (x, z, ff, gy) => w.set(x, gy - 3, z, ((u >> 2) % 2) ? 'roadLine' : 'asphaltPatch'));

  // council property, because a street has some
  put(430, PAVE_BACK, (x, z, ff, gy) => S.phoneBox(w, x - 5, gy, z - 5));
  put(900, -(PAVE_BACK - 2), (x, z, ff, gy) => S.busShelter(w, x - 17, gy, z - 7, 1));
  put(4100, PAVE_BACK - 2, (x, z, ff, gy) => S.busShelter(w, x - 17, gy, z - 7, 1));
  for (const [s, side] of [[260, 1], [700, -1], [1150, 1], [3600, 1], [4400, -1], [4900, 1]]) {
    put(s, side * PAVE_BACK, (x, z, ff, gy) => S.bench(w, x - 13, gy, z - 4, 1));
    put(s + 70, side * PAVE_BACK, (x, z, ff, gy) => P.trashBin(w, x, gy, z));
  }
  for (const s of [520, 1240, 3500, 4200, 5400])
    put(s, ROAD_HALF - 3, (x, z, ff, gy) => S.drain(w, x - 4, gy - 3, z - 2));
  for (const [s, side, kind] of [[1380, 1, 'stop'], [2480, -1, 'sign'], [5150, 1, 'sign'], [5790, -1, 'stop']])
    put(s, side * KERBSIDE, (x, z, ff, gy) => S.signPost(w, x, gy, z, kind));

  // zebra crossings, with a belisha beacon each side
  for (const sc of CROSSINGS) {
    for (let ds = -13; ds <= 13; ds++)
      for (let u = -ROAD_HALF + 2; u <= ROAD_HALF - 2; u++)
        if (((u >> 3) % 2 + 2) % 2 === 0) put(sc + ds, u, (x, z, ff, gy) => w.set(x, gy - 3, z, 'roadLine'));
    for (const side of [-1, 1]) {
      put(sc, side * (ROAD_HALF + KERB + 3), (x, z, ff, gy) => {
        w.box(x - 1, gy, z - 1, 3, 48, 3, 'paper');
        for (let k = 4; k < 44; k += 8) w.box(x - 2, gy + k, z - 2, 5, 4, 5, 'metalDark');
        P.ball(w, x, gy + 52, z, 5, 'sodium');
      });
    }
  }
}

// ---------------------------------------------------------------- parked
// Parked cars at the kerb — blitted like the houses, and into the VOXEL world
// rather than as scene objects, so they are solid for free.
function parked(w, path) {
  const proto = new VoxWorld();
  P.wagon(proto, -11, 0, -25);                        // centred, facing +Z
  const f = frame();
  // On the parade and in the crescent, because those are the two legs where
  // somebody lives. Nobody parks on the sweeper.
  const spots = [
    [300, 1], [620, -1], [980, 1], [1120, -1], [1330, 1],
    [2170, -1],
    [3480, 1], [3760, -1], [4060, 1], [4380, -1], [4560, 1],
  ];
  for (const [s, side] of spots) {
    // FULLY off the carriageway. Half on the kerb left the body reaching 5
    // voxels onto the road, and a driver running wide of a skip clipped it and
    // wedged — sixteen crashes a lap, all at two spots. There is a 4.2-metre
    // footway now, so they can sit on it properly, which is what cars do on a
    // street this size anyway.
    path.place(s, side * (ROAD_HALF + 20), f);
    const rot = (alongRot(f.tx, f.tz) + (hash3(Math.round(s), 1, 2) > 0.5 ? 180 : 0)) % 360;
    w.merge(proto, { ox: Math.round(f.x), oz: Math.round(f.z), oy: elev(s), rotY: rot });
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
// Six of the nine are on unlit legs, and one of those is mid-corner on the
// long dark sweeper — which is the hardest thing on the circuit and the only
// place the lighting design and the corner design ask the same question at
// once. Two lit ones exist so the dark ones are a contrast rather than a rule.
export const HAZARDS = [
  { s: 700, u: H(0.62), r: 30, kind: 'works' },        // the parade, lit
  { s: 2060, u: H(-0.30), r: 32, kind: 'skip' },       // mill lane, dark
  { s: 2330, u: H(0.34), r: 30, kind: 'works' },       // mill lane, dark
  { s: 2900, u: H(-0.34), r: 34, kind: 'broken' },     // the long dark, mid-corner
  { s: 3190, u: H(0.30), r: 30, kind: 'works' },       // the long dark, exit
  { s: 4300, u: H(-0.55), r: 32, kind: 'skip' },       // the crescent, lit
  { s: 5430, u: H(0.34), r: 30, kind: 'works' },       // the cut, dark
  { s: 5700, u: H(-0.34), r: 34, kind: 'broken' },     // the cut, dark
  { s: 6150, u: H(0.28), r: 30, kind: 'works' },       // the last bend, dark
];

function hazards(w, path) {
  const f = frame();
  const wagon = new VoxWorld();
  P.wagon(wagon, -11, 0, -25);
  for (const h of HAZARDS) {
    path.place(h.s, h.u, f);
    const x = Math.round(f.x), z = Math.round(f.z);
    const gy = elev(h.s);
    h.x = x; h.z = z;
    const rot = facingRot(f.nx, f.nz, Math.sign(h.u) || 1);
    if (h.kind === 'works') {
      // Sized off the carriageway, and sized to MATTER. At 0.46 of the half
      // width this blocked a quarter of the road, so the driver could clear it
      // with a twitch and the whole see-it-in-time mechanic priced at nothing.
      // At 1.15 it takes most of one side and leaves a gap you have to aim for.
      const span = Math.round(ROAD_HALF * 1.15);
      for (let i = -4; i <= 4; i++)
        S.roadCone(w, x + Math.round(f.nx * i * (span / 8)), -2 + gy, z + Math.round(f.nz * i * (span / 8)));
      // a tapering run of cones leading in, so it reads as roadworks and gives
      // the gap a shape rather than appearing as a wall
      for (let i = 1; i <= 5; i++)
        S.roadCone(w, x + Math.round(f.nx * (span / 2 - i * 9) + f.tx * i * 26), -2 + gy,
          z + Math.round(f.nz * (span / 2 - i * 9) + f.tz * i * 26));
      const bar = new VoxWorld();
      S.barrier(bar, -(span >> 1), -1, -1, span);
      w.merge(bar, { ox: x, oz: z, oy: gy, rotY: rot });
    } else if (h.kind === 'skip') {
      // TWO skips end to end. One is 44 voxels on a 216-voxel road: something
      // you steer round without thinking, which is not a hazard, it is scenery.
      const sk = new VoxWorld();
      S.skip(sk, -22, -1, -10);
      for (const off of [-24, 24])
        w.merge(sk, { ox: x + Math.round(f.nx * off), oz: z + Math.round(f.nz * off), oy: gy, rotY: rot });
      for (let i = 1; i <= 4; i++)
        S.roadCone(w, x + Math.round(f.nx * (48 + i * 4) + f.tx * i * 24), -2 + gy,
          z + Math.round(f.nz * (48 + i * 4) + f.tz * i * 24));
    } else {
      // broken down, so it is pointing where it was going, not at the kerb
      w.merge(wagon, { ox: x, oz: z, oy: gy, rotY: alongRot(f.tx, f.tz) });
      // cones fanning out behind it, which is what you actually put out and
      // which widens the thing you have to avoid to something worth avoiding
      for (let i = -3; i <= 3; i++)
        S.roadCone(w,
          x + Math.round(f.nx * i * 16 + f.tx * 40), -2 + gy,
          z + Math.round(f.nz * i * 16 + f.tz * 40));
      for (let i = 1; i <= 4; i++)
        S.roadCone(w,
          x + Math.round(f.nx * (i * 12) + f.tx * (40 + i * 22)), -2 + gy,
          z + Math.round(f.nz * (i * 12) + f.tz * (40 + i * 22)));
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
    for (const u of [0, -40, 40, -64, 64]) {
      path.place(s, u, f);
      const fl = ground.ceilingAt(f.x, f.z, 2.6);
      // "the carriageway" is now a height RELATIVE to the profile, not <= 0
      const road = elev(s) - 1;
      if (Math.abs(fl - road) <= 3 && !ground.isBlocked(f.x, f.z) && ground.canStand(f.x, f.z, fl, 2.6))
        return { x: f.x, z: f.z, heading: Math.atan2(f.tx, f.tz), s };
    }
  }
  return null;
}

// Where somebody walks OUT IN FRONT OF YOU. Marked on the road, because a
// pedestrian who appears in the carriageway with no warning is not a decision,
// it is a coin toss — the stripes are the tell that says lift here.
// Kept clear of the parking bays: a crosser walking into a parked car baulks
// and turns round in the middle of the road, which looks like a bug.
export const CROSSINGS = [480, 1240, 3620, 4260, 5010];

// Pavement beats for the people who live here. Weighted toward the parade, the
// crescent and the park, because that is where somebody would actually BE at
// this hour — but with one figure walking home past the mill in the dark,
// which is the single most atmospheric person on the circuit.
//
// `pace` sets how fast they walk (a jogger is not a shopper) and `idle` stands
// them still facing the road, which is what waiting for a bus looks like.
export function lifeSpots() {
  const pave = PAVE_MID;
  return [
    { s: 200, u: pave, dir: 1, span: 260 },
    { s: 520, u: -pave, dir: -1, span: 280 },
    { s: 780, u: pave, dir: -1, span: 240 },
    { s: 900, u: -pave, dir: 1, idle: true },            // at the bus shelter
    { s: 935, u: -pave, dir: 1, idle: true },
    { s: 1060, u: -pave, dir: 1, span: 220 },
    { s: 1330, u: pave, dir: 1, span: 200, pace: 46 },   // late for something
    { s: 1660, u: pave, dir: 1, span: 180 },
    { s: 1840, u: -pave, dir: -1, span: 160 },
    { s: 2170, u: -pave, dir: -1, span: 300 },           // mill lane, in the dark
    { s: 3460, u: pave, dir: 1, span: 280 },
    { s: 3780, u: -pave, dir: -1, span: 300 },
    { s: 4080, u: pave, dir: -1, span: 260 },
    { s: 4110, u: pave, dir: 1, idle: true },            // the second shelter
    { s: 4420, u: -pave, dir: 1, span: 240 },
    { s: 4640, u: pave, dir: -1, span: 220, pace: 52 },  // running the park
    { s: 4880, u: -pave, dir: -1, span: 200 },
    { s: 5080, u: pave, dir: 1, span: 180 },
    // The ones who step out in front of you. They cross ACROSS the road at a
    // marked crossing rather than pacing along it, which is the only way a
    // pedestrian is ever actually in your way.
    ...CROSSINGS.map((s, i) => ({ s, u: i % 2 ? pave : -pave, cross: true, pace: 30 + i * 4 })),
  ];
}

// --------------------------------------------------------------- surround
// The land beyond the built plate.
//
// The voxel ribbon stops about 190 voxels either side of the centreline, and
// past that there was NOTHING — so every wide shot had a hard horizontal edge
// with a void under it, and the far houses and trees stood on the end of the
// world with black underneath them. Fog does not help: fog fades things TOWARD
// a colour, and there was no geometry there to fade.
//
// This is two thin meshes rather than more voxels, because it is a shape nobody
// will ever drive on or collide with: an apron sweeping outward from the plate
// edge, and a fill across the middle of the loop. Both follow elev(s), so they
// meet the plate at the right height all the way round, and both sit a voxel
// low so the built ground always wins the depth test.
const OUT_REACH = 1100, OUT_FALL = 34, SUR_STEP = 24;

function surround(path) {
  const f = frame();
  const edge = ROAD_HALF + KERB + PAVE + VERGE + APRON;

  // Which side is the infield? Ask, rather than deriving it from the turn
  // direction — a reversed corner would silently turn the world inside out.
  let cx = 0, cz = 0;
  const n = path.points.length / 2;
  for (let i = 0; i < path.points.length; i += 2) { cx += path.points[i]; cz += path.points[i + 1]; }
  cx /= n; cz /= n;
  path.place(0, edge, f);
  const dPlus = (f.x - cx) ** 2 + (f.z - cz) ** 2;
  path.place(0, -edge, f);
  const inSide = ((f.x - cx) ** 2 + (f.z - cz) ** 2) < dPlus ? -1 : 1;

  const pos = [], idx = [];
  const push = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };

  const steps = Math.ceil(path.total / SUR_STEP);
  const inner = [], outer = [], infield = [];
  for (let i = 0; i < steps; i++) {
    const s = (i / steps) * path.total;
    const gy = GROUND_Y + elev(s) - 1;
    path.place(s, -inSide * edge, f);
    inner.push(push(f.x, gy, f.z));
    path.place(s, -inSide * (edge + OUT_REACH), f);
    outer.push(push(f.x, gy - OUT_FALL, f.z));
    path.place(s, inSide * edge, f);
    infield.push(push(f.x, gy, f.z));
  }
  const mid = push(cx, GROUND_Y + elev(0) - 2, cz);

  for (let i = 0; i < steps; i++) {
    const j = (i + 1) % steps;
    idx.push(inner[i], outer[i], outer[j], inner[i], outer[j], inner[j]);   // the apron
    idx.push(infield[i], mid, infield[j]);                                  // the middle
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({
    color: 0x232a20, roughness: 1, metalness: 0, side: THREE.DoubleSide, flatShading: true,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'surround';
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

// ---------------------------------------------------------------- assemble
export function buildTrack() {
  const t0 = performance.now();
  // Phase timings, because "the build takes twenty seconds" is not actionable
  // and every guess I have made about where voxel time goes has been wrong.
  const marks = [];
  let last = t0;
  const mark = (name) => { const n = performance.now(); marks.push([name, Math.round(n - last)]); last = n; };

  const path = buildPath();
  const w = new VoxWorld();
  const anchors = { lamps: [] };
  const protos = prototypes();
  mark('prototypes');
  ribbon(w, path);
  mark('ribbon');
  dress(w, path, anchors, protos);
  mark('districts');
  parked(w, path);
  hazards(w, path);
  mark('props');

  const group = new THREE.Group();
  group.name = 'track';
  // solidBelow gives contact AO at the LOWEST point the ground reaches;
  // noFloorBelow only culls undersides down there too, so a raised stretch
  // keeps its underside and reads as an embankment instead of a hole to the sky.
  group.add(surround(path));
  mark('surround');
  group.add(meshChunks(w, PALETTE, {
    name: 'track', size: 192,
    solidBelow: ELEV_MIN - 2, noFloorBelow: ELEV_MIN + GROUND_Y - 1,
  }));

  mark('mesh');

  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (let i = 0; i < path.points.length; i += 2) {
    bx0 = Math.min(bx0, path.points[i]); bx1 = Math.max(bx1, path.points[i]);
    bz0 = Math.min(bz0, path.points[i + 1]); bz1 = Math.max(bz1, path.points[i + 1]);
  }
  const pad = ROAD_HALF + KERB + PAVE + VERGE + APRON + 100;
  const field = w.walkField(
    Math.floor(bx0 - pad), Math.ceil(bx1 + pad),
    // FLOOR_MAX is relative to the ground in each column now, so the profile
    // does not enter into it. See walkField().
    Math.floor(bz0 - pad), Math.ceil(bz1 + pad), FLOOR_MAX, HEAD);
  const ground0 = new Ground(field);
  mark('walkField');

  // IS THE ROAD ACTUALLY CLEAR?
  //
  // Every district places things by an offset from SET, and SET is derived from
  // ROAD_HALF. Move either and a hedge run that used to sit behind the pavement
  // is suddenly standing in the carriageway — which is exactly what happened
  // when the road went to 192 and the frontages came in to meet it. You do not
  // find that by looking at the code, you find it by driving into a hedge.
  //
  // So march the whole lap and ask the collision field. Anything solid inside
  // the painted road is a bug, every time, with no exceptions to argue about.
  // Ask two questions, not one. "Is it blocked?" missed a tree canopy that had
  // been promoted to floor 46 voxels above the tarmac: not blocked, not
  // drivable, and completely invisible to the old check. The second question —
  // "is the floor here actually the ROAD?" — is the one that catches it, and it
  // is the question that matters, because anything the car cannot step onto is
  // a wall whatever the field chooses to call it.
  const blockers = [];
  const probe = frame();
  for (let s = 0; s < path.total; s += 12) {
    const road = elev(s) - 1;
    for (let u = -(ROAD_HALF - 10); u <= ROAD_HALF - 10; u += 8) {
      path.place(s, u, probe);
      const fl = ground0.ceilingAt(probe.x, probe.z);
      if (ground0.isBlocked(probe.x, probe.z) || Math.abs(fl - road) > STEP_UP) {
        blockers.push([Math.round(s), Math.round(u), fl - road]);
        break;
      }
    }
  }
  if (blockers.length) {
    const hz = new Set(HAZARDS.map(h => Math.round(h.s / 12) * 12));
    const rogue = blockers.filter(([s]) => ![...hz].some(h => Math.abs(h - s) < 60));
    if (rogue.length) {
      console.error('track: ' + rogue.length + ' points of the carriageway are not drivable, '
        + 'starting at s=' + rogue[0][0] + ' u=' + rogue[0][1]
        + ' (floor is ' + rogue[0][2] + ' voxels off the road, in ' + sectionAt(rogue[0][0]).district + ')');
    }
  }

  // The steepest thing on the lap, reported rather than assumed. A profile edit
  // that puts a 25% ramp in the road is a wall the car cannot climb, and it
  // would present as "the lap is slower now" rather than as a hill.
  // Measured over 40 voxels, not 4. elev() returns whole voxels, so a short
  // baseline reads a 1-voxel step as a 25% ramp and every real gradient as
  // either zero or absurd — the quantisation, not the hill.
  let worst = 0, worstS = 0;
  for (let s = 0; s < path.total; s += 8) {
    const g = Math.abs(elev(s + 40) - elev(s)) / 40;
    if (g > worst) { worst = g; worstS = s; }
  }
  if (worst > 0.16) {
    console.error('track: ' + Math.round(worst * 100) + '% grade at s=' + Math.round(worstS)
      + ' (' + sectionAt(worstS).district + ') - too steep to drive');
  }

  mark('audits');
  const start = frame();
  path.at(80, start);

  return {
    group, path, field, anchors, hazards: HAZARDS, elev, grade: +worst.toFixed(3),
    chunks: group.children.filter(c => c.name === 'track:chunks').reduce((n, g) => n + g.children.length, 0),
    start: { x: start.x, z: start.z, heading: Math.atan2(start.tx, start.tz) },
    voxels: w.size,
    buildMs: Math.round(performance.now() - t0),
    phases: marks,
    lapLength: path.total,
  };
}
