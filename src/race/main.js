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
import { buildTrack, sectionAt, safeSpot, lifeSpots, ROAD_HALF } from './track.js';
import { TRACKS, pickTrack } from './tracks/index.js';
import { buildCar, V_MAX, BODIES } from './car.js';
import { buildLife, buildTraffic } from './life.js';
import { buildRival } from './rival.js';
import { createAudio } from './audio.js';
import { buildSmoke, neonFlicker } from '../fx.js';
import * as Garage from './garage.js';
import { mountGarage } from '../garage-ui.js';
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

const track = buildTrack(pickTrack());
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
car.state.x = track.start.x;
car.state.z = track.start.z;
car.state.heading = track.start.heading;

// Somebody to race. It starts alongside you and drives its own race — no
// rubber-banding, so if you are quicker you pull away and if you are not you
// get to watch it do the thing you are failing to do.
const rival = buildRival(track, ground, buildCar, {
  paint: (savefile.paint + 3) % BODIES.length, policy: 'cautious', pace: 1, startS: 80, startU: 34,
});
scene.add(rival.root);

// A town where nothing moves is a model of a town. Smoke off the mill stack and
// the lit chimneys, and a television flickering in some of the front rooms --
// both already existed for the hub and neither had ever been switched on out
// here. Culled hard, because most of them are half a lap behind you.
const smoke = buildSmoke(track.anchors.stacks.slice(0, 14), 14);
scene.add(smoke.points);

const tvGeo = new THREE.PlaneGeometry(11, 9);
const tvs = track.anchors.tvs.slice(0, 26).map(([x, y, z]) => {
  const m = new THREE.Mesh(tvGeo, new THREE.MeshBasicMaterial({
    color: 0x79b4ff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false,
  }));
  m.position.set(x, y, z);
  scene.add(m);
  return m;
});

const life = buildLife(track.path, lifeSpots(), ground, track.elev);
scene.add(life.group);

// Somebody else's evening, on the road you happen to be racing on.
// Six of them now, spread so there is one somewhere on most of the lap, at
// speeds that differ enough to catch each other up. Nobody is doing 80.
const traffic = buildTraffic(track.path, buildCar, track.traffic, track.elev);
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
// Browsers will not start an AudioContext without a gesture, so the whole
// sound engine waits for the first key press rather than failing quietly.
// Weather. One number, and it moves the look, the grip and the sight line
// together -- which is the cheapest content this track can be given, because it
// asks the same questions as a dry lap and hands you less to answer them with.
let wet = 0, wetWant = 0;
function setWeather(v) {
  wetWant = Math.max(0, Math.min(1, v));
  hud.msg.textContent = wetWant > 0.5 ? 'rain' : 'the road is drying';
  msgUntil = time + 1.8;
}

const audio = createAudio();
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  audio.start();
  if (k === 'm') { const m = audio.mute(); hud.msg.textContent = m ? 'sound off' : 'sound on'; msgUntil = time + 1.2; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (k === 'r') reset();
  if (k === 'v') camYawWant = camYawWant ? 0 : Math.PI;   // latched look-back
  if (k === 'h') hud.help.classList.toggle('hidden');
  if (k === 'g') toggleGarage();
  if (k === 'x') setWeather(wetWant > 0.5 ? 0 : 1);
  if (k === 'c') { savefile.paint = (savefile.paint + 1) % BODIES.length; Garage.save(savefile); rebuildCar(); paintGarage(); }
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
  gear: document.getElementById('gear'),
  pos: document.getElementById('pos'),
};

const LAPS = 3;
let lapTime = 0, lap = 0, running = false, done = false;
let s = 80, prevS = 80, crashes = 0, wasDown = false, downAt = 0;
let struck = 0, msgUntil = 0;
let best = +(localStorage.getItem('dynamo.lap') || 0) || null;
const splits = [];

