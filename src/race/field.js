// A grid, rather than one opponent.
//
// There has been exactly one rival since there was anybody to race at all, and
// it started alongside you — which makes every race a duel and makes the width
// of the road irrelevant, because two cars never have to share a corner. A
// field is the reason the roads got twice as wide, and the reason the drift
// boost is worth banking: somewhere to spend it.
//
// YOU START AT THE BACK. Partly because it gives every race a job — a lap where
// nothing is in front of you is a time trial with scenery — and partly for a
// duller reason: the lap counter fires when s wraps past zero, so a grid laid
// out BEHIND the line would have every car on it complete a lap in the first
// second. The grid runs forward from the line and the player is on the last row.
import { buildRival } from './rival.js';
import { ROAD_HALF } from './track.js';

// Six is what the roads were widened for: three rows of two, and a car is 26
// voxels wide on a carriageway that is 300 at its narrowest -- EXCEPT on the
// Old Town, which was narrowed back to keep the one thing it is for. A circuit
// declares its own entry list; six is only the default.
export const FIELD_SIZE = 6;
export const fieldSizeOf = (spec) => Math.max(2, Math.min(RUNNERS.length + 1, spec.field || FIELD_SIZE));
// A car is 58 voxels long, so 62 was bumper to bumper: the row in front filled
// the windscreen and your own headlights bloomed off the back of it. 108 is a
// car length of daylight between rows, which is what a grid looks like.
const ROW = 108;
const GRID_S = 80;              // where the back row sits

// The names are the only characterisation anybody gets, so they carry the whole
// job of making a mirror full of headlights feel like a field of drivers. Pace
// is the only thing that differs mechanically — same car, same physics, less
// ambition — because a rival that cheats is not somebody you can learn from.
// These numbers only mean something because of how driver.js applies them:
// pace scales the driver's TARGETS (it lifts at pace x every cap), not the
// throttle. As a throttle multiplier the whole 1.00–0.90 spread collapsed to
// zero on corner-capped circuits and grid position decided every race.
// Each rival now has a LINE (the lane it prefers when nothing needs dodging
// — six centreline drivers were a train), a visual KIT (parts with no tune,
// so they look different without driving different physics), and a pace
// spread that finally puts somebody above 1.00: Vasey commits harder than
// the policy would, and catching him is the game.
const RUNNERS = [
  { name: 'Vasey', policy: 'racing', pace: 1.03, paint: 2, lineU: -26, parts: { engine: 2, tyres: 1, lamps: 1 } },
  { name: 'Ó Broin', policy: 'racing', pace: 1.00, paint: 5, lineU: 30, parts: { engine: 1, tyres: 2 } },
  { name: 'Hale', policy: 'cautious', pace: 1.00, paint: 1, lineU: -44, parts: { lamps: 2, brakes: 1 } },
  { name: 'Ferreira', policy: 'racing', pace: 0.96, paint: 6, lineU: 48, parts: { engine: 1 } },
  { name: 'Pike', policy: 'cautious', pace: 0.97, paint: 4, lineU: 12, parts: { tyres: 1, brakes: 1 } },
  { name: 'Wren', policy: 'steady', pace: 0.92, paint: 7, lineU: -12, parts: {} },
];

// Slot 0 is the back-left of the grid and belongs to the player; slots count
// forward, so slot 5 is on pole and is the one you have to catch.
export function gridSlot(i) {
  const row = Math.floor(i / 2);
  const lane = ROAD_HALF * 0.30;
  return { s: GRID_S + row * ROW, u: (i % 2 ? 1 : -1) * lane };
}

