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
import { resolve } from './shape.js';
import * as D from './district.js';
import * as D2 from './district2.js';

// 192 voxels, 15.4m. It has been 88 (a residential street, too tight to race
// on) and 128 (two lanes, still one line through a skip). At 192 there are four
// lanes and a real choice of line, which is what a hazard needs to be a
// decision rather than a wall with a gap in it.
//
// Everything else about the cross-section derives from this — kerbs, verges,
// pavements, frontages, lamps, the start gantry, the hazard lanes and the
// sim's dodge target all move with it. That is deliberate: this number has now
// changed three times and each change has to stay a one-line change.
// THE CROSS-SECTION IS PER TRACK NOW.
//
// These are `let`, and ES module bindings are live, so every consumer that
// imports ROAD_HALF sees whatever the track currently being played set it to
// without a single import changing. That is a deliberate trade: it is module
// state, which means exactly ONE track can be loaded at a time — true, since
// each page builds one — in exchange for not threading a width parameter
// through forty call sites in this file and four others.
//
// The Old Town needs 60 where the Parade needs 108, and that is the whole
// reason any of this moved.
export let ROAD_HALF = 108;
let KERB = 5;
export let PAVE = 52;
let VERGE = 14;
let APRON = 6;

// The three lines everything on the footway is placed against.
export let KERBSIDE = 0, PAVE_MID = 0, PAVE_BACK = 0, SET = 0;
export const GROUND_Y = 2;

function setRoad(r) {
  ROAD_HALF = r.half; KERB = r.kerb; PAVE = r.pave; VERGE = r.verge; APRON = r.apron;
  KERBSIDE = ROAD_HALF + KERB + 8;          // lamps, signs, beacons
  PAVE_MID = ROAD_HALF + KERB + PAVE / 2;   // where people walk
  PAVE_BACK = ROAD_HALF + KERB + PAVE - 6;  // benches, boxes, hedges
  SET = ROAD_HALF + KERB + PAVE + 6;        // where a frontage starts
}

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
let PROFILE = [[0, 0]];

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
export let ELEV_MIN = 0, ELEV_MAX = 0;
function setProfile(prof) {
  PROFILE = prof;
  ELEV_MIN = prof.reduce((m, q) => Math.min(m, q[1]), 0);
  ELEV_MAX = prof.reduce((m, q) => Math.max(m, q[1]), 0);
}

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
let LEGS = [];
export let SECTIONS = [];
export let LAP = 0;
let OPS = [];

// Legs come from the track's own shape now: a list of straights and arcs, two
// of the straights left free for solveClosure() to fill in. The hand-derived
// rectangle algebra is gone — see shape.js for why it had to be.
function setShape(spec) {
  OPS = resolve(spec.shape);
  LEGS = OPS.map((op, i) => ({ ...spec.legs[i], len: op.len }));
  let at = 0;
  SECTIONS = LEGS.map(l => { const sec = { ...l, from: at, to: at + l.len }; at += l.len; return sec; });
  LAP = SECTIONS[SECTIONS.length - 1].to;
}

export const isLit = (s) => {
  const sec = SECTIONS.find(x => s >= x.from && s < x.to);
  return sec ? sec.lit : true;
};
export const sectionAt = (s) => SECTIONS.find(x => s >= x.from && s < x.to) || SECTIONS[0];

export function buildPath(spec) {
  const p = new Path(0, 0, spec.heading === undefined ? 180 : spec.heading);
  for (const op of OPS) {
    if (op.straight !== undefined) p.straight(op.straight);
    else p.arc(op.arc, op.r);
  }
  const built = p.build();
  // A loop that does not quite close leaves a step in the road you only find by
  // driving into it, so say so here instead.
  const n = built.points.length;
  const gap = Math.hypot(built.points[0] - built.points[n - 2], built.points[1] - built.points[n - 1]);
  if (gap > 8) console.error('track "' + spec.id + '": the loop is ' + Math.round(gap) + ' voxels from closing');
  return built;
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
    // A DIAGONAL straight needs over-covering just as much as an arc does.
    //
    // Stepping s by 1 and u by 1 lays down a unit lattice, and a unit lattice
    // ROTATED by anything other than a quarter turn does not land on the integer
    // grid — at 45 degrees it misses about a third of the cells. The Parade
    // never showed it because all four of its straights are axis-aligned; the
    // ring road runs at sixty degrees and its carriageway came out full of
    // pinholes, which the collision field reported as the tunnel ceiling being
    // the floor. Both steps go to 0.7, which is 1/sqrt(2) and covers any angle.
    const aligned = Math.abs(f.tx) < 0.02 || Math.abs(f.tz) < 0.02;
    const stepS = turning ? 0.55 : (aligned ? 1 : 0.6);
    const stepU = aligned && !turning ? 1 : 0.7;
    const lit = isLit(s);
    // The whole cross-section rises and falls together. Where the height
    // changes we also write the voxel BELOW, which turns what would be a
    // one-voxel-thick sheet with a diagonal gap in it into a proper staircase:
    // 80cm treads, 8cm risers, watertight, and under the car's 4-voxel step-up.
    const gy = elev(s);
    const riser = gy !== gyPrev ? Math.min(gy, gyPrev) : null;
    for (let u = -edge; u <= edge; u += stepU) {
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
    // TWO units, not four. blit() orients a prototype with facingRot(), which
    // snaps to a quarter turn -- exact on the Parade, where every leg is
    // axis-aligned, and up to 45 degrees out on a bend. A 152-voxel building
    // that far off square swings its corners 54 voxels, which on a 120-voxel
    // road is a building standing in the carriageway. Short blocks swing less.
    stoneA: protoOf(D2.stoneRow, 76, 44, true, [2, 5]),
    stoneB: protoOf(D2.stoneRow, 76, 44, true, [2, 23]),
    mews: protoOf(D2.mewsYard, 64, 52, true, [7]),
    // 110 not 150: a long prototype on a leg that is 45 degrees off a quarter
    // turn swings its corners half its length, and a dock road runs at 135.
    shed: protoOf(D2.shed, 110, 84, true, [110, 84]),
    services: protoOf(D2.services, 240, 74, true),
    island: protoOf(D2.shipIsland, 46, 40, true),
  };
}

// Which world axis a straight leg runs along, asked of its own tangent rather
// than hardcoded, so changing a radius cannot silently rotate a district.
function legAxis(path, sec, f) {
  path.at((sec.from + sec.to) / 2, f);
  return Math.abs(f.tz) > Math.abs(f.tx) ? 'z' : 'x';
}

