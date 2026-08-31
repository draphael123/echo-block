// DYNAMO — the circuit.
//
// Cars, because a bike does not read at 8cm per voxel: thin tubes vanish, and a
// solid mass with panels and glass and lights does not. The hub's renderer is
// shared on purpose — testing the look on a different one would answer a
// different question.
import * as THREE from 'three';
import { buildSky } from '../lights.js';
import { Post } from '../post.js';
import { Ground } from '../walk.js';
import { buildTrack, sectionAt, safeSpot, lifeSpots } from './track.js';
import { buildCar } from './car.js';
import { buildLife, buildTraffic } from './life.js';
import { compare, run } from './sim.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x070b16, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x141d31, 0.00115);
const sky = buildSky();
scene.add(sky);

const track = buildTrack();
scene.add(track.group);
const ground = new Ground(track.field);

// ------------------------------------------------------------------ light
const hemi = new THREE.HemisphereLight(0x2b3d60, 0x2c1f16, 0.46);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xbdd2f2, 1.6);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 60, far: 1400 });
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.9;
scene.add(moon, moon.target);

// Only the poles near the car are lit. The forward renderer loops every light
// per pixel, and a circuit has an order of magnitude more poles than a block.
const LAMPS = track.anchors.lamps.map(([x, y, z]) => {
  const l = new THREE.SpotLight(0xffa23c, 150000, 260, 0.85, 0.75, 2);
  l.position.set(x, y, z);
  l.target.position.set(x, 2, z + 8);
  l.visible = false;
  scene.add(l, l.target);
  return { light: l, x, z };
});
const LIVE_LAMPS = 7;

// ------------------------------------------------------------------- cast
const paint = +(localStorage.getItem('dynamo.paint') || 0) || 0;
const car = buildCar(paint);
scene.add(car.root);
car.state.x = track.start.x;
car.state.z = track.start.z;
car.state.heading = track.start.heading;

const life = buildLife(track.path, lifeSpots());
scene.add(life.group);

// Somebody else's evening, on the road you happen to be racing on.
const traffic = buildTraffic(track.path, buildCar, [
  { s: 1600, u: 36, speed: 96, dir: 1 },
  { s: 3400, u: -36, speed: 84, dir: -1 },
  { s: 4600, u: 34, speed: 108, dir: 1 },
]);
scene.add(traffic.group);

// ----------------------------------------------------------------- camera
// A chase camera on a longish lens: wide enough to read a corner at 80, long
// enough that the compression the whole look depends on survives.
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 12, 2400);
const post = new Post(renderer, innerWidth, innerHeight);
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
let camYaw = 0, camYawWant = 0;
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
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (k === 'r') reset();
  if (k === 'v') camYawWant = camYawWant ? 0 : Math.PI;   // latched look-back
  if (k === 'h') hud.help.classList.toggle('hidden');
  if (k === 'c') { localStorage.setItem('dynamo.paint', String((paint + 1) % 4)); location.reload(); }
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
};

const LAPS = 3;
let lapTime = 0, lap = 0, running = false, done = false;
let s = 80, prevS = 80, crashes = 0, wasDown = false, downAt = 0;
let best = +(localStorage.getItem('dynamo.lap') || 0) || null;
const splits = [];

