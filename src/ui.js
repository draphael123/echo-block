// Title card and settings drawer.
//
// The settings exist because this is a look-dev piece: every number that
// decides whether it reads like the reference — focus, blur, exposure, the
// split tone, how hard the sodium lamp burns — is a knob here rather than a
// constant buried in a module. Everything persists to localStorage so a
// session of tuning survives a reload.
const STORE = 'echo-block.settings.v1';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function createUI(ctx) {
  const { post, rig, renderer, shots, applyShot, getShot } = ctx;

  // Every tunable in one table: read/write closures over the live objects, so
  // the panel and the keyboard shortcuts can never drift out of sync.
  const P = post.params;
  const DEFS = [
    ['Camera', [
      ['focus', 'focus distance', 60, 700, 1, () => P.focus, v => P.focus = v],
      ['range', 'focus range', 20, 420, 1, () => P.range, v => P.range = v],
      ['maxBlur', 'defocus', 0, 26, 0.5, () => P.maxBlur, v => P.maxBlur = v],
      ['fov', 'lens (fov)', 12, 50, 0.5, () => ctx.camera.fov,
        v => { ctx.camera.fov = v; ctx.camera.updateProjectionMatrix(); }],
    ]],
    ['Grade', [
      ['exposure', 'exposure', 0.2, 3, 0.01, () => P.exposure, v => P.exposure = v],
      ['bloom', 'bloom', 0, 2.5, 0.01, () => P.bloom, v => P.bloom = v],
      ['threshold', 'bloom threshold', 0.1, 2, 0.01, () => P.threshold, v => P.threshold = v],
      ['grain', 'grain', 0, 0.12, 0.002, () => P.grain, v => P.grain = v],
      ['vignette', 'vignette', 0, 1, 0.01, () => P.vignette, v => P.vignette = v],
      ['aberration', 'aberration', 0, 3, 0.05, () => P.aberration, v => P.aberration = v],
      ['tone', 'split tone', 0, 2, 0.02, () => ctx.tone(), v => ctx.tone(v)],
    ]],
    ['Light', [
      ['moon', 'moon', 0, 6, 0.05, () => rig.moon.intensity, v => rig.moon.intensity = v],
      ['hemi', 'ambient', 0, 3, 0.02, () => rig.hemi.intensity, v => rig.hemi.intensity = v],
      ['fill', 'camera fill', 0, 2, 0.02, () => rig.fill.intensity, v => rig.fill.intensity = v],
      ['lamp', 'streetlight', 0, 600, 5, () => ctx.lampGain() / 1000, v => ctx.lampGain(v * 1000)],
      ['porch', 'porch bulbs', 0, 30, 0.2, () => (rig.porches[0]?.intensity ?? 0) / 1000,
        v => rig.porches.forEach(l => l.intensity = v * 1000)],
      ['spill', 'window spill', 0, 3, 0.02, () => ctx.spillGain(),
        v => ctx.spillGain(v)],
      ['shaft', 'light shaft', 0, 0.5, 0.005, () => rig.cones[0]?.material.uniforms.uStrength.value ?? 0,
        v => rig.cones.forEach(c => c.material.uniforms.uStrength.value = v)],
    ]],
    ['Walking', [
      ['walkSpeed', 'move speed', 0.3, 2.5, 0.05, () => ctx.walkSpeed(), v => ctx.walkSpeed(v)],
    ]],
  ];

  const TOGGLES = [
    ['post', 'post-processing', () => P.enabled, v => P.enabled = v],
    ['shadows', 'shadows', () => renderer.shadowMap.enabled, v => {
      renderer.shadowMap.enabled = v;
      ctx.scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
    }],
    ['moths', 'moths', () => rig.moths ? rig.moths.points.visible : false,
      v => { if (rig.moths) rig.moths.points.visible = v; }],
    ['people', 'people', () => ctx.people(), v => ctx.people(v)],
    ['traffic', 'traffic', () => ctx.traffic(), v => ctx.traffic(v)],
    ['torch', 'flashlight', () => ctx.torch(), v => ctx.torch(v)],
    ['follow', 'follow the player', () => ctx.follow(), v => ctx.follow(v)],
    ['parallax', 'camera drift', () => ctx.parallax(), v => ctx.parallax(v)],
  ];

  // ------------------------------------------------------------------ dom
  const root = el('div', 'panel');
  root.innerHTML = '';
  const head = el('div', 'panel-head');
  head.append(el('span', null, 'settings'));
  const close = el('button', 'x', '×');
  head.append(close);
  root.append(head);

  const body = el('div', 'panel-body');
  root.append(body);

  const shotRow = el('div', 'group');
  shotRow.append(el('h4', null, 'camera — cut to a framing'));
  const shotWrap = el('div', 'shots');
  shots.forEach((name, i) => {
    const b = el('button', 'shotbtn', `${i + 1}  ${name}`);
    b.onclick = () => { applyShot(i); sync(); };
    b.dataset.i = i;
    shotWrap.append(b);
  });
  shotRow.append(shotWrap);
  body.append(shotRow);

  const inputs = [];
  for (const [title, rows] of DEFS) {
    const g = el('div', 'group');
    g.append(el('h4', null, title.toLowerCase()));
    for (const [key, label, min, max, step, get, set] of rows) {
      const row = el('label', 'row');
      row.append(el('span', 'lbl', label));
      const val = el('span', 'val');
      const inp = el('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
      inp.oninput = () => { set(+inp.value); val.textContent = fmt(+inp.value); save(); };
      row.append(inp, val);
      g.append(row);
      inputs.push({ key, inp, val, get });
    }
    body.append(g);
  }

  const g = el('div', 'group');
  g.append(el('h4', null, 'scene'));
  const toggles = [];
  for (const [key, label, get, set] of TOGGLES) {
    const row = el('label', 'row check');
    const inp = el('input'); inp.type = 'checkbox';
    inp.onchange = () => { set(inp.checked); save(); };
    row.append(inp, el('span', 'lbl', label));
    g.append(row);
    toggles.push({ key, inp, get });
  }
  body.append(g);

  const foot = el('div', 'group foot');
  const reset = el('button', 'wide', 'reset to shipped values');
  reset.onclick = () => { localStorage.removeItem(STORE); location.reload(); };
  const dump = el('button', 'wide', 'copy values as json');
  dump.onclick = async () => {
    await navigator.clipboard.writeText(JSON.stringify(collect(), null, 2)).catch(() => {});
    dump.textContent = 'copied';
    setTimeout(() => dump.textContent = 'copy values as json', 1200);
  };
  foot.append(reset, dump);
  body.append(foot);

  document.body.append(root);

  const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));

  function sync() {
    for (const { inp, val, get } of inputs) { const v = get(); inp.value = v; val.textContent = fmt(v); }
    for (const { inp, get } of toggles) inp.checked = !!get();
    const cur = getShot();
    shotWrap.querySelectorAll('.shotbtn').forEach(b => b.classList.toggle('on', +b.dataset.i === cur));
  }
  function collect() {
    const o = {};
    for (const { key, get } of inputs) o[key] = +(+get()).toFixed(4);
    for (const { key, get } of toggles) o[key] = !!get();
    return o;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(collect())); } catch {} }
  function load() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { saved = null; }
    if (!saved) return;
    for (const [, rows] of DEFS) for (const [key, , , , , , set] of rows)
      if (typeof saved[key] === 'number') set(saved[key]);
    for (const [key, , , set] of TOGGLES) if (typeof saved[key] === 'boolean') set(saved[key]);
  }

  let open = false;
  function toggle(force) {
    open = force == null ? !open : force;
    root.classList.toggle('open', open);
    if (open) sync();
  }
  close.onclick = () => toggle(false);
  const gear = document.getElementById('gear');
  if (gear) gear.onclick = () => toggle();

  load();
  sync();

  return { toggle, sync, isOpen: () => open, save };
}