// SET is set by setRoad(), with the rest of the cross-section.

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
  // Step ALONG the track from a placement point. district builders that offset
  // in world x or z are assuming the leg is axis-aligned, which is true of the
  // Parade's straights and false of every corner in the Old Town -- so props
  // ended up strewn across the carriageway on a bend.
  const back = (ff, x, z, d) => [Math.round(x - ff.tx * d), Math.round(z - ff.tz * d)];
  return { w, path, anchors, houses, pr, f, put, blit, run, along, back };
}

// A short street running away from the main road, closed at the far end.
function sideStreet(c, s, side) {
  const HALF = 26, REACH = 240;
  const f = frame();
  for (let u = ROAD_HALF + KERB; u <= ROAD_HALF + KERB + REACH; u += 1) {
    c.path.place(s, side * u, f);
    const gy = GROUND_Y + elev(s);
    for (let a = -HALF; a <= HALF; a++) {
      const x = Math.round(f.x + f.tx * a), z = Math.round(f.z + f.tz * a);
      const kerb = Math.abs(a) > HALF - 3;
      c.w.set(x, kerb ? gy : gy - 1, z, kerb ? 'curb' : (hash3(x, 0, z) > 0.88 ? 'asphaltWorn' : 'asphalt'));
      if (!kerb && Math.abs(a) < 2 && (u % 40) < 22) c.w.set(x, gy - 1, z, 'roadLine');
    }
  }
  // the shopfront that closes it, and a lamp halfway down
  c.blit(s, side * (ROAD_HALF + KERB + REACH + 30), c.pr.terrace, 0);
  c.path.place(s, side * (ROAD_HALF + KERB + 110), f);
  const gy = GROUND_Y + elev(s);
  c.anchors.lamps.push(P.streetLamp(c.w,
    Math.round(f.x + f.tx * (HALF + 5)), gy, Math.round(f.z + f.tz * (HALF + 5)), 50, -14));
}

// Anything that spans the road is built in TRACK coordinates.
//
// The first version marched these along a world axis picked by legAxis(), which
// is a quarter-turn approximation. On the Parade every leg is axis-aligned so
// it was exact; on a dock road running at sixty degrees a 266-voxel gantry
// swings ninety voxels and walks diagonally across the carriageway. Seventy-two
// crashes in a lap, all at one gantry.
// HIGH ENOUGH TO LOOK UNDER.
//
// The beam sat 62 voxels up and a gantry crossed every approach as a solid
// black bar at eye level -- a letterbox with the road above it and below it.
// Nothing was wrong with the geometry; it was built for a driver who does not
// exist. The first fix put it at 84, which is EXACTLY the chase camera height
// (CAM.up) and therefore still dead level with the eye. What matters is not
// clearance, it is which SIDE of the beam the camera is on: above it and you
// look down at its top for ever, below it and it passes overhead the way a
// sign gantry is supposed to. 112 is the same clearance the market hall uses,
// so the whole town has one overhead height.
const GANTRY_H = 112;

function gantryOver(c, s, half, lift, signal) {
  for (const side of [-1, 1])
    c.put(s, side * half, (x, z, ff, gy) => c.w.box(x - 2, gy + lift, z - 2, 5, GANTRY_H, 5, 'metalDark'));
  for (let u = -half; u <= half; u++)
    c.put(s, u, (x, z, ff, gy) => {
      c.w.box(x - 1, gy + lift + GANTRY_H, z - 1, 3, 5, 3, 'metalDark');
      if (signal) {
        if (Math.abs(u) % 20 < 3) c.w.box(x - 1, gy + lift + GANTRY_H - 8, z - 1, 3, 9, 3, 'metalDark');
        if (Math.abs(u - half * 0.5) < 3) c.w.set(x, gy + lift + GANTRY_H - 4, z, 'signRed');
        if (Math.abs(u + half * 0.5) < 3) c.w.set(x, gy + lift + GANTRY_H - 4, z, 'winWarmDim');
      } else if (Math.abs(u) < half * 0.5) {
        c.w.box(x, gy + lift + GANTRY_H - 22, z, 1, 20, 2, 'signGreen');
        if (Math.abs(u) % 9 < 4) c.w.box(x, gy + lift + GANTRY_H - 16, z, 1, 3, 3, 'signWhite');
      }
    });
}

