// DYNAMO — the circuit.
//
// Cars, because a bike does not read at 8cm per voxel: thin tubes vanish, and a
// solid mass with panels and glass and lights does not. The hub's renderer is
// shared on purpose — testing the look on a different one would answer a
// different question.
import * as THREE from '../../vendor/three/three.module.js';
import { buildSky } from '../lights.js';
import { skyOf } from './skies.js';
import { Post } from '../post.js';
import { Ground } from '../walk.js';
import { buildTrack, hydrateTrack, sectionAt, safeSpot, lifeSpots, ROAD_HALF } from './track.js';
import { TRACKS, pickTrack, chooseTrack, byId } from './tracks/index.js';
import { buildCar, V_MAX, BODIES } from './car.js';
import { buildLife, buildTraffic } from './life.js';
import { buildField, gridSlot, fieldSizeOf } from './field.js';
import * as GP from './gp.js';
import { createAudio } from './audio.js';
import { createMusic } from '../music.js';
import { frame as pathFrame } from './path.js';
import { buildSmoke, neonFlicker } from '../fx.js';
import * as Garage from './garage.js';
import { mountGarage } from '../garage-ui.js';
import { mountTrackSelect } from '../track-select.js';
import { compare, run } from './sim.js';
import { assay, parts } from './assay.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NoToneMapping;
// WHAT TIME IT IS, on this circuit. See skies.js: the sky shader, the fog and
// both lights are driven from one entry so they cannot disagree with each
// other, which is what makes a warm sky over cold fog read as a bug.
let SPEC = pickTrack();
let SKY = null;                    // set by applySky

const scene = new THREE.Scene();
// The sky is lifted; the FOG is not, and the two are different jobs. Fog is
// what makes distant GEOMETRY visible, and matching it to the new horizon lit
// the unlit legs all the way to the treeline — you could see the road half a
// kilometre ahead on the one stretch whose entire point is that you cannot. A
// night sky IS brighter than the ground under it, so: bright backdrop, dark
// fog, and the dark stays dark.
scene.fog = new THREE.FogExp2(new THREE.Color('#000000'), 0.001);
let sky = null;                    // rebuilt per circuit by applySky

// The boot screen narrates the build phase by phase with a real progress bar
// — a forty-second synchronous build looked identical to a crash.
const bootMsg = document.getElementById('bootmsg');
const bootBar = document.getElementById('bootbar');
const bootPhase = (label, frac) => {
  window.__BUILD_BEAT = Date.now();          // the boot watchdog's heartbeat
  if (bootMsg) bootMsg.textContent = label;
  if (bootBar) bootBar.style.width = Math.round((frac || 0) * 100) + '%';
};
// THE BUILD RUNS IN A WORKER. The main thread stays perfectly responsive —
// the boot screen animates, the tab never stutters — and the finished
// geometry arrives as transferred buffers that hydrateTrack wraps in meshes
// in well under a second. If the worker cannot start (an ancient browser, a
// file:// mistake), the same build runs here with yields, exactly as before.
// The worker has a second job now: while you race a championship round it
// quietly builds the NEXT one, and pressing N swaps the finished circuit in
// without a page load. ONE build per worker, though — track.js keeps module
// state, so a worker reused across builds carries every previous circuit's
// voxel grids in its heap and the third build dies of an ArrayBuffer
// allocation failure. A fresh worker costs ~50ms; the fresh heap is the point.
let workerBusy = false;
function workerBuild(id, onPhase) {
  return new Promise((res, rej) => {
    if (!window.Worker) return rej(new Error('no Worker'));
    const w = new Worker(new URL('./build-worker.js', import.meta.url), { type: 'module' });
    workerBusy = true;
    const settle = (ok, v) => { workerBusy = false; w.terminate(); (ok ? res : rej)(v); };
    w.onerror = (ev) => settle(false, new Error(ev.message || 'worker error'));
    w.onmessage = (m) => {
      if (m.data.type === 'phase') { if (onPhase) onPhase(m.data.label, m.data.frac); }
      else if (m.data.type === 'done') settle(true, m.data.payload);
      else if (m.data.type === 'fail') settle(false, new Error(m.data.err));
    };
    w.postMessage({ trackId: id });
  });
}
async function buildSomewhere(spec, onPhase) {
  if (window.Worker) {
    try {
      const payload = await workerBuild(spec.id, onPhase);
      onPhase('opening the circuit', 0.99);
      return hydrateTrack(spec, payload);
    } catch (err) {
      console.warn('worker build failed — building on the main thread instead:', err);
    }
  }
  return buildTrack(spec, onPhase);
}
let track = null, ground = null;   // bound by applyTrack

// ------------------------------------------------------------------ light
// An unlit mass at night was a HOLE IN THE FOG: the chapel, the mill and the
// barns were black silhouettes with windows floating on them and no volume at
// all. The reference is path-traced and its shadows carry bounce; this is the
// cheap version of that.
const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
scene.add(hemi);

// The important half. A hemisphere lights HORIZONTAL surfaces most, which is
// backwards -- it brightens the road (the thing the dark is supposed to hide)
// and leaves walls flat. This one sits LOW and opposite the moon so it rakes
// across vertical faces at a grazing angle: it gives buildings a lit side and a
// dark side, and barely touches the tarmac. No shadow, because it is a fill.
const fill = new THREE.DirectionalLight(0x7d93c4, 0.62);
scene.add(fill, fill.target);
const moon = new THREE.DirectionalLight(0xffffff, 1);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 60, far: 1400 });
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.9;
scene.add(moon, moon.target);

// Only the poles near the car are lit. The forward renderer loops every light
// per pixel, and a circuit has an order of magnitude more poles than a block.
// Each circuit lights its streets in its own colour — warm sodium on the
// Parade, gas-lamp amber in the Old Town, cold floodlight white at the Docks,
// deep sodium orange on the bypass. Cheapest atmosphere per byte in the game.
let LAMPS = [];                    // built per circuit by applyTrack
const LIVE_LAMPS = 7;

// ------------------------------------------------------------------- cast
const savefile = Garage.load();
// `let`, because buying a part or a respray rebuilds the car in place: the body
// is meshed from voxels, so a wider tyre or an extra pair of lamps is a
// different mesh, and it is cheap enough to throw the old one away.
let car = buildCar(savefile.paint, Garage.tuneOf(savefile), savefile.parts);

function rebuildCar() {
  const keep = { ...car.state };
  scene.remove(car.root);
  car.root.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  car = buildCar(savefile.paint, Garage.tuneOf(savefile), savefile.parts);
  scene.add(car.root);
  Object.assign(car.state, keep);
}
scene.add(car.root);
const gridFrame = pathFrame();

// A grid of them. Five other drivers, each running its own race with no
// rubber-banding — if you are quicker you pull away, and if you are not you
// get to watch somebody do the thing you are failing to do.
//
// YOU START AT THE BACK, which is what makes the field worth having: a lap with
// nothing in front of you is a time trial with scenery.
let field = null, START = null;    // built per circuit by applyTrack

// A town where nothing moves is a model of a town. Smoke off the mill stack and
// the lit chimneys, and a television flickering in some of the front rooms --
// both already existed for the hub and neither had ever been switched on out
// here. Culled hard, because most of them are half a lap behind you.
let smoke = null;

const tvGeo = new THREE.PlaneGeometry(11, 9);
let tvs = [];

let life = null;

// Somebody else's evening, on the road you happen to be racing on.
// Six of them now, spread so there is one somewhere on most of the lap, at
// speeds that differ enough to catch each other up. Nobody is doing 80.
let traffic = null;

