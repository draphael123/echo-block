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
import * as THREE from '../../vendor/three/three.module.js';
import { VoxWorld, meshWorld, meshChunks, meshChunksAsync, hash3 } from '../voxel.js';
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
        // THE SURFACE IS THE TRACK'S FACE. Four circuits on one asphalt recipe
        // read as one place with different weather (the playtest said so,
        // twice) — and the road is the thing you actually stare at for the
        // whole lap. Each circuit declares a surface in its spec:
        //   street   — the Parade's worn asphalt and white dashes
        //   cobble   — the Old Town's setts: mottled stone, no centre line
        //   concrete — the Docks' slab pavement, seam joints, yellow edges
        //   motorway — the Ring's fresh black top, rumble strips, lane dashes
        const surf = SPEC.surface || 'street';
        let c;
        if (surf === 'cobble') {
          const q = hash3(x >> 1, 1, z >> 1);
          c = q > 0.7 ? 'concreteOld' : (q > 0.35 ? 'asphaltWorn' : (q > 0.08 ? 'asphalt' : 'brickDark'));
          if (a > half - 3) c = 'concreteOld';
          if (a > half - 8 && a < half - 5) c = 'concrete';       // stone gutters
        } else if (surf === 'concrete') {
          c = r > 0.9 ? 'asphaltWorn' : (hash3(x >> 3, 2, z >> 3) > 0.5 ? 'concrete' : 'concreteOld');
          if ((s % 44) < 2 || (Math.round(a) % 64) < 2) c = 'asphaltPatch';   // slab joints
          if (a > half - 3) c = 'asphaltPatch';
          if (a > half - 10 && a < half - 5) c = 'doorYellow';    // dock edge lines
          if (a < 2 && (s % 70) < 40) c = 'roadLine';
        } else if (surf === 'motorway') {
          c = r > 0.94 ? 'asphaltWorn' : 'asphalt';
          if (a > half - 6) c = ((s % 24) < 12) ? 'plasticRed' : 'paper';     // rumble strip
          else if (a > half - 12 && a < half - 8) c = 'roadLine';
          if (a > half - 11 && a < half - 9 && (s % 56) < 2) c = 'porchBulb'; // catseyes
          if (a > half / 3 - 2 && a < half / 3 + 1 && (s % 96) < 52) c = 'roadLine';
          if (a > (half * 2) / 3 - 2 && a < (half * 2) / 3 + 1 && (s % 96) < 52) c = 'roadLine';
          if (a < 2 && (s % 96) < 52) c = 'roadLine';
        } else {
          c = r > 0.86 ? 'asphaltWorn' : (r < 0.10 ? 'asphaltPatch' : 'asphalt');
          if (a > half - 3) c = 'asphaltPatch';
          if (a > half - 9 && a < half - 5) c = 'roadLine';       // edge lines
          if (a > half - 8 && a < half - 6 && (s % 56) < 2) c = 'porchBulb';  // catseyes
          // Four lanes wants three sets of markings, not one: a 15-metre road
          // with a single stripe down it reads as an airstrip.
          if (a > half / 2 - 2 && a < half / 2 + 1 && (s % 96) < 52) c = 'roadLine';
          if (a < 2 && (s % 70) < 40) c = 'roadLine';             // centre dashes
        }
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
    // the variety pass: civic buildings shared between circuits
    pub: protoOf(D2.pub, 72, 52, false),
    petrol: protoOf(D2.petrol, 120, 70, false),
    billboardA: protoOf(D2.billboard, 64, 12, false, [3]),
    billboardB: protoOf(D2.billboard, 64, 12, false, [8]),
    belltower: protoOf(D2.bellTower, 30, 30, false),
    lighthouse: protoOf(D2.lighthouse, 26, 26, false),
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
  //
  // AND IT CHECKS THE OFFSET LINE IS STILL A LINE. An offset u on the inside
  // of a corner scales by (1 - u/r); when the widened cross-section exceeds a
  // tight arc's radius the line collapses and then INVERTS — it folds past
  // the arc's centre and sweeps backwards over whatever is there, which after
  // the city-wide widening was the previous leg's carriageway (a chapel hedge
  // at offset 343 on a radius-260 corner planted itself across the Parade).
  // Measured directly: if stepping forward along s moves the offset point
  // less than a third of a voxel per voxel — or backwards — nothing plants.
  const run = (from, to, u, step, fn) => {
    for (let s = from; s < to; s += step) {
      path.at(s, f);
      const tx = f.tx, tz = f.tz;
      path.place(s + 12, u, f);
      const x2 = f.x, z2 = f.z;
      path.place(s, u, f);
      const proj = ((x2 - f.x) * tx + (z2 - f.z) * tz) / 12;
      if (proj < 0.33) continue;
      fn(Math.round(f.x), Math.round(f.z), f, GROUND_Y + elev(s), s);
    }
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
      // The road painter leaves the odd pinhole column on an arc, and a column
      // whose ONLY voxels are this crossbar reads the crossbar as its floor —
      // per-column floors measure from the lowest voxel — so a sign gantry
      // grew a row of invisible 119-high wall segments across the carriageway.
      // Any empty column under the bar's whole 3x3 footprint gets a road
      // surface first.
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        if (!c.w.get(x + dx, gy - 1, z + dz) && !c.w.get(x + dx, gy - 2, z + dz) && !c.w.get(x + dx, gy - 3, z + dz))
          c.w.set(x + dx, gy - 1, z + dz, 'asphaltPatch');
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

// Is this world point near ANY part of the lap's carriageway? A leg's verge
// can physically overlap a different leg's road — the long quay's off side IS
// the dock gate's carriageway where the loop wraps around its last corner —
// so big scenery fields (container stacks, most of all) must ask the whole
// path, not just their own cross-section, before they plant anything.
function nearRoad(path, x, z, clear) {
  const pts = path.points;
  const c2 = clear * clear;
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i] - x, dz = pts[i + 1] - z;
    if (dx * dx + dz * dz < c2) return true;
  }
  return false;
}
// A container field's whole footprint (cols x 62 in +x, rows x 30 in +z, from
// the anchor) must clear the carriageway, or it is not planted at all.
function containersClear(c, bx, bz, cols, rows) {
  const clear = ROAD_HALF + 34;
  for (const [px, pz] of [[bx, bz], [bx + cols * 62, bz], [bx, bz + rows * 30], [bx + cols * 62, bz + rows * 30]])
    if (nearRoad(c.path, px, pz, clear)) return false;
  return true;
}

// Motorway embankments, marched in (s, u). The district2 builder marched a
// world axis picked by a quarter turn, and on the east sweep's arc that walked
// the rising grass bank INTO the carriageway — a 770-voxel run of 24–31-high
// slices standing inside the road edge, leaning at whatever angle the axis
// error happened to be. Each cross-slice here is planted from its own point's
// frame, so the bank follows the road round the bend the way a bank does.
function bankRun(c, sec, h) {
  for (const side of [-1, 1])
    c.run(sec.from, sec.to, side * (PAVE_BACK + 4), 2, (x, z, ff, gy) => {
      for (let d = 0; d < h; d++) {
        const k = Math.round(d * 0.8);
        c.w.set(x + Math.round(ff.nx * d * side), gy + k, z + Math.round(ff.nz * d * side),
          hash3(x + d, k, z) > 0.7 ? 'grassDry' : 'grass');
      }
    });
}

