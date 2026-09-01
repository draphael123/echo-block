// ECHO BLOCK — a voxel street at night, and a kid with a flashlight walking
// down it. The look came first and still runs the place: everything that
// decides it is a knob in the settings drawer.
import * as THREE from '../vendor/three/three.module.js';
import { buildBlock, BOUNDS, ROAD } from './block.js';
import { buildSky, buildLights, tvFlicker } from './lights.js';
import { buildPerson, buildDog, CAST, INDOOR_CAST, MECHANIC, LOOKS } from './people.js';
import { mountGarage } from './garage-ui.js';
import { mountTrackSelect } from './track-select.js';
import { mountLooks } from './looks-ui.js';
import * as Garage from './race/garage.js';
import { PALETTE } from './palette.js';
import { buildTraffic } from './traffic.js';
import { Ground } from './walk.js';
import { Post } from './post.js';
import { createUI, createIntro, createDialogue } from './ui.js';
import { buildLeaves, buildSmoke, buildCat, neonFlicker } from './fx.js';
import { createRound } from './round.js';
import { createMusic } from './music.js';

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
// The save loads before the block is built: the player's PARKED CAR is voxels
// in the block (its paint comes out of here), and their clothes come out of
// here too when the cast is built further down.
const savefile = Garage.load();
const block = buildBlock(savefile);
scene.add(block.group);

// The hub's side of the radio: the mellow half of the same synth machine
// (src/music.js), started on the first gesture the browser will allow audio
// for — which is the WALK THE BLOCK click at the latest.
const music = createMusic();
const startMusic = () => {
  music.start('menu');
  removeEventListener('pointerdown', startMusic);
  removeEventListener('keydown', startMusic);
};
addEventListener('pointerdown', startMusic);
addEventListener('keydown', startMusic);
const rig = buildLights(scene, block.anchors);
const ground = new Ground(block.field);
const traffic = buildTraffic(scene);

// ------------------------------------------------------------------ fx
const weather = new THREE.Group();
weather.name = 'weather';
scene.add(weather);
const leaves = buildLeaves(150, { x0: -400, x1: 380, z0: -120, z1: 266 });
const smoke = buildSmoke(block.anchors.chimneys.slice(0, 2));
const cat = buildCat([28, -28], [28, 20], 2);
weather.add(leaves.points, smoke.points, cat.root);
const round = createRound(block.anchors, scene);


// ---------------------------------------------------------------- people
const peopleGroup = new THREE.Group();
peopleGroup.name = 'people';
scene.add(peopleGroup);

// Shop staff take their positions from the shop's own anchors rather than
// being written down a second time — the parade has moved three times now.
const indoorSpecs = INDOOR_CAST
  .filter(s => block.anchors[s.key])
  .map(s => ({ ...s, pos: block.anchors[s.key] }));
// Whatever you were last wearing. Read from the save rather than from a key of
// its own, so a wiped game gives you the intro again.
const savedLook = savefile.look;
const folk = [...CAST, ...indoorSpecs, MECHANIC]
  .map(spec => buildPerson(spec.player && savedLook ? { ...spec, ...savedLook } : spec));
let player = folk.find(p => p.data.player);
let npcs = folk.filter(p => p !== player);
const biscuit = buildDog({ pos: [58, 2, 40], path: [[58, 40], [-172, 40]], speed: 1 });
for (const p of folk) peopleGroup.add(p.root);
peopleGroup.add(biscuit.root);
let pickables = folk.map(p => p.pick);

// A ring on the ground under the player, drawn with depth testing OFF.
// On a fixed 3/4 camera you WILL end up behind a tree or a parked car, and
// without this the honest answer to 'where am I' is 'somewhere behind that
// canopy'. It also does the job the reference's shadows do — it tells you
// which bit of ground you are actually standing on.
const markMat = new THREE.MeshBasicMaterial({
  color: 0xffc98a, transparent: true, opacity: 0.30, depthTest: false,
  depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
});
const mark = new THREE.Mesh(new THREE.RingGeometry(5.4, 7.4, 28), markMat);
mark.rotation.x = -Math.PI / 2;
mark.renderOrder = 900;
mark.frustumCulled = false;
scene.add(mark);
const buildMs = Math.round(performance.now() - t0);