// ----------------------------------------------------------------- camera
// A chase camera on a longish lens: wide enough to read a corner at 80, long
// enough that the compression the whole look depends on survives.
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 12, 2400);
const post = new Post(renderer, innerWidth, innerHeight);
// The bright pass and the exposure belong to the HOUR, not to the renderer. A
// scene that is nearly all black needs a low threshold to have any bloom at
// all; the same threshold under a dusk sky blooms the entire road.
post.params.range = 260;
post.params.maxBlur = 7;
post.params.focus = 190;
// Far enough back that the car is a sixth of the frame, not half of it: the
// first pass had the camera in the boot and you could not see a corner
// coming, which is the only thing a racing camera has to do.
const CAM = { back: 196, up: 84, ahead: 150, lag: 4.2 };
let zoom = 1;
// Where the camera sits on its ring around the car, as an offset from the
// heading. Held on a key or a button rather than latched: you want to glance
// at what is beside you and then have the road back, and a camera you have to
// put away is a camera you crash with.
let camYaw = 0, camYawWant = 0, camDrop = 0;
const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();

let lastW = 0, lastH = 0;
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  if (!w || !h || (w === lastW && h === lastH)) return;
  lastW = w; lastH = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  post.setSize(canvas.width, canvas.height);
}
new ResizeObserver(resize).observe(canvas);
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ input
const keys = new Set();
// Browsers will not start an AudioContext without a gesture, so the whole
// sound engine waits for the first key press rather than failing quietly.
// Weather. One number, and it moves the look, the grip and the sight line
// together -- which is the cheapest content this track can be given, because it
// asks the same questions as a dry lap and hands you less to answer them with.
// Weather belongs to the CIRCUIT, not to a key. It was a toggle while it was
// being built and that made it a novelty; as a property of the place it is a
// reason the Docks are the Docks. You do not choose the weather.
let wet = 0;

const audio = createAudio();
const music = createMusic();
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  audio.start();
  music.start('race');
  if (k === 'm') { const m = audio.mute(); music.mute(m); hud.msg.textContent = m ? 'sound off' : 'sound on'; msgUntil = time + 1.2; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (k === 'r') reset();
  if (k === 'v') camYawWant = camYawWant ? 0 : Math.PI;   // latched look-back
  if (k === 'h') { hud.help.classList.toggle('hidden'); hud.hint.classList.toggle('hidden'); }
  // The championship: N swaps the next round IN PLACE — the circuit was built
  // in the worker while you raced this one, so there is no page load and
  // usually no boot screen either. T picks any circuit the same way. The URL
  // is kept honest with replaceState, so a reload lands where you are.
  if (k === 'n' && nextRound) swapTrack(nextRound);
  if (k === 't') pickerShow();
  if (k === 'g') {
    if (done) { GP.begin(savefile); swapTrack(GP.ROUNDS[0]); }
    else toggleGarage();
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('wheel', (e) => {
  zoom = THREE.MathUtils.clamp(zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.62, 1.9);
}, { passive: true });

// The same three moves as buttons, because not everybody finds q/e, and on a
// trackpad the scroll wheel is not a zoom anybody expects.
const nudge = (dz) => { zoom = THREE.MathUtils.clamp(zoom * dz, 0.62, 1.9); };
let held = 0;
function wire(id, on, off) {
  const el = document.getElementById(id);
  if (!el) return;
  const down = (e) => { e.preventDefault(); on(); };
  el.addEventListener('pointerdown', down);
  if (off) { for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, off); }
}
wire('camL', () => { held = -1; }, () => { held = 0; });
wire('camR', () => { held = 1; }, () => { held = 0; });
wire('camB', () => { camYawWant = camYawWant ? 0 : Math.PI; });
wire('zIn', () => nudge(0.88));
wire('zOut', () => nudge(1.14));

// -------------------------------------------------------------------- hud
const hud = {
  speed: document.getElementById('speed'),
  time: document.getElementById('time'),
  sect: document.getElementById('sect'),
  msg: document.getElementById('msg'),
  help: document.getElementById('help'),
  best: document.getElementById('best'),
  lap: document.getElementById('lap'),
  drift: document.getElementById('drift'),
  delta: document.getElementById('delta'),
  gear: document.getElementById('gear'),
  pos: document.getElementById('pos'),
  circuit: document.getElementById('circuit'),
  board: document.getElementById('board'),
  hint: document.getElementById('hint'),
};
// ------------------------------------------------------------------ minimap
// The circuit's true shape with everybody on it. A racer glances at a map for
// two facts — where does the road go next, and where is everybody — so it is
// dots on an outline and nothing else.
const map = document.getElementById('map');
const mapCtx = map.getContext('2d');
let MAP = null;                    // rebuilt per circuit
function buildMapModel() {
  const f = pathFrame();
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  const pts = [];
  for (let sm = 0; sm < track.path.total; sm += 24) {
    track.path.at(sm, f);
    pts.push([f.x, f.z]);
    x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x);
    z0 = Math.min(z0, f.z); z1 = Math.max(z1, f.z);
  }
  const pad = 12, W = map.width;
  const sc = (W - pad * 2) / Math.max(x1 - x0, z1 - z0);
  const ox = (W - (x1 - x0) * sc) / 2, oz = (W - (z1 - z0) * sc) / 2;
  const px = (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc];
  const line = document.createElement('canvas');
  line.width = line.height = W;
  const g = line.getContext('2d');
  g.strokeStyle = 'rgba(232,238,252,0.8)';
  g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([mx, mz], i) => { const [a, b] = px(mx, mz); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
  g.closePath(); g.stroke();
  track.path.at(30, f);                       // the start line, marked
  const [sx, sz] = px(f.x, f.z);
  g.fillStyle = '#ffc98a'; g.fillRect(sx - 3, sz - 3, 6, 6);
  return { line, px };
}
function drawMap() {
  mapCtx.clearRect(0, 0, map.width, map.height);
  mapCtx.drawImage(MAP.line, 0, 0);
  mapCtx.fillStyle = 'rgba(255,138,106,0.9)';
  for (const r of field.cars) {
    const [a, b] = MAP.px(r.car.state.x, r.car.state.z);
    mapCtx.beginPath(); mapCtx.arc(a, b, 3, 0, 7); mapCtx.fill();
  }
  const [a, b] = MAP.px(car.state.x, car.state.z);
  mapCtx.strokeStyle = 'rgba(255,255,255,0.9)'; mapCtx.lineWidth = 2;
  mapCtx.beginPath(); mapCtx.arc(a, b, 6.5, 0, 7); mapCtx.stroke();
  mapCtx.fillStyle = '#ffffff';
  mapCtx.beginPath(); mapCtx.arc(a, b, 4.2, 0, 7); mapCtx.fill();
}

// Per circuit. Three laps of the Old Town's 359 metres is over in ninety
// seconds and two of the Ring Road's 698 is a race with a shape; one number for
// four tracks of wildly different length was a number chosen for one of them.
let LAPS = 3;

// THE GANTRY RUNS THE COUNTDOWN. The start lights lived in the HUD while the
// steel frame the whole grid is staring at stayed decoration. Three lamps hang
// under the crossbar as scene objects — red through the count, all-green at
// GO, gone two seconds later. Lights only; the voxels are not touched.
const lampFrame = pathFrame();
const lampGeo = new THREE.PlaneGeometry(9, 9);
const START_LAMP_US = [-44, 0, 44];
const startLamps = START_LAMP_US.map(() => {
  const m = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({
    color: 0xd83a34, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false,
  }));
  scene.add(m);
  return m;
});
let lampsOffAt = 0;
function lampsRed() {
  lampsOffAt = 0;
  for (const m of startLamps) { m.visible = true; m.material.color.setHex(0xd83a34); }
}
function lampsGo(at) {
  lampsOffAt = at + 2;
  for (const m of startLamps) m.material.color.setHex(0x59d977);
}

