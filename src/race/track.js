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
import { FLOOR_MAX, HEAD, Ground } from '../walk.js';
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
export const ROAD_HALF = 96;
const KERB = 5;
const VERGE = 22;
// Trimmed with the widening: the districts now fill this band, and the ribbon
// is the single biggest voxel cost on the circuit.
const APRON = 8;
export const GROUND_Y = 2;

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
        // Four lanes wants three sets of markings, not one: a 15-metre road
        // with a single stripe down it reads as an airstrip.
        if (a > half / 2 - 2 && a < half / 2 + 1 && (s % 96) < 52) c = 'roadLine';
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
        if ((x + z) % 4) continue;
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
const SET = ROAD_HALF + KERB + 16;

function makeCtx(w, path, anchors, houses) {
  const f = frame();
  const pr = makeProtos();
  const put = (s, u, fn) => { path.place(s, u, f); fn(Math.round(f.x), Math.round(f.z), f); };
  const blit = (s, u, proto, extraRot = 0) => {
    path.place(s, u, f);
    const rot = (facingRot(f.nx, f.nz, Math.sign(u) || 1) + extraRot) % 360;
    w.merge(proto.w, { ox: Math.round(f.x), oz: Math.round(f.z), mirrorZ: proto.mirrorZ, rotY: rot });
  };
  // Something laid down ALONG the road: hedges, fences, walls. It gets the
  // frame so it can work out which way it is running at that point, because on
  // an arc that answer changes every few voxels.
  const run = (from, to, u, step, fn) => {
    for (let s = from; s < to; s += step) put(s, u, (x, z, ff) => fn(x, z, ff, s));
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
    c.put(mid - 150, SET + 20, (x, z) => D.gravestones(c.w, x - 60, GROUND_Y, z - 60, 120, 120, 5));
    c.put(mid + 160, SET + 20, (x, z) => D.gravestones(c.w, x - 50, GROUND_Y, z - 50, 100, 100, 9));
    c.run(sec.from, sec.to, SET, 46, (x, z, ff) =>
      P.hedge(c.w, x - (c.along(ff) === 'x' ? 24 : 5), GROUND_Y,
        z - (c.along(ff) === 'x' ? 5 : 24), 48, 10, 20, c.along(ff)));
    // the opposite side stays open, so the spire has sky behind it
    c.run(sec.from, sec.to, -(SET + 40), 150, (x, z) => P.tree(c.w, x, GROUND_Y, z, 44, 15));
  },

  // Unlit, and the biggest single mass on the circuit. Going past a mill in the
  // dark is most of what this stretch has.
  mill(c, sec) {
    const ax = legAxis(c.path, sec, c.f);
    c.blit(sec.from + 320, SET - 4, c.pr.mill);
    for (const [ds, r, h] of [[70, 15, 76], [112, 15, 76], [152, 13, 62]])
      c.put(sec.from + ds, SET + 30, (x, z) => D.silo(c.w, x, GROUND_Y, z, r, h));
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * SET, 40, (x, z) =>
        D.chainFence(c.w, ax === 'x' ? x - 20 : x, GROUND_Y, ax === 'x' ? z : z - 20, 42, ax));
    c.put(sec.from + 470, -(SET + 20), (x, z) => D.pallets(c.w, x, GROUND_Y, z, 4));
    c.put(sec.from + 250, -(SET + 26), (x, z) => D.oilDrums(c.w, x, GROUND_Y, z, 7));
    c.put(sec.from + 545, SET + 12, (x, z) => S.skip(c.w, x - 22, GROUND_Y, z - 10));
  },

  // The unlit sweeper. No buildings at all: whatever the headlights find, which
  // here is trunks going past and nothing behind them.
  wood(c, sec) {
    for (const side of [-1, 1]) {
      c.run(sec.from, sec.to, side * (SET + 16), 128, (x, z, ff, s) =>
        D.copse(c.w, x, GROUND_Y, z, 116, Math.round(s)));
      c.run(sec.from, sec.to, side * (ROAD_HALF + KERB + 14), 54, (x, z, ff) =>
        P.hedge(c.w, x - (c.along(ff) === 'x' ? 28 : 5), GROUND_Y,
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
            ox: Math.round(c.f.x), oz: Math.round(c.f.z),
            rotY: facingRot(c.f.nx, c.f.nz, side),
          });
          c.put(s, side * (ROAD_HALF + KERB + 9), (x, z, ff) =>
            P.hedge(c.w, x - (c.along(ff) === 'x' ? 26 : 4), GROUND_Y,
              z - (c.along(ff) === 'x' ? 4 : 26), 52, 8, 9 + Math.round(r * 3), c.along(ff)));
          if (r > 0.6) c.put(s + 44, side * (ROAD_HALF + KERB + 13),
            (x, z) => c.w.stamp(P.MAILBOX, x, GROUND_Y, z));
        } else {
          c.put(s, side * (ROAD_HALF + KERB + 22), (x, z) => P.tree(c.w, x, GROUND_Y, z, 42, 15));
        }
      }
    }
  },

  // Allotments, a playing field and a shelter. Lit, and the one district with
  // no walls in it at all — after the crescent the eye wants the space.
  park(c, sec) {
    const mid = (sec.from + sec.to) / 2;
    c.put(sec.from + 130, SET + 46, (x, z) => D.goalposts(c.w, x - 28, GROUND_Y, z));
    c.put(sec.to - 160, SET + 46, (x, z) => D.goalposts(c.w, x - 28, GROUND_Y, z));
    c.blit(mid, SET + 8, c.pr.shed);
    c.blit(mid + 180, SET + 8, c.pr.glass);
    c.put(mid - 190, -(SET + 34), (x, z) => D.allotment(c.w, x - 70, GROUND_Y, z - 50, 140, 100, 4));
    c.put(mid + 110, -(SET + 34), (x, z) => D.allotment(c.w, x - 70, GROUND_Y, z - 50, 140, 100, 12));
    c.run(sec.from, sec.to, SET, 52, (x, z, ff) =>
      P.picketFence(c.w, x - (c.along(ff) === 'x' ? 26 : 0), GROUND_Y,
        z - (c.along(ff) === 'x' ? 0 : 26), 52, c.along(ff)));
    c.run(sec.from + 60, sec.to, -(SET + 14), 130, (x, z) => P.tree(c.w, x, GROUND_Y, z, 46, 16));
  },

  // The cut: the road runs between two retaining walls, which is WHY this leg
  // has no streetlights — there is nowhere on it for a lamp to stand.
  yard(c, sec) {
    const ax = legAxis(c.path, sec, c.f);
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (ROAD_HALF + KERB + 12), 40, (x, z) =>
        D.retainingWall(c.w, ax === 'x' ? x - 20 : x, GROUND_Y, ax === 'x' ? z : z - 20, 42, ax, 38));
    c.put(sec.from + 250, -(ROAD_HALF + KERB + 20), (x, z) =>
      D.signalGantry(c.w, x - 2, GROUND_Y + 38, z - 2, Math.round((ROAD_HALF + KERB + 20) * 2)));
    c.put(sec.from + 120, SET + 34, (x, z) => D.pallets(c.w, x, GROUND_Y, z, 5));
    c.put(sec.from + 410, -(SET + 38), (x, z) => D.oilDrums(c.w, x, GROUND_Y, z, 9));
    c.put(sec.from + 460, SET + 30, (x, z) => D.silo(c.w, x, GROUND_Y, z, 12, 54));
  },

  // Open country on the last bend, so the lap ends somewhere with no walls and
  // then arrives back under the gantry.
  farm(c, sec) {
    c.blit(sec.from + 210, SET + 10, c.pr.barnA);
    c.blit(sec.to - 230, -(SET + 14), c.pr.barnA);
    c.put(sec.from + 340, SET + 38, (x, z) => D.haybales(c.w, x - 30, GROUND_Y, z - 20, 6, 3));
    c.put(sec.to - 390, -(SET + 34), (x, z) => D.haybales(c.w, x - 30, GROUND_Y, z - 20, 5, 8));
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (ROAD_HALF + KERB + 16), 46, (x, z, ff, s) => {
        if (hash3(Math.round(s), side, 2) > 0.86)
          D.fieldGate(c.w, x - (c.along(ff) === 'x' ? 20 : 0), GROUND_Y,
            z - (c.along(ff) === 'x' ? 0 : 20), c.along(ff));
        else
          P.hedge(c.w, x - (c.along(ff) === 'x' ? 23 : 5), GROUND_Y,
            z - (c.along(ff) === 'x' ? 5 : 23), 46, 10, 16, c.along(ff));
      });
    c.run(sec.from + 80, sec.to, SET + 78, 210, (x, z) => P.tree(c.w, x, GROUND_Y, z, 52, 18));
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
      put(s, side * (ROAD_HALF + KERB + 10), (x, z) => {
        anchors.lamps.push(P.streetLamp(w, x, GROUND_Y, z, 54, -side * 16));
      });
    }
  }

  for (const sec of SECTIONS) DISTRICT[sec.district](c, sec);

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
  put(900, -(ROAD_HALF + KERB + 16), (x, z) => S.busShelter(w, x - 17, GROUND_Y, z - 7, 1));
  put(4100, ROAD_HALF + KERB + 16, (x, z) => S.busShelter(w, x - 17, GROUND_Y, z - 7, 1));
  for (const [s, side] of [[260, 1], [700, -1], [1150, 1], [3600, 1], [4400, -1], [4900, 1]]) {
    put(s, side * (ROAD_HALF + KERB + 12), (x, z) => S.bench(w, x - 13, GROUND_Y, z - 4, 1));
    put(s + 70, side * (ROAD_HALF + KERB + 12), (x, z) => P.trashBin(w, x, GROUND_Y, z));
  }
  for (const s of [520, 1240, 3500, 4200, 5400])
    put(s, ROAD_HALF - 3, (x, z) => S.drain(w, x - 4, -1, z - 2));
  for (const [s, side, kind] of [[1380, 1, 'stop'], [2480, -1, 'sign'], [5150, 1, 'sign'], [5790, -1, 'stop']])
    put(s, side * (ROAD_HALF + KERB + 8), (x, z) => S.signPost(w, x, GROUND_Y, z, kind));

  // zebra crossings, with a belisha beacon each side
  for (const sc of CROSSINGS) {
    for (let ds = -13; ds <= 13; ds++)
      for (let u = -ROAD_HALF + 2; u <= ROAD_HALF - 2; u++)
        if (((u >> 3) % 2 + 2) % 2 === 0) put(sc + ds, u, (x, z) => w.set(x, -1, z, 'roadLine'));
    for (const side of [-1, 1]) {
      put(sc, side * (ROAD_HALF + KERB + 4), (x, z) => {
        w.box(x - 1, GROUND_Y, z - 1, 3, 48, 3, 'paper');
        for (let k = 4; k < 44; k += 8) w.box(x - 2, GROUND_Y + k, z - 2, 5, 4, 5, 'metalDark');
        P.ball(w, x, GROUND_Y + 52, z, 5, 'sodium');
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
// Six of the nine are on unlit legs, and one of those is mid-corner on the
// long dark sweeper — which is the hardest thing on the circuit and the only
// place the lighting design and the corner design ask the same question at
// once. Two lit ones exist so the dark ones are a contrast rather than a rule.
export const HAZARDS = [
  { s: 700, u: H(0.55), r: 30, kind: 'works' },        // the parade, lit
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
    h.x = x; h.z = z;
    const rot = facingRot(f.nx, f.nz, Math.sign(h.u) || 1);
    if (h.kind === 'works') {
      // Sized off the carriageway. A fixed 28-voxel barrier on a 192-voxel road
      // is a traffic cone, and you drive past it without lifting.
      const span = Math.round(ROAD_HALF * 0.46);
      for (let i = -3; i <= 3; i++)
        S.roadCone(w, x + Math.round(f.nx * i * (span / 3)), -2, z + Math.round(f.nz * i * (span / 3)));
      const bar = new VoxWorld();
      S.barrier(bar, -(span >> 1), -1, -1, span);
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
    for (const u of [0, -40, 40, -64, 64]) {
      path.place(s, u, f);
      const fl = ground.ceilingAt(f.x, f.z, 2.6);
      if (fl <= 0 && !ground.isBlocked(f.x, f.z) && ground.canStand(f.x, f.z, fl, 2.6))
        return { x: f.x, z: f.z, heading: Math.atan2(f.tx, f.tz), s };
    }
  }
  return null;
}

// Where somebody walks OUT IN FRONT OF YOU. Marked on the road, because a
// pedestrian who appears in the carriageway with no warning is not a decision,
// it is a coin toss — the stripes are the tell that says lift here.
export const CROSSINGS = [620, 1180, 3700, 4500, 5010];

// Pavement beats for the people who live here. Weighted toward the parade, the
// crescent and the park, because that is where somebody would actually BE at
// this hour — but with one figure walking home past the mill in the dark,
// which is the single most atmospheric person on the circuit.
//
// `pace` sets how fast they walk (a jogger is not a shopper) and `idle` stands
// them still facing the road, which is what waiting for a bus looks like.
export function lifeSpots() {
  const pave = ROAD_HALF + KERB + 9;
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
  const ground0 = new Ground(field);

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
  const blockers = [];
  const probe = frame();
  for (let s = 0; s < path.total; s += 12) {
    for (let u = -(ROAD_HALF - 6); u <= ROAD_HALF - 6; u += 8) {
      path.place(s, u, probe);
      if (ground0.isBlocked(probe.x, probe.z)) { blockers.push([Math.round(s), Math.round(u)]); break; }
    }
  }
  if (blockers.length) {
    const hz = new Set(HAZARDS.map(h => Math.round(h.s / 12) * 12));
    const rogue = blockers.filter(([s]) => ![...hz].some(h => Math.abs(h - s) < 60));
    if (rogue.length) {
      console.error('track: ' + rogue.length + ' points of the carriageway are blocked by something '
        + 'that is not a hazard, starting at s=' + rogue[0][0] + ' u=' + rogue[0][1]
        + ' (' + sectionAt(rogue[0][0]).district + ')');
    }
  }

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
