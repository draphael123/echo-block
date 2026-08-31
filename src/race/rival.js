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
  const { paint = 1, policy = 'racing', pace = 1, startS = 80, startU = 34 } = opts;
  const car = buildCar(paint);
  car.root.name = 'rival';
  const driver = createDriver(track, { policy, pace, startS });

  const f = frame();
  track.path.place(startS, startU, f);
  car.respawn(f.x, f.z, Math.atan2(f.tx, f.tz), track.elev(startS) - 1);

  let running = false, finished = null, dist = 0;

  function update(dt, laps) {
    if (!running || finished !== null) {
      // sit on the line with the engine running
      car.step(dt, 0, 0, ground, false, false);
      car.present(dt);
      return;
    }
    const d = driver.drive(car, dt);
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
    if (laps && driver.lap >= laps && finished === null) finished = dist;
  }

  // Solid, like the traffic. Same oriented box.
  function hits(x, z, heading = 0) {
    const sh = Math.sin(heading), ch = Math.cos(heading);
    const dx = car.root.position.x - x, dz = car.root.position.z - z;
    const lz = dx * sh + dz * ch, lx = dx * ch - dz * sh;
    return Math.abs(lx) < 27 && Math.abs(lz) < 54;
  }

  return {
    root: car.root, car, driver, update, hits,
    start() { running = true; },
    reset() {
      running = false; finished = null; dist = 0;
      driver.reset(startS);
      track.path.place(startS, startU, f);
      car.respawn(f.x, f.z, Math.atan2(f.tx, f.tz), track.elev(startS) - 1);
    },
    get progress() { return dist; },
    get lap() { return driver.lap; },
    get done() { return finished !== null; },
  };
}