// A standing start needs a start. Without it the race began the instant you
// touched the throttle, which on a six-car grid means whoever's finger moved
// first — and made the lights on the gantry a decoration.
// 3.0, not 3.2 — the light shows ceil(countdown), so 3.2 flashed a "4" for a
// fifth of a second before the real sequence started.
const GRID_HOLD = 3.0;
let countdown = GRID_HOLD;

// Are we in a championship, and is THIS its current round?
let gp = null, inGP = false;       // recomputed per circuit by applyTrack
let lapTime = 0, lap = 0, running = false, done = false;
let s = 80, prevS = 80, crashes = 0, wasDown = false, downAt = 0;
let struck = 0, msgUntil = 0, wasBoosting = false, lastLight = 99;
// The race clock — the same clock the rivals keep, so finish ORDER can be
// ranked by when everybody actually crossed the line (see field.standings).
let raceClock = 0;
// off-the-map grace and the stuck-against-a-wall hint timer
let offCourse = 0, pinned = 0;
// boost pads, with a per-pad cooldown so sitting on one is not an engine
let PADS = [], padCool = [];
// the moving set pieces — a crane load, a level crossing — spec-declared,
// animated on the RACE clock so R resets their pattern with the race
let movers = [];

// ----------------------------------------------------- ghost, delta, sectors
// THE GHOST is the best lap, embodied: position samples at 10Hz, saved with
// the save, replayed as a see-through car. It is also the timing reference —
// the live delta and the sector splits are all "where was the ghost when it
// was here", which is why one recording serves all three.
let ghostData = null;
let rec = [], recTimer = 0, gPtr = 0;
function ghostTimeAt(atS) {
  if (!ghostData) return null;
  const f = ghostData.f, n = (f.length / 5) | 0;
  if (gPtr >= n) gPtr = 0;
  if (gPtr > 0 && f[gPtr * 5 + 4] > atS + 400) gPtr = 0;      // new lap
  while (gPtr < n - 1 && f[gPtr * 5 + 4] < atS) gPtr++;
  return gPtr * ghostData.dt;
}
let ghost = null;
function buildGhost() {
  if (ghost) { scene.remove(ghost.root); }
  const g = buildCar(savefile.paint);
  g.beam.visible = false;
  g.root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = false;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.28;
      o.material.depthWrite = false;
    }
  });
  g.root.name = 'ghost';
  g.root.visible = false;
  scene.add(g.root);
  ghost = g;
}
// sector gates at thirds, timed against the ghost
let SEC_AT = [1e9, 1e9];
// racing furniture state
let lastPlace = null, wrongWay = 0;
// the pre-race ceremony: a slow reveal of the circuit, any key skips it
let intro = 0;
const introCard = document.getElementById('introcard');
const resultsEl = document.getElementById('results');
function fillIntroCard() {
  if (!introCard) return;
  const bst = savefile.bests && savefile.bests[track.id];
  introCard.innerHTML = `<h1>${track.name}</h1><p>${track.spec.blurb}</p>`
    + `<div class="facts">${LAPS} laps &middot; ${Math.round(track.lapLength * 0.08)} m`
    + ` &middot; ${track.spec.wet ? 'rain' : 'clear'}`
    + ` &middot; field of ${track.spec.field || 6}`
    + (bst ? ` &middot; best ${bst.toFixed(2)}s` : '') + `</div>`;
}
// One score per round per page life. finish() used to award GP points every
// time it ran, so R + a re-race after a round scored the season twice and
// logged the result against the wrong track.
let scored = false;
// Best laps are PER CIRCUIT, out of the versioned save. The old global
// dynamo.lap key meant an Old Town time was the Parade's target.
let best = null;
const splits = [];

function reset(ceremony = false) {
  // The first arrival gets the flyover; R gets straight back on the grid.
  intro = ceremony ? 6.0 : 0;
  if (introCard) introCard.classList.toggle('hidden', !ceremony);
  if (resultsEl) resultsEl.classList.add('hidden');
  lastPlace = null; wrongWay = 0; rec = []; recTimer = 0; gPtr = 0;
  if (ghost) ghost.root.visible = false;
  track.path.place(START.s, START.u, gridFrame);
  car.respawn(gridFrame.x, gridFrame.z, Math.atan2(gridFrame.tx, gridFrame.tz),
    track.elev(START.s) - 1);
  field.reset();
  car.state.crash = 0; car.state.dist = 0;
  lapTime = 0; lap = 0; running = false; done = false; raceClock = 0;
  countdown = GRID_HOLD; lastLight = 99;
  s = prevS = START.s; crashes = 0; wasDown = false; struck = 0; msgUntil = 0;
  offCourse = 0; pinned = 0;
  splits.length = 0;
  lampsRed();
  hud.msg.innerHTML = inGP
    ? `<b>round ${gp.round + 1} of ${GP.ROUNDS.length}</b><span class="dim">${track.name}</span>`
    : '';
}

// What happened, who scored, and whether the championship is over.
//
// Splitting this out of the lap counter is not tidying: it has three jobs now
// (pay the purse, award the points, close the season) and the version that did
// them inline inside an `if` nested in the lap check was where a bug would live.
function finish() {
  const mine = lap * track.path.total + s;
  const table = field.standings(mine, raceClock);
  const place = table.findIndex(r => r.you);
  const order = table.map(r => r.name);

  const paid = Garage.purse({
    won: place === 0, laps: LAPS, seconds: splits.reduce((a, b) => a + b, 0), crashes, struck,
    refLap: track.spec.refLap,
  });
  savefile.money += paid;
  savefile.races++;

  // the tally the pit wall shows: races, wins, clean runs, per circuit
  savefile.stats = savefile.stats || {};
  const st = savefile.stats[track.id] = savefile.stats[track.id] || { races: 0, wins: 0, clean: 0 };
  st.races++; if (place === 0) st.wins++; if (crashes === 0) st.clean++;

  // A RESULTS BOARD, not a text blob: the classification with real times for
  // everyone who crossed the line, the purse, the season if there is one.
  const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
  const fmt = (sec) => { const m = Math.floor(sec / 60); return m + ':' + (sec - m * 60).toFixed(2).padStart(5, '0'); };
  const rows = table.map((r, i) => {
    const tStr = r.you ? fmt(raceClock)
      : (r.fin !== null ? fmt(r.fin) : `+${Math.max(1, Math.round((mine - r.progress) * 0.08))}m`);
    return `<div class="rrow${r.you ? ' you' : ''}"><i>${i + 1}</i><span>${r.name}</span><b>${tStr}</b></div>`;
  }).join('');

  let headline = `${ORD[place] || (place + 1)}`;
  let payline = `${paid} earned`;
  let gpHtml = '', hint = '<b>R</b> race again &nbsp; <b>G</b> garage';

  if (inGP && !scored) {
    scored = true;
    const r = GP.score(savefile, order);
    const pts = r.awarded.you || 0;
    payline = `${pts} point${pts === 1 ? '' : 's'} &middot; ${paid} earned`;
    gpHtml = `<div class="rtable">` + r.standings.map(x =>
      `<span class="${x.you ? 'you' : ''}">${x.name}<b>${x.points}</b></span>`).join('') + `</div>`;
    if (r.finished) {
      const prize = GP.prize(savefile.gp);
      savefile.money += prize;
      headline = r.standings[0].you ? 'CHAMPION' : 'season over';
      payline = `${prize + paid} earned`;
      hint = '<b>G</b> start a new season &nbsp; <b>R</b> race again';
    } else {
      const next = GP.roundTrack(savefile.gp);
      const nt = TRACKS.find(t => t.id === next);
      gpHtml += `<div class="rnext">next round: ${nt.name}</div>`;
      hint = '<b>N</b> next round &nbsp; <b>R</b> race again';
      nextRound = next;
      prefetchNext(next);           // in case the race-start prefetch was missed
    }
  }

  Garage.save(savefile);
  paintGarage();
  hud.msg.innerHTML = '';
  if (resultsEl) {
    resultsEl.innerHTML = `<div class="rcard"><h2>${track.name}</h2>`
      + `<div class="rhead">${headline}<b>${payline}</b></div>`
      + rows
      + `<div class="rmeta">${splits.map(x => x.toFixed(2)).join(' &middot; ')}`
      + ` &nbsp;&mdash;&nbsp; ${crashes} crash${crashes === 1 ? '' : 'es'}`
      + (struck ? ` &middot; ${struck} pedestrian${struck === 1 ? '' : 's'}` : '')
      + (best ? ` &middot; best ${best.toFixed(2)}s` : '') + `</div>`
      + gpHtml
      + `<div class="rhint">${hint}</div></div>`;
    resultsEl.classList.remove('hidden');
  }
}
let nextRound = null;