function reset() {
  car.respawn(track.start.x, track.start.z, track.start.heading, track.elev(80) - 1);
  rival.reset();
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
  if (throttle > 0 && !running && !done) { running = true; rival.start(); hud.msg.textContent = ''; }

  car.step(dt, throttle, steer, ground, drift);
  if (running && !done) lapTime += dt;

  const loc = track.path.locate(car.state.x, car.state.z, s);
  if (running && !done && prevS > track.path.total * 0.8 && loc.s < track.path.total * 0.2) {
    const t = +lapTime.toFixed(2);
    splits.push(t);
    if (!best || t < best) { best = t; localStorage.setItem('dynamo.lap', String(t)); }
    lap++;
    audio.beep();
    lapTime = 0;
    if (lap >= LAPS) {
      done = true;
      const won = !rival.done || (lap * track.path.total + s) >= rival.progress;
      const paid = Garage.purse({
        won, laps: LAPS, seconds: splits.reduce((a, b) => a + b, 0), crashes, struck,
      });
      savefile.money += paid;
      savefile.races++;
      Garage.save(savefile);
      paintGarage();
      hud.msg.innerHTML = `<b>${won ? 'WON' : 'LOST'} &middot; ${paid} earned</b>`
        + `<span class="dim">${splits.map(x => x.toFixed(2)).join(' &middot; ')}</span><br>`
        + `${crashes} crash${crashes === 1 ? '' : 'es'}`
        + (struck ? ` &nbsp; ${struck} pedestrian${struck === 1 ? '' : 's'}` : '')
        + ` &nbsp; <span class="dim">R to reset</span>`;
    }
  }
  prevS = loc.s;
  s = loc.s;
  // Only the track knows where the tarmac ends, so it is the track that tells
  // the car. |u| is exact and free — we already have it from locate().
  car.state.offRoad = Math.abs(loc.u) > ROAD_HALF - 4;

  // Somebody else's car. Solid, heavy, and the hardest thing on the circuit to
  // hit -- but still a slowdown you drive out of, not a spin.
  if (!car.state.crash && car.state.speed > 40 && rival.hits(car.state.x, car.state.z, car.state.heading)) {
    car.impact(0.7, true);
    hud.msg.textContent = 'contact';
    msgUntil = time + 1.2;
  }
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

  // eases in over a few seconds, so weather arrives rather than switching
  wet += (wetWant - wet) * Math.min(1, dt * 0.5);
  car.setWet(wet);
  rival.car.setWet(wet);
  post.params.wet = wet * 0.85;
  post.params.rain = wet * 0.9;
  scene.fog.density = 0.00135 + wet * 0.00055;

  audio.update(car.state.speed, V_MAX, throttle, car.state.slip, car.state.offRoad);
  car.present(dt);
  rival.update(dt, LAPS);
  traffic.update(dt, track.path.total);
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
  // Eighty read as about fifty, because nothing in the frame changed with
  // speed. The lens opens eight degrees across the range and the camera picks
  // up a tremble past halfway -- both small enough that you feel them rather
  // than see them, which is the point.
  const fSpd = Math.min(1, Math.abs(car.state.speed) / V_MAX);
  const wantFov = 34 + fSpd * fSpd * 8;
  if (Math.abs(camera.fov - wantFov) > 0.02) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
  const rattle = Math.max(0, fSpd - 0.5) * (car.state.offRoad ? 5.2 : 1.7);
  if (rattle > 0.01) {
    camera.position.x += Math.sin(time * 47.3) * rattle;
    camera.position.y += Math.sin(time * 61.7) * rattle * 0.8;
  }
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

  hud.speed.textContent = `${Math.round(Math.abs(car.state.speed) * 0.08 * 3.6)}`;
  hud.gear.textContent = car.state.speed < -1 ? 'R' : '';
  hud.drift.classList.toggle('on', Math.abs(car.state.slip) > 0.12);
  hud.time.textContent = lapTime.toFixed(2);
  hud.best.textContent = best ? `best ${best.toFixed(2)}s` : '';
  hud.lap.textContent = `lap ${Math.min(lap + 1, LAPS)}/${LAPS}`;
  // Who is ahead, in metres of track rather than in straight-line distance —
  // on a loop the two disagree by half a lap.
  const mine = lap * track.path.total + s;
  const gap = (mine - rival.progress) * 0.08;
  hud.pos.textContent = running && !done
    ? (gap >= 0 ? `P1  +${gap.toFixed(0)}m` : `P2  ${gap.toFixed(0)}m`)
    : '';
  hud.pos.classList.toggle('behind', gap < 0);

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

// ----------------------------------------------------------------- garage
// The same counter the hub has, mounted here so you can fit a part between
// races without walking back into town.
const garage = mountGarage({
  save: savefile,
  onChange: () => { rebuildCar(); hud.msg.textContent = 'fitted'; msgUntil = time + 1.6; },
});
const paintGarage = () => garage.paint();
const toggleGarage = () => garage.toggle();

window.DYNAMO = {
  scene, camera, renderer, post, track, car, ground, life, traffic, rival,
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
  save: savefile, garage: Garage, paintGarage,
  voxels: track.voxels,
  buildMs: track.buildMs,
  lapMetres: Math.round(track.lapLength * 0.08),
  ready: true,
};
document.body.classList.add('booted');
