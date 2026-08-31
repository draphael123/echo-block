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

const TMPV = new THREE.Vector3();

const CULL = 900;                     // beyond this they are not drawn at all
const FLINCH = 150;                   // a car this close pushes them off the kerb
const HIT = 30;                       // how close is a hit
const RECOVER = 0.7;                  // seconds to ease back onto the pavement

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
      // DRIVEN, or the walk cycle never runs.
      //
      // buildPerson only animates legs for a body that is either `driven` (its
      // stride set from outside) or following its own `path`. These are neither
      // — life.js writes their root position every frame — so they fell through
      // to the IDLE branch and glided down the pavement breathing, with their
      // legs perfectly still. It reads as floating, because it is.
      driven: true,
    });
    group.add(p.root);
    folk.push({
      p, s: spot.s, u: spot.u, side: Math.sign(spot.u) || 1,
      dir: spot.dir || (i % 2 ? 1 : -1),
      span: spot.span || 420,
      // A crowd that all move at exactly one speed reads as a conveyor belt.
      pace: spot.idle ? 0 : (spot.pace || 24 + (i % 5) * 5),
      idle: !!spot.idle,
      cross: !!spot.cross,
      // a crosser paces across u instead of along s, between the two pavements
      reach: Math.abs(spot.u),
      home: spot.s,
      dog: null,
      recover: 0,
      lx: 0, lz: 0,
    });
    // one in three has a dog with them — but not the ones standing at a bus
    // stop, who would be holding it still for four minutes
    if (i % 3 === 1 && !spot.idle) {
      const d = buildDog({ pos: [0, 2, 0] });
      group.add(d.root);
      folk[folk.length - 1].dog = d;
    }
  });

  // Stride comes from DISTANCE ACTUALLY COVERED, not from the pace we intended
  // — so somebody who stops at a kerb stops their legs, somebody hurrying
  // across a crossing strides faster, and nobody has to be told twice.
  const REF = 44;                     // voxels/second that counts as a full stride
  function drive(w, dt) {
    const px = w.p.root.position.x, pz = w.p.root.position.z;
    const v = Math.hypot(px - w.lx, pz - w.lz) / Math.max(dt, 1e-4);
    w.lx = px; w.lz = pz;
    w.p.setMotion(Math.min(1, v / REF));
  }

  const tmp = frame();
  function update(t, dt, carX, carZ) {
    for (const w of folk) {
      if (w.cross) {
        w.u += w.dir * w.pace * dt;
        if (w.u > w.reach) { w.u = w.reach; w.dir = -1; }
        if (w.u < -w.reach) { w.u = -w.reach; w.dir = 1; }
      } else {
        // pace up and down a stretch of pavement
        w.s += w.dir * w.pace * dt;
        if (w.s > w.home + w.span) { w.s = w.home + w.span; w.dir = -1; }
        if (w.s < w.home - w.span) { w.s = w.home - w.span; w.dir = 1; }
      }

      path.place(w.s, w.u, tmp);
      const d = Math.hypot(tmp.x - carX, tmp.z - carZ);
      const near = d < CULL;
      w.p.root.visible = near;
      if (w.dog) w.dog.root.visible = near;
      if (!near) continue;

      // While they are down, the RAGDOLL owns the root — writing a position
      // here every frame would pin them to the pavement mid-tumble, which is
      // the whole reason the knockdown reads as a knockdown.
      if (w.p.downed) { w.p.update(t, dt); w.recover = RECOVER; continue; }
      if (w.recover > 0) {
        // They got up in the road. Ease them back to their beat rather than
        // teleporting, which is a single frame but a very obvious one.
        w.recover = Math.max(0, w.recover - dt);
        const k = 1 - w.recover / RECOVER;
        w.p.update(t, dt);
        w.p.root.position.lerp(TMPV.set(tmp.x, 2, tmp.z), Math.min(1, k * dt * 9 + dt * 3));
        if (w.recover > 0) continue;
      }

      if (w.cross) {
        // Halfway across with a car coming, you do not step back — you RUN.
        // It is what a person does and it is the merciful reading, because the
        // alternative is a pedestrian who freezes under your bumper.
        if (d < FLINCH * 2.4) w.u += w.dir * w.pace * 2.2 * dt;
        path.place(w.s, w.u, tmp);
        w.p.root.position.set(tmp.x, 2, tmp.z);
        w.p.root.rotation.y = Math.atan2(tmp.nx * w.dir, tmp.nz * w.dir);
        drive(w, dt);
        w.p.update(t, dt);
        continue;
      }

      // step away from the kerb when something is coming
      const flinch = d < FLINCH ? (1 - d / FLINCH) * 12 : 0;
      path.place(w.s, w.u + w.side * flinch, tmp);
      w.p.root.position.set(tmp.x, 2, tmp.z);
      // Somebody waiting faces the road, not the way they last walked.
      w.p.root.rotation.y = w.idle
        ? Math.atan2(-tmp.nx * w.side, -tmp.nz * w.side)
        : Math.atan2(tmp.tx * w.dir, tmp.tz * w.dir);
      drive(w, dt);
      w.p.update(t, dt);

      if (w.dog) {
        path.place(w.s - w.dir * 22, w.u + w.side * (flinch + 8), tmp);
        const dxx = tmp.x - (w.dlx || tmp.x), dzz = tmp.z - (w.dlz || tmp.z);
        w.dlx = tmp.x; w.dlz = tmp.z;
        w.dog.setMotion(Math.min(1, Math.hypot(dxx, dzz) / Math.max(dt, 1e-4) / REF));
        w.dog.root.position.set(tmp.x, 2, tmp.z);
        w.dog.root.rotation.y = Math.atan2(tmp.tx * w.dir, tmp.tz * w.dir);
        w.dog.update(t + w.s * 0.01, dt);
      }
    }
  }

  // Somebody in the road.
  //
  // Deliberately NOT a crash. Hitting a person at eighty should cost you the
  // race, not end it in a spin — and a night circuit through a town where the
  // pedestrians are decorative bollards you clip for free is worse than one
  // where they are a real reason to lift. So: they go down, and you lose most
  // of your speed carrying them.
  function hits(x, z) {
    for (const w of folk) {
      if (!w.p.root.visible || w.p.downed) continue;
      const dx = x - w.p.root.position.x, dz = z - w.p.root.position.z;
      if (dx * dx + dz * dz < HIT * HIT) return w;
    }
    return null;
  }

  // Knock one down, thrown away from the car rather than in a fixed direction.
  function strike(w, carX, carZ, speed) {
    const dx = w.p.root.position.x - carX, dz = w.p.root.position.z - carZ;
    const len = Math.hypot(dx, dz) || 1;
    return w.p.knock(dx / len, dz / len, 0.5 + Math.min(1.4, speed / 190));
  }

  return { group, folk, update, hits, strike };
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
