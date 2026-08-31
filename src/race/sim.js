// The measurement.
//
// The question it asks is narrow and useful: given that everyone has to brake
// for the corners, does the DARK change how you drive?
//
// RACING brakes for corners and ignores the light. CAUTIOUS brakes for corners
// and also caps its speed to what it can see on the unlit stretches. If they
// tie, the unlit sections are a paint job. If cautious wins, the lighting is
// doing work.
//
// The driver itself now lives in driver.js, because the rival you race on the
// track is the same code. Two implementations would drift, and then the thing
// I tune against would stop being the thing you play against.
import { buildCar } from './car.js';
import { safeSpot } from './track.js';
import { Ground } from '../walk.js';
import { createDriver } from './driver.js';
import { isLit } from './track.js';

export function run(track, policyName, opts = {}) {
  const dt = opts.dt || 1 / 120;
  const ground = new Ground(track.field);
  const c = buildCar(0);
  const path = track.path;
  const laps = opts.laps || 1;

  c.state.x = track.start.x;
  c.state.z = track.start.z;
  c.state.heading = track.start.heading;
  c.state.speed = 0;
  c.state.y = c.state.yView = track.elev(80) - 1;

  const driver = createDriver(track, {
    policy: policyName, frac: opts.frac || 0.8, startS: 80,
  });
  const seen = driver.hazardsSeen;

  let t = 0, crashes = 0, blindHits = 0, wasDown = false, s = 80;
  const LIMIT = 70 * laps + 90;
  const trace = [], crashLog = [];
  let nextTrace = 0;

  while (driver.lap < laps && t < LIMIT) {
    const d = driver.drive(c, dt);
    s = d.s;

    if (opts.trace && t >= nextTrace) {
      nextTrace += 1;
      trace.push({ t: +t.toFixed(1), s: Math.round(s), u: +d.u.toFixed(1), sp: Math.round(c.state.speed) });
    }

    // crashes come from the physics, not from a declared radius
    if (c.state.crash > 0 && !wasDown) {
      crashes++;
      crashLog.push({ s: Math.round(s), u: +d.u.toFixed(1), sp: Math.round(c.state.speed) });
      let near = null, bestD = 130;
      for (const h of track.hazards) {
        const dd = Math.abs(h.s - s);
        if (dd < bestD) { bestD = dd; near = h; }
      }
      if (near) {
        near.hit = true;
        if (!seen.has(near) || t - seen.get(near) < 1.5) blindHits++;
      }
    }
    wasDown = c.state.crash > 0;
    if (c.state.wedged) {
      c.state.wedged = false;
      const spot = safeSpot(path, ground, s);
      if (spot) { c.respawn(spot.x, spot.z, spot.heading, track.elev(spot.s) - 1); driver.reset(spot.s); }
    }

    // allowReverse false: the braking policy holds throttle at -1 through every
    // corner, and would otherwise select reverse and drive the lap backwards.
    c.step(dt, d.throttle, d.steer, ground, false, false);
    t += dt;
  }

  const detail = track.hazards.map(h => ({ s: h.s, lit: isLit(h.s), hit: !!h.hit }));
  for (const h of track.hazards) h.hit = false;
  return {
    policy: policyName + (policyName === 'steady' ? ` ${Math.round((opts.frac || 0.8) * 100)}%` : ''),
    time: +t.toFixed(2),
    finished: driver.lap >= laps,
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