function reset() {
  car.respawn(track.start.x, track.start.z, track.start.heading);
  car.state.crash = 0; car.state.dist = 0;
  lapTime = 0; lap = 0; running = false; done = false;
  s = prevS = 80; crashes = 0; wasDown = false;
  splits.length = 0;
  hud.msg.textContent = 'accelerate to start';
}
reset();

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
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  renderer.shadowMap.needsUpdate = (frames++ % 3) === 0;

  let throttle = 0, steer = 0;
  if (!done) {
    if (keys.has('w') || keys.has('arrowup')) throttle = 1;
    if (keys.has('s') || keys.has('arrowdown')) throttle = -1;
    if (keys.has('a') || keys.has('arrowleft')) steer = -1;
    if (keys.has('d') || keys.has('arrowright')) steer = 1;
  } else throttle = -0.6;
  if (throttle > 0 && !running && !done) { running = true; hud.msg.textContent = ''; }

  car.step(dt, throttle, steer, ground);
  if (running && !done) lapTime += dt;

  const loc = track.path.locate(car.state.x, car.state.z, s);
  if (running && !done && prevS > track.path.total * 0.8 && loc.s < track.path.total * 0.2) {
    const t = +lapTime.toFixed(2);
    splits.push(t);
    if (!best || t < best) { best = t; localStorage.setItem('dynamo.lap', String(t)); }
    lap++;
    lapTime = 0;
    if (lap >= LAPS) {
      done = true;
      hud.msg.innerHTML = `<b>${splits.map(x => x.toFixed(2)).join(' &middot; ')}</b>`
        + `${crashes} crash${crashes === 1 ? '' : 'es'} &nbsp; <span class="dim">R to reset</span>`;
    }
  }
  prevS = loc.s;
  s = loc.s;

  // traffic is solid; the voxel world already handles everything else
  if (!car.state.crash && car.state.speed > 60 && traffic.hits(car.state.x, car.state.z)) car.crash();
  if (car.state.crash > 0 && !wasDown) { crashes++; downAt = s; }
  if (wasDown && car.state.crash <= 0) {
    const spot = safeSpot(track.path, ground, downAt);
    if (spot) { car.respawn(spot.x, spot.z, spot.heading); s = prevS = spot.s; }
  }
  wasDown = car.state.crash > 0;

  car.present(dt);
  traffic.update(dt, track.path.total);
  life.update(time, dt, car.state.x, car.state.z);

  const near = LAMPS
    .map(l => ({ l, d: (l.x - car.state.x) ** 2 + (l.z - car.state.z) ** 2 }))
    .sort((a, b) => a.d - b.d);
  for (let i = 0; i < near.length; i++) near[i].l.light.visible = i < LIVE_LAMPS;

  // camera: trail the heading and look well up the road — at 80 km/h you are
  // reading the corner, not the bonnet
  const h = car.state.heading;
  const shift = (keys.has('q') ? -1 : 0) + (keys.has('e') ? 1 : 0) + held;
  const want = shift ? Math.sign(shift) * 1.15 : camYawWant;
  camYaw += (want - camYaw) * Math.min(1, dt * 7);
  const hc = h + camYaw;
  const back = CAM.back * zoom, up = CAM.up * zoom;
  camPos.set(car.state.x - Math.sin(hc) * back, up, car.state.z - Math.cos(hc) * back);
  camera.position.lerp(camPos, Math.min(1, dt * CAM.lag));
  // Looking up the road only makes sense while the camera is behind you. The
  // further it swings, the more it aims at the car itself.
  const reach = CAM.ahead * Math.max(0, 1 - Math.abs(camYaw) / 1.2);
  camAim.set(car.state.x + Math.sin(h) * reach, 16, car.state.z + Math.cos(h) * reach);
  camera.lookAt(camAim);
  sky.position.copy(camera.position);
  post.params.focus = camera.position.distanceTo(camAim);
  moon.target.position.set(car.state.x, 0, car.state.z);
  moon.position.set(car.state.x - 320, 470, car.state.z - 240);

  hud.speed.textContent = `${Math.round(car.state.speed * 0.08 * 3.6)}`;
  hud.time.textContent = lapTime.toFixed(2);
  hud.best.textContent = best ? `best ${best.toFixed(2)}s` : '';
  hud.lap.textContent = `lap ${Math.min(lap + 1, LAPS)}/${LAPS}`;
  const sec = sectionAt(s);
  hud.sect.textContent = sec.lit ? sec.name : `${sec.name} — no lights`;
  hud.sect.classList.toggle('dark', !sec.lit);

  post.render(scene, camera, time);
}
frame();
setInterval(() => {
  if (document.hidden) return;
  renderer.shadowMap.needsUpdate = true;
  post.render(scene, camera, time);
}, 1000);

window.DYNAMO = {
  scene, camera, renderer, post, track, car, ground, life, traffic,
  reset,
  sim: (opts) => {
    const r = compare(track, opts);
    console.table(r.rows.map(({ policy, time, crashes, blindHits, avgSpeed, finished }) =>
      ({ policy, time, crashes, blindHits, avgSpeed, finished })));
    console.log(r.verdict);
    return r;
  },
  run: (policy, opts) => run(track, policy, opts),
  place: (atS, u = 0) => {
    const f = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
    track.path.place(atS, u, f);
    car.respawn(f.x, f.z, Math.atan2(f.tx, f.tz));
    s = prevS = atS;
  },
  voxels: track.voxels,
  buildMs: track.buildMs,
  lapMetres: Math.round(track.lapLength * 0.08),
  ready: true,
};
document.body.classList.add('booted');
