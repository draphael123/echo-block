// The wardrobe.
//
// You chose what the kid looks like once, on the intro screen, and then never
// again — which is a strange thing for a game to do with the one object you
// look at more than anything else. This is the same set of swatches, reachable
// on foot, saved with everything else.
//
// It shares the intro's palette conversion rather than duplicating it: the
// palette is linear and the swatch has to be sRGB-encoded or every colour in
// the picker is a shade darker than the voxel it stands for.
import { LOOKS } from './people.js';
import { PALETTE } from './palette.js';
import * as Save from './race/garage.js';

const CSS = `
#looks {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(460px, 92vw); padding: 24px 28px 18px; z-index: 62; pointer-events: auto;
  background: rgba(9, 13, 22, .94); border: 1px solid #2b3547; border-radius: 8px;
  font: 500 12px/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #b9c3d4;
}
#looks.hidden { display: none; }
#looks h2 { margin: 0 0 16px; font-size: 11px; font-weight: 700; letter-spacing: .34em; color: #6d7688; }
#looks .r { display: grid; grid-template-columns: 74px 1fr; gap: 12px; align-items: center; padding: 7px 0; }
#looks .lb { color: #6d7688; font-size: 10px; font-weight: 600; letter-spacing: .22em; }
#looks .sw { display: flex; gap: 7px; flex-wrap: wrap; }
#looks button {
  width: 26px; height: 26px; border-radius: 50%; border: 2px solid #2b3547;
  cursor: pointer; padding: 0; background: #333;
}
#looks button.on { border-color: #ffd9a0; }
#looks .note { color: #4f5a6d; font-size: 10px; letter-spacing: .16em; margin: 16px 0 0; }
`;

const to8 = (x) => Math.round(Math.pow(Math.min(1, Math.max(0, x)), 1 / 2.2) * 255);
const swatch = (v) => {
  if (v == null) return 'repeating-linear-gradient(45deg,#2b3242 0 4px,#1b2130 4px 8px)';
  const c = PALETTE[v];
  if (!c) return '#333';
  return `rgb(${to8(c.rgb[0])},${to8(c.rgb[1])},${to8(c.rgb[2])})`;
};

const ROWS = [
  ['skin', 'skin'], ['hair', 'hair'], ['hairStyle', 'cut'],
  ['shirt', 'shirt'], ['trouser', 'trousers'], ['cap', 'cap'],
];

export function mountLooks({ save, current, onPick, closeHint = 'K to close' }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'looks';
  el.className = 'hidden';
  el.innerHTML = `<h2>WARDROBE</h2><div class="rows"></div><p class="note">${closeHint}</p>`;
  document.body.appendChild(el);
  const rows = el.querySelector('.rows');

  function paint() {
    rows.innerHTML = '';
    for (const [key, label] of ROWS) {
      const r = document.createElement('div');
      r.className = 'r';
      r.innerHTML = `<div class="lb">${label}</div>`;
      const sw = document.createElement('div');
      sw.className = 'sw';
      for (const v of LOOKS[key]) {
        const b = document.createElement('button');
        b.style.background = swatch(v);
        if (current()[key] === v) b.className = 'on';
        b.title = v || 'none';
        b.onclick = () => {
          onPick(key, v);
          save.look = { ...(save.look || {}), [key]: v };
          Save.save(save);
          paint();
        };
        sw.appendChild(b);
      }
      r.appendChild(sw);
      rows.appendChild(r);
    }
  }

  return {
    paint,
    isOpen: () => !el.classList.contains('hidden'),
    open() { paint(); el.classList.remove('hidden'); },
    close() { el.classList.add('hidden'); },
    toggle() { if (el.classList.contains('hidden')) this.open(); else this.close(); },
  };
}
