// The car.
//
// A bike does not read at this voxel size. One voxel is 8cm, so a BMX wheel is
// six voxels across and the frame is a set of one-voxel tubes — voxels are good
// at solid masses with panels and glass and lights, and bad at thin tubes. The
// parked wagon in the hub reads as a car instantly; the bike read as a smudge
// with a lamp on it. That is the whole argument, and it only became obvious
// after building the bike.
//
// Handling is arcade and grippy, as chosen: it goes where you point it, and the
// skill is in line and braking rather than in catching slides. The one thing it
// will not let you do is take a corner flat out — top speed needs a 505-voxel
// radius and the track's corners are 380, so every corner is a braking
// decision.
import * as THREE from 'three';
import { VoxWorld, meshWorld } from '../voxel.js';
import { PALETTE } from '../palette.js';

export const V_MAX = 278;              // voxels/second ~ 80 km/h at 8cm/voxel
// BRAKE was 330 — 2.6g, which no car does and which quietly made the whole
// night-driving idea pointless: with brakes that strong you can always stop
// inside your headlights, so how far you can see never costs you anything.
// 130 is about 1.05g, and it sets the relationship the track is built on:
// AT TOP SPEED YOUR STOPPING DISTANCE IS YOUR BEAM. 278 v/s at 130 v/s^2 needs
// 297 voxels; the beam reaches 280. On a lit street you are reading the road by
// streetlight and it does not bind. Unlit, it does.
const ACCEL = 74, BRAKE = 130, DRAG = 22;
const TURN_SLOW = 1.9, TURN_FAST = 0.55;

// ------------------------------------------------------------------- drift
// Until now the car had no slip angle at all: heading WAS the direction of
// travel, which is why it felt like it was on rails. A drift is the two coming
// apart — the nose leads, the car keeps going roughly where it was pointed a
// moment ago, and you steer with the gap between them.
//
// It is a cost, not a shortcut. You get much more yaw authority and you scrub
// speed the whole time, so it is for tightening a corner you got wrong, not for
// going faster than the grippy line. That keeps the braking-vs-sight mechanic
// intact rather than handing the player a way round it.
const MAX_SLIP = 0.62;                 // radians the nose can lead by
const DRIFT_TURN = 1.85;               // yaw authority multiplier with it held
const DRIFT_SCRUB = 165;               // speed bled per second at full slip
const SLIP_ON = 5.0, SLIP_OFF = 3.2;   // how fast the angle builds and recovers
const CAR_PROBE = 2.6;                 // ~18 voxels across, against a 26-wide car

// A voxel at height y fills the cell from y to y+1, so a floor voxel's top
// face is at y+1. The tyre is a disc of radius 7 centred at local 6: its lowest
// FULL row is local 0, with a single voxel poking to -1. Sitting the body at
// floor+2 therefore left the tyres hanging a voxel clear with only that one
// voxel reaching down — which is precisely what "the car floats" looks like.
const RIDE = 1;

// What the car will climb, and it is deliberately generous now.
//
// At 10 it flattened cones and mounted kerbs, and a barrier (12), a parked car
// (14) or a skip (15) stopped it dead — which is defensible on paper and is the
// single thing that has gone wrong most often in play. Being unable to move is
// never interesting. At 18 everything that lives ON the road is climbable and
// the cost is SPEED, which is the rule the whole rest of the handling follows;
// walls, retaining banks and buildings are all far taller and still stop you.
const CAR_STEP = 18;
// what mounting something costs, per voxel of the step you just climbed
const CLIMB_COST = 0.055;

// OFF THE TARMAC.
//
// A wall stopping you is an impact; grass slowing you is a SURFACE, and they
// are different things. Without this the verge and the footway had exactly the
// same grip as the road, so the only cost of cutting a corner across somebody's
// front garden was whatever you happened to hit on the way — which made the
// wide road decorative. Drag you cannot power out of, and less of the engine.
// 165 took 240 down to 39 in a second and a half, which is not grass, it is a
// ploughed field. Grass should cost you the corner, not the lap.
const OFF_DRAG = 95, OFF_ACCEL = 0.55, OFF_TURN = 0.78;

