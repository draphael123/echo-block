// Traffic.
//
// Two cars on a loop, one lane each way. They are the only thing in the scene
// that moves fast, which is most of why they are here: a street where the
// brightest light never sweeps reads as a photograph, and a pair of headlights
// crossing the frame every twenty seconds makes it read as a place.
//
// Each car is one voxel model meshed once and shared — the matte/glow split
// means the tail lights and headlight lenses come out emissive for free.
import * as THREE from 'three';
import { VoxWorld, meshWorld } from './voxel.js';
import { PALETTE } from './palette.js';
import { ROAD, GROUND } from './block.js';

// Built facing +X, sitting on y=0 (the road surface).
function sedan(w, body, roof) {
  const L = 52, W = 22, sill = 6;
  w.box(0, sill, 0, L, 8, W, body);
  w.box(2, sill + 8, 1, L - 4, 1, W - 2, body);
  const cz = 12, cL = L - 26;
  w.box(cz, sill + 9, 3, cL, 9, W - 6, 'carGlass');
  w.box(cz, sill + 9, 3, 1, 9, W - 6, body);
  w.box(cz + cL - 1, sill + 9, 3, 1, 9, W - 6, body);
  w.box(cz, sill + 9, 3, cL, 9, 1, body);
  w.box(cz, sill + 9, W - 4, cL, 9, 1, body);
  w.box(cz - 1, sill + 18, 2, cL + 2, 2, W - 4, roof);
  w.box(2, sill + 8, 2, 10, 2, W - 4, body);                 // boot
  w.box(L - 12, sill + 8, 2, 10, 2, W - 4, body);            // bonnet
  w.box(-1, sill, -1, 2, 4, W + 2, 'carTrim');               // bumpers
  w.box(L - 1, sill, -1, 2, 4, W + 2, 'carTrim');
  w.box(0, sill + 3, 1, 1, 3, 5, 'tailLight');
  w.box(0, sill + 3, W - 6, 1, 3, 5, 'tailLight');
  w.box(L - 1, sill + 4, 2, 1, 3, 5, 'headLight');
  w.box(L - 1, sill + 4, W - 7, 1, 3, 5, 'headLight');
  for (const wx of [8, L - 16]) for (const wz of [-1, W - 2]) {
    for (let k = -5; k <= 5; k++) for (let j = -5; j <= 5; j++) {
      const d = Math.hypot(k, j);
      if (d > 5) continue;
      for (let i = 0; i < 3; i++)
        w.set(wx + k, 5 + j, wz + i, d < 2.4 ? 'chrome' : 'rubber');
    }
    w.cut(wx - 6, 11, wz - 1, 13, 4, 4);
  }
  return { L, W };
}

function pickup(w, body) {
  const L = 56, W = 23, sill = 8;
  w.box(0, sill, 0, L, 9, W, body);
  const cz = L - 26, cL = 18;
  w.box(cz, sill + 9, 2, cL, 11, W - 4, body);
  w.box(cz + 1, sill + 12, 1, cL - 2, 7, 1, 'carGlass');
  w.box(cz + 1, sill + 12, W - 2, cL - 2, 7, 1, 'carGlass');
  w.box(cz, sill + 12, 3, 1, 7, W - 6, 'carGlass');
  w.box(cz + cL - 1, sill + 12, 3, 1, 7, W - 6, 'carGlass');
  w.box(cz - 1, sill + 20, 1, cL + 2, 2, W - 2, 'carTrim');
  // the bed, open, with something in it
  w.box(2, sill + 9, 1, cz - 4, 6, 1, body);
  w.box(2, sill + 9, W - 2, cz - 4, 6, 1, body);
  w.box(2, sill + 9, 1, 1, 6, W - 2, body);
  w.box(6, sill + 9, 4, 12, 5, 12, 'wood');
  w.box(-1, sill + 1, -1, 2, 4, W + 2, 'carTrim');
  w.box(L - 1, sill + 1, -1, 2, 4, W + 2, 'carTrim');
  w.box(0, sill + 4, 2, 1, 3, 5, 'tailLight');
  w.box(0, sill + 4, W - 7, 1, 3, 5, 'tailLight');
  w.box(L - 1, sill + 5, 2, 1, 4, 6, 'headLight');
  w.box(L - 1, sill + 5, W - 8, 1, 4, 6, 'headLight');
  for (const wx of [9, L - 17]) for (const wz of [-1, W - 2]) {
    for (let k = -6; k <= 6; k++) for (let j = -6; j <= 6; j++) {
      const d = Math.hypot(k, j);
      if (d > 6) continue;
      for (let i = 0; i < 3; i++)
        w.set(wx + k, 6 + j, wz + i, d < 2.6 ? 'chrome' : 'rubber');
    }
    w.cut(wx - 7, 13, wz - 1, 15, 5, 4);
  }
  return { L, W };
}