// ------------------------------------------- the circuit, swapped in place
// A change of circuit is a change of STATE, not a page load. applySky and
// applyTrack bind everything that belongs to a circuit; teardownTrack returns
// the scene to empty. The first boot is just swap number zero — which is what
// keeps the two paths from drifting apart.
function disposeDeep(root, materials = false) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry && o.geometry !== tvGeo && o.geometry !== lampGeo) o.geometry.dispose();
    if (materials) {
      const m = o.material;
      if (Array.isArray(m)) m.forEach(x => x && x.dispose());
      else if (m) m.dispose();
    }
  });
}

const BASE_EXPOSURE = post.params.exposure, BASE_THRESHOLD = post.params.threshold;
function applySky(spec) {
  SKY = skyOf(spec.sky);
  renderer.setClearColor(new THREE.Color(SKY.clear), 1);
  scene.fog.color.set(SKY.fog);
  scene.fog.density = SKY.fogD;
  if (sky) { scene.remove(sky); disposeDeep(sky, true); }
  sky = buildSky(SKY);
  scene.add(sky);
  hemi.color.set(SKY.hemiSky);
  hemi.groundColor.set(SKY.hemiGround);
  hemi.intensity = SKY.hemi;
  moon.color.set(SKY.key);
  moon.intensity = SKY.keyI;
  post.params.exposure = SKY.exposure || BASE_EXPOSURE;
  post.params.threshold = SKY.threshold || BASE_THRESHOLD;
}

function applyTrack(spec, trk) {
  track = trk;
  scene.add(track.group);
  // Upload every chunk to the GPU NOW, unculled for one frame. The attribute
  // arrays free themselves on upload (see hydrateTrack), but a frustum-culled
  // chunk uploads only when the camera happens upon it — which kept two
  // gigabytes of CPU copies alive for chunks behind the player.
  const chunkMeshes = [];
  track.group.traverse(o => { if (o.isMesh) { chunkMeshes.push(o); o.frustumCulled = false; } });
  renderer.render(scene, camera);
  for (const o of chunkMeshes) o.frustumCulled = true;
  ground = new Ground(track.field);

  const lampCol = new THREE.Color(spec.lampColor || '#ffa23c');
  LAMPS = track.anchors.lamps.map(([x, y, z]) => {
    const l = new THREE.SpotLight(lampCol, 170000, 280, 0.85, 0.75, 2);
    l.position.set(x, y, z);
    l.target.position.set(x, 2, z + 8);
    l.visible = false;
    scene.add(l, l.target);
    return { light: l, x, z };
  });

  field = buildField(track, ground, buildCar,
    { count: fieldSizeOf(spec), playerPaint: savefile.paint });
  field.addTo(scene);
  START = gridSlot(0);
  track.path.place(START.s, START.u, gridFrame);
  car.state.x = gridFrame.x;
  car.state.z = gridFrame.z;
  car.state.heading = Math.atan2(gridFrame.tx, gridFrame.tz);

  smoke = buildSmoke(track.anchors.stacks.slice(0, 14), 14);
  scene.add(smoke.points);
  tvs = track.anchors.tvs.slice(0, 26).map(([x, y, z]) => {
    const m = new THREE.Mesh(tvGeo, new THREE.MeshBasicMaterial({
      color: 0x79b4ff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false,
    }));
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  });
  life = buildLife(track.path, lifeSpots(), ground, track.elev);
  scene.add(life.group);
  traffic = buildTraffic(track.path, buildCar, track.traffic, track.elev);
  scene.add(traffic.group);

  wet = track.spec.wet || 0;
  hud.circuit.textContent = track.name;
  MAP = buildMapModel();
  LAPS = spec.laps || 3;
  START_LAMP_US.forEach((u, i) => {
    track.path.place(30, u, lampFrame);
    startLamps[i].position.set(lampFrame.x, track.elev(30) + 100, lampFrame.z);
  });
  gp = GP.current(savefile);
  inGP = !!gp && GP.roundTrack(gp) === track.id;
  scored = false;
  nextRound = null;
  PADS = spec.pads || [];
  padCool = PADS.map(() => 0);
  movers = (spec.moving || []).map(buildMover);
  for (const mv of movers) scene.add(mv.g);
  ghostData = (savefile.ghosts && savefile.ghosts[track.id]) || null;
  gPtr = 0;
  if (ghostData) buildGhost();
  else if (ghost) ghost.root.visible = false;
  SEC_AT = [track.path.total / 3, (track.path.total * 2) / 3];
  best = savefile.bests[track.id] || null;
  fillIntroCard();
  if (window.DYNAMO) Object.assign(window.DYNAMO, {
    track, car, ground, life, traffic, field,
    voxels: track.voxels, buildMs: track.buildMs,
    lapMetres: Math.round(track.lapLength * 0.08),
  });
}

