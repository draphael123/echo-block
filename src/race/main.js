// DYNAMO — track prototype.
//
// This slice exists to answer three questions and nothing else:
//   1. does the ECHO BLOCK look survive 35 km/h
//   2. is the dynamo a decision or a punishment spiral
//   3. is a bicycle exciting at honest speed
//
// It shares the hub's renderer on purpose. Testing the look on a different
// renderer would answer a different question.
import * as THREE from 'three';
import { buildSky } from '../lights.js';
import { Post } from '../post.js';
import { Ground } from '../walk.js';
import { buildTrack, isLit, SECTIONS, safeSpot } from './track.js';
import { buildRider, V_MAX } from './bike.js';
import { compare, run } from './sim.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x070b16, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x141d31, 0.0013);
const sky = buildSky();
scene.add(sky);

const track = buildTrack();
scene.add(track.group);
const ground = new Ground(track.field);

// ------------------------------------------------------------------ light
// Same grammar as the hub: a cool key that only stops things going pure black,
// a warm bounce, and everything else coming from small local sources. Out here
// there are far fewer of them, which is the point.
const hemi = new THREE.HemisphereLight(0x2b3d60, 0x2c1f16, 0.42);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xbdd2f2, 1.5);
moon.position.set(-300, 460, -220);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 60, far: 1400 });
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.9;
scene.add(moon, moon.target);
// only the lamps near the rider are lit at any moment — the forward renderer
// loops every light per pixel, and a track has far more poles than a block
const LAMPS = track.anchors.lamps.map(([x, y, z]) => {
  const l = new THREE.SpotLight(0xffa23c, 0, 250, 0.85, 0.75, 2);
  l.position.set(x, y, z);
  l.target.position.set(x, 2, z + 8);
  l.visible = false;
  scene.add(l, l.target);
  return { light: l, x, z };
});
const LIVE_LAMPS = 6;

const look = JSON.parse(localStorage.getItem('echo-block.look') || 'null') || {};
const rider = buildRider(look);
scene.add(rider.root);
rider.state.x = track.start.x;
rider.state.z = track.start.z;
rider.state.heading = track.start.heading;

// ----------------------------------------------------------------- camera
// A chase camera, still on a longish lens. Wide enough to read a corner at
// speed, long enough that the compression the whole look depends on survives.
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 12, 1800);
const post = new Post(renderer, innerWidth, innerHeight);
post.params.range = 210;
post.params.maxBlur = 7;
post.params.focus = 170;
const CAM = { back: 132, up: 58, ahead: 66, lag: 5.2 };
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
  if (k === 'h') hud.help.classList.toggle('hidden');
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

// -------------------------------------------------------------------- hud
const hud = {
  speed: document.getElementById('speed'),
  lamp: document.getElementById('lampbar'),
  time: document.getElementById('time'),
  sect: document.getElementById('sect'),
  msg: document.getElementById('msg'),
  help: document.getElementById('help'),
  best: document.getElementById('best'),
};

let raceTime = 0, running = false, finished = false, s = 90, crashes = 0, wasDown = false, downAt = 0;
const RESPAWN = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
let best = +(localStorage.getItem('dynamo.best') || 0) || null;
const ghost = [];                       // [t, x, z, heading] of the current run
let bestGhost = JSON.parse(localStorage.getItem('dynamo.ghost') || 'null');
let ghostMesh = null;
if (bestGhost) {
  ghostMesh = buildRider(look);
  ghostMesh.root.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.28;
    o.material.depthWrite = false;
    o.castShadow = false;
  });
  scene.add(ghostMesh.root);
}

