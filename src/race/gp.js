// The Grand Prix.
//
// Four circuits and no reason to drive more than one of them. A championship is
// the cheapest thing that makes the other three matter: it takes tracks that
// were alternatives and makes them a SEQUENCE, so the Docks is no longer "the
// wet one you can skip" but the round where the driver you are chasing scores.
//
// It is deliberately not a career mode. There is no calendar, no contract and
// no team — four rounds, points, and a table. The interesting decision it adds
// is the one every points system adds: on the round that is going badly, is it
// worth the risk of the pass, or is fourth banked worth more than second
// attempted.
//
// State lives in the one save (garage.js), because a championship you lose by
// refreshing the page is not a championship.
import { TRACKS } from './tracks/index.js';
import * as Garage from './garage.js';
import { FIELD_SIZE } from './field.js';

// 10-8-6-4-2-1. Steep at the front, so winning is worth chasing, and non-zero
// all the way down, so a bad round is a setback rather than the end of it.
export const POINTS = [10, 8, 6, 4, 2, 1];

export const ROUNDS = TRACKS.map(t => t.id);

// A championship in progress, or null. `table` is name -> points, and it holds
// the AI drivers too, because a table with one row in it is a scoreboard.
export function current(save) {
  return save.gp && !save.gp.finished ? save.gp : null;
}

export function begin(save) {
  save.gp = {
    round: 0,
    table: { you: 0 },
    results: [],            // one entry per completed round
    finished: false,
  };
  Garage.save(save);
  return save.gp;
}

export function abandon(save) {
  save.gp = null;
  Garage.save(save);
}

export function roundTrack(gp) {
  return ROUNDS[Math.min(gp.round, ROUNDS.length - 1)];
}

// Record where everybody came, award the points, and move on. `order` is the
// finishing order as an array of names, winner first.
export function score(save, order) {
  const gp = save.gp;
  if (!gp || gp.finished) return null;
  const awarded = {};
  order.forEach((name, i) => {
    const pts = POINTS[i] || 0;
    gp.table[name] = (gp.table[name] || 0) + pts;
    awarded[name] = pts;
  });
  gp.results.push({ track: roundTrack(gp), order, awarded });
  gp.round++;
  if (gp.round >= ROUNDS.length) gp.finished = true;
  Garage.save(save);
  return { awarded, standings: standings(gp), finished: gp.finished };
}

export function standings(gp) {
  return Object.entries(gp.table)
    .map(([name, points]) => ({ name, points, you: name === 'you' }))
    .sort((a, b) => b.points - a.points);
}

// What the whole championship pays out, on top of the per-race purses. A title
// is worth roughly four clean wins, so a season is a genuine route to the last
// tier of parts rather than a rosette.
export function prize(gp) {
  const table = standings(gp);
  const place = table.findIndex(r => r.you);
  return [4000, 2200, 1400, 800, 500, 300][place] || 200;
}

export const fieldSize = FIELD_SIZE;
