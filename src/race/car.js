// The car.
//
// A bike does not read at this voxel size. One voxel is 8cm, so a BMX wheel is
// six voxels across and the frame is a set of one-voxel tubes — voxels are good
// at solid masses with panels and glass and lights, and bad at thin tubes. The
// parked wagon in the hub reads as a car instantly; the bike read as a smudge
// with a lamp on it. That is the whole argument, and it only became obvious
// after building the bike.
//
// Handling is arcade and grippy, as chosen: it goes where you point it, and the
// skill is in line and braking rather than in catching slides. The one thing it
// will not let you do is take a corner flat out — top speed needs a 505-voxel
// radius and the track's corners are 380, so every corner is a braking
// decision.
import * as THREE from 'three';
import { VoxWorld, meshWorld } from '../voxel.js';
import { PALETTE } from '../palette.js';

export const V_MAX = 278;              // voxels/second ~ 80 km/h at 8cm/voxel
// BRAKE was 330 — 2.6g, which no car does and which quietly made the whole
// night-driving idea pointless: with brakes that strong you can always stop
// inside your headlights, so how far you can see never costs you anything.
// 130 is about 1.05g, and it sets the relationship the track is built on:
// AT TOP SPEED YOUR STOPPING DISTANCE IS YOUR BEAM. 278 v/s at 130 v/s^2 needs
// 297 voxels; the beam reaches 280. On a lit street you are reading the road by
// streetlight and it does not bind. Unlit, it does.
const ACCEL = 74, BRAKE = 130, DRAG = 22;
const TURN_SLOW = 1.9, TURN_FAST = 0.55;

// ------------------------------------------------------------------- drift
// Until now the car had no slip angle at all: heading WAS the direction of
// travel, which is why it felt like it was on rails. A drift is the two coming
// apart — the nose leads, the car keeps going roughly where it was pointed a
// moment ago, and you steer with the gap between them.
//
// It is a cost, not a shortcut. You get much more yaw authority and you scrub
// speed the whole time, so it is for tightening a corner you got wrong, not for
// going faster than the grippy line. That keeps the braking-vs-sight mechanic
// intact rather than handing the player a way round it.
const MAX_SLIP = 0.62;                 // radians the nose can lead by
const DRIFT_TURN = 1.85;               // yaw authority multiplier with it held
const DRIFT_SCRUB = 165;               // speed bled per second at full slip
const SLIP_ON = 5.0, SLIP_OFF = 3.2;   // how fast the angle builds and recovers
const CAR_PROBE = 2.6;                 // ~18 voxels across, against a 26-wide car

// Headlights do not care how fast you are going — that was the dynamo, and it
// went with the bike. What survives is the structural half of that idea: the
// town's lighting IS the level design, so an unlit stretch is one where the
// beam is all you have.
// 280 voxels is 22m: dipped beams on an eighties hatchback. It was 420, and
// 420 was the whole reason the dark did nothing — at 1.5s of warning, 420
// voxels covers 280 voxels/second, which IS the top speed, so seeing further
// than your headlights never bought you anything. The number is the mechanic.
const BEAM_REACH = 280;

const BODIES = [
  { body: 'carBody', roof: 'carBody', trim: 'carTrim', name: 'red' },
  { body: 'doorBlue', roof: 'doorBlue', trim: 'chrome', name: 'blue' },
  { body: 'sidingF', roof: 'sidingFdark', trim: 'carTrim', name: 'sage' },
  { body: 'shirtCream', roof: 'sidingBdark', trim: 'chrome', name: 'cream' },
];

