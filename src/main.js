// ECHO BLOCK — a voxel street at night, and a kid with a flashlight walking
// down it. The look came first and still runs the place: everything that
// decides it is a knob in the settings drawer.
import * as THREE from 'three';
import { buildBlock, BOUNDS } from './block.js';
import { buildSky, buildLights, tvFlicker } from './lights.js';
import { buildPerson, buildDog, CAST } from './people.js';
import { buildTraffic } from './traffic.js';
import { Ground } from './walk.js';
import { Post } from './post.js';
import { createUI, createIntro, createDialogue } from './ui.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The block is static and only the people and cars move, so re-rendering 3.6M
// triangles into the shadow maps every frame buys almost nothing. Refresh them
// on a slower clock instead — a walking figure's shadow lagging a frame or two
// is invisible, and this is the single biggest saving in the frame.
renderer.shadowMap.autoUpdate = false;
const SHADOW_EVERY = 3;
// No tone mapping here: the composite pass does it, once, at the end.
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x070b16, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x141d31, 0.00105);
const sky = buildSky();
scene.add(sky);

const t0 = performance.now();
const block = buildBlock();
scene.add(block.group);
const rig = buildLights(scene, block.anchors);
const ground = new Ground(block.field);
const traffic = buildTraffic(scene);

// ---------------------------------------------------------------- people
const peopleGroup = new THREE.Group();
peopleGroup.name = 'people';
scene.add(peopleGroup);

const folk = CAST.map(spec => buildPerson(spec));
const player = folk.find(p => p.data.player);
const npcs = folk.filter(p => p !== player);
const biscuit = buildDog({ pos: [58, 2, 40], path: [[58, 40], [-172, 40]], speed: 1 });
for (const p of folk) peopleGroup.add(p.root);
peopleGroup.add(biscuit.root);
const pickables = folk.map(p => p.pick);
const buildMs = Math.round(performance.now() - t0);

// Drop everyone onto the collision field rather than trusting the y in their
// spec — the lawns, the pavement and the road are not at the same height.
for (const p of folk)
  p.root.position.y = Math.max(0, ground.ceilingAt(p.root.position.x, p.root.position.z));

// ---------------------------------------------------------------- camera
// A long lens on a fixed 3/4 is the single biggest lever in the whole look. A
// normal 55-60 degree follow camera makes the same geometry read as a generic
// voxel game no matter what the lighting is doing — so even while following
// the player the lens stays long and the angle stays put. It trails; it never
// orbits.
const camera = new THREE.PerspectiveCamera(22, innerWidth / innerHeight, 20, 1600);
const post = new Post(renderer, innerWidth, innerHeight);

const FOLLOW = { offset: new THREE.Vector3(96, 148, 196), fov: 23, range: 120, blur: 11 };

// Interiors get their own fixed camera, which is how the reference does rooms
// and also the only thing that works: a trailing camera outside the building
// is looking at the back of a brick wall the moment you step through the door.
// Inside, the camera stops following and the player moves within the frame.
const INSIDE = {
  box: { x0: 176, x1: 250, z0: -92, z1: -29 },
  offset: new THREE.Vector3(46, 104, 122),
  fov: 26, range: 70, blur: 9,
};
const inInterior = (p) =>
  p.x > INSIDE.box.x0 && p.x < INSIDE.box.x1 && p.z > INSIDE.box.z0 && p.z < INSIDE.box.z1;
let indoors = false;

