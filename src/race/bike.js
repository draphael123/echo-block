// The bike, the rider, and the dynamo.
//
// The dynamo is the whole design: speed powers the lamp, so how hard you have
// been pedalling decides how far ahead you can see. Two rules stop that being
// a punishment spiral rather than a decision:
//
//   FLOOR — at a crawl you still see a few metres. Never zero, or slowing down
//           because you are frightened makes you more frightened.
//   LAG   — the lamp brightens quickly and fades slowly, so a sprint BEFORE a
//           dark stretch banks light you can still spend after you brake.
//
// And one that stops "flat out" being the answer to everything:
//
//   SATURATION — the lamp reaches full output at 70% of top speed. Past that
//           you gain no more sight but you are covering ground faster, so you
//           are outrunning your own light. There is a speed above which going
//           faster makes you blinder in the only sense that matters.
import * as THREE from 'three';
import { VoxWorld, meshWorld } from '../voxel.js';
import { PALETTE } from '../palette.js';
import { buildPerson } from '../people.js';

export const V_MAX = 121;             // voxels/second ~ 35 km/h at 8cm/voxel
const ACCEL = 78, BRAKE = 190, DRAG = 15;
const TURN_SLOW = 2.5, TURN_FAST = 0.95;

const LAMP_FLOOR = 46;                // ~3.7m: enough to not be cruel
const LAMP_REACH = 130;               // ~14m at full charge: a bike lamp, not
                                      // a headlight. At 300 the dark stretch was
                                      // not dark — you could see further than you
                                      // could ever need to at 35km/h, and the
                                      // whole mechanic measured as decoration.
const SATURATE = 0.70;                // lamp maxes out at 70% of top speed
const RISE = 0.30, FALL = 1.7;        // seconds