// A 1986 three-door, facing +Z. Wedge nose, upright glass, black bumpers.
function shell(w, c) {
  const L = 58, W = 26, sill = 5, hw = W >> 1;

  // main body, tapering slightly toward the nose
  for (let k = 0; k < L; k++) {
    const t = k / (L - 1);
    const pinch = t > 0.72 ? 1 : 0;
    w.box(-hw + pinch, sill, k, W - pinch * 2, 10, 1, c.body);
  }
  w.box(-hw, sill - 2, 6, W, 2, L - 14, c.body);          // sills
  w.box(-hw + 1, sill + 10, 4, W - 2, 1, L - 10, c.body);

  // greenhouse: inset, with a raked screen and a hatchback rear
  const cz = 12, cL = 30;
  w.box(-hw + 3, sill + 11, cz, W - 6, 11, cL, 'carGlass');
  w.box(-hw + 3, sill + 11, cz, 1, 11, cL, c.body);        // pillars
  w.box(hw - 4, sill + 11, cz, 1, 11, cL, c.body);
  w.box(-hw + 3, sill + 11, cz + 15, W - 6, 11, 1, c.body); // B-pillar
  w.box(-hw + 2, sill + 22, cz + 1, W - 4, 2, cL - 2, c.roof);
  for (let k = 0; k < 6; k++)                               // raked screen
    w.box(-hw + 3, sill + 21 - k, cz + cL + k, W - 6, 1, 1, 'carGlass');
  for (let k = 0; k < 5; k++)                               // hatch
    w.box(-hw + 3, sill + 21 - k, cz - 1 - k, W - 6, 1, 1, 'carGlass');

  // bonnet and tail
  w.box(-hw + 2, sill + 9, L - 14, W - 4, 2, 12, c.body);
  w.box(-hw + 2, sill + 9, 2, W - 4, 2, 10, c.body);
  w.box(-hw - 1, sill + 1, L - 2, W + 2, 5, 2, 'metalDark');   // bumpers
  w.box(-hw - 1, sill + 1, -1, W + 2, 5, 2, 'metalDark');
  w.box(-hw + 2, sill + 6, L - 1, W - 4, 2, 1, c.trim);        // grille
  for (let i = 0; i < W - 6; i += 3) w.set(-hw + 3 + i, sill + 6, L, 'metalDark');

  // lights
  w.box(-hw + 2, sill + 7, L, 6, 4, 1, 'headLight');
  w.box(hw - 8, sill + 7, L, 6, 4, 1, 'headLight');
  w.box(-hw + 2, sill + 6, -1, 6, 4, 1, 'tailLight');
  w.box(hw - 8, sill + 6, -1, 6, 4, 1, 'tailLight');
  w.box(-hw + 9, sill + 6, -1, W - 18, 3, 1, 'paper');         // plate

  // mirrors — small, but they are most of what says "car" in silhouette
  w.box(-hw - 2, sill + 15, cz + cL - 3, 2, 3, 3, c.body);
  w.box(hw, sill + 15, cz + cL - 3, 2, 3, 3, c.body);

  // wheels, sunk into arches
  for (const wz of [11, L - 19]) for (const wx of [-hw - 1, hw - 2]) {
    for (let k = -7; k <= 7; k++) for (let j = -7; j <= 7; j++) {
      const d = Math.hypot(k, j);
      if (d > 7) continue;
      for (let i = 0; i < 3; i++)
        w.set(wx + i, 6 + j, wz + k, d < 3.2 ? 'chrome' : 'rubber');
    }
    w.cut(wx - 1, 14, wz - 8, 5, 6, 17);
  }
  return { L, W };
}