// THE MOVING SET PIECES. Static hazards ask one question — did you see it in
// time — and every circuit now asks it nine ways. These ask a different one:
// did you read the RHYTHM. Both run on the race clock, so restarting the race
// restarts their pattern, and both only ever punish the player — the rivals
// get a courtesy brake at the crossing instead, because a hazard the AI
// cannot see is a lottery, not a test.
function buildMover(m) {
  const fm = pathFrame();
  track.path.place(m.s, 0, fm);
  const cx = fm.x, cz = fm.z;
  const tx = fm.tx, tz = fm.tz, nx = fm.nx, nz = fm.nz;
  const roadY = track.elev(m.s) + 2;
  const g = new THREE.Group();

  if (m.kind === 'craneload') {
    // a container on cables under the quay cranes, pendulum-swinging across
    // the road: lowest (and deadliest) dead centre, clear at the extremes
    const L = 120, A = 0.62, pivotY = roadY + 140;
    // the container is a GROUP: body plus corrugation ribs and corner posts,
    // because a flat untextured box in a voxel world reads as a placeholder
    const box = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2e, roughness: 0.9 });
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x63301c, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(26, 24, 58), bodyMat);
    body.castShadow = true;
    box.add(body);
    for (let rz = -24; rz <= 24; rz += 8) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(27.5, 20, 2.5), ribMat);
      rib.position.set(0, 0, rz);
      box.add(rib);
    }
    for (const cz of [-28.6, 28.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(27, 25, 2), ribMat);
      post.position.set(0, 0, cz);
      box.add(post);
    }
    box.rotation.y = Math.atan2(nx, nz);       // long axis across the road
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x14161c });
    const cables = [-8, 8].map(() => new THREE.Mesh(new THREE.BoxGeometry(1.6, L, 1.6), cableMat));
    // the jib the cables hang FROM — without it the load swung from empty
    // sky. It runs from over the road out toward the quay cranes' side.
    const jib = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 340),
      new THREE.MeshStandardMaterial({ color: 0x2c313d, roughness: 0.9 }));
    jib.position.set(cx + nx * 120, pivotY + 4, cz + nz * 120);
    jib.rotation.y = Math.atan2(nx, nz);
    g.add(box, jib, ...cables);
    const tAxis = new THREE.Vector3(tx, 0, tz).normalize();
    return {
      g,
      update(dt, t) {
        const th = A * Math.sin(t * 1.15);
        const sw = Math.sin(th), cw = Math.cos(th);
        const px = cx + nx * L * sw, pz = cz + nz * L * sw, py = pivotY - L * cw;
        box.position.set(px, py, pz);
        cables.forEach((c, i) => {
          const off = i ? 8 : -8;
          c.position.set(cx + nx * (L / 2) * sw + tx * off, pivotY - (L / 2) * cw,
            cz + nz * (L / 2) * sw + tz * off);
          c.quaternion.setFromAxisAngle(tAxis, th);
        });
        if (running && !done && !car.state.crash) {
          const dx = car.state.x - px, dz = car.state.z - pz;
          if (dx * dx + dz * dz < 1600 && py - 12 < roadY + 24) {
            car.impact(0.75, true);
            audio.impact(0.7);
            hud.msg.textContent = 'the crane load!';
            msgUntil = time + 1.6;
          }
        }
      },
    };
  }

  if (m.kind === 'crossing') {
    // a level crossing: an arm from each kerb, red lamps blinking while they
    // are down. The cycle is long enough to read from braking distance.
    const half = track.roadHalf || ROAD_HALF;
    const armMatR = new THREE.MeshBasicMaterial({ color: 0xd83a34, toneMapped: false });
    const armMatW = new THREE.MeshStandardMaterial({ color: 0xe8eefc, roughness: 0.8 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.9 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xd83a34, toneMapped: false });
    const arms = [], lamps = [];
    const pf2 = pathFrame();
    for (const side of [-1, 1]) {
      track.path.place(m.s, side * (half + 14), pf2);
      const post = new THREE.Mesh(new THREE.BoxGeometry(5, 20, 5), postMat);
      post.position.set(pf2.x, roadY + 10, pf2.z);
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), lampMat);
      lamp.position.set(pf2.x, roadY + 24, pf2.z);
      lamps.push(lamp);
      const arm = new THREE.Group();
      arm.position.set(pf2.x, roadY + 17, pf2.z);
      arm.rotation.y = Math.atan2(-side * nx, -side * nz);
      const len = half + 8;
      for (let k = 0; k < len; k += 14) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(3, 3, Math.min(14, len - k)),
          (k / 14) % 2 ? armMatW : armMatR);
        seg.position.set(0, 0, k + Math.min(14, len - k) / 2);
        arm.add(seg);
      }
      arms.push(arm);
      g.add(post, lamp, arm);
    }
    let angle = 1.35;                          // starts raised
    return {
      g,
      update(dt, t) {
        const P = 26, ph = t % P;
        const wantDown = ph > 9 && ph < 16.5;
        const target = wantDown ? 0 : 1.35;
        angle += (target - angle) * Math.min(1, dt * 2.2);
        for (const a of arms) a.rotation.x = -angle;
        const down = angle < 0.3;
        const warning = wantDown || down;
        const blink = warning && Math.floor(t * 2.5) % 2 === 0;
        for (const l of lamps) { l.visible = blink; if (blink) l.lookAt(camera.position); }
        if (!running || done) return;
        const d = (car.state.x - cx) * tx + (car.state.z - cz) * tz;
        const lat = (car.state.x - cx) * nx + (car.state.z - cz) * nz;
        if (down && !car.state.crash && Math.abs(d) < 12 && Math.abs(lat) < half
            && Math.abs(car.state.speed) > 25) {
          car.impact(0.7, true);
          audio.impact(0.6);
          hud.msg.textContent = 'the crossing barrier!';
          msgUntil = time + 1.6;
        }
        // the rivals read the lamps: anyone approaching a lowered barrier
        // eases off until it lifts, rather than driving through the arm
        if (warning) for (const rv of field.cars) {
          const st = rv.car.state;
          const dd = (st.x - cx) * tx + (st.z - cz) * tz;
          if (dd > -280 && dd < -20) st.speed *= Math.max(0, 1 - 2.4 * dt);
        }
      },
    };
  }
  return { g, update() {} };
}

function teardownTrack() {
  if (!track) return;
  scene.remove(track.group);
  disposeDeep(track.group, true);
  for (const L of LAMPS) { scene.remove(L.light, L.light.target); L.light.dispose(); }
  LAMPS = [];
  for (const c of field.cars) { scene.remove(c.root); disposeDeep(c.root); }
  scene.remove(smoke.points);
  if (smoke.points.geometry) smoke.points.geometry.dispose();
  if (smoke.points.material) smoke.points.material.dispose();
  for (const m of tvs) { scene.remove(m); m.material.dispose(); }
  tvs = [];
  scene.remove(life.group);
  disposeDeep(life.group);
  scene.remove(traffic.group);
  disposeDeep(traffic.group);
  if (ghost) { scene.remove(ghost.root); disposeDeep(ghost.root, true); ghost = null; }
  for (const mv of movers) { scene.remove(mv.g); disposeDeep(mv.g, true); }
  movers = [];
  track = null; ground = null; field = null; START = null;
  smoke = null; life = null; traffic = null;
  // and the last places a dead circuit's arrays can hide: the console API's
  // live references and the renderer's cached render lists
  if (window.DYNAMO) Object.assign(window.DYNAMO, {
    track: null, ground: null, field: null, life: null, traffic: null,
  });
  renderer.renderLists.dispose();
}

// PREFETCH: the worker's idle time is the next circuit's build time. The
// moment a championship race starts, the worker begins on the next round, so
// by the time you press N the payload is usually sitting in memory and the
// swap is just the hydrate — well under a second, no boot screen at all.
let prefetch = null;               // { id, promise }
function prefetchNext(id) {
  if (!id || !window.Worker || workerBusy) return;
  if (prefetch && prefetch.id === id) return;
  prefetch = { id, promise: workerBuild(id, null).catch(() => null) };
}