// Rain, as a number the physics can read. It is deliberately ONE multiplier on
// grip and one on braking rather than a separate wet handling model: the point
// is that a wet lap asks the same questions as a dry one and gives you less to
// answer them with -- and it lands squarely on the mechanic the circuit is
// built around, because you also cannot see as far.
const WET_GRIP = 0.80, WET_BRAKE = 0.72, WET_BEAM = 0.82;

// REVERSE.
//
// There was none, and its absence had been quietly shaping the design: nosing
// into a skip at walking pace was unrecoverable, so there was a stuck-watchdog
// that teleported you out, so an ordinary mistake became a respawn. A car that
// can back up needs none of that.
//
// It engages only after you have held the brake at a standstill for a moment,
// which is both what selecting a gear feels like and what stops the harness --
// whose braking policy holds throttle at -1 through every corner -- from
// quietly driving the lap backwards.
const V_REV = 78, REV_ACCEL = 96, REV_ENGAGE = 0.35;

// ------------------------------------------------------- DRIFT INTO BOOST
//
// The drift was a rescue: three times the yaw for two thirds of your speed, for
// when you got a corner wrong. Useful, and nobody would ever choose it. Banking
// a boost turns it into a decision you take on purpose -- you PAY speed through
// the corner to be given it back on the exit, and holding the slide one tier
// longer is a bet about whether you can still make the apex.
//
// Three tiers, because two is a switch and four is bookkeeping. The charge only
// builds while the car is genuinely sideways, so you cannot farm it by tapping
// the button down a straight.
const TIERS = [0.85, 1.75, 2.7];              // seconds of real slide per tier
const BOOST_TIME = [0.75, 1.25, 1.9];         // seconds of push it buys
const BOOST_PUSH = 460;                       // v/s^2 while it lasts
const BOOST_CAP = [1.10, 1.16, 1.24];         // how far over V_MAX it will pull

// Headlights do not care how fast you are going — that was the dynamo, and it
// went with the bike. What survives is the structural half of that idea: the
// town's lighting IS the level design, so an unlit stretch is one where the
// beam is all you have.
// 280 voxels is 22m: dipped beams on an eighties hatchback. It was 420, and
// 420 was the whole reason the dark did nothing — at 1.5s of warning, 420
// voxels covers 280 voxels/second, which IS the top speed, so seeing further
// than your headlights never bought you anything. The number is the mechanic.
const BEAM_REACH = 280;

export const BODIES = [
  { body: 'carBody', roof: 'carBody', trim: 'carTrim', name: 'red', swatch: '#8d2b26' },
  { body: 'doorBlue', roof: 'doorBlue', trim: 'chrome', name: 'blue', swatch: '#33507e' },
  { body: 'sidingF', roof: 'sidingFdark', trim: 'carTrim', name: 'sage', swatch: '#5d6f5a' },
  { body: 'shirtCream', roof: 'sidingBdark', trim: 'chrome', name: 'cream', swatch: '#cbbfa4' },
  { body: 'doorYellow', roof: 'metalDark', trim: 'metalDark', name: 'ochre', swatch: '#b9862f' },
  { body: 'doorGreen', roof: 'doorGreen', trim: 'chrome', name: 'racing', swatch: '#2f6440' },
  { body: 'metalDark', roof: 'metalDark', trim: 'rust', name: 'primer', swatch: '#2b2f36' },
  { body: 'plasticRed', roof: 'shirtCream', trim: 'chrome', name: 'rally', swatch: '#b0403a' },
];