// -------------------------------------------------------------- districts
const DISTRICT = {
  // The high street. Shopfronts at pavement level with flats over them, in a
  // continuous run — the party walls are the whole difference between a high
  // street and a row of detached boxes.
  parade(c, sec) {
    for (const side of [-1, 1]) {
      // A gap every third block. It used to be just absence, which reads as a
      // missing tooth; now the gap is a SIDE STREET -- a strip of tarmac
      // running back between the terraces with a lit shopfront closing the
      // end of it. Costs almost nothing and gives the parade depth, because
      // you can see down it as you go past.
      for (let s = sec.from + 150, i = 0; s < sec.to - 170; s += 196, i++) {
        if (i % 3 === 2) { sideStreet(c, s, side); continue; }
        c.blit(s, side * SET, i % 2 ? c.pr.terraceB : c.pr.terrace);
        c.put(s + 40, side * (SET + 30), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 86, z]));
        c.put(s + 92, side * (SET - 2), (x, z, ff, gy) => c.anchors.tvs.push([x, gy + 40, z]));
      }
    }
  },

  // The landmark. A spire is the only thing on this circuit you can see from
  // the far side of it, which is what a landmark is for.
  chapel(c, sec) {
    const mid = (sec.from + sec.to) / 2;
    c.blit(mid, SET + 6, c.pr.chapel);
    c.put(mid - 150, SET + 76, (x, z, ff, gy) => D.gravestones(c.w, x - 60, gy, z - 60, 120, 120, 5));
    c.put(mid + 160, SET + 66, (x, z, ff, gy) => D.gravestones(c.w, x - 50, gy, z - 50, 100, 100, 9));
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
    // the stack, so something is coming out of it
    c.put(sec.from + 320, SET + 62, (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 158, z]));
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
          // one house in three has its fire lit and its television on
          if (r > 0.72) c.put(s, side * (SET + 34), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 74, z]));
          if (r > 0.4) c.put(s + 20, side * (SET - 4), (x, z, ff, gy) => c.anchors.tvs.push([x, gy + 22, z]));
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
    gantryOver(c, sec.from + 250, PAVE_BACK + 8, 38, true);
    c.put(sec.from + 120, SET + 34, (x, z, ff, gy) => D.pallets(c.w, x, gy, z, 5));
    c.put(sec.from + 410, -(SET + 38), (x, z, ff, gy) => D.oilDrums(c.w, x, gy, z, 9));
    c.put(sec.from + 460, SET + 30, (x, z, ff, gy) => D.silo(c.w, x, gy, z, 12, 54));
  },

  // ---------------------------------------------------------- THE OLD TOWN
  // Buildings right out to the kerb. On a 120-voxel road that frontage is most
  // of what you can see, which is the entire point of the place.
  stone(c, sec) {
    for (const side of [-1, 1])
      for (let s = sec.from + 60, i = 0; s < sec.to - 80; s += 88, i++) {
        c.blit(s, side * (SET + 26), i % 2 ? c.pr.stoneB : c.pr.stoneA);
        if (i % 2) c.put(s, side * (SET + 42), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 78, z]));
        c.put(s + 22, side * (SET + 12), (x, z, ff, gy) => c.anchors.tvs.push([x, gy + 38, z]));
      }
  },

  market(c, sec) {
    c.blit(sec.from + 120, SET + 26, c.pr.stoneA);
    c.blit(sec.to - 200, -(SET + 26), c.pr.stoneB);
    for (const side of [-1, 1])
      c.run(sec.from + 40, sec.to - 40, side * (PAVE_BACK + 16), 96, (x, z, ff, gy) => {
        const [sx, sz] = c.back(ff, x, z, 45);
        D2.marketStalls(c.w, sx, gy, sz, 3, Math.round(x));
      });
    c.run(sec.from, sec.to, SET + 60, 190, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 34, 12));
  },

  // A wall the road goes THROUGH, rather than one that runs beside it.
  wall(c, sec) {
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (PAVE_BACK + 6), 40, (x, z, ff, gy) => {
        const a = c.along(ff);
        const [wx, wz] = c.back(ff, x, z, 20);
        D2.townWall(c.w, wx, gy, wz, 42, a, 46);
      });
    c.blit(sec.from + 150, SET + 52, c.pr.stoneA);
    c.blit(sec.to - 180, -(SET + 52), c.pr.stoneB);
  },

  mews(c, sec) {
    for (const side of [-1, 1])
      for (let s = sec.from + 90, i = 0; s < sec.to - 90; s += 96, i++) {
        c.blit(s, side * (SET + 30), i % 3 === 1 ? c.pr.mews : (i % 2 ? c.pr.stoneB : c.pr.stoneA));
        if (i % 2 === 0) c.put(s, side * (SET + 46), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 78, z]));
        c.put(s + 26, side * (SET + 16), (x, z, ff, gy) => c.anchors.tvs.push([x, gy + 38, z]));
      }
  },

  // ============================================================= THE DOCKS
  quay(c, sec) {
    for (let i = 0; i < 4; i++)
      c.put(sec.from + 140 + i * 210, SET + 70, (x, z, ff, gy) =>
        D2.crane(c.w, x, gy, z, 120 + (i % 2) * 24, 130));
    c.run(sec.from, sec.to, SET - 4, 60, (x, z, ff, gy) => {
      const [bx, bz] = c.back(ff, x, z, 30);
      D2.bollards(c.w, bx, gy, bz, 60, c.along(ff));
    });
    c.run(sec.from, sec.to, -(SET + 90), 220, (x, z, ff, gy, s) => {
      const [bx, bz] = c.back(ff, x, z, 60);
      D2.containers(c.w, bx, gy, bz, 2, 2, 3, Math.round(s));
    });
  },

  containers(c, sec) {
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (SET + 100), 200, (x, z, ff, gy, s) => {
        const [bx, bz] = c.back(ff, x, z, 60);
        D2.containers(c.w, bx, gy, bz, 2, 3, 4, Math.round(s) + (side > 0 ? 0 : 91));
      });
    c.put(sec.from + 240, SET + 210, (x, z, ff, gy) => D2.crane(c.w, x, gy, z, 132, 120));
  },

  sheds(c, sec) {
    for (let s = sec.from + 140, i = 0; s < sec.to - 160; s += 200, i++) {
      const side = i % 2 ? 1 : -1;
      c.blit(s, side * (SET + 46), c.pr.shed);
      c.put(s + 30, side * (SET + 40), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 62, z]));
    }
    c.run(sec.from, sec.to, SET + 190, 240, (x, z, ff, gy, s) => {
      const [bx, bz] = c.back(ff, x, z, 30);
      D2.containers(c.w, bx, gy, bz, 1, 2, 3, Math.round(s));
    });
  },

  // ------------------------------------------- SET PIECE: the container ship
  // The road runs up a ro-ro ramp, the length of a moored ship between its own
  // cargo, and off the far end. The deck is a corridor with a drop either side
  // and nothing else on the lap looks remotely like it.
  ship(c, sec) {
    // EVERY PART OF THIS IS BUILT IN (s, u).
    //
    // The first version used the district2 builders, which march along a world
    // axis chosen by a quarter turn. This leg runs at sixty degrees, so the
    // hull and the container stacks came out rotated thirty degrees off the
    // road and swung their corners into the carriageway. Same lesson as the
    // signal gantry and the tunnel bore: anything that spans the road follows
    // the ROAD, not the world.
    //
    // gy is GROUND level, three above the tarmac, so every height here is
    // referred to the road or the hull ends up on top of it.
    const half = ROAD_HALF + 58;          // the ship's side
    const cargoAt = ROAD_HALF + 26;       // just off the kerb, to make a corridor
    const RAMP = 130;
    const from = sec.from + RAMP, to = sec.to - RAMP;
    const DEPTH = 46;

    for (let s = from; s < to; s += 0.8) {
      const gunwale = Math.abs(s - from) < 3 || Math.abs(s - to) < 3;
      for (let u = -half; u <= half; u += 0.8) {
        const a = Math.abs(u);
        c.put(s, u, (x, z, ff, gy) => {
          const road = gy - 3;
          if (a < half - 4) { c.w.set(x, road - 1, z, 'metalDark'); return; }
          // the sheer: the side falls away and tucks in toward the waterline
          for (let k = 0; k < DEPTH; k++)
            c.w.set(x, road - 1 - k, z, k < 3 ? 'rust' : ((k >> 2) % 2 ? 'skipSteel' : 'skipRust'));
          c.w.set(x, road + 1, z, 'metalDark');                 // gunwale
          if (a > half - 1) for (let k = 3; k < 9; k += 2) c.w.set(x, road + k, z, 'metal');
        });
      }
      if (gunwale) continue;
    }

    // ramps at both ends, with their orange side rails
    for (const [s0, s1] of [[sec.from + 30, from], [to, sec.to - 30]])
      for (let s = s0; s < s1; s += 1) {
        for (const side of [-1, 1])
          c.put(s, side * (ROAD_HALF + 14), (x, z, ff, gy) => {
            for (let k = 0; k < 9; k++) c.w.set(x, gy - 3 + k, z, k > 6 ? 'coneOrange' : 'metalDark');
          });
        for (let u = -(ROAD_HALF + 14); u <= ROAD_HALF + 14; u += 0.8)
          c.put(s, u, (x, z, ff, gy) => {
            for (let k = 1; k <= 7; k++) c.w.set(x, gy - 3 - k, z, 'metalDark');
          });
      }

    // cargo down both sides, leaving the lane. Boxes are laid out in (s, u) so
    // they sit square to the deck however the deck is pointing.
    for (let s = from + 50; s < to - 60; s += 66) {
      const high = 1 + Math.floor(hash3(Math.round(s), 3, 7) * 3);
      for (const side of [-1, 1]) {
        const col = ['doorRed', 'doorBlue', 'doorGreen', 'rust', 'skipRust', 'doorYellow'][
          Math.floor(hash3(Math.round(s), side, 11) * 6)];
        for (let k = 0; k < high; k++)
          for (let ds = 0; ds < 56; ds += 0.8)
            for (let u = 0; u <= 28; u += 0.8) {
              const edge = ds < 1 || ds > 54.5 || u < 1 || u > 27;
              if (!edge && k < high - 1) continue;
              c.put(s + ds, side * (cargoAt + u), (x, z, ff, gy) => {
                const base = gy - 2 + k * 26;
                if (edge) for (let j = 0; j < 25; j++) c.w.set(x, base + j, z, col);
                else c.w.set(x, base + 24, z, col);
              });
            }
      }
    }

    c.blit(to - 130, half + 40, c.pr.island);
    c.put(sec.from - 80, half + 90, (x, z, ff, gy) => D2.crane(c.w, x, gy, z, 150, 150));
  },

  // ---------------------------------------------- SET PIECE: the gatehouse
  // The old town already had a wall you drove PAST. This drives you THROUGH
  // it: a stone arch the road only just fits, two drum towers either side, a
  // portcullis hanging in the vault, and the town wall running away both ways.
  //
  // It is a squeeze, not a barrier. The bore is wider than the car by four
  // lengths and its ceiling clears head height, so the collision field never
  // calls the vault blocked -- the same trick the tunnel uses. What makes it
  // frightening is that the SIDES come in, and you have to be straight before
  // you arrive.
  gatehouse(c, sec) {
    const mid = (sec.from + sec.to) / 2;
    // The arch springs AT THE KERB. The first version had the stone come 26
    // voxels into the carriageway on each side, on the argument that a gate you
    // have to be straight for is the whole set piece -- and the audit called it
    // for what it is from the car: six points of road that are a wall. What
    // narrows here is the FOOTWAY; the tarmac goes through untouched, and the
    // thing you have to be straight for is a 216-voxel hole in a wall.
    const BORE = ROAD_HALF + KERB;                 // the gap you go through
    const WALL = BORE + 90;                        // how far out the stone runs
    // RISE has to clear the arch crown by real mass. The crown of a semicircle
    // this wide lands at 96, so at 118 there were twenty-two voxels of stone
    // above it and the portcullis was silhouetted against the SKY rather than
    // against a wall -- a gate with nothing on top of it.
    const THICK = 120, RISE = 152;

    // the wall itself, marched in (s, u) because it SPANS the road
    for (let s = mid - THICK / 2; s <= mid + THICK / 2; s += 0.8) {
      const d = Math.abs(s - mid) / (THICK / 2);
      for (let u = -WALL; u <= WALL; u += 0.8) {
        const a = Math.abs(u);
        // the arch: a semicircle over the bore, so the vault is round
        const arch = a <= BORE ? 46 + Math.sqrt(Math.max(0, BORE * BORE - u * u)) * 0.62 : 0;
        if (a <= BORE && arch >= RISE) continue;
        c.put(s, u, (x, z, ff, gy) => {
          const from = a <= BORE ? Math.round(arch) : 0;
          for (let k = from; k < RISE; k++) {
            const face = a > BORE - 2 || d > 0.86;
            const m = k > RISE - 8 ? 'concrete'
              : (hash3(x, k, z) > 0.90 ? 'brickDark' : (face && (k % 9) === 0 ? 'brickDark' : 'concreteOld'));
            c.w.set(x, gy + k, z, m);
          }
          // the wall walk, with crenellations at the outer face
          if (a > BORE) {
            c.w.set(x, gy + RISE, z, 'concrete');
            if (d > 0.80 && (Math.round(a) % 12) < 6)
              for (let k = 1; k < 9; k++) c.w.set(x, gy + RISE + k, z, 'concrete');
          }
        });
      }
    }

    // drum towers, one each side, taller than the wall and round in (s, u)
    for (const side of [-1, 1]) {
      const R = 38;
      for (let ds = -R; ds <= R; ds += 0.8)
        for (let du = -R; du <= R; du += 0.8) {
          const r = Math.hypot(ds, du);
          if (r > R) continue;
          const shell = r > R - 5;
          c.put(mid + ds, side * (WALL + 6) + du, (x, z, ff, gy) => {
            const top = RISE + 44;
            if (shell) {
              for (let k = 0; k < top; k++)
                c.w.set(x, gy + k, z, hash3(x, k, z) > 0.91 ? 'brickDark' : 'concreteOld');
              if ((Math.round(r * 6 + ds) % 11) < 5)
                for (let k = 0; k < 9; k++) c.w.set(x, gy + top + k, z, 'concrete');
              // arrow loops, the only light in all that stone
              if (Math.abs(du) < 2 && (Math.round(ds) % 17) === 0)
                for (let k = 40; k < 52; k += 4) c.w.set(x, gy + k, z, 'winWarmDim');
            } else {
              c.w.set(x, gy + top, z, 'concrete');
            }
          });
        }
    }

    // the portcullis, hung in the vault well above head height
    for (let u = -BORE + 3; u <= BORE - 3; u += 4)
      c.put(mid, u, (x, z, ff, gy) => {
        for (let k = 64; k < 104; k++) c.w.set(x, gy + k, z, 'metalDark');
      });
    for (let k = 66; k < 102; k += 8)
      for (let u = -BORE + 3; u <= BORE - 3; u += 0.9)
        c.put(mid, u, (x, z, ff, gy) => c.w.set(x, gy + k, z, 'metalDark'));

    // lamps ON the arch, because a stone tunnel with no light in it is a hole
    for (const side of [-1, 1])
      for (const ds of [-THICK / 2 - 12, THICK / 2 + 12])
        c.put(mid + ds, side * (BORE - 8), (x, z, ff, gy) => {
          c.w.box(x - 1, gy + 40, z - 1, 3, 3, 3, 'metalDark');
          c.w.set(x, gy + 39, z, 'porchBulb');
          c.anchors.lamps.push([x, gy + 39, z]);
        });

    // and the town it is the gate of, set back from the wall on both sides
    for (const side of [-1, 1]) {
      c.blit(sec.from + 150, side * (PAVE_BACK + 30), c.pr.stoneA);
      c.blit(sec.to - 170, side * (PAVE_BACK + 30), c.pr.stoneB);
    }
  },

  // -------------------------------------------- SET PIECE: the market hall
  // You drive UNDER a building. A timber market hall on stone piers straddles
  // the road: the piers stand at the very edge of the carriageway on both
  // sides, so the fastest line goes straight down the middle and the overtake
  // does not exist for four seconds.
  //
  // The piers ARE solid -- that is the difference between this and the
  // gatehouse. One narrows the road; the other puts things in it.
  markethall(c, sec) {
    const from = sec.from + 90, to = sec.to - 90;
    // OUTSIDE the kerb, not inside it.
    //
    // The first version stood them at ROAD_HALF - 14 on the argument that piers
    // in the road remove the overtake for four seconds. The carriageway audit
    // called it immediately: fifteen points of road you cannot drive on, which
    // is not a corridor, it is fifteen crash sites. The hall still straddles
    // the road and you still drive under a building -- the span just clears
    // the tarmac, which is what a real market hall does.
    const PIER = ROAD_HALF + KERB + 8;
    // HIGH, and LIT from underneath.
    //
    // At 76 the soffit filled the top third of the windscreen with an unlit
    // black band -- the shot read as a letterbox rather than as a building over
    // the road, because the one thing a camera cannot see is a dark ceiling.
    // It sits at 112 now, and the floor above carries lit panels between its
    // joists, which is both what a market hall has and the only thing that
    // makes the underside legible at night.
    const DECK = 112;                    // underside of the floor above
    const step = 58;

    for (let s = from; s < to; s += step)
      for (const side of [-1, 1])
        for (let ds = -7; ds <= 7; ds += 0.8)
          for (let du = -7; du <= 7; du += 0.8) {
            if (Math.abs(ds) + Math.abs(du) > 10) continue;
            c.put(s + ds, side * PIER + du, (x, z, ff, gy) => {
              for (let k = 0; k < DECK; k++)
                c.w.set(x, gy + k, z, k < 4 ? 'brickDark' : (hash3(x, k, z) > 0.9 ? 'concrete' : 'concreteOld'));
            });
          }

    // The hall above: a floor across the whole span, a storey and a roof. All
    // of it is over head height, so none of it is in your way -- it is a LID,
    // and the trick of the piece is that you can see the far end of it from
    // the moment you commit.
    for (let s = from - 8; s <= to + 8; s += 0.8) {
      for (let u = -PIER - 12; u <= PIER + 12; u += 0.8) {
        const a = Math.abs(u);
        c.put(s, u, (x, z, ff, gy) => {
          // joists, boards, and a lit panel between every pair of joists
          const bay = Math.round(s) % 34;
          c.w.set(x, gy + DECK, z, bay < 6 ? 'wood' : (a < PIER - 30 && bay > 12 && bay < 28 ? 'winWarmDim' : 'woodPale'));
          for (let k = 1; k < 5; k++) c.w.set(x, gy + DECK + k, z, k < 2 ? 'wood' : 'woodPale');
          if (a > PIER + 2) {
            for (let k = 5; k < 40; k++) {
              const win = k > 12 && k < 28 && (Math.round(s) % 26) < 14;
              c.w.set(x, gy + DECK + k, z,
                win ? (hash3(x, 0, z) > 0.45 ? 'winWarm' : 'winWarmDim')
                  : (Math.round(s) % 26 < 3 || k > 36 ? 'wood' : 'concrete'));
            }
          }
        });
      }
      for (let u = -PIER - 12; u <= PIER + 12; u += 0.8) {
        const pitch = Math.round((1 - Math.abs(u) / (PIER + 12)) * 34);
        c.put(s, u, (x, z, ff, gy) => {
          c.w.set(x, gy + DECK + 40 + pitch, z, 'shingle');
          c.w.set(x, gy + DECK + 39 + pitch, z, 'shingleDark');
        });
      }
    }

    // lamps hung off the piers, under the deck
    for (let s = from + 29; s < to; s += step * 2)
      for (const side of [-1, 1])
        c.put(s, side * (PIER - 6), (x, z, ff, gy) => {
          c.w.set(x, gy + DECK - 9, z, 'porchBulb');
          c.anchors.lamps.push([x, gy + DECK - 9, z]);
        });
  },

  // ------------------------------------------------ SET PIECE: the viaduct
  // The exact inverse of the ship. There you were down inside something with
  // steel either side of you; here the ground FALLS AWAY and there is nothing
  // but a parapet and the city three hundred voxels below.
  //
  // It also gives the Ring Road a rhythm it never had: the tunnels take the
  // sky off you and gave nothing back. Tunnel, open, viaduct, tunnel is a lap
  // with a shape to it.
  viaduct(c, sec) {
    const DECK = ROAD_HALF + KERB + 16;
    const DROP = 300;
    const RAMP = 200;
    const s0 = sec.from + RAMP, s1 = sec.to - RAMP;

    for (let s = s0; s < s1; s += 0.9)
      for (let u = -DECK; u <= DECK; u += 0.8) {
        const a = Math.abs(u);
        c.put(s, u, (x, z, ff, gy) => {
          const road = gy - 3;
          c.w.set(x, road - 1, z, 'concreteOld');
          c.w.set(x, road - 2, z, a > DECK - 6 ? 'concrete' : 'brickDark');
          if (a > DECK - 3) {
            for (let k = 0; k < 3; k++) c.w.set(x, road - 3 - k, z, 'concrete');
            // The parapet. Low enough to see the drop over -- a wall you
            // cannot see over is just a corridor again -- and solid, so you
            // cannot drive off it.
            for (let k = 0; k < 15; k++) c.w.set(x, road + k, z, k > 12 ? 'concrete' : 'concreteOld');
          }
        });
      }

    // Piers and arches, all of it BELOW the deck. surround() is told this leg
    // is a structure, so the ground does not come up with it and the drop is
    // a real drop.
    const SPAN = 300;
    for (let s = s0 + 40; s < s1; s += SPAN) {
      for (let ds = -24; ds <= 24; ds += 0.8)
        for (let u = -DECK + 10; u <= DECK - 10; u += 0.9) {
          const a = Math.abs(u);
          // Hollow across the WHOLE carriageway, not just its middle. The
          // first version closed the pier back up at its own leading and
          // trailing faces, which left two stubs of stone standing in the road
          // at every pier. Hollow to the KERB, not to a fraction of the deck:
          // DECK - 34 is still twelve voxels inside the carriageway, so the
          // audit went on finding a wall there. A pier is only ever seen from
          // its flanks anyway.
          if (a < ROAD_HALF + KERB + 2) continue;
          c.put(s + ds, u, (x, z, ff, gy) => {
            const road = gy - 3;
            for (let k = 6; k < DROP; k++) {
              if (Math.abs(ds) > 24 - k / DROP * 7) continue;
              c.w.set(x, road - k, z, hash3(x, k >> 2, z) > 0.90 ? 'brickDark' : 'concreteOld');
            }
          });
        }
      // the arch soffit spanning to the next pier
      for (let ds = 24; ds < SPAN - 24; ds += 0.9) {
        const sag = Math.round(Math.sin((ds - 24) / (SPAN - 48) * Math.PI) * 70);
        for (let u = -DECK + 10; u <= DECK - 10; u += 0.9) {
          if (Math.abs(u) < DECK - 26) continue;
          c.put(s + ds, u, (x, z, ff, gy) => {
            for (let k = 6; k < 20; k++) c.w.set(x, gy - 3 - k - sag, z, 'concreteOld');
          });
        }
      }
    }

    // the ramps at both ends, so you do not step onto a cliff
    for (const [a0, a1, dir] of [[sec.from + 40, s0, 1], [s1, sec.to - 40, -1]])
      for (let s = a0; s < a1; s += 0.9) {
        const t = dir > 0 ? (s - a0) / (a1 - a0) : (a1 - s) / (a1 - a0);
        const deep = Math.round(t * 64) + 3;
        for (let u = -DECK; u <= DECK; u += 0.9)
          c.put(s, u, (x, z, ff, gy) => {
            const road = gy - 3;
            // A SHELL, not a solid block.
            //
            // The first version filled the whole width down to the full depth,
            // sixty-odd voxels of stone under the middle of the road -- and the
            // walk field measures a column FROM ITS LOWEST VOXEL, so the floor
            // came out twenty-five voxels below the tarmac and the audit called
            // the entire cross-section undrivable. Under the carriageway the
            // deck is five voxels thick; the depth is all in the flanks, which
            // are the only part you can see anyway.
            for (let k = 1; k < 6; k++) c.w.set(x, road - k, z, 'concreteOld');
            if (Math.abs(u) > DECK - 12)
              for (let k = 6; k < deep; k++) c.w.set(x, road - k, z, 'concreteOld');
            if (Math.abs(u) > DECK - 3)
              for (let k = 0; k < 15; k++) c.w.set(x, road + k, z, k > 12 ? 'concrete' : 'concreteOld');
          });
      }

    // the city underneath, small and far down, so the height reads
    for (let s = s0 + 60; s < s1 - 60; s += 170)
      for (const side of [-1, 1])
        c.put(s, side * (DECK + 130), (x, z, ff, gy) => {
          const h = 40 + Math.floor(hash3(x, 5, z) * 90);
          c.w.box(x - 26, gy - DROP + 20, z - 26, 52, h, 52, 'brickDark');
          for (let k = 8; k < h - 6; k += 11)
            for (let dx = 4; dx < 48; dx += 9)
              c.w.set(x - 26 + dx, gy - DROP + 20 + k, z - 26,
                hash3(x + dx, k, z) > 0.55 ? 'winWarm' : 'winTV');
        });
    // lamps along the parapet, the only thing lighting it
    for (let s = s0; s < s1; s += 150)
      for (const side of [-1, 1])
        c.put(s, side * (DECK - 5), (x, z, ff, gy) =>
          c.anchors.lamps.push(P.streetLamp(c.w, x, gy - 3, z, 46, -12 * side)));
  },

  // ----------------------------------------------- SET PIECE: the mill yard
  // The Parade's mill was a building on the verge; now the road goes THROUGH
  // its yard -- under the conveyor bridge, between the silos. The one piece of
  // industry on an otherwise residential circuit, and the only place on the
  // Parade where something passes over your head.
  millyard(c, sec) {
    const mid = (sec.from + sec.to) / 2;

    for (const at of [mid - 210, mid + 190]) {
      for (const side of [-1, 1])
        for (let ds = -6; ds <= 6; ds += 0.8)
          for (let du = -6; du <= 6; du += 0.8)
            c.put(at + ds, side * (ROAD_HALF + 20) + du, (x, z, ff, gy) => {
              for (let k = 0; k < 78; k++) c.w.set(x, gy + k, z, k % 13 === 0 ? 'metal' : 'metalDark');
            });
      for (let u = -(ROAD_HALF + 20); u <= ROAD_HALF + 20; u += 0.8)
        for (let ds = -9; ds <= 9; ds += 0.9)
          c.put(at + ds, u, (x, z, ff, gy) => {
            const shell = Math.abs(ds) > 7.5 || Math.abs(u) > ROAD_HALF + 18;
            for (let k = 78; k < 96; k++)
              c.w.set(x, gy + k, z, shell || k > 93 ? 'metal' : 'metalDark');
            if (Math.abs(ds) < 1 && (Math.round(u) % 24) < 3) c.w.set(x, gy + 77, z, 'porchBulb');
          });
    }

    // silos in a row, close enough to the kerb to make a wall of cylinders
    for (let i = 0; i < 4; i++)
      c.put(mid - 150 + i * 108, (i % 2 ? -1 : 1) * (SET + 20), (x, z, ff, gy) =>
        D.silo(c.w, x, gy, z, 16 + (i % 2) * 5, 96 + i * 9));

    c.blit(mid + 40, SET + 96, c.pr.mill);
    c.put(mid + 40, SET + 150, (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 158, z]));
    c.put(mid - 300, -(SET + 30), (x, z, ff, gy) => D.oilDrums(c.w, x, gy, z, 11));
    c.put(mid + 280, -(SET + 26), (x, z, ff, gy) => D.pallets(c.w, x, gy, z, 6));
    c.run(sec.from, sec.to, SET + 190, 230, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 42, 15));
  },

  // ========================================================== THE RING ROAD
  motorway(c, sec) {
    const ax = legAxis(c.path, sec, c.f);
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (PAVE_BACK + 4), 40, (x, z, ff, gy) => {
        const [ex, ez] = c.back(ff, x, z, 20);
        D2.embankment(c.w, ex, gy, ez, 42, c.along(ff), side, 34);
      });
    for (let s = sec.from + 260; s < sec.to - 200; s += 620) gantryOver(c, s, ROAD_HALF + 30, 0, false);
    c.run(sec.from, sec.to, SET + 90, 260, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 40, 14));
  },

  // Not new geometry: a roof over a road that already exists. The collision
  // field only calls something blocked within head height of the floor, so a
  // ceiling four metres up costs nothing but voxels.
  tunnel(c, sec) {
    const half = ROAD_HALF + KERB + 10;
    for (let s = sec.from + 60; s < sec.to - 60; s += 0.9) {
      const lit = (Math.round(s) % 90) < 30;
      for (let u = -half; u <= half; u++) {
        const a = Math.abs(u);
        const top = Math.round(46 + Math.cos((a / half) * Math.PI * 0.5) * 16);
        c.put(s, u, (x, z, ff, gy) => {
          if (a > half - 5) for (let k = 0; k < top; k++)
            c.w.set(x, gy + k, z, (k >> 2) % 2 ? 'concreteOld' : 'concrete');
          c.w.set(x, gy + top, z, 'concreteOld');
          c.w.set(x, gy + top + 1, z, 'concrete');
          if (lit && a < 4) c.w.set(x, gy + 58, z, 'sodium');
        });
      }
    }
    // Portals, so you can see the mouth coming. ABOVE the arch and OUTSIDE it
    // only — the first version filled the whole cross-section, which is not a
    // portal, it is a wall across the road. Fifty-one crashes, all at one spot,
    // and the car simply stopped dead at the tunnel mouth.
    for (const s of [sec.from + 56, sec.to - 56])
      for (let u = -half - 10; u <= half + 10; u++) {
        const a = Math.abs(u);
        const top = a <= half ? Math.round(46 + Math.cos((a / half) * Math.PI * 0.5) * 16) + 2 : 0;
        c.put(s, u, (x, z, ff, gy) => {
          for (let k = top; k < 88; k++) c.w.set(x, gy + k, z, (k >> 3) % 2 ? 'concrete' : 'concreteOld');
        });
      }
  },

  services(c, sec) {
    c.blit(sec.from + 220, SET + 90, c.pr.services);
    c.put(sec.from + 220, SET + 74, (x, z, ff, gy) => c.anchors.tvs.push([x, gy + 16, z]));
    const ax = legAxis(c.path, sec, c.f);
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (PAVE_BACK + 4), 40, (x, z, ff, gy) => {
        const [ex, ez] = c.back(ff, x, z, 20);
        D2.embankment(c.w, ex, gy, ez, 42, c.along(ff), side, 26);
      });
    gantryOver(c, sec.to - 260, ROAD_HALF + 30, 0, false);
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

  // Start/finish gantry, built in (s, u) like everything else that spans the
  // road. Its beam used to be a world-X box: across the carriageway on the
  // Parade, whose start straight happens to run along Z, and lying flat down
  // the MIDDLE of the road on the Docks, whose start straight runs along X.
  // That was the two-hundred-voxel pink streak through the middle of the frame.
  for (const side of [-1, 1])
    put(30, side * (ROAD_HALF + 6), (x, z, ff, gy) => w.box(x - 2, gy, z - 2, 5, 116, 5, 'metalDark'));
  for (let u = -ROAD_HALF - 6; u <= ROAD_HALF + 6; u += 0.8)
    put(30, u, (x, z, ff, gy) => {
      w.box(x - 1, gy + 110, z - 1, 3, 6, 3, 'metalDark');
      if (Math.abs(u) < ROAD_HALF - 6) w.set(x, gy + 113, z, 'neonSign');
    });
  for (let u = -ROAD_HALF; u <= ROAD_HALF; u++)
    put(30, u, (x, z, ff, gy) => w.set(x, gy - 3, z, ((u >> 2) % 2) ? 'roadLine' : 'asphaltPatch'));

  // council property, because a street has some. Positions come from the
  // track's own spec, so a narrower town gets its own furniture rather than
  // the Parade's laid out on top of it.
  const F = SPEC.furniture || {};
  for (const s of F.phone || [])
    put(s, PAVE_BACK, (x, z, ff, gy) => S.phoneBox(w, x - 5, gy, z - 5));
  for (const [s, side] of F.shelters || [])
    put(s, side * (PAVE_BACK - 2), (x, z, ff, gy) => S.busShelter(w, x - 17, gy, z - 7, 1));
  for (const [s, side] of F.benches || []) {
    put(s, side * PAVE_BACK, (x, z, ff, gy) => S.bench(w, x - 13, gy, z - 4, 1));
    put(s + 70, side * PAVE_BACK, (x, z, ff, gy) => P.trashBin(w, x, gy, z));
  }
  for (const s of F.drains || [])
    put(s, ROAD_HALF - 3, (x, z, ff, gy) => S.drain(w, x - 4, gy - 3, z - 2));
  for (const [s, side, kind] of F.signs || [])
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
let PARKED = [];
function parked(w, path) {
  const proto = new VoxWorld();
  P.wagon(proto, -11, 0, -25);                        // centred, facing +Z
  const f = frame();
  // On the parade and in the crescent, because those are the two legs where
  // somebody lives. Nobody parks on the sweeper.
  const spots = PARKED;
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

// -------------------------------------------------------------- landmarks
// Put in the middle of the loop rather than beside the road, because the
// infield is the one part of this world you see from several places at once.
function landmarks(w, path) {
  let cx = 0, cz = 0;
  const n = path.points.length / 2;
  for (let i = 0; i < path.points.length; i += 2) { cx += path.points[i]; cz += path.points[i + 1]; }
  cx = Math.round(cx / n); cz = Math.round(cz / n);
  const gy = GROUND_Y + elev(0);
  const L = SPEC.landmarks || {};
  if (L.gasholder) D.gasholder(w, cx + L.gasholder[0], gy, cz + L.gasholder[1], L.gasholder[2], L.gasholder[3]);
  if (L.waterTower) D.waterTower(w, cx + L.waterTower[0], gy, cz + L.waterTower[1]);
  // a few pylons marching away, so the middle distance is not empty either
  for (let i = 0; i < (L.pylons || 0); i++) {
    const px = cx - 340 + i * 150, pz = cz - 300 - i * 40;
    for (const [ox] of [[-9], [9]]) for (let j = 0; j < 88; j++) w.set(px + ox, gy + j, pz, 'metalDark');
    for (const yy of [52, 70, 86]) for (let k = -22; k <= 22; k++) w.set(px + k, gy + yy, pz, 'metalDark');
  }
}

// ---------------------------------------------------------------- hazards
// Bigger than a bike's. At 80 km/h a wheelie bin is not an event, so these are
// roadworks, skips and a broken-down car — and most of them are where the
// streetlights are not.
// Placed as a fraction of the carriageway, not in absolute voxels: on a wider
// road the same numbers would leave a clear lane past every one of them, and
// a hazard you can ignore is scenery.
export const H = (f) => Math.round(ROAD_HALF * f);
// Six of the nine are on unlit legs, and one of those is mid-corner on the
// long dark sweeper — which is the hardest thing on the circuit and the only
// place the lighting design and the corner design ask the same question at
// once. Two lit ones exist so the dark ones are a contrast rather than a rule.
export let HAZARDS = [];

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
export let CROSSINGS = [];

// Pavement beats for the people who live here. Weighted toward the parade, the
// crescent and the park, because that is where somebody would actually BE at
// this hour — but with one figure walking home past the mill in the dark,
// which is the single most atmospheric person on the circuit.
//
// `pace` sets how fast they walk (a jogger is not a shopper) and `idle` stands
// them still facing the road, which is what waiting for a bus looks like.
let LIFE = [];
export function lifeSpots() { return LIFE; }


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
    // A leg the road crosses on a STRUCTURE does not take the ground with it.
    // Without this the water follows the ship's deck thirty voxels into the air
    // and the set piece reads as a hill with containers on it.
    const sec = sectionAt(s);
    // A leg carried on a STRUCTURE also has to get ONTO it. The ship gets away
    // with a bare step because its deck is thirty voxels down; a viaduct three
    // hundred up would put a sheer cliff in the ground mesh at the leg
    // boundary, which reads as the world being torn rather than as a bridge.
    // deckRamp blends the two over the approach, matching the ramps the set
    // piece builds in voxels.
    let gy = GROUND_Y + elev(s) - 1;
    if (sec && sec.deck !== undefined) {
      const r = sec.deckRamp || 0;
      const into = Math.min(s - sec.from, sec.to - s);
      const t = r > 0 ? Math.max(0, Math.min(1, into / r)) : 1;
      gy = GROUND_Y + (elev(s) * (1 - t) + sec.deck * t) - 1;
    }
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
// The track currently loaded. Module state, deliberately: one per page.
let SPEC = null;
export const spec = () => SPEC;

export function buildTrack(trackSpec) {
  SPEC = trackSpec;
  setRoad(trackSpec.road);
  setProfile(trackSpec.profile);
  setShape(trackSpec);
  HAZARDS = trackSpec.hazards.map(h => ({ ...h }));
  CROSSINGS = trackSpec.crossings || [];
  PARKED = trackSpec.parked || [];
  LIFE = (trackSpec.life || []).map(l => ({
    ...l, u: (l.side || 1) * PAVE_MID,
  })).concat((trackSpec.crossings || []).map((cs, i) => ({
    // the ones who step out in front of you, at the marked crossings
    s: cs, u: i % 2 ? PAVE_MID : -PAVE_MID, cross: true, pace: 30 + i * 4,
  })));

  const t0 = performance.now();
  // Phase timings, because "the build takes twenty seconds" is not actionable
  // and every guess I have made about where voxel time goes has been wrong.
  const marks = [];
  let last = t0;
  const mark = (name) => { const n = performance.now(); marks.push([name, Math.round(n - last)]); last = n; };

  const path = buildPath(trackSpec);
  const w = new VoxWorld();
  const anchors = { lamps: [], stacks: [], tvs: [] };
  const protos = prototypes();
  mark('prototypes');
  ribbon(w, path);
  mark('ribbon');
  dress(w, path, anchors, protos);
  mark('districts');
  parked(w, path);
  hazards(w, path);
  landmarks(w, path);
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
    // 160, not 60. Hazards grew a long tapering run of cones leading into them
    // and the exclusion window did not grow with them, so the check started
    // reporting the roadworks it was written to ignore. An audit whose idea of
    // the thing it is excluding goes stale is worse than no audit, because you
    // learn to skim its output.
    const hz = new Set(HAZARDS.map(h => Math.round(h.s / 12) * 12));
    const rogue = blockers.filter(([s]) => ![...hz].some(h => Math.abs(h - s) < 160));
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
  // 22%, not 16%. The old figure was set when the car had 2.6g brakes, no
  // reverse and a spin-out on every contact; the ring road's crests measure 20%
  // and every policy drives them with zero contacts. When the check and the
  // measurement disagree, and the measurement is the one that drove the lap,
  // the check is what is out of date.
  if (worst > 0.22) {
    console.error('track: ' + Math.round(worst * 100) + '% grade at s=' + Math.round(worstS)
      + ' (' + sectionAt(worstS).district + ') - too steep to drive');
  }

  mark('audits');
  const start = frame();
  path.at(80, start);

  return {
    group, path, field, anchors, hazards: HAZARDS, elev, grade: +worst.toFixed(3),
    spec: trackSpec, id: trackSpec.id, name: trackSpec.name,
    roadHalf: ROAD_HALF, sections: SECTIONS, traffic: trackSpec.traffic || [],
    chunks: group.children.filter(c => c.name === 'track:chunks').reduce((n, g) => n + g.children.length, 0),
    start: { x: start.x, z: start.z, heading: Math.atan2(start.tx, start.tz) },
    voxels: w.size,
    buildMs: Math.round(performance.now() - t0),
    phases: marks,
    lapLength: path.total,
  };
}