// The look-dev framings, still here and still cut between. Every one sits on
// the road or the near verge: with two rows of houses that is the only band a
// lens can stand in without a roof filling the foreground.
const SHOTS = [
  { name: 'the street', target: [-250, 26, 70], offset: [500, 126, 26], fov: 19, range: 300, blur: 12 },
  { name: 'the porch', target: [-74, 24, -10], offset: [132, 62, 88], fov: 22, range: 62, blur: 12 },
  { name: 'under the lamp', target: [-58, 14, 24], offset: [96, 68, 118], fov: 24, range: 60, blur: 12 },
  { name: 'the driveway', target: [12, 18, -6], offset: [104, 92, 150], fov: 22, range: 70, blur: 11 },
  { name: 'across the road', target: [-46, 30, -14], offset: [128, 150, 214], fov: 21, range: 130, blur: 11 },
  { name: 'the far corner', target: [118, 24, 74], offset: [-330, 136, 34], fov: 20, range: 250, blur: 12 },
];
const INTRO_SHOT = { target: [-236, 28, 72], offset: [470, 150, 34], fov: 20, range: 280, blur: 13 };

const FOCUS_TARGET = new THREE.Vector3();
const CAM_OFFSET = new THREE.Vector3();
let shot = 0, mode = 'intro';            // 'intro' | 'follow' | 'shots'

function applySpec(s) {
  FOCUS_TARGET.set(...s.target);
  CAM_OFFSET.set(...s.offset);
  camera.fov = s.fov;
  camera.updateProjectionMatrix();
  post.params.focus = CAM_OFFSET.length();
  post.params.range = s.range;
  post.params.maxBlur = s.blur;
}
function applyShot(i) {
  mode = 'shots';
  shot = (i + SHOTS.length) % SHOTS.length;
  applySpec(SHOTS[shot]);
  hud.shot.textContent = `${shot + 1}/${SHOTS.length}  ${SHOTS[shot].name}`;
  yaw = pitch = wantYaw = wantPitch = 0;
  if (ui) ui.sync();
}
function followMode() {
  mode = 'follow';
  indoors = false;
  CAM_OFFSET.copy(FOLLOW.offset);
  camera.fov = FOLLOW.fov;
  camera.updateProjectionMatrix();
  post.params.focus = CAM_OFFSET.length();
  post.params.range = FOLLOW.range;
  post.params.maxBlur = FOLLOW.blur;
  const p = player.root.position;
  FOCUS_TARGET.set(p.x, p.y + 14, p.z);
  hud.shot.textContent = 'walking';
  if (ui) ui.sync();
}

// A small clamped parallax so the frame is alive without becoming a free orbit
// camera — the fixed framing is the point.
let yaw = 0, pitch = 0, wantYaw = 0, wantPitch = 0, parallaxOn = true;

// ---------------------------------------------------------------- controls
const keys = new Set();
const MOVE_KEYS = {
  w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1],
  a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
};
const WALK = 38, RUN = 62;               // voxels/second — about 3 and 5 m/s
let playerSpeed = 0;

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k in MOVE_KEYS && mode === 'follow') e.preventDefault();
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const FWD = new THREE.Vector3(), RIGHT = new THREE.Vector3(), DIR = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function steerPlayer(dt) {
  let ix = 0, iz = 0;
  for (const k of keys) {
    const m = MOVE_KEYS[k];
    if (m) { ix += m[0]; iz += m[1]; }
  }
  const mag = Math.hypot(ix, iz);
  if (!mag || talk.isOpen()) {
    playerSpeed += (0 - playerSpeed) * Math.min(1, dt * 12);
    player.setMotion(playerSpeed / RUN);
    return;
  }

  // Camera-relative: "forward" is away from the camera, along the ground.
  camera.getWorldDirection(FWD);
  FWD.y = 0; FWD.normalize();
  RIGHT.set(FWD.z, 0, -FWD.x);
  DIR.set(0, 0, 0).addScaledVector(FWD, iz / mag).addScaledVector(RIGHT, -ix / mag).normalize();

  const want = keys.has('shift') ? RUN : WALK;
  playerSpeed += (want - playerSpeed) * Math.min(1, dt * 9);
  player.setMotion(playerSpeed / RUN);

  const step = playerSpeed * dt;
  const pos = player.root.position;
  ground.move(pos, DIR.x * step, DIR.z * step, traffic.blocks);
  pos.x = THREE.MathUtils.clamp(pos.x, BOUNDS.x0 + 8, BOUNDS.x1 - 8);
  pos.z = THREE.MathUtils.clamp(pos.z, BOUNDS.z0 + 8, BOUNDS.z1 - 8);

  // turn toward travel, never snap
  const target = Math.atan2(DIR.x, DIR.z);
  let d = target - player.root.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  player.root.rotation.y += d * Math.min(1, dt * 10);
}

