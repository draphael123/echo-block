// The first track: a 300-metre sprint out of the estate.
//
// It is NOT a lap. At 9.7 m/s a sixty-second lap is 580 metres — about eight
// of the hub blocks — and building that before knowing whether the look
// survives speed would be building the expensive thing first. This is a
// straight, two corners and one stretch with the streetlights deliberately
// absent, which is the least track that can answer the three questions.
//
// Everything is placed in track coordinates (s along, u across) rather than
// world x/z, so moving a corner does not move forty other things by hand.
import * as THREE from 'three';
import { VoxWorld, meshWorld, hash3 } from '../voxel.js';
import { PALETTE } from '../palette.js';
import { FLOOR_MAX, HEAD } from '../walk.js';
import * as P from '../props.js';
import * as S from '../street.js';
import { Path, frame } from './path.js';

export const ROAD_HALF = 40;          // 80 voxels ~ 6.4m of carriageway
const KERB = 5;                       // taller than the walk step: a real kerb
const VERGE = 24;
const APRON = 24;                     // dark ground beyond, so there is no void
export const GROUND_Y = 2;            // verge height; the road sits at -1

// The sections. The dark one is the whole point of the track.
export const SECTIONS = [
  { from: 0,    to: 1100, lit: true,  name: 'the estate' },
  { from: 1100, to: 1520, lit: true,  name: 'the bend' },
  { from: 1520, to: 2420, lit: false, name: 'the back road' },
  { from: 2420, to: 2790, lit: false, name: 'the second bend' },
  { from: 2790, to: 3790, lit: true,  name: 'the run in' },
];
export const isLit = (s) => (SECTIONS.find(x => s >= x.from && s < x.to) || SECTIONS[0]).lit;

export function buildPath() {
  return new Path(0, 0, 180)
    .straight(1100)
    .arc(-88, 270)          // right, out of the estate
    .straight(900)          // the back road, unlit
    .arc(64, 330)           // left, back toward the houses
    .straight(1000)
    .build();
}

// ---------------------------------------------------------------- surface
function ribbon(w, path) {
  const f = frame();
  const half = ROAD_HALF;
  // 0.65 rather than 1: on the OUTSIDE of a corner the ribbon stretches, so
  // a one-voxel step along the centreline leaves pinholes in the surface
  // that a body's probe ring finds even when a coarse sample says the road
  // is solid. Over-covering is cheap; the Map de-duplicates.
  for (let s = 0; s <= path.total; s += 0.65) {
    path.at(s, f);
    const lit = isLit(s);
    for (let u = -(half + KERB + VERGE + APRON); u <= half + KERB + VERGE + APRON; u += 1) {
      const x = Math.round(f.x + f.nx * u), z = Math.round(f.z + f.nz * u);
      const a = Math.abs(u), r = hash3(x, 0, z);

      if (a <= half) {                                   // carriageway
        let c = r > 0.86 ? 'asphaltWorn' : (r < 0.10 ? 'asphaltPatch' : 'asphalt');
        if (a > half - 3) c = 'asphaltPatch';            // gutters
        // a centre line, dashed, so speed is legible
        if (a < 2 && (s % 60) < 34) c = 'roadLine';       // eslint-disable-line
        w.set(x, -1, z, c);
      } else if (a <= half + KERB) {                     // kerb
        for (let y = -1; y <= GROUND_Y; y++)
          w.set(x, y, z, y === GROUND_Y ? 'curb' : 'concreteOld');
      } else if (a <= half + KERB + VERGE) {             // verge
        w.set(x, GROUND_Y, z, r > 0.84 ? 'grassDry' : (r < 0.04 ? 'dirt' : 'grass'));
      } else {                                           // apron, unlit ground
        if ((x + z) % 3) continue;                       // sparse: it is never seen up close
        w.set(x, GROUND_Y, z, lit ? 'grass' : 'leafDark');
      }
    }
  }
}

