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
//
// grand.js sits unregistered (playtest, 2026-09-01): a mega-lap stitched
// from the other circuits' districts amplified the same-city feeling instead
// of curing it. The fifth circuit that came back instead is THE SUMMIT — a
// genuinely different setting (the mountain above the town), locked behind
// the midnight league (reqTier: 2) and excluded from GP.ROUNDS by that same
// flag: seasons stay a four-round tour of the town, the mountain is the
// destination past it.
import parade from './parade.js';
import oldtown from './oldtown.js';
import docks from './docks.js';
import ring from './ring.js';
import summit from './summit.js';

export const TRACKS = [parade, oldtown, docks, ring, summit];
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
