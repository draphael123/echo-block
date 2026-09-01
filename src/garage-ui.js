// The garage counter, wherever you are standing.
//
// It builds its own markup and its own styles, so both the hub and the circuit
// mount the same panel from one line rather than keeping two copies of a dozen
// rows in two HTML files that would drift the first time a part was added.
//
// It knows nothing about cars. The host says what to do when something is
// bought — the circuit rebuilds its car on the spot, the hub just says thanks
// — which keeps the shop from having to know which page it is on.
import * as Garage from './race/garage.js';
import { BODIES, CHASSIS, LIVERIES, ACCENTS } from './race/car.js';

const CSS = `
#garage {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(560px, 90vw); padding: 26px 30px 20px; pointer-events: auto;
  background: rgba(9, 13, 22, .93); border: 1px solid #2b3547; border-radius: 8px;
  color: #c8d0de; z-index: 60; font: 12px/1.5 ui-monospace, monospace;
}
#garage.hidden { display: none; }
#garage h2 { margin: 0 0 18px; font-size: 13px; letter-spacing: .3em; color: #8d97ab; font-weight: 600; }
#garage h2 span { float: right; color: #ffd9a0; letter-spacing: .12em; }
#garage .row {
  display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center;
  padding: 9px 0; border-top: 1px solid #1d2635;
}
#garage .nm { color: #e6ecf6; font-size: 12px; letter-spacing: .1em; }
#garage .bl { color: #6b7689; font-size: 10px; letter-spacing: .06em; }
#garage .pips { letter-spacing: .22em; color: #ffb45c; font-size: 12px; }
#garage button {
  min-width: 84px; padding: 6px 10px; border: 1px solid #33405a; border-radius: 4px;
  background: rgba(20, 28, 44, .9); color: #cfe0ff; font: inherit; font-size: 11px;
  letter-spacing: .1em; cursor: pointer;
}
#garage button:hover:not(:disabled) { border-color: #ffd9a0; color: #ffd9a0; }
#garage button:disabled { opacity: .32; cursor: default; }
#garage .swatches { display: flex; gap: 6px; }
#garage .sw { width: 20px; height: 20px; min-width: 0; padding: 0; border-radius: 50%; border: 2px solid #2b3547; cursor: pointer; }
#garage .sw.on { border-color: #ffd9a0; }
#garage .liveries { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
#garage .lv { min-width: 0; padding: 5px 9px; font-size: 10px; }
#garage .lv.on { border-color: #ffd9a0; color: #ffd9a0; }
#garage .note { color: #5b657a; font-size: 10px; letter-spacing: .1em; margin: 16px 0 0; line-height: 1.7; }
`;

