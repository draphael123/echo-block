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

// Corner targets are sold by the SURFACE, not just the geometry — a wet road
// buys you less corner than a dry one, and a driver who has not been told so
// laps the rain at dry pace (which is exactly what the grip assay caught).
const grip = (car) => (car.gripFactor ? car.gripFactor() : 1);

export const POLICIES = {
  // brakes for corners and ignores the light
  racing: (car, s, path) => (car.state.speed < cornerSpeed(path, s, 420) * grip(car) ? 1 : -1),
  // brakes for corners AND caps itself to what it can actually see
  cautious: (car, s, path) => {
    const sight = Math.max(car.sightRange(), isLit(s) ? LIT_SIGHT : 0);
    const want = Math.min(cornerSpeed(path, s, 420) * grip(car), sight / (WARNING * 1.05));
    return car.state.speed < want ? 1 : -1;
  },
  steady: (frac) => (car, s, path) => {
    const want = Math.min(V_MAX * frac, cornerSpeed(path, s, 420) * grip(car));
    return car.state.speed < want ? 1 : -0.6;
  },
};

// `pace` scales the driver's ambition, which is how a rival is made easier or
// harder without giving it different physics from the player. 1 drives the
// policy as written; 0.9 is a driver who lifts a little sooner everywhere.
export function createDriver(track, opts = {}) {
  // `lineU` is the driver's own lane preference — the offset it drives when
  // nothing needs dodging. Six rivals all defaulting to the centreline drove
  // nose-to-tail in a train, which is why every mirror looked the same.
  // `perception` widens hazard SPOTTING only, not speed: a rival has lapped
  // this circuit a hundred nights and knows where the barriers are, so it
  // starts its dodge earlier than its lamps alone would allow. The player's
  // sight economy is untouched — this is the difference between knowing the
  // road and reading it.
  const { policy = 'racing', frac = 0.8, pace = 1, startS = 80, lineU = 0,
    perception = 1 } = opts;
  const path = track.path;
  const pick = policy === 'steady' ? POLICIES.steady(frac) : POLICIES[policy];

  const seen = new Map();
  const f = frame();
  let s = startS, prevS = startS, t = 0, targetU = 0, lap = 0;

  // How `pace` is applied. It used to multiply the THROTTLE, which on a
  // corner-capped circuit changes nothing: a 0.85-throttle driver still
  // reaches every corner cap and the straights are too short for the
  // difference to bite — the duel measured ZERO passes in four Old Town laps
  // against a 0.85 rival. The comment always said "a driver who lifts a
  // little sooner everywhere", so make it true: the policy is shown a speed
  // scaled UP by 1/pace, so it lifts at pace x every target it has — corner
  // caps, sight caps, top speed — and brakes for them at full strength.
  const sensed = { state: null, sightRange: () => 0 };

  // Everything the driver decides, for one tick. It does not touch the car —
  // the caller feeds the result to step(), so the same driver can be run
  // headless by the harness or attached to a car in the scene.
  function drive(car, dt) {
    t += dt;
    const loc = path.locate(car.state.x, car.state.z, s);
    if (prevS > path.total * 0.8 && loc.s < path.total * 0.2) lap++;
    prevS = loc.s;
    s = loc.s;

    const sight = Math.max(car.sightRange(), isLit(s) ? LIT_SIGHT : 0) * perception;
    for (const h of track.hazards) {
      let ahead = h.s - s;
      if (ahead < -path.total / 2) ahead += path.total;
      if (ahead >= 0 && ahead <= sight && !seen.has(h)) seen.set(h, t);
    }

    // You start moving the moment you see it, after a reaction time. Reaction
    // is a delay; getting across is a distance; they are not the same number.
    targetU = lineU;
    let dodgeAhead = 0;
    for (const h of track.hazards) {
      let ahead = h.s - s;
      if (ahead < -path.total / 2) ahead += path.total;
      if (ahead < 0 || ahead > 460 || !seen.has(h)) continue;
      if (t - seen.get(h) < REACT) continue;
      // JUST PAST THE EDGE, not a fixed lane. The old target was a tuned
      // fraction of the road (0.685·HALF), which was fine when the roads were
      // half this wide; on the doubled carriageway it meant swerving three
      // lanes for a skip, and — worse — the crossing DISTANCE between two
      // opposite-side dodges scales with the road while the driver's lateral
      // ratio (sin of the steering clamp) does not, so wide roads turned the
      // S-flicks back into nose-ins. Aim for the far edge of the widest
      // furniture a hazard builds (the works line spans 1.15·HALF centred on
      // h.u) plus a car and a margin, clamped to the old lane at most.
      const sgn = h.u > 0 ? 1 : -1;
      const edge = h.u - sgn * (ROAD_HALF * 0.725 + 46);
      const most = ROAD_HALF * 0.685;
      targetU = sgn > 0 ? Math.max(edge, -most) : Math.min(edge, most);
      dodgeAhead = ahead;
      break;
    }

    path.at(s, f);
    const want = Math.atan2(f.tx, f.tz);
    const off = (targetU - loc.u) / 90;
    // 0.75, not 0.5. The clamp is the driver's whole lateral authority: at 0.5
    // rad it can cross at most sin(0.5) = 0.48 voxels of road per voxel of
    // travel, and the Parade's opposite-side hazard pairs 270 apart need 0.61
    // — the S-flick was geometrically impossible at ANY speed, which is why
    // the same two wagons collected a nose-in every single lap. 0.75 gives
    // 0.68, enough with the hazard braking above to arrive making the shape.
    let dh = want - car.state.heading + Math.max(-0.75, Math.min(0.75, off));
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;

    // Dodging is not enough: the driver would hold full throttle into a hazard
    // it had SEEN but could not physically get across from, and nose in at
    // 150+ — every lap, at the same two opposite-side pairs, which is where
    // all the wedge-teleports came from.
    //
    // Crossing RATE is proportional to speed (the clamp above caps lateral
    // travel per voxel of road, not per second), so braking cannot buy road —
    // what it buys is the fixed-time costs: the reaction residue and the
    // steering transient. So brake only when the geometry is genuinely
    // marginal — the road left is less than ~1.6x the lateral distance, right
    // at the clamp's limit — and never below 120, so a marginal dodge is taken
    // at speed with margin rather than at a crawl. Unseen hazards still
    // surprise at full speed: that is the sight mechanic, and it stays.
    // pace !== 1, not < 1: a pace ABOVE one is a driver who commits later
    // than the policy would — the same shim run the other way, and the knob
    // that finally makes the front of the field worth chasing.
    let pcar = car;
    if (pace !== 1) {
      sensed.state = { speed: car.state.speed / pace };
      sensed.sightRange = () => car.sightRange();
      sensed.gripFactor = () => (car.gripFactor ? car.gripFactor() : 1);
      pcar = sensed;
    }
    let throttle = pick(pcar, s, path);
    if (dodgeAhead > 30) {
      const gap = Math.abs(targetU - loc.u);
      if (gap > 12 && dodgeAhead < gap * 1.6 && car.state.speed > 120) throttle = -1;
    }
    return {
      throttle,
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
    // Re-seat after a wedge respawn WITHOUT restarting the race. The harnesses
    // used reset() for this, which zeroed `lap` — so any measured run that
    // wedged silently started its race over, and a part's "value" became
    // whether the baseline happened to wedge (three parts on two tracks all
    // reported the identical 5.85s, which was one respawn cycle, not a part).
    reseat(atS) { s = prevS = atS; },
  };
}
