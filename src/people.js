// The people.
//
// Built the way the reference builds them: rigid voxel chunks on a joint
// hierarchy, no skinning and no deformation. A limb rotates as a solid block,
// which is what gives the animation its puppet/stop-motion read — smooth
// vertex blending would look wrong here even if it were cheaper.
//
// Everything is the same voxel size as the houses. A kid is 20 voxels tall
// (~1.6m), an adult 23 (~1.85m). Heads are deliberately oversized.
import * as THREE from 'three';
import { VoxWorld, meshWorld } from './voxel.js';
import { PALETTE } from './palette.js';

// A body part: its own tiny voxel world, meshed and parented at its joint.
function part(build) {
  const w = new VoxWorld();
  build(w);
  const g = meshWorld(w, PALETTE, { name: 'part' });
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ------------------------------------------------------------------ bodies
function makeHead(s) {
  const d = s.kid ? 7 : 6;
  return part(w => {
    w.box(-(d >> 1), 0, -(d >> 1), d, d, d, s.skin);
    // hair: a cap over the crown and down the back
    w.box(-(d >> 1), d - 2, -(d >> 1), d, 2, d, s.hair);
    w.box(-(d >> 1), d - 5, -(d >> 1), d, 3, 1, s.hair);
    if (s.hairStyle === 'fringe') w.box(-(d >> 1), d - 3, (d >> 1), d, 1, 1, s.hair);
    if (s.hairStyle === 'bald') { w.box(-(d >> 1), d - 2, -(d >> 1), d, 2, d, s.skin); w.box(-(d >> 1), d - 4, -(d >> 1), d, 3, 1, s.hair); }
    if (s.cap) { w.box(-(d >> 1) - 1, d - 2, -(d >> 1) - 1, d + 2, 2, d + 1, s.cap); w.box(-2, d - 3, (d >> 1), 4, 1, 2, s.cap); }
    // eyes, one voxel each, on the +Z face
    const ey = Math.round(d * 0.45);
    w.set(-2, ey, (d >> 1), 'hairDark');
    w.set(2, ey, (d >> 1), 'hairDark');
    if (s.glasses) {
      w.box(-3, ey, (d >> 1), 7, 1, 1, 'chrome');
      w.set(-3, ey + 1, (d >> 1), 'chrome'); w.set(3, ey + 1, (d >> 1), 'chrome');
      w.set(-2, ey, (d >> 1), 'hairDark'); w.set(2, ey, (d >> 1), 'hairDark');
    }
  });
}

function makeTorso(s) {
  const wid = s.kid ? 8 : 9, hgt = s.kid ? 7 : 9, dep = 5;
  return part(w => {
    w.box(-(wid >> 1), 0, -(dep >> 1), wid, hgt, dep, s.shirt);
    // a collar and a hem, so it is not one flat slab of colour
    w.box(-(wid >> 1), hgt - 1, -(dep >> 1), wid, 1, dep, s.collar || s.shirt);
    w.box(-(wid >> 1), 0, -(dep >> 1), wid, 1, dep, s.trouser);
    if (s.jacket) {
      w.box(-(wid >> 1) - 1, 1, -(dep >> 1) - 1, 1, hgt - 2, dep + 2, s.jacket);
      w.box((wid >> 1), 1, -(dep >> 1) - 1, 1, hgt - 2, dep + 2, s.jacket);
      w.box(-(wid >> 1) - 1, 1, -(dep >> 1) - 1, wid + 2, hgt - 2, 1, s.jacket);
    }
  });
}

function makeLeg(s) {
  const h = s.kid ? 6 : 8;
  return part(w => {
    w.box(-1, -h, -1, 3, h, 3, s.trouser);
    w.box(-1, -h, -1, 3, 1, 4, s.shoe || 'shoe');
  });
}

function makeArm(s, side) {
  const h = s.kid ? 7 : 9;
  return part(w => {
    w.box(-1, -h, -1, 2, h, 3, s.shirt);
    w.box(-1, -h, -1, 2, 2, 3, s.skin);          // the hand
    if (s.torch && side > 0) {                    // a flashlight in the right hand
      w.box(-1, -h - 4, 0, 2, 4, 2, 'torchBody');
      w.box(-1, -h - 5, 0, 2, 1, 2, 'torchLens');
    }
    if (s.smoke && side < 0) w.set(0, -h - 1, 2, 'cigarette');
  });
}

// ------------------------------------------------------------------ person
export function buildPerson(spec) {
  const s = {
    kid: false, skin: 'skinMid', hair: 'hairBrown', shirt: 'shirtBlue',
    trouser: 'jeans', pose: 'idle', ...spec,
  };
  const legH = s.kid ? 6 : 8, torsoH = s.kid ? 7 : 9;

  const root = new THREE.Group();
  root.name = 'person:' + s.name;
  root.position.set(s.pos[0], s.pos[1], s.pos[2]);
  root.rotation.y = s.face || 0;

  const body = new THREE.Group();          // whole-body bob
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = legH;
  body.add(hips);

  const legL = makeLeg(s), legR = makeLeg(s);
  legL.position.x = -2; legR.position.x = 2;
  hips.add(legL, legR);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(makeTorso(s));

  const shoulderY = torsoH - 1;
  const armL = makeArm(s, -1), armR = makeArm(s, 1);
  const ax = s.kid ? 5 : 5.5;
  armL.position.set(-ax, shoulderY, 0);
  armR.position.set(ax, shoulderY, 0);
  torso.add(armL, armR);

  const head = new THREE.Group();
  head.position.y = torsoH;
  head.add(makeHead(s));
  torso.add(head);

  // Picking against a dozen small meshes per person is both slow and fiddly;
  // one invisible box per person is exact enough and never misses a limb.
  const hh = legH + torsoH + (s.kid ? 7 : 6);
  const pick = new THREE.Mesh(
    new THREE.BoxGeometry(12, hh, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = hh / 2;
  pick.userData.person = s;
  root.add(pick);

  const lights = [];
  if (s.torch) {
    // the flashlight actually lights the ground in front of them
    const beam = new THREE.SpotLight(0xfff0c4, 26000, 150, 0.42, 0.7, 2);
    beam.position.set(ax, legH + shoulderY - (s.kid ? 12 : 14), 2);
    const tgt = new THREE.Object3D();
    tgt.position.set(ax + (s.torchAim ? s.torchAim[0] : 0), -6, 46);
    root.add(tgt);
    beam.target = tgt;
    root.add(beam);
    lights.push(beam);
  }
  if (s.radio) {
    const glow = new THREE.PointLight(0xff9a5c, 900, 34, 2);
    glow.position.set(-8, legH + 4, 6);
    root.add(glow);
    lights.push(glow);
  }

  // ---------------------------------------------------------------- motion
  const seed = (s.name.charCodeAt(0) * 37 + s.name.length * 11) % 100 / 100;
  const path = s.path;                       // [[x,z],[x,z]] to pace between
  let travel = seed, dir = 1;

  function update(t) {
    const k = t + seed * 20;

    if (s.pose === 'sit') {
      hips.position.y = legH * 0.55;
      legL.rotation.x = legR.rotation.x = -1.35;
      torso.rotation.x = 0.12;
      body.position.y = Math.sin(k * 1.1) * 0.12;
      armL.rotation.x = -0.5 + Math.sin(k * 0.7) * 0.05;
      armR.rotation.x = -0.5 - Math.sin(k * 0.6) * 0.05;
    } else if (path) {
      // a slow pace between two points, turning at each end
      travel += dir * 0.055 * (s.speed || 1) * 0.016;
      if (travel > 1) { travel = 1; dir = -1; }
      if (travel < 0) { travel = 0; dir = 1; }
      const [a, b] = path;
      const px = a[0] + (b[0] - a[0]) * travel;
      const pz = a[1] + (b[1] - a[1]) * travel;
      root.position.x = px; root.position.z = pz;
      root.rotation.y = Math.atan2((b[0] - a[0]) * dir, (b[1] - a[1]) * dir);
      const step = k * 3.4;
      legL.rotation.x = Math.sin(step) * 0.62;
      legR.rotation.x = -Math.sin(step) * 0.62;
      armL.rotation.x = -Math.sin(step) * 0.48;
      armR.rotation.x = Math.sin(step) * 0.48;
      body.position.y = Math.abs(Math.sin(step)) * 0.5;
      torso.rotation.y = Math.sin(step) * 0.06;
    } else {
      // idle: breathe, shift weight, and look around now and then
      body.position.y = Math.sin(k * 1.3) * 0.22;
      torso.rotation.z = Math.sin(k * 0.6) * 0.02;
      armL.rotation.x = Math.sin(k * 0.9) * 0.09 - (s.armsFolded ? 1.2 : 0);
      armR.rotation.x = -Math.sin(k * 0.8) * 0.09 - (s.armsFolded ? 1.2 : 0) - (s.torch ? 0.55 : 0);
      if (s.armsFolded) { armL.rotation.z = 0.5; armR.rotation.z = -0.5; }
      const glance = Math.sin(k * 0.31) * Math.sin(k * 0.17);
      head.rotation.y = glance * 0.7;
      head.rotation.x = Math.sin(k * 0.23) * 0.12;
    }
  }

  update(0);
  return { root, pick, update, lights, data: s };
}

// ------------------------------------------------------------------- dog
export function buildDog(spec) {
  const s = { fur: 'dogFur', dark: 'dogFurDark', ...spec };
  const root = new THREE.Group();
  root.name = 'dog';
  root.position.set(s.pos[0], s.pos[1], s.pos[2]);

  const body = new THREE.Group();
  root.add(body);
  body.add(part(w => {
    w.box(-2, 4, -5, 5, 5, 11, s.fur);              // barrel
    w.box(-2, 8, 3, 5, 3, 4, s.fur);                // neck
    w.box(-2, 8, 6, 5, 5, 5, s.fur);                // head
    w.box(-2, 12, 6, 1, 2, 2, s.dark);              // ears
    w.box(2, 12, 6, 1, 2, 2, s.dark);
    w.box(-1, 8, 10, 3, 2, 2, s.dark);              // muzzle
    w.set(-1, 11, 10, 'hairDark'); w.set(1, 11, 10, 'hairDark');
    w.box(-1, 8, -7, 3, 4, 3, s.fur);               // tail
  }));
  const legs = [];
  for (const [lx, lz] of [[-2, 3], [2, 3], [-2, -4], [2, -4]]) {
    const g = new THREE.Group();
    g.position.set(lx, 4, lz);
    g.add(part(w => w.box(-1, -4, -1, 2, 4, 2, s.dark)));
    body.add(g);
    legs.push(g);
  }

  const seed = 0.31;
  const path = s.path;
  let travel = seed, dir = 1;
  function update(t) {
    const k = t + seed * 20;
    if (path) {
      travel += dir * 0.055 * (s.speed || 1) * 0.016;
      if (travel > 1) { travel = 1; dir = -1; }
      if (travel < 0) { travel = 0; dir = 1; }
      const [a, b] = path;
      root.position.x = a[0] + (b[0] - a[0]) * travel;
      root.position.z = a[1] + (b[1] - a[1]) * travel;
      root.rotation.y = Math.atan2((b[0] - a[0]) * dir, (b[1] - a[1]) * dir);
      const step = k * 5.2;
      legs[0].rotation.x = Math.sin(step) * 0.6;
      legs[1].rotation.x = -Math.sin(step) * 0.6;
      legs[2].rotation.x = -Math.sin(step) * 0.6;
      legs[3].rotation.x = Math.sin(step) * 0.6;
      body.position.y = Math.abs(Math.sin(step)) * 0.35;
    }
    body.rotation.y = Math.sin(k * 1.7) * 0.05;
  }
  update(0);
  return { root, update, data: s };
}

// ------------------------------------------------------------------- cast
// Written for the world rather than for a plot: it is a quiet street at night
// and everyone has a small, mundane reason to still be outside.
export const CAST = [
  {
    name: 'Row',
    role: 'the kid with the flashlight',
    kid: true, skin: 'skinLight', hair: 'hairGinger', hairStyle: 'fringe',
    shirt: 'shirtRed', trouser: 'jeans', torch: true, torchAim: [-8, 0],
    pos: [-38, 2, 22], face: -2.2,
    lines: [
      'My bike’s in the yard. I’m not going home yet.',
      'You hear that? Under the streetlight it hums. It gets louder after eleven.',
      'Mum thinks I’m at Walt’s. Walt thinks I went home.',
      'If the lamp goes out, don’t stand where it was.',
    ],
  },
  {
    name: 'Walt',
    role: 'three doors down, still up',
    skin: 'skinLight', hair: 'hairGrey', hairStyle: 'bald', glasses: true,
    shirt: 'shirtPlaid', trouser: 'trouserTan', pose: 'sit', radio: true, smoke: true,
    pos: [-62, 6, -20], face: 0.5,
    lines: [
      'Ball game’s in the tenth. I’m not going in until it’s over.',
      'Forty-one years on this street. It was orchards. You wouldn’t know it.',
      'They resurfaced the road in ’81 and it’s been quieter ever since. Ask me why.',
    ],
  },
  {
    name: 'Mrs Okonjo',
    role: 'the porch, arms folded',
    skin: 'skinDeep', hair: 'hairDark', shirt: 'shirtGreen', trouser: 'trouserGrey',
    armsFolded: true, pos: [-72, 11, -12], face: 0.15,
    lines: [
      'Bins go out tonight. Nobody remembers but me.',
      'That boy has been up and down this street since supper.',
      'The television’s been on in there since Thursday. I don’t think anyone’s watching it.',
    ],
  },
  {
    name: 'Deb',
    role: 'walking Biscuit',
    skin: 'skinMid', hair: 'hairBrown', shirt: 'shirtCream', trouser: 'jeans',
    jacket: 'shirtBlue', pos: [40, 2, 34], face: 1.5,
    path: [[40, 34], [-190, 34]], speed: 1,
    lines: [
      'Last loop. She’ll pull all the way to the corner and then refuse to come back.',
      'Evening. Watch the kerb by the hydrant, it’s lifted.',
      'You’re not from the block, are you.',
    ],
  },
  {
    name: 'Sam',
    role: 'papers, tomorrow’s round',
    kid: true, skin: 'skinMid', hair: 'hairDark', cap: 'shirtBlue',
    shirt: 'shirtCream', trouser: 'jeans',
    pos: [62, 2, 26], face: 2.9,
    lines: [
      'Folding for the morning round. Ninety-one houses, and eleven of them tip.',
      'You want the late edition? It’s the same as the early one with a different front.',
    ],
  },
];