// ---------------------------------------------------------------- dressing
function dress(w, path, anchors) {
  const f = frame();
  const put = (s, u, fn) => { path.place(s, u, f); fn(Math.round(f.x), Math.round(f.z)); };

  // Streetlights only where the section says lit. Their absence IS the level
  // design on the back road — the dynamo has nothing to lean on there.
  for (const sec of SECTIONS) {
    if (!sec.lit) continue;
    for (let s = sec.from + 120; s < sec.to - 60; s += 330) {
      const side = ((s / 330) | 0) % 2 ? 1 : -1;
      put(s, side * (ROAD_HALF + KERB + 12), (x, z) => {
        anchors.lamps.push(P.streetLamp(w, x, GROUND_Y, z, 54, -side * 16));
      });
    }
  }

  // Houses and fences along the lit stretches; trees and hedges along the dark
  // one, close enough to the kerb that the verge feels narrow at speed.
  // Spacing is a COST decision as much as a look one: a roadside house is a
  // silhouette, and at 48 voxels deep and one every 74 they came to 6.9M voxels
  // and an 11-second build on their own.
  for (let s = 60; s < path.total - 60; s += 112) {
    const lit = isLit(s);
    const r = hash3(s, 3, 7);
    for (const side of [-1, 1]) {
      const edge = side * (ROAD_HALF + KERB + VERGE - 4);
      if (lit) {
        if (r > 0.55) put(s, edge + side * 40, (x, z) => {
          const wid = 70 + Math.round(hash3(s, side, 1) * 40);
          const h = 34 + Math.round(hash3(s, side, 2) * 20);
          w.box(x - (wid >> 1), GROUND_Y, z - 4, wid, h, 9, 'hillFar');
          w.gable(x - (wid >> 1), GROUND_Y + h, z - 4, wid, 9, 'hillFar', { eave: 2, thick: 3 });
          if (hash3(s, side, 5) > 0.5)
            w.box(x - 4, GROUND_Y + 12 + Math.round(hash3(s, side, 6) * 14), z + 4, 8, 9, 1,
              hash3(s, side, 7) > 0.6 ? 'winWarmDim' : 'winWarm');
        });
        else put(s, edge, (x, z) => P.picketFence(w, x, GROUND_Y, z, 60, 'z'));
      } else {
        put(s, edge + side * 6, (x, z) => {
          if (r > 0.4) P.tree(w, x, GROUND_Y, z, 40 + Math.round(r * 18), 15 + Math.round(r * 8));
          else P.hedge(w, x - 12, GROUND_Y, z - 12, 24, 24, 11, 'x');
        });
      }
    }
  }

  // start and finish gantries, so both ends of the track are unmistakable
  for (const [s, colour] of [[40, 'shelterTube'], [path.total - 60, 'neonSign']]) {
    for (const side of [-1, 1])
      put(s, side * (ROAD_HALF + 3), (x, z) => w.box(x - 2, GROUND_Y, z - 2, 4, 62, 4, 'metalDark'));
    put(s, 0, (x, z) => {
      w.box(x - ROAD_HALF - 3, GROUND_Y + 58, z - 2, ROAD_HALF * 2 + 6, 6, 4, 'metalDark');
      w.box(x - ROAD_HALF + 4, GROUND_Y + 60, z - 3, ROAD_HALF * 2 - 8, 2, 1, colour);
    });
    // a painted line on the road
    for (let u = -ROAD_HALF; u <= ROAD_HALF; u++)
      put(s, u, (x, z) => { w.set(x, -1, z, ((u >> 2) % 2) ? 'roadLine' : 'asphaltPatch'); });
  }
}

// ---------------------------------------------------------------- hazards
// The reason the lamp matters. Most of them live on the back road, where the
// only thing that will show you one is how hard you have been pedalling.
// Placement is a balance decision, not decoration. A hazard parked out at
// u=+/-24 can be passed on the centre line without steering at all, which
// makes it scenery — the ones on the back road sit near the middle so they
// have to be SEEN and avoided, and the ones in the lit sections sit wide
// so the lit stretches stay flat out.
export const HAZARDS = [
  { s: 620,  u: 24,  r: 12, kind: 'bin' },
  { s: 900,  u: -26, r: 12, kind: 'bin' },
  { s: 1290, u: 22,  r: 14, kind: 'cones' },
  { s: 1660, u: -26, r: 15, kind: 'car' },
  { s: 1820, u: 12,  r: 12, kind: 'bin' },
  { s: 1970, u: -8,  r: 14, kind: 'cones' },
  { s: 2130, u: 26,  r: 15, kind: 'car' },
  { s: 2290, u: -12, r: 12, kind: 'bin' },
  { s: 2450, u: 8,   r: 14, kind: 'cones' },
  { s: 2620, u: -14, r: 12, kind: 'bin' },
  { s: 3010, u: -26, r: 12, kind: 'bin' },
  { s: 3320, u: 26,  r: 15, kind: 'car' },
];

