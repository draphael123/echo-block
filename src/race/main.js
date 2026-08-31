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
renderer.setClearColor(0x141d38, 1);

const scene = new THREE.Scene();
// The sky is lifted; the FOG is not, and the two are different jobs. Fog is
// what makes distant GEOMETRY visible, and matching it to the new horizon lit
// the unlit legs all the way to the treeline — you could see the road half a
// kilometre ahead on the one stretch whose entire point is that you cannot. A
// night sky IS brighter than the ground under it, so: bright backdrop, dark
// fog, and the dark stays dark.
scene.fog = new THREE.FogExp2(0x161f33, 0.00135);
const sky = buildSky();
scene.add(sky);

const track = buildTrack();
scene.add(track.group);
const ground = new Ground(track.field);

// ------------------------------------------------------------------ light
// An unlit mass at night was a HOLE IN THE FOG: the chapel, the mill and the
// barns were black silhouettes with windows floating on them and no volume at
// all. The reference is path-traced and its shadows carry bounce; this is the
// cheap version of that.
const hemi = new THREE.HemisphereLight(0x3b537f, 0x2c2119, 0.68);
scene.add(hemi);

// The important half. A hemisphere lights HORIZONTAL surfaces most, which is
// backwards -- it brightens the road (the thing the dark is supposed to hide)
// and leaves walls flat. This one sits LOW and opposite the moon so it rakes
// across vertical faces at a grazing angle: it gives buildings a lit side and a
// dark side, and barely touches the tarmac. No shadow, because it is a fill.
const fill = new THREE.DirectionalLight(0x7d93c4, 0.62);
scene.add(fill, fill.target);
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

const life = buildLife(track.path, lifeSpots(), ground, track.elev);
scene.add(life.group);

// Somebody else's evening, on the road you happen to be racing on.
// Six of them now, spread so there is one somewhere on most of the lap, at
// speeds that differ enough to catch each other up. Nobody is doing 80.
const traffic = buildTraffic(track.path, buildCar, [
  { s: 600, u: 54, speed: 92, dir: 1 },
  { s: 1750, u: -54, speed: 78, dir: -1 },
  { s: 2700, u: 50, speed: 104, dir: 1 },
  { s: 3900, u: -50, speed: 88, dir: -1 },
  { s: 4900, u: 56, speed: 112, dir: 1 },
  { s: 6050, u: -56, speed: 70, dir: -1 },
], track.elev);
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
  drift: document.getElementById('drift'),
};

const LAPS = 3;
let lapTime = 0, lap = 0, running = false, done = false;
let s = 80, prevS = 80, crashes = 0, wasDown = false, downAt = 0;
let struck = 0, msgUntil = 0;
let best = +(localStorage.getItem('dynamo.lap') || 0) || null;
const splits = [];

function reset() {
  car.respawn(track.start.x, track.start.z, track.start.heading, track.elev(80) - 1);
  car.state.crash = 0; car.state.dist = 0;
  lapTime = 0; lap = 0; running = false; done = false;
  s = prevS = 80; crashes = 0; wasDown = false; struck = 0; msgUntil = 0;
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

  let throttle = 0, steer = 0, drift = false;
  if (!done) {
    drift = keys.has(' ') || keys.has('shift');
    if (keys.has('w') || keys.has('arrowup')) throttle = 1;
    if (keys.has('s') || keys.has('arrowdown')) throttle = -1;
    if (keys.has('a') || keys.has('arrowleft')) steer = -1;
    if (keys.has('d') || keys.has('arrowright')) steer = 1;
  } else throttle = -0.6;
  if (throttle > 0 && !running && !done) { running = true; hud.msg.textContent = ''; }

  car.step(dt, throttle, steer, ground, drift);
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
        + `${crashes} crash${crashes === 1 ? '' : 'es'}`
        + (struck ? ` &nbsp; ${struck} pedestrian${struck === 1 ? '' : 's'}` : '')
        + ` &nbsp; <span class="dim">R to reset</span>`;
    }
  }
  prevS = loc.s;
  s = loc.s;

  // Somebody else's car. Solid, heavy, and the hardest thing on the circuit to
  // hit -- but still a slowdown you drive out of, not a spin.
  if (!car.state.crash && car.state.speed > 40) {
    const t = traffic.hits(car.state.x, car.state.z, car.state.heading);
    if (t) {
      car.impact(0.82, true);
      traffic.shove(t);
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
      struck++;
      hud.msg.textContent = 'you hit somebody';
      msgUntil = time + 1.8;
    }
  }
  if (msgUntil && time > msgUntil && !done) { hud.msg.textContent = ''; msgUntil = 0; }
  if (car.state.crash > 0 && !wasDown) { crashes++; downAt = s; }
  wasDown = car.state.crash > 0;
  // Only a car that cannot get itself out gets put back on the road.
  if (car.state.wedged) {
    car.state.wedged = false;
    const spot = safeSpot(track.path, ground, s);
    if (spot) { car.respawn(spot.x, spot.z, spot.heading, track.elev(spot.s) - 1); s = prevS = spot.s; }
  }

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
  // Height is relative to the CAR, not to zero — on a 4-metre profile a fixed
  // camera height is underground at the top of the crescent.
  camPos.set(car.state.x - Math.sin(hc) * back, car.state.yView + up, car.state.z - Math.cos(hc) * back);
  camera.position.lerp(camPos, Math.min(1, dt * CAM.lag));
  // Looking up the road only makes sense while the camera is behind you. The
  // further it swings, the more it aims at the car itself.
  const reach = CAM.ahead * Math.max(0, 1 - Math.abs(camYaw) / 1.2);
  camAim.set(car.state.x + Math.sin(h) * reach, car.state.yView + 16, car.state.z + Math.cos(h) * reach);
  camera.lookAt(camAim);
  sky.position.copy(camera.position);
  post.params.focus = camera.position.distanceTo(camAim);
  moon.target.position.set(car.state.x, car.state.yView, car.state.z);
  moon.position.set(car.state.x - 320, car.state.yView + 470, car.state.z - 240);
  fill.target.position.set(car.state.x, car.state.yView, car.state.z);
  fill.position.set(car.state.x + 340, car.state.yView + 110, car.state.z + 260);

  hud.speed.textContent = `${Math.round(car.state.speed * 0.08 * 3.6)}`;
  hud.drift.classList.toggle('on', Math.abs(car.state.slip) > 0.12);
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
    car.respawn(f.x, f.z, Math.atan2(f.tx, f.tz), track.elev(atS) - 1);
    s = prevS = atS;
  },
  voxels: track.voxels,
  buildMs: track.buildMs,
  lapMetres: Math.round(track.lapLength * 0.08),
  ready: true,
};
document.body.classList.add('booted');