// A 1986 three-door, facing +Z. Wedge nose, upright glass, black bumpers.
function shell(w, c, parts) {
  const L = 58, W = 26, sill = 5, hw = W >> 1;
  // What you have bought, on the outside of the car. Every part shows, because
  // an upgrade you cannot see is a number in a menu — and the lamps in
  // particular ARE the mechanic, so they had better be the thing you notice.
  const lv = (id) => (parts && parts[id]) || 0;

  // main body, tapering slightly toward the nose
  for (let k = 0; k < L; k++) {
    const t = k / (L - 1);
    const pinch = t > 0.72 ? 1 : 0;
    w.box(-hw + pinch, sill, k, W - pinch * 2, 10, 1, c.body);
  }
  w.box(-hw, sill - 2, 6, W, 2, L - 14, c.body);          // sills
  w.box(-hw + 1, sill + 10, 4, W - 2, 1, L - 10, c.body);

  // greenhouse: inset, with a raked screen and a hatchback rear
  const cz = 12, cL = 30;
  w.box(-hw + 3, sill + 11, cz, W - 6, 11, cL, 'carGlass');
  w.box(-hw + 3, sill + 11, cz, 1, 11, cL, c.body);        // pillars
  w.box(hw - 4, sill + 11, cz, 1, 11, cL, c.body);
  w.box(-hw + 3, sill + 11, cz + 15, W - 6, 11, 1, c.body); // B-pillar
  w.box(-hw + 2, sill + 22, cz + 1, W - 4, 2, cL - 2, c.roof);
  for (let k = 0; k < 6; k++)                               // raked screen
    w.box(-hw + 3, sill + 21 - k, cz + cL + k, W - 6, 1, 1, 'carGlass');
  for (let k = 0; k < 5; k++)                               // hatch
    w.box(-hw + 3, sill + 21 - k, cz - 1 - k, W - 6, 1, 1, 'carGlass');

  // bonnet and tail
  w.box(-hw + 2, sill + 9, L - 14, W - 4, 2, 12, c.body);
  w.box(-hw + 2, sill + 9, 2, W - 4, 2, 10, c.body);
  w.box(-hw - 1, sill + 1, L - 2, W + 2, 5, 2, 'metalDark');   // bumpers
  w.box(-hw - 1, sill + 1, -1, W + 2, 5, 2, 'metalDark');
  w.box(-hw + 2, sill + 6, L - 1, W - 4, 2, 1, c.trim);        // grille
  for (let i = 0; i < W - 6; i += 3) w.set(-hw + 3 + i, sill + 6, L, 'metalDark');

  // lights
  w.box(-hw + 2, sill + 7, L, 6, 4, 1, 'headLight');
  w.box(hw - 8, sill + 7, L, 6, 4, 1, 'headLight');
  w.box(-hw + 9, sill + 6, -1, W - 18, 3, 1, 'paper');         // plate

  // mirrors — small, but they are most of what says "car" in silhouette
  w.box(-hw - 2, sill + 15, cz + cL - 3, 2, 3, 3, c.body);
  w.box(hw, sill + 15, cz + cL - 3, 2, 3, 3, c.body);

  // wheels, sunk into arches — fatter with better tyres
  const tyre = lv('tyres');
  const tw = 3 + (tyre > 0 ? 1 : 0) + (tyre > 1 ? 1 : 0);
  for (const wz of [11, L - 19]) for (const wx of [-hw - 1, hw - 2]) {
    const ox = wx < 0 ? -(tw - 3) : 0;
    for (let k = -7; k <= 7; k++) for (let j = -7; j <= 7; j++) {
      const d = Math.hypot(k, j);
      if (d > 7) continue;
      for (let i = 0; i < tw; i++)
        w.set(wx + ox + i, 6 + j, wz + k, d < 3.2 ? 'chrome' : 'rubber');
    }
    w.cut(wx + ox - 1, 14, wz - 8, tw + 2, 6, 17);
    if (tyre > 1) {                                   // arch flares
      for (let k = -9; k <= 9; k++)
        w.box(wx + ox - 1, 13 - Math.round(Math.abs(k) * 0.3), wz + k, tw + 2, 1, 1, c.roof);
    }
  }

  // ------------------------------------------------- what the money bought
  const eng = lv('engine');
  if (eng > 0) {                                      // bonnet scoop
    w.box(-5, sill + 11, L - 12, 10, 3, 9, c.roof);
    w.box(-4, sill + 12, L - 4, 8, 2, 1, 'metalDark');
  }
  if (eng > 1) {                                      // twin pipes
    for (const px of [-8, 4]) {
      w.box(px, sill, -3, 4, 3, 3, 'chrome');
      w.box(px + 1, sill + 1, -4, 2, 1, 1, 'metalDark');
    }
  }
  if (eng > 2) w.box(-hw + 3, sill + 22, cz - 2, W - 6, 2, 4, c.roof);   // ducktail

  const brk = lv('brakes');
  if (brk > 0) {                                      // front splitter
    w.box(-hw - 2, sill, L - 1, W + 4, 2, 3, 'metalDark');
    w.box(-hw - 3, sill, L - 4, 2, 2, 5, 'metalDark');
    w.box(hw + 1, sill, L - 4, 2, 2, 5, 'metalDark');
  }
  if (brk > 1) {                                      // cooling ducts
    w.box(-hw + 3, sill + 3, L, 5, 3, 1, 'glassDark');
    w.box(hw - 7, sill + 3, L, 5, 3, 1, 'glassDark');
  }

  // LAMPS. The one upgrade the level design is built around, so it is the one
  // you can see from behind at a glance: a pair on the bumper, then four, then
  // a bar across the roof.
  const lamps = lv('lamps');
  if (lamps > 0) for (const px of [-9, 5]) {
    w.box(px, sill + 3, L, 4, 4, 2, 'metalDark');
    w.box(px + 1, sill + 4, L + 1, 2, 2, 1, 'headLight');
  }
  if (lamps > 1) for (const px of [-hw + 1, hw - 5]) {
    w.box(px, sill + 3, L, 4, 4, 2, 'metalDark');
    w.box(px + 1, sill + 4, L + 1, 2, 2, 1, 'headLight');
  }
  if (lamps > 2) {
    w.box(-hw + 2, sill + 24, cz + cL - 2, W - 4, 2, 4, 'metalDark');
    for (let i = 0; i < 4; i++)
      w.box(-hw + 4 + i * 5, sill + 26, cz + cL - 1, 3, 3, 2, 'headLight');
  }
  return { L, W };
}

