// Where are we racing?
//
// This lived on the garage counter, which was wrong twice over: you had to
// know Verity existed to find it, and choosing a circuit is not a purchase. It
// belongs on the door you leave through. RIDE OUT now asks the question instead
// of assuming the answer.
//
// Each row carries the thing that actually distinguishes the circuits — the
// question it asks — because "701m, wet" tells you the shape of a lap and
// nothing about whether you want to drive it.
import { TRACKS, chooseTrack, pickTrack } from './race/tracks/index.js';
import * as GP from './race/gp.js';

const CSS = `
#pick {
  position: fixed; inset: 0; z-index: 70; display: none;
  background: rgba(4, 7, 14, .82); backdrop-filter: blur(3px);
  font: 500 13px/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #b9c3d4;
}
#pick.up { display: grid; place-content: center; }
#pick .card { width: min(620px, 92vw); }
#pick h2 {
  margin: 0 0 4px; font-size: 11px; font-weight: 700; letter-spacing: .34em; color: #6d7688;
}
#pick .sub { color: #4f5a6d; font-size: 11px; margin-bottom: 20px; letter-spacing: .04em; }
#pick .t {
  display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;
  padding: 15px 18px; margin-bottom: 8px; cursor: pointer;
  border: 1px solid #232d3f; border-radius: 6px; background: rgba(12, 17, 28, .72);
  transition: border-color .12s, background .12s;
}
#pick .t:hover { border-color: #ffd9a0; background: rgba(20, 27, 42, .85); }
#pick .t.on { border-color: #4a5a78; }
#pick .nm { color: #f6ecda; font-size: 17px; font-weight: 400; letter-spacing: .01em; }
#pick .q { color: #8d97ab; font-size: 12px; margin-top: 3px; }
#pick .meta { text-align: right; color: #6d7688; font-size: 11px; letter-spacing: .06em; white-space: nowrap; }
#pick .meta b { display: block; color: #ffc98a; font-weight: 600; font-size: 12px; }
#pick .wet { color: #7fb4d8; }
#pick .close {
  margin-top: 14px; color: #4f5a6d; font-size: 11px; letter-spacing: .2em;
  background: none; border: 0; cursor: pointer; font: inherit; padding: 0;
}
#pick .close:hover { color: #ffd9a0; }

/* The championship, set apart from the four circuits because it is not a fifth
   one -- it is all four in an order, and the row has to say so. */
#pick .gp {
  display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;
  padding: 15px 18px; margin: 16px 0 8px; cursor: pointer;
  border: 1px solid #6a5326; border-radius: 6px;
  background: linear-gradient(90deg, rgba(48, 34, 12, .8), rgba(12, 17, 28, .72));
  transition: border-color .12s;
}
#pick .gp:hover { border-color: #ffd9a0; }
#pick .gp .nm { color: #ffd9a0; }
#pick .rounds { display: flex; gap: 5px; margin-top: 7px; }
#pick .rounds i {
  width: 26px; height: 3px; border-radius: 2px; background: #2f3a4e;
}
#pick .rounds i.done { background: #ffc98a; }
#pick .rounds i.now { background: #7fe08a; }
#pick .drop {
  color: #6d7688; font-size: 11px; letter-spacing: .1em; background: none; border: 0;
  cursor: pointer; font: inherit; padding: 4px 0 0;
}
#pick .drop:hover { color: #ff8a6a; }
`;

export function mountTrackSelect({ save, onGo }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'pick';
  el.innerHTML = '<div class="card"><h2>RIDE OUT</h2>'
    + '<div class="sub">four circuits, one town &mdash; and they do not ask the same thing</div>'
    + '<div class="list"></div><div class="season"></div>'
    + '<button class="close">esc &mdash; not tonight</button></div>';
  document.body.appendChild(el);
  const list = el.querySelector('.list');
  const season = el.querySelector('.season');

  function paint() {
    const here = pickTrack().id;
    list.innerHTML = '';
    for (const t of TRACKS) {
      const best = save.bests && save.bests[t.id];
      const row = document.createElement('div');
      row.className = 't' + (t.id === here ? ' on' : '');
      row.innerHTML = `<div><div class="nm">${t.name}</div><div class="q">${t.blurb}</div></div>`
        + `<div class="meta">${best ? `<b>${best.toFixed(2)}s</b>` : '<b>no time yet</b>'}`
        + `${Math.round(t.lapMetres || 0)} m &middot; `
        + `${t.wet ? '<span class="wet">rain</span>' : 'clear'}</div>`;
      row.onclick = () => { chooseTrack(t.id); onGo(t); };
      list.appendChild(row);
    }
    paintSeason();
  }

  // The championship. A season in progress shows where it has got to and
  // resumes at the right round; there is no way to start one accidentally and
  // no way to lose one without saying so.
  function paintSeason() {
    const gp = GP.current(save);
    season.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'gp';
    if (gp) {
      const at = GP.roundTrack(gp);
      const t = TRACKS.find(x => x.id === at);
      const mine = GP.standings(gp).findIndex(r => r.you) + 1;
      row.innerHTML = `<div><div class="nm">Grand Prix &mdash; round ${gp.round + 1}</div>`
        + `<div class="q">${t.name}${gp.round ? ` &middot; you are ${mine}${['st','nd','rd'][mine - 1] || 'th'}` : ''}</div>`
        + `<div class="rounds">${GP.ROUNDS.map((_, i) =>
          `<i class="${i < gp.round ? 'done' : i === gp.round ? 'now' : ''}"></i>`).join('')}</div></div>`
        + `<div class="meta"><b>resume</b>${GP.ROUNDS.length - gp.round} to go</div>`;
      row.onclick = () => { chooseTrack(at); onGo(t); };
      season.appendChild(row);
      const drop = document.createElement('button');
      drop.className = 'drop';
      drop.textContent = 'abandon the season';
      drop.onclick = (e) => { e.stopPropagation(); GP.abandon(save); paint(); };
      season.appendChild(drop);
    } else {
      row.innerHTML = '<div><div class="nm">Grand Prix</div>'
        + '<div class="q">all four circuits, in order &mdash; points, and a table</div>'
        + `<div class="rounds">${GP.ROUNDS.map(() => '<i></i>').join('')}</div></div>`
        + '<div class="meta"><b>start a season</b>4 rounds</div>';
      row.onclick = () => {
        GP.begin(save);
        const first = GP.ROUNDS[0];
        chooseTrack(first);
        onGo(TRACKS.find(t => t.id === first));
      };
      season.appendChild(row);
    }
  }

  el.querySelector('.close').onclick = () => hide();
  el.onclick = (e) => { if (e.target === el) hide(); };
  function show() { paint(); el.classList.add('up'); }
  function hide() { el.classList.remove('up'); }

  return { show, hide, isUp: () => el.classList.contains('up'), el };
}