function reset() {
  rider.state.x = track.start.x;
  rider.state.z = track.start.z;
  rider.state.heading = track.start.heading;
  rider.state.speed = 0;
  rider.state.lamp = 0;
  rider.state.crash = 0;
  rider.state.dist = 0;
  raceTime = 0; running = false; finished = false; s = 90; crashes = 0;
  ghost.length = 0;
  for (const h of track.hazards) h.done = false;
  hud.msg.textContent = 'pedal to start';
}
reset();

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let time = 0, frames = 0;
const FINISH = track.path.total - 80;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  renderer.shadowMap.needsUpdate = (frames++ % 3) === 0;

  let throttle = 0, steer = 0;
  if (!finished) {
    if (keys.has('w') || keys.has('arrowup')) throttle = 1;
    if (keys.has('s') || keys.has('arrowdown')) throttle = -1;
    if (keys.has('a') || keys.has('arrowleft')) steer = -1;
    if (keys.has('d') || keys.has('arrowright')) steer = 1;
  } else {
    throttle = -0.5;
  }
  if (throttle > 0 && !running && !finished) { running = true; hud.msg.textContent = ''; }

  rider.step(dt, throttle, steer, ground);
  if (running && !finished) {
    raceTime += dt;
    if (ghost.length === 0 || raceTime - ghost[ghost.length - 4] > 0.05)
      ghost.push(raceTime, rider.state.x, rider.state.z, rider.state.heading);
  }

  const loc = track.path.locate(rider.state.x, rider.state.z, s);
  s = loc.s;

  // Crashes come out of the collision, not out of a declared radius — see
  // bike.js. All this does is count them.
  if (rider.state.crash > 0 && !wasDown) { crashes++; downAt = s; }
  if (wasDown && rider.state.crash <= 0) {
    // up, pointing down the road, somewhere that is actually clear
    const spot = safeSpot(track.path, ground, downAt);
    if (spot) { rider.respawn(spot.x, spot.z, spot.heading); s = spot.s; }
  }
  wasDown = rider.state.crash > 0;

  if (running && !finished && s >= FINISH) {
    finished = true;
    const t = +raceTime.toFixed(2);
    const better = !best || t < best;
    if (better) {
      best = t;
      localStorage.setItem('dynamo.best', String(t));
      localStorage.setItem('dynamo.ghost', JSON.stringify(ghost));
    }
    hud.msg.innerHTML = `<b>${t.toFixed(2)}s</b> &nbsp; ${crashes} crash${crashes === 1 ? '' : 'es'}`
      + (better ? ' &nbsp; <span class="pb">new best</span>' : '') + ' &nbsp; <span class="dim">R to reset</span>';
  }

  rider.present(time, dt);

  // ghost playback
  if (ghostMesh && bestGhost && bestGhost.length >= 4) {
    const gt = running ? raceTime : 0;
    let i = 0;
    while (i + 7 < bestGhost.length && bestGhost[i + 4] < gt) i += 4;
    ghostMesh.root.position.set(bestGhost[i + 1], 0, bestGhost[i + 2]);
    ghostMesh.root.rotation.y = bestGhost[i + 3];
    ghostMesh.root.visible = gt > 0 && gt < bestGhost[bestGhost.length - 4] + 1;
  }

  // only the nearest handful of streetlights are on
  const near = LAMPS
    .map(l => ({ l, d: (l.x - rider.state.x) ** 2 + (l.z - rider.state.z) ** 2 }))
    .sort((a, b) => a.d - b.d);
  for (let i = 0; i < near.length; i++) near[i].l.light.visible = i < LIVE_LAMPS;

  // camera: trail behind the heading, look a little ahead of the wheel
  const h = rider.state.heading;
  camPos.set(
    rider.state.x - Math.sin(h) * CAM.back,
    CAM.up,
    rider.state.z - Math.cos(h) * CAM.back,
  );
  camera.position.lerp(camPos, Math.min(1, dt * CAM.lag));
  camAim.set(
    rider.state.x + Math.sin(h) * CAM.ahead,
    14,
    rider.state.z + Math.cos(h) * CAM.ahead,
  );
  camera.lookAt(camAim);
  sky.position.copy(camera.position);
  post.params.focus = camera.position.distanceTo(camAim);
  moon.target.position.set(rider.state.x, 0, rider.state.z);
  moon.position.set(rider.state.x - 300, 460, rider.state.z - 220);

  // hud
  const kmh = Math.round(rider.state.speed * 0.08 * 3.6);
  hud.speed.textContent = `${kmh}`;
  hud.lamp.style.width = `${Math.round(Math.min(1, rider.state.lamp / 0.7) * 100)}%`;
  hud.lamp.classList.toggle('sat', rider.state.lamp >= 0.7);
  hud.time.textContent = raceTime.toFixed(2);
  const sec = SECTIONS.find(x => s >= x.from && s < x.to);
  hud.sect.textContent = sec ? (sec.lit ? sec.name : sec.name + ' — no lights') : '';
  hud.sect.classList.toggle('dark', sec ? !sec.lit : false);
  hud.best.textContent = best ? `best ${best.toFixed(2)}s` : '';

  post.render(scene, camera, time);
  requestAnimationFrame(frame);
}
frame();
setInterval(() => { if (!document.hidden) { renderer.shadowMap.needsUpdate = true; post.render(scene, camera, time); } }, 1000);

window.DYNAMO = {
  scene, camera, renderer, post, track, rider, ground,
  reset,
  // The measurement. Prints the table and the verdict.
  sim: () => {
    const r = compare(track, look);
    console.table(r.rows);
    console.log(r.verdict);
    return r;
  },
  run: (policy, opts) => run(track, policy, { look, ...opts }),
  voxels: track.voxels,
  buildMs: track.buildMs,
  ready: true,
};
document.body.classList.add('booted');