let swapping = false;
async function swapTrack(id) {
  if (swapping) return;
  if (track && id === track.id) {
    // same circuit: nothing to build, just put the season state and the grid
    // back the way a fresh arrival would find them
    gp = GP.current(savefile);
    inGP = !!gp && GP.roundTrack(gp) === track.id;
    scored = false;
    nextRound = null;
    reset(true);
    return;
  }
  swapping = true;
  chooseTrack(id);
  history.replaceState(null, '', './race.html?track=' + id);
  const spec2 = byId(id);
  // The boot screen fronts every swap. With a finished prefetch it is a
  // sub-second blink; mid-prefetch it is honest cover for the wait — the
  // alternative was a silently frozen frame.
  document.body.classList.remove('booted');
  bootPhase('driving over', 0.5);
  try {
    const pf = prefetch;
    prefetch = null;
    let payload = null;
    if (pf && pf.id === id) payload = await pf.promise;
    let trk;
    if (payload) {
      teardownTrack();
      trk = hydrateTrack(spec2, payload);
    } else {
      // one build at a time — drain a mismatched prefetch before asking
      // for the circuit we actually want. And FREE THE OLD CIRCUIT FIRST:
      // a build's peak memory is the whole renderer process's, page and
      // worker together, and keeping a dead circuit alive behind the boot
      // screen was what ran the third build of a session out of memory.
      if (pf) await pf.promise;
      teardownTrack();
      bootPhase('driving over', 0);
      // NO main-thread fallback here: if the worker cannot build (which in
      // practice means the process is out of memory after a long session),
      // a main-thread attempt burns a minute failing the same way. The
      // catch below reloads into the target circuit instead — a clean
      // process, the old-fashioned way.
      trk = window.Worker
        ? hydrateTrack(spec2, await workerBuild(id, bootPhase))
        : await buildTrack(spec2, bootPhase);
    }
    SPEC = spec2;
    applySky(spec2);
    applyTrack(spec2, trk);
    reset(true);
  } catch (err) {
    console.error('track swap failed — reloading into the circuit instead:', err);
    if (!track) {
      // the old circuit is gone and the new one never arrived: a page load
      // is the one move that always works, because it starts a fresh process
      bootPhase('driving over the long way round', 0.1);
      location.href = './race.html?track=' + id;
      return;
    }
  } finally {
    swapping = false;
    document.body.classList.toggle('booted', !!track);
  }
}

// swap number zero: the boot build
{
  const trk0 = await buildSomewhere(SPEC, bootPhase);
  applySky(SPEC);
  applyTrack(SPEC, trk0);
  reset(true);
}

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let time = 0, frames = 0;

function frame() {
  try { tick(); } catch (err) {
    // A throw inside the loop used to end it: requestAnimationFrame is only
    // rescheduled at the bottom, so one bad frame stopped the camera, the timer
    // and the traffic while the watchdog kept painting a still frame that looked
    // like a running game. Report it once and keep driving.
    if (!window.__frameErr) { window.__frameErr = String(err && err.stack || err); console.error(err); }
  }
  requestAnimationFrame(frame);
}