// -------------------------------------------------------------- districts
const DISTRICT = {
  // The high street. Shopfronts at pavement level with flats over them, in a
  // continuous run — the party walls are the whole difference between a high
  // street and a row of detached boxes.
  parade(c, sec) {
    // BUNTING strung across the high street every 240 — the parade route
    // dressed for its own parade, and one more thing flashing overhead at
    // speed. Strung at 86–96: above the chase camera, below the gantries.
    // Safe from the per-column floor rule because every column under it
    // already has road or kerb at the bottom.
    const FLAG_COLS = ['plasticRed', 'doorYellow', 'doorBlue', 'signWhite'];
    for (let bs = sec.from + 120; bs < sec.to - 60; bs += 240) {
      for (let u = -(ROAD_HALF + KERB); u <= ROAD_HALF + KERB; u += 2) {
        c.put(bs, u, (x, z, ff, gy) => {
          const k2 = u / (ROAD_HALF + KERB);
          const yy = gy + 96 - 10 + Math.round(k2 * k2 * 10);
          c.w.set(x, yy, z, 'metalDark');                    // the line
          if (((Math.round(u) % 16) + 16) % 16 < 3) {        // a flag
            const col = FLAG_COLS[(Math.round(bs + u) >> 4) % 4];
            c.w.box(x, yy - 4, z, 1, 4, 1, col);
          }
        });
      }
    }
    for (const side of [-1, 1]) {
      // A gap every third block. It used to be just absence, which reads as a
      // missing tooth; now the gap is a SIDE STREET -- a strip of tarmac
      // running back between the terraces with a lit shopfront closing the
      // end of it. Costs almost nothing and gives the parade depth, because
      // you can see down it as you go past.
      for (let s = sec.from + 150, i = 0; s < sec.to - 170; s += 196, i++) {
        if (i % 6 === 2) { sideStreet(c, s, side); continue; }
        // every other gap gets THE PUB instead of a side street — the one
        // warm room on the street, its bulb string lit, a phone box outside
        if (i % 6 === 5) {
          c.blit(s, side * SET, c.pr.pub);
          c.put(s, side * (SET + 20), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 62, z]));
          c.put(s + 56, side * PAVE_BACK, (x, z, ff, gy) => S.phoneBox(c.w, x - 4, gy, z - 4));
          continue;
        }
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
    // 24-voxel pieces, was 48: on the chapel's knoll a 48-long hedge
    // anchored at one height floated 4+ voxels at its downhill end
    c.run(sec.from, sec.to, SET, 24, (x, z, ff, gy) =>
      P.hedge(c.w, x - (c.along(ff) === 'x' ? 12 : 5), gy,
        z - (c.along(ff) === 'x' ? 5 : 12), 24, 10, 20, c.along(ff)));
    // the opposite side stays open, so the spire has sky behind it
    c.run(sec.from, sec.to, -(SET + 40), 150, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 44, 15));
  },

  // Unlit, and the biggest single mass on the circuit. Going past a mill in the
  // dark is most of what this stretch has.
  mill(c, sec) {
    c.blit(sec.from + 320, SET - 4, c.pr.mill);
    // the stack, so something is coming out of it
    c.put(sec.from + 320, SET + 62, (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 158, z]));
    for (const [ds, r, h] of [[70, 15, 76], [112, 15, 76], [152, 13, 62]])
      c.put(sec.from + ds, SET + 30, (x, z, ff, gy) => D.silo(c.w, x, gy, z, r, h));
    // The fence is marched in (s, u), one column per voxel of road. It used to
    // be 42-voxel chainFence pieces laid along a quarter-turn world axis every
    // 40 — exact on a straight, and on the Docks' curving mill leg the pieces
    // zigzagged across the corridor and stood in the carriageway for the last
    // 380 voxels of the leg, which is what the boot audit had been calling
    // "8 points in sheds" for two sessions.
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * SET, 1, (x, z, ff, gy, s) => {
        const i = Math.round(s - sec.from);
        if (i % 22 === 0) { c.w.box(x, gy, z, 2, 25, 2, 'metalDark'); return; }
        c.w.set(x, gy + 3, z, 'metalDark');            // bottom rail
        c.w.set(x, gy + 13, z, 'metalDark');           // mid rail
        if (i % 2 === 0) for (let k = 5; k < 22; k += 4) c.w.set(x, gy + k, z, 'metal');
        c.w.set(x, gy + 22, z, 'metalDark');           // top rail
      });
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
      c.run(sec.from, sec.to, side * (PAVE_BACK + 8), 28, (x, z, ff, gy) =>
        P.hedge(c.w, x - (c.along(ff) === 'x' ? 14 : 5), gy,
          z - (c.along(ff) === 'x' ? 5 : 14), 28, 9, 14, c.along(ff)));
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
          for (const hh of [-13, 13])
            c.put(s + hh, side * (PAVE_BACK + 6), (x, z, ff, gy) =>
              P.hedge(c.w, x - (c.along(ff) === 'x' ? 13 : 4), gy,
                z - (c.along(ff) === 'x' ? 4 : 13), 26, 8, 9 + Math.round(r * 3), c.along(ff)));
          if (r > 0.6) c.put(s + 44, side * PAVE_BACK,
            (x, z, ff, gy) => c.w.stamp(P.MAILBOX, x, gy, z));
          // one house in three has its fire lit and its television on
          if (r > 0.72) c.put(s, side * (SET + 34), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 74, z]));
          if (r > 0.4) c.put(s + 20, side * (SET - 4), (x, z, ff, gy) => c.anchors.tvs.push([x, gy + 22, z]));
        } else {
          c.put(s, side * (PAVE_BACK + 14), (x, z, ff, gy) => P.tree(c.w, x, gy, z, 42, 15));
          // the odd empty plot gets the phone box people actually walk to
          if (r > 0.1) c.put(s + 52, side * PAVE_BACK, (x, z, ff, gy) => S.phoneBox(c.w, x - 4, gy, z - 4));
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
    // 26-voxel pieces, was 52: the park sits on THE TOP's climb now and a
    // 52-long fence at one anchor height staircased into the air
    c.run(sec.from, sec.to, SET, 26, (x, z, ff, gy) =>
      P.picketFence(c.w, x - (c.along(ff) === 'x' ? 13 : 0), gy,
        z - (c.along(ff) === 'x' ? 0 : 13), 26, c.along(ff)));
    c.run(sec.from + 60, sec.to, -(SET + 14), 130, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 46, 16));
    // a lit hoarding behind the tree line, so the park's dark edge has a far
    // wall the eye can rest on
    c.blit(mid - 320, -(SET + 64), c.pr.billboardA);
    c.blit(mid + 330, -(SET + 64), c.pr.billboardB);
  },

  // The cut: the road runs between two retaining walls, which is WHY this leg
  // has no streetlights — there is nowhere on it for a lamp to stand.
  yard(c, sec) {
    const ax = legAxis(c.path, sec, c.f);
    // 20-voxel wall pieces, was 42: the cut's walls are the closest prop to
    // the kerb on the whole circuit and the relief made their long pieces
    // float at the downhill end — the audit's biggest HARD offender
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (PAVE_BACK + 8), 20, (x, z, ff, gy) =>
        D.retainingWall(c.w, ax === 'x' ? x - 10 : x, gy, ax === 'x' ? z : z - 10, 21, ax, 38));
    gantryOver(c, sec.from + 250, PAVE_BACK + 8, 38, true);
    c.put(sec.from + 120, SET + 34, (x, z, ff, gy) => D.pallets(c.w, x, gy, z, 5));
    c.put(sec.from + 410, -(SET + 38), (x, z, ff, gy) => D.oilDrums(c.w, x, gy, z, 9));
    c.put(sec.from + 460, SET + 30, (x, z, ff, gy) => D.silo(c.w, x, gy, z, 12, 54));
    // a hoarding on the rim of the cutting, lit face leaning over the wall
    c.blit(sec.from + 340, PAVE_BACK + 74, c.pr.billboardB);
  },

  // ---------------------------------------------------------- THE OLD TOWN
  // Buildings right out to the kerb. On a 120-voxel road that frontage is most
  // of what you can see, which is the entire point of the place.
  stone(c, sec) {
    for (const side of [-1, 1])
      for (let s = sec.from + 60, i = 0; s < sec.to - 80; s += 88, i++) {
        // the second unit on the left is the pub — same slot, same line,
        // warmer light. Slot 1, because the Old Town's stone legs are short
        // and a later slot never comes round.
        if (side < 0 && i % 5 === 1) {
          c.blit(s, side * (SET + 26), c.pr.pub);
          c.put(s, side * (SET + 44), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 62, z]));
          continue;
        }
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
    // THE BELL TOWER rises behind the wall at the leg's midpoint — the Old
    // Town's landmark, visible over the roofs from most of the inner lap
    c.blit((sec.from + sec.to) / 2, -(SET + 78), c.pr.belltower);
  },

  mews(c, sec) {
    for (const side of [-1, 1])
      for (let s = sec.from + 90, i = 0; s < sec.to - 90; s += 96, i++) {
        c.blit(s, side * (SET + 30), i % 3 === 1 ? c.pr.mews : (i % 2 ? c.pr.stoneB : c.pr.stoneA));
        if (i % 2 === 0) c.put(s, side * (SET + 46), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 78, z]));
        c.put(s + 26, side * (SET + 16), (x, z, ff, gy) => c.anchors.tvs.push([x, gy + 38, z]));
        if (i % 4 === 1) c.put(s + 58, side * PAVE_BACK, (x, z, ff, gy) => S.phoneBox(c.w, x - 4, gy, z - 4));
      }
  },

  // ============================================================= THE DOCKS
  quay(c, sec) {
    for (let i = 0; i < 4; i++)
      c.put(sec.from + 140 + i * 210, SET + 70, (x, z, ff, gy) =>
        D2.crane(c.w, x, gy, z, 120 + (i % 2) * 24, 130));
    // the lighthouse, at the seaward end of the quay — the harbour's landmark
    c.blit(sec.to - 90, SET + 140, c.pr.lighthouse);
    // A STRADDLE CRANE over the road itself, on the long quay only: lattice
    // legs both kerbs, a beam at 126, and a container hanging mid-lift over
    // the traffic — the working harbour, working directly over your head.
    if (sec.to - sec.from > 1200) {
      const gs = sec.from + 950, half3 = ROAD_HALF + 26;
      for (const side of [-1, 1])
        for (const ds of [-9, 9])
          c.put(gs + ds, side * half3, (x, z, ff, gy) => {
            c.w.box(x - 1, gy, z - 1, 3, 126, 3, 'metalDark');
            for (let k = 12; k < 120; k += 24) c.w.box(x - 1, gy + k, z - 1, 3, 2, 3, 'doorYellow');
          });
      for (let u = -half3; u <= half3; u += 0.8)
        c.put(gs, u, (x, z, ff, gy) => {
          if (!c.w.get(x, gy - 1, z) && !c.w.get(x, gy - 2, z) && !c.w.get(x, gy - 3, z))
            c.w.set(x, gy - 1, z, 'asphaltPatch');
          for (let k = 0; k < 10; k++)
            c.w.set(x, gy + 126 + k, z, (k < 2 || k > 7) ? 'metalDark' : 'doorYellow');
        });
      // the trolley, the cables, and the box mid-lift
      c.put(gs, 46, (x, z, ff, gy) => {
        c.w.box(x - 4, gy + 120, z - 4, 9, 6, 9, 'metalDark');
        for (const [cx2, cz2] of [[-3, -3], [3, 3]])
          for (let k = 108; k < 120; k++) c.w.set(x + cx2, gy + k, z + cz2, 'metalDark');
        c.w.box(x - 6, gy + 96, z - 12, 13, 12, 25, 'doorRed');
        for (let dz2 = -12; dz2 <= 12; dz2 += 4) c.w.box(x - 6, gy + 96, z + dz2, 13, 12, 1, 'rust');
        c.w.set(x, gy + 138, z, 'tailLight');
      });
    }
    c.run(sec.from, sec.to, SET - 4, 60, (x, z, ff, gy) => {
      const [bx, bz] = c.back(ff, x, z, 30);
      D2.bollards(c.w, bx, gy, bz, 60, c.along(ff));
    });
    c.run(sec.from, sec.to, -(SET + 90), 220, (x, z, ff, gy, s) => {
      const [bx, bz] = c.back(ff, x, z, 60);
      if (containersClear(c, bx, bz, 2, 2)) D2.containers(c.w, bx, gy, bz, 2, 2, 3, Math.round(s));
    });
  },

  containers(c, sec) {
    // THE REACH IS A CANYON BETWEEN GROUNDED SHIPS. Two beached hulls close in
    // on the road from both sides — rust waterline, plated steel, a white
    // boot stripe, a gunwale rail, the odd lit porthole — marched in (s, u)
    // one column at a time so they follow the quay's curve. Nothing else on
    // the lap sounds like this leg looks. The coal wharf beyond keeps its
    // container stacks, so the two container legs stop being twins.
    if (sec.name === 'the reach') {
      // THE HULL CANYON, made legible. The playtest drove between two
      // grounded ships and read them as WALLS — because in the dark a
      // plated wall is all they were. What says "ship" at night: a bow
      // that flares and RISES at each end, two rows of lit portholes, a
      // white superstructure island over the rail, nav lights at the
      // ends (port red, starboard green), and lit derrick tips.
      // NOT run(): the docks' reach is an arc of r~460 and a hull offset of
      // 344 compresses the inside line to 0.25 — under run()'s degeneracy
      // guard, which SKIPPED the whole inside ship, while the outside line
      // stretched to 1.75 and gapped into a slat fence at step 1. The
      // positions are still valid (compression is not folding, 344 < r), so
      // march s directly at 0.4 and let the inside overwrite itself solid.
      const from2 = sec.from + 60, to2 = sec.to - 60;
      const hullAt = (s, side, fn) => {
        c.path.place(s, side * (ROAD_HALF + 44), c.f);
        fn(Math.round(c.f.x), Math.round(c.f.z), c.f, GROUND_Y + elev(s), s);
      };
      for (const side of [-1, 1])
        for (let hs = from2; hs < to2; hs += 0.4) hullAt(hs, side, (x, z, ff, gy, s) => {
          const i = Math.round(s);
          const dEnd = Math.min(s - from2, to2 - s);
          const bow = Math.max(0, 1 - dEnd / 130);           // 1 at the tips
          const h = 50 + ((i >> 6) % 2) * 5 + Math.round(bow * bow * 14);  // the sheer
          for (let k = 0; k < h; k++) {
            const m = k < 4 ? 'rust'
              : k === h - 6 ? 'paper'
              : ((k >> 3) % 2 ? 'skipSteel' : 'skipRust');
            c.w.set(x, gy + k, z, m);
          }
          c.w.set(x, gy + h, z, 'metal');
          // portholes: two lit rows, dense enough to read as a liner
          if (i % 28 < 2) {
            c.w.set(x, gy + 24, z, hash3(x, 1, z) > 0.4 ? 'winWarm' : 'winWarmDim');
            c.w.set(x, gy + 34, z, hash3(x, 2, z) > 0.5 ? 'winWarmDim' : 'winWarm');
          }
          // nav lights on the bow and stern: port red, starboard green
          if (dEnd < 3) c.w.box(x, gy + h + 1, z, 1, 3, 1, side < 0 ? 'tailLight' : 'chillGlow');
          if (i % 180 < 2) {                     // a derrick over the rail
            for (let k = 0; k < 34; k++) c.w.set(x, gy + h + k, z, 'metalDark');
            c.w.set(x, gy + h + 34, z, 'sodium');            // masthead light
          }
          // the superstructure island, white over the rail, two window rows
          const spanA = from2 + (to2 - from2) * (side < 0 ? 0.62 : 0.3);
          if (s > spanA && s < spanA + 56) {
            for (let k = h; k < h + 28; k++) {
              const win = (k === h + 10 || k === h + 18) && i % 6 < 3;
              c.w.set(x, gy + k, z, win ? 'winWarm' : 'paper');
            }
            c.w.box(x, gy + h + 28, z, 1, 2, 1, 'metalDark');
          }
        });
      return;
    }
    for (const side of [-1, 1])
      c.run(sec.from, sec.to, side * (SET + 100), 200, (x, z, ff, gy, s) => {
        const [bx, bz] = c.back(ff, x, z, 60);
        if (containersClear(c, bx, bz, 2, 3))
          D2.containers(c.w, bx, gy, bz, 2, 3, 4, Math.round(s) + (side > 0 ? 0 : 91));
      });
    c.put(sec.from + 240, SET + 210, (x, z, ff, gy) => D2.crane(c.w, x, gy, z, 132, 120));
    // CONTAINER BRIDGES: a crane parked its work mid-air — a container
    // spanning the road on stacks, twice a leg. The docks' own gantry, made
    // of the docks' own material, at the town's one overhead standard.
    for (const bs of [sec.from + 160, sec.to - 200]) {
      const half2 = ROAD_HALF + 38;
      // the stacks either side, banded like every container in the yard
      for (const side of [-1, 1])
        for (let ds = -12; ds <= 12; ds++)
          c.put(bs + ds, side * half2, (x, z, ff, gy) => {
            for (let k = 0; k < GANTRY_H; k++)
              c.w.set(x, gy + k, z, ((k / 25) | 0) % 2 ? 'doorBlue' : 'skipRust');
          });
      // the span: one 26-high container laid across, ribbed, 9 deep
      for (let ds = -4; ds <= 4; ds++)
        for (let u = -half2; u <= half2; u += 0.8)
          c.put(bs + ds, u, (x, z, ff, gy) => {
            // the gantry pinhole lesson: any empty column under the span
            // gets road first, or its floor IS the span
            if (!c.w.get(x, gy - 1, z) && !c.w.get(x, gy - 2, z) && !c.w.get(x, gy - 3, z))
              c.w.set(x, gy - 1, z, 'asphaltPatch');
            const band = ((Math.abs(u) / 62) | 0) % 2 ? 'doorRed' : 'doorYellow';
            const rib = (Math.round(u) % 5 === 0);
            for (let k = 0; k < 26; k++)
              c.w.set(x, gy + GANTRY_H + k, z,
                (rib || k < 2 || k > 23 || Math.abs(ds) === 4) ? 'metalDark' : band);
          });
    }
  },

  sheds(c, sec) {
    // Per-shed setback. blit() snaps to a quarter turn, and on a bend the
    // snap leaves the 110 x 84 shed up to 45 degrees off the road — its near
    // corner swings (55 + 84)/sqrt2 = 98 voxels roadward of the anchor, which
    // is how one stood in the dock-gate carriageway at u = -122..-154. But a
    // blanket setback pushed every shed beyond what the rain lets you see, so
    // each shed asks first: if the worst corner the snap can produce would
    // touch ANY road, that one moves out; the rest stay at the kerbside
    // distance the district was composed at.
    for (let s = sec.from + 140, i = 0; s < sec.to - 160; s += 200, i++) {
      const side = i % 2 ? 1 : -1;
      let at = SET + 46;
      c.put(s, side * at, (x, z, ff, gy) => {
        const clear = ROAD_HALF + 30;
        for (const dt of [-55, 0, 55]) {
          const px = x + ff.nx * -side * 98 + ff.tx * dt;
          const pz = z + ff.nz * -side * 98 + ff.tz * dt;
          if (nearRoad(c.path, px, pz, clear)) { at = SET + 106; break; }
        }
      });
      c.blit(s, side * at, c.pr.shed);
      c.put(s + 30, side * (at - 6), (x, z, ff, gy) => c.anchors.stacks.push([x, gy + 62, z]));
    }
    c.run(sec.from, sec.to, SET + 190, 240, (x, z, ff, gy, s) => {
      const [bx, bz] = c.back(ff, x, z, 30);
      if (containersClear(c, bx, bz, 1, 2)) D2.containers(c.w, bx, gy, bz, 1, 2, 3, Math.round(s));
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
            // red lights along the parapet every 60 — the viaduct drawn as a
            // line of lights across the dark, from half the lap away
            if ((Math.round(s) % 60) < 1) c.w.set(x, road + 15, z, 'tailLight');
          }
        });
      }

    // THE CITY BELOW. The drop is the set piece and it fell into pure black
    // — three hundred voxels of nothing reads as fog, not height. A scatter
    // of lit windows on the valley floor is the cheapest possible town, and
    // it is what makes the crossing feel three hundred voxels UP.
    for (let s = s0 - 100; s < s1 + 100; s += 7) {
      for (const side of [-1, 1]) {
        const r2 = hash3(Math.round(s), side, 7);
        if (r2 < 0.45) continue;
        const u2 = side * (DECK + 60 + r2 * 700);
        c.put(s, u2, (x, z, ff, gy) => {
          const road = gy - 3;
          const wy = road - DROP + 4 + Math.round(hash3(x, 3, z) * 26);
          c.w.set(x, wy, z, r2 > 0.92 ? 'sodium' : (r2 > 0.7 ? 'winWarm' : 'winWarmDim'));
        });
      }
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
            // 22, not 15. The car climbs anything up to CAR_STEP (18), so a
            // 15-voxel parapet was a kerb: you could drive up it, ride the
            // apron beyond, and beach there. A parapet's whole job is to be
            // the one wall on the deck the car cannot mount.
            if (Math.abs(u) > DECK - 3)
              for (let k = 0; k < 22; k++) c.w.set(x, road + k, z, k > 19 ? 'concrete' : 'concreteOld');
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

    // The conveyor's underside was 78 — squarely in the 62–90 band the gantry
    // comment calls "a bar across the eye", and UNDER the chase camera's 84,
    // so the camera clipped through its deck every lap while its lit strip
    // bloomed across the middle of the frame from 400 voxels out. 114 clears
    // the town's one overhead standard (GANTRY_H) with the camera below it.
    const CONVEYOR = GANTRY_H + 2;
    for (const at of [mid - 210, mid + 190]) {
      for (const side of [-1, 1])
        for (let ds = -6; ds <= 6; ds += 0.8)
          for (let du = -6; du <= 6; du += 0.8)
            c.put(at + ds, side * (ROAD_HALF + 20) + du, (x, z, ff, gy) => {
              for (let k = 0; k < CONVEYOR; k++) c.w.set(x, gy + k, z, k % 13 === 0 ? 'metal' : 'metalDark');
            });
      for (let u = -(ROAD_HALF + 20); u <= ROAD_HALF + 20; u += 0.8)
        for (let ds = -9; ds <= 9; ds += 0.9)
          c.put(at + ds, u, (x, z, ff, gy) => {
            const shell = Math.abs(ds) > 7.5 || Math.abs(u) > ROAD_HALF + 18;
            for (let k = CONVEYOR; k < CONVEYOR + 18; k++)
              c.w.set(x, gy + k, z, shell || k > CONVEYOR + 15 ? 'metal' : 'metalDark');
            if (Math.abs(ds) < 1 && (Math.round(u) % 24) < 3) c.w.set(x, gy + CONVEYOR - 1, z, 'porchBulb');
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
    bankRun(c, sec, 34);
    for (let s = sec.from + 260; s < sec.to - 200; s += 620) gantryOver(c, s, ROAD_HALF + 30, 0, false);
    c.run(sec.from, sec.to, SET + 90, 260, (x, z, ff, gy) => P.tree(c.w, x, gy, z, 40, 14));
    // lit hoardings above the banks — a motorway at night is adverts and
    // sodium, and until now this one was only sodium
    c.run(sec.from + 320, sec.to - 120, -(SET + 70), 740, (x, z, ff, gy, s) =>
      c.blit(s, -(SET + 70), (Math.round(s) >> 3) % 2 ? c.pr.billboardA : c.pr.billboardB));
  },

  // Not new geometry: a roof over a road that already exists. The collision
  // field only calls something blocked within head height of the floor, so a
  // ceiling four metres up costs nothing but voxels.
  tunnel(c, sec) {
    const half = ROAD_HALF + KERB + 10;
    // The crown is GANTRY_H, the same overhead the market hall and every sign
    // gantry clear. It was 62, which put the chase camera (84 x zoom) INSIDE
    // the roof for the full length of both bores — the sodium showpiece
    // rendered as a blank wall unless the player happened to be zoomed all the
    // way in. The rule from gantryOver applies to a roof too: what matters is
    // which side of the beam the camera is on.
    const crown = GANTRY_H - 16;
    for (let s = sec.from + 60; s < sec.to - 60; s += 0.9) {
      const lit = (Math.round(s) % 90) < 30;
      for (let u = -half; u <= half; u++) {
        const a = Math.abs(u);
        const top = Math.round(crown + Math.cos((a / half) * Math.PI * 0.5) * 16);
        c.put(s, u, (x, z, ff, gy) => {
          if (a > half - 5) for (let k = 0; k < top; k++)
            c.w.set(x, gy + k, z, (k >> 2) % 2 ? 'concreteOld' : 'concrete');
          c.w.set(x, gy + top, z, 'concreteOld');
          c.w.set(x, gy + top + 1, z, 'concrete');
          if (lit && a < 4) c.w.set(x, gy + crown + 8, z, 'sodium');
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
        const top = a <= half ? Math.round(crown + Math.cos((a / half) * Math.PI * 0.5) * 16) + 2 : 0;
        c.put(s, u, (x, z, ff, gy) => {
          for (let k = top; k < 134; k++) c.w.set(x, gy + k, z, (k >> 3) % 2 ? 'concrete' : 'concreteOld');
        });
      }
  },

  services(c, sec) {
    c.blit(sec.from + 220, SET + 90, c.pr.services);
    c.put(sec.from + 220, SET + 74, (x, z, ff, gy) => c.anchors.tvs.push([x, gy + 16, z]));
    // the petrol station: a lit canopy you can steer by from half a
    // kilometre out, which is what a services leg is FOR
    c.blit(sec.from + 500, SET + 68, c.pr.petrol);
    c.blit(sec.from + 360, -(SET + 66), c.pr.billboardA);
    // THE OASIS, properly: a tall neon totem you can read from the sweep,
    // and a rank of parked lorries sleeping nose-in — a motorway services
    // at 3am is a lit island with trucks around it, and this one was a shed
    c.put(sec.from + 120, SET + 34, (x, z, ff, gy) => {
      c.w.box(x, gy, z, 3, 64, 3, 'metalDark');
      c.w.box(x - 5, gy + 64, z - 2, 13, 22, 4, 'metalDark');
      c.w.box(x - 4, gy + 66, z - 1, 11, 8, 2, 'neonSign');
      c.w.box(x - 4, gy + 76, z - 1, 11, 8, 2, 'stripLight');
    });
    for (let i = 0; i < 4; i++)
      c.put(sec.from + 320 + i * 76, -(SET + 46), (x, z, ff, gy) => {
        const a2 = c.along(ff) === 'x';
        const W2 = a2 ? 22 : 52, D2b = a2 ? 52 : 22;
        c.w.box(x - (W2 >> 1), gy, z - (D2b >> 1), W2, 4, D2b, 'metalDark');
        c.w.box(x - (W2 >> 1) + 1, gy + 4, z - (D2b >> 1) + 1, W2 - 2, 22, D2b - 2,
          i % 2 ? 'paper' : 'skipSteel');
        c.w.set(x, gy + 8, z, 'tailLight');
      });
    bankRun(c, sec, 26);
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
    // the edge-of-town petrol station, glowing alone in the fields — the one
    // lit thing on the dark last leg, and a marker for the lap's end
    c.blit(sec.to - 140, SET + 44, c.pr.petrol);
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

  // Reflector posts, both verges, the whole lap. The widening pushed the
  // buildings back and quietly took the sense of speed with them — speed is
  // things passing CLOSE, and nothing passed close any more. Delineator posts
  // every ninety voxels give the eye a metronome at the kerb: red caps on the
  // left, white on the right, the way real delineators are handed.
  for (const side of [-1, 1])
    c.run(0, path.total, side * (ROAD_HALF + KERB + 4), 90, (x, z, ff, gy) => {
      w.box(x, gy, z, 1, 7, 1, 'metalDark');
      w.set(x, gy + 7, z, side < 0 ? 'signRed' : 'paper');
    });

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

  // CORNER BOARDS: glowing chevron panels at the entry to every corner
  // tighter than r480, standing on the OUTSIDE of the turn — the wall you
  // would hit is the wall that warns you. Placed from the shape data itself,
  // so a re-tuned corner re-warns without anyone remembering to move a sign.
  for (const sec of SECTIONS) {
    if (!sec.arc || !sec.r || sec.r >= 480) continue;
    const outSide = Math.sign(sec.arc);
    const inDir = -outSide;
    for (const ds of [46, 116]) {
      const at = sec.from - ds;
      if (at < 0) continue;
      for (let du = -12; du <= 12; du++) {
        put(at, outSide * (ROAD_HALF + KERB + 10) + du, (x, z, ff, gy) => {
          if (Math.abs(du) === 12) { w.box(x, gy, z, 1, 9, 1, 'metalDark'); return; }
          for (let py = 0; py <= 12; py++) {
            const v = ((du * inDir + Math.abs(py - 6)) % 9 + 9) % 9;
            if (v < 2) w.set(x, gy + 8 + py, z, 'neonSign');
            else if (v < 4) w.set(x, gy + 8 + py, z, 'signRed');
          }
        });
      }
    }
  }

  // BOOST PADS: four neon chevrons flush with the road. Emissive, so they
  // read from three hundred voxels out at night — a pad you cannot see coming
  // is a trap, not a reward. Flush, so they are paint to the collision field.
  //
  // THE TIP POINTS THE WAY YOU RACE. The first version put the vertex at the
  // LOW-s end with the arms sweeping forward, which is an arrow aimed at
  // oncoming traffic — the playtest read the pads as wrong-way markers. The
  // arms trail BEHIND the tip: subtract the |du| term.
  for (const pd of SPEC.pads || []) {
    const pu = pd.u || 0;
    for (let a2 = 0; a2 < 4; a2++)
      for (let du = -30; du <= 30; du++)
        for (let t2 = 0; t2 < 4; t2++)
          put(pd.s + a2 * 18 - Math.abs(du) * 0.5 + t2, pu + du,
            (x, z, ff, gy) => w.set(x, gy - 1, z, 'neonSign'));
  }

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
  const cf = frame();
  const wagon = new VoxWorld();
  P.wagon(wagon, -11, 0, -25);
  // Every piece of furniture sits at ONE point of the road, at that point's
  // own height. It was all laid out from the hazard's single frame — tangent
  // and normal offsets at one oy — which floated the broken wagon's cone fan
  // over the Docks' falling stern ramp (an unclimbable wall of hovering
  // cones), and swung the works barrier's straight tail across the Parade's
  // last bend, where the racing line wedged on it every lap. Anything that
  // spans road is built in (s, u); the furniture is not an exception.
  const cone = (cs, cu) => {
    path.place(cs, cu, cf);
    S.roadCone(w, Math.round(cf.x), elev(cs) - 2, Math.round(cf.z));
  };
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
      // At 1.15 it takes most of one side and leaves a gap you have to aim
      // for -- ON THE OLD ROADS. After the city-wide widening the same
      // fraction left a four-car gap and the sim called the dark decorative
      // again; 1.45 keeps the gap a genuine aim at every width.
      const span = Math.round(ROAD_HALF * 1.45);
      for (let i = -4; i <= 4; i++) cone(h.s, h.u + i * (span / 8));
      // a tapering run of cones leading in, so it reads as roadworks and gives
      // the gap a shape rather than appearing as a wall
      for (let i = 1; i <= 5; i++) cone(h.s + i * 26, h.u + (span / 2 - i * 9));
      // The barrier fences the dig lengthwise: posts at the ends, rail
      // segments marched along s at each point's own elevation, so it follows
      // the road over a grade and round a bend instead of chording across it.
      for (const d of [-(span >> 1), (span >> 1) - 2]) {
        path.place(h.s + d, h.u, cf);
        w.box(Math.round(cf.x) - 1, elev(h.s + d), Math.round(cf.z) - 1, 2, 12, 2, 'metalDark');
      }
      for (let d = -(span >> 1); d <= (span >> 1); d += 2) {
        path.place(h.s + d, h.u, cf);
        w.box(Math.round(cf.x) - 1, elev(h.s + d) + 9, Math.round(cf.z) - 1, 2, 3, 2,
          ((d >> 3) % 2) ? 'coneOrange' : 'paper');
      }
      // A FLOODLIGHT MAST over the dig — night roadworks have one, it makes
      // the site READ from distance, and it hands the dark legs a landmark
      // without touching the sight mechanic (the glow is local).
      path.place(h.s + (span >> 1) + 14, h.u + Math.sign(h.u) * 18, cf);
      {
        const mx = Math.round(cf.x), mz = Math.round(cf.z), my = elev(h.s);
        w.box(mx, my, mz, 2, 42, 2, 'metalDark');
        w.box(mx - 3, my + 42, mz - 1, 8, 3, 3, 'metalDark');
        w.box(mx - 2, my + 43, mz, 6, 1, 1, 'stripLight');
        w.box(mx - 4, my, mz + 4, 6, 5, 8, 'metalDark');       // the generator
        w.set(mx - 3, my + 5, mz + 5, 'signRed');
      }
    } else if (h.kind === 'skip') {
      // TWO skips end to end. One is 44 voxels on a 216-voxel road: something
      // you steer round without thinking, which is not a hazard, it is scenery.
      const sk = new VoxWorld();
      S.skip(sk, -22, -1, -10);
      for (const off of [-24, 24])
        w.merge(sk, { ox: x + Math.round(f.nx * off), oz: z + Math.round(f.nz * off), oy: gy, rotY: rot });
      for (let i = 1; i <= 4; i++) cone(h.s + i * 24, h.u + 48 + i * 4);
    } else if (h.kind === 'stall') {
      // THE OLD TOWN'S OWN: a market stall pitched in the road — posts, a
      // striped awning at bonnet height, a table of crates — with cones walked
      // out both ways, because a stallholder warns both directions.
      const st = new VoxWorld();
      for (const [px, pz] of [[-16, -11], [13, -11], [-16, 8], [13, 8]])
        st.box(px, 0, pz, 3, 22, 3, 'wood');
      st.box(-19, 22, -13, 38, 2, 26, (bx) => ((bx >> 2) % 2 ? 'plasticRed' : 'shirtCream'));
      st.box(-14, 10, -9, 28, 3, 18, 'woodPale');
      for (let i = 0; i < 3; i++)
        st.box(-11 + i * 9, 13, -6, 7, 5, 7, i % 2 ? 'flowerA' : 'grassDry');
      w.merge(st, { ox: x, oz: z, oy: gy, rotY: alongRot(f.tx, f.tz) });
      for (const d of [-1, 1])
        for (let i = 1; i <= 3; i++) cone(h.s + d * i * 22, h.u + Math.sign(h.u) * -6 * i);
    } else if (h.kind === 'crate') {
      // THE DOCKS' OWN: a container off the back of something, slewed across
      // the lane, its spill strewn around it at each box's own point of road.
      const ct = new VoxWorld();
      const col = hash3(x, 1, z) > 0.5 ? 'doorBlue' : 'doorRed';
      ct.shell(-30, 0, -14, 60, 25, 28, 1, col, { bottom: false });
      for (let i = 2; i < 58; i += 4) ct.box(-30 + i, 2, -15, 2, 21, 1, col);
      ct.box(-26, 8, -16, 14, 6, 1, 'paper');
      w.merge(ct, { ox: x, oz: z, oy: gy, rotY: (alongRot(f.tx, f.tz) + 90) % 360 });
      for (const [ds, du] of [[-40, -22], [-32, 26], [36, -14], [46, 20], [54, -4]]) {
        path.place(h.s + ds, h.u + du, cf);
        w.box(Math.round(cf.x) - 4, elev(h.s + ds), Math.round(cf.z) - 4, 8, 7, 8,
          hash3(ds, du, x) > 0.5 ? 'wood' : 'rust');
      }
      for (let i = 1; i <= 4; i++) cone(h.s + i * 24, h.u + 48 + i * 4);
    } else if (h.kind === 'spill') {
      // THE RING ROAD'S OWN: a shed load on the bypass — cargo scattered over
      // a band of carriageway, every box at its own (s, u) and its own height.
      // Each one is climbable and each one costs; the field is the hazard.
      for (let i = 0; i < 16; i++) {
        const ds = Math.round((hash3(x, i * 3, z) - 0.5) * 170);
        const du = Math.round((hash3(z, i * 7, x) - 0.5) * ROAD_HALF * 0.6);
        path.place(h.s + ds, h.u * 0.4 + du, cf);
        const hgt = 6 + Math.round(hash3(i, x, z) * 6);
        w.box(Math.round(cf.x) - 4, elev(h.s + ds), Math.round(cf.z) - 4, 8, hgt, 8,
          hash3(i, z, x) > 0.6 ? 'plasticRed' : (hash3(i, x, z) > 0.5 ? 'wood' : 'paper'));
      }
      for (let i = 1; i <= 4; i++) cone(h.s - 100 - i * 26, h.u * 0.4);
    } else if (h.kind === 'barrels') {
      // DRUMS OFF A LORRY, and the slick they left. The drums are the wall;
      // the slick is painted into the road surface so the beam reads the
      // dark stain before it reads the drums. Every piece at its own (s, u).
      for (let i = 0; i < 9; i++) {
        const ds = Math.round((hash3(x, i * 5, z) - 0.5) * 64);
        const du = Math.round((hash3(z, i * 11, x) - 0.5) * 58);
        path.place(h.s + ds, h.u + du, cf);
        const bx = Math.round(cf.x), bz = Math.round(cf.z), by = elev(h.s + ds);
        if (hash3(i, x, z) > 0.72) w.box(bx - 5, by, bz - 3, 10, 6, 6, 'rust');  // tipped
        else w.box(bx - 3, by, bz - 3, 7, 12, 7, i % 2 ? 'plasticBlue' : 'rust');
      }
      for (let ds = -34; ds <= 54; ds += 2) for (let du = -36; du <= 36; du += 2) {
        if (hash3(ds, du, x) < 0.45) continue;
        path.place(h.s + ds, h.u + du, cf);
        w.set(Math.round(cf.x), elev(h.s + ds) - 1, Math.round(cf.z), 'rubber');
      }
      // road flares either end of the spill, because rust drums on dark
      // asphalt are a trap without a light to hand the eye
      for (const ds of [-44, 58]) {
        path.place(h.s + ds, h.u, cf);
        w.box(Math.round(cf.x) - 1, elev(h.s + ds), Math.round(cf.z) - 1, 2, 2, 2, 'tailLight');
      }
      for (let i = 1; i <= 4; i++) cone(h.s - 44 - i * 24, h.u - i * 6);
    } else if (h.kind === 'chicane') {
      // ONE stone bollard gate. The chicane is a PAIR of these in the spec,
      // opposite sides, 360 apart — because a single hazard entry hiding a
      // second cluster is invisible to the drivers: the dodge away from the
      // first gate aimed dead at the hidden second one and the whole field
      // hit it every lap at the same spot. Two entries, and the proven
      // per-hazard see-brake-dodge machinery handles the weave.
      for (let i = -1; i <= 1; i++) {
        path.place(h.s, h.u + i * 14, cf);
        const bx = Math.round(cf.x), bz = Math.round(cf.z), by = elev(h.s);
        // 6 wide with a GLOWING cap — the audit found thin dark posts
        // invisible on dark tarmac at night, which for a hazard is a trap
        w.box(bx - 3, by, bz - 3, 6, 10, 6, 'concreteOld');
        w.box(bx - 2, by + 10, bz - 2, 4, 1, 4, 'metalDark');
        w.box(bx - 1, by + 10, bz - 1, 2, 2, 2, 'porchBulb');
      }
      for (let i = 1; i <= 3; i++) cone(h.s - 26 - i * 20, h.u + (i % 2 ? 14 : -14));
    } else {
      // broken down, so it is pointing where it was going, not at the kerb
      w.merge(wagon, { ox: x, oz: z, oy: gy, rotY: alongRot(f.tx, f.tz) });
      // cones fanning out behind it, which is what you actually put out and
      // which widens the thing you have to avoid to something worth avoiding
      for (let i = -3; i <= 3; i++) cone(h.s + 40, h.u + i * 16);
      for (let i = 1; i <= 4; i++) cone(h.s + 40 + i * 22, h.u + i * 12);
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

// Async, with a phase reporter. The build is ten to forty seconds of honest
// work on the widened circuits, and a synchronous build froze the boot screen
// for all of it — indistinguishable from a hang. `onPhase(label, frac)` feeds
// the boot screen; the yields between phases (and inside the mesher) let it
// actually paint.
// Everything about a circuit that is CODE rather than voxels: the module
// globals every helper reads (sections, elevation, road metrics, hazards) and
// the path itself. The builder starts here — and so does the HYDRATOR, which
// receives finished geometry from the build worker and needs the same state
// on the main thread for sectionAt/elev/safeSpot/lifeSpots to mean anything.
export function initTrackState(trackSpec) {
  SPEC = trackSpec;
  setRoad(trackSpec.road);
  setProfile(trackSpec.profile);
  setShape(trackSpec);
  HAZARDS = trackSpec.hazards.map(h => ({ ...h }));
  CROSSINGS = trackSpec.crossings || [];
  PARKED = trackSpec.parked || [];
  const path = buildPath(trackSpec);
  // PEOPLE BELONG WHERE PEOPLE GO. A walker's beat is authored as (s, span)
  // and the spans wandered into tunnels, motorway verges and container
  // yards — places with no footway and no reason to be. Validate against
  // the DISTRICT, structurally, instead of trusting seventeen hand-typed
  // numbers per circuit: an entry whose home is in a no-walk district is
  // dropped, and every beat is clamped so it ends 40 short of the nearest
  // no-walk boundary in each direction.
  const NO_WALK = new Set(['tunnel', 'motorway', 'viaduct', 'wood', 'yard',
    'containers', 'ship', 'sheds', 'mill', 'millyard']);
  const T = path.total;
  const wrapS = (s) => ((s % T) + T) % T;
  const walkable = (s) => { const sec = sectionAt(wrapS(s)); return sec && !NO_WALK.has(sec.district); };
  LIFE = (trackSpec.life || []).map(l => ({
    ...l, u: (l.side || 1) * PAVE_MID,
  })).concat((trackSpec.crossings || []).map((cs, i) => ({
    // the ones who step out in front of you, at the marked crossings
    s: cs, u: i % 2 ? PAVE_MID : -PAVE_MID, cross: true, pace: 30 + i * 4,
  }))).filter((l) => {
    if (!walkable(l.s)) {
      console.warn('life: dropped a walker at s=' + l.s + ' — '
        + sectionAt(wrapS(l.s)).district + ' is not somewhere people walk');
      return false;
    }
    return true;
  }).map((l) => {
    if (l.cross || !l.span) return l;
    let lo = 0, hi = 0;
    while (lo < l.span && walkable(l.s - lo - 20)) lo += 20;
    while (hi < l.span && walkable(l.s + hi + 20)) hi += 20;
    const span = Math.max(40, Math.min(lo, hi) - 40);
    return { ...l, span: Math.min(l.span, span) };
  });
  return path;
}

export async function buildTrack(trackSpec, onPhase) {
  const breathe = (label, frac) => {
    if (onPhase) onPhase(label, frac);
    // MessageChannel, not setTimeout — hidden tabs clamp timers to a second
    return new Promise(r => { const mc = new MessageChannel(); mc.port1.onmessage = r; mc.port2.postMessage(0); });
  };
  const path = initTrackState(trackSpec);

  const t0 = performance.now();
  // Phase timings, because "the build takes twenty seconds" is not actionable
  // and every guess I have made about where voxel time goes has been wrong.
  const marks = [];
  let last = t0;
  const mark = (name) => { const n = performance.now(); marks.push([name, Math.round(n - last)]); last = n; };

  const w = new VoxWorld();
  const anchors = { lamps: [], stacks: [], tvs: [] };
  await breathe('surveying the route', 0.02);
  const protos = prototypes();
  mark('prototypes');
  await breathe('laying the road', 0.06);
  ribbon(w, path);
  mark('ribbon');
  await breathe('raising the town', 0.2);
  dress(w, path, anchors, protos);
  mark('districts');
  await breathe('dressing the street', 0.34);
  parked(w, path);
  hazards(w, path);
  landmarks(w, path);
  mark('props');

  // THE CARRIAGEWAY IS CLEAR BY CONSTRUCTION, NOT JUST BY REPORT.
  //
  // "Anything solid inside the painted road is a bug, every time, with no
  // exceptions to argue about" — so stop arguing and delete it. Districts
  // place from prototypes, world-axis fields and quarter-turn blits, and
  // after the city-wide widening the cross-section can exceed a tight arc's
  // radius, where inside offsets fold past the arc's centre and land their
  // props anywhere (a graveyard planted itself across the Parade). Every
  // class of that bug ends here: any column rising 4–28 over the road inside
  // the carriageway, outside a hazard's footprint, is scrubbed — and COUNTED,
  // because a scrub that hides leaks silently would teach us to stop fixing
  // the placements themselves. Legitimate overheads (gantries at 112, tunnel
  // crowns, the gatehouse vault, tree canopies at 30+) sit above the band.
  {
    // Sampled at 3-voxel pitch with strided height probes, and the cut covers
    // the sampling cell — the exhaustive version cost five seconds of build
    // for the same catches (nothing that matters to a car is under 3 voxels
    // across, and the strided probes still hit anything 3+ thick in the band).
    let scrubbed = 0;
    const sf = frame();
    for (let s = 0; s < path.total; s += 3) {
      const road = elev(s);
      for (let u = -ROAD_HALF; u <= ROAD_HALF; u += 3) {
        if (HAZARDS.some(h => Math.abs(h.s - s) < h.r + 170 && Math.abs(h.u - u) < h.r + 170)) continue;
        path.place(s, u, sf);
        const x = Math.round(sf.x), z = Math.round(sf.z);
        // every k, no stride: a one-voxel-thick plate at exactly the skipped
        // height defeated two strided versions of this probe in a row. The
        // outer rim probes HIGHER too — a garden wall with a hedge on top
        // straddled the edge with its greenery above the normal band, and a
        // legitimate canopy never hangs this close to the kerb.
        const top = Math.abs(u) > ROAD_HALF - 22 ? 44 : 28;
        for (let k = 3; k < top; k++) {
          if (w.get(x, road + k, z)) { w.cut(x - 2, road + 3, z - 2, 5, top - 3, 5); scrubbed++; break; }
        }
      }
    }
    if (scrubbed) console.warn('track: scrubbed ' + scrubbed + ' intruding columns out of the '
      + 'carriageway — some district is still leaking props onto the road');
  }

  // RAMPS, built AFTER the scrub on purpose: a ramp is exactly the shape the
  // scrub exists to delete — a solid mass rising over the carriageway — and
  // it is the one thing on the road that is meant to be there. A wedge 40
  // long rising to a 13-voxel lip: drive it at speed and the launch comes
  // from the physics (see car.js AIR), drive round it and it costs nothing —
  // it is 64 wide on roads at least 260, so taking it is a CHOICE.
  //
  // 13, not 16: FLOOR_MAX is 14, so any column taller than that over its own
  // base stops being a floor and becomes a wall — a 16-high lip left the last
  // five columns of the ramp as a barrier the car parked against, at the top,
  // for ever. The launch energy comes from the SLOPE, not the lip height.
  {
    const rf = frame();
    for (const rp of SPEC.ramps || []) {
      const RW = 32, RL = 40, RH = 13;
      for (let d2 = 0; d2 <= RL; d2++) {
        const h = Math.round((d2 / RL) * RH);
        for (let du = -RW; du <= RW; du++) {
          path.place(rp.s + d2, (rp.u || 0) + du, rf);
          const x = Math.round(rf.x), z = Math.round(rf.z), gy = elev(rp.s + d2);
          const edge = Math.abs(du) > RW - 3;
          for (let k = 0; k <= h; k++)
            w.set(x, gy - 1 + k, z,
              k === h ? (edge ? 'coneOrange' : ((d2 % 12) < 3 ? 'stripLight' : 'metalDark')) : 'metal');
        }
      }
      // NO decoration past the lip: a floating warning band there put voxels
      // in the 14–16 band of the landing columns, which the head rule reads
      // as a wall — the car climbed the ramp and stopped dead at the top.
      // The lip's own stripLight rows are the warning.
    }
  }

  // THE GROUNDING AUDIT. The relief pass made every circuit hillier, and a
  // prop anchored at one height on sloping ground floats at its far end.
  // Sample the prop band beside the road; any column whose LOWEST voxel
  // hangs 4–20 above the local surface is a floating prop (higher is a
  // legitimate overhead — bunting, gantries, canopies). Counted per
  // district, because the count tells you which BUILDER to fix.
  {
    const gf = frame();
    let floats = 0, softFloats = 0;
    const byDist = {}, byMat = {};
    // ground-cover carpets (an allotment's dirt, a copse's litter) float
    // SOFTLY on slopes — a few voxels, far from the kerb, invisible at
    // night. They are counted apart so the hard count stays actionable.
    const SOFT = new Set(['dirt', 'grass', 'grassDry', 'leafLitter', 'gravel']);
    for (let s = 0; s < path.total; s += 6) {
      const gy = GROUND_Y + elev(s);
      for (const side of [-1, 1]) for (let u = ROAD_HALF + 6; u <= SET + 60; u += 6) {
        path.place(s, side * u, gf);
        const x = Math.round(gf.x), z = Math.round(gf.z);
        let lowest = null, mat = null;
        for (let k = 1; k <= 20; k++) { const v = w.get(x, gy + k, z); if (v) { lowest = k; mat = v; break; } }
        // tree canopies HANG — that is what a canopy is. Everything else
        // hanging is a prop that lost its ground.
        if (lowest !== null && lowest >= 4 && mat !== 'leafDark' && mat !== 'leafMid'
            && !w.get(x, gy, z) && !w.get(x, gy - 1, z)) {
          if (SOFT.has(mat)) { softFloats++; continue; }
          floats++;
          const d2 = sectionAt(s).district;
          byDist[d2] = (byDist[d2] || 0) + 1;
          byMat[mat] = (byMat[mat] || 0) + 1;
        }
      }
    }
    if (floats > 20) console.warn('track: grounding audit — ' + floats
      + ' floating prop columns beside the road (' + softFloats + ' soft ground patches, judged tolerable): '
      + JSON.stringify(byDist) + ' materials: ' + JSON.stringify(byMat));
  }


  const group = new THREE.Group();
  group.name = 'track';
  await breathe('grading the land', 0.4);
  // solidBelow gives contact AO at the LOWEST point the ground reaches;
  // noFloorBelow only culls undersides down there too, so a raised stretch
  // keeps its underside and reads as an embankment instead of a hole to the sky.
  group.add(surround(path));
  mark('surround');
  group.add(await meshChunksAsync(w, PALETTE, {
    name: 'track', size: 192,
    solidBelow: ELEV_MIN - 2, noFloorBelow: ELEV_MIN + GROUND_Y - 1,
  }, (frac) => { if (onPhase) onPhase('meshing the circuit', 0.42 + frac * 0.52); }));

  mark('mesh');
  await breathe('walking the kerbs', 0.96);

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
    // The window scales with the road: the works barrier runs span/2 =
    // 0.575 x ROAD_HALF along s, and a fixed 160 was one voxel too tight the
    // moment the city widened.
    const win = Math.max(160, ROAD_HALF * 0.6 + 40);
    // ramps are deliberate 16-high masses on the road; the audit must not
    // report the one thing that is supposed to be there
    const rampsAt = (SPEC.ramps || []).map(r => r.s);
    const rogue = blockers.filter(([s]) => ![...hz].some(h => Math.abs(h - s) < win)
      && !rampsAt.some(rs => s >= rs - 24 && s <= rs + 90));
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


// ------------------------------------------------- the worker's two halves
// serializeTrack runs IN THE WORKER: it strips a built track down to what
// cannot be recomputed — the geometry buffers, the walk field, the anchors —
// as transferable typed arrays, so the payload crosses threads without a
// copy. hydrateTrack runs on the MAIN THREAD: it re-establishes the module
// state from the spec (cheap) and rebuilds THREE meshes around the
// transferred buffers (also cheap — the expensive part already happened).
export function serializeTrack(track) {
  const meshes = [];
  const transfer = new Set();
  track.group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const kind = o.name === 'surround' ? 'surround' : (o.name.endsWith(':glow') ? 'glow' : 'matte');
    const pos = g.getAttribute('position').array;
    const nrm = g.getAttribute('normal') ? g.getAttribute('normal').array : null;
    const col = g.getAttribute('color') ? g.getAttribute('color').array : null;
    const idx = g.getIndex();
    let ind = idx ? idx.array : null;
    // surround's index comes from setIndex(plainArray) — normalise to typed
    if (ind && !(ind instanceof Uint32Array || ind instanceof Uint16Array)) ind = new Uint32Array(ind);
    meshes.push({ kind, pos, nrm, col, ind });
    transfer.add(pos.buffer);
    if (nrm) transfer.add(nrm.buffer);
    if (col) transfer.add(col.buffer);
    if (ind) transfer.add(ind.buffer);
  });
  const f = track.field;
  transfer.add(f.floor.buffer);
  transfer.add(f.blocked.buffer);
  const payload = {
    meshes,
    field: { x0: f.x0, z0: f.z0, w: f.w, d: f.d, floor: f.floor, blocked: f.blocked },
    anchors: track.anchors,
    hazards: track.hazards,
    voxels: track.voxels,
    buildMs: track.buildMs,
    grade: track.grade,
    phases: track.phases,
  };
  return { payload, transfer: [...transfer] };
}

export function hydrateTrack(trackSpec, p) {
  const path = initTrackState(trackSpec);
  // keep the worker's annotated hazards (x, z filled in by hazards())
  HAZARDS = p.hazards;
  const group = new THREE.Group();
  group.name = 'track';
  // A circuit's attribute arrays are ~2.5GB of JS heap, and nothing on the
  // main thread ever reads them — collision is the walkField, the map is the
  // path, the sim never touches a mesh. So every attribute frees its CPU copy
  // the moment the GPU has it, which is the difference between a session that
  // can swap circuits all night and one that dies of ArrayBuffer OOM on the
  // third build. Bounds are computed up front, while the positions still exist.
  const free = (att) => { att.onUpload(function () { this.array = null; }); return att; };
  for (const m of p.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    if (m.nrm) g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
    else g.computeVertexNormals();
    if (m.col) g.setAttribute('color', free(new THREE.BufferAttribute(m.col, 3)));
    if (m.ind) g.setIndex(free(new THREE.BufferAttribute(m.ind, 1)));
    g.computeBoundingSphere();
    free(g.getAttribute('position'));
    if (g.getAttribute('normal')) free(g.getAttribute('normal'));
    let mesh;
    if (m.kind === 'surround') {
      mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: 0x232a20, roughness: 1, metalness: 0, side: THREE.DoubleSide, flatShading: true,
      }));
      mesh.name = 'surround';
    } else if (m.kind === 'glow') {
      mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
      mesh.name = 'track:glow';
    } else {
      mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.94, metalness: 0.0,
      }));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = 'track:matte';
    }
    group.add(mesh);
  }
  const start = frame();
  path.at(80, start);
  return {
    group, path, field: p.field, anchors: p.anchors, hazards: HAZARDS, elev,
    grade: p.grade, spec: trackSpec, id: trackSpec.id, name: trackSpec.name,
    roadHalf: ROAD_HALF, sections: SECTIONS, traffic: trackSpec.traffic || [],
    start: { x: start.x, z: start.z, heading: Math.atan2(start.tx, start.tz) },
    voxels: p.voxels, buildMs: p.buildMs, phases: p.phases,
    chunks: p.meshes.length, lapLength: path.total,
  };
}