// ------------------------------------------------------------------ intro
// A held title card, not a splash: the scene is already running behind it on
// its own slow framing, which is the first thing the reference does too.
export function createIntro(onStart) {
  const wrap = el('div', 'intro');
  const inner = el('div', 'intro-in');
  inner.append(el('h1', null, 'ECHO BLOCK'));
  inner.append(el('p', 'sub', 'one street, 1986, after everyone has gone in'));
  inner.append(el('p', 'blurb',
    'You are Row, and you are not going home yet. Walk the street, talk to the ' +
    'neighbours, stay out of the road. Every prop here is built from the same size ' +
    'cube as the houses, lit almost entirely by five sodium streetlights, a handful ' +
    'of porch bulbs and somebody’s television.'));
  const btn = el('button', 'start', 'walk the block');
  inner.append(btn);
  const rows = el('div', 'ctrl');
  for (const [k, what] of [
    ['W A S D', 'walk'], ['shift', 'run'], ['E', 'talk'],
    ['C', 'camera mode'], ['tab', 'settings'],
  ]) {
    const r = el('div', 'ctrl-row');
    r.append(el('kbd', null, k), el('span', null, what));
    rows.append(r);
  }
  inner.append(rows);
  wrap.append(inner);
  document.body.append(wrap);

  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    wrap.classList.add('gone');
    setTimeout(() => wrap.remove(), 900);
    onStart();
  };
  btn.onclick = go;
  addEventListener('keydown', (e) => {
    if (done) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });
  return { dismiss: go, isUp: () => !done };
}

// --------------------------------------------------------------- dialogue
// Nobody moves and nothing branches yet — this is only enough to prove the
// street is inhabited rather than dressed. Click a person, read what they have
// to say, click on to the next line.
export function createDialogue() {
  const box = el('div', 'talk');
  const who = el('div', 'talk-who');
  const line = el('div', 'talk-line');
  const more = el('div', 'talk-more', 'click to continue');
  box.append(who, line, more);
  document.body.append(box);

  const chip = el('div', 'chip');
  document.body.append(chip);

  let lines = [], i = 0, open = false;

  function render() {
    line.textContent = lines[i] || '';
    more.textContent = i < lines.length - 1 ? 'click to continue' : 'click to close';
  }
  return {
    isOpen: () => open,
    show(person) {
      lines = person.lines || ['…'];
      i = 0; open = true;
      who.textContent = person.role ? `${person.name} — ${person.role}` : person.name;
      render();
      box.classList.add('on');
    },
    // Returns true when it consumed the click (i.e. it advanced or closed).
    advance() {
      if (!open) return false;
      i++;
      if (i >= lines.length) { this.hide(); return true; }
      render();
      return true;
    },
    hide() { open = false; box.classList.remove('on'); },
    hover(name, x, y) {
      if (!name) { chip.classList.remove('on'); return; }
      chip.textContent = name;
      chip.style.transform = `translate(${x + 14}px, ${y - 10}px)`;
      chip.classList.add('on');
    },
  };
}