// ---------------------------------------------------------------- talking
const talk = createDialogue();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let nearby = null;

function pickPerson(e) {
  if (!peopleGroup.visible) return null;
  ndc.x = (e.clientX / innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  const who = hit ? hit.object.userData.person : null;
  return who && !who.player ? who : null;
}

// Proximity beats aiming: once you are walking a character around, "stand next
// to someone and press E" is what you expect. Clicking still works in the
// look-dev camera modes, where there is nobody to walk.
function nearestNpc() {
  const p = player.root.position;
  let best = null, bestD = 32;
  for (const n of npcs) {
    const d = Math.hypot(n.root.position.x - p.x, n.root.position.z - p.z);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

addEventListener('pointermove', (e) => {
  if (parallaxOn) {
    const s = mode === 'follow' ? 0.4 : 1;
    wantYaw = ((e.clientX / innerWidth) - 0.5) * 0.085 * s;
    wantPitch = ((e.clientY / innerHeight) - 0.5) * 0.045 * s;
  } else { wantYaw = wantPitch = 0; }
  if (mode === 'follow') return;
  const who = talk.isOpen() ? null : pickPerson(e);
  talk.hover(who && who.name, e.clientX, e.clientY);
  canvas.style.cursor = who ? 'pointer' : '';
});

canvas.addEventListener('pointerdown', (e) => {
  if (intro.isUp()) return;
  if (talk.advance()) return;            // a click while talking advances it
  if (mode === 'follow') { if (nearby) talk.show(nearby.data); return; }
  const who = pickPerson(e);
  if (who) { talk.show(who); talk.hover(null); canvas.style.cursor = ''; }
});

// ---------------------------------------------------------------- hud + ui
const hud = {
  shot: document.getElementById('shot'),
  stats: document.getElementById('stats'),
  help: document.getElementById('help'),
  prompt: document.getElementById('prompt'),
};
hud.stats.textContent = `${block.voxels.toLocaleString()} voxels · ${buildMs}ms`;

let lampBase = 165000;
let toneAmount = 1, spillGain = 1, walkGain = 1;
const SPILL_BASE = rig.spills.map(l => l.intensity);
const BASE_SHADOW = post.params.shadowTint.clone();
const BASE_HIGH = post.params.highTint.clone();

const ui = createUI({
  post, rig, renderer, scene, camera,
  shots: SHOTS.map(s => s.name),
  applyShot, getShot: () => shot,
  lampGain: (v) => { if (v != null) lampBase = v; return lampBase; },
  spillGain: (v) => {
    if (v != null) { spillGain = v; rig.spills.forEach((l, i) => l.intensity = SPILL_BASE[i] * v); }
    return spillGain;
  },
  walkSpeed: (v) => { if (v != null) walkGain = v; return walkGain; },
  people: (v) => { if (v != null) peopleGroup.visible = v; return peopleGroup.visible; },
  traffic: (v) => { if (v != null) traffic.group.visible = v; return traffic.group.visible; },
  torch: (v) => {
    if (v != null && player.lights[0]) player.lights[0].visible = v;
    return player.lights[0] ? player.lights[0].visible : false;
  },
  follow: (v) => { if (v != null) (v ? followMode() : applyShot(shot)); return mode === 'follow'; },
  parallax: (v) => { if (v != null) { parallaxOn = v; if (!v) wantYaw = wantPitch = 0; } return parallaxOn; },
  tone: (v) => {
    if (v != null) {
      toneAmount = v;
      post.params.shadowTint.setRGB(1 + (BASE_SHADOW.r - 1) * v, 1 + (BASE_SHADOW.g - 1) * v, 1 + (BASE_SHADOW.b - 1) * v);
      post.params.highTint.setRGB(1 + (BASE_HIGH.r - 1) * v, 1 + (BASE_HIGH.g - 1) * v, 1 + (BASE_HIGH.b - 1) * v);
    }
    return toneAmount;
  },
});

addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); ui.toggle(); return; }
  if (intro.isUp()) return;
  if (e.key === 'Escape') { talk.hide(); return; }
  const k = e.key.toLowerCase();
  if (k === 'e' && mode === 'follow') {
    if (talk.isOpen()) talk.advance();
    else if (nearby) talk.show(nearby.data);
    return;
  }
  if (k === 'c') { mode === 'follow' ? applyShot(shot) : followMode(); return; }
  if (mode === 'follow') {
    if (k === ' ') e.preventDefault();
  } else {
    if (k === 'arrowright' || k === ' ') { applyShot(shot + 1); e.preventDefault(); }
    if (k === 'arrowleft') applyShot(shot - 1);
    if (k >= '1' && k <= String(SHOTS.length)) applyShot(+k - 1);
  }
  if (k === 'p') { post.params.enabled = !post.params.enabled; ui.sync(); }
  if (k === 'h') hud.help.classList.toggle('hidden');
  if (k === 'f') { post.params.focus += e.shiftKey ? -14 : 14; ui.sync(); }
});