function tick() {
  if (swapping || !track) return;    // mid-swap the world does not exist
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  renderer.shadowMap.needsUpdate = (frames++ % 3) === 0;

  let throttle = 0, steer = 0, drift = false;
  if (!done) {
    drift = keys.has(' ') || keys.has('shift');
    if (keys.has('w') || keys.has('arrowup')) throttle = 1;
    if (keys.has('s') || keys.has('arrowdown')) throttle = -1;
    if (keys.has('a') || keys.has('arrowleft')) steer = -1;
    if (keys.has('d') || keys.has('arrowright')) steer = 1;
  } else throttle = -0.6;
  // THE CEREMONY, then the lights. First arrival gets six seconds of the
  // circuit — a high reveal swooping down to the grid while the card says
  // where you are and what it asks. Any key skips straight to the countdown.
  if (intro > 0) {
    intro -= dt;
    if (keys.size) intro = 0;
    if (intro <= 0 && introCard) introCard.classList.add('hidden');
    throttle = 0; steer = 0; drift = false;
  } else
  // THE LIGHTS. Nobody moves until they go out — including you, which is why
  // the throttle is held at zero rather than merely ignored. A countdown you can
  // creep through is not a countdown.
  if (!running && !done) {
    countdown -= dt;
    const light = Math.max(0, Math.ceil(countdown));
    if (light !== lastLight) {
      lastLight = light;
      if (light > 0) { audio.beep(); hud.msg.innerHTML = `<b class="light">${light}</b>`; }
    }
    if (countdown <= 0) {
      running = true;
      field.start();
      // the worker starts on the NEXT round while you race this one
      if (inGP && gp && gp.round + 1 < GP.ROUNDS.length) prefetchNext(GP.ROUNDS[gp.round + 1]);
      audio.beep();
      lampsGo(time);
      hud.msg.innerHTML = '<b class="light go">go</b>';
      msgUntil = time + 1.0;
    } else {
      throttle = 0; steer = 0; drift = false;
    }
  }

  car.step(dt, throttle, steer, ground, drift);
  if (running && !done) { lapTime += dt; raceClock += dt; }

  const loc = track.path.locate(car.state.x, car.state.z, s);

  // The lap, recorded as it happens: 10Hz samples of where the car is. If the
  // lap turns out to be the best, the recording IS the new ghost.
  if (running && !done) {
    recTimer += dt;
    if (recTimer >= 0.1) {
      recTimer -= 0.1;
      rec.push(+car.state.x.toFixed(1), +car.state.z.toFixed(1),
        +car.state.heading.toFixed(3), +car.state.yView.toFixed(1), +loc.s.toFixed(1));
    }
    // sector gates at thirds, read against the ghost's clock
    for (const gate of SEC_AT) {
      if (prevS < gate && loc.s >= gate && ghostData) {
        const gt = ghostTimeAt(gate);
        if (gt !== null) {
          const diff = lapTime - gt;
          hud.msg.innerHTML = `<b style="color:${diff <= 0 ? '#7fe08a' : '#ff8a6a'}">`
            + `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}</b>`;
          msgUntil = time + 1.4;
        }
      }
    }
    // the wrong way, said plainly — a corrected player stops seeing it at once
    const ds = loc.s - prevS;
    if (Math.abs(ds) < track.path.total / 2) {
      wrongWay = ds < -0.4 ? wrongWay + dt : 0;
      if (wrongWay > 1.2) { hud.msg.innerHTML = '<b style="color:#ff8a6a">wrong way</b>'; msgUntil = time + 0.4; }
    }
  }

  if (running && !done && prevS > track.path.total * 0.8 && loc.s < track.path.total * 0.2) {
    const t = +lapTime.toFixed(2);
    splits.push(t);
    if (Garage.recordLap(savefile, track.id, t)) {
      best = t;
      // the lap that just ended is the new reference: save it, embody it
      savefile.ghosts = savefile.ghosts || {};
      savefile.ghosts[track.id] = { dt: 0.1, lap: t, f: rec };
      Garage.save(savefile);
      ghostData = savefile.ghosts[track.id];
      gPtr = 0;
      if (!ghost) buildGhost();
    }
    rec = []; recTimer = 0; gPtr = 0;
    lap++;
    audio.beep();
    lapTime = 0;
    if (lap >= LAPS) {
      done = true;
      finish();
    }
  }
  prevS = loc.s;
  s = loc.s;
  // Only the track knows where the tarmac ends, so it is the track that tells
  // the car. |u| is exact and free — we already have it from locate().
  car.state.offRoad = Math.abs(loc.u) > ROAD_HALF - 4;

  // BOOST PADS: drive the chevrons, take a tier-one boost — the same push,
  // cap and spark the drift bank pays out, so the two systems read as one.
  // Player only: the rivals race their own pace and owe you nothing.
  if (running && !done && car.state.boost <= 0) {
    for (let i = 0; i < PADS.length; i++) {
      let ds = s - PADS[i].s;
      if (ds < -track.path.total / 2) ds += track.path.total;
      if (ds >= 0 && ds < 60 && Math.abs(loc.u - (PADS[i].u || 0)) < 32 && time > padCool[i]) {
        padCool[i] = time + 4;
        car.state.boost = 0.9;
        car.state.boostTier = 1;
      }
    }
  }

  // OFF THE MAP. The playtest wandered clean off the built world — the drag
  // lets you crawl anywhere now, so far off the course the game has to bring
  // you back the way every racing game does: a short grace, then a recovery.
  if (running && !done && Math.abs(loc.u) > ROAD_HALF + 160) {
    offCourse += dt;
    if (offCourse > 1.2 && offCourse < 3) {
      hud.msg.textContent = 'return to the road';
      msgUntil = time + 0.4;
    }
    if (offCourse >= 3) {
      offCourse = 0;
      const spot = safeSpot(track.path, ground, s);
      if (spot) {
        car.respawn(spot.x, spot.z, spot.heading, track.elev(spot.s) - 1);
        s = prevS = spot.s;
        hud.msg.textContent = 'back to the road';
        msgUntil = time + 1.4;
      }
    }
  } else offCourse = 0;

  // STUCK AGAINST SOMETHING. Reverse frees you everywhere on tarmac, but the
  // playtest did not reach for it — so the game says so, once the car has
  // been pinned under throttle for a moment.
  if (running && !done && throttle > 0 && Math.abs(car.state.speed) < 6) {
    pinned += dt;
    if (pinned > 0.8 && !msgUntil) { hud.msg.textContent = 'hold S — reverse out'; msgUntil = time + 1.2; }
  } else pinned = 0;

  // Somebody else's car. Solid, heavy, and the hardest thing on the circuit to
  // hit -- but still a slowdown you drive out of, not a spin.
  if (!car.state.crash && car.state.speed > 40) {
    const other = field.hits(car.state.x, car.state.z, car.state.heading);
    if (other) {
      car.impact(0.7, true);
      other.shunt(car.state.x, car.state.z, car.state.speed);
      audio.impact(0.6);
      hud.msg.textContent = 'contact with ' + other.name;
      msgUntil = time + 1.2;
    }
  }
  if (!car.state.crash && car.state.speed > 40) {
    const t = traffic.hits(car.state.x, car.state.z, car.state.heading);
    if (t) {
      car.impact(0.82, true);
      traffic.shove(t, car.state.x, car.state.z);
      audio.impact(0.7);
      hud.msg.textContent = 'you hit a car';
      msgUntil = time + 1.6;
    }
  }

  // A pedestrian is not a wall. You carry them, you lose most of your speed,
  // and the lap is still yours to finish — which is what makes lifting for them
  // a decision instead of a rule.
  if (car.state.speed > 20) {
    const who = life.hits(car.state.x, car.state.z, car.state.heading);
    if (who && life.strike(who, car.state.x, car.state.z, car.state.speed)) {
      car.impact(0.55, false);
      audio.thud();
      struck++;
      hud.msg.textContent = 'you hit somebody';
      msgUntil = time + 1.8;
    }
  }
  if (msgUntil && time > msgUntil && !done) { hud.msg.textContent = ''; msgUntil = 0; }
  if (car.state.crash > 0 && !wasDown) { crashes++; downAt = s; audio.impact(car.state.shake || 0.5); }
  wasDown = car.state.crash > 0;
  // Only a car that cannot get itself out gets put back on the road.
  if (car.state.wedged) {
    car.state.wedged = false;
    const spot = safeSpot(track.path, ground, s);
    if (spot) { car.respawn(spot.x, spot.z, spot.heading, track.elev(spot.s) - 1); s = prevS = spot.s; }
  }

  for (const mv of movers) mv.update(dt, raceClock);

  car.setWet(wet);
  field.setWet(wet);
  // Cut again after the second playtest round — the rain is set dressing on
  // top of a grip mechanic now, not a veil. The wet costs you in the TYRES.
  post.params.wet = wet * 0.45;
  post.params.rain = wet * 0.22;
  scene.fog.density = SKY.fogD + wet * 0.00008;

  audio.update(car.state.speed, V_MAX, throttle, car.state.slip, car.state.offRoad);
  if (car.state.boost > 0 && !wasBoosting) audio.kerb();
  wasBoosting = car.state.boost > 0;
  car.present(dt);
  field.update(dt, LAPS, car.state);
  traffic.update(dt, track.path.total);
  // Rivals meet the traffic the way you do. They collide with every wall,
  // cone and skip through the same ground field as the player — but they were
  // driving clean through somebody else's evening, which read as ghosts the
  // moment anybody noticed.
  for (const rv of field.cars) {
    const st = rv.car.state;
    if (st.crash > 0 || st.speed <= 40) continue;
    const hit = traffic.hits(st.x, st.z, st.heading);
    if (hit) { rv.car.impact(0.6, true); traffic.shove(hit, st.x, st.z); }
  }
  life.update(time, dt, car.state.x, car.state.z);
  smoke.update(time, dt);
  for (let i = 0; i < tvs.length; i++) {
    const m = tvs[i];
    const d = Math.hypot(m.position.x - car.state.x, m.position.z - car.state.z);
    m.visible = d < 900;
    if (!m.visible) continue;
    m.lookAt(camera.position);
    // each set is on a different programme
    m.material.opacity = 0.55 * neonFlicker(time * 0.7 + i * 3.1);
  }

  // the ghost drives its saved lap against your lap clock
  if (ghost) {
    if (ghostData && running && !done && lapTime < ghostData.lap) {
      const n = (ghostData.f.length / 5) | 0;
      const gi = Math.min(Math.floor(lapTime / ghostData.dt), n - 2);
      const fr = ghostData.f, a = gi * 5, b = a + 5;
      const mix = Math.min(1, lapTime / ghostData.dt - gi);
      let gdh = fr[b + 2] - fr[a + 2];
      while (gdh > Math.PI) gdh -= Math.PI * 2;
      while (gdh < -Math.PI) gdh += Math.PI * 2;
      ghost.root.visible = true;
      ghost.root.position.set(
        fr[a] + (fr[b] - fr[a]) * mix,
        fr[a + 3] + (fr[b + 3] - fr[a + 3]) * mix,
        fr[a + 1] + (fr[b + 1] - fr[a + 1]) * mix);
      ghost.root.rotation.y = fr[a + 2] + gdh * mix;
    } else ghost.root.visible = false;
  }

  const near = LAMPS
    .map(l => ({ l, d: (l.x - car.state.x) ** 2 + (l.z - car.state.z) ** 2 }))
    .sort((a, b) => a.d - b.d);
  for (let i = 0; i < near.length; i++) near[i].l.light.visible = i < LIVE_LAMPS;

  // start lights: face the camera while they are up, and go out after the go
  if (lampsOffAt && time > lampsOffAt) { lampsOffAt = 0; for (const m of startLamps) m.visible = false; }
  for (const m of startLamps) if (m.visible) m.lookAt(camera.position);

  // camera: trail the heading and look well up the road — at 80 km/h you are
  // reading the corner, not the bonnet
  const h = car.state.heading;
  const shift = (keys.has('q') ? -1 : 0) + (keys.has('e') ? 1 : 0) + held;
  const want = shift ? Math.sign(shift) * 1.15 : camYawWant;
  camYaw += (want - camYaw) * Math.min(1, dt * 7);
  const hc = h + camYaw;
  // The gatehouse's low vault is the set piece, so the CAMERA dips under it
  // rather than the vault being raised to clear the camera — at 84 up the
  // whole leg was watched through the portcullis grate. Eased, so entering
  // the leg reads as ducking under the arch rather than a cut.
  const sec = sectionAt(s);
  const wantUp = CAM.up * zoom;
  const lowCap = sec.district === 'gatehouse' ? 46 : null;
  camDrop += (((lowCap !== null && lowCap < wantUp) ? wantUp - lowCap : 0) - camDrop) * Math.min(1, dt * 4);
  const back = CAM.back * zoom, up = wantUp - camDrop;
  // Height is relative to the CAR, not to zero — on a 4-metre profile a fixed
  // camera height is underground at the top of the crescent.
  camPos.set(car.state.x - Math.sin(hc) * back, car.state.yView + up, car.state.z - Math.cos(hc) * back);
  camera.position.lerp(camPos, Math.min(1, dt * CAM.lag));
  // Eighty read as about fifty, because nothing in the frame changed with
  // speed. The lens opens eight degrees across the range and the camera picks
  // up a tremble past halfway -- both small enough that you feel them rather
  // than see them, which is the point.
  const fSpd = Math.min(1, Math.abs(car.state.speed) / V_MAX);
  // 13 degrees across the range, was 8 — the widening moved the road edges
  // away and took the speed read with them; the lens gives some of it back.
  const wantFov = 34 + fSpd * fSpd * 13;
  if (Math.abs(camera.fov - wantFov) > 0.02) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
  const rattle = Math.max(0, fSpd - 0.5) * (car.state.offRoad ? 5.2 : 2.3);
  if (rattle > 0.01) {
    camera.position.x += Math.sin(time * 47.3) * rattle;
    camera.position.y += Math.sin(time * 61.7) * rattle * 0.8;
  }
  // Looking up the road only makes sense while the camera is behind you. The
  // further it swings, the more it aims at the car itself.
  const reach = CAM.ahead * Math.max(0, 1 - Math.abs(camYaw) / 1.2);
  camAim.set(car.state.x + Math.sin(h) * reach, car.state.yView + 16, car.state.z + Math.cos(h) * reach);
  camera.lookAt(camAim);
  // the ceremony camera: a high reveal drifting over the circuit, then a dive
  // to the grid that hands over exactly where the chase camera will be
  if (intro > 0) {
    const t6 = 6 - intro;
    const fI = pathFrame();
    if (t6 < 3.2) {
      const rs = track.path.total * 0.22 + t6 * 90;
      track.path.at(rs, fI);
      camera.position.set(fI.x - fI.nx * 260, track.elev(rs) + 300, fI.z - fI.nz * 260);
      track.path.at(rs + 420, fI);
      camera.lookAt(fI.x, track.elev(rs + 420) + 20, fI.z);
    } else {
      const k = Math.min(1, (t6 - 3.2) / 2.6);
      const e = k * k * (3 - 2 * k);
      track.path.at(START.s - 320, fI);
      const hy = track.elev(START.s - 320) + 210;
      camera.position.set(
        fI.x + (camPos.x - fI.x) * e, hy + (camPos.y - hy) * e, fI.z + (camPos.z - fI.z) * e);
      camera.lookAt(car.state.x, car.state.yView + 12, car.state.z);
    }
  }
  sky.position.copy(camera.position);
  post.params.focus = camera.position.distanceTo(camAim);
  moon.target.position.set(car.state.x, car.state.yView, car.state.z);
  moon.position.set(car.state.x + SKY.sun[0], car.state.yView + SKY.sun[1], car.state.z + SKY.sun[2]);
  fill.target.position.set(car.state.x, car.state.yView, car.state.z);
  fill.position.set(car.state.x + 340, car.state.yView + 110, car.state.z + 260);

  hud.speed.textContent = `${Math.round(Math.abs(car.state.speed) * 0.08 * 3.6)}`;
  hud.gear.textContent = car.state.speed < -1 ? 'R' : '';
  const tier = car.state.tier || (car.state.boost > 0 ? car.state.boostTier : 0);
  hud.drift.classList.toggle('on', tier > 0 || Math.abs(car.state.slip) > 0.12);
  hud.drift.textContent = car.state.boost > 0 ? 'boost' : (tier > 0 ? 'drift ' + '●'.repeat(tier) : 'drift');
  hud.drift.className = 'on t' + tier;
  if (tier === 0 && Math.abs(car.state.slip) <= 0.12) hud.drift.className = '';
  hud.time.textContent = lapTime.toFixed(2);
  hud.best.textContent = best ? `best ${best.toFixed(2)}s` : '';
  hud.lap.textContent = `lap ${Math.min(lap + 1, LAPS)}/${LAPS}`;
  // Where you are in the field, in metres of TRACK rather than straight-line
  // distance — on a loop those two disagree by half a lap.
  const mine = lap * track.path.total + s;
  if (running && !done) {
    const table = field.standings(mine);
    const at = table.findIndex(r => r.you);
    // The gap that matters is to whoever is immediately in front, or behind if
    // you are leading. A gap to the leader is useless information in fourth.
    const rel = at > 0 ? table[at - 1] : table[1];
    const gap = rel ? (mine - rel.progress) * 0.08 : 0;
    hud.pos.textContent = `P${at + 1}/${table.length}  ${gap >= 0 ? '+' : ''}${gap.toFixed(0)}m`;
    hud.pos.classList.toggle('behind', at > 0);
    // the overtake, announced the moment it happens
    if (lastPlace !== null && at !== lastPlace && !msgUntil) {
      hud.msg.innerHTML = `<b style="color:${at < lastPlace ? '#7fe08a' : '#ff8a6a'}">P${at + 1}</b>`;
      msgUntil = time + 1.1;
    }
    lastPlace = at;
    // the live delta against the ghost, green when you are up on yourself
    if (ghostData && hud.delta) {
      const gt = ghostTimeAt(s);
      if (gt !== null) {
        const dl = lapTime - gt;
        hud.delta.textContent = `${dl >= 0 ? '+' : ''}${dl.toFixed(2)}`;
        hud.delta.className = dl <= 0 ? 'up' : 'down';
      }
    } else if (hud.delta) hud.delta.textContent = '';
    // The order board. Five other cars in the dark is a set of headlights; a
    // list of names is a field you are working through.
    hud.board.innerHTML = table.map((r, i) =>
      `<span class="${r.you ? 'you' : ''}">${i + 1} ${r.name}</span>`).join('');
  } else {
    hud.pos.textContent = '';
    hud.board.innerHTML = '';
    if (hud.delta) hud.delta.textContent = '';
  }

  hud.sect.textContent = sec.name;
  hud.sect.classList.toggle('dark', !sec.lit);
  drawMap();

  post.render(scene, camera, time);
}
frame();
setInterval(() => {
  if (document.hidden) return;
  renderer.shadowMap.needsUpdate = true;
  post.render(scene, camera, time);
}, 1000);