// `tune` is a set of MULTIPLIERS on the handling constants, all defaulting to
// one. Upgrades are the only thing that sets them, which keeps the shop honest:
// a part you buy has to move one of these numbers or it is not doing anything,
// and the rival runs the same builder with no tune at all so a bought advantage
// is a real advantage rather than a difficulty slider.
// The tail lamps live in their OWN world so they can be their own mesh and
// their own material. Baked into the body they were a constant glow, which
// meant the rival looked identical whether it was flat out or standing on the
// brakes — and watching where the car ahead lifts is how anybody has ever
// learned a circuit. Now it teaches you something.
function lamps(w, c) {
  const L = 58, W = 26, sill = 5, hw = W >> 1;
  w.box(-hw + 2, sill + 6, -1, 6, 4, 1, 'tailLight');
  w.box(hw - 8, sill + 6, -1, 6, 4, 1, 'tailLight');
  return { L };
}
function reverseLamps(w) {
  const W = 26, sill = 5, hw = W >> 1;
  w.box(-hw + 9, sill + 7, -2, 3, 2, 1, 'headLight');
  w.box(hw - 12, sill + 7, -2, 3, 2, 1, 'headLight');
}

export function buildCar(paint = 0, tune = {}, parts = null) {
  const T = {
    vmax: tune.vmax || 1, accel: tune.accel || 1, brake: tune.brake || 1,
    grip: tune.grip || 1, beam: tune.beam || 1,
  };
  const VMAX = V_MAX * T.vmax;
  const ACC = ACCEL * T.accel;
  const BRK = BRAKE * T.brake;
  const T_SLOW = TURN_SLOW * T.grip, T_FAST = TURN_FAST * T.grip;
  let BEAM = BEAM_REACH * T.beam;
  let wet = 0;
  const c = BODIES[paint % BODIES.length];
  const w = new VoxWorld();
  const { L, W } = shell(w, c, parts);

  // A CONTACT SHADOW.
  //
  // The car's ride height is now exact to the voxel and it STILL read as
  // floating, because nothing was grounding it: the only shadow-casting light
  // is a moon at night, which throws almost nothing, so the car sat on the road
  // with clean air between it and its own darkness. A soft dark patch under a
  // vehicle is what the eye actually uses to decide something is resting on a
  // surface — this is doing more work than the ride height ever did.
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    rad.addColorStop(0, 'rgba(0,0,0,0.72)');
    rad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;      // unflagged canvas textures render washed
    return t;
  })();

  const root = new THREE.Group();
  root.name = 'car';
  const chassis = new THREE.Group();          // takes the body roll
  const mesh = meshWorld(w, PALETTE, { name: 'car', solidBelow: -1 });
  mesh.position.set(0, 0, -L / 2);            // pivot about the middle
  chassis.add(mesh);

  const lw = new VoxWorld(); lamps(lw, c);
  const brakeMesh = meshWorld(lw, PALETTE, { name: 'brake', solidBelow: -999 });
  brakeMesh.position.set(0, 0, -L / 2);
  chassis.add(brakeMesh);
  const brakeMats = [];
  brakeMesh.traverse(o => { if (o.isMesh && o.material) brakeMats.push(o.material); });

  // Sparks off the back wheels, coloured by tier. It is the only way to know
  // what you have banked without looking at the HUD, and the colour change is
  // the moment you decide whether to hold the slide.
  const sparkW = new VoxWorld();
  for (const sx of [-9, 5]) sparkW.box(sx, 2, -2, 4, 3, 3, 'headLight');
  const sparkMesh = meshWorld(sparkW, PALETTE, { name: 'spark', solidBelow: -999 });
  sparkMesh.position.set(0, 0, -L / 2);
  sparkMesh.visible = false;
  chassis.add(sparkMesh);
  const sparkMats = [];
  sparkMesh.traverse(o => { if (o.isMesh && o.material) sparkMats.push(o.material); });
  const TIER_COL = [null, [0.35, 0.62, 1.0], [1.0, 0.55, 0.15], [0.85, 0.35, 1.0]];

  const rw = new VoxWorld(); reverseLamps(rw);
  const revMesh = meshWorld(rw, PALETTE, { name: 'reverse', solidBelow: -999 });
  revMesh.position.set(0, 0, -L / 2);
  revMesh.visible = false;
  chassis.add(revMesh);
  root.add(chassis);
  mesh.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) o.castShadow = true; });

  // Slightly longer and wider than the car, so it reads as spread light rather
  // than as a decal cut to the silhouette. Under the BODY, not the group, so it
  // does not roll with the chassis.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 2.1, L * 1.5),
    new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, opacity: 0.85, depthWrite: false,
      toneMapped: false, fog: true,
    }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  root.add(shadow);

  // one shadowless spot for the beam, plus a pool light so the road right in
  // front of the car is never black
  const beam = new THREE.SpotLight(0xfff4d6, 240000 * (0.75 + T.beam * 0.25), BEAM, 0.42, 0.55, 1.5);
  beam.position.set(0, 11, L / 2 - 2);
  const tgt = new THREE.Object3D();
  tgt.position.set(0, -10, BEAM * 0.8);
  root.add(beam, tgt);
  beam.target = tgt;

  const state = {
    x: 0, z: 0, heading: 0, speed: 0, turnRate: 0,
    crash: 0, spin: 0, dist: 0, roll: 0, stuck: 0, slip: 0,
    // Ground height under the car, and the smoothed version the body sits at.
    // The car used to be nailed to y = 0, which was invisible while the world
    // was flat and would have left it four metres under the chapel.
    y: 0, yView: 0, shake: 0, wedged: false, offRoad: false, rev: 0,
    charge: 0, tier: 0, boost: 0, boostTier: 0,
    braking: false, lampGlow: 0.34,
  };

  function step(dt, throttle, steer, ground, drift = false, allowReverse = true) {
    // An impact is a moment, not a cutscene. The old version took the controls
    // away for a second and a half and span the car on its axis, which is where
    // the "weird dance" came from -- no racing game does that, and it turned
    // clipping a kerb into a punishment you could only sit through.
    if (state.crash > 0) state.crash = Math.max(0, state.crash - dt);

    const off = state.offRoad;
    const spd = state.speed;
    // Hoisted: the charge below needs to know whether the car is sideways,
    // and it only depends on the handbrake and the speed we came in with.
    const sliding = drift && spd > 55;
    state.braking = throttle < 0 && spd > 1;
    // hold the brake at a standstill and the car selects reverse
    if (throttle < 0 && spd <= 0.5) state.rev += dt;
    else if (throttle >= 0) state.rev = 0;
    // The harness brakes by holding throttle at -1 through every corner, so
    // without this it selects reverse the moment anything stops it and drives
    // the rest of the lap backwards. A racing driver does not use reverse.
    const canRev = allowReverse && state.rev > REV_ENGAGE;

    // charge builds only while actually sideways, and cashes in on release
    if (sliding && Math.abs(state.slip) > 0.14) {
      state.charge += dt * (0.55 + 0.45 * Math.abs(state.slip) / MAX_SLIP);
      state.tier = state.charge >= TIERS[2] ? 3 : state.charge >= TIERS[1] ? 2 : state.charge >= TIERS[0] ? 1 : 0;
    } else if (state.charge > 0) {
      if (state.tier > 0) {
        state.boost = BOOST_TIME[state.tier - 1];
        state.boostTier = state.tier;
      }
      state.charge = 0; state.tier = 0;
    }
    if (state.boost > 0) state.boost = Math.max(0, state.boost - dt);

    const bleed = (v, amount) => Math.sign(v) * Math.max(0, Math.abs(v) - amount);
    if (throttle > 0) {
      if (spd < 0) state.speed = Math.min(0, spd + BRK * dt);       // brake out of reverse
      else state.speed = spd + ACC * throttle * dt * (off ? OFF_ACCEL : 1);
    } else if (throttle < 0) {
      if (spd > 0.5) state.speed = spd + BRK * (1 - wet * (1 - WET_BRAKE)) * throttle * dt;
      else if (canRev) state.speed = Math.max(-V_REV, spd - REV_ACCEL * dt);
    } else {
      state.speed = bleed(spd, DRAG * dt);
    }
    if (off) state.speed = bleed(state.speed, OFF_DRAG * dt);
    // The boost pushes, and lifts the ceiling while it lasts. Once it expires
    // the cap drops back and drag walks you down to it, so the speed you were
    // given is spent rather than kept.
    if (state.boost > 0 && state.speed > 0) state.speed += BOOST_PUSH * dt;
    const cap = state.boost > 0 ? VMAX * BOOST_CAP[state.boostTier - 1] : VMAX;
    state.speed = Math.max(canRev ? -V_REV : 0, Math.min(cap, state.speed));

    const f = Math.abs(state.speed) / VMAX;
    // Steering is referred to the direction of TRAVEL: turn the wheel one way
    // going backwards and the car rotates the other, because it is the back of
    // it that is leading.
    const way = state.speed < 0 ? -1 : 1;
    // A car cannot pivot on the spot, but it must keep SOME authority at a
    // crawl or a nudge into a kerb is permanent — the bike taught me that.
    state.turnRate = steer * (T_SLOW + (T_FAST - T_SLOW) * f)
      * (0.22 + 0.78 * Math.min(1, Math.abs(state.speed) / 30)) * way
      * (1 - wet * (1 - WET_GRIP))
      * (sliding ? DRIFT_TURN : 1) * (state.offRoad ? OFF_TURN : 1);
    state.heading += state.turnRate * dt;

    // The slip angle: how far the nose leads the direction of travel. It builds
    // while the handbrake is in and washes off when it is not, so letting go is
    // a recovery you can feel rather than a switch.
    const wantSlip = sliding ? steer * MAX_SLIP * Math.min(1, Math.abs(state.speed) / 130) : 0;
    state.slip += (wantSlip - state.slip) * Math.min(1, dt * (sliding ? SLIP_ON : SLIP_OFF));
    if (Math.abs(state.slip) > 0.02) {
      state.speed = Math.max(0, state.speed - DRIFT_SCRUB * (Math.abs(state.slip) / MAX_SLIP) * dt);
    }

    // Travel lags the nose by the slip angle. THIS is the whole drift.
    const travel = state.heading - state.slip;
    const dx = Math.sin(travel) * state.speed * dt;
    const dz = Math.cos(travel) * state.speed * dt;
    if (ground) {
      const bx = state.x, bz = state.z;
      const p = { x: state.x, y: 0, z: state.z };
      ground.move(p, dx, dz, null, CAR_PROBE, CAR_STEP);
      state.x = p.x; state.z = p.z;
      // Sampled at the CENTRE, not across the whole footprint. ceilingAt takes
      // the highest floor under the probe ring, so with the car-sized ring a
      // single cone or kerb under one corner lifted the entire car onto it.
      const fl = ground.ceilingAt(state.x, state.z, 1);
      if (fl > -900) {
        // Riding up over something costs SPEED, in proportion to how big the
        // thing was. A kerb is nothing, a skip is most of your momentum, and
        // either way you are still moving — which is the whole point.
        const rise = fl - (state.y - RIDE);
        if (rise > 2 && Math.abs(state.speed) > 25) {
          state.speed *= Math.max(0.25, 1 - rise * CLIMB_COST);
          state.shake = Math.min(1, rise / 18);
          state.crash = Math.max(state.crash, 0.18);
        }
        state.y = fl + RIDE;
      }
      // How much of the motion the world refused. A glancing scrape along a
      // kerb costs you a little; driving square into a wall stops you. Squaring
      // it makes the difference between those two big, which is what a racing
      // game's walls feel like.
      const moved = Math.hypot(p.x - bx, p.z - bz), wanted = Math.hypot(dx, dz);
      if (wanted > 0.01) {
        const refused = 1 - moved / wanted;
        if (refused > 0.06) impact(refused * refused, refused > 0.5);
      }
    } else { state.x += dx; state.z += dz; }
    state.dist += Math.hypot(dx, dz);

    // Wedged. There is no reverse, so a car nosed into a skip at walking pace
    // is there for good: you need speed to steer and you cannot get speed
    // against a wall. Rather than add a reverse gear for this one case, being
    // stuck IS a crash — the recovery path already knows how to undo one, and
    // a player who beaches the car wants the same answer the harness does.
    // THE GUARANTEE: you can never be permanently stuck.
    //
    // This counts any input at all, forwards or back. If you are asking the car
    // to move in some direction and it has not moved for two and a half
    // seconds, then both ways out are blocked and no amount of patience will
    // help — so you get put back on the road. Holding nothing does not count,
    // because sitting still on purpose is allowed.
    if (throttle !== 0 && Math.abs(state.speed) < 6) {
      state.stuck += dt;
      if (state.stuck > 2.5) { state.stuck = 0; state.wedged = true; }
    } else state.stuck = 0;
    return state;
  }

  // Hitting something. `sev` is 0..1: 0 is a brush, 1 is square-on. Speed is
  // the entire penalty -- the car stays upright, pointing where it was, and
  // under your control the whole time.
  function impact(sev, hard) {
    sev = Math.max(0, Math.min(1, sev));
    state.speed *= 1 - 0.94 * sev;
    if (state.crash > 0) return false;         // one count per contact
    state.shake = sev;
    state.crash = 0.3;                         // a flag and a jolt, nothing more
    return hard === undefined ? sev > 0.35 : hard;
  }
  const crash = () => impact(1, true);

  function respawn(x, z, heading, y) {
    state.x = x; state.z = z; state.heading = heading;
    if (y !== undefined) { state.y = y; state.yView = y; }
    state.speed = 0; state.turnRate = 0; state.roll = 0; state.stuck = 0; state.slip = 0;
    state.crash = 0; state.wedged = false; state.rev = 0; state.offRoad = false;
    state.charge = 0; state.tier = 0; state.boost = 0;
    root.rotation.z = 0; chassis.rotation.z = 0;
  }

  function present(dt) {
    // Follow the ground, but SMOOTHED. The profile is a staircase of 8cm risers
    // and taking it literally makes the car tremble at speed; the suspension is
    // this lerp and nothing else.
    // Tail lamps sit at a third and flare to full on the brakes. The rest of
    // the car does not change, so the eye reads it as a light rather than as
    // the whole vehicle getting brighter.
    const wantGlow = state.braking ? 1 : (state.speed > 1 ? 0.34 : 0.34);
    state.lampGlow += (wantGlow - state.lampGlow) * Math.min(1, dt * 18);
    for (const m of brakeMats) m.color.setScalar(state.lampGlow);
    revMesh.visible = state.speed < -1;
    const show = state.tier > 0 ? state.tier : (state.boost > 0 ? state.boostTier : 0);
    sparkMesh.visible = show > 0;
    if (show > 0) {
      const c = TIER_COL[show];
      const flick = 0.7 + Math.random() * 0.5;
      for (const m of sparkMats) m.color.setRGB(c[0] * flick, c[1] * flick, c[2] * flick);
    }

    state.yView += (state.y - state.yView) * Math.min(1, dt * 9);
    root.position.set(state.x, state.yView, state.z);
    root.rotation.y = state.heading;
    // The shadow stays ON the ground and flat to the world while the car above
    // it pitches, rolls and jolts — that contrast is what sells the contact.
    shadow.position.y = 0.6 - (root.position.y - state.yView);
    // Body roll reads the corner for you before the tyres do — and leans HARD
    // into a slide, which is most of what sells the drift from behind.
    const want = THREE.MathUtils.clamp(
      -state.turnRate * (state.speed / VMAX) * 0.5 - state.slip * 0.34, -0.30, 0.30);
    state.roll += (want - state.roll) * Math.min(1, dt * 6);
    chassis.rotation.z = state.roll;
    // A short jolt through the body, and that is the whole crash animation.
    if (state.crash > 0) {
      const k = state.crash / 0.3;
      root.position.y = state.yView + Math.sin(state.crash * 90) * state.shake * 2.2 * k;
      chassis.rotation.x = Math.sin(state.crash * 70) * state.shake * 0.1 * k;
    } else chassis.rotation.x = 0;
    root.rotation.z += (0 - root.rotation.z) * Math.min(1, dt * 6);
  }

  return {
    root, state, step, crash, impact, respawn, present, beam, length: L, width: W, vmax: VMAX,
    sightRange: () => BEAM * (1 - wet * (1 - WET_BEAM)),
    // How wet the road is, 0 to 1. Set by whoever owns the weather.
    setWet(v) {
      wet = Math.max(0, Math.min(1, v));
      beam.distance = BEAM * (1 - wet * (1 - WET_BEAM));
      return wet;
    },
  };
}

// How long you must have SEEN something before you can be off the line by the
// time you reach it: spotting it, deciding, and moving a car a lane sideways.
export const WARNING = 1.5;