export function mountGarage({ save, onChange, closeHint = 'G to close' } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'garage';
  el.className = 'hidden';
  el.innerHTML = '<h2>GARAGE <span></span></h2><div class="parts"></div>'
    + `<p class="note">Upgrades ride on your car only &mdash; the rival runs stock.<br>${closeHint}</p>`;
  document.body.appendChild(el);
  const moneyEl = el.querySelector('h2 span');
  const partsEl = el.querySelector('.parts');

  const changed = () => { paint(); if (onChange) onChange(); };

  function paint() {
    moneyEl.textContent = save.money.toLocaleString() + ' cr';
    partsEl.innerHTML = '';
    for (const p of Garage.PARTS) {
      const lvl = save.parts[p.id] || 0;
      const cost = Garage.nextCost(save, p.id);
      const max = p.steps.length - 1;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div><div class="nm">${p.name}</div><div class="bl">${p.blurb}</div></div>`
        + `<div class="pips">${'■'.repeat(lvl)}${'□'.repeat(max - lvl)}</div>`;
      const b = document.createElement('button');
      b.textContent = cost === null ? 'MAX' : `${cost} cr`;
      b.disabled = cost === null || save.money < cost;
      b.onclick = () => { if (Garage.buy(save, p.id)) changed(); };
      row.appendChild(b);
      partsEl.appendChild(row);
    }

    // THE SHOWROOM: cars, plural — the career's first pillar. Each chassis
    // is a real shape and a real character; parts carry across. Locked cars
    // name the tier that opens them, priced cars name the price, and your
    // current car says DRIVING.
    for (const ch of CHASSIS) {
      const owned = Garage.ownsCar(save, ch.id);
      const locked = Garage.carLocked(save, ch.id);
      const active = save.chassis === ch.id;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div><div class="nm">${ch.name}</div><div class="bl">${ch.blurb}</div></div>`
        + `<div class="pips">${active ? 'DRIVING' : owned ? 'OWNED' : ''}</div>`;
      const b = document.createElement('button');
      if (active) { b.textContent = 'YOURS'; b.disabled = true; }
      else if (owned) { b.textContent = 'DRIVE'; b.onclick = () => { Garage.driveCar(save, ch.id); changed(); }; }
      else if (locked) { b.textContent = `tier ${ch.reqTier + 1}`; b.disabled = true; }
      else {
        b.textContent = `${ch.price} cr`;
        b.disabled = save.money < ch.price;
        b.onclick = () => { if (Garage.buyCar(save, ch.id)) changed(); };
      }
      row.appendChild(b);
      partsEl.appendChild(row);
    }

    // Respray, free — charging for it would make people drive a car they do not
    // like, and the point of a garage is that it is YOUR car.
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<div><div class="nm">Paint</div><div class="bl">free, as often as you like</div></div>';
    const sw = document.createElement('div');
    sw.className = 'swatches';
    BODIES.forEach((bd, i) => {
      const dot = document.createElement('button');
      dot.className = 'sw' + (i === save.paint ? ' on' : '');
      dot.style.background = bd.swatch;
      dot.title = bd.name;
      dot.onclick = () => { save.paint = i; Garage.save(save); changed(); };
      sw.appendChild(dot);
    });
    row.appendChild(sw);
    row.appendChild(document.createElement('span'));
    partsEl.appendChild(row);

    // The livery: a stripe scheme and the colour it is painted in. The first
    // scheme is free like the respray; the rest are DUEL PRIZES — beat rungs
    // of the ladder and the paint shop remembers. Identity you earned beats
    // identity you clicked.
    const wins = (save.career && save.career.duelsWon ? save.career.duelsWon : []).length;
    const LIVERY_REQ = [0, 0, 1, 3];             // duels won to unlock each scheme
    const ACCENT_REQ = [0, 0, 0, 2, 5];          // gold at 2, neon at 5
    const lrow = document.createElement('div');
    lrow.className = 'row';
    lrow.innerHTML = '<div><div class="nm">Livery</div><div class="bl">stripes &amp; flashes — duel prizes past the first</div></div>';
    const lv = document.createElement('div');
    lv.className = 'liveries';
    LIVERIES.forEach((l) => {
      const b2 = document.createElement('button');
      const locked = wins < (LIVERY_REQ[l.id] || 0);
      b2.className = 'lv' + (l.id === (save.livery || 0) ? ' on' : '');
      b2.textContent = locked ? `${l.name} — ${LIVERY_REQ[l.id]} duel${LIVERY_REQ[l.id] > 1 ? 's' : ''}` : l.name;
      b2.disabled = locked;
      b2.onclick = () => { save.livery = l.id; Garage.save(save); changed(); };
      lv.appendChild(b2);
    });
    lrow.appendChild(lv);
    lrow.appendChild(document.createElement('span'));
    partsEl.appendChild(lrow);

    if ((save.livery || 0) !== 0) {
      const arow = document.createElement('div');
      arow.className = 'row';
      arow.innerHTML = '<div><div class="nm">Accent</div><div class="bl">what the livery is painted in</div></div>';
      const asw = document.createElement('div');
      asw.className = 'swatches';
      ACCENTS.forEach((a, i) => {
        const locked = wins < (ACCENT_REQ[i] || 0);
        const dot = document.createElement('button');
        dot.className = 'sw' + (i === (save.accent || 0) ? ' on' : '');
        dot.style.background = locked ? '#1d2635' : a.swatch;
        dot.title = locked ? `${a.name} — win ${ACCENT_REQ[i]} duels` : a.name;
        dot.disabled = locked;
        dot.onclick = () => { save.accent = i; Garage.save(save); changed(); };
        asw.appendChild(dot);
      });
      arow.appendChild(asw);
      arow.appendChild(document.createElement('span'));
      partsEl.appendChild(arow);
    }
  }

  paint();
  return {
    el, paint,
    isOpen: () => !el.classList.contains('hidden'),
    open() { paint(); el.classList.remove('hidden'); },
    close() { el.classList.add('hidden'); },
    toggle() { if (el.classList.contains('hidden')) this.open(); else this.close(); },
  };
}