const MODELS = [
  { build: (w) => sedan(w, 'carBody', 'carTrim'), speed: 62 },
  { build: (w) => pickup(w, 'sidingB'), speed: 54 },
  { build: (w) => sedan(w, 'doorBlue', 'sidingBdark'), speed: 70 },
];

const X0 = -520, X1 = 420;                   // spawn/despawn, well off-frame

export function buildTraffic(scene) {
  const group = new THREE.Group();
  group.name = 'traffic';
  scene.add(group);

  const lanes = [
    { z: ROAD.z0 + 17, dir: 1 },             // left to right
    { z: ROAD.z1 - 40, dir: -1 },            // right to left
  ];

  const cars = MODELS.slice(0, 2).map((m, i) => {
    const w = new VoxWorld();
    const { L, W } = m.build(w);
    // solidBelow so the underside is not drawn, and the wheels get contact AO
    const mesh = meshWorld(w, PALETTE, { name: 'car' + i, solidBelow: -1 });

    const lane = lanes[i % lanes.length];
    const pivot = new THREE.Group();
    // the model is authored facing +X from its own origin; centre it so the
    // 180-degree turn for the other lane pivots about the middle of the car
    mesh.position.set(-L / 2, 0, -W / 2);
    pivot.add(mesh);
    pivot.rotation.y = lane.dir > 0 ? 0 : Math.PI;
    const root = new THREE.Group();
    root.add(pivot);
    root.position.set(lane.dir > 0 ? X0 : X1, 0, lane.z + W / 2);
    group.add(root);

    // headlights: one spot per car, no shadow. This is the only light in the
    // scene that moves, so it does a lot of work for very little.
    const beam = new THREE.SpotLight(0xfff0cc, 120000, 260, 0.52, 0.6, 2);
    beam.position.set(lane.dir * (L / 2 - 2), 9, 0);
    const tgt = new THREE.Object3D();
    tgt.position.set(lane.dir * 200, -14, 0);
    root.add(tgt, beam);
    beam.target = tgt;

    return {
      root, beam, lane, L, W, speed: m.speed,
      gap: 6 + i * 11,                        // stagger so they never pair up
      wait: i * 7,
    };
  });

  function update(dt) {
    if (!group.visible) return;
    for (const c of cars) {
      if (c.wait > 0) { c.wait -= dt; c.root.visible = false; continue; }
      c.root.visible = true;
      c.root.position.x += c.lane.dir * c.speed * dt;
      const done = c.lane.dir > 0 ? c.root.position.x > X1 : c.root.position.x < X0;
      if (done) {
        c.root.position.x = c.lane.dir > 0 ? X0 : X1;
        c.wait = c.gap;                       // a gap, not a conveyor belt
        c.root.visible = false;
      }
    }
  }

  // Cars are NOT solid to the player any more. Being unable to step in front
  // of one is the same as never being hit by one, and the road should have a
  // consequence rather than an invisible wall.
  function hits(x, z) {
    for (const c of cars) {
      if (!c.root.visible) continue;
      const dx = Math.abs(x - c.root.position.x), dz = Math.abs(z - c.root.position.z);
      if (dx < c.L / 2 + 4 && dz < c.W / 2 + 5) return c;
    }
    return null;
  }

  // How close the nearest car is, for the near-miss rumble in main.js.
  function nearest(x, z) {
    let best = Infinity;
    for (const c of cars) {
      if (!c.root.visible) continue;
      best = Math.min(best, Math.hypot(x - c.root.position.x, z - c.root.position.z));
    }
    return best;
  }

  return { group, cars, update, hits, nearest, lightCount: cars.length };
}

export const ROAD_MID = (ROAD.z0 + ROAD.z1) / 2;
export const KERB_Y = GROUND;
