// The garage: what you win, and what you spend it on.
//
// This is the loop the whole thing was for — race, get paid, buy a part, go
// faster — and it is deliberately four parts rather than forty. Every part maps
// to exactly ONE handling multiplier on the car, which means two things: you can
// feel what you bought, and I cannot ship a part that does nothing, because a
// part that moves no number would have nothing to declare here.
//
// LAMPS is the one that matters. The circuit is built around what you can see
// in the dark, so buying reach is buying permission to carry speed through the
// unlit half — the upgrade tree and the level design are the same idea.
// ONE SAVE.
//
// This was three separate localStorage keys pretending not to be a save system:
// the garage in dynamo.save, the best lap in dynamo.lap, and the kid you dressed
// in echo-block.look — written by different modules, none of them aware of the
// others, and no way to clear the lot. It is one record now, versioned, and it
// migrates the old keys on first load so nobody loses their car.
import { CHASSIS, chassisOf } from './car.js';

const KEY = 'dynamo.save';
const VERSION = 3;

// THE CAREER: the rival ladder (duel them in this order), and the season
// tiers. Beating the ladder and winning seasons is the minute-40 answer.
export const LADDER = ['Wren', 'Pike', 'Ferreira', 'Hale', 'Ó Broin', 'Vasey'];
export const TIER_FEES = [0, 500, 1200];
export const TIER_NAMES = ['clubman', 'national', 'midnight league'];

export const PARTS = [
  {
    id: 'engine', name: 'Engine', stat: 'vmax',
    blurb: 'top speed',
    steps: [1, 1.08, 1.16, 1.25], cost: [0, 400, 900, 1800],
  },
  {
    id: 'brakes', name: 'Brakes', stat: 'brake',
    blurb: 'how late you can leave it',
    steps: [1, 1.18, 1.36, 1.6], cost: [0, 350, 800, 1600],
  },
  {
    id: 'tyres', name: 'Tyres', stat: 'grip',
    blurb: 'corner speed and bite',
    steps: [1, 1.1, 1.2, 1.32], cost: [0, 450, 1000, 2000],
  },
  {
    id: 'lamps', name: 'Lamps', stat: 'beam',
    blurb: 'how far into the dark you can see',
    steps: [1, 1.25, 1.55, 1.9], cost: [0, 500, 1100, 2200],
  },
];

const BLANK = {
  v: VERSION,
  money: 0, races: 0, paint: 0,
  livery: 0, accent: 0,       // the stripe scheme and its colour
  parts: { engine: 0, brakes: 0, tyres: 0, lamps: 0 },
  cars: ['brindle'],      // chassis owned
  chassis: 'brindle',     // chassis driven
  career: { tier: 0, duelsWon: [] },
  bests: {},              // per circuit, because one number for four tracks is a lie
  ghosts: {},             // the best lap, embodied: 10Hz position samples per circuit
  stats: {},              // races / wins / clean runs, per circuit
  look: null,             // what the kid looks like; null until they choose
  track: 'parade',
};

const fresh = () => ({ ...BLANK, parts: { ...BLANK.parts }, bests: {}, ghosts: {}, stats: {},
  cars: ['brindle'], career: { tier: 0, duelsWon: [] } });

export function load() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { s = null; }
  const out = s
    ? { ...fresh(), ...s, parts: { ...BLANK.parts, ...(s.parts || {}) }, bests: { ...(s.bests || {}) },
        ghosts: { ...(s.ghosts || {}) }, stats: { ...(s.stats || {}) },
        cars: [...new Set(['brindle', ...(s.cars || [])])],
        chassis: s.chassis || 'brindle',
        career: { tier: 0, duelsWon: [], ...(s.career || {}) } }
    : fresh();

  if (!s || (s.v || 1) < VERSION) {
    // pull in whatever the old scattered keys were holding
    try {
      const look = JSON.parse(localStorage.getItem('echo-block.look') || 'null');
      if (look && !out.look) out.look = look;
      const lap = +(localStorage.getItem('dynamo.lap') || 0);
      if (lap && out.bests.parade === undefined) out.bests.parade = lap;
      const tr = localStorage.getItem('dynamo.track');
      if (tr) out.track = tr;
    } catch { /* private window */ }
    out.v = VERSION;
    save(out);
  }
  return out;
}

// A lap time, kept per circuit. Returns true if it is a new best.
export function recordLap(s, trackId, seconds) {
  const prev = s.bests[trackId];
  if (prev && prev <= seconds) return false;
  s.bests[trackId] = seconds;
  save(s);
  return true;
}

export function wipe() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('echo-block.look');
    localStorage.removeItem('dynamo.lap');
    localStorage.removeItem('dynamo.track');
  } catch { /* private window */ }
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ }
  return s;
}

// The multipliers buildCar() wants, straight out of what has been bought.
export function tuneOf(s) {
  const t = {};
  for (const p of PARTS) t[p.stat] = p.steps[Math.min(s.parts[p.id] || 0, p.steps.length - 1)];
  return t;
}

// ----------------------------------------------------------- the showroom
export function ownsCar(s, id) { return (s.cars || []).includes(id); }
export function carLocked(s, id) {
  const ch = chassisOf(id);
  return (s.career?.tier || 0) < (ch.reqTier || 0);
}
export function buyCar(s, id) {
  const ch = CHASSIS.find(c => c.id === id);
  if (!ch || ownsCar(s, id) || carLocked(s, id) || s.money < ch.price) return false;
  s.money -= ch.price;
  s.cars.push(id);
  s.chassis = id;
  save(s);
  return true;
}
export function driveCar(s, id) {
  if (!ownsCar(s, id)) return false;
  s.chassis = id;
  save(s);
  return true;
}

// ------------------------------------------------------------- the ladder
export function nextRival(s) {
  return LADDER.find(n => !(s.career?.duelsWon || []).includes(n)) || null;
}
export function recordDuel(s, name, won) {
  if (!won) return false;
  s.career.duelsWon = [...new Set([...(s.career.duelsWon || []), name])];
  save(s);
  return true;
}

export function nextCost(s, id) {
  const p = PARTS.find(x => x.id === id);
  const lvl = s.parts[id] || 0;
  return lvl >= p.steps.length - 1 ? null : p.cost[lvl + 1];
}

export function buy(s, id) {
  const cost = nextCost(s, id);
  if (cost === null || s.money < cost) return false;
  s.money -= cost;
  s.parts[id] = (s.parts[id] || 0) + 1;
  save(s);
  return true;
}

// What a race pays.
//
// Beating the rival is worth roughly twice finishing behind it, and the clock
// pays on top — so there is a reason to keep pushing once the position is
// settled, and a reason to race cleanly rather than shunting your way past.
//
// Pace pays against THIS circuit's reference lap (spec.refLap — the measured
// clean racing-policy lap), not against a wall-clock constant. `(150 − lap)`
// was track-blind: every circuit's laps are 32–45s, so the whole term maxed
// everywhere and the shortest race became twice the pay per minute of any
// other. Now an on-pace lap earns the same headline number on all four, and
// beating the reference is where the extra money is.
export function purse({ won, laps, seconds, crashes, struck, refLap = 40 }) {
  const base = won ? 520 : 260;
  const pace = Math.max(0, Math.round((refLap + 12 - seconds / laps) * 55));
  const clean = Math.max(0, 180 - crashes * 60 - struck * 90);
  return Math.max(60, base + pace + clean);
}