// Drop everyone onto the collision field rather than trusting the y in their
// spec — the lawns, the pavement and the road are not at the same height.
for (const p of folk)
  p.root.position.y = Math.max(0, ground.ceilingAt(p.root.position.x, p.root.position.z));

// Rebuilding beats mutating: the body is meshed from voxels, so a different
// hair colour is a different mesh. It is cheap enough (a dozen tiny worlds)
// to just throw the old one away every time a swatch is clicked.
const look = { ...player.data };
function rebuildPlayer(patch) {
  Object.assign(look, patch);
  // One save owns this now, along with the money and the lap times. It used to
  // be its own localStorage key written by this function alone, which is why
  // there was no way to clear a game or to change your mind later.
  savefile.look = { ...(savefile.look || {}), ...patch };
  Garage.save(savefile);
  const keep = player.root.position.clone(), face = player.root.rotation.y;
  peopleGroup.remove(player.root);
  player.root.traverse(o => {
    if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
  });
  const next = buildPerson({ ...look, pos: keep.toArray(), face });
  peopleGroup.add(next.root);
  const i = folk.indexOf(player);
  folk[i] = next;
  player = next;
  npcs = folk.filter(p => p !== player);
  pickables = folk.map(p => p.pick);
  return next;
}

// ---------------------------------------------------------------- camera
// A long lens on a fixed 3/4 is the single biggest lever in the whole look. A
// normal 55-60 degree follow camera makes the same geometry read as a generic
// voxel game no matter what the lighting is doing — so even while following
// the player the lens stays long and the angle stays put. It trails; it never
// orbits.
const camera = new THREE.PerspectiveCamera(22, innerWidth / innerHeight, 20, 1600);
const post = new Post(renderer, innerWidth, innerHeight);

const FOLLOW = { offset: new THREE.Vector3(88, 172, 168), fov: 23, range: 120, blur: 11 };
// Zoom scales the offset rather than the lens: pulling back on a long lens
// keeps the compression that makes the street read as a diorama, where
// widening the FOV would throw it away at exactly the moment you want more
// of the world in frame.
let zoom = 1;
const ZOOM_MIN = 0.55, ZOOM_MAX = 2.1;

// Interiors get their own fixed camera, which is how the reference does rooms
// and also the only thing that works: a trailing camera outside the building
// is looking at the back of a brick wall the moment you step through the door.
// Inside, the camera stops following and the player moves within the frame.
const INSIDE = {
  box: { x0: 178, x1: 424, z0: -136, z1: -29 },
  offset: new THREE.Vector3(58, 132, 152),
  fov: 25, range: 90, blur: 9,
};
const inInterior = (p) =>
  p.x > INSIDE.box.x0 && p.x < INSIDE.box.x1 && p.z > INSIDE.box.z0 && p.z < INSIDE.box.z1;
let indoors = false;

// With houses down BOTH sides, a camera at a fixed +Z offset ends up behind
// the near row the moment the player crosses the road. So the camera always
// stands in the road and looks at whichever side the player is on — it flips
// as a CUT, with a dead band across the carriageway so it cannot chatter
// while you are standing on the centre line.
const ROAD_MID = (ROAD.z0 + ROAD.z1) / 2;
let camSide = 1;
function sideFor(z) {
  if (z > ROAD_MID + 26) return -1;
  if (z < ROAD_MID - 26) return 1;
  return camSide;
}

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
// The intro frames the KID, because you are choosing what they look like.
// It still drifts, so the street goes past behind them.
const INTRO_SHOT = { target: [-44, 17, 26], offset: [58, 54, 96], fov: 25, range: 62, blur: 10 };

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
function applyZoom() {
  if (mode !== 'follow') return;
  const base = indoors ? INSIDE.offset : FOLLOW.offset;
  CAM_OFFSET.copy(base).multiplyScalar(zoom);
  if (!indoors) CAM_OFFSET.setZ(base.z * zoom * camSide);
  post.params.focus = CAM_OFFSET.length();
}