function hazards(w, path) {
  const f = frame();
  for (const h of HAZARDS) {
    path.place(h.s, h.u, f);
    const x = Math.round(f.x), z = Math.round(f.z);
    h.x = x; h.z = z;
    if (h.kind === 'bin') {
      P.trashBin(w, x, -1, z, { lidOff: hash3(x, 1, z) > 0.5 });
    } else if (h.kind === 'cones') {
      for (let i = -1; i <= 1; i++) S.roadCone(w, x + i * 9, -2, z + i * 5);
      S.barrier(w, x - 12, -1, z + 8, 24);
    } else {
      P.wagon(P.transposeXZ(w), z - 11, -3, x - 24);
    }
  }
}

// Where to put someone back after they have come off. Assuming 'a bit
// further back on the centreline' is clear is exactly how a crash turns
// into a permanent stop: the thing you hit is usually still there, and a
// barrier laid out in world axes sprawls across the racing line on a bend.
// So ASK the collision field rather than assuming.
export function safeSpot(path, ground, fromS) {
  const f = frame();
  for (let back = 14; back < 260; back += 10) {
    const s = Math.max(0, fromS - back);
    for (const u of [0, -16, 16, -26, 26]) {
      path.place(s, u, f);
      // Must be on the CARRIAGEWAY. Asking only "can a body stand here" is
      // satisfied by standing on top of the barrier you just hit — canStand is
      // relative to whatever height you hand it, so it says yes to anything if
      // you hand it the height of the obstacle.
      const fl = ground.ceilingAt(f.x, f.z);
      if (fl <= 0 && !ground.isBlocked(f.x, f.z) && ground.canStand(f.x, f.z, fl)) {
        return { x: f.x, z: f.z, heading: Math.atan2(f.tx, f.tz), s };
      }
    }
    if (s === 0) break;
  }
  return null;
}

// ---------------------------------------------------------------- assemble
export function buildTrack() {
  const t0 = performance.now();
  const path = buildPath();
  const w = new VoxWorld();
  const anchors = { lamps: [] };
  ribbon(w, path);
  dress(w, path, anchors);
  hazards(w, path);

  const group = new THREE.Group();
  group.name = 'track';
  group.add(meshWorld(w, PALETTE, { name: 'track', solidBelow: -2, noFloorBelow: GROUND_Y - 1 }));

  // Derive the collision box from the PATH, never by hand. Hardcoding it meant
  // the last third of the track had no field under it at all, and a rider who
  // reaches the edge of a walk field just stops dead with nothing logged.
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (let i = 0; i < path.points.length; i += 2) {
    bx0 = Math.min(bx0, path.points[i]); bx1 = Math.max(bx1, path.points[i]);
    bz0 = Math.min(bz0, path.points[i + 1]); bz1 = Math.max(bz1, path.points[i + 1]);
  }
  const pad = ROAD_HALF + KERB + VERGE + APRON + 60;
  const field = w.walkField(
    Math.floor(bx0 - pad), Math.ceil(bx1 + pad),
    Math.floor(bz0 - pad), Math.ceil(bz1 + pad), FLOOR_MAX, HEAD);
  const start = frame();
  path.at(90, start);

  return {
    group, path, field, anchors, hazards: HAZARDS,
    start: { x: start.x, z: start.z, heading: Math.atan2(start.tx, start.tz) },
    voxels: w.size,
    buildMs: Math.round(performance.now() - t0),
  };
}