export function buildField(track, ground, buildCar, { count = FIELD_SIZE, playerPaint = 0 } = {}) {
  const cars = [];
  for (let i = 1; i < count; i++) {
    const r = RUNNERS[(i - 1) % RUNNERS.length];
    const slot = gridSlot(i);
    // Never the player's own paint: in a mirror at night a car is a colour and
    // two sets of tail lights, and two identical ones is a bug report.
    let paint = r.paint;
    if (paint === playerPaint) paint = (paint + 4) % 8;
    const rival = buildRival(track, ground, buildCar, {
      paint, policy: r.policy, pace: r.pace, startS: slot.s, startU: slot.u,
      lineU: r.lineU || 0, parts: r.parts || null,
    });
    rival.name = r.name;
    rival.pace = r.pace;
    cars.push(rival);
  }

  return {
    cars,
    addTo(scene) { for (const c of cars) scene.add(c.root); },
    start() { for (const c of cars) c.start(); },
    reset() { for (const c of cars) c.reset(); },
    update(dt, laps, player) {
      for (const c of cars) c.update(dt, laps, player);
      // Rivals have no car-vs-car collision and were driving through each
      // other. This is not physics, just manners — and it is RECTANGLE
      // manners now: the old 40-voxel circle matched the car's width but a
      // car is 58 LONG, so nose-to-tail pairs still overlapped by a wheelbase
      // and the playtest saw them fused into one vehicle. Test in the lead
      // car's own frame and push apart mostly SIDEWAYS, which is both what
      // reads and what un-stacks a train.
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i].car.state, b = cars[j].car.state;
        const dx = b.x - a.x, dz = b.z - a.z;
        const sh = Math.sin(a.heading), ch = Math.cos(a.heading);
        const along = dx * sh + dz * ch;         // + is ahead of a
        const side = dx * ch - dz * sh;          // + is to a's right
        if (Math.abs(along) > 66 || Math.abs(side) > 32) continue;
        const pushS = Math.min(2.6, (32 - Math.abs(side)) * 0.22 + 0.6);
        const dirS = Math.sign(side || (i % 2 ? 1 : -1));
        // sideways separation, plus a small along-nudge so a dead-astern
        // pair splits instead of see-sawing
        const pushA = Math.min(1.2, (66 - Math.abs(along)) * 0.05);
        const dirA = Math.sign(along || 1);
        a.x -= (ch * dirS * pushS + sh * dirA * pushA) * 0.5;
        a.z -= (-sh * dirS * pushS + ch * dirA * pushA) * 0.5;
        b.x += (ch * dirS * pushS + sh * dirA * pushA) * 0.5;
        b.z += (-sh * dirS * pushS + ch * dirA * pushA) * 0.5;
      }
    },
    setWet(w) { for (const c of cars) c.car.setWet(w); },

    // The first car whose box you are inside. One per frame is enough — you
    // cannot meaningfully hit two things in a sixtieth of a second, and taking
    // the first keeps the contact response a single impulse rather than a
    // sum of them, which is what used to launch the car.
    hits(x, z, heading) {
      for (const c of cars) if (c.hits(x, z, heading)) return c;
      return null;
    },

    // Where everybody is, furthest first. Progress is distance ALONG THE TRACK,
    // not straight-line distance — on a loop those two disagree by half a lap,
    // and the version that used straight-line distance put you second while you
    // were leading by a corner.
    //
    // FINISHED cars rank by WHEN they finished, not by progress. Frozen
    // progress ties at laps*total+epsilon for every finisher, and sorting ties
    // returns roster order — a rival that won by twenty seconds was ranked
    // last. `playerFinishedT` is the player's race clock at the line, or null
    // while they are still out.
    standings(playerProgress, playerFinishedT = null) {
      const all = cars.map(c => ({ name: c.name, progress: c.progress, fin: c.finishedT, you: false }));
      all.push({ name: 'you', progress: playerProgress, fin: playerFinishedT, you: true });
      all.sort((a, b) => {
        if (a.fin !== null && b.fin !== null) return a.fin - b.fin;
        if (a.fin !== null) return -1;
        if (b.fin !== null) return 1;
        return b.progress - a.progress;
      });
      return all;
    },
  };
}