function followMode() {
  mode = 'follow';
  indoors = false;
  CAM_OFFSET.copy(FOLLOW.offset).multiplyScalar(zoom);
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
let playerSpeed = 0, shake = 0;

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k in MOVE_KEYS && mode === 'follow') e.preventDefault();
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('wheel', (e) => {
  if (ui && ui.isOpen()) return;
  zoom = THREE.MathUtils.clamp(zoom * (1 + Math.sign(e.deltaY) * 0.09), ZOOM_MIN, ZOOM_MAX);
  applyZoom();
  if (ui) ui.sync();
}, { passive: true });
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
  if (!mag || talk.isOpen() || player.downed) {
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
  ground.move(pos, DIR.x * step, DIR.z * step);
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

// One key does both jobs. A person in front of you wins over a mailbox,
// because otherwise standing near Sam and his own postbox is ambiguous.
let nearBox = null;
// The garage counter, shared with the circuit. Talking to Verity opens it,
// which is the whole reason the hub exists: the money you win out there is
// spent in here.
const garage = mountGarage({ save: savefile, closeHint: 'ESC or E to close' });

// RIDE OUT asks where. It used to just leave, and the circuit you got was
// whatever was last written to localStorage by a menu you had to find first.
// The wardrobe, on foot. K anywhere in the hub.
const wardrobe = mountLooks({
  save: savefile,
  current: () => look,
  onPick: (key, v) => rebuildPlayer({ [key]: v }),
  closeHint: 'K or ESC to close',
});

const picker = mountTrackSelect({
  save: savefile,
  onGo: () => { location.href = './race.html'; },
});
document.getElementById('rideout').addEventListener('click', (e) => {
  e.preventDefault();
  picker.show();
});

function interact() {
  if (garage.isOpen()) { garage.close(); return; }
  if (talk.isOpen()) { talk.advance(); return; }
  if (nearby && nearby.data.garage) { talk.hide(); garage.open(); return; }
  if (nearby) {
    const custom = round.linesFor(nearby.data.name);
    const startsRound = custom && round.state === 'idle';
    talk.show(nearby.data, custom, startsRound ? () => round.start() : null);
    return;
  }
  if (nearBox) round.deliver(nearBox);
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
  if (mode === 'follow') { interact(); return; }
  const who = pickPerson(e);
  if (who) { talk.show(who); talk.hover(null); canvas.style.cursor = ''; }
});

// ---------------------------------------------------------------- hud + ui
const hud = {
  shot: document.getElementById('shot'),
  stats: document.getElementById('stats'),
  help: document.getElementById('help'),
  prompt: document.getElementById('prompt'),
  quest: document.getElementById('quest'),
};
hud.stats.textContent = `${block.voxels.toLocaleString()} voxels · ${buildMs}ms`;