// ----------------------------------------------------------------- garage
// The same counter the hub has, mounted here so you can fit a part between
// races without walking back into town.
const garage = mountGarage({
  save: savefile,
  onChange: () => { rebuildCar(); hud.msg.textContent = 'fitted'; msgUntil = time + 1.6; },
});
// The circuit picker, one key away mid-session — changing tracks used to mean
// walking back through the hub.
const picker = mountTrackSelect({
  save: savefile,
  onGo: (t2) => { picker.hide(); swapTrack(t2.id); },
});
const pickerShow = () => picker.show();
const paintGarage = () => garage.paint();
const toggleGarage = () => garage.toggle();

window.DYNAMO = {
  scene, camera, renderer, post, track, car, ground, life, traffic, field, gp: GP,
  reset, swapTrack, prefetchNext,
  sim: (opts) => {
    const r = compare(track, opts);
    console.table(r.rows.map(({ policy, time, crashes, blindHits, avgSpeed, finished }) =>
      ({ policy, time, crashes, blindHits, avgSpeed, finished })));
    console.log(r.verdict);
    return r;
  },
  run: (policy, opts) => run(track, policy, opts),
  // Does THIS circuit do what it claims? Each track declares its own question.
  assay: () => assay(track),
  parts: () => parts(track),
  place: (atS, u = 0) => {
    const f = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
    track.path.place(atS, u, f);
    car.respawn(f.x, f.z, Math.atan2(f.tx, f.tz), track.elev(atS) - 1);
    s = prevS = atS;
  },
  save: savefile, garage: Garage, paintGarage,
  voxels: track.voxels,
  buildMs: track.buildMs,
  lapMetres: Math.round(track.lapLength * 0.08),
  ready: true,
};
document.body.classList.add('booted');
