// The measurement.
//
// With a car, every policy has to brake for the corners — top speed needs a
// 505-voxel radius and the corners are 380 — so "flat out" is no longer a
// strategy, it is a crash. The question the harness asks now is narrower and
// more useful:
//
//   given that everyone brakes for corners, does the DARK change how you drive?
//
// RACING brakes for corners and ignores the light. CAUTIOUS brakes for corners
// and also caps its speed to what it can see on the unlit stretches. If they
// tie, the unlit sections are a paint job. If cautious wins, the lighting is
// doing work.
//
// The driver model is stated rather than hidden: it tracks the racing line, it
// can only see a hazard once the hazard is inside its sight range, and it needs
// WARNING seconds of sight to move a lane sideways. What it does not see, it
// hits.
import { buildCar, V_MAX, WARNING } from './car.js';
import { ROAD_HALF, isLit, safeSpot } from './track.js';
import { Ground } from '../walk.js';
import { frame } from './path.js';

// What the streetlights lend you regardless of your headlights.
const LIT_SIGHT = 520;
const REACT = 0.35;                    // spotting it and deciding, before the wheel moves
const TURN_AT_SPEED = 0.55;            // rad/s available near top speed

// Fastest you can take what is coming, straight out of the path's curvature.
const probeA = frame(), probeB = frame();
function cornerSpeed(path, s, lookahead) {
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

const POLICIES = {
  racing: (c, s, path) => (c.state.speed < cornerSpeed(path, s, 420) ? 1 : -1),
  cautious: (c, s, path) => {
    const sight = Math.max(c.sightRange(), isLit(s) ? LIT_SIGHT : 0);
    const want = Math.min(cornerSpeed(path, s, 420), sight / (WARNING * 1.05));
    return c.state.speed < want ? 1 : -1;
  },
  steady: (frac) => (c, s, path) => {
    const want = Math.min(V_MAX * frac, cornerSpeed(path, s, 420));
    return c.state.speed < want ? 1 : -0.6;
  },
};

export function run(track, policyName, opts = {}) {
  const dt = opts.dt || 1 / 120;
  const policy = policyName === 'steady'
    ? POLICIES.steady(opts.frac || 0.8)
    : POLICIES[policyName];
  const ground = new Ground(track.field);
  const c = buildCar(0);
  const path = track.path;
  const laps = opts.laps || 1;

  c.state.x = track.start.x;
  c.state.z = track.start.z;
  c.state.heading = track.start.heading;
  c.state.speed = 0;

  const seen = new Map();
  let t = 0, s = 80, lap = 0, crashes = 0, blindHits = 0;
  let targetU = 0, wasDown = false, downAt = 0, prevS = 80;
  const f = frame();
  const LIMIT = 70 * laps + 90;
  const trace = [], crashLog = [];
  let nextTrace = 0;

  while (lap < laps && t < LIMIT) {
    const loc = path.locate(c.state.x, c.state.z, s);
    if (prevS > path.total * 0.8 && loc.s < path.total * 0.2) lap++;   // crossed the line
    prevS = loc.s;
    s = loc.s;

    if (opts.trace && t >= nextTrace) {
      nextTrace += 1;
      trace.push({ t: +t.toFixed(1), s: Math.round(s), u: +loc.u.toFixed(1), sp: Math.round(c.state.speed) });
    }

    const sight = Math.max(c.sightRange(), isLit(s) ? LIT_SIGHT : 0);
    for (const h of track.hazards) {
      let ahead = h.s - s;
      if (ahead < -path.total / 2) ahead += path.total;
      if (ahead < 0 || ahead > sight) continue;
      if (!seen.has(h)) seen.set(h, t);
    }
    // You start moving the moment you see it, after a driver's reaction time.
    // The first version waited WARNING seconds after sighting and THEN moved,
    // which is a dead time followed by teleporting sideways — it made a
    // 280-voxel beam and a 178 voxel/second crawl arrive 13 voxels short, so
    // slowing down for the dark bought nothing and the harness reported the
    // lighting as decoration. Reaction is a delay; getting across is a
    // distance; they are not the same number.
    targetU = 0;
    for (const h of track.hazards) {
      let ahead = h.s - s;
      if (ahead < -path.total / 2) ahead += path.total;
      if (ahead < 0 || ahead > 460 || !seen.has(h)) continue;
      if (t - seen.get(h) < REACT) continue;
      // 26 in from the edge, not 18: the lateral controller overshoots its
      // target by about eight voxels and the car is eighteen wide, so aiming at
      // 18 put the outside wheels on the kerb every time.
      targetU = h.u > 0 ? -(ROAD_HALF - 26) : (ROAD_HALF - 26);
      break;
    }

    // crashes come from the physics, not from a declared radius
    if (c.state.crash > 0 && !wasDown) {
      crashes++;
      downAt = s;
      crashLog.push({ s: Math.round(s), u: +loc.u.toFixed(1), sp: Math.round(c.state.speed), want: Math.round(targetU) });
      let near = null, bestD = 130;
      for (const h of track.hazards) {
        const d = Math.abs(h.s - s);
        if (d < bestD) { bestD = d; near = h; }
      }
      if (near) {
        near.hit = true;
        if (!seen.has(near) || t - seen.get(near) < WARNING) blindHits++;
      }
    }
    if (wasDown && c.state.crash <= 0) {
      const spot = safeSpot(path, ground, downAt);
      if (spot) { c.respawn(spot.x, spot.z, spot.heading); s = prevS = spot.s; }
    }
    wasDown = c.state.crash > 0;

    path.at(s, f);
    const want = Math.atan2(f.tx, f.tz);
    const off = (targetU - loc.u) / 90;
    let dh = want - c.state.heading + Math.max(-0.5, Math.min(0.5, off));
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dh * 3.2));

    c.step(dt, policy(c, s, path), steer, ground);
    t += dt;
  }

  const detail = track.hazards.map(h => ({ s: h.s, lit: isLit(h.s), hit: !!h.hit }));
  for (const h of track.hazards) h.hit = false;
  return {
    policy: policyName + (policyName === 'steady' ? ` ${Math.round((opts.frac || 0.8) * 100)}%` : ''),
    time: +t.toFixed(2),
    finished: lap >= laps,
    crashes,
    blindHits,
    avgSpeed: +(c.state.dist / t).toFixed(1),
    detail,
    trace,
    crashLog,
  };
}