// Dusk to late, on one slider. 1.0 is the look everything was tuned at, so
// the shipped frame is unchanged and this only ever adds somewhere to go.
const SKY_U = sky.material.uniforms;
const DUSK = {
  hemi: 1.55, moon: 3.1, fog: 0.00072,
  top: [0.10, 0.13, 0.24], horizon: [0.30, 0.21, 0.24], haze: [0.36, 0.20, 0.11],
};
const LATE = {
  hemi: 0.80, moon: 2.1, fog: 0.00105,
  top: [SKY_U.uTop.value.x, SKY_U.uTop.value.y, SKY_U.uTop.value.z],
  horizon: [SKY_U.uHorizon.value.x, SKY_U.uHorizon.value.y, SKY_U.uHorizon.value.z],
  haze: [SKY_U.uHaze.value.x, SKY_U.uHaze.value.y, SKY_U.uHaze.value.z],
};
let nightAmount = 1;
function setNightfall(v) {
  nightAmount = v;
  const mix = (a, b) => a + (b - a) * v;
  rig.hemi.intensity = mix(DUSK.hemi, LATE.hemi);
  rig.moon.intensity = mix(DUSK.moon, LATE.moon);
  scene.fog.density = mix(DUSK.fog, LATE.fog);
  for (const [k, u] of [['top', SKY_U.uTop], ['horizon', SKY_U.uHorizon], ['haze', SKY_U.uHaze]])
    u.value.set(mix(DUSK[k][0], LATE[k][0]), mix(DUSK[k][1], LATE[k][1]), mix(DUSK[k][2], LATE[k][2]));
}

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
  zoom: (v) => { if (v != null) { zoom = v; applyZoom(); } return zoom; },
  nightfall: (v) => { if (v != null) setNightfall(v); return nightAmount; },
  weather: (v) => { if (v != null) weather.visible = v; return weather.visible; },
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
  if (e.key === 'Escape') { picker.hide(); garage.close(); wardrobe.close(); talk.hide(); return; }
  const k = e.key.toLowerCase();
  if (k === 'k' && mode === 'follow') { wardrobe.toggle(); return; }
  if (k === 'e' && mode === 'follow') { interact(); return; }
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
const SWATCH = (key, v) => {
  if (v == null) return 'repeating-linear-gradient(45deg,#2b3242 0 4px,#1b2130 4px 8px)';
  const c = PALETTE[v];
  if (!c) return '#333';
  // the palette is linear; sRGB-encode it so a swatch matches the voxel
  const to8 = (x) => Math.round(Math.pow(Math.min(1, Math.max(0, x)), 1 / 2.2) * 255);
  return `rgb(${to8(c.rgb[0])},${to8(c.rgb[1])},${to8(c.rgb[2])})`;
};
const intro = createIntro(() => {
  document.body.classList.remove('intro-up');
  followMode();
}, {
  looks: true,
  rows: [
    ['skin', 'skin', LOOKS.skin],
    ['hair', 'hair', LOOKS.hair],
    ['hairStyle', 'cut', LOOKS.hairStyle],
    ['shirt', 'shirt', LOOKS.shirt],
    ['trouser', 'trousers', LOOKS.trouser],
    ['cap', 'cap', LOOKS.cap],
  ],
  colourOf: (key, v) => (key === 'hairStyle'
    ? { fringe: '#5d4636', plain: '#46372a', long: '#2f2620' }[v] || '#333'
    : SWATCH(key, v)),
  current: (key) => look[key],
  onPick: (key, v) => rebuildPlayer({ [key]: v }),
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

    // Hit by a car. The road is the only thing on this street that can hurt
    // you, which is most of why it is worth crossing.
    if (!player.downed) {
      const car = traffic.hits(p.x, p.z);
      if (car) {
        const dz = Math.sign(p.z - car.root.position.z) || 1;
        player.knock(car.lane.dir * 0.85, dz * 0.5, 58);
        talk.hide();
        shake = 1;
        hud.prompt.textContent = '';
      }
    }
    const nowIn = inInterior(p);
    if (nowIn !== indoors) {                 // a CUT, not a move
      indoors = nowIn;
      if (indoors) {
        camSide = 1;
        CAM_OFFSET.copy(INSIDE.offset).multiplyScalar(zoom);
        camera.fov = INSIDE.fov;
        post.params.range = INSIDE.range;
        post.params.maxBlur = INSIDE.blur;
        FOCUS_TARGET.set(p.x, p.y + 12, p.z);
      } else {
        CAM_OFFSET.copy(FOLLOW.offset).multiplyScalar(zoom).setZ(FOLLOW.offset.z * zoom * camSide);
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
      hud.shot.textContent = indoors ? (p.x < 328 ? 'marlows' : 'the laundromat') : 'walking';
    }
    if (!indoors) {
      const want = sideFor(p.z);
      if (want !== camSide) {
        camSide = want;
        applyZoom();
      }
    }
    AIM.set(p.x, p.y + (indoors ? 12 : 14), p.z);
    FOCUS_TARGET.lerp(AIM, Math.min(1, dt * (indoors ? 5 : 3.6)));
    if (!talk.isOpen() && !player.downed) {
      // Whichever is CLOSER wins. Person-always-wins meant a neighbour
      // standing beside a postbox made that postbox unreachable.
      const n = nearestNpc(), b = round.nearest(p);
      const dn = n ? Math.hypot(n.root.position.x - p.x, n.root.position.z - p.z) : Infinity;
      const db = b ? Math.hypot(b.pos[0] - p.x, b.pos[2] - p.z) : Infinity;
      nearby = db < dn ? null : n;
      nearBox = db < dn ? b : null;
    }
    hud.prompt.textContent = talk.isOpen() ? ''
      : nearby ? `E — talk to ${nearby.data.name}`
      : nearBox ? 'E — put a paper in the box' : '';
    hud.quest.textContent = round.hud();
  } else {
    player.setMotion(0);
    nearby = nearBox = null;
    hud.prompt.textContent = '';
  }

  shake = Math.max(0, shake - dt * 1.7);
  yaw += (wantYaw - yaw) * Math.min(1, dt * 3);
  pitch += (wantPitch - pitch) * Math.min(1, dt * 3);
  const spin = mode === 'intro' ? Math.sin(time * 0.06) * 0.13 : 0;
  const off = CAM_OFFSET.clone().applyAxisAngle(UP, yaw + spin);
  off.y += pitch * -90;
  camera.position.copy(FOCUS_TARGET).add(off);
  if (shake > 0) {
    const s = shake * shake * 7;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
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
  if (weather.visible) { leaves.update(time, dt); smoke.update(time, dt); cat.update(time, dt); }
  if (block.neonMaterial) {
    const n = neonFlicker(time);
    block.neonMaterial.color.setRGB(1.0 * n, 0.42 * n, 0.54 * n);
    if (rig.signs[0]) rig.signs[0].intensity = 5000 * n;
  }
  if (peopleGroup.visible) {
    for (const p of folk) p.update(time, dt, ground);
    biscuit.update(time, dt);
  }

  const pp = player.root.position;
  mark.position.set(pp.x, pp.y + 0.6, pp.z);
  mark.visible = mode === 'follow' && peopleGroup.visible;
  markMat.opacity = 0.22 + Math.sin(time * 2.2) * 0.05;

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
  traffic, ground, pickables, round, leaves, smoke, cat, mark,
  zoom: (v) => { if (v != null) { zoom = THREE.MathUtils.clamp(v, ZOOM_MIN, ZOOM_MAX); applyZoom(); } return zoom; },
  knock: () => player.knock(1, 0.4, 58),
  nightfall: (v) => { if (v != null) setNightfall(v); return nightAmount; },
  shot: (i) => applyShot(i),
  shots: SHOTS.map(s => s.name),
  SHOTS,
  follow: () => followMode(),
  getMode: () => mode,
  camSide: () => camSide,
  indoors: () => indoors,
  INSIDE,
  // Places the camera without waiting on a frame — the RAF loop is what
  // normally moves it, and it is paused whenever the tab is hidden.
  poseCamera: () => {
    camera.position.copy(FOCUS_TARGET).add(CAM_OFFSET);
    camera.lookAt(FOCUS_TARGET);
    camera.updateMatrixWorld(true);
  },
  look,
  rebuildPlayer,
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
