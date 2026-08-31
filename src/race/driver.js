// The driver.
//
// This was living inside sim.js, where it existed only to measure the track.
// It is lifted out here because the harness's driver and the rival you race are
// now the SAME CODE — if they were two implementations they would drift, and
// then the thing I tune against would stop being the thing you play against.
//
// It knows four things, and nothing else: how fast it can take what is coming,
// where the racing line is, what it can see, and what it has already seen. It
// does not know where the player is. A rival that reacts to you is a different
// and much harder problem, and pretending to solve it with rubber-banding is
// worse than an honest opponent driving its own race.
import { V_MAX, WARNING } from './car.js';
import { ROAD_HALF, isLit } from './track.js';
import { frame } from './path.js';

const LIT_SIGHT = 520;                 // what the streetlights lend you
const REACT = 0.35;                    // spotting it and deciding, before the wheel moves
const TURN_AT_SPEED = 0.55;            // rad/s available near top speed

// Fastest you can take what is coming, straight out of the path's curvature.
const probeA = frame(), probeB = frame();
export function cornerSpeed(path, s, lookahead) {
  let tightest = Infinity;
  for (let d = 40; d <= lookahead; d += 60) {
    path.at(s + d, probeA);
    path.at(s + d + 60, probeB);
    let dh = Math.atan2(probeB.tx, probeB.tz) - Math.atan2(probeA.tx, probeA.tz);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const k = Math.abs(dh) / 60;
    if (k > 1e-6) tightest = Math.min(tightest, 1 / k);
  }
  return tightest === Infinity ? V_MAX : Math.min(V_MAX, TURN_AT_SPEED * tightest * 0.92);
}

export const POLICIES = {
  // brakes for corners and ignores the light
  racing: (car, s, path) => (car.state.speed < cornerSpeed(path, s, 420) ? 1 : -1),
  // brakes for corners AND caps itself to what it can actually see
  cautious: (car, s, path) => {
    const sight = Math.max(car.sightRange(), isLit(s) ? LIT_SIGHT : 0);
    const want = Math.min(cornerSpeed(path, s, 420), sight / (WARNING * 1.05));
    return car.state.speed < want ? 1 : -1;
  },
  steady: (frac) => (car, s, path) => {
    const want = Math.min(V_MAX * frac, cornerSpeed(path, s, 420));
    return car.state.speed < want ? 1 : -0.6;
  },
};

// `pace` scales the driver's ambition, which is how a rival is made easier or
// harder without giving it different physics from the player. 1 drives the
// policy as written; 0.9 is a driver who lifts a little sooner everywhere.
export function createDriver(track, opts = {}) {
  const { policy = 'racing', frac = 0.8, pace = 1, startS = 80 } = opts;
  const path = track.path;
  const pick = policy === 'steady' ? POLICIES.steady(frac) : POLICIES[policy];

  const seen = new Map();
  const f = frame();
  let s = startS, prevS = startS, t = 0, targetU = 0, lap = 0;

  // Everything the driver decides, for one tick. It does not touch the car —
  // the caller feeds the result to step(), so the same driver can be run
  // headless by the harness or attached to a car in the scene.
  function drive(car, dt) {
    t += dt;
    const loc = path.locate(car.state.x, car.state.z, s);
    if (prevS > path.total * 0.8 && loc.s < path.total * 0.2) lap++;
    prevS = loc.s;
    s = loc.s;

    const sight = Math.max(car.sightRange(), isLit(s) ? LIT_SIGHT : 0);
    for (const h of track.hazards) {
      let ahead = h.s - s;
      if (ahead < -path.total / 2) ahead += path.total;
      if (ahead >= 0 && ahead <= sight && !seen.has(h)) seen.set(h, t);
    }

    // You start moving the moment you see it, after a reaction time. Reaction
    // is a delay; getting across is a distance; they are not the same number.
    targetU = 0;
    for (const h of track.hazards) {
      let ahead = h.s - s;
      if (ahead < -path.total / 2) ahead += path.total;
      if (ahead < 0 || ahead > 460 || !seen.has(h)) continue;
      if (t - seen.get(h) < REACT) continue;
      targetU = h.u > 0 ? -(ROAD_HALF - 34) : (ROAD_HALF - 34);
      break;
    }

    path.at(s, f);
    const want = Math.atan2(f.tx, f.tz);
    const off = (targetU - loc.u) / 90;
    let dh = want - car.state.heading + Math.max(-0.5, Math.min(0.5, off));
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;

    return {
      throttle: pick(car, s, path) * (pace < 1 ? pace : 1),
      steer: Math.max(-1, Math.min(1, dh * 3.2)),
      s, u: loc.u, lap,
    };
  }

  return {
    drive,
    hazardsSeen: seen,
    get s() { return s; },
    get lap() { return lap; },
    reset(atS = startS) { s = prevS = atS; t = 0; lap = 0; seen.clear(); },
  };
}