// The verdict. Same track, same car, different heads.
export function compare(track, opts = {}) {
  const rows = [
    run(track, 'racing', opts),
    run(track, 'cautious', opts),
    run(track, 'steady', { ...opts, frac: 0.65 }),
    run(track, 'steady', { ...opts, frac: 0.8 }),
    run(track, 'steady', { ...opts, frac: 0.95 }),
  ];
  const finished = rows.filter(r => r.finished);
  const best = finished.slice().sort((a, b) => a.time - b.time)[0];
  const racing = rows.find(r => r.policy === 'racing');
  const cautious = rows.find(r => r.policy === 'cautious');
  // The verdict reads TIME AND RISK TOGETHER, because reading time alone lies.
  //
  // It once declared "the unlit sections are a paint job" off a 0.31-second gap
  // in a deterministic sim — while racing was taking two blind hits to
  // cautious's none. That is not a paint job, it is a knife-edge trade: driving
  // the dark flat out is worth almost exactly what it costs, which is the best
  // outcome a risk mechanic can have. A tie is a RESULT, not a failure to find
  // a winner, and 0.31s of a 40-second lap is not a difference at all.
  const gap = cautious.time - racing.time;        // positive means racing is faster
  const risk = racing.blindHits - cautious.blindHits;
  const TIE = 1.2;                                // seconds, on a ~40s lap

  let verdict;
  if (!racing.finished || !cautious.finished) {
    verdict = 'INCONCLUSIVE — a policy did not finish; fix that before reading the times';
  } else if (Math.abs(gap) < TIE && risk > 0 && gap > 0) {
    // Inside the noise band on time, and racing is the one taking the hits:
    // the dark is charging almost exactly what the speed is worth.
    verdict = `A REAL TRADE — racing is ${gap.toFixed(2)}s faster and pays for it with `
      + `${racing.blindHits} blind hit${racing.blindHits === 1 ? '' : 's'} to cautious's `
      + `${cautious.blindHits}. The dark prices the speed almost exactly.`;
  } else if (Math.abs(gap) < TIE && risk > 0) {
    // Same lap time AND fewer hits is not a trade, it is a free lunch: there is
    // no reason left to drive the dark flat out.
    verdict = `CAUTIOUS WINS — level on time (${Math.abs(gap).toFixed(2)}s) and `
      + `${risk} fewer blind hit${risk === 1 ? '' : 's'}; racing is not buying anything`;
  } else if (Math.abs(gap) < TIE) {
    verdict = `TIED at ${Math.abs(gap).toFixed(2)}s with no risk difference — `
      + 'neither policy is being asked anything; the dark is not doing work';
  } else if (gap < 0) {
    verdict = `CAUTIOUS WINS by ${(-gap).toFixed(2)}s — the dark is doing work`;
  } else if (risk > 0) {
    verdict = `RACING WINS by ${gap.toFixed(2)}s DESPITE ${risk} more blind hit`
      + `${risk === 1 ? '' : 's'} — the dark is underpriced, the crash penalty is too cheap`;
  } else {
    verdict = `RACING WINS by ${gap.toFixed(2)}s and takes no more hits — `
      + 'the unlit sections are a paint job';
  }
  return { rows, best: best && best.policy, verdict, margin: +gap.toFixed(2), risk };
}
