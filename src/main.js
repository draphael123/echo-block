// ECHO BLOCK — a look-dev diorama. One suburban block, at night, in voxels.
// No mechanics, no player. Its only job is to answer whether this reads like
// the reference; everything that decides that is a knob in the settings panel.
import * as THREE from 'three';
import { buildBlock } from './block.js';
import { buildSky, buildLights, tvFlicker } from './lights.js';
import { buildPerson, buildDog, CAST } from './people.js';
import { Post } from './post.js';
import { createUI, createIntro, createDialogue } from './ui.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The block is static and only the people move, so re-rendering 3.6M triangles
// into the shadow maps every frame buys almost nothing. Refresh them on a
// slower clock instead — a walking figure's shadow lagging by a few frames is
// invisible, and this is the single biggest saving in the frame.
renderer.shadowMap.autoUpdate = false;
const SHADOW_EVERY = 4;
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

// ---------------------------------------------------------------- people
const peopleGroup = new THREE.Group();
peopleGroup.name = 'people';
scene.add(peopleGroup);
const folk = CAST.map(spec => buildPerson(spec));
const biscuit = buildDog({ pos: [58, 2, 40], path: [[58, 40], [-172, 40]], speed: 1 });
for (const p of folk) peopleGroup.add(p.root);
peopleGroup.add(biscuit.root);
const pickables = folk.map(p => p.pick);
const buildMs = Math.round(performance.now() - t0);

// ---------------------------------------------------------------- camera
// A long lens on a fixed 3/4 is the single biggest lever in the whole look.
// A normal 55-60 degree follow camera makes the same geometry read as a
// generic voxel game no matter what the lighting is doing.
const camera = new THREE.PerspectiveCamera(22, innerWidth / innerHeight, 20, 1600);
const post = new Post(renderer, innerWidth, innerHeight);

// Framings worth comparing. The camera CUTS between them, it never flies —
// cutting is part of the reference's grammar.
// Every camera here sits ON THE ROAD or on the near verge. With houses down
// both sides that is the only band the lens can stand in without a roof in
// the foreground, and it is also where the reference puts its camera.
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
let shot = 0;

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
  shot = (i + SHOTS.length) % SHOTS.length;
  applySpec(SHOTS[shot]);
  hud.shot.textContent = `${shot + 1}/${SHOTS.length}  ${SHOTS[shot].name}`;
  yaw = pitch = wantYaw = wantPitch = 0;
  if (ui) ui.sync();
}

// A small clamped parallax so the frame is alive without becoming a free orbit
// camera — the fixed framing is the point.
let yaw = 0, pitch = 0, wantYaw = 0, wantPitch = 0, parallaxOn = true;

// ---------------------------------------------------------------- talking
const talk = createDialogue();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovered = null;

function pickPerson(e) {
  if (!peopleGroup.visible) return null;
  ndc.x = (e.clientX / innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData.person : null;
}

addEventListener('pointermove', (e) => {
  if (parallaxOn) {
    wantYaw = ((e.clientX / innerWidth) - 0.5) * 0.085;
    wantPitch = ((e.clientY / innerHeight) - 0.5) * 0.045;
  } else { wantYaw = wantPitch = 0; }
  hovered = talk.isOpen() ? null : pickPerson(e);
  talk.hover(hovered && hovered.name, e.clientX, e.clientY);
  canvas.style.cursor = hovered ? 'pointer' : '';
});

canvas.addEventListener('pointerdown', (e) => {
  if (intro.isUp()) return;
  if (talk.advance()) return;            // a click while talking advances it
  const who = pickPerson(e);
  if (who) { talk.show(who); talk.hover(null); canvas.style.cursor = ''; }
});

// ---------------------------------------------------------------- hud + ui
const hud = {
  shot: document.getElementById('shot'),
  stats: document.getElementById('stats'),
  help: document.getElementById('help'),
};
hud.stats.textContent = `${block.voxels.toLocaleString()} voxels · ${buildMs}ms`;

// The lamp's intensity is rewritten every frame by the hum, so the panel has
// to drive a BASE value rather than the light itself.
let lampBase = 165000;
let toneAmount = 1, spillGain = 1;
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
  people: (v) => { if (v != null) peopleGroup.visible = v; return peopleGroup.visible; },
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
  if (k === 'arrowright' || k === ' ') { applyShot(shot + 1); e.preventDefault(); }
  if (k === 'arrowleft') applyShot(shot - 1);
  if (k >= '1' && k <= String(SHOTS.length)) applyShot(+k - 1);
  if (k === 'p') { post.params.enabled = !post.params.enabled; ui.sync(); }
  if (k === 'h') hud.help.classList.toggle('hidden');
  if (k === 'f') { post.params.focus += e.shiftKey ? -14 : 14; ui.sync(); }
  if (k === 'e') { post.params.exposure = Math.max(0.2, post.params.exposure + (e.shiftKey ? -0.08 : 0.08)); ui.sync(); }
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
let introMode = true;
applySpec(INTRO_SHOT);
hud.shot.textContent = '';
document.body.classList.add('intro-up');
const intro = createIntro(() => {
  introMode = false;
  document.body.classList.remove('intro-up');
  applyShot(0);
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let time = 0, frames = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  time += dt;
  renderer.shadowMap.needsUpdate = (frames++ % SHADOW_EVERY) === 0;

  yaw += (wantYaw - yaw) * Math.min(1, dt * 3);
  pitch += (wantPitch - pitch) * Math.min(1, dt * 3);
  // during the title card the camera drifts on its own, slowly
  const spin = introMode ? Math.sin(time * 0.06) * 0.13 : 0;
  const off = CAM_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw + spin);
  off.y += pitch * -90;
  camera.position.copy(FOCUS_TARGET).add(off);
  camera.lookAt(FOCUS_TARGET);
  sky.position.copy(camera.position);

  const f = tvFlicker(time);
  if (block.tvMaterial) block.tvMaterial.color.setRGB(0.22 * f, 0.42 * f, 0.86 * f);
  if (rig.tvLight) rig.tvLight.intensity = 4000 + 9000 * f;
  // sodium lamps hum and drift; a dead-steady one reads as a game light.
  // Each pole is given its own phase, so the street does not pulse in unison.
  rig.lamps.forEach((l, i) => {
    const p = i * 1.7;
    l.intensity = (i ? lampBase * 0.73 : lampBase) *
      (0.97 + Math.sin(time * 6.1 + p) * 0.02 + Math.sin(time * 23.0 + p) * 0.01);
  });
  for (const c of rig.cones) c.material.uniforms.uTime.value = time;
  if (rig.moths && rig.moths.points.visible) rig.moths.update(time);
  if (peopleGroup.visible) {
    for (const p of folk) p.update(time);
    biscuit.update(time);
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
  scene, camera, renderer, post, rig, block, ui, talk, folk, pickables,
  shot: (i) => applyShot(i),
  shots: SHOTS.map(s => s.name),
  SHOTS,
  // Places the camera without waiting on a frame — the RAF loop is what
  // normally moves it, and it is paused whenever the tab is hidden.
  poseCamera: () => {
    camera.position.copy(FOCUS_TARGET).add(CAM_OFFSET);
    camera.lookAt(FOCUS_TARGET);
    camera.updateMatrixWorld(true);
  },
  skipIntro: () => intro.dismiss(),
  voxels: block.voxels,
  buildMs,
  ready: true,
};
document.body.classList.add('booted');
