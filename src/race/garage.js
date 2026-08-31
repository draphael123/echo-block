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
const KEY = 'dynamo.save';

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

const BLANK = { money: 0, best: null, races: 0, parts: { engine: 0, brakes: 0, tyres: 0, lamps: 0 } };

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return { ...BLANK, parts: { ...BLANK.parts } };
    return { ...BLANK, ...raw, parts: { ...BLANK.parts, ...(raw.parts || {}) } };
  } catch { return { ...BLANK, parts: { ...BLANK.parts } }; }
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
export function purse({ won, laps, seconds, crashes, struck }) {
  const base = won ? 520 : 260;
  const pace = Math.max(0, Math.round((150 - seconds / laps) * 6));
  const clean = Math.max(0, 180 - crashes * 60 - struck * 90);
  return Math.max(60, base + pace + clean);
}
