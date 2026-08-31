// The city's circuits.
//
// Four areas of one town rather than four unrelated tracks, which is why they
// share a palette, a prop set and — where the geometry allows — the same
// landmarks on the horizon. What they do not share is the QUESTION they ask:
//
//   the parade    can you see far enough?      beam against braking distance
//   the old town  can you place the car?       width, and what a kerb costs
//   the docks     can you trust the surface?   grip, permanently wet
//   the ring road will you commit blind?       crests and tunnel mouths
//
// A track that is only a different skin is a different loading screen. These
// each lean on a different one of the systems underneath.
import parade from './parade.js';
import oldtown from './oldtown.js';
import docks from './docks.js';
import ring from './ring.js';

export const TRACKS = [parade, oldtown, docks, ring];
export const byId = (id) => TRACKS.find(t => t.id === id) || TRACKS[0];

// Which one to build. The hub writes the choice here before sending you out;
// the query string is for testing one directly.
const KEY = 'dynamo.track';
export function pickTrack() {
  const q = new URLSearchParams(location.search).get('track');
  if (q) return byId(q);
  try { return byId(localStorage.getItem(KEY) || 'parade'); } catch { return TRACKS[0]; }
}
// Also used by the hub's garage counter, which is why it is exported.
export function chooseTrack(id) {
  try { localStorage.setItem(KEY, id); } catch { /* private window */ }
}
