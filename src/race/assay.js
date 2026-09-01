// Does this circuit do what it claims?
//
// sim.js asks ONE question — does the dark change how you drive — because when
// I wrote it there was one track and that was its whole design. There are four
// now and each was built around a different claim, none of them tested:
//
//   the parade    the beam is shorter than your braking distance
//   the old town  the narrowness costs you time
//   the docks     the wet changes the driving, not just the picture
//   the ring road the crests hide the road
//
// That matters because the Parade's claim measured DECORATIVE TWICE before it
// was true. Three more claims written by the same person on the same afternoon
// is not evidence. Each track declares its question here and gets measured on
// it, and the answer is allowed to be no.
//
// Every assay is an A/B against the SAME track with one thing changed, because
// an absolute lap time means nothing on its own — the only useful question is
// "compared with what".
import { buildCar, V_MAX } from './car.js';
import { Ground } from '../walk.js';
import { createDriver, cornerSpeed } from './driver.js';
import { safeSpot } from './track.js';
import { compare } from './sim.js';

// One flying lap, with knobs. Returns time and contact count.
function lap(track, opts = {}) {
  const { policy = 'racing', wet = 0, tune = {}, laps = 1 } = opts;
  const dt = 1 / 120;
  const ground = new Ground(track.field);
  const c = buildCar(0, tune);
  c.setWet(wet);
  c.state.x = track.start.x;
  c.state.z = track.start.z;
  c.state.heading = track.start.heading;
  c.state.y = c.state.yView = track.elev(80) - 1;

  const driver = createDriver(track, { policy, startS: 80 });
  let t = 0, contacts = 0, wedges = 0, wasDown = false, offRoad = 0;
  const LIMIT = 90 * laps + 60;

  while (driver.lap < laps && t < LIMIT) {
    const d = driver.drive(c, dt);
    c.state.offRoad = Math.abs(d.u) > track.roadHalf - 4;
    if (c.state.offRoad) offRoad += dt;
    if (c.state.crash > 0 && !wasDown) contacts++;
    wasDown = c.state.crash > 0;
    if (c.state.wedged) {
      c.state.wedged = false;
      wedges++;
      const spot = safeSpot(track.path, ground, d.s);
      // reseat, not reset — reset() zeroed the lap counter, so a wedged
      // baseline restarted its race and the A/B measured the wedge, not the
      // part. Three parts on two tracks once reported the identical 5.85s:
      // the cost of one respawn cycle.
      if (spot) { c.respawn(spot.x, spot.z, spot.heading, track.elev(spot.s) - 1); driver.reseat(spot.s); }
    }
    c.step(dt, d.throttle, d.steer, ground, false, false);
    t += dt;
  }
  return {
    time: +t.toFixed(2),
    finished: driver.lap >= laps,
    contacts,
    wedges,
    offRoad: +offRoad.toFixed(1),
    avg: +(c.state.dist / t).toFixed(1),
  };
}

