// The measurement.
//
// The dynamo is either a decision or it is decoration with a light attached,
// and the difference is a number, not a feeling. This drives the same bike
// down the same track under different throttle policies and reports the times.
//
// If FLAT OUT wins, the mechanic does not exist: the answer to every situation
// is the same and the lamp is a mood light. If MODULATED wins — sprint where
// the streetlights carry you, ease off where only the lamp does — then the
// fast line and the safe line have actually diverged, which is the whole
// design claim.
//
// The rider model is deliberately simple and stated rather than hidden: it
// tracks the racing line, it can only see a hazard once the hazard is inside
// the lamp's reach, and it needs REACTION seconds of sight to move off the
// line and miss it. Anything it does not see in time, it hits.
import { buildRider, V_MAX, REACTION } from './bike.js';
import { ROAD_HALF, isLit, safeSpot } from './track.js';
import { Ground } from '../walk.js';
import { frame } from './path.js';

// Where the streetlights let you see regardless of the lamp. This is the other
// half of the trade — a lit section is one where the world lends you sight.
const LIT_SIGHT = 320;

const POLICIES = {
  // everything, all the time
  flat: () => 1,
  // never exceed the speed you could stop or swerve from, given what you can
  // see. In the lit sections that ceiling is high, so this pedals hard there.
  modulated: (b, s) => {
    const sight = Math.max(b.sightRange(), isLit(s) ? LIT_SIGHT : 0);
    const safe = sight / (REACTION * 1.12);      // a little margin, not a lot
    return b.state.speed < safe ? 1 : -0.35;
  },
  // a flat fraction of top speed, for a control
  steady: (frac) => (b) => (b.state.speed < V_MAX * frac ? 1 : -0.2),
};

export function run(track, policyName, opts = {}) {
  const dt = opts.dt || 1 / 120;
  const policy = policyName === 'steady'
    ? POLICIES.steady(opts.frac || 0.75)
    : POLICIES[policyName];
  const ground = new Ground(track.field);
  const rider = buildRider(opts.look || {});
  const b = rider;
  const path = track.path;

  b.state.x = track.start.x;
  b.state.z = track.start.z;
  b.state.heading = track.start.heading;
  b.state.speed = 0;

  const seen = new Map();                 // hazard -> time it entered the lamp
  let t = 0, s = 90, crashes = 0, targetU = 0, blindHits = 0, wasDown = false, downAt = 0;
  const f = frame();
  const FINISH = path.total - 80;
  const LIMIT = 240;                      // seconds; a stuck run must end

  const trace = [];
  let nextTrace = 0;
  while (s < FINISH && t < LIMIT) {
    const loc = path.locate(b.state.x, b.state.z, s);
    s = loc.s;
    if (opts.trace && t >= nextTrace) {
      nextTrace += 1;
      trace.push({ t: +t.toFixed(1), s: Math.round(s), u: +loc.u.toFixed(1), sp: +b.state.speed.toFixed(0) });
    }
    const sight = Math.max(b.sightRange(), isLit(s) ? LIT_SIGHT : 0);

    // what can the rider see, and how long have they had to act on it
    for (const h of track.hazards) {
      const ahead = h.s - s;
      if (ahead < 0 || ahead > sight) continue;
      if (!seen.has(h)) seen.set(h, t);
    }
    // steer around the nearest seen hazard that is close enough to matter
    targetU = 0;
    for (const h of track.hazards) {
      const ahead = h.s - s;
      if (ahead < 0 || ahead > 300 || !seen.has(h)) continue;
      const react = t - seen.get(h);
      if (react < REACTION) continue;                 // seen, but not in time
      targetU = h.u > 0 ? -(ROAD_HALF - 14) : (ROAD_HALF - 14);
      break;
    }

    // Crashes are counted from the BIKE, not from a declared radius: the
    // physics decides whether you hit something, and the only job here is
    // to attribute it and ask whether it was avoidable.
    if (b.state.crash > 0 && !wasDown) {
      crashes++;
      downAt = s;
      let near = null, bestD = 90;
      for (const h of track.hazards) {
        const d = Math.abs(h.s - s);
        if (d < bestD) { bestD = d; near = h; }
      }
      if (near) {
        near.hit = true;
        if (!seen.has(near) || t - seen.get(near) < REACTION) blindHits++;
      }
    }
    // back on the bike, somewhere that is actually clear
    if (wasDown && b.state.crash <= 0) {
      const spot = safeSpot(path, ground, downAt);
      if (spot) { b.respawn(spot.x, spot.z, spot.heading); s = spot.s; }
    }
    wasDown = b.state.crash > 0;

    // aim at the target line
    path.at(s, f);
    const want = Math.atan2(f.tx, f.tz);
    const off = (targetU - loc.u) / 60;
    let dh = want - b.state.heading + Math.max(-0.5, Math.min(0.5, off));
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dh * 2.6));

    b.step(dt, policy(b, s), steer, ground);
    t += dt;
  }

  const detail = track.hazards.map(h => ({
    s: h.s, u: h.u, lit: isLit(h.s),
    seen: seen.has(h) ? +(seen.get(h)).toFixed(2) : null,
    hit: !!h.hit,
  }));
  for (const h of track.hazards) { h.done = false; h.hit = false; }
  return {
    policy: policyName + (policyName === 'steady' ? ` ${Math.round((opts.frac || 0.75) * 100)}%` : ''),
    time: +t.toFixed(2),
    finished: s >= FINISH,
    crashes,
    blindHits,
    avgSpeed: +(b.state.dist / t).toFixed(1),
    detail,
    trace,
  };
}

// The verdict. Runs every policy over the same track and says out loud whether
// the mechanic exists.
export function compare(track, look) {
  const rows = [
    run(track, 'flat', { look }),
    run(track, 'modulated', { look }),
    run(track, 'steady', { frac: 0.6, look }),
    run(track, 'steady', { frac: 0.75, look }),
    run(track, 'steady', { frac: 0.9, look }),
  ];
  const best = rows.slice().sort((a, b) => a.time - b.time)[0];
  const flat = rows.find(r => r.policy === 'flat');
  const mod = rows.find(r => r.policy === 'modulated');
  return {
    rows,
    best: best.policy,
    // the headline: is riding to your light faster than riding flat out
    verdict: mod.time < flat.time
      ? `MODULATED WINS by ${(flat.time - mod.time).toFixed(2)}s — the lamp is a decision`
      : `FLAT OUT WINS by ${(mod.time - flat.time).toFixed(2)}s — the lamp is decoration`,
    margin: +(flat.time - mod.time).toFixed(2),
  };
}
