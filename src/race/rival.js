// Somebody to actually race.
//
// Three laps against a clock is a time trial. The track has had an opponent in
// it the whole time — the harness driver has been lapping it for days — it just
// had no body and nobody could see it. This gives it one.
//
// It drives its own race and does not know the player exists. No rubber-banding:
// if you are quicker you pull away, and if you are not you watch its tail lights
// do the thing you are failing to do, which is the honest version and the one
// you can learn from. `pace` is the only difficulty knob, and it changes the
// driver's ambition rather than its physics — the rival's car is your car.
import { createDriver } from './driver.js';
import { safeSpot } from './track.js';
import { frame } from './path.js';

export function buildRival(track, ground, buildCar, opts = {}) {
  const { paint = 1, policy = 'racing', pace = 1, startS = 80, startU = 34,
    lineU = 0, parts = null, chassis = 'brindle' } = opts;
  // parts are VISUAL here — no tune — but the CHASSIS is real: Vasey's
  // wedge is genuinely faster and more nervous than Wren's hatch, which is
  // half of what makes each rival a different problem.
  const car = buildCar(paint, {}, parts, chassis);
  car.root.name = 'rival';
  const driver = createDriver(track, { policy, pace, startS, lineU });

  const f = frame();
  track.path.place(startS, startU, f);
  car.respawn(f.x, f.z, Math.atan2(f.tx, f.tz), track.elev(startS) - 1);

  let running = false, finished = null, dist = 0;
  // THE HUMAN THIRD: a launch is a reaction, not a solenoid. Each driver
  // leaves the line a beat apart, which un-stacks the first corner and makes
  // a good start something the player can WIN. And every ~20 seconds one of
  // them breathes — a half-second lift, the mistake you catch them on.
  let launchHold = 0, errUntil = 0, nextErr = 0;
  // The race clock, and the moment this car crossed the line. Ranking finished
  // cars by frozen PROGRESS was epsilon noise — every finisher freezes a voxel
  // or two past the wrap, so the table came out in roster order. The clock all
  // cars share (they start together and tick together) is the honest key.
  let t = 0, finishedT = null;

  function update(dt, laps, player) {
    if (!running || finished !== null) {
      // sit on the line with the engine running
      car.step(dt, 0, 0, ground, false, false);
      car.present(dt);
      return;
    }
    t += dt;
    const d = driver.drive(car, dt);
    if (t < launchHold) { d.throttle = 0; }
    if (t > nextErr) {
      errUntil = t + 0.45 + Math.random() * 0.3;
      nextErr = t + 16 + Math.random() * 18;
    }
    if (t < errUntil) d.throttle = Math.min(d.throttle, 0.08);
    // THE PLAYER EXISTS. The driver plans its own race and is blind to cars —
    // which read as ghosts the moment you were alongside one. The plan stands;
    // this is reflex on top of it: a car close ahead gets a steer away and a
    // lift, scaled by how close, the way you give anybody a car's width.
    if (player) {
      const st = car.state;
      const dx = player.x - st.x, dz = player.z - st.z;
      const ahead = dx * Math.sin(st.heading) + dz * Math.cos(st.heading);
      const side = dx * Math.cos(st.heading) - dz * Math.sin(st.heading);
      if (ahead > 0 && ahead < 130 && Math.abs(side) < 46) {
        const press = 1 - ahead / 130;
        d.steer = Math.max(-1, Math.min(1, d.steer + (side > 0 ? -0.55 : 0.55) * press));
        if (ahead < 75 && d.throttle > 0.25) d.throttle = 0.25;
      }
      // AND IT DEFENDS. A car close behind and offset gets the door closed on
      // it — a drift toward the attacking side, mild enough that the switchback
      // (feint one way, cut the other) beats it. That is a racing rival, not a
      // moving chicane: it reacts, and its reaction is exploitable.
      if (ahead < -20 && ahead > -140 && Math.abs(side) < 40 && st.speed > 120 && t >= errUntil) {
        const press = 1 - (-ahead - 20) / 120;
        d.steer = Math.max(-1, Math.min(1, d.steer + (side > 0 ? 0.28 : -0.28) * press));
      }
    }
    // allowReverse false: a racing driver does not select reverse, and the
    // braking policy holds throttle at -1 through every corner.
    car.step(dt, d.throttle, d.steer, ground, false, false);
    car.present(dt);
    dist = driver.lap * track.path.total + d.s;
    if (car.state.wedged) {
      car.state.wedged = false;
      const spot = safeSpot(track.path, ground, d.s);
      if (spot) car.respawn(spot.x, spot.z, spot.heading, track.elev(spot.s) - 1);
    }
    if (laps && driver.lap >= laps && finished === null) { finished = dist; finishedT = t; }
  }

  // Solid, like the traffic. Same oriented box.
  function hits(x, z, heading = 0) {
    const sh = Math.sin(heading), ch = Math.cos(heading);
    const dx = car.root.position.x - x, dz = car.root.position.z - z;
    const lz = dx * sh + dz * ch, lx = dx * ch - dz * sh;
    return Math.abs(lx) < 27 && Math.abs(lz) < 54;
  }

  // AND IT TAKES ONE. The rival was solid in the sense that hitting it cost YOU
  // speed, and in no other sense: it drove on at the same pace on the same line
  // as though nothing had happened, which reads as scenery you bounce off. It
  // gets shoved sideways off its racing line and loses speed like anybody else,
  // and because the driver steers back toward the line, it recovers rather than
  // being permanently ruined by one nudge.
  function shunt(fromX, fromZ, speed) {
    const dx = car.root.position.x - fromX, dz = car.root.position.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    const push = 14 + Math.min(26, speed / 8);
    car.state.x += (dx / len) * push;
    car.state.z += (dz / len) * push;
    car.state.heading += (dx * Math.cos(car.state.heading) - dz * Math.sin(car.state.heading)) / len * 0.22;
    car.impact(0.45, true);
  }

  return {
    root: car.root, car, driver, update, hits, shunt,
    start() {
      running = true;
      launchHold = Math.random() * 0.35;
      nextErr = 8 + Math.random() * 18;
      errUntil = 0;
    },
    reset() {
      running = false; finished = null; dist = 0; t = 0; finishedT = null;
      driver.reset(startS);
      track.path.place(startS, startU, f);
      car.respawn(f.x, f.z, Math.atan2(f.tx, f.tz), track.elev(startS) - 1);
    },
    get progress() { return dist; },
    get lap() { return driver.lap; },
    get done() { return finished !== null; },
    get finishedT() { return finishedT; },
  };
}