export function buildCar(paint = 0) {
  const c = BODIES[paint % BODIES.length];
  const w = new VoxWorld();
  const { L, W } = shell(w, c);

  const root = new THREE.Group();
  root.name = 'car';
  const chassis = new THREE.Group();          // takes the body roll
  const mesh = meshWorld(w, PALETTE, { name: 'car', solidBelow: -1 });
  mesh.position.set(0, 0, -L / 2);            // pivot about the middle
  chassis.add(mesh);
  root.add(chassis);

  // one shadowless spot for the beam, plus a pool light so the road right in
  // front of the car is never black
  const beam = new THREE.SpotLight(0xfff4d6, 240000, BEAM_REACH, 0.42, 0.55, 1.5);
  beam.position.set(0, 11, L / 2 - 2);
  const tgt = new THREE.Object3D();
  tgt.position.set(0, -10, BEAM_REACH * 0.8);
  root.add(beam, tgt);
  beam.target = tgt;

  const state = {
    x: 0, z: 0, heading: 0, speed: 0, turnRate: 0,
    crash: 0, spin: 0, dist: 0, roll: 0, stuck: 0, slip: 0,
  };

  function step(dt, throttle, steer, ground, drift = false) {
    if (state.crash > 0) {
      state.crash -= dt;
      state.spin += dt * 7;
      state.speed *= Math.max(0, 1 - dt * 3);
      return state;
    }

    if (throttle > 0) state.speed += ACCEL * throttle * dt;
    else state.speed += (BRAKE * throttle - DRAG) * dt;
    state.speed = Math.max(0, Math.min(V_MAX, state.speed));

    const f = state.speed / V_MAX;
    // A car cannot pivot on the spot, but it must keep SOME authority at a
    // crawl or a nudge into a kerb is permanent — the bike taught me that.
    const sliding = drift && state.speed > 55;
    state.turnRate = steer * (TURN_SLOW + (TURN_FAST - TURN_SLOW) * f)
      * (0.22 + 0.78 * Math.min(1, state.speed / 30))
      * (sliding ? DRIFT_TURN : 1);
    state.heading += state.turnRate * dt;

    // The slip angle: how far the nose leads the direction of travel. It builds
    // while the handbrake is in and washes off when it is not, so letting go is
    // a recovery you can feel rather than a switch.
    const wantSlip = sliding ? steer * MAX_SLIP * Math.min(1, state.speed / 130) : 0;
    state.slip += (wantSlip - state.slip) * Math.min(1, dt * (sliding ? SLIP_ON : SLIP_OFF));
    if (Math.abs(state.slip) > 0.02) {
      state.speed = Math.max(0, state.speed - DRIFT_SCRUB * (Math.abs(state.slip) / MAX_SLIP) * dt);
    }

    // Travel lags the nose by the slip angle. THIS is the whole drift.
    const travel = state.heading - state.slip;
    const dx = Math.sin(travel) * state.speed * dt;
    const dz = Math.cos(travel) * state.speed * dt;
    if (ground) {
      const bx = state.x, bz = state.z;
      const p = { x: state.x, y: 0, z: state.z };
      ground.move(p, dx, dz, null, CAR_PROBE);
      state.x = p.x; state.z = p.z;
      const moved = Math.hypot(p.x - bx, p.z - bz), wanted = Math.hypot(dx, dz);
      if (wanted > 0.01 && moved < wanted * 0.32 && state.speed > 90) crash();
      else if (wanted > 0.01 && moved < wanted * 0.72) state.speed *= 0.7;
    } else { state.x += dx; state.z += dz; }
    state.dist += Math.hypot(dx, dz);

    // Wedged. There is no reverse, so a car nosed into a skip at walking pace
    // is there for good: you need speed to steer and you cannot get speed
    // against a wall. Rather than add a reverse gear for this one case, being
    // stuck IS a crash — the recovery path already knows how to undo one, and
    // a player who beaches the car wants the same answer the harness does.
    if (throttle > 0 && state.speed < 8) {
      state.stuck += dt;
      if (state.stuck > 1.1) crash();
    } else state.stuck = 0;
    return state;
  }

  function crash() {
    if (state.crash > 0) return false;
    state.stuck = 0;
    state.crash = 1.5;
    state.speed *= 0.15;
    return true;
  }

  function respawn(x, z, heading) {
    state.x = x; state.z = z; state.heading = heading;
    state.speed = 0; state.turnRate = 0; state.roll = 0; state.stuck = 0; state.slip = 0;
    root.rotation.z = 0; chassis.rotation.z = 0;
  }

  function present(dt) {
    root.position.set(state.x, 0, state.z);
    root.rotation.y = state.heading;
    // Body roll reads the corner for you before the tyres do — and leans HARD
    // into a slide, which is most of what sells the drift from behind.
    const want = THREE.MathUtils.clamp(
      -state.turnRate * (state.speed / V_MAX) * 0.5 - state.slip * 0.34, -0.30, 0.30);
    state.roll += (want - state.roll) * Math.min(1, dt * 6);
    chassis.rotation.z = state.roll;
    if (state.crash > 0) {
      root.rotation.z = Math.sin(state.spin) * 0.35;
      root.position.y = Math.abs(Math.sin(state.spin * 0.7)) * 3;
    } else {
      root.rotation.z += (0 - root.rotation.z) * Math.min(1, dt * 6);
      root.position.y += (0 - root.position.y) * Math.min(1, dt * 6);
    }
  }

  return {
    root, state, step, crash, respawn, present, beam, length: L, width: W,
    sightRange: () => BEAM_REACH,
  };
}

// How long you must have SEEN something before you can be off the line by the
// time you reach it: spotting it, deciding, and moving a car a lane sideways.
export const WARNING = 1.5;
