// Life on the circuit.
//
// A track with nobody on it is a test facility. The people here are not
// obstacles and not scenery — they are the reason the street reads as a place
// somebody lives rather than a ribbon somebody laid. They walk the pavements,
// they stop under the streetlights, and they step back from the kerb when a car
// comes, which is the single cheapest thing that makes them feel awake.
//
// Everything is placed in track coordinates (s, u) and culled by distance,
// because a dozen people is a hundred and forty draw calls and most of them are
// half a kilometre behind you.
import * as THREE from 'three';
import { buildPerson, buildDog } from '../people.js';
import { frame } from './path.js';

const CULL = 900;                     // beyond this they are not drawn at all
const FLINCH = 150;                   // a car this close pushes them off the kerb

const WALKERS = [
  { skin: 'skinLight', hair: 'hairBrown', shirt: 'shirtBlue', trouser: 'jeans', jacket: 'trouserGrey' },
  { skin: 'skinDeep', hair: 'hairDark', hairStyle: 'long', shirt: 'shirtGreen', trouser: 'trouserTan' },
  { skin: 'skinMid', hair: 'hairGrey', hairStyle: 'bald', glasses: true, shirt: 'shirtPlaid', trouser: 'trouserGrey' },
  { skin: 'skinLight', hair: 'hairGinger', hairStyle: 'fringe', shirt: 'shirtRed', trouser: 'jeans', kid: true },
  { skin: 'skinMid', hair: 'hairBrown', shirt: 'shirtCream', trouser: 'jeans', bag: 'shirtGreen' },
  { skin: 'skinDeep', hair: 'hairDark', shirt: 'shirtBlue', trouser: 'trouserGrey', jacket: 'shirtGreen' },
];

export function buildLife(path, spots) {
  const group = new THREE.Group();
  group.name = 'life';
  const folk = [];
  const f = frame();

  spots.forEach((spot, i) => {
    const look = WALKERS[i % WALKERS.length];
    const p = buildPerson({
      name: 'walker' + i, ...look,
      pos: [0, 2, 0], face: 0,
      speed: 0.55 + (i % 3) * 0.18,
    });
    group.add(p.root);
    folk.push({
      p, s: spot.s, u: spot.u, side: Math.sign(spot.u) || 1,
      dir: spot.dir || (i % 2 ? 1 : -1),
      span: spot.span || 420,
      home: spot.s,
      dog: null,
    });
    // one in three has a dog with them
    if (i % 3 === 1) {
      const d = buildDog({ pos: [0, 2, 0] });
      group.add(d.root);
      folk[folk.length - 1].dog = d;
    }
  });

  const tmp = frame();
  function update(t, dt, carX, carZ) {
    for (const w of folk) {
      // pace up and down a stretch of pavement
      w.s += w.dir * 26 * dt;
      if (w.s > w.home + w.span) { w.s = w.home + w.span; w.dir = -1; }
      if (w.s < w.home - w.span) { w.s = w.home - w.span; w.dir = 1; }

      path.place(w.s, w.u, tmp);
      const d = Math.hypot(tmp.x - carX, tmp.z - carZ);
      const near = d < CULL;
      w.p.root.visible = near;
      if (w.dog) w.dog.root.visible = near;
      if (!near) continue;

      // step away from the kerb when something is coming
      const flinch = d < FLINCH ? (1 - d / FLINCH) * 12 : 0;
      path.place(w.s, w.u + w.side * flinch, tmp);
      w.p.root.position.set(tmp.x, 2, tmp.z);
      w.p.root.rotation.y = Math.atan2(tmp.tx * w.dir, tmp.tz * w.dir);
      w.p.update(t, dt);

      if (w.dog) {
        path.place(w.s - w.dir * 22, w.u + w.side * (flinch + 8), tmp);
        w.dog.root.position.set(tmp.x, 2, tmp.z);
        w.dog.root.rotation.y = Math.atan2(tmp.tx * w.dir, tmp.tz * w.dir);
        w.dog.update(t + w.s * 0.01, dt);
      }
    }
  }

  return { group, folk, update };
}

// ------------------------------------------------------------------ traffic
// Cars going about their evening on the same road you are racing on. They do
// not know you are racing, which is the entire point — this is the "hazards and
// live traffic" half of the design, and it is the half that survived the switch
// from bikes.
export function buildTraffic(path, buildCar, lanes) {
  const group = new THREE.Group();
  group.name = 'traffic';
  const cars = lanes.map((lane, i) => {
    const c = buildCar(1 + i);
    c.root.traverse(o => { if (o.isMesh) o.castShadow = false; });
    // Dipped, and aimed down. Somebody else's headlights should say "a car is
    // coming" — at the player's own beam intensity, pointed back up the road at
    // the camera, an oncoming Cortina is a white hole with no car in it.
    if (c.beam) {
      c.beam.intensity = 26000;
      c.beam.angle = 0.34;
      if (c.beam.target) c.beam.target.position.set(0, -34, 240);
    }
    group.add(c.root);
    return { c, s: lane.s, u: lane.u, speed: lane.speed, dir: lane.dir || 1 };
  });

  const tmp = frame();
  function update(dt, total) {
    for (const t of cars) {
      t.s += t.dir * t.speed * dt;
      if (t.s > total) t.s -= total;
      if (t.s < 0) t.s += total;
      path.place(t.s, t.u, tmp);
      t.c.root.position.set(tmp.x, 0, tmp.z);
      t.c.root.rotation.y = Math.atan2(tmp.tx * t.dir, tmp.tz * t.dir);
    }
  }

  // Traffic is solid. Running into the back of somebody's Cortina at 80 should
  // not be free.
  function hits(x, z) {
    for (const t of cars) {
      const dx = x - t.c.root.position.x, dz = z - t.c.root.position.z;
      if (dx * dx + dz * dz < 34 * 34) return t;
    }
    return null;
  }

  return { group, cars, update, hits };
}