// A ResizeObserver, not a window resize listener: in an embedded preview pane
// the surface can change size without the window ever firing resize, which
// leaves the GL viewport stranded at the old size in a corner of the canvas.
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

// ---------------------------------------------------------------- intro
// createUI's restore pass can flip the camera mode before we get here, so
// the intro re-asserts it rather than assuming it is still the initial value.
mode = 'intro';
applySpec(INTRO_SHOT);
hud.shot.textContent = '';
document.body.classList.add('intro-up');
const intro = createIntro(() => {
  document.body.classList.remove('intro-up');
  followMode();
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let time = 0, frames = 0;
const AIM = new THREE.Vector3();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  time += dt;
  renderer.shadowMap.needsUpdate = (frames++ % SHADOW_EVERY) === 0;

  if (mode === 'follow') {
    steerPlayer(dt * walkGain);
    const p = player.root.position;
    const nowIn = inInterior(p);
    if (nowIn !== indoors) {                 // a CUT, not a move
      indoors = nowIn;
      if (indoors) {
        CAM_OFFSET.copy(INSIDE.offset);
        camera.fov = INSIDE.fov;
        post.params.range = INSIDE.range;
        post.params.maxBlur = INSIDE.blur;
        FOCUS_TARGET.set(p.x, p.y + 12, p.z);
      } else {
        CAM_OFFSET.copy(FOLLOW.offset);
        camera.fov = FOLLOW.fov;
        post.params.range = FOLLOW.range;
        post.params.maxBlur = FOLLOW.blur;
        FOCUS_TARGET.set(p.x, p.y + 14, p.z);
      }
      camera.updateProjectionMatrix();
      post.params.focus = CAM_OFFSET.length();
      // roof, fascia, awning and shopfront come away so the camera can see in.
      // The alternative is a camera INSIDE a 75-voxel room, which means a wide
      // lens, which is the one thing this look cannot afford.
      if (block.shopLid) block.shopLid.visible = !indoors;
      hud.shot.textContent = indoors ? 'marlows' : 'walking';
    }
    AIM.set(p.x, p.y + (indoors ? 12 : 14), p.z);
    FOCUS_TARGET.lerp(AIM, Math.min(1, dt * (indoors ? 5 : 3.6)));
    if (!talk.isOpen()) nearby = nearestNpc();
    hud.prompt.textContent = nearby && !talk.isOpen() ? `E — talk to ${nearby.data.name}` : '';
  } else {
    player.setMotion(0);
    nearby = null;
    hud.prompt.textContent = '';
  }

  yaw += (wantYaw - yaw) * Math.min(1, dt * 3);
  pitch += (wantPitch - pitch) * Math.min(1, dt * 3);
  const spin = mode === 'intro' ? Math.sin(time * 0.06) * 0.13 : 0;
  const off = CAM_OFFSET.clone().applyAxisAngle(UP, yaw + spin);
  off.y += pitch * -90;
  camera.position.copy(FOCUS_TARGET).add(off);
  camera.lookAt(FOCUS_TARGET);
  sky.position.copy(camera.position);

  const f = tvFlicker(time);
  if (block.tvMaterial) block.tvMaterial.color.setRGB(0.22 * f, 0.42 * f, 0.86 * f);
  if (rig.tvLight) rig.tvLight.intensity = 4000 + 9000 * f;
  // sodium lamps hum and drift; a dead-steady one reads as a game light. Each
  // pole gets its own phase so the street does not pulse in unison.
  rig.lamps.forEach((l, i) => {
    const ph = i * 1.7;
    l.intensity = (i ? lampBase * 0.73 : lampBase) *
      (0.97 + Math.sin(time * 6.1 + ph) * 0.02 + Math.sin(time * 23.0 + ph) * 0.01);
  });
  for (const c of rig.cones) c.material.uniforms.uTime.value = time;
  if (rig.moths && rig.moths.points.visible) rig.moths.update(time);

  traffic.update(dt);
  if (peopleGroup.visible) {
    for (const p of folk) p.update(time, dt);
    biscuit.update(time, dt);
  }

  post.render(scene, camera, time);
  requestAnimationFrame(frame);
}
frame();

// Render watchdog: a preview panel that loses RAF goes black with no error.
setInterval(() => {
  if (document.hidden) return;
  renderer.shadowMap.needsUpdate = true;
  post.render(scene, camera, time);
}, 1000);

window.ECHO = {
  scene, camera, renderer, post, rig, block, ui, talk, folk, player, npcs,
  traffic, ground, pickables,
  shot: (i) => applyShot(i),
  shots: SHOTS.map(s => s.name),
  SHOTS,
  follow: () => followMode(),
  getMode: () => mode,
  indoors: () => indoors,
  INSIDE,
  // Places the camera without waiting on a frame — the RAF loop is what
  // normally moves it, and it is paused whenever the tab is hidden.
  poseCamera: () => {
    camera.position.copy(FOCUS_TARGET).add(CAM_OFFSET);
    camera.lookAt(FOCUS_TARGET);
    camera.updateMatrixWorld(true);
  },
  teleport: (x, z) => {
    player.root.position.set(x, Math.max(0, ground.ceilingAt(x, z)), z);
    FOCUS_TARGET.set(x, player.root.position.y + 14, z);
  },
  // Drives the player for a fixed span with no RAF, for headless movement and
  // collision checks — the loop is paused whenever the tab is hidden.
  step: (keysDown, seconds, dt = 1 / 60) => {
    // Movement is camera-relative, and the camera only moves inside the RAF
    // loop — so a headless step has to place it first or every direction is
    // measured against wherever the camera happened to be left.
    camera.position.copy(FOCUS_TARGET).add(CAM_OFFSET);
    camera.lookAt(FOCUS_TARGET);
    camera.updateMatrixWorld(true);
    const before = player.root.position.clone();
    keys.clear();
    for (const k of keysDown) keys.add(k);
    for (let t = 0; t < seconds; t += dt) steerPlayer(dt);
    keys.clear();
    return { from: before.toArray().map(Math.round), to: player.root.position.toArray().map(Math.round) };
  },
  skipIntro: () => intro.dismiss(),
  voxels: block.voxels,
  buildMs,
  ready: true,
};
document.body.classList.add('booted');