// ---------------------------------------------------------------- the assays
const ASSAYS = {
  // "your beam is shorter than your braking distance."
  //
  // DELEGATED to sim.js rather than reimplemented here. My first version counted
  // contacts on a single racing lap against a single cautious one and called a
  // 2-versus-3 difference a result; sim.js already tracks BLIND hits — the ones
  // where the driver had less than a reaction's warning — and reads time and
  // risk together. Two implementations of the same measurement is how the thing
  // you tune against stops being the thing you play, which is the mistake
  // driver.js exists to avoid.
  sight(track) {
    const r = compare(track);
    const racing = r.rows.find(x => x.policy === 'racing');
    const cautious = r.rows.find(x => x.policy === 'cautious');
    return {
      claim: 'the dark costs you',
      rows: { racing, cautious },
      holds: /doing work|REAL TRADE|CAUTIOUS WINS/.test(r.verdict),
      say: r.verdict,
    };
  },

  // "the narrowness costs you."
  //
  // My first version of this ran the lap again with 35% more grip and brakes and
  // asked whether it got faster. It got SLOWER — the bot carried more speed into
  // corners it could not place the car in and hit more walls. That measured the
  // DRIVER, not the track, which is the same trap that made the lighting look
  // decorative twice. A poor driver makes any track look demanding.
  //
  // So measure the geometry, which does not have opinions: how wide is the
  // drivable corridor, in CAR WIDTHS, all the way round? A road you cannot place
  // a car in is one where that number is small — whoever is steering.
  width(track, ground) {
    const CAR = 26;
    const f = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
    const widths = [];
    for (let s = 0; s < track.path.total; s += 8) {
      const road = track.elev(s) - 1;
      let best = 0, run = 0;
      for (let u = -track.roadHalf; u <= track.roadHalf; u += 2) {
        track.path.place(s, u, f);
        const fl = ground.ceilingAt(f.x, f.z);
        const ok = !ground.isBlocked(f.x, f.z) && Math.abs(fl - road) <= 10;
        if (ok) { run += 2; best = Math.max(best, run); } else run = 0;
      }
      widths.push(best / CAR);
    }
    widths.sort((p, q) => p - q);
    const median = widths[widths.length >> 1];
    const tightest = widths[0];
    const pinched = widths.filter(w => w < 3).length / widths.length;
    return {
      claim: 'the road is tight enough to have to place the car',
      rows: {
        medianCarWidths: +median.toFixed(2),
        tightestCarWidths: +tightest.toFixed(2),
        percentUnder3Wide: Math.round(pinched * 100),
      },
      // Bounded BELOW as well as above. 3.6 car widths measured as "you have
      // to aim it" and drove like a corridor; a road you cannot race two cars
      // down fails this claim in the other direction.
      //
      // RECALIBRATED with the city-wide widening (playtest, 2026-09-01): a
      // human drove the old 5.9-car-width median and called the whole city
      // narrow. The Old Town's claim is now RELATIVE — clearly the tightest
      // road in the city (its 130 half against the Parade's 280) — and the
      // absolute window moves to match what was actually driven.
      holds: median >= 7 && median < 13 && pinched < 0.15,
      say: `median corridor ${median.toFixed(1)} car widths, tightest ${tightest.toFixed(1)}`
        + `, ${Math.round(pinched * 100)}% of the lap under three`
        + ` — ${median < 7 ? 'too tight to race two cars down'
          : median >= 13 ? 'room to be sloppy; the narrowness is set dressing'
          : 'tight enough to place the car, wide enough to fight over'}`,
    };
  },

  // "the wet changes the driving." Same lap, same driver, wet and dry.
  grip(track) {
    const dry = lap(track, { policy: 'racing', wet: 0 });
    const wet = lap(track, { policy: 'racing', wet: track.spec.wet || 1 });
    const cost = wet.time - dry.time;
    return {
      claim: 'the wet changes the driving',
      rows: { dry, wet },
      holds: cost > 1.5,
      say: `dry ${dry.time}s, wet ${wet.time}s — the water costs ${cost.toFixed(2)}s`
        + ` — ${cost > 1.5 ? 'and that is a different lap' : 'which is inside the noise; the rain is a filter'}`,
    };
  },

  // "the crests hide the road." Geometry, not a lap: at every point, how far
  // can you SEE over the brow, and how far do you need to stop from the speed
  // you arrive at? If sight always exceeds stopping distance the crests are
  // scenery, whatever they look like.
  crests(track) {
    const BRAKE = 130;                       // v/s^2, the car's real figure
    let worst = null, blindCount = 0, samples = 0;
    for (let s = 0; s < track.path.total; s += 12) {
      const here = track.elev(s);
      // sight over the brow: the first point ahead that rises above the line
      // of sight from 20 voxels up
      let sight = 600;
      for (let d = 40; d < 600; d += 12) {
        const ahead = track.elev(s + d);
        if (ahead > here + 20 + (d * 0.02)) { sight = d; break; }
      }
      const v = Math.min(V_MAX, cornerSpeed(track.path, s, 420));
      const stop = (v * v) / (2 * BRAKE);
      samples++;
      if (stop > sight) {
        blindCount++;
        if (!worst || stop - sight > worst.margin) {
          worst = { s: Math.round(s), sight: Math.round(sight), stop: Math.round(stop), margin: stop - sight };
        }
      }
    }
    const pct = Math.round((blindCount / samples) * 100);
    return {
      claim: 'the crests hide the road',
      rows: { blindSamples: blindCount, of: samples, worst },
      holds: pct >= 5,
      say: `${pct}% of the lap you cannot stop inside what you can see over the brow`
        + (worst ? ` — worst at s=${worst.s}: ${worst.sight} sight vs ${worst.stop} to stop` : '')
        + ` — ${pct >= 5 ? 'the relief is doing work' : 'the crests are scenery'}`,
    };
  },
};

export function assay(track) {
  const which = track.spec.asks || 'sight';
  const fn = ASSAYS[which];
  if (!fn) { console.error('assay: no such question "' + which + '"'); return null; }
  const out = fn(track, new Ground(track.field));
  console.log(`%c${track.name} — ${out.claim}`, 'font-weight:bold');
  console.log((out.holds ? '  HOLDS   ' : '  FAILS   ') + out.say);
  console.table(out.rows);
  return { track: track.id, question: which, ...out };
}

// What each upgrade actually buys, on THIS track. A part that moves no number
// here is a part that should not be for sale.
export function parts(track) {
  // The baseline has to run in the SAME conditions as the parts, or on a wet
  // circuit every upgrade appears to cost you five seconds — which is the rain,
  // not the part. An A/B with two variables is not an A/B.
  //
  // And the same POLICY. The racing head never reads sightRange(), so a bigger
  // beam could not show value through it on any circuit — the one upgrade the
  // whole lighting design hangs on measured at zero on the two tracks it must
  // matter on. Beam is A/B'd through the CAUTIOUS head, the one that drives by
  // what it can see, against a cautious baseline.
  const wet = track.spec.wet || 0;
  const base = lap(track, { policy: 'racing', wet });
  const baseSighted = lap(track, { policy: 'cautious', wet });
  const each = {};
  for (const [k, v] of Object.entries({ vmax: 1.25, brake: 1.6, grip: 1.32, beam: 1.9 })) {
    const pol = k === 'beam' ? 'cautious' : 'racing';
    const ref = k === 'beam' ? baseSighted : base;
    const r = lap(track, { policy: pol, tune: { [k]: v }, wet });
    // A part the DRIVER cannot use is not a part that costs you time — it is a
    // measurement the harness cannot make. Saying "-110s" would be a lie about
    // the part when it is a fact about the bot.
    each[k] = r.finished
      ? { time: r.time, saves: +(ref.time - r.time).toFixed(2), contacts: r.contacts,
          ...(r.wedges || ref.wedges ? { note: `wedged ${ref.wedges}v${r.wedges} — treat the number as suspect` } : {}) }
      : { time: null, saves: null, contacts: r.contacts, note: 'driver could not finish with this fitted' };
  }
  console.log(`%c${track.name} — what a fully fitted part is worth`, 'font-weight:bold');
  console.log('  baseline ' + base.time + 's (sighted ' + baseSighted.time + 's for beam)');
  console.table(each);
  return { track: track.id, base: base.time, baseSighted: baseSighted.time, each };
}
