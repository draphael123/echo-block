// Atmosphere: the things that move when nothing is happening.
//
// A street where only the player and the cars move reads as a held breath.
// None of this is interactive and none of it is expensive — leaves on the
// wind, smoke off two chimneys, a cat with somewhere to be, and a sign with a
// bad tube in it. Between them they are most of the difference between a set
// and a place.
import * as THREE from 'three';
import { VoxWorld, meshWorld } from './voxel.js';
import { PALETTE } from './palette.js';

// ------------------------------------------------------------------ leaves
// Points, not quads: at this distance a leaf is two or three pixels, and the
// only thing that matters is that it TUMBLES rather than falling straight.
export function buildLeaves(count, bounds) {
  const pos = new Float32Array(count * 3);
  const seed = [];
  for (let i = 0; i < count; i++) {
    seed.push({
      x: bounds.x0 + Math.random() * (bounds.x1 - bounds.x0),
      z: bounds.z0 + Math.random() * (bounds.z1 - bounds.z0),
      y: 4 + Math.random() * 90,
      fall: 5 + Math.random() * 9,
      swirl: 5 + Math.random() * 14,
      rate: 0.5 + Math.random() * 1.4,
      phase: Math.random() * 6.28,
      drift: 3 + Math.random() * 7,
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x7a5a34, size: 1.7, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'leaves';

  return {
    points,
    update(t, dt) {
      if (!points.visible) return;
      for (let i = 0; i < count; i++) {
        const s = seed[i];
        s.y -= s.fall * dt;
        if (s.y < 1) {                                  // land, then blow away
          s.y = 70 + Math.random() * 40;
          s.x = bounds.x0 + Math.random() * (bounds.x1 - bounds.x0);
          s.z = bounds.z0 + Math.random() * (bounds.z1 - bounds.z0);
        }
        const a = t * s.rate + s.phase;
        // NOT (t * drift) % 60 — a modulo here makes the leaf teleport
        // sideways every time it wraps. A slow sine is the wind.
        pos[i * 3] = s.x + Math.cos(a) * s.swirl + Math.sin(t * 0.11 + s.phase) * s.drift * 2.2;
        pos[i * 3 + 1] = s.y;
        pos[i * 3 + 2] = s.z + Math.sin(a * 0.7) * s.swirl;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------- smoke
// A slow column that widens and thins as it climbs. Two chimneys is plenty —
// a street where every house is smoking reads as a fire, not a cold night.
export function buildSmoke(sources, perSource = 26) {
  const count = sources.length * perSource;
  const pos = new Float32Array(count * 3);
  const puff = [];
  for (let s = 0; s < sources.length; s++)
    for (let i = 0; i < perSource; i++)
      puff.push({ src: sources[s], age: (i / perSource) * 6, life: 6 + Math.random() * 2,
                  sway: Math.random() * 6.28, rate: 0.4 + Math.random() * 0.5 });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x39435a, size: 5.5, sizeAttenuation: true,
    transparent: true, opacity: 0.30, depthWrite: false, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'smoke';

  return {
    points,
    update(t, dt) {
      if (!points.visible) return;
      for (let i = 0; i < puff.length; i++) {
        const p = puff[i];
        p.age += dt;
        if (p.age > p.life) p.age -= p.life;
        const k = p.age / p.life;
        pos[i * 3] = p.src[0] + Math.sin(t * p.rate + p.sway) * (2 + k * 16);
        pos[i * 3 + 1] = p.src[1] + k * 46;
        pos[i * 3 + 2] = p.src[2] + Math.cos(t * p.rate * 0.7 + p.sway) * (2 + k * 12);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// --------------------------------------------------------------------- cat
// Paces a fence line, stops, looks at you, carries on. The one thing on the
// street that does not care that you are there.
export function buildCat(a, b, y) {
  const w = new VoxWorld();
  w.box(-2, 3, -5, 4, 4, 11, 'catFur');            // body
  w.box(-2, 6, 4, 4, 4, 4, 'catFur');              // head
  w.box(-2, 9, 5, 1, 2, 1, 'catFur');              // ears
  w.box(1, 9, 5, 1, 2, 1, 'catFur');
  w.set(-1, 8, 8, 'winWarm'); w.set(1, 8, 8, 'winWarm');   // eyeshine
  for (const [lx, lz] of [[-2, 3], [1, 3], [-2, -4], [1, -4]])
    w.box(lx, 0, lz, 1, 3, 1, 'catFur');
  for (let j = 0; j < 9; j++) w.set(0, 5 + Math.round(Math.sin(j * 0.4) * 2), -6 - j, 'catFur');

  const g = meshWorld(w, PALETTE, { name: 'cat' });
  const root = new THREE.Group();
  root.add(g);
  root.position.set(a[0], y, a[1]);
  root.name = 'cat';

  let travel = 0.2, dir = 1, pause = 0;
  return {
    root,
    update(t, dt) {
      if (!root.visible) return;
      if (pause > 0) { pause -= dt; g.position.y = Math.sin(t * 2) * 0.2; return; }
      travel += dir * dt * 0.055;
      if (travel > 1) { travel = 1; dir = -1; pause = 3 + Math.random() * 5; }
      if (travel < 0) { travel = 0; dir = 1; pause = 3 + Math.random() * 5; }
      root.position.x = a[0] + (b[0] - a[0]) * travel;
      root.position.z = a[1] + (b[1] - a[1]) * travel;
      root.rotation.y = Math.atan2((b[0] - a[0]) * dir, (b[1] - a[1]) * dir);
      g.position.y = Math.abs(Math.sin(t * 7)) * 0.6;    // a prowl, not a glide
      g.rotation.z = Math.sin(t * 3.5) * 0.05;
    },
  };
}

// -------------------------------------------------------------------- neon
// One bad tube. A sign that hums steadily is a texture; a sign that drops out
// for a hundred milliseconds every few seconds is a place that needs repairs.
export function neonFlicker(t) {
  const s = Math.sin(t * 2.1) + Math.sin(t * 5.7) + Math.sin(t * 11.3);
  if (s > 2.55) return 0.12;                       // the dropout
  return 0.92 + Math.sin(t * 37) * 0.05 + Math.sin(t * 91) * 0.03;
}