export function buildBikeMesh() {
  const w = new VoxWorld();
  const wheel = (cz) => {
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const d = Math.hypot(i, j);
      if (d > 4 || d < 2.6) continue;
      w.set(i, 4 + j, cz, 'rubber');
    }
    w.set(0, 4, cz, 'chrome');
    for (const a of [0, 1.57, 3.14, 4.71]) {
      w.set(Math.round(Math.cos(a) * 2), 4 + Math.round(Math.sin(a) * 2), cz, 'chrome');
    }
  };
  wheel(-7); wheel(7);
  // frame: a BMX is a triangle and a fork, and at this size that is all it can be
  w.box(0, 4, -7, 1, 1, 14, 'plasticBlue');           // chain stay
  for (let i = 0; i < 7; i++) w.set(0, 4 + i, -7 + i, 'plasticBlue');   // seat tube
  for (let i = 0; i < 7; i++) w.set(0, 10 - i, 6 - i, 'plasticBlue');   // down tube
  w.box(0, 10, -1, 1, 1, 8, 'plasticBlue');           // top tube
  w.box(-4, 11, 6, 9, 1, 1, 'chrome');                // bars
  w.box(-4, 10, 6, 1, 1, 2, 'rubber'); w.box(4, 10, 6, 1, 1, 2, 'rubber');
  w.box(-1, 11, -5, 3, 1, 4, 'shoe');                 // saddle
  w.box(-2, 3, 0, 5, 1, 1, 'chrome');                 // cranks
  w.box(0, 9, 6, 1, 2, 1, 'metalDark');               // lamp bracket
  w.box(0, 8, 7, 1, 2, 1, 'torchLens');               // the lamp itself
  const g = meshWorld(w, PALETTE, { name: 'bike' });
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildRider(look) {
  const root = new THREE.Group();
  root.name = 'rider';
  const bike = buildBikeMesh();
  root.add(bike);

  // Defaults matter: the look comes out of localStorage and may be empty on a
  // cold visit, and buildPerson seeds its idle animation off the name.
  const person = buildPerson({
    name: 'Row', kid: true, skin: 'skinLight', hair: 'hairGinger', hairStyle: 'fringe',
    shirt: 'shirtRed', trouser: 'jeans', collar: 'shirtCream',
    ...look, pos: [0, 0, 0], face: 0, pose: 'ride', driven: false, lines: [],
  });
  person.root.position.set(0, 6, -3);
  root.add(person.root);

  // the lamp. Its cone, reach and brightness are all one number.
  const beam = new THREE.SpotLight(0xfff0c4, 0, LAMP_FLOOR, 0.5, 0.55, 1.4);
  beam.position.set(0, 9, 7);
  const target = new THREE.Object3D();
  target.position.set(0, -2, 120);
  root.add(beam, target);
  beam.target = target;

  const state = {
    x: 0, z: 0, heading: 0, speed: 0, turnRate: 0,
    lamp: 0, crash: 0, spin: 0, dist: 0,
  };

  function sightRange() {
    return LAMP_FLOOR + LAMP_REACH * Math.min(1, state.lamp / SATURATE);
  }

  // throttle: -1 brake .. +1 pedal.   steer: -1 left .. +1 right.
  function step(dt, throttle, steer, ground) {
    // A crash is a STOP, not a stumble. At 0.22x speed and 0.75s it cost
    // about a second and a half, which measured as cheaper than slowing
    // down — so the fastest way round was to ride blind and bounce off
    // things. You come off the bike and you get back on it.
    if (state.crash > 0) {
      state.crash -= dt;
      state.spin += dt * 9;
      state.speed = 0;
      // and the lamp dies while you are down, so you restart in the dark
      state.lamp += (0 - state.lamp) * Math.min(1, dt / FALL);
      return state;
    }

    if (throttle > 0) state.speed += ACCEL * throttle * dt;
    else state.speed += (BRAKE * throttle - DRAG) * dt;
    state.speed = Math.max(0, Math.min(V_MAX, state.speed));

    const grip = state.speed / V_MAX;
    // Some turn authority survives at a standstill. Scaling it to zero was
    // a deadlock: you need speed to steer, and against an obstacle you
    // cannot get speed, so a nudge into a kerb was permanent.
    state.turnRate = steer * (TURN_SLOW + (TURN_FAST - TURN_SLOW) * grip)
      * (0.28 + 0.72 * Math.min(1, state.speed / 16));
    state.heading += state.turnRate * dt;

    const dx = Math.sin(state.heading) * state.speed * dt;
    const dz = Math.cos(state.heading) * state.speed * dt;
    if (ground) {
      const before = { x: state.x, z: state.z };
      const p = { x: state.x, y: 0, z: state.z };
      ground.move(p, dx, dz);
      const moved = Math.hypot(p.x - before.x, p.z - before.z);
      const wanted = Math.hypot(dx, dz);
      state.x = p.x; state.z = p.z;
      // A crash is something that HAPPENS TO YOU, not a radius someone
      // declared. Hitting a bin used to just scrub speed, which meant the
      // fastest route was to wedge yourself into things — and in the
      // harness the bike stopped dead twelve voxels short of a hazard's
      // nominal position and no crash was ever recorded.
      if (wanted > 0.01 && moved < wanted * 0.32 && state.speed > 52) crash();
      else if (wanted > 0.01 && moved < wanted * 0.7) state.speed *= 0.55;   // a scrape
    } else {
      state.x += dx; state.z += dz;
    }
    state.dist += Math.hypot(dx, dz);

    // the dynamo: fast to charge, slow to fade
    const want = state.speed / V_MAX;
    const tau = want > state.lamp ? RISE : FALL;
    state.lamp += (want - state.lamp) * Math.min(1, dt / tau);

    return state;
  }

  function crash() {
    if (state.crash > 0) return false;
    state.crash = 1.6;
    state.speed = 0;
    return true;
  }

  // Picking the bike up and pointing it back down the road. Without this
  // you get up still wedged into whatever put you down, and a crash is a
  // permanent end to the run rather than a cost.
  function respawn(x, z, heading) {
    state.x = x; state.z = z; state.heading = heading;
    state.speed = 0; state.turnRate = 0;
    root.rotation.z = 0; root.position.y = 0;
  }

  let pedal = 0;
  function present(t, dt) {
    root.position.set(state.x, 0, state.z);
    root.rotation.y = state.heading;
    // lean into the turn, and lurch when you have just hit something
    const lean = THREE.MathUtils.clamp(-(state.turnRate || 0) * 0.22, -0.5, 0.5);
    bike.rotation.z += (lean - bike.rotation.z) * Math.min(1, dt * 8);
    person.root.rotation.z = bike.rotation.z * 0.7;
    if (state.crash > 0) {
      root.rotation.z = Math.sin(state.spin) * 0.9;
      root.position.y = Math.abs(Math.sin(state.spin * 0.6)) * 5;
    } else {
      root.rotation.z += (0 - root.rotation.z) * Math.min(1, dt * 6);
      root.position.y += (0 - root.position.y) * Math.min(1, dt * 6);
    }
    pedal += (state.speed / V_MAX) * dt * 9;
    person.setMotion(state.speed / V_MAX);
    person.update(pedal, dt);

    const reach = sightRange();
    beam.distance = reach * 1.25;
    beam.intensity = 5200 + 62000 * Math.min(1, state.lamp / SATURATE);
    beam.angle = 0.34 + 0.20 * Math.min(1, state.lamp / SATURATE);
    target.position.set(0, -4, reach * 0.8);
  }

  return { root, state, step, crash, respawn, present, sightRange, person, bike };
}

// How long you must have SEEN something before you can be off the line by the
// time you reach it. Not a twitch reaction — spotting a bin, deciding, and
// moving a bike a metre sideways at speed. This one number is the whole
// trade-off, and it is what the A/B harness measures against.
//
// It sets the speed at which you outrun your lamp: warning = sight / speed, so
// with a 176-voxel reach the dark stops being survivable somewhere around 77%
// of top speed, while a lit section (sight ~320) stays safe flat out.
export const WARNING = 1.9;
export const REACTION = WARNING;
